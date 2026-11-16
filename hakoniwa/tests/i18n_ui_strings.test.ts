// UI string tables, content text and pseudo-localization (PK-M0-15; release_engineering.md
// 8.2, 8.3, 8.6, 8.7; ux_and_onboarding.md 20.2, 20.3, 20.6, 23.1 M0 row): the content
// extractor's keys and the generated table's freshness, t() with keys and parameters, tc(),
// the qps-wide pseudo table (every source string wrapped, placeholders intact, Han widened),
// the dev missing-text marks, the text check (missing, unused, placeholder parity, length,
// forbidden characters) and the translation export filter.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { contentKey, contentRef, contentText } from '../src/core/content_key';
import { tr } from '../src/core/text';
import { TEXT_KEY_COUNT } from '../src/core/text_keys.generated';
import {
  contentKeySegment,
  contentTableKey,
  extractContentText,
  isSourceOnlyContentKey,
} from '../src/shared_ui/content_text';
import {
  contentTextLookup,
  formatText,
  GENERATED_CONTENT_TABLE,
  hasText,
  PSEUDO_LANG,
  PSEUDO_TABLE,
  SOURCE_LANG,
  SOURCE_TABLE,
  setContentText,
  setTextLanguage,
  t,
  tc,
  textLanguage,
  tOr,
} from '../src/shared_ui/i18n';
import { missingTextMarks } from '../src/shared_ui/missing_marks';
import { isPseudoText, pseudoTemplate } from '../src/shared_ui/pseudo';
import {
  checkText,
  displayLength,
  exportableKeys,
  inFamily,
  isSourceOnlyKey,
  placeholderNames,
  scanKeyUses,
} from '../tools/i18n/text_check';

const ROOT = join(__dirname, '..');

describe('content keys (D-087)', () => {
  it('builds c.<table>.<id>.<field>[.<n>] in key form', () => {
    expect(contentKey('items', 'eq_ash_blade', 'name')).toBe('c.items.eq_ash_blade.name');
    expect(contentKey('npcResidents', 'smith', 'name')).toBe('c.npc_residents.smith.name');
    expect(contentKey('lore', 'M01-C01', 'text')).toBe('c.lore.m01_c01.text');
    expect(contentKey('monsters', 'm', 'mechanics.yieldSay')).toBe(
      'c.monsters.m.mechanics.yield_say',
    );
    expect(contentKey('scenes', 's', 'lines', 2)).toBe('c.scenes.s.lines.2');
    expect(contentTableKey('battle_scenarios')).toBe('battle_scenarios');
    expect(contentKeySegment('feat.kill')).toBe('feat_kill');
  });

  it('refers to a content field, falling back for a missing record', () => {
    expect(contentRef('markets', 'm1', 'name')).toEqual({ key: 'c.markets.m1.name' });
    expect(contentText('markets', { id: 'm1', name: '集市' } as never)).toEqual({
      key: 'c.markets.m1.name',
    });
    expect(contentText('markets', undefined, 'm1')).toBe('m1');
    expect(contentText('quests', { id: 'q', title: '' } as never, 'x', 'title')).toBe('');
  });
});

describe('content text extraction (release_engineering.md 8.3)', () => {
  const content = buildContent();
  const { table, problems } = extractContentText(content);

  it('extracts every Chinese display field with a unique key and no fold collisions', () => {
    expect(problems).toEqual([]);
    expect(Object.keys(table).length).toBeGreaterThan(5000);
    for (const k of Object.keys(table)) expect(k, k).toMatch(/^c\.[a-z0-9_]+(\.[a-z0-9_]+){2,}$/);
    const item = content.items[0] as { id: string; name: string };
    expect(table[contentKey('items', item.id, 'name')]).toBe(item.name);
  });

  it('leaves out matching words, tags and conditions', () => {
    expect(Object.keys(table).some((k) => k.startsWith('c.terms.') && k.endsWith('.term'))).toBe(
      false,
    );
    expect(Object.keys(table).some((k) => k.startsWith('c.registry.'))).toBe(false);
    expect(Object.keys(table).some((k) => /\.keywords\./.test(k))).toBe(false);
  });

  it('keys list items by id when they all have one, else by position', () => {
    const r = extractContentText({
      t: [
        {
          id: 'a',
          opts: [
            { id: 'x', label: '甲' },
            { id: 'y', label: '乙' },
          ],
          lines: ['丙', '丁'],
        },
      ],
    });
    expect(r.table).toEqual({
      'c.t.a.lines.0': '丙',
      'c.t.a.lines.1': '丁',
      'c.t.a.opts.x.label': '甲',
      'c.t.a.opts.y.label': '乙',
    });
  });

  it('is current: content.generated.json equals a fresh extraction', () => {
    const file = JSON.parse(
      readFileSync(join(ROOT, 'locales/zh-Hans/content.generated.json'), 'utf8'),
    ) as Record<string, string>;
    expect(file).toEqual(table);
    expect(GENERATED_CONTENT_TABLE).toEqual(table);
  });

  it('marks prompt-only content fields as source-only', () => {
    expect(isSourceOnlyContentKey('c.goddesses.eluen.voice.0')).toBe(true);
    expect(isSourceOnlyContentKey('c.npcs.ron.secrets.1')).toBe(true);
    expect(isSourceOnlyContentKey('c.npcs.ron.name')).toBe(false);
    expect(isSourceOnlyContentKey('c.items.eq.name')).toBe(false);
  });
});

