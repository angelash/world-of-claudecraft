// The regional sediment account (goddess_gm.md 4.5; catalog_dungeons_bosses.md 1.2; PK-M1-50
// leftovers): every region keeps a sediment value on one scale with the dungeons' core
// pressure (clear 0 to 4, thin 5 to 29, settled 30 to 99, dense 100 to 299, deep 300 to 799,
// abyssal 800 up). The goddesses' interventions add to it (state.ts recordIntervention); the
// three dispositions of a dungeon or a nest move it: destroying lifts its region one grade
// for a season, then the lift falls back by three tenths each season; purifying takes three
// tenths of the dungeon's core pressure off the region; a nurtured place keeps its region
// a tenth lower each season. A region that rises a grade within one game week stirs its
// dungeons: their activity goes up 20 (through the dungeons system's own port).

import type { SystemContext } from '../../core/system';
import { calendarAt, TICKS_PER_GAME_DAY } from '../../core/time';
import { addActivity, readDungeons } from '../dungeons';
import { goddessSlice } from './state';
import type { RegionScar } from './types';

/** Lower bounds of the grades 1 to 5 (thin, settled, dense, deep, abyssal). */
export const GRADE_FLOORS = [5, 30, 100, 300, 800] as const;
/** A season in game days (time.ts: four seasons of 91 days). */
export const SEASON_DAYS = 91;
/** Share of a destroyed place's lift that falls back each season. */
export const SCAR_FADE = 0.3;
/** Share of a purified dungeon's core pressure taken off the region. */
export const PURIFY_SHARE = 0.3;
/** Share a nurtured place keeps its region lower each season. */
export const NURTURE_SHARE = 0.1;
/** Activity a weekly grade rise adds to the region's dungeons. */
export const RISE_ACTIVITY = 20;

/** The grade of a region's sediment value (0 clear to 5 abyssal). */
export function sedimentGrade(value: number): number {
  let g = 0;
  for (const f of GRADE_FLOORS) if (value >= f) g++;
  return g;
}

/** The value that lifts `value` exactly one grade (the next grade's floor). */
export function oneGradeUp(value: number): number {
  const g = sedimentGrade(value);
  const next = GRADE_FLOORS[g];
  return next === undefined ? 0 : next - value;
}

function seasonOf(tick: number): number {
  return Math.floor(calendarAt(tick).dayIndex / SEASON_DAYS);
}

/** Change a region's sediment (never below 0) and mirror it to sediment.<map>. */
export function addRegionSediment(ctx: SystemContext, mapId: string, delta: number): void {
  if (!mapId || delta === 0) return;
  const slice = goddessSlice(ctx.world);
  const next = Math.max(0, (slice.sediment[mapId] ?? 0) + delta);
  slice.sediment[mapId] = next;
  ctx.setFlag(`sediment.${mapId}`, Math.round(next * 100) / 100);
}

/** The region a dungeon or a nest sits in (its gate's map, or the nest's map). */
export function regionOf(ctx: SystemContext, id: string): string | undefined {
  const d = (ctx.content.dungeons ?? []).find((x) => x.id === id);
  if (d) return d.gate.mapId;
  return (ctx.content.nests ?? []).find((x) => x.id === id)?.mapId;
}

/** A dungeon or a nest was destroyed and caved in: its region rises a grade for a season. */
export function onCollapsed(ctx: SystemContext, id: string): void {
  const mapId = regionOf(ctx, id);
  if (!mapId) return;
  const slice = goddessSlice(ctx.world);
  const lift = oneGradeUp(slice.sediment[mapId] ?? 0);
  if (lift <= 0) return;
  addRegionSediment(ctx, mapId, lift);
  slice.scars ??= [];
  const scar: RegionScar = {
    mapId,
    lift,
    amount: lift,
    fadeFrom: ctx.tick + SEASON_DAYS * TICKS_PER_GAME_DAY,
    fadedSeason: -1,
  };
  slice.scars.push(scar);
}

