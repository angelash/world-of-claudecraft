// A monster stops fighting without dying (combat_and_classes.md 10.7, 12.1 `yielded`): it
// turns neutral, leaves every threat table, drops its timed auras, its cast and its ground
// warnings, and stands still. Yielding at a health line (death.ts) and the non-combat
// resolutions (boss/resolve.ts) both end a fight this way.

import type { SystemContext } from '../../core/system';
import { haltEntity } from '../world';
import { removeAurasWhere } from './auras';
import { cancelWarnings } from './telegraph';
import { forgetAttacker } from './threat';
import type { Unit } from './types';
import { refreshTags } from './units';

export function standDown(ctx: SystemContext, u: Unit, despawnAt = 0): void {
  if (u.ai) {
    u.ai.state = 'yielded';
    u.ai.despawnAt = despawnAt;
  }
  u.side = 'neutral';
  u.threat = {};
  u.target = null;
  u.autoAttack = false;
  u.cast = null;
  u.forced = undefined;
  cancelWarnings(ctx, u.id, false);
  forgetAttacker(ctx.world, u.id);
  removeAurasWhere(ctx, u, (a) => a.expires !== 0);
  haltEntity(ctx, u.id);
  refreshTags(ctx, u);
}
