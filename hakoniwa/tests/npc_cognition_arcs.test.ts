// Cognition arcs and the comedy throttle (PK-M1-18 acceptance; builtin_ai.md 5.6 and 5.7;
// reputation_and_cognition.md 4.5 and 10): onlookers of the player's deeds go from
// disbelief through a misreading to a leap only on evidence, each step voiced by the
// line of its transition when the player is in earshot and kept as the next talk's
// opener when not; the reaction table sets each onlooker's behaviour; the same comedy bit
// fires at most once per town per day and the fourth of a kind in a row drops to
// background chatter; nobody accepts without evidence.

import { describe, expect, it, vi } from 'vitest';
import { Engine, ok } from '../src/core';
import type { AnyWorldEvent } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_DAY, tickAtDay } from '../src/core/time';
import { comedyGate } from '../src/systems/cognition/comedy';
import { isAccepted } from '../src/systems/cognition/params';
import { receive, seedRumor } from '../src/systems/cognition/rumor';
import { transitionSlot } from '../src/systems/npc/brain';
import { npcEntityId } from '../src/systems/npc/personas';
import { getEntity } from '../src/systems/world';
import { ALIVE_CONTENT, ALIVE_SYSTEMS } from './npc_alive_harness';

// these run whole game hours and days of a town: room for a busy machine
vi.setConfig({ testTimeout: 120_000 });

declare module '../src/core/contracts' {
  interface CommandMap {
    'zz_arc.run': Record<string, never>;
  }
}

let pendingFn: ((ctx: SystemContext) => void) | null = null;
const probe: GameSystem = {
  id: 'zz_arc_probe',
  order: 98,
  commands: {
    'zz_arc.run'(ctx) {
      pendingFn?.(ctx);
      pendingFn = null;
      return ok();
    },
  },
};

function game(seed = 7): Engine {
  return Engine.create(seed, ALIVE_CONTENT, [...ALIVE_SYSTEMS, probe], { aiMode: 'off' });
}

function runInTick(g: Engine, fn: (ctx: SystemContext) => void): void {
  pendingFn = fn;
  g.queue('zz_arc.run', {});
  g.step(1);
}

function collect(g: Engine): AnyWorldEvent[] {
  const all: AnyWorldEvent[] = [];
  g.onEvents((evs) => all.push(...evs));
  return all;
}

/** The player stands right next to a person (who then sees the deed up close). */
function besides(g: Engine, id: string): void {
  const e = getEntity(g.world, npcEntityId(id));
  if (!e) throw new Error(`no ${id}`);
  g.queue('world.teleport', { entityId: 'player', mapId: e.mapId, x: e.x + 1, y: e.y });
  g.step(1);
}

function deed(g: Engine, kind = 'elite_kill', tier = 2): void {
  g.queue('zz_alive.feat', { kind, tier });
  g.step(2);
}

const belief = (g: Engine, id: string) => g.world.slices.cognition.beliefs[id]?.player;

describe('the transition lines (builtin_ai.md 5.7)', () => {
  it('maps each state change to its line slot', () => {
    expect(transitionSlot('unaware', 'doubt', null)).toBe('unbelief.deny');
    expect(transitionSlot('doubt', 'explaining', 'luck')).toBe('unbelief.explain.luck');
    expect(transitionSlot('explaining', 'wavering', null)).toBe('unbelief.waver');
    expect(transitionSlot('wavering', 'worship', null)).toBe('react.belief_worship');
    expect(transitionSlot('wavering', 'hostile', null)).toBe('react.belief_hostile');
    expect(transitionSlot('worship', 'wavering', null)).toBe('unbelief.waver');
    expect(transitionSlot('explaining', 'doubt', null)).toBe('unbelief.explain');
  });
});

