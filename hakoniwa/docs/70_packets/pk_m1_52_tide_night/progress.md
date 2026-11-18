# PK-M1-52 兽潮之夜结算：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-18 | 实施、覆盖性复查、修复 | 兽潮系统 `src/systems/tide/`（纯规则、运行时、溢出与满巢转潮）；兽潮夜数据（阶段、防线、备战修正、46 行行动判定表、玛莎、暴民、结算常数、冲突升级、孩子、归功）；`mtide_` 波次；注册表写入者与新变量；NPC 在场钩子；逐行单测、运行时测试、20 个种子的节奏报告 | 未提交 | 见 `verification_matrix.md` | 主会话提交；计划状态列建议改为"已完成"；第 4 节待用户定 |

## 2. 汇报

### 2026-11-18 实施、覆盖性复查、修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/tide/types.ts` | 新增 | 兽潮夜、阶段、防线、行动行、命运规则、结算常数、孩子、归功、溢出规则与切片的类型 |
| `src/systems/tide/rules.ts` | 新增 | 纯规则：判定表过滤与取行、各线防御与压力、缺口、最弱面与钟声、玛莎、平民伤亡与修正、具名者的命运、建筑、存续档、人口、繁荣、信任、归功、目击者 |
| `src/systems/tide/night.ts` | 新增 | 运行时：开始、按小时与条件推进阶段、取行、按游戏时间计的玩家站位、波次旗标、巨像目标与孩子暴露、暴民、冲突升级、结算与黎明收尾、孩子的后续期限、外部清除的提前结束 |
| `src/systems/tide/surges.ts` | 新增 | 溢出与满巢转魔物潮、地区冷却 |
| `src/systems/tide/slice.ts` | 新增 | 切片的创建、读取、ID 字段与存档检查 |
| `src/systems/tide/index.ts` | 新增 | 系统（相位 78）、事件、命令 `tide.act`、视图 `tideView`、计算函数 `tide_attribution`、跳时处理 |
| `src/content/packs/tide.ts` | 新增 | 三张表（`tideNights`、`tideSurges`、并入 `waves` 的 `mtide_` 行）、编辑器模式、校验（地图地点、人物、波次、条件、注册表变量名） |
| `data/tide/nights.json`、`waves.json`、`surges.json` | 新增 | 见 `README.md` 第 2 节 |
| `locales/zh-Hans/sys_tide.json` | 新增 | 命令拒绝原因与信任变动原因 |
| `tests/tide_rules.test.ts`、`tide_night.test.ts`、`tide_pacing.test.ts`、`tide_harness.ts`、`tests/playthrough/tide_pacing.playthrough.test.ts` | 新增 | 见 `verification_matrix.md` |
| `src/systems/npc/spawn.ts` | 修改（越界，两行） | `absenceReason` 读 `npc.<人>.dead`，返回 `dead`：在场外结算的死亡（兽潮之夜）把此人从地图上带走 |
| `src/systems/npc/index.ts` | 修改（越界，一行） | 在场旗标集合加 `npc.<人>.dead`，旗标一变就同步在场 |
| `src/systems/quests/effect_types.ts` | 修改（越界，一行） | `ComputeFn` 加 `tide_attribution` |
| `src/content/packs/quests.ts` | 修改（越界，一行） | `COMPUTE_FNS` 加 `tide_attribution`（同一文件里的"目标的 `effects` 校验"一段是 PK-M1-33 的改动，不是本包） |
| `tools/registry/parse.ts` | 修改（越界，一行） | 写入者系统名单加 `tide` |
| `docs/40_design/world_state_registry.md` | 修改（越界，逐行） | 见下表 |
| `data/README.md` | 修改（越界，一行） | `tide/` 一行 |
| `data/registry/vars.json`、`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 重生成 | 本地重生成；主会话在提交树上再生成一次 |

**注册表文档的逐行改动**（`docs/40_design/world_state_registry.md`）

| 节 | 变量 | 改动 |
| --- | --- | --- |
| 8.3 | `a1_beast_tide_started`、`a1_beast_tide_cleared`、`a1_martha_strike` | 写入者列加 tide（黄昏；黎明结算的最后一笔；第二波最弱面缺口大于 0） |
| 8.4 | `a1_bs_survival`、`a1_bs_population`、`a1_bs_prosperity`、`a1_children_exposed`、`a1_children_location`、`a1_tide_credit` | 写入者列加 tide |
| 8.4 | `a1_toby_state`、`a1_lin_state` | 写入者改为"澱病线的任务（……）；tide 兽潮黎明的生死判定"（保住内容写入者） |
| 8.5 | `npc.martha.revealed`、`npc.<人>.dead`、`npc.<人>.injury` | 写入者列加 tide |
| 8.7 | `a1_tide_prep.<项>` | 读取处加 tide |
| 8.7 | `a1_seg_turned`（新） | 反咬已发生（A1-D01.f），读取处 tide |
| 8.8.2 | `a1_tide_post`、`a1_east_gate_ordered`、`a1_tide_left_post` | 读取处由 combat 改为 tide |
| 8.8.2 | `a1_bertha_mob`、`a1_martha_drink` | 写入者加 tide 的兜底 |
| 8.8.2 | `a1_tide_stage`、`a1_colossus_target`、`a1_tide_weakest`、`a1_tide_gap_weakest`、`a1_tide_other_dead` | 写入者由 combat 改为 tide |
| 8.9 | `combat.wave.<波次>` | 写入者加 tide |

**与设计的对照（自行定下的地方，均写成了数据）**

| 设计条目 | 设计原文 | 实现 | 理由 | 需用户定 |
| --- | --- | --- | --- | --- |
| 8.2 时刻 | 日落、入夜、午夜前、午夜、巨像倒下时、天亮 | 20:00、+1 时、+3 时、+4 时；巨像倒下；6:00 且至少在巨像倒下后 1 时 | 内核的 `DUSK_HOUR`、`DAWN_HOUR`；澱流需要一段时间 | 是（第 4 节第 2 条） |
| 8.2 阶段 3 | 巨像必须由玩家击败 | 阶段 3 等 `boss.dian_colossus.defeated`、`yielded` 或其波次清空才结束，天亮也不结束 | 正典；A1-M12 的"玩家阵亡时……回来仍须亲手击败巨像" | 否 |
| 8.3 | 玩家在某条防线时 +40 | 本阶段亲自玩过的游戏时间里至少一半站在该线地点 12 格内；整段在跳时里度过时用黄昏的 `a1_tide_post`；暴民段丢下防线（`a1_tide_left_post`）时第二拍没有 | 场景写的岗位是意图，实际站位是事实；跳时里没有站位 | 否 |
| 8.3 | 夜羽、希雅、罗恩各 +10 | 他们跟着玩家（岗位 `@player`），只在玩家有防线的阶段加在那条线上；罗恩信任 60 以上记作跟随玩家 | 8.3 的"临时同行"与 8.4 的"所在防线"合读 | 否 |
| 8.6 来源 | 渗泉暗渠已堵（第一波压力 -10） | 加在东栅第一波（兽群的主攻面） | 原文没写哪条线 | 是（第 4 节第 4 条） |
| 8.4 欧拉 | 澱灵的压力 -10 | 加在澱流（第二波有澱灵 2；第三阶段的澱灵是巨像战） | 只有澱流里的澱灵归防线结算 | 是（第 4 节第 4 条） |
| 8.4 莫斯、独眼团、杰德 | 南门 -10、南门 -5、北门 -5 | 莫斯第二拍与澱流都 -10（两名守门民兵不回来）；劫仓只在第二拍；杰德从第一波到澱流 | 原文只写了起点 | 是（第 4 节第 4 条） |
| 8.6 第 2 条 | 缺口 / 10 取整，再乘修正 | 每线每阶段按小数记，整夜合计后四舍五入 | 修正连乘后是小数 | 否 |
| 8.6 第 3 条 | 缺口 20 以上重伤判定 50%；40 以上非保护者死亡判定 30% | 先判死亡，未死再判重伤；跨幕保护者只判重伤；行的"生还"只免死；岗位防御为负（开小差、逃走、劫仓）的人不判；同一人一夜只记一次重伤 | 原文没写顺序 | 否 |
| 8.4 跨幕保护 | 本幕只会重伤 | 名单取第一幕开头的跨幕主要角色：希雅、罗恩、奈拉、欧拉、卡西安、玛莎、布伦、莫斯、夜羽 | 第一幕第 0 节 | 否 |
| 8.6 信任 | 被玩家救下的 NPC +25 | 与玩家同守一线、且去掉玩家的 +40 后缺口会达到重伤线（20）的人 | 原文没写"救下"的判据 | 是（第 4 节第 5 条） |
| 8.6 信任 | 孤儿院相关人物 -20 | 伊莎、格蕾塔、诺伊、苔丝；条件是巨像来时玩家不在北门 20 格内（`a1_colossus_target == children`） | 原文"玩家若在巨像战前离开北区" | 否 |
| 8.6 信任 | 东坡对人族的信任 -30 | 没有变量承载，发 `tide.grievance` 事件并记进摘要 | 注册表没有"东坡对人族的信任" | 是（第 4 节第 6 条） |
| 8.6 人口 | 约 800 减去死亡与离开者 | 从镇上现有的人口（没写过时 800）减去当夜的死者；离开者没有人数 | 原文没给离开者人数 | 是（第 4 节第 6 条） |
| 8.4 德里斯 | 若玩家晚于他到达巨像，他死亡 | 巨像抵达时玩家不在北门 20 格内（目标为 `children`）即死 | 抵达那一刻就是"谁先到" | 否 |
| 8.4 博罗 | 林约和解时有人掩护 | `a1_boro_calmed` 或 `a1_forest_accord == restored` | "和解"取完全和解 | 否 |
| 4.4 冲突升级 | 博罗或一名伐木工死亡 | 第一波开始时掷 `tide.escalation`：五成博罗，否则一名伐木工（计入平民死亡） | 原文没写比例与时刻 | 是（第 4 节第 7 条） |
| 8.4 东坡 | 东坡单独结算（压力 40，防御 20） | 只在第一波（兽群来自林子） | 亡灵来自荒原，澱流扑向四面之一 | 否 |
| 8.4 加斯帕 partial | 东坡延迟入栅（第一波东坡伤亡 +50%） | 东栅第一波的平民伤亡 ×1.5；玩家下令、A1-M11 已说服东坡、玩家在东栅或希雅守在东栅（她的家人在那）时不延迟 | 东坡的人在栅内与东栅同算 | 否 |
| 8.4 欧拉在林中 | 东栅 +5；东坡伤亡 -30% | +5 从第一波到澱流；伤亡修正在东坡单独结算时乘东坡，在栅内时乘东栅第一波 | 同上 | 否 |
| 7.2 托比与琳 | 第 7.2 节规则在黎明结算 | 托比三期且未治好则死；兽潮早于第 8 周末时，他之后进三期的那一小时死。琳兽潮时已病且未治好则死；兽潮时没病，第 10 周起写健康；兽潮后才病且未治好，第 10 周死 | 7.2 没有写兽潮早于发病的情形 | 是（第 4 节第 8 条） |
| 8.6 输出时刻 | 黎明结算 | 澱流扑出的那一刻写下全部数字（澱流的损失在那一刻就定了），黎明只写阶段 5 与 `a1_beast_tide_cleared` | 过场目录里巨像倒下后立即播的 `cut_a1_martha` 含黎明段，要读这些数字 | 否 |
| 8.7 目击者 | 在场且视线可及的具名 NPC | 第三阶段岗位在北门、跟着玩家或在巨像身边的人，避在礼拜堂的人，以及巨像倒下时在玩家 10 格内的具名人物；信任取巨像倒下那一刻 | 注册表 2.9 的"信任"按那一战算；黎明的 +15 不该改写归功 | 否 |
| 8.7 "光" | 卡西安在黎明晨祷中如此宣讲 | 只看 `church_suspicion >= 40`（卡西安受跨幕保护，总在） | 注册表 2.9 的写法 | 否 |
| 8.4 夜羽 | 任何情况 | 条件是 `companion.yeyu.recruited`（夜羽在第一幕 A1-M02 结契，未结契时没有这个人）；第二拍鸦群不敌对由战斗的 `raven_flock` 的 `pacifiedBy` 承担 | | 否 |
| 8.2 第二拍 | 鸦群若干 | 2 | 原文没给数 | 是（第 4 节第 9 条） |
| 魔物图鉴 7.2 | `mtide_lotha_rim` 的系统版 | 写定兽潮夜的第一波用 `mtide_lotha_rim`（任务目录 A1-M12 的写法）；系统潮另立 `mtide_lotha_rim_wild`：灰毛狼 4、澱狼 8、澱野猪 4、林缘织网蛛 6（取图鉴区间下限），没有领头 | 同一波次 ID 只能起一次（见第 3 节对战斗的请求）；"老灰狼"还没有魔物数据，黑脊是唯一的异名稀有 | 是（第 4 节第 9 条） |

**覆盖性复查（新起子代理）的发现与处理**

| 序 | 发现 | 级别 | 处理 |
| --- | --- | --- | --- |
| 1 | 重伤只发事件，没写进人物的状态；`injuryValue` 声明了却没有数据 | BLOCKING | 写 `npc.<人>.injury = major`，注册表写入者加 tide，数据补 `injuryValue`；同一人不重复记 |
| 2 | 溢出潮只能起一次（战斗不清 `combat.wave.<ID>` 信号），冷却照记 | SHOULD-FIX | 只在真起了潮时计冷却；被挡住的波次随 `tide.surge` 的 `blocked` 报出；清信号是对战斗的请求（注册表 8.9 本就写"combat 生成波次后清除"）；补测 |
| 3 | 第 8 周的兽潮夜里莫斯的灰晶车决策 6 小时才到期，兽潮按"在任即逃"先算了南门 -10 | SHOULD-FIX | 设计默认就是南逃，保留；请求 PK-M1-33/46 让该决策在第二拍之前到期，并让 A1-M12 的拦截不必等决策（第 3 节） |
| 4 | 黄昏时纷争还没结算，黄昏的取行混进了繁荣、损失与记忆 | SHOULD-FIX | 黄昏与黎明不取行；冲突升级记在它发生的阶段（第一波） |
| 5 | `tide.rescue_attempt` 每个阶段都发 | SHOULD-FIX | 只在暴民那一拍发一次；测试断言恰好一次 |
| 6 | 跳时里也取样，`a1_tide_post` 的兜底到不了；样本按次数不按时间 | SHOULD-FIX | 按游戏时间加权；跳时的时长另记，整段跳过时才用岗位；补"亲自玩过"的逐 tick 测试 |
| 7 | 选择者能挑表上排除的行（"其他"行总合法） | SHOULD-FIX | 条件成立的行才合法，没有一行成立时才轮到"其他"；希雅、罗恩、加斯帕、东坡、博罗、奈拉、欧拉、莫斯、独眼团的条件改成互斥；补测 |
| 8 | 系统代码里写死了阶段 ID `'dusk'` | NIT | 改为当时的阶段 |
| 9 | `survives` 连重伤也免了；信任排序用了 `localeCompare` | NIT | 只免死；改为确定的比较 |
| 10 | 东坡被关在栅外的 -30 没实现 | SHOULD-FIX | 发 `tide.grievance` 事件并记摘要；承载变量待定（第 4 节） |
| 11 | 人口没减离开者，且直接覆盖 | SHOULD-FIX | 从现有人口减去死者；离开者人数待定（第 4 节） |
| 12 | A1-M11 的 `children_safe`、`oola_placed` 没读 | SHOULD-FIX | `children_safe` 时孩子不暴露；`oola_placed` 时欧拉按"自由"行（劫狱后放在礼拜堂与东栅之间也算） |
| 13 | 巴托"死守"被 `a1_tide_prep.barto_seg` 打开（独眼团收编一项也会写它） | SHOULD-FIX | 只认 A1-S21（`a1_barto_family_safe`）与揭发莫斯 |
| 14 | 琳没有后续期限 | SHOULD-FIX | 补 `diesLater` 与之后的健康判定（第 4 节第 8 条） |
| 15 | 夜羽"任何情况"、鸦群 | SHOULD-FIX | 保留结契条件（未结契时没有这个人）；鸦群由战斗的 `pacifiedBy` 承担；写进上表 |
| 16 | 卡西安与布伦的"平民受保护"、维克的账本、商会损失没有效果 | SHOULD-FIX | 定性条目，没有数值；转为请求（第 3 节） |
| 17 | 若干与原文的出入未写明 | NIT | 写进上表 |
| 18 | 计算函数、视图、`combat.door_seek`、巨像阶段的提前结束、玛莎死亡、冷却之后的再次溢出、岗位兜底、逐 tick 站位都没测；若干断言不具判别力 | SHOULD-FIX | 全部补测；黎明结算改为手算的一夜逐项断言 |
| 19 | 包内缺 `progress.md`、`verification_matrix.md` 与节奏报告；行数写错 | SHOULD-FIX | 补齐；行数改为 46、波次 8 加 1 |
| 20 | 注册表扫描不看兽潮表的若干条件与变量名字段 | NIT | 本包校验器自己检查（变量名与条件里的变量都必须已登记） |
| 21 | 校验器注释夸大 | NIT | 改正 |

**同一审查者复核修复**：第 1、4、5、7、8、9、12、13、14、20 条确认已修，修复没有引入回退；第 2、3 条按请求保留（见第 3 节）。复核另提的小项与处理：

| 序 | 发现 | 级别 | 处理 |
| --- | --- | --- | --- |
| 1 | `skipped` 只写不读，取样函数的注释与规则不符 | NIT | 注释改为"跳时的时长另记，规则只读亲自玩过的时间" |
| 2 | 存档检查不看 `skipped`、`sampledAt`；更早版本存下的夜没有 `skipped` | NIT | 读切片时补空表；检查两项的类型 |
| 3 | 阶段的 `until` 没查注册表；用的是默认注册表；别名也算登记 | NIT | 查 `until`；用内容自带的注册表；变量名要求规范拼法 |
| 4 | `a1_oola_fate`、`a1_oola_wounded` 的写入者没写 tide | NIT | 注册表两行补上 tide 的暴民兜底 |
| 5 | 独眼团的结局未写且已反咬时没有行 | NIT | 反咬行的条件改为"未写或活跃，且已反咬" |
| 6 | 博罗冲台后欧拉逃进林子，又有 `oola_placed` 时按"自由" | NIT | 保留：安置是 A1-M11 写的，比冲台晚，按她回来帮忙算 |

## 3. 留给后续包的事项

| 事项 | 建议去处 |
| --- | --- |
| `q_a1_m12_tide` 已按本包接口改（工作区里 PK-M1-33 的版本以 `a1_tide_night` 开启、读 `a1_tide_stage` 与 `a1_beast_tide_started`、以 `a1_beast_tide_cleared` 收尾）；请再核对：兽潮夜有本包时不再起旧波次 `tide_*`，奖励不再写 `a1_beast_tide_cleared` 与 `a1_martha_strike`；A1-M12 的 `intercept` 只在 `moss_cart == flee_south` 时写 `a1_moss_intercepted`，第 8 周的兽潮夜里这个决策要到午夜后才到期，建议改为 `a1_tide_stage == 2 AND a1_moss_fate == in_power AND dispute.q_a1_d01_tax_and_bandits.choice.moss_cart != stay_put` | PK-M1-33 |
| 纷争 A1-D01 的灰晶车决策 `moss_cart` 在 `a1_tide_night` 开启时 6 小时才到期；建议兽潮夜开启时在第二拍（3 小时）之前到期 | PK-M1-33（纷争数据）、PK-M1-46 |
| A1-D01.f 的反咬写新变量 `a1_seg_turned` | PK-M1-33 |
| 黎明时找到维克与账本（`lb_moss_second_ledger`）；A1-M11 的 `a1_defense` 与委托 `cmm_a1_night_watch` 的 +1 本包不读（各线防御直接由来源算出），是否保留由任务定 | PK-M1-33 |
| 战斗在生成波次后清除信号 `combat.wave.<ID>`（注册表 8.9 已这样写），系统潮 `mtide_lotha_rim_wild` 才能再起；旧波次 `tide_first`、`tide_second`、`tide_colossus`、`tide_flood` 在任务不再引用后退役 | 战斗（PK-M1-12 之后的战斗内容） |
| 自动玩家在兽潮夜站在一条防线上、子夜前回到北门、打倒巨像（任务目标已是"击败澱巨像"；本包的波次是 `mtide_lotha_rim_colossus`） | PK-M1-12（自动玩家）、PK-M1-33 |
| 过场 `cut_a1_tide` 的黄昏段在阶段 1 之前写 `a1_tide_post`、`a1_east_gate_ordered`；暴民段在阶段 2 结束之前写 `a1_bertha_mob`、`a1_tide_left_post`；`cut_a1_martha` 读阶段 4 起写下的数字，调用 `compute tide_attribution` | PK-M1-34 |
| 重伤的人（`npc.<人>.injury = major`、`tide.fate` 的 `injured`）何时痊愈；同伴在兽潮之夜重伤时转为剧情重伤 | PK-M1-15（同伴）、NPC 的后续包 |
| 将领（巴托）在兽潮之夜死去时的魂归期（`npc.<人>.at_spring`）：NPC 系统可订阅 `tide.fate` | NPC 的后续包 |
| NPC 大脑与模型在 `tide.phase` 时经 `tide.act` 在合法行里选择 | NPC 大脑的后续包、AI 层 |
| 四个归功版本作为传闻生成并竞争传播（`tide.ended` 带版本与第一传播者） | 认知的后续包 |
| 卡西安与布伦的"平民受保护"、商会后仓的损失（`loss: company`）、东坡的怨气（`tide.grievance`）落到经济、城建或认知的数值 | 经济、城建、认知的后续包 |
| 系统版魔物潮的失守代价（产出修正项、地块澱度）；迷宫与澱巢数据写 `overflowTo` 与林中澱巢后，溢出与满巢才会真的起潮 | 城建与经济的后续包；PK-M1-30 |
| 兽潮之夜的界面：阶段、防线缺口、玛莎、伤亡（`tideView`） | PK-M1-23、PK-M1-57 |
| 相位表加一行：78 tide，兽潮之夜与魔物潮 | 主会话（`docs/50_tech/architecture.md` 第 4.6 节） |

## 4. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 玛莎"一直旁观"在现有数值下到不了：最弱面最多约 25（西田 5、独眼团 10、钟声 10），北门也到不了 100，澱流压力 100（欧拉在时 90），所以她每夜都出手 | 推荐保留（正典：她总在暗处兜底），把"旁观"留给第三幕起镇子更强的时候；另一种是加大钟声调动（例如调动 30）或让澱流压力扣掉前两拍守住的余量 | 不阻塞 |
| 2 | 阶段时刻（第 2 节表第 1 行） | 推荐照现在：20:00、21:00、23:00、0:00、巨像倒下、6:00 且至少 1 时之后 | 不阻塞 |
| 3 | 兽潮之夜一夜 10 游戏时，1 倍速约 10 现实分钟；任务目录写"压缩为约 80 现实分钟" | 推荐按现在的时钟，靠巨像阶段等玩家拉长；若要 80 分钟，需要兽潮夜里放慢时间，属内核时钟的改动 | 不阻塞 |
| 4 | 暗渠 -10 加在哪、欧拉的澱灵 -10 加在哪、莫斯与杰德的扣减持续到哪个阶段（第 2 节表） | 推荐照现在 | 不阻塞 |
| 5 | "被玩家救下 +25"的判据 | 推荐照现在（去掉玩家的 +40 会达到重伤线的人）；另一种是只算玩家在战斗里直接救起的人（需要战斗的救援事件） | 不阻塞 |
| 6 | 东坡对人族的信任 -30 与人口的"离开者" | 推荐登记 `a1_eastslope_grievance`（整数）由本包写；离开者推荐按户计：奈拉敌对撤走、莫斯南逃各减一户（约 5 人）；需要设计给数 | 不阻塞 |
| 7 | 林地之争冲突升级"博罗或一名伐木工"的比例与时刻 | 推荐照现在：兽潮第一波开始时五成五成 | 不阻塞 |
| 8 | 兽潮早于托比、琳的期限时 | 推荐照现在：托比在之后进三期的那一小时死；琳兽潮后才病时第 10 周未治好则死 | 不阻塞 |
| 9 | 第二拍鸦群数量（2）、系统潮的编成与领头 | 推荐鸦群 2；系统潮先用图鉴区间下限，领头等"老灰狼"的魔物数据 | 不阻塞 |
| 10 | 魔女审判"冲台"的伤亡（第一幕 4.2 写"可能有伤亡"，PK-M1-46 转给本包）没有数值 | 推荐由纷争结算时按冲突升级的同一口径（一名东坡猎户或民兵，五成）记在审判当天，不放进兽潮之夜；需要设计给数 | 不阻塞 |

## 5. 延后的测试

按用户的新安排（先做序章与第一幕的内容，测试放到最后），本包末次只跑了类型检查、内容校验、注册表检查、文本检查与本包的三个测试文件（见 `verification_matrix.md` 第 2.3 节）。下列在后续的测试阶段补跑与修复。

| 套件或路线 | 为什么可能受本包影响，或已见到的失败 |
| --- | --- |
| `npm test` 全套 | 末次变更之前跑过两次，失败都与本包无关或是负载下超时（`verification_matrix.md` 第 3 节）；末次变更之后没跑 |
| `tests/disputes.test.ts` 的整局用例"runs the same in the real game" | 全部系统一起跑到第 11 周时兽潮之夜会真的开始；无人拦阻的暴民会把欧拉拖出北门（`a1_oola_fate = fled`），魔女审判的默认结局就可能从 `convicted` 变为 `fled`；这次单跑通过，但结果依赖那一夜伊莎是否拦下；负载下超时过 |
| `tests/registry.test.ts` "a game day"、`tests/time_skip.test.ts`、`tests/core.test.ts`、`tests/ailments.test.ts` 跳时 | 新系统每 tick 都在；负载下超时过，单跑通过 |
| `tests/save_*.test.ts`、`tests/replay_segments.test.ts` | 世界多了 `tide` 切片（含存档检查与 ID 字段） |
| `tests/progression.test.ts` "sees the tide colossus"、`tests/quests.test.ts` "sets waves for the beast tide" | 兽潮夜由本包起波次（巨像是 `mtide_lotha_rim_colossus`），任务的旧波次 `tide_*` 只在本包没开始时兜底；已见失败，与 PK-M1-33 的任务改动交织 |
| `tests/scenes.test.ts`、`tests/goddess.test.ts` 的整局走查 | 已见失败（剧情走不出第一幕），来自同期任务数据的改动；任务改为 `a1_tide_night` 开启后，整局走查要经过本包的兽潮之夜（需要打倒巨像） |
| `tests/npc*.test.ts`、`tests/party_companions.test.ts`、`tests/records.test.ts` | NPC 读 `npc.<人>.dead` 的在场钩子；`a1_tide_with_shiya` 的时刻；归功写的 `a1_tide_credit`（传书与事迹读它）；修复之前跑过一次通过 |
| `tests/content_validation.test.ts`、`tests/docs_guard.test.ts`、`tests/architecture.test.ts`、`tests/content_id_guard.test.ts`、`tests/i18n_kernel_guard.test.ts` | 新表、新包文档、新系统代码；修复之前跑过一次通过 |
| `tests/playthrough/tide_pacing.playthrough.test.ts` | 自然第一幕 20 个种子；跑在复核后的小修之前（数字不受影响），重跑 |
| `npm run playthrough` 全部路线（`release`、`rule_merca`、`act1_minimal`、`replay`、`replay_segments`、`npc_disputes`、`goddess_alive_1` 到 `_4`、`npc_alive_1` 到 `_4`、`text_golden`） | PK-M1-33 把兽潮任务改为 `a1_tide_night` 开启后，两条完整路线都要经过本包的兽潮之夜：自动玩家要守一条防线、子夜前回北门、打倒 `mtide_lotha_rim_colossus`（PK-M1-12 的自动玩家）；第一幕的 tick 数与死亡数会变（兽潮从第 3 周移到第 8 到 10 周）；本次开跑后按新安排停止，没有结果 |
