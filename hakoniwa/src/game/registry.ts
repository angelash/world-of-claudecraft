// Discover every game system under src/systems/*/index.ts (each exports `system`).
// Adding a system never edits a shared list. Each system's hour-coarse skip handler
// (registered with registerSkipHandler when its module loads) is attached here.

import type { GameSystem } from '../core/system';
import { attachSkipHandlers } from '../systems/travel/skip_registry';

const modules = import.meta.glob<{ system?: GameSystem }>('../systems/*/index.ts', { eager: true });

export function allSystems(): GameSystem[] {
  return attachSkipHandlers(
    Object.keys(modules)
      .sort()
      .map((k) => modules[k]?.system)
      .filter((s): s is GameSystem => !!s)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
  );
}
