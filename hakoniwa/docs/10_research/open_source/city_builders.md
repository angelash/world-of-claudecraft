# 开源源码调研：城建与人口模拟

> 所属目录：`docs/10_research/open_source/`。性质：调研归档，只记录事实、分析与可借鉴点，不做最终设计决定，
> 不具约束力（正典优先级第 6 级，见 `hakoniwa/CLAUDE.md`）。调研日期：2026-11-15。
> 来源索引（只读）：`F:\workspace\open-share\10_md\_external\2026\external-2026-开源游戏源码大全-玩法与引擎索引.md`，
> 条目锚点如 `#native-139`。该索引状态为 indexed-unverified，本文的仓库地址、许可、提交与描述都已到仓库本身核实。
> 本地镜像：`D:\hakoniwa_refs\<id>`，部分克隆（`--filter=blob:none --sparse`），只物化代码与数据目录，未拉美术音频；
> 下载的仓库按不受信任数据处理，只读文件，未运行其中任何脚本、构建或解释器。
> 前置：概念层速查见 [`city_rts_slg.md`](../open_share/city_rts_slg.md) 第 7.1 节，本文不重复其内容，只往源码里深挖；
> 对应设计见 [`city_building.md`](../../40_design/systems/city_building.md)、
> [`economy_and_trade.md`](../../40_design/systems/economy_and_trade.md) 第 6 节、[`goddess_gm.md`](../../40_design/systems/goddess_gm.md)。
> 标注约定：源码事实不加标；"分析"表示对《箱庭纪》的推演；"待核实"表示没读透或属推断。
> 源码引用一律写"仓库内相对路径 + 符号名（类、函数、常量）"，不写行号；固定提交写在各项目信息表里。
> 分工：本文只写城建与人口模拟。经济物流型 RTS、即时战术 RTS、SLG/4X、殖民与基地经营由同目录的其他调研负责，本文不涉及那些项目。

---

## 0. 总览

### 0.1 项目清单与分级

| id                 | 项目                           | 索引锚点     | 分级 | 代码许可                      | 主要看什么                                                     | 对应本作                                                                                 |
| ------------------ | ------------------------------ | ------------ | ---- | ----------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `micropolis`       | Micropolis（MicropolisCore）   | `#native-139` | 必读 | GPL-3.0-or-later 加 EA 附加条款 | RCI 需求阀、场图与平滑、交通出行、电网洪泛、预算拨款、评估民调、灾害 | 3.5 拥堵、3.6 覆盖与邻接、5.6 迁移、6.1 灵素供能、8.7 可读性、10 事件、12 澱的扩散     |
| `micropolis_js`    | micropolisJS                   | 非索引补充   | 必读 | GPL-3.0 加同样附加条款        | 同上算法的 JS/TS 移植，模块化与已修正的缺陷                    | 与我们 TS 内核的结构对照                                                                 |
| `julius`           | Julius（《凯撒 III》重实现）   | 非索引补充   | 必读 | AGPL-3.0                      | 游走者覆盖、住房进化与退化、推车工物流、劳力分类优先级、情绪迁移、风险时钟、诸神 | 3.6 覆盖、5.4 需求层级、5.5 幸福治安、5.6 迁移、6.3 劳力、6.4 仓储运输、9 委托、10 事件、女神 GM |
| `caesaria`         | Caesaria（CaesarIA）           | `#native-129` | 必读（工程组织部分） | GPL-3.0-or-later              | 城市服务注册表、数据驱动的 `.model`、按需求选路的服务者、招工者、诸神类层级 | 系统注册与内容数据化的工程做法                                                           |
| `lincity_ng`       | Lincity-NG                     | `#native-126` | 必读 | GPL-2.0-or-later              | 商品沿路网的液位均衡流动、市场枢纽、人口池与棚户、可持续性检验、技术等级衰减、污染扩散 | 6.4 仓储运输、5.2 难民、8.2 自持记录、12 澱                                             |
| `unknown_horizons` | Unknown Horizons               | `#native-163` | 必读 | GPL-2.0-or-later              | 居民等级需求、幸福即资源、税与幸福、YAML 生产链、收集者物流、AI 目标调度、自由商船 | 5.4 需求层级、6.2 生产链审计、6.4 搬运、经济 6.1 税、AI 工务官                           |
| `openrct2`         | OpenRCT2                       | `#native-155` | 选读 | GPL-3.0                       | 游客"想法"、幸福目标值、公园评分、员工巡逻区                   | 8.7 可读性、请示合并、按区授权                                                           |
| `corsixth`         | CorsixTH                       | `#native-131` | 选读 | MIT（已核实）                 | 房间蓝图分阶段校验、周界连通检查、物件占地与操作位、排队优先级、声望账 | 3.4 摆放校验、风评、常设命令                                                             |
| `3d_city`          | 3d.city                        | `#web-088`   | 略过 | GitHub 报 NOASSERTION（待核实） | 未克隆                                                         | 无                                                                                       |

阅读建议：只有半天时间的实现者，先读第 0.3 节（我们差在哪）、第 2 节（Julius，信息密度最高）、第 8 节（跨项目结论），
再按要动的模块回到对应项目。

### 0.2 一页结论（细节见第 8 节，均为分析）

1. 城建的手感来自**逐栋建筑的分级状态加滞回**（Julius 住房 20 级进化、Unknown Horizons 六个居民等级），聚落级指标应当从逐栋状态汇总，而不是像我们现在这样直接按聚落整体判定（生存层是缺粮、住房、治安三项比值的均值，上三层各取四项全聚落布尔条件的满足比例）。
2. "覆盖"最稳的实现是**带衰减的计数器**：服务到达一次就把计数器拉满，每天减一，减到零就失去覆盖（Julius `MAX_COVERAGE` 为 96 天）；到达方式可以不用逐帧游走者，改成拓扑分钟数可达集。
3. 需求不要做成瞬时阈值，要做成**积分阀**（Micropolis `setValves`）：供需失衡累积成一个有界的阀值，再由阀值加局部评价决定每块地的增减。
4. 劳力分配的现成委托样本是 **Julius 的九类劳力加玩家优先级加默认轮询权重**，正好对应本作"工头或部门官可以设优先级"。
5. 物流有两种成熟做法：**目的地优先级加车次**（Julius 推车工）适合可见的运输；**液位均衡流**（Lincity-NG `Construction::trade`）适合 L4 批量搬运，计算便宜且天然产生拥堵读数。
6. 每一个坏结果都要有"计数器或原因码"：Julius 的火险与损坏风险时钟、进化说明文字、`low_mood_cause`，Micropolis 的十大问题民调，OpenRCT2 的想法汇总，都是现成的可读性模式。
7. 《凯撒 III》诸神是"覆盖率加节庆加相对冷落"的公式神，带惯性、怒气积累与节庆宽限期；本作的 AI 女神可以把这套公式当作内核底座，AI 只决定在已注册的动作里花掉哪一份怒气或恩宠。
8. 移植时只借方法：上述项目多数是 GPL/AGPL；且 Micropolis、micropolisJS、Lincity-NG、Caesaria 的随机数都不可回放，必须改用我们按系统命名的随机流。

### 0.3 基线：我们现在怎么做、差在哪

以下是 `hakoniwa/src/systems/city/` 第一轮实现的事实摘要（按文件与符号），以及本文各项目能补的缺口。

| 模块 | 现状（源码事实） | 主要缺口（分析） | 参考 |
| --- | --- | --- | --- |
| 日结管线 `daily.ts` | 每聚落每游戏日依次跑建造、生产、腐坏、粮食与人口、财政、净澱井、事件、自治度，周期性跑官员轮次 | 全部挤在日结一个时点；没有"相位表"把重计算摊到多个 tick | Micropolis 16 相位、Julius 50 槽 tick 表 |
| 摆放校验 `placement.ts` | `previewPlacement` 返回机器码加中文原因加证据格；`reachable` 做 BFS；`keep_reach` 用放置前后两张全图可达图比较；`findSpot` 按行扫描，放置前的可达图每次搜索只算一次，每个通过前置校验的候选格再算一次放置后的可达图 | 设计第 3.4 节的 `slot`、`defense`、`taboo` 三个码尚未实现（`PlacementCode` 中没有，建筑数据也还没有操作位锚点、城墙线与逐地段澱值）；候选格仍各做一次全图 BFS，地块变大、空地少时可再换成周界连通检查 | CorsixTH 周界连通检查与物件占地标志 |
| 人口 `population.ts` `runPopulation` | 三个人口组（难民、遗民、移民）计数；需求四层都按聚落整体判定：生存层是缺粮、住房、治安三项比值的均值（连续值），上三层各取四项全聚落布尔条件（有没有某建筑、库存有没有某物、治安阈值、政策）的满足比例，下层不低于 0.75 才计上层；幸福因子账本；吸引力公式加每日 1% 上限迁入 | 没有逐栋住房状态；服务没有空间覆盖（`common.ts` `sumEffect` 是全聚落求和）；迁移是阈值加随机，没有积分阀 | Julius 住房进化、UH 等级需求、Micropolis 阀 |
| 生产 `production.ts` `runProduction` | 按建筑列表顺序贪心填岗；`foodFirst` 政策把粮食建筑排前；产出汇总后过注册修正项；按剩余库容给每栋建筑算预计净入库量，放不下的建筑不开工（不扣原料），放得下一部分的按比例减产，仍溢出的产出留在进位缓冲里次日入库，不会丢弃 | 除 `foodFirst` 政策的"粮食建筑优先"这一档外，没有劳力分类与逐类优先级；没有"劳力可达性"；产出与距离、搬运无关 | Julius `city/labor.c`、Lincity 流动 |
| 仓储 `common.ts` `storageCap` | 每聚落一个总库存加总容量；粮仓给聚落总容量加 1000，并把粮食腐坏减半（草药除外），不单独存货 | 库存不分仓、不分位置，搬运时间不计入周期（设计第 6.4 节要求计入） | Julius 推车工、Lincity 液位流、UH 收集者 |
| 财政 `production.ts` `runFinances` | 人头税；维护费按宽限、降效、停工三段 | 没有按领域的预算与拨款比例对服务强度的影响 | Micropolis `collectTax` 与 `updateFundEffects` |
| 事件 `events.ts` `runEvents` | 火灾、瘟疫、兽袭每日掷骰；严重事件并发不超过 2 件、间隔不少于 7 天 | 火灾是每日按概率掷骰：概率随木质建筑数、`fireRisk` 效果与有无卫兵所变化（封顶 0.08），治安不低于 50 时损失减半；没有逐栋可读的风险累积，也没有"巡视清零"的反制 | Julius 火险时钟、Micropolis 消防覆盖 |
| 官员 `officials.ts` `utilityAction` | 每个领域一组 if 规则，挑一个动作 | 领域之间没有统一排序与资源互斥；每位主官每周只执行一个动作、一次最多放一栋，但不看是否已有在建工程，也没有全聚落的建设队列与节奏控制 | UH AI 目标调度 |
| 自治度 `autonomy.ts` | 五分项加依赖，日变化限幅 | 自持记录 S 只来自事件考验，缺"连续若干期自给"的检验 | Lincity 可持续性检验 |

---

## 1. Micropolis（含 micropolisJS）

### 1.1 信息表

| 项 | Micropolis | micropolisJS |
| --- | --- | --- |
| 索引条目 | `#native-139` | 非索引补充 |
| 仓库 | https://github.com/SimHacker/micropolis | https://github.com/graememcc/micropolisJS |
| 固定提交与日期 | `c98f6b08519887b450d9be198bfca5237aab6d0c`（2026-02-10） | `f13a1624d111d235e804bd80f48ba7c9f66a8e0f`（2025-07-13） |
| 代码许可 | GPL-3.0-or-later（源文件头），附 Electronic Arts 依 GPL 第 7 条的附加条款：不授予 SimCity 商标、修改版须标明、转让时承担责任的须赔偿 EA；"MICROPOLIS"名称另受仓库根目录 `MicropolisPublicNameLicense.md`（商标礼让许可）约束 | GPL-3.0 加同样附加条款（`LICENSE`、`COPYING`），名称同受 `MicropolisPublicNameLicense.md` 约束 |
| 素材许可 | 瓦片图随仓库发布，未见独立素材许可，视为随 GPL 一并发布（待核实逐文件） | 同左；字体另见 `css/FONT_LICENSE.markdown` |
| 语言与规模 | 多份实现并存：`micropolis-activity/`（1990 年代原版 C，模拟在 `src/sim/s_*.c`）、`MicropolisCore/`（C++ 重构加 Python 绑定，引擎 `MicropolisCore/src/MicropolisEngine/src` 约 1.7 万行，带 Doxygen 注释）、`micropolis-java/`、`laszlo/`、`turbogears/` | JavaScript 为主、核心数据结构为 TypeScript，`src/` 约 1.3 万行，`test/` 有 Jest 单测 |
| 本地镜像与检出目录 | `D:\hakoniwa_refs\micropolis`：`MicropolisCore/src/MicropolisEngine/src`、`micropolis-activity/src/sim` | `D:\hakoniwa_refs\micropolis_js`：`src`、`test` |
| 分级 | 必读 | 必读（TS 侧对照） |

取哪一份读：以 **MicropolisCore 的 C++ 版**为主（变量已改成可读名、Doxygen 注释写明了原作者的疑问与已知缺陷），
原版 C 只用于核对，micropolisJS 用于看"同样的算法在 JS 里怎么拆模块"和它修掉的缺陷。

3d.city（`#web-088`，https://github.com/lo-th/3d.city）：GitHub 接口报许可为 NOASSERTION，是用 Three.js 渲染 Micropolis 式城市的性能演示，
模拟层对本作没有新信息，未克隆，略过（其模拟是否直接来自 micropolisJS，待核实）。

### 1.2 值得看的理由

- 它是"城市作为一组场"的原型：地价、污染、犯罪、人口密度、治安覆盖、消防覆盖都是低分辨率格网上的场，经平滑后相互引用。
  本作第 3.6 节的覆盖与邻接、第 12 节地段澱值都可以落成同一类场（[`city_building.md`](../../40_design/systems/city_building.md) 第 3.6、12.1 节）。
