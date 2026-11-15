# 开源源码调研：即时战术 RTS（战斗、单位、阵型、寻路、同步、AI 将领）

> 所属目录：`docs/10_research/open_source/`。性质：调研归档，只记录事实、分析与可借鉴点，不做最终设计决定，
> 不具约束力（正典优先级第 6 级，见 `hakoniwa/CLAUDE.md`）。调研日期：2026-11-15。
> 来源索引（只读）：`F:\workspace\open-share\10_md\_external\2026\external-2026-开源游戏源码大全-玩法与引擎索引.md`，
> 条目锚点如 `#native-127`。该索引状态为 indexed-unverified；本文的仓库地址、许可、提交与描述都已到仓库本身核实，
> 与索引不一致处在各信息表注明（0 A.D. 与 Spring 的 GitHub 地址已过时，Dune Legacy 的 GitHub 地址不存在）。
> 本地镜像：`D:\hakoniwa_refs\<id>`，部分克隆（`--depth 1 --filter=blob:none --sparse`），只物化代码与数据目录，未拉美术音频；
> 未检出的单个文件用 `git show HEAD:<path>` 读取。下载的仓库按不受信任数据处理，只读文件，未运行其中任何脚本、构建或解释器。
> 前置：概念层见 [`city_rts_slg.md`](../open_share/city_rts_slg.md) 第 3 节与第 7.1 节，本文不重复其内容，只往源码里深挖。
> 对应设计：[`warfare_rts.md`](../../40_design/systems/warfare_rts.md)（第 2 节三层单位模型、2.4 共用内核、2.5 层间换算、3.2 克制、
> 3.4 士气与疲劳、4 英雄是乘数、5.3 阵型、5.4 寻路与大量单位、6 战场流程、7 AI 将领、7.3 玩家不在场的战线、9.2 可读性、12 节 RTS-1 到 RTS-6），
> [`grand_strategy_slg.md`](../../40_design/systems/grand_strategy_slg.md) 第 5.5 节。
> 标注约定：源码事实不加标；"分析"表示对《箱庭纪》的推演；"待核实"表示没读透或属推断。
> 源码引用一律写"仓库内相对路径 + 符号名（类、函数、组件、常量）"，不写行号；固定提交写在各项目信息表里。
> 分工：本文只写即时战术 RTS。城建人口模拟、经济物流型 RTS（Widelands、7kaa、OpenTTD、KaM Remake 等）、SLG/4X（Freeciv、FreeOrion、VCMI、Wesnoth 等）、
> 殖民与基地经营由同目录的其他调研负责（已有 [`city_builders.md`](city_builders.md)、[`colony_base_management.md`](colony_base_management.md)），本文不涉及那些项目。

---

## 0. 总览

### 0.1 项目清单与分级

| id            | 项目                                | 索引锚点                       | 分级         | 代码许可                                     | 主要看什么                                                                                       | 对应本作（`warfare_rts.md`）              |
| ------------- | ----------------------------------- | ------------------------------ | ------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `zero_ad`     | 0 A.D.（Pyrogenesis 引擎）          | `#native-127`                  | 必读         | GPL-2.0-or-later（素材 CC BY-SA 3.0）        | 分层状态机 UnitAI、姿态表、攻击时序与伤害、修正项管线、光环、晋升、阵型、占领、Petra AI、分层寻路、范围查询、领土、锁步回合与状态哈希 | 2.1、2.4、3.2、3.4、4、5.3、5.4、6、7、9.2 |
| `openra`      | OpenRA                              | `#native-146`                  | 必读         | GPL-3.0-or-later                             | YAML 规则加 Trait 加"条件"、Activity 栈、锁步与失同步报告、Bot 模块（小队、模糊攻逃判定）、分层寻路、迷雾计数 | 2.1、2.4、3.2、5.4、7、RTS-1               |
| `curseofwar`  | Curse of War                        | `#native-132`                  | 必读         | GPL-3.0-or-later                             | 无单位微操：人口在六角格间扩散与按旗帜势场流动、同格对称消耗、国王 AI 的插旗策略                 | 2.3 C 层、7.3 战线、授权书                 |
| `warzone2100` | Warzone 2100                        | `#native-166`                  | 选读         | GPL-2.0-or-later（整体按 GPL-3.0-or-later 发行） | JS AI 接口（事件、命名定时器、只下命令）、研究效果数据、底盘加推进加武器的组件合成、效果对推进类型的修正表 | 3.1、3.2、7.1                             |
| `recoil`      | Recoil 引擎（Spring 的活跃分支）    | `#library-057`（索引写 spring/spring） | 选读   | GPL-2.0-or-later                             | QTPFS 四叉树寻路、同目标路径共享、脏块增量重建、并行计算串行落地、避障与推挤                     | 5.4                                       |
| `zero_k`      | Zero-K                              | `#native-168`                  | 选读         | GPL-2.0-or-later（素材混合）                 | 按兵种的风筝、骚扰、逃离表；带滞回的撤退；目标点扩散；内置 AI 的热图与战斗组                     | 6.4、7.1、7.2                             |
| BAR           | Beyond All Reason                   | `#native-128`                  | 略读（未克隆） | GPL-2.0（素材多为 CC-BY-NC-ND 4.0）        | 运行在 Recoil 上，引擎层已由 `recoil` 覆盖                                                       | 无                                        |
| `openage`     | openage                             | `#native-141`                  | 选读         | GPL-3.0-or-later                             | 曲线（关键帧）加事件驱动模拟、活动图、nyan 数据语言的修正项与补丁                                | 2.4、RTS-1                                |
| `cnc_html5`   | Command & Conquer HTML5             | `#web-081`                     | 选读         | 无许可文件（素材属原作版权方）               | 纯 JS 单文件 RTS：网格 A*、画布迷雾、订单状态机（反面教材居多）                                 | 5.4（对照）                               |
| `last_colony` | Last Colony                         | `#native-137`                  | 选读         | 无许可文件                                   | 纯 JS 锁步多人：命令按 tick 加延迟排程、空命令心跳、逻辑 10 Hz 与渲染插值                         | RTS-1、2.4                                |
| `dunelegacy`  | Dune Legacy                         | `#native-171`（GitHub 地址失效，官方在 SourceForge） | 选读 | GPL-2.0-or-later（需原作数据文件）  | QuantBot 的军力价值预算 AI、按难度的配置表、采集循环                                             | 7.1、9.1                                  |

略过项目（Wargus/Stratagus、MegaGlest、OpenE2140 等）见第 10 节。

阅读建议：只有半天时间的实现者，先读第 0.2 节、第 0.3 节（我们差在哪）、第 9 节（跨项目结论），再按要动的模块回到对应项目：
改兵团数值与修正项读第 1.4.4 到 1.4.7 节；改移动与寻路读第 1.4.11 节、第 2.4.6 节、第 5 节；改将领 AI 读第 1.4.14 节、第 2.4.5 节、第 8 节；
改战线与自动结算读第 3 节、第 6 节；做联机或回放读第 1.4.1 节、第 2.4.3 节、第 7 节。

### 0.2 一页结论（细节见第 9 节，均为分析）

1. **5 Hz 模拟是成熟做法，不是妥协。** 0 A.D. 整个模拟按 200 毫秒一回合运行（`source/simulation2/system/TurnManager.h` `DEFAULT_TURN_LENGTH`），
   渲染在两回合之间插值位置（`CCmpPosition` 的 `m_PrevX`、`m_LastX`）；Curse of War 正常速度也是每 200 毫秒一步。RTS-1 的风险在渲染插值与输入回执，不在节拍本身。
2. **把"阵型"做成一个有自己 AI 与寻路的控制器实体**（0 A.D. `Formation.js` 加 `UnitAI.js` 的 `FORMATIONCONTROLLER` 状态）：整队只寻一条路，成员追槽位。
   但 0 A.D. 一接敌阵型就散成个体各自战斗，这正是本作 B 层兵团要避免的；兵团应当始终是结算单位，槽位只用于画面。
3. **伤害用"倍率乘积 + 抗性指数衰减"两段式最稳**：0 A.D. 每点抗性 ×0.9（`AttackHelper.prototype.GetTotalAttackEffects`），
   克制以按单位类别匹配的乘数表达（`GetAttackBonus`），所有修正项走一条"路径字符串 + 乘法再加法"的管线（`GetTechModifiedProperty_numeric`），可直接套到兵团期望值公式的修正项上。
4. **英雄光环同名不叠加**（0 A.D. `Auras.prototype.GetModifierIdentifier` 默认以光环名作键）。我们现在把覆盖该点的所有友方英雄光环直接相加，伤害与防御各自封顶 0.3（数值同设计第 2.5 节 A 对 C 的 0.30）；光环没有 id 或类别（`HeroState.aura` 只有三个数，`morale` 未被读取），同类异类一律相加，要按类去重须先给光环加 id，之后才能让"多带一名同类英雄"不再等于翻倍。
5. **"姿态表 + 强制令"是授权书的现成实现**：0 A.D. `g_Stances` 用一组布尔开关（追击、追出视野、坚守原地、逃跑）描述单位自主度，玩家亲自下的命令带 `force` 可越过姿态限制。
   本作 `FrontCharter` 的撤退许可、可否反击、可否追击可以一一映射成这种开关。
6. **AI 只下命令、命令进回放**：OpenRA 的 Bot 只在主机运行、只能排队下单且限速发出（`ModularBot` 的 `MinOrderQuotientPerTick`），
   0 A.D. 的 Petra 每 8 回合才跑一次并按玩家号错峰。这与本作"模型提议，内核裁决"和"大模型方案作为外部输入记入事件流"完全同构。
7. **小队级攻逃判定要有"凝聚度检查"和"超时回退"**：OpenRA `GroundUnitsAttackMoveState` 在掉队者超出领队半径时先停下集结，2.5 秒不动就退回待命；
   Petra `AttackPlan` 有"未执行、集结、行军、抵达"四态，并用"同一目标最多被几个单位盯住"的否决表防止扎堆。我们的将领 AI 现在没有这两样。
8. **玩家不在场的战线可以做成"带势场的人口流"**：Curse of War 不控制单位，只插旗；旗帜在可通行格上产生按距离减半的势场，人口按 5% 扩散加 10% × 势差流动，
   同格各方按 `对方人数 × 本方人数 / 总人数` 对称消耗。它是战线回合方程之外、可在地图上可视化的另一种 C 层抽象，并天然带"授权书只给方向不给微操"的味道。
9. **确定性与失同步诊断要早做**：0 A.D. 每回合哈希随机数状态与全部位置、每 20 回合做全量哈希（`CTurnManager::TurnNeedsFullHash`）；
   OpenRA 每帧上报世界哈希并保留最近 7 帧的逐字段同步报告（`SyncReport` 的 `NumSyncReports`）。我们已有世界哈希与命令回放，缺的是战斗内的周期哈希与出错时的逐字段转储。
10. **许可边界**：本文必读项目全部是 GPL 系，C&C HTML5 与 Last Colony 没有许可文件；一律只借方法，用自己的话与伪代码转述，不拷贝代码与数据表。

### 0.3 基线：我们现在怎么做、差在哪

以下是 `hakoniwa/src/systems/warfare/` 第一轮实现的事实摘要（按文件与符号），以及本文各项目能补的缺口。

| 模块 | 现状（源码事实） | 主要缺口（分析） | 参考 |
| --- | --- | --- | --- |
| 节拍 `index.ts` `TICKS_PER_STEP`、`kernel.ts` `STEP_SECONDS`、`AI_EVERY` | 手动战斗每 4 个引擎 tick 跑一步内核（0.2 战斗秒）；AI 每 10 步（2 秒）重新下令；兵团全部在同一步结算，没有按 `id % 4` 错峰 | 设计第 2.2 节要求错峰削峰；渲染侧已有位置插值（`client/windows/battle_model.ts` `lerpPos`、`stepAlpha`，超过 3 格直接落位），但只插值坐标，人数、士气不插值，内核也不输出起止两帧 | 0 A.D. 回合与插值（1.4.1）、Last Colony 插值（7.4） |
| 单位表示 `types.ts` `RegimentState`、`combat_math.ts` `regimentRadius` | 兵团是一个圆，半径 `0.45 + sqrt(count)/12`；有朝向与阵型枚举，阵型只影响系数表 `FORMATIONS`，没有槽位 | 侧背判定只按圆心角，正面宽度与纵深不参与碰撞；画面上 `formationShape` 已按阵型把最多 36 个士兵点排成固定队形，但随兵团整体平移，不是追槽位的个体 | 0 A.D. `Formation.prototype.ComputeFormationOffsets`（1.4.7） |
| 移动与寻路 `kernel.ts` `travel`、`terrain.ts` `findBattlePath`、`kernel.ts` `separate` | 每个兵团独立寻路（直线可达就不寻路，否则二叉堆 A*），目标偏移超过 1.5 格才重寻；同队兵团两两推开 | 没有路径共享、没有分层或流场、推开是全量两两比较；大地图 `world/grid.ts` `findPath` 的开放表还是线性扫描 | 0 A.D. 分层寻路（1.4.11）、OpenRA HPF（2.4.6）、Recoil 路径共享（5.3） |
| 接触结算 `engage.ts` `resolveContacts` | 每个兵团扫描全部敌兵团找近战或射程内目标；期望伤害先汇总、步末一次施加；但朝向在循环里即时改写，侧背判定与兵团数组顺序有关（顺序固定，结果仍确定）；每次接触一次 0.9 到 1.1 的随机波动 | 目标搜索是全量扫描；被近战接触的兵团同一步就自动还手，未行军的远程兵团也会自动射击射程内最近的敌人；"被攻击"没有事件（只有 `busy`），对射程外来袭者的转向仍要等 AI 轮次（每 10 步）或玩家 | 0 A.D. 范围查询差分（1.4.12）、`OnAttacked`（1.4.2） |
| 伤害公式 `combat_math.ts` `expectedDamage` | 交战人数 × 次数 × 平均伤害 × 命中 × (1 − 护甲减伤) × 伤害对护甲表 × 兵种克制（含阵型的受远程、受范围系数）× 侧背 × 阵型 × 远程兵近战折扣 0.6 × 情境系数；波动每个出手兵团每个内核步抽一次 | 公式本身已对齐设计；伤害侧系数硬编码；注册修正项只在开战时以 `morale` 通道写进 `BattleState.moraleBonus`，伤害与防御没有统一修正项路径 | 0 A.D. 修正项管线（1.4.5）、OpenRA 条件（2.4.1） |
| 士气 `morale.ts` `updateMorale`、`ROUT_BELOW`、`RALLY_TO` | 低于 15 溃退，重整到 30；伤亡冲击、疲劳、澱区、邻近溃退 | 没有"战斗烈度"检测，无法区分小摩擦与会战（影响音乐、提示、AI 切换） | 0 A.D. `BattleDetection`（1.4.10） |
| 英雄 `heroes.ts` `CAST_KILL_CAP`、`engage.ts` `auraSums` | 单次施放击倒上限 20%；英雄光环把覆盖该点的所有友方英雄直接相加，伤害与防御各自封顶 0.3（`Math.min(0.3, ...)`，数值同设计第 2.5 节 A 对 C 的 0.30） | 光环没有 id 或类别（`HeroState.aura` 只有三个数，`morale` 未被读取），同类异类一律相加（两名同类英雄站一起即加倍直到封顶），要按类去重须先给光环加 id | 0 A.D. 光环键（1.4.5） |
| 将领 AI `ai.ts` `chooseUtilityPlan`、`runTeamAi` | 按双方战力比与性格标签选方案；每个兵团按距离加"已被认领次数 × 3"挑目标 | 没有小队凝聚度检查；兵团级没有攻逃判定（只有方案层战力比低于 0.7 改坚守、英雄生命低于 30% 回撤）；没有行军与抵达阶段、没有卡住回退；性格只在 `chooseUtilityPlan` 起作用（如"谨慎"把门槛提到 1.2），不影响执行层参数 | Petra（1.4.14）、OpenRA 小队（2.4.5）、Dune Legacy（8.4） |
| 自动结算 `autoresolve.ts` `autoResolve`、`estimatePower` | 同一内核同一种子跑到结束；C 层战力 = 人数 × sqrt(单兵每秒期望伤害 × 单兵有效生命) × 品质系数 | 远方 AI 对 AI 的野战已用同一内核在生成战场上自动结算（`strategy/military.ts` `runAuto` 调 `autoResolve`），攻城与国家 AI 用标量战力；第五幕战线只在结算时由 `quests/endings.ts` `frontOutcomes` 按自治度与支援旗标一次判定，没有逐回合、可显示的节点抽象 | Curse of War（第 3 节）、openage 曲线（第 6 节） |
| 确定性 `core/engine.ts` 回放日志、`core/save.ts` `worldHash`、按系统命名的随机流 | 命令记日志可回放；世界哈希用于确定性测试 | 战斗内没有周期哈希与逐字段差异报告 | 0 A.D. 哈希（1.4.1）、OpenRA `SyncReport`（2.4.3） |
| 视野 | 战场没有迷雾（`ai.ts` 注释"不偷看场外"） | 设计第 5.2 节、6.1 节要求迷雾与侦察 | 0 A.D. LOS 计数（1.4.12）、OpenRA `Shroud`（2.4.7） |
| 老兵与占点 | 兵团没有老兵等级；目标有守点计时，没有"占领强度"对抗 | 设计第 2.2 节 `veterancy 0..3`、第 6.3 节占领据点 | 0 A.D. `Promotion`、`Capturable`（1.4.6、1.4.8）、OpenRA 经验（2.4.1） |

---

## 1. 0 A.D.

### 1.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-127`，索引地址写 `https://github.com/0ad/0ad` |
| 实际来源 | 官方 Gitea：`https://gitea.wildfiregames.com/0ad/0ad`。GitHub 上的 `0ad/0ad` 已归档，描述为"[DEPRECATED] Git mirror ... migrated to https://gitea.wildfiregames.com on August 20th 2024"，最后提交 2024-08-17，已过时 |
| 固定提交 | `a7c3eef0bab4895c6d4f90540b639b9d56244c31`，2026-11-13 |
| 代码许可 | 按仓库根目录 `LICENSE.md`：`binaries/data/`（含全部 JS 模拟组件与 AI）与 `source/`（C++ 引擎）均为 GPL-2.0-or-later；`source/lib/` 为 MIT；少数第三方库另有许可 |
| 素材许可 | `binaries/data/mods/*/art`、`audio` 为 CC BY-SA 3.0；`maps/` 见各目录 LICENSE.txt |
| 语言与规模 | C++ 引擎（模拟系统、寻路、范围管理、网络）+ JavaScript 游戏逻辑组件（SpiderMonkey 运行）。本提交 `UnitAI.js` 约 7300 行、`Formation.js` 约 1200 行、Petra 的 `attackPlan.js` 约 2300 行 |
| 本地镜像 | `D:\hakoniwa_refs\zero_ad`（约 15 MB） |
| 已检出目录 | `binaries/data/mods/public/simulation/components`、`.../simulation/helpers`、`.../simulation/ai/petra`、`.../simulation/ai/common-api`、`.../simulation/data`、`.../simulation/templates/special`、`binaries/data/mods/public/globalscripts`、`source/simulation2/{components,helpers,system,docs}`、`source/network` |
| 分级 | 必读 |

