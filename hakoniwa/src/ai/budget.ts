// Budgeter (docs/50_tech/ai_architecture.md 2.3.3, 9.4; llm_providers.md 8.3 to 8.5):
// three windows (a sliding 60 real-minute hour, the local calendar day, the run, meaning
// the save line since a new game), each capped in money, tokens or both. Calls reserve
// first (the estimate with the whole output cap) and settle with real usage; settled plus
// in-flight reservations plus a new reservation never pass a cap, so the caps are hard.
// The tightest window's usage ratio drives the degrade level 0 to 9 (60, 70, 80, 90 and 100
// percent reach levels 2, 4, 6, 8 and 9); the level rises at once and falls one rung after
// five healthy real minutes with the hour window ten points under the rung's trigger, at
// once when the player raises a cap or the day or run changes. The hourly cap is shared by
// pools of binding roles (reserved requests skip shares); test requests are booked but
// never capped. Real time lives here, outside the deterministic kernel: the clock, the day
// key and the run id are injected by the host.

import type { Clock } from './contracts';

export type CapWindow = 'hour' | 'day' | 'run';

export const CAP_WINDOWS: readonly CapWindow[] = ['hour', 'day', 'run'];

/** A cap in US dollars, tokens (input plus output), or both; either one reached counts. */
export interface CapValue {
  usd?: number;
  tokens?: number;
}

/** A cost in both measures; `usd` is undefined for a model without a price (tokens only). */
export interface Cost {
  usd?: number;
  tokens: number;
}

/**
 * Degrade level, cumulative (ai_architecture.md 9.4): 0 normal; 1 offstage batch; 2 present
 * NPC event rounds (and non-reserved requests drop one slot); 3 tidy rounds; 4 present NPCs;
 * 5 NPC with NPC chat; 6 rulers and generals; 7 goddess plans every other day; 8 reserved
 * requests only; 9 every request falls back to the built-in AI.
 */
export type DegradeLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface BudgetConfig {
  caps?: Partial<Record<CapWindow, CapValue>>;
  /** Legacy single cap: the hourly window in US dollars. */
  perHourUsd?: number;
  /** Legacy lifetime cap: the run window in US dollars. */
  totalUsd?: number;
  /** Share of the hourly cap per share key (a binding role pool or a role name). */
  roleShares?: Record<string, number>;
  /** Tightest-window ratios that reach levels 2, 4, 6, 8 and 9. */
  thresholds?: readonly [number, number, number, number, number];
  /** Healthy real time before the level falls one rung. Default 5 minutes. */
  recoverMs?: number;
  /** The hour ratio must sit this far under the rung's trigger to fall. Default 0.1. */
  recoverMargin?: number;
  /** A single reservation above this fraction of the hourly cap is too large. Default 0.1. */
  singleMax?: number;
}

/** Host facts for the day and run windows (llm_providers.md 4.7). */
export interface BudgetScope {
  /** Local calendar date, for example '2026-11-16'. */
  dayKey?(): string;
  /** Save line id, generated at a new game and written into every save of the line. */
  runId?(): string;
}

const DEFAULT_THRESHOLDS: readonly [number, number, number, number, number] = [
  0.6, 0.7, 0.8, 0.9, 1,
];
const RUNGS: readonly DegradeLevel[] = [2, 4, 6, 8, 9];
const HOUR_MS = 60 * 60 * 1000;
const KEEP_DAYS = 90;

export const DEFAULT_BUDGET: Readonly<BudgetConfig> = {
  perHourUsd: 1,
  thresholds: DEFAULT_THRESHOLDS,
};

interface Entry {
  id: string;
  key: string;
  t: number;
  day: string;
  run: string;
  usd: number;
  tokens: number;
  /** false for a model without a price: the entry only counts tokens */
  priced: boolean;
  /** true while only reserved (not yet settled) */
  open: boolean;
  source: 'game' | 'test';
  /** A seeded hour total: the day and run totals were seeded on their own. */
  hourOnly?: boolean;
}

export interface WindowUse {
  usd: number;
  tokens: number;
  cap: CapValue;
  /** Larger of usd/cap.usd and tokens/cap.tokens (0 without a cap). */
  ratio: number;
}

