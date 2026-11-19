// The story cores of `ui_mode_dialogue` and `ui_mode_cutscene` (PK-M1-22; ux_and_onboarding.md
// 7, 8; catalog_cutscenes.md 13): the typewriter and the press rule, auto advance, the skip
// hold, the backlog, the portrait plan with its fallbacks, the stage directives and the audio
// director input, the letter step, the two panel models, the story controller (skip to the next
// choice with a summary card, the letter step, refusals) and the AI block list. Node only.

import { describe, expect, it } from 'vitest';
import { createAdapters } from '../src/client/app/adapters_wiring';
import { AssetResolver } from '../src/client/assets/resolver';
import type { AssetMeta, AssetRecord } from '../src/client/assets/types';
import type { DialogueLine } from '../src/client/hud/dialogue_queue';
import { AI_FLAGS_KEY, AI_FLAGS_LIMIT, AiFlagStore } from '../src/client/hud/story/ai_flags';
import { BACKLOG_LIMIT, Backlog, conversationBacklog } from '../src/client/hud/story/backlog';
import {
  cutsceneModel,
  sceneLengths,
  scenePageKey,
  sceneStepKey,
  summaryCard,
} from '../src/client/hud/story/cutscene_model';
import {
  counterText,
  lineSignature,
  looseModel,
  optionTag,
  talkLengths,
  talkModel,
} from '../src/client/hud/story/dialogue_model';
import { letterCard } from '../src/client/hud/story/letter_card';
import {
  dialogueLayout,
  expressionChain,
  nameInitial,
  pixelScale,
  portraitIds,
  resolvePortrait,
} from '../src/client/hud/story/portrait_plan';
import {
  AUTO_BASE_MS,
  AutoAdvance,
  autoDwellMs,
  charsShown,
  firstChars,
  HoldWatch,
  LineReader,
  SKIP_HOLD_MS,
  typingMs,
} from '../src/client/hud/story/reading';
import {
  cutsceneDirectorInput,
  emptyStage,
  enterNode,
  litBusts,
  SILENCE_DB,
} from '../src/client/hud/story/stage';
import { StoryController, type StoryInput } from '../src/client/hud/story/story_controller';
import type { ConversationView } from '../src/client/view/adapters';
import { createGameView } from '../src/client/view/game_view';
import type { AnyWorldEvent } from '../src/core/contracts';
import { createGame } from '../src/game/create';
import { setTextLanguage, t } from '../src/shared_ui/i18n';
import type { SceneView } from '../src/systems/scenes';

setTextLanguage('zh-Hans');

// ---------------------------------------------------------------------------
// fixtures

function ev<K extends AnyWorldEvent['kind']>(
  kind: K,
  data: Extract<AnyWorldEvent, { kind: K }>['data'],
  tick = 1,
  seq = 1,
): AnyWorldEvent {
  return { kind, data, tick, seq } as unknown as AnyWorldEvent;
}

function scene(over: Partial<SceneView> = {}): SceneView {
  return {
    runId: 1,
    revision: 1,
    sceneId: 'cut_test',
    title: 'Test',
    nodeId: 'n1',
    waiting: 'advance',
    lines: [
      { speakerId: 'narrator', speakerName: '', text: 'abcdef', kind: 'narrate' },
      { speakerId: 'eluen', speakerName: 'Eluen', text: 'xyz', kind: 'say' },
    ],
    choices: [],
    input: null,
    court: null,
    queued: [],
    presentation: 'theater',
    illustration: null,
    summary: '',
    act: 'prologue',
    stage: [],
    anchor: false,
    ui: null,
    uiStoreAs: '',
    segment: '',
    segmentSummary: '',
    restartable: false,
    ...over,
  };
}

/** An approved sheet whose frames are named `anims` (one front frame each). */
function sheet(id: string, anims: string[]): { record: AssetRecord; meta: AssetMeta } {
  const frames = anims.map((anim, i) => ({
    anim,
    dir: 'front',
    i: 0,
    x: i * 64,
    y: 0,
    w: 64,
    h: 64,
    ax: null,
    ay: null,
    ms: null,
    footprint: 1,
  }));
  const meta: AssetMeta = {
    id,
    template: 'por_main',
    style: null,
    size: [64 * anims.length, 64],
    cell: [64, 64],
    grid: [anims.length, 1],
    frames,
    anims: Object.fromEntries(
      anims.map((a, i) => [`${a}/front`, { frames: [i], ms: [null], loop: false, hold: true }]),
    ),
    directions: { drawn: ['front'], mirrored: [] },
    swatch: [],
    processing: {},
  };
  return {
    record: {
      id,
      kind: 'art',
      file: `art/test/${id}.png`,
      template: 'por_main',
      status: 'approved',
    },
    meta,
  };
}

function resolver(sheets: { record: AssetRecord; meta: AssetMeta }[]): AssetResolver {
  const metas = new Map(sheets.map((s) => [s.record.id, s.meta]));
  return new AssetResolver({ records: sheets.map((s) => s.record), meta: (r) => metas.get(r.id) });
}

