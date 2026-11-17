// The world probe (audio_direction.md 5.4, 5.5, 7.16, 8.3, 10.1): what the audio hears of the
// world, read through the client's GameView and the kernel events, never by calling a kernel
// command. Each frame it builds the engine's frame (the map's atlas registration, time of day,
// weather, the fight with its tiers and boss phase, tension, sediment, the interior around the
// listener, the camera) and the triggers the kernel does not emit itself: a hostile turning on
// the party (aggro, and the off-screen threat when it is outside the view), a boss fight
// starting (its roar), presence starting to press (the heartbeat), and footsteps from how far
// each walker moved. Each kernel event becomes a cue trigger with the cue table's fields: the
// hit-sound selection fields of combat 8.3 (./hit_select.ts), schools, outcomes, the voice
// family of a monster, the door's seal step, and the pad rumble that goes with it.
//
// A boss fight lasts from its first engagement to its end: the boss falls or yields (the
// victory phrase), the player goes down, or the boss stays out of the fight for 8 s (no
// victory). Tension reads only what the player may know (5.5): presence the player feels,
// foes on screen that turned on the party, the ground's grade, a story flag. Like the client
// adapters, the probe reads the combat units of the world slice directly. Pure: a function of
// the view, the events and the clock the caller passes.

import type { AnyWorldEvent } from '../../core/contracts';
import { isHostile, unitView } from '../../systems/combat';
import type { AbilityDef, AuraDef, MonsterDef } from '../../systems/combat/types';
import type { ItemDef } from '../../systems/inventory';
import { sedimentAt, tileAt } from '../../systems/world';
import type { AtlasMapDef } from '../../systems/world/atlas';
import type { MapDef } from '../../systems/world/types';
import type { GameView } from '../view/game_view';
import type { Hostile, LocationAudio, MusicWeather } from './audio_director';
import type { AudioFrame, AudioTables, AudioTrigger } from './audio_engine';
import type { CueValue } from './cue_map';
import {
  type ArmorClass,
  bossMusicOf,
  bossVoiceOf,
  type Combatant,
  hitCueFields,
  selectHit,
  surfaceOf,
  voiceOf,
  WEAPON_CLASSES,
} from './hit_select';
import type { RumbleEvent } from './rumble';
import { isReverbZone, type Listener, place } from './spatializer';

/** What the session knows that the world does not (camera, pause, open panels). */
export interface SessionAudioState {
  nowMs: number;
  paused: boolean;
  inScene: boolean;
  dialogueOpen: boolean;
  /** The camera, for placing sounds on the screen; null before the first draw. */
  camera: {
    yawDeg: number;
    pitchDeg: number;
    step: number;
    viewportW: number;
    viewportH: number;
  } | null;
  /** The interpolated player position (the listener). */
  focus: { x: number; y: number } | null;
  /** Distance an entity has moved so far (render interpolation), for footsteps. */
  travelled?: (id: string) => number;
}

/** Hostiles not yet fighting count within this distance; those in the fight count anywhere. */
export const HOSTILE_RANGE_M = 40;
/** The hostile scan runs at most this often. */
export const SCAN_MS = 100;
/** A hostile that turned on the party sounds its aggro again only after this long. */
export const AGGRO_REARM_MS = 10_000;
/** A boss out of the fight this long ends the fight without a victory. */
export const BOSS_LOST_MS = 8000;
/** Footsteps reach this far (8.3). */
export const FOOTSTEP_RANGE_M = 20;
/** A damage event takes at least this share of maximum health to be a heavy blow (10.5). */
export const HEAVY_HIT_SHARE = 0.15;

interface UnitLike {
  level: number;
  tier: number;
  side: string;
  target: string | null;
  combatUntil: number;
  hp: number;
  downed?: boolean;
  classId: string | null;
  monsterId: string | null;
  /** Presence radius in tiles (the bearer presses lower ranks of other sides nearby). */
  presence?: number;
}

const NIGHT = (hour: number): boolean => hour < 6 || hour >= 18;

