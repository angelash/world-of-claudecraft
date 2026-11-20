import { join } from 'node:path';
import { createServer } from 'vite';

const root = process.env.HAKONIWA_PROJECT_ROOT;
const port = Number(process.env.HAKONIWA_WORKER_PORT);
if (!root || !Number.isInteger(port) || port < 1)
  throw new Error('Managed worker requires an explicit project root and private port');
const server = await createServer({
  configFile: join(root, 'vite.config.ts'),
  configLoader: 'runner',
  mode: 'nohmr',
  cacheDir: join(process.env.HAKONIWA_SERVICE_STATE!, 'vite-cache'),
  // Keep private cache files unservable; use ordinary source modules in this no-HMR host.
  optimizeDeps: { noDiscovery: true, include: [] },
  // Hakoniwa uses plain CSS. Avoid configuration discovery in unrelated ancestor workspaces.
  css: { postcss: { plugins: [] } },
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    hmr: false,
    watch: null,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local/**'] },
  },
});
await server.listen();
process.send?.({ type: 'ready', port });
let stopping = false;
process.on('message', (msg) => {
  if ((msg as { type?: string })?.type !== 'stop' || stopping) return;
  stopping = true;
  void server.close().then(() => process.exit(0));
});
