// The audio data and the world probe (audio_direction.md 5.1, 6.1, 7.16, 10.4, 10.6;
// combat_and_classes.md 8.3): the data tables of data/audio/ against the prompt library and the
// cue table's field domains, the caption texts, the atlas audio registration of every map (the
// M1 maps name only M1 sounds) with one decisive mutation per atlasAudioProblems rule, and the
// probe on the real game: the start map's registration reaches the director, a monster's blow
// carries the selection fields to the cue table, other maps stay unheard.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUDIO_TABLES,
  AudioEngine,
  type AudioTrigger,
  captionId,
  resolveAudioSettings,
  resolveCues,
  soundsOf,
  validateAmbienceTable,
  validateCueTable,
  validateSelectionTable,
  WorldProbe,
} from '../src/client/audio';
import { locationAudioOf, musicWeather, sealStepOf, zoneAt } from '../src/client/audio/audio_world';
import { seededRng } from '../src/client/audio/sound_player';
import { createGameView } from '../src/client/view/game_view';
import { buildContent } from '../src/content';
import type { AnyWorldEvent } from '../src/core/contracts';
import { createGame } from '../src/game/create';
import {
  type AtlasMapDef,
  atlasAudioProblems,
  atlasProblems,
  needsAudio,
} from '../src/systems/world/atlas';
import { loadLibrary } from '../tools/assets/lib';

const ROOT = join(__dirname, '..');
const lib = loadLibrary(join(ROOT, 'assets', 'prompts'));
const known = new Set([...lib.expected.keys()].filter((id) => /^(sfx|mus|amb)_/.test(id)));
const UI = JSON.parse(readFileSync(join(ROOT, 'locales', 'zh-Hans', 'ui.json'), 'utf8')) as Record<
  string,
  string
>;

describe('audio data tables (data/audio/)', () => {
  it('the cue, ambience and selection tables are valid and name only library sounds', () => {
    expect(lib.problems).toEqual([]);
    expect(validateCueTable(AUDIO_TABLES.cues, known)).toEqual([]);
    expect(validateAmbienceTable(AUDIO_TABLES.ambience, known)).toEqual([]);
    expect(validateSelectionTable(AUDIO_TABLES.selection, AUDIO_TABLES.cues.fields, known)).toEqual(
      [],
    );
  });

  it('validation catches a bad ambience or selection row', () => {
    expect(
      validateAmbienceTable({ ...AUDIO_TABLES.ambience, weather: { rain: 'sfx_rain' } }, known),
    ).toContain('weather.rain: sfx_rain is not an amb_ id');
    expect(
      validateAmbienceTable(
        { ...AUDIO_TABLES.ambience, captions: { amb_pt_owl: { key: 'cap.owl', level: 'all' } } },
        known,
      ),
    ).toContain('captions.amb_pt_owl: key must be audio.cap.<id>');
    expect(
      validateSelectionTable(
        { ...AUDIO_TABLES.selection, bodies: { wolf: { voice: 'lupine' } } },
        AUDIO_TABLES.cues.fields,
      ),
    ).toContain('bodies.wolf: lupine is not a voice value');
    expect(
      validateSelectionTable(
        { ...AUDIO_TABLES.selection, surfaces: { grass: 'moss' } },
        AUDIO_TABLES.cues.fields,
      ),
    ).toContain('surfaces.grass: moss is not a surface value');
  });

  it('every caption key has its interface text, and every direction too (10.4)', () => {
    const keys = new Set<string>();
    for (const c of AUDIO_TABLES.cues.cues) if (c.caption) keys.add(c.caption);
    for (const c of Object.values(AUDIO_TABLES.ambience.captions)) keys.add(c.key);
    expect(keys.size).toBeGreaterThanOrEqual(10);
    for (const k of keys) expect(UI[`ui.ovl.caption.${captionId(k)}`], k).toBeTruthy();
    for (const d of ['left', 'right', 'behind', 'far'])
      expect(UI[`ui.ovl.caption.dir.${d}`]).toBeTruthy();
    expect(UI['ui.ovl.caption.line_directed']).toContain('{dir}');
    expect(UI['ui.ovl.caption.line_plain']).toContain('{text}');
  });

  it('the new cues: ranged release, the seal steps, door and defeat phrases with their class', () => {
    const t = AUDIO_TABLES.cues;
    const bow = resolveCues(t, {
      event: 'anim.swing',
      fields: { attack: 'ranged', rangedWeapon: 'bow', isMonster: false, involvesPlayer: true },
    });
    expect(bow.map((h) => [h.sound, h.priority])).toEqual([['sfx_rng_bow_release', 1]]);
    const melee = resolveCues(t, {
      event: 'anim.swing',
      fields: { attack: 'melee', weapon: 'greataxe', weight: 'heavy', isMonster: false },
    });
    expect(melee.map((h) => h.sound)).toEqual(['sfx_wpn_greataxe_heavy']);
    const door = resolveCues(t, { event: 'door.opened', fields: { door: 'major', seal: 'large' } });
    expect(door.map((h) => [h.sound, h.stinger, h.stingerClass])).toEqual([
      ['sfx_door_open_major', false, 'other'],
      ['sfx_door_seal_large', false, 'other'],
      ['mus_stg_door_open', true, 'door'],
      ['mus_stg_seal_loosen', true, 'door'],
    ]);
    const died = resolveCues(t, {
      event: 'entity.died',
      fields: { isPlayer: true, isMonster: false },
    });
    expect(died.map((h) => [h.sound, h.stingerClass])).toEqual([
      ['sfx_down_player_down', 'other'],
      ['mus_stg_defeat', 'story'],
    ]);
    const roar = resolveCues(t, { event: 'combat.boss_engaged', fields: { bossVoice: 'dragon' } });
    expect(roar[0]).toMatchObject({ loud: true, captionLevel: 'important' });
    expect(t.cues.flatMap((c) => soundsOf(c, t.fields)).length).toBeGreaterThan(160);
    expect(validateCueTable({ ...t, cues: [{ ...t.cues[0], stingerClass: 'door' }] })).toContain(
      'cue weapon_swing: stingerClass and queue belong to stingers',
    );
  });
});