/** Weather as the music hears it. */
export function musicWeather(w: string): MusicWeather {
  return w === 'rain' || w === 'storm' || w === 'snow' || w === 'ashfall' ? w : 'clear';
}

/** A map's audio registration as the director reads it. */
export function locationAudioOf(
  entry: Pick<AtlasMapDef, 'id' | 'region' | 'role' | 'music' | 'musicNight'> | undefined,
  mapId: string,
): LocationAudio {
  return {
    mapId,
    region: entry?.region ?? mapId,
    music: entry?.music ?? null,
    musicNight: entry?.musicNight ?? null,
    ambience: [],
    town: entry?.role === 'hub',
    private: entry?.role === 'private',
  };
}

/** The seal step of a door's added looseness (1.1: five steps), or null. */
export function sealStepOf(delta: number): string | null {
  if (!(delta > 0)) return null;
  if (delta >= 8) return 'extreme';
  if (delta >= 4) return 'large';
  if (delta >= 2) return 'mid';
  if (delta >= 1) return 'small';
  return 'faint';
}

/**
 * A creature voice's shift (7.16): bodies of scale 1.3 and up two semitones down, under 0.8
 * two up; an old monster (rank rare) two more down.
 */
export function voicePitchOf(scale: number | undefined, elder: boolean): number {
  const s = scale ?? 1;
  return (s >= 1.3 ? -2 : s < 0.8 ? 2 : 0) + (elder ? -2 : 0);
}

/** Dot kind of a periodic school (7.1 st ticks). */
function dotOf(school: string | undefined): string | undefined {
  switch (school) {
    case 'nature':
      return 'poison';
    case 'physical':
      return 'bleed';
    case 'fire':
      return 'burn';
    case 'frost':
      return 'chill';
    default:
      return undefined;
  }
}

const ARMOR_TAGS: readonly ArmorClass[] = ['cloth', 'leather', 'mail', 'plate'];
const isWeaponTag = (t: string): boolean => (WEAPON_CLASSES as readonly string[]).includes(t);

interface ScanHostile extends Hostile {
  id: string;
  boss: boolean;
  /** Turned on the party and on screen (the player can see it coming). */
  aware: boolean;
}

interface BossFight {
  id: string;
  /** The kernel's phase index (combat.boss_phase); 0 before the first threshold. */
  phase: number;
  family: string | undefined;
  lastEngagedMs: number;
}

/**
 * The building around a point on an outdoor map: the smallest location of an interior kind
 * (the ambience table's interior beds) that holds it. Sounds in different buildings, or one
 * inside and one out, are occluded (8.4); the listener's building picks the interior bed.
 */
export function zoneAt(
  map: Pick<MapDef, 'indoor' | 'locations'>,
  x: number,
  y: number,
  interiors: Readonly<Record<string, string>>,
): { id: string; kind: string } | null {
  if (map.indoor) return null;
  let best: { id: string; kind: string; area: number } | null = null;
  for (const l of map.locations) {
    if (!interiors[l.kind]) continue;
    if (x < l.x || y < l.y || x >= l.x + l.w || y >= l.y + l.h) continue;
    const area = l.w * l.h;
    if (!best || area < best.area) best = { id: l.id, kind: l.kind, area };
  }
  return best ? { id: best.id, kind: best.kind } : null;
}

export class WorldProbe {
  private readonly atlas: Map<string, AtlasMapDef>;
  private readonly monsters = new Map<string, MonsterDef | null>();
  private hostiles: ScanHostile[] = [];
  private lastScanMs = Number.NEGATIVE_INFINITY;
  /** The presence the player feels: its step (the rank gap) and whether it is at least two. */
  private presence: 'low' | 'high' | null = null;
  private aggroAt = new Map<string, number>();
  private boss: BossFight | null = null;
  /** Bosses beaten (fallen or yielded): their fight does not start again. */
  private defeated = new Set<string>();
  private phases = new Map<string, number>();
  private bossVictory = false;
  private timeSkipped = false;
  private waves = new Map<string, string>();
  private steps = new Map<string, number>();
  private voices: string[] = [];
  private camera: SessionAudioState['camera'] = null;
  private focus: SessionAudioState['focus'] = null;
  private readonly swingLead: number;

