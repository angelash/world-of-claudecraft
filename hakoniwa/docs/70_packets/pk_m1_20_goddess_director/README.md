# PK-M1-20 内置 AI：女神大脑与导演（别名：内置 AI 第 8、9 步）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-20` 内置 AI：女神大脑与导演 |
| 状态 | 进行中（建议主会话改为已完成，依据见 `verification_matrix.md`；遗留转去的包见 `progress.md` 第 3 节） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-20` |
| 形态 | 大包的量级按小包三件写（单会话完成，范围由计划包行与内置 AI 第 19 节第 8、9 步写定） |
| 工作流 | AI |
| 量级 | 5 代理人日，0.5 用户人日 |
| 依赖 | PK-M1-18（已完成：活世界的度量口径）；PK-M1-46（已完成：纷争运行器写 `dispute.<任务>.escalation`）；PK-M1-47（已完成：公会内核以 `ev_` 编号向导演提供动态事件）；PK-M1-50（已完成：迷宫三种处置的事件 `dungeon.collapsed`、`dungeon.purified` 与端口 `addActivity`） |
| 立项日期 | 2026-11-18 |

## 1. 目标

女神有了完整的规则大脑：人格权重表与各幕计划表、黎明规划、第一幕谋划、反应表与按幕的尊名唤醒、写定神行 DB-A0 与 DB-A1、梅尔卡的硬币与供品往来账；导演有六项输入的张力计、按幕拍的目标区间、八行规则表、十二项菜单与台账条目的交付；修正项多了七个通道；第一幕女神可见干预（活世界第 8 项）在无模型档达阈值，两张规则表的覆盖报告没有死行。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 修正项新通道 `route_state`、`weather`、`health`、`hazard_rate`、`door_resonance`、`resource_tag`、`loan_terms`，各自的总上限；定性值写在 `tag`；操作命令拒收未知通道 | `src/systems/modifiers/index.ts` | 女神目录第 1.4 节；经济第 7.2、7.3 节 |
| 2 | 人格权重表（计分权重、十个人格维度、各幕对玩家的兴趣、动作权重 W、人格乘数）与第一幕计划表（菜单、计划支出、期末保留、谋划） | `data/goddess/brain/personas.json`、`config.json`；`src/systems/goddess/brain/persona.ts` | 内置 AI 第 8.2 节；女神目录第 5.0 到 5.6 节 |
| 3 | 黎明规划：第 8.3 节的打分（命名得分项）加目录的 W × G × M，每日至多三项、贪心扣神力重算；超出本幕已过时段的预算份额减分（软），本幕计划支出用完即停、期末保留不动（硬，模型的提案同样受约束）；动作分散在白天执行 | `brain/score.ts`、`brain/planner.ts`、`brain/budget.ts`、`planning.ts` | 内置 AI 第 8.3 节 |
| 4 | 第一幕谋划（照看羊群、第一位客人、魔物季的盐与药、远观、描第一笔、接住）：采纳得分、谋划步 +4、步骤停滞的重规划与中止、反应型步骤 | `data/goddess/brain/schemes.json`、`brain/schemes.ts` | 内置 AI 第 8.4 节；女神目录第 5 节 |
| 5 | 反应表（第一幕可触发的十八行）：尊名的唤醒与按幕回应、唤醒超额与同一念诵者当日再念的人格化兜底、目击、硬币、供品、欠账、天启、封印阶段、开门、被禁之名、察觉别人的梦 | `data/goddess/brain/reactions.json`、`brain/reactions.ts`、`wake.ts` | 内置 AI 第 8.7 节；女神目录第 6、10 节 |
| 6 | 女神的台词：从她的台词包按幕取句，没有本幕句子时用她的无言征兆 | `brain/lines.ts`；`data/dialogue/lines/ln_{eluen,valda,merca,sylvie,moira}.json`（锚定句） | 内置 AI 第 8.8 节；台词目录第 1.6 节 |
| 7 | 写定神行 DB-A0-01 到 04（观察序章旗标）与 DB-A1-01 到 08（硬币初用的降影、写定巧合、托梦欧拉、兽潮前兆、门口的梦、鉴定传闻入档、鹿泉兽引、盐价）：窗口、+5、窗口中点的预写兜底、必达在窗口末落地 | `data/goddess/beats.json`、`src/systems/goddess/beats.ts` | 女神目录第 4.1 节 |
| 8 | 梅尔卡的硬币与供品：供分（档位、新奇衰减、硬币条款的兑换比）、往来账与赊账额度、每日一次回礼、利息、逾期与结清；命令 `goddess.coin` | `data/goddess/offerings.json`、`src/systems/goddess/offerings.ts` | 女神目录第 9 节；序章第 4.9 节 |
| 9 | 新动作：凝视、降影、授予加护、大神迹、兽引、预言、特产发现、借贷担保、商路事件、门纹共鸣；神谕与托梦的对象；按市场的物价键；密度上限；神迹账记来源与可察觉 | `data/goddess/actions.json`、`src/systems/goddess/actions.ts` | 女神目录第 1.3、2 节 |
| 10 | 导演：张力计六项输入（读纷争升级）、按幕拍的区间与休整、规则表八行、十二项菜单与 13.3 打分、交付台账条目、第一幕巧合限额、喜剧背景、节拍推迟的请求、动态事件按缺口方向 | `src/systems/director/`（`tension.ts`、`rules.ts`、`menu.ts`、`deliveries.ts`、`coverage.ts`、`index.ts`）；`data/goddess/director_{menu,rules,deliveries,acts}.json` | 内置 AI 第 13 节；女神 GM 第 8 节；女神目录第 2.8 节 |
| 11 | 迷宫三种处置的地区澱：毁升一档一季后每季回落三成，净扣核压三成，养每季降一成；地区一周内升档时其迷宫活性 +20 | `src/systems/goddess/region.ts` | 女神 GM 第 4.5 节；迷宫目录第 1.2 节 |
| 12 | 规则覆盖报告与活世界第 8 项的度量 | `src/systems/director/coverage.ts`、`src/systems/goddess/metrics.ts`、`tests/goddess_alive_harness.ts` | 内置 AI 第 14.2、15、17 节 |
| 13 | 测试与验收 | `tests/modifiers_channels.test.ts`、`goddess_brain.test.ts`、`goddess_beats.test.ts`、`goddess_reactions.test.ts`、`goddess_region.test.ts`、`director_menu.test.ts`、`goddess_alive.test.ts`、`tests/playthrough/goddess_alive_1` 到 `_4.playthrough.test.ts`（`goddess_alive_group.ts`） | 内置 AI 第 17 节 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 第二幕起的谋划、越约指标与写定窗口、敌对定额表、察觉子流、回声累积器、试炼 | PK-M2-11 |
| 2 | 女神台词包的扩写（每位 250 句）与女神目录第一幕其余动作、反应行数据 | 台词目录的内容批次、PK-M1-34 |
| 3 | 序章的场景与女神的序章台词、面试问题 | PK-M1-27（本包只经旗标观察） |
| 4 | 新通道的读取方（商队风险读 `route_state`、城建读 `health`、`hazard_rate` 等） | 见 `progress.md` 第 3 节的请求 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| [builtin_ai.md](../../40_design/systems/builtin_ai.md) 第 8、13、14.2、17、19 节 | 本包的规则 |
| [goddess_gm.md](../../40_design/systems/goddess_gm.md) 第 4.5、6、8、10 节 | 地区澱、唤醒、导演、供品 |
| [catalog_goddess_interventions.md](../../40_design/content/catalog_goddess_interventions.md) 第 1 到 6、9、10、17 节 | 数据与验收 |
| [act1_borderstone.md](../../30_story/arcs/act1_borderstone.md) 第 7.5、8.1、9.1 节 | 第一幕的巧合、前兆、梦 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性 | 女神大脑走 `goddess.brain.<女神>`、`goddess.plan`、`goddess.lines.<女神>`、`goddess.detect`；导演不抽签（同分按编号） | `tests/architecture.test.ts`；`goddess_brain.test.ts` 与 `goddess_alive.test.ts` 的同种子同结果 |
| 系统不写内容 ID | 女神、地图、人物、菜单项、动作都从数据来 | `tests/content_id_guard.test.ts` |
| 文本 | 系统文本是键；女神的话在台词包；源码无中文字面量 | `node tools/i18n/check.ts`、`tests/i18n_kernel_guard.test.ts` |
| 修正项 | 一切效果经注册修正项（D-013），新通道各有总上限 | `tests/modifiers_channels.test.ts` |

## 5.1 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/goddess/brain/`、`beats.ts`、`offerings.ts`、`region.ts`、`metrics.ts`；`src/systems/director/`（`rules.ts`、`menu.ts`、`deliveries.ts`、`coverage.ts`）；`data/goddess/brain/`、`beats.json`、`offerings.json`、`director_rules.json`、`director_deliveries.json`、`director_acts.json`；上表测试文件；本目录 |
| 本包修改 | `src/systems/goddess/`（`index.ts`、`actions.ts`、`planning.ts`、`wake.ts`、`types.ts`）；`src/systems/director/`（`index.ts`、`tension.ts`）；`src/systems/modifiers/index.ts`；`src/content/packs/goddess.ts`；`data/goddess/actions.json`、`director_menu.json`；`locales/zh-Hans/sys_goddess.json`、`sys_modifiers.json`；`tests/goddess.test.ts`、`tests/director.test.ts` |
| 越界改动（写进 `progress.md`） | `data/dialogue/lines/ln_{eluen,valda,merca,sylvie,moira}.json`（新增，锚定句）；`tools/content/validators/namespace.ts`（`div_` 的表）；`tests/lines.test.ts`（女神包自有反应种类）；`tests/guild_events.test.ts`（第一幕巧合与安全营地的新口径）；`data/README.md`（女神行）；`docs/40_design/systems/builtin_ai.md`、`catalog_goddess_interventions.md`（回写） |

## 6. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。

## 7. 验证命令

```
npx vitest run --config vitest.config.ts tests/modifiers_channels.test.ts tests/goddess_brain.test.ts tests/goddess_beats.test.ts tests/goddess_reactions.test.ts tests/goddess_region.test.ts tests/director_menu.test.ts tests/goddess_alive.test.ts tests/goddess.test.ts tests/director.test.ts tests/modifiers.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npm test
npx vitest run --config vitest.playthrough.config.ts tests/playthrough/goddess_alive_1.playthrough.test.ts tests/playthrough/goddess_alive_2.playthrough.test.ts tests/playthrough/goddess_alive_3.playthrough.test.ts tests/playthrough/goddess_alive_4.playthrough.test.ts
npm run playthrough
```

## 8. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起子代理） | 必派 | 一次贡献结束 |

## 9. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、数据、测试、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；本包验证命令绿 |

## 10. 需用户决定

见 `progress.md` 第 4 节。
