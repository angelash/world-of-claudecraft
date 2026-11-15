// Display names for dialogue lines emitted by quests and scenes. Goddesses come from
// the persona cards (janu keeps her hidden name until it is spoken); everything else
// from the scenes speaker table; the player is shown with the chosen name.

import type { FlagValue } from '../../core/contracts';
import type { GoddessDef } from '../goddess/types';
import type { SpeakerDef } from '../scenes/types';
import { evaluate, flagResolver } from './conditions';
import type { LineKind } from './effect_types';

const GODDESS_IDS = new Set(['eluen', 'valda', 'merca', 'sylvie', 'moira', 'janu']);

type SpeakerContent = { goddesses: GoddessDef[]; sceneSpeakers: SpeakerDef[] };

export function speakerName(
  flags: Record<string, FlagValue>,
  content: SpeakerContent,
  id: string,
  override?: string,
): string {
  if (override) return override;
  if (id === 'narrator') return '';
  if (id === 'player') return String(flags['prologue.player_name'] ?? '你') || '你';
  const g = content.goddesses.find((x) => x.id === id);
  if (g) {
    if (g.hiddenName && g.revealWhen && !evaluate(g.revealWhen, flagResolver(flags)))
      return g.hiddenName;
    return g.name;
  }
  const s = (content.sceneSpeakers ?? []).find((x) => x.id === id);
  if (s) {
    if (s.revealedName && s.revealWhen && evaluate(s.revealWhen, flagResolver(flags)))
      return s.revealedName;
    return s.name;
  }
  return '';
}

export function defaultKind(content: SpeakerContent, id: string): LineKind {
  if (id === 'narrator') return 'narrate';
  if (GODDESS_IDS.has(id) || id === 'door_voice') return 'divine';
  const s = (content.sceneSpeakers ?? []).find((x) => x.id === id);
  return s?.kind ?? 'say';
}

/** Replace {player_name} and {flag:key} slots in written text. */
export function fillSlots(text: string, flags: Record<string, FlagValue>): string {
  return text
    .replace(/\{player_name\}/g, String(flags['prologue.player_name'] ?? '你') || '你')
    .replace(/\{flag:([A-Za-z0-9_.:-]+)\}/g, (_m, k: string) => String(flags[k] ?? ''));
}
