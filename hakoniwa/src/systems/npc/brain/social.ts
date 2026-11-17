// Social life among named NPCs (builtin_ai.md 5.1): the social layer looks up a good
// partner elsewhere in town (partner score: social need 0.35, liking 0.25, a hot rumor to
// share 0.20, the same activity 0.10, a stance conflict 0.10 for quarrels; below 0.3 nobody
// is worth the walk), and two people who meet choose one interaction of a closed set:
// chat, gossip, asking for help, an invitation, a gift, a quarrel, a reconciliation, a
// silent tip-off, a trade. Each has its gate and its consequences (needs, relations,
// memories, the face need); gossip itself is told by cognition on npc.conversed.

import { weightedIndex } from '../../../core/brain/utility';
import type { Rng } from '../../../core/rng';
import type { SystemContext } from '../../../core/system';
import { type KeyText, tr } from '../../../core/text';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../../../core/time';
import { bumpNeed, ensureNeeds } from '../needs';
import { personaById } from '../personas';
import { adjustRelation, relationOf } from '../relations';
import { hasTrait } from '../traits';
import type { InteractionKind, NpcState } from '../types';
import { remember } from './memory_rules';
import type { BrainDecision } from './root';
import { noteText } from './root';
import { holdingsByHeat, holdsHot } from './sense';
import { ensureBrain, noteRecent, since, sortedNpcIds } from './state';
import type { ActorView } from './view';

const FREE = new Set(['wander', 'chat', 'shop']);
/** The social layer looks someone up at most once per this many ticks. */
export const VISIT_COOLDOWN = 2 * TICKS_PER_GAME_HOUR;

/** The partner score of builtin_ai.md 5.1 (0..1). */
export function partnerScore(
  ctx: SystemContext,
  a: NpcState,
  b: NpcState,
  forQuarrel = false,
): number {
  const slice = ctx.world.slices.npc;
  const rel = relationOf(slice, a.id, b.id);
  const social = ensureNeeds(a.needs).social;
  const theirs = new Set(holdingsByHeat(ctx, b.id).map((h) => h.rumor));
  const cog = ctx.world.slices.cognition;
  const news = holdingsByHeat(ctx, a.id).find((h) => !theirs.has(h.rumor));
  const heat = news ? Math.min(1, cog?.rumors[news.rumor]?.heat ?? 0) : 0;
  const conflict = forQuarrel ? Math.max(0, Math.min(1, -rel.align / 100)) : 0;
  return (
    0.35 * (1 - social / 100) +
    0.25 * ((rel.like + 100) / 200) +
    0.2 * heat +
    0.1 * (a.activity === b.activity ? 1 : 0) +
    0.1 * conflict
  );
}

/** The social layer: look up the best partner elsewhere on the map (L1, L2 beats). */
export function chooseVisit(v: ActorView): BrainDecision | null {
  const { ctx, st } = v;
  if (!FREE.has(v.template.act) || v.hour < 7 || v.hour >= 21) return null;
  const last = v.brain.used['social.visit'];
  if (last !== undefined && ctx.tick - last < VISIT_COOLDOWN) return null;
  const social = ensureNeeds(st.needs).social;
  if (!ctx.rng(`npc.brain.${st.id}`).chance(Math.max(0, 1 - social / 100))) return null;
  const slice = ctx.world.slices.npc;
  let best: { o: NpcState; s: number } | null = null;
  for (const id of sortedNpcIds(slice.npcs)) {
    const o = slice.npcs[id] as NpcState;
    if (o === st || o.resident || o.gone || o.talking || o.mapId !== st.mapId) continue;
    if (o.locId === st.locId || o.activity === 'sleep' || o.activity === 'work') continue;
    if (!o.locId) continue;
    const s = partnerScore(ctx, st, o);
    if (!best || s > best.s) best = { o, s };
  }
  if (!best || best.s < 0.3) return null;
  return {
    act: 'chat',
    at: best.o.locId,
    note: noteText('visit'),
    layer: 'social',
    action: 'social.visit',
    partner: best.o.id,
  };
}

/**
 * Which interaction two named NPCs who meet have (builtin_ai.md 5.1), by gates and a draw;
 * null when they only pass each other by (one of them dislikes the other below the chat
 * gate, and nothing drives a quarrel).
 */
