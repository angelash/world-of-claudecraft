// Reveal review (locked terms in audit records, data and events, knowledge per tier) and
// the role views (NPC and goddess queries) of the inspector.

import { describe, expect, it } from 'vitest';
import type { AuditRecord } from '../src/ai/audit';
import { buildContent } from '../src/content';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import {
  flagWorldAt,
  knowledgeByTier,
  lockedTermList,
  reviewData,
  reviewEvents,
  reviewRecords,
  termCounts,
} from '../src/editor/ledger/leak_review';
import {
  goddessSections,
  npcIdForEntity,
  npcSections,
  roleEntries,
} from '../src/editor/roles/role_model';
import { createGame } from '../src/game/create';

const LORE = {
  lore: [
    { id: 'l1', tier: 'K0', unlock: 'true', text: '人人都知道的事', keywords: [] },
    {
      id: 'l2',
      tier: 'K3',
      unlock: 'act == act2',
      text: '学者在第二幕才知道',
      keywords: ['旧誓约'],
    },
    { id: 'l3', tier: 'K5', unlock: 'secret_open', text: '神才知道', keywords: ['空白纪'] },
  ],
  terms: [
    { term: '被禁之名', replacement: '那位', unlock: 'act == act6' },
    { term: '公开之名', replacement: '那位', unlock: 'true' },
  ],
};
const CONTENT = LORE as unknown as ContentMap;
const W1 = { meta: { flags: { act: 'act1' } } };

function rec(p: Partial<AuditRecord> & { auditId: string }): AuditRecord {
  return {
    requestId: 'r',
    agentId: 'moss',
    role: 'npc.dialogue',
    rolePackVersion: '1',
    purpose: 'talk',
    tick: 0,
    epoch: 0,
    realMs: 0,
    degradeLevel: 0,
    outcome: 'proposal',
    ...p,
  };
}

describe('leak review', () => {
  it('lists locked terms and what each tier may know, at the world or at another act', () => {
    expect(lockedTermList(W1, CONTENT).map((t) => t.term)).toEqual(['被禁之名']);
    const k = knowledgeByTier(W1, CONTENT);
    expect(k.K0).toEqual(['人人都知道的事']);
    expect(k.K5).toEqual(['人人都知道的事']);
    const act2 = flagWorldAt(W1, { act: 'act2' });
    expect(knowledgeByTier(act2, CONTENT).K3).toEqual(['人人都知道的事', '学者在第二幕才知道']);
    expect(knowledgeByTier(act2, CONTENT).K2).toEqual(['人人都知道的事']);
    expect(W1.meta.flags.act).toBe('act1');
    expect(lockedTermList(flagWorldAt(W1, { act: 'act6' }), CONTENT)).toEqual([]);
  });

  it('finds locked terms and keywords in audit record texts by field', () => {
    const hits = reviewRecords(
      [
        rec({ auditId: 'a1', speech: '你听说过被禁之名吗', thought: '公开之名没关系' }),
        rec({ auditId: 'a2', prompt: { system: 's', stable: 't', context: '关于旧誓约的传闻' } }),
        rec({ auditId: 'a3', speech: '天气不错' }),
      ],
      W1,
      CONTENT,
    );
    expect(hits.map((h) => [h.source, h.path, h.terms])).toEqual([
      ['a1', 'speech', ['被禁之名']],
      ['a2', 'prompt.context', ['旧誓约']],
    ]);
    expect(hits[0]?.snippet).toContain('被禁之名');
    expect(
      reviewRecords(
        [rec({ auditId: 'a2', speech: '旧誓约' })],
        flagWorldAt(W1, { act: 'act2' }),
        CONTENT,
      ),
    ).toEqual([]);
  });

  it('locates hits in data files by JSON path and skips the ledger files', () => {
    const files = new Map<string, unknown>([
      [
        'dialogue/templates.json',
        [
          { id: 't1', text: '平常话' },
          { id: 't2', lines: ['好', '空白纪的秘密'] },
        ],
      ],
      ['quests/terms.json', LORE.terms],
      ['npc/personas.json', [{ id: 'p', intro: '无事' }]],
    ]);
    const hits = reviewData(files, W1, CONTENT);
    expect(hits).toEqual([
      {
        source: 'dialogue/templates.json',
        path: '[1].lines[1]',
        terms: ['空白纪'],
        snippet: '空白纪的秘密',
      },
    ]);
  });

  it('finds hits in event data and counts terms', () => {
    const events = [
      {
        kind: 'dialogue.line',
        tick: 1,
        seq: 9,
        data: { text: '被禁之名与空白纪', speakerId: 'x' },
      },
      { kind: 'world.hour', tick: 1, seq: 10, data: { hour: 7 } },
    ] as unknown as AnyWorldEvent[];
    const hits = reviewEvents(events, W1, CONTENT);
    expect(hits.map((h) => `${h.source} ${h.path}`)).toEqual(['dialogue.line#9 text']);
    expect(termCounts([...hits, ...hits])).toEqual([
      { term: '被禁之名', count: 2 },
      { term: '空白纪', count: 2 },
    ]);
  });

  it('is empty when the content has no reveal ledger', () => {
    expect(
      reviewRecords([rec({ auditId: 'x', speech: '被禁之名' })], W1, {} as ContentMap),
    ).toEqual([]);
    expect(knowledgeByTier(W1, {} as ContentMap).K0).toEqual([]);
  });

  it('runs over the real content without throwing', () => {
    const content = buildContent();
    const game = createGame({ aiMode: 'off', content, seed: 2 });
    const all = new Map<string, unknown>([['x.json', { text: '普通的文本' }]]);
    expect(reviewData(all, game.world, content)).toEqual([]);
    expect(lockedTermList(game.world, content).length).toBeGreaterThan(0);
  });
});

describe('role views', () => {
  const content = buildContent();
  const game = createGame({ aiMode: 'off', content, seed: 5 });
  game.step(40);
  const world = game.world;

  it('lists NPCs from the npc slice and goddesses from content', () => {
    const entries = roleEntries(world, content);
    const npcs = entries.filter((e) => e.kind === 'npc');
    const goddesses = entries.filter((e) => e.kind === 'goddess');
    expect(npcs.length).toBe(Object.keys(world.slices.npc.npcs).length);
    expect(goddesses.map((g) => g.id).sort()).toEqual(content.goddesses.map((g) => g.id).sort());
  });

  it('maps an NPC entity back to its npc id', () => {
    const [id, st] = Object.entries(world.slices.npc.npcs)[0] as [string, { entityId: string }];
    expect(npcIdForEntity(world, st.entityId)).toBe(id);
    expect(npcIdForEntity(world, 'player')).toBeUndefined();
  });

  it('returns every NPC section without query errors', () => {
    const id = Object.keys(world.slices.npc.npcs)[0] as string;
    const sections = npcSections(world, content, id);
    expect(sections).toHaveLength(8);
    expect(sections.filter((s) => s.error)).toEqual([]);
    expect(sections[0]?.value).toMatchObject({ id });
  });

  it('returns every goddess section, with her slice data, and isolates failures', () => {
    const gid = content.goddesses[0]?.id as string;
    const sections = goddessSections(world, content, gid);
    expect(sections.filter((s) => s.error)).toEqual([]);
    expect(sections[1]?.value).toMatchObject({ id: gid });
    const broken = goddessSections(
      { ...world, slices: { ...world.slices, goddess: undefined as never } },
      content,
      gid,
    );
    expect(broken[0]?.error).toBeTruthy();
    expect(broken[1]?.value).toBeNull();
  });
});
