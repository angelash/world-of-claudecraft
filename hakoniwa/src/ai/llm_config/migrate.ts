// The `llm` partition of the local settings part, its versions and the move from the legacy
// on/off switch (docs/50_tech/llm_providers.md 4.7; release_engineering.md 2.8, 13.10): the
// model settings live in the machine-local settings part (settings.local.json on the
// desktop, the same part in browser storage on the web demo and in development), never in a
// key of their own. Settings carry `version`; settings from a newer version are read
// best-effort and never written back ("settings come from a newer version"); with no
// settings yet, the legacy switch 'hakoniwa.settings.ai' migrates to "custom: dev proxy"
// when the dev proxy answers and to "off" otherwise. The legacy switch defaulted to on when
// unset, so an unset switch counts as on (that only matters where a dev proxy exists).
// Pure: plain values in and out; the host reads and writes the settings part.

import { type DevProxyFacts, devProxySettings } from './presets';
import {
  defaultSettings,
  type LlmSettings,
  SETTINGS_VERSION,
  type SettingsIssue,
  type SettingsValidateOptions,
  validateSettings,
} from './settings';

/** Storage key of the legacy single switch ('on' or 'off'); the host reads it for migration. */
export const LEGACY_AI_SWITCH_KEY = 'hakoniwa.settings.ai';
/** The settings part that holds the model settings, and the partition name inside it. */
export const LLM_SETTINGS_PART = 'local';
export const LLM_PARTITION = 'llm';

export interface MigrateContext extends SettingsValidateOptions {
  /** Value of the legacy switch, if stored. */
  legacySwitch?: string | null;
  /** The dev server's proxy, in development builds only. */
  devProxy?: DevProxyFacts | null;
}

export interface MigrateResult {
  settings: LlmSettings;
  /** Never write these back (newer version). */
  readOnly: boolean;
  from: 'none' | 'legacy' | number;
  issues: SettingsIssue[];
  notice?: 'newer_version';
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parse stored settings (already JSON-decoded), migrating where needed. */
export function migrateSettings(raw: unknown, ctx: MigrateContext = {}): MigrateResult {
  if (!isObj(raw)) {
    const base = defaultSettings();
    const on = ctx.legacySwitch !== 'off';
    const settings = on && ctx.devProxy?.available ? devProxySettings(base, ctx.devProxy) : base;
    const from = ctx.legacySwitch === null || ctx.legacySwitch === undefined ? 'none' : 'legacy';
    return { settings, readOnly: false, from, issues: [] };
  }
  const version =
    typeof raw.version === 'number' && Number.isInteger(raw.version) ? raw.version : 1;
  const v = validateSettings(raw, ctx);
  if (version > SETTINGS_VERSION) {
    return {
      settings: { ...v.settings, version },
      readOnly: true,
      from: version,
      issues: v.issues,
      notice: 'newer_version',
    };
  }
  return { settings: v.settings, readOnly: false, from: version, issues: v.issues };
}

/** The model settings from the local settings part (null or any value when nothing is stored). */
export function readLlmPartition(localPart: unknown, ctx: MigrateContext = {}): MigrateResult {
  return migrateSettings(isObj(localPart) ? localPart[LLM_PARTITION] : undefined, ctx);
}

/**
 * The local settings part with the model settings written into their partition; every other
 * field of the part is kept as it is.
 */
export function writeLlmPartition(
  localPart: unknown,
  settings: LlmSettings,
): Record<string, unknown> {
  const base = isObj(localPart) ? localPart : {};
  return { ...base, [LLM_PARTITION]: JSON.parse(JSON.stringify(settings)) as unknown };
}
