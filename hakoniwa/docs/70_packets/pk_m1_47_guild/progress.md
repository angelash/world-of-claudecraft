# PK-M1-47 公会登记与委托板内核：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施 1 与 QA 1 | 公会系统、任务实例接缝、内容包与数据、注册表行、两组单测；新起会话审查一次后按审查修改 | 未提交 | 见 `verification_matrix.md`：两组单测 53 条通过；受影响的套件 481 条中 480 条通过（唯一失败属音频包）；内容校验全绿；两条通关路线通过 | 主会话提交；PK-M1-33 接上 A1-M03、A1-M04 并导入全部模板 |

## 2. 汇报

### 2026-11-17 实施 1 与 QA 1

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/guild/index.ts` | 新增 | 系统（相位 82）、命令 `guild.register`、`guild.accept`、`guild.turn_in`、`guild.abandon`、`guild.promote`，订阅 `world.hour`、`flag.changed`、`quest.completed`、`quest.failed`、`quest.expired`、`director.move` |
| `src/systems/guild/types.ts` | 新增 | 数据与切片的形状、封闭集合（级别、委托种类、距离、目标、事件类别与来源、严重度、喜剧桥段） |
| `src/systems/guild/formulas.ts` | 新增 | 报酬、经验、难度、递减、抽成、违约金 |
| `src/systems/guild/ranks.ts` | 新增 | 级别顺序、晋升条件、级别门槛 |
| `src/systems/guild/board.ts` | 新增 | 登记、晋升、每周补足、挂单抽取、接下与实例化、结算、违约、并入主线的首个实例、紧急委托与加价 |
| `src/systems/guild/instance.ts` | 新增 | 由模板与挂单生成 `commission` 种类的任务定义 |
| `src/systems/guild/events.ts` | 新增 | 动态事件内核：触发、预兆与预留、前兆、仲裁、落地、结束、传闻与喜剧、导演 |
| `src/systems/guild/slice.ts` | 新增 | 切片、首次使用时创建、存档校验、`idFields` |
| `src/systems/guild/view.ts` | 新增 | 委托板窗口的数据面 `boardView` |
| `src/systems/quests/instances.ts` | 新增 | 任务实例接缝：`addQuestInstance`、`questDefOf`、`allQuestDefs`、`dropQuestInstance`、`questTitle` |
| `src/systems/quests/types.ts` | 修改 | `QuestDef.textOf`、`QuestsSlice.instances` |
| `src/systems/quests/progress.ts` | 修改 | `startQuest`、`activeQuests` 经 `questDefOf` 查定义 |
| `src/systems/quests/outcomes.ts` | 修改 | `settleOutcomes` 含实例；结局事件的标题用 `questTitle` |
| `src/systems/quests/view.ts` | 修改 | 日志能看到实例；`QuestView.textOf` |
| `src/systems/quests/index.ts` | 修改 | 接、交、抉择与对话里的交付经 `questDefOf`；标题用 `questTitle`；导出接缝 |
| `src/content/packs/guild.ts` | 新增 | 内容表 `guildConfig`、`guildBoards`、`commissions`、`dynamicEvents`，导演菜单项 `directorMenu`（由导演类事件生成）；校验器 |
| `data/guild/config.json`、`boards.json`、`commissions.json`、`events.json` | 新增 | 级别表与公式系数、两块板、9 个委托模板、7 个动态事件 |
| `locales/zh-Hans/sys_guild.json` | 新增 | 拒绝原因、成功说明、级别名 |
| `tests/guild.test.ts`、`tests/guild_events.test.ts`、`tests/guild_harness.ts` | 新增 | 36 条与 17 条单测，及其测试台 |
| `docs/40_design/world_state_registry.md` | 修改 | 第 2.3 节镜像行加 `guild.`、`ev.`；第 8.2 节 `guild_rank` 的写入者与读取处；第 8.6 节新增 6 行；第 8.7 节 `cmm_count.<模板>` 的写入者与读取处 |
| `tools/registry/parse.ts` | 修改 | 写入者系统加 `guild`（一行） |
| `tools/content/validators/namespace.ts` | 修改 | `ev_` 归 `dynamicEvents` 与 `directorMenu`，`cmm_` 归 `commissions` |
| `data/registry/vars.json`、`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 生成 | `node tools/registry/build.ts`、`node tools/i18n/gen_keys.ts`、`node tools/i18n/extract_content.ts` |
| `docs/70_packets/pk_m1_47_guild/` | 新增 | 本目录三件 |

