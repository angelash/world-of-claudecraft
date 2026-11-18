// Persona tables of the goddess brain (builtin_ai.md 8.2; catalog_goddess_interventions.md
// 5.0 and the per-goddess act tables of 5.1 to 5.6): KPI weights, the ten persona traits,
// her interest in the player per act, the action weights W and persona multipliers, and per
// act the menu, the spending budget, the end reserve and the schemes she may adopt. The
// tables are data (data/goddess/brain/personas.json and config.json); this module only reads
// them. Pure.

import type { ActionTag, DivineActionDef, GoddessDef } from '../types';

/** The ten persona dimensions of builtin_ai 8.2. */
export const PERSONA_TRAITS = [
  'order',
  'war',
  'greed',
  'mercy',
  'curiosity',
  'caution',
  'stealth',
  'face',
  'suspicion',
  'denial',
] as const;
export type PersonaTrait = (typeof PERSONA_TRAITS)[number];

/** One act of a persona (catalog 5.1 to 5.6, one table row). */
export interface PersonaAct {
  /** actions she plans with at dawn in this act */
  menu: string[];
  /** planned spending of the act (a hard limit; spending ahead of the act's share is penalized) */
  budget: number;
  /** power she keeps at the act's end (a hard limit) */
  reserve: number;
  /** schemes she may adopt in this act (div_plan_*) */
  schemes?: string[];
}

/** Janu's night round (catalog 2.7 and 5.6): one dream per so many doors opened. */
export interface PersonaNight {
  action: string;
  /** doors opened between two dreams, per act (absent: the act has no night round) */
  doorsPerDream: Record<string, number>;
}

/** A goddess persona table (builtin_ai 8.2, 18 GoddessPersona). */
export interface GoddessPersona {
  id: string;
  /** KPI weights, summing to 1 (pantheon.md scoring) */
  kpi: Record<string, number>;
  traits: Record<PersonaTrait, number>;
  /** interest in the player per act number 0 (prologue, written: null) to 5 */
  interest: (number | null)[];
  /** W per action id (catalog 5.0); a menu action without one weighs config.defaultWeight */
  weights: Record<string, number>;
  /** persona multipliers by action tag (catalog 5.0), their product held to 0.5 to 1.5 */
  multipliers?: Partial<Record<ActionTag, number>>;
  /** false: she does not plan at dawn (Janu, catalog 5.6) */
  dawn?: boolean;
  night?: PersonaNight;
  /** act id to the act's table; an act without one uses her card's menu */
  acts: Record<string, PersonaAct>;
}

/** The brain's constants (data/goddess/brain/config.json). */
export interface GoddessBrainConfig {
  /** tag to trait affinity, -1 to 1 (builtin_ai 8.3 goddess_affinity) */
  affinity: Partial<Record<ActionTag, Partial<Record<PersonaTrait, number>>>>;
  /** the share of the catalog's W that enters the 8.3 score */
  weightScale: number;
  defaultWeight: number;
  /** the do-nothing baseline: no action scoring below it is taken */
  baseline: number;
  maxPerDay: number;
  maxSchemes: number;
  /** a scheme's adoption score must exceed this (builtin_ai 8.4) */
  adoptAt: number;
  schemeRetries: number;
  /** candidate maps per action (builtin_ai 8.3: at most eight) */
  candidateMaps: number;
  /** act lengths in game days (progression 13.6) */
  actDays: Record<string, number>;
  /** power density per map over `days` days (catalog 1.3) */
  density: { region: number; playerRegion: number; days: number };
  /** a notice is answered within this many hours (the +2 response term) */
  noticeHours: number;
}

export interface BrainContent {
  goddessPersonas?: GoddessPersona[];
  goddessBrain?: GoddessBrainConfig[];
}

/** Built-in defaults when the content carries no config table (a trimmed test content). */
export const DEFAULT_BRAIN_CONFIG: GoddessBrainConfig = {
  affinity: {},
  weightScale: 0.5,
  defaultWeight: 2,
  baseline: 4,
  maxPerDay: 3,
  maxSchemes: 2,
  adoptAt: 6,
  schemeRetries: 2,
  candidateMaps: 8,
  actDays: {},
  density: { region: 1200, playerRegion: 600, days: 7 },
  noticeHours: 24,
};

export function brainConfig(content: BrainContent): GoddessBrainConfig {
  return content.goddessBrain?.[0] ?? DEFAULT_BRAIN_CONFIG;
}

export function personaOf(content: BrainContent, id: string): GoddessPersona | undefined {
  return content.goddessPersonas?.find((p) => p.id === id);
}

/** Her interest in the player in an act (0 when unknown or written). */
export function interestIn(p: GoddessPersona | undefined, actNo: number): number {
  const v = p?.interest[actNo];
  return typeof v === 'number' ? v : 0;
}

/** The act table of a persona (undefined: the act falls back to her card's menu). */
export function personaAct(p: GoddessPersona | undefined, act: string): PersonaAct | undefined {
  return p?.acts[act];
}

