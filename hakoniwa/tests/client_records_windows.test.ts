// The record windows' pure cores (PK-M1-23; ux_and_onboarding.md 6.3.1, 6.3.2, 6.3.8, 6.3.11):
// the deeds book and its stages, the codex and the mortal monster words before the term is
// known (D-030), the letters inbox and the sending tab that waits on the messenger's door, and
// the evidence the player keeps before the court opens. Node, no DOM.

import { describe, expect, it } from 'vitest';
import { doorKeyedDeeds, evidencePage, HISTORY_TAG } from '../src/client/adapters/records';
import type { EvidenceRowView } from '../src/client/view/adapters_records';
import {
  actRank,
  cleanNote,
  codexModel,
  countText,
  deedsModel,
  evidenceModel,
  fameBand,
  LINE_KEYS,
  lettersModel,
  monsterName,
  mortalName,
  NOTE_MAX,
  UNRECORDED_GROUP,
  unreadCount,
  wearTarget,
} from '../src/client/windows/records';
import { contentKey } from '../src/core/content_key';
import { SOURCE_TABLE } from '../src/shared_ui/i18n';
import type { CodexRowView, DeedBookView, LetterView } from '../src/systems/records';

function book(over: Partial<DeedBookView> = {}): DeedBookView {
  return {
    stage: 'carvings',
    deeds: [],
    titles: [],
    fame: 0,
    progress: { earned: 0, of: 0 },
    pillar: { slots: 0, carved: [] },
    ...over,
  };
}

const deed = (
  over: Partial<DeedBookView['deeds'][number]> = {},
): DeedBookView['deeds'][number] => ({
  id: 'deed_grow_first',
  name: { key: contentKey('deeds', 'deed_grow_first', 'name') },
  desc: null,
  cls: 'grow',
  act: 1,
  fame: 5,
  grade: 'witnessed',
  earnedTick: 100,
  branchMissing: false,
  feat: false,
  hidden: false,
  carvable: false,
  ...over,
});

