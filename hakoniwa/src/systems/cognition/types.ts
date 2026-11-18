// Cognition system types: belief profiles, evidence, explanations, rumors, appraisal
// results, and the module augmentation for slice, content, events and commands.
// See docs/40_design/systems/reputation_and_cognition.md and society.md 7 and 8.

import type { TextParam, TextRef } from '../../core/text';
import type { SocialClass } from '../npc/types';

/** Cognitive state machine (society.md 8.5) with the four forks after acceptance. */
export type BeliefState =
  | 'unaware'
  | 'doubt'
  | 'explaining'
  | 'wavering'
  | 'accepted'
  | 'worship'
  | 'hostile'
  | 'exploit'
  | 'depend';

/** Explanation library (society.md 8.3). */
export type ExplanationId =
  | 'luck'
  | 'wounded'
  | 'gadget'
  | 'cheat'
  | 'misreport'
  | 'miracle'
  | 'sorcery'
  | 'conspiracy'
  | 'hidden_identity'
  | 'bloodline'
  | 'useful';

/** Evidence kinds (reputation_and_cognition.md 3.1). */
export type EvidenceKind =
  | 'seen'
  | 'seen_close'
  | 'repeat'
  | 'repeat_close'
  | 'physical'
  | 'multi'
  | 'benefit'
  | 'authority'
  | 'rumor'
  | 'inferred'
  | 'written'
  | 'appraisal';

export const EVIDENCE_KINDS: readonly EvidenceKind[] = [
  'seen',
  'seen_close',
  'repeat',
  'repeat_close',
  'physical',
  'multi',
  'benefit',
  'authority',
  'rumor',
  'inferred',
  'written',
  'appraisal',
];

/** The task's seven summary categories for "how did they explain the last deed". */
export type ExplainCategory =
  | 'luck'
  | 'cheat'
  | 'gadget'
  | 'miracle'
  | 'monster'
  | 'conspiracy'
  | 'real';

export interface ClassParams {
  id: SocialClass;
  /** common-sense ceiling in apparent levels */
  ceiling: number;
  /** base suspicion threshold */
  base: number;
  /** default explanation order */
  order: ExplanationId[];
  /** believes what they see at once (beastkin, children, remnants) */
  direct?: boolean;
  /** rumors carry no weight (beastkin: no seeing, no believing) */
  ignoreRumor?: boolean;
  /** trust in instruments: scales the appraisal counter-evidence */
  instrumentTrust?: number;
}

export interface ExplanationDef {
  id: ExplanationId;
  /** short Chinese label, for example 前人打残 */
  label: string;
  /** identity guess shown in the person's impression */
  identity: string;
  refutedBy: EvidenceKind[];
  /** fraction of the apparent level the observer credits to the doer */
  discount: number;
  category: ExplainCategory;
}

export interface EvidenceRecord {
  /** stable key of the observation that produced it (never an event seq: replays shift seqs) */
  src: string;
  kind: EvidenceKind;
  weight: number;
  /** independence key: same key = same source */
  ind: string;
  tick: number;
  apparent?: number;
  feat?: string;
}

export interface BeliefProfile {
  subject: string;
  state: BeliefState;
  /** public stance, can lag the private state under social pressure */
  publicState: BeliefState;
  /** accumulated cognitive value */
  value: number;
  /** suspicion threshold (0 until the first overreaching evidence) */
  threshold: number;
  /** identity prior: the apparent level the observer thinks the subject has */
  prior: number;
  /** estimated strength in apparent levels */
  est: number;
  explanation: ExplanationId | null;
  stick: number;
  refuted: ExplanationId[];
  /** what the observer takes the subject for (a kernel word or a content identity) */
  identity: TextParam;
  /** belief in the subject's words, 0..1 */
  credence: number;
  lastFeat: {
    kind: string;
    apparent: number;
    explanation: ExplanationId | 'real' | null;
    tick: number;
  } | null;
  evidence: EvidenceRecord[];
  /** reasoning log, rule-written */
  log: TextParam[];
  lastTick: number;
  lastFeatTick: number;
}

export type Polarity = 'awe' | 'fear' | 'mock' | 'disgust' | 'curious' | 'grateful';

export type RumorTemplate =
  | 'hero_legend'
  | 'demon_return'
  | 'goddess'
  | 'witch'
  | 'noble_bastard'
  | 'ghost';

