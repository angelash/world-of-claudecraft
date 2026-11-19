// Ailments pack (PK-M1-51): the taint rules (data/ailments/config.json: the daily drift per
// sediment grade, the wear of patterned gear, the three sickness stages with their onset
// curves and auras, the self-heal, the player's crystallisation as blockage, the injuries),
// the sediment tracks that move by the act week (tracks.json) and the scripted cases of the
// story (cases.json). The validator holds progression_and_pacing.md 9 and 10: every stage
// and injury has its state aura, the stages climb, every variable a track keeps is
// registered and every condition parses.

import cases from '../../../data/ailments/cases.json';
import config from '../../../data/ailments/config.json';
import tracks from '../../../data/ailments/tracks.json';
import type { ContentMap } from '../../core/contracts';
import { defaultRegistry, NAME_MAX, NAME_RE } from '../../core/registry';
import { GRADES } from '../../systems/ailments/formulas';
import { CASE_PREFIX } from '../../systems/ailments/story';
import {
  type AilmentsConfig,
  CASE_STAGES,
  type CaseDef,
  INJURY_KINDS,
  PLAYER_INJURY_VALUES,
  SED_STAGES,
  type TrackDef,
  WEAR_GRADES,
} from '../../systems/ailments/types';
import type { ContentPack } from '../pack';
import { conditionProblems } from './quests';

const cfg = config as unknown as AilmentsConfig;
const trackRows = tracks as unknown as TrackDef[];
const caseRows = cases as unknown as CaseDef[];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function configProblems(c: AilmentsConfig | undefined, auraIds: Set<string>): string[] {
  if (!c) return ['ailmentsConfig: missing'];
  const out: string[] = [];
  const at = 'ailmentsConfig';
  if (!isNum(c.max) || c.max <= 0) out.push(`${at}: max must be above 0`);
  if (!Number.isInteger(c.checkHour) || c.checkHour < 0 || c.checkHour > 23)
    out.push(`${at}: checkHour must be an hour 0..23`);
  if (!Array.isArray(c.perGrade) || c.perGrade.length !== GRADES || !c.perGrade.every(isNum))
    out.push(`${at}: perGrade needs one number for each of the ${GRADES} grades`);
  for (const g of WEAR_GRADES) {
    if (!isNum(c.wear?.[g]) || c.wear[g] <= 0) out.push(`${at}: wear.${g} must be days above 0`);
  }
  const ids = (c.stages ?? []).map((s) => s.id);
  if (ids.join(',') !== SED_STAGES.slice(1).join(','))
    out.push(`${at}: stages must be ${SED_STAGES.slice(1).join(', ')} in that order`);
  let prev = 0;
  for (const s of c.stages ?? []) {
    if (!auraIds.has(s.aura)) out.push(`${at}: stage ${s.id} has unknown aura ${s.aura}`);
    if (!isNum(s.from) || s.from <= prev || s.from > c.max)
      out.push(`${at}: stage ${s.id} threshold must climb inside 1..max`);
    if (!isNum(s.per) || s.per <= 0) out.push(`${at}: stage ${s.id} per must be above 0`);
    if (!isNum(s.cap) || s.cap <= 0 || s.cap > 1)
      out.push(`${at}: stage ${s.id} cap must be a chance above 0`);
    prev = isNum(s.from) ? s.from : prev;
  }
  if (!isNum(c.rankFactor) || c.rankFactor <= 0 || c.rankFactor > 1)
    out.push(`${at}: rankFactor must be in (0, 1]`);
  if (!Array.isArray(c.frail?.tags) || !isNum(c.frail?.factor) || c.frail.factor <= 0)
    out.push(`${at}: frail needs tags and a factor above 0`);
  if (!ids.includes(c.selfHeal?.stage) || !isNum(c.selfHeal?.below) || !isNum(c.selfHeal?.days))
    out.push(`${at}: selfHeal needs a stage, a taint line and days`);
  const pc = c.playerCrystal;
  if (!pc || !ids.includes(pc.bodyStage) || (pc.bodyStage as string) === 'crystal')
    out.push(`${at}: playerCrystal.bodyStage must be a stage below crystal`);
  if (!isNum(pc?.blockage) || !isNum(pc?.daily) || pc.blockage < 0 || pc.daily < 0)
    out.push(`${at}: playerCrystal blockage and daily must be 0 or more`);
  if (!Number.isInteger(c.crystalDays) || c.crystalDays < 1)
    out.push(`${at}: crystalDays must be whole days above 0`);
  if (!isNum(c.relapseChance) || c.relapseChance < 0 || c.relapseChance > 1)
    out.push(`${at}: relapseChance must be a chance 0..1`);
  if (!isNum(c.earlyTaint) || c.earlyTaint < 0) out.push(`${at}: earlyTaint must be 0 or more`);
  if (
    c.portionTaint !== undefined &&
    !(
      Array.isArray(c.portionTaint) &&
      c.portionTaint.length === 3 &&
      c.portionTaint.every((v) => isNum(v) && v >= 0)
    )
  )
    out.push(`${at}: portionTaint needs the taint of a light, mid and heavy portion`);
  const kinds = (c.injuries ?? []).map((i) => i.id);
  if ([...kinds].sort().join(',') !== [...INJURY_KINDS].sort().join(','))
    out.push(`${at}: injuries must be exactly ${INJURY_KINDS.join(', ')}`);
  for (const i of c.injuries ?? []) {
    if (!auraIds.has(i.aura)) out.push(`${at}: injury ${i.id} has unknown aura ${i.aura}`);
    if (!isNum(i.days) || i.days < 0) out.push(`${at}: injury ${i.id} days must be 0 or more`);
    if (i.player !== undefined && !PLAYER_INJURY_VALUES.includes(i.player))
      out.push(`${at}: injury ${i.id} player value ${i.player} is not a player.injury value`);
  }
  return out;
}

