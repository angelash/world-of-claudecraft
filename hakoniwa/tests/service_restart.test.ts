import { describe, expect, it } from 'vitest';
import {
  beginRestart,
  finishRestart,
  initialRestartState,
  interruptRestart,
  recoverRestartState,
  requestRestart,
  resumeRestart,
} from '../tools/service/restart_state';

describe('persistent managed restart contract', () => {
  it('waits five seconds and performs only one restart', () => {
    const s = requestRestart(initialRestartState(0), 'logic updated', 'a', 10);
    expect(s.deadline).toBe(5010);
    expect(beginRestart(s, 5009)).toBe(s);
    const running = beginRestart(s, 5010);
    expect(running.phase).toBe('restarting');
    expect(beginRestart(running, 9000)).toBe(running);
    expect(finishRestart(running, true, 9000)).toMatchObject({ phase: 'idle', generation: 1 });
  });
  it('a user interrupt persists and all later requests remain held until explicit resume', () => {
    const pending = requestRestart(initialRestartState(0), 'logic', 'a', 0);
    const held = interruptRestart(pending, 'a', 4999);
    expect(held).toMatchObject({ phase: 'paused', deadline: null });
    expect(beginRestart(held, 999999)).toBe(held);
    expect(requestRestart(held, 'another task', 'b', 999999)).toBe(held);
    expect(recoverRestartState(held)).toEqual(held);
    const resumed = resumeRestart(held, 'a', 10000);
    expect(resumed.deadline).toBe(15000);
    expect(beginRestart(resumed, 14999)).toBe(resumed);
  });
  it('rejects stale IDs and cannot cancel a restart already executing', () => {
    const pending = requestRestart(initialRestartState(0), 'logic', 'b', 0);
    expect(interruptRestart(pending, 'a', 0)).toBe(pending);
    const held = interruptRestart(pending, 'b', 0);
    expect(resumeRestart(held, 'a', 1)).toBe(held);
    const running = beginRestart(pending, 5000);
    expect(interruptRestart(running, 'b', 5000)).toBe(running);
  });
  it('recovers interrupted countdowns conservatively without opening a new timer', () => {
    const pending = requestRestart(initialRestartState(0), 'logic', 'a', 0);
    expect(recoverRestartState(pending)).toMatchObject({ phase: 'paused', deadline: null });
    expect(recoverRestartState(beginRestart(pending, 5000))).toMatchObject({
      phase: 'paused',
      deadline: null,
    });
  });
});