// ---------------------------------------------------------------------------

describe('reading: typewriter, press rule, auto advance, skip hold', () => {
  it('reveals characters by real time at the text speed, or at once', () => {
    expect(charsShown(10, 30, 0)).toBe(0);
    expect(charsShown(10, 30, 100)).toBe(3);
    expect(charsShown(10, 60, 100)).toBe(6);
    expect(charsShown(10, 30, 10_000)).toBe(10);
    expect(charsShown(10, 'instant', 0)).toBe(10);
    expect(typingMs(30, 30)).toBe(1000);
    expect(typingMs(30, 'instant')).toBe(0);
    expect(firstChars('一二三四', 2)).toBe('一二');
  });

  it('dwells 1.5 s plus a second per eight characters (13.2)', () => {
    expect(autoDwellMs(0)).toBe(AUTO_BASE_MS);
    expect(autoDwellMs(16)).toBe(3500);
  });

  it('sequence mode: a press completes the typing line, then shows the next, then ends', () => {
    const r = new LineReader('sequence');
    r.sync('p1', [6, 3], 0);
    expect(r.state(100, 30)).toMatchObject({ line: 0, chars: 3, lineDone: false, allDone: false });
    expect(r.press(100, 30)).toBe('completed');
    expect(r.state(100, 30)).toMatchObject({ line: 0, chars: 6, lineDone: true, doneAt: 100 });
    expect(r.press(110, 30)).toBe('next');
    expect(r.state(110, 30)).toMatchObject({ line: 1, chars: 0 });
    expect(r.state(10_000, 30)).toMatchObject({ line: 1, allDone: true, doneAt: 110 + 100 });
    expect(r.press(10_000, 30)).toBe('end');
    // the same key keeps the progress; a new key starts over
    r.sync('p1', [6, 3], 20_000);
    expect(r.state(20_000, 30).line).toBe(1);
    r.sync('p2', [4], 20_000);
    expect(r.state(20_000, 30)).toMatchObject({ line: 0, chars: 0 });
  });

  it('sequence mode: lines appended to the same node extend the page, never retype it', () => {
    // a free-input reply: the node's prompt was read, then the kernel appends the reply
    const r = new LineReader('sequence');
    r.sync('scene/n1', [4], 0);
    expect(r.state(10_000, 30)).toMatchObject({ line: 0, allDone: true });
    r.sync('scene/n1', [4, 6, 2], 10_100);
    expect(r.state(10_100, 30)).toMatchObject({ line: 1, chars: 0, allDone: false });
    // still reading an earlier line when more arrive: the reader stays where it is
    const s = new LineReader('sequence');
    s.sync('scene/n2', [8, 8], 0);
    s.sync('scene/n2', [8, 8, 3], 50);
    expect(s.state(50, 30).line).toBe(0);
    // fewer lines under the same page (the node entered anew) types from the start
    s.sync('scene/n2', [8], 60);
    expect(s.state(60, 30)).toMatchObject({ line: 0, chars: 0 });
  });

  it('the scene page key is the node; the step key also counts the lines shown', () => {
    const v = { sceneId: 's', nodeId: 'n', lines: [{}, {}] } as unknown as SceneView;
    expect(scenePageKey(v)).toBe('s/n');
    expect(sceneStepKey(v)).toBe('s/n/2');
  });

  it('tail mode: history shows at once and a new line types by itself', () => {
    const r = new LineReader('tail');
    r.sync('talk', [5, 5, 4], 0);
    expect(r.state(0, 30).line).toBe(2);
    r.sync('talk', [5, 5, 4, 8], 500);
    expect(r.state(500, 30)).toMatchObject({ line: 3, chars: 0 });
    expect(r.press(510, 30)).toBe('completed');
    expect(r.state(510, 30).allDone).toBe(true);
  });

  it('auto advance toggles, pauses on a manual press and stops where it must', () => {
    const a = new AutoAdvance(false);
    expect(a.due(5000, 0, 0, false)).toBe(false);
    a.toggle();
    expect(a.active).toBe(true);
    expect(a.due(AUTO_BASE_MS - 1, 0, 0, false)).toBe(false);
    expect(a.due(AUTO_BASE_MS, 0, 0, false)).toBe(true);
    expect(a.due(AUTO_BASE_MS, 0, 0, true)).toBe(false);
    expect(a.due(AUTO_BASE_MS, null, 0, false)).toBe(false);
    a.manualPress();
    expect(a.active).toBe(false);
    expect(a.enabled).toBe(true);
    a.toggle();
    expect(a.active).toBe(true);
    a.toggle();
    expect(a.enabled).toBe(false);
  });

  it('the skip hold fires once after a second, or at once with hold-to-toggle', () => {
    const h = new HoldWatch();
    expect(h.update(true, 0)).toBe(false);
    expect(h.progress(SKIP_HOLD_MS / 2)).toBeCloseTo(0.5);
    expect(h.update(true, SKIP_HOLD_MS - 1)).toBe(false);
    expect(h.update(true, SKIP_HOLD_MS)).toBe(true);
    expect(h.update(true, SKIP_HOLD_MS + 500)).toBe(false);
    expect(h.update(false, 3000)).toBe(false);
    expect(new HoldWatch().update(true, 0, true)).toBe(true);
  });
});

