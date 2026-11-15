// Moira's last record (act6 12): assemble the epilogue for an ending from written
// templates, layer by layer from the gods down to the player (reverse zoom), choosing
// required entries first and then by weight, and filling the slots from world flags.
// This is the no-model version; a model may only polish within the template meaning.

import type { FlagValue } from '../../core/contracts';
import { evaluate, flagResolver } from '../quests/conditions';
import { fillSlots } from '../quests/speakers';
import type { EpilogueEntry, EpilogueLayer } from './types';

export const LAYER_ORDER: readonly EpilogueLayer[] = [
  'gods',
  'races',
  'nations',
  'kingdom',
  'city',
  'town',
  'companions',
  'player',
];

/** Upper bounds per layer (act6 12.1). */
export const LAYER_CAP: Record<EpilogueLayer, number> = {
  gods: 6,
  races: 4,
  nations: 4,
  kingdom: 2,
  city: 2,
  town: 3,
  companions: 10,
  player: 3,
};

export interface EpilogueLine {
  layer: EpilogueLayer;
  subject: string;
  year: number;
  text: string;
}

function matchesEnding(e: EpilogueEntry, ending: string): boolean {
  if (e.endings.includes(ending)) return true;
  return e.endings.includes('*') && ending !== 'reclaim' && ending !== 'maker';
}

export function assembleEpilogue(
  flags: Record<string, FlagValue>,
  entries: readonly EpilogueEntry[],
  ending: string,
): EpilogueLine[] {
  const resolve = flagResolver(flags);
  const out: EpilogueLine[] = [];
  for (const layer of LAYER_ORDER) {
    const pool = entries
      .filter((e) => e.layer === layer && matchesEnding(e, ending) && evaluate(e.when, resolve))
      .sort(
        (a, b) =>
          Number(!!b.required) - Number(!!a.required) ||
          (b.weight ?? 0) - (a.weight ?? 0) ||
          a.id.localeCompare(b.id),
      );
    const subjects = new Set<string>();
    let taken = 0;
    for (const e of pool) {
      if (subjects.has(e.subject)) continue;
      if (!e.required && taken >= LAYER_CAP[layer]) continue;
      subjects.add(e.subject);
      taken++;
      out.push({ layer, subject: e.subject, year: e.year, text: fillSlots(e.text, flags) });
    }
  }
  return out;
}

/** The heading of one record entry (rule endings and the ledger carry their own dating). */
export function recordHeading(line: EpilogueLine, ending: string): string {
  if (ending.startsWith('rule_') || ending === 'new_god' || ending === 'reclaim')
    return `【${line.subject}】`;
  if (line.year === 0) return `【${line.subject}】很久以后：`;
  return `【${line.subject}】审定后第${line.year}年：`;
}

/** Who writes the record (act6 12.4 rule 6). */
export function recordSpeaker(
  ending: string,
  isLast: boolean,
): { id: string; name: string; kind: 'narrate' | 'divine' } {
  if (ending === 'release' && isLast) return { id: 'historian', name: '凡人史官', kind: 'narrate' };
  if (ending === 'new_god') return { id: 'ledger', name: '神之账本', kind: 'narrate' };
  if (ending === 'janu_restored') return { id: 'janu', name: '雅努', kind: 'divine' };
  return { id: 'moira', name: '莫伊拉', kind: 'narrate' };
}
