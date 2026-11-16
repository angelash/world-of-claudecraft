// The world-state variable registry at run time (world_state_registry.md 9.4): resolve a
// flag name to its canonical name, its definition and, for a numeric alias, the
// conversion; give the default of an unwritten name; map value aliases to canonical
// values. Pure and deterministic (static data in, answers out); results are cached per
// name. The default instance over data/registry/vars.json is in ./default.ts.

import type { FlagValue } from '../contracts';
import type { FamilyDef, RegistryData, VarDef } from './types';

/** A name resolved against the registry. */
export interface ResolvedName {
  /** Canonical name (a family member is concrete, e.g. `trust.oola`). */
  name: string;
  /** The exact definition, or the family's definition for a member. */
  def: VarDef;
  family: FamilyDef | null;
  /** Slot values of a family member, in slot order. */
  keys: string[];
  /** The input was an alias spelling. */
  alias: boolean;
  /** Numeric alias: canonical = written * scale + offset. */
  conversion: { scale: number; offset: number } | null;
  /** The alias stands for a condition (`bond.<npc>.<n>` reads `trust.<npc> >= <n>`). */
  condition: string | null;
}

interface CompiledPattern {
  re: RegExp;
  /** Target with `<0>`, `<1>` ... standing for the captured slots in order. */
  target: string;
  conversion: { scale: number; offset: number } | null;
  condition: boolean;
}

const SEGMENT = '([A-Za-z0-9_-]+)';

function escapeRe(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\*]/g, '\\$&');
}

/** `trust.<npc>` as a regex with one capture per slot. */
function patternRe(pattern: string): RegExp {
  return new RegExp(
    `^${pattern
      .split(/<[^<>]+>/)
      .map(escapeRe)
      .join(SEGMENT)}$`,
  );
}

/** Replace the slots of `target` in order with the captured keys. */
function fill(target: string, keys: readonly string[]): string {
  let i = 0;
  return target.replace(/<[^<>]+>/g, () => keys[i++] ?? '');
}

/** Section 2.1: lowercase segments, an entity-code segment may start upper case or a digit. */
export const NAME_RE = /^[a-z][a-z0-9_]*(\.[A-Za-z0-9][A-Za-z0-9_]*){0,3}$/;
export const NAME_MAX = 64;

export class FlagRegistry {
  readonly data: RegistryData;
  private readonly exact = new Map<string, VarDef>();
  private readonly families: { def: FamilyDef; re: RegExp }[] = [];
  private readonly exactAliases = new Map<string, string>();
  private readonly patterns: CompiledPattern[] = [];
  private readonly conversionsExact = new Map<
    string,
    { to: string; scale: number; offset: number }
  >();
  private readonly cache = new Map<string, ResolvedName | null>();

  constructor(data: RegistryData) {
    this.data = data;
    for (const v of data.vars) this.exact.set(v.name, v);
    for (const f of data.families) this.families.push({ def: f, re: patternRe(f.name) });
    const addAlias = (alias: string, canonical: string): void => {
      if (alias.includes('<')) {
        const cond = canonical.includes(' ');
        this.patterns.push({
          re: patternRe(alias),
          target: canonical,
          conversion: null,
          condition: cond,
        });
      } else if (!this.exactAliases.has(alias)) {
        this.exactAliases.set(alias, canonical);
      }
    };
    for (const v of [...data.vars, ...data.families]) {
      for (const a of v.aliases) {
        const eq = a.indexOf('=');
        if (eq > 0) addAlias(a.slice(0, eq), a.slice(eq + 1));
        else addAlias(a, v.name);
      }
    }
    for (const p of data.patternAliases ?? []) addAlias(p.from, p.to);
    for (const c of data.conversions) {
      if (c.from.includes('<')) {
        this.patterns.push({
          re: patternRe(c.from),
          target: c.to,
          conversion: { scale: c.scale, offset: c.offset },
          condition: false,
        });
      } else {
        this.conversionsExact.set(c.from, { to: c.to, scale: c.scale, offset: c.offset });
      }
    }
  }

  /** Resolve a name; null when it is neither registered nor an alias of a registered name. */
  resolve(name: string): ResolvedName | null {
    if (this.cache.has(name)) return this.cache.get(name) ?? null;
    const out = this.lookup(name);
    this.cache.set(name, out);
    return out;
  }

  /** The canonical spelling (an unregistered name comes back unchanged). */
  canonical(name: string): string {
    return this.resolve(name)?.name ?? name;
  }

  isRegistered(name: string): boolean {
    return this.resolve(name) !== null;
  }

  /** Registered under exactly this spelling (not through an alias). */
  isCanonical(name: string): boolean {
    const r = this.resolve(name);
    return r !== null && !r.alias;
  }

  /** The value of an unwritten name (undefined when the registry gives none). */
  defaultOf(name: string): FlagValue | undefined {
    const r = this.resolve(name);
    if (!r || r.condition !== null) return undefined;
    const d = r.def.default;
    return d === null ? undefined : d;
  }

