// Shared harness of the topic-graph and talk tests (PK-M1-19): the shipped content (with
// optional extra line packs), the talk systems plus quests and the guild, a probe that
// runs code inside a tick and sets flags, and placing the player beside a person in
// Borderstone at 10:00 on a given day.

import { buildContent } from '../src/content';
import { Engine, ok } from '../src/core';
import type { AnyWorldEvent, ContentMap, FlagValue } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import { tickAtDay } from '../src/core/time';
import { contentTextLookup, setContentText } from '../src/shared_ui/i18n';
import { system as cognition } from '../src/systems/cognition';
import { system as dialogue } from '../src/systems/dialogue';
import type { LinePack } from '../src/systems/dialogue/lines/types';
import { system as economy } from '../src/systems/economy';
import { system as guild } from '../src/systems/guild';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { system as npc, npcEntityId } from '../src/systems/npc';
import { system as quests } from '../src/systems/quests';
import { getEntity, system as world } from '../src/systems/world';

declare module '../src/core/contracts' {
  interface CommandMap {
    'zz_tp.run': Record<string, never>;
  }
}

export const FULL: ContentMap = buildContent();
setContentText(contentTextLookup(FULL));

/** The shipped content with extra line packs (a fixture speaker's own topic lines). */
export function withPacks(packs: LinePack[], base: ContentMap = FULL): ContentMap {
  const content = { ...base, linePacks: [...base.linePacks, ...packs] } as ContentMap;
  setContentText(contentTextLookup(content));
  return content;
}

let pending: ((ctx: SystemContext) => void) | null = null;
const probe: GameSystem = {
  id: 'zz_topics_probe',
  order: 99,
  commands: {
    'zz_tp.run'(ctx) {
      pending?.(ctx);
      pending = null;
      return ok();
    },
  },
};

export const TALK_SYSTEMS: GameSystem[] = [
  world,
  inventory,
  modifiers,
  npc,
  dialogue,
  cognition,
  economy,
  quests,
  guild,
  probe,
];

export function game(content: ContentMap = FULL, seed = 7): Engine {
  return Engine.create(seed, content, TALK_SYSTEMS, { aiMode: 'off' });
}

export function runInTick(g: Engine, fn: (ctx: SystemContext) => void): void {
  pending = fn;
  g.queue('zz_tp.run', {});
  g.step(1);
}

export function setFlags(g: Engine, flags: Record<string, FlagValue>): void {
  runInTick(g, (ctx) => {
    for (const [k, v] of Object.entries(flags)) ctx.setFlag(k, v);
  });
}

export function collect(g: Engine): AnyWorldEvent[] {
  const all: AnyWorldEvent[] = [];
  g.onEvents((evs) => all.push(...evs));
  return all;
}

const GUILD = { x: 56.5, y: 31.5 };

/** Act 1, day `day` at 10:00 by the guild, the person one step from the player. */
export function besides(g: Engine, id: string, day = 0): void {
  const t = tickAtDay(day, 10, 1);
  if (t > g.tick) g.step(t - g.tick);
  setFlags(g, { act: 'act1' });
  g.queue('world.teleport', { entityId: 'player', mapId: 'borderstone', x: GUILD.x, y: GUILD.y });
  g.queue('world.teleport', {
    entityId: npcEntityId(id),
    mapId: 'borderstone',
    x: GUILD.x + 1,
    y: GUILD.y,
  });
  g.step(1);
  if (!getEntity(g.world, npcEntityId(id))) throw new Error(`no ${id}`);
}

/** Open a talk with a person beside the player. */
export function talkTo(g: Engine, id: string, day = 0): void {
  besides(g, id, day);
  g.queue('dialogue.talk', { npcId: npcEntityId(id) });
  g.step(1);
}

/** The key of a spoken text param (a line key, or a text key), through the reply's clip. */
export function keyOf(text: unknown): string {
  if (text && typeof text === 'object' && 'key' in text) {
    const ref = text as { key: string; params?: { text?: unknown } };
    if (ref.key === 'sys.common.clip') return keyOf(ref.params?.text);
    return ref.key;
  }
  return String(text);
}
