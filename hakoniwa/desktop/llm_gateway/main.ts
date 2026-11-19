// Entry of the model gateway utility process (docs/50_tech/release_engineering.md 2.1):
// started by the main process with utilityProcess.fork, it talks only over its parent
// port. Everything it decides lives in core.ts; this file is the process glue.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { type MessagePortMain, net } from 'electron';
import { defaultSettings, validateSettings } from '../../src/ai/llm_config/settings';
import { createGatewayCore } from './core';
import { createNetSender } from './net_send';
import { createGatewayRuntime } from './runtime';

const parent = process.parentPort;
const root = process.argv[2] ? resolve(process.argv[2]) : undefined;
const directory = root ? join(root, 'llm') : undefined;
if (directory) mkdirSync(directory, { recursive: true, mode: 0o700 });
const spendFile = directory ? join(directory, 'spend.json') : undefined;
const ledgerFile = directory ? join(directory, 'ledger.jsonl') : undefined;
const settings = () => {
  if (!root) return defaultSettings();
  try {
    const file = join(root, 'settings.local.json');
    if (statSync(file).size > 256 * 1024) return defaultSettings();
    return validateSettings(JSON.parse(readFileSync(file, 'utf8')).llm).settings;
  } catch {
    return defaultSettings();
  }
};
let core: ReturnType<typeof createGatewayCore>;
const restored =
  spendFile && existsSync(spendFile) ? JSON.parse(readFileSync(spendFile, 'utf8')) : undefined;
const runtime = createGatewayRuntime({
  settings,
  secret: (id, target, requestedFingerprint) =>
    core?.secretForRequest(id, target, requestedFingerprint),
  send: createNetSender((url, init) => net.fetch(url instanceof URL ? url.href : url, init)),
  restored,
  persist: (state) => {
    if (!spendFile || !ledgerFile) throw new Error('gateway storage is unavailable');
    const text = JSON.stringify(state);
    const temporary = `${spendFile}.tmp`;
    writeFileSync(temporary, text, { encoding: 'utf8', mode: 0o600, flush: true });
    renameSync(temporary, spendFile);
    // Metadata-only journal, bounded independently of the authoritative spend snapshots.
    if (existsSync(ledgerFile) && statSync(ledgerFile).size > 5 * 1024 * 1024) {
      renameSync(ledgerFile, `${ledgerFile}.prev`);
    }
    const entries = (state as { entries?: unknown[] }).entries ?? [];
    appendFileSync(ledgerFile, `${JSON.stringify(entries.at(-1) ?? {})}\n`, {
      mode: 0o600,
      flush: true,
    });
  },
});
core = createGatewayCore({
  connections: () => settings().connections.map((c) => ({ ...c, enabled: true })),
  runtime,
  emit: (reply) => parent.postMessage(reply),
});

parent.on('message', (event: { data: unknown; ports: MessagePortMain[] }) => {
  let reply = null;
  try {
    reply = core.handle(event.data, event.ports ?? []);
  } catch {
    // A defect in one message must not take the gateway down; the caller times out.
    for (const p of event.ports ?? []) p.close();
  }
  if (reply) parent.postMessage(reply);
});
