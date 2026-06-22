import { describe, expect, it } from 'vitest';
import { normalizePetCommandText } from '../server/ai/life_layer';

describe('AI pet command routing', () => {
  it('normalizes noisy player pet command text', () => {
    expect(normalizePetCommandText('  stay    close   ')).toBe('stay close');
  });
});
