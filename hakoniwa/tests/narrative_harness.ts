// Test harness for the narrative systems (goddess, director, quests, scenes). It builds
// the real content and runs the real engine with the kernel systems plus the four
// narrative systems, and a stand-in for the systems owned by other teams (combat,
// dialogue, warfare, city, strategy): it answers their script-trigger flags the way the
// conventions describe, so a scripted player can walk the whole story without a model.

import { buildContent } from '../src/content';
import { type AiMode, Engine, ok } from '../src/core';
import type { ContentMap, FlagValue } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_HOUR } from '../src/core/time';
import { system as director } from '../src/systems/director';
import { system as goddess } from '../src/systems/goddess';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { type QuestDef, system as quests } from '../src/systems/quests';
import { system as scenes, sceneView } from '../src/systems/scenes';
import { system as world } from '../src/systems/world';
import type { MapDef } from '../src/systems/world/types';

declare module '../src/core/contracts' {
  interface CommandMap {
    'stub.talk': { npc: string };
    'stub.kill': { ref?: string; kind: string; mapId: string; boss?: boolean };
    'stub.build': { defId: string };
    'stub.battle': { scenario: string; victor: 'player' | 'enemy' };
    'stub.door': { doorId: string };
    'stub.feat': { tier: number };
  }
}

const STUB_MAPS = [
  'seal_ruins',
  'seal_ruins_depths',
  'borderstone',
  'forest_edge',
  'wallenburg',
  'wallenburg_sewers',
  'old_outpost',
  'ash_waste',
  'inner_court',
];

const STUB_LOCATIONS: Record<string, string[]> = {
  seal_ruins: ['wake_point'],
  seal_ruins_depths: ['ash_chamber'],
  borderstone: ['north_spring', 'guild'],
};

function stubMap(id: string): MapDef {
  const rows = Array.from({ length: 12 }, (_, y) =>
    y === 0 || y === 11 ? '#'.repeat(16) : `#${'.'.repeat(14)}#`,
  );
  return {
    id,
    name: id,
    region: id,
    width: 16,
    height: 12,
    rows,
    legend: { '#': 'wall', '.': 'floor' },
    locations: (STUB_LOCATIONS[id] ?? []).map((l, i) => ({
      id: l,
      name: l,
      kind: 'place',
      x: 2 + i * 4,
      y: 3,
      w: 2,
      h: 2,
    })),
    spawns: [],
    exits: [],
  };
}

/** Real content, with tiny stand-in maps for maps whose packs are not merged yet. */
export function narrativeContent(): ContentMap {
  const content = buildContent();
  const maps = [...content.maps];
  for (const id of STUB_MAPS) if (!maps.some((m) => m.id === id)) maps.push(stubMap(id));
  return { ...content, maps };
}

/** Answers other teams' trigger flags (conventions 4) the way their systems will. */
export const otherTeamsStub: GameSystem = {
  id: 'zz_other_teams',
  order: 990,
  commands: {
    'stub.talk'(ctx, d) {
      ctx.emit('player.talked', { npcId: `npc_${d.npc}`, npcRef: d.npc });
      return ok();
    },
    'stub.kill'(ctx, d) {
      ctx.emit('entity.died', {
        id: ctx.newId('victim'),
        ref: d.ref,
        kind: d.kind,
        killerId: ctx.world.slices.world.playerId,
        mapId: d.mapId,
        x: 1,
        y: 1,
      });
      if (d.boss && d.ref) ctx.setFlag(`boss.${d.ref}.defeated`, true);
      return ok();
    },
    'stub.build'(ctx, d) {
      ctx.emit('building.completed', {
        buildingId: ctx.newId('b'),
        defId: d.defId,
        siteId: 'site',
      });
      return ok();
    },
    'stub.battle'(ctx, d) {
      ctx.emit('battle.ended', {
        battleId: ctx.newId('battle'),
        victor: d.victor,
        scenario: d.scenario,
      });
      return ok();
    },
    'stub.door'(ctx, d) {
      ctx.emit('door.opened', { doorId: d.doorId, sealDelta: 1 });
      ctx.setFlag(`door.${d.doorId}`, true);
      return ok();
    },
    'stub.feat'(ctx, d) {
      const p = ctx.world.slices.world.entities[ctx.world.slices.world.playerId];
      ctx.emit('feat.performed', {
        actorId: ctx.world.slices.world.playerId,
        kind: 'kill',
        tier: d.tier,
        mapId: p?.mapId ?? '',
        x: p?.x ?? 0,
        y: p?.y ?? 0,
      });
      return ok();
    },
  },
  on: {
    'flag.changed'(ctx: SystemContext, e) {
      const { key, value } = e.data;
      // combat: a wave marked go is spawned and, in this stand-in, cleared at once
      const wave = /^combat\.wave\.([a-z0-9_]+)$/.exec(key);
      if (wave && value === 'go') ctx.setFlag(`combat.wave.${wave[1]}.state`, 'cleared');
      // domain milestones that follow a feature unlock
      if (key === 'feature.company' && value) ctx.setFlag('econ.company_founded', true);
      if (key === 'feature.village' && value) ctx.setFlag('city.village_founded', true);
      if (key === 'feature.slg' && value) {
        ctx.setFlag('territory_autonomy', 70);
        ctx.setFlag('autonomy', 70);
        ctx.setFlag('slg.nation_founded', true);
      }
    },
  },
};

