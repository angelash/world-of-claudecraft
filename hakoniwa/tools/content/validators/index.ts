// The content validation layer V1 to V10 (release_engineering.md 7.4). One ordered set of
// pure validators shared by the command line tool (tools/content/validate.ts), the catalog
// importer's validate and promote steps, the editor's batch view and
// tests/content_validation.test.ts. A validator that throws is reported as its own error
// instead of hiding the others.

import { assetsValidator } from './assets';
import { balanceValidator } from './balance';
import { ledgerValidator } from './ledger';
import { namesValidator } from './names';
import { namespaceValidator } from './namespace';
import { reachValidator } from './reach';
import { refsValidator } from './refs';
import { registryValidator } from './registry';
import { schemaValidator } from './schema';
import { textValidator } from './text';
import type { Finding, ValidationInput, Validator, ValidatorId, ValidatorResult } from './types';

export type * from './types';
export { milestoneIndex, where } from './types';

export const VALIDATORS: readonly Validator[] = [
  schemaValidator,
  refsValidator,
  namespaceValidator,
  registryValidator,
  ledgerValidator,
  balanceValidator,
  assetsValidator,
  textValidator,
  reachValidator,
  namesValidator,
];

export function summarize(id: ValidatorId, title: string, findings: Finding[]): ValidatorResult {
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const f of findings) {
    if (f.level === 'error') errors++;
    else if (f.level === 'warning') warnings++;
    else infos++;
  }
  return { id, title, findings, errors, warnings, infos, ok: errors === 0 };
}

/** Run validators (all by default, or the listed ids) in V1 to V10 order. */
export function runValidators(
  input: ValidationInput,
  only?: readonly ValidatorId[],
): ValidatorResult[] {
  return VALIDATORS.filter((v) => !only || only.includes(v.id)).map((v) => {
    let findings: Finding[];
    try {
      findings = v.run(input);
    } catch (e) {
      findings = [
        {
          level: 'error',
          message: `validator crashed: ${e instanceof Error ? e.message : String(e)}`,
        },
      ];
    }
    return summarize(v.id, v.title, findings);
  });
}

export function allOk(results: readonly ValidatorResult[]): boolean {
  return results.every((r) => r.ok);
}

/** Plain report lines: one status line per validator, then its findings. */
export function formatReport(
  results: readonly ValidatorResult[],
  opts: { warnings?: boolean; limit?: number } = {},
): string[] {
  const limit = opts.limit ?? 50;
  const out: string[] = [];
  for (const r of results) {
    const status = r.ok ? 'ok  ' : 'FAIL';
    out.push(
      `${status} ${r.id.padEnd(3)} ${r.title.padEnd(18)} ${r.errors} errors, ${r.warnings} warnings`,
    );
    const shown = r.findings.filter((f) => f.level === 'error' || opts.warnings);
    for (const f of shown.slice(0, limit)) out.push(`       ${f.level}: ${f.message}`);
    if (shown.length > limit) out.push(`       ... ${shown.length - limit} more`);
  }
  return out;
}
