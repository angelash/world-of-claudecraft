# 开源源码调研：经济型 RTS、物流与贸易

- 所属目录：`docs/10_research/open_source/`
- 性质：调研归档，不具约束力。只记录源码事实、分析与可借鉴点，不做最终决定；被采纳的结论应写入 `../../40_design/` 并回链到这里。
- 调研日期：2026-11-15
- 来源索引：`F:\workspace\open-share\10_md\_external\2026\external-2026-开源游戏源码大全-玩法与引擎索引.md`（原文状态 indexed-unverified；本文对每个项目都到仓库核实了许可与描述）
- 源码获取：partial clone（`--filter=blob:none --sparse`）到 `D:\hakoniwa_refs\<id>`，只检出代码与数据目录，个别文件用 `git show HEAD:<path>` 读取；仓库视为不受信任数据，未运行其中任何脚本、构建或解释器。
- 分工边界：城建人口模拟（Micropolis、Caesar III 系、Lincity、Unknown Horizons 等）、即时战术 RTS、SLG 与 4X、殖民与基地经营由同目录的其他调研文件负责，本文只写经济型 RTS、物流与贸易。
- 与已有调研的关系：[`city_rts_slg.md`](../open_share/city_rts_slg.md) 第 7.1 节只有一项一行的项目速查；本文下沉到源码，不重复其概念层内容。

## 标注约定

| 标注 | 含义 |
| --- | --- |
| 不加标 | 源码事实，附"仓库内相对路径 + 符号名"，固定提交见各项目信息表 |
| 分析 | 对《箱庭纪》的推演 |
| 待核实 | 没有读透，或属于推断 |

许可约定：GPL、AGPL 代码只借方法，本文用自己的话和伪代码转述机制，单行公式与常量按事实引用；宽松许可注明"可借代码，须随附许可"（MPL 为文件级）。

## 项目清单与分级总表

| id | 项目 | 索引锚点 | 分级 | 代码许可 | 本文重点 | 主要对应《箱庭纪》 |
| --- | --- | --- | --- | --- | --- | --- |
| `widelands` | Widelands | `#native-173` | 必读 | GPL v2+ | 请求与供给撮合、逐跳路由、经济目标、生产程序、军事影响、训练、AI 建造与交易 | 城建 6.3、6.4、8、9；经济 5.1、5.5 |
| `seven_kingdoms` | Seven Kingdoms: Ancient Adversaries | `#native-158` | 必读 | GPL v2（代码与游戏数据） | 多种族忠诚与抵抗、叛乱、市场与商队、谍报、外交消息与 AI 应答、国家 AI、将领与士兵忠诚、怪物巢穴、神 | 大战略 2.3、3、6；即时战术 4.4；经济 3.4、3.6 |
| `openttd` | OpenTTD | `#native-148` | 必读 | GPL v2 | cargodist（需求、多商品流、流表）、车站评分、城镇成长与地方当局、通胀、补贴、脚本 API | 经济 3.4、4.2、6、12；大战略 3.2 到 3.4 |
| `kam_remake` | KaM Remake | `#native-135` | 选读 | AGPL v3（运行依赖非自由的原版数据） | 搬运工配送出价撮合、AI 平衡表与选址、编队 | 城建 6.4；即时战术编队 |
| `simutrans` | Simutrans | `#native-125` | 选读 | Artistic License 1.0 | 货包带目的地的站点路由、工厂供应链 | 经济 4.2 贸易流；城建 6.2 |
| `mindustry` | Mindustry | `#native-140` | 选读 | GPL v3 | 推送式传送带、电网满足率、波次压力与生产效率耦合 | 城建 6.4；城建 10 魔物袭击 |
| `stone_kingdoms` | Stone Kingdoms | `#native-169` | 选读 | Apache 2.0（素材为 Firefly 所有，非自由） | 人气公式、口粮与粮仓 | 城建 5（幸福）、税与幸福 |

---

## 0. 按问题查源码

| 想解决的问题（本作出处） | 先读 | 再读 |
| --- | --- | --- |
| 聚落内的搬运与供需撮合（[`city_building.md`](../../40_design/systems/city_building.md) 第 6.4 节） | Widelands `src/economy/economy.cc` 的 `Economy::balance` | KaM `src/hands/KM_HandLogistics.pas` 的 `TKMDeliveries.CalculateBid` |
| "常设命令"式委托，玩家只调目标不排产（城建第 8、9 节） | Widelands `Economy::TargetQuantity`、`needs_ware_or_worker`、Lua 生产程序的 `return=skipped unless economy needs` | Simutrans `fabrik_t` 的 JIT2 需求缓冲 |
| 区域之间的贸易流与运力约束（[`economy_and_trade.md`](../../40_design/systems/economy_and_trade.md) 第 4.2 节"贸易流"） | OpenTTD `src/linkgraph/demands.cpp`、`mcf.cpp`、`flowmapper.cpp` | Simutrans `haltestelle_t::search_route` |
| 商路的服务质量与份额竞争（经济第 3.4、3.6 节） | OpenTTD `UpdateStationRating`、`MoveGoodsToStation` | Simutrans 站点拥挤 `recalc_status` |
| 多种族聚落的忠诚、抵抗、叛乱、迁移（大战略第 2.5、2.6 节；城建人口） | 7KAA `src/OTOWN.cpp` 的 `Town::update_target_loyalty`、`camp_influence`、`think_rebel` | Stone Kingdoms 人气公式（反例与对照） |
| 谍报行动的成功判定（[`grand_strategy_slg.md`](../../40_design/systems/grand_strategy_slg.md) 第 6.3 节） | 7KAA `src/OSPY.cpp`、`src/OSPYA.cpp`、`src/OFIRMIF3.cpp` | 无 |
| 外交提议与 AI 应答（大战略第 2.3、3 节） | 7KAA `src/OAI_TALK.cpp` 的 `consider_*`、`src/OAI_DIPL.cpp` 的 `think_diplomacy` | Widelands `DefaultAI::diplomacy_actions` |
| 给大模型统治者的受限动作菜单（大战略第 3.2 到 3.4 节） | OpenTTD `src/script/api/script_object.*`、`src/script/script_instance.cpp` | Widelands 与 7KAA 的规则 AI 作为兜底参照 |
| 将领统率与士兵忠诚（[`warfare_rts.md`](../../40_design/systems/warfare_rts.md) 第 4.4 节） | 7KAA `src/OUNIT.cpp` 的 `Unit::update_loyalty`、`commander_power` | 无 |
| 魔物压力与生产防守的互相牵制（城建第 10 节） | Mindustry `PowerGraph`、`Waves`、`Turret` | 7KAA `src/OF_MONS.cpp` 的攻击曲线 |

---

## 1. Widelands（必读）

### 1.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-173`（原文标记新增；描述为"重制《工人物语》的经济型 RTS，资源链与基建深度极高"，与仓库一致） |
| 仓库 | https://github.com/widelands/widelands |
| 固定提交 | `29753773d9c130e2a6a835ee6a14ad2bf317371d`（2026-10-29） |
| 代码许可 | GPL v2 或更高版本（`COPYING`；`README.md` 写 "GPL v2+"） |
| 素材许可 | `README.md` 说明部分素材采用各类 Creative Commons 许可，以各素材目录内的说明为准（本次未逐目录核对，待核实） |
| 语言与规模 | C++ 引擎加 Lua 数据。全树约 2.5 万个文件；`src/economy/` 约 1.5 万行，`src/ai/` 约 1.5 万行（`defaultai.cc` 单文件约 8400 行），`src/logic/map_objects/tribes/` 的 .cc 约 1.7 万行 |
| 本地镜像 | `D:\hakoniwa_refs\widelands`。已检出：`src/economy/`、`src/ai/`、`src/logic/map_objects/tribes/`、`src/logic/player.*`、`data/tribes/workers/barbarians/`、`data/tribes/buildings/{productionsites,militarysites,trainingsites}/barbarians/`、`data/tribes/initialization/`、`data/tribes/scripting/`；用 `git show` 单读了 `src/logic/map.cc`、`src/logic/editor_game_base.cc`、`src/logic/trade_agreement.h` |
| 分级 | 必读 |

### 1.2 值得看的理由

- **城建 6.3、6.4（劳力与运输）**：[`city_building.md`](../../40_design/systems/city_building.md) 写了"搬运工生产建筑与仓库之间自动搬运，搬运时间计入生产周期""仓库满了生产就停"。Widelands 是开源里最完整的"货物逐件存在、在路网上逐跳移动"的实现，它的请求（Request）与供给（Supply）撮合是聚落内物流内核的直接样本。
- **城建 8、9（自治与委托）**：Widelands 的"经济目标"（economy target，源码 `TargetQuantity`）让生产建筑在"全经济不缺这件货"时自动跳过本轮生产。玩家只调目标数，不逐栋开关建筑，这正是城建第 9 节"常设命令"与授权等级的机制样本。
- **经济 5.1、5.5（统计与审计）**：生产建筑区分"完成、跳过、失败"三种结果并维护生产率百分比，适合作为月报与"四张表"的数据源。
- **大战略领土与即时战术训练**：军事建筑按影响力叠加决定领土归属；训练营消耗面包、鱼肉、烈酒把经济与兵员质量耦合。
- **AI（大战略第 3 节的规则兜底）**：`DefaultAI` 有建造必要性判断、按库存估值的交易评估、按外交分的组队接受规则。
- **国家间贸易**：近期加入的玩家间市场（`Market`）与批次贸易协定（`TradeInstance`），是"条约化、按批次履约"的国家间贸易样本，对应 [`grand_strategy_slg.md`](../../40_design/systems/grand_strategy_slg.md) 第 6.1 节商路。

### 1.3 源码导读

- **经济体与路网**：读 `src/economy/economy.h` 的 `class Economy` 头注释，以及 `economy.cc` 的 `Economy::check_merge`、`Economy::check_split`、`Economy::check_splits`、`Economy::merge`、`Economy::split`。一个经济体就是"一张连通路网上的全部旗子与建筑"；建路时合并，拆路时**惰性**拆分（先记下可能的断点，下次结算再判定）。每个路网同时有"货物经济"和"工人经济"两个对象，因为只靠渡船相连的两块路网对货物是一个经济，对工人不是。
- **结算主循环**：`Economy::balance`，按顺序调用 `check_splits`、`recalc_districts`、`create_requested_workers`、`balance_requestsupply`、`handle_active_supplies`、`check_imports`。由定时命令 `CmdCallEconomyBalance` 触发，`start_request_timer` 默认间隔 200 毫秒。
- **请求**：`src/economy/request.h` 的 `class Request`（谁要、要什么、要几件、回调、已发起的 `Transfer` 列表），`request.cc` 的 `Request::get_priority`、`get_base_required_time`、`get_required_time`、`get_normalized_transfer_priority`、`start_transfer`、`transfer_finish`、`transfer_fail`。
- **供给**：`src/economy/supply.h` 的抽象 `Supply`，实现有 `warehousesupply.h`（仓库库存）、`idleworkersupply.cc`（闲置工人）、`ware_instance.cc`（躺在旗子上或刚产出的货）；`supply_list.cc` 管列表。
- **撮合**：`economy.cc` 的 `Economy::find_best_supply`、`Economy::process_requests`、`Economy::balance_requestsupply`，以及文件内结构 `RequestSupplyPair`、`RSPairStruct`。
- **无主货物入库**：`Economy::handle_active_supplies`；仓库库存策略枚举 `StockPolicy` 在 `src/logic/map_objects/tribes/warehouse.h`（`kNormal`、`kPrefer`、`kDontStock`、`kRemove`）。
- **区（district）**：`Economy::recalc_districts`、`same_district`，以及 `src/economy/flag.h` 的 `district_center_`。
- **跨区调货与替换**：`Economy::check_imports`，常量 `kTryImportThreshold`、`kTryOtherSupplyThreshold`、`kSupplyReplacementMinSaving`、`kSupplyReplacementRatio`。
- **逐跳运输**：`src/economy/transfer.cc` 的 `Transfer::get_next_step`；`src/economy/flag.h` 的 `Flag::PendingWare`、`ware_capacity_`、`kMaxTransferPriority`、`capacity_wait_`；`flag.cc` 的 `Flag::has_capacity`、`fetch_pending_ware`、`call_carrier`。
- **道路晋升（第二搬运者，驮兽）**：`src/economy/road.h` 的 `kRoadAnimalPrice`、`kRoadMaxWallet`；`road.cc` 的 `Road::pay_for_road`、`charge_wallet`、`Flag::propagate_promoted_road`。
- **路程代价**：`src/logic/map.cc` 的 `Map::calc_cost`（按坡度的步行毫秒数）、`calc_cost_estimate`、`calc_cost_lowerbound`；`src/economy/router.cc`、`routeastar.cc`。
- **经济目标**：`economy.h` 的 `Economy::TargetQuantity`（`permanent`、`last_modified`），`economy.cc` 的 `set_target_quantity`、`needs_ware_or_worker`；默认值在 `data/tribes/initialization/barbarians/units.lua` 的 `wares_order` 各项 `default_target_quantity`，同处还有 AI 用的 `preciousness`。
- **生产程序**：Lua 数据 `data/tribes/buildings/productionsites/barbarians/*/init.lua` 的 `inputs`、`working_positions`、`programs`；解释器 `src/logic/map_objects/tribes/production_program.h` 的 `ActReturn`（含条件 `EconomyNeedsWare`、`EconomyNeedsWorker`、`SiteHas`、`WorkersNeedExperience`）、`ActConsume`、`ActProduce`、`ActCallWorker`、`ActSleep`、`ActAnimate`、`ActMine`、`ActTrain`、`ActCheckSoldier`。
- **生产结果与统计**：`src/logic/map_objects/tribes/productionsite.cc` 的 `ProductionSite::program_end`、`program_start` 中对 `failed_skipped_programs_` 的处理、`train_workers`、`notify_player`。
- **工人程序**：`data/tribes/workers/barbarians/*/init.lua` 的 `programs`（例：伐木工 `harvest`），解释器 `src/logic/map_objects/tribes/worker_program.cc`。
- **输入队列**：`src/economy/input_queue.h` 的 `get_max_fill`、`set_max_fill`、`set_consume_interval`（玩家可调低某栋建筑的原料储备上限）；优先级 `src/economy/ware_priority.cc`。
- **军事影响与领土**：`src/logic/player.h` 中 `military_influence` 的注释；`src/logic/editor_game_base.cc` 的 `EditorGameBase::conquer_area`、`unconquer_area`、`do_conquer_area`；`src/logic/map.cc` 的 `Map::calc_influence`；军事建筑数据 `data/tribes/buildings/militarysites/barbarians/*/init.lua` 的 `conquers`、`max_soldiers`、`heal_per_second`、`prefer_heroes`。
- **士兵训练**：`data/tribes/buildings/trainingsites/barbarians/battlearena/init.lua`、`trainingcamp/init.lua` 的升级程序；`src/logic/map_objects/tribes/trainingsite.cc` 的 `TrainingSite::update_soldier_request`、`init_kick_state`、`max_stall_`（来自 Lua 的 `trainer_patience`）。
- **玩家间市场与贸易协定**：`src/logic/trade_agreement.h` 的 `TradeInstance`、`TradeExtension`、`TradeAction`、`kMaxBatches`、`kMaxWaresPerBatch`、`kInfiniteTrade`；`src/logic/map_objects/tribes/market.h` 的 `Market::TradeOrder`，`market.cc` 的 `Market::is_ready_to_launch_batch`、`launch_batch`、`traded_ware_arrived`。
- **AI**：`src/ai/defaultai.cc` 的 `DefaultAI::think`（任务池调度）、`construct_building`、`check_building_necessity`、`check_productionsites`、`review_wares_targets`、`calculate_stocklevel`、`trading_actions`、`evaluate_trade`、`trade_preciousness`、`diplomacy_actions`；`src/ai/ai_help_structs.h` 的 `BuildingObserver`、`EconomyObserver`、`Neuron`、`FNeuron`、`ManagementData`、`PlayersStrengths`；建筑 Lua 中的 `aihints`（`prohibited_till`、`forced_after` 等）。

### 1.4 机制拆解

#### 1.4.1 请求与供给的撮合（`Economy::balance_requestsupply`）

数据对象：

| 对象 | 关键字段 | 说明 |
| --- | --- | --- |
| `Request` | 目标建筑或道路、货种、件数 `count_`、需要时间 `required_time_` 与间隔 `required_interval_`、已发起的 `transfers_` | 由需求方创建和销毁；`get_open_count = count_ - transfers_.size()` |
| `Supply` | 位置、`nr_supplies`、`is_active`、`has_storage` | 仓库库存是"非活跃供给"，刚产出或躺在旗上的货是"活跃供给" |
| `Transfer` | 请求、货物或工人、目的地、当前路线 | `get_next_step` 每走一步重新问下一跳 |

每次结算的步骤：

```
process_requests:
  for 每个未满足的 Request req:
    supp, cost = find_best_supply(req)          // cost 为估计的送达毫秒数
    if supp 为空: continue
    if supp 不是活跃供给(仓库存货):
      idletime = now + 15000 + 2*cost - req.required_time
      if idletime < -200:                        // 现在调货会早到，建筑不会因此闲置
        记下最早需要重排的时间; continue         // 仓库货"准时化"发出
    priority = req.get_priority(cost)
    队列.push( {req, supp, priority, pairid = ++自增} )

balance_requestsupply:
  first_is_zero = 队首 priority == 0
  while 队列非空:
    取 priority 最大者(相等时 pairid 决胜)
    若请求已失效、供给已空、或(队首不是 0 而本项 priority == 0): 跳过并约 200ms 后再结算
    req.start_transfer(supp)                     // 预约：生成 Transfer，后续不会被重复分配
  需要时重启计时器
```

- `RequestSupplyPair::Compare` 用自增 `pairid` 作显式平局规则；源码注释说明，没有它优先队列会用依赖平台的隐式顺序，导致联机不同步。这是"确定性撮合"的核心细节。
- `Request::get_priority(cost)`：
  - 目标建筑把该货的用户优先级设为最高（`WarePriority::kVeryHigh`）时，返回 `uint32` 最大值，永远先服务。
  - 设为最低（`kVeryLow`）时返回 0，只在"没有别的事可做"时服务。
  - 其余情况：`priority.to_weighting_factor() * 等待时长 * max(1, 30000 - cost)`。等待时长：工地用"距需要时间已过多久"（`get_required_time`），生产建筑用"距上次为它发起调货已过多久"（`get_last_request_time`，在 `balance_requestsupply` 发起调货时更新）。权重因子取自 `ware_priority.cc`：`kLow` 1、`kNormal` 64、`kHigh` 4096。
  - 源码注释写"代价高的请求优先，以缩短平均等待"，但按公式是代价越小优先级越高，注释与公式方向不一致（意图待核实）。
