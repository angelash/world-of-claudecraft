// Where the combat slice keeps content ids, for the rename table (release_engineering.md
// 5.5 `idFields`): the aura ids on every unit; the ability ids in cooldowns, casts, door
// grants, boss phase lists and the outsider's skill rack (the racked abilities and those
// taken off by hand); and the monster a unit was spawned from. A save written
// before an ability, aura or monster was renumbered loads with the new ids
// (data/registry/renames.json, kinds `ability`, `aura` and `monster`).

import type { IdField } from '../../core/save/renames';

export const COMBAT_ID_FIELDS: readonly IdField[] = [
  { path: 'units.*.auras.*.id', kind: 'aura' },
  { path: 'units.*.cds.@keys', kind: 'ability' },
  { path: 'units.*.cast.abilityId', kind: 'ability' },
  { path: 'units.*.abilities.*', kind: 'ability' },
  { path: 'units.*.phaseAbilities.*', kind: 'ability' },
  { path: 'units.*.rack.*', kind: 'ability' },
  { path: 'units.*.rackOff.*', kind: 'ability' },
  { path: 'units.*.monsterId', kind: 'monster' },
  { path: 'bags.*.items.*.itemId', kind: 'item' },
];
