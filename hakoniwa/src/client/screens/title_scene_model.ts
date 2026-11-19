// Title motion is cosmetic. The caller supplies its animation clock; the world clock and
// save are never changed. Calm, touch and flat modes hold the exact same camera still.

export function titleCamera(
  elapsedMs: number,
  width: number,
  motion: boolean,
  interactionAgeMs = Number.POSITIVE_INFINITY,
): { widthScale: number; offsetX: number } {
  if (!motion) return { widthScale: 1, offsetX: 0 };
  const t = Math.max(0, Math.min(1, elapsedMs / 2200));
  const ease = 1 - (1 - t) ** 3;
  const drift =
    interactionAgeMs >= 8000 ? Math.sin((Math.max(0, elapsedMs - 2200) / 40000) * Math.PI * 2) : 0;
  return { widthScale: 1.6 - 0.6 * ease, offsetX: width * 0.025 * drift };
}
