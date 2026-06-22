import { describe, expect, it } from 'vitest';
import { formatAuraDuration } from '../src/ui/aura_duration';

describe('formatAuraDuration', () => {
  it('shows minutes and zero-padded seconds for short auras', () => {
    expect(formatAuraDuration(9)).toBe('0:09');
    expect(formatAuraDuration(65)).toBe('1:05');
  });

  it('rounds up fractional remaining seconds', () => {
    expect(formatAuraDuration(0.1)).toBe('0:01');
    expect(formatAuraDuration(59.1)).toBe('1:00');
  });

  it('shows hours once the aura reaches one hour', () => {
    expect(formatAuraDuration(3600)).toBe('1:00:00');
    expect(formatAuraDuration(3723)).toBe('1:02:03');
  });

  it('hides invalid or expired durations', () => {
    expect(formatAuraDuration(0)).toBe('');
    expect(formatAuraDuration(-5)).toBe('');
    expect(formatAuraDuration(Number.POSITIVE_INFINITY)).toBe('');
  });
});
