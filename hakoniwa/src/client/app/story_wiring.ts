// The session's story wiring (`ui_mode_dialogue`, `ui_mode_cutscene`; ux_and_onboarding.md 7,
// 8): one StoryController and the handlers the story painters call, fed with the world's
// views, the reading settings (text speed, auto advance), the skip hold (Esc or the pad's back
// button), the speakers' portraits and the audio seam. The session calls `frame` every
// animation frame (the typewriter runs on real time, outside the 20 Hz world) and `feed` with
// the world's events. The prologue's staging (PK-M1-54) rides along: the eavesdropping tier
// goes to the audio (`setListenTier`), "re-choose the opening" queues `scenes.restart`, and the
// interfaces a scene's `ui` effect opens (the spirit mirror) run in creator_wiring.ts. Thin
// glue: the rules live in src/client/hud/story/ and src/client/hud/creator/.

import { contentKey } from '../../core/content_key';
import { t, tOr } from '../../shared_ui/i18n';
import { installedResolver } from '../assets/runtime';
import type { GameAudio } from '../audio';
import { confirmOpen } from '../hud/confirm_pop';
import type { DialogueQueue } from '../hud/dialogue_queue';
import type { Hud } from '../hud/hud';
import {
  type CutsceneAudio,
  dialogueLayout,
  letterCard,
  type SpeakerRef,
  StoryController,
  type StoryFrame,
  type StoryHandlers,
} from '../hud/story';
import { AiFlagStore } from '../hud/story/ai_flags';
import { pickable } from '../hud/story/cutscene_model';
import { askConfirmChoice } from '../hud/story/cutscene_player';
import type { InputDevice } from '../input/device';
import { readGamepad } from '../input/gamepad_poller';
import { lookFromEntity } from '../sprites/look';
import { portraitCanvas, type SpriteCache } from '../sprites/sprite_cache';
import type { ClientAdapters, ConversationView } from '../view/adapters';
import type { ClientCommand, GameView } from '../view/game_view';
import { CreatorWiring } from './creator_wiring';
import type { SyncSettings } from './settings_schema';

/** What player_input.ts asks of the story (the advance press, Esc, the dialogue actions). */
export interface StoryInputHost {
  /** an advance press: true when the story used it (typing, the next line, a card) */
  press(): boolean;
  /** Esc or B: close the backlog, the summary card or show hidden text first */
  back(): boolean;
  /** Esc or B closed something else (a window): that press starts no skip hold */
  spendBack(): void;
  /** recall, auto_advance, hide_text */
  action(action: string): boolean;
  /** the scene's choices are on screen (they wait until the node's lines are read) */
  sceneChoicesShown(): boolean;
  /** pick a scene choice; irreversible ones are confirmed first */
  chooseScene(choiceId: string): void;
  /** a dialogue action while the spirit mirror is open; true when the mirror took it */
  creatorAction(action: string, device: InputDevice): boolean;
}

export interface StoryWiringDeps {
  view: GameView;
  adapters: ClientAdapters;
  loose: DialogueQueue;
  sprites: SpriteCache;
  hud: () => Hud | undefined;
  sync: () => Readonly<SyncSettings>;
  audio: () => GameAudio | undefined;
  queue(cmds: readonly ClientCommand[] | null | undefined): void;
  /** player_input's advance (scene, option cursor, loose lines) */
  advance(): void;
  closeConversation(): void;
  /** the page's key-value store for the block list (null: memory only) */
  storage: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null;
  /** the world stands still (paused, or a window or popup holds it): auto advance waits */
  held?: () => boolean;
}

