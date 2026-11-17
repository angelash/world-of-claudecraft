# `content_base_rebase_01` 批次报告

批次的机读记录在 `data/_batches/content_base_rebase_01.json`（七步命令与校验结果）。本文是人读摘要。

## 1. 新增 ID（4）

| ID | 名 | 阶 | `value`（铜） | `tags` | 说明 |
| --- | --- | --- | --- | --- | --- |
| `crystal_small_raw` | 小晶（灰） | T2 | 75 | `["tainted"]` | 列入 `economy_config.illegalItems` |
| `crystal_medium_raw` | 中晶（灰） | T3 | 1,000 | `["tainted"]` | 同上 |
| `crystal_large_raw` | 大晶（灰） | T4 | 25,000 | `["tainted"]` | 同上 |
| `crystal_king_raw` | 王晶（灰） | T5 | 1,000,000 | `["tainted"]` | 同上；价格超出 T5 材料带是设计既定口径（王晶同时是货币，总纲 7.7） |

## 2. 改动 ID：价格（C45，28 项）

价格按装备 3.9、消耗品 1.4、采集 3.4、3.7、3.9 的定值；来源列写目录出处。

| ID | 名 | 旧 `value` | 新 `value` | 来源 |
| --- | --- | --- | --- | --- |
| `rusty_shortsword` | 锈蚀短剑 | 10 | 8 | 装备 3.9 |
| `recruit_longsword` | 新兵长剑 | 180 | 150 | 装备 3.9 |
| `hunters_bow` | 猎弓 | 200 | 225 | 装备 3.9 |
| `oak_staff` | 橡木法杖 | 160 | 225 | 装备 3.9 |
| `grey_fang_dagger` | 灰牙匕首 | 420 | 300 | 装备 3.9 |
| `ash_cleaver` | 灰烬劈刀 | 900 | 3,000 | 装备 3.9 |
| `crystal_spine_blade` | 晶脊刃 | 4,200 | 75,000 | 装备 3.9 |
| `red_fang_gauntlet` | 红牙铁拳套 | 28,000 | 2,400,000（器价） | 装备 3.9（名器） |
| `dented_round_shield` | 坑洼圆盾 | 120 | 90 | 装备 3.9 |
| `worn_leather_vest` | 旧皮甲 | 60 | 120 | 装备 3.9 |
| `wolfhide_boots` | 狼皮靴 | 90 | 72 | 装备 3.9 |
| `spider_silk_gloves` | 蛛丝手套 | 260 | 108 | 装备 3.9 |
| `bone_helm` | 骸骨盔 | 320 | 288 | 装备 3.9 |
| `raven_quill_charm` | 鸦羽护符 | 600 | 900 | 装备 3.9 |
| `black_ridge_mantle` | 黑脊熊皮 | 1,500 | 6,000 | 装备 3.9 |
| `sewer_waders` | 水道长靴 | 1,100 | 2,400 | 装备 3.9 |
| `cultist_robe` | 门徒会长袍 | 1,800 | 18,000 | 装备 3.9 |
| `ashen_plate` | 灰烬骑士铠 | 7,200 | 960,000 | 装备 3.9 |
| `drake_scale_leggings` | 亚龙鳞腿甲 | 9,800 | 600,000 | 装备 3.9 |
| `minor_healing_potion` | 次级治疗药水 | 25 | 50 | 消耗品 1.4 |
| `healing_potion` | 治疗药水 | 100 | 500 | 消耗品 1.4 |
| `greater_healing_potion` | 强效治疗药水 | 400 | 2,000 | 消耗品 1.4 |
| `minor_mana_potion` | 次级灵力药水 | 40 | 80 | 消耗品 1.4 |
| `mana_potion` | 灵力药水 | 160 | 3,000 | 消耗品 1.4 |
| `stoneskin_draught` | 石肤药剂 | 150 | 400 | 消耗品 1.4 |
| `drake_scale` | 亚龙鳞 | 60 | 3,000（30 银） | 采集 3.4 |
| `dian_shard` | 澱晶碎片 | 15 | 10（收购价） | 采集 3.7 |
| `sludge_glob` | 腐泥 | 2 | 1 | 采集 3.9 |

未改价（已与目录一致，逐条核对过）：`spring_herb`（30）、`ash_spirits`（60）、`door_charm`（200）、`wool`（8，经济物品）。

