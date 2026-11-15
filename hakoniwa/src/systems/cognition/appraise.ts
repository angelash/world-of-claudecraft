// Appraisal (D-029, power_system.md 2.6, reputation_and_cognition.md 8): the player
// reads as "无记载"; above a crystal's reading cap the display is "<cap>+"; beyond the
// appraiser's perception it is "？"; monsters read as a record fragment. With the talent
// door (flag feature.appraise_talent) the player also sees an NPC's hidden potential.

import type { ContentMap } from '../../core/contracts';
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

const DEVICE_NAMES: Record<AppraisalDevice, string> = {
  crystal: '鉴定水晶',
  guild: '公会高级鉴定',
  academy: '学院精密鉴定',
  skill: '个人鉴定',
  sense: '灵觉',
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
      display: '无记载',
      kind: 'no_record',
      note:
        dev === 'sense'
          ? '灵觉里像个空壳，什么都读不出来'
          : `${DEVICE_NAMES[dev]}毫无反应，读数栏只有"无记载"`,
    };
  }
  const level = levelOf(target) ?? 1;
  const tier = tierOf(target);
  const tierName = TIER_NAMES[Math.min(6, tier)] ?? '';
  const persona = target.ref ? personaById(content, target.ref) : undefined;
  if (dev === 'sense') {
    const diff = tier - tierOf(observer);
    if (persona?.concealed)
      return { ...base, display: '一片平静', kind: 'band', note: '感觉不到任何灵压' };
    const band = diff >= 2 ? '看不透' : diff === 1 ? '比我强' : diff === 0 ? '差不多' : '比我弱';
    return { ...base, display: band, kind: 'band', note: `灵觉的判断：${band}` };
  }
  let display: string;
  let kind: AppraisalResult['kind'];
  if (dev === 'skill') {
    const cap = perceptionCap(observer);
    if (level > cap) {
      display = '？';
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
      display = '？';
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
    display: fragment ? `残页：${target.name} ${display}` : display,
    kind: fragment && kind === 'exact' ? 'fragment' : kind,
    level: kind === 'exact' ? level : undefined,
    tier: kind === 'exact' ? tier : undefined,
    tierName: kind === 'exact' ? tierName : undefined,
    note: fragment ? '只读得出种类、等级与位阶' : `${DEVICE_NAMES[dev]}的读数`,
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
