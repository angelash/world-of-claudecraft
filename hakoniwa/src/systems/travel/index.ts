// Travel system (src/systems/travel/, travel_and_exploration.md 9.1): the time-skip kernel
// (skip.ts: the short and long tiers, the skip clock, interrupts and the summary; the
// handler registry registerSkipHandler), the rest rules (rest.ts: canWait, canSleep, the
// night ambush) and the time commands (system.ts). Region-map travel, fog, discovery and
// gates (graph, planner, events, discovery, fog, gates) join here in PK-M1-17.
// Other systems register their hour-coarse handlers through skip_registry.ts (a leaf
// module) and report interrupts with the time.interrupt event; they need not import this
// barrel.

export * from './rest';
export * from './skip';
export { system } from './system';
export * from './types';
