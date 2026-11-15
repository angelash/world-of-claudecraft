// The quick connection test (docs/50_tech/llm_providers.md 5.6) and the model listing, as
// host-neutral flows over an injected sender: the desktop gateway, the dev proxy and tests
// each pass their own AdapterSend (which adds auth and enforces timeouts). No clock and no
// network here; the report time is passed in. Deep test items (prompt cache, throughput,
// the role fit quiz) arrive in M2.

import type { LlmCallResult, ProblemCode } from '../contracts';
import { adapterFor } from './adapters';
import { checkBaseUrl } from './address';
import {
  capabilityFromProbes,
  knownModel,
  lowContextRoles,
  PROBE_TIMEOUT_MS,
  type ProbeOutcome,
  probeAnswerOk,
  probeProfile,
  withCapability,
} from './capabilities';
import type {
  AdapterSend,
  ConnectionPublic,
  ConnectionTestReport,
  ModelListing,
  ModelListingEntry,
  ModelProfile,
  ModelTestRow,
  ProbeKind,
  ProviderAdapter,
  TestCheck,
} from './types';

/** The reachability check waits at most this long (5.6 item 2). */
export const REACH_TIMEOUT_MS = 5_000;
/** Listing pages read at most (Anthropic pages by 100). */
export const MAX_LISTING_PAGES = 5;

/** Read every page of a model listing. */
export async function fetchModelListing(
  conn: ConnectionPublic,
  send: AdapterSend,
  timeoutMs = REACH_TIMEOUT_MS,
): Promise<ModelListing> {
  const adapter = adapterFor(conn.kind);
  if (conn.kind === 'none') return adapter.parseModels(0, '', conn);
  let cursor: string | undefined;
  let merged: ModelListing | undefined;
  for (let page = 0; page < MAX_LISTING_PAGES; page++) {
    const sent = await send(adapter.listModels(conn, cursor), { timeoutMs });
    if (!sent.ok) {
      const e = adapter.classify(0, '', {}, sent.netError);
      const out: ModelListing = {
        connectionId: conn.id,
        ok: false,
        models: [],
        message: e.message,
      };
      if (e.problem) out.problem = e.problem;
      return merged && merged.models.length > 0 ? merged : out;
    }
    const listing = adapter.parseModels(sent.res.status, sent.res.body, conn);
    if (!merged) merged = listing;
    else {
      merged.models.push(...listing.models);
      if (listing.otherIds) merged.otherIds = [...(merged.otherIds ?? []), ...listing.otherIds];
    }
    if (!listing.ok || !listing.nextCursor) break;
    cursor = listing.nextCursor;
  }
  if (merged) delete merged.nextCursor;
  return merged ?? { connectionId: conn.id, ok: false, models: [] };
}

function findListed(
  listing: ModelListing | undefined,
  model: string,
): ModelListingEntry | undefined {
  const hit = listing?.models.find((m) => m.model === model || m.model === `${model}:latest`);
  if (hit) return hit;
  // A chat model the known table does not have yet (hand-entered, 3.2): listed, probed.
  return listing?.otherIds?.includes(model) ? { model, known: false } : undefined;
}

/** Probe kinds of the structured check, in channel order (5.6 item 5, 3.7). */
export function structuredProbes(conn: ConnectionPublic, prof: ModelProfile): ProbeKind[] {
  if (conn.kind === 'anthropic') {
    if (knownModel('anthropic', prof.model)) {
      const ch = prof.capability.channels[0] ?? 'prompt_only';
      return [`structured_${ch === 'tool_carrier' ? 'tool_named' : ch}` as ProbeKind];
    }
    return [
      'structured_json_schema',
      'structured_tool_named',
      'structured_tool_required',
      'structured_tool_auto',
      'structured_prompt_only',
    ];
  }
  if (conn.kind === 'openai_compat') {
    return [
      'structured_json_schema',
      'structured_tool_named',
      'structured_tool_required',
      'structured_tool_auto',
      'structured_json_mode',
      'structured_prompt_only',
    ];
  }
  return ['structured_json_schema', 'structured_json_mode', 'structured_prompt_only'];
}

/** Problems that say nothing about whether a feature is supported (llm_providers.md 3.7). */
const TRANSIENT: ReadonlySet<ProblemCode> = new Set([
  'rate_limited',
  'overloaded',
  'server_error',
  'timeout',
  'network',
  'model_not_loaded',
]);