## 3. 改动 ID：掉落（C46，9 项）

见 `batch_card.md`"掉落改动逐条"表。摘要：8 只整个等级区间在 10 级以上的普通或异名者魔物把 `dian_shard`
换成本阶的未净炼灰晶（`crystal_small_raw` 到 `crystal_king_raw`，按图鉴 1.3 的等级到阶对照），`black_ridge`
额外把异名物掉落改为保底（100%）。掉率与数量字段不变，只换 `itemId`。

## 4. 改动 ID：旗标（C91，0 条数据改动，重命名表核对）

誓光之门（`vocation_paladin`）的钥在 `data/doors/doors.json` 已读规范名 `a3_vow_kept_reed_bridge`；旧写法
`a3_danger_door_vow` 登记在 `data/registry/renames.json`（`{ since: 1, kind: "flag", from: "a3_danger_door_vow",
to: "a3_vow_kept_reed_bridge" }`）与 `data/registry/vars.json` 的 `aliases`，旧存档载入时按此改名
（`tests/save_renames.test.ts`、`tests/content_base_rebase.test.ts` 核对）。`danger_doors_opened` 由
`src/systems/doors/index.ts` 按门的 `danger` 字段计数，与旗标拼法无关：誓光之门没有 `danger` 字段，从未被计入。
注册表第 11 节的旧行已删去（本条已解决，不再需要导入时修正）。

## 5. 文档：核对与定稿（C30、C40、C41、X16）

| 条目 | 结论 | 数据与文档落点 |
| --- | --- | --- |
| C30 | `faceless_king` 等级 60、`partySync.offset` 0 已由 PK-M0-29 的成长与节奏重标落定（18.2 节），本批次核对一致，未改倍率（仍为 3 / 0.6，待 PK-M1-42） | `combat/monsters.json`；迷宫与首领目录 1735 行、总纲 174 行改为指向 18.2 节 |
| C40 | `spring_herb` 已带 `tags: ["herb", "material"]`，核对通过 | `combat/items.json` |
| C41 | `wool` 名"羊毛"已是规范名；本批次补 `desc`："牧场剪下的羊毛，织坊的原料。" | `economy/items.json` |
| X16 | `dian_dreg` 显示名"澱渣团"，核对通过 | `combat/monsters.json` |

## 6. 文档：人物 ID 别名表补全

[实现约定][impl]第 3 节的别名表原只列 4 组，补齐到与[注册表][reg]第 7.1 节、`data/registry/vars.json` 的
`keyAliases.npc` 一致的 8 组：新增 `martha`（别名 `marsha`）、`luchen`（别名 `lu`、`lu_chen`）、`vick`（别名
`vik`）、`gunnhild_deephammer`（别名 `gunnhild`）。`tests/content_base_rebase.test.ts` 核对本表、注册表与
重命名表三处一致。

## 7. 文档：Hoarmane、Moon Cistern 英文代号核对（D-082）

素材提示词库（`assets/prompts/specs/`）里残留的旧英文代号 Greymane、Moonwell 改为决策采用的显示名
Hoarmane（部族：Hoarmane Tribe；猎团：Hoarmane Hunt）与 Moon Cistern：`buildings.json`、`icons_units.json`、
`props.json`（2 处）、`units.json`（4 处）共 8 处英文提示词改写；带这两个词的物品、兵种与建筑 ID（例
`eq_greymane_hunter_hood`、`art_prop_moonwell`）不改，按 D-082"内部编号不变"。`tools/content/names/known_works.json`
加入 `Dragonspine`、`Greymane`、`Moonwell` 三个旧代号，防止它们作为显示名回潮（V10 校验器会命中）。

## 8. V1 到 V10 结果

```
node tools/content/validate.ts --warnings
ok   V1  schema             0 errors, 0 warnings
ok   V2  references         0 errors, 0 warnings
ok   V3  namespaces         0 errors, 0 warnings
ok   V4  variable registry  0 errors, 339 warnings（既有的"无读取方"与"无文本键"警告，与本批次无关）
ok   V5  reveal ledger      0 errors, 9 warnings（既有警告，与本批次无关）
ok   V6  numeric bands      0 errors, 9 warnings（经验预算警告，与本批次无关；本批次改动的全部价格落在校验器判定的公式区间内，零价格警告）
ok   V7  asset references   0 errors, 3 warnings（既有警告，与本批次无关）
ok   V8  text               0 errors, 0 warnings
ok   V9  reachability       0 errors, 9 warnings（既有警告，与本批次无关）
ok   V10 proper nouns       0 errors, 3 warnings（既有、已审例外，与本批次无关）
all validators green
```

