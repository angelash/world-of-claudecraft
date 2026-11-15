// The local mock model service (release_engineering.md 10.8; llm_providers.md 16.1) as a
// pure request handler: it speaks the Anthropic Messages API (POST /v1/messages) and the
// OpenAI compatible chat API (POST /v1/chat/completions), both with and without streaming
// (server-sent events), plus GET /v1/models, checks the key when told to, and can be made
// to fail the next calls with a given status and body. A Node wrapper turns it into a real
// loopback server for end-to-end runs (tests/fixtures/llm_mock/server.ts). Answers are
// scripted by a function of the request; the default answers with no commands.

export interface MockServiceRequest {
  method: string;
  /** Path with query, for example '/v1/messages'. */
  path: string;
  /** Lower-case header names. */
  headers: Readonly<Record<string, string>>;
  body: string;
}

export interface MockServiceResponse {
  status: number;
  headers: Record<string, string>;
  /** The body in pieces: one piece for JSON, one event per piece for streams. */
  chunks: string[];
}

export interface MockAnswerInput {
  protocol: 'anthropic' | 'openai';
  model: string;
  /** System text joined. */
  system: string;
  /** Last user message text. */
  user: string;
}

export interface MockFailure {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface MockServiceOptions {
  /** The JSON answer for a request (default { commands: [] }). */
  answer?: (req: MockAnswerInput) => unknown;
  /** Fail the next calls in order. */
  failures?: MockFailure[];
  /** Required key: x-api-key or a bearer token. */
  requireKey?: string;
  /** Models GET /v1/models lists (default one per protocol). */
  models?: string[];
  /** Characters per streamed text piece. Default 16. */
  pieceChars?: number;
}

export interface MockService {
  handle(req: MockServiceRequest): MockServiceResponse;
  readonly calls: MockServiceRequest[];
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    headers: { 'content-type': 'application/json', ...headers },
    chunks: [JSON.stringify(body)],
  };
}

function sse(events: { event?: string; data: unknown }[]): MockServiceResponse {
  return {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
    chunks: [
      ...events.map(
        (e) =>
          `${e.event ? `event: ${e.event}\n` : ''}data: ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}\n\n`,
      ),
    ],
  };
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((b) => (isObj(b) && typeof b.text === 'string' ? b.text : '')).join('');
  }
  return '';
}

function pieces(text: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += n) out.push(text.slice(i, i + n));
  return out.length > 0 ? out : [''];
}

/** A rough token count for usage fields. */
function tokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3));
}

