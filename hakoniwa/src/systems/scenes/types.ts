// Scene data model. A scene is a small graph of nodes; entering a node applies its
// effects, emits its lines as dialogue.line events, then waits for the player:
// a choice (scenes.choose), free text (scenes.input), evidence (court nodes) or a
// plain advance (scenes.advance). A node with no visible lines and nothing to wait
// for passes straight on to `next`. See docs/40_design/systems/quests_and_events.md
// and docs/30_story/arcs/prologue_antechamber.md 7 (the no-model dialogue tree).

import type { TextParam } from '../../core/text';
import type { Effect, LineKind } from '../quests/effect_types';

export interface SceneLine {
  /** speaker id: a goddess id, 'narrator', 'player', 'door_voice', 'janu', or an NPC id */
  speaker: string;
  text: string;
  kind?: LineKind;
  /** display name override */
  name?: string;
  /** show only when this condition holds */
  when?: string;
}

export interface SceneChoice {
  id: string;
  label: string;
  /** target node id ('' or omitted: stay on the same node, useful with `once`) */
  to?: string;
  when?: string;
  effects?: Effect[];
  /** hide after it has been picked once in this run */
  once?: boolean;
  hint?: string;
  /**
   * An irreversible choice (catalog_cutscenes.md 2.2 `确认`): the client asks with
   * `ui_pop_confirm` first; cancelling stays on the node. The kernel ignores it.
   */
  confirm?: boolean;
  /**
   * A timed choice (catalog_cutscenes.md 2.2 `超时`, 13.6 `SceneChoice.timeout`): when the
   * player picks nothing for this many seconds after the node starts waiting, the runner picks
   * it (the prologue fall's "do nothing"). Counted in ticks at TICK_HZ, so replays agree.
   */
  timeout?: number;
  /**
   * An input action of the client's dialogue context that picks this choice (the prologue
   * fall's `reach_out`, ux_and_onboarding.md 17 `tut_p_reach`): the panel shows a key prompt.
   * One of SCENE_CHOICE_KEYS.
   */
  key?: string;
  /** Not listed among the numbered choices (a keyed or timed choice); the kernel accepts it. */
  hidden?: boolean;
}

/** Free text from the player (player.said); the model may answer, a written reply is the fallback. */
export interface SceneInput {
  prompt: string;
  /** flag key to store the (trimmed, length-capped) text in */
  storeAs?: string;
  maxLength?: number;
  /** value stored when the player enters nothing */
  empty?: string;
  to: string;
  /** who answers with a model: goddess id or speaker id (optional) */
  agentId?: string;
  role?: 'goddess.dialogue' | 'scene.improv';
  /** written reply lines (fallback, and the no-model version) */
  reply?: SceneLine[];
  /**
   * Model classification of the answer into one of this node's sibling choices
   * (prologue 4.1 "分类器"). Without a model the rule classifier of ./answer_port.ts picks
   * (PK-M1-19), else the fallback choice; with no fallback an answer no rule sorts gets the
   * written reply and goes on to `to`.
   */
  classify?: SceneClassify;
  /**
   * A multi-turn exchange with a model (catalog_cutscenes.md 4.1.2 `轮次 软 6 硬 10`,
   * prologue_antechamber.md 1): the input stays open after each reply until the answerer
   * closes the round; from `soft` player turns on the answerer is asked to wrap up, at `hard`
   * the runner ends it. How it ended (`closed`, `soft`, `hard`) goes to `storeAs`. Without a
   * model the written reply closes the round at once.
   */
  turns?: SceneTurns;
  /**
   * The improvisation brief of the answer (catalog_cutscenes.md 2.2 `即兴` before an `输入`):
   * purpose, situation, meaning keys and the forbidden list go to the model; a model reply
   * that misses a meaning key or says a forbidden word is replaced by the written reply.
   */
  improv?: SceneBrief;
  /**
   * Written lines the runner says itself after a model's reply (catalog_cutscenes.md 2.4: an
   * anchor or a key line the model may not rewrite), each once per run of the scene.
   */
  anchor?: SceneLine[];
  /**
   * Values the model may pull out of the conversation (prologue 4.1.2: the courtyard object
   * of Sylvie's round, the past life of Moira's): a value outside `values` is ignored. Without
   * a model nothing is extracted; the written choices decide.
   */
  extract?: SceneExtract[];
}

