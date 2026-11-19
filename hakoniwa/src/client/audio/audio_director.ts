// Audio director state machine skeleton (audio_direction.md 5; release_engineering.md 9.2).
// From a snapshot of what the player can know (location, time of day, view, combat, cutscene,
// goddess presence, tension inputs) it decides what should be heard: the music context and
// track, the layer gains, the transition to use when the track changes, the ambience beds and
// the active ducks. Pure: the caller passes the clock in (nowMs, real milliseconds); no audio
// context, no world access. The music player (PK-M1-06) executes the plan.
//
// Rules implemented: the context priority of 5.1, the combat tiers and hysteresis of 5.4
// (tiers only rise during a fight; the fight ends after 4 s without an engaged hostile), the
// tension score of 5.5 recomputed every 2 s, the layer table of 5.5 and 5.6 (night without a
// night version: L2 off, L3 -6 dB, 8 kHz low-pass; snow closes L2, an ash storm opens L3, rain
// lowers the music behind a low-pass), the boss phases and battle crisis of 5.2 and 5.8, the
// cutscene's starting layers (5.9), and the transition table of 5.3.

import type { DuckTrigger } from './bus_model';

export type MusicContext =
  | 'cutscene'
  | 'boss'
  | 'combat'
  | 'battlefield'
  | 'divine'
  | 'dream'
  | 'location'
  | 'view'
  | 'none';
export type CombatTier = 'T0' | 'T1' | 'T2' | 'T3' | 'wave';
export type MapView = 'personal' | 'region' | 'city' | 'strategy' | 'battlefield';

export interface Hostile {
  level: number;
  /** normal, elite, rare (old monster), named (epithet), nest (nest lord), boss. */
  rank: 'normal' | 'elite' | 'rare' | 'named' | 'nest' | 'boss';
  /** In combat with the party and its threat on us. */
  engaged: boolean;
  /** Presence steps above the player (0 none). */
  presence: number;
}

export interface LocationAudio {
  mapId: string;
  region: string;
  music: string | null;
  musicNight: string | null;
  ambience: string[];
  town: boolean;
  /** The private realm (atlas role `private`): entering or leaving cuts the music like a door. */
  private?: boolean;
}

/** Weather as the music hears it (5.6); indoors the caller passes 'clear'. */
export type MusicWeather = 'clear' | 'rain' | 'storm' | 'snow' | 'ashfall';

export interface DirectorInput {
  nowMs: number;
  location: LocationAudio | null;
  night: boolean;
  view: MapView;
  /** The shot list's track, silence, and how many layers from L1 up start open (5.9). */
  cutscene: { music: string | null; silence: boolean; layers?: number } | null;
  /**
   * The boss track and the kernel's phase index (0 before the first health threshold: L1; 1
   * adds L2; 2 and on, the final phases, add L3).
   */
  boss: { music: string; phase?: number } | null;
  /** The boss fight just ended in a victory (the boss fell or yielded): the victory phrase. */
  bossVictory?: boolean;
  /** Sleep or waiting just skipped time: switch straight to the new time of day (5.6). */
  timeSkipped?: boolean;
  combat: { hostiles: Hostile[]; playerLevel: number; wave: boolean };
  divine: { music: string } | null;
  dream: boolean;
  tension: { aware: boolean; sediment: number; wild: boolean; flag: 0 | 1 | 2 };
  dialogueOpen: boolean;
  paused: boolean;
  /** Setting "combat music": off keeps the location track and only opens its percussion. */
  combatMusic: boolean;
  /** Tracks of the strategic views and the battlefield. */
  viewMusic?: Partial<Record<Exclude<MapView, 'personal'>, string>>;
  /** Weather outdoors (5.6); absent is clear. */
  weather?: MusicWeather;
  /** Battlefield crisis: a routed regiment, a hero badly hurt, an objective threatened (5.8). */
  battleCrisis?: boolean;
}

export type TransitionKind =
  | 'crossfade'
  | 'fade_gap'
  | 'cut_in'
  | 'phrase_return'
  | 'after_roar'
  | 'victory';

export interface Transition {
  kind: TransitionKind;
  ms: number;
  align: 'bar' | 'beat' | 'phrase' | 'none';
  /** fade_gap: silence between the tracks. */
  gapMs?: number;
  /** fade_gap: the fade-out part when it is not half of the rest (the door cut is 1 s out, 2 s in). */
  outMs?: number;
  /** victory: the stinger played before the location track returns. */
  stinger?: string;
  /** Day and night versions: the new track starts at the old one's playing position (5.3). */
  aligned?: boolean;
  /** A calmer location track: when the current pass ends within 20 s, wait for it (5.3). */
  calm?: boolean;
}

