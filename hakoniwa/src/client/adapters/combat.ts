// Combat-side adapters: unit frames (combat unit views, strength readings, appraisal and
// felt pressure), the hotbar from the ability bar, Tab targeting, movement locks,
// animation cues and floating combat text. Pure functions of GameView plus the combat,
// npc and cognition queries.

import type { AnyWorldEvent } from '../../core/contracts';
import { hasText, t, tOr } from '../../shared_ui/i18n';
import { appraisalLog, lastAppraisal, pressureSense } from '../../systems/cognition';
import {
  abilityBar,
  canMove,
  enemiesNear,
  isHostile,
  strengthReading,
  targetInfo,
  unitOf,
  unitView,
  xpProgress,
} from '../../systems/combat';
import { npcIdOfEntity, npcView } from '../../systems/npc';
import type {
  AnimCue,
  AppraiseAdapter,
  CharacterAdapter,
  CharacterSheetView,
  CombatAdapter,
  Commands,
  FloatingTextView,
  HotbarSlotView,
  UnitFrameAdapter,
  UnitFrameData,
} from '../view/adapters';
import { contentNames } from '../view/content_names';
import type { GameView } from '../view/game_view';

const RESOURCE_COLORS: Record<string, string> = {
  mana: '#4a7ee0',
  rage: '#d04a3a',
  energy: '#e0c84a',
};

/** Global cooldown span used for the sweep when only the GCD runs (seconds). */
export const GCD_SPAN = 1.5;

export const HOTBAR_SLOTS = 9;

function readingText(r: ReturnType<typeof strengthReading>): string {
  return t(`ui.hud.target.reading.${r}`);
}

export function unitFrameData(
  view: GameView,
  entityId: string,
  viewerId: string,
): UnitFrameData | null {
  const w = view.world as never;
  const c = view.content as never;
  const e = view.entity(entityId);
  if (!e) return null;
  const u = unitView(w, c, entityId);
  const data: UnitFrameData = {};
  const self = entityId === viewerId;
  if (u) {
    data.hp = { value: u.hp, max: u.maxHp };
    data.resources = u.resources
      .filter((r) => r.max > 0)
      .map((r) => ({
        kind: r.kind,
        label: t(r.name),
        value: r.cur,
        max: r.max,
        color: RESOURCE_COLORS[r.kind],
      }));
    data.auras = u.auras.map((a) => ({
      id: a.id,
      name: contentNames.aura(a.id, a.name),
      harmful: a.kind === 'debuff',
      remaining: a.remaining,
      stacks: a.stacks,
    }));
    data.cast = u.cast ? { name: u.cast.name, progress: u.cast.progress } : null;
    data.dead = !u.alive;
    if (self) {
      data.level = u.level;
      data.subtitle = t(u.tierName);
      const xp = xpProgress(w, entityId);
      data.xp = { value: xp.xp, max: xp.next };
    } else {
      const info = targetInfo(w, c, viewerId);
      const reading = strengthReading(w, viewerId, entityId);
      data.levelText =
        info && info.unit.id === entityId && info.levelText !== '?'
          ? t(info.levelText)
          : readingText(reading);
      data.hostile = isHostile(w, viewerId, entityId);
    }
  }
  if (!self) {
    const npcId = npcIdOfEntity(w, entityId);
    const npc = npcId ? npcView(w, c, npcId) : undefined;
    if (npc) {
      data.subtitle = [npc.job, t(npc.activityName)].filter(Boolean).join('  ');
      if (!u) data.levelText = t('ui.hud.target.relation', { band: t(npc.relationBand) });
    }
    const p = pressureSense(w, c, viewerId, entityId);
    if (p && p.band !== 'none' && p.text) data.pressure = t(p.text);
    const a = lastAppraisal(w);
    const mine = appraisalLog(w)
      .filter((r) => r.observerId === viewerId && r.targetId === entityId)
      .pop();
    const shown =
      mine ?? (a && a.observerId === viewerId && a.targetId === entityId ? a : undefined);
    if (shown) data.appraisal = t(shown.display);
  }
  return data;
}