- RCI 需求阀是"人口迁入迁出"的最小可行模型：供需失衡被积分成有界的阀值，再由每块地的局部评价决定增长或衰退，可直接对照第 5.6 节。
- 电网洪泛连通带容量预算，正好是第 6.1 节"灵素不可储存，按容量计"的实现样本。
- 预算拨款按比例影响服务强度、评估与民调把城市状态翻译成"十大问题"，对应经济第 6.3 节预算与第 8.7 节可读性。

### 1.3 源码导读（以下路径相对 `MicropolisCore/src/MicropolisEngine/src/`，另注明者除外）

| 想弄懂 | 就读这些文件与符号 | 该处机制 |
| --- | --- | --- |
| 主循环与节拍 | `simulate.cpp` `Micropolis::simFrame`、`Micropolis::simulate` | 16 个相位轮转，每帧只跑一个相位；各类场扫描按速度档隔若干大周期才跑一次 |
| 逐格扫描与分派 | `simulate.cpp` `Micropolis::mapScan`；`zone.cpp` `Micropolis::doZone` | 相位 1 到 8 各扫 1/8 地图列；按瓦片编号区间分派到火、洪水、道路、区划、铁路 |
| 需求阀 | `simulate.cpp` `Micropolis::setValves`；`micropolis.h` `RES_VALVE_RANGE`、`COM_VALVE_RANGE`、`IND_VALVE_RANGE` | 预测人口与实际人口之比加税表，积分进三个阀 |
| 区划增长与衰退 | `zone.cpp` `doResidential`、`doResIn`、`doResOut`、`evalRes`、`doCommercial`、`doComIn`、`evalCom`、`doIndustrial`、`buildHouse`、`evalLot`、`getLandPollutionValue`、`getResZonePop` | 阀值加局部评价得分，与 16 位随机数比较决定升降一级 |
| 交通 | `traffic.cpp` `makeTraffic`、`findPerimeterRoad`、`tryDrive`、`tryGo`、`driveDone`、`addToTrafficDensityMap`；`simulate.cpp` `decTrafficMap`、`doRoad` | 随机游走找目的区划，成功则沿途加交通密度，失败则该区划衰退 |
| 电网 | `power.cpp` `doPowerScan`、`testForConductive`、`COAL_POWER_STRENGTH`、`NUCLEAR_POWER_STRENGTH`；`simulate.cpp` `doSpecialZone` | 发电厂入栈，沿导电格洪泛，每格消耗 1 单位容量，超出即断电 |
| 场与平滑 | `scan.cpp` `pollutionTerrainLandValueScan`、`crimeScan`、`populationDensityScan`、`fireAnalysis`、`smoothStationMap`、`smoothDitherMap`、`computeComRateMap`；`map_type.h` 模板 `Map<DATA, BLKSIZE>` 与 `MapByte2`、`MapByte4`、`MapShort8` | 2×2、4×4、8×8 分块场，邻域平均平滑 |
| 预算与拨款效果 | `simulate.cpp` `collectTax`、`updateFundEffects`；`budget.cpp` `doBudgetNow` | 应拨额按设施数算，实拨额不足时按"道路、消防、警察"顺序砍，效果按实拨比例缩放 |
| 评估与民调 | `evaluate.cpp` `cityEvaluation`、`doProblems`、`voteProblems`、`getScore`、`doVotes`、`getCityClass`、`getPopulation` | 七项问题投票取前四；城市分数多因子相乘再与上期平均 |
| 灾害 | `disasters.cpp` `doDisasters`；`simulate.cpp` `doFire`、`fireZone` | 按难度的一次性抽签；火逐格蔓延，熄灭概率受消防覆盖影响 |
| 城市自生服务 | `simulate.cpp` `take10Census`；`zone.cpp` `makeHospital`、`doHospitalChurch` | 人口超过设施承载时，空住宅区自行变成医院或教堂；过剩时随机拆除 |
| TS 侧结构 | micropolisJS `src/simulation.js`、`src/mapScanner.js` `MapScanner.prototype.addAction`、`src/residential.js` `registerHandlers`、`src/valves.js`、`src/blockMap.ts` `BlockMap`、`src/random.ts` | 扫描器按"判定函数到处理函数"注册表分派，各领域模块自己注册 |

### 1.4 机制拆解

#### 1.4.1 节拍：16 相位轮转

`Micropolis::simulate` 用 `phaseCycle` 在 0 到 15 之间轮转，每次调用只执行一个相位：

| 相位 | 工作 |
| --- | --- |
| 0 | 时间加一、累计税率；偶数大周期调 `setValves`；清空普查计数 `clearCensus` |
| 1～8 | 每个相位扫描 1/8 地图列（`mapScan`），逐格处理区划、道路、火等，同时累计普查数 |
| 9 | 每 4 个时间单位做月度普查 `take10Census`，每 48 个做年度普查 `take120Census`；每 48 个（`TAX_FREQUENCY`）收税并做评估 |
| 10 | 交通密度衰减 `decTrafficMap`，每 5 个大周期衰减增长率图 |
| 11～15 | 依速度档隔若干大周期做电网、污染加地价、犯罪、人口密度、消防覆盖扫描；相位 15 还掷灾害 |

速度档表（`speedPowerScan` 等静态数组）给出各扫描的间隔：例如中速时电网每 4 个大周期扫一次，污染地价每 7 个，犯罪每 8 个。
慢速档反而扫得更勤（间隔 1 到 2），因为每秒大周期数少。

#### 1.4.2 区划格与人口编码

地图 120×100（`map_type.h` `WORLD_W`、`WORLD_H`）。一个 3×3 区划的"中心瓦片编号"同时编码了密度档与地价档：
住宅中心的人口由编号推出（`getResZonePop`：`密度档 × 8 + 16`，即 16、24、32、40），
空住宅区（`FREEZ`）则数周围 8 格上的独栋小屋数（`doFreePop`）。商业密度档 1 到 5，工业 1 到 4。
升降级就是"按新的密度档与地价档重新铺一次 3×3 瓦片"（`resPlop`、`comPlop`、`indPlop` 调 `zonePlop`）。
这是把状态塞进瓦片编号的做法，节省内存，但可读性差（分析：本作不要学，状态应放在建筑实例字段里）。

城市人口的展示值 `getPopulation` = `(resPop + (comPop + indPop) × 8) × 20`；
`getCityClass` 的分档：超过 2000 为镇，超过 1 万为城，超过 5 万为首府，超过 10 万为大都市，超过 50 万为特大都市。

#### 1.4.3 RCI 需求阀 `setValves`

```
// 每两个大周期一次（相位 0）；以下为用自己的话转述
R  = 住宅人口 / 8                          // 把居民折成"工人单位"
就业率 = (上月商业 + 上月工业) / R          // 无居民时取 1
迁移   = R × (就业率 − 1)                   // 岗位多于人则迁入，少于人则迁出
出生   = R × 0.02
预测R  = R + 迁移 + 出生
劳力基 = clamp(上月住宅 / (上月商业 + 上月工业), 0, 1.3)
内需   = (R + 商业 + 工业) / 3.7
预测C  = 内需 × 劳力基
预测I  = max(工业 × 劳力基 × 外部市场系数[难度], 5)     // 系数 1.2、1.1、0.98
比值X  = min(预测X / 实际X, 2)                         // X 为 R、C、I
增量X  = (比值X − 1) × 600 + 税表[min(税率 + 难度, 20)]
阀X    = clamp(阀X + 增量X, −范围X, +范围X)            // 范围：R 2000，C 1500，I 1500
若城市缺体育场（R）、机场（C）、海港（I）的"上限旗"为真，则对应阀的正值清零
```

- 税表 `taxTable` 共 21 档，从 +200（零税）单调降到 −600，税率约 7% 时为 0。
- 阀是**速度的积分**：比值只决定"这一拍阀往哪边推多少"，阀本身有上下限，所以城市不会因一拍的失衡而剧烈摆动。
- 已知缺陷：MicropolisCore 的 C++ 版在给工业比值封顶那一行误写成给住宅比值赋值（`resRatio` 被 `min(indRatio, indRatioMax)` 覆盖），
  于是住宅阀实际在吃工业的比值；原版 C（`micropolis-activity/src/sim/s_sim.c` 的同名函数）三个比值各自封顶，是对的；
  micropolisJS `src/valves.js` 也写对了。分析：这是"重构移植引入回归"的活例子，本作移植任何公式都要先写黄金样例测试。

#### 1.4.4 区划的增长与衰退

```
处理住宅中心(pos)：
  人口 = 当前档人口
  若 人口 > 随机(0..35)：尝试一次"住宅到商业"的出行（见 1.4.5）
  若 出行失败（周边无路）：按地价档降一级，返回
  空区或 1/8 的概率进入评估：
    局部 = 地价 − 污染，裁到 0 以上，×32 封顶 6000，再 −3000      // evalRes，范围 −3000..+3000
    得分 = 住宅阀 + 局部；无电则得分 = −500
    若 得分 > −350 且 (得分 − 26380) > 有符号16位随机数：
        空区且无人且 1/4 概率：改建医院或教堂（见 1.4.10），返回
        升一级（doResIn：污染 > 128 不长；空区人口 < 8 先盖独栋小屋；密度图 > 64 则直接铺成密集区）
    否则若 得分 < 350 且 (得分 + 26380) < 有符号16位随机数：
        降一级（doResOut）
```

- 商业的局部评价 `evalCom` 直接读 `comRateMap`（离城市重心越近越高，范围 +64 到 −64）；工业 `evalInd` 只看出行是否成功（失败 −1000）。
- 概率量级（分析，按上式推算）：得分为 0 时一次评估的增长概率约 9.7%，失败后衰退概率约 8.8%；得分 +5000 时增长约 17%。
  也就是说即使需求旺盛，单块地的变化也是缓慢的随机游走，城市形态由大量小概率事件累积而成。
- 每次升降都调用 `incRateOfGrowth(±8 或 ±1)` 在增长率图上加减（函数内再乘 4，封顶 ±200），该图每 5 个大周期向 0 衰减，只用于给玩家看"哪里在长"。
- 注意 `Micropolis::getRandom(n)` 返回 0 到 n（含 n），所以源码里"`getRandom(n) == 0`"的概率是 1/(n+1)，下文给出的概率均按此换算。

#### 1.4.5 交通：随机游走出行

```
makeTraffic(区划中心, 目的类型)：
  在 3×3 区划外圈 12 个格里找第一块路（findPerimeterRoad）；找不到返回 −1（"无路"，区划会衰退）
  tryDrive：最多走 30 步（MAX_TRAFFIC_DISTANCE）
     每步在 4 个方向里排除来路，若只有 1 条路就走它，否则随机挑一条（tryGo）
     每走两步把位置压栈
     到达任一邻格属于目的区间（driveDone）则成功
     死胡同：弹栈后退，步数 += 3
  成功：栈里每个位置的交通密度 +50，封顶 240；达 240 时 1/5 概率把直升机引过去
目的对应：住宅去商业，商业去工业，工业去住宅
```

- 交通密度每个相位 10 衰减（`decTrafficMap`：≤24 清零，>200 减 34，其余减 24）。
- `doRoad` 按 `密度 >> 6` 把路面切换为空、轻、重三档瓦片（重交通格计两倍道路维护）；道路经费不足时随机坏路（见 1.4.7）。
- 交通污染：轻交通格 50、重交通格 75（`getPollutionValue`）。
- 分析：随机游走的好处是不需要寻路、天然产生"主干路更堵"的效果；坏处是行为不可解释、对路网拓扑极敏感。
  本作第 3.2 节已决定 L4 走拓扑分钟数，因此应借"出行在路段上留下流量，流量按时衰减，读数驱动拥堵与污染"这一层，
  而把随机游走换成拓扑图上的确定性最短路。

#### 1.4.6 电网：带容量的洪泛

```
doPowerScan：
  清空供电图
  容量 = 火电厂数 × 700 + 核电厂数 × 2000      // COAL_POWER_STRENGTH、NUCLEAR_POWER_STRENGTH
  已用 = 0
  对每个在 mapScan 时入栈的电厂位置：
     沿导电格走：每到一格 已用 +1；若 已用 > 容量，发"电力不足"消息并结束整个扫描
     本格标为有电；若有两个以上未通电的导电邻格，把当前位置压栈（分叉点），沿其中一个继续
```

- 区划在下一次 `mapScan` 时把供电图拷到自己的电力位（`setZonePower`），无电的区划评估得分直接置 −500。
- 容量按"被电到的格数"计，不按用电量计；超出容量后剩余的电网全部不通电，且由扫描顺序决定谁先断（分析：这是有意简化，
  但会让玩家难以理解"为什么断的是那片"）。

#### 1.4.7 场与平滑

| 场 | 分辨率 | 计算（`scan.cpp`） |
| --- | --- | --- |
| 污染 | 2×2 块 | 块内各瓦片污染值相加（重交通 75、轻交通 50、火 90、辐射 255、工业 50、港口机场火电 100），平滑两次 |
| 地价 | 2×2 块，只对已开发块 | `(34 − 到城市重心的曼哈顿距离/2) × 4 + 地形密度 − 污染`；犯罪 > 190 再 −20；裁到 1～250 |
| 犯罪 | 2×2 块，只对有地价的块 | `128 − 地价 + 人口密度`，先封顶 300，再减治安站覆盖，裁到 0～250 |
| 人口密度 | 2×2 块 | 区划人口 ×8 封顶 254，平滑三次后 ×2；同时求所有区划坐标的重心作为城市中心 |
| 治安、消防覆盖 | 8×8 块 | 每座站在其道路接入格上叠加"拨款效果值"，然后用 `smoothStationMap` 平滑三次 |
| 商业位置 | 8×8 块 | `64 − 4 × (到重心距离/2)`，即越近市中心越好 |
| 地形密度 | 4×4 块 | 树木水体等自然格计数后平滑，作为地价的加分 |

- 两种平滑核：`smoothDitherMap`（无抖动分支）为"自身加四邻之和右移 2 位"，封顶 255；
  `smoothStationMap` 为"(自身 + 四邻之和/4) / 2"。每多平滑一次，覆盖就向外扩一圈、峰值降一截，形成近似距离衰减的覆盖。
- 治安站与消防站的贡献：通电时为当前拨款效果值，不通电减半；周边没有道路再减半（`doSpecialZone`）。
- 分块场由模板 `Map<DATA, BLKSIZE>` 统一实现，`worldGet` / `worldSet` 用世界坐标存取，micropolisJS 的 `BlockMap` 是同一设计的 TS 版。

