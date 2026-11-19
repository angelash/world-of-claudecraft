// The repetition rate of a speaker toward the player (builtin_ai.md 14.1): of the last W
// lines a speaker said to the player (topics the player asks again left out), the share
// that repeats an earlier one in the window, 1 - distinct / W, against the cap of the
// speaker's category. Measured by driving the real selector (./select.ts) with the saved
// line history and the suppression windows of each family (./history.ts, grammar.ts
// suppressionDays), the way src/systems/dialogue/speak.ts calls it.
//
// The interaction model (deterministic, one fixed script):
//   - one meeting every `everyDays` game days (default 1), the meetings alternating between
//     10:00 (day) and 20:00 (night), so the greeting slots alternate day parts;
//   - each meeting says, in this order and as one conversation (a line is not said twice in
//     it): the greeting greet.<band>.<day part> of a fixed trust band (default neutral, as
//     replies.ts greetingLine asks it), one reaction react.<kind> taking the next kind of
//     `reactions` in turn (default: the conversation acts and gift reactions every named
//     person writes, catalog 1.5), and the farewell (topics/talk.ts);
//   - the first meeting is the first meeting (first lines eligible), later ones are not;
//   - a line behind a `when` condition is unavailable unless `holds` says otherwise
//     (default: none holds, the conservative reading: no story progress, no time window);
//   - the fill values a talk always has ({player}, {place}, {name}, {catch}) are there,
//     every other fill slot is not, so a line needing one is void (7.9);
//   - no mood and no place preference;
//   - draws use the speaker's stream dialogue.lines.<speaker> seeded by `seed` (default 1).
// After `meetings` meetings (default: enough for twice the window) the last W said lines
// are taken. A slot with nothing anywhere on the chain says nothing and is listed in gaps.
// Pure and deterministic.

import type { ContentMap } from '../../../core/contracts';
import { hashSeed, Rng } from '../../../core/rng';
import type { SpeakerCategory } from './coverage';
import { FILL_SLOTS, suppressionDays } from './grammar';
import { newLineHistory, recordLine } from './history';
import type { FallbackLayers } from './packs';
import { selectLine } from './select';
import { dayPartOf } from './trust';
import type { TrustBand } from './types';

/** Window W and repetition cap per speaker category (builtin_ai 14.1); crowd pools differ. */
export const REPETITION_LIMITS: Readonly<
  Record<Exclude<SpeakerCategory, 'B'>, { span: number; cap: number }>
> = {
  G: { span: 30, cap: 0.05 },
  C: { span: 40, cap: 0.1 },
  F: { span: 40, cap: 0.1 },
  K: { span: 20, cap: 0.1 },
  N: { span: 20, cap: 0.2 },
  T: { span: 10, cap: 0.25 },
};

/** The default reactions a meeting draws in turn (catalog 1.5: what every named person writes). */
export const MODEL_REACTIONS: readonly string[] = [
  'feat_seen',
  'thanked',
  'gift_liked',
  'flattered',
  'insult',
];

/** Fill values the model always has (a talk's player address, place, name and catchphrase). */
const MODEL_FILLED: ReadonlySet<string> = new Set(['player', 'place', 'name', 'catch']);

export interface RepetitionModel {
  /** meetings to play (default: enough for twice the window) */
  meetings?: number;
  /** game days between two meetings (default 1) */
  everyDays?: number;
  /** trust band of the greetings (default neutral) */
  band?: TrustBand;
  /** reaction kinds a meeting takes in turn (default MODEL_REACTIONS) */
  reactions?: readonly string[];
  /** which `when` conditions hold (default: none) */
  holds?: (when: string) => boolean;
  /** the act whose overrides apply (default none) */
  act?: string;
  seed?: number;
}

export interface RepetitionResult {
  /** 1 - distinct / W over the window (0 when nothing was said) */
  rate: number;
  span: number;
  /** text keys of the last W lines, oldest first */
  said: string[];
  /** slots that had nothing anywhere on the chain */
  gaps: string[];
}

/** The repetition rate of `speaker` with `layers` over the interaction model (14.1). */
export function repetitionRate(
  content: Pick<ContentMap, 'linePacks'>,
  speaker: string,
  layers: FallbackLayers,
  span: number,
  model: RepetitionModel = {},
): RepetitionResult {
  const reactions = model.reactions ?? MODEL_REACTIONS;
  const meetings = model.meetings ?? Math.ceil((2 * span) / (reactions.length > 0 ? 3 : 2));
  const every = model.everyDays ?? 1;
  const band = model.band ?? 'neutral';
  const holds = model.holds ?? (() => false);
  const unfillable = new Set([...FILL_SLOTS].filter((s) => !MODEL_FILLED.has(s)));
  const rng = new Rng({ s: hashSeed(model.seed ?? 1, `dialogue.lines.${speaker}`) });
  const history = newLineHistory();
  const said: string[] = [];
  const gaps = new Set<string>();
  for (let i = 0; i < meetings; i++) {
    const day = i * every;
    const hour = i % 2 === 0 ? 10 : 20;
    const slots = [`greet.${band}.${dayPartOf(hour)}`];
    if (reactions.length > 0) slots.push(`react.${reactions[i % reactions.length]}`);
    slots.push('farewell');
    const session = new Set<string>();
    for (const slot of slots) {
      const pick = selectLine(
        content,
        speaker,
        slot,
        {
          holds,
          firstMeeting: i === 0,
          unfillable,
          dayIndex: day,
          saidThisSession: session,
        },
        rng,
        history,
        { ...layers, act: model.act, suppressDays: suppressionDays(slot) },
      );
      if (!pick) {
        gaps.add(slot);
        continue;
      }
      recordLine(history, pick.key, day);
      session.add(pick.key);
      said.push(pick.key);
    }
  }
  const last = said.slice(-span);
  const rate = last.length === 0 ? 0 : 1 - new Set(last).size / last.length;
  return { rate, span, said: last, gaps: [...gaps].sort() };
}