export function hotbarSlots(view: GameView): HotbarSlotView[] {
  const w = view.world as never;
  const c = view.content as never;
  const bar = abilityBar(w, c);
  const me = unitView(w, c, view.playerId());
  const resName = new Map((me?.resources ?? []).map((r) => [r.kind, t(r.name)]));
  return bar.slice(0, HOTBAR_SLOTS).map((a, i) => {
    const cd = Math.max(a.cooldownLeft, a.gcdLeft);
    const total =
      a.cooldownLeft > 0 ? Math.max(a.cooldown, a.cooldownLeft) : a.gcdLeft > 0 ? GCD_SPAN : 0;
    return {
      slot: i + 1,
      abilityId: a.id,
      name: contentNames.ability(a.id, a.name),
      desc: contentNames.abilityDesc(a.id, a.desc),
      cooldown: cd,
      cooldownTotal: total,
      usable: a.usable,
      reason: a.reason === undefined ? undefined : t(a.reason),
      cost:
        a.resource && a.cost > 0 ? `${a.cost} ${resName.get(a.resource) ?? ''}`.trim() : undefined,
    };
  });
}

export function damageText(outcome: string, amount: number): string {
  const label = hasText(`ui.ovl.fct.outcome.${outcome}`)
    ? t(`ui.ovl.fct.outcome.${outcome}`)
    : undefined;
  if (label) return amount > 0 ? `${label} ${amount}` : label;
  return String(amount);
}

/** Floating texts for the player and the player's side. */
export function floatingFor(view: GameView, ev: AnyWorldEvent): FloatingTextView[] {
  const me = view.playerId();
  switch (ev.kind) {
    case 'combat.damage': {
      const d = ev.data;
      if (d.sourceId !== me && d.targetId !== me) return [];
      const kind =
        d.targetId === me
          ? 'damage_taken'
          : d.outcome === 'crit'
            ? 'crit'
            : d.amount > 0
              ? 'damage'
              : 'miss';
      const text =
        d.outcome === 'hit' || (d.outcome === 'crit' && d.amount > 0)
          ? d.outcome === 'crit'
            ? t('ui.ovl.fct.crit', { n: d.amount })
            : String(d.amount)
          : damageText(d.outcome, d.amount);
      return [{ entityId: d.targetId, text, kind }];
    }
    case 'combat.heal': {
      const d = ev.data;
      if (d.targetId !== me && d.sourceId !== me) return [];
      if (d.amount <= 0) return [];
      return [{ entityId: d.targetId, text: `+${d.amount}`, kind: 'heal' }];
    }
    case 'combat.xp':
      return ev.data.entityId === me && ev.data.amount > 0
        ? [{ entityId: me, text: t('ui.ovl.fct.xp', { n: ev.data.amount }), kind: 'xp' }]
        : [];
    case 'combat.level_up':
      return ev.data.entityId === me
        ? [{ entityId: me, text: t('ui.ovl.fct.level_up'), kind: 'level' }]
        : [];
    case 'combat.evade':
      return [{ entityId: ev.data.entityId, text: t('ui.ovl.fct.evade'), kind: 'miss' }];
    default:
      return [];
  }
}

export function animationCuesFor(ev: AnyWorldEvent): AnimCue[] {
  switch (ev.kind) {
    case 'combat.damage': {
      const out: AnimCue[] = [];
      if (!ev.data.abilityId) out.push({ entityId: ev.data.sourceId, anim: 'attack' });
      if (ev.data.amount > 0) out.push({ entityId: ev.data.targetId, anim: 'hit' });
      return out;
    }
    case 'combat.cast':
      return ev.data.op === 'finish' ? [{ entityId: ev.data.casterId, anim: 'attack' }] : [];
    default:
      return [];
  }
}