describe('ui_win_deeds (6.3.1)', () => {
  it('files deeds no door keys under the unrecorded group in the carvings stage', () => {
    const b = book({
      stage: 'carvings',
      deeds: [
        deed({ id: 'keyed' }),
        deed({ id: 'loose' }),
        deed({ id: 'loose_un', earnedTick: null, name: null }),
      ],
    });
    const m = deedsModel({ book: b, tab: 'deeds', doorKeyed: new Set(['keyed']) });
    expect(m.groups.map((g) => g.cls)).toEqual(['grow', UNRECORDED_GROUP]);
    expect(m.groups[0]?.rows.map((r) => r.id)).toEqual(['keyed']);
    expect(m.groups[1]?.label).toBe(SOURCE_TABLE['ui.win.deeds.unrecorded']);
    // earned first inside the unrecorded group too
    expect(m.groups[1]?.rows.map((r) => r.id)).toEqual(['loose', 'loose_un']);
    // other stages keep every deed by its class
    const later = deedsModel({
      book: { ...b, stage: 'handbook' },
      tab: 'deeds',
      doorKeyed: new Set(['keyed']),
    });
    expect(later.groups.map((g) => g.cls)).toEqual(['grow']);
    expect(later.groups[0]?.rows).toHaveLength(3);
    // without the key list nothing is moved
    expect(deedsModel({ book: b, tab: 'deeds' }).groups.map((g) => g.cls)).toEqual(['grow']);
  });

  it('is empty only with no earned deed and no visible unearned row', () => {
    const none = deedsModel({ book: book(), tab: 'deeds' });
    expect(none.empty).toBe(SOURCE_TABLE['ui.win.deeds.empty.carvings']);
    expect(none.nothingEarned).toBe('');
    // unearned rows still show: not empty, but the stage sentence says nothing is carved yet
    const waiting = deedsModel({
      book: book({ deeds: [deed({ earnedTick: null, name: null })] }),
      tab: 'deeds',
    });
    expect(waiting.empty).toBe('');
    expect(waiting.nothingEarned).toBe(SOURCE_TABLE['ui.win.deeds.empty.carvings']);
    expect(waiting.groups).toHaveLength(1);
    const earned = deedsModel({ book: book({ deeds: [deed()] }), tab: 'deeds' });
    expect(earned.empty).toBe('');
    expect(earned.nothingEarned).toBe('');
  });

  it('reads the deeds doors take as keys, at any depth and through deed flags', () => {
    const keyed = doorKeyedDeeds([
      { keys: [{ type: 'deed', deed: 'deed_grow_first_stance', label: 'x' }] },
      {
        keys: [
          {
            type: 'any',
            keys: [
              { type: 'flag', key: 'deed.deed_hunt_wolf', label: 'deed.not_a_key' },
              { type: 'item', itemId: 'deed_not_a_deed', label: 'y' },
            ],
          },
        ],
      },
      {},
    ]);
    expect([...keyed].sort()).toEqual(['deed_grow_first_stance', 'deed_hunt_wolf']);
  });

  it('names the book by its stage and keeps the data the same', () => {
    expect(deedsModel({ book: book({ stage: 'carvings' }), tab: 'deeds' }).stageTitle).toBe(
      SOURCE_TABLE['ui.win.deeds.stage.carvings'],
    );
    expect(deedsModel({ book: book({ stage: 'court' }), tab: 'deeds' }).stageTitle).toBe(
      SOURCE_TABLE['ui.win.deeds.stage.court'],
    );
    // the empty state follows the stage too
    expect(deedsModel({ book: book({ stage: 'handbook' }), tab: 'deeds' }).empty).toBe(
      SOURCE_TABLE['ui.win.deeds.empty.handbook'],
    );
  });

  it('leaves an unearned deed nameless and writes a closed branch', () => {
    const m = deedsModel({
      book: book({
        deeds: [
          deed({ id: 'a', earnedTick: null, name: null }),
          deed({ id: 'b', earnedTick: null, name: null, branchMissing: true }),
        ],
      }),
      tab: 'deeds',
    });
    const rows = m.groups[0]?.rows ?? [];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.label).toBe(SOURCE_TABLE['ui.win.deeds.unearned']);
    expect(rows[0]?.branchNote).toBe('');
    expect(rows[1]?.branchNote).toBe(SOURCE_TABLE['ui.win.deeds.branch_missing']);
    // an unearned deed shows no grade and no description
    expect(rows[0]?.grade).toBe('');
    expect(rows[0]?.desc).toBe('');
  });

  it('puts earned deeds first inside a class and counts only the earned ones', () => {
    const m = deedsModel({
      book: book({
        deeds: [deed({ id: 'un', earnedTick: null, name: null }), deed({ id: 'got' })],
        progress: { earned: 1, of: 4 },
      }),
      tab: 'deeds',
    });
    expect((m.groups[0]?.rows ?? []).map((r) => r.id)).toEqual(['got', 'un']);
    expect(m.tabs.find((x) => x.id === 'deeds')?.count).toBe(1);
    expect(m.progress).toContain('1');
    expect(m.progress).toContain('4');
  });

  it('shows the fame band as a sentence, the number only when asked', () => {
    const b = book({ fame: 35 });
    expect(deedsModel({ book: b, tab: 'deeds' }).fame).not.toContain('35');
    expect(deedsModel({ book: b, tab: 'deeds', fameNumbers: true }).fame).toContain('35');
    expect(fameBand(0)).toBe(0);
    expect(fameBand(10)).toBe(1);
    expect(fameBand(35)).toBe(2);
    expect(fameBand(100)).toBe(4);
  });

  it('wears one office title at a time and never a street name or a lost one', () => {
    const m = deedsModel({
      book: book({
        titles: [
          {
            id: 'title_street_x',
            kind: 'common',
            name: 'n',
            grantedBy: 'g',
            visibleTo: 'v',
            loss: 'l',
            tick: 1,
            lost: false,
            worn: false,
          },
          {
            id: 'title_guild_y',
            kind: 'office',
            name: 'n',
            grantedBy: 'g',
            visibleTo: 'v',
            loss: 'l',
            tick: 1,
            lost: false,
            worn: true,
          },
          {
            id: 'title_guild_z',
            kind: 'office',
            name: 'n',
            grantedBy: 'g',
            visibleTo: 'v',
            loss: 'l',
            tick: 1,
            lost: true,
            worn: false,
          },
        ],
      }),
      tab: 'titles',
    });
    expect(m.titles.map((x) => x.wearable)).toEqual([false, true, false]);
    // pressing the worn one takes it off
    expect(wearTarget({ id: 'title_guild_y', worn: true })).toBeNull();
    expect(wearTarget({ id: 'title_guild_y', worn: false })).toBe('title_guild_y');
  });

  it('offers the pillar only once it exists, and only carvable earned deeds', () => {
    const locked = deedsModel({ book: book(), tab: 'pillar' });
    expect(locked.pillarLocked).toBe(true);
    expect(locked.empty).toBe(SOURCE_TABLE['ui.win.deeds.pillar_locked']);
    const open = deedsModel({
      book: book({
        deeds: [
          deed({ id: 'carvable', carvable: true }),
          deed({ id: 'already', carvable: true }),
          deed({ id: 'plain' }),
          deed({ id: 'unearned', carvable: true, earnedTick: null, name: null }),
        ],
        pillar: { slots: 2, carved: ['already', null] },
      }),
      tab: 'pillar',
    });
    expect(open.pillar).toHaveLength(2);
    expect(open.pillar[1]?.label).toBe(SOURCE_TABLE['ui.win.deeds.pillar_free']);
    expect(open.carvable.map((c) => c.id)).toEqual(['carvable']);
    expect(open.pillarFull).toBe('');
    const full = deedsModel({
      book: book({
        deeds: [deed({ id: 'carvable', carvable: true }), deed({ id: 'already', carvable: true })],
        pillar: { slots: 1, carved: ['already'] },
      }),
      tab: 'pillar',
    });
    expect(full.carvable).toEqual([]);
    expect(full.pillarFull).toBe(SOURCE_TABLE['ui.win.deeds.pillar_full']);
  });
});

