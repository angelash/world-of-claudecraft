// Variable registry view model (src/editor/registry/registry_model.ts): search by name,
// alias, label and family member; the content's flag uses resolved to their registry
// entry (aliases and family members land on it), quests and scenes first; names the
// registry does not resolve. Also the row locator the view links rows with.

import { describe, expect, it } from 'vitest';
import { allSchemas, buildContent } from '../src/content';
import { collectFlagUses } from '../src/content/registry_refs';
import type { ContentMap } from '../src/core/contracts';
import {
  defaultRegistry,
  type FamilyDef,
  FlagRegistry,
  type RegistryData,
  type VarDef,
} from '../src/core/registry';
import { rowLocator, topField } from '../src/editor/checks/row_locator';
import { idOf, rowsOf } from '../src/editor/content/rows';
import {
  indexUses,
  registryEntries,
  registryOf,
  searchRegistry,
  sortUses,
  useCounts,
  usesOf,
  valueText,
} from '../src/editor/registry/registry_model';
import { staticDataFiles } from '../src/editor/state/static_data';

function def(name: string, extra: Partial<VarDef> = {}): VarDef {
  return {
    name,
    kind: 'flag',
    scope: 'act_flag',
    range: null,
    step: null,
    default: false,
    values: null,
    aliases: [],
    writers: ['content'],
    readers: ['content'],
    derive: null,
    monotone: true,
    act: 0,
    visibility: 'hidden',
    ai: 'none',
    label: `var.${name}`,
    source: '8.1',
    ...extra,
  };
}

const TRUST: FamilyDef = {
  ...def('trust.<npc>', { kind: 'int', scope: 'family', act: null, label: 'var.trust.npc' }),
  aliases: ['friend.<npc>'],
  slots: [{ name: 'npc', domain: null, keys: null }],
};

const DATA: RegistryData = {
  version: 1,
  source: 'test',
  vars: [
    def('p_door_open', { aliases: ['door_open'] }),
    def('p_lamp_lit', { label: 'var.lantern_state' }),
    def('gold', { kind: 'int', scope: 'global', act: null, monotone: false }),
  ],
  families: [TRUST],
  valueAliases: {},
  conversions: [],
  patternAliases: [],
  keyAliases: {},
  questIds: {},
  keyDomains: {},
};

/** A tiny content: a quest reads an alias and writes the flag, a scene reads a member. */
const CONTENT = {
  items: [{ id: 'i1', requiresFlags: ['p_door_open', 'ghost_flag'] }],
  scenes: [{ id: 's1', when: 'trust.oola >= 2' }],
  quests: [
    {
      id: 'q1',
      trigger: 'door_open',
      stages: [{ effects: [{ type: 'flag', key: 'p_door_open', value: true }] }],
    },
  ],
} as unknown as ContentMap;

describe('registry search', () => {
  const registry = new FlagRegistry(DATA);
  const entries = registryEntries(registry);
  const names = (q: string) => searchRegistry(registry, entries, q).map((h) => h.entry.name);

  it('lists every variable and family pattern, sorted', () => {
    expect(entries.map((e) => [e.name, e.family])).toEqual([
      ['gold', false],
      ['p_door_open', false],
      ['p_lamp_lit', false],
      ['trust.<npc>', true],
    ]);
    expect(names('')).toEqual(['gold', 'p_door_open', 'p_lamp_lit', 'trust.<npc>']);
  });

  it('matches names and patterns by substring, case-insensitive', () => {
    expect(names('door')).toEqual(['p_door_open']);
    expect(names('DOOR')).toEqual(['p_door_open']);
    expect(names('p_')).toEqual(['p_door_open', 'p_lamp_lit']);
    expect(names('trust.<')).toEqual(['trust.<npc>']);
    expect(names('nothing_like_this')).toEqual([]);
  });

  it('matches aliases and label keys', () => {
    const alias = searchRegistry(registry, entries, 'oor_op');
    expect(alias.map((h) => [h.entry.name, h.match])).toEqual([['p_door_open', 'name']]);
    const viaAlias = searchRegistry(registry, entries, 'friend');
    expect(viaAlias.map((h) => [h.entry.name, h.match, h.text])).toEqual([
      ['trust.<npc>', 'alias', 'friend.<npc>'],
    ]);
    const label = searchRegistry(registry, entries, 'lantern');
    expect(label.map((h) => [h.entry.name, h.match, h.text])).toEqual([
      ['p_lamp_lit', 'label', 'var.lantern_state'],
    ]);
  });

  it('puts the entry a written name resolves to first (alias spelling, family member)', () => {
    const alias = searchRegistry(registry, entries, 'door_open');
    expect(alias[0]).toMatchObject({ entry: { name: 'p_door_open' }, match: 'resolved' });
    expect(alias.filter((h) => h.entry.name === 'p_door_open')).toHaveLength(1);
    const member = searchRegistry(registry, entries, 'trust.oola');
    expect(member[0]).toMatchObject({
      entry: { name: 'trust.<npc>' },
      match: 'resolved',
      text: 'trust.oola',
    });
    const viaFamilyAlias = searchRegistry(registry, entries, 'friend.oola');
    expect(viaFamilyAlias[0]).toMatchObject({ entry: { name: 'trust.<npc>' }, match: 'resolved' });
  });
});

