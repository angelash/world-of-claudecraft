// Hand-rolled browser and shell fakes for tests/platform_host.test.ts: a Storage-like map
// that can run out of quota, the slice of IndexedDB the web save store uses (requests and
// transactions settle on later macrotasks and a transaction commits once nothing is pending,
// like a real one), and an ipcRenderer for building a real window.hk with createHkBridge.

import type { IpcRendererLike } from '../desktop/bridge';

export class FakeStorage {
  readonly map = new Map<string, string>();
  /** When set, setItem throws a quota error. */
  full = false;
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.full) {
      const err = new Error('quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

type Handler = (() => void) | null;

interface FakeRequest {
  result: unknown;
  error: Error | null;
  onsuccess: Handler;
  onerror: Handler;
  onupgradeneeded?: Handler;
}

const later = (fn: () => void) => {
  setTimeout(fn, 0);
};

function fakeDb(stores: Map<string, Map<string, unknown>>) {
  return {
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore(name: string) {
      stores.set(name, new Map());
    },
    close() {},
    transaction(name: string, mode: 'readonly' | 'readwrite', _opts?: unknown) {
      const data = stores.get(name);
      if (!data) throw new Error(`no object store ${name}`);
      let pending = 0;
      let finished = false;
      const tx = {
        error: null as Error | null,
        oncomplete: null as Handler,
        onabort: null as Handler,
        onerror: null as Handler,
        abort() {
          if (finished) return;
          finished = true;
          later(() => tx.onabort?.());
        },
        objectStore: () => store,
      };
      const settle = () =>
        later(() => {
          if (finished || pending > 0) return;
          finished = true;
          tx.oncomplete?.();
        });
      const request = (op: () => unknown): FakeRequest => {
        const r: FakeRequest = { result: undefined, error: null, onsuccess: null, onerror: null };
        pending++;
        later(() => {
          if (finished) return;
          r.result = op();
          pending--;
          r.onsuccess?.();
          settle();
        });
        return r;
      };
      const writable = () => {
        if (mode !== 'readwrite') throw new Error('read-only transaction');
      };
      const store = {
        get: (key: string) => request(() => data.get(key)),
        getAllKeys: () => request(() => [...data.keys()]),
        put: (value: unknown, key: string) => {
          writable();
          return request(() => {
            data.set(key, value);
            return key;
          });
        },
        delete: (key: string) => {
          writable();
          return request(() => {
            data.delete(key);
            return undefined;
          });
        },
      };
      settle();
      return tx;
    },
  };
}

export interface FakeIndexedDB {
  readonly factory: IDBFactory;
  readonly opened: string[];
  /** Every key of a database's object store. */
  keys(db: string, store?: string): string[];
}

/** One browser profile's IndexedDB; two hosts given the same one share their data. */
export function fakeIndexedDB(opts: { failOpen?: boolean } = {}): FakeIndexedDB {
  const dbs = new Map<string, Map<string, Map<string, unknown>>>();
  const opened: string[] = [];
  const factory = {
    open(name: string, _version?: number): FakeRequest {
      opened.push(name);
      const r: FakeRequest = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      later(() => {
        if (opts.failOpen) {
          r.error = new Error('the user denied storage');
          r.onerror?.();
          return;
        }
        let stores = dbs.get(name);
        const fresh = !stores;
        if (!stores) {
          stores = new Map();
          dbs.set(name, stores);
        }
        r.result = fakeDb(stores);
        if (fresh) r.onupgradeneeded?.();
        r.onsuccess?.();
      });
      return r;
    },
  };
  return {
    factory: factory as unknown as IDBFactory,
    opened,
    keys: (db, store = 'files') => [...(dbs.get(db)?.get(store)?.keys() ?? [])].sort(),
  };
}

export interface FakeIpc {
  readonly ipc: IpcRendererLike;
  readonly invoked: { channel: string; args: unknown[] }[];
  readonly sent: { channel: string; args: unknown[] }[];
  /** Push a main-to-renderer message to the bridge's listeners. */
  push(channel: string, value: unknown): void;
  listenerCount(channel: string): number;
}

/** An ipcRenderer whose invoke answers come from `answer` (default not_implemented). */
export function fakeIpc(
  answer: (channel: string, payload: unknown) => unknown = () => ({
    ok: false,
    reason: 'not_implemented',
  }),
): FakeIpc {
  const invoked: { channel: string; args: unknown[] }[] = [];
  const sent: { channel: string; args: unknown[] }[] = [];
  const listeners = new Map<string, Set<(event: unknown, ...args: unknown[]) => void>>();
  const ipc: IpcRendererLike = {
    invoke: async (channel, ...args) => {
      invoked.push({ channel, args });
      return answer(channel, args[0]);
    },
    send: (channel, ...args) => {
      sent.push({ channel, args });
    },
    postMessage: (channel, message) => {
      sent.push({ channel, args: [message] });
    },
    on: (channel, listener) => {
      let set = listeners.get(channel);
      if (!set) {
        set = new Set();
        listeners.set(channel, set);
      }
      set.add(listener);
      return ipc;
    },
    removeListener: (channel, listener) => {
      listeners.get(channel)?.delete(listener);
      return ipc;
    },
  };
  return {
    ipc,
    invoked,
    sent,
    push: (channel, value) => {
      for (const l of [...(listeners.get(channel) ?? [])]) l({ sender: 'main' }, value);
    },
    listenerCount: (channel) => listeners.get(channel)?.size ?? 0,
  };
}
