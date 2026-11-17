// Disputes pack (PK-M1-46): the dispute chain quests of act 1 (quests of kind `dispute`
// whose `defaults` are the default development, data/disputes/act1_chains.json) and the
// runner records of those chains (stages, decision points, settlement and outcomes,
// data/disputes/act1.json). The validator checks the runner records against the chains, the
// people, the act clock and the registry name rules, and that every chain can always end:
// one default ending, and a decision menu that is never empty.

import act1 from '../../../data/disputes/act1.json';
import chains from '../../../data/disputes/act1_chains.json';
import type { ContentMap } from '../../core/contracts';
import { NAME_MAX } from '../../core/registry/registry';
import {
  type DecisionPointDef,
  type DisputeDef,
  ENDING_BY,
  type TermDef,
} from '../../systems/disputes/types';
import { TERM_NAMES } from '../../systems/disputes/utility';
import type { QuestDef } from '../../systems/quests/types';
import type { ContentPack } from '../pack';
import { conditionProblems, effectProblems } from './quests';

/** A code that goes into a flag name: one registry name segment. */
const SEGMENT = /^[a-z][a-z0-9_]*$/;

function termProblems(t: TermDef | undefined, at: string): string[] {
  if (t === undefined) return [`${at}: missing`];
  if (typeof t === 'number') return Number.isFinite(t) ? [] : [`${at}: not a number`];
  const out: string[] = [];
  if (typeof t !== 'object' || !Number.isFinite(t.base)) out.push(`${at}: base must be a number`);
  for (const [i, a] of (t.add ?? []).entries()) {
    if (!Number.isFinite(a.value)) out.push(`${at} add ${i}: value must be a number`);
    if (!a.when) out.push(`${at} add ${i}: needs a condition`);
    out.push(...conditionProblems(a.when, `${at} add ${i}`));
  }
  return out;
}

function codeProblems(code: string, at: string): string[] {
  return SEGMENT.test(code) ? [] : [`${at}: ${code} is not a lowercase name segment`];
}

function pointProblems(
  d: DisputeDef,
  p: DecisionPointDef,
  index: number,
  content: ContentMap,
  people: Set<string> | null,
): string[] {
  const at = `dispute ${d.id} decision ${p.id}`;
  const out: string[] = [...codeProblems(p.id, at)];
  const flag = `dispute.${d.id}.choice.${p.id}`;
  if (flag.length > NAME_MAX) out.push(`${at}: ${flag} is longer than ${NAME_MAX}`);
  if (people && !people.has(p.actor)) out.push(`${at}: unknown person ${p.actor}`);
  if ((p.week === undefined) === (p.after === undefined))
    out.push(`${at}: names exactly one of week and after`);
  if (p.after !== undefined) {
    const before = d.decisions.findIndex((x) => x.id === p.after);
    if (before < 0) out.push(`${at}: unknown point ${p.after}`);
    else if (before >= index) out.push(`${at}: follows ${p.after}, which must come before it`);
  }
  if (p.week !== undefined) {
    if (!Number.isInteger(p.week) || p.week < d.span.from || p.week > d.span.to)
      out.push(`${at}: week ${p.week} outside the span`);
    const until = p.until ?? d.span.to;
    if (!Number.isInteger(until) || until < p.week || until > d.span.to)
      out.push(`${at}: until ${until} outside ${p.week} to ${d.span.to}`);
  } else if (p.until !== undefined) out.push(`${at}: until needs week`);
  if (p.hours !== undefined && !(p.hours >= 0)) out.push(`${at}: hours must not be negative`);
  if (p.band !== undefined && !(p.band >= 0 && p.band <= 1)) out.push(`${at}: band outside 0 to 1`);
  out.push(...conditionProblems(p.when, `${at} when`));
  out.push(...conditionProblems(p.unless, `${at} unless`));
  if (p.options.length === 0) out.push(`${at}: no options`);
  // a menu that is never empty: the chain never waits on a point nobody can answer
  if (!p.options.some((o) => !o.when)) out.push(`${at}: every option is conditional`);
  const ids = new Set<string>();
  for (const o of p.options) {
    const oat = `${at} option ${o.id}`;
    if (ids.has(o.id)) out.push(`${oat}: duplicate id`);
    ids.add(o.id);
    out.push(...codeProblems(o.id, oat));
    if (!o.label) out.push(`${oat}: no label`);
    out.push(...conditionProblems(o.when, `${oat} when`));
    out.push(...conditionProblems(o.breaks, `${oat} breaks`));
    for (const name of TERM_NAMES) out.push(...termProblems(o.terms?.[name], `${oat} ${name}`));
    out.push(...effectProblems(o.effects, oat, content));
  }
  return out;
}

