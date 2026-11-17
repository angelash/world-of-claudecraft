// The NPC brain (PK-M1-18; builtin_ai.md 3 to 5): the nine needs and the mood, the layered
// root and its latch, the generic utility library with persona multipliers, the
// functional-role trees on the shared runner (and their state across save and load),
// goals, initiative and its limits, social interactions, memory importance and the rule
// diary, the brain content checks, and the BtRunner's saved state. Real kernel, the social
// systems only.

import { describe, expect, it, vi } from 'vitest';
import { validateNpcContent } from '../src/content/packs/npc';
import { Engine, ok } from '../src/core';
import { Blackboard, type BtEnv, type BtNodeDef, BtRunner } from '../src/core/brain/bt';
import type { AnyWorldEvent } from '../src/core/contracts';
import { Rng } from '../src/core/rng';
import { deserializeWorld, serializeWorld, worldHash } from '../src/core/save/world_file';
import type { GameSystem, SystemContext } from '../src/core/system';
import { calendarAt, TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR, tickAtDay } from '../src/core/time';
import { speak } from '../src/systems/dialogue/speak';
import {
  applyInteraction,
  brainDecide,
  brainProblems,
  chooseApproach,
  chooseInteraction,
  ensureBrain as ensureBrainOf,
  heldByBeat,
  INPUT_IDS,
  memoryImportance,
  moodOf,
  newBrain,
  onBeliefChanged,
  PREDICATE_NAMES,
  playerBusy,
  REACTION_ACTIONS,
  REACTION_PREDICATE_NAMES,
  updateLatch,
} from '../src/systems/npc/brain';
import { actorView } from '../src/systems/npc/brain/view';
import { converse } from '../src/systems/npc/chat';
import { diaryScore, ruleDiary } from '../src/systems/npc/diary';
import { ensureNeeds, initialNeeds, stepNeeds } from '../src/systems/npc/needs';
import { cardOf, npcEntityId } from '../src/systems/npc/personas';
import { locationById } from '../src/systems/npc/places';
import { adjustRelation, relationOf } from '../src/systems/npc/relations';
import { hasTrait, personaDim, traitCodes } from '../src/systems/npc/traits';
import type { NpcState } from '../src/systems/npc/types';
import { getEntity } from '../src/systems/world';
import { ALIVE_CONTENT, ALIVE_SYSTEMS } from './npc_alive_harness';

// these run whole game hours and days of a town: room for a busy machine
vi.setConfig({ testTimeout: 120_000 });

declare module '../src/core/contracts' {
  interface CommandMap {
    'zz_brain.run': Record<string, never>;
  }
}

let pendingFn: ((ctx: SystemContext) => void) | null = null;
const probe: GameSystem = {
  id: 'zz_brain_probe',
  order: 98,
  commands: {
    'zz_brain.run'(ctx) {
      pendingFn?.(ctx);
      pendingFn = null;
      return ok();
    },
  },
};

const SYSTEMS = [...ALIVE_SYSTEMS, probe];
const C = ALIVE_CONTENT;

function game(seed = 7): Engine {
  return Engine.create(seed, C, SYSTEMS, { aiMode: 'off' });
}

function runInTick(g: Engine, fn: (ctx: SystemContext) => void): void {
  pendingFn = fn;
  g.queue('zz_brain.run', {});
  g.step(1);
}

function toBorderstone(g: Engine, x = 30.5, y = 21.5): void {
  g.queue('world.teleport', { entityId: 'player', mapId: 'borderstone', x, y });
  g.step(1);
}

function stepTo(g: Engine, day: number, hour: number, minute = 1): void {
  const t = tickAtDay(day, hour, minute);
  if (t > g.tick) g.step(t - g.tick);
}

function collect(g: Engine): AnyWorldEvent[] {
  const all: AnyWorldEvent[] = [];
  g.onEvents((evs) => all.push(...evs));
  return all;
}

const npc = (g: Engine, id: string) => g.world.slices.npc.npcs[id] as NpcState;

// ---------------------------------------------------------------------------

