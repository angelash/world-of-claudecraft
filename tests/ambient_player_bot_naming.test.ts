import { describe, expect, it } from 'vitest';
import { validCharNameShape, validUsernameShape } from '../server/auth';
import { ambientBotAccountUsername, ambientBotCharacterName } from '../server/ambient_bots/naming';

describe('ambient player bot naming', () => {
  it('keeps generated account usernames within the live auth shape limit', () => {
    const username = ambientBotAccountUsername('eastbrook_vale_mage_newcomer');
    expect(username.length).toBeLessThanOrEqual(24);
    expect(validUsernameShape(username)).toBe(true);
  });

  it('keeps generated character names within the live character-name shape limit', () => {
    const name = ambientBotCharacterName('warlock', 27_041);
    expect(name.length).toBeLessThanOrEqual(16);
    expect(validCharNameShape(name)).toBe(true);
  });
});