- 工地的多件需求按 `get_base_required_time` 摊开：第 n 件的需要时间是 `required_time_ + required_interval_ * n`；若已严重超期，则改为从当前时间重新摊开。这让大工地不会一次性把全部建材抢光。

#### 1.4.2 找最佳供给（`Economy::find_best_supply`）

```
先过一遍全部供给:
  跳过不提供该货的、在船上的(路程无法估计)、与已见过同一旗子的
  若供给在请求方所在的区(district): 记入本地候选，并维护直线距离最小值 dist_min
  否则: 记入"进口"候选(跨区)
若 本地没有候选 或 dist_min >= kTryImportThreshold(8 个格点):
  把"直线距离/2 < dist_min"的进口候选也加入
在候选旗子集合上做多源最短路(router.find_nearest)到请求方旗子
返回路线最短的那个供给，cost = 路线总代价
```

- 路程代价是按坡度的步行毫秒数（`Map::calc_cost`，注释给出公式：`BASE_COST_PER_FIELD * f`，`f = 1 + d(slope) - d(0)`，`d` 为坡度的二次式，用整数运算避免浮点）。
- 先用直线距离筛、再在候选集合上一次多源寻路，是"少量精确寻路"的性能套路。

#### 1.4.3 区（district）与跨区调货

- `recalc_districts`：以每个仓库所在旗子为源，跑一次多源 A*（零启发，即多源 Dijkstra），把每面旗子归到最近的仓库，`nr_districts_ = 仓库数`。
- `check_imports`：对已在途、剩余步数大于 `kTryOtherSupplyThreshold`（12）的调货，在"剩余距离的一半"范围内重找供给；只有节省量同时满足 `>= kSupplyReplacementMinSaving`（`12 * 1800 / 2`）且 `>= 旧代价 / 4`（`kSupplyReplacementRatio`）才取消旧调货改用新供给；每个请求每轮最多换一次。
- 这是"中途改投更优来源，但设最小节省门槛防抖动"的样本。

#### 1.4.4 无主货物入库（`handle_active_supplies`）

刚产出、没有请求认领的货（活跃供给）每轮找仓库：若有仓库对该货设为 `kPrefer`，送去其中库存最少的那个；否则送最近的 `kNormal` 仓库。先算出全部分配，第二阶段才执行（源码注释说明是为了防止执行中供给列表被修改）。`kDontStock` 不再收，`kRemove` 还会把现有库存逐步运走。

#### 1.4.5 逐跳运输与旗子容量

- `Transfer::get_next_step`：货物或工人每到一个节点就"暴力重算"一次到目的地的最短路，只返回下一跳。路网被切断时调用 `Economy::check_split` 并报失败，由请求方重新请求。
- 旗子是路网节点，`Flag::ware_capacity_` 默认 8 件；满了以后后来的搬运工进 `capacity_wait_` 先进先出队列等待。
- 旗上每件货带 `PendingWare::priority`，由目的地优先级归一化而来（`Request::get_normalized_transfer_priority`：低 2、普通 7、高 12、最高 16），搬运工先拿优先级高的；达到 `kMaxTransferPriority`（16）后退化为纯先进先出。`fetch_pending_ware` 偏好已确认（acked）的货。
- 每段道路一名搬运工；**繁忙道路**自动请求第二搬运者（驮兽），见下一节。

#### 1.4.6 道路晋升钱包（`Road::pay_for_road`、`charge_wallet`）

```
每搬运一件货: wallet += 2 * (搬运者数 + 1) * (4 * 旗上排队长度 + 路段步数)
每秒维护:     wallet -= 搬运者数         (下限 0)
若 未繁忙 且 wallet > 1.5 * kRoadAnimalPrice(600):
    wallet -= 600; 标记繁忙; 请求驮兽; 向相邻道路传播晋升倾向
wallet 上限 kRoadMaxWallet = 2.5 * 600
若 繁忙 且 wallet 降到 0: 降级，遣散驮兽
```

- 拥堵是一个累积量，带滞后的升降级；晋升也会向相邻道路"传染"（`Flag::propagate_promoted_road`），使整条干道一起升级。

#### 1.4.7 经济目标：委托的机制样本

- 每个经济体每种货一个 `TargetQuantity{permanent, last_modified}`；两个经济体合并时取最近修改的那个设定。
- `needs_ware_or_worker(货种, flag)`：

```
若 目标 > 0 且 有仓库:
   区目标 = ceil(全局目标 / 区数)                // 向上取整，小目标也能各区都有
   逐仓库累加库存(士兵要扣掉仓库期望驻军)
   若 本区库存 >= 区目标 且 全局库存 >= 全局目标: 不需要
   若 只是本区缺、全局不缺:
       本区没有可存放的仓库(无 normal/prefer 策略): 不需要
       别的区有 prefer 而本区没有: 不需要(会被吸走)
   否则: 需要
若 目标 == 0: 仅当存在该货的未满足请求时才需要
```

- 生产程序第一行通常是条件返回，例如酿酒坊：`"return=skipped unless economy needs beer or workers need experience"`；酒馆：`"return=skipped unless economy needs ration"`。经济不缺就跳过本轮，"工人需要经验"可以压过这个条件，保证学徒能成长。
- 跳过与失败的处理（`ProductionSite::program_end`）：二者都记入 `failed_skipped_programs_[程序名] = 当前时间`，并按"未成功"计入生产率统计；下次启动同一程序至少推迟 10 秒（`program_start` 中 `Duration(10000)`）。完成则清除记录并让在岗工人获得经验（`train_workers`）。
- 默认目标在部族数据里，例如 barbarians 的 granite 20、blackwood 40、grout 10（`units.lua` 的 `default_target_quantity`）。没有设默认目标的货（如原木）在生产程序里通常也不写需求检查，伐木场就一直生产（是否一律如此待核实）。
- AI 也通过调目标来管经济（`DefaultAI::review_wares_targets`）：`multiplier = max((生产建筑数 + 港口数*5) / 5, 10)`，`新目标 = max(multiplier * 默认目标 / 10, 3)`，以普通玩家命令 `CmdSetWareTargetQuantity` 下发。

#### 1.4.8 生产程序（Lua 数据即代码）

- 建筑数据给出 `inputs`（每种原料的储备上限）、`working_positions`（岗位与工种）、`programs`（命名程序，每个是动作字符串序列）。常用动作：`consume=water wheat`、`produce=beer`、`sleep=duration:30s400ms`、`animate=working duration:30s`、`callworker=harvest`（让工人执行工人程序）、`mine`、`train`、`checksoldier`、`return=...`。
- 工人程序（例：伐木工 `harvest`）：`findobject=attrib:tree radius:10`、`walk=object`、`animate=hack duration:15s`、`callobject=fall`、`createware=log`、`return`。数据作者在注释里手算了平均循环时间（伐木场平均约 64 秒一根原木），用于平衡。
- 资源枯竭通知：`out_of_resource_notification` 带 `productivity_threshold`（伐木场 60），生产率低于阈值且趋势下降时提醒玩家（`ProductionSite::notify_player`）。

#### 1.4.9 军事影响与领土

- 军事建筑在第一名士兵进驻时开始施加影响，最后一名离开时撤销；影响值不存档，读档时按进驻情况重算（`player.h` 注释）。
- 单点影响（`Map::calc_influence`）：`d = max(|dx|, |dy|)`（考虑地图环绕）；`d > 半径` 为 0，`d == 0` 为 `MAX_RADIUS`，否则 `MAX_RADIUS - d`，最后取平方。`MAX_RADIUS` 的具体值本次未找到定义处（待核实）。
- `do_conquer_area`：征服时把影响值加到本玩家的格点上；无主格直接归属，有主格只有在允许"以更大影响夺取"且新影响大于原主时才易主；撤销时减去影响值，若原主在该格影响归零，则在其余玩家中取影响最大者，平局可设为中立。
- 军事建筑参数示例（barbarians）：岗哨 `conquers = 6`、`max_soldiers = 2`；屏障与塔 9；要塞 11；城堡 12、`max_soldiers = 12`。

#### 1.4.10 士兵训练

- 训练是普通生产程序：例如竞技场的 `upgrade_soldier_evade_0` 依次 `checksoldier`（有无该等级士兵）、`return=failed unless site has barbarians_bread`、`fish,meat`、`beer_strong`、`sleep`、`animate`、再次 `checksoldier`（玩家可能中途把人调走）、`consume`、`train=soldier:evade level:1`。
- `soldier_capacity = 8`、`trainer_patience = 6`。`TrainingSite::update_soldier_request` 有"卡住检测与踢人"逻辑：若某属性长期无法升级（缺物资或缺对应等级士兵），会踢出士兵并切换为"请求弱兵"模式，避免训练营被练不动的士兵占满。

#### 1.4.11 玩家间市场与批次贸易协定

- `TradeInstance`：状态（提议、执行中）、发送方与接收方玩家、双方市场、`items_to_send`、`items_to_receive`、`num_batches`；上限 `kMaxBatches = 100`、`kMaxWaresPerBatch = 100`，`kInfiniteTrade = -1` 表示无限批次。动作 `TradeAction`：取消、接受、拒绝、撤回、暂停、恢复、迁移市场、延长。
- 执行：`Market::TradeOrder` 为每种货开一个输入队列，外加一个搬运者队列；当搬运者人数等于每批件数、全部在场且空闲、各货队列都满足一批时才发车（`is_ready_to_launch_batch`），每名搬运者带一件货走到对方市场；货物在出发时就移出本方经济（`ware->set_economy(nullptr)`），避免被当作无主货物调走。
- 这是"以物易物、按批次履约、可暂停可延长"的条约化贸易，没有货币价格。

#### 1.4.12 AI：建造、交易与外交

- 调度：`DefaultAI::think` 每 500 毫秒一次，从按到期时间排序的任务池取到期任务；延迟大时一次多跑几个（`sqrt(delay/400)`，上限 `kMaxJobs`）。
- 建造必要性 `check_building_necessity` 返回 `BuildingNecessity`（强制、需要、禁止等）：
  - 前 2 到 120 分钟有"基础经济"阶段，列表内的基础建筑被鼓励。
  - 建筑 Lua 的 `aihints`：`prohibited_till` 之前禁止，`forced_after` 之后若一座都没有则强制。
  - 产出货物的库存低于阈值时加分、高于阈值时减分；阈值与权重来自"神经元池"（`Neuron`、`FNeuron`），这些参数由 `ManagementData::mutate` 与 `review` 做遗传式调参，持久化在 `data/ai/` 下（`ai_help_structs.h`）。
- 交易评估 `evaluate_trade`：只接受有限批次；把"对方给我的"与"我付出的"分别按 `数量 * trade_preciousness` 求和，前者更大才接受。`trade_preciousness`：从静态 `preciousness` 起算，库存低于经济目标时，收货方加 `缺口/2`（批量不超过缺口时）、付货方加 `缺口`；库存高于目标时按盈余减；要付出的数量不少于全部库存时再加 `数量*2`，即"不把家底换光"。源码 TODO 承认静态 preciousness "常常误导，不反映生产成本"。延长协定只在剩余批次不超过一半时才考虑。
- 外交 `diplomacy_actions`：用每个对手的"外交分"（diploscore，来自实力与领土对比的统计，`PlayersStrengths`）和本队平均分决定退队、接受邀请或入队请求；外交分足够高（`>= max(本队分, 25)`）才接受，中间区间只有一半概率；每次调用最多执行一个改变阵营的动作。

### 1.5 对《箱庭纪》的借鉴（分析）

**我们现在怎么做、差在哪**

- `hakoniwa/src/systems/city/production.ts` 的 `runProduction`：按 `LABOR_SHARE` 把劳力按建筑列表顺序填岗（`foodFirst` 政策时食物优先），原料直接从 `stockOf(owner)` 的聚落总库存扣，产出直接入库；仓库满时原料照扣，放不下的产出直接丢弃（只保留小数进位），同时给相关建筑写备注"仓库已满，停产"、给聚落写状态行，并不会停产。**没有在途量、没有搬运时间、没有逐栋的输入储备与优先级、没有"经济不缺就不产"的判断**。设计文档城建 6.4 要求"搬运时间计入生产周期"，目前没落地。
- 委托：城建第 9 节的常设命令（"粮仓低于 15 天自动减酒"）目前只有两类近似物：政策卡（`setPolicy` 写入 `site.policies`，经 `policyFlag`、`policyFactor`、`policyEffectSum` 读取），以及官员 `utilityAction` 里写死的阈值规则（`SURPLUS_KEEP` 按货给出写死的留存量）；没有可调的"每种货一个目标数"的通用委托对象。

**可直接借的方法**

1. **日结算版请求与供给撮合**：每栋生产建筑为每种原料维护"输入储备上限"（对应 `inputs.amount` 与可调 `max_fill`）与优先级；每个游戏日撮合一次，供给来源分"仓库存货"与"刚产出的活跃货"，在途量按聚落拓扑距离折算成延迟天数（或延迟到下一个结算日）。不逐件模拟搬运工，只保留 Widelands 的数据结构与优先级公式。
2. **经济目标作为一等委托对象**：每个聚落、每种货一个 `target`；生产建筑的第一步是"若不缺且无学徒需要经验则跳过"；跳过不算失败但计入生产率，并有冷却。官员与 AI 统治者只改目标与优先级（大战略 3.3 的 P2 受控写入），不直接排产。这把"微操与授权的取舍"（城建 8.3）变成可度量的东西：玩家改了多少目标、改得多频繁。
3. **区的平分规则**：多聚落（村、镇、城）时按最近仓库分区，全国目标按区数向上取整平分，"本地缺"与"全国缺"分别判断。
4. **确定性撮合的工程细节**：优先队列必须有显式平局键（自增序号或稳定 id）；先算全部分配再执行；与注册修正项合同第 7.3 节"稳定排序后应用"同一原则。
5. **拥堵钱包**：用累积的拥堵量（带滞后）自动升级运力。可用于商路与驿道：商路繁忙度累计过阈值时提示或自动升级车马行，空闲到耗尽时降级，避免数值抖动。
6. **影响力平方衰减叠加定领土**：适合郡内的控制权与边境摩擦；平局中立的规则可直接用。
7. **训练吃高级物资**：兵员质量绑定食物与酒类生产，正好把城建生产链与即时战术兵团质量接起来。

**要改造的点**

- Widelands 是毫秒级实时、货物逐件、每一跳重算路线；我们的城建是日结算加少量具名实体，物流只取抽象层，路线应改用设计中的聚落拓扑分钟数（`src/` 目前还没有任何拓扑距离）。
- 批次贸易协定是纯以物易物；我们有货币与价格分解（经济 4.3），国家间协定应写成"商品、批次、价格或汇率、违约条款"的条约对象（对应经济 6.4 债务与凡约）。

**不要学的坑**

- `Request::get_priority` 注释与公式方向不一致，说明这类权重靠经验调；我们把每个权重写成可测试的配置项并附单元测试。
- AI 的遗传式神经元调参不可解释，统治者决策需要能回溯原因（大战略 3.2 的理由进调试视图），不宜采用。
- `trade_preciousness` 另立一套静态价值表，源码自己承认误导；我们的估值应当来自同一份价格分解，不能让 AI 用第二套价格。

### 1.6 许可与复用边界

GPL v2+：只借方法与数据结构思路，不拷贝代码与 Lua 数据。单行常量（例如 `kTryImportThreshold = 8`、优先级权重 1/64/4096）作为事实引用。素材分目录 CC 许可，本作不使用其素材。

---

## 2. Seven Kingdoms: Ancient Adversaries（必读）

### 2.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-158`（"2009 年开源解禁的经典即时战略游戏"，与仓库 `README` 一致：Enlight Software 于 2009 年授权以自由许可发布） |
| 仓库 | https://github.com/the3dfxdude/7kaa （`README` 开头写 "PLEASE UPDATE YOUR LINKS"，主站已迁到 `https://sourceforge.net/projects/skfans`；本次未克隆 SourceForge 版本） |
| 固定提交 | `14e6fdfba9481af4dc3a54722614a608776e20bc`（2023-09-22，`README` 记载的最新发布为 2.15.6） |
| 代码许可 | GPL v2：`COPYING` 写明源代码**和游戏数据**都按 GPL v2 发布；"Seven Kingdoms" 是 Enlight 的商标，许可不转让商标 |
| 素材许可 | 游戏数据同为 GPL v2；音乐另以 `7kaa-music-2.15` 包分发（`README` 打包说明），其许可本次未核实 |
| 语言与规模 | C++（大量 C 风格），`src/` 下约 285 个 .cpp，约 20 万行；类名前缀 `O`（Object），AI 文件前缀 `OAI_` |
| 本地镜像 | `D:\hakoniwa_refs\seven_kingdoms`，已检出 `src/`、`include/` |
| 分级 | 必读 |

### 2.2 值得看的理由

- 7KAA 的核心玩法就是《箱庭纪》几个高风险系统的组合：**多种族城镇的忠诚与独立城镇的抵抗、税与赏赐、叛乱、迁移**（大战略 2.5、2.6，城建人口），**市场、商队与通商条约**（经济 3.4、大战略 6.1），**间谍的潜伏、煽动、破坏、贿赂、刺杀、窃取机密与反谍**（大战略 6.3、6.4），**国家间谈判消息与 AI 应答**（大战略 2.3、3），**将领统率决定士兵忠诚**（即时战术 4.4），**怪物巢穴压力**（城建 10.2 魔物袭击），**各族之神由祭司积累的祈祷点召唤**（女神神力预算的凡间同构）。
- 全部是确定性规则加同步随机数（`misc.random`，联机靠种子一致），没有脚本层，公式都在 C++ 里，读一遍就能得到完整数值模板。

### 2.3 源码导读

