// Guild pack (PK-M1-47): the guild's ranks and formulas (data/guild/config.json), the
// commission boards, the commission templates `cmm_` and the dynamic event templates `ev_`
// (catalog_quests_acts1_3.md 2, 3, 5.6, 5.7). The director's events become menu items of the
// narrative director here (table directorMenu), so the director chooses them by its own
// rules. The validator holds the catalog's rules: every reference exists, every template
// builds valid quest objectives, commissions write only white-listed world state, events
// give no experience, tides and disasters announce themselves at least three days ahead,
// searches need a precursor, and a goddess leads no tide before act 3.

import boards from '../../../data/guild/boards.json';
import commissions from '../../../data/guild/commissions.json';
import config from '../../../data/guild/config.json';
import events from '../../../data/guild/events.json';
import type { ContentMap } from '../../core/contracts';
import type { DirectorItemDef } from '../../systems/director';
import { instanceStages } from '../../systems/guild/instance';
import type { Posting } from '../../systems/guild/types';
import {
  type BoardDef,
  COMEDY_BITS,
  COMMISSION_KINDS,
  COMMISSION_RANKS,
  type CommissionDef,
  DISTANCE_BANDS,
  type DynamicEventDef,
  EVENT_CATEGORIES,
  EVENT_SOURCES,
  GOAL_STEPS,
  GOAL_TYPES,
  GUILD_RANKS,
  type GuildConfig,
  KIND_GOALS,
  MODIFIER_TARGETS,
  type ModifierWrite,
  OMEN_CATEGORIES,
  PRECURSOR_CATEGORIES,
  SEVERITIES,
} from '../../systems/guild/types';
import { checkCondition } from '../../systems/quests/conditions';
import type { Effect } from '../../systems/quests/effect_types';
import type { ContentPack } from '../pack';
import { effectProblems } from './quests';
import { keyEffectProblems, objectiveProblems } from './quests_model';

/** World writes a commission may make on completion (catalog 2.2 `writes`; pay and xp are formulas). */
const COMMISSION_WRITES = new Set<Effect['type']>(['flag', 'add', 'append', 'line']);
/** Writes an event may make (catalog 3.2: events give no quest experience, no pay, no items). */
const EVENT_WRITES = new Set<Effect['type']>([
  'flag',
  'add',
  'append',
  'line',
  'wave',
  'scene',
  'impression',
  'interest',
  'relation',
  'memory',
]);

const cfg = config as unknown as GuildConfig;
const boardRows = boards as unknown as BoardDef[];
const commissionRows = commissions as unknown as CommissionDef[];
const eventRows = events as unknown as DynamicEventDef[];

/** `act == 1` or `(act == 1 OR act == 2)`: the act gate of a director item. */
function actGate(acts: readonly number[]): string {
  const parts = acts.map((a) => `act == ${a}`);
  return parts.length === 1 ? (parts[0] as string) : `(${parts.join(' OR ')})`;
}

/**
 * The director's menu items of the director-sourced events: the director picks and narrates
 * them by its own tension rules (goddess_gm.md 8.3), the guild settles them on director.move.
 */
export function directorItems(rows: readonly DynamicEventDef[]): DirectorItemDef[] {
  const out: DirectorItemDef[] = [];
  for (const e of rows) {
    if (!e.director) continue;
    const gate = actGate(e.acts);
    const item: DirectorItemDef = {
      id: e.id,
      kind: e.director.move,
      label: e.title,
      requires: e.when ? `${gate} AND (${e.when})` : gate,
      narration: e.narration ?? e.title,
      cooldownHours: e.director.cooldownHours,
      power: e.director.power,
    };
    if (e.maps.length > 0) item.maps = [...e.maps];
    if (e.director.weight !== undefined) item.weight = e.director.weight;
    out.push(item);
  }
  return out;
}

function ids(content: ContentMap, table: string): Set<string> | null {
  const rows = (content as unknown as Record<string, unknown>)[table];
  if (!Array.isArray(rows)) return null;
  return new Set(rows.map((r) => (r as { id?: string }).id ?? ''));
}