#### 1.4.8 预算与拨款效果

```
collectTax（每 48 个时间单位）：
  警察应拨 = 警察局数 × 100；消防应拨 = 消防站数 × 100
  道路应拨 = (道路格 + 铁路格 × 2) × 难度系数{0.7, 0.9, 1.2}
  税收 = 总人口 × 平均地价 / 120 × 税率 × 难度系数{1.4, 1.2, 0.8}
doBudgetNow：
  需拨 = 各项应拨 × 玩家设定百分比
  若 (税收 + 现金) 够：全额
  否则按 道路 → 消防 → 警察 的顺序依次足额，余款不足的那一项按比例部分拨，其后各项为 0，并把对应百分比改写成实际可达比例
updateFundEffects：
  道路效果 = 32 × 实拨/应拨；警察效果 = 1000 × 实拨/应拨；消防效果同理
```

- 道路效果低于满值 15/16 时，每块路每次扫描有 1/512 概率进入损坏判定，若效果小于随机数（0～31）则变成瓦砾或断桥（`doRoad`）。
- 治安、消防效果直接作为站点覆盖的注入强度（见 1.4.7），从而影响犯罪图与灭火概率。
- 分析：这是"拨款比例连续地削弱服务强度"的最简模型，没有"欠费停机"的断崖；砍预算的默认顺序是写死的。

#### 1.4.9 评估与民调

```
cityEvaluation（每次收税后）：
  问题表 = { 犯罪: 平均犯罪, 污染: 平均污染, 住房: 平均地价 × 0.7, 税: 税率 × 10,
             交通: 平均交通 × 2.4, 失业: (居民/岗位 − 1) × 255 封顶 255, 火灾: 火格数 × 5 封顶 255 }
  投票：轮流对每个问题以约 问题值/300 的概率投一票，直到凑满 100 票或循环 600 次
  取票数最多的前 4 个问题作为"市民最关心的问题"
  分数：x = min(七项之和/3, 256)；z = clamp((256 − x) × 4, 0, 1000)
        每个触发上限旗的 R/C/I ×0.85；道路效果不满则减差额；治安、消防效果不满则 × (0.9 + 效果/10000)
        每个阀低于 −1000 再 ×0.85；人口增长 × (1 + 增量/人口)，人口下降 × (0.95 + 增量/(人口 − 增量))
        减火灾严重度与税率；乘以有电区划占比；裁到 0～1000
  城市分数 = (上期分数 + z) / 2
  支持率：做 100 次抽签，每次以约 分数/1000 的概率记"支持"
```

- 已知缺陷：C++ 版 `voteProblems` 的回卷条件写成 `problem > PROBNUM`，会读到问题表末尾之外的槽；micropolisJS 改成按问题数取模。
- 分析：这套"问题值加投票加前四投诉"本身就是一份可读性报告：它把场图平均值翻译成市民的语言。
  本作第 8.7 节的自治报告、第 5.5 节的集体指标可以照此加一层"居民最关心的事"，但投票部分可直接按比例确定性计算，不必抽签。

#### 1.4.10 灾害与城市自生服务

- `doDisasters`：每次相位 15 以约 1/481、1/241、1/61（按难度，常量 `DisChance` 为 480、240、60）的概率触发一次，再从 9 种结果里抽：火 2/9、洪水 2/9、龙卷风、地震、
  怪兽 2/9（仅当平均污染 > 60）、空 1/9（原为空难，EA 要求删除）。
- 火的蔓延（`doFire`）：`mapScan` 里每格火只有 1/4 的机会被处理；每次处理对四邻各有 1/8 的概率点燃可燃格；
  熄灭概率基础约 1/11，消防覆盖 > 0 时 1/4，> 20 时 1/3，> 100 时 1/2。
- 自生服务：月度普查比较"医院数"与"住宅人口/256"、"教堂数"与"住宅人口/256 + 信仰参数"，得出需要、过剩或持平（`take10Census`）；
  空住宅区在增长判定里有 1/4 概率直接变成所需的医院或教堂（`makeHospital`），过剩的医院、教堂每次处理有约 1/21 概率被拆回住宅区（`doHospitalChurch`）。
  分析：这是"城市自己长出公共设施"的先例，可对照本作高自治度下居民自发修神龛、公灶的设定。

### 1.5 对《箱庭纪》的借鉴（分析）

可直接借的方法：

1. **分块场加平滑**。以地段（暂定 4×4 格，[`city_building.md`](../../40_design/systems/city_building.md) 第 3.3 节，待决 CB-1）为场的单元，
   维护地价、污染（熔炉、制革坊）、治安覆盖、澱值等场；每个场一个注入函数加一个平滑核，平滑次数即影响半径。
   覆盖半径按第 3.6 节应以拓扑分钟数计，可以把"平滑"换成"沿路网的有限步扩散"，但数据结构与读数方式照搬。
2. **积分阀**。第 5.6 节的吸引力公式现在是瞬时值，`runPopulation` 以 `rng.chance(attraction)` 决定是否迁入。可改成每个聚落、每个阶层（农夫、工匠、商人）一个有界阀：
   每日把"岗位与劳力之比、住房空余、吸引力差"折成增量积分进阀，阀值再决定迁移流（仍守住每日 1% 上限）。阀有惯性，正好呼应自治度的每日 ±1 限幅。
3. **带容量预算的洪泛**。灵素供能（第 6.1 节）照 `doPowerScan` 做：灵脉井为源，导灵设施为导体，按格或按建筑耗容量，超出即断；
   但要把"谁先断"改成按优先级（城防结界先于灯石暖石），并给断能建筑写状态说明。
4. **拨款比例缩放服务强度**。经济第 6.3 节的领域预算可以照 `updateFundEffects` 让"实拨/应拨"连续缩放覆盖强度；
   拨款不足时的砍预算顺序做成部门官的常设命令（委托工具），而不是写死。
5. **问题民调**。把幸福账本、治安、存粮天数等折成"居民最关心的前四件事"放进月报，直接服务第 8.7 节与第 9 节"请示合并"。

要改造的点：

- 交通的随机游走改为拓扑最短路，流量写在路段上，按第 3.5 节"超载时通行分钟数线性上升"反馈。
- 状态不进瓦片编号，放在 `BuildingInstance` 与地段数据上。
- 场扫描摊到不同 tick（相位表），避免日结尖峰；本作 20Hz、按系统命名随机流，相位表天然确定。

不要学的坑：

- 全局随机与全局单例：MicropolisCore 的随机数是引擎内部状态，micropolisJS `src/random.ts` 直接调 `Math.random`，都不可回放。
- 移植回归：上面两个缺陷说明"逐行翻译"也会出错，必须用原版输出做黄金样例。
- 评估里的抽签民调会让同样的城市每次得出不同的支持率，本作的报告应确定性。

与现有实现的差距：`population.ts` 没有场、没有阀；`common.ts` `sumEffect` 把所有建筑效果全聚落求和，没有"离卫兵所远的街区治安差"的空间性；
财政只有人头税与维护费，没有预算强度。

### 1.6 许可与复用边界

GPL-3.0（含 EA 附加条款）与 AGPL 同属强著佐权：**只借方法，不拷代码**，本文的伪代码均为转述；单行公式与常量可以引用。
产品中不得使用"Micropolis"与"SimCity"名称。

---

## 2. Julius 与 Caesaria（《凯撒 III》系）

### 2.1 信息表

| 项 | Julius | Caesaria |
| --- | --- | --- |
| 索引条目 | 非索引补充 | `#native-129` |
| 仓库 | https://github.com/bvschaik/julius | https://github.com/dalerank/caesaria-game |
| 固定提交与日期 | `af235a7e86f6c34111194799330e436f4bfd5614`（2026-11-13） | `a7d2f7f23de7f63283695f72cb697ac43a41196e`（2016-06-14，此后无提交） |
| 代码许可 | AGPL-3.0（`LICENSE.txt`） | GPL-3.0-or-later（`LICENSE`、`LICENSE_GPL3`，源文件头）；随带的 libarchive 为 BSD-2 |
| 素材许可 | 仓库不含原作美术音频，运行需要正版《凯撒 III》数据；建筑与住房数值表 `c3_model.txt` 也来自原作数据，不在仓库内 | 运行同样需要原作 `.sg2/.555` 图形；仓库 `resources/` 与 `bin/resources/` 另有自制素材与数据文件，未见单独素材许可（待核实） |
| 语言与规模 | C；模拟相关目录（`src/building`、`city`、`figure`、`figuretype`、`map`、`game`）约 3.9 万行 | C++；已检出目录约 4.9 万行 |
| 本地镜像与检出目录 | `D:\hakoniwa_refs\julius`：`src/building`、`src/city`、`src/figure`、`src/figuretype`、`src/game`、`src/map`、`src/core` | `D:\hakoniwa_refs\caesaria`：`source/city`、`source/religion`、`source/objects`、`source/walker`、`source/game`；数据文件用 `git show` 只读查看 |
| 分级 | 必读（主读） | 必读（只读工程组织与数据化部分） |

取舍：**Julius 读机制，Caesaria 读工程组织**。Julius 的目标是与原作逻辑逐位一致（存档兼容、连原作缺陷也保留），代码是扁平的 C，
但每个机制都能在一个函数里看全，数值就是原作数值；Caesaria 是"自研引擎重做"，机制有自己的改动，且 2016 年后停止维护，
但它把城市子系统做成可注册服务、把数值放进 `.model` 数据文件、把每位神做成一个类，工程组织比 Julius 更接近本作的 `systems` 加内容包结构。

### 2.2 值得看的理由

- 本作第 3.6 节明确引用"《凯撒 III》式覆盖半径"，第 5.4 节的需求层级与"住房可升级"、第 6.3 节"按岗位吸引力自动填岗，工头或部门官设优先级"、
  第 6.4 节搬运，全都能在 Julius 里找到可运行的原型。
- 《凯撒 III》的诸神情绪、节庆、神赐与神罚是"城建里的神"的经典样本，可与 [`goddess_gm.md`](../../40_design/systems/goddess_gm.md) 的神力预算、注册修正项、预兆规则逐项对照。
- 风险时钟（火险、损坏）把随机灾害改成可读、可预防的累积量，正好补我们 `events.ts` 的短板。

### 2.3 源码导读（Julius 路径相对 `src/`）

| 想弄懂 | 就读这些文件与符号 | 该处机制 |
| --- | --- | --- |
| 时间与调度 | `game/tick.c` `advance_tick`、`advance_day`、`advance_month`、`advance_year`；`game/time.c` | 每日 50 个 tick，每个 tick 槽固定跑一个子系统 |
| 服务者游走 | `figure/movement.c` `figure_movement_roam_ticks`、`roam_set_direction`、`figure_movement_init_roaming`；`figuretype/service.c` `roamer_action`、`culture_action` | 沿路游走，每到格中心对半径 2 内的住房施加覆盖 |
| 覆盖施加与衰减 | `figure/service.c` `figure_service_provide_coverage`、`provide_culture`、`MAX_COVERAGE`；`building/house_service.c` `house_service_decay_culture`、`house_service_calculate_culture_aggregates`、`house_service_decay_houses_covered` | 覆盖计数器拉满为 96，每天减 1 |
| 服务者出门频率 | `building/figure.c` `default_spawn_delay`、`spawn_labor_seeker`、`generate_labor_seeker` | 人手越足出门越勤；人手为 0 不出门 |
| 住房进化 | `building/house_evolution.c` `check_evolve_desirability`、`has_required_goods_and_services`、`check_requirements`、`has_devolve_delay`、`building_house_process_evolve_and_consume_goods`、`consume_resources`；`building/model.h` `model_house` | 合意度阈值加逐项需求，退化有三次确认 |
| 进化说明 | `building/house_evolution.c` `building_house_determine_evolve_text`、`building_house_determine_worst_desirability_building` | 给每栋房写"差什么才能升级/为何将退化" |
| 合意度场 | `map/desirability.c` `map_desirability_update`、`add_to_terrain`、`add_desirability_at_distance`；`building/model.h` `model_building` | 每栋建筑按环形距离加减合意度 |
| 市场分发 | `figure/service.c` `distribute_market_resources`、`distribute_good` | 市场商贩路过时按下一级需求给住房补货 |
| 推车工与仓储 | `figuretype/cartpusher.c` `determine_cartpusher_destination`、`determine_cartpusher_destination_food`；`building/granary.c` `building_granary_for_storing`、`building_granary_determine_worker_task`；`building/warehouse.c` `building_warehouse_for_storing`；`core/calc.c` `calc_distance_with_penalty` | 按优先级挑目的仓，人手不足的仓不收货 |
| 劳力 | `city/labor.c` `city_labor_update`、`calculate_workers_needed_per_category`、`allocate_workers_to_categories`、`allocate_workers_to_non_water_buildings`、`DEFAULT_PRIORITY`、`CATEGORY_FOR_BUILDING_TYPE`、`city_labor_calculate_workers` | 九类劳力，玩家优先级先满足，其余按默认权重轮询 |
| 情绪与迁移 | `city/sentiment.c` `city_sentiment_update`、`SENTIMENT_PER_TAX_RATE`；`city/migration.c` `update_status`、`create_migrants`；`building/house_population.c` | 逐栋幸福加城市平均，迁移百分比按情绪分档 |
| 风险时钟 | `building/maintenance.c` `building_maintenance_check_fire_collapse`；`figure/service.c` `engineer_coverage`、`prefect_coverage` | 火险、损坏风险每日累积，巡视者路过清零 |
| 诸神 | `city/gods.c` `city_gods_calculate_moods`、`update_god_moods`、`perform_blessing`、`perform_small_curse`、`perform_large_curse`；`city/culture.c` `city_culture_update_coverage`；`city/festival.c` `city_festival_schedule`、`throw_party` | 目标情绪、惯性、怒气、神赐神罚、节庆 |
| 生产 | `building/industry.c` `building_industry_update_production`、`MAX_PROGRESS_RAW`、`MAX_PROGRESS_WORKSHOP` | 进度每天加上工人数，满额出一车 |
| 随机数 | `core/random.c` `random_init`、`random_generate_next` | 固定初值的移位寄存器加 100 格随机池，可回放 |
| Caesaria 服务注册 | `source/city/cityservice.hpp` `city::Srvc`；`source/city/cityservice_factory.hpp` `ServiceFactory`、宏 `REGISTER_SERVICE_IN_FACTORY` | 每个城市子系统是一个带 `timeStep`、`save`、`load` 的服务 |
| Caesaria 诸神 | `source/religion/divinities.cpp` `RomeDivinity::updateRelation`、`RomeDivinity::checkAction`；`source/religion/config.hpp`；`source/city/cityservice_religion.cpp` `Religion::timeStep` | 每位神一个类，城市服务每周汇总神庙并给出"原因列表" |
| Caesaria 招工 | `source/city/cityservice_workershire.cpp` `WorkersHire::timeStep`、`setIndustryPriority`；数据 `bin/resources/workershire.model` | 缺人的建筑派招工者，按行业优先级先派 |
| Caesaria 选路服务者 | `source/walker/serviceman.cpp` `ServiceWalker::evaluatePath`、`_reservePath`；`source/objects/house_spec.cpp` `HouseSpecification::evaluateServiceNeed`、`checkHouse` | 候选路线按沿途住房"缺口"打分，选最高，并预约沿途服务 |
| Caesaria 数据 | `bin/resources/house.model`、`migration.model`、`mars_wrath.model` 等 | 住房 20 级需求表等全在数据文件里 |

