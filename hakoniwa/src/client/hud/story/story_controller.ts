// The story controller of `ui_mode_dialogue` and `ui_mode_cutscene` (ux_and_onboarding.md 7,
// 8): owns the reading state the session keeps between frames (the typewriters, the backlog,
// the stage, auto advance, hidden text, the open backlog, the letter step, the skip and its
// summary card, the last refused free text) and turns the world's story views into the two
// panel models each frame. Advance presses go through `press` first (typing lines complete,
// the next line of a node shows, a letter or a card closes) and only reach the kernel when the
// page is read. Skipping advances the scene once per node until a choice, free input, court,
// an anchor or the scene's end, then shows the summary card (choices are never skipped).
// Pure: no DOM, the clock is passed in; the session supplies the views and the actions.

import type { AnyWorldEvent, FlagValue } from '../../../core/contracts';
import type { TextParam } from '../../../core/text';
import { t } from '../../../shared_ui/i18n';
import type { SceneView } from '../../../systems/scenes';
import type { TextSpeed } from '../../app/settings_schema';
import type { AssetResolver } from '../../assets/resolver';
import type { ListenTier } from '../../audio/spatializer';
import type { ConversationView } from '../../view/adapters';
import { contentNames } from '../../view/content_names';
import type { DialogueLine } from '../dialogue_queue';
import { Backlog, type BacklogEntry, conversationBacklog } from './backlog';
import {
  type CutsceneModel,
  cutsceneModel,
  sceneLengths,
  scenePageKey,
  sceneStepKey,
  summaryCard,
} from './cutscene_model';
import { type DialogueModel, looseModel, talkLengths, talkModel } from './dialogue_model';
import type { LetterCard } from './letter_card';
import type { SpeakerRef } from './portrait_plan';
import { AutoAdvance, HoldWatch, LineReader, textLength } from './reading';
import {
  applyStage,
  type CutsceneAudio,
  cutsceneDirectorInput,
  emptyStage,
  enterNode,
  playAudio,
  type StageState,
} from './stage';
import { StageTimeline } from './stage_timeline';

export interface StoryActions {
  /** queue scenes.advance */
  advanceScene(): void;
  /** show the next loose line */
  advanceLoose(): void;
}

export interface StoryInput {
  now: number;
  scene: SceneView | null;
  conversation: ConversationView | null;
  loose: DialogueLine | null;
  playerId: string;
  speed: TextSpeed;
  /** the auto-advance setting (gameplay page) */
  autoSetting: boolean;
  /** reduce flashing and shaking (drops @shake, 13.8) */
  calm: boolean;
  /** hold-to-toggle (18.5): a tap of the skip key skips */
  holdToToggle: boolean;
  /** Esc or the pad's back button is down this frame (the skip hold) */
  skipKeyDown: boolean;
  resolver: AssetResolver;
  /** Current region's backdrop, when available, for a missing illustration. */
  backdrop?: string | null;
  /** a person's display name (bust plates) */
  nameOf: (id: string) => string;
  /** a letter step's card */
  letter: (id: string) => LetterCard | null;
  /** the talk partner's portrait inputs */
  talkLayout: (c: ConversationView) => 'regular' | 'story';
  talkSpeaker: (c: ConversationView) => SpeakerRef;
  talkSubtitle: (c: ConversationView) => string;
  maxSay: number;
  isBlocked: (sig: string) => boolean;
  /**
   * The world stands still (paused, or held by settings, saves, the menu, help or a confirm,
   * 1.3): auto advance waits, so nothing moves on behind the player's back.
   */
  held?: boolean;
  /** the world's flags (the prologue's door counter and eavesdrop level, PK-M1-54) */
  flags?: Readonly<Record<string, FlagValue>>;
  /**
   * A roam node of the scene now playing (onboarding_interaction.md 5.3), when `scene` is null
   * because the player walks: no panel, but the run's stage and music stay.
   */
  roam?: SceneView | null;
}

export interface SummaryModel {
  title: string;
  text: string;
  hint: string;
}

export interface BacklogModel {
  title: string;
  entries: { kind: BacklogEntry['kind']; speaker: string; text: string; lineKind: string }[];
  hint: string;
}

export interface StoryFrame {
  /** what the HUD collapses for (5.1) */
  mode: 'cutscene' | 'dialogue' | 'none';
  cutscene: CutsceneModel | null;
  dialogue: DialogueModel | null;
  summary: SummaryModel | null;
  backlog: BacklogModel | null;
  /** the audio director's cutscene input */
  audio: { music: string | null; layers: number; silence: boolean } | null;
  /** the eavesdropping tier for the audio (prologue P5), null when nobody listens */
  listen: ListenTier | null;
}

