# PK-M1-28 第一幕人物与人设卡（别名：内容批次 `content_act1_personas_01`）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-28` 第一幕人物与人设卡 |
| 状态 | 进行中（建议主会话改为已完成，依据见 `verification_matrix.md`；遗留转去的包见 `progress.md` 第 3 节） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-28` |
| 形态 | 内容包，按小包三件写（范围由计划包行与 [slice_gap_audit.md](../../60_production/slice_gap_audit.md) 第 1 节两行写定） |
| 工作流 | 内容 |
| 量级 | 3 代理人日，1 用户人日 |
| 依赖 | PK-M0-27、PK-M0-28；PK-M1-18（已完成：人设卡结构、角色、追求）；PK-M1-19（已完成：话题图，第一幕话题的主人与知情者） |
| 并行包 | PK-M1-29（接本包）、PK-M1-30（战斗模板改名 `seg_oneeye_duel`）、PK-M1-33、PK-M1-34、PK-M1-52 |
| 立项日期 | 2026-11-18 |

## 1. 目标

第一幕的全部有名人物都有人设卡：41 名有台词包的人物（含夜羽、阿什、瑟格、乌尔夫、克努特、卡斯）与 3 名系统补位人物（弗里茨、莲娜、薇尔玛），每人有地图、住处、日程、一到三个功能角色、知识层级、关系种子与台词包编号 `ln_<人物 ID>`；门纹孩子诺伊与苔丝带实体标签 `door_mark`；夜羽与阿什的身体由同伴名册与战斗的固定存在生成，NPC 系统只保留心智与信任（`trust.yeyu` 起始 40）；17 个第一幕居民模板 `tpl_` 落成数据并在第一幕地图上生成居民（边石镇、折桥驿、荒原）；猎户、伐木工与矿工的日程跨图。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 新人设卡 9 张：`yeyu`、`ash`、`seg_oneeye`、`ulf_lange`、`knut_naumann`、`kas_ropebridge`、`fritz_kolb`、`lene_mahler`、`wilma_ascher` | `data/npc/personas.json` | [人物目录（洛萨）](../../40_design/content/catalog_characters_lotha.md) 第 2.1、3.1、3.4、3.6 节；[角色设定集](../../30_story/characters.md) 第 3.1、3.9 节；[第一幕](../../30_story/arcs/act1_borderstone.md) 第 2.5、3 节 |
| 2 | 已有 35 张第一幕卡的审计：角色码全部与目录一致；补"建"的潜质 8 人；诺伊、苔丝加 `door_mark`；薇罗、莫斯加对瑟格的关系种子 | 同上 | 目录第 2.1、2.5 节；[战斗与职能](../../40_design/systems/combat_and_classes.md) 第 10.8 节（追门） |
| 3 | 人设卡字段 `body`（`fixture`、`companion`）：身体归别的系统时 NPC 系统不生成实体，心智、信任旗标与对话状态照常 | `src/systems/npc/types.ts`、`spawn.ts`；`src/content/packs/npc.ts` | 目录第 2.1 节（夜羽归同伴、阿什是战斗的固定存在）；[实现约定](../../50_tech/implementation_conventions.md) 第 3 节 |
| 4 | 17 个居民模板：档位、等级、阶层、知识层级、日程、传闻夸大系数、潜质概率、凡人不信参数，`placements` 写各图人数、住处、干活处；居民 ID `res_<模板>_<序号>` 让台词回退链取到 `ln_tpl_<模板>` | `data/npc/residents.json`；`src/systems/npc/templates.ts`（新）、`spawn.ts`、`types.ts`；`src/systems/dialogue/topics/talk.ts`（居民的知识层级） | 目录第 6 节；[台词目录](../../40_design/content/catalog_dialogue_lines.md) 第 1.2 节；[台词目录第一幕分册](../../40_design/content/catalog_dialogue_lines_act1.md) 第 6 节 |
| 5 | 跨图日程：猎户 5 到 11 点在 `forest_edge:hunter_camp`；伐木工白天在 `forest_edge:logging_site`；矿工 6 到 17 点在 `borderstone_north:mine_camp`；走私者夜里在 `borderstone_north:ash_road_head`；新日程模板 9 个 | `data/npc/schedules.json` | [地图简报](../../40_design/world/map_briefs.md) 第 1.10 节与 A1、A2、A6 驻留行 |
| 6 | 校验：人设卡 `body`、模板行的字段与分布、分布的地图与地点与日程；单测只合并部分 pack 时，图集里"已建"而未合并的地图按信任处理（全量内容合并全部已建地图，planned 的地图照常报错）；引用表三行 | `src/content/packs/npc.ts`；`src/content/references.ts` | [发行工程](../../50_tech/release_engineering.md) 第 7.4 节 V1、V2 |
| 7 | 话题的"场外演员"名单清空（五人都有卡了） | `data/dialogue/topic_cast.json` | PK-M1-19 `progress.md` |
| 8 | 测试 | `tests/npc_act1_cast.test.ts`（新）；`tests/npc.test.ts`、`tests/content_id_guard.test.ts`（改） | |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 台词包、话题台词 | PK-M1-29 |
| 2 | 战斗模板 `seg_oneeye` 改名 `seg_oneeye_duel` 与引用 | PK-M1-30（已落在工作区） |
| 3 | 有名凡人的澱化死亡（PK-M1-15 的请求后半） | 已由现有链路覆盖：`src/systems/party/exposure.ts` 的 `onCrystalDue` 收尾有名人物，NPC 系统的 `entity.died` 写 `npc.<id>.dead`（`progress.md` 第 3 节第 1 行） |
| 4 | L4 居民具名化读模板的潜质与凡人不信参数 | 内置 AI 的 M2 调优 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| [catalog_characters_lotha.md](../../40_design/content/catalog_characters_lotha.md) 第 1.7、2.1、2.5、3.1、3.4、3.6、6 节 | 本包的全部人物与模板 |
| [act1_borderstone.md](../../30_story/arcs/act1_borderstone.md) 第 2、3 节 | 第一幕人物表与地点 |
| [map_briefs.md](../../40_design/world/map_briefs.md) 第 1.10 节与 A1、A2、A6、折桥驿、旧哨村的驻留行 | 跨图日程与驻留 |
| `docs/70_packets/pk_m1_18_npc_brain/`、`pk_m1_19_topics_dialogue/` | 人设卡结构、话题的主人 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 系统不写内容 ID | 新字段与模板分布全在数据里 | `tests/content_id_guard.test.ts` |
| 确定性 | 居民生成仍走 `npc.residents` 一条流：模板先按 ID 排序，再逐个分布、逐人抽签；同种子同内容结果相同。新增模板会改变排在它后面的模板的抽签结果（`tpl_` 排在 `wb_` 之前），存档与回放样本随内容一起更新 | `tests/npc.test.ts` 的同种子哈希用例 |
| 台账 | 人设卡的玩家可见字段（名、种族、职业、潜质、介绍、口头禅）过泄露扫描；秘密只在私密字段 | V5 |
| 文本 | 内容文字由工具抽取 | `node tools/i18n/check.ts` |

## 6. 文件范围

见 `progress.md` 第 2 节的改动表（含越界改动与共享文件的逐段说明）。

## 7. 验证命令

```
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.config.ts tests/npc_act1_cast.test.ts tests/npc.test.ts tests/npc_brain.test.ts tests/world_mechanics.test.ts tests/content_id_guard.test.ts tests/dialogue_topics.test.ts
```

## 8. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起子代理） | 必派 | 一次贡献结束 |

## 9. 需用户决定

见 `progress.md` 第 4 节。