export const NARRATIVE_SYSTEMS: GameSystem[] = [
  world,
  modifiers,
  inventory,
  goddess,
  director,
  quests,
  scenes,
];

export function narrativeGame(
  opts: { seed?: number; aiMode?: AiMode; stub?: boolean } = {},
): Engine {
  const systems = opts.stub === false ? NARRATIVE_SYSTEMS : [...NARRATIVE_SYSTEMS, otherTeamsStub];
  return Engine.create(opts.seed ?? 20261115, narrativeContent(), systems, {
    aiMode: opts.aiMode ?? 'off',
  });
}

export function flags(engine: Engine): Record<string, FlagValue> {
  return engine.world.meta.flags;
}

export function linesSaid(engine: Engine): string[] {
  return engine.world.recent.flatMap((e) => (e.kind === 'dialogue.line' ? [e.data.text] : []));
}

/** Collect every dialogue line for the whole run (the recent ring is bounded). */
export function recordLines(engine: Engine): { text: string; speakerId: string; kind: string }[] {
  const out: { text: string; speakerId: string; kind: string }[] = [];
  engine.onEvents((events) => {
    for (const e of events) {
      if (e.kind === 'dialogue.line')
        out.push({ text: e.data.text, speakerId: e.data.speakerId, kind: e.data.kind });
    }
  });
  return out;
}

export type ChoicePolicy = (
  sceneId: string,
  nodeId: string,
  choices: string[],
) => string | undefined;

/** Play the current scene to its end with a choice policy (first visible choice by default). */
export function playScene(engine: Engine, policy?: ChoicePolicy, maxSteps = 2000): void {
  for (let i = 0; i < maxSteps; i++) {
    const v = sceneView(engine.world, engine.content);
    if (!v) return;
    if (v.waiting === 'choice' || v.waiting === 'court') {
      const ids = v.choices.map((c) => c.id);
      const pick = policy?.(v.sceneId, v.nodeId, ids) ?? ids[0];
      engine.queue('scenes.choose', { choiceId: pick as string });
    } else if (v.waiting === 'input') {
      engine.queue('scenes.input', { text: '' });
    } else if (v.waiting === 'advance') {
      engine.queue('scenes.advance', {});
    }
    engine.step(1);
  }
  throw new Error('scene did not end');
}

/** Satisfy the current objectives of every active quest the way a player would. */
export function actOnQuests(engine: Engine): void {
  const slice = engine.world.slices.quests;
  for (const def of engine.content.quests as QuestDef[]) {
    const q = slice.quests[def.id];
    if (!q && def.giver) {
      engine.queue('stub.talk', { npc: def.giver });
      engine.queue('quests.accept', { questId: def.id });
      continue;
    }
    if (!q) continue;
    if (q.status === 'ready' && def.turnIn) {
      engine.queue('stub.talk', { npc: def.turnIn });
      engine.queue('quests.turn_in', { questId: def.id });
      continue;
    }
    if (q.status !== 'active') continue;
    const stage = def.stages[q.stage];
    stage?.objectives.forEach((o, i) => {
      if (q.met[i]) return;
      switch (o.type) {
        case 'reach': {
          const map = engine.content.maps.find((m) => m.id === o.mapId);
          const loc = map?.locations.find((l) => l.id === o.location);
          engine.queue('world.teleport', {
            entityId: 'player',
            mapId: o.mapId,
            x: loc ? loc.x + loc.w / 2 : (map?.width ?? 4) / 2,
            y: loc ? loc.y + loc.h / 2 : (map?.height ?? 4) / 2,
          });
          break;
        }
        case 'talk':
          engine.queue('stub.talk', { npc: o.npc });
          break;
        case 'kill':
          for (let k = 0; k < o.count; k++) {
            engine.queue('stub.kill', {
              ref: o.ref ?? o.refs?.[0],
              kind: o.kind ?? 'monster',
              mapId: o.mapId ?? 'forest_edge',
              boss: !!o.ref,
            });
          }
          break;
        case 'build':
          for (let k = 0; k < o.count; k++)
            engine.queue('stub.build', { defId: o.defId ?? 'house' });
          break;
        case 'battle':
          engine.queue('stub.battle', { scenario: o.scenario, victor: 'player' });
          break;
        case 'door':
          engine.queue('stub.door', { doorId: o.doorId });
          break;
        case 'choice':
          engine.queue('quests.choose', { questId: def.id, optionId: o.options[0]?.id ?? '' });
          break;
        case 'wait':
          engine.step(((o.hours ?? 0) + (o.days ?? 0) * 24) * TICKS_PER_GAME_HOUR + 20);
          break;
        default:
          break;
      }
    });
  }
}

/** Run the whole story with a choice policy until the epilogue (or a step budget). */
export function playThrough(engine: Engine, policy?: ChoicePolicy, rounds = 400): void {
  for (let r = 0; r < rounds; r++) {
    if (engine.world.meta.flags.act === 'epilogue' && !engine.world.slices.scenes.current) return;
    if (engine.world.slices.scenes.current) playScene(engine, policy);
    else {
      actOnQuests(engine);
      engine.step(3);
    }
  }
}