### 2.4 机制拆解

#### 2.4.1 调度：每日 50 槽

`game/tick.c` `advance_tick` 用一个 `switch(game_time_tick())` 把子系统钉在固定槽位上（每日 50 tick，每月 16 日）：
例如槽 1 诸神情绪、槽 8 粮仓库存、槽 12 建筑覆盖衰减、槽 22 到 24 住房容量与迁移与超员驱逐、槽 25 劳力、槽 27 到 28 供水、
槽 31 生成服务者、槽 33 建筑计数与文化覆盖、槽 35 到 36 文化覆盖衰减与汇总、槽 37 到 38 合意度、槽 39 住房进化与消耗、
槽 44 火险与损坏、槽 49 文化评分。每日 0 号与 8 号日更新情绪；月末依次处理健康、随机事件、财政、粮食消耗、入侵、请求等。

分析：这是"把重计算摊到不同 tick"的最直接写法。本作内核 20Hz、日结集中在 `daily.ts`，聚落多了以后可以照此给每个子系统分配一个日内相位，
既平滑帧耗，又因槽位固定而保持确定性。

#### 2.4.2 游走者覆盖

```
服务建筑每次"生成服务者"检查：
  有路接入才生成；出门间隔按人手比例：100% 为 3，≥75% 为 7，≥50% 为 15，≥25% 为 29，≥1% 为 44，0 不出门
  每次出门的初始方向在 0、2、4、6 间轮换（figure_movement_init_roaming）
服务者游走（figure_movement_roam_ticks）：
  每到一格中心：对以自身为中心半径 2 的方块内、有人住的住房施加覆盖
     文化类覆盖：把对应计数器设为 96（MAX_COVERAGE）
     收税员：设 50；工程师：清零该建筑损坏风险；消防官：清零火险并记录看到的最低幸福
  选下一步：只看四向道路
     无路：结束游走
     1 条：走它
     2 条：尽量直行，否则按本次的转向偏好（左或右）转
     >2 条：用"游走计数 + 该格固定随机值"挑方向，避开来路
  走满最长游走步数（文化类 384，学童 96，其他 128 到 192）后沿最短路回家
建筑侧：houses_covered += 本次服务到的住房数，封顶 300；每天减 1
住房侧：所有文化覆盖计数器每天减 1（house_service_decay_culture），减到 0 即失去该服务
```

- 住房的"娱乐点数"在 `house_service_calculate_culture_aggregates` 里汇总：剧场 +10，圆形剧场 +10（有角斗再 +5），斗兽场 +15（有狮子再 +10），赛车场 +30，
  再加上全城娱乐覆盖率平均值的 1/5 作为底分；教育 0 到 3 级（学校或图书馆、两者皆有、再加学院）；宗教为覆盖到的神数；医疗为诊所与医院之和。
- "劳力可达性"也是游走覆盖：工作建筑在 `houses_covered` 不高于阈值时派"找工者"出门（`spawn_labor_seeker`），找工者路过住房就增加建筑的 `houses_covered`；
  `houses_covered` 为 0 的建筑分不到工人（见 2.4.6）。也就是说"离住宅区太远的作坊招不到人"是空间机制，不是参数。

#### 2.4.3 住房进化与退化

住房有 20 级（小帐篷到豪华宫殿），每级一行 `model_house`：退化合意度、进化合意度、娱乐点数、水（1 井 2 喷泉）、神数、教育级、理发、浴场、医疗级、
食物种类数、陶器、油、家具、酒（1 任一种 2 两种）、繁荣贡献、人数上限、税倍率。Julius 从原作数据 `c3_model.txt` 读入（`model_load`）。
Caesaria 把同一张表写进 `bin/resources/house.model`，节选如下（数值即原作数值；"医疗"一列在 Caesaria 合并了理发浴场等，口径与 Julius 不完全一致，待核实）：

| 级 | 名称（Caesaria 注释原文为法文，此处意译） | 人数 | 退化阈 | 进化阈 | 娱乐 | 水 | 神数 | 教育 | 医疗 | 食物种类 | 陶器 | 油 | 家具 | 酒 | 繁荣 | 税倍 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 小帐篷 | 5 | −99 | −10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 1 |
| 2 | 大帐篷 | 7 | −12 | −5 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | 1 |
| 3 | 小棚屋 | 9 | −7 | 0 | 0 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 15 | 1 |
| 5 | 小陋屋 | 13 | 2 | 8 | 0 | 2 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 25 | 2 |
| 7 | 小宅 | 17 | 10 | 16 | 10 | 2 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 35 | 2 |
| 9 | 小公寓 | 19 | 18 | 25 | 25 | 2 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 50 | 3 |
| 12 | 宏伟公寓 | 21 | 37 | 48 | 35 | 2 | 1 | 2 | 3 | 2 | 1 | 1 | 1 | 0 | 80 | 4 |
| 13 | 小别墅 | 10 | 45 | 53 | 35 | 2 | 2 | 2 | 3 | 2 | 1 | 1 | 1 | 1 | 150 | 9 |
| 20 | 豪华宫殿 | 12 | 85 | 100 | 80 | 2 | 4 | 3 | 4 | 3 | 1 | 1 | 1 | 2 | 1750 | 16 |

人数一列的口径：Julius `model.h` 的注释称中型公寓及以下按每格计、大公寓及以上按每栋计；Caesaria 数据里大房级的人数反而变小，
两者口径是否一致待核实，只宜看相对量级。

进化判定（每日槽 39，`building_house_process_evolve_and_consume_goods` 对每栋住房调各级的 `evolve_*` 函数）：

```
check_requirements(house)：
  状态 = 按合意度：≤ 本级退化阈 → 退化；≥ 本级进化阈 → 进化；否则不变（最高级进化阈视为 1000）
  若 本级需求不满足（has_required_goods_and_services(本级)） → 退化
  否则若 状态为进化 → 再检查下一级的需求，满足才进化
has_required_goods_and_services(级)：按以下顺序逐项检查，第一项不满足即返回失败，并在全城"需求统计"里给该项计数：
  水 → 娱乐 → 教育 → 宗教 → 理发 → 浴场 → 医疗 → 食物种类 → 陶器 → 油 → 家具 → 酒
退化延迟（has_devolve_delay）：连续第 1、2 次判为退化只计数不执行，第 3 次才真正退化；任何一次非退化即清零
消耗（consume_resources）：每月第 0 日和第 7 日按本级用量扣陶器、家具、油、酒
大房的合并与拆分：小房在 evolve 前尝试与相邻同级小房合并为 2×2（building_house_merge），大公寓、大别墅、大宫殿退化时拆回小房
```

- **滞回**来自两处：进化阈高于退化阈（每级有 5 到 15 点的间隔），以及退化需要连续三次确认。分析：这正是防"临界抖动"的标准做法。
- **进化说明**（`building_house_determine_evolve_text`）：先判"将退化的原因"，再判"要进化还差什么"，给出一个文本编号；
  合意度不足时还会在半径 6 内找"拉低合意度最狠的建筑"（`building_house_determine_worst_desirability_building`），告诉玩家"是那座作坊害的"。
- **市场补货**（`distribute_market_resources`）：市场商贩路过住房时，按"下一级"的需求补货：食物每次补一种，目标为 `4 × 历史最高人口`；
  陶器目标 `8 × 需求`，油、家具、酒为 `4 × 需求`；补货同时在市场上举起该商品的"需求旗"，让市场采购员去仓库拿货。

#### 2.4.4 合意度场

`map_desirability_update` 每天清空合意度格网，然后对每栋在用建筑按其 `model_building` 的四个参数（初值、步长、每步增量、范围，范围封顶 6）
向外一环一环加值：第 1 环加初值，每走"步长"环，值加一次"每步增量"（通常与初值反号，使影响随距离衰减到 0）；广场、花园按地形格额外加，
瓦砾为初值 −2、步长 1、每步 +1、范围 2；每格结果裁到 −100 到 +100。住房的合意度取其占地上的最大值。

分析：这就是本作第 3.6 节"邻接加成或惩罚"的连续版：熔炉旁不宜住人、神殿旁地价上升，都可以写成每栋建筑一组"初值、步长、增量、范围"的数据，
比"每栋建筑 ≤ 2 条邻接规则"更通用，同时可视化为一张合意度图。

#### 2.4.5 推车工、粮仓与仓库

```
生产建筑出货（determine_cartpusher_destination，非食物）：按优先级找第一个能收的目的地
  1 若该货被设为"囤积"：仓库
  2 收此货的粮仓（食物）
  3 缺原料的作坊
  4 仓库
  5 强制粮仓（即便设了囤积）
  都不收：原地等待，并记录"是否因为仓库人手不足"
食物出货（determine_cartpusher_destination_food）：粮仓 → 仓库 → 强制粮仓
目的仓必须：在用、有路接入、与出货方同一路网、人手 100%（粮仓、仓库都如此）、该货状态不是"不收"、未被设为"全部清空"、仍有空位
挑最近：距离 = 两点切比雪夫距离 + |两者到入城口的路网距离之差|（calc_distance_with_penalty）
仓库每个仓位存一种货，最多 4 车；粮仓的"取货"任务要求人手 ≥ 50%，且其他非取货粮仓里该食物多于一车
```

- 每座仓储建筑有一组按货物的状态（收、不收、取货）加"全部清空"开关（`building_storage`），这是玩家的物流委托工具。
- 分析：人手不足的仓库不收货，会让"缺人"直接表现为"货堆在作坊门口"，是非常可读的因果链。本作第 6.4 节"仓库满了生产就停，写进状态说明"可以照此扩成：
  停产原因细分为"仓满""仓库缺人""没有同路网的仓"。

#### 2.4.6 劳力分类与优先级（委托样本）

```
可用劳力 = 劳动年龄人口 × 60% × 平民占比     // 别墅以上的贵族不劳动（city_labor_calculate_workers）
九类：工业商业、粮食生产、工程、供水、消防治安、军事、娱乐、医疗教育、行政宗教（CATEGORY_FOR_BUILDING_TYPE 按建筑类型映射）
各类需求 = Σ 该类在用建筑的岗位数；工程与供水总计入，其余类只计 houses_covered > 0 的建筑（有劳力可达性）；被玩家"封存"的产业不计
分配（allocate_workers_to_categories）：
  若 总需求 ≤ 可用：全满足
  否则：
     玩家给过优先级 1..9 的类，按优先级顺序依次足额，直到劳力用完
     其余类按默认权重轮询，每轮给：工程 3、供水 1、消防治安 3、军事 2、粮食 4、工业 2、娱乐 1、医疗教育 1、行政宗教 1（DEFAULT_PRIORITY）
类内分到楼（allocate_workers_to_non_water_buildings）：
  每栋按其 houses_covered 占本类总和的比例分人，不超过岗位数；剩余再按建筑顺序补足
失业率给元老院看时有滞后：上升时每次最多涨 5 个百分点
```

- 产出与人手线性相关（`building_industry_update_production`）：生产进度每天加上工人数（大理石场减半），原料建筑满 200、作坊满 400 出一车。
- 分析：这一套就是第 6.3 节要的东西，且天然分出了两层委托：部门官调"类优先级"（不计依赖），玩家亲手"封存某产业"或指定具名居民（计依赖）。
  类别可以直接映射到本作的领域（粮务、工务、治安、民政、商务、军务、教化、研究）。

#### 2.4.7 情绪与迁移

逐栋幸福（`city_sentiment_update`，每月第 0、8 日）：

| 来源 | 贡献 |
| --- | --- |
| 税率 | `SENTIMENT_PER_TAX_RATE` 26 档：0% 为 +3，7% 到 8% 为 0，15% 以上为 −5 到 −6 |
| 工资对罗马 | 低于罗马：差额的一半（至少 −1）；高于：+1 到 +4 |
| 失业率 | >25% 为 −3，>17% 为 −2，>10% 为 −1，>4% 为 0，否则 +1 |
| 食物 | 有两种以上 +2，一种 +1，没有则每天累计 −1，最多 −3（帐篷不计） |
| 帐篷比例 | 城里有高级住房时，住帐篷的人越少惩罚越大（0 到 −6），隔次计算 |

- 人口不足 300 时所有抱怨都不计，只给基准幸福（人口不足 200 再 +10）；城市情绪 = 有人住房的幸福平均值。
- `low_mood_cause`：取五项里最负的一项作为"民心低落的主因"，供顾问界面显示。
- 迁移（`city/migration.c` `update_status`）：情绪 >70 为 +100%，>60 为 +75%，≥50 为 +50%，>40 为 0，>30 为 −10%，>20 为 −25%，否则 −50%；
  每批移民数 = 12 × 百分比；不足 4 人的批次排队等下一轮凑整；城内敌军超过 3 名时停止迁入；人口不足 100 时不迁出。

#### 2.4.8 风险时钟：火险与损坏

