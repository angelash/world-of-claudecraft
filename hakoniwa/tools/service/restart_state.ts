export type RestartPhase = 'idle' | 'countdown' | 'paused' | 'restarting' | 'failed';
export interface RestartState {
  phase: RestartPhase;
  requestId: string | null;
  reason: string;
  deadline: number | null;
  generation: number;
  updatedAt: number;
}
export const COUNTDOWN_MS = 5000;
export function initialRestartState(now: number): RestartState {
  return {
    phase: 'idle',
    requestId: null,
    reason: '',
    deadline: null,
    generation: 0,
    updatedAt: now,
  };
}
export function requestRestart(
  s: RestartState,
  reason: string,
  id: string,
  now: number,
): RestartState {
  if (s.phase !== 'idle' && s.phase !== 'failed') return s;
  return {
    ...s,
    phase: 'countdown',
    requestId: id,
    reason: reason.slice(0, 240),
    deadline: now + COUNTDOWN_MS,
    updatedAt: now,
  };
}
export function interruptRestart(s: RestartState, id: string, now: number): RestartState {
  if (s.requestId !== id || s.phase !== 'countdown') return s;
  return { ...s, phase: 'paused', deadline: null, updatedAt: now };
}
export function resumeRestart(s: RestartState, id: string, now: number): RestartState {
  if (s.requestId !== id || s.phase !== 'paused') return s;
  return { ...s, phase: 'countdown', deadline: now + COUNTDOWN_MS, updatedAt: now };
}
export function beginRestart(s: RestartState, now: number): RestartState {
  if (s.phase !== 'countdown' || s.deadline === null || now < s.deadline) return s;
  return { ...s, phase: 'restarting', deadline: null, updatedAt: now };
}
export function finishRestart(s: RestartState, ok: boolean, now: number): RestartState {
  return {
    ...s,
    phase: ok ? 'idle' : 'failed',
    deadline: null,
    generation: s.generation + Number(ok),
    updatedAt: now,
  };
}
/** A supervisor restart never silently resumes a planned or interrupted operation. */
export function recoverRestartState(s: RestartState): RestartState {
  return s.phase === 'countdown' || s.phase === 'restarting'
    ? { ...s, phase: 'paused', deadline: null }
    : s;
}
