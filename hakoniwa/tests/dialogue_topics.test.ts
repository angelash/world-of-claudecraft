// The topic graph (builtin_ai.md 6.2, 6.6; PK-M1-19): the shipped topic data, the 6.6
// refusal table, the menu and the redirect as pure rules, and talking about topics in a
// real conversation: the topic menu, answers by version and rotation, refusals with the
// redirect and the anti-loop, the misdirection version, locked clues, free text through
// the graph, patience and the persuade option.

import { describe, expect, it } from 'vitest';
import { tr } from '../src/core/text';
import {
  availableTopics,
  currentConversation,
  decideTopic,
  type MenuCandidate,
  rankMenu,
  rankRedirect,
  type SpeakerView,
  sayTopic,
  type TopicDef,
  topicProblems,
} from '../src/systems/dialogue';
import { npcEntityId } from '../src/systems/npc';
import type { KnowledgeTier } from '../src/systems/npc/types';
import { linePackFindings, unregisteredTopicFindings } from '../tools/content/validators/lines';
import {
  collect,
  FULL,
  game,
  keyOf,
  runInTick,
  setFlags,
  talkTo,
  withPacks,
} from './dialogue_topics_harness';

// ---------------------------------------------------------------------------
// data

describe('topic data (data/dialogue/topics/)', () => {
  it('passes its own content checks and every line pack names registered topics', () => {
    expect(topicProblems(FULL)).toEqual([]);
    expect(unregisteredTopicFindings(FULL.linePacks, FULL.topics)).toEqual([]);
    const fixture = unregisteredTopicFindings(
      [{ id: 'ln_zz', slots: { 'topic.place_nowhere': ['x'] } }],
      FULL.topics,
    );
    expect(fixture.map((f) => f.message)).toEqual([
      'linePacks:ln_zz slots.topic.place_nowhere: topic place_nowhere is not in the topic graph',
    ]);
    expect(linePackFindings([]).length).toBe(0);
  });

  it('holds the generic topics, the nine prologue questions and the act-1 instances', () => {
    const ids = FULL.topics.map((t) => t.id);
    expect(ids.filter((id) => id.startsWith('gen_'))).toEqual([
      'gen_self',
      'gen_work',
      'gen_place',
      'gen_news',
      'gen_you',
      'gen_faith',
      'gen_trouble',
      'gen_advice',
      'gen_people',
      'gen_directions',
      'gen_prices',
      'gen_danger',
      'gen_past',
      'gen_shop',
      'gen_craft',
      'gen_train',
      'gen_heal',
      'gen_info',
    ]);
    const prologue = FULL.topics.filter((t) => t.act === 'prologue' && t.scene);
    expect(prologue.map((t) => t.scene?.choice)).toEqual([
      'where',
      'world',
      'review',
      'thing',
      'above',
      'five',
      'neighbors',
      'home',
      'chair',
    ]);
    // the prologue's own questions end with the prologue; the judgment carries on (catalog 3.3)
    expect(prologue.filter((t) => t.until === 'prologue').length).toBe(8);
    // act 1: 235 registered in catalog 3.3, less the nine prologue questions, plus
    // self_merca_coin which starts in the prologue (the three that waited on their quests,
    // event_drunk_bandits, secret_toma_watch and secret_noi_mark, came with PK-M1-33)
    expect(FULL.topics.filter((t) => t.act === 'act1' && !t.id.startsWith('gen_')).length).toBe(
      225,
    );
    for (const id of ['event_drunk_bandits', 'secret_toma_watch', 'secret_noi_mark'])
      expect(ids).toContain(id);
  });

  it('rejects broken topic records', () => {
    const bad: TopicDef[] = [
      {
        id: 'secret_zz',
        category: 'secret',
        title: 'x',
        scope: 'persona',
        tier: 'K0',
        versionBy: 'knowledge',
        repeat: 'evergreen',
        act: 'act1',
        requires: 'zz_unregistered_flag',
        locked: 'shrug' as never,
        aliases: ['nowhere/never'],
      },
      {
        id: 'zz_topic',
        category: 'gossip' as never,
        scope: 'region',
        region: 'atlantis',
        tier: 'K9' as KnowledgeTier,
        versionBy: 'knowledge',
        repeat: 'evergreen',
        act: 'act9',
      },
    ];
    expect(topicProblems({ ...FULL, topics: bad })).toEqual([
      'topic secret_zz: a persona topic needs owners',
      'topic secret_zz requires: reads unregistered variable zz_unregistered_flag',
      'topic secret_zz: locked shrug is not a refusal',
      'topic secret_zz: alias nowhere/never is no place, person or lexicon word',
      'topic zz_topic: id has no registered prefix',
      'topic zz_topic: unknown category gossip',
      'topic zz_topic: tier K9 is not K0 to K5',
      "topic zz_topic: needs a title (only a person topic says the person's name)",
      "topic zz_topic: region atlantis is no map's region",
      'topic zz_topic: act act9 is not an act',
    ]);
  });
});

