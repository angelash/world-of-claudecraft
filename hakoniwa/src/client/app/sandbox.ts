// Dev-only client sandbox (?sandbox=1 in dev mode): a world built from the finished
// kernel parts only (world, inventory, modifiers) plus a demo map that exercises every
// tile kind, roofs, exits, all sprite archetypes, speech bubbles, divine lines and the
// weather cycle. It lets the client be checked while other systems are still in
// progress. Never part of the real game: main.ts loads it only in dev mode.

import type { ContentPack } from '../../content/pack';
import { pack as inventoryPack } from '../../content/packs/inventory';
import { pack as worldPack } from '../../content/packs/world';
import type { ContentMap } from '../../core/contracts';
import { Engine } from '../../core/engine';
import type { GameSystem, SystemContext } from '../../core/system';
import { TICKS_PER_GAME_HOUR } from '../../core/time';
import type { World } from '../../core/world';
import type { ItemDef } from '../../systems/inventory';
import { addItem, addMoney, system as inventorySystem } from '../../systems/inventory';
import { system as modifiersSystem } from '../../systems/modifiers';
import {
  forceWeather,
  orderMove,
  spawnEntity,
  type WorldStart,
  system as worldSystem,
} from '../../systems/world';
import type { Appearance, MapDef, Weather } from '../../systems/world/types';

const ROWS = [
  '########################################',
  '#TT..........rr.......~~~~~~~..........#',
  '#T.....TT............~~~~~~~~~~...T....#',
  '#......TT......##########~~~~~~...TT...#',
  '#..............#,,,,,,,,#~~~~~.........#',
  '#....######....#,,,,,,,,#=~~~..xxxxxx..#',
  '#....#,,,,#....#,,,,,,,,+=====.xxxxxx..#',
  '#....#,,,,+====##########..=...xxxxxx..#',
  '#....######...=............=...........#',
  '#.............=....ssssss..=....**.....#',
  '#=============sssssssssssss=====****...#',
  '#.............=....ssssss..=....**.....#',
  '#..TT.........=............=......^^^..#',
  '#..TT.........=.....~~.....=.....^^^^..#',
  '#.............=.....~~~....=......^^^..#',
  '#.....rr......=......~~....=...........#',
  '#.............=......BB....=......rr...#',
  '#....dddd.....=......~~....=...........#',
  '#....dddd.....==============....TT.....#',
  '#......................................#',
  '########################################',
];

const SANDBOX_MAP: MapDef = {
  id: 'client_sandbox',
  name: '客户端沙盒',
  region: 'test',
  width: 40,
  height: ROWS.length,
  rows: ROWS,
  legend: {
    '#': 'wall',
    '.': 'grass',
    T: 'tree',
    r: 'rock',
    '~': 'water',
    '=': 'road',
    ',': 'floor',
    '+': 'door',
    s: 'stone',
    x: 'crop',
    '*': 'snow',
    '^': 'ash',
    B: 'bridge',
    d: 'dirt',
  },
  locations: [
    { id: 'sb_tavern', name: '醉月亭', kind: 'tavern', x: 16, y: 4, w: 8, h: 3 },
    { id: 'sb_home', name: '小屋', kind: 'home', x: 6, y: 6, w: 4, h: 2 },
    { id: 'sb_plaza', name: '广场', kind: 'plaza', x: 15, y: 9, w: 12, h: 3 },
  ],
  spawns: [],
  exits: [
    { id: 'to_test', x: 38, y: 19, toMap: 'testfield', toX: 2.5, toY: 1.5, label: '测试原野' },
    {
      id: 'sealed',
      x: 1,
      y: 19,
      toMap: 'testfield',
      toX: 2.5,
      toY: 1.5,
      label: '封印之门',
      requiresFlags: ['sandbox.unsealed'],
    },
  ],
  sediment: 0,
};

