// Crowd control (combat_and_classes.md 9.1 to 9.3, 9.7): who diminishes, the
// diminishing-returns ladders (full, half, quarter, immune; 18 seconds back to full), the
// immunities by boss layer and family, and the final duration of a control:
//   base x rank factor (3.5) x ladder share (9.2) x (1 + duration modifiers, -75% to +100%)
//   x axis factor (3.7: 0.75 when the target carries a periodic effect of the opposite school)
// rounded to the tick, at least one tick. Pure apart from the ladder bookkeeping on the
// unit; auras.ts asks it before a control aura lands.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { auraDef, monsterDef, secs } from './defs';
import { ccModFactor, DR_LADDER, DR_RESET_SEC, presenceCcFactor } from './formulas';
import type { AuraDef, BossTier, CcKind, DrCategory, School, Unit } from './types';

/** Default ladder of each control kind (9.2); slows do not diminish. */
const DEFAULT_DR: Readonly<Partial<Record<CcKind, DrCategory>>> = {
  stun: 'stun_ctrl',
  root: 'root',
  incapacitate: 'incap',
  fear: 'fear',
  silence: 'silence',
  disarm: 'disarm',
};

/** The opposite school of each school (3.7); nature sits in the middle and has none. */
const AXIS: Readonly<Partial<Record<School, School>>> = {
  fire: 'frost',
  frost: 'fire',
  holy: 'shadow',
  shadow: 'holy',
  physical: 'arcane',
  arcane: 'physical',
};

/** The control kind an aura imposes, slows included (an aura with a `slow` is one). */
export function controlKind(def: AuraDef): CcKind | undefined {
  return def.cc ?? (def.slow ? 'slow' : undefined);
}

/** The ladder a control aura climbs; none for slows and plain auras. */
export function drCategoryOf(def: AuraDef, abilityDr?: DrCategory): DrCategory | undefined {
  if (!def.cc || def.cc === 'slow') return undefined;
  return def.drCategory ?? abilityDr ?? DEFAULT_DR[def.cc];
}

/** The boss layer a monster counts as for immunities (9.3); null when it is no boss. */
export function bossLayer(
  content: ContentMap,
  u: Unit,
): Exclude<BossTier, 'story' | 'tutorial'> | null {
  const mon = monsterDef(content, u.monsterId);
  if (mon?.rank !== 'boss' || mon.tier === 'tutorial') return null;
  const tier = mon.tier ?? 'lair';
  return tier === 'story' ? (mon.storyAs ?? 'lair') : tier;
}

/**
 * Who climbs the ladders (9.2): the player, companions, the player's pets and every person
 * (class units, humanoid people, named NPCs); elite and rare monsters. Normal monsters take
 * every control in full; bosses are immune instead (9.3).
 */
export function diminishes(content: ContentMap, u: Unit): boolean {
  const mon = monsterDef(content, u.monsterId);
  if (!mon) return true;
  if (u.summonerId && u.side === 'ally') return true;
  if (mon.race) return true;
  if (mon.rank === 'boss' && mon.tier === 'tutorial') return true;
  return mon.rank === 'elite' || mon.rank === 'rare';
}

/**
 * Whether a unit is immune to this control (9.3). `tags` are the entity's tags. A tutorial
 * boss counts as an elite: every control lands and climbs the ladder.
 */
export function immuneTo(
  content: ContentMap,
  u: Unit,
  def: AuraDef,
  category: DrCategory | undefined,
  tags: readonly string[],
): boolean {
  const cc = controlKind(def);
  if (!cc) return false;
  const mon = monsterDef(content, u.monsterId);
  // the data's exceptions (11 `ccImmune`, `slowImmune`)
  if (mon?.mechanics?.ccImmune && cc !== 'slow') return true;
  if (mon?.mechanics?.slowImmune && cc === 'slow') return true;
  const layer = bossLayer(content, u);
  if (layer) {
    if (cc !== 'slow') return true;
    return layer !== 'lair';
  }
  if (mon?.rank === 'rare' && (cc === 'fear' || category === 'poly')) return true;
  if (mon?.family === 'construct' && (cc === 'fear' || category === 'sleep')) return true;
  if (category === 'poly' && mon && mon.family !== 'beast' && mon.family !== 'humanoid')
    return true;
  if (category === 'sleep' && mon && mon.family !== 'beast' && mon.family !== 'dragonkin')
    return true;
  if (cc === 'root' && tags.includes('flying')) return true;
  return false;
}

