// The content validation command (release_engineering.md 7.4), loaded by validate.ts
// through Vite's module runner. See validate.ts for the options.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BATCH_NAME, batchProblems, type StagedBatch, stagingFile } from './catalog/batch';
import { loadValidationInput, ROOT } from './inputs';
import { allOk, formatReport, runValidators, VALIDATORS } from './validators';
import { milestoneIndex, type ValidatorId } from './validators/types';

type Args = Record<string, string | boolean>;

export function parseArgs(argv: readonly string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[a.slice(2)] = next;
      i++;
    } else out[a.slice(2)] = true;
  }
  return out;
}

/** A staged batch read from data/_staging/<name>.json (throws with a message). */
export function readStaged(batch: string, root = ROOT): StagedBatch {
  if (!BATCH_NAME.test(batch))
    throw new Error(`${batch} is not a batch name (content_<act>_<category>_<nn>)`);
  const file = join(root, 'data', stagingFile(batch));
  if (!existsSync(file)) throw new Error(`no staged batch ${batch} (${stagingFile(batch)})`);
  const value = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  const problems = batchProblems(value);
  if (problems.length) throw new Error(`${stagingFile(batch)}: ${problems.join('; ')}`);
  return value as StagedBatch;
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(
      'usage: node tools/content/validate.ts [--milestone M0] [--batch <name>] [--only V1,V5] [--warnings] [--json <file>]',
    );
    return 0;
  }
  const label = typeof args.milestone === 'string' ? args.milestone : 'M0';
  const milestone = milestoneIndex(label);
  const batch = typeof args.batch === 'string' ? readStaged(args.batch) : undefined;
  const only =
    typeof args.only === 'string'
      ? (args.only.split(',').map((s) => s.trim().toUpperCase()) as ValidatorId[])
      : undefined;
  const unknown = (only ?? []).filter((id) => !VALIDATORS.some((v) => v.id === id));
  if (unknown.length) {
    console.error(`unknown validator ${unknown.join(', ')} (V1 to V10)`);
    return 2;
  }
  const input = loadValidationInput({ milestone, batch });
  const results = runValidators(input, only);
  const head = batch ? `data/ with ${batch.batch} applied` : 'data/';
  console.log(`content validation (${label}, ${head})`);
  for (const line of formatReport(results, { warnings: args.warnings === true })) console.log(line);
  const ok = allOk(results);
  console.log(ok ? 'all validators green' : 'validation failed');
  if (typeof args.json === 'string')
    writeFileSync(args.json, `${JSON.stringify({ milestone: label, ok, results }, null, 2)}\n`);
  return ok ? 0 : 1;
}
