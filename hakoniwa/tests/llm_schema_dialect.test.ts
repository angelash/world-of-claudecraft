// Schema dialects (docs/50_tech/llm_providers.md 3.6, 16.2): every role pack's output schema
// stays a valid member of each dialect's subset after the rewrite; the constraints a dialect
// strips are still enforced by the game's own check against the original schema; the
// local variant splits the menu into const branches and allows at most one call per answer.

import { describe, expect, it } from 'vitest';
import type { JsonSchema } from '../src/ai/contracts';
import { checkSchema, dropNullOptionals } from '../src/ai/output';
import { buildOutputSchema } from '../src/ai/prompt';
import { adapterFor } from '../src/ai/providers/adapters';
import { menuVerbs, outputGuidance } from '../src/ai/providers/guidance';
import {
  DIALECT_VERSION,
  DialectCache,
  dialectFor,
  lintDialectSchema,
  rewriteSchema,
  type SchemaDialect,
  STRIP_KEYWORDS,
} from '../src/ai/providers/schema_dialect';
import { genericPack, ROLE_PACKS } from '../src/game/ai_roles';
import { conn, FIXTURE_SCHEMA, LMSTUDIO, OLLAMA, OPUS, spec } from './fixtures/llm/specs';

const DIALECTS: readonly SchemaDialect[] = ['anthropic', 'openai_strict', 'local'];
const MENUS: readonly (readonly string[])[] = [
  ['npc.move', 'npc.say', 'npc.rest'],
  ['npc.say'],
  [],
];

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

describe('role pack schemas in every dialect', () => {
  const packs = [...ROLE_PACKS, genericPack];

  it.each(packs.map((p) => [p.role, p] as const))('%s stays valid', (_role, pack) => {
    for (const menu of MENUS) {
      const original = buildOutputSchema(menu, pack);
      const before = JSON.stringify(original);
      for (const d of DIALECTS) {
        const r = rewriteSchema(original, d);
        expect(lintDialectSchema(r.schema, d)).toEqual([]);
        expect(r.version).toBe(DIALECT_VERSION);
        // A valid answer of the pack stays valid after the rewrite and against the original.
        const answer: Record<string, unknown> = {
          commands: menu.length > 0 ? [{ kind: menu[0], data: '{}' }] : [],
        };
        if (pack.speech) answer.speech = '你好。';
        if (pack.thought) answer.thought = '先看看。';
        expect(checkSchema(answer, r.schema)).toEqual([]);
        expect(checkSchema(answer, original)).toEqual([]);
      }
      expect(JSON.stringify(original)).toBe(before);
    }
  });

  it('rewrites deterministically', () => {
    for (const d of DIALECTS) {
      expect(JSON.stringify(rewriteSchema(FIXTURE_SCHEMA, d).schema)).toBe(
        JSON.stringify(rewriteSchema(clone(FIXTURE_SCHEMA), d).schema),
      );
    }
  });
});

