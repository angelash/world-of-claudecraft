// Implements the model of `ui_win_beasts`, beast companions and mounts (ux_and_onboarding.md
// 6.3.5), as far as the M1 kernel keeps them: the beast companions and retainers with their
// species, kind and state, and what they guard; the mounts the player owns with day's travel,
// load and whether one is ridden. This is the player's own window, so a beast resting or at
// the spring shows its real state: "whereabouts unknown" is how others see a beast hidden in
// the courtyard (6.3.5), not how its keeper does. Yeyu is a retainer and is never named a
// messenger here (content review: the messenger is a later reveal). Feeding, depth and named
// beasts are M2 (the party system has no field for them yet). Pure; Node-tested.

import { contentKey } from '../../../core/content_key';
import { t, tOr } from '../../../shared_ui/i18n';
import type { MemberState } from '../../../systems/party/types';
import type { BeastView } from '../../../systems/party/view';
import type { MountRow } from '../../view/adapters_field';

export interface PetRow {
  id: string;
  name: string;
  /** half-bound beast or retainer (never "messenger") */
  kind: string;
  state: string;
  /** "keeps the left bag", or '' */
  guarding: string;
  /** hit points, or '' when it is not in the world */
  hp: string;
  canRelease: boolean;
}

export interface MountView {
  id: string;
  name: string;
  /** day's travel in km and load in kg */
  stats: string;
  active: boolean;
}

export interface BeastsModel {
  pets: PetRow[];
  mounts: MountView[];
  petsEmpty: boolean;
  mountsEmpty: boolean;
}

/** The beast's state as its keeper knows it (the party system's own state name). */
export function petStateText(state: MemberState): string {
  return t(`sys.party.state.${state}`);
}

export interface BeastsModelInput {
  pets: readonly BeastView[];
  mounts: readonly MountRow[];
  speciesName: (id: string) => string;
}

export function beastsModel(i: BeastsModelInput): BeastsModel {
  const pets = i.pets.map((p) => ({
    id: p.id,
    name: i.speciesName(p.species),
    kind: t(p.kind === 'half' ? 'ui.win.beasts.kind_half' : 'ui.win.beasts.kind_retainer'),
    state: petStateText(p.state),
    guarding: p.guarding ? t('ui.win.beasts.guarding') : '',
    hp: p.unit ? t('ui.win.beasts.hp', { hp: p.unit.hp, max: p.unit.maxHp }) : '',
    // a retainer is bound by a door's pact: only a half-bound beast may be let go
    canRelease: p.kind === 'half' && p.state !== 'dead',
  }));
  const mounts = i.mounts.map((m) => ({
    id: m.def.id,
    name: tOr(contentKey('mounts', m.def.id, 'name'), m.def.name),
    stats: t('ui.win.beasts.mount_stats', { km: m.def.dayKm, kg: m.def.load }),
    active: m.active,
  }));
  return { pets, mounts, petsEmpty: pets.length === 0, mountsEmpty: mounts.length === 0 };
}
