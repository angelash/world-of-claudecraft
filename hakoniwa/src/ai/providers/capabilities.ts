// Capability records (docs/50_tech/llm_providers.md 3.5, 3.7, 4.5, 4.6): the known model
// table (data/llm/known_models.json), generic records per provider kind, the probe profile
// and probe spec of the connection test, the reading of probe outcomes into a capability,
// the runtime channel downgrade after repeated unsupported_output, feature summaries and
// the static role label ceiling. Pure: capabilities are decided when a connection is saved
// or tested, never by trial at run time.

import known from '../../../data/llm/known_models.json';
import type {
  BindingRole,
  JsonSchema,
  LlmCallSpec,
  OutputChannel,
  ProblemCode,
  Slot,
} from '../contracts';
import { BINDING_ROLES, OUTPUT_CHANNELS } from '../contracts';
import { priceCardOf } from '../pricing';
import type {
  Capability,
  ConnectionPublic,
  LocalFlavor,
  ModelProfile,
  ProbeKind,
  ProviderKind,
  SizeClass,
  SuitLabel,
} from './types';

// --- known table ------------------------------------------------------------------------

type RawCapability = Omit<Capability, 'contextSource' | 'source' | 'probedAt'>;

interface RawKnownModel {
  displayName: string;
  tier: Slot;
  capability: RawCapability;
  labels: Partial<Record<BindingRole, SuitLabel>>;
}

export interface RoleRequirement {
  minContext: number;
  minSizeClass: SizeClass;
  minChannel: OutputChannel;
  cloudAdvised: boolean;
}

interface KnownFile {
  roleRequirements: Record<BindingRole, RoleRequirement>;
  anthropic: {
    defaultBaseUrl: string;
    defaults: RawCapability;
    models: Record<string, RawKnownModel>;
  };
  openai_compat: {
    defaults: RawCapability;
    tiers: Record<Slot, { minContext: number; minChannel: OutputChannel }>;
  };
  local: {
    defaultBaseUrls: Record<LocalFlavor, string>;
    helpUrls: Partial<Record<LocalFlavor, string>>;
    defaults: Record<LocalFlavor, RawCapability>;
    tiers: Record<Slot, { minContext: number; minSizeClass: SizeClass }>;
  };
}

const KNOWN = known as unknown as KnownFile;

export interface KnownModel {
  kind: ProviderKind;
  model: string;
  displayName: string;
  tier: Slot;
  labels: Partial<Record<BindingRole, SuitLabel>>;
  capability: Capability;
}

/** Minimum context, parameter class and channel per binding role (llm_providers.md 4.5). */
export const ROLE_REQUIREMENTS: Readonly<Record<BindingRole, RoleRequirement>> =
  KNOWN.roleRequirements;

/** Generic recommendations per slot for compatible and local services (4.5). */
export const COMPAT_TIERS = KNOWN.openai_compat.tiers;
export const LOCAL_TIERS = KNOWN.local.tiers;
export const LOCAL_HELP_URLS: Readonly<Partial<Record<LocalFlavor, string>>> = KNOWN.local.helpUrls;

function copyCap(raw: RawCapability, contextSource: Capability['contextSource']): Capability {
  return {
    ...raw,
    channels: [...raw.channels],
    dialect: { ...raw.dialect },
    contextSource,
    source: contextSource === 'known_table' ? 'known_table' : 'default',
  };
}

/** A model in the known table (Anthropic only: compatible and local rows are generic). */
export function knownModel(kind: ProviderKind, model: string): KnownModel | undefined {
  if (kind !== 'anthropic') return undefined;
  const raw = KNOWN.anthropic.models[model];
  if (!raw) return undefined;
  return {
    kind,
    model,
    displayName: raw.displayName,
    tier: raw.tier,
    labels: { ...raw.labels },
    capability: copyCap(raw.capability, 'known_table'),
  };
}

/** Known model ids of a kind, in table order. */
export function knownModelIds(kind: ProviderKind): string[] {
  return kind === 'anthropic' ? Object.keys(KNOWN.anthropic.models) : [];
}

/** The unprobed generic capability of a provider kind (and local flavor). */
export function defaultCapability(kind: ProviderKind, flavor: LocalFlavor = 'generic'): Capability {
  if (kind === 'anthropic') return copyCap(KNOWN.anthropic.defaults, 'default');
  if (kind === 'openai_compat') return copyCap(KNOWN.openai_compat.defaults, 'default');
  if (kind === 'local') return copyCap(KNOWN.local.defaults[flavor], 'default');
  return {
    ...copyCap(KNOWN.openai_compat.defaults, 'default'),
    channels: [],
    streaming: 'no',
    contextTokens: 0,
    maxOutputTokens: 0,
  };
}