/**
 * Classification of a free answer into choices of a sibling node (`归类`). `settle`: only the
 * picked choice's effects apply and the input goes on to its own `to` (catalog_cutscenes.md
 * 13.6, the second destination semantics); otherwise the choice is taken as if picked. `by`:
 * the model that sorts an input with no answerer (default `narrator`, role scene.improv).
 */
export interface SceneClassify {
  node: string;
  choices: string[];
  fallback?: string;
  settle?: boolean;
  by?: string;
}

/** The brief of an improvised answer or line (`即兴 …｜目的｜情境｜含义键｜禁区`). */
export interface SceneBrief {
  purpose?: string;
  situation?: string;
  /**
   * The meanings the answer must carry, as the catalog writes them (含义键): the model reads
   * them; they are not matched word for word (a meaning may be said many ways).
   */
  meaningKeys?: string[];
  /** The catalog's forbidden list (禁区), as rules the model reads; not matched either. */
  forbidden?: string[];
  /**
   * What the executor checks (catalog 2.4 "执行者校验不过即换回原句"): `must` lists literal
   * phrases of which a model answer must contain AT LEAST ONE (the brief's core phrase in the
   * forms it may take); `never` lists literal words no answer may contain (the unlocked names
   * and concepts of the forbidden list). A failed check puts the written lines back.
   */
  check?: { must?: string[]; never?: string[] };
}

/** One value the model may extract from a conversation into a flag. */
export interface SceneExtract {
  key: string;
  values: string[];
}

export interface SceneTurns {
  soft: number;
  hard: number;
  /** flag that records how the round ended: closed, soft or hard */
  storeAs?: string;
}

/**
 * The input actions a keyed choice may name: the client binds each in its dialogue context
 * (keyboard and pad); tests/client_prologue_stage.test.ts pins that.
 */
export const SCENE_CHOICE_KEYS = ['reach_out'] as const;

/** How a multi-turn round ended (registry `p_round_end.<goddess>`). */
export type RoundEnd = 'closed' | 'soft' | 'hard';

/** A line the model may improvise; the fallback lines are always written down. */
export interface SceneImprov {
  role: 'scene.improv' | 'goddess.dialogue';
  agentId: string;
  purpose: string;
  situation: string;
  fallback: SceneLine[];
  /** the meanings the lines must carry, for the model (see SceneBrief) */
  meaningKeys?: string[];
  /** the forbidden list, for the model (see SceneBrief) */
  forbidden?: string[];
  /** the executor's literal check (see SceneBrief.check) */
  check?: { must?: string[]; never?: string[] };
}

/**
 * Evidence presented at an act-1 trial (PK-M1-55; act1_borderstone.md 4.2): the held pieces of
 * the trial table are offered beside the node's written choices (witnesses, the lamp, the
 * speech); a piece is judged by the shared core (present.ts) and the run stays on the node.
 */
export interface TrialSpec {
  /** the trial table id (data/scenes/trials.json) */
  trial: string;
}

/** Evidence presentation against one goddess (act6 3.3). */
export interface CourtSpec {
  goddess: string;
  /** node to go to when the player ends the examination */
  to: string;
  /** maximum pieces of evidence per examination (0 = no cap) */
  limit?: number;
}

/**
 * One stage directive of a node (catalog_cutscenes.md 13.5): the client's cutscene player
 * executes it when the node is entered; the kernel ignores the list. Music starts on layer 1
 * unless `layer` says otherwise; `silence` is a written silence (music and ambience pressed
 * to -24 dB for the seconds given); `letter` shows an `ltr_` letter as a step of its own.
 */
