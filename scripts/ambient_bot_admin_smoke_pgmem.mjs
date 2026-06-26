#!/usr/bin/env node
// Runs the existing ambient-bot admin smoke against a local pg-mem-backed
// realm. This keeps the real HTTP and admin control surfaces in play while
// avoiding a hard dependency on local Docker or Postgres.
import { spawn } from 'node:child_process';
import process from 'node:process';
import { REPO_ROOT } from './ambient_bot_pgmem_support.mjs';

function waitForExit(child, label) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${label} exited from signal ${signal}`));
        return;
      }
      resolve(code ?? 0);
    });
  });
}

function waitForReady(child, readyToken, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let settled = false;
    const finish = (callback) => (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('exit', onExit);
      callback(value);
    };
    const resolveReady = finish(resolve);
    const rejectReady = finish(reject);
    const onStdout = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      buffer += text;
      if (buffer.includes(readyToken)) resolveReady();
    };
    const onStderr = (chunk) => {
      process.stderr.write(chunk.toString());
    };
    const onExit = (code, signal) => {
      rejectReady(new Error(`pg-mem server exited before ready (code=${code ?? 'null'} signal=${signal ?? 'none'})`));
    };
    const timer = setTimeout(() => {
      rejectReady(new Error(`timed out waiting for ${readyToken}`));
    }, timeoutMs);

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.once('exit', onExit);
  });
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  const killTimer = setTimeout(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  }, 5_000);
  try {
    await new Promise((resolve) => child.once('exit', resolve));
  } finally {
    clearTimeout(killTimer);
  }
}

async function main() {
  const host = '127.0.0.1';
  const port = Number(process.env.PGMEM_AMBIENT_PORT ?? '8879');
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`invalid PGMEM_AMBIENT_PORT: ${process.env.PGMEM_AMBIENT_PORT ?? ''}`);
  }
  const uniq = Date.now().toString(36).slice(-6);
  const adminUser = `ambientadm_${uniq}`;
  const adminPass = process.env.PGMEM_AMBIENT_ADMIN_PASS ?? 'hunter22';
  const serverUrl = `http://${host}:${port}`;
  const allowLogout = process.env.AMBIENT_SMOKE_ALLOW_LOGOUT ?? '1';

  const serverEnv = {
    ...process.env,
    HOST: host,
    PORT: String(port),
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://pgmem/local',
    AMBIENT_PLAYER_BOTS_EXPERIMENT: process.env.AMBIENT_PLAYER_BOTS_EXPERIMENT ?? '1',
    AMBIENT_PLAYER_BOTS_INTERVAL_MS: process.env.AMBIENT_PLAYER_BOTS_INTERVAL_MS ?? '1000',
    PGMEM_BOOTSTRAP_ADMIN_USER: adminUser,
    PGMEM_BOOTSTRAP_ADMIN_PASS: adminPass,
  };

  const server = spawn(process.execPath, ['scripts/ambient_bot_server_pgmem.mjs'], {
    cwd: REPO_ROOT,
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let smokeCode = 1;

  try {
    await waitForReady(server, 'PGMEM_READY', 45_000);
    console.log(`Running ambient bot admin smoke against ${serverUrl}`);
    const smoke = spawn(process.execPath, ['scripts/ambient_bot_admin_smoke.mjs'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        SERVER_URL: serverUrl,
        AMBIENT_ADMIN_USER: adminUser,
        AMBIENT_ADMIN_PASS: adminPass,
        AMBIENT_SMOKE_ALLOW_LOGOUT: allowLogout,
      },
      stdio: 'inherit',
    });
    smokeCode = await waitForExit(smoke, 'ambient bot admin smoke');
  } finally {
    await stopChild(server);
  }
  process.exitCode = smokeCode;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
