// The NPC brain toward the player and the quest model (PK-M1-18): the intent classifier's
// trait and role tables now read, the offense tally and the angry mood, the greeting's
// trust band, opener and line history across save and load, the follow-the-player order,
// stealth watchers, cross-map errands on foot, the absence variables (captured, hostile, at
// the spring, dead) and the doors' reading of them, door hints in the rumor pool, the road
// to the next town, and the dispute decision point filed with the brain's choice.

import { describe, expect, it, vi } from 'vitest';
import { Engine, ok } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import { deserializeWorld, serializeWorld } from '../src/core/save/world_file';
import type { GameSystem, SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR, tickAtDay } from '../src/core/time';
import { seedRumor } from '../src/systems/cognition/rumor';
import { carryByRoad, injectHint, ROAD_MIN_AGE } from '../src/systems/cognition/spread';
import type { DisputeDef } from '../src/systems/disputes';
import { personAbsent } from '../src/systems/doors/keys';
import {
  brainChoice,
  noteOffense,
  onDecided,
  onDecisionOpened,
  personaWeights,
  setWatch,
  takeOpener,
} from '../src/systems/npc/brain';
import { moodOf } from '../src/systems/npc/brain/mood';
import { FOLLOW_TICKS } from '../src/systems/npc/constants';
import { npcEntityId } from '../src/systems/npc/personas';
import { adjustRelation, relationOf } from '../src/systems/npc/relations';
import { TRANSIT_GIVE_UP } from '../src/systems/npc/routes';
import type { NpcState } from '../src/systems/npc/types';
import { getEntity, mapById } from '../src/systems/world';
import { ALIVE_CONTENT, ALIVE_SYSTEMS } from './npc_alive_harness';

// these run whole game hours and days of a town: room for a busy machine
vi.setConfig({ testTimeout: 120_000 });

declare module '../src/core/contracts' {
  interface CommandMap {
    'zz_soc.run': Record<string, never>;
  }
}

let pendingFn: ((ctx: SystemContext) => void) | null = null;
const probe: GameSystem = {
  id: 'zz_soc_probe',
  order: 98,
  commands: {
    'zz_soc.run'(ctx) {
      pendingFn?.(ctx);
      pendingFn = null;
      return ok();
    },
  },
};

const SCRIPT = { type: 'script', script: 'test' } as const;

function game(seed = 7, content: ContentMap = ALIVE_CONTENT): Engine {
  return Engine.create(seed, content, [...ALIVE_SYSTEMS, probe], { aiMode: 'off' });
}

