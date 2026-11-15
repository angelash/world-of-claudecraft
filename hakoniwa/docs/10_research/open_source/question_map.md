# 问题到源码速查：城建、RTS、SLG、经济

> 所属目录：`docs/10_research/open_source/`。调研归档，不具约束力（正典优先级第 6 级）。调研日期：2026-11-15。
> 用法：按本作设计文档的章节找到"先读"的源码（项目、文件、符号），再到分册对应小节看机制拆解与借鉴分析。
> 路径都相对各仓库根目录，仓库与固定提交见各分册的信息表，本地镜像在 `D:\hakoniwa_refs\<id>`（见 [README.md](README.md) 第 5 节）。
> "要点"一列是分析，不是结论；采纳与否由 `../../40_design/`、`../../50_tech/` 决定。

分册简称：城建 = [city_builders.md](city_builders.md)，物流 = [economy_logistics.md](economy_logistics.md)，
RTS = [rts.md](rts.md)，SLG = [slg_4x.md](slg_4x.md)，殖民 = [colony_base_management.md](colony_base_management.md)。

## 1. 城建与领地（[city_building.md](../../40_design/systems/city_building.md)）

| 本作条目 | 先读 | 再读 | 要点（分析） | 分册 |
| --- | --- | --- | --- | --- |
| 3.4 摆放规则与可走性校验 | CorsixTH `CorsixTH/Lua/dialogs/edit_room.lua` 的 `UIEditRoom:checkReachability` | OpenXcom `BaseView::isPlaceable`、`Base::getDisconnectedFacilities` | 只检查新建物外圈可通行格是否两两连通，替代 `placement.ts` `findSpot` 对每个通过前置校验的候选格仍要做的一次放置后全图 BFS；物件占地的"操作位"标志就是缺的 `slot` 码；庭院格要求连通到门 | 城建第 6 节；殖民第 2 节 |
| 3.5 道路与拥堵 | Micropolis `MicropolisCore/src/MicropolisEngine/src/traffic.cpp` 的 `makeTraffic`、`tryDrive` | Lincity-NG `src/lincity/lintypes.cpp` 的 `Construction::trade`（路段流量即拥堵读数） | 出行是"从地块出发随机走到目标区划"，走过的路格累加交通密度场；不必模拟车辆 | 城建第 1、3 节 |
| 3.6 区划、覆盖与邻接 | Julius `src/figure/service.c`（`MAX_COVERAGE`）与 `src/building/house_service.c` | Micropolis 分块场与平滑（`pollutionTerrainLandValueScan`、`crimeScan`） | 覆盖用"到达即拉满、每日减一"的计数器，到达方式可换成拓扑分钟数可达集；地价、澱、污染放在低分辨率地段场上 | 城建第 2、1 节 |
| 5.2 人口来源、人才招募 | KeeperRL `immigration.cpp` 的 `Immigration`、`getMissingRequirements`、`occupyAttraction` | OpenDungeons `source/spawnconditions/`（首次满足条件必来一个）；CDDA `recruit_return` | 候选人模板加权，接受时校验并给出可读的缺失原因；吸引物按人占用；同类递增成本；候选人有寿命 | 殖民第 1、5、3 节 |
| 5.4 需求层级 | Julius `src/building/house_evolution.c`（`has_devolve_delay`、`building_house_determine_evolve_text`） | Unknown Horizons `content/objects/buildings/tent.yaml`、`horizons/world/building/settler.py`；Caesaria `house.model` | 逐栋住房分级加滞回（进化阈高于退化阈、退化需连续确认）；需求做成住房自己的"生产线"，产出幸福；每栋每日一个原因码 | 城建第 2、4 节 |
| 5.5 幸福与治安 | Unknown Horizons `Settler.pay_tax`（税率扣幸福） | OpenRCT2 `PeepThought`、`CalculateParkRating`；Stone Kingdoms 人气因子 | 幸福是可产可取的资源；个体"想法"加全体汇总下钻；评分逐项可拆 | 城建第 4、5 节；物流第 7 节 |
| 5.6 迁入与迁出 | Micropolis `Micropolis::setValves`（注意 C++ 版的住宅阀缺陷，以 `micropolis-activity/src/sim/s_sim.c` 或 micropolisJS `src/valves.js` 为准） | Julius `src/city/sentiment.c`、`src/city/migration.c`；Lincity-NG 人口池与棚户 | 需求做成"失衡积分进有界阀，再由局部评价分配"的两段式，而不是瞬时阈值加随机 | 城建第 1、2、3 节 |
| 6.3 劳力分配（部门官优先级） | Julius `src/city/labor.c`（九类劳力、玩家优先级、`DEFAULT_PRIORITY`） | KeeperRL `task_map.cpp` 的 `TaskMap::getClosestTask`；CDDA 驻营 NPC 岗位优先级 | 玩家定过优先级的类先足额，其余按默认权重轮询，类内按覆盖比例分人；没有劳力可达性的建筑分不到人 | 城建第 2 节；殖民第 1、3 节 |
| 6.4 仓储与运输 | Widelands `src/economy/economy.cc` 的 `Economy::balance`（请求与供给撮合） | KaM `TKMDeliveries.CalculateBid`；Julius `determine_cartpusher_destination`；Lincity-NG `equilibrate_stuff` | 聚落内批量搬运用液位均衡流（便宜、自带拥堵读数）或请求撮合；可见运输用目的地优先级加预约；都要有容量、预约与"为什么停" | 物流第 1、4 节；城建第 2、3 节 |
| 6.2 生产链（含魔物压力） | Unknown Horizons YAML 生产链 | Mindustry `PowerGraph`（效率取各消耗满足率的最小值） | 生产与防守共用同一效率模型，防守压力自然传导到产出 | 城建第 4 节；物流第 6 节 |
| 7 人才与官员 | KeeperRL 奢侈度效率与晋升上限 | OpenDungeons 心情阈值（怠工、罢工、出走） | 工作场所布置乘子、住房品质决定精英成长上限，全部做成可见乘子 | 殖民第 1、5 节 |
| 8 自治度（8.2 自持记录） | Lincity-NG `World::sustainability_test` | UFO:AI 连续满意度 | 六项条件各自统计连续达标年数，可直接补进自持记录 S 与审期结算 | 城建第 3 节；殖民第 6 节 |
| 8.7 可读性与反刷 | OpenRCT2 想法汇总 | Micropolis `cityEvaluation`（十大问题民调）；Julius 进化说明文字 | 每个坏结果都有计数器或原因码；"为什么"查询集中在 `queries.ts` 一侧 | 城建第 5、1、8 节 |
| 9 委托（常设命令） | Widelands `Economy::TargetQuantity` 与生产程序的 `return=skipped unless economy needs` | Freeciv `common/aicore/cm.h` 的 `cm_parameter`、`server/cityturn.c` 的 `auto_arrange_workers`；CDDA `basecamp::start_mission`、`finish_return` | 委托只调"目标、优先级、开关"三种原语；约束硬、目标软、无解交还玩家；限时委托在到期时由内核一次结算 | 物流第 1 节；SLG 第 1 节；殖民第 3 节 |
| 10 事件 | Julius `building_maintenance_check_fire_collapse`（逐栋风险时钟） | KeeperRL `VillageBehaviour::getTriggerValue`、`Campaign::refreshMaxAggressorCutOff`；OpenXcom `determineAlienMissions` | 火灾等由可读的风险累积触发，巡视清零；敌对进攻取各触发器概率的最大值，加距离与进度闸；长期节奏用数据化周期脚本 | 城建第 2 节；殖民第 1、2 节 |
| 12 澱的扩散 | Micropolis 污染场与平滑 | Lincity-NG 污染扩散 | 澱作为地段场，按场的扩散与衰减计算，而不是逐格事件 | 城建第 1、3 节 |
| 女神对城市的态度（[goddess_gm.md](../../40_design/systems/goddess_gm.md)） | Julius `src/city/gods.c` 的 `city_gods_calculate_moods`、`update_god_moods` | OpenXcom `Country::newMonth`（资助方评估）；UFO:AI 满意度乘最大资助 | 态度与怒气用"覆盖率加冷落加节庆宽限加人口下限"的公式算（带惯性、确定性），AI 女神只决定在注册菜单里花掉哪一份 | 城建第 2 节；殖民第 2、6 节 |

