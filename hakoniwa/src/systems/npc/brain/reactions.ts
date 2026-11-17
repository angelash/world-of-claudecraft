// Reactions to the player's deeds and identity exposures (builtin_ai.md 5.6) and the
// cognition-driven lines of "mortals do not believe" (5.7). Cognition computes each
// onlooker's overreach, explanation and state change; here the reaction table
// (data/npc/brain/reactions.json, firstMatch from the top) decides what the person does and
// says now: flee, raise the alarm, kneel in awe, challenge, sidle up, turn cold, recognize
// quietly, or leave it to the unbelief lines. A transition seen while the player is out of
// earshot is kept as an opener for the next conversation (7 game days), and the hostile
// absence variable mirrors a turned-hostile person (thousand_doors.md 5.4).

import { firstMatch, type RuleRow } from '../../../core/brain/rules';
import type { SystemContext } from '../../../core/system';
import { tr } from '../../../core/text';
import { TICKS_PER_GAME_DAY } from '../../../core/time';
import { comedyGate } from '../../cognition/comedy';
import { isAccepted } from '../../cognition/params';
import type { BeliefState, ExplanationId } from '../../cognition/types';
import { entitiesNear } from '../../world';
import { OPENER_DAYS } from '../constants';
import { bumpNeed } from '../needs';
import { cardOf, personaById } from '../personas';
import { adjustRelation, relationOf } from '../relations';
import { bark } from './barks';
import type { ReactionRow } from './library';
import { remember } from './memory_rules';
import { beliefAboutPlayer } from './sense';
import { inEarshot, sayToPlayer } from './speech';
import { ensureBrain, noteRecent } from './state';
import { type ActorView, actorView } from './view';

/** Identity exposure kinds (builtin_ai.md 5.6, a closed set; react.<kind> slots). */
export const IDENTITY_KINDS = [
  'identity_pageless',
  'identity_door',
  'identity_guest',
  'identity_gatemark',
  'identity_pressure',
  'identity_matched',
] as const;
export type IdentityKind = (typeof IDENTITY_KINDS)[number];

declare module '../../../core/contracts' {
  interface EventMap {
    /**
     * The player's identity showed (builtin_ai.md 5.6): any system that sees it happen emits
     * it (cognition for the pageless appraisal); named onlookers within sight react.
     */
    'identity.exposed': { kind: IdentityKind; mapId: string; x: number; y: number };
  }
}

/** What one onlooker's reaction is evaluated against. */
export interface ReactionInput {
  /** feat_seen or an identity exposure kind */
  kind: string;
  subject: string;
  /** the deed's overreach of the onlooker's common sense (0 when none) */
  over: number;
  explanation: ExplanationId | null;
  state: BeliefState | undefined;
  /** the onlooker's state changed with this very observation (the transition line is 5.7's) */
  changed?: boolean;
}

interface ReactionContext {
  v: ActorView;
  x: ReactionInput;
}

const DARK = new Set<string>(['sorcery', 'conspiracy']);

/** The reaction table's predicates (content validation checks every name used). */
export const REACTION_PREDICATES: Readonly<Record<string, (c: ReactionContext) => boolean>> = {
  over_big: (c) => c.x.over >= 20,
  mood_fear: (c) => c.v.mood === 'fear',
  devout: (c) => c.v.card.class === 'clergy' || (c.v.p?.devotion ?? 0) >= 0.6,
  expl_dark: (c) => !!c.x.explanation && DARK.has(c.x.explanation),
  expl_miracle: (c) => c.x.explanation === 'miracle',
  lawman: (c) =>
    c.v.card.tags.includes('guard') ||
    c.v.card.tags.includes('official') ||
    c.v.card.tags.includes('inquisitor'),
  kind_matched: (c) => c.x.kind === 'identity_matched',
  kind_gate: (c) => c.x.kind === 'identity_gatemark' || c.x.kind === 'identity_door',
  trader: (c) =>
    c.v.card.class === 'merchant' ||
    !!c.v.p?.roles?.some((r) => r === 'vendor' || r === 'info' || r === 'patron'),
  gatefolk: (c) => c.v.card.class === 'remnant',
  state_exploit: (c) => c.x.state === 'exploit',
  state_worship: (c) => c.x.state === 'worship',
  state_hostile: (c) => c.x.state === 'hostile',
  state_depend: (c) => c.x.state === 'depend',
  state_unbelief: (c) =>
    c.x.state === 'doubt' || c.x.state === 'explaining' || c.x.state === 'wavering',
};

export const REACTION_PREDICATE_NAMES: ReadonlySet<string> = new Set(
  Object.keys(REACTION_PREDICATES),
);

/** The behaviours a reaction row may name. */
export const REACTION_ACTIONS: ReadonlySet<string> = new Set([
  'flee',
  'alarm',
  'worship',
  'challenge',
  'approach',
  'cold',
  'recognize',
  'unbelief',
  'onlook',
]);

