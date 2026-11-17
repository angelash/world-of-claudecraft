// The prologue's staging mechanics (PK-M1-54; prologue_antechamber.md 1, 3.1, 7;
// catalog_cutscenes.md cut_p_door_white, cut_p_quarrel, cut_p_discard), read against the
// world's flags each frame:
// - P2, the door that reappears at every corner: each turn away (the counter flag of the
//   `door` directive, `p_door_attempts_refused`) the door stands at the next corner, nearer
//   and brighter; at the cap it is ajar with wind behind it; `open` when pushed or when it
//   opens by itself as the player passes.
// - P5, eavesdropping by distance: the stance sets the level (`p_eavesdrop_level`, 0 to 3)
//   once, before the quarrel; the tier (far, mid, near) follows it for the audio and the
//   text, and every noise of the player lowers it one step for the rest.
// - P15, the reach-out key: a choice the client picks with an input action instead of a
//   number (`keyPrompts`), with a written timeout as the other answer (kernel side).
// Pure; Node-tested.

import type { FlagValue } from '../../../core/contracts';
import { type ListenTier, quieterTier } from '../../audio/spatializer';
import type { StageState } from './stage';

export type Flags = Readonly<Record<string, FlagValue>>;

function num(v: FlagValue | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The tier a stance stands at before any noise: the bench far (0), three steps from the
 * curtain middle (2), against it near (3). The cough stance (1) walks to the curtain too, so
 * it starts in the middle; its cough is a `noise` and drops it to far for the rest
 * (prologue_antechamber.md 3.1). The audio's own `listenTierOf` folds the cough in at once,
 * for callers without the noise.
 */
export function stanceTier(level: number): ListenTier {
  return level >= 3 ? 'near' : level >= 1 ? 'mid' : 'far';
}

/** The listening tier now (null outside an eavesdropping stretch). */
export function listenTier(stage: StageState, flags: Flags): ListenTier | null {
  const l = stage.listen;
  if (!l) return null;
  let tier = stanceTier(Math.max(0, Math.min(3, Math.floor(num(flags[l.flag])))));
  for (let i = 0; i < l.noises; i++) tier = quieterTier(tier);
  return tier;
}

/** Whether a line is heard through the curtain (dimmed in the far tier): voices, not narration. */
export function muffledLine(tier: ListenTier | null, kind: string, speakerId: string): boolean {
  return tier === 'far' && kind !== 'narrate' && kind !== 'think' && speakerId !== 'player';
}

export type DoorState = 'closed' | 'corner' | 'ajar' | 'open';

export interface DoorStage {
  state: DoorState;
  /** times the player turned away (0 to cap) */
  turns: number;
  /** which corner the door stands at (0: where it first appeared) */
  corner: number;
  /** 0..1: the door light grows each time (cut_p_door_white shot 3) */
  light: number;
  /** wind behind the door (ajar or open) */
  wind: boolean;
}

/** The recurring door's state now, or null when no door stands on the stage. */
export function doorStage(stage: StageState, flags: Flags): DoorStage | null {
  const d = stage.door;
  if (!d) return null;
  const turns = Math.max(0, Math.min(d.cap, Math.floor(num(flags[d.flag]))));
  const state: DoorState = d.open
    ? 'open'
    : turns >= d.cap
      ? 'ajar'
      : turns > 0
        ? 'corner'
        : 'closed';
  return {
    state,
    turns,
    corner: turns,
    light: d.cap > 0 ? Math.min(1, (turns + (d.open ? 1 : 0)) / d.cap) : 0,
    wind: state === 'ajar' || (state === 'open' && turns >= d.cap),
  };
}

export interface KeyPrompt {
  choiceId: string;
  /** the dialogue-context input action that picks it */
  action: string;
  label: string;
}

/** The choices picked by a key (shown as key prompts, not numbered). */
export function keyPrompts(
  choices: readonly { id: string; key?: string; label: string }[],
): KeyPrompt[] {
  return choices.flatMap((c) => (c.key ? [{ choiceId: c.id, action: c.key, label: c.label }] : []));
}

/** The keyed choice an input action picks now, or null. */
export function promptFor(prompts: readonly KeyPrompt[], action: string): KeyPrompt | null {
  return prompts.find((p) => p.action === action) ?? null;
}