  constructor(
    private readonly view: GameView,
    private readonly tables: AudioTables,
    atlas: readonly AtlasMapDef[],
  ) {
    this.atlas = new Map(atlas.map((m) => [m.id, m]));
    this.swingLead = Math.max(
      0,
      ...tables.cues.cues.filter((c) => c.event === 'anim.swing').map((c) => c.syncOffsetMs ?? 0),
    );
  }

  private units(): Record<string, UnitLike> {
    const slices = this.view.world.slices as unknown as {
      combat?: { units?: Record<string, UnitLike> };
    };
    return slices.combat?.units ?? {};
  }

  private partyIds(): Set<string> {
    const pid = this.view.playerId();
    const out = new Set<string>([pid]);
    const p = this.view.player();
    if (!p) return out;
    for (const e of this.view.entitiesOnMap(p.mapId)) if (e.kind === 'companion') out.add(e.id);
    return out;
  }

  // -------------------------------------------------------------------------
  // Frame

  frame(s: SessionAudioState): { frame: AudioFrame; triggers: AudioTrigger[] } {
    const v = this.view;
    const now = s.nowMs;
    this.camera = s.camera;
    this.focus = s.focus;
    const player = v.player();
    const map = v.currentMap();
    const entry = map ? this.atlas.get(map.id) : undefined;
    const cal = v.calendar();
    const night = NIGHT(cal.hour);
    const triggers: AudioTrigger[] = [];
    const listener = this.listener();
    if (now - this.lastScanMs >= SCAN_MS) {
      this.lastScanMs = now;
      this.scan(now, map, listener, triggers);
    }
    if (s.travelled && player && map) this.footsteps(map, entry, s.travelled, triggers);
    const units = this.units();
    const pu = player ? units[player.id] : undefined;
    const outdoor = !!map && !map.indoor && (entry ? entry.tier === 'tile' : true);
    const tension = v.flag('tension_high');
    const pos = s.focus ?? (player ? { x: player.x, y: player.y } : null);
    const interior = map && pos ? zoneAt(map, pos.x, pos.y, this.tables.ambience.interiors) : null;
    if (listener) listener.zone = interior?.id ?? null;
    const grade = map && pos ? sedimentAt(map, pos.x, pos.y) : 0;
    const frame: AudioFrame = {
      nowMs: now,
      mapId: map?.id ?? null,
      location: map ? locationAudioOf(entry, map.id) : null,
      night,
      hour: cal.hour,
      weather: musicWeather(v.weather()),
      outdoor,
      combat: {
        hostiles: this.hostiles.map((h) => ({
          level: h.level,
          rank: h.rank,
          engaged: h.engaged,
          presence: h.presence,
        })),
        playerLevel: pu?.level ?? 1,
        wave: !!map && [...this.waves.values()].includes(map.id),
      },
      tension: {
        aware: this.hostiles.some((h) => !h.engaged && h.aware),
        sediment: grade,
        // The wild is the open field: dungeons have no day and night (5.5).
        wild: entry?.role === 'field',
        flag: tension === 2 ? 2 : tension === 1 || tension === true ? 1 : 0,
      },
      boss: this.boss
        ? {
            music: bossMusicOf(this.boss.family, this.tables.selection),
            phase: this.boss.phase,
          }
        : null,
      bossVictory: this.bossVictory,
      timeSkipped: this.timeSkipped,
      paused: s.paused,
      inScene: s.inScene,
      dialogueOpen: s.dialogueOpen,
      beds: entry?.ambience ?? [],
      points: entry?.ambiencePoints ?? [],
      reverb: isReverbZone(entry?.reverbZone) ? entry.reverbZone : map?.indoor ? 'room' : 'outdoor',
      sediment: grade,
      activeDungeon: false,
      interiorKind: interior?.kind ?? null,
      listener,
      sustain: this.presence ? ['presence_heartbeat'] : [],
      presence: this.presence,
      voices: this.voices,
      aiWaiting: (s.dialogueOpen || s.inScene) && v.aiMode() !== 'off' && v.aiPendingCount() > 0,
    };
    this.bossVictory = false;
    this.timeSkipped = false;
    return { frame, triggers };
  }