export function chooseInteraction(
  ctx: SystemContext,
  a: NpcState,
  b: NpcState,
  rng: Rng,
  atMarket: boolean,
): InteractionKind | null {
  const slice = ctx.world.slices.npc;
  const ab = relationOf(slice, a.id, b.id);
  const na = ensureNeeds(a.needs);
  const ba = ensureBrain(a);
  const pa = personaById(ctx.content, a.id);
  const pb = personaById(ctx.content, b.id);
  const nb = ensureNeeds(b.needs);
  const bb = ensureBrain(b);
  // a quarrel: stances far apart, or either of them shamed and facing the one who shamed them
  const sore = (na.face < 30 && ba.offender === b.id) || (nb.face < 30 && bb.offender === a.id);
  if (ab.align <= -40 || sore) return 'quarrel';
  // a reconciliation within three days of their quarrel, when it weighs on one of them
  const recent = (q: typeof ba.quarrel, other: string) =>
    q?.with === other && ctx.tick - q.tick <= 3 * TICKS_PER_GAME_DAY;
  if ((recent(ba.quarrel, b.id) || recent(bb.quarrel, a.id)) && (na.peace < 40 || nb.peace < 40))
    return 'reconcile';
  // every other talk needs both sides at liking -20 or better (the chat gate)
  if (ab.like < CHAT_GATE || relationOf(slice, b.id, a.id).like < CHAT_GATE) return null;
  const options: { kind: InteractionKind; w: number }[] = [{ kind: 'chat', w: 3 }];
  if (holdsHot(ctx, a.id, 0.2)) options.push({ kind: 'gossip', w: 2.5 });
  if ((na.money < 30 || na.safety < 35) && ab.like >= 0) options.push({ kind: 'ask_help', w: 1 });
  if (ab.like >= 30 && since(a, 'invited', ctx.tick) > 2 * TICKS_PER_GAME_DAY)
    options.push({ kind: 'invite', w: 0.8 });
  if (
    ab.like >= 40 &&
    hasTrait(pa, 'generous') &&
    since(a, 'gave_gift', ctx.tick) > 2 * TICKS_PER_GAME_DAY
  )
    options.push({ kind: 'gift', w: 0.6 });
  if (atMarket && (pa?.roles?.includes('vendor') || pb?.roles?.includes('vendor')))
    options.push({ kind: 'trade', w: 1.5 });
  if (
    ab.trust >= 50 &&
    hasTrait(pa, 'lawful') &&
    since(a, 'informed', ctx.tick) > TICKS_PER_GAME_DAY
  )
    options.push({ kind: 'inform', w: 0.2 });
  const { index } = weightedIndex(
    rng,
    options.map((o) => o.w),
  );
  return (options[index] ?? options[0])?.kind ?? 'chat';
}

/** The liking both sides need for any talk but a quarrel (builtin_ai.md 5.1). */
export const CHAT_GATE = -20;

const REASON: Record<InteractionKind, () => KeyText> = {
  chat: () => tr('sys.npc.reason.chat'),
  gossip: () => tr('sys.npc.reason.gossip'),
  ask_help: () => tr('sys.npc.reason.ask_help'),
  invite: () => tr('sys.npc.reason.invite'),
  gift: () => tr('sys.npc.reason.gift'),
  quarrel: () => tr('sys.npc.reason.quarrel'),
  reconcile: () => tr('sys.npc.reason.reconcile'),
  inform: () => tr('sys.npc.reason.inform'),
  trade: () => tr('sys.npc.reason.trade'),
};

/**
 * The consequences of an interaction (builtin_ai.md 5.1): needs, relations both ways,
 * memories and the brain's bookkeeping. Returns the memory kind both sides keep, if any.
 */
