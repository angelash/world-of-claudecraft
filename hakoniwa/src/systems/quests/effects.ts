// The effect interpreter shared by quests and scenes. Each effect writes through the
// owning port: flags through ctx.setFlag, goddess values through the goddess ports,
// items and money through inventory, movement through world, experience through the
// xp.awarded event, waves and battles through the script-trigger flags of
// docs/50_tech/implementation_conventions.md 4. Named computations live in code and are
// registered by the module that owns their state.

import type { FlagValue } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { addMemoryTag, adjustImpression, adjustInterest, adjustRelation } from '../goddess/state';
import { issueRevelation } from '../goddess/wake';
import { addItem, addMoney, holdingOf, removeItem } from '../inventory';
import { mapById, setAppearance, teleportEntity } from '../world';
import { setAct } from './acts';
import { calendarTerms } from './calendar_terms';
import { evaluate, flagResolver } from './conditions';
import type { ComputeFn, Effect, KeyKind } from './effect_types';
import { startQuest } from './progress';
import { defaultKind, fillSlots, speakerName } from './speakers';

type ComputeImpl = (ctx: SystemContext) => void;

declare module '../../core/contracts' {
  interface EventMap {
    /** a quest granted a key of a door (the key event of quests_and_events.md 3.4) */
    'quest.key': { doorId: string; keyKind: KeyKind; keyId: string };
  }
}

/** The flag a key event writes (registry family door_key.<door>.<key>; value: the key kind). */
export function keyFlag(doorId: string, keyId: string): string {
  return `door_key.${doorId}.${keyId}`;
}

// A hoisted function holds the registry so registration from other modules works no
// matter which module of an import cycle finishes evaluating first.
function registry(): Map<ComputeFn, ComputeImpl> {
  const holder = registry as unknown as { store?: Map<ComputeFn, ComputeImpl> };
  if (!holder.store) holder.store = new Map();
  return holder.store;
}

/** Register the implementation of a named computation (called at module load). */
export function registerCompute(fn: ComputeFn, impl: ComputeImpl): void {
  registry().set(fn, impl);
}

export function hasCompute(fn: ComputeFn): boolean {
  return registry().has(fn);
}

/**
 * Condition resolver over flags plus the built-ins available to content: `ai_enabled` and
 * the calendar terms of the current tick (calendar_terms.ts).
 */
export function narrativeResolver(ctx: SystemContext) {
  // A replay runs in mode 'replay'; treating every mode but 'off' alike keeps replays of
  // model runs on the same branches (the kernel re-applies the logged proposals).
  return flagResolver(ctx.world.meta.flags, {
    ...calendarTerms(ctx.tick),
    ai_enabled: ctx.world.ai.mode !== 'off',
  });
}

export function conditionHolds(ctx: SystemContext, expr: string | undefined): boolean {
  return evaluate(expr, narrativeResolver(ctx));
}

