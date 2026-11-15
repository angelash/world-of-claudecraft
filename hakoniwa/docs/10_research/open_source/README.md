# 开源游戏源码调研：城建、RTS、SLG（源码级）

> 所属目录：`docs/10_research/open_source/`。调研归档，只记录事实、分析与可借鉴点，不具约束力（正典优先级第 6 级，见 `hakoniwa/CLAUDE.md`）。
> 调研日期：2026-11-15。
> 来源索引：open-share 资料库 `10_md/_external/2026/external-2026-开源游戏源码大全-玩法与引擎索引.md`（原文状态 indexed-unverified，481 个编号条目）。
> 本组文档把其中与城建、RTS、SLG 相关的条目逐一回到仓库核实：读到文件与符号一级，许可以仓库里的 LICENSE、COPYING 为准，每个仓库固定一个提交。
> 与已有调研的关系：[`../open_share/city_rts_slg.md`](../open_share/city_rts_slg.md) 第 7.1 节按方向归类同一索引（概念层）；本组是它的源码级展开。

## 0. 怎么用

- **有具体问题**（例如"住房怎么升级""补给线怎么算""给大模型统治者开放哪些动作"）：先查 [question_map.md](question_map.md)，
  按本作设计文档的章节号找到"先读"的文件与符号，再跳到分册对应小节看机制拆解。
- **想系统学一个品类**：按第 2 节的阅读路线读分册。各分册都写了"我们现在怎么做、差在哪"（城建、RTS、SLG 分册开头有基线表，物流与殖民分册写在各项目的借鉴小节），对照的是 `hakoniwa/src/` 第一轮实现。
- **想打开源码**：本地镜像与重建方法见第 5 节。
- **想直接改代码**：先看第 7 节"对第一轮实现的直接发现"，那些是已经对照过我们源码的具体缺口。

## 1. 分册目录

| 文件 | 主题 | 必读项目 | 选读项目 |
| --- | --- | --- | --- |
| [city_builders.md](city_builders.md) | 城建与人口模拟 | Micropolis、micropolisJS、Julius（《凯撒 III》重实现）、Caesaria（只看工程组织）、Lincity-NG、Unknown Horizons | OpenRCT2、CorsixTH |
| [economy_logistics.md](economy_logistics.md) | 经济型 RTS、物流、贸易、谍报 | Widelands、Seven Kingdoms: Ancient Adversaries、OpenTTD | KaM Remake、Simutrans、Mindustry、Stone Kingdoms |
| [rts.md](rts.md) | 即时战术：单位、阵型、寻路、同步、AI 将领 | 0 A.D.、OpenRA、Curse of War | Warzone 2100、Recoil 引擎与 Zero-K、openage、Command & Conquer HTML5 与 Last Colony、Dune Legacy |
| [slg_4x.md](slg_4x.md) | 大战略、4X、战棋：国家 AI、外交、补给、修正项、英雄带兵、胜算预估 | Freeciv（含 Freeciv-web）、FreeOrion、VCMI、Wesnoth、Unciv | Wyrmsun、Tanks of Freedom |
| [colony_base_management.md](colony_base_management.md) | 地下城经营、基地管理、殖民模拟、NPC 委托 | KeeperRL、OpenXcom、Cataclysm: Dark Days Ahead | Endless Sky、OpenDungeons、UFO:AI、Pioneer |
| [question_map.md](question_map.md) | 按本作设计条目反查源码 | | |

共核实 40 个仓库（必读 21 个，选读 19 个），另有 3 个非索引补充（micropolisJS、Julius、Unciv），理由见第 3.3 节。

## 2. 阅读路线

只有半天时，每条路线读前两项即可。

