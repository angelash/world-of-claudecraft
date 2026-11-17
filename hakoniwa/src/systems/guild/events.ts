// The dynamic event kernel (PK-M1-47; quests_and_events.md 2.2, 2.4 step 4 and 3.8;
// catalog_quests_acts1_3.md 3 and 5.7): templates `ev_` trigger on a condition, a daily
// chance through the named stream `guild.events`, a weekday or once; a tide or a disaster
// announces itself days ahead (the omen), a search needs its precursor first; the arbiter
// holds an event that would break the density of catalog 3.2 (at most two severe events
// running in one settlement, seven days between their starts; fourteen days between two
// tides in one region; one comedy bit per settlement and day) or that must yield to a
// dispute's window, and drops one held too long. Landing applies the template's effects and
// modifiers, seeds its rumor through the cognition engine and its comedy gate, posts its
// emergency commissions, and marks it on the flags `ev.<id>` and `ev.<id>.count`. Events of
// the narrative director are menu items of the director instead (the guild pack offers them
// in `directorMenu`): the director chooses and narrates, the kernel settles the rest when it
// hears `director.move`. Events never give quest experience (catalog 3.2).

import { contentRef, contentText } from '../../core/content_key';
import type { SystemContext } from '../../core/system';
import { calendarAt, TICKS_PER_GAME_DAY } from '../../core/time';
import { comedyGate } from '../cognition/comedy';
import { addHolding, seedRumor, witnessVersion } from '../cognition/rumor';
import { currentActId } from '../quests/act_order';
import { actIndex } from '../quests/conditions';
import { applyEffects, conditionHolds } from '../quests/effects';
import { mapById, playerEntity } from '../world';
import { applyModifiers, guildConfig, postEmergency, repriceUrgent, today } from './board';
import { guildSlice } from './slice';
import {
  type DynamicEventDef,
  type EventRules,
  OMEN_CATEGORIES,
  type PendingEvent,
  SEVERE,
} from './types';

declare module '../../core/contracts' {
  interface EventMap {
    /** an event announced itself; it lands on `landDay` (catalog 3.2 预兆) */
    'dynamic_event.omen': { eventId: string; mapId: string; landDay: number };
    'dynamic_event.landed': {
      eventId: string;
      mapId: string;
      severity: DynamicEventDef['severity'];
      category: DynamicEventDef['category'];
      via: 'kernel' | 'director';
    };
    'dynamic_event.ended': { eventId: string; mapId: string };
    /** a triggered event waited past the defer limit and never landed */
    'dynamic_event.dropped': { eventId: string; mapId: string };
  }
}

export function eventDef(
  content: { dynamicEvents?: DynamicEventDef[] },
  id: string,
): DynamicEventDef | undefined {
  return (content.dynamicEvents ?? []).find((e) => e.id === id);
}

/** The settlement an event's density counts in: its first map ('' when it lands anywhere). */
export function anchorOf(def: DynamicEventDef): string {
  return def.maps[0] ?? '';
}

/** The region of a map for the tide cooldown (the map's region, else the map itself). */
export function regionOf(ctx: SystemContext, mapId: string): string {
  return (mapId && mapById(ctx.content, mapId)?.region) || mapId;
}

function rulesOf(ctx: SystemContext): EventRules | null {
  return guildConfig(ctx)?.events ?? null;
}

function busy(ctx: SystemContext, id: string): boolean {
  const e = guildSlice(ctx.world).events;
  return e.pending.some((p) => p.template === id) || e.active.some((a) => a.template === id);
}

/** Whether a precursor event landed (within its window). */
function precursorMet(ctx: SystemContext, def: DynamicEventDef, day: number): boolean {
  const pre = def.precursor;
  if (!pre) return true;
  const last = guildSlice(ctx.world).events.last[pre.event];
  if (last === undefined) return false;
  return pre.withinDays === undefined || day - last <= pre.withinDays;
}

/**
 * The severe and tide slots taken around a settlement: the landed ones (their last start and
 * the active ones) and the announced ones still on their way (an omen reserves its slot, so
 * an announced event always arrives).
 */
