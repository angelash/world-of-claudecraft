// The request golden matrix: one case per adapter and output channel, plus streaming and
// tuned-parameter variants. Golden files live in tests/fixtures/llm_golden/<name>.json; set
// HK_WRITE_LLM_GOLDEN=1 to rewrite them after a deliberate adapter change (then review the
// diff line by line).

import type { LlmCallSpec } from '../../../src/ai/contracts';
import type { ConnectionPublic, ModelProfile, ProviderKind } from '../../../src/ai/providers/types';
import {
  COMPAT_JSON,
  COMPAT_PROMPT,
  COMPAT_SCHEMA,
  COMPAT_TOOL,
  COMPAT_TOOL_REQUIRED,
  COMPAT_TUNED,
  conn,
  HAIKU,
  LLAMACPP_JSON,
  LMSTUDIO,
  OLLAMA,
  OLLAMA_JSON,
  OLLAMA_PROMPT,
  OPUS,
  OPUS_PROMPT,
  OPUS_TOOL,
  spec,
} from './specs';

export interface GoldenCase {
  name: string;
  kind: ProviderKind;
  conn: ConnectionPublic;
  prof: ModelProfile;
  spec: LlmCallSpec;
}

const compat = (extra: Partial<LlmCallSpec> = {}) =>
  spec({ provider: 'openai_compat', model: 'example-chat', ...extra });
const ollama = (extra: Partial<LlmCallSpec> = {}) =>
  spec({ provider: 'local', model: 'qwen3:14b', ...extra });

export const GOLDEN_CASES: readonly GoldenCase[] = [
  {
    name: 'anthropic_json_schema',
    kind: 'anthropic',
    conn: conn('anthropic'),
    prof: OPUS,
    spec: spec(),
  },
  {
    name: 'anthropic_tool_carrier',
    kind: 'anthropic',
    conn: conn('anthropic'),
    prof: OPUS_TOOL,
    spec: spec(),
  },
  {
    name: 'anthropic_prompt_only',
    kind: 'anthropic',
    conn: conn('anthropic'),
    prof: OPUS_PROMPT,
    spec: spec(),
  },
  {
    name: 'anthropic_haiku_stream',
    kind: 'anthropic',
    conn: conn('anthropic'),
    prof: HAIKU,
    spec: spec({ model: 'claude-haiku-5-5', stream: true, effort: 'low' }),
  },
  {
    name: 'openai_compat_json_schema',
    kind: 'openai_compat',
    conn: conn('openai_compat'),
    prof: COMPAT_SCHEMA,
    spec: compat(),
  },
  {
    name: 'openai_compat_tool_carrier',
    kind: 'openai_compat',
    conn: conn('openai_compat'),
    prof: COMPAT_TOOL,
    spec: compat(),
  },
  {
    name: 'openai_compat_tool_required',
    kind: 'openai_compat',
    conn: conn('openai_compat'),
    prof: COMPAT_TOOL_REQUIRED,
    spec: compat(),
  },
  {
    name: 'openai_compat_json_mode',
    kind: 'openai_compat',
    conn: conn('openai_compat'),
    prof: COMPAT_JSON,
    spec: compat(),
  },
  {
    name: 'openai_compat_prompt_only',
    kind: 'openai_compat',
    conn: conn('openai_compat'),
    prof: COMPAT_PROMPT,
    spec: compat(),
  },
  {
    name: 'openai_compat_tuned_stream',
    kind: 'openai_compat',
    conn: conn('openai_compat'),
    prof: COMPAT_TUNED,
    spec: compat({ stream: true }),
  },
  {
    name: 'local_ollama_json_schema',
    kind: 'local',
    conn: conn('local', {}, 'ollama'),
    prof: OLLAMA,
    spec: ollama(),
  },
  {
    name: 'local_ollama_json_mode',
    kind: 'local',
    conn: conn('local', {}, 'ollama'),
    prof: OLLAMA_JSON,
    spec: ollama(),
  },
  {
    name: 'local_ollama_prompt_only',
    kind: 'local',
    conn: conn('local', {}, 'ollama'),
    prof: OLLAMA_PROMPT,
    spec: ollama(),
  },
  {
    name: 'local_ollama_stream',
    kind: 'local',
    conn: conn('local', {}, 'ollama'),
    prof: OLLAMA,
    spec: ollama({ stream: true, bindingRole: 'goddess' }),
  },
  {
    name: 'local_lmstudio_json_schema',
    kind: 'local',
    conn: conn('local', {}, 'lmstudio'),
    prof: LMSTUDIO,
    spec: spec({ provider: 'local', model: 'qwen2.5-7b-instruct' }),
  },
  {
    name: 'local_llamacpp_json_mode',
    kind: 'local',
    conn: conn('local', {}, 'llamacpp'),
    prof: LLAMACPP_JSON,
    spec: spec({ provider: 'local', model: 'local-model', bindingRole: 'present_npc' }),
  },
];
