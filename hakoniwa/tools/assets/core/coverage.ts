// Coverage and the milestone art gate (art_pipeline.md 6.6 and 15.4). With ART_GATE=<milestone>
// every prompt entry of that milestone and the earlier ones must be registered, approved and
// (for non-reference images) have a current processed result. The content report lists
// content ids with no art subject in the prompt library, counting alias subjects (aliases.ts)
// as covered by the subject whose art they share.

import { artSubject } from './aliases';
import type { ExpectedEntry, ManifestRecord } from './manifest';

const ORDER = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6'];

/** Milestones a gate covers: ART_GATE=M1 means M0 and M1. */
export function gateMilestones(gate: string): string[] {
  const i = ORDER.indexOf(gate.trim().toUpperCase());
  if (i < 0) throw new Error(`ART_GATE must be one of ${ORDER.join(', ')}`);
  return ORDER.slice(0, i + 1);
}

export interface GateReport {
  /** Entries without a manifest record. */
  missing: string[];
  /** Records not approved (review, rework, rejected, retired). */
  notApproved: string[];
  /** Approved images without a current, clean processed result. */
  notProcessed: string[];
}

export function gateReport(
  expected: Iterable<ExpectedEntry>,
  records: readonly ManifestRecord[],
  processedOk: (rec: ManifestRecord) => boolean,
  gate: string,
  isReferenceTemplate: (template: string) => boolean,
): GateReport {
  const ms = new Set(gateMilestones(gate));
  const byId = new Map(records.map((r) => [r.id, r]));
  const report: GateReport = { missing: [], notApproved: [], notProcessed: [] };
  for (const e of expected) {
    if (!ms.has(e.milestone)) continue;
    const r = byId.get(e.id);
    if (!r) report.missing.push(e.id);
    else if (r.status !== 'approved') report.notApproved.push(e.id);
    else if (e.kind === 'image' && !isReferenceTemplate(e.template) && !processedOk(r))
      report.notProcessed.push(e.id);
    else if (e.kind === 'audio' && !processedOk(r)) report.notProcessed.push(e.id);
  }
  return report;
}

/**
 * Content ids (monsters, bosses, named NPCs...) whose art subject has no prompt entry with the
 * given class prefixes. `prefixes` are tried in order, e.g. ['art_mon_', 'art_boss_'].
 */
export function uncoveredContent(
  contentIds: readonly string[],
  expectedIds: Iterable<string>,
  prefixes: readonly string[],
): string[] {
  const ids = [...expectedIds];
  return contentIds.filter((id) => {
    const subject = artSubject(id);
    return !prefixes.some((p) =>
      ids.some((e) => e === `${p}${subject}` || e.startsWith(`${p}${subject}_`)),
    );
  });
}
