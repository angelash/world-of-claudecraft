# PK-M1-58 任务模型扩展：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS |
| 末次代码或内容变更 | 未提交；改动文件清单见 `progress.md` |
| 完整实跑 | 2026-11-17；工作区状态（未提交，与 PK-M1-45 同一工作区） |
| 审查 | 新起子代理的覆盖性复查一次（与 PK-M1-45 合并审），结论与处理见第 3 节 |
| 遗留 | 见 `progress.md` |

## 1. 验收条目

命令：`npx vitest run --config vitest.config.ts tests/quest_model.test.ts`（36 passed）。

| 序 | 验收 | 用例（`tests/quest_model.test.ts`） | 结果要点 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 送达 | `deliver: hands the items over ...` | 物品不够、对象不对都不算；带够两件与 `oola` 交谈即达成并交出 | PASS |
| 2 | 护送 | `escort: done when ...`；`failed: a required objective failing ...` | 被护送者在别图、在目的地外不算，活着到目的地达成；途中死亡执行 `onFail` 与 `failure` 效果，任务 `failed` 且不可重接 | PASS |
| 3 | 调查（线索集） | `investigate: ...` | 线索是条件，找到即记下（条件后来变假仍算），够 2 条即达成，`quest.clue` 依次为 `seal`、`ash` | PASS |
| 4 | 说服 | `persuade: ...` | 门槛（信任与证据）不成立时交谈不算，成立后与本人交谈才达成 | PASS |
| 5 | 潜行 | 三条 `stealth` 用例 | 玩家被发现后本次接近作废，离图再来可达成；别人被发现不影响；`retry: false` 被发现即向前失败 | PASS |
| 6 | 不致死的决斗 | `duel: ...` | 输掉不算、`outcome: 'lose'` 输掉才算；对手死于他人之手不影响，死于玩家一方即失败 | PASS |
| 7 | 跟随 | 两条 `follow` 用例与 `follow with retry false` | 阶段开始发出 `npc.goto`（`gorn` 去 `plaza`，6 小时）；玩家途中跟上并一同到达才达成；对方独自先到即失败；`retry: false` 跟丢转入失败分支 `failTo` | PASS |
| 8 | 营救 | `rescue: ...` | 交谈或条件成立即解救；有目的地时被救者到达才达成；被救者死亡即失败 | PASS |
| 9 | 采集（事件契约，合成事件） | `gather: ...` | 只计玩家一方、指定物品的 `gather.done`，进度 3/5，再 2 件达成 | PASS |
| 10 | 制作（事件契约，合成事件） | `craft: ...` | 只计指定配方且品质达标的 `craft.done` | PASS |
| 11 | 交易 | `trade: ...` | 只计玩家、买入、单价不高于上限的 `economy.traded`，累计 4 件达成 | PASS |
| 12 | 陪同 | `accompany: ...` | 同图且在范围内时按游戏分钟累计（逐 tick 一小时约 60 分钟），离开不计，跳时的按小时步进照计，满 180 分钟达成 | PASS |
| 13 | 结局：向前失败 | `failed: ...` 两条；`an optional objective that fails ...`；`a person already gone ...`；`a stage that completes wins ...` | 失败条件使进行中的任务失败；可选目标失败只退出、不卡阶段；对象已死（`npc.<id>.dead`、同伴 `state = dead`）的目标失败，同伴倒地（`entity.died` 种类 companion）不算；同一轮里阶段完成优先于失败 | PASS |
| 14 | 结局：过期 | `expired: ...` 两条 | 本幕第 2 周过后，接过与没接过的任务都过期并执行默认结算，事件带 `started`；没接过的不进日志、不再开始；条件过期；世界进入更晚的幕时过期 | PASS |
| 15 | 结局：由他人先完成 | `by_other: ...`；`leaves quests of an act the world has not reached alone` | 条件成立即 `by_other`，不发奖励、发人情；没接过的也结束；后面幕的任务在到达该幕之前不动 | PASS |
| 16 | `quest.<id>.path` | `writes quest.<id>.path ...`；`a talk objective with a path ...` | 抉择选项与目标的 `path` 写入旗标，后来的解法覆盖前一个；日志显示；`quest.<id>.stage` 随阶段改写 | PASS |
| 17 | 开门钥事件效果 | `a key event effect ...`；`the registry knows ...` | 写 `door_key.<门>.<钥>` = 钥类并发 `quest.key`；注册表能解析；真实游戏经守卫写 `quest.q_a1_m01_fall.stage` | PASS |
| 18 | 纷争链与节点（按周默认推进） | `dispute chains and nodes` 三条 | 周首推进默认步骤，玩家介入（`unless`）则不发生，没接过的链也推进；链结束后不再推进；节点按自己的 `expiry` 结算；种类、链、节点、默认步骤的校验 | PASS |
| 19 | 现有任务数据零改动通过 | `the existing quest data` 三条 | 任务包校验对现有数据 0 问题，`validateContent` 无任务问题，现有种类与目标类型都在新表内；错误数据（未知目标、物品、地点、空线索、零分钟、未知 `failTo`、未知门、坏钥名、空过期）逐条报出；`data/quests/quests.json` 未改 | PASS |
| 20 | 自动玩家的新目标做法 | `the autoplayer and the new objective kinds` | 送达、说服、营救去交谈，潜行走到，其余等待 | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 退出码 0 | PASS |
| 默认套件 | `npm test` | 是 | `Tests 1 failed \| 2491 passed \| 2 skipped`；唯一失败为基线 `art_manifest` | PASS（扣除基线） |
| 数据门 | `node tools/content/validate.ts` | 是 | V1 到 V10 全绿 | PASS |
| 注册表 | `node tools/registry/build.ts --check` | 是 | 退出码 0 | PASS |
| 文本 | `node tools/i18n/check.ts` | 是 | 0 finding；本包没有新的玩家可见文本（新事件的标题传内容键 `contentText`） | PASS |
| 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 是 | 11 passed | PASS |
| 自动玩家路线 | 同 PK-M1-45 | 是 | 见 PK-M1-45 的 `progress.md` | PASS |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 覆盖性复查（新起子代理，只读） | 一次贡献结束 | PASS-WITH-FOLLOWUPS | 0 | 可选目标失败卡住阶段；后面幕的任务被 `byOther` 提前结束；对象先死时目标永远不结；同伴倒地被当成死亡；跟随不要求真的跟着；新事件带原始标题；钥事件的写入不进注册表与编辑器索引；校验缺人物、正数、无时钟的幕与夜规则周数 | 全部已修并补测（见 `progress.md`）；跟随的 `npc.goto` 失效后不重发、跨图、场景视图的历法项、自动玩家在无物品时反复交谈记为遗留 | `progress.md` 2026-11-17 段 |

## 4. 基线问题

同 PK-M1-45 的 `verification_matrix.md` 第 4 节。

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 9、10（采集、制作）与 6（决斗）、5（潜行的发现） | 发出事件的系统还不存在，用合成事件测了契约 | PK-M1-49、战斗方、PK-M1-18 落地时各加一条集成用例 |
| 2、8、12 的普通 NPC 对象 | 普通 NPC 不会跟着玩家走 | PK-M1-18、PK-M1-15 |