describe('the nine needs and the mood (builtin_ai.md 3.3)', () => {
  it('has nine needs, and fills the five a world saved before them lacks', () => {
    expect(Object.keys(initialNeeds()).sort()).toEqual(
      ['duty', 'energy', 'face', 'faith', 'hunger', 'money', 'peace', 'safety', 'social'].sort(),
    );
    const old = { hunger: 50, energy: 60, social: 40, faith: 30 } as ReturnType<
      typeof initialNeeds
    >;
    ensureNeeds(old);
    expect(old).toMatchObject({ hunger: 50, safety: 70, face: 70, duty: 80, peace: 70 });
  });

  it('lets the event needs drift back to their baselines and duty fall while work waits', () => {
    const n = initialNeeds();
    n.safety = 20;
    n.face = 40;
    n.peace = 30;
    stepNeeds(n, {}, 'wander');
    expect([n.safety, n.face, n.peace]).toEqual([30, 42, 31]);
    stepNeeds(n, {}, 'pray');
    expect(n.peace).toBe(42);
    const d = n.duty;
    stepNeeds(n, {}, 'wander', { scheduledWork: true });
    expect(n.duty).toBe(d - 8);
    stepNeeds(n, {}, 'work', { scheduledWork: true });
    expect(n.duty).toBe(d + 4);
  });

  it('derives the mood from the first row that holds (fear, anger, worry, weariness, joy, calm)', () => {
    const g = game();
    const st = npc(g, 'ron');
    const t = g.tick;
    expect(moodOf(st, t)).toBe('calm');
    st.needs.energy = 20;
    expect(moodOf(st, t)).toBe('tired');
    st.needs.money = 20;
    expect(moodOf(st, t)).toBe('worried');
    st.brain = { ...newBrain(), recent: { insulted: t } };
    expect(moodOf(st, t)).toBe('angry');
    st.needs.safety = 10;
    expect(moodOf(st, t)).toBe('fear');
    // joy needs the others at 50 or more
    st.needs = initialNeeds();
    st.brain = { ...newBrain(), recent: { gift: t } };
    expect(moodOf(st, t)).toBe('happy');
    expect(moodOf(st, t + 2 * TICKS_PER_GAME_DAY)).toBe('calm');
  });
});

describe('traits as codes (builtin_ai.md 4.1)', () => {
  it("maps the cards' trait words to codes and takes the largest multiplier of a dimension", () => {
    const p = C.npcs.find((x) => x.id === 'ped');
    expect(hasTrait(p, 'frugal')).toBe(true);
    expect(traitCodes(C.npcs.find((x) => x.id === 'shiya')).has('stubborn')).toBe(true);
    expect(personaDim(C.npcBrain.traitDims, p, 'frugal')).toBe(1.3);
    expect(personaDim(C.npcBrain.traitDims, p, 'nothing_here')).toBe(1);
    // ron: 胆小 (timid 1.5 fear) and 关键时刻不跑 (brave 0.6 fear): the largest wins, no product
    const ron = C.npcs.find((x) => x.id === 'ron');
    expect(personaDim(C.npcBrain.traitDims, ron, 'fear')).toBe(1.5);
  });
});

describe('the layered root (builtin_ai.md 2.4 and 4.3)', () => {
  it('latches the need layer under 35 and lets go only once every need is back at 45', () => {
    const g = game();
    runInTick(g, (ctx) => {
      const st = npc(g, 'ron');
      const card = cardOf(ctx.world.slices.npc, ctx.content, 'ron');
      if (!card) throw new Error('no card');
      st.needs.hunger = 30;
      expect(updateLatch(actorView(ctx, st, card))).toBe(true);
      st.needs.hunger = 40;
      expect(updateLatch(actorView(ctx, st, card))).toBe(true);
      st.needs.hunger = 46;
      expect(updateLatch(actorView(ctx, st, card))).toBe(false);
    });
  });

  it('lets a person in danger flee, and holds the emergency for half an hour', () => {
    const g = game();
    toBorderstone(g);
    stepTo(g, 0, 15);
    runInTick(g, (ctx) => {
      const st = npc(g, 'lina');
      const card = cardOf(ctx.world.slices.npc, ctx.content, 'lina');
      if (!card) throw new Error('no card');
      st.brain = { ...newBrain(), recent: { threat: ctx.tick } };
      st.needs.safety = 10;
      const d = brainDecide(ctx, st, card, true);
      expect(d.layer).toBe('emergency');
      expect(['flee', 'seek_help']).toContain(d.action);
      expect(st.brain.emergencyUntil).toBe(ctx.tick + 30 * 20);
    });
    // every pick writes its explanation
    expect(g.recentTraces('lina').some((t) => t.kind === 'npc.emergency')).toBe(true);
  });

  it('keeps people at their duties unless a need is critical, then answers it by persona', () => {
    const g = game();
    toBorderstone(g);
    stepTo(g, 0, 9);
    runInTick(g, (ctx) => {
      const card = cardOf(ctx.world.slices.npc, ctx.content, 'nera');
      if (!card) throw new Error('no card');
      const st = npc(g, 'nera');
      st.needs.hunger = 30;
      expect(brainDecide(ctx, st, card, true).layer).toBe('duty');
      st.needs.hunger = 10;
      const d = brainDecide(ctx, st, card, true);
      expect(d.layer).toBe('need');
      // the rich merchant pays for the tavern
      expect(d.action).toBe('eat_tavern');
      // fear for one's life overrides the duty too (builtin_ai 2.4)
      st.needs.hunger = 80;
      expect(brainDecide(ctx, st, card, true).layer).toBe('duty');
      st.needs.safety = 10;
      expect(brainDecide(ctx, st, card, true).layer).not.toBe('duty');
    });
  });

  it('pursues a goal on its cadence and drops it when its abandon condition holds', () => {
    const g = game();
    toBorderstone(g);
    stepTo(g, 0, 9, 5);
    runInTick(g, (ctx) => {
      const card = cardOf(ctx.world.slices.npc, ctx.content, 'cassian');
      if (!card) throw new Error('no card');
      const st = npc(g, 'cassian');
      const d = brainDecide(ctx, st, card, true);
      expect(d).toMatchObject({ layer: 'goal', action: 'goal.grey_evidence', at: 'orphanage' });
    });
    // three days apart (everyDays 3): not on day 1
    stepTo(g, 1, 9, 5);
    runInTick(g, (ctx) => {
      const card = cardOf(ctx.world.slices.npc, ctx.content, 'cassian');
      if (!card) throw new Error('no card');
      expect(brainDecide(ctx, npc(g, 'cassian'), card, true).layer).not.toBe('goal');
    });
    stepTo(g, 3, 9, 5);
    g.queue('flag.set', { key: 'a1_oola_fate', value: 'cleared' }, { type: 'script', script: 't' });
    g.step(1);
    runInTick(g, (ctx) => {
      const card = cardOf(ctx.world.slices.npc, ctx.content, 'cassian');
      if (!card) throw new Error('no card');
      expect(brainDecide(ctx, npc(g, 'cassian'), card, true).layer).not.toBe('goal');
    });
  });
});

