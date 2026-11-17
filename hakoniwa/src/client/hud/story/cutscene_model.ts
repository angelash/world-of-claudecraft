// The model of `ui_mode_cutscene` (ux_and_onboarding.md 8; catalog_cutscenes.md 13): one of the
// three presentations (staged: letterbox 2:1 over the world with subtitles; theater: the world
// dimmed under a full-screen text panel; illustration: a full-screen still with captions, the
// act's backdrop or a dark vignette when the still is missing), the node's lines typed one
// after another, the choices and the free input once every line is shown, the stage (busts,
// captions, fade, the letter step), the reading toggles (auto, hidden text, backlog) and the
// skip control. Builds on scene_model.ts (numbering, modes, hints). Pure; Node-tested.

import { contentKey } from '../../../core/content_key';
import type { TextParam } from '../../../core/text';
import { t, tOr } from '../../../shared_ui/i18n';
import type { SceneView } from '../../../systems/scenes';
import { isModelText } from '../../adapters/social';
import type { AssetResolver } from '../../assets/resolver';
import { type ScenePanelModel, scenePanelModel } from '../scene_model';
import { lineSignature } from './dialogue_model';
import type { LetterCard } from './letter_card';
import { firstChars, type ReaderState, textLength } from './reading';
import { litBusts, type StageState } from './stage';

export interface CutsceneLine {
  speakerId: string;
  speaker: string;
  text: string;
  kind: 'say' | 'think' | 'narrate' | 'divine';
  generated: boolean;
  blocked: boolean;
  /** signature for the block list (speaker and full text) */
  sig: string;
}

export interface CutsceneBust {
  who: string;
  name: string;
  expression: string;
  side: 'left' | 'right';
  lit: boolean;
}

export interface LetterText {
  sender: string;
  seal: string;
  subject: string;
  paragraphs: string[];
  /** the press that closes the letter */
  hint: string;
}

export interface CutsceneModel {
  key: string;
  presentation: 'staged' | 'theater' | 'illustration';
  title: string;
  /** the still of an illustration scene, when its art resolves (else the vignette) */
  still: string | null;
  lines: CutsceneLine[];
  /** a line is still typing */
  typing: boolean;
  /** every line of the node is shown: choices and input may appear */
  linesDone: boolean;
  mode: ScenePanelModel['mode'];
  choices: (ScenePanelModel['choices'][number] & { confirm: boolean })[];
  input: ScenePanelModel['input'];
  hint: string;
  court: string | null;
  queued: string | null;
  busts: CutsceneBust[];
  captions: string[];
  fade: 'black' | 'white' | 'soft' | null;
  letter: LetterText | null;
  shake: number;
  /** reading toggles */
  hidden: boolean;
  auto: boolean;
  skipping: boolean;
  /** 0..1 while the skip key is held */
  skipHold: number;
  /** the skip control is offered (not at a choice, not already skipping) */
  canSkip: boolean;
}

export interface CutsceneInputs {
  scene: SceneView;
  reader: ReaderState;
  stage: StageState;
  now: number;
  resolver: AssetResolver;
  playerId: string;
  /** display name of a bust's person (the plate falls back to it) */
  nameOf: (id: string) => string;
  letter: LetterCard | null;
  hidden: boolean;
  auto: boolean;
  skipping: boolean;
  skipHold: number;
  isBlocked: (sig: string) => boolean;
}

/** Lengths the reader types: the node's lines in order. */
export function sceneLengths(v: SceneView): number[] {
  return v.lines.map((l) => textLength(t(l.text)));
}

/**
 * The reader's page key of a scene node: a new node types afresh, while lines the kernel
 * appends to the same node (a free-input reply, an improvised line, a resolved wait) extend
 * the page instead of retyping what was already read.
 */
export function scenePageKey(v: SceneView): string {
  return `${v.sceneId}/${v.nodeId}`;
}

/** A node's step (its page and the lines shown so far): auto advance and skip fire once each. */
export function sceneStepKey(v: SceneView): string {
  return `${scenePageKey(v)}/${v.lines.length}`;
}

/** A content string (captions, the summary) through its key when the table has it. */
function contentString(text: string): string {
  return t(text as TextParam);
}

/** The skip summary card (ux 8.3, catalog 13.9): the summary, else the title only. */
export function summaryCard(
  sceneId: string,
  title: string,
  summary: string,
): { title: string; text: string } {
  return {
    title: tOr(contentKey('scenes', sceneId, 'title'), title),
    text: summary ? tOr(contentKey('scenes', sceneId, 'summary'), summary) : '',
  };
}

function letterText(c: LetterCard): LetterText {
  return {
    sender: t(c.sender),
    seal: tOr(`ui.mode.cutscene.letter.seal.${c.seal}`, ''),
    subject: t(c.subject),
    paragraphs: c.paragraphs.map((p) => t(p)),
    hint: t('ui.mode.cutscene.letter.close'),
  };
}

export function cutsceneModel(i: CutsceneInputs): CutsceneModel {
  const v = i.scene;
  const base = scenePanelModel(v);
  const r = i.reader;
  const lines: CutsceneLine[] = [];
  let typing = false;
  v.lines.forEach((l, n) => {
    // the letter step comes first: the node's lines wait until it closes
    if (n > r.line || i.letter) return;
    const full = t(l.text);
    const generated = isModelText(l.text) && l.speakerId !== i.playerId;
    const sig = lineSignature(l.speakerId, full);
    const blocked = generated && i.isBlocked(sig);
    let text = full;
    if (n === r.line && !r.lineDone) {
      text = firstChars(full, r.chars);
      typing = true;
    }
    const kind = base.lines[n]?.kind ?? 'say';
    lines.push({
      speakerId: l.speakerId,
      speaker: base.lines[n]?.speaker ?? '',
      text: blocked ? t('ui.common.ai.blocked_line') : text,
      kind,
      generated,
      blocked,
      sig,
    });
  });
  const linesDone = v.lines.length === 0 || r.allDone;
  const letter = i.letter ? letterText(i.letter) : null;
  const ready = linesDone && !letter;
  const speakerNow = lines[lines.length - 1]?.speakerId ?? null;
  let still: string | null = null;
  if (v.presentation === 'illustration' && v.illustration) {
    const hit = i.resolver.lookup(v.illustration);
    still = hit.ok ? hit.image : null;
  }
  const choices = ready
    ? base.choices.map((c) => ({
        ...c,
        confirm: !!v.choices.find((x) => x.id === c.id)?.confirm,
      }))
    : [];
  return {
    key: `${base.key}/${ready ? 'r' : 'w'}`,
    presentation: v.presentation,
    title: base.title,
    still,
    lines,
    typing,
    linesDone,
    mode: base.mode,
    choices,
    input: ready ? base.input : null,
    hint: letter
      ? letter.hint
      : !linesDone || base.mode === 'advance'
        ? t('ui.mode.cutscene.advance_hint')
        : base.hint,
    court: base.court,
    queued: base.queued,
    busts: litBusts(i.stage.busts, speakerNow).map((b) => ({ ...b, name: i.nameOf(b.who) })),
    captions: i.stage.captions.map(contentString),
    fade: i.stage.fade && i.stage.fade.until > i.now ? i.stage.fade.to : null,
    letter,
    shake: i.stage.shake,
    hidden: i.hidden,
    auto: i.auto,
    skipping: i.skipping,
    skipHold: i.skipHold,
    canSkip: !i.skipping && !(ready && (base.mode === 'choice' || base.mode === 'input')),
  };
}
