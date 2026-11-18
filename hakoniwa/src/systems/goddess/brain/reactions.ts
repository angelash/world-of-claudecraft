// The goddesses' reaction table (builtin_ai.md 8.7; catalog_goddess_interventions.md 6): an
// event of the reaction vocabulary reaches every goddess who perceives it; she reads her own
// rows, then the shared rows, and fires the highest priority row that holds (a shared row
// wins only with a higher priority; ties inside one group go to the smaller id). The row's
// effects run in order: gaze and samples, relation, notices for her next plan, her line or
// her wordless sign, a wake-up round with a model, the reading of a revelation, a turn of
// her sight. The table decides the world's consequences in both modes; a model only words
// the wake-up (D-007). Rows fired are kept in her RuleMemory (cooldowns, once a day, and the
// coverage report).

import { firstMatch, markFired, type RuleRow, ruleProblems } from '../../../core/brain/rules';
import type { SystemContext } from '../../../core/system';
import { type TextParam, tr } from '../../../core/text';
import { TICKS_PER_GAME_DAY } from '../../../core/time';
import { npcPackId } from '../../dialogue/lines/packs';
import { currentActId } from '../../quests/act_order';
import { checkCondition } from '../../quests/conditions';
import { conditionHolds } from '../../quests/effects';
import { displayName } from '../actions';
import { addSight, adjustRelation, goddessDef } from '../state';
import type { GoddessDef } from '../types';
import { goddessLine } from './lines';
import { brainOf, NOTICES_KEEP } from './state';

/** The reaction vocabulary the M1 kernel raises (catalog 6.1, the rows' `event`). */
export const REACT_EVENTS = [
  'player.honorific',
  'feat.witnessed',
  'player.offering',
  'player.coin_used',
  'debt.overdue',
  'debt.paid',
  'revelation.landed',
  'seal.stage_up',
  'player.opened_door',
  'forbidden_name.player',
  'player.dream_seen',
] as const;
export type ReactEvent = (typeof REACT_EVENTS)[number];

/** Predicates a row's `cond` may join (with AND, `!` negates). */
export const REACT_PREDICATES = ['wakes_left', 'believer_saw', 'notable', 'first_of_kind'] as const;
export type ReactPredicate = (typeof REACT_PREDICATES)[number];

/** `tier.<id>`: the offering's tier is the offering table's tier `<id>` (catalog 9). */
export const TIER_PREDICATE = 'tier.';

/** Whether a predicate name is one the table may use (`tiers`: the offering table's tiers). */
export function knownPredicate(name: string, tiers?: readonly string[]): boolean {
  if (name.startsWith(TIER_PREDICATE)) {
    const id = name.slice(TIER_PREDICATE.length);
    return id !== '' && (!tiers || tiers.includes(id));
  }
  return (REACT_PREDICATES as readonly string[]).includes(name);
}

/** Effects a row's `then` may name. */
export const REACT_ACTIONS = [
  'wake',
  'gaze',
  'gaze_map',
  'sample',
  'relation',
  'notice',
  'say',
  'silent',
  'interpret',
  'memo',
  'door_count',
] as const;
export type ReactAction = (typeof REACT_ACTIONS)[number];

export interface ReactRow extends RuleRow {
  /** a goddess id, or * for the shared rows (五司) */
  goddess: string;
  event: ReactEvent;
  /** predicates over the event (joined with AND, `!` negates) */
  cond?: string;
}

/** What the event carries for the predicates and effects. */
export interface ReactFacts {
  /** believers of hers who saw it (feat.witnessed) */
  believers?: number;
  /** sample weight of the deed (feat.witnessed) */
  weight?: number;
  /** the deed's tier (feat.witnessed) */
  tier?: number;
  /** offering tier id (player.offering) */
  tier_id?: string;
  /** first offering of this item (player.offering) */
  first?: boolean;
  /** the player's words (player.honorific) */
  said?: string;
  /** a revelation's id and texts (revelation.landed) */
  revelation?: { id: string; text: string; literal: string };
  /** where it happened */
  mapId?: string;
}

/** Hooks the reaction effects need from the rest of the goddess system. */
export interface ReactHooks {
  /** wake-up round (builtin_ai 8.7 step 1 with a model): her speech request */
  wake(ctx: SystemContext, def: GoddessDef, line: TextParam, facts: ReactFacts): void;
  /** the reading of a revelation (div_all_interpret) */
  interpret(ctx: SystemContext, def: GoddessDef, facts: ReactFacts): void;
  /** spend one of her wake-ups today (false: none left) */
  wakesLeft(ctx: SystemContext, goddess: string): boolean;
  spendWake(ctx: SystemContext, goddess: string): void;
}

