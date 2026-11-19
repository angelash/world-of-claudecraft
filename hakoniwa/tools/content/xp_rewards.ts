// Build the M1 rewards from real content. Coefficients are derived from the declared
// 12% and 8% budgets, never copied from the design document's illustrative baseline.
import type { ContentMap } from '../../src/core/contracts';
import { xpForLevel } from '../../src/systems/combat/formulas';
import type { XpReward, XpRewardsData, XpTrigger } from '../../src/systems/records/xp_types';

export type XpSeed = Omit<XpReward, 'amount'>;
const XP_ACT1 = 78_400;
const WEIGHTS = { map: 1, region: 3, landmark: 0.3, vista: 1, secret: 1.5, entrance: 1 };
const FORM = { lair: 2, shallow: 3, dungeon: 4, great: 6 };

export function roundReward(value: number): number {
  const step = value < 1000 ? 10 : value < 10_000 ? 50 : 100;
  return Math.round(value / step) * step;
}

export function calibrateRewards(
  seeds: readonly XpSeed[],
  budgets: { first: number; explore: number },
): XpRewardsData {
  const entries: XpReward[] = [];
  const calibration: XpRewardsData['calibration'] = [];
  for (const share of ['first', 'explore'] as const) {
    const rows = seeds.filter((s) => s.share === share);
    const raw = rows.reduce(
      (sum, r) => sum + r.weight * xpForLevel(Math.min(59, r.level)) * r.expected,
      0,
    );
    const budget = budgets[share];
    if (!(raw > 0 && budget > 0)) throw new Error(`${share}: missing calibrated content or budget`);
    const coefficient = budget / raw;
    const rounded = rows.reduce(
      (sum, r) =>
        sum + roundReward(r.weight * xpForLevel(Math.min(59, r.level)) * coefficient) * r.expected,
      0,
    );
    const k = Math.abs(rounded - budget) > budget * 0.05 ? budget / rounded : 1;
    if (!(k >= 0.6 && k <= 1.5)) throw new Error(`${share}: calibration ${k} outside 0.6..1.5`);
    for (const r of rows)
      entries.push({
        ...r,
        amount: Math.round(
          roundReward(r.weight * xpForLevel(Math.min(59, r.level)) * coefficient) * k,
        ),
      });
    const expected = entries
      .filter((r) => r.share === share)
      .reduce((sum, r) => sum + r.amount * r.expected, 0);
    if (Math.abs(expected - budget) > budget * 0.05)
      throw new Error(`${share}: rounded rewards miss budget`);
    calibration.push({
      act: 1,
      share,
      budget,
      raw,
      coefficient,
      rounded,
      calibration: k,
      expected,
    });
  }
  return { version: 1, entries: entries.sort((a, b) => a.id.localeCompare(b.id)), calibration };
}

