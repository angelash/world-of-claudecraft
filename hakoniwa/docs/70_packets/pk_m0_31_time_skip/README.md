# PK-M0-31 跳时内核（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M0-31` 跳时内核 |
| 状态 | 进行中 |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.1 节 `PK-M0-31` |
| 形态 | 小包 |
| 工作流 | 系统 |
| 量级 | 4 代理人日, 0.3 用户人日 |
| 依赖 | PK-M0-29（已完成，提交 `6e776c5f45`：成长重标与跳时的历法基础） |
| 别名 | 无 |
| 立项日期 | 2026-11-17 |

## 1. 目标

游戏时间能以三种方式一次性跳过（等待、睡眠、区域图或脚本的远行），跳时期间世界按小时粗步或逐节拍结算，跳时期间不向大模型发出实时请求，
自动玩家在长等待处改用与玩家相同的跳时入口。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据（文档与节号） |
| --- | --- | --- | --- |
| 1 | `GameSystem.clock` 与 `skip` 钩子（内核类型 `SkipClockStep`，与客户端 `src/client/app/clock.ts` 自己的 `ClockStep`同名但不同的类型区分开）；引擎的粗步推进与模型请求保留 | `src/core/system.ts`、`src/core/engine.ts` | `travel_and_exploration.md` 第 7.5 节 |
| 2 | 跳时处理器注册接缝 | `src/systems/travel/skip_registry.ts` | 同上，第 9.1 节 |
| 3 | 跳时编排：短跳与长跳两档、中断、摘要 | `src/systems/travel/skip.ts` | 第 7.4 到 7.6 节 |
| 4 | 休整判定：`canWait`、`canSleep` | `src/systems/travel/rest.ts` | 第 7.1 到 7.3 节 |
| 5 | 命令 `time.wait`、`time.sleep`、`time.skip`、`time.cancel` | `src/systems/travel/system.ts` | 第 9.3 节 |
| 6 | 世界系统的小时粗步处理器（移动收尾、钟点与天气事件） | `src/systems/world/index.ts` | 第 7.5 节"世界系统" |
| 7 | 战斗与刷新的小时粗步处理器（刷新、光环到期、脱战回复、睡眠全恢复） | `src/systems/combat/skip.ts`、`src/systems/combat/index.ts` | 第 7.5 节"战斗与刷新"、第 7.3 节"恢复" |
| 8 | NPC 社会的小时粗步处理器（冻结居民复位、闲聊轮次补齐） | `src/systems/npc/skip.ts`、`src/systems/npc/index.ts` | 第 7.5 节"NPC 社会" |
| 9 | 任务时限的小时粗步处理器（等待型目标与轮询条件按步结算） | `src/systems/quests/index.ts` | 第 7.5 节"任务" |
| 10 | 城建、经济、战略的粗步处理器（本期无自身小时状态，登记空处理器占位） | `src/systems/city/index.ts`、`src/systems/economy/index.ts`、`src/systems/strategy/index.ts` | 任务书"城市和战略处理器可以是薄的" |
| 11 | 门的小时粗步处理器（门址复检） | `src/systems/doors/index.ts` | 第 7.5 节未逐条列出，按"没有处理器的系统该步不动"的反面补上既有周期检查 |
| 12 | 修正项到期的粗步处理器 | `src/systems/modifiers/index.ts` | 同上 |
| 13 | NPC 日记请求标为 `backfill`：跳时期间保留，结束后批量补发 | `src/systems/npc/diary.ts` | 第 7.5 节"大模型" |
| 14 | 自动玩家改用玩家同样可用的跳时（长安全等待走 `time.skip`） | `src/game/autoplay/player.ts` | 任务书 |
| 14a | 客户端主循环在跳时的粗步期间每帧最多跑一次 `engine.step(1)`（否则会在几帧内把整段跳时跑完，玩家端看不到时间在过去） | `src/client/app/clock.ts`（`framesToRun`）、`src/client/app/session.ts` | 覆盖性复查发现（见 `progress.md`） |
| 15 | 文本键（拒绝原因、中断原因） | `locales/zh-Hans/sys_travel.json` | `implementation_conventions.md` 第 8 节 |
| 16 | 地图字段 `sedimentClock`（深澱限时区，整图版） | `src/systems/world/types.ts` | 第 7.2 节规则 3；既有数据未使用，留给设定深澱地图的包补 `true` 或地点标签 `sediment_clock` |
| 17 | 新测试 `tests/time_skip.test.ts`（T-08 到 T-11、T-16） | `tests/time_skip.test.ts` | 第 10 节 |

## 3. 不做