### 1.2 值得看的理由

- 它是本作 A 层"完整实体"的最佳参照：一个单位由多个组件拼成（`Attack`、`Resistance`、`Health`、`UnitAI`、`Promotion`、`Auras`……），
  行为由一份数据描述的分层状态机驱动，对应 [`warfare_rts.md`](../../40_design/systems/warfare_rts.md) 第 2.1 节"英雄 AI 驱动器"与第 7.1 节"单位微操"。
- 它的修正项管线、光环、晋升、克制乘数，正好是第 2.2 节兵团公式里"克制系数 × 修正项"、第 3.2 节克制、第 4.1 节英雄乘数需要的数据骨架。
- 阵型控制器（第 5.3 节）、分层寻路与异步路径请求（第 5.4 节）、视野计数（第 5.2 节）、领土影响（与 SLG 层的接口）都有工业级实现。
- Petra AI 的"计划对象 + 队列预算 + 性格参数"与第 7 节 AI 将领、第 9.1 节难度的结构一致。
- 锁步回合与状态哈希（`TurnManager`）对应第 2.4 节"同一种子可回放"与第 5.4 节"确定性"。

### 1.3 源码导读

以下路径相对 `binaries/data/mods/public/` 或 `source/`，按"想弄懂 X，就读这些"组织。

| 想弄懂 | 读这些（路径 + 符号） | 该处的机制 |
| --- | --- | --- |
| 分层状态机的写法 | `globalscripts/FSM.js` 的 `FSM`、`ProcessMessage`、`SetNextState`；`simulation/components/UnitAI.js` 的 `UnitAI.prototype.UnitFsmSpec` | 状态机是一份嵌套对象：键为大写状态名，值为消息处理函数与 `enter`、`leave`；子状态继承父状态的处理函数；实例只保存当前状态名字符串，便于序列化 |
| 订单队列 | `UnitAI.js` 的 `PushOrder`、`PushOrderFront`、`ReplaceOrder`、`FinishOrder`、`AddOrder`、`UpdateWorkOrders`、`BackToWork` | 订单是 `{type, data}` 队列；队首变化时向状态机投递 `"Order." + type` 消息，由当前状态决定接受或 `FinishOrder` 拒绝 |
| 单位自主度 | `UnitAI.js` 顶部的 `g_Stances`、`ShouldChaseTargetedEntity`、`ShouldAbandonChase`、`CheckTargetDistanceFromHeldPosition` | 七种姿态各是一组布尔开关；玩家命令带 `force` 时越过姿态限制 |
| 战斗状态 | `UnitAI.js` 的 `INDIVIDUAL.COMBAT.APPROACHING`、`ATTACKING`、`FINDINGNEWTARGET`、`CHASING`；`OnAttacked`、`RespondToTargetedEntities`、`AttackEntitiesByPreference` | 接近、攻击、换目标、追击四个子状态；被攻击消息触发反击或逃跑 |
| 攻击时序 | `simulation/components/Attack.js` 的 `StartAttacking`、`Attack`、`RepeatRangeCheck`、`PerformAttack`、`GetPreference`、`GetBestAttackAgainst` | 用计时器按"准备时间 + 重复时间"出手；远程弹道带预判与散布 |
| 伤害、克制与抗性 | `simulation/helpers/Attack.js` 的 `AttackHelper.prototype.GetTotalAttackEffects`、`HandleAttackEffects`、`GetAttackBonus`、`CauseDamageOverArea`；`simulation/components/Resistance.js` | 抗性按 0.9 的幂衰减；克制是按目标类别匹配的乘数连乘；溅射按距离平方衰减 |
| 修正项管线 | `globalscripts/Technologies.js` 的 `GetTechModifiedProperty_numeric`；`simulation/components/ModifiersManager.js` 的 `ApplyModifiers`、`Cache`、`InvalidateCache` | 一切数值都以"路径字符串"取值，并经过科技、光环、状态效果的修正；先连乘后相加，`replace` 优先 |
| 英雄光环 | `simulation/components/Auras.js` 的 `GetModifierIdentifier`、`IsRangeAura`、`IsFormationAura`；`simulation/data/auras/units/heroes/*.json` | 光环是"类型 + 半径 + 作用类别 + 修正项"的数据；同名光环默认不叠加 |
| 晋升 | `simulation/components/Promotion.js` 的 `IncreaseXp`、`Promote`；`simulation/components/Health.js` 中 `change.xp` 的计算；`simulation/data/technologies/unit_advanced.json`、`unit_elite.json` | 经验按"伤害占目标最大生命的比例 × 目标经验值"给出；晋升即换模板，等级加成写成自动研究的科技 |
| 阵型 | `simulation/components/Formation.js` 的 `ComputeFormationOffsets`、`TakeClosestOffset`、`GetRealOffsetPositions`、`ComputeMotionParameters`、`DoesAngleDifferenceAllowTurning`；`simulation/templates/template_formation.xml`、`templates/special/formations/*.xml`；`UnitAI.js` 的 `FORMATIONCONTROLLER`、`FORMATIONMEMBER` | 阵型是一个独立实体，有自己的 UnitAI 与移动；成员按类别排序后各取最近的槽位 |
| 占领 | `simulation/components/Capturable.js` 的 `Reduce`、`TimerTick`、`GetRegenRate`、`RegisterCapturePointsChanged` | 每个玩家一份占领点，攻方抽走、守方回复，归零即易主 |
| 状态效果 | `simulation/components/StatusEffectsReceiver.js` 的 `AddStatus`、`ExecuteEffect`、`RemoveStatus` | 状态带叠加规则（忽略、延长、替换、叠层）、周期伤害与修正项 |
| 战斗检测 | `simulation/components/BattleDetection.js` 的 `TimerHandler`、`OnGlobalAttacked`；`simulation/templates/template_player.xml` 的 `BattleDetection` 参数 | 伤害速率加"警觉度"滞回，判定"和平/交战" |
| 分层寻路 | `source/simulation2/helpers/HierarchicalPathfinder.h` 的 `HierarchicalPathfinder`、`CHUNK_SIZE`、`MakeGoalReachable`、`GetGlobalRegion`；`LongPathfinder.h/.cpp` 的 `ComputeJPSPath`、`JumpPointCache`、`ImprovePathWaypoints`；`VertexPathfinder.h` 的 `ComputeShortPath` | 区块连通区域判可达，跳点搜索出长路径，顶点图出短路径 |
| 异步路径请求 | `source/simulation2/components/CCmpPathfinder.cpp` 的 `StartProcessingMoves`、`m_MaxSameTurnMoves`；`CCmpUnitMotion.h` 的 `SHORT_PATH_MIN_SEARCH_RANGE`、`LONG_PATH_MIN_DIST`、`MAX_FAILED_MOVEMENTS` | 路径在回合之间多线程计算，下一回合以消息送达 |
| 范围查询与视野 | `source/simulation2/components/CCmpRangeManager.cpp` 的 `ExecuteActiveQueries`、`LosUpdateHelper`、`m_LosPlayerCounts`、`m_LosState`；`source/simulation2/helpers/Spatial.h` 的 `FastSpatialSubdivision`、`SUBDIVISION_SIZE`；`helpers/Los.h` 的 `LOS_TILE_SIZE` | 固定 20 米网格分桶；主动查询每回合与上次结果做差，只发"新增/移除"；视野用每格计数 |
| 领土 | `source/simulation2/components/CCmpTerritoryManager.cpp` 的 `CalculateTerritories`、`Floodfill`、`TERRITORY_CONNECTED_MASK` | 每个影响源从中心按地形代价衰减扩散，玩家取权重和最大者，再从根影响源洪泛标记"连通" |
| 锁步与哈希 | `source/simulation2/system/TurnManager.h/.cpp` 的 `DEFAULT_TURN_LENGTH`、`COMMAND_DELAY_SP`、`COMMAND_DELAY_MP`、`CTurnManager::Update`、`TurnNeedsFullHash`；`source/network/NetServerTurnManager.cpp` 的 `NotifyFinishedClientUpdate`；`source/simulation2/system/ComponentManagerSerialization.cpp` 的 `ComputeStateHash` | 命令排到"当前回合 + 延迟"；每回合哈希，服务器比对 |
| Petra AI | `simulation/ai/petra/_petrabot.js`、`headquarters.js` 的 `update`；`attackManager.js` 的 `update`、`setRushes`；`attackPlan.js` 的 `AttackPlan`（`unitStat`、`canStart`、`mustStart`、`updatePreparation`、`StartAttack`、`UpdateWalking`、`update`）；`defenseManager.js` 的 `assignDefenders`；`defenseArmy.js` 的 `needsDefenders`；`queueManager.js`；`config.js`；`entityExtend.js` 的 `getMaxStrength` | 见 1.4.14 |

### 1.4 机制拆解

#### 1.4.1 回合、确定性与状态哈希

- **回合长度**：`DEFAULT_TURN_LENGTH = 200`（毫秒），单机与联机相同。模拟每回合 `m_Simulation2.Update(m_TurnLength, commands)` 一次，即整个游戏模拟是 5 Hz。
  渲染不等回合：`CCmpPosition` 同时保存 `m_PrevX/Z`（上上回合）与 `m_LastX/Z`（上回合开始时），画面在两者之间插值。
- **命令延迟**：单机 `COMMAND_DELAY_SP = 1`（下一回合执行），联机 `COMMAND_DELAY_MP = 4`。所有客户端的命令汇成一个列表，按客户端会话号排序，保证全局一致顺序。
- **追帧与卡顿**：`CTurnManager::Update` 把累计的模拟时间上限截在 2 个回合长度（`m_DeltaSimTime = min(m_DeltaSimTime, 2 × turnLength)`），
  落后时最多快进两回合；下一回合命令未到齐则把计时清零等待。
- **回放与时间回溯**：每回合把命令写入回放（`m_Replay.Turn`）；可选每 N 回合序列化整个状态用于回溯（`EnableTimeWarpRecording`、`RewindTimeWarp`）。
- **随机数**：模拟脚本里的 `Math.random` 被引擎替换成按种子初始化的 `boost::rand48`（`source/scriptinterface/Interface.cpp` 的 `ReplaceNondeterministicRNG`，
  由 `ComponentManager` 用 `m_RNG` 调用），所以 JS 组件里的 `randFloat`、`randBool` 也是确定的。
- **状态哈希**（`CComponentManager::ComputeStateHash`）：
  ```
  hash 输入 = 随机数状态 + 下一个实体号
  quick 模式：只再加上所有 Position 组件
  full  模式：所有可序列化组件
  TurnNeedsFullHash(turn) = turn == 1 或 turn % 20 == 0     // 约 4 秒一次全量
  ```
  客户端每回合把哈希报给服务器；服务器 `NotifyFinishedClientUpdate` 等所有客户端都算到同一回合后比对，以主机为准，不一致即广播失同步并让客户端写出 `oos_dump`（状态转储）。

#### 1.4.2 分层状态机与订单队列（UnitAI）

FSM 的规格是一份嵌套对象，状态名只能用大写字母，`"A.B.C"` 表示层级。编译时把每个状态展开成"从根到自身"的路径（`decompose`），
切换状态时离开旧路径中不共有的部分、进入新路径中不共有的部分；消息处理函数沿层级就近查找。实例只存 `fsmStateName` 这样的字符串，组件序列化不用写 FSM 结构。

UnitAI 的顶层有三支：`INDIVIDUAL`（独立单位）、`FORMATIONCONTROLLER`（阵型控制器实体）、`FORMATIONMEMBER`（阵型成员）。
`INDIVIDUAL` 下有 `IDLE`、`WALKING`、`WALKINGANDFIGHTING`、`PATROL`、`GUARD`、`FLEEING`、`COMBAT`、`GATHER`、`HEAL`、`REPAIR`、`GARRISON` 等，
`COMBAT` 再分 `APPROACHING`、`ATTACKING`、`FINDINGNEWTARGET`、`CHASING`。

订单流程：

```
PushOrder(type, data):        队尾追加；若原本空队，立刻投递 "Order."+type
PushOrderFront(type, data):   插到队首并立刻投递（打包中的单位例外，插在打包之后）
ReplaceOrder(type, data):     清空队列再放入；带 force 的命令会先记下"工作订单"以便之后 BackToWork
FinishOrder():                弹出队首；队里还有就投递下一个，否则进入 IDLE
各状态的 "Order.X" 处理函数：  检查前置条件，不满足就 return FinishOrder() 拒绝，满足就 SetNextState(...)
```

`ATTACKING.enter` 的流程：检查射程，不在射程就投递 `OutOfRange`；面向目标、记下目标位置；`cmpAttack.StartAttacking` 失败就投递 `TargetInvalidated`。
`OutOfRange` 时按姿态决定 `CHASING` 还是 `FINDINGNEWTARGET`；目标失效时若是群体攻击（`targetArray`）就在列表里找下一个可见可攻击目标（`FindAndSetNextTarget`）。
`Attacked` 消息在多个状态里都有处理：例如正在占领建筑却被别人打，且姿态允许，就转而反击（`RespondToTargetedEntities`）。

索敌不靠每帧扫描，而靠范围管理器的"主动查询"：`SetupAttackRangeQuery` 等在 `CCmpRangeManager` 注册一个以自身为源、半径为视野或射程的查询，
每回合只把进入或离开范围的实体以 `LosRangeUpdate`、`LosAttackRangeUpdate` 消息送来（见 1.4.12）。`IDLE` 状态收到这些消息才去找目标。

#### 1.4.3 姿态表与强制令

`g_Stances` 是一张数据表，每种姿态是一组布尔开关：

| 姿态 | 视野内目标 | 总是反击攻击者 | 逃跑 | 追击 | 追出视野 | 原地不动 | 不离开驻守点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| violent | 是 | 是 | 否 | 是 | 是 | 否 | 否 |
| aggressive | 是 | 否 | 否 | 是 | 否 | 否 | 否 |
| defensive | 是 | 否 | 否 | 否 | 否 | 否 | 是 |
| passive | 否 | 否 | 是 | 否 | 否 | 否 | 否 |
| standground | 是 | 否 | 否 | 否 | 否 | 是 | 否 |

（另有 `skittish` 见敌即逃、`passive-defensive`；表中列名依次对应 `targetVisibleEnemies`、`targetAttackersAlways`、`respondFlee`、`respondChase`、`respondChaseBeyondVision`、`respondStandGround`、`respondHoldGround`。）

判定函数：

```
ShouldAbandonChase(target, force):
  目标不可见 -> 放弃
  force（玩家亲自下的令） -> 不放弃
  在护卫别人且目标正威胁被护卫者 -> 不放弃
  姿态 respondHoldGround 且目标离驻守点过远 -> 放弃
  姿态不允许追出视野 且目标出了自己视野 -> 放弃
ShouldChaseTargetedEntity(target, force):
  姿态 respondChase -> force 或可追出视野则追，否则只追视野内
  护卫中且目标威胁被护卫者 -> 追
  否则只有 force 才追
```

分析：这正是本作 `FrontCharter`（`warfare_rts.md` 第 11 节）里"撤退许可、可否反击、可否追击"的实现形态：授权书写成姿态开关，玩家的急令就是带 `force` 的命令。

#### 1.4.4 攻击时序与伤害

**出手时序**（`Attack.prototype.StartAttacking`）：从模板取 `prepare`（准备时间）与 `repeat`（重复时间）；若距上次出手不足一个 `repeat`，
把准备时间延长到剩余冷却（`prepare = max(prepare, lastAttacked + repeat - now)`）；然后挂两个计时器：每 `repeat` 毫秒出手一次的 `Attack`，
以及大约每秒检查一次射程的 `RepeatRangeCheck`（检查点错开半个周期，避免与出手同时）。

**远程弹道**（`PerformAttack`）：按上一回合的位移估计目标速度，`PredictTimeToTarget` 算命中时间；以 `max(0, 0.75 - 飞行时间/1.333)` 的概率改用目标的移动组件预测未来位置，
否则线性外推；落点再加二维正态散布，散布量 = `Spread × 距离 / 100`。也就是说远程命中不是掷命中率，而是几何落点。

**伤害公式**（`AttackHelper.prototype.GetTotalAttackEffects`）：

```
伤害 = Σ_伤害类型 (攻击力[类型] × 0.9 ^ 抗性[类型]) × 克制乘数
占领 = 占领力 × 0.9 ^ 占领抗性 × 克制乘数 / (0.1 + 0.9 × 当前生命 / 最大生命)   // 越残越好占
克制乘数 GetAttackBonus = Π_{模板里每条 Bonus} (目标类别匹配 且 文明匹配 ? Multiplier : 1)
```

伤害类型是 Hack、Pierce、Crush 三种（`globalscripts/DamageTypes.js`），抗性写在 `Resistance` 组件。
溅射 `CauseDamageOverArea`：圆形 `1 - 距离² / 半径²`；直线形在弹道方向长为半径、宽为半径的 1/5，两个方向都按平方衰减。

**目标偏好**：`GetPreference` 按模板的 `PreferredClasses` 列表顺序给出最小序号；`GetBestAttackAgainst` 在可用攻击方式里按"命中偏好类别 +2、是否占领 +1"排序挑选。

**经验**：`Health.js` 中 `change.xp = Loot.xp × 本次伤害 / 目标最大生命`，即经验与打掉的生命比例成正比，`HandleAttackEffects` 把它交给攻击者的 `Promotion.IncreaseXp`（状态效果造成的伤害不给经验）。

分析：0 A.D. 的"0.9 的幂"抗性与我们主工程的经典护甲减伤公式不同，本作已定沿用主工程公式（`armorReduction`），不必改；
可借的是"克制 = 按类别匹配的乘数连乘"和"弹道散布代替命中率"两个思路：前者给兵种克制表一个数据化写法，后者对 A 层英雄的远程技能有参考价值，B 层兵团仍用期望值。

#### 1.4.5 修正项管线与英雄光环

