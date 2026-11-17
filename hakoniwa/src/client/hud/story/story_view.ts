// The story layer of the HUD (`ui_mode_dialogue`, `ui_mode_cutscene`; ux_and_onboarding.md 7,
// 8): composes the dialogue panel (bottom centre), the cutscene player (full screen) and the
// overlay with the backlog and the skip summary card, and paints one story frame. The HUD root
// gets a mode class so the other elements collapse as 5.1 says (dialogue keeps the player
// frame, the party frame and the clock; a cutscene hides everything). Thin painter.

import './story.css';
import { el, setText } from '../../../shared_ui/dom';
import { t } from '../../../shared_ui/i18n';
import { BacklogView } from './backlog_view';
import { CutscenePlayer } from './cutscene_player';
import { DialoguePanel } from './dialogue_panel';
import type { StoryHandlers } from './handlers';
import type { CropSource } from './portrait_view';
import type { StoryFrame } from './story_controller';

export class StoryView {
  readonly dialogue: DialoguePanel;
  readonly cutscene: CutscenePlayer;
  /** the backlog and the summary card, over everything else of the story */
  readonly overlay: HTMLElement;
  private readonly backlog: BacklogView;
  private readonly card: HTMLElement;
  private readonly cardTitle = el('div', { className: 'hk-story-card-title' });
  private readonly cardLabel = el('div', { className: 'hk-story-card-label' });
  private readonly cardText = el('div', { className: 'hk-story-card-text' });
  private readonly cardHint = el('div', { className: 'hk-story-card-hint' });
  private mode: StoryFrame['mode'] = 'none';

  constructor(
    h: StoryHandlers,
    crop: CropSource,
    private readonly hudRoot: () => HTMLElement | null,
  ) {
    this.dialogue = new DialoguePanel(h, crop);
    this.cutscene = new CutscenePlayer(h, crop);
    this.backlog = new BacklogView(() => h.toggleBacklog());
    this.card = el(
      'div',
      { className: 'hk-story-card', attrs: { role: 'dialog', 'aria-live': 'polite' } },
      [this.cardLabel, this.cardTitle, this.cardText, this.cardHint],
    );
    this.card.addEventListener('click', () => h.closeCard());
    this.card.hidden = true;
    this.overlay = el('div', { className: 'hk-story-overlay' }, [this.backlog.el, this.card]);
  }

  /** The dialogue panel or the cutscene shows (the old `talking` and `open` checks). */
  get open(): boolean {
    return this.dialogue.open || this.cutscene.open;
  }

  paint(f: StoryFrame): void {
    this.cutscene.render(f.cutscene);
    this.dialogue.render(f.cutscene ? null : f.dialogue);
    this.backlog.render(f.backlog, t('ui.common.panel.close'));
    const s = f.summary;
    this.card.hidden = !s;
    if (s) {
      setText(this.cardLabel, t('ui.mode.cutscene.summary_label'));
      setText(this.cardTitle, s.title);
      setText(this.cardText, s.text);
      this.cardText.hidden = !s.text;
      setText(this.cardHint, s.hint);
    }
    if (f.mode !== this.mode) {
      const root = this.hudRoot();
      if (root) {
        root.classList.toggle('hk-mode-dialogue', f.mode === 'dialogue');
        root.classList.toggle('hk-mode-cutscene', f.mode === 'cutscene');
      }
      this.mode = f.mode;
    }
  }
}