- **城镇主循环与错峰**：`src/OTOWN.cpp` 的 `Town::next_day`。几乎所有周期逻辑都写成 `info.game_date % N == town_recno % N`，把城镇的计算按编号错开到不同日子。
- **多种族人口**：`include/OTOWN.h` 的 `race_pop_array`、`jobless_race_pop_array`、`race_loyalty_array`、`race_target_loyalty_array`、`race_resistance_array[MAX_RACE][MAX_NATION]`、`race_spy_count_array`；`Town::race_harmony`。
- **忠诚**：`Town::update_target_loyalty`、`Town::update_loyalty`、`Town::change_loyalty`、`Town::update_quality_of_life`。
- **独立城镇抵抗**：`Town::update_target_resistance`、`Town::camp_influence`、`Town::update_resistance`、`Town::grant_to_non_own_town`。
- **税与赏赐**：`Town::collect_yearly_tax`、`Town::collect_tax`、`Town::reward`，常量在 `include/OTOWN.h`（`TAX_PER_PERSON`、`COLLECT_TAX_LOYALTY_DECREASE`、`TOWN_REWARD_PER_PERSON`、`TOWN_REWARD_LOYALTY_INCREASE`、`IND_TOWN_GRANT_PER_PERSON`、`IND_TOWN_GRANT_RESISTANCE_DECREASE`）。
- **叛乱、投降、迁移**：`Town::think_rebel`、`create_rebel_unit`、`think_surrender`、`surrender`、`think_migrate`、`think_migrate_one`、`migrate`；叛军对象 `src/OREBEL.cpp`。
- **城镇对市场的需求**：`Town::distribute_demand`；常量 `include/OF_MARK.h` 的 `PEASANT_GOODS_MONTH_DEMAND`、`WORKER_GOODS_MONTH_DEMAND`、`MAX_MARKET_GOODS`、`MAX_MARKET_STOCK`。
- **市场**：`src/OF_MARK.cpp` 的 `FirmMarket::next_day`、`input_goods`、`sell_goods`、`set_next_output_firm`、`update_trade_link`；结构 `MarketGoods`（`stock_qty`、`month_demand`、月度供给与销量、`supply_30days`、`sale_qty_30days`）；AI 部分 `src/OF_MARK2.cpp` 的 `think_import_new_product`、`think_export_product`、`think_demand_trade_treaty`、`ai_create_new_trade`。价格常量 `include/GAMEDEF.h` 的 `RAW_PRICE`、`PRODUCT_PRICE`、`CONSUMER_PRICE`、`PROCESS_GOODS_INTERVAL`。
- **跨国交易记账**：`src/ONATIONB.cpp` 的 `NationBase::import_goods`。
- **商队**：`include/OU_CARA.h` 的 `MAX_STOP_FOR_CARAVAN`、`MAX_CARAVAN_CARRY_QTY`、`POPULATION_PER_CARAVAN`、`MIN_FIRM_STOCK_QTY`、取货类型枚举（`AUTO_PICK_UP`、`NO_PICK_UP`）；`src/OU_CARA.cpp` 的 `UnitCaravan::can_set_stop`、`get_next_stop_id`、`caravan_in_firm`；`src/OU_CARAT.cpp` 的 `market_unload_goods`、`market_auto_load_goods`、`market_load_goods_now`、`mine_load_goods`、`factory_load_goods`；AI `src/OU_CARA2.cpp` 的 `think_resign`、`think_del_stop`、`think_set_pick_up_type`。
- **谍报**：`include/OSPY.h` 的 `class Spy`（`spy_place`、`spy_skill`、`spy_loyalty`、`true_nation_recno`、`cloaked_nation_recno`、`exposed_flag`、`action_mode`）与常量 `MAX_BRIBE_AMOUNT`、`SPY_ENEMY_RANGE`、`MIN_VIEW_SECRET_SPYING_SKILL`；`src/OSPY.cpp` 的 `Spy::next_day`、`process_town_action`、`process_firm_action`、`pay_expense`、`update_loyalty`、`think_betray`、`drop_spy_identity`、`capture_firm`、`assassinate`、`get_assassinate_rating`、`get_killed`；`src/OSPYA.cpp` 的 `SpyArray::process_sabotage`、`catch_spy`、`total_spy_skill_level`、`needed_view_secret_skill` 与静态表 `secret_view_mode_array`、`secret_view_skill_array`；贿赂 `src/OFIRMIF3.cpp` 的 `Firm::spy_bribe`、`spy_bribe_succeed_chance`；AI 谍报 `src/OSPY2.cpp` 的 `think_bribe`、`think_assassinate`，`src/OAI_SPY.cpp` 的 `think_assign_spy_target_town`、`think_assign_spy_target_camp`，`src/OTOWNAI.cpp` 的 `needed_anti_spy_level`、`think_spying_town`。
- **外交消息**：`include/OTALKRES.h` 的 `struct TalkMsg`、回复类型枚举（`REPLY_NOT_NEEDED`、`REPLY_WAITING`、`REPLY_ACCEPT`、`REPLY_REJECT`）、`MAX_WAIT_MSG_PER_NATION`、`TALK_MSG_KEEP_DAYS`；`src/OTALKRES.cpp`、`src/OTALKMSG.cpp`、`src/OTALKRE2.cpp`（消息生效与声望变化）。
- **AI 应答与主动外交**：`src/OAI_TALK.cpp` 的 `Nation::ai_process_talk_msg`、`consider_talk_msg`、`notify_talk_msg`、`consider_trade_treaty`、`ai_trade_with_rating`、`consider_friendly_treaty`、`consider_alliance_treaty`、`consider_cease_war`、`consider_alliance_rating`、`consider_sell_food`、`consider_take_tribute`、`consider_give_tribute`、`consider_trade_embargo`、`consider_military_aid`；`src/OAI_DIPL.cpp` 的 `think_diplomacy`、`should_diplomacy_retry`、`think_trade_treaty`、`think_declare_war`、`think_end_treaty`。
- **国家 AI 骨架**：`include/ONATION.h` 的人格参数 `pref_*` 与 `struct ActionNode`；`src/OAI_MAIN.cpp` 的 `Nation::init_personalty`、`process_ai`、`process_ai_main`、`process_on_going_action`；动作队列 `src/OAI_ACT.cpp`、`src/OAI_ACT2.cpp`；`src/OAI_GRAN.cpp` 的 `think_grand_plan`、`think_surrender`、`think_unite_against_big_enemy`、`ai_surrender_to_rating`；其余 `OAI_BUIL`（建造）、`OAI_CAPT`（夺城）、`OAI_ATTK`（进攻）、`OAI_ECO`（开支）、`OAI_TOWN`、`OAI_MARI`（海军）。
- **将领与士兵忠诚**：`src/OUNIT.cpp` 的 `Unit::update_loyalty`、`Unit::commander_power`、`Unit::think_betray`、`Unit::pay_expense`；工人忠诚 `src/OFIRM.cpp` 的 `Worker::target_loyalty`、`Worker::change_loyalty`。
- **声望**：`src/ONATIONB.cpp` 的 `NationBase::change_reputation`、`civilian_killed`、`end_treaty`、`next_month`。
- **怪物巢穴**：`include/OF_MONS.h` 的常量；`src/OF_MONS.cpp` 的 `FirmMonster::next_day`、`recruit_soldier`、`recruit_general`、`think_attack_human`、`think_expansion`、`being_attacked`，文件内静态函数 `fryhtan_attacks_per_six_months`、`fryhtan_random_attack`；怪王掉卷轴 `src/OU_MONS.cpp` 的 `UnitMonster::king_leave_scroll`。
- **神（Seat of Power）**：`src/OF_BASE.cpp` 的 `FirmBase::next_day`、`invoke_god`、`can_invoke`，常量 `include/OF_BASE.h` 的 `MAX_PRAY_POINTS`；神兽 `src/OU_GOD.cpp`、`src/OU_GOD2.cpp`；可建条件 `src/OGODRES.cpp` 的 `GodInfo::enable_know`（拾取卷轴时由 `src/OSITE.cpp` 调用）。

### 2.4 机制拆解

#### 2.4.1 错峰调度

`Town::next_day` 中各逻辑的频率：

| 逻辑 | 条件 |
| --- | --- |
| 生活质量 | 每日 |
| 人口增长 `population_grow` | `game_date % 30 == recno % 30` |
| 目标忠诚或目标抵抗 | `% 15` |
| 忠诚或抵抗向目标移动 | `% 5` |
| 迁移、叛乱、投降判定 | `% 15`（投降另在平均忠诚为 0 时立即判定） |
| 抓间谍 `catch_spy` | `% 30` |

间谍行动按 `spy_recno % 30`，技能成长 `% 40`（休眠时 `% 80`），间谍忠诚 `% 60`；市场进货 `% PROCESS_GOODS_INTERVAL`（3）；国家 AI 主循环按 `(game_date - nation_recno*4) % 周期` 轮转。这种写法把成百上千个对象的计算均匀摊到每天，并且完全确定。

#### 2.4.2 多种族城镇的忠诚（`Town::update_target_loyalty`）

每个种族单独有忠诚与目标忠诚。目标值的组成：

```
和睦 harmony(r) = 100 * 本族人口 / 城镇人口

target(r) = harmony(r) / 3                         // 0 到 33
          + 国家声望 / 4                           // -25 到 +25
          + 30 - 30 * 本族失业人口 / 本族人口      // 就业 0 到 +30
          + (本族与国王同族 ? 10 : 0)
          夹到 0..100

对每个连通的、有指挥官的兵营(camp)：
  base = 指挥官统率技能 / 3                        // 0 到 33
       + (指挥官是国王 ? 20 : 0)
  对每个种族 r：
    this = base + (指挥官与 r 同族 ? 8 : 0) + (兵营所属国国王与 r 同族 ? 8 : 0)
    兵营属于本国：target(r) = min(100, target(r) + this)
    兵营属于敌国：只对与指挥官同族的 r，target(r) = max(0, target(r) - this)

生活质量(开关 config_adv.town_loyalty_qol)：
  qol = (quality_of_life - 50) / 3                 // -17 到 +17
  仅当 target(r) > 30 时：target(r) = clamp(target(r) + qol, 30, 100)
```

- 生活质量只作用于 30 以上的部分：缺货不会单独把人逼到叛乱线以下。
- 城镇连着本国兵营时，自动断开所有敌国兵营的连接；没有本国兵营时敌国兵营才生效。

实际忠诚的移动（`Town::update_loyalty`，每 5 天）：

```
当前 < 目标：若只连着敌营而没有本营，不增长；否则 增量 = max((目标 - 当前) / 30, 0.5)
当前 > 目标：减量 = max((当前 - 目标) / 30, 0.5)
```

生活质量（`Town::update_quality_of_life`，每日）：

```
城镇月需求 townDemand = 失业人口 * 0.5 + 工人人口 * 1          // PEASANT_ 与 WORKER_GOODS_MONTH_DEMAND
对每个连通市场的每种货：
  月销量 >= 该货月需求       -> 购入 += townDemand
  该货月需求 > townDemand    -> 购入 += 月销量 * townDemand / 该货月需求
  否则                       -> 购入 += 月销量
quality_of_life = 100 * 购入 / (townDemand * MAX_PRODUCT)        // MAX_PRODUCT = 3
```

商品"种类齐、供应稳"直接变成忠诚加成，这是 7KAA 经济与政治的接口。

#### 2.4.3 税与赏赐

| 动作 | 规则 |
| --- | --- |
| 年税 `collect_yearly_tax` | `人口 * TAX_PER_PERSON(5)`，不降忠诚 |
| 临时征税 `collect_tax` | 需连着本国兵营；`降幅 = 10 + 累积惩罚/5`，上限 20；累积惩罚每次 +10；**收入按实际掉下的忠诚折算**：`Σ (原忠诚 - 新忠诚) * 本族人口 * 5 / 降幅`；征完立即判定叛乱 |
| 赏赐 `reward` | `升幅 = 10 - 累积惩罚/5`，下限 3；累积惩罚每次 +10；花费 `人口 * TOWN_REWARD_PER_PERSON(10)` |
| 资助独立城镇 `grant_to_non_own_town` | 每人 `IND_TOWN_GRANT_PER_PERSON(30)`，抵抗 -10 |
| 自动阈值 | `auto_collect_tax_loyalty`（忠诚达到即自动征税）、`auto_grant_loyalty`（低于即自动赏赐） |

"累积惩罚"让连续征税或连续赏赐的边际效果递减（累积量随时间回落的速率本次未追到，待核实）。

#### 2.4.4 独立城镇的抵抗与归附

```
camp_influence(指挥官) = 统率技能 * 2 / 3
                       + (国王与指挥官同族 ? 上项的 1/3 : 0)
                       + 国家声望 / 2
                       夹到 100
目标抵抗[r][该国] = 100 - camp_influence           // 多个同国兵营取影响最大者
                     只对与指挥官同族的种族 r 生效；被叛军控制的城镇不降
实际抵抗：只降不升，每 5 天降 max(1, (当前 - 目标) / 30)，不越过目标
任一国家对全部种族的抵抗都 < 1：城镇向该国投降(surrender)
```

间谍的"煽动"也能降抵抗（见 2.4.9），资助每次 -10。和平归附的轨道很清晰：驻军将领的统率、种族亲缘、国家声望、资助、谍报。

#### 2.4.5 叛乱（`Town::think_rebel`，每 15 天以及每次征税后）

1. 距上次叛乱不足 3 个月（`REBEL_INTERVAL_MONTH`）、有守军、或 10 天内被攻击过：不叛乱。
2. 忠诚 `<= REBEL_LOYALTY(29)` 的种族人口计为"不满"；间谍、住在本镇的工厂间谍、正在训练的单位不参与叛乱。
3. 不满人口 `< 2/3 * 城镇人口` 不叛乱（人口为 1 时特判）。
4. 人数最多的不满种族出叛军首领；每个不满种族有 `(人口 - 受限数) * (30 + random(30)) / 100`（30% 到 60%）的人加入叛军。
5. 不满者离开后，该种族剩余人口的忠诚上调 `50 * 离开数 / 原人口`，即"压力释放"。
6. 发新闻，并通知城里的 AI 间谍（`ai_spy_town_rebel`）。

相关阈值：投降 `SURRENDER_LOYALTY = 29`，征兵 `MIN_RECRUIT_LOYALTY = 30`，本国城镇自发守城 `MIN_NATION_DEFEND_LOYALTY = 50`。

#### 2.4.6 迁移（`Town::think_migrate_one`）

```
前提：本族有可招募的非间谍失业者；目标城未满 MAX_TOWN_POPULATION(60)；
      目标城本族人口 >= 本城本族人口的一半；目标城本族忠诚 >= 40
本城吸引力 = harmony(r) + (本城属国 ? 声望 + (本族忠诚 - 40) : 对目标国的抵抗)
目标吸引力 = 目标城 harmony(r) + (目标城属国 ? 目标国声望 : 0)
若 目标吸引力 >= 30 且 目标吸引力 - 本城吸引力 > 15：迁移，新忠诚 = max(目标吸引力/2, 40)
```

长距离迁移（宏 `ENABLE_LONG_DISTANCE_MIGRATION`）另有距离惩罚与 50% 途中失散。

#### 2.4.7 市场：城镇需求如何分到多个市场（`Town::distribute_demand`）

```
对每种产品 p：
  汇总所有连通且启用的市场：总供给 S = Σ 库存，本国市场供给 S_own
  townDemand = 失业 * 0.5 + 工人 * 1
  对每个市场 m：
    若 S <= townDemand：m.月需求 += m.库存 + (townDemand - S) / 市场数     // 缺口平摊
    否则：
      own = min(townDemand, S_own)
      m 属本国：m.月需求 += own * m.库存 / S_own                           // 先买本国的
      m 属外国：m.月需求 += (townDemand - own) * m.库存 / S
```

- 市场每日卖货 `saleQty = min(月需求/30, 库存)`，收入 `saleQty * CONSUMER_PRICE(4)`（`FirmMarket::sell_goods`）。
- 市场每 3 天从连通的矿场、工厂进货，单次最多 50（`input_goods(50)`），库存上限 `max_stock_qty`；矿场与工厂用 `next_output_firm_recno` 轮流把货发给各下游。外国矿场或工厂供货时调用 `import_goods`，按 `RAW_PRICE(1)` 或 `PRODUCT_PRICE(2)` 记账。
- `NationBase::import_goods`：进口国记支出 `EXPENSE_IMPORTS`，出口国记收入 `INCOME_EXPORTS`，并累计双边年度进出口（`NationRelation::cur_year_import`），后者又进入 AI 的贸易评分。钱从一国转到另一国，不凭空产生或消失。
- 市场只有 3 个货位（`MAX_MARKET_GOODS`），全游戏只有 3 种原料、3 种产品，价格是常量 1、2、4，没有供需价格曲线。

#### 2.4.8 商队

- 最多 3 个停靠点（`MAX_STOP_FOR_CARAVAN`），每种货最多载 100（`MAX_CARAVAN_CARRY_QTY`），每 10 个人口可维持一支商队（`POPULATION_PER_CARAVAN`）。
- 停靠规则（`UnitCaravan::can_set_stop`）：矿场、工厂只能是本国的；**市场必须与其所属国有通商条约**（`get_relation(...)->trade_treaty`）。条约终止后，AI 会删除对应停靠点（`think_del_stop`）。
- 装卸（`OU_CARAT.cpp`）：
  - 卸货只卸到本国市场，补到库存上限为止；
  - 自动装货时给市场留 `MIN_FIRM_STOCK_QTY(100)`；
  - 从外国市场装货要付钱：装货量受本国现金限制（`cash / PRODUCT_PRICE`），并调用 `import_goods` 把钱付给对方。
- 由此形成利润链（分析）：在外国市场以 2 买产品，运回本国市场以 4 卖给本国城镇，同时提高本国城镇的生活质量与忠诚；对方国家得到出口收入。杀死商队扣声望（`civilian_killed` 的商人类型：攻击方 -10，作为伤亡方 -2）。

#### 2.4.9 谍报

间谍对象 `Spy`：所在处（城镇、建筑、机动）、技能 0 到 100、对本国的忠诚、真实国籍 `true_nation_recno`、伪装国籍 `cloaked_nation_recno`、暴露标记、行动模式（休眠、煽动、破坏）。

每日（`Spy::next_day`）：

