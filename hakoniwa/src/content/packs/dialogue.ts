// Dialogue pack: the line packs of the no-model voice (builtin_ai.md 7; catalog_dialogue_lines
// .md), one file per pack under data/dialogue/lines/, and the map of the former rule-template
// keys into them (data/dialogue/legacy_lines.json; data/dialogue/templates.json and
// data/cognition/lines.json moved into the packs, PK-M0-25). Persona cards may still
// override any former key with their own lines.

import commissionsData from '../../../data/dialogue/commissions.json';
import intentRulesData from '../../../data/dialogue/intents.json';
import ledgerRefusalsData from '../../../data/dialogue/ledger_refusals.json';
import legacyMap from '../../../data/dialogue/legacy_lines.json';
import intentLexiconData from '../../../data/dialogue/lexicon.json';
import prologueAnswersData from '../../../data/dialogue/prologue_answers.json';
import reactionOptionsData from '../../../data/dialogue/reaction_options.json';
import topicCastData from '../../../data/dialogue/topic_cast.json';
import type { ContentMap } from '../../core/contracts';
import { defaultRegistry } from '../../core/registry';
import type { CommissionRules } from '../../systems/dialogue/commissions/requests';
import { ruleSetProblems } from '../../systems/dialogue/intent/content';
import {
  type LegacyLineMap,
  legacyLines,
  legacyProblems,
  sliceDigest,
} from '../../systems/dialogue/lines/legacy';
import { resolveSlot } from '../../systems/dialogue/lines/packs';
import type { LinePack } from '../../systems/dialogue/lines/types';
import {
  type PrologueAnswers,
  prologueAnswerProblems,
} from '../../systems/dialogue/prologue/answers';
import {
  type ReactionOptionsRow,
  reactionOptionProblems,
} from '../../systems/dialogue/reaction_offers';
import { topicProblems } from '../../systems/dialogue/topics/content';
import { type LedgerRefusalRow, ledgerRefusalProblems } from '../../systems/dialogue/topics/ledger';
import type { TopicDef } from '../../systems/dialogue/topics/types';
import { NEED_KEYS } from '../../systems/npc/types';
import { checkCondition, referencedVars } from '../../systems/quests/conditions';
import type { ContentPack, TableSchema } from '../pack';

const files = import.meta.glob<{ default: LinePack }>('../../../data/dialogue/lines/*.json', {
  eager: true,
});

const topicFiles = import.meta.glob<{ default: TopicDef[] }>(
  '../../../data/dialogue/topics/*.json',
  {
    eager: true,
  },
);

/** Topic files (path under data/) in file order: the generic topics, then by act. */
const topicsByFile: [string, TopicDef[]][] = Object.keys(topicFiles)
  .sort()
  .map((k) => [
    k.slice(k.indexOf('data/') + 5),
    (topicFiles[k] as { default: TopicDef[] }).default,
  ]);

/** Line packs with their data file (path under data/), in file order. */
const byFile: [string, LinePack][] = Object.keys(files)
  .sort()
  .map((k) => [k.slice(k.indexOf('data/') + 5), (files[k] as { default: LinePack }).default]);

/** Former keys the dialogue, NPC and cognition systems still ask for. */
export const REQUIRED_KEYS = [
  'greet',
  'chat',
  'banter',
  'opinion.unaware',
  'rumor.tell',
  'rumor.none',
  'bye',
  'say',
];

/**
 * Digest of each former key's lines (sliceDigest of the texts in order), taken from the two
 * deleted files at the migration: a line moved, inserted or reworded under an old key fails
 * the content check (the old key would say something else than before).
 */