const ITEMS: ItemDef[] = [
  {
    id: 'sb_sword',
    name: '旧铁剑',
    kind: 'weapon',
    quality: 1,
    value: 450,
    desc: '刃口有缺，还能用。',
    slot: 'main_hand',
    weapon: { min: 3, max: 7, speed: 2.4, range: 1.5 },
  },
  {
    id: 'sb_cap',
    name: '皮帽',
    kind: 'armor',
    quality: 2,
    value: 220,
    desc: '暖和。',
    slot: 'head',
  },
  {
    id: 'sb_potion',
    name: '药草汤',
    kind: 'consumable',
    quality: 1,
    value: 35,
    desc: '欧拉婆婆的配方。',
    use: { effect: 'heal', amount: 30 },
  },
  { id: 'sb_herb', name: '月见草', kind: 'material', quality: 0, value: 4, desc: '夜里会发光。' },
  { id: 'sb_key', name: '锈钥匙', kind: 'key', quality: 3, value: 0, desc: '不知道开哪扇门。' },
];

interface Demo {
  name: string;
  appearance: Appearance;
  x: number;
  y: number;
  kind: 'npc' | 'monster' | 'object';
  tags?: string[];
  wander?: boolean;
}

const DEMOS: Demo[] = [
  {
    name: '希雅',
    appearance: { base: 'beastkin', colors: ['#5a6a8a', '#d8c8a8', '#f0d0b0', '#c8c8d0'] },
    x: 18,
    y: 10,
    kind: 'npc',
    wander: true,
  },
  {
    name: '罗恩',
    appearance: { base: 'human', colors: ['#7a4a2e', '#4a4a3a', '#e8c0a0', '#3a2a1a'] },
    x: 20,
    y: 11,
    kind: 'npc',
    wander: true,
  },
  {
    name: '精灵旅人',
    appearance: { base: 'elf', colors: [] },
    x: 23,
    y: 9.5,
    kind: 'npc',
    wander: true,
  },
  { name: '矮人铁匠', appearance: { base: 'dwarf', colors: [] }, x: 12, y: 8.5, kind: 'npc' },
  {
    name: '半身人',
    appearance: { base: 'halfling', colors: [] },
    x: 25,
    y: 11,
    kind: 'npc',
    wander: true,
  },
  {
    name: '玛莎',
    appearance: { base: 'human', colors: ['#8a3a4a', '#e8dcc0', '#f2cdb0', '#6a3a2a'] },
    x: 19,
    y: 5.5,
    kind: 'npc',
    tags: ['merchant'],
  },
  {
    name: '无名魔族',
    appearance: { base: 'demon', colors: [] },
    x: 34,
    y: 13,
    kind: 'monster',
    wander: true,
  },
  {
    name: '游荡骸骨',
    appearance: { base: 'undead', colors: [] },
    x: 35,
    y: 15,
    kind: 'monster',
    wander: true,
  },
  {
    name: '史莱姆',
    appearance: { base: 'slime', colors: [] },
    x: 8,
    y: 13,
    kind: 'monster',
    wander: true,
  },
  {
    name: '灰狼',
    appearance: { base: 'wolf', colors: [] },
    x: 6,
    y: 16,
    kind: 'monster',
    wander: true,
  },
  {
    name: '鸦',
    appearance: { base: 'bird', colors: [] },
    x: 30,
    y: 3,
    kind: 'monster',
    wander: true,
  },
  { name: '石像', appearance: { base: 'golem', colors: [] }, x: 33, y: 7, kind: 'monster' },
  {
    name: '林间精灵',
    appearance: { base: 'spirit', colors: ['#9ae0b0'] },
    x: 9,
    y: 3,
    kind: 'npc',
    wander: true,
  },
  { name: '光之女神', appearance: { base: 'goddess', colors: [] }, x: 21, y: 15, kind: 'npc' },
  {
    name: '告示牌',
    appearance: { base: 'object', colors: ['#9a7448', '#5a4030'], glyph: '告' },
    x: 14,
    y: 11.5,
    kind: 'object',
  },
  {
    name: '木箱',
    appearance: { base: 'object', colors: ['#8a6a48', '#5a4030'] },
    x: 27,
    y: 8,
    kind: 'object',
  },
];

const LINES = [
  '今天的麦子长得不错。你也来看看吧！',
  '听说北边的遗迹又有动静了。',
  '这个人好奇怪，衣服的式样从没见过。',
  '天黑之前得把柴劈完。',
  '你有没有闻到一股烧焦的味道？',
];