type ReactContent = { goddessReactions?: ReactRow[] };

function rowsFor(content: ReactContent, goddess: string, event: ReactEvent) {
  const all = content.goddessReactions ?? [];
  return {
    own: all.filter((r) => r.goddess === goddess && r.event === event),
    shared: all.filter((r) => r.goddess === '*' && r.event === event),
  };
}

function predicate(
  ctx: SystemContext,
  name: string,
  goddess: string,
  facts: ReactFacts,
  hooks: ReactHooks,
): boolean {
  if (name.startsWith(TIER_PREDICATE)) return facts.tier_id === name.slice(TIER_PREDICATE.length);
  switch (name as ReactPredicate) {
    case 'wakes_left':
      return hooks.wakesLeft(ctx, goddess);
    case 'believer_saw':
      return (facts.believers ?? 0) > 0;
    case 'notable':
      return (facts.weight ?? 0) >= 0.5;
    case 'first_of_kind':
      return !!facts.first;
    default:
      return false;
  }
}

/** Whether a row's `cond` holds for this goddess and event. */
function condHolds(
  ctx: SystemContext,
  row: ReactRow,
  goddess: string,
  facts: ReactFacts,
  hooks: ReactHooks,
): boolean {
  const cond = (row.cond ?? '').trim();
  if (!cond) return true;
  return cond
    .split(/\s+AND\s+/)
    .every((part) =>
      part.startsWith('!')
        ? !predicate(ctx, part.slice(1), goddess, facts, hooks)
        : predicate(ctx, part, goddess, facts, hooks),
    );
}

/** Gaze up by about `amount` points: the sample weight that moves her gaze that far. */
function raiseGaze(ctx: SystemContext, goddess: string, amount: number): void {
  const s = ctx.world.slices.goddess.goddesses[goddess];
  if (!s || amount <= 0) return;
  const target = Math.min(99, s.gaze + amount);
  const weight = -Math.log(1 - target / 100) / 0.3 - s.sightWeight;
  if (weight > 0) addSight(ctx, ctx.content, goddess, weight);
}

/** Her wordless sign (catalog 10.3; the narrated honorific answers of 10.2). */
export function silentSign(goddess: string): TextParam {
  return tr(`sys.goddess.narrate.silent.${goddess}`);
}

function narrate(ctx: SystemContext, text: TextParam): void {
  ctx.emit('dialogue.line', { speakerId: 'narrator', speakerName: '', text, kind: 'narrate' });
}

function speakAs(ctx: SystemContext, def: GoddessDef, text: TextParam): void {
  ctx.emit('dialogue.line', {
    speakerId: def.id,
    speakerName: displayName(ctx, def),
    text,
    listenerId: ctx.world.slices.world.playerId,
    kind: 'divine',
  });
}

/** Whether her own line pack ln_<goddess> exists. */
function hasOwnPack(ctx: SystemContext, goddess: string): boolean {
  return (ctx.content.linePacks ?? []).some((p) => p.id === npcPackId(goddess));
}