describe('backlog', () => {
  it('collects one scene run: title, lines, choices and the player words', () => {
    const b = new Backlog();
    b.feed([
      ev('dialogue.line', { speakerId: 'x', speakerName: 'X', text: 'outside', kind: 'say' }),
    ]);
    expect(b.list()).toHaveLength(0);
    b.feed([
      ev('scene.started', { sceneId: 'cut_a', title: 'A' }, 1),
      ev('dialogue.line', { speakerId: 'n', speakerName: 'N', text: 'hello', kind: 'narrate' }, 1),
      ev('scene.choice', { sceneId: 'cut_a', nodeId: 'n1', choiceId: 'c', label: 'Pick' }, 2),
      ev('player.said', { text: 'my words', mapId: 'm' }, 3),
    ]);
    expect(b.list().map((e) => e.kind)).toEqual(['title', 'line', 'choice', 'input']);
    expect(b.list()[0]?.sceneId).toBe('cut_a');
    // narration has no speaker
    expect(b.list()[1]?.speaker).toBe('');
    // a scene chaining on the tick the last one ended keeps reading on
    b.feed([
      ev('scene.ended', { sceneId: 'cut_a' }, 5),
      ev('scene.started', { sceneId: 'cut_b', title: 'B' }, 5),
    ]);
    expect(b.list()).toHaveLength(5);
    // a later scene starts a new run
    b.feed([
      ev('scene.ended', { sceneId: 'cut_b' }, 6),
      ev('scene.started', { sceneId: 'cut_c', title: 'C' }, 9),
    ]);
    expect(b.list().map((e) => e.text)).toEqual(['C']);
  });

  it('keeps a bounded run and maps a conversation', () => {
    const b = new Backlog();
    const lines = Array.from({ length: BACKLOG_LIMIT + 10 }, (_, i) =>
      ev('dialogue.line', { speakerId: 'n', speakerName: 'N', text: `l${i}`, kind: 'say' }),
    );
    b.feed([ev('scene.started', { sceneId: 's', title: 'S' }), ...lines]);
    expect(b.list()).toHaveLength(BACKLOG_LIMIT);
    expect(b.list().at(-1)?.text).toBe(`l${BACKLOG_LIMIT + 9}`);
    expect(
      conversationBacklog([{ speakerName: 'Ron', text: 'hi', kind: 'say' }]).map((e) => e.speaker),
    ).toEqual(['Ron']);
  });
});

describe('portrait plan (art_pipeline 3.6)', () => {
  it('falls back expression cells to what is drawn', () => {
    expect(expressionChain('grin')).toEqual(['grin', 'smile', 'neutral']);
    expect(expressionChain('surprised')).toEqual(['surprised', 'sad', 'neutral']);
    expect(expressionChain('thinking')).toEqual(['thinking', 'neutral']);
    expect(expressionChain('cold')).toEqual(['neutral']);
    expect(expressionChain(undefined)).toEqual(['neutral']);
  });

  it('bust first, then the portrait one size up, the crop, a plate, the empty frame', () => {
    const r = resolver([
      sheet('art_bust_shiya', ['main']),
      sheet('art_bust_shiya_expr', ['smile']),
      sheet('art_por_ron', ['neutral', 'smile', 'angry', 'sad']),
    ]);
    const shiya = { id: 'shiya', name: 'Shiya' };
    const bust = resolvePortrait(r, shiya, 'grin', 'bust');
    expect(bust.kind).toBe('bust');
    if (bust.kind === 'bust') {
      expect(bust.cell).toBe('smile');
      expect(bust.expression?.assetId).toBe('art_bust_shiya_expr');
    }
    const neutral = resolvePortrait(r, shiya, 'neutral', 'bust');
    expect(neutral.kind === 'bust' && neutral.expression).toBe(null);
    // no portrait for shiya: the regular layout falls to the plate
    expect(resolvePortrait(r, shiya, 'neutral', 'portrait')).toEqual({
      kind: 'plate',
      initial: 'S',
    });
    // a four-cell portrait: surprised shows sad, thinking shows neutral; one size up as a bust
    const ron = { id: 'ron', name: 'Ron', entityId: 'e1' };
    const sur = resolvePortrait(r, ron, 'surprised', 'bust');
    expect(sur).toMatchObject({ kind: 'portrait', cell: 'sad', large: true });
    expect(resolvePortrait(r, ron, 'thinking', 'portrait')).toMatchObject({
      cell: 'neutral',
      large: false,
    });
    // no art: the standee crop of the entity, else the plate
    expect(
      resolvePortrait(r, { id: 'oola', name: 'Oola', entityId: 'e2' }, 'smile', 'portrait'),
    ).toEqual({
      kind: 'crop',
      entityId: 'e2',
    });
    expect(resolvePortrait(r, { id: '', name: '' }, 'smile', 'portrait')).toEqual({
      kind: 'plate',
      initial: '',
    });
    // the faceless: an empty frame even with art
    expect(
      resolvePortrait(r, ron, 'neutral', 'portrait', { faceless: (id) => id === 'ron' }),
    ).toEqual({
      kind: 'empty',
    });
  });

  it('names its ids, picks the story layout for bust holders, scales whole', () => {
    expect(portraitIds({ id: 'ron', name: '' })).toEqual({
      portrait: 'art_por_ron',
      bust: 'art_bust_ron',
    });
    expect(portraitIds({ id: 'x', name: '', art: { bust: 'art_bust_y' } }).bust).toBe('art_bust_y');
    const r = resolver([sheet('art_bust_shiya', ['main'])]);
    expect(dialogueLayout(r, { id: 'shiya', name: '' })).toBe('story');
    expect(dialogueLayout(r, { id: 'ron', name: '' })).toBe('regular');
    expect(dialogueLayout(r, { id: 'ron', name: '' }, new Set(['ron']))).toBe('story');
    expect(nameInitial(' 希雅')).toBe('希');
    expect(pixelScale(64, 128)).toBe(2);
    expect(pixelScale(384, 300)).toBe(1);
  });
});

