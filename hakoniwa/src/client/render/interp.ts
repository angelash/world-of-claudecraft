// Render interpolation between simulation ticks. The world steps at 20 Hz; frames come
// faster, so the renderer draws each entity between its previous and current tick
// position by the clock's alpha. Teleports and map changes snap. Pure; Node-tested.

export interface PositionSample {
  id: string;
  x: number;
  y: number;
  mapId: string;
}

interface Track {
  px: number;
  py: number;
  x: number;
  y: number;
  mapId: string;
  /** distance walked so far (tiles), drives walk animation frames */
  travelled: number;
  /** tick count of the last capture this id was seen in */
  seen: number;
}

/** A jump longer than this between two ticks is a teleport, not movement. */
export const SNAP_DISTANCE = 2.5;

export class InterpBuffer {
  private tracks = new Map<string, Track>();
  private captures = 0;

  /** Record positions after a simulation step; the previous capture becomes the "from" pose. */
  capture(samples: Iterable<PositionSample>): void {
    this.captures++;
    for (const s of samples) {
      const t = this.tracks.get(s.id);
      if (!t) {
        this.tracks.set(s.id, {
          px: s.x,
          py: s.y,
          x: s.x,
          y: s.y,
          mapId: s.mapId,
          travelled: 0,
          seen: this.captures,
        });
        continue;
      }
      const d = Math.hypot(s.x - t.x, s.y - t.y);
      if (t.mapId !== s.mapId || d > SNAP_DISTANCE) {
        t.px = s.x;
        t.py = s.y;
      } else {
        t.px = t.x;
        t.py = t.y;
        t.travelled += d;
      }
      t.x = s.x;
      t.y = s.y;
      t.mapId = s.mapId;
      t.seen = this.captures;
    }
    // Forget entities that were not present in this capture.
    for (const [id, t] of this.tracks) if (t.seen !== this.captures) this.tracks.delete(id);
  }

  /** Interpolated position at alpha in [0, 1] between the last two captures. */
  sample(id: string, alpha: number): { x: number; y: number } | null {
    const t = this.tracks.get(id);
    if (!t) return null;
    const a = Math.max(0, Math.min(1, alpha));
    return { x: t.px + (t.x - t.px) * a, y: t.py + (t.y - t.py) * a };
  }

  /** True when the entity moved during the last step. */
  moving(id: string): boolean {
    const t = this.tracks.get(id);
    return !!t && (t.x !== t.px || t.y !== t.py);
  }

  /** Total distance walked (tiles) since first seen; used for distance-driven walk frames. */
  travelled(id: string): number {
    return this.tracks.get(id)?.travelled ?? 0;
  }

  clear(): void {
    this.tracks.clear();
  }

  get size(): number {
    return this.tracks.size;
  }
}