export interface BudgetSnapshot {
  level: DegradeLevel;
  /** Hour window spend, settled plus open reservations (legacy field). */
  hourUsd: number;
  /** Hourly money cap, 0 when none (legacy field). */
  perHourUsd: number;
  /** Everything this budget has booked since it was created (legacy field). */
  totalUsd: number;
  /** Hour window spend per share key (legacy field). */
  byRole: Record<string, number>;
  windows: Record<CapWindow, WindowUse>;
  /** The window with the highest ratio, null when nothing is capped. */
  tightest: CapWindow | null;
  ratio: number;
  dayKey: string;
  runId: string;
}

export type AffordVerdict = 'ok' | CapWindow | 'role' | 'single';

export interface AffordOptions {
  /** Share of the hourly cap for this key when the config has none. */
  share?: number;
  /** Reserved requests skip shares. */
  reserved?: boolean;
  /** Connection tests are booked but never capped (8.4). */
  source?: 'game' | 'test';
}

function zero(): { usd: number; tokens: number } {
  return { usd: 0, tokens: 0 };
}

export class Budget {
  private entries: Entry[] = [];
  /** Settled entries older than the hour window, folded per day and per run. */
  private readonly days = new Map<string, { usd: number; tokens: number }>();
  private readonly runs = new Map<string, { usd: number; tokens: number }>();
  private total = 0;
  private current: DegradeLevel = 0;
  private calmSince: number | undefined;
  private lastDay: string;
  private lastRun: string;
  private cfg: BudgetConfig;
  private caps: Partial<Record<CapWindow, CapValue>>;

  constructor(
    config: Partial<BudgetConfig>,
    private readonly clock: Clock,
    private readonly scope: BudgetScope = {},
  ) {
    this.cfg = { thresholds: DEFAULT_THRESHOLDS, ...config };
    this.caps = Budget.capsOf(this.cfg);
    this.lastDay = this.day();
    this.lastRun = this.run();
  }

  get config(): Readonly<BudgetConfig> {
    return this.cfg;
  }

  private static capsOf(c: Partial<BudgetConfig>): Partial<Record<CapWindow, CapValue>> {
    const caps: Partial<Record<CapWindow, CapValue>> = {};
    for (const w of CAP_WINDOWS) if (c.caps?.[w]) caps[w] = { ...c.caps[w] };
    // The legacy single-cap config keeps its default of one dollar per hour.
    const hourUsd = c.perHourUsd ?? (c.caps === undefined ? DEFAULT_BUDGET.perHourUsd : undefined);
    if (hourUsd !== undefined) caps.hour = { ...caps.hour, usd: hourUsd };
    if (c.totalUsd !== undefined) caps.run = { ...caps.run, usd: c.totalUsd };
    return caps;
  }

  /** Whether `next` raises (or removes) any cap of `prev`. */
  private static raises(
    prev: Partial<Record<CapWindow, CapValue>>,
    next: Partial<Record<CapWindow, CapValue>>,
  ): boolean {
    return CAP_WINDOWS.some((w) =>
      (['usd', 'tokens'] as const).some((m) => {
        const a = prev[w]?.[m];
        if (a === undefined) return false;
        const b = next[w]?.[m];
        return b === undefined || b > a;
      }),
    );
  }

  /**
   * New caps or shares from the player (takes effect at once). Only a raised (or removed)
   * cap lets the level fall straight to what the windows say; other changes keep the
   * hysteresis.
   */
  setConfig(config: Partial<BudgetConfig>): void {
    const prev = this.caps;
    this.cfg = { thresholds: DEFAULT_THRESHOLDS, ...config };
    this.caps = Budget.capsOf(this.cfg);
    if (Budget.raises(prev, this.caps)) {
      this.current = this.rawLevel();
      this.calmSince = undefined;
    }
  }

  /** Window totals the host already knows (the gateway's ledger, 8.4), added once. */
  seed(snapshot: Partial<Record<CapWindow, Cost>>): void {
    const add = (map: Map<string, { usd: number; tokens: number }>, key: string, c: Cost) => {
      const v = map.get(key) ?? zero();
      v.usd += c.usd ?? 0;
      v.tokens += c.tokens;
      map.set(key, v);
    };
    if (snapshot.day) add(this.days, this.day(), snapshot.day);
    if (snapshot.run) add(this.runs, this.run(), snapshot.run);
    if (snapshot.hour) {
      this.entries.push({
        id: `seed#${this.entries.length}`,
        key: '',
        t: this.clock.now(),
        day: '',
        run: '',
        usd: snapshot.hour.usd ?? 0,
        tokens: snapshot.hour.tokens,
        priced: snapshot.hour.usd !== undefined,
        open: false,
        source: 'game',
        hourOnly: true,
      });
    }
  }

