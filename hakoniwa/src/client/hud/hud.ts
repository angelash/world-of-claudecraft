// HUD shell: lays out the player and target frames, the party and focus frames, clock and time
// controls, minimap, message log, the dialogue panel, hint bar, notifications, hotbar, menu bar,
// the war prompt, the announcement banner and the cutscene player over the world canvas (the
// story layer, ./story/), and the act-1 pieces (PK-M1-23): the field status bar, the tide-night
// panel and Merca's coin badge. Each piece is its own module; this file only composes them. The
// elements the onboarding outlines carry a `data-hud` name (src/client/tutorial/glow.ts).

import { el, setText } from '../../shared_ui/dom';
import { t } from '../../shared_ui/i18n';
import type { SpriteCache } from '../sprites/sprite_cache';
import type { WindowId } from '../windows/window_registry';
import { Banner, WarPrompt } from './banner';
import { ClockPanel, type TimeControls } from './clock_panel';
import { CoinBadge } from './coin_badge';
import { DungeonBar } from './dungeon_bar';
import { FocusFrame } from './focus_frame';
import { Gauges } from './gauges';
import { HintBarView } from './hint_bar';
import { Hotbar } from './hotbar';
import { MenuBar } from './menu_bar';
import { MessageLog } from './message_log';
import { Minimap } from './minimap';
import { NotifyView } from './notify';
import { PartyFrames } from './party_frames';
import { type CropSource, type StoryHandlers, StoryView } from './story';
import { TidePanel } from './tide_panel';
import { Tracker } from './tracker';
import { UnitFrame } from './unit_frames';

export interface HudDeps {
  sprites: SpriteCache;
  time: TimeControls;
  devMode: boolean;
  /** the dialogue panel and the cutscene player (ui_mode_dialogue, ui_mode_cutscene) */
  story: StoryHandlers;
  /** the standee crop of a speaker's entity (portrait fallback) */
  storyCrop: CropSource;
  onHotbar(slot: number): void;
  onToggleWindow(id: WindowId): void;
  onWarPrompt(): void;
  /** a party or focus frame was clicked: select that entity */
  onSelect(entityId: string): void;
  /** a critical notification was clicked: open its window */
  onOpenWindow(id: string): void;
  /** Merca's coin badge was clicked: open the offering popup (ui_hud_coin, ui_pop_offer) */
  onCoin(): void;
  /** the player closed the dawn summary of a tide night */
  onTideClose(night: string): void;
}

export class Hud {
  readonly root: HTMLElement;
  readonly playerFrame: UnitFrame;
  readonly targetFrame: UnitFrame;
  readonly clock: ClockPanel;
  readonly minimap: Minimap;
  readonly log: MessageLog;
  readonly hotbar: Hotbar;
  readonly menuBar: MenuBar;
  /** the dialogue panel, the cutscene player, the backlog and the summary card */
  readonly story: StoryView;
  readonly banner: Banner;
  readonly warPrompt: WarPrompt;
  readonly party: PartyFrames;
  readonly focus: FocusFrame;
  readonly notify: NotifyView;
  readonly hint: HintBarView;
  /** door costs and taint under the player frame (ui_hud_gauges) */
  readonly gauges: Gauges;
  /** tracked quests and the pinned door under the minimap (ui_hud_tracker) */
  readonly tracker: Tracker;
  /** the field status bar in a dungeon or nest (ui_hud_dungeon) */
  readonly dungeonBar: DungeonBar;
  /** the tide night's lines, phase and results (PK-M1-52's request) */
  readonly tide: TidePanel;
  /** Merca's coin badge, shown for a moment when the coin is used (ui_hud_coin) */
  readonly coin: CoinBadge;
  /** the focus unit (ui_hud_focus), set by the focus action */
  focusId: string | null = null;
  private pauseBanner: HTMLElement;

  constructor(parent: HTMLElement, deps: HudDeps) {
    this.playerFrame = new UnitFrame('hk-frame-player', deps.sprites, 'player_auras');
    this.targetFrame = new UnitFrame('hk-frame-target', deps.sprites);
    this.clock = new ClockPanel(deps.time);
    this.minimap = new Minimap();
    this.log = new MessageLog();
    this.hotbar = new Hotbar(deps.onHotbar);
    this.menuBar = new MenuBar(deps.onToggleWindow, deps.devMode);
    this.story = new StoryView(deps.story, deps.storyCrop, () => this.root ?? null);
    this.banner = new Banner();
    this.warPrompt = new WarPrompt(t('ui.hud.warprompt.go'), deps.onWarPrompt);
    this.pauseBanner = el('div', { className: 'hk-banner', text: t('ui.hud.clock.speed.paused') });
    this.pauseBanner.hidden = true;
    this.party = new PartyFrames(deps.sprites, deps.onSelect);
    this.focus = new FocusFrame(() => {
      if (this.focusId) deps.onSelect(this.focusId);
    });
    this.notify = new NotifyView(deps.onOpenWindow);
    this.hint = new HintBarView();
    this.gauges = new Gauges();
    this.tracker = new Tracker();
    this.dungeonBar = new DungeonBar();
    this.tide = new TidePanel(deps.onTideClose);
    this.coin = new CoinBadge(deps.onCoin);
    for (const [node, name] of [
      [this.targetFrame.el, 'target_frame'],
      [this.party.el, 'party_frames'],
      [this.tracker.el, 'tracker'],
      [this.clock.el, 'clock'],
      [this.gauges.el, 'gauges'],
      [this.dungeonBar.el, 'dungeon_bar'],
    ] as const) {
      node.dataset.hud = name;
    }
    this.root = el('div', { className: 'hk-hud' }, [
      el('div', { className: 'hk-hud-tl' }, [
        el('div', { className: 'hk-hud-tl-col' }, [
          this.playerFrame.el,
          this.gauges.el,
          this.party.el,
          this.focus.el,
        ]),
        this.targetFrame.el,
      ]),
      el('div', { className: 'hk-hud-tr' }, [
        this.clock.el,
        this.minimap.el,
        this.tracker.el,
        this.dungeonBar.el,
        this.tide.el,
      ]),
      el('div', { className: 'hk-hud-bl' }, [this.log.el]),
      el('div', { className: 'hk-hud-bc' }, [
        this.story.dialogue.el,
        this.hint.el,
        this.notify.lightEl,
        this.hotbar.el,
      ]),
      el('div', { className: 'hk-hud-br' }, [this.coin.el, this.menuBar.el]),
      el('div', { className: 'hk-hud-tc' }, [this.warPrompt.el]),
      this.notify.topEl,
      this.notify.stackEl,
      this.pauseBanner,
      this.banner.el,
      this.story.cutscene.el,
      this.story.overlay,
      deps.devMode
        ? el('div', { className: 'hk-dev-badge', text: t('ui.scr.title.dev_badge') })
        : null,
    ]);
    parent.append(this.root);
  }

  setPaused(paused: boolean): void {
    this.pauseBanner.hidden = !paused;
    setText(this.pauseBanner, t('ui.hud.clock.speed.paused'));
  }

  dispose(): void {
    this.root.remove();
  }
}
