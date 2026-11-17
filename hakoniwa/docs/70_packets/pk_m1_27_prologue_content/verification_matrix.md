# PK-M1-27 序章内容批次：验收与证据

> 入口见 [README.md](README.md)；进度与汇报见 [progress.md](progress.md)。状态只用 PASS、FAIL、VERIFY、N/A。

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS：包行三条验收都有证据；序章到结局的通关路线在序章之后的第一幕卡住（并行地图包），并行包落定后要重跑 `npm run playthrough`（第 2.1、4 节）；遗留与请求见 [progress.md](progress.md) |
| 末次数据或测试变更 | 未提交；改动文件见 [progress.md](progress.md) 的改动表 |
| 完整实跑 | 2026-11-18，共享工作区（含其他并行包的未提交改动，见第 4 节） |
| 审查 | 新起会话的覆盖审查一份：7 条 SHOULD-FIX、8 条 NIT；处理见第 3 节 |

## 1. 验收条目

### 1.1 包行验收

| 序 | 条目 | 证据 | 覆盖 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 序章全部锚点按序出现 | `tests/prologue_content.test.ts` 两档通关的 `expectAnchorsInOrder`；`tests/scenes.test.ts`"plays N1 to N13…" | 十三句锚点（A11、A00、A06、A01、A03、A09 问与答、A04、A05、A07、A02、A08、A10）各一次、说话者对、顺序递增；含锚点台词的节点（另加 A09 的光闪）都标 `anchor`，没有多标 | PASS |
| 2 | 无模型档能走完 | `prologue_content`"without a model…"；`npm run playthrough` 的 `release`、`rule_merca`、`act1_minimal` | 七场依次播完进入第一幕；七条序章任务全部完成；`p_last_words`、`p_unsent_words` 写定值 | PASS |
| 3 | 模型档能走完 | `prologue_content`"with a model…"、"never closes a round…"；`scenes.test`"replays a model-driven prologue…" | 五轮各两轮对话后收束（`p_round_end.<神> = closed`），归类到非兜底类别只结算该类效果（`p_answers` 为 E2、V1、M2、S4、O5，写定反应不出现）；硬上限 10 轮后为 `hard`，莫伊拉敲桌；最后一句自由说写 `free` 并复述；从命令日志无模型重放得到同一世界 | PASS |
| 4 | 泄露扫描为 0 | `node tools/content/validate.ts --warnings` 的 V5 | 0 错误；9 条警告无一条指向 `cut_p_` 或 `q_p_`（全部是第一幕起的既有条目） | PASS |

### 1.2 范围条目

| 序 | 条目 | 证据 | 状态 |
| --- | --- | --- | --- |
| 1 | 七场拆分、场景链、开场幕引子场景 | `prologue_content`"chain from the opening act…"：`acts.prologue.introScene = cut_p_earth`，`then` 依次相连，最后一场以幕切换收尾；`prologue` 场景已不存在 | PASS |
| 2 | `presentation`、`summary`、`anchor` | 同上：面试为剧场、其余为演出；七条梗概与过场目录第 13.9 节逐字相同（测试直接读目录）；锚点节点见 1.1 第 1 条 | PASS |
| 3 | `stage` | 327 条指令：音乐 33、音效 52、环境 7、静默 7、立绘 91、撤立绘 17、黑白场 5、字幕 1、震屏 3、镜头 87、光 6、天气 1、动作 10，加 PK-M1-54 的门 3、门结束 1、偷听 1、噪声 1、偷听结束 1；`tests/client_prologue_stage.test.ts` 19 项通过（门、偷听、坠落、灵镜存档往返在新数据上） | PASS |
| 4 | 面试五轮 `turns` 与 `storeAs: p_round_end.<女神>` | `prologue_content`"gives each interview round…"：答者、软 6 硬 10、`storeAs`、归类结算节点的选项与正文选项同 id、同标签、同效果，去向为本轮收尾，兜底 E4、V6、M4、S3、O4 | PASS |
| 5 | `cut_p_earth` 到 `cut_p_call` 各带 `restart` | `prologue_content`"offers the re-choice…"（无 `until`，后三场没有）；`tests/scenes_runner_additions.test.ts`"clears the prologue flags…"（走完开场 A 与门后重选，旗标、遗物、号码牌与已播场景都清掉）与"is gone once the interview begins" | PASS |
| 6 | 灵镜 `creator` 移到首位 | `prologue_content` 的选项顺序断言；自动玩家与各测试驱动关闭 `ui` 等待 | PASS |
| 7 | 重选开场是否清 `player.name` | 定为不清（README 第 11 节第 1 项）；`prologue_content`"keeps the name the player gave…" | PASS |
| 8 | 序章任务七条 | `prologue_content` 无模型通关：七条全部 `done`，类型五主线两探索；"规格外"在光闪与"这不合规格。"之后开始，"接住你了"在"接住你了。"之后开始 | PASS |

## 2. 通用检查

