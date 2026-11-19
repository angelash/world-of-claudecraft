// When the act-1 windows open (ux_and_onboarding.md 1.5, UX-8 "先看见，后获得"): a window
// appears in the menu bar and the window ring only once the player has met what it is about,
// never as an empty shell, and from then on it stays (an opening is never taken back):
// - `ui_win_party`: the first companion or servant (契约之门, Yeyu);
// - `ui_win_deeds`: the first deed is recorded;
// - `ui_win_codex`: the third kind of monster is met;
// - `ui_win_letters`: the first letter arrives;
// - `ui_win_evidence`: the player holds a piece of evidence;
// - `ui_win_dungeon`: the first dungeon or nest is entered;
// - `ui_win_beasts`: a beast companion or a mount;
// - `ui_win_craft`: a livelihood learned, or the player stands at a station.
// The moments are read off the world through the adapters, so they need no world flag of their
// own (24.3: the interface's openings are client-side discovery). What has opened is kept in
// the save's client segment (../app/client_segment.ts). The answer is a set of client keys
// (`client.win.<id>`) merged into the flags the window availability reads (window_registry.ts
// `requiresAll`); they never reach the world. `ui_win_board` and `ui_win_gather` are not
// menu-bar windows: they open where the board or the node stands (player_input.ts). Pure;
// Node-tested.

import type { FlagValue } from '../../core/contracts';
import type { ClientAdapters } from '../view/adapters';
import type { GameView } from '../view/game_view';

export const UNLOCK_WINDOWS = [
  'party',
  'deeds',
  'codex',
  'letters',
  'evidence',
  'dungeon',
  'beasts',
  'craft',
] as const;
export type UnlockWindow = (typeof UNLOCK_WINDOWS)[number];

/** The client key that opens a window (never a world flag). */
export function unlockKey(id: UnlockWindow): `client.win.${UnlockWindow}` {
  return `client.win.${id}`;
}

export function isUnlockWindow(id: string): id is UnlockWindow {
  return (UNLOCK_WINDOWS as readonly string[]).includes(id);
}

/** Monsters met before the bestiary opens (1.5: "遇到第三种魔物"). */
export const CODEX_MONSTERS = 3;

type Probe = (view: GameView, a: ClientAdapters) => boolean;

const PROBES: Readonly<Record<UnlockWindow, Probe>> = {
  party: (v, a) => (a.partyRoster?.roster(v).length ?? a.party?.companions(v).length ?? 0) > 0,
  deeds: (v, a) => (a.deeds?.book(v).deeds ?? []).some((d) => d.earnedTick !== null),
  codex: (v, a) => (a.codex?.page(v, 'monsters').length ?? 0) >= CODEX_MONSTERS,
  letters: (v, a) => (a.letters?.inbox(v).length ?? 0) > 0,
  evidence: (v, a) => (a.evidence?.evidence(v).length ?? 0) > 0,
  dungeon: (v, a) => (a.dungeon?.dungeons(v).length ?? 0) > 0,
  beasts: (v, a) => (a.beasts?.pets(v).length ?? 0) > 0 || (a.beasts?.mounts(v).length ?? 0) > 0,
  craft: (v, a) =>
    (a.craft?.livelihoods(v).skills.length ?? 0) > 0 || (a.craft?.stations(v).length ?? 0) > 0,
};

/**
 * The windows the player has met, as client keys set to true. Windows in `known` are kept
 * without running their probe again.
 */
export function windowUnlocks(
  view: GameView,
  adapters: ClientAdapters,
  known: ReadonlySet<UnlockWindow> = new Set(),
): Record<string, true> {
  const out: Record<string, true> = {};
  for (const id of UNLOCK_WINDOWS) {
    if (known.has(id) || PROBES[id](view, adapters)) out[unlockKey(id)] = true;
  }
  return out;
}

/**
 * The flags window availability reads: the world's flags plus the discovery keys. Openings
 * are sticky; the probes of windows not yet open run at most once per tick.
 */
export class AvailabilityFlags {
  private tick = -1;
  private flags: Readonly<Record<string, FlagValue>> = {};
  private base: Readonly<Record<string, FlagValue>> | null = null;
  private readonly opened = new Set<UnlockWindow>();

  constructor(
    private readonly view: GameView,
    private readonly adapters: ClientAdapters,
  ) {}

  current(): Readonly<Record<string, FlagValue>> {
    const world = this.view.flags();
    if (this.tick !== this.view.tick || this.base !== world) {
      this.tick = this.view.tick;
      this.base = world;
      const keys = windowUnlocks(this.view, this.adapters, this.opened);
      for (const id of UNLOCK_WINDOWS) if (keys[unlockKey(id)]) this.opened.add(id);
      this.flags = { ...world, ...keys };
    }
    return this.flags;
  }

  /** The windows opened so far (the save's client segment). */
  snapshot(): UnlockWindow[] {
    return UNLOCK_WINDOWS.filter((id) => this.opened.has(id));
  }

  /** Restore the openings of a loaded save; unknown ids are ignored. */
  restore(raw: unknown): void {
    if (!Array.isArray(raw)) return;
    for (const id of raw) if (typeof id === 'string' && isUnlockWindow(id)) this.opened.add(id);
    this.tick = -1;
  }
}
