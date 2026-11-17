// The records kernel (PK-M1-48): deeds and titles granted from conditions, counters and
// the codex, manual grants at settle points, the cosmetic rule, the codex ledger and its
// notes, letters sent, carried, read and answered, the pillar, the deed book view, and
// determinism (catalog_deeds_titles.md 1.3 to 2.12; ux_and_onboarding.md 6.3.1, 6.3.2,
// 6.3.8). Every engine here runs with the registry guard throwing on unregistered writes.

import { describe, expect, it } from 'vitest';
import type { ContentPack } from '../src/content/pack';
import { pack as invPack } from '../src/content/packs/inventory';
import { pack as recordsPack, validateRecords } from '../src/content/packs/records';
import { pack as worldPack } from '../src/content/packs/world';
import type {
  AnyWorldEvent,
  CommandKind,
  CommandMap,
  CommandSource,
  ContentMap,
  EventKind,
  FlagValue,
} from '../src/core/contracts';
import { Engine } from '../src/core/engine';
import { worldHash } from '../src/core/save/world_file';
import type { GameSystem, SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_HOUR } from '../src/core/time';
import { createGame } from '../src/game/create';
import { allSystems } from '../src/game/registry';
import { system as inventory } from '../src/systems/inventory';
import {
  type CodexEntryDef,
  codexPage,
  type DeedDef,
  deedBook,
  inbox,
  type LetterDef,
  type RecordsConfig,
  readRecords,
  system as records,
  type TitleDef,
} from '../src/systems/records';
import { spawnEntity, system as world } from '../src/systems/world';

// ---------------------------------------------------------------------------
// Fixtures

const DEEDS: DeedDef[] = [
  {
    id: 'deed_grow_alpha',
    name: '甲',
    cls: 'grow',
    act: 1,
    fame: 10,
    when: 'a1_guild_registered',
    reward: { title: 'title_guild_alpha' },
  },
  {
    id: 'deed_grow_manual',
    name: '乙',
    cls: 'grow',
    act: 1,
    fame: 10,
    manual: true,
    when: 'a1_ash_met',
  },
  {
    id: 'deed_hunt_kills',
    name: '丙',
    cls: 'hunt',
    act: 1,
    fame: 5,
    stat: { key: 'kills.grey_wolf', min: 2 },
  },
  {
    id: 'deed_col_held',
    name: '丁',
    cls: 'col',
    act: 1,
    fame: 5,
    held: ['wolf_fang', 'wolf_pelt'],
  },
  { id: 'deed_bond_met', name: '戊', cls: 'bond', act: 1, fame: 5, met: ['bron'] },
  {
    id: 'deed_hid_secret',
    name: '己',
    cls: 'hid',
    act: 1,
    fame: 10,
    hidden: true,
    when: 'a1_orphan_mark_seen',
  },
  {
    id: 'deed_feat_once',
    name: '庚',
    cls: 'feat',
    act: 1,
    fame: 0,
    feat: true,
    when: 'a1_martha_strike',
  },
  {
    id: 'deed_bond_branch',
    name: '辛',
    cls: 'bond',
    act: 1,
    fame: 25,
    when: 'a1_oola_fate == cleared',
    branch: { when: 'a1_oola_fate IN (convicted, fled, executed)' },
    reward: { pillar: true },
  },
  {
    id: 'deed_grow_meta',
    name: '壬',
    cls: 'grow',
    act: 1,
    fame: 10,
    when: 'deed.deed_grow_alpha AND deed.deed_hunt_kills',
    reward: { pillar: true },
  },
  { id: 'deed_grow_later', name: '癸', cls: 'grow', act: 3, fame: 10, when: 'a3_seal_aware' },
];

const TITLES: TitleDef[] = [
  {
    id: 'title_guild_alpha',
    name: '甲级',
    kind: 'office',
    family: 'guild',
    act: 1,
    grantedBy: '公会',
    visibleTo: '公会网络',
    loss: '不撤销',
  },
  {
    id: 'title_street_beta',
    name: '怪人',
    kind: 'common',
    family: 'street',
    act: 1,
    grantedBy: '街头',
    visibleTo: '边石镇',
    loss: '被取代',
    grant: { when: 'a1_guild_registered' },
    lose: { when: 'title.title_street_gamma' },
  },
  {
    id: 'title_street_gamma',
    name: '猎狼的',
    kind: 'common',
    family: 'street',
    act: 1,
    grantedBy: '街头',
    visibleTo: '边石镇',
    loss: '无',
    grant: { when: 'deed.deed_hunt_kills' },
  },
  {
    id: 'title_guild_lost',
    name: '临时职名',
    kind: 'office',
    family: 'guild',
    act: 1,
    grantedBy: '公会',
    visibleTo: '公会网络',
    loss: '玛莎出手之后撤销',
    grant: { when: 'a1_ash_met' },
    lose: { when: 'a1_martha_strike' },
  },
];

const CODEX: CodexEntryDef[] = [
  { id: 'cdx_bron_a', tab: 'people', subject: 'bron', source: 'seen', text: '空袖管', act: 1 },
  {
    id: 'cdx_bron_b',
    tab: 'people',
    subject: 'bron',
    source: 'talk',
    text: '认得门纹',
    when: 'a1_ash_met',
    act: 1,
  },
  { id: 'cdx_wolf', tab: 'monsters', subject: 'grey_wolf', source: 'mortal', text: '狼', act: 1 },
];