function slotsOf(ctx: SystemContext, map: string, region: string, self?: PendingEvent) {
  const ev = guildSlice(ctx.world).events;
  const severeStarts: number[] = [];
  const tideStarts: number[] = [];
  let severeRunning = 0;
  const lastSevere = ev.severe[map];
  if (lastSevere !== undefined) severeStarts.push(lastSevere);
  const lastTide = ev.tide[region];
  if (lastTide !== undefined) tideStarts.push(lastTide);
  for (const a of ev.active) {
    const d = eventDef(ctx.content, a.template);
    if (a.mapId === map && d && SEVERE.includes(d.severity)) severeRunning++;
  }
  for (const p of ev.pending) {
    if (p === self || !p.announced) continue;
    const d = eventDef(ctx.content, p.template);
    if (!d) continue;
    if (p.mapId === map && SEVERE.includes(d.severity)) {
      severeRunning++;
      severeStarts.push(p.landDay);
    }
    if (d.category === 'tide' && regionOf(ctx, p.mapId) === region) tideStarts.push(p.landDay);
  }
  return { severeRunning, severeStarts, tideStarts };
}

export type HoldReason = 'yield' | 'severe_cap' | 'severe_gap' | 'tide_cooldown';

/**
 * Why an event may not start on `startDay`, or null: its yield condition (a dispute node's
 * window), the severe density of its settlement (at most `severeCap` running, starts
 * `severeGapDays` apart), the tide cooldown of its region. Announced events count as taken
 * slots. The comedy gate is asked last, by landing.
 */
export function heldBy(
  ctx: SystemContext,
  def: DynamicEventDef,
  rules: EventRules,
  startDay: number,
  self?: PendingEvent,
): HoldReason | null {
  if (def.yieldWhile && conditionHolds(ctx, def.yieldWhile)) return 'yield';
  const map = anchorOf(def);
  const slots = slotsOf(ctx, map, regionOf(ctx, map), self);
  if (SEVERE.includes(def.severity)) {
    if (slots.severeRunning >= rules.severeCap) return 'severe_cap';
    if (slots.severeStarts.some((x) => Math.abs(startDay - x) < rules.severeGapDays))
      return 'severe_gap';
  }
  if (
    def.category === 'tide' &&
    slots.tideStarts.some((x) => Math.abs(startDay - x) < rules.tideCooldownDays)
  )
    return 'tide_cooldown';
  return null;
}

/** Seed the event's rumor through the cognition engine (when the cognition system runs). */
function plantRumor(ctx: SystemContext, def: DynamicEventDef, mapId: string): void {
  const slice = ctx.world.slices.cognition;
  const r = def.rumor;
  if (!slice || !r) return;
  const rumor = seedRumor(ctx, {
    anchor: `event:${def.id}:${ctx.tick}`,
    topic: r.topic,
    subject: 'player',
    mapId,
    place: contentRef('dynamic_events', def.id, 'rumor.place'),
    apparent: 0,
    count: 1,
    details: r.details.map((_, i) => contentRef('dynamic_events', def.id, 'rumor.details', i)),
    famous: [],
    tier: r.tier ?? 0,
  });
  for (const teller of r.tellers) {
    addHolding(slice, teller, {
      rumor: rumor.id,
      v: witnessVersion(rumor, null),
      cred: 1,
      from: 'seen',
      origin: teller,
      hops: 0,
      tick: ctx.tick,
      believed: true,
      told: 0,
    });
  }
}

/**
 * Land an event: its effects, modifiers, rumor, emergency commissions and urgent pay, the
 * flags, the log, and (unless the director spoke for it) its narration on its maps.
 */