export interface MusicPlan {
  id: string | null;
  /**
   * Gain in dB per layer from L1 up (-Infinity = off). Layers past the end of the list are
   * off (a cutscene that opens N layers lists N zeros).
   */
  layers: number[];
  lowpassHz: number | null;
}

export interface DirectorOutput {
  context: MusicContext;
  combatTier: CombatTier | null;
  tension: number;
  music: MusicPlan;
  /** Set on the update where the track (or silence) changes. */
  transition: Transition | null;
  ambience: string[];
  ducks: DuckTrigger[];
}

export const COMBAT_EXIT_MS = 4000;
export const TENSION_PERIOD_MS = 2000;

export const COMBAT_TRACKS: Record<Exclude<CombatTier, 'T0'>, string> = {
  T1: 'mus_cmb_skirmish',
  T2: 'mus_cmb_elite',
  T3: 'mus_cmb_presence',
  wave: 'mus_cmb_tide',
};

export const DEFAULT_VIEW_MUSIC: Record<Exclude<MapView, 'personal'>, string> = {
  region: 'mus_travel_region',
  city: 'mus_city_build',
  strategy: 'mus_slg_peace',
  battlefield: 'mus_rts_skirmish',
};

const TIER_RANK: Record<CombatTier, number> = { T0: 0, T1: 1, wave: 2, T2: 2, T3: 3 };
const OFF = Number.NEGATIVE_INFINITY;

/** Combat tier of the engaged hostiles (5.4); null when nobody is engaged. */
export function combatTierOf(
  hostiles: readonly Hostile[],
  playerLevel: number,
  wave: boolean,
): CombatTier | null {
  const engaged = hostiles.filter((h) => h.engaged);
  if (engaged.length === 0) return null;
  if (engaged.some((h) => h.presence >= 1)) return 'T3';
  if (wave) return 'wave';
  if (engaged.some((h) => h.rank !== 'normal' && h.rank !== 'boss')) return 'T2';
  if (engaged.length >= 2 || engaged.some((h) => h.level >= playerLevel - 2)) return 'T1';
  return 'T0';
}

/** Tension score 0 to 3 (5.5). */
export function tensionOf(t: DirectorInput['tension'], night: boolean): number {
  const score = (t.aware ? 1 : 0) + (t.sediment >= 3 ? 1 : 0) + (night && t.wild ? 1 : 0) + t.flag;
  return Math.max(0, Math.min(3, score));
}

/** Location layer gains for a tension level (5.5), the night reduction and the weather (5.6). */
export function locationLayers(
  tension: number,
  nightReduced: boolean,
  weather: MusicWeather = 'clear',
): { layers: [number, number, number]; lowpassHz: number | null } {
  let layers: [number, number, number] =
    tension === 0 ? [0, 0, OFF] : tension === 1 ? [0, 0, 0] : [0, 0, 2];
  let lowpassHz: number | null = null;
  // An ash storm opens the storm layer (mus_reg_ash_middle's L3).
  if (weather === 'ashfall' && layers[2] === OFF) layers = [layers[0], layers[1], 0];
  if (nightReduced) {
    layers = [layers[0], OFF, layers[2] === OFF ? OFF : layers[2] - 6];
    lowpassHz = 8000;
  }
  // Snow: the world swallows sound, the percussion layer closes.
  if (weather === 'snow') layers = [layers[0], OFF, layers[2]];
  return { layers, lowpassHz };
}

/**
 * Boss track layers (5.2): the first phase L1, the second adds L2, the final phases L3. The
 * phase is the kernel's index (combat.boss_phase): 0 before the first threshold.
 */
export function bossLayers(phase: number | undefined): number[] {
  const p = phase ?? 0;
  return p <= 0 ? [0, OFF, OFF] : p === 1 ? [0, 0, OFF] : [0, 0, 0];
}

/** Time-of-day switches are at least this far apart in real time (release_engineering 9.2). */
export const NIGHT_SWITCH_MIN_MS = 60_000;
/** The town's intrigue track at tension 3 (5.5). */
export const INTRIGUE_TRACK = 'mus_cue_intrigue';

/** A cutscene's starting layers (5.9): the first `n` layers open, the rest off; all when unset. */
export function openLayers(n: number | undefined): number[] {
  if (n === undefined) return [0, 0, 0];
  const k = Math.max(1, Math.min(8, Math.floor(n)));
  return Array.from({ length: Math.max(3, k) }, (_, i) => (i < k ? 0 : OFF));
}

interface Current {
  context: MusicContext;
  id: string | null;
  region: string | null;
  mapId: string | null;
  night: boolean;
  private: boolean;
}