function holds(c: ReactionContext, when: string): boolean {
  for (const raw of when.split(' AND ')) {
    const part = raw.trim();
    if (!part) continue;
    const neg = part.startsWith('!');
    const f = REACTION_PREDICATES[neg ? part.slice(1) : part];
    if ((f ? f(c) : false) === neg) return false;
  }
  return true;
}

export type ReactionResult = 'spoken' | 'quiet' | 'unbelief';

/**
 * React to a deed or an exposure seen by a named NPC: the first reaction row that holds
 * (builtin_ai.md 5.6) sets the behaviour; `mayTalk` allows its line now. 'unbelief' hands
 * the line over to cognition's reaction lines (5.7), 'quiet' means nothing was said.
 */
export function react(
  ctx: SystemContext,
  npcId: string,
  x: ReactionInput,
  mayTalk: boolean,
): ReactionResult {
  const slice = ctx.world.slices.npc;
  const st = slice.npcs[npcId];
  const card = cardOf(slice, ctx.content, npcId);
  const rows = ctx.content.npcBrain?.reactions ?? [];
  if (!st || !card || st.resident || st.gone || rows.length === 0) return 'quiet';
  const v = actorView(ctx, st, card);
  const c: ReactionContext = { v, x };
  // the rows whose predicates hold, then the rule table's priority and tie order
  const live = rows.filter((r) => holds(c, r.cond));
  const picked = firstMatch(live as unknown as RuleRow[], { tick: ctx.tick, holds: () => true });
  const row = picked as unknown as ReactionRow | null;
  if (!row) return 'quiet';
  ctx.emit('npc.reaction', { npcId, row: row.id, eventKind: x.kind, subject: x.subject });
  const then = row.then[0];
  const slot = then?.params?.slot;
  // a stance row on the very observation that moved the stance: the transition is voiced
  // by the cognition-driven line (builtin_ai.md 5.7, "不可能。……好吧，可能。"), the row
  // only sets the behaviour
  const deferLine = !!x.changed && row.cond.trim().startsWith('state_');
  switch (then?.action) {
    case 'unbelief':
      return 'unbelief';
    case 'flee':
      bumpNeed(st.needs, 'safety', -30);
      noteRecent(st, 'threat', ctx.tick);
      break;
    case 'alarm':
      bumpNeed(st.needs, 'peace', -10);
      noteRecent(st, 'pressure', ctx.tick);
      break;
    case 'worship':
      warmRumors(ctx, npcId, 0.2);
      break;
    case 'cold':
      if (x.subject === 'player')
        adjustRelation(ctx, npcId, 'player', { like: -2 }, tr('sys.npc.reason.cold'));
      break;
    case 'onlook':
      if (mayTalk && bark(ctx, st, 'see_feat')) return 'spoken';
      return 'quiet';
    default:
      break;
  }
  if (deferLine) return 'unbelief';
  if (mayTalk && slot && x.subject === 'player') {
    const bit = then?.action === 'alarm' ? 'light' : null;
    const gate = bit ? comedyGate(ctx, st.mapId, bit) : 'full';
    if (gate !== 'none' && sayToPlayer(ctx, st, slot)) return 'spoken';
  }
  return 'quiet';
}

/** Rumors about the player this person holds get hotter (worshippers talk, 5.6 row 6). */
function warmRumors(ctx: SystemContext, npcId: string, by: number): void {
  const cog = ctx.world.slices.cognition;
  if (!cog) return;
  for (const h of cog.holdings[npcId] ?? []) {
    const r = cog.rumors[h.rumor];
    if (r && r.subject === 'player') r.heat = Math.min(1, Math.round((r.heat + by) * 1000) / 1000);
  }
}

/** Named onlookers of an exposure within sight react to it (5.6). */
export function onIdentityExposed(
  ctx: SystemContext,
  d: { kind: IdentityKind; mapId: string; x: number; y: number },
): void {
  const slice = ctx.world.slices.npc;
  const near = entitiesNear(ctx.world, d.mapId, d.x, d.y, 10, (e) => {
    const st = e.ref ? slice.npcs[e.ref] : undefined;
    return e.kind === 'npc' && !!st && !st.resident && !st.gone && st.activity !== 'sleep';
  });
  // the same exposure is a comedy bit like the others (reputation 4.5): the appraisal joke
  // already used today's crystal bit, so its onlookers react without a word
  const gate = comedyGate(ctx, d.mapId, d.kind === 'identity_pageless' ? 'crystal' : 'light');
  let spoken = gate === 'none' ? 2 : 0;
  for (const e of near) {
    const id = e.ref as string;
    const b = beliefAboutPlayer(ctx, id);
    const r = react(
      ctx,
      id,
      {
        kind: d.kind,
        subject: 'player',
        over: 0,
        explanation: b?.explanation ?? null,
        state: b?.state,
      },
      spoken < 2,
    );
    if (r === 'spoken') spoken++;
    remember(
      ctx,
      id,
      'feat_seen',
      { what: tr(`sys.npc.exposure.${d.kind}`) },
      { about: 'player', salience: 0.5 },
    );
  }
}

