# PK-M1-33 第一幕任务与纷争：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（V9 全部可达；主线、支线两个经验份额在目标的 5 个百分点以内；击杀份额待自动玩家路线；首通与探索两份在内核里没有发放方；自动玩家第一幕路线在本包之前已停滞，见第 3 节；遗留见 `progress.md` 第 3 节） |
| 末次代码或内容变更 | 未提交；改动文件清单见 `progress.md` |
| 完整实跑 | 2026-11-18；工作区状态（未提交，与他包并行的同一工作区） |
| 审查 | 新起子代理的覆盖性复查一轮（33 条发现），处理见 `progress.md` 第 2 节末 |
| 测试顺序 | 按用户的新指示：本阶段只跑类型检查、数据门与本包的任务、纷争测试；全套与自动玩家路线放到后面的测试阶段（第 4 节"延后的测试"） |

## 1. 验收条目

计划包行验收栏："V9 全部可达；第一幕五个经验份额与目标相差不超过 5 个百分点"。

### 1.1 V9

| 序 | 验收 | 命令或用例 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 第一幕全部任务可达 | `node tools/content/validate.ts --only V9 --warnings` | 0 错误；9 条警告都是"结局还没有自动玩家路线"（RE-21，M3 起）；没有"未定" | PASS |
| 2 | 同上，作为测试 | `tests/act1_quests.test.ts` "decides every act 1 quest reachable" | 第一幕 50 条任务的判定都是 `reachable`；幕周取值含 0、2 到 7 | PASS |

### 1.2 经验份额（数据静态核算，成长第 2.2、2.4、3.1.5、3.8 节）

第一幕需要 78,400；常规路线：主线计 1，支线、纷争节点、链结算、女神请托、生业、同伴、迷宫与探索类任务计 0.6，委托按期望 16 次、中位 325。

| 份额 | 目标 | 数据 | 占比 | 差 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 主线 | 30%（23,520） | 22,550 | 28.8% | -1.2 个百分点 | PASS |
| 支线、纷争、委托 | 25%（19,600） | 0.6 × 19,520 + 16 × 325 = 16,912 | 21.6% | -3.4 个百分点 | PASS |
| 击杀 | 25%（20% 到 30%，不校准） | 由自动玩家测（第 3 节） | 未测 | | 延后 |
| 首通 | 12% | 内核没有 `first:` 的发放方 | 0% | -12 个百分点 | 不能由本包达成（`progress.md` 第 3 节第 16 行） |
| 探索 | 8% | 内核没有 `explore:` 的发放方（探索类任务 750 计在支线） | 0% | -8 个百分点 | 同上 |

"其余全额" 19,520 的构成：支线 9,580、纷争节点 3,950、链结算 2,950、生业 800、女神请托 790、探索类任务 750、同伴 450、迷宫 250。

### 1.3 其余验收