## 2. 即时战术（[warfare_rts.md](../../40_design/systems/warfare_rts.md)）

| 本作条目 | 先读 | 再读 | 要点（分析） | 分册 |
| --- | --- | --- | --- | --- |
| 2.2 兵团节拍、RTS-1 手感 | 0 A.D. `source/simulation2/system/TurnManager.h`（`DEFAULT_TURN_LENGTH`）与 `CCmpPosition` 插值 | Last Colony `js/game.js` 插值；openage `doc/` 的曲线设计 | 5Hz 模拟是成熟做法，手感问题在渲染插值、错峰结算与即时回执 | RTS 第 1、7、6 节 |
| 2.4 手动与自动共用内核 | OpenRA `OpenRA.Game/Activities/`（Activity 栈） | 0 A.D. `UnitAI.js` 订单队列 | 命令可排队、可取消、可组合；切换控制者只换命令来源，不碰兵团状态 | RTS 第 2、1 节 |
| 2.5 层间换算、5.5 自动结算与胜算 | Wesnoth `src/attack_prediction.cpp` 的 `combatant::fight` 与 `src/actions/attack.cpp` 的 `battle_context_unit_stats` | VCMI `lib/bonuses/` 的 `BonusList::totalValue`；FreeOrion 战力平方根合成 | 预测与实战用同一数值构造，输出完整分布；复杂度超阈值（`fight_complexity`）改蒙特卡洛 | SLG 第 4、3、2 节 |
| 3.2 克制与伤害 | 0 A.D. `simulation/helpers/Attack.js`（每点抗性乘 0.9、按类别的加成） | OpenRA 弹头 Versus 表；Warzone 2100 `weaponmodifier` 表 | 倍率乘积加抗性指数衰减两段式；克制以按类别匹配的乘数表达 | RTS 第 1、2、4 节 |
| 3.4 士气与疲劳 | 0 A.D. `BattleDetection.js` | Zero-K `cmd_retreat` 撤退滞回 | 用伤害速率加警觉度滞回区分"小摩擦"与"会战"；撤退阈值带滞回 | RTS 第 1、5 节 |
| 4 英雄是乘数（光环封顶） | 0 A.D. `Auras.prototype.GetModifierIdentifier`（同名光环不叠加） | VCMI 攻防差封顶、"增益相加、减益相乘"（`scripts/damage/damageCalculator.lua`）；Wesnoth `leadership` | 同类取最高、增益先求和再乘一次，防止多个系数连乘指数放大；本作 `engage.ts` `auraSums` 已按光环类别去重（同类取最强）并各自封顶 0.3 | RTS 第 1 节；SLG 第 3、4 节 |
| 4.4 将领成长与忠诚 | Wesnoth 经验与 AMLA | 7KAA `src/OUNIT.cpp` 的 `Unit::update_loyalty`、`commander_power`；Wyrmsun 持久英雄 | 经验来源分击杀与参战两类；士兵忠诚随将领统率与同族加成趋近目标值 | SLG 第 4、6 节；物流第 2 节 |
| 5.3 阵型 | 0 A.D. `Formation.js` 的 `ComputeFormationOffsets` 与 `UnitAI.js` 的 `FORMATIONCONTROLLER` | KaM 匈牙利算法编队；Zero-K `cmd_customformations` | 阵型是带自己寻路的控制器实体，成员追槽位；但兵团接敌不散，槽位只用于画面 | RTS 第 1、5 节；物流第 4 节 |
| 5.4 寻路与大量单位 | 0 A.D. `HierarchicalPathfinder`、`MakeGoalReachable` | Recoil `rts/Sim/Path/QTPFS/`（同目标路径共享、脏块重建）；OpenRA `HierarchicalPathFinder` | 二叉堆 A* 加区块连通判可达，同目标共享路径，可破坏地形用脏块增量重建；索敌用网格分桶加查询差分（`CCmpRangeManager`） | RTS 第 1、5、2 节 |
| 5.2、6.1 视野与侦察 | 0 A.D. `CCmpRangeManager` 每格计数 | OpenRA `Shroud` | 每格可见计数加已探索位，迷雾不进模拟真值 | RTS 第 1、2 节 |
| 6.3 占领据点 | 0 A.D. `Capturable.js` | 0 A.D. `Promotion.js`（老兵） | 占领强度对抗而不是计时；老兵等级是"等级到修正项"的数据表 | RTS 第 1 节 |
| 7 AI 将领（方案、小队） | 0 A.D. Petra `attackManager`、`AttackPlan` | OpenRA `GroundUnitsAttackMoveState`、`AttackOrFleeFuzzy`；Dune Legacy 价值预算 | 方案实例化为计划对象（未执行、集结、行军、抵达）；小队有凝聚度检查、超时回退、同一目标盯防上限 | RTS 第 1、2、8 节 |
| 7.3 玩家不在场的战线 | Curse of War `grid.c` 的 `spread` 与 `state.c` 的流动规则 | Curse of War `king.c` 的各种国王策略 | 旗帜势场加人口流动加对称消耗，是可视化的 C 层抽象；授权书即旗帜集合，将领性格即插旗公式 | RTS 第 3 节 |
| 9.2 可读性 | 0 A.D. `BattleDetection.js` | Dune Legacy 伤害损失比 | 把攻逃判定的输入与结论写进战报 | RTS 第 1、8 节 |
| RTS-5 规模基准、确定性 | 0 A.D. `CTurnManager::TurnNeedsFullHash` | OpenRA `SyncReport`（逐字段报告） | 每类计算设每步上限；战斗内周期哈希，失败时能指出第一个分歧字段 | RTS 第 1、2 节 |

