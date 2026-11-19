// The model of `ui_pop_tutorial`, the guidance card (ux_and_onboarding.md 6.4, 17.2): a
// title, at most three paragraphs, and the two buttons "知道了" and "此后不提示这类". At the
// brief guidance level the card carries its title and one sentence with an "展开" that shows
// the rest (17.3). Every string is a text key; the card's own labels live under
// `ui.pop.tutorial.*`, a step's text under `tut.<step>.*` (20.2). Pure; Node-tested. The
// painter is ./card_pop.ts.

import { t } from '../../shared_ui/i18n';
import { keyBase, type TutCategory, type TutStep } from './steps';

export interface TutorialCard {
  stepId: string;
  category: TutCategory;
  title: string;
  /** the paragraphs to show now (one sentence at the brief level until it is expanded) */
  paragraphs: string[];
  /** the brief level holds text back ("展开" shows it); false when everything shows */
  hidden: boolean;
  /** the card pauses the world (17.2: modal when safe, else a side card) */
  modal: boolean;
  /** labels */
  ok: string;
  mute: string;
  expand: string;
  /** the dialog's accessible name (18.7: aria from text keys) */
  aria: string;
}

export interface CardInput {
  step: TutStep;
  modal: boolean;
  /** the brief guidance level shows the title and the first sentence only */
  brief: boolean;
  /** the player pressed "展开" */
  expanded?: boolean;
}

/** Every paragraph key of a step's card, in order. */
export function paragraphKeys(step: TutStep): string[] {
  const base = keyBase(step.id);
  const keys = [`${base}.body`];
  if (step.paragraphs === 2 || step.paragraphs === 3) keys.push(`${base}.body2`);
  if (step.paragraphs === 3) keys.push(`${base}.body3`);
  return keys;
}

/** The first sentence of a paragraph: up to its first full stop or question mark (19.1). */
export function firstSentence(text: string): string {
  const m = /^[^。？]*[。？]/.exec(text);
  return m ? m[0] : text;
}

export function tutorialCard(i: CardInput): TutorialCard {
  const base = keyBase(i.step.id);
  const title = t(`${base}.title`);
  const all = paragraphKeys(i.step).map((k) => t(k));
  const folded = i.brief && !i.expanded;
  const first = firstSentence(all[0] ?? '');
  const paragraphs = folded ? [first] : all;
  return {
    stepId: i.step.id,
    category: i.step.category,
    title,
    paragraphs,
    hidden: folded && (all.length > 1 || first !== (all[0] ?? '')),
    modal: i.modal,
    ok: t('ui.pop.tutorial.ok'),
    mute: t('ui.pop.tutorial.mute'),
    expand: t('ui.pop.tutorial.expand'),
    aria: t('ui.pop.tutorial.aria', { title }),
  };
}

/** What the player did with the card. */
export type CardAnswer = 'ok' | 'mute';
