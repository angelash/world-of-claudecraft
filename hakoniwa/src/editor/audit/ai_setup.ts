// AI mode for the workbench: pick the model provider (the dev proxy when
// GET /api/llm/status says a model is reachable, otherwise a scripted mock for offline
// review, or none) and build the AiRunner over the inspector's engine. The reveal
// ledger guard is wired in: locked terms and keywords of the current world decline an
// answer that mentions them. Pure: transport and clock are injected.

import type { AuditLog } from '../../ai/audit';
import type { Clock, HttpTransport, LlmProvider } from '../../ai/contracts';
import { MockProvider, type MockStep, NullProvider, ProxyProvider } from '../../ai/providers';
import { type AiHost, AiRunner } from '../../ai/runner';
import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { createRoleRegistry } from '../../game/ai_roles';
import { lockedKeywords, lockedTerms } from '../../systems/quests';
import type { ProviderKind } from '../state/game_session';
import { fmt, T } from '../text';

export type ProviderChoice = 'auto' | ProviderKind;

export interface ProviderPick {
  provider: LlmProvider;
  kind: ProviderKind;
  note: string;
}

export interface ProviderDeps {
  clock: Clock;
  transport?: HttpTransport;
  baseUrl?: string;
  /** used when the proxy is chosen but unavailable, and by 'auto' offline */
  offline: 'mock' | 'null';
  mockScript: MockStep[];
  repeatLast: boolean;
}

/** Parse the mock script box: a JSON array of answers ({ "json": ... } or a failure). */
export function parseMockScript(
  text: string,
): { ok: true; steps: MockStep[] } | { ok: false; error: string } {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : T.audit.mockBad };
  }
  const list = Array.isArray(v) ? v : [v];
  const steps: MockStep[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: T.audit.mockBad };
    }
    const o = item as Record<string, unknown>;
    if ('ok' in o || 'json' in o) steps.push(o as MockStep);
    else steps.push({ json: o });
  }
  return { ok: true, steps };
}

function mockOrNull(deps: ProviderDeps, why: string): ProviderPick {
  if (deps.offline === 'mock') {
    return {
      provider: new MockProvider(deps.mockScript, { repeatLast: deps.repeatLast }),
      kind: 'mock',
      note: why,
    };
  }
  return { provider: new NullProvider(), kind: 'null', note: why };
}

/** Choose the provider. 'auto' asks the proxy first and falls back for offline review. */
export async function chooseProvider(
  choice: ProviderChoice,
  deps: ProviderDeps,
): Promise<ProviderPick> {
  if (choice === 'mock') return mockOrNull({ ...deps, offline: 'mock' }, T.audit.noteMock);
  if (choice === 'null')
    return { provider: new NullProvider(), kind: 'null', note: T.audit.noteNull };
  const proxy = new ProxyProvider({
    baseUrl: deps.baseUrl,
    transport: deps.transport,
    clock: deps.clock,
  });
  const status = await proxy.status();
  if (status.available) {
    const tiers = Object.entries(status.tiers ?? {})
      .map(([k, m]) => `${k} ${m}`)
      .join(', ');
    return { provider: proxy, kind: 'proxy', note: fmt(T.audit.noteProxy, { tiers }) };
  }
  const why = fmt(T.audit.noteProxyDown, { reason: status.reason ?? '' });
  if (choice === 'proxy') return { provider: proxy, kind: 'proxy', note: why };
  return mockOrNull(deps, why);
}

/** Locked reveal-ledger phrases for the current world (terms and lore keywords). */
export function lockedPhrases(world: World, content: ContentMap): string[] {
  const c = content as unknown as { lore?: unknown[]; terms?: unknown[] };
  if (!Array.isArray(c.lore) || !Array.isArray(c.terms)) return [];
  const terms = lockedTerms(world, content).map((t) => t.term);
  return [...new Set([...terms, ...lockedKeywords(world, content)])];
}

export interface RunnerOptions {
  engine: AiHost & { readonly world: World };
  content: ContentMap;
  provider: LlmProvider;
  clock: Clock;
  audit: AuditLog;
  /** real ms per tick at the current speed; the caller may update it later */
  msPerTick: number;
}

/** The runner plus its options object (msPerTick is read live, so speed changes apply). */
export function createRunner(opts: RunnerOptions): {
  runner: AiRunner;
  setMsPerTick(ms: number): void;
} {
  const runnerOpts = {
    engine: opts.engine,
    provider: opts.provider,
    roles: createRoleRegistry(),
    clock: opts.clock,
    audit: opts.audit,
    msPerTick: opts.msPerTick,
    forbiddenPhrases: () => lockedPhrases(opts.engine.world, opts.content),
  };
  const runner = new AiRunner(runnerOpts);
  return {
    runner,
    setMsPerTick(ms: number) {
      runnerOpts.msPerTick = ms;
    },
  };
}