## 3. 大战略（[grand_strategy_slg.md](../../40_design/systems/grand_strategy_slg.md)）

| 本作条目 | 先读 | 再读 | 要点（分析） | 分册 |
| --- | --- | --- | --- | --- |
| 1.3、5.3 补给与补给线 | FreeOrion `Empire/Supply.cpp` 的 `SupplyManager::Update` | 无（运力层需自建） | 补给范围逐跳扩散、敌方静止武装阻塞、先到者保路、争夺按据点排序；连通分量即补给组 | SLG 第 2 节 |
| 2.2 稳定的阈值效果 | Unciv 规则集的条件 Uniques | FreeOrion 稳定度门槛 | 慢变量用"目标值加当前值"，每日最多移动若干 | SLG 第 5、2 节 |
| 2.3 外交好感账本 | Unciv `DiplomacyManager.diplomaticModifiers` | Freeciv 好感 love 与事件分级 | 按类别记修正项，各类以不同速度回归 0；同类反复事件递减叠加 | SLG 第 5、1 节 |
| 2.5 行政容量 | FreeOrion `_BASE_INFLUENCE_COSTS` 与政策 | Freeciv 帝国规模动乱 | 行政开销随规模超线性增长 | SLG 第 2、1 节 |
| 2.6 神依赖度（受益记账） | FreeOrion `AccountingInfo` | 无 | 每次修正写入追加一条记账，按受益方聚合即得"近 360 天受益神力" | SLG 第 2 节 |
| 2.5、2.6 多种族忠诚与叛乱 | 7KAA `src/OTOWN.cpp` 的 `Town::update_target_loyalty`、`camp_influence`、`think_rebel` | Stone Kingdoms 人气公式（反例） | 目标忠诚由族群和谐、声望、就业、同族、驻军等分项构成，实际值有限步长趋近 | 物流第 2、7 节 |
| 3.1 统治者人格 | FreeOrion `default/python/AI/character/character_module.py` | Unciv `Personality` | 人格是特质对象，只移动权重、阈值与接受线，不靠随机数 | SLG 第 2、5 节 |
| 3.2 决策管线（Utility 兜底） | Unciv `MotivationToAttackAutomation` | Freeciv `dai_war_desire`；7KAA `OAI_TALK.cpp` 的 `consider_*` | 动机是带名字的修正项列表，可单独显示、低于门槛短路；规则 AI 返回"评分减接受线"，理由可直接写进国书 | SLG 第 5、1 节；物流第 2 节 |
| 3.2 规划分解与运营执行 | VCMI `AI/Nullkiller2/` 的 `DeepDecomposer`、`PriorityEvaluator` | Wesnoth `candidate_action_evaluation_loop`；Tanks of Freedom 打分 AI | 目标分解、分档、去冲突；执行层每次只做最优动作的第一步再全局重评 | SLG 第 3、4、7 节 |
| 3.3 权限分级、给大模型的动作菜单 | OpenTTD `src/script/api/`（`ScriptObject`、`ScriptTestMode`） | OpenRA Bot 只下命令且限速 | 同一命令通道、按身份分级接口、只暴露此刻合法动作、试算模式、枚举错误码、配额与挂起 | 物流第 3 节；RTS 第 2 节 |
| 4.1、4.3 条款与接受度 | Freeciv `ai/default/daidiplomacy.c` 的 `dai_goldequiv_clause`、`dai_treaty_evaluate` | Unciv `TradeEvaluation` | 每个条款折成金币等价再求和，不小于 0 即接受；关系缺口按平方扣分 | SLG 第 1、5 节 |
| 4.1 宣战须提前公开 | Freeciv 宣战 `countdown` 与 `war_reason` | Unciv 秘密备战计数 | 宣战有前奏，反扑可预警 | SLG 第 1、5 节 |
| 4.2 承诺与可信度 | Unciv `Demand` 与 `onDemandViolation` | Freeciv 撕约理由 | 承诺有期限；违约时受害者与所有共同认识的国家各自扣分，构成公开信誉 | SLG 第 5 节 |
| 4.5 反联盟 | Freeciv 第三方好感下降 | Unciv 好战度 | 联合对抗只看公开实力与威胁，不针对玩家（7KAA `think_unite_against_big_enemy` 是反例） | SLG 第 1、5 节；物流第 2 节 |
| 5.6 和谈 | Unciv `evaluatePeaceCostForThem` | Freeciv 和平条款门槛 | 和约估值随战局与厌倦变化 | SLG 第 5 节 |
| 6.1、6.2 商路、禁运 | 7KAA `trade_treaty` 与进口付款 | Widelands 批次贸易协定 | 条约是贸易闸门，进口款付给出口国；本作现有 `'trade'` 条约没有经济效果 | 物流第 2、1 节 |
| 6.3 情报行动 | 7KAA `src/OSPY.cpp`、`Firm::spy_bribe_succeed_chance` | FreeOrion 威胁情报衰减 | 煽动、破坏、贿赂、暗杀、秘密报告各有判定结构；结果写知识层而非世界真值 | 物流第 2 节；SLG 第 2 节 |
| 9.4 国家层委托 | Freeciv `cm_parameter` 与 `auto_arrange_workers` 回退链 | Unciv `CityFocus` | 约束硬、目标软、无解交还玩家并通知，多级降级保证总有方案 | SLG 第 1、5 节 |
| 女神的资助与惩罚（神依赖度） | OpenXcom `Country::newMonth` | UFO:AI 国家满意度 | 双账本、死区、限幅、连续两期不及格才出局；"被对手收买"做成独立通道 | 殖民第 2、6 节 |

