// The rename entries the world-state variable registry implies (data/registry/vars.json,
// PK-M0-27): every alias spelling of a flag name (exact, pattern and numeric conversion),
// every key alias of an id domain (npc, faction), every renamed quest data id and every
// enum value alias. data/registry/renames.json carries them as rename version 1, so saves
// written before the registry load under canonical names. The table is append-only: when
// the registry gains an alias, tests/save_renames.test.ts lists the entries this function
// gives that the table lacks, to be added with the next rename version.

import type { FlagRegistry } from '../registry';
import type { FlagRename, FlagValueRename, IdRename, RenameEntry } from './renames';

const SLOT = /<[^<>]+>/g;
const slots = (s: string): number => (s.match(SLOT) ?? []).length;

/** Rename entries for every alias the registry lists, tagged `since`. */
export function registryRenames(registry: FlagRegistry, since: number): RenameEntry[] {
  const data = registry.data;
  const exact: FlagRename[] = [];
  const patterns: FlagRename[] = [];
  const seen = new Set<string>();
  const concrete = (from: string): void => {
    if (seen.has(from)) return;
    seen.add(from);
    const r = registry.resolve(from);
    if (!r?.alias || r.condition !== null || r.name.includes('<') || r.name === from) return;
    const e: FlagRename = { since, kind: 'flag', from, to: r.name };
    if (r.conversion) {
      e.scale = r.conversion.scale;
      e.offset = r.conversion.offset;
    }
    exact.push(e);
  };
  const pattern = (from: string, to: string, conv?: { scale: number; offset: number }): void => {
    if (to.includes(' ') || slots(to) > slots(from)) return;
    // A later rule with the same spelling and target never applies (the first one wins).
    if (patterns.some((p) => p.from === from && p.to === to)) return;
    const e: FlagRename = { since, kind: 'flag', from, to };
    if (conv) {
      e.scale = conv.scale;
      e.offset = conv.offset;
    }
    patterns.push(e);
  };
  // The registry's own order: aliases of the names, then of the families, then the
  // pattern rules, then the numeric conversions (patterns apply first come, first served).
  for (const v of [...data.vars, ...data.families]) {
    for (const a of v.aliases) {
      const eq = a.indexOf('=');
      const from = eq > 0 ? a.slice(0, eq) : a;
      const to = eq > 0 ? a.slice(eq + 1) : v.name;
      if (from.includes('<')) pattern(from, to);
      else concrete(from);
    }
  }
  for (const p of data.patternAliases ?? []) pattern(p.from, p.to);
  for (const c of data.conversions) {
    if (c.from.includes('<')) pattern(c.from, c.to, { scale: c.scale, offset: c.offset });
    else concrete(c.from);
  }
  exact.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));

  const ids: IdRename[] = [];
  for (const domain of Object.keys(data.keyAliases).sort()) {
    const table = data.keyAliases[domain] ?? {};
    for (const from of Object.keys(table).sort()) {
      ids.push({ since, kind: domain, from, to: table[from] as string });
    }
  }
  for (const from of Object.keys(data.questIds).sort()) {
    ids.push({ since, kind: 'quest', from, to: data.questIds[from] as string });
  }

  const values: FlagValueRename[] = [];
  for (const flag of Object.keys(data.valueAliases).sort()) {
    const table = data.valueAliases[flag] ?? {};
    const kind = valueKind(registry, flag);
    for (const from of Object.keys(table).sort()) {
      const to = table[from] as string;
      const typed = (kind === 'bool' || kind === 'flag') && (to === 'true' || to === 'false');
      values.push({ since, kind: 'flag_value', flag, from, to: typed ? to === 'true' : to });
    }
  }
  return [...exact, ...patterns, ...ids, ...values];
}

/** The variable kind behind a value-alias key (a name, or a family written `prefix.*`). */
function valueKind(registry: FlagRegistry, flag: string): string | undefined {
  if (!flag.endsWith('.*')) return registry.resolve(flag)?.def.kind;
  const fam = registry.data.families.find((f) => f.name.replace(/<[^<>]+>.*$/, '*') === flag);
  return fam?.kind;
}
