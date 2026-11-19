// First-clear and discovery rewards are separate from cosmetic deeds and titles.
export type DiscoveryKind = 'map' | 'region' | 'landmark' | 'vista' | 'secret' | 'entrance';
export type XpTrigger =
  | { kind: 'discovery'; mapId: string; location?: string; discovery: DiscoveryKind }
  | { kind: 'boss'; monsterId: string; mapId: string }
  | { kind: 'dungeon'; dungeonId: string; mapId: string }
  | { kind: 'nest'; nestId: string; mapId: string };

export interface XpReward {
  /** A saved settlement id; any rename needs an explicit xpReward rename entry. */
  id: string;
  act: number;
  share: 'first' | 'explore';
  level: number;
  weight: number;
  expected: 1 | 0.6;
  amount: number;
  trigger: XpTrigger;
}

export interface XpCalibration {
  act: number;
  share: 'first' | 'explore';
  budget: number;
  raw: number;
  coefficient: number;
  rounded: number;
  calibration: number;
  expected: number;
}

export interface XpRewardsData {
  version: 1;
  entries: XpReward[];
  calibration: XpCalibration[];
}

export interface XpLedger {
  /** granted once, or lost because another faction completed the first clear */
  settled: Record<string, { tick: number; amount: number }>;
  /** current vista's uninterrupted dwell, absent outside a declared vista rectangle */
  vista?: { id: string; since: number; mapId: string; x: number; y: number };
  /** unchanged position outside a vista needs no repeated map-location scan */
  position?: { mapId: string; x: number; y: number; act: string };
}

declare module '../../core/contracts' {
  interface ContentMap {
    xpRewards?: XpRewardsData;
  }
}
