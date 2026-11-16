// The desktop settings files (docs/50_tech/release_engineering.md 2.3, 5.2, 13.10;
// llm_providers.md 4.7, 7.2): `settings.sync.json` and `settings.local.json` in the user data
// directory, behind hk:settings.get and hk:settings.set. Both parts are read once at start
// (synchronously, before the app is ready, so the GPU preference and the window can use them)
// and cached; every write goes through one queue per part as a temp file, flushed, then
// renamed over the old file. A file that is not a JSON object is moved aside as `.bad` and the
// part reads as "nothing stored" (defaults); a part written by a newer version is served but
// never written over.
//
// Every write is checked field by field with the renderer's own schema
// (src/client/app/settings_schema.ts); the `llm` partition is checked by the model settings'
// migration (src/ai/llm_config/migrate.ts), which drops unknown fields and keeps a partition
// from a newer version as it is. The shell owns two local fields the page never writes: the
// window (position, size, mode) and the install id.

import { readFileSync, renameSync } from 'node:fs';
import { open, rename } from 'node:fs/promises';
import { readLlmPartition, writeLlmPartition } from '../src/ai/llm_config/migrate';
import { SETTINGS_VERSION as LLM_SETTINGS_VERSION } from '../src/ai/llm_config/settings';
import {
  isPlainObject,
  type LocalSettings,
  normalizeSettings,
  type SettingsPart,
  storedForm,
} from '../src/client/app/settings_schema';
import type { HkReason, HkResult } from './ipc/channels';
import { BAD_SUFFIX, TMP_SUFFIX } from './paths';

/**
 * A part is at most 256 KiB (2.8, D-088), counted like hk:settings.set counts its payload:
 * UTF-16, so 128 Ki characters of JSON. The web host keeps the same cap.
 */
export const SETTINGS_FILE_MAX_CHARS = 128 * 1024;
/** Renames retry while an antivirus scanner holds the file on Windows. */
export const SETTINGS_RENAME_RETRY_MS: readonly number[] = [50, 200, 600];

/** Local fields only the shell writes; a page write keeps the shell's values. */
export const SHELL_OWNED_FIELDS = ['window', 'installId'] as const;

export interface SettingsFileIo {
  /** The file's text, or null when it does not exist. Throws on any other error. */
  readText(path: string): string | null;
  /** Move a file aside (synchronously), replacing what is there. */
  moveAside(from: string, to: string): void;
  /** Write a temp file, flush it to disk, then rename it over `path`. */
  writeAtomic(path: string, text: string): Promise<void>;
}

