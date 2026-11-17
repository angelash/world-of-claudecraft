// Corridor and quest-detail adapters (ux_and_onboarding.md 9.5, 14.1, 14.2): the corridor
// mode's doors with their texts rendered (content names through their content keys), the grown
// segments and the door mirror's readings (door rank, blockage, fatigue; never the seal); and
// the quest log's act week, explicit expiry weeks and path labels. Pure functions of GameView
// plus each system's exported queries.

import { contentKey } from '../../core/content_key';
import type { FlagValue } from '../../core/contracts';
import { t, tOr } from '../../shared_ui/i18n';
import {
  corridorLayout,
  corridorOpen,
  corridorView,
  doorCosts,
  wingName,
} from '../../systems/doors';
import { ACT_WEEK_FLAG, questDef } from '../../systems/quests';
import type {
  CorridorAdapter,
  CorridorData,
  QuestDetail,
  QuestDetailAdapter,
} from '../view/adapters';
import type { GameView } from '../view/game_view';

/** A content field in the active language, else the record's own value. */
function contentField(table: string, id: string, field: string, value: string): string {
  if (!value) return value;
  return tOr(contentKey(table, id, field), value);
}

/** The door mirror's readings (thousand_doors.md 4, 6): never the seal. */
export function corridorMirror(view: GameView): CorridorData['mirror'] {
  const costs = doorCosts(view.world as never);
  return {
    rank: costs.rank,
    blockage: costs.blockage,
    blockageTier: costs.blockageTier,
    fatigue: costs.fatigue,
  };
}

export function corridorData(view: GameView): CorridorData {
  const world = view.world as never;
  const content = view.content as never;
  return {
    open: corridorOpen(world),
    segments: corridorLayout(world, content).segments,
    doors: corridorView(world, content).map((d) => ({
      ...d,
      name: d.nameShown ? contentField('doors', d.id, 'name', d.name) : '',
      hint: contentField('doors', d.id, 'hint', d.hint),
      desc: d.desc === undefined ? undefined : contentField('doors', d.id, 'desc', d.desc),
      categoryName: t(d.categoryName),
      stateName: t(d.stateName),
      wingName: t(wingName(d.wing)),
    })),
    mirror: corridorMirror(view),
  };
}

export function createCorridorAdapter(): CorridorAdapter {
  return { corridor: corridorData, mirror: corridorMirror };
}

/** A whole number flag, 0 when unset or not a number. */
function intFlag(v: FlagValue | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
}

export function createQuestDetailAdapter(): QuestDetailAdapter {
  return {
    actWeek: (view) => intFlag(view.flag(ACT_WEEK_FLAG)),
    detail(view, questId): QuestDetail | null {
      const content = view.content as { quests?: Parameters<typeof questDef>[0]['quests'] };
      const def = content.quests ? questDef({ quests: content.quests }, questId) : undefined;
      const slice = (
        view.world.slices as { quests?: { quests: Record<string, { path?: string }> } }
      ).quests;
      const path = slice?.quests[questId]?.path;
      if (!def) return null;
      let pathLabel = '';
      if (path) {
        def.stages.forEach((stage) => {
          stage.objectives.forEach((o, oi) => {
            if (!pathLabel && o.path === path)
              pathLabel = contentField(
                'quests',
                def.id,
                `stages.${stage.id}.objectives.${oi}.label`,
                o.label,
              );
          });
        });
      }
      return {
        title: contentField('quests', def.id, 'title', def.title),
        pathLabel,
        expiryWeek: def.expiry?.week ?? null,
      };
    },
  };
}
