// Nurture, destroy, purify (catalog_dungeons_bosses.md 1.2; catalog_bestiary.md 2.8): the
// three dispositions of a dungeon or a nest. A record offers the ones its owner and the
// world allow; destroy and purify are made once and for good, nurture may still turn into
// either. Nurture holds at once (a nest drops to the stage it is kept at); destroy breaks
// the core and the place collapses after some days (a timed escape: whoever still stands
// inside when it caves in is put out at the gate, what was left inside is swallowed) and
// then writes the collapse switch `dg.<id>.collapsed`, which map switch areas and spawn
// points read; purify runs a ritual for some days (the dungeon's activity rises while it
// runs; the kernel or the story may break it off, the ritual was not held) and leaves a
// clean site. The choice is mirrored to `dg.<id>.choice` when it is made; content may also
// write that flag (a quest's choice stage): the runtime settles the same consequences,
// except where the record's owner refuses that choice, when the flag goes back.

import type { CommandSource } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import { applyEffects, conditionHolds } from '../quests/effects';
import { playerEntity } from '../world';
import { dungeonConfig, floorAt } from './layout';
import { swallowAllIn } from './left_items';
import { atPlace, leaveDungeon, track } from './run';
import { dungeonsSlice } from './slice';
import { addActivity, endActive, formed, isActive, mirrorTarget, type Target } from './state';
import type { Choice, ChoiceDef } from './types';
import { CHOICES } from './types';

/** Why a disposition cannot be made now (a text key suffix), or null when it can. */
export type ChoiceRefusal =
  | 'bad_choice'
  | 'settled'
  | 'already'
  | 'not_offered'
  | 'not_formed'
  | 'owner_refuses'
  | 'not_now'
  | 'not_cleared'
  | 'far';

/** A purification ritual lasts a day when the record names no length (the validator asks one). */
const RITUAL_DAYS_FALLBACK = 1;

export function isChoice(v: unknown): v is Choice {
  return typeof v === 'string' && (CHOICES as readonly string[]).includes(v);
}

/** Whether the target's disposition is made for good (or on its way). */
export function settled(t: Target): boolean {
  return t.state.choice === 'destroy' || t.state.choice === 'purify' || t.state.pending !== null;
}

/** The record's entry for a choice. */
export function choiceDef(t: Target, choice: Choice): ChoiceDef | undefined {
  return t.def.choices?.[choice];
}

/** Whether the player stands at the target: inside the dungeon, or at the nest. */
export function playerAt(ctx: SystemContext, t: Target): boolean {
  if (t.kind === 'dungeon') return dungeonsSlice(ctx.world).run?.dungeon === t.id;
  return atPlace(ctx, { mapId: t.def.mapId, location: t.def.location });
}

/** Whether the target exists to be disposed of: a formed dungeon, a live nest not yet grown. */
function present(ctx: SystemContext, t: Target): ChoiceRefusal | null {
  if (t.kind === 'dungeon') return formed(ctx.world, ctx.content, t.id) ? null : 'not_formed';
  return t.state.live && !t.state.matured ? null : 'not_offered';
}

/**
 * The refusal of a disposition by a command, or null. Nests are disposed of once cleared
 * (their lord down); a dungeon is destroyed once its core boss is down. A player stands at
 * the place; the kernel and the story may decide from anywhere.
 */
export function choiceRefusal(
  ctx: SystemContext,
  t: Target,
  choice: unknown,
  source: CommandSource,
): ChoiceRefusal | null {
  if (!isChoice(choice)) return 'bad_choice';
  const gone = present(ctx, t);
  if (gone) return gone;
  if (settled(t)) return 'settled';
  if (t.state.choice === choice) return 'already';
  const def = choiceDef(t, choice);
  if (!def) return 'not_offered';
  if (def.ownerRefuses) return 'owner_refuses';
  if (def.when && !conditionHolds(ctx, def.when)) return 'not_now';
  const needsClear = t.kind === 'nest' || choice === 'destroy';
  if (needsClear && !t.state.cleared) return 'not_cleared';
  if (source.type === 'player' && !playerAt(ctx, t)) return 'far';
  return null;
}

/** Game days of a collapse or ritual: the record's (a band is rolled), else the default. */
function choiceDays(ctx: SystemContext, def: ChoiceDef | undefined, choice: Choice): number {
  const cfg = dungeonConfig(ctx.content);
  const days = def?.days ?? (choice === 'destroy' ? cfg?.collapseDays : RITUAL_DAYS_FALLBACK) ?? 0;
  if (typeof days === 'number') return days;
  return ctx.rng('dungeons.collapse').int(days[0], days[1]);
}

/**
 * Make a disposition (the checks are the caller's). `by` says whether a command made it or
 * a content write of `dg.<id>.choice` (the flag is then already written).
 */
