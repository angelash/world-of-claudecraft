// Implements the models of `ui_win_craft` (ux_and_onboarding.md 6.3.3) and `ui_win_gather`
// (6.3.4). Craft: the livelihoods learned (skill, cap, tier), the known recipes grouped by
// family with materials had against needed (short ones flagged), the station tier, the
// masterwork chance, and the skill-up band as words plus a bar (never colour alone, 18.2);
// a batch of 1 to `maxRuns`. Gather: each node in reach with its kind, node tier against your
// skill tier, tool tier, taint band, yield and refresh, and why a gather would be refused.
// Every refusal comes from the system's own code (the window never promises what a command
// would refuse). Livelihood names are the catalog's (catalog_gathering_crafting.md 1) through
// the repo's existing `ui.common.feature.craft_*` names where one exists; the taint band uses
// the mortal word until `term.dian_known` (D-030). The masterwork chance is shown only where a
// station of the recipe's tier is in reach (away from one the chance is not a fact). Fishing is
// M2 and has no part here. Pure; Node-tested.

import { t, tOr } from '../../../shared_ui/i18n';
import type { CraftRefusal, GatherRefusal } from '../../../systems/crafting';
import type { CraftingView } from '../../../systems/crafting/view';
import type { CraftRecipeData, GatherNodeData } from '../../view/adapters_field';

/** The skill-up bands of 6.3.3 by the four-state gain factor. */
export type SkillUpBand = 'always' | 'maybe' | 'rarely' | 'never';

export function skillUpBand(gain: number): SkillUpBand {
  if (gain >= 1) return 'always';
  if (gain >= 0.5) return 'maybe';
  if (gain > 0) return 'rarely';
  return 'never';
}

/** Filled segments of the four-step skill-up bar (the shape, not the colour, carries it). */
export const SKILL_UP_STEPS: Readonly<Record<SkillUpBand, number>> = {
  always: 3,
  maybe: 2,
  rarely: 1,
  never: 0,
};

export interface LivelihoodRow {
  profession: string;
  name: string;
  /** skill against cap */
  skill: string;
  /** "T2" */
  tier: string;
  /** fill 0 to 100 of the cap */
  pct: number;
}

export interface MaterialRow {
  itemId: string;
  name: string;
  /** "3 / 2" had against needed */
  count: string;
  short: boolean;
}

export interface RecipeView {
  id: string;
  name: string;
  family: string;
  materials: MaterialRow[];
  /** the station tier and type */
  station: string;
  /** the masterwork chance at the station in reach; '' away from one, for refine and enchant */
  masterwork: string;
  skillUp: { band: SkillUpBand; label: string; steps: number };
  canCraft: boolean;
  /** the system's refusal in words, '' when it can */
  reason: string;
}

export interface CraftModel {
  livelihoods: LivelihoodRow[];
  /** recipes by family, families in first-seen order */
  families: { family: string; recipes: RecipeView[] }[];
  maxRuns: number;
  /** nothing learned yet: the window shows the act 1 empty sentence */
  empty: boolean;
  /** the drunk layers when drunk, else '' */
  drunk: string;
}

/** A livelihood's catalog name (catalog_gathering_crafting.md 1, Veindelving and so on). */
export function professionName(p: string): string {
  return tOr(`ui.win.craft.profession.${p}`, p);
}

export function craftRefusalText(code: CraftRefusal | undefined): string {
  return code ? t(`ui.win.craft.refuse.${code}`) : '';
}

export function gatherRefusalText(code: GatherRefusal | undefined): string {
  return code ? t(`ui.win.gather.refuse.${code}`) : '';
}

export interface CraftModelInput {
  livelihoods: CraftingView;
  recipes: readonly CraftRecipeData[];
  maxRuns: number;
  itemName: (id: string) => string;
  recipeName: (id: string, fallback: string) => string;
}

