# PK-M1-46 纷争链运行器与第一幕自走（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-46` 纷争链运行器与第一幕自走 |
| 状态 | 进行中（建议主会话改为已完成，依据见 `verification_matrix.md`） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-46` |
| 形态 | 大包的量级按小包三件写（单会话完成，范围已由计划包行写定） |
| 工作流 | 系统 |
| 量级 | 4 代理人日，0.3 用户人日 |
| 依赖 | PK-M0-25（已完成：`src/core/brain/` 的效用与解释记录）；PK-M1-45（幕时钟，与 PK-M1-58 同一工作区，待主会话提交）；PK-M1-58（任务模型的纷争链种类与按周默认推进，同上） |
| 别名 | 无 |
| 立项日期 | 2026-11-17 |

## 1. 目标

纷争链有了运行器：阶段、时钟、决策点（点名的人物从菜单里选，内置效用兜底）、结局结算写进注册表变量；第一幕三条 Must 纷争（税与匪、魔女审判、林地之争）在玩家不介入时走到合法结局，玩家的介入能改变结局。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据（文档与节号） |
| --- | --- | --- | --- |
| 1 | 纷争运行数据的类型：阶段、决策点与选项（效用四项、写定、违背必须保持）、结算时机、结局（主结局、可叠加、默认、促成者） | `src/systems/disputes/types.ts` | 任务与事件第 3.6 节；第一幕第 4 节通用规则 |
| 2 | 决策点效用（立场 0.35、关系 0.25、安全与利益 0.20、价值观 0.15、违背必须保持 -100）；合法菜单（条件、写定项裁剪）；兜底选取（同分按 ID、带内加权抽取，命名流 `disputes.<纷争>`）；解释记录 | `src/systems/disputes/utility.ts`（`decisionUtility`、`legalOptions`、`fallbackPick`、`decisionTrace`） | 内置 AI 第 5.8、2.1、2.6 节 |
| 3 | 结局选择：首个成立的主结局，否则默认结局；可叠加结局；促成者 | `src/systems/disputes/outcomes.ts`（`selectOutcomes`、`legalEndings`） | 第一幕第 4.1 节"结局（可叠加）"；任务目录（前）第 5.3 节 |
| 4 | 运行器：阶段（`dispute.<纷争>.stage`、`.escalation`）、决策点的开启（到周、窗内条件、`after` 接续、`unless` 作废与连带作废）、到点兜底、选择者作答、结算（到周、条件、幕结束强制）与写入（`.choice.<决策点>`、`.ending`、`.by`） | `src/systems/disputes/runner.ts`（`stepDisputes`、`applyDecision`、`chooseOption`） | NPC 社会第 9 节；任务与事件第 2.4 节 |
| 5 | 系统：阶段序 82（在任务系统的幕时钟之后），逐 tick 有事才走一步，跳时每个整点一步；命令 `disputes.decide`；NPC 大脑的接缝 `openDecisions`、`decisionMenu` 与事件 `dispute.decision_opened` | `src/systems/disputes/index.ts` | 实现约定第 6、7 节 |
| 6 | 第一幕三条 Must 纷争的链任务（`dispute` 种类，按周默认发展，玩家促成即完成并发链结算经验，否则由他人先完成） | `data/disputes/act1_chains.json` | 第一幕第 4.1、4.2、4.4 节；任务目录（前）第 5.3 节 |
| 7 | 三条纷争的运行数据：阶段、决策点（薇罗、莫斯、伊莎、卡西安、博罗、葛恩）、结算与结局写入 | `data/disputes/act1.json` | 同上；第一幕第 12 节 |
| 8 | 内容包与校验（链任务、人物、幕时钟、名段与长度、默认结局唯一、菜单永不为空、`after` 只能接前面的点） | `src/content/packs/disputes.ts`（`disputeProblems`） | 发行工程第 7.4 节 V1 |
| 9 | 注册表：族 `dispute.<任务>.stage`、`.escalation`、`.choice.<决策点>`、`.ending`、`.by`；节点产物标记 `a1_owen_escorted`、`a1_logger_saved`、`a1_nick_bridge`、`a1_eastslope_expelled`；重生成 `data/registry/vars.json` | [world_state_registry.md](../../40_design/world_state_registry.md) 第 8.7 节 | 注册表第 9.2 节 |
| 10 | 系统文本 | `locales/zh-Hans/sys_disputes.json` | 实现约定第 8 节 |
| 11 | 测试：效用、结局选择、运行器机制、存读、内容校验、20 个种子的无人自走、玩家介入改变结局、真实游戏全系统一跑 | `tests/disputes.test.ts` | 计划包行验收栏；路线图第 5.3 节 VS-08 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 其余六条第一幕纷争、全部节点任务与台词（A1-D01.a 到 A1-D04.h 的节点任务，写本包读取的节点产物变量） | PK-M1-33 |
| 2 | 人设驱动的决策点效用（立场、关系、加护冲动从人设卡与关系系统算）与 `npc.decision_point` 模型请求 | PK-M1-18 |
| 3 | 兽潮之夜各人的行动判定、伤亡与归功（读本包写的结局与选择） | PK-M1-52 |
| 4 | 第二、三幕纷争的自走与首领 HTN | PK-M2-12 |
| 5 | 日志与界面里的纷争显示（阶段、"本周发生了什么"） | PK-M1-22、PK-M1-57 |
| 6 | 导演张力计读 `dispute.<任务>.escalation` | PK-M1-20 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 系统接缝、确定性、文本、AI 请求约定 |
| [act1_borderstone.md](../../30_story/arcs/act1_borderstone.md) 第 1.2、4.1、4.2、4.4、8.4、12 节 | 三条纷争的事件链、介入节点、结局与带入第二幕的变量 |
| [catalog_quests_acts1_3.md](../../40_design/content/catalog_quests_acts1_3.md) 第 1、5.3 节 | 链与节点的编号、链内变量、结局条件、链结算经验、无模型兜底 |
| [npc_society_ai.md](../../40_design/systems/npc_society_ai.md) 第 9 节；[builtin_ai.md](../../40_design/systems/builtin_ai.md) 第 5.8 节 | 决策点的接口与效用式 |
| [quests_and_events.md](../../40_design/systems/quests_and_events.md) 第 2.4、3.5、3.6 节 | 结算顺序、由他人先完成、事件链字段 |
| `src/systems/quests/disputes.ts`、`src/systems/quests/act_clock.ts`、`src/core/brain/utility.ts` | 按周默认推进、幕时钟、效用原语 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | 只用条件与世界的旗标；抽取只走命名流 `disputes.<纷争>`；不用墙钟 | `tests/architecture.test.ts` |
| 系统不写内容 ID | 纷争、人物、结局全从数据来 | `tests/content_id_guard.test.ts` |
| 注册表 | 运行器写的旗标全部登记；数据的读写过注册表规则 | `src/game/flag_guard.ts`、`node tools/content/validate.ts` |
| 文本 | 拒绝原因是 `TextRef`；内容文字由抽取工具生成键 | `node tools/i18n/check.ts`、`tests/i18n_kernel_guard.test.ts` |
| 不卡链 | 每条纷争有唯一默认结局；每个决策点至少一个无条件选项；到点兜底；幕结束强制结算 | `disputeProblems`、`tests/disputes.test.ts` |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/disputes/`（`types.ts`、`utility.ts`、`outcomes.ts`、`runner.ts`、`index.ts`）、`src/content/packs/disputes.ts`、`data/disputes/act1.json`、`data/disputes/act1_chains.json`、`locales/zh-Hans/sys_disputes.json`、`tests/disputes.test.ts`、本目录 |
| 本包修改 | `docs/40_design/world_state_registry.md` 第 8.7 节（新行）与第 8.8.2 节 `a1_cassian_report`、`a1_trial_brawl`、`a1_isa_will_testify` 三行（写入者与取值）；`data/registry/vars.json`、`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json`（工具重生成） |
| 越界改动（已写进 `progress.md`） | `tools/registry/parse.ts`（系统名单加 `disputes`）；`tools/content/validators/namespace.ts`（`q_` 前缀可住进 `disputes` 表）；`src/content/registry_refs.ts`、`src/editor/quests/flag_index.ts`（条件字段加 `breaks`）；`tests/quest_model.test.ts`（三处小改，见 `progress.md`） |
| 不得修改 | `data/quests/quests.json`；`src/systems/quests/**`（未改）；他包正在改的文件 |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。

## 8. 验证命令

```
npx vitest run --config vitest.config.ts tests/disputes.test.ts
npx vitest run --config vitest.config.ts tests/quests.test.ts tests/act_clock.test.ts tests/quest_model.test.ts tests/brain.test.ts tests/architecture.test.ts tests/content_id_guard.test.ts tests/i18n_kernel_guard.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts
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
| 1 | 计划包行的范围写"第一幕九条纷争在玩家不介入时走到合法结局"，本包交付三条 Must 纷争的运行数据与运行器，其余六条随 PK-M1-33 的内容导入 | 推荐主会话改计划第 4.2 节两行：PK-M1-46 的范围改为"第一幕三条 Must 纷争"，PK-M1-33 的范围加"其余六条纷争的运行数据（`data/disputes/`）"；不改则 PK-M1-46 的验收与 VS-08 的"每条 Must 纷争"仍一致，只是范围栏与交付不符 | 不阻塞 |
