// The tide-night panel model (PK-M1-52's request; act1_borderstone.md 8.2 to 8.6): while the
// written night runs on the player's map, the phase, and per defence line what the runners
// report once a phase is settled (held, strained, broken open, fallen; never the defence or
// pressure numbers, UX-3), the buildings hit behind it and whether the player stood there.
// The face the surge falls on is named once that phase is settled. At dawn the summary: the
// town's state, the civilians lost, the named dead and hurt, the buildings damaged; the player
// closes it. Phase names that carry the sediment word use the mortal word until the player
// hears the real one (D-030). Pure; Node-tested. The painter is ./tide_panel.ts.

import { t, tOr } from '../../shared_ui/i18n';
import type { LineResult } from '../../systems/tide';
import type { TideData } from '../view/adapters_tide';

export type LineState = 'waiting' | 'held' | 'strained' | 'broken' | 'fallen';

export interface TideLineRow {
  id: string;
  name: string;
  state: LineState;
  stateLabel: string;
  /** the surge fell on this face (shown once the surge phase is settled) */
  weakest: boolean;
  /** the player held this line in a settled phase */
  player: boolean;
  /** buildings behind the line damaged so far */
  damaged: string[];
}

export interface TideSummaryRow {
  survival: string;
  civilians: string;
  named: string[];
  injured: string[];
  buildings: string[];
}

export interface TidePanelRow {
  night: string;
  title: string;
  phase: string;
  lines: TideLineRow[];
  /** set at dawn: the night is settled */
  summary: TideSummaryRow | null;
}

export interface TidePanelInput {
  data: TideData | null;
  /** the player stands on the night's map */
  onMap: boolean;
  dianKnown: boolean;
  /** the night whose dawn summary the player closed */
  dismissed: string | null;
}

/** A phase's display name: the mortal variant before the word is known, when there is one. */
export function phaseLabel(id: string, dianKnown: boolean): string {
  const mortal = dianKnown ? '' : tOr(`ui.hud.tide.phase_mortal.${id}`, '');
  return mortal || tOr(`ui.hud.tide.phase.${id}`, id);
}

/** The state of a line from its latest settled result and the settlement's gap floors. */
export function lineState(r: LineResult | undefined, gaps: TideData['gaps']): LineState {
  if (!r) return 'waiting';
  if (r.struck || r.gap <= 0) return 'held';
  if (r.gap < gaps.injury) return 'strained';
  if (r.gap < gaps.death) return 'broken';
  return 'fallen';
}

export function tidePanelModel(i: TidePanelInput): TidePanelRow | null {
  const d = i.data;
  if (!d || !i.onMap) return null;
  const v = d.view;
  if (v.summary && i.dismissed === v.night) return null;
  const latest = new Map<string, LineResult>();
  const damaged = new Map<string, string[]>();
  const player = new Set<string>();
  for (const res of v.results) {
    for (const l of res.lines) {
      latest.set(l.line, l);
      if (l.player) player.add(l.line);
      if (l.damaged.length) damaged.set(l.line, [...(damaged.get(l.line) ?? []), ...l.damaged]);
    }
  }
  const surgeSettled =
    !!v.summary || (d.surgePhase !== null && v.results.some((r) => r.phase === d.surgePhase));
  const lines: TideLineRow[] = d.lines
    // a separate front shows once someone held it (it is settled only then)
    .filter((l) => l.face || latest.has(l.id))
    .map((l) => {
      const state = lineState(latest.get(l.id), d.gaps);
      return {
        id: l.id,
        name: l.name,
        state,
        stateLabel: t(`ui.hud.tide.state.${state}`),
        weakest: surgeSettled && v.weakest === l.id,
        player: player.has(l.id),
        damaged: (damaged.get(l.id) ?? []).map((p) => d.placeName(p)),
      };
    });
  const s = v.summary;
  return {
    night: v.night,
    title: d.name,
    phase: phaseLabel(v.phase, i.dianKnown),
    lines,
    summary: s
      ? {
          survival: tOr(`ui.hud.tide.survival.${s.survival}`, s.survival),
          civilians: t('ui.hud.tide.civilians', { n: s.civilians }),
          named: s.named.map((p) => d.personName(p)),
          injured: s.injured.map((p) => d.personName(p)),
          buildings: s.buildings.map((p) => d.placeName(p)),
        }
      : null,
  };
}
