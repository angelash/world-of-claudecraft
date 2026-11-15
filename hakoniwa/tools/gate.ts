// The full local gate (docs/60_production/dev_process.md section 4.1;
// docs/50_tech/release_engineering.md sections 10 and 11). It runs every step of the
// commit pipeline in order, never stops at a failing step, prints each step's result and
// time in one summary table, and exits non-zero exactly when a step failed. Steps run as
// child processes with their real exit codes; nothing is piped, so no exit code is lost.
//
//   npm run gate                     every step except the --full ones
//   npm run gate -- --full           also the no-model playthroughs (about ten minutes)
//   npm run gate -- --base <ref>     Biome checks the files changed since <ref>
//
// The base also comes from HK_GATE_BASE (the commit pipeline,
// .github/workflows/hakoniwa-ci.yml, sets it); the default is HEAD, the uncommitted edits.
// The step table is data in tools/gate/steps.ts; the runner core, the scan and the
// changed-file rules live beside it and are tested in tests/gate.test.ts.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { GateRun, InternalCheck } from './gate/steps';

type Steps = typeof import('./gate/steps');
type Run = typeof import('./gate/run');
type Exec = typeof import('./gate/exec');
type Forbidden = typeof import('./gate/forbidden_chars');
type Changed = typeof import('./gate/changed_files');
type StepOutcome = import('./gate/run').StepOutcome;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PRINTED_HITS = 50;

const USAGE = 'usage: npm run gate [-- --full] [-- --base <git ref>]';

// Node runs this file with type stripping, which needs explicit .ts specifiers; the
// typecheck refuses those in static imports, so the gate modules load by file URL and
// take their types from the type-only imports above.
async function load<T>(name: string): Promise<T> {
  return (await import(new URL(`./gate/${name}.ts`, import.meta.url).href)) as T;
}

async function main(): Promise<number> {
  const steps = await load<Steps>('steps');
  const run = await load<Run>('run');
  const exec = await load<Exec>('exec');
  const forbidden = await load<Forbidden>('forbidden_chars');
  const changed = await load<Changed>('changed_files');

  const parsed = run.parseGateArgs(process.argv.slice(2), process.env);
  if (!parsed.ok) {
    console.error(`gate: ${parsed.error}\n${USAGE}`);
    return 2;
  }
  const { options } = parsed;
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const forbiddenChars = (): StepOutcome => {
    const scan = forbidden.scanTree(ROOT, forbidden.FORBIDDEN_SCAN);
    for (const hit of scan.hits.slice(0, MAX_PRINTED_HITS)) console.error(forbidden.formatHit(hit));
    if (scan.hits.length > MAX_PRINTED_HITS) {
      console.error(`... and ${scan.hits.length - MAX_PRINTED_HITS} more`);
    }
    const absent = scan.missingDirs.length > 0 ? `, absent: ${scan.missingDirs.join(' ')}` : '';
    return {
      exitCode: scan.hits.length > 0 ? 1 : 0,
      note: `${scan.hits.length} hit(s) in ${scan.fileCount} file(s)${absent}`,
    };
  };

  const git = (args: readonly string[]) =>
    spawnSync('git', [...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const biomeChanged = (): StepOutcome => {
    const base = options.base;
    const verify = git(changed.gitVerifyArgs(base));
    if (verify.error) return { exitCode: 1, note: `git could not start: ${verify.error.message}` };
    if (verify.status !== 0) return { exitCode: 1, note: `base ref ${base} is not a commit here` };
    const listed: string[] = [];
    for (const args of changed.gitChangedArgs(base)) {
      const out = git(args);
      if (out.error || out.status !== 0) {
        if (out.stderr) process.stderr.write(out.stderr);
        return { exitCode: out.status ?? 1, note: `git ${args[0]} failed` };
      }
      listed.push(...changed.parseNameList(out.stdout));
    }
    const targets = changed.biomeTargets(listed).filter((p) => existsSync(join(ROOT, p)));
    if (targets.length === 0) return { exitCode: 0, note: `no changed files since ${base}` };
    let exitCode: number | null = 0;
    for (const part of changed.chunk(targets, changed.BIOME_CHUNK)) {
      const cmd = { command: process.execPath, args: changed.biomeArgs(part), shell: false };
      const outcome = exec.execCommand(cmd, { cwd: ROOT });
      if (outcome.exitCode !== 0 && exitCode === 0) exitCode = outcome.exitCode;
    }
    return { exitCode, note: `${targets.length} changed file(s) since ${base}` };
  };

  const internal: Record<InternalCheck, () => StepOutcome> = {
    forbidden_chars: forbiddenChars,
    biome_changed: biomeChanged,
  };
  const context = {
    platform: process.platform,
    nodePath: process.execPath,
    npmExecPath: process.env.npm_execpath,
  };
  const runOne = (gateRun: GateRun): StepOutcome =>
    gateRun.kind === 'internal'
      ? internal[gateRun.check]()
      : exec.execCommand(steps.resolveCommand(gateRun, context), { cwd: ROOT });

  const plan = steps.planGate(steps.GATE_STEPS, { full: options.full });
  const started = performance.now();
  const results = run.runPlan(
    plan,
    (step) => run.executeStep(step, { exists: (p) => existsSync(join(ROOT, p)), run: runOne }),
    () => performance.now(),
    {
      onStart: (step, index, total) =>
        console.log(`\n[gate ${index + 1}/${total}] ${step.id}: ${run.describeRun(step.run)}`),
      onEnd: (result, index, total) => {
        const detail = [
          result.exitCode === null ? '' : `exit ${result.exitCode}`,
          result.status === 'skip' ? '' : run.formatDuration(result.durationMs),
          result.note ?? '',
        ].filter(Boolean);
        const status = result.status.toUpperCase();
        console.log(`[gate ${index + 1}/${total}] ${result.id} ${status} (${detail.join(', ')})`);
      },
    },
  );
  console.log(
    `\nGate summary (hakoniwa)\n${run.renderSummary(results, performance.now() - started)}`,
  );
  return run.gateExitCode(results);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    },
  );
}
