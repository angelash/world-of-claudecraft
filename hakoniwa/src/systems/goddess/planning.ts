// The daily planning round (goddess_gm.md 6.1, 13): one goddess.plan AI request per
// goddess per game day, carrying only what she can see, and a deterministic fallback
// chosen by utility (personality weight + small jitter - cost and sediment). Also the
// prompt builder shared by wake-ups (honorific, revelation) and the leak tests.

import type { AiContextV1, AnyCommand } from '../../core';
import type { SystemContext } from '../../core/system';
import { calendarAt } from '../../core/time';
import { actIndex, evaluate, flagResolver } from '../quests/conditions';
import { knowledgeFor } from '../quests/lore';
import { entitiesOnMap, mapById } from '../world';
import {
  actionCost,
  actionDef,
  currentAct,
  displayName,
  type GoddessActCommand,
  reach,
  strongestMap,
  toolsActive,
  validateAct,
} from './actions';
import { goddessDef } from './state';
import type { DivineActionDef, GoddessDef, GoddessState } from './types';

const SRC = { type: 'system', system: 'goddess' } as const;

export const PLAN_DEADLINE_TICKS = 600;

const SEASONS = ['春', '夏', '秋', '冬'];

function gazeBand(g: number): string {
  if (g >= 80) return '你正盯紧着那个人';
  if (g >= 50) return '你在关注那个人';
  if (g >= 20) return '你对那个人有些印象';
  return '你对那个人几乎一无所知，只当传闻';
}

function relationBand(r: number): string {
  if (r >= 50) return '亲近';
  if (r >= 15) return '有好感';
  if (r > -15) return '平淡';
  if (r > -50) return '不快';
  return '敌视';
}

/** Command descriptions for the model (only her menu). */
function commandHelp(def: GoddessDef, actions: DivineActionDef[]): Record<string, string> {
  const menu = actions
    .filter((a) => def.menu.includes(a.id))
    .map((a) => `${a.id}（${a.label}，神力 ${a.power}，冷却 ${a.cooldownHours} 小时）：${a.params}`)
    .join('；');
  return {
    'goddess.act': `数据 {goddessId:'${def.id}', action, revision, params, breach?}。revision 必须等于题面里的 revision。可用动作：${menu}。breach 为 true 表示越约（神力翻倍，每幕至多一次，会留下蚀痕）。`,
    'goddess.say': `数据 {goddessId:'${def.id}', text, revision}：以你的口吻说一句话。`,
  };
}

/**
 * The perception projection of one goddess (AiContextV1). Everything here is filtered
 * by the reveal ledger: knowledge comes from her per-act card and unlocked lore only;
 * private goals with an unlock condition appear only once it holds.
 */
export function goddessContext(
  ctx: SystemContext,
  def: GoddessDef,
  s: GoddessState,
  situation: string,
  extra?: Record<string, unknown>,
): AiContextV1 {
  const act = currentAct(ctx);
  const resolve = flagResolver(ctx.world.meta.flags);
  const goals = [
    `公开目标：${def.publicGoal}`,
    ...def.privateGoals
      .filter((g) => !g.when || evaluate(g.when, resolve))
      .map((g) => `私密目标：${g.text}`),
  ];
  const knowledge = [
    ...(def.knowledgeByAct[act] ?? []),
    ...knowledgeFor(ctx.world, ctx.content, 'K5', def.id),
  ];
  const memory = [
    ...s.memoryTags.map((t) => `你记得那个人是个「${t}」`),
    ...ctx.world.slices.goddess.ledger
      .filter((e) => e.goddess === def.id)
      .slice(-5)
      .map((e) => e.note),
  ];
  return {
    v: 1,
    // Before her name is spoken Janu is only 门口的女人, even in her own prompt.
    persona:
      displayName(ctx, def) === def.name
        ? `${def.title}${def.name}。`
        : `${displayName(ctx, def)}。`,
    situation,
    knowledge,
    memory,
    goals,
    commands: commandHelp(def, ctx.content.divineActions),
    speakAs: displayName(ctx, def),
    voice: [
      ...def.voice,
      ...def.mustKeep.map((m) => `必须：${m}`),
      ...def.never.map((m) => `绝不：${m}`),
    ],
    extra: { revision: s.revision, act, ...extra },
  };
}

