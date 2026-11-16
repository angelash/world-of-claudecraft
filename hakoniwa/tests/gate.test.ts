// The full local gate (tools/gate.ts) and its commit pipeline
// (.github/workflows/hakoniwa-ci.yml): the step table, the runner that never stops at a
// failing step, the exit code that is non-zero exactly when a step failed (proven with
// constructed failing steps and with real child processes), the summary table, the
// forbidden-character scan, the changed-file Biome rules, and the pipeline's pins.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BIOME_BIN,
  BIOME_CHUNK,
  biomeArgs,
  biomeTargets,
  chunk,
  gitChangedArgs,
  gitVerifyArgs,
  parseNameList,
} from '../tools/gate/changed_files';
import { execCommand } from '../tools/gate/exec';
import {
  categoryOf,
  FORBIDDEN_SCAN,
  formatHit,
  isTextFile,
  listTextFiles,
  type ScanConfig,
  scanText,
  scanTree,
} from '../tools/gate/forbidden_chars';
import {
  executeStep,
  formatDuration,
  type GateOptions,
  gateExitCode,
  parseGateArgs,
  renderSummary,
  runPlan,
  type StepOutcome,
  type StepResult,
  statusOf,
} from '../tools/gate/run';
import {
  GATE_STEPS,
  type GateRun,
  type GateStep,
  planGate,
  resolveCommand,
} from '../tools/gate/steps';