interface ProbeRun {
  outcome: ProbeOutcome;
  result?: LlmCallResult;
}

async function runProbe(
  adapter: ProviderAdapter,
  conn: ConnectionPublic,
  prof: ModelProfile,
  kind: ProbeKind,
  send: AdapterSend,
): Promise<ProbeRun> {
  const req = adapter.probe(kind, conn, prof);
  const sent = await send(req, { timeoutMs: PROBE_TIMEOUT_MS });
  if (!sent.ok) {
    const e = adapter.classify(0, '', {}, sent.netError);
    const outcome: ProbeOutcome = { kind, ok: false, latencyMs: sent.latencyMs, transient: true };
    if (e.problem) outcome.problem = e.problem;
    return { outcome };
  }
  const res = sent.res;
  const p = probeProfile(kind, prof);
  const okStatus = res.status >= 200 && res.status < 300;
  let result: LlmCallResult;
  let streamUsage: boolean | undefined;
  if (req.read !== 'json' && okStatus) {
    const step = adapter.parseStreamEvent(adapter.startStream(p, res.headers), `${res.body}\n`);
    result = adapter.endStream(step.state, res.latencyMs, p);
    streamUsage = step.state.usageSeen;
  } else result = adapter.parse(res.status, res.body, res.latencyMs, p, res.headers);
  const outcome: ProbeOutcome = {
    kind,
    ok: result.ok && probeAnswerOk(result.json),
    latencyMs: res.latencyMs,
  };
  if (res.firstByteMs !== undefined) outcome.firstByteMs = res.firstByteMs;
  if (streamUsage !== undefined) outcome.streamUsage = streamUsage;
  if (!result.ok) {
    if (result.problem) outcome.problem = result.problem;
    if (result.problem && TRANSIENT.has(result.problem)) outcome.transient = true;
    if (!okStatus) {
      const e = adapter.classify(res.status, res.body, res.headers);
      if (e.unsupportedParam) outcome.unsupportedParam = e.unsupportedParam;
    }
  }
  return { outcome, result };
}

export interface ConnectionTestInput {
  conn: ConnectionPublic;
  /** Enabled models to test (defaults to the connection's list). */
  profiles?: ModelProfile[];
  depth: 'quick' | 'deep';
  /** Whether a key (or token) is stored for this connection. */
  hasKey: boolean;
  /** Web demo build: only loopback addresses. */
  web?: boolean;
  /** ISO time stamped on the report and the probed capabilities. */
  testedAt: string;
}

/**
 * The quick test, items 1 to 8 of llm_providers.md 5.6. A failing address, reachability or
 * auth check skips the rest; a model that is missing or not loaded skips its probes.
 */
