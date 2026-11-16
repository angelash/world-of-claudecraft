// SettingsStore (release_engineering.md 13.10, D-088): the renderer's settings, read once at
// start from PlatformHost.settings (the desktop settings files through hk:settings.*, local
// storage on the web) and written back through it. Reads are synchronous after open, so the
// session and the windows never wait on storage; writes are queued per part, coalesced, and
// the host's answer (the values as stored, after its own checks) becomes the cached copy.
// A part from a newer version, or one the host could not read, is used but never written.
//
// Opening also moves the three settings the first builds kept in loose local storage keys,
// once: `hk.quality` and `hk.view` into the local part, and the legacy model switch
// `hakoniwa.settings.ai` into the `llm` partition through the model settings' own migration
// (src/ai/llm_config/migrate.ts). A key is removed only after the part holding its value has
// been written, or when the part already has that field (the stored value wins).
//
// The `llm` partition belongs to the model settings: the AI bridge reads and writes it
// through llmPartStore(), so every write of the local part goes through this one queue.

import {
  LEGACY_AI_SWITCH_KEY,
  LLM_PARTITION,
  readLlmPartition,
  writeLlmPartition,
} from '../../ai/llm_config/migrate';
import {
  checkPatch,
  defaultSettings,
  isPlainObject,
  type LocalPatch,
  type LocalSettings,
  type Normalized,
  type NormalizeOptions,
  normalizeSettings,
  type PartPatch,
  type PartValues,
  type SettingsPart,
  type StoredView,
  type SyncPatch,
  type SyncSettings,
  storedForm,
} from './settings_schema';

/** Legacy local storage keys of the first builds (13.10). */
export const LEGACY_KEYS = Object.freeze({
  quality: 'hk.quality',
  view: 'hk.view',
  aiSwitch: LEGACY_AI_SWITCH_KEY,
});

type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

/** PlatformHost.settings, structurally. */
export interface SettingsBackendLike {
  get(part: SettingsPart): Promise<Result<Record<string, unknown> | null>>;
  set(
    part: SettingsPart,
    values: Record<string, unknown>,
  ): Promise<Result<Record<string, unknown>>>;
}

