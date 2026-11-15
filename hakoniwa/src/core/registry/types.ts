// Shape of data/registry/vars.json, the world-state variable registry generated from
// docs/40_design/world_state_registry.md (sections 6 to 9) by tools/registry/build.ts.
// Every name a condition reads or an effect writes resolves here (D-076).

import type { FlagValue } from '../contracts';

/** Section 3 types: flag (monotone bool), bool, int, num, enum, set, text, tick; any = mixed fields. */
export type VarKind = 'flag' | 'bool' | 'int' | 'num' | 'enum' | 'set' | 'text' | 'tick' | 'any';

/** Section 2.2 scopes. */
export type VarScope =
  | 'builtin'
  | 'global'
  | 'act_flag'
  | 'act_exit'
  | 'family'
  | 'mirror'
  | 'signal';

/** One canonical variable (an exact name) or one family pattern (a name with <slots>). */
export interface VarDef {
  /** Canonical name; for a family the pattern, e.g. `trust.<npc>`. */
  name: string;
  kind: VarKind;
  scope: VarScope;
  /** Inclusive bounds; either end null when open; null when unbounded. */
  range: [number | null, number | null] | null;
  step: number | null;
  /** Value when unwritten (null: unwritten reads as undefined). */
  default: FlagValue | null;
  /** Enum value set (null: open). */
  values: string[] | null;
  /** Spellings that load as this name (exact; a family alias may hold <slots>). */
  aliases: string[];
  /** Systems, `content` (data effects) and `compute:<fn>` that may write it. */
  writers: string[];
  readers: string[];
  /** Formula of a derived quantity (never written by content). */
  derive: string | null;
  /** Story flags only turn true. */
  monotone: boolean;
  /** Act of an act-prefixed name: p_ 0, a1_ to a6_ 1 to 6, ep_ 7. */
  act: number | null;
  visibility: 'player' | 'hidden';
  ai: 'prompt' | 'ledger' | 'none';
  /** Text key of the display name (D-077). */
  label: string;
  /** Registry document section the row comes from. */
  source: string;
}

/** One placeholder of a family pattern and the keys it accepts. */
export interface FamilySlot {
  /** Placeholder as written in the pattern, e.g. `npc` for `trust.<npc>`. */
  name: string;
  /** Key domain resolved from content (see RegistryData.keyDomains), or null. */
  domain: string | null;
  /** Keys listed in the registry row (null: the domain or any segment). */
  keys: string[] | null;
}

export interface FamilyDef extends VarDef {
  slots: FamilySlot[];
}

/** A numeric alias: canonical = alias * scale + offset (section 7.3, 7.4). */
export interface ConversionDef {
  from: string;
  to: string;
  scale: number;
  offset: number;
}

export interface RegistryData {
  version: number;
  source: string;
  vars: VarDef[];
  families: FamilyDef[];
  /** Enum value aliases per canonical name or family pattern with `*` (`verdict.*`). */
  valueAliases: Record<string, Record<string, string>>;
  conversions: ConversionDef[];
  /**
   * Spelling rules whose target is a pattern rather than one family, applied slot by
   * slot (`prologue.<attr>` to `p_<attr>`, `<npc>.<attr>` to `npc.<npc>.<attr>`); a rule
   * only applies when the name it produces is registered.
   */
  patternAliases: { from: string; to: string }[];
  /** Key aliases per key domain (section 7.1 person codes, rep faction spellings). */
  keyAliases: Record<string, Record<string, string>>;
  /** Existing quest data ids to their section 6.2 data ids. */
  questIds: Record<string, string>;
  /** Where each key domain's members come from (`table#field` or a literal list). */
  keyDomains: Record<string, string | string[]>;
}
