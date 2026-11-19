// Calibration data is a build contract. Reject malformed rows and unresolved triggers
// before the runtime subscribes; inspecting an invalid pack must never throw itself.
import type { ContentMap } from '../../core/contracts';

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const whole = (v: unknown): v is number => positive(v) && Number.isInteger(v);
const DISCOVERIES = ['map', 'region', 'landmark', 'vista', 'secret', 'entrance'];
const BUDGETS = { first: 9408, explore: 6272 };

export function xpRewardsProblems(content: ContentMap): string[] {
  const data: unknown = content.xpRewards;
  if (data === undefined) return [];
  if (
    !isObject(data) ||
    data.version !== 1 ||
    !Array.isArray(data.entries) ||
    !Array.isArray(data.calibration)
  )
    return ['xpRewards: invalid envelope'];
  const out: string[] = [];
  const ids = new Set<string>();
  const sums = { first: 0, explore: 0 };
  for (const [i, r] of data.entries.entries()) {
    if (
      !isObject(r) ||
      typeof r.id !== 'string' ||
      !['first', 'explore'].includes(String(r.share)) ||
      !r.id.startsWith(`${r.share}:`) ||
      r.act !== 1 ||
      !whole(r.level) ||
      r.level > 59 ||
      !positive(r.weight) ||
      (r.expected !== 1 && r.expected !== 0.6) ||
      !whole(r.amount) ||
      !isObject(r.trigger)
    ) {
      out.push(`xpRewards: invalid row ${i}`);
      continue;
    }
    if (ids.has(r.id)) out.push(`xpRewards: duplicate ${r.id}`);
    ids.add(r.id);
    sums[r.share as keyof typeof sums] += r.amount * Number(r.expected);
    const t = r.trigger;
    const map = content.maps.find((m) => m.id === t.mapId);
    if (!map) out.push(`xpRewards: missing map for ${r.id}`);
    let valid = false;
    switch (t.kind) {
      case 'discovery': {
        valid = r.share === 'explore' && DISCOVERIES.includes(String(t.discovery));
        if (t.discovery === 'map' || t.discovery === 'region') valid &&= t.location === undefined;
        else {
          const location = map?.locations.find((l) => l.id === t.location);
          valid &&= !!location;
          if (t.discovery !== 'entrance') valid &&= location?.discovery?.kind === t.discovery;
          else
            valid &&= (content.dungeons ?? []).some(
              (d) => d.gate.mapId === t.mapId && d.gate.location === t.location,
            );
        }
        break;
      }
      case 'boss':
        valid = r.share === 'first' && content.monsters.some((m) => m.id === t.monsterId);
        break;
      case 'dungeon':
        valid =
          r.share === 'first' &&
          (content.dungeons ?? []).some((d) => d.id === t.dungeonId && !!d.coreBoss);
        break;
      case 'nest':
        valid = r.share === 'first' && (content.nests ?? []).some((n) => n.id === t.nestId);
        break;
    }
    if (!valid) out.push(`xpRewards: invalid trigger ${r.id}`);
  }
  const shares = new Set<string>();
  for (const c of data.calibration) {
    if (
      !isObject(c) ||
      c.act !== 1 ||
      !['first', 'explore'].includes(String(c.share)) ||
      !positive(c.raw) ||
      !positive(c.coefficient) ||
      !positive(c.rounded) ||
      !positive(c.expected) ||
      !positive(c.calibration) ||
      c.calibration < 0.6 ||
      c.calibration > 1.5 ||
      c.budget !== BUDGETS[c.share as keyof typeof BUDGETS]
    ) {
      out.push('xpRewards: invalid calibration');
      continue;
    }
    const share = c.share as keyof typeof sums;
    if (shares.has(share)) out.push(`xpRewards: duplicate calibration ${share}`);
    shares.add(share);
    if (
      Math.abs(c.coefficient - Number(c.budget) / c.raw) > 1e-12 ||
      Math.abs(c.expected - sums[share]) > 1e-7 ||
      Math.abs(sums[share] - Number(c.budget)) > Number(c.budget) * 0.05
    )
      out.push(`xpRewards: ${share} misses calibration or budget`);
  }
  for (const share of ['first', 'explore'])
    if (!shares.has(share)) out.push(`xpRewards: missing calibration ${share}`);
  return out;
}
