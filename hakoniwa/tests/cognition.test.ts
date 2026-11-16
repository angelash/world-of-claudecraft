// Cognition system: witnessing and the "mortals do not believe" state machine (the
// Ron example of reputation_and_cognition.md 3.8), rumors with distortion, caps and
// eyewitness fact checks, reputation, appraisal display rules (D-029), pressure sense
// and the comedy throttle. Runs the real kernel with the social systems.

import { describe, expect, it } from 'vitest';
import type { ContentPack } from '../src/content/pack';
import { pack as cognitionPack } from '../src/content/packs/cognition';
import { pack as dialoguePack } from '../src/content/packs/dialogue';
import { pack as inventoryPack } from '../src/content/packs/inventory';
import { pack as npcPack } from '../src/content/packs/npc';
import { pack as worldPack } from '../src/content/packs/world';
import { Engine, type EngineOptions, ok } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import { tr } from '../src/core/text';
import { TICKS_PER_GAME_DAY, tickAtDay } from '../src/core/time';
import { t } from '../src/shared_ui/i18n';
import {
  appraise,
  beliefView,
  circulatingRumors,
  system as cognition,
  pressureSense,
  reputationOf,
} from '../src/systems/cognition';
import { addHolding, distortionOf, tryTell } from '../src/systems/cognition/rumor';
import type { RumorVersion } from '../src/systems/cognition/types';
import { system as dialogue } from '../src/systems/dialogue';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { system as npc, npcEntityId } from '../src/systems/npc';
import { getEntity, spawnEntity, system as world } from '../src/systems/world';

declare module '../src/core/contracts' {
  interface CommandMap {
    'zz_cog.run': Record<string, never>;
    'zz_cog.feat': { kind: string; tier: number; targetId?: string };
  }
}

// ---------------------------------------------------------------------------
// harness

let pendingFn: ((ctx: SystemContext) => void) | null = null;
const probe: GameSystem = {
  id: 'zz_cog_probe',
  order: 21,
  commands: {
    'zz_cog.run'(ctx) {
      pendingFn?.(ctx);
      pendingFn = null;
      return ok();
    },
    /** stands in for combat: the player performs a deed where they stand */
    'zz_cog.feat'(ctx, d) {
      const p = getEntity(ctx.world, 'player');
      if (!p) return ok();
      ctx.emit('feat.performed', {
        actorId: 'player',
        kind: d.kind,
        tier: d.tier,
        mapId: p.mapId,
        x: p.x,
        y: p.y,
        targetId: d.targetId,
      });
      return ok();
    },
  },
};

function merge(packs: ContentPack[]): ContentMap {
  const out: Record<string, unknown> = {};
  for (const p of packs)
    for (const [k, v] of Object.entries(p.tables)) {
      const prev = out[k];
      out[k] = Array.isArray(prev) && Array.isArray(v) ? [...prev, ...v] : v;
    }
  return out as unknown as ContentMap;
}

const CONTENT = merge([worldPack, inventoryPack, npcPack, cognitionPack, dialoguePack]);
const SYSTEMS = [world, inventory, modifiers, npc, dialogue, cognition, probe];

function game(seed = 7, opts: EngineOptions = {}): Engine {
  return Engine.create(seed, CONTENT, SYSTEMS, opts);
}

function runInTick(g: Engine, fn: (ctx: SystemContext) => void): void {
  pendingFn = fn;
  g.queue('zz_cog.run', {});
  g.step(1);
}

function stepTo(g: Engine, day: number, hour: number, minute = 1): void {
  const t = tickAtDay(day, hour, minute);
  if (t > g.tick) g.step(t - g.tick);
}

const GUILD = { x: 36.5, y: 13.5 };

/** Mid-morning at the guild hall: the player stands at the counter, given NPCs right beside. */
function atGuild(g: Engine, beside: string[]): void {
  stepTo(g, 0, 10);
  g.queue('world.teleport', { entityId: 'player', mapId: 'borderstone', x: GUILD.x, y: GUILD.y });
  beside.forEach((id, i) => {
    g.queue('world.teleport', {
      entityId: npcEntityId(id),
      mapId: 'borderstone',
      x: GUILD.x - 1 + (i % 3),
      y: GUILD.y + (i < 3 ? -1 : 1),
    });
  });
  g.step(1);
}

function lines(g: Engine): { who: string; text: string; kind: string }[] {
  return g.world.recent
    .filter(
      (e): e is Extract<AnyWorldEvent, { kind: 'dialogue.line' }> => e.kind === 'dialogue.line',
    )
    .map((e) => ({ who: t(e.data.speakerName), text: t(e.data.text), kind: e.data.kind }));
}

