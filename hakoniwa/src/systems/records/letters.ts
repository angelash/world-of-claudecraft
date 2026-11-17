// Letters (ux_and_onboarding.md 6.3.8): a letter is sent when its condition holds, travels
// `transitHours` on the road and is delivered; the paragraphs whose conditions hold when
// it is sent are frozen into it, so reading it again later shows the same letter however
// the world moved on (the count's letter of act 1, act1_borderstone.md 9.4, picks its
// wording from `a1_tide_credit` and `a1_moss_fate` that way). The mirror `letter.<id>`
// follows the state (`transit`, `delivered`, `read`, `replied`) and `letter.<id>.reply`
// holds the reply chosen, so quests and scenes react through conditions.

import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_HOUR } from '../../core/time';
import { evaluate } from '../quests/conditions';
import type { LetterDef, LetterRecord, RecordsSlice, Resolve } from './types';

export function letterDef(ctx: SystemContext, id: string): LetterDef | undefined {
  return (ctx.content.letters ?? []).find((l) => l.id === id);
}

function deliver(ctx: SystemContext, id: string, r: LetterRecord): void {
  r.state = 'delivered';
  r.delivered = ctx.tick;
  ctx.setFlag(`letter.${id}`, 'delivered');
  ctx.emit('letter.delivered', { letterId: id });
}

/** Send a letter now: freeze its paragraphs and put it on the road (or deliver it). */
export function sendLetter(
  ctx: SystemContext,
  s: RecordsSlice,
  def: LetterDef,
  resolve: Resolve,
): LetterRecord {
  const body = def.body.filter((p) => !p.when || evaluate(p.when, resolve)).map((p) => p.id);
  const hours = Math.max(0, def.transitHours ?? 0);
  const arrives = ctx.tick + Math.round(hours * TICKS_PER_GAME_HOUR);
  const r: LetterRecord = { state: 'transit', sent: ctx.tick, arrives, body };
  s.letters[def.id] = r;
  if (arrives <= ctx.tick) deliver(ctx, def.id, r);
  else {
    ctx.setFlag(`letter.${def.id}`, 'transit');
    ctx.emit('letter.sent', { letterId: def.id, arrives });
    s.mailDue = s.mailDue < 0 ? arrives : Math.min(s.mailDue, arrives);
  }
  return r;
}

/** One settle pass over the letters not sent yet; true when one was sent. */
export function settleLetters(ctx: SystemContext, s: RecordsSlice, resolve: Resolve): boolean {
  let changed = false;
  for (const def of ctx.content.letters ?? []) {
    if (s.letters[def.id]) continue;
    if (!evaluate(def.deliver.when, resolve)) continue;
    sendLetter(ctx, s, def, resolve);
    changed = true;
  }
  return changed;
}

/** Deliver the letters whose road ended by now (in sending order). */
export function deliverMail(ctx: SystemContext, s: RecordsSlice): void {
  if (s.mailDue < 0 || ctx.tick < s.mailDue) return;
  let next = -1;
  for (const [id, r] of Object.entries(s.letters)) {
    if (r.state !== 'transit') continue;
    if (r.arrives <= ctx.tick) deliver(ctx, id, r);
    else next = next < 0 ? r.arrives : Math.min(next, r.arrives);
  }
  s.mailDue = next;
}

/** Mark a delivered letter read (no change for a letter read or answered already). */
export function markRead(ctx: SystemContext, id: string, r: LetterRecord): boolean {
  if (r.state !== 'delivered') return false;
  r.state = 'read';
  r.read = ctx.tick;
  ctx.setFlag(`letter.${id}`, 'read');
  ctx.emit('letter.read', { letterId: id });
  return true;
}
