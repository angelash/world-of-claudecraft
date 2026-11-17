// Window registration: maps every catalogue id to its factory. Gameplay windows read
// their data and build their commands through the adapters in ctx.adapters.

import { battleWindow } from './battle_window';
import { characterWindow } from './character_window';
import { debugWindow } from './debug_window';
import { companyWindow, tradeWindow } from './economy_windows';
import { helpWindow } from './help_window';
import { inventoryWindow } from './inventory_window';
import { mapWindow } from './map_window';
import { settingsWindow } from './settings_window';
import { menuWindow, savesWindow } from './simple_windows';
import { goddessWindow, partyWindow, rumorsWindow } from './social_windows';
import { doorsWindow, questsWindow } from './story_windows';
import { strategyWindow } from './strategy_window';
import { territoryWindow } from './territory_window';
import type { WindowContext } from './window_context';
import type { WindowContent, WindowManager } from './window_manager';
import { WINDOW_DEFS, type WindowId } from './window_registry';

export type { SessionActions, WindowContext } from './window_context';
export { WindowManager } from './window_manager';
export * from './window_registry';

const FACTORIES: Record<WindowId, (ctx: WindowContext) => WindowContent> = {
  character: characterWindow,
  doors: doorsWindow,
  inventory: inventoryWindow,
  quests: questsWindow,
  rumors: rumorsWindow,
  map: mapWindow,
  party: partyWindow,
  company: companyWindow,
  territory: territoryWindow,
  battle: battleWindow,
  strategy: strategyWindow,
  goddess: goddessWindow,
  saves: savesWindow,
  menu: menuWindow,
  help: () => helpWindow(),
  debug: debugWindow,
  trade: tradeWindow,
  settings: settingsWindow,
};

export function registerWindows(wm: WindowManager, ctx: WindowContext): void {
  for (const def of WINDOW_DEFS) {
    if (def.devOnly && !ctx.devMode) continue;
    const make = FACTORIES[def.id];
    wm.register(def.id, () => make(ctx));
  }
}
