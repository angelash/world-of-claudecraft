# `content_act1_abilities_01` 批次卡

| 项 | 内容 |
| --- | --- |
| 批次名 | `content_act1_abilities_01` |
| 范围 | [技能目录][abl]第 3.3 节（`aur_ember_door`）、第 4.5 节（巨像残意的模板与三项技能）、第 7.3 节（`aur_st_downed_weak`）的导入；同批落地第 2、3 节的自有编号换号（就地改名，登记重命名表第 2 版，不经暂存） |
| 依赖批次 | 无（换号前的数据是第一轮数据加 `content_base_rebase_01`） |
| 要改的系统字段 | 新行：`auras`、`abilities`、`monsters` 三表；换号：`abilities.id`、`abilities.effects[].aura`、`abilities.requires.targetLacksAura`、`auras.id`、两表的 `name`（目录改名的行）、`classes.abilities[].id`、`items.use.ability`、`monsters.abilities[]`、`monsters.mechanics.{enrage,ramp}.aura`、`monsters.mechanics.passives[]`、`monsters.mechanics.phases[].abilities[]`、`doors.effects[].abilities[]`、`doors.effects[].aura`、`companions.avoid[]` |
| 抽检比例 | 全量：`tests/own_ability_ids.test.ts` 把目录第 2、3.2 节的 207 行逐行对数据的 ID 与显示名、对重命名表第 2 版逐条对照 |
| 需用户决定条目 | 数值重算的归属（包 `README.md` 第 11 节），不阻塞 |
| 验收条目 | V3 无前缀 ID 零命中；V10 主工程技能显示名零命中；通关回归通过（计划包行） |

## 来源映射

| 映射 | 目录与节 | 目标 |
| --- | --- | --- |
| `abilities.equipment_auras`（新增） | 技能目录 3.3 | `combat/auras.json`：`aur_ember_door`（"数据字段"栏的 `path: value` 直接映射，作者只补描述） |
| `abilities.fiend_templates`（新增） | 技能目录 4.5 | `combat/monsters.json`：`fiend_colossus_remnant` |
| `abilities.fiend_skills`（新增） | 技能目录 4.5 | `combat/abilities.json`：`sk_lok_summonremnant`、`sk_mon_remnantbar`、`sk_mon_remnantquake` |
| `abilities.state_auras_death`（新增） | 技能目录 7.3 | `combat/auras.json`：只取 `aur_st_downed_weak`（另两行是换号而来，已在数据里） |
| 换号（就地，不是映射） | 技能目录 2、3.2 | 上表"要改的系统字段"；旧 ID 进 `data/registry/renames.json` 第 2 版（`ability` 123 条、`aura` 84 条） |

换号用临时脚本完成：一个按路径跟踪的 JSON 词法器只改上表字段位置上的字符串，保留手排格式；改完与"同一映射作用于解析后的数据"
逐文件做结构比对，一致才写回。脚本不进仓库，做法记在 `progress.md`。

[abl]: ../../40_design/content/catalog_abilities_talents.md
