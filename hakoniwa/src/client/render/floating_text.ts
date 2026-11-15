// Floating combat text (art_pipeline.md 4.3): numbers and short words that rise from
// a unit and fade. Each entry is a pure function of its start time; a per-entity stack
// offsets simultaneous entries so they do not overlap. Pure; Node-tested.

export interface FloatingEntry {
  entityId: string;
  text: string;
  kind: string;
  start: number;
  /** horizontal jitter in screen px (deterministic per entry) */
  dx: number;
}

export interface FloatingDraw {
  entityId: string;
  text: string;
  kind: string;
  /** upward offset in device-independent px */
  rise: number;
  dx: number;
  alpha: number;
  /** scale pop for crits and level ups */
  scale: number;
}

export const FLOAT_MS = 1300;
export const MAX_FLOATS = 40;

export const FLOAT_COLORS: Record<string, string> = {
  damage: '#fff2c8',
  crit: '#ffd04a',
  damage_taken: '#ff6a5a',
  heal: '#7ef08a',
  miss: '#c8c8d0',
  xp: '#c8a8ff',
  level: '#ffe27a',
  loot: '#9ee08a',
};

export class FloatingBoard {
  private entries: FloatingEntry[] = [];
  private seq = 0;

  add(entityId: string, text: string, kind: string, nowMs: number): void {
    this.seq++;
    const dx = ((this.seq * 37) % 21) - 10;
    this.entries.push({ entityId, text, kind, start: nowMs, dx });
    if (this.entries.length > MAX_FLOATS) this.entries.splice(0, this.entries.length - MAX_FLOATS);
  }

  active(nowMs: number): FloatingDraw[] {
    this.entries = this.entries.filter((e) => nowMs - e.start < FLOAT_MS);
    const stack = new Map<string, number>();
    const out: FloatingDraw[] = [];
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i] as FloatingEntry;
      const t = Math.max(0, (nowMs - e.start) / FLOAT_MS);
      const n = stack.get(e.entityId) ?? 0;
      stack.set(e.entityId, n + 1);
      const big = e.kind === 'crit' || e.kind === 'level';
      out.push({
        entityId: e.entityId,
        text: e.text,
        kind: e.kind,
        rise: 6 + t * 34 + n * 14,
        dx: e.dx,
        alpha: t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3),
        scale: big && t < 0.15 ? 1.35 - t : big ? 1.2 : 1,
      });
    }
    return out;
  }

  clear(): void {
    this.entries = [];
  }
}