```
每日（building_maintenance_check_fire_collapse）：
  全局随机 g = 随机字节 & 7；每栋建筑的局部随机 l = (建筑号 + 该格固定随机值) & 7
  损坏风险 += (l == g) ? 3 : 1；大帐篷及以下住房不累计；> 200 即坍塌
  若 l == g：火险 += 非住房 5；空房清零；棚屋及以下 10；公寓及以下 5；别墅以上 2
              北方气候不着火，沙漠气候再 +3
  火险 > 100 即起火
工程师路过清零损坏风险；消防官路过清零火险
```

分析：这比"每日掷骰起火"可读得多：玩家能在建筑面板上看到"火险 87/100"，知道是因为"三个月没有卫兵巡过这条街"。
本作 `events.ts` 的 `rollFire` 可改为逐栋火险累积，木质建筑（`BuildingEffects.fireRisk`）决定累积速度，卫兵所或救火队的覆盖负责清零，
仍用 `ctx.rng('city.events')` 提供日内抖动。

#### 2.4.9 诸神

```
目标情绪（city_gods_calculate_moods，每日）：
  基础 = 该神宗教覆盖率（按容量算：神谕所 500 人、小神庙 750 人、大神庙 1500 人，除以总人口，封顶 100%）
  节庆 = 12 − min(距上次为该神办节庆的月数, 40)
  神庙最多的神（唯一）：目标 ≥ 50 则直接 100，否则 +50；神庙最少的神（唯一）：−25
     （原作缺陷：两处判断都写成编号 < 4，维纳斯既拿不到加成，也不会被扣分；源码注释只提到了前者）
  按人口给下限：<100 人为 50，<200 为 40，<300 为 30，<400 为 20，<500 为 10，再多为 0
  目标裁到 [下限, 100]
当前情绪：每天向目标走 1 点
怒气（每天随机抽 0..7 号，5..7 为空抽）：被抽中的神情绪 ≥ 50 清零怒气；< 40 时，≥20 加 1，≥10 加 2，<10 加 5；封顶 50
每月第 0 日：沿用当天抽到的那位神（空抽时改为怒气最大者，没有怒气则取情绪低于 40 中最低者）
  情绪 ≥ 100 且本轮未赐福：神赐，赐福标记置位（情绪降回 50 以下才复位）
  否则 怒气 ≥ 20、本轮未小罚、且距该神节庆 > 3 个月：小罚，怒气清零，情绪 +12
  否则 怒气 ≥ 50 且距节庆 > 3 个月：大罚（战役前期关卡不发大罚），怒气清零，情绪 +30
全体最低情绪 < 30 时发"众神不悦"消息，< 10 时发"众神震怒"，消息有 20 天冷却
```

各神的赐与罚（`perform_blessing`、`perform_small_curse`、`perform_large_curse`）：

| 神 | 神赐 | 小罚 | 大罚 |
| --- | --- | --- | --- |
| 刻瑞斯（农业） | 所有农场立即成熟（进度拉满），并获 16 天双倍进度（`building_bless_farms`） | 农场受诅咒 | 农场重诅咒 |
| 尼普顿（海） | 海贸收入翻倍至年底 | 沉没所有船只 | 沉船并让海贸中断一段时间（没有海路时不发） |
| 墨丘利（商业） | 存粮最少的那座粮仓每种食物各补 6 车（`building_granary_bless`） | 粮仓仓库损失货物 | 大量损失 |
| 玛尔斯（战争） | "玛尔斯之灵"可消灭一支入侵者 | 召来入侵 | 军团受诅咒并召来入侵（没有军队时只发消息） |
| 维纳斯（爱） | 全城幸福 +25 | 幸福上限 50、−5、健康 −10 | 幸福上限 40、−10、健康 −20 到 −50 |

节庆（`city/festival.c`）：小、大、盛大三档分别在 2、3、4 个月后举行，花钱，盛大的还要扣酒；举行时把该神"距节庆月数"清零，
全城幸福在 12 个月内第一次节庆 +7/+9/+12，第二次 +2/+3/+5。

Caesaria 的变体（`source/religion/divinities.cpp` `RomeDivinity::updateRelation`，每周）：目标 = clamp(覆盖收入 + 节庆因子 + 效果点, 下限, 100)，
下限 = 50 − min(人口/10, 50)；神庙最多（唯一）的神效果点 +50，最少（唯一）的 −25（`religion/config.hpp` `award::admiredGod`、`penalty::brokenGod`）；
情绪低于 10、20、40 时怒气每周 +5、+2、+1；赐福后情绪 −50。每位神是 `RomeDivinity` 的子类（`ceres.cpp` 等），覆写赐福与三档惩罚；
`Religion::timeStep` 每周把"某神受推崇""某神被冷落""某神发怒"写进原因列表 `reasons`，供界面显示。

#### 2.4.10 Caesaria 的工程组织

- **城市服务注册表**：每个城市子系统（宗教、招工、迁移、火灾、治安、节庆等，见 `source/city/cityservice_*.cpp`）继承 `city::Srvc`，实现 `timeStep`、`save`、`load`，
  用宏 `REGISTER_SERVICE_IN_FACTORY` 在静态初始化时注册进 `ServiceFactory`，城市按名字创建。分析：与本作的系统注册是同一思路（`core/system.ts` 定义 `GameSystem`，`game/registry.ts` 用 `import.meta.glob` 自动发现各系统，不维护共享列表）；
  它的教训是静态初始化顺序不可控，本作的对策是按 `GameSystem.order` 加 id 排序，而不是靠注册先后。
- **数据化**：住房需求表（`house.model`）、招工距离（`workershire.model`：36 格）、迁移参数（`migration.model`：检查间隔 2 天、失业影响 150）、
  玛尔斯之怒（`mars_wrath.model`）等都在数据文件里，代码只读键。
- **按需求选路的服务者**（`ServiceWalker::evaluatePath`）：服务者出门前比较若干候选路线，路线分数 = 沿途可服务建筑的 `evaluateService` 之和 × 占地面积，
  住房的需求分 = 下一级对该服务的要求 × (100 − 当前覆盖值)（`HouseSpecification::evaluateServiceNeed`）；选定后沿途"预约"服务（`_reservePath`），
  避免两个服务者走同一条街。分析：比 Julius 的伪随机游走更聪明，也更接近"官员按需调度"，可借给 AI 部门官的巡视与送货路线。
- **招工者**（`WorkersHire::timeStep`，每周）：缺人的工作建筑派出招工者，按玩家设定的行业优先级先派；招工者在 36 格内从住房里拉人。
  这是"劳力是住房里的实体人数"的做法，与 Julius 的全城劳力池不同。
- **随机数**：`source/core/math.hpp` 的 `math::random` 用 `std::random_device` 播种，不可回放。

### 2.5 对《箱庭纪》的借鉴（分析）

可直接借的方法：

1. **覆盖计数器加衰减**。对第 3.6 节的服务覆盖：每栋住房（或每个地段）对每种服务有一个计数器；服务建筑按其人手比例决定"刷新频率"，
   刷新时对"拓扑分钟数 ≤ 覆盖半径"的住房把计数器拉满；每日减 1；>0 即享受该服务。这样不用逐 tick 模拟游走者，又保留了
   "服务建筑缺人，覆盖会在几十天后逐步消失"的手感。计数器满值与衰减速度做成数据。
2. **逐栋住房分级加滞回**。第 5.4 节的五层需求可以落成"住房等级表"：每级列出需求（粮种数、衣物、医疗、治安、信仰、市集、酒、族裔屋、学堂……）与合意度阈值；
   进化先查本级再查下一级，退化要连续三次确认。聚落级的需求满足度 = 按人口加权的"满足某层的住房占比"，取代 `runPopulation` 里的全聚落布尔判断。
   "住房可升级；税基 +20%"（第 5.4 节安定层效果）就直接是等级表里的税倍率。
3. **进化说明文字**。每栋住房每日生成一个"差什么"的原因码（机器码加人话），正好是第 8.7 节可读性与第 3.4 节"机器码 + 人话原因"的同一种做法。
4. **劳力九类加优先级**。照 2.4.6 实现，类别换成本作领域；部门官调优先级不计依赖，玩家亲手封存产业或指派具名居民计依赖（第 8.2 节依赖增量表）。
5. **仓储状态与目的地优先级**。每个仓储建筑对每种货有"收、不收、取货"三态加"全部清空"，出货按固定优先级挑目的地，人手不足的仓不收货；
   这些状态就是第 9 节"常设命令"的一部分。
6. **风险时钟**。火险、损坏、疫病风险都做成逐栋累积量，由对应服务覆盖清零（卫兵所、医馆、工匠）。

与女神 GM 的对照：

| 维度 | 《凯撒 III》诸神 | 本作女神（[`goddess_gm.md`](../../40_design/systems/goddess_gm.md)） | 借鉴（分析） |
| --- | --- | --- | --- |
| 情绪来源 | 宗教覆盖率、节庆、相对神庙数、人口下限 | 信仰份额与神殿放大决定神力收入与触达度（第 4.1 节） | 把"覆盖率与相对冷落"作为女神对聚落的**态度底座**，与神力预算分开：神力决定能做什么，态度决定想做什么 |
| 惯性 | 每天向目标走 1 点 | 无明确惯性 | 态度带惯性，避免一座神殿落成次日就翻脸 |
| 积怒与阈值 | 怒气累积到 20 小罚、50 大罚，罚后清零并回升情绪 | 神力预算、透支、枯竭（第 4.3 节） | 怒气是"想罚"的累积量，神力是"能罚"的预算；二者都过阈值才进入 AI 女神的候选动作 |
| 宽限期 | 距节庆 3 个月内不罚 | 供品、祈祷（第 10.1、10.2 节） | 节庆与供品给出明确的"宽限窗口"，是玩家可操作的反制 |
| 小城豁免 | 人口少时情绪下限高，几乎不发怒 | 注视度（第 3.4 节）、"谨慎的强者" | 下限随人口降低，正好表达"低调的小村不入神眼" |
| 后果 | 写死的赐罚效果 | 注册修正项、带预兆、可追溯（D-013） | 每档赐罚对应一个注册修正项通道（刻瑞斯对应 `harvest`，墨丘利对应仓储），效果显性或半显性 |
| 预兆 | 只有"众神不悦"消息 | 必须有预兆 | 把"不悦""震怒"消息扩成第 10.2 节的预兆表 |
| 决策者 | 公式加随机抽一位 | 大模型提意图，内核裁决 | 公式算态度与怒气，AI 在注册菜单里挑动作与时机；AI 不能改强度上限 |

要改造的点与不要学的坑：

- 不要逐 tick 模拟成百上千个游走者：L4 人口池不画逐人行为（第 3.7 节），游走只做表现层。
- 原作有若干逻辑缺陷被原样保留（维纳斯拿不到最多神庙加成、合意度越界时裁错格），移植公式时要审。
- Caesaria 的全局随机与静态注册不要学；它的"按需求选路"和"原因列表"要学。
- 《凯撒 III》的诸神惩罚完全不可追溯来源以外的东西（只说"刻瑞斯发怒"），本作要求可追溯"谁干的、为什么"。

与现有实现的差距：没有逐栋住房状态、没有空间覆盖、没有劳力分类（只有 `foodFirst` 政策的粮食建筑优先）、仓储无状态、火灾只是每日按概率掷骰而没有逐栋风险累积、诸神与城市没有态度联动（目前女神只能经修正项作用于产出与兽袭概率）。

### 2.6 许可与复用边界

Julius 为 AGPL-3.0，Caesaria 为 GPL-3.0：**只借方法，不拷代码**。住房需求表等数值来自原作《凯撒 III》，引用量级可以，整表照搬没有必要也不合适。
运行两者都需要原作数据，这些数据不可再分发。

---

## 3. Lincity-NG

### 3.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-126` |
| 仓库 | https://github.com/lincity-ng/lincity-ng |
| 固定提交与日期 | `21796de530d68b30881c6b0f6a6a9d6bbfb1e31a`（2026-10-04） |
| 代码许可 | GPL-2.0-or-later（`COPYING.txt` 为 GPL-2.0 全文，源文件头写"version 2 ... or any later version"） |
| 素材许可 | `COPYING-data.txt`：模型、SVG、图像、声音、音乐与 XML 数据文件为 GPL 与 CC-BY-SA 2.0 双许可；字体另见 `COPYING-fonts.txt` |
| 语言与规模 | C++；模拟目录 `src/lincity` 约 1.3 万行（建筑模块在 `src/lincity/modules/`） |
| 本地镜像与检出目录 | `D:\hakoniwa_refs\lincity_ng`：`src/lincity` |
| 分级 | 必读 |

### 3.2 值得看的理由

- 它不模拟车，而是让**每块路、每栋建筑都是一个装商品的容器**，商品按"填充比例趋于一致"在相邻容器间流动。
  这是第 6.4 节"聚落内搬运工自动搬运、搬运时间计入生产周期"与第 3.5 节"道路运力与拥堵"最便宜的统一实现。
- 人口池与棚户区自动出现，对应第 5.2 节难民与第二幕"墙外营地"。
- 可持续性检验是"连续若干年在若干条件下自给"的显式判定，与第 8.2 节自持记录 S、第六幕审期自持同构。

### 3.3 源码导读（路径相对 `src/lincity/`）