- 所有可被修改的数值都用路径字符串取值，例如 `"Attack/Melee/Damage/Hack"`、`"UnitMotion/WalkSpeed"`、`"Health/Max"`，调用 `ApplyValueModificationsToEntity(path, 基础值, 实体)`。
- `ModifiersManager` 按"属性名 → 实体 → 原始值"三层缓存修正后的值；有修正项增删时按属性名与实体失效，全局修正变化时清空玩家实体缓存。缓存不参与序列化（注释说明 GUI 读取也会影响缓存）。
- 合成规则（`GetTechModifiedProperty_numeric`）：

  ```
  对每条适用的修正（按类别过滤）：
    有 replace -> 直接返回该值
    multiply   -> 连乘进 multiply
    add        -> 累加进 add
  结果 = 原值 × multiply + add
  ```

- 光环是数据文件：`{"type": "range", "radius": 60, "affects": ["Soldier"], "modifications": [...]}`。类型有 `range`（半径内）、`global`、`player`、`garrison`、`formation`（同阵型成员）、`turretholder`。
  以 `achae_hero_cyrus_ii.json` 为例：半径 60，士兵攻击 ×1.1、移速 ×1.15。
- **叠加规则**：`Auras.prototype.GetModifierIdentifier` 默认返回 `"aura/" + 光环名`，同名光环无论多少个来源只算一次；只有标记 `stackable` 的光环才按来源实体分键叠加。

分析：本作 `engage.ts` `auraSums` 现在把覆盖该点的所有友方英雄光环直接相加，伤害与防御各自封顶 0.3（数值同设计第 2.5 节 A 对 C 的 0.30）；光环没有 id 或类别（`HeroState.aura` 只有三个数，`morale` 未被读取），同类异类一律相加，两名同类英雄站一起就加倍直到封顶。
建议先给光环加 id，再按 0 A.D. 的做法以"光环 id"去重，不同 id 的光环再走统一合成，合成后保留现有的 30% 封顶。修正项路径字符串也可以借来给兵团修正项一个统一入口（设计第 2.2 节兵团记录有 `modifiers` 字段，代码里的 `RegimentState` 尚无此字段）。

#### 1.4.6 晋升

- `Promotion` 组件只有两个关键数据：`RequiredXp` 与晋升后的模板名 `Entity`。`IncreaseXp` 累加经验，够了就扣掉门槛并沿模板链连跳（一次经验很多可连升多级），
  最后 `ChangeEntityTemplate` 换成高一级模板（如基础兵换成 Advanced）。可选 `TrickleRate` 每秒自动加经验。
- 等级加成不写在单位上，而是两条自动研究的科技 `unit_advanced.json`、`unit_elite.json`，作用于类别 `Advanced Unit` 与 `Elite Unit`：生命 ×1.25、近战伤害 ×1.1、远程散布 ×0.8、
  占领 +0.7（精英再 +0.8）、训练时间 ×1.2、采集速度 ×0.7。精英同时属于两个类别，所以两条科技都吃。

分析：本作兵团 `veterancy 0..3` 可照此做成"等级 → 一组修正项"的数据表，经验按"本兵团造成的期望伤亡占对方编制的比例 × 对方价值"累加，与 0 A.D. 按比例给经验同构；
不要学换模板，兵团记录直接改等级字段即可。

#### 1.4.7 阵型（控制器实体 + 槽位）

**结构**：玩家把多个单位编成阵型时，引擎创建一个 `template_formation` 实体，它有自己的 `Formation`、`UnitAI`（走 `FORMATIONCONTROLLER` 分支）、`UnitMotion`、`Position`，
`Obstruction` 既不阻挡移动也不阻挡寻路。成员进入 `FORMATIONMEMBER` 分支，收到 `FormationWalk` 订单后追随自己相对控制器的偏移。

**速度**（`ComputeMotionParameters`）：控制器速度 = 成员最慢步速 × `SpeedMultiplier`；加速度取成员最小值；通行类别取通行半径最大的成员。

**槽位生成**（`ComputeFormationOffsets`）：

```
separation = 成员平均占地 × (宽度倍率, 纵深倍率)            // 模板 UnitSeparationWidth/DepthMultiplier
depth = sqrt(人数 / WidthDepthRatio)，不超过 MaxRows
cols  = ceil(人数 / ceil(depth) + (ShiftRows ? 0.5 : 0))，夹在 MinColumns 与 MaxColumns 之间
逐行生成：square 每行 cols 个（ShiftRows 时奇偶行错半格）；triangle 每行 r+1 或 2r+1 个
  每个槽位 x 从中心向两侧交替排开，z = -行号 × 纵深间距；加 ±Sloppiness 的随机抖动
全部槽位减去平均值，使阵型中心在原点
可选排序：fillFromTheSides（先占两侧）、fillToTheCenter（先占中心）
按 SortingClasses（如 "Melee Ranged Hero | Elephant Infantry Cavalry | ..."）把成员分组；
  从"最重要的组"开始，每组从槽位表末尾取同样数量的槽位，组内每个成员取离自己最近的槽位（TakeClosestOffset）
```

`GetRealOffsetPositions` 按控制器朝向旋转偏移得到世界坐标；转向角小于 `MaxTurningAngle` 时不重新分配槽位（`DoesAngleDifferenceAllowTurning`），避免小转弯导致全队换位。

**阵型模板**只描述形状，不带战斗数值：例如 `phalanx.xml` 要求至少 10 名重装步兵、宽深比 4、最少 5 列最多 20 列最多 8 行、间距 ×0.6；
`wedge.xml` 为三角形、要求 6 名骑兵、`Sloppiness` 0.25；`testudo.xml` 固定 8 列、`fillFromTheSides`、最大转向角 0.785 弧度。按行列号还能给成员指定不同动画（`AnimationVariants`）。

**接敌后**：`FORMATIONCONTROLLER.COMBAT.APPROACHING` 把阵型整体移到目标射程，然后对所有成员调用 `Attack`；除非模板允许 `CanAttackAsFormation`，
控制器进入 `MEMBER` 状态等成员各自打完。也就是说 0 A.D. 的阵型是"行军结构"，接敌后实际战斗仍是个体战斗。

分析：
- 可直接借：控制器实体只寻一条路、成员追槽位；成员最慢速度决定阵型速度；按类别分组后就近取槽位；小转向不重排。本作兵团的"编队锚点 + 槽位偏移"（第 5.3 节）用这套生成画面上的士兵位置即可。
- 要改造：本作兵团接敌后仍然是一个结算单位（期望值），槽位只用于画面与"接触槽位数"的计算（正面宽度 = 第一行槽位数），不能像 0 A.D. 那样散成个体。
- 0 A.D. 的阵型不带数值，本作第 5.3 节的阵型是带数值的（正面、移动、受侧击、受范围）；两者不冲突，模板里形状参数与数值参数分开写。

#### 1.4.8 占领

- 每个可占领实体保存一个按玩家编号的占领点数组 `capturePoints`，总和恒为 `maxCapturePoints`。
- 被占领时 `Reduce(amount, 攻方)`：把 `amount` 平均分给所有"与攻方敌对且点数大于 0"的玩家去扣，扣不够的部分循环再分，扣下的总量加给攻方。
- 回复：`GetRegenRate` = 基础回复 + Σ驻军的占领力 × 驻军回复率；领土衰减时按相邻领土的玩家比例把点数分给他们。`TimerTick` 每秒执行，没有变化就停表。
- 易主：所有者的点数归零时，`RegisterCapturePointsChanged` 把所有权交给点数最多的玩家。

分析：这是第 6.3 节"占领据点"目标的好模型，比我们现在 `objectives.ts` 的守点计时更有对抗性：据点保存双方"控制度"，在场兵团按人数与品质贡献占领强度，守方驻军提供回复，归零易手；
数值同样可走期望值，每次内核步结算一次。

#### 1.4.9 状态效果

`StatusEffectsReceiver.AddStatus` 的叠加规则来自数据字段 `Stackability`：`Ignore`（已有则忽略）、`Extend`（延长持续时间）、`Replace`（先移除再加）、`Stack`（以 `code_0`、`code_1`……另起一份）。
带 `Modifiers` 的状态把修正项注册进 `ModifiersManager`；带 `Interval` 或 `Duration` 的挂周期计时器，每次 `ExecuteEffect` 通过 `AttackHelper.HandleAttackEffects` 施加伤害或占领；
目标的抗性可以给出 `blockChance`（概率免疫）与持续时间倍率。

分析：本作第 2.5 节"控制效果对兵团"（混乱、减速、阵型打散、士气冲击）可以用同一套"状态 + 叠加规则 + 修正项"的数据结构，避免每种控制写一个分支。

#### 1.4.10 战斗检测（和平与交战的滞回）

`BattleDetection` 挂在玩家实体上，参数在 `template_player.xml`：`TimerInterval 200`、`RecordLength 12`、`DamageRateThreshold 0.04`、`AlertnessBattleThreshold 4`、`AlertnessPeaceThreshold 0`、`AlertnessMax 8`。

```
OnGlobalAttacked：本玩家打敌方玩家的单位时累加伤害，并启动计时器
每 200 毫秒：把本周期伤害压入记录（保留最近 12 个周期）
每 12 个周期（或警觉度为 0 时每周期）：
  伤害速率 = 记录总和 / (12 × 200)
  速率 > 0.04 -> 警觉度 +1（上限 8），否则 -1（下限 0，归零停表）
  警觉度 ≥ 4 -> 状态 BATTLE；≤ 0 -> 状态 PEACE；发 MT_BattleStateChanged
```

分析：本作可以用同样的"伤害速率 + 警觉度滞回"给每个战场或每条战线判定烈度，用于切换音乐、提示"某战线进入会战"、决定 AI 将领是否从行军切到交战方案、以及战斗日志的段落划分（第 9.2 节因果层）。

#### 1.4.11 寻路三件套与异步请求

**分层（连通性）**：`HierarchicalPathfinder` 把导航格（`NAVCELL_SIZE` 为 1 米）分成 `CHUNK_SIZE = 96` 格见方的区块，区块内每个极大连通区域是一个顶点，
相邻区块的连通区域之间连边，同区块区域之间不连边；再洪泛出"全局区域号"（`GetGlobalRegion`），两点同号即可达。
主要用途是 `MakeGoalReachable`：目标不可达时把它换成离目标中心最近的可达格；非点目标换成离起点最近的可达格。地形变化只重算脏区块（`Update` 接收 `dirtinessGrid`）。

**长路径（跳点搜索）**：`LongPathfinder::ComputeJPSPath` 先让分层寻路修正目标，再在导航格上做 JPS。`JumpPointCache` 按通行类别缓存"从某格沿某方向的第一个跳点或第一个障碍"，
通行数据很少变化所以缓存划算；目标格不进缓存，而是比较"目标是否比第一个跳点更近"来把目标当跳点处理。结果经 `ImprovePathWaypoints` 合并直线段。

**短路径（顶点图）**：`VertexPathfinder::ComputeShortPath` 在起点周围一个方框内（`SHORT_PATH_MIN_SEARCH_RANGE` 12 格起，失败后每次加 4 格，最大 56 格）
收集障碍物的角点与边，在可见性图上搜路，用于绕开其他单位与小障碍；离目标小于 `LONG_PATH_MIN_DIST`（16 格）时直接用短路径。连续失败 `MAX_FAILED_MOVEMENTS`（35 次）判定移动失败。

**异步**：路径请求不立即计算。`CCmpPathfinder` 在三个时机计算：`MT_Update` 之前、阵型移动之前（这两处有上限 `m_MaxSameTurnMoves`），以及回合结束到下一回合开始之间多线程算完全部剩余请求。
结果以 `MT_PathResult` 消息在下一回合送达；请求带票号（`m_NextAsyncTicket`），顺序固定，所以多线程不破坏确定性。

分析（对第 5.4 节）：
- 本作兵团锚点的长路可以照"区块连通区域 + 全局区域号"先判可达再搜路；目标不可达时自动改成最近可达点（我们 `terrain.ts` `nearestPassable` 只按格找最近可通行，不保证与起点连通）。
- 战场小（几十格见方）时 JPS 收益有限，二叉堆 A* 加路径共享（第 5.3 节）更划算；大地图（`world/grid.ts` `findPath`）应先把开放表从线性扫描换成堆。
- "请求在本步收集、下一步开头统一落地"的异步模式即使单线程也值得学：寻路开销可以按上限摊到多步，且不影响确定性。

#### 1.4.12 范围查询与视野计数

- **空间索引**：`FastSpatialSubdivision` 用固定 `SUBDIVISION_SIZE = 20`（米，注释"比多数建筑与实体大"）的网格，每格一个实体列表，删除用"与末尾交换再弹出"。
- **主动查询**：每个查询保存上次结果 `lastMatch`。`ExecuteActiveQueries` 每回合（`MT_Update`）重新查询，与上次结果做集合差，得到"新增"（按距离稳定排序）与"移除"，
  没有变化就不发消息。查询多线程执行，但消息先写入按查询顺序编号的数组再统一发送，注释写明"消息顺序必须完全确定"。
- **视野**：视野格 `LOS_TILE_SIZE = 4`（米）。每个玩家一张 `uint16` 计数网格 `m_LosPlayerCounts`：单位出现时把视野圆覆盖的格子计数 +1，消失时 -1，移动时先减旧圆再加新圆
  （`LosUpdateHelperIncremental`）；计数大于 0 即可见。另有每格 2 位的 `m_LosState` 记录"未探索、已探索、可见"，它依赖探索历史所以要序列化，计数网格可重算所以不序列化。
  据代码视野为圆形覆盖，未见地形遮挡计算（待核实）。

分析：本作迷雾（第 5.2 节）可直接用"每格计数 + 已探索位"：兵团与完整实体按视野半径加减计数，高低层遮挡只在"加计数"时用 DDA 视线过滤；
敌我交战的索敌也可用"主动查询 + 差分消息"替代 `resolveContacts` 的全量扫描，兵团数到 32 对 32 时差别明显。

#### 1.4.13 领土

`CCmpTerritoryManager` 在领土格上为每个影响源（`CCmpTerritoryInfluence`：半径、权重、是否根）单独做一次洪泛：

```
relativeFalloff = 权重 × 领土格边长 / 半径
从中心格出发，邻格权重 = 当前格权重 - relativeFalloff × 邻格地形代价（斜向 ×362/256，约 √2）
只在新权重优于该格旧权重时扩展
玩家网格累加各影响源的权重；某格的所有者 = 权重和最大的玩家
建筑脚下的格权重视为无穷，按实体号升序，最老的建筑保有重叠格
最后从根影响源（如市镇中心）洪泛同主格，标记 TERRITORY_CONNECTED_MASK；不连通的领土会衰减
```

分析：这是 SLG 层"势力范围"的一种做法，属于同目录 SLG 调研的范围；与本文相关的只有一点：战场上的"守土士气"（第 3.4 节）可以读这种连通领土位，判断兵团是否在本国连通领土内作战。

#### 1.4.14 Petra AI

**调度**：`_petrabot.js` 只在 `(turn + player) % 8 == 5` 时运行，即每 8 回合（1.6 秒）一次并按玩家号错峰。`headquarters.js` 的 `update` 再按 `playedTurn % 4`、`% 5`、`% 10` 轮流做练兵、盖房、研究、扩张等，进一步摊开计算。

**计划对象**（`attackPlan.js` `AttackPlan`）：

| 类型 | 队列优先级 | 兵种需求 `unitStat`（节选：`minSize` 到 `targetSize`） |
| --- | --- | --- |
| `Rush` | 250 | 步兵 10 到 20、快速单位 2 到 4 |
| `Raid` | 150 | 快速单位 3 到 4 |
| `Attack`（默认） | 70 | 远程步兵 6 到 16、近战步兵 6 到 16、快速单位 2 到 6 |
| `HugeAttack` | 90 | 公民兵与精英兵各若干组、英雄 0 到 1 |

每组 `unitStat` 带 `priority`、`minSize`、`targetSize`、`batchSize`、`classes`；低难度把 `targetSize` 乘一个变化系数并压低 `minSize`，`popScaling` 按人口上限再缩放。
每个计划在 `queueManager` 里开自己的生产队列（`"plan_" + name`，另有 `_champ`、`_siege`）。

**状态**：`unexecuted`（招兵）、`completing`（集结、归还资源）、`walking` 或 `transporting`、`arrived`。

```
canStart:  所有兵种组都达到 minSize
mustStart: 所有组都达到 targetSize；或（Raid 且目标地基进度 > 50%）
updatePreparation:
  completing 时目标没了 -> 回到 unexecuted
  人口接近上限（余量小于 5）：已满足 canStart 或兵力超过阈值 -> 清空生产队列（不再招兵）；否则中止，单位分给别的计划
  有攻城单位且兵力 > 20 + 2 × 敌军单位总数 -> forceStart（把 min/target 清零）
UpdateWalking:
  本轮被攻击超过 1 次且有单位或攻城被打，并且已在目标玩家领土内或被攻击超过 3 次 -> arrived
  5 回合内几乎没动 -> 处理卡住的攻城单位
  遇到墙：有能打墙的单位就 arrived 开打，否则放弃
  离目标足够近或路径走完 -> arrived
arrived 后的 update（每次只重分配约 10 个单位，开打那一刻全量）：
  统计每个敌方单位被几个己方单位盯住：初值 攻城或英雄 -8、精英或船 -5、其他 -3，每被盯一次 +1；
  大于 0 的进入否决表 veto，其他单位不再选它（攻城或英雄最多 8 人围攻，普通单位 3 人）
  被攻击的单位优先就近支援或反击；按计划类型设定"要打/要避开"的建筑类别
```

**发起进攻**（`attackManager.js` `update`）：`setRushes` 按性格的进攻性决定最多几次 Rush（强 3、中 2、弱 1）；
有兵营且 Rush 次数未用完就建 Rush；没有准备中的大规模进攻且已开打的数量不足 `min(2, 1 + round(人口上限/100))` 时，前两次建 `Attack`，之后建 `HugeAttack`。

**防守**（`defenseManager.js` `assignDefenders`）：把入侵敌人聚成"军团"（`defenseArmy.js`，参数 `armyCompactSize`、`armyBreakawaySize`、`armyMergeSize`，均为距离平方）。
`needsDefenders` 比较守方需要的兵力，`defenseRatio` 在本方领土为 2、盟友领土 1.4、中立 1.8（即守方要凑到攻方强度的 2 倍）。
分配时第一轮只派同一陆地连通区内最近的军团，第二轮放宽；领土外或距离远时最多留 12 个后备不派。

**兵力估算**（`entityExtend.js` `getMaxStrength`）：攻击力按 `DamageTypeImportance` 加权求和，加 `射程 × 0.0125`，加减攻击时间的小项，再加抗性项。这是一个手调的启发式。

**预算**（`queueManager.js`）：每个队列有按资源分的账户，空闲资源按优先级分给各队列，队列账户够付下一件就开工。文件头注释自承缺点：账户不可回收，AI 常年压着几百资源。

