// Wake-ups outside the daily round (goddess_gm.md 6.2 to 6.4, 9; builtin_ai.md 8.7;
// catalog_goddess_interventions.md 6 and 10): the honorific (speaking a goddess's title and
// full name reaches her), witnessed feats (believers who see the player raise the gaze), the
// Maker's revelations (rule change first, then the steles, then every goddess reads it). Each
// of them is an event of the reaction table (./brain/reactions.ts): the table decides what
// she does (her answer or her wordless sign, gaze, notices, a wake-up round with a model),
// in both modes. This module holds the hooks the table calls and the per-day wake budget.

import type { AnyCommand } from '../../core';
import type { FlagValue } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { calendarAt, TICKS_PER_GAME_DAY } from '../../core/time';
import { type ModifierTarget, registerModifier } from '../modifiers';
import { evaluate, flagResolver } from '../quests/conditions';
import { believersNear } from './actions';
import { type ReactEvent, type ReactFacts, type ReactHooks, react } from './brain/reactions';
import { brainOf } from './brain/state';
// Player-input vocabulary (the punctuation an invocation may carry), not display text;
// it belongs in data/ with the content pipeline (follow-up).
import INPUT_LEXICON from './input_lexicon.json';
import { goddessContext } from './planning';
import { addSight, goddessDef } from './state';
import type { GoddessDef, RevelationDef } from './types';

const SRC = { type: 'system', system: 'goddess' } as const;

/** Wake-ups per goddess per game day (goddess_gm.md 6.4). */
export const WAKES_PER_DAY = 4;

/** Sample weight of an honorific: "此人在此" (catalog 10.1: a sample of weight 1.0). */
export const HONORIFIC_SAMPLE = 1;

const INVOCATION_STRIP = new RegExp(INPUT_LEXICON.invocationStrip, 'g');

/** Strip spaces and punctuation so a spaced or punctuated honorific still matches. */
export function normalizeInvocation(text: string): string {
  return text.replace(INVOCATION_STRIP, '');
}

/** Goddesses whose honorific occurs in the text (only the full invocation counts). */
export function honorificsIn(
  text: string,
  defs: GoddessDef[],
  flags: Record<string, FlagValue>,
): string[] {
  const norm = normalizeInvocation(text);
  return defs
    .filter((d) => {
      if (d.revealWhen && !evaluate(d.revealWhen, flagResolver(flags))) return false;
      return norm.includes(normalizeInvocation(d.honorific));
    })
    .map((d) => d.id);
}

function rollDay(ctx: SystemContext, goddess: string) {
  const s = ctx.world.slices.goddess.goddesses[goddess];
  if (!s) return undefined;
  const day = calendarAt(ctx.tick).dayIndex;
  if (s.wakeDay !== day) {
    s.wakeDay = day;
    s.wakes = 0;
  }
  return s;
}

/**
 * Whether the player may still wake her today (catalog 10.1 and 6.2 row 01): she has wake-ups
 * left (four a day) and this invoker has not woken her yet today; otherwise her row 02 answers
 * with her wordless sign.
 */
export function wakesLeft(ctx: SystemContext, goddess: string): boolean {
  const s = rollDay(ctx, goddess);
  const day = calendarAt(ctx.tick).dayIndex;
  return (
    !!s && s.wakes < WAKES_PER_DAY && brainOf(ctx.world.slices.goddess, goddess).wokenDay !== day
  );
}

function spendWake(ctx: SystemContext, goddess: string): void {
  const s = rollDay(ctx, goddess);
  if (!s) return;
  s.wakes++;
  brainOf(ctx.world.slices.goddess, goddess).wokenDay = calendarAt(ctx.tick).dayIndex;
}