// ---------------------------------------------------------------------------
// the refusal table (6.6) and the menu (6.2)

const sp = (o: Partial<SpeakerView> = {}): SpeakerView => ({
  id: 'zz',
  tier: 'K0',
  roles: [],
  region: 'edgestone_area',
  trust: 50,
  ...o,
});

const topic = (o: Partial<TopicDef>): TopicDef => ({
  id: 'lore_zz',
  category: 'world',
  title: 'x',
  scope: 'region',
  region: 'edgestone_area',
  tier: 'K0',
  versionBy: 'knowledge',
  repeat: 'evergreen',
  act: 'act1',
  ...o,
});

describe('who speaks of a topic and how (6.6)', () => {
  const env = (holds: Record<string, boolean> = {}, talked: string[] = []) => ({
    holds: (c: string) => !!holds[c],
    act: 'act1',
    talked: (id: string) => talked.includes(id),
  });

  it('answers an open topic, and evades it while trust is short', () => {
    expect(decideTopic(topic({}), sp(), env())).toEqual({ kind: 'answer', version: null });
    expect(decideTopic(topic({ trustMin: 60 }), sp({ trust: 59 }), env())).toEqual({
      kind: 'refuse',
      refusal: 'evade',
      reason: 'trust',
    });
  });

  it('keeps a locked topic: knowers by their handling, others do not know or mislead', () => {
    const t = topic({
      requires: 'zz_open',
      knowers: ['oola'],
      locked: 'deny',
      lockedBy: { yeyu: 'unknown' },
      mis: { by: ['class:clergy'] },
    });
    expect(decideTopic(t, sp({ id: 'oola' }), env())).toMatchObject({ refusal: 'deny' });
    expect(decideTopic({ ...t, knowers: ['yeyu'] }, sp({ id: 'yeyu' }), env())).toMatchObject({
      refusal: 'unknown',
      reason: 'locked_knower',
    });
    expect(decideTopic(t, sp({ id: 'ron' }), env())).toMatchObject({
      refusal: 'unknown',
      reason: 'locked',
    });
    expect(decideTopic(t, sp({ id: 'cassian', socialClass: 'clergy' }), env())).toMatchObject({
      refusal: 'mis',
    });
    // once it holds, the clergy still answer with the misdirection version until overturned
    expect(
      decideTopic(t, sp({ id: 'cassian', socialClass: 'clergy' }), env({ zz_open: true })),
    ).toEqual({ kind: 'answer', version: 'mis' });
    const overturned = { ...t, mis: { by: ['class:clergy'], until: 'zz_truth' } };
    expect(
      decideTopic(
        overturned,
        sp({ id: 'cassian', socialClass: 'clergy' }),
        env({ zz_open: true, zz_truth: true }),
      ),
    ).toEqual({ kind: 'answer', version: null });
  });

  it('is unknown below the tier, out of scope, outside the act window or before `after`', () => {
    expect(decideTopic(topic({ tier: 'K2' }), sp({ tier: 'K1' }), env())).toMatchObject({
      refusal: 'unknown',
      reason: 'tier',
    });
    expect(
      decideTopic(topic({ tier: 'K2', knowers: ['zz'] }), sp({ tier: 'K0' }), env()).kind,
    ).toBe('answer');
    expect(decideTopic(topic({}), sp({ region: 'valen_valley' }), env())).toMatchObject({
      reason: 'out_of_scope',
    });
    expect(
      decideTopic(topic({ scope: 'persona', owners: ['oola'] }), sp({ id: 'ron' }), env()),
    ).toMatchObject({ reason: 'out_of_scope' });
    expect(decideTopic(topic({ service: 'vendor' }), sp(), env())).toMatchObject({
      reason: 'out_of_scope',
    });
    expect(decideTopic(topic({ service: 'vendor' }), sp({ roles: ['vendor'] }), env()).kind).toBe(
      'answer',
    );
    expect(decideTopic(topic({ act: 'act2' }), sp(), env())).toMatchObject({ reason: 'act' });
    expect(decideTopic(topic({ act: 'prologue', until: 'prologue' }), sp(), env())).toMatchObject({
      reason: 'act',
    });
    expect(decideTopic(topic({ after: ['gen_people'] }), sp(), env())).toMatchObject({
      reason: 'after',
    });
    expect(decideTopic(topic({ after: ['gen_people'] }), sp(), env({}, ['gen_people'])).kind).toBe(
      'answer',
    );
  });
});