function cond(out: string[], at: string, expr: string | undefined): void {
  if (expr === undefined) return;
  const err = checkCondition(expr);
  if (err) out.push(`${at}: ${err}`);
}

function range(out: string[], at: string, r: unknown, min: number): void {
  if (
    !Array.isArray(r) ||
    r.length !== 2 ||
    !r.every((x) => Number.isInteger(x) && (x as number) >= min) ||
    (r[0] as number) > (r[1] as number)
  )
    out.push(`${at}: bad range ${JSON.stringify(r)}`);
}

function acts(out: string[], at: string, a: unknown): void {
  if (
    !Array.isArray(a) ||
    a.length === 0 ||
    !a.every((x) => Number.isInteger(x) && x >= 0 && x <= 7)
  )
    out.push(`${at}: acts must list acts 0 to 7`);
}

function modifierProblems(
  out: string[],
  at: string,
  mods: readonly ModifierWrite[] | undefined,
): void {
  for (const [i, m] of (mods ?? []).entries()) {
    if (!(MODIFIER_TARGETS as readonly string[]).includes(m.target))
      out.push(`${at} modifier ${i}: unknown target ${m.target}`);
    if (!m.key) out.push(`${at} modifier ${i}: no key`);
    if (m.factor === undefined && m.add === undefined)
      out.push(`${at} modifier ${i}: neither factor nor add`);
    if (!(m.days > 0)) out.push(`${at} modifier ${i}: days must be positive`);
  }
}

function placeProblems(
  content: ContentMap,
  out: string[],
  at: string,
  mapId: string,
  loc?: string,
): void {
  const map = content.maps?.find((m) => m.id === mapId);
  if (!map) {
    out.push(`${at}: unknown map ${mapId}`);
    return;
  }
  if (loc && !map.locations.some((l) => l.id === loc)) out.push(`${at}: unknown location ${loc}`);
}

function configProblems(c: GuildConfig | undefined): string[] {
  const out: string[] = [];
  if (!c) return ['guild config: missing'];
  const order = c.ranks.map((r) => r.id).join(',');
  if (order !== GUILD_RANKS.join(','))
    out.push(`guild config: ranks must be ${GUILD_RANKS.join(', ')} in order`);
  for (const r of c.ranks) {
    if (r.commissions && !GUILD_RANKS.includes(r.commissions.rank))
      out.push(`guild config: rank ${r.id} counts an unknown rank`);
  }
  for (const r of COMMISSION_RANKS) {
    const p = c.pay[r];
    if (!p) out.push(`guild config: no pay row for rank ${r}`);
    else if (!(p.base > 0 && p.min <= p.max && p.xp > 0 && p.median >= 1))
      out.push(`guild config: pay row ${r} is inconsistent`);
  }
  for (const k of COMMISSION_KINDS) if (!c.kinds[k]) out.push(`guild config: no kind row ${k}`);
  for (const d of DISTANCE_BANDS)
    if (!(c.distance[d] > 0)) out.push(`guild config: no distance ${d}`);
  if (c.difficulty.length === 0 || c.difficulty[c.difficulty.length - 1]?.upTo !== undefined)
    out.push('guild config: the last difficulty band must be open');
  const bounds = c.difficulty.map((b) => b.upTo).filter((x): x is number => x !== undefined);
  if (bounds.some((x, i) => i > 0 && x <= (bounds[i - 1] as number)))
    out.push('guild config: difficulty bands must rise');
  if (
    c.decay.length === 0 ||
    c.decay.some((x, i) => x <= 0 || (i > 0 && x > (c.decay[i - 1] as number)))
  )
    out.push('guild config: decay must be positive and not rising');
  if (!(c.cut >= 0 && c.cut < 1) || !(c.penalty >= 0 && c.penalty < 1))
    out.push('guild config: cut and penalty are shares below 1');
  if (!(c.maxAccepted >= 1)) out.push('guild config: maxAccepted below 1');
  cond(out, 'guild config registration', c.registration.when);
  return out;
}