```
付薪：本国有现金则扣 SPY_YEAR_SALARY/365，否则间谍忠诚 -1
      机动或在本国建筑当首领的间谍还吃本国粮，无粮每 2 天忠诚 -1
若 已暴露：伪装国 != 真实国 则被处死；否则清除暴露标记
每 30 天执行一次行动：
  城镇煽动：降幅 = 技能 / 5 / 本族人口
            独立城镇：降对本国的抵抗；他国城镇：降该族忠诚        // 人越多越难煽动
  建筑煽动：同族首领以 1/(10 - 技能/10 + 首领技能/10) 的概率忠诚 -1
            同族工人：住在城里的降其城镇忠诚(同上公式)，不住城里的以 1/(10 - 技能/10) 的概率 -1
技能成长：行动中每 40 天 +1，休眠每 80 天 +1
每 60 天：目标忠诚 = 50 + 本国声望/4 + 本国综合排名/4 + (与国王同族 ? 20 : 0)，向目标移动 1
          若 忠诚 < UNIT_BETRAY_LOYALTY(30) 且 伪装国评分(声望 + 同族 30) > 忠诚：倒戈，变成伪装国的普通单位
```

破坏（`SpyArray::process_sabotage`）：建筑的 `sabotage_level = Σ(破坏模式间谍技能/5)`，上限 100，兵营不能破坏。`sabotage_level` 如何折减产能本次未追到具体公式（待核实）。

抓捕（`SpyArray::catch_spy`，城镇与建筑各每 30 天一次）：

```
反谍值 = 该地本国间谍技能之和
若 该地全部人口都是敌方间谍：抓不到
对每个非休眠的敌方间谍：
  逃脱基数 = max(技能/10, 100 + 技能 - 反谍值)
  以 1/逃脱基数 的概率被抓并处死；每次调用最多抓一个
被抓：真实国声望 -SPY_KILLED_REPUTATION_DECREASE(3)
```

休眠间谍不会被抓；AI 按 `needed_anti_spy_level = (连通建筑数*10 + 100*人口/60) * pref_counter_spy / 100` 决定反谍投入。

贿赂（`Firm::spy_bribe_succeed_chance`）：

```
若 目标本身是间谍：0
成功率 = 间谍技能 - 目标忠诚 - 目标统率力(commander_power，仅首领)
       + 本国声望 + 200 * 贿金 / MAX_BRIBE_AMOUNT(4000)
       + (间谍与目标同族 ? 10 : 0) + (本国国王与目标同族 ? 10 : 0)
       - 分段惩罚：忠诚超过 60、70、80、90 的部分各再扣一遍
忠诚 == 100：0
```

刺杀（`Spy::get_assassinate_rating`）：只能刺杀同一建筑里的首领。

```
攻 = 技能 + 间谍生命/2 + Σ(同建筑我方其他间谍技能/4)
守 = 目标生命/2 + (目标是间谍 ? 其技能 : 0) + (目标是国王 ? 50 : 0)
   + Σ(同建筑敌方间谍技能/2) + Σ(普通工人 4 + 生命/30) + 30 + random(30)
攻 >= 守 则成功；有其他守卫且攻守差 < 80 时刺客本人也会死
```

阅读机密报告（`secret_view_skill_array`）：城镇 20、经济 30、贸易 30、国家 40、科技 40、军事 50、谍报 90；最低 `MIN_VIEW_SECRET_SPYING_SKILL = 20`。偷完机密会设暴露标记，若不及时换回本国伪装就会被处死。

伪装与夺取：`can_change_cloaked_nation` 要求 5 格内没有敌方单位（`SPY_ENEMY_RANGE`）；当上建筑首领的间谍可以把建筑献给本国（`capture_firm`）；还有间谍国王继承（`think_become_king`）。

#### 2.4.10 外交消息与 AI 应答

- 消息 `TalkMsg`：`talk_id`、两个参数、日期、发送国、接收国、回复类型、回复日期、发送时的关系状态。类型覆盖：提议通商、友好、同盟条约，终止条约，请求军援、禁运、停战、宣战、买粮，宣战，进贡与索贡，援助与索援，赠送与索取科技，劝降与投降。
- 节流：对同一国家最多 3 条未回复消息（`MAX_WAIT_MSG_PER_NATION`），消息保留 365 天（`TALK_MSG_KEEP_DAYS`）。
- AI 每 3 天处理一次收件（`process_ai` 中 `(game_date - nation_recno) % 3 == 0`），每条走 `consider_talk_msg`：若自己已发过同样的提议就直接接受；否则调用对应的 `consider_*`，返回 1 接受、0 拒绝、其他值表示不回复。
- 代表性的接受规则：

| 消息 | 规则 |
| --- | --- |
| 通商 `consider_trade_treaty` | 对方终止通商后 `365 - pref_forgiveness` 天内不接受；自己有通商需求则接受；否则看 `ai_trade_with_rating > 0`（我有对方没有的原料：+min(30, 对方人口/3)；对方有我没有：+30） |
| 友好 `consider_friendly_treaty` | AI 关系值 >= 20；`consider_alliance_rating - (60 - pref_allying_tendency/8 - pref_peacefulness/4) >= 0`（接受线 23 到 60） |
| 同盟 `consider_alliance_treaty` | AI 关系值 >= 40；接受线 `80 - pref_allying_tendency/4 - pref_peacefulness/8`（43 到 80） |
| 停战 `consider_cease_war` | 正在进攻对方或正在夺其城镇则不回复；宣战后 `60 + (100 - pref_peacefulness)` 天内不接受；打不起了直接接受；否则评分 = 同盟评分 + (敌方总军力 - 我方军力排名) + 贸易评分修正 - (我方军力排名 - 50)/2 - 对方对我发动战争次数*10，接受线 `pref_peacefulness/4` |
| 进贡、援助（通知类） | 关系增量 `100 * 金额 / max(1000, 我方现金)`：越穷越领情 |
| 赠送科技（通知类） | 关系增量 `30 * 等级差 * (100 + pref_use_weapon) / 200` |

- `consider_alliance_rating = AI 关系值 - 20 - 对方对我发动战争次数*20 + 现有贸易评分 + 潜在贸易评分/2 + max(0, 对方军力排名 - 我方军力排名)`。
- 负面通知（终止条约等）的关系降幅按宽恕度打折：`change -= change * pref_forgiveness / 100`。
- 主动外交 `think_diplomacy` 的顺序：先处理收件，再考虑宣战、买粮、停战、通商、同盟、友好、终止条约、索贡、赠送科技、索取科技、劝降；任一步成功即返回（每轮最多做一件大事，买粮除外）。
- 重试间隔 `should_diplomacy_retry`：索取类 `60 + 60 * (100 - pref_diplomacy_retry)/100` 天（2 到 4 个月），其他 `90 + 270 * (100 - pref_diplomacy_retry)/100` 天（3 到 12 个月），从上次被拒日期算起。
- 声望代价：终止通商扣 `对方声望 * 5%`，终止友好扣 10%，终止同盟扣 20%（`OTALKRE2.cpp`、`NationBase::end_treaty`）。`change_reputation` 的正向增长按 `(150 - 当前声望)/150` 递减，范围 -100 到 100，每月自然 +0.5。

#### 2.4.11 国家 AI 骨架

- 人格：`Nation::init_personalty` 为二十多个 `pref_*` 各取 `misc.random(101)`，例如 `pref_peacefulness`、`pref_trading_tendency`、`pref_allying_tendency`、`pref_honesty`、`pref_forgiveness`、`pref_collect_tax`、`pref_spy`、`pref_counter_spy`、`pref_cash_reserve`、`pref_food_reserve`、`pref_diplomacy_retry`、`pref_attack_monster`；`pref_military_development + pref_economic_development = 100`。
- 主循环 `process_ai_main`：按难度取轮转周期 `{90, 30, 15, 15}` 天，用 `(game_date - nation_recno*4) % 周期` 的 0 到 11 分别执行建造、贸易、夺取、探索、扩军、偷袭、打怪、外交、海军、大计划、削减开支、城镇管理。`think_trading` 的函数体是空的（`src/OAI_TRAD.cpp`），贸易实际由市场与商队对象各自的 AI 完成。
- 动作队列 `ActionNode`：动作类型（建造、派首领、派工人、派间谍、侦察、移民、处理外交消息、海运等）、参数、坐标、`retry_count`（`STD_ACTION_RETRY_COUNT = 4`）、`instance_count`、`next_retry_date`。规划与执行分离：先入队，每 3 天处理一次，失败重试，超次放弃。
- 持续行动 `process_on_going_action`：正在夺城时每 5 天检查一次；正在进攻时每次检查。
- 每 360 天 `ai_improve_relation`；每 60 天考虑投降与"联合对抗"。

#### 2.4.12 将领与士兵忠诚（`Unit::update_loyalty`）

```
将领：target = commander_power()
             + (与国王同族 ? 20 : 0) + 本国声望/4 + 国王技能/4
             - min(50, (贡献 - 2*累计赏赐)/2)      // 仅当 贡献 > 2*累计赏赐
士兵(有首领；是否要求首领在范围内取决于 config_adv)：
       target = 30 + 首领统率
              - 本人战斗等级/2 - 本人技能等级       // 能干的兵看不起弱将
              + (首领是国王 ? 20 : 0) + (与首领同族 ? 20 : 0)
士兵(无首领)：target = 0
移动：低于目标时 += max(1, (目标 - 当前)/10)；高于目标时每次 -1
```

`commander_power`：在兵营时为 `Σ 连通城镇人口 / 该城连通的活跃兵营数 + 兵营士兵数*3`；在神殿（`FIRM_BASE`）时为 60；机动时为 `队伍人数*3`。

倒戈（`Unit::think_betray`）：忠诚 `< 30` 时，在本区域有基地城镇的已接触国家中，找评分 `声望 + (对方综合评分 - 本国综合评分) + 同族 30` 最高且大于自身忠诚者投奔；忠诚为 0 且无处可去则离开本国。

#### 2.4.13 怪物巢穴（Fryhtan）

- 每 10 天招募兵（`recruit_soldier`），每 15 天回血；进攻型怪物设定下每 30 天以 1/3 概率招募将领。
- 进攻人类：开局约 1000 天（注释写"3 年"）后才开始；每 30 天按 `fryhtan_random_attack` 判定。原版概率是 `1 / (巢穴总数 * monster_attack_divisor)`；可选曲线 `fryhtan_attacks_per_six_months` 让"每半年平均攻击次数"随巢穴数分段上升（0 个时 1 次；到 20 个之前每 5 个 +1；到 80 个之前每 10 个 +1；之后每 15 个 +1，依此类推），再折算成每巢每月的概率。
- `think_attack_human`：已有外出部队则不发起；至少两名各带 5 名以上兵的将领才进攻；在同一区域随机挑选最多 99 次，找一个有主的建筑或城镇作目标。
- 扩张：每 180 天以 `1 / (巢穴总数 * 10)` 的概率在 `MONSTER_EXPAND_RANGE(8)` 内建新巢，总数越多扩张越慢。
- 攻击巢穴给攻击方声望 `+0.001`（`REPUTATION_INCREASE_PER_ATTACK_MONSTER`）；怪王死亡留下"力量卷轴"（`king_leave_scroll`），拾取后获得某族之神的知识。

#### 2.4.14 神（Seat of Power，`FirmBase`）

- 可建条件：本国"知道"该神（`GodInfo::enable_know`）。开局本族之神已知（`ONATIONB.cpp`），其他族的神靠拾取卷轴（`OSITE.cpp`）。
- 祈祷点：有首领时每日 `pray_points += productivity / 100`，上限 `MAX_PRAY_POINTS = 400`；生产率取决于祭司（`calc_productivity`）。
- 召唤：没有在场的神兽、有首领、祈祷点 `>= 400 / 10` 才能召唤（`can_invoke`）。神兽存在期间持续消耗祈祷点（`OU_GOD.cpp`：`pray_points -= exist_pray_points / 200`），生命值就等于剩余祈祷点，点数归零即消失；施展神力另扣 `power_pray_points`。

### 2.5 对《箱庭纪》的借鉴（分析）

**我们现在怎么做、差在哪**

- 忠诚：只有官员的平均忠诚进入自治度（`hakoniwa/src/systems/city/autonomy.ts` 的输入 `loyalty`，`city/daily.ts` 的 `loyaltyOf`）；**人口池没有按种族分的忠诚、目标忠诚与抵抗**，也没有叛乱与和平归附。
- 外交：`hakoniwa/src/systems/strategy/diplomacy.ts` 的 `refusal` 用若干阈值返回拒绝理由（如通商 `rel >= -10`），没有"评分减接受线"的分项结构，也没有消息队列、回复与重试间隔。
- 通商条约：`'trade'` 条约在 `strategy/ai.ts` 里是一个意图，在 `strategy/conclave.ts` 给投票加 15，但**对经济没有任何效果**（商路开放、关税、商队停靠都不看条约）。
- 谍报：大战略 6.3 的行动表还没有实现。
- 竞争者：`hakoniwa/src/systems/economy/competitor.ts` 的 `runCompetitor` 是固定规则（仿制、倾销、囤积、收购报价），没有人格参数。

**可直接借的方法**

1. **按种族的目标忠诚公式结构**：和睦（本族占比）+ 声望 + 就业 + 同族统治 + 驻军将领影响 + 生活质量；实际值按 `1/30` 的比例趋近目标并设最小步长。只需替换各项来源：和睦对应多种族聚落的凝聚（`cohesion` 通道），声望对应国家信誉，生活质量对应商品供给（经济第 4 节的市场），驻军影响对应官员与将领。每一项写成"带来源的条目"，与大战略 2.3 的好感账本用同一套界面。
2. **抵抗只降不升、归零即归附**：给"庭外之国收拢流民聚落与独立村落"一条和平路线（驻军将领统率、种族亲缘、声望、资助、谍报煽动），比只能打下来更契合"离手"主题。
3. **征税与赏赐的累积惩罚**：临时动作（征发、赏赐、临时加派）用"累积惩罚递减"防刷；税收按实际损失的忠诚折算，让"把民心换成钱"成为显性取舍。
4. **叛乱的 2/3 规则与压力释放**：不满者达到 2/3 才起事，一部分人离开后剩余者忠诚回升；间谍不随叛乱。这给"失控"一个可预期的阈值与自然恢复过程。
5. **市场需求分摊算法**：城镇需求先买本国市场，供给不足时缺口平摊到各市场，可作为"AI 商人 L4 贸易流"的最简实现，或作为第 3 节 OpenTTD 式求解的退化版本。
6. **通商条约作为闸门，进口付款给出口国**：无通商条约时不能在对方市场交易，进口付款进入对方国库。这同时满足经济 0.2"钱有去向"与大战略 6.2 禁运的语义（禁运就是撤掉闸门）。
7. **谍报数值模板几乎可以整套映射到大战略 6.3**：

| 大战略 6.3 行动 | 7KAA 对应 | 判定要素 |
| --- | --- | --- |
| 安插 | 间谍以伪装国籍进入城镇或建筑 | 技能随时间累积 |
| 散布传闻 | 煽动（城镇、建筑） | 技能 / 人口，按月 |
| 策反 | 贿赂 | 技能、目标忠诚（高忠诚分段惩罚）、统率、声望、贿金、同族 |
| 破坏 | 破坏模式 | 技能/5 叠加，上限 100 |
| 窃取技术 | 阅读机密报告 | 技能门槛分级，之后暴露 |
| 刺杀 | 刺杀首领 | 攻守评分加随机项 |
| 反谍 | 本国间谍驻点 | 月度抓捕，逃脱基数 = max(技能/10, 100 + 技能 - 反谍) |
| 暴露后果 | 处死、扣声望 3 | 伪装国是否已换回 |

   差别：我们要求结果写入知识层而不是世界真值（伪造证据只改"别人以为的事"），且凡人的阴谋是动作而不是修正项（经济 7.4）。判定结构可以照搬，随机数走按系统命名的随机流（例如 `ctx.rng('strategy.intel')`）。
8. **外交应答改成"评分减接受线"**：每类提议一个 `consider_*`，返回差值；人格参数移动接受线；被拒后有人格决定的重试间隔；每国待回复消息上限 3。分项可喂给大模型做表达（国书与理由），决定仍由规则兜底。
9. **错峰调度**：`game_date % N == id % N` 把城镇、间谍、国家 AI 的计算均匀摊开，可直接用于我们的日结算与 `requestRulerPolicies` 的季度请求错峰。
10. **将领统率与士兵忠诚**：士兵目标忠诚含"本人越能干越看不起弱将"，将领"贡献超过赏赐两倍就掉忠诚"，可直接用于即时战术 4.4 的 `loyalty`，并与"放手"成长挂钩（将领独立打赢的仗记贡献，赏赐要跟上）。
11. **怪物压力曲线**：开局宽限、按巢穴数分段上升的攻击频率、扩张随总数递减、击杀首领掉关键道具，可用于澱区魔物（城建 10.2）与魔物潮节奏。
12. **神的"持续消耗预算"**：神兽在场期间不断吃祈祷点、生命值等于剩余点数，是"神力是会被持续花掉的预算"的直观实现，可作为女神神力与澱（经济 7.5）的凡间参照。

**要改造的点**

- 7KAA 的人格全靠随机数；我们的统治者人格来自人设卡与意图权重（大战略 3.1），应由内容数据给定，随机只做小幅扰动。
- 只有 3 种原料、3 种产品、固定价格；借它的市场结构时不要退化我们已有的供需价格模型。
- 7KAA 的种族主要是阵营身份；我们的种族还牵涉正典（人才密度、宗教、寿命），种族亲缘系数要由世界观数据给出。

**不要学的坑**

- `think_unite_against_big_enemy` 只在"最强者是人类玩家"时触发（检查 `enemyNation->is_ai()`），让 AI 国家整体向第二强的 AI 投降来对抗玩家。这违背经济 0.2 第 5 条与大战略 6.3 的"AI 守同一规则、不偷看"；联合对抗只能看公开的实力与威胁（我们已有 `runAntiCoalition` 的 `ae` 机制）。
- 谍报效果直接改真实忠诚，没有任何可追溯记录；我们要写入事件流与知识层，事后能查明。
- 周期判定都写死在 `next_day` 一类大函数里，新机制只能继续往里加；我们按系统模块分开（主工程的模块优先原则）。

### 2.6 许可与复用边界

GPL v2（代码与游戏数据）：只借方法，公式以自述与伪代码转述，单行常量（如 `REBEL_LOYALTY = 29`、`MAX_BRIBE_AMOUNT = 4000`、机密阅读门槛表）作为事实引用。"Seven Kingdoms" 为商标，不得用于本作命名。

---

## 3. OpenTTD（必读）

