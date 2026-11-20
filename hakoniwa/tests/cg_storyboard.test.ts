import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  keyframeOrder,
  keyframesNeeded,
  MAX_FREE_SEGMENTS,
  placeSegments,
  refFile,
  SEGMENT_FRAMES,
  type Storyboard,
  segmentPlan,
  shotSeconds,
  stableSeed,
  staleClosure,
  storyboardProblems,
} from '../tools/cg_gen/storyboard';

const DIR = join(__dirname, '../assets/cg/storyboards');
const ROOT = join(__dirname, '..');

const STYLES = JSON.parse(readFileSync(join(ROOT, 'assets/prompts/templates.json'), 'utf8'))
  .styles as Record<string, unknown>;

/**
 * The runner's lookups (tools/cg_gen/run.ts loadBoard). Original art and processed audio stay on
 * the machine that generates (they are not in the repository, U-35), so a checkout without
 * them checks everything else; where they are present every reference is checked.
 */
const HAS_ART = existsSync(join(ROOT, 'assets/art/characters/ref'));
const HAS_AUDIO = existsSync(join(ROOT, 'assets/processed/audio/music'));
const lookups = {
  refExists: (ref: string) =>
    ref.startsWith('audio:')
      ? !HAS_AUDIO ||
        ['music', 'ambience', 'sfx'].some((d) =>
          existsSync(join(ROOT, `assets/processed/audio/${d}/${ref.slice(6)}.json`)),
        )
      : !HAS_ART || existsSync(refFile(ROOT, ref)),
  styleExists: (s: string) => s in STYLES,
};

function board(over: Partial<Storyboard> = {}): Storyboard {
  return {
    id: 'b',
    title: 't',
    seed: 1,
    size: [512, 288],
    keyframeSize: [1024, 576],
    shots: [
      {
        id: 's01_a',
        style: 'earth_modern',
        segments: 2,
        cut: true,
        keyframes: { '0': { prompt: 'a' }, '2': { prompt: 'b', edit: 's01_a@0' } },
        motion: ['m0', 'm1'],
      },
      {
        id: 's02_b',
        style: 'earth_modern',
        segments: 2,
        cut: false,
        keyframes: { '2': { prompt: 'c' } },
        motion: ['m0', 'm1'],
      },
    ],
    ...over,
  };
}

describe('CG storyboard plan', () => {
  it('chains every segment from the one before, except a cut, and anchors on keyframes', () => {
    const plan = segmentPlan(board());
    expect(plan.map((p) => [p.key, p.first.kind, p.first.key, p.last])).toEqual([
      ['s01_a#0', 'keyframe', 's01_a@0', null],
      ['s01_a#1', 'segment', 's01_a#0', 's01_a@2'],
      ['s02_b#0', 'segment', 's01_a#1', null],
      ['s02_b#1', 'segment', 's02_b#0', 's02_b@2'],
    ]);
  });

  it('counts a continuing segment one frame short (its first frame is the last one shown)', () => {
    // 4 segments, 3 of them continuing
    expect(shotSeconds(board()) * 24).toBe(SEGMENT_FRAMES * 4 - 3);
    expect(shotSeconds(board(), ['s01_a']) * 24).toBe(SEGMENT_FRAMES * 2 - 1);
  });

  it('draws an edited keyframe after the one it edits', () => {
    const b = board();
    b.shots[0].keyframes = { '0': { prompt: 'a', edit: 's01_a@2' }, '2': { prompt: 'b' } };
    expect(keyframeOrder(b)).toEqual(['s01_a@2', 's01_a@0', 's02_b@2']);
  });

  it('keeps a segment seed when shots are added in front of it', () => {
    const a = segmentPlan(board()).find((p) => p.key === 's02_b#1')?.seed;
    const b2 = board();
    b2.shots.unshift({ ...b2.shots[0], id: 's00_new' });
    expect(segmentPlan(b2).find((p) => p.key === 's02_b#1')?.seed).toBe(a);
    expect(a).toBe(stableSeed(1, 's02_b#1'));
  });
});