export const LEGACY_DIGESTS: Readonly<Record<string, string>> = {
  greet: 'bf97131f',
  'greet.first': 'd9db4ca7',
  'greet.sleep': 'fd9cdc98',
  'greet.doubt': '57c71511',
  'greet.explaining': '169e35a7',
  'greet.wavering': 'f4d10c0d',
  'greet.accepted': 'b3ad48b8',
  'greet.worship': '10b9390a',
  'greet.hostile': '6280eab4',
  'greet.exploit': '881a68ae',
  'greet.cold': 'c9aff682',
  chat: 'eb2d63cf',
  'chat.work': '9d841e87',
  'chat.eat': '37118d61',
  'chat.pray': 'f210c501',
  'chat.shop': '6d54f60f',
  'chat.wander': 'fb86bcc4',
  'chat.chat': 'e3b0b885',
  'chat.sleep': '42469938',
  'chat.hungry': 'caea1083',
  'chat.tired': '0400470c',
  'chat.poor': '2ff481df',
  'chat.weather.clear': '5f351ea8',
  'chat.weather.cloudy': 'd4373e12',
  'chat.weather.rain': 'd5fd95ae',
  'chat.weather.storm': 'b742a11e',
  'chat.weather.fog': '1abc8790',
  'chat.weather.snow': 'b327b67b',
  'chat.weather.ashfall': '6c45397e',
  banter: 'f46928ee',
  'banter.work': 'd7bd0257',
  'banter.eat': '2cd4d0c0',
  'banter.shop': '4e4d4f0f',
  'banter.wander': '39761ed1',
  'banter.chat': 'aef21c59',
  'banter.hungry': '31f31090',
  'banter.tired': 'f57e6b37',
  'banter.sour': '14372ab5',
  'banter.weather.clear': 'b5ed1309',
  'banter.weather.rain': 'e3c34b2f',
  'banter.weather.fog': '8cca6c9a',
  'banter.weather.ashfall': 'c07d492e',
  'opinion.unaware': '0641251e',
  'opinion.doubt': 'de0a71fa',
  'opinion.explaining': '368aace1',
  'opinion.explaining.luck': '3e1476b7',
  'opinion.explaining.wounded': 'a8ab3f87',
  'opinion.explaining.gadget': 'a3812bdf',
  'opinion.explaining.cheat': 'fa2361a7',
  'opinion.explaining.misreport': 'b7fba135',
  'opinion.explaining.miracle': '4d6f82f9',
  'opinion.explaining.sorcery': 'c24c29f6',
  'opinion.explaining.conspiracy': '2553d696',
  'opinion.explaining.hidden_identity': '36926313',
  'opinion.explaining.bloodline': '92cfd6ba',
  'opinion.explaining.useful': '8783b407',
  'opinion.wavering': 'c18b00c8',
  'opinion.accepted': '3c06dbfc',
  'opinion.worship': '8444379c',
  'opinion.hostile': 'f181b814',
  'opinion.exploit': 'b4f239e5',
  'opinion.depend': '2654ac1c',
  'rumor.tell': '89841fe0',
  'rumor.none': 'c5c8f39a',
  bye: '4260a6a1',
  say: '5b0e90ea',
  'say.question': '666eb1a9',
  'say.hello': '8586b81b',
  'say.thanks': '2e21a269',
  'say.cold': 'f5d6818e',
  'say.warm': '3f4368e2',
  feat: '625f40ac',
  'feat.kill': '12d6035c',
  'feat.elite_kill': 'a2740c09',
  'feat.boss_kill': 'f3c6f496',
  'feat.heal': '6ba03279',
  'feat.rescue': '1eac775c',
  'feat.spell': 'afba033c',
  'feat.build': 'e6fe6164',
  'feat.destroy': 'f246e5f4',
  'feat.miracle': '1c2e70cb',
  'feat.duel': 'ea14c418',
  'feat.trade': '7f4ff332',
  'feat.appraise': 'c9aa305f',
  'rumor.when.0': 'a848765c',
  'rumor.when.1': 'ec0a7553',
  'rumor.when.2': '9523694c',
  'rumor.when.3': 'd496126a',
  'rumor.story': '356c1b7e',
  'rumor.expl.real': 'a813c6fc',
  'rumor.expl.luck': '949826e3',
  'rumor.expl.wounded': 'aae1ecaf',
  'rumor.expl.gadget': 'aec1cf7a',
  'rumor.expl.cheat': '18df37f0',
  'rumor.expl.misreport': '17cb5629',
  'rumor.expl.miracle': '0210d845',
  'rumor.expl.sorcery': 'a0ed8e6f',
  'rumor.expl.conspiracy': '8726beec',
  'rumor.expl.hidden_identity': 'ee620416',
  'rumor.expl.bloodline': '08b7a9ec',
  'rumor.expl.useful': 'dd63ac3a',
  'rumor.tpl.hero_legend': '228b1356',
  'rumor.tpl.demon_return': 'd9fea60f',
  'rumor.tpl.goddess': 'c353f6e9',
  'rumor.tpl.witch': 'b7ab1678',
  'rumor.tpl.noble_bastard': 'cf30f1bc',
  'rumor.tpl.ghost': 'fef3c3f0',
  'react.explain.luck': 'a7c72184',
  'react.explain.wounded': '8d37d044',
  'react.explain.gadget': '5db4db73',
  'react.explain.cheat': '3afb2851',
  'react.explain.misreport': 'cbab7caf',
  'react.explain.miracle': '5c5ec6fb',
  'react.explain.sorcery': '26fe36c9',
  'react.explain.conspiracy': 'c9c6ca55',
  'react.explain.hidden_identity': '62fbaded',
  'react.explain.bloodline': '4c5e1094',
  'react.explain.useful': '502f5c59',
  'react.switch': 'de29e8a3',
  'react.switch.cheat': 'c8a83fcc',
  'react.switch.hidden_identity': '845ef876',
  'react.switch.sorcery': 'cc0cfbbf',
  'react.switch.conspiracy': 'f795d99c',
  'react.wavering': 'f21ea5f0',
  'react.accept': 'aef27dfc',
  'react.believe': 'abdf6b5b',
  'react.hostile': 'eda2b508',
  'react.again': '805c0976',
  'react.again.luck': 'd230d022',
  'react.again.wounded': '5a497a9f',
  'react.again.miracle': '5176a714',
  'appraise.crystal': '2529e581',
  'appraise.crystal.again': 'c1a024ae',
  'appraise.clergy': '43650357',
};