/** The known record of a model, or the generic record of its kind. */
export function capabilityFor(kind: ProviderKind, model: string, flavor?: LocalFlavor): Capability {
  return knownModel(kind, model)?.capability ?? defaultCapability(kind, flavor);
}

/** Default service address per kind and local flavor (llm_providers.md 3.2, 3.4). */
export function defaultBaseUrl(kind: ProviderKind, flavor: LocalFlavor = 'generic'): string {
  if (kind === 'anthropic') return KNOWN.anthropic.defaultBaseUrl;
  if (kind === 'local') return KNOWN.local.defaultBaseUrls[flavor];
  return '';
}

/** A model profile from the known table (or generic record) plus the price book. */
export function profileFor(
  kind: ProviderKind,
  model: string,
  flavor?: LocalFlavor,
  extra: Partial<ModelProfile> = {},
): ModelProfile {
  const k = knownModel(kind, model);
  const prof: ModelProfile = {
    model,
    capability: k?.capability ?? defaultCapability(kind, flavor),
  };
  if (k) {
    prof.displayName = k.displayName;
    prof.labels = k.labels;
  }
  if (kind === 'anthropic') prof.sizeClass = 'cloud';
  const price = priceCardOf(kind, model);
  if (price) prof.price = price;
  return { ...prof, ...extra };
}

// --- features ---------------------------------------------------------------------------

export interface CapabilityFeatures {
  /** The tool carrier is usable (a forced or required submit call). */
  toolCalls: boolean;
  /** Strongest structured output the model gives: schema enforced, JSON only, or prompt. */
  structuredOutput: 'schema' | 'json' | 'prompt' | 'none';
  streaming: boolean;
  promptCache: boolean;
  /** Thinking blocks come back and must be returned within the segment (Anthropic). */
  thinkingBlocks: boolean;
  effort: boolean;
}

/** The runtime channel: the first usable one (llm_providers.md 3.5). */
export function runtimeChannel(cap: Capability): OutputChannel | undefined {
  return cap.channels[0];
}

export function featuresOf(cap: Capability): CapabilityFeatures {
  const ch = runtimeChannel(cap);
  return {
    toolCalls: cap.channels.includes('tool_carrier'),
    structuredOutput:
      ch === 'json_schema' || ch === 'tool_carrier'
        ? 'schema'
        : ch === 'json_mode'
          ? 'json'
          : ch === 'prompt_only'
            ? 'prompt'
            : 'none',
    streaming: cap.streaming === 'yes',
    promptCache: cap.promptCache !== 'none',
    thinkingBlocks: cap.thinking === 'adaptive',
    effort: cap.effort,
  };
}

export function channelRank(ch: OutputChannel): number {
  return OUTPUT_CHANNELS.indexOf(ch);
}

/** A copy of a profile whose capability is changed by `patch`. */
export function withCapability(prof: ModelProfile, patch: Partial<Capability>): ModelProfile {
  return { ...prof, capability: { ...prof.capability, ...patch } };
}

// --- probes -----------------------------------------------------------------------------

/** The two-field object every structured probe asks for (llm_providers.md 5.6). */
export const PROBE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: '固定写 true' },
    word: { type: 'string', description: '一个汉字' },
  },
  required: ['ok', 'word'],
  additionalProperties: false,
};

export const PROBE_MAX_TOKENS = 64;
export const PROBE_TIMEOUT_MS = 15_000;

/** The probe spec: tiny, fixed text, no game content. */
export function probeSpec(
  conn: ConnectionPublic,
  prof: ModelProfile,
  kind: ProbeKind,
): LlmCallSpec {
  return {
    requestId: `probe_${kind}`,
    provider: conn.kind,
    connectionId: conn.id,
    slot: 'low',
    bindingRole: 'present_npc',
    model: prof.model,
    segments: [
      { role: 'rules', text: '这是一次连接测试。只按要求输出一个 JSON 对象。' },
      { role: 'turn', text: '请输出 ok 为 true，word 为“好”。' },
    ],
    output: {
      schemaId: 'probe',
      schemaVersion: '1',
      schema: PROBE_SCHEMA,
      maxTokens: PROBE_MAX_TOKENS,
    },
    effort: 'low',
    stream: kind === 'stream',
    timeoutMs: PROBE_TIMEOUT_MS,
    reserve: { usd: 0, tokens: 0 },
    purpose: `probe/${kind}`,
  };
}