/** The first act's declared discoveries, core-boss clears and map-placed first victories. */
export function rewardSeeds(content: ContentMap): XpSeed[] {
  const out: XpSeed[] = [];
  const maps = new Map(content.maps.map((m) => [m.id, m]));
  const eligible = (content.atlas_maps ?? []).filter(
    (a) =>
      a.status === 'built' &&
      a.acts.includes(1) &&
      Math.min(...a.acts) === 1 &&
      !['private', 'stage', 'battle'].includes(a.role) &&
      maps.has(a.id),
  );
  const atlas = new Map(eligible.map((a) => [a.id, a]));
  const mainBosses = new Set(
    (content.quests ?? [])
      .filter((q) => q.act === 'act1' && q.kind === 'main')
      .flatMap((q) =>
        q.stages.flatMap((s) =>
          (s.objectives ?? [])
            .filter((o) => o.type === 'kill')
            .map((o) => o.ref)
            .filter(Boolean),
        ),
      ),
  );
  const add = (
    id: string,
    share: 'first' | 'explore',
    level: number,
    weight: number,
    expected: 1 | 0.6,
    trigger: XpTrigger,
  ) => out.push({ id, act: 1, share, level, weight, expected, trigger });
  for (const a of eligible) {
    const expected = a.optional ? 0.6 : 1;
    add(`explore:map:${a.id}`, 'explore', 8, WEIGHTS.map, expected, {
      kind: 'discovery',
      mapId: a.id,
      discovery: 'map',
    });
    for (const l of maps.get(a.id)?.locations ?? []) {
      const d = l.discovery;
      if (!d || d.kind === 'map' || (d.act !== undefined && d.act !== 1)) continue;
      add(
        `explore:${d.kind}:${a.id}:${l.id}`,
        'explore',
        8,
        WEIGHTS[d.kind],
        d.kind === 'secret' ? 0.6 : expected,
        { kind: 'discovery', mapId: a.id, location: l.id, discovery: d.kind },
      );
    }
  }
  for (const region of [...new Set(eligible.map((a) => a.region))].sort()) {
    const a = eligible.find((a) => a.region === region);
    if (a)
      add(`explore:region:${region}`, 'explore', 8, WEIGHTS.region, 1, {
        kind: 'discovery',
        mapId: a.id,
        discovery: 'region',
      });
  }
  for (const d of content.dungeons ?? []) {
    if (d.act !== 'act1') continue;
    if (d.coreBoss)
      add(
        `first:dungeon:${d.id}`,
        'first',
        d.level[1],
        FORM[d.form],
        mainBosses.has(d.coreBoss) ? 1 : 0.6,
        { kind: 'dungeon', dungeonId: d.id, mapId: d.entry.mapId },
      );
    if (atlas.has(d.gate.mapId))
      add(`explore:entrance:${d.id}`, 'explore', 8, WEIGHTS.entrance, 0.6, {
        kind: 'discovery',
        mapId: d.gate.mapId,
        location: d.gate.location,
        discovery: 'entrance',
      });
  }
  for (const n of content.nests ?? []) {
    if (n.act !== 'act1') continue;
    const lord = content.monsters.find((m) => m.id === n.lord);
    if (lord)
      add(`first:nest:${n.id}`, 'first', lord.maxLevel, 2, 0.6, {
        kind: 'nest',
        nestId: n.id,
        mapId: n.mapId,
      });
  }
  const placed = new Map<string, string>();
  for (const a of eligible)
    for (const s of maps.get(a.id)?.spawns ?? [])
      if (
        s.kind === 'monster' &&
        !(s.requiresFlags ?? []).some((f) => /^act\.[2-7]\.entered$/.test(f))
      )
        placed.set(s.ref, a.id);
  for (const wave of content.waves ?? [])
    if (wave.mapId && atlas.has(wave.mapId))
      for (const g of wave.groups) placed.set(g.monster, wave.mapId);
  const core = new Set(
    (content.dungeons ?? [])
      .filter((d) => d.act === 'act1')
      .map((d) => d.coreBoss)
      .filter(Boolean),
  );
  const lords = new Set(
    (content.nests ?? [])
      .filter((n) => n.act === 'act1')
      .map((n) => n.lord)
      .filter(Boolean),
  );
  for (const [id, mapId] of placed) {
    const m = content.monsters.find((m) => m.id === id);
    const coreOf = (content.dungeons ?? []).find((d) => d.act === 'act1' && d.coreBoss === id);
    if (
      !m ||
      (!['boss', 'rare'].includes(m.rank ?? '') && !core.has(id) && !lords.has(id)) ||
      m.maxLevel > 15
    )
      continue;
    const weight =
      m.rank === 'rare'
        ? 0.5
        : coreOf
          ? coreOf.form === 'lair'
            ? 1
            : coreOf.form === 'great'
              ? 3
              : 1.5
          : lords.has(id)
            ? 1
            : m.tier === 'raid' || m.tier === 'surge'
              ? 3
              : 2;
    const expected: 1 | 0.6 =
      mainBosses.has(id) || m.tier === 'story' || m.tier === 'tutorial' ? 1 : 0.6;
    add(`first:boss:${id}`, 'first', m.maxLevel, weight, expected, {
      kind: 'boss',
      monsterId: id,
      mapId,
    });
  }
  return out;
}

export function buildXpRewards(content: ContentMap): XpRewardsData {
  return calibrateRewards(rewardSeeds(content), { first: XP_ACT1 * 0.12, explore: XP_ACT1 * 0.08 });
}