describe('the dialect rules', () => {
  it('strict: optional fields required and nullable, oneOf to anyOf, constraints stripped', () => {
    const r = rewriteSchema(FIXTURE_SCHEMA, 'openai_strict');
    const s = r.schema as { required: string[]; properties: Record<string, JsonSchema> };
    expect(s.required).toEqual(['commands', 'speech', 'mood', 'note']);
    expect(s.properties.note).toEqual({ type: ['string', 'null'] });
    expect(s.properties.mood).toEqual({
      anyOf: [{ type: 'string', enum: ['calm', 'tense'] }, { type: 'null' }],
    });
    expect(s.properties.speech).toEqual({ type: 'string', description: '说出口的话' });
    expect(r.stripped.map((x) => `${x.path}:${x.keyword}`).sort()).toEqual([
      '/properties/note:pattern',
      '/properties/speech:maxLength',
    ]);
    expect(lintDialectSchema(r.schema, 'openai_strict')).toEqual([]);
  });

  it('anthropic: optional fields stay optional; stripping and anyOf follow the model table', () => {
    const on = rewriteSchema(FIXTURE_SCHEMA, 'anthropic');
    expect((on.schema as { required: string[] }).required).toEqual(['commands', 'speech']);
    expect(JSON.stringify(on.schema)).not.toContain('oneOf');
    // Anthropic also takes no maxItems (and no minItems above one).
    expect(on.stripped.map((x) => `${x.path}:${x.keyword}`).sort()).toEqual([
      '/properties/commands:maxItems',
      '/properties/note:pattern',
      '/properties/speech:maxLength',
    ]);
    expect(lintDialectSchema(on.schema, 'anthropic')).toEqual([]);
    const withBounds = {
      ...on.schema,
      properties: {
        ...(on.schema.properties as object),
        z: { type: 'array', items: {}, maxItems: 2 },
      },
    };
    expect(lintDialectSchema(withBounds, 'anthropic').some((x) => x.includes('maxItems'))).toBe(
      true,
    );
    const off = rewriteSchema(FIXTURE_SCHEMA, 'anthropic', {
      flags: { oneOfToAnyOf: false, stripConstraints: false },
    });
    expect(off.stripped).toEqual([]);
    expect(JSON.stringify(off.schema)).toContain('"oneOf"');
    expect(JSON.stringify(off.schema)).toContain('"maxLength":20');
    expect(
      lintDialectSchema(off.schema, 'anthropic', {
        flags: { oneOfToAnyOf: false, stripConstraints: false },
      }),
    ).toEqual([]);
    expect(lintDialectSchema(off.schema, 'anthropic')).not.toEqual([]);
  });

  it('sets additionalProperties false on every object, even when the input forgot it', () => {
    const loose: JsonSchema = {
      type: 'object',
      properties: { a: { type: 'object', properties: { b: { type: 'string' } } } },
      required: ['a'],
    };
    for (const d of DIALECTS) {
      const out = JSON.stringify(rewriteSchema(loose, d).schema);
      expect(out.match(/"additionalProperties":false/g)).toHaveLength(2);
    }
  });

  it('keeps oneOf and anyOf intersected when both are present', () => {
    const both: JsonSchema = {
      type: 'object',
      properties: {
        v: {
          anyOf: [{ type: 'string' }, { type: 'number' }],
          oneOf: [{ type: 'string' }, { type: 'boolean' }],
        },
      },
      required: ['v'],
      additionalProperties: false,
    };
    const v = (rewriteSchema(both, 'openai_strict').schema as { properties: { v: JsonSchema } })
      .properties.v;
    expect(v).toEqual({
      anyOf: [{ type: 'string' }, { type: 'number' }],
      allOf: [{ anyOf: [{ type: 'string' }, { type: 'boolean' }] }],
    });
  });

  it('refuses a non-object root', () => {
    expect(() => rewriteSchema({ type: 'array', items: {} }, 'openai_strict')).toThrow();
    expect(lintDialectSchema({ type: 'string' }, 'anthropic')).toContain(
      'root: not an object schema',
    );
  });

  it('lint catches each broken rule', () => {
    const base = rewriteSchema(FIXTURE_SCHEMA, 'openai_strict').schema as Record<string, unknown>;
    const noAdd = { ...base, additionalProperties: true };
    expect(lintDialectSchema(noAdd, 'openai_strict')).toContain(': additionalProperties not false');
    const optional = { ...base, required: ['commands'] };
    expect(
      lintDialectSchema(optional, 'openai_strict').some((x) => x.includes('not required')),
    ).toBe(true);
    const withOneOf = { ...base, properties: { ...(base.properties as object), x: { oneOf: [] } } };
    expect(lintDialectSchema(withOneOf, 'openai_strict').some((x) => x.includes('oneOf'))).toBe(
      true,
    );
    const withLen = {
      ...base,
      properties: { ...(base.properties as object), y: { type: 'string', maxLength: 3 } },
    };
    expect(lintDialectSchema(withLen, 'openai_strict').some((x) => x.includes('maxLength'))).toBe(
      true,
    );
    const badType = {
      ...base,
      properties: { ...(base.properties as object), z: { type: 'text' } },
    };
    expect(lintDialectSchema(badType, 'anthropic').some((x) => x.includes('bad type'))).toBe(true);
    const local = rewriteSchema(FIXTURE_SCHEMA, 'local').schema as {
      properties: Record<string, Record<string, unknown>>;
    };
    const unCapped = clone(local);
    delete unCapped.properties.commands?.maxItems;
    expect(lintDialectSchema(unCapped, 'local').some((x) => x.includes('maxItems 1'))).toBe(true);
    expect(
      lintDialectSchema(rewriteSchema(FIXTURE_SCHEMA, 'openai_strict').schema, 'local'),
    ).toContain('/properties/commands: local variant needs maxItems 1');
  });

  it('maps provider kinds to dialects and caches rewrites by schema, channel and version', () => {
    expect(dialectFor('anthropic')).toBe('anthropic');
    expect(dialectFor('openai_compat')).toBe('openai_strict');
    expect(dialectFor('local')).toBe('local');
    const cache = new DialectCache();
    let built = 0;
    const key = DialectCache.key('npc.dialogue', '3', 'json_schema', 'openai_strict');
    const build = () => {
      built++;
      return rewriteSchema(FIXTURE_SCHEMA, 'openai_strict');
    };
    const a = cache.get(key, build);
    const b = cache.get(key, build);
    expect(a).toBe(b);
    expect(built).toBe(1);
    expect(key).toContain(`|${DIALECT_VERSION}|`);
    expect(DialectCache.key('npc.dialogue', '4', 'json_schema', 'openai_strict')).not.toBe(key);
    expect(
      DialectCache.key('npc.dialogue', '3', 'json_schema', 'anthropic', {
        oneOfToAnyOf: false,
        stripConstraints: true,
      }),
    ).not.toBe(DialectCache.key('npc.dialogue', '3', 'json_schema', 'anthropic'));
  });
});

