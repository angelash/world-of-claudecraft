import { describe, expect, it } from 'vitest';
import { applyStage, emptyStage, enterNode } from '../src/client/hud/story/stage';
import { StageTimeline } from '../src/client/hud/story/stage_timeline';

describe('reading stage timeline', () => {
  it('releases entry cues, ordered line cues and trailing cues only once', () => {
    const time = new StageTimeline();
    expect(
      time.begin([
        { op: 'sfx', id: 'entry' },
        { op: 'caption', text: 'last', at: 3 },
        { op: 'caption', text: 'first', at: 1 },
        { op: 'caption', text: 'first_again', at: 1 },
        { op: 'sfx', id: 'zero', at: 0 },
      ]),
    ).toEqual([
      { op: 'sfx', id: 'entry' },
      { op: 'sfx', id: 'zero' },
    ]);
    expect(time.take(0, false)).toEqual([]);
    expect(time.take(1, false)).toEqual([
      { op: 'caption', text: 'first' },
      { op: 'caption', text: 'first_again' },
    ]);
    expect(time.take(1, false)).toEqual([]);
    expect(time.take(2, true)).toEqual([{ op: 'caption', text: 'last' }]);
    expect(time.take(2, true)).toEqual([]);
    // A node change discards every pending cue of the earlier node.
    time.begin([{ op: 'sfx', id: 'old', at: 9 }]);
    time.begin([]);
    expect(time.take(9, true)).toEqual([]);
  });

  it('incremental cues retain captions, and a still and transition survive a node boundary', () => {
    let s = enterNode(
      emptyStage(),
      [
        { op: 'caption', text: 'first' },
        { op: 'still', id: 'art_bg_cut_test' },
        { op: 'transition', kind: 'dissolve' },
      ],
      0,
      false,
    ).state;
    s = applyStage(s, [{ op: 'caption', text: 'next' }], 1, false).state;
    expect(s.captions).toEqual(['first', 'next']);
    s = enterNode(s, [], 2, false).state;
    expect(s.captions).toEqual([]);
    expect(s.still).toBe('art_bg_cut_test');
    expect(s.transition?.kind).toBe('dissolve');
    expect(enterNode(s, [], 10_000, false).state.transition).toBeNull();
    s = applyStage(s, [{ op: 'still_end' }, { op: 'transition', kind: 'cut' }], 3, false).state;
    expect(s.still).toBeNull();
    expect(s.transition).toBeNull();
  });
});
