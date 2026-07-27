// Node 22+ ships an experimental `localStorage` global gated behind
// `--localstorage-file`; without that flag the global still exists (as a
// getter that resolves to `undefined`) instead of being absent. Vitest's
// jsdom environment only installs its own working Storage implementation
// for globals that are NOT already present on globalThis, so on a plain
// `node`/`vitest` invocation Node's broken global wins and both
// `window.localStorage` and `globalThis.localStorage` resolve to
// `undefined` in every jsdom-environment test. Replace them with a small
// in-memory Storage-compatible polyfill whenever that happens, so tests
// get a real localStorage/sessionStorage regardless of the Node version
// running them.

function isUsableStorage(storage: unknown): storage is Storage {
  return (
    typeof storage === 'object' &&
    storage !== null &&
    typeof (storage as Storage).clear === 'function'
  );
}

function makeMemoryStorage(): Storage {
  const data = new Map<string, string>();
  const storage: Storage = {
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
  return storage;
}

function ensureUsable(key: 'localStorage' | 'sessionStorage'): void {
  const win = window as unknown as Record<string, unknown>;
  const glob = globalThis as unknown as Record<string, unknown>;
  // window and globalThis must share ONE Storage instance: code may read via
  // either spelling, and a per-target polyfill would silently desync them.
  const shared = isUsableStorage(win[key]) ? (win[key] as Storage) : makeMemoryStorage();
  // Vitest can reuse one jsdom worker across files. setupFiles runs for every
  // file, so reset browser persistence here before the file's modules import;
  // otherwise a locale or settings write in one file becomes order-dependent
  // state in the next file.
  shared.clear();
  // UI tests assert authored English copy unless they explicitly select
  // another locale. Seed that test baseline through the same persisted-locale
  // path used by the app so the fork's Chinese production default does not
  // make upstream UI tests order- or fork-default-dependent.
  if (key === 'localStorage') shared.setItem('locale', 'en');
  for (const target of [window, globalThis] as const) {
    Object.defineProperty(target, key, { value: shared, configurable: true, enumerable: true });
  }
}

if (typeof window !== 'undefined') {
  ensureUsable('localStorage');
  ensureUsable('sessionStorage');
}