function results(g: Engine, kind: string) {
  return g.world.recent
    .filter(
      (e): e is Extract<AnyWorldEvent, { kind: 'command.result' }> => e.kind === 'command.result',
    )
    .filter((e) => e.data.kind === kind);
}

// ---------------------------------------------------------------------------

describe('witnessing and the mortals-do-not-believe machine', () => {
  it('explains a solo elite kill away: mostly "前人打残" among adventurers who see it up close', () => {
    let wounded = 0;
    let spokeOfIt = 0;
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (const seed of seeds) {
      const g = game(seed);
      atGuild(g, ['ron']);
      g.queue('zz_cog.feat', { kind: 'elite_kill', tier: 2 });
      g.step(1);
      const v = beliefView(g.world, g.content, 'ron', 'player');
      expect(v?.state).toBe('explaining');
      expect(['前人打残', '作弊或骗局']).toContain(v?.explanation);
      if (v?.explanation === '前人打残') {
        wounded++;
        // his eyewitness account carries the explanation into every retelling
        expect(g.world.slices.cognition.holdings.ron?.[0]?.v.explanation).toBe('wounded');
        if (lines(g).some((l) => l.who === '罗恩' && l.text.includes('打残'))) spokeOfIt++;
      }
    }
    // the class order puts "wounded by others" first with a 3:1 weight
    expect(wounded).toBeGreaterThanOrEqual(seeds.length / 2);
    // at most two people speak up per deed; the joke is said out loud in most worlds
    expect(spokeOfIt).toBeGreaterThan(0);
  });

  it('keeps stubborn witnesses in plain doubt and ignores sleepers and other maps', () => {
    const g = game(3);
    atGuild(g, ['dris', 'ron']);
    g.queue('zz_cog.feat', { kind: 'elite_kill', tier: 2 });
    g.step(1);
    // Dris (stubborn): threshold 22.4, five points of sight is not yet a third of it
    expect(beliefView(g.world, g.content, 'dris', 'player')?.state).toBe('doubt');
    // the priest is in his chapel, the inquisitor in another city
    expect(beliefView(g.world, g.content, 'selene', 'player')).toBeNull();
    expect(g.world.slices.cognition.beliefs.selene?.player).toBeUndefined();
    // memory and rumor holding for the eyewitness
    expect(
      g.world.slices.npc.minds.ron?.mem.some((m) => m.src === 'seen' && m.about === 'player'),
    ).toBe(true);
    expect(g.world.slices.cognition.holdings.ron?.[0]?.from).toBe('seen');
  });

  it('walks Ron through 前人打残, 作弊, 隐藏身份 to "……好吧，可能。" (3.8)', () => {
    // find a world where Ron's first explanation is "wounded by others"
    let g: Engine | null = null;
    for (let seed = 1; seed < 40 && !g; seed++) {
      const t = game(seed);
      atGuild(t, ['ron']);
      t.queue('zz_cog.feat', { kind: 'elite_kill', tier: 2 });
      t.step(1);
      if (t.world.slices.cognition.beliefs.ron?.player?.explanation === 'wounded') g = t;
    }
    if (!g) throw new Error('no seed with the canonical first explanation');
    const b = () => g?.world.slices.cognition.beliefs.ron?.player;
    expect(b()?.value).toBe(5);
    expect(b()?.threshold).toBeCloseTo(16, 5);
    // the intact head of the nest boss: physical evidence refutes "wounded"
    g.queue(
      'cognition.evidence',
      { observerId: 'ron', subjectId: 'player', kind: 'physical', note: '完整的巢主首级' },
      { type: 'script', script: 'test' },
    );
    g.step(1);
    expect(b()?.refuted).toContain('wounded');
    expect(['cheat', 'hidden_identity']).toContain(b()?.explanation);
    expect(b()?.state).toBe('explaining');
    // the same kind of deed again, right in front of him
    g.queue('world.teleport', {
      entityId: npcEntityId('ron'),
      mapId: 'borderstone',
      x: GUILD.x - 1,
      y: GUILD.y,
    });
    g.queue('zz_cog.feat', { kind: 'elite_kill', tier: 2 });
    g.step(2);
    expect(b()?.evidence.some((e) => e.kind === 'repeat')).toBe(true);
    expect(b()?.refuted).toEqual(expect.arrayContaining(['wounded', 'cheat', 'hidden_identity']));
    expect(b()?.value).toBeGreaterThanOrEqual(16);
    expect(b()?.state).toBe('worship');
    expect(lines(g).some((l) => l.who === '罗恩' && l.text === '……好吧，可能。')).toBe(true);
    expect(beliefView(g.world, g.content, 'ron', 'player')?.lastFeat?.explanation).toEqual(
      tr('sys.cognition.category.real'),
    );
    expect(b()?.log.length).toBeGreaterThan(3);
  });

  it('lets beastkin believe their eyes at once and not care about rumors', () => {
    const g = game(5);
    atGuild(g, ['shiya']);
    g.queue('zz_cog.feat', { kind: 'elite_kill', tier: 2 });
    g.step(1);
    expect(['worship', 'accepted']).toContain(
      g.world.slices.cognition.beliefs.shiya?.player?.state,
    );
    // gorn only hears about it: rumors carry no weight for him
    runInTick(g, (ctx) => {
      const r = Object.values(ctx.world.slices.cognition.rumors)[0];
      if (!r) throw new Error('no rumor');
      for (let i = 0; i < 30; i++)
        if (tryTell(ctx, 'shiya', 'gorn', 'borderstone', 'camp', false)) break;
    });
    const gorn = g.world.slices.cognition.beliefs.gorn?.player;
    expect(gorn?.value ?? 0).toBe(0);
    expect(['unaware', 'doubt']).toContain(gorn?.state ?? 'unaware');
  });
});

