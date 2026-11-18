// The tide night at run time (PK-M1-52; act1_borderstone.md 8.2 to 8.7) in the real game with
// every system and the registry guard on: the night begins on the act clock's start flag,
// walks its phases by the hour and waits at the colossus until it falls, starts the mtide_
// waves through the combat wave runner, settles the lines with the player where the player
// stood, lets the surge hit the weakest face and the striker cut it, and settles dawn (the
// survival band, population, prosperity, credit, the children, trust and memories) with
// `a1_beast_tide_cleared` as the last write. Plus the chooser seam (`tide.act`), save and
// resume, an outside clear, and the overflows and full nests that turn into tides. The
// hour-coarse clock (the long tier of a time skip) carries the night; the player stands
// still, so the samples are the player's line.

import { describe, expect, it } from 'vitest';
import { Engine, worldHash } from '../src/core';
import { createGame } from '../src/game/create';
import { allSystems } from '../src/game/registry';
import { npcMemories } from '../src/systems/npc';
import { readTide, type TideNightDef, tideView, validateTideSlice } from '../src/systems/tide';
import {
  begin,
  fell,
  flags,
  game,
  H,
  NPC_SOURCE as NPC,
  night,
  ofKind,
  SCRIPT,
  set,
  stand,
  strideSystem,
  type T,
  toDawn,
  untilStage,
  wholeNight,
  zzEmitter,
} from './tide_harness';

const DEF = (): TideNightDef =>
  (createGame({ seed: 1, aiMode: 'off' }).content.tideNights ?? [])[0] as TideNightDef;

describe('the night by the hour', () => {
  it('dusk, nightfall, before midnight, midnight; waits at the colossus; surge; dawn an hour later', () => {
    const t = game(7, { a1_forest_accord: 'partial', a1_oola_fate: 'cleared' });
    stand(t, 'north_gate');
    begin(t);
    const start = night(t)?.start ?? 0;
    expect(flags(t).a1_tide_stage).toBe(0);
    expect(flags(t).a1_beast_tide_started).toBe(true);
    untilStage(t, 1);
    expect(night(t)?.phaseTick ?? 0).toBeGreaterThanOrEqual(start + H);
    expect(night(t)?.phaseTick ?? 0).toBeLessThan(start + 2 * H);
    expect(flags(t)['combat.wave.mtide_lotha_rim.state']).toBe('active');
    untilStage(t, 2);
    expect(night(t)?.phaseTick ?? 0).toBeGreaterThanOrEqual(start + 3 * H);
    expect(flags(t)['combat.wave.mtide_lotha_rim_undead.state']).toBe('active');
    // the graveyard was never purified: Ed's two dregs rise there
    expect(flags(t)['combat.wave.mtide_lotha_rim_grave.state']).toBe('active');
    untilStage(t, 3);
    expect(flags(t)['combat.wave.mtide_lotha_rim_colossus.state']).toBe('active');
    // the night stretches past its dawn while the colossus stands
    const longest = start + 14 * H;
    while (t.g.tick < longest) t.g.step(1);
    expect(flags(t).a1_tide_stage).toBe(3);
    expect(flags(t).a1_beast_tide_cleared).toBeUndefined();
    fell(t);
    const fallen = t.g.tick;
    untilStage(t, 4);
    expect(flags(t).a1_tide_weakest).toBeDefined();
    toDawn(t);
    const dawn = ofKind(t, 'tide.ended')[0];
    expect(dawn?.tick ?? 0).toBeGreaterThanOrEqual(fallen + H);
    expect(flags(t).a1_tide_stage).toBe(5);
    // the waves leave with the clear flag (their endOnFlag); combat reports it a second later
    t.stride.on = false;
    t.g.step(40);
    t.stride.on = true;
    expect(flags(t)['combat.wave.mtide_lotha_rim.state']).toBe('cleared');
    // the numbers are written when the surge breaks loose (the fall's scenes read them at
    // once); the clear flag comes at dawn, after every one of them
    const surgeTick = ofKind(t, 'tide.phase').find((e) => e.data.phase === 'surge')?.tick;
    const writes = t.events.flatMap((e) => (e.kind === 'flag.changed' ? [e] : []));
    const tickOf = (k: string) => writes.find((e) => e.data.key === k)?.tick;
    for (const k of [
      'a1_bs_survival',
      'a1_bs_population',
      'a1_bs_prosperity',
      'a1_tide_other_dead',
      'a1_tide_credit',
      'a1_children_location',
    ])
      expect(tickOf(k), k).toBe(surgeTick);
    expect(tickOf('a1_beast_tide_cleared')).toBe(dawn?.tick);
    expect(ofKind(t, 'tide.phase').map((e) => e.data.phase)).toEqual([
      'dusk',
      'wave1',
      'wave2',
      'colossus',
      'surge',
      'dawn',
    ]);
  });

  it('begins once: a night played out another way never runs, a finished night never again', () => {
    const t = game(7, { a1_beast_tide_cleared: true });
    begin(t);
    expect(night(t)).toBeNull();
    expect(readTide(t.g.world)?.done).toEqual(['night_a1_borderstone']);
    const u = game(7);
    wholeNight(u, 'north_gate');
    set(u, 'a1_tide_night', false);
    set(u, 'a1_tide_night', true);
    expect(ofKind(u, 'tide.ended').length).toBe(1);
  });
});

