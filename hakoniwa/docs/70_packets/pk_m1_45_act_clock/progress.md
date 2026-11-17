# PK-M1-45 幕时钟与周窗触发：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施、覆盖性复查、修复 | 幕时钟、历法项、周窗、第一幕的周增长与兽潮夜规则、`act.<幕号>.entered`、自动玩家读时钟；与 PK-M1-58 同一会话先后完成 | 未提交 | `tests/act_clock.test.ts` 31 passed；`npm test` 2491 passed，唯一失败为基线 `art_manifest`；三条自动玩家路线通过（见下） | 主会话提交；计划状态列建议改为"已完成" |

## 2. 汇报

### 2026-11-17 实施、覆盖性复查、修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/core/time.ts` | 修改 | `DUSK_HOUR`、`DAWN_HOUR`、`MOON_CYCLE_DAYS`、`DARK_MOON_WEEKDAY`、`weekIndexOf`、`weekStartTick`、`moonAge`、`isDarkMoonDay`、`duskTick`、`nightDayOf`；`isNight` 改用常量（行为不变） |
| `src/systems/quests/act_clock.ts` | 新增 | 幕时钟；其中 `runDefaults` 的导入与两处调用属于 PK-M1-58 |
| `src/systems/quests/calendar_terms.ts` | 新增 | 历法项 `calendarTerms`、`CALENDAR_TERMS`、`SEASON_NAMES` |
| `src/systems/quests/types.ts` | 修改 | `WeekWindow`、`NightRule`、`ActBeat`、`ActClockDef`、`ActClockState`、`QuestDef.weekWindow`、`ActDef.clock`、`QuestsSlice.clock`（其余新增类型属于 PK-M1-58） |
| `src/systems/quests/index.ts` | 修改 | `tick` 与跳时处理器先推进幕时钟；导出 `act_clock`、`calendar_terms` |
| `src/systems/quests/progress.ts` | 修改 | `windowOpen`、`available`；自动开始与 `offerable` 判周窗 |
| `src/systems/quests/effects.ts` | 修改 | `narrativeResolver` 加历法项 |
| `src/content/packs/quests.ts` | 修改 | 模式字段 `clock`、`weekWindow`；`clockProblems`、`windowProblems` |
| `src/game/autoplay/clock.ts` | 新增 | `clockExtras`、`windowOpenIn`、`waitsOnClock`、`clockWait` |
| `src/game/autoplay/player.ts` | 修改 | `holds` 用历法项；接主线时判周窗；主线只等时钟时跳到时钟的下一个事件（其余一处小改属于 PK-M1-58） |
| `data/quests/acts.json` | 修改 | 第一到第六幕的 `clock`；第一幕的节拍、周增长与兽潮夜规则 |
| `docs/40_design/world_state_registry.md` | 修改 | 第 2.3 节内置量一行；第 8.1 节 `act_week` 写入者、新增 `weekday`、`night`、`dark_moon`；第 8.5 节 `act.<幕号>.entered` 写入者；第 8.8.2 节 `a1_tide_night` 写入者 |
| `data/registry/vars.json` | 工具重生成 | `node tools/registry/build.ts`；重生成时也带进了其他代理同期写进注册表文档的行 |
| `docs/40_design/systems/quests_and_events.md` | 修改 | 第 3.1 节 `window` 行、第 4.1 节历法项、新第 7.5 节幕时钟 |
| `docs/40_design/content/catalog_quests_acts1_3.md` | 修改 | `ev_a1_dark_moon` 的周期与读取方 |
| `tests/act_clock.test.ts` | 新增 | 31 个用例 |
| `docs/70_packets/pk_m1_45_act_clock/` | 新增 | 本目录三件 |

**验收逐条结果**

