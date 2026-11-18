# PK-M1-33 第一幕任务与纷争（别名：内容批次 `content_act1_quests_01`）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-33` 第一幕任务与纷争 |
| 状态 | 进行中（建议主会话按 `verification_matrix.md` 的结论定；遗留转去的包见 `progress.md` 第 3 节） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-33` |
| 形态 | 大包的量级按小包三件写（单会话完成，范围由计划包行与任务目录（前）第 5 节写定） |
| 工作流 | 内容 |
| 量级 | 4 代理人日，1 用户人日 |
| 依赖 | PK-M0-28、PK-M0-29、PK-M0-31；PK-M1-18（NPC 大脑与话题端口）；PK-M1-45（幕时钟写 `act_week` 与 `a1_tide_night`）；PK-M1-46（纷争运行器）；PK-M1-47（公会内核：委托模板与动态事件）；PK-M1-58（任务模型：目标种类、`optional`、`path`） |
| 并行 | PK-M1-52（兽潮之夜结算，同一主人）：本包的 `q_a1_m12_tide` 以 `a1_tide_night` 开启，按 52 的旗标推进与完成，不写兽潮结算；接口见 52 的 `README.md` 第 6 节 |
| 立项日期 | 2026-11-18 |

## 1. 目标

第一幕的任务、纷争、委托与动态事件按任务目录（前）第 5 节导入：主线 A1-M01 到 A1-M13 挂在幕时钟上，支线、纷争节点与女神请托补齐，九条纷争都有运行数据；V9 报告全部可达；经验按幕校准，主线与支线两个份额在目标的 5 个百分点以内，击杀份额由自动玩家测，首通与探索两份要等内核的发放方（`progress.md` 第 3 节第 16 行）。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 第一幕主线重导：A1-M01 到 A1-M13（A1-M08 并入 A1-M09，A1-M11 并入 A1-M12），阶段、目标、写入、周窗与过期按目录；`has.<物品>` 条件改为任务或旗标条件 | `data/quests/quests.json` | 目录第 5.2 节；[slice_gap_audit.md](../../60_production/slice_gap_audit.md) 第 3 节 |
| 2 | 支线、纷争节点任务（A1-D01.a、e、f、g，A1-D02.e，A1-D04.e）、女神请托（`q_gl_merca_01`、`q_gl_eluen_01`、`q_a1_g03_first_ledger`）与 11 件任务物品 | `data/quests/quests.json`、`data/quests/items.json` | 目录第 5.4、5.5 节 |
| 3 | 目标的世界写入：目标新字段 `effects`，满足时写一次（选择项的效果照旧）；校验接 `effectProblems` | `src/systems/quests/types.ts`、`progress.ts`、`index.ts`；`src/content/packs/quests.ts` | 任务模型；目录 A1-M12 的备战小目标 |
| 4 | 封印量对账：第一幕 `onEnter` 不再写 `seal_looseness`；玩家接手灰晶生意时第一幕时钟每周 `seal_unrest` +2；A1-M12 去掉 `seal_unrest` 置 100 与归 0，巨像倒下时置 30 | `data/quests/acts.json`、`quests.json` | [thousand_doors.md](../../40_design/systems/thousand_doors.md) 第 6.4 节与 C84；第一幕 7.3 节 |
| 5 | 兽潮任务：`q_a1_m12_tide` 由前兆或 `a1_tide_night` 开启，`prep` 阶段六个可选备战目标写 `a1_tide_prep.*`，后续阶段按 52 的 `a1_tide_stage` 与 `a1_beast_tide_cleared` 推进；旧波次只在 `NOT a1_beast_tide_started` 时兜底 | `data/quests/quests.json` | PK-M1-52 第 6 节 |
| 6 | 第一幕周窗与前兆：主线的 `act_week` 前置、A1-M04 的 `weekWindow` 与 `byOther`、A1-M07 的过期；前兆事件在 `seal_unrest >= 91 OR act_week >= 10` 时落地 | `quests.json`、`data/guild/events.json` | 第一幕 1.2、8.1 节 |
| 7 | 自动玩家：缺物品的送达去市场买、未过门槛的说服跳过；没有 `orWhen` 的具名击杀不再空等；具名的普通怪物不走首领的备战门槛 | `src/game/autoplay/quest_gates.ts`（新增）；`player.ts`（接线，见 `progress.md` 第 2 节） | 计划包行 |
| 8 | 其余六条纷争的运行数据（A1-D03、D05 到 D09）与它们的链任务 | `data/disputes/act1.json`、`act1_chains.json` | 目录第 5.3 节 |
| 9 | A1-M09 重导：无人到场的审判只在主线没有占着审判时开；先开庭的一边写欧拉的下场；已开过时光之鉴走"审判已开过"的分支；劫狱写 `a1_oola_fate = fled` 时一并置 `a1_oola_jailbroken` | `quests.json`、`disputes/act1.json` | 目录 A1-M09、A1-D02 |
| 10 | 目录第 5.3 节按纷争运行器回写（格、决策点、结算、结局表） | [catalog_quests_acts1_3.md](../../40_design/content/catalog_quests_acts1_3.md) 第 5.3 节 | 本包 |
| 11 | 委托模板与动态事件：A1-M03 接公会登记，A1-M04 的三件委托接 `firstIn`；新模板 2 个（全部 11 个）；动态事件 27 个（第一幕 34 个），含魔物季旗标 `a1_beast_season`、莫伊拉巧合的四选一、`dg.<迷宫>.collapsed` 条件 | `data/guild/commissions.json`、`events.json` | 目录第 5.6、5.7 节；女神目录 DB-A1-02、08 |
| 12 | 任务视图的结束时刻与日志"已结束"页按时间排序 | `src/systems/quests/view.ts`；`src/client/windows/quest_log_model.ts` | 计划包行 |
| 13 | A1-M07：`seal` 写 `a1_culvert_sealed` 与镇内澱度 -20，封泉写 `a1_north_spring_boarded`；第 8 周起夜羽在暗渠说出"澱"（暗面节拍 D6，写 `term.dian_known`）；A1-D02.e 写 `a1_toby_state` | `quests.json` | 目录 A1-M07、A1-D02.e |
| 14 | A1-S17、A1-S25 写 `dg.<迷宫>.choice`（A1-S25 未导入，见第 3 节） | `quests.json` | 迷宫目录 |
| 15 | `src/systems/quests/objectives.ts` 的头注释改为采集与制作事件由生业内核发出 | `objectives.ts` | 计划包行 |
| 16 | 写 `a1_ruins_gate_cleared`（A1-M07 `vein`）与 `a1_mine_cleared`（A1-M06 `breach`） | `quests.json` | 地图简报（PK-M1-35 的临时值待复核） |
| 17 | 三个等任务的话题（`event_drunk_bandits`、`secret_toma_watch`、`secret_noi_mark`）；六个任务话题的 `unlocks.quests`；话题答完后接受它解锁的任务 | `data/dialogue/topics/act1.json`；`src/systems/quests/topic_unlocks.ts`（新增）、`index.ts` | PK-M1-19 转来 |
| 18 | DB-A1-08 读盐纷争的第二阶升级（`price_doubled` 第 5 周） | `data/disputes/act1.json` | 女神目录 DB-A1-08 |
| 19 | V9 读幕周：幕时钟经常量写 `act_week`，源码扫描读不到；取值按内容条件里比较的周 | `src/editor/quests/quest_graph.ts`（`actWeekValues`） | V9 |
| 20 | 测试与验收 | `tests/act1_quests.test.ts`（新增）；`tests/quests.test.ts`、`quest_model.test.ts`、`content_validation.test.ts`、`progression.test.ts`、`disputes.test.ts`、`guild.test.ts`、`guild_events.test.ts`（随数据调整） | 计划包行验收栏 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 兽潮结算（波次、伤亡、`a1_tide_credit`、`a1_bs_survival`）与兽潮怎么结束 | PK-M1-52 |
| 2 | 场景（`data/scenes/`、`cut_`）里的封印加点与新分支 | PK-M1-34（请求见 `progress.md` 第 3 节） |
| 3 | 战斗与队伍数据、首领机制、`fight.ts`、`reach.ts` | PK-M1-12、PK-M1-15 |
| 4 | 地图、刷新组与地点 | PK-M1-35 |
| 5 | A9 替身内容的迁移 | PK-M2-20（见 `progress.md` 第 3 节） |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| [catalog_quests_acts1_3.md](../../40_design/content/catalog_quests_acts1_3.md) 第 1、2、3、5 节 | 本包的数据 |
| [act1_borderstone.md](../../30_story/arcs/act1_borderstone.md) 第 1.2、4、7、8 节 | 幕时钟、纷争、澱病、兽潮 |
| [thousand_doors.md](../../40_design/systems/thousand_doors.md) 第 6.4 节 | 封印量 |
| [progression_and_pacing.md](../../40_design/progression_and_pacing.md) 第 3.3、17、18 节 | 经验份额与结算点 |
| PK-M1-52 的 `README.md` 第 6 节 | 兽潮之夜的接口 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性 | 新代码不抽签；自动玩家的市场选择按数据顺序 | `tests/architecture.test.ts` |
| 系统不写内容 ID | 话题解锁、目标写入、门槛与市场都从数据来 | `tests/content_id_guard.test.ts` |
| 文本 | 任务文字经内容提取成键（`locales/zh-Hans/content.generated.json`）；源码无中文字面量 | `node tools/i18n/check.ts` |
| 注册表 | 内容只写登记了写入者的变量；剧情标记不写假 | `node tools/registry/build.ts --check`、V4 |
| 兽潮 | 本包不写兽潮结算，只读 52 的旗标 | `tests/act1_quests.test.ts` 的兽潮用例 |

## 5.1 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/game/autoplay/quest_gates.ts`；`src/systems/quests/topic_unlocks.ts`；`tests/act1_quests.test.ts`；本目录 |
| 本包修改 | `data/quests/`（`quests.json`、`items.json`、`acts.json`）；`data/disputes/`（`act1.json`、`act1_chains.json`）；`data/guild/`（`commissions.json`、`events.json`）；`data/dialogue/topics/act1.json`；`src/systems/quests/`（`types.ts`、`progress.ts`、`index.ts`、`objective_events.ts`、`view.ts`、`objectives.ts`）；`src/content/packs/quests.ts`；`src/client/windows/quest_log_model.ts`；`src/editor/quests/quest_graph.ts`；上表测试；`docs/40_design/content/catalog_quests_acts1_3.md` 第 5.3 节 |
| 越界改动（写进 `progress.md`） | `src/game/autoplay/player.ts`（四处接线）；`docs/40_design/world_state_registry.md`（一行）；`tests/disputes.test.ts` 的真实游戏用例（兽潮把欧拉拖出拘留室）；`tests/dialogue_topics.test.ts`、`tests/act_clock.test.ts`（随数据）；生成物 `data/registry/vars.json`、`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` |

## 6. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。

## 7. 验证命令

```
npx vitest run --config vitest.config.ts tests/act1_quests.test.ts tests/quests.test.ts tests/quest_model.test.ts tests/disputes.test.ts tests/guild.test.ts tests/guild_events.test.ts tests/progression.test.ts tests/content_validation.test.ts tests/editor_quests.test.ts tests/save_recovery.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.config.ts tests/dialogue_topics.test.ts tests/act_clock.test.ts
# 测试阶段（延后，见 verification_matrix.md 第 4 节）：npm test；npm run playthrough
```

## 8. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起子代理） | 必派 | 一次贡献结束 |

## 9. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 数据、代码、测试、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；本包验证命令绿 |
| `progress.md` 第 3 节的请求 | PK-M1-52、PK-M1-34、PK-M1-35、PK-M1-12 | 各自按表处理 |

## 10. 需用户决定

见 `progress.md` 第 4 节。