describe('the menu and the redirect (6.2, 6.6)', () => {
  const cand = (id: string, o: Partial<MenuCandidate> = {}, order = 0): MenuCandidate => ({
    topic: topic({ id }),
    order,
    fresh: 1,
    quest: 0,
    interest: 0,
    recent: 0,
    slot: null,
    ...o,
  });

  it('fills the quotas first, at most six, talked-out topics last', () => {
    const list = [
      cand('place_a', { slot: 'situation' }, 0),
      cand('place_b', { slot: 'situation' }, 1),
      cand('place_c', { slot: 'situation' }, 2),
      cand('self_a', { slot: 'interest', interest: 1 }, 3),
      cand('event_a', { slot: 'news', recent: 1 }, 4),
      cand('quest_a', { slot: 'quest', quest: 1 }, 5),
      cand('lore_a', { fresh: 0 }, 6),
      cand('lore_b', {}, 7),
      cand('lore_c', {}, 8),
    ];
    const menu = rankMenu(list);
    expect(menu).toHaveLength(6);
    // the quota groups and the best rest, by score; the talked-out topic does not make it
    expect(menu).toEqual(['quest_a', 'self_a', 'event_a', 'place_a', 'place_b', 'place_c']);
    expect(
      rankMenu(
        list.filter((c) => c.topic.id !== 'lore_b' && c.topic.id !== 'lore_c'),
        7,
      ),
    ).toEqual(['quest_a', 'self_a', 'event_a', 'place_a', 'place_b', 'place_c', 'lore_a']);
  });

  it('offers two neighbours of the refused topic first', () => {
    const refused = topic({ id: 'lore_x', category: 'world' });
    const list = [
      { ...cand('event_a', {}, 0), topic: topic({ id: 'event_a', category: 'event' }) },
      { ...cand('lore_y', { fresh: 0.5 }, 1), topic: topic({ id: 'lore_y', category: 'world' }) },
      { ...cand('lore_x', {}, 2), topic: refused },
      { ...cand('self_b', { interest: 1 }, 3), topic: topic({ id: 'self_b', category: 'self' }) },
    ];
    // lore_y: 0.5 adjacent + 0.15 fresh; self_b: 0.3 fresh + 0.2 interest; event_a: 0.3
    expect(rankRedirect(refused, list)).toEqual(['lore_y', 'self_b']);
  });
});

// ---------------------------------------------------------------------------
// in a conversation

