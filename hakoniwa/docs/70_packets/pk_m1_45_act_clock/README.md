# PK-M1-45 幕时钟与周窗触发（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-45` 幕时钟与周窗触发 |
| 状态 | 进行中（建议主会话改为已完成，依据见 `verification_matrix.md`） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-45` |
| 形态 | 小包 |
| 工作流 | 系统 |
| 量级 | 2 代理人日，0.2 用户人日 |
| 依赖 | PK-M0-29（已完成：91 日一季与至日的历法函数，`src/core/time.ts`） |
| 别名 | 无 |
| 立项日期 | 2026-11-17 |

## 1. 目标

第一到第六幕有按历法算出的幕内周 `act_week`（写成旗标）；第一幕的 `seal_unrest` 每周加 9；兽潮夜落在 `seal_unrest` 达到 100 那周的暗月夜，内核钳制在第 8 到 10 周；任务条件能用周窗与历法项；自动玩家读同一个时钟。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据（文档与节号） |
| --- | --- | --- | --- |
| 1 | 历法补充：周序 `weekIndexOf`、周首 `weekStartTick`、暗月 `isDarkMoonDay`（每周第 6 日之夜）、`moonAge`、日落 `duskTick`、夜属日 `nightDayOf`、`DUSK_HOUR`、`DAWN_HOUR` | `src/core/time.ts` | 第一幕第 1.2、7.3 节；旅行第 1 节 |
| 2 | 幕时钟：`act_week` 旗标、每周效果、夜规则（周窗、合格夜、条件、`unless`、周窗末夜钳制）、节拍表、`act.<幕号>.entered`；逐 tick 与跳时一致、存档续行 | `src/systems/quests/act_clock.ts`（导出 `advanceActClock`、`actWeekOf`、`actWeekStartTick`、`nightCandidates`、`beatOf`、`enteredFlag`、`ticksToClockEvent`）；`src/systems/quests/index.ts` 的 `tick` 与跳时处理器 | 第一幕第 1.2、7.3 节；注册表第 8.1、8.5 节；任务与事件第 7.5 节 |
| 3 | 幕数据：第一到第六幕的 `clock`（周数 12、14、24、31、33、26）；第一幕的节拍、`seal_unrest` 每周 +9、兽潮夜规则 | `data/quests/acts.json` | 成长第 13.6 节；第一幕第 1.2、7.3 节 |
| 4 | 类型：`ActClockDef`、`NightRule`、`ActBeat`、`ActClockState`、`WeekWindow`、`QuestDef.weekWindow`、`ActDef.clock`、`QuestsSlice.clock` | `src/systems/quests/types.ts` | 任务与事件第 3.1 节 `window` |
| 5 | 周窗：`windowOpen`、`available`，自动开始与 NPC 发布都按周窗判定 | `src/systems/quests/progress.ts` | 任务与事件第 3.1 节 |
| 6 | 历法项：`day`、`hour`、`weekday`、`season`、`year`、`night`、`dark_moon` 进叙事条件的解析器 | `src/systems/quests/calendar_terms.ts`、`src/systems/quests/effects.ts` 的 `narrativeResolver` | 任务与事件第 4.1 节；注册表第 8.1 节 |
| 7 | 数据校验：幕时钟与周窗 | `src/content/packs/quests.ts`（`clockProblems`、`windowProblems`） | 发行工程第 7.4 节 V1 |
| 8 | 自动玩家读同一个时钟 | `src/game/autoplay/clock.ts`（新）；`src/game/autoplay/player.ts` 三处小改 | 计划包行 |
| 9 | 注册表：新增内置量 `weekday`、`night`、`dark_moon`；`act_week`、`a1_tide_night`、`act.<幕号>.entered` 的写入者改写；重生成 `data/registry/vars.json` | `docs/40_design/world_state_registry.md` 第 2.3、8.1、8.5、8.8.2 节 | 注册表第 9.2 节 |
| 10 | 文档回写：任务与事件第 4.1 节历法项、第 3.1 节 `window` 字段、新第 7.5 节幕时钟；任务目录（前）`ev_a1_dark_moon` 的周期 | `docs/40_design/systems/quests_and_events.md`、`docs/40_design/content/catalog_quests_acts1_3.md` | |
| 11 | 测试 | `tests/act_clock.test.ts`（新） | 计划包行验收栏 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 按设计重导第一幕任务（`q_a1_m12_tide` 仍在开始时置 `seal_unrest = 100`、结束时置 0；以 `a1_tide_night` 开始兽潮任务） | PK-M1-33 |
| 2 | 封印三量、门的 `seal_unrest` 增量 | PK-M1-14（`src/systems/doors/seal.ts` 的 `unrestOnOpen`） |
| 3 | 兽潮前兆、防御值、兽潮结算 | PK-M1-33、PK-M1-52 |
| 4 | 纷争链的按周默认推进 | PK-M1-58（任务模型的 `defaults`）、PK-M1-46（运行器） |
| 5 | 界面上的"本幕第 N 周"显示 | 界面包（内核已发 `act.week` 事件并写 `act_week` 旗标） |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 系统接缝、确定性、文本 |
| [act1_borderstone.md](../../30_story/arcs/act1_borderstone.md) 第 1.2、7.3、8.1 节 | 主时间线、主时钟、兽潮前兆 |
| [quests_and_events.md](../../40_design/systems/quests_and_events.md) 第 3.1、4.1、7.5 节 | 周窗、历法项、幕时钟 |
| [world_state_registry.md](../../40_design/world_state_registry.md) 第 8.1 节 | `act_week` 与历法内置量 |
| `src/systems/quests/act_clock.ts`、`src/core/time.ts` | 实现 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | 时钟是 tick 与幕开始日的纯函数；不用墙钟与随机（兽潮夜的选择是确定的，没有需要随机流的分支） | `tests/architecture.test.ts` |
| 内核纯度 | 不碰 DOM；字段不叫 `window`（守卫把该词当浏览器全局），周窗字段名 `weekWindow` | `tests/architecture.test.ts` |
| 系统不写内容 ID | 幕、旗标名、夜规则都来自数据（`acts.json` 的 `clock`） | `tests/content_id_guard.test.ts` |
| 注册表 | 写入的旗标都已登记；`node tools/registry/build.ts --check` 通过 | `src/game/flag_guard.ts` |
| 格式 | 改过的 TS 与 JSON 已格式化 | biome |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/quests/act_clock.ts`、`src/systems/quests/calendar_terms.ts`、`src/game/autoplay/clock.ts`、`tests/act_clock.test.ts`、本目录 |
| 本包修改 | `src/core/time.ts`、`src/systems/quests/{types,index,progress,effects}.ts`、`src/content/packs/quests.ts`、`src/game/autoplay/player.ts`、`data/quests/acts.json`、`docs/40_design/world_state_registry.md`、`data/registry/vars.json`（工具重生成）、`docs/40_design/systems/quests_and_events.md`、`docs/40_design/content/catalog_quests_acts1_3.md` |
| 不得修改 | `src/systems/doors/**`、`data/doors/**`（PK-M1-14）；`src/systems/world/**`（PK-M1-16）；`src/systems/records/**`（PK-M1-48） |
| 越界时 | 无越界改动 |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。

## 8. 验证命令

```
npx vitest run --config vitest.config.ts tests/act_clock.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起子代理） | 必派 | 一次贡献结束 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、测试、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；本包验证命令绿 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 暗月的周期：第一幕"达到 100 的那一周的暗月夜"要求每周都有一个暗月夜，任务目录（前）`ev_a1_dark_moon` 原写"每 28 游戏日一次" | 本包按分幕文档（正典优先级更高）定为每周第 6 日之夜，并回写了任务目录；若要 28 日周期，第 8 到 10 周只剩一个候选夜，`seal_unrest` 就不再决定兽潮落在哪一周 | 不阻塞 |