const HAKONIWA = resolve(__dirname, '..');
const REPO_ROOT = resolve(HAKONIWA, '..');
const pkg = JSON.parse(readFileSync(join(HAKONIWA, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};
const ch = (codePoint: number) => String.fromCodePoint(codePoint);

/** A step that runs a constructed npm script; the fake executors key on the script. */
const fakeStep = (id: string, extra: Partial<GateStep> = {}): GateStep => ({
  id,
  title: `fake ${id}`,
  run: { kind: 'npm', script: id },
  ...extra,
});

const scriptOf = (run: GateRun) => (run.kind === 'npm' ? run.script : run.kind);

/** Runs a plan with a fake executor that returns the given exit code per step id. */
function runFake(steps: readonly GateStep[], codes: Record<string, number | null>, full = false) {
  const executed: string[] = [];
  let clock = 0;
  const results = runPlan(
    planGate(steps, { full }),
    (step) => {
      executed.push(step.id);
      clock += 5;
      return { exitCode: step.id in codes ? codes[step.id] : 0 };
    },
    () => clock,
  );
  return { results, executed, exit: gateExitCode(results) };
}

describe('gate step table', () => {
  it('runs the agreed steps in order, the playthroughs only with --full', () => {
    expect(GATE_STEPS.map((s) => s.id)).toEqual([
      'forbidden_chars',
      'biome_changed',
      'typecheck',
      'test',
      'prompts_check',
      'registry_check',
      'content_validate',
      'build',
      'build_release',
      'playthrough',
    ]);
    expect(new Set(GATE_STEPS.map((s) => s.id)).size).toBe(GATE_STEPS.length);
    expect(GATE_STEPS.filter((s) => s.fullOnly).map((s) => s.id)).toEqual(['playthrough']);
    const runs = Object.fromEntries(GATE_STEPS.map((s) => [s.id, s.run]));
    expect(runs.forbidden_chars).toEqual({ kind: 'internal', check: 'forbidden_chars' });
    expect(runs.biome_changed).toEqual({ kind: 'internal', check: 'biome_changed' });
    expect(runs.typecheck).toEqual({ kind: 'npm', script: 'typecheck' });
    expect(runs.test).toEqual({ kind: 'npm', script: 'test' });
    expect(runs.prompts_check).toEqual({ kind: 'npm', script: 'prompts:check' });
    expect(runs.registry_check).toEqual({ kind: 'npm', script: 'registry:check' });
    expect(runs.content_validate).toEqual({ kind: 'node', args: ['tools/content/validate.ts'] });
    expect(runs.build).toEqual({ kind: 'npm', script: 'build' });
    expect(runs.build_release).toEqual({ kind: 'npm', script: 'build:release' });
    expect(runs.playthrough).toEqual({ kind: 'npm', script: 'playthrough' });
  });

  it('builds the uncommitted prompt output first, and it really is not committed', () => {
    const step = GATE_STEPS.find((s) => s.id === 'prompts_check');
    expect(step?.prepare).toEqual({
      unlessExists: 'assets/prompts/out',
      run: { kind: 'npm', script: 'prompts' },
    });
    const ignore = readFileSync(join(HAKONIWA, '.gitignore'), 'utf8').split(/\r?\n/);
    expect(ignore).toContain('assets/prompts/out/');
  });

  it('names only npm scripts that exist, and npm run gate runs this tool', () => {
    const scripts = GATE_STEPS.flatMap((s) => [s.run, ...(s.prepare ? [s.prepare.run] : [])])
      .filter((r) => r.kind === 'npm')
      .map(scriptOf);
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect(pkg.scripts[script], script).toBeTruthy();
    expect(pkg.scripts.gate).toBe('node tools/gate.ts');
    expect(pkg.scripts.format).toBe(`node ${BIOME_BIN} check --write`);
  });

  it('plans every step and marks the --full-only ones as skipped without --full', () => {
    const quick = planGate(GATE_STEPS, { full: false });
    expect(quick.map((p) => p.step.id)).toEqual(GATE_STEPS.map((s) => s.id));
    expect(quick.filter((p) => p.skipReason).map((p) => [p.step.id, p.skipReason])).toEqual([
      ['playthrough', 'needs --full'],
    ]);
    expect(planGate(GATE_STEPS, { full: true }).filter((p) => p.skipReason)).toEqual([]);
  });

  it('starts npm scripts through the package manager entry without a shell', () => {
    const viaNpm = resolveCommand(
      { kind: 'npm', script: 'test' },
      { platform: 'win32', nodePath: '/n/node', npmExecPath: '/npm/bin/npm-cli.js' },
    );
    expect(viaNpm).toEqual({
      command: '/n/node',
      args: ['/npm/bin/npm-cli.js', 'run', 'test'],
      shell: false,
    });
    const viaPnpm = resolveCommand(
      { kind: 'npm', script: 'build' },
      { platform: 'linux', nodePath: '/n/node', npmExecPath: '/p/pnpm.cjs' },
    );
    expect(viaPnpm.args).toEqual(['/p/pnpm.cjs', 'run', 'build']);
    // Outside a package manager, npm is a .cmd shim on Windows that needs a shell.
    expect(
      resolveCommand({ kind: 'npm', script: 'test' }, { platform: 'win32', nodePath: '/n/node' }),
    ).toEqual({ command: 'npm', args: ['run', 'test'], shell: true });
    expect(
      resolveCommand(
        { kind: 'npm', script: 'test' },
        { platform: 'linux', nodePath: '/n/node', npmExecPath: '/usr/bin/npm' },
      ),
    ).toEqual({ command: 'npm', args: ['run', 'test'], shell: false });
    expect(
      resolveCommand(
        { kind: 'node', args: ['tools/content/validate.ts'] },
        { platform: 'win32', nodePath: '/n/node' },
      ),
    ).toEqual({ command: '/n/node', args: ['tools/content/validate.ts'], shell: false });
  });
});

describe('gate runner and exit code', () => {
  const steps = ['a', 'b', 'c', 'd'].map((id) => fakeStep(id));

  it('passes with exit code 0 when every step passes', () => {
    const { results, executed, exit } = runFake(steps, {});
    expect(executed).toEqual(['a', 'b', 'c', 'd']);
    expect(results.map((r) => r.status)).toEqual(['pass', 'pass', 'pass', 'pass']);
    expect(results.map((r) => r.durationMs)).toEqual([5, 5, 5, 5]);
    expect(exit).toBe(0);
  });

  it('fails the gate for a failure at every position and still runs every later step', () => {
    for (const failing of ['a', 'b', 'c', 'd']) {
      const { results, executed, exit } = runFake(steps, { [failing]: 3 });
      expect(executed, failing).toEqual(['a', 'b', 'c', 'd']);
      expect(
        results.map((r) => [r.id, r.status, r.exitCode]),
        failing,
      ).toEqual(
        steps.map((s) => [s.id, s.id === failing ? 'fail' : 'pass', s.id === failing ? 3 : 0]),
      );
      expect(exit, failing).toBe(1);
    }
  });

  it('records each failing step with its own exit code', () => {
    const { results, exit } = runFake(steps, { b: 2, d: 127 });
    expect(results.map((r) => r.exitCode)).toEqual([0, 2, 0, 127]);
    expect(results.filter((r) => r.status === 'fail').map((r) => r.id)).toEqual(['b', 'd']);
    expect(exit).toBe(1);
  });

  it('fails a step that never exited normally or threw, and keeps going', () => {
    const killed = runFake(steps, { c: null });
    expect(killed.results[2]).toMatchObject({ id: 'c', status: 'fail', exitCode: null });
    expect(killed.exit).toBe(1);

    const executed: string[] = [];
    const results = runPlan(
      planGate(steps, { full: false }),
      (step) => {
        executed.push(step.id);
        if (step.id === 'b') throw new Error('boom');
        return { exitCode: 0 };
      },
      () => 0,
    );
    expect(executed).toEqual(['a', 'b', 'c', 'd']);
    expect(results[1]).toMatchObject({ status: 'fail', exitCode: null, note: 'threw: boom' });
    expect(gateExitCode(results)).toBe(1);
  });

  it('lists skipped steps without running them, and they never fail the gate', () => {
    const withFull = [...steps, fakeStep('slow', { fullOnly: true })];
    const quick = runFake(withFull, { slow: 9 });
    expect(quick.executed).toEqual(['a', 'b', 'c', 'd']);
    expect(quick.results[4]).toMatchObject({ id: 'slow', status: 'skip', exitCode: null });
    expect(quick.exit).toBe(0);
    // The same failing step does fail the gate once --full runs it.
    const full = runFake(withFull, { slow: 9 }, true);
    expect(full.executed).toEqual(['a', 'b', 'c', 'd', 'slow']);
    expect(full.results[4]).toMatchObject({ status: 'fail', exitCode: 9 });
    expect(full.exit).toBe(1);
    expect(gateExitCode([])).toBe(0);
  });

  it('maps exit codes to results', () => {
    expect(statusOf(0)).toBe('pass');
    expect(statusOf(1)).toBe('fail');
    expect(statusOf(-1)).toBe('fail');
    expect(statusOf(null)).toBe('fail');
  });

  it('calls the start and end hooks once per step in order', () => {
    const log: string[] = [];
    runPlan(
      planGate([fakeStep('a'), fakeStep('b', { fullOnly: true })], { full: false }),
      () => ({ exitCode: 0 }),
      () => 0,
      {
        onStart: (step, i, total) => log.push(`start ${step.id} ${i}/${total}`),
        onEnd: (result, i, total) => log.push(`end ${result.id} ${result.status} ${i}/${total}`),
      },
    );
    expect(log).toEqual(['start a 0/2', 'end a pass 0/2', 'end b skip 1/2']);
  });
});

describe('gate prepare runs', () => {
  const step = fakeStep('check', {
    prepare: { unlessExists: 'out', run: { kind: 'npm', script: 'generate' } },
  });

  function execute(exists: boolean, codes: Record<string, number>) {
    const ran: string[] = [];
    const outcome = executeStep(step, {
      exists: (p) => (p === 'out' ? exists : false),
      run: (run): StepOutcome => {
        ran.push(scriptOf(run));
        return { exitCode: codes[scriptOf(run)] ?? 0 };
      },
    });
    return { ran, outcome };
  }

  it('runs the prepare script first when its path is missing', () => {
    const { ran, outcome } = execute(false, {});
    expect(ran).toEqual(['generate', 'check']);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.note).toBe('prepared with npm run generate (out missing)');
  });

  it('skips the prepare script when its path exists', () => {
    const { ran, outcome } = execute(true, { check: 4 });
    expect(ran).toEqual(['check']);
    expect(outcome).toEqual({ exitCode: 4, note: undefined });
  });

  it('fails the step without running it when the prepare script fails', () => {
    const { ran, outcome } = execute(false, { generate: 5 });
    expect(ran).toEqual(['generate']);
    expect(outcome.exitCode).toBe(5);
    expect(outcome.note).toBe('prepare npm run generate (out missing) failed');
  });
});

describe('gate with real child processes', () => {
  const ctx = { platform: process.platform, nodePath: process.execPath };
  const nodeStep = (id: string, code: number): GateStep => ({
    id,
    title: id,
    run: { kind: 'node', args: ['-e', `process.exit(${code})`] },
  });

  it('carries every process exit code into the results and fails the gate', () => {
    const plan = planGate([nodeStep('ok', 0), nodeStep('bad', 3), nodeStep('after', 0)], {
      full: false,
    });
    const results = runPlan(
      plan,
      (step) =>
        step.run.kind === 'internal'
          ? { exitCode: 1 }
          : execCommand(resolveCommand(step.run, ctx), { cwd: HAKONIWA, stdio: 'ignore' }),
      () => 0,
    );
    expect(results.map((r) => [r.id, r.status, r.exitCode])).toEqual([
      ['ok', 'pass', 0],
      ['bad', 'fail', 3],
      ['after', 'pass', 0],
    ]);
    expect(gateExitCode(results)).toBe(1);
  });

  it('reports a program that cannot start as a failure without an exit code', () => {
    const outcome = execCommand(
      { command: join(HAKONIWA, 'no_such_program_for_the_gate'), args: [], shell: false },
      { cwd: HAKONIWA, stdio: 'ignore' },
    );
    expect(outcome.exitCode).toBeNull();
    expect(outcome.note).toMatch(/^could not start/);
    expect(statusOf(outcome.exitCode)).toBe('fail');
  });

  it('loads every gate module under plain Node and rejects unknown arguments', () => {
    const help = spawnSync(process.execPath, ['tools/gate.ts', '--help'], {
      cwd: HAKONIWA,
      encoding: 'utf8',
    });
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('npm run gate');
    const bad = spawnSync(process.execPath, ['tools/gate.ts', '--no-such-flag'], {
      cwd: HAKONIWA,
      encoding: 'utf8',
    });
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('unknown argument: --no-such-flag');
  });
});

describe('gate summary', () => {
  const results: StepResult[] = [
    { id: 'typecheck', title: 't', status: 'pass', exitCode: 0, durationMs: 4200 },
    { id: 'test', title: 't', status: 'fail', exitCode: 1, durationMs: 95_000, note: 'x' },
    { id: 'playthrough', title: 't', status: 'skip', exitCode: null, durationMs: 0, note: 'n' },
  ];

  it('prints one row per step with result, exit code and time, then the verdict', () => {
    const text = renderSummary(results, 99_200);
    const lines = text.split('\n');
    expect(lines[0]).toMatch(/^\| # +\| step +\| result \| exit \| time +\| note \|$/);
    expect(lines[2]).toMatch(/^\| 1 +\| typecheck +\| PASS +\| 0 +\| 4\.2s +\| +\|$/);
    expect(lines[3]).toMatch(/^\| 2 +\| test +\| FAIL +\| 1 +\| 1m 35s \| x +\|$/);
    expect(lines[4]).toMatch(/^\| 3 +\| playthrough \| SKIP +\| - +\| - +\| n +\|$/);
    expect(text).toContain('gate FAIL: 1 of 2 run step(s) failed (test), 1 skipped, total 1m 39s');
    // Every row has the same width.
    expect(new Set(lines.slice(0, 5).map((l) => l.length)).size).toBe(1);
  });

  it('says PASS when nothing failed', () => {
    const text = renderSummary([results[0], results[2]], 4200);
    expect(text).toContain('gate PASS: 1 run step(s) passed, 1 skipped, total 4.2s');
    expect(text).not.toContain('FAIL');
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(849.6)).toBe('850ms');
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(59_940)).toBe('59.9s');
    expect(formatDuration(60_000)).toBe('1m 00s');
    expect(formatDuration(3 * 60_000 + 5_000)).toBe('3m 05s');
  });
});