/** Ron's own topic lines (a fixture: the act-1 packs are PK-M1-29's content). */
const RON = {
  id: 'ln_ron',
  speaker: 'ron',
  slots: {
    'topic.secret_ron_wolf': { K0: ['那是我的事。', '别问了。'] },
    'topic.self_ron_mother': { K0: ['老家还有我娘。', '娘的屋顶漏雨，我攒钱修。'] },
  },
};
/** Cassian's misdirection version of the sixth sigil (MIS-05). */
const CASSIAN = {
  id: 'ln_cassian',
  speaker: 'cassian',
  slots: { 'topic.lore_sixth_sigil': { mis: ['那是邪神的涂鸦，别去看。'] } },
};

function options(g: ReturnType<typeof game>): string[] {
  return currentConversation(g.world)?.options.map((o) => o.id) ?? [];
}

function lastNpcLine(g: ReturnType<typeof game>): unknown {
  const conv = currentConversation(g.world);
  return conv?.lines.filter((l) => l.speakerId !== 'player').at(-1)?.text;
}

describe('the topic menu in a conversation', () => {
  it('opens and closes the menu, answers by version and rotates the lines', () => {
    const g = game(withPacks([RON]));
    talkTo(g, 'ron');
    expect(options(g)[0]).toBe('topics');
    g.queue('dialogue.choose', { optionId: 'topics' });
    g.step(1);
    const menu = options(g);
    expect(menu.at(-1)).toBe('back');
    expect(menu.length).toBeLessThanOrEqual(7);
    expect(menu).toContain('topic:self_ron_mother');
    expect(menu).toContain('topic:gen_self');
    // a topic short of trust is on the menu and marked (secret_ron_wolf: trust 60)
    const wolf = currentConversation(g.world)?.options.find(
      (o) => o.id === 'topic:secret_ron_wolf',
    );
    expect(wolf?.hint).toEqual(tr('sys.dialogue.topic.hint_distant'));
    // a person topic of someone not named yet is not on it; gen_directions never is
    expect(menu.some((id) => id.startsWith('topic:person_'))).toBe(false);
    expect(menu).not.toContain('topic:gen_directions');
    g.queue('dialogue.choose', { optionId: 'topic:self_ron_mother' });
    g.step(2);
    const first = keyOf(lastNpcLine(g));
    expect(first).toBe('c.line_packs.ln_ron.slots.topic_self_ron_mother.k0.0');
    g.queue('dialogue.choose', { optionId: 'topic:self_ron_mother' });
    g.step(2);
    expect(keyOf(lastNpcLine(g))).toBe('c.line_packs.ln_ron.slots.topic_self_ron_mother.k0.1');
    // both heard: it starts over and the menu marks it talked
    g.queue('dialogue.choose', { optionId: 'topic:self_ron_mother' });
    g.step(2);
    expect(keyOf(lastNpcLine(g))).toBe(first);
    // talked out: it sinks below every fresh topic (out of a full menu)
    expect(g.world.slices.dialogue.topics?.ron?.self_ron_mother?.done).toBe(true);
    expect(options(g)).not.toContain('topic:self_ron_mother');
    g.queue('dialogue.choose', { optionId: 'back' });
    g.step(1);
    expect(options(g)[0]).toBe('topics');
    expect(options(g).at(-1)).toBe('bye');
  });

  it('names a person through gen_people, whose topic then comes up', () => {
    const g = game();
    talkTo(g, 'ron');
    let line: unknown = null;
    runInTick(g, (ctx) => {
      expect(availableTopics(ctx, 'ron').some((e) => e.topic.id.startsWith('person_'))).toBe(false);
      line = sayTopic(ctx, 'ron', 'gen_people')?.line;
    });
    const named = Object.keys(g.world.slices.dialogue.introduced ?? {});
    expect(named).toHaveLength(1);
    expect(keyOf(line)).toMatch(/^c\.line_packs\.ln_common\.slots\.topic_gen_people\./);
    // the person topic of whoever was named comes up once it has a line (a fixture line)
    const who = named[0] as string;
    const h = game(
      withPacks([
        {
          id: 'ln_ron',
          speaker: 'ron',
          slots: { [`topic.person_${who}`]: { K0: ['那人还行。'] } },
        },
      ]),
    );
    talkTo(h, 'ron');
    runInTick(h, (ctx) => {
      expect(availableTopics(ctx, 'ron').some((e) => e.topic.id === `person_${who}`)).toBe(false);
      sayTopic(ctx, 'ron', 'gen_people');
      expect(availableTopics(ctx, 'ron').some((e) => e.topic.id === `person_${who}`)).toBe(true);
    });
  });

  it('refuses a topic short of trust with a redirect, and ends the talk at the third ask', () => {
    const g = game(withPacks([RON]));
    talkTo(g, 'ron');
    g.queue('dialogue.choose', { optionId: 'topics' });
    g.step(1);
    const events = collect(g);
    g.queue('dialogue.choose', { optionId: 'topic:secret_ron_wolf' });
    g.step(2);
    expect(keyOf(lastNpcLine(g))).toMatch(/^c\.line_packs\.ln_common\.slots\.react_evade\./);
    expect(events.filter((e) => e.kind === 'dialogue.topic').map((e) => e.data)).toEqual([
      { npcId: npcEntityId('ron'), npcRef: 'ron', topicId: 'secret_ron_wolf', outcome: 'refused' },
    ]);
    g.queue('dialogue.choose', { optionId: 'topic:secret_ron_wolf' });
    g.step(2);
    expect(currentConversation(g.world)).not.toBeNull();
    g.queue('dialogue.choose', { optionId: 'topic:secret_ron_wolf' });
    g.step(2);
    expect(currentConversation(g.world)).toBeNull();
    const closed = events.filter((e) => e.kind === 'dialogue.closed').at(-1);
    expect(closed?.kind === 'dialogue.closed' && closed.data.reason).toBe('refused');
    // closed for today: the next talk the same day does not offer it
    g.queue('dialogue.talk', { npcId: npcEntityId('ron') });
    g.step(1);
    g.queue('dialogue.choose', { optionId: 'topics' });
    g.step(1);
    expect(options(g)).not.toContain('topic:secret_ron_wolf');
  });

  it('answers with trust enough', () => {
    const g = game(withPacks([RON]));
    talkTo(g, 'ron');
    runInTick(g, (ctx) => {
      const r = ctx.world.slices.npc.minds.ron?.rel.player;
      if (r) r.trust = 70;
    });
    g.queue('dialogue.choose', { optionId: 'topics' });
    g.step(1);
    g.queue('dialogue.choose', { optionId: 'topic:secret_ron_wolf' });
    g.step(2);
    expect(keyOf(lastNpcLine(g))).toBe('c.line_packs.ln_ron.slots.topic_secret_ron_wolf.k0.0');
  });
});