  private listener(): Listener | null {
    const c = this.camera;
    const f = this.focus ?? this.view.player() ?? null;
    if (!c || !f) return null;
    return {
      x: f.x,
      y: f.y,
      yawDeg: c.yawDeg,
      pitchDeg: c.pitchDeg,
      step: c.step,
      viewportW: c.viewportW,
      viewportH: c.viewportH,
    };
  }

  private monsterOf(id: string): MonsterDef | undefined {
    const e = this.view.entity(id);
    const u = this.units()[id];
    const mid = u?.monsterId ?? (e?.kind === 'monster' ? e.ref : undefined);
    if (!mid) return undefined;
    let def = this.monsters.get(mid);
    if (def === undefined) {
      def = (this.view.content.monsters ?? []).find((m) => m.id === mid) ?? null;
      this.monsters.set(mid, def);
    }
    return def ?? undefined;
  }

  private endBoss(victory: boolean): void {
    if (!this.boss) return;
    this.phases.delete(this.boss.id);
    if (victory) this.defeated.add(this.boss.id);
    this.boss = null;
    this.bossVictory = victory;
  }

  /**
   * Hostiles around the player (tiers, engagement, presence); the presence the player feels;
   * aggro, off-screen threat, heartbeat and boss triggers; the voice families on the map.
   */
  private scan(
    now: number,
    map: MapDef | undefined,
    listener: Listener | null,
    out: AudioTrigger[],
  ): void {
    const v = this.view;
    const player = v.player();
    if (!player || !map) {
      this.hostiles = [];
      this.presence = null;
      return;
    }
    const units = this.units();
    const party = this.partyIds();
    const pid = player.id;
    const me = units[pid];
    const world = v.world as never;
    const tick = v.tick;
    const next: ScanHostile[] = [];
    const voices = new Set<string>();
    let feltGap = 0;
    let bossEngaged = false;
    for (const e of v.entitiesOnMap(map.id)) {
      if (!e.alive || e.id === pid || e.hidden) continue;
      const u = units[e.id];
      if (!u || u.downed) continue;
      const def = this.monsterOf(e.id);
      if (def) {
        const voice = voiceOf(this.combatant(e.id), this.tables.selection);
        if (voice) voices.add(voice);
      }
      const dist = Math.hypot(e.x - player.x, e.y - player.y);
      const gap = me ? u.tier - me.tier : 0;
      // Presence presses lower ranks of other sides within the bearer's radius (power 3.5).
      const pressing = !!u.presence && dist <= u.presence && gap >= 1 && u.side !== me?.side;
      if (pressing) feltGap = Math.max(feltGap, gap);
      if (!isHostile(world, pid, e.id)) continue;
      const targetsParty = !!u.target && party.has(u.target);
      const engaged = targetsParty && u.combatUntil > tick;
      if (!engaged && dist > HOSTILE_RANGE_M) continue;
      const tags = e.tags ?? [];
      const rank: Hostile['rank'] =
        def?.rank === 'boss' || tags.includes('boss')
          ? 'boss'
          : def?.rank === 'elite' || tags.includes('elite')
            ? 'elite'
            : def?.rank === 'rare'
              ? 'rare'
              : 'normal';
      const at = { ...this.placeOf(map, e.x, e.y), threat: true };
      const shown = listener ? !place(at, listener).offscreen : true;
      next.push({
        id: e.id,
        level: u.level,
        rank,
        engaged,
        // A foe above the player's rank, in the fight or pressing from nearby (5.4, 5.5).
        presence: pressing || engaged ? Math.max(0, gap) : 0,
        boss: rank === 'boss',
        aware: targetsParty && shown,
      });
      if (targetsParty) {
        // It noticed us: the aggro sound (and the off-screen warning when out of view).
        const last = this.aggroAt.get(e.id);
        if (last === undefined || now - last >= AGGRO_REARM_MS) {
          const c = this.combatant(e.id);
          out.push({
            event: 'combat.aggro',
            fields: {},
            at,
            pitch: voicePitchOf(c?.scale, rank === 'rare'),
          });
          if (!shown) out.push({ event: 'client.threat_offscreen', fields: {}, at });
        }
        this.aggroAt.set(e.id, now);
      }
      if (engaged && rank === 'boss' && !this.defeated.has(e.id)) {
        bossEngaged = true;
        if (!this.boss) {
          this.boss = {
            id: e.id,
            phase: this.phases.get(e.id) ?? 0,
            family: def?.family,
            lastEngagedMs: now,
          };
          out.push({
            event: 'combat.boss_engaged',
            fields: { bossVoice: bossVoiceOf(this.combatant(e.id), this.tables.selection) },
            at,
          });
        } else if (this.boss.id === e.id) this.boss.lastEngagedMs = now;
      }
    }
    // The boss fight ends with the boss: fallen (a victory), gone, or out of the fight a while.
    if (this.boss) {
      const b = this.view.entity(this.boss.id);
      if (!b || b.mapId !== map.id) this.endBoss(false);
      else if (!b.alive) this.endBoss(true);
      else if (!bossEngaged && now - this.boss.lastEngagedMs >= BOSS_LOST_MS) this.endBoss(false);
    }
    // Presence starting (or deepening) sounds the heartbeat; it holds while it presses.
    const felt = feltGap >= 2 ? 'high' : feltGap >= 1 ? 'low' : null;
    if (felt && felt !== this.presence)
      out.push({ event: 'combat.presence_felt', fields: { presence: felt } });
    this.presence = felt;
    this.hostiles = next;
    this.voices = [...voices].sort();
  }