function runInTick(g: Engine, fn: (ctx: SystemContext) => void): void {
  pendingFn = fn;
  g.queue('zz_soc.run', {});
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

/** Put the player next to a person on their map. */
function besides(g: Engine, id: string): void {
  const e = getEntity(g.world, npcEntityId(id));
  if (!e) throw new Error(`no ${id}`);
  g.queue('world.teleport', { entityId: 'player', mapId: e.mapId, x: e.x + 0.8, y: e.y });
  g.step(1);
}

function talk(g: Engine, id: string): void {
  besides(g, id);
  g.queue('dialogue.talk', { npcId: npcEntityId(id) });
  g.step(1);
}

function say(g: Engine, text: string): void {
  g.queue('dialogue.say', { text });
  g.step(2);
}

// ---------------------------------------------------------------------------

describe('the intent classifier reads its trait and role tables (PK-M0-26 follow-up)', () => {
  it('a compliment pleases the vain more and the suspicious less', () => {
    const like = (g: Engine, id: string) => relationOf(g.world.slices.npc, id, 'player').like;
    const g = game();
    stepTo(g, 0, 10);
    const d0 = like(g, 'dris');
    talk(g, 'dris');
    say(g, '你的手艺真好');
    // dris is 自负 and 好面子 (the lexicon's vain): +3
    expect(like(g, 'dris') - d0).toBeCloseTo(3, 5);
    g.queue('dialogue.close', {});
    g.step(1);
    const o0 = like(g, 'oola');
    talk(g, 'oola');
    say(g, '你的手艺真好');
    // oola is 多疑 (suspicious): -1
    expect(like(g, 'oola') - o0).toBeCloseTo(-1, 5);
  });

  it("counts the day's offenses: the third insult ends the talk, and the anger aims at the player", () => {
    const g = game();
    stepTo(g, 0, 10);
    talk(g, 'ron');
    say(g, '你真蠢');
    say(g, '你真蠢');
    expect(g.world.slices.dialogue.session).not.toBeNull();
    say(g, '你真蠢');
    expect(g.world.slices.dialogue.session).toBeNull();
    expect(g.world.slices.dialogue.offenses?.ron?.n).toBe(3);
    const st = npc(g, 'ron');
    expect(st.brain?.offender).toBe('player');
    expect(moodOf(st, g.tick)).toBe('angry');
    expect(g.world.slices.npc.minds.ron?.mem.some((m) => m.tag === 'insulted')).toBe(true);
  });
});

describe('greetings by trust band, openers and the saved line history (builtin_ai.md 5.7, 7.4, 7.7)', () => {
  it('greets with the opener kept from a transition seen offscreen, once', () => {
    const g = game();
    stepTo(g, 0, 10);
    runInTick(g, (ctx) => {
      const st = npc(g, 'nick');
      st.brain = {
        ...(st.brain ?? (JSON.parse('{}') as never)),
        ...{
          layer: 'schedule',
          current: '',
          needLatch: false,
          emergencyUntil: 0,
          used: {},
          bt: {},
          pursued: {},
          approach: { day: -1, stopWeek: -1, ignored: 0, pending: null, spent: [] },
          recent: {},
          offender: '',
          dayLog: { day: -1, hours: 0, off: 0 },
          barked: {},
          quarrel: null,
          spokeTick: -1,
        },
        opener: { slot: 'unbelief.waver', params: {}, until: ctx.tick + TICKS_PER_GAME_DAY },
      };
    });
    talk(g, 'nick');
    const first = g.world.slices.dialogue.session?.lines[0]?.text;
    expect(JSON.stringify(first)).toContain('unbelief_waver');
    expect(npc(g, 'nick').brain?.opener).toBeNull();
    runInTick(g, (ctx) => expect(takeOpener(ctx, 'nick')).toBeNull());
  });

  it('does not repeat a greeting within seven days (the oldest comes back first), across a load', () => {
    const g = game();
    stepTo(g, 0, 10);
    // first meeting out of the way
    talk(g, 'popo');
    g.queue('dialogue.close', {});
    g.step(1);
    const said: string[] = [];
    let current = g;
    for (let i = 0; i < 4; i++) {
      talk(current, 'popo');
      said.push(JSON.stringify(current.world.slices.dialogue.session?.lines[0]?.text));
      current.queue('dialogue.close', {});
      current.step(TICKS_PER_GAME_HOUR);
      // a save and load between the talks keeps the ledger
      current = Engine.resume(deserializeWorld(serializeWorld(current.world)), ALIVE_CONTENT, [
        ...ALIVE_SYSTEMS,
        probe,
      ]);
    }
    const keys = said.map((s) => /"key":"([^"]+)"/.exec(s)?.[1] ?? s);
    // three greetings fit popo now (two plain, one recalling the first talk): no repeat
    // among them, then the one said longest ago is released first (7.4 step 3)
    expect(new Set(keys.slice(0, 3)).size).toBe(3);
    expect(keys[3]).toBe(keys[0]);
    expect(current.world.slices.dialogue.lines?.popo?.order.at(-1)).toBe(keys[0]);
  });
});

