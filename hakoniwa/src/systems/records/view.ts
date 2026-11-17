// Read-only view models of the records (the data side of ux_and_onboarding.md 6.3.1
// `DeedsAdapter.book`, 6.3.2 `CodexAdapter` and 6.3.8 `LettersAdapter`; the windows are
// PK-M1-23). Text is content keys (c.<table>.<id>.<field>), never a sentence. Pure: reads
// the world and the content, writes nothing (a world without the slice reads as empty).

import { contentRef, contentText } from '../../core/content_key';
import type { ContentMap } from '../../core/contracts';
import type { TextParam } from '../../core/text';
import type { World } from '../../core/world';
import { actIndex, evaluate, flagResolver } from '../quests/conditions';
import { branchMissing, pillarSlots } from './book';
import { readRecords } from './slice';
import type {
  BookStage,
  CodexTab,
  DeedClass,
  Fame,
  Grade,
  LetterSeal,
  LetterState,
  RecordsConfig,
  TitleKind,
} from './types';

export interface DeedRowView {
  id: string;
  /** null until earned (ux 6.3.1 "未得为空") */
  name: TextParam | null;
  desc: TextParam | null;
  cls: DeedClass;
  act: number;
  fame: Fame;
  grade: Grade | null;
  earnedTick: number | null;
  /** a branch deed whose branch closed this cycle ("did not happen this cycle") */
  branchMissing: boolean;
  feat: boolean;
  hidden: boolean;
  /** may be carved on the pillar */
  carvable: boolean;
}

export interface TitleRowView {
  id: string;
  kind: TitleKind;
  name: TextParam;
  grantedBy: TextParam;
  visibleTo: TextParam;
  loss: TextParam;
  tick: number;
  lost: boolean;
  worn: boolean;
}

export interface DeedBookView {
  stage: BookStage;
  /** earned deeds, then the visible unearned deeds of the acts reached, in table order */
  deeds: DeedRowView[];
  titles: TitleRowView[];
  /** fame of the earned deeds (a count, catalog 2.10) */
  fame: number;
  /** completion: feats, hidden and branch deeds count only once earned (catalog 1.4) */
  progress: { earned: number; of: number };
  pillar: { slots: number; carved: (string | null)[] };
}

type FlagWorld = Pick<World, 'meta' | 'slices'>;

/** Book form at an act (catalog 2.11): the stage whose `fromAct` is the highest reached. */
export function bookStage(config: RecordsConfig | undefined, act: number): BookStage {
  let best: { stage: BookStage; fromAct: number } | undefined;
  for (const s of config?.stages ?? []) {
    if (s.fromAct <= act && (!best || s.fromAct >= best.fromAct)) best = s;
  }
  return best?.stage ?? 'carvings';
}

/** The act index the world is in (prologue 0). */
export function currentAct(world: FlagWorld): number {
  const a = actIndex(world.meta.flags.act);
  return Number.isNaN(a) ? 0 : a;
}

export function deedBook(world: World, content: ContentMap): DeedBookView {
  const s = readRecords(world);
  const resolve = flagResolver(world.meta.flags);
  const act = currentAct(world);
  const deeds: DeedRowView[] = [];
  let fame = 0;
  let earned = 0;
  let of = 0;
  const rows = content.deeds ?? [];
  const row = (d: (typeof rows)[number]): DeedRowView => {
    const r = s?.deeds[d.id];
    return {
      id: d.id,
      name: r ? contentText('deeds', d, d.id) : null,
      desc: r ? contentText('deeds', d, '', 'desc') : null,
      cls: d.cls,
      act: d.act,
      fame: d.fame,
      grade: r?.grade ?? null,
      earnedTick: r?.tick ?? null,
      branchMissing: branchMissing(d, s, resolve),
      feat: !!d.feat,
      hidden: !!d.hidden,
      carvable: !!d.reward?.pillar,
    };
  };
  for (const d of rows) {
    const r = s?.deeds[d.id];
    if (!r) continue;
    deeds.push(row(d));
    fame += d.fame;
    if (!d.feat) {
      earned++;
      of++;
    }
  }
  for (const d of rows) {
    if (s?.deeds[d.id] || d.hidden || d.act > act) continue;
    deeds.push(row(d));
    if (!d.feat && !d.branch) of++;
  }
  const titles: TitleRowView[] = [];
  for (const t of content.titles ?? []) {
    const r = s?.titles[t.id];
    if (!r) continue;
    titles.push({
      id: t.id,
      kind: t.kind,
      name: contentText('titles', t, t.id),
      grantedBy: contentText('titles', t, '', 'grantedBy'),
      visibleTo: contentText('titles', t, '', 'visibleTo'),
      loss: contentText('titles', t, '', 'loss'),
      tick: r.tick,
      lost: r.lost !== undefined,
      worn: s?.worn === t.id,
    });
  }
  const slots = pillarSlots(content.recordsConfig, resolve);
  const carved: (string | null)[] = [];
  for (let i = 0; i < slots; i++) carved.push(s?.pillar[i] ?? null);
  return {
    stage: bookStage(content.recordsConfig, act),
    deeds,
    titles,
    fame,
    progress: { earned, of },
    pillar: { slots, carved },
  };
}

