import type { PartyAuraInfo } from '../world_api';

export type AuraRenderMode = 'all' | 'debuffs';

type AuraLike = {
  id: string;
  kind: string;
  remaining?: number;
  stacks?: number;
  value?: number;
};

const DEBUFF_AURA_KINDS = new Set([
  'dot',
  'slow',
  'root',
  'stun',
  'incapacitate',
  'polymorph',
  'attackspeed',
  'debuff_ap',
  'sunder',
  'mortal_wound',
  'silence',
  'disarm',
  'blind',
  'expose',
  'spellvuln',
  'lockout',
  'vulnerability',
  'hex',
  'tongues',
  'cost_tax',
  'heal_absorb',
  'critvuln',
]);

export function isDebuffAura(aura: Pick<AuraLike, 'kind' | 'value'>): boolean {
  return DEBUFF_AURA_KINDS.has(aura.kind) || (aura.kind.startsWith('buff_') && (aura.value ?? 0) < 0);
}

export function auraRenderSignature(
  entityId: number,
  mode: AuraRenderMode,
  auras: readonly AuraLike[],
): string {
  return `${entityId}:${mode}:${auras.map((a) => `${a.id}${Math.ceil(a.remaining ?? 0)}x${a.stacks ?? 0}`).join('|')}`;
}

export function visiblePartyFrameAuras(
  auras: readonly PartyAuraInfo[] | undefined,
  limit = 5,
): PartyAuraInfo[] {
  if (!auras || limit <= 0) return [];
  return auras.slice(0, limit);
}
