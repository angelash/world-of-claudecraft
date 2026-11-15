// Pressure perception helper for the client (power_system.md 3.5 and 3.6,
// reputation_and_cognition.md 8.4): only a band and a vague text, never numbers.
// Concealed experts and the pageless player out of combat feel like nothing at all.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { personaById } from '../npc/personas';
import { distance, getEntity } from '../world';
import { tierOf } from './appraise';

export type PressureBand = 'none' | 'calm' | 'press' | 'stiff' | 'faint';

export interface PressureSense {
  band: PressureBand;
  text: string;
  /** direction from observer to target in radians (for screen-edge cues) */
  direction: number;
}

const TEXT: Record<PressureBand, string> = {
  none: '没什么特别的感觉',
  calm: '一片平静，什么都感觉不到',
  press: '空气有点沉，心跳快了几拍',
  stiff: '手脚发僵，很难先动手',
  faint: '眼前发灰，喘不过气',
};

export function pressureSense(
  world: World,
  content: ContentMap,
  observerId: string,
  targetId: string,
): PressureSense | null {
  const o = getEntity(world, observerId);
  const t = getEntity(world, targetId);
  if (!o || !t || o.mapId !== t.mapId) return null;
  const direction = Math.atan2(t.y - o.y, t.x - o.x);
  const fighting = t.tags.includes('in_combat');
  const concealed = !!(t.ref && personaById(content, t.ref)?.concealed);
  if (!fighting && (concealed || t.kind === 'player'))
    return { band: 'calm', text: TEXT.calm, direction };
  const diff = tierOf(t) - tierOf(o);
  const far = distance(o, t) > 12;
  let band: PressureBand = 'none';
  if (diff >= 3) band = 'faint';
  else if (diff === 2) band = 'stiff';
  else if (diff === 1) band = 'press';
  if (far && band !== 'none') band = band === 'faint' ? 'stiff' : 'press';
  return { band, text: TEXT[band], direction };
}