| 要动的系统 | 路线 | 读完能回答 |
| --- | --- | --- |
| 城建（[city_building.md](../../40_design/systems/city_building.md)） | Julius（覆盖、住房进化、劳力、诸神）到 Micropolis 或 micropolisJS（需求阀、场图）到 Lincity-NG（流动、可持续）到 Unknown Horizons（等级需求、AI 调度）到 CorsixTH（摆放校验） | 逐栋状态怎么汇总成聚落指标；需求、迁移、劳力、搬运各用什么模型 |
| 经济与物流（[economy_and_trade.md](../../40_design/systems/economy_and_trade.md)） | Widelands（撮合、经济目标）到 OpenTTD（cargodist、车站评分）到 7KAA（贸易条约、市场）到 KaM 或 Simutrans | 聚落内、区域间、国家间三层物流各怎么做；竞争怎么落在评分与份额上 |
| 即时战术（[warfare_rts.md](../../40_design/systems/warfare_rts.md)） | 0 A.D.（UnitAI、阵型、修正项、寻路、锁步）到 OpenRA（Trait、Activity、小队 AI、失同步报告）到 Curse of War（C 层与不在场战线） | 三层单位模型下节拍、阵型、AI 将领、确定性诊断各怎么做 |
| 大战略（[grand_strategy_slg.md](../../40_design/systems/grand_strategy_slg.md)） | Unciv（外交账本、承诺、动机、委托）到 Freeciv（条款估值、CMA）到 FreeOrion（补给网、效果流水线）到 VCMI（Bonus 系统、英雄乘数）到 Wesnoth（胜算分布、RCA） | 国家 AI 三层怎么分；外交、补给、修正项叠加、自动结算怎么做 |
| 谍报与多种族（大战略 2.5、6.3） | 7KAA 一个项目即可 | 忠诚、抵抗、叛乱、煽动、贿赂、暗杀、秘密报告的完整数值模板 |
| 委托、招募、资助方（城建 5.2、9，女神 GM） | CDDA（限时委托）到 KeeperRL（任务板、移民）到 OpenXcom（资助方月评） | 委托怎么做成内核对象；招募怎么给出"为什么没人来"；资助方怎么反应 |
| 给大模型的受限动作菜单（[ai_architecture.md](../../50_tech/ai_architecture.md)） | OpenTTD 脚本 API 到 OpenRA Bot 模块 | 同一命令通道、试算、合法动作枚举、错误码、配额的工程做法 |

## 3. 筛选：索引条目逐一判定

判定口径：能直接回答《箱庭纪》城建、RTS、SLG、经济、委托中某个设计问题的列为必读；有一两个可借的点列为选读；
与这些系统无关、或是同一引擎的模组、或无可读源码的列为略过。

### 3.1 原生游戏 · 策略（索引 `#native-127` 到 `#native-174`，48 条）

