// Boss actions (combat_and_classes.md 10.1, 19.2 `BossAction`): what a phase's `onEnter`, an
// arena object's effect or a broken part runs. A cast goes through the ability path; one
// that cannot start now (a cast in progress, the warning cap full) waits in the fight's
// queue and is tried again each second. Scripted beats (lines, a companion's scripted move,
// a cutscene) hang here as `say` and `flag`, never as story branches in the kernel.

import type { SystemContext } from '../../../core/system';
import { useAbility } from '../abilities';
import type { BossAction } from '../mech_types';
import type { Unit } from '../types';
import { announceAdds } from './adds';
import { bossSay, fightOf, mechOf } from './fight';
import { raiseShield, staggerBoss } from './shields';
import { setTerrainState } from './terrain';

/** Refusals a scripted cast waits out; any other refusal drops it (it would never start). */
const WAIT_CODES: ReadonlySet<string> = new Set(['busy', 'warn_cap', 'disabled', 'silenced']);

/** Try a boss cast now: 'done', 'wait' (a cast in progress, the cap full) or 'drop'. */
export function castNow(ctx: SystemContext, u: Unit, abilityId: string): 'done' | 'wait' | 'drop' {
  if (u.cast) return 'wait';
  const r = useAbility(ctx, u, abilityId, u.target, { force: true });
  if (r.ok) return 'done';
  return WAIT_CODES.has(r.code) ? 'wait' : 'drop';
}

/** Run actions in order; `path` is their place in the monster record (for the line keys). */
export function runActions(
  ctx: SystemContext,
  u: Unit,
  actions: readonly BossAction[],
  path: string,
): void {
  const mm = mechOf(ctx, u);
  if (!mm) return;
  actions.forEach((a, i) => {
    switch (a.do) {
      case 'cast':
        if (castNow(ctx, u, a.ability) === 'wait') {
          const fight = fightOf(ctx, u);
          fight.queued = [...(fight.queued ?? []), a.ability];
        }
        return;
      case 'adds':
        announceAdds(ctx, u, a, -1);
        return;
      case 'terrain':
        setTerrainState(ctx, u, a.object, a.state);
        return;
      case 'shield':
        raiseShield(ctx, u, a.ref);
        return;
      case 'say':
        bossSay(ctx, u, mm.mon, `${path}.${i}.line`, a.line);
        return;
      case 'flag':
        ctx.setFlag(a.name, a.value);
        return;
      case 'stagger':
        staggerBoss(ctx, u, a.seconds);
        return;
    }
  });
}

/** Queued casts start once the boss is free (once a second). */
export function drainQueue(ctx: SystemContext, u: Unit): void {
  const fight = u.boss;
  if (!fight?.queued || fight.queued.length === 0 || u.cast) return;
  const next = fight.queued[0] as string;
  if (castNow(ctx, u, next) === 'wait') return;
  fight.queued = fight.queued.slice(1);
  if (fight.queued.length === 0) delete fight.queued;
}
