# `content_base_rebase_01` 批次卡

| 项 | 内容 |
| --- | --- |
| 批次名 | `content_base_rebase_01` |
| 范围 | 已有物品价格重标（C45）；整个等级区间在 10 级以上、归图鉴管的魔物的掉落口径（C46）；誓光之门标记的旧写法登记重命名（C91）；`spring_herb`（C40）、`wool`（C41）、`dian_dreg`（X16）核对 |
| 依赖批次 | 无（独立于 `content_act1_items_01`、`content_base_progression_01`） |
| 要改的系统字段 | `items.value`、`items.tags`、`items.desc`；`monsters.loot`；`economy_config.illegalItems` |
| 抽检比例 | 全量：19 件装备、6 件消耗品、3 件材料、4 件新增灰晶、9 只魔物的掉落逐条核对（见 `verification_matrix.md` 第 1 节与 `tests/content_base_rebase.test.ts`） |
| 需用户决定条目 | 无 |
| 验收条目 | 经济校验、V1 到 V10 与通关回归通过；批次报告列出全部改动 ID（计划包行） |

## 来源映射

| 映射 | 目录与节 | 目标 |
| --- | --- | --- |
| `gathering.crystals`（新增，本批次） | `catalog_gathering_crafting.md` 3.7 | `combat/items.json`（四档未净炼灰晶） |
| manual | `catalog_equipment.md` 3.9 | `combat/items.json`（19 件装备的 `value`） |
| manual | `catalog_consumables_magitools.md` 1.4 | `combat/items.json`（6 件消耗品的 `value`） |
| manual | `catalog_gathering_crafting.md` 3.4、3.7、3.9 | `combat/items.json`（`drake_scale`、`dian_shard`、`sludge_glob` 的 `value`） |
| manual | `catalog_gathering_crafting.md` 3.5 | `economy/items.json`（`wool` 的 `desc`） |
| manual | `catalog_bestiary.md` 1.3、12.2 第 11 条 | `combat/monsters.json`（8 只魔物的 `loot`） |
| manual | `catalog_bestiary.md` 第 5 节、`content_bible.md` 5.4 | `combat/monsters.json`（`black_ridge` 的 `loot`） |

"manual" 映射：这些目录的表格是叙述性定价说明（价格公式应用、已有数据对照），不是可机读抽取的逐行记录；按
`release_engineering.md` 7.1"抽不出的列留给作者手填，不猜"的原则，本批次按目录人工核对后直写 `value`、`desc`、`loot`
三个字段的改动（批次记录的 `mapping: "manual"` 如实标注）。

## 掉落改动逐条（C46）

| 魔物 ID | 等级 | 层次 | 旧掉落 | 新掉落 | 依据 |
| --- | --- | --- | --- | --- | --- |
| `black_ridge` | 11（异名者） | 图鉴第 5 节 | `black_ridge_mantle` 50%；`dian_shard` 100%（2 到 4） | `black_ridge_mantle` 保底（100%）；`crystal_medium_raw` 100%（2 到 4，升一档） | 异名者保底异名物、澱晶升一档（总纲 5.4） |
| `dian_spirit` | 11 到 13 | 图鉴 4.1 | `dian_shard` 60% | `crystal_small_raw` 60% | 图鉴 1.3：内容等级 10 到 19 为 T2，掉晶2 |
| `sewer_sludge` | 16 到 18 | 图鉴 4.1 | `sludge_glob` 60%；`dian_shard` 30% | `sludge_glob` 60%；`crystal_small_raw` 30% | 同上 |
| `crystal_centipede_young` | 25 到 27 | 图鉴 4.1 | `dian_shard` 60%（1 到 2） | `crystal_medium_raw` 60%（1 到 2） | 图鉴 1.3：20 到 34 为 T3，掉晶3 |
| `disciple_cultist` | 25 到 27 | 图鉴 4.1 | `cultist_robe` 5%；`mana_potion` 10%；`dian_shard` 40% | 同前两项；`crystal_medium_raw` 40% | 同上 |
| `waste_ghoul` | 30 到 34 | 图鉴 4.2 | `bone_shard` 60%；`dian_shard` 50% | `bone_shard` 60%；`crystal_medium_raw` 50% | 同上 |
| `ash_elemental` | 36 到 40 | 图鉴 4.2 | `ash_essence` 50%；`dian_shard` 60% | `ash_essence` 50%；`crystal_large_raw` 60% | 图鉴 1.3：35 到 49 为 T4，掉晶4 |
| `disciple_guide` | 55 到 57 | 图鉴 4.2 | `dian_shard` 100%（2 到 4） | `crystal_king_raw` 100%（2 到 4） | 图鉴 1.3：50 到 60 为 T5，掉晶5 |
| `faceless_soldier` | 55 到 58 | 图鉴 4.2 | `dian_shard` 80%（1 到 3） | `crystal_king_raw` 80%（1 到 3） | 同上 |

**不改**：`waste_wraith`（8 到 11，跨 T1、T2，取等级区间低端 8 的 T1，仍掉 `dian_shard`，图鉴 1.3）；
`crystal_mother`、`dian_colossus`、`crystal_centipede`、`faceless_king`（首领层次，归迷宫与首领目录批次）；
`vero`、`seg_oneeye`、`sasha`（人物目录登记的对手战，不在本文管）。
