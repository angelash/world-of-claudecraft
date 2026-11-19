// Implements the model of `ui_win_help`'s control lines (ux_and_onboarding.md 6.2.15, 16.8):
// every line holds `{key:}` references, so the lines are rendered again on each refresh and the
// window rebuilds only when the text changed (a device switch, a rebound key). Pure;
// Node-tested. The painter is help_window.ts. The guidance-card and glossary pages of 17.7
// (PK-M1-23) follow below.

import type { FlagValue } from '../../core/contracts';
import { t } from '../../shared_ui/i18n';
import { paragraphKeys } from '../tutorial/card_model';
import { type GlossaryRow, glossaryModel } from '../tutorial/glossary';
import { keyBase, TUT_CATEGORIES, type TutCategory, type TutStep } from '../tutorial/steps';

/** The help lines in order (17.7 extends them with the glossary). */
export const HELP_LINE_KEYS = Array.from(
  { length: 16 },
  (_, i) => `ui.win.help.line.${i}` as const,
);

export interface HelpModel {
  lines: string[];
  /** changes whenever a line's text changes */
  sig: string;
}

export function helpModel(): HelpModel {
  const lines = HELP_LINE_KEYS.map((k) => t(k));
  return { lines, sig: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// 17.7: the guidance-card and glossary pages (PK-M1-23)

/** The help window's pages (17.7): controls, the cards seen, the glossary. */
export const HELP_TABS = ['controls', 'cards', 'glossary'] as const;
export type HelpTab = (typeof HELP_TABS)[number];

/** What the help window reads from the onboarding (`TutorialSession` and the view). */
export interface HelpSource {
  flags(): Readonly<Record<string, FlagValue>>;
  /** a guidance step has shown (glossary unlocks) */
  stepSeen(id: string): boolean;
  /** the card steps that have shown */
  seenCards(): readonly TutStep[];
  progress(): { done: number; of: number };
}

export interface HelpCard {
  id: string;
  title: string;
  paragraphs: string[];
}

export interface HelpCardGroup {
  layer: TutCategory;
  label: string;
  cards: HelpCard[];
}

/** The cards seen, grouped by layer in the order of the mute classes (17.3, 17.7). */
export function helpCardsModel(cards: readonly TutStep[]): HelpCardGroup[] {
  const out: HelpCardGroup[] = [];
  for (const layer of TUT_CATEGORIES) {
    const list = cards.filter((s) => s.category === layer && s.methods.includes('card'));
    if (list.length === 0) continue;
    out.push({
      layer,
      label: t(`ui.win.help.layer.${layer}`),
      cards: list.map((s) => ({
        id: s.id,
        title: t(`${keyBase(s.id)}.title`),
        paragraphs: paragraphKeys(s).map((k) => t(k)),
      })),
    });
  }
  return out;
}

export interface HelpPagesModel {
  tab: HelpTab;
  progress: string;
  cards: HelpCardGroup[];
  glossary: GlossaryRow[];
  /** changes whenever anything shown changes */
  sig: string;
}

/** The cards and glossary pages for a source (the controls page is `helpModel`). */
export function helpPagesModel(tab: HelpTab, src: HelpSource): HelpPagesModel {
  const p = src.progress();
  const cards = tab === 'cards' ? helpCardsModel(src.seenCards()) : [];
  const glossary = tab === 'glossary' ? glossaryModel(src.flags(), (id) => src.stepSeen(id)) : [];
  const progress = t('ui.win.help.progress', { done: p.done, of: p.of });
  return { tab, progress, cards, glossary, sig: JSON.stringify([tab, progress, cards, glossary]) };
}