**性格与难度**（`config.js`）：性格三维 `aggressive`、`defensive`、`cooperative`。用户选的行为档给出区间（防守 0 到 0.27、平衡 0.37 到 0.63、进攻 0.73 到 1），
在区间内随机且"进攻约等于 1 减防守"并带少量去相关；离散决策用 `personalityCut = { weak: 0.3, medium: 0.5, strong: 0.7 }`。难度（`difficultyLevel.js` 从沙盒 0 到非常难 5）调 `popScaling`、工人目标数、哨塔数等策略量，不调战斗数值。

### 1.5 对《箱庭纪》的借鉴（分析）

可直接借的方法：
1. **数据化分层状态机**：英雄 AI 驱动器（A 层）与兵团战术状态（B 层的待命、行军、交战、追击、溃退、重整）都可以写成 0 A.D. 式的嵌套规格对象，实例只存状态名字符串，天然可序列化、可回放。
2. **订单队列 + 消息投递**：兵团的 `order` 从单个字段扩成队列（支持排队与"打完回原任务"），状态通过 `"Order.X"` 处理函数接受或拒绝；被攻击作为事件推送给被攻击方，而不是等 AI 轮次。
3. **姿态表**：把 `FrontCharter` 与将领"主动性"落成姿态开关（可追击、可追出视野、坚守点、遇敌撤退阈值），玩家急令带 `force`。
4. **修正项管线 + 同名光环去重 + 合成后封顶**，见 1.4.5。
5. **晋升做成等级到修正项的数据表**，经验按伤亡比例给，见 1.4.6。
6. **占领点对抗**做据点目标，见 1.4.8；**战斗检测滞回**做烈度判定，见 1.4.10。
7. **Petra 的计划对象**：每个作战方案（`warfare_rts.md` 第 7.2 节）实例化成一个计划，带兵种需求、生命周期、开打条件与中止条件；"同一目标盯防上限"的否决表直接替换我们 `ai.ts` `pickTarget` 的认领惩罚。
8. **AI 低频错峰**：AI 将领按 `(step + teamIndex) % N` 错峰运行，与设计第 7.1 节"战术执行 5 Hz、方案至少间隔 60 秒"一致。
9. **周期哈希比对 + 失同步转储**，见 1.4.1。

要改造的点：
- 0 A.D. 阵型接敌即散，本作兵团必须保持为结算单位；槽位只服务画面与正面宽度。
- 0 A.D. 的抗性公式与伤害类型（Hack、Pierce、Crush）不必照搬，本作沿用主工程公式与本作的伤害对护甲表。
- Petra 的 `getMaxStrength` 是手调启发式，本作已有更有依据的 C 层战力 `count × sqrt(dps × ehp)`，不要退回。
- Petra 的资源账户机制有已知缺陷（不可回收），本作将领不管经济，只管兵团调度，不必借。

不要学的坑：
- `UnitAI.js` 一个文件七千多行，所有状态写在一起；本作应按状态族拆模块（与主工程"模块优先"约定一致）。
- 性格参数在区间内随机初始化：对剧情将领应写死在人设数据里，只有无名 AI 才随机，且随机必须走本作的随机流。

### 1.6 许可与复用边界

- 代码（JS 组件、AI、C++ 引擎）为 GPL-2.0-or-later：只借方法，不拷贝代码与 XML/JSON 数据表；本文的伪代码均为转述。单行常量（如 `CHUNK_SIZE = 96`、`0.9` 的幂、`personalityCut`）作为事实引用。
- 美术音频为 CC BY-SA 3.0：本作不使用。

---

## 2. OpenRA

### 2.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-146` |
| 仓库 | `https://github.com/OpenRA/OpenRA`（默认分支 `bleed`） |
| 固定提交 | `b4d95a56717d8d0070f195e343f6c2728ce87900`，2026-11-08 |
| 代码许可 | `COPYING` 为 GPL-3.0 全文；源文件头写明"GPL version 3 of the License, or (at your option) any later version"，即 GPL-3.0-or-later |
| 素材许可 | 仓库不含原作 Westwood 美术与音频；README 声明"EA has not endorsed and does not support this product"。原作资源需另行取得（具体方式见其 Wiki，待核实） |
| 语言与规模 | C#（.NET）；`OpenRA.Game` 为引擎核心，`OpenRA.Mods.Common` 为通用玩法 Trait 与 Activity；规则与武器为 MiniYaml（`mods/*/rules/*.yaml`、`mods/*/weapons/*.yaml`）。`HierarchicalPathFinder.cs` 约 1280 行、`OrderManager.cs` 约 330 行 |
| 本地镜像 | `D:\hakoniwa_refs\openra`（约 8 MB） |
| 已检出目录 | `OpenRA.Game/{Network,Activities,Traits,Primitives}`、`OpenRA.Mods.Common/{Traits,Activities,Pathfinder,Effects}`、`mods/ra/rules`、`mods/cnc/rules`；武器、`ModularBot.cs`、`World.cs` 等用 `git show` 读取 |
| 分级 | 必读 |

### 2.2 值得看的理由

- **数据驱动单位**：单位 = YAML 里一组 Trait 配置，用继承、删除、多实例后缀与"条件"表达式组合出行为。这是本作兵种定义（设计第 11 节 `RegimentType`，代码中为 `UnitTypeDef`，内容表 `regiment_types`）与兵种变体（`warfare_rts.md` 第 3.1 节"定位 × 品质 × 变体"）最直接的样板。
- **Activity 栈**：移动、攻击、采集都是可嵌套、可排队、可取消的活动，适合兵团与英雄的命令执行（第 2.4 节"手动中途切自动不重置状态"要求命令执行可中断可恢复）。
- **锁步与失同步报告**：`OrderManager` 与 `SyncReport` 是"只同步命令、定期比哈希、出错转储最近几帧"的完整实现，对照本作的世界哈希与回放（第 2.4 节、第 5.4 节）。
- **Bot 模块**：小队管理（含模糊逻辑攻逃判定）、采矿、建造各自是一个可配置模块，对应第 7.1 节"战术执行规则 AI"。
- **分层寻路**：抽象图只用来改进 A* 启发式，路径仍在原网格上搜，思路简单可移植。

### 2.3 源码导读

| 想弄懂 | 读这些（路径 + 符号） | 该处的机制 |
| --- | --- | --- |
| YAML 规则与继承 | `mods/ra/rules/defaults.yaml`（`^Soldier`、`^GainsExperience` 等抽象模板）、`mods/ra/rules/infantry.yaml`（`DOG`、`E1`）；`OpenRA.Game/MiniYaml.cs` | `Inherits:` 继承、`Inherits@X:` 多重继承、`-Trait:` 删除继承来的 Trait、`Trait@SUFFIX:` 同类 Trait 多实例 |
| 条件系统 | YAML 中的 `RequiresCondition`、`PauseOnCondition`、`GrantConditionOnAttack`、`GrantCondition`、`GrantConditionWhileAiming`；`OpenRA.Mods.Common/Traits/Conditions/` | Trait 是否生效由命名布尔或计数条件的表达式决定（`rank-veteran == 1`、`run && !parachute`） |
| 经验与等级 | `OpenRA.Mods.Common/Traits/GainsExperience.cs`（`Conditions`、`ExperienceModifier`、`GiveExperience`）、`GivesExperience.cs`（`ActorExperienceModifier`、`Killed`）；`defaults.yaml` 的 `^GainsExperience` | 击杀给经验，门槛按自身造价倍数；等级以条件授予，修正 Trait 按条件生效 |
| 武器与伤害 | `mods/ra/weapons/*.yaml`（如 `smallcaliber.yaml`）；`OpenRA.Mods.Common/Warheads/SpreadDamageWarhead.cs` 的 `Spread`、`Falloff`、`Range`；`DamageWarhead` 的 `Versus` | 弹头对护甲类型的百分比表；距离分段衰减 |
| Activity 栈 | `OpenRA.Game/Activities/Activity.cs` 的 `Activity`、`ActivityState`、`TickOuter`、`Tick`、`QueueChild`、`Queue`、`Cancel`、`ChildHasPriority`、`IsInterruptible` | 子活动优先，父活动在子活动完成后才继续；同级用 `NextActivity` 链表排队 |
| 攻击活动 | `OpenRA.Mods.Common/Activities/Attack.cs` 的 `AttackStatus`、`Tick`、`TickAttack`；`Activities/Move/Move.cs`、`MoveWithinRange.cs`、`AttackMoveActivity.cs` | 不在射程就排一个子活动"移动到射程内"，回来再打 |
| 锁步 | `OpenRA.Game/Network/OrderManager.cs` 的 `TryTick`、`IsNetFrame`、`SendOrders`、`ProcessOrders`、`IsReadyForNextFrame`、`ReceiveSync`、`OutOfSync`；`mods/ra/mod.yaml` 的 `GameSpeeds`；`Session.cs` 的 `NetFrameInterval` | 每个网络帧收齐所有客户端的命令包才前进；每帧上报世界哈希 |
| 同步哈希 | `OpenRA.Game/World.cs` 的 `SyncHash`；`OpenRA.Game/Sync.cs` 的 `VerifySyncAttribute`、`HashActor`、`HashPlayer`；Trait 字段上的 `[VerifySync]`（如 `Health.cs`、`Mobile.cs`） | 对标注字段自动生成哈希函数，按实体号加权求和 |
| 失同步报告 | `OpenRA.Game/Network/SyncReport.cs` 的 `NumSyncReports`、`UpdateSyncReport`、`GenerateSyncReport`、`DumpSyncReport` | 环形缓冲保存最近 7 帧的逐 Trait 字段值与命令，出错时转储 |
| Bot 框架 | `OpenRA.Mods.Common/Traits/Player/ModularBot.cs` 的 `Activate`、`IBot.QueueOrder`、`MinOrderQuotientPerTick`；`OpenRA.Game/Player.cs` 中 `IsBot && Game.IsHost` | Bot 只在主机激活，只能排命令，每 tick 限量发出 |
| 小队管理 | `OpenRA.Mods.Common/Traits/BotModules/SquadManagerBotModule.cs` 的 `SquadSize`、`SquadSizeRandomBonus`、`AssignRolesInterval`、`AttackForceInterval`、`CreateAttackForce`、`TryToRushAttack`、`ProtectOwn`；`Squads/Squad.cs`、`Squads/StateMachine.cs`、`Squads/States/GroundStates.cs`、`Squads/AttackOrFleeFuzzy.cs` | 小队是带状态机的对象；攻逃用 Mamdani 模糊推理 |
| 采矿 Bot | `BotModules/HarvesterBotModule.cs` 的 `ScanForIdleHarvestersInterval`、`HarvesterEnemyAvoidanceRadius` | 空闲采集车定期派单，选矿时绕开敌人 |
| 自动索敌姿态 | `OpenRA.Mods.Common/Traits/AutoTarget.cs` 的 `UnitStance`（`HoldFire`、`ReturnFire`、`Defend`、`AttackAnything`）、`InitialStance`、`InitialStanceAI` | 玩家单位默认 `Defend`，AI 单位默认 `AttackAnything` |
| 分层寻路 | `OpenRA.Mods.Common/Pathfinder/HierarchicalPathFinder.cs`（类注释、`GridSize`）、`PathSearch.cs` 的 `DefaultCostEstimator`；`Traits/World/Locomotor.cs` 的 `TerrainSpeeds`、`MovementCostToEnterCell`、`SharesCell` | 抽象图给出更准的启发式 |
| 移动与堵塞 | `Activities/Move/Move.cs` 的 `PathSearchOrder`、`EvalPath`、`PopPath`、`hasWaited`；`Locomotor.cs` 的 `WaitAverage`、`WaitSpread` | 按"全部阻挡、静止阻挡、不可移动阻挡、无阻挡"逐级放宽寻路；被友军挡住先等再绕 |
| 迷雾 | `OpenRA.Game/Traits/Player/Shroud.cs` 的 `visibleCount`、`explored`、`touched`、`resolvedType`、`AddSource`、`CellVisibility` | 每格可见计数加已探索位，脏格在 Tick 中统一解析 |

### 2.4 机制拆解

#### 2.4.1 YAML 规则、Trait 与条件

一个单位就是 YAML 里的一组 Trait 配置。以 `infantry.yaml` 的 `DOG` 为例：继承 `^Soldier`（它又继承 `^Infantry`），用 `-AttackFrontal:` 删掉继承来的正面攻击，
加上 `AttackLeap`；`GrantConditionOnAttack` 在攻击时授予条件 `eating`，`RevokeDelay: 20` 个 tick 后撤销；`Mobile` 写 `PauseOnCondition: attack-cooldown || eating`，
即咬人与冷却期间不能移动；`GrantConditionWhileAiming` 授予 `run`，`SpeedMultiplier` 写 `Modifier: 150` 且 `RequiresCondition: run`，即瞄准时冲刺 1.5 倍；
`WithInfantryBody@RUN` 这样的后缀让同类 Trait 有多份。

条件是命名的计数（同一条件可被多个来源授予），表达式支持比较与逻辑运算。等级就是用条件实现的（`defaults.yaml` 的 `^GainsExperience`）：

```
GainsExperience.Conditions: 200: rank-veteran, 400: rank-veteran, 800: rank-veteran, 1600: rank-veteran
  门槛 = 键 × ExperienceModifier（缺省为自身造价 Valued.Cost）；每到一级再授予一次 rank-veteran（计数 +1）
GrantCondition@RANK-ELITE: RequiresCondition rank-veteran >= 4 -> rank-elite
DamageMultiplier（受伤倍率）: 1 级 95、2 级 90、3 级 85、精英 75
FirepowerMultiplier（火力）:  105、110、120、精英 130
SpeedMultiplier（速度）:      105、110、120、精英 140
ReloadDelayMultiplier（装填）: 95、90、85、精英 75
ChangesHealth@ELITE: 精英每步回复 5% 生命
```

经验来源：`GivesExperience.Killed` 在单位被击杀时给击杀者 `被杀者造价 × ActorExperienceModifier%`（缺省 10000%，即 100 倍造价）。
于是 1 级要累计击杀相当于自身造价 2 倍的敌人，4 级要 16 倍。只有最后一击得经验，与 0 A.D. 按伤害比例给经验不同。

伤害：武器的 `Warhead@1Dam: SpreadDamage` 带 `Damage`、`Versus`（对每种护甲类型的百分比，例如某高射炮对 `None` 40、`Wood` 10、`Light` 60）、
`Spread` 与 `Falloff`（缺省 `[100, 37, 14, 5, 0]`，按 `Spread` 的整数倍距离分段衰减）。

分析：
- "条件"机制是本作兵团状态（动摇、溃退、陷阵、混乱、阵型打散）与修正项之间最干净的粘合层：状态授予条件，修正项声明 `requires`，内核不需要为每种状态写分支。设计中的这些状态，代码目前只有溃退 `rout` 与阵型打散 `brokenUntil`，动摇只体现为士气低于 40 时伤害乘 0.9。
  TS 实现可以是"条件名 → 计数"的字典加一个极小的表达式求值器，或者干脆限定为 `all/any/not` 的结构化写法，避免解析字符串。
- YAML 的 `Inherits` 与 `-Trait` 删除对兵种变体很有用：`民兵 = 基础步兵 + 守土`、`精灵弓手 = 基础弓手 - 森林减速`。
- OpenRA 的等级加成数值是百分比整数（95、105），全部整数运算；本作兵团期望值目前用浮点，确定性靠同一 JS 引擎，暂可接受（见第 9 节第 8 条）。

#### 2.4.2 Activity 栈

```
abstract class Activity:
  State: Queued | Active | Canceling | Done
  ChildActivity: 当前子活动（子活动优先执行）
  NextActivity:  同级下一个活动（排队）
  TickOuter(self):
    Done -> 返回 NextActivity
    Queued -> 变 Active，调用 OnFirstRun
    若有子活动：先跑子活动（ChildHasPriority 为 true 时父活动这一 tick 不跑）
    子活动结束后调用自己的 Tick；Tick 返回 true 表示完成 -> OnLastRun -> Done -> 返回 NextActivity
  QueueChild(a): 挂子活动；Queue(a): 挂到同级链尾
  Cancel(self, keepQueue): 递归取消子活动；尚未运行的直接 Done，运行中的进入 Canceling，由 Tick 负责收尾
```

攻击活动（`Attack.Tick` 与 `TickAttack`）：目标无效就完成；需要转向就返回 `NeedsToTurn`；不在射程就 `QueueChild(move.MoveWithinRange(target, minRange, maxRange, ...))` 返回 `NeedsToMove`，
子活动走完后父活动下一 tick 重新判断；在射程且朝向对就开火。注释要求每个 Tick 至少有一处 `return true`，避免活动永不结束。

分析：本作兵团命令目前是单字段 `order`（`types.ts` `UnitOrder`），`kernel.ts` `moveRegiment` 用一串 `if` 处理。改成 Activity 栈后：
"攻击 = 子活动移动 + 自身交战"、"撤退 = 移动到撤退点 + 离场"、"包抄 = 绕行路点序列 + 攻击"都能组合；玩家中途接管或交给将领只需取消或替换栈，不重置兵团状态（第 2.4 节）。
Activity 本身要保持纯数据（类型 + 参数 + 状态），才能随世界一起序列化。

#### 2.4.3 锁步、同步哈希与失同步报告

- 节拍：`mods/ra/mod.yaml` 的 `GameSpeeds` 中常速 `Timestep: 40`（毫秒，25 Hz）、`OrderLatency: 3`；`Session.cs` 的 `NetFrameInterval` 缺省 3，即每 3 个本地帧为一个网络帧。
- `OrderManager.TryTick`：

  ```
  若本帧是网络帧（LocalFrameNumber % NetFrameInterval == 0）：
    除自己外所有客户端都至少有一个待处理命令包 -> 可以前进，并发送本地命令（SendOrders）
    IsReadyForNextFrame（所有客户端都有包）-> ProcessOrders
  前进则 LocalFrameNumber++
  ProcessOrders：
    依次取每个客户端该帧的命令包；帧号对不上直接抛异常（"crash early instead of desyncing"）
    每帧都必须有包，空包也要发，它决定模拟节奏
    执行命令；之后 Connection.SendSync(帧号, World.SyncHash(), 战败位图)
    开启时 syncReport.UpdateSyncReport(本帧命令)；NetFrameNumber++
  ReceiveSync：同一帧收到的哈希或战败位图与已记录的不同 -> OutOfSync(frame)，转储同步报告
  ```

- `World.SyncHash`：`Σ (序号 × (1 + 实体号) × HashActor(a))` 遍历所有实体，再加所有实现 `ISync` 的 Trait 上标了 `[VerifySync]` 的字段、参与模拟的特效（弹丸）、共享随机数 `SharedRandom.Last`、玩家渲染状态。
  `Sync.cs` 用反射为每个类型生成哈希函数，不可哈希的字段类型在启动时报错。
