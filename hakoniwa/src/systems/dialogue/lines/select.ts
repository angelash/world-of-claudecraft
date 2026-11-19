// The line selector (builtin_ai.md 7.4 and 7.7): candidates come from the fallback chain
// (./packs.ts), nearest source first; each is filtered (when, strict mood and place, first
// meeting, said in this session, the suppression window), weighted (base weight, mood,
// place, time of day, freshness) and drawn with the speaker's named stream. When a source
// has lines but every one is suppressed, the oldest suppressed line is released first;
// only a source with nothing left gives way to the next. Topics rotate in order instead of
// drawing. Pure and deterministic: the caller passes the stream, the day and the
// condition evaluator (the reveal-ledger evaluator lives in the quest system).

import { weightedIndex } from '../../../core/brain';
import type { ContentMap } from '../../../core/contracts';
import type { Rng } from '../../../core/rng';
import { fillSlotsOf } from './grammar';
import { type LineHistory, lineLookedAt, oldestSuppressed } from './history';
import {
  chainPackIds,
  type FallbackLayers,
  lineKey,
  ownSlotSources,
  packById,
  type ResolvedSlot,
  type ResolveOptions,
} from './packs';
import { isLine, type LineEntry, lineEntry, type Mood, type PlaceKind } from './types';

export interface SelectContext {
  /** evaluates a line's `when` (reveal-ledger syntax) */
  holds(when: string): boolean;
  mood?: Mood;
  place?: PlaceKind;
  /** first meeting with the listener: `first` lines become eligible (and only then) */
  firstMeeting?: boolean;
  /**
   * Fill slots the caller has no value for right now (builtin_ai 7.9: a line that needs
   * one is void and the next line is tried); omit when every slot can be filled.
   */
  unfillable?: ReadonlySet<string>;
  /** current game day index (history windows and freshness) */
  dayIndex: number;
  /** keys already said in this conversation: never twice in one session (7.7) */
  saidThisSession?: ReadonlySet<string>;
}

export interface Candidate {
  packId: string;
  slot: string;
  act?: string;
  version?: string;
  /** index within the source list */
  index: number;
  entry: LineEntry;
  /** content text key of the line */
  key: string;
}

/** The live lines of a source (holes skipped), each keeping its index for the text key. */
function candidatesOf(src: ResolvedSlot): Candidate[] {
  const out: Candidate[] = [];
  src.lines.forEach((line, index) => {
    if (!isLine(line)) return;
    out.push({
      packId: src.packId,
      slot: src.slot,
      act: src.act,
      version: src.version,
      index,
      entry: lineEntry(line),
      key: lineKey(src.packId, src.slot, index, {
        act: src.act,
        version: src.version,
        entry: typeof line !== 'string',
      }),
    });
  });
  return out;
}

/**
 * Hard filters except suppression (builtin_ai 7.4 step 2 and 7.9): when, strict mood and
 * place, first meeting, said this session, and a fill slot the caller cannot fill.
 */
function admissible(c: Candidate, ctx: SelectContext): boolean {
  const e = c.entry;
  if (e.when && !ctx.holds(e.when)) return false;
  if (e.first && !ctx.firstMeeting) return false;
  if (ctx.saidThisSession?.has(c.key)) return false;
  if (ctx.unfillable && fillSlotsOf(e.zh).some((s) => ctx.unfillable?.has(s))) return false;
  if (e.strict) {
    if (e.mood && !(ctx.mood && e.mood.includes(ctx.mood))) return false;
    if (e.place && !(ctx.place && e.place.includes(ctx.place))) return false;
  }
  return true;
}

/** Days of freshness credited to a line never said (the cap is reached at 10). */
const NEVER_SAID_DAYS = 10;

/**
 * Weight of one candidate (builtin_ai 7.4 step 4): w x (mood match 2) x (place match 1.5) x
 * (time match 1.3) x freshness (1 + 0.1 x game days since last said, at most 2). A time
 * match is a line whose condition reads the hour (the catalog writes day-part preferences
 * as `when: hour ...`, 1.3): it is eligible only when that holds, so it then gets the bonus;
 * a line without a time condition gets none.
 */
export function candidateWeight(c: Candidate, ctx: SelectContext, lastSaidDay?: number): number {
  const e = c.entry;
  let w = e.w ?? 1;
  if (e.mood && ctx.mood && e.mood.includes(ctx.mood)) w *= 2;
  if (e.place && ctx.place && e.place.includes(ctx.place)) w *= 1.5;
  if (e.when && /\bhour\b/.test(e.when)) w *= 1.3;
  const days =
    lastSaidDay === undefined ? NEVER_SAID_DAYS : Math.max(0, ctx.dayIndex - lastSaidDay);
  return w * Math.min(2, 1 + 0.1 * days);
}

export interface SelectResult {
  key: string;
  entry: LineEntry;
  packId: string;
  slot: string;
  act?: string;
  version?: string;
  index: number;
  /** the draw, or -1 when no draw was needed (one candidate, or a rotation) */
  draw: number;
}

export interface SelectOptions extends ResolveOptions, FallbackLayers {
  /** suppression window in game days (grammar.ts suppressionDays); 0 disables it */
  suppressDays?: number;
  /** take the lines in order (topics, 7.7): the first not said this session */
  rotate?: boolean;
}

/**
 * Select a line of `slot` for speaker `npcId` (builtin_ai 7.4 steps 1 to 5); null when the
 * whole chain has nothing to say (7.3 step 8, "......" and a gap in the coverage report).
 * The caller records the result in the history (recordLine) and fills its slots.
 */
export function selectLine(
  content: Pick<ContentMap, 'linePacks'>,
  npcId: string,
  slot: string,
  ctx: SelectContext,
  rng: Rng,
  history: LineHistory | undefined,
  opts: SelectOptions = {},
): SelectResult | null {
  const days = opts.suppressDays ?? 0;
  // every source of every pack in chain order: an act override whose lines are all
  // conditioned out gives way to the same pack's base slot before the next pack (7.3)
  const sources = chainPackIds(npcId, opts).flatMap((packId) => {
    const pack = packById(content, packId);
    return pack ? ownSlotSources(pack, slot, opts) : [];
  });
  for (const src of sources) {
    const open = candidatesOf(src).filter((c) => admissible(c, ctx));
    if (open.length === 0) continue;
    if (opts.rotate) {
      const c = open[0] as Candidate;
      return { ...pick(c), draw: -1 };
    }
    let pool = history
      ? open.filter((c) => !lineLookedAt(history, c.key, ctx.dayIndex, days))
      : open;
    if (pool.length === 0 && history) {
      // release the oldest suppressed line first (7.4 step 3)
      const oldest = oldestSuppressed(
        history,
        open.map((c) => c.key),
        ctx.dayIndex,
        days,
      )[0];
      pool = open.filter((c) => c.key === oldest);
    }
    if (pool.length === 0) continue;
    if (pool.length === 1) return { ...pick(pool[0] as Candidate), draw: -1 };
    const weights = pool.map((c) => candidateWeight(c, ctx, history?.lastSaid[c.key]));
    const { index, draw } = weightedIndex(rng, weights);
    return { ...pick(pool[index] as Candidate), draw };
  }
  return null;
}

function pick(c: Candidate): Omit<SelectResult, 'draw'> {
  return {
    key: c.key,
    entry: c.entry,
    packId: c.packId,
    slot: c.slot,
    act: c.act,
    version: c.version,
    index: c.index,
  };
}