  /** Footsteps by distance walked: about three steps a second at any speed (contact frames). */
  private footsteps(
    map: MapDef,
    entry: AtlasMapDef | undefined,
    travelled: (id: string) => number,
    out: AudioTrigger[],
  ): void {
    const player = this.view.player();
    if (!player) return;
    const dungeon = entry?.role === 'dungeon' || !!map.indoor;
    const seen = new Set<string>();
    for (const e of this.view.entitiesOnMap(map.id)) {
      if (!e.alive || e.hidden) continue;
      if (e.kind !== 'player' && e.kind !== 'npc' && e.kind !== 'companion') continue;
      if (Math.hypot(e.x - player.x, e.y - player.y) > FOOTSTEP_RANGE_M) continue;
      seen.add(e.id);
      const dist = travelled(e.id);
      const prev = this.steps.get(e.id);
      if (prev === undefined || dist < prev) {
        this.steps.set(e.id, dist);
        continue;
      }
      const stride = Math.max(0.6, Math.min(1.5, (e.speed || 2) * 0.33));
      if (dist - prev < stride) continue;
      this.steps.set(e.id, dist);
      const surface = surfaceOf(
        tileAt(map, Math.floor(e.x), Math.floor(e.y)),
        dungeon,
        this.tables.selection,
      );
      if (!surface) continue;
      out.push({
        event: 'anim.footstep',
        fields: { surface, gait: (e.speed || 0) >= 3 ? 'run' : 'walk' },
        at: this.placeOf(map, e.x, e.y),
        footstepOf: e.id,
      });
    }
    for (const id of [...this.steps.keys()]) if (!seen.has(id)) this.steps.delete(id);
  }

  // -------------------------------------------------------------------------
  // Combatants (the selection fields' inputs)

  private itemOf(owner: string, slot: string): ItemDef | undefined {
    const id = (this.view.holding(owner).equipped as Record<string, string | undefined>)[slot];
    return id ? this.view.itemDef(id) : undefined;
  }

