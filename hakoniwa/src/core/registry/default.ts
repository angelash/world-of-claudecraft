// The registry instance over data/registry/vars.json (generated from
// docs/40_design/world_state_registry.md by tools/registry/build.ts). Static data, built
// once on first use; the evaluator, the flag guard and content validation share it.

import vars from '../../../data/registry/vars.json';
import { FlagRegistry } from './registry';
import type { RegistryData } from './types';

let instance: FlagRegistry | undefined;

export function defaultRegistry(): FlagRegistry {
  instance ??= new FlagRegistry(vars as unknown as RegistryData);
  return instance;
}

/** The registry data itself (the content pack exposes it as table `registry`). */
export function registryData(): RegistryData {
  return vars as unknown as RegistryData;
}