| 想弄懂 | 就读这些文件与符号 | 该处机制 |
| --- | --- | --- |
| 商品与规则 | `commodities.hpp` `Commodity`、`CommodityRule`（`maxload`、`take`、`give`） | 每类建筑对每种商品有容量与收发许可 |
| 液位均衡流动 | `lintypes.cpp` `Construction::trade`、`Construction::equilibrate_stuff`；`transport.hpp` `TRANSPORT_RATE`、`TRANSPORT_QUANTA`、`MAX_*_ON_TRACK/ROAD/RAIL/IN_MARKET` | 与邻居求平均填充率，按速率限幅搬运 |
| 主循环 | `simulate.cpp` `World::do_time_step`、`World::simulate_mappoints`、`World::do_periodic_events` | 每日随机打乱建筑顺序，逐个 `trade` 再 `update` |
| 市场 | `modules/market.cpp` `Market::update` | 市场与范围内伙伴直接交换，收发许可可由玩家逐商品设置 |
| 居民 | `modules/residence.cpp` `Residence::update`；`modules/residence.hpp` `WORKING_POP_PERCENT`、`RESIDENCE_PPM` | 好坏分数驱动单人迁入迁出、出生死亡 |
| 棚户 | `modules/shanty.cpp` `update_shanty` | 无家可归池超过阈值即自动生成棚户 |
| 税 | `lintypes.cpp` `equilibrate_stuff`（`world.taxable` 累计）；`simulate.cpp` `end_of_month_update`、`end_of_year_update` | 按实际交付给消费者的劳力、商品、煤计税 |
| 污染 | `engine.cpp` `World::do_pollution`、`World::scan_pollution` | 污染格随机向四邻流出 1/16 |
| 覆盖 | `engine.cpp` `World::do_fire_health_cricket_power_cover` | 覆盖标记双缓冲，每 3 个月从"检查位"拷到"覆盖位" |
| 可持续性 | `simulate.cpp` `World::sustainability_test`、`World::sust_fire_cover`；`sustainable.hpp` `SUST_*_YEARS_NEEDED`；`modules/coalmine.cpp`、`oremine.cpp`、`port.cpp`（清零旗） | 六个条件的连续年数计数 |
| 技术等级 | `simulate.cpp` `end_of_month_update`；`lin-city.hpp` `TECH_LEVEL_LOSS_START`、`TECH_LEVEL_LOSS`、`TECH_LEVEL_UNAIDED`；`modules/school.cpp`、`university.cpp` | 高于门槛按比例流失，学校大学持续补充 |
| 公社 | `modules/commune.cpp` `Commune::update` | 低技术自给单位：产煤矿钢、回收垃圾、消减污染 |

### 3.4 机制拆解

#### 3.4.1 液位均衡流动

```
每座建筑或每块路（Construction）对每种商品 s：
  center_lvl = 本体存量，center_cap = 本体容量（撤离中时容量视为 0，强制往外倒）
  参与者 = 本体 + 邻居中"按液位高低方向，双方收发许可都允许流动"的那些
  ratio = Σ参与者存量 × 1000 / Σ参与者容量             // TRANSPORT_QUANTA = 1000
  对每个参与的邻居（equilibrate_stuff）：
     目标 = ratio × 邻居容量 / 1000
     流量 = 目标 − 邻居存量
     若方向与收发许可不符：0
     单次限幅：|流量| ≤ 本体（发起交换的中心）容量 / 8      // TRANSPORT_RATE = 8
     不能让本体变负或溢出
     若是交给"非路、非市场"的消费者：把流量记入全城应税量（劳力、商品、煤）
     本体与邻居各自加减
  若本体是路：交通读数 = 0.9 × 旧读数 + 0.1 × 本拍最大单向流量（换算成占容量比例）；读数够高时才生成装饰性的车辆
```

- 路的容量按等级放大：以食物为例，小径 2048、道路 ×4、铁路 ×16、市场为铁路的 ×8；劳力在道路上 ×5、铁路上 ×25（`transport.hpp`）。
  所以升级道路的意义就是"每格能缓存与转运更多"，拥堵即"填充率高、流量顶到限幅"。
- 每日 `simulate_mappoints` 把所有建筑随机打乱后逐个处理（`std::shuffle` 配全局随机引擎），用随机顺序抵消"先处理者占便宜"的偏差。
  分析：本作要确定性，可以用按系统命名的随机流做打乱，或改为"先算所有目标流量、再统一结算"的同步更新，后者顺序无关但需要处理冲突。
- 市场（`Market::update`）不连路网邻居，而是与范围内的"伙伴"建筑直接做同样的均衡；市场对每种商品的收发许可可由玩家切换，
  从而成为玩家控制货物流向的阀门。

#### 3.4.2 居民、就业与人口池

```
Residence::update（每日，每栋）：
  good = 30，bad = 35
  医疗覆盖 good +15（并降低死亡率）；消防覆盖 good +15，否则 bad +5；板球场覆盖 good +20
  吃饱喝足（存量 ≥ 人口）：消耗，good +10；否则 bad +250，且有饿死风险
  有电：good +10；没电 bad +15，曾经有电又断了再 +50
  就业：产出劳力 = 人口 × (58% + 摆动)，摆动随本体劳力仓的空余比例在 0～2% 间变化（医疗、板球覆盖再加）
        劳力仓放得下：good +20，再买商品（人口/4）并产垃圾（人口/12）各 good +10，有电再多买一份
        放不下（没人要劳力）：失业，bad +70
  住宅类型加成：HL 型 +40，HH 型 +100（共 LL、ML、HL、LH、MH、HH 六型，字母含义待核实）
  污染 bad += 污染/20；无家可归池越大越吸引人：good += 池/27
  出生死亡：各有基础率，受档次、医疗、污染修正，按随机数一次增减一人
  迁移：r = 随机(0, (good + bad) × 20)
        r < bad（或人口超上限）：一人离开进入无家可归池
        r 落在顶端 good 个数里且池中有人：池中一人迁入
```

- 即每日"迁出概率约为 bad / (20 × (good + bad))，迁入概率约为 good / (20 × (good + bad))"（分析，按上式推算），
  好坏分数是一本可读的账，却以单人随机流动表现出来。
- 棚户（`update_shanty`）：无家可归池减去公社容纳后，每超过一个棚户容量就需要一座棚户；不足则自动在地图上放棚户，
  过多则拆；每座棚户每次检查让池里死去 5 人。棚户本身产垃圾与污染、易起火。
- 税（`end_of_year_update`）：所得税按全年"交付给岗位的劳力量"计，商品税按"交付给消费者的商品量"计并随技术等级略增，出口按量递减折价。
  分析：这是"按实际流量计税"，与本作经济第 6.1 节交易税、田赋的税基思路一致，比按人头更不易被刷。

#### 3.4.3 可持续性检验

```
每年（sustainability_test）：
  采矿：今年没有任何煤矿、矿场、垃圾场采掘（各模块会把旗清零）则年数 +1，否则清零
  外贸：今年港口没有进出口则 +1，否则清零
  资金：年末资金不少于去年则 +1，否则清零
  人口：与计数起点相差不超过 2.5%（且不少于最低人口）则 +1，否则重置起点并清零
  技术：未比最高点下降 1% 以上（且不低于最低技术）则 +1，否则清零
  消防：每三年检查一次所有建筑都在消防覆盖内，是则 +3，否则清零
  六项都达到所需年数（采矿与外贸 180、技术 120、资金人口消防 60，见 sustainable.hpp）即宣布"可持续经济"
```

分析：这是本作"离手"最好的数值样本：不是看一次危机打赢没有，而是看"连续 N 期不靠外援（采矿对应古澱与庭院输血，外贸对应门扉投放）、财政不亏、人口稳定、人才不流失、风险全覆盖"。
第 8.2 节自持记录 S 目前只来自事件考验（`autonomy.ts` `recordTrial`），可以加一条"自给连胜"项；第六幕"审期自持"（act6 第 2.4 节）可直接用这种逐项连胜计数来结算。

#### 3.4.4 技术等级、污染与覆盖

- 技术等级（`end_of_month_update`）：超过 `TECH_LEVEL_LOSS_START`（11000）后每月按 `技术/500 × (1 + 人口项)` 流失；低于门槛时每月自涨 2；
  学校、大学按工作量持续补充（`TECH_MADE_BY_SCHOOL`、`UNIVERSITY_TECH_MADE`）。建筑按技术门槛解锁（`GROUP_*_TECH`）。
  分析：对应第 8.2 节人才厚度 T 与第 7 节人才：知识不维护就衰减，越高越难维持。
- 污染（`do_pollution`，每 14 天）：污染 > 10 的格各向一个随机邻格流出 1/16，北、西方向概率各 3/11，南、东各 2/11（带"风向"偏置），
  1/11 留在原地并自减 2；地图边缘的污染除以 64 直接消散。
- 覆盖（`do_fire_health_cricket_power_cover`，每 3 个月）：各覆盖源在"检查位"上标记范围，统一拷到"覆盖位"后清空检查位，即双缓冲。
  分析：双缓冲保证本拍读到的覆盖与写入顺序无关，是确定性实现的好习惯。

### 3.5 对《箱庭纪》的借鉴（分析）

可直接借的方法：

1. **L4 搬运用液位均衡**。聚落内：生产建筑、仓库、市集、路段都是容器，每日若干拍按 3.4.1 均衡；生产建筑的产出仓满了就应停产（现行 `runProduction` 并不停产：原料照扣、溢出产出丢弃，只写"仓库已满"说明），
   但"满"变成了局部的、有位置的；路段的流量读数就是第 3.5 节的运力占用与拥堵来源。搬运时间自然体现为"货要经过几拍才流到"。
   聚落之间的车队与商队仍用显式实体（可被袭击，第 6.4 节），不走均衡流。
2. **收发许可即常设命令**。每个仓库、市集对每种货的收发开关，加上"粮仓低于 15 天自动减酒"这类条件，构成第 9 节的村落级委托工具。
3. **人口池与棚户**。第 5.2 节难民先进入"无家可归池"，池超过住房与公灶的承载就在聚落边缘生成窝棚区（墙外营地），窝棚区有卫生、火险、治安代价；
   这比现行做法（`addPopulation` 只按阶段人口上限截断，住房空余由迁入、难民投奔等调用方各自截断，剧情加人可超出住房）更符合"难民来得多、来得急"。
4. **自给连胜**。见 3.4.3。
5. **按流量计税**。交易税、田赋按实际交付量累计（经济第 6.1 节），与拉弗曲线的税基一致。

要改造的点：

- Lincity 的随机打乱与 `rand()` 随处可见（居民迁移、出生死亡、污染方向、随机火灾），不可回放（种子管理待核实），本作全部改用命名随机流，或改为确定性期望值加累积小数（我们 `production.ts` 已有 `carry` 小数进位的写法）。
- 澱不同于污染：正典说澱不流动、只沉积汇聚，圣教净化才把它推向下游（[`city_building.md`](../../40_design/systems/city_building.md) 第 12.1 节）。
  因此不要照搬随机扩散；可借"有向流"的写法，把净化推送实现为沿河流方向的确定性流出。

不要学的坑：每格都是容器会让容器数量很大；本作应以地段或路段为单位，而不是逐格。

与现有实现的差距：库存是全聚落一个池，没有位置；没有无家可归池；税只按人头；自持记录没有"连胜"。

### 3.6 许可与复用边界

代码 GPL-2.0-or-later：**只借方法，不拷代码**。数据与美术为 GPL 或 CC-BY-SA 2.0 双许可，如需借用素材须署名并以相同方式共享（本作不打算用其美术）。

---

## 4. Unknown Horizons

### 4.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-163` |
| 仓库 | https://github.com/unknown-horizons/unknown-horizons |
| 固定提交与日期 | `c344bf093df75b1d7a08b2b1306ab2f0664ef54a`（2026-11-11） |
| 代码许可 | GPL-2.0-or-later（`doc/LICENSE`、源文件头）；个别文件为 MIT、BSD-3（`doc/licenses/`） |
| 素材许可 | 自有音像素材为 CC-BY-SA 3.0；部分第三方素材为 CC-BY、CC-BY-SA、OFL（字体）等，逐项列在 `doc/LICENSE` |
| 语言与规模 | Python（基于 FIFE 引擎）；`horizons/` 约 6.8 万行；内容数据为 YAML（`content/objects/`）与 SQL（`content/*.sql`） |
| 本地镜像与检出目录 | `D:\hakoniwa_refs\unknown_horizons`：`horizons`、`content/objects`；`content/*.sql` 用 `git show` 只读查看 |
| 分级 | 必读 |

### 4.2 值得看的理由

- 居民等级（水手、开拓者、定居者、市民、商人、贵族）是第 5.4 节需求层级的《纪元》式实现，且全部数据化。
- 它把"需求"做成**住房自身的生产线**：消耗一份食物产出若干幸福，服务（信仰、教育、社区）也是一种可收集的资源。这一抽象非常适合 L4 人口池。
- 收集者（运输工）的任务挑选与预约、AI 玩家的目标调度、生产链树，分别对应第 6.4 节搬运、AI 工务官与第 6.2 节供给链审计。

### 4.3 源码导读

| 想弄懂 | 就读这些文件与符号 | 该处机制 |
| --- | --- | --- |
| 住房定义与需求线 | `content/objects/buildings/tent.yaml`（`ProducerComponent.productionlines`、`settler_upgrade_lines`、`CollectingComponent`） | 每条线：消耗一种需求品，产出幸福，按等级启用 |
| 等级与平衡值 | `content/game.sql` 表 `tier`；`content/balance.sql` 表 `balance_values` | 每级税基与人数上限；幸福阈值 |
| 居民逻辑 | `horizons/world/building/settler.py` `Settler.pay_tax`、`inhabitant_check`、`level_check`、`level_up`、`level_down`、`_check_main_square_in_range` | 每"月"一次：交税、增减人口、升降级 |
| 幸福即资源 | `horizons/world/production/production.py` `SettlerProduction` | 生产开始即给幸福 |
| 税设置 | `horizons/constants.py` `TAX_SETTINGS_MIN`、`TAX_SETTINGS_MAX`、`TAX_SETTINGS_STEP` | 每级税率 0.5～1.5 |
| 收集者 | `horizons/world/units/collectors/collector.py` `Collector.check_possible_job_target_for`、`get_best_possible_job`、`JobList` 的各 `_sort_jobs_*`；`buildingcollector.py` `SettlerCollector`、`StorageCollector` | 找可取货目标、扣掉同伴已预约量、按策略排序 |
| 收集者配置 | `content/objects/units/collectors/settlercollector.yaml`（`RestrictedPickup`、`radius`） | 居民收集者只能去主广场、凉亭、学校、酒馆取货 |
| 生产链定义 | `content/objects/buildings/*.yaml`（如 `bakery.yaml`） | 每栋生产建筑的输入输出、时间、仓位 |
| AI 目标调度 | `horizons/ai/aiplayer/__init__.py` `AIPlayer.handle_settlements`；`goal/__init__.py` `Goal`；`settlementmanager.py` `SettlementManager` | 收集各聚落目标、按优先级排序、执行并按结果阻断 |
| 生产链树 | `horizons/ai/aiplayer/productionchain.py` `ProductionChain`、`ProductionChainSubtree.get_final_production_level`、`get_expected_cost` | 从生产线自动推出"造某物需要哪些建筑及比例" |
| 需求测算 | `settlementmanager.py` `get_resource_production_requirement`、`get_ideal_production_level`、`refresh_taxes_and_upgrade_permissions` | 由居民需求线反推每 tick 需求 |
| 自由商船 | `horizons/ai/trader.py` `Trader.reached_warehouse`、`ship_idle`；`horizons/component/tradepostcomponent.py` `TradePostComponent`、`TradeSlotInfo`；`horizons/constants.py` `TRADER` | 按聚落设定的买卖槽交易 |

