// AI audit desk model: filters, facets and a summary over AuditRecord lists (the live
// AuditLog or a page of the on-disk history from GET /api/audit). Pure: no DOM.

import type { AuditRecord } from '../../ai/audit';
import { percentile } from '../util/stats';

export { percentile } from '../util/stats';

export type HistoryRecord = AuditRecord & { receivedAt?: string };

export interface AuditFilter {
  agent: string;
  role: string;
  outcome: string;
  reason: string;
  /** 'leak': the runner found locked phrases; 'clean': it did not */
  leak: 'all' | 'leak' | 'clean';
  /** free text over agent, purpose, speech, thought, detail, raw output */
  text: string;
}

export const EMPTY_FILTER: AuditFilter = {
  agent: '',
  role: '',
  outcome: '',
  reason: '',
  leak: 'all',
  text: '',
};

/** Dollars with fixed decimals; float residue around zero (reservations refunded) shows as 0. */
export function formatUsd(v: number, digits = 4): string {
  return (Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v).toFixed(digits);
}

export function hasLeak(r: Readonly<AuditRecord>): boolean {
  return (r.leaks?.length ?? 0) > 0 || r.reason === 'leak';
}

/** Matching records, newest first. */
export function filterAudit<R extends Readonly<AuditRecord>>(
  records: readonly R[],
  f: AuditFilter,
): R[] {
  const q = f.text.trim().toLowerCase();
  const out: R[] = [];
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i] as R;
    if (f.agent && r.agentId !== f.agent) continue;
    if (f.role && r.role !== f.role) continue;
    if (f.outcome && r.outcome !== f.outcome) continue;
    if (f.reason && (r.reason ?? '') !== f.reason) continue;
    if (f.leak === 'leak' && !hasLeak(r)) continue;
    if (f.leak === 'clean' && hasLeak(r)) continue;
    if (q) {
      const hay = [
        r.agentId,
        r.role,
        r.purpose,
        r.speech,
        r.thought,
        r.detail,
        r.rawOutput,
        r.reason,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push(r);
  }
  return out;
}

export interface AuditFacets {
  agents: string[];
  roles: string[];
  outcomes: string[];
  reasons: string[];
}

export function auditFacets(records: readonly Readonly<AuditRecord>[]): AuditFacets {
  const agents = new Set<string>();
  const roles = new Set<string>();
  const outcomes = new Set<string>();
  const reasons = new Set<string>();
  for (const r of records) {
    agents.add(r.agentId);
    roles.add(r.role);
    outcomes.add(r.outcome);
    if (r.reason) reasons.add(r.reason);
  }
  const sort = (s: Set<string>) => [...s].sort();
  return {
    agents: sort(agents),
    roles: sort(roles),
    outcomes: sort(outcomes),
    reasons: sort(reasons),
  };
}

export interface AuditSummary {
  total: number;
  byOutcome: Record<string, number>;
  costUsd: number;
  /** answered calls only (records with a latency) */
  meanLatencyMs: number;
  p90LatencyMs: number;
  leaks: number;
  rejectedCommands: number;
  acceptedCommands: number;
  inputTokens: number;
  outputTokens: number;
}

export function summarizeAudit(records: readonly Readonly<AuditRecord>[]): AuditSummary {
  const byOutcome: Record<string, number> = {};
  const latencies: number[] = [];
  let costUsd = 0;
  let leaks = 0;
  let rejectedCommands = 0;
  let acceptedCommands = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const r of records) {
    byOutcome[r.outcome] = (byOutcome[r.outcome] ?? 0) + 1;
    costUsd += r.costUsd ?? 0;
    if (typeof r.latencyMs === 'number') latencies.push(r.latencyMs);
    if (hasLeak(r)) leaks++;
    rejectedCommands += r.rejected?.length ?? 0;
    if (r.outcome === 'proposal') acceptedCommands += r.commands?.length ?? 0;
    inputTokens += r.usage?.inputTokens ?? 0;
    outputTokens += r.usage?.outputTokens ?? 0;
  }
  const mean = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  return {
    total: records.length,
    byOutcome,
    costUsd,
    meanLatencyMs: mean,
    p90LatencyMs: percentile(latencies, 0.9),
    leaks,
    rejectedCommands,
    acceptedCommands,
    inputTokens,
    outputTokens,
  };
}

export interface HistoryPage {
  total: number;
  offset: number;
  limit: number;
  skipped: number;
  records: HistoryRecord[];
}

/** Validate a GET /api/audit body. */
export function parseHistoryPage(body: unknown): HistoryPage | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  if (!Array.isArray(o.records)) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const records = o.records.filter(
    (r): r is HistoryRecord =>
      !!r && typeof r === 'object' && typeof (r as AuditRecord).auditId === 'string',
  );
  return {
    total: num(o.total),
    offset: num(o.offset),
    limit: num(o.limit),
    skipped: num(o.skipped),
    records,
  };
}

/** The texts of a record worth a reveal-ledger review, labelled by field. */
export function recordTexts(r: Readonly<AuditRecord>): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = [];
  const add = (field: string, text: string | undefined) => {
    if (text) out.push({ field, text });
  };
  add('prompt.system', r.prompt?.system);
  add('prompt.stable', r.prompt?.stable);
  add('prompt.context', r.prompt?.context);
  add('playerText', r.playerText);
  add('rawOutput', r.rawOutput);
  add('speech', r.speech);
  add('thought', r.thought);
  return out;
}
