// Role pack interface and registry. A role pack is the "model side" of one decision class:
// the stable Chinese system prompt, the default tier and effort, output limits, and the
// scheduling and budget knobs. Packs live in src/game/ai_roles/ and are registered there;
// this module only defines the shape. See docs/50_tech/ai_architecture.md 2.3.11.

import type { CacheTtl, Effort, ModelTier } from './contracts';

/**
 * Scheduling class (docs/50_tech/ai_architecture.md 2.3.2): A interactive (the player is
 * waiting), B story-critical, C routine, D background.
 */
export type RolePriority = 'A' | 'B' | 'C' | 'D';

export interface RolePack {
  /** Role name as used in AiRequestSpec.role, for example 'npc.daily'. */
  role: string;
  /** Bumped whenever the prompt text or limits change (written to every audit record). */
  version: string;
  /** Default model tier (configurable per role in AiRunnerOptions.roleTiers). */
  tier: ModelTier;
  effort: Effort;
  /** Output cap including thinking. */
  maxTokens: number;
  /** Stable rules text: identical for every agent of this role, so it is a cache prefix. */
  system: string;
  cacheTtl: CacheTtl;
  priority: RolePriority;
  /** Reserved roles (player conversation, story anchors) skip role shares and degrade last. */
  reserved: boolean;
  /** Real-time timeout for one call. */
  timeoutMs: number;
  /** Minimum real time between two dispatches for the same agent in this role. */
  cooldownMs: number;
  /** Cap on this role's spend, as a fraction of the hourly budget (ignored when reserved). */
  budgetShare: number;
  /** At most this many commands are accepted from one answer. */
  maxCommands: number;
  /** Whether the schema offers speech and thought fields. */
  speech: boolean;
  thought: boolean;
  /** Character caps applied to speech and thought after cleaning. */
  speechMaxChars: number;
  thoughtMaxChars: number;
  /**
   * When the model answers with zero commands: true closes the request with an empty
   * proposal (a deliberate "do nothing"); false declines so the deterministic fallback runs.
   */
  emptyIsDecision: boolean;
}

export class RoleRegistry {
  private readonly packs = new Map<string, RolePack>();

  /** `fallback` answers every role that has no pack of its own. */
  constructor(
    readonly fallback: RolePack,
    packs: readonly RolePack[] = [],
  ) {
    for (const p of packs) this.register(p);
  }

  register(pack: RolePack): void {
    if (this.packs.has(pack.role)) throw new Error(`duplicate role pack ${pack.role}`);
    this.packs.set(pack.role, pack);
  }

  /** The pack for a role, or the fallback pack. */
  get(role: string): RolePack {
    return this.packs.get(role) ?? this.fallback;
  }

  has(role: string): boolean {
    return this.packs.has(role);
  }

  roles(): string[] {
    return [...this.packs.keys()].sort();
  }
}