describe('the lines and the player', () => {
  it("a phase passed in a time skip: the post named at dusk is the player's line, +40 and +10s", () => {
    const t = game(7, { 'trust.shiya': 50, 'trust.ron': 10, a1_forest_accord: 'restored' });
    wholeNight(t, 'east_gate');
    const w1 = night(t)?.results.find((r) => r.phase === 'wave1');
    const east = w1?.lines.find((l) => l.line === 'east');
    expect(east?.player).toBe(true);
    // base 10, Gaspar 15, the slope 20, Boro 5, the player 40, Shiya 10
    expect(east?.defence).toBe(100);
    expect(w1?.lines.filter((l) => l.player).map((l) => l.line)).toEqual(['east']);
    expect(night(t)?.playerLine.wave1).toBe('east');
    // the whole phase was skipped: its game time is counted away from the lines
    expect(night(t)?.skipped.wave1).toBeGreaterThanOrEqual(2 * H - H);
    expect(Object.values(night(t)?.samples.wave1 ?? {}).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('played ticks: where the player stood counts over the post named at dusk', () => {
    const t = game(7);
    stand(t, 'west_field');
    set(t, 'a1_tide_post', 'south');
    begin(t);
    untilStage(t, 1);
    // the first wave played tick by tick at the west field (out of the waves' way), the second
    // at the mill
    t.stride.on = false;
    while (flags(t).a1_tide_stage === 1) t.g.step(20);
    stand(t, 'mill');
    while (flags(t).a1_tide_stage === 2) t.g.step(20);
    t.stride.on = true;
    expect(night(t)?.playerLine.wave1).toBe('west');
    expect(night(t)?.playerLine.wave2).toBe('');
    const w1 = night(t)?.samples.wave1 ?? {};
    expect(w1.west ?? 0).toBeGreaterThan(0);
    fell(t);
    toDawn(t);
  }, 300_000);
});

describe('the colossus, the surge and the striker', () => {
  it('the player at the north gate: it comes for the player; Dris alone lives', () => {
    const t = game(7);
    stand(t, 'north_gate');
    begin(t);
    untilStage(t, 3);
    expect(flags(t).a1_colossus_target).toBe('player');
    fell(t);
    toDawn(t);
    expect(flags(t)['npc.dris.dead']).toBeUndefined();
    expect(flags(t).a1_children_exposed).toBeUndefined();
  });

  it('the player away: it goes for the children in the chapel crowd; their marks show; Dris dies', () => {
    const t = game(7);
    wholeNight(t, 'west_field', { away: true });
    expect(flags(t).a1_colossus_target).toBe('children');
    expect(flags(t).a1_children_exposed).toBe(true);
    expect(flags(t)['npc.dris.dead']).toBe(true);
    expect(night(t)?.dead).toContainEqual({ npc: 'dris', phase: 'colossus', cause: 'boss' });
    // the children's people hold it against the player (-20)
    const isa = ofKind(t, 'npc.relation_changed').filter((e) => e.data.from === 'isa');
    expect(isa.some((e) => (e.data.delta.trust ?? 0) < 0)).toBe(true);
  });

  it('the children at the mill are not in a crowd: no exposure', () => {
    const t = game(7, { a1_mill_owner: 'orphanage' });
    wholeNight(t, 'west_field', { away: true });
    expect(flags(t).a1_colossus_target).toBe('children');
    expect(flags(t).a1_children_exposed).toBeUndefined();
    expect(flags(t).a1_children_location).toBe('mill');
  });

  it('the surge hits the weakest face; she cuts it; the drink waits for assessment 5', () => {
    const t = game(7, { 'npc.martha.assessment': 6 });
    wholeNight(t, 'north_gate');
    const weakest = flags(t).a1_tide_weakest;
    expect(['north', 'east', 'south', 'west']).toContain(weakest);
    expect(Number(flags(t).a1_tide_gap_weakest)).toBeGreaterThan(0);
    expect(flags(t).a1_martha_strike).toBe(true);
    expect(flags(t)['npc.martha.revealed']).toBe(true);
    expect(flags(t).a1_martha_drink).toBe(true);
    // a cut surge never comes: its wave is not started
    expect(flags(t)[`combat.wave.mtide_lotha_rim_surge_${String(weakest)}`]).toBeUndefined();
    const surge = night(t)?.results.find((r) => r.phase === 'surge');
    expect(surge?.lines.find((l) => l.line === weakest)?.struck).toBe(true);
    const wary = game(7, { 'npc.martha.assessment': 4 });
    wholeNight(wary, 'north_gate');
    expect(flags(wary).a1_martha_strike).toBe(true);
    expect(flags(wary).a1_martha_drink).toBeUndefined();
  });

  it('a town that holds its weakest face: she watches, the surge comes on', () => {
    const t = game(7);
    // a story wall on every face (the night record of the test only)
    const def = t.g.content.tideNights?.[0] as TideNightDef;
    const walled: TideNightDef = {
      ...def,
      mods: [
        ...(def.mods ?? []),
        ...['north', 'east', 'south', 'west'].map((line) => ({
          when: 'a1_tide_omen',
          line,
          defence: 200,
        })),
      ],
    };
    const content = { ...t.g.content, tideNights: [walled] };
    const g = createGame({
      seed: 7,
      aiMode: 'off',
      flagPolicy: 'throw',
      content,
      systems: [...allSystems(), strideSystem(t.stride)],
    });
    const u: T = { g, events: [], stride: t.stride };
    g.onEvents((evs) => u.events.push(...evs));
    t.stride.on = false;
    g.queue('flag.set', { key: 'act', value: 'act1' }, SCRIPT);
    g.queue('flag.set', { key: 'a1_tide_omen', value: true }, SCRIPT);
    g.step(2);
    t.stride.on = true;
    wholeNight(u, 'north_gate');
    expect(flags(u).a1_tide_gap_weakest).toBe(0);
    expect(flags(u)['npc.martha.revealed']).toBe(false);
    expect(flags(u).a1_martha_strike).toBeUndefined();
    expect(flags(u)[`combat.wave.mtide_lotha_rim_surge_${String(flags(u).a1_tide_weakest)}`]).toBe(
      'go',
    );
  });
});

describe('the people of the night', () => {
  it('the mob nobody stops drags Oola out to the north gate: fled and wounded', () => {
    const t = game(7, { a1_oola_fate: 'convicted', 'npc.cassian.doubt': 0, 'trust.isa': 10 });
    wholeNight(t, 'north_gate');
    expect(ofKind(t, 'tide.mob').length).toBe(1);
    // Cassian refused to open the cell: Noi goes alone, once, in the second beat
    expect(ofKind(t, 'tide.rescue_attempt').map((e) => e.data.phase)).toEqual(['wave2']);
    expect(flags(t).a1_bertha_mob).toBe('dragged');
    expect(flags(t).a1_oola_fate).toBe('fled');
    expect(flags(t).a1_oola_wounded).toBe(true);
  });

  it("Isa in the door (trust 60 or her word given) stops it; the mob scene's own end stands", () => {
    const t = game(7, { a1_oola_fate: 'convicted', 'npc.cassian.doubt': 0, 'trust.isa': 60 });
    wholeNight(t, 'north_gate');
    expect(flags(t).a1_bertha_mob).toBe('isa');
    expect(flags(t).a1_oola_fate).toBe('convicted');
    const u = game(7, {
      a1_oola_fate: 'convicted',
      'npc.cassian.doubt': 0,
      a1_bertha_mob: 'player',
      a1_tide_left_post: true,
    });
    wholeNight(u, 'north_gate');
    expect(flags(u).a1_bertha_mob).toBe('player');
    // the player left the post for the chapel: no player line in the second beat
    expect(night(u)?.playerLine.wave2).toBe('');
    expect(night(u)?.playerLine.wave1).toBe('north');
  });

  it("the forest dispute escalated: Boro or a logger dies at the night's first wave (seeded)", () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const t = game(seed, {
        'dispute.q_a1_d04_forest_dispute.ending': 'broken',
        a1_forest_accord: 'broken',
      });
      stand(t, 'north_gate');
      begin(t);
      untilStage(t, 1);
      const st = night(t);
      const boro = st?.dead.find((d) => d.npc === 'boro' && d.cause === 'escalation');
      seen.add(boro ? 'boro' : st?.extraDeaths === 1 ? 'logger' : 'none');
    }
    expect([...seen].sort()).toEqual(['boro', 'logger']);
  });

  it('a named death takes the person off the map', () => {
    const t = game(3, { a1_forest_accord: 'broken' });
    wholeNight(t, 'west_field');
    const dead = night(t)?.dead.map((d) => d.npc) ?? [];
    expect(dead).toContain('boro');
    const st = t.g.world.slices.npc.npcs.boro;
    expect(st?.gone).toBe('dead');
    expect(t.g.world.slices.world.entities[st?.entityId ?? '']).toBeUndefined();
    expect(flags(t).a1_tide_other_dead).toBe(
      dead.filter((n) => !['boro', 'dris', 'barto', 'gaspar'].includes(n)).length,
    );
  });

  it('dawn writes the outputs, the trust and the memories (a night worked by hand)', () => {
    // the slope at peace and inside, the fence repaired, Shiya with the player at the east
    // fence; Barto without reason to stay, Moss in the cell, the band active, Oola held
    const t = game(7, {
      'trust.shiya': 50,
      'trust.ron': 10,
      'trust.barto': 0,
      a1_forest_pact_proof: true,
      a1_wolf_den: 'cleared',
      a1_logger_saved: true,
      'a1_tide_prep.east_fence': true,
      a1_moss_fate: 'arrested',
    });
    wholeNight(t, 'east_gate');
    const res = night(t)?.results ?? [];
    const lineOf = (ph: string, l: string) =>
      res.find((r) => r.phase === ph)?.lines.find((x) => x.line === l);
    // wave 1: east 10 + 15 fence + 15 Gaspar + 20 slope + 5 Boro + 40 player + 10 Shiya
    expect(lineOf('wave1', 'east')).toMatchObject({ defence: 115, pressure: 60, gap: 0 });
    // west 5 vs 15: one death, times Nera's 0.95 (neutral)
    expect(lineOf('wave1', 'west')).toMatchObject({ defence: 5, pressure: 15, gap: 10 });
    expect(lineOf('wave1', 'west')?.deaths).toBeCloseTo(0.95, 10);
    // beat 2: north 20 - 5 (Jed) vs 60, the orphanage damaged; south 15 + 5 (Ron) - 5 (the
    // raid) vs 20 + 10 (the graveyard)
    expect(lineOf('wave2', 'north')).toMatchObject({ defence: 15, pressure: 60, gap: 45 });
    expect(lineOf('wave2', 'north')?.damaged).toEqual(['orphanage']);
    expect(lineOf('wave2', 'south')).toMatchObject({ defence: 15, pressure: 30, gap: 15 });
    // the surge on the west (5, the call 10) is cut
    expect(lineOf('surge', 'west')).toMatchObject({ defence: 15, pressure: 100, struck: true });
    const sum = night(t)?.summary;
    // 0.95 + 3.8 + 0.95 = 5.7, rounded to 6: damaged
    expect(sum?.civilians).toBe(6);
    expect(flags(t).a1_bs_survival).toBe('damaged');
    expect(flags(t).a1_bs_population).toBe(794);
    expect(flags(t).a1_bs_prosperity).toBe(45);
    expect(flags(t).a1_tide_other_dead).toBe(0);
    expect(flags(t).a1_tide_credit).toBe('martha');
    expect(flags(t).a1_children_location).toBe('orphanage');
    expect(sum?.losses).toEqual(['company']);
    // Shiya held the east fence with the player in both waves, unsaved: +15 once
    const shiya = ofKind(t, 'npc.relation_changed').filter(
      (e) => e.data.from === 'shiya' && e.data.to === 'player',
    );
    // (the NPC system scales the +15 by her temper: stubborn)
    expect(shiya.length).toBe(1);
    expect(shiya[0]?.data.reason).toEqual({ key: 'sys.tide.reason.same_line' });
    expect(shiya[0]?.data.delta.trust ?? 0).toBeGreaterThan(0);
    expect(npcMemories(t.g.world, 'gaspar').some((m) => m.tag === 'tide')).toBe(true);
    const ended = ofKind(t, 'tide.ended')[0];
    expect(ended?.data).toMatchObject({ civilians: 6, survival: 'damaged', credit: 'martha' });
    expect(ended?.data.tellers).toEqual(['dora']);
  });

  it('the children at dawn: Toby untreated in stage three dies; Lin never ill is healthy', () => {
    const t = game(7, { 'sed_case.toby': 'crystal' });
    wholeNight(t, 'north_gate');
    expect(flags(t).a1_toby_state).toBe('dead');
    const u = game(7, { 'sed_case.toby': 'crystal', a1_toby_state: 'recovered' });
    wholeNight(u, 'north_gate');
    expect(flags(u).a1_toby_state).toBe('recovered');
  });

  it("a tide before Toby's deadline: he dies once his stage three comes after the night", () => {
    const t = game(7, { 'sed_case.toby': 'fever' });
    wholeNight(t, 'north_gate');
    expect(flags(t).a1_toby_state).toBeUndefined();
    expect(readTide(t.g.world)?.pendingChildren).toContain('a1_toby_state');
    set(t, 'sed_case.toby', 'crystal');
    t.g.step(2);
    expect(flags(t).a1_toby_state).toBe('dead');
    expect(readTide(t.g.world)?.pendingChildren).not.toContain('a1_toby_state');
  });
});

describe('the chooser seam, saves and the edges', () => {
  it('tide.act: a legal row from the NPC brain holds from the next phase; the rest are refused', () => {
    const t = game(7, { 'trust.barto': 60, a1_barto_family_safe: true });
    stand(t, 'north_gate');
    t.g.queue('tide.act', { actor: 'barto', row: 'chapel' }, NPC);
    t.stride.on = false;
    t.g.step(1);
    begin(t);
    t.g.queue('tide.act', { actor: 'barto', row: 'chapel' }, NPC);
    t.g.queue('tide.act', { actor: 'barto', row: 'withdraw' }, NPC);
    t.g.queue('tide.act', { actor: 'barto', row: 'chapel' }, { type: 'player' });
    t.g.queue('tide.act', { actor: 'nobody', row: 'x' }, NPC);
    t.g.step(1);
    t.stride.on = true;
    const codes = ofKind(t, 'command.result')
      .filter((e) => e.data.kind === 'tide.act')
      .map((e) => e.data.code);
    // before the night: no night; then the row the table rules out ("otherwise" while a
    // condition holds), the player, the unknown actor
    expect(codes).toEqual(['no_night', 'bad_row', 'not_allowed', 'unknown']);
    // nobody picks a row at dusk
    expect(night(t)?.picks.dusk).toBeUndefined();
    untilStage(t, 1);
    expect(night(t)?.picks.wave1?.barto).toEqual(['chapel']);
    expect(night(t)?.chosen.barto).toBe('chapel');
    fell(t);
    toDawn(t, 60);
  });

  it('same seed, same night; a save in the middle resumes to the same dawn', () => {
    const state = { a1_forest_accord: 'broken', a1_oola_fate: 'convicted' };
    const a = game(11, state);
    const b = game(11, state);
    for (const t of [a, b]) {
      stand(t, 'east_gate');
      begin(t);
      untilStage(t, 2);
    }
    const saved = JSON.parse(JSON.stringify(b.g.world));
    expect(validateTideSlice(saved.slices.tide)).toEqual([]);
    const c: T = {
      g: Engine.resume(saved, b.g.content, b.g.systems, { aiMode: 'off' }),
      events: [],
      stride: b.stride,
    };
    for (const t of [a, c]) {
      untilStage(t, 3);
      stand(t, 'north_gate');
      fell(t);
      toDawn(t);
    }
    expect(night(c)?.summary).toEqual(night(a)?.summary);
    expect(worldHash(c.g.world)).toBe(worldHash(a.g.world));
  });

  it('cleared from outside (an older scripted tide): the night settles what it reached and ends', () => {
    const t = game(7);
    stand(t, 'north_gate');
    begin(t);
    untilStage(t, 2);
    set(t, 'a1_beast_tide_cleared', true);
    t.g.step(1);
    expect(night(t)?.ended).toBe(true);
    expect(night(t)?.results.map((r) => r.phase)).toEqual(['wave1', 'wave2']);
    expect(flags(t).a1_bs_survival).toBeDefined();
  });
});

describe('more edges of the night', () => {
  it('the colossus turning on a marked child (combat.door_seek) shows their marks in the crowd', () => {
    const t = game(7);
    stand(t, 'north_gate');
    begin(t);
    untilStage(t, 3);
    expect(flags(t).a1_colossus_target).toBe('player');
    expect(flags(t).a1_children_exposed).toBeUndefined();
    t.g.queue('zz.seek', { reason: 'player' }, SCRIPT);
    t.g.step(1);
    expect(flags(t).a1_children_exposed).toBeUndefined();
    t.g.queue('zz.seek', { reason: 'mark' }, SCRIPT);
    t.g.step(1);
    expect(flags(t).a1_children_exposed).toBe(true);
    fell(t);
    toDawn(t);
  });

  it('children kept where the player sees them (A1-M11) are not exposed', () => {
    const t = game(7, { 'a1_tide_prep.children_safe': true });
    wholeNight(t, 'west_field', { away: true });
    expect(flags(t).a1_colossus_target).toBe('children');
    expect(flags(t).a1_children_exposed).toBeUndefined();
  });

  it('cleared from outside while the colossus stands: no surge, no strike, the night ends', () => {
    const t = game(7);
    stand(t, 'north_gate');
    begin(t);
    untilStage(t, 3);
    set(t, 'a1_beast_tide_cleared', true);
    t.g.step(1);
    expect(night(t)?.ended).toBe(true);
    expect(night(t)?.results.map((r) => r.phase)).toEqual(['wave1', 'wave2']);
    expect(flags(t).a1_martha_strike).toBeUndefined();
    expect(flags(t).a1_tide_weakest).toBeUndefined();
    expect(ofKind(t, 'tide.ended').length).toBe(1);
  });

  it('a striker dead before the surge neither strikes nor watches: the surge comes on', () => {
    const t = game(7, { 'npc.martha.dead': true });
    wholeNight(t, 'north_gate');
    const weakest = String(flags(t).a1_tide_weakest);
    expect(Number(flags(t).a1_tide_gap_weakest)).toBeGreaterThan(0);
    expect(flags(t).a1_martha_strike).toBeUndefined();
    expect(flags(t)['npc.martha.revealed']).toBeUndefined();
    expect(flags(t)[`combat.wave.mtide_lotha_rim_surge_${weakest}`]).toBe('go');
    const surge = night(t)?.results.find((r) => r.phase === 'surge');
    const face = surge?.lines.find((l) => l.line === weakest);
    expect(face?.struck).toBeUndefined();
    expect(face?.deaths ?? 0).toBeGreaterThan(0);
    expect(flags(t).a1_tide_credit).not.toBe('martha');
  });

  it('a badly hurt named person carries the injury after the night', () => {
    const t = game(3, { a1_forest_accord: 'broken', 'trust.barto': 0 });
    wholeNight(t, 'west_field');
    const hurt = night(t)?.injured ?? [];
    expect(hurt.length).toBeGreaterThan(0);
    // each person listed once, the injury written for them
    expect(new Set(hurt.map((h) => h.npc)).size).toBe(hurt.length);
    for (const h of hurt) expect(flags(t)[`npc.${h.npc}.injury`], h.npc).toBe('major');
  });

  it('Lin: ill and untreated at the night she dies; never ill she is healthy once week 9 passed', () => {
    const t = game(7, { 'sed_case.lin': 'fever' });
    wholeNight(t, 'north_gate');
    // ill and untreated when the night ends: she dies at dawn (7.2)
    expect(flags(t).a1_lin_state).toBe('dead');
    const u = game(7);
    wholeNight(u, 'north_gate');
    expect(flags(u).a1_lin_state).toBeUndefined();
    expect(readTide(u.g.world)?.pendingChildren).toContain('a1_lin_state');
    set(u, 'act_week', 10);
    u.g.step(2);
    expect(flags(u).a1_lin_state).toBe('healthy');
  });

  it("the scene's compute tide_attribution settles the credit again on the night's witnesses", () => {
    const t = game(7, { 'npc.martha.dead': true, church_suspicion: 10 });
    wholeNight(t, 'north_gate');
    expect(flags(t).a1_tide_credit).toBe('self_collapse');
    // a grasped core seen by the crowd raises the church's suspicion before the dawn scene
    set(t, 'church_suspicion', 45);
    t.g.queue('zz.compute', {}, SCRIPT);
    t.g.step(1);
    expect(flags(t).a1_tide_credit).toBe('light');
    expect(night(t)?.summary?.credit).toBe('light');
    expect(night(t)?.summary?.tellers).toEqual(['bertha', 'cassian']);
  });

  it('the view the client reads: phase, stage, the settled lines and the summary', () => {
    const t = game(7);
    stand(t, 'north_gate');
    begin(t);
    untilStage(t, 2);
    const mid = tideView(t.g.world, t.g.content);
    expect(mid).toMatchObject({ night: 'night_a1_borderstone', phase: 'wave2', stage: 2 });
    expect(mid?.results.map((r) => r.phase)).toEqual(['wave1']);
    expect(mid?.summary).toBeUndefined();
    untilStage(t, 3);
    fell(t);
    toDawn(t);
    const end = tideView(t.g.world, t.g.content);
    expect(end).toMatchObject({ phase: 'dawn', stage: 5 });
    expect(end?.summary?.credit).toBe(flags(t).a1_tide_credit);
  });
});

describe('overflows and full nests into tides', () => {
  it('an overflow toward Borderstone starts the rim tide, once per region per 14 days', () => {
    const t = game(7);
    t.g.queue('zz.overflow', { dungeonId: 'dg_old_mine', toMap: 'borderstone' }, SCRIPT);
    t.g.step(1);
    const first = ofKind(t, 'tide.surge')[0];
    expect(first?.data).toMatchObject({
      rule: 'surge_lotha_rim_overflow',
      waves: ['mtide_lotha_rim_wild'],
      rested: false,
    });
    expect(flags(t)['combat.wave.mtide_lotha_rim_wild.state']).toBe('active');
    t.g.queue('zz.nest', { nestId: 'nest_any', stage: 3 }, SCRIPT);
    t.g.queue('zz.overflow', { dungeonId: 'dg_old_mine', toMap: 'borderstone' }, SCRIPT);
    t.g.step(1);
    expect(
      ofKind(t, 'tide.surge')
        .slice(1)
        .map((e) => e.data.rested),
    ).toEqual([true]);
    // an overflow toward a place with no rule, or one with no settlement: nothing
    t.g.queue('zz.overflow', { dungeonId: 'dg_old_mine', toMap: 'wallenburg' }, SCRIPT);
    t.g.queue('zz.overflow', { dungeonId: 'dg_old_mine' }, SCRIPT);
    t.g.step(1);
    expect(ofKind(t, 'tide.surge').length).toBe(2);
    // past the cooldown the region may surge again, but the spent signal blocks the waves
    // until combat clears it (a request to combat); the region does not rest on a blocked tide
    const later = (readTide(t.g.world)?.cooldown.edgestone_area ?? 0) + 1;
    while (t.g.tick < later) t.g.step(1);
    t.g.queue('zz.overflow', { dungeonId: 'dg_old_mine', toMap: 'borderstone' }, SCRIPT);
    t.g.step(1);
    const third = ofKind(t, 'tide.surge')[2];
    expect(third?.data).toMatchObject({
      waves: [],
      blocked: ['mtide_lotha_rim_wild'],
      rested: false,
    });
    expect(readTide(t.g.world)?.cooldown.edgestone_area ?? 0).toBeLessThan(t.g.tick);
  });

  it('a nest grows full on a rim map: the same rule family, below full nothing', () => {
    const t = game(7);
    const nests = [{ id: 'nest_zz', name: 'zz', act: 'act1', mapId: 'forest_edge', location: 'x' }];
    const content = { ...t.g.content, nests: nests as never };
    const g = createGame({
      seed: 7,
      aiMode: 'off',
      content,
      systems: [...allSystems(), zzEmitter],
    });
    const u: T = { g, events: [], stride: { on: false } };
    g.onEvents((evs) => u.events.push(...evs));
    g.queue('zz.nest', { nestId: 'nest_zz', stage: 2 }, SCRIPT);
    g.step(1);
    expect(ofKind(u, 'tide.surge').length).toBe(0);
    g.queue('zz.nest', { nestId: 'nest_zz', stage: 3 }, SCRIPT);
    g.step(1);
    expect(ofKind(u, 'tide.surge')[0]?.data).toMatchObject({
      rule: 'surge_lotha_rim_nest',
      source: 'nest_zz',
      rested: false,
    });
  });
});

describe('the record', () => {
  it('the shipped night names the act 1 variables it writes', () => {
    const def = DEF();
    expect(def.start).toBe('a1_tide_night');
    expect(def.vars.cleared).toBe('a1_beast_tide_cleared');
    expect(def.vars.credit).toBe('a1_tide_credit');
    expect(def.vars.survival).toBe('a1_bs_survival');
  });
});
