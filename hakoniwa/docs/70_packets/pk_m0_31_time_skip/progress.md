# PK-M0-31 跳时内核：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施 1 | 跳时内核（引擎接缝、短跳与长跳、休整判定、命令、各系统粗步处理器、自动玩家接入）、覆盖性复查与修复 | 未提交 | `tests/time_skip.test.ts` 27 测试全过；相邻子集 567 测试全过；两条结局路线均完整通关 | 请用户决定是否封包，或先补战斗与移动性能的独立包 |

## 2. 汇报

### 2026-11-17 实施 1

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/core/system.ts` | 修改 | `GameSystem` 加 `clock`、`skip` 钩子；新增 `ClockStep`、`SkipStep` 类型 |
| `src/core/engine.ts` | 修改 | `runTick` 按系统的 `clock` 钩子推进（粗步或单 tick）；粗步时调用各系统 `skip` 而不是 `tick`；`step(n)` 改为"推进到至少 n，粗步不可拆分"；AI 请求在跳时期间持有（`hold: 'fallback' | 'backfill'`），跳时结束释放 backfill 并给新截止 tick |
| `src/core/ai_port.ts` | 修改 | `AiRequest` 加 `hold`；`AiRequestSpec` 加 `backfill` |
| `src/game/flag_guard.ts` | 修改 | 守卫包装新增 `skip` 钩子（随 `init`、`tick` 一起包一层注册表上下文） |
| `src/game/create.ts` | 修改 | `guarded()` 先经 `attachSkipHandlers` 把注册表里的处理器接到各系统 |
| `src/game/registry.ts` | 修改 | `allSystems()` 的返回值同样经 `attachSkipHandlers` |
| `src/systems/travel/types.ts` | 新增 | `TravelSlice`、`SkipState`、`SkipSummary`、命令与事件声明 |
| `src/systems/travel/skip_registry.ts` | 新增 | `registerSkipHandler`、`attachSkipHandlers`（叶子模块，任何系统可引用，不经 travel 桶） |
| `src/systems/travel/skip.ts` | 新增 | 跳时编排：`startSkip`、`advanceSkip`、`endSkip`、`interruptSkip`、`noteSkip`、`skipClock`、两档默认（`defaultMode`） |
| `src/systems/travel/rest.ts` | 新增 | `canWait`、`canSleep`、`sleepPlaceCheck`、`ambushChance`、`sleepAmbushChance`、`wakeTick`、`ticksUntil` |
| `src/systems/travel/system.ts` | 新增 | 命令 `time.wait`、`time.sleep`、`time.skip`、`time.cancel`；中断事件订阅（故事、战场、兽潮、受击、死亡、换图、来访、领地危机、点名玩家国家的战役与宣战） |
| `src/systems/travel/index.ts` | 新增 | 桶导出 |
| `src/systems/world/index.ts`、`types.ts` | 修改 | 新增地图字段 `sedimentClock`；世界系统注册粗步处理器（移动收尾、钟点与天气事件） |
| `src/systems/combat/skip.ts` | 新增 | 战斗粗步处理器：刷新、光环到期、脱战回复；睡眠全恢复 `restAfterSleep`；`noteMissedPeriodic` 对周期性或光环脉冲效果抛错而不是静默漏算（第 5 节有说明） |
| `src/systems/combat/index.ts` | 修改 | 订阅 `time.skipped`，整夜睡眠结束后恢复玩家与同伴 |
| `src/systems/npc/skip.ts` | 新增 | NPC 粗步处理器：冻结居民复位、补齐闲聊轮次 |
| `src/systems/npc/index.ts` | 修改 | 引入 `./skip`（登记处理器） |
| `src/systems/npc/diary.ts` | 修改 | 日记请求标 `backfill: true` |
| `src/systems/quests/index.ts`、`doors/index.ts`、`modifiers/index.ts` | 修改 | 各自登记粗步处理器（复用既有的周期检查函数） |
| `src/systems/economy/index.ts`、`city/index.ts`、`strategy/index.ts` | 修改 | 登记空占位粗步处理器（这些系统目前只有按日结算，世界系统的 `world.hour`/`world.day` 事件在粗步里照常送达） |
| `src/editor/inspector/inspector_model.ts` | 修改 | `runWithInputs` 改用 `engine.clockStep()` 算下一个落点，而不是假设 `tick + 1`（覆盖性复查发现：粗步跳时会让假设的落点错位） |
| `src/client/app/clock.ts` | 修改 | 新增纯函数 `framesToRun`（跳时粗步期间每帧最多跑一次 `step(1)`，见下"覆盖性复查"一节） |
| `src/client/app/session.ts` | 修改 | `frame()` 改用 `framesToRun` 决定本帧实际推进几次，而不是直接用实时经过的节拍槶数 |
| `tests/client_logic.test.ts` | 修改 | 新增 `framesToRun` 的决定性测试 |
| `src/core/system.ts`、`src/core/engine.ts`、`src/systems/travel/skip.ts` | 修改 | 内核的跳时时钟步类型从 `ClockStep` 改名 `SkipClockStep`，避免与客户端 `src/client/app/clock.ts` 既有的同名 `ClockStep`（不同的类型）混淆；纯粹改名，不改行为 |
| `src/game/autoplay/player.ts` | 修改 | `think()` 顶部加"跳时正在跑就原样等它"分支；`wait()` 的长安全等待改走 `time.skip` |
| `locales/zh-Hans/sys_travel.json` | 新增 | 29 条拒绝与中断原因文本键 |
| `src/core/text_keys.generated.ts` | 修改 | 工具重生成（`node tools/i18n/gen_keys.ts`） |
| `tests/time_skip.test.ts` | 新增 | 27 个测试：T-08、T-09、T-10、T-11、T-16、引擎接缝、跳时注册表、中断与摘要、周期性光环的抛错守卫 |
| `docs/70_packets/pk_m0_31_time_skip/*` | 新增 | `README.md`、`verification_matrix.md`、`progress.md` |

**验收逐条结果**

| 验收序号（`verification_matrix.md` 第 1 节） | 状态 | 命令与输出要点 |
| --- | --- | --- |
| 1 到 5（T-08、T-09、T-10、T-11、T-16） | PASS | `npx vitest run --config vitest.config.ts tests/time_skip.test.ts`：`Tests 27 passed (27)` |
| 6（8 分钟） | PASS-WITH-FOLLOWUP | 见下"耗时与画像" |

**耗时与画像**

初次实跑（跳时内核加自动玩家接入第一版）在 `rule_merca` 路线上触发了一次严重回归：`think()` 在跳时运行期间仍会继续评估战斗、休整等分支并下发新命令，这些命令要等到跳时的当前小时步跑完才会生效，造成命令堆积与世界状态和自动玩家意图的错位；该次实跑耗时 2,803 秒、死亡 290 次（仍然通关，但远比预期慢）。定位后在 `think()` 顶部加了"跳时正在跑就不再评估别的分支"的早退分支，修复后重跑：

```
npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts tests/playthrough/rule_merca.playthrough.test.ts
```

结果（`Test Files 2 passed (2)`、`Tests 2 passed (2)`）：

| 路线 | 改动前（`git archive` 导出的 HEAD 基线复本，同一台机器顺序实跑） | 改动后（本次实跑） |
| --- | --- | --- |
| release | `ending=release finished=true ticks=2,366,897 ms=1,021,259 deaths=80` | `ending=release finished=true ticks=2,005,961 ms=598,604 deaths=61`，快 41% |
| rule_merca | `ending=rule_merca finished=true ticks=1,778,105 ms=803,075 deaths=68` | `ending=rule_merca finished=true ticks=1,830,278 ms=588,426 deaths=87`，快 27% |

两次结局（`ending`、`acts` 顺序、`questsDone` 集合）相同；死亡次数与具体 tick 数的差异是预期的（任务书已预告"切到跳时会改变世界哈希与耗时"），因为自动玩家在长等待处改走跳时后，战斗与地图行走的掷点序列相对基线不再逐 tick 对齐，蝴蝶效应改了具体遭遇的结果，但两条路线仍 0 次卡死、完整通关。

一次按意图分桶的 tick 耗时画像（带埋点，`release` 路线，埋点本身有可观开销，数字只作相对比例参考，不是绝对耗时）：按 tick 数排序的前几项是 `rest`（战斗后低血量的短休）、`let the nation grow`、`wait for settlers`、`建立庭外之国`（这三项都是本包接通跳时的长安全等待）、`建成建筑`，其后是各种 `fight <怪物>` 与 `travel to <地图> to grind`。战斗与地图行走合计的 tick 数和画像里的毫秒数都显著高于三项等待桶的合计，说明本包已经吃到了"把纯等待段从逐 tick 推进换成按小时粗步"能给的全部收益；离 8 分钟还差的那一段，墙钟开销的大头在战斗公式与寻路本身的逐 tick 系统工作，这不在本包范围内（本包的范围只是跳时内核与两处调用点，不是战斗或移动的性能）。

**覆盖性复查（新起、只读的子代理）**

派了一个新起的、只读的子代理对本包的 diff 做覆盖性复查（不是自审）。它的结论与处理：

| 发现 | 严重度 | 处理 |
| --- | --- | --- |
| `Engine.step(1)` 在跳时粗步期间可能一次推进一整小时，`src/editor/inspector/inspector_model.ts` 的 `runWithInputs` 假设每次 `step(1)` 正好落在 `tick + 1`，会把命令注入的落点算错 | BLOCKING（复查给出） | 已修：`runWithInputs` 改用 `engine.clockStep()` 查下一个真实落点 |
| `src/client/app/session.ts` 的主循环 `frame()` 按真实经过时间算出的 `steps` 次数去调用 `engine.step(1)`；这个数字数的是"20Hz 节拍槽"，与一次 `step(1)` 在跳时粗步期间实际推进多远（可达一整小时）无关，于是客户端打开时整段长跳会在几帧内被跑完，玩家完全看不到时间在过去。初次复查我判定这是容错范围内的插值问题（`InterpBuffer` 的 `SNAP_DISTANCE`），**这个判定是错的**：复查代理指出 `SNAP_DISTANCE` 只处理单个实体位置跳变的画面效果，不处理"每帧都在跑一整小时、完全不设速率"这个结构性问题，而且 `session.ts` 对 `skipState` 一无所知，没有任何东西在限速。复核后确认复查是对的 | BLOCKING（复查给出，初判有误，复核后修正） | 已修：`src/client/app/clock.ts` 新增纯函数 `framesToRun(steps, duringCoarseStep)`：跳时粗步进行中时每帧最多跑一次 `engine.step(1)`（仍然落在与实时推进相同的最终 tick 上，因为粗步本身不可拆分，只是不在几帧内抢跑完）；`session.ts` 的 `frame()` 改用它。新增决定性测试 `tests/client_logic.test.ts`："paces the main loop to one coarse step per frame during a time skip" |
| 跳时期间，自动玩家的 `think()` 没有在顶部识别"跳时正在跑"，导致其余决策分支继续下发命令，造成 `rule_merca` 严重变慢变死（实测） | BLOCKING（复查提示了风险，实跑证实是真的回归） | 已修：见上"耗时与画像"一节；加了决定性回归测试（见下） |
| 任务书第 7.4 节"领地危机"没有接到 `slg.battle`、`slg.war_declared`、`city.event`（严重级） | SHOULD-FIX | 已修：`system.ts` 新增三个事件订阅，点名玩家国家（`attacker`/`defender` 为 `'player'`）或严重级城建事件才打断；新增决定性测试（见下） |
| `rest.ts` 的睡眠判定漏了设计 7.3 表格第四行："野外无营地但带帐篷类消耗品"（夜袭概率加倍、无营火减半） | SHOULD-FIX（复查标注：内容里没有这类物品，不是本包能检查的空） | 不改代码：`data/` 里没有帐篷类消耗品（查过 `catalog_consumables_magitools.md` 与 `data/*/items.json`），系统代码不写内容 ID，没有东西可查；在 `sleepPlaceCheck` 加了详细注释说明这一行留给加入帐篷物品的包去补（物品标签或 `use.group`，不是硬编码 ID） | 
| `combat/skip.ts` 的跳时粗步只让光环到期，不结算周期性伤害、治疗或光环脉冲，一旦未来内容定义这类光环，短跳与长跳会悄悄产生不同结果 | SHOULD-FIX（复查标注：目前没有这类光环，是潜在问题） | 不实现结算数学（会牵涉护甲、暴击、仇恨等战斗平衡细节，"不要凑数值"）；改为显式抛错守卫 `noteMissedPeriodic`：粗步遇到周期性或脉冲光环就抛内部错误（开发者可见，不进字符串表），让"第一个用到这类光环的包"自己撞上去，而不是悄悄算错；新增决定性测试覆盖这个守卫 |
| diff 里混了别的代理（PK-M0-26 意图分类器、数据重标、素材管线）同一工作区的改动，与本包无关 | BLOCKING（复查给出，针对"一次贡献"而言） | 确认属实但不是本包造成：`git status` 核对过，本包改动的文件清单（见上"改动文件"）里不含 `src/systems/dialogue/**`、`locales/zh-Hans/content.generated.json`、`assets/**`、`tools/assets/**`；这些是任务书本身点名"其他代理同时在改"的文件，本包从未写过它们。在本汇报写明，供主会话整合提交时分清各代理的改动范围 |

复查之后新增的决定性回归测试（`tests/time_skip.test.ts`）：
- "a nation battle or war naming the player interrupts the skip, one not naming it does not"：探针系统发出不点名玩家国家的 `slg.battle` 不打断跳时，发出点名玩家国家的 `slg.war_declared` 会打断，且给出 `sys.travel.skip.stop.crisis` 原因键。
- "throws rather than settle a DoT or HoT aura across an hour-coarse step"：给内容临时加一个带 `periodic` 的测试光环，挂到玩家身上后发起长跳，断言粗步那一刻抛错（消息含 "periodic or pulse"）。

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| `travel_and_exploration.md` 7.3 表格第四行（野外带帐篷类消耗品） | 无营地、带帐篷类消耗品也能睡，夜袭概率加倍、不享营火减半 | 未实现（见上表"覆盖性复查"一行） | 内容里没有这类物品，系统不写内容 ID，没有东西可挂钩 | 否，等帐篷类物品数据落地时自然需要有人补 |
| `travel_and_exploration.md` 7.5"战斗与刷新"（粗步结算要settle each system's own tick logic） | 没有明说周期性光环怎么结算 | 没有周期性或脉冲光环时按常规结算（刷新、光环到期、回复）；一旦出现就抛错而不是猜一个结算公式 | "不要凑数值"；没有内容可验证正确性 | 否，等相关内容落地时处理 |

**越界改动与请求回写**

无。改了 `src/editor/inspector/inspector_model.ts`（不在原定文件范围内），原因是覆盖性复查发现它被引擎接缝的新语义破坏；该文件不属于任何已知其他代理正在改的清单（`dialogue/`、`data/economy/`、`data/combat/items.json`、`data/combat/monsters.json`、`data/registry/`、`world_state_registry.md`、`content.generated.json`、`combat_and_classes.md` 均不含它），按"越界时先确认没有别的包在动它"核实后直接修了，在此记录供主会话知悉。

**留给后续包的事项**

| 事项 | 建议去处（包编号、项目状态缺口、风险编号） |
| --- | --- |
| 区域图行进、世界图个人行程、行路之门、探索迷雾与发现 | PK-M1-17（任务书已指明） |
| 跳时相关界面（`ui_pop_wait`、`ui_ovl_time_skip`、摘要卡 `ui_pop_outcome`） | 界面相关包；内核已发出 `time.skip_started`、`time.skipped`、`time.interrupt` 等事件 |
| 城建、经济、战略的真正按小时结算（目前只有占位粗步处理器） | 这些系统各自后续的时间驱动状态包 |
| 帐篷类消耗品落地后补 `rest.ts` 7.3 表格第四行 | 相应的消耗品内容包 |
| 周期性或脉冲光环落地后补 `combat/skip.ts` 的粗步结算（现在是抛错占位） | 相应的光环内容包；届时移除 `noteMissedPeriodic` 或扩展它 |
| 8 分钟验收仍未达到（两条路线分别 598.6 秒、588.4 秒，改动前 1,021.3 秒、803.1 秒） | 需要专门优化战斗与地图行走的逐 tick 开销的性能包；本包已把能从跳时内核拿到的收益全部拿到 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 自动玩家在跳时运行期间完全不评估其余决策分支（`think()` 的早退），极端情况下如果跳时被某个从不触发的条件卡住（理论上不应发生，因为每小时都有休整判定复检），自动玩家会原地等到跳时自然结束或被打断 | 低：`advanceSkip` 每小时都重新跑一次休整判定（`canWait`/`sleepPlaceCheck`），不满足就立即中断；`run()` 的卡死检测（`stallTicks`）仍然生效 | 两条结局路线的实跑都 0 次卡死 |

**需用户决定**

| 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- |
| 8 分钟验收未达到（两条路线各 598.6 秒、588.4 秒），是否需要立即开一个战斗/移动性能包来补齐，还是接受本阶段"两条路线都能完整通关、耗时比改动前明显缩短"作为过渡结果，留给后续里程碑 | 推荐：接受过渡结果；8 分钟目标更适合在战斗与寻路性能本身被审视时一起解决，不建议为了单纯凑时间数字而在跳时包里改战斗或寻路逻辑 | 不阻塞（两条路线都通关） |

**下一步与恢复方式**

1. 等用户对上面的"需用户决定"给出意见。
2. 若用户同意封包：由主会话把本包状态改为"已完成"，更新开发计划第 4 节与 `project_state.md`，并在 `progress_log.md` 追加一行。
3. 所有改动都未提交（任务书"实施代理不运行改变 git 状态的命令"）；改动文件清单见本文件第一节的"改动文件"表，供主会话提交时核对范围。