const LETTERS: LetterDef[] = [
  {
    id: 'ltr_a1_fast',
    act: 1,
    sender: 'bron',
    seal: 'private',
    subject: '快信',
    deliver: { when: 'a1_guild_registered' },
    body: [
      { id: 'p1', text: '开头' },
      { id: 'p2', text: '你', when: 'a1_tide_credit == player' },
      { id: 'p3', text: '玛莎', when: 'a1_tide_credit == martha' },
    ],
    attachments: [{ item: 'wolf_fang', count: 2 }],
    replies: [
      { id: 'r1', label: '好' },
      { id: 'r2', label: '见过了', when: 'a1_ash_met' },
    ],
  },
  {
    id: 'ltr_a1_slow',
    act: 1,
    senderName: '伯爵府',
    seal: 'official',
    subject: '慢信',
    transitHours: 2,
    deliver: { when: 'a1_ash_met' },
    body: [{ id: 'p1', text: '正文' }],
  },
];

const CONFIG: RecordsConfig = {
  pillar: {
    requires: 'feature.inner_court',
    tiers: [{ slots: 2 }, { slots: 3, when: 'a1_martha_strike' }],
  },
  stages: [
    { stage: 'carvings', fromAct: 0 },
    { stage: 'handbook', fromAct: 2 },
    { stage: 'register', fromAct: 4 },
    { stage: 'court', fromAct: 6 },
  ],
};

const FIXTURE: ContentPack = {
  id: 'records_fixture',
  tables: {
    deeds: DEEDS,
    titles: TITLES,
    codexEntries: CODEX,
    letters: LETTERS,
    recordsConfig: CONFIG,
    // the named person the codex and the met deed read (the codex lists named persons only)
    npcs: [{ id: 'bron', name: '布伦' }] as unknown as ContentMap['npcs'],
  },
};

function merge(packs: ContentPack[]): ContentMap {
  const out: Record<string, unknown> = {};
  for (const p of packs) {
    for (const [k, v] of Object.entries(p.tables)) {
      const prev = out[k];
      out[k] = Array.isArray(prev) && Array.isArray(v) ? [...prev, ...v] : v;
    }
  }
  return out as unknown as ContentMap;
}

/** A probe that runs queued callbacks inside a tick (guarded like any system). */
function makeProbe(): { system: GameSystem; run: (fn: (ctx: SystemContext) => void) => void } {
  const queue: ((ctx: SystemContext) => void)[] = [];
  return {
    system: {
      id: 'zz_probe',
      order: 999,
      tick(ctx) {
        for (const fn of queue.splice(0)) fn(ctx);
      },
    },
    run: (fn) => queue.push(fn),
  };
}

interface Rig {
  g: Engine;
  events: AnyWorldEvent[];
  /** set flags (script), then let the records settle */
  flags(values: Record<string, FlagValue>): void;
  /** run a callback in a tick, then let the records settle */
  inTick(fn: (ctx: SystemContext) => void): void;
  /** queue one command and return its result */
  cmd<K extends CommandKind>(
    kind: K,
    data: CommandMap[K],
    source?: CommandSource,
  ): { ok: boolean; code?: string; reason?: unknown; info?: unknown };
  of<K extends EventKind>(kind: K): AnyWorldEvent[];
}

function rig(content: ContentMap = merge([worldPack, invPack, FIXTURE]), seed = 3): Rig {
  const probe = makeProbe();
  const g = createGame({
    seed,
    content,
    systems: [world, inventory, records, probe.system],
    flagPolicy: 'throw',
  });
  const events: AnyWorldEvent[] = [];
  g.onEvents((evs) => events.push(...evs));
  const script: CommandSource = { type: 'script', script: 'test' };
  return {
    g,
    events,
    flags(values) {
      for (const [key, value] of Object.entries(values))
        g.queue('flag.set', { key, value }, script);
      g.step(2);
    },
    inTick(fn) {
      probe.run(fn);
      g.step(2);
    },
    cmd(kind, data, source = { type: 'player' }) {
      const before = events.length;
      g.queue(kind, data, source);
      g.step(1);
      const res = events
        .slice(before)
        .find((e) => e.kind === 'command.result' && e.data.kind === kind);
      if (res?.kind !== 'command.result') throw new Error(`no result for ${kind}`);
      g.step(1);
      return res.data;
    },
    of(kind) {
      return events.filter((e) => e.kind === kind);
    },
  };
}

const PLAYER = 'player';
const SCRIPT: CommandSource = { type: 'script', script: 'test' };

function kill(ctx: SystemContext, monsterId: string, killerId = PLAYER): void {
  ctx.emit('combat.kill', {
    killerId,
    killerSide: 'ally',
    victimId: `m_${monsterId}`,
    victimRef: monsterId,
    monsterId,
    rank: 'normal',
    level: 3,
    tier: 0,
    side: 'enemy',
    mapId: 'testfield',
  });
}

// ---------------------------------------------------------------------------