/** A dungeon was purified: three tenths of its core pressure come off the region. */
export function onPurified(ctx: SystemContext, id: string): void {
  const mapId = regionOf(ctx, id);
  const st = readDungeons(ctx.world)?.instances[id];
  if (!mapId || !st) return;
  addRegionSediment(ctx, mapId, -PURIFY_SHARE * st.pressure);
}

/**
 * The season step: destroyed places' lifts fall back three tenths a season once their first
 * season is over, and each region with a nurtured place keeps a tenth lower.
 */
export function seasonStep(ctx: SystemContext): void {
  const slice = goddessSlice(ctx.world);
  const season = seasonOf(ctx.tick);
  for (const scar of slice.scars ?? []) {
    if (ctx.tick < scar.fadeFrom || scar.fadedSeason === season) continue;
    scar.fadedSeason = season;
    // three tenths of the lift fall back each season until it is gone
    const fall = Math.min(scar.amount, (scar.lift ?? scar.amount) * SCAR_FADE);
    scar.amount -= fall;
    addRegionSediment(ctx, scar.mapId, -fall);
  }
  if (slice.scars) slice.scars = slice.scars.filter((s) => s.amount > 1e-6);
  const dg = readDungeons(ctx.world);
  if (!dg) return;
  const seen = new Set<string>();
  const nurtured: string[] = [];
  for (const [id, st] of Object.entries(dg.instances))
    if (st.choice === 'nurture' && !st.collapsed && !st.purified) nurtured.push(id);
  for (const [id, st] of Object.entries(dg.nests))
    if (st.choice === 'nurture' && st.live && !st.collapsed && !st.purified) nurtured.push(id);
  for (const id of nurtured.sort()) {
    const mapId = regionOf(ctx, id);
    if (!mapId || seen.has(mapId)) continue;
    seen.add(mapId);
    const key = `nurture.${mapId}`;
    slice.seasonMarks ??= {};
    const marks = slice.seasonMarks;
    if (marks[key] === season) continue;
    marks[key] = season;
    addRegionSediment(ctx, mapId, -NURTURE_SHARE * (slice.sediment[mapId] ?? 0));
  }
}

/**
 * The weekly rise check (hourly): a region whose grade rose since the week began stirs its
 * dungeons once per grade gained.
 */
export function riseStep(ctx: SystemContext): void {
  const slice = goddessSlice(ctx.world);
  const week = Math.floor(calendarAt(ctx.tick).dayIndex / 7);
  let wg = slice.weekGrade;
  if (!wg || wg.week !== week) {
    // the new week starts from the grades the last one ended on, so a rise between the last
    // check and this one still counts (an unseen first hour would swallow it)
    wg = { week, grades: { ...(wg?.grades ?? {}) } };
    slice.weekGrade = wg;
    for (const mapId of Object.keys(slice.sediment)) {
      const g = sedimentGrade(slice.sediment[mapId] ?? 0);
      const was = wg.grades[mapId];
      // a grade that fell is the new baseline: rising back to it stirs again next week
      if (was === undefined || g < was) wg.grades[mapId] = g;
    }
  }
  for (const mapId of Object.keys(slice.sediment).sort()) {
    const g = sedimentGrade(slice.sediment[mapId] ?? 0);
    const was = wg.grades[mapId] ?? 0;
    if (g <= was) continue;
    wg.grades[mapId] = g;
    // once for every grade gained
    for (let k = was; k < g; k++) stir(ctx, mapId);
  }
}

/** Raise the activity of every live dungeon whose gate stands in the region. */
function stir(ctx: SystemContext, mapId: string): void {
  const dg = readDungeons(ctx.world);
  if (!dg) return;
  for (const def of ctx.content.dungeons ?? []) {
    if (def.gate.mapId !== mapId) continue;
    const st = dg.instances[def.id];
    if (st) addActivity(ctx, def, st, RISE_ACTIVITY);
  }
  ctx.emit('goddess.region_rise', { mapId });
}

export { seasonOf };