**公式（按实现）**

| 量 | 实现 | 出处 |
| --- | --- | --- |
| 报酬 | `round5(级基价 × 类型系数 × 难度系数 × 距离系数)`，夹在该级区间内；紧急委托在夹之后乘 1.5 再取整到 5 | 目录第 2.3 节；社会第 3.3 节的区间；目录第 5.6 节的紧急委托 |
| 难度 | 委托等级减该级中位等级：≤ -3 为 0.8，≤ 2 为 1.0，≤ 5 为 1.3，其余 1.6 | 目录第 2.3 节 |
| 经验 | `round5(xpForLevel(委托等级) × 级系数 × 类型修正)`，再乘本周递减（1、0.5、0.25，`cmm_count.<模板>` 每个历法周首归零），再取整到 5 | 目录第 2.4 节；成长第 3.1.2 节 |
| 零经验差 | 玩家等级减委托等级达到 `zeroDiff(玩家等级)` 时经验为 0，报酬照付 | 目录第 2.4 节；与战斗的 `mobXpValue` 同界 |
| 公会抽成 | `round(报酬 × 15%)`，委托方另付，冒险者到手全额；告示板的讨伐状不抽 | 社会第 3.3 节；目录第 2.1 节 |
| 违约金 | `round5(报酬 × 20%)`，放弃与逾期时由公会扣，玩家钱不够时扣光为止 | 社会第 3.3 节；目录第 2.2 节 `penalty` |
| 登记费 | 柜台登记 100 铜；剧情登记不另收（A1-M03 的赏金在任务金钱里抵掉） | 社会第 3.4 节；目录第 5.2 节 |

数据里 9 个模板的报酬与经验逐个等于目录第 5.6 节的数（单测 `reproduces the pay and experience of catalog 5.6`）：
地窖老鼠 65 与 45、采药 55 与 55、送信 40 与 35、失物 65 与 70、东林狼群 240 与 125、东栅守夜 240 与 260、北部澱狼 575 与 315、讨伐状 575 与 250、荒原骸骨 865 与 380。

**动态事件的密度实测**（`tests/guild_events.test.ts` 的 `measured density over twenty seeds`，每个种子跑完第一幕的 12 周再加 6 天）

| 数据 | 事件 | 每周 | 同聚落同时进行的严重事件 | 严重事件起点最小间隔 | 同区域魔物潮最小间隔 | 预兆最小提前 | 同聚落同桥段每日 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 第一幕数据（7 个事件） | 20 个种子共 60 件 | 0.25 | 0 | 无 | 无 | 3 日 | 0 |
| 加压集合（数据加 4 个每日 40% 的严重聚落事件、1 个每日 50% 的魔物潮、2 个每日 80% 的喜剧桥段） | 20 个种子共 2,015 件 | 8.50 | 2 | 7 日 | 14 日 | 3 日 | 1 |