describe('content uses by registry entry', () => {
  const registry = new FlagRegistry(DATA);
  const index = indexUses(collectFlagUses(CONTENT).uses, registry);

  it('resolves aliases to their variable, quests first, split into reads and writes', () => {
    const uses = usesOf(index, 'p_door_open');
    expect(uses.writes.map((u) => [u.table, u.row, u.canonical, u.alias])).toEqual([
      ['quests', 'q1', 'p_door_open', false],
    ]);
    expect(uses.writes[0]?.path).toBe('[0].stages[0].effects[0]');
    expect(uses.reads.map((u) => [u.table, u.row, u.name, u.alias])).toEqual([
      ['quests', 'q1', 'door_open', true],
      ['items', 'i1', 'p_door_open', false],
    ]);
    expect(uses.quests).toEqual(['q1']);
    expect(uses.scenes).toEqual([]);
  });

  it('lands family members on the family entry with their concrete name', () => {
    const uses = usesOf(index, 'trust.<npc>');
    expect(uses.reads.map((u) => [u.table, u.row, u.canonical])).toEqual([
      ['scenes', 's1', 'trust.oola'],
    ]);
    expect(uses.scenes).toEqual(['s1']);
    expect(usesOf(index, 'gold')).toEqual({ reads: [], writes: [], quests: [], scenes: [] });
    expect(useCounts(index).get('p_door_open')).toBe(3);
  });

  it('lists the names the registry does not resolve', () => {
    expect(index.unresolved.map((u) => [u.name, u.uses.map((x) => `${x.table}:${x.row}`)])).toEqual(
      [['ghost_flag', ['items:i1']]],
    );
  });

  it('sorts quests, then scenes, then the other tables', () => {
    const at = (table: string, row: string) =>
      ({ name: 'x', kind: 'read', via: 'v', table, row, path: '', act: null }) as const;
    expect(
      sortUses([at('lore', 'a'), at('scenes', 'b'), at('acts', 'c'), at('quests', 'd')]).map(
        (u) => u.table,
      ),
    ).toEqual(['quests', 'scenes', 'acts', 'lore']);
  });

  it('formats values as one line', () => {
    expect(valueText('a')).toBe('a');
    expect(valueText(3)).toBe('3');
    expect(valueText([1, 2])).toBe('[1,2]');
    expect(valueText(null)).toBe('');
  });
});

describe('with the real content and registry', () => {
  const content = buildContent();
  const registry = registryOf(content);

  it('uses the shared registry instance for the shipped data', () => {
    expect(registry).toBe(defaultRegistry());
  });

  it('shows who writes and reads a1_wake_ruins', () => {
    const entries = registryEntries(registry);
    expect(searchRegistry(registry, entries, 'a1_wake_ruins')[0]).toMatchObject({
      entry: { name: 'a1_wake_ruins' },
      match: 'resolved',
    });
    const index = indexUses(collectFlagUses(content).uses, registry);
    const uses = usesOf(index, 'a1_wake_ruins');
    expect(uses.writes.some((u) => u.table === 'acts' && u.row === 'act1')).toBe(true);
    expect(uses.reads.some((u) => u.table === 'lore')).toBe(true);
    expect([...uses.reads, ...uses.writes].every((u) => u.canonical === 'a1_wake_ruins')).toBe(
      true,
    );
  });
});

describe('row locator', () => {
  it('takes the top-level field of a row path', () => {
    expect(topField('[2].stages[0].effects')).toBe('stages');
    expect(topField('trigger')).toBe('trigger');
    expect(topField('[0]')).toBeUndefined();
    expect(topField('')).toBeUndefined();
    expect(topField(undefined)).toBeUndefined();
  });

  it('finds the data file of a content row', () => {
    const schemas = allSchemas();
    const files = new Map(Object.entries(staticDataFiles()));
    const schema = schemas.find((s) => s.table === 'quests');
    expect(schema).toBeTruthy();
    if (!schema) return;
    const first = rowsOf(files.get(schema.file), 'quests', schema.idField)?.[0];
    const id = idOf(first, schema.idField) as string;
    const locate = rowLocator(schemas, files);
    expect(locate('quests', id, '[0].trigger')).toEqual({
      kind: 'row',
      file: schema.file,
      table: 'quests',
      id,
      field: 'trigger',
    });
    expect(locate('quests', 'no_such_quest')).toEqual({ kind: 'none' });
    expect(locate('no_such_table', id)).toEqual({ kind: 'none' });
  });
});
