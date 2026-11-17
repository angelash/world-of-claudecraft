# PK-M1-58 任务模型扩展：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施、覆盖性复查、修复 | 十二种目标、八种任务种类、三种结局与失败分支、路径与阶段旗标、钥事件、纷争默认推进、校验、自动玩家做法 | 未提交 | `tests/quest_model.test.ts` 36 passed；`npm test` 2491 passed（唯一失败为基线）；数据门全绿；三条自动玩家路线通过 | 主会话提交；计划状态列建议改为"已完成" |

## 2. 汇报

### 2026-11-17 实施、覆盖性复查、修复

**改动文件**（与 PK-M1-45 共用的文件写明本包的部分）

| 文件 | 动作 | 本包的部分 |
| --- | --- | --- |
| `src/systems/quests/objectives.ts` | 新增 | 全文件 |
| `src/systems/quests/objective_events.ts` | 新增 | 全文件 |
| `src/systems/quests/outcomes.ts` | 新增 | 全文件 |
| `src/systems/quests/disputes.ts` | 新增 | 全文件 |
| `src/content/packs/quests_model.ts` | 新增 | 全文件 |
| `src/game/autoplay/objective_plan.ts` | 新增 | 全文件 |
| `tests/quest_model.test.ts` | 新增 | 全文件 |
| `src/systems/quests/types.ts` | 修改 | `Objective` 的十二种新目标与 `path`、`Clue`、选项的 `path`、`QuestStage.onFail` 与 `failTo`、`QuestKind`、`QUEST_KINDS`、`OBJECTIVE_TYPES`、`DefaultStep`、`QuestDef` 的 `chain`、`node`、`defaults`、`byOther`、`expiry`、`failure`、`QuestStatus` 加 `expired` 与 `by_other`、`QuestProgress` 的 `path`、`clues`、`accrued`、`endedTick`、`QuestsSlice.defaultsDone` |
| `src/systems/quests/progress.ts` | 修改 | 头注释；`objectives` 与 `outcomes` 的导入；`enterStage` 导出并写 `quest.<id>.stage`、`accrued`、`startStageObjectives`；`markMet`、`setPath`；`polled` 的签名与 `reach` 改用 `atPlace`、默认分支交给 `pollModelObjective`；`checkStage` 的失败处理；`objectiveFailed`；`bump` 用 `objectiveNeed` 并写路径；`scanAvailability` 先 `settleOutcomes`（周窗部分属 PK-M1-45） |
| `src/systems/quests/index.ts` | 修改 | `objective_events` 的导入与 `...objectiveSubscriptions`；`talkObjectives`、`deathObjectives`、`mapChangedObjectives`、`accrueObjectives`（`tick` 与跳时处理器）；抉择写路径；战斗目标改用 `markMet`；`isPlayerSide` 改从 `objective_events` 导入；导出 `disputes`、`objective_events`、`objectives`、`outcomes`（幕时钟部分属 PK-M1-45） |
| `src/systems/quests/view.ts` | 修改 | 全部改动 |
| `src/systems/quests/effects.ts` | 修改 | `quest.key` 事件声明、`keyFlag`、`key` 效果（历法项部分属 PK-M1-45） |
| `src/systems/quests/effect_types.ts` | 修改 | 全部改动（`KEY_KINDS`、`key` 效果） |
| `src/systems/quests/act_clock.ts` | 修改 | `runDefaults` 的导入、两处调用与头注释里的一句（其余属 PK-M1-45） |
| `src/content/packs/quests.ts` | 修改 | 种类枚举用 `QUEST_KINDS`、`key` 效果校验、调用 `questModelProblems`（幕时钟与周窗部分属 PK-M1-45） |
| `src/game/autoplay/player.ts` | 修改 | `objective_plan` 的导入与 `objective()` 末尾的新目标分支（其余属 PK-M1-45） |
| `src/content/registry_refs.ts` | 修改 | `key` 效果写入的登记（几行；该文件的 `unless` 一行属 PK-M1-45，其余改动属其他包） |
| `src/editor/quests/flag_index.ts` | 修改 | `effectWrites` 的 `key` 分支（同上） |
| `docs/40_design/world_state_registry.md` | 修改 | 第 8.7 节 `quest.<任务>.path` 的口径与新族 `door_key.<门>.<钥>` |
| `data/registry/vars.json` | 工具重生成 | 含 `door_key.<door>.<key>` |
| `docs/40_design/systems/quests_and_events.md` | 修改 | 第 3.4 节钥事件段、第 3.5 节数据层结局表、第 5 节数据层目标种类表与任务种类段（其余属 PK-M1-45） |
| `docs/70_packets/pk_m1_58_quest_model/` | 新增 | 本目录三件 |

**验收逐条结果**：见 `verification_matrix.md` 第 1 节，20 条全 PASS。

