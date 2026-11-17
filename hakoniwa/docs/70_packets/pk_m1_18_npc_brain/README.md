# PK-M1-18 内置 AI：NPC 大脑与社会（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-18` 内置 AI：NPC 大脑与社会 |
| 状态 | 进行中（建议主会话改为已完成，依据见 `verification_matrix.md`；遗留转去的包见 `progress.md`） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-18` |
| 形态 | 大包的量级按小包三件写（单会话完成，范围已由计划包行与内置 AI 第 19 节第 5、6 步写定） |
| 工作流 | AI |
| 量级 | 6 代理人日，0.5 用户人日 |
| 依赖 | PK-M0-25（已完成：`src/core/brain/` 原语与台词选择器）；PK-M0-26（已完成：意图分类器）；PK-M1-46（已完成：纷争运行器的接缝 `openDecisions`、`decisionMenu`、`dispute.decision_opened`） |
| 别名 | 无 |
| 立项日期 | 2026-11-17 |

## 1. 目标

有名 NPC 有了完整的规则大脑：九项需求与心情驱动的五层状态机，通用与功能角色动作库，目标、主动搭话与社交互动，传话、记忆、日记与认知驱动的台词，对玩家事迹与身份暴露的反应，纷争决策点按人设作答；第一幕"活着"的可观测指标（[builtin_ai.md](../../40_design/systems/builtin_ai.md) 第 14.2 节）在无模型档达阈值。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据（文档与节号） |
| --- | --- | --- | --- |
| 1 | 九项需求（饥饿、精力、社交、信仰、钱、安全、面子、职责、心安）的衰减、事件变化与基线回落；心情六档（惧、怒、忧、倦、喜、平） | `src/systems/npc/needs.ts`、`src/systems/npc/brain/mood.ts` | 内置 AI 第 3.3 节 |
| 2 | 五层状态机的根（剧本与跟随、紧急、目标、职责、需求闩、主动、社交、日程）与每层的解释记录；L1、L2 错峰节拍（每 200、600 tick）与 L3 整点 | `src/systems/npc/brain/root.ts`、`step.ts`、`state.ts` | 第 2.4、2.6、3.1、16 节 |
| 3 | 通用动作库（需求层与紧急层的效用动作，人格乘数取最大不连乘） | `data/npc/brain/actions.json`、`src/systems/npc/brain/library.ts`、`src/systems/npc/traits.ts`、`src/systems/npc/trait_words.json` | 第 2.1、4.1 节 |
| 4 | 十五种功能角色的行为树与角色动作（共享 `BtRunner`，状态随存档）；每个有名 NPC 一到三个角色 | `data/npc/brain/roles.json`、`src/systems/npc/brain/roles.ts`、`role_effects.ts`、`predicates.ts`；`data/npc/personas.json` 的 `roles` | 第 4.2、4.3 节；内容圣经第 9.2 节 |
| 5 | 目标与追求（每隔几日去某处做某事，促发、完成、放弃条件） | `data/npc/personas.json` 的 `pursuits`；`root.ts` 的 `duePursuit` | 第 3.2 节 |
| 6 | 主动搭话（理由：道谢、崇拜、警告、核实传闻、委托、熟人；一人一日一次、一图一小时三次、两次被无视停一周；玩家忙时不搭话） | `src/systems/npc/brain/initiative.ts` | 第 3.4 节 |
| 7 | 社交互动的封闭集合（闲聊、传闲话、求助、邀请、送礼、争吵、和解、告密、交易）与门槛、后果 | `src/systems/npc/brain/social.ts`、`src/systems/npc/chat.ts` | 第 5.1 节 |
| 8 | 传话决策（守秘者只对信任 70 以上的人讲；按对方兴趣挑传闻）；千门提示注入真实传闻池；邻镇的路上传播 | `src/systems/cognition/rumor.ts`、`spread.ts`、`rumor_text.ts` | 第 5.2 节；千门第 18.3 节 |
| 9 | 记忆模板与重要度、日记的打分与心情收尾 | `src/systems/npc/brain/memory_rules.ts`、`src/systems/npc/diary.ts` | 第 5.3、5.4 节 |
| 10 | 认知驱动的台词（转移在视线内当场说，画外留作下次开场白）、信任档与时段的问候、记忆与日记的提起 | `src/systems/npc/brain/reactions.ts`、`src/systems/dialogue/replies.ts`、`speak.ts`、`lines/trust.ts` | 第 5.7、7.4 节 |
| 11 | 反应表（`firstMatch`，十一行）与身份暴露的种类；喜剧节流 | `data/npc/brain/reactions.json`、`reactions.ts`、`src/systems/cognition/witness.ts`、`comedy.ts` | 第 5.6 节；认知第 4.5 节 |
| 12 | 纷争决策点：人设驱动的效用、`npc.decision_point` 请求（订阅 `dispute.decision_opened`，以 `disputes.decide` 作答，无模型时由大脑的选择兜底）、决策写进当事人与各方的记忆（订阅 `dispute.decided`） | `src/systems/npc/brain/disputes.ts` | 第 5.8 节；NPC 社会第 9 节 |
| 13 | 任务接缝：跟随玩家（`npc.follow`、救人目标）、`stealth.detected`（`npc.watch`）、跨图 `npc.goto`（看得见时走过城门，看不见时瞬移，一小时走不到就瞬移） | `src/systems/npc/brain/quest_orders.ts`、`src/systems/npc/routes.ts`、`src/systems/quests/objectives.ts` | 任务与事件第 3 节 |
| 14 | 缺位变量：`npc.<人>.captured`（剧情写，被捕者离开地图）、`.hostile`（认知敌视或好感低于 -60 的镜像）、`.at_spring`（有名将领死后 7 日）；千门替钥读它们 | `src/systems/npc/brain/absence.ts`、`src/systems/doors/keys.ts`；[world_state_registry.md](../../40_design/world_state_registry.md) | 千门第 5.4、10.1.1 节 |
| 15 | 台词历史进存档（问候与反应 7 日、吠叫 3 日加同地窗口）；意图分类器的人格特质与角色匹配读词典的 `traits`、`roles` 表 | `src/systems/dialogue/types.ts`、`speak.ts`、`intent/respond.ts` | 第 7.4 节；PK-M0-26 遗留 |
| 16 | `BtRunner` 的状态快照与恢复（装饰器历史与运行中的节点随存档，读档后 `once` 不重复触发） | `src/core/brain/bt.ts`（`snapshot`、`restore`） | 第 18 节；PK-M0-25 遗留 |
| 17 | 测试与验收：需求、心情、状态机、动作库、社交、传话、记忆与日记、反应、存读；认知弧与喜剧节流；"活着"指标 20 个种子乘 12 游戏周；纷争 20 个种子 | `tests/npc_brain.test.ts`、`tests/npc_society.test.ts`、`tests/npc_cognition_arcs.test.ts`、`tests/npc_alive.test.ts`、`tests/npc_alive_harness.ts`、`tests/npc_disputes_brain.ts`、`tests/playthrough/npc_alive_*.playthrough.test.ts`、`tests/playthrough/npc_disputes.playthrough.test.ts` | 第 14.2、17 节 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 首领与官员经意图菜单发布委托、居民求助转请托 | 后续包（主会话已确认不在本包，见 `progress.md` 第 3 节） |
| 2 | 女神的可见干预（指标 8） | PK-M1-20 |
| 3 | 官员自主（指标 11，第一幕没有自治度 50 以上的聚落） | PK-M2 城建官员 |
| 4 | 队内闲聊（指标 12） | PK-M1-21 |
| 5 | 市场补货与断货（指标 10 的经济系统一侧） | 经济系统的后续包（`progress.md` 第 3 节） |
| 6 | 身份暴露的其余五种事件源（门、客人、门纹、威压、对号）与反应表各行的"其他后果"（指控进度、审判预兆、请愿队列、服务价格、守秘） | 见 `progress.md` 第 3 节 |
| 7 | 话题图、拒答与转移 | PK-M1-19 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 系统接缝、确定性、文本、AI 请求约定 |
| [builtin_ai.md](../../40_design/systems/builtin_ai.md) 第 2 到 5、7、14、16 到 19 节 | 本包的全部规则 |
| [npc_society_ai.md](../../40_design/systems/npc_society_ai.md) 第 9 节；[reputation_and_cognition.md](../../40_design/systems/reputation_and_cognition.md) 第 3.7、4.5 节 | 决策点接口；认知转移与喜剧节流 |
| [thousand_doors.md](../../40_design/systems/thousand_doors.md) 第 5.4、10.1.1、18.3 节 | 缺位变量、泉畔期、提示的传闻渠道 |
| `src/core/brain/`、`src/systems/npc/`、`src/systems/cognition/`、`src/systems/dialogue/lines/`、`src/systems/disputes/index.ts` | 原语、现有作息与认知、台词选择器、纷争接缝 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | 每个大脑只走命名流 `npc.brain.<人>`，台词走 `dialogue.lines.<人>`；不用墙钟；存档的键序与不存档跑一致 | `tests/architecture.test.ts`；`tests/npc_brain.test.ts` 的存读世界哈希用例 |
| 系统不写内容 ID | 人物、地点、角色、条件全从数据来 | `tests/content_id_guard.test.ts` |
| 注册表 | 大脑写的旗标全部登记；追求条件读的变量过注册表 | `src/game/flag_guard.ts`、`validateNpcContent`、`node tools/content/validate.ts` |
| 文本 | 系统文本是键；NPC 台词在台词包；源码无中文字面量 | `node tools/i18n/check.ts`、`tests/i18n_kernel_guard.test.ts` |
| 每 tick 开销 | 逐 tick 的维护只扫排好序的缓存 ID 表；重活在节拍与整点 | `npc_alive_group` 的实时占比断言（全镇模拟不超过实时 2%） |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/npc/brain/`、`src/systems/npc/traits.ts`、`wallet.ts`、`routes.ts`、`src/systems/cognition/spread.ts`、`src/systems/dialogue/speak.ts`、`src/systems/dialogue/lines/trust.ts`、`data/npc/brain/`、上表测试文件、本目录 |
| 本包修改 | `src/systems/npc/`（其余文件）、`src/systems/cognition/`（`index.ts`、`witness.ts`、`comedy.ts`、`rumor.ts`、`rumor_text.ts`）、`src/systems/dialogue/`（`index.ts`、`replies.ts`、`session.ts`、`types.ts`、`lines/index.ts`、`intent/respond.ts`）、`src/content/packs/npc.ts`、`data/npc/personas.json`、`data/dialogue/lines/ln_common.json`、`locales/zh-Hans/sys_npc.json`、`sys_cognition.json`、[world_state_registry.md](../../40_design/world_state_registry.md)、[builtin_ai.md](../../40_design/systems/builtin_ai.md)（回写）；工具重生成 `data/registry/vars.json`、`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` |
| 越界改动（已写进 `progress.md`） | `src/core/brain/bt.ts`、`src/systems/quests/objectives.ts`、`src/systems/doors/keys.ts`、`tests/lines.test.ts`、`tests/npc.test.ts`、`tests/intent_classifier.test.ts` |
| 不得修改 | `src/systems/disputes/`（未改）；`src/systems/combat/`、`src/systems/inventory/`、`src/client/` 等他包正在改的文件 |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。