export function validateDialogueContent(content: ContentMap): string[] {
  const problems: string[] = [];
  if (!(content.linePacks ?? []).some((p) => p.id === 'ln_common'))
    problems.push('line pack ln_common missing');
  problems.push(...legacyProblems(content));
  for (const [key, digest] of Object.entries(LEGACY_DIGESTS)) {
    const got = sliceDigest(legacyLines(content, key).map((l) => l.zh));
    if (got !== digest) problems.push(`legacy line key ${key}: its lines changed (${got})`);
  }
  for (const k of REQUIRED_KEYS)
    if (legacyLines(content, k).length === 0) problems.push(`legacy line key ${k} missing`);
  problems.push(...ruleSetProblems(content.intentLexicon, content.intentRules));
  problems.push(...topicProblems(content));
  problems.push(...prologueAnswerProblems(content.prologueAnswers, content.scenes));
  problems.push(
    ...reactionOptionProblems(
      content.reactionOptions,
      content.npcBrain ? content.npcBrain.reactions : undefined,
      (slot) => !!resolveSlot(content, '', slot, {}),
    ),
  );
  for (const r of content.reactionOptions ?? [])
    for (const o of r.options) {
      if (!o.when) continue;
      const bad = checkCondition(o.when);
      if (bad) problems.push(`reaction option ${r.id}.${o.id}: condition does not parse: ${bad}`);
      else
        for (const v of referencedVars(o.when))
          if (!defaultRegistry().resolve(v))
            problems.push(`reaction option ${r.id}.${o.id}: reads unregistered variable ${v}`);
    }
  problems.push(...commissionRuleProblems(content));
  // the per-clue refusals name lore rows and speakers (persons, companions, goddesses)
  if (content.lore)
    problems.push(
      ...ledgerRefusalProblems(
        content.ledgerRefusals,
        content.lore,
        new Set(
          [content.npcs, content.companions, content.sceneSpeakers, content.goddesses].flatMap(
            (rows) => (rows ?? []).map((r: { id: string }) => r.id),
          ),
        ),
      ),
    );
  return problems;
}

/** The request mapping and the leaders' menu name real templates, needs and variables. */
function commissionRuleProblems(content: ContentMap): string[] {
  const out: string[] = [];
  const rules = content.dialogueCommissions;
  if (!rules) return ['dialogueCommissions table missing'];
  const ids = content.commissions ? new Set(content.commissions.map((c) => c.id)) : null;
  for (const [need, list] of Object.entries(rules.requests.needs)) {
    if (!(NEED_KEYS as readonly string[]).includes(need)) out.push(`request need ${need} unknown`);
    for (const id of list ?? [])
      if (ids && !ids.has(id)) out.push(`request template ${id} unknown`);
  }
  if (!(rules.requests.cap > 0 && rules.requests.cap <= 1)) out.push('request cap must be 0 to 1');
  if (!defaultRegistry().resolve(rules.leaders.threat))
    out.push(`leader threat variable ${rules.leaders.threat} is not registered`);
  if (!(rules.leaders.weekday >= 1 && rules.leaders.weekday <= 7))
    out.push('leader weekday must be 1 to 7');
  return out;
}

