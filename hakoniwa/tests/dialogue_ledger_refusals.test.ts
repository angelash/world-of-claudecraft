// The per-clue ledger refusals and the low-confidence rule (PK-M1-29; builtin_ai.md 6.6;
// reveal_ledger.md 0.2 rule 3): a locked clue the player names in free text is answered by
// that clue's "解锁前处理" for the speakers the ledger names (deny, evade, mis, unknown,
// hint), by the row default (evade) for another listed knower, and as nonsense by anyone
// else; a misdirection is the speaker's `mis` version of a topic tied to the clue or its
// MIS number. Words the classifier did not understand that still name a locked clue are
// answered "not known" and go to the audit as a suspected spoiler.

import { describe, expect, it } from 'vitest';
import { validateDialogueContent } from '../src/content/packs/dialogue';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import { currentConversation } from '../src/systems/dialogue';
import { classifyIntent } from '../src/systems/dialogue/intent/classify';
import {
  clueRefusal,
  type LedgerRefusalRow,
  ledgerRefusalProblems,
} from '../src/systems/dialogue/topics/ledger';
import type { LoreDef } from '../src/systems/goddess/types';
import { collect, FULL, game, keyOf, talkTo, withPacks } from './dialogue_topics_harness';

/** M01-C01 (the door-shaped mark Eluen saw), locked until the door woman's dream. */
const MARK = '门形的印记';
/** A confident question about it (ask_secret, through the R3 step). */
const ASK_MARK = `你在隐瞒什么？${MARK}到底怎么回事？`;

function withRows(rows: LedgerRefusalRow[], base: ContentMap = FULL): ContentMap {
  return { ...base, ledgerRefusals: rows } as ContentMap;
}

function lastNpcLine(g: ReturnType<typeof game>): unknown {
  const conv = currentConversation(g.world);
  return conv?.lines.filter((l) => l.speakerId !== 'player').at(-1)?.text;
}

/** Talk to `who` and say `text`; the key of the reply and the round's events. */
function ask(content: ContentMap, who: string, text: string) {
  const g = game(content);
  const events: AnyWorldEvent[] = collect(g);
  talkTo(g, who);
  g.queue('dialogue.say', { text });
  g.step(2);
  return { key: keyOf(lastNpcLine(g)), events, g };
}

const audits = (events: AnyWorldEvent[]) =>
  events.filter(
    (e) => e.kind === 'dialogue.notified' && (e.data as { notify: string }).notify === 'audit',
  );

describe('clueRefusal (reveal_ledger 0.2 rule 3)', () => {
  const lore = [
    { id: 'X-C01', knowers: ['ron'] },
    { id: 'X-C02', knowers: [] },
  ] as Pick<LoreDef, 'id' | 'knowers'>[];

  it('gives a named speaker the handling the row names, each of the five', () => {
    for (const refusal of ['deny', 'evade', 'mis', 'unknown', 'hint'] as const)
      expect(
        clueRefusal([{ clue: 'X-C02', by: [{ speaker: 'nera', refusal }] }], lore, 'nera'),
      ).toEqual({
        refusal,
        clue: 'X-C02',
      });
  });

  it('gives another listed knower the row default, evade without one, and nonsense to anyone else', () => {
    expect(clueRefusal([{ clue: 'X-C01', by: [], default: 'deny' }], lore, 'ron')).toEqual({
      refusal: 'deny',
      clue: 'X-C01',
    });
    expect(clueRefusal([], lore, 'ron')).toEqual({ refusal: 'evade', clue: 'X-C01' });
    expect(clueRefusal(undefined, lore, 'ron')).toEqual({ refusal: 'evade', clue: 'X-C01' });
    expect(clueRefusal([{ clue: 'X-C01', by: [], default: 'deny' }], lore, 'nera')).toEqual({
      refusal: 'nonsense',
    });
  });

  it('prefers a clue whose row names the speaker over one where he is only a knower', () => {
    const rows: LedgerRefusalRow[] = [{ clue: 'X-C02', by: [{ speaker: 'ron', refusal: 'hint' }] }];
    expect(clueRefusal(rows, lore, 'ron')).toEqual({ refusal: 'hint', clue: 'X-C02' });
  });
});