describe('rumors', () => {
  it('spreads through town within a day, distorts, and keeps distortion bounded', () => {
    const g = game(11);
    atGuild(g, ['ron', 'lina', 'dris']);
    g.queue('zz_cog.feat', { kind: 'elite_kill', tier: 2 });
    g.step(1);
    g.step(TICKS_PER_GAME_DAY);
    const [r] = circulatingRumors(g.world, g.content, 'player');
    expect(r).toBeDefined();
    if (!r) return;
    const holders = r.versions.reduce((n, v) => n + v.holders, 0);
    expect(holders).toBeGreaterThan(10);
    expect(r.versions.some((v) => v.distortion > 0)).toBe(true);
    const slice = g.world.slices.cognition;
    for (const list of Object.values(slice.holdings))
      for (const h of list) {
        expect(h.v.distortion).toBeGreaterThanOrEqual(0);
        expect(h.v.distortion).toBeLessThanOrEqual(1);
        expect(h.v.story).toBe(h.v.distortion >= 0.8);
        expect(h.cred).toBeLessThanOrEqual(1);
      }
    // at most three mainstream versions on a map beyond what the eyewitnesses saw
    const keys = new Set<string>();
    const seenKeys = new Set<string>();
    for (const [holder, list] of Object.entries(slice.holdings)) {
      if (g.world.slices.npc.npcs[holder]?.mapId !== 'borderstone') continue;
      for (const h of list) {
        if (h.rumor !== r.id) continue;
        const k = `${h.v.subject}|${h.v.explanation ?? ''}|${h.v.template ?? ''}`;
        keys.add(k);
        if (h.from === 'seen') seenKeys.add(k);
      }
    }
    expect(keys.size).toBeLessThanOrEqual(Math.max(3, seenKeys.size));
    // townsfolk mostly heard it and the heat cooled once at midnight
    expect(r.heat).toBeLessThan(0.55);
    const rep = reputationOf(g.world, g.content);
    expect(rep.regions.find((x) => x.id === 'borderstone')?.fame).toBeGreaterThan(0.3);
    expect(rep.regions.find((x) => x.id === 'wallenburg')?.fameBand).toEqual(
      tr('sys.cognition.fame.unknown'),
    );
    expect(rep.regions.find((x) => x.id === 'borderstone')?.mainstream.length).toBeGreaterThan(0);
  });

  it('has eyewitnesses set an outlandish version straight', () => {
    const g = game(13);
    atGuild(g, ['ron']);
    g.queue('zz_cog.feat', { kind: 'elite_kill', tier: 2 });
    g.step(1);
    let told = false;
    runInTick(g, (ctx) => {
      const slice = ctx.world.slices.cognition;
      const r = Object.values(slice.rumors)[0];
      if (!r) throw new Error('no rumor');
      const wild: RumorVersion = {
        ...r.truth,
        details: [],
        subject: 'martha',
        template: 'witch',
        count: 9,
        when: 1,
      };
      wild.distortion = distortionOf(r.truth, wild);
      wild.story = false;
      addHolding(slice, 'dora', {
        rumor: r.id,
        v: wild,
        cred: 0.6,
        from: 'bertha',
        origin: 'bertha',
        hops: 2,
        tick: ctx.tick,
        believed: true,
        told: 0,
      });
      ctx.world.slices.npc.playerMap = 'borderstone';
      for (let i = 0; i < 40 && !told; i++)
        told = tryTell(ctx, 'dora', 'ron', 'borderstone', 'tavern', true);
    });
    expect(told).toBe(true);
    const dora = g.world.slices.cognition.holdings.dora?.[0];
    expect(dora?.v.subject).toBe('player');
    expect(
      g.world.recent.some(
        (e) =>
          e.kind === 'dialogue.line' &&
          t(e.data.speakerName) === '罗恩' &&
          typeof e.data.text === 'object' &&
          'key' in e.data.text &&
          e.data.text.key === 'sys.cognition.line.correct',
      ),
    ).toBe(true);
  });

  it('anchors versions with a public fact and refuses player-made facts', () => {
    const g = game(17);
    atGuild(g, ['lina', 'ron']);
    g.queue('zz_cog.feat', { kind: 'elite_kill', tier: 2 });
    g.step(1);
    g.step(TICKS_PER_GAME_DAY / 2);
    g.queue('cognition.publish', { mapId: 'borderstone', subjectId: 'player' });
    g.step(1);
    expect(results(g, 'cognition.publish').at(-1)?.data.code).toBe('not_allowed');
    g.queue(
      'cognition.publish',
      { mapId: 'borderstone', subjectId: 'player' },
      { type: 'script', script: 'notice' },
    );
    g.step(1);
    const slice = g.world.slices.cognition;
    for (const [holder, list] of Object.entries(slice.holdings)) {
      if (g.world.slices.npc.npcs[holder]?.mapId !== 'borderstone') continue;
      for (const h of list)
        if (slice.rumors[h.rumor]?.subject === 'player')
          expect(h.v.distortion).toBeLessThanOrEqual(0.3);
    }
  });
});

