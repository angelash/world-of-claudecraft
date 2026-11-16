// The seam between the deterministic kernel and the (asynchronous, optional) AI layer.
// A system that wants a model decision files an AiRequestSpec carrying a deterministic
// fallback. The AI layer may answer with a proposal (commands) before the deadline; if
// it does not, or the AI is off, the fallback runs. Proposals and fallbacks enter the
// kernel as logged commands, so a run replays without calling any model.
// See docs/50_tech/architecture.md 5 and docs/50_tech/ai_architecture.md.

import type { AnyCommand, CommandKind } from './contracts';
import type { TextParam } from './text';

export type AiMode = 'off' | 'external' | 'replay';

export interface AiRequestSpec {
  /** Stable id of the deciding agent: npc id, goddess id, nation id. */
  agentId: string;
  /** Role pack, for example 'npc.daily', 'npc.dialogue', 'goddess.plan', 'ruler.policy'. */
  role: string;
  /** Short machine tag for audit, for example 'morning_plan'. */
  purpose: string;
  /** Agent state revision when the request was made; handlers drop stale proposals. */
  revision: number;
  /** JSON-serializable perception projection, already filtered by knowledge tier. */
  context: unknown;
  /** Command kinds a proposal may contain. */
  allowed: CommandKind[];
  /** Deterministic fallback, run when no proposal arrives in time (may be empty). */
  fallback: AnyCommand[];
  /** Ticks until the fallback runs. */
  deadlineTicks: number;
  /** Higher first when the AI layer has to choose. */
  priority?: number;
}

/**
 * Recommended shape of AiRequestSpec.context. The AI layer turns it into a prompt, so
 * systems never write prompt text themselves. Everything here must already be filtered
 * by the agent's knowledge tier and the reveal ledger (docs/30_story/reveal_ledger.md).
 * Text is TextParam (D-077): kernel sentences are TextRefs, content text stays a string;
 * the AI layer renders the TextRefs in the source language before building the prompt.
 */
export interface AiContextV1 {
  v: 1;
  /** who the agent is (persona card digest) */
  persona: TextParam;
  /** what is happening right now */
  situation: TextParam;
  /** facts the agent knows */
  knowledge?: TextParam[];
  /** recent memories, newest last */
  memory?: TextParam[];
  goals?: TextParam[];
  /** allowed command kind -> description of its data fields and when to use it */
  commands: Record<string, TextParam>;
  /** when a spoken line is expected, the speaker's display name */
  speakAs?: TextParam;
  /** speech fingerprint: tone rules, catchphrases, things never said */
  voice?: TextParam[];
  extra?: unknown;
}

export interface AiRequest extends AiRequestSpec {
  id: string;
  createdTick: number;
  deadlineTick: number;
  dispatched: boolean;
}

export type AiResolution =
  | { type: 'proposal'; commands: AnyCommand[]; note?: string }
  | { type: 'decline'; reason: string };

export interface AiState {
  mode: AiMode;
  nextId: number;
  pending: AiRequest[];
}

export interface AiPort {
  request(spec: AiRequestSpec): string;
  /** True when a model may answer (mode external); systems can skip expensive projections otherwise. */
  readonly enabled: boolean;
}
