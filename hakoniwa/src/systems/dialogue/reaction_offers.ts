// The dialogue options of the NPC reaction table (builtin_ai.md 5.6 "其他后果": row 4 the
// challenge's questions, row 5 "生成交易或要挟的对话选项", rows 6, 8 and 9; PK-M1-18 progress 3
// row 7): when a person's reaction row toward the player fires (npc.reaction), the next talk
// with them within a few days offers the row's options; choosing one carries out its effects
// (relation, a hush payment, keeping quiet, a request) and the person answers. Options and
// effects are data (data/dialogue/reaction_options.json); the effects are a closed set.

import { contentRef } from '../../core/content_key';
import type { SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import { keepQuiet } from '../cognition/rumor';
import { addMoney, holdingOf, spendMoney } from '../inventory';
import { moodOf } from '../npc/brain/mood';
import { adjustRelation } from '../npc/relations';
import { conditionHolds } from '../quests/effects';
import { varsFor } from './replies';
import { speak } from './speak';
import type { DialogueSession, SessionOption } from './types';

export const REACTION_EFFECTS = ['relation', 'pay', 'hush', 'request'] as const;
export type ReactionEffect =
  | { type: 'relation'; like?: number; trust?: number }
  | { type: 'pay'; amount: number }
  | { type: 'hush' }
  | { type: 'request' };

export interface ReactionOptionDef {
  id: string;
  /** what the player says (content text) */
  label: string;
  /** shown only while this holds */
  when?: string;
  /** the person's answer slot; none: the choice speaks for itself */
  say?: string;
  effects: ReactionEffect[];
}

export interface ReactionOptionsRow {
  /** the reaction row id (data/npc/brain/reactions.json) */
  id: string;
  options: ReactionOptionDef[];
}

declare module '../../core/contracts' {
  interface ContentMap {
    reactionOptions: ReactionOptionsRow[];
  }
}

/** A reaction toward the player stays answerable in talk this long. */
export const OFFER_DAYS = 3;
export const REACTION_OPTION_PREFIX = 'react:';

/** Note a reaction row toward the player (the next talks offer its options). */
export function noteReaction(ctx: SystemContext, npcRef: string, row: string): void {
  if (!(ctx.content.reactionOptions ?? []).some((r) => r.id === row)) return;
  const slice = ctx.world.slices.dialogue;
  slice.reactions ??= {};
  slice.reactions[npcRef] = { row, tick: ctx.tick };
}

function liveOffer(ctx: SystemContext, npcRef: string): ReactionOptionsRow | null {
  const o = ctx.world.slices.dialogue.reactions?.[npcRef];
  if (!o || ctx.tick - o.tick > OFFER_DAYS * TICKS_PER_GAME_DAY) return null;
  return (ctx.content.reactionOptions ?? []).find((r) => r.id === o.row) ?? null;
}

/** The options of the person's live reaction (offered on a new talk). */
export function reactionOptions(ctx: SystemContext, npcRef: string): SessionOption[] {
  const row = liveOffer(ctx, npcRef);
  if (!row) return [];
  return row.options
    .filter((o) => !o.when || conditionHolds(ctx, o.when))
    .map((o) => ({
      id: `${REACTION_OPTION_PREFIX}${row.id}:${o.id}`,
      label: contentRef('reactionOptions', row.id, `options.${o.id}.label`),
      system: 'dialogue',
    }));
}

export function offerReactions(ctx: SystemContext, s: DialogueSession): void {
  for (const o of reactionOptions(ctx, s.npcRef)) {
    if (s.options.some((x) => x.id === o.id)) continue;
    s.options.splice(Math.max(0, s.options.length - 1), 0, o);
  }
}

export interface ReactionChosen {
  line: TextParam | null;
  /** the option asks the person's request (the caller offers it) */
  request: boolean;
  /** the option could not be done (not enough money) */
  refused: boolean;
}

/**
 * Carry out a reaction option: its effects in order, then the person's answer. The offer is
 * used up (one answer per reaction); a payment the player cannot make does nothing.
 */
export function chooseReaction(
  ctx: SystemContext,
  s: DialogueSession,
  optionId: string,
): ReactionChosen | null {
  const [rowId, optId] = optionId.slice(REACTION_OPTION_PREFIX.length).split(':');
  const row = liveOffer(ctx, s.npcRef);
  const opt = row && row.id === rowId ? row.options.find((o) => o.id === optId) : undefined;
  if (!row || !opt) return null;
  const playerId = ctx.world.slices.world.playerId;
  const npcEntity = ctx.world.slices.npc.npcs[s.npcRef]?.entityId;
  const pay = opt.effects.find((e) => e.type === 'pay') as { amount: number } | undefined;
  if (pay && holdingOf(ctx.world, playerId).money < pay.amount)
    return { line: tr('sys.dialogue.reaction.no_money'), request: false, refused: true };
  let request = false;
  for (const e of opt.effects) {
    if (e.type === 'relation') {
      const d: { like?: number; trust?: number } = {};
      if (e.like !== undefined) d.like = e.like;
      if (e.trust !== undefined) d.trust = e.trust;
      adjustRelation(ctx, s.npcRef, 'player', d, tr('sys.dialogue.reaction.reason'));
    } else if (e.type === 'pay') {
      if (spendMoney(ctx, playerId, e.amount, 'dialogue') && npcEntity)
        addMoney(ctx, npcEntity, e.amount, 'dialogue');
    } else if (e.type === 'hush') {
      keepQuiet(ctx, s.npcRef, 'player');
    } else if (e.type === 'request') {
      request = true;
    }
  }
  delete ctx.world.slices.dialogue.reactions?.[s.npcRef];
  s.options = s.options.filter((o) => !o.id.startsWith(REACTION_OPTION_PREFIX));
  if (!opt.say) return { line: null, request, refused: false };
  const st = ctx.world.slices.npc.npcs[s.npcRef];
  const said = speak(ctx, {
    speaker: s.npcRef,
    slot: opt.say,
    vars: varsFor(ctx, s.npcRef),
    mood: st ? moodOf(st, ctx.tick) : undefined,
  });
  return { line: said?.text ?? null, request, refused: false };
}

/** Content checks of the reaction options (rows exist, effects in the closed set, slots). */
export function reactionOptionProblems(
  rows: readonly ReactionOptionsRow[] | undefined,
  reactionRows: readonly { id: string }[] | undefined,
  slotOk: (slot: string) => boolean,
): string[] {
  const out: string[] = [];
  for (const r of rows ?? []) {
    const at = `reaction options ${r.id}`;
    if (reactionRows && !reactionRows.some((x) => x.id === r.id))
      out.push(`${at}: no such reaction row`);
    const ids = new Set<string>();
    for (const o of r.options) {
      if (ids.has(o.id)) out.push(`${at}: option ${o.id} twice`);
      ids.add(o.id);
      if (typeof o.label !== 'string' || !o.label) out.push(`${at}.${o.id}: empty label`);
      if (o.say !== undefined && !slotOk(o.say))
        out.push(`${at}.${o.id}: slot ${o.say} has no line`);
      for (const e of o.effects)
        if (!(REACTION_EFFECTS as readonly string[]).includes(e.type))
          out.push(`${at}.${o.id}: unknown effect ${e.type}`);
    }
  }
  return out;
}