目录第 3.2 节的范围：至多 2 件、间隔不少于 7 日、魔物潮冷却 14 日、预兆至少 3 日、每日至多 1 次，两组都在范围内。

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 注册表第 6.1 节与目录第 1.2 节 | 注册表写 `cmm_<定级>_<三位>_<slug>`、`ev_<来源>_<三位>_<slug>`；目录写 `cmm_<首个适用幕>_<短名>`、`ev_<首个适用幕>_<短名>` | 按目录（编号的主人），例 `cmm_a1_cellar_rats`、`ev_a1_tide_omens`；实例的数据编号 `gc_f_001`，显示编号 `GC-F-001` | 两份文档冲突，目录是编号的主人且已全量用这种写法 | 是（推荐改注册表第 6.1 节） |
| 目录第 2.4 节 | 委托等级取目标等级的中位 | 模板写定 `level`，校验它落在目标魔物的等级区间内 | 目录第 5.6 节的数按"中位"取的值并不都是算术中位（灰狼 2 到 4 取 4），写定才能复现表里的数 | 否 |
| 目录第 2.4 节 | 玩家高出委托等级"超过"零经验差时为 0 | 达到零经验差即为 0 | 与经典击杀经验在同一界上归零（战斗的 `mobXpValue`） | 否 |
| 社会第 3.1、3.2 节 | 定级以鉴定水晶读出的等级为门槛 | 玩家的卡永远读 Lv1（无记载），等级门槛对玩家不自动打开；无考核的 E 级按条件自动晋升（对能读出等级的卡），考核结果与实绩认定经 `guild.promote`（只收剧情与内核），实绩认定可跨级并在卡上记"实"（`guild.practical`） | 社会第 3.2 节的实绩认定；第二幕"B（实），Lv1" | 否 |
| 目录第 2.1 节 | 边石分部"可接定级 F、E；与 D 级以上同行者同队时按队长定级" | 板的门槛：自身级别或带队的公会冒险者的级别加板的余量（边石分部 0），且不低于板对任何会员开放的级别（边石分部 E）；告示板谁都能接 | 第一幕玩家始终是 F 级（分幕文档），靠板的开放级别接 E，靠罗恩（D 级）带队接 D | 否 |
| 目录第 5.2 节 A1-M03 | 100 铜赏金"正好抵掉 1 银登记费" | 剧情登记（`registration.when`）不收费，柜台登记收 100 铜 | 费用由该任务的金钱自己结清，避免重复扣；导入时（PK-M1-33）按目录写任务金钱 | 否 |
| 目录第 5.6 节 `cmm_a1_night_watch` | 东栅守一夜 | 三段：到岗、守满 8 小时、天亮时仍在岗 | 任务模型还没有"留在某处"的目标，先用到岗与交班的两次到达把守夜钉住 | 否（遗留见下） |
| 目录第 3.2 节 | 魔物潮与灾害提前 3 日出预兆 | 带预兆的事件只在它落地那天的位置空着时才宣布，宣布即预留位置（严重事件的上限与间隔、魔物潮冷却），宣布后一定落地，按 tick 计满整 3 日 | 宣布了却不来会骗玩家；按 tick 计才是真的"提前 3 日" | 否 |
| 目录第 5.7 节 `ev_a1_beast_season` | 讨伐委托挂单数 +2 | 事件进行期间，板在每周补足时额外抽 2 件讨伐类，可超出平时的同时挂单上限 | "+2"就是让板上多出这些挂单 | 否 |
| 任务与事件第 2.2 节第 2 条 | 链内让路：延后到窗口之后 | `yieldWhile` 成立时一直等，不因等待太久而放弃；因密度被挡的超过 14 日才放弃 | 让路是推迟，不是取消 | 否 |
| 实现约定第 6 节第 7 条 | 只导入 world、inventory、modifiers 与 core | 另导入认知的 `seedRumor`、`addHolding`、`witnessVersion`、`comedyGate`，任务的 `startQuest`、`finishQuest`、`failQuest`、`conditionHolds`、`atPlace`，同伴的 `isInParty`，战斗的 `xpForLevel`、`zeroDiff` | 都是这些系统导出的端口或纯函数；包行要求复用传闻、喜剧与导演引擎；导演一侧零改动（事件作为导演菜单项） | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `src/systems/quests/types.ts`、`progress.ts`、`outcomes.ts`、`view.ts`、`index.ts`，新增 `instances.ts` | 任务实例接缝（包行要求委托作为任务实例运行） | 叙事（任务） | 已改，各几行 |
| `tools/registry/parse.ts` | 写入者系统名单加 `guild` | 内核（PK-M0-27 的工具） | 已改，一行 |
| `tools/content/validators/namespace.ts` | `ev_`、`cmm_` 的内容表 | 内核 | 已改 |
| `docs/50_tech/architecture.md` 第 4.6 节 | 相位表加一行：82 guild，公会登记与晋升、委托板、动态事件 | 内核 | 请求回写 |
| `src/content/entity_kinds.ts` | 把 `commissions`、`dynamicEvents`、`guildBoards` 登记为实体种类，让内容 ID 守卫也盯住它们 | 内核 | 请求回写 |
| `src/content/references.ts` | 加引用行：`commissions` 的 `boards[]`、`givers[]`、`places[].mapId`、`goal.targets[]`、`goal.items[]`、`goal.to[]`、`firstIn`；`dynamicEvents` 的 `maps[]`、`hooks.post[]`、`hooks.urgent[]`、`precursor.event`、`rumor.tellers[]`；`guildBoards` 的 `mapId`、`receptionist` | 内核（本轮 PK-M1-26 在改） | 请求回写（本包的校验器已逐项检查） |
| `docs/40_design/world_state_registry.md` 第 6.1 节 | 委托模板与动态事件的数据编号写法与任务目录统一 | 文档 | 请求回写（需用户决定第 1 条） |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 第一幕其余 10 个委托模板与 29 个动态事件；A1-M03 接 `registration.when`（或直接写 `guild_rank = f`）、A1-M04 的三件委托接 `firstIn` 并按阶段记数；目录里本包数据没写的项（采药的银叶草甸、失物在失窃案期间让路、北部澱狼的澱度修正项、讨伐状的 `a1_moss_fate` 与独眼团声势、集日的星期与效果、兽潮前兆的钳制触发、魔物潮失守地段的澱度、莫伊拉巧合的四选一） | PK-M1-33 |
| 缺的魔物与物品（`waste_jackal`、`bone_vulture`、`field_hare`、`gravefield_wisp`、`rust_beetle`、`mat_silverleaf`）落地后，才能导入灰路豺群（紧急加价）、骨鹫、野兔、墓火、锈虫等模板 | 魔物图鉴与采集的内容批次，随后 PK-M1-33 |
| 委托板窗口与 `BoardAdapter`；客户端用 `QuestView.textOf` 渲染实例标题，日志与 `quest.started` 里实例的标题 | PK-M1-23 |
| 护送类委托（普通 NPC 跟随玩家） | PK-M1-18、PK-M1-15 之后的委托包 |
| 任务模型的"留在某处 N 小时"目标，让守夜不用两次到达近似 | 任务模型的后续包（叙事） |
| 纷争默认格类事件（劫案、宵禁、搜查、抗税），搜查要求的前兆事件 | PK-M1-46、PK-M1-33 |
| 首领与官员经意图菜单发布委托、居民求助转请托（报酬上限为其财产两成）、女神组织在公会挂单 | NPC 大脑（PK-M1-18 之后）、女神 GM 的后续包 |
| B 级违约的信誉扣分（社会第 3.3 节没有给数） | 设计补数后再接 |
| 张力标签与导演按节拍的目标区间选事件 | 导演的后续包 |
| 魔物潮接波次 `mtide_` 的编成与写定版兽潮 | PK-M1-52、战斗内容 |
| 注册表登记 `var.guild_rank.<值>` 文本键（第 9.3 节第 11 条的警告） | 文本键的后续批次 |
| 任务切片的 `instances` 没有 `idFields`：模板改名时实例的 `textOf` 不跟着改 | 任务的存档包 |
| `ev_a1_rumor_crystal_broke` 与认知在鉴定玩家时自带的"水晶没亮"传闻可能各播一次；导入 A1-M03 时二选一 | PK-M1-33 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 实例定义存进任务切片 | 存档变大 | 结束满 `keepWeeks`（4 周）的实例连同进度一起删除，`quest.<实例>` 旗标留作历史 |

**需用户决定**

| 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- |
| 委托模板与动态事件的数据编号 | 推荐按任务目录（`cmm_a1_*`、`ev_a1_*`）并改注册表第 6.1 节 | 不阻塞 |

**下一步与恢复方式**

1. 主会话按上面的文件清单提交；生成物随同提交。
2. 计划第 4 节 `PK-M1-47` 的状态建议改为"已完成"（验收见 `verification_matrix.md`），并把请求回写的几处交给各自的负责方。
