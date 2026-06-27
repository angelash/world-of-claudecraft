#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const WINDOWS_POSTGRES_VERSION = '16.14';
const WINDOWS_POSTGRES_BIN_URL =
  'https://sbp.enterprisedb.com/getfile.jsp?fileid=1260308';
const SUPERUSER = 'postgres';
const LOOPBACK_HOST = '127.0.0.1';

function loadLocalEnv() {
  try {
    process.loadEnvFile?.();
  } catch {
    // .env is optional.
  }
}

function isLoopbackHost(host) {
  const normalized = host.trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

function normalizeHost(host) {
  return host.trim().toLowerCase() === 'localhost' ? LOOPBACK_HOST : host.trim();
}

function defaultNativeHomeDir() {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'WorldOfClaudeCraft', 'postgresql');
  }
  return path.join(homedir(), '.world-of-claudecraft', 'postgresql');
}

function parseDatabaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    throw new Error(
      `DATABASE_URL must be a valid postgres:// URL, received: ${String(error)}`,
    );
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`DATABASE_URL must use postgres:// or postgresql://, received ${url.protocol}`);
  }
  const username = decodeURIComponent(url.username);
  const host = url.hostname;
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const port = Number(url.port || '5432');
  if (!username) throw new Error('DATABASE_URL must include a username.');
  if (!host) throw new Error('DATABASE_URL must include a host.');
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`DATABASE_URL must include a valid port, received ${url.port || '(empty)'}.`);
  }
  if (!databaseName) throw new Error('DATABASE_URL must include a database name.');
  return {
    username,
    password: decodeURIComponent(url.password),
    host: normalizeHost(host),
    port,
    databaseName,
  };
}

function quoteSqlIdentifier(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteSqlLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function psLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildToolEnv(binDir) {
  if (!binDir) return { ...process.env };
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const currentPath = process.env.PATH ?? '';
  return {
    ...process.env,
    PATH: currentPath ? `${binDir}${pathSep}${currentPath}` : binDir,
  };
}

function runCommand(command, args, options = {}) {
  const capture = options.capture ?? false;
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    const detail = capture
      ? `\n${(result.stderr || result.stdout || '').trim()}`
      : '';
    throw new Error(
      `${path.basename(command)} exited with code ${result.status ?? 1}.${detail}`,
    );
  }
  return result;
}

function findPostgresBinDir(rootDir) {
  if (!existsSync(rootDir)) return '';
  const stack = [rootDir];
  const pgCtlName = process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl';
  const psqlName = process.platform === 'win32' ? 'psql.exe' : 'psql';
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    const names = new Set(entries.map((entry) => entry.name.toLowerCase()));
    if (names.has(pgCtlName.toLowerCase()) && names.has(psqlName.toLowerCase())) return current;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      stack.push(path.join(current, entry.name));
    }
  }
  return '';
}

async function downloadFile(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`download failed from ${url} with status ${response.status}`);
  }
  const tmpDestination = `${destination}.downloading`;
  mkdirSync(path.dirname(destination), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(tmpDestination));
  renameSync(tmpDestination, destination);
}

