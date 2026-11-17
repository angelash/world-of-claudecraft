// The skip-handler registry (travel_and_exploration.md 7.5, 9.1): each system registers
// its hour-coarse handler by system id when its module loads, and the game layer attaches
// the handlers to the systems it runs (GameSystem.skip), so the engine calls them in
// phase order on every coarse step. A leaf module (core types only), so any system can
// import it without an import cycle through the travel system.

import type { GameSystem, SkipStep, SystemContext } from '../../core/system';

/** One hour-coarse step of a system: settle what its ticks would have settled. */
export type SkipHandler = (ctx: SystemContext, step: SkipStep) => void;

const handlers = new Map<string, SkipHandler>();

/** Register the hour-coarse skip handler of a system (one per system id; the last wins). */
export function registerSkipHandler(systemId: string, fn: SkipHandler): void {
  handlers.set(systemId, fn);
}

/** The registered handler of a system, if any. */
export function skipHandlerOf(systemId: string): SkipHandler | undefined {
  return handlers.get(systemId);
}

/** Ids of every system with a registered handler, sorted. */
export function skipHandlerIds(): string[] {
  return [...handlers.keys()].sort();
}

/**
 * The systems with their registered skip handlers attached (copies; a system that already
 * has a `skip` of its own keeps it).
 */
export function attachSkipHandlers(systems: readonly GameSystem[]): GameSystem[] {
  return systems.map((s) => {
    const fn = s.skip ? undefined : handlers.get(s.id);
    return fn ? { ...s, skip: fn } : s;
  });
}
