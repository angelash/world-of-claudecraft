// Content checks of the boss mechanics library and the mechanic field registry
// (combat_and_classes.md 10, 11, 18, 20): ground-warning leads by tier and the damage a
// tier allows, at most three warning areas a cast and per phase, references of every
// library entry (adds, shields, terrain, marks, windows, resolutions, door seeking), the
// shapes of the registry fields, and the two-way cue coverage of the audio table. Pure.

import type { ContentMap } from '../../core/contracts';
import { HIT_AFFIXES, MECHANIC_KEYS } from '../../systems/combat/affixes';
import { scaled } from '../../systems/combat/defs';
import { ELITE_DMG, hpFromStamina, monsterBaseDamage } from '../../systems/combat/formulas';
import type { BossAction, TelegraphDef } from '../../systems/combat/mech_types';
import { MIN_FIRST_PULSE, MIN_LEAD, TELEGRAPH_CAP } from '../../systems/combat/telegraph';
import { areaCount } from '../../systems/combat/telegraph_shapes';
import type { AbilityDef, MonsterDef } from '../../systems/combat/types';
import { evaluate } from '../../systems/quests/conditions';

/** Members an `each_member` warning counts for (act 1 parties: the player and two). */
export const MEMBER_AREAS = 3;
/** Share of the standard gear budget (5.3: 4.8 points a level) that goes to stamina. */
const GEAR_STAMINA_SHARE = 1 / 3;
/** The tier a warning's design damage needs, as a share of a member's health (10.3). */
export const TIER_FLOOR: Readonly<Record<TelegraphDef['tier'], number>> = {
  lethal: 0.8,
  heavy: 0.4,
  normal: 0,
};
const TIER_RANK: Readonly<Record<TelegraphDef['tier'], number>> = {
  normal: 0,
  heavy: 1,
  lethal: 2,
};
const RESOLVE_WAYS: readonly string[] = [
  'yield',
  'purify',
  'pacify',
  'talk',
  'item',
  'interact',
  'survive',
  'escape',
  'flag',
];
const TERRAIN_ROLES: readonly string[] = ['breakable', 'interact', 'cover', 'hazard', 'switch'];
const BREAK_BY: readonly string[] = ['damage', 'adds', 'terrain', 'ability', 'timer'];

/**
 * The health of a standard-gear, non-tank party member at a level (10.3's yardstick): the
 * mean of the non-tank vocations' health (5.2) with a third of the standard gear budget
 * (5.3: 4.8 points a level) in stamina.
 */
export function standardMemberHp(content: ContentMap, level: number): number {
  const rows = (content.classes ?? []).filter((c) => c.role !== 'tank');
  if (rows.length === 0) return 1;
  let sum = 0;
  for (const c of rows) {
    const sta = c.base.sta + c.growth.sta * (level - 1) + 4.8 * level * GEAR_STAMINA_SHARE;
    sum += c.hp + c.hpPerLevel * (level - 1) + hpFromStamina(sta);
  }
  return sum / rows.length;
}

/** The damage one cast of an ability deals a target at the monster's top level (before armour). */
export function designDamage(ability: AbilityDef, mon: MonsterDef): number {
  const L = mon.maxLevel;
  const power = L * 3;
  const elite = mon.rank === 'elite' || mon.rank === 'rare' || mon.rank === 'boss';
  const swing =
    monsterBaseDamage(L) *
    (mon.dmgMult ?? 1) *
    (elite ? ELITE_DMG : 1) *
    ((mon.attackSpeed ?? 2) / 2);
  let out = 0;
  for (const f of ability.effects) {
    if (f.type !== 'damage') continue;
    out += scaled(f.amount, L, power) + (f.weapon ?? 0) * swing;
  }
  return out;
}

