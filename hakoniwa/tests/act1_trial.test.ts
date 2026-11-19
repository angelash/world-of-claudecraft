// PK-M1-55: the act-1 witch trial's evidence presentation (act1_borderstone.md 4.2,
// catalog_quests_acts1_3.md A1-M09, `tut_a1_present`), the presentation core it shares with
// act 6's court (src/systems/scenes/present.ts), the trial's identity exposure, and the
// reaction table's accusation progress and trial omen (builtin_ai.md 5.6 rows 2 and 4).
// Acceptance (plan row): every ending of the trial is reachable; a wrong piece gets the
// tribunal's rebuttal (unit tests per outcome).

import { describe, expect, it } from 'vitest';
import { trialProblems } from '../src/content/packs/scenes';
import { Engine, ok } from '../src/core';
import type { ContentMap, FlagValue } from '../src/core/contracts';
import type { GameSystem } from '../src/core/system';
import { t } from '../src/shared_ui/i18n';
import { system as cognition } from '../src/systems/cognition';
import { newBelief } from '../src/systems/cognition/belief';
import { addItem } from '../src/systems/inventory';
import { system as npc } from '../src/systems/npc';
import {
  ACCUSE_STEP,
  applyConsequence,
  REACTION_CONSEQUENCES,
} from '../src/systems/npc/brain/consequences';
import { brainProblems } from '../src/systems/npc/brain/library';
import { REACTION_ACTIONS, REACTION_PREDICATE_NAMES } from '../src/systems/npc/brain/reactions';
import {
  courtPiece,
  judgePresentation,
  PIECE_PREFIX,
  type PresentPiece,
  provenPoints,
  recordPresentation,
  type SceneNode,
  sceneView,
  type TrialDef,
} from '../src/systems/scenes';
import { playerEntity } from '../src/systems/world';
import {
  besides,
  collect,
  runInTick,
  setFlags,
  game as topicsGame,
} from './dialogue_topics_harness';
import { NARRATIVE_SYSTEMS, narrativeContent, recordLines } from './narrative_harness';

declare module '../src/core/contracts' {
  interface CommandMap {
    'pk55.give': { item: string };
  }
}

/** Gives the player an item through the inventory port (a tick of its own). */
const giver: GameSystem = {
  id: 'zz_pk55_giver',
  order: 1,
  commands: {
    'pk55.give'(ctx, d) {
      addItem(ctx, ctx.world.slices.world.playerId, d.item, 1);
      return ok();
    },
  },
};
// npc and cognition: the identity exposure and the reaction table run in the same world
const SYSTEMS = [...NARRATIVE_SYSTEMS, npc, cognition, giver];

const content = narrativeContent();
const TRIAL = content.trials.find((t) => t.id === 'a1_witch_trial') as TrialDef;
const scene = content.scenes.find((s) => s.id === 'cut_a1_trial');
const node = (id: string): SceneNode => {
  const n = scene?.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
};

// ---------------------------------------------------------------------------
// the shared core (pure)