  private day(): string {
    return this.scope.dayKey?.() ?? '';
  }

  private run(): string {
    return this.scope.runId?.() ?? '';
  }

  /** Fold settled entries that left the hour window into the day and run totals. */
  private prune(now: number): void {
    const cutoff = now - HOUR_MS;
    if (!this.entries.some((e) => !e.open && e.t < cutoff)) return;
    const keep: Entry[] = [];
    for (const e of this.entries) {
      if (e.open || e.t >= cutoff) {
        keep.push(e);
        continue;
      }
      if (e.hourOnly) continue;
      for (const [map, key] of [
        [this.days, e.day],
        [this.runs, e.run],
      ] as const) {
        const v = map.get(key) ?? zero();
        v.usd += e.usd;
        v.tokens += e.tokens;
        map.set(key, v);
      }
    }
    this.entries = keep;
    while (this.days.size > KEEP_DAYS) {
      const oldest = [...this.days.keys()].sort()[0] as string;
      this.days.delete(oldest);
    }
  }

  /** Usage of a window (settled plus open reservations), optionally for one share key. */
  used(win: CapWindow, key?: string): { usd: number; tokens: number } {
    const now = this.clock.now();
    this.prune(now);
    const out = zero();
    const day = this.day();
    const run = this.run();
    if (key === undefined) {
      const base =
        win === 'day' ? this.days.get(day) : win === 'run' ? this.runs.get(run) : undefined;
      if (base) {
        out.usd += base.usd;
        out.tokens += base.tokens;
      }
    }
    for (const e of this.entries) {
      if (key !== undefined && e.key !== key) continue;
      if (e.hourOnly && win !== 'hour') continue;
      const inside =
        win === 'hour'
          ? e.open || e.t >= now - HOUR_MS
          : win === 'day'
            ? e.day === day
            : e.run === run;
      if (!inside) continue;
      out.usd += e.usd;
      out.tokens += e.tokens;
    }
    return out;
  }

  /** Hour window spend in US dollars (settled plus open reservations). */
  hourUsd(key?: string): number {
    return this.used('hour', key).usd;
  }

  totalUsd(): number {
    return this.total;
  }

  private ratioOf(win: CapWindow): number {
    const cap = this.caps[win];
    if (!cap) return 0;
    const u = this.used(win);
    let r = 0;
    for (const m of ['usd', 'tokens'] as const) {
      const c = cap[m];
      if (c === undefined) continue;
      // A zero cap is exhausted by any use, and untouched while nothing is spent in it.
      r = Math.max(r, c > 0 ? u[m] / c : u[m] > 0 ? Number.POSITIVE_INFINITY : 0);
    }
    return r;
  }

  private tightest(): { win: CapWindow | null; ratio: number } {
    let best: { win: CapWindow | null; ratio: number } = { win: null, ratio: 0 };
    for (const w of CAP_WINDOWS) {
      if (!this.caps[w]) continue;
      const r = this.ratioOf(w);
      if (best.win === null || r > best.ratio) best = { win: w, ratio: r };
    }
    return best;
  }

  private rawLevel(): DegradeLevel {
    const r = this.tightest().ratio;
    const th = this.cfg.thresholds ?? DEFAULT_THRESHOLDS;
    let level: DegradeLevel = 0;
    th.forEach((x, i) => {
      if (r >= x) level = RUNGS[i] as DegradeLevel;
    });
    return level;
  }

  /** The rung's trigger ratio (the threshold that reaches it). */
  private trigger(level: DegradeLevel): number {
    const th = this.cfg.thresholds ?? DEFAULT_THRESHOLDS;
    const i = RUNGS.findIndex((r) => r >= level);
    return i < 0 ? 0 : (th[i] as number);
  }

  /** Degrade level with hysteresis; evaluated (and remembered) on every call. */
  level(): DegradeLevel {
    const now = this.clock.now();
    const day = this.day();
    const run = this.run();
    const raw = this.rawLevel();
    if (day !== this.lastDay || run !== this.lastRun) {
      // A new calendar day or save line ends the exhaustion of that window at once.
      this.lastDay = day;
      this.lastRun = run;
      this.current = raw;
      this.calmSince = undefined;
      return raw;
    }
    if (raw >= this.current) {
      this.current = raw;
      this.calmSince = undefined;
      return raw;
    }
    const margin = this.cfg.recoverMargin ?? 0.1;
    if (this.ratioOf('hour') >= this.trigger(this.current) - margin) {
      this.calmSince = undefined;
      return this.current;
    }
    if (this.calmSince === undefined) {
      this.calmSince = now;
      return this.current;
    }
    if (now - this.calmSince >= (this.cfg.recoverMs ?? 5 * 60_000)) {
      const lower = [...RUNGS, 0 as DegradeLevel]
        .filter((r) => r < this.current)
        .sort((a, b) => b - a)[0] as DegradeLevel;
      this.current = Math.max(lower, raw) as DegradeLevel;
      this.calmSince = this.current > raw ? now : undefined;
    }
    return this.current;
  }

