// The CG layer (cg_and_video.md 6): a `cg` directive shows its adopted video until the video
// itself ends, holds the last frame, then fades into the stage; without the video nothing
// shows, so the stage plays as written (the in-game floor). Skipping and reduced flashing
// never start one.

import { describe, expect, it } from 'vitest';
import {
  CG_FADE_MS,
  CG_HOLD_MS,
  CG_SLACK_MS,
  cgPhase,
  cgShown,
  loadCgIndex,
  playFailed,
} from '../src/client/hud/story/cg_layer';
import { applyStage, emptyStage, enterNode } from '../src/client/hud/story/stage';

const index = {
  cg_p_door_b: {
    video: 'cg/media/cg_p_door_b.mp4',
    poster: 'cg/media/cg_p_door_b.png',
    seconds: 9,
  },
};

describe('cg stage directive', () => {
  it('starts with the node, stays across nodes and ends on cg_end', () => {
    let s = enterNode(emptyStage(), [{ op: 'cg', id: 'cg_p_door_b' }], 1000, false).state;
    expect(s.cg).toEqual({ id: 'cg_p_door_b', start: 1000 });
    s = enterNode(s, [{ op: 'caption', text: 'next' }], 2000, false).state;
    expect(s.cg).toEqual({ id: 'cg_p_door_b', start: 1000 });
    s = applyStage(s, [{ op: 'cg_end' }], 3000, false).state;
    expect(s.cg).toBeNull();
  });

  it('starts none while skipping or under reduced flashing, and skipping stops a running one', () => {
    expect(
      enterNode(emptyStage(), [{ op: 'cg', id: 'cg_p_door_b' }], 1000, true).state.cg,
    ).toBeNull();
    const running = enterNode(emptyStage(), [{ op: 'cg', id: 'cg_p_door_b' }], 1000, false).state;
    expect(enterNode(running, [{ op: 'caption', text: 'x' }], 2000, true).state.cg).toBeNull();
  });
});

describe('cgShown', () => {
  const cg = { id: 'cg_p_door_b', start: 1000 };

  it('shows the adopted video from the asset base, with a deadline past its length', () => {
    expect(cgShown(cg, index, new Set())).toEqual({
      id: 'cg_p_door_b',
      key: 'cg_p_door_b@1000',
      video: '/assets/cg/media/cg_p_door_b.mp4',
      poster: '/assets/cg/media/cg_p_door_b.png',
      deadline: 1000 + 9000 + CG_SLACK_MS,
    });
  });

  it('shows nothing without an adopted video or after a failed load (the stage plays)', () => {
    expect(cgShown({ id: 'cg_other', start: 0 }, index, new Set())).toBeNull();
    expect(cgShown(cg, index, new Set(['cg_p_door_b']))).toBeNull();
    expect(cgShown(null, index, new Set())).toBeNull();
  });

  it('keys each playback by its start, so the same id started again is a new playback', () => {
    const a = cgShown(cg, index, new Set());
    const b = cgShown({ ...cg, start: 5000 }, index, new Set());
    expect(a?.key).not.toBe(b?.key);
  });
});

describe('cgPhase', () => {
  it('plays until the video ends, holds, fades, then is done', () => {
    const deadline = 100_000;
    expect(cgPhase(null, 5000, deadline)).toBe('playing');
    expect(cgPhase(9000, 9000 + CG_HOLD_MS - 1, deadline)).toBe('holding');
    expect(cgPhase(9000, 9000 + CG_HOLD_MS, deadline)).toBe('fading');
    expect(cgPhase(9000, 9000 + CG_HOLD_MS + CG_FADE_MS, deadline)).toBe('done');
  });

  it('lets a video that never reports its end go at the deadline', () => {
    expect(cgPhase(null, 20_000 - 1, 20_000)).toBe('playing');
    expect(cgPhase(null, 20_000, 20_000)).toBe('holding');
    expect(cgPhase(null, 20_000 + CG_HOLD_MS + CG_FADE_MS, 20_000)).toBe('done');
  });
});

describe('playFailed', () => {
  it('counts a refused or unsupported play, not an interrupted one', () => {
    expect(playFailed({ name: 'AbortError' })).toBe(false);
    expect(playFailed({ name: 'NotAllowedError' })).toBe(true);
    expect(playFailed({ name: 'NotSupportedError' })).toBe(true);
  });
});

describe('loadCgIndex', () => {
  it('reads the adopted index in development and nothing in release', async () => {
    const fetchFn = (async (url: string) => {
      expect(url).toBe('/assets/cg/media/index.json');
      return new Response(JSON.stringify(index), { status: 200 });
    }) as typeof fetch;
    expect(await loadCgIndex(true, fetchFn)).toEqual(index);
    expect(await loadCgIndex(false, fetchFn)).toEqual({});
  });

  it('treats a missing index or a network failure as no CGs', async () => {
    const missing = (async () => new Response('', { status: 404 })) as typeof fetch;
    const broken = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    expect(await loadCgIndex(true, missing)).toEqual({});
    expect(await loadCgIndex(true, broken)).toEqual({});
  });
});