const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const errCode = (err: unknown) => (err as NodeJS.ErrnoException | undefined)?.code;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function nodeSettingsIo(
  retryMs: readonly number[] = SETTINGS_RENAME_RETRY_MS,
): SettingsFileIo {
  return {
    readText(path) {
      try {
        return readFileSync(path, 'utf8');
      } catch (err) {
        if (errCode(err) === 'ENOENT') return null;
        throw err;
      }
    },
    moveAside(from, to) {
      renameSync(from, to);
    },
    async writeAtomic(path, text) {
      const tmp = path + TMP_SUFFIX;
      const handle = await open(tmp, 'w');
      try {
        await handle.writeFile(text, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      for (let attempt = 0; ; attempt++) {
        try {
          await rename(tmp, path);
          return;
        } catch (err) {
          const wait = retryMs[attempt];
          if (wait === undefined || !RETRY_CODES.has(errCode(err) ?? '')) throw err;
          await sleep(wait);
        }
      }
    },
  };
}

export interface DesktopSettingsOptions {
  /** The file of a part (StorageLayout.settings). */
  path(part: SettingsPart): string;
  io?: SettingsFileIo;
  log(level: 'error' | 'warn' | 'info', message: string): void;
  /** Internal and e2e builds may keep the model settings' developer mode on (AQ-15). */
  internalBuild: boolean;
}

export type SettingsValues = Record<string, unknown>;

export interface DesktopSettings {
  /** The part as stored (after checks), or null when nothing is stored. */
  get(part: SettingsPart): SettingsValues | null;
  /** The file exists but could not be read, moved aside or migrated: never written. */
  unreadable(part: SettingsPart): boolean;
  /** A write from the page: checked per field, shell-owned fields kept, written atomically. */
  set(part: SettingsPart, values: unknown): Promise<HkResult<SettingsValues>>;
  /** A write from the shell itself (window, frame cap, install id). */
  patchLocal(patch: Partial<Omit<LocalSettings, 'version'>>): Promise<HkResult<SettingsValues>>;
  /** The local part's checked values (defaults where nothing is stored). */
  local(): Readonly<LocalSettings>;
  /** A saved connection with at least one enabled model (llm_providers.md 7.4 item 3). */
  connectionConfigured(connectionId: string): boolean;
  /** Resolves once every queued write has landed. */
  flush(): Promise<void>;
}

interface PartFile {
  /** The stored object (checked), or null when nothing is stored. */
  stored: SettingsValues | null;
  /** The file came from a newer version: served as read, never written. */
  newer: boolean;
  /** The file could not be read at all (not missing, not corrupt): never written. */
  unreadable: boolean;
  queue: Promise<unknown>;
}

/** The `llm` partition after the model settings' own checks (a newer one is kept as it is). */
export function checkLlmPartition(
  part: SettingsValues,
  opts: { internalBuild: boolean },
): SettingsValues {
  if (!('llm' in part)) return part;
  if (!isPlainObject(part.llm)) {
    const { llm: _dropped, ...rest } = part;
    return rest;
  }
  const r = readLlmPartition(part, { internalBuild: opts.internalBuild });
  return r.readOnly ? part : writeLlmPartition(part, r.settings);
}

/** The `llm` partition carries a version above this build's (kept as read, never rewritten). */
function newerLlm(part: SettingsValues): boolean {
  const llm = part.llm;
  return (
    isPlainObject(llm) && typeof llm.version === 'number' && llm.version > LLM_SETTINGS_VERSION
  );
}

export function openDesktopSettings(opts: DesktopSettingsOptions): DesktopSettings {
  const io = opts.io ?? nodeSettingsIo();
  const check = (part: SettingsPart, raw: unknown): SettingsValues => {
    const stored = storedForm(normalizeSettings(part, raw));
    return part === 'local' ? checkLlmPartition(stored, opts) : stored;
  };

  const load = (part: SettingsPart): PartFile => {
    const file = opts.path(part);
    const empty: PartFile = {
      stored: null,
      newer: false,
      unreadable: false,
      queue: Promise.resolve(),
    };
    let text: string | null;
    try {
      text = io.readText(file);
    } catch (err) {
      opts.log('error', `settings ${part}: cannot read the file (${errCode(err) ?? 'error'})`);
      return { ...empty, unreadable: true };
    }
    if (text === null) return empty;
    let raw: unknown;
    try {
      // Editors on Windows may save a byte order mark (2.7 asks players to edit by hand).
      raw = JSON.parse(text.replace(/^﻿/, ''));
    } catch {
      raw = undefined;
    }
    if (!isPlainObject(raw)) {
      try {
        io.moveAside(file, file + BAD_SUFFIX);
        opts.log(
          'warn',
          `settings ${part}: unreadable file kept as ${part}${BAD_SUFFIX}; defaults in use`,
        );
      } catch (err) {
        opts.log(
          'error',
          `settings ${part}: cannot move the bad file aside (${errCode(err) ?? 'error'})`,
        );
        return { ...empty, unreadable: true };
      }
      return empty;
    }
    try {
      const n = normalizeSettings(part, raw);
      if (n.readOnly) {
        opts.log('warn', `settings ${part}: written by a newer version; it will not be changed`);
        return { ...empty, stored: raw, newer: true };
      }
      if (n.issues.length > 0) {
        opts.log(
          'warn',
          `settings ${part}: bad values fell back to defaults: ${n.issues.join(', ')}`,
        );
      }
      return { ...empty, stored: check(part, raw) };
    } catch (err) {
      opts.log('error', `settings ${part}: cannot migrate (${String(err)}); defaults in use`);
      return { ...empty, unreadable: true };
    }
  };

  const parts: Record<SettingsPart, PartFile> = { sync: load('sync'), local: load('local') };

  /** Queue one write of a part; `next` builds the object from the state at its turn. */
  const write = (
    part: SettingsPart,
    next: (current: SettingsValues | null) => { value: SettingsValues } | { refuse: HkReason },
  ): Promise<HkResult<SettingsValues>> => {
    const p = parts[part];
    const run = p.queue.then(async (): Promise<HkResult<SettingsValues>> => {
      if (p.newer) return { ok: false, reason: 'failed' };
      if (p.unreadable) return { ok: false, reason: 'unavailable' };
      const built = next(p.stored);
      if ('refuse' in built) return { ok: false, reason: built.refuse };
      const value = built.value;
      const text = JSON.stringify(value);
      if (text.length > SETTINGS_FILE_MAX_CHARS) return { ok: false, reason: 'too_large' };
      try {
        await io.writeAtomic(opts.path(part), JSON.stringify(value, null, 2));
      } catch (err) {
        opts.log('error', `settings ${part}: write failed (${errCode(err) ?? String(err)})`);
        return { ok: false, reason: 'failed' };
      }
      p.stored = value;
      return { ok: true, value };
    });
    p.queue = run.catch(() => undefined);
    return run;
  };

  const effectiveLocal = (): LocalSettings => {
    const p = parts.local;
    return normalizeSettings('local', p.stored).values;
  };

  return {
    get: (part) => {
      const v = parts[part].stored;
      return v ? (JSON.parse(JSON.stringify(v)) as SettingsValues) : null;
    },
    unreadable: (part) => parts[part].unreadable,
    set: (part, values) =>
      write(part, (current) => {
        if (!isPlainObject(values)) return { refuse: 'bad_request' };
        if (normalizeSettings(part, values).readOnly) return { refuse: 'bad_request' };
        const next = check(part, values);
        if (part === 'local') {
          // The page never writes the shell's fields: keep what the shell stored.
          const own = normalizeSettings('local', current).values;
          for (const field of SHELL_OWNED_FIELDS) next[field] = own[field];
          // A model partition from a newer version is only ever the one read from the file
          // (the page passes it through unchanged); one the page made up is not trusted.
          if (newerLlm(next)) {
            if (current && newerLlm(current)) next.llm = current.llm;
            else delete next.llm;
          }
        }
        return { value: JSON.parse(JSON.stringify(next)) as SettingsValues };
      }),
    patchLocal: (patch) =>
      write('local', (current) => {
        const n = normalizeSettings('local', current);
        const next = check('local', { ...storedForm(n), ...patch });
        return { value: JSON.parse(JSON.stringify(next)) as SettingsValues };
      }),
    local: effectiveLocal,
    connectionConfigured: (connectionId) => {
      const llm = parts.local.stored?.llm;
      if (!isPlainObject(llm) || !Array.isArray(llm.connections)) return false;
      return llm.connections.some(
        (c) =>
          isPlainObject(c) &&
          c.id === connectionId &&
          Array.isArray(c.models) &&
          c.models.length > 0,
      );
    },
    flush: async () => {
      await Promise.all([parts.sync.queue, parts.local.queue]);
    },
  };
}
