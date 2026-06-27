#!/usr/bin/env node
import process from 'node:process';
import {
  ensureNativePostgresRunning,
  getNativePostgresConfig,
} from './native_postgres.mjs';

try {
  const config = getNativePostgresConfig();
  if (config.passwordMismatch) {
    console.warn(
      '[db] POSTGRES_PASSWORD and the password inside DATABASE_URL do not match. DATABASE_URL wins for the app role.',
    );
  }
  await ensureNativePostgresRunning(config);
  console.log(
    `[db] ready: ${config.database.username}@${config.database.host}:${config.database.port}/${config.database.databaseName}`,
  );
  if (process.platform === 'win32') {
    console.log(`[db] windows install dir: ${config.installDir}`);
  }
  console.log(`[db] data dir: ${config.dataDir}`);
} catch (error) {
  console.error(`[db] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
