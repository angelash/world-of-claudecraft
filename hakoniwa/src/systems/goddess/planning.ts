// The daily planning round (goddess_gm.md 6.1, 13): one goddess.plan AI request per
// goddess per game day, carrying only what she can see, and a deterministic fallback
// chosen by utility (personality weight + small jitter - cost and sediment). Also the
// prompt builder shared by wake-ups (honorific, revelation) and the leak tests.

import type { AiContextV1, AnyCommand } from '../../core';
import type { SystemContext } from '../../core/system';
import { joinText, type KeyText, type TextParam, tr } from '../../core/text';
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
import { relationBandLabel } from './view';

const SRC = { type: 'system', system: 'goddess' } as const;

export const PLAN_DEADLINE_TICKS = 600;

function gazeBand(g: number): KeyText {
  if (g >= 80) return tr('sys.goddess.prompt.gaze.watching');
  if (g >= 50) return tr('sys.goddess.prompt.gaze.noticed');
  if (g >= 20) return tr('sys.goddess.prompt.gaze.aware');
  return tr('sys.goddess.prompt.gaze.unknown');
}

/** Command descriptions for the model (only her menu). */
function commandHelp(def: GoddessDef, actions: DivineActionDef[]): Record<string, TextParam> {
  const menu = joinText(
    'semicolon',
    actions
      .filter((a) => def.menu.includes(a.id))
      .map((a) =>
        tr('sys.goddess.prompt.menu_item', {
          id: a.id,
          label: a.label,
          power: a.power,
          cooldown: a.cooldownHours,
          params: a.params,
        }),
      ),
  );
  return {
    'goddess.act': tr('sys.goddess.prompt.command.act', { goddess: def.id, menu }),
    'goddess.say': tr('sys.goddess.prompt.command.say', { goddess: def.id }),
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
  situation: TextParam,
  extra?: Record<string, unknown>,
): AiContextV1 {
  const act = currentAct(ctx);
  const resolve = flagResolver(ctx.world.meta.flags);
  const goals: TextParam[] = [
    tr('sys.goddess.prompt.public_goal', { goal: def.publicGoal }),
    ...def.privateGoals
      .filter((g) => !g.when || evaluate(g.when, resolve))
      .map((g) => tr('sys.goddess.prompt.private_goal', { goal: g.text })),
  ];
  const knowledge = [
    ...(def.knowledgeByAct[act] ?? []),
    ...knowledgeFor(ctx.world, ctx.content, 'K5', def.id),
  ];
  const memory: TextParam[] = [
    ...s.memoryTags.map((t) => tr('sys.goddess.prompt.memory_tag', { tag: t })),
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
        ? tr('sys.goddess.prompt.persona.named', { title: def.title, name: def.name })
        : tr('sys.goddess.prompt.persona.hidden', { name: displayName(ctx, def) }),
    situation,
    knowledge,
    memory,
    goals,
    commands: commandHelp(def, ctx.content.divineActions),
    speakAs: displayName(ctx, def),
    voice: [
      ...def.voice,
      ...def.mustKeep.map((m) => tr('sys.goddess.prompt.must', { rule: m })),
      ...def.never.map((m) => tr('sys.goddess.prompt.never', { rule: m })),
    ],
    extra: { revision: s.revision, act, ...extra },
  };
}

/** What she can see today, in words (no player position unless her gaze is high). */
export function planSituation(ctx: SystemContext, _def: GoddessDef, s: GoddessState): KeyText {
  const parts: TextParam[] = [
    tr('sys.goddess.prompt.date', { tick: ctx.tick }),
    tr('sys.goddess.prompt.power', { power: Math.round(s.power) }),
    tr('sys.goddess.prompt.stance', {
      gaze: gazeBand(s.gaze),
      relation: relationBandLabel(s.relation),
    }),
  ];
  const lands = Object.keys(s.faith)
    .sort()
    .filter((m) => (s.faith[m] ?? 0) >= 0.1)
    .map((m) => {
      const map = mapById(ctx.content, m);
      const sed = ctx.world.slices.goddess.sediment[m] ?? 0;
      return tr('sys.goddess.prompt.land', {
        place: map?.name ?? m,
        faith: Math.round((s.faith[m] ?? 0) * 100),
        sediment: Math.round(sed),
      });
    });
  if (lands.length) parts.push(tr('sys.goddess.prompt.lands', { lands: joinText('comma', lands) }));
  return joinText('none', parts);
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