/** Ask a goddess to speak with a model, with a written line as the fallback. */
export function requestSpeech(
  ctx: SystemContext,
  def: GoddessDef,
  purpose: string,
  situation: TextParam,
  fallbackText: TextParam,
  extra?: Record<string, unknown>,
): void {
  const s = ctx.world.slices.goddess.goddesses[def.id];
  if (!s) return;
  const fallback: AnyCommand[] = [
    {
      kind: 'goddess.say',
      data: { goddessId: def.id, text: fallbackText, revision: s.revision },
      source: SRC,
    },
  ];
  ctx.ai.request({
    agentId: def.id,
    role: 'goddess.dialogue',
    purpose,
    revision: s.revision,
    context: goddessContext(ctx, def, s, situation, extra),
    allowed: ['goddess.say'],
    fallback,
    deadlineTicks: 200,
    priority: 3,
  });
}

/** The hooks of the reaction table (its effects that reach a model or the wake budget). */
export const REACT_HOOKS: ReactHooks = {
  wake(ctx, def, line, facts) {
    const said = (facts.said ?? '').slice(0, 200);
    ctx.emit('goddess.woken', { goddessId: def.id, reason: 'honorific' });
    requestSpeech(ctx, def, 'honorific', tr('sys.goddess.prompt.honorific', { text: said }), line, {
      playerText: said,
    });
  },
  interpret(ctx, def, facts) {
    const rev = facts.revelation;
    if (!rev) return;
    const content = ctx.content.revelations.find((r) => r.id === rev.id);
    requestSpeech(
      ctx,
      def,
      'revelation_reading',
      tr('sys.goddess.prompt.revelation_reading', { text: rev.text, literal: rev.literal }),
      content?.responses[def.id] ?? def.replies.revelation,
      { revelation: rev.id },
    );
  },
  wakesLeft,
  spendWake,
};

/** Raise one reaction event for the goddesses who perceive it. */
export function reactTo(
  ctx: SystemContext,
  event: ReactEvent,
  goddesses: readonly string[],
  facts: ReactFacts,
): Record<string, string> {
  return react(ctx, event, goddesses, facts, REACT_HOOKS);
}

/** Every goddess, in id order (for events everyone perceives). */
function everyGoddess(ctx: SystemContext): string[] {
  return [...ctx.content.goddesses].map((g) => g.id).sort();
}

/** player.said: an honorific reaches the named goddess; a hidden name is the forbidden word. */
export function onPlayerSaid(ctx: SystemContext, said: TextParam): void {
  // only the player's own words can name a goddess; chosen lines are text keys
  if (typeof said !== 'string') return;
  const text = said;
  const mapId = ctx.world.slices.world.entities[ctx.world.slices.world.playerId]?.mapId ?? '';
  for (const id of honorificsIn(text, ctx.content.goddesses, ctx.world.meta.flags)) {
    const s = ctx.world.slices.goddess.goddesses[id];
    if (!s || s.departed) continue;
    // "此人在此": she now knows where the speaker stands (catalog 10.1)
    addSight(ctx, ctx.content, id, HONORIFIC_SAMPLE);
    ctx.setFlag(`goddess.${id}.invoked`, ctx.tick);
    reactTo(ctx, 'player.honorific', [id], { said: text, mapId });
  }
  // A goddess whose true name is still hidden (GoddessDef.hiddenName until revealWhen holds,
  // the same rule as displayName): the player saying that name is the forbidden word.
  for (const def of ctx.content.goddesses) {
    if (!def.hiddenName || !def.revealWhen || ctx.flag(def.revealWhen)) continue;
    if (!text.includes(def.name)) continue;
    ctx.setFlag('player.spoke_forbidden_name', true);
    reactTo(ctx, 'forbidden_name.player', [def.id], { said: text, mapId });
  }
}

/**
 * feat.performed by the player: believers who witness it bring a sample to their goddess
 * (her gaze focus on the map counts half again, catalog 1.3); her reaction row decides how
 * much it weighs (Eluen in act 1 files it as believers' exaggeration); with no row firing,
 * the plain sample stands.
 */