- `SyncReport`：`NumSyncReports = 7` 的环形缓冲，每帧记录每个实体每个 `ISync` Trait 的字段名与值、特效、命令；失同步时把这 7 帧全部写入日志，对比两边日志即可定位第一个分歧字段。

分析：本作单机为主，但"同一种子回放"和"自动结算与手动战斗结果一致"（第 2.4 节、第 2.5 节标定测试）同样需要失同步诊断。可借：
1. 战斗内每 N 步算一次兵团关键字段哈希（人数、伤害余量、坐标、士气、随机数状态）记入战报；回放时逐步比对，第一处不同就转储前后几步的逐字段值。
2. 用"字段白名单"而不是整份 JSON 做哈希，速度快且能直接告诉你是哪个字段分歧。
3. "每帧必须有包，空包也发"的节奏控制对将来联机有用；大模型方案作为命令进入命令流（第 2.4 节）天然满足"按帧号排序执行"。

#### 2.4.4 Bot 框架：只在主机、只下命令、限量发出

- `Player.cs`：只有 `IsBot && Game.IsHost` 时才激活 Bot 逻辑。`ModularBot.Activate` 的注释："Bot logic is not allowed to affect world state, and can only act by issuing orders. These orders are recorded in the replay"。
- 各 Bot 模块通过 `IBot.QueueOrder` 把命令放进队列；每 tick 发出 `ceil(待发数 / MinOrderQuotientPerTick)` 条（缺省 5，即至少发出五分之一），多余的留到之后的 tick。
- 因为 Bot 只在主机运行，它可以使用非同步随机（例如 `SquadManagerBotModule.CreateAttackForce` 用 `World.LocalRandom` 给小队规模加随机），不会破坏其他客户端的确定性；回放时 Bot 不运行，只重放它下过的命令。

分析：这就是本作"模型提议，内核裁决"的工程形态。区别是本作的规则 AI 将领（Utility 兜底、战术执行）在内核里运行并参与确定性，大模型才是"主机侧"的外部输入。
限量发出值得学：将领一次改很多兵团的命令时分几步下发，画面上会更像"传令"，也与第 4.3 节"传令延迟"相合。

#### 2.4.5 小队管理与模糊攻逃判定

`SquadManagerBotModule` 关键参数：`SquadSize = 8`、`SquadSizeRandomBonus = 30`、`AssignRolesInterval = 50`、`RushInterval = 600`、`AttackForceInterval = 75`（单位 tick），
`IdleScanRadius 10`、`DangerScanRadius 10`、`AttackScanRadius 12`、`ProtectionScanRadius 8`（单位格）。

- `CreateAttackForce`：基地附近闲置兵力达到 `SquadSize + 随机(SquadSizeRandomBonus)` 就整体编成一个 `Assault` 小队（不留守备）。
- `TryToRushAttack`：地面兵力达到 `SquadSize` 才考虑，扫描敌方建造场 `RushAttackScanRadius` 内的目标。
- `ProtectOwn`：己方单位被打时组建保护小队反击（据函数名与 `ProtectionTypes`、`ProtectionScanRadius` 的参数说明，细节待核实）。

小队状态机（`Squads/States/GroundStates.cs`）：`Idle`、`AttackMove`、`Attack`、`Flee`。

```
GroundUnitsAttackMoveState.Tick:
  领队目标失效 -> 换领队并找最近敌人；找不到 -> Flee
  领队位置或目标变化就刷新 lastUpdatedTick；超过 63 tick（约 2.5 秒）没变化 -> 回 Idle
    （注释：防止小队卡在去不了的位置，每 tick 产生昂贵寻路）
  ownUnits = 领队周围 (成员数 / 3) 格内的成员
  若 ownUnits < 全部成员：领队 Stop，掉队者 AttackMove 到领队位置（集结）
  否则：AttackScanRadius 内有敌人 -> Attack 状态；否则全队 AttackMove 去目标
  ShouldFlee -> Flee
```

模糊攻逃判定（`AttackOrFleeFuzzy.CanAttack`），输入四个变量：

| 变量 | 计算 | 隶属函数（梯形） |
| --- | --- | --- |
| `OwnHealth` | 己方总生命 / 总最大生命 × 100 | NearDead (0,0,20,40)、Injured (30,50,50,70)、Normal (50,80,100,100) |
| `EnemyHealth` | 同上 | 同上 |
| `RelativeAttackPower` | 己方 Σ伤害每秒 / 敌方 × 100，夹在 0 到 999 | Weak (0,0,70,90)、Equal (85,100,100,115)、Strong (110,150,150,1000) |
| `RelativeSpeed` | 己方平均速度 / 敌方 × 100 | Slow、Equal、Fast（区间同上） |

输出 `AttackOrFlee` 在 0 到 50 上：Attack (0,15,15,30)、Flee (25,35,35,50)；去模糊后小于 30 就进攻。规则是文本，例如"受伤且敌方受伤或健康且我方火力弱且我方速度相同或更快，则逃"。
`Rush` 只有两条：健康且火力强就打，健康且火力不强就逃。伤害每秒的估算是 `Σ弹头伤害 × 连发数 / 装填时间 × 100`，装填时间夹在 1 到 200 之间（注释承认这个上限是拍脑袋）。

分析：
- 本作将领的"攻逃判定"可直接用这四个输入（己方士气或兵力比例、敌方同、相对战力、相对速度）。规则写成数据，性格只换规则集或隶属函数的边界（谨慎型把 Equal 区间右移），
  正好满足第 7.2 节"将领人格落在规则层的权重与成本函数"。若不想引入模糊推理，可退化为分段打分表，同样可读。
- "掉队者先集结"与"2.5 秒不动就回退"两条是我们 `ai.ts` `runTeamAi` 现在完全没有的；兵团速度不同（骑兵与步兵），包抄方案尤其需要集结点。

#### 2.4.6 分层寻路与移动

- `HierarchicalPathFinder`（类注释的要点）：把地图切成 `GridSize = 10` 格见方的小网格，每个小网格内的连通区域是抽象图的一个节点；
  搜路时先在抽象图上做一次反向搜索（从目标往起点，源码中的 `reverseAbstractSearch`），启发式函数 `Heuristic` 对每个格子返回
  `抽象节点.CostSoFar（该抽象节点沿抽象路线到目标的代价） + costEstimator(格子, 该抽象节点)`，其中抽象节点取路线上尽量靠前的一个（`AbstractNodeForCost`，结果缓存）。
  路径本身仍在原网格上搜，抽象图只负责把搜索"引导"绕开湖泊与死胡同。地形或不可移动的建筑、树变化时更新抽象图；可移动单位不进抽象图，所以被单位堵住的隘口仍会让搜索变慢。
- `Locomotor` 的地形代价：每种地形一个速度百分比，代价 = `10000 / speed`（或显式 `PathingCost`），不可通行为 `MovementCostForUnreachableCell`。`SharesCell` 允许步兵多人同格。
- `Move` 活动：按 `PathSearchOrder` = 全部阻挡、静止阻挡、不可移动阻挡、无阻挡 逐级放宽搜路；下一格被友军挡住时，若旁边有同样近的空格就绕，否则先等待
  （`WaitAverage 40`、`WaitSpread 10` tick），等过一次仍堵再重新寻路。

分析：本作战场兵团少（设计暂定每方 32 个兵团上限，待基准测试，代码尚未校验），抽象图的收益在大地图（`world/grid.ts`）更明显。"逐级放宽阻挡"对兵团很实用：先按"其他兵团视为障碍"寻路，失败再忽略移动中的兵团，最后忽略全部兵团只看地形。

#### 2.4.7 迷雾

`Shroud` 为每个玩家维护三张格层：`visibleCount`（每格被多少视野源覆盖）、`explored`（是否探索过）、`touched`（本 tick 被改动的格）。
视野源通过 `AddSource`、`RemoveSource` 增减计数；`Tick` 只解析被 `touched` 的格，得出 `Shroud`、`Fog`、`Visible` 三态（`resolvedType`），变化时通知渲染。
`Shroud` 本身实现 `ISync`，参与同步哈希。

分析：与 0 A.D. 的计数网格同构，再加"脏格集合"只重算改动部分。本作 2D 迷雾的数据层照此实现，渲染层只读三态。

### 2.5 对《箱庭纪》的借鉴（分析）

可直接借：
1. **条件系统**：兵团状态与修正项之间用"条件计数 + 声明式 requires"连接（2.4.1）。
2. **Activity 栈**取代单字段命令（2.4.2）。
3. **字段白名单哈希 + 最近若干步的逐字段报告**（2.4.3）。
4. **Bot 只下命令、限量发出、命令进回放**（2.4.4）。
5. **小队状态机 + 集结检查 + 超时回退 + 四输入攻逃判定**（2.4.5）。
6. **逐级放宽阻挡的寻路**（2.4.6）。

要改造的点：
- OpenRA 是逐单位模拟（每个步兵一个 Actor），本作 B 层是兵团期望值；可借的是行为组织方式，不是逐单位的移动与开火。
- 模糊推理库（`MamdaniFuzzySystem`）是额外依赖；本作可用分段线性打分表达同样的规则，保持依赖极少。
- 经验只给最后一击会让兵团之间分配不公；本作按伤亡贡献比例分配更合适（参考 0 A.D.）。

不要学的坑：
- `CreateAttackForce` 把基地附近闲置兵力"全部拉走、不留守备"，是 Bot 好打的原因之一；本作将领应遵守授权书中的预备队与守备要求。
- 模糊规则里写死的"装填时间上限 200"之类的拍脑袋常数要避免，所有阈值放进将领数据。

### 2.6 许可与复用边界

- GPL-3.0-or-later：只借方法；YAML 规则与武器数值也属 GPL 作品，不拷贝。本文引用的阈值（`SquadSize = 8`、隶属函数边界、等级百分比）作为事实引用。
- 仓库不含原作素材，本作也不涉及。

---

## 3. Curse of War

### 3.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-132` |
| 仓库 | `https://github.com/a-nikolaev/curseofwar` |
| 固定提交 | `6292ca88b908d29c159b5e26a996d9d83c73144b`，2021-10-06（项目已多年不更新） |
| 代码许可 | `LICENSE` 为 GPL-3.0 全文；源文件头写"either version 3 of the License, or (at your option) any later version"，即 GPL-3.0-or-later |
| 素材许可 | 只有少量 SDL 版贴图（`images/`）与图标，未单独声明，随仓库许可（待核实）；本作不用 |
| 语言与规模 | C，约 5000 行（含 ncurses 与 SDL 两个前端、UDP 联机）；规则核心只在 `grid.c`、`state.c`、`king.c` 三个文件 |
| 本地镜像 | `D:\hakoniwa_refs\curseofwar`（约 1.7 MB，已全量检出） |
| 已检出目录 | 全部 |
| 分级 | 必读 |

### 3.2 值得看的理由

- 它是"没有单位微操、只有意图"的 RTS：玩家不选兵、不下移动命令，只在地图格上插旗、建城、升级城市；人口自己在格子间扩散、被旗帜吸引、在同格与敌人互相消耗。
  这正是 [`warfare_rts.md`](../../40_design/systems/warfare_rts.md) 第 2.3 节 C 层战略抽象、第 7.3 节"玩家不在场的战线"、第 6.2 节与第 11 节"授权书"（`FrontCharter`）想要的体验：
  玩家给方向与优先级，执行交给系统。
- 代码极小，规则全部在三个文件里，读透一遍就能在本作里用自己的方式重写。
- 它的 AI（"国王"）只做两件事：按策略公式插旗、按收益公式建城。策略种类恰好对应几种将领性格。

### 3.3 源码导读

| 想弄懂 | 读这些（路径 + 符号） | 该处的机制 |
| --- | --- | --- |
| 地图与格子 | `common.h` 的 `MAX_PLAYER`、`MAX_WIDTH`、`MAX_HEIGHT`、`DIRECTIONS`、`MAX_POP`；`grid.h` 的 `tile_class`、`struct tile`、`struct grid`；`grid.c` 的 `dirs`、`is_inhabitable`、`is_a_city` | 六角格，每格一个地形类别、一个所有者、每个玩家一份人口 |
| 旗帜势场 | `grid.h` 的 `struct flag_grid`、`FLAG_POWER`；`grid.c` 的 `spread`、`even`、`add_flag`、`remove_flag`、`remove_flags_with_prob` | 每个玩家一张旗帜表与一张"召唤值"表 `call`；插旗就在可居住格上叠加一个按步减半的势场 |
| 一步模拟 | `state.c` 的 `simulate`、`growth`、`rnd_round`，常量 `GROWTH_1`、`GROWTH_2`、`GROWTH_3`、`ATTACK`、`MOVE`、`CALL_MOVE` | 矿权与金币、同格交战、城市燃毁、归属、城市增长、迁移、再定归属、AI 重评估 |
| 建城与降级 | `king.h` 的 `PRICE_VILLAGE`、`PRICE_TOWN`、`PRICE_CASTLE`；`king.c` 的 `build`、`degrade` | 草地到村、村到镇、镇到城堡逐级升级；被打得太狠就降一级 |
| AI | `king.h` 的 `enum strategy`、`struct king`；`king.c` 的 `king_evaluate_map`、`builder_default`、`place_flags`、`action_aggr_greedy`、`action_one_greedy`、`action_persistent_greedy`、`action_opportunist`、`action_noble`；`state.c` 的 `kings_move`、`state_init` 中的策略分配 | 每个国王先算一张"地块价值"表，再按策略公式插拔旗、按收益公式建城 |
| 节拍 | `main.c` 的 `run`、`setitimer`（10 毫秒）；`main-common.c` 的 `game_slowdown` | 每 `slowdown` 个计时器周期跑一次 `kings_move` 加 `simulate` |
| 联机 | `server.c` 的 `server_send_msg_s_state`、命令处理 `MSG_C_BUILD`、`MSG_C_FLAG_ON`、`MSG_C_FLAG_OFF`、`MSG_C_FLAG_OFF_ALL`、`MSG_C_FLAG_OFF_HALF`；`messaging.h` 的 `msg_s_data` | 服务器权威，每一步把整张图的状态广播给客户端 |

### 3.4 机制拆解

#### 3.4.1 地图与数据

- 六角格，邻接方向 `dirs = {(-1,0),(1,0),(0,-1),(0,1),(1,-1),(-1,1)}`；地图最大 40 × 29。
- 地形类别：`abyss`、`mountain`（不可居住）、`mine`（矿，不可居住）、`grassland`、`village`、`town`、`castle`（可居住；后三者是城市）。
- 每格保存所有者 `pl` 与 `units[玩家][citizen]`（只有一种兵种"公民"），每个玩家每格人口上限 `MAX_POP = 499`。
- 每个玩家有金币 `country.gold`；每个玩家一张 `flag_grid`：`flag[x][y]`（是否插旗）与 `call[x][y]`（召唤值，所有旗帜势场之和）。
- 开局每个玩家在一座城堡上有 10 人。

#### 3.4.2 旗帜势场

```
FLAG_POWER = 8
add_flag(x, y):    若该格可居住且未插旗：flag = ON；u 清零；spread(call, x, y, 8, +1)
remove_flag(x, y): flag = OFF；spread(call, x, y, 8, -1)
spread(u, v, x, y, val, factor):
  越界或不可居住 -> 返回
  d = val - u[x][y]                 // u 记录本次扩散已给这一格的最大值
  若 d > 0：
    v[x][y] = max(0, v[x][y] + d × factor)
    u[x][y] += d
    对六个邻格 spread(..., val / 2, factor)   // 整数除法：8、4、2、1、0
```

效果：每面旗在可居住格上形成"中心 8、一步 4、两步 2、三步 1"的势场，山与深渊挡住扩散（所以势场沿可通行路径传播，是一张截断到 3 步的距离场）。
多面旗的势场相加；拔旗时按同样的形状减回去。`remove_flags_with_prob(prob)` 以概率拔掉旗帜，玩家命令"全部拔掉"（概率 1）与"拔掉一半"（概率 0.5）就用它。

#### 3.4.3 一步模拟 `simulate`

```
time += 1
对每一格：
  [矿] 若六个邻格中可居住格的所有者都相同（中立不计）-> 矿归该玩家，玩家 gold += 1；有两家以上 -> 中立
  [交战] total = Σ_p units[p]
         对每个玩家 p：dmg_p = rnd_round(敌方人数_p × 本方人数_p / total)；units[p] -= dmg_p
         记下所有者那一方的 dmg 作为 defender_dmg
  [燃城] 若 defender_dmg > 2 × MAX_POP × ATTACK（约 99.8）且是城市 -> degrade（城堡变镇、镇变村、村变草地），标记需要 AI 重评估
  [归属] 所有者 = 人口严格最多的玩家（从中立开始比较，平手不换）
  [增长] 城市格：所有者的人口 × growth(地形)，取 rnd_round，上限 499
         growth：村 1.10、镇 1.20、城堡 1.30（GROWTH_1、GROWTH_2、GROWTH_3）
[迁移] 随机决定本步行、列的扫描方向（正序或倒序）
  对每一格、每个玩家 p：initial = 本格 p 的人口
    从随机起点开始依次看六个邻格（只看可居住格）：
      dcall = max(0, call_p[邻格] - call_p[本格])
      dpop  = rnd_round(MOVE × initial + CALL_MOVE × dcall × initial)     // MOVE 0.05、CALL_MOVE 0.10
      dpop  = min(dpop, 本格现有 p 人口, MAX_POP - 邻格 p 人口)
      本格减 dpop，邻格加 dpop
[再定归属] 同上
若本步有建造或燃城 -> 所有国王 king_evaluate_map
难度为 hard / hardest 时，AI 玩家（金币大于 0）每步额外 +1 / +2 金币
```

`rnd_round(x)` 是随机舍入：整数部分加上以小数部分为概率的 1，期望值等于 `x`，与本作"伤害余量不丢"的目标相同但手段不同（本作用累加器 `dmgAcc`，更确定）。

**交战的性质**（对两方 A、B 同格）：每步双方期望损失相同，都是 `A × B / (A + B)`；一步之后 `A' = A² / (A + B)`、`B' = B² / (A + B)`，
所以 `A' - B' = A - B`：**人数差不变，比值每步平方**。例如 100 对 50：第一步双方各损约 33，剩 67 对 17；第二步各损约 13，剩 53 对 3；第三步结束，胜方约剩 50。
这等价于"一换一"的兰彻斯特线性律结局，但收束速度随比值拉大而加快。由于城市每步按 10% 到 30% 增长，守城方实际上自带增援，攻方必须用旗帜持续把人口导向前线。

