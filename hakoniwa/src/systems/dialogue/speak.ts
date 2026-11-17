// Saying a line of a slot (builtin_ai.md 7.3 to 7.9): resolve the speaker's fallback layers
// (own pack, functional roles, resident template, social class, ln_common), select with
// the speaker's named stream and the saved line history (7.7: greetings, farewells and
// reactions 7 game days, barks 3; the per-place bark window 2 game hours), fill the slots
// from kernel values and emit nothing: the caller decides where the line goes. The line
// history toward the player and the bark ledger live in the dialogue slice, so the
// suppression windows survive save and load.

import type { SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { calendarAt, TICKS_PER_GAME_HOUR } from '../../core/time';
import { personaById } from '../npc/personas';
import { locationById } from '../npc/places';
import type { NpcState } from '../npc/types';
import { conditionHolds } from '../quests/effects';
import { lineText } from './lines/fill';
import { FILL_SLOTS, fillSlotsOf, suppressionDays } from './lines/grammar';
import { type LineHistory, newLineHistory, recordLine } from './lines/history';
import { COMMON_PACK_ID, type FallbackLayers, type VersionBy } from './lines/packs';
import { selectLine } from './lines/select';
import type { Mood, PlaceKind } from './lines/types';
import type { DialogueSlice } from './types';

/** Bark keys kept per speaker (3 game days of barks fit easily). */
export const BARK_HISTORY_CAP = 24;
/** The same bark is not said twice at one place within this many ticks (7.7). */
export const PLACE_BARK_WINDOW = 2 * TICKS_PER_GAME_HOUR;

/** Location kinds read as the line packs' place kinds (builtin_ai.md 7.4). */
const PLACE_OF_KIND: Record<string, PlaceKind> = {
  tavern: 'tavern',
  church: 'chapel',
  market: 'market',
  shop: 'market',
  home: 'home',
  smithy: 'workplace',
  guild: 'workplace',
  office: 'workplace',
  bakery: 'workplace',
  mill: 'workplace',
  clinic: 'workplace',
  work: 'workplace',
  field: 'workplace',
  barracks: 'workplace',
  camp: 'camp',
  castle: 'court',
  graveyard: 'wild',
  gate: 'wild',
};

/** The place kind of where a person stands (undefined when it has no line preference). */
export function placeKindOf(ctx: SystemContext, st: NpcState): PlaceKind | undefined {
  const loc = locationById(ctx.content, st.mapId, st.locId);
  return loc ? PLACE_OF_KIND[loc.kind] : undefined;
}

/** The fallback layers of a speaker: functional roles, resident template, social class. */
export function speakerLayers(ctx: SystemContext, speaker: string): FallbackLayers {
  const p = personaById(ctx.content, speaker);
  if (p) return { roles: p.roles ?? [], socialClass: p.class };
  const r = ctx.world.slices.npc.residents[speaker];
  if (r) {
    const m = /^res_(.+)_\d+$/.exec(r.id);
    return { template: m?.[1], socialClass: r.class };
  }
  return {};
}

/** The slice's line ledgers (created on first use: saves before them have none). */
function ledgers(slice: DialogueSlice) {
  slice.lines ??= {};
  slice.barks ??= {};
  slice.placeBarks ??= {};
  return { lines: slice.lines, barks: slice.barks, placeBarks: slice.placeBarks };
}

export interface SpeakRequest {
  speaker: string;
  slot: string;
  /** fill values the caller has; a line needing a slot with no value is void (7.9) */
  vars?: Record<string, TextParam | undefined>;
  /** whose ledger: a line said to the player (7 days), a bark (3 days and the place window) */
  ledger?: 'player' | 'bark' | 'none';
  mood?: Mood;
  version?: string;
  versionBy?: VersionBy;
  firstMeeting?: boolean;
  /** keys already said in the open conversation */
  saidThisSession?: ReadonlySet<string>;
}

export interface Spoken {
  text: TextParam;
  key: string;
  packId: string;
  /** the line came from the shared common layer (7.8 and 14.1) */
  common: boolean;
  /** the line used {memory} or {diary} (alive metric 9) */
  recalled: boolean;
}

/** The short phrase of the speaker's latest notable memory about the player (5.3). */
export function memoryPhrase(ctx: SystemContext, speaker: string): TextParam | undefined {
  const mind = ctx.world.slices.npc.minds[speaker];
  if (!mind) return undefined;
  for (let i = mind.mem.length - 1; i >= 0; i--) {
    const m = mind.mem[i];
    if (m && m.about === 'player' && m.imp >= 0.3 && m.short !== undefined) return m.short;
  }
  return undefined;
}

/** The speaker's latest diary entry of the last few days (5.4, the {diary} slot). */
export function diaryPhrase(ctx: SystemContext, speaker: string): TextParam | undefined {
  const st = ctx.world.slices.npc.npcs[speaker];
  const last = st?.diary.at(-1);
  if (!last) return undefined;
  const day = calendarAt(ctx.tick).dayIndex;
  return day - last.day <= 3 ? last.text : undefined;
}

/**
 * Select, record and fill one line of `slot` for `speaker`; null when the chain has
 * nothing to say (a gap, 7.3 step 8). The draw uses the speaker's stream
 * dialogue.lines.<speaker> (builtin_ai 1.5).
 */
export function speak(ctx: SystemContext, req: SpeakRequest): Spoken | null {
  const slice = ctx.world.slices.dialogue;
  if (!slice) return null;
  const { lines, barks, placeBarks } = ledgers(slice);
  const st = ctx.world.slices.npc.npcs[req.speaker];
  const day = calendarAt(ctx.tick).dayIndex;
  const vars: Record<string, TextParam | undefined> = { ...(req.vars ?? {}) };
  if (vars.memory === undefined) vars.memory = memoryPhrase(ctx, req.speaker);
  if (vars.diary === undefined) vars.diary = diaryPhrase(ctx, req.speaker);
  const p = personaById(ctx.content, req.speaker);
  if (vars.name === undefined) vars.name = p?.name;
  const rng = ctx.rng(`dialogue.lines.${req.speaker}`);
  if (vars.catch === undefined)
    vars.catch = p && p.voice.catchphrases.length > 0 ? rng.pick(p.voice.catchphrases) : '';
  // a line needing a fill slot with no value now is void (7.9); {catch} may stay empty
  const unfillable = new Set<string>();
  for (const s of FILL_SLOTS) {
    const v = vars[s];
    if (s !== 'catch' && (v === undefined || v === '')) unfillable.add(s);
  }
  const ledger = req.ledger ?? 'player';
  let history: LineHistory | undefined;
  if (ledger === 'player') {
    history = lines[req.speaker] ?? newLineHistory();
    lines[req.speaker] = history;
  } else if (ledger === 'bark') {
    history = barks[req.speaker] ?? newLineHistory();
    barks[req.speaker] = history;
  }
  const placeKey = st ? `${st.mapId}/${st.locId}` : '';
  const recentHere =
    ledger === 'bark'
      ? (placeBarks[placeKey] ?? [])
          .filter((b) => ctx.tick - b.tick < PLACE_BARK_WINDOW)
          .map((b) => b.key)
      : [];
  const said = new Set([...(req.saidThisSession ?? []), ...recentHere]);
  const act = ctx.flag('act');
  const pick = selectLine(
    ctx.content,
    req.speaker,
    req.slot,
    {
      holds: (w) => conditionHolds(ctx, w),
      mood: req.mood,
      place: st ? placeKindOf(ctx, st) : undefined,
      firstMeeting: req.firstMeeting,
      unfillable,
      dayIndex: day,
      saidThisSession: said,
    },
    rng,
    history,
    {
      ...speakerLayers(ctx, req.speaker),
      act: typeof act === 'string' ? act : undefined,
      version: req.version,
      versionBy: req.versionBy,
      suppressDays: ledger === 'none' ? 0 : suppressionDays(req.slot),
    },
  );
  if (!pick) return null;
  if (history) {
    recordLine(history, pick.key, day);
    if (ledger === 'bark') {
      while (history.order.length > BARK_HISTORY_CAP) {
        const drop = history.order.shift();
        if (drop !== undefined) delete history.lastSaid[drop];
      }
    }
  }
  if (ledger === 'bark' && placeKey) {
    const list = (placeBarks[placeKey] ?? []).filter((b) => ctx.tick - b.tick < PLACE_BARK_WINDOW);
    list.push({ key: pick.key, tick: ctx.tick });
    placeBarks[placeKey] = list.slice(-8);
  }
  const used = fillSlotsOf(pick.entry.zh);
  const text = lineText({ zh: pick.entry.zh, key: pick.key }, vars);
  return {
    text: text === '' ? tr('sys.dialogue.intent.fallback') : text,
    key: pick.key,
    packId: pick.packId,
    common: pick.packId === COMMON_PACK_ID,
    recalled: used.includes('memory') || used.includes('diary'),
  };
}
