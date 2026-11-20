// The CG layer (cg_and_video.md 6): a `cg` stage directive plays its video over the cutscene,
// under the subtitles, from its start to its end; the scene's lines, choices and audio carry
// on as written. Without the video (not adopted, a release build, a failed load) nothing
// shows and the stage plays as it would anyway: the in-game staging is the floor, the video
// only replaces the picture. The video is silent (the scene's music and sounds play).
//
// Pure part: `cgShown` decides which CG the stage asks for, `cgPhase` where its playback is.
// Thin painter: `CgLayer` owns the video element, which story_wiring.ts puts first inside the
// cutscene player; the video's own `ended` event (not the wall clock) starts the hold and fade.

import './cg_layer.css';
import { el, setClass } from '../../../shared_ui/dom';
import { DEV_ASSET_BASE } from '../../assets/loader';

export interface CgEntry {
  /** paths under assets/ */
  video: string;
  poster: string;
  seconds: number;
}

export type CgIndex = Readonly<Record<string, CgEntry>>;

/** After its last frame the video holds this long, then fades into the stage below. */
export const CG_HOLD_MS = 400;
export const CG_FADE_MS = 600;
/** A video that never reports its end is let go this long after its length (slow loads). */
export const CG_SLACK_MS = 6000;

export interface CgShown {
  id: string;
  /** one playback: the same id started again plays again */
  key: string;
  video: string;
  poster: string;
  /** the latest time it may still be on screen if the video never ends by itself */
  deadline: number;
}

/** The CG the stage asks for, given the adopted videos and this session's failed loads. */
export function cgShown(
  cg: { id: string; start: number } | null,
  index: CgIndex,
  failed: ReadonlySet<string>,
  base = DEV_ASSET_BASE,
): CgShown | null {
  if (!cg) return null;
  const e = index[cg.id];
  if (!e || failed.has(cg.id)) return null;
  return {
    id: cg.id,
    key: `${cg.id}@${cg.start}`,
    video: `${base}${e.video}`,
    poster: `${base}${e.poster}`,
    deadline: cg.start + e.seconds * 1000 + CG_SLACK_MS,
  };
}

export type CgPhase = 'playing' | 'holding' | 'fading' | 'done';

/** Where one playback is, from when its video ended (null: still playing) and the clock. */
export function cgPhase(endedAt: number | null, now: number, deadline: number): CgPhase {
  const end = endedAt ?? (now >= deadline ? deadline : null);
  if (end === null) return 'playing';
  if (now < end + CG_HOLD_MS) return 'holding';
  if (now < end + CG_HOLD_MS + CG_FADE_MS) return 'fading';
  return 'done';
}

/** A play() refusal that means the file cannot play (an interrupted play() is not one). */
export function playFailed(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name !== 'AbortError';
}

/** Adopted CGs (tools/cg_gen adopt writes the index); development builds only for now. */
export async function loadCgIndex(dev: boolean, fetchFn: typeof fetch = fetch): Promise<CgIndex> {
  if (!dev) return {};
  try {
    const res = await fetchFn(`${DEV_ASSET_BASE}cg/media/index.json`);
    if (!res.ok) return {};
    return (await res.json()) as CgIndex;
  } catch {
    return {};
  }
}

export class CgLayer {
  readonly el: HTMLElement;
  private readonly video: HTMLVideoElement;
  private key: string | null = null;
  private id: string | null = null;
  private endedAt: number | null = null;
  private phase: CgPhase | null = null;
  private held = false;
  /** ids whose video failed to load this session (the stage plays without them) */
  readonly failed = new Set<string>();

  constructor(private readonly clock: () => number = () => performance.now()) {
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.className = 'hk-cg-video';
    this.el = el('div', { className: 'hk-cg', attrs: { 'aria-hidden': 'true' } }, [this.video]);
    this.el.style.transitionDuration = `${CG_FADE_MS}ms`;
    this.el.hidden = true;
    this.video.addEventListener('ended', () => {
      if (this.key && this.endedAt === null) this.endedAt = this.clock();
    });
    this.video.addEventListener('error', () => this.fail());
  }

  private fail(): void {
    if (this.id) this.failed.add(this.id);
  }

  private play(): void {
    const key = this.key;
    void this.video.play()?.catch((err: unknown) => {
      // only the playback that asked counts, and an interrupted play() is no failure
      if (key === this.key && playFailed(err)) this.fail();
    });
  }

  /**
   * Paint one frame. `cut` is the cutscene player's root: while the video is up it hides the
   * player's still, door card and fades (`hk-cg-on`), and gives them back once it starts to
   * fade. `held` pauses the video with the game.
   */
  paint(shown: CgShown | null, cut: HTMLElement, now: number, held = false): void {
    const key = shown?.key ?? null;
    if (key !== this.key) {
      this.key = key;
      this.id = shown?.id ?? null;
      this.endedAt = null;
      this.held = false;
      if (shown) {
        this.video.poster = shown.poster;
        this.video.src = shown.video;
        this.video.currentTime = 0;
        this.play();
      } else {
        this.unload();
      }
    }
    if (shown && this.id && this.failed.has(this.id)) shown = null;
    const phase = shown ? cgPhase(this.endedAt, now, shown.deadline) : null;
    if (shown && held !== this.held && phase === 'playing') {
      this.held = held;
      if (held) this.video.pause();
      else this.play();
    }
    const visible = phase !== null && phase !== 'done';
    if (phase !== this.phase) {
      this.phase = phase;
      this.el.hidden = !visible;
      setClass(this.el, 'ending', phase === 'fading');
      setClass(cut, 'hk-cg-on', phase === 'playing' || phase === 'holding');
      if (phase === 'done') this.unload();
    }
  }

  private unload(): void {
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }

  /** Stop and let go of the video (the session closes). */
  dispose(): void {
    this.key = null;
    this.id = null;
    this.unload();
    this.el.remove();
  }
}