describe('free text through the graph (6.3 to 6.6)', () => {
  it('asks a generic topic in words', () => {
    const g = game();
    talkTo(g, 'ron');
    g.queue('dialogue.say', { text: '你是做什么的？' });
    g.step(2);
    expect(keyOf(lastNpcLine(g))).toMatch(
      /^c\.line_packs\.ln_common\.slots\.topic_gen_work\.k[01]\./,
    );
    expect(currentConversation(g.world) && g.world.slices.dialogue.session?.topic).toBe('gen_work');
  });

  it("denies a knower's locked secret and never confirms a locked clue", () => {
    const g = game();
    talkTo(g, 'oola');
    g.queue('dialogue.say', { text: '你在隐瞒什么？孩子们的胎记到底怎么回事？' });
    g.step(2);
    expect(keyOf(lastNpcLine(g))).toMatch(/^c\.line_packs\.ln_common\.slots\.react_deny\./);
    // someone else naming a locked truth with no topic of its own hears nonsense (6.6 row 6)
    const h = game();
    talkTo(h, 'ron');
    h.queue('dialogue.say', { text: '你知道门形的印记是什么吗？' });
    h.step(2);
    expect(keyOf(lastNpcLine(h))).toMatch(/^c\.line_packs\.ln_common\.slots\.react_nonsense\./);
  });

  it('misleads sincerely with the misdirection version (MIS-05)', () => {
    const g = game(withPacks([CASSIAN]));
    talkTo(g, 'cassian');
    g.queue('dialogue.say', { text: '遗迹里的神纹是什么？' });
    g.step(2);
    expect(keyOf(lastNpcLine(g))).toBe(
      'c.line_packs.ln_cassian.slots.topic_lore_sixth_sigil.mis.0',
    );
  });

  it('a misunderstanding costs patience and offers two topics instead', () => {
    const g = game();
    talkTo(g, 'ron');
    const before = g.world.slices.dialogue.session?.patience ?? 0;
    expect(before).toBeGreaterThanOrEqual(1);
    g.queue('dialogue.say', { text: '咕噜咕噜呱呱' });
    g.step(2);
    expect(g.world.slices.dialogue.session?.patience).toBe(before - 1);
    expect(options(g).filter((id) => id.startsWith('topic:'))).toHaveLength(2);
    for (let i = 0; i < before; i++) {
      if (!currentConversation(g.world)) break;
      g.queue('dialogue.say', { text: '咕噜咕噜呱呱' });
      g.step(2);
    }
    expect(currentConversation(g.world)).toBeNull();
  });
});