describe('stage directives (catalog 13.5)', () => {
  it('plays music, sound and silence; stands busts; captions belong to the node', () => {
    const { state, audio } = enterNode(
      emptyStage(),
      [
        { op: 'music', id: 'mus_a', layer: 2 },
        { op: 'sfx', id: 'sfx_cin_x' },
        { op: 'silence', seconds: 3 },
        { op: 'bust', who: 'eluen', expression: 'smile', side: 'left' },
        { op: 'bust', who: 'valda', side: 'right' },
        { op: 'caption', text: 'cap' },
        { op: 'letter', id: 'ltr_a1_count' },
        { op: 'shake', strength: 2 },
        { op: 'fade', to: 'black', seconds: 1 },
      ],
      1000,
      false,
    );
    expect(audio).toEqual([
      { op: 'music', id: 'mus_a', mode: 'in', layer: 2 },
      { op: 'sfx', id: 'sfx_cin_x' },
      { op: 'silence', seconds: 3, db: SILENCE_DB },
    ]);
    expect(state).toMatchObject({
      music: 'mus_a',
      layers: 2,
      silenceUntil: 4000,
      captions: ['cap'],
      letter: 'ltr_a1_count',
      shake: 2,
      fade: { to: 'black', until: 2000 },
    });
    expect(state.busts.map((b) => `${b.who}:${b.side}:${b.expression}`)).toEqual([
      'eluen:left:smile',
      'valda:right:neutral',
    ]);
    expect(cutsceneDirectorInput(true, state, 2000)).toEqual({
      music: 'mus_a',
      layers: 2,
      silence: true,
    });
    expect(cutsceneDirectorInput(true, state, 4000)?.silence).toBe(false);
    expect(cutsceneDirectorInput(false, state, 0)).toBeNull();
    // the next node keeps busts and music, drops captions, the letter and the shake
    const next = enterNode(state, [{ op: 'bust', who: 'merca', side: 'left' }], 5000, false).state;
    expect(next.captions).toEqual([]);
    expect(next.letter).toBeNull();
    expect(next.shake).toBe(0);
    expect(next.fade).toBeNull();
    expect(next.busts.map((b) => b.who)).toEqual(['valda', 'merca']);
    expect(
      enterNode(next, [{ op: 'music', id: 'mus_a', mode: 'out' }], 0, false).state.music,
    ).toBeNull();
    expect(enterNode(next, [{ op: 'bust_clear' }], 0, false).state.busts).toEqual([]);
    // reduce flashing and shaking drops the shake (13.8)
    expect(enterNode(emptyStage(), [{ op: 'shake', strength: 3 }], 0, true).state.shake).toBe(0);
    // and turns a white flash into a soft brightening; a black fade stays black
    const white = { op: 'fade', to: 'white', seconds: 1 } as const;
    expect(enterNode(emptyStage(), [white], 0, true).state.fade?.to).toBe('soft');
    expect(enterNode(emptyStage(), [white], 0, false).state.fade?.to).toBe('white');
    const black = { op: 'fade', to: 'black', seconds: 1 } as const;
    expect(enterNode(emptyStage(), [black], 0, true).state.fade?.to).toBe('black');
  });

  it('lights the speaking bust and dims the listener', () => {
    const busts = [
      { who: 'a', expression: 'neutral', side: 'left' as const },
      { who: 'b', expression: 'neutral', side: 'right' as const },
    ];
    expect(litBusts(busts, 'b').map((b) => b.lit)).toEqual([false, true]);
    // a narrator line keeps everyone lit
    expect(litBusts(busts, 'narrator').map((b) => b.lit)).toEqual([true, true]);
  });
});