/** What she can see today, in words (no player position unless her gaze is high). */
export function planSituation(ctx: SystemContext, _def: GoddessDef, s: GoddessState): string {
  const cal = calendarAt(ctx.tick);
  const parts = [
    `圣历 ${cal.year} 年${SEASONS[cal.season] ?? ''}第 ${cal.day} 日。`,
    `你的神力 ${Math.round(s.power)}。`,
    `${gazeBand(s.gaze)}；你对那个人的态度：${relationBand(s.relation)}。`,
  ];
  const lands = Object.keys(s.faith)
    .sort()
    .filter((m) => (s.faith[m] ?? 0) >= 0.1)
    .map((m) => {
      const map = mapById(ctx.content, m);
      const sed = ctx.world.slices.goddess.sediment[m] ?? 0;
      return `${map?.name ?? m}（信仰 ${Math.round((s.faith[m] ?? 0) * 100)}%，澱 ${Math.round(sed)}）`;
    });
  if (lands.length) parts.push(`你看得见的土地：${lands.join('，')}。`);
  return parts.join('');
}

function pickText(ctx: SystemContext, a: DivineActionDef, goddess: string): string | undefined {
  const lines = a.lines?.[goddess];
  if (!lines || lines.length === 0) return undefined;
  return ctx.rng('goddess.plan').pick(lines);
}

/** Candidate commands for the no-model planner, scored; the best positive one wins. */
export function fallbackPlan(
  ctx: SystemContext,
  def: GoddessDef,
  s: GoddessState,
): GoddessActCommand | null {
  const rng = ctx.rng('goddess.plan');
  const mapId =
    def.reach === 'player'
      ? (ctx.world.slices.world.entities[ctx.world.slices.world.playerId]?.mapId ?? '')
      : strongestMap(s, ctx.content);
  let best: { cmd: GoddessActCommand; u: number } | null = null;
  for (const id of def.menu) {
    const a = actionDef(ctx.content, id);
    if (!a) continue;
    const params: GoddessActCommand['params'] = { mapId };
    if (a.id === 'oracle' || a.id === 'dream' || a.id === 'omen') {
      const text = pickText(ctx, a, def.id);
      if (!text) continue;
      params.text = text;
      if (a.id === 'oracle') {
        const target = entitiesOnMap(ctx.world, mapId)
          .filter((e) => e.alive && !e.hidden && e.tags.some((t) => def.faithTags.includes(t)))
          .sort((x, y) => x.id.localeCompare(y.id))[0];
        if (target) params.targetId = target.id;
      }
    } else if (a.id === 'request') {
      const raw = pickText(ctx, a, def.id);
      if (!raw) continue;
      const [key, text] = raw.split('|');
      params.key = key;
      params.text = text ?? key;
    } else if (a.id === 'price') {
      params.factor = rng.chance(0.5) ? 1.15 : 0.9;
      params.goods = '*';
    }
    const cmd: GoddessActCommand = {
      goddessId: def.id,
      action: a.id,
      revision: s.revision,
      params,
    };
    if (validateAct(ctx, cmd, SRC)) continue;
    const cost = actionCost(a, false);
    const u =
      (def.weights[a.id] ?? 0) +
      rng.range(0, 1) -
      (cost / Math.max(1, s.power)) * 20 -
      a.sedimentRate * 10;
    if (!best || u > best.u) best = { cmd, u };
  }
  return best && best.u >= 4 ? best.cmd : null;
}

/** File today's planning request for every active goddess. */
export function dailyPlans(ctx: SystemContext): void {
  const idx = actIndex(currentAct(ctx));
  if (Number.isNaN(idx) || idx < 1 || idx > 5) return;
  for (const def of [...ctx.content.goddesses].sort((a, b) => a.id.localeCompare(b.id))) {
    const s = ctx.world.slices.goddess.goddesses[def.id];
    if (!s || !toolsActive(ctx, def, s)) continue;
    if (def.appearsWhen && !evaluate(def.appearsWhen, flagResolver(ctx.world.meta.flags))) continue;
    const cmd = fallbackPlan(ctx, def, s);
    const fallback: AnyCommand[] = cmd ? [{ kind: 'goddess.act', data: cmd, source: SRC }] : [];
    ctx.ai.request({
      agentId: def.id,
      role: 'goddess.plan',
      purpose: 'daily_plan',
      revision: s.revision,
      context: goddessContext(ctx, def, s, planSituation(ctx, def, s)),
      allowed: ['goddess.act', 'goddess.say'],
      fallback,
      deadlineTicks: PLAN_DEADLINE_TICKS,
      priority: 1,
    });
  }
}

/** Faith share helper used by the view. */
export function faithIn(s: GoddessState, mapId: string): number {
  return reach(s, mapId);
}

export { goddessDef };