describe('topic progress across talks', () => {
  it('keeps the rotation and the people named in the save', () => {
    const g = game(withPacks([RON]));
    talkTo(g, 'ron');
    g.queue('dialogue.choose', { optionId: 'topics' });
    g.step(1);
    g.queue('dialogue.choose', { optionId: 'topic:self_ron_mother' });
    g.step(2);
    const saved = JSON.parse(JSON.stringify(g.world.slices.dialogue.topics));
    expect(saved.ron.self_ron_mother.k).toEqual([
      'c.line_packs.ln_ron.slots.topic_self_ron_mother.k0.0',
    ]);
    setFlags(g, {});
  });
});

describe('review fixes: patience, directions, clue loop, misdirection', () => {
  it('an insult costs one patience, a misunderstanding one', () => {
    const g = game();
    talkTo(g, 'ron');
    const before = g.world.slices.dialogue.session?.patience ?? 0;
    g.queue('dialogue.say', { text: '你这个蠢货。' });
    g.step(2);
    expect(g.world.slices.dialogue.session?.patience).toBe(before - 1);
  });

  it('points the way to a place the player names (gen_directions)', () => {
    const g = game();
    talkTo(g, 'ron');
    g.queue('dialogue.say', { text: '铁匠铺怎么走？' });
    g.step(2);
    expect(keyOf(lastNpcLine(g))).toMatch(
      /^c\.line_packs\.ln_common\.slots\.topic_gen_directions\.[13]$/,
    );
  });

  it('a locked clue pressed a third time ends the talk', () => {
    const g = game();
    talkTo(g, 'ron');
    for (let i = 0; i < 3; i++) {
      g.queue('dialogue.say', { text: '你知道门形的印记是什么吗？' });
      g.step(2);
    }
    expect(currentConversation(g.world)).toBeNull();
  });

  it('a sincere misdirection is no refusal: asking again keeps the talk open', () => {
    const g = game(withPacks([CASSIAN]));
    talkTo(g, 'cassian');
    const before = g.world.slices.dialogue.session?.patience ?? 0;
    for (let i = 0; i < 3; i++) {
      g.queue('dialogue.say', { text: '遗迹里的神纹是什么？' });
      g.step(2);
    }
    expect(currentConversation(g.world)).not.toBeNull();
    expect(g.world.slices.dialogue.session?.patience).toBe(before);
  });

  it('a calm person with no unmet need has no trouble to tell', () => {
    const g = game();
    talkTo(g, 'ron');
    runInTick(g, (ctx) => {
      const st = ctx.world.slices.npc.npcs.ron;
      if (!st) throw new Error('no ron');
      for (const k of Object.keys(st.needs) as (keyof typeof st.needs)[]) st.needs[k] = 90;
      expect(availableTopics(ctx, 'ron').some((e) => e.topic.id === 'gen_trouble')).toBe(false);
      st.needs.money = 10;
      expect(availableTopics(ctx, 'ron').some((e) => e.topic.id === 'gen_trouble')).toBe(true);
    });
  });
});