export function createCombatAdapter(): CombatAdapter {
  let tabCursor: string | null = null;
  return {
    hotbar: hotbarSlots,
    activateSlot(view, slot, targetId) {
      const s = hotbarSlots(view).find((x) => x.slot === slot);
      if (!s?.abilityId) return t('ui.hud.hotbar.empty_slot');
      // Pressing during a cooldown is routine: no message, the sweep already shows it.
      if (!s.usable && s.cooldown > 0) return [];
      if (!s.usable && s.reason) return s.reason;
      const cmds: Commands = [
        { kind: 'combat.cast', data: { abilityId: s.abilityId, targetId: targetId ?? undefined } },
      ];
      return cmds;
    },
    selectTarget(view, targetId) {
      const w = view.world as never;
      if (targetId && unitOf(w, targetId)) return [{ kind: 'combat.target', data: { targetId } }];
      const me = unitOf(w, view.playerId());
      return me?.target ? [{ kind: 'combat.target', data: { targetId: null } }] : [];
    },
    nextEnemy(view, current) {
      const list = enemiesNear(view.world as never, 20);
      if (list.length === 0) return null;
      const from = current ?? tabCursor;
      const i = from ? list.indexOf(from) : -1;
      tabCursor = list[(i + 1) % list.length] ?? null;
      return tabCursor;
    },
    canMove: (view) => canMove(view.world as never, view.content as never),
    animationCues: (_view, ev) => animationCuesFor(ev),
    floatingText: floatingFor,
    isHostile: (view, id) => isHostile(view.world as never, view.playerId(), id),
  };
}

export function createUnitFrameAdapter(): UnitFrameAdapter {
  return { unitFrame: unitFrameData };
}

export function createAppraiseAdapter(): AppraiseAdapter {
  return {
    appraise: (view, targetId) => [
      { kind: 'cognition.appraise', data: { observerId: view.playerId(), targetId } },
    ],
    last(view, targetId) {
      return appraisalLog(view.world as never)
        .filter((r) => r.observerId === view.playerId() && r.targetId === targetId)
        .pop();
    },
    pressure: (view, targetId) =>
      pressureSense(view.world as never, view.content as never, view.playerId(), targetId),
  };
}

export function characterSheet(view: GameView): CharacterSheetView | null {
  const w = view.world as never;
  const c = view.content as never;
  const id = view.playerId();
  const e = view.entity(id);
  const u = unitView(w, c, id);
  if (!e) return null;
  const unit = unitOf(w, id);
  const cls = unit?.classId
    ? (view.content as { classes?: { id: string; name: string }[] }).classes?.find(
        (x) => x.id === unit.classId,
      )
    : undefined;
  const xp = xpProgress(w, id);
  const bar = abilityBar(w, c);
  const stats: { label: string; value: string }[] = [];
  if (u) {
    stats.push({ label: t('ui.win.character.hp'), value: `${u.hp} / ${u.maxHp}` });
    for (const r of u.resources)
      if (r.max > 0) stats.push({ label: t(r.name), value: `${r.cur} / ${r.max}` });
    if (u.combo > 0) stats.push({ label: t('ui.win.character.combo'), value: String(u.combo) });
    stats.push({
      label: t('ui.win.character.in_combat'),
      value: u.inCombat ? t('ui.win.character.yes') : t('ui.win.character.no'),
    });
  }
  const totals = new Map<string, number>();
  const holding = view.holding(id);
  for (const itemId of Object.values(holding.equipped)) {
    const def = itemId ? view.itemDef(itemId) : undefined;
    for (const [k, v] of Object.entries(def?.stats ?? {})) totals.set(k, (totals.get(k) ?? 0) + v);
  }
  for (const [k, v] of totals) {
    stats.push({
      label: tOr(`ui.win.character.stat.${k}`, k),
      value: `+${v}`,
    });
  }
  return {
    name: e.name,
    className: cls ? contentNames.className(cls) : undefined,
    level: u?.level ?? xp.level,
    tierName: u ? t(u.tierName) : undefined,
    xp: { value: xp.xp, max: xp.next },
    hp: u ? { value: u.hp, max: u.maxHp } : undefined,
    resources: (u?.resources ?? [])
      .filter((r) => r.max > 0)
      .map((r) => ({
        kind: r.kind,
        label: t(r.name),
        value: r.cur,
        max: r.max,
        color: RESOURCE_COLORS[r.kind],
      })),
    stats,
    abilities: bar.map((a) => ({
      id: a.id,
      name: contentNames.ability(a.id, a.name),
      desc: contentNames.abilityDesc(a.id, a.desc),
      cost: a.resource && a.cost > 0 ? String(a.cost) : undefined,
      cooldown: a.cooldown > 0 ? t('ui.win.character.seconds', { n: a.cooldown }) : undefined,
    })),
  };
}

export function createCharacterAdapter(): CharacterAdapter {
  return { sheet: characterSheet };
}