export function onFeat(
  ctx: SystemContext,
  tier: number,
  mapId: string,
  x: number,
  y: number,
): void {
  const weight = Math.max(0.25, (tier + 1) / 4);
  for (const def of [...ctx.content.goddesses].sort((a, b) => a.id.localeCompare(b.id))) {
    const s = ctx.world.slices.goddess.goddesses[def.id];
    if (!s || s.departed) continue;
    const seen = believersNear(ctx, def, mapId, x, y, 12);
    const ambient = (s.faith[mapId] ?? 0) * 0.2;
    const focus = brainOf(ctx.world.slices.goddess, def.id).gaze;
    const sharp = focus && focus.mapId === mapId && focus.until > ctx.tick ? 1.5 : 1;
    const w = (seen + ambient) * weight * sharp;
    if (w <= 0) continue;
    const fired =
      seen > 0
        ? reactTo(ctx, 'feat.witnessed', [def.id], { believers: seen, weight: w, tier, mapId })
        : {};
    if (!fired[def.id]) addSight(ctx, ctx.content, def.id, w);
  }
}

/** Land a revelation: rules first, then the steles, then each goddess reads it. */
export function issueRevelation(ctx: SystemContext, rev: RevelationDef): void {
  const slice = ctx.world.slices.goddess;
  if (slice.revelations.some((r) => r.id === rev.id)) return;
  for (const m of rev.modifiers ?? []) {
    registerModifier(ctx, {
      target: m.target,
      key: m.key,
      factor: m.factor,
      add: m.add,
      untilTick: ctx.tick + m.days * TICKS_PER_GAME_DAY,
      source: 'maker',
      visibility: 'public',
      note: tr('sys.goddess.modifier.revelation', { text: rev.text || rev.literal }),
    });
  }
  for (const [k, v] of Object.entries(rev.flags ?? {})) ctx.setFlag(k, v);
  slice.revelations.push({ id: rev.id, tick: ctx.tick, text: rev.text, literal: rev.literal });
  ctx.setFlag(`revelation.${rev.id}`, true);
  ctx.emit('dialogue.line', {
    speakerId: 'narrator',
    speakerName: '',
    text: rev.text
      ? tr('sys.goddess.narrate.revelation', { text: rev.text, literal: rev.literal })
      : tr('sys.goddess.narrate.revelation_plain', { literal: rev.literal }),
    kind: 'narrate',
  });
  ctx.emit('goddess.revelation', { id: rev.id, text: rev.text, literal: rev.literal });
  // the court's goddesses read it (div_react_all_10)
  const readers = everyGoddess(ctx).filter((id) => !!goddessDef(ctx.content, id)?.courtSeat);
  reactTo(ctx, 'revelation.landed', readers, {
    revelation: { id: rev.id, text: rev.text, literal: rev.literal },
  });
}

/** An ad-hoc operator revelation (maker.revelation without a content id). */
export function adHocRevelation(
  ctx: SystemContext,
  d: {
    text: string;
    literal?: string;
    modifier?: { target: ModifierTarget; key: string; factor?: number; add?: number; days: number };
    flag?: { key: string; value: FlagValue };
  },
): RevelationDef {
  const id = ctx.newId('rev');
  const rev: RevelationDef = {
    id,
    text: d.text,
    literal: d.literal ?? d.text,
    flags: d.flag ? { [d.flag.key]: d.flag.value } : undefined,
    modifiers: d.modifier ? [d.modifier] : undefined,
    responses: {},
  };
  issueRevelation(ctx, rev);
  return rev;
}

/** A door opened and the seal moved: every goddess perceives it through her own rows. */
export function onDoorOpened(ctx: SystemContext): void {
  reactTo(ctx, 'player.opened_door', everyGoddess(ctx), {});
}

export function onSealStage(ctx: SystemContext): void {
  reactTo(ctx, 'seal.stage_up', everyGoddess(ctx), {});
}