function boardProblems(content: ContentMap, b: BoardDef, persons: Set<string> | null): string[] {
  const out: string[] = [];
  const at = `board ${b.id}`;
  placeProblems(content, out, at, b.mapId, b.location);
  if (b.receptionist && persons && !persons.has(b.receptionist))
    out.push(`${at}: unknown receptionist ${b.receptionist}`);
  acts(out, at, b.acts);
  if (b.ranks.length === 0 || !b.ranks.every((r) => COMMISSION_RANKS.includes(r)))
    out.push(`${at}: ranks must be commission ranks`);
  if (b.reach !== null && !(Number.isInteger(b.reach) && b.reach >= 0))
    out.push(`${at}: bad reach`);
  if (b.lone !== undefined && !b.ranks.includes(b.lone))
    out.push(`${at}: lone ceiling ${b.lone} is not a rank it posts`);
  if (!(Number.isInteger(b.cap) && b.cap >= 1)) out.push(`${at}: cap below 1`);
  range(out, `${at} refill`, b.refill, 0);
  if ((b.refill[1] ?? 0) > b.cap) out.push(`${at}: refill above the cap`);
  if (!(b.postWeeks >= 1)) out.push(`${at}: postWeeks below 1`);
  return out;
}

/** A posting with the first value of every draw, to check the objectives a template builds. */
function samplePosting(t: CommissionDef): Posting {
  const g = t.goal;
  const p: Posting = {
    id: 'gc_f_000',
    display: 'GC-F-000',
    template: t.id,
    board: t.boards[0] ?? '',
    rank: t.rank,
    giver: t.givers?.[0] ?? null,
    place: t.places[0] ?? { mapId: '' },
    days: t.days[0],
    reward: 0,
    cut: 0,
    urgent: false,
    emergency: false,
    postedDay: 0,
    untilDay: 0,
    state: 'posted',
  };
  if (g.type === 'kill') {
    p.target = g.targets[0];
    p.count = g.count[0];
  } else if (g.type === 'deliver') {
    p.item = g.items[0];
    p.count = g.count[0];
  } else if (g.type === 'talk') p.recipient = g.to[0];
  else if (g.type === 'escort') p.recipient = g.people[0];
  return p;
}

