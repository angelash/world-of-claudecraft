// NPC system: content and maps, spawning and presence, schedules and needs, tiers
// (D-009), daily plans through the AI port, NPC chat, relations, memory and the batch
// diary. Runs the real kernel with the social systems (and the full createGame() when
// every colleague module loads).

import { describe, expect, it } from 'vitest';
import type { ContentPack } from '../src/content/pack';
import { pack as cognitionPack } from '../src/content/packs/cognition';
import { pack as dialoguePack } from '../src/content/packs/dialogue';
import { pack as inventoryPack } from '../src/content/packs/inventory';
import { pack as npcPack } from '../src/content/packs/npc';
import { pack as worldPack } from '../src/content/packs/world';
import { Engine, type EngineOptions, ok, worldHash } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import { isTextRef, type KeyText, rawText, tr } from '../src/core/text';
import { calendarAt, TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR, tickAtDay } from '../src/core/time';
import { renderTextDeep, t } from '../src/shared_ui/i18n';
import { system as cognition } from '../src/systems/cognition';
import { system as dialogue } from '../src/systems/dialogue';
import { holdingOf, system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import {
  addMemory,
  adjustRelation,
  system as npc,
  npcEntityId,
  npcsOnMap,
  npcView,
  personaById,
} from '../src/systems/npc';
import { MEMORY_CAP } from '../src/systems/npc/constants';
import { findPath, getEntity, mapById, system as world } from '../src/systems/world';

declare module '../src/core/contracts' {
  interface CommandMap {
    'zz_npc.run': Record<string, never>;
  }
}

// ---------------------------------------------------------------------------
// harness: the social systems on the real kernel, isolated from half-finished packs

let pendingFn: ((ctx: SystemContext) => void) | null = null;
const probe: GameSystem = {
  id: 'zz_npc_probe',
  order: 99,
  commands: {
    'zz_npc.run'(ctx) {
      pendingFn?.(ctx);
      pendingFn = null;
      return ok();
    },
  },
};

function merge(packs: ContentPack[]): ContentMap {
  const out: Record<string, unknown> = {};
  for (const p of packs)
    for (const [k, v] of Object.entries(p.tables)) {
      const prev = out[k];
      out[k] = Array.isArray(prev) && Array.isArray(v) ? [...prev, ...v] : v;
    }
  return out as unknown as ContentMap;
}

const PACKS = [worldPack, inventoryPack, npcPack, cognitionPack, dialoguePack];
const CONTENT = merge(PACKS);
const SYSTEMS = [world, inventory, modifiers, npc, dialogue, cognition, probe];

function game(seed = 7, opts: EngineOptions = {}): Engine {
  return Engine.create(seed, CONTENT, SYSTEMS, opts);
}

function runInTick(g: Engine, fn: (ctx: SystemContext) => void): void {
  pendingFn = fn;
  g.queue('zz_npc.run', {});
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

function eventsOf<K extends AnyWorldEvent['kind']>(
  g: Engine,
  kind: K,
): Extract<AnyWorldEvent, { kind: K }>[] {
  return g.world.recent.filter((e) => e.kind === kind) as Extract<AnyWorldEvent, { kind: K }>[];
}

function collect(g: Engine): AnyWorldEvent[] {
  const all: AnyWorldEvent[] = [];
  g.onEvents((evs) => all.push(...evs));
  return all;
}

// ---------------------------------------------------------------------------

describe('npc content and maps', () => {
  it('validates the npc, cognition and dialogue packs', () => {
    for (const p of [npcPack, cognitionPack, dialoguePack])
      expect(p.validate?.(CONTENT) ?? []).toEqual([]);
  });

  it('ships both social maps with the agreed size, arrivals, exits and a safe place', () => {
    const bs = mapById(CONTENT, 'borderstone');
    const wb = mapById(CONTENT, 'wallenburg');
    expect(bs && [bs.width, bs.height]).toEqual([56, 44]);
    expect(wb && [wb.width, wb.height]).toEqual([60, 48]);
    expect(bs?.rows.every((r) => r.length === 56)).toBe(true);
    for (const id of ['gate_seal_ruins', 'gate_forest_edge', 'gate_old_outpost', 'gate_wallenburg'])
      expect(bs?.locations.some((l) => l.id === id)).toBe(true);
    expect(wb?.locations.some((l) => l.id === 'gate_borderstone')).toBe(true);
    expect(wb?.locations.some((l) => l.id === 'gate_wallenburg_sewers')).toBe(true);
    expect(bs?.exits.map((x) => [x.toMap, x.toLocation]).sort()).toEqual([
      ['forest_edge', 'gate_borderstone'],
      ['old_outpost', 'gate_borderstone'],
      ['seal_ruins', 'gate_borderstone'],
      ['wallenburg', 'gate_borderstone'],
    ]);
    expect(wb?.exits.map((x) => [x.toMap, x.toLocation]).sort()).toEqual([
      ['borderstone', 'gate_wallenburg'],
      ['wallenburg_sewers', 'gate_wallenburg'],
    ]);
    expect(bs?.locations.filter((l) => l.kind === 'safe').length).toBeGreaterThan(0);
    expect(wb?.locations.filter((l) => l.kind === 'safe').length).toBeGreaterThan(0);
    expect(bs?.locations.length).toBeGreaterThanOrEqual(20);
    // roofs: buildings are tagged 'building', open ground 'open' (client draws roofs by tag)
    for (const l of [...(bs?.locations ?? []), ...(wb?.locations ?? [])]) {
      const open = [
        'plaza',
        'safe',
        'market',
        'field',
        'gate',
        'graveyard',
        'creek',
        'well',
        'camp',
        'work',
        'training',
        'slum',
        'ferry',
      ].includes(l.kind);
      expect(l.tags, l.id).toContain(open ? 'open' : 'building');
    }
  });

  it('casts 30 to 38 named townsfolk and 12 to 18 in wallenburg, with the agreed ids', () => {
    const bs = CONTENT.npcs.filter((p) => p.map === 'borderstone');
    const wb = CONTENT.npcs.filter((p) => p.map === 'wallenburg');
    expect(bs.length).toBeGreaterThanOrEqual(30);
    expect(bs.length).toBeLessThanOrEqual(38);
    expect(wb.length).toBeGreaterThanOrEqual(12);
    expect(wb.length).toBeLessThanOrEqual(18);
    for (const id of ['shiya', 'ron', 'nera', 'oola', 'cassian', 'martha', 'bron', 'moss'])
      expect(personaById(CONTENT, id)?.map).toBe('borderstone');
    for (const id of [
      'selene',
      'ferryman',
      'luchen',
      'yui',
      'aiden',
      'marcus',
      'edric',
      'cecilia',
      'lucas',
    ])
      expect(personaById(CONTENT, id)?.map).toBe('wallenburg');
    // yeyu and ash belong to other systems
    expect(personaById(CONTENT, 'yeyu')).toBeUndefined();
    expect(personaById(CONTENT, 'ash')).toBeUndefined();
    expect(personaById(CONTENT, 'oola')?.trustKey).toBe('trust.oola');
    expect(personaById(CONTENT, 'ron')?.potential).toBe('统帅');
  });

  it('reaches every home and workplace from the town square on foot', () => {
    for (const mapId of ['borderstone', 'wallenburg']) {
      const map = mapById(CONTENT, mapId);
      if (!map) throw new Error(mapId);
      const from = mapId === 'borderstone' ? { x: 30.5, y: 21.5 } : { x: 30.5, y: 18.5 };
      for (const l of map.locations) {
        const path = findPath(
          map,
          from,
          { x: l.x + Math.floor(l.w / 2) + 0.5, y: l.y + Math.floor(l.h / 2) + 0.5 },
          60000,
        );
        expect(path, `${mapId}/${l.id}`).not.toBeNull();
      }
    }
  });
});

describe('npc presence', () => {
  it('spawns tagged entities for present personas and residents, not for gated ones', () => {
    const g = game();
    const ron = getEntity(g.world, npcEntityId('ron'));
    expect(ron?.ref).toBe('ron');
    expect(ron?.tags).toEqual(
      expect.arrayContaining(['npc', 'lvl:11', 'tier:1', 'faction:guild', 'adventurer']),
    );
    expect(getEntity(g.world, npcEntityId('nera'))?.tags).toContain('merchant');
    expect(getEntity(g.world, npcEntityId('cassian'))?.tags).toContain('priest');
    expect(getEntity(g.world, npcEntityId('barto'))?.tags).toContain('guard');
    expect(getEntity(g.world, npcEntityId('martha'))?.tags).toContain('tier:3');
    // the heroes arrive only when the story flag says so
    expect(getEntity(g.world, npcEntityId('luchen'))).toBeUndefined();
    expect(g.world.slices.npc.npcs.luchen?.gone).toBe('absent');
    g.queue('flag.set', { key: 'a2_heroes_arrived', value: true });
    g.step(1);
    expect(getEntity(g.world, npcEntityId('luchen'))?.mapId).toBe('wallenburg');
    // nameless residents carry a job title, not a personal name
    const residents = Object.values(g.world.slices.npc.residents);
    expect(residents.length).toBeGreaterThan(10);
    expect(residents.every((r) => !personaById(CONTENT, r.id))).toBe(true);
    expect(getEntity(g.world, npcEntityId(residents[0]?.id ?? ''))?.tags).toContain('resident');
    // trust mirrors the reveal-ledger flag names
    expect(g.world.meta.flags['trust.oola']).toBe(40);
    expect(g.world.meta.flags['trust.shiya']).toBe(45);
  });

  it('hides a recruited companion NPC and brings it back when the flag clears', () => {
    const g = game();
    g.queue('flag.set', { key: 'companion.shiya.recruited', value: true });
    g.step(1);
    expect(getEntity(g.world, npcEntityId('shiya'))).toBeUndefined();
    expect(g.world.slices.npc.npcs.shiya?.gone).toBe('recruited');
    expect(eventsOf(g, 'world.entity_removed').some((e) => e.data.ref === 'shiya')).toBe(true);
    g.queue('flag.set', { key: 'companion.shiya.recruited', value: false });
    g.step(1);
    expect(getEntity(g.world, npcEntityId('shiya'))?.mapId).toBe('borderstone');
    expect(g.world.slices.npc.npcs.shiya?.gone).toBeNull();
  });

  it('hides oola when the witch trial convicts her (hideWhen with a value)', () => {
    const g = game();
    g.queue('flag.set', { key: 'a1_oola_fate', value: 'cleared' });
    g.step(1);
    expect(getEntity(g.world, npcEntityId('oola'))).toBeDefined();
    g.queue('flag.set', { key: 'a1_oola_fate', value: 'convicted' });
    g.step(1);
    expect(getEntity(g.world, npcEntityId('oola'))).toBeUndefined();
  });
});

describe('schedules and needs', () => {
  it('follows the schedule by the hour, offstage by snapping into place', () => {
    const g = game();
    stepTo(g, 0, 9);
    const cassian = g.world.slices.npc.npcs.cassian;
    expect(cassian?.activity).toBe('work');
    expect(cassian?.locId).toBe('chapel');
    expect(g.world.slices.npc.npcs.bron?.locId).toBe('guild');
    expect(g.world.slices.npc.npcs.martha?.locId).toBe('drunk_moon');
    const e = getEntity(g.world, npcEntityId('cassian'));
    const chapel = mapById(CONTENT, 'borderstone')?.locations.find((l) => l.id === 'chapel');
    expect(e && chapel && e.x >= chapel.x && e.x <= chapel.x + chapel.w).toBe(true);
    stepTo(g, 1, 2);
    expect(g.world.slices.npc.npcs.cassian?.activity).toBe('sleep');
    expect(g.world.slices.npc.npcs.ron?.activity).toBe('sleep');
    expect(g.world.slices.npc.npcs.ron?.locId).toBe('houses_south');
  });

  it('walks on the player map instead of teleporting', () => {
    const g = game();
    toBorderstone(g);
    stepTo(g, 0, 6, 59);
    const before = getEntity(g.world, npcEntityId('ron'));
    const start = before ? { x: before.x, y: before.y } : null;
    g.step(TICKS_PER_GAME_HOUR / 60 + 2);
    const ron = getEntity(g.world, npcEntityId('ron'));
    // 07:00: from the breakfast table to the guild board, on foot
    expect(g.world.slices.npc.npcs.ron?.locId).toBe('guild');
    expect(ron?.move).toBeTruthy();
    expect(start && ron && Math.hypot(ron.x - start.x, ron.y - start.y)).toBeLessThan(3);
  });

  it('lets a pressing need bend the schedule and pays wages once a day', () => {
    const g = game();
    stepTo(g, 0, 9, 30);
    const moneyBefore = holdingOf(g.world, npcEntityId('barga')).money;
    // the baker is selling bread; only a critical need interrupts work
    expect(g.world.slices.npc.npcs.ped?.activity).toBe('work');
    runInTick(g, (ctx) => {
      const st = ctx.world.slices.npc.npcs.ped;
      if (st) st.needs.hunger = 0;
    });
    stepTo(g, 0, 10);
    expect(g.world.slices.npc.npcs.ped?.activity).toBe('eat');
    // the need layer's utility (builtin_ai.md 4.1): the frugal baker (算小账, frugal x1.3)
    // eats at home rather than paying for the tavern
    expect(g.world.slices.npc.npcs.ped?.locId).toBe('bakery');
    stepTo(g, 1, 0, 5);
    expect(holdingOf(g.world, npcEntityId('barga')).money).toBeGreaterThan(moneyBefore);
    expect(eventsOf(g, 'money.changed').length).toBeGreaterThan(0);
  });
});

describe('tiers (D-009)', () => {
  it('keeps everyone offstage (L3/L4) until the player arrives, then lifts the town', () => {
    const g = game();
    const npcs = g.world.slices.npc.npcs;
    expect(Object.values(npcs).every((s) => s.tier === 3 || s.tier === 4)).toBe(true);
    toBorderstone(g);
    expect(npcs.ron?.tier).toBe(1);
    expect(npcs.cassian?.tier).toBe(1);
    expect(npcs.lina?.tier).toBe(2);
    expect(npcs.selene?.tier).toBe(3);
    const l1 = Object.values(npcs).filter((s) => s.tier === 1 && !s.talking);
    expect(l1.length).toBeLessThanOrEqual(12);
    expect(
      Object.values(npcs)
        .filter((s) => s.resident)
        .every((s) => s.tier === 4),
    ).toBe(true);
    expect(eventsOf(g, 'npc.tier_changed').length).toBeGreaterThan(0);
  });

  it('weighs story relevance by act: the act two cast wakes up offstage in act two', () => {
    const g = game();
    toBorderstone(g);
    expect(g.world.slices.npc.npcs.selene?.tier).toBe(3);
    g.queue('flag.set', { key: 'act', value: 'act2' });
    g.step(1);
    g.step(TICKS_PER_GAME_HOUR);
    expect(g.world.slices.npc.npcs.selene?.tier).toBe(2);
    // the act one cast on stage keeps its written L1 floor
    expect(g.world.slices.npc.npcs.ron?.tier).toBe(1);
  });

  it('promotes a quest-named NPC from offstage to L2', () => {
    const g = game();
    toBorderstone(g);
    expect(g.world.slices.npc.npcs.selene?.tier).toBe(3);
    g.queue('flag.set', { key: 'ai.focus.selene', value: true });
    g.step(1);
    expect(g.world.slices.npc.npcs.selene?.tier).toBe(2);
  });
});

describe('scripted errands', () => {
  it('sends an NPC on an errand for some hours; only scripts may', () => {
    const g = game();
    stepTo(g, 0, 9);
    g.queue('npc.goto', { npcId: 'ron', locationId: 'plaza', hours: 2, act: 'wander' });
    g.step(1);
    expect(g.world.slices.npc.npcs.ron?.locId).toBe('guild');
    g.queue(
      'npc.goto',
      { npcId: 'ron', locationId: 'plaza', hours: 2, act: 'wander' },
      { type: 'script', script: 't' },
    );
    g.queue(
      'npc.goto',
      { npcId: 'ron', locationId: 'nowhere', hours: 2 },
      { type: 'script', script: 't' },
    );
    g.step(1);
    expect(g.world.slices.npc.npcs.ron?.locId).toBe('plaza');
    const res = eventsOf(g, 'command.result').filter(
      (e) => e.data.kind === 'npc.goto' && !e.data.ok,
    );
    expect(res.map((e) => e.data.code)).toEqual(['not_allowed', 'no_place']);
    stepTo(g, 0, 11, 2);
    expect(g.world.slices.npc.npcs.ron?.locId).toBe('guild');
  });
});

describe('daily plans through the AI port', () => {
  it('files npc.daily requests at dawn for L1 and L2 and applies the rule fallback with the AI off', () => {
    const g = game();
    const seen = collect(g);
    toBorderstone(g);
    stepTo(g, 1, 5, 2);
    const asked = seen.filter((e) => e.kind === 'ai.requested' && e.data.role === 'npc.daily');
    expect(asked.length).toBeGreaterThan(20);
    const req = seen.filter((e) => e.kind === 'npc.plan_set');
    expect(req.length).toBe(asked.length);
    expect(req.every((e) => e.kind === 'npc.plan_set' && e.data.source === 'fallback')).toBe(true);
    expect(g.world.slices.npc.npcs.ron?.plan?.day).toBe(1);
    // offstage wallenburg residents get no daily plan
    expect(g.world.slices.npc.npcs.selene?.plan).toBeNull();
  });

  it('applies a model proposal, rejects stale, invalid and player-sourced plans', () => {
    const g = game(9, { aiMode: 'external' });
    toBorderstone(g);
    stepTo(g, 1, 5, 0);
    g.step(2);
    const reqs = g.takeAiRequests();
    const ronReq = reqs.find((r) => r.agentId === 'ron' && r.role === 'npc.daily');
    expect(ronReq).toBeDefined();
    if (!ronReq) return;
    // the prompt text is text keys; rendered in the source language it reads as before
    expect(JSON.stringify(ronReq.context)).toContain('sys.npc.prompt.isolation');
    const ctx = renderTextDeep(ronReq.context) as {
      v: number;
      persona: string;
      commands: Record<string, string>;
      voice?: string[];
    };
    expect(ctx.v).toBe(1);
    expect(ctx.persona).toContain('罗恩');
    expect(ctx.persona).toContain('不自动拥有资源');
    expect(ctx.persona).not.toContain('澱');
    expect(Object.keys(ctx.commands)).toEqual(['npc.plan']);
    expect(ronReq.allowed).toEqual(['npc.plan']);
    const day = calendarAt(g.tick).dayIndex;
    const good = [{ from: 5, to: 22, at: 'drunk_moon', act: 'chat' as const, note: '喝一天' }];
    g.resolveAi(ronReq.id, {
      type: 'proposal',
      commands: [
        {
          kind: 'npc.plan',
          data: { npcId: 'ron', revision: ronReq.revision, day, slots: good },
          source: { type: 'player' },
        },
      ],
    });
    g.step(1);
    expect(g.world.slices.npc.npcs.ron?.plan?.source).toBe('ai');
    expect(g.world.slices.npc.npcs.ron?.locId).toBe('drunk_moon');
    const results = () =>
      eventsOf(g, 'command.result').filter((e) => e.data.kind === 'npc.plan' && !e.data.ok);
    // stale revision
    g.queue(
      'npc.plan',
      { npcId: 'ron', revision: ronReq.revision - 1, day, slots: good },
      { type: 'script', script: 't' },
    );
    // a private home that is not his
    g.queue(
      'npc.plan',
      {
        npcId: 'ron',
        revision: ronReq.revision,
        day,
        slots: [{ from: 6, to: 9, at: 'magistrate', act: 'wander' }],
      },
      { type: 'script', script: 't' },
    );
    // the player cannot plan other people's days
    g.queue('npc.plan', { npcId: 'ron', revision: ronReq.revision, day, slots: good });
    g.step(1);
    const codes = results().map((e) => [e.data.code, e.data.reason]);
    expect(codes).toContainEqual(['bad_plan', tr('sys.npc.plan.reject.stale')]);
    expect(
      codes.some(
        ([c, r]) =>
          c === 'bad_plan' &&
          isTextRef(r) &&
          (r as KeyText).key === 'sys.npc.plan.reject.private' &&
          (r as KeyText).params?.n === 1,
      ),
    ).toBe(true);
    expect(codes).toContainEqual(['not_allowed', tr('sys.npc.reject.plan_not_allowed')]);
  });
});

describe('chat, relations and memory', () => {
  it('lets residents at one place talk, speak lines on the player map and warm up', () => {
    const g = game(3);
    const seen = collect(g);
    toBorderstone(g);
    stepTo(g, 0, 21);
    const convs = seen.filter((e) => e.kind === 'npc.conversed');
    expect(convs.length).toBeGreaterThan(5);
    const lines = seen.filter((e) => e.kind === 'dialogue.line');
    expect(lines.length).toBeGreaterThan(0);
    const c = convs.find(
      (e) =>
        e.kind === 'npc.conversed' &&
        !g.world.slices.npc.npcs[e.data.a]?.resident &&
        !g.world.slices.npc.npcs[e.data.b]?.resident,
    );
    expect(c).toBeDefined();
    if (c?.kind !== 'npc.conversed') return;
    const mind = g.world.slices.npc.minds[c.data.a];
    expect(mind?.relLog.some((r) => r.to === c.data.b)).toBe(true);
    expect(mind?.mem.some((m) => m.about === c.data.b)).toBe(true);
  });

  it('mirrors trust toward the player to the ledger flag and decays toward the baseline', () => {
    const g = game();
    runInTick(g, (ctx) => adjustRelation(ctx, 'shiya', 'player', { trust: 20, like: 30 }, '测试'));
    // Shiya is 倔 (the stubborn trait code, ./traits.ts): changes reach her at x0.7
    expect(g.world.meta.flags['trust.shiya']).toBe(45 + 14);
    expect(eventsOf(g, 'npc.relation_changed').some((e) => e.data.from === 'shiya')).toBe(true);
    const like = g.world.slices.npc.minds.shiya?.rel.player?.like ?? 0;
    stepTo(g, 3, 0, 5);
    const after = g.world.slices.npc.minds.shiya?.rel.player?.like ?? 0;
    expect(after).toBeLessThan(like);
    expect(after).toBeGreaterThan(like - 5);
  });

  it('bounds memory and folds old entries daily', () => {
    const g = game();
    runInTick(g, (ctx) => {
      for (let i = 0; i < 60; i++)
        addMemory(ctx, 'popo', { text: `琐事 ${i}`, src: 'self', imp: i === 3 ? 0.9 : 0.1 });
    });
    const mind = g.world.slices.npc.minds.popo;
    expect(mind?.mem.length).toBeLessThanOrEqual(MEMORY_CAP);
    expect(mind?.mem.some((m) => m.text === '琐事 3')).toBe(true);
    stepTo(g, 1, 0, 5);
    expect(mind && g.world.slices.npc.minds.popo?.digest.length).toBeGreaterThan(0);
    expect(g.world.slices.npc.minds.popo?.mem.some((m) => m.text === '琐事 3')).toBe(true);
  });
});

describe('batch diary (L3)', () => {
  it('writes the rule diary for offstage residents at midnight when no model answers', () => {
    const g = game();
    const seen = collect(g);
    stepTo(g, 1, 0, 3);
    const asked = seen.filter(
      (e) => e.kind === 'ai.requested' && e.data.role === 'npc.batch_diary',
    );
    expect(asked.length).toBeGreaterThanOrEqual(2);
    const written = seen.filter((e) => e.kind === 'npc.diary_written');
    expect(written.length).toBe(asked.length);
    const diary = g.world.slices.npc.npcs.cassian?.diary ?? [];
    expect(diary.length).toBeGreaterThan(0);
    expect(diary.length).toBeLessThanOrEqual(3);
    expect(diary.every((d) => d.day === 0 && t(d.text).length <= 40)).toBe(true);
    // the rule diary is text keys with the place and the other person as parameters; the
    // day's last entry closes with the mood line around its rule sentence
    const ruleKey = (x: unknown) =>
      isTextRef(x) && (x as KeyText).key.startsWith('sys.npc.diary.rule.');
    expect(
      diary.every((d, i) => {
        if (i < diary.length - 1) return ruleKey(d.text);
        const k = d.text as KeyText;
        return isTextRef(k) && k.key === 'sys.npc.diary.closing' && ruleKey(k.params?.text);
      }),
    ).toBe(true);
  });

  it('keeps only roster members, tracked kinds and three picks per person from a proposal', () => {
    const g = game(4, { aiMode: 'external' });
    stepTo(g, 1, 0, 2);
    const req = g
      .takeAiRequests()
      .find((r) => r.role === 'npc.batch_diary' && r.agentId === 'region:borderstone');
    expect(req).toBeDefined();
    if (!req) return;
    const round = g.world.slices.npc.diary.borderstone;
    const who = round?.roster.find((id) => (round.tracks[id] ?? []).includes('work')) ?? '';
    const entries = [
      { npcId: who, kind: 'work' as const, text: '今天干活很顺。' },
      { npcId: who, kind: 'injury' as const, text: '编出来的受伤' },
      { npcId: 'selene', kind: 'work' as const, text: '不在名册里' },
      { npcId: who, kind: 'work' as const, text: '一' },
      { npcId: who, kind: 'work' as const, text: '二' },
      { npcId: who, kind: 'work' as const, text: '三' },
    ];
    g.resolveAi(req.id, {
      type: 'proposal',
      commands: [
        {
          kind: 'npc.diary_batch',
          data: { mapId: 'borderstone', day: round?.day ?? 0, revision: req.revision, entries },
          source: { type: 'player' },
        },
      ],
    });
    g.step(1);
    const diary = g.world.slices.npc.npcs[who]?.diary ?? [];
    // the model's words are kept as raw text with their language (D-087)
    expect(diary.map((d) => d.text)).toEqual([
      rawText('今天干活很顺。'),
      rawText('一'),
      rawText('二'),
    ]);
    expect(g.world.slices.npc.npcs.selene?.diary.some((d) => d.text === '不在名册里')).toBe(false);
    g.queue('npc.diary_batch', {
      mapId: 'borderstone',
      day: 0,
      revision: req.revision,
      entries: [],
    });
    g.step(1);
    const res = eventsOf(g, 'command.result').filter(
      (e) => e.data.kind === 'npc.diary_batch' && !e.data.ok,
    );
    expect(res.at(-1)?.data.code).toBe('not_allowed');
  });
});

describe('queries and determinism', () => {
  it('exposes public views without secrets or hidden potential', () => {
    const g = game();
    const v = npcView(g.world, g.content, 'ron');
    expect(v?.name).toBe('罗恩');
    expect((v?.relationBand as KeyText | undefined)?.key.startsWith('sys.npc.relation.')).toBe(
      true,
    );
    expect(JSON.stringify(v)).not.toContain('从没独自打赢过');
    expect(JSON.stringify(v)).not.toContain('统帅');
    const list = npcsOnMap(g.world, g.content, 'wallenburg');
    expect(list.length).toBeGreaterThan(12);
  });

  it('is deterministic and replays from the command log with model proposals', () => {
    const run = (seed: number) => {
      const g = game(seed, { aiMode: 'external' });
      toBorderstone(g);
      for (let i = 0; i < 30; i++) {
        g.step(400);
        for (const r of g.takeAiRequests()) {
          if (r.role === 'npc.daily') g.resolveAi(r.id, { type: 'decline', reason: 'test' });
          else g.resolveAi(r.id, { type: 'proposal', commands: r.fallback });
        }
      }
      stepTo(g, 1, 6, 0);
      g.step(TICKS_PER_GAME_DAY / 100);
      return g;
    };
    const a = run(21);
    const b = run(21);
    expect(worldHash(a.world)).toBe(worldHash(b.world));
    const replay = Engine.replay(21, CONTENT, SYSTEMS, a.world.log);
    replay.step(a.tick);
    expect(worldHash(replay.world)).toBe(worldHash(a.world));
  });

  it('runs inside createGame() when every colleague module loads', async () => {
    let create: typeof import('../src/game/create') | null = null;
    try {
      create = await import('../src/game/create');
    } catch (err) {
      console.warn(
        `createGame() not loadable yet (other systems in progress): ${String(err).slice(0, 160)}`,
      );
      return;
    }
    const g = create.createGame({ seed: 5 });
    expect(g.systems.map((s) => s.id)).toEqual(
      expect.arrayContaining(['npc', 'cognition', 'dialogue']),
    );
    expect(Object.keys(g.world.slices.npc.npcs).length).toBeGreaterThan(50);
    g.step(TICKS_PER_GAME_HOUR + 5);
  });
});