| 序 | 不做的事 | 归属（哪个包或哪份文档负责） |
| --- | --- | --- |
| 1 | 区域图行进（图、选路、途中事件、营地）、世界图个人行程 | PK-M1-17（任务书已指明：留作 VERIFY） |
| 2 | 行路之门（门标、门址、众门环） | PK-M1-17 及后续门类包 |
| 3 | 探索迷雾与发现点 | PK-M1-17 |
| 4 | 界面：`ui_pop_wait`、`ui_ovl_time_skip`、摘要卡 `ui_pop_outcome` | 界面相关包（内核已发出 `time.skipped` 等事件供界面订阅） |
| 5 | 城建、经济、战略自身的按小时状态（它们目前只有按日结算，本包只登记占位处理器） | 这些系统各自后续的时间驱动状态包，到时把占位处理器换成真正结算 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 分层、确定性内核、系统接缝、文本 |
| [travel_and_exploration.md](../../40_design/systems/travel_and_exploration.md) 第 1、7、9、10 节 | 跳时模型、休整判定、数据结构与验收测试 |
| `src/core/engine.ts`、`src/core/system.ts`、`src/core/ai_port.ts` | tick 循环、系统接口、AI 请求保留 |
| `src/game/autoplay/player.ts`、`src/game/autoplay/domains.ts` | 自动玩家的长等待来源 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | `src/core`、`src/systems`、`src/game` 不用墙钟与非命名随机；固定 20Hz；随机走命名流（`travel.skip`） | `tests/architecture.test.ts` |
| 内核纯度 | `core`、`content`、`systems`、`ai`、`game` 不碰 DOM、Canvas、Three.js 与浏览器全局 | `tests/architecture.test.ts` |
| 行为不变 | 两条既有结局路线仍能通关；粗步档与逐节拍档对同一跳时命令的结果在容差内一致 | `tests/time_skip.test.ts`、两条结局路线 |
| 测试先行 | 新模块配单测 | `tests/time_skip.test.ts` |
| 文本 | 内核只发 `TextRef`；拒绝原因与中断原因是文本键 | `tests/i18n_kernel_guard.test.ts` |
| 禁用字符与链接 | 文档、源码、注释、提交说明无破折号、emoji、U+2600 到 U+27BF | `tests/docs_guard.test.ts`、QA 的 Stop 钩子 |
| 格式 | 改过的 TS 与 JSON 用 `npm run format -- <文件>` | 已对本包改动的文件执行 |
| 依赖 | 不新增 npm 依赖 | 无新增 |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/travel/**`、`tests/time_skip.test.ts`、`locales/zh-Hans/sys_travel.json`、`docs/70_packets/pk_m0_31_time_skip/**`、`src/systems/combat/skip.ts`、`src/systems/npc/skip.ts` |
| 本包修改 | `src/core/system.ts`、`src/core/engine.ts`、`src/core/ai_port.ts`、`src/game/flag_guard.ts`、`src/game/create.ts`、`src/game/registry.ts`、`src/systems/world/index.ts`、`src/systems/world/types.ts`、`src/systems/combat/index.ts`、`src/systems/npc/index.ts`、`src/systems/npc/diary.ts`、`src/systems/quests/index.ts`、`src/systems/doors/index.ts`、`src/systems/modifiers/index.ts`、`src/systems/economy/index.ts`、`src/systems/city/index.ts`、`src/systems/strategy/index.ts`、`src/game/autoplay/player.ts`、`src/editor/inspector/inspector_model.ts`、`src/client/app/session.ts`、`src/client/app/clock.ts`、`tests/client_logic.test.ts`、`src/core/text_keys.generated.ts`（工具重生成） |
| 不得修改 | `src/systems/dialogue/**`、`src/client/windows/debug_window.ts`（PK-M0-26）；`data/economy/**`、`data/combat/items.json`、`data/combat/monsters.json`、`data/registry/**`、`docs/40_design/world_state_registry.md`、`locales/zh-Hans/content.generated.json`（PK-M0-30）；`docs/40_design/systems/combat_and_classes.md`（文档代理） |
| 越界时 | 未越界：没有改动以上任一清单中的文件 |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。本包特有的：

| 序 | 条件 | 做法 |
| --- | --- | --- |
| 1 | 粗步档与逐节拍档的世界哈希出现无法解释的差异 | 停下，定位差异来源（见 `tests/time_skip.test.ts` 的 T-10），写进 `progress.md` 并询问 |
| 2 | 两条结局路线因本包而不再通关 | 回退改动范围，先修可疑的系统处理器 |

## 8. 验证命令

在 `hakoniwa/` 下运行：

```
npx vitest run --config vitest.config.ts tests/time_skip.test.ts
npm run typecheck
npm test
node tools/i18n/gen_keys.ts --check
node tools/i18n/check.ts
node tools/content/validate.ts
node tools/registry/build.ts --check
npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts tests/playthrough/rule_merca.playthrough.test.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 总闸（qa-checklist） | 必派 | 一次贡献结束 |
| architecture-reviewer 等效（本仓库用通用覆盖性复查） | 必派 | 改了 `src/core/engine.ts`、`src/core/system.ts` 的核心接缝 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、测试、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；`node scripts/gate_select.mjs` 或本包验证命令绿 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 城建、经济、战略的粗步处理器目前是空占位（它们尚无自身的按小时状态，只有按日结算，世界系统的 `world.hour`、`world.day` 事件在粗步里照常送达）：是否满足任务书"城市和战略处理器可以是薄的（按小时粗步空操作或简单追赶），但注册接缝必须存在"的要求 | 推荐：按任务书原句，接受占位，等相应系统有了按小时状态再补真正结算 | 不阻塞 |
| 2 | `sedimentClock` 地图字段本包只加了类型与判定逻辑，未给任何现有地图数据置位（现有深澱区域如遗迹深处、旧水道由"迷宫只能在安全点"规则已覆盖）；深澱限时区地图（如千门都外环）要到相应内容包落地时才会用到这个字段 | 推荐：留给设定该地图的包去置位，本包只占位规则 | 不阻塞 |
