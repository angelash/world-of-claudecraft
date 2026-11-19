# PK-M1-56 门效果读取方第一批：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-19 | 实施 1 | 前世之门读取方、灶火的庖厨之门与菜单、补授、门卡字段、北泉净化、死亡与复苏的身份暴露、门纹共鸣读数、校验与测试 | 未提交 | 见 `verification_matrix.md` | 覆盖性复查 |
| 2026-11-19 | 覆盖性复查与修复 | 新起子代理复查 18 条；修：补授从"只补技能"扩到技能、功能与随门开的门，并在开门时就记下门给过什么（之后被拿走的不再补回）；识才之门注视写 `npc.<人>.potential_seen`；渊契之门的 +10 淤塞只在第一幕开门时计；钥链接只给玩家接过的任务（`active`、`ready`、`done`），嵌套钥上的链接校验拒收；危险档字段改名 `dangerBand`（避开旧文档里"按门的 `danger` 字段计数"的说法）；随门开的门先置已开再应用效果；注册表补 `a1_town_dian` 的写入方与 `act_week` 的读取方；测试补真实死亡流程、关闭的门、旧存档的功能与赠门、校验反例、净化的幕与周、危险档 52 扇逐扇钉住 | 未提交 | 见 `verification_matrix.md` | 主会话提交；第 3 节请求分派；第 4 节待用户定 |

## 2. 汇报

### 2026-11-19 实施与复查修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/doors/readers.ts` | 新增 | `doorReaders`、`priceBand`、`nightSightRadius`、`rumorSourceTag`、`resonanceSteps`；功能旗标为假时返回空或 0 |
| `src/systems/doors/purify.ts` | 新增 | 命令 `doors.purify` 的处理 `purifySpring`、查询 `purifyOffer`；拒绝码 `locked`、`not_here`、`not_now`、`done`、`clear`；发 `doors.purified` |
| `src/systems/doors/exposure.ts` | 新增 | 玩家的 `entity.died` 在倒下处、`combat.player_returned` 在复苏处各发 `identity.exposed`（`identity_door`） |
| `src/systems/doors/talent.ts` | 新增 | 订阅 `cognition.appraised`：玩家的鉴定读出潜质时写 `npc.<人>.potential_seen`（一人一次） |
| `src/systems/doors/types.ts` | 修改 | `DANGER_BANDS` 与 `DoorDanger`；钥加 `link`；效果加 `door`；`DoorOpenCost`（`blockage`、`fatigue`、`act`）；`DoorReaders`；`DoorDef` 加 `dangerBand`、`openCost`；切片加 `granted`、`purifiedWeek`；事件 `doors.purified`；命令 `doors.purify`；内容表 `door_readers` |
| `src/systems/doors/effects.ts` | 修改 | 开门时把给出的技能、功能、随门开的门记进 `granted`；`door` 效果（`giftDoor`：先置已开，再写旗标、应用效果、发 `door.opened`，不计门阶值、封印、开门数与互斥）；`catchUpDoors`；闭门清掉该门的记录 |
| `src/systems/doors/index.ts` | 修改 | 开门结算第 2 步后按 `openCostNow` 加淤塞与门疲；千门 tick 与跳时都跑 `catchUpDoors`；死亡与复苏的身份暴露；`cognition.appraised` 处理；命令 `doors.purify`；导出读取方与 `purifyOffer` |
| `src/systems/doors/costs.ts` | 修改 | `openCostNow`（开门结算与门卡预览共用） |
| `src/systems/doors/view.ts` | 修改 | `dangerName`、`doorDanger`、`exclusionPreview`；`DoorView` 加 `dangerBand`、`dangerLevel`、`costPreview`、`exclusiveWith`（类型上可缺省，内核总是填，界面手写的测试夹具可以不写）；钥的 `link` |
| `src/systems/doors/keys.ts` | 修改 | `KeyProgress.link` 的类型 |
| `src/content/packs/doors.ts` | 修改 | 表 `door_readers`；字段 `dangerBand`（必填）、`openCost`；`validateReaders`；危险档、开门代价、钥链接、嵌套钥链接、`door` 效果的校验 |
| `data/doors/readers.json` | 新增 | 四个读取方的功能名与数字、北泉的地点与变量 |
| `data/doors/doors.json` | 修改 | 52 扇门各加一行 `dangerBand`（取门目录第 6 节的危险栏）；算盘、夜灯、笔记各加一个功能效果，灶火加 `door` 效果（`craft_cooking`）与物品 `lb_otherworld_menu`，四扇的 `desc` 补写新效果；借形之门加功能 `spring_purify`、三把钥加 `link`、`desc` 补写；渊契之门的钥加 `link`，加 `"openCost": { "blockage": 10, "act": 1 }`。其余门记录除那一行危险档外不变，`boss.seg_oneeye_duel.defeated` 原样 |
| `locales/zh-Hans/sys_doors.json` | 修改 | `sys.doors.reject.purify_*` 五条、`sys.doors.info.purified`、`sys.doors.danger.*` 五条 |
| `tests/doors_readers.test.ts` | 新增 | 31 条 |
| `tests/doors_harness.ts` | 修改（小） | 测试门 `door()` 默认 `dangerBand: 'none'`（加一行） |
| `locales/zh-Hans/ui.json` | 修改（越界，加 4 键） | 见下方"共享文件的准确改动"第 1 条 |
| `docs/40_design/world_state_registry.md` | 修改（越界，三行） | 见下方第 2 条 |
| `data/registry/vars.json` | 重生成（越界） | `node tools/registry/build.ts`；属于本包的变化只有 `a1_town_dian` 的写入方加 `doors`、`act_week` 的读取方加 `doors`；文件里另有并行包的变化（`a1_janu_dream_words` 一条、`quest.<quest>.path` 的写入方） |
| `src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 重生成（越界） | 含并行包同时加的键 |
| 本目录 | 新增 | 三件套 |

**共享文件的准确改动**

1. `locales/zh-Hans/ui.json`，按字母序插入四行：

```
  "ui.common.feature.night_sight": "夜视",
  "ui.common.feature.price_band": "估得出进价",
  "ui.common.feature.rumor_source": "传闻记来源",
  "ui.common.feature.spring_purify": "净泉",
