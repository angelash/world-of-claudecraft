// Initiative (builtin_ai.md 3.4): with no model the town still comes to the player. An L1
// or L2 NPC with a reason walks up and speaks first: a request to hand over, a rumor about
// the player to check, thanks owed, a worshipper's greeting, a hostile warning, or plain
// acquaintance. Limits: one approach per NPC per game day, three per map per game hour
// (counted when one speaks), none while the player talks, trades, watches a scene or
// fights, and an NPC the player walked away from twice in a row stops approaching for the
// rest of the game week.

import type { SystemContext } from '../../../core/system';
import type { TextParam } from '../../../core/text';
import { calendarAt, TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../../../core/time';
import { rumorText } from '../../cognition/rumor_text';
import { playerEntity } from '../../world';
import { trackPlayerTalk } from '../actions';
import { APPROACH_PER_HOUR, APPROACH_WAIT } from '../constants';
import { ensureNeeds } from '../needs';
import { npcEntityId } from '../personas';
import { hasTrait } from '../traits';
import type { ApproachReason, NpcState } from '../types';
import { remember } from './memory_rules';
import type { BrainDecision } from './root';
import { noteText } from './root';
import { beliefAboutPlayer, holdingsByHeat, playerWithin, towardPlayer } from './sense';
import { sayToPlayer } from './speech';
import { ensureBrain, since, sortedNpcIds } from './state';
import type { ActorView } from './view';

/** How close the NPC must come before speaking (tiles). */
export const APPROACH_REACH = 2.5;
/** How long an NPC keeps walking toward a player who keeps moving off. */
export const APPROACH_GIVE_UP = TICKS_PER_GAME_HOUR;

/** The opening slot of each reason (builtin_ai.md 3.4 table). */
export const APPROACH_SLOTS: Record<ApproachReason, string> = {
  commission: 'topic.gen_trouble',
  confirm_rumor: 'unbelief.deny',
  thanks: 'react.helped',
  worship: 'react.belief_worship',
  warning: 'react.belief_hostile',
  acquaintance: 'greet.warm',
};

function weekOf(tick: number): number {
  return Math.floor(calendarAt(tick).dayIndex / 7);
}

/** A rumor about the player the NPC holds hot enough to want to check (3.4 row 2). */
function rumorAboutPlayer(v: ActorView) {
  const cog = v.ctx.world.slices.cognition;
  return holdingsByHeat(v.ctx, v.st.id).find(
    (h) =>
      (h.v.subject === 'player' || cog.rumors[h.rumor]?.subject === 'player') &&
      (cog.rumors[h.rumor]?.heat ?? 0) >= 0.4,
  );
}

/** The best reason the actor has to walk up to the player now, with its weight. */
export function approachReason(v: ActorView): ApproachReason | null {
  const b = v.brain;
  const rel = towardPlayer(v.ctx, v.st.id);
  const belief = beliefAboutPlayer(v.ctx, v.st.id);
  const tick = v.ctx.tick;
  const week = 7 * TICKS_PER_GAME_DAY;
  const thanks =
    (since(v.st, 'saved_by_player', tick) <= week &&
      !b.approach.spent.includes(`saved:${b.recent.saved_by_player}`)) ||
    (since(v.st, 'helped_by_player', tick) <= week &&
      !b.approach.spent.includes(`helped:${b.recent.helped_by_player}`));
  if (thanks) return 'thanks';
  if (belief?.state === 'worship') return 'worship';
  if (
    belief?.state === 'hostile' &&
    (hasTrait(v.p, 'brave') || v.card.tags.includes('official') || v.card.tags.includes('guard'))
  )
    return 'warning';
  if (belief && (belief.state === 'doubt' || belief.state === 'explaining') && rumorAboutPlayer(v))
    return 'confirm_rumor';
  if (
    v.p?.roles?.includes('giver') &&
    since(v.st, 'request', tick) <= 2 * TICKS_PER_GAME_DAY &&
    rel.trust >= 40
  )
    return 'commission';
  if (rel.like >= 40 && ensureNeeds(v.st.needs).social < 50) return 'acquaintance';
  return null;
}

/**
 * The player is in no state to be approached (builtin_ai.md 3.4): talking, trading, in a
 * scene, or fighting (the combat unit's fight window).
 */
export function playerBusy(ctx: SystemContext): boolean {
  const w = ctx.world;
  if (w.slices.dialogue?.session || w.slices.economy?.session || w.slices.scenes?.current)
    return true;
  const player = playerEntity(w);
  const unit = player ? w.slices.combat?.units[player.id] : undefined;
  return !!unit && unit.combatUntil > ctx.tick;
}

/** The initiative layer (builtin_ai.md 4.3 "[主动] guard(L1 或 L2) cooldown(1 日)"). */
export function chooseApproach(v: ActorView): BrainDecision | null {
  const { ctx, st } = v;
  const b = v.brain;
  if (st.tier > 2 || st.resident || st.talking) return null;
  const pending = b.approach.pending;
  if (pending) {
    // keep walking up while the approach is under way
    if (!pending.spoke && ctx.tick - pending.tick < APPROACH_GIVE_UP)
      return {
        act: 'chat',
        at: '@player',
        note: noteText('approach'),
        layer: 'initiative',
        action: 'approach',
      };
    return null;
  }
  if (b.approach.day === v.day || b.approach.stopWeek === weekOf(ctx.tick)) return null;
  if (playerBusy(ctx)) return null;
  const player = playerEntity(ctx.world);
  if (!player || player.hidden || player.mapId !== st.mapId) return null;
  if (v.segment.act === 'sleep' || v.hour >= 22 || v.hour < 7) return null;
  if (!playerWithin(ctx, st, 30)) return null;
  if (spokenThisHour(ctx) >= APPROACH_PER_HOUR) return null;
  const reason = approachReason(v);
  if (!reason) return null;
  b.approach.day = v.day;
  b.approach.pending = { tick: ctx.tick, reason, spoke: false };
  return {
    act: 'chat',
    at: '@player',
    note: noteText('approach'),
    layer: 'initiative',
    action: 'approach',
  };
}

/** Approaches that spoke on the player's map this game hour (the per-screen cap). */
function spokenThisHour(ctx: SystemContext): number {
  const a = ctx.world.slices.npc.approaches;
  return a && a.hour === Math.floor(ctx.tick / TICKS_PER_GAME_HOUR) ? a.count : 0;
}

/** The opener's fill values (the rumor the NPC heard, the deed it saw). */
function openerVars(ctx: SystemContext, st: NpcState): Record<string, TextParam | undefined> {
  const cog = ctx.world.slices.cognition;
  const h = holdingsByHeat(ctx, st.id).find(
    (x) => x.v.subject === 'player' || cog.rumors[x.rumor]?.subject === 'player',
  );
  const r = h ? cog.rumors[h.rumor] : undefined;
  return { rumor: h && r ? rumorText(ctx.content, h.v, r.topic) : undefined };
}

/**
 * Advance the approaches under way (every few ticks): speak the opener on arrival, count
 * a walk-away when the player does not answer in time, give up on a player who keeps
 * moving off. Returns the ids whose approach ended (their schedule resumes).
 */
export function stepApproaches(ctx: SystemContext): string[] {
  const slice = ctx.world.slices.npc;
  const done: string[] = [];
  const talkingTo = ctx.world.slices.dialogue?.session?.npcRef;
  for (const id of sortedNpcIds(slice.npcs)) {
    const st = slice.npcs[id] as NpcState;
    const pending = st.brain?.approach.pending;
    if (!pending || !st.brain) continue;
    const b = ensureBrain(st);
    if (st.gone) {
      b.approach.pending = null;
      done.push(id);
      continue;
    }
    if (talkingTo === id) {
      // the player answered: the walk-away count starts over
      b.approach.ignored = 0;
      b.approach.pending = null;
      continue;
    }
    if (!pending.spoke) {
      if (!playerBusy(ctx) && playerWithin(ctx, st, APPROACH_REACH)) {
        // three in an hour is enough for the player (builtin_ai 3.4): this one lets it be
        if (spokenThisHour(ctx) >= APPROACH_PER_HOUR) {
          b.approach.pending = null;
          done.push(id);
          continue;
        }
        slice.approaches = {
          hour: Math.floor(ctx.tick / TICKS_PER_GAME_HOUR),
          count: spokenThisHour(ctx) + 1,
        };
        pending.spoke = true;
        pending.tick = ctx.tick;
        const said =
          sayToPlayer(ctx, st, APPROACH_SLOTS[pending.reason], openerVars(ctx, st)) ||
          (pending.reason !== 'acquaintance' &&
            sayToPlayer(ctx, st, 'greet.neutral', openerVars(ctx, st)));
        if (pending.reason === 'thanks') {
          const key =
            since(st, 'saved_by_player', ctx.tick) <= 7 * TICKS_PER_GAME_DAY
              ? `saved:${b.recent.saved_by_player}`
              : `helped:${b.recent.helped_by_player}`;
          b.approach.spent = [...b.approach.spent.filter((s) => s !== key), key].slice(-6);
        }
        remember(ctx, id, 'approached', {}, { about: 'player' });
        if (said) trackPlayerTalk(ctx, st);
        ctx.emit('npc.approached', {
          npcId: id,
          entityId: npcEntityId(id),
          reason: pending.reason,
          mapId: st.mapId,
        });
      } else if (ctx.tick - pending.tick >= APPROACH_GIVE_UP) {
        b.approach.pending = null;
        done.push(id);
      }
      continue;
    }
    if (ctx.tick - pending.tick >= APPROACH_WAIT) {
      b.approach.ignored += 1;
      if (b.approach.ignored >= 2) {
        b.approach.stopWeek = weekOf(ctx.tick);
        b.approach.ignored = 0;
      }
      b.approach.pending = null;
      done.push(id);
    }
  }
  return done;
}