  /** One side of a blow as the client sees it (combat 8.3). */
  combatant(id: string): Combatant | null {
    const e = this.view.entity(id);
    if (!e) return null;
    const u = this.units()[id];
    const content = this.view.content;
    const classOf = (cid: string | null | undefined) =>
      cid ? (content.classes ?? []).find((c) => c.id === cid) : undefined;
    const def = this.monsterOf(id);
    const body = e.appearance?.base;
    const scale = e.appearance?.scale;
    if (def) {
      const x = def as MonsterDef & { weaponClass?: string; material?: string; voice?: string };
      return {
        isMonster: true,
        family: def.family,
        body,
        classId: def.classId ?? null,
        weaponClass: x.weaponClass ?? null,
        material: x.material ?? null,
        voice: x.voice ?? null,
        reach: def.range,
        armor: classOf(def.classId)?.armorType ?? null,
        scale,
      };
    }
    const main = this.itemOf(id, 'main_hand') as (ItemDef & { weaponClass?: string }) | undefined;
    const chest = this.itemOf(id, 'chest') as (ItemDef & { armorClass?: string }) | undefined;
    const off = this.itemOf(id, 'off_hand');
    const chestTag = (chest?.armorClass ??
      chest?.tags?.find((t) => ARMOR_TAGS.includes(t as ArmorClass))) as ArmorClass | undefined;
    const tags = main?.tags ?? [];
    return {
      isMonster: false,
      family: 'humanoid',
      body,
      classId: u?.classId ?? null,
      weaponClass: main?.weaponClass ?? tags.find(isWeaponTag) ?? null,
      twoHanded: tags.includes('two_handed'),
      armed: !!main?.weapon,
      reach: main?.weapon?.range,
      armor: chest ? (chestTag && ARMOR_TAGS.includes(chestTag) ? chestTag : 'cloth') : null,
      shield: off?.tags?.includes('shield')
        ? off.tags.includes('metal')
          ? 'metal'
          : 'wood'
        : null,
      scale,
    };
  }

  private abilityOf(id: string | undefined): AbilityDef | undefined {
    return id ? (this.view.content.abilities ?? []).find((a) => a.id === id) : undefined;
  }

  private auraOf(id: string | undefined): AuraDef | undefined {
    return id ? (this.view.content.auras ?? []).find((a) => a.id === id) : undefined;
  }

  private placeOf(
    map: MapDef,
    x: number,
    y: number,
  ): { x: number; y: number; zone: string | null } {
    return { x, y, zone: zoneAt(map, x, y, this.tables.ambience.interiors)?.id ?? null };
  }

  /**
   * Where an entity's sound comes from; null when it is not on the player's map (the world
   * runs every map, the player hears only the one they stand on).
   */
  private at(id: string | undefined): { x: number; y: number; zone: string | null } | null {
    const e = id ? this.view.entity(id) : undefined;
    const map = this.view.currentMap();
    if (!e || !map || e.mapId !== map.id) return null;
    return this.placeOf(map, e.x, e.y);
  }

  private maxHp(id: string): number {
    const u = unitView(this.view.world as never, this.view.content as never, id);
    return u?.maxHp ?? 0;
  }

  /** The voice shift of a monster (its body scale, an old one deeper). */
  private pitchOf(c: Combatant | null, id: string): number {
    if (!c?.isMonster) return 0;
    return voicePitchOf(c.scale, this.monsterOf(id)?.rank === 'rare');
  }

  // -------------------------------------------------------------------------
  // Kernel events

