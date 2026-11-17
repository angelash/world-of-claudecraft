// The audio engine's pure cores (audio_direction.md 5 to 10; release_engineering.md 9.8): the
// music scheduler (grid lines, the 5.3 transitions, position memory), the stinger gate (5.7),
// the voice pool (8.3 caps, preemption, throttle, merge, footsteps), variants, the
// spatializer (8.4) and the eavesdrop tiers, the ambience mixer and its details (6.1), the
// playable index (9.2, 9.3), settings and accessibility (10.3, 10.4), rumble (10.5), captions,
// the hit-sound selection fields (combat 8.3), and the engine and facade end to end, including
// silent operation with no audio device and with no approved files.

import { describe, expect, it } from 'vitest';
import { checkPatch } from '../src/client/app/settings_schema';
import {
  AUDIO_TABLES,
  AudioEngine,
  type AudioFrame,
  AudioIndex,
  type AudioOp,
  type AudioOutput,
  type AudioRuntimeSettings,
  audioMetaProblems,
  buildAudioIndex,
  CaptionBoard,
  captionId,
  createGameAudio,
  hitCueFields,
  mapPack,
  resolveAudioSettings,
  rumbleSteps,
  selectHit,
} from '../src/client/audio';
import {
  bedsAt,
  dianBed,
  mixAmbience,
  PointScheduler,
  pointTimeOk,
} from '../src/client/audio/ambience_mixer';
import type { AudioEntry, AudioMetaLike } from '../src/client/audio/audio_manifest';
import {
  captionShown,
  defaultAudioOptions,
  flashReduced,
} from '../src/client/audio/audio_settings';
import { masterChain } from '../src/client/audio/bus_model';
import {
  arrowMaterialOf,
  bossVoiceOf,
  damageKindOf,
  materialOf,
  surfaceOf,
  swingWeaponOf,
  voiceOf,
  weaponClassOf,
} from '../src/client/audio/hit_select';
import {
  ANY_STINGER_GAP_MS,
  gridUnits,
  layersFor,
  type MusicCommand,
  MusicScheduler,
  nextLine,
  phraseStart,
  positionAt,
  StingerGate,
  type TrackGrid,
} from '../src/client/audio/music_player';
import {
  jitter,
  POOL_CAPS,
  seededRng,
  VariantPicker,
  VoicePool,
} from '../src/client/audio/sound_player';
import {
  distanceDb,
  LISTEN_MIX,
  type Listener,
  listenTierOf,
  place,
  quieterTier,
} from '../src/client/audio/spatializer';
import { defaultInputSettings } from '../src/client/input/input_settings';
import {
  audioDefaultsPatch,
  audioPageModel,
  audioPatch,
} from '../src/client/windows/settings/audio_model';
import { t } from '../src/shared_ui/i18n';

const OFF = Number.NEGATIVE_INFINITY;

// ---------------------------------------------------------------------------
// Music scheduler

const town: TrackGrid = {
  id: 'mus_a',
  lengthSec: 64,
  loop: true,
  bpm: 120,
  beatsPerBar: 4,
  stems: 3,
};
const night: TrackGrid = { ...town, id: 'mus_a_night' };
const fight: TrackGrid = {
  id: 'mus_cmb',
  lengthSec: 32,
  loop: true,
  bpm: 120,
  beatsPerBar: 4,
  stems: 3,
};
const tracks = new Map([town, night, fight].map((g) => [g.id, g]));
const grid = (id: string) => tracks.get(id) ?? null;
const plan = (id: string | null, layers = [0, 0, OFF], lowpassHz: number | null = null) => ({
  id,
  layers,
  lowpassHz,
});
const ofKind = <K extends MusicCommand['op']>(cmds: MusicCommand[], op: K) =>
  cmds.filter((c): c is Extract<MusicCommand, { op: K }> => c.op === op);