describe('deeds: granting from conditions and counters', () => {
  it('grants a condition deed once, with its mirror, event and reward title', () => {
    const r = rig();
    expect(readRecords(r.g.world)?.deeds.deed_grow_alpha).toBeUndefined();
    r.flags({ a1_guild_registered: true });
    const s = readRecords(r.g.world);
    expect(s?.deeds.deed_grow_alpha).toMatchObject({ grade: 'claimed' });
    expect(r.g.world.meta.flags['deed.deed_grow_alpha']).toBe(true);
    expect(r.g.world.meta.flags['title.title_guild_alpha']).toBe(true);
    expect(s?.titles.title_guild_alpha?.deed).toBe('deed_grow_alpha');
    expect(r.of('deed.granted').map((e) => e.data)).toEqual([
      { deedId: 'deed_grow_alpha', grade: 'claimed', fame: 10 },
    ]);
    // the street name of the same flag comes with it
    expect(s?.titles.title_street_beta).toBeDefined();
    // never granted twice
    r.flags({ a1_guild_registered: false });
    r.flags({ a1_guild_registered: true });
    expect(r.of('deed.granted')).toHaveLength(1);
  });

  it('counts kills of the player side per monster and grants the stat deed and its chain', () => {
    const r = rig();
    r.flags({ a1_guild_registered: true });
    r.inTick((ctx) => kill(ctx, 'grey_wolf'));
    expect(readRecords(r.g.world)?.deeds.deed_hunt_kills).toBeUndefined();
    // a kill by someone else does not count
    r.inTick((ctx) => kill(ctx, 'grey_wolf', 'stranger'));
    expect(readRecords(r.g.world)?.codex.monsters.grey_wolf?.count).toBe(1);
    r.inTick((ctx) => kill(ctx, 'grey_wolf'));
    const s = readRecords(r.g.world);
    expect(s?.codex.monsters.grey_wolf?.count).toBe(2);
    expect(s?.deeds.deed_hunt_kills).toBeDefined();
    // the meta deed over two deed flags and the title chain settle in the same tick
    expect(s?.deeds.deed_grow_meta?.tick).toBe(s?.deeds.deed_hunt_kills?.tick);
    expect(s?.titles.title_street_gamma).toBeDefined();
    expect(s?.titles.title_street_beta?.lost).toBe(s?.titles.title_street_gamma?.tick);
    expect(r.of('title.lost').map((e) => e.data)).toEqual([{ titleId: 'title_street_beta' }]);
  });

  it('grants a held deed once every item was held (even after it left the pack)', () => {
    const r = rig();
    r.inTick((ctx) => {
      ctx.emit('inventory.changed', {
        ownerId: PLAYER,
        itemId: 'wolf_fang',
        delta: 1,
        reason: 'loot',
      });
      ctx.emit('inventory.changed', {
        ownerId: PLAYER,
        itemId: 'wolf_fang',
        delta: -1,
        reason: 'sell',
      });
      ctx.emit('inventory.changed', {
        ownerId: 'npc_x',
        itemId: 'wolf_pelt',
        delta: 1,
        reason: 'loot',
      });
    });
    expect(readRecords(r.g.world)?.deeds.deed_col_held).toBeUndefined();
    r.inTick((ctx) => {
      ctx.emit('inventory.changed', {
        ownerId: PLAYER,
        itemId: 'wolf_pelt',
        delta: 3,
        reason: 'loot',
      });
    });
    const s = readRecords(r.g.world);
    expect(s?.codex.items.wolf_pelt?.count).toBe(3);
    expect(s?.deeds.deed_col_held).toBeDefined();
  });

  it('grants a met deed when the player talks to the person', () => {
    const r = rig();
    // an unnamed resident (no persona, or a template ref) gets no codex page
    r.inTick((ctx) => {
      ctx.emit('player.talked', { npcId: 'e_resident' });
      ctx.emit('player.talked', { npcId: 'e_res2', npcRef: 'tpl_farmer' });
    });
    expect(readRecords(r.g.world)?.codex.people).toEqual({});
    r.inTick((ctx) => ctx.emit('player.talked', { npcId: 'e_bron', npcRef: 'bron' }));
    const s = readRecords(r.g.world);
    expect(s?.codex.people.bron).toMatchObject({ count: 1, map: 'testfield' });
    expect(s?.deeds.deed_bond_met).toBeDefined();
  });
});

