// node tools/content/xp_rewards_build.ts [--check]
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('../..', import.meta.url));
const { module } = await runnerImport<{ run(check: boolean): Promise<void> }>(
  fileURLToPath(new URL('./xp_rewards_cli.ts', import.meta.url)),
  { root, configFile: false, logLevel: 'error' },
);
await module.run(process.argv.includes('--check'));