// ---------------------------------------------------------------------------
// The atlas registration

const content = buildContent();

describe('atlas audio registration (5.1, 6.1, 8.4, 10.6)', () => {
  it('the real atlas passes with the prompt library cross check', () => {
    expect(
      atlasProblems({
        regions: content.atlas_regions,
        maps: content.atlas_maps,
        routes: content.atlas_routes,
        contentMaps: content.maps,
        provinces: content.slg_provinces,
        links: content.slg_links,
        scenarios: content.battle_scenarios,
        soundIds: known,
      }),
    ).toEqual([]);
  });

  it('every built map and every prologue and act 1 map registers its audio, with M1 sounds', () => {
    const need = content.atlas_maps.filter(needsAudio);
    expect(need.length).toBeGreaterThanOrEqual(20);
    for (const m of need) {
      expect('music' in m, m.id).toBe(true);
      expect(m.ambience?.length, m.id).toBeGreaterThan(0);
      expect(m.reverbZone, m.id).toBeTruthy();
    }
    // The vertical slice (prologue and act 1) names only sounds of the M1 batch (13).
    for (const m of need.filter((x) => x.acts.includes(0) || x.acts.includes(1))) {
      const ids = [
        m.music,
        m.musicNight,
        ...(m.ambience ?? []).map((b) => (typeof b === 'string' ? b : b.id)),
        ...(m.ambiencePoints ?? []).map((p) => p.id),
      ].filter((x): x is string => !!x);
      for (const id of ids) expect(lib.expected.get(id)?.milestone, `${m.id}: ${id}`).toBe('M1');
    }
    const of = (id: string) => content.atlas_maps.find((m) => m.id === id) as AtlasMapDef;
    expect([
      of('borderstone').music,
      of('borderstone').musicNight,
      of('borderstone').reverbZone,
    ]).toEqual(['mus_town_borderstone_day', 'mus_town_borderstone_night', 'street']);
    expect([of('gap_void').music, of('divine_court').reverbZone, of('seal_ruins').music]).toEqual([
      null,
      'divine',
      'mus_dg_ancient',
    ]);
  });

  it('checks each audio field: one decisive mutation per rule', () => {
    const base: AtlasMapDef = {
      id: 'm',
      code: 'A1',
      name: 'm',
      tier: 'tile',
      role: 'hub',
      status: 'built',
      region: 'r',
      acts: [1],
      sediment: 0,
      size: [4, 4],
      music: 'mus_town_borderstone_day',
      musicNight: 'mus_town_borderstone_night',
      ambience: ['amb_town_day', { id: 'amb_town_night', time: 'night' }],
      ambiencePoints: [{ id: 'amb_pt_dog_bark', weight: 2, time: 'dawn' }],
      reverbZone: 'street',
    };
    const p = (over: Partial<AtlasMapDef>, ids?: ReadonlySet<string>) =>
      atlasAudioProblems({ ...base, ...over } as AtlasMapDef, ids);
    expect(p({}, known)).toEqual([]);
    expect(p({ music: 'sfx_x' })).toEqual(["atlas_map m: music 'sfx_x' is not a mus_ id"]);
    expect(p({ music: null, musicNight: 'mus_a' })).toEqual([
      'atlas_map m: musicNight without a day track',
    ]);
    expect(p({ ambience: ['amb_pt_owl'] })).toEqual([
      "atlas_map m: ambience 'amb_pt_owl' is not an amb_ bed id",
    ]);
    expect(p({ ambience: ['amb_town_day', 'amb_town_day'] })).toEqual([
      'atlas_map m: ambience amb_town_day listed twice',
    ]);
    expect(p({ ambience: [{ id: 'amb_town_day', time: 'dusk' as never }] })).toEqual([
      'atlas_map m: ambience amb_town_day time must be day or night',
    ]);
    expect(p({ ambiencePoints: [{ id: 'amb_pt_owl', weight: 0 }] })).toEqual([
      'atlas_map m: ambience point amb_pt_owl needs a positive weight',
    ]);
    expect(p({ ambiencePoints: [{ id: 'amb_town_day', weight: 1 }] })).toEqual([
      "atlas_map m: ambience point 'amb_town_day' is not an amb_pt_ id",
    ]);
    expect(p({ reverbZone: 'cave' as never })).toEqual(["atlas_map m: unknown reverb zone 'cave'"]);
    expect(p({ music: 'mus_not_there' }, known)).toEqual([
      'atlas_map m: mus_not_there is not in the prompt library',
    ]);
    const bare = { ...base };
    delete bare.music;
    delete bare.musicNight;
    delete bare.ambience;
    delete bare.reverbZone;
    expect(atlasAudioProblems(bare)).toEqual([
      'atlas_map m: needs its music (a mus_ id, or null for scene-driven)',
      'atlas_map m: needs its ambience beds',
      'atlas_map m: needs its reverb zone',
    ]);
    // Planned maps of later acts and battles may leave their audio for later.
    expect(atlasAudioProblems({ ...bare, status: 'planned', acts: [3] })).toEqual([]);
    expect(atlasAudioProblems({ ...bare, role: 'battle' })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The probe on the real game

function ev(kind: string, data: Record<string, unknown>): AnyWorldEvent {
  return { kind, tick: 1, seq: 1, data } as unknown as AnyWorldEvent;
}

describe('world probe on the real game', () => {
  const engine = createGame({ seed: 20261117 });
  const view = createGameView(engine);
  const probe = new WorldProbe(view, AUDIO_TABLES, engine.content.atlas_maps ?? []);
  const state = (nowMs: number) => ({
    nowMs,
    paused: false,
    inScene: false,
    dialogueOpen: false,
    camera: { yawDeg: 0, pitchDeg: 60, step: 2, viewportW: 1280, viewportH: 720 },
    focus: null,
  });

  it("hears the start map's registration through the director", () => {
    const map = view.currentMap();
    expect(map).toBeTruthy();
    const { frame } = probe.frame(state(0));
    const entry = engine.content.atlas_maps.find((m) => m.id === map?.id);
    expect(frame.location).toEqual(locationAudioOf(entry, map?.id ?? ''));
    expect(frame.beds).toEqual(entry?.ambience);
    expect(frame.reverb).toBe(entry?.reverbZone);
    expect(frame.listener).toMatchObject({ x: view.player()?.x, y: view.player()?.y });
    const e = new AudioEngine(
      AUDIO_TABLES,
      resolveAudioSettings(null, { focused: true, systemReducedMotion: false }),
      seededRng(1),
    );
    e.update(frame);
    expect(e.state()?.music.id).toBe(entry?.music ?? null);
  });

  it("carries a monster's blow to the cue table with the 8.3 selection fields", () => {
    engine.queue(
      'combat.spawn',
      { monsterId: 'grey_wolf', level: 3 },
      { type: 'system', system: 'test' },
    );
    engine.step(1);
    const pid = view.playerId();
    const map = view.currentMap();
    const wolf = view.entitiesOnMap(map?.id ?? '').find((x) => x.ref === 'grey_wolf');
    expect(wolf).toBeTruthy();
    const triggers = probe.events(
      [
        ev('combat.damage', {
          sourceId: wolf?.id,
          targetId: pid,
          amount: 3,
          absorbed: 0,
          school: 'physical',
          outcome: 'hit',
        }),
      ],
      100,
    );
    const swing = triggers.find((t) => t.event === 'anim.swing') as AudioTrigger;
    const hit = triggers.find((t) => t.event === 'combat.damage') as AudioTrigger;
    expect(swing.fields).toMatchObject({ isMonster: true, voice: 'canine', attack: 'melee' });
    expect(hit.fields).toMatchObject({ attack: 'melee', damage: 'blunt', involvesPlayer: true });
    expect(hit.targetId).toBe(pid);
    expect(hit.delayMs).toBe(80);
    expect(resolveCues(AUDIO_TABLES.cues, swing).map((h) => h.sound)).toEqual([
      'sfx_mon_canine_attack',
    ]);
    expect(resolveCues(AUDIO_TABLES.cues, hit)[0]?.sound).toMatch(/^sfx_hit_blunt_/);
    // A crit on the player rumbles the pad.
    const crit = probe.events(
      [
        ev('combat.damage', {
          sourceId: wolf?.id,
          targetId: pid,
          amount: 3,
          absorbed: 0,
          school: 'physical',
          outcome: 'crit',
        }),
      ],
      200,
    );
    expect(crit.find((t) => t.event === 'combat.damage')?.rumble).toBe('heavy_hit_taken');
  });

  it('turns a hostile on the party into aggro and an off-screen threat, once', () => {
    const units = (
      view.world.slices as unknown as {
        combat: { units: Record<string, { target: string | null; combatUntil: number }> };
      }
    ).combat.units;
    const wolf = view.entitiesOnMap(view.currentMap()?.id ?? '').find((x) => x.ref === 'grey_wolf');
    const u = wolf ? units[wolf.id] : undefined;
    if (!u || !wolf) throw new Error('no wolf');
    u.target = view.playerId();
    u.combatUntil = view.tick + 200;
    const first = probe.frame(state(1000)).triggers.map((t) => t.event);
    expect(first).toContain('combat.aggro');
    expect(probe.frame(state(1200)).triggers.map((t) => t.event)).not.toContain('combat.aggro');
    const { frame } = probe.frame(state(1400));
    expect(frame.combat.hostiles.some((h) => h.engaged)).toBe(true);
  });

  it('runs a boss fight from its roar to a victory, or ends it without one on a wipe', () => {
    const units = (
      view.world.slices as unknown as {
        combat: { units: Record<string, { target: string | null; combatUntil: number }> };
      }
    ).combat.units;
    engine.queue(
      'combat.spawn',
      { monsterId: 'guardian_raven', level: 5 },
      { type: 'system', system: 'test' },
    );
    engine.step(1);
    const boss = view
      .entitiesOnMap(view.currentMap()?.id ?? '')
      .find((x) => x.ref === 'guardian_raven');
    const u = boss ? units[boss.id] : undefined;
    if (!boss || !u) throw new Error('no boss');
    const engage = () => {
      u.target = view.playerId();
      u.combatUntil = view.tick + 400;
    };
    engage();
    const start = probe.frame(state(10_000));
    expect(start.triggers.filter((t) => t.event === 'combat.boss_engaged')).toHaveLength(1);
    expect(start.triggers.find((t) => t.event === 'combat.boss_engaged')?.fields).toEqual({
      bossVoice: 'great_bird',
    });
    expect(start.frame.boss).toEqual({ music: 'mus_boss_standard', phase: 0 });
    probe.events(
      [
        ev('combat.boss_phase', {
          entityId: boss.id,
          bossId: 'guardian_raven',
          phase: 1,
          name: 'x',
        }),
      ],
      10_050,
    );
    const mid = probe.frame(state(10_200));
    expect(mid.frame.boss?.phase).toBe(1);
    // A flicker of its target does not end the fight or roar again.
    u.target = null;
    expect(probe.frame(state(10_400)).frame.boss).not.toBeNull();
    engage();
    expect(probe.frame(state(10_600)).triggers.some((t) => t.event === 'combat.boss_engaged')).toBe(
      false,
    );
    probe.events(
      [ev('combat.boss_defeated', { entityId: boss.id, bossId: 'guardian_raven', yielded: false })],
      10_700,
    );
    const won = probe.frame(state(10_800)).frame;
    expect([won.boss, won.bossVictory]).toEqual([null, true]);
    expect(probe.frame(state(11_000)).frame.bossVictory).toBe(false);
    // A beaten boss does not start its fight again.
    engage();
    expect(probe.frame(state(11_200)).frame.boss).toBeNull();
    u.target = null;
    u.combatUntil = 0;
    // The next fight, with another boss, lost: the player goes down, no victory.
    engine.queue(
      'combat.spawn',
      { monsterId: 'guardian_raven', level: 5 },
      { type: 'system', system: 'test' },
    );
    engine.step(1);
    const second = view
      .entitiesOnMap(view.currentMap()?.id ?? '')
      .find((x) => x.ref === 'guardian_raven' && x.id !== boss.id);
    const u2 = second ? units[second.id] : undefined;
    if (!second || !u2) throw new Error('no second boss');
    u2.target = view.playerId();
    u2.combatUntil = view.tick + 400;
    expect(probe.frame(state(12_000)).frame.boss).not.toBeNull();
    probe.events(
      [
        ev('entity.died', {
          id: view.playerId(),
          kind: 'player',
          mapId: view.currentMap()?.id,
          x: 0,
          y: 0,
        }),
      ],
      12_050,
    );
    // The fallen player is carried back through the door: the boss is no longer near.
    u2.target = null;
    const lost = probe.frame(state(12_200)).frame;
    expect([lost.boss, lost.bossVictory]).toEqual([null, false]);
    u2.target = null;
    u2.combatUntil = 0;
  });

  it('feels presence from a higher rank within its radius, and lets it go when away', () => {
    const units = (
      view.world.slices as unknown as {
        combat: { units: Record<string, { tier: number; presence?: number; side: string }> };
      }
    ).combat.units;
    const wolf = view.entitiesOnMap(view.currentMap()?.id ?? '').find((x) => x.ref === 'grey_wolf');
    const w = wolf ? units[wolf.id] : undefined;
    const me = units[view.playerId()];
    if (!w || !me) throw new Error('no units');
    const saved = { tier: w.tier, presence: w.presence };
    w.tier = me.tier + 2;
    w.presence = 50;
    const felt = probe.frame(state(20_000));
    expect(felt.triggers.find((t) => t.event === 'combat.presence_felt')?.fields).toEqual({
      presence: 'high',
    });
    expect([felt.frame.presence, felt.frame.sustain]).toEqual(['high', ['presence_heartbeat']]);
    // It holds while it presses, without a new trigger every scan.
    const held = probe.frame(state(20_200));
    expect(held.frame.presence).toBe('high');
    expect(held.triggers.some((t) => t.event === 'combat.presence_felt')).toBe(false);
    w.presence = 0;
    const gone = probe.frame(state(20_400)).frame;
    expect([gone.presence, gone.sustain]).toEqual([null, []]);
    w.tier = saved.tier;
    w.presence = saved.presence;
  });

  it('does not hear events on other maps, and reads seal steps, weather and zones', () => {
    const elsewhere = probe.events(
      [ev('entity.died', { id: 'x', kind: 'monster', mapId: 'nowhere', x: 1, y: 1 })],
      0,
    );
    expect(elsewhere).toEqual([]);
    const door = probe.events([ev('door.opened', { doorId: 'd', sealDelta: 4 })], 0)[0];
    expect(door?.fields).toMatchObject({ door: 'major', seal: 'large' });
    expect(door?.rumble).toBe('seal_loosen_major');
    expect([0, 0.5, 1, 2, 4, 8].map(sealStepOf)).toEqual([
      null,
      'faint',
      'small',
      'mid',
      'large',
      'extreme',
    ]);
    expect([musicWeather('rain'), musicWeather('fog'), musicWeather('ashfall')]).toEqual([
      'rain',
      'clear',
      'ashfall',
    ]);
    const map = {
      indoor: false,
      locations: [
        { id: 'inn', name: 'inn', kind: 'tavern', x: 0, y: 0, w: 10, h: 10 },
        { id: 'room', name: 'room', kind: 'home', x: 2, y: 2, w: 3, h: 3 },
        { id: 'sq', name: 'sq', kind: 'plaza', x: 0, y: 0, w: 40, h: 40 },
      ],
    };
    const interiors = AUDIO_TABLES.ambience.interiors;
    expect(zoneAt(map, 3, 3, interiors)).toEqual({ id: 'room', kind: 'home' });
    expect(zoneAt(map, 8, 8, interiors)).toEqual({ id: 'inn', kind: 'tavern' });
    expect(zoneAt(map, 20, 20, interiors)).toBeNull();
    expect(zoneAt({ ...map, indoor: true }, 3, 3, interiors)).toBeNull();
  });
});