describe('t, tc and tOr (ux_and_onboarding.md 20.3)', () => {
  it('renders ui keys, with and without parameters', () => {
    expect(t('ui.common.game_title')).toBe('箱庭纪');
    expect(t('ui.win.inventory.requires_level', { level: 3 })).toBe('需要等级 3');
    expect(t(tr('ui.hud.log.level_up', { level: 7 }))).toBe('你升到了 7 级');
  });

  it('passes plain text and numbers through, and reports a missing key by name', () => {
    expect(t('普通的话')).toBe('普通的话');
    expect(t(12)).toBe('12');
    expect(formatText({ key: 'ui.no.such' }, { table: SOURCE_TABLE, lang: SOURCE_LANG })).toBe(
      'ui.no.such',
    );
  });

  it('resolves content keys from the generated table, the live lookup first', () => {
    const item = buildContent().items[0] as { id: string; name: string };
    setContentText(null);
    expect(tc('items', item.id, 'name')).toBe(item.name);
    expect(t(contentRef('items', item.id, 'name'))).toBe(item.name);
    setContentText(contentTextLookup({ items: [{ id: item.id, name: '换过的名字' }] }));
    expect(tc('items', item.id, 'name')).toBe('换过的名字');
    setContentText(null);
  });

  it('falls back for data-completed keys only when no table has them', () => {
    expect(tOr('ui.win.battle.formations.line', 'x')).toBe('横阵');
    const unknown: string = 'no_such';
    expect(tOr(`ui.win.battle.formations.${unknown}`, unknown)).toBe('no_such');
    // @ts-expect-error a literal that names no key fails the type check (release_engineering 8.2)
    expect(tOr('ui.win.battle.formations.no_such', 'x')).toBe('x');
    expect(hasText('ui.win.battle.formations.line')).toBe(true);
    expect(hasText('ui.win.battle.formations.nope')).toBe(false);
  });

  it('generated key types cover ui.json and the sys tables', () => {
    const ui = JSON.parse(readFileSync(join(ROOT, 'locales/zh-Hans/ui.json'), 'utf8'));
    expect(TEXT_KEY_COUNT).toBe(Object.keys(SOURCE_TABLE).length);
    expect(Object.keys(ui).every((k) => k in SOURCE_TABLE)).toBe(true);
  });
});

