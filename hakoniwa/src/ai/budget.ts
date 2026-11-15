// Budgeter: a sliding 60 real-minute spend window (reserve first, settle with real usage),
// per-role caps, an optional cap per runner lifetime, and the degradation level the
// runner applies (D-036: first lower the tier, then decline, finally everything falls back
// to rules; the world clock never stops). See docs/50_tech/ai_architecture.md 2.3.3, 9.4.

import type { Clock } from './contracts';

export interface BudgetConfig {
  /** Spend cap for any sliding 60 real-minute window, in US dollars. */
  perHourUsd: number;
  /** Optional cap on everything this runner spends. */
  totalUsd?: number;
  /** Per-role caps as a fraction of perHourUsd; overrides the role pack's budgetShare. */
  roleShares?: Record<string, number>;
  /**
   * Hourly-window usage ratios that raise the degradation level:
   * [lower tiers, decline routine and background, reserved roles only, everything falls back].
   */
  thresholds?: readonly [number, number, number, number];
}

/**
 * Degradation level, cumulative:
 * 0 normal; 1 non-reserved roles drop one tier; 2 routine (C) and background (D) roles
 * decline; 3 only reserved roles call a model; 4 every request falls back to rules.
 */
export type DegradeLevel = 0 | 1 | 2 | 3 | 4;

const DEFAULT_THRESHOLDS: readonly [number, number, number, number] = [0.6, 0.8, 0.9, 1];

export const DEFAULT_BUDGET: Readonly<BudgetConfig> = {
  perHourUsd: 1,
  thresholds: DEFAULT_THRESHOLDS,
};

const HOUR_MS = 60 * 60 * 1000;

interface Entry {
  id: string;
  role: string;
  t: number;
  usd: number;
  /** true while only reserved (not yet settled) */
  open: boolean;
}

export interface BudgetSnapshot {
  level: DegradeLevel;
  hourUsd: number;
  perHourUsd: number;
  totalUsd: number;
  byRole: Record<string, number>;
}

export type AffordVerdict = 'ok' | 'hour' | 'role' | 'total';

export class Budget {
  private entries: Entry[] = [];
  private total = 0;
  readonly config: BudgetConfig;

  constructor(
    config: Partial<BudgetConfig>,
    private readonly clock: Clock,
  ) {
    this.config = { ...DEFAULT_BUDGET, ...config };
  }

  private prune(now: number): void {
    const cutoff = now - HOUR_MS;
    if (this.entries.length && (this.entries[0] as Entry).t < cutoff) {
      this.entries = this.entries.filter((e) => e.open || e.t >= cutoff);
    }
  }

  /** Spend (settled plus open reservations) in the current 60-minute window. */
  hourUsd(role?: string): number {
    this.prune(this.clock.now());
    let sum = 0;
    for (const e of this.entries) if (!role || e.role === role) sum += e.usd;
    return sum;
  }

  totalUsd(): number {
    return this.total;
  }

  level(): DegradeLevel {
    const cap = this.config.perHourUsd;
    if (this.config.totalUsd !== undefined && this.total >= this.config.totalUsd) return 4;
    if (!(cap > 0)) return 4;
    const r = this.hourUsd() / cap;
    const [t1, t2, t3, t4] = this.config.thresholds ?? DEFAULT_THRESHOLDS;
    if (r >= t4) return 4;
    if (r >= t3) return 3;
    if (r >= t2) return 2;
    if (r >= t1) return 1;
    return 0;
  }

  /** Whether spending `usd` more for `role` stays inside every cap. */
  canAfford(
    role: string,
    usd: number,
    share: number | undefined,
    reserved: boolean,
  ): AffordVerdict {
    const cap = this.config.perHourUsd;
    if (this.config.totalUsd !== undefined && this.total + usd > this.config.totalUsd)
      return 'total';
    if (this.hourUsd() + usd > cap) return 'hour';
    if (!reserved) {
      const s = this.config.roleShares?.[role] ?? share;
      if (s !== undefined && this.hourUsd(role) + usd > cap * s) return 'role';
    }
    return 'ok';
  }

  reserve(id: string, role: string, usd: number): void {
    this.entries.push({ id, role, t: this.clock.now(), usd, open: true });
    this.total += usd;
  }

  /**
   * Replace a reservation (or an earlier settlement, for example the estimate kept after a
   * timeout when the late answer arrives) by the real cost; keeps the original timestamp.
   */
  settle(id: string, usd: number): void {
    const e = this.entries.find((x) => x.id === id);
    if (!e) return;
    this.total += usd - e.usd;
    e.usd = usd;
    e.open = false;
  }

  /** Drop a reservation that certainly cost nothing (the call never reached a model). */
  release(id: string): void {
    this.settle(id, 0);
  }

  snapshot(): BudgetSnapshot {
    const byRole: Record<string, number> = {};
    this.prune(this.clock.now());
    for (const e of this.entries) byRole[e.role] = (byRole[e.role] ?? 0) + e.usd;
    return {
      level: this.level(),
      hourUsd: this.hourUsd(),
      perHourUsd: this.config.perHourUsd,
      totalUsd: this.total,
      byRole,
    };
  }
}
