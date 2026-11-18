// Targets the autoplayer could not walk to. The world answers a walk order it cannot path
// with `unreachable` (a monster standing in a pocket of the map that no path reaches, a
// wave member that spawned behind a fence); a player who runs into that wall picks another
// target and tries the first one again later, instead of walking into the wall for the
// rest of the night. Pure bookkeeping over ticks; the autoplayer feeds it the rejections.

import { TICKS_PER_GAME_HOUR } from '../../core/time';

/** How long a target the player could not reach is left alone (ticks). */
export const UNREACHABLE_SKIP = 4 * TICKS_PER_GAME_HOUR;

export class ReachMemory {
  private readonly until: Record<string, number> = {};

  /** A walk order toward this target was refused as unreachable at `tick`. */
  mark(id: string, tick: number): void {
    this.until[id] = tick + UNREACHABLE_SKIP;
  }

  /** Is this target worth walking to at `tick` (never refused, or refused long enough ago)? */
  ok(id: string, tick: number): boolean {
    const until = this.until[id];
    if (until === undefined) return true;
    if (until > tick) return false;
    delete this.until[id];
    return true;
  }

  /** The targets worth walking to, in their given order. */
  reachable(ids: readonly string[], tick: number): string[] {
    return ids.filter((id) => this.ok(id, tick));
  }
}
