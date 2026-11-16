export * from './ai_port';
export * from './content_key';
export * from './contracts';
export * from './engine';
export * from './rng';

import './shared_events';

export * from './save';
export * from './system';
export * from './text';
export * from './time';
export * from './world';

import type { CommandSource } from './contracts';

/** Command source for commands a system dispatches on its own behalf. */
export function systemSource(system: string): CommandSource {
  return { type: 'system', system };
}