const row = (over: Partial<CodexRowView> = {}): CodexRowView => ({
  id: 'mon_ash_dreg',
  name: { key: contentKey('monsters', 'mon_ash_dreg', 'name') },
  first: 10,
  last: 20,
  count: 3,
  map: null,
  notes: [],
  ...over,
});

describe('ui_win_codex (6.3.2)', () => {
  it('counts what the tab counts and writes only the recorded number', () => {
    expect(countText('people', 2)).toContain('2');
    expect(countText('monsters', 7)).toContain('7');
    expect(countText('creatures', 7)).toBe('');
    const m = codexModel({ tab: 'monsters', rows: [row(), row({ id: 'b' })], dianKnown: true });
    expect(m.recorded).toContain('2');
    // the denominator is never shown (6.3.2)
    expect(m.recorded).not.toContain('/');
  });

  it("lists nothing the player has not met, with each tab's own empty line", () => {
    const m = codexModel({ tab: 'monsters', rows: [], dianKnown: false });
    expect(m.rows).toEqual([]);
    expect(m.empty).toBe(SOURCE_TABLE['ui.win.codex.empty.monsters']);
    expect(codexModel({ tab: 'people', rows: [], dianKnown: false }).empty).toBe(
      SOURCE_TABLE['ui.win.codex.empty.people'],
    );
  });

  it('never shows the canon term before it is known (D-030)', () => {
    const canon = SOURCE_TABLE['ui.common.term.dian'] as string;
    const mortal = SOURCE_TABLE['ui.common.term.dian_mortal'] as string;
    expect(canon).not.toBe(mortal);
    // no monster record carries a mortal name yet: the fallback is the name under the rule
    const named = `${canon}x`;
    expect(monsterName(named, 'mon_ash_dreg', false)).toBe(`${mortal}x`);
    expect(monsterName(named, 'mon_ash_dreg', false)).not.toContain(canon);
    // once the word is known the canon name shows as written
    expect(monsterName(named, 'mon_ash_dreg', true)).toBe(named);
    // every occurrence goes, and a name without the term is left alone
    expect(mortalName(`${canon}y${canon}`, false)).toBe(`${mortal}y${mortal}`);
    expect(mortalName('Ash', false)).toBe('Ash');
    expect(mortalName('', false)).toBe('');
  });

  it('groups the recollection page by act in story order, the prologue first', () => {
    const m = codexModel({
      tab: 'memories',
      rows: [],
      memories: [
        { id: 'cut_a1_x', title: 'x', act: 'act1', first: 1, last: 1 },
        { id: 'cut_unknown', title: 'u', act: '', first: 2, last: 2 },
        { id: 'cut_p_y', title: 'y', act: 'prologue', first: 3, last: 3 },
        { id: 'cut_a1_z', title: 'z', act: 'act1', first: 4, last: 4 },
      ],
      dianKnown: true,
    });
    // alphabetical order would put act1 before the prologue and the act-less scenes first
    expect(m.memories.map((g) => g.act)).toEqual(['prologue', 'act1', '']);
    expect(m.memories[0]?.label).toBe(SOURCE_TABLE['ui.common.act.prologue']);
    expect(m.memories[1]?.label).toBe(SOURCE_TABLE['ui.common.act.act1']);
    expect(m.memories[2]?.label).toBe(SOURCE_TABLE['ui.win.codex.act_other']);
    expect(m.memories[1]?.rows.map((r) => r.id)).toEqual(['cut_a1_x', 'cut_a1_z']);
    expect(m.recorded).toContain('4');
    expect(actRank('prologue')).toBeLessThan(actRank('act1'));
    expect(actRank('epilogue')).toBeLessThan(actRank(''));
  });
});