describe('the follow-the-player order (escort, rescue, accompany)', () => {
  it("keeps the person at the player's side, through a map change, until released", () => {
    const g = game();
    stepTo(g, 0, 10);
    besides(g, 'nick');
    g.queue('npc.follow', { npcId: 'nick', on: true, hours: 4 }, SCRIPT);
    g.step(1);
    expect(npc(g, 'nick').follow).not.toBeNull();
    const plaza = mapById(ALIVE_CONTENT, 'borderstone')?.locations.find((l) => l.id === 'plaza');
    if (!plaza) throw new Error('no plaza');
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: 'borderstone',
      x: plaza.x + 1,
      y: plaza.y + 1,
    });
    g.step(400);
    const p = getEntity(g.world, 'player');
    const e = getEntity(g.world, npcEntityId('nick'));
    expect(e && p && Math.hypot(e.x - p.x, e.y - p.y)).toBeLessThan(4);
    g.queue('world.teleport', { entityId: 'player', mapId: 'wallenburg', x: 30, y: 30 });
    g.step(20);
    expect(getEntity(g.world, npcEntityId('nick'))?.mapId).toBe('wallenburg');
    // the player cannot order it; four hours later the person goes back to their day
    g.queue('npc.follow', { npcId: 'nick', on: true }, { type: 'player' });
    g.step(1);
    g.step(4 * TICKS_PER_GAME_HOUR);
    expect(npc(g, 'nick').follow).toBeNull();
  });

  it('starts from a quest stage with an escort and ends when the stage moves on', () => {
    const content: ContentMap = {
      ...ALIVE_CONTENT,
      quests: [
        {
          id: 'zz_q_escort',
          title: 'x',
          stages: [
            {
              id: 'walk',
              desc: 'x',
              objectives: [
                { type: 'escort', npc: 'nick', mapId: 'wallenburg', label: 'x' },
                { type: 'stealth', mapId: 'borderstone', label: 'y' },
              ],
            },
          ],
        },
      ] as unknown as ContentMap['quests'],
    };
    const g = game(7, content);
    const seen = collect(g);
    stepTo(g, 0, 10);
    g.queue('flag.set', { key: 'quest.zz_q_escort', value: 'active' }, SCRIPT);
    g.queue('flag.set', { key: 'quest.zz_q_escort.stage', value: 'walk' }, SCRIPT);
    g.step(1);
    runInTick(g, (ctx) => ctx.emit('quest.stage', { questId: 'zz_q_escort', stage: 0, desc: 'x' }));
    g.step(1);
    expect(npc(g, 'nick').follow?.questId).toBe('zz_q_escort');
    expect(g.world.slices.npc.watch?.map((z) => z.mapId)).toEqual(['borderstone']);
    // a watcher close by sees the player sneaking: once per visit
    besides(g, 'lina');
    g.step(40);
    const spotted = seen.filter((e) => e.kind === 'stealth.detected');
    expect(spotted.length).toBe(1);
    g.step(200);
    expect(seen.filter((e) => e.kind === 'stealth.detected').length).toBe(1);
    // the stage moved on: the order and the watch are released
    g.queue('flag.set', { key: 'quest.zz_q_escort.stage', value: 'done' }, SCRIPT);
    g.step(30);
    expect(npc(g, 'nick').follow).toBeNull();
    expect(g.world.slices.npc.watch).toEqual([]);
  });
});

describe('cross-map errands on foot (npc.goto with a map)', () => {
  it("walks to the town gate in the player's sight and arrives on the other map", () => {
    const g = game();
    stepTo(g, 0, 10);
    besides(g, 'owen');
    g.queue(
      'npc.goto',
      { npcId: 'owen', locationId: 'market', mapId: 'wallenburg', hours: 6 },
      SCRIPT,
    );
    g.step(1);
    expect(npc(g, 'owen').transit?.mapId).toBe('wallenburg');
    expect(getEntity(g.world, npcEntityId('owen'))?.mapId).toBe('borderstone');
    for (let i = 0; i < 400 && npc(g, 'owen').transit; i++) g.step(20);
    expect(npc(g, 'owen').transit).toBeNull();
    expect(getEntity(g.world, npcEntityId('owen'))?.mapId).toBe('wallenburg');
    expect(npc(g, 'owen').locId).toBe('market');
    expect(npc(g, 'owen').track.some((t) => t.kind === 'leave')).toBe(true);
    // an unknown place on the other map is refused
    g.queue(
      'npc.goto',
      { npcId: 'owen', locationId: 'nowhere', mapId: 'wallenburg', hours: 2 },
      SCRIPT,
    );
    g.step(1);
    expect(
      g.world.recent.some(
        (e) =>
          e.kind === 'command.result' && e.data.kind === 'npc.goto' && e.data.code === 'no_place',
      ),
    ).toBe(true);
  });
});

