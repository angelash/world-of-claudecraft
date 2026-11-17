// Key evaluation (钥, thousand_doors.md 5; power_system.md 9.4) and event counting. The
// judge is read-only and draws no randomness: it reads flags (through the registry
// resolver, so an alias reads its canonical name), the player's inventory, the party's
// bonds, the visit record, the door rank and the doors' own counters, and never writes
// the world. Counters are written only by the event handlers (countEvent) and the
// sequence steps only by advanceSequences (./sequence.ts).

import type { ContentMap, FlagValue } from '../../core/contracts';
import type { World } from '../../core/world';
import { countItem } from '../inventory';
import { bondReached } from '../party/bond';
import { actIndex, evaluate, flagResolver, type Resolver, truthy } from '../quests/conditions';
import type { DoorDef, KeyCond, KeyType } from './types';

export { COUNTABLE_EVENTS, KEY_TYPES } from './types';

export interface KeyProgress {
  label: string;
  met: boolean;
  cur?: number;
  need?: number;
  /** the key's primitive or combinator (an icon in the corridor view) */
  kind?: KeyType;
  /** an alt key whose substitutes are in force (the original's person is absent) */
  substitute?: boolean;
  /**
   * under way: met, or a counted, held or won share gathered, or a combinator part of whose
   * keys is under way (what shows a door, 3.3). A trust or rank reading alone is not: every
   * person starts with some trust and every player with rank 1.
   */
  started?: boolean;
  /** whether the corridor shows this key at the door's hint level (set by the view) */
  shown?: boolean;
}

/** Story act as a number: prologue 0, act1 to act6, epilogue 7 (default act 1). */
export function actNumber(v: FlagValue | undefined): number {
  const idx = actIndex(v);
  if (!Number.isNaN(idx)) return idx;
  const m = typeof v === 'string' ? /^act(\d)$/.exec(v) : null;
  return m ? Number(m[1]) : 1;
}

function resolverOf(world: World): Resolver {
  return flagResolver(world.meta.flags);
}

