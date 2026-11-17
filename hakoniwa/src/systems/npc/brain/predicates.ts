// The registered predicates of the functional-role trees (builtin_ai.md 2.2 `cond`): names
// joined by AND, a leading ! negates. Each reads the actor's view (its surroundings, its
// needs and relations, its own rumors and memories). Content validation checks every
// predicate a tree names is registered here.

import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../../../core/time';
import { isAccepted } from '../../cognition/params';
import { HOLY_WEEKDAY } from '../constants';
import { ensureNeeds } from '../needs';
import { locationById } from '../places';
import { hasTrait } from '../traits';
import type { NpcState } from '../types';
import {
  beliefAboutPlayer,
  holdingsByHeat,
  holdsHot,
  namedHere,
  peopleNear,
  playerWithin,
  towardPlayer,
} from './sense';
import { since, sortedNpcIds } from './state';
import type { ActorView } from './view';

type Predicate = (v: ActorView) => boolean;

const SOCIAL_KINDS = new Set(['tavern', 'market', 'plaza', 'well', 'creek', 'safe']);
const FREE_ACTS = new Set(['wander', 'chat', 'shop']);

/** Named NPCs of the actor's map, present and not the actor. */
function othersOnMap(v: ActorView): NpcState[] {
  const out: NpcState[] = [];
  const slice = v.ctx.world.slices.npc;
  for (const id of sortedNpcIds(slice.npcs)) {
    const o = slice.npcs[id] as NpcState;
    if (o !== v.st && !o.resident && !o.gone && o.mapId === v.st.mapId) out.push(o);
  }
  return out;
}

export const PREDICATES: Readonly<Record<string, Predicate>> = {
  always: () => true,
  duty_time: (v) => v.template.act === 'work' || v.segment.act === 'work',
  at_work: (v) => v.st.mapId === v.card.map && v.st.locId === v.card.work,
  morning: (v) => v.hour >= 6 && v.hour < 11,
  evening: (v) => v.hour >= 17 && v.hour < 21,
  night: (v) => v.hour >= 21 || v.hour < 6,
  holy_day: (v) => v.weekday === HOLY_WEEKDAY,
  free_time: (v) => FREE_ACTS.has(v.template.act),
  player_near: (v) => !!playerWithin(v.ctx, v.st, 8),
  people_near: (v) => peopleNear(v.ctx, v.st, 6).length > 0,
  has_need: (v) => {
    const n = ensureNeeds(v.st.needs);
    return n.money < 50 || n.duty < 50 || n.safety < 50 || n.peace < 50;
  },
  player_trusts: (v) => towardPlayer(v.ctx, v.st.id).trust >= 40,
  likes_player: (v) => towardPlayer(v.ctx, v.st.id).like >= 20,
  sick_near: (v) =>
    othersOnMap(v).some(
      (o) =>
        ensureNeeds(o.needs).energy < 25 || since(o, 'harmed', v.ctx.tick) <= TICKS_PER_GAME_DAY,
    ),
  at_social_place: (v) => {
    const loc = locationById(v.ctx.content, v.st.mapId, v.st.locId);
    return !!loc && SOCIAL_KINDS.has(loc.kind);
  },
  rumor_around: (v) => {
    const mine = new Set(holdingsByHeat(v.ctx, v.st.id).map((h) => h.rumor));
    return namedHere(v.ctx, v.st).some((o) =>
      holdingsByHeat(v.ctx, o.id).some((h) => !mine.has(h.rumor)),
    );
  },
  doubtful_rumor: (v) =>
    holdingsByHeat(v.ctx, v.st.id).some(
      (h) =>
        h.cred >= 0.3 &&
        h.cred <= 0.7 &&
        (v.ctx.world.slices.cognition?.rumors[h.rumor]?.heat ?? 0) >= 0.2,
    ),
  bard: (v) => v.card.tags.includes('bard') || v.p?.job === 'bard',
  hot_rumor: (v) => holdsHot(v.ctx, v.st.id),
  threat_on_map: (v) => since(v.st, 'threat', v.ctx.tick) <= 6 * TICKS_PER_GAME_HOUR,
  guard: (v) => v.card.tags.includes('guard'),
  pursuer_near: (v) =>
    peopleNear(v.ctx, v.st, 8).some((e) => e.tags.includes('inquisitor') && e.id !== v.st.entityId),
  fearful: (v) => hasTrait(v.p, 'timid'),
  evidence_held: (v) => {
    const mind = v.ctx.world.slices.npc.minds[v.st.id];
    return !!mind?.mem.some((m) => m.src === 'seen' && m.imp >= 0.5 && v.day - m.day <= 14);
  },
  rival_hot: (v) => {
    const b = beliefAboutPlayer(v.ctx, v.st.id);
    if (!b) return false;
    return towardPlayer(v.ctx, v.st.id).like <= 10 || ensureNeeds(v.st.needs).face < 60;
  },
  worth_backing: (v) => {
    const b = beliefAboutPlayer(v.ctx, v.st.id);
    return !!b && isAccepted(b.state) && towardPlayer(v.ctx, v.st.id).like >= 20;
  },
  confessor_waiting: (v) => {
    const church = othersOnMap(v).filter((o) => {
      const loc = locationById(v.ctx.content, o.mapId, o.locId);
      return loc?.kind === 'church';
    });
    return church.some((o) => ensureNeeds(o.needs).peace < 40);
  },
  poor_around: (v) => othersOnMap(v).some((o) => ensureNeeds(o.needs).money < 30),
};

export const PREDICATE_NAMES: ReadonlySet<string> = new Set(Object.keys(PREDICATES));

/** Evaluate a predicate expression (`a AND !b`); an unknown name reads false. */
export function holdsExpr(v: ActorView, expr: string): boolean {
  for (const { name, neg } of termsOf(expr)) {
    let value = v.memo.get(name);
    if (value === undefined) {
      const f = PREDICATES[name];
      value = f ? f(v) : false;
      v.memo.set(name, value);
    }
    if (value === neg) return false;
  }
  return true;
}

const termCache = new Map<string, readonly { name: string; neg: boolean }[]>();

/** The AND terms of a predicate expression (parsed once per expression text). */
function termsOf(expr: string): readonly { name: string; neg: boolean }[] {
  let terms = termCache.get(expr);
  if (!terms) {
    terms = expr
      .split(' AND ')
      .map((raw) => raw.trim())
      .filter((part) => part !== '')
      .map((part) =>
        part.startsWith('!') ? { name: part.slice(1), neg: true } : { name: part, neg: false },
      );
    termCache.set(expr, terms);
  }
  return terms;
}