export type StageDirective =
  | StageDirectiveMore
  | { op: 'music'; id: string; mode?: 'in' | 'out' | 'cross' | 'layer'; layer?: 1 | 2 | 3 | 4 }
  | { op: 'sfx'; id: string }
  | { op: 'ambience'; id: string }
  | { op: 'silence'; seconds: number }
  | { op: 'bust'; who: string; expression?: string; side: 'left' | 'right' }
  | { op: 'bust_clear'; who?: string }
  | { op: 'fade'; to: 'black' | 'white'; seconds: number }
  | { op: 'caption'; text: string }
  | { op: 'letter'; id: string }
  | { op: 'shake'; strength: 1 | 2 | 3 }
  /**
   * Eavesdropping from here on (prologue P5, prologue_antechamber.md 3.1): the listening tier
   * follows the level in `flag` (0 to 3) until a `listen_end`; the client hands it to the
   * audio (far, mid, near) and dims far fragments.
   */
  | { op: 'listen'; flag: string }
  /** a noise from the player: the tier drops one step for the rest (near to mid, mid to far) */
  | { op: 'noise' }
  | { op: 'listen_end' }
  /**
   * The door that reappears at every corner (prologue P2): its state follows the turn-away
   * counter in `flag`, up to `cap`; at the cap it stands ajar with wind behind it. `open`: the
   * door opens now (pushed, or by itself as the player passes).
   */
  | { op: 'door'; flag: string; cap: number; open?: boolean }
  | { op: 'door_end' }
  /**
   * `@镜` (catalog_cutscenes.md 2.3, 13.5): angle, shot size and movement over `seconds`,
   * framed on `focus` (`player`, an entity id or content ref, a location id, or "x,y" in
   * tiles); a pan travels to `to`; `yaw` turns a side shot (at most 20 degrees). Holds until
   * the next camera directive, `camera_end` or the end of the scene, which hand the camera
   * back to the player. The client executes it; the kernel ignores it.
   */
  | {
      op: 'camera';
      angle?: StageCameraAngle;
      size?: StageShotSize;
      move?: StageCameraMove;
      focus?: string;
      to?: string;
      seconds?: number;
      yaw?: number;
    }
  | { op: 'camera_end' }
  /** `@光` (2.3): a time-of-day preset or a colour mood over one second; `world` hands it back */
  | { op: 'light'; preset: StageLightPreset }
  /** `@天气` (2.3): the weather on screen over one second (the world's stays); `world` hands it back */
  | { op: 'weather'; preset: StageWeatherPreset }
  /** `@庭镜` (13.5): an atlas map shown in the court mirror, at most 20 seconds */
  | { op: 'mirror'; map: string; seconds?: number }
  | { op: 'mirror_end' }
  /**
   * `@动作` (2.3): a standee motion of a figure (`who` as `focus`); `action` is one of
   * STAGE_MOTIONS or an `art_chr_<id>_<pose>` frame (the standing frame until that art exists)
   */
  | { op: 'motion'; who: string; action: string };

/** Camera angles of `@镜` (catalog_cutscenes.md 2.3): standard, low, high, top, side. */
export const STAGE_CAMERA_ANGLES = ['standard', 'low', 'high', 'top', 'side'] as const;
export type StageCameraAngle = (typeof STAGE_CAMERA_ANGLES)[number];
/** Shot sizes (2.3): far, full, mid, near, close (60, 30, 16, 8 tiles, close twice near). */
export const STAGE_SHOT_SIZES = ['far', 'full', 'mid', 'near', 'close'] as const;
export type StageShotSize = (typeof STAGE_SHOT_SIZES)[number];
/** Camera movement (2.3): hold, push, pull, pan, track, rise, fall (shake is `shake`). */
export const STAGE_CAMERA_MOVES = ['hold', 'push', 'pull', 'pan', 'track', 'rise', 'fall'] as const;
export type StageCameraMove = (typeof STAGE_CAMERA_MOVES)[number];
/** `@光` presets (2.3): five times of day, four colour moods, and `world`. */
export const STAGE_LIGHT_PRESETS = [
  'dawn',
  'noon',
  'dusk',
  'night',
  'midnight',
  'divine',
  'door',
  'sediment',
  'dream',
  'world',
] as const;
export type StageLightPreset = (typeof STAGE_LIGHT_PRESETS)[number];
/** `@天气` presets (2.3; ashstorm is the ash waste's grey storm), and `world`. */
export const STAGE_WEATHER_PRESETS = [
  'clear',
  'cloudy',
  'rain',
  'storm',
  'snow',
  'fog',
  'ashfall',
  'ashstorm',
  'world',
] as const;
export type StageWeatherPreset = (typeof STAGE_WEATHER_PRESETS)[number];
/** `@动作` motions (2.3) the standee plays without special art. */
export const STAGE_MOTIONS = [
  'walk',
  'run',
  'stop',
  'turn',
  'nod',
  'shake_head',
  'sit',
  'stand',
  'kneel',
  'fall',
  'raise_hand',
  'draw',
  'cast',
  'look_up',
  'approach',
  'retreat',
] as const;
export type StageMotion = (typeof STAGE_MOTIONS)[number];

