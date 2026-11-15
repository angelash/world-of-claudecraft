# 开源源码调研：地下城经营、基地管理、殖民模拟与 NPC 委托

> 所属目录：`docs/10_research/open_source/`（开源游戏源码深度调研）。
> 性质：调研归档，只记录事实、分析与可借鉴点，不具约束力（正典优先级最低一级，见 `hakoniwa/CLAUDE.md`）。
> 调研日期：2026-11-15。
> 来源索引：`F:\workspace\open-share\10_md\_external\2026\external-2026-开源游戏源码大全-玩法与引擎索引.md`（状态 indexed-unverified）。
> 本篇的仓库地址、许可、描述均已到仓库核实，与索引冲突处以仓库为准。
> 分工：本篇负责地下城经营、基地管理、殖民模拟与 NPC 委托工作（居民招募、工作分派、基地设施、资助方对表现的反应、委托任务）。
> 城建人口模拟（Micropolis、Caesar III 系等）、经济物流型 RTS（Widelands、7kaa、OpenTTD 等）、即时战术 RTS、SLG/4X 由并行的其他调研覆盖，本篇不展开。
> 已有浅层调研：[`city_rts_slg.md`](../open_share/city_rts_slg.md) 第 7.1 节速查表只列了名字；本篇深入到源码，不重复其概念层内容。
> 标注约定：源码事实不加标；"分析"表示对《箱庭纪》的推演；"待核实"表示没读透或属推断。
> 引用约定：源码引用写"仓库内相对路径 + 符号名"，不写行号；固定提交见各项目信息表。GPL、CC BY-SA 项目只借方法，
> 本文用自己的话与伪代码转述，单行公式与常量照引并注明出处。

## 0. 项目清单与分级总表

| # | 项目 | 索引锚点 | 分级 | 主要对应《箱庭纪》 | 代码许可 | 素材许可 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | KeeperRL | `#native-136` | 必读 | 劳力分配与岗位（城建 6.3）、人口来源与招募（5.2、7.1）、魔物袭击节奏（10）、住房品质与精英上限 | GPL-2.0 或更高 | `data_free/` 为 CC BY-SA 2.0；付费 `data/` 不在仓库 |
| 2 | OpenXcom | `#native-149` | 必读 | 庭院扩建与庭格（2.3）、研究所（2.2）、资助方月度评估（女神与国家对表现的反应、神依赖度）、事件调度数据化 | GPL-3.0 | 原版 X-COM 资源不在仓库，需玩家自备 |
| 3 | Cataclysm: DDA | `#native-057` | 必读 | 委托（城建 9，任务 6.2）、官员与具名居民的离屏限时工作、招募委托、对话条件与效果 | CC BY-SA 3.0（全项目，含代码） | 同左；字体与第三方库另有许可 |
| 4 | Endless Sky | `#native-111` | 选读（中） | 区域价格（经济 4.2）、势力声望传导与贿赂（声望 5）、任务 DSL（任务 4） | GPL-3.0 或更高 | 图像以 CC BY-SA 4.0 为主，另有公有领域与其他 CC |
| 5 | OpenDungeons | `#native-142` | 选读（短） | "满足条件才来人"的计分、心情阈值与罢工、薪俸 | GPL-3.0 或更高 | 美术按 `CREDITS` 逐项（CC BY-SA 3.0、CC BY 3.0、CC0 等） |
| 6 | UFO:AI | `#native-172` | 选读（短到中） | 国家满意度连续值、资助方同时供给人才、建筑依赖链、敌方兴趣增长 | GPL-2.0 | 按 `LICENSES` 逐文件（GPL-2.0、CC BY-SA 3.0、公有领域等） |
| 7 | Pioneer | `#native-153` | 选读（短） | 离屏市场按经过时间一次性外推（确定性） | GPL-3.0 | CC BY-SA 3.0 |

本地镜像统一在 `D:\hakoniwa_refs\<id>`，全部为 `--depth 1 --filter=blob:none --sparse` 部分克隆，只物化代码与数据目录，未运行任何脚本或构建。

我们现在的实现（读到能说出差距为止，作为后文"对照"的基线）：

| 关注点 | 现状（路径与符号） | 与设计的差距 |
| --- | --- | --- |
| 劳力分配 | `hakoniwa/src/systems/city/production.ts` 的 `runProduction`：劳力 = 人口 × `LABOR_SHARE`（`common.ts`），按建筑列表顺序贪心填岗；政策 `foodFirst` 把食物类建筑排前 | 设计 [城建 6.3](../../40_design/systems/city_building.md) 要求"岗位吸引力自动填岗 + 工头设优先级与配额 + 具名居民提议岗位"，现在都没有 |
| 居民实体 | `settlers.ts` 的 `syncSettlers` 每 5 人生成一个代表（上限 `MAX_SETTLERS`），`settlerSchedule` 只在 7、12、19 点下令：7 点随机走向有岗位的建筑，12 点走向聚落中心附近，19 点随机走向有住房的建筑 | 代表的去向与 `BuildingInstance.workers` 无关，看不出"谁在哪干活" |
| 迁入与招募 | `population.ts` 的 `runPopulation`：吸引力公式中"种族包容""战争风险"仍是常量占位；移民是匿名计数 `addPopulation(..., 'migrants', n)`；难民每日 1 到 3 人细流 | 没有"候选人"、没有"为什么不来人"的原因列表、没有招募成本与同类递增、没有人才（潜质）随迁入出现 |
| 官员 | `officials.ts` 的 `requestDecisions` 每周为每位主官发一次 `official.decide`，菜单按 `actingLevel` 过滤，`utilityAction` 规则兜底 | 官员每周只做一次即时动作（包括在外地集市瞬时买粮、卖余货，没有路途时间；其余多为 7 天临时效果），没有"派人出去做一件限时的事、到期回报"的委托单 |
| 事件节奏 | `events.ts` 的 `runEvents` 每日掷骰火灾、疫病、魔物袭击，袭击概率经 `monster` 修正项；严重事件并发与间隔受限；玩家不在场记考验（`recordTrial`） | 袭击概率只随阶段、`monster` 修正项与澱斑变化，来袭数随人口增加；没有"由玩家的扩张、财富、行为触发"、按分项取最大值的敌对方进攻触发器表 |
| 女神对玩家 | `goddess/state.ts` 的 `impression`、`interest`、`relation`、`gaze`；`planning.ts` 的 `dailyPlans`、`fallbackPlan` | 没有按周期汇总"表现账"并调整恩惠的规则；神依赖度只在 `strategy/release.ts` 的 `effectiveReliance` 里计算：结构依赖度（开局给定、不变）加上以该国为键、来源非凡人的每条生效修正项各加 2，封顶 100；不区分是否有利，也不逐次记账 |
| 国家对玩家 | `strategy/conclave.ts` 的 `stanceToward` 只在会盟时即时计算 | 没有持续的资助流与周期评估 |
| 条件与效果 | `quests/conditions.ts` 字符串表达式（AND、OR、NOT、比较、IN、HAS、COUNT、MIN、MAX）对旗标求值；`quests/effect_types.ts` 的 `EffectBody` | 具名 NPC 信任已镜像为 `trust.<id>` 旗标、可写比较式；缺的是绑定当前说话者的主体谓词、其他关系维度、带关系修正的检定、"显示但不可选并说明原因" |

---

## 1. KeeperRL（必读）

### 1.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-136`（"受《矮人要塞》启发的 Roguelike 地牢建造游戏"） |
| 仓库 | https://github.com/miki151/keeperrl |
| 固定提交 | `95d2be4e97db2243210a71918e36a533ad94dcd1`（2025-10-27，分支 `master`） |
| 代码许可 | GPL-2.0 或更高（`COPYING.txt`、`LICENSE`，源文件头写明 "either version 2 ... or any later version"） |
| 素材许可 | `COPYING-MEDIA.txt`：`data_free/` 为 CC BY-SA（链接到 2.0）；`data/` 只许随官方二进制使用，不在仓库；`data_contrib/` 为字体（SIL OFL、公有领域） |
| 语言与规模 | C++；跟踪文件约 940 个，其中约 660 个 `.cpp`/`.h` 平铺在仓库根目录；内容数据为自定义文本格式 |
| 本地镜像 | `D:\hakoniwa_refs\keeperrl`；已检出：根目录全部源文件（cone 模式）+ `data_free/game_config/` |
| 分级 | 必读 |

### 1.2 值得看的理由

- **劳力与岗位**：KeeperRL 的"集体"（`Collective`）用一张任务图（`TaskMap`）承载玩家下达的建造、挖掘、搬运，用"活动"（`MinionActivity`）承载随从自发的睡、吃、训练、制作、研究；二者合起来就是 [城建 6.3](../../40_design/systems/city_building.md) "劳力分配"与第 9 节"据点：工头按优先级排班"的完整可运行样本。
- **满足条件才来人**：`Immigration` 是"建了床、建了锻炉、研究了某项技术，才会有对应的人投奔"的候选人系统，直接对应 [城建 5.2](../../40_design/systems/city_building.md) 人口来源、7.1 人才稀缺、7.2 识才之门。
- **敌对势力的节奏**：`VillageControl` 与 `VillageBehaviour` 把"敌人什么时候来打你"写成触发器表（你的实力、人口、金币、杀了他们的人、挖到他们边上），对应城建第 10 节魔物袭击与势力渗透、[女神 GM 8.2](../../40_design/systems/goddess_gm.md) 张力计的输入。
- **奢侈与效率**：家具的奢侈度直接乘到工作效率上（有上限），宿舍奢侈度限制晋升上限；对应城建 5.4"精英需要好住处"、7.3 职业成长。

### 1.3 源码导读

| 想弄懂 | 读这些（路径 + 符号） | 该处的机制 |
| --- | --- | --- |
| 任务从哪来、谁来接 | `task_map.h` 的 `TaskMap`；`task_map.cpp` 的 `TaskMap::getClosestTask`、`TaskMap::freeFromTask`、`TaskMap::tick`、`TaskMap::addTaskCost`、`TaskMap::removeTask` | 任务按活动分桶；优先任务压过普通任务；就近；可转交；放弃后冷却；无人能做的任务移出扫描；任务预扣的资源在取消时退回 |
| 随从每一步怎么决定做什么 | `monster_ai.cpp` 的 `ByCollective::getMove`、`ByCollective::priorityTask`、`ByCollective::getStandardTask`、`ByCollective::setRandomTask`、`ByCollective::considerHealingActivity` | 固定的动作优先序；当前活动失效或到期则重选；重选是在"可行活动"里均匀随机 |
| 哪些活动对哪个随从可行 | `minion_activity_map.cpp` 的 `MinionActivityMap::isAvailable`、`canChooseRandomly`、`isLocked`；`collective.cpp` 的 `Collective::isActivityGoodAssumingHaveTasks`、`isActivityGroupLocked`、`setMinionActivity` | 按特质（工人、战士、首领、囚犯）、技能 Buff、饱腹与休息状态、昼夜、玩家对该类随从的活动锁来判定 |
| 活动去哪件家具做 | `minion_activity.cpp` 的 `MinionActivities::generate`、`getAllPositions`、`tryInQuarters`、`getDuration`；`collective_config.cpp` 的 `CollectiveConfig::getActivityInfo` | 每种活动绑定一组家具类型（一种家具只能属于一种活动）；优先用自己的宿舍内的家具；默认活动时长 |
| 移民候选人 | `immigration.cpp` 的 `Immigration::update`、`getImmigrantChance`、`getRequirementMultiplier`、`getMissingRequirement(s)`、`accept`、`occupyAttraction`、`calculateCost`、`Available::generate`；`immigrant_info.h` 的 `ImmigrantInfo`、`AttractionInfo`、`ExponentialCost`、`RequirementInfo` | 定时抽一个候选人；条件不满足按乘子降概率；接受时扣资源、占用吸引物；同类越多越贵；候选人限时 |
| 移民数据 | `data_free/game_config/immigration.txt`；`collective_config.cpp` 的 `CollectiveConfig::addBedRequirementToImmigrants`、`getImmigrantTimeout` | 数据驱动的候选人表；系统自动给每类移民补一条"需要一张对应的床" |
| 人口上限 | `collective.cpp` 的 `Collective::getMaxPopulation`；`furniture_factory.cpp` 的 `FurnitureFactory::getPopulationIncrease`；`furniture.txt` 的 `populationIncrease` | 上限 = 基础 + 家具加成（每件加多少、封顶多少） |
| 敌人何时进攻 | `village_control.cpp` 的 `VillageControl::update`、`getAttackers`、`launchAttack`、`considerCancellingAttack`、`canPerformAttack`；`village_behaviour.cpp` 的 `VillageBehaviour::getTriggerValue`、`getAttackProbability` 与几个 `static` 曲线函数；`attack_trigger.h` 的 `AttackTrigger` | 触发器各自给出概率，取最大值；进攻队伍有下限；损失过半撤退；可要赎金 |
| 进攻资格的全局闸门 | `campaign.cpp` 的 `Campaign::refreshMaxAggressorCutOff`、`getBaseLevelIncrease`；`game.cpp` 的 `Game::passesMaxAggressorCutOff` | 太远太强的势力暂时不许主动进攻；主反派要等若干小反派被打败 |
| 士气与效率 | `collective.cpp` 的 `Collective::getEfficiency`、`onAppliedSquare`、`addMoraleForKill`；`data_free/game_config/buffs.txt` 的 `HIGH_MORALE` | 效率 = 家具用时 × Buff 乘子 × 加速/减速 × 奢侈度乘子 × 光照 |
| 奢侈度 | `position.cpp` 的 `Position::getLuxuryEfficiencyMultiplier`、`getTotalLuxuryPlusWalls`；`zones.cpp` 的 `Zones::getQuartersLuxury`；`creature_experience_info.cpp` 的 `getMaxPromotionLevel`、`getRequiredLuxury` | 周围 3×3 的奢侈度乘效率；宿舍奢侈度定晋升上限 |
| 领地 | `territory.cpp` 的 `Territory::calculateExtended`、`getExtended` | 领地是格子集合；外圈按 BFS 距离分层，用于移民的出生位置 |
| 进度与解锁 | `dungeon_level.cpp` 的 `DungeonLevel::getProgress`、`getNecessaryProgress`、`addAbsoluteProgress` | 击败不同类型的反派给不同进度，升级给研究与晋升点 |
| 给玩家的警告 | `collective_warning.h` 的 `CollectiveWarning`；`collective_warning.cpp` 的 `CollectiveWarnings::considerWarnings` | 缺床、缺仓库、缺武器、太暗等可读提示 |