function runEffects(
  ctx: SystemContext,
  def: GoddessDef,
  row: ReactRow,
  facts: ReactFacts,
  hooks: ReactHooks,
): void {
  const brain = brainOf(ctx.world.slices.goddess, def.id);
  for (const step of row.then) {
    const p = step.params ?? {};
    switch (step.action as ReactAction) {
      case 'wake': {
        hooks.spendWake(ctx, def.id);
        const line = goddessLine(ctx, def.id, 'react.honorific');
        // her pack writes the acts she answers in; in the others she answers with her sign
        // (catalog 10.2 "（旁白）"); a goddess without a pack falls back to her written reply
        if (line) hooks.wake(ctx, def, line, facts);
        else if (hasOwnPack(ctx, def.id)) narrate(ctx, silentSign(def.id));
        else hooks.wake(ctx, def, def.replies.honorific, facts);
        break;
      }
      case 'gaze':
        raiseGaze(ctx, def.id, Number(p.amount ?? 0));
        break;
      case 'gaze_map': {
        const days = Number(p.days ?? 1);
        if (p.map) brain.gaze = { mapId: p.map, until: ctx.tick + days * TICKS_PER_GAME_DAY };
        break;
      }
      case 'sample':
        addSight(ctx, ctx.content, def.id, (facts.weight ?? 1) * Number(p.scale ?? 1));
        break;
      case 'relation': {
        const first = p.first !== undefined && facts.first;
        adjustRelation(ctx, def.id, Number(first ? p.first : (p.amount ?? 0)));
        break;
      }
      case 'notice':
        brain.notices.push({ kind: row.event, tick: ctx.tick, mapId: facts.mapId ?? '' });
        if (brain.notices.length > NOTICES_KEEP) brain.notices.shift();
        break;
      case 'say': {
        const line = p.slot ? goddessLine(ctx, def.id, p.slot) : null;
        if (!line) break;
        if (p.narrate === 'true') narrate(ctx, line);
        else speakAs(ctx, def, line);
        break;
      }
      case 'silent':
        narrate(ctx, silentSign(def.id));
        break;
      case 'interpret':
        hooks.interpret(ctx, def, facts);
        break;
      case 'memo':
        ctx.emit('goddess.memo', { goddessId: def.id, note: p.note ?? '' });
        break;
      case 'door_count':
        brain.doorsSinceDream = (brain.doorsSinceDream ?? 0) + 1;
        break;
    }
  }
}

/**
 * React to one event for each goddess in `goddesses` (those who perceive it). Returns the
 * rows fired, per goddess.
 */
export function react(
  ctx: SystemContext,
  event: ReactEvent,
  goddesses: readonly string[],
  facts: ReactFacts,
  hooks: ReactHooks,
): Record<string, string> {
  const fired: Record<string, string> = {};
  const act = currentActId(ctx);
  for (const id of goddesses) {
    const def = goddessDef(ctx.content, id);
    const s = ctx.world.slices.goddess.goddesses[id];
    if (!def || !s || s.departed) continue;
    const mem = brainOf(ctx.world.slices.goddess, id).react;
    const env = {
      tick: ctx.tick,
      act,
      holds: (when: string, row: RuleRow) =>
        conditionHolds(ctx, when) && condHolds(ctx, row as ReactRow, id, facts, hooks),
    };
    // rows with an empty `when` skip env.holds in the primitive: check their cond here
    const ready = (rows: ReactRow[]) =>
      rows.filter((r) => (r.when ?? '').trim() !== '' || condHolds(ctx, r, id, facts, hooks));
    const { own, shared } = rowsFor(ctx.content, id, event);
    const mine = firstMatch(ready(own), env, mem);
    const common = firstMatch(ready(shared), env, mem);
    const row = (
      mine && (!common || mine.priority >= common.priority) ? mine : common
    ) as ReactRow | null;
    if (!row) continue;
    markFired(row, env, mem);
    fired[id] = row.id;
    runEffects(ctx, def, row, facts, hooks);
    ctx.emit('goddess.reacted', { goddessId: id, rowId: row.id, event });
  }
  return fired;
}

/** Load-time problems of the reaction table (catalog 17.1 rule 7). */
export function reactionProblems(content: {
  goddessReactions?: readonly ReactRow[];
  goddesses: readonly { id: string }[];
  offeringRules?: readonly { tiers: readonly { id: string }[] }[];
}): string[] {
  const tiers = content.offeringRules?.[0]?.tiers.map((t) => t.id);
  const rows = content.goddessReactions ?? [];
  const out = ruleProblems(
    rows.map((r) => ({ ...r, when: r.when ?? '' })),
    (w) => checkCondition(w),
  );
  for (const r of rows) {
    const at = `reaction ${r.id}`;
    if (!r.id.startsWith('div_react_')) out.push(`${at}: id must start with div_react_`);
    if (r.goddess !== '*' && !content.goddesses.some((g) => g.id === r.goddess))
      out.push(`${at}: unknown goddess ${r.goddess}`);
    if (!(REACT_EVENTS as readonly string[]).includes(r.event))
      out.push(`${at}: event ${r.event} is not one the kernel raises`);
    for (const part of (r.cond ?? '').split(/\s+AND\s+/).filter((x) => x.trim() !== '')) {
      const name = part.startsWith('!') ? part.slice(1) : part;
      if (!knownPredicate(name, tiers)) out.push(`${at}: unknown predicate ${name}`);
    }
    for (const t of r.then)
      if (!(REACT_ACTIONS as readonly string[]).includes(t.action))
        out.push(`${at}: unknown effect ${t.action}`);
  }
  return out;
}
