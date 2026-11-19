// The onboarding check (ux_and_onboarding.md 23.2 引导检查): `node tools/tutorial/check.ts`.
// Node runs this file directly; the command itself (check_cli.ts) goes through Vite's module
// runner, because the catalogue under src/client/tutorial/ uses the source tree's
// extensionless imports (the same arrangement as tools/content/validate.ts).
//
//   node tools/tutorial/check.ts           print the findings, exit 1 when there are any
//   node tools/tutorial/check.ts --json    print them as JSON
//
// The pure rules are src/client/tutorial/check.ts (shared with tests/client_tutorial.test.ts).

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { module } = await runnerImport<{ main(argv: string[]): Promise<number> }>(
  resolve(root, 'tools', 'tutorial', 'check_cli.ts'),
  { root, configFile: false, logLevel: 'error' },
);
process.exitCode = await module.main(process.argv.slice(2));