describe('gate arguments', () => {
  const parse = (argv: string[], env: Record<string, string> = {}): GateOptions => {
    const parsed = parseGateArgs(argv, env);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.options;
  };

  it('defaults to the quick gate against HEAD', () => {
    expect(parse([])).toEqual({ full: false, help: false, base: 'HEAD' });
  });

  it('reads --full, --base and HK_GATE_BASE, the flag winning over the variable', () => {
    expect(parse(['--full']).full).toBe(true);
    expect(parse(['--base', 'origin/main']).base).toBe('origin/main');
    expect(parse(['--base=abc123']).base).toBe('abc123');
    expect(parse([], { HK_GATE_BASE: 'deadbeef' }).base).toBe('deadbeef');
    expect(parse([], { HK_GATE_BASE: '  ' }).base).toBe('HEAD');
    expect(parse(['--base', 'x'], { HK_GATE_BASE: 'y' }).base).toBe('x');
    expect(parse(['--help']).help).toBe(true);
  });

  it('rejects unknown arguments and a missing base', () => {
    expect(parseGateArgs(['--fast'], {})).toEqual({ ok: false, error: 'unknown argument: --fast' });
    expect(parseGateArgs(['--base'], {}).ok).toBe(false);
    expect(parseGateArgs(['--base', '--full'], {}).ok).toBe(false);
    expect(parseGateArgs(['--base='], {}).ok).toBe(false);
  });
});

