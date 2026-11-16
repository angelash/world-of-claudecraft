// Multi-dimensional, directed relations (npc_society_ai.md 6): trust, like, awe,
// interest and stance alignment. Every change is logged with its reason; relations
// toward the player are mirrored to the reveal-ledger flag trust.<role>.

import type { SystemContext } from '../../core/system';
import { type KeyText, type TextParam, tr } from '../../core/text';
import { RELATION_LOG_CAP } from './constants';
import { personaById, trustFlagKey } from './personas';
import TRAIT_WORDS from './trait_words.json';
import type { Mind, NpcSlice, PersonaCard, RelationDims } from './types';

export function neutralRelation(): RelationDims {
  return { trust: 50, like: 0, awe: 0, interest: 0, align: 0 };
}

const RANGE: Record<keyof RelationDims, [number, number]> = {
  trust: [0, 100],
  like: [-100, 100],
  awe: [0, 100],
  interest: [-100, 100],
  align: [-100, 100],
};

function clampDim(k: keyof RelationDims, v: number): number {
  const [lo, hi] = RANGE[k];
  return Math.max(lo, Math.min(hi, v));
}

/** Initial relation of a persona toward the player from the act table attitude. */
export function playerSeed(p: PersonaCard): RelationDims {
  return {
    trust: p.attitude,
    like: Math.round((p.attitude - 50) * 1.2),
    awe: 0,
    interest: 0,
    align: 0,
  };
}

/** Fresh mind for a named persona: relation seeds and an empty memory. */
export function seedMind(p: PersonaCard): Mind {
  const rel: Record<string, RelationDims> = { player: playerSeed(p) };
  for (const [other, seed] of Object.entries(p.relations ?? {})) {
    rel[other] = { ...neutralRelation(), ...seed };
  }
  for (const [other, r] of Object.entries(rel)) {
    for (const k of Object.keys(r) as (keyof RelationDims)[]) r[k] = clampDim(k, r[k]);
    rel[other] = r;
  }
  const base: Record<string, RelationDims> = {};
  for (const [other, r] of Object.entries(rel)) base[other] = { ...r };
  return { mem: [], folded: 0, digest: [], rel, base, relLog: [] };
}

export function relationOf(slice: NpcSlice, from: string, to: string): RelationDims {
  return slice.minds[from]?.rel[to] ?? neutralRelation();
}

/**
 * Personality scaling of a change (stubborn, grudging, forgiving; design 6.2). The trait
 * words are content vocabulary matched against the persona cards' trait text; they live in
 * trait_words.json until the cards carry trait codes (data/, content pipeline follow-up).
 */
function scale(p: PersonaCard | undefined, v: number): number {
  if (!p) return v;
  let f = 1;
  if (p.traits.includes(TRAIT_WORDS.stubborn)) f *= 0.7;
  if (v < 0 && p.traits.includes(TRAIT_WORDS.grudging)) f *= 1.5;
  if (v < 0 && p.traits.includes(TRAIT_WORDS.forgiving)) f *= 0.6;
  return v * f;
}

/** Port: change a directed relation. No-op for subjects without a mind (L4). */
export function adjustRelation(
  ctx: SystemContext,
  from: string,
  to: string,
  delta: Partial<RelationDims>,
  reason: TextParam,
): void {
  const slice = ctx.world.slices.npc;
  const mind = slice.minds[from];
  if (!mind || from === to) return;
  const p = personaById(ctx.content, from);
  let rel = mind.rel[to];
  if (!rel) {
    rel = neutralRelation();
    mind.rel[to] = rel;
    mind.base[to] = { ...rel };
  }
  const applied: Partial<RelationDims> = {};
  for (const k of Object.keys(delta) as (keyof RelationDims)[]) {
    const d = delta[k];
    if (d === undefined || d === 0) continue;
    const before = rel[k];
    rel[k] = Math.round(clampDim(k, before + scale(p, d)) * 100) / 100;
    if (rel[k] !== before) applied[k] = Math.round((rel[k] - before) * 100) / 100;
  }
  if (Object.keys(applied).length === 0) return;
  mind.relLog.push({ tick: ctx.tick, to, delta: applied, reason });
  if (mind.relLog.length > RELATION_LOG_CAP)
    mind.relLog.splice(0, mind.relLog.length - RELATION_LOG_CAP);
  if (to === 'player') {
    ctx.emit('npc.relation_changed', { from, to, delta: applied, reason });
    if (p) ctx.setFlag(trustFlagKey(p), Math.round(rel.trust));
  }
}

/**
 * Daily decay toward the baseline (design 6.3): like 1%, trust 0.3%, awe 3% a week;
 * relations with any dimension at |70| or more decay at half speed.
 */
export function decayRelations(mind: Mind): void {
  for (const [to, r] of Object.entries(mind.rel)) {
    const b = mind.base[to] ?? neutralRelation();
    const strong = Math.max(Math.abs(r.like), r.trust, r.awe, Math.abs(r.interest)) >= 70;
    const h = strong ? 0.5 : 1;
    r.like = Math.round((r.like + (b.like - r.like) * 0.01 * h) * 100) / 100;
    r.trust = Math.round((r.trust + (b.trust - r.trust) * 0.003 * h) * 100) / 100;
    r.awe = Math.round((r.awe + (b.awe - r.awe) * (0.03 / 7) * h) * 100) / 100;
  }
}

/** Display band for a relation toward the player (never raw numbers in UI). */
export function relationBand(r: RelationDims): KeyText {
  if (r.like >= 50 && r.trust >= 70) return tr('sys.npc.relation.close');
  if (r.like >= 20) return tr('sys.npc.relation.friendly');
  if (r.like <= -40) return tr('sys.npc.relation.loathing');
  if (r.like <= -15 || r.trust < 35) return tr('sys.npc.relation.wary');
  return tr('sys.npc.relation.neutral');
}