| 锚点 | 项目 | 判定 | 去向或理由 |
| --- | --- | --- | --- |
| `#native-127` | 0 A.D. | 必读 | RTS 第 1 节（GitHub 镜像已归档，改用 Gitea 官方仓库） |
| `#native-128` | Beyond All Reason | 略过 | 引擎层由 Recoil 覆盖；素材多为禁止演绎的许可（RTS 第 5 节） |
| `#native-129` | Caesaria | 必读（只看工程组织） | 城建第 2 节（2016 年停更，玩法细节改读 Julius） |
| `#native-130` | Colobot | 略过 | 可编程单位，对"委托规则"只有概念启发（RTS、殖民略过表） |
| `#native-131` | CorsixTH | 选读 | 城建第 6 节（MIT，可借代码） |
| `#native-132` | Curse of War | 必读 | RTS 第 3 节 |
| `#native-133` | Harris | 略过 | 轰炸机作战管理，偏离多国博弈（SLG 略过表） |
| `#native-134` | Hedgewars | 略过 | 回合制火炮喜剧，无参考价值 |
| `#native-135` | KaM Remake | 选读 | 物流第 4 节（本地为旧快照） |
| `#native-136` | KeeperRL | 必读 | 殖民第 1 节 |
| `#native-137` | Last Colony | 选读 | RTS 第 7 节（无许可文件，只看锁步与插值） |
| `#native-138` | MegaGlest | 略过 | 与 0 A.D.、OpenRA 重复，无独有机制 |
| `#native-139` | Micropolis | 必读 | 城建第 1 节 |
| `#native-140` | Mindustry | 选读 | 物流第 6 节 |
| `#native-141` | openage | 选读 | RTS 第 6 节（只看曲线与事件设计文档，玩法尚不可用） |
| `#native-142` | OpenDungeons | 选读 | 殖民第 5 节 |
| `#native-143` | OpenE2140 | 略过 | OpenRA 模组 |
| `#native-144` | OpenFodder | 略过 | 小队射击，无相关系统 |
| `#native-145` | OpenKrush | 略过 | OpenRA 模组 |
| `#native-146` | OpenRA | 必读 | RTS 第 2 节 |
| `#native-147` | OpenSA | 略过 | OpenRA 模组 |
| `#native-148` | OpenTTD | 必读 | 物流第 3 节 |
| `#native-149` | OpenXcom | 必读 | 殖民第 2 节（索引写 `SupSuper/OpenXcom`，正式仓库为 `OpenXcom/OpenXcom`） |
| `#native-150` | Pax Britannica | 略过 | 单键 RTS，无相关系统 |
| `#native-151` | PCOTM | 略过 | 与本主题无关 |
| `#native-152` | Pikifen | 略过 | 《皮克敏》引擎，无相关系统 |
| `#native-153` | Pioneer | 选读 | 殖民第 7 节 |
| `#native-154` | Polly-B-Gone | 略过 | 物理平台游戏，无关 |
| `#native-155` | OpenRCT2 | 选读 | 城建第 5 节 |
| `#native-156` | Race into Space | 略过 | 太空竞赛管理，与国家 AI、外交、补给关系弱 |
| `#native-157` | Romanov's Vengeance | 略过 | OpenRA 模组 |
| `#native-158` | Seven Kingdoms: Ancient Adversaries | 必读 | 物流第 2 节（与本作最贴近：多种族、谍报、外交、忠诚） |
| `#native-159` | Shattered Paradise | 略过 | OpenRA 模组 |
| `#native-160` | Source of Tales | 略过 | 比赛参赛作品，无相关系统 |
| `#native-161` | Tanks of Freedom | 选读 | SLG 第 7 节（MIT，最小打分式 AI） |
| `#native-162` | The Battle for Wesnoth | 必读 | SLG 第 4 节 |
| `#native-163` | Unknown Horizons | 必读 | 城建第 4 节 |
| `#native-164` | Voxeliq | 略过 | 方块引擎，无关 |
| `#native-165` | Wargus（Stratagus） | 略过 | 与 0 A.D.、OpenRA 重复，原作素材依赖 |
| `#native-166` | Warzone 2100 | 选读 | RTS 第 4 节 |
| `#native-167` | Wyrmsun | 选读 | SLG 第 6 节 |
| `#native-168` | Zero-K | 选读 | RTS 第 5 节 |
| `#native-169` | Stone Kingdoms | 选读 | 物流第 7 节（代码 Apache-2.0，素材非自由） |
| `#native-170` | FreeOrion | 必读 | SLG 第 2 节 |
| `#native-171` | Dune Legacy | 选读 | RTS 第 8 节（索引的 GitHub 地址不存在，改用 SourceForge） |
| `#native-172` | UFO:AI | 选读 | 殖民第 6 节 |
| `#native-173` | Widelands | 必读 | 物流第 1 节 |
| `#native-174` | VCMI | 必读 | SLG 第 3 节 |

### 3.2 其他分类中与本主题相关的条目

| 锚点 | 项目 | 判定 | 去向或理由 |
| --- | --- | --- | --- |
| `#web-080` | Ancient Beast | 略过 | 小规模回合制怪兽对战 |
| `#web-081` | Command & Conquer HTML5 | 选读 | RTS 第 7 节（无许可文件，主要当反面清单） |
| `#web-082` | Freeciv-web | 必读 | SLG 第 1 节（与 Freeciv 引擎合并；规则与 AI 即引擎的 C 代码） |
| `#web-083` | Hexa Battle | 略过 | TS 技术栈相近，玩法与 SLG 无关 |
| `#web-084` | Rapid Dominance | 略过 | 小型夺旗克隆 |
| `#web-085` | Tower Defense | 略过 | Three.js 塔防演示，无相关系统 |
| `#web-088` | 3d.city | 略过 | Micropolis 的 Three.js 渲染演示，模拟层无新信息 |
| `#native-057` | Cataclysm: Dark Days Ahead | 必读 | 殖民第 3 节（派系营地委托、对话条件） |
| `#native-111` | Endless Sky | 选读 | 殖民第 4 节 |
| `#native-125` | Simutrans | 选读 | 物流第 5 节 |
| `#native-126` | Lincity-NG | 必读 | 城建第 3 节 |
| `#library-057` | Spring | 选读（改读 Recoil） | RTS 第 5 节（Spring 仓库 2024 年起停更，Recoil 是活跃分支） |
| `#library-043` | OpenRTS | 略过 | Java RTS 引擎，已有更完整的样本 |
| `#tool-002` | Brood War API | 略过 | 《星际争霸》bot 研究框架，与本作无直接接口 |

