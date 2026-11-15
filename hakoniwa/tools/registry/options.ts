// The choices tools/registry/build.ts passes to the parser that the registry document
// leaves open: 7.6 rows whose alias spellings cannot be aligned mechanically, and the
// quest data ids section 6.2 leaves to the quest catalogues. Kept apart from build.ts so
// tests import them without running the command.

import type { ParseOptions, ValueAliasFixes } from './parse';

export const OUT_PATH = 'data/registry/vars.json';

/**
 * Section 7.6 rows whose alias list does not line up with the canonical values one to
 * one (more spellings than values, or an English spelling between two Chinese ones).
 * Keyed like the table: a name, or a family with `.*`.
 */
export const VALUE_ALIAS_FIXES: ValueAliasFixes = {
  a5_purge_route: { 众生: 'people', gods: 'god', 神: 'god', 溃决: 'collapse' },
  a6_returned_doors: { 全部: 'all', partial: 'some', 部分: 'some' },
  // "序章数据里的十句原文" and "四句原文": the spellings data/scenes/prologue.json wrote
  p_courtyard_object: {
    一盏台灯: 'lamp',
    一只空食盆: 'empty_bowl',
    一把等候椅: 'waiting_chair',
    那把旧椅子: 'old_chair',
    '空院，只有一棵没开花的树': 'bare_tree',
    一扇开着的窗: 'open_window',
    一只旧茶杯: 'old_cup',
    一条旧围巾: 'old_scarf',
    一封没寄出的信: 'unsent_letter',
    一张空白信纸: 'blank_paper',
  },
  p_last_words: {
    '我会回来的。': 'back',
    '你们会后悔的。': 'regret',
    '……谢谢你的硬币。': 'thanks',
    '（什么都不说）': 'silent',
  },
};

/**
 * Data ids section 6.2 leaves to the quest catalogues ("编号以任务目录（后）为准"). The
 * acts 5 and 6 numbers and the conclave and revelation numbers come from the cutscene
 * catalogue (catalog_cutscenes.md: the act 5 list, A4-M13, A4-M14, A6-M12); a data quest
 * that covers several design quests takes the last one's number (section 6.1). The
 * founding, feast and versions quests keep their numbers until the acts 4 to 6 catalogue
 * publishes theirs.
 */
export const QUEST_ID_SUPPLEMENT: Record<string, string> = {
  a4_m01_nation: 'q_a4_m01_nation',
  a4_m02_feast: 'q_a4_m02_feast',
  a4_m03_versions: 'q_a4_m03_versions',
  a4_m04_conclave: 'q_a4_m13_conclave',
  a4_m05_revelation: 'q_a4_m14_revelation',
  a5_m01_born: 'q_a5_m03_born',
  a5_m02_route: 'q_a5_m08_route',
  a5_m03_final: 'q_a5_m11_final',
  a5_m04_trial: 'q_a5_m12_trial',
  a6_m01_court: 'q_a6_m12_court',
};

/** The options build.ts and the freshness test hand to parseRegistry. */
export const PARSE_OPTIONS: ParseOptions = {
  valueAliasFixes: VALUE_ALIAS_FIXES,
  questIds: QUEST_ID_SUPPLEMENT,
};
