// The rule half of the goddess GM (DivineArbiter, goddess_gm.md 2 and 5): validates a
// proposed divine action (menu, act, power, cooldown, reach, covenant, hostility
// budget, forbidden names) and executes it as registered modifiers, forced weather,
// dialogue lines and flags. Every executed action enters the miracle ledger with its
// sediment (E34). The model proposes, this file decides.

import { type CommandResult, type CommandSource, type FlagValue, ok, reject } from '../../core';
import type { SystemContext } from '../../core/system';
import { calendarAt, isNight, TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../../core/time';
import { countItem } from '../inventory';
import { registerModifier } from '../modifiers';
import { actIndex } from '../quests/conditions';
import { sanitizeText } from '../quests/lore';
import { entitiesOnMap, forceWeather, mapById, playerEntity, type Weather } from '../world';
import { goddessDef, playerMap, recordIntervention } from './state';
import type { DivineActionDef, GoddessDef, GoddessState } from './types';

export interface GoddessActParams {
  /** scope map (defaults to the player's map for janu, her strongest map otherwise) */
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

/** Token items through which a goddess may bless the pageless player (goddess_gm.md 10.10). */
export const TOKENS: Record<string, string> = { merca: 'merca_coin' };

export function actionDef(
  content: { divineActions: DivineActionDef[] },
  id: string,
): DivineActionDef | undefined {
  return content.divineActions.find((a) => a.id === id);
}

export function currentAct(ctx: { flag(key: string): FlagValue | undefined }): string {
  return String(ctx.flag('act') ?? 'prologue');
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
export function toolsActive(
  ctx: { flag(key: string): FlagValue | undefined },
  def: GoddessDef,
  s: GoddessState,
): boolean {
  const idx = actIndex(currentAct(ctx));
  if (Number.isNaN(idx) || idx < 1 || idx > 5) return false;
  if (s.departed) return false;
  return idx >= def.activeFromAct;
}

/** Janu acts by seal stage (goddess_gm.md 12.3): dreams from stage 1 (looseness 10). */
function januStageOk(ctx: SystemContext): boolean {
  return Number(ctx.flag('seal_looseness') ?? 0) >= 10 && !!ctx.flag('a1_dream_door_woman');
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
): { code: string; reason: string } | null {
  const def = goddessDef(ctx.content, d.goddessId);
  const s = ctx.world.slices.goddess.goddesses[d.goddessId];
  if (!def || !s) return { code: 'no_goddess', reason: '没有这位司掌者' };
  if (!toolsActive(ctx, def, s)) return { code: 'inactive', reason: '她此刻无法向箱庭伸手' };
  if (!def.menu.includes(d.action)) return { code: 'not_on_menu', reason: '这不在她的神权之内' };
  const a = actionDef(ctx.content, d.action);
  if (!a) return { code: 'no_action', reason: '没有这种神权动作' };
  const idx = actIndex(currentAct(ctx));
  if (idx < a.minAct) return { code: 'too_early', reason: '这一幕还轮不到这种干预' };
  if (source.type === 'ai' && d.revision !== s.revision) {
    return { code: 'stale', reason: '局势已经变了，请重新观察后再提议' };
  }
  if (d.goddessId === 'janu' && !januStageOk(ctx)) {
    return { code: 'sealed', reason: '封印还太紧，她够不着' };
  }
  const p = d.params ?? {};
  const mapId =
    p.mapId ?? (d.goddessId === 'janu' ? playerMap(ctx.world) : strongestMap(s, ctx.content));
  if (!mapById(ctx.content, mapId)) return { code: 'no_map', reason: '那片土地不在箱庭里' };
  if (d.goddessId !== 'janu' && d.action !== 'request' && reach(s, mapId) < 0.05) {
    return { code: 'out_of_reach', reason: '那里没有足够的信徒，她看不清也够不着' };
  }
  const breach = !!d.breach;
  if (breach) {
    if (!a.breachable) return { code: 'not_breachable', reason: '这个动作不存在越约的做法' };
    if (s.breachActs.includes(currentAct(ctx))) {
      return { code: 'breach_used', reason: '本幕已经越约过一次，神约不容第二次' };
    }
  }
  const cost = actionCost(a, breach);
  if (s.power < cost) return { code: 'no_power', reason: `神力不足（需要 ${cost}）` };
  if ((s.cooldowns[a.id] ?? 0) > ctx.tick) return { code: 'cooldown', reason: '这项神权还在冷却' };
  if (a.hostile && mapId === playerMap(ctx.world)) {
    const used = s.hostility[currentAct(ctx)] ?? 0;
    if (used >= ctx.world.slices.goddess.hostilityBudget) {
      return { code: 'hostility_budget', reason: '本幕对那个人的敌对已经用尽了份额' };
    }
  }
  if (a.id === 'dream' && !isNight(calendarAt(ctx.tick))) {
    return { code: 'not_night', reason: '托梦只能在夜里' };
  }
  if (a.id === 'blessing') {
    const token = p.item ?? TOKENS[d.goddessId];
    if (!token || countItem(ctx.world, ctx.world.slices.world.playerId, token) <= 0) {
      return { code: 'no_token', reason: '那个人身上没有她的信物，加护无处可附' };
    }
  }
  if ((a.id === 'oracle' || a.id === 'dream' || a.id === 'omen') && !p.text?.trim()) {
    return { code: 'no_text', reason: '神谕需要内容' };
  }
  if (a.id === 'request' && !(p.key && /^[a-z0-9_]{1,32}$/.test(p.key))) {
    return { code: 'bad_key', reason: '请托需要一个小写英文键' };
  }
  if (p.flag && !p.flag.startsWith(`oracle.${d.goddessId}.`)) {
    return { code: 'bad_flag', reason: `神谕只能写 oracle.${d.goddessId}. 开头的标记` };
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
  const mapId =
    p.mapId ?? (d.goddessId === 'janu' ? playerMap(ctx.world) : strongestMap(s, ctx.content));
  const breach = !!d.breach;
  const cost = actionCost(a, breach);
  const playerId = ctx.world.slices.world.playerId;
  let note = a.label;
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
        note: `${def.name}：${a.label}`,
      });
    }
  };

  switch (a.id) {
    case 'oracle': {
      const target = p.targetId ? ctx.world.slices.world.entities[p.targetId] : undefined;
      line(ctx, def, p.text as string, target?.id);
      if (p.flag) ctx.setFlag(p.flag, p.value ?? true);
      note = target ? `向${target.name}降下神谕` : '降下神谕';
      break;
    }
    case 'dream': {
      line(ctx, def, p.text as string, playerId);
      note = '入梦';
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
      note = '借兽示警';
      break;
    }
    case 'blessing': {
      addMods(days(p, 7, 3) * TICKS_PER_GAME_DAY);
      note = '附物加护';
      break;
    }
    case 'miracle': {
      addMods(days(p, 7, 3) * TICKS_PER_GAME_DAY);
      ctx.emit('dialogue.line', {
        speakerId: 'narrator',
        speakerName: '',
        text: `${mapById(ctx.content, mapId)?.name ?? ''}上空落下一道光，有人说那是神迹。`,
        kind: 'narrate',
      });
      note = '小神迹';
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
        note: `${def.name}：物价波动`,
      });
      note = `物价波动（${p.goods ?? '全部'} ${Math.round(factor * 100)}%）`;
      break;
    }
    case 'request': {
      ctx.setFlag(
        `request.${def.id}.${p.key}`,
        sanitizeText(p.text ?? p.key ?? '', ctx.world, ctx.content),
      );
      note = '任务请托';
      break;
    }
    default:
      return reject('no_action', '没有这种神权动作');
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
    note: `${def.name}${note}`,
  });
  if (breach) {
    s.breachActs.push(act);
    const trace = `${mapById(ctx.content, mapId)?.name ?? mapId}留下一道带着${def.name}气息的蚀痕`;
    ctx.world.slices.goddess.breaches.push({
      id: ctx.newId('breach'),
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
