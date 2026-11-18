// The local sediment haze over time (map_briefs.md 1.2 and 1.11; art_pipeline.md 2.8): the
// level comes from where the camera looks (a location's hot spot, else the map), and a
// change of level eases in over SEDIMENT_FADE_MS instead of jumping, so walking into a
// hot spot thickens the purple motes and the vignette over two seconds. A new map starts at
// its own level at once. The haze is actionable information: every tier draws the faded
// value (fairness.ts). Pure; Node-tested.

/** A change of the sediment haze takes this long on screen. */
export const SEDIMENT_FADE_MS = 2000;

export class SedimentFader {
  private mapId = '';
  private from = 0;
  private to = 0;
  private start = 0;

  /** The haze to draw now for a target level (0..1) on a map. */
  value(mapId: string, target: number, nowMs: number): number {
    if (mapId !== this.mapId) {
      this.mapId = mapId;
      this.from = target;
      this.to = target;
      this.start = nowMs;
      return target;
    }
    if (target !== this.to) {
      // restart from what is on screen now, so a quick step back does not jump
      this.from = this.current(nowMs);
      this.to = target;
      this.start = nowMs;
    }
    return this.current(nowMs);
  }

  /** Whether the haze is still moving (the frame must keep being drawn). */
  moving(nowMs: number): boolean {
    return this.from !== this.to && nowMs - this.start < SEDIMENT_FADE_MS;
  }

  private current(nowMs: number): number {
    const k = Math.max(0, Math.min(1, (nowMs - this.start) / SEDIMENT_FADE_MS));
    return this.from + (this.to - this.from) * k;
  }
}