### 1.4 机制拆解

#### 1.4.1 任务图：玩家下的活怎么分到人头上

数据（`TaskMap` 的成员，转述）：任务表；"随从到任务""任务到随从"两张互逆映射；任务所在格；任务所属活动；按活动分桶的任务列表；
优先任务集合（以及按活动分桶的优先任务）；"放弃冷却"表（任务到解禁时刻）；"任务预扣成本"表；玩家标记的格子；"当前无人能做"缓存。

规则：

1. **入图**：建造、挖掘等玩家指令进图时绑定一个活动（`CONSTRUCTION`、`DIGGING`、`HAULING`、`WORKING` 等），建造类还登记"完成成本"（`addTaskCost`）；
   任务被取消时由 `removeTask` 把预扣成本退回集体（`Collective::returnResource`）。这是"排队就先占住预算、撤单就退款"的模式。
2. **就近领取**（`getClosestTask`）：对给定随从与活动，在该活动的桶里找"未完成、可达、未在冷却中"的任务；比较时优先任务永远压过普通任务，同级比距离。
3. **转交**：任务已被别人领了，只有当任务允许转交、候选者比当前持有者离任务更近、且候选者与任务距离不超过 6 格时才能抢过来（常量 6 写在 `getClosestTask` 的判断里）。
4. **放弃冷却**：随从被改派（`freeFromTask`）时，未完成且可转交的任务被释放，并对所有人冷却 50 个时间单位（`50_visible`），避免几个人来回抢同一件活。
5. **剪枝**：`tick` 把"当前任何人都做不了"的任务移进缓存不再扫描，条件恢复时移回。
6. **玩家优先标记**：`Collective::setPriorityTask` 把任务塞进优先集合；随从的动作序里"优先任务"排在常规任务之前（见下）。

#### 1.4.2 活动选择：随从自己决定做什么

每个随从每一步按固定顺序找第一个能执行的动作（`ByCollective::getMove`，转述）：

```
每步：
  有一定概率（1/5）检查是否受伤 -> 是则把活动切到"睡觉"（considerHealingActivity）
  按序取第一个可行动作：
    1 换上分配给自己的装备
    2 战斗（战士）
    3 坐骑上下
    4 跟随小队队长
    5 玩家标记的优先任务（任意可行活动里的优先任务）
    6 赶去警报点（战士）
    7 继续手上的任务
    8 去仓库领装备
    9 常规活动（getStandardTask）
```

常规活动（`getStandardTask`，转述）：

```
若 当前活动 == 空闲 或 当前活动已不可行:
    当前活动 = 空闲
    从"可随机选择且可行"的活动里均匀随机挑一个（setRandomTask），
    记下活动结束时刻 = 现在 + 该活动时长
若 现在 > 活动结束时刻: 当前活动 = 空闲
先处理"把身上不属于自己的东西放回仓库"
在任务图里找该活动最近的现成任务 -> 领取
否则按活动类型生成一个新任务（去对应家具、去探索边界、去领地内闲逛等）
```

- **可行性**（`MinionActivityMap::isAvailable`）是一张按活动列出的资格表：工作类（建造、搬运、挖掘）只给有"工人"特质且能拿东西的；训练要求该属性未练满且不是囚犯；
  制作要求在某种工坊技能上大于 0；吃饭要求没吃饱且不是囚犯；探索、种田、讲道等要求对应技能 Buff；守卫只给战士。
- **可随机选择**（`canChooseRandomly`）另加一层：已休息好不随机去睡、已吃饱不随机去吃、讲道有全局冷却（距上次弥撒 1500 单位）；挨鞭、受刑、处决永不随机。
- **时间与环境闸门**（`isActivityGoodAssumingHaveTasks`）：种田与探索只在白天；夜行探索只在夜里；有高士气的不去挨鞭；受刑要求人口未满。
- **玩家的活动锁**：玩家可以对"某一类随从"（按名字分组，囚犯一组）锁定或解锁某个活动（`flipGroupLockedActivities`）；守卫类默认锁定、需要手动解锁。
- **活动时长**（`MinionActivities::getDuration`）：睡、闲、挨鞭、受刑、告解 100；吃饭与欺负同伴 20 到 40；仪式 150；听告解 50；讲道与弥撒 300；其他默认 500 到 750。
- **家具与活动一一对应**：构造 `MinionActivities` 时，每种家具类型只能归属一种活动，重复归属直接 `CHECK` 失败；生成任务时优先选自己宿舍内的家具，
  没有私人宿舍的随从避开别人的宿舍（`tryInQuarters`）。

#### 1.4.3 移民与招募：满足条件才来人

候选人模板（`ImmigrantInfo`，数据见 `immigration.txt`）：

| 字段 | 含义 |
| --- | --- |
| `ids` | 生成哪种生物（可随已生成数轮换） |
| `frequency` | 抽中的相对权重；**缺省表示"常驻"**（例如小鬼、农民：玩家花钱随时造，不进入随机抽取） |
| `requirements` | 条件列表，每条带 `candidateProb`：条件不满足时，"作为候选人出现"的概率乘以该值（0 表示不满足就绝不出现，1 表示照常出现但不能接受） |
| `traits` | 加入后的特质（工人、战士、无人口占用、不进休闲区等） |
| `spawnLocation` | 出生处：领地外 10 到 20 格、领地内、首领身边、指定家具处 |
| `groupSize` | 成组来（组长有额外战斗经验） |
| `specialTraits` | 每个随机特质带出现概率（例如 0.05 概率"制作快或慢"、0.03 概率"口臭"） |
| `initialRecruitment` | 开局免费送几个（常驻类） |

条件类型（`ImmigrantRequirement` 的变体，转述）：吸引物（建了某些家具、或持有某类物品，带"每人占用数"）、已研究的技术、昼夜、一次性费用、
指数费用、至少建有某家具、最早回合、需要有怀孕的魅魔、需要在某个已发现的友方势力那里有可招之人、教程进度、条件取反、全局标记。

更新循环（`Immigration::update`，转述）：

```
首次：生成全部常驻候选人，并按 initialRecruitment 免费接受；安排下一次抽取时刻
每次更新：
  删除超时的候选人（非常驻候选人寿命 = 500 时间单位，CollectiveConfig::getImmigrantTimeout）
  对设为"自动接受"的模板，候选人一出现就尝试接受
  若到了下一次抽取时刻：
    对每个模板 i：权重 w_i = 0（常驻或已达上限） 否则 frequency_i × Π(未满足条件的 candidateProb)
    若 Σw > 0：按权重抽一个模板，生成一组候选人（随机组大小、按概率附加特质）放进"可选列表"
              （抽取间隔很短的集体在列表已有 10 个时不再添加）
    下一次抽取时刻 = 间隔 × (当前间隔序号 + 1 + 随机[0,1))   // 每个间隔窗口内随机时刻抽一次
```

接受（`Immigration::accept`，转述）：

```
若 候选人仍有任何未满足条件 -> 拒绝（UI 显示原因列表）
若 人口已满且该模板不带"无上限"特质 -> 拒绝（原因：超过人口上限）
若 找不到足够的出生位置 -> 拒绝（原因：没有空位）
否则：生成；成组时组长的战斗经验设为 2；
      逐条"占用"条件：扣费用、指数费用；吸引物按 amountClaimed 记到这个人名下
```

- **吸引物占用**（`occupyAttraction`、`getAttractionOccupation`）：一个吸引条件写作"需要 N 个 {锻炉 或 工坊 或 珠宝台}"，每个接受的人把 N 个吸引物记在自己名下；
  下一个同类要来，必须有"总量减去已被占用量"的余量。人死或离开后，占用随之失效（只统计仍在集体中的人）。这保证"一张床一个人、一座锻炉一个匠人"。
- **指数费用**（`Immigration::calculateCost`）：同类已有 numType 人，前 numFree 个免费，之后费用 = `base × 2^((numType - numFree) / numToDoubleCost)`。
  数据例：`{ 1 ExponentialCost "GOLD" 30 5 4 }` 即基础 30 金、每多 5 个翻倍、前 4 个免费。
- **自动补床**（`CollectiveConfig::addBedRequirementToImmigrants`）：对每个非开局赠送的移民模板，按其体型与种类（人形、亡灵、坐骑、囚犯）推断床型，若条件里没有对应床就自动补一条"需要 1 张该床"。
- **缺失原因是一等公民**：`getMissingRequirements` 返回可读句子（"还需要 2 张床""需要研究某技术""白天不会来"），直接给 UI；`getAvailable` 只把"条件乘子大于 0"的候选人列给玩家。
- **自动接受与自动拒绝**（`setAutoState`）：玩家可对模板设"来了就收"或"来了就拒"，敌对村落的控制器对全部模板设自动接受（`VillageControl::acceptImmigration`）。
- **人口上限**（`Collective::getMaxPopulation`）= 配置基础值 + 家具加成之和 + 带"增加人口"特质的生物数；家具加成 = `min(已建数 × increase, limit)`。
  数据例：王座 +10，随从雕像每座 +1（石雕像封顶 4）。

#### 1.4.4 敌对势力：触发与进攻节奏

每个敌对聚落的控制器每次更新（`VillageControl::update`，转述）：

```
若 是敌对 且 可以进攻 且 以 0.1 的概率进入判定：
    p = max(各触发器的值)            // getAttackProbability：取最大，不相加
    以 p / 0.1 的概率决定进攻          // 折算回每次更新的概率 p
    挑进攻队伍（getAttackers）：空闲战士里随机取 k 人，
        k ∈ [minTeamSize, min(战士数, 总人数 - minPopulation)]，不够 minTeamSize 就不打
    有一定概率改成"首领单挑"（duelChance）
    launchAttack：传送到玩家地图、编队、下达进攻任务；
        若配置了赎金且玩家金币 ≥ 门槛：赎金 = max(门槛, 随机[0.6, 1.0] × 比例 × 玩家金币)
每次更新还检查：任何进攻队伍剩余不足一半（或只剩一个重伤者）-> 撤退并记一条"顶住了某某的进攻"
```

可以进攻（`canPerformAttack`）：未被征服；玩家在主基地地图；若有怕阳光的战士，则只在入夜且剩余夜晚足够时出兵。

