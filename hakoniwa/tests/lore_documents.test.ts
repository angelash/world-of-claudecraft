// PK-M1-34, the act-1 lore documents (history.md 12; registry 6.1 and 6.3): the documents a
// player can hold in act 1 (H01 to H06 and the official translation of H21) are lore items
// with the readable marker, their player text keeps to the mortal wording (catalog
// relics_lore 1.9, D-030), and each document's knowledge entries open exactly when the
// document is held or read and the ledger condition holds.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ContentMap, FlagValue } from '../src/core/contracts';
import type { ItemDef } from '../src/systems/inventory';
import { findLeaks, isUnlocked, knowledgeFor } from '../src/systems/quests';
import { loadValidationInput } from '../tools/content/inputs';
import { ledgerFindings } from '../tools/content/validators/ledger';
import { namespaceFindings } from '../tools/content/validators/namespace';
import { schemaFindings } from '../tools/content/validators/schema';
import { textFindings } from '../tools/content/validators/text';
import type { ValidationInput } from '../tools/content/validators/types';
import { content } from './ailments_harness';

const DATA = join(__dirname, '..', 'data');
const read = <T>(file: string): T => JSON.parse(readFileSync(join(DATA, file), 'utf8')) as T;

/** The documents whose 获得 line in history.md 12 names act 1. */
const ACT1_DOCS = [
  'lore_h01',
  'lore_h02',
  'lore_h03',
  'lore_h04',
  'lore_h05',
  'lore_h06',
  'lore_h21',
] as const;

type Lore = {
  id: string;
  mystery: string;
  tier: string;
  unlock: string;
  knowers?: string[];
  keywords?: string[];
};

/** Each document's knowledge entries: the mortal (misleading) reading and the reveal(s). */
const ENTRIES: Record<
  (typeof ACT1_DOCS)[number],
  {
    mortal: string;
    mortalTier: string;
    reveals: { id: string; tier: string; needs: Record<string, FlagValue> }[];
  }
> = {
  lore_h01: {
    mortal: 'M05-C12',
    mortalTier: 'K0',
    reveals: [{ id: 'M05-C13', tier: 'K3', needs: { a3_archive_sealed_room: true } }],
  },
  lore_h02: {
    mortal: 'M05-C14',
    mortalTier: 'K0',
    reveals: [{ id: 'M05-C15', tier: 'K3', needs: { a3_ash_tells_sundering: true } }],
  },
  lore_h03: {
    mortal: 'M02-C13',
    mortalTier: 'K0',
    reveals: [{ id: 'M02-C14', tier: 'K3', needs: { a3_ash_tells_sundering: true } }],
  },
  lore_h04: {
    mortal: 'S02-C06',
    mortalTier: 'K1',
    reveals: [
      { id: 'S07-C06', tier: 'P', needs: { a1_bron_sees_mark: true } },
      { id: 'S07-C07', tier: 'K3', needs: { a5_seal_torn: true } },
    ],
  },
  lore_h05: {
    mortal: 'M10-C17',
    mortalTier: 'K0',
    reveals: [{ id: 'M10-C18', tier: 'K3', needs: { a3_ash_tells_sundering: true } }],
  },
  lore_h06: {
    mortal: 'M09-C14',
    mortalTier: 'P',
    reveals: [{ id: 'M09-C15', tier: 'K2', needs: { a1_dream_door_woman: true } }],
  },
  lore_h21: {
    mortal: 'M10-C19',
    mortalTier: 'K0',
    reveals: [{ id: 'M02-C15', tier: 'K3', needs: { a4_aiden_reads_charter: true } }],
  },
};

/** Mortal-wording replacements of catalog_relics_lore 1.9: what act-1 item text never says. */
const FORBIDDEN_WORDS = [
  '澱',
  '雅努',
  '第六司',
  '千门都',
  '大断绝',
  '空白纪',
  '排澱',
  '已离手之庭',
  '无貌者',
  '门站',
  '无名之钥',
];

const items = read<ItemDef[]>('scenes/lore_items.json');
const lore = read<Lore[]>('quests/lore.json');
const itemOf = (id: string) => items.find((i) => i.id === id);
const loreOf = (id: string) => lore.find((l) => l.id === id);
const world = (flags: Record<string, FlagValue>) => ({
  meta: { flags: { act: 'act1', ...flags } },
});

let real: ValidationInput;
let shipped: ContentMap;
beforeAll(() => {
  real = loadValidationInput({ milestone: 0 });
  shipped = content();
}, 120_000);

describe('the act-1 lore documents as items', () => {
  it('defines exactly the act-1 documents and no later one', () => {
    expect(items.map((i) => i.id).sort()).toEqual([...ACT1_DOCS].sort());
    for (const i of items) expect(i.id).toMatch(/^lore_h(0[1-9]|1[0-9]|2[0-4])$/);
  });

  it('every document is a single, unsellable, readable lore item', () => {
    for (const id of ACT1_DOCS) {
      const it = itemOf(id);
      expect(it, id).toBeDefined();
      expect(it?.kind, id).toBe('lore');
      expect(it?.stack, id).toBe(1);
      expect(it?.value, id).toBe(0);
      expect(it?.use, id).toEqual({ effect: 'read' });
      expect(it?.tags, id).toEqual(['history', 'no_sell']);
    }
  });

  it('the merged content carries them as items (the wake cutscene gives lore_h03)', () => {
    for (const id of ACT1_DOCS)
      expect(
        shipped.items.some((i) => i.id === id),
        id,
      ).toBe(true);
    const wake = shipped.scenes.find((s) => s.id === 'cut_a1_wake');
    const sigils = wake?.nodes.find((n) => n.id === 'sigils');
    expect(sigils?.effects).toContainEqual({ type: 'item', item: 'lore_h03' });
  });

  it('no player-visible text uses a word act 1 mortals cannot say', () => {
    for (const it of items) {
      for (const word of FORBIDDEN_WORDS) {
        expect(it.name.includes(word), `${it.id} name: ${word}`).toBe(false);
        expect(it.desc.includes(word), `${it.id} desc: ${word}`).toBe(false);
      }
    }
    // the guild register's annotation is the mortal 灰气, not the canon word (D-030)
    expect(itemOf('lore_h04')?.desc).toContain('灰气');
  });

  it('no item text leaks a locked term or reveal keyword in act 1', () => {
    for (const it of items) {
      const leaks = findLeaks(`${it.name}${it.desc}`, world({ a1_wake_ruins: true }), shipped);
      expect(leaks, it.id).toEqual([]);
    }
  });
});