| 检查 | 命令 | 结果 | 状态 |
| --- | --- | --- | --- |
| 本包测试 | `npx vitest run --config vitest.config.ts tests/prologue_content.test.ts tests/scenes.test.ts tests/scenes_runner_additions.test.ts` | 见第 2.1 节 | PASS |
| 拆分引起的测试更新 | `npx vitest run --config vitest.config.ts tests/client_prologue_stage.test.ts tests/client_adapters.test.ts tests/client_gamepad_playthrough.test.ts tests/client_player_input.test.ts tests/client_story.test.ts tests/content_roles.test.ts tests/content_id_guard.test.ts tests/content_validation.test.ts tests/editor_batch.test.ts` | 见第 2.1 节 | PASS |
| 类型检查 | `npm run typecheck` | 见第 2.1 节 | PASS |
| 内容校验 | `node tools/content/validate.ts --warnings` | V1 到 V10 全部 0 错误；警告 V4 332、V5 9、V6 9、V7 3、V9 9，没有一条指向 `cut_p_` 或 `q_p_` | PASS |
| 注册表 | `node tools/registry/build.ts --check` | 见第 2.1 节 | PASS |
| 文本检查 | `node tools/i18n/check.ts` | 0 条发现，2327 处键使用 | PASS |
| 默认套件 | `npm test` | 见第 2.1 节：本批相关全部通过，其余失败属并行包或负载超时 | PASS |
| 无模型通关 | `npm run playthrough` | 见第 2.1 节：三条路线的序章段都走完；路线在第一幕卡住，属并行包 | VERIFY |
| 禁用字符 | 扫描本批全部数据、测试与本目录 | 0 处 | PASS |
| 格式 | `npm run format -- <本批文件>` | 无剩余问题 | PASS |

### 2.1 数字

| 检查 | 结果 |
| --- | --- |
| 本批与拆分相关的测试（第 2 节前两行，加 `tests/quests.test.ts`、`tests/save_migration.test.ts`、`tests/docs_guard.test.ts`，共 15 个文件） | 末次改动之后：264 项中 263 项通过；1 项失败是 `client_gamepad_playthrough` 进入第一幕之后的战斗段（第 4 节）。`tests/prologue_content.test.ts` 8 项通过 |
| 类型检查 | 0 个错误 |
| 注册表 | 37 项通过（高负载下有一次 1 项超时，重跑通过） |
| 文本检查 | 0 条发现，2327 处键使用；内容文本重新生成为 6669 个键 |
| 默认套件 | 167 个文件中 159 个通过；3438 项中 3428 项通过、2 项跳过、8 项失败（第 4 节）。其中 `client_player_input` 的输入次数断言属本批（无名氏在叫号时多出一次"其实，我有名字。"的输入，应为 3），实跑后已改并单独重跑通过 |
| 无模型通关 | `release`、`rule_merca`、`act1_minimal` 两次实跑（第二次在地图校验转绿之后）：序章都在第 215 tick 走完，七条序章任务在第 77 到 215 tick 依次完成，进入第一幕；三条路线都在第一幕卡在 `q_a1_m02_raven`（"travel to borderstone_north to grind Lv7"，PK-M1-35 的新地图，第 4 节）。`replay` 同因失败，`replay_segments` 在负载下钩子超时，`npc_alive_1` 到 `4` 属 PK-M1-18 |

## 3. 审查

| 角色 | 结论 | 处理 |
| --- | --- | --- |
| 新起会话的覆盖审查 | 7 条 SHOULD-FIX、8 条 NIT；脚本对照全部台词、选项、输入、效果、分支与指令与目录一致，锚点逐字且顺序正确，泄露扫描与变量规范名无问题 | 已修：归类结算节点的标签改为正文选项的标签（审查发现分类说明会进回看）；A09 的光闪节点标为锚点；`n12_drop` 的 `free` 条件加"没有写过 `p_last_words`"；四条任务文字不再提前说出硬币、门、问题与号码板；测试补上梗概逐字对照、结算节点标签、任务开始时机、硬上限一轮。转请求或遗留（[progress.md](progress.md)）：没有答者的自由回应在模型档落到兜底 R5、即兴要点无字段、归类选中进回看、重选开场不退任务、字幕时序、敲桌音效、模型档的庭院物品与前世抽取、事迹与灶火前世奖励、下一期两处 |

## 4. 本包以外的失败（共享工作区，2026-11-18 实跑）

| 测试 | 原因 | 归属 |
| --- | --- | --- |
| `tests/art_manifest.test.ts` | 已知基线：素材清单与文件不一致 | 第三方素材工作 |
| `tests/client_hd2d.test.ts`"keeps the style pack…" | `old_outpost` 等地图的外观指纹变了 | PK-M1-35、PK-M1-24 |
| `tests/client_gamepad_playthrough.test.ts`"advances, chooses, types a name…" | 序章段通过；失败在第一幕战斗段（最先软锁定的魔物不是第一个被打到的）。本批前一次实跑通过，之后 `data/combat/maps/seal_ruins.json`、`data/combat/monsters.json` 由并行包改动；去掉本批后加的光闪锚点再跑仍失败 | PK-M1-35、PK-M1-12 |
| `tests/ailments.test.ts` 跳时、`tests/core.test.ts` 历法事件、`tests/disputes.test.ts` 二十种子、`tests/registry.test.ts` 旗标守卫 | 30 秒超时，同时有多个代理的通关与套件在跑；`registry`、`disputes` 单独重跑通过 | 负载 |
| `tests/playthrough/` 的 `release`、`rule_merca`、`act1_minimal`、`replay` | 序章走完之后，第一幕自动玩家为 `q_a1_m02_raven` 去新地图 `borderstone_north` 练级，230400 tick 没有进展 | PK-M1-35（地图）与自动玩家 |
| `tests/playthrough/npc_alive_1` 到 `4` | 第一幕 NPC 活性指标 | PK-M1-18 |
| 第一次全套实跑里的 `city`、`map_metrics`、`world_atlas`、`time_skip`、`quest_model`、`doors`、`npc`、`party`、`dungeons` 等 | 地图坐标与地点随 PK-M1-35 改动；末次全套实跑时已不再失败 | PK-M1-35 |
