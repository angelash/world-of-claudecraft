export const HOSTED_PLAY_AUTO_INVITE_MIN_PARTY_SIZE = 2;
export const HOSTED_PLAY_AUTO_INVITE_MAX_PARTY_SIZE = 5;

export const HOSTED_PLAY_AUTO_INVITE_TARGET_PARTY_SIZES = [
  2,
  3,
  4,
  5,
] as const;

export type HostedPlayAutoInviteTargetPartySize =
  typeof HOSTED_PLAY_AUTO_INVITE_TARGET_PARTY_SIZES[number];

export function isHostedPlayAutoInviteTargetPartySize(
  value: unknown,
): value is HostedPlayAutoInviteTargetPartySize {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= HOSTED_PLAY_AUTO_INVITE_MIN_PARTY_SIZE
    && value <= HOSTED_PLAY_AUTO_INVITE_MAX_PARTY_SIZE;
}

export function normalizeHostedPlayAutoInviteTargetPartySize(
  value: unknown,
): HostedPlayAutoInviteTargetPartySize {
  if (isHostedPlayAutoInviteTargetPartySize(value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(
      HOSTED_PLAY_AUTO_INVITE_MIN_PARTY_SIZE,
      Math.min(HOSTED_PLAY_AUTO_INVITE_MAX_PARTY_SIZE, Math.floor(value)),
    ) as HostedPlayAutoInviteTargetPartySize;
  }
  return HOSTED_PLAY_AUTO_INVITE_MIN_PARTY_SIZE;
}
