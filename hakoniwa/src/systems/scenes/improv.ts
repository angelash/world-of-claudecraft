// The executor's checks on a model's improvised answer (PK-M1-34; catalog_cutscenes.md 2.4,
// the requests PK-M1-27 left behind, items 3 to 5). Pure, so the rules are tested apart from
// the runner:
//
// - `briefKept`: the executor's literal check of a brief (`check`): a model answer must contain
//   at least one phrase of `must` and no word of `never` ("执行者校验不过即换回原句"); when it
//   does not, the runner drops it and the written lines stand. The catalog's meaning keys and
//   forbidden list are prose for the model to read (含义键 are meanings, 禁区 are rules), so
//   they are never matched word for word: a check that needed every meaning verbatim refused
//   every answer, and a rule sentence never matches the words it forbids.
// - `extractValues`: what a model read out of a conversation (the courtyard object of Sylvie's
//   round, the past life of Moira's) is written only for the keys the node lists and only with
//   the values it allows, so a model can never write an arbitrary flag.
//
// The comparison is on the raw text with whitespace removed: the meaning keys are short
// Chinese phrases, and a model that adds a space inside one should not fail the check.

import type { SceneBrief, SceneExtract } from './types';

function squash(text: string): string {
  return text.replace(/\s+/g, '');
}

/** Whether a set of model lines passes the brief's check: one `must` phrase, no `never` word. */
export function briefKept(
  brief: Pick<SceneBrief, 'check'> | undefined,
  lines: readonly { text: string }[],
): boolean {
  const check = brief?.check;
  if (!check) return true;
  const said = squash(lines.map((l) => String(l.text ?? '')).join(''));
  const must = (check.must ?? []).map(squash).filter(Boolean);
  if (must.length > 0 && !must.some((m) => said.includes(m))) return false;
  for (const word of check.never ?? []) {
    const w = squash(word);
    if (w && said.includes(w)) return false;
  }
  return true;
}

/**
 * The flags a model's extraction may write: only listed keys, only allowed values, in the
 * node's order (so the writes are deterministic whatever order the model gave them in).
 */
export function extractValues(
  extract: readonly SceneExtract[] | undefined,
  values: Readonly<Record<string, unknown>> | undefined,
): [string, string][] {
  if (!extract?.length || !values) return [];
  const out: [string, string][] = [];
  for (const x of extract) {
    const v = values[x.key];
    if (typeof v === 'string' && x.values.includes(v)) out.push([x.key, v]);
  }
  return out;
}
