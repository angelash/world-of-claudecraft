# PK-M0-26 意图分类器与大脑检查器（别名：内置 AI 第 19 节第 3、4 步）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M0-26` 意图分类器与大脑检查器 |
| 状态 | 已完成（证据见 [verification_matrix.md](verification_matrix.md)） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.1 节 `PK-M0-26` |
| 形态 | 小包（三件） |
| 工作流 | AI |
| 量级 | 4 代理人日，1 用户人日 |
| 依赖 | PK-M0-25（已完成，`5fb1fbd820`） |
| 别名 | 内置 AI 第 19 节第 3、4 步 |
| 立项日期 | 2026-11-17 |

## 1. 目标

`src/systems/dialogue/intent/` 取代 `src/systems/dialogue/replies.ts` 的 `answer()`：52 种意图的词典与规则表作为数据驱动分类，分类结果在两档（有模型、无模型）都决定世界后果（关系、认知证据、尊名唤醒、通知），试句语料达量并通过验收线；调试面板能看任一行动者的大脑最近决策。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 自由输入规整（全半角、标点折叠、繁简、错别字与口语修正）、分句 | `src/systems/dialogue/intent/normalize.ts` | builtin_ai.md 6.3 步 1、2 |
| 2 | 实体抽取（人名、女神、地名、物品、魔物、势力、事件、世界观词、地球事物、未知专名、代词指代）；按内容表建立索引，系统不写内容 ID | `src/systems/dialogue/intent/entities.ts` | builtin_ai.md 6.3 步 3、4、6；`tests/content_id_guard.test.ts` |
| 3 | 句式模板语法（词、`@词组`、`{实体槛}`、锚点、跨距） | `src/systems/dialogue/intent/pattern.ts` | builtin_ai.md 6.3（"句式模板"） |
| 4 | 52 种意图的打分、合并与分类（`score = base + 3x关键词 + 4x模板 + 3x实体 + 1x句式特征 - 5x排除 + 上下文加分`；阈值 5；平分取优先级，再取规则编号） | `src/systems/dialogue/intent/classify.ts` | builtin_ai.md 6.3 步 5、7、8；6.4 公式 |
| 5 | 回应策略 R1 到 R9 的执行：R1 到 R4 取第一个有台词的，R5 到 R9 的世界后果与是否已出台词无关，各自按 `if` 独立执行（本包在 builtin_ai.md 6.5 后加一段说明这一点，设计原文未写明） | `src/systems/dialogue/intent/respond.ts` | builtin_ai.md 6.5；写回 builtin_ai.md 6.5 |
| 6 | 内容校验（规则表结构、词典组引用、实体种类、模式语法） | `src/systems/dialogue/intent/content.ts`，接入 `src/content/packs/dialogue.ts` 的 `validate` | builtin_ai.md 18；`node tools/content/validate.ts` |
| 7 | 词典与规则表数据（52 种意图、关键词组、句式模板、人物与地点的称谓变体、俗称折叠） | `data/dialogue/lexicon.json`、`data/dialogue/intents.json` | builtin_ai.md 1.7、6.4 |
| 8 | `answer()` 改为调用分类器并应用回应表，返回行、意图、是否结束会话、系统入口标记；`dialogue.say` 改用其结果 | `src/systems/dialogue/replies.ts`、`src/systems/dialogue/index.ts` | builtin_ai.md 6.3 "取代 answer()" |
| 9 | 关系每日一次的防刷计数（builtin_ai 5.5） | `src/systems/dialogue/types.ts` 的 `DialogueSlice.intentRelDay`，`src/systems/dialogue/index.ts` 的 slice 初始化 | builtin_ai.md 5.5 |
| 10 | 试句语料（500 句标注）与独立保留集（120 句，从未用于调参，验证不过拟合） | `tests/fixtures/intent_corpus.json`、`tests/fixtures/intent_holdout.json` | builtin_ai.md 14.3、19 步 3 |
| 11 | 验收测试（语料与保留集的覆盖率、正确率；分类器单元测试；内容校验测试） | `tests/intent_classifier.test.ts`、`tests/intent_corpus.test.ts`、`tests/intent_eval.ts` | builtin_ai.md 14.3 |
| 12 | 大脑检查器骨架：`SystemContext.brainTrace`、`Engine.recentTraces`/`traceActors`（内存环形缓冲，不进存档）；调试窗口加"大脑检查器"小节（选行动者、看最近决策与候选项的命名得分项） | `src/core/system.ts`、`src/core/engine.ts`、`src/client/windows/brain_inspector.ts`（纯核心）、`src/client/windows/debug_window.ts`（薄绘制层） | builtin_ai.md 2.6、15、19 步 4 |
| 13 | 内容文本抽取排除词典与规则表（数据，不是显示文字，与 `registry` 表同类） | `src/shared_ui/content_text.ts` 的 `NOT_TEXT_TABLES` | D-087 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 话题图（`data/dialogue/topics.json`）：R1 暂直接按槛位名 `topic.<id>` 经台词包回退链取句，槛位名与未来的话题图字段一致，话题图落地后无需改动调用方 | PK-M1-19 |
| 2 | R3 台账拒答的五种处理（否认、回避、误导、不知、暗示）：暂统一答 `react.unknown`，不会说出未解锁内容，但不区分人设化拒答风格 | PK-M1-19（揭示台账接线） |
| 3 | R4 转移话题的候选话题与过渡句：暂与 R3 一样退到 `react.confused`，不给出可点选项 | PK-M1-19 |
| 4 | R5 系统入口的真正结算（交易、委托、赠予、招募、揭发等界面）：本包只在 `RespondOutcome.entry` 写 `{ id, params }` 供未来接线，不打开任何界面 | 各自系统的既有或未来入口 |
| 5 | 耐心值（4 + 好感 /25，外向者 +1）与"无效轮次"扣耐心、"同一问题第三次拒答结束会话"：`thirdOffenseToday` 暂恒为假 | PK-M1-18/19（NPC 大脑与对话系统） |
| 6 | 台词历史（`LineHistory`）接入存档与会话：分类器与回应表的调用点都接受可选的 `history`，现在传 `undefined`（不抑制重复） | PK-M1-18（随 NPC 大脑的会话上下文一起接线，原 PK-M0-25 报告已记此缺口） |
| 7 | `afterQuestion`、`inTopic` 两个分类上下文位的真正来源（当前对话的上一句是否在提问、是否在聊某话题）：接口已留好（`ClassifyContext`），调用点暂传空对象 | PK-M1-18/19 |
| 8 | NPC 大脑本身（九项需求、心情、分层状态机、功能角色子树）：`brainTrace` 是空接缝，等它接入才有真正的决策记录 | PK-M1-18 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则、目录分工 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 分层、确定性内核、系统接缝、文件所有权、文本 |
| [builtin_ai.md](../../40_design/systems/builtin_ai.md) 第 1、6、7、14、17、19 节 | 本包实现的条目与验收行 |
| `src/systems/dialogue/replies.ts`、`session.ts`、`index.ts`、`types.ts` | 要接的现有对话系统 |
| `src/systems/dialogue/lines/` | 台词包回退链与选择器（R1、R2 复用） |
| `src/core/brain/trace.ts`、`utility.ts` | `BrainTrace`、`TraceBook`、效用打分原语 |
| `src/client/windows/debug_window.ts`、`window_context.ts` | 调试窗口现有骨架 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | `src/core`、`src/systems`、`src/game` 不用墙钟与非命名随机；分类器与回应表纯函数（随机只在未来的台词选择里，走命名流） | `tests/architecture.test.ts` |
| 内核纯度 | 新增模块不碰 DOM、Canvas、Three.js；`brain_inspector.ts` 是客户端纯核心 | `tests/architecture.test.ts`、`tests/client_purity.test.ts` |
| 行为不变 | 既有对话测试（问候、闲聊、打听传闻、怎么看我、告辞）不改变；两条既有结局路线确定性不变 | `tests/dialogue.test.ts`、`npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts` |
| 测试先行 | 新模块各有单测；修复 `respondTo` 的 R2/R7 顺序缺陷时先用失败测试复现 | `tests/intent_classifier.test.ts` |
| 文本 | 内核只发 `TextRef`；词典与语料是数据（JSON），不是源码字面量 | `tests/i18n_kernel_guard.test.ts`（词典不在白名单内，靠落在 `data/` 而非 `src/` 规避扫描）、`tests/i18n_ui_guard.test.ts` |
| 系统不写内容 ID | 规则与回应表只用数据里的槛位名模板（`topic.person_{person}` 等），实体 ID 来自运行时抽取结果，不是字面量 | `tests/content_id_guard.test.ts` |
| 禁用字符与链接 | 无破折号、emoji、U+2600 到 U+27BF | `tests/docs_guard.test.ts`、`.claude/hooks/qa-stop.sh` |
| 格式 | 改过的 TS 与 JSON 用 `npm run format -- <文件>` | 已执行，见 [verification_matrix.md](verification_matrix.md) |
| 依赖 | 未新增 npm 依赖 | 无 |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/dialogue/intent/`（types、normalize、entities、pattern、classify、respond、content、index）、`data/dialogue/lexicon.json`、`data/dialogue/intents.json`、`src/client/windows/brain_inspector.ts`、`tests/intent_classifier.test.ts`、`tests/intent_corpus.test.ts`、`tests/intent_eval.ts`、`tests/brain_inspector.test.ts`、`tests/fixtures/intent_corpus.json`、`tests/fixtures/intent_holdout.json`、本包目录 |
| 本包修改 | `src/systems/dialogue/replies.ts`、`index.ts`、`types.ts`；`src/content/packs/dialogue.ts`；`src/shared_ui/content_text.ts`（`NOT_TEXT_TABLES` 加两个表）；`src/core/system.ts`、`src/core/engine.ts`（`brainTrace`/`recentTraces`/`traceActors`）；`src/game/flag_guard.ts`（守卫上下文转发 `brainTrace`）；`src/core/shared_events.ts`（`dialogue.notified` 事件）；`data/dialogue/lines/ln_common.json`（`react.nonsense` 两行）；`src/client/view/game_view.ts`、`src/client/windows/debug_window.ts`；`locales/zh-Hans/sys_dialogue.json`、`ui.json`、`content.generated.json`（随 `npm run build` 的内容文本抽取步重算）；`src/core/text_keys.generated.ts`（随 `node tools/i18n/gen_keys.ts` 重算）；`tests/client_purity.test.ts`（`CLIENT_PURE_CORES` 加一行）；`docs/40_design/systems/builtin_ai.md`（6.5 节加一段说明） |
| 不得修改 | `data/economy/`、`data/combat/items.json`、`data/combat/monsters.json`、`data/registry/`、`docs/40_design/world_state_registry.md`、`locales/zh-Hans/content.generated.json` 的内容来源（PK-M0-30）；`docs/40_design/systems/combat_and_classes.md`（文档代理）；`src/systems/travel/`、`src/game/autoplay/`、`src/systems/combat/skip.ts`、`src/systems/npc/skip.ts`（PK-M0-31） |
| 越界时 | 见第 10 节"交接物"下的请求回写 |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。本包特有：

| 序 | 条件 | 做法 |
| --- | --- | --- |
| 1 | 语料覆盖率或正确率低于验收线（非 `unknown` 覆盖率 68%、正确率 72%） | 先查词典与规则缺口，不改验收数字；已达线则不再为冲高指标过拟合语料 |
| 2 | 回应表某响应代码需要揭示台账或话题图才能真正实现 | 落实为第 3 节"不做"条目，写明去向的后续包，不改内核闸门绕过台账 |

## 8. 验证命令

在 `hakoniwa/` 下运行：

```
npm run typecheck
npx vitest run --config vitest.config.ts tests/intent_classifier.test.ts tests/intent_corpus.test.ts tests/brain_inspector.test.ts tests/dialogue.test.ts tests/cognition.test.ts tests/brain.test.ts tests/lines.test.ts tests/architecture.test.ts tests/i18n_kernel_guard.test.ts tests/i18n_ui_guard.test.ts tests/content_id_guard.test.ts tests/client_windows.test.ts tests/client_purity.test.ts tests/client_window_catalogue.test.ts tests/core.test.ts tests/docs_guard.test.ts
node tools/content/validate.ts
node tools/i18n/check.ts
```

完整命令与量化结果见 [verification_matrix.md](verification_matrix.md)。

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 总闸（qa-checklist） | 必派 | 一次贡献结束 |
| architecture-reviewer | 必派 | 触及 `src/systems/dialogue/`、`src/core/system.ts`、`src/core/engine.ts` |
| frontend-seam-reviewer | 必派 | `src/client/windows/brain_inspector.ts`、`debug_window.ts`、`game_view.ts` |
| content-obligations-reviewer | 视情况（本包不新增游戏内容记录，只新增词典与规则表数据） | 判断不适用 |
| test-coverage-auditor | 必派 | 新增多个测试文件与验收断言 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、数据、测试 | 主会话 | `npm run typecheck`、本包验证命令全绿 |
| `verification_matrix.md` | 主会话、用户 | 验收条目逐条核对 |
| `progress.md` | 主会话 | 了解自定决策与遗留项 |
| 请求回写：`locales/zh-Hans/content.generated.json` 的内容文本重算（由 `npm run build` 或 `node tools/i18n/extract_content.ts` 产生，混入了 PK-M0-30 当时工作区里未提交的数据改动） | 主会话 | 整合各代理工作后统一跑一次生成步，确认落地的是最终数据 |
| 遗留：话题图、台账拒答五种处理、转移话题候选、系统入口结算、耐心与会话上下文、台词历史接线、NPC 大脑真正产出的决策记录 | PK-M1-18、PK-M1-19 | 见第 3 节"不做" |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | `respondTo` 修了一处真实缺陷：R2 产出台词后原代码直接 `break`，导致同一响应表里排在后面的 R7（关系写入）等世界效果从未执行（谢谢、冒犯等都不改变好感）。已修好并补了回归测试，但这意味着在本包之前任何依赖"分类结果驱动关系"的假设都不成立。推荐：按已修复状态验收。 | 不阻塞（已修复并有测试） |
| 2 | 为达成验收线，对词典与规则表做了多轮调参（典型 bug：`trade_sell_word`、`ask_place_here` 等规则只靠"命中一个实体"就打分，不检查关键词，造成大量误判；已加 `needsKeyword` 字段与 `all` 字段改为硬性门槛而修正）。保留集（120 句，从未用于调参）正确率 78.8%，低于语料本身的 89.5%，说明规则对语料之外的措辞泛化有限，是设计上"规则意图分类器"固有的局限，不是 bug。 | 不阻塞；后续里程碑可按真实游玩数据继续扩词典 |