describe('letter step', () => {
  it('reads a letter not yet delivered from its definition, conditions applied', () => {
    const engine = createGame({ seed: 7 });
    const view = createGameView(engine);
    const card = letterCard(view.world as never, view.content as never, 'ltr_a1_count');
    expect(card?.delivered).toBe(false);
    expect(card?.seal).toBe('official');
    expect(card?.subject).toEqual({ key: 'c.letters.ltr_a1_count.subject' });
    // the paragraphs whose condition fails stay out (the tide credit lines need flags)
    const keys = (card?.paragraphs ?? []).map((p) => (p as { key: string }).key);
    expect(keys).toContain('c.letters.ltr_a1_count.body.salute.text');
    expect(keys).not.toContain('c.letters.ltr_a1_count.body.credit_player.text');
    expect(letterCard(view.world as never, view.content as never, 'ltr_nope')).toBeNull();
  });
});

const talk = (over: Partial<ConversationView> = {}): ConversationView => ({
  npcId: 'e_ron',
  name: 'Ron',
  lines: [
    { speakerId: 'p', speakerName: 'Me', text: 'hi', kind: 'say' },
    { speakerId: 'e_ron', speakerName: 'Ron', text: 'hello there', kind: 'say', generated: true },
  ],
  options: [
    { id: 'chat', label: 'Chat', system: 'dialogue' },
    { id: 'bye', label: 'Bye', system: 'dialogue' },
    { id: 'buy', label: 'Buy', system: 'economy', disabled: 'no money' },
  ],
  pending: false,
  ...over,
});

describe('dialogue model (ux 7)', () => {
  const reader = { line: 1, chars: 3, lineDone: false, allDone: false, doneAt: null };

  it('types the newest line, tags and numbers options, counts the free line', () => {
    const m = talkModel({
      conv: talk(),
      reader,
      layout: 'regular',
      speaker: { id: 'ron', name: 'Ron' },
      playerId: 'p',
      subtitle: 'Hunter',
      maxSay: 200,
      rejected: '',
      said: 0,
      isBlocked: () => false,
    });
    expect(m.lines.map((l) => l.text)).toEqual(['hi', 'hel']);
    expect(m.typing).toBe(true);
    expect(m.lines[0]?.mine).toBe(true);
    expect(m.lines[1]?.generated).toBe(true);
    expect(m.options.map((o) => [o.number, o.tag, o.disabled])).toEqual([
      [1, t('ui.mode.dialogue.tag.talk'), ''],
      [2, t('ui.mode.dialogue.tag.leave'), ''],
      [3, t('ui.mode.dialogue.tag.economy'), 'no money'],
    ]);
    expect(m.farewell).toBe('');
    expect(counterText(250, 200)).toBe('200/200');
    expect(optionTag('nobody_offers_this', 'x')).toBe('');
  });

  it('blocks a flagged model line, shows a farewell when nothing is left, keeps refusals', () => {
    const sig = lineSignature('e_ron', 'hello there');
    const m = talkModel({
      conv: talk({ options: [] }),
      reader: { line: 1, chars: 11, lineDone: true, allDone: true, doneAt: 0 },
      layout: 'story',
      speaker: { id: 'ron', name: 'Ron' },
      playerId: 'p',
      subtitle: '',
      maxSay: 200,
      rejected: 'too long',
      said: 2,
      isBlocked: (s) => s === sig,
    });
    expect(m.lines[1]?.blocked).toBe(true);
    expect(m.lines[1]?.text).toBe(t('ui.common.ai.blocked_line'));
    expect(m.farewell).toBe(t('ui.mode.dialogue.farewell'));
    expect(m.rejected).toBe('too long');
    expect(m.said).toBe(2);
    // waiting for a reply is not "nothing to say"
    expect(
      talkModel({
        conv: talk({ options: [], pending: true }),
        reader,
        layout: 'regular',
        speaker: { id: 'ron', name: 'Ron' },
        playerId: 'p',
        subtitle: '',
        maxSay: 200,
        rejected: '',
        said: 0,
        isBlocked: () => false,
      }).farewell,
    ).toBe('');
    expect(talkLengths(talk())).toEqual([2, 11]);
  });

  it('shows a loose line with the advance hint and no speaker for narration', () => {
    const line: DialogueLine = { speakerId: 'n', speakerName: 'N', text: 'once', kind: 'narrate' };
    const m = looseModel(line, {
      line: 0,
      chars: 2,
      lineDone: false,
      allDone: false,
      doneAt: null,
    });
    expect(m.mode).toBe('loose');
    expect(m.name).toBe('');
    expect(m.lines[0]?.text).toBe('on');
    expect(m.hint).toBe(t('ui.mode.dialogue.advance'));
  });
});