// ---------------------------------------------------------------------------
// the cognition-driven lines (builtin_ai.md 5.7)

/** The line slot a state transition is voiced with (5.7 "转移时刻的台词"). */
export function transitionSlot(
  from: BeliefState,
  to: BeliefState,
  explanation: ExplanationId | null,
): string | null {
  if (to === 'doubt') return from === 'unaware' ? 'unbelief.deny' : 'unbelief.explain';
  if (to === 'explaining')
    return explanation ? `unbelief.explain.${explanation}` : 'unbelief.explain';
  if (to === 'wavering') return 'unbelief.waver';
  if (to === 'hostile') return 'react.belief_hostile';
  if (to === 'worship' || to === 'exploit' || to === 'depend') return `react.belief_${to}`;
  if (to === 'accepted') return 'unbelief.waver';
  return null;
}

/**
 * A belief about the player changed (cognition.belief_changed): voice it now when the
 * player is in earshot and the person has not just spoken (the witness line already did),
 * else keep it as the opener of the next conversation; mirror the hostile variable.
 */
export function onBeliefChanged(
  ctx: SystemContext,
  d: {
    observerId: string;
    subjectId: string;
    from: BeliefState;
    to: BeliefState;
    explanation: ExplanationId | null;
  },
): void {
  if (d.subjectId !== 'player') return;
  const slice = ctx.world.slices.npc;
  const st = slice.npcs[d.observerId];
  if (!st || st.resident || st.gone) return;
  mirrorHostile(ctx, d.observerId);
  const slot = transitionSlot(d.from, d.to, d.explanation);
  if (!slot) return;
  const b = ensureBrain(st);
  const remembered = isAccepted(d.to) || d.to === 'wavering';
  if (remembered)
    remember(
      ctx,
      d.observerId,
      'belief_changed',
      { who: tr('sys.cognition.subject.player') },
      { about: 'player' },
    );
  // one line a tick per person: a reaction already spoken this tick covers the change
  if (b.spokeTick === ctx.tick) return;
  if (inEarshot(ctx, st, 10)) {
    // in the player's sight the transition is said now, or swallowed by the comedy throttle
    // (the next greeting shows the new stance anyway): it is never kept for later
    const held = d.from === 'explaining' || d.from === 'wavering';
    const gate = held ? comedyGate(ctx, st.mapId, 'refute') : 'full';
    if (gate !== 'none') sayToPlayer(ctx, st, slot, {}, 10);
    return;
  }
  b.opener = {
    slot,
    params: {},
    until: ctx.tick + OPENER_DAYS * TICKS_PER_GAME_DAY,
  };
}

/** Take the opener kept for the next conversation (once; expired ones are dropped). */
export function takeOpener(ctx: SystemContext, npcId: string): string | null {
  const st = ctx.world.slices.npc.npcs[npcId];
  const o = st?.brain?.opener;
  if (!st?.brain || !o) return null;
  st.brain.opener = null;
  return ctx.tick <= o.until ? o.slot : null;
}

/**
 * The hostile absence variable npc.<id>.hostile (thousand_doors.md 5.4): true while the
 * person's belief about the player forked hostile or their liking fell to -60 or lower.
 */
export function mirrorHostile(ctx: SystemContext, npcId: string): void {
  if (!personaById(ctx.content, npcId)) return;
  const b = beliefAboutPlayer(ctx, npcId);
  const like = relationOf(ctx.world.slices.npc, npcId, 'player').like;
  const hostile = b?.state === 'hostile' || like <= -60;
  const key = `npc.${npcId}.hostile`;
  if (!!ctx.flag(key) !== hostile) ctx.setFlag(key, hostile);
}

// ---------------------------------------------------------------------------
// the player's deeds toward a person (thanks owed, builtin_ai.md 3.4 and 5.3)

/** The player rescued or healed a named NPC: memory, relation and a thanks owed. */
export function onDeedFor(ctx: SystemContext, npcId: string, kind: string): void {
  const st = ctx.world.slices.npc.npcs[npcId];
  if (!st || st.resident || st.gone) return;
  const saved = kind === 'rescue';
  noteRecent(st, saved ? 'saved' : 'helped', ctx.tick);
  noteRecent(st, saved ? 'saved_by_player' : 'helped_by_player', ctx.tick);
  remember(
    ctx,
    npcId,
    saved ? 'saved' : 'helped',
    { who: tr('sys.cognition.subject.player') },
    { about: 'player' },
  );
  adjustRelation(
    ctx,
    npcId,
    'player',
    saved ? { like: 5, trust: 3 } : { like: 2, trust: 1 },
    saved ? tr('sys.npc.reason.saved') : tr('sys.npc.reason.helped'),
  );
}

/** The game day of a tick (for the opener's expiry in views). */
