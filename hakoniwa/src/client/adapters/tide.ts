// The tide-night adapter (../view/adapters_tide.ts): `tideView` plus the night's content
// record (lines, phases, the settlement's gap floors) with every name rendered through its
// content key, so the panel follows the interface language. Pure over GameView.

import { contentKey } from '../../core/content_key';
import { tOr } from '../../shared_ui/i18n';
import { type TideNightDef, tideView } from '../../systems/tide';
import type { TideAdapter, TideData } from '../view/adapters_tide';
import type { GameView } from '../view/game_view';

function nightDef(view: GameView, id: string): TideNightDef | undefined {
  return (view.content.tideNights ?? []).find((n) => n.id === id);
}

function placeName(view: GameView, mapId: string, id: string): string {
  const loc = view.map(mapId)?.locations.find((l) => l.id === id);
  return loc ? tOr(contentKey('maps', mapId, `locations.${id}.name`), loc.name) : id;
}

function personName(view: GameView, id: string): string {
  for (const table of ['npcs', 'companions'] as const) {
    const rec = (view.content[table] as { id: string; name: string }[] | undefined)?.find(
      (r) => r.id === id,
    );
    if (rec) return tOr(contentKey(table, id, 'name'), rec.name);
  }
  return id;
}

/** The night's data for the panel, or null without a night (exported for tests). */
export function tideData(view: GameView): TideData | null {
  const v = tideView(view.world as never, view.content as never);
  if (!v) return null;
  const def = nightDef(view, v.night);
  if (!def) return null;
  return {
    view: v,
    mapId: def.mapId,
    name: tOr(contentKey('tide_nights', def.id, 'name'), def.name),
    lines: def.lines.map((l) => ({
      id: l.id,
      name: placeName(view, def.mapId, l.location),
      face: !!l.face && !l.front,
    })),
    phases: def.phases.map((p) => ({ id: p.id, stage: p.stage })),
    surgePhase: def.phases.find((p) => p.surge)?.id ?? null,
    gaps: { injury: def.settle.injury.gap, death: def.settle.death.gap },
    placeName: (id) => placeName(view, def.mapId, id),
    personName: (id) => personName(view, id),
  };
}

export function createTideAdapter(): TideAdapter {
  return { tide: tideData };
}