describe('cutscene model (ux 8)', () => {
  const base = {
    stage: emptyStage(),
    now: 0,
    resolver: AssetResolver.empty(),
    playerId: 'p',
    nameOf: (id: string) => id.toUpperCase(),
    letter: null,
    hidden: false,
    auto: false,
    skipping: false,
    skipHold: 0,
    isBlocked: () => false,
  };

  it('holds the choices back until every line of the node is shown', () => {
    const v = scene({
      waiting: 'choice',
      choices: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B', confirm: true },
      ],
    });
    const typing = cutsceneModel({
      ...base,
      scene: v,
      reader: { line: 0, chars: 2, lineDone: false, allDone: false, doneAt: null },
    });
    expect(typing.choices).toEqual([]);
    expect(typing.lines.map((l) => l.text)).toEqual(['ab']);
    expect(typing.canSkip).toBe(true);
    const done = cutsceneModel({
      ...base,
      scene: v,
      reader: { line: 1, chars: 3, lineDone: true, allDone: true, doneAt: 0 },
    });
    expect(done.choices.map((c) => [c.number, c.confirm])).toEqual([
      [1, false],
      [2, true],
    ]);
    // choices are never skipped
    expect(done.canSkip).toBe(false);
    expect(sceneLengths(v)).toEqual([6, 3]);
    expect(scenePageKey(v)).toBe('cut_test/n1');
    expect(sceneStepKey(v)).toBe('cut_test/n1/2');
  });

  it('uses the still of an illustration, else the vignette; shows busts and the letter', () => {
    const still = sheet('art_bg_cut_test', ['main']);
    const r = resolver([still]);
    const m = cutsceneModel({
      ...base,
      resolver: r,
      scene: scene({ presentation: 'illustration', illustration: 'art_bg_cut_test' }),
      reader: { line: 1, chars: 3, lineDone: true, allDone: true, doneAt: 0 },
      stage: { ...emptyStage(), busts: [{ who: 'eluen', expression: 'smile', side: 'left' }] },
      letter: {
        id: 'ltr_x',
        sender: 'S',
        seal: 'official',
        subject: 'Subj',
        paragraphs: ['p1'],
        delivered: false,
      },
    });
    expect(m.still).toBe('processed/test/art_bg_cut_test.png');
    expect(m.busts).toEqual([
      { who: 'eluen', name: 'ELUEN', expression: 'smile', side: 'left', lit: true },
    ]);
    expect(m.letter?.seal).toBe(t('ui.mode.cutscene.letter.seal.official'));
    expect(m.letter?.paragraphs).toEqual(['p1']);
    const missing = cutsceneModel({
      ...base,
      scene: scene({ presentation: 'illustration', illustration: 'art_bg_cut_missing' }),
      reader: { line: 0, chars: 0, lineDone: false, allDone: false, doneAt: null },
    });
    expect(missing.still).toBeNull();
    expect(missing.presentation).toBe('illustration');
  });

  it('a skip summary is the summary, else the title only', () => {
    expect(summaryCard('cut_x', 'Title', 'What happened')).toEqual({
      title: 'Title',
      text: 'What happened',
    });
    expect(summaryCard('cut_x', 'Title', '').text).toBe('');
  });
});

