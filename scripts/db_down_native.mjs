#!/usr/bin/env node
import process from 'node:process';
import { getNativePostgresConfig, stopNativePostgres } from './native_postgres.mjs';

try {
  await stopNativePostgres(getNativePostgresConfig());
} catch (error) {
  console.error(`[db] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
