// Row-level difference between the saved and the edited version of a data file, shown
// in the save review. Rows are matched by id; rows without an id by position. Pure.

import { deepEqual } from '../util/json';
import { idOf, type Row } from './rows';

export interface RowDiff {
  added: string[];
  removed: string[];
  changed: { id: string; fields: string[] }[];
  /** same rows, different order */
  reordered: boolean;
}

function keysOf(rows: readonly Row[], idField: string): string[] {
  return rows.map((r, i) => idOf(r, idField) ?? `#${i + 1}`);
}

export function diffRows(before: readonly Row[], after: readonly Row[], idField: string): RowDiff {
  const bKeys = keysOf(before, idField);
  const aKeys = keysOf(after, idField);
  const bMap = new Map<string, Row>();
  bKeys.forEach((k, i) => {
    if (!bMap.has(k)) bMap.set(k, before[i] as Row);
  });
  const aMap = new Map<string, Row>();
  aKeys.forEach((k, i) => {
    if (!aMap.has(k)) aMap.set(k, after[i] as Row);
  });
  const added = aKeys.filter((k) => !bMap.has(k));
  const removed = bKeys.filter((k) => !aMap.has(k));
  const changed: { id: string; fields: string[] }[] = [];
  for (const k of aKeys) {
    const b = bMap.get(k);
    const a = aMap.get(k);
    if (!b || !a || changed.some((c) => c.id === k)) continue;
    const fields = changedFields(b, a);
    if (fields.length > 0) changed.push({ id: k, fields });
  }
  const commonB = bKeys.filter((k) => aMap.has(k));
  const commonA = aKeys.filter((k) => bMap.has(k));
  const reordered = commonA.length === commonB.length && commonA.some((k, i) => k !== commonB[i]);
  return { added, removed, changed, reordered };
}

export function changedFields(before: Row, after: Row): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => !deepEqual(before[k], after[k]));
}

export function isEmptyDiff(d: RowDiff): boolean {
  return d.added.length + d.removed.length + d.changed.length === 0 && !d.reordered;
}
