// TextRef core and renderer (D-077, D-087; PK-M0-14): src/core/text.ts builds text values
// without ever reading a table; src/shared_ui/i18n.ts renders them per ux_and_onboarding.md
// 20.3 (plain, number, percent, money, date, duration, nested refs, plural, select, joins,
// clips), leaves a missing parameter as its placeholder and reports it.

import { describe, expect, it } from 'vitest';
import {
  clipText,
  commandText,
  isTextRef,
  joinText,
  rawText,
  SOURCE_LANG,
  textEquals,
  tr,
} from '../src/core/text';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR, tickAtDay } from '../src/core/time';
import {
  contentTextLookup,
  formatText,
  type MissingText,
  renderTextDeep,
  SOURCE_TABLE,
} from '../src/shared_ui/i18n';

const table = {
  ...SOURCE_TABLE,
  'sys.test.plain': '{who}在{place}',
  'sys.test.num': '{n, number}',
  'sys.test.pct': '{p, percent}',
  'sys.test.money': '花了 {m, money}',
  'sys.test.date': '{d, date}',
  'sys.test.date_short': '{d, date, short}',
  'sys.test.dur': '{t, duration}',
  'sys.test.plural': '{n, plural, one {# day} other {# days}}',
  'sys.test.select': '{g, select, f {她} m {他} other {对方}}',
  'sys.test.brace': '数据：{ id: "{id}", text }',
};
const render = (v: Parameters<typeof formatText>[0], missing?: (m: MissingText) => void) =>
  formatText(v, { table, lang: SOURCE_LANG, missing });

describe('src/core/text.ts', () => {
  it('builds key refs, raw text, joins and clips as plain data', () => {
    expect(tr('sys.a.b')).toEqual({ key: 'sys.a.b' });
    expect(tr('sys.a.b', { n: 1 })).toEqual({ key: 'sys.a.b', params: { n: 1 } });
    expect(rawText('hi', 'en')).toEqual({ raw: 'hi', lang: 'en' });
    expect(rawText('嗯')).toEqual({ raw: '嗯', lang: 'zh-Hans' });
    expect(joinText('list', ['a', tr('sys.x.y')])).toEqual({
      key: 'sys.common.join.list',
      params: { 0: 'a', 1: { key: 'sys.x.y' } },
    });
    expect(clipText('abcdef', 3)).toBe('abc');
    expect(clipText(tr('sys.x.y'), 3)).toEqual({
      key: 'sys.common.clip',
      params: { text: { key: 'sys.x.y' }, n: 3 },
    });
  });

  it('recognises only scoped keys and raw text as TextRefs', () => {
    expect(isTextRef(tr('sys.a.b'))).toBe(true);
    expect(isTextRef({ key: 'c.items.x.name' })).toBe(true);
    expect(isTextRef(rawText('x'))).toBe(true);
    expect(isTextRef({ key: 'seal_looseness' })).toBe(false);
    expect(isTextRef({ key: 'sys.a.b', value: 1 })).toBe(false);
    expect(isTextRef('sys.a.b')).toBe(false);
    expect(isTextRef([tr('sys.a.b')])).toBe(false);
  });

  it('compares text structurally, so a save round trip keeps equal texts equal', () => {
    const a = tr('sys.a.b', { who: tr('sys.c.d'), n: 2 });
    const b = JSON.parse(JSON.stringify(a));
    expect(a === b).toBe(false);
    expect(textEquals(a, b)).toBe(true);
    expect(textEquals(a, tr('sys.a.b', { who: tr('sys.c.e'), n: 2 }))).toBe(false);
    expect(textEquals('x', 'x')).toBe(true);
    expect(textEquals(rawText('x'), rawText('x', 'en'))).toBe(false);
  });

  it('reads command text: model words become raw text, model TextRefs are refused', () => {
    const clean = (s: string) => s.trim().slice(0, 4);
    expect(commandText('  hello world ', true, clean)).toEqual(rawText('hell'));
    expect(commandText('  hello ', false, clean)).toBe('hell');
    expect(commandText(tr('sys.a.b'), true, clean)).toBe('');
    expect(commandText(tr('sys.a.b'), false, clean)).toEqual(tr('sys.a.b'));
    expect(commandText(tr('sys.a.b'), false, clean, 4)).toEqual(clipText(tr('sys.a.b'), 4));
    expect(commandText({ key: 'not_scoped' }, false, clean)).toBe('');
    expect(commandText(42, false, clean)).toBe('');
    expect(commandText('   ', true, clean)).toBe('');
  });
});

