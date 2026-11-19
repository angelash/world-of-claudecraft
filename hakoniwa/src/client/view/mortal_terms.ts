// Mortal terms (D-030; reveal_ledger.md 6): until the player hears the word from Yeyu
// (`term.dian_known`), the interface names the sediment and its sickness with the words mortals
// use. This module holds the flag names and the pure helpers both the adapters and the HUD
// models read, so neither has to import the other. Pure; Node-tested.

import { t } from '../../shared_ui/i18n';

/** The registered flag that turns the interface to the real word (world_state_registry.md). */
export const DIAN_KNOWN_FLAG = 'term.dian_known';
/** The sickness stage the body is in (registered enum `none|spot|fever|crystal`). */
export const SED_STAGE_FLAG = 'player.sed_stage';

/** The sickness stages in order; the index is the state step (1 spot, 2 fever, 3 crystal). */
export const SED_STAGES = ['none', 'spot', 'fever', 'crystal'] as const;
export type SedStageName = (typeof SED_STAGES)[number];

/** The stage of a flag value, or null when it is not one of the registered values. */
export function sedStageOf(v: unknown): SedStageName | null {
  return typeof v === 'string' && (SED_STAGES as readonly string[]).includes(v)
    ? (v as SedStageName)
    : null;
}

/**
 * The display name of an aura: a sickness-stage aura (the ailments config's `stages[].aura`)
 * carries the mortal word until the player hears the real one; every other aura keeps `name`.
 */
export function auraDisplayName(
  auraId: string,
  name: string,
  stages: readonly { id: string; aura: string }[] | undefined,
  dianKnown: boolean,
): string {
  if (dianKnown) return name;
  const stage = stages?.find((s) => s.aura === auraId);
  if (!stage) return name;
  const step = SED_STAGES.indexOf(stage.id as SedStageName);
  return step > 0 ? t(`ui.hud.gauges.taint_mortal_state.${step}`) : name;
}