/** The Storage methods the legacy move uses (window.localStorage has them). */
export interface LegacyStore {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

export interface SettingsStoreOptions {
  /** Where the legacy keys live (the page's local storage); null skips the move. */
  legacy?: LegacyStore | null;
  /**
   * Leave a legacy model switch that is not 'off' for the AI bridge, which migrates it with
   * the dev proxy's answer (development builds, llm_providers.md 4.7). Elsewhere no dev
   * proxy exists, so the switch migrates here, to "off".
   */
  deferLegacyAiOn?: boolean;
  /** The web demo (the model settings' address rules). */
  web?: boolean;
  /** Developer log (English). */
  log?: (message: string) => void;
  /** Migration table and target versions (tests); default the shipped schema. */
  schema?: NormalizeOptions;
}

/** The local part as the AI bridge reads and writes it (its LocalSettingsStore). */
export interface LlmPartStore {
  get(part: 'local'): Promise<Result<Record<string, unknown> | null>>;
  set(part: 'local', values: Record<string, unknown>): Promise<Result<Record<string, unknown>>>;
}

interface PartState<P extends SettingsPart> {
  current: Normalized<P>;
  /** The host answered the read; when false the part is used but never written. */
  readable: boolean;
  /** The host had something stored (a raw object, before checks). */
  stored: Record<string, unknown> | null;
  dirty: boolean;
  queued: boolean;
  /** The last write landed (true before any write). */
  lastOk: boolean;
}

function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export class SettingsStore {
  private readonly parts: { [P in SettingsPart]: PartState<P> };
  private chain: Promise<void> = Promise.resolve();

  private constructor(
    private readonly backend: SettingsBackendLike,
    parts: { [P in SettingsPart]: PartState<P> },
    private readonly log: (message: string) => void,
  ) {
    this.parts = parts;
  }

  /** Read both parts, migrate the legacy keys once, and answer the open store. */
  static async open(
    backend: SettingsBackendLike,
    opts: SettingsStoreOptions = {},
  ): Promise<SettingsStore> {
    const log = opts.log ?? (() => {});
    const read = async <P extends SettingsPart>(part: P): Promise<PartState<P>> => {
      const got = await backend.get(part).catch(() => null);
      let readable = got?.ok === true;
      const stored = got?.ok && isPlainObject(got.value) ? got.value : null;
      if (!readable) log(`[settings] the ${part} part could not be read; it will not be written`);
      let current: Normalized<P>;
      try {
        current = normalizeSettings(part, stored, opts.schema);
      } catch (err) {
        // Defaults for this run; the stored part stays as it is for a build that can read it.
        log(`[settings] the ${part} part could not be migrated; it will not be written: ${err}`);
        current = normalizeSettings(part, null);
        readable = false;
      }
      if (current.readOnly) log(`[settings] the ${part} part comes from a newer version`);
      return { current, readable, stored, dirty: false, queued: false, lastOk: true };
    };
    const store = new SettingsStore(
      backend,
      { sync: await read('sync'), local: await read('local') },
      log,
    );
    await store.moveLegacy(opts);
    return store;
  }

  get sync(): Readonly<SyncSettings> {
    return this.parts.sync.current.values;
  }

  get local(): Readonly<LocalSettings> {
    return this.parts.local.current.values;
  }

  /** The part is used but never written (newer version, or the host could not read it). */
  readOnly(part: SettingsPart): boolean {
    const s = this.parts[part];
    return s.current.readOnly || !s.readable;
  }

  /** Some part was written by a newer version of the game (the title screen says so). */
  fromNewerVersion(): boolean {
    return this.parts.sync.current.readOnly || this.parts.local.current.readOnly;
  }

  /** Bad stored values that fell back to their defaults when the part was read. */
  issues(part: SettingsPart): readonly string[] {
    return this.parts[part].current.issues;
  }

  /** The part as it is (or will be) stored: unknown fields kept, every known field checked. */
  storedPart(part: SettingsPart): Record<string, unknown> {
    return storedForm(this.parts[part].current);
  }

  updateSync(patch: SyncPatch): boolean {
    return this.update('sync', patch);
  }

  updateLocal(patch: LocalPatch): boolean {
    return this.update('local', patch);
  }

  /**
   * Apply checked fields now and queue a write. False (nothing changes) when a field is
   * unknown or its value is not valid. A read-only part changes for this run only.
   */
  update<P extends SettingsPart>(part: P, patch: PartPatch[P]): boolean {
    const checked = checkPatch(part, patch);
    if (!checked.ok) {
      this.log(`[settings] refused a bad ${part}.${checked.field}`);
      return false;
    }
    const s = this.parts[part] as PartState<P>;
    s.current = {
      ...s.current,
      values: { ...s.current.values, ...checked.patch } as PartValues[P],
    };
    this.schedule(part);
    return true;
  }

  /** Resolves once every write queued so far has landed (or failed). */
  flush(): Promise<void> {
    return this.chain;
  }

  /** The local part for the AI bridge: it changes only the `llm` partition. */
  llmPartStore(): LlmPartStore {
    return {
      get: async () => {
        if (!this.parts.local.readable) return { ok: false, reason: 'unavailable' };
        return { ok: true, value: this.storedPart('local') };
      },
      set: async (_part, values) => {
        const llm = isPlainObject(values) ? values[LLM_PARTITION] : undefined;
        if (!isPlainObject(llm)) return { ok: false, reason: 'bad_request' };
        if (this.readOnly('local')) return { ok: false, reason: 'read_only' };
        this.updateLocal({ llm });
        await this.flush();
        return this.parts.local.lastOk
          ? { ok: true, value: this.storedPart('local') }
          : { ok: false, reason: 'failed' };
      },
    };
  }

  private schedule(part: SettingsPart): void {
    const s = this.parts[part];
    s.dirty = true;
    if (this.readOnly(part) || s.queued) return;
    s.queued = true;
    this.chain = this.chain
      .then(() => this.write(part))
      .catch((err) => {
        // One failed write never stops the ones queued after it.
        s.lastOk = false;
        this.log(`[settings] writing the ${part} part failed: ${String(err)}`);
      });
  }

  private async write<P extends SettingsPart>(part: P): Promise<void> {
    const s = this.parts[part] as PartState<P>;
    s.queued = false;
    if (!s.dirty) return;
    s.dirty = false;
    const payload = storedForm(s.current);
    const r = await this.backend.set(part, payload).catch(() => null);
    if (!r?.ok) {
      s.lastOk = false;
      this.log(`[settings] writing the ${part} part failed: ${r ? r.reason : 'error'}`);
      return;
    }
    s.lastOk = true;
    s.stored = r.value;
    // A newer change is queued behind this write: keep it; its write answers later.
    if (s.dirty) return;
    const answer = normalizeSettings(part, r.value);
    if (!answer.readOnly) s.current = answer;
  }

  /** The one-time move of the legacy keys (see the file comment). */
  private async moveLegacy(opts: SettingsStoreOptions): Promise<void> {
    const kv = opts.legacy;
    if (!kv || this.readOnly('local')) return;
    const read = (key: string): string | null => {
      try {
        return kv.getItem(key);
      } catch {
        return null;
      }
    };
    // The part holds a value the player chose: present and not the default. The desktop shell
    // writes a complete local part (defaults included) before the page first runs, so a
    // default stored there does not outrank the legacy key.
    const stored = this.parts.local.stored;
    const defaults = defaultSettings('local') as unknown as Record<string, unknown>;
    const current = this.parts.local.current.values as unknown as Record<string, unknown>;
    const has = (field: string) =>
      stored !== null &&
      field in stored &&
      JSON.stringify(current[field]) !== JSON.stringify(defaults[field]);
    const patch: LocalPatch = {};
    const consumed: string[] = [];

    const quality = read(LEGACY_KEYS.quality);
    if (quality !== null) {
      const value = parseJson(quality);
      if (!has('quality') && checkPatch('local', { quality: value as never }).ok) {
        patch.quality = value as LocalSettings['quality'];
      }
      consumed.push(LEGACY_KEYS.quality);
    }

    const view = read(LEGACY_KEYS.view);
    if (view !== null) {
      const value = parseJson(view);
      if (!has('view') && checkPatch('local', { view: value as StoredView }).ok) {
        patch.view = value as StoredView;
      }
      consumed.push(LEGACY_KEYS.view);
    }

    const ai = read(LEGACY_KEYS.aiSwitch);
    if (ai !== null) {
      if (has(LLM_PARTITION)) {
        consumed.push(LEGACY_KEYS.aiSwitch);
      } else if (ai === 'off' || !opts.deferLegacyAiOn) {
        const migrated = readLlmPartition(null, { legacySwitch: ai, web: opts.web });
        const llm = writeLlmPartition({}, migrated.settings)[LLM_PARTITION];
        if (isPlainObject(llm)) patch.llm = llm;
        consumed.push(LEGACY_KEYS.aiSwitch);
      }
    }

    if (consumed.length === 0) return;
    if (Object.keys(patch).length > 0) {
      this.updateLocal(patch);
      await this.flush();
      if (!this.parts.local.lastOk) return;
    }
    for (const key of consumed) {
      try {
        kv.removeItem(key);
      } catch {
        // Left in place: the next start finds the field stored and removes it then.
      }
    }
  }
}