describe('forbidden-character scan', () => {
  it('flags every forbidden range at both ends and nothing just outside', () => {
    const forbidden: [number, string][] = [
      [0x2013, 'dash'],
      [0x2014, 'dash'],
      [0x2015, 'dash'],
      [0x2600, 'symbol'],
      [0x2605, 'symbol'],
      [0x2714, 'symbol'],
      [0x27bf, 'symbol'],
      [0xfe0f, 'emoji'],
      [0x1f000, 'emoji'],
      [0x1f1e6, 'emoji'],
      [0x1f600, 'emoji'],
      [0x1faff, 'emoji'],
    ];
    for (const [cp, category] of forbidden) {
      expect(categoryOf(cp), cp.toString(16)).toBe(category);
      expect(scanText(`a${ch(cp)}b`), cp.toString(16)).toEqual([
        { line: 1, column: 2, codePoint: cp, category },
      ]);
    }
    for (const cp of [0x2012, 0x2016, 0x25ff, 0x27c0, 0xfe0e, 0x1efff, 0x1fb00, 0x3001, 0xff5e]) {
      expect(categoryOf(cp), cp.toString(16)).toBeUndefined();
      expect(scanText(`a${ch(cp)}b`), cp.toString(16)).toEqual([]);
    }
  });

  it('allows the punctuation the rules recommend instead', () => {
    expect(scanText('范围用"到"或"～"，停顿用冒号：逗号，或括号（）。- ~ -- 1 to 2')).toEqual([]);
  });

  it('reports lines and code-point columns across CRLF and astral characters', () => {
    const text = `ok\r\n${ch(0x1f600)}x${ch(0x2014)}${ch(0x2014)}\nclean\n${ch(0x2605)}`;
    expect(scanText(text)).toEqual([
      { line: 2, column: 1, codePoint: 0x1f600, category: 'emoji' },
      { line: 2, column: 3, codePoint: 0x2014, category: 'dash' },
      { line: 2, column: 4, codePoint: 0x2014, category: 'dash' },
      { line: 4, column: 1, codePoint: 0x2605, category: 'symbol' },
    ]);
    expect(
      formatHit({ path: 'docs/a.md', line: 2, column: 3, codePoint: 0x2014, category: 'dash' }),
    ).toBe('docs/a.md:2:3 U+2014 (dash)');
  });

  it('scans the folders and text types the rule names', () => {
    expect(FORBIDDEN_SCAN.dirs).toEqual([
      'src',
      'tests',
      'tools',
      'data',
      'docs',
      'assets/prompts',
      'desktop',
    ]);
    for (const ext of ['.ts', '.json', '.md', '.css', '.html', '.csv', '.yml']) {
      expect(FORBIDDEN_SCAN.extensions).toContain(ext);
    }
    expect(isTextFile('a/b.TS', FORBIDDEN_SCAN.extensions)).toBe(true);
    expect(isTextFile('art/hero.png', FORBIDDEN_SCAN.extensions)).toBe(false);
    expect(isTextFile('audio/x.ogg', FORBIDDEN_SCAN.extensions)).toBe(false);
    expect(isTextFile('.gitignore', FORBIDDEN_SCAN.extensions)).toBe(false);
    expect(isTextFile('dir.md/README', FORBIDDEN_SCAN.extensions)).toBe(false);
  });

  describe('on a file tree', () => {
    let root = '';
    afterEach(() => {
      if (root) rmSync(root, { recursive: true, force: true });
      root = '';
    });

    const put = (rel: string, text: string) => {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
    };

    it('finds hits in every scanned folder and skips generated, vendored and binary files', () => {
      root = mkdtempSync(join(tmpdir(), 'hk-gate-'));
      const dash = ch(0x2014);
      put('src/a.ts', `const a = 1;\n// x ${dash} y\n`);
      put('docs/deep/b.md', `title\n\n${ch(0x2705)} done\n`);
      put('assets/prompts/specs/c.json', `{"zh": "${ch(0x2015)}"}\n`);
      put('assets/prompts/out/generated.md', `${dash}\n`);
      put('src/node_modules/pkg/index.js', `${dash}\n`);
      put('docs/dist/bundle.js', `${dash}\n`);
      put('data/art.png', `${dash}\n`);
      put('tests/clean.test.ts', 'export {};\n');
      put('outside/ignored.md', `${dash}\n`);
      const config: ScanConfig = { ...FORBIDDEN_SCAN };
      const listed = listTextFiles(root, config);
      expect(listed.files).toEqual([
        'assets/prompts/specs/c.json',
        'docs/deep/b.md',
        'src/a.ts',
        'tests/clean.test.ts',
      ]);
      expect(listed.missingDirs).toEqual(['tools', 'desktop']);
      const scan = scanTree(root, config);
      expect(scan.fileCount).toBe(4);
      expect(scan.hits.map(formatHit)).toEqual([
        'assets/prompts/specs/c.json:1:9 U+2015 (dash)',
        'docs/deep/b.md:3:1 U+2705 (symbol)',
        'src/a.ts:2:6 U+2014 (dash)',
      ]);
    });

    it('passes a clean tree', () => {
      root = mkdtempSync(join(tmpdir(), 'hk-gate-'));
      put('src/a.ts', 'export const a = 1;\n');
      put('docs/b.md', '# 标题：说明（一）\n');
      expect(scanTree(root, FORBIDDEN_SCAN).hits).toEqual([]);
    });
  });
});