/** The tier a design damage needs (10.3: lethal from 80%, heavy from 40%). */
export function tierFor(damage: number, memberHp: number): TelegraphDef['tier'] {
  const share = damage / Math.max(1, memberHp);
  if (share >= TIER_FLOOR.lethal) return 'lethal';
  if (share >= TIER_FLOOR.heavy) return 'heavy';
  return 'normal';
}

/** Problems of one ability's warning: its lead by tier, its pulse delay, its area count. */
export function telegraphProblems(a: AbilityDef): string[] {
  const out: string[] = [];
  const tg = a.telegraph;
  if (!tg) return out;
  const lead = Math.max(a.castTime ?? 0, tg.lead);
  if (tg.shape.kind !== 'pulse' && lead < MIN_LEAD[tg.tier])
    out.push(`ability ${a.id}: ${tg.tier} warning lead ${lead} s under ${MIN_LEAD[tg.tier]} s`);
  if (tg.shape.kind === 'pulse' && tg.shape.firstDelay < MIN_FIRST_PULSE)
    out.push(`ability ${a.id}: pulse zone's first pulse under ${MIN_FIRST_PULSE} s`);
  if (tg.follow && tg.tier === 'lethal')
    out.push(`ability ${a.id}: a lethal warning cannot follow`);
  if (tg.follow && tg.shape.kind !== 'circle')
    out.push(`ability ${a.id}: only a circle can follow its target`);
  if (areaCount(tg.shape, MEMBER_AREAS) > TELEGRAPH_CAP)
    out.push(`ability ${a.id}: one cast lays more than ${TELEGRAPH_CAP} warning areas`);
  return out;
}

