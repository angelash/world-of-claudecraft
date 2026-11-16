// Wake-ups outside the daily round (goddess_gm.md 6.2 to 6.4, 9): the honorific
// (speaking a goddess's title and full name wakes her and sharply raises her sight),
// witnessed feats (believers who see the player raise the gaze), Maker revelations
// (rule change first, then the steles, then every goddess reads it), and offerings to
// Merca through her coin (10.2).

import type { AnyCommand } from '../../core';
import { contentText } from '../../core/content_key';
import type { FlagValue } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { type KeyText, type TextParam, tr } from '../../core/text';
import { calendarAt, TICKS_PER_GAME_DAY } from '../../core/time';
import { countItem, itemDef, removeItem } from '../inventory';
import { type ModifierTarget, registerModifier } from '../modifiers';
import { evaluate, flagResolver } from '../quests/conditions';
import { sanitizeText } from '../quests/lore';
import { believersNear, displayName, toolsActive } from './actions';
// Player-input vocabulary (the punctuation an invocation may carry), not display text;
// it belongs in data/ with the content pipeline (follow-up).
import INPUT_LEXICON from './input_lexicon.json';
import { goddessContext } from './planning';
import { goddessByRole } from './roster';
import { addSight, adjustRelation, goddessDef, recordIntervention } from './state';
import type { GoddessDef, RevelationDef } from './types';

const SRC = { type: 'system', system: 'goddess' } as const;

/** Wake-ups per goddess per game day (goddess_gm.md 6.4). */
export const WAKES_PER_DAY = 4;

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

function spend(ctx: SystemContext, goddess: string): boolean {
  const s = ctx.world.slices.goddess.goddesses[goddess];
  if (!s) return false;
  const day = calendarAt(ctx.tick).dayIndex;
  if (s.wakeDay !== day) {
    s.wakeDay = day;
    s.wakes = 0;
  }
  if (s.wakes >= WAKES_PER_DAY) return false;
  s.wakes++;
  return true;
}

/** Ask a goddess to speak with a model, with a written line as the fallback. */
export function requestSpeech(
  ctx: SystemContext,
  def: GoddessDef,
  purpose: string,
  situation: TextParam,
  fallbackText: string,
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

/** player.said: honorifics wake the named goddess (once per day per goddess budget). */
export function onPlayerSaid(ctx: SystemContext, said: TextParam): void {
  // only the player's own words can name a goddess; chosen lines are text keys
  if (typeof said !== 'string') return;
  const text = said;
  const ids = honorificsIn(text, ctx.content.goddesses, ctx.world.meta.flags);
  for (const id of ids) {
    const def = goddessDef(ctx.content, id) as GoddessDef;
    const s = ctx.world.slices.goddess.goddesses[id];
    if (!s || s.departed || !spend(ctx, id)) continue;
    addSight(ctx, ctx.content, id, 3);
    ctx.setFlag(`goddess.${id}.invoked`, ctx.tick);
    ctx.emit('goddess.woken', { goddessId: id, reason: 'honorific' });
    requestSpeech(
      ctx,
      def,
      'honorific',
      tr('sys.goddess.prompt.honorific', { text: text.slice(0, 200) }),
      def.replies.honorific,
      { playerText: text.slice(0, 200) },
    );
  }
  // A goddess whose true name is still hidden (GoddessDef.hiddenName until revealWhen holds,
  // the same rule as displayName): the player saying that name is the forbidden word.
  for (const def of ctx.content.goddesses) {
    if (!def.hiddenName || !def.revealWhen || ctx.flag(def.revealWhen)) continue;
    if (text.includes(def.name)) ctx.setFlag('player.spoke_forbidden_name', true);
  }
}

/** feat.performed by the player: believers who witness it raise their goddess's sight. */
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
    const w = (seen + ambient) * weight;
    if (w > 0) addSight(ctx, ctx.content, def.id, w);
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
  for (const def of [...ctx.content.goddesses].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!def.courtSeat) continue;
    const s = slice.goddesses[def.id];
    if (!s || s.departed) continue;
    requestSpeech(
      ctx,
      def,
      'revelation_reading',
      tr('sys.goddess.prompt.revelation_reading', { text: rev.text, literal: rev.literal }),
      rev.responses[def.id] ?? def.replies.revelation,
      { revelation: rev.id },
    );
  }
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

