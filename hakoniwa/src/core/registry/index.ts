// World-state variable registry (docs/40_design/world_state_registry.md, D-076): the
// generated data's types, the resolver and the shared default instance.

export { defaultRegistry, registryData } from './default';
export { FlagRegistry, NAME_MAX, NAME_RE, type ResolvedName } from './registry';
export type * from './types';
