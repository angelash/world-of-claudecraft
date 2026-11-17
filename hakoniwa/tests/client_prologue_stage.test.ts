// PK-M1-54 client side: the prologue's staging mechanics (P2 the door that reappears at every
// corner, P5 eavesdropping by distance into GameAudio.setListenTier, P15 the reach-out key),
// the spirit mirror (`ui_mode_creator`: its look, its model, its save round trip through the
// kernel) and the paper-doll assembler (no art: exactly the placeholder; every part approved:
// a composed frame). Pure cores against the real prologue data where a hook lives there.

import { describe, expect, it } from 'vitest';
import { composeDoll, dollAnchors, recolor } from '../src/client/assets/doll_compose';
import { AssetResolver } from '../src/client/assets/resolver';
import {
  buildFrame,
  frameKey,
  installAssets,
  resetAssets,
  type SheetPixels,
} from '../src/client/assets/runtime';
import type { AssetMeta, AssetRecord } from '../src/client/assets/types';
import {
  appearanceOf,
  CREATOR_ROWS,
  type CreatorLook,
  creatorResult,
  DEFAULT_LOOK,
  decodeLook,
  encodeLook,
  lookOf,
  randomLook,
  rowSize,
} from '../src/client/hud/creator/creator_look';
import { creatorReduce, creatorView, openCreator } from '../src/client/hud/creator/creator_model';
import { scenePanelModel } from '../src/client/hud/scene_model';
import { cutsceneModel, pickable, summaryCard } from '../src/client/hud/story/cutscene_model';
import {
  doorStage,
  keyPrompts,
  listenTier,
  muffledLine,
  promptFor,
} from '../src/client/hud/story/prologue_stage';
import { emptyStage, enterNode, type StageState } from '../src/client/hud/story/stage';
import { StoryController, type StoryInput } from '../src/client/hud/story/story_controller';
import { DEFAULT_CONTEXT_KEYMAP, keymapConflicts } from '../src/client/input/contexts';
import { DEFAULT_PAD_KEYMAP, padCoverageGaps } from '../src/client/input/pad_bindings';
import { generateFrame, spriteKey } from '../src/client/sprites/generate';
import { lookFromAppearance, paletteFor } from '../src/client/sprites/look';
import { shadeRamp } from '../src/client/sprites/palette';
import { createMatrix, getPixel, type PixelMatrix, setPixel } from '../src/client/sprites/pixels';
import { SLOT } from '../src/client/sprites/shape';
import { Engine, worldHash } from '../src/core';
import { deserializeWorld, serializeWorld } from '../src/core/save';
import { setTextLanguage, t } from '../src/shared_ui/i18n';
import {
  checkCreatorResult,
  SCENE_CHOICE_KEYS,
  type SceneView,
  sceneView,
} from '../src/systems/scenes';
import { playerEntity } from '../src/systems/world';
import { NARRATIVE_SYSTEMS, narrativeGame } from './narrative_harness';

setTextLanguage('zh-Hans');

/** A deterministic [0, 1) source for the mirror's random button. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Step the prologue with a list of picks ('+' advances). */
function play(g: Engine, picks: string[]): void {
  for (const p of picks) {
    if (p === '+') g.queue('scenes.advance', {});
    else g.queue('scenes.choose', { choiceId: p });
    g.step(1);
  }
}

function view(g: Engine): SceneView {
  const v = sceneView(g.world, g.content);
  if (!v) throw new Error('no scene');
  return v;
}

/**
 * Put the prologue run on a node of one of its seven cut_p_ scenes (PK-M1-27), waiting for an
 * advance; the next '+' enters the node's `next`.
 */
function jump(g: Engine, sceneId: string, nodeId: string): void {
  const run = g.world.slices.scenes.current;
  if (!run) throw new Error('no run');
  run.sceneId = sceneId;
  run.nodeId = nodeId;
  run.waiting = 'advance';
}

/** Walk the stage through the nodes the run passes, as the cutscene player does. */
function stageAt(prev: StageState, v: SceneView): StageState {
  return enterNode(prev, v.stage, 0, false).state;
}

// ---------------------------------------------------------------------------