**迁移的性质**：无旗时每个邻格每步分走 5%，即一个被可居住格包围的格子每步外流约 30%（同时也从邻格流入），表现为扩散；
有旗时势差 4、2、1 分别再加 40%、20%、10% 的定向流动。势场只有 3 步远，所以要把人口从后方调到远处前线，玩家需要连成"一串旗"，旗帜实际上是路点。

#### 3.4.4 建城与经济

- 价格：村 160、镇 240、城堡 320 金币（`PRICE_VILLAGE` 等）；`build` 只能在自己拥有的格上逐级升级。
- 金币只来自矿：每步每座被独占的矿 +1。城市决定增长率（兵员补充），矿决定能建多少城，两者都是"占地才有"。

#### 3.4.5 国王 AI

`king_evaluate_map`（地块价值表）：

```
每个可居住格 value += 1（persistent 策略再 +1）
城堡：在 value 表上 spread 16（noble 策略 32），镇 spread 8，村 spread 4（noble 策略 2）
矿：对它的每个邻格 spread 4（midas 策略 8）
难度削弱：easiest -> value / 4 + 随机(-3 到 3)；easy -> value / 2 + 随机(-1 到 1)
```

`place_flags` 按策略插拔旗（`army` 为本方在该格的人数，`enemy` 为敌方合计）：

| 策略 | 规则（源码事实） | 性格读法（分析） |
| --- | --- | --- |
| `aggr_greedy` | 先拔光所有旗；`v = value × (2 × enemy - army) × sqrt(army)`，凡 `v > 5000` 处插旗 | 到处进攻，四面出击 |
| `one_greedy` | 先拔光；`v = value × (5 × enemy - army) × sqrt(army)`，只在最大且 `v > 5000` 的一格插旗 | 集中一点，孤注一掷 |
| `persistent_greedy` | 不拔光；`v1 = value × (2.5 × enemy - army) × army^0.7`，`v2 = value × (MAX_POP - (enemy - army)) × army^0.7 × 0.5`（仅当 `enemy > army`），`v = max(v1, v2)`；已有旗且 `v < 1000` 才拔，没旗且 `v > 9000` 才插 | 有滞回，稳，不冒进 |
| `opportunist` | 先拔光；凡 `enemy > army` 且 `value × (MAX_POP - (enemy - army)) × sqrt(army) > 7000` 处插旗 | 哪里吃紧就去哪里增援 |
| `noble` | 同 `opportunist` 的条件与公式，但只取得分最高的 5 格 | 有限兵力，守最值钱的点 |
| `midas` | 不插旗，只让建城收益乘上 `(value + 10)` | 重经济 |
| `none` | 不插旗 | 只建城 |

`state_init` 按玩家位次分配：1 号 `opportunist`、2 号 `one_greedy`、3 号 `none`、4 号 `aggr_greedy`、5 号 `noble`、6 号 `persistent_greedy`。

`builder_default`（所有国王共用的建城规则）：

```
对每个本方格：ok = 该格与它所有可居住邻格都归本方（后方安全格）
  base = 草地 1、村 8、镇 32（midas 再 × (value + 10)）
  v = ok × base × (MAX_POP - army)；若 army < MAX_POP / 10 则 v = 0
取 v 最大的格 build；建成返回 0，促使所有国王重评估
```

即"在人多但未满的后方安全格优先升级镇"，城市越高级增长越快。

#### 3.4.6 节拍、联机与随机

- `main.c` 用 `setitimer` 每 10 毫秒唤醒；`game_slowdown` 给出每多少次唤醒跑一步：最慢 160、较慢 80、慢 40、**正常 20（即每 200 毫秒一步，5 Hz）**、快 10、较快 5、最快 2。每步先 `kings_move` 再 `simulate`。
- 联机是服务器权威的状态广播：服务器每步 `simulate` 后用 UDP 把整张图（每格旗帜位图、所有者、所有者人口、地形、各玩家金币、时间）发给客户端；客户端只发建造与插拔旗命令。
- 随机全部用 C 标准库 `rand()`（`rnd_round`、扫描方向、邻格起点、按概率拔旗、难度噪声），种子来自时间；地图另有 `map_seed`。不可跨平台回放。

### 3.5 对《箱庭纪》的借鉴（分析）

**它在三层模型里的位置**：Curse of War 是一个可视化的 C 层。本作第 2.3 节已定"远方 AI 对 AI 冲突用战役方程、第五幕战线回合用 act5 的战线方程"，
两者都是标量方程。Curse of War 给出另一种选择：把一条战线建成十几到几十个节点的小图（据点、隘口、村镇、补给点），兵力在节点间流动，
玩家与将领只给"旗帜"，结算每回合跑几步。它更直观（玩家能在地图上看到战线推移），也天然能把"授权书"表达成数据。

可直接借的方法：
1. **授权书 = 旗帜集合 + 规则**：`FrontCharter.objectives` 是玩家插下的旗（守点、推进方向、预备队集结点），`retreatAllowed` 决定兵力能否离开受威胁节点，
   `counterattackAllowed` 决定将领能否在玩家旗帜之外自行插旗。自治度低时将领只保留玩家的旗（第 7.3 节"只会照搬玩家留下的指令"），
   自治度高时将领每回合按自己的策略公式增删旗帜（"按自己的判断打"）。
2. **将领性格 = 策略公式 + 阈值**：`persistent_greedy` 的滞回（大于 9000 插、小于 1000 拔）就是"稳而不冒进"的罗恩；`one_greedy` 是"要么大胜要么溃败"的萨莎；
   `noble` 的"只守最值钱的 5 处"适合死守的马库斯；`opportunist` 的"哪里吃紧去哪里"适合机动的希雅。公式里的系数（2、2.5、5）与阈值（5000、7000、9000）就是性格参数。
3. **势场流动代替逐兵寻路**：旗帜在可通行节点上按步减半扩散，兵力沿势差流动，这是一张廉价的流场（第 5.4 节"多个兵团去同一目标用流场"在 C 层的版本）。
4. **"占地才有补给与增援"**：城市增长与矿收入都要占地，前线推移直接改变双方的补充速度，形成战线的惯性；本作的补给系数（act5 的门路覆盖、门券流通）可以落在节点归属上。
5. **待令与急令**：第 7.3 节的"待令"（本回合只守不攻）在这里就是"本回合不新插旗、不拔旗"；"急令"就是玩家越过授权临时插一面带 `force` 的旗。

要改造的点：
- **消耗公式要由内核标定**：Curse of War 的同格消耗是"一换一、胜者保留人数差"（线性律），而本作兵团的远程齐射与侧背系数会产生非线性的伤亡比。
  按第 2.5 节与 RTS-6，节点消耗应改用"双方 C 层战力 × 由基准战斗集拟合的系数"，并钉住回归测试，不要直接用 `A × B / (A + B)`。
- **时间尺度**：原作每步增长 10% 到 30%、迁移 5% 是街机节奏（5 Hz）；本作战线回合是战役级时间，增长应改成补给与援军，迁移率按回合长度换算。
- **确定性**：`rand()` 与随机扫描方向要换成本作按系统命名的随机流；迁移的扫描顺序可以按回合奇偶交替，或由随机流决定，但必须可回放。
- **规模**：原作每步对每面旗重新扩散、对全图做多遍扫描；本作节点少（几十个）不成问题，但应只在旗帜变化时重算势场。

不要学的坑：
- **难度靠暗中加金币**（hard 每步 +1、hardest +2）：直接违反 D-013"难度不靠隐藏加数值"，本作只调策略深度与失误率（第 9.1 节）。
- **AI 每步拔光重插旗**（除 `persistent_greedy` 外）：会造成战线来回抖动；本作将领的旗帜变更要有最短间隔与滞回。
- **只有一种兵**：本作节点内要按兵种汇总战力与克制，至少区分近战、远程、骑兵三类，否则克制在 C 层消失，与 A、B 层脱节。

### 3.6 许可与复用边界

- GPL-3.0-or-later：只借方法，本文的规则伪代码为转述；常量（`FLAG_POWER = 8`、`MOVE = 0.05`、`CALL_MOVE = 0.10`、增长率、价格、策略阈值）作为事实引用。
- 不使用其贴图与界面文字。

---

## 4. Warzone 2100

### 4.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-166` |
| 仓库 | `https://github.com/Warzone2100/warzone2100` |
| 固定提交 | `45c6d832a1e95c1e10471ac7b10c1a31cf4c5945`，2026-11-14 |
| 代码许可 | `README-LICENSING.md`：整体按 GPL-3.0-or-later 分发；原始发行版的源码与数据为 GPL-2.0-or-later，未另注明许可的文件按 GPL-2.0-or-later 处理；文件头引用附加条款的适用 GPLv3+ 加 `COPYING.SECTION7`（署名、不得冒充官方、修改版须标识）。`src/wzapi.cpp` 文件头为 GPL v2 or later；AI 脚本与 stats JSON 无许可头，按兜底规则为 GPL-2.0-or-later（推断） |
| 素材许可 | `COPYING.NONGPL` 逐项列出非 GPL 文件（部分背景图 CC BY-SA 3.0 或 CC0 等）；其余随 GPL |
| 语言与规模 | C++ 引擎 + JavaScript（QuickJS）AI 与规则脚本 + JSON 数据表 |
| 本地镜像 | `D:\hakoniwa_refs\warzone2100`（约 18 MB） |
| 已检出目录 | `data/base/script`、`data/mp/multiplay/script`、`data/mp/stats`、`doc`；`src/*.cpp`、`data/mp/multiplay/skirmish/*` 用 `git show` 读取 |
| 分级 | 选读 |

### 4.2 值得看的理由

- 它的 AI 是"事件回调 + 命名定时器 + 只下命令"的 JS 脚本，结构与本作第 7.1 节"战术执行规则 AI"一致，也是"大模型出意图、内核出动作"中规则层骨架的参考。
- "底盘 + 推进 + 武器"的组件合成与"效果类型 × 推进类型"的修正表，是本作兵种"定位 × 品质 × 变体"（第 3.1 节）与伤害对护甲表（第 3.2 节）的另一种数据组织方式。

### 4.3 源码导读

| 想弄懂 | 读这些 | 机制 |
| --- | --- | --- |
| AI 接口 | `src/wzapi.h` 的 `wzapi::scripting_event_handling_interface`（`handle_eventStartLevel`、`eventDroidBuilt`、`eventAttacked`、`eventDestroyed`、`eventObjectSeen` 等）、`enumDroid`、`enumRange`、`orderDroidLoc`、`buildDroid`、`syncRandom`；`src/qtscript.cpp` 的 `scripting_engine::updateScripts`；`src/quickjs_backend.cpp` 的 `js_setTimer`、`js_queue` | 引擎把事件推给脚本；脚本用命名定时器做周期工作，通过下命令影响世界 |
| AI 样本 | `data/mp/multiplay/skirmish/Cobra.js` 与 `cobra_includes/events.js`、`tactics.js`；`nb_generic.js` 与 `nb_includes/adapt.js`（`adaptVote`） | 分组、局部兵力比撤退、克制投票 |
| 研究效果 | `data/mp/stats/research.json` 的 `requiredResearch`、`researchPoints`、`results`（`class`、`parameter`、`value`、`filterParameter`、`filterValue`）；`src/research.cpp` 的 `eventResearchedHandleUpgrades` | 效果是"相对基础值的百分比"，按玩家累计 |
| 单位合成 | `data/mp/stats/templates.json`、`body.json`、`propulsion.json`、`propulsiontype.json`、`weapons.json`；`src/droid.cpp` 的 `calcDroidWeight`、`calcTemplateBody`、`calcDroidBaseSpeed`、`calcDroidSpeed`、`calcTemplatePower` | 推进的重量、造价、生命按"底盘的百分比"计 |
| 伤害 | `src/projectile.cpp` 的 `calcDamage`；`src/combat.cpp` 的 `objDamage`、`combFire`；`data/mp/stats/weaponmodifier.json`、`structuremodifier.json` | 效果 × 推进类型、效果 × 底盘尺寸、效果 × 建筑强度三张百分比表 |

### 4.4 机制拆解

**AI 运行方式**：
- 只有主机运行 AI 脚本（`scripting_instance::isHostAI()` 要求 `NetPlay.isHost && myResponsibility(player)`），AI 通过 `orderDroidLoc` 等下命令，命令再经网络队列同步执行。
  修改权威状态的接口标 `WZAPI_AI_UNSAFE`；`syncRandom(limit)` 直接调用同步随机 `gameRand`，注释警告只在一个客户端调用会破坏同步。
- 定时器：`setTimer("函数名", 毫秒[, 对象])` 周期执行，绑定对象死亡后自动停止；`queue` 一次性执行。`updateScripts` 每帧把到期的定时器放进运行表，源码注释写着"TODO - load balancing"，
  错峰靠脚本自己：Cobra 给每个定时器加 `me × 100` 毫秒偏移，NullBot 加随机抖动。
- Cobra 的周期任务（`eventStartLevel` 中设定）：建造 300、生产 400、撤退战术 500、修理检查 600、研究 800、找油 1000、炮兵 1400、空军 1600、地面战术 2000（毫秒，各加 `me × 100`）。
- Cobra 的撤退（`eventAttacked`）：在受攻击单位周围 `retreatScanRange` 内统计友军与敌军，友军少于敌军且离基地至少 20 格就撤回基地并加入撤退组；`retreatTactics` 周期复查，敌军不再占优就归队。
- NullBot 的克制投票（`adaptVote`）：`rating[i] = 敌方[i] / 敌方总数 - 我方[i] / 我方总数`，取最大者作为下一批要造的类型；统计用 `MAX_PER_CYCLE = 20` 分摊到多个周期。

**单位合成**（`src/droid.cpp`）：

```
重量 = Σ组件 weight + 底盘.weight × (100 + 推进.weight) / 100
生命 = (Σ组件 hitpoints + 底盘.hp × (100 + 推进.hitpointPctOfBody) / 100 + 推进.hitpoints) × (100 + Σ(hitpointPct - 100)) / 100，至少 1
基础速度 = 推进类型.powerRatioMult × 底盘功率 / max(1, 重量)；升力推进对重型底盘 /4、中型 ×3/4；底盘功率大于重量时 ×3/2
地形速度 = 基础速度 × 地形对推进类型的速度系数 / 100，不超过推进最大速度，再 × (100 + 5 × 经验等级) / 100
造价、建造点 = Σ组件 + 底盘.X × (100 + 推进.X) / 100
```

**伤害**：

```
calcDamage(基础伤害, 效果类型, 目标):
  打建筑：基础 × structuremodifier[效果][建筑强度] / 100
  打单位：基础 × (weaponmodifier[效果][推进类型] + weaponModifierBody[效果][底盘尺寸] - 100) / 100（两项修正各自减 100 后相加）
  至少 1
objDamage: 实际 = 伤害 × (100 - 6 × 经验等级) / 100        // EXP_REDUCE_DAMAGE = 6
           实际 = max(实际 - 护甲, 实际 × minimumDamage / 100)  // 动能武器用 armourKinetic，热能用 armourHeat
           实际 = max(实际, MIN_WEAPON_DAMAGE)
命中 combFire: 按距离取 shortHit 或 longHit；攻方每级 +5%、守方每级 -5%（EXP_ACCURACY_BONUS）；gameRand(100) <= 命中率
```

`weaponmodifier.json` 示例：`ANTI TANK` 对履带 120、轮式 130、半履带 125、气垫 90、腿式 30；`structuremodifier.json` 中 `BUNKER BUSTER` 对 `BUNKER` 400。

**研究效果**：`results` 每条形如 `{class: "Body", filterParameter: "BodyClass", filterValue: "Cyborgs", parameter: "Thermal", value: 45}`，`value` 是"基础值的百分比"，
只作用于基础值大于 0 的属性；兼容模式逐次 `当前 + ceil(基础 × value / 100)`，改进模式按（组件, 参数）累计百分比之和再算一次以减少取整误差；升级值按玩家存放在 `upgrade[player]`。

### 4.5 对《箱庭纪》的借鉴（分析）

- **AI 调度骨架**：将领 AI 的周期任务（索敌、撤退复查、方案评估）写成"命名定时器 + 错峰偏移"，事件（被攻击、兵团溃退、将领阵亡）直接回调；这比我们 `kernel.ts` 每 10 步统一跑 `runTeamAi` 更细粒度，也更省。
- **局部兵力比撤退**：Cobra 的"受攻击时统计周围敌我"是兵团级"该不该退"的最小实现；本作可用兵团周围的 C 层战力比替代单位数比。
- **克制投票**：`adaptVote` 适合将领在战前部署或援军选择时按敌方构成挑兵种，作为 Utility 兜底的一项。
- **百分比修正 + 整数取整 + 累计法**：本作若要整数化兵团数值，可借"按基础值百分比、累计后一次取整"的做法避免误差积累。
- **不要学**：伤害修正表的两个维度（推进、底盘尺寸）相加再减 100 的写法不直观；本作已有"伤害类型 × 护甲类型"一张表，够用。

### 4.6 许可与复用边界

GPL-2.0-or-later 与 GPL-3.0-or-later 混合：只借方法，不拷贝 JS AI 与 JSON 数据；公式与常量作为事实引用。

---

## 5. Spring/Recoil 引擎、Zero-K、Beyond All Reason

### 5.1 信息表

| 项 | Recoil 引擎 | Zero-K | Beyond All Reason |
| --- | --- | --- | --- |
| 索引条目 | `#library-057`（索引写 `https://github.com/spring/spring`） | `#native-168` | `#native-128` |
| 实际仓库 | `https://github.com/beyond-all-reason/RecoilEngine`（Spring 的活跃分支；原 `spring/spring` 最后提交 2024-03-31，未归档但已停滞） | `https://github.com/ZeroK-RTS/Zero-K` | `https://github.com/beyond-all-reason/Beyond-All-Reason`（未克隆） |
| 固定提交 | `084d53c4e8f387a1daf2ca567dacb650b5f71e72`，2026-11-14 | `867dfb017438ac25068202251e53a73825d513d1`，2026-11-15 | 查询时 HEAD 为 `8ff9f0aa51edc93878bca7274317a1b9cb9cd019`（2026-11-15，经 GitHub API，未克隆） |
| 代码许可 | `LICENSE`：GPL-2.0-or-later（第三方小库另有 BSD 等） | 根目录 `LICENSE` 为 GPL v2 全文；`legal.txt` 写明除另有说明外为 GPL（v2 or later）或公有领域；gadget 文件头 `GNU GPL, v2 or later` | `LICENSE.md`：游戏代码 GPL v2 |
| 素材许可 | 引擎不含游戏素材 | 混合：`MIT.txt` 只适用少数文件，另有 Artistic License 2.0、Free Art License 1.3、Engines of War 模型的署名授权等，逐项待核实 | 多数模型、贴图、动画为 CC-BY-NC-ND 4.0（不允许衍生），部分 CC-BY-SA 4.0 |
| 语言 | C++ | Lua（引擎玩法层脚本） | Lua |
| 本地镜像与检出 | `D:\hakoniwa_refs\recoil`：`rts/Sim/Path/QTPFS`、`rts/Sim/Path/HAPFS`、`rts/Sim/MoveTypes` | `D:\hakoniwa_refs\zero_k`：`LuaRules/Gadgets/CAI`；其余 gadget 与 widget 用 `git show` 读取 | 无 |
| 分级 | 选读 | 选读 | 略读（引擎层由 Recoil 覆盖，玩法层不在本文范围） |