function extractWindowsArchive(archivePath, destination) {
  const tarResult = runCommand('tar.exe', ['-xf', archivePath, '-C', destination], {
    allowFailure: true,
    capture: true,
    env: buildToolEnv(''),
  });
  if (tarResult.status === 0) return;
  runCommand(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath ${psLiteral(archivePath)} -DestinationPath ${psLiteral(destination)} -Force`,
    ],
    { env: buildToolEnv('') },
  );
}

async function ensureWindowsBinaries(config) {
  const existing = findPostgresBinDir(config.installDir);
  if (existing) return existing;
  if (!config.windowsArchiveUrl) {
    throw new Error('POSTGRES_WINDOWS_BIN_URL is required on Windows when PostgreSQL binaries are missing.');
  }
  mkdirSync(config.rootDir, { recursive: true });
  mkdirSync(path.dirname(config.archivePath), { recursive: true });
  if (!existsSync(config.archivePath) || statSync(config.archivePath).size === 0) {
    console.log(
      `[db] downloading native PostgreSQL ${config.windowsVersion} for Windows from the official EDB binaries page...`,
    );
    await downloadFile(config.windowsArchiveUrl, config.archivePath);
  } else {
    console.log(`[db] reusing cached PostgreSQL archive at ${config.archivePath}`);
  }

  const extractRoot = path.join(config.rootDir, 'tmp', `extract-${Date.now()}`);
  rmSync(extractRoot, { recursive: true, force: true });
  mkdirSync(extractRoot, { recursive: true });
  extractWindowsArchive(config.archivePath, extractRoot);

  const extractedBinDir = findPostgresBinDir(extractRoot);
  if (!extractedBinDir) {
    throw new Error(`could not find pg_ctl/psql after extracting ${config.archivePath}`);
  }
  const extractedRoot = path.dirname(extractedBinDir);
  rmSync(config.installDir, { recursive: true, force: true });
  mkdirSync(path.dirname(config.installDir), { recursive: true });
  if (path.resolve(extractedRoot) === path.resolve(extractRoot)) {
    renameSync(extractRoot, config.installDir);
  } else {
    renameSync(extractedRoot, config.installDir);
    rmSync(extractRoot, { recursive: true, force: true });
  }
  const finalBinDir = findPostgresBinDir(config.installDir);
  if (!finalBinDir) {
    throw new Error(`PostgreSQL binaries were extracted, but ${config.installDir} is incomplete.`);
  }
  return finalBinDir;
}

async function resolvePostgresBinDir(config, options = {}) {
  const configuredBinDir = process.env.POSTGRES_BIN_DIR?.trim();
  if (configuredBinDir) {
    const found = findPostgresBinDir(configuredBinDir) || configuredBinDir;
    return found;
  }
  if (process.platform === 'win32') {
    if (options.allowBootstrap === false) return findPostgresBinDir(config.installDir);
    return ensureWindowsBinaries(config);
  }
  return '';
}

function toolPath(binDir, toolName) {
  if (!binDir) return toolName;
  return path.join(binDir, process.platform === 'win32' ? `${toolName}.exe` : toolName);
}

function runTool(binDir, toolName, args, options = {}) {
  return runCommand(toolPath(binDir, toolName), args, {
    ...options,
    env: options.env ?? buildToolEnv(binDir),
  });
}

function clusterMarkerPath(dataDir) {
  return path.join(dataDir, 'PG_VERSION');
}

function managedHbaPath(dataDir) {
  return path.join(dataDir, 'pg_hba.conf');
}

function writeManagedPgHba(config) {
  const contents = `# Managed by scripts/native_postgres.mjs for local native dev.
# The local helper only listens on loopback, so trust auth here stays local-only.
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
`;
  writeFileSync(managedHbaPath(config.dataDir), contents, 'utf8');
}

function ensureClusterInitialized(config, binDir) {
  if (existsSync(clusterMarkerPath(config.dataDir))) return;
  mkdirSync(path.dirname(config.dataDir), { recursive: true });
  mkdirSync(config.dataDir, { recursive: true });
  const existingEntries = readdirSync(config.dataDir);
  if (existingEntries.length > 0) {
    throw new Error(
      `POSTGRES_DATA_DIR (${config.dataDir}) exists but is not an initialized PostgreSQL cluster. Empty it or point POSTGRES_DATA_DIR somewhere else.`,
    );
  }
  console.log(`[db] initializing native PostgreSQL cluster in ${config.dataDir}`);
  runTool(binDir, 'initdb', [
    '-D',
    config.dataDir,
    '-U',
    SUPERUSER,
    '--auth-host=trust',
    '--auth-local=trust',
    '-E',
    'UTF8',
  ]);
}

function serverStartOptions(config) {
  return `-h ${LOOPBACK_HOST} -p ${config.database.port}`;
}

function pgCtlStatus(binDir, config) {
  if (!existsSync(clusterMarkerPath(config.dataDir))) return false;
  const status = runTool(binDir, 'pg_ctl', ['status', '-D', config.dataDir], {
    allowFailure: true,
    capture: true,
  });
  return status.status === 0;
}

function reloadCluster(binDir, config) {
  runTool(binDir, 'pg_ctl', ['reload', '-D', config.dataDir], {
    allowFailure: true,
    capture: true,
  });
}

function psqlAdminArgs(config, args = []) {
  return [
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-h',
    LOOPBACK_HOST,
    '-p',
    String(config.database.port),
    '-U',
    SUPERUSER,
    '-d',
    'postgres',
    ...args,
  ];
}

function runPsql(binDir, config, sql) {
  runTool(binDir, 'psql', psqlAdminArgs(config, ['-c', sql]));
}

function queryPsqlValue(binDir, config, sql) {
  const result = runTool(binDir, 'psql', psqlAdminArgs(config, ['-tA', '-c', sql]), {
    capture: true,
  });
  return (result.stdout ?? '').trim();
}

function ensureRoleAndDatabase(config, binDir) {
  const roleIdent = quoteSqlIdentifier(config.database.username);
  const databaseIdent = quoteSqlIdentifier(config.database.databaseName);
  const roleExists = queryPsqlValue(
    binDir,
    config,
    `SELECT 1 FROM pg_roles WHERE rolname = ${quoteSqlLiteral(config.database.username)};`,
  );
  const createRoleSql = config.database.password
    ? `CREATE ROLE ${roleIdent} LOGIN PASSWORD ${quoteSqlLiteral(config.database.password)};`
    : `CREATE ROLE ${roleIdent} LOGIN;`;
  const alterRoleSql = config.database.password
    ? `ALTER ROLE ${roleIdent} WITH LOGIN PASSWORD ${quoteSqlLiteral(config.database.password)};`
    : `ALTER ROLE ${roleIdent} WITH LOGIN PASSWORD NULL;`;
  runPsql(binDir, config, roleExists === '1' ? alterRoleSql : createRoleSql);

  const dbExists = queryPsqlValue(
    binDir,
    config,
    `SELECT 1 FROM pg_database WHERE datname = ${quoteSqlLiteral(config.database.databaseName)};`,
  );
  if (dbExists !== '1') {
    runPsql(binDir, config, `CREATE DATABASE ${databaseIdent} OWNER ${roleIdent};`);
  } else {
    const owner = queryPsqlValue(
      binDir,
      config,
      `SELECT pg_catalog.pg_get_userbyid(datdba)
         FROM pg_database
        WHERE datname = ${quoteSqlLiteral(config.database.databaseName)};`,
    );
    if (owner !== config.database.username) {
      runPsql(binDir, config, `ALTER DATABASE ${databaseIdent} OWNER TO ${roleIdent};`);
    }
  }
}

export function getNativePostgresConfig() {
  loadLocalEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is required. Copy .env.example to .env before running npm run db:up.',
    );
  }
  const parsed = parseDatabaseUrl(connectionString);
  if (!isLoopbackHost(parsed.host)) {
    throw new Error(
      `npm run db:up bootstraps a local native PostgreSQL cluster, so DATABASE_URL must point at a loopback host. Received ${parsed.host}.`,
    );
  }
  const envPassword = process.env.POSTGRES_PASSWORD ?? '';
  const databasePassword = parsed.password || envPassword;
  const rootDir = process.env.POSTGRES_HOME_DIR?.trim() || defaultNativeHomeDir();
  const windowsVersion = process.env.POSTGRES_WINDOWS_VERSION?.trim() || WINDOWS_POSTGRES_VERSION;
  return {
    rootDir,
    installDir:
      process.env.POSTGRES_INSTALL_DIR?.trim() ||
      path.join(rootDir, 'install', `postgresql-${windowsVersion}`),
    dataDir:
      process.env.POSTGRES_DATA_DIR?.trim() || path.join(rootDir, 'data'),
    logDir:
      process.env.POSTGRES_LOG_DIR?.trim() || path.join(rootDir, 'log'),
    archivePath:
      process.env.POSTGRES_WINDOWS_ARCHIVE?.trim() ||
      path.join(rootDir, 'downloads', `postgresql-${windowsVersion}-windows-x64-binaries.zip`),
    windowsArchiveUrl:
      process.env.POSTGRES_WINDOWS_BIN_URL?.trim() || WINDOWS_POSTGRES_BIN_URL,
    windowsVersion,
    database: {
      username: parsed.username,
      password: databasePassword,
      host: LOOPBACK_HOST,
      port: parsed.port,
      databaseName: parsed.databaseName,
    },
    passwordMismatch:
      Boolean(parsed.password) &&
      Boolean(envPassword) &&
      parsed.password !== envPassword,
  };
}

export async function ensureNativePostgresRunning(config = getNativePostgresConfig()) {
  const binDir = await resolvePostgresBinDir(config);
  if (!binDir && process.platform !== 'win32') {
    throw new Error(
      'Could not find native PostgreSQL tools. Install PostgreSQL and put pg_ctl/initdb/psql on PATH, or set POSTGRES_BIN_DIR.',
    );
  }

  ensureClusterInitialized(config, binDir);
  writeManagedPgHba(config);
  mkdirSync(config.logDir, { recursive: true });

  if (pgCtlStatus(binDir, config)) {
    reloadCluster(binDir, config);
    console.log(
      `[db] native PostgreSQL is already running on ${config.database.host}:${config.database.port}`,
    );
  } else {
    const logPath = path.join(config.logDir, 'postgres.log');
    runTool(binDir, 'pg_ctl', [
      'start',
      '-D',
      config.dataDir,
      '-l',
      logPath,
      '-o',
      serverStartOptions(config),
      '-w',
      '-t',
      '60',
    ]);
    console.log(
      `[db] native PostgreSQL started on ${config.database.host}:${config.database.port}`,
    );
  }

  runTool(binDir, 'psql', psqlAdminArgs(config, ['-tA', '-c', 'SELECT 1;']), { capture: true });
  ensureRoleAndDatabase(config, binDir);
  return { binDir, config };
}

export async function stopNativePostgres(config = getNativePostgresConfig()) {
  if (!existsSync(clusterMarkerPath(config.dataDir))) {
    console.log(`[db] no native PostgreSQL cluster found at ${config.dataDir}`);
    return false;
  }
  const binDir = await resolvePostgresBinDir(config, { allowBootstrap: false });
  if (!binDir && process.platform === 'win32') {
    throw new Error(
      `Could not find pg_ctl in ${config.installDir}. Set POSTGRES_BIN_DIR if PostgreSQL lives somewhere else.`,
    );
  }
  if (!pgCtlStatus(binDir, config)) {
    console.log('[db] native PostgreSQL is already stopped');
    return false;
  }
  runTool(binDir, 'pg_ctl', [
    'stop',
    '-D',
    config.dataDir,
    '-m',
    'fast',
    '-w',
    '-t',
    '60',
  ]);
  console.log('[db] native PostgreSQL stopped');
  return true;
}
