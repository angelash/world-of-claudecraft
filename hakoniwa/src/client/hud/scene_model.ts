// Scene panel model: turns the scenes system's SceneView into what the full-screen panel
// shows (title, styled lines, numbered choices, input box, court evidence state) and maps
// keys to scene actions. Hidden choices (keyed or timed, catalog_cutscenes.md 13.6) are not
// numbered; a keyed one shows as a key prompt instead. Pure; Node-tested.

import { listSeparator, t } from '../../shared_ui/i18n';
import type { SceneView } from '../../systems/scenes';
import { contentNames } from '../view/content_names';
import { type KeyPrompt, keyPrompts } from './story/prologue_stage';

export interface ScenePanelLine {
  speaker: string;
  text: string;
  kind: 'say' | 'think' | 'narrate' | 'divine';
}

export interface ScenePanelModel {
  key: string;
  title: string;
  lines: ScenePanelLine[];
  mode: 'advance' | 'choice' | 'input' | 'resolve';
  choices: { id: string; label: string; hint?: string; number: number }[];
  /** choices picked by an input action (the prologue's reach-out key) */
  prompts: KeyPrompt[];
  input: { prompt: string; maxLength: number } | null;
  /** footer hint for the current mode */
  hint: string;
  court: string | null;
  queued: string | null;
}

const KINDS = new Set(['say', 'think', 'narrate', 'divine']);

export function scenePanelModel(v: SceneView): ScenePanelModel {
  const mode: ScenePanelModel['mode'] =
    v.waiting === 'court' || v.waiting === 'choice'
      ? 'choice'
      : v.waiting === 'input'
        ? 'input'
        : v.waiting === 'resolve' || v.waiting === 'ui'
          ? 'resolve'
          : 'advance';
  const choices =
    mode === 'choice'
      ? v.choices
          .filter((c) => !c.hidden)
          .map((c, i) => ({ ...c, label: t(c.label), number: i + 1 }))
      : [];
  const prompts =
    mode === 'choice'
      ? keyPrompts(v.choices.map((c) => ({ id: c.id, key: c.key, label: t(c.label) })))
      : [];
  let court: string | null = null;
  if (v.court) {
    const parts = [t('ui.mode.cutscene.limit', { n: v.court.limit })];
    if (v.court.presented.length)
      parts.unshift(
        t('ui.mode.cutscene.presented', {
          list: v.court.presented.join(listSeparator('comma')),
        }),
      );
    court = parts.join('  ');
  }
  return {
    key: `${v.sceneId}/${v.nodeId}/${v.waiting}/${v.lines.length}/${choices.length}/${prompts.length}`,
    title: contentNames.sceneTitle(v.sceneId, v.title),
    lines: v.lines.map((l) => ({
      speaker: l.kind === 'narrate' ? '' : t(l.speakerName),
      text: t(l.text),
      kind: (KINDS.has(l.kind) ? l.kind : 'say') as ScenePanelLine['kind'],
    })),
    mode,
    choices,
    prompts,
    input: mode === 'input' ? v.input : null,
    hint:
      mode === 'advance'
        ? t('ui.mode.cutscene.advance_hint')
        : mode === 'choice'
          ? t('ui.mode.cutscene.choice_hint')
          : mode === 'resolve'
            ? t('ui.mode.cutscene.resolving')
            : '',
    court,
    queued: v.queued.length ? t('ui.mode.cutscene.queued', { n: v.queued.length }) : null,
  };
}

export type SceneKeyAction = { type: 'advance' } | { type: 'choose'; choiceId: string } | null;

/** Space or Enter advances; number keys pick choices. */
export function sceneKey(
  model: ScenePanelModel,
  key: { action: 'advance' } | { action: 'number'; n: number },
): SceneKeyAction {
  if (key.action === 'advance') return model.mode === 'advance' ? { type: 'advance' } : null;
  if (model.mode !== 'choice') return null;
  const c = model.choices.find((x) => x.number === key.n);
  return c ? { type: 'choose', choiceId: c.id } : null;
}