describe('the shipped table follows the ledger column', () => {
  const row = (clue: string) => FULL.ledgerRefusals.find((r) => r.clue === clue);

  it('pins rows of the act-1 clues and the goddesses', () => {
    expect(row('M01-C02')?.by).toEqual([{ speaker: 'yeyu', refusal: 'unknown' }]);
    expect(row('M01-C05')).toEqual({
      clue: 'M01-C05',
      by: [
        { speaker: 'oola', refusal: 'evade' },
        { speaker: 'cassian', refusal: 'mis' },
      ],
      mis: 'MIS-05',
    });
    expect(row('M01-C01')?.by).toEqual([
      { speaker: 'eluen', refusal: 'deny' },
      { speaker: 'valda', refusal: 'hint' },
      { speaker: 'moira', refusal: 'hint' },
      { speaker: 'merca', refusal: 'evade' },
      { speaker: 'sylvie', refusal: 'evade' },
    ]);
    expect(row('S02-C02')?.by).toEqual([{ speaker: 'martha', refusal: 'evade' }]);
    // "不适用" rows and rows that name only groups (镇民, 教会) have no row
    for (const clue of ['M07-C01', 'M12-C01', 'M05-C02', 'M06-C01'])
      expect(row(clue), clue).toBe(undefined);
  });

  it('passes the content check', () => {
    expect(validateDialogueContent(FULL).filter((p) => p.startsWith('ledger refusal'))).toEqual([]);
  });
});

describe('the table check', () => {
  const lore = [{ id: 'X-C01' }];
  const speakers = new Set(['ron', 'eluen']);

  it('refuses an unknown clue, speaker, refusal, default or misdirection number', () => {
    const bad = (r: Partial<LedgerRefusalRow>) =>
      ledgerRefusalProblems(
        [{ clue: 'X-C01', by: [{ speaker: 'ron', refusal: 'evade' }], ...r }],
        lore,
        speakers,
      );
    expect(bad({})).toEqual([]);
    expect(bad({ clue: 'X-C99' })).toContain('ledger refusal X-C99: no lore row X-C99');
    expect(bad({ by: [{ speaker: 'zz_nobody', refusal: 'evade' }] })).toContain(
      'ledger refusal X-C01: unknown speaker zz_nobody',
    );
    expect(bad({ by: [{ speaker: 'ron', refusal: 'lie' as never }] })).toContainEqual(
      expect.stringContaining('ledger refusal X-C01: ron: refusal lie is not one of'),
    );
    expect(bad({ default: 'shrug' as never })).toContainEqual(
      expect.stringContaining('ledger refusal X-C01: default shrug is not one of'),
    );
    expect(bad({ by: [{ speaker: 'ron', refusal: 'mis' }], mis: 'M-5' })).toContain(
      'ledger refusal X-C01: mis M-5 is not a misdirection number (MIS-xx)',
    );
    expect(bad({ mis: 'MIS-05' })).toContain('ledger refusal X-C01: mis given but nobody misleads');
    expect(bad({ by: [] })).toContain('ledger refusal X-C01: names nobody');
    expect(
      bad({
        by: [
          { speaker: 'ron', refusal: 'evade' },
          { speaker: 'ron', refusal: 'deny' },
        ],
      }),
    ).toContain('ledger refusal X-C01: speaker ron listed twice');
    expect(
      ledgerRefusalProblems(
        [
          { clue: 'X-C01', by: [{ speaker: 'ron', refusal: 'evade' }] },
          { clue: 'X-C01', by: [{ speaker: 'eluen', refusal: 'deny' }] },
        ],
        lore,
        speakers,
      ),
    ).toContain('ledger refusal X-C01: duplicate clue');
  });

  it('runs in the dialogue content check', () => {
    const content = withRows([
      { clue: 'M01-C01', by: [{ speaker: 'zz_nobody', refusal: 'deny' }] },
    ]);
    expect(validateDialogueContent(content)).toContain(
      'ledger refusal M01-C01: unknown speaker zz_nobody',
    );
  });
});