describe('a cross-map walk that cannot get on', () => {
  it('is snapped to its destination once the walk to the gate has taken an hour', () => {
    const g = game();
    stepTo(g, 0, 10);
    besides(g, 'owen');
    g.queue(
      'npc.goto',
      { npcId: 'owen', locationId: 'market', mapId: 'wallenburg', hours: 6 },
      SCRIPT,
    );
    g.step(1);
    // a walk under way keeps walking
    g.step(FOLLOW_TICKS * 2);
    expect(npc(g, 'owen').transit?.mapId).toBe('wallenburg');
    expect(getEntity(g.world, npcEntityId('owen'))?.mapId).toBe('borderstone');
    // the same walk an hour old gives up: the rest of the way is snapped
    runInTick(g, (ctx) => {
      const t = npc(g, 'owen').transit;
      if (!t) throw new Error('no transit');
      t.since = ctx.tick - TRANSIT_GIVE_UP - 1;
    });
    g.step(FOLLOW_TICKS);
    expect(npc(g, 'owen').transit).toBeNull();
    expect(getEntity(g.world, npcEntityId('owen'))?.mapId).toBe('wallenburg');
    expect(npc(g, 'owen').locId).toBe('market');
  });
});

describe('the absence variables (thousand_doors.md 5.4)', () => {
  it('takes a captured person off the map and back, and the doors see who is away', () => {
    const g = game();
    g.queue('flag.set', { key: 'npc.ron.captured', value: true }, SCRIPT);
    g.step(1);
    expect(npc(g, 'ron').gone).toBe('captured');
    expect(getEntity(g.world, npcEntityId('ron'))).toBeUndefined();
    expect(personAbsent(g.world, g.content, 'ron')).toBe(true);
    g.queue('flag.set', { key: 'npc.ron.captured', value: false }, SCRIPT);
    g.step(1);
    expect(npc(g, 'ron').gone).toBeNull();
    expect(personAbsent(g.world, g.content, 'ron')).toBe(false);
  });

  it('mirrors a person turned hostile', () => {
    const g = game();
    runInTick(g, (ctx) => adjustRelation(ctx, 'jed', 'player', { like: -100 }, 'zz'));
    g.step(1);
    expect(g.world.meta.flags['npc.jed.hostile']).toBe(true);
    expect(personAbsent(g.world, g.content, 'jed')).toBe(true);
    runInTick(g, (ctx) => adjustRelation(ctx, 'jed', 'player', { like: 100 }, 'zz'));
    g.step(1);
    expect(g.world.meta.flags['npc.jed.hostile']).toBe(false);
  });

  it('marks a dead general at the spring for seven days, and dead for good', () => {
    const g = game();
    const st = npc(g, 'barto');
    runInTick(g, (ctx) =>
      ctx.emit('entity.died', {
        id: st.entityId,
        ref: 'barto',
        kind: 'npc',
        mapId: st.mapId,
        x: 0,
        y: 0,
      }),
    );
    g.step(1);
    expect(g.world.meta.flags['npc.barto.dead']).toBe(true);
    expect(g.world.meta.flags['npc.barto.at_spring']).toBe(true);
    g.step(7 * TICKS_PER_GAME_DAY);
    expect(g.world.meta.flags['npc.barto.at_spring']).toBe(false);
    expect(g.world.meta.flags['npc.barto.dead']).toBe(true);
  });
});

