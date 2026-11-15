// Registry pack: the world-state variable registry (data/registry/vars.json, generated
// from docs/40_design/world_state_registry.md by tools/registry/build.ts) as content
// table `registry`, and the section 9.3 rules over the merged content as this pack's
// validator (errors only; tests/registry.test.ts prints the warnings).

import { defaultRegistry, FlagRegistry, registryData } from '../../core/registry';
import type { RegistryData } from '../../core/registry/types';
import type { ContentPack } from '../pack';
import { registryErrors } from '../registry_rules';

declare module '../../core/contracts' {
  interface ContentMap {
    registry: RegistryData;
  }
}

export const pack: ContentPack = {
  id: 'registry',
  tables: { registry: registryData() },
  validate: (content) => {
    const data = content.registry;
    const registry = !data || data === registryData() ? defaultRegistry() : new FlagRegistry(data);
    return registryErrors(content, registry);
  },
};