/** Person tables a speaker id may name, for bust plates. */
const PERSON_TABLES = ['npcs', 'companions', 'goddesses', 'sceneSpeakers'] as const;

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class StoryWiring implements StoryInputHost {
  readonly controller: StoryController;
  readonly handlers: StoryHandlers;
  /** blocked model lines (7.3); not world flags */
  readonly blocked: AiFlagStore;
  private escDown = false;
  /** this Esc press, or this hold of the pad's back button, already closed something */
  private escSpent = false;
  private padSpent = false;
  /** looks by appearance (lookFromEntity allocates; a talk reads its speaker every frame) */
  private readonly looks = new WeakMap<object, ReturnType<typeof lookFromEntity>>();
  private lastAudio = '';
  private choicesShown = false;
  /** the last frame showed nothing: an empty world skips the next ones */
  private idle = false;
  /** the eavesdropping tier last handed to the audio */
  private listenTier: string | null = null;
  /** the last cutscene frame had every line of its node shown */
  private linesRead = true;
  /** the spirit mirror and the other `ui` interfaces (built once the HUD exists) */
  private creator: CreatorWiring | null = null;
  private readonly onKey = (ev: KeyboardEvent) => {
    if (ev.code !== 'Escape') return;
    // an Esc that answers the confirm popup never starts a skip hold
    if (ev.type === 'keydown' && confirmOpen()) return;
    this.escDown = ev.type === 'keydown';
    if (!this.escDown) this.escSpent = false;
  };
  private readonly onBlur = () => {
    this.escDown = false;
    this.escSpent = false;
  };

  constructor(private readonly d: StoryWiringDeps) {
    this.blocked = new AiFlagStore(d.storage, () => new Date().toISOString());
    const sink: CutsceneAudio = {
      music: (c) => {
        // a motif laid over the running bed (2.7 `@乐 … 叠`); beds go through setCutscene
        if (c.mode === 'layer') d.audio()?.playStinger(c.id);
      },
      sfx: (id) => d.audio()?.playSound(id, { group: 'cine' }),
      // no ambience override in the audio API yet: the location's beds keep playing (13.5)
      ambience: () => {},
      // a written silence reaches the audio through the director input of every frame
      silence: () => {},
      release: () => {
        this.lastAudio = '';
        d.audio()?.setCutscene(null);
      },
    };
    this.controller = new StoryController(
      {
        advanceScene: () => d.queue(d.adapters.scene?.advance(d.view)),
        advanceLoose: () => d.advance(),
      },
      sink,
    );
    const a = d.adapters;
    this.handlers = {
      choose: (id) => d.queue(a.conversation?.choose(d.view, id)),
      say: (text) => d.queue(a.conversation?.say(d.view, text)),
      leave: () => d.closeConversation(),
      advance: () => d.advance(),
      chooseScene: (id) => d.queue(a.scene?.choose(d.view, id)),
      submitScene: (text) => d.queue(a.scene?.input(d.view, text)),
      restartScene: () => d.queue([{ kind: 'scenes.restart', data: {} }]),
      skip: () => {
        this.controller.skip(performance.now());
        this.frame(performance.now());
      },
      toggleAuto: () => this.toggle(() => this.controller.toggleAuto()),
      toggleHidden: () => this.toggle(() => this.controller.toggleHidden()),
      toggleBacklog: () => this.toggle(() => this.controller.toggleBacklog()),
      closeCard: () => this.toggle(() => this.controller.back()),
      block: (sig) => this.toggle(() => this.blocked.block(sig)),
    };
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
    window.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    this.creator?.dispose();
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKey, true);
    window.removeEventListener('blur', this.onBlur);
  }

  private toggle(f: () => boolean): void {
    if (f()) this.frame(performance.now());
  }

  /** The standee crop of a speaker's entity (the portrait fallback, art_pipeline 3.6). */
  crop = (entityId: string, size: number): HTMLCanvasElement | null => {
    const e = this.d.view.entity(entityId);
    return e ? portraitCanvas(this.d.sprites, lookFromEntity(e), size) : null;
  };

  private speaker(c: ConversationView): SpeakerRef {
    const e = this.d.view.entity(c.npcId);
    let look = e ? this.looks.get(e.appearance) : undefined;
    if (e && !look) {
      look = lookFromEntity(e);
      this.looks.set(e.appearance, look);
    }
    const art = look?.art;
    return {
      id: e?.ref ?? '',
      name: c.name,
      art: art ? { portrait: art.portrait, bust: art.bust } : undefined,
      entityId: e ? c.npcId : null,
    };
  }

  private nameOf(id: string): string {
    const content = this.d.view.content as unknown as Record<string, unknown>;
    for (const table of PERSON_TABLES) {
      const rows = content[table];
      if (!Array.isArray(rows)) continue;
      const rec = (rows as { id: string; name?: string }[]).find((r) => r.id === id);
      if (rec) return tOr(contentKey(table, id, 'name'), rec.name ?? id);
    }
    return id;
  }

  private padBackDown(swap: boolean): boolean {
    const pad = readGamepad();
    return (pad?.buttons[swap ? 0 : 1] ?? 0) > 0.5;
  }

  /**
   * The skip hold (8.2, hold Esc or B for a second) counts only a press that closed nothing:
   * an Esc or B that shut the backlog, the summary card, hidden text or a window starts no skip,
   * however long it is held. The mark clears when the key or button is let go.
   */
  private skipHeld(swap: boolean): boolean {
    const pad = this.padBackDown(swap);
    if (!pad) this.padSpent = false;
    return (this.escDown && !this.escSpent) || (pad && !this.padSpent);
  }

  /** Esc or B was used to close something (a window, an overlay): it starts no skip hold. */
  spendBack(): void {
    this.escSpent = this.escDown;
    this.padSpent = true;
  }

  /** The stage of the scene now playing, for the world picture (null outside scenes). */
  stage(): ReturnType<StoryController['stageNow']> {
    return this.controller.stageNow();
  }

  /** Build and paint one story frame. */
  frame(now: number): StoryFrame | null {
    const hud = this.d.hud();
    if (!hud) return null;
    const v = this.d.view;
    const a = this.d.adapters;
    const scene = a.scene?.scene(v) ?? null;
    this.creator ??= new CreatorWiring({
      view: v,
      sprites: this.d.sprites,
      queue: (c) => this.d.queue(c),
      mount: (node) => hud.story.overlay.append(node),
    });
    // the mirror opens once the node's lines are read (a node's own ui effect speaks first)
    this.creator.frame(scene, this.linesRead);
    const conversation = a.conversation?.conversation(v) ?? null;
    const loose = this.d.loose.current;
    // Nothing to tell and nothing left on screen: no frame to build (this runs every animation
    // frame, 22), until a scene, a talk or a loose line arrives or a key asks for a frame.
    if (!scene && !conversation && !loose && this.idle) return null;
    const s = this.d.sync();
    const resolver = installedResolver();
    const flash = s.accessibility.reduceFlashing;
    const f = this.controller.frame({
      now,
      scene,
      conversation,
      loose,
      playerId: v.playerId(),
      speed: s.gameplay.textSpeed,
      autoSetting: s.gameplay.autoAdvance,
      calm: flash === 'on' || (flash === 'system' && reducedMotion()),
      holdToToggle: s.accessibility.holdToToggle,
      skipKeyDown: this.skipHeld(s.input.swapConfirmBack),
      resolver,
      nameOf: (id) => this.nameOf(id),
      letter: (id) => letterCard(v.world as never, v.content as never, id),
      talkLayout: (c) => dialogueLayout(resolver, this.speaker(c)),
      talkSpeaker: (c) => this.speaker(c),
      talkSubtitle: (c) => a.unitFrames?.unitFrame(v, c.npcId, v.playerId())?.subtitle ?? '',
      maxSay: a.conversation?.maxSay ?? 200,
      isBlocked: (sig) => this.blocked.isBlocked(sig),
      held: this.d.held?.() ?? false,
      flags: v.world.meta.flags,
    });
    hud.story.paint(f);
    this.linesRead = !f.cutscene || f.cutscene.linesDone;
    // the eavesdropping distance (prologue P5): the curtain's voices and the antechamber's L2
    const audio = this.d.audio();
    if (audio && f.listen !== this.listenTier) {
      this.listenTier = f.listen;
      audio.setListenTier(f.listen);
    }
    this.idle = f.mode === 'none' && !f.dialogue && !f.cutscene && !f.summary && !f.backlog;
    // what the player can pick right now: choices and key prompts show once the lines are read
    this.choicesShown = pickable(f.cutscene);
    const sig = f.audio ? `${f.audio.music}|${f.audio.layers}|${f.audio.silence}` : '';
    if (sig !== this.lastAudio && f.audio) {
      this.lastAudio = sig;
      this.d.audio()?.setCutscene(f.audio);
    }
    return f;
  }

  feed(events: Parameters<StoryController['feed']>[0]): void {
    this.controller.feed(events);
  }

  // -------------------------------------------------------------------------
  // StoryInputHost

  press(): boolean {
    const used = this.controller.press(performance.now(), this.d.sync().gameplay.textSpeed);
    if (used) this.frame(performance.now());
    return used;
  }

  back(): boolean {
    const used = this.controller.back();
    if (used) {
      this.spendBack();
      this.frame(performance.now());
    }
    return used;
  }

  action(action: string): boolean {
    const c = this.controller;
    const used =
      action === 'recall'
        ? c.toggleBacklog()
        : action === 'auto_advance'
          ? c.toggleAuto()
          : action === 'hide_text'
            ? c.toggleHidden()
            : false;
    if (used) this.frame(performance.now());
    return used;
  }

  creatorAction(action: string, device: InputDevice): boolean {
    return this.creator?.inputAction(action, device) ?? false;
  }

  /** The scene's choices are on screen (number keys and the pad pick only what shows). */
  sceneChoicesShown(): boolean {
    return this.choicesShown;
  }

  chooseScene(choiceId: string): void {
    const sv = this.d.adapters.scene?.scene(this.d.view);
    const c = sv?.choices.find((x) => x.id === choiceId);
    if (!c?.confirm) {
      this.d.queue(this.d.adapters.scene?.choose(this.d.view, choiceId));
      return;
    }
    void askConfirmChoice(t(c.label)).then((ok) => {
      if (ok) this.d.queue(this.d.adapters.scene?.choose(this.d.view, choiceId));
    });
  }
}