// ---------------------------------------------------------------------------
// Codex

export interface CodexNoteView {
  id: string;
  source: string;
  text: TextParam;
  tick: number;
}

export interface CodexRowView {
  id: string;
  name: TextParam;
  first: number;
  last: number;
  count: number;
  /** map of the last meeting (people) */
  map: TextParam | null;
  notes: CodexNoteView[];
}

/** Content table and field naming a subject of each tab (creatures have no table yet). */
const TAB_TABLES: Readonly<Record<CodexTab, { tables: readonly string[]; field: string }>> = {
  people: { tables: ['npcs', 'companions'], field: 'name' },
  monsters: { tables: ['monsters'], field: 'name' },
  creatures: { tables: [], field: 'name' },
  items: { tables: ['items'], field: 'name' },
  books: { tables: ['items'], field: 'name' },
  collections: { tables: ['items'], field: 'name' },
  memories: { tables: ['scenes'], field: 'title' },
};

function nameOf(content: ContentMap, tab: CodexTab, id: string): TextParam {
  const t = TAB_TABLES[tab];
  for (const table of t.tables) {
    const rows = (content as unknown as Record<string, unknown>)[table];
    if (!Array.isArray(rows)) continue;
    const rec = (rows as { id: string }[]).find((r) => r.id === id);
    if (rec) return contentText(table, rec, id, t.field);
  }
  return id;
}

/** One codex tab: the subjects met, oldest first, with the notes discovered about each. */
export function codexPage(world: World, content: ContentMap, tab: CodexTab): CodexRowView[] {
  const s = readRecords(world);
  if (!s) return [];
  const notes = new Map<string, CodexNoteView[]>();
  for (const e of content.codexEntries ?? []) {
    const tick = s.notes[e.id];
    if (tick === undefined || e.tab !== tab) continue;
    const list = notes.get(e.subject) ?? [];
    list.push({
      id: e.id,
      source: e.source,
      text: contentText('codexEntries', e, '', 'text'),
      tick,
    });
    notes.set(e.subject, list);
  }
  const maps = content.maps ?? [];
  return Object.entries(s.codex[tab])
    .sort((a, b) => a[1].first - b[1].first || (a[0] < b[0] ? -1 : 1))
    .map(([id, r]) => {
      const map = r.map ? maps.find((m) => m.id === r.map) : undefined;
      return {
        id,
        name: nameOf(content, tab, id),
        first: r.first,
        last: r.last,
        count: r.count,
        map: r.map ? contentText('maps', map, r.map) : null,
        notes: notes.get(id) ?? [],
      };
    });
}

// ---------------------------------------------------------------------------
// Letters

export interface LetterView {
  id: string;
  sender: TextParam;
  seal: LetterSeal;
  subject: TextParam;
  state: LetterState;
  delivered: number | null;
  /** the paragraphs frozen when it was sent */
  body: TextParam[];
  attachments: { item: string; name: TextParam; count: number }[];
  taken: boolean;
  /** replies open now (none once answered) */
  replies: { id: string; label: TextParam }[];
  reply: string | null;
}

/** Delivered letters, newest first (letters on the road are not in the inbox). */
export function inbox(world: World, content: ContentMap): LetterView[] {
  const s = readRecords(world);
  if (!s) return [];
  const resolve = flagResolver(world.meta.flags);
  const items = content.items ?? [];
  const out: LetterView[] = [];
  for (const def of content.letters ?? []) {
    const r = s.letters[def.id];
    if (!r || r.state === 'transit') continue;
    out.push({
      id: def.id,
      sender: def.sender
        ? nameOf(content, 'people', def.sender)
        : contentText('letters', def, def.id, 'senderName'),
      seal: def.seal,
      subject: contentText('letters', def, def.id, 'subject'),
      state: r.state,
      delivered: r.delivered ?? null,
      body: r.body.map((pid) => contentRef('letters', def.id, `body.${pid}.text`)),
      attachments: (def.attachments ?? []).map((a) => ({
        item: a.item,
        name: contentText(
          'items',
          items.find((i) => i.id === a.item),
          a.item,
        ),
        count: a.count ?? 1,
      })),
      taken: !!r.taken,
      replies:
        r.state === 'replied'
          ? []
          : (def.replies ?? [])
              .filter((x) => !x.when || evaluate(x.when, resolve))
              .map((x) => ({
                id: x.id,
                label: contentRef('letters', def.id, `replies.${x.id}.label`),
              })),
      reply: r.reply ?? null,
    });
  }
  return out.sort((a, b) => (b.delivered ?? 0) - (a.delivered ?? 0) || (a.id < b.id ? -1 : 1));
}