/** A conversation's refused free text: the reason, shown until the next say or a new talk. */
interface Refusal {
  npcId: string;
  reason: TextParam;
}

export class StoryController {
  private readonly backlog = new Backlog();
  private readonly sceneReader = new LineReader('sequence');
  private readonly talkReader = new LineReader('tail');
  private readonly looseReader = new LineReader('sequence');
  private readonly auto = new AutoAdvance(false);
  private readonly skipHold = new HoldWatch();
  private stage: StageState = emptyStage();
  private readonly stageTimeline = new StageTimeline();
  /** scene run and node the stage was last entered for */
  private stageKey = '';
  private sceneId = '';
  private hidden = false;
  private backlogOpen = false;
  private letterOpen: string | null = null;
  private skipping: {
    sceneId: string;
    title: string;
    summary: string;
    segment: string;
    from: string;
  } | null = null;
  private skipQueued = '';
  private summary: { title: string; text: string } | null = null;
  private autoFired = '';
  private refusal: Refusal | null = null;
  /** free texts the dialogue accepted (the panel clears its line when this grows) */
  private said = 0;
  private lastTalk = '';
  private lastScene: SceneView | null = null;
  private lastTalkView: ConversationView | null = null;
  private autoSetting = false;

  constructor(
    private readonly actions: StoryActions,
    private readonly audio: CutsceneAudio,
  ) {}

  /** Feed the world's events (backlog, refusals). */
  feed(events: readonly AnyWorldEvent[]): void {
    this.backlog.feed(events);
    for (const ev of events) {
      if (ev.kind === 'command.result' && ev.data.kind === 'dialogue.say') {
        if (ev.data.source.type !== 'player') continue;
        if (ev.data.ok) {
          this.refusal = null;
          this.said++;
        } else if (ev.data.reason !== undefined)
          this.refusal = { npcId: this.lastTalk, reason: ev.data.reason };
      } else if (ev.kind === 'dialogue.opened' || ev.kind === 'dialogue.closed') {
        this.refusal = null;
      } else if (ev.kind === 'player.said' && ev.data.toId) {
        // a new say clears an old refusal (a refused one emits no player.said)
        this.refusal = null;
      }
    }
  }

  // -------------------------------------------------------------------------
  // presses and toggles

  /**
   * An advance press (Space, Enter, A, a click). True when the story used it: a card or the
   * backlog closed, hidden text came back, a letter closed, a line completed or the next line
   * of the node showed. False hands it on (the kernel advance, the option cursor).
   */
  press(now: number, speed: TextSpeed): boolean {
    if (this.summary) {
      this.summary = null;
      return true;
    }
    if (this.backlogOpen) {
      this.backlogOpen = false;
      return true;
    }
    if (this.hidden) {
      this.hidden = false;
      return true;
    }
    if (this.lastScene) {
      if (this.letterOpen) {
        this.letterOpen = null;
        return true;
      }
      const r = this.sceneReader.press(now, speed);
      if (r !== 'end') this.auto.manualPress();
      return r !== 'end';
    }
    if (this.lastTalkView) {
      const s = this.talkReader.state(now, speed);
      if (!s.lineDone) {
        this.talkReader.press(now, speed);
        return true;
      }
      return false;
    }
    const s = this.looseReader.state(now, speed);
    if (!s.lineDone) {
      this.looseReader.press(now, speed);
      return true;
    }
    return false;
  }

  /** Esc or B: close the summary, the backlog or show hidden text first. */
  back(): boolean {
    if (this.summary) {
      this.summary = null;
      return true;
    }
    if (this.backlogOpen) {
      this.backlogOpen = false;
      return true;
    }
    if (this.hidden) {
      this.hidden = false;
      return true;
    }
    return false;
  }

  /** Something the story owns is showing over the world (the summary card). */
  get cardOpen(): boolean {
    return !!this.summary;
  }

  /**
   * The stage standing in the scene now playing (camera, light, weather, mirror and motion
   * directives for the world picture, PK-M1-24), or null outside scenes.
   */
  stageNow(): StageState | null {
    return this.sceneId ? this.stage : null;
  }

  toggleAuto(): boolean {
    if (!this.lastScene && !this.lastTalkView) return false;
    this.auto.toggle();
    return true;
  }