  events(evs: readonly AnyWorldEvent[], _nowMs: number): AudioTrigger[] {
    const out: AudioTrigger[] = [];
    const pid = this.view.playerId();
    for (const ev of evs) {
      switch (ev.kind) {
        case 'combat.damage':
          this.damage(ev.data, pid, out);
          break;
        case 'combat.cast': {
          const d = ev.data;
          const ab = this.abilityOf(d.abilityId);
          const at = this.at(d.casterId);
          if ((ab && isWeaponStrike(ab)) || !at) break;
          out.push({
            event: 'combat.cast',
            fields: {
              castOp: d.op,
              school: ab?.school ?? 'physical',
              involvesPlayer: d.casterId === pid || d.targetId === pid,
            },
            at,
          });
          break;
        }
        case 'combat.heal': {
          const d = ev.data;
          const at = this.at(d.targetId);
          if (!at) break;
          const ab = this.abilityOf(d.abilityId);
          const school = ab?.school === 'nature' ? 'nature' : 'holy';
          const max = this.maxHp(d.targetId);
          out.push({
            event: 'combat.heal',
            fields: {
              healSchool: school,
              healSize: max > 0 && d.amount >= max * 0.25 ? 'big' : 'small',
              crit: d.crit,
              involvesPlayer: d.sourceId === pid || d.targetId === pid,
            },
            at,
          });
          break;
        }
        case 'combat.aura': {
          const d = ev.data;
          const at = this.at(d.targetId);
          if (!at) break;
          const a = this.auraOf(d.auraId);
          const cc = a?.cc === 'incapacitate' ? 'stun' : a?.cc;
          const control = cc ?? (a?.slow ? 'slow' : undefined);
          const fields: Record<string, CueValue | undefined> = {
            auraOp: d.op,
            involvesPlayer: d.targetId === pid,
          };
          if (control) fields.control = control;
          out.push({ event: 'combat.aura', fields, at });
          break;
        }
        case 'combat.kill': {
          const d = ev.data;
          if (this.boss?.id === d.victimId) this.endBoss(true);
          const at = this.at(d.victimId);
          if (!at) break;
          const c = this.combatant(d.victimId);
          const isMonster = !!d.monsterId || !!c?.isMonster;
          const fields: Record<string, CueValue | undefined> = { isMonster };
          const voice = voiceOf(c, this.tables.selection);
          if (voice) fields.voice = voice;
          const fam = d.family ?? c?.family;
          fields.dissolves = fam === 'elemental' || fam === 'construct' || fam === 'undead';
          out.push({ event: 'combat.kill', fields, at, pitch: this.pitchOf(c, d.victimId) });
          break;
        }
        case 'entity.died': {
          const d = ev.data;
          if (d.id === pid) this.endBoss(false);
          const map = this.view.currentMap();
          if (d.id !== pid && (!map || d.mapId !== map.id)) break;
          const c = this.combatant(d.id);
          const heavy = (c?.scale ?? 1) >= 1.3;
          const armored = c?.armor === 'mail' || c?.armor === 'plate';
          out.push({
            event: 'entity.died',
            fields: {
              isPlayer: d.id === pid,
              isCompanion: d.kind === 'companion',
              isMonster: d.kind === 'monster',
              fall: heavy ? 'heavy' : armored ? 'armored' : 'light',
            },
            ...(d.id === pid || !map ? {} : { at: this.placeOf(map, d.x, d.y) }),
          });
          break;
        }
        case 'combat.player_returned':
          this.endBoss(false);
          break;
        case 'combat.revived': {
          const at = this.at(ev.data.entityId);
          if (at) out.push({ event: 'combat.revived', fields: {}, at });
          break;
        }
        case 'combat.boss_phase':
          this.phases.set(ev.data.entityId, ev.data.phase);
          if (this.boss?.id === ev.data.entityId) this.boss.phase = ev.data.phase;
          break;
        case 'combat.boss_defeated':
          if (this.boss?.id === ev.data.entityId) this.endBoss(true);
          this.phases.delete(ev.data.entityId);
          break;
        case 'combat.wave_spawned':
          this.waves.set(ev.data.waveId, ev.data.mapId);
          break;
        case 'combat.wave_cleared':
          this.waves.delete(ev.data.waveId);
          break;
        case 'door.opened': {
          const delta = ev.data.sealDelta;
          const seal = sealStepOf(delta);
          const fields: Record<string, CueValue | undefined> = {
            door: delta >= 2 ? 'major' : 'minor',
          };
          if (seal) fields.seal = seal;
          const rumble: RumbleEvent | undefined =
            delta >= 4 ? 'seal_loosen_major' : delta >= 2 ? 'major_door' : undefined;
          out.push({ event: 'door.opened', fields, ...(rumble ? { rumble } : {}) });
          break;
        }
        case 'time.skipped':
          this.timeSkipped = true;
          out.push({ event: ev.kind, fields: {} });
          break;
        case 'player.level_up':
        case 'quest.completed':
        case 'quest.started':
        case 'quest.progress':
        case 'quest.failed':
        case 'party.joined':
        case 'deed.granted':
        case 'title.granted':
          out.push({ event: ev.kind, fields: {} });
          break;
        default:
          break;
      }
    }
    return out;
  }