describe('story controller', () => {
  function rig() {
    const calls: string[] = [];
    const audio: string[] = [];
    const c = new StoryController(
      {
        advanceScene: () => calls.push('advance'),
        advanceLoose: () => calls.push('loose'),
      },
      {
        music: (m) => audio.push(`music:${m.id}`),
        sfx: (id) => audio.push(`sfx:${id}`),
        ambience: (id) => audio.push(`amb:${id}`),
        silence: (s) => audio.push(`silence:${s}`),
        release: () => audio.push('release'),
      },
    );
    const input = (over: Partial<StoryInput>): StoryInput => ({
      now: 0,
      scene: null,
      conversation: null,
      loose: null,
      playerId: 'p',
      speed: 30,
      autoSetting: false,
      calm: false,
      holdToToggle: false,
      skipKeyDown: false,
      resolver: AssetResolver.empty(),
      nameOf: (id) => id,
      letter: (id) => ({
        id,
        sender: 'S',
        seal: 'private',
        subject: 'Sub',
        paragraphs: ['p'],
        delivered: true,
      }),
      talkLayout: () => 'regular',
      talkSpeaker: (cv) => ({ id: cv.npcId, name: cv.name }),
      talkSubtitle: () => '',
      maxSay: 200,
      isBlocked: () => false,
      ...over,
    });
    return { c, calls, audio, input };
  }

  it('reads a node line by line before the press reaches the kernel', () => {
    const { c, input } = rig();
    const v = scene();
    let f = c.frame(input({ scene: v, now: 0 }));
    expect(f.mode).toBe('cutscene');
    expect(f.cutscene?.lines.map((l) => l.text)).toEqual(['']);
    expect(c.press(50, 30)).toBe(true); // completes line 1
    expect(c.press(60, 30)).toBe(true); // shows line 2
    f = c.frame(input({ scene: v, now: 70 }));
    expect(f.cutscene?.lines).toHaveLength(2);
    expect(c.press(10_000, 30)).toBe(false); // read: the kernel advance takes it
  });

  it('enters the stage once per node, sends its sounds and releases the music at the end', () => {
    const { c, audio, input } = rig();
    const v = scene({
      stage: [
        { op: 'music', id: 'mus_x' },
        { op: 'sfx', id: 'sfx_cin_y' },
      ],
    });
    let f = c.frame(input({ scene: v, now: 0 }));
    c.frame(input({ scene: v, now: 10 }));
    expect(audio).toEqual(['music:mus_x', 'sfx:sfx_cin_y']);
    expect(f.audio).toEqual({ music: 'mus_x', layers: 1, silence: false });
    f = c.frame(input({ now: 20 }));
    expect(f.mode).toBe('none');
    expect(audio.at(-1)).toBe('release');
  });

  it('auto advance presses through lines and the node, never through a choice', () => {
    const { c, calls, input } = rig();
    const v = scene({ lines: [{ speakerId: 'n', speakerName: '', text: 'ab', kind: 'narrate' }] });
    c.frame(input({ scene: v, now: 0, autoSetting: true }));
    c.frame(input({ scene: v, now: 100, autoSetting: true }));
    expect(calls).toEqual([]);
    c.frame(input({ scene: v, now: 100 + autoDwellMs(2), autoSetting: true }));
    expect(calls).toEqual(['advance']);
    // once per node
    c.frame(input({ scene: v, now: 9000, autoSetting: true }));
    expect(calls).toEqual(['advance']);
    const choice = scene({
      nodeId: 'n2',
      lines: [{ speakerId: 'n', speakerName: '', text: 'ab', kind: 'narrate' }],
      waiting: 'choice',
      choices: [{ id: 'a', label: 'A' }],
    });
    c.frame(input({ scene: choice, now: 10_000, autoSetting: true }));
    c.frame(input({ scene: choice, now: 60_000, autoSetting: true }));
    expect(calls).toEqual(['advance']);
  });

  it('skips once per node to the next choice, then shows the summary card', () => {
    const { c, calls, input } = rig();
    const n1 = scene({ summary: 'It went so.' });
    c.frame(input({ scene: n1, now: 0 }));
    expect(c.skip(0)).toBe(true);
    c.frame(input({ scene: n1, now: 10 }));
    c.frame(input({ scene: n1, now: 20 }));
    expect(calls).toEqual(['advance']);
    const n2 = scene({ nodeId: 'n2', summary: 'It went so.' });
    c.frame(input({ scene: n2, now: 30 }));
    expect(calls).toEqual(['advance', 'advance']);
    const n3 = scene({
      nodeId: 'n3',
      summary: 'It went so.',
      waiting: 'choice',
      choices: [{ id: 'a', label: 'A' }],
    });
    const f = c.frame(input({ scene: n3, now: 40 }));
    expect(calls).toHaveLength(2);
    expect(c.isSkipping).toBe(false);
    expect(f.summary).toMatchObject({ title: 'Test', text: 'It went so.' });
    // every line of the choice node shows at once; the choices are there
    expect(f.cutscene?.choices.map((x) => x.id)).toEqual(['a']);
    // the card closes on the next press, which the story keeps
    expect(c.press(50, 30)).toBe(true);
    expect(c.frame(input({ scene: n3, now: 60 })).summary).toBeNull();
    // at a read choice there is nothing to skip
    expect(c.skip(70)).toBe(false);
  });

  it('a skip stops at an anchor and at the end of the scene; holding Esc a second skips', () => {
    const { c, calls, input } = rig();
    const n1 = scene();
    c.frame(input({ scene: n1, now: 0, skipKeyDown: true }));
    c.frame(input({ scene: n1, now: SKIP_HOLD_MS, skipKeyDown: true }));
    expect(c.isSkipping).toBe(true);
    expect(calls).toEqual(['advance']);
    const anchor = scene({ nodeId: 'n2', anchor: true });
    const f = c.frame(input({ scene: anchor, now: SKIP_HOLD_MS + 10 }));
    expect(c.isSkipping).toBe(false);
    expect(f.summary?.title).toBe('Test');
    c.press(SKIP_HOLD_MS + 20, 30);
    // skipping into the end of the scene shows the card over the world
    c.skip(SKIP_HOLD_MS + 30);
    const end = c.frame(input({ now: SKIP_HOLD_MS + 40 }));
    expect(end.mode).toBe('none');
    expect(end.summary?.title).toBe('Test');
  });

  it('a letter step stops the lines and auto until a press closes it', () => {
    const { c, calls, input } = rig();
    const v = scene({ stage: [{ op: 'letter', id: 'ltr_a1_count' }] });
    let f = c.frame(input({ scene: v, now: 0, autoSetting: true }));
    expect(f.cutscene?.letter?.subject).toBe('Sub');
    expect(f.cutscene?.lines).toHaveLength(0);
    f = c.frame(input({ scene: v, now: 60_000, autoSetting: true }));
    expect(calls).toEqual([]);
    expect(c.press(60_001, 30)).toBe(true);
    f = c.frame(input({ scene: v, now: 60_002, autoSetting: true }));
    expect(f.cutscene?.letter).toBeNull();
    expect(f.cutscene?.lines.length).toBeGreaterThan(0);
  });

  it('toggles hidden text and the backlog; Esc closes them first', () => {
    const { c, input } = rig();
    c.feed([
      ev('scene.started', { sceneId: 'cut_test', title: 'Test' }),
      ev('dialogue.line', { speakerId: 'n', speakerName: '', text: 'abcdef', kind: 'narrate' }),
    ]);
    const v = scene();
    c.frame(input({ scene: v, now: 0 }));
    expect(c.toggleHidden()).toBe(true);
    expect(c.frame(input({ scene: v, now: 1 })).cutscene?.hidden).toBe(true);
    expect(c.back()).toBe(true);
    expect(c.toggleBacklog()).toBe(true);
    const f = c.frame(input({ scene: v, now: 2 }));
    expect(f.backlog?.entries.map((e) => e.kind)).toEqual(['title', 'line']);
    expect(c.press(3, 30)).toBe(true);
    expect(c.frame(input({ scene: v, now: 4 })).backlog).toBeNull();
    expect(c.back()).toBe(false);
  });

  it('shows a refused free text under the input until the next accepted one', () => {
    const { c, input } = rig();
    const conv = talk();
    c.frame(input({ conversation: conv, now: 0 }));
    c.feed([
      ev('command.result', {
        kind: 'dialogue.say',
        ok: false,
        code: 'too_long',
        reason: 'too long',
        source: { type: 'player' },
      }),
    ]);
    let f = c.frame(input({ conversation: conv, now: 10 }));
    expect(f.mode).toBe('dialogue');
    expect(f.dialogue?.rejected).toBe('too long');
    c.feed([ev('command.result', { kind: 'dialogue.say', ok: true, source: { type: 'player' } })]);
    f = c.frame(input({ conversation: conv, now: 20 }));
    expect(f.dialogue?.rejected).toBe('');
    expect(f.dialogue?.said).toBe(1);
  });

  it('types a loose line and advances it on auto', () => {
    const { c, calls, input } = rig();
    const line: DialogueLine = { speakerId: 'g', speakerName: 'G', text: 'abc', kind: 'divine' };
    let f = c.frame(input({ loose: line, now: 0 }));
    expect(f.dialogue?.typing).toBe(true);
    // a loose line sits over the field: the HUD does not collapse for it (5.1)
    expect(f.mode).toBe('none');
    expect(c.press(10, 30)).toBe(true);
    expect(c.press(20, 30)).toBe(false);
    c.toggleAuto(); // no story surface yet for the toggle: stays off
    f = c.frame(input({ loose: line, now: 30, autoSetting: true }));
    c.frame(input({ loose: line, now: 30 + autoDwellMs(3) + 1, autoSetting: true }));
    expect(calls).toEqual(['loose']);
  });
});