/** The profile a probe is built with: it forces exactly the feature under test. */
export function probeProfile(kind: ProbeKind, prof: ModelProfile): ModelProfile {
  const cap = prof.capability;
  switch (kind) {
    case 'structured_json_schema':
      return withCapability(prof, { channels: ['json_schema'] });
    case 'structured_tool_named':
      return withCapability(prof, {
        channels: ['tool_carrier'],
        toolChoice: 'named',
        forcedTool: true,
      });
    case 'structured_tool_required':
      return withCapability(prof, { channels: ['tool_carrier'], toolChoice: 'required' });
    case 'structured_tool_auto':
      return withCapability(prof, { channels: ['tool_carrier'], toolChoice: 'auto' });
    case 'structured_json_mode':
      return withCapability(prof, { channels: ['json_mode'] });
    case 'structured_prompt_only':
      return withCapability(prof, { channels: ['prompt_only'] });
    case 'stream':
      return withCapability(prof, { streaming: 'yes' });
    case 'max_completion_tokens':
      return withCapability(prof, { maxTokensParam: 'max_completion_tokens' });
    case 'reasoning_effort':
      return withCapability(prof, { thinking: 'reasoning_effort', effort: true });
    case 'sampling':
      return {
        ...withCapability(prof, { samplingParams: true }),
        temperature: prof.temperature ?? 0.6,
      };
    default:
      return { ...prof, capability: { ...cap } };
  }
}

/** Whether a parsed probe answer is the requested two-field object. */
export function probeAnswerOk(json: unknown): boolean {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return false;
  const o = json as Record<string, unknown>;
  return o.ok === true && typeof o.word === 'string';
}

/** What one probe showed. */
export interface ProbeOutcome {
  kind: ProbeKind;
  ok: boolean;
  problem?: ProblemCode;
  unsupportedParam?: string;
  /** Stream probe: the stream ended with usage. */
  streamUsage?: boolean;
  /**
   * The probe failed for a passing reason (rate limit, overload, server error, timeout,
   * network, model still loading): it says nothing about support and is ignored here.
   */
  transient?: boolean;
  firstByteMs?: number;
  latencyMs?: number;
}

const STRUCTURED: Partial<Record<ProbeKind, OutputChannel>> = {
  structured_json_schema: 'json_schema',
  structured_tool_named: 'tool_carrier',
  structured_tool_required: 'tool_carrier',
  structured_tool_auto: 'tool_carrier',
  structured_json_mode: 'json_mode',
  structured_prompt_only: 'prompt_only',
};

/**
 * Read probe outcomes into a capability record (llm_providers.md 3.7): every channel that
 * answered goes in, in channel order, with prompt_only last as the floor; the tool carrier
 * records whether the named or the required tool choice worked; the stream probe sets
 * streaming and stream usage; parameter probes set the output cap name, reasoning effort
 * and sampling. Kinds that were not probed keep the base value.
 */
export function capabilityFromProbes(
  base: Capability,
  outcomes: readonly ProbeOutcome[],
  probedAt: string,
): Capability {
  const cap: Capability = { ...base, channels: [...base.channels], dialect: { ...base.dialect } };
  const by = new Map<ProbeKind, ProbeOutcome>();
  const decisive = outcomes.filter((o) => !o.transient);
  for (const o of decisive) by.set(o.kind, o);
  const structured = decisive.filter((o) => STRUCTURED[o.kind] !== undefined);
  if (structured.length > 0) {
    const ok = new Set(structured.filter((o) => o.ok).map((o) => STRUCTURED[o.kind]));
    const channels = OUTPUT_CHANNELS.filter((c) => c !== 'prompt_only' && ok.has(c));
    cap.channels = [...channels, 'prompt_only'];
    const named = by.get('structured_tool_named');
    const required = by.get('structured_tool_required');
    const auto = by.get('structured_tool_auto');
    if (named?.ok) {
      cap.toolChoice = 'named';
      cap.forcedTool = true;
    } else if (required?.ok) {
      cap.toolChoice = 'required';
      cap.forcedTool = true;
    } else if (auto?.ok) {
      cap.toolChoice = 'auto';
      cap.forcedTool = false;
    } else if (named || required || auto) cap.forcedTool = false;
  }
  const stream = by.get('stream');
  if (stream) {
    cap.streaming = stream.ok ? 'yes' : 'no';
    cap.streamUsage = stream.ok && stream.streamUsage ? 'yes' : 'no';
  }
  const mct = by.get('max_completion_tokens');
  if (mct?.ok) cap.maxTokensParam = 'max_completion_tokens';
  const effort = by.get('reasoning_effort');
  if (effort) {
    if (effort.ok) {
      cap.thinking = 'reasoning_effort';
      cap.effort = true;
    } else {
      cap.effort = false;
      if (cap.thinking === 'reasoning_effort') cap.thinking = 'none';
    }
  }
  const sampling = by.get('sampling');
  if (sampling) cap.samplingParams = sampling.ok;
  cap.source = 'probe';
  cap.probedAt = probedAt;
  return cap;
}