触发器（`VillageBehaviour::getTriggerValue`，常量全部出自该函数）：

| 触发器 | 值 | 上限概率常量 |
| --- | --- | --- |
| 计时 `Timer{t}` | 玩家时间 ≥ t 时为常数 | `1/3000` |
| 房间 `RoomTrigger{家具, 每格概率}` | 每格概率 × 玩家已建该家具数 | 数据给定（例：恶魔祭坛 0.0001） |
| 实力 `Power` | `powerClosenessFun(我方危险度, 玩家危险度)`，低于 0.5 记 0 | `1/10000` |
| 趁虚 `FinishOff` | 玩家实力跌到历史最高的一半以下且自己不弱于玩家最高值时 | `1/1000` |
| 被杀 `SelfVictims` | `victimsFun(被玩家杀伤数)`：1 人 0.1，2 到 3 人 0.3，4 到 5 人 0.7，更多 1.0（同族他村成员被玩家杀死时计 0.15 人） | `1/500` |
| 玩家人口 `EnemyPopulation{n}` | `populationFun`：超出 n 的比例 <10% 为 0.1，<20% 为 0.3，<33% 为 0.6，更高 1.0 | `1/500` |
| 玩家资源 `Resource{资源, n}` | `goldFun`：超出比例 <10% 为 0.1，<40% 为 0.3，<100% 为 0.6，更高 1.0 | `1/1000` |
| 被偷 `StolenItems` | 有被偷物品就为 1 | `1/300` |
| 挖到旁边 `MiningInProximity` | 玩家挖穿了它的墙（发生过即计） | `1/20` |
| 邻近 `Proximity` | 地图相邻 | `1/5000` |
| 已征服数 `NumConquered{n}` | 被征服的主要与次要反派 ≥ n 时 0.5 到 1.0 | `1/3000` |
| 激怒型随从 `AggravatingMinions` | 玩家每有一个"激怒"状态的随从加一份 | 每个 `1/5000` |
| 立即 `Immediate` | 1 | 无 |

`powerClosenessFun(a = 我方/玩家)`：a < 0.4 为 0；0.4 到 1 为 a³（越接近势均力敌越想打）；1 到 2 为 `1 - (a-1)³ × 0.5`；a ≥ 2 为 `0.5 / (a-1)`（太强反而不屑）。

两道全局闸门：

1. **距离与进度闸**（`Campaign::refreshMaxAggressorCutOff`）：每个据点的"难度增量"= 比它更靠近玩家的阻挡型反派数 × 经验增量；
   只有难度增量 ≤ 已击败反派中的最大难度增量 + `maxAggressorDiff`（10）的据点才允许主动进攻。
2. **主反派闸**：主反派在玩家击败 3 个次要反派之前不主动进攻（`getNumLesserVillainsDefeated() < 3`）。

两道闸都只拦"主动"触发器；"被杀"与"被偷"不受闸门限制（`triggersAboveMaxAggressorCutOff`）。即：远处的强敌不会无缘无故打来，但你去惹它，它会报复。

进度回报（`DungeonLevel`）：击败小型反派或无类型 1.5、盟友 3、次要反派 6、主要反派 12 进度；第 L 级升级需要 `2L + 1` 进度；每级给 1 个研究点和 1 个晋升点。

#### 1.4.5 士气、奢侈度与房间效率

- **当前版本的士气是 Buff 而非数值**：`HIGH_MORALE` 的 `efficiencyMultiplier = 1.3`；击杀给 30 单位（`addMoraleForKill`），被鞭打给 400 单位；
  "首领死亡全员低士气"的代码在 `decreaseMoraleForKill` 里已被注释掉（推断：旧版的数值士气已被弃用，待核实其历史原因）。
- **工作效率**（`Collective::onAppliedSquare`）：每次使用家具产生的工作量 = 家具用时 × `getEfficiency`（Buff 乘子之积 × 加速 1.4 或减速 1/1.4）×
  `getLuxuryEfficiencyMultiplier` × 光照效率（需要光的家具）。
- **奢侈度乘子**（`Position::getLuxuryEfficiencyMultiplier`）：`min(2.0, 1 + Σ周围 3×3 家具奢侈度 / 4)`，即布置得越好干得越快，最多翻倍。
- **宿舍奢侈度与晋升**：宿舍奢侈度 = 宿舍各格奢侈度加上相邻墙的奢侈度（`getTotalLuxuryPlusWalls`）；
  晋升上限 `getMaxPromotionLevel(lux) = int(2 + round(10 × lux) × 0.1 / 3)`，约等于 `2 + lux / 3`；`getRequiredLuxury` 反推"想要这个战斗经验对应的晋升，宿舍需要多少奢侈度"。
- **工坊队列**（`workshops.cpp` 的 `Workshops::Type::addWork`、`unqueue`）：每件排队物品有进度 0 到 1；每次劳动增加 `劳动量 × 0.15 / 所需工作量`（常量 `prodMult = 0.15`）；
  原料在资源足够时预扣（`paid`），不够则记为欠账；进度为 0 时撤单全额退回；缺原料或技能不足的排队项跳过（`canCraft`）。

### 1.5 对《箱庭纪》的借鉴（分析）

可直接借的方法：

1. **两层劳力模型**。人口池（L4）不需要逐人寻路：按"岗位优先级 + 配额"批量填岗即可（替换 `runProduction` 的列表顺序贪心）；
   具名居民与据点阶段的工人用 KeeperRL 式任务板：玩家或工头下的活进板，绑定活动类型；领取按"优先标记 > 距离"，允许 6 格内更近者转交，放弃后冷却。
   这正好是 [城建 9](../../40_design/systems/city_building.md) "据点：工头按优先级排班；搬运自动"的实现骨架。
2. **资格表而非硬编码**。把"谁能做什么"写成按活动的资格谓词（种族、阶层、职业、潜质标签、技能、当前需求档位、昼夜），
   与 [NPC 社会 7.1](../../40_design/systems/npc_society_ai.md) 的日程模板"替换表"合用：模板给时段，资格表给可选活动。
3. **候选人式招募**。把 [城建 5.2](../../40_design/systems/city_building.md) 的"移民"与"招募"统一成候选人模板表：权重、条件（每条带"不满足时出现概率乘子"）、
   占用（每个匠师占一座工坊、每户占一处住房）、同类递增成本、候选人寿命、自动接受或拒绝。识才之门只决定玩家能看到候选人的哪些潜质字段，不改变生成。
4. **"为什么不来人"清单**。`getMissingRequirements` 的可读原因列表正是 [城建 8.7](../../40_design/systems/city_building.md) "可读性"所需；官员的观察栏（7.4 节"观察栏预计算"）也可以直接引用这张清单。
5. **进攻触发器表**。魔物潮、势力渗透、竞争商会的报复都可以写成"触发器 + 曲线 + 上限概率"的数据，取最大值而不相加；
   加上 KeeperRL 的两道闸（距离与进度闸、"惹了才报复"例外），能同时满足城建 10.3 "保底与密度"与 [防滚雪球](../../40_design/systems/city_building.md)（第 13 节）。
6. **奢侈度乘子与晋升上限**。把城建 5.4 的"归属、理想"层落成两个可见数字：工作场所布置乘子（上限 2）、住房品质决定精英成长上限。

要改造的点：

- KeeperRL 的活动重选是**均匀随机**，不可解释；我们应改为"需求档位与岗位优先级的确定性加权"，随机只用于打破平局，并走命名随机流（例如 `ctx.rng('city.labor')`）。
- KeeperRL 以"时间单位"逐步扫描；我们的人口池每游戏日结算一次（[城建 5.1](../../40_design/systems/city_building.md)），任务板只用于具名居民与在场景内可见的工人。
- KeeperRL 的进攻概率是"每步极小常量"，难调；我们以游戏日为单位直接给每日概率（`rollRaid` 现已如此）；[女神 GM 8.2](../../40_design/systems/goddess_gm.md) 的张力计（`director/tension.ts`）目前不读入聚落事件，建议接入作上限。

不要学的坑：

- 鞭打、酷刑给士气的设计与本作基调冲突；但"短期高效、长期代价"的结构可以映射为"亲手督工"（`hakoniwa/src/systems/city/orders.ts` 的 `micro` 中 `boost` 动作，计入依赖）。
- 源码里大量 `PROFILE_BLOCK` 集中在活动与任务扫描上，说明逐人逐步扫描家具是性能热点；我们规模更大，必须走人口池批处理。

### 1.6 许可与复用边界

代码 GPL-2.0 或更高：只借方法，不拷贝代码与数据文件；上文常量（6 格、50 冷却、0.15、1.3、2.0、`2L+1`、各触发器上限概率）属于单行公式与参数引用。
`data_free/` 文本数据为 CC BY-SA，不得原样搬入本作数据表。

---

## 2. OpenXcom（必读）

### 2.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-149`（索引链接为 `github.com/SupSuper/OpenXcom`，现重定向到组织仓库） |
| 仓库 | https://github.com/OpenXcom/OpenXcom |
| 固定提交 | `4a4bae5fa2e5a09282928e84943fc84b093e34ff`（2026-09-28） |
| 代码许可 | GPL-3.0（`LICENSE.txt`；README 另注部分代码来自 LGPL 的 SDL_gfx，经作者许可） |
| 素材许可 | 仓库不含原版 X-COM 资源，需玩家自备正版数据；`bin/standard/` 下少量自制资源各自附许可（例如 `Resources/Weapons/license.txt`） |
| 语言与规模 | C++（SDL）；`src/` 下约 650 个 `.cpp`/`.h`；规则集为 YAML（`.rul`） |
| 本地镜像 | `D:\hakoniwa_refs\openxcom`；已检出：`src/Basescape/`、`src/Geoscape/`、`src/Savegame/`、`src/Mod/`、`src/Engine/RNG.*`、`bin/standard/xcom1/*.rul` |
| 分级 | 必读（战术 AI 只简写） |

### 2.2 值得看的理由

- **资助方按月度表现调整资助，不满会退出**：理事国（`Country`）的月度评估是"女神与国家对玩家表现的反应"最干净的可运行样本，
  对应 [女神 GM 3、10](../../40_design/systems/goddess_gm.md)、[SLG 2.6](../../40_design/systems/grand_strategy_slg.md) 的神依赖度、[经济 6](../../40_design/systems/economy_and_trade.md) 的预算。
- **基地设施摆放与连通校验**：6×6 格、必须连到升降梯、拆除前做连通检查，几乎就是 [城建 2.3](../../40_design/systems/city_building.md) 庭格的现成规则。
- **研究与制造队列**：隐藏真实成本、模糊进度、按人头日推进；对应庭院书斋（城建 2.2"研究"）与 [经济 3.2](../../40_design/systems/economy_and_trade.md) 的地球知识变现。
- **数据驱动**：YAML 规则按 `type` 覆盖或 `delete` 删除，以及"月度任务脚本"这一数据化的敌方节奏调度器。

### 2.3 源码导读

| 想弄懂 | 读这些 | 该处的机制 |
| --- | --- | --- |
| 理事国怎么决定涨还是减 | `src/Savegame/Country.cpp` 的 `Country::newMonth`、`getSatisfaction`、`setNewPact`、`addActivityXcom`、`addActivityAlien` | 双账本、死区、随机判定、限幅、协约 |
| 月报、评级、出局 | `src/Geoscape/MonthlyReportState.cpp` 的 `MonthlyReportState::calculateChanges` 与构造函数中的评级与出局判断 | 全局分 = 我方活动 + 研究分 - 敌方活动；连续两月低于阈值出局；负债先警告一次 |
| 资金结算 | `src/Savegame/SavedGame.cpp` 的 `SavedGame::monthlyFunding`；`src/Savegame/Base.cpp` 的 `Base::getMonthlyMaintenace` | 资金 += 各国资助 - 各基地维护（飞行器、人员、设施） |
| 谁给分 | `src/Geoscape/GeoscapeState.cpp` 的 `time1Hour`、`processMissionSite`；`src/Geoscape/DogfightState.cpp`；`src/Savegame/AlienMission.cpp` | UFO 飞行每半小时给敌方加分（着陆翻倍）；击落给我方加分；任务点到期给敌方加分 |
| 协约（被对手收买） | `src/Savegame/AlienMission.cpp`（渗透任务的最后一波） | 敌方渗透任务完成时，区域内未签约的国家被标记"下月签约" |
| 设施能否摆 | `src/Basescape/BaseView.cpp` 的 `BaseView::isPlaceable`、`isQueuedBuilding` | 不出界、不重叠、至少一边贴着已有设施 |
| 能否拆 | `src/Savegame/Base.cpp` 的 `Base::getDisconnectedFacilities`、`destroyDisconnectedFacilities`、`destroyFacility`；`src/Basescape/BasescapeState.cpp` 的 `viewLeftClick` | 从升降梯出发做洪泛，拆掉后有设施断连则禁止 |
| 研究 | `src/Savegame/ResearchProject.cpp` 的 `step`、`getResearchProgress`；`src/Basescape/ResearchInfoState.cpp` 的构造函数；`src/Savegame/SavedGame.cpp` 的 `getAvailableResearchProjects`、`addFinishedResearch` | 真实成本随机化、按日推进、模糊进度、依赖与解锁 |
| 制造 | `src/Savegame/Production.cpp` 的 `Production::step` | 按小时累计工时，逐件检查资金与材料，可直接卖出 |
| 敌方节奏 | `src/Geoscape/GeoscapeState.cpp` 的 `determineAlienMissions`、`processCommand`；`bin/standard/xcom1/missionScripts.rul` | 数据化月度任务脚本 |
| 规则覆盖 | `src/Mod/Mod.cpp` 的 `Mod::loadRule` | 同 `type` 合并覆盖、`delete` 删除、索引表保序 |