## 4. 经济与贸易（[economy_and_trade.md](../../40_design/systems/economy_and_trade.md)）

| 本作条目 | 先读 | 再读 | 要点（分析） | 分册 |
| --- | --- | --- | --- | --- |
| 3.4 商队与商路（服务质量与份额） | OpenTTD `UpdateStationRating`、`MoveGoodsToStation` | Simutrans 站点拥挤背压 | 竞争落在服务评分与份额上，不落在改价上；评分每次有限变动 | 物流第 3、5 节 |
| 3.6 竞争者 | OpenTTD 地方当局评价与贿赂 | 7KAA 城镇优先买本国市场 | 贿赂失败有黑名单与评分清零的后果 | 物流第 3、2 节 |
| 4.2 区域供需与贸易流 | OpenTTD `src/linkgraph/demands.cpp`、`mcf.cpp`、`flowmapper.cpp` | Simutrans 站点路由；Endless Sky 价格扩散 | 链路图加需求加容量约束流，需求改为价差驱动；异步计算在快照上进行并在固定日期合并 | 物流第 3、5 节；殖民第 4 节 |
| 4.x 离屏市场 | Pioneer `data/libs/Economy.lua` 的 `UpdateStationMarket` | Endless Sky `GameData::StepEconomy` | 离屏状态按经过时间一次外推，随机种子按 id 与上次更新时刻键控 | 殖民第 7、4 节 |
| 5.1 流水四张表 | Widelands 请求与供给账 | 7KAA 进口付款 | 货有来处去处、钱有去向，三层物流都能直接产出四张表 | 物流第 1、2 节 |
| 6 财政（税、维护、预算） | Micropolis `updateFundEffects` | Unknown Horizons 分级税率；Stone Kingdoms 税与人气 | 拨款比例影响服务强度；税直接扣幸福 | 城建第 1、4 节；物流第 7 节 |
| 7 注册修正项合同 | FreeOrion `Universe::ExecuteEffects`（优先级阶段、叠加组、`AccountingInfo`） | VCMI `BonusList::totalValue`；0 A.D. `GetTechModifiedProperty_numeric`；OpenRA 条件 | 固定合成顺序、按阶段插入覆盖类修正、叠加组按目标对象去重、每次写入带来源记账 | SLG 第 2、3 节；RTS 第 1、2 节 |
| 8.1 梅尔卡的价格修正 | Endless Sky 价格曲线与贿赂 | OpenTTD 通胀 | 修正以注册修正项进入，交易对价格的影响延迟到日结 | 殖民第 4 节；物流第 3 节 |