| 序 | 验收 | 用例（`tests/act1_quests.test.ts`，除非另注） | 结果要点 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 目标写入只写一次；备战小目标 | "writes a tide preparation the moment it is done"、"pays only the eve" | 送木料即写 `a1_tide_prep.east_fence` 与 `a1_defense`；说服未过门槛不写；什么都没备只发前夜经验 | PASS |
| 2 | 封印量对账 | "drops the seal writes the doors own" | 第一幕 `onEnter` 与第一幕任务都不写 `seal_looseness`；玩家接手灰晶生意每周 +2；巨像倒下 `seal_unrest = 30`，接手生意时再 +10 | PASS |
| 3 | 主线经验结算点 | "keeps the main line at the 22 settlement points"；`tests/content_validation.test.ts` 的主线合计 22,550 | 22 个结算点 | PASS |
| 4 | A1-M07 | "the culvert fight, then sealing writes..." | `a1_culvert_sealed`、`a1_town_dian` -20、`seal_unrest` -5；封泉写 `a1_north_spring_boarded` | PASS |
| 5 | A1-M09 | "a trial already held without the player plays no second trial"、"the jailbreak of the trial scene marks Oola as jailbroken" | 已判过时不播场景、只一句旁白；劫狱写 `fled` 时置 `a1_oola_jailbroken` | PASS |
| 6 | A1-M12 | "opens on the omens or the night, never on the trial"、"follows the tide stage while the tide system runs, not the kills" | 前兆或兽潮之夜开启；52 在场时波次阶段只跟 `a1_tide_stage` 走，十二次击杀不推进 | PASS |
| 7 | 可选的交付与同一人的交谈 | "A1-M03 takes the raven feather in the talk that registers" | 持有黑羽时登记的同一次交谈写 `bounty` 路径并收走黑羽；没有黑羽时照常登记 | PASS |
| 8 | 纷争节点 | "A1-D01.a writes three pieces"、"A1-D01.g exposes Moss"、"A1-D01.g can hand the crystal trade to the player"、"A1-D01.f turned"、"A1-D02.e cures Toby"、"A1-S17 writes the cellar choice" | 证据件数、暗记、揭发、接手生意、`a1_seg_turned`、托比治愈、地窖抉择 | PASS（A1-S17 见 `progress.md` 复查第 1 条） |
| 9 | 六条纷争 | "fall back to the world endings with no player"、"read what the side quests write for the player endings"、"give the salt dispute the second escalation" | 无玩家时的世界结局；节点写入改变结局；DB-A1-08 的第二阶 | PASS |
| 10 | 九条纷争的自走 | `tests/disputes.test.ts`（20 个种子、真实游戏到第 11 周） | 三条 Must 纷争合法结算；真实游戏里 A1-D02 因潮夜结算为"欧拉逃走" | PASS |
| 11 | 话题与日志 | "a quest topic answered by its giver leads into the quest"、"the log keeps when each quest closed" | 答话人是给予者时接受任务；"已结束"页新到旧 | PASS |
| 12 | 动态事件 | "the beast season writes the monster-season flag..."、"Moira's coincidence lands one of four nudges"；`tests/guild_events.test.ts` | 魔物季旗标；走私队在纷争结算前可来、旧矿塌了不来；前兆条件；四选一各一句 | PASS |
| 13 | 自动玩家 | "leaves a persuasion alone below its threshold"、"buys what a delivery lacks"、"hunts a named kill that has no orWhen" | 说服未过门槛跳过；缺物品去市场买；没有 `orWhen` 的具名击杀在开局 6,000 tick 内打完 A1-M01 `corridor`（去掉守卫即失败） | PASS |

## 2. 通用检查

| 检查 | 命令 | 结果 | 状态 |
| --- | --- | --- | --- |
| 类型检查 | `npm run typecheck`（`npx tsc --noEmit -p tsconfig.json`） | 本包 0 错误；`src/systems/tide/` 的错误属 PK-M1-52 正在改的文件 | PASS |
| 本包测试 | `npx vitest run --config vitest.config.ts --maxWorkers=2 tests/act1_quests.test.ts tests/quests.test.ts tests/quest_model.test.ts tests/disputes.test.ts tests/guild.test.ts tests/guild_events.test.ts tests/progression.test.ts tests/editor_quests.test.ts` | `Test Files 8 passed (8)`，`Tests 199 passed (199)` | PASS |
| 随数据调整的他包测试 | `npx vitest run --config vitest.config.ts tests/dialogue_topics.test.ts tests/act_clock.test.ts` | `Tests 53 passed (53)` | PASS |
| 数据门 | `node tools/content/validate.ts` | 本包的表 0 错误；当前 V1、V2、V4 的错误都在物品批次正在改的 `items/equipment_act1.json`（`mat_steel_ingot`）与附魔表 | PASS（本包） |
| 注册表 | `node tools/registry/build.ts --check` | `vars.json` 是最新 | PASS |
| 文本 | `node tools/i18n/check.ts`；`node tools/i18n/extract_content.ts` | 0 个发现；内容文本已重生成 | PASS |
| 格式 | `npx @biomejs/biome check --write <本包改动的文件>` | 无错误 | PASS |