  toggleHidden(): boolean {
    if (!this.lastScene) return false;
    this.hidden = !this.hidden;
    return true;
  }

  toggleBacklog(): boolean {
    if (!this.lastScene && !this.lastTalkView) return false;
    this.backlogOpen = !this.backlogOpen;
    return true;
  }

  /** Start skipping the playing scene (ux 8.3); false when nothing can be skipped. */
  skip(now: number): boolean {
    const v = this.lastScene;
    // an interface the scene opened (the spirit mirror) is the player's to close, not to skip
    if (!v || this.skipping || v.waiting === 'ui') return false;
    const atChoice = v.waiting === 'choice' || v.waiting === 'input' || v.waiting === 'court';
    if (atChoice && this.sceneReader.state(now, 'instant').allDone) return false;
    // a multi-segment scene's card tells the segment (catalog_cutscenes.md 13.3)
    this.skipping = {
      sceneId: v.sceneId,
      title: v.title,
      summary: v.segmentSummary || v.summary,
      segment: v.segmentSummary && v.segment ? v.segment : '',
      from: `${v.sceneId}/${v.nodeId}`,
    };
    this.skipQueued = '';
    this.hidden = false;
    this.backlogOpen = false;
    this.letterOpen = null;
    return true;
  }

  get isSkipping(): boolean {
    return !!this.skipping;
  }

  // -------------------------------------------------------------------------
  // frame

  frame(i: StoryInput): StoryFrame {
    if (i.autoSetting !== this.autoSetting) {
      this.autoSetting = i.autoSetting;
      this.auto.setEnabled(i.autoSetting);
    }
    const v = i.scene;
    this.lastScene = v;
    this.lastTalkView = v ? null : i.conversation;
    if (v) return this.sceneFrame(i, v);
    if (i.roam) return this.roamFrame(i, i.roam);
    this.endScene();
    if (i.conversation) return this.talkFrame(i, i.conversation);
    if (i.loose) return this.looseFrame(i, i.loose);
    this.talkReader.reset();
    this.looseReader.reset();
    this.backlogOpen = false;
    return {
      mode: 'none',
      cutscene: null,
      dialogue: null,
      summary: this.summaryModel(),
      backlog: null,
      audio: null,
      listen: null,
    };
  }

  private endScene(): void {
    if (this.skipping) {
      // the scene ended under the skip: the card tells what was skipped
      this.summary = summaryCard(
        this.skipping.sceneId,
        this.skipping.title,
        this.skipping.summary,
        this.skipping.segment,
      );
      this.skipping = null;
    }
    if (this.sceneId) {
      this.sceneId = '';
      this.stage = emptyStage();
      this.stageKey = '';
      this.sceneReader.reset();
      this.autoFired = '';
      this.letterOpen = null;
      this.hidden = false;
      this.backlogOpen = false;
      this.hidden = false;
      this.audio.release();
    }
  }

  /**
   * A roam node (onboarding_interaction.md 5.3): the player walks, so there is no panel and the
   * camera is the player's own, but the run goes on: its light, weather, music and listening
   * stay, and the roam node's own sound directives play once each time the run comes back to it.
   */
  private roamFrame(i: StoryInput, v: SceneView): StoryFrame {
    const run = `${v.sceneId}#${v.runId}`;
    if (run !== this.sceneId) {
      // a run that opens on a roam node starts its stage here
      if (this.sceneId) this.audio.release();
      this.sceneId = run;
      this.stage = emptyStage();
      this.stageKey = '';
      this.sceneReader.reset();
    }
    const nodeKey = `${v.sceneId}/${v.nodeId}`;
    if (nodeKey !== this.stageKey) {
      this.stageKey = nodeKey;
      const entered = enterNode(this.stage, this.stageTimeline.begin(v.stage), i.now, i.calm);
      // the player walks: the camera is theirs until the next node frames a shot again
      this.stage = { ...entered.state, camera: null };
      playAudio(this.audio, entered.audio);
    }
    this.backlogOpen = false;
    return {
      mode: 'none',
      cutscene: null,
      dialogue: null,
      summary: this.summaryModel(),
      backlog: null,
      audio: cutsceneDirectorInput(true, this.stage, i.now),
      listen: null,
    };
  }

  private summaryModel(): SummaryModel | null {
    if (!this.summary) return null;
    return { ...this.summary, hint: t('ui.mode.cutscene.summary_close') };
  }

