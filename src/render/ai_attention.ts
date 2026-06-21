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

export type AiAttentionReactionKind = 'approach' | 'avoid' | 'inspect';

export interface AiAttentionBodyOffsetTiming {
  elapsedMs: number;
  durationMs: number;
}

export interface AiAttentionBodyOffsetOptions extends AiAttentionFacingOptions {
  minDistance?: number;
  stepOffset?: number;
  inspectOffset?: number;
}

export function aiAttentionFacing(
  source: AiAttentionFacingEntity,
  target: { x: number; z: number },
  renderPos: { x: number; z: number },
  options: AiAttentionFacingOptions = {},
): number | null {
  if (!canUseAiAttention(source, options)) return null;

  const dx = target.x - renderPos.x;
  const dz = target.z - renderPos.z;
  const d2 = dx * dx + dz * dz;
  const maxDistance = options.maxDistance ?? 40;
  if (d2 < 0.04 || d2 > maxDistance * maxDistance) return null;
  return Math.atan2(dx, dz);
}

export function aiAttentionBodyOffset(
  source: AiAttentionFacingEntity,
  target: { x: number; z: number },
  renderPos: { x: number; z: number },
  reaction: AiAttentionReactionKind,
  timing: AiAttentionBodyOffsetTiming,
  options: AiAttentionBodyOffsetOptions = {},
): { x: number; z: number } | null {
  if (!canUseAiAttention(source, options)) return null;
  if (timing.durationMs <= 0 || timing.elapsedMs < 0 || timing.elapsedMs > timing.durationMs) return null;

  const dx = target.x - renderPos.x;
  const dz = target.z - renderPos.z;
  const d2 = dx * dx + dz * dz;
  const minDistance = options.minDistance ?? 0.6;
  const maxDistance = options.maxDistance ?? 40;
  if (d2 < minDistance * minDistance || d2 > maxDistance * maxDistance) return null;

  const progress = Math.max(0, Math.min(1, timing.elapsedMs / timing.durationMs));
  const pulse = Math.sin(progress * Math.PI);
  if (pulse <= 0.000001) return null;

  const maxOffset = reaction === 'inspect'
    ? options.inspectOffset ?? 0.14
    : options.stepOffset ?? 0.48;
  const signedOffset = (reaction === 'avoid' ? -maxOffset : maxOffset) * pulse;
  const invDistance = 1 / Math.sqrt(d2);
  return {
    x: dx * invDistance * signedOffset,
    z: dz * invDistance * signedOffset,
  };
}

function canUseAiAttention(source: AiAttentionFacingEntity, options: AiAttentionFacingOptions): boolean {
  if (source.kind !== 'npc' && source.kind !== 'mob') return false;
  if (source.dead || source.inCombat || source.castingAbility !== null) return false;
  const movingEpsilon = options.movingEpsilon ?? 0.02;
  const moveDx = source.pos.x - source.prevPos.x;
  const moveDz = source.pos.z - source.prevPos.z;
  return moveDx * moveDx + moveDz * moveDz <= movingEpsilon * movingEpsilon;
}
