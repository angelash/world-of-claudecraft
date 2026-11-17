// Comedy throttle and reaction lines (reputation_and_cognition.md 4.5 and 10): the
// same bit fires at most once per map per game day, and the fourth consecutive bit of
// one kind is downgraded to background chatter. Lines come from rule templates.

import type { SystemContext } from '../../core/system';
import type { TextParam } from '../../core/text';
import { calendarAt } from '../../core/time';
import { pickLine } from '../dialogue/templates';
import { ensureBrain } from '../npc/brain/state';
import { npcEntityId, personaById } from '../npc/personas';
import type { ObserveOutcome } from './belief';
import { isAccepted } from './params';

export type ComedyBit = 'crystal' | 'refute' | 'misattribute' | 'light';
export type Gate = 'full' | 'background' | 'none';

export function comedyGate(ctx: SystemContext, mapId: string, bit: ComedyBit): Gate {
  const slice = ctx.world.slices.cognition;
  const day = calendarAt(ctx.tick).dayIndex;
  const key = `${mapId}/${bit}`;
  const c = slice.comedy[key];
  if (c && c.day === day && c.count >= 1) return 'none';
  slice.comedy[key] = { day, count: (c && c.day === day ? c.count : 0) + 1 };
  const s = slice.comedyStreak[mapId];
  const n = s && s.bit === bit ? s.n + 1 : 1;
  slice.comedyStreak[mapId] = { bit, n };
  return n > 3 ? 'background' : 'full';
}

/** Template key and comedy bit for what just happened in an observer's head. */
function reactionKey(o: ObserveOutcome): { key: string; bit: ComedyBit | null } | null {
  // the 'refute' bit is an explanation held from before being knocked down (bit 2)
  const held = o.from === 'explaining' || o.from === 'wavering';
  if (isAccepted(o.to) && !isAccepted(o.from)) {
    if (o.to === 'hostile') return { key: 'react.hostile', bit: held ? 'refute' : null };
    if (!held && o.adopted.length === 0) return { key: 'react.believe', bit: null };
    return { key: 'react.accept', bit: held ? 'refute' : null };
  }
  if (o.to === 'wavering' && o.from !== 'wavering')
    return { key: 'react.wavering', bit: held ? 'refute' : null };
  const last = o.adopted[o.adopted.length - 1];
  if (last && o.refuted.length > 0 && held) return { key: `react.switch.${last}`, bit: 'refute' };
  if (last) return { key: `react.explain.${last}`, bit: last === 'sorcery' ? 'light' : null };
  if (o.to === 'explaining' && o.belief.explanation && o.belief.stick > 0)
    return { key: `react.again.${o.belief.explanation}`, bit: null };
  return null;
}

/** Say the observer's reaction out loud (only on the player's map). Returns true if spoken. */
export function speakReaction(
  ctx: SystemContext,
  observerId: string,
  o: ObserveOutcome,
  mapId: string,
  vars: Record<string, TextParam>,
): boolean {
  const p = personaById(ctx.content, observerId);
  if (!p) return false;
  const rk = reactionKey(o);
  if (!rk) return false;
  const gate = rk.bit ? comedyGate(ctx, mapId, rk.bit) : 'full';
  if (gate === 'none') return false;
  const text = pickLine(ctx.content, rk.key, vars, ctx.rng('cognition.lines'), p);
  if (!text) return false;
  // a state change voiced here is not kept as an opener as well (builtin_ai.md 5.7)
  const st = ctx.world.slices.npc.npcs[observerId];
  if (st && !st.resident) ensureBrain(st).spokeTick = ctx.tick;
  ctx.emit('dialogue.line', {
    speakerId: npcEntityId(observerId),
    speakerName: p.name,
    text,
    kind: gate === 'full' ? 'say' : 'narrate',
  });
  return true;
}
