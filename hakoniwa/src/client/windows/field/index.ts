// The field windows (ux_and_onboarding.md 6.2.7, 6.3.3 to 6.3.5, 6.3.7, 6.3.10): the
// commission board, livelihoods and crafting, the gathering panel, the dungeon list, beast
// companions and mounts, and the party roster. Each is a pure model plus a thin painter; the
// window registry maps their ids to these factories.

import './field.css';

export { boardWindow } from './board_window';
export { craftWindow, gatherWindow } from './craft_window';
export { beastsWindow, dungeonWindow } from './dungeon_window';
export { partyWindow } from './party_window';
