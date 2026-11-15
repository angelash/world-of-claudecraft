// HUD shell: lays out the player and target frames, clock and time controls, minimap,
// message log, conversation box, hotbar, menu bar, the war prompt, the announcement
// banner and the full-screen scene panel over the world canvas. Each piece is its own
// module; this file only composes them.

import { el, setText } from '../../shared_ui/dom';
import { T } from '../../shared_ui/text';
import type { SpriteCache } from '../sprites/sprite_cache';
import type { WindowId } from '../windows/window_registry';
import { Banner, WarPrompt } from './banner';
import { ClockPanel, type TimeControls } from './clock_panel';
import { ConversationBox, type ConversationHandlers } from './conversation_box';
import { Hotbar } from './hotbar';
import { MenuBar } from './menu_bar';
import { MessageLog } from './message_log';
import { Minimap } from './minimap';
import { ScenePanel, type ScenePanelHandlers } from './scene_panel';
import { UnitFrame } from './unit_frames';

export interface HudDeps {
  sprites: SpriteCache;
  time: TimeControls;
  devMode: boolean;
  conversation: ConversationHandlers;
  maxSay: number;
  scene: ScenePanelHandlers;
  onHotbar(slot: number): void;
  onToggleWindow(id: WindowId): void;
  onWarPrompt(): void;
}

export class Hud {
  readonly root: HTMLElement;
  readonly playerFrame: UnitFrame;
  readonly targetFrame: UnitFrame;
  readonly clock: ClockPanel;
  readonly minimap: Minimap;
  readonly log: MessageLog;
  readonly conversation: ConversationBox;
  readonly hotbar: Hotbar;
  readonly menuBar: MenuBar;
  readonly scene: ScenePanel;
  readonly banner: Banner;
  readonly warPrompt: WarPrompt;
  private pauseBanner: HTMLElement;

  constructor(parent: HTMLElement, deps: HudDeps) {
    this.playerFrame = new UnitFrame('hk-frame-player', deps.sprites);
    this.targetFrame = new UnitFrame('hk-frame-target', deps.sprites);
    this.clock = new ClockPanel(deps.time);
    this.minimap = new Minimap();
    this.log = new MessageLog();
    this.conversation = new ConversationBox(deps.conversation, deps.maxSay);
    this.hotbar = new Hotbar(deps.onHotbar);
    this.menuBar = new MenuBar(deps.onToggleWindow, deps.devMode);
    this.scene = new ScenePanel(deps.scene);
    this.banner = new Banner();
    this.warPrompt = new WarPrompt(T.warPrompt.go, deps.onWarPrompt);
    this.pauseBanner = el('div', { className: 'hk-banner', text: T.speed.paused });
    this.pauseBanner.hidden = true;
    this.root = el('div', { className: 'hk-hud' }, [
      el('div', { className: 'hk-hud-tl' }, [this.playerFrame.el, this.targetFrame.el]),
      el('div', { className: 'hk-hud-tr' }, [this.clock.el, this.minimap.el]),
      el('div', { className: 'hk-hud-bl' }, [this.log.el]),
      el('div', { className: 'hk-hud-bc' }, [this.conversation.el, this.hotbar.el]),
      el('div', { className: 'hk-hud-br' }, [this.menuBar.el]),
      el('div', { className: 'hk-hud-tc' }, [this.warPrompt.el]),
      this.pauseBanner,
      this.banner.el,
      this.scene.el,
      deps.devMode ? el('div', { className: 'hk-dev-badge', text: T.app.devBadge }) : null,
    ]);
    parent.append(this.root);
  }

  setPaused(paused: boolean): void {
    this.pauseBanner.hidden = !paused;
    setText(this.pauseBanner, T.speed.paused);
  }

  dispose(): void {
    this.root.remove();
  }
}
