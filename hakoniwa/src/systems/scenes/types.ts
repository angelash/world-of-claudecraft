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
}

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

export interface SceneNode {
  id: string;
  lines?: SceneLine[];
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

export type SceneWait = 'advance' | 'choice' | 'input' | 'resolve' | 'court';

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
}