describe('music scheduler (5.2, 5.3, 9.5)', () => {
  it('computes the beat grid and the next line at least 50 ms ahead', () => {
    expect(gridUnits(town)).toEqual({ beat: 0.5, bar: 2, phrase: 8 });
    expect(gridUnits({ bpm: null, beatsPerBar: null })).toBeNull();
    const deck = { atSec: 10, offsetSec: 0, grid: town };
    // At 10.97 s the track is at 0.97 s: next beat 1.0 s is 30 ms away (< 50 ms), so 1.5 s.
    expect(nextLine(deck, 10.97, 'beat')).toBeCloseTo(11.5, 6);
    expect(nextLine(deck, 10.5, 'bar')).toBeCloseTo(12, 6);
    expect(nextLine(deck, 10.5, 'phrase')).toBeCloseTo(18, 6);
    expect(nextLine(null, 3, 'bar')).toBeCloseTo(3.05, 6);
    expect(positionAt({ atSec: 0, offsetSec: 60, grid: town }, 10)).toBeCloseTo(6, 6);
    expect(phraseStart(town, 21)).toBe(16);
    expect(layersFor([0, 0], 3)).toEqual([0, 0, OFF]);
    expect(layersFor([0, 0, 0, 0, 0], 6)).toEqual([0, 0, 0, 0]);
  });

  it('starts a track, changes its layers on the next bar line with a 2 s ramp', () => {
    const m = new MusicScheduler();
    const first = m.update({ nowSec: 0, plan: plan('mus_a'), transition: null, grid });
    expect(ofKind(first, 'start')).toMatchObject([
      { id: 'mus_a', offsetSec: 0, layers: [0, 0, OFF] },
    ]);
    const same = m.update({ nowSec: 1, plan: plan('mus_a', [0, 0, 0]), transition: null, grid });
    expect(same).toEqual([
      { op: 'layers', deck: 1, atSec: expect.closeTo(2.05, 5), layers: [0, 0, 0], rampMs: 2000 },
    ]);
    expect(
      m.update({ nowSec: 1.5, plan: plan('mus_a', [0, 0, 0]), transition: null, grid }),
    ).toEqual([]);
  });

  it('crossfades on the bar line, carries the position over for day and night versions', () => {
    const m = new MusicScheduler();
    m.update({ nowSec: 0, plan: plan('mus_a'), transition: null, grid });
    const out = m.update({
      nowSec: 21,
      plan: plan('mus_a_night'),
      transition: { kind: 'crossfade', ms: 8000, align: 'bar', aligned: true },
      grid,
    });
    const stop = ofKind(out, 'stop')[0];
    const start = ofKind(out, 'start')[0];
    // The day track started 50 ms in (the lead): its bar line at 22 s falls at 22.05.
    expect(stop?.atSec).toBeCloseTo(22.05, 5);
    expect(start).toMatchObject({ id: 'mus_a_night', fadeInMs: 8000 });
    expect(start?.atSec).toBeCloseTo(22.05, 5);
    // The day track was 22 s in at the bar line: the night track starts there too.
    expect(start?.offsetSec).toBeCloseTo(22, 5);
  });

  it('cuts into a fight on the next beat, returns to the phrase it left after 4 plus 3 s', () => {
    const m = new MusicScheduler();
    m.update({ nowSec: 0, plan: plan('mus_a'), transition: null, grid });
    const into = m.update({
      nowSec: 21.2,
      plan: plan('mus_cmb'),
      transition: { kind: 'cut_in', ms: 1000, align: 'beat' },
      grid,
    });
    expect(ofKind(into, 'stop')[0]).toMatchObject({ fadeOutMs: 1000 });
    expect(ofKind(into, 'start')[0]?.atSec).toBeCloseTo(21.55, 5);
    expect(ofKind(into, 'start')[0]?.fadeInMs).toBe(10);
    const back = m.update({
      nowSec: 40,
      plan: plan('mus_a'),
      transition: { kind: 'phrase_return', ms: 7000, align: 'phrase' },
      grid,
    });
    const start = ofKind(back, 'start')[0];
    // The town track stopped 21.25 s in: it resumes from that phrase's start, 16 s.
    expect(start).toMatchObject({ id: 'mus_a', offsetSec: 16, fadeInMs: 3000 });
    expect(start?.atSec).toBeCloseTo(44.05, 5);
    expect(ofKind(back, 'stop')[0]).toMatchObject({ fadeOutMs: 4000 });
  });

  it('forgets the position after 3 minutes', () => {
    const m = new MusicScheduler();
    m.update({ nowSec: 0, plan: plan('mus_a'), transition: null, grid });
    m.update({ nowSec: 21.2, plan: plan('mus_cmb'), transition: null, grid });
    const late = m.update({ nowSec: 300, plan: plan('mus_a'), transition: null, grid });
    expect(ofKind(late, 'start')[0]?.offsetSec).toBe(0);
  });

  it('fades out, leaves the gap, fades in (5 s across regions; the door cut 1 s out, 2 s in)', () => {
    const m = new MusicScheduler();
    m.update({ nowSec: 0, plan: plan('mus_a'), transition: null, grid });
    const out = m.update({
      nowSec: 5,
      plan: plan('mus_cmb'),
      transition: { kind: 'fade_gap', ms: 5000, align: 'none', gapMs: 1000 },
      grid,
    });
    expect(ofKind(out, 'stop')[0]).toMatchObject({ fadeOutMs: 2000 });
    expect(ofKind(out, 'start')[0]).toMatchObject({ fadeInMs: 2000 });
    expect(ofKind(out, 'start')[0]?.atSec).toBeCloseTo(5.05 + 2 + 1, 5);
    const d = new MusicScheduler();
    d.update({ nowSec: 0, plan: plan('mus_a'), transition: null, grid });
    const door = d.update({
      nowSec: 5,
      plan: plan('mus_cmb'),
      transition: { kind: 'fade_gap', ms: 3000, align: 'none', gapMs: 0, outMs: 1000 },
      grid,
    });
    expect([ofKind(door, 'stop')[0]?.fadeOutMs, ofKind(door, 'start')[0]?.fadeInMs]).toEqual([
      1000, 2000,
    ]);
  });

  it('waits for the pass to end when a calmer track comes within 20 s of it', () => {
    const m = new MusicScheduler();
    m.update({ nowSec: 0, plan: plan('mus_a'), transition: null, grid });
    const out = m.update({
      nowSec: 50,
      plan: plan('mus_cmb'),
      transition: { kind: 'crossfade', ms: 3000, align: 'bar', calm: true },
      grid,
    });
    expect(ofKind(out, 'start')[0]?.atSec).toBeCloseTo(64.05, 5);
  });

  it('a change during a calm wait stops the waiting track too, and leaves no memory', () => {
    const m = new MusicScheduler();
    m.update({ nowSec: 0, plan: plan('mus_a'), transition: null, grid });
    m.update({
      nowSec: 50,
      plan: plan('mus_a_night'),
      transition: { kind: 'crossfade', ms: 3000, align: 'bar', calm: true },
      grid,
    });
    const fightNow = m.update({
      nowSec: 52,
      plan: plan('mus_cmb'),
      transition: { kind: 'cut_in', ms: 1000, align: 'beat' },
      grid,
    });
    const stops = ofKind(fightNow, 'stop');
    // Deck 1 (the day track waiting for 64 s) and deck 2 (not started yet) both stop now.
    expect(stops.map((x) => x.deck).sort()).toEqual([1, 2]);
    for (const st of stops) expect(st.atSec).toBeCloseTo(52.05, 5);
    const back = m.update({ nowSec: 60, plan: plan('mus_a_night'), transition: null, grid });
    expect(ofKind(back, 'start')[0]?.offsetSec).toBe(0);
  });

  it('plays the victory phrase and brings the location back 3 s later', () => {
    const m = new MusicScheduler();
    const g = (id: string) => (id === 'mus_stg_victory' ? { ...fight, id, loop: false } : grid(id));
    m.update({ nowSec: 0, plan: plan('mus_cmb'), transition: null, grid: g });
    const out = m.update({
      nowSec: 10,
      plan: plan('mus_a'),
      transition: { kind: 'victory', ms: 1000, align: 'none', stinger: 'mus_stg_victory' },
      grid: g,
    });
    expect(out.map((c) => c.op)).toEqual(['stinger', 'stop', 'start']);
    expect(ofKind(out, 'start')[0]?.atSec).toBeCloseTo(13.05, 5);
  });

  it('a silence or a track without an approved file fades the old one and plays nothing', () => {
    const m = new MusicScheduler();
    m.update({ nowSec: 0, plan: plan('mus_a'), transition: null, grid });
    const out = m.update({
      nowSec: 3,
      plan: plan('mus_missing'),
      transition: { kind: 'crossfade', ms: 2000, align: 'none' },
      grid,
    });
    expect(out.map((c) => c.op)).toEqual(['stop']);
    expect(m.update({ nowSec: 4, plan: plan('mus_missing'), transition: null, grid })).toEqual([]);
  });
});

describe('stinger gate (5.7)', () => {
  it('spaces phrases 2.5 s apart and the same one 20 s apart', () => {
    const g = new StingerGate();
    expect(g.offer({ id: 'a', cls: 'other', queue: false }, 0, false)).toBe('play');
    expect(g.offer({ id: 'b', cls: 'other', queue: false }, 1000, false)).toBe('dropped');
    expect(g.offer({ id: 'b', cls: 'other', queue: false }, 2600, false)).toBe('play');
    expect(g.offer({ id: 'a', cls: 'other', queue: true }, 10_000, false)).toBe('dropped');
    expect(g.offer({ id: 'a', cls: 'other', queue: false }, 20_000, false)).toBe('play');
  });

  it('queues doors, level-ups and finished quests for 3 s, best class first', () => {
    const g = new StingerGate();
    g.offer({ id: 'x', cls: 'other', queue: false }, 0, false);
    expect(g.offer({ id: 'quest', cls: 'quest', queue: true }, 100, false)).toBe('queued');
    expect(g.offer({ id: 'door', cls: 'door', queue: true }, 200, false)).toBe('queued');
    expect(g.tick(1000, false)).toEqual([]);
    expect(g.tick(ANY_STINGER_GAP_MS, false)).toEqual(['door']);
    // The quest phrase waited past its 3 s: it is dropped, not played late.
    expect(g.tick(ANY_STINGER_GAP_MS * 2, false)).toEqual([]);
  });

  it('lets only victory and defeat through a fight; the rest play after it', () => {
    const g = new StingerGate();
    expect(g.offer({ id: 'mus_stg_level_up', cls: 'level', queue: true }, 0, true)).toBe(
      'deferred',
    );
    expect(g.offer({ id: 'mus_stg_defeat', cls: 'story', queue: false }, 0, true)).toBe('play');
    expect(g.tick(5000, true)).toEqual([]);
    expect(g.tick(6000, false)).toEqual(['mus_stg_level_up']);
  });
});

// ---------------------------------------------------------------------------
// Voice pool and variants