```

2. `docs/40_design/world_state_registry.md`：
   - `feature.<功能>` 一行的取值，在 `craft_weaponcrafting` 那一组（七扇第一幕生业之门的层一）之后接"、`price_band`、`night_sight`、`rumor_source`（前世之门算盘、夜灯、笔记的开局差异，链到序章 2.2）、`spring_purify`（借形之门的北泉净化，链到一幕 7.2）"，两处链接在注册表里写作相对 `docs/40_design/` 的路径 `../30_story/arcs/prologue_antechamber.md` 与 `../30_story/arcs/act1_borderstone.md`；
   - `a1_town_dian` 一行的写入方，在"任务效果（A1-M07 堵暗渠 -20）"之后接"；doors（借形之门的北泉净化，每周一次 -10，`data/doors/readers.json`）"；
   - `act_week` 一行的读取方，在"传书"之后接"、doors（北泉净化的每周一次）"。

3. `tests/doors_harness.ts` 的 `door()`：`seal: 'none',` 之后加 `dangerBand: 'none',`。

**交付物落地情况**

| 序 | 交付物 | 结果 |
| --- | --- | --- |
| 1 | 前世之门读取方 | 算盘：`priceBand(world, content, base)` 给出 `[floor(base×(1-宽度)), ceil(base×(1+宽度))]`；夜灯：`nightSightRadius` 给出夜间视野半径；白衣：`sk_door_firstaid`（"止血、包扎，八秒内缓慢恢复生命"）就是包扎，测试钉住；笔记：`rumorSourceTag(world, content, { from, hops })` 给出来源人与"可能失真"（转述过的传闻都标，因为认知系统每一次转述都可能走样，只有玩家亲眼所见的不标）；灶火：庖厨之门开局即开，门阶值、封印、开门数都不动，背包里有《异界菜单》。界面接线是请求 1 |
| 2 | 识才之门潜质行 | 鉴定读潜质原已接（认知系统）；补了注视旗标 `npc.<人>.potential_seen` 的写入（注册表写明由识才之门注视写，此前只有两段过场写）；第一幕 5.3 的十人逐人测试 |
| 3 | 渊契之门旧存档补授召唤 | `catchUpDoors`：已开之门的技能、功能、随门开的门，`granted` 里没有的补一次；开门时也记，所以之后被别的规则拿走的不会补回；闭门清记录；物品与旗标不补（可能卖掉或用掉，见第 3 节遗留 7） |
| 4 | 门视图字段 | 五档危险（52 扇按门目录第 6 节逐扇写入并校验）、代价预览、互斥对象（与开门时的互斥结算同一套判定，只列已显影且仍可变的门；幕锁只在其幕）、"去哪里找"（钥数据写 `link`，玩家接过该任务才给；本包给借形与渊契之门的四把钥写了链接） |
| 5 | 借形之门净化北泉 | 命令 `doors.purify`：功能 `spring_purify`、站在 `borderstone` 的 `north_spring` 地点里、`act == act1`、当前 `act_week` 未净化过、`a1_town_dian` 高于下限 0；减 10；发 `doors.purified`。界面的交互提示是请求 1 |
| 6 | 身份暴露的门来源 | 死亡（倒下处）与复苏（出现处）已接；门内庭院的进出是请求 4；进出回廊是意识里的事、身体不动，不算；行路之门的门标传送等它的模块落地（遗留 3） |
| 7 | `door_resonance` 读取 | `resonanceSteps(world, mapId)`，按通道封顶 0 到 3；读数的消费方（共鸣之门的门纹觉醒）是遗留 4 |
| 8 | 测试与检查 | 见 `verification_matrix.md` |
| 9 | 实施包三件套 | 本目录 |

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 千门 21.1 | `DoorDef` 没有危险字段 | 加 `dangerBand`（门目录 1.7 的五档） | 界面 9.5 要 `dangerLevel`，门目录每扇门有危险栏；字段名避开旧说法里的 `danger` | 否 |
| 千门 7 | 效果类型表没有"送一扇门" | 新效果 `door`（随本门一起开的门） | 千门 14 末行要灶火前世自带庖厨之门层一；放在灶火门上最直接，且本包只能改前世门的记录 | 否 |
| 千门 6.2 | 渊契之门第一幕版本开门淤塞 +10 | 写成门数据 `openCost`（带 `act: 1`），开门结算第 2 步后应用 | 门卡的代价预览与结算读同一处；第三幕钥（`keySets`）未实现，`act` 先把 +10 限在第一幕 | 否 |
| 一幕 7.2 | "借形之门开启后在北泉净化，每次 -10（每周一次）" | 周取 `act_week`；只在第一幕（`a1_town_dian` 是第一幕变量）；变量已在下限时拒收 | 与澱病系统的周结算同一个周旗标 | 是（第 4 节第 5、6 条） |
| 序章 2.2 | 算盘"大致进价区间"、夜灯"夜间视野更远" | 区间宽度与夜视半径写成数据，取值待定 | 文档没给数 | 是（第 4 节第 1、2 条） |

## 3. 请求与遗留

**请求（交给别的包）**

| 序 | 请求 | 准确内容 | 接收方 |
| --- | --- | --- | --- |
| 1 | 客户端接上读取方 | 交易窗口每行显示 `priceBand(world, content, base)`，`base` 取报价的 `base` 行（物品价值乘市场系数），为空不显示；夜间视野半径取 `nightSightRadius(world, content)`，为空时用迷雾的夜间半径（行进 6.1：夜里 8）；传闻簿与任务日志的传闻条目调 `rumorSourceTag`，非空时标来源人与"可能失真"；北泉：`purifyOffer` 非空时在交互提示里给"净化"，按下发 `doors.purify {}`，`ready` 为假时按 `block` 写原因；回廊门卡渲染 `dangerName(dangerBand)` 与 `dangerLevel` 道裂纹、`costPreview`、`exclusiveWith`（"开这扇，那一扇会关上"，只用列出的门）、钥的 `link`（"去哪里找"跳到任务日志） | 客户端（回廊与 HUD：PK-M1-22 的后续；交易与传闻窗口：PK-M1-23） |
| 2 | 包扎只在脱战后可用 | 技能的 `requires` 加"仅脱战"（例如 `outOfCombat: true`），`sk_door_firstaid` 写上 | 战斗 |
| 3 | 传闻簿给出转述跳数 | `src/systems/cognition/queries.ts` 的 `RumorBookEntry` 加 `hops: number`（取持有记录的 `h.hops`），请求 1 的传闻标签要用 | 认知（PK-M1-19 的后续） |
| 4 | 门内庭院进出的身份暴露 | `src/systems/city/court.ts` 的 `enterCourt`：把 `returnTo` 的那个对象存成 `const from = { mapId: p.mapId, x: p.x, y: p.y }`，传送成功后 `ctx.emit('identity.exposed', { kind: 'identity_door', ...from })` 再返回 `ok(...)`；`leaveCourt`：传送成功后取 `playerEntity(ctx.world)`，在它的 `mapId`、`x`、`y` 发同一事件。不能靠千门订阅 `world.map_changed`：过场也会把玩家传进庭院（`data/scenes/act1.json`），那不是从门里进出 | 城建的庭院（PK-M1-53） |
| 5 | 被信徒目击的死亡只反应一次 | 战斗在倒下处发 `feat.performed`（`door_return`，只在信徒目击时），认知据此让目击者按 `feat_seen` 反应；本包又发 `identity_door`，NPC 再按反应表反应一次。请在 `onIdentityExposed` 里跳过同一 tick 已对同一处的事迹反应过的人（或合并两条），见第 4 节第 3 条 | NPC 大脑（PK-M1-18 的后续） |

**遗留**

| 序 | 事项 | 去处 |
| --- | --- | --- |
| 1 | 扳手（修理、陷阱与机关、承重点）、路标（地图记忆）、讲台（初次对话的信任起点）三扇前世之门的读取方；夜灯的"夜间行动不额外消耗体力"（现在没有体力模型）；夜灯在兽潮之夜减轻黑暗惩罚（兽潮系统读 `nightSightRadius` 或 `feature.night_sight`） | 门效果读取方第二批；兽潮（PK-M1-52 的后续） |
| 2 | 瑕之门的纹感 `doorsense`（靠近门纹持有者手背发热）：门纹持有者的判定与距离文档都没给 | 门效果读取方第二批（距离要用户定） |
| 3 | 行路之门门标传送的身份暴露（千门 8 第 13 行"信徒视线内传送记目击"） | 行路之门的模块 `src/systems/world/gates.ts` 落地时 |
| 4 | `resonanceSteps` 的消费方：共鸣之门的门纹觉醒与遗民凝聚 | 共鸣之门所在的千门后续包 |
| 5 | 传闻作为"去哪里找"的链接（界面 9.3"任务或传闻"）：要认知给出"玩家是否听过某条传闻"的查询 | 认知的后续包，接着本包的 `link` |
| 6 | 其余门的钥链接（本包只给借形与渊契之门写了） | 门数据的后续批次（PK-M1-32 的后续或 PK-M1-33） |
| 7 | 旧存档的灶火前世补《异界菜单》：补授不补物品（可能卖掉或用掉），要存档迁移按"灶火门已开且全身上下没有这本书"补一次 | 存档迁移（发行工程，M2 起承诺兼容） |
| 8 | 破门之门开门淤塞 +20（千门 6.2）的数据 `"openCost": { "blockage": 20 }` | 破门之门所在的千门后续包 |
| 9 | 千门 6.2 的失灵落地时：失灵挂起效果不要动 `granted`，补授就不会把挂起的技能补回 | 失灵所在的千门后续包 |
| 10 | 渊契之门的第三幕钥（`keySets`）落地时，+10 淤塞只属于第一幕钥（现在用 `openCost.act` 限在第一幕） | 同上 |
| 11 | 《异界菜单》"前三页"的分页：物品没有页的概念，现在给的是一本 | 生业的后续（异界料理的口述档与书斋档） |

## 4. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 算盘前世的进价区间宽度（`data/doors/readers.json` 的 `priceBand.spread`）与基准 | 推荐上下各 20%（0.2），基准取报价的 `base` 行（物品价值乘市场系数）；或 10%（更准，近乎直接给答案）、30%（更粗）；基准也可改取中间价（含供需与修正项） | 不阻塞 |
| 2 | 夜灯前世的夜间视野半径（`nightSight.radius`，格） | 推荐 12（与白天一样，行进 6.1 白天 12、夜里 8）；或 10（介于其间，夜里仍比白天短） | 不阻塞 |
| 3 | 被信徒目击的死亡会让同一人反应两次（事迹一次、身份暴露一次） | 推荐 NPC 大脑按 tick 合并（请求 5）；或千门只在复苏处发、倒下处不发；或战斗不再为死亡发 `door_return` 事迹 | 不阻塞 |
| 4 | 灶火前世送出的庖厨之门照常发 `door.opened`：女神雅努的"开门数"、任务的已开门表、导演的最近开门时刻都会记上它 | 推荐保留（回廊里它确实是开着的门）；或给事件加"赠门"标记让这些读取方跳过（要改核心的共享事件） | 不阻塞 |
| 5 | 北泉净化只在第一幕（`when: act == act1`） | 推荐保留（`a1_town_dian` 只在第一幕结算）；或不限幕 | 不阻塞 |
| 6 | 泉水已在下限时拒绝净化（不占本周次数） | 推荐保留；或照样成功并占掉本周 | 不阻塞 |

## 5. 延后测试

| 套件或命令 | 为什么可能受影响 |
| --- | --- |
| `npm test` 全量 | 门数据每扇多一行危险档；开门记 `granted`；新的身份暴露会让 NPC 在玩家死亡处与复苏处反应；任何按世界快照或事件条数的断言可能变 |
| `npm run playthrough`（`release`、`act1_minimal`） | 通关路线上的死亡与复苏产生反应与记忆；灶火路线开局多一扇已开的门；渊契路线开门多 10 淤塞；补授在旧存档夹具上的表现 |
| `tests/autoplay_*.test.ts` | 自动玩家的门路线与淤塞 |
| `tests/client_windows.test.ts`、`tests/client_records_windows.test.ts`、`tests/client_tutorial.test.ts` 以外的教程套件 | 门视图多了字段；`tut_a1_talent` 现在任何一人的潜质被看见都会完成 |
| `tests/save_migration.test.ts` 的冻结存档 | 已跑通过；但旧存档读档后第一次千门 tick 会补授并写 `granted`，按存档快照比对的套件可能变 |