### 3.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-148`（"基于《运输大亨豪华版》的运输模拟游戏"；原文选读建议"关注现金流、运力与拥堵反馈"） |
| 仓库 | https://github.com/OpenTTD/OpenTTD |
| 固定提交 | `de9df409a7fa4b297567c4789a393bd137c1536a`（2026-11-14） |
| 代码许可 | GPL v2（`COPYING.md`、`README.md` 第 3.0 节）；第三方组件例外：`src/3rdparty/squirrel` 为 Zlib，`md5` 为 Zlib，`fmt`、`nlohmann`、`opengl` 为 MIT |
| 素材许可 | 仓库不含原版 TTD 素材；游戏需另装基础素材集（如 OpenGFX、OpenSFX、OpenMSX），其许可需另查（待核实） |
| 语言与规模 | C++20；脚本层为内嵌 Squirrel 语言。`src/linkgraph/` 约 4100 行，`src/script/api/` 约 160 个文件、约 2.6 万行 |
| 本地镜像 | `D:\hakoniwa_refs\openttd`。已检出 `src/linkgraph/`、`src/script/`、`src/economy*`、`src/station_cmd.cpp`、`src/town_cmd.cpp`、`src/subsidy*`、`src/cargomonitor*`、`src/goal*`、`src/story*`、`src/town.h`、`src/station_base.h`、`src/town_type.h`、`src/cargopacket.h`、`src/settings_type.h`、`src/table/settings/{economy,script,linkgraph}_settings.ini` |
| 分级 | 必读 |

### 3.2 值得看的理由

- **经济 4.2"贸易流"与 3.4 商路**：OpenTTD 的 cargodist（货物分配）把"谁要从哪运到哪、走哪条路、每条路分多少"做成了可扩展的图算法：需求计算加多商品流（MCF）加每站的流表。我们的区域经济要让 AI 商人沿商路搬货、价差收敛但不瞬间抹平，这是最成熟的开源参照。
- **经济 3.6 竞争者与 6.1 寻租**：车站评分决定多家公司如何分享同一产地的货；地方当局评分与动作菜单（广告、修路、雕像、资助、独家运输权、贿赂）是"对地方势力的动作菜单"的现成模板。
- **经济 9 节防通胀**：通胀只在固定年限内生效、价格与收入分开通胀，是"给通胀加护栏"的样本。
- **大战略 3.2 到 3.4（大模型统治者的受限动作菜单）**：OpenTTD 的脚本 API 把 AI 公司与 GameScript（GS，游戏剧本）都关进同一个沙盒：只能调用列出的函数，所有写操作都走玩家同一条命令通道，有测试模式、错误码、事件队列、操作码配额与挂起、按身份分级的接口。这几乎就是"模型提议，内核裁决"的完整工程实现。

### 3.3 源码导读

- **链路图数据**：`src/linkgraph/linkgraph.h` 的 `LinkGraph`（每个货种一张图）、`BaseNode`（`supply`、`demand`、`station`、`xy`）、`BaseEdge`（`capacity`、`usage`、`travel_time_sum`、最后更新日期）；`linkgraph.cpp` 的 `BaseEdge::Update`、`LinkGraph::Compress`、`Merge`。
- **由车辆时刻表刷新链路**：`src/linkgraph/refresh.cpp` 的 `LinkRefresher`（按订单预测各段运力）。
- **作业调度**：`src/linkgraph/linkgraphschedule.cpp` 的 `LinkGraphSchedule`（构造函数中的六个处理器）、`SpawnNext`、`JoinNext`、`Run`、`OnTick_LinkGraph`、`StateGameLoop_LinkGraphPauseControl`；作业 `linkgraphjob.cpp` 的 `LinkGraphJob`、`Path::AddFlow`。
- **需求**：`src/linkgraph/demands.cpp` 的 `SymmetricScaler`、`AsymmetricScaler`、`DemandCalculator::CalcDemand`、`DemandCalculator::DemandCalculator`。
- **多商品流**：`src/linkgraph/mcf.cpp` 的 `DistanceAnnotation`、`CapacityAnnotation`（含 `IsBetter`、`Comparator`）、`MultiCommodityFlow::Dijkstra`、`PushFlow`、`CleanupPaths`、`MCF1stPass`（含 `EliminateCycles`）、`MCF2ndPass`。
- **流表**：`src/linkgraph/flowmapper.cpp` 的 `FlowMapper::Run`；`src/station_base.h` 的 `FlowStat`（按份额选下一跳）、`FlowStatMap`。
- **设置**：`src/table/settings/linkgraph_settings.ini`（`recalc_interval`、`recalc_time`、`distribution_*`、`accuracy`、`demand_distance`、`demand_size`、`short_path_saturation`）；`src/settings_type.h` 的 `LinkGraphSettings`。
- **车站评分与分货**：`src/station_cmd.cpp` 的 `UpdateStationRating`、`MoveGoodsToStation`、`UpdateStationWaiting`、`RerouteCargo`；常量 `src/station_base.h` 的 `INITIAL_STATION_RATING`、`MAX_STATION_RATING`。
- **运费收入**：`src/economy.cpp` 的 `GetTransportedGoodsIncome`。
- **通胀**：`src/economy.cpp` 的 `AddInflation`、`RecomputePrices`。
- **城镇成长与地方当局**：`src/town_cmd.cpp` 的 `UpdateTownRating`、`GetNormalGrowthRate`、`UpdateTownGrowthRate`、`UpdateTownGrowth`、`CountActiveStations`、`CheckIfAuthorityAllowsNewStation`、城镇动作 `TownActionAdvertiseSmall` 到 `TownActionBribe` 与表 `_town_action_proc`、`GetMaskOfTownActions`、`CmdDoTownAction`；评分常量 `src/town_type.h` 的 `RATING_*`。
- **补贴**：`src/subsidy.cpp` 的 `CreateSubsidy`、`FindSubsidyPassengerRoute`、`FindSubsidyTownCargoRoute`、`FindSubsidyIndustryCargoRoute`、`FindSubsidyCargoDestination`、`CheckSubsidyDistance`、`CheckSubsidyDuplicate`，月度定时器 `_economy_subsidies_monthly`；常量 `src/subsidy_base.h` 的 `SUBSIDY_*`。
- **脚本运行时**：`src/script/script_instance.cpp` 的 `ScriptInstance::GameLoop`、`Pause`、`DoCommandReturn`、存档相关；`src/script/script_storage.hpp` 的 `ScriptStorage`（每个脚本实例一份）；`src/script/script_suspend.hpp`；设置 `src/table/settings/script_settings.ini`（`script_max_opcode_till_suspend`、`script_max_memory_megabytes`）。
- **脚本 API 基类**：`src/script/api/script_object.hpp` 与 `.cpp` 的 `ScriptObject::DoCommandPrep`、`DoCommandProcessResult`、模板 `ScriptDoCommandHelper::Execute`、`GetLastError`、`SetLastError`、`DisableDoCommandScope`。
- **模式类**：`script_testmode.hpp`（只估算）、`script_execmode.hpp`（执行）、`script_asyncmode.hpp`（异步）、`script_companymode.hpp`（`IsValid`、`IsDeity`）。
- **控制器与配额**：`script_controller.hpp` 的 `GetTick`、`GetOpsTillSuspend`、`DecreaseOps`、`GetSetting`、`SetCommandDelay`、`Sleep`。
- **事件**：`script_event.hpp`、`script_event_types.hpp`（如 `ScriptEventSubsidyOffer`、`ScriptEventCompanyBankrupt`、`ScriptEventCompanyAskMerger` 带 `AcceptMerger`、`ScriptEventGoalQuestionAnswer`、`ScriptEventStoryPageButtonClick`）。
- **GS 专用叙事与目标**：`script_goal.hpp`（`New`、`SetProgress`、`SetCompleted`、`Question`、`CloseQuestion`）、`script_story_page.hpp`（`New`、`NewElement`、`UpdateElement`）、`script_league.hpp`（排行榜）、`script_news.hpp`、`script_text.hpp`（`ScriptText`：字符串 ID 加参数）、`script_cargomonitor.hpp`（按公司统计送货量）。
- **城镇相关脚本接口**：`script_town.hpp` 的 `IsActionAvailable`、`PerformTownAction`、`GetRating`、以及只给 GS 的 `SetGrowthRate`、`SetCargoGoal`、`ChangeRating`、`ExpandTown`（标注 `@api -ai`）。

### 3.4 机制拆解

#### 3.4.1 cargodist 总流程

```
运行中：车辆在站间装卸 -> 更新链路图的边(容量、使用量、旅行时间)和节点(供给)
        LinkRefresher 按时刻表预测各段运力，提前把边建出来
        LinkGraph::Compress 定期把供给、容量、使用量减半(指数遗忘)
每隔 recalc_interval：
  OnTick_LinkGraph 在固定的日内时刻(SPAWN_JOIN_TICK)：
    offset == 0             -> SpawnNext：复制一张链路图为 LinkGraphJob，开线程计算
    offset == interval / 2  -> JoinNext：等线程结束，把结果(流表)合并回车站
  作业内依次运行处理器：
    InitHandler -> DemandHandler -> MCFHandler<MCF1stPass> -> FlowMapper(false)
                -> MCFHandler<MCF2ndPass> -> FlowMapper(true，按运行时长换算成月度)
若 到了合并时刻作业还没算完：StateGameLoop_LinkGraphPauseControl 提前两个日内刻暂停游戏，算完再恢复
```

- 关键：异步计算在"快照"上进行，结果只在固定游戏日期合并；算不完宁可暂停，也不让不同机器在不同时刻看到结果。这是"异步计算仍然确定"的工程答案。
- 默认 `recalc_interval = 8`、`recalc_time = 32`。`settings_type.h` 注释写单位为"天"，代码中又按 `EconomyTime::SECONDS_PER_DAY` 换算，确切单位待核实。`accuracy = 16`、`demand_distance = 100`、`demand_size = 100`、`short_path_saturation = 80`。
- 分配模式：每类货（客、邮、贵重、其他）可选手动（不用 cargodist）、非对称、对称；对称只用于客、邮一类有回程需求的货。

#### 3.4.2 需求计算（`DemandCalculator::CalcDemand`）

```
supplies = 所有 supply > 0 的节点；demands = 所有 demand > 0(接收该货)的节点
base_distance = IntSqrt(地图对角的 DistanceMaxPlusManhattan)
对称模式：demand_per_node = max(Σsupply / 接收节点数, 1)
轮转(两个队列轮流出队)直到一方为空：
  from = supplies 出队
  for 每个 to in demands(轮转)：
    effective = 对称 ? max(from.supply * max(1, to.supply) * demand_size / 100 / demand_per_node, 1)
                     : from.supply
    scaled_distance = base_distance + (距离 - base_distance) * mod_dist / 1024    // 下限 0
    divisor = 16 + accuracy * scaled_distance * 16 / (base_distance * 2)
    if divisor <= effective * 16: demand = effective * 16 / divisor            // 近的、大的先分
    elif 尝试次数 > accuracy * 需求点数 * 供给点数: demand = 1                  // 兜底，远小站也分一点
    demand = min(demand, from 尚未分出的供给)
    对称模式：回程需求 = demand * demand_size / 100，受 to 尚未分出的供给限制并反算去程
    写入 from -> to 的需求(DeliverSupply)
    to 无剩余需求则移出队列；from 分完则 break
```

- `demand_distance` 超过 100 时按平方放大（注释给出 150 到 308、200 到 933、255 到 2102 的对照）。
- 含义：需求与"供给规模"成正比、与"距离"成反比，且对称模式下大站之间往返需求平衡。需求不看价格，因为 OpenTTD 的货物到任何接收方都按同一运价表付钱。

#### 3.4.3 多商品流（`MCF1stPass`、`MCF2ndPass`）

```
第一遍(MCF1stPass)，max_saturation = short_path_saturation(80%)：
  反复，直到没有新流量且消不掉环：
    对每个尚有未满足需求的源点：
      用 DistanceAnnotation 跑 Dijkstra：
        客、邮、快件按旅行时间作距离，其他货按格子距离；每经过一站罚 1 格或 1 天
        比较规则(IsBetter)：两条路都有余量时比距离；有余量的优于没余量的；都没余量时比距离
      对每个目的地：沿最短路推流 flow = clamp(需求 / accuracy, 1, 未满足需求)
        受每条边的"容量 * 80%"限制(Path::AddFlow 逐段截断)
        若这对源汇还一点没分到，允许无视容量推一次
    EliminateCycles：消除流量环
第二遍(MCF2ndPass)，max_saturation 不限：
  用 CapacityAnnotation 跑 Dijkstra(只沿已有流量的边，FlowEdgeIterator)：
    比较规则：先比路径上"剩余容量比例"的最小值，相同再比距离
  把剩余需求全部压到现有路径上(允许超载)
```

- 先把最短路填到 80%，再把剩余需求分到最宽的路，避免所有货挤一条线。`accuracy` 同时控制每次推流的粒度和需求计算的精度，越高越准越慢。
- `Greater` 比较函数在标注值（annotation）相等时用节点 id 决胜，保证集合里不会出现"相等"元素，结果确定。

#### 3.4.4 流表（`FlowMapper::Run`）

把每条路径上的流量写成"每个车站、对每个起点、下一跳去哪站各占多少份额"（`FlowStatMap`，`AddFlow`、`PassOnFlow`、`FinalizeLocalConsumption`），第二次映射时按作业运行时长换算成月度量（`ScaleToMonthly`）。车站装货时，货包按份额选下一跳；货包只记"起点与下一跳"，到达中转站后再查该站的流表（与第 5 节 Simutrans"只存终点与下一跳"异曲同工）。

#### 3.4.5 运费收入的时间衰减（`GetTransportedGoodsIncome`）

```
transit = 运输时长(按 cargo_aging_rate 缩放)
d1, d2 = 货种的两个时限 transit_periods[0], [1]
超出1 = max(transit - d1, 0)；超出2 = max(超出1 - d2, 0)
若 未落入尾段：time_factor = max(255 - 超出1 - 超出2, 31)       // 快运恒定，中速斜率 -1，慢速斜率 -2
否则：time_factor 按 1/(x+1) 渐近到 1                            // 极慢运输几乎不赚钱
收入 = 距离 * time_factor * 件数 * 当前运价 >> 21
```

常量 `MIN_TIME_FACTOR = 31`、`MAX_TIME_FACTOR = 255`。不同货种的时限不同，易腐货短、矿石长。

#### 3.4.6 车站评分（`UpdateStationRating`）与分货（`MoveGoodsToStation`）

每种货在每个车站有评分 0 到 255，初值 175。定期更新：

```
rating = 0
最近来车最高速度 last_speed：rating += max(0, last_speed - 85) / 4
距上次取货时间 waittime(船运除以 4)：<=21 +25，<=12 +25，<=6 +45，<=3 +35
rating -= 90
最大积压 max_waiting_cargo：<=1500 +55，<=1000 +35，<=600 +10，<=300 +20，<=100 +10
本公司在该城有雕像：+26
来车车龄：<3 年 +10，<2 年 +10，<1 年 +13
新评分 = 旧评分 + clamp(rating - 旧评分, -2, +2)               // 每次最多变 2
评分 <= 64 且平均每个下一跳积压 >= 100：随机丢一批货
评分 <= 127 且有积压：若 评分 <= 一个 0 到 127 的随机数，丢少量货
积压超过 4096 后按超出部分的 1/64 截断，硬上限 32768
```

分货：产地（工业或城镇建筑）把产出交给覆盖它的车站：

```
只有一个车站：amount *= rating + 1                              // 评分直接决定拿到多少(定点数，后续 >> 8)
多个车站：
  按公司取各自最高评分 best[c]，以及各公司评分和 sum[c]
  amount *= 全局最高评分 + 1
  每站分得 = amount * best[该公司] * 本站评分 / Σbest / sum[该公司]
  舍入余数分给评分最高的车站
```

服务越好拿到的货越多，评分只能每次 ±2 地慢慢变，竞争者很难一夜抢走市场。

#### 3.4.7 城镇成长与地方当局

- 公司对每个城镇有评分 `RATING_MINIMUM = -1000` 到 `RATING_MAXIMUM = 1000`，初值 500。`UpdateTownRating`：评分低于 200（`RATING_GROWTH_MAXIMUM`）时每次 +5；城镇附近 20 天内有装卸的本公司车站每个 +12，否则每个 -15。砍树、拆路、拆桥另有扣分（如 `RATING_TREE_DOWN_STEP = -35`、`RATING_ROAD_DOWN_STEP_INNER = -50`、`RATING_TUNNEL_BRIDGE_DOWN_STEP = -250`），且按地方当局态度设置有"做这件事需要的最低评分"（如拆路 Lenient 16、Neutral 64、Hostile 112）。
- 评分低于 `RATING_VERYPOOR = -200` 时地方当局拒绝新建车站（`CheckIfAuthorityAllowsNewStation`）。
- 成长速度 `GetNormalGrowthRate`：查表 `_grow_count_values`，按活跃车站数（最多 5 个）和"是否正在资助建房"取间隔（正常 `{320, 420, 300, 220, 160, 100}`，资助中 `{120, 120, 120, 100, 80, 60}`），再按全局成长速度设置右移、大城减半、按房屋数缩放。
- 成长条件 `UpdateTownGrowth`：雪线以上且人口超过 90 的城、沙漠中人口超过 60 的城，对应的送货目标（通常是食物、水）上月必须有送达，其他目标按设定的数量判断；无资助时若一个活跃车站都没有，只有 1/12 的概率仍然成长。
- 地方当局动作菜单（`_town_action_proc`）：小、中、大广告（提升附近车站评分），重修道路，建雕像，资助新建筑，购买独家运输权，贿赂。可用性由 `GetMaskOfTownActions` 给出掩码（钱够不够、是否已被拉黑、贿赂需要评分未满 `RATING_BRIBE_MAXIMUM = 800` 等）。
- 贿赂（`TownActionBribe`）：以 1/14 的概率失败，失败则该公司被拉黑 6 个月、本城附近该公司所有车站的评分清零、城镇评分降到 `RATING_BRIBE_DOWN_TO = -50`；成功则评分 +200（上限 800），并解除他人的独家运输权。

#### 3.4.8 通胀与补贴

- 通胀（`AddInflation`，按月）：`inflation_prices += inflation_prices * infl_amount * 54 >> 16`，收入另用 `infl_amount_pr` 单独通胀，注释说明这是"年通胀率开 12 次方"的近似。只在原版的 170 年范围内生效，到上限 `MAX_INFLATION` 就停，注释直说"之后只会带来溢出且无法游玩"。价格与收入分开通胀，所以同样的运输会慢慢变得不那么赚钱。
- 补贴：系统主动挑选"运输比例低于 42%"（`SUBSIDY_MAX_PCT_TRANSPORTED`）、距离不超过 70（`SUBSIDY_MAX_DISTANCE`）、城镇人口达标（客运 400、货运 900）的线路发邀约，邀约有效 12 个月（`SUBSIDY_OFFER_MONTHS`）；先接下的公司在设定期限内获得运费倍率。补贴引导玩家去服务被忽视的地方。

