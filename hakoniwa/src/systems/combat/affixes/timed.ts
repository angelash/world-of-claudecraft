// Timed affixes of the mechanic field registry (combat_and_classes.md 11): while a monster
// fights, each of these comes every `every` seconds of its fight (the first one `every`
// seconds in), in registry order, and every area one is a ground warning (10.3) at the plain
// lead: `aoePulse` (a circle of damage round it), `stomp` (damage and a short stun on the
// proc ladder), `aoeSlow` (a circle that slows), `charge` (a line warning to a foe at least
// `minRange` away, then it lands beside the foe), `stoneskin` (an absorb shield on itself),
// `bigCast` (the named ability with its own cast and warning). `desperateHeal` comes once a
// fight below its line: an interruptible cast that heals `pct` of its health. A warning the
// cap holds back waits for the next tick.

import type { SystemContext } from '../../../core/system';
import { getEntity } from '../../world';
import type { Entity } from '../../world/types';
import { useAbility } from '../abilities';
import { applyAura } from '../auras';
import { auraDef, monsterDef, scaled, secs } from '../defs';
import { combatMod } from '../difficulty';
import { deriveStats } from '../stats';
import { MIN_LEAD, warn } from '../telegraph';
import type { MonsterMechanics, School, Unit } from '../types';

/** The template auras of the timed affixes (catalog_abilities_talents.md 3.2). */
export const STOMP_AURA = 'aur_mon_stompstun';
export const SLOW_AURA = 'aur_mon_ashtideslow';
export const SHELL_AURA = 'aur_mon_ashshell';
/** The cast of the desperate heal (catalog_abilities_talents.md 6.3). */
export const DESPERATE_HEAL = 'sk_mon_desperateheal';

const ORDER = ['aoePulse', 'stomp', 'aoeSlow', 'stoneskin', 'bigCast', 'charge'] as const;
type Timed = (typeof ORDER)[number];

/** The slow of the slow template (what an affix's `slow` scales). */
export function templateSlow(ctx: { content: SystemContext['content'] }): number {
  return auraDef(ctx.content, SLOW_AURA)?.slow ?? 0.5;
}

/** The plain lead of an affix warning, by difficulty (10.3). */
function plainLead(ctx: SystemContext): number {
  return Math.max(1, secs(MIN_LEAD.normal * combatMod(ctx.world, 'telegraph_lead')));
}

/** Fire one timed affix; false when it has to wait (the warning cap, a cast in progress). */
function fire(
  ctx: SystemContext,
  u: Unit,
  e: Entity,
  target: Unit | null,
  field: Timed,
  m: MonsterMechanics,
): boolean {
  const lead = plainLead(ctx);
  switch (field) {
    case 'aoePulse': {
      const a = m.aoePulse;
      if (!a) return true;
      return !!warn(ctx, u, null, {
        source: `affix:${field}`,
        shape: { kind: 'circle', radius: a.radius, at: 'self' },
        tier: 'normal',
        leadTicks: lead,
        damage: scaled(a.damage, u.level, 0),
        school: (a.school as School | undefined) ?? 'shadow',
      });
    }
    case 'stomp': {
      const a = m.stomp;
      if (!a) return true;
      return !!warn(ctx, u, null, {
        source: `affix:${field}`,
        shape: { kind: 'circle', radius: a.radius, at: 'self' },
        tier: 'normal',
        leadTicks: lead,
        damage: a.damage ? scaled(a.damage, u.level, 0) : 0,
        school: 'physical',
        aura: STOMP_AURA,
        auraSec: a.duration,
        auraDr: 'stun_proc',
      });
    }
    case 'aoeSlow': {
      const a = m.aoeSlow;
      if (!a) return true;
      return !!warn(ctx, u, null, {
        source: `affix:${field}`,
        shape: { kind: 'circle', radius: a.radius, at: 'self' },
        tier: 'normal',
        leadTicks: lead,
        aura: SLOW_AURA,
        auraSec: a.duration,
        auraScale: a.slow / templateSlow(ctx),
      });
    }
    case 'stoneskin': {
      const a = m.stoneskin;
      if (!a) return true;
      applyAura(ctx, u, SHELL_AURA, u, { absorb: scaled(a.absorb, u.level, 0) });
      return true;
    }
    case 'bigCast': {
      const a = m.bigCast;
      if (!a) return true;
      if (u.cast) return false;
      const r = useAbility(ctx, u, a.ability, target?.id ?? null, { force: true });
      return r.ok || r.code !== 'warn_cap';
    }
    case 'charge': {
      const a = m.charge;
      const te = target ? getEntity(ctx.world, target.id) : undefined;
      if (!a || !te || te.mapId !== e.mapId) return true;
      const d = Math.hypot(te.x - e.x, te.y - e.y);
      if (d < a.minRange) return true;
      const k = Math.max(0, d - (e.radius + te.radius + 0.2)) / Math.max(1e-6, d);
      return !!warn(ctx, u, target, {
        source: `affix:${field}`,
        shape: { kind: 'line', length: d, width: 1.5 },
        tier: 'normal',
        leadTicks: lead,
        damage: a.damage ? scaled(a.damage, u.level, 0) : 0,
        school: 'physical',
        dash: [e.x + (te.x - e.x) * k, e.y + (te.y - e.y) * k],
      });
    }
  }
}

/** One fighting tick of a monster's timed affixes (its fight clock is open). */
export function tickTimedAffixes(
  ctx: SystemContext,
  u: Unit,
  e: Entity,
  target: Unit | null,
): void {
  const fight = u.boss;
  const m = monsterDef(ctx.content, u.monsterId)?.mechanics;
  if (!fight || !m) return;
  for (const field of ORDER) {
    const a = m[field] as { every?: number } | undefined;
    if (!a?.every || a.every <= 0) continue;
    const at = fight.affixAt?.[field] ?? fight.start + secs(a.every);
    if (fight.affixAt?.[field] === undefined)
      fight.affixAt = { ...(fight.affixAt ?? {}), [field]: at };
    if (ctx.tick < at) continue;
    if (!fire(ctx, u, e, target, field, m)) continue;
    fight.affixAt = { ...(fight.affixAt ?? {}), [field]: ctx.tick + secs(a.every) };
  }
  const h = m.desperateHeal;
  if (h && !fight.healed && !u.cast) {
    const max = deriveStats(ctx.world, ctx.content, u).maxHp;
    if (u.hp <= max * h.belowPct && useAbility(ctx, u, DESPERATE_HEAL, u.id, { force: true }).ok)
      fight.healed = true;
  }
}

/** The share of health the desperate heal restores for this caster (its `pct`). */
export function desperatePct(
  ctx: { content: SystemContext['content'] },
  u: Unit,
  base: number,
): number {
  return monsterDef(ctx.content, u.monsterId)?.mechanics?.desperateHeal?.pct ?? base;
}
