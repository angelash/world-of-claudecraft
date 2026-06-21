import { describe, expect, it } from 'vitest';
import { localPetCommandIntent, normalizePetCommandText } from '../server/ai/life_layer';

describe('AI pet command routing', () => {
  it('normalizes noisy player pet command text', () => {
    expect(normalizePetCommandText('  stay    close   ')).toBe('stay close');
  });

  it('maps natural-language commands onto bounded existing pet intents', () => {
    expect(localPetCommandIntent('hold back and stop fighting')).toBe('commandPetPassive');
    expect(localPetCommandIntent('protect me')).toBe('commandPetDefensive');
    expect(localPetCommandIntent('hunt freely')).toBe('commandPetAggressive');
    expect(localPetCommandIntent('sic my target')).toBe('commandPetAttack');
    expect(localPetCommandIntent('growl and hold threat')).toBe('commandPetTaunt');
  });

  it('understands Chinese pet command phrasing without adding new sim actions', () => {
    expect(localPetCommandIntent('回来, 别打了')).toBe('commandPetPassive');
    expect(localPetCommandIntent('保护我')).toBe('commandPetDefensive');
    expect(localPetCommandIntent('自由攻击')).toBe('commandPetAggressive');
    expect(localPetCommandIntent('上去打它')).toBe('commandPetAttack');
    expect(localPetCommandIntent('拉住仇恨')).toBe('commandPetTaunt');
  });

  it('ignores unclear requests instead of inventing new pet behavior', () => {
    expect(localPetCommandIntent('look majestic under the stars')).toBe('commandPetIgnore');
  });
});
