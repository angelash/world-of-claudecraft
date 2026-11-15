// Output guidance text appended to the system part when the channel cannot enforce the
// schema (JSON mode, prompt only) and for the local variant (llm_providers.md 3.3 channels
// three and four, 3.4 local variant items 1 and 2): field meanings, an example, and for the
// local variant the decision points with the command menu. Deterministic: derived from the
// schema only. The text is prompt text for the model, so it is Chinese.

import type { JsonSchema } from '../contracts';
import { isObj } from './shared';

function typeName(s: Record<string, unknown>): string {
  const t = Array.isArray(s.type) ? s.type.filter((x) => x !== 'null')[0] : s.type;
  switch (t) {
    case 'string':
      return '字符串';
    case 'integer':
      return '整数';
    case 'number':
      return '数字';
    case 'boolean':
      return '真假值';
    case 'array':
      return '数组';
    case 'object':
      return '对象';
    default:
      return '值';
  }
}

function choices(s: Record<string, unknown>): unknown[] | undefined {
  if (Array.isArray(s.enum)) return s.enum.filter((x) => x !== null);
  if ('const' in s) return [s.const];
  return undefined;
}

function describe(
  schema: unknown,
  indent: string,
  lines: string[],
  maxItemsOf: Readonly<Record<string, number>> = {},
): void {
  if (!isObj(schema) || !isObj(schema.properties)) return;
  const req = new Set(Array.isArray(schema.required) ? schema.required : []);
  for (const [name, raw] of Object.entries(schema.properties)) {
    if (!isObj(raw)) continue;
    const bits = [typeName(raw), req.has(name) ? '必填' : '可省略'];
    const opts = choices(raw);
    if (opts) bits.push(`只能取：${opts.map((o) => String(o)).join('、')}`);
    const maxItems = maxItemsOf[name] ?? raw.maxItems;
    if (typeof maxItems === 'number') bits.push(`至多 ${maxItems} 条`);
    const desc = typeof raw.description === 'string' ? `：${raw.description}` : '';
    lines.push(`${indent}- ${name}（${bits.join('，')}）${desc}`);
    const items = raw.items;
    if (isObj(items) && isObj(items.properties)) {
      lines.push(`${indent}  每条：`);
      describe(items, `${indent}  `, lines);
    }
    if (isObj(raw.properties)) describe(raw, `${indent}  `, lines);
  }
}

/** A minimal example value for a schema (first choice, empty strings, one array item). */
export function exampleOf(schema: unknown): unknown {
  if (!isObj(schema)) return null;
  const opts = choices(schema);
  if (opts && opts.length > 0) return opts[0];
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const first = schema.anyOf.find((b) => !(isObj(b) && b.type === 'null'));
    return exampleOf(first ?? schema.anyOf[0]);
  }
  const t = Array.isArray(schema.type) ? schema.type.filter((x) => x !== 'null')[0] : schema.type;
  if (t === 'object' || isObj(schema.properties)) {
    const out: Record<string, unknown> = {};
    if (isObj(schema.properties)) {
      for (const [k, v] of Object.entries(schema.properties)) out[k] = exampleOf(v);
    }
    return out;
  }
  if (t === 'array') return schema.items === undefined ? [] : [exampleOf(schema.items)];
  if (t === 'string') return '';
  if (t === 'integer' || t === 'number') return 0;
  if (t === 'boolean') return false;
  return null;
}

export interface GuidanceOptions {
  /** Local variant: add the decision points (llm_providers.md 3.4 item 1). */
  local?: boolean;
  /** Tool carrier with only tool_choice auto: the model must call submit. */
  mustCallSubmit?: boolean;
  callsKey?: string;
  menuKey?: string;
}

/** The menu verbs of a schema's calls array (enum or const branches of the menu key). */
export function menuVerbs(schema: JsonSchema, callsKey = 'commands', menuKey = 'kind'): string[] {
  const props = isObj(schema.properties) ? schema.properties : {};
  const calls = props[callsKey];
  if (!isObj(calls)) return [];
  const items = calls.items;
  const branches = isObj(items) && Array.isArray(items.anyOf) ? items.anyOf : [items];
  const out: string[] = [];
  for (const b of branches) {
    const menu = isObj(b) && isObj(b.properties) ? b.properties[menuKey] : undefined;
    const opts = isObj(menu) ? choices(menu) : undefined;
    for (const o of opts ?? []) if (typeof o === 'string' && !out.includes(o)) out.push(o);
  }
  return out;
}

/** The guidance block appended to the system text. */
export function outputGuidance(schema: JsonSchema, opts: GuidanceOptions = {}): string {
  const lines: string[] = ['【输出格式】'];
  if (opts.mustCallSubmit) lines.push('必须调用 submit 函数提交结果，不要直接回答。');
  else lines.push('只输出一个 JSON 对象，不要输出任何其他文字，不要使用代码围栏。');
  lines.push('字段：');
  // The local variant takes one call per answer (llm_providers.md 3.4 item 2).
  describe(schema, '', lines, opts.local ? { [opts.callsKey ?? 'commands']: 1 } : {});
  lines.push(`示例：${JSON.stringify(exampleOf(schema))}`);
  if (opts.local) {
    const callsKey = opts.callsKey ?? 'commands';
    const req = Array.isArray(schema.required) ? schema.required.map(String) : [];
    lines.push('', '【决策要点】');
    if (req.length > 0) lines.push(`- 本轮必须给出：${req.join('、')}`);
    lines.push(`- 每次至多提出一条命令（${callsKey} 至多 1 条）。`);
    const verbs = menuVerbs(schema, callsKey, opts.menuKey ?? 'kind');
    if (verbs.length > 0) lines.push(`- 可选命令：${verbs.join('、')}`);
  }
  return lines.join('\n');
}