### 2.4 机制拆解

#### 2.4.1 理事国的月度评估（核心）

每个国家保存三条滚动 12 期的序列：资助、我方在该国的活动分、敌方在该国的活动分（`Country` 的 `_funding`、`_activityXcom`、`_activityAlien`），
另有区域（`Region`）的同构序列；满意度 `_satisfaction` 取值 0（已签约）、1（不满）、2（满意）、3（高兴）。

月末（`MonthlyReportState::calculateChanges`，转述）：

```
对每个区域：开新一期账（Region::newMonth）；累加本月 我方小计 与 敌方合计；顺便算上月评分
若 已过第一个月：本月研究分 += 400              // "理事会第一个月之后更宽容"
全局我方分 = 本月研究分 + 我方小计
对每个国家：Country::newMonth(全局我方分, 全局敌方分, 协约分)
本月评分 = 全局我方分 - 全局敌方分
```

`Country::newMonth`（转述，参数为全局分）：

```
满意度 = 2
good = 全局我方分 / 10 + 本国我方分
bad  = 全局敌方分 / 20 + 本国敌方分
变化量 = 当前资助 × 随机[5%, 20%]（按千取整）
若 bad ≤ good + 30:
    若 good > bad + 30 且 随机[0, good] > bad:
        变化量限制在 "上限 - 当前" 以内；若变化量 > 0 则 满意度 = 3（涨）
否则:                                           // bad > good + 30
    若 随机[0, bad] > good:
        变化量取负，且不低于 "-当前"；若变化量 < 0 则 满意度 = 1（减）
若 本国被标记"下月签约" 且 未签约: 签约；本国敌方分 += 协约分
新资助 = 签约 ? 0 : (满意度 != 2 ? 当前 + 变化量 : 当前)
开新一期账（三条序列各推入一格，超过 12 期丢最旧）
```

要点：**±30 的死区**（差距不大时资助不动）；**判定是概率性的**（good 远大于 bad 才几乎必涨）；**每月最多变动 5% 到 20%**；
**资助有国家上限**（`fundingCap`，`countries.rul` 例：美国基数 600、上限 10000，单位千）；初始资助 = 随机[基数, 2 × 基数] × 1000（`RuleCountry::generateFunding`）。
国家对玩家的判断同时看"全局表现"（除以 10 与 20 的权重）和"在我家门口的表现"（本国活动分全额计入）。

出局（`MonthlyReportState` 构造函数中的评级段落）：

- 难度阈值 = `defeatScore + 100 × 难度系数`（`difficulty.rul`：`defeatScore: -900`；系数 0 到 4，`Mod` 构造中的 `DIFFICULTY_COEFFICIENT`）。
- **连续两个月**评分都 ≤ 阈值：出局。
- 资金 ≤ `defeatFunds`（`-1000000`）：第一次只发"理事会要求减债"警告（`setWarned(true)`），下次仍然如此才出局。
- 评级文本：≤ 阈值 - 300 糟糕；阈值 - 300 到阈值 较差；阈值到 0 尚可；0 到 500 良好；> 500 优秀。

协约：外星"渗透"任务的最后一波完成时，所在区域内尚未签约的国家被标记 `setNewPact`；月末正式签约，此后资助为 0、不再参与评估，并给敌方加一笔协约分（`AlienMission` 与 `Country::newMonth`）。

#### 2.4.2 谁在给分

- 每半小时：每架在飞的 UFO 给所在区域与国家的敌方账加 `getMissionScore`，着陆翻倍（`GeoscapeState::time30Minutes`）。
- 任务点存续期间每半小时给敌方加分，无人处理而过期再罚一笔（`processMissionSite`）。
- 击落 UFO 给我方加双倍分、迫降给单倍分（`DogfightState`）；飞行器被毁扣所在国家与区域的我方分（`GeoscapeState` 的飞行器处理段落）。
- 完成研究给"研究分"（`RuleResearch` 的 `points`，`SavedGame::addFinishedResearch` 调 `addResearchScore`）。研究分不进各国自己的账，但计入全局我方分，
  再经 /10 权重影响各国判定；`calculateChanges` 的注释称研究加成"只给理事会、不影响各国"，与代码不符（待核实是否为注释过时）。

#### 2.4.3 基地设施摆放与连通

- 网格 `BASE_SIZE = 6`，设施尺寸 1×1 或 2×2（机库）。
- **能否摆**（`BaseView::isPlaceable`）：所占格全在界内且为空；并且至少有一条边贴着已有设施。若未开启"建造队列"选项，贴着的那个设施必须已建成（`getBuildTime() == 0`）。
- **能否拆**（`BasescapeState::viewLeftClick`）：设施正在使用（有人住、有存货、有项目）则拒绝；
  调 `getDisconnectedFacilities(待拆设施)`，结果非空（有设施会与升降梯断连）则拒绝。
- **连通算法**（`Base::getDisconnectedFacilities`，转述）：以升降梯为起点做四邻洪泛；已建成的设施向四邻传导，在建设施能被连到但一般不向外传导（排队未开工者例外）；
  未被标记的设施即断连。升降梯本身不可拆；基地受损后的清理调 `destroyDisconnectedFacilities`。
- 设施数据（`facilities.rul`）：建造费、工期（天）、月维护费、提供的容量（住宿 50、实验室 50、车间等）。

#### 2.4.4 研究与制造

- **真实成本隐藏且随机化**：新开研究时，真实成本 = 规则成本 × 随机[50%, 150%]（`ResearchInfoState` 构造函数）。
- **按日推进**：`ResearchProject::step` 每日 `已投入 += 分配的科学家数`，`已投入 ≥ 真实成本` 即完成（`GeoscapeState::time1Day`）。
- **模糊进度**（`getResearchProgress`）：未分配人显示"无"；已投入 / 规则成本 ≤ 1/3 显示"未知"；之后按"分配人数 / 规则成本"给出 差（≤ 0.07）、中（≤ 0.13）、好（≤ 0.25）、优（更高）。
  玩家看到的是"投入强度"，不是"还差多少"。
- **依赖与解锁**（`getAvailableResearchProjects`）：`dependencies` 全部完成才出现，除非被某项已完成研究 `unlocks`；`requires` 是硬前置（不满足永不出现）；
  `getOneFree` 是"完成时随机白送其中一项"；已完成但仍有白送项或受保护解锁未发现的，保留在列表里；`needItem` 要求基地仓库里有该物品（例如尸体、俘虏）。
- **制造**（`Production::step`）：每小时 `已用工时 += 工程师数`；按"已用工时 / 单件工时"算出累计件数，每多一件先检查资金与材料，不足则返回"缺钱"或"缺料"状态并暂停；可选直接卖出。

#### 2.4.5 敌方节奏的数据化：月度任务脚本

`determineAlienMissions`（每月一次，转述）：

```
候选 = 所有脚本中满足：firstMonth ≤ 当前月 ≤ lastMonth（-1 无限）
                     且 已执行次数 < maxRuns（-1 无限）
                     且 minDifficulty ≤ 难度
                     且 researchTriggers 中每项"是否已研究"都符合要求
按脚本顺序处理每个候选：
    检查 conditionals：引用前面脚本的 label，正数要求它本月成功执行，负数要求它没执行
    以 executionOdds% 的概率执行（processCommand：按 missionWeights、raceWeights、regionWeights 抽具体任务，
        targetBaseOdds% 概率直指玩家基地所在区域，startDelay 延迟出发）
    若本脚本有 label：记下 本月 label -> 成功与否，供后续脚本引用（label 重复直接报错）
```

`missionScripts.rul` 例：开局必发一次侦察；"恐怖袭击"常驻；第 6 个月起"入侵"；研究了某关键技术后立刻"报复基地"（label 1），
若没触发则第 14 个月起由"新手报复"兜底（`conditionals: [-1]`）。这是一种用数据写出"保底 + 互斥 + 研究进度驱动"的节奏调度器。

#### 2.4.6 规则集覆盖

`Mod::loadRule`：节点带 `type`（或该类规则的主键）时，同名已存在就在原对象上合并加载，不存在就新建并追加到索引表（保留加载顺序）；
节点带 `delete` 则删除同名规则与索引项。多个 `.rul` 文件与模组按顺序叠加，后者覆盖前者的字段。

战术 AI（简写）：`src/Battlescape/` 未检出；战斗结果只以"活动分"与"任务点存废"影响月度评估，这与我们"战斗经 RTS 或自动结算，结果写回执"的分层一致。

### 2.5 对《箱庭纪》的借鉴（分析）

可直接借的方法：

1. **资助方周期评估模板**。适用于三类"资助方"：国家对玩家领地的封赏与援助（第三幕洛萨王国、第四幕承认国）、公会与商会联合的授信、女神的恩惠。结构：
   - 每个资助方两本滚动账："对我有利的事""对我不利的事"，按地区与全局分别记，全局部分打折计入；
   - 周期末（月或季）先比差距，落在死区内维持现状，否则按概率判定涨落，变幅 5% 到 20% 并受上限约束；
   - 结果写成满意度标签（不满、满意、高兴、已转投他方）和一条可读的回执（"洛萨王国对边境的治安满意，下季援粮增加一成"）；
   - 出局用"连续两期不及格"加"负债先警告一次"，避免一次坏运气直接判死。
2. **女神版只吃视线投影**。女神看不见玩家（[女神 GM 3.5](../../40_design/systems/goddess_gm.md)），所以她的"有利账、不利账"只能由神之视线样本填：
   信徒目击的事迹、神殿波动、他司借阅的铭录。账本本身就是 [女神 GM 3.3](../../40_design/systems/goddess_gm.md) 神之档案的一列，误判与过时自然发生。
3. **"协约"对应神约与契约加护**。OpenXcom 的协约是"被对手收买、退出资助并给对手加分"的独立通道；
   在本作里，聚落或国家接受某位女神的契约加护（[经济 3.6](../../40_design/systems/economy_and_trade.md)）就是同构：短期得到资源，长期计入神依赖度（[SLG 2.6](../../40_design/systems/grand_strategy_slg.md)），
   并且该聚落此后对"玩家的离手路线"不再计分。建议把它做成独立通道，而不是满意度的一个档位。
4. **庭院用"必须连到门"**。把升降梯换成"门"（庭院的入口门扉），庭格内建筑必须四邻连通到门；拆除前做连通校验；扩建不改规则只放大网格（[城建 2.3](../../40_design/systems/city_building.md) 的 3×3 到 12×12）。
   这比自由摆放更好调试，也天然表达"庭院是门后的房间"。
5. **书斋研究用"隐藏真实成本 + 模糊进度"**。地球知识转配方（[经济 3.2](../../40_design/systems/economy_and_trade.md)）的研究成本按命名随机流在开题时定下，玩家只看到"投入强度"档位；
   识才之门进阶可以把"未知"阶段缩短（与城建 7.2 的"按种子揭示一项、慢、有误差"同构）。
