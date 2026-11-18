// What talk now carries besides topics (PK-M1-19): the persuade option of the quest model,
// residents' requests turned into personal commissions and the leaders' weekly posting,
// the dialogue options of the NPC reaction table, and the cognition sources that were
// missing (authority, the close repeat, identity exposure from talk and trials).

import { describe, expect, it } from 'vitest';
import type { ContentMap } from '../src/core/contracts';
import type { SystemContext } from '../src/core/system';
import { tickAtDay } from '../src/core/time';
import { newBelief } from '../src/systems/cognition/belief';
import { receive, seedRumor } from '../src/systems/cognition/rumor';
import { authorityWeight, creditsGuestClaim, vouchWeight } from '../src/systems/cognition/sources';
import { currentConversation } from '../src/systems/dialogue';
import {
  isLeader,
  leaderPostUtility,
  leadersPlan,
  unmetNeed,
} from '../src/systems/dialogue/commissions';
import { settleDone } from '../src/systems/guild';
import { addMoney, holdingOf } from '../src/systems/inventory';
import { npcEntityId } from '../src/systems/npc';
import { personaById } from '../src/systems/npc/personas';
import type { NpcState } from '../src/systems/npc/types';
import type { QuestDef } from '../src/systems/quests';
import { questDefOf } from '../src/systems/quests/instances';
import { getEntity } from '../src/systems/world';
import {
  besides,
  collect,
  FULL,
  game,
  keyOf,
  runInTick,
  setFlags,
  talkTo,
} from './dialogue_topics_harness';

const questTurnIn = (g: ReturnType<typeof game>, id: string) =>
  questDefOf({ content: g.content, world: g.world } as never, id)?.turnIn;
const options = (g: ReturnType<typeof game>) =>
  currentConversation(g.world)?.options.map((o) => o.id) ?? [];
const lastNpcLine = (g: ReturnType<typeof game>) =>
  currentConversation(g.world)
    ?.lines.filter((l) => l.speakerId !== 'player')
    .at(-1)?.text;

// ---------------------------------------------------------------------------
// persuasion

const PERSUADE: QuestDef = {
  id: 'zz_persuade_nera',
  act: 'act1',
  kind: 'side',
  title: 'x',
  desc: 'x',
  trigger: 'zz_on_persuade',
  stages: [
    {
      id: 'talk',
      desc: 'x',
      objectives: [
        { type: 'persuade', npc: 'nera', when: 'trust.nera >= 55 AND zz_proof', label: 'x' },
      ],
    },
  ],
} as unknown as QuestDef;

describe('persuasion in talk (6.4 row 37; quests_and_events 5)', () => {
  const content = { ...FULL, quests: [...FULL.quests, PERSUADE] } as ContentMap;

  it('offers persuade while an objective waits on the person and judges it by the threshold', () => {
    const g = game(content);
    besides(g, 'nera');
    setFlags(g, { zz_on_persuade: true, 'trust.nera': 60 });
    g.step(2);
    expect(g.world.slices.quests.quests.zz_persuade_nera?.status).toBe('active');
    const events = collect(g);
    g.queue('dialogue.talk', { npcId: npcEntityId('nera') });
    g.step(1);
    expect(options(g)).toContain('persuade');
    g.queue('dialogue.choose', { optionId: 'persuade' });
    g.step(2);
    expect(keyOf(lastNpcLine(g))).toMatch(/react_unpersuaded/);
    expect(events.filter((e) => e.kind === 'dialogue.persuaded').map((e) => e.data)).toEqual([
      { npcId: npcEntityId('nera'), npcRef: 'nera', ok: false },
    ]);
    expect(g.world.slices.quests.quests.zz_persuade_nera?.status).toBe('active');
    setFlags(g, { zz_proof: true });
    // the free-text way: words the classifier reads as persuading are the attempt
    g.queue('dialogue.say', { text: '听我说，你应该再想想，别这样做。' });
    g.step(3);
    expect(keyOf(lastNpcLine(g))).toMatch(/react_persuaded/);
    expect(g.world.slices.quests.quests.zz_persuade_nera?.status).toBe('done');
    expect(options(g)).not.toContain('persuade');
  });

  it('offers nothing to someone the player has no objective on', () => {
    const g = game(content);
    talkTo(g, 'ron');
    expect(options(g)).not.toContain('persuade');
  });
});

// ---------------------------------------------------------------------------
// requests and leaders