### 5.2 值得看的理由

- Recoil 的 QTPFS 是"按地形代价均匀性剖分的四叉树寻路 + 同目标路径共享 + 脏块增量重建"，直接回答第 5.4 节"多个兵团去同一目标"与"地形变化（破桥、火烧森林、攻城开缺口）后路径怎么办"。
- Zero-K 的战术 AI 与撤退命令是"按兵种查表"的微操层，可借给第 6.4 节撤退与第 7.1 节战术执行；它的内置 AI 有简单可靠的战斗组骨架。

### 5.3 源码导读与机制拆解：Recoil 的 QTPFS（`rts/Sim/Path/QTPFS/`）

- **按移动类型分层**：每种移动定义（`MoveDef`）一个 `NodeLayer`。根节点尺寸取同时整除地图宽高的最大 2 的幂，从 32（`QTPFS_BAD_ROOT_NODE_SIZE`）起，上限 `QTPFS_MAX_NODE_SIZE = 64`。
- **代价分档**（`NodeLayer.cpp` `Update`、`GetSpeedModBin`）：每格速度系数先夹在最小与最大值之间并归一化，再分到 `numSpeedModBins` 个档；低于最小视为封闭档，高于最大另一档。
- **节点分裂**（`Node.cpp` `QTNode::UpdateMoveCost`、`Tesselate`、`Split`）：统计节点内与首格不同档的格数和封闭格数；节点代价为平均速度系数的倒数，部分封闭时为 `QTPFS_CLOSED_NODE_COST (2^24) × 封闭格数 / 面积`；
  "有不同档且边长大于 16"时想分裂，"部分封闭或边长大于 `QTPFS_MAP_DAMAGE_SIZE` (16)"时必须分裂，递归分成四个子节点。结果是开阔地少量大节点、复杂地形细碎小节点。
- **搜索**（`PathSearch.cpp`）：在叶节点上做双向 A*，节点之间经边上的过渡点相连，`g = 前驱 g + 当前节点代价 × 距离`；源码注释承认平均代价节点上启发式不能保证可采纳，路径"近似最优"，事后平滑一次。
- **路径共享**（`PathManager::AddToPathShares`、`SharedPathChain`）：每个请求按（起点所在 16 格粗块, 目标节点, 层）算哈希，单位不超过 `QTPFS_SHARE_PATH_MAX_SIZE` (16) 才参与；
  另有按 32 格粗块的"部分共享"哈希。同哈希的后来者挂到先来者的链上：先来者已算完就直接复制路径，未算完就等待，部分共享时以先来者的路径为种子再搜，有防死锁的强制完整搜索标志。
- **增量更新**：地形变化时按移动定义的足迹外扩，把受影响的 16 × 16 块标脏并入队；每帧每层只处理有限个脏块（上限 16 块，按队列长度与 `pfUpdateRateScale` 缩放），
  重新分档、对包含该区域的 2 的幂节点先合并再重剖；`PathCache::MarkDeadPaths` 用包围盒加节点号掩码找出受影响的路径，标脏后重寻或局部修复。
- **并行与确定性**：`PathManager::Update` 先等后台搜索完成，再统一落地结果、删除死路径、重排请求；普通搜索在路径副本上后台计算，源码注释说"在合适的同步安全时刻移回"。
- **避障与推挤**（`rts/Sim/MoveTypes/GroundMoveType.cpp` 的 `GetObstacleAvoidanceDir`、`HandleUnitCollisions`）：避障每若干帧按 `(帧号 + 单位号)` 错峰运行，只看前方 120 度内、比目标近的移动障碍；
  每个障碍按夹角与距离衰减给出侧向推力，按质量比加权，结果与期望方向各半混合，再与上一帧方向按 0.7 平滑。碰撞推挤按"质量 × 速度 × 侧面系数"决定谁被推开，侧面受撞更易被推。

### 5.4 源码导读与机制拆解：Zero-K 的微操与 AI（`LuaRules/Gadgets/`）

- **战术 AI**（`unit_tactical_ai.lua`，配置 `LuaRules/Configs/tactical_ai_defs.lua`）：每种单位一张行为表，列出对哪些敌人"风筝"（`skirms`）、"骚扰绕圈"（`swarms`）、"逃离"（`flees`）、"贴身"（`hugs`）。
  默认参数从武器射程推导（`searchRange = max(射程 + 100, 800)`、`idleCommitDist = min(500, 射程 × 0.3 + 150)` 等）。每帧只处理列表中每隔 `UPDATE_RATE = 20` 个的一批单位，轮转。
  决策优先级：空闲逃离、骚扰、风筝、全逃离、玩家手动攻击不覆盖、普通逃离。风筝距离 = 按高差修正的有效射程 - 余量（装填未完成时再加），用预测敌人位置的投影距离判断要不要后退，
  后退命令以"内部命令"插到队首，不覆盖玩家命令。
- **撤退命令**（`cmd_retreat.lua`）：三档阈值 `thresholdMap = {0.3, 0.65, 0.99}`（生命比例），撤退点由玩家设置（半径 `RADIUS = 160`）；每 20 帧检查一次；
  **滞回**：低于阈值触发撤退，直到满血才解除；撤退时清掉战术 AI 插入的命令，插入"移动到撤退点内随机点 + 等待"，并设单位参数 `retreat = 1`，内置 AI 据此把撤退中的单位排除出战斗组。
- **直线移动与目标点扩散**（`cmd_raw_move.lua`）：直线畅通（按 16 单位间隔采样）就不调寻路；同一目标点的单位共享一个停止半径，每到达一个就扩大，防止全挤到一个点；位移过小视为卡住，随机挪一步。
- **内置 AI**（`ai_CAI.lua`）：按 512 单位网格维护敌方"进攻、防御、经济"三张造价热图，2000 帧未侦察的进攻条目移除；空闲兵力的造价与比例达到阈值就组建战斗组
  （例如 combat：空闲造价大于 400 且空闲比例大于 0.9，或造价大于 2000 且比例大于 0.4，或造价大于 4000）；目标格要求敌方进攻值 × 2 小于本组造价且防御值小于本组造价；
  战斗组每 40 帧算质心与包围盒，包围盒超过 `450 + 30n` 就先向质心集结并剔除偏离过远的掉队者；被打时向半径 1200 内的空闲单位与低优先级战斗组求援（冷却 150 帧）。
  子目录 `CAI/` 只服务于未启用的 `ai_CAI2.lua`，是未完成的雏形。
- **玩家阵型绘制**（`LuaUI/Widgets/cmd_customformations2.lua`，界面端）：玩家拖出折线，等距插值成节点，单位不多时用匈牙利算法、多时用贪心加交换分配到节点；只产生普通命令，不影响同步。

### 5.5 对《箱庭纪》的借鉴（分析）

- **路径共享**是兵团寻路最便宜的提速：同一将领麾下多个兵团去同一集结点时，按（起点粗格, 目标格）哈希复用路径；先到者算完，后来者复制。
- **脏块增量重建**对应本作战场里可破坏地形（桥、城门、火烧森林、冰河可击破，见 `warfare_rts.md` 第 8 节霜脊堡之战）：只重建受影响区块并标记经过它的路径为脏。
- **"并行算、统一落地"**在单线程 TS 里也成立：本步收集寻路请求，下一步开头统一给结果，顺序按兵团 id 固定。
- **撤退滞回 + 标记位解耦**：兵团"有序撤退"（第 6.4 节）可设阈值（兵力或士气），触发后直到恢复到更高值才解除，撤退中的兵团带标记，AI 战斗组自动排除它。
- **停止半径扩散**：多个兵团到达同一目标时自动铺开，避免挤成一团，比我们 `kernel.ts` `separate` 的两两推开更便宜也更自然。
- **热图 + 空闲比例触发组建 + 质心包围盒集结**：可作为远方 AI 对 AI 冲突或 SLG 层 AI 的军队调度骨架。
- **不要学**：`ai_CAI.lua` 战斗组选目标时局部变量 `minTargetDistance` 初始化为 `false` 后在循环里从未赋值，"取最近"实际退化为"最后一个满足条件的格子胜出"，这类隐性缺陷说明规则 AI 也要有单元测试；Lua 的 `pairs` 遍历顺序在 TS 里要换成有序结构。

### 5.6 许可与复用边界

Recoil 与 Zero-K 代码均为 GPL-2.0-or-later：只借方法。BAR 素材多为 CC-BY-NC-ND 4.0，明确禁止衍生与在其他游戏中使用，本作不得使用。

---

## 6. openage

### 6.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-141` |
| 仓库 | `https://github.com/SFTtech/openage` |
| 固定提交 | `5f042b9ce84ed13f78473faebf4a8ed90a1da8cd`，2026-11-14 |
| 代码许可 | `copying.md`：GPL-3.0-or-later（`legal/GPLv3`）；少数构建模块 BSD-3-Clause，cabextract 相关 LGPL 2.0 |
| 素材许可 | 不含素材，README 写明需要原版《帝国时代》系列的素材 |
| 状态 | README 原话："At the moment, "gameplay" is basically non-functional."；本提交的系统只有空闲、移动命令、默认移动、活动推进，没有战斗系统 |
| 语言 | C++ 引擎 + Python 工具 + nyan 数据语言 |
| 本地镜像 | `D:\hakoniwa_refs\openage`（约 12 MB） |
| 已检出目录 | `doc`、`libopenage/curve`、`libopenage/event`、`libopenage/gamestate` |
| 分级 | 选读（只看设计，不看玩法） |

### 6.2 值得看的理由

它是唯一一个把"模拟状态 = 随时间变化的曲线、推进 = 事件驱动"做成引擎基础的开源 RTS，正好对应 RTS-1"兵团 5 Hz 与完整实体 20 Hz 混合是否引起手感问题"
以及第 2.4 节"手动与自动共用内核、自动快速运行"：如果状态是曲线，渲染可以在任意时刻采样，自动结算就是"把事件循环推进到终点"。

### 6.3 源码导读与机制拆解

- **时间**：`time::time_t` 是 16 位小数的 64 位定点数（秒）；`GameSimulation::run` 没有固定 tick，循环调用 `event_loop->reach_time(clock->get_time(), state)`；时钟按模拟速度累加真实时间，每次更新夹在 1 到 50 毫秒。
- **曲线**（`libopenage/curve/`，文档 `doc/code/curves.md`，灵感来自 Planetary Annihilation 的 Chrono Cam）：`KeyframeContainer<T>` 是按时间排序的（时刻, 值）数组，从缓存的提示位置线性查找，单调访问摊还 O(1)。
  `Discrete<T>` 取最近一个不晚于 t 的关键帧（阶梯函数）；`Interpolated<T>` 在相邻关键帧间线性插值（源码 TODO 承认插值走浮点）；`Continuous` 不允许跳变；`Segmented` 允许同一时刻两帧（用于角度回绕）；
  容器有 `Queue`、`UnorderedMap`、`Array`。所有修改函数（`set_insert`、`set_last` 会删除 t 之后的关键帧、`set_replace`、`erase`、`sync`）最后都调用 `changes(t)` 通知依赖者。
- **事件**（`libopenage/event/`，文档 `doc/code/event_system.md`）：处理器实现 `setup_event`（声明依赖哪些曲线）、`invoke`、`predict_invoke_time`（返回最小时刻表示作废）。
  触发类型：`DEPENDENCY`（依赖变化就重新预测时刻）、`DEPENDENCY_IMMEDIATELY`、`TRIGGER`、`REPEAT`、`ONCE`。`EventLoop::reach_time(t)` 反复"更新变化、执行到期事件"直到稳定，超过 10 轮抛出"事件无法收敛"。
  同一时刻的事件只按时间比较，没有次序键（推断：依赖插入顺序）。
- **预测而非步进的示例**（`event/demo/physics.cpp`，乒乓球）：碰墙事件依赖球的位置与速度曲线，`predict_invoke_time` 用几何直接算出下次碰墙时刻；触发时翻转速度，并把"下一次碰墙时的位置"作为关键帧写进未来。球从不逐步移动，渲染按任意帧率采样 `get(t)`。
- **移动系统**（`gamestate/system/move.cpp`）：一次移动命令把整条路径按"转向时间 + 行进时间"一次性写成未来的位置与角度关键帧，然后活动图等待一个"到达时刻"的事件。
- **活动图**（`doc/code/game_simulation/activity.md`、`gamestate/system/activity.cpp`）：每种实体共用一张类 BPMN 的图，节点有开始、结束、系统任务、自定义任务、条件分支、事件分支；
  `Activity::advance` 从当前节点一路走到需要等待事件的节点，为等待挂上"等待时长"或"命令队列变化"事件；命令入队会触发 `changes`，实体在命令到达的那一刻被唤醒。
- **nyan 数据**（`doc/nyan/openage-lib.md`、`reference_modifier.md`、`reference_effect.md`、`reference_util.md`）：游戏实体由一组"能力"数据定义；修正项（`Multiplier`、带作用范围的 `Scoped`、带上限的 `Stacked`）
  用于百分比加成，文档说明它们"难以用补丁表达"；科技只是一组有序补丁，作用于每个玩家的"数据库视图"，开局设置与模组也以补丁形式应用。

### 6.4 对《箱庭纪》的借鉴（分析）

- **对 RTS-1 的回答**：openage 证明了"模拟不按固定步长、渲染随时采样"的可行性，但它的玩法至今不可用，完整采用的工程风险很高。折中做法：内核仍按 0.2 秒步进（与 0 A.D. 相同），
  但兵团位置、人数、士气在每步写成"本步起点值 + 本步终点值"两帧，渲染与 20 Hz 的完整实体在两帧之间插值。这就是 openage 的 `Interpolated` 曲线只保留两帧的特例，也就是 0 A.D. 的位置插值。
- **"等待到某时刻"的事件唤醒**：兵团在行军或待命时不需要每步都跑 AI，可以像活动图那样挂一个"到达时刻"或"命令变化"事件；这对自动结算加速有用（大量兵团同时待命时可跳过）。
- **同时刻事件必须有次序键**：openage 没有，本作要用（时刻, 序号）排序，否则回放不确定。
- **补丁式科技与按玩家的数据视图**：属于 SLG 层科技，提一句：本作的研究与政策若要修改兵种数值，可用"有序补丁 + 修正项"两分法（绝对替换走补丁，百分比走修正项），与 0 A.D. 的修正项管线互补。

### 6.5 许可与复用边界

GPL-3.0-or-later：只借设计思想；文档的算法描述已用自己的话转述。

---

## 7. Command & Conquer HTML5 与 Last Colony

### 7.1 信息表

| 项 | Command & Conquer HTML5 | Last Colony |
| --- | --- | --- |
| 索引条目 | `#web-081` | `#native-137` |
| 仓库 | `https://github.com/adityaravishankar/command-and-conquer` | `https://github.com/adityaravishankar/last-colony` |
| 固定提交 | `44eb28bcd48df3a6560398b91d4cb6572c351712`，2013-06-20 | `0800823502bf3f0606c1f67dd8a5dbebac895e41`，2013-06-16 |
| 代码许可 | **仓库内没有许可文件**；README 称其为"technical proof of concept"、"No commercial use is intended"，并说明新版"is NOT open source"。按默认版权法即保留所有权利（推断） | **仓库内没有许可文件**，README 也无许可声明；代码出自作者的书《Pro HTML5 Games》 |
| 素材许可 | README："All images and sounds used are from C&C - Tiberian Dawn and are property of the original game creators"，属原作版权方 | README 致谢 Daniel Cook 的 Hard Vacuum 美术、OpenGameArt 头像、Freesound 音效（各自许可待核实） |
| 第三方代码 | 内嵌 A* 文件头写"@author Andrea Giammarchi @license Mit Style License" | 同一份 A*（`js/astar.js`） |
| 语言与规模 | 纯 JavaScript + Canvas，主体是单文件 `js/cnc.js` 加 jQuery | 纯 JavaScript + Canvas；`js/server.js` 是 Node 的 WebSocket 服务器 |
| 本地镜像与检出 | `D:\hakoniwa_refs\cnc_html5`：`js` | `D:\hakoniwa_refs\last_colony`：`js` |
| 分级 | 选读 | 选读 |

### 7.2 值得看的理由

两者是与本作技术栈（TypeScript、浏览器）最接近的完整 RTS，适合看"最小可用架构"与"哪些做法不能规模化"。Last Colony 的锁步联机与渲染插值对 RTS-1 和将来的联机有直接参考价值。

### 7.3 源码导读与机制拆解：C&C HTML5（`js/cnc.js`）

- **主循环**：`setInterval(game.animate, 50)`（20 Hz），同一回调里先 `moveObjects`（处理订单、移动）再绘制，逻辑与渲染不分离、无插值。武器装填用 `setTimeout`（真实时间），伤害带 `Math.random`，不可回放。
- **寻路**：`findPath` 在"玩家认知中的地图"（迷雾格视为可通行）或真实阻挡网格上调用 A*，再用视线检查（每 0.4 格采样）删去中间路点。A* 的开放表线性扫描，节点首次发现即关闭、不再松弛（推断：路径不保证最优）。
  阻挡网格每帧在绘制时重建；**每个移动单位每帧重新寻路**，碰撞检测对所有单位与所有阻挡格逐一测试。
- **迷雾**：离屏画布填黑，为己方单位按视野半径挖圆（`destination-out`），从不重新填黑（推断：永久揭开）；`fog.isOver` 用 `getImageData` 读像素，即游戏逻辑读画布像素。
- **订单**：`processOrders` 按订单类型（采集、返回、让路、移动、巡逻、攻击、建造、警戒）产生"转向、移动、瞄准、开火"指令；采集车满 14 个单位返回精炼厂；警戒与巡逻发现视野 +2 内的敌人就切换攻击并记下 `lastOrders` 以便恢复。
- **AI**：只有一个空壳对象；关卡脚本事件声明了但未被调用（推断）。

### 7.4 源码导读与机制拆解：Last Colony 的锁步（`js/server.js`、`js/multiplayer.js`、`js/game.js`）