6. **事件脚本数据化**。把 [任务 3.8](../../40_design/systems/quests_and_events.md) 的 `DynamicEventTemplate.trigger` 补上 `firstWeek/lastWeek/maxRuns/label/conditionals/executionOdds` 这组字段，
   女神 GM 的兜底规划（`goddess/planning.ts` 的 `fallbackPlan`）与聚落调度器（`events.ts` 的 `runEvents`）就能共用一个确定性的周期调度器。

要改造的点：

- OpenXcom 直接调用全局随机；我们必须走命名随机流（例如 `ctx.rng('patron.<id>')`），保证回放一致。
- 理事国只看"分"；本作资助方还要看自治度（[城建 8](../../40_design/systems/city_building.md)）。建议：国家资助方奖励"自持记录 S"与"制度覆盖 I"，女神资助方奖励"信仰与依赖"，二者天然拉扯，正好表达离手主题。
- OpenXcom 的评估对玩家完全透明（月报）；本作国家层可以透明，女神层应是半显性（只给预兆与传闻，参见 [女神 GM 1.2](../../40_design/systems/goddess_gm.md)）。

不要学的坑：

- "第一个月之后研究分 +400"是为平衡硬塞的魔数，会让早期评估难以理解；我们的宽限期应写成显式规则（例如"立村后 4 周不评估"）。
- 只按活动分评估会鼓励刷分（击落小 UFO 刷正分）；我们的有利账应设每类事件的周期上限，与 [城建 8.7](../../40_design/systems/city_building.md) 反刷一致。

### 2.6 许可与复用边界

GPL-3.0：只借方法。上文常量（±30 死区、5% 到 20%、/10 与 /20 权重、`defeatScore -900`、两连败、研究成本 50% 到 150%、进度阈值 0.07/0.13/0.25）为参数引用。
`.rul` 规则文件不搬运；原版 X-COM 素材与本作无关。

---

## 3. Cataclysm: Dark Days Ahead（必读）

### 3.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-057`（"设定在后末日世界的 Roguelike 游戏"；索引正文另将其列为"生存系统参考"） |
| 仓库 | https://github.com/CleverRaven/Cataclysm-DDA |
| 固定提交 | `6627ec0750db17b40d90d1367758fe2fb54a4591`（2026-11-14） |
| 代码许可 | **CC BY-SA 3.0 Unported**（`LICENSE.txt` 第一段："Cataclysm is licensed under the Creative Commons Attribution-ShareAlike 3.0 Unported License"，覆盖代码与数据）；已核实传闻 |
| 素材许可 | 同上；字体（Unifont 为 OFL 加 GPL-2.0 带字体例外，Terminus 为 OFL，Roboto 为 Apache-2.0）与第三方库（Catch 为 BSL、plf 为 zlib、fmt 为 MIT）另有许可 |
| 语言与规模 | C++ 加 JSON；`src/` 下约 1180 个 `.cpp`/`.h`，`data/json/` 下约 3350 个文件 |
| 本地镜像 | `D:\hakoniwa_refs\cataclysm_dda`；已检出：`src/basecamp.*`、`src/faction_camp.*`、`src/mission_companion.*`、`src/npctalk*`、`src/condition.*`、`src/effect_on_condition.*`、`src/talker.h`、`src/dialogue*.h`、`src/dialogue_helpers.cpp`、`src/faction.*`、`src/faction_mission.cpp`、`src/npc_opinion.h`、`src/npc_favor.h`、`src/mission.*`、`src/missiondef.cpp`、`data/json/npcs/TALK_FACTION_CAMP.json`、`data/json/npcs/missiondef.json`、`data/json/npcs/common_chat/`、`doc/JSON/{BASECAMP,EFFECT_ON_CONDITION,FACTION_MISSIONS,MISSIONS_JSON,NPCs}.md`；另以 `git show` 单文件读取 `src/npc.h`、`src/npcmove.cpp`（未检出） |
| 分级 | 必读 |

### 3.2 值得看的理由

- **派系营地的限时委托**：把同伴（NPC）派出去做一件"有工期、有风险、有口粮成本、到期回来交结果"的事，是本作 [城建 9](../../40_design/systems/city_building.md) 委托机制、
  [任务 6.2](../../40_design/systems/quests_and_events.md) NPC 发布委托、[NPC 社会 8](../../40_design/systems/npc_society_ai.md) 官员与首领的"下令后等回执"最接近的开源实现。
- **营地扩建的数据化解锁**：蓝图的 provides、requires、excludes 标签，对应城建第 4 节建筑解锁与 2.3 庭院扩建。
- **驻营 NPC 的岗位优先级**：每个驻营者一张"工种到优先级"表，0 表示禁用，对应城建 6.3"具名居民的职业选择"。
- **对话 JSON 的条件、检定与效果**：对照我们 `quests/conditions.ts` 与 `quests/effect_types.ts`。

### 3.3 源码导读

| 想弄懂 | 读这些 | 该处的机制 |
| --- | --- | --- |
| 派一个人出去 | `src/faction_camp.cpp` 的 `basecamp::start_mission`；`src/mission_companion.cpp` 的 `talk_function::individual_mission`、`companion_choose`、`companion_sort`、`companion_rank` | 先查口粮够不够；按最难技能排序候选人供玩家选；交出装备；在 NPC 身上记下委托与时刻 |
| 多人同做一件 | `src/faction_camp.cpp` 的 `basecamp::start_multi_mission`；`src/basecamp.cpp` 的 `base_camps::to_workdays` | 循环加人直到没人或口粮不够；工期按人数平分并折算成"工作日" |
| 到期回来结算 | `src/faction_camp.cpp` 的 `basecamp::companion_choose_return`、`finish_return`、`mission_return`、`gathering_return`、`recruit_return`、`combat_mission_return`、`upgrade_return`、`search_results`、`hunting_results`、`survive_random_encounter` | 结果在"交差"时一次性算：技能经验、产出、遭遇、伤亡 |
| 紧急召回 | `src/faction_camp.cpp` 的 `basecamp::emergency_recall` | 提前叫回；集体工程把剩余工期分摊给留下的人 |
| 口粮账 | `src/faction_camp.cpp` 的 `basecamp::time_to_food`、`camp_food_supply`、`feed_workers`、`faction_template::consume_food_supply` | 按劳作强度与工期折算热量；固定工期任务预付，非固定工期回来后结算 |
| 招募委托 | `src/faction_camp.cpp` 的 `basecamp::recruit_return`、`recruit_evaluation`、`recruit_description` | 两段技能检定加一段讨价还价 |
| 营地士气与纪律 | `src/faction_camp.cpp` 的 `basecamp::camp_morale`、`camp_discipline`；`src/faction.h` 的 `likes_u`、`respects_u`、`trusts_u` | 营地士气与纪律直接读写派系对玩家的好感与敬畏 |
| 委托展示 | `src/faction_camp.cpp` 的 `update_time_left`、`update_time_fixed`、`update_emergency_recall`；`doc/JSON/FACTION_MISSIONS.md` | 剩余时间、已过时间、可否召回；委托说明逐步迁到 JSON（`faction_mission`） |
| 扩建解锁 | `doc/JSON/BASECAMP.md`（`blueprint_provides`、`blueprint_requires`、`blueprint_excludes`、`blueprint_resources`）；`src/faction_camp.cpp` 的 `basecamp::get_available_missions`、`start_upgrade`、`upgrade_return` | 标签驱动的升级树 |
| 驻营岗位 | `src/npc.h` 的 `job_data`；`src/npcmove.cpp` 的 `npc::find_job_to_perform`；`src/faction_camp.cpp` 的 `basecamp::job_assignment_ui` | 每人一张工种优先级表；空闲时按优先级找第一个能做的工种 |
| 对话条件 | `src/condition.cpp` 的 `conditional_t::conditional_t`、`parsers`、`read_condition`；`doc/JSON/NPCs.md` 的 Dialogue Conditions；`doc/JSON/EFFECT_ON_CONDITION.md` 的 Condition | JSON 树：and、or、not 加谓词表，谓词按 u_ 与 npc_ 两个主体成对注册 |
| 对话效果与检定 | `src/npctalk.cpp`；`doc/JSON/NPCs.md` 的 Responses、Trials、Opinion Changes、Response Availability、Dialogue Effects | 检定类型与修正项；成功失败各自的效果与好感变化；"显示但不可选"的原因 |
| 条件效果的独立触发 | `src/effect_on_condition.cpp`；`doc/JSON/EFFECT_ON_CONDITION.md` 的 Fields 与 EOC types | 周期、事件、死亡等触发；`deactivate_condition` 让不相关的周期效果休眠 |
| 玩家任务定义 | `doc/JSON/MISSIONS_JSON.md`；`data/json/npcs/missiondef.json` | 目标类型、期限、价值、开始与结束效果、后续任务、对白分段 |

### 3.4 机制拆解

#### 3.4.1 委托单的生命周期

委托在 NPC 身上存四个量（`npc` 的 `companion_mission_*` 族字段与 `set_companion_mission`，转述）：委托标识（营地位置、角色、委托类型与参数）、出发时刻、
预计返回时刻、劳作强度；另有委托背包（带出去的装备与带回来的东西）与途经点。

```
发起（basecamp::start_mission）：
  若 需要供餐 且 营地口粮 < time_to_food(工期, 强度, 路程): 拒绝（"口粮不够"）
  选人（companion_choose）：可用者 = 未在委托中、未在旅行、在营地或可见范围的同伴
       按"委托要求里最难的技能"降序排列，附三项相对评分（战斗、生存、产业，最高者记 100）
  交出装备 -> 委托背包；NPC 离开现场（不再参与实时模拟）
  返回时刻 = 现在 + 工期；记录强度
  若 需要供餐：按工期预扣口粮（固定工期类）

查看（update_time_left 等）：列出每人"已完成"或"剩余 X"，到期者可以叫回

交差（各 *_return，转述其共性 finish_return）：
  实际工时 = 固定工期类 ? 预计工期 : 现在 - 出发时刻
  技能经验：检定次数 = 1 + 工时分钟 / 10，每次从"该委托关联的技能分布"抽一项练习
  非固定工期类在此时补扣口粮；口粮不够只给一句"同伴看起来有些失望"
  把委托背包里的东西放进营地仓库；清空委托状态；回满饥渴与疲劳
紧急召回（emergency_recall）：
  按已过时间结算（不给技能经验）；若是多人集体工程，剩余工期按 n/(n-1) 分摊给留下的人
```

- **工作日换算**（`base_camps::to_workdays`）：工期小于 11 小时照实；否则每 10 小时工作（常量 `work_day_hours = 10`）折成 24 小时日历时间，余数照加。
  `time_to_food` 是它的逆运算：工作、路程、休息、睡眠四段按不同强度折算热量。
- **多人分工**（`start_multi_mission`）：循环"再加一个人"，每加一人重算 `工期 = 基础工期 / 人数` 和总口粮；没人可派或口粮不够就停。

#### 3.4.2 结果怎么算：以采集、遭遇、招募为例

采集类（`gathering_return`，常量出自该函数）：

| 委托 | 危险 `danger` | 运气 `favor` | 威胁 `threat` | 技能值 | 每周期检定次数 | 最短周期 |
| --- | --- | --- | --- | --- | --- | --- |
| 采集材料 | 20 | 2 | 10 | 2 × 生存 + 感知 | 6 | 3 小时 |
| 觅食 | 15 | 2 | 10 | 同上 | 12 | 3 小时 |
| 设陷阱 | 15 | 1 | 10 | 2 × 陷阱 + 感知 | 4 | 3 小时（推断） |
| 打猎 | 10 | 0 | 12 | 1.5 × 枪械 + 感知 / 2 | 2 | 4 小时（推断） |

```
若 1/danger 的概率 且 遭遇失败（survive_random_encounter）: 委托者死亡，结束
否则：finish_return；检定次数 = 每周期检定次数 × 实际工时 / 最短周期
     每次检定：若 技能值 > 随机[0, 15]，从该委托的物品组（觅食按季节换组）抽一件
```

遭遇（`survive_random_encounter`）是三段式：`生存 + 运气 > 随机[0,10]` 则悄悄避开；否则 `口才 + 运气 > 随机[0,10]` 则谈话脱身；
否则战斗：`近战诸技能和 × 随机[8,12] > 敌数(随机[0, threat]) × 随机[8,12]` 则生还，失败则死亡。源码注释自己承认"this entire system is stupid"。

招募（`recruit_return`，固定 4 天）：

