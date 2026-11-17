// What the autoplayer does for the objective kinds of the quest model (PK-M1-58): talk to
// the person (deliver, persuade, free a captive), walk to the place (stealth: the
// no-model build has no detection yet), or let time pass while the kernel's evidence comes
// (escort, follow, accompany, investigate, gather, craft, trade, duel: the systems that
// move people, gather, craft and duel answer those, PK-M1-15, PK-M1-18, PK-M1-49).

import type { Objective } from '../../systems/quests/types';

export type ObjectivePlan =
  | { kind: 'talk'; npc: string }
  | { kind: 'reach'; mapId: string; location?: string }
  | { kind: 'wait' }
  | null;

/** The plan for one of the model's objectives; null for the kinds player.ts handles itself. */
export function modelObjectivePlan(o: Objective): ObjectivePlan {
  switch (o.type) {
    case 'deliver':
    case 'persuade':
    case 'rescue':
      return { kind: 'talk', npc: o.npc };
    case 'stealth':
      return { kind: 'reach', mapId: o.mapId, location: o.location };
    case 'escort':
    case 'follow':
    case 'accompany':
    case 'investigate':
    case 'gather':
    case 'craft':
    case 'trade':
    case 'duel':
      return { kind: 'wait' };
    default:
      return null;
  }
}