describe('stripped constraints are still enforced by the game', () => {
  const strict = rewriteSchema(FIXTURE_SCHEMA, 'openai_strict').schema;

  it('a too long speech passes the provider subset but not the original schema', () => {
    const answer = {
      commands: [],
      speech: '这一句话远远超过了二十个字的上限，所以本方校验必须拒绝它才对。',
      mood: null,
      note: null,
    };
    expect(checkSchema(answer, strict)).toEqual([]);
    const restored = dropNullOptionals(answer, FIXTURE_SCHEMA);
    expect(restored).toEqual({ commands: [], speech: answer.speech });
    expect(checkSchema(restored, FIXTURE_SCHEMA)).toEqual([
      { path: '/speech', keyword: 'maxLength' },
    ]);
  });

  it('a pattern violation passes the subset but not the original', () => {
    const answer = { commands: [], speech: '好', mood: 'calm', note: 'Has Caps' };
    expect(checkSchema(answer, strict)).toEqual([]);
    expect(checkSchema(dropNullOptionals(answer, FIXTURE_SCHEMA), FIXTURE_SCHEMA)).toEqual([
      { path: '/note', keyword: 'pattern' },
    ]);
  });

  it('oneOf turned anyOf is checked as exactly one again', () => {
    const overlapping: JsonSchema = {
      type: 'object',
      properties: { v: { oneOf: [{ type: 'string' }, { type: 'string', maxLength: 5 }] } },
      required: ['v'],
      additionalProperties: false,
    };
    const rewritten = rewriteSchema(overlapping, 'openai_strict').schema;
    expect(checkSchema({ v: 'abc' }, rewritten)).toEqual([]);
    expect(checkSchema({ v: 'abc' }, overlapping)).toEqual([{ path: '/v', keyword: 'oneOf' }]);
  });

  it('numeric bounds, items, required and extra keys', () => {
    const s: JsonSchema = {
      type: 'object',
      properties: {
        n: { type: 'integer', minimum: 1, maximum: 3 },
        list: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 2,
          uniqueItems: true,
        },
      },
      required: ['n', 'list'],
      additionalProperties: false,
    };
    expect(checkSchema({ n: 2, list: ['a'] }, s)).toEqual([]);
    const keywords = (v: unknown) => checkSchema(v, s).map((x) => x.keyword);
    expect(keywords({ n: 5, list: ['a'] })).toEqual(['maximum']);
    expect(keywords({ n: 1.5, list: ['a'] })).toEqual(['type']);
    expect(keywords({ n: 1, list: [] })).toEqual(['minItems']);
    expect(keywords({ n: 1, list: ['a', 'a'] })).toEqual(['uniqueItems']);
    expect(keywords({ n: 1, list: ['a', 'b', 'c'] })).toEqual(['maxItems']);
    expect(keywords({ n: 1, list: [1] })).toEqual(['type']);
    expect(keywords({ list: ['a'] })).toEqual(['required']);
    expect(keywords({ n: 1, list: ['a'], x: 1 })).toEqual(['additionalProperties']);
    const stripped = rewriteSchema(s, 'openai_strict');
    expect(stripped.stripped.map((x) => x.keyword).sort()).toEqual([
      'maximum',
      'minimum',
      'uniqueItems',
    ]);
    expect(checkSchema({ n: 5, list: ['a', 'a'] }, stripped.schema)).toEqual([]);
  });

  it('the role pack command menu is enforced on every dialect', () => {
    for (const pack of [...ROLE_PACKS, genericPack]) {
      const original = buildOutputSchema(['npc.say'], pack);
      for (const d of DIALECTS) {
        const r = rewriteSchema(original, d).schema;
        const good: Record<string, unknown> = { commands: [{ kind: 'npc.say', data: '{}' }] };
        if (pack.speech) good.speech = '';
        if (pack.thought) good.thought = '';
        expect(checkSchema(good, r)).toEqual([]);
        const bad = { ...good, commands: [{ kind: 'npc.attack', data: '{}' }] };
        // Only the menu verb is wrong, so the failure is about the verb.
        const issues = checkSchema(bad, r);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues.every((x) => x.path.startsWith('/commands/0'))).toBe(true);
      }
    }
  });

  it('every keyword a dialect strips is still enforced by the game check', () => {
    const cases: Record<string, [JsonSchema, unknown, unknown]> = {
      minLength: [{ type: 'string', minLength: 2 }, 'ab', 'a'],
      maxLength: [{ type: 'string', maxLength: 2 }, 'ab', 'abc'],
      pattern: [{ type: 'string', pattern: '^a' }, 'ab', 'ba'],
      format: [{ type: 'string', format: 'date' }, '2026-11-16', 'tomorrow'],
      minimum: [{ type: 'number', minimum: 1 }, 1, 0],
      maximum: [{ type: 'number', maximum: 1 }, 1, 2],
      exclusiveMinimum: [{ type: 'number', exclusiveMinimum: 1 }, 2, 1],
      exclusiveMaximum: [{ type: 'number', exclusiveMaximum: 1 }, 0, 1],
      multipleOf: [{ type: 'number', multipleOf: 5 }, 10, 7],
      uniqueItems: [{ type: 'array', uniqueItems: true }, [1, 2], [1, 1]],
      minProperties: [{ type: 'object', minProperties: 1 }, { a: 1 }, {}],
      maxProperties: [{ type: 'object', maxProperties: 1 }, { a: 1 }, { a: 1, b: 2 }],
      patternProperties: [
        { type: 'object', patternProperties: { '^n_': { type: 'number' } } },
        { n_a: 1 },
        { n_a: 'x' },
      ],
      propertyNames: [
        { type: 'object', propertyNames: { pattern: '^[a-z]+$' } },
        { ab: 1 },
        { AB: 1 },
      ],
      contains: [{ type: 'array', contains: { const: 3 } }, [1, 3], [1, 2]],
      minContains: [{ type: 'array', contains: { const: 3 }, minContains: 2 }, [3, 3], [3, 1]],
      maxContains: [{ type: 'array', contains: { const: 3 }, maxContains: 1 }, [3, 1], [3, 3]],
    };
    for (const keyword of STRIP_KEYWORDS) {
      if (keyword === 'default') continue; // an annotation, not a constraint
      const c = cases[keyword];
      expect(c, keyword).toBeDefined();
      if (!c) continue;
      const [schema, good, bad] = c;
      const wrapped: JsonSchema = {
        type: 'object',
        properties: { v: schema },
        required: ['v'],
        additionalProperties: false,
      };
      const stripped = rewriteSchema(wrapped, 'openai_strict');
      expect(
        stripped.stripped.map((x) => x.keyword),
        keyword,
      ).toContain(keyword);
      expect(checkSchema({ v: good }, wrapped), keyword).toEqual([]);
      // The original rejects the bad value for a reason the provider subset no longer has.
      const key = (x: { path: string; keyword: string }) => `${x.path}:${x.keyword}`;
      const original = checkSchema({ v: bad }, wrapped).map(key);
      const subset = checkSchema({ v: bad }, stripped.schema).map(key);
      expect(original.length, keyword).toBeGreaterThan(0);
      expect(
        original.some((x) => !subset.includes(x)),
        keyword,
      ).toBe(true);
    }
  });

  it('follows local references and if/then/else', () => {
    const s: JsonSchema = {
      type: 'object',
      $defs: { verb: { type: 'string', enum: ['go', 'stay'] } },
      properties: {
        a: { $ref: '#/$defs/verb' },
        // biome-ignore lint/suspicious/noThenProperty: then is a JSON Schema keyword here
        b: { type: 'number', if: { minimum: 10 }, then: { multipleOf: 10 }, else: { maximum: 5 } },
      },
      required: ['a', 'b'],
      additionalProperties: false,
    };
    expect(checkSchema({ a: 'go', b: 20 }, s)).toEqual([]);
    expect(checkSchema({ a: 'fly', b: 3 }, s)).toEqual([{ path: '/a', keyword: 'enum' }]);
    expect(checkSchema({ a: 'go', b: 15 }, s)).toEqual([{ path: '/b', keyword: 'multipleOf' }]);
    expect(checkSchema({ a: 'go', b: 7 }, s)).toEqual([{ path: '/b', keyword: 'maximum' }]);
    expect(
      checkSchema({ a: 'go', b: 1 }, { ...s, properties: { a: { $ref: '#/nope' }, b: {} } }),
    ).toEqual([{ path: '/a', keyword: '$ref' }]);
  });
});