/** How a scene is presented (ux_and_onboarding.md 8.1; theater when absent). */
export type ScenePresentation = 'staged' | 'theater' | 'illustration';

export interface SceneNode {
  id: string;
  lines?: SceneLine[];
  /**
   * stage directives for the client player (13.5); ignored by the kernel except `when`, which
   * the view evaluates (a directive whose condition fails is not handed to the client)
   */
  stage?: StageStep[];
  /** an anchor node: skipping stops here (ux 8.3) */
  anchor?: boolean;
  /**
   * A segment marker (catalog_cutscenes.md 2.2 multi-entry scenes): entering this node starts
   * the named segment of the scene (its summary card, the `scene.segment` event).
   */
  segment?: string;
  effects?: Effect[];
  /** first matching branch jumps right after effects and lines */
  branch?: { when: string; to: string }[];
  choices?: SceneChoice[];
  input?: SceneInput;
  improv?: SceneImprov;
  court?: CourtSpec;
  /** offer the held pieces of an act-1 trial beside the written choices (PK-M1-55) */
  present?: TrialSpec;
  /** assemble and show the epilogue for the current ending */
  epilogue?: boolean;
  next?: string;
  /** ends the scene after this node (also implied when there is no next) */
  end?: boolean;
}

export interface SceneDef {
  id: string;
  title: string;
  act?: string;
  /** teleport the player here when the scene starts */
  mapId?: string;
  location?: string;
  /** Keep the approach position when already at this place (including its trigger margin). */
  keepPosition?: boolean;
  start: string;
  nodes: SceneNode[];
  onEnd?: Effect[];
  /** scene to play right after this one ends */
  then?: string;
  /** client presentation (ux 8.1); theater when absent */
  presentation?: ScenePresentation;
  /** full-screen still of an illustration scene (an `art_bg_cut_*` id) */
  illustration?: string;
  /** the skip summary card (catalog_cutscenes.md 13.9; text key c.scenes.<id>.summary) */
  summary?: string;
  /** segments of a multi-entry scene, with their own summary cards (13.3) */
  segments?: SceneSegment[];
  /**
   * Combat barks of the scene's interlude table (catalog_cutscenes.md 5 "战斗插演"): short lines
   * the runner says, without pausing the fight, when a wave or a boss event fires.
   */
  barks?: SceneBark[];
  /**
   * The "re-choose the opening" offer (catalog_cutscenes.md 4.1.1 rule 5; prologue 1): while
   * this scene plays, the player may restart from `scene`.
   */
  restart?: SceneRestart;
  /**
   * When the scene plays by itself (catalog_cutscenes.md 5 "触发" rows that no quest stage
   * requests): the scenes system requests it once a trigger holds while nothing plays, the
   * player stands at the trigger's place and the act is the scene's act. A trigger condition
   * should name what the scene writes when it ends, or the scene plays again.
   */
  triggers?: SceneTrigger[];
}

/** One self-request of a scene: a condition and, optionally, where the player stands. */
export interface SceneTrigger {
  when: string;
  mapId?: string;
  location?: string;
}

/**
 * Stage directives added for act 1 (PK-M1-34; catalog_cutscenes.md 2.3, 13.5): `@转场` (the
 * door-frame wipe, a dissolve, a cut) and a full-screen still in the middle of a scene
 * (`still`, an `art_bg_cut_*` id, standing until `still_end` or the scene ends).
 */