AI 游戏与生成框架（`#ai-001` 到 `#ai-012`）不属于本主题；AI NPC 方向已在 [`../ai_npc/`](../ai_npc/) 单独调研。

### 3.3 非索引补充

| 项目 | 判定 | 补充理由 |
| --- | --- | --- |
| micropolisJS | 必读 | Micropolis 算法的 JS/TS 移植，与本作 TS 内核结构最接近，且修正了 C++ 版的缺陷 |
| Julius | 必读 | 《凯撒 III》的忠实重实现，比索引收录的 Caesaria 更准确、仍在维护；住房进化、劳力优先级、诸神情绪都在一个函数里看全 |
| Unciv | 必读 | 现代 4X 外交 AI 的完整可读实现；MPL-2.0，是本组少数可借代码的项目之一 |

## 4. 许可总表与复用边界

与 [`../../50_tech/reuse_map.md`](../../50_tech/reuse_map.md) 的 open-share 一行一致：只取方法与数据合同思路，代码进入本作前单独核验许可。

| 类别 | 项目 | 可做到的最大程度 |
| --- | --- | --- |
| 宽松许可，可借代码 | CorsixTH（MIT）、Tanks of Freedom（MIT）、Stone Kingdoms 的代码（Apache-2.0）、0 A.D. 的 `source/lib`（MIT，与本主题无关） | 可拷贝改造，须随附许可文本与版权声明；Stone Kingdoms 素材归 Firefly Studios，不可用 |
| 文件级弱传染 | Unciv（MPL-2.0） | 可移植单个文件；移植后的 TS 文件须以 MPL-2.0 授权并随附许可，其余文件不受影响 |
| 需逐条核对 | Simutrans（Artistic-1.0） | 暂按"只借方法"处理 |
| 无许可文件 | Command & Conquer HTML5、Last Colony | 默认保留全部权利，只能读，不借代码 |
| GPL、AGPL、CC-BY-SA | 其余全部项目 | 只借方法：用自己的话与伪代码转述，单行公式与常量可引用，不拷贝代码与数据表 |
| 素材 | 几乎全部 | 不可用：多数依赖原作商业数据（《凯撒 III》《红色警戒》《英雄无敌 3》等），其余为 CC-BY-SA 或禁止演绎 |

移植公式时还有两条工程约束（分析）：一律改用本作按系统命名的随机流与固定排序（多数项目的随机不可回放）；每个公式先写黄金样例测试
（MicropolisCore 的住宅阀回归缺陷是前车之鉴，见城建第 1 节）。

## 5. 本地镜像与重建

- **本机位置**：`D:\hakoniwa_refs\<id>`。F 盘空间不足，镜像放在 D 盘；共 40 个仓库，部分克隆（浅克隆、不预取文件内容、稀疏检出），
  只检出代码与数据目录，合计约 345MB。分册信息表里的"本地镜像"一栏就是这个路径。
- **清单**：[`hakoniwa/tools/refs/manifest.json`](../../../tools/refs/manifest.json) 记录每个仓库的地址、固定提交与日期、代码与素材许可、分级、稀疏目录、对应分册。
- **重建或换机**（在 `hakoniwa/` 下运行，需要 git）：

  ```bash
  node tools/refs/fetch_refs.ts --dir D:/hakoniwa_refs
  ```

  `--tier must` 只取必读，`--only openttd,wesnoth` 只取指定项，`--update` 把已有镜像移到清单里的提交，`--latest` 改取上游最新，
  `--list` 列出清单，`--dry-run` 只打印将执行的 git 命令；目录也可以用环境变量 `HAKONIWA_REFS_DIR` 给出。
