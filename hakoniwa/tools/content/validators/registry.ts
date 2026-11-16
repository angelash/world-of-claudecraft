// V4 variable registry (release_engineering.md 7.4, D-076): every flag and variable the
// content reads or writes is registered, conditions parse, writers and readers agree. The
// rules are world_state_registry.md 9.3 (rules 1 to 14) as implemented by
// src/content/registry_rules.ts over the reference walk of src/content/registry_refs.ts;
// errors block, warnings go to the report. Aliases become errors from M2.

import { registryProblems } from '../../../src/content/registry_rules';
import { defaultRegistry, FlagRegistry, registryData } from '../../../src/core/registry';
import type { Finding, ValidationInput, Validator } from './types';

export const registryValidator: Validator = {
  id: 'V4',
  title: 'variable registry',
  run(input: ValidationInput): Finding[] {
    const data = (input.content as { registry?: ReturnType<typeof registryData> }).registry;
    const registry = !data || data === registryData() ? defaultRegistry() : new FlagRegistry(data);
    return registryProblems(input.content, registry, { milestone: input.milestone }).map(
      (p): Finding => ({ level: p.level, message: `rule ${p.rule}: ${p.message}` }),
    );
  },
};