`node tools/content/validate.ts --only V6 --milestone M1`：绿（0 errors, 0 warnings）。

## 9. 经济校验

`data/economy/config.json` 的 `illegalItems` 新增四档灰晶；`src/systems/economy/market.ts` 的 `isIllegal`
与自动玩家 `src/game/autoplay/goods.ts` 的 `keptItems` 核对：灰晶既不可卖给商人也不进自动玩家的出售清单
（`tests/content_base_rebase.test.ts`）。价格公式校验见上 V6。

## 10. 世界哈希

价格与掉落改动会改变世界哈希，这是预期结果（CLAUDE.md"价格变化可能改变世界哈希（预期，记录它）"）。
同一改动前的内核代码、同一种子（20261115）、同一命令序列下，重标前后的哈希对照（`node .local/pk30/hash_run.mjs`
的一次性脚本，未提交，见 `progress.md`）：

| 幕 | tick | 重标前 `worldHash` | 重标后 `worldHash` | 说明 |
| --- | --- | --- | --- | --- |
| act1 | 138 | `512a8757` | `512a8757` | 一致（序章无战斗，价格与掉落未触发） |
| act2 | 558,750 | `c593b2d0` | `4a18197c` | 不同（预期：价格与掉落已生效） |
| act3 | 1,231,747 | `c89b75ae` | `1aeb6e50` | 不同（预期） |

两次跑法的玩家金钱在第三幕末分别为 804 与 803（1 铜之差，来自 `black_ridge` 与 `sewer_sludge` 等掉落结构改变后
一次随机序列的分叉），死亡数（66）与路线走向一致，说明价格与掉落改动没有改变路线可通过性，只改变了世界状态本身。

## 11. 测试

```
npx vitest run --config vitest.config.ts tests/content_base_rebase.test.ts tests/economy.test.ts \
  tests/save_container.test.ts tests/save_ironman.test.ts tests/save_migration.test.ts \
  tests/save_recovery.test.ts tests/save_renames.test.ts tests/save_versions.test.ts \
  tests/content_validation.test.ts tests/i18n_ui_strings.test.ts tests/combat.test.ts \
  tests/quests.test.ts tests/doors.test.ts tests/party.test.ts tests/prompts_library.test.ts \
  tests/content_id_guard.test.ts tests/editor_batch.test.ts tests/registry.test.ts \
  tests/client_assets.test.ts tests/i18n_kernel_guard.test.ts
# Test Files  20 passed (20)
# Tests  405 passed (405)
```

`npm run typecheck`：根 `tsconfig.json` 干净；`desktop/tsconfig.json` 干净（`tests/time_skip.test.ts` 的 7 处报错
与本批次无关，属并行开发的跳时批次，见第 12 节基线问题）。

`node tools/registry/build.ts --check`：current（710 规范名，111 族，38 任务 ID）。
`node tools/i18n/extract_content.ts --check`：current（5,661 个键，48 张表）。
`node tools/i18n/check.ts`：0 finding。

`npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts`：
通过（1 文件、1 测试；release 结局路线序章到终章回归完整跑通，耗时约 1,459 秒）。

## 12. 基线问题（与本批次无关）

| 命令 | 失败 | 依据 |
| --- | --- | --- |
| `npm run typecheck` | `tests/time_skip.test.ts` 7 处类型错误（`TextRef` 的 `key`、`reason` 属性） | 该文件不在本批次改动范围；属并行的 PK-M0-31 跳时内核批次的未完成测试 |

## 13. 决策与偏离

- 装备、消耗品与材料目录的表格不是可机读抽取的逐行记录（叙述性定价说明），本批次的"抽取"步骤只用于四档新增
  灰晶（`gathering.crystals` 映射），其余 28 处价格改动与 9 处掉落改动按 `release_engineering.md` 7.1"抽不出
  的列留给作者手填"的原则，作为手填的局部记录（id 加改动字段）直接进批次的 parts，不新增通用抽取规则。
- 未新建 `rcp_refine_crystal` 等去处配方：采集目录第 10 节已把这些配方列为"去处"栏，归属各自的配方批次，本批次
  只管价格层。