function numOf(v: FlagValue | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function flagMet(v: FlagValue | undefined, k: Extract<KeyCond, { type: 'flag' }>): boolean {
  if (k.equals !== undefined) return v === k.equals;
  // the act flag holds an act name; it compares by its index (act4 is 4)
  if (k.min !== undefined) {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? actIndex(v) : Number.NaN;
    return !Number.isNaN(n) && n >= k.min;
  }
  return truthy(v);
}

/** Highest trust anyone holds toward the player (the `*` trust key). */
function bestTrust(world: World): number {
  let best = 0;
  for (const [k, v] of Object.entries(world.meta.flags)) {
    if (k.startsWith('trust.') && typeof v === 'number' && v > best) best = v;
  }
  return best;
}

/**
 * Is a person away for good or for now (5.4: dead, left, captured, hostile, at the
 * spring)? Read from the world-state variables the npc and party systems keep; a person
 * the content does not hold at all counts as absent.
 */
export function personAbsent(world: World, content: ContentMap | undefined, id: string): boolean {
  const f = world.meta.flags;
  if (truthy(f[`npc.${id}.dead`])) return true;
  // captured, turned hostile, at the spring (the NPC system's absence variables)
  if (truthy(f[`npc.${id}.captured`]) || truthy(f[`npc.${id}.hostile`])) return true;
  if (truthy(f[`npc.${id}.at_spring`])) return true;
  if (truthy(f[`companion.${id}.lost`])) return true;
  const st = f[`companion.${id}.state`];
  if (st === 'left' || st === 'dead') return true;
  if (!content) return false;
  const known =
    (content.npcs ?? []).some((n) => n.id === id) ||
    (content.companions ?? []).some((c) => c.id === id);
  return !known;
}

/** The people the original key of an alt leans on. */
export function keyPeople(k: KeyCond): string[] {
  switch (k.type) {
    case 'trust':
      return k.npc === '*' ? [] : [k.npc];
    case 'bond':
      return [k.companion];
    case 'taught':
      return k.mentors;
    case 'flag': {
      const m = /^trust\.([A-Za-z0-9_]+)$/.exec(k.key);
      return m?.[1] ? [m[1]] : [];
    }
    default:
      return [];
  }
}

/** Are the substitutes of an alt key in force? */
export function substitutesOpen(
  world: World,
  content: ContentMap | undefined,
  k: Extract<KeyCond, { type: 'alt' }>,
  resolve: Resolver,
): boolean {
  if (k.when) return evaluate(k.when, resolve);
  const first = k.of[0];
  const people = first ? keyPeople(first) : [];
  return people.length > 0 && people.every((p) => personAbsent(world, content, p));
}

interface EvalEnv {
  world: World;
  content?: ContentMap;
  resolve: Resolver;
}

function evalIn(env: EvalEnv, door: DoorDef, k: KeyCond, path: string): KeyProgress {
  const { world, resolve } = env;
  const doors = world.slices.doors;
  const playerId = world.slices.world.playerId;
  const base = { label: k.label, kind: k.type };
  switch (k.type) {
    case 'deed':
      return { ...base, met: truthy(resolve(`deed.${k.deed}`)) };
    case 'flag':
      return { ...base, met: flagMet(resolve(k.key), k) };
    case 'choice':
      return { ...base, met: resolve(k.key) === k.equals };
    case 'know':
      return { ...base, met: truthy(resolve(k.key)) };
    case 'time': {
      const keyOk = k.key === undefined || truthy(resolve(k.key));
      const actOk = k.act === undefined || actNumber(world.meta.flags.act) >= k.act;
      return { ...base, met: keyOk && actOk };
    }
    case 'cond':
      return { ...base, met: evaluate(k.expr, resolve) };
    case 'trial': {
      if (k.trial !== undefined) return { ...base, met: truthy(resolve(`trial_done.${k.trial}`)) };
      const need = k.min ?? 1;
      const cur = numOf(resolve(`trial_wins.${k.goddess ?? ''}`));
      return { ...base, met: cur >= need, cur: Math.min(cur, need), need, started: cur > 0 };
    }
    case 'count': {
      const cur = doors.counters[`${door.id}:${path}`] ?? 0;
      const met = cur >= k.count;
      return { ...base, met, cur: Math.min(cur, k.count), need: k.count, started: cur > 0 };
    }
    case 'item': {
      const need = k.count ?? 1;
      const cur = countItem(world, playerId, k.itemId);
      return { ...base, met: cur >= need, cur: Math.min(cur, need), need, started: cur > 0 };
    }
    case 'trust': {
      const cur = k.npc === '*' ? bestTrust(world) : numOf(resolve(`trust.${k.npc}`));
      return { ...base, met: cur >= k.min, cur: Math.min(cur, k.min), need: k.min };
    }
    case 'bond':
      return { ...base, met: bondReached(world, k.companion, k.min) };
    case 'taught':
      return { ...base, met: k.mentors.some((m) => truthy(resolve(`taught.${k.door}.${m}`))) };
    case 'visit': {
      const key = k.location ? `loc:${k.mapId}/${k.location}` : `map:${k.mapId}`;
      return { ...base, met: !!doors.visited[key] };
    }
    case 'dungeon': {
      const cleared = truthy(resolve(`dg.${k.dungeon}.cleared`));
      const deep = k.depth === undefined || numOf(resolve(`dg.${k.dungeon}.depth`)) >= k.depth;
      return { ...base, met: cleared && deep };
    }
    case 'rank': {
      const cur = doors.rank ?? 1;
      return { ...base, met: cur >= k.min, cur: Math.min(cur, k.min), need: k.min };
    }
    case 'door': {
      const rt = doors.doors[k.doorId];
      const open = rt?.state === 'opened';
      const tierOk =
        k.tier === undefined || k.tier <= 1 || numOf(resolve(`door.${k.doorId}.tier`)) >= k.tier;
      return { ...base, met: open && tierOk };
    }
    case 'all': {
      let cur = 0;
      let started = false;
      k.of.forEach((sub, i) => {
        const p = evalIn(env, door, sub, `${path}.${i}`);
        if (p.met) cur++;
        if (isStarted(p)) started = true;
      });
      return { ...base, met: cur >= k.of.length, cur, need: k.of.length, started };
    }
    case 'any': {
      const need = k.need ?? 1;
      let cur = 0;
      let started = false;
      k.of.forEach((sub, i) => {
        const p = evalIn(env, door, sub, `${path}.${i}`);
        if (p.met) cur++;
        if (isStarted(p)) started = true;
      });
      return { ...base, met: cur >= need, cur: Math.min(cur, need), need, started };
    }
    case 'seq': {
      const step = doors.counters[seqCounter(door.id, path)] ?? 0;
      const need = k.of.length;
      const first = k.of[0];
      const started =
        step > 0 || (step === 0 && !!first && isStarted(evalIn(env, door, first, `${path}.0`)));
      return {
        ...base,
        met: step >= need,
        cur: Math.max(0, Math.min(step, need)),
        need,
        started,
      };
    }
    case 'alt': {
      // the reading follows the original key, or the best substitute once they are in force
      const first = k.of[0];
      const orig = first ? evalIn(env, door, first, `${path}.0`) : undefined;
      const subs = substitutesOpen(world, env.content, k, resolve);
      let best = orig;
      if (!orig?.met && subs) {
        for (let i = 1; i < k.of.length; i++) {
          const sub = k.of[i];
          if (!sub) continue;
          const p = evalIn(env, door, sub, `${path}.${i}`);
          if (p.met || (isStarted(p) && !isStarted(best))) best = p;
          if (p.met) break;
        }
      }
      return {
        ...base,
        met: !!best?.met,
        cur: best?.cur,
        need: best?.need,
        substitute: subs,
        started: isStarted(best),
      };
    }
    default:
      // a key type the judge does not know (the validator rejects it) is never met
      return { label: (k as { label?: string }).label ?? '', met: false };
  }
}

/** Is a key reading under way (see KeyProgress.started)? */
export function isStarted(p: KeyProgress | undefined): boolean {
  return !!p && (p.met || !!p.started);
}

/**
 * Evaluate one key; `path` addresses its counter. Pure: the same world gives the same
 * answer and nothing is written. `content` lets an alt key see whether its person exists.
 */
export function evalKey(
  world: World,
  door: DoorDef,
  k: KeyCond,
  path: string,
  content?: ContentMap,
): KeyProgress {
  return evalIn({ world, content, resolve: resolverOf(world) }, door, k, path);
}

export function keyProgress(world: World, door: DoorDef, content?: ContentMap): KeyProgress[] {
  const env = { world, content, resolve: resolverOf(world) };
  return door.keys.map((k, i) => evalIn(env, door, k, String(i)));
}

export function keysMet(world: World, door: DoorDef, content?: ContentMap): boolean {
  return keyProgress(world, door, content).every((p) => p.met);
}

/** Is any key under way (met, or a count, an item, a win or a combinator part way)? */
export function anyProgress(world: World, door: DoorDef, content?: ContentMap): boolean {
  return keyProgress(world, door, content).some(isStarted);
}

/**
 * Is the door revealed by its own keys (3.3)? A door of the current act or earlier shows
 * once a reveal key (or, without reveal keys, any of its own keys) is met or in progress,
 * so later acts never leak early.
 */
export function revealedByKeys(world: World, door: DoorDef, content?: ContentMap): boolean {
  if (door.act > actNumber(world.meta.flags.act)) return false;
  if (door.reveal) {
    const env = { world, content, resolve: resolverOf(world) };
    return door.reveal.some((k, i) => evalIn(env, door, k, `r.${i}`).met);
  }
  return anyProgress(world, door, content);
}

/** Is the door shown at all: its hint flag door_hint.<id> (Janu's clue tool) or its keys? */
export function revealed(world: World, door: DoorDef, content?: ContentMap): boolean {
  if (world.meta.flags[`door_hint.${door.id}`]) return true;
  return revealedByKeys(world, door, content);
}

/** One read of a door for the refresh: its keys, whether they are met, how it shows. */
export interface DoorReading {
  progress: KeyProgress[];
  met: boolean;
  /** shown by its own keys (of this act or earlier, a reveal key met or any key under way) */
  byKeys: boolean;
  /** shown at all (its keys, or the hint flag door_hint.<id>) */
  shown: boolean;
}

/** Read a door once (one resolver, one pass over its keys). */
export function readDoor(world: World, door: DoorDef, content?: ContentMap): DoorReading {
  const env = { world, content, resolve: resolverOf(world) };
  const progress = door.keys.map((k, i) => evalIn(env, door, k, String(i)));
  const met = progress.every((p) => p.met);
  let byKeys = false;
  if (door.act <= actNumber(world.meta.flags.act)) {
    byKeys = door.reveal
      ? door.reveal.some((k, i) => evalIn(env, door, k, `r.${i}`).met)
      : progress.some(isStarted);
  }
  const shown = byKeys || !!world.meta.flags[`door_hint.${door.id}`];
  return { progress, met, byKeys, shown };
}

/** The sub-keys of a combinator (none for a primitive). */
export function subKeys(k: KeyCond): KeyCond[] {
  return k.type === 'all' || k.type === 'any' || k.type === 'seq' || k.type === 'alt' ? k.of : [];
}

/** Visit every key under `keys` (combinators included) with its counter path. */
export function walkKeys(
  keys: readonly KeyCond[],
  prefix: string,
  visit: (k: KeyCond, path: string) => void,
): void {
  keys.forEach((k, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    visit(k, path);
    const subs = subKeys(k);
    if (subs.length > 0) walkKeys(subs, path, visit);
  });
}

/** The counter holding how many steps of a sequence key are done (-1: void for good). */
export function seqCounter(doorId: string, path: string): string {
  return `seq:${doorId}:${path}`;
}

/**
 * Is a count key at `path` waiting for its turn inside a sequence? Then the event does not
 * count yet (the step would be met out of order).
 */
export function countBlocked(world: World, door: DoorDef, path: string): boolean {
  const parts = path.split('.');
  let keys: readonly KeyCond[] = door.keys;
  let at = '';
  for (let i = 0; i < parts.length - 1; i++) {
    const idx = Number(parts[i]);
    const k = keys[idx];
    at = at ? `${at}.${parts[i]}` : String(parts[i]);
    if (!k) return false;
    if (k.type === 'seq') {
      const next = Number(parts[i + 1]);
      const step = world.slices.doors.counters[seqCounter(door.id, at)] ?? 0;
      if (step < 0 || next > step) return true;
    }
    keys = k.type === 'all' || k.type === 'any' || k.type === 'seq' || k.type === 'alt' ? k.of : [];
  }
  return false;
}

function matches(k: Extract<KeyCond, { type: 'count' }>, data: Record<string, unknown>): boolean {
  for (const [f, v] of Object.entries(k.where ?? {})) if (data[f] !== v) return false;
  for (const [f, v] of Object.entries(k.atLeast ?? {})) {
    const got = data[f];
    if (typeof got !== 'number' || got < v) return false;
  }
  return true;
}

/** Event kinds any door counts (doors subscribes to exactly these). */
export function countedEvents(content: ContentMap): Set<string> {
  const out = new Set<string>();
  for (const door of content.doors ?? []) {
    const add = (k: KeyCond) => {
      if (k.type === 'count') out.add(k.event);
    };
    walkKeys(door.keys, '', add);
    if (door.reveal) walkKeys(door.reveal, 'r', add);
  }
  return out;
}

/** Feed one event to the counters of every door still closed to the player. */
export function countEvent(
  world: World,
  content: ContentMap,
  kind: string,
  data: Record<string, unknown>,
): void {
  const slice = world.slices.doors;
  for (const door of content.doors ?? []) {
    const st = slice.doors[door.id]?.state;
    if (st === 'opened' || st === 'locked' || st === 'closed') continue;
    const count = (k: KeyCond, path: string) => {
      if (k.type !== 'count' || k.event !== kind || !matches(k, data)) return;
      if (countBlocked(world, door, path)) return;
      const key = `${door.id}:${path}`;
      slice.counters[key] = (slice.counters[key] ?? 0) + 1;
    };
    walkKeys(door.keys, '', count);
    if (door.reveal) walkKeys(door.reveal, 'r', count);
  }
}

/** Every visit key (map and location) any door asks for. */
export function visitTargets(content: ContentMap): { mapId: string; location?: string }[] {
  const out: { mapId: string; location?: string }[] = [];
  const visit = (k: KeyCond) => {
    if (k.type === 'visit') out.push({ mapId: k.mapId, location: k.location });
  };
  for (const door of content.doors ?? []) {
    walkKeys(door.keys, '', visit);
    if (door.reveal) walkKeys(door.reveal, 'r', visit);
  }
  return out;
}

/**
 * The item keys a door's opening uses up (5.5): consume-marked items of the keys that
 * carried it. Every key of `all` and `seq`; the met keys of `any` up to its need; the
 * first met branch of `alt`.
 */
export function consumedItems(
  world: World,
  door: DoorDef,
  content?: ContentMap,
): { itemId: string; count: number }[] {
  const env = { world, content, resolve: resolverOf(world) };
  const out: { itemId: string; count: number }[] = [];
  const take = (k: KeyCond, path: string): void => {
    switch (k.type) {
      case 'item':
        if (k.consume) out.push({ itemId: k.itemId, count: k.count ?? 1 });
        return;
      case 'all':
      case 'seq':
        k.of.forEach((s, i) => {
          take(s, `${path}.${i}`);
        });
        return;
      case 'any': {
        let left = k.need ?? 1;
        k.of.forEach((s, i) => {
          if (left > 0 && evalIn(env, door, s, `${path}.${i}`).met) {
            take(s, `${path}.${i}`);
            left--;
          }
        });
        return;
      }
      case 'alt': {
        for (let i = 0; i < k.of.length; i++) {
          const s = k.of[i];
          if (s && evalIn(env, door, s, `${path}.${i}`).met) {
            take(s, `${path}.${i}`);
            return;
          }
        }
        return;
      }
      default:
        return;
    }
  };
  door.keys.forEach((k, i) => {
    take(k, String(i));
  });
  return out;
}
