// What a settle depends on, computed once per content object: the variable names the
// records' conditions read (with the inputs of derived quantities they name), so a flag
// change marks the slice dirty only when a condition can see it (catalog_deeds_titles.md
// 1.3: re-evaluate on a change of a referenced variable). Pure.

import type { ContentMap } from '../../core/contracts';
import { defaultRegistry } from '../../core/registry';
import { checkCondition, referencedVars } from '../quests/conditions';

export interface Watch {
  /** variable names a records condition reads */
  names: ReadonlySet<string>;
  /** a deed counts kills (a `stat` on `kills`), so every kill can change a trigger */
  kills: boolean;
}

/** Every condition of the records content, in table order. */
export function recordConditions(content: ContentMap): string[] {
  const out: string[] = [];
  const push = (s: string | undefined) => {
    if (s && s.trim() !== '') out.push(s);
  };
  for (const d of content.deeds ?? []) {
    push(d.when);
    push(d.branch?.when);
  }
  for (const t of content.titles ?? []) {
    push(t.grant?.when);
    push(t.lose?.when);
  }
  for (const e of content.codexEntries ?? []) push(e.when);
  for (const l of content.letters ?? []) {
    push(l.deliver.when);
    for (const p of l.body) push(p.when);
    for (const r of l.replies ?? []) push(r.when);
  }
  const cfg = content.recordsConfig;
  if (cfg) {
    push(cfg.pillar.requires);
    for (const t of cfg.pillar.tiers) push(t.when);
  }
  return out;
}

function addName(name: string, out: Set<string>, depth: number): void {
  if (out.has(name)) return;
  out.add(name);
  const r = defaultRegistry().resolve(name);
  if (!r) return;
  out.add(r.name);
  const derive = r.family ? null : r.def.derive;
  if (derive && depth < 4 && checkCondition(derive) === null) {
    for (const v of referencedVars(derive)) addName(v, out, depth + 1);
  }
  if (r.condition !== null && depth < 4 && checkCondition(r.condition) === null) {
    for (const v of referencedVars(r.condition)) addName(v, out, depth + 1);
  }
}

const cache = new WeakMap<object, Watch>();

export function watchOf(content: ContentMap): Watch {
  let w = cache.get(content);
  if (!w) {
    const names = new Set<string>();
    for (const c of recordConditions(content)) {
      if (checkCondition(c) !== null) continue;
      for (const v of referencedVars(c)) addName(v, names, 0);
    }
    const kills = (content.deeds ?? []).some((d) => d.stat?.key.startsWith('kills') === true);
    w = { names, kills };
    cache.set(content, w);
  }
  return w;
}

const signatures = new WeakMap<object, string>();

/**
 * A short fingerprint of the records content (deeds, titles, codex notes, letters, the
 * tunables): a loaded save whose slice settled under another fingerprint is re-checked once.
 */
export function contentSignature(content: ContentMap): string {
  let sig = signatures.get(content);
  if (sig === undefined) {
    const text = JSON.stringify([
      content.deeds ?? [],
      content.titles ?? [],
      content.codexEntries ?? [],
      content.letters ?? [],
      content.recordsConfig ?? null,
    ]);
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    sig = (h >>> 0).toString(16).padStart(8, '0');
    signatures.set(content, sig);
  }
  return sig;
}