function commissionProblems(
  content: ContentMap,
  t: CommissionDef,
  ctx: {
    boards: Map<string, BoardDef>;
    persons: Set<string> | null;
    monsters: ContentMap['monsters'] | undefined;
  },
): string[] {
  const out: string[] = [];
  const at = `commission ${t.id}`;
  if (!t.id.startsWith('cmm_')) out.push(`${at}: id must start with cmm_`);
  if (!COMMISSION_RANKS.includes(t.rank)) out.push(`${at}: rank ${t.rank} is no commission rank`);
  if (!(COMMISSION_KINDS as readonly string[]).includes(t.kind))
    out.push(`${at}: unknown kind ${t.kind}`);
  if (!(DISTANCE_BANDS as readonly string[]).includes(t.distance))
    out.push(`${at}: unknown distance ${t.distance}`);
  if (!t.title || !t.desc) out.push(`${at}: title and desc are required`);
  acts(out, at, t.acts);
  if (!(Number.isInteger(t.level) && t.level >= 1 && t.level <= 60))
    out.push(`${at}: level out of 1 to 60`);
  range(out, `${at} days`, t.days, 1);
  if (t.boards.length === 0) out.push(`${at}: no board`);
  for (const b of t.boards) {
    const board = ctx.boards.get(b);
    if (!board) out.push(`${at}: unknown board ${b}`);
    else if (!board.ranks.includes(t.rank))
      out.push(`${at}: board ${b} does not post rank ${t.rank}`);
  }
  for (const a of t.acts)
    if (!t.boards.some((b) => ctx.boards.get(b)?.acts.includes(a)))
      out.push(`${at}: no board of it stands in act ${a}`);
  for (const g of t.givers ?? [])
    if (ctx.persons && !ctx.persons.has(g)) out.push(`${at}: unknown giver ${g}`);
  if (t.places.length === 0) out.push(`${at}: no place`);
  for (const p of t.places) placeProblems(content, out, at, p.mapId, p.location);
  const g = t.goal;
  if (!(GOAL_TYPES as readonly string[]).includes(g.type)) {
    out.push(`${at}: unknown goal ${String((g as { type?: unknown }).type)}`);
    return out;
  }
  if (!KIND_GOALS[t.kind]?.includes(g.type))
    out.push(`${at}: a ${t.kind} commission cannot have a ${g.type} goal`);
  if (t.labels.length !== GOAL_STEPS[g.type])
    out.push(`${at}: ${g.type} needs ${GOAL_STEPS[g.type]} labels`);
  if ((g.type === 'deliver' || g.type === 'find') && !(t.givers && t.givers.length > 0))
    out.push(`${at}: a ${g.type} goal needs a giver to hand it to`);
  if (g.type === 'kill') {
    range(out, `${at} count`, g.count, 1);
    for (const m of g.targets) {
      const mon = ctx.monsters?.find((x) => x.id === m) as
        | { minLevel?: number; maxLevel?: number }
        | undefined;
      if (ctx.monsters && !mon) out.push(`${at}: unknown monster ${m}`);
      else if (!t.bounty && mon?.minLevel !== undefined && mon.maxLevel !== undefined) {
        if (t.level < mon.minLevel || t.level > mon.maxLevel)
          out.push(
            `${at}: level ${t.level} outside ${m} levels ${mon.minLevel} to ${mon.maxLevel}`,
          );
      }
    }
    if (g.targets.length === 0) out.push(`${at}: no target`);
  }
  if (g.type === 'deliver') {
    range(out, `${at} count`, g.count, 1);
    if (g.items.length === 0) out.push(`${at}: no item`);
  }
  if (g.type === 'talk') {
    if (g.to.length === 0) out.push(`${at}: nobody to carry it to`);
    for (const p of g.to)
      if (ctx.persons && !ctx.persons.has(p)) out.push(`${at}: unknown person ${p}`);
  }
  if (g.type === 'escort') {
    if (g.people.length === 0) out.push(`${at}: nobody to escort`);
    for (const p of g.people)
      if (ctx.persons && !ctx.persons.has(p) && !content.npcResidents?.some((t) => t.id === p))
        out.push(`${at}: unknown escortee ${p}`);
  }
  if (t.bounty) {
    if (g.type !== 'kill') out.push(`${at}: a bounty needs a kill goal`);
    if (!t.boards.every((id) => ctx.boards.get(id)?.reach === null))
      out.push(`${at}: a bounty belongs on a public notice board`);
    for (const key of ['base', 'perRumor', 'maxRumor'] as const)
      if (!Number.isFinite(t.bounty[key]) || t.bounty[key] < 0)
        out.push(`${at}: bad bounty ${key}`);
  }
  if (g.type === 'watch' && !(g.hours > 0)) out.push(`${at}: watch hours must be positive`);
  // the instance's objectives must be valid quest objectives
  for (const st of instanceStages(t, samplePosting(t)))
    for (const [i, o] of st.objectives.entries())
      out.push(...objectiveProblems(o, `${at} stage ${st.id} objective ${i}`, content));
  cond(out, `${at} when`, t.when);
  const w = t.weekWindow;
  if (w && ((w.from ?? 1) < 1 || (w.to !== undefined && w.to < (w.from ?? 1))))
    out.push(`${at}: bad weekWindow`);
  if (t.limit !== undefined && !(Number.isInteger(t.limit) && t.limit >= 1))
    out.push(`${at}: bad limit`);
  if (t.cooldownDays !== undefined && !(t.cooldownDays >= 0)) out.push(`${at}: bad cooldownDays`);
  if (t.merit !== undefined && !(Number.isInteger(t.merit) && t.merit >= 0))
    out.push(`${at}: bad merit`);
  for (const [i, e] of (t.writes ?? []).entries())
    if (!COMMISSION_WRITES.has(e.type))
      out.push(`${at} write ${i}: ${e.type} is not a commission write`);
  out.push(...effectProblems(t.writes, `${at} writes`, content));
  modifierProblems(out, at, t.modifiers);
  if (t.keySlot)
    out.push(...keyEffectProblems({ type: 'key', ...t.keySlot }, `${at} keySlot`, content));
  if (t.firstIn && !content.quests?.some((q) => q.id === t.firstIn))
    out.push(`${at}: unknown firstIn quest ${t.firstIn}`);
  return out;
}