**复查发现与处理**（新起的只读子代理，合并审两个包）

| 发现 | 处理 |
| --- | --- |
| 可选目标失败后 `checkStage` 提前返回，阶段永远不结 | 可选目标失败只退出（计数记 `FAILED`，不再轮询），不影响阶段；补测 |
| `byOther` 与按条件的过期会结束后面幕的任务 | 只结算所属幕不晚于当前幕的任务；补测 |
| 对象先死、目标永远不结 | 轮询读 `npc.<id>.dead` 与同伴 `state = dead`，作失败；补测 |
| 同伴倒地（`entity.died`，种类 companion）被当成死亡 | 死亡事件跳过同伴种类，永久失去由状态旗标判断；补测 |
| 跟随不要求真的跟着 | 必须在途中跟上；对方独自先到即失败；补测 |
| 同一轮里失败压过阶段完成 | 先判完成，未完成才失败；补测 |
| 新事件带原始标题 | 改传内容键 `contentText` |
| 钥事件写入不进注册表与编辑器索引 | 两处索引登记 `door_key.<门>.<钥>` |
| 校验缺人物、正数、无时钟的幕的周窗与默认步骤、夜规则周数、节拍 | 已补；节拍与夜规则另有反例测试 |
| 死代码与重复（`countedByEvents`、`currentClock`、重复的 `isPlayerSide`）、`entityByRef` 每次排序 | 删除、合并、去掉排序 |
| 测试里的空断言与被掩盖的潜行用例 | 改写 |

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 任务目录（前）第 1.4 节 `quest.<q_id>.path` | 完成时走过的解法代号 | 目标或选项带 `path` 时，达成即写，后来的覆盖前一个；完成时的值即所走的解法 | 对话的 `progress` 版本与日志需要在过程中读到 | 否 |
| 任务与事件第 3.2 节 `Stage.onFail` | 阶段的失败出口 | `onFail` 效果加 `failTo` 阶段；没有 `failTo` 即向前失败 | 用阶段代号表达失败分支，不另起有向图 | 否 |
| 任务与事件第 3.6 节 | 纷争链与节点的完整结构 | 本包只做种类、链与节点的连接、按周默认推进；决策点与结局结算留给 PK-M1-46 | 计划把运行器分给 PK-M1-46 | 否 |
| 钥事件的落地 | 任务只发钥事件，开门由千门判定 | 写旗标 `door_key.<门>.<钥>`（值为钥类）并发 `quest.key` | 门数据用现成的 `flag` 钥就能读，不必改千门代码；事件留给需要计数的门 | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `src/content/registry_refs.ts` | 登记 `key` 效果的写入（注册表规则 1、5、10 才看得见） | 内核 | 已改 |
| `src/editor/quests/flag_index.ts` | 同上，编辑器与 V9 的写入索引 | 编辑器 | 已改 |
| `src/systems/doors/types.ts` 的 `COUNTABLE_EVENTS` | 门要按事件计数时，需要加 `quest.key` | 千门（PK-M1-14 的后续） | 请求回写，未改 |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 发出 `gather.done`、`craft.done` | PK-M1-49 |
| 发出 `duel.ended`（不致死决斗） | 战斗方（PK-M1-11、PK-M1-12） |
| 普通 NPC 跟随玩家的命令（护送、救援、陪伴的非同伴对象）；潜行的 `stealth.detected`；`npc.goto` 跨图；跟随的差事过期后重发 | PK-M1-18 |
| 临时同行（希雅、罗恩）作为护送与陪伴的对象 | PK-M1-15 |
| 对话里的说服选项 | PK-M1-19 |
| 纷争的决策点与结局写入 | PK-M1-46 |
| 委托实例（`commission`）与 `cmm_count` | PK-M1-47 |
| 门数据读 `door_key.*`（例：猎之门的地钥） | PK-M1-32 |
| 日志的新种类徽标、`ended` 一栏与路径显示 | PK-M1-22、PK-M1-57 |
| 自动玩家：送达缺物品、说服未达门槛、潜行被发现后的做法（目前会反复交谈或原地等） | PK-M1-33（第一幕任务用到这些目标时一并补） |
| 跟随的地点须在对方本人的地图上，校验需要人设卡的地图字段 | PK-M1-28 或 PK-M1-33 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 每个阶段都写 `quest.<id>.stage` | `flag.changed` 多了，世界哈希变化 | 每个阶段只写一次；重放是同代码自洽比较；三条路线通过 |

**需用户决定**：无。

**下一步与恢复方式**

1. 主会话提交：本包与 PK-M1-45 共用的文件按上表与 PK-M1-45 的 `progress.md` 分段。
2. 计划第 4.2 节 `PK-M1-58` 状态列改为"已完成"。