function num(v: FlagValue | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Move the player to a map location (or coordinates); false when the target is unknown. */
export function teleportPlayer(
  ctx: SystemContext,
  mapId: string,
  location?: string,
  x?: number,
  y?: number,
): boolean {
  const map = mapById(ctx.content, mapId);
  if (!map) return false;
  const loc = location ? map.locations.find((l) => l.id === location) : undefined;
  const tx = loc ? loc.x + loc.w / 2 : (x ?? map.width / 2);
  const ty = loc ? loc.y + loc.h / 2 : (y ?? map.height / 2);
  return teleportEntity(ctx, ctx.world.slices.world.playerId, mapId, tx, ty);
}

export function unlockFeature(ctx: SystemContext, feature: string): void {
  const key = `feature.${feature}`;
  if (ctx.flag(key)) return;
  ctx.setFlag(key, true);
  ctx.emit('feature.unlocked', { feature });
}

export function applyEffect(ctx: SystemContext, e: Effect): void {
  if (e.when && !conditionHolds(ctx, e.when)) return;
  const playerId = ctx.world.slices.world.playerId;
  switch (e.type) {
    case 'flag':
      ctx.setFlag(e.key, e.value);
      return;
    case 'add': {
      let v = num(ctx.flag(e.key)) + e.amount;
      if (e.min !== undefined) v = Math.max(e.min, v);
      if (e.max !== undefined) v = Math.min(e.max, v);
      ctx.setFlag(e.key, Math.round(v * 1000) / 1000);
      return;
    }
    case 'append': {
      const cur = String(ctx.flag(e.key) ?? '');
      const set = cur ? cur.split(',') : [];
      if (!set.includes(e.value)) set.push(e.value);
      ctx.setFlag(e.key, set.join(','));
      return;
    }
    case 'copy': {
      const v = ctx.flag(e.from);
      if (v !== undefined) ctx.setFlag(e.key, v);
      return;
    }
    case 'impression':
      adjustImpression(ctx, e.goddess, e.amount);
      return;
    case 'interest':
      adjustInterest(ctx, e.goddess, e.amount);
      return;
    case 'relation':
      adjustRelation(ctx, e.goddess, e.amount);
      return;
    case 'memory':
      addMemoryTag(ctx, e.goddess, e.tag);
      return;
    case 'hint': {
      const key = `p_hint.${e.door}`;
      ctx.setFlag(key, num(ctx.flag(key)) + (e.amount ?? 1));
      return;
    }
    case 'quest':
      startQuest(ctx, e.quest);
      return;
    case 'item':
      addItem(ctx, playerId, e.item, e.count ?? 1, 'story');
      return;
    case 'take':
      removeItem(ctx, playerId, e.item, e.count ?? 1, 'story');
      return;
    case 'money': {
      if (e.amount >= 0) addMoney(ctx, playerId, e.amount, 'story');
      else {
        const have = holdingOf(ctx.world, playerId).money;
        const spend = Math.min(have, -e.amount);
        if (spend > 0) addMoney(ctx, playerId, -spend, 'story');
      }
      return;
    }
    case 'xp':
      ctx.emit('xp.awarded', { entityId: playerId, amount: e.amount, reason: e.reason ?? 'quest' });
      return;
    case 'teleport':
      teleportPlayer(ctx, e.mapId, e.location, e.x, e.y);
      return;
    case 'feature':
      unlockFeature(ctx, e.feature);
      return;
    case 'companion':
      ctx.setFlag(`companion.${e.id}.recruited`, true);
      return;
    case 'wave':
      ctx.setFlag(`combat.wave.${e.wave}`, 'go');
      return;
    case 'war':
      ctx.setFlag('war.pending', e.scenario);
      return;
    case 'scene':
      ctx.setFlag('scene.pending', e.scene);
      return;
    case 'act':
      setAct(ctx, e.act);
      return;
    case 'appearance':
      setAppearance(ctx, playerId, { base: e.base, colors: [...e.colors] });
      ctx.setFlag('p_appearance', `${e.base}:${e.colors.join(',')}`);
      return;
    case 'name': {
      const name = String(ctx.flag(e.from) ?? '').trim() || emptyName(ctx, e.from);
      ctx.setFlag('player.name', name);
      ctx.setFlag('player.name', name);
      return;
    }
    case 'revelation': {
      const rev = ctx.content.revelations.find((r) => r.id === e.id);
      if (rev) issueRevelation(ctx, rev);
      return;
    }
    case 'compute':
      registry().get(e.fn)?.(ctx);
      return;
    case 'key':
      // the doors system reads the flag in a door's keys ({ type: 'flag', key }) or counts
      // the event; opening stays its decision (quests_and_events.md 3.4)
      ctx.setFlag(keyFlag(e.doorId, e.keyId), e.keyKind);
      ctx.emit('quest.key', { doorId: e.doorId, keyKind: e.keyKind, keyId: e.keyId });
      return;
    case 'line': {
      const flags = ctx.world.meta.flags;
      ctx.emit('dialogue.line', {
        speakerId: e.speaker,
        speakerName: speakerName(flags, ctx.content, e.speaker),
        text: fillSlots(e.text, flags),
        kind: e.kind ?? defaultKind(ctx.content, e.speaker),
      });
      return;
    }
  }
}

/**
 * The written default of a name nobody gave: the `empty` value of the scene input that
 * stores into `key` (the prologue's name prompt). Content text, so it stays a plain
 * string (flags hold plain values); '' when no input declares one.
 */
function emptyName(ctx: SystemContext, key: string): string {
  for (const scene of ctx.content.scenes ?? []) {
    for (const node of scene.nodes) {
      if (node.input?.storeAs === key && node.input.empty) return node.input.empty;
    }
  }
  return '';
}

export function applyEffects(ctx: SystemContext, effects: readonly Effect[] | undefined): void {
  if (!effects) return;
  for (const e of effects) applyEffect(ctx, e);
}