  private sceneFrame(i: StoryInput, v: SceneView): StoryFrame {
    const now = i.now;
    // a new run starts the stage afresh, also a restart of the same scene (re-chosen opening)
    const run = `${v.sceneId}#${v.runId}`;
    if (run !== this.sceneId) {
      if (this.sceneId) this.audio.release();
      this.sceneId = run;
      this.stage = emptyStage();
      this.stageKey = '';
      this.sceneReader.reset();
      this.autoFired = '';
      this.letterOpen = null;
      this.hidden = false;
      this.backlogOpen = false;
    }
    let skipCues = !!this.skipping;
    // Enter once, then release timed cues from the reader's cursor below.
    const nodeKey = `${v.sceneId}/${v.nodeId}`;
    if (nodeKey !== this.stageKey) {
      this.stageKey = nodeKey;
      const entered = enterNode(
        this.stage,
        this.stageTimeline.begin(v.stage),
        now,
        i.calm || skipCues,
      );
      this.stage = entered.state;
      if (!this.skipping) playAudio(this.audio, entered.audio);
      else
        playAudio(
          this.audio,
          entered.audio.filter((c) => c.op === 'music'),
        );
      // a skip reads past letters (they are no choice and no anchor)
      this.letterOpen = this.skipping ? null : this.stage.letter;
    }
    let letter = this.letterOpen ? i.letter(this.letterOpen) : null;
    if (this.letterOpen && !letter) this.letterOpen = null;
    // While the letter is read the lines wait; they type afresh once it closes.
    const letterMark = this.letterOpen ? '|letter' : '';
    const pageKey = `${scenePageKey(v)}${letterMark}`;
    const stepKey = `${sceneStepKey(v)}${letterMark}`;
    this.sceneReader.sync(pageKey, this.letterOpen ? [] : sceneLengths(v), now);
    const held = this.skipHold.update(i.skipKeyDown, now, i.holdToToggle);
    if (held) this.skip(now);
    skipCues ||= !!this.skipping;
    if (this.skipping) this.skipStep(v, now);
    if (this.skipping) this.sceneReader.completeAll(now);
    const reader = this.sceneReader.state(now, i.speed);
    if (!i.held) this.stageAtReader(now, i.speed, i.calm, skipCues, v.waiting === 'resolve');
    letter = this.letterOpen ? i.letter(this.letterOpen) : null;
    if (!letter) this.letterOpen = null;
    // Auto advance: never through choices, input, letters or the backlog (13.2).
    const waitsForPlayer = v.waiting !== 'advance';
    // a fade covers the text: auto advance waits until it lifts (13.2)
    const fading = !!this.stage.fade && this.stage.fade.until > now;
    const stop =
      !!this.letterOpen ||
      this.hidden ||
      this.backlogOpen ||
      !!this.summary ||
      !!this.skipping ||
      fading ||
      !!i.held;
    const curLen = v.lines[reader.line] ? textLength(t(v.lines[reader.line]?.text ?? '')) : 0;
    if (this.auto.due(now, reader.doneAt, curLen, stop)) {
      if (!reader.allDone) this.sceneReader.press(now, i.speed);
      else if (!waitsForPlayer && this.autoFired !== stepKey) {
        this.autoFired = stepKey;
        this.actions.advanceScene();
      }
      // Auto may have exposed a new line on this very frame. Its picture and sound start
      // with it, rather than one frame later (a screenshot may already show that line).
      this.stageAtReader(now, i.speed, i.calm, skipCues, v.waiting === 'resolve');
      letter = this.letterOpen ? i.letter(this.letterOpen) : null;
      if (!letter) this.letterOpen = null;
    }
    if (i.calm && (this.stage.transition || this.stage.shake))
      this.stage = { ...this.stage, transition: null, shake: 0 };
    const model = cutsceneModel({
      scene: v,
      reader: this.sceneReader.state(now, i.speed),
      stage: this.stage,
      now,
      resolver: i.resolver,
      backdrop: i.backdrop,
      playerId: i.playerId,
      nameOf: i.nameOf,
      letter,
      hidden: this.hidden,
      auto: this.auto.active,
      skipping: !!this.skipping,
      skipHold: this.skipHold.progress(now),
      isBlocked: i.isBlocked,
      flags: i.flags,
    });
    return {
      mode: 'cutscene',
      cutscene: model,
      dialogue: null,
      summary: this.summaryModel(),
      backlog: this.backlogOpen ? this.sceneBacklog() : null,
      audio: cutsceneDirectorInput(true, this.stage, now),
      listen: model.listen,
    };
  }

