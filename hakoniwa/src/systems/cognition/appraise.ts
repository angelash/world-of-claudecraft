// Appraisal (D-029, power_system.md 2.6, reputation_and_cognition.md 8): the player
// reads as "no record"; above a crystal's reading cap the display is "<cap>+"; beyond the
// appraiser's perception it is unknown; monsters read as a record fragment. With the talent
// door (flag feature.appraise_talent) the player also sees an NPC's hidden potential.

import type { ContentMap } from '../../core/contracts';
import { type KeyText, type TextParam, type TextRef, tr } from '../../core/text';
import type { World } from '../../core/world';
import { personaById, TIER_NAMES, tierOfLevel } from '../npc/personas';
import { getEntity } from '../world';
import type { Entity } from '../world/types';
import type { AppraisalDevice, AppraisalResult } from './types';

/** Reading caps of the instruments (society.md 3.4). */
export const DEVICE_CAP: Record<'crystal' | 'guild' | 'academy', number> = {
  crystal: 34,
  guild: 49,
  academy: 59,
};

const DEVICE_NAMES: Record<AppraisalDevice, () => KeyText> = {
  crystal: () => tr('sys.cognition.device.crystal'),
  guild: () => tr('sys.cognition.device.guild'),
  academy: () => tr('sys.cognition.device.academy'),
  skill: () => tr('sys.cognition.device.skill'),
  sense: () => tr('sys.cognition.device.sense'),
};

export function levelOf(e: Entity): number | undefined {
  const tag = e.tags.find((t) => t.startsWith('lvl:'));
  if (!tag) return undefined;
  const n = Number(tag.slice(4));
  return Number.isFinite(n) ? n : undefined;
}

export function tierOf(e: Entity): number {
  const tag = e.tags.find((t) => t.startsWith('tier:'));
  if (tag) {
    const n = Number(tag.slice(5));
    if (Number.isFinite(n)) return n;
  }
  return tierOfLevel(levelOf(e) ?? 1);
}

function isFragment(e: Entity): boolean {
  return (
    e.kind === 'monster' ||
    e.tags.includes('monster') ||
    e.tags.includes('undead') ||
    e.tags.includes('faceless')
  );
}

/** Highest level an appraiser can read clearly: own tier plus one (2.6, 3.6). */
function perceptionCap(observer: Entity): number {
  const t = tierOf(observer) + 1;
  return [9, 19, 34, 49, 59, 60, 99][Math.min(6, t)] as number;
}

export function defaultDevice(observer: Entity): AppraisalDevice {
  if (observer.kind === 'player') return 'skill';
  return observer.tags.includes('clerk') || observer.tags.includes('guild_master')
    ? 'crystal'
    : 'skill';
}

/** Pure appraisal for UI previews and the cognition.appraise command. */
export function appraise(
  world: World,
  content: ContentMap,
  observerId: string,
  targetId: string,
  device?: AppraisalDevice,
): AppraisalResult | null {
  const observer = getEntity(world, observerId);
  const target = getEntity(world, targetId);
  if (!observer || !target) return null;
  const dev = device ?? defaultDevice(observer);
  const base = { tick: world.meta.tick, observerId, targetId, device: dev };
  if (target.kind === 'player') {
    return {
      ...base,
      display: tr('sys.cognition.appraise.no_record'),
      kind: 'no_record',
      note:
        dev === 'sense'
          ? tr('sys.cognition.appraise.note.sense_empty')
          : tr('sys.cognition.appraise.note.no_reaction', { device: DEVICE_NAMES[dev]() }),
    };
  }
  const level = levelOf(target) ?? 1;
  const tier = tierOf(target);
  // a fresh copy: the table entry is shared module state, the result lands in the world
  const named = TIER_NAMES[Math.min(6, tier)];
  const tierName: TextParam = named ? { ...named } : '';
  const persona = target.ref ? personaById(content, target.ref) : undefined;
  if (dev === 'sense') {
    const diff = tier - tierOf(observer);
    if (persona?.concealed)
      return {
        ...base,
        display: tr('sys.cognition.appraise.calm'),
        kind: 'band',
        note: tr('sys.cognition.appraise.note.no_pressure'),
      };
    const band = () =>
      diff >= 2
        ? tr('sys.cognition.appraise.band.beyond')
        : diff === 1
          ? tr('sys.cognition.appraise.band.stronger')
          : diff === 0
            ? tr('sys.cognition.appraise.band.equal')
            : tr('sys.cognition.appraise.band.weaker');
    return {
      ...base,
      display: band(),
      kind: 'band',
      note: tr('sys.cognition.appraise.note.sense', { band: band() }),
    };
  }
  let display: TextRef | string;
  let kind: AppraisalResult['kind'];
  if (dev === 'skill') {
    const cap = perceptionCap(observer);
    if (level > cap) {
      display = tr('sys.cognition.appraise.unknown');
      kind = 'unknown';
    } else {
      display = `Lv${level}`;
      kind = 'exact';
    }
  } else {
    const cap = DEVICE_CAP[dev];
    if (dev === 'academy' && level === 60) {
      display = '60';
      kind = 'exact';
    } else if (dev === 'academy' && level > 60) {
      display = tr('sys.cognition.appraise.unknown');
      kind = 'unknown';
    } else if (level > cap) {
      display = `${cap}+`;
      kind = 'capped';
    } else {
      display = `Lv${level}`;
      kind = 'exact';
    }
  }
  const fragment = isFragment(target);
  const result: AppraisalResult = {
    ...base,
    display: fragment
      ? tr('sys.cognition.appraise.fragment', { name: target.name, display })
      : display,
    kind: fragment && kind === 'exact' ? 'fragment' : kind,
    level: kind === 'exact' ? level : undefined,
    tier: kind === 'exact' ? tier : undefined,
    tierName: kind === 'exact' ? tierName : undefined,
    note: fragment
      ? tr('sys.cognition.appraise.note.fragment')
      : tr('sys.cognition.appraise.note.reading', { device: DEVICE_NAMES[dev]() }),
  };
  if (
    observer.kind === 'player' &&
    world.meta.flags['feature.appraise_talent'] &&
    persona?.potential &&
    !fragment
  ) {
    result.potential = persona.potential;
  }
  return result;
}
