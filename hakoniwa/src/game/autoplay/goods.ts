// Items for the autoplayer: which piece of equipment to put on, and which loot is safe
// to sell. Pure functions over the content and one holding.

import type { ContentMap } from '../../core/contracts';
import type { DoorDef, KeyCond } from '../../systems/doors/types';
import type { Holding, ItemDef } from '../../systems/inventory';

/** A rough worth of a piece of equipment for an outsider who swings what they hold. */
export function gearScore(def: ItemDef): number {
  let s = 0;
  for (const [k, v] of Object.entries(def.stats ?? {})) s += k === 'armor' ? v / 10 : v * 2;
  if (def.weapon && def.weapon.range <= 2) {
    s += ((def.weapon.min + def.weapon.max) / 2 / Math.max(0.5, def.weapon.speed)) * 6;
  }
  return s;
}

/** The best upgrade in the pack (one item id), or null when everything worn is best. */
export function gearUpgrade(content: ContentMap, h: Holding, level: number): string | null {
  let best: { id: string; gain: number } | null = null;
  for (const id of Object.keys(h.items).sort()) {
    if ((h.items[id] ?? 0) <= 0) continue;
    const def = content.items.find((i) => i.id === id);
    if (!def?.slot || (def.level ?? 1) > level) continue;
    if (def.weapon && def.weapon.range > 2) continue;
    const worn = h.equipped[def.slot];
    if (worn === id) continue;
    const cur = worn ? content.items.find((i) => i.id === worn) : undefined;
    const gain = gearScore(def) - (cur ? gearScore(cur) : 0);
    if (gain > 0.5 && (!best || gain > best.gain)) best = { id, gain };
  }
  return best?.id ?? null;
}

function keyItems(keys: KeyCond[], out: Set<string>): void {
  for (const k of keys) {
    if (k.type === 'item') out.add(k.itemId);
    else if (k.type === 'any') keyItems(k.of, out);
  }
}

/** Items the story or the door corridor still asks for: never sell these. */
export function keptItems(content: ContentMap): Set<string> {
  const out = new Set<string>(['grain', 'wood', 'stone', 'bread', 'fish', 'meat']);
  for (const door of (content.doors ?? []) as DoorDef[]) keyItems(door.keys, out);
  for (const q of content.quests ?? []) {
    for (const st of q.stages) {
      for (const o of st.objectives) if (o.type === 'collect') out.add(o.item);
    }
  }
  for (const id of content.economy_config?.illegalItems ?? []) out.add(id);
  return out;
}

/** Loot worth turning into coin: plain materials nobody asks for. */
export function sellable(content: ContentMap, h: Holding, kept: Set<string>): [string, number][] {
  const out: [string, number][] = [];
  for (const id of Object.keys(h.items).sort()) {
    const n = h.items[id] ?? 0;
    if (n <= 0 || kept.has(id)) continue;
    const def = content.items.find((i) => i.id === id);
    if (!def || def.kind !== 'material' || def.value <= 0) continue;
    out.push([id, n]);
  }
  return out;
}
