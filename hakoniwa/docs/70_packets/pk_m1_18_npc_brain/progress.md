# PK-M1-18 内置 AI：NPC 大脑与社会：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施、两轮覆盖性复查、修复 | NPC 大脑（需求、心情、五层根、动作库、十五种角色树、目标、主动、社交、传话、记忆与日记、认知台词、反应表、纷争决策点）、任务接缝（跟随、潜行察觉、跨图行走）、缺位变量、台词历史存档、`BtRunner` 存档；测试与"活着"验收 | 未提交 | 见 `verification_matrix.md` | 主会话提交；计划状态列建议改为"已完成"；计划范围栏回写（`README.md` 第 11 节） |

## 2. 汇报

### 2026-11-17 实施、覆盖性复查、修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/npc/brain/`（`index.ts`、`root.ts`、`step.ts`、`state.ts`、`view.ts`、`inputs.ts`、`predicates.ts`、`library.ts`、`roles.ts`、`role_effects.ts`、`mood.ts`、`sense.ts`、`initiative.ts`、`social.ts`、`memory_rules.ts`、`reactions.ts`、`disputes.ts`、`absence.ts`、`quest_orders.ts`、`barks.ts`、`speech.ts`） | 新增 | NPC 大脑全部模块，说明见 `README.md` 第 2 节 |
| `src/systems/npc/traits.ts`、`wallet.ts`、`routes.ts` | 新增 | 性格词到特质码与人格维度；可支配的钱与虔诚度；跨图行走 |
| `src/systems/npc/`（`actions.ts`、`chat.ts`、`constants.ts`、`diary.ts`、`index.ts`、`memory.ts`、`needs.ts`、`plan.ts`、`ports.ts`、`relations.ts`、`schedule.ts`、`spawn.ts`、`trait_words.json`、`types.ts`） | 修改 | 九项需求、大脑状态类型、事件与命令（`npc.follow`、`npc.watch`、跨图 `npc.goto`）、整点与节拍驱动、互动与轨迹、日记打分与心情收尾、被捕缺位、特质匹配 |
| `src/systems/cognition/spread.ts` | 新增 | 千门提示注入传闻池、邻镇的路上传播、广播 |
| `src/systems/cognition/`（`index.ts`、`witness.ts`、`comedy.ts`、`rumor.ts`、`rumor_text.ts`） | 修改 | 目击者逐人走反应表、身份暴露事件、说话时刻、守秘者与兴趣排序、提示传闻的文本 |
| `src/systems/dialogue/speak.ts`、`lines/trust.ts` | 新增 | 说一句台词（回退链、账本、记忆与日记填充）；信任档与时段 |
| `src/systems/dialogue/`（`index.ts`、`replies.ts`、`session.ts`、`types.ts`、`lines/index.ts`、`intent/respond.ts`） | 修改 | 台词与吠叫账进存档、问候（开场白、信任档、时段）、闲聊提起记忆与日记、冒犯计数、意图分类器读词典的 `traits`、`roles` 表、`repeat_today` 与重复示好按冒犯计 |
| `src/content/packs/npc.ts` | 修改 | 装载 `data/npc/brain/`；校验角色、追求（地点、时段、条件解析、条件只读已登记变量）与大脑内容 |
| `data/npc/brain/actions.json`、`roles.json`、`reactions.json` | 新增 | 通用动作库与特质维度表、十五种角色树、反应表 |
| `data/npc/personas.json` | 修改 | 53 名有名 NPC 的 `roles`；十人的 `pursuits` |
| `data/dialogue/lines/ln_common.json` | 修改 | 问候（信任档与时段）、吠叫、反应、闲聊与提起记忆、日记的通用层台词（只追加，不改已有序号） |
| `locales/zh-Hans/sys_npc.json`、`sys_cognition.json` | 修改 | 大脑注记与理由、记忆模板与短语、日记心情与收尾、提示词、拒绝原因、旅人与提示传闻 |
| `src/core/brain/bt.ts` | 修改（越界，加法） | `BtRunner.snapshot()`、`restore()`；恢复的 `usel` 次序与当前子树不符时重排并从头运行 |
| `src/systems/quests/objectives.ts` | 修改（越界，一行） | `npc.goto` 派发带上 `mapId`（跨图） |
| `src/systems/doors/keys.ts` | 修改（越界，小） | `personAbsent` 读 `captured`、`hostile`、`at_spring` |
| `tests/npc_brain.test.ts`、`npc_society.test.ts`、`npc_cognition_arcs.test.ts`、`npc_alive.test.ts`、`npc_alive_harness.ts`、`npc_disputes_brain.ts`、`tests/playthrough/npc_alive_1` 到 `_4.playthrough.test.ts`、`npc_alive_group.ts`、`npc_disputes.playthrough.test.ts` | 新增 | 见 `verification_matrix.md` |
| `tests/lines.test.ts`、`tests/npc.test.ts`、`tests/intent_classifier.test.ts`、`tests/time_skip.test.ts` | 修改（越界，小） | 通用层追加台词后的切片下标；俭省的佩德在家吃、希雅的信任乘数、日记最后一条带心情收尾；重复示好的用例；营地睡眠用例的超时放到 120 秒（24 局整局游戏，镇上整点的 NPC 大脑让它在全套并行时超过 30 秒） |
| `docs/40_design/world_state_registry.md` | 修改 | 新行 `npc.<人>.captured`、`.hostile`、`.at_spring`（布尔，可回写）；`npc.<人>.dead` 的写入者加 npc |
| `docs/40_design/systems/builtin_ai.md` | 修改 | 第 5.6 节反应表的数据落点与 `cond` 字段；第 14.2 节口径的落实；第 18 节存档里的大脑状态 |
| `data/registry/vars.json`、`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 工具重生成 | `node tools/registry/build.ts`、`node tools/i18n/gen_keys.ts`、`node tools/i18n/extract_content.ts`（同时带进了他包同期的改动） |
| `docs/70_packets/pk_m1_18_npc_brain/` | 新增 | 本目录三件 |

`src/systems/disputes/` 未改：大脑经它的导出 `decisionMenu`、`decisionUtility`、事件 `dispute.decision_opened`、`dispute.decided` 与命令 `disputes.decide` 接入。

**新登记的注册表变量**：`npc.<人>.captured`（布尔；剧情写，被捕期间为真）、`npc.<人>.hostile`（布尔；npc 镜像）、`npc.<人>.at_spring`（布尔；npc 在有名将领死后 7 日内为真）；`npc.<人>.dead` 的写入者加 npc。

**决定**

| 决定 | 理由 |
| --- | --- |
| 大脑内容是数据（`data/npc/brain/`），谓词、输入、效果是代码里的封闭名单，内容校验对照名单 | 加角色动作与反应行不改代码；拼错的名字在数据门报出 |
| 反应表的条件写在 `cond` 字段，不写成 `when` | 注册表的揭示台账规则扫描全部内容的 `when` 字段当作世界状态条件；反应谓词不是世界状态 |
| 行为树的条件放在装饰器外层 | `once` 在进入时记日、`cooldown` 在子节点结束后计时、`throttle` 在进入时记次：条件放在里面会在条件不成立时也耗掉次数 |
| 目标追求排在职责之前 | 追求段是当天计划的一部分（第 3.2 节第 4 步），它的时段不是职责时段 |
| 搭话的"一图一小时三次"在开口时计数 | 走过去没说上话（玩家走开、玩家忙）不该占名额 |
| 一个 tick 一人至多一句：先写记忆再判是否已说 | 认知转移总要记住，台词只是被同一 tick 的另一句盖过 |
| 玩家忙（对话、交易、过场、战斗）时不选也不开口搭话 | 第 3.4 节 |
| 闲聊门槛：双方好感都不低于 -20 才互动，否则擦肩而过；好感低本身不触发争吵 | 第 5.1 节表；"好感低于 -30 就吵"会让争吵自我强化 |
| 整点不打断进行中的搭话与拜访（威胁或危急需求例外） | 主动与社交层由节拍决定（第 3.1 节），整点重排会让人走到一半折返 |
| 危急的安全感与饥饿、精力一样压过职责；睡眠段不跑职责树 | 第 2.4 节 |
| 跨图行走一小时到不了城门就瞬移到目的地 | 不让路被堵的人永远卡在行走里（反指标"卡住"） |
| 日记：与玩家的交谈记 `withId: player`（加 4 分，轨迹满时不先丢）；当天最后一条以心情句收尾 | 第 5.4 节 |
| 指标 2 按执行段计；指标 5 的邻镇时间取中位数；脚本事迹每两到三天一件、2 到 3 阶、地点在玩家白天走动的社交场所里抽 | 见 [builtin_ai.md](../../40_design/systems/builtin_ai.md) 第 14.2 节"口径的落实" |
| 每 tick 的维护只扫缓存的有序 ID 表；谓词值在一次决策内记忆 | 第 16 节性能预算；角色树与 `usel` 打分会重复读同一谓词 |

**复查发现与处理**（新起的只读子代理两轮：先审全部改动，修复后再审修复本身）

| 发现 | 处理 |
| --- | --- |
| 三个缺位变量登记为"标记"（单调），但都会回写为假 | 改为"布尔"，重生成注册表 |
| 卡西安的追求促发条件读未登记的 `a1_witch_trial` | 改为 `a1_witch_trial_started`；内容校验加"追求条件只读已登记变量"，补反例测试 |
| `repeat_today` 永远为假（无人写它读的键） | 改读当天的 `seen:<人>:<意图>` 标记，在回应后写入，只保留当天的；第二次起按冒犯计（第 6.4 节第 9 行）；补测 |
| 搭话检查的 `in_combat` 标签从不设置；交易与过场没排除 | 新 `playerBusy`（对话、交易、过场、战斗单位的 `combatUntil`）；四个分支各有测试 |
| 日记里"与玩家"的加分按名字匹配，永远不中 | 轨迹加 `withId`；补测 |
| 同一 tick 已说过话时认知转移的记忆被跳过 | 先写记忆再判断；补测 |
| `diaryMoodLine` 等十个导出无人用 | 删除；日记最后一条以心情句收尾；补测 |
| 若干测试不具判别力（停止搭话、决策点兜底、卡住指标恒为 0） | 停止搭话改为直接问大脑（解除停止后会搭话）；兜底用替身处理器截获 `disputes.decide` 的数据、来源与时刻；卡住指标改为"2 游戏日没有一个自由小时"（自由：日程或需求层，且不在交谈或跨图行走中） |
| 整点步覆盖进行中的搭话与拜访 | `heldByBeat`；补测 |
| 职责层不看时段、其他危急需求不压过职责 | 睡眠段不跑职责树，夜里不做的角色动作加 `!night`；危急安全感压过职责；补测 |
| 争吵门槛与好感互相强化；闲聊门槛缺失；只看一方 | 按第 5.1 节两方判断；补测（精确设值，避开固执者的 0.7 乘数） |
| 跨图行走不会放弃 | 一小时放弃并瞬移；旧存档无起始时刻时从读档起算；补测 |
| `senseThreat` 只在整点 | 节拍时也感知（玩家所在地图） |
| 轨迹满时与玩家的交谈先被丢 | 淘汰时跳过 `withId: player` |
| 恢复的 `usel` 次序过期时沿用旧的续跑下标 | 重排时清掉下标与子节点运行记忆；补测 |
| 告解的轨迹地点按神父的家图解析 | 按告解者的家图 |
| 没说出话也记一次与玩家的交谈 | 只在说出时记 |
| `speak` 在没有对话切片时崩溃；空台词用字面量 | 返回 null；空台词用键 `sys.dialogue.intent.fallback` |
| 校验器遇到非字符串地点会崩溃；字面量 28800 与 `'door_hint'` | 先判类型；改用 `TICKS_PER_GAME_DAY` 与 `HINT_TOPIC` |

## 3. 留给后续包的事项

| 序 | 事项 | 建议归属 |
| --- | --- | --- |
| 1 | 首领与官员经意图菜单发布委托、居民求助转请托（计划包行里的一句，主会话已确认不在本包） | PK-M1-19 或公会委托的后续包（主会话定） |
| 2 | 指标 8 女神的可见干预 | PK-M1-20 |
| 3 | 指标 10 经济活性：每个市场每周有调价（市场周的调价比例 0.75），但最长断货 24 到 26 天，远超 2 天；补货属经济系统 | 经济系统的后续包（第一幕可放进 PK-M1-31 的商品数据或 PK-M1-42 的回归；第二、三幕随 PK-M2-15） |
| 4 | 指标 11 官员自主（第一幕没有自治度 50 以上的聚落） | PK-M2 城建官员（内置 AI 第 19 节第 12 步） |
| 5 | 指标 12 队内闲聊 | PK-M1-21 |
| 6 | 身份暴露的其余五种事件源（`identity_door`、`identity_guest`、`identity_gatemark`、`identity_pressure`、`identity_matched`）；现在只有鉴定"无记载"会发 `identity.exposed` | 千门（门的进出被目击）随 PK-M1-56；客人与对号随 PK-M1-19 与 PK-M1-55；威压随战斗的后续包 |
| 7 | 反应表各行的"其他后果"：第 1 行 L1、L2 的重要通知；第 2 行指控进度 +1 与晚祷样本；第 4 行审判或逮捕的预兆步；第 5 行交易或要挟的对话选项；第 7 行服务价格修正；第 8 行请愿进官员请示队列；第 9 行守秘（不传播） | 通知随 PK-M1-22 或 PK-M1-57；指控与预兆随 PK-M1-55；对话选项随 PK-M1-19；价格随经济；请愿随 PK-M2 城建官员；守秘随认知的后续包 |
| 8 | 目标追求的 `urge` 只在同一小时多个追求到期时决定先后，还不是效用项（第 3.2 节"何时更想做"） | PK-M1-19 或内置 AI 的 M2 调优 |
| 9 | 记忆与日记的参数里人名、地名是显示名字面量（现有 NPC 系统的约定），多语言时应改成内容引用 | 多语言的发行工程包 |
| 10 | 进行中的搭话在玩家进入战斗或过场后仍会走到放弃时限（只是不开口） | 内置 AI 的 M2 调优 |
| 11 | `tests/art_manifest.test.ts` 失败是已知基线；本次全套还有五个失败来自他包正在改的 `data/world/atlas_maps.json` 与 `data/scenes/maps.json`（数据门 V1 报 `atlas_map ... marked planned`） | 对应他包 |
| 12 | 认知弧的种子间离散度大：十一种解释里有六种只能被"近处重复目击"（`repeat_close`）或"权威"（`authority`）推翻，而现在没有系统发出"权威"证据，近处重复也少，所以有的种子大半观察者在"误解"与"怀疑"之间循环；第 17.2 节第 6 行"每个种子不少于 4 条"要等这两类证据有来源 | 认知的后续包（公会升阶、官员与神职的认证发出 `authority`）；M1 门（PK-M1-10 或 PK-M1-42）复核 |