describe('the functional-role trees (builtin_ai.md 4.2 and 4.3)', () => {
  it('holds the service on the holy day and vespers once a day, also across a save and load', () => {
    const g = game();
    toBorderstone(g);
    // the first holy day (weekday 7) is day 6
    stepTo(g, 6, 8);
    expect(calendarAt(g.tick).weekday).toBe(7);
    stepTo(g, 6, 9, 30);
    expect(npc(g, 'cassian').brain?.used['cleric.service']).toBeDefined();
    stepTo(g, 6, 18, 30);
    const vespers = npc(g, 'cassian').brain?.used['cleric.vespers'];
    expect(vespers).toBeDefined();
    expect(npc(g, 'cassian').brain?.bt.duty?.keep['cleric.vespers']?.day).toBe(6);
    // save and load: the once decorator remembers today
    const copy = deserializeWorld(serializeWorld(g.world));
    const g2 = Engine.resume(copy, C, SYSTEMS, { aiMode: 'off' });
    g2.step(TICKS_PER_GAME_HOUR);
    expect(npc(g2, 'cassian').brain?.used['cleric.vespers']).toBe(vespers);
    // the next evening it comes round again
    stepTo(g2, 7, 18, 30);
    expect(npc(g2, 'cassian').brain?.used['cleric.vespers']).toBeGreaterThan(vespers as number);
  });

  it('sends a healer to the neediest patient and leaves them better off and grateful', () => {
    const g = game();
    toBorderstone(g);
    stepTo(g, 0, 10);
    runInTick(g, () => {
      npc(g, 'greta').needs.energy = 10;
    });
    const before = relationOf(g.world.slices.npc, 'greta', 'oola').like;
    g.step(TICKS_PER_GAME_HOUR);
    expect(npc(g, 'oola').brain?.used['healer.treat']).toBeDefined();
    expect(relationOf(g.world.slices.npc, 'greta', 'oola').like).toBeGreaterThan(before);
    expect(
      g.world.slices.npc.minds.greta?.mem.some((m) => m.tag === 'helped' && m.about === 'oola'),
    ).toBe(true);
  });
});

