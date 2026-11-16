// What every window factory receives: the read-only view, the command queue, the
// adapters, save storage, client settings and a few session actions.

import type { QualityId } from '../hd2d/quality';
import type { ClientSaves, SlotId } from '../hud/save_slots';
import type { ClientAdapters } from '../view/adapters';
import type { GameCommands, GameView } from '../view/game_view';
import type { WindowId } from './window_registry';

export interface SessionActions {
  saveTo(slot: SlotId): void;
  loadFrom(slot: SlotId): void;
  toTitle(): void;
  openWindow(id: WindowId): void;
  closeWindow(id: WindowId): void;
  /** enter building placement mode on the world map (territory window) */
  beginPlacement(siteId: string, defId: string, name: string): void;
  /** select an entity as the current target */
  select(entityId: string | null): void;
  /** graphics: the chosen quality tier and the renderer actually running */
  display(): DisplayView;
  setQuality(id: QualityId): void;
  setViewPreset(preset: 'street' | 'overview'): void;
}

export interface DisplayView {
  quality: QualityId;
  renderer: 'hd2d' | 'flat';
  /** whether WebGL2 is available (otherwise only the flat renderer can run) */
  webgl: boolean;
}

export interface AiStatusView {
  /** the player's setting */
  enabled: boolean;
  /** whether a model proxy answered */
  available: boolean;
  /** whether this running world uses the model (aiMode external) */
  active: boolean;
  /**
   * The settings window's five-step display band 0..4 (normal, throttled, saving, key
   * requests only, rules): the runner's 0..9 degrade ladder through displayLevel (ai_bridge.ts).
   */
  level: number;
  budgetUsed?: number;
  budgetCap?: number;
}

export interface ClientSettings {
  ai(): AiStatusView;
  setAiEnabled(on: boolean): void;
}

export interface WindowContext {
  view: GameView;
  commands: GameCommands;
  adapters: ClientAdapters;
  devMode: boolean;
  saves: ClientSaves;
  actions: SessionActions;
  settings: ClientSettings;
}