- **安全约束**：工具拒绝把镜像放进本仓库（GPL 代码与不受信任的文件不进入仓库、扫描器与构建）；工具只调用 git，关闭 LFS 下载，不运行镜像里的任何东西。
  读源码时也只读不跑；在部分克隆里执行 `git grep HEAD` 会按需拉取大量文件内容，读单个文件用 `git show HEAD:<路径>` 或直接打开已检出的文件。
- **校验**：`tests/refs_manifest.test.ts` 检查每条记录的提交、许可、路径安全，并确认对应分册里确实记录了该仓库地址与固定提交。

## 6. 跨分册结论（分析）

1. **确定性是移植的第一约束。** 只有 Julius、Unknown Horizons、OpenRCT2、0 A.D.、OpenRA 等少数项目的随机可回放；借来的每个随机步骤都改用命名随机流，
   处理顺序用固定排序或显式平局键（Widelands `pairid`），异步计算在快照上进行并在固定时刻合并（OpenTTD）。
2. **两档颗粒度并存。** 逐栋、逐兵团、逐人物的离散状态负责手感，低分辨率场与汇总负责宏观；聚落、国家指标一律从下层汇总，不直接做全局布尔判定。
3. **所有软数值都是"目标值加有限步长趋近"。** 7KAA 的忠诚与抵抗、OpenTTD 的车站评分、《凯撒 III》的神明情绪、FreeOrion 的稳定度、Unciv 的意见都如此；
   目标值的分项作为带来源条目展示，既可读也天然防暴涨。
4. **一条修正项管线。** 固定合成顺序（VCMI `totalValue`）、分阶段插入覆盖类修正（FreeOrion 优先级）、叠加组按目标去重、同类光环取最高、增益相加减益相乘、
   每次写入带来源记账（FreeOrion `AccountingInfo`）。这正是经济第 7 节注册修正项合同缺的那几块，也直接给出神依赖度的统计口径。
5. **委托只有三种原语：目标、优先级、开关。** Widelands 的经济目标、Julius 的劳力优先级、Freeciv CMA 的约束与权重、Lincity 的市场收发开关；
   限时委托做成内核对象并在到期时一次结算（CDDA，改为自动结算）。无解时交还玩家并通知，这一步本身就是自治度的输入。
6. **每个坏结果都有计数器或原因码。** 住房进化说明、火险时钟、十大问题民调、游客想法汇总、移民缺失原因、开战动机列表：内核只产出机器码与数值，"为什么"查询集中做。
7. **AI 分层，并且只下命令。** 动机层（可解释的命名修正项）、计划层（目标分解与计划对象）、执行层（RCA 或小队状态机）；所有 AI 只通过玩家同一条命令通道行动，命令进回放，
   回放不调用模型（OpenRA Bot、0 A.D. Petra、OpenTTD 脚本 API）。这与"模型提议，内核裁决"完全同构。
8. **外交是账本加条款估值加承诺生命周期。** Unciv 的分类回归账本、Freeciv 的条款折金币求和、Unciv `Demand` 的违约第三方扣分；宣战有前奏（备战计数与倒计时）。
9. **胜算预估输出分布，且与实战同源。** Wesnoth 的预测与实战共用同一数值构造，输出完整生命值分布，超复杂度时退到蒙特卡洛；兵团、具名人物、C 层各用一档精度。
10. **离屏的一律按经过时间一次外推。** 远方市场、在外委托、离屏聚落都只在来访或到期时计算，随机种子按 id 与上次更新时刻键控（Pioneer、Endless Sky、CDDA）。

## 7. 对第一轮实现的直接发现（分析，待设计确认后排期）

以下各条都已逐条对照 `hakoniwa/src/` 的源码核实，细节见对应分册：

