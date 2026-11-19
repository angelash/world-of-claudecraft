import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildContent } from '../../src/content';
import { buildXpRewards } from './xp_rewards';

export async function run(check: boolean): Promise<void> {
  const output = JSON.stringify(buildXpRewards(buildContent()), null, 2) + '\n';
  const file = fileURLToPath(new URL('../../data/records/xp_rewards.json', import.meta.url));
  if (check) {
    if ((await readFile(file, 'utf8')) !== output) throw new Error('xp rewards are stale');
  } else await writeFile(file, output, 'utf8');
}
