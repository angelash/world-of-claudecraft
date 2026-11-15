// Entry of the replay tool (release_engineering.md 13.6): `node tools/replay/run.ts ...`.
// Node runs this file directly; the tool itself (main.ts) goes through Vite's module
// runner, because the game content is assembled with import.meta.glob. See main.ts for
// the commands.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { module } = await runnerImport<{ main(argv: string[]): Promise<number> }>(
  resolve(root, 'tools', 'replay', 'main.ts'),
  { root, configFile: false, logLevel: 'error' },
);
process.exitCode = await module.main(process.argv.slice(2));
