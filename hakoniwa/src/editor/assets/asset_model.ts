// Pure core of the asset review desk (the editor's 素材审核台): the listing shapes the dev
// service returns, filtering and grouping of the asset list, keyboard stepping, candidate
// grouping, and the checks a decision form must pass before it is sent. No DOM.

import type { ManifestRecord, Status, ToolRecord } from '../../../tools/assets/core/manifest';
import type {
  AssetKind,
  AssetRow,
  Candidate,
  CandidateSet,
  KindCounts,
  ReviewEvent,
  RowState,
} from '../../../tools/assets/review/model';

export type {
  AssetKind,
  AssetRow,
  Candidate,
  CandidateSet,
  KindCounts,
  ManifestRecord,
  ReviewEvent,
  RowState,
  Status,
  ToolRecord,
};

export interface DeskListing {
  today: string;
  rows: AssetRow[];
  summary: Record<AssetKind, KindCounts>;
  reasonCodes: { art: string[]; audio: string[] };
  tools: ToolRecord[];
  problems: string[];
}

export type KindFilter = 'all' | AssetKind;
export type StateFilter = 'all' | RowState;

export interface RowFilter {
  query: string;
  kind: KindFilter;
  state: StateFilter;
}

/** Rows matching the filter; the query matches the id or either subject text. */
export function filterRows(rows: readonly AssetRow[], f: RowFilter): AssetRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.kind !== 'all' && r.kind !== f.kind) return false;
    if (f.state !== 'all' && r.state !== f.state) return false;
    if (!q) return true;
    return (
      r.id.toLowerCase().includes(q) ||
      (r.subject?.zh ?? '').toLowerCase().includes(q) ||
      (r.subject?.en ?? '').toLowerCase().includes(q)
    );
  });
}

export interface RowGroup {
  key: string;
  kind: AssetKind;
  category: string;
  rows: AssetRow[];
}

/** Consecutive rows grouped by kind and category (rows arrive sorted that way). */
export function groupRows(rows: readonly AssetRow[]): RowGroup[] {
  const groups: RowGroup[] = [];
  for (const r of rows) {
    const key = `${r.kind}:${r.category}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else groups.push({ key, kind: r.kind, category: r.category, rows: [r] });
  }
  return groups;
}

/** How many rows are in each state (for the filter chips). */
export function stateCounts(rows: readonly AssetRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.state] = (out[r.state] ?? 0) + 1;
  return out;
}

/** The id one step up or down the visible list (wrapping), or the first when none is open. */
export function stepId(rows: readonly AssetRow[], current: string, delta: number): string {
  if (rows.length === 0) return '';
  const i = rows.findIndex((r) => r.id === current);
  if (i < 0) return rows[0]?.id ?? '';
  const next = (i + delta + rows.length) % rows.length;
  return rows[next]?.id ?? '';
}

export interface CandidateGroup {
  group: string;
  candidates: Candidate[];
}

export function candidateGroups(set: CandidateSet | undefined): CandidateGroup[] {
  if (!set) return [];
  const out: CandidateGroup[] = [];
  for (const c of set.candidates) {
    const last = out[out.length - 1];
    if (last && last.group === c.group) last.candidates.push(c);
    else out.push({ group: c.group, candidates: [c] });
  }
  return out;
}

/** The candidate keys the current record was adopted from (the desk notes "picked a+b of n"). */
export function adoptedKeys(record: ManifestRecord | undefined): string[] {
  const m = record ? /picked ([^ ]+) of \d+ candidates/.exec(record.notes) : null;
  return m?.[1] ? m[1].split('+') : [];
}

/** Toggle a key in an ordered pick list; single-pick sets replace the pick. */
export function togglePick(
  picks: readonly string[],
  key: string,
  mode: 'single' | 'sequence',
): string[] {
  if (picks.includes(key)) return picks.filter((k) => k !== key);
  return mode === 'single' ? [key] : [...picks, key];
}

export type DecisionProblem = 'needReason' | 'needReviewer';

/** What stops a decision form from being sent (mirrors the server's rules). */
export function decisionProblems(
  status: Status,
  reasons: readonly string[],
  reviewer: string,
): DecisionProblem[] {
  const out: DecisionProblem[] = [];
  if ((status === 'rework' || status === 'rejected') && reasons.length === 0)
    out.push('needReason');
  if (status !== 'review' && reviewer.trim() === '') out.push('needReviewer');
  return out;
}

/** URL of a file under assets/ as Vite serves it in dev. */
export function assetUrl(relative: string): string {
  return `/assets/${relative.split('/').map(encodeURIComponent).join('/')}`;
}

/** Short metric line for a candidate, e.g. "-18 LUFS, TP -3.8, 128.8 s, 7931 MiB". */
export function metricText(m: Record<string, number | string>): string {
  const parts: string[] = [];
  if (typeof m.lufs === 'number') parts.push(`${m.lufs} LUFS`);
  if (typeof m.truePeak === 'number') parts.push(`TP ${m.truePeak}`);
  if (typeof m.generationSeconds === 'number') parts.push(`${m.generationSeconds} s`);
  if (typeof m.peakGpuMiB === 'number') parts.push(`${m.peakGpuMiB} MiB`);
  return parts.join(', ');
}

/** Is the file an image the desk can show (by extension)? */
export function isImagePath(path: string): boolean {
  return /\.(png|webp|jpe?g)$/i.test(path);
}
