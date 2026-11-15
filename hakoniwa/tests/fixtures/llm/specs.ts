// Shared fixtures of the LLM adapter tests: neutral call specs, connections and model
// profiles. Fixed text, no game canon, no key-shaped strings.

import type { JsonSchema, LlmCallSpec } from '../../../src/ai/contracts';
import { profileFor, withCapability } from '../../../src/ai/providers/capabilities';
import type {
  ConnectionPublic,
  LocalFlavor,
  ModelProfile,
  ProviderKind,
} from '../../../src/ai/providers/types';

/** A schema richer than the role packs: optional fields, oneOf, string and array bounds. */
export const FIXTURE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    commands: {
      type: 'array',
      description: '本次提出的命令',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['npc.say', 'npc.move'], description: '命令种类' },
          data: { type: 'string', description: '命令数据' },
        },
        required: ['kind', 'data'],
        additionalProperties: false,
      },
    },
    speech: { type: 'string', maxLength: 20, description: '说出口的话' },
    mood: { oneOf: [{ type: 'string', enum: ['calm', 'tense'] }, { type: 'null' }] },
    note: { type: 'string', pattern: '^[a-z]+$' },
  },
  required: ['commands', 'speech'],
  additionalProperties: false,
};

export function spec(extra: Partial<LlmCallSpec> = {}): LlmCallSpec {
  return {
    requestId: 'ai42#1',
    provider: 'anthropic',
    connectionId: 'conn_test0001',
    slot: 'mid',
    bindingRole: 'core_npc',
    model: 'claude-opus-5-5',
    segments: [
      { role: 'rules', text: '规则段：只按菜单行动。', cache: 'long' },
      { role: 'persona', text: '人设段：你是旅店老板。', cache: 'long' },
      { role: 'private', text: '私密段：你记得昨天的客人。', cache: 'short' },
      { role: 'history_user', text: '上一轮：客人进门。' },
      {
        role: 'history_assistant',
        text: '{"commands":[],"speech":"欢迎。"}',
        opaque: {
          provider: 'anthropic',
          model: 'claude-opus-5-5',
          blocks: [{ type: 'thinking', thinking: '', signature: 'c2lnbmF0dXJlLWZpeHR1cmU=' }],
        },
      },
      { role: 'player_data', text: '玩家原话：有空房吗？' },
      { role: 'turn', text: '本轮：回答客人。' },
      { role: 'operator', text: '内核通知：天色已晚。' },
    ],
    output: {
      schemaId: 'npc.dialogue',
      schemaVersion: '3',
      schema: FIXTURE_SCHEMA,
      maxTokens: 1000,
    },
    effort: 'high',
    timeoutMs: 10_000,
    reserve: { usd: 0.02, tokens: 3000 },
    purpose: 'npc.dialogue/turn',
    ...extra,
  };
}

/** The legacy-shaped spec: rules, persona and a turn only. */
export function simpleSpec(extra: Partial<LlmCallSpec> = {}): LlmCallSpec {
  return spec({
    segments: [
      { role: 'rules', text: '规则', cache: 'short' },
      { role: 'persona', text: '人设', cache: 'short' },
      { role: 'turn', text: '本轮' },
    ],
    effort: 'low',
    ...extra,
  });
}

export function conn(
  kind: ProviderKind,
  extra: Partial<ConnectionPublic> = {},
  flavor?: LocalFlavor,
): ConnectionPublic {
  const base: Record<ProviderKind, string> = {
    none: '',
    anthropic: 'https://api.anthropic.com',
    openai_compat: 'https://api.example-llm.com/v1',
    local:
      flavor === 'ollama'
        ? 'http://127.0.0.1:11434'
        : flavor === 'lmstudio'
          ? 'http://127.0.0.1:1234/v1'
          : 'http://127.0.0.1:8080/v1',
  };
  const out: ConnectionPublic = {
    id: 'conn_test0001',
    kind,
    name: kind,
    baseUrl: base[kind],
    auth: { scheme: kind === 'anthropic' ? 'x_api_key' : kind === 'local' ? 'none' : 'bearer' },
    keyState: kind === 'local' ? 'none' : 'saved',
    extraHeaderNames: [],
    currency: 'USD',
    maxInFlight: kind === 'local' ? 2 : 8,
    models: [],
    ...extra,
  };
  if (flavor) out.flavor = flavor;
  if (kind === 'anthropic' && out.serverFallback === undefined) out.serverFallback = true;
  return out;
}

export const OPUS = profileFor('anthropic', 'claude-opus-5-5');
export const HAIKU = profileFor('anthropic', 'claude-haiku-5-5');
export const OPUS_TOOL = withCapability(OPUS, {
  channels: ['tool_carrier', 'prompt_only'],
  forcedTool: true,
  toolChoice: 'named',
});
export const OPUS_PROMPT = withCapability(OPUS, { channels: ['prompt_only'] });

const COMPAT_BASE = profileFor('openai_compat', 'example-chat');
export const COMPAT_SCHEMA = withCapability(COMPAT_BASE, {
  channels: ['json_schema', 'tool_carrier', 'json_mode', 'prompt_only'],
});
export const COMPAT_TOOL = withCapability(COMPAT_BASE, {
  channels: ['tool_carrier', 'json_mode', 'prompt_only'],
  toolChoice: 'named',
});
export const COMPAT_TOOL_REQUIRED = withCapability(COMPAT_TOOL, { toolChoice: 'required' });
export const COMPAT_JSON = withCapability(COMPAT_BASE, { channels: ['json_mode', 'prompt_only'] });
export const COMPAT_PROMPT = COMPAT_BASE;
export const COMPAT_TUNED: ModelProfile = {
  ...withCapability(COMPAT_BASE, {
    channels: ['json_schema', 'prompt_only'],
    maxTokensParam: 'max_completion_tokens',
    thinking: 'reasoning_effort',
    effort: true,
  }),
  temperature: 0.3,
};

export const OLLAMA = profileFor('local', 'qwen3:14b', 'ollama');
export const OLLAMA_JSON = withCapability(OLLAMA, { channels: ['json_mode', 'prompt_only'] });
export const OLLAMA_PROMPT = withCapability(OLLAMA, { channels: ['prompt_only'] });
export const LMSTUDIO = profileFor('local', 'qwen2.5-7b-instruct', 'lmstudio');
export const LLAMACPP_JSON = withCapability(profileFor('local', 'local-model', 'llamacpp'), {
  channels: ['json_mode', 'prompt_only'],
});
