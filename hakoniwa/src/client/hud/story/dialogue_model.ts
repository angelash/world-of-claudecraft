// The model of `ui_mode_dialogue` (ux_and_onboarding.md 7): the open conversation in one of two
// layouts (regular: a portrait at the left; story: busts above the panel, the speaker lit and
// the listener dimmed) or a loose line addressed to the player (goddess speech, narration).
// The newest line types out (7.3); options are numbered 1 to 9 with their system tag (7.4); the
// free line counts "{n}/200"; when the other side has nothing left to say the panel shows a
// written farewell, never an empty panel; a rejected input shows its reason under the input
// (7.6). Text with `{key:}` is rendered on every build, so the hints follow the device.
// Model lines carry the AI mark (7.3). Pure; Node-tested. The painter is dialogue_panel.ts.

import type { TextParam } from '../../../core/text';
import { t, tOr } from '../../../shared_ui/i18n';
import type { ConversationView } from '../../view/adapters';
import type { DialogueLine } from '../dialogue_queue';
import { MAX_OPTIONS, VISIBLE_LINES } from './constants';
import type { SpeakerRef } from './portrait_plan';
import { firstChars, type ReaderState, textLength } from './reading';

export interface DialogueLineModel {
  /** stable id of the line within the conversation (its index) */
  id: string;
  who: string;
  text: string;
  kind: string;
  /** spoken by the player */
  mine: boolean;
  /** model output (7.3 AI mark) */
  generated: boolean;
  /** the player blocked it (7.3): shown as a stub */
  blocked: boolean;
  /** signature for the block list (speaker and full text) */
  sig: string;
}

export interface DialogueOptionModel {
  id: string;
  number: number;
  label: string;
  /** 【交易】 style tag ('' when the system has none) */
  tag: string;
  hint: string;
  /** why the option cannot be taken now ('' when it can) */
  disabled: string;
}

export interface DialogueModel {
  key: string;
  mode: 'talk' | 'loose';
  layout: 'regular' | 'story';
  /** the other side (entity or speaker id) */
  speakerId: string;
  /** whose portrait or bust to draw (null: none, for narration and loose lines) */
  speaker: SpeakerRef | null;
  name: string;
  /** title, job or tier name under the name */
  subtitle: string;
  /** the attitude tag (7.1); '' until the view has one */
  attitude: string;
  lines: DialogueLineModel[];
  /** the newest line is still typing */
  typing: boolean;
  options: DialogueOptionModel[];
  /** the free-input line (talk mode) */
  input: { placeholder: string; max: number } | null;
  /** waiting for the other side ("对方在想……") */
  pending: boolean;
  /** footer hint (loose lines: the advance key) */
  hint: string;
  /** the other side has nothing left to say: the farewell line (7.6) */
  farewell: string;
  /** the last free text was refused: why (7.6) */
  rejected: string;
  /** line kind of a loose line (divine, narrate, think, say) */
  looseKind: string;
  /** free texts accepted so far (the painter clears the line when it grows) */
  said: number;
}

/** System tag of an option (7.4): the offering system's tag, the built-in leave option's own. */
export function optionTag(system: string, optionId: string): string {
  if (system === 'dialogue') {
    return optionId === 'bye' ? t('ui.mode.dialogue.tag.leave') : t('ui.mode.dialogue.tag.talk');
  }
  return tOr(`ui.mode.dialogue.tag.${system}`, '');
}

/** The "{n}/200" counter under the free line. */
export function counterText(length: number, max: number): string {
  return t('ui.mode.dialogue.counter', { n: Math.min(length, max), max });
}

export interface TalkInputs {
  conv: ConversationView;
  reader: ReaderState;
  layout: 'regular' | 'story';
  speaker: SpeakerRef;
  playerId: string;
  subtitle: string;
  maxSay: number;
  /** the last refused free text's reason ('' when none) */
  rejected: string;
  said: number;
  isBlocked: (sig: string) => boolean;
}

/** A line's signature for the block list (speaker and text). */
export function lineSignature(speakerId: string, text: string): string {
  return `${speakerId}|${text}`;
}

export function talkModel(i: TalkInputs): DialogueModel {
  const c = i.conv;
  const all = c.lines;
  const first = Math.max(0, all.length - VISIBLE_LINES);
  const lines: DialogueLineModel[] = [];
  let typing = false;
  for (let n = first; n < all.length; n++) {
    const l = all[n];
    if (!l) continue;
    let text = l.text;
    if (n === i.reader.line && !i.reader.lineDone) {
      text = firstChars(text, i.reader.chars);
      typing = true;
    } else if (n > i.reader.line) continue;
    const generated = !!l.generated && l.speakerId !== i.playerId;
    const sig = lineSignature(l.speakerId, l.text);
    const blocked = generated && i.isBlocked(sig);
    lines.push({
      id: String(n),
      who: l.speakerName,
      text: blocked ? t('ui.common.ai.blocked_line') : text,
      kind: l.kind,
      mine: l.speakerId === i.playerId,
      generated,
      blocked,
      sig,
    });
  }
  const options: DialogueOptionModel[] = c.options.slice(0, MAX_OPTIONS).map((o, k) => ({
    id: o.id,
    number: k + 1,
    label: o.label,
    tag: optionTag(o.system, o.id),
    hint: o.hint ?? '',
    disabled: o.disabled ?? '',
  }));
  // Nothing more to say: no options, not waiting, nothing new typed (7.6).
  const silent = !c.pending && options.length === 0;
  return {
    key: `t|${c.npcId}|${all.length}|${c.pending}|${options.map((o) => o.id).join(',')}`,
    mode: 'talk',
    layout: i.layout,
    speakerId: c.npcId,
    speaker: i.speaker,
    name: c.name,
    subtitle: i.subtitle,
    attitude: c.attitude ?? '',
    lines,
    typing,
    options,
    input: { placeholder: t('ui.mode.dialogue.placeholder'), max: i.maxSay },
    pending: c.pending,
    hint: '',
    farewell: silent ? t('ui.mode.dialogue.farewell') : '',
    rejected: i.rejected,
    looseKind: '',
    said: i.said,
  };
}

export function looseModel(line: DialogueLine, reader: ReaderState): DialogueModel {
  const text = t(line.text as TextParam);
  const shown = reader.lineDone ? text : firstChars(text, reader.chars);
  return {
    key: `l|${line.speakerId}|${text}`,
    mode: 'loose',
    layout: 'regular',
    speakerId: line.speakerId,
    speaker: null,
    name: line.kind === 'narrate' ? '' : t(line.speakerName as TextParam),
    subtitle: '',
    attitude: '',
    lines: [
      {
        id: '0',
        who: '',
        text: shown,
        kind: line.kind,
        mine: false,
        generated: false,
        blocked: false,
        sig: '',
      },
    ],
    typing: !reader.lineDone,
    options: [],
    input: null,
    pending: false,
    hint: t('ui.mode.dialogue.advance'),
    farewell: '',
    rejected: '',
    looseKind: line.kind,
    said: 0,
  };
}

/** Lengths the reader types: every line of the conversation (it types the newest). */
export function talkLengths(c: ConversationView): number[] {
  return c.lines.map((l) => textLength(l.text));
}