describe('the local variant', () => {
  const local = rewriteSchema(FIXTURE_SCHEMA, 'local');
  const calls = (local.schema as { properties: { commands: Record<string, unknown> } }).properties
    .commands;

  it('splits the menu into one const branch per verb and caps calls at one', () => {
    expect(calls.maxItems).toBe(1);
    const branches = (calls.items as { anyOf: { properties: { kind: unknown } }[] }).anyOf;
    expect(branches.map((b) => b.properties.kind)).toEqual([
      { type: 'string', const: 'npc.say', description: '命令种类' },
      { type: 'string', const: 'npc.move', description: '命令种类' },
    ]);
    expect(menuVerbs(local.schema)).toEqual(['npc.say', 'npc.move']);
    expect(lintDialectSchema(local.schema, 'local')).toEqual([]);
  });

  it('accepts one call and rejects two or an unknown verb', () => {
    const one = {
      commands: [{ kind: 'npc.move', data: '{}' }],
      speech: '走',
      mood: null,
      note: null,
    };
    expect(checkSchema(one, local.schema)).toEqual([]);
    const two = { ...one, commands: [one.commands[0], { kind: 'npc.say', data: '{}' }] };
    expect(checkSchema(two, local.schema).map((x) => x.keyword)).toContain('maxItems');
    const unknown = { ...one, commands: [{ kind: 'npc.fly', data: '{}' }] };
    expect(checkSchema(unknown, local.schema).map((x) => x.keyword)).toContain('anyOf');
  });

  it('writes a single verb as a constant and context constants as const', () => {
    const single = rewriteSchema(
      {
        ...clone(FIXTURE_SCHEMA),
        properties: {
          ...(clone(FIXTURE_SCHEMA).properties as object),
          commands: {
            type: 'array',
            items: {
              type: 'object',
              properties: { kind: { type: 'string', enum: ['npc.say'] }, data: { type: 'string' } },
              required: ['kind', 'data'],
              additionalProperties: false,
            },
          },
        },
      },
      'local',
      { constants: { note: 'abc' } },
    ).schema as { properties: Record<string, Record<string, unknown>> };
    expect(
      (single.properties.commands as { items: { properties: { kind: unknown } } }).items.properties
        .kind,
    ).toEqual({
      type: 'string',
      const: 'npc.say',
    });
    expect(single.properties.note).toMatchObject({ const: 'abc' });
  });

  it('sends the flattened schema with the guidance and decision points (Ollama and LM Studio)', () => {
    for (const [c, prof] of [
      [conn('local', {}, 'ollama'), OLLAMA],
      [conn('local', {}, 'lmstudio'), LMSTUDIO],
    ] as const) {
      const req = adapterFor('local').build(
        spec({ provider: 'local', model: prof.model }),
        c,
        prof,
      );
      const body = JSON.parse(req.body ?? '{}');
      const schema = body.format ?? body.response_format?.json_schema?.schema;
      expect(schema.properties.commands.maxItems).toBe(1);
      expect('tools' in body).toBe(false);
      const system: string = body.messages[0].content;
      expect(system).toContain('【决策要点】');
      expect(system).toContain('每次至多提出一条命令');
      expect(system).toContain('可选命令：npc.say、npc.move');
      expect(system).toContain('至多 1 条');
    }
    const g = outputGuidance(FIXTURE_SCHEMA, { local: true });
    expect(g).not.toContain('至多 3 条');
    expect(outputGuidance(FIXTURE_SCHEMA)).toContain('至多 3 条');
  });
});

describe('context constants reach the local request', () => {
  it('writes spec.output.constants into the local schema only', () => {
    const s = spec({ provider: 'local', model: OLLAMA.model });
    const withConst = { ...s, output: { ...s.output, constants: { note: 'abc' } } };
    const local = JSON.parse(
      adapterFor('local').build(withConst, conn('local', {}, 'ollama'), OLLAMA).body ?? '{}',
    );
    expect(local.format.properties.note).toMatchObject({ const: 'abc' });
    const cloud = JSON.parse(
      adapterFor('anthropic').build(
        { ...withConst, provider: 'anthropic', model: 'claude-opus-5-5' },
        conn('anthropic'),
        OPUS,
      ).body ?? '{}',
    );
    expect(JSON.stringify(cloud)).not.toContain('"const":"abc"');
  });
});