describe('deeds: manual grants, grades and the AI boundary', () => {
  it('grants a manual deed only from a system or a script, and only when its gate holds', () => {
    const r = rig();
    r.flags({ a1_ash_met: true });
    // the settle never grants a manual deed by itself
    expect(readRecords(r.g.world)?.deeds.deed_grow_manual).toBeUndefined();
    for (const source of [
      { type: 'player' },
      { type: 'ai', agentId: 'a', requestId: 'r' },
      { type: 'fallback', agentId: 'a', requestId: 'r' },
    ] as CommandSource[]) {
      expect(r.cmd('records.deed.grant', { deedId: 'deed_grow_manual' }, source).code).toBe(
        'not_allowed',
      );
    }
    expect(r.cmd('records.deed.grant', { deedId: 'deed_grow_alpha' }, SCRIPT).code).toBe(
      'not_manual',
    );
    expect(r.cmd('records.deed.grant', { deedId: 'deed_nope' }, SCRIPT).code).toBe('no_deed');
    const ok = r.cmd(
      'records.deed.grant',
      { deedId: 'deed_grow_manual', grade: 'witnessed' },
      SCRIPT,
    );
    expect(ok.ok).toBe(true);
    expect(readRecords(r.g.world)?.deeds.deed_grow_manual?.grade).toBe('witnessed');
    expect(r.cmd('records.deed.grant', { deedId: 'deed_grow_manual' }, SCRIPT).code).toBe(
      'already',
    );
  });

  it('rejects a manual grant whose gate does not hold yet', () => {
    const r = rig();
    expect(r.cmd('records.deed.grant', { deedId: 'deed_grow_manual' }, SCRIPT).code).toBe(
      'not_met',
    );
  });

  it('raises a grade, never lowers it', () => {
    const r = rig();
    r.flags({ a1_guild_registered: true });
    expect(
      r.cmd('records.deed.attest', { deedId: 'deed_grow_alpha', grade: 'corroborated' }, SCRIPT).ok,
    ).toBe(true);
    expect(
      r.cmd('records.deed.attest', { deedId: 'deed_grow_alpha', grade: 'claimed' }, SCRIPT).code,
    ).toBe('lower_grade');
    expect(
      r.cmd(
        'records.deed.attest',
        { deedId: 'deed_grow_alpha', grade: 'witnessed' },
        { type: 'player' },
      ).code,
    ).toBe('not_allowed');
    expect(readRecords(r.g.world)?.deeds.deed_grow_alpha?.grade).toBe('corroborated');
    expect(
      r.cmd('records.deed.attest', { deedId: 'deed_hunt_kills', grade: 'witnessed' }, SCRIPT).code,
    ).toBe('not_earned');
  });
});

describe('titles: wearing and losing', () => {
  it('wears an office title, refuses a street name and a lost title, and takes a lost one off', () => {
    const r = rig();
    r.flags({ a1_guild_registered: true, a1_ash_met: true });
    expect(r.cmd('records.title.wear', { titleId: 'title_street_beta' }).code).toBe('not_wearable');
    expect(r.cmd('records.title.wear', { titleId: 'title_street_gamma' }).code).toBe('not_held');
    expect(r.cmd('records.title.wear', { titleId: 'title_nope' }).code).toBe('no_title');
    // a model never dresses the player nor opens the player's mail
    for (const source of [
      { type: 'ai', agentId: 'a', requestId: 'r' },
      { type: 'fallback', agentId: 'a', requestId: 'r' },
    ] as CommandSource[]) {
      expect(r.cmd('records.title.wear', { titleId: 'title_guild_lost' }, source).code).toBe(
        'not_allowed',
      );
      expect(r.cmd('records.letter.read', { letterId: 'ltr_a1_fast' }, source).code).toBe(
        'not_allowed',
      );
    }
    expect(r.cmd('records.title.wear', { titleId: 'title_guild_lost' }).ok).toBe(true);
    expect(r.g.world.meta.flags['player.title']).toBe('title_guild_lost');
    r.flags({ a1_martha_strike: true });
    const s = readRecords(r.g.world);
    expect(s?.titles.title_guild_lost?.lost).toBeDefined();
    expect(r.g.world.meta.flags['title.title_guild_lost.lost']).toBe(true);
    expect(s?.worn).toBeNull();
    expect(r.g.world.meta.flags['player.title']).toBe('none');
    const lost = r.cmd('records.title.wear', { titleId: 'title_guild_lost' });
    expect(lost.code).toBe('title_lost');
    expect(lost.reason).toEqual({
      key: 'sys.records.reject.title_lost',
      params: { loss: { key: 'c.titles.title_guild_lost.loss' } },
    });
    // the mirror stays true: the title was granted once (registry: a monotone flag)
    expect(r.g.world.meta.flags['title.title_guild_lost']).toBe(true);
    expect(r.cmd('records.title.wear', { titleId: 'title_guild_alpha' }).ok).toBe(true);
    expect(r.cmd('records.title.wear', { titleId: null }).ok).toBe(true);
    expect(readRecords(r.g.world)?.worn).toBeNull();
    expect(r.of('title.worn').map((e) => e.data)).toEqual([
      { titleId: 'title_guild_lost' },
      { titleId: null },
      { titleId: 'title_guild_alpha' },
      { titleId: null },
    ]);
  });
});