  private damage(
    d: {
      sourceId: string;
      targetId: string;
      abilityId?: string;
      amount: number;
      school: string;
      outcome: string;
    } & Record<string, unknown>,
    pid: string,
    out: AudioTrigger[],
  ): void {
    const aura = this.auraOf(d.abilityId);
    const tick = !!aura && !this.abilityOf(d.abilityId);
    const involvesPlayer = d.sourceId === pid || d.targetId === pid;
    const at = this.at(d.targetId);
    if (!at) return;
    if (tick) {
      const fields: Record<string, CueValue | undefined> = {
        tick: true,
        outcome: d.outcome,
        school: d.school,
        attack: 'spell',
        involvesPlayer,
      };
      const dot = dotOf(aura?.periodic?.school ?? d.school);
      if (dot) fields.dot = dot;
      out.push({ event: 'combat.damage', fields, at, targetId: d.targetId });
      return;
    }
    const ab = this.abilityOf(d.abilityId);
    const source = this.combatant(d.sourceId);
    const target = this.combatant(d.targetId);
    const sel = selectHit(
      {
        abilityId: d.abilityId,
        school: d.school,
        outcome: d.outcome,
        weaponClass: d.weaponClass as string | undefined,
        damageKind: d.damageKind as string | undefined,
        material: d.material as string | undefined,
        heavy: d.heavy as boolean | undefined,
        ranged: d.ranged as boolean | undefined,
      },
      source,
      target,
      ab
        ? {
            weaponStrike: isWeaponStrike(ab),
            heavy: (ab as AbilityDef & { heavy?: boolean }).heavy,
          }
        : null,
      this.tables.selection,
    );
    const fields: Record<string, CueValue | undefined> = {
      ...hitCueFields(sel, { twoHanded: source?.twoHanded, targetShield: target?.shield ?? null }),
      outcome: d.outcome,
      school: d.school,
      tick: false,
      involvesPlayer,
      isMonster: !!source?.isMonster,
    };
    let delayMs = 0;
    if (sel.weaponClass !== 'none') {
      const voice = voiceOf(source, this.tables.selection);
      const from = this.at(d.sourceId);
      if (from) {
        out.push({
          event: 'anim.swing',
          fields: { ...fields, ...(voice ? { voice } : {}) },
          at: from,
          pitch: this.pitchOf(source, d.sourceId),
        });
        delayMs = this.swingLead;
      }
    }
    let rumble: RumbleEvent | undefined;
    if (d.sourceId === pid && d.outcome === 'crit') rumble = 'crit_dealt';
    if (d.targetId === pid && d.amount > 0) {
      const max = d.outcome === 'crit' ? 0 : this.maxHp(pid);
      if (d.outcome === 'crit' || (max > 0 && d.amount >= max * HEAVY_HIT_SHARE))
        rumble = 'heavy_hit_taken';
    }
    out.push({
      event: 'combat.damage',
      fields,
      at,
      targetId: d.targetId,
      delayMs,
      ...(rumble ? { rumble } : {}),
    });
  }
}

/** A weapon strike: a damage effect that adds a weapon swing. */
export function isWeaponStrike(ab: Pick<AbilityDef, 'effects'>): boolean {
  return ab.effects.some((e) => e.type === 'damage' && (e.weapon ?? 0) > 0);
}