function list<T>(v: T[] | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

/** Every library and registry check of the monsters (validateCombat adds these). */
export function bossMechanicProblems(content: ContentMap): string[] {
  const out: string[] = [];
  const abilities = new Map((content.abilities ?? []).map((a) => [a.id, a]));
  const auraIds = new Set((content.auras ?? []).map((a) => a.id));
  const monsterIds = new Set((content.monsters ?? []).map((m) => m.id));
  for (const a of content.abilities ?? []) out.push(...telegraphProblems(a));
  for (const h of HIT_AFFIXES)
    if (h.aura && !auraIds.has(h.aura)) out.push(`registry: template aura ${h.aura} missing`);

  for (const mon of content.monsters ?? []) {
    const m = mon.mechanics;
    const at = (what: string) => `monster ${mon.id}: ${what}`;

    // warnings: tier by design damage for every ability the monster can lay (its lists, the
    // casts of its actions, its big cast and its drain), areas per phase list (marks count)
    const memberHp = standardMemberHp(content, mon.maxLevel);
    const actions = [
      ...list(m?.phases).flatMap((p) => list(p.onEnter)),
      ...list(m?.terrain).flatMap((t) => (Array.isArray(t.effect) ? t.effect : [])),
      ...list(m?.breakableParts).flatMap((p) => list(p.onBreak)),
    ];
    const lists = [
      mon.abilities ?? [],
      ...list(m?.phases).map((p) => p.abilities ?? mon.abilities ?? []),
    ];
    const castable = new Set([
      ...lists.flat(),
      ...actions.flatMap((a) => (a.do === 'cast' ? [a.ability] : [])),
      ...(m?.bigCast ? [m.bigCast.ability] : []),
      ...(m?.doorSeek?.channel ? [m.doorSeek.channel] : []),
    ]);
    for (const id of [...castable].sort()) {
      const a = abilities.get(id);
      const tg = a?.telegraph;
      if (!a || !tg) continue;
      const need = tierFor(designDamage(a, mon), memberHp);
      if (TIER_RANK[need] > TIER_RANK[tg.tier])
        out.push(at(`${id} deals ${need} damage under a ${tg.tier} warning`));
    }
    const markAreas = new Map(list(m?.marks).map((k) => [k.ability, k.count]));
    for (const ids of lists) {
      let areas = 0;
      for (const id of ids) {
        const mark = markAreas.get(id);
        const tg = abilities.get(id)?.telegraph;
        if (mark !== undefined) areas += mark;
        else if (tg) areas += areaCount(tg.shape, MEMBER_AREAS);
      }
      if (areas > TELEGRAPH_CAP) out.push(at(`one phase can lay ${areas} warning areas`));
    }
    // the affix warnings are plain ones at 1.2 s: their damage must stay under the heavy line
    const affixHits: [string, number][] = [];
    const lvl = mon.maxLevel;
    if (m?.aoePulse) affixHits.push(['aoePulse', scaled(m.aoePulse.damage, lvl, 0)]);
    if (m?.stomp?.damage) affixHits.push(['stomp', scaled(m.stomp.damage, lvl, 0)]);
    if (m?.charge?.damage) affixHits.push(['charge', scaled(m.charge.damage, lvl, 0)]);
    if (m?.deathThroes) affixHits.push(['deathThroes', scaled(m.deathThroes.damage, lvl, 0)]);
    for (const [field, dmg] of affixHits)
      if (tierFor(dmg, memberHp) !== 'normal')
        out.push(at(`${field} hits ${tierFor(dmg, memberHp)} under a plain warning`));
    if (!m) continue;
    for (const k of Object.keys(m))
      if (!MECHANIC_KEYS.has(k)) out.push(at(`unknown mechanic ${k}`));

    // phases and every action list (phases, arena objects, parts)
    const shieldIds = new Set(list(m.shields).map((s) => s.id));
    const objects = new Set(list(m.terrain).map((t) => t.object));
    const checkActions = (where: string, acts: BossAction[]) => {
      for (const act of acts) {
        if (act.do === 'cast' && !abilities.has(act.ability))
          out.push(at(`${where} casts unknown ${act.ability}`));
        if (act.do === 'adds' && !monsterIds.has(act.monster))
          out.push(at(`${where} adds unknown ${act.monster}`));
        if (act.do === 'shield' && !shieldIds.has(act.ref))
          out.push(at(`${where} raises unknown shield ${act.ref}`));
        if (act.do === 'terrain' && !objects.has(act.object))
          out.push(at(`${where} sets unknown object ${act.object}`));
        if (act.do === 'stagger' && act.seconds > 6) out.push(at(`${where} staggers over 6 s`));
      }
    };
    list(m.phases).forEach((p, i) => {
      if (p.belowPct === undefined && p.atSec === undefined)
        out.push(at(`phase ${i} has neither belowPct nor atSec`));
      checkActions(`phase ${i}`, list(p.onEnter));
    });
    for (const t of list(m.terrain))
      if (Array.isArray(t.effect)) checkActions(`object ${t.object}`, t.effect);
    for (const p of list(m.breakableParts)) checkActions(`part ${p.id}`, list(p.onBreak));
    for (const w of list(m.adds)) {
      if (!monsterIds.has(w.monster)) out.push(at(`adds unknown ${w.monster}`));
      if (w.atPct === undefined && w.every === undefined)
        out.push(at(`adds ${w.monster} need atPct or every`));
    }
    if (m.enrage && m.enrage.belowPct === undefined && m.enrage.atSec === undefined)
      out.push(at('enrage needs belowPct or atSec'));
    if (m.berserk) {
      const layer = mon.tier === 'story' ? mon.storyAs : mon.tier;
      if (
        mon.rank !== 'boss' ||
        mon.tier === 'story' ||
        mon.tier === 'tutorial' ||
        !layer ||
        layer === 'lair'
      )
        out.push(at('a hard enrage is only for dungeon lords and above, never a story boss'));
      if (m.berserk.aura && !auraIds.has(m.berserk.aura))
        out.push(at(`unknown berserk aura ${m.berserk.aura}`));
    }
    const known = new Set([
      ...(mon.abilities ?? []),
      ...list(m.phases).flatMap((p) => p.abilities ?? []),
    ]);
    for (const k of list(m.marks)) {
      if (!abilities.has(k.ability) || !known.has(k.ability))
        out.push(at(`mark ability ${k.ability} not in its lists`));
      if (k.count < 1 || k.count > TELEGRAPH_CAP)
        out.push(at(`mark count ${k.count} outside 1 to ${TELEGRAPH_CAP}`));
      // a mark follows its carrier: never lethal, and its delay is its lead (10.3, 10.5)
      const tier = abilities.get(k.ability)?.telegraph?.tier ?? 'heavy';
      if (tier === 'lethal') out.push(at(`mark ${k.ability} cannot be lethal (it follows)`));
      if (k.delay < MIN_LEAD[tier])
        out.push(at(`mark ${k.ability} delay ${k.delay} s under ${MIN_LEAD[tier]} s`));
    }
    for (const w of list(m.interruptWindows)) {
      if (!abilities.has(w.ability)) out.push(at(`interrupt span on unknown ${w.ability}`));
      const from = w.from ?? 0;
      const to = w.to ?? 1;
      if (from < 0 || to > 1 || from > to)
        out.push(at(`interrupt span of ${w.ability} outside 0 to 1`));
    }
    for (const s of list(m.shields)) {
      if (!BREAK_BY.includes(s.breakBy)) out.push(at(`shield ${s.id} bad breakBy ${s.breakBy}`));
      if (s.kind === 'absorb' && !s.amount) out.push(at(`absorb shield ${s.id} has no amount`));
      if (s.breakBy === 'ability' && (!s.breakRef || !abilities.has(s.breakRef)))
        out.push(at(`shield ${s.id} breaks by unknown ability ${s.breakRef}`));
      if (s.breakBy === 'terrain' && (!s.breakRef || !objects.has(s.breakRef)))
        out.push(at(`shield ${s.id} breaks by unknown object ${s.breakRef}`));
      if (s.breakBy === 'timer' && !s.seconds) out.push(at(`timer shield ${s.id} has no seconds`));
      if ((s.onBreak?.stagger ?? 0) > 6) out.push(at(`shield ${s.id} staggers over 6 s`));
      if (s.kind === 'immune' && s.breakBy === 'damage')
        out.push(at(`immune shield ${s.id} cannot break by damage`));
      const t = s.trigger ?? {};
      const raised = actions.some((a) => a.do === 'shield' && a.ref === s.id);
      if (t.belowPct === undefined && t.atSec === undefined && t.phase === undefined && !raised)
        out.push(at(`shield ${s.id} has no trigger and no action raises it`));
      if (s.onBreak?.aura && !auraIds.has(s.onBreak.aura))
        out.push(at(`shield ${s.id} unknown aura`));
    }
    for (const t of list(m.terrain)) {
      if (!TERRAIN_ROLES.includes(t.role)) out.push(at(`object ${t.object} bad role ${t.role}`));
      if (!t.at && !t.offset) out.push(at(`object ${t.object} needs at or offset`));
      if (t.role === 'hazard' && !t.aura && !t.damage)
        out.push(at(`hazard ${t.object} lays nothing`));
      if (t.aura && !auraIds.has(t.aura)) out.push(at(`object ${t.object} unknown aura ${t.aura}`));
      const eff = t.effect;
      if (eff && !Array.isArray(eff) && eff.stagger > 6)
        out.push(at(`object ${t.object} staggers over 6 s`));
    }
    for (const r of list(m.resolve)) {
      if (!RESOLVE_WAYS.includes(r.way)) out.push(at(`resolution bad way ${r.way}`));
      if (typeof r.when === 'string') {
        try {
          evaluate(r.when, () => undefined);
        } catch {
          out.push(at(`resolution ${r.way} condition does not parse`));
        }
      }
      const reward = r.outcome?.reward;
      if (reward && reward !== 'full' && reward !== 'none' && !reward.startsWith('table:'))
        out.push(at(`resolution bad reward ${reward}`));
    }
    if (m.doorSeek) {
      const ch = m.doorSeek.channel ? abilities.get(m.doorSeek.channel) : undefined;
      if (m.doorSeek.range <= 0 || !m.doorSeek.fallbackTag)
        out.push(at('doorSeek needs a range and a tag'));
      if (m.doorSeek.channel && !ch?.channel)
        out.push(at(`doorSeek channel ${m.doorSeek.channel} is no channel`));
    }
    for (const p of list(m.breakableParts)) {
      if (!(p.hp > 0 && p.hp <= 1)) out.push(at(`part ${p.id} health share outside 0 to 1`));
    }
    // registry field shapes
    for (const h of HIT_AFFIXES) {
      const a = m[h.field] as { chance?: number } | undefined;
      if (a && (typeof a.chance !== 'number' || a.chance < 0 || a.chance > 1))
        out.push(at(`${h.field} chance outside 0 to 1`));
    }
    if (m.purifyTo && !monsterIds.has(m.purifyTo)) out.push(at(`purifyTo unknown ${m.purifyTo}`));
    if (m.purifyItems) {
      if (!Array.isArray(m.purifyItems)) out.push(at('purifyItems must be an array'));
      else
        for (const item of m.purifyItems) {
          if (
            !content.items.some((def) => def.id === item.itemId) ||
            !Number.isInteger(item.count) ||
            item.count <= 0
          ) {
            out.push(at('purifyItems needs an existing item and positive integer count'));
          }
          if (item.companion && !content.companions.some((def) => def.id === item.companion))
            out.push(at('purifyItems names an unknown companion'));
        }
    }
    if (m.corpseRise && !monsterIds.has(m.corpseRise.into))
      out.push(at(`corpseRise unknown ${m.corpseRise.into}`));
    if (m.bigCast && !abilities.has(m.bigCast.ability))
      out.push(at(`bigCast unknown ${m.bigCast.ability}`));
    if (m.nightOnly?.aura && !auraIds.has(m.nightOnly.aura)) out.push(at(`nightOnly unknown aura`));
    if (m.cropBlight && !(m.cropBlight.rate > 0 && m.cropBlight.rate <= 1))
      out.push(at('cropBlight rate outside 0 to 1'));
  }
  return out;
}

/** A cue table row, as far as the coverage check reads it (data/audio/cues.json). */
export interface CueRow {
  id: string;
  event: string;
  when?: Record<string, unknown>;
}

/**
 * Two-way cues (10.1, 18, 20 "两路提示"): every lethal and heavy warning and every boss cast
 * has a sound. Warnings sound through a cue on `combat.telegraph`; casts through a cue on
 * `combat.cast` that is not limited to other ops than `start`. Returns the uncovered cases.
 */
export function cueCoverage(content: ContentMap, cues: readonly CueRow[]): string[] {
  const out: string[] = [];
  const warnCue = cues.some((c) => c.event === 'combat.telegraph');
  const castCue = cues.some((c) => {
    if (c.event !== 'combat.cast') return false;
    const op = c.when?.castOp;
    return op === undefined || op === 'start' || (Array.isArray(op) && op.includes('start'));
  });
  const abilities = new Map((content.abilities ?? []).map((a) => [a.id, a]));
  for (const mon of content.monsters ?? []) {
    if (mon.rank !== 'boss') continue;
    const ids = new Set([
      ...(mon.abilities ?? []),
      ...list(mon.mechanics?.phases).flatMap((p) => p.abilities ?? []),
    ]);
    for (const id of [...ids].sort()) {
      const a = abilities.get(id);
      if (!a) continue;
      const tier = a.telegraph?.tier;
      if ((tier === 'lethal' || tier === 'heavy') && !warnCue)
        out.push(`monster ${mon.id}: ${tier} warning ${id} has no sound cue`);
      if (((a.castTime ?? 0) > 0 || a.telegraph) && !castCue)
        out.push(`monster ${mon.id}: cast ${id} has no sound cue`);
    }
  }
  return out;
}
