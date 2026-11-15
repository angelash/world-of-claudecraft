// Battle state hash and divergence report (warfare_rts.md 5.4 "确定性"): a fingerprint of the
// fields that decide a battle, recorded every few kernel steps, plus a field-by-field
// comparison that names the first value two runs disagree on. Pure; used by the kernel and
// by replay and determinism tests.

import type { BattleState } from './types';

/** Record a hash every this many kernel steps (one battle second at 5 steps a second). */
export const HASH_EVERY = 5;
/** Keep this many recent hashes on the battle state. */
export const HASH_KEEP = 8;

/** Decisive fields only: positions are rounded so render-only jitter cannot matter. */
export function syncFields(state: BattleState): [string, number | string | boolean][] {
  const out: [string, number | string | boolean][] = [
    ['step', state.step],
    ['rng', JSON.stringify(state.rng)],
  ];
  const q = (v: number) => Math.round(v * 1000) / 1000;
  for (const r of state.regiments) {
    const k = `regiment.${r.id}`;
    out.push(
      [`${k}.count`, r.count],
      [`${k}.x`, q(r.x)],
      [`${k}.y`, q(r.y)],
      [`${k}.morale`, q(r.morale)],
      [`${k}.fatigue`, q(r.fatigue)],
      [`${k}.dmgAcc`, q(r.dmgAcc)],
      [`${k}.state`, r.state],
    );
  }
  for (const h of state.heroes) {
    const k = `hero.${h.id}`;
    out.push([`${k}.hp`, q(h.hp)], [`${k}.x`, q(h.x)], [`${k}.y`, q(h.y)], [`${k}.down`, h.down]);
  }
  for (const o of state.objectives) out.push([`objective.${o.id}.status`, o.status]);
  return out;
}

/** FNV-1a over the decisive fields. */
export function battleHash(state: BattleState): number {
  let h = 0x811c9dc5;
  for (const [k, v] of syncFields(state)) {
    const text = `${k}=${String(v)};`;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}

/** Append this step's hash when due, keeping only the most recent HASH_KEEP. */
export function recordSyncHash(state: BattleState): void {
  if (state.step % HASH_EVERY !== 0) return;
  const list = state.syncHashes ?? [];
  list.push({ step: state.step, hash: battleHash(state) });
  if (list.length > HASH_KEEP) list.splice(0, list.length - HASH_KEEP);
  state.syncHashes = list;
}

/** First decisive field on which two battle states differ, or null when they agree. */
export function firstDivergence(
  a: BattleState,
  b: BattleState,
): { field: string; a: unknown; b: unknown } | null {
  const fa = syncFields(a);
  const fb = new Map(syncFields(b));
  for (const [k, v] of fa) {
    if (!fb.has(k)) return { field: k, a: v, b: undefined };
    if (fb.get(k) !== v) return { field: k, a: v, b: fb.get(k) };
    fb.delete(k);
  }
  const extra = fb.keys().next();
  return extra.done ? null : { field: extra.value, a: undefined, b: fb.get(extra.value) };
}