export function land(
  ctx: SystemContext,
  def: DynamicEventDef,
  via: 'kernel' | 'director',
  omenDay?: number,
): void {
  const rules = rulesOf(ctx);
  const s = guildSlice(ctx.world);
  const ev = s.events;
  const day = today(ctx);
  const mapId = anchorOf(def);
  const count = (ev.count[def.id] ?? 0) + 1;
  ev.count[def.id] = count;
  ev.last[def.id] = day;
  if (SEVERE.includes(def.severity)) ev.severe[mapId] = day;
  if (def.category === 'tide') ev.tide[regionOf(ctx, mapId)] = day;
  applyEffects(ctx, def.effects);
  applyModifiers(ctx, def.id, def.modifiers, contentRef('dynamic_events', def.id, 'title'));
  plantRumor(ctx, def, mapId);
  const days = Math.max(0, def.days ?? 0);
  // an announced event posted its emergency commissions with its omen
  if (omenDay === undefined)
    for (const t of def.hooks?.post ?? [])
      postEmergency(ctx, t, def.maps, day + Math.max(0, days - 1));
  if (days > 0) ev.active.push({ template: def.id, mapId, startDay: day, untilDay: day + days });
  if (def.hooks?.urgent?.length) repriceUrgent(ctx);
  ctx.setFlag(`ev.${def.id}`, days > 0 ? 'active' : 'ended');
  ctx.setFlag(`ev.${def.id}.count`, count);
  const entry: (typeof ev.log)[number] = {
    template: def.id,
    mapId,
    day,
    tick: ctx.tick,
    severity: def.severity,
    category: def.category,
    via,
  };
  if (omenDay !== undefined) entry.omenDay = omenDay;
  if (def.comedy) entry.comedy = def.comedy;
  ev.log.push(entry);
  const keep = rules?.logKeep ?? 200;
  if (ev.log.length > keep) ev.log.splice(0, ev.log.length - keep);
  ctx.emit('dynamic_event.landed', {
    eventId: def.id,
    mapId,
    severity: def.severity,
    category: def.category,
    via,
  });
  if (via === 'kernel' && def.narration) {
    const here = playerEntity(ctx.world)?.mapId;
    if (def.maps.length === 0 || (here && def.maps.includes(here))) {
      ctx.emit('dialogue.line', {
        speakerId: 'narrator',
        speakerName: '',
        text: contentText('dynamic_events', def, def.narration, 'narration'),
        kind: 'narrate',
      });
    }
  }
}

/** Try to land a triggered or deferred event now: the reason it is held, or null once landed. */
function tryLand(
  ctx: SystemContext,
  def: DynamicEventDef,
  rules: EventRules,
  day: number,
  self?: PendingEvent,
): HoldReason | 'comedy' | null {
  const held = heldBy(ctx, def, rules, day, self);
  if (held) return held;
  // the comedy gate counts the bit when it lets it through, so it is asked last
  if (def.comedy && ctx.world.slices.cognition) {
    if (comedyGate(ctx, anchorOf(def), def.comedy) === 'none') return 'comedy';
  }
  land(ctx, def, 'kernel');
  return null;
}

/**
 * Whether a template may trigger now: its acts, once, cooldown (and never twice in one game
 * day), weekday, the goddess's tide rule, its precursor and its condition.
 */
function mayTrigger(
  ctx: SystemContext,
  def: DynamicEventDef,
  rules: EventRules,
  day: number,
): boolean {
  const s = guildSlice(ctx.world).events;
  if (def.director) return false;
  const act = actIndex(currentActId(ctx));
  if (!def.acts.includes(act)) return false;
  if (def.once && (s.count[def.id] ?? 0) > 0) return false;
  if (busy(ctx, def.id)) return false;
  const last = s.last[def.id];
  if (last === day) return false;
  if (def.cooldownDays && last !== undefined && day - last < def.cooldownDays) return false;
  if (def.weekday !== undefined && calendarAt(ctx.tick).weekday !== def.weekday) return false;
  if (def.source === 'goddess' && def.category === 'tide' && act < rules.goddessTideFromAct)
    return false;
  if (!precursorMet(ctx, def, day)) return false;
  return conditionHolds(ctx, def.when);
}

/**
 * Trigger an event. One with an omen is announced only when its slot is free on the day it
 * will land; the slot is then reserved, its emergency commissions go up at once, and it
 * arrives `omen.days` whole game days later. One without an omen lands now or waits for its
 * slot.
 */
