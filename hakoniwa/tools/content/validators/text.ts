// V8 text (release_engineering.md 7.4): every player-visible text has a key or sits in a
// content field, its source text is not empty, it holds no forbidden character, and it
// fits the interface's limit. The fields are ./player_text.ts; the forbidden-character
// scan is the editor check desk's (src/editor/checks/rules.ts findForbidden, scanValue),
// run over every string of every data file (over the player texts when no files are given).
// The line packs (data/dialogue/lines/) get their own checks in ./lines.ts.

import { findForbidden, scanValue } from '../../../src/editor/checks/rules';
import { linesFindings } from './lines';
import { idFieldsOf, PLAYER_TEXT, playerTexts, TEXT_LIMITS, type TextField } from './player_text';
import type { Finding, ValidationInput, Validator } from './types';

const hex = (c: number) => `U+${c.toString(16).toUpperCase().padStart(4, '0')}`;

export function textFindings(
  input: Pick<ValidationInput, 'content' | 'files'> & Partial<Pick<ValidationInput, 'packs'>>,
  fields: readonly TextField[] = PLAYER_TEXT,
): Finding[] {
  const out: Finding[] = [];
  for (const t of playerTexts(input.content, fields, idFieldsOf(input.packs ?? []))) {
    const at = `${t.table}:${t.row} ${t.path}`;
    const base = { table: t.table, row: t.row, path: t.path };
    if (t.value === undefined || t.value === null) continue;
    if (typeof t.value !== 'string') {
      out.push({ ...base, level: 'error', message: `${at}: player text is not a string` });
      continue;
    }
    if (t.value.trim() === '') {
      if (!(t.blankOk && t.value === ''))
        out.push({ ...base, level: 'error', message: `${at}: empty player text` });
      continue;
    }
    if (t.row === '') {
      out.push({
        ...base,
        level: 'error',
        message: `${at}: text in a row without an id has no text key`,
      });
    }
    // with data files at hand the file scan below reports every forbidden character once
    if (input.files.size === 0)
      for (const hit of findForbidden(t.value))
        out.push({
          ...base,
          level: 'error',
          message: `${at}: forbidden character ${hex(hit.codePoint)}`,
        });
    const len = [...t.value].length;
    const limit = TEXT_LIMITS[t.cls];
    if (len > limit)
      out.push({
        ...base,
        level: 'error',
        message: `${at}: ${len} characters, over the ${t.cls} limit ${limit}`,
      });
  }
  // the repository rule holds for every string of the data, visible or not
  for (const [file, data] of input.files) {
    for (const hit of scanValue(data))
      out.push({
        level: 'error',
        message: `${file} ${hit.path}: forbidden character ${hex(hit.codePoint)} (${hit.snippet})`,
        file,
        path: hit.path,
      });
  }
  return out;
}

export const textValidator: Validator = {
  id: 'V8',
  title: 'text',
  run: (input) => [...textFindings(input), ...linesFindings(input)],
};