export function craftModel(i: CraftModelInput): CraftModel {
  const livelihoods = i.livelihoods.skills.map((s) => ({
    profession: s.profession,
    name: professionName(s.profession),
    skill: t('ui.win.craft.skill', { n: s.skill, cap: s.cap }),
    tier: t('ui.win.craft.tier', { n: Math.min(6, Math.floor(s.skill / 25) + 1) }),
    pct: s.cap > 0 ? Math.max(0, Math.min(100, (s.skill / s.cap) * 100)) : 0,
  }));
  const families: { family: string; recipes: RecipeView[] }[] = [];
  for (const r of i.recipes) {
    const fam = r.def.family ?? '';
    const famLabel = fam ? tOr(`ui.win.craft.family.${fam}`, fam) : t('ui.win.craft.family_other');
    let group = families.find((f) => f.family === famLabel);
    if (!group) {
      group = { family: famLabel, recipes: [] };
      families.push(group);
    }
    const band = skillUpBand(r.skillGain);
    const make = (r.def.op ?? 'make') === 'make';
    group.recipes.push({
      id: r.def.id,
      name: i.recipeName(r.def.id, r.def.name),
      family: famLabel,
      materials: r.def.inputs.map((inp) => {
        const have = r.have[inp.itemId] ?? 0;
        return {
          itemId: inp.itemId,
          name: i.itemName(inp.itemId),
          count: t('ui.win.craft.have_need', { have, need: inp.count }),
          short: have < inp.count,
        };
      }),
      station: t('ui.win.craft.station', {
        tier: r.stationTier,
        type: tOr(`ui.win.craft.station_type.${r.def.station}`, r.def.station),
      }),
      masterwork: make && r.atStation ? t('ui.win.craft.masterwork', { p: r.masterwork }) : '',
      skillUp: {
        band,
        label: t(`ui.win.craft.skill_up.${band}`),
        steps: SKILL_UP_STEPS[band],
      },
      canCraft: r.row.ok,
      reason: craftRefusalText(r.row.code),
    });
  }
  return {
    livelihoods,
    families,
    maxRuns: Math.max(1, i.maxRuns),
    empty: livelihoods.length === 0 && families.length === 0,
    drunk: i.livelihoods.drunk > 0 ? t('ui.win.craft.drunk', { n: i.livelihoods.drunk }) : '',
  };
}

/** Clamp a batch request to 1 to maxRuns (6.3.3: at most 10 at a time). */
export function clampRuns(n: number, maxRuns: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(Math.max(1, maxRuns), Math.floor(n)));
}

// ---------------------------------------------------------------------------
// The gathering node panel (6.3.4)

export interface NodeView {
  id: string;
  name: string;
  /** ore, wood, herb, water, special */
  kind: string;
  /** node tier against your skill tier */
  tiers: string;
  /** the tool tier, or "no tool" */
  tool: string;
  /** none, light, mid, heavy; mid and up warn of taint */
  taint: string;
  taintWarn: boolean;
  /** the warning beside a mid or heavy band (the mortal or canon word, as the band) */
  taintWarnText: string;
  /** the expected main yield; halved when a tier falls one short */
  yieldText: string;
  /** days until it gives again, or "spent" */
  respawn: string;
  canGather: boolean;
  reason: string;
}

export interface GatherModelInput {
  nodes: readonly GatherNodeData[];
  /** the player has heard the word (`term.dian_known`): the canon taint word, else the mortal one */
  dianKnown: boolean;
  itemName: (id: string) => string;
  nodeName: (id: string, fallback: string) => string;
}

function countText(c: number | [number, number], half: boolean): string {
  const h = (n: number) => (half ? Math.ceil(n / 2) : n);
  if (typeof c === 'number') return String(h(c));
  const lo = h(c[0]);
  const hi = h(c[1]);
  return lo === hi ? String(lo) : t('ui.win.gather.range', { lo, hi });
}

export function gatherModel(i: GatherModelInput): NodeView[] {
  return i.nodes.map((n) => {
    const main = n.def.yields[0];
    const taintBand = Math.max(0, Math.min(3, Math.floor(n.taint)));
    return {
      id: n.def.id,
      name: i.nodeName(n.def.id, n.def.name),
      kind: t(`ui.win.gather.kind.${n.def.kind}`),
      tiers: t('ui.win.gather.tiers', { node: n.def.tier, skill: n.skillTier }),
      tool:
        n.toolTier > 0 ? t('ui.win.gather.tool', { n: n.toolTier }) : t('ui.win.gather.no_tool'),
      taint: i.dianKnown
        ? t(`ui.win.gather.taint_canon.${taintBand}`)
        : t(`ui.win.gather.taint.${taintBand}`),
      taintWarnText: i.dianKnown
        ? t('ui.win.gather.taint_warn_canon')
        : t('ui.win.gather.taint_warn'),
      taintWarn: taintBand >= 2,
      yieldText: main
        ? t('ui.win.gather.yield', {
            count: countText(main.count, !n.full),
            item: i.itemName(main.itemId),
          })
        : '',
      // a node used up by its gathers reads spent even though its clock says ready
      respawn:
        n.readyDays === -1 || n.row.code === 'spent'
          ? t('ui.win.gather.spent')
          : n.readyDays !== null
            ? t('ui.win.gather.ready_in', { n: n.readyDays })
            : t('ui.win.gather.ready_now'),
      canGather: n.row.ok,
      reason: gatherRefusalText(n.row.code),
    };
  });
}
