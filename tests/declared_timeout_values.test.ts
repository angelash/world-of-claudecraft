import { describe, expect, it } from 'vitest';
import { declaredTimeouts } from './helpers/declared_timeouts';

describe('declared platform timeout values', () => {
  it.each([
    ["it('x', () => {}, process.platform === 'win32' ? 240_000 : 20_000)", [240_000]],
    ['it("x", () => {}, process.platform === "win32" ? 20_000 : 240_000)', [240_000]],
    ["beforeAll(() => {}, process.platform === 'win32' ? 90_000 : 30_000)", [90_000]],
    ["it.each([1])('x', () => {}, process.platform === 'win32' ? 240_000 : 20_000)", [240_000]],
    ["it('x', { timeout: process.platform === 'win32' ? 240_000 : 30_000 }, () => {})", [240_000]],
    [
      "vi.setConfig({ testTimeout: process.platform === 'win32' ? 240_000 : 30_000, hookTimeout: process.platform === 'win32' ? 30_000 : 90_000 })",
      [240_000, 90_000],
    ],
    [
      "const STUDIO_IO_TIMEOUT = process.platform === 'win32' ? 90_000 : 30_000; it('x', () => {}, STUDIO_IO_TIMEOUT)",
      [90_000],
    ],
    [
      'const TEST_TIMEOUT_MS = FULL_SWEEP ? 480_000 : 200_000; it("x", () => {}, TEST_TIMEOUT_MS)',
      [200_000],
    ],
    ["it(\n'x',\n() => {},\nprocess.platform === 'win32' ? 240_000 : 20_000,\n)", [240_000]],
    ['it(\n"x",\n() => {},\n60_000, // trailing comment\n)', [60_000]],
    ['const BUDGET = 60_000; beforeAll(\n() => {},\nBUDGET,\n)', [60_000]],
    ['test.each([1])(\n"x",\n() => {},\n60_000,\n)', [60_000]],
    ['it("x", () => {}, FULL_SWEEP ? 480_000 : 40_000)', [40_000]],
    [
      "it('x', () => {}, FULL_SWEEP ? 900_000 : process.platform === 'win32' ? 600_000 : 360_000)",
      [600_000],
    ],
    [
      'beforeAll(() => {}, FULL_SWEEP ? 1_800_000 : process.platform === "win32" ? 300_000 : 480_000)',
      [480_000],
    ],
    [
      "const BUDGET = FULL_SWEEP ? 480_000 : process.platform === 'win32' ? 480_000 : 300_000; it(\n'x',\n() => {},\nBUDGET,\n)",
      [480_000],
    ],
  ])('sizes the complete registration in %s', (source, expected) => {
    const parsed = declaredTimeouts(source as string);
    expect(parsed.perTest).toEqual(expected);
    expect(parsed.unparsed).toEqual([]);
  });

  it.each([
    "it('x', () => {}, process.platform === 'win32' ? MISSING : 30_000)",
    "it('x', () => {}, runtime === 'production' ? 240_000 : 30_000)",
    "it('x', { timeout: process.platform === 'linux' ? 240_000 : 30_000 }, () => {})",
    'import { BUDGET } from "./other"; it(\n"x",\n() => {},\nBUDGET,\n)',
    'vi.setConfig({ timeout: UNKNOWN + 30_000 })',
    'const BUDGET = 30_000\n * 100; it("x", () => {}, BUDGET)',
    'it("x", ctx => {}, importedBudget)',
    'beforeAll(seed, importedBudget)',
    'const BUDGET = 30_000; const cfg = { BUDGET: 900_000 }; it("x", () => {}, cfg.BUDGET)',
    'import { BUDGET } from "./other"; function unused() { const BUDGET = 30_000; } it("x", () => {}, BUDGET)',
    'const BUDGET = 30_000; describe("inner", () => { const BUDGET = 900_000; it("x", () => {}, BUDGET); })',
    'function unused() { const BUDGET = 30_000; } it("x", () => {}, BUDGET)',
    'const BUDGET = 30_000; function register(BUDGET = 900_000) { it("x", () => {}, BUDGET); } register();',
    'const BUDGET = 30_000; describe("inner", () => { let BUDGET = 900_000; it("x", () => {}, BUDGET); })',
    "it('x', () => {}, FULL_SWEEP ? MISSING : process.platform === 'win32' ? 600_000 : 360_000)",
    "it('x', () => {}, FULL_SWEEP ? 900_000 : process.platform === 'linux' ? 600_000 : 360_000)",
    "it('x', () => {}, FULL_SWEEP ? 900_000 : process.platform === 'win32' ? MISSING : 360_000)",
    "it('x', () => {}, FULL_SWEEP ? 900_000 : process.platform === 'win32' ? 600_000 : 360_000 + 1)",
    "it('x', () => {}, OTHER_FLAG ? 900_000 : process.platform === 'win32' ? 600_000 : 360_000)",
    "it('x', () => {}, process.platform === 'win32' ? 600_000 : FULL_SWEEP ? 900_000 : 360_000)",
  ])('refuses an unresolved or unsupported timeout in %s', (source) => {
    const parsed = declaredTimeouts(source);
    expect(parsed.perTest).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });

  it('ignores quoted and commented registrations, nested fixtures and subprocess deadlines', () => {
    const source = [
      "const fake = \"it('x', () => {}, process.platform === 'win32' ? 240_000 : 30_000)\";",
      '// it("x", () => {}, 240_000)',
      '/* beforeAll(() => {}, 240_000) */',
      'spawnSync("tool", [], { timeout: 240_000 });',
      'it("real", () => { const fixture = { timeout: 240_000 }; })',
      'vi.setConfig({ fixture: { timeout: 240_000 } })',
    ].join('\n');
    expect(declaredTimeouts(source)).toEqual({ perTest: [], sum: 0, unparsed: [] });
  });
});