export type StageDirectiveMore =
  | { op: 'transition'; kind: StageTransition }
  | { op: 'still'; id: string }
  | { op: 'still_end' };

/** `@转场` kinds (2.3): 门扉擦除, 溶, 切. */
export const STAGE_TRANSITIONS = ['door_wipe', 'dissolve', 'cut'] as const;
export type StageTransition = (typeof STAGE_TRANSITIONS)[number];

/**
 * When a directive runs (PK-M1-34): `at` is the written index of the node's line it waits
 * for (it runs as that line starts showing; a line hidden by its condition hands it to the
 * next shown line, and with none left it runs once the lines are read); absent, it runs as
 * the node is entered. `when` is a condition read when the node is entered.
 */
export interface StageTiming {
  at?: number;
  when?: string;
}

/** A directive as written in a node: the directive and its timing. */
export type StageStep = StageDirective & StageTiming;

/**
 * A directive as the client gets it (scenes/stage_steps.ts): the condition is already read
 * and `at` already counts the lines actually shown, so the player counts what is on screen.
 */
export type ShownStep = StageDirective & { at?: number };

export interface SceneSegment {
  id: string;
  /** the skip summary of this segment (13.3); the scene's summary when absent */
  summary?: string;
}

/** Combat events a bark answers (emitted by the combat system; scenes only listens). */
export type BarkTrigger = 'wave_spawned' | 'wave_cleared' | 'boss_phase' | 'boss_defeated';

export interface SceneBark {
  id: string;
  on: BarkTrigger;
  /** the wave id (wave triggers) or the boss monster id (boss triggers) */
  ref: string;
  /** boss_phase: the phase number reached (1 is the first); any phase when absent */
  phase?: number;
  when?: string;
  lines: SceneLine[];
  /** say it every time the event fires (default: once per world) */
  repeat?: boolean;
}

export interface SceneRestart {
  /** the scene that plays again from its start */
  scene: string;
  /** flags cleared first: exact names, or prefixes ending in `*` */
  clear: string[];
  /** items taken back from the player (every piece) */
  take?: string[];
  /** a segment of this scene: once it starts, the offer is gone */
  until?: string;
  /**
   * The player entity goes back to its unnamed, default look (PK-M1-34): the opening asks the
   * name and the look again, so the old ones must not stand in the meantime.
   */
  resetPlayer?: boolean;
}

/** A speaker's display data for lines (NPC names here are scene-local labels). */
export interface SpeakerDef {
  id: string;
  name: string;
  kind?: LineKind;
  /** alternative name once a condition holds (for example 'janu' after a6_name_spoken) */
  revealedName?: string;
  revealWhen?: string;
}

/** Act 6 evidence: which defense lines of which goddess a piece hits (act6 4.2). */
export interface EvidenceDef {
  id: string;
  /** inventory item carrying it (kind 'evidence') */
  item: string;
  name: string;
  /** lines it strikes; strength 1..3, or a dynamic source computed at trial time */
  targets: {
    goddess: string;
    line: DefenseLine | 'mitigate';
    strength: number;
    dynamic?: 'miracle_ledger' | 'review' | 'held_unaided';
  }[];
  /** one sentence shown when presented */
  presentText: string;
}

export type DefenseLine = 'fact' | 'just' | 'need';

export interface CourtDefenseDef {
  goddess: string;
  thickness: Record<DefenseLine, number>;
  /** reaction when a line breaks, per line */
  broken: Record<DefenseLine, string>;
  /** the goddess's reply when evidence does not hit her */
  deflect: string;
  /** final words by verdict */
  verdictLines: Record<Verdict, string>;
  /** the answer to the prologue question asked back (act6 3.4) */
  askBack: { question: string; persuaded: string; unpersuaded: string };
}

export type Verdict = 'voluntary' | 'judged' | 'refuse' | 'contend';