/** Bosses of the great-dungeon and surge layers shrug off forced movement (9.3). */
export function immuneToForcedMove(content: ContentMap, u: Unit): boolean {
  const layer = bossLayer(content, u);
  return layer === 'raid' || layer === 'surge';
}

/** The current share of a ladder (1, 0.5, 0.25 or 0) at `tick`, without changing it. */
export function drShare(u: Unit, category: DrCategory, tick: number): number {
  const st = u.dr?.[category];
  if (!st || st.resetAt <= tick) return 1;
  return DR_LADDER[st.stage] ?? 0;
}

/** Record a control of a category landing (or being refused by the ladder) at `tick`. */
export function climbDr(u: Unit, category: DrCategory, tick: number): void {
  const dr = u.dr ?? {};
  const st = dr[category];
  const stage = !st || st.resetAt <= tick ? 0 : st.stage;
  dr[category] = {
    stage: Math.min(3, stage + 1) as 0 | 1 | 2 | 3,
    resetAt: tick + secs(DR_RESET_SEC),
  };
  u.dr = dr;
}

/** The ladder stage shown on the aura icon (9.2): 0 full, 1 half, 2 quarter, 3 immune. */
export function drStage(u: Unit, category: DrCategory, tick: number): 0 | 1 | 2 | 3 {
  const st = u.dr?.[category];
  if (!st || st.resetAt <= tick) return 0;
  return st.stage;
}

/** Whether the target carries a periodic effect of the school opposite `school` (3.7). */
function opposedDot(content: ContentMap, target: Unit, school: School | undefined): boolean {
  const opposite = school ? AXIS[school] : undefined;
  if (!opposite) return false;
  return target.auras.some((a) => {
    const d = auraDef(content, a.id);
    return !!d?.periodic && (d.periodic.school ?? 'physical') === opposite;
  });
}

export interface ControlInput {
  /** base duration in ticks (the aura's, or an override) */
  baseTicks: number;
  applierTier: number;
  targetTier: number;
  /** ccDurationDone of the applier plus ccDurationTaken of the target */
  modSum: number;
  /** ladder share at landing (1 when the target does not diminish) */
  share: number;
  /** the target carries a periodic effect of the opposite school */
  opposed: boolean;
}

/** The final duration in ticks of a control (9.3): at least one tick. */
export function controlTicks(i: ControlInput): number {
  const t =
    i.baseTicks *
    presenceCcFactor(i.applierTier, i.targetTier) *
    i.share *
    ccModFactor(i.modSum) *
    (i.opposed ? 0.75 : 1);
  return Math.max(1, Math.round(t));
}

export type ControlVerdict =
  /** `stage`: the ladder step it landed at (0 full, 1 half, 2 quarter) */
  | { ok: true; ticks: number; category: DrCategory | undefined; stage: number }
  | { ok: false; reason: 'dr' | 'immune' };

/**
 * Decide a control aura: immune (9.3), refused by the ladder (9.2), or its final duration.
 * Climbs the ladder of a diminishing target when the control lands or is refused by it.
 */
export function resolveControl(
  world: World,
  content: ContentMap,
  def: AuraDef,
  target: Unit,
  applier: Unit,
  opts: {
    baseTicks: number;
    modSum: number;
    school?: School;
    abilityDr?: DrCategory;
    /** skip the ladder (interrupt lockouts, 9.2) */
    noDr?: boolean;
    /** a state applied at its stated length: no rank factor (presence 3.5) */
    noRankScale?: boolean;
  },
): ControlVerdict {
  const tick = world.meta.tick;
  const category = drCategoryOf(def, opts.abilityDr);
  const tags = world.slices.world.entities[target.id]?.tags ?? [];
  if (immuneTo(content, target, def, category, tags)) return { ok: false, reason: 'immune' };
  const ladder = !opts.noDr && category && diminishes(content, target) ? category : undefined;
  const share = ladder ? drShare(target, ladder, tick) : 1;
  if (ladder) climbDr(target, ladder, tick);
  if (share <= 0) return { ok: false, reason: 'dr' };
  const ticks = controlTicks({
    baseTicks: opts.baseTicks,
    applierTier: opts.noRankScale ? target.tier : applier.tier,
    targetTier: target.tier,
    modSum: opts.modSum,
    share,
    opposed: opposedDot(content, target, opts.school),
  });
  const stage = Math.max(0, DR_LADDER.indexOf(share));
  return { ok: true, ticks, category, stage };
}
