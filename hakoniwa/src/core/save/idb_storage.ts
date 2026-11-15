// SaveStorage over IndexedDB: the web build's byte store (release_engineering.md 5.2), so
// the browser runs the same container as the desktop main process. One object store keyed
// by the relative path. A rename is one readwrite transaction (get, put, delete), so it is
// atomic like a file-system rename; writes ask for strict durability where supported.
// The factory is injected (the client passes the page's indexedDB), so this module reads
// no browser global and the barrel does not export it.

import { assertSafePath, type SaveStorage, type StoredStat } from './storage';

const STORE = 'files';

interface Row {
  data: Uint8Array;
  mtimeMs: number;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
}

export interface IdbStorageOptions {
  /** database name; default `hakoniwa-saves` */
  name?: string;
  /** wall clock for file times (injected) */
  now: () => number;
  /** give up opening after this long (a blocked upgrade never settles); default 5 s */
  openTimeoutMs?: number;
}

export class IdbStorage implements SaveStorage {
  private constructor(
    private readonly db: IDBDatabase,
    private readonly now: () => number,
  ) {}

  /** Open (and create on first use) the save database. */
  static open(factory: IDBFactory, opts: IdbStorageOptions): Promise<IdbStorage> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(new Error('IndexedDB open timed out'));
      }, opts.openTimeoutMs ?? 5000);
      const r = factory.open(opts.name ?? 'hakoniwa-saves', 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
      };
      r.onsuccess = () => {
        clearTimeout(timer);
        const db = r.result;
        // Opened after we gave up: let it go rather than hold the database.
        if (settled) {
          db.close();
          return;
        }
        settled = true;
        // A newer page wants to upgrade the database: step aside instead of blocking it.
        db.onversionchange = () => db.close();
        resolve(new IdbStorage(db, opts.now));
      };
      r.onerror = () => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        reject(r.error ?? new Error('IndexedDB open failed'));
      };
    });
  }

  private tx(mode: IDBTransactionMode): IDBTransaction {
    if (mode === 'readwrite') {
      try {
        return this.db.transaction(STORE, mode, { durability: 'strict' });
      } catch {
        // Older engines take no options.
      }
    }
    return this.db.transaction(STORE, mode);
  }

  async read(path: string): Promise<Uint8Array | null> {
    assertSafePath(path);
    const row = (await req(this.tx('readonly').objectStore(STORE).get(path))) as Row | undefined;
    return row ? new Uint8Array(row.data) : null;
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    assertSafePath(path);
    const tx = this.tx('readwrite');
    const row: Row = { data: data.slice(), mtimeMs: this.now() };
    tx.objectStore(STORE).put(row, path);
    await done(tx);
  }

  async rename(from: string, to: string): Promise<void> {
    assertSafePath(from);
    assertSafePath(to);
    const tx = this.tx('readwrite');
    const store = tx.objectStore(STORE);
    const finished = done(tx);
    let row: Row | undefined;
    try {
      row = (await req(store.get(from))) as Row | undefined;
    } catch (err) {
      await finished.catch(() => undefined);
      throw err;
    }
    if (!row) {
      tx.abort();
      await finished.catch(() => undefined);
      throw new Error(`rename: no such file ${from}`);
    }
    store.put(row, to);
    store.delete(from);
    await finished;
  }

  async remove(path: string): Promise<void> {
    assertSafePath(path);
    const tx = this.tx('readwrite');
    tx.objectStore(STORE).delete(path);
    await done(tx);
  }

  async list(dir: string): Promise<string[]> {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    // A save directory holds tens to a few hundred files: filter all keys.
    const keys = await req(this.tx('readonly').objectStore(STORE).getAllKeys());
    return keys
      .map(String)
      .filter((k) => k.startsWith(prefix))
      .sort();
  }

  async stat(path: string): Promise<StoredStat | null> {
    const row = (await req(this.tx('readonly').objectStore(STORE).get(path))) as Row | undefined;
    return row ? { bytes: row.data.length, mtimeMs: row.mtimeMs } : null;
  }

  close(): void {
    this.db.close();
  }
}