describe('initiative (builtin_ai.md 3.4)', () => {
  it('walks up and speaks first, once a day, three a map an hour, and stops after two walk-aways', () => {
    const g = game();
    const seen = collect(g);
    toBorderstone(g);
    stepTo(g, 0, 9);
    // everyone likes the player and is lonely: many want to come up
    runInTick(g, (ctx) => {
      for (const st of Object.values(ctx.world.slices.npc.npcs)) {
        if (st.resident || st.mapId !== 'borderstone') continue;
        adjustRelation(ctx, st.id, 'player', { like: 60, trust: 30 }, 'zz');
        st.needs.social = 20;
      }
    });
    g.step(3 * TICKS_PER_GAME_HOUR);
    const first = seen.filter((e) => e.kind === 'npc.approached');
    expect(first.length).toBeGreaterThan(0);
    // at most three speak up in any one game hour
    const perHour = new Map<number, number>();
    for (const e of first) {
      const h = Math.floor(e.tick / TICKS_PER_GAME_HOUR);
      perHour.set(h, (perHour.get(h) ?? 0) + 1);
    }
    expect(Math.max(...perHour.values())).toBeLessThanOrEqual(3);
    expect(seen.some((e) => e.kind === 'dialogue.line' && e.data.listenerId === 'player')).toBe(
      true,
    );
    // one approach per person per day
    g.step(6 * TICKS_PER_GAME_HOUR);
    const today = seen.filter((e) => e.kind === 'npc.approached').map((e) => e.data.npcId);
    expect(new Set(today).size).toBe(today.length);
    // nobody answered: the walk-away counts
    const walked = Object.values(g.world.slices.npc.npcs).filter(
      (s) => (s.brain?.approach.ignored ?? 0) > 0 || (s.brain?.approach.stopWeek ?? -1) >= 0,
    );
    expect(walked.length).toBeGreaterThan(0);
    stepTo(g, 1, 20);
    const stopped = Object.values(g.world.slices.npc.npcs).filter(
      (s) => (s.brain?.approach.stopWeek ?? -1) === 0,
    );
    expect(stopped.length).toBeGreaterThan(0);
    // a person who stopped stays quiet for the week: with every other gate open (a new day,
    // the player at their side, lonely and fond) the brain still does not walk up, and does
    // the moment the week's stop is lifted (asked of someone awake: still the same week)
    let s = stopped.find((x) => x.activity !== 'sleep');
    if (!s) {
      stepTo(g, 2, 10);
      s = stopped[0] as NpcState;
    }
    const e = getEntity(g.world, s.entityId);
    if (!e) throw new Error('no entity');
    g.queue('world.teleport', { entityId: 'player', mapId: e.mapId, x: e.x + 1, y: e.y });
    g.step(1);
    runInTick(g, (ctx) => {
      const card = cardOf(ctx.world.slices.npc, ctx.content, s.id);
      if (!card || !s.brain) throw new Error('no card');
      s.brain.approach.day = -1;
      s.brain.approach.pending = null;
      s.needs.social = 20;
      ctx.world.slices.npc.approaches = undefined;
      expect(chooseApproach(actorView(ctx, s, card))).toBeNull();
      s.brain.approach.stopWeek = -1;
      expect(chooseApproach(actorView(ctx, s, card))?.action).toBe('approach');
    });
  });
});

