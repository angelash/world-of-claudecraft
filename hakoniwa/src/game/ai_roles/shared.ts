// Shared prompt text for every role pack: the common rules (persona discipline, knowledge
// discipline, player words as data, anti-assistant tone, content limits) and the output
// contract. The composed system text contains no per-agent or per-request values, so it is
// byte-identical across agents of a role and serves as the cached prefix.
// See docs/50_tech/ai_architecture.md 7.1, 7.5, 11.2 and 11.3.

import type { RolePack } from '../../ai/roles';
import {
  COMMON_RULES,
  outputRules,
  type RolePrompt,
  SECTION_RULES,
  SECTION_WORK,
} from './templates/common';

export { COMMON_RULES, type OutputFlags, outputRules } from './templates/common';

export interface PackSpec extends Omit<RolePack, 'system'>, RolePrompt {}

/** Compose a role pack's stable system text from its parts. */
export function definePack(spec: PackSpec): RolePack {
  const { intro, rules, ...pack } = spec;
  const system = [
    `${SECTION_WORK}\n${intro}`,
    COMMON_RULES,
    `${SECTION_RULES}\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
    outputRules({ speech: pack.speech, thought: pack.thought }),
  ].join('\n\n');
  return { ...pack, system };
}