/** Problems of one dispute record against the content. */
export function disputeProblems(d: DisputeDef, content: ContentMap): string[] {
  const at = `dispute ${d.id}`;
  const out: string[] = [];
  const chain = content.quests.find((q: QuestDef) => q.id === d.id);
  if (!chain) out.push(`${at}: no chain quest ${d.id}`);
  else {
    if (chain.kind !== 'dispute') out.push(`${at}: quest ${d.id} is not a dispute chain`);
    if (chain.act !== d.act) out.push(`${at}: act ${d.act} differs from its chain's ${chain.act}`);
    // a world-made ending closes the chain quest as done by someone else
    if (!chain.byOther?.when?.includes(`dispute.${d.id}.`))
      out.push(`${at}: its chain quest needs a byOther that reads dispute.${d.id}.*`);
  }
  const longest = `dispute.${d.id}.escalation`;
  if (longest.length > NAME_MAX) out.push(`${at}: ${longest} is longer than ${NAME_MAX}`);
  const act = content.acts.find((a) => a.id === d.act);
  if (!act) out.push(`${at}: unknown act ${d.act}`);
  else if (!act.clock) out.push(`${at}: act ${d.act} counts no weeks (no clock)`);
  if (!d.code) out.push(`${at}: no display code`);
  const weeks = act?.clock?.weeks;
  const span = d.span;
  if (
    !span ||
    !Number.isInteger(span.from) ||
    !Number.isInteger(span.to) ||
    span.from < 1 ||
    span.to < span.from ||
    (weeks !== undefined && span.to > weeks)
  )
    out.push(`${at}: bad span`);
  const persons = (content as { npcs?: { id: string }[] }).npcs;
  const people = persons ? new Set(persons.map((p) => p.id)) : null;
  if (people) for (const p of d.parties) if (!people.has(p)) out.push(`${at}: unknown party ${p}`);
  const stages = new Set<string>();
  for (const s of d.stages) {
    const sat = `${at} stage ${s.id}`;
    if (stages.has(s.id)) out.push(`${sat}: duplicate id`);
    stages.add(s.id);
    out.push(...codeProblems(s.id, sat));
    if (!Number.isInteger(s.escalation) || s.escalation < 0 || s.escalation > 3)
      out.push(`${sat}: escalation outside 0 to 3`);
    if (s.week !== undefined && !(Number.isInteger(s.week) && s.week >= 1))
      out.push(`${sat}: bad week ${s.week}`);
    out.push(...conditionProblems(s.when, `${sat} when`));
  }
  const points = new Set<string>();
  d.decisions.forEach((p, i) => {
    if (points.has(p.id)) out.push(`${at} decision ${p.id}: duplicate id`);
    points.add(p.id);
    out.push(...pointProblems(d, p, i, content, people));
  });
  if (
    !Number.isInteger(d.settle?.week) ||
    d.settle.week < (span?.from ?? 1) ||
    (weeks !== undefined && d.settle.week > weeks + 1)
  )
    out.push(`${at}: bad settle week`);
  out.push(...conditionProblems(d.settle?.when, `${at} settle`));
  const rows = new Set<string>();
  let defaults = 0;
  for (const o of d.outcomes) {
    const oat = `${at} outcome ${o.id}`;
    if (rows.has(o.id)) out.push(`${oat}: duplicate id`);
    rows.add(o.id);
    out.push(...codeProblems(o.ending ?? o.id, oat));
    if (!ENDING_BY.includes(o.by)) out.push(`${oat}: bad by ${String(o.by)}`);
    if (o.default) {
      defaults++;
      if (o.when) out.push(`${oat}: the default ending has no condition`);
      if (o.stack) out.push(`${oat}: the default ending does not stack`);
    } else if (!o.when) out.push(`${oat}: needs a condition`);
    out.push(...conditionProblems(o.when, `${oat} when`));
    out.push(...effectProblems(o.effects, oat, content));
  }
  // exactly one default: a chain always reaches a legal ending
  if (defaults !== 1) out.push(`${at}: needs exactly one default ending (has ${defaults})`);
  return out;
}

export const pack: ContentPack = {
  id: 'disputes',
  tables: {
    quests: chains as unknown as QuestDef[],
    disputes: act1 as unknown as DisputeDef[],
  },
  schemas: [
    {
      table: 'disputes',
      label: '纷争运行（第一幕）',
      file: 'disputes/act1.json',
      idField: 'id',
      nameField: 'code',
      fields: [
        { key: 'id', label: 'ID（纷争链任务）', type: 'ref', refTable: 'quests', required: true },
        { key: 'act', label: '幕', type: 'ref', refTable: 'acts', required: true },
        { key: 'code', label: '显示编号', type: 'string', required: true },
        { key: 'parties', label: '当事人（人物 ID）', type: 'list' },
        { key: 'span', label: '推进周', type: 'json', help: '{ from, to }：本幕第几周到第几周' },
        {
          key: 'stages',
          label: '阶段',
          type: 'json',
          help: 'id、label、escalation（0 到 3）、week、when；取最后一个已到周且条件成立的阶段',
        },
        {
          key: 'decisions',
          label: '决策点',
          type: 'json',
          help: 'actor 点名的人物；week 或 after；when、unless、hours、band；options 的 terms 为效用四项',
        },
        {
          key: 'settle',
          label: '结算',
          type: 'json',
          help: '{ week, when }：到周或条件成立时结算，幕结束时强制结算',
        },
        {
          key: 'outcomes',
          label: '结局',
          type: 'json',
          help: 'id、label、ending、when、by（player 或 world）、default、stack、effects',
        },
      ],
    },
    {
      table: 'quests',
      label: '纷争链任务（第一幕）',
      file: 'disputes/act1_chains.json',
      idField: 'id',
      nameField: 'title',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'act', label: '幕', type: 'ref', refTable: 'acts', required: true },
        { key: 'kind', label: '种类', type: 'enum', options: ['dispute'] },
        { key: 'title', label: '标题', type: 'string', required: true },
        { key: 'desc', label: '描述', type: 'text' },
        { key: 'trigger', label: '触发条件', type: 'string' },
        { key: 'stages', label: '阶段与目标', type: 'json' },
        { key: 'byOther', label: '由他人先完成', type: 'json' },
        { key: 'rewards', label: '完成效果与奖励', type: 'json' },
        { key: 'order', label: '排序', type: 'number' },
        { key: 'defaults', label: '默认发展（按周）', type: 'json' },
      ],
    },
  ],
  validate(content) {
    const disputes = (content as { disputes?: DisputeDef[] }).disputes ?? [];
    return disputes.flatMap((d) => disputeProblems(d, content));
  },
};
