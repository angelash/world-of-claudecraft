// Presence: create NPC states and entities at world creation, generate the nameless
// L4 residents from templates, and keep entities in sync with flags (companion
// recruitment hides the NPC; requiresFlags and hideWhen gate story presence).

import type { SystemContext } from '../../core/system';
import { calendarAt } from '../../core/time';
import { addMoney } from '../inventory';
import { getEntity, mapById, removeEntity, spawnEntity } from '../world';
import { initialNeeds } from './needs';
import {
  type CardView,
  cardOf,
  entityTagsFor,
  npcEntityId,
  personaById,
  trustFlagKey,
} from './personas';
import { locationById, pointIn, resolvePlace } from './places';
import { seedMind } from './relations';
import { scheduleOf, segmentAt } from './schedule';
import type { GoneReason, NpcState, PersonaCard, ResidentCard } from './types';

function newState(card: CardView): NpcState {
  return {
    id: card.id,
    entityId: npcEntityId(card.id),
    mapId: card.map,
    resident: !!card.resident,
    tier: card.resident ? 4 : 3,
    activity: 'wander',
    locId: '',
    needs: initialNeeds(),
    plan: null,
    planRev: 0,
    sayRev: 0,
    freezeUntil: 0,
    talking: false,
    override: null,
    gone: null,
    earned: 0,
    spent: {},
    track: [],
    lastChatTick: -1_000_000,
    lastSayTick: -1_000_000,
    heat: 0,
    diary: [],
  };
}

function matches(ctx: SystemContext, cond: string): boolean {
  const eq = cond.indexOf('=');
  if (eq < 0) return !!ctx.flag(cond);
  return String(ctx.flag(cond.slice(0, eq)) ?? '') === cond.slice(eq + 1);
}

/** Why a persona should currently be absent from the world, or null when present. */
export function absenceReason(ctx: SystemContext, p: PersonaCard): GoneReason | null {
  if (ctx.flag(`companion.${p.id}.recruited`)) return 'recruited';
  if (p.requiresFlags?.some((f) => !ctx.flag(f))) return 'absent';
  if (p.hideWhen?.some((c) => matches(ctx, c))) return 'hidden';
  return null;
}

/** Spawn the entity at the place scheduled for the current hour. */
function spawnFor(ctx: SystemContext, st: NpcState, card: CardView): void {
  if (!mapById(ctx.content, card.map)) {
    st.gone = 'absent';
    return;
  }
  const hour = calendarAt(ctx.tick).hour;
  const seg = segmentAt(scheduleOf(ctx.content, card), hour);
  const loc =
    resolvePlace(ctx.content, card, seg.at) ?? locationById(ctx.content, card.map, card.home);
  if (!loc) {
    st.gone = 'absent';
    return;
  }
  const pt = pointIn(loc, ctx.rng('npc.spawn'));
  spawnEntity(ctx, {
    id: st.entityId,
    kind: 'npc',
    name: card.name,
    mapId: card.map,
    x: pt.x,
    y: pt.y,
    faction: card.faction,
    appearance: card.appearance,
    speed: 2.4,
    tags: entityTagsFor(card),
    ref: card.id,
  });
  st.mapId = card.map;
  st.locId = loc.id;
  st.activity = seg.act;
  st.note = seg.note;
}

/** Generate the nameless residents of every template (deterministic per world seed). */
export function generateResidents(ctx: SystemContext): ResidentCard[] {
  const rng = ctx.rng('npc.residents');
  const out: ResidentCard[] = [];
  const templates = [...(ctx.content.npcResidents ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  for (const t of templates) {
    if (!mapById(ctx.content, t.map)) continue;
    for (let i = 1; i <= t.count; i++) {
      const palette =
        t.palette.length > 0 ? rng.pick(t.palette) : ['#6b5a45', '#a08a6a', '#e0b894', '#3a2a1a'];
      out.push({
        id: `res_${t.id}_${i}`,
        name: t.name,
        map: t.map,
        home: rng.pick(t.homes),
        work: rng.pick(t.works),
        schedule: t.schedule,
        class: t.class,
        race: t.race,
        level: rng.int(t.level[0], t.level[1]),
        tags: [...t.tags],
        faction: t.faction,
        appearance: { base: t.base ?? 'human', colors: [...palette] },
      });
    }
  }
  return out;
}

/** World creation: states, minds and entities for every persona and resident. */
export function spawnAll(ctx: SystemContext): void {
  const slice = ctx.world.slices.npc;
  const personas = [...(ctx.content.npcs ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  for (const p of personas) {
    const card = cardOf(slice, ctx.content, p.id) as CardView;
    const st = newState(card);
    slice.npcs[p.id] = st;
    slice.minds[p.id] = seedMind(p);
    const why = absenceReason(ctx, p);
    if (why) st.gone = why;
    else spawnFor(ctx, st, card);
    if (p.money) addMoney(ctx, st.entityId, p.money, 'npc.savings');
    ctx.setFlag(trustFlagKey(p), p.attitude);
  }
  for (const r of generateResidents(ctx)) {
    slice.residents[r.id] = r;
    const card = cardOf(slice, ctx.content, r.id) as CardView;
    const st = newState(card);
    slice.npcs[r.id] = st;
    spawnFor(ctx, st, card);
  }
}

/** Re-check story presence after a flag change (recruitment, story exits, arrivals). */
export function syncPresence(ctx: SystemContext): void {
  const slice = ctx.world.slices.npc;
  for (const id of Object.keys(slice.npcs).sort()) {
    const st = slice.npcs[id] as NpcState;
    if (st.resident || st.gone === 'dead') continue;
    const p = personaById(ctx.content, id);
    if (!p) continue;
    const why = absenceReason(ctx, p);
    const has = !!getEntity(ctx.world, st.entityId);
    if (why && has) {
      removeEntity(ctx, st.entityId);
      st.gone = why;
      st.talking = false;
    } else if (!why && !has) {
      st.gone = null;
      spawnFor(ctx, st, cardOf(slice, ctx.content, id) as CardView);
    } else if (!why) {
      st.gone = null;
    } else {
      st.gone = why;
    }
  }
}