| 发现 | 位置 | 参考 | 分册 |
| --- | --- | --- | --- |
| 英雄光环把覆盖该点的所有友方英雄直接相加，伤害与防御各自封顶 0.3（数值同即时战术第 2.5 节的 0.30）；光环没有 id 或类别（`HeroState.aura` 只有三个数，`morale` 未被读取），同类异类一律相加，要按类去重须先给光环加 id | `src/systems/warfare/engage.ts` `auraSums` | 0 A.D. `Auras.prototype.GetModifierIdentifier` | RTS 第 0.3、1 节 |
| 兵团期望值公式各系数全部连乘，多个增益同时生效时有指数放大风险 | `src/systems/warfare/combat_math.ts` `expectedDamage` | VCMI 与 Wesnoth 的"增益先求和再乘" | SLG 第 3、8 节 |
| 修正项有 `source` 与 `note` 可溯源，但没有叠加组、阶段顺序，也没有逐次写入的差值记账（全部因子连乘、加项相加）；`applyModifiers` 本身不设通道上限，只有物价在 `economy/market.ts` `priceModifierLines` 里按 `modifierBounds` 钳在 0.5 到 2.0 | `src/systems/modifiers/index.ts` 的 `ModifierSpec` 与合成函数 | FreeOrion 效果流水线、VCMI Bonus 系统 | SLG 第 0.2、2、3 节 |
| `'trade'` 条约只影响会盟投票与 AI 意图，经济系统不读它，签了没有经济效果 | `src/systems/strategy/diplomacy.ts` | 7KAA `trade_treaty` 与进口付款 | 物流第 2 节 |
| 外交关系是一个数，拒绝理由是阈值判定，只回一句按动作写死的理由，说不出是哪些分项、差多少 | `src/systems/strategy/diplomacy.ts` `refusal` | Unciv 账本、Freeciv `dai_goldequiv_clause` | SLG 第 0.2、1、5 节 |
| 摆放自动选址对每个通过前置校验的候选格做两次全图 BFS，地块变大、空地少时成本高；`slot`、`defense`、`taboo` 校验码未实现 | `src/systems/city/placement.ts` `findSpot`、`PlacementCode` | CorsixTH 周界连通检查 | 城建第 0.3、6 节 |
| 需求按聚落整体判定（生存层为连续比值，上三层为布尔条件的满足比例），服务没有空间覆盖，迁移是阈值加随机 | `src/systems/city/population.ts` `runPopulation`、`common.ts` `sumEffect` | Julius 住房进化与覆盖、Micropolis 需求阀 | 城建第 0.3、1、2 节 |
| 仓库满时原料照扣、放不下的产出直接丢弃，聚落状态却写"生产停下了"，结果与说明不一致 | `src/systems/city/production.ts` `runProduction` | Widelands 生产程序的"经济不缺就跳过"（跳过时不扣原料） | 城建第 0.3 节；物流第 1 节 |
| 将领 AI 没有小队凝聚度检查与超时回退；同一目标只有软性的认领惩罚（每次认领距离加 3），没有硬性盯防上限 | `src/systems/warfare/ai.ts` | OpenRA 小队状态、Petra `AttackPlan` | RTS 第 0.3、1、2 节 |
| 战斗内没有周期哈希与逐字段差异报告 | `src/core/save.ts` `worldHash` 只用于整局 | 0 A.D. `TurnNeedsFullHash`、OpenRA `SyncReport` | RTS 第 0.3、1、2 节 |
| 大地图寻路的开放表是线性扫描 | `src/systems/world/grid.ts` `findPath` | 0 A.D. 分层寻路、OpenRA 抽象图启发式 | RTS 第 0.3、1 节 |
| 补给整块缺失 | `src/systems/strategy/military.ts` | FreeOrion `SupplyManager::Update`（覆盖层；运力层需自建） | SLG 第 0.2、2 节 |

## 8. 已知缺口与待核实

- **索引地址需修正**：0 A.D. 的 GitHub 镜像已归档（改用 `https://gitea.wildfiregames.com/0ad/0ad`）；Spring 停更（改读 Recoil）；
  Dune Legacy 的 GitHub 地址不存在（改用 SourceForge）；OpenXcom 正式仓库为 `OpenXcom/OpenXcom`；7KAA 的 GitHub 镜像最后提交在 2023 年，SourceForge 主站可能更新；
  KaM Remake 本地是旧快照，新版城市规划器只看过网页摘要。
- **无开源样本的部分**：补给的运力层（补给线瓶颈运力与需求）没有找到现成实现，需自建。
- **逐项待核实**：各分册最后一节列出了未读透或靠推断的细节（常量含义、时间单位、素材许可等），引用这些细节前请先回到镜像复核。
