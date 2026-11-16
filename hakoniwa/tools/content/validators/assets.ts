// V7 asset references (release_engineering.md 7.4 and 7.7): every content row that needs
// a picture has an art subject in the prompt library's requirement list, and every asset
// id written in the data (`art_`, `mus_`, `amb_`, `sfx_`) is in that list. The coverage
// rule is the art pipeline's own (tools/assets/core/coverage.ts uncoveredContent, which
// counts alias subjects as covered). Asset ids are looked for in every data file (the
// audio cue table data/audio/cues.json included). A value naming a sheet subject (an
// appearance's `sheet: art_mon_dian_rat` names the set art_mon_dian_rat_d, _r, _u...) is
// covered when a listed id adds one segment to it. Placeholders are allowed until M4: before it the
// findings are warnings, from M4 on errors.

import { uncoveredContent } from '../../assets/core/coverage';
import type { Finding, ValidationInput, Validator } from './types';

/** Milestone from which missing art blocks (M4, release_engineering.md 7.4 and 7.7). */
export const ASSETS_BLOCKING_FROM = 4;

/** Tables whose rows need art, and the asset id prefixes that cover a row. */
export const ART_COVERAGE: readonly { table: string; prefixes: readonly string[] }[] = [
  { table: 'monsters', prefixes: ['art_mon_', 'art_boss_'] },
  { table: 'npcs', prefixes: ['art_por_'] },
  { table: 'companions', prefixes: ['art_por_'] },
  { table: 'goddesses', prefixes: ['art_por_'] },
  { table: 'items', prefixes: ['art_ico_item_'] },
  { table: 'doors', prefixes: ['art_ico_door_'] },
];

/** An asset id written as a data value. */
export const ASSET_ID = /^(art_[a-z]+|mus|amb|sfx)_[a-z0-9_]+$/;

function strings(v: unknown, path: string, out: { path: string; value: string }[]): void {
  if (typeof v === 'string') out.push({ path, value: v });
  else if (Array.isArray(v)) {
    v.forEach((x, i) => {
      strings(x, `${path}[${i}]`, out);
    });
  } else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v as Record<string, unknown>))
      strings(x, path ? `${path}.${k}` : k, out);
}

/** Every listed id plus its sheet subject (the id without its last segment). */
export function assetStems(ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    out.add(id);
    const i = id.lastIndexOf('_');
    if (i > 0) out.add(id.slice(0, i));
  }
  return out;
}

export function assetFindings(input: ValidationInput): Finding[] {
  const level = input.milestone >= ASSETS_BLOCKING_FROM ? 'error' : 'warning';
  const assets = input.assetIds;
  if (!assets) {
    return [
      {
        level,
        message:
          'asset requirement list unavailable (assets/prompts); asset references not checked',
      },
    ];
  }
  const out: Finding[] = [];
  const known = assetStems(assets);
  const tables = input.content as unknown as Record<string, unknown>;
  for (const [file, data] of input.files) {
    const found: { path: string; value: string }[] = [];
    strings(data, '', found);
    for (const f of found) {
      if (/(^|\.)id$/.test(f.path) || !ASSET_ID.test(f.value) || known.has(f.value)) continue;
      out.push({
        level,
        message: `${file} ${f.path}: asset ${f.value} is not in the requirement list`,
        file,
        path: f.path,
      });
    }
  }
  for (const { table, prefixes } of ART_COVERAGE) {
    const rows = tables[table];
    if (!Array.isArray(rows)) continue;
    const ids = rows
      .map((r) => (r as { id?: unknown } | null)?.id)
      .filter((x): x is string => typeof x === 'string');
    const missing = uncoveredContent(ids, assets, prefixes);
    if (missing.length === 0) continue;
    out.push({
      level,
      message: `${table}: ${missing.length} of ${ids.length} rows have no ${prefixes.join(' or ')} art subject (${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', ...' : ''})`,
      table,
    });
  }
  return out;
}

export const assetsValidator: Validator = {
  id: 'V7',
  title: 'asset references',
  run: assetFindings,
};
