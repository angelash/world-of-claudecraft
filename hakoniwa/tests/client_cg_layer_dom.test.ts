// @vitest-environment happy-dom

// The CG painter on a DOM (cg_and_video.md 6): it loads and plays the video once per playback,
// hides the cutscene's own picture while the video plays and gives it back as the video fades,
// pauses with the game, and lets the stage play when the file cannot play.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CG_FADE_MS, CG_HOLD_MS, CgLayer, cgShown } from '../src/client/hud/story/cg_layer';

const index = {
  cg_x: { video: 'cg/media/cg_x.mp4', poster: 'cg/media/cg_x.png', seconds: 3 },
};

let playResult: () => Promise<void>;
let plays: number;
let pauses: number;

beforeEach(() => {
  plays = 0;
  pauses = 0;
  playResult = () => Promise.resolve();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
    plays++;
    return playResult();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {
    pauses++;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setup() {
  let clock = 0;
  const layer = new CgLayer(() => clock);
  const cut = document.createElement('div');
  cut.append(layer.el);
  const video = layer.el.querySelector('video') as HTMLVideoElement;
  return {
    layer,
    cut,
    video,
    setClock: (t: number) => {
      clock = t;
    },
  };
}

describe('CgLayer', () => {
  it('plays a playback once, hides the cutscene picture, then fades into the stage', () => {
    const { layer, cut, video, setClock } = setup();
    const shown = cgShown({ id: 'cg_x', start: 0 }, index, layer.failed);
    layer.paint(shown, cut, 10);
    layer.paint(shown, cut, 20);
    expect(plays).toBe(1);
    expect(video.getAttribute('src')).toBe('/assets/cg/media/cg_x.mp4');
    expect(layer.el.hidden).toBe(false);
    expect(cut.classList.contains('hk-cg-on')).toBe(true);
    setClock(3000);
    video.dispatchEvent(new Event('ended'));
    layer.paint(shown, cut, 3000 + CG_HOLD_MS);
    expect(layer.el.classList.contains('ending')).toBe(true);
    expect(cut.classList.contains('hk-cg-on')).toBe(false);
    layer.paint(shown, cut, 3000 + CG_HOLD_MS + CG_FADE_MS);
    expect(layer.el.hidden).toBe(true);
  });

  it('plays the same id again when it starts again', () => {
    const { layer, cut } = setup();
    layer.paint(cgShown({ id: 'cg_x', start: 0 }, index, layer.failed), cut, 10);
    layer.paint(null, cut, 20);
    expect(layer.el.hidden).toBe(true);
    expect(cut.classList.contains('hk-cg-on')).toBe(false);
    layer.paint(cgShown({ id: 'cg_x', start: 5000 }, index, layer.failed), cut, 5010);
    expect(plays).toBe(2);
    expect(layer.el.hidden).toBe(false);
  });

  it('pauses with the game and plays on after', () => {
    const { layer, cut } = setup();
    const shown = cgShown({ id: 'cg_x', start: 0 }, index, layer.failed);
    layer.paint(shown, cut, 10);
    layer.paint(shown, cut, 20, true);
    expect(pauses).toBe(1);
    layer.paint(shown, cut, 30, false);
    expect(plays).toBe(2);
  });

  it('gives the screen back to the stage when the file cannot play, but not on an interrupted play', async () => {
    const { layer, cut } = setup();
    playResult = () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' }));
    layer.paint(cgShown({ id: 'cg_x', start: 0 }, index, layer.failed), cut, 10);
    await Promise.resolve();
    await Promise.resolve();
    expect(layer.failed.has('cg_x')).toBe(false);
    playResult = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotSupportedError' }));
    layer.paint(cgShown({ id: 'cg_x', start: 100 }, index, layer.failed), cut, 110);
    await Promise.resolve();
    await Promise.resolve();
    expect(layer.failed.has('cg_x')).toBe(true);
    layer.paint(cgShown({ id: 'cg_x', start: 100 }, index, layer.failed), cut, 120);
    expect(layer.el.hidden).toBe(true);
    expect(cut.classList.contains('hk-cg-on')).toBe(false);
  });

  it('lets go of the video when disposed', () => {
    const { layer, cut, video } = setup();
    layer.paint(cgShown({ id: 'cg_x', start: 0 }, index, layer.failed), cut, 10);
    layer.dispose();
    expect(video.getAttribute('src')).toBeNull();
    expect(layer.el.isConnected).toBe(false);
  });
});