### 4.4 机制拆解

#### 4.4.1 等级、需求线与幸福

等级表（`content/game.sql` 表 `tier`）：

| 等级 | 税基 | 每栋人数上限 |
| --- | --- | --- |
| 水手 | 3 | 2 |
| 开拓者 | 6 | 3 |
| 定居者 | 10 | 5 |
| 市民 | 15 | 8 |
| 商人 | 21 | 13 |
| 贵族 | 28 | 21 |

住房的需求线（`tent.yaml`，节选）：水手每 60 秒消耗 1 食物得 15 幸福、每 90 秒消耗 1 信仰得 5 幸福；开拓者食物 13、信仰 3、教育 3、织物 5；
定居者起食物 12、教育 5、聚会 4、盐 4、烟草制品 5；社区（主广场提供）为水手到市民每 90 秒 1 幸福；商人另需卫生。
线的时间会随人口变化：每次人口增减，所有需求线的时间按 `6/7 × ln(1.5 × (人数 + 1.2))` 调整（`inhabitant_check`），人越多消耗越快。

幸福是住房仓库里的一种资源（`RES.HAPPINESS`，仓位 100），初值 50（`balance.sql`）。服务不靠游走覆盖，而是凉亭产"信仰"、学校产"教育"、
主广场产"社区"，住房自己的收集者（半径 5，载量 8）去这些建筑取货（`settlercollector.yaml` 的 `RestrictedPickup`）。

#### 4.4.2 每"月"一次：交税、增减人口、升降级

```
Settler._tick（每个游戏内结算周期）：
  pay_tax：
     税 = 税基[等级] × 本级税率设置 × (0.5 + 幸福/70) × (人数/人数上限) × 难度系数
     d = 1 − 税率设置；幸福 += round(10d − 6|d|) − 6
        // 税率 1.0 时 −6，0.5 时 −4，1.5 时 −14：幸福在每个周期被"税"消耗，靠需求线补回
  inhabitant_check：幸福 > 70 且未满则 +1 人；幸福 < 30 且多于 1 人则 −1 人
  level_check：
     幸福 > 80 且人数 ≥ 本级下限（本级下限 = 上一级的人数上限，get_tier_inhabitants_min）且无灾害：
        已到本岛最高等级：提示一次
        否则加一条"升级材料"生产线（如升开拓者要 3 块木板，升定居者要木板加砖）；聚落若禁止该级升级则把这条线暂停
        材料送到即升级，幸福重置为 50
     幸福 < 10 或人数 < 本级下限：降级（最低级再降则变废墟），幸福重置为 50
```

- 每级税率（0.5 到 1.5，步长 0.1）与"是否允许升级"都是**聚落级、按等级**的设置（`settlement.tax_settings`、`settlement.upgrade_permissions`）。
  AI 用一组人格参数在不同阶段切换这两组设置（`refresh_taxes_and_upgrade_permissions`）。分析：这正是第 9 节城镇级"政策卡"的形态。
- `_check_main_square_in_range`：每月检查范围内是否有经道路可达的主广场，没有就挂状态图标并发消息。分析：这是"服务可达性"的可读提示，可借给第 3.6 节。

#### 4.4.3 收集者：任务挑选与预约

```
收集者找活（Collector.search_job）：
  对每个候选目标、每种可收资源（check_possible_job_target_for）：
     可取量 = 目标可供量
     家仓剩余 = 家仓该资源空位 − Σ同伴收集者已接任务中该资源的数量     // 预约，避免一起去拉导致溢出
     本体剩余 = 收集者自身载量空位
     实取 = min(可取量, 家仓剩余, 本体剩余)，>0 才算一个任务
  排序策略（JobList，由建筑配置选择）：
     amount：可取量多者优先
     fewest_available：家仓里最缺的优先（先打乱再排序，同分随机）
     fewest_available_and_distance：先近后缺
     for_storage_collector：先拉"目标仓已满"的，再近，再缺           // 仓库收集者用，解除生产建筑的堵塞
     distance、random
  取排序后第一个能找到路径的任务（寻路只对排好序的候选做，省开销）
```

- 打乱用 `session.random`（会话级可种子随机），因为 Unknown Horizons 支持多人锁步。
- 分析：本作第 6.4 节的 L4 搬运若不用液位流（见第 3 节），这套"预约扣减 + 可配置排序"就是逐车搬运的最小正确实现；
  `for_storage_collector` 的"先疏通满仓"规则尤其值得借，它直接消除"仓库满了生产就停"的大部分情况。

#### 4.4.4 AI 玩家：目标调度与生产链

```
AIPlayer.handle_settlements（每个 AI tick）：
  收集所有可激活目标（全局目标 + 每个聚落管理器的目标），各自 update() 刷新优先级
  按优先级降序排序（同优先级按创建序号，保证确定）
  依次 execute：
     结果 SKIP：跳过
     结果 BLOCK_SETTLEMENT_RESOURCE_USAGE（缺材料）：本聚落后续目标全部跳过，标记"需要材料"
     其他（建成了一样东西）：本 tick 结束                         // 注释原意：否则 AI 看起来太快
  最后刷新各聚落的税率与升级许可
```

- 目标清单（`SettlementManager.__init_goals`）：木板、信号火、扩大收集范围、改善收集覆盖、砖、仓储空间、各需求品（食物、社区、信仰、织物、教育、聚会、盐、烟草、工具）、
  帐篷、商船、战船、消防、医生等；每个目标的优先级与启用等级来自人格模块（`personality`）。
- 生产链树（`ProductionChain`）：对某资源，从所有建筑的生产线里找"产出它的线"，递归展开其消耗品，得到一棵带比例的树；
  同一资源有多种产法时为"选择节点"，按预期成本挑；树的"最终产能"取瓶颈（子树产能最小者）。
- 需求测算：由所有住房的需求线反推每 tick 需求（`get_resource_production_requirement`），再乘人格里的富余系数，
  减去其他聚落的产量与净出口，得到本聚落的理想产量（`get_ideal_production_level`）。

#### 4.4.5 自由商船

自由商船随机驶向某聚落的仓库（50% 概率去仓库，否则随机航行，`TRADER.BUSINESS_SENSE`），到港后按聚落"买卖槽"设定逐种交易：
每种随机 2 到 10 吨，买不起就逐吨减少重试；价格 = 资源基准价 × 数量（`PRICE_MODIFIER_*` 均为 1.0）。
`reached_warehouse` 里遍历买卖清单前先排序，注释写明"多人游戏必须各端顺序一致"。

### 4.5 对《箱庭纪》的借鉴（分析）

可直接借的方法：

1. **需求即生产线**。L4 人口池的每一层需求可写成数据：`{层, 消耗品或服务, 周期, 幸福增量}`。粮、衣物、酒是实物；
   "信仰""治安""教化""议事"是服务建筑产出的虚拟资源，经覆盖（第 2 节的计数器）或收集交给人口池。这样第 5.4 节的需求层级、第 5.5 节的幸福账本、
   第 6 节的生产链共用一套"消耗与产出"代码，账本条目天然带来源（哪条需求线、哪天）。
2. **幸福被税持续消耗**。每个结算周期按税率扣幸福、靠需求线补回，比"高税时幸福 −2"的静态因子更能表达"加税是持续的压力"，
   且与经济第 6.1 节拉弗曲线自然耦合。
3. **升级需要材料与许可**。住房升级不是自动的，要送来材料，且聚落可以按等级"暂停升级"。这给第 9 节委托增加了一个低成本、易懂的工具
   （"本季不许木屋升石屋，省下石料修城墙"）。
4. **收集者预约与排序策略**。见 4.4.3。
5. **AI 目标调度**。现行 `officials.ts` `utilityAction` 是每个领域各自一组规则；可以在其上加一层"全聚落目标列表加优先级排序加结果阻断加每 tick 一项建设"，
   让 AI 工务官的扩建节奏可控、可解释（每个目标的优先级来自官员的能力与理念，即本作的"人格"）。
6. **生产链树做供给链审计**。第 6.2 节要求"每级都过一遍供给链审计"，可以在内容构建时从建筑定义自动推出每种资源的生产树、比例与瓶颈，
   作为测试固化（每种关键材料至少一个保底来源）。

要改造的点：

- Unknown Horizons 以秒为单位的生产线时间、依赖 FIFE 引擎的调度器，本作改为游戏日与 20Hz tick。
- 幸福 0 到 100 的单一资源与本作 −30 到 +30 的因子账本口径不同，可让需求线写入账本条目而不是累加一个数。

不要学的坑：人格参数散落在多个 Python 模块里，调参困难；本作人格应进内容数据。

与现有实现的差距：需求层级目前是硬编码的布尔检查（`population.ts` 中 `stability`、`prosperity` 等），新增一种需求就要改代码；没有住房升级材料与许可；
AI 官员没有跨领域的目标排序。

### 4.6 许可与复用边界

代码 GPL-2.0-or-later：**只借方法，不拷代码**。YAML 与 SQL 中的平衡数值可作参考量级。自有美术音频为 CC-BY-SA 3.0，若借用须署名并以相同方式共享。

---

## 5. OpenRCT2（选读）

### 5.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-155` |
| 仓库 | https://github.com/OpenRCT2/OpenRCT2 |
| 固定提交与日期 | `33c8730e340df5324d054beb508b17a9937959ac`（2026-11-14） |
| 代码许可 | GPL-3.0（`licence.txt`，源文件头"licensed under the GNU General Public License version 3"） |
| 素材许可 | 运行需要原作《过山车大亨 2》数据；OpenRCT2 自有的替代图形与对象在其他仓库（待核实） |
| 语言与规模 | C++；只读了 `src/openrct2/entity/Guest.cpp` 与 `world/Park.cpp`（合计约 8600 行）及少量相关文件 |
| 本地镜像与检出目录 | `D:\hakoniwa_refs\openrct2`：`src/openrct2/entity/`、`src/openrct2/peep/`、`src/openrct2/park/`、`src/openrct2/world/Park.*`；`src/openrct2-ui/windows/GuestList.cpp` 用 `git show` 查看 |
| 分级 | 选读 |

### 5.2 值得看的理由

只看"把模拟状态变得可读"：游客的想法、幸福的目标值、公园评分、员工巡逻区。对照 [`city_building.md`](../../40_design/systems/city_building.md) 第 8.7 节可读性、
第 9 节请示合并，以及第 5.5 节"集体指标写进具名居民的观察栏"。

### 5.3 源码导读与机制

| 想弄懂 | 就读这些文件与符号 | 该处机制 |
| --- | --- | --- |
| 想法的数据结构 | `src/openrct2/entity/Guest.h` `PeepThought`、`kPeepMaxThoughts` | 每名游客 5 个想法槽，每个带类型、参数（某设施或某商品）、新鲜度 |
| 插入新想法 | `src/openrct2/entity/Guest.cpp` `Guest::insertNewThought` | 同类型同参数的旧想法先移除，新想法压到最前 |
| 想法的老化 | `Guest.cpp` 静态函数 `GuestUpdatethoughts` | 一次只有一个"新鲜"想法；两个新鲜想法至少间隔 220 tick；之后每 256 tick 老化一级，老到 28 级移除（约 6900 tick） |
| 幸福目标值 | `Guest.cpp` `Guest::updateMotivesIdle`、`Guest::updateConsumptionMotives` | 事件改"目标值"，实际值每次向目标靠近 4；闲逛时目标向 128 回归，饥渴疲劳如厕扣目标 |
| 公园评分 | `src/openrct2/world/Park.cpp` `CalculateParkRating` | 多项加总、裁到 0～999 |
| 想法汇总界面 | `src/openrct2-ui/windows/GuestList.cpp`（`summarised` 页、`GuestGroup`、`kMaxGroups` 为 240） | 按想法把游客分组计数，点击某组即筛出这些游客 |
| 巡逻区 | `src/openrct2/entity/PatrolArea.h` `PatrolArea`、`UpdateConsolidatedPatrolAreas`、`IsPatrolAreaSetForStaffType`；`src/openrct2/entity/Staff.cpp` `Staff::isLocationInPatrol` | 每名员工一个 4×4 格粒度的区域集合；同工种的区域合并成一张总表 |

公园评分 `CalculateParkRating`（起点 1150，困难模式 1050）：

| 分项 | 计算 |
| --- | --- |
| 游客数 | −150 + min(游客, 2000)/13 |
| 游客幸福 | −500 + 2 × min(250, 幸福游客数 × 300 / 游客数)，幸福指幸福值 > 128 |
| 迷路游客 | 超过 25 人后每人 −7 |
| 设施可用率 | −200 + 2 × 平均正常运行率 |
| 刺激与强度 | −100 + (100 − min(\|平均刺激 − 46\|/2, 50) − min(\|平均强度 − 65\|/2, 50)) |
| 设施总量 | −200 + (刺激总和 + 强度总和)/10（各封顶 1000） |
| 垃圾 | −600 + 4 × (150 − min(150, 超过约 5 分钟未清的垃圾数)) |
| 事故 | 减去伤亡惩罚 |

员工巡逻：未设巡逻区的员工可去园内任何地方；设了就只在区内找活（例如找最近的垃圾时，垃圾所在格必须在区内）。
区域以 4×4 格为单位（`kStaffPatrolAreaBlocksPerLine`），`UpdateConsolidatedPatrolAreas` 把同工种所有员工的区域并起来，用于判断某处是否有人负责。
游客的随机数用场景级随机 `ScenarioRand`，为多人同步而确定。

### 5.4 对《箱庭纪》的借鉴（分析）

1. **想法槽加汇总**。L4 人口池可为每个池保留一个小的"想法队列"（来源于幸福账本的最大负项、缺失的需求、事件），设新鲜度与最小间隔防刷屏；
   聚落面板按想法汇总计数（"132 人觉得粮价太贵"），点击下钻到池与相关建筑。这与第 9 节"同类请示自动合并"是同一机制。
