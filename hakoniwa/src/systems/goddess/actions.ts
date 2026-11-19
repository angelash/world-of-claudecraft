// The rule half of the goddess GM (DivineArbiter, goddess_gm.md 2 and 5): validates a
// proposed divine action (menu, act, power, cooldown, reach, covenant, hostility
// budget, forbidden names) and executes it as registered modifiers, forced weather,
// dialogue lines and flags. Every executed action enters the miracle ledger with its
// sediment (E34). The model proposes, this file decides. The arbiter also holds the
// density limit of catalog_goddess_interventions.md 1.3 (power per map over seven days,
// tighter on the player's map), runs the data-driven executors of the catalog's new actions
// (gaze, manifest, narrate), and marks each ledger entry with who chose it and whether the
// player could perceive it (alive metric 8, builtin_ai.md 14.2).

import { type CommandResult, type CommandSource, type FlagValue, ok, reject } from '../../core';
import { contentText } from '../../core/content_key';
import type { SystemContext } from '../../core/system';
import { type KeyText, type TextParam, type TextRef, tr } from '../../core/text';
import { calendarAt, isNight, TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../../core/time';
import { countItem } from '../inventory';
import { registerModifier, TAGGED_TARGETS } from '../modifiers';
import { currentActId } from '../quests/act_order';
import { actIndex, evaluate, flagResolver } from '../quests/conditions';
import { sanitizeText } from '../quests/lore';
import type { ActDef } from '../quests/types';
import { entitiesOnMap, forceWeather, mapById, playerEntity, type Weather } from '../world';
import { gateHolds, marketOn } from './brain/gates';
import { goddessLine } from './brain/lines';
import { brainConfig, onMenu, personaOf } from './brain/persona';
import { brainOf } from './brain/state';
import { goddessDef, playerMap, recordId, recordIntervention } from './state';
import type {
  ActionSeen,
  DivineActionDef,
  GoddessDef,
  GoddessSlice,
  GoddessState,
  InterventionOrigin,
} from './types';

export interface GoddessActParams {
  /** scope map (defaults to the player's map for a goddess bound to the player, her strongest map otherwise) */
  mapId?: string;
  /** target entity id (oracle recipient) */
  targetId?: string;
  /** spoken text (oracle, dream, omen, request) */
  text?: string;
  /**
   * The slot of her own pack the text comes from (PK-M1-34): a kernel source names the
   * slot instead of the sentence, and the executor draws the line when the act runs, so the
   * kernel passes a text key (D-077) and never a sentence. A model may not set it.
   */
  slot?: string;
  /** request key (task request): flag request.<goddess>.<key> */
  key?: string;
  /** oracle side flag: only keys under oracle.<goddess>. are accepted */
  flag?: string;
  value?: FlagValue;
  /** price action: goods id, a comma list of goods ids, or '*' for the whole market */
  goods?: string;
  /** price action: factor 0.6..1.4 */
  factor?: number;
  /** duration in game days (bounded per action) */
  days?: number;
  weather?: Weather;
  /** blessing: the token item the player holds */
  item?: string;
  /** a qualitative channel's word (route state, resource tag, collateral) */
  tag?: string;
}

export interface GoddessActCommand {
  goddessId: string;
  action: string;
  revision: number;
  params?: GoddessActParams;
  /** explicit covenant breach channel (D-026): double cost, once per act, leaves a trace */
  breach?: boolean;
  /** who chose it (the brain marks its own picks; absent: a command from outside) */
  origin?: InterventionOrigin;
  /**
   * The tick the day's plan puts it at (builtin_ai 8.3: the dawn round plans the day; the
   * acts happen through it). A later tick keeps it on her agenda until then; it is
   * validated again when it runs.
   */
  at?: number;
  /** the scheme whose step it is (origin scheme): a refusal when it runs stalls that one */
  scheme?: string;
}

/** Interventions kept for the density limit (seven days by default). */
function densityLog(slice: GoddessSlice) {
  slice.density ??= [];
  return slice.density;
}

/**
 * Power spent on a map over the density window, and on the player's map (catalog 1.3): the
 * sums the next action would add to. Written acts and revelations do not count.
 */
export function densityOn(
  ctx: SystemContext,
  mapId: string,
): { map: number; playerMap: number; days: number } {
  const cfg = brainConfig(ctx.content).density;
  const since = ctx.tick - cfg.days * TICKS_PER_GAME_DAY;
  let map = 0;
  let pm = 0;
  for (const e of densityLog(ctx.world.slices.goddess)) {
    if (e.tick < since) continue;
    if (e.mapId === mapId) map += e.power;
    if (e.playerMap) pm += e.power;
  }
  return { map, playerMap: pm, days: cfg.days };
}

/** Note power spent on a map for the density limit (the director's fate threads too). */
export function recordDensity(
  ctx: SystemContext,
  mapId: string,
  power: number,
  onPlayer: boolean,
): void {
  const log = densityLog(ctx.world.slices.goddess);
  const since = ctx.tick - brainConfig(ctx.content).density.days * TICKS_PER_GAME_DAY;
  while (log.length > 0 && (log[0] as { tick: number }).tick < since) log.shift();
  if (power > 0) log.push({ tick: ctx.tick, mapId, power, playerMap: onPlayer });
}

/**
 * Whether a command is a written act the executor runs (catalog 4): only a command of the
 * kernel itself (or a fallback it filed) may say so; a model or a player cannot.
 */
export function isWritten(d: GoddessActCommand, source: CommandSource): boolean {
  return d.origin === 'beat' && trusted(source);
}

/** Sources whose `origin` and `at` the arbiter believes (the kernel and its fallbacks). */
export function trusted(source: CommandSource): boolean {
  return source.type === 'system' || source.type === 'fallback';
}

/** Who can perceive an action (its data, or the visibility default). */
export function seenOf(a: DivineActionDef): ActionSeen {
  return a.seen ?? (a.visibility === 'public' ? 'map' : 'never');
}

/** Whether this executed action reached the player's senses (alive metric 8). */
function perceived(
  a: DivineActionDef,
  mapId: string,
  onPlayerMap: boolean,
  targetIsPlayer: boolean,
): boolean {
  const seen = seenOf(a);
  if (a.id === 'dream') return targetIsPlayer;
  if (seen === 'player') return true;
  if (seen === 'map') return onPlayerMap && mapId !== '';
  return false;
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
export function defaultMap(ctx: SystemContext, def: GoddessDef, s: GoddessState): string {
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
  if (!onMenu(def, personaOf(ctx.content, def.id), currentAct(ctx), d.action))
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
  // her reach: a commission, her gaze and what goes through her token need no faith there
  const viaToken = a.needs?.includes('token') ?? false;
  if (
    def.reach !== 'player' &&
    d.action !== 'request' &&
    a.exec !== 'gaze' &&
    !viaToken &&
    reach(s, mapId) < 0.05
  ) {
    return { code: 'out_of_reach', reason: tr('sys.goddess.reject.out_of_reach') };
  }
  // a written act (catalog 4) is the executor's: it waits for no cooldown, gate or density
  const written = isWritten(d, source);
  const breach = !!d.breach;
  if (breach) {
    if (!a.breachable)
      return { code: 'not_breachable', reason: tr('sys.goddess.reject.not_breachable') };
    if (s.breachActs.includes(currentAct(ctx))) {
      return { code: 'breach_used', reason: tr('sys.goddess.reject.breach_used') };
    }
  }
  const cost = priceCost(a, breach, p, marketOn(ctx.content, mapId));
  if (s.power < cost)
    return { code: 'no_power', reason: tr('sys.goddess.reject.no_power', { cost }) };
  if (!written && (s.cooldowns[a.id] ?? 0) > ctx.tick)
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
  // only a goddess bound to the player dreams into the player's sleep (catalog 2.1)
  if (a.id === 'dream' && def.reach !== 'player' && !p.targetId) {
    return { code: 'dream_target', reason: tr('sys.goddess.reject.dream_target') };
  }
  if (p.targetId && !ctx.world.slices.world.entities[p.targetId]) {
    return { code: 'no_target', reason: tr('sys.goddess.reject.no_target') };
  }
  if (a.exec === 'manifest' || a.id === 'blessing') {
    const token = p.item ?? def.token;
    if (!token || countItem(ctx.world, ctx.world.slices.world.playerId, token) <= 0) {
      return { code: 'no_token', reason: tr('sys.goddess.reject.no_token') };
    }
  }
  if (p.slot !== undefined && (source.type === 'ai' || a.slots?.[d.goddessId] !== p.slot)) {
    return { code: 'no_text', reason: tr('sys.goddess.reject.no_text.act') };
  }
  if ((a.id === 'oracle' || a.id === 'dream' || a.id === 'omen') && !p.text?.trim() && !p.slot) {
    return { code: 'no_text', reason: tr('sys.goddess.reject.no_text.act') };
  }
  if (a.id === 'request' && !(p.key && /^[a-z0-9_]{1,32}$/.test(p.key))) {
    return { code: 'bad_key', reason: tr('sys.goddess.reject.bad_key') };
  }
  if (cost > 0 && !written) {
    const dens = densityOn(ctx, mapId);
    const lim = brainConfig(ctx.content).density;
    const onPlayer = mapId === playerMap(ctx.world);
    if (dens.map + cost > lim.region || (onPlayer && dens.playerMap + cost > lim.playerRegion)) {
      return { code: 'density', reason: tr('sys.goddess.reject.density') };
    }
  }
  if (p.flag && !p.flag.startsWith(`oracle.${d.goddessId}.`)) {
    return {
      code: 'bad_flag',
      reason: tr('sys.goddess.reject.bad_flag', { goddess: d.goddessId }),
    };
  }
  // the gates of the action on this map (catalog 5.0 G; catalog 2.5: an omen needs a danger)
  if (!written)
    for (const need of a.needs ?? [])
      if (!gateHolds(ctx, def, need, mapId))
        return { code: 'gate', reason: tr(`sys.goddess.reject.gate.${need}`) };
  return null;
}

/**
 * What she says in an act: the line drawn from her own pack when the act names a slot (a text
 * key, PK-M1-34), else the act's own text, sanitized. Null when neither gives anything.
 */
function spoken(ctx: SystemContext, def: GoddessDef, p: GoddessActParams): TextParam | null {
  if (p.slot) {
    const drawn = goddessLine(ctx, def.id, p.slot);
    if (drawn) return drawn;
  }
  const text = p.text?.trim() ? sanitizeText(p.text, ctx.world, ctx.content) : '';
  return text === '' ? null : text;
}

function line(
  ctx: SystemContext,
  def: GoddessDef,
  text: TextParam | null,
  listenerId?: string,
): void {
  if (text === null) return;
  ctx.emit('dialogue.line', {
    speakerId: def.id,
    speakerName: displayName(ctx, def),
    text,
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
  const playerId = ctx.world.slices.world.playerId;
  const market = marketOn(ctx.content, mapId);
  const cost = priceCost(a, breach, p, market);
  let note: TextRef | string = a.label;
  let isPublic = a.visibility === 'public';
  let toPlayer = false;
  let inLedger = true;
  const onPlayerMap = mapId === playerMap(ctx.world);

  // the word of a qualitative channel: the kernel may name any; a model keeps to the action's
  // own word, or a plain id when the action has none
  const tagWord = trusted(source)
    ? (p.tag ?? a.tag)
    : (a.tag ?? (p.tag && /^[a-z][a-z0-9_]{0,23}$/.test(p.tag) ? p.tag : undefined));
  // a duration the command names (days) applies to every modifier; otherwise each keeps the
  // hours its data gives
  const addMods = (dur: number, weatherWord?: string, noteOverride?: TextRef) => {
    for (const m of a.modifiers ?? []) {
      const ticks =
        p.days !== undefined ? dur : Math.max(1, Math.round(m.hours * TICKS_PER_GAME_HOUR));
      const word =
        m.target === 'weather'
          ? weatherWord
          : TAGGED_TARGETS.includes(m.target)
            ? tagWord
            : undefined;
      // a weather record needs the weather it records
      if (m.target === 'weather' && !word) continue;
      registerModifier(ctx, {
        target: m.target,
        key: m.key === 'region' ? mapId : m.key,
        factor: m.factor,
        add: m.add,
        ...(word !== undefined ? { tag: word } : {}),
        untilTick: ctx.tick + Math.max(1, Math.round(ticks)),
        source: def.id,
        visibility: isPublic ? 'public' : 'hidden',
        stackGroup: a.id,
        note:
          noteOverride ??
          tr('sys.goddess.modifier.action', {
            goddess: contentText('goddesses', def),
            action: contentText('divineActions', a, '', 'label'),
          }),
      });
    }
  };

  switch (a.id) {
    case 'oracle': {
      const target = p.targetId ? ctx.world.slices.world.entities[p.targetId] : undefined;
      // the player hears the words where they are spoken (on the player's map), or to them
      const here = playerMap(ctx.world);
      if (target ? target.id === playerId || target.mapId === here : onPlayerMap)
        line(ctx, def, spoken(ctx, def, p), target?.id);
      if (p.flag) ctx.setFlag(p.flag, p.value ?? true);
      note = target
        ? tr('sys.goddess.note.oracle_to', { who: target.name })
        : tr('sys.goddess.note.oracle');
      break;
    }
    case 'dream': {
      const listener = p.targetId ?? playerId;
      toPlayer = listener === playerId;
      // a dream is heard only by its sleeper: the player reads only their own
      if (toPlayer) line(ctx, def, spoken(ctx, def, p), listener);
      note = tr('sys.goddess.note.dream');
      isPublic = false;
      break;
    }
    case 'omen': {
      // the animals are seen where it happens (catalog 2.5): told only on the player's map
      const omen = onPlayerMap ? spoken(ctx, def, p) : null;
      if (omen !== null)
        ctx.emit('dialogue.line', {
          speakerId: 'narrator',
          speakerName: '',
          text: omen,
          kind: 'narrate',
        });
      ctx.setFlag(`omen.${mapId}`, ctx.tick);
      note = tr('sys.goddess.note.omen');
      break;
    }
    case 'blessing': {
      // the token blessing (catalog 2.4 div_merca_token_blessing): her coin grows warm
      addMods(
        days(p, 7, 3) * TICKS_PER_GAME_DAY,
        undefined,
        tr('sys.goddess.modifier.coin_blessing', { goddess: contentText('goddesses', def) }),
      );
      note = tr('sys.goddess.note.blessing');
      break;
    }
    case 'miracle': {
      addMods(days(p, 7, 3) * TICKS_PER_GAME_DAY);
      if (onPlayerMap)
        ctx.emit('dialogue.line', {
          speakerId: 'narrator',
          speakerName: '',
          text: tr('sys.goddess.narrate.miracle', {
            place: contentText('maps', mapById(ctx.content, mapId)),
          }),
          kind: 'narrate',
        });
      note = tr('sys.goddess.note.miracle');
      break;
    }
    case 'calamity':
    case 'monster_tide':
    case 'weather': {
      const dur = days(p, a.id === 'weather' ? 3 : 7, 2) * TICKS_PER_GAME_DAY;
      const w =
        p.weather && WEATHERS.includes(p.weather) ? p.weather : (a.weather as Weather | undefined);
      addMods(dur, w);
      // the sky turns for as long as its weather record lasts (the command's days, or the
      // record's hours); a calamity without a record brings its storm for the default days
      const record = (a.modifiers ?? []).find((m) => m.target === 'weather');
      const sky =
        p.days === undefined && record
          ? Math.max(1, Math.round(record.hours * TICKS_PER_GAME_HOUR))
          : dur;
      if (w) forceWeather(ctx, w, ctx.tick + sky, def.id);
      note = a.label;
      break;
    }
    case 'price': {
      const factor = Math.max(0.6, Math.min(1.4, p.factor ?? 1.15));
      const dur = days(p, 30, 7) * TICKS_PER_GAME_DAY;
      // on a market: that market's goods (market:goods) or the whole market; elsewhere the
      // goods everywhere (the old reach of the action)
      for (const key of priceKeys(p.goods, market)) {
        registerModifier(ctx, {
          target: 'price',
          key,
          factor,
          untilTick: ctx.tick + dur,
          source: def.id,
          visibility: 'public',
          stackGroup: a.id,
          note: tr('sys.goddess.modifier.price', { goddess: contentText('goddesses', def) }),
        });
      }
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
      switch (a.exec) {
        case 'gaze': {
          // her sight rests on the map (catalog 1.3 gaze slots): not an intervention
          brainOf(ctx.world.slices.goddess, def.id).gaze = {
            mapId,
            until: ctx.tick + days(p, 7, 1) * TICKS_PER_GAME_DAY,
          };
          inLedger = false;
          note = tr('sys.goddess.note.gaze');
          break;
        }
        case 'manifest': {
          const text = p.text
            ? sanitizeText(p.text, ctx.world, ctx.content)
            : a.slot
              ? goddessLine(ctx, def.id, a.slot)
              : null;
          ctx.emit('dialogue.line', {
            speakerId: def.id,
            speakerName: displayName(ctx, def),
            text: text ?? tr('sys.goddess.line.manifest'),
            listenerId: playerId,
            kind: 'divine',
          });
          toPlayer = true;
          note = tr('sys.goddess.note.manifest');
          break;
        }
        case 'narrate': {
          addMods(days(p, 30, 1) * TICKS_PER_GAME_DAY);
          // the phenomenon is told where the player stands; elsewhere, or when nobody can
          // perceive it at all (seen: never), it happens unseen
          if (onPlayerMap && seenOf(a) !== 'never')
            ctx.emit('dialogue.line', {
              speakerId: 'narrator',
              speakerName: '',
              text: p.text
                ? sanitizeText(p.text, ctx.world, ctx.content)
                : tr(`sys.goddess.narrate.${a.id}`, {
                    place: contentText('maps', mapById(ctx.content, mapId), mapId),
                  }),
              kind: 'narrate',
            });
          note = a.label;
          break;
        }
        default:
          return reject('no_action', tr('sys.goddess.reject.no_action'));
      }
  }

  s.power -= cost;
  s.cooldowns[a.id] = ctx.tick + Math.round(a.cooldownHours * TICKS_PER_GAME_HOUR);
  s.revision++;
  const act = currentAct(ctx);
  if (a.hostile && mapId === playerMap(ctx.world)) s.hostility[act] = (s.hostility[act] ?? 0) + 1;
  // what her own choices spent is booked on `goddess.acted` (an act that lands an open
  // scripted act stands outside the act budget, ./brain/budget.ts)
  const origin: InterventionOrigin =
    trusted(source) && d.origin ? d.origin : source.type === 'ai' ? 'plan' : 'command';
  if (!isWritten(d, source)) recordDensity(ctx, mapId, cost, onPlayerMap);
  const seen = perceived(a, mapId, onPlayerMap, toPlayer);
  const entry = inLedger
    ? recordIntervention(ctx, {
        goddess: def.id,
        action: a.id,
        mapId,
        power: cost,
        sediment: Math.round(cost * a.sedimentRate * 100) / 100,
        public: isPublic,
        breach,
        note: tr('sys.goddess.note.entry', { goddess: contentText('goddesses', def), note }),
        seen,
        origin,
      })
    : null;
  if (breach) {
    s.breachActs.push(act);
    const trace = tr('sys.goddess.breach.trace', {
      place: contentText('maps', mapById(ctx.content, mapId), mapId),
      goddess: contentText('goddesses', def),
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
    miracleId: entry?.id ?? '',
    seen,
    origin,
    targetId: p.targetId,
    power: cost,
  });
  return ok(note);
}

/** The price modifier keys of a price action (economy market.ts reads all three forms). */
export function priceKeys(goods: string | undefined, market: string | undefined): string[] {
  const list = (goods ?? '*')
    .split(',')
    .map((g) => g.trim())
    .filter((g) => g !== '');
  if (!market) return list.length > 0 ? list : ['*'];
  if (list.length === 0 || list.includes('*')) return [market];
  return list.map((g) => `${market}:${g}`);
}

/** Cost of an act: a whole-market price change costs half again (catalog 2.4). */
export function priceCost(
  a: DivineActionDef,
  breach: boolean,
  p: GoddessActParams,
  market: string | undefined,
): number {
  const whole = a.id === 'price' && !!market && priceKeys(p.goods, market)[0] === market;
  return actionCost(a, breach) * (whole ? 1.5 : 1);
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
