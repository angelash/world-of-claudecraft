export interface AiAttentionFacingEntity {
  kind: 'player' | 'npc' | 'mob' | 'object';
  dead: boolean;
  inCombat: boolean;
  castingAbility: string | null;
  pos: { x: number; z: number };
  prevPos: { x: number; z: number };
}

export interface AiAttentionFacingOptions {
  maxDistance?: number;
  movingEpsilon?: number;
}

export function aiAttentionFacing(
  source: AiAttentionFacingEntity,
  target: { x: number; z: number },
  renderPos: { x: number; z: number },
  options: AiAttentionFacingOptions = {},
): number | null {
  if (source.kind !== 'npc' && source.kind !== 'mob') return null;
  if (source.dead || source.inCombat || source.castingAbility !== null) return null;
  const movingEpsilon = options.movingEpsilon ?? 0.02;
  const moveDx = source.pos.x - source.prevPos.x;
  const moveDz = source.pos.z - source.prevPos.z;
  if (moveDx * moveDx + moveDz * moveDz > movingEpsilon * movingEpsilon) return null;

  const dx = target.x - renderPos.x;
  const dz = target.z - renderPos.z;
  const d2 = dx * dx + dz * dz;
  const maxDistance = options.maxDistance ?? 40;
  if (d2 < 0.04 || d2 > maxDistance * maxDistance) return null;
  return Math.atan2(dx, dz);
}
