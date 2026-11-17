// Boss and elite mechanics driven by health thresholds and timers: phases (ability list
// swaps, phase auras, lines), summons, enrage, and Sasha-style ramping. Data lives in
// MonsterDef.mechanics; this module only interprets it.

import type { SystemContext } from '../../core/system';
import { getEntity } from '../world';
import type { Entity } from '../world/types';
import { applyAura } from './auras';
import { monsterDef, secs } from './defs';
import { combatMod } from './difficulty';
import { spawnMonster } from './spawning';
import { deriveStats } from './stats';
import { addThreat, engage } from './threat';
import type { Unit } from './types';
import { unitOf } from './units';

function say(ctx: SystemContext, u: Unit, e: Entity, text: string | undefined): void {
  if (!text) return;
  ctx.emit('dialogue.line', { speakerId: u.id, speakerName: e.name, text, kind: 'say' });
}

export function tickBoss(ctx: SystemContext, u: Unit): void {
  const mon = monsterDef(ctx.content, u.monsterId);
  const m = mon?.mechanics;
  const brain = u.ai;
  const e = getEntity(ctx.world, u.id);
  if (!mon || !m || !brain || !e) return;
  const frac = u.hp / Math.max(1, deriveStats(ctx.world, ctx.content, u).maxHp);

  const phases = m.phases ?? [];
  for (let i = brain.phase; i < phases.length; i++) {
    const p = phases[i];
    if (!p || frac > p.belowPct) break;
    brain.phase = i + 1;
    if (p.abilities) u.phaseAbilities = [...p.abilities];
    if (p.aura) applyAura(ctx, u, p.aura, u);
    say(ctx, u, e, p.say);
    ctx.emit('combat.boss_phase', {
      entityId: u.id,
      bossId: mon.id,
      phase: brain.phase,
      name: p.name,
    });
  }

  (m.summon ?? []).forEach((s, i) => {
    if (brain.summoned.includes(i) || frac > s.atPct) return;
    brain.summoned.push(i);
    say(ctx, u, e, s.say);
    for (let k = 0; k < s.count; k++) {
      const a = (k / Math.max(1, s.count)) * Math.PI * 2;
      const add = spawnMonster(
        ctx,
        s.monster,
        e.mapId,
        e.x + Math.cos(a) * 1.5,
        e.y + Math.sin(a) * 1.5,
        {
          side: u.side,
          summonerId: u.id,
        },
      );
      if (!add) continue;
      for (const [id, v] of Object.entries(u.threat).sort()) {
        const foe = unitOf(ctx.world, id);
        if (!foe) continue;
        addThreat(ctx, add, id, v * 0.5);
        engage(ctx, add, foe);
      }
    }
  });

  // the difficulty moves the soft enrage (16): story at 0.7 of the threshold, hard at 1.15
  if (
    m.enrage &&
    !brain.enraged &&
    frac <= m.enrage.belowPct * combatMod(ctx.world, 'soft_enrage')
  ) {
    brain.enraged = true;
    applyAura(ctx, u, m.enrage.aura, u, { permanent: true });
    say(ctx, u, e, m.enrage.say);
  }

  if (m.ramp && brain.rampAt > 0 && ctx.tick >= brain.rampAt) {
    brain.rampAt = ctx.tick + secs(m.ramp.every);
    applyAura(ctx, u, m.ramp.aura, u);
  }
}

/** Forget phases and summons when a boss resets. */
export function resetBoss(u: Unit): void {
  const brain = u.ai;
  if (!brain) return;
  brain.phase = 0;
  brain.summoned = [];
  brain.enraged = false;
  brain.rampAt = 0;
  u.phaseAbilities = undefined;
}
