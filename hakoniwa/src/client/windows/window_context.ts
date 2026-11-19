// What every window factory receives: the read-only view, the command queue, the
// adapters, save storage, client settings and a few session actions.

import type { SettingsPart, SyncPatch, SyncSettings } from '../app/settings_schema';
import type { QualityId } from '../hd2d/quality';
import type { ClientSaves, SaveBlock, SlotId } from '../hud/save_slots';
import type { TrackerState } from '../hud/tracker_model';
import type { ClientAdapters, EvidenceNoteStore } from '../view/adapters';
import type { GameCommands, GameView } from '../view/game_view';
import type { HelpSource } from './help_model';
import type { WindowId } from './window_registry';

export interface SessionActions {
  saveTo(slot: SlotId): void;
  loadFrom(slot: SlotId): void;
  /** why the player cannot save right now (ux_and_onboarding.md 6.2.13), or null */
  saveBlock(): SaveBlock | null;
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
  /**
   * Run one tick now so commands queued while the world is paused (an interface mode, the
   * corridor) settle at once; nothing happens outside a mode.
   */
  runQueued(): void;
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

/** The settings store as the settings pages see it (SettingsStore, settings_store.ts). */
export interface WindowPrefs {
  readonly sync: Readonly<SyncSettings>;
  /** Apply and queue a write; false (nothing changes) when a value is not valid. */
  updateSync(patch: SyncPatch): boolean;
  /** The part is used but never written (a newer version, or the host could not read it). */
  readOnly(part: SettingsPart): boolean;
}

export interface WindowContext {
  view: GameView;
  commands: GameCommands;
  adapters: ClientAdapters;
  devMode: boolean;
  saves: ClientSaves;
  actions: SessionActions;
  settings: ClientSettings;
  /** the settings store (the settings shell's pages, ui_scr_settings) */
  prefs: WindowPrefs;
  /** the quests and the door the HUD tracker follows (client session state, ui_hud_tracker) */
  tracker: TrackerState;
  /** the guidance cards and the glossary of the help window (17.7; the tutorial store) */
  help?: HelpSource;
  /** the player's notes on evidence, kept in the save's client segment (6.3.11) */
  evidenceNotes?: EvidenceNoteStore;
  /** replay a seen cutscene read-only (6.3.2 recollection page); absent until the story offers one */
  replayScene?: (sceneId: string) => void;
}