describe('holds and guards around the player (builtin_ai.md 3.1 and 3.4)', () => {
  it('finds the player busy while talking, trading, in a scene or fighting', () => {
    const g = game();
    toBorderstone(g);
    runInTick(g, (ctx) => {
      const w = ctx.world;
      expect(playerBusy(ctx)).toBe(false);
      const arms: [string, () => void, () => void][] = [
        [
          'talk',
          () => {
            w.slices.dialogue.session = {} as never;
          },
          () => {
            w.slices.dialogue.session = null;
          },
        ],
        [
          'trade',
          () => {
            if (w.slices.economy) w.slices.economy.session = {} as never;
          },
          () => {
            if (w.slices.economy) w.slices.economy.session = null;
          },
        ],
        [
          'scene',
          () => {
            w.slices.scenes = { ...(w.slices.scenes ?? {}), current: {} } as never;
          },
          () => {
            if (w.slices.scenes) w.slices.scenes.current = null;
          },
        ],
        [
          'fight',
          () => {
            const units = (w.slices.combat?.units ?? {}) as Record<string, { combatUntil: number }>;
            w.slices.combat = { ...(w.slices.combat ?? {}), units } as never;
            units.player = { ...(units.player ?? {}), combatUntil: ctx.tick + 100 } as never;
          },
          () => {
            const u = w.slices.combat?.units.player as { combatUntil: number } | undefined;
            if (u) u.combatUntil = 0;
          },
        ],
      ];
      for (const [name, on, off] of arms) {
        on();
        expect(playerBusy(ctx), name).toBe(true);
        off();
        expect(playerBusy(ctx), `${name} over`).toBe(false);
      }
    });
  });

  it('holds an approach or a visit through the hourly step, unless a threat or a need breaks it', () => {
    const g = game();
    toBorderstone(g);
    stepTo(g, 0, 10);
    runInTick(g, (ctx) => {
      const st = npc(g, 'nera');
      const b = ensureBrainOf(st);
      st.tier = 1;
      b.layer = 'initiative';
      b.approach.pending = { tick: ctx.tick, reason: 'acquaintance', spoke: false };
      expect(heldByBeat(ctx, st)).toBe(true);
      // a beast close by breaks it
      b.recent.threat = ctx.tick;
      expect(heldByBeat(ctx, st)).toBe(false);
      delete b.recent.threat;
      // so does a critical need
      st.needs.hunger = 10;
      expect(heldByBeat(ctx, st)).toBe(false);
      st.needs.hunger = 80;
      b.approach.pending = null;
      expect(heldByBeat(ctx, st)).toBe(false);
      // a visit holds for one beat period after it was taken up
      b.layer = 'social';
      b.current = 'social.visit';
      b.used['social.visit'] = ctx.tick - 10;
      expect(heldByBeat(ctx, st)).toBe(true);
      b.used['social.visit'] = ctx.tick - 1000;
      expect(heldByBeat(ctx, st)).toBe(false);
    });
  });

  it('remembers a change of mind even when a line was already said this tick', () => {
    const g = game();
    runInTick(g, (ctx) => {
      const st = npc(g, 'nera');
      ensureBrainOf(st).spokeTick = ctx.tick;
      const before = ctx.world.slices.npc.minds.nera?.mem.length ?? 0;
      onBeliefChanged(ctx, {
        observerId: 'nera',
        subjectId: 'player',
        from: 'explaining',
        to: 'wavering',
        explanation: null,
      });
      expect(ctx.world.slices.npc.minds.nera?.mem.length ?? 0).toBe(before + 1);
    });
  });

  it('says nothing without a dialogue slice', () => {
    const g = game();
    runInTick(g, (ctx) => {
      const kept = ctx.world.slices.dialogue;
      (ctx.world.slices as { dialogue?: unknown }).dialogue = undefined;
      expect(speak(ctx, { speaker: 'nera', slot: 'greet.neutral' })).toBeNull();
      ctx.world.slices.dialogue = kept;
    });
  });

  it('lets two below the chat gate pass by without a word: no social lift, no track entry', () => {
    const g = game();
    runInTick(g, (ctx) => {
      const a = npc(g, 'gaspar');
      const b = npc(g, 'gorn');
      const rel = ctx.world.slices.npc.minds.gaspar?.rel.gorn;
      if (!rel) throw new Error('no relation');
      rel.like = -50;
      rel.align = 0;
      for (const st of [a, b]) {
        st.needs.face = 70;
        ensureBrainOf(st).quarrel = null;
        ensureBrainOf(st).offender = '';
      }
      a.needs.social = 30;
      const tracks = a.track.length;
      const loc = locationById(ctx.content, a.mapId, a.locId) ?? ctx.content.maps[0]?.locations[0];
      if (!loc) throw new Error('no place');
      converse(ctx, a, b, loc);
      expect(a.needs.social).toBe(30);
      expect(a.track.length).toBe(tracks);
    });
  });
});