export class AudioDirector {
  private tier: CombatTier | null = null;
  private lastEngagedMs = Number.NEGATIVE_INFINITY;
  private tension = 0;
  private lastTensionMs = Number.NEGATIVE_INFINITY;
  private current: Current = {
    context: 'none',
    id: null,
    region: null,
    mapId: null,
    night: false,
    private: false,
  };
  private bossWasOn = false;
  /** The time of day the music shows, and since when (switches are spaced, 9.2). */
  private nightShown: boolean | null = null;
  private nightSinceMs = Number.NEGATIVE_INFINITY;

  /** Day or night as heard: a change waits until 60 s after the last one, unless time skipped. */
  private nightOf(input: DirectorInput): boolean {
    const now = input.nowMs;
    const mapChanged = !!input.location && input.location.mapId !== this.current.mapId;
    if (this.nightShown === null) {
      // The first look is not a switch: the spacing counts from the first real change.
      this.nightShown = input.night;
    } else if (
      input.night !== this.nightShown &&
      (input.timeSkipped || mapChanged || now - this.nightSinceMs >= NIGHT_SWITCH_MIN_MS)
    ) {
      this.nightSinceMs = now;
      this.nightShown = input.night;
    }
    return this.nightShown;
  }

  update(input: DirectorInput): DirectorOutput {
    const now = input.nowMs;
    const night = this.nightOf(input);
    // Combat with hysteresis: rise immediately, never fall, end after the quiet period.
    const tierNow = combatTierOf(
      input.combat.hostiles,
      input.combat.playerLevel,
      input.combat.wave,
    );
    const bossEnded = this.bossWasOn && !input.boss;
    const victory = bossEnded && !!input.bossVictory;
    if (victory) {
      // The boss fell: the fight is over now (5.3: victory phrase, then the location track),
      // without the 4 s combat tail.
      this.tier = null;
      this.lastEngagedMs = Number.NEGATIVE_INFINITY;
    } else if (tierNow) {
      this.lastEngagedMs = now;
      if (!this.tier || TIER_RANK[tierNow] > TIER_RANK[this.tier]) this.tier = tierNow;
    } else if (this.tier && now - this.lastEngagedMs >= COMBAT_EXIT_MS) {
      this.tier = null;
    }
    // Tension on its own cadence.
    if (now - this.lastTensionMs >= TENSION_PERIOD_MS) {
      this.tension = tensionOf(input.tension, night);
      this.lastTensionMs = now;
    }
    const presenceOutOfCombat = !this.tier && input.combat.hostiles.some((h) => h.presence >= 1);
    // Context by priority (5.1).
    const views = { ...DEFAULT_VIEW_MUSIC, ...(input.viewMusic ?? {}) };
    let context: MusicContext = 'none';
    let id: string | null = null;
    let layers: number[] = [0, 0, 0];
    let lowpassHz: number | null = null;
    const weather = input.weather ?? 'clear';
    const loc = input.view === 'personal' ? input.location : null;
    const combatTrack = this.tier && this.tier !== 'T0' && input.combatMusic;
    if (input.cutscene) {
      context = 'cutscene';
      id = input.cutscene.silence ? null : input.cutscene.music;
      layers = openLayers(input.cutscene.layers);
      // An unwritten track yields to the speaker or the dream, still above combat. An
      // explicit track and a written silence retain the shot list's highest priority.
      if (!input.cutscene.silence && !input.cutscene.music) {
        if (input.divine) {
          context = 'divine';
          id = input.divine.music;
          layers = [0, 0, OFF];
        } else if (input.dream) {
          context = 'dream';
          id = 'mus_cue_dream_door';
          layers = [0, 0, 0];
        }
      }
    } else if (input.boss) {
      context = 'boss';
      id = input.boss.music;
      layers = bossLayers(input.boss.phase);
    } else if (input.view === 'battlefield') {
      // Battles keep their own track and open layers with the fighting (5.8): deploy L1,
      // engaged adds L2, a crisis adds L3.
      context = 'battlefield';
      id = views.battlefield;
      const crisis = !!input.battleCrisis;
      layers = [0, this.tier || crisis ? 0 : OFF, crisis ? 0 : OFF];
    } else if (combatTrack) {
      context = 'combat';
      id = COMBAT_TRACKS[this.tier as Exclude<CombatTier, 'T0'>];
    } else if (input.divine) {
      context = 'divine';
      id = input.divine.music;
      layers = [0, 0, OFF];
    } else if (input.dream) {
      context = 'dream';
      id = 'mus_cue_dream_door';
    } else if (loc) {
      context = 'location';
      const nightTrack = night && loc.musicNight;
      id = nightTrack ? loc.musicNight : loc.music;
      if (this.tension >= 3 && loc.town) {
        id = INTRIGUE_TRACK;
      } else {
        const l = locationLayers(this.tension, night && !loc.musicNight, weather);
        layers = l.layers;
        lowpassHz = l.lowpassHz;
      }
      if (this.tier === 'T0' || (this.tier && !input.combatMusic)) {
        // Small fights keep the location track and open its percussion (+2 dB).
        layers = [layers[0] ?? 0, 2, layers[2] ?? OFF];
      }
      if (presenceOutOfCombat) layers = [0, OFF, OFF];
    } else if (input.view !== 'personal') {
      context = 'view';
      id = views[input.view];
    }
    const transition = this.transitionTo(context, id, loc, night, !!input.timeSkipped);
    this.bossWasOn = !!input.boss;
    this.current = {
      context,
      id,
      region: loc?.region ?? null,
      mapId: loc?.mapId ?? null,
      night,
      private: !!loc?.private,
    };
    // Ambience and ducks.
    const ambience = loc ? [...loc.ambience] : [];
    // Tension 2 opens the low dian bed; the wild keeps it at 3 (5.5), towns switch tracks instead.
    if (
      loc &&
      (this.tension === 2 || (this.tension >= 3 && !loc.town)) &&
      !ambience.includes('amb_dian_low')
    )
      ambience.push('amb_dian_low');
    const ducks: DuckTrigger[] = [];
    if (input.cutscene) ducks.push(input.cutscene.silence ? 'scripted_silence' : 'cutscene');
    // Her theme plays (context divine): the theme is not ducked, the rest is (8.2).
    if (input.divine) ducks.push(context === 'divine' ? 'oracle_theme' : 'oracle');
    if (input.dialogueOpen) ducks.push('dialogue');
    if (input.paused) ducks.push('pause');
    // Presence two steps and more darkens the mix (8.2); one step only thins the track (5.5).
    if (input.combat.hostiles.some((h) => h.presence >= 2)) ducks.push('presence');
    // Weather behind the music (5.6), outdoors only (the caller passes clear indoors).
    if (weather === 'rain') ducks.push('rain');
    else if (weather === 'storm') ducks.push('storm');
    return {
      context,
      combatTier: this.tier,
      tension: this.tension,
      music: { id, layers, lowpassHz },
      transition:
        victory && transition
          ? { kind: 'victory', ms: 1000, align: 'none', stinger: 'mus_stg_victory' }
          : transition,
      ambience,
      ducks,
    };
  }