// --- runtime channel downgrade --------------------------------------------------------------

/** Consecutive "parameter not supported" failures on the runtime channel before a downgrade. */
export const UNSUPPORTED_OUTPUT_LIMIT = 3;

/**
 * Track run-time output failures of one model (llm_providers.md 3.5): the third consecutive
 * unsupported failure moves the capability down one channel and raises unsupported_output;
 * the last channel is never dropped.
 */
export function noteChannelResult(
  cap: Capability,
  run: number,
  unsupported: boolean,
): { capability: Capability; run: number; problem?: 'unsupported_output' } {
  if (!unsupported) return { capability: cap, run: 0 };
  const next = run + 1;
  if (next < UNSUPPORTED_OUTPUT_LIMIT) return { capability: cap, run: next };
  const channels = cap.channels.length > 1 ? cap.channels.slice(1) : [...cap.channels];
  return { capability: { ...cap, channels }, run: 0, problem: 'unsupported_output' };
}

// --- role fit (static part of llm_providers.md 4.6) ---------------------------------------------

const SIZE_RANK: Record<SizeClass, number> = {
  small: 0,
  '7b': 1,
  '14b': 2,
  '30b': 3,
  cloud: 4,
  unknown: -1,
};

/** Parameter class from a parameter count in billions. */
export function sizeClassOf(billions: number | undefined): SizeClass {
  if (billions === undefined || !Number.isFinite(billions) || billions <= 0) return 'unknown';
  if (billions >= 25) return '30b';
  if (billions >= 12) return '14b';
  if (billions >= 6) return '7b';
  return 'small';
}

/** Parse sizes such as "14.8B", "7B", "600M". */
export function parseParamSize(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const m = /([\d.]+)\s*([BbMm])/.exec(text);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  return m[2]?.toLowerCase() === 'm' ? n / 1000 : n;
}

/** Roles whose minimum context this capability does not reach. */
export function lowContextRoles(cap: Capability): BindingRole[] {
  return BINDING_ROLES.filter((r) => cap.contextTokens < ROLE_REQUIREMENTS[r].minContext);
}

export type FitReason =
  | 'known_table'
  | 'context_short'
  | 'channel_weak'
  | 'size_small'
  | 'cloud_advised'
  | 'prompt_only_ceiling'
  | 'needs_quiz';

const LABEL_RANK: Record<SuitLabel, number> = { ok: 2, marginal: 1, not_recommended: 0 };

/**
 * The label a model can get for a role before the fit quiz (llm_providers.md 4.5, 4.6):
 * the known table decides known models; otherwise a short context or a local model below
 * the role's parameter class is not recommended; a channel below the role's minimum, a
 * prompt-only channel or a local model on a role that advises the cloud is at most
 * marginal (one unmet item, 4.6); anything else waits for the quiz (null).
 */
export function staticRoleLabel(
  kind: ProviderKind,
  prof: ModelProfile,
  role: BindingRole,
): { label: SuitLabel | null; reasons: FitReason[] } {
  const known = prof.labels?.[role];
  if (known) return { label: known, reasons: ['known_table'] };
  const req = ROLE_REQUIREMENTS[role];
  const cap = prof.capability;
  const reasons: FitReason[] = [];
  let label: SuitLabel | null = null;
  const lower = (l: SuitLabel, r: FitReason) => {
    reasons.push(r);
    if (label === null || LABEL_RANK[l] < LABEL_RANK[label]) label = l;
  };
  if (cap.contextTokens < req.minContext) lower('not_recommended', 'context_short');
  const ch = runtimeChannel(cap);
  if (!ch || channelRank(ch) > channelRank(req.minChannel)) lower('marginal', 'channel_weak');
  const size = prof.sizeClass ?? 'unknown';
  if (kind === 'local' && size !== 'unknown' && SIZE_RANK[size] < SIZE_RANK[req.minSizeClass]) {
    lower('not_recommended', 'size_small');
  }
  if (kind === 'local' && req.cloudAdvised) lower('marginal', 'cloud_advised');
  if (ch === 'prompt_only') lower('marginal', 'prompt_only_ceiling');
  if (label === null) reasons.push('needs_quiz');
  return { label, reasons };
}
