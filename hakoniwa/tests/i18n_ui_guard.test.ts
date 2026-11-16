// Interface text guard (D-077, PK-M0-15; release_engineering.md 8.4 step 7, implementation
// conventions 8): the client and the shared interface code hold no Chinese text of their own.
// Every interface string lives in locales/zh-Hans/ui.json and renders through t('ui...').
// - a ratchet on CJK literals (strings, templates, regular expressions) in src/client and
//   src/shared_ui, ceiling 0 for both, over the listed exceptions only: detectors (regular
//   expressions that read text, never display it), the pseudo-locale's own marks, and the
//   dev-only client sandbox world (fixture content built in code, never in a shipped build);
// - the client no longer reads a T table: no src/shared_ui/text*.ts module exists and no
//   file imports one;
// - ui.json keys sit in the ui. scope with the element classes of ux_and_onboarding.md 20.2
//   (scr, set, hud, ovl, win, mode, pop, plus common, glossary, loading).
// The editor (src/editor/) is out of scope: editor and content-pack field labels are not
// localized (release_engineering.md 8.4).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanLiterals } from '../tools/i18n/scan_literals';

const ROOT = join(__dirname, '..');
const SCOPES = ['src/client', 'src/shared_ui'];

/**
 * CJK literals allowed in the scoped directories, by file and symbol: none of them is shown
 * to the player as written. Matching is on file plus enclosing symbol, so a new literal in
 * one of these files still trips the ratchet.
 */
const ALLOWED: readonly { file: string; symbol: string; why: string }[] = [
  {
    file: 'src/client/render/bubbles.ts',
    symbol: 'SENTENCE_END',
    why: 'detector: full-width sentence ends split a bubble line',
  },
  {
    file: 'src/client/windows/strategy_model.ts',
    symbol: 'shortName',
    why: 'detector: a full-width parenthesis starts a province note',
  },
  { file: 'src/shared_ui/pseudo.ts', symbol: 'PSEUDO_OPEN', why: 'pseudo-locale mark (20.6)' },
  { file: 'src/shared_ui/pseudo.ts', symbol: 'PSEUDO_CLOSE', why: 'pseudo-locale mark (20.6)' },
];

/** The dev-only sandbox world (main.ts loads it only in dev mode with ?sandbox=1). */
const DEV_FIXTURE_FILES = ['src/client/app/sandbox.ts'];

const UI_CLASSES = [
  'scr',
  'set',
  'hud',
  'ovl',
  'win',
  'mode',
  'pop',
  'common',
  'glossary',
  'loading',
];

describe('interface CJK literal ratchet', () => {
  const hits = scanLiterals(ROOT, SCOPES, DEV_FIXTURE_FILES);
  const unexpected = hits.filter(
    (h) => !ALLOWED.some((a) => a.file === h.file && a.symbol === h.symbol),
  );

  it('src/client and src/shared_ui hold no Chinese literal outside the listed exceptions', () => {
    const sample = unexpected
      .slice(0, 10)
      .map((h) => `${h.file}:${h.line} ${h.symbol} ${h.text}`)
      .join('\n');
    expect(unexpected.length, `interface CJK literals, for example:\n${sample}`).toBe(0);
  });

  it('every listed exception still matches a literal (no stale entries)', () => {
    const stale = ALLOWED.filter(
      (a) => !hits.some((h) => h.file === a.file && h.symbol === a.symbol),
    );
    expect(stale).toEqual([]);
  });

  it('the dev sandbox is loaded only by dev builds', () => {
    const main = readFileSync(join(ROOT, 'src/client/app/main.ts'), 'utf8');
    const loads = [...main.matchAll(/import\('\.\/sandbox'\)/g)].length;
    expect(loads).toBeGreaterThan(0);
    const guarded = [
      ...main.matchAll(
        /import\.meta\.env\.DEV && config\.sandbox\)\s*\{\s*const \{[^}]+\} = await import\('\.\/sandbox'\)/g,
      ),
    ].length;
    expect(guarded).toBe(loads);
  });
});

describe('the interface text table', () => {
  it('replaced the T tables: no src/shared_ui/text*.ts module and no import of one', () => {
    for (const f of ['text.ts', 'text_play.ts', 'text_battle.ts', 'text_strategy.ts']) {
      expect(existsSync(join(ROOT, 'src/shared_ui', f)), f).toBe(false);
    }
  });

  it('keeps ui.json in the ui. scope, sorted, with the 20.2 element classes', () => {
    const raw = readFileSync(join(ROOT, 'locales/zh-Hans/ui.json'), 'utf8');
    const table = JSON.parse(raw) as Record<string, string>;
    const keys = Object.keys(table);
    expect(keys.length).toBeGreaterThan(700);
    expect(keys).toEqual([...keys].sort());
    for (const k of keys) {
      const cls = k.split('.')[1] as string;
      expect(k.startsWith('ui.'), k).toBe(true);
      expect(UI_CLASSES, k).toContain(cls);
    }
  });
});