| 验收序号 | 状态 | 命令与输出要点 |
| --- | --- | --- |
| 1 到 6 | PASS | 见 `verification_matrix.md` 第 1 节 |
| 自动玩家路线 | PASS | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts tests/playthrough/rule_merca.playthrough.test.ts`：复查修复前一次 `Test Files 3 passed (3)`，`Duration 1398.15s`；末次代码变更之后再跑一次 `Test Files 3 passed (3)`、`Tests 3 passed (3)`，`Duration 1433.33s`，退出码 0（改动前单跑第一幕最短路线 439.05s，同样通过） |

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 任务目录（前）第 5.7 节 `ev_a1_dark_moon` | 每 28 游戏日一次暗月夜 | 每周一次，第 6 日之夜（整夜落在同一周内） | 第一幕第 1.2、7.3 节（正典优先级更高）写"达到 100 的那一周的暗月夜"，并允许第 8 到 10 周之间提前；28 日周期下第 8 到 10 周至多一个暗月夜，`seal_unrest` 就不再决定哪一周；已回写任务目录 | 否（README 第 11 节列为可复议） |
| 注册表第 8.1 节 `act_week` | "幕开始置 1，每 7 日加 1" | 幕开始那一周为 1，此后每逢历法周首加 1 | 由历法算出（成长第 13.6 节第一幕即 998 年第 1 到 12 周），纷争链"每周开始推进一格"与周首对齐；已改写注册表 | 否 |
| 第一幕第 7.3 节 | 兽潮在 `seal_unrest` 达到 100 那周的暗月夜 | 夜规则在周窗内每个暗月夜日落检查 `seal_unrest >= 100`；周窗最后一个暗月夜无条件触发并把 `seal_unrest` 置 100；兽潮已过（`a1_beast_tide_cleared`）则作废 | 内核钳制的直接写法；兽潮之后每周增长停止 | 否 |
| 任务与事件第 4.1 节 | 内置 `day`、`season` 等 | 历法项按 tick 现算，只进叙事解析器（任务、场景运行器、导演）与自动玩家；`act_week` 写成旗标 | 历法项每小时都变，写旗标会造成持续的 `flag.changed`；记录系统按旗标结算传书，故 `act_week` 必须是旗标（PK-M1-48 的整合请求） | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `src/content/registry_refs.ts`、`src/editor/quests/flag_index.ts` | 条件字段表加 `unless`（夜规则与纷争默认步骤的作废条件），否则注册表校验与编辑器索引看不见其中的变量 | 内核、编辑器 | 已改，各一行；这两行已随另一个包的提交或暂存进入仓库 |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| `q_a1_m12_tide` 以 `a1_tide_night` 开始；去掉开始时的 `seal_unrest = 100` 与结束时的置 0（改为 30 加修正）；第一幕任务的周窗；兽潮前兆在兽潮前一周出现 | PK-M1-33 |
| 兽潮夜的结算 | PK-M1-52 |
| 场景视图 `sceneView` 的选项过滤用普通 `flagResolver`，运行器用叙事解析器：选项条件若用历法项两边会不一致；门钥、传书、女神等其他求值器读历法项得到注册表默认值 | 场景方（PK-M1-54）与各求值器的负责方；需要时把 `calendarTerms` 接进它们的解析器 |
| 界面显示"本幕第 N 周"、节拍 | PK-M1-22、PK-M1-57（内核已有 `act_week` 旗标与 `act.week` 事件、`beatOf`） |
| PK-M1-45 之前的存档没有时钟状态，载入后从载入那一周重计第 1 周 | M2 存档兼容（届时加迁移，按历法与幕切换的记录推回开幕日） |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 世界哈希与路线时序变化 | 每局都会写 `act_week`、`act.<幕号>.entered`，第一幕跨周时 `seal_unrest` 增长；重放与路线的哈希需重录 | 重放测试都是同代码自洽比较；三条路线已重跑通过 |

**需用户决定**

| 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- |
| 暗月周期 | 推荐每周一次（已实现）；若要 28 日，需改 `MOON_CYCLE_DAYS` 并接受第一幕兽潮周数固定 | 不阻塞 |

**下一步与恢复方式**

1. 主会话提交（与 PK-M1-58 分两次提交时，按 PK-M1-58 的 `progress.md` 列出的共用文件分段）。
2. 计划第 4.2 节 `PK-M1-45` 状态列改为"已完成"，项目状态与进度日志由主会话更新。