describe('CG redo and joins', () => {
  it('makes everything downstream of a redone keyframe stale, edits included', () => {
    const b = board();
    // s01_a@2 edits s01_a@0; s01_a#1 ends on s01_a@2; s02_b continues from s01_a#1
    const stale = staleClosure(b, ['s01_a@0']);
    expect([...stale.keyframes].sort()).toEqual(['s01_a@0', 's01_a@2']);
    expect([...stale.segments]).toEqual(['s01_a#0', 's01_a#1', 's02_b#0', 's02_b#1']);
  });

  it('makes a redone segment and only what follows it stale', () => {
    const stale = staleClosure(board(), ['s02_b#0']);
    expect([...stale.keyframes]).toEqual([]);
    expect([...stale.segments]).toEqual(['s02_b#0', 's02_b#1']);
  });

  it('draws the keyframes a cut edits even when they lie outside it, at any depth', () => {
    const b = board();
    b.shots[1].keyframes['2'] = { prompt: 'c', edit: 's01_a@2' };
    expect([...keyframesNeeded(b, new Set(['s02_b']))].sort()).toEqual([
      's01_a@0',
      's01_a@2',
      's02_b@2',
    ]);
  });

  it('places a run that starts mid-film with its first segment whole', () => {
    const placed = placeSegments(board(), ['s02_b']);
    expect(placed.map((p) => [p.key, p.start, p.frames, p.drops])).toEqual([
      ['s02_b#0', 0, SEGMENT_FRAMES, false],
      ['s02_b#1', SEGMENT_FRAMES, SEGMENT_FRAMES - 1, true],
    ]);
  });
});

describe('CG storyboard checks', () => {
  it('accepts a sound board', () => {
    expect(storyboardProblems(board())).toEqual([]);
  });

  it('rejects a chain that runs too long without an anchor', () => {
    const b = board();
    b.shots[1].segments = MAX_FREE_SEGMENTS + 1;
    b.shots[1].keyframes = {};
    b.shots[1].motion = Array.from({ length: MAX_FREE_SEGMENTS + 1 }, () => 'm');
    expect(storyboardProblems(b).join('\n')).toMatch(/without an anchor/);
  });

  it('rejects a continuing first shot, a cut without its keyframe and a cycle of edits', () => {
    const b = board();
    b.shots[0].cut = false;
    expect(storyboardProblems(b).join('\n')).toMatch(/first shot must be a cut/);
    const c = board();
    c.shots[1].cut = true;
    expect(storyboardProblems(c).join('\n')).toMatch(/a cut needs keyframe 0/);
    const d = board();
    d.shots[0].keyframes['0'].edit = 's01_a@2';
    expect(storyboardProblems(d).join('\n')).toMatch(/edit cycle/);
  });

  it('rejects mismatched motion, missing references and forbidden characters', () => {
    const b = board();
    b.shots[0].motion = ['m0'];
    b.shots[0].keyframes['0'].refs = ['art_chr_nobody_ref'];
    b.shots[0].captions = [{ seg: 0, text: `a${String.fromCharCode(0x2014)}b` }];
    const text = storyboardProblems(b, { refExists: () => false }).join('\n');
    expect(text).toMatch(/1 motion prompts for 2 segments/);
    expect(text).toMatch(/reference art_chr_nobody_ref is missing/);
    expect(text).toMatch(/caption has a forbidden character/);
  });

  it('counts free segments across a continuing shot', () => {
    const b = board();
    b.shots[0].keyframes = { '0': { prompt: 'a' } };
    b.shots[1].keyframes = {};
    // 2 free segments, then 2 more in the continuing shot: 4 in a row
    expect(storyboardProblems(b).join('\n')).toMatch(/without an anchor/);
  });

  it('rejects keyframe keys that are not plain boundaries, image edits and odd captions', () => {
    const b = board();
    b.shots[0].keyframes['01'] = { prompt: 'x' };
    b.shots[0].keyframes['2'] = { prompt: 'b', edit: 's01_a@0', image: 'art/x.png' };
    b.shots[0].captions = [{ seg: 0.5, text: 'x' }];
    const text = storyboardProblems(b).join('\n');
    expect(text).toMatch(/keyframe 01: off the shot/);
    expect(text).toMatch(/an image keyframe cannot also edit/);
    expect(text).toMatch(/caption outside the shot/);
  });

  it('rejects unknown styles and missing music or ambience, but takes the empty style', () => {
    const b = board();
    b.shots[0].style = 'nowhere';
    b.shots[1].style = 'void';
    b.shots[0].music = { id: 'mus_none' };
    b.shots[1].ambience = 'amb_none';
    const text = storyboardProblems(b, {
      refExists: (r) => !r.startsWith('audio:'),
      styleExists: (s) => s === 'earth_modern',
    }).join('\n');
    expect(text).toMatch(/unknown style nowhere/);
    expect(text).not.toMatch(/unknown style void/);
    expect(text).toMatch(/music mus_none is missing/);
    expect(text).toMatch(/ambience amb_none is missing/);
  });

  it('rejects empty and duplicate cuts', () => {
    const b = board({
      cgs: [
        { id: 'cg_x', shots: [] },
        { id: 'cg_y', shots: ['s01_a'] },
        { id: 'cg_y', shots: ['s01_a'] },
      ],
    });
    const text = storyboardProblems(b).join('\n');
    expect(text).toMatch(/cg cg_x: no shots/);
    expect(text).toMatch(/cg cg_y: duplicate id/);
  });

  it('rejects an in-game CG that skips shots or opens mid-chain', () => {
    const b = board({ cgs: [{ id: 'cg_x', shots: ['s02_b'] }] });
    expect(storyboardProblems(b).join('\n')).toMatch(/does not open on a cut/);
    const c = board({ cgs: [{ id: 'cg_y', shots: ['s02_b', 's01_a'] }] });
    expect(storyboardProblems(c).join('\n')).toMatch(/not consecutive/);
  });
});