#### 3.4.9 脚本 API 的设计（重点）

**两类脚本，一套沙盒**

| 项 | AI（公司脚本） | GS（GameScript，游戏剧本） |
| --- | --- | --- |
| 身份 | 一家公司（`ScriptCompanyMode` 有效） | 神位（`ScriptCompanyMode::IsDeity()` 为真），可临时切换为某公司身份 |
| 接口 | 头文件注释 `@api ai` 的类与函数 | `@api game`；同一函数可标 `@api -ai` 表示只给 GS |
| 典型能力 | 建线路、买车、做城镇动作、读公开数据 | 设目标、发问题、写故事书与排行榜、发新闻、改城镇成长与评分、扩城、监控各公司送货量 |

统计：`src/script/api/` 中有数十个头文件带 `@api ai` 标注，只标 `@api game` 的头文件有十几个；`script_text.hpp` 的 `Text` 等内部类标 `@api -all`，两边都不可见。

**写操作只走命令通道**

```
ScriptDoCommandHelper<Tcmd>::Execute(args):
  DoCommandPrep():
    在构造函数、Save、Load、估值器(valuator)里调用 -> 抛致命错误("不允许执行任何 DoCommand")
    estimate_only = 当前处于 ScriptTestMode
    asynchronous  = 当前处于 ScriptAsyncMode
    非神位且公司无效 -> ERR_PRECONDITION_INVALID_COMPANY
  清洗字符串参数；越界格子直接拒绝
  Command<Tcmd>::Unsafe(...)              // 与玩家完全相同的命令：先校验后执行，联机走网络同步
  DoCommandProcessResult(res):
    失败 -> SetLastError(把错误消息映射成枚举错误码) 并返回 false
    估算模式 -> 只累加预计费用
    异步模式 -> 立即返回，额外扣 100 个操作码作为"异步手续费"
    联机 -> 挂起脚本，直到命令真正执行回来
    单机 -> 也挂起 1 个以上 tick，模拟联机延迟(SetCommandDelay 可调)
```

- 脚本从不直接改世界状态；它能做的事情恰好等于玩家能做的事情，外加 GS 的神位能力。
- 失败原因是枚举（`ScriptError`），脚本可以据此分支或重试。
- `ScriptTestMode` 让脚本先"试算"一组命令的总费用与可行性，不改变世界。

**配额、挂起与隔离**

- 每个脚本实例在每个游戏 tick 最多执行 `script_max_opcode_till_suspend` 个操作码（默认 10000，范围 500 到 250000），用完即被挂起到下一 tick（`ScriptInstance::GameLoop` 中 `engine->Resume(...)`）；`Sleep(ticks)` 主动让出。
- 构造函数有单独的操作码上限 `MAX_CONSTRUCTOR_OPS`（`src/script/script_info.hpp`，100000），加载过久的脚本"不启动"（日志："took too long to initialize"）。
- 内存上限 `script_max_memory_megabytes`（默认 1024）。
- 每个实例一份 `ScriptStorage`：当前模式、所属公司、命令延迟、累计费用、最后错误、最后命令结果、事件队列、日志。
- 暂停时把剩余操作码清零（`ScriptInstance::Pause` 调 `DecreaseOps`）。

**事件与问答**

- 世界把事件推进脚本自己的 `ScriptEventQueue`（补贴邀约、公司破产、车辆迷路、工业开关、问题回答、故事书按钮点击等），脚本轮询取用。
- 部分事件带"回复动作"：`ScriptEventCompanyAskMerger::AcceptMerger`、`ScriptEventEnginePreview::AcceptPreview`。
- GS 用 `ScriptGoal::Question(uniqueid, company, text, type, buttons)` 向玩家发带按钮的问题，玩家的选择以 `ScriptEventGoalQuestionAnswer` 回传。

**玩家可见文本 key 化**

`ScriptText(STR_XXX, 参数...)`：GS 发给玩家的文本是"字符串 ID 加参数"，每个剧本自带语言文件，客户端按自己的语言渲染，缺译回退英文。脚本不拼接自然语言。

**合法动作掩码**

城镇动作先用 `GetMaskOfTownActions`（脚本侧 `ScriptTown::IsActionAvailable`）给出"此刻可用"的掩码，再 `PerformTownAction`；接口文档逐条写 `@pre` 前置条件（例如 `@pre IsActionAvailable(town_id, town_action)`、`@game @pre ScriptCompanyMode::IsValid()`）。

### 3.5 对《箱庭纪》的借鉴（分析）

**我们现在怎么做、差在哪**

- 区域经济：`hakoniwa/src/systems/economy/market.ts` 的 `driftMarket` 让每个市场每日按 `supply`、`demand` 加随机扰动增减库存，价格倍率按 `clamp((T/stock)^k)` 并限制每日变化；市场之间**没有自动的贸易流**，只有玩家商会的商队（`economy/company.ts` 的 `sendCaravan`、`rollCaravanRisks`、`settleCaravans`）和竞争者的仿制、倾销、囤积；会改动市场库存的还有聚落官员与本地集市的买粮、卖余货（`city/officials.ts` 经 `buyFromMarket`、`sellToMarket`）。经济 4.2 设计的"AI 商人沿商路运货、价差收敛"尚未实现。
- 商路：`RouteDef` 只有 `days`、`risk`、`tollRate`，没有运力（容量）与繁忙度；商队成本按"（车数 × 每日车费 + 护卫数 × 每日护卫费）× 路线天数"计，到站后再按 `tollRate` 扣关税。
- AI 端口：`hakoniwa/src/core/ai_port.ts` 的 `AiRequestSpec` 已有 `allowed`（命令种类白名单）、`fallback`（确定性兜底命令）、`deadlineTicks`、`revision`（过期丢弃），`AiContextV1.commands` 用文字描述可用命令；`strategy/ai.ts` 的 `requestRulerPolicies` 每季度为每个 AI 国家发一次 `ruler.policy` 请求，命令只有一个粗粒度的 `slg.ruler_policy`（带 `intent` 字段），`PERMISSION` 表把意图分到 P0 到 P3。缺的是：试算模式、细粒度命令与前置条件说明、合法动作掩码、错误码回喂、事件回传；配额只有部分（按主体加角色冷却 `cooldownMs`、单次命令上限 `maxCommands`、按角色花费份额 `budgetShare`），还没有按主体每周期的调用与动作条数配额及超额挂起。

**可直接借的方法**

1. **区域贸易流用"链路图 + 需求 + 容量约束流"**：节点为市场，边为商路（容量 = 车马行与商队的周运力，旅行时间 = 驿道天数）；需求不能像 OpenTTD 那样只看供给与距离，要改成"价差驱动"：`需求(a 到 b, 货 g) ∝ max(0, 价差 - 运输成本 - 关税 - 风险溢价 - 资金占用)`，再用 MCF 的两遍法分配到商路上（先最短路填到 80%，再分到最宽的路）。我们的市场只有几十个，可以每周同步计算；若要异步，就学 OpenTTD 的"快照计算、固定日期合并"。
2. **服务评分决定份额**：每个商号在每个市场、每种货有一个评分（等待时间、积压、车速、车龄、政治投资），评分每次最多变 2，产地货量按评分在商号间分配。金冠商行与门扉商会的竞争就落在评分与份额上，而不是"直接改价"，这与经济 0.2 第 2 条、第 7 节注册修正项合同一致。
3. **地方当局评分与动作菜单**：每个势力（商号、国家）在每个城镇有一个"当局评分"，决定能否开店、开商路、过关卡；动作菜单（宣传、修路、立像、资助建设、买专营权、贿赂）各有费用与可用掩码。贿赂"1/14 失败、失败即拉黑半年、评分清零"是一个简洁的风险模型，可直接用于经济 6.1 寻租与 3.6 竞争行动菜单。
4. **运费随时间衰减**：商路收益公式（经济 3.4"两地价差 × 运量 - 运输成本 - 关税 - 保险"）缺"时间价值"。借 `GetTransportedGoodsIncome` 的分段时间因子：易腐货（粮、肉、药）时限短，矿与木时限长，慢运的利润按段递减，这同时给门扉"即时运输"一个天然价值。
5. **补贴即委托悬赏**：系统主动为"运输比例低于阈值"的线路发邀约，先接者得倍率。可用作领地发展委托（"三个月内向东区运 500 粮"），引导玩家去被忽视的地方，也给 AI 商号一个公开的目标。
6. **通胀护栏**：如果引入铸币贬值（经济 5.4），价格与收入分开计算并设上限与时间窗，避免长期运行后数值溢出或经济失衡。
7. **脚本 API 作为大模型统治者菜单的工程模板**（对应大战略 3.2 到 3.4）：

| OpenTTD | 《箱庭纪》对应（分析） |
| --- | --- |
| 写操作只走 `Command<T>`，与玩家同一条通道 | 模型提议的每个动作都是普通内核命令，经同一份校验；`AiRequestSpec.allowed` 已有白名单 |
| `@api ai` 与 `@api game`、公司身份与神位身份 | 统治者菜单与女神、叙事导演菜单分开；女神权限更大但仍走命令与注册修正项（P0 到 P4 分级） |
| `ScriptTestMode` 试算 | 给模型一个"预演"工具：同一命令以只读方式返回费用、前置条件是否满足、预计后果，不改世界 |
| `GetLastError` 枚举错误码 | 内核 `reject(code, reason)` 的 code 回喂模型，模型据此改提议；兜底规则同样读 code |
| `IsActionAvailable`、`@pre` 文档 | 感知摘要里只放"此刻合法"的动作及其前置条件和代价（大战略 3.2 第 1 步），而不是全量菜单 |
| 每 tick 操作码配额、`Sleep`、命令延迟 | 每个 AI 主体每个周期的调用次数、令牌预算、动作条数上限；超额就挂起到下一周期（大战略 3.4） |
| 构造、存档、估值器里禁止发命令 | 生成感知摘要的阶段只读，禁止产生命令；保证投影函数是纯函数 |
| 事件队列与带回复的事件、带按钮的问题 | 外交消息、请示队列（城建 9）、女神的提问都以事件进出，回复也是命令 |
| `ScriptText` 字符串 ID 加参数 | 模型与内核产出的玩家文本走 key 加参数（主工程 i18n 规则），自由文本只进调试视图 |
| 异步作业固定日期合并，算不完就暂停 | 我们的 AiPort 选择"截止前没回就跑兜底"而不暂停；两种取舍可以并存：剧情关键决策可选"等待"，日常决策用兜底 |

**要改造的点**

- OpenTTD 的需求与价格无关（同一运价表），我们的需求必须由价差驱动，并在每次求解后回写库存，让价差收敛。
- 车站评分的常数全是经验值，需要按我们的时间尺度（日结算、季节、魔物潮）重新标定。
- GS 的"神位"可以直接改城镇评分与成长；我们的女神对数值的影响只经注册修正项（另有强制天气、旗标与台词），且必须显性或半显性（经济 7.4），不能照搬"直接改"。

**不要学的坑**

- 评分里大量魔法数字（+25、+25、+45、+35、-90……）缺少设计说明，我们每个系数都要写进配置并能在月报里追溯。
- 通胀后期失控是 OpenTTD 自己承认的历史包袱；我们一开始就设护栏。

### 3.6 许可与复用边界

GPL v2：只借方法与接口设计思路，不拷贝代码与 API 文档原文；单行公式与常量（如 `MIN_TIME_FACTOR = 31`、补贴阈值 42%、默认操作码 10000）作为事实引用。内嵌的 Squirrel 解释器为 Zlib 许可，若将来需要嵌入式脚本可单独评估，但本作的 AI 层是外部大模型，不需要它。

---

## 4. KaM Remake（选读）

### 4.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-135`（"用 Delphi 从零编写的《骑士与商人》即时战略重制版"） |
| 仓库 | https://github.com/Kromster80/kam_remake 。`README.md` 写明 "Main development is in reyandme repo"，即主开发仓库为 https://github.com/reyandme/kam_remake （本次只看了网页，未克隆，待核实其现状） |
| 固定提交 | `b199128f2ce826302a7626463018bfb88cfde032`（2022-06-01，浅克隆唯一提交为改 README）；源码本身较旧，`src/KM_Defaults.pas` 的 `GAME_REVISION = 'r7000+'` |
| 代码许可 | GNU AGPL v3（`LICENSE.txt`）；`Docs/Licenses.txt` 只是开发者讨论，不是条款 |
| 素材许可 | 运行依赖原版 KaM 的资源文件：`README.md` 写"假定你拥有原版游戏（安装程序会检查）"、可执行文件为 freeware；`Installer/License.eng.txt` 写"严禁商用"、要求拥有正版《Knights and Merchants: The Peasants Rebellion》。原版图像与音频不是自由素材；个别地图与战役附有单独许可文件 |
| 语言与规模 | Delphi / Object Pascal（另有 Lazarus 工程 `KaM_Remake.lpi`）；`src/ai/` 约 5400 行，`src/hands/` 约 4600 行，`src/units/` 约 1.1 万行，`src/houses/` 约 3300 行 |
| 本地镜像 | `D:\hakoniwa_refs\kam_remake`，已检出 `src/ai/`、`src/hands/`、`src/units/`、`src/houses/`、`src/res/`、`src/KM_*.pas`（约 11MB） |
| 分级 | 选读 |

### 4.2 值得看的理由

KaM 的"搬运工配送"是 Widelands 之外另一种成熟做法：没有道路逐跳路由，而是一张"供给（offer）与需求（demand）"表，用"出价"（bid，越小越好）撮合，再派最合适的搬运工。它比 Widelands 简单得多，更接近我们日结算可承受的复杂度（城建 6.4）。AI 的"产需平衡表 + 瓶颈环节"建造法也比 Widelands 的神经网络更可解释。

### 4.3 源码导读

- 物流：`src/hands/KM_HandLogistics.pas` 的 `TKMDeliveries`（offer、demand、queue 三张表）、`TKMHandLogistics.UpdateState`、`TKMDeliveries.CalculateBid`、`ValidDelivery`、`SerfCanDoDelivery`、`PermitDelivery`、`GetAvailableDeliveriesCount`、`AskForDelivery`、`AssignDelivery`、`CheckForBetterDemand`、`TakenOffer`、`GaveDemand`、`AbandonDelivery`；记录 `TKMDeliveryOffer`、`TKMDeliveryDemand`；枚举 `TKMDemandType`（`dtOnce`、`dtAlways`）、`TKMDemandImportance`。
- 需求与供给的来源：`src/houses/KM_Houses.pas` 的 `TKMHouse.Activate`、`ResTakeFromIn`、`UpdateResRequest`、`ResAddToOut`；原料分配比例 `src/KM_WareDistribution.pas` 的 `DistributionDefaults`。
- 搬运执行：`src/units/KM_UnitTaskDelivery.pas` 的 `TTaskDeliver.Execute`、`CheckForBetterDestination`、`WalkShouldAbandon`；`src/units/KM_Units.pas` 的 `TKMUnitSerf.Deliver`、`TryDeliverFrom`。
- 建筑工派工：`src/KM_BuildList.pas` 的 `TKMBuildList.UpdateState`、`TKMHouseList.BestBid`，常量 `BID_MODIF`、`MAX_WORKERS`。
- AI：`src/ai/KM_AIMayorBalance.pas` 的 `TKMayorBalance`（`Refresh`、`UpdateBalanceCore`、`UpdateBalanceMaterials`、`UpdateBalanceFood`、`AppendCore` 等）；`src/ai/KM_AIMayor.pas` 的 `TKMayor.UpdateState`、`CheckHouseCount`、`CheckWareFlow`、`GetMaxPlans`；选址 `src/ai/KM_AICityPlanner.pas` 的 `FindPlaceForHouse`、`NextToHouse`、`NextToTrees`、`NextToOre`；影响力 `src/ai/KM_AIInfluences.pas`；军队 `src/ai/KM_AIGeneral.pas`、`KM_AIDefensePos.pas`、`KM_AIAttacks.pas`。
- 编队：`src/units/KM_UnitGroups.pas` 的 `TKMUnitGroup`（`OrderWalk`、`HungarianReorderMembers`、`CheckForFight`、`Member_Died`）、`src/KM_Utils.pas` 的 `GetPositionInGroup2`、`src/KM_Hungarian.pas`。
- 以物易物定价：`src/houses/KM_HouseMarket.pas` 的 `RatioFrom`、`RatioTo`；`src/res/KM_ResWares.pas` 的 `CalculateCostsTable`、`MARKET_TRADEOFF_FACTOR`、`ProductionRate`。
- 确定性随机：`src/KM_Utils.pas` 的 `KaMRandom`（`CUSTOM_RANDOM = True`，Park-Miller 线性同余，联机各端一致）。

### 4.4 机制拆解

**数据模型**：每个 offer 是"某建筑的某种货，件数 `Count`、已被预约数 `BeingPerformed`"；每个 demand 是"一件货的需求"（`AddDemand` 按件数写多条），类型 `dtOnce`（普通，一次性）或 `dtAlways`（仓库、兵营的常驻需求，每建筑一条），重要度从低到高 `diNorm`、`diHigh4`（建材）、`diHigh3`（食物送酒馆）、`diHigh2`（给饥饿士兵送饭）、`diHigh1`（金币送学校）。

**需求从哪来**：建筑建成时按每个原料槽登记 `分配比例` 条 demand（`GetResDistribution`，默认 5，玩家可调）；每消耗一件原料补订一件；玩家调低比例时撤销尚未接单的 demand。产出、仓库入库都会登记 offer。

**出价 `CalculateBid`（越小越优）**：

```
目标是建筑：bid = 直线距离(offer 入口, demand 入口) + KaMRandom(15 - 3 * 分配比例)   // 比例越高扰动越小
目标是单位：bid = 直线距离(offer 入口, 单位位置)
稀缺均分：若目标建筑接单生产、offer.Count < 3、目标已有该货 < 2：bid = 10 + KaMRandom(25 - 分配比例)
有指定搬运工：bid += 直线距离(搬运工, offer 入口)
目标是工地：送石料 +0.1(等距时先送木料)；否则 bid += KaMRandom(5)
送仓库(需求为全部货)或从仓库取非军械：bid += 1000                  // 仓库永远是兜底
bid += 20 * 目标现有该货数(仓库与兵营除外)                           // 库存越多越不急
从仓库送兵营且兵营该军械已超 50：bid += 10000
给士兵送饭：bid += KaMRandom(5 + 100 / offer.Count)                   // 鼓励吃多样的、库存足的
```