  /** The canonical spelling of an enum value written for `name`. */
  canonicalValue(name: string, value: FlagValue): FlagValue {
    if (typeof value !== 'string') return value;
    const r = this.resolve(name);
    if (!r) return value;
    const table = this.valueAliasesOf(r);
    const mapped = table?.[value];
    if (mapped === undefined) return value;
    if (r.def.kind === 'bool' || r.def.kind === 'flag') {
      if (mapped === 'true') return true;
      if (mapped === 'false') return false;
    }
    return mapped;
  }

  /** Value alias table of a resolved name (by name, by family pattern, or `prefix.*`). */
  valueAliasesOf(r: ResolvedName): Record<string, string> | undefined {
    const va = this.data.valueAliases;
    if (va[r.name]) return va[r.name];
    if (r.family) {
      if (va[r.family.name]) return va[r.family.name];
      const star = r.family.name.replace(/<[^<>]+>.*$/, '*');
      if (va[star]) return va[star];
    }
    return undefined;
  }

  /**
   * The display text of an enum value that was once stored as text (the longest Chinese
   * value alias that maps to it, e.g. p_courtyard_object lamp to 一盏台灯). Transitional
   * until the string tables give var.<name>.<value> keys (D-077); undefined when none.
   */
  valueLabel(name: string, value: string): string | undefined {
    const r = this.resolve(name);
    const table = r ? this.valueAliasesOf(r) : undefined;
    if (!table) return undefined;
    let best: string | undefined;
    for (const [alias, to] of Object.entries(table)) {
      if (to !== value || !/[\u3400-\u9fff]/.test(alias)) continue;
      if (best === undefined || alias.length > best.length) best = alias;
    }
    return best;
  }

  /** The value an alias reader sees for a canonical value (conversion undone). */
  aliasView(r: ResolvedName, value: FlagValue | undefined): FlagValue | undefined {
    if (!r.conversion || typeof value !== 'number') return value;
    return (value - r.conversion.offset) / r.conversion.scale;
  }

  /** The canonical value of a write through an alias (conversion applied). */
  canonicalWrite(r: ResolvedName, value: FlagValue): FlagValue {
    const v =
      r.conversion && typeof value === 'number'
        ? value * r.conversion.scale + r.conversion.offset
        : value;
    return this.canonicalValue(r.name, v);
  }

  // -------------------------------------------------------------------------

  private direct(name: string): ResolvedName | null {
    const def = this.exact.get(name);
    if (def) {
      return { name, def, family: null, keys: [], alias: false, conversion: null, condition: null };
    }
    for (const { def: fam, re } of this.families) {
      const m = re.exec(name);
      if (!m) continue;
      const keys = m.slice(1);
      let ok = true;
      let aliased = false;
      const canonKeys = keys.map((k, i) => {
        const slot = fam.slots[i];
        if (!slot) return k;
        const domain = slot.domain ?? slot.name;
        const ka =
          this.data.keyAliases[domain]?.[k] ??
          (domain === 'quest' ? this.data.questIds[k] : undefined);
        const key = ka ?? k;
        if (ka !== undefined) aliased = true;
        if (slot.keys && !slot.keys.includes(key)) ok = false;
        return key;
      });
      if (!ok) continue;
      if (aliased) {
        const canonName = fill(fam.name, canonKeys);
        return {
          name: canonName,
          def: fam,
          family: fam,
          keys: canonKeys,
          alias: true,
          conversion: null,
          condition: null,
        };
      }
      return { name, def: fam, family: fam, keys, alias: false, conversion: null, condition: null };
    }
    return null;
  }

  private lookup(name: string): ResolvedName | null {
    const asAlias = (
      target: string,
      conversion: ResolvedName['conversion'],
    ): ResolvedName | null => {
      const t = this.direct(target);
      return t ? { ...t, alias: true, conversion } : null;
    };
    // a canonical exact name first, then a listed alias (some aliases have the shape of a
    // family member, e.g. evidence.oracle_text), then the families
    if (this.exact.has(name)) return this.direct(name);
    const exactAlias = this.exactAliases.get(name);
    if (exactAlias !== undefined) {
      if (exactAlias.includes(' ')) return this.conditionAlias(name, exactAlias);
      const hit = asAlias(exactAlias, null);
      if (hit) return hit;
    }
    const own = this.direct(name);
    if (own) return own;
    const conv = this.conversionsExact.get(name);
    if (conv) {
      const hit = asAlias(conv.to, { scale: conv.scale, offset: conv.offset });
      if (hit) return hit;
    }
    // quest data ids renamed by section 6.2
    const q = /^quest\.([A-Za-z0-9_]+)((?:\.[A-Za-z0-9_]+)*)$/.exec(name);
    if (q) {
      const renamed = this.data.questIds[q[1] as string];
      if (renamed) {
        const hit = asAlias(`quest.${renamed}${q[2] ?? ''}`, null);
        if (hit) return hit;
      }
    }
    for (const p of this.patterns) {
      const m = p.re.exec(name);
      if (!m) continue;
      const target = fill(p.target, m.slice(1));
      if (p.condition) return this.conditionAlias(name, target);
      const hit = this.direct(target);
      if (hit) return { ...hit, alias: true, conversion: p.conversion };
    }
    return null;
  }

  private conditionAlias(name: string, condition: string): ResolvedName | null {
    const head = condition.split(' ')[0] as string;
    const t = this.direct(head);
    if (!t) return null;
    return { ...t, name, alias: true, conversion: null, condition };
  }
}
