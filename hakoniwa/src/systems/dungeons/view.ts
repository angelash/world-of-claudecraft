// The data side of the dungeon panels (ux_and_onboarding.md 5.2 `ui_hud_dungeon` and 6.3.10
// `ui_win_dungeon`). The field status bar, shown while the player is in a dungeon, names the
// dungeon and floor, the form, the state (normal, active, overflow, a collapse or ritual
// under way), the party cap against the party, whether this floor's boss is down, and how
// long a left item lies before the dungeon swallows it. The dungeon window lists the known
// dungeons (entered at least once): form, state and the overflow days left, disposition,
// owner, party cap, whether the core is cleared, the floor bosses, and the left items lying
// inside with the tick the dungeon swallows them. Pure: reads the world and the content.

import { contentRef } from '../../core/content_key';
import type { ContentMap } from '../../core/contracts';
import { type KeyText, type TextParam, tr } from '../../core/text';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import type { World } from '../../core/world';
import { isInParty } from '../party/view';
import { dungeonConfig, dungeonDef, floorAt, formOf, partyCap } from './layout';
import { leftItemPort, swallowTick } from './left_items';
import { readDungeons } from './slice';
import { isActive } from './state';
import type { ChoiceState, DungeonDef, DungeonForm, DungeonState } from './types';

export type FieldState = 'normal' | 'active' | 'overflow' | 'collapsing' | 'purifying';

export interface DungeonFieldView {
  dungeonId: string;
  name: TextParam;
  floorId: string;
  /** the floor's name, when the record gives one */
  floorName: TextParam | null;
  depth: number;
  form: DungeonForm;
  formName: KeyText;
  state: FieldState;
  stateName: KeyText;
  /** companions allowed besides the player, and companions in the party */
  cap: number;
  party: number;
  /** the floor's boss is down; null when the floor has none */
  floorBossDown: boolean | null;
  /** game days a left item lies before the dungeon swallows it */
  leftItemDays: number;
}

function fieldState(world: World, st: DungeonState, isOn: boolean): FieldState {
  if (st.pending?.choice === 'destroy') return 'collapsing';
  if (st.pending?.choice === 'purify') return 'purifying';
  if (st.overflowed >= 0 && world.meta.tick < st.overflowed + TICKS_PER_GAME_DAY) return 'overflow';
  return isOn ? 'active' : 'normal';
}

const partyNow = (world: World, content: ContentMap) =>
  (content.companions ?? []).filter((c) => isInParty(world, c.id)).length;

/** The field status bar of the player's visit, or null outside every dungeon. */
export function fieldView(world: World, content: ContentMap): DungeonFieldView | null {
  const s = readDungeons(world);
  const cfg = dungeonConfig(content);
  const run = s?.run;
  if (!s || !cfg || !run) return null;
  const def = dungeonDef(content, run.dungeon);
  const st = s.instances[run.dungeon];
  const floor = def?.floors.find((f) => f.id === run.floor);
  if (!def || !st || !floor) return null;
  const form = formOf(cfg, st.pressure);
  const state = fieldState(world, st, isActive(cfg, st));
  return {
    dungeonId: def.id,
    name: contentRef('dungeons', def.id, 'name'),
    floorId: floor.id,
    floorName: floor.name ? contentRef('dungeons', def.id, `floors.${floor.id}.name`) : null,
    depth: floor.depth,
    form,
    formName: tr(`sys.dungeons.form.${form}`),
    state,
    stateName: tr(`sys.dungeons.state.${state}`),
    cap: partyCap(cfg, def, st.pressure),
    party: partyNow(world, content),
    floorBossDown: floor.boss ? world.meta.flags[`boss.${floor.boss}.defeated`] === true : null,
    leftItemDays: cfg.leftItemDays,
  };
}

export interface DungeonListEntry {
  id: string;
  name: TextParam;
  /** the map the gate stands on */
  mapId: string;
  form: DungeonForm;
  formName: KeyText;
  state: FieldState;
  stateName: KeyText;
  /** game days left on the overflow clock, null without a running clock */
  overflowDays: number | null;
  disposition: ChoiceState;
  collapsed: boolean;
  purified: boolean;
  owner: string | null;
  partyLimit: number;
  /** the core boss is down */
  firstClear: boolean;
  bosses: { id: string; floorId: string; defeated: boolean }[];
  /** left items lying inside, with the tick the dungeon swallows each */
  lostItems: { id: string; swallowTick: number }[];
  /** activity-period affixes (not drawn yet: catalog 1.3, a later package) */
  affixes: string[];
}

function entry(world: World, content: ContentMap, def: DungeonDef, st: DungeonState) {
  const cfg = dungeonConfig(content);
  if (!cfg) return null;
  const form = formOf(cfg, st.pressure);
  const state = fieldState(world, st, isActive(cfg, st));
  const flags = world.meta.flags;
  const port = leftItemPort();
  const lost = (port?.items(world) ?? [])
    .filter((i) => floorAt(content, i.mapId, i.x, i.y, (d) => d.id === def.id))
    .map((i) => ({ id: i.id, swallowTick: swallowTick(world, content, i) }))
    .filter((i): i is { id: string; swallowTick: number } => i.swallowTick !== null)
    .sort((a, b) => a.swallowTick - b.swallowTick || (a.id < b.id ? -1 : 1));
  const out: DungeonListEntry = {
    id: def.id,
    name: contentRef('dungeons', def.id, 'name'),
    mapId: def.gate.mapId,
    form,
    formName: tr(`sys.dungeons.form.${form}`),
    state,
    stateName: tr(`sys.dungeons.state.${state}`),
    overflowDays:
      st.overflowAt >= 0
        ? Math.max(0, Math.ceil((st.overflowAt - world.meta.tick) / TICKS_PER_GAME_DAY))
        : null,
    disposition: st.choice,
    collapsed: st.collapsed,
    purified: st.purified,
    owner: def.owner ?? null,
    partyLimit: partyCap(cfg, def, st.pressure),
    firstClear: st.cleared,
    bosses: def.floors
      .filter((f) => !!f.boss)
      .map((f) => ({
        id: f.boss as string,
        floorId: f.id,
        defeated: flags[`boss.${f.boss}.defeated`] === true,
      })),
    lostItems: lost,
    affixes: [],
  };
  return out;
}

/** The known dungeons (entered at least once), in content order. */
export function dungeonsView(world: World, content: ContentMap): DungeonListEntry[] {
  const s = readDungeons(world);
  if (!s) return [];
  const out: DungeonListEntry[] = [];
  for (const def of content.dungeons ?? []) {
    const st = s.instances[def.id];
    if (!st || st.entries === 0) continue;
    const e = entry(world, content, def, st);
    if (e) out.push(e);
  }
  return out;
}