```
服务器（每 100 毫秒）：
  若两名玩家的 lastTickConfirmed 都 >= currentTick：
    广播 {type: "game_tick", tick: currentTick + roomTickLag, commands}；currentTick++；清空命令
  否则：等待落后的玩家（房间整体停顿）
  收到命令：commands.push({uids, details})；lastTickConfirmed[玩家] = 客户端 currentTick + 该玩家 tickLag
  延迟测量：三次 ping，tickLag = round(平均延迟 × 2 / 100) + 1；roomTickLag = 两人 tickLag 的最大值
客户端 tickLoop（每 100 毫秒）：
  若 currentTick <= lastReceivedTick：执行 commands[currentTick]，再跑一次逻辑 animationLoop
  本 tick 没发过命令就发一个空命令（心跳）；currentTick++
  否则停住等待
```

- 服务器只做转发与栅栏，不做权威模拟；开局出生点由服务器随机后下发。未见状态哈希或失同步检测（推断）。客户端模拟里没有 `Math.random`，单位 id 来自自增计数；浮点三角函数跨浏览器是否一致没有保证（推断）。
- 源码缺陷：延迟"平均"的循环每次累加的都是最近一次往返的一半，实际只是最近一次的单程延迟（`js/server.js` 中 `averageLatency` 的累加循环）。
- **逻辑与渲染分离**（`js/game.js`）：逻辑 `animationLoop` 10 Hz；绘制用 `requestAnimationFrame`，插值系数 `drawingInterpolationFactor = (lastDrawTime - lastAnimationTime) / animationTimeout - 1`，夹在 -1 到 0，
  单位画在 `x + 上一步位移 × 系数` 处，即画面滞后一步、从上一位置插值到当前位置。
- 迷雾每个逻辑 tick 重算、只给本地队伍用、只影响输入检查（鼠标与侧栏），不进模拟，所以不破坏锁步。
- 移动：每个逻辑 tick 深拷贝通行网格跑一次 A*；避障把附近格子与载具分为"硬碰撞"和"软碰撞"加权成推力，再加上指向下一路径格的吸引力，求合力方向。

### 7.5 对《箱庭纪》的借鉴（分析）

- **可借**：Last Colony 的"命令排到 当前 tick + 延迟、空命令心跳、栅栏等待"是锁步的最小实现；"渲染滞后一步并插值"是 RTS-1 的最小解（兵团 5 Hz 逻辑、渲染插值，就不会有一顿一顿的感觉）。
  C&C 的"玩家认知地图与真实地图分开"可用于本作的战前情报（第 6.1 节：玩家按已知敌情规划，内核按真实地形结算）。
- **不要学**：每单位每帧寻路、全量碰撞、逻辑读画布像素、`setTimeout` 装填、战斗里用 `Math.random`、靠真实时间的关卡触发器。其中逐帧寻路、`Math.random`、真实时间触发器本作 `kernel.ts` 已避开，保持即可；但同队推开 `separate` 与接触扫描 `resolveContacts` 仍是全量两两比较。

### 7.6 许可与复用边界

两个仓库都没有许可文件，代码不得复用，只能作为阅读参考；C&C 的素材属原作版权方，绝对不用。内嵌的 Giammarchi A* 是 MIT 风格许可，但本作已有自己的 A*，不需要。

---

## 8. Dune Legacy

### 8.1 信息表

| 项 | 内容 |
| --- | --- |
| 索引条目 | `#native-171`，索引地址 `https://github.com/DuneLegacy/dunelegacy` |
| 实际来源 | 索引地址不存在（GitHub 返回 Repository not found）；官方仓库在 SourceForge：`https://git.code.sf.net/p/dunelegacy/code` |
| 固定提交 | `591b9e16f6f91c5fe3ab0bd3bfb38809e29ab8e6`，2026-09-12 |
| 代码许可 | `COPYING` 为 GPL-2.0 全文；源文件头写"either version 2 of the License, or (at your option) any later version"，即 GPL-2.0-or-later |
| 素材许可 | 运行需要原版《沙丘 2》的 PAK 数据文件（README 列出 HARK、ATRE、ORDOS、DUNE、SCENARIO 等），仓库只附带自制的 LEGACY.PAK |
| 语言 | C++ |
| 本地镜像与检出 | `D:\hakoniwa_refs\dunelegacy`：`src/players`、`include/players`、`src/units`、`include/units`（SourceForge 服务器不支持部分克隆过滤，实际为浅克隆） |
| 分级 | 选读（只看 AI 与采集循环） |

### 8.2 值得看的理由

QuantBot 是一个"用军力价值做预算"的规则 AI，所有旋钮都在配置表里，难度纯靠配置；它对应本作第 7.1 节规则 AI 与第 9.1 节"难度只调策略，不调数值"。

### 8.3 源码导读与机制拆解（路径相对仓库根，`src/players/QuantBot.cpp`、`src/players/QuantBotConfig.cpp`、`src/units/Harvester.cpp`、`SoftwareDesign.txt`）

- **确定性约定**（`SoftwareDesign.txt`）：游戏逻辑与输入、渲染严格分离，不用浮点而用定点数 `FixPoint`；输入只往 `CommandManager` 加命令，联机时排到 N 个周期之后；AI 直接调用 `do*` 逻辑方法，在每个对等端的确定性模拟里运行（推断自大量"MULTIPLAYER FIX"注释）。默认每周期 16 毫秒。
- **AI 调度**：`AIUPDATEINTERVAL 50`；`QuantBot::update` 以 `(周期数 + 家族号) % 50 != 0` 跳过，按家族号错峰；建造与进攻计时器每次减 50。
- **军力价值预算**：开局把初始军力价值（Σ数量 × 价格，排除采集车、运输机等）乘以 `militaryValueMultiplier` 作为上限 `militaryValueLimit`（自定义模式按地图大小查表）；
  采集车上限随剩余香料下降：`min(基数, max(1, 剩余香料 / 2000))`。
- **兵种构成**：每种单位的"伤害损失比" `dlr = 造成伤害 / ((1 + 损失数) × 价格)` 动态调整构成；单一兵种不超过 80%；规则是"军力价值 × 该兵种比例大于该兵种现有价值就造"。
- **进攻**：`attackTimer` 到期且 `军力价值 >= militaryValueLimit × attackThresholdPercent` 时，把合格单位（非采集、非运输、未重伤、未在撤退或追猎）依次设为追猎，
  直到"已派出价值 + 单价"超过 `militaryValueLimit × attackForceMilitaryValueRatio`，即每波进攻是一个价值预算。
- **集结与防守**：集结点 = 0.75 × 己方建筑质心 + 0.25 × 敌方建筑质心，集结半径 `round(sqrt(军事单位数)) + 1`；建筑被打就修理并调 `structureDefenders` 个单位防守，装货的采集车被打就调 `harvesterDefenders` 个并让它返回；
  远程单位在目标进入 5 格内时拉开距离（`kiteAwayFromThreat`）。
- **按难度的配置**（`QuantBotConfig.cpp` 默认值）：

  | 参数 | 防守 | 简单 | 中等 | 困难 | 残酷 |
  | --- | --- | --- | --- | --- | --- |
  | `attackEnabled` | 否 | 是 | 是 | 是 | 是 |
  | `attackThresholdPercent` | 0.90 | 0.50 | 0.40 | 0.30 | 0.30 |
  | `attackForceMilitaryValueRatio` | 0 | 0.25 | 0.40 | 0.50 | 0.60 |
  | `structureDefenders` | 5 | 10 | 15 | 25 | 25 |
  | `harvesterDefenders` | 3 | 5 | 10 | 15 | 25 |

  配置有 `getConfigHash()` 供联机一致性检查；从配置读入的浮点阈值先量化成两位小数的定点数。
- **采集循环**（`src/units/Harvester.cpp`）：满载 `HARVESTERMAXSPICE 700`，每周期采 `HARVESTSPEED 0.1344`；载货越多越慢，`速度 × (1 - 0.4 × 载货 / 700)`；
  返回时选预约最少的精炼厂，距离 6 格以上请求运输机；精炼厂卸货速度随其生命下降。按常量推算（每周期 16 毫秒），装满约 700 / 0.1344 ≈ 5208 周期（约 83 秒），满血精炼厂卸货约 700 / 0.625 = 1120 周期（约 18 秒）。

### 8.4 对《箱庭纪》的借鉴（分析）

- **"价值预算"决定波次规模**：将领的"正面推进""中央突破"可以按"本方 C 层战力 × 投入比例"决定首波兵团数，剩余作预备队，比例按难度与性格取值；这比我们 `ai.ts` 现在的做法更像将领（进攻类方案下所有兵团都被派去攻击，不留预备队；坚守、保护方案则全体驻守，只对进入反应距离的敌人出击）。
- **伤害损失比自适应**：战后报告（第 9.2 节学习层）可直接用 `dlr` 告诉玩家哪个兵种划算，AI 也可据此调整下次部署。
- **难度全在配置表**，与本作第 9.1 节一致；配置哈希可用于回放校验（同一回放必须用同一份将领配置）。
- **AI 错峰 `(周期 + id) % N`**：与 0 A.D.、Recoil 的错峰同理，是低成本的通用做法。
- **不要学**：每周期全图扫描香料（放在错峰门之前，白白每周期执行）；单个 `build()` 函数过长。

### 8.5 许可与复用边界

GPL-2.0-or-later：只借方法；原作数据文件为商业版权，本作不涉及。

---

## 9. 跨项目结论：三层单位模型下 RTS 怎么做最合适（均为分析）

1. **节拍与手感（RTS-1）：保留 5 Hz 兵团步进，把功夫花在插值、错峰与即时回执上。** 0 A.D. 整个模拟就是 200 毫秒一回合，Curse of War 正常速度也是 5 Hz，Last Colony 逻辑只有 10 Hz，
   它们的手感靠的是渲染插值。建议：(a) 每个内核步把兵团锚点、人数、士气写成"起点值 + 终点值"两帧，渲染与 20 Hz 完整实体在两帧之间插值（openage 曲线的两帧特例）；
   (b) 兵团按 `id % 4` 分摊到 4 个引擎 tick 结算，削峰并让画面上的伤亡飘字错开（设计第 2.2 节已写，`kernel.ts` 尚未做）；
   (c) 英雄对兵团的伤害在 20 Hz 下立即计入 `dmgAcc` 并给出命中反馈，倒下人数与士气在兵团自己的结算步统一出（单次击倒上限照旧）；
   (d) 玩家命令在下一个引擎 tick 就画出路线与目标线（回执），执行在下一个内核步（不超过 200 毫秒，等同 0 A.D. 单机 `COMMAND_DELAY_SP = 1`）。
2. **兵团永远是结算单位，阵型是"控制器 + 槽位"的画面与几何。** 借 0 A.D. `Formation` 的控制器实体、按类别就近取槽、最慢成员定速、小转向不重排；但不学它接敌即散成个体。
   正面宽度取第一行槽位数，接触槽位与侧背判定改用"正面 × 纵深"的矩形，而不是现在的圆（`regimentRadius`）。英雄的光环可以按 0 A.D. 的 `formation` 光环类型作用于所在兵团。
3. **一条修正项管线 + 条件 + 状态叠加规则，所有加成带来源。** 数值以路径取值、先乘后加、`replace` 优先（0 A.D.）；兵团状态授予条件，修正项声明所需条件（OpenRA）；
   控制效果按"忽略、延长、替换、叠层"规则叠加（0 A.D. `StatusEffectsReceiver`）；光环按 id 去重、合成后再按第 2.5 节封顶；老兵等级是"等级 → 修正项"的数据表。
   每条修正带来源 id，既满足 D-013"禁止暗改结算、加护带来源"，也能直接生成战斗日志的因果句。
4. **命令执行用订单队列（或 Activity 栈）+ 姿态表 + 强制令，授权书就是姿态与旗帜。** 兵团命令从单字段扩成可排队、可取消、可组合的结构（0 A.D. 订单队列、OpenRA Activity）；
   自主度用姿态开关表达（可追击、可追出视野、坚守点、撤退阈值），玩家亲令与急令带 `force`；`FrontCharter` 的目标与预备队可以表达成旗帜集合（Curse of War）。
   "交给将领"或"玩家接管"只换控制者与命令，不碰兵团状态，满足第 2.4 节"切换不重置任何状态"。
5. **AI 将领分三级，每级都有成熟样板。** 方案级：大模型或 Utility 从菜单选方案，方案实例化成 Petra 式计划对象（兵种需求、生命周期、开打与中止条件），按 Dune Legacy 的"价值预算"决定首波与预备队；
   小队级：OpenRA 式状态机（待命、攻击移动、交战、撤退），带凝聚度检查、2.5 秒超时回退、四输入攻逃判定（己方兵力或士气、敌方同、相对战力、相对速度）；
   兵团级：Zero-K 式按兵种查表的风筝、逃离、撤退滞回，Petra 式"同一目标盯防上限"。三级都低频错峰运行（`(step + id) % N`），难度与性格只改配置与阈值，不改战斗数值。
6. **寻路与空间查询按战场规模取最小组合。** 战场几十格见方、设计暂定每方 32 个兵团上限（待基准测试，代码尚未校验）：二叉堆 A* + 区块连通区域判可达与修正目标（0 A.D. `MakeGoalReachable`）+ 同目标路径共享（Recoil）+
   请求本步收集下步落地；兵团到达同一目标用"停止半径扩散"铺开（Zero-K），替代全量两两推开；索敌用固定网格分桶 + 主动查询差分（0 A.D.），迷雾用每格计数 + 已探索位（0 A.D.、OpenRA）。
   可破坏地形（破桥、城门缺口、冰河）用脏块增量重建（Recoil）。大地图 `world/grid.ts` 先把开放表换成堆，再考虑 OpenRA 式抽象图启发式。
7. **C 层与玩家不在场的战线：标量方程定胜负，节点流动做过程与可视化。** act5 的战线方程是正典（优先级高于本文），守住、僵持、失守、溃败的判定以它为准。
   Curse of War 提供了可视化的补充：每条战线是一张小节点图，兵力按旗帜势场流动、按节点消耗，`held_unaided` 之外玩家还能看到战线如何推移；旗帜集合即授权书，将领性格即插旗公式与阈值（罗恩是滞回的 `persistent_greedy`）。
   节点内的消耗必须按第 2.5 节用内核基准战斗集标定（Curse of War 的"一换一"线性律只是起点），并与方程结果对拍，纳入 RTS-6 的容差测试。
8. **确定性要能"指出哪一个字段先分歧"。** 战斗内每 N 步对白名单字段（人数、伤害余量、坐标、士气、随机流状态）做哈希，记入战报；保留最近若干步的逐字段值（OpenRA `SyncReport` 保留 7 帧），
   回放比对失败时转储；快哈希只含随机流与位置、全量哈希低频执行（0 A.D. 每 20 回合）。同时刻事件用（时刻, 序号）排序（openage 缺这一点）；将领配置算哈希写进战报（Dune Legacy `getConfigHash`）；
   大模型方案与玩家命令一样按步号进入命令流，回放不调用模型（OpenRA Bot 命令进回放的同构做法）。
9. **可读性与学习层可以直接从 AI 的判定里取材。** 用伤害速率 + 警觉度滞回判定"会战/平静"（0 A.D. `BattleDetection`），切换音乐、提示与日志段落；把攻逃判定的输入与结论写进日志
   （"第三兵团撤退：相对战力弱 + 速度不占优"）；战后报告给出各兵种伤害损失比（Dune Legacy `dlr`）。不要学 Curse of War 难度暗加金币的做法。
10. **规模基准（RTS-5）要按"每步预算"设计。** 样板都给每类计算设了上限：0 A.D. 同回合最多算 `m_MaxSameTurnMoves` 条路径，Petra 抵达后每次只重分配约 10 个单位，Zero-K 战术 AI 每帧只处理二十分之一的单位，
    Recoil 每帧每层最多重建 16 个脏块。本作基准测试应分别测"兵团数、完整实体数、精灵数"三条曲线之外，再给寻路请求、AI 重分配、视野更新各设一个每步上限，超出的排到下一步。

---

## 10. 未能获取或略过

| 项目 | 索引锚点 | 处理 | 理由 |
| --- | --- | --- | --- |
| Dune Legacy 的 GitHub 地址 | `#native-171` | 改从 SourceForge 获取 | `https://github.com/DuneLegacy/dunelegacy` 返回 Repository not found；官方仓库为 `https://git.code.sf.net/p/dunelegacy/code`，已克隆并核实 |
| Beyond All Reason | `#native-128` | 未克隆，只查许可 | 运行在 Recoil 上，引擎层已覆盖；玩法为 Lua 脚本，素材多为 CC-BY-NC-ND 4.0 不可衍生 |
| Wargus（Stratagus） | `#native-165` | 略过 | 《魔兽争霸 II》数据的重实现，需要原作数据；单位与 AI 机制被 0 A.D.、OpenRA 覆盖 |
| MegaGlest | `#native-138` | 略过 | 3D RTS，机制（单位、技能树、AI）被 0 A.D. 覆盖，无本作特需的亮点 |
| OpenE2140 | `#native-143` | 略过 | OpenRA 引擎上的模组，机制见 OpenRA |
| OpenKrush | `#native-145` | 略过 | OpenRA 引擎上的模组 |
| OpenSA | `#native-147` | 略过 | OpenRA 引擎上的模组 |
| Romanov's Vengeance | `#native-157` | 略过 | OpenRA 模组 |
| Shattered Paradise | `#native-159` | 略过 | OpenRA 模组（SDK） |
| Pax Britannica | `#native-150` | 略过 | 单键操作的小型海战 RTS，没有兵团、阵型或将领可借 |
| Pikifen | `#native-152` | 略过 | 类《皮克敏》的队伍动作游戏，非兵团战术 |
| OpenFodder | `#native-144` | 略过 | 《Cannon Fodder》重制，小队动作射击，非 RTS 兵团 |
| Colobot | `#native-130` | 略过 | 编程控制机器人的教育游戏，与战术 RTS 无关 |
| Hedgewars | `#native-134` | 略过 | 回合制炮击（类《百战天虫》），非即时战术 |
| OpenRTS | `#library-043` | 略过（只查元数据） | Java 7 的 3D RTS 引擎，GitHub 显示 MIT 许可；机制被本文必读项目覆盖 |
| Brood War API（BWAPI） | `#tool-002` | 略过（只查元数据） | 《星际争霸：母巢之战》的 bot 接口框架，GitHub 显示 LGPL-3.0；需要商业游戏本体。其 bot 研究生态（学术赛事中的微操与建造顺序搜索）对将来研究"规则 AI 的微操上限"有参考价值，本轮不展开 |