describe('P2: the door that reappears at every corner', () => {
  it('follows the turn-away counter: closed, at the next corner, ajar, then open', () => {
    const s = (flag: number, open = false): ReturnType<typeof doorStage> =>
      doorStage({ ...emptyStage(), door: { flag: 'n', cap: 3, open } }, { n: flag });
    expect(s(0)?.state).toBe('closed');
    expect(s(1)?.state).toBe('corner');
    expect(s(1)?.corner).toBe(1);
    expect(s(2)?.corner).toBe(2);
    expect(s(2)?.wind).toBe(false);
    expect(s(3)?.state).toBe('ajar');
    expect(s(3)?.wind).toBe(true);
    expect(s(9)?.turns).toBe(3);
    expect(s(3, true)?.state).toBe('open');
    // the light grows every time
    const lights = [0, 1, 2, 3].map((n) => s(n)?.light ?? -1);
    expect(lights).toEqual([...lights].sort((a, b) => a - b));
    expect(new Set(lights).size).toBe(4);
    expect(doorStage(emptyStage(), {})).toBeNull();
  });

  it('plays on the prologue data: three turns away the door stands ajar, then the white room', () => {
    const g = narrativeGame({ stub: false });
    g.step(1);
    jump(g, 'cut_p_door_white', 'n2_gate');
    play(g, ['+']);
    let stage = stageAt(emptyStage(), view(g));
    expect(view(g).nodeId).toBe('n2_door');
    expect(doorStage(stage, g.world.meta.flags)?.state).toBe('closed');
    // the door's lines first, then the node that offers the choices
    play(g, ['+']);
    stage = stageAt(stage, view(g));
    expect(view(g).nodeId).toBe('n2_door_hub');
    expect(doorStage(stage, g.world.meta.flags)?.state).toBe('closed');
    const seen: string[] = [];
    for (const node of ['n2_turn1', 'n2_turn2', 'n2_turn3']) {
      play(g, ['turn']);
      stage = stageAt(stage, view(g));
      expect(view(g).nodeId).toBe(node);
      const d = doorStage(stage, g.world.meta.flags);
      seen.push(`${d?.state}:${d?.corner}`);
    }
    // turns 1 and 2: the next corner; turn 3: open a crack with wind (it opens as the white
    // room comes in)
    expect(seen).toEqual(['corner:1', 'corner:2', 'ajar:3']);
    expect(g.world.meta.flags.p_door_attempts_refused).toBe(3);
    play(g, ['+']);
    stage = stageAt(stage, view(g));
    expect(view(g).nodeId).toBe('n3_white');
    expect(doorStage(stage, g.world.meta.flags)).toBeNull();
  });

  it('opens when pushed', () => {
    const g = narrativeGame({ stub: false });
    g.step(1);
    jump(g, 'cut_p_door_white', 'n2_gate');
    play(g, ['+']);
    let stage = stageAt(emptyStage(), view(g));
    play(g, ['+']);
    stage = stageAt(stage, view(g));
    play(g, ['push']);
    stage = stageAt(stage, view(g));
    expect(view(g).nodeId).toBe('n2_push');
    expect(doorStage(stage, g.world.meta.flags)?.state).toBe('open');
    expect(doorStage(stage, g.world.meta.flags)?.turns).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('P5: eavesdropping by distance', () => {
  const listening = (level: number, noises = 0) =>
    listenTier({ ...emptyStage(), listen: { flag: 'lv', noises } }, { lv: level });

  it('maps the stance level to a tier, and a noise lowers it for the rest', () => {
    // the cough stance stands at the curtain (middle) until its noise
    expect([0, 1, 2, 3].map((l) => listening(l))).toEqual(['far', 'mid', 'mid', 'near']);
    expect(listening(1, 1)).toBe('far');
    expect(listening(3, 1)).toBe('mid');
    expect(listening(3, 2)).toBe('far');
    expect(listening(2, 5)).toBe('far');
    expect(listenTier(emptyStage(), { lv: 3 })).toBeNull();
    expect(muffledLine('far', 'say', 'merca')).toBe(true);
    expect(muffledLine('far', 'narrate', 'narrator')).toBe(false);
    expect(muffledLine('mid', 'say', 'merca')).toBe(false);
  });

  it('hands the tier of the chosen stance to the audio through the story frame, and clears it after', () => {
    for (const [stance, tier] of [
      ['bench', 'far'],
      ['step', 'mid'],
      ['press', 'near'],
      ['cough', 'mid'],
    ] as const) {
      const g = narrativeGame({ stub: false });
      g.step(1);
      jump(g, 'cut_p_door_white', 'n3_check');
      g.world.meta.flags.p_heard_neighbors = true;
      // n3_check ends the door scene; the quarrel follows and opens on the stance
      g.queue('scenes.advance', {});
      g.step(1);
      const c = new StoryController(
        { advanceScene: () => {}, advanceLoose: () => {} },
        {
          music: () => {},
          sfx: () => {},
          ambience: () => {},
          silence: () => {},
          release: () => {},
        },
      );
      const input = (now: number): StoryInput => ({
        now,
        scene: sceneView(g.world, g.content),
        conversation: null,
        loose: null,
        playerId: 'player',
        speed: 'instant',
        autoSetting: false,
        calm: false,
        holdToToggle: false,
        skipKeyDown: false,
        resolver: AssetResolver.empty(),
        nameOf: (id) => id,
        letter: () => null,
        talkLayout: () => 'regular',
        talkSpeaker: (cv) => ({ id: cv.npcId, name: cv.name }),
        talkSubtitle: () => '',
        maxSay: 200,
        isBlocked: () => false,
        flags: g.world.meta.flags,
      });
      expect(view(g).nodeId).toBe('n4_stance');
      expect(c.frame(input(0)).listen).toBeNull();
      play(g, [stance]);
      const f = c.frame(input(10));
      expect(view(g).nodeId).toBe('n4_s1');
      expect(f.listen).toBe(tier);
      // far voices are dimmed, the others are not; the bench hears the fragments only
      const voices = f.cutscene?.lines.filter((l) => l.kind !== 'narrate') ?? [];
      expect(voices.length).toBeGreaterThan(0);
      for (const l of voices) expect(l.muffled).toBe(tier === 'far');
      // through the five segments to the call: the cough drops the tier, then listening ends
      const tiers: (string | null)[] = [];
      for (let i = 0; i < 12 && view(g).nodeId !== 'n5_call'; i++) {
        play(g, ['+']);
        tiers.push(c.frame(input(20 + i)).listen);
      }
      if (stance === 'cough') expect(tiers[1]).toBe('far');
      else expect(tiers.slice(0, -1).every((x) => x === tier)).toBe(true);
      expect(view(g).nodeId).toBe('n5_call');
      expect(c.frame(input(100)).listen).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------

describe('P15: the reach-out key', () => {
  it('binds reach_out in the dialogue context, on the keyboard and the pad, without conflicts', () => {
    expect(DEFAULT_CONTEXT_KEYMAP.dialogue.reach_out?.primary).toEqual({ code: 'KeyE' });
    expect(DEFAULT_PAD_KEYMAP.dialogue.reach_out?.primary).toBeDefined();
    const clashes = keymapConflicts(DEFAULT_CONTEXT_KEYMAP).filter((pair) =>
      pair.some((s) => s.action === 'reach_out'),
    );
    expect(clashes).toEqual([]);
    expect(padCoverageGaps().filter((g) => g.includes('reach_out'))).toEqual([]);
  });

  it('shows the fall as a key prompt only: no numbered list, the key picks "reach out"', () => {
    const g = narrativeGame({ stub: false });
    g.step(1);
    jump(g, 'cut_p_discard', 'n12_drop_4');
    play(g, ['+']);
    const v = view(g);
    expect(v.nodeId).toBe('n13_fall');
    const m = scenePanelModel(v);
    expect(m.choices).toEqual([]);
    expect(m.prompts.map((p) => [p.choiceId, p.action])).toEqual([['reach', 'reach_out']]);
    expect(promptFor(m.prompts, 'reach_out')?.choiceId).toBe('reach');
    expect(promptFor(m.prompts, 'advance')).toBeNull();
    const cm = cutsceneModel({
      scene: v,
      reader: { line: 9, chars: 0, lineDone: true, allDone: true, doneAt: 0 } as never,
      stage: emptyStage(),
      now: 0,
      resolver: AssetResolver.empty(),
      playerId: 'player',
      nameOf: (id) => id,
      letter: null,
      hidden: false,
      auto: false,
      skipping: false,
      skipHold: 0,
      isBlocked: () => false,
    });
    expect(cm.prompts.length).toBe(1);
    expect(cm.prompts[0]?.text).toContain('伸手');
    // the key shows through the action's own binding (the glyph resolver fills it in the client)
    expect(cm.prompts[0]?.text).toContain('{key:dialogue.reach_out}');
    // the client sends what the key picked; the kernel writes p_reached_out
    g.queue('scenes.choose', { choiceId: promptFor(m.prompts, 'reach_out')?.choiceId ?? '' });
    g.step(1);
    expect(g.world.meta.flags.p_reached_out).toBe(true);
    expect(keyPrompts([{ id: 'x', label: 'L' }])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('ui_mode_creator: the spirit mirror', () => {
  it('encodes and decodes every look, and the kernel accepts every look the mirror can make', () => {
    const rand = seeded(7);
    for (let i = 0; i < 200; i++) {
      const look = randomLook(rand);
      const text = encodeLook(look);
      expect(decodeLook(text)).toEqual(look);
      const r = checkCreatorResult(creatorResult(look));
      expect(r.ok, text).toBe(true);
    }
    // every option of every row, one at a time
    for (const row of CREATOR_ROWS) {
      for (let i = 0; i < rowSize(row); i++) {
        const look = creatorReduce(openCreator(DEFAULT_LOOK), { type: 'pick', row, index: i }).look;
        expect(checkCreatorResult(creatorResult(look)).ok).toBe(true);
        expect(decodeLook(encodeLook(look))).toEqual(look);
      }
    }
    expect(decodeLook('human:#3a3f4b,#6b7280,#f1c9a5,#1f1b18')).toBeNull();
    // an option a table no longer has falls back to the default, never fails
    expect(decodeLook('v1;ha=mullet;sk=99')).toEqual(DEFAULT_LOOK);
  });

  it('starts from the saved look, else from the snapshot colours the player wears', () => {
    const look: CreatorLook = { ...DEFAULT_LOOK, hair: 'bun', palette: 3, skin: 3, hairColor: 2 };
    expect(lookOf(encodeLook(look))).toEqual(look);
    const fromSnapshot = lookOf(undefined, {
      colors: ['#2f5d50', '#a47c52', '#c99169', '#4a2f1d'],
    });
    expect(fromSnapshot.palette).toBe(3);
    expect(fromSnapshot.skin).toBe(3);
    expect(fromSnapshot.hairColor).toBe(2);
  });

  it('pages, rows, cycling, random and reset', () => {
    let s = openCreator(DEFAULT_LOOK);
    s = creatorReduce(s, { type: 'page', delta: 1 });
    expect(s.page).toBe(1);
    s = creatorReduce(s, { type: 'row', delta: 1 });
    s = creatorReduce(s, { type: 'cycle', delta: 1 });
    expect(s.look.mouth).toBe(1);
    s = creatorReduce(s, { type: 'cycle', delta: -1 });
    s = creatorReduce(s, { type: 'cycle', delta: -1 });
    expect(s.look.mouth).toBe(2);
    s = creatorReduce(s, { type: 'random', rand: seeded(3) });
    expect(s.look).not.toEqual(DEFAULT_LOOK);
    s = creatorReduce(s, { type: 'reset' });
    expect(s.look).toEqual(DEFAULT_LOOK);
    s = creatorReduce(s, { type: 'turn', delta: -1 });
    expect(creatorView(s, false).dir).toBe('left');
    const v = creatorView(s, false);
    expect(v.pages.map((p) => p.label)).toEqual(['体型', '脸', '头发', '衣着']);
    for (const r of v.rows)
      for (const c of r.cells) expect(c.label.startsWith('ui.'), c.label).toBe(false);
    expect(v.note).not.toBe('');
    expect(creatorView(s, true).note).toBe('');
  });

  it('round-trips through a save: the look, the flag and the appearance come back', () => {
    const g = narrativeGame({ stub: false });
    g.step(1);
    jump(g, 'cut_p_door_white', 'n2_push');
    play(g, ['+', '+', '+']);
    expect(view(g).nodeId).toBe('n3_hub');
    play(g, ['mirror']);
    expect(view(g).nodeId).toBe('n3_mirror');
    play(g, ['creator']);
    expect(view(g).waiting).toBe('ui');
    expect(view(g).ui).toBe('ui_mode_creator');
    const look: CreatorLook = {
      sex: 'm',
      body: 'hb',
      eyes: 3,
      mouth: 2,
      skin: 5,
      hair: 'ponytail_low',
      hairColor: 4,
      outfit: 'earth_office',
      palette: 5,
    };
    const run = g.world.slices.scenes.current;
    if (!run) throw new Error('no run');
    g.queue('scenes.ui_done', {
      runId: run.runId,
      revision: run.revision,
      ui: 'ui_mode_creator',
      result: creatorResult(look),
    });
    g.step(1);
    expect(view(g).nodeId).toBe('n3_mirror_done');
    expect(g.world.meta.flags.p_mirror_done).toBe(true);
    const text = serializeWorld(g.world);
    const loaded = Engine.resume(deserializeWorld(text), g.content, NARRATIVE_SYSTEMS, {
      aiMode: 'off',
    });
    expect(decodeLook(String(loaded.world.meta.flags.p_appearance))).toEqual(look);
    expect(lookOf(loaded.world.meta.flags.p_appearance)).toEqual(look);
    const a = playerEntity(loaded.world)?.appearance;
    expect(a).toEqual(appearanceOf(look));
    // the loaded world goes on exactly as the one that never stopped
    g.step(40);
    loaded.step(40);
    expect(worldHash(loaded.world)).toBe(worldHash(g.world));
  });
});

// ---------------------------------------------------------------------------

/** One approved sheet whose frames are listed as [anim, dir, w, h, ax, ay]. */
function sheet(
  id: string,
  frames: [string, string, number, number, number, number][],
  fill: string,
  slots: Record<string, { slot: string; level: number }> = {},
): { record: AssetRecord; meta: AssetMeta; pixels: PixelMatrix } {
  let x = 0;
  const fm = frames.map(([anim, dir, w, h, ax, ay]) => {
    const f = { anim, dir, i: 0, x, y: 0, w, h, ax, ay, ms: null, footprint: 4 };
    x += w;
    return f;
  });
  const width = x;
  const height = Math.max(...frames.map((f) => f[3]));
  const pixels = createMatrix(width, height);
  const color = Number.parseInt(fill.slice(1), 16);
  for (const f of fm)
    for (let yy = 2; yy < f.h - 2; yy++)
      for (let xx = 2; xx < f.w - 2; xx++) setPixel(pixels, f.x + xx, yy, color);
  const meta = {
    id,
    template: 'doll_test',
    style: null,
    size: [width, height],
    cell: [frames[0]?.[2] ?? 0, height],
    grid: [frames.length, 1],
    frames: fm,
    anims: Object.fromEntries(
      fm.map((f, i) => [
        `${f.anim}/${f.dir}`,
        { frames: [i], ms: [null], loop: true, hold: false },
      ]),
    ),
    directions: { drawn: ['down'], mirrored: [] },
    swatch: [],
    processing: {},
    slots,
  } as AssetMeta;
  return {
    record: {
      id,
      kind: 'art',
      file: `art/doll/${id}.png`,
      template: 'doll_test',
      status: 'approved',
    },
    meta,
    pixels,
  };
}

describe('the paper-doll assembler', () => {
  const look = lookFromAppearance(appearanceOf({ ...DEFAULT_LOOK, hair: 'bob', hairColor: 5 }));
  const anims = ['idle', 'walk', 'hit', 'death'] as const;
  const dirs = ['down', 'right', 'up', 'left'] as const;

  it('with no art the assembled look is the placeholder, bit for bit', () => {
    resetAssets();
    for (const anim of anims)
      for (const dir of dirs) {
        expect(frameKey(look, anim, dir, 1)).toBe(spriteKey(look, anim, dir, 1));
        expect(buildFrame(look, anim, dir, 1)).toEqual(generateFrame(look, anim, dir, 1));
      }
    // the doll recipe changes nothing of the placeholder: same colours, same picture
    const plain = lookFromAppearance({ base: 'human', colors: appearanceOf(DEFAULT_LOOK).colors });
    const dolled = lookFromAppearance(appearanceOf(DEFAULT_LOOK));
    expect(dolled.key).toBe(plain.key);
    expect(generateFrame(dolled, 'idle', 'down', 0)).toEqual(
      generateFrame(plain, 'idle', 'down', 0),
    );
  });

  const HAIR_KEY = '#c0a010';
  function parts(withHair: boolean) {
    const a = appearanceOf({ ...DEFAULT_LOOK, hair: 'bob', hairColor: 5 });
    const doll = a.doll;
    if (!doll?.outfit || !doll.head || !doll.hair) throw new Error('no recipe');
    const list = [
      sheet(`${doll.outfit}_idle`, [['idle', 'down', 48, 48, 24, 44]], '#3a3f4b'),
      sheet(
        doll.head,
        [
          ['front', 'down', 32, 32, 16, 31],
          ['back', 'down', 32, 32, 16, 31],
        ],
        '#f1c9a5',
      ),
    ];
    if (withHair)
      list.push(
        sheet(doll.hair, [['front', 'down', 32, 32, 16, 31]], HAIR_KEY, {
          [HAIR_KEY]: { slot: 'hair', level: 1 },
        }),
      );
    return list;
  }
  function install(list: ReturnType<typeof parts>) {
    const r = new AssetResolver({
      records: list.map((p) => p.record),
      meta: (rec) => list.find((p) => p.record.id === rec.id)?.meta,
    });
    const px: SheetPixels = { get: (id) => list.find((p) => p.record.id === id)?.pixels };
    installAssets(r, px);
    return { r, px };
  }

  it('keeps the placeholder while any named part is missing', () => {
    const { r, px } = install(parts(false));
    expect(composeDoll(r, px, look, 'idle', 'down', 0)).toBeNull();
    expect(buildFrame(look, 'idle', 'down', 0)).toEqual(generateFrame(look, 'idle', 'down', 0));
    expect(frameKey(look, 'idle', 'down', 0)).toBe(spriteKey(look, 'idle', 'down', 0));
    resetAssets();
  });

  it('composes every approved part on the mannequin, recoloured from the look', () => {
    const { r, px } = install(parts(true));
    const doll = composeDoll(r, px, look, 'idle', 'down', 0);
    expect(doll).not.toBeNull();
    const f = doll?.frame;
    expect(f?.matrix.w).toBe(48);
    expect(f?.anchorX).toBe(24);
    expect(f?.anchorY).toBe(44);
    expect(f?.height).toBeGreaterThan(20);
    // the hair sits on the neck: above the body's anchor by the mannequin's torso and legs
    const at = dollAnchors('h', 'idle', 'down', 0);
    expect(at.neck.y).toBeLessThan(0);
    // the hair's key colour took the look's hair colour (level 1: the shadow step of its ramp)
    const want = shadeRamp(look.hair)[3] ?? -1;
    const neckY = 44 + at.neck.y;
    expect(getPixel(f?.matrix ?? createMatrix(1, 1), 24, neckY - 10)).toBe(want);
    // the runtime draws it instead of the placeholder, under its own cache key
    expect(buildFrame(look, 'idle', 'down', 0)).toEqual(f);
    expect(frameKey(look, 'idle', 'down', 0).startsWith('doll:')).toBe(true);
    resetAssets();
  });

  it('recolours only the key colours the slot map lists', () => {
    const m3 = createMatrix(4, 1);
    setPixel(m3, 0, 0, 0xc0a010);
    setPixel(m3, 1, 0, 0x123456);
    setPixel(m3, 2, 0, 0x806010);
    setPixel(m3, 3, 0, 0x3c3e44);
    recolor(
      m3,
      {
        '#c0a010': { slot: 'hair', level: 3 },
        '#806010': { slot: 'hair', level: 0 },
        '#3c3e44': { slot: 'metal', level: 2 },
      },
      look,
    );
    const pal = paletteFor(look);
    expect(getPixel(m3, 0, 0)).toBe(shadeRamp(look.hair)[1]);
    expect(getPixel(m3, 1, 0)).toBe(0x123456);
    // level 0 is the outline step; the fixed slots (metal, leather, accent) recolour too
    expect(getPixel(m3, 2, 0)).toBe(shadeRamp(look.hair)[4]);
    expect(getPixel(m3, 3, 0)).toBe(pal[SLOT.METAL]?.[2]);

    expect(t('ui.mode.creator.title')).toBe('灵镜');
  });
});

// ---------------------------------------------------------------------------

describe('story layer details of the prologue staging', () => {
  it('binds every keyed scene action on the keyboard and the pad', () => {
    for (const k of SCENE_CHOICE_KEYS) {
      expect(DEFAULT_CONTEXT_KEYMAP.dialogue[k]?.primary, k).toBeDefined();
      expect(DEFAULT_PAD_KEYMAP.dialogue[k]?.primary, k).toBeDefined();
    }
  });

  it('counts key prompts as pickable and shows no choice hint beside them', () => {
    const g = narrativeGame({ stub: false });
    g.step(1);
    jump(g, 'cut_p_discard', 'n12_drop_4');
    play(g, ['+']);
    const m = cutsceneModel({
      scene: view(g),
      reader: { line: 9, chars: 0, lineDone: true, allDone: true, doneAt: 0 } as never,
      stage: emptyStage(),
      now: 0,
      resolver: AssetResolver.empty(),
      playerId: 'player',
      nameOf: (id) => id,
      letter: null,
      hidden: false,
      auto: false,
      skipping: false,
      skipHold: 0,
      isBlocked: () => false,
    });
    expect(m.choices).toEqual([]);
    expect(pickable(m)).toBe(true);
    expect(m.hint).toBe('');
    expect(pickable(null)).toBe(false);
  });

  it('reads a segment summary through its own key, falling back to its text', () => {
    expect(summaryCard('zz_none', 'T', '段落梗概', 'dusk').text).toBe('段落梗概');
    expect(summaryCard('zz_none', 'T', '').text).toBe('');
  });

  it('starts the stage afresh when the opening is chosen again (same scene, new run)', () => {
    const released: string[] = [];
    const c = new StoryController(
      { advanceScene: () => {}, advanceLoose: () => {} },
      {
        music: () => {},
        sfx: () => {},
        ambience: () => {},
        silence: () => {},
        release: () => released.push('release'),
      },
    );
    const base = {
      runId: 1,
      revision: 1,
      sceneId: 'prologue',
      title: 'T',
      nodeId: 'n4_s1',
      waiting: 'advance' as const,
      lines: [],
      choices: [],
      input: null,
      court: null,
      queued: [],
      presentation: 'theater' as const,
      illustration: null,
      summary: '',
      act: 'prologue',
      stage: [{ op: 'listen' as const, flag: 'lv' }],
      anchor: false,
      ui: null,
      uiStoreAs: '',
      segment: '',
      segmentSummary: '',
      restartable: true,
    };
    const input = (scene: SceneView): StoryInput => ({
      now: 0,
      scene,
      conversation: null,
      loose: null,
      playerId: 'player',
      speed: 'instant',
      autoSetting: false,
      calm: false,
      holdToToggle: false,
      skipKeyDown: false,
      resolver: AssetResolver.empty(),
      nameOf: (id) => id,
      letter: () => null,
      talkLayout: () => 'regular',
      talkSpeaker: (cv) => ({ id: cv.npcId, name: cv.name }),
      talkSubtitle: () => '',
      maxSay: 200,
      isBlocked: () => false,
      flags: { lv: 3 },
    });
    expect(c.frame(input(base)).listen).toBe('near');
    // the restarted run opens on P1: no listening carries over, the audio is handed back
    const again = { ...base, runId: 2, nodeId: 'n1_opening', stage: [] };
    expect(c.frame(input(again)).listen).toBeNull();
    expect(released).toEqual(['release']);
  });
});