```
1 找人：随机[1,20] + 生存 > 17 才遇到一个随机生成的人
2 说服来听：随机[1,20] + (100 × 口才 + 营地分) / 100 > 19
3 讨价还价：吸引力 = 随机[-5,3] + min(技能/3, 3)；玩家每多许诺 1 天口粮，吸引力 +1（不能超过营地存粮天数）
4 成交：随机[1,20] + 吸引力 ≥ 10；成交后从营地扣许诺的口粮
营地分（recruit_evaluation）= 营地等级 × 5 + 扩建数 × 2
                         + min(存粮千卡/10000, 10) + min(纪律/10, 5) + min(士气/10, 5)
                         + 隐藏加分（农田 ≥ 5、某些玩家特征，各 +10，源码注释要求"保持神秘"）
```

营地士气与纪律（`camp_morale`、`camp_discipline`）直接读写派系对玩家的 `likes_u`、`respects_u`；派系另有 `trusts_u`（决定可交易物品组）、`size`、`power`、口粮账。

#### 3.4.3 扩建：标签驱动的解锁树

（`doc/JSON/BASECAMP.md`）每个营地升级是一条配方，额外字段：

- `blueprint_provides`：完成后提供哪些"能力标签"及数量（例如 `bed`、`gathering`、`farming`、`recruiting`、`kitchen`、`walls`）；配方的 `result` 自动作为一个提供标签。
- `blueprint_requires`：开始前需要的标签与数量；同一扩建上同名标签数量相加。
- `blueprint_excludes`：存在即不可做（每个升级自动排除自己，所以不能重复做）。
- `blueprint_resources`：完成后加入营地库存的"虚拟设施"（例如一个代表炉灶的物品，供后续制作使用）。
- 一些标签在代码里有固定含义：每 2 个 `bed` 允许多一个扩建（最多 8 个）；`gathering` 解锁采集与分发口粮；`recruiting` 解锁招募委托；`farming` 解锁耕种系列；`kitchen` 等解锁对应配方组。

#### 3.4.4 驻营者的岗位优先级

`job_data`（`src/npc.h`）是"工种（屠宰、解剖、建造、车辆修理与拆解、耕作、伐木、劈板、钓鱼、搬运整理、拆解物品）到优先级"的表，默认全为 0（禁用）。
驻营者的决策树给出"营地工作"目标时，`npc::find_job_to_perform` 按优先级从高到低取第一个优先级非 0 且当前能做的工种，指派对应的多步活动；找不到就进入"工作间歇"。
另有"自由时间"目标（满足需要），营地工作扫描有节流（每 10 分钟一次）。决策树本身的时段划分在数据侧，未检出（待核实）。

#### 3.4.5 对话：条件、检定、效果

- **条件**（`conditional_t`）：JSON 对象，`and`、`or` 为数组，`not` 为对象或字符串；叶子从谓词表 `parsers` 查，表中每个谓词成对登记"说话者 `u_`"与"对方 `npc_`"两种写法
  （例如 `u_has_trait` / `npc_has_trait`）；还有 `math` 表达式与变量对象。效果条件（EOC）把同一套语法用到对话之外，主体称为 alpha 与 beta。
- **检定**（`trial`）：类型 `NONE`、`LIE`、`PERSUADE`、`INTIMIDATE`、`CONDITION`、`SKILL_CHECK`；难度是百分比成功率（越高越容易），
  `mod` 是"修正源 × 系数"的列表，修正源包括 NPC 对玩家的信任、恐惧、价值、愤怒，NPC 的性格（攻击性、利他、勇气、收集癖），已完成任务的总价值，双方的威慑估计，是否有某特质。
- **结果**：`success` 与 `failure` 各有去向话题、效果、好感变化（`opinion`：trust、fear、value、anger、owed、favors，均为加法）；`mission_opinion` 按任务价值缩放。
  好感影响后续：信任高易骗易说服，恐惧高易威吓但会逃，价值高易下令，愤怒高出 20 左右（视性格）转敌对；首次见面话题由恐惧与信任组合决定。
- **可见性**：`condition` 不满足则不显示；`show_condition` 或 `show_always` 让它显示但不可选，并可附 `failure_explanation` 与 `failure_topic`（"*钱不够：……"）；
  `switch` 加 `default` 实现"只显示第一个满足条件的分支，否则显示兜底分支"（例：按玩家钱数显示大、中、小三档贿赂）。
- **独立触发**（EOC 字段）：`recurrence`（周期，可为区间或变量）、`condition`、`effect`、`false_effect`、`deactivate_condition`（周期判定失败且此条成立就停止周期调用，直到特质或义体变化时重检）、
  `EOC_TYPE`（手动、周期、死亡、阻止死亡、事件）、`required_event`、`global` 与 `run_for_npcs`。
- **玩家任务**（`MISSIONS_JSON.md`）：`goal`（找物、刺杀、护送等）、`deadline`（可为区间或数学式）、`difficulty`、`value`、`start`、`end`、`fail` 效果、`followup`、`urgent`（进行中 NPC 只谈这件事）、
  `dialogue` 分段（描述、提出、接受、拒绝、建议、询问、成功、谎报成功、失败）。

### 3.5 对《箱庭纪》的借鉴（分析）

可直接借的方法：

1. **委托单（Commission）对象**。把"派具名 NPC 去做一件限时的事"做成内核对象，覆盖：官员出差（工务官去邻村调木料）、同伴巡逻（罗恩带民兵巡三天）、
   公会招募（老布伦去王都找匠人）、商会掌柜进货、庭院里夜羽整理仓储。建议字段：

   ```
   Commission {
     id, kind, siteId, assignees: residentId[], issuedBy: player | officialId
     startTick, dueTick, workdayHours            // 工期按工作日折算
     prepaid: { food, money, items }             // 出发时预扣
     risk: { encounterChance, threat }           // 遭遇参数
     yields: { table, checksPerCycle, cycleHours, difficulty }
     skills: { tested, trainWeights }            // 结算时的经验分配
     state: active | due | recalled | failed | settled
     receiptId?                                  // 回执，结算后写入
   }
   ```

   结算时刻：**到期即在内核结算**（而不是像 CDDA 那样等玩家来交差），因为本作要求"玩家不在场时世界照常运转"（[城建 8](../../40_design/systems/city_building.md) 自治度、考验）；
   但计算方式照搬 CDDA 的"一次性外推"：用 `ctx.rng('commission.<id>')` 一次算出检定次数、产出、遭遇，结果写回执并进日记。
2. **委托是自治度的计量单位**。官员自行发起的委托计入授权比 D 的"官员决定"，玩家亲自派的计入依赖（[城建 8.2](../../40_design/systems/city_building.md) 依赖增量表"亲手给具名居民派岗"）；
   玩家不在场时委托遇险并被官员处理成功，就是一次"考验成功"。
3. **口粮与工钱预扣**。出发前检查仓库与金库，够才派；这让委托与 [城建 6](../../40_design/systems/city_building.md) 生产链、[经济 6.2](../../40_design/systems/economy_and_trade.md) 维护费天然耦合，也是官员观察栏里"来不及的写明不要开始"的数据来源。
4. **多人分工与召回**。工期按人数平分（集体工程如修路、开荒、建围墙），紧急召回时剩余工期在留下的人之间按 `n/(n-1)` 摊开；召回给部分产出、不给经验。
5. **招募委托的三段式**。找人（侦察类技能）、说服（口才 + 聚落分）、谈条件（许诺口粮、工钱、住房换吸引力），聚落分 = 规模 + 扩建 + 存粮 + 治安 + 幸福 + 隐藏加分。
   第三段正好可以让具名候选人的 AI 在菜单里讨价还价，内核只校验许诺是否付得起。和 KeeperRL 的候选人模板合用：委托"找来"一个候选人，候选人再走接受流程。
6. **能力标签式解锁**。庭院扩建、领地建筑、商会分号都用 provides、requires、excludes 标签；把"床位每 2 张多一个扩建"这类规则写成标签的派生规则，而不是硬编码前置。
7. **具名居民的岗位优先级表**。每个具名居民一张"活动到优先级"表（0 禁用），玩家设表计入依赖、工头或官员设表不计（[城建 6.3](../../40_design/systems/city_building.md)）；
   居民 AI 的"我想去锻造坊当学徒"就是提议改自己表中某一项，由内核按空缺与资格裁决。
8. **对话条件的三项补强**（对照 `quests/conditions.ts`）：主体限定谓词（"说话者有某特质""对方信任 ≥ 40"；具名 NPC 信任已镜像为 `trust.<id>` 旗标、可写比较式，缺的是绑定当前说话者的主体谓词与其他关系维度），带关系修正的检定（修正源取 [NPC 社会 6.1](../../40_design/systems/npc_society_ai.md) 的关系维度），
   "显示但不可选并给出原因"。周期性条件效果可以承载官员的常设命令与政策卡（"粮仓低于 15 天自动减酒"就是一条 recurrence + condition + effect）。

要改造的点：

- CDDA 的结算发生在"玩家来交差"那一刻，玩家不来就永远不结算；本作必须到期自动结算，否则自治度与考验无从计算。
- CDDA 的遭遇判定写死在代码里，台词也是硬编码弹窗；本作应把遭遇做成事件模板（[任务 3.8](../../40_design/systems/quests_and_events.md)），由叙事导演控制密度。
- CDDA 的营地士气直接等于派系好感；本作已有更细的幸福账本（[城建 5.5](../../40_design/systems/city_building.md)），委托结果应以带来源的因子写入（"罗恩巡逻归来：+2，剩 7 天"）。

不要学的坑：

- "失败即死亡"在 CDDA 是硬核卖点，本作的具名居民是叙事资产，委托失败应优先落为受伤、失物、被俘、延期，死亡只在重大风险且有预兆时发生。
- 隐藏加分"请不要公开讨论"与本作"所有影响走可解释通道"（[城建 8.4](../../40_design/systems/city_building.md)）相悖；可以隐藏在传闻里，不能隐藏在数值里。
- 对话 JSON 极度灵活带来的维护成本很高（`EFFECT_ON_CONDITION.md` 单文件约六千行）；我们保持字符串语法与封闭效果集合，只做上面三项补强。

### 3.6 许可与复用边界

CC BY-SA 3.0 覆盖代码与数据：属于"相同方式共享"，不能把任何代码、JSON、文本搬进本作（否则本作相应部分须以 CC BY-SA 发布）。
只借机制；上文常量（10 小时工作日、检定次数公式、各委托的危险与检定参数、招募阈值 17、19、10）为参数引用，本作数值需自行定标。

---

## 4. Endless Sky（选读，中）

### 4.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-111`（"类似经典《Escape Velocity》系列的太空贸易与战斗游戏"） |
| 仓库 | https://github.com/endless-sky/endless-sky |
| 固定提交 | `56649d3fc2a9198670a5347bb69084d99c8eaf18`（2026-11-14） |
| 代码许可 | GPL-3.0 或更高（`copyright` 的 `Files: *`；`license.txt`）；`data/` 文本文件头同为 GPL-3.0 |
| 素材许可 | `copyright` 逐目录：`images/*` 为 CC BY-SA 4.0（Michael Zahniser），`images/land/*`、`images/scene/*` 多为公有领域照片，另有若干例外条目 |
| 语言与规模 | C++；约 530 个 `.cpp`/`.h`；数据为缩进式自定义文本 |
| 本地镜像 | `D:\hakoniwa_refs\endless_sky`；已检出：`source/{Trade,System,Government,Politics,Mission,MissionAction,ConditionSet,ConditionsStore,NPC,Port,GameAction,Planet}.*`、`data/commodities.txt`、`data/governments.txt`、`data/gamerules.txt`、`data/human/jobs.txt`；另以 `git show` 读取 `source/GameData.cpp`、`source/HailPanel.cpp`、`source/TradingPanel.cpp` |
| 分级 | 选读（中） |

### 4.2 值得看的理由

星系间价格与贸易对照 [经济 4.2](../../40_design/systems/economy_and_trade.md)；政府声望的"按态度矩阵传导"与贿赂对照 [声望 5](../../40_design/systems/reputation_and_cognition.md)；
任务 DSL（条件集、触发器、期限与报酬公式）对照 [任务 3、4](../../40_design/systems/quests_and_events.md) 与公会委托板。

### 4.3 源码导读与机制