describe('residents ask, leaders post (quests_and_events 6.2; builtin_ai 9.6)', () => {
  it('maps an unmet need to a request template, or to nothing', () => {
    const rules = FULL.dialogueCommissions.requests;
    const st = { needs: { money: 30, safety: 70, duty: 45, peace: 60 } } as unknown as NpcState;
    expect(unmetNeed(rules, st)).toBe('money');
    expect(
      unmetNeed(rules, {
        needs: { money: 80, safety: 90, duty: 90, peace: 90 },
      } as unknown as NpcState),
    ).toBeNull();
  });

  it("turns a giver's trouble into a personal commission the player takes in the talk", () => {
    const g = game();
    besides(g, 'greta');
    g.step(1200); // an hour: the boards open for act 1
    runInTick(g, (ctx) => {
      const st = ctx.world.slices.npc.npcs.greta;
      if (st) st.needs.money = 20;
    });
    besides(g, 'greta');
    g.queue('dialogue.talk', { npcId: npcEntityId('greta') });
    g.step(1);
    g.queue('dialogue.say', { text: '需要帮忙吗？我可以帮你。' });
    g.step(2);
    expect(options(g)).toEqual(expect.arrayContaining(['request:yes', 'request:no']));
    const posting = Object.values(g.world.slices.guild.postings).find((p) => p.personal);
    expect(posting?.giver).toBe('greta');
    expect(posting?.template).toBe('cmm_a1_lost_item');
    // a fifth of what she can spare at most, and no guild cut
    const purse = holdingOf(g.world, npcEntityId('greta')).money;
    expect(posting?.reward).toBeLessThanOrEqual(Math.floor(purse * 0.2));
    expect(posting?.cut).toBe(0);
    g.queue('dialogue.say', { text: '好。' });
    g.step(2);
    expect(g.world.slices.guild.postings[posting?.id ?? '']?.state).toBe('accepted');
    expect(g.world.slices.quests.quests[posting?.id ?? '']?.status).toBe('active');
    expect(options(g)).not.toContain('request:yes');
    // turned in to Greta, paid out of her purse, and she warms to the player
    const id = posting?.id ?? '';
    expect(questTurnIn(g, id)).toBe('greta');
    const gretaBefore = holdingOf(g.world, npcEntityId('greta')).money;
    const playerBefore = holdingOf(g.world, 'player').money;
    const likeBefore = g.world.slices.npc.minds.greta?.rel.player?.like ?? 0;
    runInTick(g, (ctx) => settleDone(ctx, id));
    g.step(1);
    const reward = posting?.reward ?? 0;
    expect(holdingOf(g.world, npcEntityId('greta')).money).toBe(gretaBefore - reward);
    expect(holdingOf(g.world, 'player').money).toBe(playerBefore + reward);
    expect(g.world.slices.npc.minds.greta?.rel.player?.like).toBeGreaterThan(likeBefore);
    // no guild merit for a personal request
    expect(g.world.slices.guild.member?.done ?? {}).toEqual({});
  });

  it('weighs posting against keeping things as they are, by the threat', () => {
    const rules = FULL.dialogueCommissions.leaders;
    expect(leaderPostUtility(rules, 10, true).post).toBeLessThan(rules.keep);
    expect(leaderPostUtility(rules, 80, true).post).toBeGreaterThan(rules.keep);
    expect(leaderPostUtility(rules, 80, false).post).toBeLessThan(
      leaderPostUtility(rules, 80, true).post,
    );
  });

  it('a leader posts one of their templates on the weekly beat once the threat is up', () => {
    const g = game();
    runInTick(g, (ctx) => {
      expect(isLeader(ctx, 'bron')).toBe(true);
      expect(isLeader(ctx, 'ron')).toBe(false);
    });
    // the magistrate gives the bandit writ on the notice board: the planning hour of a week
    setFlags(g, { act: 'act1', seal_unrest: 10 });
    // day 0 is the first day of a week; the boards open on the hourly settle before 08:00
    g.step(tickAtDay(0, 8, 30) - g.tick);
    const fresh = (ctx: SystemContext) => {
      const s = ctx.world.slices.guild;
      for (const [id, p] of Object.entries(s.postings))
        if (p.template === 'cmm_a1_bandit_writ') delete s.postings[id];
    };
    runInTick(g, (ctx) => {
      fresh(ctx);
      // a calm region: keeping things as they are wins (the act clock moves the unrest daily)
      ctx.setFlag('seal_unrest', 10);
      expect(leadersPlan(ctx).filter((p) => p.giver === 'moss')).toEqual([]);
      ctx.setFlag('seal_unrest', 80);
      const posted = leadersPlan(ctx).filter((p) => p.giver === 'moss');
      expect(posted.map((p) => p.template)).toEqual(['cmm_a1_bandit_writ']);
    });
    // outside the beat nothing is planned
    g.step(1200);
    runInTick(g, (ctx) => {
      fresh(ctx);
      expect(leadersPlan(ctx)).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// reaction rows

describe('dialogue options of the reaction table (5.6 rows 4, 5, 6, 8, 9)', () => {
  it("offers an exploiting trader's options for a few days and carries out the choice", () => {
    const g = game();
    besides(g, 'nera');
    runInTick(g, (ctx) => {
      ctx.emit('npc.reaction', {
        npcId: 'nera',
        row: 'belief_exploit',
        eventKind: 'feat_seen',
        subject: 'player',
      });
    });
    g.queue('dialogue.talk', { npcId: npcEntityId('nera') });
    g.step(1);
    expect(options(g)).toEqual(
      expect.arrayContaining([
        'react:belief_exploit:deal',
        'react:belief_exploit:hush',
        'react:belief_exploit:refuse',
      ]),
    );
    // the hush money: not enough on the player, nothing happens
    runInTick(g, (ctx) => {
      const pid = ctx.world.slices.world.playerId;
      addMoney(ctx, pid, -holdingOf(ctx.world, pid).money, 'test');
    });
    g.queue('dialogue.choose', { optionId: 'react:belief_exploit:hush' });
    g.step(2);
    expect(options(g)).toContain('react:belief_exploit:deal');
    const before = g.world.slices.npc.minds.nera?.rel.player?.trust ?? 0;
    g.queue('dialogue.choose', { optionId: 'react:belief_exploit:deal' });
    g.step(2);
    expect(g.world.slices.npc.minds.nera?.rel.player?.trust).toBeGreaterThan(before);
    expect(options(g).some((id) => id.startsWith('react:'))).toBe(false);
  });

  it('a reaction older than three days is no longer offered', () => {
    const g = game();
    besides(g, 'nera');
    runInTick(g, (ctx) =>
      ctx.emit('npc.reaction', {
        npcId: 'nera',
        row: 'challenge',
        eventKind: 'identity_matched',
        subject: 'player',
      }),
    );
    g.step(4 * 28800);
    besides(g, 'nera', 4);
    g.queue('dialogue.talk', { npcId: npcEntityId('nera') });
    g.step(1);
    expect(options(g).some((id) => id.startsWith('react:'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cognition sources

describe('authority evidence (reputation_and_cognition 3.1, 4.4, 6.1)', () => {
  it("weighs an authority's word by who they are and who listens", () => {
    const src = FULL.cognitionSources;
    const p = (id: string) => personaById(FULL, id);
    expect(authorityWeight(src, p('bron'), p('ron'))).toBe(3);
    expect(authorityWeight(src, p('moss'), p('ron'))).toBe(3);
    expect(authorityWeight(src, p('ron'), p('lina'))).toBe(2); // an officer
    expect(authorityWeight(src, p('lina'), p('ron'))).toBe(0);
    // a priest's word weighs more with the devout, never past the cap
    const devout = { ...p('lina'), devotion: 0.9 } as NonNullable<ReturnType<typeof p>>;
    expect(authorityWeight(src, p('cassian'), devout)).toBe(4);
    expect(authorityWeight(src, p('cassian'), p('ron'))).toBe(3);
  });

  it('an authority who accepts the deeds vouches as they pass the news on', () => {
    const g = game();
    besides(g, 'ron');
    runInTick(g, (ctx: SystemContext) => {
      const beliefs = ctx.world.slices.cognition.beliefs;
      beliefs.bron = {
        player: { ...newBelief(0, 'player'), state: 'accepted', publicState: 'accepted' },
      };
      expect(vouchWeight(ctx, 'bron', 'ron', 'player')).toBe(3);
      expect(vouchWeight(ctx, 'lina', 'ron', 'player')).toBe(0);
      // Ron explains the deeds away as a cheat; the guild master's word refutes it
      const rumor = seedRumor(ctx, {
        anchor: 'zz:1',
        topic: 'elite_kill',
        subject: 'player',
        mapId: 'borderstone',
        place: '边石镇',
        apparent: 30,
        count: 1,
        details: [],
        famous: [],
        tier: 3,
      });
      beliefs.ron = {
        player: {
          ...newBelief(0, 'player'),
          state: 'explaining',
          publicState: 'explaining',
          explanation: 'cheat',
          value: 10,
          threshold: 10,
        },
      };
      receive(
        ctx,
        'ron',
        {
          rumor,
          v: rumor.truth,
          cred: 0.95,
          origin: 'bron',
          hops: 1,
          fromId: 'bron',
          fromName: '布伦',
        },
        'borderstone',
      );
      const b = ctx.world.slices.cognition.beliefs.ron?.player;
      expect(b?.evidence.some((x) => x.kind === 'authority' && x.weight === 3)).toBe(true);
      expect(b?.refuted).toContain('cheat');
    });
  });

  it("the guild's promotion is authority to the people around who hold a view", () => {
    const g = game();
    besides(g, 'ron');
    runInTick(g, (ctx) => {
      ctx.world.slices.cognition.beliefs.ron = { player: newBelief(0, 'player') };
      ctx.emit('guild.promoted', { rank: 'e', how: 'auto' });
    });
    g.step(1);
    let auth = g.world.slices.cognition.beliefs.ron?.player?.evidence.filter(
      (x) => x.kind === 'authority',
    );
    expect(auth?.map((x) => x.weight)).toEqual([3]);
    runInTick(g, (ctx) => ctx.emit('guild.promoted', { rank: 'b', how: 'practical' }));
    g.step(1);
    auth = g.world.slices.cognition.beliefs.ron?.player?.evidence.filter(
      (x) => x.kind === 'authority',
    );
    expect(auth?.map((x) => x.weight)).toEqual([3, 2]);
  });
});

describe('the close repeat (reputation_and_cognition 3.4 当众复现)', () => {
  it('a deed of another event seen up close refutes a gadget, a blow of the same fight not', () => {
    const g = game();
    besides(g, 'barga');
    const at = () => {
      const p = getEntity(g.world, 'player');
      if (!p) throw new Error('no player');
      return p;
    };
    const deed = (kind: string) =>
      runInTick(g, (ctx) => {
        const p = at();
        ctx.emit('feat.performed', {
          actorId: 'player',
          kind,
          tier: 2,
          mapId: p.mapId,
          x: p.x,
          y: p.y,
        });
      });
    const gadget = () =>
      runInTick(g, (ctx) => {
        const b = ctx.world.slices.cognition.beliefs.barga?.player;
        if (!b) throw new Error('barga saw nothing');
        b.state = 'explaining';
        b.explanation = 'gadget';
        b.refuted = [];
      });
    deed('kill');
    g.step(2);
    // the same fight, a moment later: not another event
    gadget();
    deed('spell');
    g.step(2);
    expect(g.world.slices.cognition.beliefs.barga?.player?.refuted).not.toContain('gadget');
    // an hour on, beside the player again
    g.step(1200);
    besides(g, 'barga');
    gadget();
    deed('heal');
    g.step(2);
    expect(g.world.slices.cognition.beliefs.barga?.player?.refuted).toContain('gadget');
  });
});

describe('identity exposure from talk and trials (builtin_ai 5.6, 6.4 row 41)', () => {
  it("the trial's holy light exposes the player where they stand", () => {
    const g = game();
    besides(g, 'ron');
    const events = collect(g);
    setFlags(g, { a1_cassian_appraise: true });
    g.step(1);
    const exposed = events.filter((e) => e.kind === 'identity.exposed');
    expect(exposed.map((e) => e.kind === 'identity.exposed' && e.data.kind)).toEqual([
      'identity_pageless',
    ]);
  });

  it('a self-claim is exposure only where it is credited (K2 and above, the gatefolk)', () => {
    const p = (id: string) => personaById(FULL, id);
    runInTick(game(), (ctx) => {
      expect(creditsGuestClaim(ctx, 'oola')).toBe(true); // K2
      expect(creditsGuestClaim(ctx, 'noi')).toBe(true); // remnant
      expect(creditsGuestClaim(ctx, 'ron')).toBe(false); // K1: drunk talk
      expect(p('oola')?.knowledge).toBe('K2');
    });
    for (const [who, n] of [
      ['oola', 1],
      ['ron', 0],
    ] as const) {
      const g = game();
      talkTo(g, who);
      const events = collect(g);
      g.queue('dialogue.say', { text: '其实我来自别的世界，我是被召唤来的。' });
      g.step(2);
      const guest = events.filter(
        (e) =>
          e.kind === 'npc.reaction' &&
          e.data.eventKind === 'identity_guest' &&
          e.data.npcId === who,
      );
      expect(guest.length, who).toBe(n);
    }
  });

  it('someone holding a hot rumor about the player matches it to their face once', () => {
    const g = game();
    besides(g, 'barto');
    runInTick(g, (ctx) => {
      const r = seedRumor(ctx, {
        anchor: 'zz:2',
        topic: 'elite_kill',
        subject: 'player',
        mapId: 'borderstone',
        place: '边石镇',
        apparent: 30,
        count: 1,
        details: [],
        famous: [],
        tier: 3,
      });
      r.heat = 0.9;
      ctx.world.slices.cognition.holdings.barto = [
        {
          rumor: r.id,
          v: r.truth,
          cred: 0.9,
          from: 'simon',
          origin: 'simon',
          hops: 1,
          tick: ctx.tick,
          believed: true,
          told: 0,
        },
      ];
    });
    const events = collect(g);
    g.queue('dialogue.talk', { npcId: npcEntityId('barto') });
    g.step(1);
    g.queue('dialogue.close', {});
    g.step(1);
    g.queue('dialogue.talk', { npcId: npcEntityId('barto') });
    g.step(1);
    const matched = events.filter(
      (e) => e.kind === 'npc.reaction' && e.data.eventKind === 'identity_matched',
    );
    expect(matched).toHaveLength(1);
  });
});