function eventProblems(
  content: ContentMap,
  e: DynamicEventDef,
  ctx: {
    events: Set<string>;
    commissions: Set<string>;
    commissionRows: readonly CommissionDef[];
    boards: Map<string, BoardDef>;
    persons: Set<string> | null;
    rules: GuildConfig['events'] | undefined;
  },
): string[] {
  const out: string[] = [];
  const at = `event ${e.id}`;
  if (!e.id.startsWith('ev_')) out.push(`${at}: id must start with ev_`);
  if (!(EVENT_CATEGORIES as readonly string[]).includes(e.category))
    out.push(`${at}: unknown category ${e.category}`);
  if (!(EVENT_SOURCES as readonly string[]).includes(e.source))
    out.push(`${at}: unknown source ${e.source}`);
  if (!(SEVERITIES as readonly string[]).includes(e.severity))
    out.push(`${at}: unknown severity ${e.severity}`);
  if (!e.title) out.push(`${at}: title is required`);
  acts(out, at, e.acts);
  for (const m of e.maps) placeProblems(content, out, at, m);
  cond(out, `${at} when`, e.when);
  cond(out, `${at} yieldWhile`, e.yieldWhile);
  if (e.chance !== undefined && !(e.chance > 0 && e.chance <= 1))
    out.push(`${at}: chance out of (0, 1]`);
  if (e.weekday !== undefined && !(Number.isInteger(e.weekday) && e.weekday >= 1 && e.weekday <= 7))
    out.push(`${at}: weekday out of 1 to 7`);
  if (e.days !== undefined && !(Number.isInteger(e.days) && e.days >= 0))
    out.push(`${at}: bad days`);
  const minOmen = ctx.rules?.omenMinDays ?? 3;
  if (OMEN_CATEGORIES.includes(e.category) && !e.director && !((e.omen?.days ?? 0) >= minOmen))
    out.push(`${at}: a ${e.category} announces itself at least ${minOmen} days ahead (omen)`);
  if (PRECURSOR_CATEGORIES.includes(e.category) && !e.precursor)
    out.push(`${at}: a ${e.category} needs a precursor event`);
  if (e.precursor && !ctx.events.has(e.precursor.event))
    out.push(`${at}: unknown precursor ${e.precursor.event}`);
  if (e.source === 'goddess' && e.category === 'tide') {
    const from = ctx.rules?.goddessTideFromAct ?? 3;
    if (e.acts.some((a) => a < from)) out.push(`${at}: a goddess leads no tide before act ${from}`);
  }
  if (!e.when && !e.director && e.chance === undefined && e.weekday === undefined)
    out.push(`${at}: no trigger (when, chance, weekday or director)`);
  // a condition alone fires again every day it holds: it needs once, a chance, a weekday, a
  // cooldown or the tide cooldown
  if (
    !e.director &&
    !e.once &&
    e.chance === undefined &&
    e.weekday === undefined &&
    e.cooldownDays === undefined &&
    e.category !== 'tide'
  )
    out.push(`${at}: repeats every day while its condition holds (once, chance or cooldownDays)`);
  if (e.hooks?.urgent?.length && !((e.days ?? 0) > 0))
    out.push(`${at}: urgent pay lasts while the event runs: it needs days`);
  for (const [i, x] of [
    ...(e.effects ?? []),
    ...(e.omen?.effects ?? []),
    ...(e.end ?? []),
  ].entries())
    if (!EVENT_WRITES.has(x.type)) out.push(`${at} effect ${i}: ${x.type} is not an event write`);
  out.push(...effectProblems(e.effects, `${at} effects`, content));
  out.push(...effectProblems(e.omen?.effects, `${at} omen`, content));
  out.push(...effectProblems(e.end, `${at} end`, content));
  modifierProblems(out, at, e.modifiers);
  for (const t of [...(e.hooks?.post ?? []), ...(e.hooks?.urgent ?? [])])
    if (!ctx.commissions.has(t)) out.push(`${at}: unknown commission ${t}`);
  for (const t of e.hooks?.post ?? []) {
    const c = ctx.commissionRows.find((x) => x.id === t);
    const reach = c?.boards.some((b) => {
      const board = ctx.boards.get(b);
      if (!board?.acts.some((a) => e.acts.includes(a))) return false;
      return e.maps.length === 0 || e.maps.includes(board.mapId);
    });
    if (c && !reach) out.push(`${at}: ${t} has no board open on its maps in its acts`);
  }
  for (const k of e.hooks?.board?.kinds ?? [])
    if (!(COMMISSION_KINDS as readonly string[]).includes(k)) out.push(`${at}: unknown kind ${k}`);
  if (e.rumor) {
    if (e.rumor.details.length === 0 || e.rumor.details.length > 4)
      out.push(`${at}: rumor details 1 to 4`);
    if (e.rumor.tellers.length === 0) out.push(`${at}: rumor without a teller`);
    if (!/^[a-z][a-z0-9_]*$/.test(e.rumor.topic ?? ''))
      out.push(`${at}: rumor topic must be a code`);
    for (const p of e.rumor.tellers)
      if (ctx.persons && !ctx.persons.has(p)) out.push(`${at}: unknown teller ${p}`);
  }
  if (e.comedy && !(COMEDY_BITS as readonly string[]).includes(e.comedy))
    out.push(`${at}: unknown comedy bit ${e.comedy}`);
  if (e.director) {
    if (e.source !== 'director') out.push(`${at}: only director events go to the director`);
    if (!['coincidence', 'respite'].includes(e.director.move))
      out.push(`${at}: unknown director move`);
    if (!(e.director.power >= 1 && e.director.power <= 5))
      out.push(`${at}: director power 1 to 5 (D-035)`);
    if (!(e.director.cooldownHours > 0)) out.push(`${at}: director cooldown must be positive`);
    if (!e.narration) out.push(`${at}: the director needs a narration`);
    if (e.chance !== undefined || e.weekday !== undefined || e.omen || e.precursor)
      out.push(`${at}: the director decides when; no chance, weekday, omen or precursor`);
  } else if (e.source === 'director') out.push(`${at}: a director event needs its director move`);
  return out;
}