export interface RumorVersion {
  /** who did it in this version: 'player', a persona id, 'stranger' or 'lucky_newbie' */
  subject: string;
  count: number;
  place: TextParam;
  /** 0 today, 1 a few days ago, 2 some time ago, 3 last year */
  when: number;
  details: TextParam[];
  template: RumorTemplate | null;
  polarity: Polarity;
  explanation: ExplanationId | 'real' | null;
  /** apparent level implied by this version */
  apparent: number;
  /** 0..1 distance from the anchored truth */
  distortion: number;
  /** distortion reached the cap: told as a tall tale, never believed */
  story: boolean;
}

export interface Rumor {
  id: string;
  /** truth anchor: tick, actor and kind of the kernel event it grew from */
  anchor: string;
  tick: number;
  /** feat kind or 'appraise' */
  topic: string;
  /** true doer */
  subject: string;
  mapId: string;
  truth: RumorVersion;
  heat: number;
  /** famous strong people present at the scene (misattribution targets) */
  famous: string[];
  tellings: number;
}

export interface RumorHolding {
  rumor: string;
  v: RumorVersion;
  cred: number;
  /** 'seen' for eyewitnesses, else the teller's id */
  from: string;
  /** first teller of this chain (independence key) */
  origin: string;
  hops: number;
  tick: number;
  believed: boolean;
  told: number;
}

export interface AppraisalResult {
  tick: number;
  observerId: string;
  targetId: string;
  device: AppraisalDevice;
  /** what the display shows: no record, 34+, unknown, Lv12, a record fragment ... */
  display: TextRef | string;
  kind: 'no_record' | 'capped' | 'unknown' | 'exact' | 'fragment' | 'band';
  level?: number;
  tier?: number;
  tierName?: TextParam;
  potential?: string;
  note: TextRef | string;
}

export type AppraisalDevice = 'crystal' | 'guild' | 'academy' | 'skill' | 'sense';

export interface ComedyCounter {
  day: number;
  count: number;
}

export interface CognitionSlice {
  /** observer persona id -> subject -> belief */
  beliefs: Record<string, Record<string, BeliefProfile>>;
  rumors: Record<string, Rumor>;
  /** holder (persona id or 'player') -> holdings */
  holdings: Record<string, RumorHolding[]>;
  /** L4 crowd shares: mapId -> rumorId -> share and the circulating version */
  crowd: Record<string, Record<string, { share: number; v: RumorVersion }>>;
  appraisals: AppraisalResult[];
  /** `${mapId}/${bit}` -> today's count; plus `${mapId}/streak` bookkeeping */
  comedy: Record<string, ComedyCounter>;
  comedyStreak: Record<string, { bit: string; n: number }>;
  /** targetId -> tick, to de-duplicate feats synthesized from deaths */
  recentFeats: Record<string, number>;
  /**
   * Rumors each person already matched to the player's face (identity_matched, builtin_ai
   * 5.6; PK-M1-19); absent on saves before it.
   */
  matched?: Record<string, string[]>;
}

declare module '../../core/contracts' {
  interface WorldSlices {
    cognition: CognitionSlice;
  }
  interface ContentMap {
    cognitionClasses: ClassParams[];
    cognitionExplanations: ExplanationDef[];
  }
  interface EventMap {
    'cognition.appraised': AppraisalResult;
    'cognition.belief_changed': {
      observerId: string;
      subjectId: string;
      from: BeliefState;
      to: BeliefState;
      explanation: ExplanationId | null;
      reason: TextParam;
    };
    'cognition.rumor_spread': {
      rumorId: string;
      fromId: string;
      toId: string;
      mapId: string;
      distortion: number;
      believed: boolean;
    };
    /** The player heard a rumor (rumor book entry). */
    'cognition.rumor_heard': { rumorId: string; fromId: string; text: TextParam };
  }
  interface CommandMap {
    /** Appraise a target (D-029 display rules). */
    'cognition.appraise': { observerId: string; targetId: string; device?: AppraisalDevice };
    /** Scripted evidence (authority endorsement, physical proof, written record). */
    'cognition.evidence': {
      observerId: string;
      subjectId: string;
      kind: EvidenceKind;
      weight?: number;
      note?: string;
    };
    /** A public fact (notice, verdict) anchors rumors about a subject on a map. */
    'cognition.publish': { mapId: string; subjectId: string; note?: string };
  }
}
