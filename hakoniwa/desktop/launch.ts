// Launch the built desktop shell with the Electron that the repository root installs
// (npm run desktop:dev runs the game build and npm run build:desktop first). The Electron
// package resolves its binary on require and downloads it once if it is missing.
// ELECTRON_RUN_AS_NODE is dropped: a parent Electron app may set it, and it would start
// the binary as plain Node. Run with Node directly: node desktop/launch.ts

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const electronPath = createRequire(import.meta.url)('electron') as string;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [join(here, 'dist', 'main.cjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  windowsHide: false,
});
child.on('close', (code, signal) => {
  if (code === null) {
    console.error(`electron exited with signal ${signal}`);
    process.exit(1);
  }
  process.exit(code);
});
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    if (!child.killed) child.kill(sig);
  });
}
