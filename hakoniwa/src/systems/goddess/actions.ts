// The rule half of the goddess GM (DivineArbiter, goddess_gm.md 2 and 5): validates a
// proposed divine action (menu, act, power, cooldown, reach, covenant, hostility
// budget, forbidden names) and executes it as registered modifiers, forced weather,
// dialogue lines and flags. Every executed action enters the miracle ledger with its
// sediment (E34). The model proposes, this file decides.

import { type CommandResult, type CommandSource, type FlagValue, ok, reject } from '../../core';
import type { SystemContext } from '../../core/system';
import { type KeyText, type TextRef, tr } from '../../core/text';
import { calendarAt, isNight, TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../../core/time';
import { countItem } from '../inventory';
import { registerModifier } from '../modifiers';
import { currentActId } from '../quests/act_order';
import { actIndex, evaluate, flagResolver } from '../quests/conditions';
import { sanitizeText } from '../quests/lore';
import type { ActDef } from '../quests/types';
import { entitiesOnMap, forceWeather, mapById, playerEntity, type Weather } from '../world';
import { goddessDef, playerMap, recordId, recordIntervention } from './state';
import type { DivineActionDef, GoddessDef, GoddessState } from './types';

export interface GoddessActParams {
  /** scope map (defaults to the player's map for a goddess bound to the player, her strongest map otherwise) */
  mapId?: string;
  /** target entity id (oracle recipient) */
  targetId?: string;
  /** spoken text (oracle, dream, omen, request) */
  text?: string;
  /** request key (task request): flag request.<goddess>.<key> */
  key?: string;
  /** oracle side flag: only keys under oracle.<goddess>. are accepted */
  flag?: string;
  value?: FlagValue;
  /** price action: goods id or '*' */
  goods?: string;
  /** price action: factor 0.6..1.4 */
  factor?: number;
  /** duration in game days (bounded per action) */
  days?: number;
  weather?: Weather;
  /** blessing: the token item the player holds */
  item?: string;
}

export interface GoddessActCommand {
  goddessId: string;
  action: string;
  revision: number;
  params?: GoddessActParams;
  /** explicit covenant breach channel (D-026): double cost, once per act, leaves a trace */
  breach?: boolean;
}

const WEATHERS: readonly Weather[] = ['clear', 'cloudy', 'rain', 'storm', 'fog', 'snow', 'ashfall'];

export function actionDef(
  content: { divineActions: DivineActionDef[] },
  id: string,
): DivineActionDef | undefined {
  return content.divineActions.find((a) => a.id === id);
}

type ActCtx = {
  flag(key: string): FlagValue | undefined;
  content: { acts?: readonly ActDef[] };
};

export function currentAct(ctx: ActCtx): string {
  return currentActId(ctx);
}

/** The name the player may see for a goddess right now (janu stays 门口的女人 until named). */
export function displayName(
  ctx: { flag(key: string): FlagValue | undefined },
  def: GoddessDef,
): string {
  if (def.hiddenName && def.revealWhen && !ctx.flag(def.revealWhen)) return def.hiddenName;
  return def.name;
}

/** Act gate: goddess tools work in acts 1 to 5 (the review in act 6 suspends them, act6 2.4). */
export function toolsActive(ctx: ActCtx, def: GoddessDef, s: GoddessState): boolean {
  const idx = actIndex(currentAct(ctx));
  if (Number.isNaN(idx) || idx < 1 || idx > 5) return false;
  if (s.departed) return false;
  return idx >= def.activeFromAct;
}

/** Her own gate beyond the act (GoddessDef.actsWhen; Janu: the seal stage, goddess_gm.md 12.3). */
function mayAct(ctx: SystemContext, def: GoddessDef): boolean {
  return !def.actsWhen || evaluate(def.actsWhen, flagResolver(ctx.world.meta.flags));
}

/** Default scope map: the player's map for a goddess bound to the player, else her strongest. */
function defaultMap(ctx: SystemContext, def: GoddessDef, s: GoddessState): string {
  return def.reach === 'player' ? playerMap(ctx.world) : strongestMap(s, ctx.content);
}

/** Faith share of a goddess on a map (0 when unknown). */
export function reach(s: GoddessState, mapId: string): number {
  return s.faith[mapId] ?? 0;
}

/** The map where she is strongest (stable tie-break by id). */
export function strongestMap(s: GoddessState, content: { maps: { id: string }[] }): string {
  const ids = Object.keys(s.faith)
    .filter((m) => content.maps.some((x) => x.id === m))
    .sort();
  let best = '';
  let bestShare = -1;
  for (const m of ids) {
    const v = s.faith[m] ?? 0;
    if (v > bestShare) {
      best = m;
      bestShare = v;
    }
  }
  return best;
}

export function actionCost(a: DivineActionDef, breach: boolean): number {
  return a.power * (breach ? 2 : 1);
}

/** Pure validation; returns null when the action may run (also used by the planner). */
export function validateAct(
  ctx: SystemContext,
  d: GoddessActCommand,
  source: CommandSource,
): { code: string; reason: KeyText } | null {
  const def = goddessDef(ctx.content, d.goddessId);
  const s = ctx.world.slices.goddess.goddesses[d.goddessId];
  if (!def || !s) return { code: 'no_goddess', reason: tr('sys.goddess.reject.no_goddess.act') };
  if (!toolsActive(ctx, def, s))
    return { code: 'inactive', reason: tr('sys.goddess.reject.inactive.act') };
  if (!def.menu.includes(d.action))
    return { code: 'not_on_menu', reason: tr('sys.goddess.reject.not_on_menu') };
  const a = actionDef(ctx.content, d.action);
  if (!a) return { code: 'no_action', reason: tr('sys.goddess.reject.no_action') };
  const idx = actIndex(currentAct(ctx));
  if (idx < a.minAct) return { code: 'too_early', reason: tr('sys.goddess.reject.too_early') };
  if (source.type === 'ai' && d.revision !== s.revision) {
    return { code: 'stale', reason: tr('sys.goddess.reject.stale.act') };
  }
  if (!mayAct(ctx, def)) {
    return { code: 'sealed', reason: tr('sys.goddess.reject.sealed') };
  }
  const p = d.params ?? {};
  const mapId = p.mapId ?? defaultMap(ctx, def, s);
  if (!mapById(ctx.content, mapId))
    return { code: 'no_map', reason: tr('sys.goddess.reject.no_map') };
  if (def.reach !== 'player' && d.action !== 'request' && reach(s, mapId) < 0.05) {
    return { code: 'out_of_reach', reason: tr('sys.goddess.reject.out_of_reach') };
  }
  const breach = !!d.breach;
  if (breach) {
    if (!a.breachable)
      return { code: 'not_breachable', reason: tr('sys.goddess.reject.not_breachable') };
    if (s.breachActs.includes(currentAct(ctx))) {
      return { code: 'breach_used', reason: tr('sys.goddess.reject.breach_used') };
    }
  }
  const cost = actionCost(a, breach);
  if (s.power < cost)
    return { code: 'no_power', reason: tr('sys.goddess.reject.no_power', { cost }) };
  if ((s.cooldowns[a.id] ?? 0) > ctx.tick)
    return { code: 'cooldown', reason: tr('sys.goddess.reject.cooldown') };
  if (a.hostile && mapId === playerMap(ctx.world)) {
    const used = s.hostility[currentAct(ctx)] ?? 0;
    if (used >= ctx.world.slices.goddess.hostilityBudget) {
      return { code: 'hostility_budget', reason: tr('sys.goddess.reject.hostility_budget') };
    }
  }
  if (a.id === 'dream' && !isNight(calendarAt(ctx.tick))) {
    return { code: 'not_night', reason: tr('sys.goddess.reject.not_night') };
  }
  if (a.id === 'blessing') {
    const token = p.item ?? def.token;
    if (!token || countItem(ctx.world, ctx.world.slices.world.playerId, token) <= 0) {
      return { code: 'no_token', reason: tr('sys.goddess.reject.no_token') };
    }
  }
  if ((a.id === 'oracle' || a.id === 'dream' || a.id === 'omen') && !p.text?.trim()) {
    return { code: 'no_text', reason: tr('sys.goddess.reject.no_text.act') };
  }
  if (a.id === 'request' && !(p.key && /^[a-z0-9_]{1,32}$/.test(p.key))) {
    return { code: 'bad_key', reason: tr('sys.goddess.reject.bad_key') };
  }
  if (p.flag && !p.flag.startsWith(`oracle.${d.goddessId}.`)) {
    return {
      code: 'bad_flag',
      reason: tr('sys.goddess.reject.bad_flag', { goddess: d.goddessId }),
    };
  }
  return null;
}

function line(ctx: SystemContext, def: GoddessDef, text: string, listenerId?: string): void {
  ctx.emit('dialogue.line', {
    speakerId: def.id,
    speakerName: displayName(ctx, def),
    text: sanitizeText(text, ctx.world, ctx.content),
    listenerId,
    kind: 'divine',
  });
}

function days(p: GoddessActParams, max: number, dflt: number): number {
  const n = Math.round(p.days ?? dflt);
  return Math.max(1, Math.min(max, n));
}

/** Validate and execute `goddess.act`. */
export function executeAct(
  ctx: SystemContext,
  d: GoddessActCommand,
  source: CommandSource,
): CommandResult {
  const bad = validateAct(ctx, d, source);
  if (bad) return reject(bad.code, bad.reason);
  const def = goddessDef(ctx.content, d.goddessId) as GoddessDef;
  const s = ctx.world.slices.goddess.goddesses[d.goddessId] as GoddessState;
  const a = actionDef(ctx.content, d.action) as DivineActionDef;
  const p = d.params ?? {};
  const mapId = p.mapId ?? defaultMap(ctx, def, s);
  const breach = !!d.breach;
  const cost = actionCost(a, breach);
  const playerId = ctx.world.slices.world.playerId;
  let note: TextRef | string = a.label;
  let isPublic = a.visibility === 'public';

  const addMods = (dur: number) => {
    for (const m of a.modifiers ?? []) {
      registerModifier(ctx, {
        target: m.target,
        key: m.key === 'region' ? mapId : m.key,
        factor: m.factor,
        add: m.add,
        untilTick: ctx.tick + Math.max(1, Math.round(dur)),
        source: def.id,
        visibility: isPublic ? 'public' : 'hidden',
        note: tr('sys.goddess.modifier.action', { goddess: def.name, action: a.label }),
      });
    }
  };

  switch (a.id) {
    case 'oracle': {
      const target = p.targetId ? ctx.world.slices.world.entities[p.targetId] : undefined;
      line(ctx, def, p.text as string, target?.id);
      if (p.flag) ctx.setFlag(p.flag, p.value ?? true);
      note = target
        ? tr('sys.goddess.note.oracle_to', { who: target.name })
        : tr('sys.goddess.note.oracle');
      break;
    }
    case 'dream': {
      line(ctx, def, p.text as string, playerId);
      note = tr('sys.goddess.note.dream');
      isPublic = false;
      break;
    }
    case 'omen': {
      ctx.emit('dialogue.line', {
        speakerId: 'narrator',
        speakerName: '',
        text: sanitizeText(p.text as string, ctx.world, ctx.content),
        kind: 'narrate',
      });
      ctx.setFlag(`omen.${mapId}`, ctx.tick);
      note = tr('sys.goddess.note.omen');
      break;
    }
    case 'blessing': {
      addMods(days(p, 7, 3) * TICKS_PER_GAME_DAY);
      note = tr('sys.goddess.note.blessing');
      break;
    }
    case 'miracle': {
      addMods(days(p, 7, 3) * TICKS_PER_GAME_DAY);
      ctx.emit('dialogue.line', {
        speakerId: 'narrator',
        speakerName: '',
        text: tr('sys.goddess.narrate.miracle', { place: mapById(ctx.content, mapId)?.name ?? '' }),
        kind: 'narrate',
      });
      note = tr('sys.goddess.note.miracle');
      break;
    }
    case 'calamity':
    case 'monster_tide':
    case 'weather': {
      const dur = days(p, a.id === 'weather' ? 3 : 7, 2) * TICKS_PER_GAME_DAY;
      addMods(dur);
      const w =
        p.weather && WEATHERS.includes(p.weather) ? p.weather : (a.weather as Weather | undefined);
      if (w) forceWeather(ctx, w, ctx.tick + dur, def.id);
      note = a.label;
      break;
    }
    case 'price': {
      const factor = Math.max(0.6, Math.min(1.4, p.factor ?? 1.15));
      const dur = days(p, 30, 7) * TICKS_PER_GAME_DAY;
      registerModifier(ctx, {
        target: 'price',
        key: p.goods ?? '*',
        factor,
        untilTick: ctx.tick + dur,
        source: def.id,
        visibility: 'public',
        note: tr('sys.goddess.modifier.price', { goddess: def.name }),
      });
      note = tr('sys.goddess.note.price', {
        goods: p.goods ?? tr('sys.goddess.note.price_all'),
        pct: Math.round(factor * 100),
      });
      break;
    }
    case 'request': {
      ctx.setFlag(
        `request.${def.id}.${p.key}`,
        sanitizeText(p.text ?? p.key ?? '', ctx.world, ctx.content),
      );
      note = tr('sys.goddess.note.request');
      break;
    }
    default:
      return reject('no_action', tr('sys.goddess.reject.no_action'));
  }

  s.power -= cost;
  s.cooldowns[a.id] = ctx.tick + Math.round(a.cooldownHours * TICKS_PER_GAME_HOUR);
  s.revision++;
  const act = currentAct(ctx);
  if (a.hostile && mapId === playerMap(ctx.world)) s.hostility[act] = (s.hostility[act] ?? 0) + 1;
  const entry = recordIntervention(ctx, {
    goddess: def.id,
    action: a.id,
    mapId,
    power: cost,
    sediment: Math.round(cost * a.sedimentRate * 100) / 100,
    public: isPublic,
    breach,
    note: tr('sys.goddess.note.entry', { goddess: def.name, note }),
  });
  if (breach) {
    s.breachActs.push(act);
    const trace = tr('sys.goddess.breach.trace', {
      place: mapById(ctx.content, mapId)?.name ?? mapId,
      goddess: def.name,
    });
    ctx.world.slices.goddess.breaches.push({
      id: recordId(ctx, 'breach'),
      goddess: def.id,
      act,
      tick: ctx.tick,
      action: a.id,
      mapId,
      trace,
    });
    ctx.setFlag(`breach.${def.id}.${act}`, true);
  }
  ctx.setFlag(`goddess.${def.id}.power`, Math.round(s.power));
  ctx.emit('goddess.acted', {
    goddessId: def.id,
    action: a.id,
    mapId,
    public: isPublic,
    breach,
    miracleId: entry.id,
  });
  return ok(note);
}

/** Is the player standing where a follower of this goddess can see? (used for sight). */
export function believersNear(
  ctx: SystemContext,
  def: GoddessDef,
  mapId: string,
  x: number,
  y: number,
  radius: number,
): number {
  let n = 0;
  for (const e of entitiesOnMap(ctx.world, mapId)) {
    if (!e.alive || e.hidden || e.kind === 'player') continue;
    if (Math.hypot(e.x - x, e.y - y) > radius) continue;
    if (e.tags.some((t) => def.faithTags.includes(t))) n += e.tags.includes('priest') ? 2 : 1;
  }
  return n;
}

export function playerPosition(ctx: SystemContext): { mapId: string; x: number; y: number } | null {
  const p = playerEntity(ctx.world);
  return p ? { mapId: p.mapId, x: p.x, y: p.y } : null;
}
