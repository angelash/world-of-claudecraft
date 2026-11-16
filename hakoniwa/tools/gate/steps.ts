// The step table of the full local gate (tools/gate.ts, docs/60_production/dev_process.md
// section 4.1; docs/50_tech/release_engineering.md sections 10 and 11). The table is data:
// a later packet adds its check (asset checks, content validation, the registry check, the
// smoke playthrough) by appending one record here, and the runner, the summary and the
// commit pipeline (.github/workflows/hakoniwa-ci.yml runs `npm run gate`) pick it up.
//
// The gate modules have no runtime imports of each other: tools/gate.ts loads each one
// straight from Node (type stripping needs explicit .ts specifiers, which the typecheck
// refuses in static imports), and tests/gate.test.ts imports them through Vitest.

/** A check implemented inside the gate itself (tools/gate.ts wires each one). */
export type InternalCheck = 'forbidden_chars' | 'biome_changed';

/** How a step runs. Paths and the working directory are relative to hakoniwa/. */
export type GateRun =
  | { readonly kind: 'npm'; readonly script: string }
  | { readonly kind: 'node'; readonly args: readonly string[] }
  | { readonly kind: 'internal'; readonly check: InternalCheck };

/** A run that spawns a process. */
export type ProcessRun = Exclude<GateRun, { kind: 'internal' }>;

export interface GateStep {
  /** Stable id, shown in the summary. */
  readonly id: string;
  /** One line on what the step guards. */
  readonly title: string;
  readonly run: GateRun;
  /** Runs only with --full (slow suites the commit pipeline leaves to the nightly). */
  readonly fullOnly?: boolean;
  /** Runs `run` first when `unlessExists` (a path under hakoniwa/) is missing. */
  readonly prepare?: { readonly unlessExists: string; readonly run: GateRun };
}

/**
 * The gate, in order. Every step runs even when an earlier one fails, and the gate exits
 * non-zero exactly when a step failed (tools/gate/run.ts).
 */
export const GATE_STEPS: readonly GateStep[] = [
  {
    id: 'forbidden_chars',
    title: 'forbidden characters (dashes, emoji, U+2600 to U+27BF) in text files',
    run: { kind: 'internal', check: 'forbidden_chars' },
  },
  {
    id: 'biome_changed',
    title: 'Biome check of git-changed files (markdown excluded)',
    run: { kind: 'internal', check: 'biome_changed' },
  },
  {
    id: 'typecheck',
    title: 'type check',
    run: { kind: 'npm', script: 'typecheck' },
  },
  {
    id: 'test',
    title: 'unit and guard tests',
    run: { kind: 'npm', script: 'test' },
  },
  {
    id: 'prompts_check',
    title: 'prompt library valid and assets/prompts/out/ current',
    run: { kind: 'npm', script: 'prompts:check' },
    // out/ is generated locally and not committed, so a fresh checkout builds it first.
    prepare: { unlessExists: 'assets/prompts/out', run: { kind: 'npm', script: 'prompts' } },
  },
  {
    id: 'registry_check',
    title: 'variable registry current and data, code free of aliases',
    run: { kind: 'npm', script: 'registry:check' },
  },
  {
    id: 'content_validate',
    title: 'content validators V1 to V10 on data/',
    run: { kind: 'node', args: ['tools/content/validate.ts'] },
  },
  {
    id: 'build',
    title: 'game and editor build',
    run: { kind: 'npm', script: 'build' },
  },
  {
    id: 'build_release',
    title: 'release build (game entry only) with the bundle leak scan',
    run: { kind: 'npm', script: 'build:release' },
  },
  {
    id: 'playthrough',
    title: 'no-model playthroughs (both ending routes, replay hash)',
    run: { kind: 'npm', script: 'playthrough' },
    fullOnly: true,
  },
];

export interface PlannedStep {
  readonly step: GateStep;
  /** Set when the step is listed in the summary but not run. */
  readonly skipReason?: string;
}

export interface PlanOptions {
  readonly full: boolean;
}

/** Every step in table order; the --full-only steps are skipped without --full. */
export function planGate(steps: readonly GateStep[], options: PlanOptions): PlannedStep[] {
  return steps.map((step) =>
    step.fullOnly && !options.full ? { step, skipReason: 'needs --full' } : { step },
  );
}

/** A process to spawn; `shell` only where the platform needs one to find the program. */
export interface ResolvedCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly shell: boolean;
}

export interface CommandContext {
  readonly platform: string;
  /** The running Node binary (process.execPath). */
  readonly nodePath: string;
  /** npm_execpath when the gate was started by a package manager script. */
  readonly npmExecPath?: string;
}

/**
 * The process for an npm or node step. A script started by `npm run` (or pnpm) gets
 * npm_execpath, the package manager's JS entry, so it runs on the current Node with no
 * shell; outside one, `npm` is a .cmd shim on Windows that only a shell can start.
 */
export function resolveCommand(run: ProcessRun, ctx: CommandContext): ResolvedCommand {
  if (run.kind === 'node') return { command: ctx.nodePath, args: [...run.args], shell: false };
  if (ctx.npmExecPath && /\.[cm]?js$/.test(ctx.npmExecPath)) {
    return { command: ctx.nodePath, args: [ctx.npmExecPath, 'run', run.script], shell: false };
  }
  return { command: 'npm', args: ['run', run.script], shell: ctx.platform === 'win32' };
}