export type EndingId =
  | 'release'
  | 'release_unfinished'
  | 'new_god'
  | 'rule_eluen'
  | 'rule_valda'
  | 'rule_merca'
  | 'rule_sylvie'
  | 'rule_moira'
  | 'janu_restored'
  | 'reclaim'
  | 'maker';

export const ENDINGS: readonly EndingId[] = [
  'release',
  'release_unfinished',
  'new_god',
  'rule_eluen',
  'rule_valda',
  'rule_merca',
  'rule_sylvie',
  'rule_moira',
  'janu_restored',
  'reclaim',
  'maker',
];

export type EpilogueLayer =
  | 'gods'
  | 'races'
  | 'nations'
  | 'kingdom'
  | 'city'
  | 'town'
  | 'companions'
  | 'player';

/** One epilogue entry template (act6 12.2). Text may use {player_name} and {flag:key}. */
export interface EpilogueEntry {
  id: string;
  layer: EpilogueLayer;
  /** subject title, for example 醉月亭 */
  subject: string;
  /** endings it may appear in ('*' for all except reclaim and maker) */
  endings: string[];
  when?: string;
  /** years after the review: 1, 10 or 100; 0 for "很久以后" */
  year: number;
  text: string;
  /** must appear when its condition holds */
  required?: boolean;
  /** higher first within a layer */
  weight?: number;
}

/** 'ui': an interface of a `ui` effect is open; the run goes on when the client closes it. */
export type SceneWait = 'advance' | 'choice' | 'input' | 'resolve' | 'court' | 'ui';

/** A line as shown (speaker name already resolved). */
export interface ShownLine {
  speakerId: string;
  speakerName: TextParam;
  text: TextParam;
  kind: LineKind;
  /** the written index of the line in its node (stage timing `at`); absent for composed lines */
  line?: number;
}

export interface SceneRun {
  runId: number;
  sceneId: string;
  nodeId: string;
  waiting: SceneWait;
  /** the current node's visible lines (for the client view) */
  shown: ShownLine[];
  /** bumps on every node change; AI lines for an older revision are dropped */
  revision: number;
  /** choice ids already picked (for once) */
  picked: string[];
  /** improv lines were shown for the current node */
  spoken: boolean;
  /** evidence presented in the current court node */
  presented: string[];
  /** while waiting for a model reply: the tick after which the written fallback applies */
  resolveDeadline?: number;
  startedTick: number;
  /** a timed choice is pending: the runner picks `choice` at tick `at` */
  timed?: { choice: string; at: number };
  /** player turns spent on the current multi-turn input */
  turn?: number;
  /** the open interface of a `ui` effect and where the run goes once it closes */
  ui?: SceneUiWait;
  /** the segment the run is in ('' or absent before the first marker) */
  segment?: string;
  /** the restart offer of this run is gone (its `until` segment started) */
  restartClosed?: boolean;
  /** nodes whose written anchors this run has said (once per run; PK-M1-34) */
  anchored?: string[];
}

export interface SceneUiWait {
  ui: string;
  /** flag the interface's result is written to (the effect's storeAs) */
  storeAs?: string;
  /**
   * after a choice: the choice's target ('' stays on the node); after a node's own effect:
   * absent, the node's branches or next decide
   */
  to?: string;
}

export interface CourtState {
  /** goddess -> line -> accumulated strength */
  strength: Record<string, Record<DefenseLine, number>>;
  /** goddess -> evidence ids already presented (one count per line per piece) */
  presented: Record<string, string[]>;
  /** goddess -> evidence ids that mitigated (opened a confession) */
  mitigated: Record<string, string[]>;
}

export interface ScenesSlice {
  current: SceneRun | null;
  queue: string[];
  nextRunId: number;
  seen: string[];
  court: CourtState;
  /** last epilogue assembled, for the client's credits view */
  epilogue: { subject: string; year: number; text: TextParam; layer: EpilogueLayer }[];
  /** once-only combat barks already said (`<sceneId>/<barkId>`); absent in older saves */
  barked?: string[];
  /** what each act-1 trial was shown (PK-M1-55, present.ts); absent in older saves */
  trials?: Record<string, { shown: readonly string[]; forgeryCaught?: boolean }>;
}
