// Output parsing and the structural gate of the AI layer: JSON shape, command kinds in the
// request's allowed list, data as an object, count limits, and light post-processing of
// speech and thought. Semantic checks (staleness, cost, eligibility) belong to the kernel's
// command handlers. See docs/50_tech/ai_architecture.md 2.3.5, 7.5 and 8.2.

export interface ProposedCommand {
  kind: string;
  data: Record<string, unknown>;
}

export interface RejectedCommand {
  index: number;
  kind?: string;
  reason: 'not_allowed' | 'bad_kind' | 'bad_data' | 'too_many';
}

export interface ValidatedProposal {
  /** False when the answer is not a usable object at all. */
  ok: boolean;
  commands: ProposedCommand[];
  rejected: RejectedCommand[];
  speech?: string;
  thought?: string;
  /** Structural problems, in Chinese, for the audit desk. */
  errors: string[];
}

export interface ValidateOptions {
  maxCommands: number;
  speechMaxChars?: number;
  thoughtMaxChars?: number;
  /** Speaker display name; a leading "name:" prefix is removed from speech. */
  speakAs?: string;
}

/**
 * Best-effort JSON recovery: use the provider's parsed JSON when present, otherwise parse
 * the text, tolerating code fences and prose around one object.
 */
export function recoverJson(json: unknown, text: string): unknown {
  if (json !== null && json !== undefined) return json;
  const t = text.trim();
  if (!t) return undefined;
  const attempts = [t];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fenced?.[1]) attempts.push(fenced[1].trim());
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first >= 0 && last > first) attempts.push(t.slice(first, last + 1));
  for (const a of attempts) {
    try {
      return JSON.parse(a);
    } catch {
      // try the next form
    }
  }
  return undefined;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseData(v: unknown): Record<string, unknown> | undefined {
  if (isPlainObject(v)) return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return {};
    try {
      const parsed: unknown = JSON.parse(s);
      return isPlainObject(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Light post-processing (docs/50_tech/ai_architecture.md 7.5): no markdown marks, no outer
 * quotes, no self-name prefix, bounded length. No rewriting.
 */
export function tidyLine(s: string, maxChars: number, speakAs?: string): string {
  let t = s.replace(/[*_#`~]/g, '').trim();
  if (speakAs) {
    for (const sep of ['：', ':']) {
      if (t.startsWith(`${speakAs}${sep}`)) t = t.slice(speakAs.length + sep.length).trim();
    }
  }
  const pairs: [string, string][] = [
    ['“', '”'],
    ['"', '"'],
    ['「', '」'],
    ['『', '』'],
  ];
  for (const [a, b] of pairs) {
    if (t.length >= 2 && t.startsWith(a) && t.endsWith(b)) t = t.slice(a.length, -b.length).trim();
  }
  const chars = [...t];
  if (chars.length > maxChars) {
    const cut = chars.slice(0, maxChars).join('');
    const stop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'));
    t = stop >= maxChars / 2 ? cut.slice(0, stop + 1) : cut;
  }
  return t;
}

/** Validate one model answer against the request's allowed command kinds. */
export function validateProposal(
  raw: unknown,
  allowed: readonly string[],
  opts: ValidateOptions,
): ValidatedProposal {
  const out: ValidatedProposal = { ok: false, commands: [], rejected: [], errors: [] };
  if (!isPlainObject(raw)) {
    out.errors.push('输出不是一个 JSON 对象');
    return out;
  }
  const cmds = raw.commands;
  if (!Array.isArray(cmds)) {
    out.errors.push('缺少 commands 数组（commands 应放在最外层）');
    return out;
  }
  out.ok = true;
  const allow = new Set(allowed);
  cmds.forEach((c, index) => {
    if (!isPlainObject(c) || typeof c.kind !== 'string' || c.kind === '') {
      out.rejected.push({ index, reason: 'bad_kind' });
      return;
    }
    const kind = c.kind;
    if (!allow.has(kind)) {
      out.rejected.push({ index, kind, reason: 'not_allowed' });
      return;
    }
    const data = parseData(c.data);
    if (!data) {
      out.rejected.push({ index, kind, reason: 'bad_data' });
      return;
    }
    if (out.commands.length >= opts.maxCommands) {
      out.rejected.push({ index, kind, reason: 'too_many' });
      return;
    }
    out.commands.push({ kind, data });
  });
  if (typeof raw.speech === 'string') {
    const s = tidyLine(raw.speech, opts.speechMaxChars ?? 200, opts.speakAs);
    if (s) out.speech = s;
  }
  if (typeof raw.thought === 'string') {
    const s = tidyLine(raw.thought, opts.thoughtMaxChars ?? 300);
    if (s) out.thought = s;
  }
  return out;
}

/** Every string inside a value (for leak scanning of command data). */
export function collectStrings(v: unknown, into: string[] = []): string[] {
  if (typeof v === 'string') into.push(v);
  else if (Array.isArray(v)) for (const x of v) collectStrings(x, into);
  else if (isPlainObject(v)) for (const x of Object.values(v)) collectStrings(x, into);
  return into;
}