  /** Whether one reservation is over the single-request limit (a tenth of the hourly cap). */
  tooLarge(cost: Cost): boolean {
    const cap = this.caps.hour;
    if (!cap) return false;
    const f = this.cfg.singleMax ?? 0.1;
    return (
      (cap.usd !== undefined && cost.usd !== undefined && cost.usd > cap.usd * f) ||
      (cap.tokens !== undefined && cost.tokens > cap.tokens * f)
    );
  }

  /**
   * Whether reserving `cost` for `key` keeps every cap: each window in each measure, then the
   * single-request limit, then the key's share of the hourly cap (reserved requests skip
   * shares; test requests skip everything).
   */
  canAfford(key: string, cost: Cost, opts: AffordOptions = {}): AffordVerdict {
    if (opts.source === 'test') return 'ok';
    for (const w of CAP_WINDOWS) {
      const cap = this.caps[w];
      if (!cap) continue;
      const u = this.used(w);
      if (cap.usd !== undefined && cost.usd !== undefined && u.usd + cost.usd > cap.usd) return w;
      if (cap.tokens !== undefined && u.tokens + cost.tokens > cap.tokens) return w;
    }
    if (this.tooLarge(cost)) return 'single';
    const share = this.cfg.roleShares?.[key] ?? opts.share;
    const hour = this.caps.hour;
    if (!opts.reserved && share !== undefined && hour) {
      const u = this.used('hour', key);
      if (hour.usd !== undefined && cost.usd !== undefined && u.usd + cost.usd > hour.usd * share) {
        return 'role';
      }
      if (hour.tokens !== undefined && u.tokens + cost.tokens > hour.tokens * share) return 'role';
    }
    return 'ok';
  }

  reserve(id: string, key: string, cost: Cost, source: 'game' | 'test' = 'game'): void {
    const usd = cost.usd ?? 0;
    this.entries.push({
      id,
      key,
      t: this.clock.now(),
      day: this.day(),
      run: this.run(),
      usd,
      tokens: cost.tokens,
      priced: cost.usd !== undefined,
      open: true,
      source,
    });
    this.total += usd;
  }

  /**
   * Replace a reservation (or an earlier settlement, for example the estimate kept after a
   * timeout when the late answer arrives) by the real cost; keeps the original timestamp,
   * day and run. Without a price the entry keeps counting tokens only.
   */
  settle(id: string, cost: Cost): void {
    const e = this.entries.find((x) => x.id === id);
    if (!e) return;
    const usd = cost.usd ?? 0;
    this.total += usd - e.usd;
    e.usd = usd;
    e.tokens = cost.tokens;
    e.priced = cost.usd !== undefined;
    e.open = false;
  }

  /** Drop a reservation that certainly cost nothing (the call never reached a model). */
  release(id: string): void {
    this.settle(id, { usd: 0, tokens: 0 });
  }

  windowUse(w: CapWindow): WindowUse {
    const u = this.used(w);
    return { ...u, cap: { ...this.caps[w] }, ratio: this.ratioOf(w) };
  }

  snapshot(): BudgetSnapshot {
    const level = this.level();
    const byRole: Record<string, number> = {};
    const now = this.clock.now();
    for (const e of this.entries) {
      if (e.key === '' || !(e.open || e.t >= now - HOUR_MS)) continue;
      byRole[e.key] = (byRole[e.key] ?? 0) + e.usd;
    }
    const t = this.tightest();
    return {
      level,
      hourUsd: this.hourUsd(),
      perHourUsd: this.caps.hour?.usd ?? 0,
      totalUsd: this.total,
      byRole,
      windows: {
        hour: this.windowUse('hour'),
        day: this.windowUse('day'),
        run: this.windowUse('run'),
      },
      tightest: t.win,
      ratio: t.ratio,
      dayKey: this.day(),
      runId: this.run(),
    };
  }
}
