// Map editing session: one undo history per map, edits written back to a store (the
// workspace), and changes made elsewhere adopted without losing in-flight edits.
// The store may notify synchronously on write (the workspace does), so write-back and
// reconcile must never fight: reconcile only adopts a stored map that differs from the
// history's present AND did not come from this session. Pure: no DOM.

import type { MapDef } from '../../systems/world/types';
import { History } from '../util/history';
import { deepEqual } from '../util/json';

export interface MapStore {
  /** The stored map for an entry key, or null when the entry is gone or not a map. */
  get(key: string): MapDef | null;
  set(key: string, map: MapDef): void;
}

export class MapEditSession {
  private readonly histories = new Map<string, History<MapDef>>();

  constructor(private readonly store: MapStore) {}

  history(key: string): History<MapDef> | undefined {
    let hist = this.histories.get(key);
    if (!hist) {
      const map = this.store.get(key);
      if (!map) return undefined;
      hist = new History(map);
      this.histories.set(key, hist);
    }
    return hist;
  }

  present(key: string): MapDef | undefined {
    return this.history(key)?.present;
  }

  /** Record an edit; written to the store unless a batch (stroke, drag) is open. */
  apply(key: string, next: MapDef): void {
    const hist = this.history(key);
    if (!hist) return;
    hist.commit(next);
    if (!hist.inBatch) this.writeBack(key);
  }

  begin(key: string): void {
    this.history(key)?.begin();
  }

  /** Close a batch and write its result. */
  end(key: string): void {
    const hist = this.histories.get(key);
    if (!hist?.inBatch) return;
    hist.end();
    this.writeBack(key);
  }

  cancel(key: string): void {
    this.histories.get(key)?.cancel();
  }

  undo(key: string): boolean {
    const hist = this.history(key);
    if (!hist || hist.undo() === undefined) return false;
    this.writeBack(key);
    return true;
  }

  redo(key: string): boolean {
    const hist = this.history(key);
    if (!hist || hist.redo() === undefined) return false;
    this.writeBack(key);
    return true;
  }

  /**
   * Adopt the stored version when it was changed elsewhere (content editor, discard,
   * reload). Returns true when the history was reset.
   */
  reconcile(key: string): boolean {
    const hist = this.histories.get(key);
    if (!hist || hist.inBatch) return false;
    const stored = this.store.get(key);
    if (!stored) {
      this.histories.delete(key);
      return true;
    }
    if (stored === hist.present || deepEqual(stored, hist.present)) return false;
    hist.reset(stored);
    return true;
  }

  /** Forget every history (for example after the entries were re-indexed). */
  clear(): void {
    this.histories.clear();
  }

  private writeBack(key: string): void {
    const hist = this.histories.get(key);
    if (!hist) return;
    const stored = this.store.get(key);
    if (stored === hist.present) return;
    this.store.set(key, hist.present);
  }
}