describe('social interactions (builtin_ai.md 5.1)', () => {
  it('quarrels over a stance far apart, reconciles when it weighs, and a gift warms', () => {
    const g = game();
    runInTick(g, (ctx) => {
      const a = npc(g, 'gaspar');
      const b = npc(g, 'gorn');
      // start from no liking either way (their seeds carry the forest dispute)
      for (const [x, y] of [
        ['gaspar', 'gorn'],
        ['gorn', 'gaspar'],
      ] as const) {
        const r = relationOf(ctx.world.slices.npc, x, y);
        adjustRelation(ctx, x, y, { like: -r.like, align: -r.align }, 'zz');
      }
      adjustRelation(ctx, 'gaspar', 'gorn', { align: -80 }, 'zz');
      expect(chooseInteraction(ctx, a, b, new Rng({ s: 1 }), false)).toBe('quarrel');
      const before = relationOf(ctx.world.slices.npc, 'gorn', 'gaspar').like;
      applyInteraction(ctx, 'quarrel', a, b, { a: 'a', b: 'b', place: 'p' });
      expect(relationOf(ctx.world.slices.npc, 'gorn', 'gaspar').like).toBeLessThan(before - 4);
      expect(a.brain?.quarrel?.with).toBe('gorn');
      adjustRelation(ctx, 'gaspar', 'gorn', { align: 80 }, 'zz');
      // the quarrel cost liking; a reconciliation comes before the chat gate (-20)
      const r = relationOf(ctx.world.slices.npc, 'gaspar', 'gorn');
      if (r.like < -25) adjustRelation(ctx, 'gaspar', 'gorn', { like: -25 - r.like }, 'zz');
      a.needs.peace = 30;
      a.needs.face = 70;
      expect(chooseInteraction(ctx, a, b, new Rng({ s: 1 }), false)).toBe('reconcile');
      const sore = relationOf(ctx.world.slices.npc, 'gaspar', 'gorn').like;
      applyInteraction(ctx, 'reconcile', a, b, { a: 'a', b: 'b', place: 'p' });
      expect(relationOf(ctx.world.slices.npc, 'gaspar', 'gorn').like).toBeGreaterThan(sore);
      const like = relationOf(ctx.world.slices.npc, 'gorn', 'gaspar').like;
      applyInteraction(ctx, 'gift', a, b, { a: 'a', b: 'b', place: 'p' });
      // +6 liking, taken at x0.7 by stubborn (固执) Gorn
      expect(relationOf(ctx.world.slices.npc, 'gorn', 'gaspar').like).toBeCloseTo(like + 4.2, 5);
    });
  });

  it('fills a town day with interactions and NPC-to-NPC relation records', () => {
    const g = game();
    const seen = collect(g);
    toBorderstone(g);
    stepTo(g, 1, 0, 5);
    const day = seen.filter((e) => e.kind === 'npc.interaction' && e.data.mapId === 'borderstone');
    expect(day.length).toBeGreaterThanOrEqual(10);
    const quarrels = day.filter((e) => e.kind === 'npc.interaction' && e.data.kind === 'quarrel');
    expect(quarrels.length / day.length).toBeLessThanOrEqual(0.2);
    const records = Object.entries(g.world.slices.npc.minds)
      .filter(([id]) => npc(g, id)?.mapId === 'borderstone')
      .flatMap(([, m]) => m.relLog.filter((r) => r.to !== 'player'));
    expect(records.length).toBeGreaterThanOrEqual(5);
  });
});

describe('memory and the rule diary (builtin_ai.md 5.3 and 5.4)', () => {
  it('lets two who dislike each other pass by, unless a stance or a shame drives a quarrel', () => {
    const g = game();
    runInTick(g, (ctx) => {
      const a = npc(g, 'gaspar');
      const b = npc(g, 'gorn');
      // exact values (adjustRelation would scale stubborn Gorn's changes by 0.7)
      const set = (x: string, y: string, like: number) => {
        const rel = ctx.world.slices.npc.minds[x]?.rel[y];
        if (!rel) throw new Error(`no relation ${x} to ${y}`);
        rel.like = like;
        rel.align = 0;
      };
      set('gaspar', 'gorn', 0);
      set('gorn', 'gaspar', -19);
      for (const st of [a, b]) {
        st.needs.face = 70;
        st.needs.peace = 70;
        ensureBrainOf(st).quarrel = null;
        ensureBrainOf(st).offender = '';
      }
      // at -19 they still talk (the chat gate is -20)
      expect(chooseInteraction(ctx, a, b, new Rng({ s: 1 }), false)).not.toBeNull();
      // one side at -25: below the gate, no stance gap, no shame: they pass each other by
      set('gorn', 'gaspar', -25);
      expect(chooseInteraction(ctx, a, b, new Rng({ s: 1 }), false)).toBeNull();
      // dislike alone never makes a quarrel (no feedback loop from quarrels to quarrels)
      set('gaspar', 'gorn', -60);
      expect(chooseInteraction(ctx, a, b, new Rng({ s: 1 }), false)).toBeNull();
      // either of them shamed and facing the one who shamed them quarrels
      b.needs.face = 20;
      ensureBrainOf(b).offender = 'gaspar';
      expect(chooseInteraction(ctx, a, b, new Rng({ s: 1 }), false)).toBe('quarrel');
      b.needs.face = 70;
      a.needs.face = 20;
      ensureBrainOf(a).offender = 'gorn';
      expect(chooseInteraction(ctx, a, b, new Rng({ s: 1 }), false)).toBe('quarrel');
      // a quarrel of the last three days that weighs on the other one: a reconciliation
      a.needs.face = 70;
      ensureBrainOf(a).quarrel = { with: 'gorn', tick: ctx.tick };
      b.needs.peace = 30;
      expect(chooseInteraction(ctx, a, b, new Rng({ s: 1 }), false)).toBe('reconcile');
    });
  });

  it('weighs a memory by its kind, the player, the goals and rarity, capped at 1', () => {
    expect(memoryImportance('trade', {}, false)).toBe(0.05);
    expect(memoryImportance('helped', { about: 'player' }, false)).toBeCloseTo(0.48, 5);
    // rounded to three places
    expect(memoryImportance('helped', { about: 'player', goal: true }, true)).toBe(0.749);
    expect(memoryImportance('feat_seen', { salience: 1 }, false)).toBeCloseTo(0.9, 5);
    expect(memoryImportance('mourning', { about: 'player', goal: true }, true)).toBe(1);
  });

  it("keeps the most telling three items of the day, with the day's mood", () => {
    const g = game();
    runInTick(g, (ctx) => {
      const st = npc(g, 'simon');
      st.track = [
        { hour: 8, kind: 'work', loc: 'west_field' },
        { hour: 10, kind: 'chat', loc: 'plaza', with: '莉娜' },
        { hour: 12, kind: 'quarrel', loc: 'plaza', with: '加斯帕' },
        { hour: 14, kind: 'trade', loc: 'salt_market' },
        { hour: 16, kind: 'leave', loc: 'forest_edge:hunter_camp' },
      ];
      const day = calendarAt(ctx.tick).dayIndex;
      expect(diaryScore(ctx, st, st.track[4] as NpcState['track'][number], day)).toBe(7);
      const d = ruleDiary(ctx, st, day);
      expect(d.map((x) => x.kind)).toEqual(['leave', 'quarrel', 'trade']);
      expect(d.every((x) => x.mood === moodOf(st, ctx.tick))).toBe(true);
      // the day ends with its mood line
      const last = JSON.stringify(d.at(-1)?.text);
      expect(last).toContain('sys.npc.diary.closing');
      expect(last).toContain(`sys.npc.diary.mood.${moodOf(st, ctx.tick)}`);
      expect(JSON.stringify(d[0]?.text)).not.toContain('sys.npc.diary.closing');
    });
  });

  it('weighs a talk with the player above a talk with a stranger', () => {
    const g = game();
    runInTick(g, (ctx) => {
      const st = npc(g, 'simon');
      const day = calendarAt(ctx.tick).dayIndex;
      const withPlayer = { hour: 9, kind: 'chat' as const, loc: 'plaza', withId: 'player' };
      const withStranger = { hour: 9, kind: 'chat' as const, loc: 'plaza', with: 'zz' };
      st.diary = [];
      expect(diaryScore(ctx, st, withPlayer, day)).toBe(diaryScore(ctx, st, withStranger, day) + 4);
      st.track = [{ hour: 8, kind: 'work', loc: 'west_field' }, withPlayer];
      const text = JSON.stringify(ruleDiary(ctx, st, day)[0]?.text);
      expect(text).toContain('sys.npc.diary.player');
    });
  });
});