describe('the knowledge entries of the documents', () => {
  it('each document has its mortal reading and its reveals, unlocked by the document', () => {
    for (const doc of ACT1_DOCS) {
      const e = ENTRIES[doc];
      const mortal = loadOf(e.mortal);
      expect(mortal.tier, e.mortal).toBe(e.mortalTier);
      expect(mortal.unlock, e.mortal).toBe('act>=1');
      for (const r of e.reveals) {
        const l = loadOf(r.id);
        expect(l.tier, r.id).toBe(r.tier);
        expect(l.unlock.startsWith(`read.${doc} AND `), r.id).toBe(true);
        expect(l.keywords?.length ?? 0, r.id).toBeGreaterThan(0);
      }
    }
  });

  it('a reveal opens only when the document is read and its condition holds', () => {
    for (const doc of ACT1_DOCS) {
      for (const r of ENTRIES[doc].reveals) {
        const unlock = loadOf(r.id).unlock;
        // the document alone, or the condition alone, opens nothing
        expect(isUnlocked(world({ [`read.${doc}`]: true }), unlock), `${r.id} doc only`).toBe(
          false,
        );
        expect(isUnlocked(world(r.needs), unlock), `${r.id} cond only`).toBe(false);
        expect(isUnlocked(world({ [`read.${doc}`]: true, ...r.needs }), unlock), r.id).toBe(true);
      }
    }
  });

  it('the faceless-origin reveal of H04 waits for the ledger S07-C04 condition', () => {
    const unlock = loadOf('S07-C07').unlock;
    const doc = { 'read.lore_h04': true };
    expect(isUnlocked(world({ ...doc, a2_faceless_projection: true }), unlock)).toBe(false);
    expect(isUnlocked(world({ ...doc, a3_martha_tale: true }), unlock)).toBe(false);
    expect(
      isUnlocked(world({ ...doc, a3_martha_tale: true, a4_key_theft_exposed: true }), unlock),
    ).toBe(true);
  });

  it('a mortal NPC hears the misleading reading in act 1, not the reveal', () => {
    const k1 = knowledgeFor(world({}), shipped, 'K1');
    const k3 = knowledgeFor(world({ 'read.lore_h03': true }), shipped, 'K3');
    for (const doc of ACT1_DOCS) {
      const e = ENTRIES[doc];
      const mortal = shipped.lore.find((l) => l.id === e.mortal);
      // the private reading is the priest's own (H06: he reads the lullaby as a cult song)
      const heard = e.mortalTier === 'P' ? knowledgeFor(world({}), shipped, 'K0', 'cassian') : k1;
      expect(heard, doc).toContain(mortal?.text);
      for (const r of ENTRIES[doc].reveals) {
        const text = shipped.lore.find((l) => l.id === r.id)?.text;
        expect(k3.includes(text ?? ''), r.id).toBe(false);
      }
    }
  });

  it('the private readings are known to their knowers only', () => {
    expect(loadOf('S07-C06').knowers).toEqual(['bron', 'martha']);
    expect(loadOf('M09-C14').knowers).toEqual(['cassian']);
    const open = world({ 'read.lore_h04': true, a1_bron_sees_mark: true });
    const text = shipped.lore.find((l) => l.id === 'S07-C06')?.text ?? '';
    expect(knowledgeFor(open, shipped, 'K5')).not.toContain(text);
    expect(knowledgeFor(open, shipped, 'K0', 'bron')).toContain(text);
  });

  it('adds only new clue ids, each once', () => {
    const ids = lore.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const doc of ACT1_DOCS)
      for (const id of [ENTRIES[doc].mortal, ...ENTRIES[doc].reveals.map((r) => r.id)])
        expect(
          ids.filter((x) => x === id),
          id,
        ).toHaveLength(1);
  });
});

describe('content validation', () => {
  it('the records pass the item schema, namespaces, text and ledger layers', () => {
    const schemas = real.packs.flatMap((p) => p.schemas ?? []).filter((s) => s.table === 'items');
    const files = new Map([[schemas[0]?.file ?? 'x', items]]);
    expect(schemaFindings(schemas.slice(0, 1), files).filter((f) => f.level === 'error')).toEqual(
      [],
    );
    const mine = (f: { row?: string; message: string }) =>
      ACT1_DOCS.some((id) => f.row === id || f.message.includes(id)) ||
      Object.values(ENTRIES).some(
        (e) => f.message.includes(e.mortal) || e.reveals.some((r) => f.message.includes(r.id)),
      );
    expect(namespaceFindings(real).filter(mine)).toEqual([]);
    expect(textFindings(real).filter(mine)).toEqual([]);
    expect(ledgerFindings(real).filter(mine)).toEqual([]);
  });
});

function loadOf(id: string): Lore {
  const l = loreOf(id);
  if (!l) throw new Error(`no lore entry ${id}`);
  return l;
}