2. **值加目标值**。幸福、治安、女神态度都用"目标值由账本给出、实际值按固定步长靠近"的写法，与自治度每日 ±1 一致，读数稳定。
3. **评分逐项可拆**。第 8.7 节自治报告已有五个分项；可照公园评分给每个分项写"满分条件"和"当前扣分原因"，玩家一眼看出扣在哪里。
4. **按区授权**。卫兵、工头、搬运队的负责区以地段（4×4 格，与第 3.3 节暂定尺寸一致）为单位划定，合并表用于检测"无人负责的地段"，
   这是第 9 节"授权矩阵"在空间上的版本。

### 5.5 许可与复用边界

GPL-3.0：只借方法。

---

## 6. CorsixTH（选读）

### 6.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-131` |
| 仓库 | https://github.com/CorsixTH/CorsixTH |
| 固定提交与日期 | `a791a54616b83f1b5de19cb51cab3ca8709d44b5`（2026-11-14） |
| 代码许可 | **MIT**（已核实：`LICENSE.txt` 为贡献者版权列表加 MIT 授权全文；Lua 源文件头同为 MIT） |
| 素材许可 | 运行需要原作《主题医院》的图形、声音与数据，不可再分发 |
| 语言与规模 | 游戏逻辑为 Lua（`CorsixTH/Lua/`，含多语言文本共约 13 万行），引擎为 C++ |
| 本地镜像与检出目录 | `D:\hakoniwa_refs\corsixth`：`CorsixTH/Lua` |
| 分级 | 选读 |

### 6.2 值得看的理由

房间的蓝图摆放（墙、门、窗、物件分阶段校验）、"放下后不能把医院切断"的连通检查、物件占地上的"操作位"标志，
与本作第 3.4 节的校验码表（`entrance`、`slot`、`keep_reach`）几乎一一对应；且它是 MIT 许可，代码可借（须随附许可）。

### 6.3 源码导读与机制（路径相对 `CorsixTH/Lua/`）

| 想弄懂 | 就读这些文件与符号 | 该处机制 |
| --- | --- | --- |
| 房间定义 | `rooms/gp.lua` 等（字段 `objects_needed`、`objects_additional`、`minimum_size`、`required_staff`、`maximum_staff`、`categories`） | 每类房间声明必需物件、最小边长、所需员工 |
| 蓝图阶段 | `dialogs/edit_room.lua` `UIEditRoom:setBlueprintRect`、`_enterWaitingClearAreaPhase`、`_enterDoorPhase`、`_enterWindowsPhase`、`_enterObjectsPhase`、`checkEnableConfirm` | 画框 → 清场 → 放门 → 放窗 → 放物件 → 确认 |
| 连通检查 | `dialogs/edit_room.lua` `UIEditRoom:checkReachability`、`UIEditRoom:_checkCanBuildRoomHere` | 临时把蓝图格设为不可通行，沿房间外圈检查相邻可通行格两两连通 |
| 门的位置 | `dialogs/edit_room.lua` 局部函数 `validDoorTile`、`checkDoorWalls` | 门外格须属本院、无物件、可独占通行 |
| 物件占地 | `dialogs/place_objects.lua` `UIPlaceObjects:setBlueprintCell`、`_placementAvailableHereAndOtherObjectsDoNotInterfere`；`objects/desk.lua` 的 `footprint` | 占地格带 `only_passable`、`optional`、`shareable`、`complete_cell`、`need_*_side` 等标志，好格染蓝、坏格染红 |
| 排队 | `queue.lua` `Queue:push`、局部函数 `_getHumanoidQueuePriority`、`Queue:expect` | 门前队列按身份分优先级插队，预期到达者单独计数 |
| 声望 | `hospital.lua` 表 `reputation_changes`、`Hospital:changeReputation`、`isReputationChangeAllowed`、`getReputationChangeLikelihood` | 原因码定额，越接近极值越难再变 |
| 政策阈值 | `entities/humanoids/staff.lua`（`hospital.policies["goto_staffroom"]`）、`entities/humanoids/patient.lua`（`policies["stop_procedure"]`） | 疲劳超过阈值自去休息室，诊断把握超过阈值即停止检查 |

连通检查（`checkReachability`）：把蓝图格临时标为不可通行，然后沿房间四边外侧顺时针走一圈；对每个"可通行且能朝房间方向进入"的外圈格，
检查它与上一个这样的格之间是否仍有路径（`world:getPathDistance`）。只要相邻两段之间断了，就说明这间房会把某片区域切开，拒绝建造。
配置项 `blocking_off_areas` 为 3 时放行但写日志。分析：其正确性来自"任何被切断的区域必然贴着房间的外圈"，因此只需检查外圈两两连通，
计算量与周长成正比，而不是全图。

物件占地：每个占地格是一个表，`only_passable` 表示"此格不建物件但必须可通行"（即使用者站立的位置，桌子前的椅子位），
`optional` 表示可被挡掉一部分，`shareable` 表示可与别的物件共用，`need_north_side` 等要求该格朝某方向有墙；
同一物件四个朝向各有一套占地与 `use_position`。房间必须放齐 `objects_needed` 才能确认（`checkEnableConfirm`）。

排队优先级（数字越小越优先）：正从房里出来的 1，员工 2，贵宾与检查员 3，急诊 4，作弊插队 5，普通病人 6；界面只显示优先级大于 3 的人；默认队长上限 6。
`Queue:expect` 记录"正在赶来的人"，用于在其到达前就占位。

声望：原因码定额（治愈 +1、死亡 −4、赶走 −3、急诊成功 +15、急诊失败 −20、要价过高 −2、过低 +1、房间爆炸 −50），每种病另有自己的声望；
朝极值方向的变化按二次曲线打折：声望 500 时必然生效，380 到 720 之间仍有八成以上，100 或 900 时不到四成，0 或 1000 时为 0。

### 6.4 对《箱庭纪》的借鉴（分析）

1. **补齐 `slot` 码**。把建筑定义里的操作位写成占地格标志（照 `only_passable`），校验器检查"每个操作位在可走格上、在建筑外"，即第 3.4 节的 `slot`；
   `entrance` 则照 `validDoorTile`：门外格可独占通行、无物件、在聚落宣称范围内。
2. **周界连通代替全图比较**。`findSpot` 已把放置前的可达图在每次搜索里只算一次，但每个通过前置校验的候选格仍要算一次放置后的全图可达图（`placement.ts` `reachable`）；
   地块 96×96 到 192×192 时成本会很高。可再改为：候选格只做"外圈两两连通"检查。
3. **分阶段摆放与证据**。墙、门、物件分阶段、每阶段只校验本阶段的规则，并把好格染蓝、坏格染红；这与第 3.4 节"压暗不可用区、亮出可用格、描红挡路物"一致。
4. **声望账与极值折减**。第 5.6 节的风评与 [`reputation_and_cognition.md`](../../40_design/systems/reputation_and_cognition.md) 的传闻画像，可用"原因码定额加极值折减"防滚雪球（第 13 节）。
5. **政策阈值即常设命令**。"疲劳超过 X 去休息"与第 9 节"耐久低于 50 自动修"是同一形态：阈值可调、对所有个体生效、不计依赖。

### 6.5 许可与复用边界

MIT：**可借代码，须随附许可**（保留版权声明与许可全文）。但其代码是 Lua 且与引擎回调耦合，实际以按思路用 TS 重写为宜；原作素材不可用。

---

## 7. 跨项目机制对照

| 机制 | Micropolis | Julius / Caesaria | Lincity-NG | Unknown Horizons | OpenRCT2 / CorsixTH | 本作现状（`src/systems/city/`） |
| --- | --- | --- | --- | --- | --- | --- |
| 节拍 | 16 相位轮转 | 每日 50 槽固定 | 每日全量，周期事件按日数取模 | 调度器按秒，居民每"月" | 每 tick | 日结一次 |
| 服务覆盖 | 站点注入加平滑场 | 游走者刷新计数器，日衰减 | 覆盖位双缓冲，每 3 月刷新 | 服务即资源，收集者取货 | 巡逻区 | 全聚落求和 |
| 住房状态 | 区划密度档编码在瓦片 | 20 级进化，滞回 | 6 档住宅，好坏分数 | 6 级，幸福资源 | 无 | 无逐栋状态 |
| 需求与迁移 | 积分阀加局部评价 | 情绪分档定迁移百分比 | 单人随机迁入迁出加人口池 | 幸福阈值增减人口 | 无 | 吸引力阈值加随机 |
| 劳力 | 无（岗位折算） | 九类加优先级 | 劳力作为商品流动 | 建筑固定人数 | 员工逐个雇 | 按列表顺序贪心 |
| 物流 | 无 | 推车工按目的地优先级 | 液位均衡流 | 收集者预约排序 | 无 | 全聚落单库存 |
| 风险 | 火随机蔓延 | 火险损坏累积，巡视清零 | 随机火，消防覆盖免疫 | 灾害组件 | 无 | 每日掷骰 |
| 可读性 | 十大问题民调、增长率图 | 进化说明、主因、需求统计 | 统计面板 | 状态图标、消息 | 想法汇总、评分分项、排队显示 | 建筑 `note`、状态行、幸福账本 |
| 自给检验 | 无 | 无 | 可持续性连胜 | 无 | 无 | 事件考验 |
| 随机数 | 引擎内部状态 | Julius 可回放；Caesaria 不可 | 全局 `rand()` | 会话级可种子 | 场景级可种子 | 按系统命名的随机流 |

---

## 8. 跨项目结论（均为分析）

1. **两档颗粒度并存**：逐栋（或逐地段）的离散状态负责"手感"，低分辨率场与聚落汇总负责"宏观"。本作应把住房等级、覆盖计数器、火险放在建筑实例上，
   把地价、合意度、澱、污染放在地段场上，聚落指标（需求满足度、治安、幸福）一律从这两层汇总，而不是像 `runPopulation` 那样直接全聚落判断。
2. **覆盖用"计数器加衰减"，到达用"拓扑分钟数"**：取 Julius 的语义（满值、每日减一、人手决定刷新频率）、Micropolis 的数据结构（分块场）、
   第 3.2 节的拓扑图（覆盖半径按分钟数）。这样既不用逐 tick 模拟游走者，又保留"缺人则覆盖慢慢消失"的因果链。
3. **住房分级加滞回是城建的核心循环**：进化阈高于退化阈、退化需连续确认、进化同时检查下一级需求；需求表做成内容数据（Caesaria `house.model`、
   UH `tent.yaml` 都是先例），每栋每日产出一个原因码。
4. **需求是积分，不是阈值**：迁移与产业扩张都用"失衡积分进有界阀，再由局部评价分配"的两段式（Micropolis），阀的惯性与自治度的每日限幅同构，
   可读性也更好（"住宅需求阀 +820"）。
5. **服务与商品统一成资源**：UH 把信仰、教育、社区当作可产可取的资源，配合需求线写入幸福账本，可把第 5.4 节、第 5.5 节、第 6 节合并成一套消耗与产出代码。
6. **物流分两档**：聚落内 L4 用液位均衡流（Lincity），聚落间与可见运输用显式车队（推车工式的目的地优先级加 UH 式预约）；
   两档都必须有容量、预约和"为什么停"的说明。
7. **委托工具都是"阈值、优先级、开关"三种**：Julius 的劳力类优先级与仓储收发态，UH 的分级税率与升级许可，CorsixTH 的政策阈值，Lincity 的市场收发开关。
   本作第 9 节的常设命令、政策卡、授权等级可以统一成这三种原语，AI 官员只是在调这些原语。
8. **每个坏结果都要有计数器或原因码**：火险时钟、进化说明、民心主因、十大问题、想法汇总、评分分项。建议在 `queries.ts` 一侧集中做"为什么"查询，
   内核只产出机器码与数值（与第 3.4 节校验器的"机器码 + 人话原因"一致）。
9. **女神底座公式化，选择交给 AI**：用《凯撒 III》式的"覆盖率加冷落加节庆宽限加人口下限"算出每位女神对每个聚落的态度与怒气（带惯性、确定性），
   AI 女神只决定在注册菜单里何时、对谁、花掉哪一份；赐罚效果全部是注册修正项并带预兆，满足 D-007 与 D-013。
10. **确定性是移植的第一约束**：只有 Julius、UH、OpenRCT2 的随机可回放；任何借来的随机步骤都改用命名随机流，处理顺序要么固定排序、要么用种子打乱、要么改同步更新，
    并为每个移植的公式写黄金样例测试（MicropolisCore 的重构回归是前车之鉴）。

建议的落地顺序（分析，供 `docs/50_tech/` 参考）：覆盖计数器与地段场 → 逐栋住房等级表 → 劳力类优先级 → 火险时钟 → 积分迁移阀 → 液位均衡搬运 → 女神态度底座 → 自给连胜。

---

## 9. 未能获取或略过

| 项目或部分 | 状态 | 原因 |
| --- | --- | --- |
| 3d.city（`#web-088`） | 略过 | 只要求提一句；GitHub 报许可 NOASSERTION，未克隆，模拟层是否来自 micropolisJS 待核实 |
| Micropolis 的 `micropolis-java/`、`laszlo/`、`turbogears/`、`MicropolisCore` 的 Python 前端 | 略过 | 与 C++ 引擎算法相同，只是其他宿主 |
| Julius 的军事、帝国贸易、请求、编辑器 | 略过 | 不属于城建与人口模拟（军事与贸易归同事的主题） |
| Augustus（Julius 的玩法改动分支） | 略过 | 非索引项目，与本主题增量有限 |
| Caesaria 的 `resources/`、`bin/resources/` 美术与地图 | 未检出 | 只用 `git show` 读了少量 `.model` 数据文件 |
| Caesaria 的 `source/objects` 除住房外的大部分建筑、`source/walker` 除服务者外的部分 | 略读 | 机制与 Julius 重合 |
| Lincity-NG 的界面层 `src/gui`、`src/lincity-ng` | 未检出 | 与模拟无关 |
| Unknown Horizons 的战斗、外交、地图生成、网络 | 略过 | 不属于本主题 |
| OpenRCT2 的设施（rides）、轨道、经济其余部分与界面层 | 略过 | 选读只看可读性相关部分 |
| CorsixTH 的 C++ 引擎、疾病与诊断内容 | 略过 | 选读只看摆放、排队与声望 |
| 各项目随附的原作数据（`c3_model.txt` 等） | 未能获取 | 来自商业原作，不在仓库内，也不应获取 |