## 3. 自动玩家第一幕（探针，用户改指示之前跑的）

同一种子（`SEED`）、`release` 路线、上限 300 万 tick，只跑到第一幕结束；探针文件已删除。

| 探针 | 数据 | 结果 |
| --- | --- | --- |
| 1 | 新数据，`player.ts` 只有前两处接线 | A1-M01 在第 1,650 tick 完成；守护巨鸦在第 422,620 tick（第 3 周）打赢；A1-M04 的周窗已过，未开始；停在 A1-M05 `den`："fight dian_boar（not ready）"，7 级，死亡 59 次，第 653,872 tick |
| 2 | 新数据，加备战门槛只看有阶级的目标 | 守护巨鸦到第 4 周仍未打赢；7 级，死亡 76 次，第 759,940 tick 停在 `rest` |
| 3 | 原第一幕数据（内存里替换任务、幕、纷争、委托、事件），同一工作区代码 | 守护巨鸦到第 4 周仍未打赢；7 级，死亡 67 次，第 696,684 tick 停在 `rest (backing off)`，与 PK-M1-20 记录的 `act1_minimal` 失败逐数相同 |

读法：第一幕的停滞在本包之前已经存在（原数据同样停在守护巨鸦之前），出在练级与首领的节奏上（PK-M1-12、PK-M1-42）。本包新增的影响是：主线挂在幕时钟上，第一幕要到第 8 到 10 周的兽潮之夜才能结束（约 160 万到 200 万 tick），`act1_minimal` 的上限 200 万 tick 需要放宽；A1-M04 的周窗只有第 1 到 2 周，打巨鸦拖到第 3 周时它由他人完成，`act1_minimal` 的"第一幕主线全部完成"要改为"完成或由他人完成"（`progress.md` 第 4 节第 2 行）。

## 4. 延后的测试

按用户的新指示，以下在后面的测试阶段跑或修：

| 套件或路线 | 为什么受本包影响 | 已见的情况 |
| --- | --- | --- |
| `tests/scenes.test.ts` "court and endings" 四个用例（走完全部故事） | 叙事夹具的 `playThrough` 每轮只走 3 tick，第一幕主线现在要等幕时钟（第 2、4、7 周与兽潮之夜） | 全套里失败（本包改数据之后） |
| `tests/goddess.test.ts` "keeps every goddess prompt free of locked knowledge at the start of every act" | 同上，只走到第一幕 | 失败；修法同上：夹具在无事可做时跳到下一幕周 |
| `tests/goddess.test.ts` "executes interventions ... ledger entries" | 梅尔卡的请托改为无给予者、请托即开始后应恢复 | 修后未在全套里重跑 |
| `tests/save_recovery.test.ts` | 自动玩家前 2,400 tick 的命令序列（A1-M01 的回廊战） | 本包修复后单跑 21 个全过 |
| `tests/content_validation.test.ts` "V1 to V10 are all green" 等四个 | 数据门；当前的错误在物品批次的文件 | 失败（他包） |
| `npm run playthrough`：`act1_minimal`、`release`、`rule_merca`、`replay_segments`、`npc_disputes`、`tide_pacing`、`text_golden` | 第一幕时长、A1-M04 的周窗、首领节奏 | 未跑；第 3 节的探针显示第一幕停滞在本包之前已存在 |
| `npm test` 全套 | | 本包改动中途跑过一次：`Test Files 6 failed \| 187 passed (193)`，`Tests 10 failed \| 3771 passed`；其中 `art_manifest`、`client_hd2d` 属他包，`dialogue_topics`、`act_clock`、`goddess` 的请托已修，余下见上 |
