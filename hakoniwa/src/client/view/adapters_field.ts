// Field-side view adapters (the seam of ../view/adapters.ts, split per domain): the
// commission board (ux_and_onboarding.md 6.3.7), the livelihoods and recipes (6.3.3), the
// gathering node panel (6.3.4), the dungeon panels (5.2, 6.3.10) and the beast companions
// and mounts (6.3.5). Each one passes the owning system's view type through where it has
// one and renders nothing itself; the window's pure core turns it into what is drawn.
// Implemented in src/client/adapters/field.ts.

import type { GatherNodeDef, RecipeDef, StationDef } from '../../systems/crafting/types';
import type { CraftingView, NodeRow, RecipeRow } from '../../systems/crafting/view';
import type { Choice } from '../../systems/dungeons/types';
import type { DungeonFieldView, DungeonListEntry } from '../../systems/dungeons/view';
import type { BoardView } from '../../systems/guild/view';
import type { MountDef, PartyOrder } from '../../systems/party/types';
import type { BeastView, CompanionView } from '../../systems/party/view';
import type { Commands } from './adapters';
import type { GameView } from './game_view';

// ---------------------------------------------------------------------------
// ui_win_board: the commission board (6.3.7)

export interface BoardAdapter {
  /** The board the player stands at, or null when none is in reach. */
  boardHere(view: GameView): string | null;
  /** One board's data, or null for an unknown board. */
  board(view: GameView, boardId: string): BoardView | null;
  /** A held commission is done and waits to be handed in (its quest stands at `ready`). */
  ready(view: GameView, postingId: string): boolean;
  accept(view: GameView, postingId: string): Commands;
  abandon(view: GameView, postingId: string): Commands;
  turnIn(view: GameView, postingId: string): Commands;
}

// ---------------------------------------------------------------------------
// ui_win_craft: livelihoods and recipes (6.3.3)

/** A recipe as the window needs it: the system's verdict plus the record it came from. */
export interface CraftRecipeData {
  row: RecipeRow;
  def: RecipeDef;
  /** how many of each input the player holds now */
  have: Record<string, number>;
  /** the chance a craft comes out a masterwork at the station in reach (0 away from one) */
  masterwork: number;
  /** a station of the recipe's type and tier is in reach (the masterwork chance is real) */
  atStation: boolean;
  /** the station tier the recipe needs */
  stationTier: number;
  /** skill gain factor of one craft (2.6 four-state curve): 1, 0.5, 0.25 or 0 */
  skillGain: number;
}

export interface CraftAdapter {
  /** The player's livelihoods and drunkenness. */
  livelihoods(view: GameView): CraftingView;
  /** Every recipe the player knows, with what a craft would say now. */
  recipes(view: GameView): CraftRecipeData[];
  /** The stations the player stands at. */
  stations(view: GameView): StationDef[];
  /** Runs one craft command may ask for (the config's cap, 10). */
  maxRuns(view: GameView): number;
  craft(view: GameView, recipeId: string, runs: number): Commands;
}

// ---------------------------------------------------------------------------
// ui_win_gather: the node panel (6.3.4)

/** A node in reach: the system's verdict plus the record and the taint of its place. */
export interface GatherNodeData {
  row: NodeRow;
  def: GatherNodeDef;
  /** the taint grade 0 to 3 of what it gives here */
  taint: number;
  /** the tool tier the player brings for this node's livelihood (0: none) */
  toolTier: number;
  /** the player's skill tier in its livelihood */
  skillTier: number;
  /** full yield and signed rare finds (both tiers reach the node's) */
  full: boolean;
  /** game days until it gives again, null when it is ready, -1 until content resets it */
  readyDays: number | null;
}

export interface GatherAdapter {
  /** The nodes whose places the player stands at. */
  nodes(view: GameView): GatherNodeData[];
  gather(view: GameView, nodeId: string): Commands;
}

// ---------------------------------------------------------------------------
// ui_hud_dungeon and ui_win_dungeon: the field bar and the dungeon list (5.2, 6.3.10)

export interface DungeonAdapter {
  /** The field status bar of the player's visit, or null outside every dungeon. */
  field(view: GameView): DungeonFieldView | null;
  /** The dungeons the player has entered at least once. */
  dungeons(view: GameView): DungeonListEntry[];
  setDisposition(view: GameView, dungeonId: string, choice: Choice): Commands;
}

// ---------------------------------------------------------------------------
// ui_win_beasts: beast companions and mounts (6.3.5)

/** A mount the player owns, and whether it is the one being ridden. */
export interface MountRow {
  def: MountDef;
  active: boolean;
}

export interface BeastsAdapter {
  pets(view: GameView): BeastView[];
  mounts(view: GameView): MountRow[];
  ride(view: GameView, mountId: string | null): Commands;
  release(view: GameView, companionId: string): Commands;
}

// ---------------------------------------------------------------------------
// ui_win_party additions (PK-M1-15's request): the roster and the ironman switch

export interface PartyRosterAdapter {
  /** Every recruited companion and where they are (3.2). */
  roster(view: GameView): CompanionView[];
  /** The ironman switch as the party keeps it (11.4), null in a run without one. */
  ironman(view: GameView): 'on' | 'off' | null;
  /** Turn ironman off for good (one way, 11.4). */
  ironmanOff(view: GameView): Commands;
  /** Send a companion to stand by, or bring one along again. */
  wait(view: GameView, companionId: string, on: boolean): Commands;
  order(view: GameView, companionId: string | undefined, order: PartyOrder): Commands;
}