const letter = (over: Partial<LetterView> = {}): LetterView => ({
  id: 'ltr_a1_count',
  sender: 's',
  seal: 'official',
  subject: 'sub',
  state: 'delivered',
  delivered: 2880,
  body: [{ key: contentKey('letters', 'ltr_a1_count', 'body.p1.text') }],
  attachments: [],
  taken: false,
  replies: [],
  reply: null,
  ...over,
});

describe('ui_win_letters (6.3.8)', () => {
  it("offers the sending tab only once the messenger's door is open", () => {
    const shut = lettersModel({
      inbox: [letter()],
      tab: 'outbox',
      sendingOpen: false,
      itemName: (id) => id,
    });
    expect(shut.tabs.map((x) => x.id)).toEqual(['inbox']);
    // a tab that is not offered never becomes the shown one
    expect(shut.tab).toBe('inbox');
    const open = lettersModel({
      inbox: [letter()],
      tab: 'outbox',
      sendingOpen: true,
      itemName: (id) => id,
    });
    expect(open.tabs.map((x) => x.id)).toEqual(['inbox', 'outbox']);
    expect(open.tab).toBe('outbox');
    expect(open.empty).toBe(SOURCE_TABLE['ui.win.letters.outbox_empty']);
  });

  it('marks what is unread and offers the attachments until they are taken', () => {
    const m = lettersModel({
      inbox: [
        letter({ id: 'a', attachments: [{ item: 'herb', name: 'herb', count: 3 }] }),
        letter({
          id: 'b',
          state: 'read',
          attachments: [{ item: 'x', name: 'x', count: 1 }],
          taken: true,
        }),
      ],
      tab: 'inbox',
      sendingOpen: false,
      itemName: () => 'Herb',
    });
    expect(m.rows.map((r) => r.unread)).toEqual([true, false]);
    // the unread mark says it once: no second unread word in the state line
    expect(m.rows[0]?.state).toBe('');
    expect(m.rows[1]?.state).toBe(SOURCE_TABLE['ui.win.letters.state.read']);
    expect(unreadCount(m.rows)).toBe(1);
    expect(m.rows[0]?.canTake).toBe(true);
    expect(m.rows[0]?.attachments[0]?.label).toContain('3');
    expect(m.rows[1]?.canTake).toBe(false);
  });

  it('drops the replies once one is chosen and says which it was', () => {
    const m = lettersModel({
      inbox: [letter({ state: 'replied', replies: [], reply: 'accept' })],
      tab: 'inbox',
      sendingOpen: false,
      itemName: (id) => id,
    });
    expect(m.rows[0]?.replies).toEqual([]);
    expect(m.rows[0]?.reply).not.toBe('');
    expect(m.rows[0]?.state).toBe(SOURCE_TABLE['ui.win.letters.state.replied']);
  });

  it('says so when no letter has come', () => {
    const m = lettersModel({ inbox: [], tab: 'inbox', sendingOpen: false, itemName: (i) => i });
    expect(m.empty).toBe(SOURCE_TABLE['ui.win.letters.inbox_empty']);
  });
});

