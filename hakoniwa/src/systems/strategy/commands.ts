// Strategy command handlers. The player acts as the nation 'player' (after founding);
// AI rulers act only through slg.ruler_policy proposals and their fallbacks.

import { type CommandResult, ok, reject } from '../../core';
import { contentText } from '../../core/content_key';
import type { CommandMap, CommandSource } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { joinText, tr } from '../../core/text';
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
  if (isPlayer(source) && from !== PLAYER)
    return reject('not_yours', tr('sys.strategy.reject.not_yours.diplomacy'));
  if (from === PLAYER && !s.nations[PLAYER])
    return reject('no_nation', tr('sys.strategy.reject.no_nation.player'));
  if (!s.active && from !== PLAYER) return reject('dormant', tr('sys.strategy.reject.dormant'));
  if (d.revision !== undefined && s.nations[from] && d.revision !== s.nations[from]?.revision) {
    return reject('stale', tr('sys.strategy.reject.stale'));
  }
  return performDiplomacy(ctx, from, d.to, d.action, d.treaty);
}

export function moveArmy(
  ctx: SystemContext,
  d: CommandMap['slg.move_army'],
  source: CommandSource,
): CommandResult {
  const s = strat(ctx);
  if (!s.active) return reject('dormant', tr('sys.strategy.reject.dormant'));
  const a = s.armies[d.armyId];
  if (!a) return reject('no_army', tr('sys.strategy.reject.no_army'));
  if (isPlayer(source) && a.owner !== PLAYER)
    return reject('not_yours', tr('sys.strategy.reject.not_yours.army'));
  if (a.frozen) return reject('engaged', tr('sys.strategy.reject.engaged'));
  if (!provinceDef(ctx.content, d.to))
    return reject('no_province', tr('sys.strategy.reject.no_province'));
  const route = findRoute(ctx.content, s, a.owner, a.province, d.to);
  if (!route) return reject('no_path', tr('sys.strategy.reject.no_path'));
  a.path = route;
  a.progress = 0;
  return ok(
    route.length === 0
      ? tr('sys.strategy.info.army_in_place')
      : tr('sys.strategy.info.route', {
          route: joinText(
            'list',
            route.map((p) => contentText('slg_provinces', provinceDef(ctx.content, p), p)),
          ),
        }),
  );
}

export function recruit(
  ctx: SystemContext,
  d: CommandMap['slg.recruit'],
  source: CommandSource,
): CommandResult {
  const s = strat(ctx);
  const nationId = d.nationId ?? PLAYER;
  if (isPlayer(source) && nationId !== PLAYER)
    return reject('not_yours', tr('sys.strategy.reject.not_yours.recruit'));
  const n = s.nations[nationId];
  if (!n?.alive) return reject('no_nation', tr('sys.strategy.reject.no_nation.player'));
  if (s.provinces[d.provinceId]?.owner !== nationId)
    return reject('not_owned', tr('sys.strategy.reject.not_owned'));
  const def =
    nationId === PLAYER
      ? ctx.content.slg_config?.playerNation
      : ctx.content.slg_nations?.find((x) => x.id === nationId);
  if (!def?.recruits.includes(d.typeId))
    return reject('bad_unit', tr('sys.strategy.reject.bad_unit'));
  const count = Math.floor(d.count);
  if (count <= 0 || count > 5000) return reject('bad_count', tr('sys.strategy.reject.bad_count'));
  const prov = s.provinces[d.provinceId];
  if (prov && count > prov.population * 0.05)
    return reject('no_people', tr('sys.strategy.reject.no_people'));
  const unit = kernelData(ctx.content.regiment_types ?? []).units.get(d.typeId);
  const cost = ((unit?.cost ?? 100) * count) / COPPER_PER_GOLD;
  if (n.treasury < cost) return reject('no_funds', tr('sys.strategy.reject.no_funds.recruit'));
  n.treasury -= cost;
  if (prov) prov.population -= count;
  const army = addRegiments(
    s,
    nationId,
    d.provinceId,
    [{ typeId: d.typeId, count }],
    tr('sys.strategy.army.new'),
  );
  log(
    s,
    tr('sys.strategy.log.recruited', {
      province: contentText('slg_provinces', provinceDef(ctx.content, d.provinceId), d.provinceId),
      count,
      unit: contentText('regiment_types', unit, d.typeId),
    }),
  );
  return ok(tr('sys.strategy.info.enlisted', { army: army.name }));
}

export function foundNation(ctx: SystemContext, d: CommandMap['slg.found_nation']): CommandResult {
  const s = strat(ctx);
  if (s.nations[PLAYER] || ctx.flag('a4_nation_founded'))
    return reject('already', tr('sys.strategy.reject.already.nation'));
  if (!ctx.flag('feature.slg')) return reject('locked', tr('sys.strategy.reject.locked.founding'));
  const autonomy = Number(ctx.flag('territory_autonomy') ?? 0);
  if (!(autonomy >= FOUNDING_AUTONOMY)) {
    return reject('autonomy', tr('sys.strategy.reject.autonomy', { need: FOUNDING_AUTONOMY }));
  }
  const provinces = foundPlayerNation(ctx, d.name);
  ctx.setFlag('a4_nation_founded', true);
  ctx.emit('slg.nation_founded', { nationId: PLAYER, name: s.playerNationName ?? '', provinces });
  // String() keeps the old text when no name was set ('null')
  return ok(tr('sys.strategy.info.founded', { nation: String(s.playerNationName) }));
}

export function convene(ctx: SystemContext, source: CommandSource): CommandResult {
  const s = strat(ctx);
  if (ctx.flag('a4_conclave_done') || s.summit)
    return reject('done', tr('sys.strategy.reject.done'));
  if (s.conference) return reject('ongoing', tr('sys.strategy.reject.ongoing'));
  if (isPlayer(source) && !ctx.flag('feature.slg'))
    return reject('locked', tr('sys.strategy.reject.dormant'));
  startConclave(ctx);
  return ok(tr('sys.strategy.info.convened'));
}

export function rulerPolicy(
  ctx: SystemContext,
  d: CommandMap['slg.ruler_policy'],
  source: CommandSource,
): CommandResult {
  if (isPlayer(source)) return reject('not_yours', tr('sys.strategy.reject.not_yours.ai_channel'));
  return executeIntent(ctx, d.nationId, d.intent, d.target, d.revision);
}

export function setBattleMode(
  ctx: SystemContext,
  d: CommandMap['slg.set_battle_mode'],
): CommandResult {
  if (d.mode !== 'auto' && d.mode !== 'manual')
    return reject('bad_mode', tr('sys.strategy.reject.bad_mode'));
  strat(ctx).battleMode = d.mode;
  return ok(
    d.mode === 'manual' ? tr('sys.strategy.info.mode_manual') : tr('sys.strategy.info.mode_auto'),
  );
}