describe('checked-in storyboards', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
  it('has at least one board', () => {
    expect(files.length).toBeGreaterThan(0);
  });
  for (const f of files) {
    it(`${f} renders as written`, () => {
      const b = JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Storyboard;
      expect(storyboardProblems(b, lookups)).toEqual([]);
      expect(`${b.id}.json`).toBe(f);
    });
  }
});

describe('CGs in the scenes (cg_and_video.md 3 and 6; onboarding budget B8)', () => {
  const boards = readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Storyboard);
  const cgSeconds = new Map<string, number>();
  for (const b of boards) for (const c of b.cgs ?? []) cgSeconds.set(c.id, shotSeconds(b, c.shots));
  /** every `cg` directive of a scene file, by the scene that uses it */
  function cgUses(file: string): { scene: string; id: string }[] {
    const data = JSON.parse(readFileSync(join(ROOT, 'data/scenes', file), 'utf8')) as unknown;
    // scene files are arrays of scenes; maps, speakers and the other tables are skipped
    if (!Array.isArray(data)) return [];
    const scenes = (
      data as { id: string; nodes?: { stage?: { op: string; id?: string }[] }[] }[]
    ).filter((s) => Array.isArray(s.nodes));
    return scenes.flatMap((s) =>
      (s.nodes ?? []).flatMap((n) =>
        (n.stage ?? [])
          .filter((d) => d.op === 'cg')
          .map((d) => ({ scene: s.id, id: String(d.id) })),
      ),
    );
  }
  const files = readdirSync(join(ROOT, 'data/scenes')).filter((f) => f.endsWith('.json'));
  const uses = files.flatMap((f) => cgUses(f));

  it('uses only CGs a storyboard defines', () => {
    expect(uses.filter((u) => !cgSeconds.has(u.id))).toEqual([]);
  });

  it('keeps every CG on the way through the onboarding within 20 seconds and 60 in all', () => {
    const onboarding = new Set(
      uses
        .filter((u) => u.scene.startsWith('cut_p_') || u.scene.startsWith('cut_a1_'))
        .map((u) => u.id),
    );
    expect(onboarding.size).toBeGreaterThan(0);
    let total = 0;
    for (const id of onboarding) {
      const secs = cgSeconds.get(id) ?? 0;
      expect(secs, id).toBeLessThanOrEqual(20);
      total += secs;
    }
    expect(total).toBeLessThanOrEqual(60);
  });
});