describe('voice pool (8.3)', () => {
  const req = (over: Partial<Parameters<VoicePool['admit']>[0]> = {}) => ({
    id: 'sfx_x',
    bus: 'ui' as const,
    priority: 3,
    durationMs: 1000,
    ...over,
  });

  it('caps each bus and preempts the oldest of the lowest priority below the new sound', () => {
    const p = new VoicePool();
    for (let i = 0; i < POOL_CAPS.ui; i++)
      expect(p.admit(req({ id: `u${i}`, priority: 4 }), i * 60).ok).toBe(true);
    // Same level: no preemption, the new one is dropped.
    expect(p.admit(req({ id: 'same', priority: 4 }), 500)).toEqual({ ok: false, reason: 'full' });
    const hi = p.admit(req({ id: 'hi', priority: 1 }), 600);
    expect(hi.ok && hi.evict).toEqual([1]);
    expect(p.size('ui')).toBe(POOL_CAPS.ui);
  });

  it('lets level 0 exceed the cap by four', () => {
    const p = new VoicePool();
    for (let i = 0; i < 4; i++) p.admit(req({ id: `z${i}`, priority: 0 }), i * 60);
    for (let i = 0; i < 4; i++)
      expect(p.admit(req({ id: `y${i}`, priority: 0 }), 400 + i * 60).ok).toBe(true);
    expect(p.admit(req({ id: 'one_more', priority: 0 }), 800).ok).toBe(false);
  });

  it('throttles the same sound to 4 at once and 50 ms apart', () => {
    const p = new VoicePool();
    expect(p.admit(req({ bus: 'sfx' }), 0).ok).toBe(true);
    expect(p.admit(req({ bus: 'sfx' }), 30)).toEqual({ ok: false, reason: 'throttled' });
    for (let i = 1; i < 4; i++) expect(p.admit(req({ bus: 'sfx' }), i * 60).ok).toBe(true);
    const fifth = p.admit(req({ bus: 'sfx' }), 300);
    expect(fifth.ok && fifth.evict).toEqual([1]);
  });

  it('merges hits on one target within 100 ms into the heaviest', () => {
    const p = new VoicePool();
    p.admit(req({ id: 'a', bus: 'sfx', mergeKey: 'hit:t:m', weight: 1 }), 0);
    expect(p.admit(req({ id: 'b', bus: 'sfx', mergeKey: 'hit:t:m', weight: 1 }), 60)).toEqual({
      ok: false,
      reason: 'merged',
    });
    const crit = p.admit(req({ id: 'c', bus: 'sfx', mergeKey: 'hit:t:m', weight: 2 }), 80);
    expect(crit.ok && crit.evict).toEqual([1]);
    expect(p.admit(req({ id: 'd', bus: 'sfx', mergeKey: 'hit:t:m', weight: 1 }), 250).ok).toBe(
      true,
    );
  });

  it('plays one footstep per walker and none beyond 20 m', () => {
    const p = new VoicePool();
    expect(p.admit(req({ id: 'f1', bus: 'sfx', footstepOf: 'e', distance: 5 }), 0).ok).toBe(true);
    expect(p.admit(req({ id: 'f2', bus: 'sfx', footstepOf: 'e', distance: 5 }), 100)).toEqual({
      ok: false,
      reason: 'busy',
    });
    expect(p.admit(req({ id: 'f3', bus: 'sfx', footstepOf: 'g', distance: 21 }), 100)).toEqual({
      ok: false,
      reason: 'far',
    });
    expect(p.expire(1500)).toEqual([1]);
  });

  it('picks variants without repeating and jitters only world sounds', () => {
    const v = new VariantPicker();
    const rng = seededRng(3);
    let last = -1;
    for (let i = 0; i < 50; i++) {
      const k = v.pick('sfx_hit', 4, rng);
      expect(k).not.toBe(last);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(4);
      last = k;
    }
    expect(v.pick('one', 1, rng)).toBe(0);
    expect(jitter('ui', rng)).toEqual({ rate: 1, gainDb: 0 });
    for (let i = 0; i < 50; i++) {
      const j = jitter('sfx', rng);
      expect(Math.abs(j.rate - 1)).toBeLessThanOrEqual(0.03);
      expect(Math.abs(j.gainDb)).toBeLessThanOrEqual(1.5);
    }
    // Seeded: the same seed gives the same choices.
    expect(seededRng(9)()).toBe(seededRng(9)());
  });
});

// ---------------------------------------------------------------------------
// Spatializer

const listener = (over: Partial<Listener> = {}): Listener => ({
  x: 50,
  y: 50,
  yawDeg: 0,
  pitchDeg: 90,
  step: 2,
  viewportW: 1280,
  viewportH: 720,
  ...over,
});

describe('spatializer (8.4)', () => {
  it('pans by the screen position, at most 0.8, and centres for mono', () => {
    expect(place({ x: 55, y: 50 }, listener()).pan).toBeCloseTo(((5 * 32) / 640) * 0.8, 6);
    expect(place({ x: 70, y: 50 }, listener()).pan).toBeCloseTo(0.8, 6);
    expect(place({ x: 30, y: 50 }, listener()).pan).toBeCloseTo(-0.8, 6);
    expect(place({ x: 55, y: 50 }, listener(), true).pan).toBe(0);
    // Turned half way round, east is on the left of the screen.
    expect(place({ x: 55, y: 50 }, listener({ yawDeg: 180 })).pan).toBeLessThan(0);
  });

  it('rolls off from 4 m to -24 dB at 30 m; beyond that only threats, at -18 dB', () => {
    expect(distanceDb(3)).toBe(0);
    expect(distanceDb(4)).toBe(0);
    expect(distanceDb(30)).toBeCloseTo(-24, 6);
    expect(distanceDb(10)).toBeLessThan(0);
    expect(distanceDb(10)).toBeGreaterThan(-24);
    const far = place({ x: 90, y: 50 }, listener());
    expect(far.audible).toBe(false);
    const threat = place({ x: 90, y: 50, threat: true }, listener());
    expect([threat.audible, threat.gainDb, threat.direction]).toEqual([true, -18, 'far']);
  });

  it('dims and darkens sounds high on the screen, occludes other buildings, names directions', () => {
    const up = place({ x: 50, y: 40 }, listener());
    expect(up.lowpassHz).toBeLessThan(12000);
    expect(up.lowpassHz).toBeGreaterThanOrEqual(6000);
    const level = place({ x: 50, y: 60 }, listener());
    expect(level.lowpassHz).toBeNull();
    const walled = place({ x: 51, y: 50, zone: 'tavern' }, listener());
    expect(walled.gainDb).toBeCloseTo(-9, 6);
    expect(walled.lowpassHz).toBe(1500);
    expect(place({ x: 51, y: 50, zone: 'tavern' }, listener({ zone: 'tavern' })).gainDb).toBe(0);
    expect(place({ x: 40, y: 50 }, listener()).direction).toBe('left');
    expect(place({ x: 60, y: 50 }, listener()).direction).toBe('right');
    expect(place({ x: 50, y: 74 }, listener()).direction).toBe('behind');
  });

  it('maps the eavesdrop levels to the three listening tiers (P5)', () => {
    expect([0, 1, 2, 3].map(listenTierOf)).toEqual(['far', 'far', 'mid', 'near']);
    expect([quieterTier('near'), quieterTier('mid'), quieterTier('far')]).toEqual([
      'mid',
      'far',
      'far',
    ]);
    expect(LISTEN_MIX.far.gainDb).toBeLessThan(LISTEN_MIX.mid.gainDb);
    expect(LISTEN_MIX.mid.gainDb).toBeLessThan(LISTEN_MIX.near.gainDb);
    expect([LISTEN_MIX.far.musicL2, LISTEN_MIX.mid.musicL2, LISTEN_MIX.near.musicL2]).toEqual([
      false,
      true,
      true,
    ]);
  });
});

// ---------------------------------------------------------------------------
// Ambience

