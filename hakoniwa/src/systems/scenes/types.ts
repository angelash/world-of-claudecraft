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
   * (prologue 4.1 "分类器"). The fallback choice is used without a model.
   */
  classify?: { node: string; choices: string[]; fallback: string };
  /**
   * A multi-turn exchange with a model (catalog_cutscenes.md 4.1.2 `轮次 软 6 硬 10`,
   * prologue_antechamber.md 1): the input stays open after each reply until the answerer
   * closes the round; from `soft` player turns on the answerer is asked to wrap up, at `hard`
   * the runner ends it. How it ended (`closed`, `soft`, `hard`) goes to `storeAs`. Without a
   * model the written reply closes the round at once.
   */
  turns?: SceneTurns;
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
  | { op: 'door_end' };

/** How a scene is presented (ux_and_onboarding.md 8.1; theater when absent). */
export type ScenePresentation = 'staged' | 'theater' | 'illustration';

export interface SceneNode {
  id: string;
  lines?: SceneLine[];
  /** stage directives for the client player (13.5); ignored by the kernel */
  stage?: StageDirective[];
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
}

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
}
