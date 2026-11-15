// Spawns one gate process and reports how it ended (tools/gate.ts). Kept apart from the
// pure runner (tools/gate/run.ts) so tests/gate.test.ts can prove with real child
// processes that an exit code reaches the gate result unchanged.
//
// Type-only imports keep this module loadable straight from Node (see tools/gate/steps.ts).

import { spawnSync } from 'node:child_process';
import type { StepOutcome } from './run';
import type { ResolvedCommand } from './steps';

export interface ExecOptions {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  /** 'inherit' streams the step's output to the gate's console. */
  readonly stdio?: 'inherit' | 'ignore';
}

/** Runs a command to completion; a spawn error or a signal yields a null exit code. */
export function execCommand(cmd: ResolvedCommand, options: ExecOptions): StepOutcome {
  const spawnOptions = {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
  } as const;
  // A shell is only used to find Windows .cmd shims; it gets one command line (the
  // arguments here are script names without spaces), since Node deprecates separate
  // arguments together with shell: true (DEP0190).
  const result = cmd.shell
    ? spawnSync([cmd.command, ...cmd.args].join(' '), { ...spawnOptions, shell: true })
    : spawnSync(cmd.command, [...cmd.args], spawnOptions);
  if (result.error) return { exitCode: null, note: `could not start: ${result.error.message}` };
  if (result.signal) return { exitCode: null, note: `killed by ${result.signal}` };
  return { exitCode: result.status };
}