describe('ambience mixer (6.1)', () => {
  const amb = AUDIO_TABLES.ambience;
  const beds = [
    { id: 'amb_town_day', time: 'day' as const },
    { id: 'amb_town_night', time: 'night' as const },
    { id: 'amb_fauna_temperate_night', time: 'night' as const },
  ];
  const base = {
    beds,
    night: false,
    outdoor: true,
    weather: 'clear',
    sediment: 0,
    interiorKind: null,
  };

  it('takes the beds of the hour, trims fauna, weather and sediment layers by 4 dB', () => {
    expect(bedsAt(beds, false)).toEqual(['amb_town_day']);
    expect(bedsAt(beds, true)).toEqual(['amb_town_night', 'amb_fauna_temperate_night']);
    const mix = mixAmbience({ ...base, night: true, weather: 'rain', sediment: 3 }, amb);
    expect(mix.map((b) => [b.id, b.layer, b.gainDb])).toEqual([
      ['amb_town_night', 'base', 0],
      ['amb_fauna_temperate_night', 'fauna', -4],
      ['amb_wx_rain_light', 'weather', -4],
      ['amb_dian_low', 'dian', -10],
    ]);
  });

  it('keeps weather out of indoor maps and grades the sediment layer 2 to 5', () => {
    expect(
      mixAmbience({ ...base, outdoor: false, weather: 'storm' }, amb).map((b) => b.id),
    ).toEqual(['amb_town_day']);
    expect([0, 1, 2, 3, 4, 5].map((g) => dianBed(g, amb))).toEqual([
      null,
      null,
      { id: 'amb_dian_low', gainDb: -12 },
      { id: 'amb_dian_low', gainDb: -6 },
      { id: 'amb_dian_high', gainDb: 0 },
      { id: 'amb_dian_high', gainDb: 0 },
    ]);
    // An active dungeon adds a grade.
    const active = mixAmbience({ ...base, sediment: 3, activeDungeon: true }, amb);
    expect(active.some((b) => b.id === 'amb_dian_high')).toBe(true);
  });

  it('indoors drops the outdoor layers 12 dB behind 1.5 kHz and adds the room bed', () => {
    const mix = mixAmbience({ ...base, interiorKind: 'tavern' }, amb);
    expect(mix).toEqual([
      { id: 'amb_town_day', layer: 'base', gainDb: -12, lowpassHz: 1500 },
      { id: 'amb_int_tavern', layer: 'interior', gainDb: 0, lowpassHz: null },
    ]);
  });

  it('schedules details every 8 to 20 s, 15 to 30 m away, never twice within 30 s', () => {
    const s = new PointScheduler();
    const rng = seededRng(5);
    const pool = [
      { id: 'amb_pt_a', weight: 1 },
      { id: 'amb_pt_b', weight: 1 },
    ];
    expect(s.update(0, pool, 12, rng)).toBeNull();
    const shots: { at: number; id: string; d: number }[] = [];
    for (let t = 0; t <= 300_000; t += 100) {
      const shot = s.update(t, pool, 12, rng);
      if (shot) shots.push({ at: t, id: shot.id, d: Math.hypot(shot.dx, shot.dy) });
    }
    expect(shots.length).toBeGreaterThan(5);
    for (const sh of shots) {
      expect(sh.d).toBeGreaterThanOrEqual(15);
      expect(sh.d).toBeLessThanOrEqual(30);
    }
    for (let i = 1; i < shots.length; i++) {
      const gap = (shots[i]?.at ?? 0) - (shots[i - 1]?.at ?? 0);
      expect(gap).toBeGreaterThanOrEqual(8000);
    }
    for (const id of ['amb_pt_a', 'amb_pt_b']) {
      const times = shots.filter((x) => x.id === id).map((x) => x.at);
      for (let i = 1; i < times.length; i++)
        expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeGreaterThanOrEqual(30_000);
    }
    expect(pointTimeOk({ id: 'r', weight: 1, time: 'dawn' }, 6)).toBe(true);
    expect(pointTimeOk({ id: 'r', weight: 1, time: 'dawn' }, 10)).toBe(false);
    expect(pointTimeOk({ id: 'o', weight: 1, time: 'night' }, 23)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Manifest

const meta = (over: Partial<AudioMetaLike> = {}): AudioMetaLike => ({
  id: 'mus_a',
  kind: 'music',
  bus: 'music',
  group: null,
  files: ['processed/audio/music/mus_a_s1.ogg', 'processed/audio/music/mus_a_s2.ogg'],
  durationSec: 64,
  loop: true,
  loopStart: 0,
  loopEnd: 64 * 48000,
  bpm: 120,
  beatsPerBar: 4,
  bars: 32,
  stems: 2,
  variants: 1,
  channels: 'stereo',
  syncOffsetMs: null,
  priority: null,
  caption: null,
  importVersion: 'v1',
  source: { sha256: 'abc' },
  ...over,
});
const rec = {
  id: 'mus_a',
  kind: 'audio',
  status: 'approved',
  file: 'audio/music/mus_a.ogg',
  sha256: 'abc',
};

describe('audio manifest (9.2, 9.3)', () => {
  it('plays only approved, fresh, well-formed results', () => {
    expect(audioMetaProblems(rec, meta(), 'v1')).toEqual([]);
    expect(audioMetaProblems(rec, meta(), 'v2')[0]).toMatch(/made by import v1/);
    expect(audioMetaProblems(rec, meta({ source: { sha256: 'zzz' } }), 'v1')[0]).toMatch(
      /another source file/,
    );
    expect(audioMetaProblems(rec, meta({ stems: 3 }), 'v1')[0]).toMatch(/2 files for 3 layers/);
    expect(audioMetaProblems(rec, meta({ loopEnd: null }), 'v1')[0]).toMatch(/without loop points/);
    expect(audioMetaProblems(rec, null, 'v1')).toEqual(['mus_a: no processed metadata']);
    const { index, problems } = buildAudioIndex(
      [rec, { ...rec, id: 'mus_b', status: 'rework' }, { ...rec, id: 'mus_c', file: 'x.ogg' }],
      (r) => (r.id === 'mus_a' ? meta() : null),
      'v1',
    );
    expect(index.ids()).toEqual(['mus_a']);
    expect(problems).toEqual(['mus_c: no processed metadata']);
    const e = index.get('mus_a') as AudioEntry;
    expect([e.layered, e.loopStartSec, e.loopEndSec]).toEqual([true, 0, 64]);
  });

  it("packs a map's tracks, beds and details that have files", () => {
    const index = new AudioIndex([
      { ...(buildAudioIndex([rec], () => meta(), 'v1').index.get('mus_a') as AudioEntry) },
      {
        ...(buildAudioIndex([rec], () => meta(), 'v1').index.get('mus_a') as AudioEntry),
        id: 'amb_b',
      },
    ]);
    expect(
      mapPack(index, {
        music: 'mus_a',
        musicNight: 'mus_none',
        ambience: [{ id: 'amb_b' }, 'amb_none'],
        ambiencePoints: [{ id: 'amb_pt_none' }],
      }),
    ).toEqual(['mus_a', 'amb_b']);
  });
});

// ---------------------------------------------------------------------------
// Settings, rumble, captions

describe('audio settings and accessibility (10.3, 10.4)', () => {
  it('defaults every option and follows the system reduce-motion preference', () => {
    const s = resolveAudioSettings(null, { focused: true, systemReducedMotion: false });
    expect(s).toMatchObject({
      mono: false,
      night: false,
      combatMusic: true,
      dialogueBlips: true,
      llmThinking: true,
      reduceLoud: false,
      captions: 'important',
      reduceFlashing: false,
      rumble: 0.7,
    });
    expect(s.mix.volumes).toEqual({ master: 100, music: 70, ambience: 80, sfx: 90, ui: 70 });
    const moved = resolveAudioSettings(
      { accessibility: { reduceFlashing: 'system' }, input: { rumble: 100 } },
      { focused: false, systemReducedMotion: true },
    );
    expect([moved.reduceFlashing, moved.rumble, moved.mix.focused]).toEqual([true, 0, false]);
    expect([
      flashReduced('on', false),
      flashReduced('off', true),
      flashReduced(undefined, true),
    ]).toEqual([true, false, true]);
    const bad = resolveAudioSettings(
      { volume: { music: 900 }, audio: { output: 'quad' as never, reduceLoud: true } },
      { focused: true, systemReducedMotion: false },
    );
    expect([bad.mix.volumes.music, bad.mono, bad.reduceLoud]).toEqual([100, false, true]);
  });

  it('shows captions by level and setting; night, loud and mono reach the master chain', () => {
    expect(captionShown('important', 'important')).toBe(true);
    expect(captionShown('all', 'important')).toBe(false);
    expect(captionShown('all', 'all')).toBe(true);
    expect(captionShown('important', 'off')).toBe(false);
    expect(masterChain({ night: true, reduceLoud: true, mono: true })).toEqual({
      limiterDb: -1,
      night: { thresholdDb: -24, ratio: 3 },
      sfxLimiterDb: -18,
      mono: true,
    });
    expect(masterChain({ night: false, reduceLoud: false, mono: false })).toMatchObject({
      night: null,
      sfxLimiterDb: null,
    });
  });

  it('rumbles by the 10.5 table, scaled, ramped, and never with reduce shaking', () => {
    expect(rumbleSteps('crit_dealt', 1, false)).toEqual([
      { atMs: 0, durationMs: 100, strong: 0, weak: 0.3 },
    ]);
    expect(rumbleSteps('heavy_hit_taken', 0.5, false)[0]?.strong).toBeCloseTo(0.25, 6);
    const ramp = rumbleSteps('major_door', 1, false);
    expect(ramp.length).toBe(4);
    expect(ramp[0]?.strong).toBeLessThan(ramp[3]?.strong ?? 0);
    expect(ramp[3]?.strong).toBeCloseTo(0.5, 6);
    expect(rumbleSteps('boss_stomp', 1, true)).toEqual([]);
    expect(rumbleSteps('boss_stomp', 0, false)).toEqual([]);
  });

  it('keeps three caption lines for 3 s, refreshes repeats, keeps important ones longest', () => {
    const b = new CaptionBoard();
    expect(captionId('audio.cap.sfx_mon_aggro')).toBe('sfx_mon_aggro');
    expect(captionId('cap.x')).toBeNull();
    expect(b.push({ key: 'audio.cap.a', level: 'all', direction: null }, 'important', 0)).toBe(
      false,
    );
    b.push({ key: 'audio.cap.a', level: 'important', direction: 'left' }, 'all', 0);
    b.push({ key: 'audio.cap.b', level: 'all', direction: null }, 'all', 100);
    b.push({ key: 'audio.cap.c', level: 'all', direction: null }, 'all', 200);
    b.push({ key: 'audio.cap.d', level: 'all', direction: null }, 'all', 300);
    expect(b.active(400).map((l) => l.cap)).toEqual(['a', 'c', 'd']);
    const stamp = b.stamp(400);
    b.push({ key: 'audio.cap.a', level: 'important', direction: 'right' }, 'all', 2900);
    expect(b.stamp(2900)).toBeGreaterThan(stamp);
    expect(b.active(3250).map((l) => [l.cap, l.dir])).toEqual([
      ['a', 'right'],
      ['d', null],
    ]);
    expect(b.active(3350).map((l) => l.cap)).toEqual(['a']);
    expect(b.active(6000)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Hit-sound selection fields (combat 8.3)

describe('hit-sound selection fields (combat_and_classes.md 8.3, audio 7.16)', () => {
  const sel = AUDIO_TABLES.selection;
  it('derives the weapon class: the event first, spells none, beasts unarmed, people by hand', () => {
    expect(weaponClassOf({ isMonster: true, family: 'beast', body: 'wolf' }, null, sel)).toBe(
      'unarmed',
    );
    expect(
      weaponClassOf({ isMonster: true, family: 'humanoid', classId: 'rogue' }, null, sel),
    ).toBe('dagger');
    expect(weaponClassOf({ isMonster: true, weaponClass: 'polearm' }, null, sel)).toBe('polearm');
    expect(weaponClassOf({ isMonster: false, armed: true, reach: 1.2 }, null, sel)).toBe('sword');
    expect(weaponClassOf({ isMonster: false, armed: true, reach: 8 }, null, sel)).toBe('bow');
    expect(weaponClassOf({ isMonster: false }, null, sel)).toBe('unarmed');
    expect(weaponClassOf({ isMonster: false, armed: true }, { weaponStrike: false }, sel)).toBe(
      'none',
    );
    const forced = selectHit({ weaponClass: 'axe', heavy: true }, { armed: true }, null, null, sel);
    expect(forced).toMatchObject({
      weaponClass: 'axe',
      damageKind: 'slash',
      heavy: true,
      ranged: false,
    });
  });

  it('maps damage kinds and materials by 8.3 and the 7.16 material table', () => {
    expect(
      [
        'sword',
        'axe',
        'dagger',
        'polearm',
        'thrown',
        'mace',
        'staff',
        'rod',
        'fist',
        'unarmed',
        'bow',
        'crossbow',
        'none',
      ].map((w) => damageKindOf(w as never)),
    ).toEqual([
      'slash',
      'slash',
      'pierce',
      'pierce',
      'pierce',
      'blunt',
      'blunt',
      'blunt',
      'blunt',
      'blunt',
      'arrow',
      'arrow',
      null,
    ]);
    expect(materialOf({ isMonster: true, family: 'undead', body: 'undead' }, sel)).toBe('bone');
    expect(materialOf({ isMonster: true, family: 'undead', body: 'spirit' }, sel)).toBe('spirit');
    expect(materialOf({ isMonster: true, family: 'elemental', body: 'slime' }, sel)).toBe('ash');
    expect(materialOf({ isMonster: true, family: 'construct', body: 'golem' }, sel)).toBe('stone');
    expect(materialOf({ isMonster: true, family: 'humanoid', armor: 'mail' }, sel)).toBe('mail');
    expect(materialOf({ isMonster: true, family: 'beast', body: 'wolf' }, sel)).toBe('flesh');
    expect(materialOf({ isMonster: false, armor: 'cloth' }, sel)).toBe('flesh');
    expect(materialOf({ isMonster: false, armor: 'plate' }, sel)).toBe('plate');
    expect(materialOf({ material: 'crystal' }, sel)).toBe('crystal');
  });

  it('turns the fields into the cue table trigger fields', () => {
    const two = selectHit({}, { armed: true, twoHanded: true }, { armor: 'mail' }, null, sel);
    expect(hitCueFields(two, { twoHanded: true })).toMatchObject({
      attack: 'melee',
      weapon: 'greatsword',
      weight: 'light',
      damage: 'slash',
      material: 'mail',
      arrowMaterial: 'metal',
      parry: 'heavy',
    });
    const bow = selectHit(
      {},
      { armed: true, reach: 8 },
      { isMonster: true, family: 'beast' },
      null,
      sel,
    );
    const f = hitCueFields(bow);
    expect([f.attack, f.rangedWeapon, f.arrowMaterial, f.weapon, f.damage]).toEqual([
      'ranged',
      'bow',
      'flesh',
      undefined,
      undefined,
    ]);
    const spell = selectHit(
      { school: 'fire' },
      { armed: true },
      null,
      { weaponStrike: false },
      sel,
    );
    expect(hitCueFields(spell).attack).toBe('spell');
    expect([
      swingWeaponOf('polearm', false),
      swingWeaponOf('mace', true),
      swingWeaponOf('rod', false),
    ]).toEqual(['spear', 'maul', 'staff']);
    expect([arrowMaterialOf('bone'), arrowMaterialOf('leather')]).toEqual(['stone', 'flesh']);
  });

  it('names voices, boss voices and footstep surfaces from the selection table', () => {
    expect(voiceOf({ body: 'wolf', family: 'beast' }, sel)).toBe('canine');
    expect(voiceOf({ body: 'unknownbody', family: 'construct' }, sel)).toBe('construct_stone');
    expect(voiceOf({ voice: 'serpent', body: 'wolf' }, sel)).toBe('serpent');
    expect(bossVoiceOf({ body: 'bird' }, sel)).toBe('great_bird');
    expect(bossVoiceOf({ body: 'unknownbody' }, sel)).toBe('champion');
    expect([
      surfaceOf('road', false, sel),
      surfaceOf('floor', false, sel),
      surfaceOf('floor', true, sel),
      surfaceOf('wall', false, sel),
    ]).toEqual(['gravel', 'wood', 'stone', null]);
  });
});

// ---------------------------------------------------------------------------
// Engine and facade

function entry(id: string, over: Partial<AudioEntry> = {}): AudioEntry {
  const music = id.startsWith('mus_');
  const amb = id.startsWith('amb_') && !id.startsWith('amb_pt_');
  return {
    id,
    kind: music ? 'music' : amb ? 'ambience' : 'sfx',
    bus: music
      ? 'music'
      : amb || id.startsWith('amb_pt_')
        ? 'ambience'
        : id.startsWith('sfx_ui_')
          ? 'ui'
          : 'sfx',
    group: null,
    files: [`processed/audio/${id}.ogg`],
    layered: false,
    durationSec: music ? 64 : amb ? 60 : 1,
    loop: music ? !id.startsWith('mus_stg_') : amb,
    loopStartSec: 0,
    loopEndSec: music ? 64 : 60,
    bpm: music ? 120 : null,
    beatsPerBar: music ? 4 : null,
    channels: music || amb ? 'stereo' : 'mono',
    syncOffsetMs: 0,
    priority: null,
    caption: null,
    ...over,
  };
}

const IDS = [
  'mus_town_borderstone_day',
  'mus_town_borderstone_night',
  'mus_cmb_skirmish',
  'mus_stg_level_up',
  'amb_town_day',
  'amb_town_night',
  'amb_fauna_temperate_night',
  'amb_pt_dog_bark',
  'sfx_hit_slash_flesh',
  'sfx_wpn_sword_light',
  'sfx_mon_aggro',
  'sfx_ui_llm_reply',
  'sfx_ui_blip_npc_low',
  'sfx_boss_great_beast_roar',
];
const fullIndex = () =>
  new AudioIndex([
    ...IDS.map((id) => entry(id)),
    entry('sfx_pres_heartbeat_low', { loop: true }),
    entry('sfx_ui_llm_thinking', { loop: true, bus: 'ui' }),
  ]);

const settings = (over: Partial<AudioRuntimeSettings> = {}): AudioRuntimeSettings => ({
  ...resolveAudioSettings(null, { focused: true, systemReducedMotion: false }),
  ...over,
});

function frame(over: Partial<AudioFrame> = {}): AudioFrame {
  return {
    nowMs: 0,
    mapId: 'borderstone',
    location: {
      mapId: 'borderstone',
      region: 'edgestone_area',
      music: 'mus_town_borderstone_day',
      musicNight: 'mus_town_borderstone_night',
      ambience: [],
      town: true,
    },
    night: false,
    hour: 12,
    weather: 'clear',
    outdoor: true,
    combat: { hostiles: [], playerLevel: 5, wave: false },
    tension: { aware: false, sediment: 0, wild: false, flag: 0 },
    boss: null,
    paused: false,
    inScene: false,
    dialogueOpen: false,
    beds: [
      { id: 'amb_town_day', time: 'day' },
      { id: 'amb_town_night', time: 'night' },
      { id: 'amb_fauna_temperate_night', time: 'night' },
    ],
    points: [{ id: 'amb_pt_dog_bark', weight: 1 }],
    reverb: 'street',
    sediment: 0,
    activeDungeon: false,
    interiorKind: null,
    listener: listener(),
    sustain: [],
    aiWaiting: false,
    ...over,
  };
}

const ops = (e: AudioEngine) => e.drain();
const opsOf = <K extends AudioOp['op']>(list: AudioOp[], op: K) =>
  list.filter((o): o is Extract<AudioOp, { op: K }> => o.op === op);

describe('audio engine', () => {
  it('runs silent with no approved files: no sound, the captions and rumble still work', () => {
    const e = new AudioEngine(AUDIO_TABLES, settings(), seededRng(1));
    for (let t = 0; t < 30_000; t += 50) e.update(frame({ nowMs: t }));
    e.trigger({ event: 'combat.aggro', fields: {}, at: { x: 60, y: 50, threat: true } });
    e.trigger({
      event: 'combat.damage',
      fields: { attack: 'melee', outcome: 'crit', damage: 'slash', material: 'flesh', tick: false },
      at: { x: 51, y: 50 },
      rumble: 'crit_dealt',
    });
    const out = ops(e);
    expect(out.filter((o) => ['play', 'bed', 'music', 'preload'].includes(o.op))).toEqual([]);
    expect(opsOf(out, 'rumble')).toHaveLength(1);
    expect(e.captionLines(30_000).map((l) => [l.cap, l.dir])).toEqual([['sfx_mon_aggro', 'right']]);
  });

  it('plays the map: track, beds, reverb, bus state; night swaps the aligned version', () => {
    const e = new AudioEngine(AUDIO_TABLES, settings(), seededRng(1), fullIndex());
    e.update(frame());
    const first = ops(e);
    expect(opsOf(first, 'preload')[0]?.files.length).toBeGreaterThan(0);
    expect(opsOf(first, 'music').map((o) => [o.cmd.op, o.cmd.op === 'start' && o.cmd.id])).toEqual([
      ['start', 'mus_town_borderstone_day'],
    ]);
    expect(opsOf(first, 'bed').map((o) => o.id)).toEqual(['amb_town_day']);
    expect(opsOf(first, 'reverb')).toEqual([{ op: 'reverb', zone: 'street' }]);
    expect(opsOf(first, 'bus')).toHaveLength(1);
    e.update(frame({ nowMs: 100 }));
    expect(ops(e)).toEqual([]);
    e.update(frame({ nowMs: 21_000, night: true, hour: 19 }));
    const dusk = ops(e);
    const start = opsOf(dusk, 'music').find((o) => o.cmd.op === 'start');
    expect(start?.cmd).toMatchObject({ id: 'mus_town_borderstone_night', fadeInMs: 8000 });
    expect(opsOf(dusk, 'bedStop').map((o) => o.id)).toEqual(['amb_town_day']);
    expect(opsOf(dusk, 'bed').map((o) => o.id)).toEqual([
      'amb_town_night',
      'amb_fauna_temperate_night',
    ]);
  });

  it('enters a fight on the beat, defers the level-up phrase until it ends', () => {
    const e = new AudioEngine(AUDIO_TABLES, settings(), seededRng(1), fullIndex());
    e.update(frame());
    ops(e);
    const foes = {
      hostiles: [
        { level: 5, rank: 'normal' as const, engaged: true, presence: 0 },
        { level: 5, rank: 'normal' as const, engaged: true, presence: 0 },
      ],
      playerLevel: 5,
      wave: false,
    };
    e.update(frame({ nowMs: 1000, combat: foes }));
    const fightOps = ops(e);
    expect(opsOf(fightOps, 'music').find((o) => o.cmd.op === 'start')?.cmd).toMatchObject({
      id: 'mus_cmb_skirmish',
    });
    e.trigger({ event: 'player.level_up', fields: {} });
    expect(opsOf(ops(e), 'music').filter((o) => o.cmd.op === 'stinger')).toEqual([]);
    const calm = { hostiles: [], playerLevel: 5, wave: false };
    e.update(frame({ nowMs: 6000, combat: calm }));
    const after = ops(e);
    expect(opsOf(after, 'music').map((o) => o.cmd.op)).toContain('stinger');
    // The phrase ducks the music decks 6 dB while it plays (5.7), not itself: the music bus
    // keeps its slider level and the decks take the duck.
    const bus = opsOf(after, 'bus')[0];
    expect(bus?.deckDb).toBe(-6);
    expect(bus?.mix.music.db).toBeCloseTo(25 * Math.log10(0.7), 6);
  });

  it('places hits, merges them, honours the blip and loud settings and the eavesdrop tier', () => {
    const e = new AudioEngine(
      AUDIO_TABLES,
      settings({ dialogueBlips: false }),
      seededRng(2),
      fullIndex(),
    );
    e.update(frame());
    ops(e);
    const hit = {
      event: 'combat.damage',
      fields: {
        attack: 'melee',
        outcome: 'hit',
        damage: 'slash',
        material: 'flesh',
        tick: false,
        involvesPlayer: true,
      },
      at: { x: 55, y: 50 },
      targetId: 't1',
    };
    e.trigger(hit);
    e.trigger(hit);
    const plays = opsOf(ops(e), 'play');
    expect(plays).toHaveLength(1);
    expect(plays[0]).toMatchObject({ id: 'sfx_hit_slash_flesh', bus: 'sfx', wet: true });
    expect(plays[0]?.pan).toBeGreaterThan(0);
    e.playSound('sfx_ui_blip_npc_low');
    expect(opsOf(ops(e), 'play')).toEqual([]);
    const on = new AudioEngine(
      AUDIO_TABLES,
      settings({ reduceLoud: true }),
      seededRng(2),
      fullIndex(),
    );
    on.update(frame());
    ops(on);
    on.overrides.listen = 'far';
    on.playSound('sfx_ui_blip_npc_low');
    expect(opsOf(ops(on), 'play')[0]).toMatchObject({
      gainDb: LISTEN_MIX.far.gainDb,
      lowpassHz: 1200,
    });
    on.trigger({ event: 'combat.boss_engaged', fields: { bossVoice: 'great_beast' } });
    const roar = opsOf(ops(on), 'play')[0];
    expect(roar?.id).toBe('sfx_boss_great_beast_roar');
    // The 6 dB cut, within the 1.5 dB variant jitter.
    expect(roar?.gainDb).toBeLessThanOrEqual(-4.5);
    expect(roar?.gainDb).toBeGreaterThanOrEqual(-7.5);
    expect(on.captionLines(0).map((l) => l.cap)).toEqual(['sfx_boss_roar']);
  });

  it('holds the heartbeat while presence lasts, pulses the pad, then lets it go', () => {
    const e = new AudioEngine(AUDIO_TABLES, settings({ rumble: 1 }), seededRng(3), fullIndex());
    e.update(frame());
    ops(e);
    e.trigger({ event: 'combat.presence_felt', fields: { presence: 'low' } });
    const start = opsOf(ops(e), 'play');
    expect(start.map((o) => [o.id, o.loop])).toEqual([['sfx_pres_heartbeat_low', true]]);
    let pulses = 0;
    for (let t = 100; t <= 3000; t += 100) {
      e.update(frame({ nowMs: t, sustain: ['presence_heartbeat'], presence: 'low' }));
      pulses += opsOf(ops(e), 'rumble').length;
    }
    expect(pulses).toBeGreaterThanOrEqual(2);
    e.update(frame({ nowMs: 3500 }));
    expect(opsOf(ops(e), 'stop')).toEqual([]);
    e.update(frame({ nowMs: 4200 }));
    expect(opsOf(ops(e), 'stop').map((o) => o.voice)).toEqual([start[0]?.voice]);
  });

  it('marks a model wait only after 600 ms, then plays the reply sound', () => {
    const e = new AudioEngine(AUDIO_TABLES, settings(), seededRng(4), fullIndex());
    e.update(frame({ aiWaiting: true }));
    e.update(frame({ nowMs: 500, aiWaiting: true }));
    expect(opsOf(ops(e), 'play')).toEqual([]);
    e.update(frame({ nowMs: 700, aiWaiting: true }));
    expect(opsOf(ops(e), 'play').map((o) => o.id)).toEqual(['sfx_ui_llm_thinking']);
    e.update(frame({ nowMs: 900, aiWaiting: false }));
    const end = ops(e);
    expect(opsOf(end, 'stop')[0]?.fadeMs).toBe(200);
    expect(opsOf(end, 'play').map((o) => o.id)).toEqual(['sfx_ui_llm_reply']);
    // A quick reply (under 600 ms) makes no sound at all.
    const q = new AudioEngine(AUDIO_TABLES, settings(), seededRng(4), fullIndex());
    q.update(frame({ aiWaiting: true }));
    q.update(frame({ nowMs: 300, aiWaiting: false }));
    expect(opsOf(ops(q), 'play')).toEqual([]);
  });

  it('opens the cutscene layers, keeps L2 closed far from the curtain, and stops everything', () => {
    const idx = new AudioIndex([
      ...IDS.map((id) => entry(id)),
      entry('mus_pro_antechamber', { layered: true, files: ['a_s1.ogg', 'a_s2.ogg'] }),
      entry('mus_cue_zoomout', { layered: true, files: ['z1', 'z2', 'z3', 'z4', 'z5', 'z6'] }),
    ]);
    const e = new AudioEngine(AUDIO_TABLES, settings(), seededRng(5), idx);
    e.overrides.listen = 'far';
    e.update(
      frame({
        location: {
          ...(frame().location as NonNullable<AudioFrame['location']>),
          music: 'mus_pro_antechamber',
          musicNight: null,
        },
      }),
    );
    const s = opsOf(ops(e), 'music').find((o) => o.cmd.op === 'start')?.cmd;
    expect(s?.op === 'start' && s.layers).toEqual([0, OFF]);
    e.overrides.cutscene = { music: 'mus_cue_zoomout', silence: false, layers: 2 };
    e.update(frame({ nowMs: 1000 }));
    const z = opsOf(ops(e), 'music').find((o) => o.cmd.op === 'start')?.cmd;
    expect(z?.op === 'start' && z.layers).toEqual([0, 0, OFF, OFF]);
    e.stopAll();
    const end = ops(e);
    expect(opsOf(end, 'music').every((o) => o.cmd.op === 'stop')).toBe(true);
    expect(opsOf(end, 'bedStop').length).toBeGreaterThan(0);
  });
});

describe('audio engine: fights, phrases and silences', () => {
  const bossFrame = (nowMs: number, over: Partial<AudioFrame> = {}) =>
    frame({
      nowMs,
      boss: { music: 'mus_boss_standard', phase: 0 },
      combat: {
        hostiles: [{ level: 5, rank: 'boss', engaged: true, presence: 0 }],
        playerLevel: 5,
        wave: false,
      },
      ...over,
    });
  const calm = { hostiles: [], playerLevel: 5, wave: false };
  const idx = () =>
    new AudioIndex([
      ...IDS.map((id) => entry(id)),
      entry('mus_boss_standard', { layered: true, files: ['b1', 'b2', 'b3'] }),
      entry('mus_stg_victory'),
      entry('sfx_boss_great_beast_roar', { durationSec: 2 }),
    ]);

  it('plays the victory phrase only when the boss falls, never on a wipe', () => {
    const won = new AudioEngine(AUDIO_TABLES, settings(), seededRng(1), idx());
    won.update(frame());
    won.update(bossFrame(1000));
    ops(won);
    won.update(frame({ nowMs: 5000, combat: calm, bossVictory: true }));
    const w = opsOf(ops(won), 'music').map((o) => o.cmd.op === 'stinger' && o.cmd.id);
    expect(w).toContain('mus_stg_victory');
    const lost = new AudioEngine(AUDIO_TABLES, settings(), seededRng(1), idx());
    lost.update(frame());
    lost.update(bossFrame(1000));
    ops(lost);
    lost.update(frame({ nowMs: 5000, combat: calm }));
    expect(opsOf(ops(lost), 'music').some((o) => o.cmd.op === 'stinger')).toBe(false);
  });

  it('opens the boss layers by the kernel phase index, holds the track for the roar', () => {
    const e = new AudioEngine(AUDIO_TABLES, settings(), seededRng(1), idx());
    e.update(frame());
    ops(e);
    const f = bossFrame(1000);
    // The facade's order: the frame's clocks, the roar trigger, then the frame itself.
    e.begin(f);
    e.trigger({ event: 'combat.boss_engaged', fields: { bossVoice: 'great_beast' } });
    e.update(f);
    const start = opsOf(ops(e), 'music').find((o) => o.cmd.op === 'start')?.cmd;
    expect(start?.op === 'start' && [start.id, start.layers]).toEqual([
      'mus_boss_standard',
      [0, OFF, OFF],
    ]);
    // The boss track enters when the 2 s roar ends, not half a second in.
    expect(start?.atSec).toBeCloseTo(3, 2);
    e.update(bossFrame(4000, { boss: { music: 'mus_boss_standard', phase: 1 } }));
    const l = opsOf(ops(e), 'music').find((o) => o.cmd.op === 'layers')?.cmd;
    expect(l?.op === 'layers' && l.layers).toEqual([0, 0, OFF]);
  });

  it('runs the music on the audio clock when an output gives one', () => {
    const e = new AudioEngine(AUDIO_TABLES, settings(), seededRng(1), fullIndex());
    e.update(frame({ nowMs: 50_000, audioSec: 2 }));
    const start = opsOf(ops(e), 'music').find((o) => o.cmd.op === 'start')?.cmd;
    expect(start?.atSec).toBeCloseTo(2.05, 6);
  });

  it('a written silence keeps only the cutscene group of the effects', () => {
    const e = new AudioEngine(AUDIO_TABLES, settings(), seededRng(1), fullIndex());
    e.overrides.cutscene = { music: null, silence: true };
    e.update(frame());
    const bus = opsOf(ops(e), 'bus')[0];
    expect(bus?.mix.music.db).toBe(OFF);
    expect(bus?.mix.sfx.groupDb).toEqual({ combat: OFF, world: OFF, army: OFF, divine: OFF });
  });

  it('gives stereo sounds the distance but no pan; written loops stop on request', () => {
    const e = new AudioEngine(
      AUDIO_TABLES,
      settings(),
      seededRng(1),
      new AudioIndex([
        entry('sfx_cin_wide', { channels: 'stereo' }),
        entry('sfx_cin_loop', { loop: true, channels: 'stereo' }),
      ]),
    );
    e.update(frame());
    ops(e);
    e.playSound('sfx_cin_wide', { at: { x: 70, y: 50 }, bus: 'ui' });
    const wide = opsOf(ops(e), 'play')[0];
    expect([wide?.pan, wide?.wet]).toEqual([0, false]);
    expect(wide?.gainDb).toBeLessThan(-10);
    e.playSound('sfx_cin_loop', { bus: 'ui' });
    const loop = opsOf(ops(e), 'play')[0];
    for (let t = 100; t < 5000; t += 500) e.update(frame({ nowMs: t }));
    expect(opsOf(ops(e), 'stop')).toEqual([]);
    e.stopSound('sfx_cin_loop');
    expect(opsOf(ops(e), 'stop').map((o) => o.voice)).toEqual([loop?.voice]);
  });

  it('the dialogue drives the model wait: an error sounds even after a short wait', () => {
    const e = new AudioEngine(
      AUDIO_TABLES,
      settings(),
      seededRng(1),
      new AudioIndex([
        entry('sfx_ui_llm_thinking', { loop: true }),
        entry('sfx_ui_llm_reply'),
        entry('sfx_ui_llm_error'),
      ]),
    );
    e.update(frame());
    e.modelWait('start');
    // Background requests no longer count once the dialogue drives it.
    e.update(frame({ nowMs: 100, aiWaiting: false }));
    e.update(frame({ nowMs: 800, aiWaiting: false }));
    expect(opsOf(ops(e), 'play').map((o) => o.id)).toEqual(['sfx_ui_llm_thinking']);
    e.modelWait('error');
    expect(opsOf(ops(e), 'play').map((o) => o.id)).toEqual(['sfx_ui_llm_error']);
    e.modelWait('start');
    e.update(frame({ nowMs: 900 }));
    e.modelWait('reply');
    expect(opsOf(ops(e), 'play')).toEqual([]);
  });

  it('a new index stops the beds of the old one', () => {
    const e = new AudioEngine(AUDIO_TABLES, settings(), seededRng(1), fullIndex());
    e.update(frame());
    ops(e);
    e.setIndex(new AudioIndex());
    expect(opsOf(ops(e), 'bedStop').map((o) => o.id)).toEqual(['amb_town_day']);
  });
});

describe('the audio settings page model (ui_set_audio, ux 4.3)', () => {
  const sync = {
    volume: { master: 100, music: 70, ambience: 80, sfx: 90, ui: 70, background: 'lower' as const },
    audio: defaultAudioOptions(),
    input: { ...defaultInputSettings() },
  };

  it('lists the five sliders, output, range, background, switches and rumble', () => {
    const m = audioPageModel(sync);
    expect(m.volumes.map((r) => [r.field, r.kind === 'range' && r.value])).toEqual([
      ['volume.master', 100],
      ['volume.music', 70],
      ['volume.ambience', 80],
      ['volume.sfx', 90],
      ['volume.ui', 70],
    ]);
    expect(m.output.map((r) => r.field)).toEqual([
      'audio.output',
      'audio.dynamicRange',
      'volume.background',
    ]);
    expect(m.behaviour.map((r) => [r.field, r.kind === 'toggle' && r.value])).toEqual([
      ['audio.combatMusic', true],
      ['audio.dialogueBlips', true],
      ['audio.llmThinking', true],
      ['audio.reduceLoud', false],
    ]);
    expect(m.pad.map((r) => r.field)).toEqual(['input.rumble']);
    const muted = audioPageModel({ ...sync, volume: { ...sync.volume, music: 0 } });
    const music = muted.volumes[1];
    expect(music?.kind === 'range' && music.text).toBe(t('ui.set.audio.muted'));
  });

  it('turns each change into a valid settings patch and refuses bad values', () => {
    expect(audioPatch(sync, 'volume.music', 35)).toEqual({ volume: { ...sync.volume, music: 35 } });
    expect(audioPatch(sync, 'volume.music', 135)).toBeNull();
    expect(audioPatch(sync, 'volume.background', 'mute')).toEqual({
      volume: { ...sync.volume, background: 'mute' },
    });
    expect(audioPatch(sync, 'audio.output', 'mono')).toEqual({
      audio: { ...sync.audio, output: 'mono' },
    });
    expect(audioPatch(sync, 'audio.dynamicRange', 'loud')).toBeNull();
    expect(audioPatch(sync, 'audio.reduceLoud', true)).toEqual({
      audio: { ...sync.audio, reduceLoud: true },
    });
    expect(audioPatch(sync, 'audio.reduceLoud', 'yes')).toBeNull();
    expect(audioPatch(sync, 'input.rumble', 40)).toEqual({ input: { ...sync.input, rumble: 40 } });
    for (const field of [
      'volume.ui',
      'audio.output',
      'audio.llmThinking',
      'input.rumble',
    ] as const) {
      const value = field === 'audio.output' ? 'mono' : field === 'audio.llmThinking' ? false : 10;
      const patch = audioPatch(sync, field, value);
      expect(patch && checkPatch('sync', patch).ok, field).toBe(true);
    }
    expect(checkPatch('sync', audioDefaultsPatch()).ok).toBe(true);
  });
});

describe('the GameAudio facade', () => {
  const fakeView = () => {
    const view = {
      tick: 0,
      calendar: () => ({ hour: 12 }),
      weather: () => 'clear',
      flags: () => ({}),
      flag: () => undefined,
      aiMode: () => 'off',
      aiPendingCount: () => 0,
      playerId: () => 'p',
      player: () => ({ id: 'p', mapId: 'm', x: 5, y: 5 }),
      entity: () => undefined,
      entityCount: () => 1,
      map: () => undefined,
      maps: () => [],
      currentMap: () => ({ id: 'm', locations: [], indoor: false, sediment: 0 }),
      entitiesOnMap: () => [],
      holding: () => ({ money: 0, items: {}, equipped: {} }),
      itemDef: () => undefined,
      recentEvents: () => [],
      traceActors: () => [],
      brainTraces: () => [],
      world: { slices: { combat: { units: {} } } },
      content: { monsters: [], abilities: [], auras: [], classes: [] },
    };
    return view as never;
  };
  const atlas = [
    {
      id: 'm',
      code: 'A1',
      name: 'm',
      tier: 'tile',
      role: 'hub',
      status: 'built',
      region: 'r',
      acts: [1],
      sediment: 0,
      size: [10, 10],
      music: 'mus_town_borderstone_day',
      ambience: ['amb_town_day'],
      reverbZone: 'street',
    },
  ] as never;
  const state = (nowMs: number) => ({
    nowMs,
    paused: false,
    inScene: false,
    dialogueOpen: false,
    camera: { yawDeg: 0, pitchDeg: 90, step: 2, viewportW: 1280, viewportH: 720 },
    focus: { x: 5, y: 5 },
  });

  it('stays silent before the first input and without an output, then plays once unlocked', async () => {
    const applied: AudioOp[] = [];
    let devices: (string | null)[] = [];
    const out: AudioOutput = {
      apply: (o) => applied.push(...o),
      resume: () => {},
      setDevice: (id) => devices.push(id),
      dispose: () => {},
    };
    let device: string | null = 'speakers-2';
    const audio = createGameAudio({
      view: fakeView(),
      root: null,
      atlas,
      settings: () => null,
      output: () => out,
      device: () => device,
      loadIndex: async () => ({ index: fullIndex(), problems: [] }),
    });
    await Promise.resolve();
    await Promise.resolve();
    audio.frame(state(0));
    expect(applied).toEqual([]);
    audio.unlock();
    audio.frame(state(100));
    expect(applied.some((o) => o.op === 'music')).toBe(true);
    expect(devices).toEqual(['speakers-2']);
    device = null;
    audio.frame(state(200));
    expect(devices).toEqual(['speakers-2', null]);
    audio.dispose();
    expect(applied.some((o) => o.op === 'music' && o.cmd.op === 'stop')).toBe(true);
    devices = [];
    // No audio device: unlock finds no output and everything stays silent, without errors.
    const silent = createGameAudio({
      view: fakeView(),
      root: null,
      atlas,
      settings: () => null,
      output: () => null,
    });
    silent.unlock();
    silent.frame(state(0));
    silent.setCutscene({ music: 'mus_cue_zoomout', layers: 2 });
    silent.playSound('sfx_mon_aggro', {
      caption: 'audio.cap.sfx_mon_aggro',
      captionLevel: 'important',
    });
    silent.playStinger('mus_stg_act_card');
    silent.frame(state(50));
    silent.dispose();
    expect(silent.settings().captions).toBe('important');
  });
});
