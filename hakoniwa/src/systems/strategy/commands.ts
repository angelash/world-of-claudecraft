// Strategy command handlers. The player acts as the nation 'player' (after founding);
// AI rulers act only through slg.ruler_policy proposals and their fallbacks.

import { type CommandResult, ok, reject } from '../../core';
import type { CommandMap, CommandSource } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { kernelData } from '../warfare/data';
import { executeIntent } from './ai';
import { startConclave } from './conclave';
import { performDiplomacy } from './diplomacy';
import { findRoute, provinceDef } from './map';
import { addRegiments } from './military';
import { COPPER_PER_GOLD } from './nations';
import { foundPlayerNation } from './setup';
import { log, PLAYER, strat } from './state';

export const FOUNDING_AUTONOMY = 40;

function isPlayer(source: CommandSource): boolean {
  return source.type === 'player';
}

export function diplomacy(
  ctx: SystemContext,
  d: CommandMap['slg.diplomacy'],
  source: CommandSource,
): CommandResult {
  const s = strat(ctx);
  const from = d.from ?? PLAYER;
  if (isPlayer(source) && from !== PLAYER) return reject('not_yours', '你只能代表自己的国家交涉');
  if (from === PLAYER && !s.nations[PLAYER]) return reject('no_nation', '你还没有建立国家');
  if (!s.active && from !== PLAYER) return reject('dormant', '大陆棋局尚未展开');
  if (d.revision !== undefined && s.nations[from] && d.revision !== s.nations[from]?.revision) {
    return reject('stale', '局势已变，提议过时');
  }
  return performDiplomacy(ctx, from, d.to, d.action, d.treaty);
}

export function moveArmy(
  ctx: SystemContext,
  d: CommandMap['slg.move_army'],
  source: CommandSource,
): CommandResult {
  const s = strat(ctx);
  if (!s.active) return reject('dormant', '大陆棋局尚未展开');
  const a = s.armies[d.armyId];
  if (!a) return reject('no_army', '没有这支军队');
  if (isPlayer(source) && a.owner !== PLAYER) return reject('not_yours', '这支军队不归你指挥');
  if (a.frozen) return reject('engaged', '这支军队正在会战');
  if (!provinceDef(ctx.content, d.to)) return reject('no_province', '没有这个地方');
  const route = findRoute(ctx.content, s, a.owner, a.province, d.to);
  if (!route) return reject('no_path', '没有可走的路线（需要通行权或交战状态）');
  a.path = route;
  a.progress = 0;
  return ok(
    route.length === 0
      ? '军队已在当地'
      : `行军路线：${route.map((p) => provinceDef(ctx.content, p)?.name ?? p).join('、')}`,
  );
}

export function recruit(
  ctx: SystemContext,
  d: CommandMap['slg.recruit'],
  source: CommandSource,
): CommandResult {
  const s = strat(ctx);
  const nationId = d.nationId ?? PLAYER;
  if (isPlayer(source) && nationId !== PLAYER) return reject('not_yours', '你只能为自己的国家征兵');
  const n = s.nations[nationId];
  if (!n?.alive) return reject('no_nation', '你还没有建立国家');
  if (s.provinces[d.provinceId]?.owner !== nationId)
    return reject('not_owned', '只能在自己的领土上征兵');
  const def =
    nationId === PLAYER
      ? ctx.content.slg_config?.playerNation
      : ctx.content.slg_nations?.find((x) => x.id === nationId);
  if (!def?.recruits.includes(d.typeId)) return reject('bad_unit', '这里招不到这种兵');
  const count = Math.floor(d.count);
  if (count <= 0 || count > 5000) return reject('bad_count', '人数不对');
  const prov = s.provinces[d.provinceId];
  if (prov && count > prov.population * 0.05) return reject('no_people', '这里没有那么多可征的人');
  const unit = kernelData(ctx.content.regiment_types ?? []).units.get(d.typeId);
  const cost = ((unit?.cost ?? 100) * count) / COPPER_PER_GOLD;
  if (n.treasury < cost) return reject('no_funds', '国库不足');
  n.treasury -= cost;
  if (prov) prov.population -= count;
  const army = addRegiments(s, nationId, d.provinceId, [{ typeId: d.typeId, count }], '新编军');
  log(
    s,
    `${provinceDef(ctx.content, d.provinceId)?.name ?? d.provinceId}征募 ${count} 名${unit?.name ?? d.typeId}`,
  );
  return ok(`编入 ${army.name}`);
}

export function foundNation(ctx: SystemContext, d: CommandMap['slg.found_nation']): CommandResult {
  const s = strat(ctx);
  if (s.nations[PLAYER] || ctx.flag('a4_nation_founded')) return reject('already', '你已经立国');
  if (!ctx.flag('feature.slg')) return reject('locked', '立国之门尚未显现');
  const autonomy = Number(ctx.flag('territory_autonomy') ?? 0);
  if (!(autonomy >= FOUNDING_AUTONOMY)) {
    return reject('autonomy', `领地自治度不足 ${FOUNDING_AUTONOMY}，界石堆起来了，门却没有开`);
  }
  const provinces = foundPlayerNation(ctx, d.name);
  ctx.setFlag('a4_nation_founded', true);
  ctx.emit('slg.nation_founded', { nationId: PLAYER, name: s.playerNationName ?? '', provinces });
  return ok(`${s.playerNationName}立国`);
}

export function convene(ctx: SystemContext, source: CommandSource): CommandResult {
  const s = strat(ctx);
  if (ctx.flag('a4_conclave_done') || s.summit) return reject('done', '七国会盟已经开过');
  if (s.conference) return reject('ongoing', '会盟正在进行');
  if (isPlayer(source) && !ctx.flag('feature.slg')) return reject('locked', '大陆棋局尚未展开');
  startConclave(ctx);
  return ok('会盟邀请已经送出');
}

export function rulerPolicy(
  ctx: SystemContext,
  d: CommandMap['slg.ruler_policy'],
  source: CommandSource,
): CommandResult {
  if (isPlayer(source)) return reject('not_yours', '这是 AI 统治者的决策通道');
  return executeIntent(ctx, d.nationId, d.intent, d.target, d.revision);
}

export function setBattleMode(
  ctx: SystemContext,
  d: CommandMap['slg.set_battle_mode'],
): CommandResult {
  if (d.mode !== 'auto' && d.mode !== 'manual') return reject('bad_mode', '只有自动与手动两种');
  strat(ctx).battleMode = d.mode;
  return ok(d.mode === 'manual' ? '你的会战将由你亲自指挥' : '你的会战将交给将领');
}
