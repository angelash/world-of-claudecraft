#!/usr/bin/env node
// Boots the real ambient-bot server stack against an in-memory pg-mem backing
// store. This is a local verification harness for workstations without Docker
// or Postgres, not a production runtime path.
import process from 'node:process';
import {
  buildAmbientBotServerBundle,
  createAmbientBotPgMemShim,
  ensureAdminAccount,
  installPgShim,
  requireBuiltBundle,
  waitForServerStatus,
} from './ambient_bot_pgmem_support.mjs';

async function main() {
  const host = (process.env.HOST ?? '127.0.0.1').trim() || '127.0.0.1';
  const port = Number(process.env.PORT ?? '8879');
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`invalid PORT: ${process.env.PORT ?? ''}`);
  }
  process.env.DATABASE_URL ??= 'postgres://pgmem/local';
  process.env.HOST = host;
  process.env.PORT = String(port);
  process.env.AMBIENT_PLAYER_BOTS_EXPERIMENT ??= '1';
  process.env.AMBIENT_PLAYER_BOTS_INTERVAL_MS ??= '1000';

  const baseUrl = `http://${host}:${port}`;
  const bootstrapUser = process.env.PGMEM_BOOTSTRAP_ADMIN_USER ?? '';
  const bootstrapPass = process.env.PGMEM_BOOTSTRAP_ADMIN_PASS ?? '';
  if ((bootstrapUser && !bootstrapPass) || (!bootstrapUser && bootstrapPass)) {
    throw new Error('set both PGMEM_BOOTSTRAP_ADMIN_USER and PGMEM_BOOTSTRAP_ADMIN_PASS');
  }

  const { pgShim } = createAmbientBotPgMemShim();
  const restorePgLoad = installPgShim(pgShim);
  process.on('exit', restorePgLoad);

  const bundlePath = await buildAmbientBotServerBundle();
  requireBuiltBundle(bundlePath);

  const status = await waitForServerStatus(baseUrl);
  if (bootstrapUser) {
    await ensureAdminAccount({
      baseUrl,
      pgShim,
      username: bootstrapUser,
      password: bootstrapPass,
    });
  }

  console.log(
    `PGMEM_READY url=${baseUrl} realm=${status.realm ?? 'unknown'}${
      bootstrapUser ? ` admin=${bootstrapUser}` : ''
    }`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
