// Corridor view (千门回廊界面): each door's state, hint and key progress. Hidden doors
// are left out unless asked for; key labels show only once a door is hinted, so the
// corridor never spoils a door the player has not glimpsed.

import type { ContentMap } from '../../core/contracts';
import { type KeyText, type TextParam, tr } from '../../core/text';
import type { World } from '../../core/world';
import { type KeyProgress, keyProgress } from './keys';
import type { DoorCategory, DoorStatus } from './types';

/** Display name of a door category (a fresh text key each call; it ends up in views). */
export function categoryName(category: DoorCategory): KeyText {
  return tr(`sys.doors.category.${category}`);
}

/** Display name of a door state (a fresh text key each call). */
export function statusName(state: DoorStatus): KeyText {
  return tr(`sys.doors.status.${state}`);
}

/** One door in the corridor; labels are text keys in the kernel, strings once rendered. */
export interface DoorView<Text = TextParam> {
  id: string;
  name: string;
  code?: string;
  category: DoorCategory;
  categoryName: Text;
  act: number;
  state: DoorStatus;
  stateName: Text;
  hint: string;
  /** what the door gives; only once opened or closed */
  desc?: string;
  keys: KeyProgress[];
  danger: boolean;
  closable: boolean;
}

export function corridorView(world: World, content: ContentMap, includeHidden = false): DoorView[] {
  const out: DoorView[] = [];
  for (const door of content.doors ?? []) {
    const state = world.slices.doors?.doors[door.id]?.state ?? 'hidden';
    if (state === 'hidden' && !includeHidden) continue;
    const known = state !== 'hidden';
    out.push({
      id: door.id,
      name: door.name,
      code: door.code,
      category: door.category,
      categoryName: categoryName(door.category),
      act: door.act,
      state,
      stateName: statusName(state),
      hint: door.hint,
      desc: state === 'opened' || state === 'closed' ? door.desc : undefined,
      keys: known || includeHidden ? keyProgress(world, door) : [],
      danger: !!door.danger,
      closable: !!door.closable,
    });
  }
  return out;
}

export function doorState(world: World, doorId: string): DoorStatus {
  return world.slices.doors?.doors[doorId]?.state ?? 'hidden';
}

/** The hidden seal variables (for the editor workbench; never shown to the player). */
export function sealState(world: World): { looseness: number; unrest: number; opened: number } {
  const f = world.meta.flags;
  const num = (v: unknown) => (typeof v === 'number' ? v : 0);
  return {
    looseness: num(f.seal_looseness),
    unrest: num(f.seal_unrest),
    opened: num(f.doors_opened),
  };
}
