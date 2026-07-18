import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const CHILD_ENV_ALLOWLIST = [
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'TZ',
  'OPENAI_API_KEY',
  'CODEX_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_ORGANIZATION',
  'OPENAI_ORG_ID',
  'OPENAI_PROJECT',
  'OPENAI_PROJECT_ID',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
] as const;

const DISABLED_CODEX_FEATURES = [
  'plugins',
  'apps',
  'hooks',
  'shell_tool',
  'browser_use',
  'computer_use',
  'image_generation',
  'multi_agent',
  'in_app_browser',
  'workspace_dependencies',
] as const;

export interface CodexIsolation {
  rootDir: string;
  workspaceDir: string;
  artifactsDir: string;
  codexHomeDir: string;
  env: NodeJS.ProcessEnv;
}

export function codexLockdownArgs(): string[] {
  return [
    ...DISABLED_CODEX_FEATURES.flatMap((feature) => ['--disable', feature]),
    '-c',
    'web_search="disabled"',
    '-c',
    'shell_environment_policy.inherit="none"',
    '-c',
    'mcp_servers={}',
  ];
}

export async function createCodexIsolation(
  prefix: string,
  sourceEnv: NodeJS.ProcessEnv = process.env,
): Promise<CodexIsolation> {
  const rootDir = await mkdtemp(join(tmpdir(), prefix));
  const workspaceDir = join(rootDir, 'workspace');
  const artifactsDir = join(rootDir, 'artifacts');
  const codexHomeDir = join(rootDir, 'codex-home');
  await Promise.all([mkdir(workspaceDir), mkdir(artifactsDir), mkdir(codexHomeDir)]);

  await copyCodexAuth(codexHomeDir, sourceEnv);
  return {
    rootDir,
    workspaceDir,
    artifactsDir,
    codexHomeDir,
    env: minimalCodexChildEnv(codexHomeDir, sourceEnv),
  };
}

export async function removeCodexIsolation(isolation: CodexIsolation | null): Promise<void> {
  if (!isolation) return;
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await rm(isolation.rootDir, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function minimalCodexChildEnv(
  codexHomeDir: string,
  sourceEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { CODEX_HOME: codexHomeDir };
  const sourceKeys = new Map(Object.keys(sourceEnv).map((key) => [key.toUpperCase(), key]));
  for (const name of CHILD_ENV_ALLOWLIST) {
    const sourceKey = sourceKeys.get(name);
    const value = sourceKey ? sourceEnv[sourceKey] : undefined;
    if (value !== undefined) env[name] = value;
  }
  return env;
}

async function copyCodexAuth(codexHomeDir: string, sourceEnv: NodeJS.ProcessEnv): Promise<void> {
  const configuredHome = envValueCaseInsensitive(sourceEnv, 'CODEX_HOME');
  const sourceHome = configuredHome?.trim() || join(homedir(), '.codex');
  try {
    await copyFile(join(sourceHome, 'auth.json'), join(codexHomeDir, 'auth.json'));
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
}

function envValueCaseInsensitive(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const wanted = name.toUpperCase();
  for (const [key, value] of Object.entries(env)) {
    if (key.toUpperCase() === wanted) return value;
  }
  return undefined;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
