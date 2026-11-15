// The gate runner core (tools/gate.ts): argument parsing, running the planned steps in
// order without stopping at a failure, the exit code, and the summary table. Pure: the
// process spawning, file system and clock come in as functions, so tests/gate.test.ts
// drives it with constructed passing, failing, throwing and skipped steps.
//
// Type-only imports keep this module loadable straight from Node (see tools/gate/steps.ts).

import type { GateRun, GateStep, PlannedStep } from './steps';

export type StepStatus = 'pass' | 'fail' | 'skip';

/** How one run ended. */
export interface StepOutcome {
  /** The process or internal check exit code; null when it never exited normally. */
  readonly exitCode: number | null;
  readonly note?: string;
}

export interface StepResult {
  readonly id: string;
  readonly title: string;
  readonly status: StepStatus;
  /** null for a skipped step and for a run that never exited normally. */
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly note?: string;
}

/** Exit code 0 passes; any other code, or none at all (spawn error, signal), fails. */
export function statusOf(exitCode: number | null): 'pass' | 'fail' {
  return exitCode === 0 ? 'pass' : 'fail';
}

/** The log form of a step run. */
export function describeRun(run: GateRun): string {
  if (run.kind === 'internal') return `internal check ${run.check}`;
  if (run.kind === 'node') return `node ${run.args.join(' ')}`;
  return `npm run ${run.script}`;
}

function joinNotes(notes: readonly (string | undefined)[]): string | undefined {
  const kept = notes.filter((n): n is string => Boolean(n));
  return kept.length > 0 ? kept.join('; ') : undefined;
}

export interface StepDeps {
  /** Whether a path under hakoniwa/ exists. */
  exists(path: string): boolean;
  /** Runs one npm, node or internal run. */
  run(run: GateRun): StepOutcome;
}

/**
 * One step: its prepare run first when the prepare path is missing, then the step's own
 * run. A failed prepare fails the step without running it.
 */
export function executeStep(step: GateStep, deps: StepDeps): StepOutcome {
  const notes: string[] = [];
  const prepare = step.prepare;
  if (prepare && !deps.exists(prepare.unlessExists)) {
    const what = `${describeRun(prepare.run)} (${prepare.unlessExists} missing)`;
    const prep = deps.run(prepare.run);
    if (prep.exitCode !== 0) {
      return { exitCode: prep.exitCode, note: joinNotes([`prepare ${what} failed`, prep.note]) };
    }
    notes.push(`prepared with ${what}`);
  }
  const outcome = deps.run(step.run);
  return { exitCode: outcome.exitCode, note: joinNotes([...notes, outcome.note]) };
}

export interface RunHooks {
  onStart?(step: GateStep, index: number, total: number): void;
  onEnd?(result: StepResult, index: number, total: number): void;
}

/**
 * Runs every planned step in order. A failing or throwing step is recorded and the next
 * step still runs; a skipped step is listed but never executed.
 */
export function runPlan(
  plan: readonly PlannedStep[],
  execute: (step: GateStep) => StepOutcome,
  now: () => number,
  hooks: RunHooks = {},
): StepResult[] {
  const results: StepResult[] = [];
  plan.forEach(({ step, skipReason }, index) => {
    let result: StepResult;
    if (skipReason !== undefined) {
      result = {
        id: step.id,
        title: step.title,
        status: 'skip',
        exitCode: null,
        durationMs: 0,
        note: skipReason,
      };
    } else {
      hooks.onStart?.(step, index, plan.length);
      const started = now();
      let outcome: StepOutcome;
      try {
        outcome = execute(step);
      } catch (err) {
        outcome = { exitCode: null, note: `threw: ${err instanceof Error ? err.message : err}` };
      }
      result = {
        id: step.id,
        title: step.title,
        status: statusOf(outcome.exitCode),
        exitCode: outcome.exitCode,
        durationMs: now() - started,
        note: outcome.note,
      };
    }
    results.push(result);
    hooks.onEnd?.(result, index, plan.length);
  });
  return results;
}

/** Non-zero exactly when a step failed; skipped steps never fail the gate. */
export function gateExitCode(results: readonly StepResult[]): number {
  return results.some((r) => r.status === 'fail') ? 1 : 0;
}

/** 850ms, 12.3s, 3m 05s. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

const STATUS_LABEL: Record<StepStatus, string> = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP' };

/** The summary table (one row per step: result, exit code, time, note) and the verdict. */
export function renderSummary(results: readonly StepResult[], totalMs: number): string {
  const header = ['#', 'step', 'result', 'exit', 'time', 'note'];
  const rows = results.map((r, i) => [
    String(i + 1),
    r.id,
    STATUS_LABEL[r.status],
    r.exitCode === null ? '-' : String(r.exitCode),
    r.status === 'skip' ? '-' : formatDuration(r.durationMs),
    r.note ?? '',
  ]);
  const widths = header.map((h, c) => Math.max(h.length, ...rows.map((row) => row[c].length)));
  const line = (cells: readonly string[]) =>
    `| ${cells.map((cell, c) => cell.padEnd(widths[c])).join(' | ')} |`;
  const rule = `|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`;
  const failed = results.filter((r) => r.status === 'fail').map((r) => r.id);
  const skipped = results.filter((r) => r.status === 'skip').length;
  const ran = results.length - skipped;
  const skippedText = skipped > 0 ? `, ${skipped} skipped` : '';
  const verdict =
    failed.length > 0
      ? `gate FAIL: ${failed.length} of ${ran} run step(s) failed (${failed.join(', ')})${skippedText}, total ${formatDuration(totalMs)}`
      : `gate PASS: ${ran} run step(s) passed${skippedText}, total ${formatDuration(totalMs)}`;
  return [line(header), rule, ...rows.map(line), '', verdict].join('\n');
}

export interface GateOptions {
  /** Also run the --full-only steps. */
  readonly full: boolean;
  /** Git ref the changed files are taken against (uncommitted and untracked files always count). */
  readonly base: string;
  readonly help: boolean;
}

export type ParsedArgs =
  | { readonly ok: true; readonly options: GateOptions }
  | { readonly ok: false; readonly error: string };

/**
 * `--full`, `--base <ref>` (or `--base=<ref>`), `--help`. The base falls back to
 * HK_GATE_BASE (the commit pipeline sets it to the push or pull request base), then HEAD.
 */
export function parseGateArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): ParsedArgs {
  let full = false;
  let help = false;
  let base: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--full') full = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--base' || arg.startsWith('--base=')) {
      const value = arg === '--base' ? argv[++i] : arg.slice('--base='.length);
      if (!value || value.startsWith('--')) return { ok: false, error: '--base needs a git ref' };
      base = value;
    } else return { ok: false, error: `unknown argument: ${arg}` };
  }
  const fromEnv = env.HK_GATE_BASE?.trim();
  return { ok: true, options: { full, help, base: base ?? (fromEnv || 'HEAD') } };
}