describe('the pillar', () => {
  it('opens with the inner court, carves only earned carvable deeds and grows by tier', () => {
    const r = rig();
    r.flags({ a1_guild_registered: true, a1_oola_fate: 'cleared' });
    expect(r.cmd('records.pillar.carve', { deedId: 'deed_bond_branch' }).code).toBe(
      'pillar_locked',
    );
    r.flags({ 'feature.inner_court': true });
    expect(r.cmd('records.pillar.carve', { deedId: 'deed_grow_alpha' }).code).toBe('not_carvable');
    expect(r.cmd('records.pillar.carve', { deedId: 'deed_grow_meta' }).code).toBe('not_earned');
    expect(r.cmd('records.pillar.carve', { deedId: 'deed_bond_branch', slot: 2 }).code).toBe(
      'bad_slot',
    );
    expect(r.cmd('records.pillar.carve', { deedId: 'deed_bond_branch', slot: 1 }).ok).toBe(true);
    expect(readRecords(r.g.world)?.pillar).toEqual([null, 'deed_bond_branch']);
    // carving it again without a slot moves it to the first free slot
    expect(r.cmd('records.pillar.carve', { deedId: 'deed_bond_branch' }).ok).toBe(true);
    expect(readRecords(r.g.world)?.pillar).toEqual(['deed_bond_branch', null]);
    r.inTick((ctx) => {
      kill(ctx, 'grey_wolf');
      kill(ctx, 'grey_wolf');
    });
    expect(r.cmd('records.pillar.carve', { deedId: 'deed_grow_meta' }).ok).toBe(true);
    expect(deedBook(r.g.world, r.g.content).pillar).toEqual({
      slots: 2,
      carved: ['deed_bond_branch', 'deed_grow_meta'],
    });
    expect(r.cmd('records.pillar.carve', { deedId: null, slot: 0 }).ok).toBe(true);
    expect(readRecords(r.g.world)?.pillar).toEqual([null, 'deed_grow_meta']);
    r.flags({ a1_martha_strike: true });
    expect(deedBook(r.g.world, r.g.content).pillar.slots).toBe(3);
  });

  it('reports a full pillar', () => {
    const content = merge([
      worldPack,
      invPack,
      {
        ...FIXTURE,
        tables: {
          ...FIXTURE.tables,
          recordsConfig: { ...CONFIG, pillar: { tiers: [{ slots: 1 }] } },
        },
      },
    ]);
    const r = rig(content);
    r.flags({ a1_guild_registered: true, a1_oola_fate: 'cleared' });
    r.inTick((ctx) => {
      kill(ctx, 'grey_wolf');
      kill(ctx, 'grey_wolf');
    });
    expect(r.cmd('records.pillar.carve', { deedId: 'deed_bond_branch' }).ok).toBe(true);
    expect(r.cmd('records.pillar.carve', { deedId: 'deed_grow_meta' }).code).toBe('pillar_full');
  });
});

describe('the deed book view (catalog 1.4, 2.11)', () => {
  it('hides unearned hidden deeds and later acts, counts feats and branches only once earned', () => {
    const r = rig();
    r.flags({ act: 'act1' });
    let book = deedBook(r.g.world, r.g.content);
    expect(book.stage).toBe('carvings');
    expect(book.deeds.map((d) => d.id)).not.toContain('deed_hid_secret');
    expect(book.deeds.map((d) => d.id)).not.toContain('deed_grow_later');
    // alpha, manual, kills, held, met, meta are counted; feat, branch and hidden are not
    expect(book.progress).toEqual({ earned: 0, of: 6 });
    // an unearned deed shows no name yet (ux 6.3.1)
    expect(book.deeds.find((d) => d.id === 'deed_grow_alpha')).toMatchObject({
      name: null,
      desc: null,
      earnedTick: null,
    });
    r.flags({ a1_orphan_mark_seen: true, a1_martha_strike: true, a1_oola_fate: 'fled' });
    book = deedBook(r.g.world, r.g.content);
    expect(book.deeds.find((d) => d.id === 'deed_hid_secret')?.earnedTick).not.toBeNull();
    expect(book.deeds.find((d) => d.id === 'deed_feat_once')).toMatchObject({
      feat: true,
      fame: 0,
    });
    expect(book.deeds.find((d) => d.id === 'deed_bond_branch')?.branchMissing).toBe(true);
    expect(book.progress).toEqual({ earned: 1, of: 7 });
    expect(book.fame).toBe(10);
    expect(book.deeds[0]?.name).toEqual({ key: 'c.deeds.deed_hid_secret.name' });
    // an earned branch deed counts like any other
    r.flags({ a1_oola_fate: 'cleared' });
    book = deedBook(r.g.world, r.g.content);
    expect(book.deeds.find((d) => d.id === 'deed_bond_branch')).toMatchObject({
      branchMissing: false,
      name: { key: 'c.deeds.deed_bond_branch.name' },
    });
    expect(book.progress).toEqual({ earned: 2, of: 8 });
    expect(book.fame).toBe(35);
    r.flags({ act: 'act4' });
    expect(deedBook(r.g.world, r.g.content).stage).toBe('register');
  });
});

describe('the codex (ux 6.3.2)', () => {
  it('discovers subjects from facts and mirrors, and notes once the subject is known', () => {
    const r = rig();
    r.flags({ a1_ash_met: true });
    // the subject is unknown: no note yet, even with its condition true
    expect(readRecords(r.g.world)?.notes.cdx_bron_b).toBeUndefined();
    r.inTick((ctx) => ctx.emit('player.talked', { npcId: 'e_bron', npcRef: 'bron' }));
    r.flags({ 'read.lore_h04': true, 'scene.a1_count_letter.seen': true, 'col.col_x.done': true });
    const s = readRecords(r.g.world);
    expect(Object.keys(s?.notes ?? {}).sort()).toEqual(['cdx_bron_a', 'cdx_bron_b']);
    expect(Object.keys(s?.codex.books ?? {})).toEqual(['lore_h04']);
    expect(Object.keys(s?.codex.memories ?? {})).toEqual(['a1_count_letter']);
    expect(Object.keys(s?.codex.collections ?? {})).toEqual(['col_x']);
    const people = codexPage(r.g.world, r.g.content, 'people');
    expect(people.map((p) => [p.id, p.notes.map((n) => n.id)])).toEqual([
      ['bron', ['cdx_bron_a', 'cdx_bron_b']],
    ]);
    expect(people[0]?.notes[0]?.text).toEqual({ key: 'c.codex_entries.cdx_bron_a.text' });
    expect(r.cmd('records.codex.discover', { tab: 'creatures', subject: 'pet_x' }).code).toBe(
      'not_allowed',
    );
    expect(r.cmd('records.codex.discover', { tab: 'creatures', subject: 'pet_x' }, SCRIPT).ok).toBe(
      true,
    );
    expect(codexPage(r.g.world, r.g.content, 'creatures').map((c) => c.id)).toEqual(['pet_x']);
  });
});

