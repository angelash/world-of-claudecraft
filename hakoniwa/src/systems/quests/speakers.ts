// Display names for dialogue lines emitted by quests and scenes. Goddesses come from
// the persona cards (janu keeps her hidden name until it is spoken; any id with a persona
// card speaks divinely); everything else from the scenes speaker table; the player is
// shown with the chosen name, or the key sys.quests.name.you before one is chosen.

import type { FlagValue } from '../../core/contracts';
import { defaultRegistry } from '../../core/registry';
import { joinText, type TextParam, tr } from '../../core/text';
import type { GoddessDef } from '../goddess/types';
import type { SpeakerDef } from '../scenes/types';
import { evaluate, flagResolver } from './conditions';
import type { LineKind } from './effect_types';

type SpeakerContent = { goddesses: GoddessDef[]; sceneSpeakers: SpeakerDef[] };

export function speakerName(
  flags: Record<string, FlagValue>,
  content: SpeakerContent,
  id: string,
  override?: TextParam,
): TextParam {
  if (override) return override;
  if (id === 'narrator') return '';
  if (id === 'player') return playerName(flags);
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
  if ((content.goddesses ?? []).some((g) => g.id === id) || id === 'door_voice') return 'divine';
  const s = (content.sceneSpeakers ?? []).find((x) => x.id === id);
  return s?.kind ?? 'say';
}

/** The text of a {flag:key} slot: an enum value shows its display text when it has one. */
function slotText(flags: Record<string, FlagValue>, key: string): string {
  const registry = defaultRegistry();
  const name = registry.canonical(key);
  const v = flags[name] ?? flags[key];
  if (v === undefined) return '';
  if (typeof v === 'string') return registry.valueLabel(name, v) ?? v;
  return String(v);
}

/** The chosen player name, or the key for "you" while none is chosen. */
function playerName(flags: Record<string, FlagValue>): TextParam {
  return String(flags['player.name'] ?? '') || tr('sys.quests.name.you');
}

function fillFlagSlots(text: string, flags: Record<string, FlagValue>): string {
  return text.replace(/\{flag:([A-Za-z0-9_.:-]+)\}/g, (_m, k: string) => slotText(flags, k));
}

/**
 * Replace {player_name} and {flag:key} slots in written text. With a chosen name the
 * result is a plain string, as before; before one is chosen a {player_name} slot holds the
 * "you" key, so the result is the written pieces and that key joined (same rendering).
 */
export function fillSlots(text: string, flags: Record<string, FlagValue>): TextParam {
  const name = playerName(flags);
  if (typeof name === 'string') return fillFlagSlots(text.replace(/\{player_name\}/g, name), flags);
  const pieces = text.split('{player_name}');
  if (pieces.length === 1) return fillFlagSlots(text, flags);
  const items: TextParam[] = [];
  pieces.forEach((p, i) => {
    if (i > 0) items.push(tr('sys.quests.name.you'));
    if (p) items.push(fillFlagSlots(p, flags));
  });
  return joinText('none', items);
}

/** fillSlots over a text value: a string is filled; a TextRef's string params are filled. */
export function fillText(text: TextParam, flags: Record<string, FlagValue>): TextParam {
  if (typeof text === 'string') return fillSlots(text, flags);
  if (typeof text === 'number' || !('key' in text) || !text.params) return text;
  const params: Record<string, TextParam> = {};
  for (const [k, v] of Object.entries(text.params)) params[k] = fillText(v, flags);
  return { key: text.key, params };
}