describe('rumor channels (builtin_ai.md 5.2; reputation_and_cognition.md 4.2)', () => {
  it("puts a door hint told by rumor into the pool of the player's town", () => {
    const g = game();
    g.queue('world.teleport', { entityId: 'player', mapId: 'borderstone', x: 30.5, y: 21.5 });
    g.step(2);
    let id: string | null = null;
    runInTick(g, (ctx) => {
      id = injectHint(ctx, '有人说北门外的石头会唱歌', 'door_zz');
    });
    expect(id).not.toBeNull();
    const holders = Object.entries(g.world.slices.cognition.holdings).filter(([, hs]) =>
      hs.some((h) => h.rumor === id),
    );
    expect(holders.length).toBe(2);
    expect(g.world.slices.cognition.rumors[id as unknown as string]?.topic).toBe('door_hint');
    // the doors system's hint event reaches the same pool
    runInTick(g, (ctx) =>
      ctx.emit('doors.hint', { doorId: 'door_zz2', channel: 'rumor', level: 1, text: '另一处' }),
    );
    g.step(1);
    expect(
      Object.values(g.world.slices.cognition.rumors).filter((r) => r.topic === 'door_hint'),
    ).toHaveLength(2);
  });

  it("carries a town's hot news to the next town once it is a day and a half old", () => {
    const g = game();
    let rid = '';
    runInTick(g, (ctx) => {
      const r = seedRumor(ctx, {
        anchor: 'zz',
        topic: 'kill',
        subject: 'player',
        mapId: 'borderstone',
        place: 'x',
        apparent: 10,
        count: 1,
        details: [],
        famous: [],
        tier: 4,
      });
      rid = r.id;
      ctx.world.slices.cognition.holdings.ron = [
        {
          rumor: r.id,
          v: { ...r.truth },
          cred: 1,
          from: 'seen',
          origin: 'ron',
          hops: 0,
          tick: ctx.tick,
          believed: true,
          told: 0,
        },
      ];
      carryByRoad(ctx);
    });
    const inWallenburg = () =>
      Object.entries(g.world.slices.cognition.holdings).some(
        ([id, hs]) => npc(g, id)?.mapId === 'wallenburg' && hs.some((h) => h.rumor === rid),
      );
    // too fresh to travel
    expect(inWallenburg()).toBe(false);
    g.step(ROAD_MIN_AGE + 1);
    for (let i = 0; i < 12 && !inWallenburg(); i++)
      runInTick(g, (ctx) => {
        const r = ctx.world.slices.cognition.rumors[rid];
        if (r) r.heat = 0.9;
        carryByRoad(ctx);
      });
    expect(inWallenburg()).toBe(true);
  });
});

