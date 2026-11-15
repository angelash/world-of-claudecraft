// Role views for the inspector: everything the social and narrative systems expose
// about one NPC (npcView, memories, relations, diary, beliefs, rumours, appraisal) or
// one goddess (goddessView, the divine record, and her full slice data: power, gaze,
// covenant breaches, miracle ledger). Each query runs isolated, so a failing query is
// shown as an error instead of hiding the rest. Pure: no DOM.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { appraise, beliefView, circulatingRumors } from '../../systems/cognition';
import { divineRecord, goddessView } from '../../systems/goddess';
import { npcDiary, npcMemories, npcMemoryLines, npcRelations, npcView } from '../../systems/npc';
import { T } from '../text';
import { errorMessage } from '../util/json';

export interface RoleSection {
  title: string;
  /** JSON-able value, or undefined with an error */
  value?: unknown;
  error?: string;
}

export interface RoleEntry {
  kind: 'npc' | 'goddess';
  id: string;
  name: string;
  /** entity id when the role is present in the world */
  entityId?: string;
}

function section(title: string, fn: () => unknown): RoleSection {
  try {
    const value = fn();
    return { title, value: value === undefined ? null : value };
  } catch (e) {
    return { title, error: errorMessage(e) };
  }
}

/** NPCs known to the npc slice and goddesses in content, sorted by kind then id. */
export function roleEntries(world: World, content: ContentMap): RoleEntry[] {
  const out: RoleEntry[] = [];
  const npcs = world.slices.npc?.npcs ?? {};
  for (const id of Object.keys(npcs).sort()) {
    const st = npcs[id];
    let name = id;
    try {
      name = npcView(world, content, id)?.name ?? id;
    } catch {
      // keep the id
    }
    out.push({ kind: 'npc', id, name, entityId: st?.entityId });
  }
  const goddesses =
    (content as unknown as { goddesses?: { id: string; name: string }[] }).goddesses ?? [];
  for (const g of [...goddesses].sort((a, b) => a.id.localeCompare(b.id))) {
    out.push({ kind: 'goddess', id: g.id, name: g.name });
  }
  return out;
}

/** The npc id of an entity (by npc state, then by entity ref). */
export function npcIdForEntity(world: World, entityId: string): string | undefined {
  const npcs = world.slices.npc?.npcs ?? {};
  for (const [id, st] of Object.entries(npcs)) {
    if (st.entityId === entityId) return id;
  }
  const ref = world.slices.world?.entities[entityId]?.ref;
  return ref && ref in npcs ? ref : undefined;
}

export function npcSections(world: World, content: ContentMap, npcId: string): RoleSection[] {
  const playerId = world.slices.world?.playerId ?? 'player';
  const entityId = world.slices.npc?.npcs[npcId]?.entityId;
  return [
    section(T.roles.npcView, () => npcView(world, content, npcId)),
    section(T.roles.memoryLines, () => npcMemoryLines(world, npcId, 20)),
    section(T.roles.memories, () => npcMemories(world, npcId)),
    section(T.roles.relations, () => npcRelations(world, npcId)),
    section(T.roles.diary, () => npcDiary(world, npcId)),
    section(T.roles.belief, () => beliefView(world, content, npcId)),
    section(T.roles.rumors, () =>
      circulatingRumors(world, content).filter((r) => JSON.stringify(r).includes(`"${npcId}"`)),
    ),
    section(T.roles.appraise, () =>
      entityId ? appraise(world, content, entityId, playerId) : null,
    ),
  ];
}

export function goddessSections(
  world: World,
  content: ContentMap,
  goddessId: string,
): RoleSection[] {
  const slice = world.slices.goddess;
  return [
    section(
      T.roles.goddessView,
      () => goddessView(world, content).find((g) => g.id === goddessId) ?? null,
    ),
    section(T.roles.goddessState, () => slice?.goddesses[goddessId] ?? null),
    section(T.roles.divineRecord, () => divineRecord(world).filter((m) => m.goddess === goddessId)),
    section(T.roles.ledger, () => (slice?.ledger ?? []).filter((m) => m.goddess === goddessId)),
    section(T.roles.breaches, () => (slice?.breaches ?? []).filter((b) => b.goddess === goddessId)),
    section(T.roles.sediment, () => slice?.sediment ?? {}),
    section(T.roles.revelations, () => slice?.revelations ?? []),
  ];
}

export function roleSections(world: World, content: ContentMap, entry: RoleEntry): RoleSection[] {
  return entry.kind === 'npc'
    ? npcSections(world, content, entry.id)
    : goddessSections(world, content, entry.id);
}
