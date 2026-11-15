// Battles (warfare) for the autoplayer. Small battles (squad and company scale) are handed
// to the generals with war.auto_resolve, as a lord who trusts their officers would; the
// big ones (legion and coalition), and any battle lost that way, are commanded by hand
// with war.start and war.order: every regiment holds the objective zones (melee on the
// edge facing the enemy, archers behind), and when a decisive objective names an enemy
// hero, the player's heroes go for that hero and strike (the night capture of the act 3
// design). Only player commands.

import type { BattleView, HeroView, RegimentView } from '../../systems/warfare';
import { TICKS_PER_STEP } from '../../systems/warfare';
import type { Autoplayer } from './player';

type Zone = { x: number; y: number; w: number; h: number };

/** Battle scales the bot leaves to the generals on the first try. */
const DELEGATED = new Set(['squad', 'company']);

export class WarCommander {
  /** battles lost per scenario (the next attempt is fought by hand) */
  readonly losses: Record<string, number> = {};
  private orderedAt = -1;

  constructor(private readonly bot: Autoplayer) {
    bot.engine.onEvents((events) => {
      for (const e of events) {
        if (e.kind !== 'battle.ended') continue;
        const id = e.data.scenario ?? '';
        if (e.data.victor !== 'player') this.losses[id] = (this.losses[id] ?? 0) + 1;
      }
    });
  }

  /** Answer a pending battle: delegate a small one, command a big one or a lost one. */
  begin(scenarioId: string, scale: string): number {
    const bot = this.bot;
    const lost = this.losses[scenarioId] ?? 0;
    if (lost === 0 && DELEGATED.has(scale)) {
      bot.intent = { what: `battle ${scenarioId}: hand it to the generals` };
      bot.send({ kind: 'war.auto_resolve', data: { scenarioId } });
    } else {
      bot.intent = { what: `battle ${scenarioId}: take command (attempt ${lost + 1})` };
      bot.send({ kind: 'war.start', data: { scenarioId } });
    }
    this.orderedAt = -1;
    return 2;
  }

  /** Orders for a battle in progress. */
  command(b: BattleView): number {
    const bot = this.bot;
    if (b.mode === 'auto') {
      bot.send({ kind: 'war.auto_resolve', data: { scenarioId: b.scenarioId } });
      return 2;
    }
    bot.intent = { what: `battle ${b.scenarioId} t=${Math.round(b.time)}s` };
    if (this.orderedAt < 0 || b.time - this.orderedAt >= 2) {
      this.orderedAt = b.time;
      this.orders(b);
    }
    return TICKS_PER_STEP;
  }

  private orders(b: BattleView): void {
    const zones = b.objectives
      .filter((o) => o.team === 'player' && o.kind === 'hold' && o.status === 'active' && o.zone)
      .map((o) => o.zone as Zone);
    const mine = b.regiments.filter(
      (r) =>
        r.team === 'player' &&
        r.controller === 'player' &&
        r.count > 0 &&
        !r.broken &&
        r.state !== 'rout' &&
        r.state !== 'gone',
    );
    const foes = b.regiments.filter((r) => r.team === 'enemy' && r.count > 0 && !r.broken);
    if (zones.length === 0) {
      for (const r of mine) {
        const t = nearest(r, foes);
        if (t && r.order?.kind !== 'attack') {
          this.bot.send({
            kind: 'war.order',
            data: { unitId: r.id, kind: 'attack', targetId: t.id },
          });
        }
      }
    } else {
      // share the regiments between the zones, nearest zone first
      const byZone = new Map<Zone, RegimentView[]>(zones.map((z) => [z, []]));
      for (const r of mine) {
        const z = [...zones].sort((a, c) => dist(r, center(a)) - dist(r, center(c)))[0] as Zone;
        byZone.get(z)?.push(r);
      }
      for (const [z, regs] of byZone) {
        const c = center(z);
        const threat = nearest(c, foes);
        const ang = threat ? Math.atan2(threat.y - c.y, threat.x - c.x) : Math.PI / 2;
        place(
          this.bot,
          regs.filter((r) => !r.ranged),
          z,
          c,
          ang,
          0.35,
        );
        place(
          this.bot,
          regs.filter((r) => r.ranged),
          z,
          c,
          ang,
          -0.25,
        );
      }
    }
    const prey = b.objectives.find(
      (o) => o.team === 'player' && o.kind === 'kill_hero' && o.status === 'active',
    );
    const preyId = prey?.heroId;
    const target = preyId ? b.heroes.find((h) => h.id === preyId && !h.down) : undefined;
    for (const h of b.heroes) {
      if (h.team !== 'player' || h.controller !== 'player' || h.down) continue;
      if (target) this.hunt(h, target);
      else this.stand(b, h, zones[0] ?? null, foes);
    }
  }