export function createMockService(opts: MockServiceOptions = {}): MockService {
  const calls: MockServiceRequest[] = [];
  const failures = [...(opts.failures ?? [])];
  const answer = opts.answer ?? (() => ({ commands: [] }));
  const n = Math.max(1, opts.pieceChars ?? 16);
  let seq = 0;

  const keyOk = (h: Readonly<Record<string, string>>): boolean => {
    if (opts.requireKey === undefined) return true;
    const bearer = /^Bearer\s+(.+)$/i.exec(h.authorization ?? '')?.[1];
    return h['x-api-key'] === opts.requireKey || bearer === opts.requireKey;
  };

  const anthropic = (body: Record<string, unknown>): MockServiceResponse => {
    const model = typeof body.model === 'string' ? body.model : 'mock';
    const system = Array.isArray(body.system)
      ? textOf(body.system)
      : typeof body.system === 'string'
        ? body.system
        : '';
    const msgs = Array.isArray(body.messages) ? body.messages : [];
    const last = msgs.filter((m) => isObj(m) && m.role === 'user').pop();
    const user = isObj(last) ? textOf(last.content) : '';
    const out = answer({ protocol: 'anthropic', model, system, user });
    const tool =
      Array.isArray(body.tools) && body.tools.length > 0 && isObj(body.tools[0])
        ? String(body.tools[0].name)
        : undefined;
    const text = JSON.stringify(out);
    const usage = {
      input_tokens: tokens(system + user),
      output_tokens: tokens(text),
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    };
    const id = `msg_mock_${++seq}`;
    const stop = tool ? 'tool_use' : 'end_turn';
    if (body.stream !== true) {
      const content = tool
        ? [{ type: 'tool_use', id: `toolu_${seq}`, name: tool, input: out }]
        : [{ type: 'text', text }];
      return json(
        200,
        { id, type: 'message', role: 'assistant', model, content, stop_reason: stop, usage },
        { 'request-id': `req_mock_${seq}` },
      );
    }
    const block = tool
      ? { type: 'tool_use', id: `toolu_${seq}`, name: tool, input: {} }
      : { type: 'text', text: '' };
    const deltas = pieces(text, n).map((p) => ({
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: 0,
        delta: tool
          ? { type: 'input_json_delta', partial_json: p }
          : { type: 'text_delta', text: p },
      },
    }));
    return sse([
      {
        event: 'message_start',
        data: {
          type: 'message_start',
          message: {
            id,
            type: 'message',
            role: 'assistant',
            model,
            content: [],
            usage: { ...usage, output_tokens: 1 },
          },
        },
      },
      {
        event: 'content_block_start',
        data: { type: 'content_block_start', index: 0, content_block: block },
      },
      ...deltas,
      { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
      {
        event: 'message_delta',
        data: {
          type: 'message_delta',
          delta: { stop_reason: stop },
          usage: { output_tokens: usage.output_tokens },
        },
      },
      { event: 'message_stop', data: { type: 'message_stop' } },
    ]);
  };

  const openai = (body: Record<string, unknown>): MockServiceResponse => {
    const model = typeof body.model === 'string' ? body.model : 'mock';
    const msgs = (Array.isArray(body.messages) ? body.messages : []).filter(isObj);
    const system = msgs
      .filter((m) => m.role === 'system')
      .map((m) => textOf(m.content))
      .join('\n');
    const last = msgs.filter((m) => m.role === 'user').pop();
    const user = last ? textOf(last.content) : '';
    const out = answer({ protocol: 'openai', model, system, user });
    const text = JSON.stringify(out);
    const fn =
      Array.isArray(body.tools) && isObj(body.tools[0]) && isObj(body.tools[0].function)
        ? String(body.tools[0].function.name)
        : undefined;
    const usage = { prompt_tokens: tokens(system + user), completion_tokens: tokens(text) };
    const id = `chatcmpl_mock_${++seq}`;
    const finish = fn ? 'tool_calls' : 'stop';
    if (body.stream !== true) {
      const message = fn
        ? {
            role: 'assistant',
            content: null,
            tool_calls: [
              { id: `call_${seq}`, type: 'function', function: { name: fn, arguments: text } },
            ],
          }
        : { role: 'assistant', content: text };
      return json(200, {
        id,
        object: 'chat.completion',
        model,
        choices: [{ index: 0, message, finish_reason: finish }],
        usage,
      });
    }
    const chunk = (delta: unknown, finishReason: string | null) => ({
      data: {
        id,
        object: 'chat.completion.chunk',
        model,
        choices: [{ index: 0, delta, finish_reason: finishReason }],
      },
    });
    const parts = pieces(text, n).map((p, i) =>
      chunk(
        fn
          ? {
              tool_calls: [
                {
                  index: 0,
                  ...(i === 0 ? { id: `call_${seq}`, type: 'function' } : {}),
                  function: { ...(i === 0 ? { name: fn } : {}), arguments: p },
                },
              ],
            }
          : { content: p },
        null,
      ),
    );
    const includeUsage = isObj(body.stream_options) && body.stream_options.include_usage === true;
    return sse([
      chunk({ role: 'assistant' }, null),
      ...parts,
      chunk({}, finish),
      ...(includeUsage
        ? [{ data: { id, object: 'chat.completion.chunk', model, choices: [], usage } }]
        : []),
      { data: '[DONE]' },
    ]);
  };

  const models = (h: Readonly<Record<string, string>>): MockServiceResponse => {
    const anthropicStyle = h['anthropic-version'] !== undefined;
    const ids = opts.models ?? [anthropicStyle ? 'claude-haiku-5-5' : 'mock-chat'];
    return anthropicStyle
      ? json(200, {
          data: ids.map((id) => ({ id, type: 'model', display_name: id })),
          has_more: false,
          last_id: ids[ids.length - 1] ?? null,
        })
      : json(200, { object: 'list', data: ids.map((id) => ({ id, object: 'model' })) });
  };

  return {
    calls,
    handle(req) {
      calls.push(req);
      const path = req.path.split('?')[0] ?? '';
      if (!keyOk(req.headers)) {
        return path.endsWith('/messages')
          ? json(401, {
              type: 'error',
              error: { type: 'authentication_error', message: 'invalid x-api-key' },
            })
          : json(401, {
              error: {
                message: 'Incorrect API key provided',
                type: 'invalid_request_error',
                code: 'invalid_api_key',
              },
            });
      }
      if (req.method === 'GET' && path.endsWith('/models')) return models(req.headers);
      const fail = req.method === 'POST' ? failures.shift() : undefined;
      if (fail) return json(fail.status, fail.body, fail.headers);
      let body: unknown;
      try {
        body = JSON.parse(req.body);
      } catch {
        body = undefined;
      }
      if (!isObj(body)) return json(400, { error: { message: 'body must be JSON' } });
      if (req.method === 'POST' && path.endsWith('/v1/messages')) return anthropic(body);
      if (req.method === 'POST' && path.endsWith('/chat/completions')) return openai(body);
      return json(404, { error: { message: `no route ${req.method} ${path}` } });
    },
  };
}