/** Merca's exchange rate by coin terms (prologue 4.9). */
export function offeringRate(terms: FlagValue | undefined, offeringsSoFar: number): number {
  if (terms === 'interest_free') return 1;
  if (terms === 'three_percent') return 0.8;
  return offeringsSoFar === 0 ? 1 : 0.7;
}

/**
 * Validate and run an offering to the goddess with the 'offering' role (Merca) through her
 * token coin; returns an error or null.
 */
export function makeOffering(
  ctx: SystemContext,
  d: { itemId: string; want: 'blessing' | 'intel' },
): { code: string; reason: KeyText } | null {
  const playerId = ctx.world.slices.world.playerId;
  const merca = goddessByRole(ctx.content, 'offering');
  const s = merca ? ctx.world.slices.goddess.goddesses[merca.id] : undefined;
  if (!merca || !s)
    return { code: 'no_goddess', reason: tr('sys.goddess.reject.no_goddess.offering') };
  if (!toolsActive(ctx, merca, s))
    return { code: 'inactive', reason: tr('sys.goddess.reject.inactive.offering') };
  const coin = merca.token ?? '';
  if (countItem(ctx.world, playerId, coin) <= 0)
    return {
      code: 'no_coin',
      reason: tr('sys.goddess.reject.no_coin', { goddess: contentText('goddesses', merca) }),
    };
  if (d.itemId === coin) return { code: 'coin', reason: tr('sys.goddess.reject.coin') };
  const item = itemDef(ctx.content, d.itemId);
  if (!item) return { code: 'no_item', reason: tr('sys.goddess.reject.no_item') };
  if (countItem(ctx.world, playerId, d.itemId) <= 0)
    return { code: 'missing', reason: tr('sys.goddess.reject.missing') };
  const done = Number(ctx.flag('merca_offerings') ?? 0);
  const earth = (item.tags ?? []).includes('earth');
  const points = Math.round(
    Math.max(10, item.value) * (earth ? 3 : 1) * offeringRate(ctx.flag('p_coin_terms'), done),
  );
  removeItem(ctx, playerId, d.itemId, 1, 'offering');
  ctx.setFlag('merca_offerings', done + 1);
  adjustRelation(ctx, merca.id, earth ? 6 : 2);
  // written content lines pass the reveal-ledger rewrite; the default lines are keys whose
  // source text holds no locked term
  const speak = (text: TextParam) =>
    ctx.emit('dialogue.line', {
      speakerId: merca.id,
      speakerName: displayName(ctx, merca),
      text: typeof text === 'string' ? sanitizeText(text, ctx.world, ctx.content) : text,
      listenerId: playerId,
      kind: 'divine',
    });
  speak(merca.replies.offering ?? tr('sys.goddess.line.offering_thanks'));
  if (d.want === 'blessing') {
    const daysN = Math.max(1, Math.min(7, Math.round(points / 50)));
    registerModifier(ctx, {
      target: 'xp',
      key: 'player',
      factor: 1.1,
      untilTick: ctx.tick + daysN * TICKS_PER_GAME_DAY,
      source: merca.id,
      visibility: 'public',
      note: tr('sys.goddess.modifier.coin_blessing', { goddess: contentText('goddesses', merca) }),
    });
    registerModifier(ctx, {
      target: 'price',
      key: 'player',
      factor: 0.9,
      untilTick: ctx.tick + daysN * TICKS_PER_GAME_DAY,
      source: merca.id,
      visibility: 'public',
      note: tr('sys.goddess.modifier.coin_blessing', { goddess: contentText('goddesses', merca) }),
    });
  } else {
    const resolve = flagResolver(ctx.world.meta.flags);
    const intel = (ctx.content.mercaIntel ?? []).find(
      (i) => !ctx.flag(`intel.${merca.id}.${i.id}`) && evaluate(i.when, resolve),
    );
    if (intel) {
      ctx.setFlag(`intel.${merca.id}.${intel.id}`, true);
      speak(intel.text);
    } else speak(tr('sys.goddess.line.no_intel'));
  }
  recordIntervention(ctx, {
    goddess: merca.id,
    action: 'offering',
    mapId: ctx.world.slices.world.entities[playerId]?.mapId ?? '',
    power: 1,
    sediment: 0.01,
    public: false,
    breach: false,
    note:
      d.want === 'blessing'
        ? tr('sys.goddess.note.offering_blessing', { goddess: contentText('goddesses', merca) })
        : tr('sys.goddess.note.offering_intel', { goddess: contentText('goddesses', merca) }),
  });
  return null;
}