function trigger(ctx: SystemContext, def: DynamicEventDef, rules: EventRules, day: number): void {
  const ev = guildSlice(ctx.world).events;
  const mapId = anchorOf(def);
  const omen = def.omen && def.omen.days > 0 ? def.omen : null;
  if (omen) {
    const landDay = day + omen.days;
    if (heldBy(ctx, def, rules, landDay)) return;
    const landTick = ctx.tick + omen.days * TICKS_PER_GAME_DAY;
    ev.pending.push({ template: def.id, mapId, omenDay: day, landDay, landTick, announced: true });
    applyEffects(ctx, omen.effects);
    for (const t of def.hooks?.post ?? []) postEmergency(ctx, t, def.maps, landDay);
    ctx.setFlag(`ev.${def.id}`, 'omen');
    ctx.emit('dynamic_event.omen', { eventId: def.id, mapId, landDay });
    return;
  }
  if (tryLand(ctx, def, rules, day))
    ev.pending.push({
      template: def.id,
      mapId,
      omenDay: day,
      landDay: day,
      landTick: ctx.tick,
      announced: false,
    });
}

/** End the active events whose days ran out: their default settlement applies. */
function endEvents(ctx: SystemContext, day: number): void {
  const ev = guildSlice(ctx.world).events;
  let urgent = false;
  for (const a of [...ev.active]) {
    if (day < a.untilDay) continue;
    ev.active.splice(ev.active.indexOf(a), 1);
    const def = eventDef(ctx.content, a.template);
    applyEffects(ctx, def?.end);
    if (def?.hooks?.urgent?.length) urgent = true;
    ctx.setFlag(`ev.${a.template}`, 'ended');
    ctx.emit('dynamic_event.ended', { eventId: a.template, mapId: a.mapId });
  }
  // urgency lasts while its event runs (catalog 5.6 "期间")
  if (urgent) repriceUrgent(ctx);
}

/**
 * Land the pending events whose time has come: an announced one arrives (its slot was
 * reserved), a deferred one when the arbiter lets it through. One held by density longer
 * than the defer limit is dropped; one yielding to a dispute's window waits it out.
 */
function landPending(ctx: SystemContext, rules: EventRules, day: number): void {
  const ev = guildSlice(ctx.world).events;
  for (const p of [...ev.pending]) {
    if (ctx.tick < p.landTick) continue;
    const def = eventDef(ctx.content, p.template);
    const drop = () => ev.pending.splice(ev.pending.indexOf(p), 1);
    if (!def) {
      drop();
      continue;
    }
    if (p.announced) {
      drop();
      land(ctx, def, 'kernel', p.omenDay);
      continue;
    }
    const held = tryLand(ctx, def, rules, day, p);
    if (!held) {
      drop();
      continue;
    }
    if (held !== 'yield' && day - p.landDay >= rules.deferDays) {
      drop();
      ev.dropped[def.id] = (ev.dropped[def.id] ?? 0) + 1;
      ctx.emit('dynamic_event.dropped', { eventId: def.id, mapId: p.mapId });
    }
  }
}

/**
 * The event step (hourly; quests_and_events.md 2.4 step 4): end what ran out, land what is
 * due, then check the triggers. Chance rolls happen once per game day, in content order, on
 * the stream `guild.events`.
 */
export function settleEvents(ctx: SystemContext): void {
  const rules = rulesOf(ctx);
  if (!rules) return;
  const ev = guildSlice(ctx.world).events;
  const day = today(ctx);
  endEvents(ctx, day);
  landPending(ctx, rules, day);
  const roll = ev.rolled !== day;
  ev.rolled = day;
  const rng = ctx.rng('guild.events');
  for (const def of ctx.content.dynamicEvents ?? []) {
    // chance events roll once a game day; the others are checked every hour
    if (def.chance !== undefined && !roll) continue;
    if (!mayTrigger(ctx, def, rules, day)) continue;
    if (def.chance !== undefined && !rng.chance(def.chance)) continue;
    trigger(ctx, def, rules, day);
  }
}

/** The director chose one of the events it was offered: settle it (it already narrated). */
export function directorLanded(ctx: SystemContext, itemId: string): void {
  const def = eventDef(ctx.content, itemId);
  if (!def?.director) return;
  land(ctx, def, 'director');
}

/** Whether an event's category must announce itself (tides and disasters). */
export function needsOmen(def: DynamicEventDef): boolean {
  return OMEN_CATEGORIES.includes(def.category);
}