describe('appraisal (D-029) and pressure', () => {
  it('reads levels, caps, unknowns, fragments and the talent door', () => {
    const g = game(19);
    stepTo(g, 0, 10);
    g.queue('world.teleport', { entityId: 'player', mapId: 'borderstone', x: 18.5, y: 26.5 });
    g.queue('world.teleport', {
      entityId: npcEntityId('martha'),
      mapId: 'borderstone',
      x: 19.5,
      y: 26.5,
    });
    g.queue('world.teleport', {
      entityId: npcEntityId('ron'),
      mapId: 'borderstone',
      x: 17.5,
      y: 26.5,
    });
    g.step(1);
    const w = g.world;
    expect(appraise(w, CONTENT, 'player', npcEntityId('martha'), 'crystal')?.display).toBe('34+');
    expect(appraise(w, CONTENT, 'player', npcEntityId('martha'), 'guild')?.display).toBe('Lv43');
    expect(appraise(w, CONTENT, 'player', npcEntityId('martha'), 'skill')?.display).toEqual(
      tr('sys.cognition.appraise.unknown'),
    );
    expect(appraise(w, CONTENT, 'player', npcEntityId('martha'), 'sense')?.display).toEqual(
      tr('sys.cognition.appraise.calm'),
    );
    const ron = appraise(w, CONTENT, 'player', npcEntityId('ron'), 'skill');
    expect(ron?.display).toBe('Lv11');
    expect(ron?.potential).toBeUndefined();
    g.queue('flag.set', { key: 'feature.appraise_talent', value: true });
    g.queue('cognition.appraise', { observerId: 'player', targetId: npcEntityId('ron') });
    g.step(1);
    const ev = g.world.recent.filter((e) => e.kind === 'cognition.appraised').at(-1);
    expect(ev?.kind === 'cognition.appraised' && ev.data.potential).toBe('统帅');
    runInTick(g, (ctx) =>
      spawnEntity(ctx, {
        id: 'wolf_t',
        kind: 'monster',
        name: '灰狼',
        mapId: 'borderstone',
        x: 18.5,
        y: 27.5,
        faction: 'monster',
        appearance: { base: 'wolf', colors: ['#555555', '#777777', '#999999', '#333333'] },
        tags: ['monster', 'lvl:5', 'tier:0'],
      }),
    );
    const wolf = appraise(g.world, CONTENT, 'player', 'wolf_t', 'crystal');
    expect(wolf?.display).toEqual(
      tr('sys.cognition.appraise.fragment', { name: '灰狼', display: 'Lv5' }),
    );
    expect(wolf?.kind).toBe('fragment');
  });

  it('shows 无记载 for the player, counts it against them and throttles the joke', () => {
    const g = game(23);
    atGuild(g, ['lina', 'ron', 'cassian']);
    g.queue(
      'cognition.appraise',
      { observerId: npcEntityId('lina'), targetId: 'player', device: 'crystal' },
      { type: 'script', script: 'register' },
    );
    g.step(1);
    const ev = g.world.recent.filter((e) => e.kind === 'cognition.appraised').at(-1);
    expect(ev?.kind === 'cognition.appraised' && ev.data.display).toEqual(
      tr('sys.cognition.appraise.no_record'),
    );
    expect(lines(g).some((l) => l.who === '莉娜' && l.text.includes('又坏了'))).toBe(true);
    expect(
      g.world.slices.cognition.beliefs.ron?.player?.evidence.some((e) => e.kind === 'appraisal'),
    ).toBe(true);
    expect(reputationOf(g.world, g.content).factions.find((f) => f.id === 'guild')?.label).toEqual(
      tr('sys.cognition.reputation.crystal_glitch'),
    );
    // the same joke twice on one day is not told twice
    const before = lines(g).filter((l) => l.who === '莉娜').length;
    g.queue(
      'cognition.appraise',
      { observerId: npcEntityId('lina'), targetId: 'player', device: 'crystal' },
      { type: 'script', script: 'again' },
    );
    g.step(1);
    expect(lines(g).filter((l) => l.who === '莉娜').length).toBe(before);
    // the priest's holy lamp: an omen of heresy, and the church grows suspicious
    g.queue(
      'cognition.appraise',
      { observerId: npcEntityId('cassian'), targetId: 'player', device: 'skill' },
      { type: 'script', script: 'lamp' },
    );
    g.step(1);
    expect(g.world.meta.flags.church_suspicion).toBe(5);
    expect(lines(g).some((l) => l.who === '卡西安神父' && l.text.includes('异端'))).toBe(true);
    expect(g.world.slices.cognition.beliefs.cassian?.player?.refuted).toContain('miracle');
  });

  it("rejects appraisals out of reach or in someone else's name", () => {
    const g = game(29);
    atGuild(g, ['ron']);
    g.queue('cognition.appraise', { observerId: 'player', targetId: npcEntityId('selene') });
    g.queue('cognition.appraise', { observerId: npcEntityId('ron'), targetId: 'player' });
    g.queue('cognition.appraise', { observerId: 'player', targetId: 'player' });
    g.queue('cognition.evidence', { observerId: 'ron', subjectId: 'player', kind: 'authority' });
    g.step(1);
    expect(results(g, 'cognition.appraise').map((e) => e.data.code)).toEqual([
      'too_far',
      'not_allowed',
      'self',
    ]);
    expect(results(g, 'cognition.evidence').at(-1)?.data.code).toBe('not_allowed');
  });

  it('gives pressure as a vague band only', () => {
    const g = game(31);
    stepTo(g, 0, 10);
    g.queue('world.teleport', { entityId: 'player', mapId: 'borderstone', x: 18.5, y: 26.5 });
    g.step(1);
    const calm = pressureSense(g.world, CONTENT, 'player', npcEntityId('martha'));
    expect(calm?.band).toBe('calm');
    const bron = getEntity(g.world, npcEntityId('bron'));
    const lina = getEntity(g.world, npcEntityId('lina'));
    if (!bron || !lina) throw new Error('missing npc');
    g.queue('world.teleport', {
      entityId: lina.id,
      mapId: 'borderstone',
      x: bron.x + 1,
      y: bron.y,
    });
    g.step(1);
    const press = pressureSense(g.world, CONTENT, lina.id, bron.id);
    expect(press?.band).toBe('press');
    expect(press?.text).toEqual(tr('sys.cognition.pressure.press'));
    expect(t(press?.text)).not.toMatch(/\d/);
  });
});

describe('regression and public stance', () => {
  it('drops a stance one step after fourteen quiet days', () => {
    const g = game(37);
    atGuild(g, ['ron']);
    g.queue('zz_cog.feat', { kind: 'elite_kill', tier: 2 });
    g.step(1);
    expect(g.world.slices.cognition.beliefs.ron?.player?.state).toBe('explaining');
    runInTick(g, (ctx) => {
      const b = ctx.world.slices.cognition.beliefs.ron?.player;
      if (b) b.lastFeatTick = ctx.tick - 15 * TICKS_PER_GAME_DAY;
    });
    stepTo(g, 1, 0, 5);
    expect(g.world.slices.cognition.beliefs.ron?.player?.state).toBe('doubt');
    expect(g.world.slices.cognition.beliefs.ron?.player?.log.at(-1)).toMatchObject({
      key: 'sys.cognition.belief.log',
      params: { text: tr('sys.cognition.belief.regress') },
    });
  });
});