function trackProblems(rows: readonly TrackDef[]): string[] {
  const out: string[] = [];
  const registry = defaultRegistry();
  const seen = new Set<string>();
  for (const t of rows) {
    const at = `sedimentTracks ${t.id}`;
    if (seen.has(t.id)) out.push(`${at}: duplicate id`);
    seen.add(t.id);
    if (!registry.isRegistered(t.var)) out.push(`${at}: variable ${t.var} is not registered`);
    out.push(...conditionProblems(t.when, at));
    if (!t.when) out.push(`${at}: needs a when`);
    for (const k of ['start', 'weekly'] as const)
      if (!isNum(t[k])) out.push(`${at}: ${k} must be a number`);
    const lo = t.min ?? 0;
    const hi = t.max ?? 100;
    if (!(lo < hi)) out.push(`${at}: min must be below max`);
    if (isNum(t.start) && (t.start < lo || t.start > hi)) out.push(`${at}: start out of range`);
    for (const [i, r] of (t.rules ?? []).entries()) {
      out.push(...conditionProblems(r.when, `${at} rule ${i}`));
      if (!r.when || !isNum(r.weekly)) out.push(`${at} rule ${i}: needs when and weekly`);
    }
  }
  return out;
}

function caseProblems(rows: readonly CaseDef[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of rows) {
    const at = `sedCases ${c.id}`;
    if (seen.has(c.id)) out.push(`${at}: duplicate id`);
    seen.add(c.id);
    const name = `${CASE_PREFIX}${c.id}`;
    if (!NAME_RE.test(name) || name.length > NAME_MAX)
      out.push(`${at}: ${name} is not a valid variable name`);
    if (!Array.isArray(c.steps) || c.steps.length === 0) out.push(`${at}: needs steps`);
    let prev = 0;
    for (const [i, s] of (c.steps ?? []).entries()) {
      const n = CASE_STAGES.indexOf(s.stage);
      if (n <= 0 || (s.stage as string) === 'cured')
        out.push(`${at} step ${i}: bad stage ${s.stage}`);
      if (n <= prev) out.push(`${at} step ${i}: steps must climb`);
      prev = Math.max(prev, n);
      out.push(...conditionProblems(s.when, `${at} step ${i}`));
    }
    if (c.cure !== undefined && !c.cure?.when) out.push(`${at}: cure needs a when`);
    out.push(...conditionProblems(c.cure?.when, `${at} cure`));
  }
  return out;
}

export function validateAilments(content: ContentMap): string[] {
  const auraIds = new Set((content.auras ?? []).map((a) => a.id));
  return [
    ...configProblems(content.ailmentsConfig, auraIds),
    ...trackProblems(content.sedimentTracks ?? []),
    ...caseProblems(content.sedCases ?? []),
  ];
}

export const pack: ContentPack = {
  id: 'ailments',
  tables: {
    ailmentsConfig: cfg,
    sedimentTracks: trackRows,
    sedCases: caseRows,
  },
  validate: validateAilments,
};
