// The stage of `ui_mode_cutscene` (ux_and_onboarding.md 8; catalog_cutscenes.md 2.7, 13.5):
// what the node's stage directives leave standing (busts left and right, the caption layer,
// a fade, the letter step, the music playing and a written silence) and the calls the player
// makes when a node is entered. The player never touches the audio engine: it calls a thin
// `CutsceneAudio` sink (no-op until the audio engine, PK-M1-06, installs one), and
// `cutsceneDirectorInput` gives the audio director its `cutscene` input. Camera, light,
// weather, mirror and motion directives are not in the list yet (no camera director; they
// degrade to holding the current picture, 13.5). The prologue's staging directives (PK-M1-54)
// leave two things standing: the eavesdropping (`listen`, `noise`, `listen_end`, P5) and the
// door that reappears at every corner (`door`, `door_end`, P2); prologue_stage.ts reads them
// against the world's flags. Pure; Node-tested.

import type { StageDirective } from '../../../systems/scenes/types';

/** A written silence presses music and ambience to this level (13.5). */
export const SILENCE_DB = -24;
/** Music enters over this many milliseconds by default (2.7: two-second crossfade). */
export const MUSIC_CROSS_MS = 2000;

/** The thin audio seam of the cutscene player (PK-M1-06 implements it). */
export interface CutsceneAudio {
  music(call: { id: string; mode: 'in' | 'out' | 'cross' | 'layer'; layer: number }): void;
  sfx(id: string): void;
  ambience(id: string): void;
  /** press music and ambience to `db` for `seconds` (a written silence) */
  silence(seconds: number, db: number): void;
  /** the cutscene ended: hand the music back to the director */
  release(): void;
}

export const SILENT_AUDIO: CutsceneAudio = {
  music: () => {},
  sfx: () => {},
  ambience: () => {},
  silence: () => {},
  release: () => {},
};

export type AudioCall =
  | { op: 'music'; id: string; mode: 'in' | 'out' | 'cross' | 'layer'; layer: number }
  | { op: 'sfx'; id: string }
  | { op: 'ambience'; id: string }
  | { op: 'silence'; seconds: number; db: number };

export interface StageBust {
  who: string;
  expression: string;
  side: 'left' | 'right';
}

export interface StageState {
  busts: StageBust[];
  /** caption texts of the current node (content strings) */
  captions: string[];
  /** a fade cover; reduce flashing turns a white one into a soft brightening (13.8) */
  fade: { to: 'black' | 'white' | 'soft'; until: number } | null;
  /** the `ltr_` letter waiting to be read as a step */
  letter: string | null;
  /** the music the cutscene asked for (null: none, or faded out) */
  music: string | null;
  /** how many of its layers start open (from L1, 2.7) */
  layers: number;
  /** a written silence lasts until this time (real ms) */
  silenceUntil: number;
  /** a shake to play once (0: none) */
  shake: number;
  /** eavesdropping (P5): the level flag and how many noises lowered the tier since */
  listen: { flag: string; noises: number } | null;
  /** the recurring door (P2): its counter flag, the cap, and whether it opened */
  door: { flag: string; cap: number; open: boolean } | null;
}

export function emptyStage(): StageState {
  return {
    busts: [],
    captions: [],
    fade: null,
    letter: null,
    music: null,
    layers: 1,
    silenceUntil: 0,
    shake: 0,
    listen: null,
    door: null,
  };
}

/** At most this many busts stand at once (ux 7.1: the third stands in the middle). */
export const MAX_BUSTS = 3;

/**
 * Enter a node: apply its directives in order to the standing stage. Captions and the shake
 * belong to the node; busts, music, silence and a fade carry on until changed. `calm` is the
 * "reduce flashing and shaking" setting: a shake is dropped and a white flash becomes a soft
 * brightening (13.8).
 */
export function enterNode(
  prev: StageState,
  directives: readonly StageDirective[],
  now: number,
  calm: boolean,
): { state: StageState; audio: AudioCall[] } {
  const s: StageState = {
    ...prev,
    busts: [...prev.busts],
    captions: [],
    letter: null,
    shake: 0,
    fade: prev.fade && prev.fade.until > now ? prev.fade : null,
  };
  const audio: AudioCall[] = [];
  for (const d of directives) {
    switch (d.op) {
      case 'music': {
        const mode = d.mode ?? 'in';
        const layer = d.layer ?? 1;
        audio.push({ op: 'music', id: d.id, mode, layer });
        if (mode === 'out') {
          if (s.music === d.id) s.music = null;
        } else if (mode !== 'layer') {
          s.music = d.id;
          s.layers = layer;
        }
        break;
      }
      case 'sfx':
        audio.push({ op: 'sfx', id: d.id });
        break;
      case 'ambience':
        audio.push({ op: 'ambience', id: d.id });
        break;
      case 'silence': {
        const seconds = Math.max(0, d.seconds);
        audio.push({ op: 'silence', seconds, db: SILENCE_DB });
        s.silenceUntil = Math.max(s.silenceUntil, now + seconds * 1000);
        break;
      }
      case 'bust': {
        const rest = s.busts.filter((b) => b.who !== d.who && b.side !== d.side);
        rest.push({ who: d.who, expression: d.expression ?? 'neutral', side: d.side });
        s.busts = rest.slice(-MAX_BUSTS);
        break;
      }
      case 'bust_clear':
        s.busts = d.who ? s.busts.filter((b) => b.who !== d.who) : [];
        break;
      case 'fade':
        s.fade = {
          to: calm && d.to === 'white' ? 'soft' : d.to,
          until: now + Math.max(0, d.seconds) * 1000,
        };
        break;
      case 'caption':
        s.captions.push(d.text);
        break;
      case 'letter':
        s.letter = d.id;
        break;
      case 'shake':
        if (!calm) s.shake = Math.max(1, Math.min(3, d.strength));
        break;
      case 'listen':
        s.listen = { flag: d.flag, noises: 0 };
        break;
      case 'noise':
        if (s.listen) s.listen = { ...s.listen, noises: s.listen.noises + 1 };
        break;
      case 'listen_end':
        s.listen = null;
        break;
      case 'door':
        s.door = { flag: d.flag, cap: Math.max(1, d.cap), open: !!d.open };
        break;
      case 'door_end':
        s.door = null;
        break;
      default:
        break;
    }
  }
  return { state: s, audio };
}

/** Send the calls to a sink. */
export function playAudio(sink: CutsceneAudio, calls: readonly AudioCall[]): void {
  for (const c of calls) {
    if (c.op === 'music') sink.music({ id: c.id, mode: c.mode, layer: c.layer });
    else if (c.op === 'sfx') sink.sfx(c.id);
    else if (c.op === 'ambience') sink.ambience(c.id);
    else sink.silence(c.seconds, c.db);
  }
}

/**
 * The audio director's cutscene input (src/client/audio/audio_director.ts `DirectorInput`):
 * the cutscene's music and whether a written silence holds now; null outside cutscenes.
 */
export function cutsceneDirectorInput(
  playing: boolean,
  s: StageState,
  now: number,
): { music: string | null; layers: number; silence: boolean } | null {
  if (!playing) return null;
  return { music: s.music, layers: s.layers, silence: now < s.silenceUntil };
}

/** The bust standing for the line's speaker is lit; the others are dimmed (ux 7.1). */
export function litBusts(
  busts: readonly StageBust[],
  speakerId: string | null,
): (StageBust & { lit: boolean })[] {
  const anyLit = !!speakerId && busts.some((b) => b.who === speakerId);
  return busts.map((b) => ({ ...b, lit: !anyLit || b.who === speakerId }));
}
