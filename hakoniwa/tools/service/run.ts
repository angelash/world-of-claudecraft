import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSupervisor } from './supervisor';

const root = fileURLToPath(new URL('../..', import.meta.url));
const service = await startSupervisor(
  root,
  process.env.HAKONIWA_SERVICE_STATE ?? join(root, '.local/service'),
);
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const)
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void service.close().then(() => process.exit(0));
  });
