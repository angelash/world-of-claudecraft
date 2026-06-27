#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  lanUrls,
  resolveForcedLanBindHost,
} from './lan_host.mjs';

const require = createRequire(import.meta.url);
const vitePackageJson = require.resolve('vite/package.json');
const viteBin = path.join(path.dirname(vitePackageJson), 'bin', 'vite.js');
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const buildServerScript = fileURLToPath(new URL('./build_server.mjs', import.meta.url));
const serverBundle = fileURLToPath(new URL('../dist-server/server.cjs', import.meta.url));

const argv = process.argv.slice(2);
const flagSet = new Set(argv.filter((arg) => arg.startsWith('--')));
const mode = argv.find((arg) => !arg.startsWith('--')) ?? 'stack';
const restart = flagSet.has('--restart');
const bindHost = resolveForcedLanBindHost(process.env);
const activeChildren = new Set();
let shuttingDown = false;

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out('Usage: node scripts/online_lan.mjs [stack|server|dev|urls] [--restart]');
  out('');
  out('  stack     Build the server, then run the server and Vite in LAN mode (default).');
  out('  server    Build and run only the authoritative server in LAN mode.');
  out('  dev       Run only the Vite dev server in LAN mode.');
  out('  urls      Print the LAN URLs that the dev server will expose.');
  out('');
  out('  --restart Stop any process already listening on :8787 or :5173 before booting.');
  process.exit(exitCode);
}

if (flagSet.has('--help') || flagSet.has('-h')) usage(0);
if (!new Set(['stack', 'server', 'dev', 'urls']).has(mode)) usage(1);

function portUrls(port) {
  const urls = lanUrls(port);
  return urls.length > 0 ? urls : [`http://localhost:${port}`];
}

function printLanUrls(port, label) {
  for (const url of portUrls(port)) console.log(`[lan] ${label}: ${url}`);
}

function serviceEnv() {
  return {
    ...process.env,
    WOC_LAN_BIND_HOST: bindHost,
    HOST: bindHost,
    BIND_HOST: bindHost,
    VITE_DEV_HOST: bindHost,
  };
}

function prefixStream(stream, prefix, dest) {
  let buffered = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffered += chunk;
    while (true) {
      const newlineIndex = buffered.indexOf('\n');
      if (newlineIndex < 0) break;
      const line = buffered.slice(0, newlineIndex + 1);
      buffered = buffered.slice(newlineIndex + 1);
      dest.write(`${prefix}${line}`);
    }
  });
  stream.on('end', () => {
    if (!buffered) return;
    dest.write(`${prefix}${buffered}${buffered.endsWith('\n') ? '' : '\n'}`);
  });
}

function trackChild(child) {
  activeChildren.add(child);
  child.on('exit', () => {
    activeChildren.delete(child);
  });
  return child;
}

function spawnNode(label, args, env) {
  const child = trackChild(spawn(process.execPath, args, {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }));
  prefixStream(child.stdout, `[${label}] `, process.stdout);
  prefixStream(child.stderr, `[${label}] `, process.stderr);
  return child;
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code: code ?? 0, signal: signal ?? '' }));
  });
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '0.0.0.0');
  });
}

function parseWindowsPortPids(stdout, port) {
  const pids = new Set();
  for (const line of stdout.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5 || parts[3] !== 'LISTENING') continue;
    if (!parts[1].endsWith(`:${port}`)) continue;
    const pid = Number(parts[4]);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

function findListeningPids(port) {
  try {
    if (process.platform === 'win32') {
      const stdout = execFileSync('netstat', ['-ano', '-p', 'tcp'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return parseWindowsPortPids(stdout, port);
    }
    const stdout = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return stdout
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

function killPid(pid) {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        cwd: repoRoot,
        stdio: ['ignore', 'ignore', 'ignore'],
        windowsHide: true,
      });
      return;
    }
    process.kill(pid, 'SIGTERM');
  } catch {
    // ignore missing or already-dead processes
  }
}

async function ensurePortsReady(ports) {
  for (const port of ports) {
    const pids = findListeningPids(port);
    const free = pids.length === 0 && await portIsFree(port);
    if (free) continue;
    if (!restart) {
      throw new Error(`port ${port} is already in use, rerun with --restart or stop the existing service first`);
    }
    if (pids.length === 0) {
      throw new Error(`port ${port} is already in use and no owning process could be identified`);
    }
    console.log(`[lan] stopping listeners on :${port} -> ${pids.join(', ')}`);
    for (const pid of pids) killPid(pid);
  }
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const states = await Promise.all(ports.map(async (port) => findListeningPids(port).length === 0 && await portIsFree(port)));
    if (states.every(Boolean)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ports ${ports.join(', ')} to become free`);
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [...activeChildren]) {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
  const deadline = Date.now() + 5_000;
  while (activeChildren.size > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  process.exit(exitCode);
}

function handleServiceExit(label, modeName, result) {
  if (shuttingDown) return;
  const exitCode = result.code || (result.signal ? 1 : 0);
  if (modeName === 'stack') {
    console.error(`[lan] ${label} exited (${result.signal || exitCode}), stopping the rest of the stack`);
    void shutdown(exitCode);
    return;
  }
  process.exit(exitCode);
}

async function startDev(modeName) {
  const child = spawnNode('dev', [viteBin, '--host', bindHost, '--strictPort'], serviceEnv());
  child.on('exit', (code, signal) => handleServiceExit('dev', modeName, { code: code ?? 0, signal: signal ?? '' }));
  return child;
}

async function startServer(modeName) {
  const build = spawnNode('server:build', [buildServerScript], serviceEnv());
  const buildResult = await waitForExit(build);
  if (buildResult.code !== 0) {
    handleServiceExit('server:build', modeName, buildResult);
    return null;
  }
  if (shuttingDown) return null;
  const runtime = spawnNode('server', [serverBundle], serviceEnv());
  runtime.on('exit', (code, signal) => handleServiceExit('server', modeName, { code: code ?? 0, signal: signal ?? '' }));
  return runtime;
}

process.on('SIGINT', () => void shutdown(130));
process.on('SIGTERM', () => void shutdown(143));

if (mode === 'urls') {
  console.log(`[lan] bind host: ${bindHost}`);
  printLanUrls(5173, 'game');
  printLanUrls(8787, 'server');
  process.exit(0);
}

console.log(`[lan] bind host: ${bindHost}`);
await ensurePortsReady(mode === 'stack' ? [8787, 5173] : [mode === 'server' ? 8787 : 5173]);

if (mode === 'server') {
  printLanUrls(8787, 'server');
  await startServer('server');
} else if (mode === 'dev') {
  printLanUrls(5173, 'game');
  await startDev('dev');
} else {
  printLanUrls(5173, 'game');
  printLanUrls(8787, 'server');
  await Promise.all([startServer('stack'), startDev('stack')]);
}