describe('letters (ux 6.3.8)', () => {
  it('delivers at once, freezes the body at sending time, reads, answers and hands over once', () => {
    const r = rig();
    r.flags({ a1_tide_credit: 'martha' });
    r.flags({ a1_guild_registered: true });
    const s = readRecords(r.g.world);
    expect(s?.letters.ltr_a1_fast).toMatchObject({ state: 'delivered', body: ['p1', 'p3'] });
    expect(r.g.world.meta.flags['letter.ltr_a1_fast']).toBe('delivered');
    // the world moves on, the letter does not
    r.flags({ a1_tide_credit: 'player' });
    expect(readRecords(r.g.world)?.letters.ltr_a1_fast?.body).toEqual(['p1', 'p3']);
    let view = inbox(r.g.world, r.g.content);
    expect(view[0]?.body).toEqual([
      { key: 'c.letters.ltr_a1_fast.body.p1.text' },
      { key: 'c.letters.ltr_a1_fast.body.p3.text' },
    ]);
    expect(view[0]?.sender).toEqual({ key: 'c.npcs.bron.name' });
    expect(view[0]?.replies.map((x) => x.id)).toEqual(['r1']);
    expect(r.cmd('records.letter.reply', { letterId: 'ltr_a1_fast', optionId: 'r2' }).code).toBe(
      'no_option',
    );
    expect(r.cmd('records.letter.read', { letterId: 'ltr_a1_fast' }).ok).toBe(true);
    expect(r.g.world.meta.flags['letter.ltr_a1_fast']).toBe('read');
    const take = () => r.cmd('records.letter.take', { letterId: 'ltr_a1_fast' });
    expect(take().ok).toBe(true);
    expect(take().code).toBe('already_taken');
    expect(r.g.world.slices.inventory.owners[PLAYER]?.items.wolf_fang).toBe(2);
    expect(r.cmd('records.letter.reply', { letterId: 'ltr_a1_fast', optionId: 'r1' }).ok).toBe(
      true,
    );
    expect(r.g.world.meta.flags['letter.ltr_a1_fast']).toBe('replied');
    expect(r.g.world.meta.flags['letter.ltr_a1_fast.reply']).toBe('r1');
    expect(r.cmd('records.letter.reply', { letterId: 'ltr_a1_fast', optionId: 'r1' }).code).toBe(
      'already_replied',
    );
    view = inbox(r.g.world, r.g.content);
    expect(view[0]).toMatchObject({ state: 'replied', reply: 'r1', replies: [], taken: true });
  });

  it('carries a letter on the road for its transit hours before the inbox shows it', () => {
    const r = rig();
    r.flags({ a1_ash_met: true });
    const sent = readRecords(r.g.world)?.letters.ltr_a1_slow;
    expect(sent?.state).toBe('transit');
    expect(sent ? sent.arrives - sent.sent : 0).toBe(2 * TICKS_PER_GAME_HOUR);
    expect(r.g.world.meta.flags['letter.ltr_a1_slow']).toBe('transit');
    expect(r.cmd('records.letter.read', { letterId: 'ltr_a1_slow' }).code).toBe('no_letter');
    expect(inbox(r.g.world, r.g.content).map((l) => l.id)).toEqual([]);
    r.g.step((sent?.arrives ?? 0) - r.g.tick - 1);
    expect(readRecords(r.g.world)?.letters.ltr_a1_slow?.state).toBe('transit');
    r.g.step(1);
    expect(readRecords(r.g.world)?.letters.ltr_a1_slow).toMatchObject({
      state: 'delivered',
      delivered: sent?.arrives,
    });
    expect(inbox(r.g.world, r.g.content)[0]).toMatchObject({
      id: 'ltr_a1_slow',
      sender: { key: 'c.letters.ltr_a1_slow.sender_name' },
      seal: 'official',
    });
    expect(r.of('letter.sent').map((e) => e.data)).toEqual([
      { letterId: 'ltr_a1_slow', arrives: sent?.arrives },
    ]);
  });
});