  /** Go for the named enemy hero and strike when in reach. */
  private hunt(h: HeroView, target: HeroView): void {
    const bot = this.bot;
    bot.send({ kind: 'war.order', data: { unitId: h.id, kind: 'attack', targetId: target.id } });
    const strike = h.abilities.find((a) => a.kind === 'strike' && a.ready);
    if (strike && dist(h, target) <= strike.range + 0.8) {
      bot.send({
        kind: 'war.hero_ability',
        data: { heroId: h.id, abilityId: strike.id, targetId: target.id },
      });
      return;
    }
    const rally = h.abilities.find((a) => (a.kind === 'inspire' || a.kind === 'rally') && a.ready);
    if (rally) bot.send({ kind: 'war.hero_ability', data: { heroId: h.id, abilityId: rally.id } });
  }

  /** Stand in the zone and keep the line's spirits up. */
  private stand(b: BattleView, h: HeroView, zone: Zone | null, foes: RegimentView[]): void {
    const bot = this.bot;
    if (zone) {
      const c = center(zone);
      if (dist(h, c) > 1.5) {
        bot.send({ kind: 'war.order', data: { unitId: h.id, kind: 'move', x: c.x, y: c.y } });
      }
    }
    for (const a of h.abilities) {
      if (!a.ready) continue;
      if (a.kind === 'inspire' || a.kind === 'rally') {
        bot.send({ kind: 'war.hero_ability', data: { heroId: h.id, abilityId: a.id } });
        return;
      }
      if (a.kind === 'charge') continue;
      const t = nearest(h, foes);
      if (t && dist(h, t) <= a.range + t.radius && h.hp > h.maxHp * 0.5) {
        bot.send({
          kind: 'war.hero_ability',
          data: { heroId: h.id, abilityId: a.id, targetId: t.id },
        });
        return;
      }
    }
    void b;
  }
}

function center(z: Zone): { x: number; y: number } {
  return { x: z.x + z.w / 2, y: z.y + z.h / 2 };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearest<T extends { x: number; y: number; id: string }>(
  from: { x: number; y: number },
  list: T[],
): T | undefined {
  return [...list].sort((a, b) => dist(from, a) - dist(from, b) || a.id.localeCompare(b.id))[0];
}

/** Hold a line across the zone, offset toward (depth > 0) or away from the enemy. */
function place(
  bot: Autoplayer,
  regs: RegimentView[],
  z: Zone,
  c: { x: number; y: number },
  ang: number,
  depth: number,
): void {
  if (regs.length === 0) return;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const reach = Math.abs(dx) * z.w + Math.abs(dy) * z.h;
  const across = Math.abs(dx) * z.h + Math.abs(dy) * z.w;
  const ordered = [...regs].sort((a, b) => a.id.localeCompare(b.id));
  ordered.forEach((r, i) => {
    const t = ordered.length === 1 ? 0 : i / (ordered.length - 1) - 0.5;
    const x = clamp(c.x + dx * reach * depth - dy * across * t * 0.8, z.x + 0.5, z.x + z.w - 0.5);
    const y = clamp(c.y + dy * reach * depth + dx * across * t * 0.8, z.y + 0.5, z.y + z.h - 0.5);
    const held =
      r.order?.kind === 'hold' && Math.hypot((r.order.x ?? 0) - x, (r.order.y ?? 0) - y) < 0.6;
    if (!held) bot.send({ kind: 'war.order', data: { unitId: r.id, kind: 'hold', x, y } });
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