const WEATHERS: Weather[] = ['clear', 'cloudy', 'rain', 'storm', 'fog', 'snow', 'ashfall'];

function sandboxSystem(): GameSystem {
  return {
    id: 'zz_client_sandbox',
    order: 990,
    init(ctx: SystemContext) {
      for (const d of DEMOS) {
        spawnEntity(ctx, {
          kind: d.kind,
          name: d.name,
          mapId: SANDBOX_MAP.id,
          x: d.x,
          y: d.y,
          faction: d.kind === 'monster' ? 'wild' : 'town',
          appearance: d.appearance,
          speed: 2,
          tags: [
            ...(d.tags ?? []),
            d.kind === 'monster' ? 'lvl:3' : 'lvl:1',
            'tier:0',
            ...(d.wander ? ['sb_wander'] : []),
          ],
        });
      }
      const pid = ctx.world.slices.world.playerId;
      const player = ctx.world.slices.world.entities[pid];
      if (player) player.name = '异界人';
      for (const it of ITEMS) addItem(ctx, pid, it.id, it.kind === 'material' ? 7 : 1, 'sandbox');
      addMoney(ctx, pid, 12345, 'sandbox');
    },
    tick(ctx: SystemContext) {
      const rng = ctx.rng('client_sandbox');
      if (ctx.tick % 40 === 0) {
        const wanderers = Object.values(ctx.world.slices.world.entities)
          .filter((e) => e.tags.includes('sb_wander'))
          .sort((a, b) => (a.id < b.id ? -1 : 1));
        const e = wanderers[rng.int(0, Math.max(0, wanderers.length - 1))];
        if (e?.home) orderMove(ctx, e.id, e.home.x + rng.int(-3, 3), e.home.y + rng.int(-2, 2));
      }
      if (ctx.tick % 160 === 80) {
        const all = Object.values(ctx.world.slices.world.entities).filter((e) => e.kind === 'npc');
        const sp = all[rng.int(0, all.length - 1)];
        if (sp) {
          const kind =
            sp.appearance.base === 'goddess' ? 'divine' : ctx.tick % 480 === 80 ? 'think' : 'say';
          ctx.emit('dialogue.line', {
            speakerId: sp.id,
            speakerName: sp.name,
            text:
              kind === 'divine'
                ? '迷途之人，你终于来了。门后的世界，正在等你。'
                : (LINES[rng.int(0, LINES.length - 1)] as string),
            listenerId: kind === 'divine' ? ctx.world.slices.world.playerId : undefined,
            kind,
          });
        }
      }
      if (ctx.tick % 600 === 300) {
        const w = WEATHERS[Math.floor(ctx.tick / 600) % WEATHERS.length] as Weather;
        forceWeather(ctx, w, ctx.tick + 600, 'client_sandbox');
      }
    },
  };
}

/** Merge packs like content/index.ts does, without its glob over every pack. */
function mergePacks(packs: ContentPack[]): ContentMap {
  const out: Record<string, unknown> = {};
  for (const pack of packs) {
    for (const [table, value] of Object.entries(pack.tables)) {
      const prev = out[table];
      out[table] = Array.isArray(prev) && Array.isArray(value) ? [...prev, ...value] : value;
    }
  }
  return out as unknown as ContentMap;
}

function sandboxContent(): ContentMap {
  const starts: WorldStart[] = [{ mapId: SANDBOX_MAP.id, x: 20.5, y: 12.5, priority: 1000 }];
  return mergePacks([
    worldPack,
    inventoryPack,
    { id: 'client_sandbox', tables: { maps: [SANDBOX_MAP], worldStarts: starts, items: ITEMS } },
  ]);
}

function sandboxSystems(): GameSystem[] {
  return [modifiersSystem, worldSystem, inventorySystem, sandboxSystem()];
}

export function createSandboxGame(seed: number, startHour?: number): Engine {
  const engine = Engine.create(seed, sandboxContent(), sandboxSystems());
  if (startHour !== undefined && startHour > 6) {
    engine.step(Math.round((startHour - 6) * TICKS_PER_GAME_HOUR));
  }
  return engine;
}

export function resumeSandboxGame(world: World): Engine {
  return Engine.resume(world, sandboxContent(), sandboxSystems());
}
