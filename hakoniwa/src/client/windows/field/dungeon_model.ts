// Implements the model of `ui_win_dungeon`, the dungeon state window (ux_and_onboarding.md
// 6.3.10): the known dungeons (entered at least once) with name, where its gate stands, form
// (never the pressure number), state and the overflow days left, disposition, owner, party
// cap, the core cleared and the floor bosses, and the left items lying inside with the days
// before the dungeon swallows them. The forms and states use the mortal words before
// `term.dian_known` (D-030, ../../hud/dungeon_bar_model.ts), and so do the dungeon's and the
// bosses' names (../records/mortal_name.ts). Only the bosses already defeated are named: the
// others would spoil floors the player has not reached, so they count as "N not yet explored".
// Disposing is a heavy choice: the window asks with a confirm whose body names the consequence.
// Pure; Node-tested.

import { contentKey } from '../../../core/content_key';
import { TICKS_PER_GAME_DAY } from '../../../core/time';
import { t, tOr } from '../../../shared_ui/i18n';
import type { Choice, ChoiceState } from '../../../systems/dungeons/types';
import type { DungeonListEntry } from '../../../systems/dungeons/view';
import { formName, stateName } from '../../hud/dungeon_bar_model';
import { mortalName } from '../records/mortal_name';

/** The three dispositions, in the order the window offers them (1.3). */
export const DISPOSITIONS: readonly Choice[] = ['nurture', 'destroy', 'purify'];

export interface DungeonRow {
  id: string;
  name: string;
  place: string;
  form: string;
  state: string;
  /** days before the overflow; '' without a running clock */
  overflow: string;
  disposition: string;
  /** the party cap */
  cap: string;
  /** core cleared or not */
  clear: string;
  /** the bosses already defeated, by name */
  bosses: { label: string; defeated: boolean }[];
  /** the count of bosses not yet met ("not yet explored"), '' when every one is down */
  unexplored: string;
  /** left items and the days to the first swallowed, or '' */
  lost: string;
  /** offered dispositions (none once one is made, or after collapse or purification) */
  choices: { choice: Choice; label: string; confirm: string }[];
}

function dispositionName(c: ChoiceState): string {
  return t(`ui.win.dungeon.disposition.${c}`);
}

export interface DungeonModelInput {
  list: readonly DungeonListEntry[];
  dianKnown: boolean;
  tick: number;
  bossName: (id: string) => string;
}

export function dungeonModel(i: DungeonModelInput): { rows: DungeonRow[]; empty: boolean } {
  const rows = i.list.map((d) => {
    const lost = d.lostItems;
    const first = lost[0];
    const days = first
      ? Math.max(0, Math.ceil((first.swallowTick - i.tick) / TICKS_PER_GAME_DAY))
      : 0;
    const settled = d.disposition !== 'untouched' || d.collapsed || d.purified;
    return {
      id: d.id,
      name: mortalName(t(d.name), i.dianKnown),
      place: t('ui.win.dungeon.place', {
        map: tOr(contentKey('maps', d.mapId, 'name'), d.mapId),
      }),
      form: formName(d.form, d.formName, i.dianKnown),
      state: stateName(d.state, d.stateName, i.dianKnown),
      overflow:
        d.overflowDays === null ? '' : t('ui.win.dungeon.overflow_in', { n: d.overflowDays }),
      disposition: dispositionName(d.disposition),
      cap: t('ui.win.dungeon.cap', { n: d.partyLimit }),
      clear: t(d.firstClear ? 'ui.win.dungeon.cleared' : 'ui.win.dungeon.not_cleared'),
      bosses: d.bosses
        .filter((b) => b.defeated)
        .map((b) => ({
          label: t('ui.win.dungeon.boss_down', {
            name: mortalName(i.bossName(b.id), i.dianKnown),
          }),
          defeated: true,
        })),
      unexplored: (() => {
        const n = d.bosses.filter((b) => !b.defeated).length;
        return n > 0 ? t('ui.win.dungeon.unexplored', { n }) : '';
      })(),
      lost: first ? t('ui.win.dungeon.lost', { n: lost.length, days }) : '',
      choices: settled
        ? []
        : DISPOSITIONS.map((c) => ({
            choice: c,
            label: t(`ui.win.dungeon.choose.${c}`),
            confirm: t(`ui.win.dungeon.confirm.${c}`),
          })),
    };
  });
  return { rows, empty: rows.length === 0 };
}