const topicSchemas: TableSchema[] = topicsByFile.map(([file]) => ({
  table: 'topics',
  label: `话题图：${file}`,
  file,
  idField: 'id',
  fields: [
    { key: 'id', label: '编号', type: 'string', required: true },
    { key: 'category', label: '类别', type: 'string', required: true },
    { key: 'title', label: '菜单标题', type: 'string' },
    { key: 'scope', label: '范围', type: 'string', required: true },
    { key: 'owners', label: '本人', type: 'json' },
    { key: 'region', label: '地区', type: 'string' },
    { key: 'tier', label: '知识层级', type: 'string', required: true },
    { key: 'knowers', label: '知情者', type: 'json' },
    { key: 'requires', label: '解锁条件', type: 'string' },
    { key: 'trustMin', label: '信任下限', type: 'number' },
    { key: 'versionBy', label: '版本维度', type: 'string', required: true },
    { key: 'act', label: '起始幕', type: 'string', required: true },
    { key: 'until', label: '截止幕', type: 'string' },
    { key: 'locked', label: '解锁前处理', type: 'string' },
    { key: 'mis', label: '误导', type: 'json' },
    { key: 'aliases', label: '指称', type: 'json' },
    { key: 'keywords', label: '自由提问词', type: 'json' },
    { key: 'repeat', label: '重复', type: 'string', required: true },
    { key: 'after', label: '前置话题', type: 'json' },
    { key: 'unlocks', label: '聊完解锁', type: 'json' },
    { key: 'lockedBy', label: '各人的解锁前处理', type: 'json' },
    { key: 'introduced', label: '提起后才进菜单', type: 'boolean' },
    { key: 'interest', label: '吸引', type: 'json' },
    { key: 'clues', label: '台账条目', type: 'json' },
    { key: 'scene', label: '序章作答的过场选项', type: 'json' },
    { key: 'service', label: '服务角色', type: 'string' },
    { key: 'askOnly', label: '只经自由输入', type: 'boolean' },
    { key: 'trouble', label: '只在有烦心事时', type: 'boolean' },
  ],
}));

const ruleSchemas: TableSchema[] = [
  {
    table: 'ledgerRefusals',
    label: '台账线索的解锁前处理',
    file: 'dialogue/ledger_refusals.json',
    idField: 'clue',
    fields: [
      { key: 'clue', label: '台账条目', type: 'ref', refTable: 'lore', required: true },
      { key: 'by', label: '各人的处理', type: 'json', required: true },
      { key: 'default', label: '其余知情者', type: 'string' },
      { key: 'mis', label: '误导编号', type: 'string' },
    ],
  },
  {
    table: 'reactionOptions',
    label: '反应表各行的对话选项',
    file: 'dialogue/reaction_options.json',
    idField: 'id',
    fields: [
      { key: 'id', label: '反应行', type: 'string', required: true },
      { key: 'options', label: '选项', type: 'json', required: true },
    ],
  },
];

const schemas: TableSchema[] = byFile.map(([file, p]) => ({
  table: 'linePacks',
  label: `台词包：${p.id}`,
  file,
  idField: 'id',
  fields: [
    { key: 'id', label: '包', type: 'string', required: true },
    { key: 'speaker', label: '说话者', type: 'string' },
    { key: 'slots', label: '槽位', type: 'json', required: true },
    { key: 'acts', label: '按幕覆盖', type: 'json' },
  ],
}));

export const pack: ContentPack = {
  id: 'dialogue',
  tables: {
    linePacks: byFile.map(([, p]) => p),
    legacyLines: { keys: (legacyMap as unknown as LegacyLineMap).keys },
    intentLexicon: intentLexiconData as unknown as ContentMap['intentLexicon'],
    intentRules: intentRulesData as unknown as ContentMap['intentRules'],
    topics: topicsByFile.flatMap(([, f]) => f),
    topicCast: topicCastData as string[],
    prologueAnswers: prologueAnswersData as unknown as PrologueAnswers,
    reactionOptions: reactionOptionsData as unknown as ReactionOptionsRow[],
    dialogueCommissions: commissionsData as unknown as CommissionRules,
    ledgerRefusals: ledgerRefusalsData as unknown as LedgerRefusalRow[],
  },
  schemas: [...schemas, ...topicSchemas, ...ruleSchemas],
  validate: validateDialogueContent,
};