比较规则：先按重要度严格优先，同重要度再比出价；平局时先遍历到的胜出（下标小者）。

**主循环 `TKMHandLogistics.UpdateState`**（`(tick + 玩家编号) mod 10 = 0`，约每秒一次，各玩家错开）：

```
D = 贪心估计还能配成的单数；S = 空闲搬运工数
若 D > S：以人为中心，每个空闲搬运工各自在全部合法组合里挑出价最优(含自己的距离)
否则：  以任务为中心，重复 D 次：在全部合法组合里按(重要度, 出价)挑最优，再派离 offer 最近的空闲搬运工
派单(AssignDelivery)：offer 与 demand 的 BeingPerformed 各 +1(预约)，生成搬运任务
```

**执行中的事件**：搬运工进入取货建筑、拿到货后先 `CheckForBetterDemand`，用同一个 offer 重新挑目的地，只有更重要或出价更低才改投（目标是单位时绝不改，玩家先下令送饭的那队要先吃到）；送达后 `GaveDemand`，并立刻在这座建筑里接下一单（`TryDeliverFrom`）。建筑被拆时只把有人在路上的条目软删除（`IsDeleted`），等预约全部释放后才真正关闭。

**建筑工派工**同构：`BestBid = 斜距 + 已派人数 * BID_MODIF(5)`，各建筑类型有人数上限 `MAX_WORKERS`；源码注释说匈牙利算法更好，但两边数量都大于 1 的情况少，所以用贪心。

**AI 建造（`TKMayorBalance`，约每 12 秒一次）**：把每条生产链写成"产量 - 消耗"的平衡表，产量用实测的每分钟产率表 `ProductionRate`；每次 `PickMin` 选最缺的一项，追加对应链条中最弱的环节，直到不缺；食物按"饱腹单位每分钟"换算（`BREAD_RESTORE = 0.4` 等）。建议队列逐条尝试落地（失败即丢弃），在建数上限 `GetMaxPlans = Ceil(工人数 / 4)`。仓库对中间品在已有消费建筑后拒收，以减少搬运工往返（`CheckWareFlow`）。

**AI 选址（`TKMCityPlanner`）**：以已有相关建筑为种子（面包房找磨坊、锯木厂找伐木场），在半径内泛洪找可建点，评分 `距离 - 影响力/5` 加随机噪声；伐木场按 7x7 网格数树选最密处；矿井要求矿脉在开采范围内。影响力图从每座建筑以 255 起泛洪、每格衰减 5，再减去敌方影响的一半。

**编队**：`Members[0]` 是旗手兼队长；格位由 `GetPositionInGroup2` 按每行人数与朝向算出，斜向拉伸 1.41；下令行军时队长不动，其余成员与格位用匈牙利算法匹配，代价取距离的平方（注释："20 人各走 1 步胜过 1 人走 10 步"）；队长阵亡时最近的成员接旗。

**上游新版物流（待核实）**：子任务通过网页摘要看到 reyandme 主仓库的 `KM_HandLogistics.pas` 增加了出价缓存（`TKMDeliveryRouteEvaluator`、`fBidsRoutesCache`，TTL 30 到 50）、"先用对角距离粗排、只对前 5 名且距离不超过 40 的候选真正寻路"（`BIDS_TO_COMPARE`、`BID_CALC_MAX_DIST_FOR_PATHF`）。这部分未在本地源码核对。

**以物易物定价**：价格不是手填，而是由生产时间的倒数推导，不可再生资源乘 1.25，再加上游原料价格（`CalculateCostsTable`）；兑换比 `RatioFrom = Round(CostTo / Min(CostFrom, CostTo))`，其中 `CostTo = 市场价 * MARKET_TRADEOFF_FACTOR(2.2)`，即同价值的货要用约 2.2 倍去换。

### 4.5 对《箱庭纪》的借鉴（分析）

- **offer 与 demand 两张表 + 预约计数 + 重要度分层的出价撮合**，是我们日结算物流最合适的复杂度：比 Widelands 少了路网与逐跳，多了"重要度"这一维（给饥饿士兵送饭、给工地送建材优先），正好对应城建 6.4"军需战时优先"。
- **出价里的"库存惩罚"与"仓库兜底 +1000"**：目标已有存货越多越不急；直接从生产者送到消费者，仓库只在无人需要时接收。这能减少无意义的往返，也是"仓储与运输"的自然规则。
- **原料分配比例**作为玩家与官员可调的委托参数：铁料稀缺时武器坊与甲坊均分，而不是近者独占（"稀缺均分"分支）。
- **产需平衡表加瓶颈环节**的 AI 建造法可解释，适合 AI 国家与官员的建造规划（大战略 3.2 第 4 步规划分解），也便于把理由写进月报。
- **以生产时间推导市场兑换比**，可作为我们"基准价值"（经济 1.3 物价锚）的校验工具：基准价应大致与生产成本（劳力日数加原料）一致，否则会出现套利（经济 5.5 制作与分解审计）。
- 不要学：随机扰动直接加在出价里，出价结果难以解释；我们若要打破平局，用稳定 id 即可。

### 4.6 许可与复用边界

代码 AGPL v3，只借方法；原版素材非自由且禁止商用，绝不可使用。

---

## 5. Simutrans（选读）

### 5.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-125`（原文标记新增；"交通模拟经营游戏，铁路、公路、水路与空运网络一体化规划"） |
| 仓库 | https://github.com/simutrans/simutrans |
| 固定提交 | `cbd2e2b5fcf046c13cff8df9403e9892b8ce0a14`（2026-11-14） |
| 代码许可 | Artistic License 1.0（`LICENSE.txt`，同时覆盖翻译、文档、图片、源码包内的 .dat、midi 与字体，M+ 字体 `m+10r.bdf` 除外；`README.md` 一致） |
| 素材许可 | 图形素材包（pakset）不在仓库内，各有独立许可（`README.md`、`readme.txt`），需逐个查 |
| 语言与规模 | C++，脚本层 Squirrel（`src/squirrel/`）；`src/simutrans/` 约 816 个文件，核心 `simhalt.cc` 约 3900 行、`simfab.cc` 约 3500 行 |
| 本地镜像 | `D:\hakoniwa_refs\simutrans`，已检出 `src/simutrans/` 根下的 .cc 与 .h、`builder/`、`dataobj/`、`world/`、`descriptor/*.h`，另用 `git show` 读了 `src/simutrans/vehicle/vehicle.cc` |
| 分级 | 选读 |

注意：标准版 Simutrans 里**没有** `path_explorer` 与 connexions 一类结构（全仓搜索为零），那是 Simutrans-Extended（另一个仓库）的路由系统；标准版由站点自己完成路由。

### 5.2 值得看的理由

Simutrans 的货包"带目的地"：乘客要去某栋楼、货要去某个工厂，网络必须把它送到；OpenTTD 的 cargodist 是"流量层面"的分配，Simutrans 是"每个货包自己找路"的分配，两者对照能帮我们决定贸易流做到哪一层。工厂供应链的"按需下单、产出轮转分发、满仓背压"也是城建生产链（城建 6.2）的参照。

### 5.3 源码导读与机制拆解

- **货包** `src/simutrans/simware.h` 的 `ware_t`：`target_halt`（终点站）、`via_halt`（下一个换乘站）、`target_pos`（目标坐标）、`to_factory`、`amount`、货种；`same_destination` 用于合并同目的地的包。
- **站点连接图** `src/simutrans/simhalt.cc` 的 `haltestelle_t::rebuild_connections`：遍历经过本站的线路与车队时刻表，从下一站绕一圈，权重从 `WEIGHT_WAIT`（8，换乘等待）起，每过一站 `WEIGHT_HALT`（1）；同一目的站保留最小权重。权重只数"上车次数与途经站数"，不含距离、班次与运力（源码可见）。换乘站判定：没有任何一条时刻表单独覆盖本站的全部前后邻站。之后 `rebuild_connected_components` 按货物类别求连通分量，用于剪枝。
- **寻路** `haltestelle_t::search_route`：只在换乘站展开的 Dijkstra，启发项 `WEIGHT_MIN = WEIGHT_WAIT + WEIGHT_HALT`；终点集合是覆盖目标格的站；起点与终点不在同一连通分量时剪掉；普通站不展开（不能在那里换乘）；受 `max_hops`（默认 2000）与 `max_transfers`（默认 9）限制；`no_routing_over_overcrowding` 打开时经过拥挤站的路径另作标记，全部候选都拥挤时返回 `ROUTE_OVERCROWDED`。结果只写"终点站 + 下一个换乘站"。
- **站内重路由** `search_route_resumable`：货包到达换乘站时从本站重新求下一跳，同起点同类别的连续调用复用上一次的搜索状态。
- **增量重算** `haltestelle_t::step_all`：时刻表或线路一改，世界的 `schedule_counter` 加一；每次世界步进给 1024 个"预算单位"，按站推进：先 `RECONNECTING`（重建连接，每站扣 `rebuild_connections()/256 + 2`），全部站完成后求连通分量，再 `REROUTING`（按等待货包数扣预算并重路由）。一轮结束才开始下一轮，避免永远停在重连。
- **装卸** `convoi_t::hat_gehalten` 与 `vehicle_t::load_cargo`、`haltestelle_t::fetch_goods`：按时刻表顺序列出本车后续停靠站，只装 `via_halt` 等于其中某站的包，近站优先；卸货时到终点或换乘站交给 `haltestelle_t::liefere_an`，到终点则送达（工厂或行人），否则重路由。
- **拥挤与无路**：`recalc_status`：客流 `pax_count > pax_capacity` 为拥挤，再超 200 为严重；货物按货种比较。乘客附近站全拥挤则不进网络并计入"不满意"；无路计入 `add_pax_no_route`；可步行到达计 `add_pax_walked`。标准版货包没有等待超时，只有重路由失败才丢弃。
- **收入** `ware_t::calc_revenue`：`kmh_base = 100 * 速度 / 平均速度 - 100`，`grundwert_bonus = 1000 + kmh_base * 速度奖励`，取 `货值 * max(基础, grundwert_bonus)`，再乘距离与件数。距离口径 `pay_for_total_distance` 可选按实际行驶、按向换乘站靠近、按向终点靠近。
- **工厂** `src/simutrans/simfab.cc` 的 `fabrik_t`：
  - 产量 `prodbase = 产能 + simrand(浮动)`，乘以 `get_prodfactor() = 256 + 电力加成 + 客流加成 + 邮件加成`（256 代表 1.0）。
  - 控制逻辑两套：经典模式按"产出仓剩余比例"缩放产量，消耗取"各输入最少库存"与产能的较小值；JIT2 模式用 `calculate_work_rate_ramp(存量, 下限, 上限)`：存量不超过下限时全速，之后线性降到最低约 5%（`WORK_SCALE_MINIMUM_FRACTION`），达到上限为 0。输出侧用 `ramp(存量, 2*最小发货量, 上限)`，需求侧用 `ramp(需求缓冲, 上限/2, 上限)`。
  - 下单：经典模式 `placing_orders = 存量 < 上限 且 在途 < 在途上限`（在途上限默认不限）；JIT2 模式每 tick 往 `demand_buffer` 累加需求，发货时扣减，`placing_orders = demand_buffer > 0`。上游用 `is_needed()` 读这个标志。
  - 分发 `verteile_waren`：每次发 `min_shipment` 件；用 `index_offset++` 轮转起点，把货均分给各下游；JIT 打开时只发给正在下单的下游，按起点站剩余容量比例排序，同等时比较已等待的同目的地货量；对排好序的候选逐个 `search_route`，取第一个可达者；站满时回收"我方等待最多的那个下游"的一半货重新分发，回收不成就本轮不发，产出仓涨高，产量下降，形成背压。
  - 扩张：活跃计数每溢出一轮，按概率加田或提高 `prodbase`。
- **产业链生成** `src/simutrans/builder/fabrikbauer.cc` 的 `factory_builder_t::build_link`、`build_chain_link`：建一个消费者就为它的每种原料找已有供应商（距离 6 到 40、剩余产能为正则直接连，否则按概率"抢"一个），不够就在半径内新建供应商并递归；城镇人口按 2000 的倍数增长时触发 `increase_industry_density`，在电力供需比与终端消费者之间选择补建。
- **城镇客流目的地** `src/simutrans/world/simcity.cc` 的 `stadt_t::find_destination`：按通勤（去工厂，`factory_worker_percentage` 默认 33）、旅游（`tourist_percentage` 默认 16）、其余去别的城市三选一；城市按 `weight_by_distance(人口+1, 距离)` 加权（`dataobj/koord.h`：`1 + ((value<<8) * locality_factor) / (locality_factor + max(distance,4))`），再在目标城按建筑权重随机取点。

### 5.4 对《箱庭纪》的借鉴（分析）

- **"终点 + 下一跳、到站重算"**：商队与货物只记最终市场和下一个中转城，到中转城再按当时的路况（战争封锁、魔物、关卡）重新选路。这让大战略的封锁与禁运（第 6.2 节）能自然改道，而不用为每批货存整条路线。
- **连接图权重只算换乘次数**是 Simutrans 的弱点（对运力与班次不敏感）；我们的商路边应带天数、运力与风险，权重用"时间 + 风险溢价"。
- **增量重算 + 每步预算**：路网变化时分摊多日完成重算，适合我们季度以下频率的商路重规划。
- **JIT2 的需求缓冲与工作率斜坡**：生产建筑的产量随"产出仓存量"与"下游需求缓冲"线性下降，比"满仓就停"更平滑，可作为城建生产的可选模式；与 Widelands 的经济目标是同一思想的两种写法。
- **站满回收一半重发**、**无路即丢弃**的规则在我们这里要改成"退回仓库"或"转卖当地"，不允许货物凭空消失（经济 0.2 第 3 条、5.5 负余额与无限库存审计）。

### 5.5 许可与复用边界

Artistic License 1.0 比 GPL 宽松，原则上可借代码，须随附许可并遵守其关于修改版命名与说明的条款（具体条款待逐条核对）；素材包许可各异，不使用。本作是 TypeScript 重写，实际只借方法。

---

## 6. Mindustry（选读）

### 6.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-140`（"开源沙盒塔防游戏"；原文建议关注"生产效率与防守压力如何相互影响"） |
| 仓库 | https://github.com/Anuken/Mindustry |
| 固定提交 | `1a22b880576d2f8f97550280f76bfdd0d0069543`（2026-11-04） |
| 代码许可 | GPL v3（根目录 `LICENSE`） |
| 素材许可 | 仓库没有单独的素材许可声明（`README.md` 未提，`git ls-tree` 只找到根目录 `LICENSE`），`core/assets` 是否同为 GPL v3 待核实 |
| 语言与规模 | Java；`core/src/mindustry` 约 823 个文件；`Conveyor.java` 约 490 行，`PowerGraph.java` 约 390 行，`Waves.java` 约 450 行，`BuildingComp.java` 约 2300 行 |
| 本地镜像 | `D:\hakoniwa_refs\mindustry`，已检出 `core/src/mindustry/` 下的 `world/blocks/{distribution,power,storage,defense/turrets,production}/`、`world/consumers/`、`world/meta/`、`world/modules/`、`game/`、`ai/`、`entities/comp/`、`entities/units/` 与若干单文件（`core/Logic.java`、`content/Blocks.java`、`world/Block.java` 等） |
| 分级 | 选读 |

### 6.2 值得看的理由

- **城建 10.2 魔物袭击与生产的互相牵制**：Mindustry 的波次防守与生产共用同一张电网、同一条传送带、同一套"效率"模型，防守压力会自然传导到产量，产量不足又直接削弱防守。这正是索引原文建议关注的"生产效率与防守压力如何相互影响"。
- **城建 6.4 的对照组**：它是"推送式、无全局路由"的物流，与 Widelands、KaM 的"请求式撮合"正好相反，适合判断我们哪一层该用哪种。
- **统一效率模型**：所有消耗器取最小满足率作为建筑效率，可借作城建的多资源效率计算。

### 6.3 源码导读

- 传送带：`core/src/mindustry/world/blocks/distribution/Conveyor.java` 的 `ConveyorBuild`（`updateTile`、`pass`、`acceptItem`、`handleItem`），数值在 `core/src/mindustry/content/Blocks.java`（`conveyor`、`titaniumConveyor` 等）。
- 分流与跨越：同目录的 `Router.java`、`Sorter.java`、`OverflowGate.java`、`Junction.java`、`ItemBridge.java`；拉取式例外 `world/blocks/storage/Unloader.java`。
- 推送原语：`entities/comp/BuildingComp.java` 的 `dump`、`offload`、`put`、默认 `acceptItem` 与 `handleItem`、邻接表 `proximity`。
- 电网：`world/blocks/power/PowerGraph.java` 的 `update`、`getPowerProduced`、`getPowerNeeded`、`useBatteries`、`chargeBatteries`、`distributePower`、`getSatisfaction`、`addGraph`、`remove`、`reflow`；`entities/comp/PowerGraphUpdaterComp.java`（每张图一个更新实体）；`world/modules/PowerModule.java`；`PowerNode.java`、`PowerDiode.java`。
- 效率：`world/consumers/ConsumePower.java` 的 `requestedPower`、`efficiency`；`BuildingComp` 的 `updateConsumption`、`efficiency`、`edelta`、`shouldConsume`；生产 `world/blocks/production/GenericCrafter.java`、`Drill.java`。
- 波次：`game/SpawnGroup.java` 的 `getSpawned`、`getShield`；`game/Waves.java` 的 `get`、`generate`；`ai/WaveSpawner.java`；`core/Logic.java` 的 `runWave`、`isWaitingWave`；`game/Rules.java`（`waveSpacing`、`waitEnemies`、`randomWaveAI`）；`game/Difficulty.java`。
- 敌人选目标：`entities/TargetPriority.java`、`world/meta/BlockFlag.java`、`ai/BlockIndexer.java` 的 `findEnemyTile`、`ai/types/GroundAI.java`、`ai/types/FlyingAI.java`、`ai/Pathfinder.java`。
- 炮塔：`world/blocks/defense/turrets/Turret.java` 的 `shouldConsume`、`hasAmmo`、`updateReload`；`ReloadTurret.java` 的 `baseReloadSpeed`；`ItemTurret.java`、`PowerTurret.java`。
- 核心与发射：`world/blocks/storage/CoreBlock.java`（同队核心共享库存，满仓焚毁）、`world/blocks/campaign/LaunchPad.java`（跨地图出口）。