describe('a named locked clue in a talk (6.6)', () => {
  it('the test words name M01-C01 and ask confidently', () => {
    expect(classifyIntent(ASK_MARK, FULL, {}).main).toBe('ask_secret');
    expect(FULL.lore.find((l) => l.id === 'M01-C01')?.keywords).toContain(MARK);
  });

  it('answers by the handling the row names: deny, evade, unknown, hint', () => {
    for (const refusal of ['deny', 'evade', 'unknown', 'hint'] as const) {
      const content = withRows([{ clue: 'M01-C01', by: [{ speaker: 'ron', refusal }] }]);
      const { key, events } = ask(content, 'ron', ASK_MARK);
      expect(key, refusal).toMatch(new RegExp(`\\.slots\\.react_${refusal}\\.`));
      expect(audits(events), refusal).toEqual([]);
    }
  });

  it("applies a row default to everyone when the lore lists no knowers (the ledger's 全体)", () => {
    // M02-C11 "全体：回避": nobody is a listed knower, so the default is everyone's
    const clue = { id: 'M02-C11', knowers: [] };
    const rows: LedgerRefusalRow[] = [{ clue: 'M02-C11', by: [], default: 'evade' }];
    expect(clueRefusal(rows, [clue], 'noi')).toEqual({ refusal: 'evade', clue: 'M02-C11' });
    expect(clueRefusal(rows, [clue], 'ron')).toEqual({ refusal: 'evade', clue: 'M02-C11' });
    // with a knower list the default stays the knowers' and anyone else hears nonsense
    const listed = { id: 'M02-C11', knowers: ['oola'] };
    expect(clueRefusal(rows, [listed], 'ron')).toEqual({ refusal: 'nonsense' });
    // the shipped rows: both 全体 rows reach everyone
    expect(clueRefusal(FULL.ledgerRefusals, [clue], 'noi').refusal).toBe('evade');
  });

  it('gives a listed knower the row default and anyone else nonsense', () => {
    const lore = FULL.lore.map((l) => (l.id === 'M01-C01' ? { ...l, knowers: ['ron'] } : l));
    const knower = {
      ...withRows([{ clue: 'M01-C01', by: [], default: 'deny' }]),
      lore,
    } as ContentMap;
    expect(ask(knower, 'ron', ASK_MARK).key).toMatch(/\.slots\.react_deny\./);
    const plain = { ...withRows([]), lore } as ContentMap;
    expect(ask(plain, 'ron', ASK_MARK).key).toMatch(/\.slots\.react_evade\./);
    expect(ask(FULL, 'ron', ASK_MARK).key).toMatch(/\.slots\.react_nonsense\./);
  });

  it('misleads with the mis version of the topic tied to the MIS number (MIS-05, Cassian)', () => {
    // M01-C05's own topic (secret_oola_children) has no mis line for Cassian, so the row's
    // MIS-05 leads to the branded-mark topic, the first topic of the graph that carries that
    // MIS number, and Cassian's own mis line wins
    const { key, events } = ask(FULL, 'cassian', '你在隐瞒什么？门纹同形到底怎么回事？');
    expect(key).toBe('c.line_packs.ln_cassian.slots.topic_lore_branded.mis.0');
    // said as an answer to the clue, not through the topic path
    expect(events.some((e) => e.kind === 'dialogue.topic')).toBe(false);
  });

  it('evades when the misleading speaker has no mis line for the clue', () => {
    const content = withRows([{ clue: 'M01-C01', by: [{ speaker: 'ron', refusal: 'mis' }] }]);
    expect(ask(content, 'ron', ASK_MARK).key).toMatch(/\.slots\.react_evade\./);
  });
});

describe('low confidence plus a leak signature (6.6 last row)', () => {
  it('answers "not known" and audits a suspected spoiler, even from a knower', () => {
    expect(classifyIntent(MARK, FULL, {}).main).toBe('unknown');
    for (const content of [
      FULL,
      withRows([{ clue: 'M01-C01', by: [{ speaker: 'ron', refusal: 'deny' }] }]),
    ]) {
      const { key, events } = ask(content, 'ron', MARK);
      expect(key).toMatch(/\.slots\.react_unknown\./);
      const a = audits(events);
      expect(a).toHaveLength(1);
      expect(a[0]?.data).toMatchObject({
        npcRef: 'ron',
        notify: 'audit',
        intent: 'unknown',
        reason: 'suspected_spoiler',
        clues: ['M01-C01'],
      });
    }
  });

  it('leaves words that name no clue to the plain misunderstanding, with no audit', () => {
    expect(classifyIntent('门把手的颜色', FULL, {}).main).toBe('unknown');
    const { key, events } = ask(FULL, 'ron', '门把手的颜色');
    expect(key).not.toMatch(/\.slots\.react_unknown\./);
    expect(audits(events)).toEqual([]);
  });
});
