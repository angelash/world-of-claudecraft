// The tide-night view adapter (PK-M1-52's request; act1_borderstone.md 8): the written night
// now running or last run (`tideView`, src/systems/tide), with the night's lines, phases and
// the gap bands its settlement uses, and every name already rendered for display. The HUD's
// tide panel (../hud/tide_panel_model.ts) reads only this. Implemented in
// src/client/adapters/tide.ts.

import type { TideView } from '../../systems/tide';
import type { GameView } from './game_view';

export interface TideLineInfo {
  id: string;
  /** the line's place, as the map names it */
  name: string;
  /** a face of the town the surge can hit (not a separate front) */
  face: boolean;
}

export interface TideData {
  view: TideView;
  /** the map the night is fought on: the panel shows only there */
  mapId: string;
  /** the night's display name */
  name: string;
  lines: TideLineInfo[];
  /** phase ids in order with their stage numbers */
  phases: { id: string; stage: number }[];
  /** the surge phase's id (only the weakest face is pressed), null when the night has none */
  surgePhase: string | null;
  /** gap floors of the settlement: badly hurt from `injury`, the line falls from `death` */
  gaps: { injury: number; death: number };
  /** a place's display name (the buildings behind a line) */
  placeName(id: string): string;
  /** a person's display name (the named dead and injured) */
  personName(id: string): string;
}

export interface TideAdapter {
  /** the running or last written night, or null when none was ever fought */
  tide(view: GameView): TideData | null;
}