  /** Transition from the current track to a new one (5.3); null when nothing changes. */
  private transitionTo(
    context: MusicContext,
    id: string | null,
    loc: LocationAudio | null,
    night: boolean,
    skipped: boolean,
  ): Transition | null {
    const cur = this.current;
    if (cur.context === context && cur.id === id) return null;
    if (context === 'cutscene') return { kind: 'crossfade', ms: 2000, align: 'none' };
    if (context === 'boss') return { kind: 'after_roar', ms: 500, align: 'none' };
    if (context === 'combat') {
      return cur.context === 'combat'
        ? { kind: 'crossfade', ms: 1500, align: 'beat' }
        : { kind: 'cut_in', ms: 1000, align: 'beat' };
    }
    if (cur.context === 'combat' && context === 'location')
      return { kind: 'phrase_return', ms: 7000, align: 'phrase' };
    if (context === 'dream' || cur.context === 'dream')
      return { kind: 'crossfade', ms: 6000, align: 'none' };
    if (context === 'divine' || cur.context === 'divine')
      return { kind: 'crossfade', ms: 3000, align: 'none' };
    if (context === 'view' || cur.context === 'view' || context === 'battlefield')
      return { kind: 'crossfade', ms: 2000, align: 'none' };
    if (context === 'location' && cur.context === 'location' && loc) {
      if ((loc.private || cur.private) && cur.mapId !== loc.mapId)
        return { kind: 'fade_gap', ms: 3000, align: 'none', gapMs: 0, outMs: 1000 };
      // The town's tension turns to intrigue after the next phrase (5.5); coming back is calmer.
      if (id === INTRIGUE_TRACK) return { kind: 'crossfade', ms: 3000, align: 'phrase' };
      if (cur.id === INTRIGUE_TRACK && cur.mapId === loc.mapId)
        return { kind: 'crossfade', ms: 3000, align: 'bar', calm: true };
      if (cur.mapId === loc.mapId && cur.night !== night) {
        // After sleep or waiting the new time of day starts at once (5.6).
        if (skipped) return { kind: 'crossfade', ms: 500, align: 'none' };
        const swap: Transition = { kind: 'crossfade', ms: 8000, align: 'bar' };
        // Day and night versions share tempo and length: carry the playing position over.
        if (loc.musicNight) swap.aligned = true;
        return swap;
      }
      if (cur.region !== loc.region)
        return { kind: 'fade_gap', ms: 5000, align: 'none', gapMs: 1000 };
      return { kind: 'crossfade', ms: 3000, align: 'bar' };
    }
    return { kind: 'crossfade', ms: 3000, align: 'bar' };
  }
}