describe('the brain content (builtin_ai.md 15)', () => {
  it('ships valid libraries, role trees for all fifteen roles and the reaction table', () => {
    expect(
      brainProblems(C.npcBrain, {
        inputs: INPUT_IDS,
        predicates: PREDICATE_NAMES,
        reactionPredicates: REACTION_PREDICATE_NAMES,
        reactionActions: REACTION_ACTIONS,
      }),
    ).toEqual([]);
    expect(validateNpcContent(C)).toEqual([]);
  });

  it('refuses a pursuit condition that reads an unregistered variable', () => {
    const npcs = JSON.parse(JSON.stringify(C.npcs)) as typeof C.npcs;
    const cassian = npcs.find((p) => p.id === 'cassian');
    const g0 = cassian?.pursuits?.[0];
    if (!g0) throw new Error('cassian has no pursuit');
    g0.urge = 'zz_never_registered >= 1';
    expect(validateNpcContent({ ...C, npcs })).toContainEqual(
      expect.stringContaining('condition reads unregistered variable zz_never_registered'),
    );
  });

  it('reports a broken library, tree and reaction row', () => {
    const bad = JSON.parse(JSON.stringify(C.npcBrain)) as typeof C.npcBrain;
    const gate = bad.actions[0]?.gates[0];
    if (gate) gate.input = 'zz.nothing';
    delete bad.roles.cleric;
    (bad.reactions[0] as { cond: string }).cond = 'zz_nope';
    const problems = brainProblems(bad, {
      inputs: INPUT_IDS,
      predicates: PREDICATE_NAMES,
      reactionPredicates: REACTION_PREDICATE_NAMES,
      reactionActions: REACTION_ACTIONS,
    });
    expect(problems.join('\n')).toContain('unknown input zz.nothing');
    expect(problems.join('\n')).toContain('role cleric: no tree');
    expect(problems.join('\n')).toContain('unknown predicate zz_nope');
  });
});

