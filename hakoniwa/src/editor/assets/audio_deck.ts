// Audio playback for the asset review desk: one player per take (native controls plus a
// loop toggle), an A/B switcher that jumps between two takes at the same moment, and a
// layer mixer that plays adaptive music stems sample-locked through Web Audio with each
// layer switchable, the way the game adds and drops layers (audio_direction.md 5.2).
// DOM module; the desk owns one AudioDeck and stops it whenever the selection changes.

import { button, h } from '../shell/dom';
import { fmt, T } from '../text';

export class AudioDeck {
  private elements = new Set<HTMLAudioElement>();
  private last: HTMLAudioElement | null = null;
  private mixers = new Set<LayerMixer>();

  /** A take with native controls and a loop toggle. */
  take(url: string, loop: boolean): HTMLElement {
    const audio = h('audio', { controls: true, preload: 'none', loop, src: url });
    this.track(audio);
    const loopBtn = button(loop ? T.assets.loopOn : T.assets.loopOff, () => {
      audio.loop = !audio.loop;
      loopBtn.textContent = audio.loop ? T.assets.loopOn : T.assets.loopOff;
      loopBtn.classList.toggle('active', audio.loop);
    });
    loopBtn.classList.toggle('active', loop);
    return h('div', { class: 'asset-player' }, audio, loopBtn);
  }

  /** Two takes behind one transport: switching keeps the playback position. */
  ab(urlA: string, urlB: string, labelA: string, labelB: string): HTMLElement {
    const a = h('audio', { preload: 'auto', loop: true, src: urlA });
    const b = h('audio', { preload: 'auto', loop: true, src: urlB });
    this.track(a);
    this.track(b);
    let active = a;
    const status = h('span', {
      class: 'muted small',
      text: fmt(T.assets.abPlaying, { side: `A ${labelA}` }),
    });
    const play = button(T.assets.play, () => {
      if (active.paused) {
        this.pauseAll();
        void active.play();
        this.last = active;
        play.textContent = T.assets.pause;
      } else {
        active.pause();
        play.textContent = T.assets.play;
      }
    });
    const swap = button(T.assets.switchAb, () => {
      const other = active === a ? b : a;
      const wasPlaying = !active.paused;
      other.currentTime = active.currentTime;
      active.pause();
      active = other;
      status.textContent = fmt(T.assets.abPlaying, {
        side: active === a ? `A ${labelA}` : `B ${labelB}`,
      });
      if (wasPlaying) {
        void active.play();
        this.last = active;
      }
    });
    return h('div', { class: 'asset-ab' }, play, swap, status, a, b);
  }

  /** Stems of one take, started together and looped; each layer can be switched off. */
  layers(stems: { label: string; url: string }[]): HTMLElement {
    // Starting one mixer pauses every take and every other mixer.
    const mixer = new LayerMixer(stems, (self) => {
      for (const el of this.elements) if (!el.paused) el.pause();
      for (const m of this.mixers) if (m !== self) m.stop();
    });
    this.mixers.add(mixer);
    return mixer.element;
  }

  /** Space bar: pause or resume the take that played last. */
  toggleLast(): void {
    if (!this.last) return;
    if (this.last.paused) {
      this.pauseAll();
      void this.last.play();
    } else this.last.pause();
  }

  /** L key: loop on or off for the take that played last. */
  toggleLastLoop(): void {
    if (this.last) this.last.loop = !this.last.loop;
  }

  pauseAll(): void {
    for (const el of this.elements) if (!el.paused) el.pause();
    for (const m of this.mixers) m.stop();
  }

  /** Stop and forget everything (the selection changed). */
  reset(): void {
    this.pauseAll();
    for (const m of this.mixers) m.dispose();
    this.elements.clear();
    this.mixers.clear();
    this.last = null;
  }

  private track(el: HTMLAudioElement): void {
    this.elements.add(el);
    el.addEventListener('play', () => {
      for (const other of this.elements) if (other !== el && !other.paused) other.pause();
      for (const m of this.mixers) m.stop();
      this.last = el;
    });
  }
}

class LayerMixer {
  readonly element: HTMLElement;
  private ctx: AudioContext | null = null;
  private buffers: AudioBuffer[] | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private gains: GainNode[] = [];
  private on: boolean[];
  private playBtn: HTMLButtonElement;

  constructor(
    private readonly stems: { label: string; url: string }[],
    private readonly onStart: (mixer: LayerMixer) => void,
  ) {
    this.on = stems.map(() => true);
    this.playBtn = button(T.assets.play, () => void this.toggle());
    const toggles = stems.map((s, i) => {
      const b = button(`${s.label} ${T.assets.layerOn}`, () => {
        this.on[i] = !this.on[i];
        b.textContent = `${s.label} ${this.on[i] ? T.assets.layerOn : T.assets.layerOff}`;
        b.classList.toggle('active', this.on[i]);
        const g = this.gains[i];
        if (g && this.ctx) g.gain.setTargetAtTime(this.on[i] ? 1 : 0, this.ctx.currentTime, 0.15);
      });
      b.classList.add('active');
      return b;
    });
    this.element = h(
      'div',
      { class: 'asset-layers' },
      h('div', { class: 'sub-title', text: T.assets.layers }),
      h('div', { class: 'muted small', text: T.assets.layersHint }),
      h('div', { class: 'toolbar wrap' }, this.playBtn, ...toggles),
    );
  }

  private async toggle(): Promise<void> {
    if (this.sources.length > 0) {
      this.stop();
      return;
    }
    this.onStart(this);
    this.ctx ??= new AudioContext();
    if (!this.buffers) {
      this.playBtn.disabled = true;
      try {
        this.buffers = await Promise.all(
          this.stems.map(async (s) => {
            const bytes = await (await fetch(s.url)).arrayBuffer();
            return (this.ctx as AudioContext).decodeAudioData(bytes);
          }),
        );
      } finally {
        this.playBtn.disabled = false;
      }
    }
    const ctx = this.ctx;
    const start = ctx.currentTime + 0.08;
    this.gains = this.buffers.map((_, i) => {
      const g = ctx.createGain();
      g.gain.value = this.on[i] ? 1 : 0;
      g.connect(ctx.destination);
      return g;
    });
    this.sources = this.buffers.map((buf, i) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.gains[i] as GainNode);
      src.start(start);
      return src;
    });
    this.playBtn.textContent = T.assets.pause;
  }

  stop(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    this.sources = [];
    this.playBtn.textContent = T.assets.play;
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }
}