  /** Release exactly the cues reached by the current reading cursor. */
  private stageAtReader(
    now: number,
    speed: TextSpeed,
    calm: boolean,
    skipping: boolean,
    pendingReply: boolean,
  ): void {
    if (this.letterOpen) return;
    const reader = this.sceneReader.state(now, speed);
    const due = this.stageTimeline.take(reader.line, reader.allDone && !pendingReply);
    if (!due.length) return;
    const applied = applyStage(this.stage, due, now, calm || skipping);
    this.stage = applied.state;
    playAudio(this.audio, skipping ? applied.audio.filter((c) => c.op === 'music') : applied.audio);
    if (!skipping && due.some((d) => d.op === 'letter')) this.letterOpen = this.stage.letter;
  }

  /** One skip step: advance once per node until something the player must see. */
  private skipStep(v: SceneView, now: number): void {
    const sk = this.skipping;
    if (!sk) return;
    const here = `${v.sceneId}/${v.nodeId}`;
    const stopHere =
      v.sceneId !== sk.sceneId ||
      v.waiting === 'choice' ||
      v.waiting === 'input' ||
      v.waiting === 'court' ||
      // an interface the scene opened (the spirit mirror) is the player's, like a choice
      v.waiting === 'ui' ||
      (v.anchor && here !== sk.from);
    if (stopHere) {
      this.summary = summaryCard(sk.sceneId, sk.title, sk.summary, sk.segment);
      this.skipping = null;
      this.sceneReader.completeAll(now);
      return;
    }
    if (v.waiting !== 'advance') return; // waiting for a model reply: hold on
    const key = sceneStepKey(v);
    if (this.skipQueued === key) return;
    this.skipQueued = key;
    this.actions.advanceScene();
  }

  private sceneBacklog(): BacklogModel {
    return {
      title: t('ui.mode.cutscene.backlog'),
      entries: this.backlog.list().map((e) => ({
        kind: e.kind,
        speaker: t(e.speaker),
        text:
          e.kind === 'title' && e.sceneId
            ? contentNames.sceneTitle(e.sceneId, t(e.text))
            : t(e.text),
        lineKind: e.lineKind ?? '',
      })),
      hint: t('ui.mode.cutscene.backlog_close'),
    };
  }

  private talkFrame(i: StoryInput, c: ConversationView): StoryFrame {
    this.lastTalk = c.npcId;
    this.talkReader.sync(`talk|${c.npcId}`, talkLengths(c), i.now);
    const reader = this.talkReader.state(i.now, i.speed);
    const refused = this.refusal && this.refusal.npcId === c.npcId ? t(this.refusal.reason) : '';
    const model = talkModel({
      conv: c,
      reader,
      layout: i.talkLayout(c),
      speaker: i.talkSpeaker(c),
      playerId: i.playerId,
      subtitle: i.talkSubtitle(c),
      maxSay: i.maxSay,
      rejected: refused,
      said: this.said,
      isBlocked: i.isBlocked,
    });
    return {
      mode: 'dialogue',
      cutscene: null,
      dialogue: model,
      summary: this.summaryModel(),
      backlog: this.backlogOpen
        ? {
            title: t('ui.mode.dialogue.backlog'),
            entries: conversationBacklog(c.lines).map((e) => ({
              kind: e.kind,
              speaker: t(e.speaker),
              text: t(e.text),
              lineKind: e.lineKind ?? '',
            })),
            hint: t('ui.mode.cutscene.backlog_close'),
          }
        : null,
      audio: null,
      listen: null,
    };
  }

  private looseFrame(i: StoryInput, line: DialogueLine): StoryFrame {
    const text = t(line.text);
    this.looseReader.sync(`loose|${line.speakerId}|${text}`, [textLength(text)], i.now);
    const reader = this.looseReader.state(i.now, i.speed);
    const key = this.looseReader.pageKey;
    if (this.auto.due(i.now, reader.doneAt, textLength(text), !!i.held) && this.autoFired !== key) {
      this.autoFired = key;
      this.actions.advanceLoose();
    }
    return {
      // a loose line (a goddess's word, narration, a bark to the player) sits over the field:
      // the HUD stays whole, only a conversation collapses it (ux_and_onboarding.md 5.1)
      mode: 'none',
      cutscene: null,
      dialogue: looseModel(line, reader),
      summary: this.summaryModel(),
      backlog: null,
      audio: null,
      listen: null,
    };
  }
}