describe('the presentation core (present.ts), shared by act 1 and act 6', () => {
  const water: PresentPiece = {
    id: 'w',
    item: 'water',
    targets: [{ tribunal: 't', point: 'evidence', strength: 1 }],
  };
  const unrelated: PresentPiece = {
    id: 'u',
    item: 'coin',
    targets: [{ tribunal: 'other', point: 'x', strength: 1 }],
  };
  const fake: PresentPiece = { ...water, id: 'f', item: 'fake', forged: true };
  const all = (_: string) => true;

  it('judges each outcome: hit, wrong, forged, repeat, missing', () => {
    expect(judgePresentation(water, 't', { shown: [] }, all)).toEqual({
      outcome: 'hit',
      landed: [{ tribunal: 't', point: 'evidence', strength: 1 }],
    });
    expect(judgePresentation(unrelated, 't', { shown: [] }, all).outcome).toBe('wrong');
    expect(judgePresentation(fake, 't', { shown: [] }, all).outcome).toBe('forged');
    expect(judgePresentation(water, 't', { shown: ['w'] }, all).outcome).toBe('repeat');
    expect(judgePresentation(water, 't', { shown: [] }, () => false).outcome).toBe('missing');
  });

  it('records what is shown (not a refused piece) and remembers a caught forgery', () => {
    const r0 = { shown: [] as string[] };
    const r1 = recordPresentation(r0, water, judgePresentation(water, 't', r0, all));
    expect(r1.shown).toEqual(['w']);
    expect(r1.forgeryCaught).toBeFalsy();
    const r2 = recordPresentation(r1, water, judgePresentation(water, 't', r1, all));
    expect(r2).toBe(r1);
    const r3 = recordPresentation(r1, fake, judgePresentation(fake, 't', r1, all));
    expect(r3.forgeryCaught).toBe(true);
  });

  it('act 6: an evidence record becomes a piece whose tribunal is the goddess, point the line', () => {
    const e01 = content.evidence.find((e) => e.id === 'E01');
    if (!e01) throw new Error('no E01');
    const piece = courtPiece(e01);
    expect(piece.id).toBe('E01');
    expect(piece.item).toBe(e01.item);
    expect(piece.targets).toEqual(
      e01.targets.map((t) => ({ tribunal: t.goddess, point: t.line, strength: t.strength })),
    );
    expect(judgePresentation(piece, 'eluen', { shown: [] }, () => true).outcome).toBe('hit');
    expect(judgePresentation(piece, 'sylvie', { shown: [] }, () => true).outcome).toBe('wrong');
  });

  it('counts each point once however many pieces prove it; forgeries prove nothing', () => {
    const second: PresentPiece = { ...water, id: 'w2', item: 'water2' };
    expect(provenPoints([water, second, fake], 't', { shown: ['w', 'w2', 'f'] })).toEqual([
      'evidence',
    ]);
    expect(provenPoints([fake], 't', { shown: ['f'] })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// the witch trial in play

/** An act-1 world with the trial started: flags applied, the player holding `items`. */
function trialWorld(
  flags: Record<string, FlagValue> = {},
  items: string[] = [],
  c: ContentMap = content as ContentMap,
): Engine {
  const g = Engine.create(3, c, SYSTEMS, { aiMode: 'off' });
  g.world.meta.flags.act = 'act1';
  g.step(1);
  g.world.slices.scenes.current = null;
  g.world.slices.scenes.queue = [];
  Object.assign(g.world.meta.flags, flags);
  for (const item of items) g.queue('pk55.give', { item });
  g.step(1);
  g.queue('scenes.start', { sceneId: 'cut_a1_trial' });
  g.step(1);
  return g;
}

/** The same at the trial's defense (the chapel appraisal done, so the square is short). */
function atDefense(
  flags: Record<string, FlagValue> = {},
  items: string[] = [],
  c: ContentMap = content as ContentMap,
): Engine {
  const g = trialWorld({ a1_cassian_appraise: true, ...flags }, items, c);
  // walk to the defense node, taking the first choice anywhere else
  for (let i = 0; i < 200; i++) {
    const v = sceneView(g.world, g.content);
    if (!v) throw new Error('the trial ended before the defense');
    if (v.nodeId === 'defense' && v.waiting === 'choice') return g;
    if (v.waiting === 'choice') g.queue('scenes.choose', { choiceId: v.choices[0]?.id ?? '' });
    else if (v.waiting === 'input') g.queue('scenes.input', { text: '' });
    else g.queue('scenes.advance', {});
    g.step(1);
  }
  throw new Error('no defense');
}

function choose(g: Engine, id: string): void {
  g.queue('scenes.choose', { choiceId: id });
  g.step(1);
}

/** Pick at the defense, then read the reaction's lines until the defense is back. */
function present(g: Engine, id: string): void {
  choose(g, id);
  for (let i = 0; i < 20; i++) {
    const v = sceneView(g.world, g.content);
    if (!v || (v.nodeId === 'defense' && v.waiting === 'choice')) return;
    if (v.waiting === 'choice') g.queue('scenes.choose', { choiceId: v.choices[0]?.id ?? '' });
    else g.queue('scenes.advance', {});
    g.step(1);
  }
  throw new Error(`${id}: never came back to the defense`);
}

function choiceIds(g: Engine): string[] {
  return sceneView(g.world, g.content)?.choices.map((c) => c.id) ?? [];
}

/** From the defense, finish the trial: close the defense, advance to the end. */
function closeTrial(g: Engine): string[] {
  const visited: string[] = [];
  for (let i = 0; i < 400; i++) {
    const v = sceneView(g.world, g.content);
    if (!v) return visited;
    if (visited[visited.length - 1] !== v.nodeId) visited.push(v.nodeId);
    if (v.waiting === 'choice') {
      const ids = v.choices.map((c) => c.id);
      const pick = ids.find((c) => c === 'done' || c === 'silent') ?? (ids.at(-1) as string);
      g.queue('scenes.choose', { choiceId: pick });
    } else if (v.waiting === 'input') g.queue('scenes.input', { text: '' });
    else g.queue('scenes.advance', {});
    g.step(1);
  }
  throw new Error('the trial did not end');
}

describe('the witch trial: presenting evidence', () => {
  it('the defense is a present node of the trial table; the held pieces come first', () => {
    expect(node('defense').present).toEqual({ trial: 'a1_witch_trial' });
    const g = atDefense({ a1_spring_source_found: true }, ['north_spring_water']);
    const ids = choiceIds(g);
    expect(ids[0]).toBe(`${PIECE_PREFIX}spring_water`);
    // the written route to the same proof is the piece now (no duplicate choice)
    expect(ids).not.toContain('water');
  });

  it('a piece that lands proves its point once, plays its reaction and stays at the defense', () => {
    const g = atDefense({ a1_spring_source_found: true }, ['north_spring_water']);
    choose(g, `${PIECE_PREFIX}spring_water`);
    expect(sceneView(g.world, g.content)?.nodeId).toBe('water');
    expect(g.world.meta.flags.a1_trial_evidence).toBe(true);
    // the reaction plays, then back at the defense: the shown piece is not offered again
    g.queue('scenes.advance', {});
    g.step(1);
    expect(sceneView(g.world, g.content)?.nodeId).toBe('defense');
    expect(choiceIds(g)).not.toContain(`${PIECE_PREFIX}spring_water`);
    expect(
      g.world.recent.some((e) => e.kind === 'trial.presented' && e.data.outcome === 'hit'),
    ).toBe(true);
  });

  it('a wrong piece gets the rebuttal and its cost; it proves nothing', () => {
    const g = atDefense({ church_suspicion: 10 }, ['smuggling_manifest']);
    const lines = recordLines(g);
    choose(g, `${PIECE_PREFIX}manifest`);
    expect(sceneView(g.world, g.content)?.nodeId).toBe('defense');
    const rebuttal = lines.find((l) => l.speakerId === 'cassian');
    // the rebuttal is the trial's content text (c.trials.a1_witch_trial.rebuttals.0.text)
    expect(rebuttal?.text).toBe(t({ key: 'c.trials.a1_witch_trial.rebuttals.0.text' }));
    expect(rebuttal?.text).not.toBe('c.trials.a1_witch_trial.rebuttals.0.text');
    expect(g.world.meta.flags.church_suspicion).toBe(12);
    expect(g.world.meta.flags.a1_trial_evidence).toBeUndefined();
    const presented = g.world.recent.find((e) => e.kind === 'trial.presented');
    expect(presented?.kind === 'trial.presented' && presented.data).toMatchObject({
      piece: 'manifest',
      outcome: 'wrong',
      proved: [],
    });
  });

  it('a forged piece gets the forgery rebuttal and costs more', () => {
    const forged: TrialDef = {
      ...TRIAL,
      pieces: [
        ...TRIAL.pieces,
        {
          id: 'false_note',
          item: 'otto_will',
          forged: true,
          targets: [{ tribunal: 'a1_witch_trial', point: 'testimony', strength: 1 }],
        },
      ].filter((p) => p.id !== 'otto_will'),
    };
    const c = { ...content, trials: [forged] } as ContentMap;
    const g = atDefense({ church_suspicion: 10 }, ['otto_will'], c);
    const lines = recordLines(g);
    choose(g, `${PIECE_PREFIX}false_note`);
    expect(lines.filter((l) => l.speakerId === 'cassian').map((l) => l.text)).toContain(
      t({ key: 'c.trials.a1_witch_trial.rebuttals.1.text' }),
    );
    expect(g.world.meta.flags.church_suspicion).toBe(15);
    expect(g.world.meta.flags.a1_trial_testimony).toBeUndefined();
    expect(g.world.slices.scenes.trials?.a1_witch_trial?.forgeryCaught).toBe(true);
  });

  it('a piece the player does not hold is not offered, is refused, and changes nothing', () => {
    const g = atDefense({ church_suspicion: 7 });
    expect(choiceIds(g).some((c) => c.startsWith(PIECE_PREFIX))).toBe(false);
    const revision = g.world.slices.scenes.current?.revision;
    choose(g, `${PIECE_PREFIX}spring_water`);
    const res = [...g.world.recent].reverse().find((e) => e.kind === 'command.result');
    expect(res?.kind === 'command.result' && res.data.ok).toBe(false);
    expect(g.world.meta.flags.church_suspicion).toBe(7);
    expect(g.world.meta.flags.a1_trial_evidence).toBeUndefined();
    expect(g.world.slices.scenes.trials?.a1_witch_trial?.shown ?? []).toEqual([]);
    expect(g.world.slices.scenes.current?.revision).toBe(revision);
    expect(g.world.recent.some((e) => e.kind === 'trial.presented')).toBe(false);
  });

  it('the same piece twice: the second is refused and costs nothing more', () => {
    const g = atDefense({ church_suspicion: 10 }, ['smuggling_manifest']);
    choose(g, `${PIECE_PREFIX}manifest`);
    expect(g.world.meta.flags.church_suspicion).toBe(12);
    expect(choiceIds(g)).not.toContain(`${PIECE_PREFIX}manifest`);
    choose(g, `${PIECE_PREFIX}manifest`);
    const res = [...g.world.recent].reverse().find((e) => e.kind === 'command.result');
    expect(res?.kind === 'command.result' && res.data.ok).toBe(false);
    expect(g.world.meta.flags.church_suspicion).toBe(12);
  });
});

describe('the witch trial: every ending is reachable (4.2)', () => {
  it('cleared: two points (the water and a witness)', () => {
    const g = atDefense({ a1_spring_source_found: true, a1_isa_will_testify: true }, [
      'north_spring_water',
    ]);
    present(g, `${PIECE_PREFIX}spring_water`);
    present(g, 'witness_isa');
    const visited = closeTrial(g);
    expect(g.world.meta.flags.a1_trial_points).toBe(2);
    expect(g.world.meta.flags.a1_oola_fate).toBe('cleared');
    expect(visited).toContain('cleared');
  });

  it('witnesses count once: two witnesses and nothing else is still convicted', () => {
    const g = atDefense({ a1_isa_will_testify: true, a1_toma_will_testify: true });
    present(g, 'witness_isa');
    present(g, 'witness_toma');
    closeTrial(g);
    expect(g.world.meta.flags.a1_trial_points).toBe(1);
    expect(g.world.meta.flags.a1_oola_fate).toBe('convicted');
  });

  it('Bron vouches for the player, not for Oola: no point', () => {
    const g = atDefense({ 'trust.bron': 70, a1_isa_will_testify: true });
    present(g, 'witness_bron');
    present(g, 'witness_isa');
    closeTrial(g);
    expect(g.world.meta.flags.a1_trial_points).toBe(1);
    expect(g.world.meta.flags.a1_oola_fate).toBe('convicted');
  });

  it('a wrong piece does not count toward clearing', () => {
    const g = atDefense({ a1_isa_will_testify: true }, ['smuggling_manifest', 'merca_coin']);
    present(g, `${PIECE_PREFIX}manifest`);
    present(g, `${PIECE_PREFIX}merca_coin`);
    present(g, 'witness_isa');
    closeTrial(g);
    expect(g.world.meta.flags.a1_trial_points).toBe(1);
    expect(g.world.meta.flags.a1_oola_fate).toBe('convicted');
  });

  it('brawl: convicted with the forest accord broken', () => {
    const g = atDefense({ a1_forest_accord: 'broken' });
    const visited = closeTrial(g);
    expect(g.world.meta.flags.a1_oola_fate).toBe('fled');
    expect(g.world.meta.flags.a1_trial_brawl).toBe(true);
    expect(visited).toContain('brawl');
  });

  it('the short versions: held, jailbroken, bribed, each to its written outcome', () => {
    for (const [flags, first, fate, report] of [
      [{ a1_oola_fate: 'convicted' }, 'held', 'convicted', 'convicted'],
      [{ a1_oola_jailbroken: true, a1_oola_fate: 'fled' }, 'empty', 'fled', 'fled'],
      [{ a1_oola_bribed: true }, 'bribed', 'cleared', 'unresolved'],
    ] as const) {
      const g = trialWorld({ ...flags });
      const at = JSON.stringify(flags);
      expect(sceneView(g.world, g.content)?.nodeId, at).toBe(first);
      const visited = closeTrial(g);
      // the full trial never opened
      expect(visited, at).not.toContain('defense');
      expect(g.world.meta.flags.a1_oola_fate, at).toBe(fate);
      expect(g.world.meta.flags.a1_cassian_report, at).toBe(report);
      expect(g.world.meta.flags['scene.cut_a1_trial.seen'], at).toBe(true);
    }
  });

  it('the lamp exposed and a spoken debate are points: the two clear her', () => {
    const g = atDefense({
      a1_grey_lamp_seen: true,
      a1_spring_source_found: true,
      'trust.cassian': 70,
      a1_toby_state: 'recovered',
    });
    present(g, 'debunk');
    expect(g.world.meta.flags.a1_lamp_exposed).toBe(true);
    // the debate: say something (a silent speech is no point)
    choose(g, 'debate');
    g.queue('scenes.input', { text: '光会看见的。孩子们喝的是北泉的水。' });
    g.step(3);
    for (let i = 0; i < 10 && sceneView(g.world, g.content)?.nodeId !== 'defense'; i++) {
      g.queue('scenes.advance', {});
      g.step(1);
    }
    expect(g.world.meta.flags.a1_trial_debate).toBe(true);
    closeTrial(g);
    expect(g.world.meta.flags.a1_trial_points).toBe(2);
    expect(g.world.meta.flags.a1_oola_fate).toBe('cleared');
  });

  it('a silent debate is no point: the lamp alone is still convicted', () => {
    const g = atDefense({ a1_grey_lamp_seen: true, 'trust.cassian': 70 });
    present(g, 'debunk');
    choose(g, 'debate');
    g.queue('scenes.input', { text: '' });
    g.step(3);
    for (let i = 0; i < 10 && sceneView(g.world, g.content)?.nodeId !== 'defense'; i++) {
      g.queue('scenes.advance', {});
      g.step(1);
    }
    expect(g.world.meta.flags.a1_trial_debate).toBeUndefined();
    closeTrial(g);
    expect(g.world.meta.flags.a1_trial_points).toBe(1);
    expect(g.world.meta.flags.a1_oola_fate).toBe('convicted');
  });
});

describe('identity exposure from the trial (PK-M1-19 leftover 10)', () => {
  it('Cassian telling the square about the chapel appraisal exposes the player there, once', () => {
    // the chapel appraisal happened in private weeks before
    const g = trialWorld({ a1_cassian_appraise: true });
    g.step(1);
    const exposed = g.world.recent.filter(
      (e) => e.kind === 'identity.exposed' && e.data.kind === 'identity_pageless',
    );
    expect(exposed).toHaveLength(1);
    expect(g.world.meta.flags.a1_trial_light_public).toBe(true);
  });

  it('without a chapel appraisal, the light in the square exposes once (the first set)', () => {
    const g = trialWorld();
    for (let i = 0; i < 30 && !g.world.meta.flags.a1_cassian_appraise; i++) {
      g.queue('scenes.advance', {});
      g.step(1);
    }
    const exposed = g.world.recent.filter(
      (e) => e.kind === 'identity.exposed' && e.data.kind === 'identity_pageless',
    );
    expect(exposed).toHaveLength(1);
    expect(g.world.meta.flags.a1_trial_light_public).toBeUndefined();
  });
});

describe('the reaction table: accusation progress and the trial omen (5.6 rows 2, 4)', () => {
  it('the two rows name their consequence in data; the set is closed', () => {
    const rows = content.npcBrain.reactions;
    const of = (id: string) => rows.find((r) => r.id === id)?.then[0]?.params?.consequence;
    expect(of('heresy_alarm')).toBe('accuse');
    expect(of('challenge')).toBe('omen');
    for (const r of rows)
      for (const t of r.then)
        if (t.params?.consequence)
          expect(REACTION_CONSEQUENCES as readonly string[]).toContain(t.params.consequence);
  });

  /** A context inside one tick of a fresh world. */
  function inTick<T>(fn: (ctx: never) => T): { value: T; g: Engine } {
    const g = Engine.create(3, content as ContentMap, SYSTEMS, { aiMode: 'off' });
    g.step(1);
    const events: string[] = [];
    const ctx = {
      world: g.world,
      content: g.content,
      tick: g.tick,
      emit: (k: string) => events.push(k),
      flag: (k: string) => g.world.meta.flags[k],
      setFlag: (k: string, v: FlagValue) => {
        g.world.meta.flags[k] = v;
      },
    };
    return { value: fn(ctx as never), g };
  }

  it('accuse: church suspicion rises, once per witness per day, clamped to 100', () => {
    const { g } = inTick((ctx) => {
      const c = ctx as unknown as { world: Engine['world'] };
      c.world.meta.flags.church_suspicion = 99;
      expect(applyConsequence(ctx, 'accuse', 'cassian', 'borderstone')).toBe(true);
      // the same witness the same day: no second report
      expect(applyConsequence(ctx, 'accuse', 'cassian', 'borderstone')).toBe(false);
      // another witness reports too, but the case is capped
      expect(applyConsequence(ctx, 'accuse', 'isa', 'borderstone', 5)).toBe(true);
    });
    expect(g.world.meta.flags.church_suspicion).toBe(100);
    expect(ACCUSE_STEP).toBe(1);
  });

  it('omen: the map gets its omen step, once per map per day; unknown names do nothing', () => {
    const { g } = inTick((ctx) => {
      expect(applyConsequence(ctx, 'omen', 'barto', 'borderstone')).toBe(true);
      expect(applyConsequence(ctx, 'omen', 'gaspar', 'borderstone')).toBe(false);
      expect(applyConsequence(ctx, 'omen', 'barto', 'forest_edge')).toBe(true);
      expect(applyConsequence(ctx, 'whatever', 'barto', 'borderstone')).toBe(false);
      expect(applyConsequence(ctx, undefined, 'barto', 'borderstone')).toBe(false);
    });
    expect(typeof g.world.meta.flags['omen.borderstone.law']).toBe('number');
    expect(typeof g.world.meta.flags['omen.forest_edge.law']).toBe('number');
    expect(g.world.meta.flags['omen.borderstone']).toBeUndefined();
    expect(g.world.meta.flags.church_suspicion ?? 0).toBe(0);
  });
});

describe('the reaction table in play: a devout onlooker reports, the church case grows', () => {
  it('cassian, explaining the player by sorcery, sees the pageless exposure: suspicion +1 once', () => {
    const g = topicsGame();
    besides(g, 'cassian');
    runInTick(g, (ctx) => {
      ctx.world.slices.cognition.beliefs.cassian = {
        player: {
          ...newBelief(0, 'player'),
          state: 'explaining',
          publicState: 'explaining',
          explanation: 'sorcery',
          value: 10,
          threshold: 10,
        },
      };
    });
    const events = collect(g);
    setFlags(g, { church_suspicion: 10, a1_cassian_appraise: true });
    g.step(1);
    // the reaction row is heresy_alarm, and its consequence is the accusation step
    const reacted = events.find((e) => e.kind === 'npc.reaction' && e.data.npcId === 'cassian');
    expect(reacted?.kind === 'npc.reaction' && reacted.data.row).toBe('heresy_alarm');
    expect(
      events.some(
        (e) =>
          e.kind === 'npc.consequence' &&
          e.data.npcId === 'cassian' &&
          e.data.consequence === 'accuse',
      ),
    ).toBe(true);
    expect(g.world.meta.flags.church_suspicion).toBe(11);
    // a second exposure the same day: he reacts again, but he already reported today
    setFlags(g, { a1_trial_light_public: true });
    g.step(1);
    const reactions = events.filter(
      (e) =>
        e.kind === 'npc.reaction' && e.data.npcId === 'cassian' && e.data.row === 'heresy_alarm',
    );
    expect(reactions).toHaveLength(2);
    expect(
      events.filter((e) => e.kind === 'npc.consequence' && e.data.npcId === 'cassian'),
    ).toHaveLength(1);
    expect(g.world.meta.flags.church_suspicion).toBe(11);
  });

  it('a lawman matching the player to a hot rumor: the challenge row stamps the law omen', () => {
    const g = topicsGame();
    const guard = content.npcs.find((p) => p.tags?.includes('guard'))?.id;
    if (!guard) throw new Error('no guard persona');
    besides(g, guard);
    const events = collect(g);
    runInTick(g, (ctx) => {
      // the face-to-face match of a hot rumor (cognition's identity_matched, 5.6 row 4)
      ctx.emit('identity.exposed', {
        kind: 'identity_matched',
        mapId: 'borderstone',
        x: playerAt(g).x,
        y: playerAt(g).y,
      });
    });
    g.step(1);
    expect(
      events.some(
        (e) => e.kind === 'npc.reaction' && e.data.npcId === guard && e.data.row === 'challenge',
      ),
    ).toBe(true);
    expect(typeof g.world.meta.flags['omen.borderstone.law']).toBe('number');
    // the goddess's own omen flag is a different family
    expect(g.world.meta.flags['omen.borderstone']).toBeUndefined();
  });

  it('the brain check rejects a reaction row with an unknown consequence', () => {
    const rows = content.npcBrain.reactions.map((r) =>
      r.id === 'challenge'
        ? // biome-ignore lint/suspicious/noThenProperty: `then` is the reaction row's own field
          { ...r, then: [{ ...r.then[0], params: { ...r.then[0]?.params, consequence: 'jail' } }] }
        : r,
    );
    const problems = brainProblems(
      { ...content.npcBrain, reactions: rows } as never,
      {
        inputs: new Set(),
        predicates: new Set(),
        reactionPredicates: REACTION_PREDICATE_NAMES,
        reactionActions: REACTION_ACTIONS,
      } as never,
    );
    expect(problems).toContain('reaction challenge: unknown consequence jail');
    expect(
      brainProblems(content.npcBrain, {
        inputs: new Set(),
        predicates: new Set(),
        reactionPredicates: REACTION_PREDICATE_NAMES,
        reactionActions: REACTION_ACTIONS,
      } as never).filter((p) => p.includes('consequence')),
    ).toEqual([]);
  });

  it('a person who is not devout raises no case (the row does not hold)', () => {
    const g = topicsGame();
    besides(g, 'ron');
    const events = collect(g);
    setFlags(g, { church_suspicion: 10, a1_cassian_appraise: true });
    g.step(1);
    expect(events.some((e) => e.kind === 'npc.consequence')).toBe(false);
    expect(g.world.meta.flags.church_suspicion).toBe(10);
  });
});

describe('the trial table is checked (content validation)', () => {
  it('the shipped table is clean', () => {
    expect(trialProblems(TRIAL, content as ContentMap)).toEqual([]);
  });

  it('names every broken rule: items, points, writes, clears, rebuttals', () => {
    const broken: TrialDef = {
      ...TRIAL,
      clears: 9,
      pieces: [
        {
          id: 'x',
          item: 'no_such_item',
          targets: [{ tribunal: TRIAL.id, point: 'not_a_point', strength: 1 }],
          writes: { evidence: 'a1_trial_evidence' },
        },
      ],
      rebuttals: [],
    };
    const problems = trialProblems(broken, content as ContentMap).join('\n');
    expect(problems).toMatch(/clears must be/);
    expect(problems).toMatch(/unknown item no_such_item/);
    expect(problems).toMatch(/point not_a_point is not one of the trial's/);
    expect(problems).toMatch(/writes a1_trial_evidence for a point it does not prove/);
    expect(problems).toMatch(/no rebuttal for wrong/);
    expect(problems).toMatch(/no rebuttal for forged/);
  });
});

/** The player entity's position (the exposure happens where the player stands). */
function playerAt(g: Engine): { x: number; y: number } {
  const p = playerEntity(g.world);
  if (!p) throw new Error('no player');
  return { x: p.x, y: p.y };
}