### 6.4 机制拆解

- **推送式传送带**（`world/blocks/distribution/Conveyor.java` 的 `ConveyorBuild`）：每格最多 3 件（`capacity = 3`），件间距 `itemSpace = 0.4`；每 tick 前进 `speed * edelta()`，到格末调用下游的 `acceptItem`，接受则 `handleItem` 交出，不接受就堵住（`clogHeat` 上升）。物品**不带目的地**，分流全靠局部规则方块：`Router` 轮询邻居、`Sorter` 按货种、`OverflowGate` 前方不收才转向。所以 Mindustry 没有任何全局路由，路线是玩家用方块"摆"出来的。
- **背压链**：下游不收，传送带堵；上游输出仓满，`GenericCrafter.shouldConsume()` 返回 false；建筑 `efficiency = 0`，不消耗原料，也不再向电网要电。
- **电网**（`world/blocks/power/PowerGraph.java`）：相连的发电、耗电、电池组成一张图，每帧：

```
needed   = Σ 耗电者(仅 shouldConsumePower) 请求功率 * delta
produced = Σ 发电者 发电量 * delta
needed > produced：从电池等比例放电补足
produced > needed：多余部分按缺口等比例给电池充电
coverage = (needed == 0 且 produced == 0 且未充电且无储电) ? 0
         : needed == 0 ? 1 : min(1, produced / needed)
每个耗电者 power.status = coverage
```

  建筑的 `efficiency = min(全部必需消耗器的效率)`，电力消耗器的效率就是 `power.status`；所有进度用 `edelta() = efficiency * delta()` 推进，缺电时整条产线与炮塔线性变慢。图的合并总是"小图并入大图"，拆除时从邻居做 BFS 重建子图，并立即结算一次让孤立的耗电者断电。
- **波次**（`game/SpawnGroup.java`、`game/Waves.java`、`core/Logic.java`）：默认间隔 `waveSpacing = 2 分钟`；每组敌人的数量 `min(unitAmount + ((wave - begin) / spacing) / unitScaling, max)`，护盾 `max(shields + shieldScaling * (wave - begin), 0)`；`waitEnemies` 打开时场上还有敌人就暂停倒计时；战役难度对敌人血量、数量、波次间隔分别给倍率（如 hard 为 1.25、1.5、0.8）。程序化生成 `Waves.generate` 按难度叠加多条进程、定期插入首领波。
- **敌人选目标**（`entities/TargetPriority.java`、`ai/BlockIndexer.java`）：优先级 墙 -3、地下 -2、运输 -1、普通 0、炮塔 1、核心 2，高优先级"不论距离"先打；传送带被设为运输优先级（-1），炮塔为 1。地面单位沿流场走向核心；`randomWaveAI` 打开时空军会随机挑仓库、发电、工厂、电池、钻机等"正在工作的"建筑作目标。
- **生产与防守的耦合**：炮塔与产线共享同一张电网与同一套效率模型；`Turret.shouldConsume()` 只在射击或装填时要电，平时让出电力；电炮塔的装填速度就是电网覆盖率，弹药炮塔的效率是"弹药是否够一发"，弹药靠传送带推进来，与产线争抢运力。

### 6.5 对《箱庭纪》的借鉴（分析）

- **"满足率"统一效率模型**：一个聚落的关键资源（粮、柴、劳力、门息）各算一个"覆盖率 = min(1, 供给/需求)"，建筑效率取其必需项的最小值，所有产出乘效率。这比逐项写"缺什么扣多少"更统一，也让"魔物来袭时民兵抽走劳力，产线变慢"自然发生（城建 10.2）。
- **防守在平时让出资源**：守军只在战时消耗军需与劳力的高档配额，平时降为维持档，这能让"常备军是最大回收口"（经济 6.2）与"战时军需优先"（城建 6.4）同时成立。
- **敌人优先级**：魔物袭击优先冲击运输线与仓库（而不是城墙），会逼玩家保护商路与驿站，和经济 3.4 商队风险呼应；但必须给预兆与可读的目标规则（城建 10.1 女神降灾需显性或半显性）。
- **推送式无全局路由**适合门内庭院这类小规模、玩家亲手摆设的空间；聚落与区域层不要用，否则玩家要亲手铺每条路线，违背委托与自治的方向。

### 6.6 许可与复用边界

GPL v3：只借方法；素材许可未声明，不使用。

---

## 7. Stone Kingdoms（选读）

### 7.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-169`（"基于初代《要塞》系列的实时策略游戏"） |
| 仓库 | https://gitlab.com/stone-kingdoms/stone-kingdoms |
| 固定提交 | `429d7a33b6c58c7eaa21e5310f75ebbf61463554`（2025-11-11；`CHANGELOG.md` 最新为 0.6.1） |
| 代码许可 | Apache License 2.0（`LICENSE`，"Copyright 2018 KayleMaster"；`README.md` 写 "See LICENSE.md"，实际文件名是 `LICENSE`） |
| 素材许可 | 非自由：`README.md` 与 `ATTRIBUTION.md` 写明游戏内美术、音效、语音与原版配乐属于 Firefly Studios（Stronghold 2001）；扩展配乐来自 Alexander Nakarada、Kevin MacLeod、Random Mind（许可见 `/sounds/music`）；界面图标来自 Flaticon/Freepik，需署名 |
| 语言与规模 | Lua，运行于 LOVE2D（`conf.lua` 为 11.5）；`objects/Controllers/` 约 4900 行，`objects/Structures/` 约 1.7 万行 |
| 本地镜像 | `D:\hakoniwa_refs\stone_kingdoms`，已检出 `objects/`、`states/`、`spec/`、`terrain/` |
| 分级 | 选读 |

### 7.2 值得看的理由

- **城建人口池的幸福与迁入**：《要塞》式"人气"把税、口粮、娱乐、宗教、环境各变成一个整数分，再由人气驱动迁入与迁出，是最直白的分项幸福模型，可与 7KAA 的目标忠诚对照。
- **经济 6.1 税与幸福的取舍**：每档税同时给出人气代价与收入系数。
- **城建第 9 节常设命令的参照**："粮仓低于 15 天自动减酒"一类命令对应它的口粮档位与粮仓机制。
- **反例价值**：变步长、非确定性、人口变化绑在动画帧上，正好说明我们为什么坚持固定步长内核。

### 7.3 源码导读

- 人气：`objects/Controllers/PopularityController.lua` 的 `update`、`calculatePositiveBuildingPopularity`、`POPULARITY_INTERVAL`、`speedPopModifier`。
- 口粮与食物多样性：`objects/Controllers/RationController.lua` 的 `RATION_LEVELS`、`MOOD_LEVELS`、`FOOD_DIVERSITY`、`getMoodLevel`、`update`；粮仓 `objects/Controllers/FoodController.lua`（`foodsConsumed`、`take`）、`objects/Structures/Granary.lua`（`store`、`take`、`maxQuantity`）；食物枚举 `objects/Enums/Food.lua`。
- 税：`objects/Controllers/TaxController.lua`（`TAX_LEVELS`、`TAX_INTERVAL`、`getWorkers`、自动税）；人气与金币系数实际写在界面模块 `states/ui/keep/keep_tax.lua` 的 `moodMapping`、`goldFactorMapping`。
- 酒：`objects/Controllers/AleController.lua`（`COVERED_POPULATION_PER_INN`、`getAleCoverageStats`）、`objects/Structures/Inn.lua`、`objects/Units/Innkeeper.lua`。
- 宗教：`objects/Controllers/ReligionController.lua`（`BLESSING_DURATION`、`getCoverageStats`）、`objects/Units/Priest.lua`。
- 正面建筑：`objects/Controllers/BuildingManager.lua` 的 `getCountOfPositiveBuildings`。
- 迁入迁出：`objects/Structures/Campfire.lua` 的 `immigrantCallback`、`emigrantCallback`、`makePeasantLeave`、住房上限处理函数。
- 初值与更新顺序：`objects/State.lua`；`states/game.lua` 的 update。
- 市场：`objects/Enums/goodsPrices.lua`、`states/ui/market/market_trade.lua`。

### 7.4 机制拆解

- **人气主循环**（`objects/Controllers/PopularityController.lua` 的 `update`）：每 `POPULARITY_INTERVAL = 3` 秒（游戏时间，受倍速影响）把 `税 + 口粮 + 正面建筑 + 酒 + 宗教` 全额加到人气上并夹到 0 到 100；初值 50（`objects/State.lua`）。
- **各项分值**：

| 项 | 规则（出处） |
| --- | --- |
| 税 | 十档：重贿 +7、大贿 +5、小贿 +3、免税 0、低税 -2、中税 -4、高税 -6、重税 -8、苛税 -12、暴税 -16；对应金币系数 -1.0 到 1.6（`states/ui/keep/keep_tax.lua` 的 `moodMapping`、`goldFactorMapping`）；每 30 秒按 `在岗人口 * 系数` 收金（`TaxController`），贿赂付不起时自动切回免税 |
| 口粮 | 无粮 -8、少 -4、正常 0、多 +4、大份 +8，再加食物多样性 `FOOD_DIVERSITY = {0, 0, 1, 3, 5}`（0 到 4 种食物）；"多样性"实际统计的是粮仓里当前非空的种类数（`RationController`，源码 TODO 也承认命名有误） |
| 正面建筑 | `clamp(花园与五月柱数 - abs(ceil(人口/16) - 1), 0, 5)`：每多 16 人就要多一座才能维持 |
| 酒 | 覆盖率 `min(1, 活跃酒馆数 * 30 / 人口)`，达到 25%、50%、75%、100% 分别 +1 到 +4（`AleController`） |
| 宗教 | 覆盖率 = 150 秒内被牧师祝福过的建筑占比，分档同酒（`ReligionController`） |
| 恐惧、拥挤、疾病 | 不存在（只有精灵坐标名，没有建筑类） |

- **人气如何变成人口**（`objects/Structures/Campfire.lua`）：营火上方浮标动画有 51 帧，每帧时长 `speedPopModifier`，每播完一圈来一个人（人气 >= 50）或走一个人（< 50）。`speedPopModifier`：人气 >= 50 时 `((100 - x)/25)^3 * 0.08 + 0.09`，< 50 时 `(x/50) * (x/10) * 0.08 + 0.1`。子任务据此推算：人气 100 约 4.6 秒来一人，60 约 21 秒，50 约 37 秒；49 约 25 秒走一人，0 约 5 秒。住房上限 `5 + 4*房 + 8*公寓 + 12*住宅 + 16*大宅`，营火边闲置农民上限 20。
- **口粮消耗**（`RationController`）：`timer += dt * 人口 * 系数 * 口粮档(0, 0.5, 1, 1.5, 2)`，满 100 吃一份食物（溢出丢弃）；在有库存的食物种类间轮转。粮仓 9 个堆位，每堆一种食物、上限不同（苹果 8、面包 32、奶酪与肉 16）。
- **市场**：固定价格表（`objects/Enums/goodsPrices.lua`，食物各 8、木 4、石 14、铁 45 等），买入按价、卖出半价，即时成交，没有供需。
- **确定性**：变步长（`love.timer.getDelta()` 乘倍速）、用 `math.random`、依赖 `pairs()` 遍历顺序，**不是确定性模拟**；人口变化甚至绑在动画帧时长上。`spec/` 里没有人气、口粮、税的测试。

### 7.5 对《箱庭纪》的借鉴（分析）

- **"各项分值线性相加"的结构**直观易读：税、口粮档位、食物多样性、娱乐覆盖率、宗教覆盖率各给一个整数分。可作为城建人口池"幸福"的分项展示形式（每项附来源），与 7KAA 的目标忠诚公式结构一致。
- **覆盖率分档**（25%、50%、75%、100% 对应 1 到 4 分）比连续公式更好读，适合玩家界面；内核可以用连续值，展示用分档。
- **税档与金币系数成对**：每一档同时写明人气代价与收入系数，正是经济 6.1"让加税成为看得见的取舍"的最简形式；我们的设计里有拉弗曲线（同在经济 6.1，代码尚未实现，税收目前是线性），界面可以借这种成对展示。
- **反例**：3 秒全额加一次分值，人气几秒内就撞到 0 或 100；我们目前只有自治度做了"目标值 + 每日 ±1"（`stepLedger`，城建 8.2 的惯性），幸福仍是每日按因子和直接重算，应补上同样的有限步长。人口迁移不要绑在动画或帧率上，必须在固定步长内核里结算。

### 7.6 许可与复用边界

代码 Apache 2.0：可借代码，须随附许可与版权声明并注明修改；但本作是 TypeScript 重写，只借方法。素材属于 Firefly Studios，绝不可使用。

---

## 8. 跨项目结论（分析）

1. **物流按三层做，每层都有现成样本**：聚落内用"请求与供给撮合"（Widelands `Economy::balance`、KaM `TKMDeliveries`），按日抽象而不逐件模拟；区域之间用"链路图 + 价差驱动的需求 + 容量约束流"（OpenTTD cargodist 的结构，需求改为价差驱动；Simutrans 的"终点 + 下一跳"让封锁时自然改道）；国家之间用"条约闸门 + 进口付款给出口国"（7KAA `trade_treaty`、`import_goods`）与"按批次履约的协定"（Widelands `TradeInstance`）。三层都满足"货有来处去处、钱有去向"，直接产出经济 5.1 的四张表。
2. **撮合规则的通用配方**：重要度严格分层，层内按代价（距离或时间）排序，用稳定 id 或自增序号决胜，用预约计数防止重复分配，允许中途改投但设最小节省门槛（Widelands `check_imports`、KaM `CheckForBetterDemand`）。先算全部分配再执行。这套配方同样适用于商队调度与军需补给。
3. **委托就是"调目标与优先级"，不是排产**：Widelands 的经济目标、KaM 的原料分配比例、Simutrans JIT2 的需求缓冲是同一思想。玩家、官员与 AI 统治者只改目标数与优先级（P2 受控写入），内核决定生产；跳过要有冷却与统计，便于月报与自治度计算（城建 8、9）。
4. **所有"软数值"都用"目标值 + 有限步长趋近"**：7KAA 的忠诚与抵抗（按差值的 1/30、设最小步长）、OpenTTD 的车站评分（每次 ±2）、我们已有的 `driftMarket`（每日 5%）。Stone Kingdoms 是反例（3 秒全额加到撞边界）。忠诚、好感、当局评分、服务评分统一采用这一模式，并把目标值的分项作为"带来源的条目"展示。
5. **竞争落在服务评分与份额上，不落在"改价"上**：OpenTTD 按评分把产地货量分给各家车站，Simutrans 站满即背压，7KAA 城镇优先买本国市场。门扉商会与金冠商行的竞争应体现为评分、份额、当局评分与专营权，与经济 0.2 第 2 条和注册修正项合同第 7 节一致。
6. **谍报与忠诚是同一套数**：7KAA 的煽动直接作用于忠诚与抵抗，贿赂成功率由"技能 - 忠诚 - 统率 + 声望 + 金额 + 同族"并对高忠诚分段惩罚，反谍是"本国间谍技能之和"对"逃脱基数"。我们照搬判定结构，但结果写入知识层与事件流，伪造只改"别人以为的事"，随机走按系统命名的随机流（大战略 6.3、6.5）。
7. **给大模型统治者的动作菜单，工程上学 OpenTTD 脚本 API**：同一命令通道、按身份分级的接口（统治者与女神分开）、只给"此刻合法"的动作与前置条件、试算模式、枚举错误码回喂、每主体配额与挂起、事件进出、玩家文本 key 化。我们的 `AiRequestSpec`（`allowed`、`fallback`、`deadlineTicks`、`revision`）已是骨架，缺"试算"与"细粒度命令加前置条件说明"。
8. **规则 AI 兜底要可解释**：7KAA 的 `consider_*` 返回"评分减接受线"、KaM 的"产需平衡表加瓶颈环节"可以直接把理由写进调试视图与国书；Widelands 的遗传式神经元调参不可解释，不采用。人格参数移动接受线与重试间隔，但人格本身由人设卡给出，不靠随机数。
9. **确定性的工程细节**：错峰调度（7KAA `game_date % N == id % N`，KaM `(tick + 玩家) mod 10`）、显式平局键（Widelands `pairid`）、异步计算在快照上进行并在固定日期合并（OpenTTD，算不完宁可暂停）、禁止变步长与哈希遍历顺序（Stone Kingdoms 反例）。
10. **压力要随规模上升但留宽限，AI 不得针对玩家**：7KAA 怪物攻击 3 年宽限、随巢穴数分段上升；OpenTTD 补贴把玩家引向被忽视的地方；Mindustry 生产与防守共享同一张电网与运输线，压力自然传导到经济。反面教材是 7KAA `think_unite_against_big_enemy` 只针对人类玩家，我们的联合对抗只看公开的实力与威胁。

---

## 9. 未能获取或略过

| 对象 | 状态 | 说明 |
| --- | --- | --- |
| 7 个指定项目 | 全部获取成功 | 一次克隆成功，无需重试 |
| KaM Remake 主开发仓库 `reyandme/kam_remake` | 略过（只看了网页） | 本地是 `Kromster80` 的旧快照；新版物流缓存与 `src/ai/newAI/` 的城市规划器（如 `KM_CityPlanner`、`KM_CityBuilder`、`KM_Eye`）未在本地核对，待核实 |
| Simutrans-Extended | 略过 | 带旅行时间路由与 `path_explorer` 的分支在另一仓库，标准版没有 |
| 7KAA SourceForge 主站 | 略过 | GitHub 镜像最后提交 2023-09-22，主站可能有更新 |
| Widelands 其他部族数据（atlanteans、empire、frisians、amazons）与 `data/ai/` 调参文件 | 略过 | 只读了 barbarians 作为样本 |
| Widelands `MAX_RADIUS` 定义处 | 未找到 | 影响力公式中的常量值待核实 |
| OpenTTD 基础素材集（OpenGFX 等） | 略过 | 素材许可另查 |
| Mindustry 素材许可 | 无声明 | 仓库只有根目录 GPL v3，素材是否同许可待核实 |
| 7KAA 破坏值如何折减产能、征税累积惩罚的回落速率 | 未追到 | 待核实 |