describe("dispute decision points from the person's side (builtin_ai.md 5.8)", () => {
  const dispute: DisputeDef = {
    id: 'zz_dispute',
    act: 'act1',
    code: 'ZZ',
    parties: ['gaspar', 'gorn'],
    span: { from: 1, to: 4 },
    stages: [{ id: 's', label: 's', escalation: 0 }],
    decisions: [
      {
        id: 'p',
        label: 'p',
        actor: 'ron',
        options: [
          {
            id: 'brave',
            label: 'a',
            terms: { stance: 0.2, relation: 0.2, safety: 0, values: 0.9 },
          },
          { id: 'safe', label: 'b', terms: { stance: 0.2, relation: 0.2, safety: 1, values: 0.1 } },
        ],
      },
    ],
    settle: { week: 4 },
    outcomes: [{ id: 'o', label: 'o', by: 'world', default: true }],
  };
  const content: ContentMap = { ...ALIVE_CONTENT, disputes: [dispute] };

  function opened(g: Engine): void {
    runInTick(g, (ctx) => {
      ctx.world.slices.disputes = {
        disputes: {},
        open: [
          {
            dispute: 'zz_dispute',
            point: 'p',
            actor: 'ron',
            openedTick: ctx.tick,
            dueTick: ctx.tick + 600,
          },
        ],
        dirty: false,
        act: 'act1',
        week: 1,
      };
    });
  }

  it('weighs the menu by the person: timid Ron puts his safety first', () => {
    const g = game(7, content);
    opened(g);
    runInTick(g, (ctx) => {
      const ron = ctx.content.npcs.find((p) => p.id === 'ron');
      if (!ron) throw new Error('no ron');
      const w = personaWeights(ctx, ron, 'zz_dispute');
      expect(w.safety).toBe(1.5);
      expect(brainChoice(ctx, 'ron', 'zz_dispute', 'p')).toBe('safe');
    });
    expect(g.recentTraces('ron').some((t) => t.kind === 'npc.decision_point')).toBe(true);
  });

  it('files the npc.decision_point request with the choice as its fallback, before the deadline', () => {
    // a stand-in for the dispute runner records the command the fallback issues
    const decided: { data: unknown; source: string; tick: number }[] = [];
    const runner: GameSystem = {
      id: 'zz_disputes_standin',
      order: 97,
      commands: {
        'disputes.decide'(ctx, d, src) {
          decided.push({ data: d, source: src.type, tick: ctx.tick });
          return ok();
        },
      },
    };
    const g = Engine.create(7, content, [...ALIVE_SYSTEMS, probe, runner], { aiMode: 'off' });
    opened(g);
    let due = 0;
    runInTick(g, (ctx) => {
      due = ctx.tick + 600;
      onDecisionOpened(ctx, { disputeId: 'zz_dispute', pointId: 'p', actor: 'ron', dueTick: due });
    });
    const asked = g.world.recent.filter(
      (e) => e.kind === 'ai.requested' && e.data.role === 'npc.decision_point',
    );
    expect(asked.length).toBe(1);
    // no model (aiMode off): the brain's own choice answers, from the npc system, in time
    g.step(5);
    expect(decided).toHaveLength(1);
    expect(decided[0]?.data).toEqual({ disputeId: 'zz_dispute', pointId: 'p', optionId: 'safe' });
    expect(decided[0]?.source).toBe('fallback');
    expect(decided[0]?.tick).toBeLessThan(due);
  });

  it('writes the decision into the memories of the person and the parties', () => {
    const g = game(7, content);
    runInTick(g, (ctx) =>
      onDecided(ctx, { disputeId: 'zz_dispute', pointId: 'p', actor: 'ron', optionId: 'safe' }),
    );
    const mem = (id: string) => g.world.slices.npc.minds[id]?.mem.at(-1);
    expect(mem('ron')?.tag).toBe('decision');
    expect(JSON.stringify(mem('ron')?.text)).toContain('decisions.p.options.safe.label');
    expect(mem('gaspar')?.tag).toBe('decision_heard');
    expect(mem('gorn')?.about).toBe('ron');
  });
});

describe('offenses from outside a conversation', () => {
  it('a threat frightens and shames, before others more than alone', () => {
    const g = game();
    runInTick(g, (ctx) => noteOffense(ctx, 'lisa', true));
    const st = npc(g, 'lisa');
    expect(st.needs.safety).toBeLessThan(70);
    expect(st.brain?.recent.threat).toBeDefined();
    expect(moodOf(st, g.tick)).toBe('fear');
  });
});

describe('watch zones without a quest', () => {
  it('watches until told to stop', () => {
    const g = game();
    runInTick(g, (ctx) => setWatch(ctx, { mapId: 'borderstone' }, true));
    expect(g.world.slices.npc.watch).toHaveLength(1);
    g.queue('npc.watch', { mapId: 'borderstone', on: false }, SCRIPT);
    g.step(1);
    expect(g.world.slices.npc.watch).toHaveLength(0);
  });
});
