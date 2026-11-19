// Implements the model of `ui_hud_dungeon` (ux_and_onboarding.md 5.2, the field status bar):
// while the player stands in a dungeon, a nest or a goddess trial, the bar names the dungeon
// and the floor, the form, the state, the party against this field's cap, and whether this
// floor's boss is down. Before the player hears the word from Yeyu (`term.dian_known`,
// reveal_ledger.md 6, D-030) the forms and the states carry the mortal words: the kernel hands
// its own `sys.dungeons.*` keys, and this core picks the `ui.hud.dungeon.*_mortal.*` ones
// instead, and the dungeon's own name goes through the mortal rule too. The left-item line
// shows only while something the player left lies in this dungeon (a timer for nothing is
// noise). Pure; Node-tested. The painter is ./dungeon_bar.ts.

import type { KeyText } from '../../core/text';
import { t } from '../../shared_ui/i18n';
import type { DungeonForm } from '../../systems/dungeons/types';
import type { DungeonFieldView, DungeonListEntry, FieldState } from '../../systems/dungeons/view';
import { mortalName } from '../windows/records/mortal_name';

/** The registered flag that switches the mortal words for the canon ones (D-030). */
export { DIAN_KNOWN_FLAG } from '../view/mortal_terms';

export interface DungeonBarRow {
  /** the dungeon's name, with the floor's when the record gives one */
  name: string;
  /** form: lair, shallow, dungeon, great (mortal words before the term is known) */
  form: string;
  /** state: normal, active, overflow, collapsing, purifying */
  state: string;
  /** party count: companions in the party against this field's cap */
  party: string;
  /** the party is over this field's cap (the window says what to do) */
  overCap: boolean;
  /** this floor's boss is down or still up; '' when the floor has none */
  boss: string;
  /** how long a left item lies before the dungeon swallows it; '' with nothing left inside */
  leftItems: string;
}

/** The form's name: the canon word once the player knows it, the mortal word before. */
export function formName(form: DungeonForm, canon: KeyText, dianKnown: boolean): string {
  return dianKnown ? t(canon) : t(`ui.hud.dungeon.form_mortal.${form}`);
}

/** The state's name, mortal before the term is known. */
export function stateName(state: FieldState, canon: KeyText, dianKnown: boolean): string {
  return dianKnown ? t(canon) : t(`ui.hud.dungeon.state_mortal.${state}`);
}

/** How many of the player's left items lie in the dungeon the field names. */
export function leftItemsIn(
  field: DungeonFieldView | null,
  list: readonly Pick<DungeonListEntry, 'id' | 'lostItems'>[],
): number {
  if (!field) return 0;
  return list.find((d) => d.id === field.dungeonId)?.lostItems.length ?? 0;
}

/**
 * The bar's row, or null outside every dungeon (the bar then hides). `leftHere` is how many
 * of the player's left items lie in this dungeon (the dungeon window's `lostItems`).
 */
export function dungeonBarModel(
  field: DungeonFieldView | null,
  dianKnown: boolean,
  leftHere = 0,
): DungeonBarRow | null {
  if (!field) return null;
  const base = mortalName(t(field.name), dianKnown);
  const name = field.floorName
    ? t('ui.hud.dungeon.name_floor', {
        name: base,
        floor: mortalName(t(field.floorName), dianKnown),
      })
    : base;
  return {
    name,
    form: formName(field.form, field.formName, dianKnown),
    state: stateName(field.state, field.stateName, dianKnown),
    party: t('ui.hud.dungeon.party', { n: field.party, cap: field.cap }),
    overCap: field.party > field.cap,
    boss:
      field.floorBossDown === null
        ? ''
        : t(field.floorBossDown ? 'ui.hud.dungeon.boss_down' : 'ui.hud.dungeon.boss_up'),
    leftItems:
      leftHere > 0 ? t('ui.hud.dungeon.left_items', { n: leftHere, days: field.leftItemDays }) : '',
  };
}
