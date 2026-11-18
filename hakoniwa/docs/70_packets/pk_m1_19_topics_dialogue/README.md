# PK-M1-19 内置 AI：话题图与对话（别名：内置 AI 第 19 节第 7 步）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-19` 内置 AI：话题图与对话 |
| 状态 | 进行中（实施与验证已完成，建议主会话提交后改为"已完成"，依据见 `verification_matrix.md`；遗留转去的包见 `progress.md` 第 3 节） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-19` |
| 形态 | 小包三件（单会话完成，范围由计划包行与内置 AI 第 19 节第 7 步写定） |
| 工作流 | AI |
| 量级 | 4 代理人日，0.5 用户人日 |
| 依赖 | PK-M1-18（已完成：NPC 大脑、反应表、认知台词）；PK-M0-26（已完成：意图分类器）；PK-M1-47（已完成：公会内核）；PK-M1-58（已完成：任务模型的 `persuade` 目标） |
| 并行包 | PK-M1-27 序章内容、PK-M1-35 地图、PK-M1-12 首领机制、PK-M1-20 女神大脑与导演、PK-M1-15 同伴 |
| 立项日期 | 2026-11-18 |

## 1. 目标

对话由话题图驱动：通用话题、序章与第一幕的话题实例、按知识层级与认知等维度取版本、话题菜单与转移、台账拒答（否认、回避、误导、不知、暗示）与防死循环、耐心；序章的分支对话树在无模型时由规则作答；自由输入在两档都由意图分类器决定世界后果；对话里的说服选项接上任务模型的 `persuade` 目标；首领与官员每周经意图菜单发布委托，居民的求助转成个人请托；认知弧缺的两种证据来源（`authority`、`repeat_close`）有了来源；身份暴露有了对话与审判来源；反应表各行有了对话选项。验收：序章与第一幕的对话可完整进行，泄露扫描为 0。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 话题图：字段、校验、索引；拒答表 `decideTopic`；菜单 `rankMenu`（至多 6 项、配额、聊尽沉底）与转移 `rankRedirect`；会话中的回答、轮转、聊尽、提起人物、拒答、转移、第三次拒答结束并当日关闭 | `src/systems/dialogue/topics/`（`types.ts`、`content.ts`、`graph.ts`、`access.ts`、`menu.ts`、`talk.ts`、`ledger.ts`） | 内置 AI 第 6.2、6.6、7.3、7.7、18 节 |
| 2 | 话题数据：通用话题 18 个；序章九问；第一幕 222 个话题实例（目录第 3.3 节，三个等待任务数据的话题暂缓，见 `progress.md` 第 3 节） | `data/dialogue/topics/generic.json`、`prologue.json`、`act1.json`；`data/dialogue/topic_cast.json` | 台词目录第 3.1 到 3.3 节；台账第 0.2、5、8 节 |
| 3 | 会话：内置选项"话题"展开为话题菜单、返回；自由输入的 R1 经话题图（实体与关键词找话题、头名词优先、说话者范围内的优先），R3 台账拒答，R4 两个推荐话题；台账防护（说中未解锁线索时不确认）；耐心（4 + 好感/25，外向者加 1；误解、重问被拒话题、冒犯各扣 1） | `src/systems/dialogue/topic_session.ts`、`index.ts`、`session.ts`、`replies.ts`、`intent/respond.ts`、`speak.ts`、`types.ts` | 第 6.1、6.3 到 6.6 节 |
| 4 | 通用层台词：`topic.gen_*` 与拒答、说服、身份自曝等反应句（目录第 4.2、4.3 节原句，只追加） | `data/dialogue/lines/ln_common.json` | 台词目录第 4.2、4.3 节 |
| 5 | 序章分支对话树：面试五轮、前世、判决回应的自由回答按规则归类；候见厅自由提问按序章话题的关键词接到过场的问答选项；过场运行器的规则归类端口 | `src/systems/dialogue/prologue/`、`data/dialogue/prologue_answers.json`；`src/systems/scenes/answer_port.ts`、`runner.ts`、`types.ts`，`src/content/packs/scenes.ts` | 第 1.4、6.7 节；序章第 4.7、4.8、7 节 |
| 6 | 说服：有 `persuade` 目标时对话出"说服"选项，自由输入的劝说意图同样算一次尝试；内核按目标门槛裁决，发 `dialogue.persuaded`；任务系统只在说服成功时满足目标（打开对话本身不再满足） | `src/systems/dialogue/persuade.ts`；`src/systems/quests/objectives.ts`、`objective_events.ts`、`index.ts` | 第 6.4 节第 37 行；任务与事件第 5 节 |
| 7 | 委托：居民的未满足需求映射到请托模板，在对话里转成个人请托（报酬至多为其可支配钱的两成，由本人付，公会不抽成），玩家当场应允或推辞；首领与官员每周规划一次，按地区威胁在"发布委托"与"维持现状"之间取舍 | `src/systems/dialogue/commissions/`、`data/dialogue/commissions.json`；`src/systems/guild/board.ts`、`types.ts` | 任务与事件第 6.1、6.2 节；内置 AI 第 4.2、9.2、9.6 节 |
| 8 | 认知证据来源：权威背书（接受了玩家事迹的权威传话时附带，权重 2 到 4；公会晋级是公会的承认，实字档打折）；近处重复目击（见过玩家的任何事迹，这一件又在近处看见） | `src/systems/cognition/sources.ts`、`rumor.ts`、`witness.ts`、`index.ts`、`types.ts`；`data/cognition/sources.json`；`src/content/packs/cognition.ts` | 名声与认知第 3.1、3.4、4.4、6.1 节 |
| 9 | 身份暴露来源：审判的圣灯（旗标 `a1_cassian_appraise`）；自曝来自箱庭之外被采信（K2 以上或遗民）；持有热传闻的人与玩家当面对上号 | 同上 | 内置 AI 第 5.6 节、第 6.4 节第 41 行 |
| 10 | 反应表各行的对话选项：利用（交易、封口费、拒绝）、盘查（配合、亮公会卡、拒答）、崇拜、依赖（说说难处，接请托）、遗民认出（低声回应、守秘） | `src/systems/dialogue/reaction_offers.ts`、`data/dialogue/reaction_options.json` | 内置 AI 第 5.6 节 |
| 11 | 校验与文本：话题与反应选项的显示文字进内容抽取与泄露扫描；话题前缀归 `topics` 表；台词包的话题槽位必须已登记 | `tools/content/validators/player_text.ts`、`namespace.ts`、`lines.ts`；`locales/zh-Hans/sys_dialogue.json`、`sys_cognition.json` | 发行工程第 7.4、8 节 |
| 12 | 测试 | `tests/dialogue_topics.test.ts`、`dialogue_topics_harness.ts`、`dialogue_prologue_answers.test.ts`、`dialogue_talk_extras.test.ts`；改动 `tests/dialogue.test.ts`、`quest_model.test.ts` | |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 序章与第一幕 235 个话题的台词（人物包、地区层） | PK-M1-29（本包只登记话题、通用话题句与拒答句） |
| 2 | 序章数据里自由回答与自由提问在无模型时也出现、`n5_q_free` 接上归类节点 | PK-M1-27（请求见 `progress.md` 第 4 节） |
| 3 | `{goddess}` 槽的填法（凡人对女神的称呼按知识与揭示阶段） | PK-M1-20 女神大脑 |
| 4 | `gen_prices` 的 `{price}`、`{item}`（市场档位价） | 经济系统的后续包 |
| 5 | 反应表的其余后果（指控进度、审判预兆、请愿队列、服务价格） | PK-M1-55、PK-M2 城建官员、经济 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| [builtin_ai.md](../../40_design/systems/builtin_ai.md) 第 6、7 节 | 话题图、意图、回应策略、拒答与转移、台词包契约 |
| [catalog_dialogue_lines.md](../../40_design/content/catalog_dialogue_lines.md) 第 3、4 节 | 话题登记表与通用层台词 |
| [reveal_ledger.md](../../30_story/reveal_ledger.md) 第 0.2、5、8 节 | 装配规则、误导表、各幕禁区 |
| [prologue_antechamber.md](../../30_story/arcs/prologue_antechamber.md) 第 4.7、4.8、7 节 | 序章九问、回答映射表、无模型对话树 |
| [reputation_and_cognition.md](../../40_design/systems/reputation_and_cognition.md) 第 3.1、3.4、4.4 节 | 证据种类与解释库的推翻条件 |
| [quests_and_events.md](../../40_design/systems/quests_and_events.md) 第 5、6 节 | 说服目标、委托与请托 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性 | 台词走 `dialogue.lines.<人>`，话题轮转按顺序不抽签；无墙钟 | `tests/architecture.test.ts` |
| 系统不写内容 ID | 话题、反应行、请托模板、旗标都在数据里 | `tests/content_id_guard.test.ts` |
| 文本 | 系统文本是键；话题标题与选项文字是内容文本；源码无中文字面量 | `tests/i18n_kernel_guard.test.ts`、`node tools/i18n/check.ts` |
| 台账 | 话题标题、选项文字进泄露扫描；未解锁线索一律不确认 | V5（`node tools/content/validate.ts`） |
| 注册表 | 话题条件、反应选项条件、威胁变量只读已登记变量 | `topicProblems`、V4 |

## 6. 文件范围

见 `progress.md` 第 2 节的改动表（含越界改动的说明）。

## 7. 验证命令

```
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.config.ts tests/dialogue_topics.test.ts tests/dialogue_prologue_answers.test.ts tests/dialogue_talk_extras.test.ts tests/dialogue.test.ts tests/quest_model.test.ts
npm test
NPC_ALIVE_OUT=<文件> npm run playthrough
```

## 8. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起子代理） | 必派 | 一次贡献结束 |

## 9. 需用户决定

见 `progress.md` 第 5 节。