describe('the settle reads what it watches (catalog 1.3)', () => {
  const EXTRA: ContentPack = {
    id: 'records_extra',
    tables: {
      deeds: [
        {
          id: 'deed_bond_letter',
          name: '回了信',
          cls: 'bond',
          act: 1,
          fame: 5,
          when: 'letter.ltr_a1_fast.reply == r1',
        },
        {
          id: 'deed_mortal_superseded',
          name: '换了个叫法',
          cls: 'mortal',
          act: 1,
          fame: 5,
          when: 'title.title_street_beta.lost',
        },
        {
          id: 'deed_grow_read',
          name: '读了信',
          cls: 'grow',
          act: 1,
          fame: 5,
          when: 'letter.ltr_a1_fast IN (read, replied)',
        },
        {
          id: 'deed_hunt_total',
          name: '三只',
          cls: 'hunt',
          act: 1,
          fame: 5,
          stat: { key: 'kills', min: 3 },
        },
        {
          id: 'deed_col_people',
          name: '见过人',
          cls: 'col',
          act: 1,
          fame: 5,
          stat: { key: 'codex.people', min: 1 },
        },
      ] as DeedDef[],
    },
  };
  const content = () => merge([worldPack, invPack, FIXTURE, EXTRA]);

  it('grants deeds that read the letter and lost-title mirrors and the records counters', () => {
    const r = rig(content());
    r.flags({ a1_guild_registered: true });
    expect(r.cmd('records.letter.read', { letterId: 'ltr_a1_fast' }).ok).toBe(true);
    r.g.step(1);
    expect(readRecords(r.g.world)?.deeds.deed_grow_read).toBeDefined();
    expect(readRecords(r.g.world)?.deeds.deed_bond_letter).toBeUndefined();
    expect(r.cmd('records.letter.reply', { letterId: 'ltr_a1_fast', optionId: 'r1' }).ok).toBe(
      true,
    );
    r.g.step(1);
    expect(readRecords(r.g.world)?.deeds.deed_bond_letter).toBeDefined();
    r.inTick((ctx) => {
      kill(ctx, 'grey_wolf');
      kill(ctx, 'grey_wolf');
    });
    expect(readRecords(r.g.world)?.deeds.deed_hunt_total).toBeUndefined();
    expect(readRecords(r.g.world)?.deeds.deed_mortal_superseded).toBeDefined();
    r.inTick((ctx) => kill(ctx, 'dian_wolf'));
    expect(readRecords(r.g.world)?.deeds.deed_hunt_total).toBeDefined();
    expect(readRecords(r.g.world)?.deeds.deed_col_people).toBeUndefined();
    r.inTick((ctx) => ctx.emit('player.talked', { npcId: 'e_bron', npcRef: 'bron' }));
    expect(readRecords(r.g.world)?.deeds.deed_col_people).toBeDefined();
  });

  it('wakes on a flag a records condition reads, not on any other', () => {
    const r = rig(content());
    r.g.step(2);
    expect(readRecords(r.g.world)?.dirty).toBe(false);
    r.g.queue('flag.set', { key: 'a2_reynard_letter', value: true }, SCRIPT);
    r.g.step(1);
    expect(readRecords(r.g.world)?.dirty).toBe(false);
    r.g.queue('flag.set', { key: 'a1_martha_strike', value: true }, SCRIPT);
    r.g.step(1);
    expect(readRecords(r.g.world)?.dirty).toBe(true);
    r.g.step(1);
    expect(readRecords(r.g.world)?.dirty).toBe(false);
    expect(readRecords(r.g.world)?.deeds.deed_feat_once).toBeDefined();
  });
});

describe('the codex: monsters met in a fight', () => {
  it('lists a monster the player side fought before any kill, with its notes', () => {
    const r = rig();
    let wolf = '';
    r.inTick((ctx) => {
      wolf = spawnEntity(ctx, {
        kind: 'monster',
        name: '灰毛狼',
        mapId: 'testfield',
        x: 3,
        y: 2,
        faction: 'beast',
        appearance: { base: 'wolf', colors: ['#555555'] },
        ref: 'grey_wolf',
      }).id;
    });
    const hit = (sourceId: string, targetId: string) => (ctx: SystemContext) =>
      ctx.emit('combat.damage', {
        sourceId,
        targetId,
        amount: 3,
        absorbed: 0,
        school: 'physical' as never,
        outcome: 'hit' as never,
      });
    // a fight with no one of the player's side shows nothing
    r.inTick(hit('stranger', wolf));
    expect(readRecords(r.g.world)?.codex.monsters).toEqual({});
    r.inTick(hit(wolf, PLAYER));
    const s = readRecords(r.g.world);
    expect(s?.codex.monsters.grey_wolf?.count).toBe(0);
    expect(s?.notes.cdx_wolf).toBeDefined();
    r.inTick((ctx) => kill(ctx, 'grey_wolf'));
    expect(readRecords(r.g.world)?.codex.monsters.grey_wolf?.count).toBe(1);
  });
});

describe('time skips and replays', () => {
  it('settles and carries the mail through hour-coarse skip steps', () => {
    let coarse = 0;
    const clock: GameSystem = {
      id: 'zz_clock',
      order: 998,
      clock: () => (coarse > 0 ? { stride: TICKS_PER_GAME_HOUR, hold: null } : null),
      skip: () => {
        coarse--;
      },
    };
    const g = createGame({
      seed: 4,
      content: merge([worldPack, invPack, FIXTURE]),
      systems: [world, inventory, records, clock],
      flagPolicy: 'throw',
    });
    g.queue('flag.set', { key: 'a1_ash_met', value: true }, SCRIPT);
    g.step(1);
    coarse = 3;
    g.step(1);
    // the first coarse step settled: the slow letter is on the road
    const sent = readRecords(g.world)?.letters.ltr_a1_slow;
    expect(sent?.state).toBe('transit');
    while (coarse > 0) g.step(1);
    expect(readRecords(g.world)?.letters.ltr_a1_slow?.state).toBe('delivered');
    expect(readRecords(g.world)?.letters.ltr_a1_slow?.delivered).toBeGreaterThanOrEqual(
      sent?.arrives ?? 0,
    );
  });

  it('a replay of the command log reaches the same world', () => {
    const r = rig();
    r.flags({ a1_guild_registered: true, a1_ash_met: true, a1_tide_credit: 'martha' });
    r.cmd('records.title.wear', { titleId: 'title_guild_alpha' });
    r.cmd('records.letter.read', { letterId: 'ltr_a1_fast' });
    r.cmd('records.letter.reply', { letterId: 'ltr_a1_fast', optionId: 'r1' });
    r.cmd('records.deed.grant', { deedId: 'deed_grow_manual', grade: 'witnessed' }, SCRIPT);
    r.g.step(3 * TICKS_PER_GAME_HOUR);
    const replay = Engine.replay(3, r.g.content, r.g.systems, r.g.world.log);
    replay.step(r.g.tick);
    expect(replay.tick).toBe(r.g.tick);
    expect(readRecords(replay.world)?.deeds.deed_grow_manual?.grade).toBe('witnessed');
    expect(worldHash(replay.world)).toBe(worldHash(r.g.world));
  });
});