describe('pseudo-localization qps-wide (20.6)', () => {
  it('wraps the whole string, widens Han characters, keeps placeholders and digits', () => {
    const p = pseudoTemplate('需要等级 {level}');
    expect(isPseudoText(p)).toBe(true);
    expect(p).toContain('{level}');
    expect(p).not.toMatch(/[一-鿿]/);
    // two letters per Han character, so the string grows
    expect(p.length).toBeGreaterThan('需要等级 {level}'.length + 4);
    expect(pseudoTemplate('{n, plural, one {# 天} other {# 天}}')).toMatch(
      /^【\{n, plural, one \{# .{2}\} other \{# .{2}\}\}】$/,
    );
    expect(pseudoTemplate('')).toBe('');
  });

  it('has a pseudo entry for every source key, and renders with the same parameters', () => {
    expect(Object.keys(PSEUDO_TABLE).sort()).toEqual(Object.keys(SOURCE_TABLE).sort());
    const o = { table: PSEUDO_TABLE, fallback: SOURCE_TABLE, lang: PSEUDO_LANG };
    const out = formatText({ key: 'ui.win.inventory.requires_level', params: { level: 3 } }, o);
    expect(isPseudoText(out)).toBe(true);
    expect(out).toContain('3');
    // list joiners keep their source value
    expect(PSEUDO_TABLE['sys.common.join.comma']).toBe(SOURCE_TABLE['sys.common.join.comma']);
  });

  it('is a selectable language in dev builds, and renders content text pseudo too', () => {
    setTextLanguage(PSEUDO_LANG);
    expect(textLanguage()).toBe(PSEUDO_LANG);
    expect(isPseudoText(t('ui.common.game_title'))).toBe(true);
    const item = buildContent().items[0] as { id: string };
    expect(isPseudoText(tc('items', item.id, 'name'))).toBe(true);
    setTextLanguage(SOURCE_LANG);
    expect(t('ui.common.game_title')).toBe('箱庭纪');
  });
});

describe('dev missing-text marks (20.3)', () => {
  it('finds unfilled placeholders and keys shown as themselves', () => {
    expect(missingTextMarks('需要等级 {level}')).toEqual([{ start: 5, end: 12, kind: 'param' }]);
    expect(missingTextMarks('ui.win.x.title 与 {n, number}')).toEqual([
      { start: 0, end: 14, kind: 'key' },
      { start: 17, end: 28, kind: 'param' },
    ]);
    expect(missingTextMarks('一切正常 3/5')).toEqual([]);
  });
});

describe('text check (8.7 step 4, 23.2)', () => {
  const tables = {
    'zh-Hans': {
      'ui.win.a.title': '标题',
      'ui.win.a.empty_state': '还没有 {n} 件',
      'ui.win.b.title': '一个很长很长的窗口标题',
      'sys.x.prompt.y': '题面',
      'ui.dead.key': '没人用',
    },
    en: { 'ui.win.a.empty_state': 'none of {count}' },
  };
  const uses = [
    ...scanKeyUses('a.ts', "t('ui.win.a.title'); t('ui.win.missing');"),
    ...scanKeyUses('b.ts', "t(`ui.win.${id}.empty_state`); tr('sys.x.prompt.y');"),
    ...scanKeyUses('c.ts', "// t('ui.dead.key') in a comment is not a use\nt('ui.win.b.title')"),
  ];

  it('scans literal keys and families, never comments', () => {
    expect(uses.map((u) => [u.key, !!u.prefix])).toEqual([
      ['ui.win.a.title', false],
      ['ui.win.missing', false],
      ['sys.x.prompt.y', false],
      ['ui.win.*.empty_state', true],
      ['ui.win.b.title', false],
    ]);
    expect(inFamily('ui.win.a.empty_state', 'ui.win.*.empty_state')).toBe(true);
    expect(inFamily('ui.win.a.title', 'ui.win.*.empty_state')).toBe(false);
  });

  it('reports missing, unused, placeholder drift and over-long titles', () => {
    const f = checkText({ source: 'zh-Hans', tables, uses });
    expect(f.map((x) => [x.code, x.key, x.where])).toEqual([
      ['missing_key', 'ui.win.missing', 'a.ts:1'],
      ['placeholder', 'ui.win.a.empty_state', 'en'],
      ['too_long', 'ui.win.b.title', 'zh-Hans'],
      ['unused_key', 'ui.dead.key', 'zh-Hans'],
    ]);
    expect(placeholderNames('{a}{b, number}{c, plural, one {# x} other {# y}}')).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(displayLength('需要等级 {level}')).toBe(4 + 0.5 + 1);
  });

  it('flags forbidden characters', () => {
    const bad = String.fromCharCode(0x2014);
    const f = checkText({
      source: 'zh-Hans',
      tables: { 'zh-Hans': { 'ui.a.b': `x${bad}y` } },
      uses: [],
    });
    expect(f.map((x) => x.code)).toContain('forbidden_char');
  });

  it('keeps prompt keys out of translation export (8.6)', () => {
    expect(isSourceOnlyKey('sys.npc.prompt.persona_intro')).toBe(true);
    expect(isSourceOnlyKey('sys.npc.reject.busy')).toBe(false);
    expect(exportableKeys(tables['zh-Hans'])).toEqual([
      'ui.dead.key',
      'ui.win.a.empty_state',
      'ui.win.a.title',
      'ui.win.b.title',
    ]);
    const real = exportableKeys(SOURCE_TABLE);
    expect(real.some((k) => /^sys\.[a-z_]+\.prompt\./.test(k))).toBe(false);
    // the HUD interaction prompt bar (ui_hud_prompt) is player text and is exported
    expect(real).toContain('ui.hud.prompt.talk');
    expect(Object.keys(SOURCE_TABLE).some((k) => /^sys\.[a-z]+\.prompt\./.test(k))).toBe(true);
    // content fields only the prompts read stay out of the content table's export
    const content = exportableKeys(GENERATED_CONTENT_TABLE, isSourceOnlyContentKey);
    expect(content.some((k) => k.startsWith('c.npcs.') && k.includes('.secrets.'))).toBe(false);
    expect(content.some((k) => k.startsWith('c.goddesses.') && k.includes('.voice.'))).toBe(false);
    expect(content).toContain('c.npcs.ron.name');
    expect(content.length).toBeLessThan(Object.keys(GENERATED_CONTENT_TABLE).length);
  });
});

describe('kernel content names travel as content keys (D-087)', () => {
  it('renders a switched parameter exactly as the display name it replaced', () => {
    const content = buildContent();
    setContentText(contentTextLookup(content));
    const building = content.city_buildings[0] as { id: string; name: string };
    const ref = tr('sys.city.info.build_started', {
      building: contentText('city_buildings', building),
    });
    const before = tr('sys.city.info.build_started', { building: building.name });
    expect(t(ref)).toBe(t(before));
    // a missing record falls back to the id, as the old `?.name ?? id` did
    expect(
      t(
        tr('sys.city.reject.need_building', {
          building: contentText('city_buildings', undefined, 'gone'),
        }),
      ),
    ).toBe(t(tr('sys.city.reject.need_building', { building: 'gone' })));
    setContentText(null);
  });
});