const piece = (over: Partial<EvidenceRowView> = {}): EvidenceRowView => ({
  id: 'ev_waybill',
  name: 'Waybill',
  kind: 'evidence',
  count: 1,
  desc: '',
  tags: [],
  ...over,
});

describe('ui_win_evidence (6.3.11)', () => {
  it('shows no strength and no defence tag before the court opens', () => {
    const m = evidenceModel({
      pieces: [piece({ proves: 'it proves a thing', tags: ['fact'] })],
      records: [],
      tab: 'evidence',
      courtOpen: false,
      note: () => '',
    });
    expect(m.rows[0]?.proves).toBe(SOURCE_TABLE['ui.win.evidence.may_be_useful']);
    expect(m.rows[0]?.tags).toEqual([]);
    expect(m.hint).toBe(SOURCE_TABLE['ui.win.evidence.before_court']);
  });

  it('writes what the piece proves once the court is open', () => {
    const m = evidenceModel({
      pieces: [piece({ proves: 'it proves a thing', tags: ['fact'] })],
      records: [],
      tab: 'evidence',
      courtOpen: true,
      note: () => '',
    });
    expect(m.rows[0]?.proves).toBe('it proves a thing');
    expect(m.rows[0]?.tags).toEqual([SOURCE_TABLE['ui.win.evidence.line.fact']]);
    // the line keys follow the court's own names (src/systems/scenes/court.ts LINES)
    expect(Object.keys(LINE_KEYS).sort()).toEqual(['fact', 'just', 'mitigate', 'need']);
    for (const k of Object.values(LINE_KEYS)) expect(SOURCE_TABLE[k], k).toBeTruthy();
    expect(m.hint).toBe('');
  });

  it('keeps the historical records on their own page', () => {
    const input = {
      pieces: [piece()],
      records: [piece({ id: 'lore_h01', kind: 'lore' })],
      courtOpen: false,
      note: () => '',
    };
    const pieces = evidenceModel({ ...input, tab: 'evidence' });
    const records = evidenceModel({ ...input, tab: 'records' });
    expect(pieces.rows.map((r) => r.id)).toEqual(['ev_waybill']);
    expect(records.rows.map((r) => r.id)).toEqual(['lore_h01']);
    expect(pieces.tabs.map((x) => x.count)).toEqual([1, 1]);
  });

  it('puts evidence and history records on their pages and relics and books on neither', () => {
    expect(evidencePage({ kind: 'evidence' })).toBe('evidence');
    expect(evidencePage({ kind: 'lore', tags: [HISTORY_TAG, 'no_sell'] })).toBe('records');
    // a relic or a book is lore without the history tag: the codex's, not the evidence's
    expect(evidencePage({ kind: 'lore', tags: ['relic'] })).toBeNull();
    expect(evidencePage({ kind: 'lore' })).toBeNull();
    expect(evidencePage({ kind: 'weapon' })).toBeNull();
    expect(evidencePage(undefined)).toBeNull();
  });

  it('says so when nothing is held, per page', () => {
    expect(
      evidenceModel({ pieces: [], records: [], tab: 'evidence', courtOpen: false, note: () => '' })
        .empty,
    ).toBe(SOURCE_TABLE['ui.win.evidence.pieces_empty']);
    expect(
      evidenceModel({ pieces: [], records: [], tab: 'records', courtOpen: false, note: () => '' })
        .empty,
    ).toBe(SOURCE_TABLE['ui.win.evidence.records_empty']);
  });

  it("keeps the player's note, without control characters and within the limit", () => {
    const m = evidenceModel({
      pieces: [piece()],
      records: [],
      tab: 'evidence',
      courtOpen: false,
      note: (id) => (id === 'ev_waybill' ? 'mine' : ''),
    });
    expect(m.rows[0]?.note).toBe('mine');
    expect(cleanNote('a\u0000b\u001fc\u007f')).toBe('abc');
    expect(cleanNote('x'.repeat(NOTE_MAX + 10))).toHaveLength(NOTE_MAX);
  });
});