describe('determinism', () => {
  const script = (r: Rig) => {
    r.flags({ a1_guild_registered: true, a1_ash_met: true, a1_tide_credit: 'player' });
    r.inTick((ctx) => {
      kill(ctx, 'grey_wolf');
      kill(ctx, 'grey_wolf');
      ctx.emit('player.talked', { npcId: 'e_bron', npcRef: 'bron' });
    });
    r.cmd('records.title.wear', { titleId: 'title_guild_alpha' });
    r.g.step(3 * TICKS_PER_GAME_HOUR);
  };

  it('two runs of the same script reach the same world', () => {
    const a = rig();
    const b = rig();
    script(a);
    script(b);
    expect(worldHash(a.g.world)).toBe(worldHash(b.g.world));
    expect(readRecords(a.g.world)?.letters.ltr_a1_slow?.state).toBe('delivered');
  });
});

describe('the content rules (cosmetic only, references, conditions)', () => {
  it('accepts the shipped records and the fixtures', () => {
    expect(validateRecords(merge([recordsPack]))).toEqual([]);
    expect(validateRecords(merge([FIXTURE]))).toEqual([]);
  });

  it('refuses any power on a deed or a title, and broken records', () => {
    const bad = merge([
      {
        id: 'bad',
        tables: {
          deeds: [
            { ...DEEDS[0], stats: { str: 1 } },
            { ...DEEDS[1], id: 'deed_war_x', cls: 'grow' },
            {
              ...DEEDS[0],
              id: 'deed_grow_y',
              reward: { title: 'title_missing', abilities: ['sk_x'] },
            },
            { id: 'deed_grow_z', name: 'z', cls: 'grow', act: 1, fame: 7 },
            { ...DEEDS[0], id: 'deed_grow_w', when: 'a1_guild_registered AND', feat: true },
          ] as unknown as DeedDef[],
          titles: [{ ...TITLES[0], effects: [{ type: 'stat' }] }] as unknown as TitleDef[],
          letters: [{ ...LETTERS[0], senderName: '也有名字' }],
          codexEntries: [{ ...CODEX[0], tab: 'places' }] as unknown as CodexEntryDef[],
        },
      },
    ]);
    const problems = validateRecords(bad).join('\n');
    expect(problems).toContain('field stats is not a deed field');
    expect(problems).toContain('deed deed_war_x: id does not start with deed_grow_');
    expect(problems).toContain('reward abilities is not a deed reward');
    expect(problems).toContain('unknown title title_missing');
    expect(problems).toContain('deed deed_grow_z: fame 7 is not a band');
    expect(problems).toContain('deed deed_grow_z: no trigger');
    expect(problems).toContain('deed deed_grow_w when');
    expect(problems).toContain('deed deed_grow_w: a feat has fame 0');
    expect(problems).toContain('field effects is not a title field');
    expect(problems).toContain('needs one of sender and senderName');
    expect(problems).toContain('bad tab places');
  });

  it('changes nothing outside the records and their own mirrors when it grants', () => {
    const r = rig();
    const outside = () => {
      const slices = { ...(r.g.world.slices as unknown as Record<string, unknown>) };
      delete slices.records;
      const flags = Object.entries(r.g.world.meta.flags).filter(
        ([k]) =>
          !k.startsWith('deed.') &&
          !k.startsWith('title.') &&
          !k.startsWith('letter.') &&
          k !== 'player.title',
      );
      return JSON.stringify([slices, flags]);
    };
    r.g.step(2);
    // the facts land, the settle has not run yet
    r.g.queue('flag.set', { key: 'a1_guild_registered', value: true }, SCRIPT);
    r.g.queue('flag.set', { key: 'a1_ash_met', value: true }, SCRIPT);
    r.g.step(1);
    expect(readRecords(r.g.world)?.dirty).toBe(true);
    const before = outside();
    const granted = r.of('deed.granted').length;
    r.g.step(1);
    expect(r.of('deed.granted').length).toBeGreaterThan(granted);
    expect(r.of('title.granted').length).toBeGreaterThan(0);
    expect(outside()).toBe(before);
  });
});

describe('the game registry', () => {
  it('discovers the records system at phase 85 with its slice owner hooks', () => {
    const sys = allSystems().find((s) => s.id === 'records') as
      | (GameSystem & { validateSlice?: unknown; idFields?: unknown })
      | undefined;
    expect(sys?.order).toBe(85);
    expect(typeof sys?.validateSlice).toBe('function');
    expect(Array.isArray(sys?.idFields)).toBe(true);
    expect(typeof sys?.skip).toBe('function');
  });
});