## 8. 验证命令

```
npx vitest run --config vitest.config.ts tests/npc_brain.test.ts tests/npc_society.test.ts tests/npc_cognition_arcs.test.ts tests/npc_alive.test.ts
npx vitest run --config vitest.config.ts tests/npc.test.ts tests/cognition.test.ts tests/dialogue.test.ts tests/intent_classifier.test.ts tests/intent_corpus.test.ts tests/lines.test.ts tests/brain.test.ts tests/brain_inspector.test.ts tests/disputes.test.ts tests/doors.test.ts tests/doors_keys.test.ts tests/doors_hints.test.ts tests/quests.test.ts tests/architecture.test.ts tests/content_id_guard.test.ts tests/i18n_kernel_guard.test.ts tests/i18n_ui_guard.test.ts tests/registry.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.playthrough.config.ts tests/playthrough/npc_alive_1.playthrough.test.ts tests/playthrough/npc_alive_2.playthrough.test.ts tests/playthrough/npc_alive_3.playthrough.test.ts tests/playthrough/npc_alive_4.playthrough.test.ts tests/playthrough/npc_disputes.playthrough.test.ts
npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts tests/playthrough/rule_merca.playthrough.test.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起子代理） | 必派 | 一次贡献结束 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、数据、测试、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；本包验证命令绿 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 计划包行写有"首领与官员经意图菜单发布委托、居民求助转请托"，主会话已确认它是后续包的事 | 推荐主会话把这一句从 PK-M1-18 的范围移到承接的包行（例如 PK-M1-19 或公会的后续包） | 不阻塞 |
| 2 | 指标 8、10、11、12 不由 NPC 大脑决定 | 推荐验收栏写明"本包负责指标 1 到 7、9 与两项反指标；8 随 PK-M1-20，10 随经济系统，11 随 PK-M2 城建官员，12 随 PK-M1-21" | 不阻塞 |
