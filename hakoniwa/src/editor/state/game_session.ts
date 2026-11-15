// The live game the workbench is looking at: the inspector creates it (engine, content,
// optional AI runner); the audit desk, the role views and the reveal review read it.
// One shared object instead of tools reaching into each other. Pure: no DOM.

import type { AiRunner } from '../../ai/runner';
import type { ContentMap } from '../../core/contracts';
import type { Engine } from '../../core/engine';

export type ProviderKind = 'proxy' | 'mock' | 'null';

export interface LiveGame {
  engine: Engine;
  content: ContentMap;
  /** the world came from an imported snapshot, not a fresh seed */
  imported: boolean;
  runner: AiRunner | null;
  provider: ProviderKind | null;
  /** why this provider was chosen (status reason, fallback note) */
  providerNote: string;
}

export class GameSession {
  private current: LiveGame | null = null;
  private detachRunner: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();
  private version = 0;

  get game(): LiveGame | null {
    return this.current;
  }

  /** Increments whenever the game is replaced. */
  get revision(): number {
    return this.version;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Replace the live game; the previous runner stops pumping. */
  set(game: LiveGame | null): void {
    this.detachRunner?.();
    this.detachRunner = null;
    this.current = game;
    if (game?.runner) this.detachRunner = game.runner.attach();
    this.version++;
    for (const fn of this.listeners) fn();
  }

  /** Tell listeners the game changed in place (for example a snapshot was stepped). */
  touch(): void {
    for (const fn of this.listeners) fn();
  }
}