describe('a cognition arc in town', () => {
  it('runs disbelief, a misreading and a leap on evidence, the leap said aloud', () => {
    const g = game(3);
    const seen = collect(g);
    g.step(tickAtDay(0, 10) - g.tick);
    besides(g, 'ron');
    for (let i = 0; i < 6 && !isAccepted(belief(g, 'ron')?.state ?? 'unaware'); i++) {
      deed(g);
      g.step(300);
    }
    const states = seen
      .filter((e) => e.kind === 'cognition.belief_changed' && e.data.observerId === 'ron')
      .flatMap((e) => (e.kind === 'cognition.belief_changed' ? [e.data.from, e.data.to] : []));
    expect(states).toContain('explaining');
    const b = belief(g, 'ron');
    expect(b && isAccepted(b.state)).toBe(true);
    // the leap stands on evidence: seen up close, from two independent deeds
    expect(b?.evidence.some((x) => x.kind === 'seen' || x.kind === 'seen_close')).toBe(true);
    expect(
      new Set(b?.evidence.filter((x) => x.weight > 0).map((x) => x.ind)).size,
    ).toBeGreaterThanOrEqual(2);
    // Ron spoke on the spot; the reaction table recorded his behaviour
    expect(
      seen.some((e) => e.kind === 'dialogue.line' && e.data.speakerId === npcEntityId('ron')),
    ).toBe(true);
    expect(seen.some((e) => e.kind === 'npc.reaction' && e.data.npcId === 'ron')).toBe(true);
    expect(g.world.slices.npc.npcs.ron?.brain?.opener ?? null).toBeNull();
  });

  it('keeps a transition heard of offscreen as the opener of the next talk', () => {
    const g = game(4);
    g.step(tickAtDay(0, 10) - g.tick);
    // the player is away; Ron hears of a deed from someone who saw it
    runInTick(g, (ctx) => {
      ctx.emit('cognition.belief_changed', {
        observerId: 'ron',
        subjectId: 'player',
        from: 'unaware',
        to: 'doubt',
        explanation: null,
        reason: 'zz',
      });
    });
    g.step(1);
    expect(g.world.slices.npc.npcs.ron?.brain?.opener?.slot).toBe('unbelief.deny');
    // seven game days later it has gone stale
    g.step(8 * TICKS_PER_GAME_DAY);
    besides(g, 'ron');
    g.queue('dialogue.talk', { npcId: npcEntityId('ron') });
    g.step(1);
    const first = JSON.stringify(g.world.slices.dialogue.session?.lines[0]?.text);
    expect(first).not.toContain('unbelief_deny');
  });

  it('never accepts on what people say alone (an adult needs to see it)', () => {
    const g = game(5);
    g.step(tickAtDay(0, 10) - g.tick);
    runInTick(g, (ctx) => {
      const r = seedRumor(ctx, {
        anchor: 'zz:rumors',
        topic: 'elite_kill',
        subject: 'player',
        mapId: 'borderstone',
        place: 'x',
        apparent: 25,
        count: 1,
        details: [],
        famous: [],
        tier: 2,
      });
      // twelve independent tellers, all believed
      for (let i = 0; i < 12; i++)
        receive(
          ctx,
          'bron',
          {
            rumor: r,
            v: { ...r.truth },
            cred: 0.95,
            origin: `zz_teller_${i}`,
            hops: 1,
            fromId: `zz_teller_${i}`,
            fromName: 'x',
          },
          'borderstone',
        );
    });
    const b = belief(g, 'bron');
    expect(b?.evidence.filter((x) => x.kind === 'rumor').length).toBeGreaterThan(3);
    expect(isAccepted(b?.state ?? 'unaware')).toBe(false);
  });
});

describe('the comedy throttle (reputation_and_cognition.md 4.5)', () => {
  it('lets a bit fire once per town per day and drops the fourth in a row to the background', () => {
    const g = game();
    const gates: string[] = [];
    for (let day = 0; day < 4; day++) {
      g.step(tickAtDay(day, 12) - g.tick);
      runInTick(g, (ctx) => {
        gates.push(comedyGate(ctx, 'borderstone', 'refute'));
        gates.push(comedyGate(ctx, 'borderstone', 'refute'));
      });
    }
    expect(gates).toEqual(['full', 'none', 'full', 'none', 'full', 'none', 'background', 'none']);
    // another town keeps its own count
    runInTick(g, (ctx) => expect(comedyGate(ctx, 'wallenburg', 'refute')).toBe('full'));
  });

  it('keeps the onlookers of a second appraisal joke on the same day silent', () => {
    const g = game(23);
    const seen = collect(g);
    g.step(tickAtDay(0, 10) - g.tick);
    besides(g, 'lina');
    const appraise = () => {
      g.queue(
        'cognition.appraise',
        { observerId: npcEntityId('lina'), targetId: 'player', device: 'crystal' },
        { type: 'script', script: 'zz' },
      );
      g.step(2);
    };
    appraise();
    const lines1 = seen.filter((e) => e.kind === 'dialogue.line' && e.data.kind === 'say').length;
    expect(seen.some((e) => e.kind === 'identity.exposed')).toBe(true);
    appraise();
    const lines2 = seen.filter((e) => e.kind === 'dialogue.line' && e.data.kind === 'say').length;
    expect(lines2).toBe(lines1);
  });
});
