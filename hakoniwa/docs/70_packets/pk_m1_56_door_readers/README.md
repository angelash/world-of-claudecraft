# PK-M1-56 门效果读取方第一批（别名：`doors_readers_01`）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-56` 门效果读取方第一批 |
| 状态 | 进行中（内核侧读取方、数据与测试已落地；界面接线与其他系统的配合见 `progress.md` 第 3 节的请求） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-56` |
| 形态 | 系统包，三件套 |
| 工作流 | 系统（千门） |
| 量级 | 3 代理人日，0.2 用户人日 |
| 依赖 | PK-M1-14（已完成，千门第一批）；PK-M1-31（第一幕物品，`lb_otherworld_menu`）与 PK-M1-32（第一幕门，`craft_cooking`）的数据须先于本包提交 |
| 立项日期 | 2026-11-19 |

## 1. 目标

让门开出来的效果真正有人读：前世之门的开局差异（序章第 2.2 节）、识才之门的潜质行、旧存档补授已开之门后加的效果、回廊门卡的五档危险与代价预览与互斥对象与"去哪里找"、借形之门在北泉净化、门作为身份暴露的来源，以及女神写入的门纹共鸣通道。
读取方一律是千门系统里的纯查询、命令或事件处理，功能旗标为假时什么也不读出，没有这些门的玩家行为与现状一致。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 前世之门的读取方：算盘的进价区间、夜灯的夜间视野、白衣的包扎（即现有技能 `sk_door_firstaid`）、笔记的传闻来源标签；灶火的庖厨之门层一开局即开（不计门阶值、不松动、不计开门数）与《异界菜单》 | `src/systems/doors/readers.ts`、`effects.ts`（新效果 `door`）；`data/doors/doors.json` 的八条前世之门；`data/doors/readers.json` | 序章 2.2；千门 14 末行；门目录 2.1 第 2 行 |
| 2 | 识才之门的潜质行：鉴定读出潜质（认知系统已接）加注视旗标 `npc.<人>.potential_seen` 的写入 | `src/systems/doors/talent.ts`（订阅 `cognition.appraised`） | 一幕 5.3；注册表 `npc.<人>.potential_seen` 一行 |
| 3 | 旧存档补授：已开之门的技能、功能与随门开的门，存档里缺的补一次，记在门切片的 `granted`，永不补第二次 | `src/systems/doors/effects.ts` 的 `catchUpDoors`，千门每 10 tick 与跳时各跑一次 | PK-M1-26 进度第 137 行；PK-M1-32 第 3 节 |
| 4 | 门视图字段：五档危险（`dangerBand`、`dangerLevel`）、代价预览（`costPreview` 的淤塞与门疲增量）、互斥对象（`exclusiveWith`，只列已显影的）、钥的"去哪里找"（`keys[].link`，玩家接过那条任务才给） | `src/systems/doors/view.ts`、`costs.ts`、`keys.ts`；门数据加 `dangerBand`（52 扇）、`openCost`、钥的 `link` | 界面 9.2、9.3、9.5；门目录 1.7、6 |
| 5 | 借形之门净化北泉：站在数据写明的泉里，每个幕周一次，把数据写明的镇内澱度变量减数据写明的量 | `src/systems/doors/purify.ts`（命令 `doors.purify`、查询 `purifyOffer`）；`data/doors/readers.json` 的 `springPurify` | 一幕 7.2；PK-M1-51 进度第 79 行 |
| 6 | 身份暴露的门来源：玩家倒下时身体走进门、复苏时从门里出来，各发一次 `identity.exposed`（`identity_door`） | `src/systems/doors/exposure.ts` | 内置 AI 5.6；PK-M1-18 进度第 3 节第 6 条 |
| 7 | `door_resonance` 通道的读取：某张图上门纹共鸣的档数 | `src/systems/doors/readers.ts` 的 `resonanceSteps` | 女神干预目录 `div_janu_resonance`；PK-M1-20 进度第 135 行 |
| 8 | 校验：危险档必填、开门代价范围、钥链接指向任务且只在顶层钥、`door` 效果不指向自己或会再送门的门、读取方记录的功能与数字与地点 | `src/content/packs/doors.ts` | 千门 21.6 的同一套写法 |
| 9 | 测试 | `tests/doors_readers.test.ts`（新增）；`tests/doors_harness.ts`（测试门默认 `dangerBand: 'none'`） | 计划包行的验收 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 交易窗口、迷雾与光照、传闻簿与任务日志、北泉的交互提示、回廊门卡对新字段的渲染 | 客户端（见 `progress.md` 第 3 节请求 1） |
| 2 | 白衣"脱战后"才能包扎的限制（技能缺"仅脱战"字段） | 战斗（请求 2） |
| 3 | 门内庭院进出的身份暴露（命令在城建的庭院模块里） | 城建庭院（请求 4，附准确的改动） |
| 4 | 扳手、路标、讲台三扇前世之门的读取方，瑕之门的纹感 `doorsense` | 门效果读取方第二批（`progress.md` 第 4 节） |
| 5 | 破门之门开门 +20 淤塞的数据（本包只改前世、借形、渊契三类门记录） | 破门之门所在的千门后续包 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| [prologue_antechamber.md](../../30_story/arcs/prologue_antechamber.md) 第 2.2 节 | 八种前世的开局差异 |
| [act1_borderstone.md](../../30_story/arcs/act1_borderstone.md) 第 5.3、7.2 节 | 十人的潜质；北泉净化每周 -10 |
| [thousand_doors.md](../../40_design/systems/thousand_doors.md) 第 6.2、7、9、14、19、21.5 节 | 开门代价、效果类型、互斥、灶火的庖厨之门、门卡需求 |
| [catalog_doors.md](../../40_design/content/catalog_doors.md) 第 1.7、6 节 | 危险五档的定义与逐门取值 |
| [ux_and_onboarding.md](../../40_design/ux_and_onboarding.md) 第 9.2、9.3、9.5 节 | 门卡字段与 `CorridorAdapter` 需新增的数据 |
| [builtin_ai.md](../../40_design/systems/builtin_ai.md) 第 5.6 节 | `identity_door` 的定义与反应表 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 无效果时不变 | 功能旗标为假时读取方返回空；没有 `openCost` 的门开门不动淤塞与门疲；新游戏的补授什么也不补 | `tests/doors_readers.test.ts` 末条与各条的"没有门"分支 |
| 不写内容 ID | 泉、变量、周旗标、功能名、数字都在 `data/doors/readers.json`；系统代码按数据查 | `tests/content_id_guard.test.ts` |
| 不编数字 | 文档给的数照用（-10、每周一次、+10 淤塞、第一幕）；文档没给的（进价区间宽度、夜视半径）写成数据字段并列为用户待定 | `progress.md` 第 4 节 |
| 确定性 | 不抽随机；补授按内容顺序；净化按幕周键 | 测试复跑 |
| 旧门不动 | 门数据只改前世、借形、渊契三类记录，另给全部 52 扇加一行 `dangerBand`；`boss.seg_oneeye_duel.defeated` 原样保留 | 与改动前的副本逐行比对：只多 52 行危险档，删改只落在这十扇门 |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/doors/{readers,purify,exposure,talent}.ts`、`data/doors/readers.json`、`tests/doors_readers.test.ts`、本目录 |
| 本包修改 | `src/systems/doors/{types,effects,index,view,keys,costs}.ts`、`src/content/packs/doors.ts`、`data/doors/doors.json`、`locales/zh-Hans/sys_doors.json`、`tests/doors_harness.ts` |
| 越界的最小改动 | `locales/zh-Hans/ui.json`（4 个功能标签）、`docs/40_design/world_state_registry.md`（三行补取值或读写方） |
| 工具重生成 | `data/registry/vars.json`、`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。

## 8. 验证命令

```
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.config.ts tests/doors*.test.ts tests/client_feature_labels.test.ts
npx vitest run --config vitest.config.ts tests/content_id_guard.test.ts tests/combat.test.ts tests/cognition.test.ts tests/npc.test.ts tests/npc_brain.test.ts tests/client_corridor_tracker.test.ts tests/save_migration.test.ts tests/ailments.test.ts tests/ailments_sediment_reads.test.ts tests/client_tutorial.test.ts tests/records_save.test.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起会话，只读） | 必派 | 包行每一项的落地、补授的"只补一次"、门卡字段与互斥结算的一致 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 查询 `priceBand`、`nightSightRadius`、`rumorSourceTag`、`purifyOffer`、`resonanceSteps`；门视图的 `dangerBand`、`dangerLevel`、`costPreview`、`exclusiveWith`、`keys[].link`；命令 `doors.purify` | 客户端 | 交易窗口、夜间视野、传闻簿与任务日志、北泉交互、回廊门卡接上并在界面测试里出现 |
| 事件 `identity.exposed`（`identity_door`）的死亡与复苏来源 | NPC 大脑 | 目击者按反应表反应；同一 tick 的事迹与身份暴露合并（请求 5） |
| 旗标 `npc.<人>.potential_seen` 的写入方 | 教程、城建的人才与任命 | `tut_a1_talent` 在任意一人的潜质被看见时完成 |