export function validateGuild(content: ContentMap): string[] {
  const out: string[] = [];
  out.push(...configProblems(content.guildConfig));
  const persons = (() => {
    const a = ids(content, 'npcs');
    const b = ids(content, 'companions');
    if (!a && !b) return null;
    return new Set([...(a ?? []), ...(b ?? [])]);
  })();
  for (const a of content.guildConfig?.adventurers ?? [])
    if (persons && !persons.has(a.id)) out.push(`guild config: unknown adventurer ${a.id}`);
  const boardMap = new Map((content.guildBoards ?? []).map((b) => [b.id, b]));
  for (const b of content.guildBoards ?? []) out.push(...boardProblems(content, b, persons));
  for (const t of content.commissions ?? [])
    out.push(
      ...commissionProblems(content, t, { boards: boardMap, persons, monsters: content.monsters }),
    );
  const eventIds = new Set((content.dynamicEvents ?? []).map((e) => e.id));
  const commissionIds = new Set((content.commissions ?? []).map((c) => c.id));
  for (const e of content.dynamicEvents ?? [])
    out.push(
      ...eventProblems(content, e, {
        events: eventIds,
        commissions: commissionIds,
        commissionRows: content.commissions ?? [],
        boards: boardMap,
        persons,
        rules: content.guildConfig?.events,
      }),
    );
  return out;
}

export const pack: ContentPack = {
  id: 'guild',
  tables: {
    guildConfig: cfg,
    guildBoards: boardRows,
    commissions: commissionRows,
    dynamicEvents: eventRows,
    directorMenu: directorItems(eventRows),
  },
  validate: validateGuild,
};