describe('src/shared_ui/i18n.ts formatText', () => {
  it('fills plain and nested parameters', () => {
    expect(
      render(tr('sys.test.plain', { who: tr('sys.test.select', { g: 'f' }), place: '边石镇' })),
    ).toBe('她在边石镇');
  });

  it('formats typed parameters (20.3)', () => {
    expect(render(tr('sys.test.num', { n: 12000 }))).toBe('12,000');
    expect(render(tr('sys.test.pct', { p: 0.25 }))).toBe('25%');
    expect(render(tr('sys.test.money', { m: 12345 }))).toBe('花了 1 金 23 银 45 铜');
    expect(render(tr('sys.test.date', { d: tickAtDay(0, 8) }))).toBe('圣历 998 年 春 第 1 日');
    expect(render(tr('sys.test.date_short', { d: tickAtDay(8, 8, 48) }))).toBe('春 9 日 08:48');
    expect(
      render(tr('sys.test.dur', { t: 2 * TICKS_PER_GAME_DAY + 3 * TICKS_PER_GAME_HOUR })),
    ).toBe('2 天 3 小时');
    // plural categories follow the language: Chinese has only 'other', English has 'one'
    expect(render(tr('sys.test.plural', { n: 1 }))).toBe('1 days');
    expect(formatText(tr('sys.test.plural', { n: 1 }), { table, lang: 'en' })).toBe('1 day');
    expect(render(tr('sys.test.plural', { n: 3 }))).toBe('3 days');
    expect(render(tr('sys.test.select', { g: 'x' }))).toBe('对方');
  });

  it('keeps braces that open no placeholder as written', () => {
    expect(render(tr('sys.test.brace', { id: 'a1' }))).toBe('数据：{ id: "a1", text }');
  });

  it('leaves a missing parameter as its placeholder and reports it', () => {
    const seen: MissingText[] = [];
    expect(render(tr('sys.test.plain', { who: '你' }), (m) => seen.push(m))).toBe('你在{place}');
    expect(seen).toEqual([{ kind: 'param', key: 'sys.test.plain', param: 'place' }]);
  });

  it('renders a missing key as the key and reports it', () => {
    const seen: MissingText[] = [];
    expect(render(tr('sys.test.none'), (m) => seen.push(m))).toBe('sys.test.none');
    expect(seen).toEqual([{ kind: 'key', key: 'sys.test.none' }]);
  });

  it('joins, clips and resolves content keys', () => {
    expect(render(joinText('comma', ['甲', tr('sys.test.select', { g: 'm' })]))).toBe('甲，他');
    expect(render(clipText(tr('sys.test.plain', { who: '一二三', place: '四五' }), 4))).toBe(
      '一二三在',
    );
    const lookup = contentTextLookup({
      items: [{ id: 'eq_blade', name: '灰刃', lines: ['甲', '乙'] }],
    });
    const o = { table, lang: SOURCE_LANG, content: lookup };
    expect(formatText({ key: 'c.items.eq_blade.name' }, o)).toBe('灰刃');
    expect(formatText({ key: 'c.items.eq_blade.lines.1' }, o)).toBe('乙');
  });

  it('never throws on malformed text data', () => {
    expect(
      render({ key: 'sys.test.plain', params: { who: {} as never, place: [] as never } }),
    ).toBe('在');
  });

  it('renders nested data deeply for prompts', () => {
    expect(
      renderTextDeep({ a: [tr('sys.common.join.list', { 0: 'x', 1: 'y' })], b: { key: 'id' } }),
    ).toEqual({ a: ['x、y'], b: { key: 'id' } });
  });
});