/** The actions she plans with at dawn in an act: the act table's menu, else her card's. */
export function dawnMenu(def: GoddessDef, p: GoddessPersona | undefined, act: string): string[] {
  return personaAct(p, act)?.menu ?? def.menu;
}

/**
 * Whether an action is on her menu in an act: her card's menu or the act table's (the act
 * tables add the catalog's new actions without touching the card).
 */
export function onMenu(
  def: GoddessDef,
  p: GoddessPersona | undefined,
  act: string,
  action: string,
): boolean {
  return def.menu.includes(action) || (personaAct(p, act)?.menu.includes(action) ?? false);
}

/** W of an action for her (catalog 5.0): the persona table, the card's weights, the default. */
export function weightOf(
  def: GoddessDef,
  p: GoddessPersona | undefined,
  action: string,
  cfg: GoddessBrainConfig,
): number {
  return p?.weights[action] ?? def.weights[action] ?? cfg.defaultWeight;
}

/** Affinity A(a, t) of an action with a trait: the sum over its tags, held to -1..1. */
export function affinityOf(
  a: Pick<DivineActionDef, 'tags'>,
  trait: PersonaTrait,
  cfg: GoddessBrainConfig,
): number {
  let sum = 0;
  for (const tag of a.tags ?? []) sum += cfg.affinity[tag]?.[trait] ?? 0;
  return Math.max(-1, Math.min(1, sum));
}

/** Σ_t trait_t × A(a, t) (builtin_ai 8.3 persona affinity, before its factor 3). */
export function personaAffinity(
  p: GoddessPersona | undefined,
  a: Pick<DivineActionDef, 'tags'>,
  cfg: GoddessBrainConfig,
): number {
  if (!p) return 0;
  let sum = 0;
  for (const t of PERSONA_TRAITS) sum += (p.traits[t] ?? 0) * affinityOf(a, t, cfg);
  return sum;
}

/** The persona multiplier M(a) (catalog 5.0): the product over the action's tags, 0.5..1.5. */
export function personaMultiplier(
  p: GoddessPersona | undefined,
  tags: readonly ActionTag[],
): number {
  let m = 1;
  for (const t of tags) m *= p?.multipliers?.[t] ?? 1;
  return Math.max(0.5, Math.min(1.5, m));
}

/** Σ_k w_k × ΔK_k for an action's KPI estimate (before the map scale). */
export function kpiValue(p: GoddessPersona | undefined, a: Pick<DivineActionDef, 'kpi'>): number {
  if (!p || !a.kpi) return 0;
  let sum = 0;
  for (const [k, v] of Object.entries(a.kpi)) sum += (p.kpi[k] ?? 0) * v;
  return sum;
}

/** A persona trait value (0 when the persona is missing). */
export function trait(p: GoddessPersona | undefined, t: PersonaTrait): number {
  return p?.traits[t] ?? 0;
}

/** Load-time problems of the persona tables against the cards and the action menu. */
export function personaProblems(content: {
  goddesses: readonly GoddessDef[];
  divineActions: readonly DivineActionDef[];
  goddessPersonas?: readonly GoddessPersona[];
  goddessSchemes?: readonly { id: string; goddess: string }[];
}): string[] {
  const out: string[] = [];
  const actions = new Set(content.divineActions.map((a) => a.id));
  const schemes = new Map((content.goddessSchemes ?? []).map((s) => [s.id, s.goddess]));
  for (const p of content.goddessPersonas ?? []) {
    const at = `persona ${p.id}`;
    if (!content.goddesses.some((g) => g.id === p.id)) out.push(`${at}: no goddess card`);
    const kpiSum = Object.values(p.kpi).reduce((a, b) => a + b, 0);
    if (Math.abs(kpiSum - 1) > 0.001) out.push(`${at}: KPI weights sum to ${kpiSum}, not 1`);
    for (const t of PERSONA_TRAITS) {
      const v = p.traits[t];
      if (typeof v !== 'number' || v < 0 || v > 1) out.push(`${at}: trait ${t} must be 0 to 1`);
    }
    if (p.interest.length !== 6) out.push(`${at}: interest lists acts 0 to 5`);
    for (const a of Object.keys(p.weights))
      if (!actions.has(a)) out.push(`${at}: weight for unknown action ${a}`);
    for (const [act, row] of Object.entries(p.acts)) {
      for (const a of row.menu)
        if (!actions.has(a)) out.push(`${at} ${act}: unknown action ${a} on the menu`);
      if (!(row.budget >= 0) || !(row.reserve >= 0))
        out.push(`${at} ${act}: budget and reserve are numbers`);
      for (const s of row.schemes ?? []) {
        const owner = schemes.get(s);
        if (owner === undefined) out.push(`${at} ${act}: unknown scheme ${s}`);
        else if (owner !== p.id) out.push(`${at} ${act}: scheme ${s} belongs to ${owner}`);
      }
    }
    if (p.night && !actions.has(p.night.action))
      out.push(`${at}: night action ${p.night.action} is unknown`);
  }
  return out;
}