## 5. 跨系统

| 主题 | 先读 | 再读 | 要点（分析） | 分册 |
| --- | --- | --- | --- | --- |
| 确定性与回放 | Julius `src/core/random.c`；Widelands `pairid` 平局键 | 7KAA 错峰调度；OpenTTD 固定日期合并 | 只有少数项目的随机可回放；移植时一律改用按系统命名的随机流、固定排序与显式平局键，并写黄金样例测试 | 城建第 8 节；物流第 8 节 |
| AI 只下命令、命令进回放 | OpenRA `ModularBot` | 0 A.D. Petra 错峰运行 | 与"模型提议，内核裁决"同构 | RTS 第 2、1 节 |
| 慢变量与软数值 | 7KAA 忠诚趋近 | FreeOrion 计量、OpenTTD 车站评分 | 统一用"目标值加有限步长趋近"，目标值分项作为带来源条目展示 | 物流第 8 节；SLG 第 8 节 |
| 对话与事件条件 | CDDA `src/condition.*`、`src/effect_on_condition.*` | Wesnoth `src/game_events/`；Endless Sky `ConditionSet` | 补主体限定谓词、带关系修正的检定、"显示但不可选并说明原因"；周期性条件效果承载常设命令 | 殖民第 3、4 节；SLG 第 4 节 |