describe('AI block list (ux 7.3)', () => {
  it('blocks once, keeps a bounded record and survives a reload', () => {
    const kv = new Map<string, string>();
    const store = {
      getItem: (k: string) => kv.get(k) ?? null,
      setItem: (k: string, v: string) => void kv.set(k, v),
    };
    const a = new AiFlagStore(store, () => '2026-11-17T00:00:00.000Z');
    expect(a.block('ron|hi')).toBe(true);
    expect(a.block('ron|hi')).toBe(false);
    expect(a.isBlocked('ron|hi')).toBe(true);
    expect(a.list()[0]).toEqual({
      sig: 'ron|hi',
      speaker: 'ron',
      text: 'hi',
      at: '2026-11-17T00:00:00.000Z',
    });
    const b = new AiFlagStore(store, () => '');
    expect(b.isBlocked('ron|hi')).toBe(true);
    for (let i = 0; i < AI_FLAGS_LIMIT + 5; i++) b.block(`x|${i}`);
    expect(b.list()).toHaveLength(AI_FLAGS_LIMIT);
    kv.set(AI_FLAGS_KEY, '{broken');
    expect(new AiFlagStore(store, () => '').list()).toEqual([]);
    expect(new AiFlagStore(null, () => '').block('a|b')).toBe(true);
  });
});

describe('scene view presentation fields', () => {
  it('a scene without presentation data plays as theater with no stage', () => {
    const engine = createGame({ seed: 20261115 });
    const view = createGameView(engine);
    engine.step(3);
    // the prologue's and act 1's scenes carry their presentation (PK-M1-27, PK-M1-34); act 2's
    // intro has none yet
    engine.world.slices.scenes.current = null;
    engine.world.slices.scenes.queue = [];
    engine.queue('scenes.start', { sceneId: 'act2_intro' });
    engine.step(1);
    const sv = createAdapters().scene?.scene(view);
    expect(sv?.sceneId).toBe('act2_intro');
    expect(sv).toMatchObject({ presentation: 'theater', illustration: null, anchor: false });
    expect(sv?.stage).toEqual([]);
    expect(typeof sv?.summary).toBe('string');
  });
});