describe('the BtRunner across save and load (builtin_ai.md 2.2)', () => {
  const tree: BtNodeDef = {
    id: 'r',
    type: 'sel',
    children: [
      {
        id: 'once',
        type: 'deco',
        deco: 'once',
        children: [{ id: 'a', type: 'act', arg: 'x' }],
      },
      { id: 'b', type: 'act', arg: 'y' },
    ],
  };
  const env = (tick: number, log: string[]): BtEnv => ({
    tick,
    rng: new Rng({ s: 1 }),
    cond: () => true,
    act: (c) => {
      log.push(c);
      return c;
    },
    receipt: () => 'success',
    say: () => true,
  });

  it('does not fire a once twice on a day after its state was saved and restored', () => {
    const log: string[] = [];
    const r = new BtRunner(tree);
    r.tick(env(100, log), new Blackboard());
    const saved = JSON.parse(JSON.stringify(r.snapshot()));
    const fresh = new BtRunner(tree);
    fresh.restore(saved);
    fresh.tick(env(200, log), new Blackboard());
    expect(log).toEqual(['x', 'y']);
    // a fresh runner without the saved state would fire it again
    const forgetful = new BtRunner(tree);
    forgetful.tick(env(200, log), new Blackboard());
    expect(log.at(-1)).toBe('x');
    // the next game day it fires again; unknown node ids in a saved state are dropped
    fresh.restore({ ...saved, keep: { ...saved.keep, zz_gone: { day: 3 } } });
    expect(Object.keys(fresh.snapshot().keep)).toEqual(['once']);
    fresh.tick(env(100 + TICKS_PER_GAME_DAY, log), new Blackboard());
    expect(log.at(-1)).toBe('x');
  });

  it('resumes a running branch where it stopped', () => {
    const waitTree: BtNodeDef = {
      id: 'w',
      type: 'seq',
      children: [
        { id: 'w1', type: 'act', arg: 'one' },
        { id: 'w2', type: 'wait', arg: '10' },
        { id: 'w3', type: 'act', arg: 'two' },
      ],
    };
    const log: string[] = [];
    const r = new BtRunner(waitTree);
    expect(r.tick(env(0, log), new Blackboard())).toBe('running');
    const moved = new BtRunner(waitTree);
    moved.restore(JSON.parse(JSON.stringify(r.snapshot())));
    expect(moved.tick(env(5, log), new Blackboard())).toBe('running');
    expect(moved.tick(env(10, log), new Blackboard())).toBe('success');
    expect(log).toEqual(['one', 'two']);
  });

  it('redraws a usel order saved from an older tree and starts its run over', () => {
    const uselTree = (kids: string[]): BtNodeDef => ({
      id: 'u',
      type: 'usel',
      children: kids.map((k) => ({
        id: k,
        type: 'seq',
        children: [
          { id: `${k}.a`, type: 'act', arg: `${k}.a` },
          { id: `${k}.w`, type: 'wait', arg: '10' },
        ],
      })),
    });
    const log: string[] = [];
    const old = new BtRunner(uselTree(['p', 'q']));
    expect(old.tick(env(0, log), new Blackboard())).toBe('running');
    const saved = JSON.parse(JSON.stringify(old.snapshot()));
    expect(saved.run.u.order).toEqual(['p', 'q']);
    // the new tree lost q and gained r: the old order (and its resume index) is not trusted
    const now = new BtRunner(uselTree(['p', 'r']));
    now.restore(saved);
    expect(now.tick(env(1, log), new Blackboard())).toBe('running');
    expect(now.snapshot().run.u?.order).toEqual(['p', 'r']);
    // p ran again from its first leaf: the stale run of the old tree was dropped
    expect(log).toEqual(['p.a', 'p.a']);
  });
});

describe('the player in the world of the brain', () => {
  it('runs the town for a day deterministically: same seed, same world', () => {
    const run = () => {
      const g = game(3);
      toBorderstone(g);
      stepTo(g, 1, 0, 5);
      return JSON.stringify(g.world.slices.npc);
    };
    expect(run()).toBe(run());
  });

  it('marks the brain explanations of an NPC (the brain inspector reads them)', () => {
    const g = game();
    toBorderstone(g);
    stepTo(g, 0, 12);
    const actors = g.traceActors();
    expect(actors.length).toBeGreaterThan(5);
    expect(npcEntityId('ron')).toBe('npc_ron');
  });
});

describe('the brain across a save and load (architecture.md 11 item 2)', () => {
  it('plays on from a save exactly as the run that never stopped', () => {
    const run = (cut: boolean) => {
      let g = game(9);
      toBorderstone(g);
      stepTo(g, 0, 15);
      if (cut)
        g = Engine.resume(deserializeWorld(serializeWorld(g.world)), C, SYSTEMS, {
          aiMode: 'off',
        });
      stepTo(g, 1, 9);
      // the hash reads the slices' JSON as it is, key order included
      return worldHash(g.world);
    };
    expect(run(true)).toBe(run(false));
  });
});
