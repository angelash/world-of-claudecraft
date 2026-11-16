// Pressure perception helper for the client (power_system.md 3.5 and 3.6,
// reputation_and_cognition.md 8.4): only a band and a vague text, never numbers.
// Concealed experts and the pageless player out of combat feel like nothing at all.

import type { ContentMap } from '../../core/contracts';
import { type KeyText, tr } from '../../core/text';
import type { World } from '../../core/world';
import { personaById } from '../npc/personas';
import { distance, getEntity } from '../world';
import { tierOf } from './appraise';

export type PressureBand = 'none' | 'calm' | 'press' | 'stiff' | 'faint';

export interface PressureSense {
  band: PressureBand;
  text: KeyText;
  /** direction from observer to target in radians (for screen-edge cues) */
  direction: number;
}

const TEXT: Record<PressureBand, () => KeyText> = {
  none: () => tr('sys.cognition.pressure.none'),
  calm: () => tr('sys.cognition.pressure.calm'),
  press: () => tr('sys.cognition.pressure.press'),
  stiff: () => tr('sys.cognition.pressure.stiff'),
  faint: () => tr('sys.cognition.pressure.faint'),
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
    return { band: 'calm', text: TEXT.calm(), direction };
  const diff = tierOf(t) - tierOf(o);
  const far = distance(o, t) > 12;
  let band: PressureBand = 'none';
  if (diff >= 3) band = 'faint';
  else if (diff === 2) band = 'stiff';
  else if (diff === 1) band = 'press';
  if (far && band !== 'none') band = band === 'faint' ? 'stiff' : 'press';
  return { band, text: TEXT[band](), direction };
}