describe('changed-file Biome step', () => {
  it('lists changed and untracked files relative to hakoniwa, NUL-separated', () => {
    expect(gitChangedArgs('origin/main')).toEqual([
      [
        'diff',
        '--name-only',
        '--relative',
        '--no-renames',
        '--diff-filter=d',
        '-z',
        'origin/main',
        '--',
      ],
      ['ls-files', '--others', '--exclude-standard', '-z'],
    ]);
    expect(gitVerifyArgs('HEAD')).toEqual(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
    expect(parseNameList('src/a.ts\0docs/b.md\0\0')).toEqual(['src/a.ts', 'docs/b.md']);
    expect(parseNameList('src\\c.ts\r\ntools/d.ts\n')).toEqual(['src/c.ts', 'tools/d.ts']);
    expect(parseNameList('')).toEqual([]);
  });

  it('checks code, JSON and CSS but never markdown or other files', () => {
    expect(
      biomeTargets([
        'tools/gate.ts',
        'docs/plan.md',
        'README.md',
        'data/a.json',
        'src/styles/hud.css',
        'assets/art/x.png',
        '../.github/workflows/hakoniwa-ci.yml',
        'tools/gate.ts',
        'src/b.mjs',
        '.gitignore',
      ]),
    ).toEqual(['data/a.json', 'src/b.mjs', 'src/styles/hud.css', 'tools/gate.ts']);
  });

  it('runs the root pinned Biome in check mode, in chunks', () => {
    expect(BIOME_BIN).toBe('../node_modules/@biomejs/biome/bin/biome');
    expect(existsSync(join(HAKONIWA, BIOME_BIN))).toBe(true);
    expect(biomeArgs(['a.ts', 'b.json'])).toEqual([
      BIOME_BIN,
      'check',
      '--no-errors-on-unmatched',
      'a.ts',
      'b.json',
    ]);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow();
    expect(BIOME_CHUNK).toBeGreaterThan(0);
  });
});

describe('commit pipeline (.github/workflows/hakoniwa-ci.yml)', () => {
  const path = join(REPO_ROOT, '.github', 'workflows', 'hakoniwa-ci.yml');
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const code = text
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');

  it('runs on pushes to main and pull requests that touch hakoniwa only', () => {
    const on = code.slice(code.indexOf('\non:\n'), code.indexOf('\npermissions:'));
    expect(on).toMatch(
      /\n {2}push:\n {4}branches:\n {6}- main\n {4}paths:\n {6}- 'hakoniwa\/\*\*'\n/,
    );
    expect(on).toMatch(/\n {2}pull_request:\n {4}paths:\n {6}- 'hakoniwa\/\*\*'\n/);
    const paths = [...on.matchAll(/^ {6}- '([^']+)'$/gm)].map((m) => m[1]);
    expect(new Set(paths)).toEqual(new Set(['hakoniwa/**', '.github/workflows/hakoniwa-ci.yml']));
  });

  it('installs the root toolchain and hakoniwa with npm 10 on Ubuntu, without LFS', () => {
    expect(code).toContain('runs-on: ubuntu-latest');
    expect(code).toMatch(/uses: actions\/checkout@v\d+\n {8}with:\n {10}lfs: false\n/);
    expect(code).toContain('run: pnpm install --frozen-lockfile');
    expect(code).toMatch(/working-directory: hakoniwa\n {8}run: npx npm@10 ci\n/);
    // The root has no package-lock.json, so npm ci could not install it.
    expect(existsSync(join(REPO_ROOT, 'pnpm-lock.yaml'))).toBe(true);
    expect(existsSync(join(HAKONIWA, 'package-lock.json'))).toBe(true);
  });

  it('runs the gate with the base ref and never the playthroughs or secrets', () => {
    expect(code).toMatch(
      /working-directory: hakoniwa\n {8}env:\n {10}HK_GATE_BASE: \$\{\{ steps\.base\.outputs\.ref \}\}\n {8}run: npm run gate\n/,
    );
    expect(code).not.toContain('--full');
    expect(code).not.toContain('playthrough');
    expect(code).not.toContain('secrets.');
    expect(code).toMatch(/\npermissions:\n {2}contents: read\n/);
  });
});
