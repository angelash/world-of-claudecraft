// Map editing session: edits reach the store, undo and redo write back, batches write
// once, and changes made elsewhere are adopted. The fake store notifies synchronously
// on write and the listener reconciles, exactly like Workspace.subscribe feeding the
// map tool: a regression test for edits being discarded by their own write-back.

import { describe, expect, it } from 'vitest';
import { blankMap, paintCells } from '../src/editor/map/map_ops';
import { MapEditSession, type MapStore } from '../src/editor/map/map_session';
import { cloneJson } from '../src/editor/util/json';
import type { MapDef } from '../src/systems/world/types';

const KEY = 'world/maps_test.json#0';

class Store implements MapStore {
  maps = new Map<string, MapDef>();
  writes = 0;
  onWrite: (() => void) | null = null;
  get(key: string) {
    return this.maps.get(key) ?? null;
  }
  set(key: string, map: MapDef) {
    this.writes++;
    this.maps.set(key, map);
    this.onWrite?.();
  }
}

function setup() {
  const store = new Store();
  store.maps.set(KEY, blankMap('m', 'M', 6, 4));
  const session = new MapEditSession(store);
  // The workspace notifies subscribers synchronously; the map tool reconciles there.
  store.onWrite = () => session.reconcile(KEY);
  return { store, session };
}

const paint = (m: MapDef, x: number) => paintCells(m, [{ x, y: 1 }], '#');

describe('MapEditSession', () => {
  it('writes an edit to the store and keeps it through the store notification', () => {
    const { store, session } = setup();
    const next = paint(session.present(KEY) as MapDef, 2);
    session.apply(KEY, next);
    expect(store.get(KEY)).toBe(next);
    expect(session.present(KEY)).toBe(next);
    expect(session.history(KEY)?.canUndo).toBe(true);
  });

  it('undoes and redoes through the store', () => {
    const { store, session } = setup();
    const start = session.present(KEY) as MapDef;
    session.apply(KEY, paint(start, 2));
    expect(session.undo(KEY)).toBe(true);
    expect(store.get(KEY)).toBe(start);
    expect(session.redo(KEY)).toBe(true);
    expect(store.get(KEY)?.rows[1]?.[2]).toBe('#');
    expect(session.redo(KEY)).toBe(false);
  });

  it('writes a batch once, when it ends', () => {
    const { store, session } = setup();
    session.begin(KEY);
    for (let x = 1; x <= 4; x++) session.apply(KEY, paint(session.present(KEY) as MapDef, x));
    expect(store.writes).toBe(0);
    session.end(KEY);
    expect(store.writes).toBe(1);
    expect(store.get(KEY)?.rows[1]).toBe('######');
    expect(session.undo(KEY)).toBe(true);
    expect(store.get(KEY)?.rows[1]).toBe('#....#');
  });

  it('keeps an open batch when the store changes underneath', () => {
    const { store, session } = setup();
    session.begin(KEY);
    session.apply(KEY, paint(session.present(KEY) as MapDef, 2));
    expect(session.reconcile(KEY)).toBe(false);
    session.cancel(KEY);
    expect(session.present(KEY)).toBe(store.get(KEY));
  });

  it('adopts an outside change and forgets the old history', () => {
    const { store, session } = setup();
    session.apply(KEY, paint(session.present(KEY) as MapDef, 2));
    const outside = { ...(store.get(KEY) as MapDef), name: 'renamed elsewhere' };
    store.maps.set(KEY, outside);
    expect(session.reconcile(KEY)).toBe(true);
    expect(session.present(KEY)).toBe(outside);
    expect(session.history(KEY)?.canUndo).toBe(false);
  });

  it('keeps the history when the store holds an equal copy (draft cleared back to disk)', () => {
    const { store, session } = setup();
    session.apply(KEY, paint(session.present(KEY) as MapDef, 2));
    store.maps.set(KEY, cloneJson(store.get(KEY) as MapDef));
    expect(session.reconcile(KEY)).toBe(false);
    expect(session.history(KEY)?.canUndo).toBe(true);
  });

  it('drops the history of an entry that is gone', () => {
    const { store, session } = setup();
    session.present(KEY);
    store.maps.delete(KEY);
    expect(session.reconcile(KEY)).toBe(true);
    expect(session.history(KEY)).toBeUndefined();
  });
});