| 想弄懂 | 读这些 | 机制 |
| --- | --- | --- |
| 价格怎么来 | `source/System.cpp` 的 `System::StepEconomy`、`System::Price::Update`、`SetSupply`；`source/GameData.cpp` 的 `GameData::StepEconomy`、`AddPurchase`；`data/commodities.txt` | 每日：本地供给保留 89%、出口 10%，再加正态噪声（标准差 2000 吨）；随后各星系从每个邻居收"邻居出口 / 邻居的连线数"；价格 = 基价 + `int(-100 × erf(供给 / 20000))` |
| 玩家买卖如何回写 | `source/TradingPanel.cpp` 调 `GameData::AddPurchase` | 交易在当日不动价格，延迟到每日经济步；`AddPurchase` 只记录吨数为负的一侧（玩家卖出，抬高当地供给），买入不扣减供给 |
| 声望 | `source/Politics.cpp` 的 `Politics::Offend`、`IsEnemy`、`AddReputation`、`SetReputation`、`ResetDaily`；`source/Government.cpp` 的 `PenaltyFor` 与默认惩罚表；`data/governments.txt` 的 `player reputation`、`attitude toward` | 对 A 的冒犯，按"其他每个政府对 A 的态度权重"传导到所有政府；权重绝对值小于 0.05 不产生永久变化 |
| 贿赂 | `source/Politics.cpp` 的 `Politics::Bribe`、`BribePlanet`；`source/HailPanel.cpp` 的 `HailPanel::SetBribe`；`Government` 的 `GetBribeFraction`、`GetBribeThreshold` | 贿金 = `1000 × int(sqrt(舰队总价) × 贿赂系数)`；有门槛的政府要求声望不低于门槛；效果只持续到当日结束 |
| 任务 DSL | `source/Mission.h` 的 `Mission::Trigger`、`Location`；`source/Mission.cpp` 的 `CanOffer`、`Instantiate`；`source/ConditionSet.h` 的 `ExpressionOp`；`source/GameAction.cpp` 的 `payment` 解析与实例化；`data/human/jobs.txt` | 见下 |

声望细节（转述）：

```
Offend(被冒犯政府 G, 事件类型 E, 规模 count):
  对每个政府 O:
    w = O 对 G 的态度（-1 到 1）
    惩罚 = O.PenaltyFor(E, G)                         // 可按政府覆盖
    若 惩罚是"挑衅" 且 w > 0: O 取消对玩家的贿赂并进入"被挑衅"（当日敌对）
    若 count > 0 且 |w| ≥ 0.05:
        声望变化 = count × w × 惩罚.数值
        若 惩罚是"暴行" 且 w > 0: 先把对 O 的声望压到 ≤ 0
        对 O 的声望 -= 声望变化（并夹在 O 的上下限内）
是否敌对（玩家与 O）: 被贿赂 -> 否；被挑衅 -> 是；否则 声望 < 0
默认惩罚：协助 -0.1（即协助加声望）、致瘫 0.5、登舰 0.3、摧毁 1.0、扫描 0、挑衅（特殊）、暴行 10（特殊）
```

任务 DSL（转述）：

- 条件集 `ConditionSet` 是对命名整数条件（`ConditionsStore`）的表达式树：变量、字面量、加减乘除取模、最小最大、六种比较、与或（短路返回值）。
- 任务有 `to offer`、`to accept`、`to complete`、`to fail` 四组条件；触发器 `OFFER`、`ACCEPT`、`DECLINE`、`COMPLETE`、`FAIL`、`ABORT`、`DEFER`、`VISIT`、`STOPOVER`、`WAYPOINT`、`DAILY`、`DISABLED` 各挂一组动作（发钱、罚款、改条件、发事件、赠物）。
- 地点：空港、着陆、任务板（`job`）、援助、登舰、进入星系等；`repeat` 用条件 `<任务名>: offered` 计数限制重复。
- 任务板任务用 `to offer` 里的 `random < 40` 做概率出现；源与目的地用过滤器（政府、星球属性、距离区间）抽取。
- **期限** = 现在 + 基数 + 系数 × 跳数（只写 `deadline` 时每跳 +2 天）；**报酬** = 基数 + (跳数 + 1) × 载荷 × 系数（只写 `payment` 时系数 150）（`GameAction::Instantiate`）。

### 4.4 对《箱庭纪》的借鉴（分析）

- **价格公式对照**：我们 `economy/market.ts` 已有"目标库存比的幂次倍率 + 平滑"（[经济 4.2](../../40_design/systems/economy_and_trade.md)）；Endless Sky 的 `erf` 饱和曲线与"邻居按连线数分摊出口"是更简单的扩散写法，
  可用于 AI 商人尚未实现时的区域价差收敛兜底。Endless Sky 的"交易延迟到日结才回写价格"，我们的 `economy/market.ts` 已经是这种写法：成交只改库存，价格倍率只在日结 `driftMarket` 里按每日上限移动，玩家在同一天内的连续买卖不会自己把价格推飞。
- **声望传导要经过"看见"**：Endless Sky 的冒犯按态度矩阵瞬时传给所有政府；本作声望来自信念与传闻（[声望 0、4](../../40_design/systems/reputation_and_cognition.md)），
  建议把"态度权重 × 惩罚表"用作**传闻生成时的立场系数**（盟友听到会同仇敌忾、敌人听到会暗喜），不直接改数值；`|w| < 0.05` 不传导的阈值可直接沿用为"无关势力不关心"。
- **贿赂是"当日覆盖"而非永久改关系**：适合卫兵盘查、关卡刁难、教会小吏（[经济 3.4](../../40_design/systems/economy_and_trade.md) 商队过关、[城建 7.4](../../40_design/systems/city_building.md) 寻租）；
  价格随"可被掠夺的身家"开方增长，门槛要求"至少不是死敌"。
- **公会委托板的报酬与期限公式**：跳数换成驿道天数、载荷换成货量或护送人数，即可得到一条可调的报酬曲线；`random < 40` 式的概率挂单让委托板每天不同而又确定（走命名随机流）。

### 4.5 许可与复用边界

GPL-3.0 代码与数据：只借公式与结构；`data/` 文本不搬运。

---

## 5. OpenDungeons（选读，短）

### 5.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-142`（"受《地下城守护者》启发的开源游戏"） |
| 仓库 | https://github.com/OpenDungeons/OpenDungeons |
| 固定提交 | `a9efe49a6f0790f8b5f89a6cd93775b197ecab1c`（2025-10-04，分支 `development`） |
| 代码许可 | GPL-3.0 或更高（`LICENSE.md`：所有 `.cpp`、`.h`、脚本与说明文本） |
| 素材许可 | 美术与界面脚本按 `CREDITS` 逐项，`licenses/` 内含 CC BY-SA 3.0、CC BY 3.0、CC0、MIT、SIL OFL |
| 语言与规模 | C++（Ogre3D）；约 490 个 `.cpp`/`.h`；配置为自定义节段文本 |
| 本地镜像 | `D:\hakoniwa_refs\opendungeons`；已检出：`source/creatureaction/CreatureActionSearchJob.*`、`CreatureActionGetFee.*`、`CreatureActionLeaveDungeon.*`、`source/creaturemood/`、`source/spawnconditions/`、`source/entities/CreatureMoodValues.h`、`source/entities/Creature.cpp`、`source/rooms/Room.*`、`source/game/Seat.cpp`、`config/`、`licenses/` |
| 分级 | 选读（短） |

### 5.2 机制要点

- **来人计分**（`Seat::getNextFighterClassToSpawn`、`spawnconditions/*`、`config/spawnconditions.cfg`）：每类生物一组条件：房间（至少 N 个有效格，每多一格加若干分，可为负）、金币（至少 N，每多 100 金加分）、
  已有某类生物（至少 N 个，每多一个加分，可为负，例如巨魔讨厌兽人记 -50）。任一条件不满足即不来；总分为负也不来。
  **首次满足条件的那一类必定来一个**（并播报"新生物"）；之后按"基础分 100 + 条件分"加权随机。
- **心情**（`CreatureMoodManager`、`Creature::computeMood`、`config/global.cfg`）：心情值 = 基础 1500 + 各修正之和；≥ 1200 高兴，≥ 0 平常，≥ -1000 烦躁，≥ -2000 愤怒，更低为暴怒。
  修正按生物定义（`creatures.cfg` 的 `MoodModifiers`）：饥饿过阈值、困倦过阈值、欠薪（每欠 100 金乘系数）、掉血、太久没打仗。心情每 0 到 5 回合重算一次（随机冷却）。
- **后果**（`CreatureActionSearchJob::handleSearchJob`、`Creature` 的暴怒计数）：烦躁时每次找活有 20% 不干；愤怒与暴怒完全不干；暴怒连续 `NbTurnsFuriousMax`（120）回合仍没离开地城，就叛变为无主生物。
- **薪俸**（`Creature::itsPayDay`、`CreatureActionGetFee`、`CreatureMoodFee::computeMood`）：发薪日按等级累加应付金额，生物会自己去金库领；欠超过一期且大于 100 金开始扣心情。
- **房间亲和**（`creatures.cfg` 的 `RoomAffinity`）：每种房间两个数：喜好度（大于 0 才会自己去）与效率（大于 0 才能在里面干活）；喜好为 0、效率大于 0 表示"自己不去，被扔进去会干"。

### 5.3 对《箱庭纪》的借鉴（分析）

- "首次满足条件必来一个"是很好的**教学保底**：玩家第一次建成学堂、医馆、锻造坊时，保证有一位对应的人来投奔（可由莫伊拉的"巧合"菜单包装，[女神 GM 8.3](../../40_design/systems/goddess_gm.md)）。
- 心情阈值把"幸福低"落成可见的行为：怠工概率、罢工、出走，与 [城建 5.5](../../40_design/systems/city_building.md)"幸福 < -10 效率下降并外逃、< -25 骚乱"同构，可以把怠工概率写成档位表。
- "喜好度与效率分离"适合具名居民：喜欢去酒馆不代表能在酒馆干活；对应岗位优先级表（第 3.5 节第 7 条）与资格表（第 1.5 节第 2 条）。

### 5.4 许可与复用边界

GPL-3.0：只借方法；配置文本不搬运；美术逐项许可，不使用。

---

## 6. UFO:AI（选读，短到中）

### 6.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-172`（"《X-COM》精神续作，回合制基地管理结合战术战斗对抗外星人"） |
| 仓库 | https://github.com/ufoai/ufoai |
| 固定提交 | `763173ed036ebbee32c2a7bf6aefa19748df89ff`（2025-03-24） |
| 代码许可 | GPL-2.0（`COPYING`） |
| 素材许可 | `LICENSES` 逐文件列出：多数为 GPL-2.0 或 GPL-2.0 或更高，另有 CC BY-SA 3.0、CC BY 3.0、公有领域、少量 GPL-3.0 或更高 |
| 语言与规模 | C 风格 C++（id Tech 2 派生）；约 1730 个 `.cpp`/`.h`；脚本数据为 `.ufo` |
| 本地镜像 | `D:\hakoniwa_refs\ufoai`；已检出：`src/client/cgame/campaign/` 下的 `cp_nation.*`、`cp_base.cpp`、`cp_base.h`、`cp_campaign.*`、`cp_xvi.*`、`cp_alien_interest.*`、`cp_event.cpp`、`cp_research.cpp`，以及 `base/ufos/nations.ufo`；另以 `git show` 读取 `base/ufos/campaign.ufo` |
| 分级 | 选读（与 OpenXcom 同类，只写差异） |

### 6.2 与 OpenXcom 的差异（源码事实）