export async function runConnectionTest(
  input: ConnectionTestInput,
  send: AdapterSend,
): Promise<ConnectionTestReport> {
  const { conn } = input;
  const adapter = adapterFor(conn.kind);
  const checks: TestCheck[] = [];
  const problems: ProblemCode[] = [];
  let requests = 0;
  const counted: AdapterSend = (req, opts) => {
    requests++;
    return send(req, opts);
  };
  const push = (c: TestCheck) => {
    checks.push(c);
    if (c.problem && !problems.includes(c.problem)) problems.push(c.problem);
  };
  const report = (models: ModelTestRow[] = []): ConnectionTestReport => ({
    connectionId: conn.id,
    depth: input.depth,
    ok: checks.every((c) => c.verdict !== 'fail'),
    checks,
    models,
    problems,
    requests,
    testedAt: input.testedAt,
  });
  const skip = (...ids: TestCheck['id'][]) => {
    for (const id of ids) push({ id, verdict: 'skipped' });
  };
  const rest = ['stream', 'params', 'context'] as const;

  if (conn.kind === 'none') {
    push({ id: 'address', verdict: 'not_needed' });
    skip('reachable', 'auth', 'model', 'structured', ...rest);
    return report();
  }

  // 1 address
  const addr = checkBaseUrl(conn.baseUrl, conn.kind, { web: input.web, flavor: conn.flavor });
  if (!addr.ok) {
    push({
      id: 'address',
      verdict: 'fail',
      problem: 'endpoint_wrong',
      detail: { issue: addr.issue ?? 'invalid' },
    });
    skip('reachable', 'auth', 'model', 'structured', ...rest);
    return report();
  }
  push({ id: 'address', verdict: 'pass', ...(addr.hintV1 ? { detail: { hintV1: true } } : {}) });

  // 2 reachable, 3 auth
  const listReq = adapter.listModels(conn);
  const sent = await counted(listReq, { timeoutMs: REACH_TIMEOUT_MS });
  if (!sent.ok) {
    const e = adapter.classify(0, '', {}, sent.netError);
    push({ id: 'reachable', verdict: 'fail', problem: e.problem, latencyMs: sent.latencyMs });
    skip('auth', 'model', 'structured', ...rest);
    return report();
  }
  const { status } = sent.res;
  const authStatus = status === 401 || status === 403;
  if (!(status >= 200 && status < 300) && !authStatus) {
    const e = adapter.classify(status, sent.res.body, sent.res.headers);
    push({ id: 'reachable', verdict: 'fail', problem: e.problem, latencyMs: sent.res.latencyMs });
    skip('auth', 'model', 'structured', ...rest);
    return report();
  }
  push({ id: 'reachable', verdict: 'pass', latencyMs: sent.res.latencyMs });
  const cloud = conn.kind !== 'local';
  if (authStatus) {
    const problem: ProblemCode =
      cloud && !input.hasKey
        ? 'not_configured'
        : status === 401
          ? 'key_invalid'
          : 'permission_denied';
    push({ id: 'auth', verdict: 'fail', problem });
    skip('model', 'structured', ...rest);
    return report();
  }
  push({ id: 'auth', verdict: input.hasKey ? 'pass' : 'not_needed' });
  let listing = adapter.parseModels(status, sent.res.body, conn);
  if (listing.nextCursor) {
    // More pages: read them through the same sender.
    const restListing = await fetchModelListing(conn, counted);
    if (restListing.ok) listing = restListing;
  }

  // 4 model, 8 context metadata
  const profiles = input.profiles ?? conn.models;
  const rows: ModelTestRow[] = [];
  const usable: ModelProfile[] = [];
  for (const prof of profiles) {
    const listed = findListed(listing, prof.model);
    if (!listed) {
      push({ id: 'model', verdict: 'fail', problem: 'model_not_found', model: prof.model });
      continue;
    }
    let meta = {
      contextTokens: listed.contextTokens,
      sizeClass: listed.sizeClass,
      loaded: listed.loaded,
    };
    if (adapter.modelMeta && adapter.parseModelMeta && conn.kind !== 'anthropic') {
      const m = await counted(adapter.modelMeta(conn, prof.model), { timeoutMs: REACH_TIMEOUT_MS });
      if (m.ok) {
        const pm = adapter.parseModelMeta(m.res.status, m.res.body);
        meta = {
          contextTokens: pm.contextTokens ?? meta.contextTokens,
          sizeClass: pm.sizeClass && pm.sizeClass !== 'unknown' ? pm.sizeClass : meta.sizeClass,
          loaded: pm.loaded ?? meta.loaded,
        };
      }
    }
    if (meta.loaded === false) {
      push({ id: 'model', verdict: 'fail', problem: 'model_not_loaded', model: prof.model });
      continue;
    }
    push({ id: 'model', verdict: 'pass', model: prof.model });
    let p = prof;
    if (meta.contextTokens !== undefined && prof.capability.contextSource !== 'player') {
      p = withCapability(p, { contextTokens: meta.contextTokens, contextSource: 'service_meta' });
    }
    if (meta.sizeClass && meta.sizeClass !== 'unknown') p = { ...p, sizeClass: meta.sizeClass };
    usable.push(p);
  }

  for (const start of usable) {
    let prof = start;
    const known = knownModel(conn.kind, prof.model) !== undefined;
    const outcomes: ProbeOutcome[] = [];
    let firstByteMs: number | undefined;
    let latencyMs: number | undefined;

    // 5 structured (and the max_completion_tokens switch when max_tokens is refused)
    let toolOk = false;
    for (const kind of structuredProbes(conn, prof)) {
      const laterTool = kind === 'structured_tool_required' || kind === 'structured_tool_auto';
      if (laterTool && toolOk) continue;
      let run = await runProbe(adapter, conn, prof, kind, counted);
      if (
        !run.outcome.ok &&
        run.outcome.unsupportedParam === 'max_tokens' &&
        conn.kind === 'openai_compat' &&
        !outcomes.some((o) => o.kind === 'max_completion_tokens')
      ) {
        const mct = await runProbe(adapter, conn, prof, 'max_completion_tokens', counted);
        outcomes.push(mct.outcome);
        if (mct.outcome.ok) {
          prof = withCapability(prof, { maxTokensParam: 'max_completion_tokens' });
          run = await runProbe(adapter, conn, prof, kind, counted);
        }
      }
      outcomes.push(run.outcome);
      if (kind.startsWith('structured_tool_') && run.outcome.ok) toolOk = true;
      if (run.outcome.ok && latencyMs === undefined) {
        latencyMs = run.outcome.latencyMs;
        firstByteMs = run.outcome.firstByteMs;
      }
    }
    const structured = outcomes.filter((o) => o.kind.startsWith('structured_'));
    const okChannels = structured.filter((o) => o.ok).map((o) => o.kind.replace('structured_', ''));
    // A passing failure (rate limit, overload, timeout) leaves a channel untested: the check
    // fails with that problem so the player tests again; the capability keeps what was decided.
    const transient = structured.find((o) => o.transient)?.problem;
    const failed = transient ?? structured.find((o) => !o.ok && o.problem)?.problem;
    push({
      id: 'structured',
      model: prof.model,
      verdict: okChannels.length > 0 && !transient ? 'pass' : 'fail',
      ...((okChannels.length === 0 || transient) && failed ? { problem: failed } : {}),
      detail: { channels: okChannels.join(',') },
      ...(latencyMs !== undefined ? { latencyMs } : {}),
    });

    // capability so far (the stream and parameter probes run on the best channel)
    let cap = known
      ? prof.capability
      : capabilityFromProbes(prof.capability, outcomes, input.testedAt);
    prof = { ...prof, capability: cap };

    // 6 stream
    if (known) {
      push({
        id: 'stream',
        model: prof.model,
        verdict: cap.streaming === 'yes' ? 'pass' : 'unsupported',
        detail: { source: 'known_table' },
      });
    } else if (okChannels.length > 0) {
      const st = await runProbe(adapter, conn, prof, 'stream', counted);
      outcomes.push(st.outcome);
      push({
        id: 'stream',
        model: prof.model,
        verdict: st.outcome.ok ? 'pass' : 'unsupported',
        detail: { usage: st.outcome.streamUsage === true },
        ...(st.outcome.firstByteMs !== undefined ? { latencyMs: st.outcome.firstByteMs } : {}),
      });
    } else push({ id: 'stream', model: prof.model, verdict: 'skipped' });

    // 7 params
    if (conn.kind === 'openai_compat' && !known && okChannels.length > 0) {
      for (const kind of ['reasoning_effort', 'sampling'] as const) {
        const run = await runProbe(adapter, conn, prof, kind, counted);
        outcomes.push(run.outcome);
      }
    }
    if (!known) cap = capabilityFromProbes(start.capability, outcomes, input.testedAt);
    if (!known && prof.capability.maxTokensParam === 'max_completion_tokens') {
      cap = { ...cap, maxTokensParam: 'max_completion_tokens' };
    }
    if (!known)
      cap = {
        ...cap,
        contextTokens: prof.capability.contextTokens,
        contextSource: prof.capability.contextSource,
      };
    push({
      id: 'params',
      model: prof.model,
      verdict: 'pass',
      detail: {
        maxTokensParam: cap.maxTokensParam,
        reasoningEffort: cap.thinking === 'reasoning_effort' || cap.effort,
        sampling: cap.samplingParams,
      },
    });

    // 8 context
    const low = lowContextRoles(cap);
    push({
      id: 'context',
      model: prof.model,
      verdict: 'pass',
      detail: { tokens: cap.contextTokens, source: cap.contextSource, lowRoles: low.join(',') },
    });
    const row: ModelTestRow = { model: prof.model, capability: cap, lowContextRoles: low };
    if (firstByteMs !== undefined) row.firstByteMs = firstByteMs;
    if (latencyMs !== undefined) row.latencyMs = latencyMs;
    rows.push(row);
  }
  if (usable.length === 0) skip('structured', ...rest);
  return report(rows);
}
