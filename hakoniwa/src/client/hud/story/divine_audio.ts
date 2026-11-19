// What the audio hears of the goddesses and the dream while a scene plays (PK-M1-34;
// audio_direction.md 5.1 rules 4 and 5, catalog_goddess_interventions 1.6): the oracle and
// dream calls GameAudio.setDivine and GameAudio.setDream. Pure, so the rule is tested apart
// from the session; story_wiring.ts sends the result only when it changes.
//
// - divine: a goddess speaking a `divine` line on stage brings her theme (`mus_god_<id>`, the
//   audio direction's naming) for as long as she is the last speaker; the audio engine holds
//   it three seconds after she leaves (5.1 rule 4), so this only names who is on stage now.
//   Her theme is taken from the asset id convention, never from a table of content ids.
// - dream: the scene is played on a map whose reverb zone is `dream` (the dream doorway stage
//   of catalog_cutscenes.md 2.6), read from the map's own data.
// - the door woman's theme belongs to act 6 (5.1 table: `mus_god_door_woman` only in act 6):
//   before then her lines in a dream stay inside the dream track, so a speaker whose theme is
//   held back gives no divine cue.

/** The audio cue of the scene on screen: whose theme, and whether the dream track plays. */
export interface DivineCue {
  divine: string | null;
  dream: boolean;
}

export interface DivineInputs {
  /** the scene's lines on screen now, in order (speaker id and line kind) */
  lines: readonly { speakerId: string; kind: string }[];
  /** the goddess ids (the goddesses table) */
  goddesses: ReadonlySet<string>;
  /** the reverb zone of the map the scene plays on ('' when none) */
  reverbZone: string;
  /** goddesses whose theme is held back for now (the door woman before act 6) */
  muted?: ReadonlySet<string>;
}

/** The theme id of a goddess by the audio naming rule (audio_direction.md 4.1). */
export function goddessTheme(goddess: string): string {
  return `mus_god_${goddess}`;
}

/** The cue for the scene on screen; outside a scene: no theme, no dream. */
export function divineCue(i: DivineInputs | null): DivineCue {
  if (!i) return { divine: null, dream: false };
  const dream = i.reverbZone === 'dream';
  const last = i.lines[i.lines.length - 1];
  const on =
    last &&
    last.kind === 'divine' &&
    i.goddesses.has(last.speakerId) &&
    !i.muted?.has(last.speakerId)
      ? last.speakerId
      : null;
  return { divine: on ? goddessTheme(on) : null, dream };
}

/** Whether two cues differ (the wiring calls the audio only on a change). */
export function cueChanged(a: DivineCue | null, b: DivineCue): boolean {
  return !a || a.divine !== b.divine || a.dream !== b.dream;
}