| 方面 | OpenXcom | UFO:AI |
| --- | --- | --- |
| 满意度 | 离散 0 到 3，按月概率判定 | 连续值 0 到 1（`NAT_SetHappiness` 夹取），每日与每场任务都会变 |
| 资助 | 当前资助按月涨落 5% 到 20% | `NAT_GetFunding = 最大资助 × 满意度`，满意度即资助比例 |
| 日常侵蚀 | 敌方活动分累计到月末 | 每日对每个"在本国领土上进行中的"恐怖、颠覆政府、地面侦察、散播 XVI、收割任务，满意度 -0.02（`HAPPINESS_ALIEN_MISSION_LOSS`，`NAT_UpdateHappinessForAllNations`） |
| 任务结算 | 加减活动分 | `CP_HandleNationData`：表现 = 平民表现 + 外星人表现；影响幅度 = `0.004 × 平民数 + 0.004 × 外星人数`，上限 0.07（`HAPPINESS_MAX_MISSION_IMPACT`）；受影响国全额，其他国 1/5 |
| 资助方还供人 | 无（人员在市场雇） | `NAT_HandleBudget`：每月按 `该国最大人数 × 满意度 × 战役雇员系数` 生成可雇的科学家、士兵、飞行员、工人（满意度为 0 不出兵与飞行员） |
| 出局 | 两连败或负债 | 负债超过 `negativeCreditsUntilLost`；没有基地且钱不够建；全球平均 XVI 感染率超限；**半数以上国家**满意度低于 `minhappiness`（`NATIONBELOWLIMITPERCENTAGE = 0.5`，`CP_CheckLostCondition`）；`campaign.ufo` 中 `minhappiness` 由易到难为 0.1、0.2、0.30、0.35、0.42 |
| 敌方节奏 | 数据化月度脚本 | `INT_IncreaseAlienInterest`：总兴趣每 `(HOURS_PER_ONE_INTEREST - 难度)` 小时 +1；各类别兴趣在任务结束时按总兴趣的比例增长，超过总兴趣后增长减半（`INT_ChangeIndividualInterest`） |
| 设施 | 6×6、连到升降梯 | 同样做连通检查（`B_IsBuildingDestroyable` 为 BFS）；另有**建筑依赖**：`dependsBuilding` 未运转则本建筑不运转，依赖建成或拆除时级联启停并触发事件（`B_CheckUpdateBuilding`、`B_UpdateStatusBuilding`） |
| 环境侵蚀 | 无 | XVI 感染在地球覆盖图上扩散与衰减，按国家面积归一化（`CP_SpreadXVI`、`CP_ReduceXVIEverywhere`、`CP_UpdateNationXVIInfection`） |

日序（`cp_campaign.cpp` 的时间推进段落）：每小时研究、生产、转运、兴趣增长；每日医院、生成任务、XVI 扩散、满意度侵蚀、市场、战役事件、XVI 衰减与按国统计。

### 6.3 对《箱庭纪》的借鉴（分析）

- **连续满意度 × 最大值**比离散档更适合女神恩惠与国家援助这类"比例型"资源；离散档留给文字标签与通知（UFO:AI 也只在标签变化或越过阈值时发消息，`NAT_SetHappiness`）。
- **资助方同时供人**：国家满意时派来学者、工匠、老兵（对应 [城建 5.2](../../40_design/systems/city_building.md) 招募与 7.1 人才稀缺），女神满意时派来神职与加护者（同时扩大她的视线），
  这让"取悦谁"有清楚的人才代价；与 KeeperRL 候选人模板合用：资助方满意度作为某些候选模板的权重乘子。
- **"半数资助方离心才出局"**比"任一不满即出局"宽容，适合第四幕同盟与诸国承认度。
- **XVI 与澱同构**：环境侵蚀按地图扩散、按领土归一化后反馈满意度与失败条件，和 [城建 12](../../40_design/systems/city_building.md) 澱的领地化、澱害进入吸引力公式一致，可作为澱扩散的参考实现（待核实其扩散核的细节）。
- **建筑依赖链**：医馆依赖药圃、书斋依赖庭院清域等"依赖未运转则停摆"的规则，比"缺原料停工"更早暴露结构问题；配合 CDDA 的能力标签即可数据化。

### 6.4 许可与复用边界

GPL-2.0 代码与 GPL、CC BY-SA 混合素材：只借方法，不搬运任何 `.ufo` 数据与美术。

---

## 7. Pioneer（选读，短）

### 7.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-153`（"孤独太空冒险游戏"） |
| 仓库 | https://github.com/pioneerspacesim/pioneer |
| 固定提交 | `f8219ded72469eae73b96396b2b4608614c87978`（2026-11-10） |
| 代码许可 | GPL-3.0（`AUTHORS.txt` 的 Licensing 段；`licenses/GPL-3.txt`）。README 另声明不接受 AI 生成代码的贡献 |
| 素材许可 | CC BY-SA 3.0 Unported（`AUTHORS.txt`；`licenses/CC-BY-SA-3.0.txt`），第三方库另有 Apache、BSD、zlib 等 |
| 语言与规模 | C++ 加 Lua；约 1100 个 `.cpp`/`.h`/`.lua` |
| 本地镜像 | `D:\hakoniwa_refs\pioneer`；已检出：`data/libs/Economy.lua`、`data/libs/Economy/`、`data/modules/NewsEventCommodity/NewsEventCommodity.lua`、`data/modules/TradeShips/Flow.lua`、`src/galaxy/Economy.*`、`src/galaxy/Polit.*`、`licenses/` |
| 分级 | 选读（短） |

### 7.2 机制要点（`data/libs/Economy.lua`）

- **离屏市场一次性外推**（`Economy.UpdateStationMarket`、`extrapolate_bounded_walk`）：市场只记上次更新时刻；玩家来访时按经过的整数个市场刻（`kMarketUpdateTick`）一次性外推供给、需求与库存。
  外推不是逐刻模拟，而是"有界随机游走"的闭式抽样：以当前值与均衡值为两端、按经过时间加权的正态分布中抽一个值；随机源用"站点种子 + 上次更新时刻"构造（`Rand.New(sbody.seed .. '-stockMarketUpdate-' .. ...)`），保证同一存档同一时刻结果相同。
- **均衡库存**（`GetCommodityStockTargetEquilibrium`）：供大于求时在"供减求 + 可得进口"与"中位数"之间按 求/供 插值；求大于供时在"(供 + 求 + 进口) × e⁻¹"与中位数之间按 供/求 插值；中位数 = 0.33 × 供 + 可得进口。
- **价格修正**（`GetCommodityPriceMod`）：在系统均价上下最多 ±15%（`kMaxCommodityVariance`）；过剩为负、短缺为正，附近有货可降低短缺溢价最多一半；买卖各收 2% 手续费防止倒卖（`TradeFeeSplit`）。
- **玩家影响会衰减**：玩家买卖记在"历史"项里，每次外推按正态抽样衰减，大额历史衰减更快。

### 7.3 对《箱庭纪》的借鉴（分析）

本作有很多"玩家不在时也要有状态"的东西：远方市场、离屏聚落、在外的委托、AI 商会。Pioneer 的做法是**按经过时间一次性外推 + 键控随机种子**：
不在场时不逐日模拟，来访或到期时用 `ctx.rng('market.<id>.<上次结算日>')` 一次抽样到当前，结果确定且省算力。与 CDDA 的"交差时结算"、第 3.5 节"委托到期结算"是同一思路，
可以写进 `docs/50_tech/` 的离屏结算约定（分析，交由技术方案决定）。

### 7.4 许可与复用边界

GPL-3.0 代码、CC BY-SA 3.0 素材：只借方法。

---

## 8. 跨项目结论（分析）

1. **工作分派分两层**。人口池按"岗位优先级 + 配额"每日批量填岗（替换 `production.ts` 的列表贪心）；具名居民用任务板（KeeperRL：优先标记 > 距离，6 格内更近者可转交，放弃后冷却）
   加个人岗位优先级表（CDDA：0 为禁用，按序取第一个能做的）。活动选择用需求档位与优先级的确定性加权，随机只打破平局并走命名随机流。玩家亲手设表计入依赖，工头或官员设表不计。
2. **招募用候选人模板**。权重 × Π(未满足条件的出现乘子)；接受时校验全部条件并给出可读的缺失原因；吸引物按人占用（一床一人、一炉一匠）；同类递增成本；候选人有寿命；
   可设自动接受或拒绝（KeeperRL）。叠加两条保底：首次满足条件必来一个（OpenDungeons）、资助方满意度作为相关模板的权重乘子（UFO:AI 的资助方供人）。识才之门只改变候选人信息的可见度。
3. **委托做成内核对象**。出发预扣口粮与钱物；记录开始与到期时刻、风险与产出表；**到期在内核里一次性结算**（检定次数按工时折算、遭遇、产出、经验），写回执与日记；
   可紧急召回（按已过时间部分结算、集体工程分摊剩余工期）；多人分工按人数平分并折算工作日（CDDA，改为到期自动结算）。委托的发起者区分玩家与官员，直接喂给自治度的授权比 D 与考验 S。
4. **资助方反应用周期评估**。双账本（有利与不利，地区全额、全局打折）、死区、概率判定、限幅、上限、标签与回执、连续两期不及格才出局、负债先警告一次（OpenXcom）；
   比例型资源用连续满意度 × 最大值（UFO:AI）。女神的账本只由视线投影填写；"被对手收买"（OpenXcom 的协约）对应契约加护，做成独立通道并计入神依赖度。
5. **敌对方进攻节奏用触发器表**。每个触发器给出一个概率，取最大值不相加；队伍有最小规模与留守人数；损失过半撤退；可要赎金（KeeperRL）。
   外加两道闸：距离与进度闸（远处强敌不主动来），"惹了才报复"例外。长期节奏用数据化周期脚本（OpenXcom：首末期、次数上限、标签互斥、执行几率、研究进度触发），与张力计共同限密度。
6. **解锁用能力标签，布局用连通规则**。建筑、庭院扩建、商会分号用 provides、requires、excludes 标签（CDDA）与"依赖未运转则停摆"（UFO:AI）；庭院庭格要求四邻连通到门，拆除前做连通校验（OpenXcom）。
7. **效率与住房做成可见乘子**。工作场所的布置乘子（KeeperRL：`min(2, 1 + 周围奢侈度 / 4)`）、住房品质决定精英成长上限、心情阈值决定怠工与出走（OpenDungeons）；
   全部进入"自治报告"或建筑说明，不做隐藏乘数（与 [城建 8.4](../../40_design/systems/city_building.md) 一致）。
8. **离屏状态一律"按经过时间一次性外推 + 键控随机种子"**。远方市场（Pioneer）、在外委托（CDDA）、离屏聚落都只在来访或到期时计算，保证确定性又省算力；交易对价格的影响延迟到日结（Endless Sky；我们的 `economy/market.ts` 已经如此：成交只改库存，价格倍率只在日结 `driftMarket` 里按每日上限移动）。
9. **对话与事件条件只做三项补强**。保留现有字符串条件语法与封闭效果集合，补主体限定谓词、带关系维度修正的检定、"显示但不可选并说明原因"（CDDA）；
   周期性条件效果（recurrence + condition + effect + 休眠条件）承载官员常设命令与政策卡。

---

## 9. 未能获取或略过

| 项目 | 索引锚点 | 处理 | 理由 |
| --- | --- | --- | --- |
| Colobot | `#native-130` | 略过 | 可编程单位 RTS。对"委托规则"的启发只有一句：玩家给单位写的程序相当于常设命令，本作的常设命令与政策卡应是受限的条件效果，不开放任意脚本 |
| Space Engineers | `#native-118` | 略过 | 体素沙盒，与基地经营的人员与资助机制无关 |
| Starbound | `#native-119` | 略过（许可不明） | 殖民地契约"按家具标签招租户"与本主题相关，但索引所列 `rwf93/Starbound` 为个人账户上传、仓库无许可文件、来源无法确认（已于 2026-03 归档），不读 |
| Minetest（Luanti） | `#native-115` | 略过 | 方块沙盒引擎，无经营与委托系统 |
| Terasology、Unturned、The Powder Toy 等沙盒 | `#native-120` 到 `#native-122` | 略过 | 与本主题无关 |
| CorsixTH | `#native-131` | 略过（不越界） | 《主题医院》的员工招聘、薪资与疲劳、房间与士气与本主题相邻；本机已有他人克隆 `D:\hakoniwa_refs\corsixth`，归城建人口模拟线，建议交叉阅读 |
| Race into Space | `#native-156` | 略过（可选补读） | 年度预算随声望调整，与 OpenXcom 理事国同类；本篇未读源码，若需要"资助方"第三个样本可补读 |
| Harris | `#native-133` | 略过 | 轰炸机司令部策略，资源与士气偏战役层，归 SLG 线 |
| Hurry Curry! | `#native-123` | 略过 | 合作烹饪动作游戏，无经营深度 |
| OpenXcom 战术层 `src/Battlescape/` | `#native-149` | 未检出 | 战术 AI 只简写；结果对经营层的影响已在第 2.4.2 节说明 |
| Cataclysm: DDA 的驻营者决策树数据与营地配方 JSON | `#native-057` | 未检出 | 只读了 `job_data` 与 `npc::find_job_to_perform`；决策树时段划分与具体配方数据未读（待核实） |

本篇所有仓库均获取成功；网络无失败重试。