export function beginChoice(
  ctx: SystemContext,
  t: Target,
  choice: Choice,
  by: 'command' | 'content',
): void {
  const def = choiceDef(t, choice);
  const st = t.state;
  const from = st.choice;
  st.choice = choice;
  st.choiceTick = ctx.tick;
  ctx.emit('dungeon.choice', { id: t.id, kind: t.kind, choice, by });
  applyEffects(ctx, def?.start);
  if (choice === 'nurture') {
    if (t.kind === 'nest') {
      const cfg = dungeonConfig(ctx.content);
      if (cfg && t.state.stage > cfg.nest.nurtureStage) t.state.stage = cfg.nest.nurtureStage;
      t.state.since = ctx.tick;
    } else {
      t.state.grown = 0;
      t.state.idle = 0;
    }
    applyEffects(ctx, def?.effects);
    mirrorTarget(ctx, t);
    return;
  }
  const days = choiceDays(ctx, def, choice);
  st.pending = { choice, until: ctx.tick + Math.round(days * TICKS_PER_GAME_DAY), from };
  if (choice === 'purify' && t.kind === 'dungeon') {
    const cfg = dungeonConfig(ctx.content);
    if (cfg) addActivity(ctx, t.def, t.state, cfg.activity.ritual);
  }
  mirrorTarget(ctx, t);
  if (st.pending && st.pending.until <= ctx.tick) completeChoice(ctx, t);
}

/** Whether the player stands on one of the dungeon's floors (by position, not the visit). */
function playerInside(ctx: SystemContext, dungeonId: string): boolean {
  const p = playerEntity(ctx.world);
  return !!p && !!floorAt(ctx.content, p.mapId, p.x, p.y, (d) => d.id === dungeonId);
}

/** A collapse or a ritual reaches its end: the disposition takes hold. */
export function completeChoice(ctx: SystemContext, t: Target): void {
  const pending = t.state.pending;
  if (!pending) return;
  const def = choiceDef(t, pending.choice);
  const cfg = dungeonConfig(ctx.content);
  const wasActive = t.kind === 'dungeon' && !!cfg && isActive(cfg, t.state);
  t.state.pending = null;
  if (pending.choice === 'destroy') {
    if (t.kind === 'nest') {
      t.state.collapsed = true;
      t.state.collapsedTick = ctx.tick;
    } else {
      const inside = playerInside(ctx, t.id);
      t.state.collapsed = true;
      t.state.overflowAt = -1;
      endActive(ctx, t.id, wasActive);
      if (inside) leaveDungeon(ctx, t.def, 'collapse');
      else track(ctx, 'collapse');
      swallowAllIn(ctx, t.id);
    }
    ctx.emit('dungeon.collapsed', { id: t.id, kind: t.kind });
  } else {
    t.state.purified = true;
    if (t.kind === 'dungeon') {
      t.state.activity = 0;
      t.state.overflowAt = -1;
      endActive(ctx, t.id, wasActive);
      // a clean site is no dungeon: the visit ends where the player stands
      track(ctx, 'purify');
    }
    ctx.emit('dungeon.purified', { id: t.id, kind: t.kind });
  }
  applyEffects(ctx, def?.effects);
  mirrorTarget(ctx, t);
}

/**
 * A running purification ritual is broken off (the defence failed): the disposition falls
 * back to what it was before. False when no ritual runs (a collapse cannot be stopped).
 */
export function breakRitual(ctx: SystemContext, t: Target): boolean {
  const pending = t.state.pending;
  if (pending?.choice !== 'purify') return false;
  t.state.pending = null;
  t.state.choice = pending.from;
  ctx.emit('dungeon.ritual_failed', { id: t.id, kind: t.kind });
  mirrorTarget(ctx, t);
  return true;
}

/**
 * Content wrote `dg.<id>.choice`: settle that disposition as if it had been made, when it
 * is a legal next step the record offers and its owner allows; otherwise put the flag back
 * to what holds (an owner's refusal is told: `dungeon.choice_refused`). The rest of the
 * record's rules (its condition, the boss down, standing there) are the story's to keep.
 */
export function adoptChoiceFlag(ctx: SystemContext, t: Target, value: unknown): void {
  if (value === t.state.choice) return;
  const def = isChoice(value) && !settled(t) && !present(ctx, t) ? choiceDef(t, value) : undefined;
  if (def && isChoice(value) && !def.ownerRefuses) {
    beginChoice(ctx, t, value, 'content');
    return;
  }
  if (def?.ownerRefuses && isChoice(value))
    ctx.emit('dungeon.choice_refused', {
      id: t.id,
      kind: t.kind,
      choice: value,
      reason: 'owner_refuses',
    });
  ctx.setFlag(`dg.${t.id}.choice`, t.state.choice);
}
