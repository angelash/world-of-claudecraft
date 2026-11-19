// Implements the model of `ui_hud_gauges` (ux_and_onboarding.md 5.2): the thin bars under the
// player frame for the door costs (blockage and door fatigue, thousand_doors.md 6.2, 6.3) and
// the taint (0 to 100, ticks at 20, 45 and 75 for the three taint states, catalog_consumables_
// magitools.md 2.4). A bar shows only once its value is above 0; past a threshold its state name
// shows beside it; numbers only in the hover text. Before the player hears the word from Yeyu
// (`term.dian_known`, reveal_ledger.md 6) the taint and its states carry the mortal words.
// Pure; Node-tested. The painter is ./gauges.ts.

import { t } from '../../shared_ui/i18n';
import type { ClientAdapters } from '../view/adapters';
import { flagOn, type GameView } from '../view/game_view';
import {
  DIAN_KNOWN_FLAG,
  SED_STAGE_FLAG,
  SED_STAGES,
  type SedStageName,
  sedStageOf,
} from '../view/mortal_terms';

// the mortal-term flags and helpers live in ../view/mortal_terms.ts; re-exported for the
// modules that read them from here
export {
  auraDisplayName,
  DIAN_KNOWN_FLAG,
  SED_STAGE_FLAG,
  SED_STAGES,
  type SedStageName,
  sedStageOf,
} from '../view/mortal_terms';

/** Taint thresholds of the three taint states (spot, fever, crystallisation). */
export const TAINT_THRESHOLDS = [20, 45, 75] as const;
/** Blockage tier floors (thousand_doors.md 6.2): sluggish, clogged, gnawing, drowning, swallowed. */
export const BLOCKAGE_TIERS = [20, 40, 60, 80, 100] as const;
export const GAUGE_MAX = 100;

/** The registered flags the gauges read (world_state_registry.md). */
export const TAINT_FLAG = 'player.taint';
export type GaugeId = 'blockage' | 'fatigue' | 'taint';

export interface GaugeInput {
  blockage: number;
  fatigue: number;
  taint: number;
  dianKnown: boolean;
  /**
   * The body's sickness stage (`player.sed_stage`), null when the flag is absent. The body's
   * stage is not always the threshold the taint has passed (a spot heals below 15, a fever
   * stays), so the state name follows it whenever it is there.
   */
  stage?: SedStageName | null;
}

export interface GaugeBar {
  id: GaugeId;
  label: string;
  /** fill 0 to 100 (percent) */
  pct: number;
  /** threshold ticks, in percent */
  ticks: number[];
  /** the state name past a threshold ('' below the first) */
  state: string;
  /** the hover text, the only place the number shows */
  title: string;
}

function clamp(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(GAUGE_MAX, v)) : 0;
}

/** How many of `floors` the value has reached. */
export function stepOf(value: number, floors: readonly number[]): number {
  let n = 0;
  for (const f of floors) if (value >= f) n++;
  return n;
}

export function gaugesModel(i: GaugeInput): GaugeBar[] {
  const out: GaugeBar[] = [];
  const blockage = clamp(i.blockage);
  if (blockage > 0) {
    const tier = stepOf(blockage, BLOCKAGE_TIERS);
    const label = t('ui.hud.gauges.blockage');
    out.push({
      id: 'blockage',
      label,
      pct: blockage,
      ticks: [...BLOCKAGE_TIERS.slice(0, -1)],
      state: tier > 0 ? t(`ui.hud.gauges.blockage_tier.${tier}`) : '',
      title: t('ui.hud.gauges.hover', { label, n: blockage, max: GAUGE_MAX }),
    });
  }
  const fatigue = clamp(i.fatigue);
  if (fatigue > 0) {
    const label = t('ui.hud.gauges.fatigue');
    out.push({
      id: 'fatigue',
      label,
      pct: fatigue,
      ticks: [],
      state: '',
      title: t('ui.hud.gauges.hover', { label, n: fatigue, max: GAUGE_MAX }),
    });
  }
  const taint = clamp(i.taint);
  const stage = i.stage ?? null;
  // a sickness that outlasts its taint (a fever stays) keeps the bar up: it is the player's
  // own state, never hidden (UX-6)
  if (taint > 0 || (stage !== null && stage !== 'none')) {
    const step = stage !== null ? SED_STAGES.indexOf(stage) : stepOf(taint, TAINT_THRESHOLDS);
    const label = t(i.dianKnown ? 'ui.hud.gauges.taint' : 'ui.hud.gauges.taint_mortal');
    out.push({
      id: 'taint',
      label,
      pct: taint,
      ticks: [...TAINT_THRESHOLDS],
      state:
        step === 0
          ? ''
          : i.dianKnown
            ? t(`ui.hud.gauges.taint_state.${step}`)
            : t(`ui.hud.gauges.taint_mortal_state.${step}`),
      title: t('ui.hud.gauges.hover', { label, n: taint, max: GAUGE_MAX }),
    });
  }
  return out;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * The gauges' readings: the door mirror's blockage and fatigue, the taint mirror flag (the
 * taint system writes it; absent until PK-M1-51, so the bar stays hidden), and whether the
 * player knows the word.
 */
export function gaugeInput(view: GameView, adapters: ClientAdapters): GaugeInput {
  const mirror = adapters.corridor?.mirror(view);
  return {
    blockage: num(mirror?.blockage),
    fatigue: num(mirror?.fatigue),
    taint: num(view.flag(TAINT_FLAG)),
    dianKnown: flagOn(view.flag(DIAN_KNOWN_FLAG)),
    stage: sedStageOf(view.flag(SED_STAGE_FLAG)),
  };
}
