// The level signals the onboarding reads each HUD refresh (ux_and_onboarding.md 17.5 triggers
// and completions that no flag or kernel event reports; src/client/tutorial/steps.ts
// `TUT_SIGNALS`). The session reads a handful of cheap facts off the view and the adapters
// (./act1_wiring.ts) and this module turns them into the signals that hold right now. Which
// signals the session produces and which wait on another package is declared beside the
// catalogue (src/client/tutorial/steps.ts `SIGNAL_SOURCES`); the onboarding check reads it.
// Pure; Node-tested.

import type { TutSignal } from '../tutorial/steps';

/** The prologue scene that asks the name (P6) and the one that asks the questions (P7 to P11). */
const NAME_SCENE = 'cut_p_call';
const ANSWER_SCENE = 'cut_p_interview';

/** Below this share of health the low-health step fires (17.5 tut_a1_low_hp: 40%). */
export const LOW_HP = 0.4;
/** At or above this share the low-health step is done (17.5: back to 80%). */
export const HP_RECOVERED = 0.8;
/** The dusk hour (17.5 tut_a1_night: the first dusk). */
export const DUSK_HOUR = 18;

/** What the session reads for the signals; every field is cheap. */
export interface SignalProbe {
  /** someone the player could talk to is near */
  talkableNear: boolean;
  /** a conversation is open */
  talking: boolean;
  /** an attackable hostile is in Tab range */
  hostileNear: boolean;
  /** the hard target is a hostile */
  hostileTarget: boolean;
  /** the player is in combat */
  fighting: boolean;
  /** player health share 0..1, null without a unit */
  hpShare: number | null;
  /** a commission board in reach */
  boardNear: boolean;
  /** a gathering node in reach */
  nodeNear: boolean;
  /** a crafting station in reach */
  stationNear: boolean;
  /** the act flag */
  act: string;
  /** the game hour 0..23 */
  hour: number;
  /** the player could save right now (no block, not the prologue) */
  canSave: boolean;
  /** a gamepad is connected */
  padConnected: boolean;
}

/** The level signals that hold for this probe. */
export function levelSignals(p: SignalProbe): Set<TutSignal> {
  const out = new Set<TutSignal>();
  const add = (on: boolean, s: TutSignal) => {
    if (on) out.add(s);
  };
  add(p.talkableNear, 'near_talkable');
  add(p.talkableNear || p.boardNear || p.nodeNear || p.stationNear, 'near_interactable');
  add(p.talking, 'talking');
  add(p.hostileNear, 'hostile_in_view');
  add(p.hostileTarget, 'target_selected');
  add(p.fighting, 'combat_started');
  add(!p.fighting, 'combat_ended');
  if (p.hpShare !== null) {
    add(p.hpShare < LOW_HP, 'low_hp');
    add(p.hpShare >= HP_RECOVERED, 'hp_recovered');
  }
  add(p.boardNear, 'board_near');
  add(p.nodeNear, 'node_near');
  add(p.stationNear, 'station_near');
  add(!p.stationNear, 'station_left');
  add(p.hour >= DUSK_HOUR, 'dusk');
  add(p.canSave && p.act !== 'prologue', 'save_available');
  add(p.padConnected, 'gamepad_connected');
  return out;
}

/** What the story layer shows this refresh (the scene adapter and the story wiring). */
export interface StoryProbe {
  /** the act flag */
  act: string;
  /** what the open scene waits for, null without a scene */
  waiting: string | null;
  /**
   * the open scene: the name is asked in the call, the answers in the interview (the earth
   * rooms before them have inputs of their own: the unsent reply, the cat's name)
   */
  sceneId?: string;
  /** IDs of the visible choices; act-1 trials offer evidence as piece choices. */
  choiceIds?: readonly string[];
  /** a choice picked by its own key is offered (the prologue's fall, P15 "伸手") */
  keyed: boolean;
  /** an irreversible choice is offered (a key choice, 7.4) */
  keyChoice: boolean;
  /** the prologue's eavesdrop tier, null outside it */
  listen: string | null;
  /** a trade session is open */
  shop: boolean;
  /** an active quest names an explicit deadline */
  deadline: boolean;
}

/**
 * The story signals, with their one-refresh pulses (the prompt answered, the fall over, the
 * choice made, the evidence shown, the eavesdropping over, the shop closed). The name is the
 * call's text input (P6, tut_p_name); the inputs and choices of the interview are the answers
 * (P7, tut_p_answer); a probe without a scene id falls back to "the first input is the name".
 * Pure; keeps only what it saw last refresh.
 */
export class StorySignals {
  private nameDone = false;
  private answerDone = false;
  private last: { name: boolean; answer: boolean } & Omit<StoryProbe, 'act' | 'waiting'> = {
    name: false,
    answer: false,
    keyed: false,
    keyChoice: false,
    listen: null,
    shop: false,
    deadline: false,
  };
  private lastCourt = false;

  update(p: StoryProbe): Set<TutSignal> {
    const out = new Set<TutSignal>();
    const prologue = p.act === 'prologue';
    const inScene = (id: string) => p.sceneId === undefined || p.sceneId === id;
    const name = prologue && !this.nameDone && p.waiting === 'input' && inScene(NAME_SCENE);
    const answer =
      prologue &&
      this.nameDone &&
      !this.answerDone &&
      (p.waiting === 'input' || p.waiting === 'choice') &&
      inScene(ANSWER_SCENE);
    if (name) out.add('name_prompt');
    if (this.last.name && !name) {
      this.nameDone = true;
      out.add('name_answered');
    }
    if (answer) out.add('answer_prompt');
    if (this.last.answer && !answer) {
      this.answerDone = true;
      out.add('answered');
    }
    if (p.keyed) out.add('falling');
    else if (this.last.keyed) out.add('fall_ended');
    if (p.keyChoice) out.add('key_choice');
    else if (this.last.keyChoice) out.add('key_choice_made');
    const court =
      p.waiting === 'court' ||
      (p.waiting === 'choice' && !!p.choiceIds?.some((id) => id.startsWith('piece:')));
    if (court) out.add('evidence_prompt');
    else if (this.lastCourt) out.add('evidence_shown');
    if (p.listen === 'far') out.add('listen_far');
    if (this.last.listen !== null && p.listen === null) out.add('listen_end');
    if (p.shop) out.add('shop_open');
    else if (this.last.shop) out.add('shop_closed');
    if (p.deadline) out.add('deadline_quest');
    this.last = {
      name,
      answer,
      keyed: p.keyed,
      keyChoice: p.keyChoice,
      listen: p.listen,
      shop: p.shop,
      deadline: p.deadline,
    };
    this.lastCourt = court;
    return out;
  }
}

/**
 * Windows newly open since the last refresh, and whether the menu was among them (the
 * prologue's restart step fires on the first menu, 17.5 tut_p_restart).
 */
export function newlyOpened<T extends string>(
  before: ReadonlySet<T>,
  now: ReadonlySet<T>,
): { opened: T[]; menu: boolean } {
  const opened = [...now].filter((id) => !before.has(id));
  return { opened, menu: opened.includes('menu' as T) };
}
