// The registered input functions of the NPC utility library (builtin_ai.md 2.1: "input 是
// 注册过的输入函数编号"). Each reads the actor's view and returns a number: the raw need
// levels 0..100 (`need.<need>`), their shortfall 0..1 (`low.<need>`), and 0..1 facts.
// Content validation checks every input a library action names is registered here.

import { TICKS_PER_GAME_HOUR } from '../../../core/time';
import { HOLY_WEEKDAY, MARKET_WEEKDAY, MEAL_TAVERN } from '../constants';
import { ensureNeeds } from '../needs';
import { resolvePlaceOn } from '../places';
import { coversHour, scheduleOf } from '../schedule';
import { hasTrait } from '../traits';
import { NEED_KEYS, type NeedKey } from '../types';
import { holdsHot, namedHere, roleOnMap } from './sense';
import { since } from './state';
import type { ActorView } from './view';

type Input = (v: ActorView) => number;

const bool = (b: boolean) => (b ? 1 : 0);

/** The schedule says work now, or did in the hour before (overtime fits after work). */
function nearWork(v: ActorView): boolean {
  if (v.template.act === 'work') return true;
  const prev = (v.hour + 23) % 24;
  return scheduleOf(v.ctx.content, v.card).some((s) => s.act === 'work' && coversHour(s, prev));
}

export const INPUTS: Readonly<Record<string, Input>> = {
  'money.meal': (v) => bool(v.money >= MEAL_TAVERN),
  'money.poor': (v) => bool(v.money < 40),
  'price.meal': (v) => Math.min(1, MEAL_TAVERN / Math.max(1, v.money)),
  night: (v) => bool(v.hour >= 21 || v.hour < 6),
  holy_day: (v) => bool(v.weekday === HOLY_WEEKDAY),
  market_day: (v) => bool(v.weekday === MARKET_WEEKDAY),
  devotion: (v) => v.p?.devotion ?? 0.3,
  hot_rumor: (v) => bool(holdsHot(v.ctx, v.st.id)),
  near_work: (v) => bool(nearWork(v)),
  has_work: (v) => bool(v.card.work !== v.card.home),
  has_cleric: (v) => bool(roleOnMap(v.ctx, v.st.mapId, 'cleric')),
  has_refuge: (v) => bool(!!resolvePlaceOn(v.ctx.content, v.card, '@church')),
  offender_here: (v) =>
    bool(!!v.brain.offender && namedHere(v.ctx, v.st).some((o) => o.id === v.brain.offender)),
  danger: (v) =>
    since(v.st, 'threat', v.ctx.tick) <= TICKS_PER_GAME_HOUR / 2
      ? 1
      : ensureNeeds(v.st.needs).safety < 20
        ? 0.6
        : 0,
  proud: (v) => bool(hasTrait(v.p, 'proud')),
  fighter: (v) =>
    bool(!!v.p?.roles?.some((r) => r === 'general' || r === 'rival') || hasTrait(v.p, 'brave')),
};

/** Every registered input id; `need.*` and `low.*` stand for the nine needs. */
export const INPUT_IDS: ReadonlySet<string> = new Set([
  ...Object.keys(INPUTS),
  ...NEED_KEYS.map((k) => `need.${k}`),
  ...NEED_KEYS.map((k) => `low.${k}`),
]);

/** The value of an input for the actor; an unknown id reads 0 (content validation catches it). */
export function inputValue(v: ActorView, id: string): number {
  const dot = id.indexOf('.');
  const head = dot > 0 ? id.slice(0, dot) : id;
  if (head === 'need' || head === 'low') {
    const k = id.slice(dot + 1) as NeedKey;
    const needs = ensureNeeds(v.st.needs);
    if (!(k in needs)) return 0;
    return head === 'need' ? needs[k] : Math.max(0, Math.min(1, (100 - needs[k]) / 100));
  }
  return INPUTS[id]?.(v) ?? 0;
}
