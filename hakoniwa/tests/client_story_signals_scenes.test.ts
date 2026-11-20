// The prologue's name and answer prompts are tied to their scenes (src/client/app/tut_signals.ts):
// the earth rooms ask for an unsent reply or a cat's name and the door offers choices before
// the call, so "the first input is the name" would teach the name at the phone and the
// interview at the door (tut_p_name, tut_p_answer; ux_and_onboarding.md 17.5).

import { describe, expect, it } from 'vitest';
import { type StoryProbe, StorySignals } from '../src/client/app/tut_signals';

const probe = (sceneId: string | undefined, waiting: string | null): StoryProbe => ({
  act: 'prologue',
  waiting,
  sceneId,
  keyed: false,
  keyChoice: false,
  listen: null,
  shop: false,
  deadline: false,
});

describe('prologue prompts follow their scenes', () => {
  it('asks the name at the call, not at the phone, and the answers in the interview only', () => {
    const s = new StorySignals();
    // the phone's unsent reply, then the door's choices: neither is the name nor an answer
    expect(s.update(probe('cut_p_earth', 'input')).has('name_prompt')).toBe(false);
    expect(s.update(probe('cut_p_earth', 'advance')).has('name_answered')).toBe(false);
    const door = s.update(probe('cut_p_door_white', 'choice'));
    expect(door.has('name_prompt')).toBe(false);
    expect(door.has('answer_prompt')).toBe(false);
    // the call asks the name
    expect(s.update(probe('cut_p_call', 'input')).has('name_prompt')).toBe(true);
    expect(s.update(probe('cut_p_call', 'advance')).has('name_answered')).toBe(true);
    // the call's own questions are not the interview
    expect(s.update(probe('cut_p_call', 'choice')).has('answer_prompt')).toBe(false);
    expect(s.update(probe('cut_p_interview', 'choice')).has('answer_prompt')).toBe(true);
    expect(s.update(probe('cut_p_interview', 'advance')).has('answered')).toBe(true);
  });

  it('keeps the old reading for a probe without a scene id', () => {
    const s = new StorySignals();
    expect(s.update(probe(undefined, 'input')).has('name_prompt')).toBe(true);
  });
});