export function applyInteraction(
  ctx: SystemContext,
  kind: InteractionKind,
  a: NpcState,
  b: NpcState,
  names: { a: string; b: string; place: string },
): void {
  const both = (da: Parameters<typeof adjustRelation>[3], db = da) => {
    adjustRelation(ctx, a.id, b.id, da, REASON[kind]());
    adjustRelation(ctx, b.id, a.id, db, REASON[kind]());
  };
  const na = ensureNeeds(a.needs);
  const nb = ensureNeeds(b.needs);
  switch (kind) {
    case 'chat':
    case 'gossip':
      na.social = Math.min(100, na.social + 15);
      nb.social = Math.min(100, nb.social + 15);
      both({ like: 1, trust: 0.5 });
      return;
    case 'ask_help':
      both({ trust: 1 }, { like: 1 });
      bumpNeed(a.needs, 'peace', 5);
      remember(ctx, a.id, 'asked_help', { other: names.b, place: names.place }, { about: b.id });
      return;
    case 'invite':
      both({ like: 2 });
      noteRecent(a, 'invited', ctx.tick);
      remember(ctx, b.id, 'invited', { other: names.a, place: names.place }, { about: a.id });
      return;
    case 'gift':
      adjustRelation(ctx, b.id, a.id, { like: 6, trust: 1 }, REASON.gift());
      adjustRelation(ctx, a.id, b.id, { like: 1 }, REASON.gift());
      noteRecent(a, 'gave_gift', ctx.tick);
      noteRecent(b, 'gift', ctx.tick);
      remember(ctx, b.id, 'gift', { who: names.a }, { about: a.id });
      return;
    case 'quarrel': {
      const hit = -5 - Math.round(ctx.rng('npc.chat').range(0, 10));
      both({ like: hit });
      bumpNeed(a.needs, 'face', -15);
      bumpNeed(b.needs, 'face', -15);
      ensureBrain(a).quarrel = { with: b.id, tick: ctx.tick };
      ensureBrain(b).quarrel = { with: a.id, tick: ctx.tick };
      ensureBrain(a).offender = b.id;
      ensureBrain(b).offender = a.id;
      noteRecent(a, 'insulted', ctx.tick);
      noteRecent(b, 'insulted', ctx.tick);
      remember(ctx, a.id, 'quarrel', { other: names.b, place: names.place }, { about: b.id });
      remember(ctx, b.id, 'quarrel', { other: names.a, place: names.place }, { about: a.id });
      return;
    }
    case 'reconcile': {
      // the liking lost in the quarrel comes half way back
      const lost = Math.max(0, -relationOf(ctx.world.slices.npc, a.id, b.id).like);
      both({ like: Math.max(2, Math.round(lost / 2)) });
      bumpNeed(a.needs, 'peace', 15);
      bumpNeed(b.needs, 'peace', 10);
      ensureBrain(a).quarrel = null;
      ensureBrain(b).quarrel = null;
      remember(ctx, a.id, 'reconcile', { other: names.b, place: names.place }, { about: b.id });
      remember(ctx, b.id, 'reconcile', { other: names.a, place: names.place }, { about: a.id });
      return;
    }
    case 'inform':
      // a quiet word: the listener now trusts the teller a little more; nobody hears it
      adjustRelation(ctx, b.id, a.id, { trust: 1 }, REASON.inform());
      noteRecent(a, 'informed', ctx.tick);
      return;
    case 'trade':
      both({ interest: 2 });
      na.social = Math.min(100, na.social + 5);
      nb.social = Math.min(100, nb.social + 5);
      return;
  }
}

/** Interactions that are talk (cognition passes rumors on these). */
export const TALK_KINDS: ReadonlySet<InteractionKind> = new Set([
  'chat',
  'gossip',
  'ask_help',
  'invite',
  'reconcile',
  'trade',
]);

/** Banter slot of an interaction (ln_common banter.*, builtin_ai 5.1 lines). */
export function banterSlot(kind: InteractionKind, a: NpcState): string {
  switch (kind) {
    case 'quarrel':
      return 'banter.sour';
    case 'ask_help':
      return 'banter.ask_help';
    case 'invite':
      return 'banter.invite';
    case 'gift':
      return 'banter.gift';
    case 'reconcile':
      return 'banter.reconcile';
    case 'gossip':
      return 'banter.gossip';
    case 'trade':
      return 'banter.shop';
    default: {
      const n = ensureNeeds(a.needs);
      if (n.hunger < 40) return 'banter.hungry';
      if (n.energy < 35) return 'banter.tired';
      return `banter.${a.activity}`;
    }
  }
}
