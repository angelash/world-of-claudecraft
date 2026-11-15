# world-of-claudecraft 战斗与内容体系盘点及复用评估

## 文档信息

| 项       | 内容                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 用途     | 为《箱庭纪》（Hakoniwa）"基本复用 world-of-claudecraft 的技能、职业、天赋、怪物等战斗体系和游戏完整度"提供事实清单与复用评估 |
| 性质     | 调研归档（`docs/10_research/`），只记录事实、分析与可借鉴点，不做最终决定                                                    |
| 核对基线 | 主工程 `main` 分支，提交 `cd961d3210`，核对日期 2026-11-14                                                                   |
| 数量口径 | 文中"当前约 N 个"均为本次 grep 统计的近似值，一律以源码为准                                                                  |
| 引用规则 | 只写稳定路径与导出符号，不写行号                                                                                             |
| 下文简称 | WoC = world-of-claudecraft；sim = `src/sim/` 确定性内核                                                                      |

主要依据：根目录 `CLAUDE.md`、`src/sim/CLAUDE.md`、`src/sim/content/CLAUDE.md`、`docs/design/current-game-design.zh_CN.md`、`docs/design/class-design-rules.md`、`docs/design/spell-balance-framework.md`、`docs/design/spell-ranks.md`、`docs/design/master-spec.md`、`docs/design/warfare.md`、`docs/design/professions.md`、`docs/design/deeds.md`，以及 `src/sim/` 与 `src/sim/content/` 源码本身。文档与源码冲突处已在附录 A 列出，本文以源码为准。

---

## 0. 摘要

- WoC 的 sim 是一个零外部依赖的纯 TypeScript 确定性内核（20 Hz 固定步长、单一 `Rng` 种子流），可以整体拷贝到新工程运行，无需 Three.js、DOM 或 npm 包。
- 战斗几乎全部在 XZ 平面上计算（距离、朝向弧、背刺、锥形、地面 AoE、弹道、空间网格、A*、视线），Y 轴只服务于玩家跳跃、重力、游泳、攀爬，因此 2D 化的工作量集中在地形与移动层，战斗与内容层基本不动。
- 九职业、约 298 个技能定义、约 85 种技能效果、约 110 余种光环类型、三专精加六行天赋、约 118 个怪物模板、约 70 个怪物机制字段、约 96 个任务、约 615 个手写物品、约 219 条功绩，构成一套完整度很高的经典 MMO 战斗与内容框架。
- 现行天赋系统已不是"点数树"，而是"专精（签名技能 + 精通）+ 6 行三选一"，所有效果在分配时一次性展开为扁平的 `TalentModifiers`，这个"效果载荷 + 扁平预计算"层非常适合承载《箱庭纪》的"千门回廊"。
- 最大的结构性差异有四个：WoC 等级上限 20（世界观要求 60）、主角在世界观中"无职能且可跨职能习得"（WoC 每个角色绑定一个职业和一种资源）、单机化（WoC 大量系统为在线多人设计）、RTS 规模（WoC 的单位模型是重型 MMO 实体）。

---

## 1. sim 架构概览

### 1.1 一核三宿主与确定性

| 要点       | 事实                                                                                               | 关键符号与位置                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 一核三宿主 | 同一份 `src/sim/` 同时跑离线浏览器世界、权威服务器、无头强化学习环境                               | `src/sim/sim.ts` 的 `Sim`；`server/game.ts`；`headless/env_server.ts`                 |
| 固定步长   | 20 Hz，`DT = 1/20`，没有可变 delta                                                                 | `TICK_RATE`、`DT`（`src/sim/types.ts`）                                               |
| 随机数     | 唯一来源是 `Rng`（mulberry32），一条共享流供所有抽取点使用；地形噪声用无状态的 `hash2/noise2/fbm2` | `src/sim/rng.ts`                                                                      |
| 禁用 API   | sim 逻辑禁止 `Math.random`、`Date.now`、`performance.now`，也禁止 DOM 与 Three.js 导入             | 由 `tests/architecture.test.ts` 机械校验                                              |
| 顺序敏感   | tick 阶段顺序、实体遍历顺序、可能抽 rng 的提前返回都会改变全局抽取顺序；营地 `CAMPS` 只能追加      | `tests/parity`（金样轨迹 + rng 抽取顺序日志，当前约 56 条轨迹）                       |
| 时钟       | 用 sim 内的 `time`/`tickCount`，不用墙钟                                                           | `Sim.tick()` 推进                                                                     |
| 输出       | 统一为 `SimEvent` 联合类型；带 `pid` 的是个人事件，不带的是世界可见事件                            | `SimEvent`（`src/sim/types.ts`），`tick()` 返回事件数组                               |
| 文本       | sim 只发英文字符串，客户端用匹配器本地化                                                           | `src/ui/sim_i18n.ts`（`localizeSimText`），S3 守卫 `tests/localization_fixes.test.ts` |

### 1.2 协调器加 SimContext 接缝

- `sim.ts` 是"薄协调器"：持有世界时钟、tick 阶段顺序、每玩家与每实体循环、共享入口、`IWorld` 门面、持久化（`serializeCharacter`/`addPlayer`），以及构建接缝的 `buildSimContext()`。
- 各系统模块只持有**函数**，不持有状态；状态（实体表、空间网格、延迟事件、地面 AoE、竞技场/决斗/交易/地窟/市场/拾取集合、宠物暂存）都留在 `Sim` 上，通过 `SimContext` 以**实时视图**暴露。
- `SimContext` = `SimContextPrimitives`（`rng`、`time`、`entities`、`players`、网格等实时 getter）+ `SimContextCallbacks`（跨系统回调），定义在 `src/sim/sim_context.ts`，只追加不改名。
- 共享入口永不归属单一模块：`mobSwing`、`updateRangedPetAttack`、`pulseGroundAoE`、`applyTaunt`、`meleeSwing`、`moveToward`/`fleeMoveSpeed`。
- 新机制的标准落点：新状态加到 `Entity` 或 `PlayerMeta`，新行为加到对应模块或新建模块，新随机走 `ctx.rng`，新输出走 `ctx.emit`。

### 1.3 主要系统模块

| 领域         | 模块（`src/sim/` 下）                                                                                                                                                                                      | 职责                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 伤害与死亡   | `combat/damage.ts`                                                                                                                                                                                         | `dealDamage`、`handleDeath`、`grantXp`                                           |
| 治疗         | `combat/heal.ts`                                                                                                                                                                                           | `applyHeal`、治疗仇恨、受疗倍率、治疗吸收                                        |
| 光环与控制   | `combat/auras.ts`、`combat/cc.ts`                                                                                                                                                                          | 每 tick 光环、回复、计时器；控制判定（昏迷、定身、沉默、缴械、锁定、致盲、言语） |
| 施法生命周期 | `combat/casting_lifecycle.ts`                                                                                                                                                                              | `castAbility`、`updateCasting`、`cancelCast`、`pushbackCast`、GCD、消耗、冷却    |
| 效果分发     | `combat/effect_dispatch.ts`                                                                                                                                                                                | `runEffects`（逐效果 switch）                                                    |
| 自动攻击     | `combat/auto_attack.ts`                                                                                                                                                                                    | 近战与远程自动攻击、`meleeSwing`、`rangedSwing`、命中表                          |
| 触发器       | `combat/talent_procs.ts`、`combat/set_procs.ts`、`combat/equip_procs.ts`                                                                                                                                   | 天赋触发、套装触发、传说武器触发                                                 |
| 职业专属     | `combat/warrior_stances.ts`、`combat/fire_mage.ts`、`combat/frost_mage.ts`、`combat/chronomancy.ts`、`combat/forms.ts`、`combat/heroic_leap.ts`、`combat/hunter_trap.ts` 等                                | 姿态、形态、法师专精状态、跳跃落地等                                             |
| 纯函数叶子   | `threat.ts`、`spatial.ts`、`spell_scaling.ts`、`stun_dr.ts`、`item_level.ts`、`item_budget.ts`、`equipment_rules.ts`、`aura_classify.ts`、`combat/spell_resist.ts` 等                                      | 无 `SimContext` 依赖，可单独测试                                                 |
| 弹道         | `projectile_travel.ts`                                                                                                                                                                                     | 追踪弹道（速度 26 码/秒）                                                        |
| 成长         | `progression/xp.ts`、`progression/talents.ts`                                                                                                                                                              | 休息经验、威望、天赋分配与重算                                                   |
| 怪物         | `mob/targeting.ts`、`mob/combat_profile.ts`、`mob/locomotion.ts`、`mob/mob_swing.ts`、`mob/lifecycle.ts`、`mob/social_aggro.ts`、`mob/yells.ts`、`mob/charge.ts`、`mob/healer_channel.ts`                  | 索敌、战斗档案、移动与拴绳、命中词缀、刷新、社交仇恨、喊话                       |
| 首领脚本     | `encounters/nythraxis.ts`、`world_boss.ts`                                                                                                                                                                 | 团本首领全流程脚本；每小时世界首领                                               |
| 死亡与复活   | `spirit.ts`、`resurrection.ts`                                                                                                                                                                             | 灵魂跑尸、墓地、复活虚弱                                                         |
| 宠物         | `pet/pet_ai.ts`、`pet/pet_commands.ts`                                                                                                                                                                     | 宠物 AI、指令、召唤、驯服、存档                                                  |
| 物品与交互   | `items.ts`、`interaction.ts`、`bags.ts`、`bank.ts`                                                                                                                                                         | 装备、使用、商人、拾取、背包、银行                                               |
| 任务         | `quests/quest_credit.ts`、`quests/quest_commands.ts`                                                                                                                                                       | 击杀与收集计数、接受/放弃/交付                                                   |
| 副本         | `instances/dungeons.ts`、`instances/difficulty.ts`、`instances/heroic_vendor.ts`                                                                                                                           | 入口、实例槽、团本锁定、英雄难度                                                 |
| 地窟         | `delves/runs.ts`、`delves/companion.ts`、`delves/lockpick_controller.ts`、`delves/drowned_litany_*.ts`                                                                                                     | 地窟流程、同伴 AI、开锁小游戏、脚本首领                                          |
| 社交与 PvP   | `social/party.ts`、`social/duel.ts`、`social/arena.ts`、`social/fiesta.ts`、`social/vale_cup.ts`、`social/yumi.ts`、`social/card_duel.ts`、`social/trade.ts`、`social/chat.ts`、`social/dungeon_finder.ts` | 队伍、决斗、竞技场、各类小游戏与匹配                                             |
| 经济         | `market.ts`、`mail/post_office.ts`、`loot/loot_roll.ts`、`loot/loot_ffa.ts`                                                                                                                                | 世界市场、邮件、掷骰拾取                                                         |
| 功绩         | `deeds.ts`                                                                                                                                                                                                 | 成就评估器 `updateDeeds`                                                         |
| 专业         | `professions/`（自带 `CLAUDE.md`）                                                                                                                                                                         | 采集、钓鱼、制作、附魔、分解、专精组合                                           |
| PvP 数值     | `pvp/`（`honor.ts`、`power.ts`）                                                                                                                                                                           | 荣誉货币、PvP 战斗评级                                                           |
| 强化学习     | `obs.ts`                                                                                                                                                                                                   | `ACTIONS`、`applyAction`、`encodeObs`、`obsSize`                                 |

### 1.4 IWorld 接缝

- `IWorld` 是渲染与 UI 访问世界的**唯一**接口，按领域拆成 `src/world_api/<domain>.ts` 的 facet，由 `src/world_api.ts` 汇总。离线 `Sim` 结构性满足它，在线 `ClientWorld`（`src/net/online.ts`）通过镜像服务器快照实现它，成员清单被 `tests/world_api_parity.test.ts` 钉住。
- 当前 facet 文件约 29 个：action_bar、bank、card_minigame、chat、combat、cosmetics、daily_rewards、deeds、delves、duel_arena、dungeon_finder、dungeons、entity_roster、interaction、inventory、loot、mail、market、party、pet、professions、progression_xp、quests、social_graph、talents、targeting、telemetry、trade、vale_cup。
- 对《箱庭纪》的意义：新的 2D 像素渲染器与 UI 应照搬"只通过 IWorld 读世界、只通过命令改世界"的边界；具体 facet 需按单机与新系统重新裁剪。

### 1.5 规模指标

| 指标                                     | 数值（近似，以源码为准）                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `src/sim/` 总量                          | 约 285 个 `.ts` 文件，约 11.9 万行                                            |
| 其中 `content/` 数据                     | 约 3.5 万行                                                                   |
| `combat/`                                | 约 1.1 万行                                                                   |
| `social/`                                | 约 1.0 万行                                                                   |
| `sim.ts` 协调器                          | 约 1.0 万行                                                                   |
| `types.ts`（类型 + 全局常量 + 经典公式） | 约 5400 行；其中 `Entity` 接口约 450 行字段                                   |
| 测试                                     | `tests/` 下约 1700 个测试文件，其中约 880 个引用 `src/sim/`，约 56 条金样轨迹 |

### 1.6 sim 对 3D 的依赖程度

坐标系：`Vec3 {x, y, z}`，Y 轴向上，地面是 XZ 平面；`Entity.facing` 为弧度，0 指向 +Z。

| 方面           | 现状                                                                                                                           | 是否已是 2D | 2D 化所需改动                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| 距离与射程     | `dist2d` 只算 XZ（约 160 处调用）；无 3D 距离辅助函数                                                                          | 是          | 无                                                                                                                    |
| 朝向与背刺     | `angleTo`（`atan2(dx, dz)`）、`MELEE_ARC`（半弧 2.2 弧度）、`requiresBehind`                                                   | 是          | 俯视操作需由宿主设置 `facing`（移动方向或鼠标方向），或在施法时自动面向目标                                           |
| 锥形与正面 AoE | `combat/glacial_front.ts` 的 `glacialFrontContains`、`MELEE_ARC`、`combat/warrior_hit_table.ts` 的正面判定                     | 是          | 无                                                                                                                    |
| 地面 AoE       | `GroundAoE` 用 XZ 半径，经空间网格查询                                                                                         | 是          | 无                                                                                                                    |
| 弹道           | `projectile_travel.ts` 在 XZ 追踪目标，飞行中不撞墙，只在发射时检查视线                                                        | 是          | 无                                                                                                                    |
| 空间网格       | `spatial.ts` 的 `SpatialGrid` 以 x、z 分桶，查询返回 XZ 平方距离                                                               | 是          | 无                                                                                                                    |
| 视线           | `colliders.ts` 的 `lineOfSightClear` 沿 XZ 线段每 0.5 码采样碰撞体足迹；高度只用于跳过矮物件；地形起伏从不挡视线               | 基本是      | 若改用瓦片地图，只替换这一个函数（所有调用经 `Sim.hasLineOfSight`/`lineOfSightBlocked`）                              |
| 碰撞体         | `Collider` = 圆形或 OBB 的 XZ 足迹，另有 `moveTopY`、`standable` 等高度字段用于跳上道具                                        | 足迹是      | 去掉高度字段；或换成瓦片碰撞（重实现 `resolvePosition`、`resolveMovement`、`isBlocked`、`lineOfSightClear` 等窄接口） |
| 寻路           | `pathfind.ts` 的 `findPath`：1 码网格 A*、八邻接、坡度检查；只有冲锋与宠物跟随使用；怪物不寻路，用 `moveToward` 直线加扇形绕障 | 是          | 适配瓦片地图；RTS 规模需要另行设计群体寻路                                                                            |
| 地形高度       | `world.ts` 的 `groundHeight`/`terrainHeight` 被约 19 个文件调用，主要用于出生、传送、怪物贴地                                  | 否          | 返回常数即可（建议用开关而非删除）                                                                                    |
| 世界边界       | 世界边缘与区域间山脊**不是碰撞体**，而是陡坡（坡度门槛 `MAX_CLIMB_SLOPE`）                                                     | 否          | 压平地形后必须改用显式阻挡墙（`WorldContent.blockers` 已存在）                                                        |
| 水体           | `WATER_LEVEL`、`waterLevelAt`、`isSwimming`；钓鱼、怪物岸边停步、冲锋/击退的深水门槛都依赖它                                   | 否          | 改成"水体瓦片"判定，或把湖泊做成不可通行区域                                                                          |
| 玩家垂直运动   | `player_motion.ts`：重力、跳跃、坠落伤害、游泳、陡坡滑落、土狼时间；`climb.ts` 与 `physics/ledge.ts` 攀爬                      | 否          | 关闭跳跃输入，去掉可站立道具，垂直分支自然失效；或让开放世界也走平地分支 `stepInstancedRegion`                        |
| 体素地形       | `voxel.ts`、`voxel_mesh.ts`、`content/tunnels.ts`                                                                              | 不参与玩法  | 可直接舍弃                                                                                                            |
| 副本内部       | 副本、竞技场、地窟、迷宫放在同一平面远处的 x 带上（如副本 `instanceOrigin` 从 x=900 起），地板平坦，墙体是纯数字布局           | 是          | 可光栅化为瓦片地图                                                                                                    |
| 强化学习观测   | `encodeObs` 是以自我为中心的极坐标编码，不含 y；只有 `jump` 动作是 3D 专属                                                     | 是          | 去掉 `jump` 动作                                                                                                      |

结论：战斗、内容、AI、观测层天然是 2D 的；需要改的是"地形高度、水、边界、玩家垂直运动、碰撞表示"这五处，且都集中在少数几个文件（`world.ts`、`player_motion.ts`、`physics/`、`climb.ts`、`colliders.ts`、`pathfind.ts`）。

### 1.7 2D 化改造清单（按成本从低到高）

| 序号 | 改动         | 涉及位置                                                       | 说明                                                                    |
| ---- | ------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1    | 地形压平     | `world.ts` 的 `groundHeight`/`terrainHeight`                   | 加"平面世界"开关，返回常数；坡度相关门槛随之失效                        |
| 2    | 补墙         | `WorldContent.blockers` 或瓦片墙                               | 替代原先由陡坡提供的边界与区域隔断                                      |
| 3    | 水体         | `waterLevelAt`、`isSwimming`、`professions/fishing.ts`         | 改为水体瓦片谓词                                                        |
| 4    | 关闭垂直运动 | `player_motion.ts`、`climb.ts`、`physics/ledge.ts`             | 输入不再产生跳跃；移除 `moveTopY`/`standable`                           |
| 5    | 舍弃体素     | `voxel.ts`、`voxel_mesh.ts`、`content/tunnels.ts`              | 玩法不依赖                                                              |
| 6    | 朝向与操作   | 宿主输入层；必要时在 `player_motion.ts` 增加"方向向量输入"模式 | WoC 默认是坦克式操作（前进、转向、平移），施法要求面向目标              |
| 7    | 碰撞表示     | `colliders.ts`、`physics/`                                     | 方案 A：保留圆形/OBB 连续碰撞（俯视像素风下可直接用）；方案 B：瓦片碰撞 |
| 8    | 视线         | `lineOfSightClear`                                             | 瓦片地图上换成 DDA 或 Bresenham 遍历                                    |
| 9    | 线上格式     | 实体快照                                                       | 保持 `pos.y = 0` 即可让快照与轨迹结构不变                               |

### 1.8 单机化现状

- WoC 自带离线宿主：浏览器内直接运行完整 `Sim`，不需要服务器。
- 工作区里另有未提交的单文件离线版（`src/standalone/`、`scripts/standalone/`），它用 sim 自己的存档格式（`serializeCharacter` 与 `addPlayer({ state })`）把角色存进 `localStorage`，说明"单机存档"路径已被验证过一次。
- 无头环境 `headless/env_server.ts` 用 NDJSON 驱动一个 `Sim`，`step(action)` 后跑若干 tick，奖励来自 `sim.counters`，Python 端是 `python/wow_env.py`，可用于训练 NPC 或英雄 AI、做平衡回归。
- 在线专属、单机无意义或需改造的系统：世界市场、邮件、交易、公会与好友、竞技场 Elo、地下城查找器、Fiesta、Vale Cup、Protect Yumi、Card Duel、监狱与审核、Discord 相关、持有者外观等。

### 1.9 世界内容替换点

- `src/sim/data.ts` 的 `setActiveWorldContent(world)` 可以整体换掉 `WorldContent`（区域、营地、NPC、地面物件、道路、道具、玩家出生点、服务点、地形编辑、放置物、阻挡墙、生物群系涂色、水位）。编辑器的离线试玩就是这样做的，配套的可序列化地图文档在 `src/sim/map_doc.ts`。
- 但怪物模板 `MOBS`、任务 `QUESTS`、物品 `ITEMS`、技能 `ABILITIES` 仍是 `data.ts` 合并出的静态全局表，换世界观时需要换数据模块本身，而不是只换 `WorldContent`。

---

## 2. 职业

### 2.1 通用规则

| 规则         | 事实                                                                                                                                  | 位置                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 资源类型     | 只有 `rage`、`mana`、`energy` 三种；另有绑定角色（非目标）的连击点 `Entity.comboPoints`；没有符文、集中值、灵魂碎片                   | `ResourceType`、`ClassDef.resourceType`                 |
| 形态换资源   | 德鲁伊熊形态切到怒气，猫形态（显示名 Wolf Form）切到能量，法力暂存后恢复                                                              | `recalcPlayerStats`（`src/sim/entity.ts`）              |
| 公共冷却     | `GCD = 1.5` 秒，盗贼 1.0 秒；法术急速可缩短，下限 `MIN_GCD = 0.75`                                                                    | `Sim.playerGcdFor`                                      |
| 护甲         | 最高到锁甲，没有板甲：战士、圣骑士、萨满穿锁甲；德鲁伊、盗贼、猎人穿皮甲；法师、牧师、术士穿布甲                                      | `src/sim/equipment_rules.ts`                            |
| 武器组       | 战士组、施法者组、盗贼组三类；盗贼双持单手；狂怒战士可双持双手（泰坦之握式惩罚）；施法者自带职业魔杖，猎人自带最小射程 8 码的自动射击 | `equipment_rules.ts`、`ClassDef.ranged`                 |
| 专精解锁     | 5 级（`SPEC_UNLOCK_LEVEL`），选专精即授予签名技能，授予绕过学习等级                                                                   | `src/sim/content/talents.ts`                            |
| 精通         | 每个专精一项，强度按 `min(1, level/20)` 随等级增长                                                                                    | `computeTalentModifiers`                                |
| 专精基线     | 圣骑士、猎人、盗贼、牧师、萨满、术士、德鲁伊有一层专精被动底座；战士、法师刻意排除                                                    | `src/sim/content/spec_baselines.ts` 的 `SPEC_BASELINES` |
| 专精限定技能 | 只有战士与法师的技能使用 `specs: [...]` 做专精门控；其余七职业三专精共享一套基础技能，只有签名技能不同                                | `AbilityDef.specs`                                      |
| 宠物职业     | 猎人、术士、法师（`isPetClass`）                                                                                                      | `src/sim/types.ts`                                      |

### 2.2 九职业总表

职能名取自《箱庭纪》`docs/20_world/world_bible.md` 第 10.2 节；技能数含基础套件、签名技能与天赋行授予技能，当前约数，以源码为准。

| 职业 id   | 职能名             | 资源                                                                   | 护甲      | 专精（定位）                                                                    | 核心技能族                                                                                                                                                                                                 | 宠物                                               | 技能数 |
| --------- | ------------------ | ---------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------ |
| `warrior` | 战士               | 怒气（上限 100），无第二资源，靠激怒、猝死、压制等触发光环             | 锁甲 + 盾 | Battlecraft（输出）、Bloodrush（输出）、Ironguard（坦克）                       | 构建/消耗（Overpower、Slam、Execute、Revenge 等）、流血、AoE（Thunder Clap、Whirlwind、Cleave）、冲锋昏迷、断筋减速、群体恐惧、防御技（含消耗怒气转吸收）、单体与群体嘲讽、打断、战吼、三姿态、破甲        | 无                                                 | 约 51  |
| `paladin` | 圣骑士             | 法力                                                                   | 锁甲 + 盾 | Sacrament（治疗）、Vigil（坦克）、Requital（输出）                              | 圣印加审判循环、治疗（Holy Light、Flash of Light、Lay on Hands）、奉献地面 AoE、制裁之锤昏迷、嘲讽、打断、吸收与免死护盾、光环与祝福                                                                       | 无                                                 | 约 25  |
| `hunter`  | 猎人（游侠）       | 法力，自动射击 35 码（最小 8 码）                                      | 皮甲      | Packlord、Coldsight、Fieldcraft（均输出）                                       | 射击（Arcane Shot、Aimed Shot、Volley）、毒蛇钉刺 DoT、震荡射击减速、近战补位、反制射击打断、三种互斥守护                                                                                                  | 驯服野兽（不高于自身等级且非精英）、复活、治疗宠物 | 约 25  |
| `rogue`   | 盗贼（暗行者）     | 能量（上限 100）+ 连击点                                               | 皮甲      | Knifework、Thuggery、Skulduggery（均输出）                                      | 构建（Sinister Strike、Backstab、Ambush、Hemorrhage）、终结（Eviscerate、Rupture、Kidney Shot、Slice and Dice、Expose Armor）、潜行起手、控制（Gouge、Cheap Shot、Sap、Blind）、闪避与消失、脚踢打断、毒药 | 无                                                 | 约 30  |
| `priest`  | 牧师（神官）       | 法力                                                                   | 布甲      | Doctrine（治疗）、Benison（治疗）、Vespers（输出）                              | 惩击与暗影伤害、暗言术痛 DoT、精神鞭笞引导、单体治疗与恢复 HoT、真言术盾吸收、耐力祝福；基础套件无打断与控制（由天赋行补）                                                                                 | 无                                                 | 约 19  |
| `shaman`  | 萨满（灵语者）     | 法力                                                                   | 锁甲      | Thundercall（输出）、Warspirit（输出）、Spiritmend（治疗）                      | 闪电箭、治疗波、三种震击（含 DoT 与减速）、三种武器灌注、闪电盾（带充能的反伤）、幽魂之狼、地震 AoE；没有图腾                                                                                              | 无                                                 | 约 18  |
| `mage`    | 法师（魔导师）     | 法力，专精状态以光环承载（奥术充能、冰刺、炽热连击、寒冰指与冰冷智慧） | 布甲      | Chronomancy（**治疗**，id 仍为 `arcane`）、Pyromancy（输出）、Cryomancy（输出） | 火球、寒冰箭、闪现、寒冰屏障、法术反制、变形术、冰霜新星；火焰与冰霜各有完整专精套件；时间系为治疗专精（时光回溯、群体复活、群体急速等）                                                                   | 水元素（冰霜专精）                                 | 约 61  |
| `warlock` | 术士（契约者）     | 法力，生命分流把生命换成法力；没有灵魂碎片                             | 布甲      | Hexcraft、Pactbound、Ruination（均输出）                                        | 暗影箭、灼热之痛、暗影灼烧、三种 DoT、吸取生命引导、火焰之雨、恐惧、法术锁定打断、恶魔皮肤                                                                                                                 | 7 种恶魔（见 2.4）                                 | 约 27  |
| `druid`   | 德鲁伊（森之祭司） | 法力；熊形态怒气、猫形态能量；猫形态有连击点                           | 皮甲      | Moongrove（输出）、Wildfang（**坦克**，没有猫输出专精）、Groveheart（治疗）     | 愤怒、星火、月火、虫群、飓风；治疗之触、回春 HoT、愈合；熊形态（槌击、横扫、低吼嘲讽、猛击昏迷）；猫形态构建与终结、潜行；纠缠根须、休眠；树皮术                                                           | 无                                                 | 约 42  |

### 2.3 专精、签名技能与精通

| 职业   | 专精 id         | 显示名      | 定位 | 签名技能                          | 精通（摘要）                                |
| ------ | --------------- | ----------- | ---- | --------------------------------- | ------------------------------------------- |
| 战士   | `arms`          | Battlecraft | 输出 | `mortal_strike`（Maiming Strike） | 双手武器伤害 +10%                           |
| 战士   | `fury`          | Bloodrush   | 输出 | `bloodthirst`（Bloodletting）     | 暴击 +5%，攻强 +10                          |
| 战士   | `prot`          | Ironguard   | 坦克 | `shield_slam`（Shieldcrack）      | 仇恨 +30%，护甲 +10%，耐力 +40%，力量转护甲 |
| 圣骑士 | `holy`          | Sacrament   | 治疗 | `holy_shock`                      | 治疗暴击翻倍                                |
| 圣骑士 | `protection`    | Vigil       | 坦克 | `holy_shield`                     | 仇恨 +50%，护甲 +20%                        |
| 圣骑士 | `retribution`   | Requital    | 输出 | `crusader_strike`                 | 近战与法术伤害 +20%                         |
| 猎人   | `beast_mastery` | Packlord    | 输出 | `bestial_wrath`                   | 宠物伤害 +35%，生命 +8%                     |
| 猎人   | `marksmanship`  | Coldsight   | 输出 | `trueshot_aura`                   | Iron Aim                                    |
| 猎人   | `survival`      | Fieldcraft  | 输出 | `wyvern_sting`                    | 敏捷 +15%，闪避 +4%                         |
| 盗贼   | `assassination` | Knifework   | 输出 | `cold_blood`                      | Redhanded                                   |
| 盗贼   | `combat`        | Thuggery    | 输出 | `blade_flurry`                    | 急速 +10%，5% 额外攻击                      |
| 盗贼   | `subtlety`      | Skulduggery | 输出 | `hemorrhage`                      | False Face                                  |
| 牧师   | `discipline`    | Doctrine    | 治疗 | `power_infusion`                  | 吸收 +30%，生命 +8%                         |
| 牧师   | `holy`          | Benison     | 治疗 | `holy_nova`                       | 治疗 +20%                                   |
| 牧师   | `shadow`        | Vespers     | 输出 | `shadowform`                      | DoT +15%，法术伤害 +10%                     |
| 萨满   | `elemental`     | Thundercall | 输出 | `elemental_mastery`               | Earthen Fury                                |
| 萨满   | `enhancement`   | Warspirit   | 输出 | `stormstrike`                     | Skyrend                                     |
| 萨满   | `restoration`   | Spiritmend  | 治疗 | `chain_heal`                      | 治疗消耗 -20%                               |
| 法师   | `arcane`        | Chronomancy | 治疗 | `temporal_mend`                   | Chronoweave                                 |
| 法师   | `fire`          | Pyromancy   | 输出 | `pyroblast`                       | 暴击伤害的 40% 转为燃烧，暴击 +2%           |
| 法师   | `frost`         | Cryomancy   | 输出 | `ice_lance`                       | Brittlebreak                                |
| 术士   | `affliction`    | Hexcraft    | 输出 | `siphon_life`                     | DoT +20%                                    |
| 术士   | `demonology`    | Pactbound   | 输出 | `metamorphosis`                   | 20% 承伤转给恶魔，耐力 +10%                 |
| 术士   | `destruction`   | Ruination   | 输出 | `conflagrate`                     | 两种主力箭伤害 +20%                         |
| 德鲁伊 | `balance`       | Moongrove   | 输出 | `moonkin_form`                    | Moonrage                                    |
| 德鲁伊 | `feral`         | Wildfang    | 坦克 | `feral_charge`                    | Primal Heart                                |
| 德鲁伊 | `restoration`   | Groveheart  | 治疗 | `swiftmend`                       | HoT 治疗 +25%                               |

注：技能 id 沿用经典 MMO 的英文惯用名（如 `heroic_strike`、`mortal_strike`），显示名是 WoC 自创的换皮名（如 Reaver Strike、Maiming Strike）。

### 2.4 宠物与召唤

| 来源     | 机制                                                                                                                                                                                                                                      | 位置                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 猎人     | `tame_beast`（6 秒施法，`tamePet` 效果）、`dismiss_pet`、`revive_pet`；宠物有被动、防御、主动三种模式，会协助、跟随、过远时传送回主人、低吼控仇恨                                                                                         | `pet/pet_ai.ts`、`pet/pet_commands.ts`          |
| 术士     | `summonDemon` 效果，7 种恶魔：1 级 emberkin（远程火）、8 级 gloomshade（坦克）、12 级 duskborn（近战）、14 级 spellhound（反施法）、16 级 felguard 式 warfiend（重击）、18 级 pyre_colossus（180 秒冷却）、20 级 wraithborn（180 秒冷却） | `content/warlock_pets.ts` 的 `WARLOCK_PET_MOBS` |
| 法师     | 冰霜专精召唤水元素 `water_elemental`                                                                                                                                                                                                      | `content/mage_pets.ts` 的 `MAGE_PET_MOBS`       |
| 地窟同伴 | 地窟内的治疗型 AI 同伴，可升阶，3 阶每次运行可复活一次                                                                                                                                                                                    | `delves/companion.ts` 的 `updateDelveCompanion` |

宠物本身就是怪物模板（`MobTemplate`），用 `petSpell`、`petRanged`、`petRole`、`petCanTaunt` 等字段描述行为，这一点对 RTS 召唤物与随从很有价值。

---

## 3. 技能体系

### 3.1 技能数据结构 `AbilityDef`

| 字段组       | 字段                                                                                                                                                                                                          | 说明                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 身份         | `id`、`name`、`class`、`learnLevel`、`description`、`icon`                                                                                                                                                    | 描述支持 `$d`、`$t`、`$b` 占位 |
| 消耗与时间   | `cost`、`castTime`（0 为瞬发）、`channel {duration, ticks}`、`cooldown`（0 表示只受 GCD）、`maxCharges`（充能，冷却变为充能计时）、`empowerStages`（蓄力）、`castWhileMoving`、`uninterruptible`              |                                |
| 射程与目标   | `range`（0 为近战）、`minRange`、`requiresTarget`、`targetType`（enemy/friendly/any）、`targetMode: 'position'`（地面目标）、`selfCentered`、`partyOnlyTarget`、`targetsDead`                                 |                                |
| 表现         | `projectile`、`projectileFx`、`castFx`                                                                                                                                                                        | 非物理法术默认是弹道           |
| 学派与成长   | `school`（physical/fire/frost/arcane/shadow/holy/nature）、`scalesWith: 'ranged'`                                                                                                                             |                                |
| GCD 与队列   | `offGcd`、`onNextSwing`（下一次挥击类）、`usableWhileCasting`、`usableWhileControlled`                                                                                                                        |                                |
| 门控         | `passive`、`specs`、`excludeSpecs`、`excludeSpecsAtLevel`、`exclusiveGroup`（互斥增益，如猎人守护）                                                                                                           |                                |
| 连击点       | `awardsCombo`、`spendsCombo`                                                                                                                                                                                  |                                |
| 前置条件     | `requiresDodgeProc`、`requiresTargetHpBelow`、`requiresShield`、`requiresForm`、`usableInForm`、`requiresStealth`、`requiresOutOfCombat`、`requiresOutsideInstance`、`requiresAuraKind`、`requiresAuraStacks` |                                |
| 资源全额消耗 | `spendsAllResource`、`spendResourceCap`                                                                                                                                                                       |                                |
| 仇恨与递减   | `threat {flat, mult}`、`fearDr`                                                                                                                                                                               |                                |
| 效果与等级   | `effects: AbilityEffect[]`、`ranks?: AbilityRank[]`                                                                                                                                                           |                                |

注意：`AbilityDef` **没有"资源类型"字段**，消耗总是扣施法者当前的 `resourceType` 资源池（`combat/casting_lifecycle.ts` 中按 `p.resource < payableCost` 判定）。

### 3.2 法术等级与已知技能解析

- `AbilityRank = { rank, level, cost, effects, castTime?, threatFlat? }`；等级行不能覆盖 `channel`、`cooldown`、`range`。
- `abilitiesKnownAt(cls, level, mods)`（`src/sim/content/classes.ts`）的解析流程：
  1. 起点是 `CLASSES[cls].abilities`（按学习顺序排列的基础套件）加上 `mods.grants`（专精签名与天赋行授予）。
  2. 基础套件受 `learnLevel` 门控；授予技能绕过等级门控，也绕过 `specs`/`excludeSpecs` 过滤，并且**不检查技能的 `class` 字段**。
  3. 逐行遍历 `ranks`，取 `level <= 玩家等级` 的最后一行，覆盖消耗、效果、施法时间与仇恨。
  4. 少量硬编码特例（如 `execute` 在两个战士专精下的消耗差异，冰霜专精的 `ice_block` 额外充能）。
  5. 最后 `applyTalentMods` 叠加天赋修正：伤害倍率、治疗倍率、DoT/HoT/吸收倍率、追加效果 `addEffects`、消耗/施法/冷却百分比、固定冷却缩减、额外充能。
- 学习等级遵循经典节奏，例如 `fireball` 在 1/6/12/18 级升阶，`heroic_strike` 在 1/8/14/20 级升阶；`docs/design/spell-ranks.md` 是 1～20 级的参考表，但部分数值已被后续改动覆盖。
- 等级上限 `MAX_LEVEL = 20`，`XP_TABLE` 只有 20 项；满级后经验转入外观性的虚拟等级（上限 `MAX_VIRTUAL_LEVEL = 200`）与威望，不提供战力。

### 3.3 冷却、GCD、施法与引导

| 机制       | 事实                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| GCD        | 1.5 秒（盗贼 1.0），可被法术急速缩短到 0.75；`offGcd` 技能不触发                                           |
| 冷却与充能 | `cooldown` 为秒；`maxCharges` 让冷却变为逐层充能；天赋可加 `bonusCharges`、`cooldownPct`、`cooldownFlat`   |
| 施法队列   | 允许在当前施法结束前 0.4 秒内排队下一个技能（`CAST_QUEUE_WINDOW_SEC`）                                     |
| 施法推迟   | 受击推迟 0.5 秒（`CAST_PUSHBACK_SEC`）；引导受击损失 25% 进度（`CHANNEL_PUSHBACK_FRACTION`）；套装可减推迟 |
| 移动施法   | 默认移动会打断读条，`castWhileMoving` 或天赋可放开                                                         |
| 射程与视线 | 施法开始与完成时都检查射程、最小射程、视线与朝向（`                                                        | normAngle(angleTo - facing) | <= MELEE_ARC`，否则报 "You must be facing your target."） |
| 五秒规则   | 消耗法力后 5 秒内不进行脱战式法力回复                                                                      |

### 3.4 技能效果类型 `AbilityEffect`

当前约 85 种 `type`，按功能分组如下。

| 分组       | 效果类型                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 伤害       | `weaponDamage`（下一次挥击加成）、`weaponStrike`（即时武器攻击，可设不可闪避、需背后、武器倍率）、`directDamage`、`chainDamage`（弹跳与衰减）、`finisherDamage`（按连击点）、`dot`、`drainTick`（引导吸取）、`aoeDamage`（可设正面、昏迷、软上限、命中回怒）、`groundAoE`（持续脉冲区域）、`empoweredCone`（蓄力锥形）、`frozenOrb`（漂移法球）、`consumeAura` |
| DoT 操作   | `extendDot`、`consumeDot`                                                                                                                                                                                                                                                                                                                                      |
| 治疗       | `heal`、`chainHeal`、`aoeHeal`、`hot`、`absorb`、`selfHealPctMax`、`selfHotPctMax`、`lifeTap`                                                                                                                                                                                                                                                                  |
| 时间系专属 | `temporalEcho`、`massTemporalEcho`、`resurrectAlly`、`massResurrectGroup`、`perfectMoment`、`temporalHourglass`、`rewind`                                                                                                                                                                                                                                      |
| 控制       | `stun`、`root`、`slow`、`incapacitate`（受伤打断）、`polymorph`、`silence`、`interrupt`（学派锁定）、`aoeFear`、`aoeSlow`、`aoeKnockback`、`aoeRoot`（含受伤打断、昏迷、环形、陷阱变体）、`finisherStun`                                                                                                                                                       |
| 驱散与解控 | `dispel`（可偷取）、`breakRoots`、`breakControl`、`cleanseSelf`、`clearCooldowns`                                                                                                                                                                                                                                                                              |
| 位移       | `charge`、`feralCharge`、`blinkForward`、`repositionToAim`（跳跃落地，可带落地 AoE）、`greaterInvisibility`                                                                                                                                                                                                                                                    |
| 增益与减益 | `selfBuff`、`buffTarget`（可设全队）、`petBuff`、`applyDebuff`、`debuffTargetSource`、`imbue`（武器灌注）、`judgement`、`finisherHaste`、`enrageChance`、`gainResource`、`selfDamagePctMax`、`absorbSpentResource`、`sunder`、`faerieFire`                                                                                                                     |
| 团队增益   | `aoeAttackSpeed`、`aoeAttackPower`、`aoeAllyAttackPower`、`aoeAllyHaste`、`aoeAllyDamage`、`aoeAllySureCrit`、`aoeAllyMaxHp`、`aoeAllyAbsorb`、`partyMeleeBuff`                                                                                                                                                                                                |
| 仇恨       | `taunt`、`aoeTaunt`                                                                                                                                                                                                                                                                                                                                            |
| 宠物       | `tamePet`、`dismissPet`、`summonPet`、`summonDemon`                                                                                                                                                                                                                                                                                                            |
| 小游戏     | `ballKick`、`ballPass`、`ballShoot`、`sportDash`、`sportShove`（Vale Cup 专用）                                                                                                                                                                                                                                                                                |

### 3.5 光环 `Aura` 与光环类型 `AuraKind`

- `Aura` 主要字段：`id`（技能 id）、`name`、`kind`、`remaining`、`duration`、`value`（DoT/HoT 为每跳数值，减速与急速为倍率，吸收为剩余量，增益为数值）、`value2`/`value3`（灌注审判的上下限）、`tickInterval`/`tickTimer`（周期跳）、`sourceId`、`school`、受伤打断相关（`breaksOnDamage`、`breakThreshold`、`breakChanceScale`、`damageAccrued`、`unbreakableControl`）、`stacks`、`charges`、`icd`、`empowerAbilities`、DoT 附加（`extendedBy`、`leechPct`、`finalDamage`）。叠层上限写在效果上（如 `sunder.maxStacks`），光环本身没有上限字段。
- `AuraKind` 当前约 110 余种，分组：

| 分组           | 代表成员                                                                                                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 周期           | `dot`、`hot`                                                                                                                                                                                                                                 |
| 控制           | `stun`、`stasis`、`root`、`slow`、`incapacitate`、`polymorph`、`silence`、`blind`、`disarm`、`lockout`、`tongues`                                                                                                                            |
| 护盾与减伤     | `absorb`、`shield_wall`、`guardian_ward`、`cast_shield`、`buff_dr`、`buff_dr_phys`、`heal_absorb`                                                                                                                                            |
| 平值增益       | `buff_ap`、`buff_armor`、`buff_int`、`buff_agi`、`buff_sta`、`buff_spi`、`buff_allstats`、`buff_spellpower`、`buff_dodge`、`buff_speed`、`buff_haste`、`buff_spellhaste`、`buff_crit`、`buff_dmg_done`、`buff_maxhp_pct`、`buff_rage_gen` 等 |
| 团队百分比增益 | `buff_stats_pct`、`buff_int_pct`、`buff_sta_pct`、`buff_armor_pct`、`buff_ap_pct`                                                                                                                                                            |
| 减益           | `debuff_ap`、`attackspeed`、`sunder`、`corrode`、`faerie_fire`、`mortal_wound`、`expose`、`bleed_vuln`、`spellvuln`、`vulnerability`、`hex`、`cost_tax`、`critvuln`、`sated` 等                                                              |
| 形态与姿态     | `form_bear`、`form_cat`、`form_travel`、`form_moonkin`、`form_shadow`、`form_metamorph`、`stealth`、`battle_stance`、`berserker_stance`、`defensive_stance`                                                                                  |
| 灌注与反伤     | `imbue`、`thorns`                                                                                                                                                                                                                            |
| 下一次施法强化 | `next_cast_free`、`next_cast_instant`、`next_cast_cheap`、`next_execute_free`、`next_attack_crit`                                                                                                                                            |
| 职业状态       | 战士的 `enrage`、`sudden_death`、`victory_rush` 等；法师的 `fingers_of_frost`、`brain_freeze`、`icicles`、`arcane_charge` 等                                                                                                                 |

增益与减益的归类由 `src/sim/aura_classify.ts` 统一判定（HUD 共用）。

### 3.6 控制与递减

- 控制判定集中在 `combat/cc.ts`（昏迷、定身、沉默、缴械、锁定、致盲、言语混乱），通用谓词 `isControlAura` 经接缝共享。
- 昏迷递减分三类且互不干扰：潜行起手昏迷、主动昏迷、触发型昏迷（`src/sim/stun_dr.ts` 的 `stunDrCategory`），同类按"全额、减半、四分之一、免疫"递减。
- 恐惧类可用 `fearDr` 走恐惧递减；瘫痪、变形类可"受伤即破"，并按伤害累计决定破除概率。

### 3.7 仇恨

`src/sim/threat.ts`（纯函数）：`addThreat`、`clearThreat`、`dropThreat`、`topThreatValue`、`threatEntries`、`threatModifier`、`stealthDetectionRadius`、`canDetectStealthedTarget`、`hasEscapeStealth`。

| 规则               | 数值                                                              |
| ------------------ | ----------------------------------------------------------------- |
| 姿态与形态仇恨系数 | 防御姿态 1.3、熊形态 1.3、猫形态 0.71、正义之怒 1.6（仅神圣伤害） |
| 治疗仇恨           | 每点治疗 0.5 仇恨，在所有敌人间分摊                               |
| 换目标阈值         | 近战超过当前目标仇恨 110%，远程超过 130%                          |
| 嘲讽               | 把嘲讽者抬到最高仇恨并强制目标 3 秒；`ignoreTaunt` 的怪物免疫     |
| 首领召唤物         | 生成时给坦克预置 750 仇恨                                         |

### 3.8 法术系数

`src/sim/spell_scaling.ts`（常量在 `types.ts`）：

| 类型         | 系数                                                         |
| ------------ | ------------------------------------------------------------ |
| 直接伤害     | `clamp(施法时间, 1.5, 3.5) / 3.5`，上限 1.0（瞬发按 1.5 算） |
| 引导         | 同上公式，按跳拆分                                           |
| DoT          | `持续时间 / 15`，按跳拆分                                    |
| AoE          | 乘 0.333                                                     |
| 物理技能     | 用近战攻强 × 0.15（`MELEE_SPELL_AP_SCALE`）                  |
| 远程技能     | 用远程攻强 × 0.15（`RANGED_SPELL_AP_SCALE`）                 |
| 治疗         | 法术强度 × 2（`HEALING_SP_SCALE`）                           |
| 吸收         | 只按技能显式声明的 `spellPowerCoeff`                         |
| 法术强度来源 | 每点智力 0.5 法强（`SPELL_POWER_PER_INT`）                   |

### 3.9 触发器

- 天赋触发器 `ProcDef { id, name, school?, trigger, responses[] }`：触发条件有第 N 次施法、法术暴击、护盾被打破、HoT 结束、受到大额伤害、特定状态下挥击、反伤触发；响应有强化下一次、冷却返还、资源、治疗、吸收、回响、施加光环；可设内置冷却与概率。运行时在 `combat/talent_procs.ts`。
- 套装触发 `SetProc`（施法、武器暴击、法术暴击、击杀）在 `combat/set_procs.ts`；传说武器触发 `WeaponProc`（连锁电弧、攻速减益、DoT、HoT）在 `combat/equip_procs.ts`。

---

## 4. 天赋体系

### 4.1 现状：点数树已经退役

- 旧的点数天赋树（节点、行列坐标、点数门槛、每级天赋点）**已从代码中移除**。`src/sim/progression/talents.ts` 中旧的花点入口已变为恒报错的空操作。
- `src/sim/content/CLAUDE.md` 的"Talents framework"一节与 `docs/design/current-game-design.zh_CN.md`（"10 级起、26 节点、11 点"）仍在描述旧树，已过时。
- 现行系统称为 Talents 2.0，由两部分组成：**一个专精**（签名技能 + 精通 + 部分职业的专精基线）和**六行三选一**。

### 4.2 结构

| 概念       | 类型或常量                                                                                                            | 内容                                                                                                                                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 角色定位   | `Role`                                                                                                                | tank、healer、dps                                                                                                                                                                                                                                                        |
| 专精       | `SpecDef`                                                                                                             | `id`、`class`、`name`、`role`、`icon`、`description`、`signature`、`mastery { name, description, effect }`                                                                                                                                                               |
| 职业天赋表 | `ClassTalents`、`TALENTS`                                                                                             | 九职业全部注册                                                                                                                                                                                                                                                           |
| 行等级     | `ROW_LEVELS = [5, 8, 11, 14, 17, 20]`、`ROW_COUNT = 6`、`OPTIONS_PER_ROW = 3`                                         | `src/sim/content/talent_rows.ts`                                                                                                                                                                                                                                         |
| 行与选项   | `TalentRow { level, theme?, decision?, options: [3 个] }`、`TalentRowOption { id, name, description, icon?, effect }` | 当前约 162 个选项，其中约 54 个是授予主动技能，其余为属性、技能、全局修正或触发器                                                                                                                                                                                        |
| 效果载荷   | `TalentEffect`                                                                                                        | `stats`（力敏耐智精、护甲、攻强、暴击、闪避及其百分比形式）、`ability[]`（逐技能的伤害、消耗、冷却、施法、暴击、移动施法、免推迟、额外充能、追加效果）、`global`（约 37 个全局旋钮：近战/法术/治疗/DoT/HoT/吸收/仇恨/暴伤/急速/宠物等）、`grant {ability, rank}`、`proc` |
| 存储状态   | `TalentAllocation`                                                                                                    | `{ spec: string 或 null; rows: 行等级到选项 id 的映射 }`，这就是全部持久化状态                                                                                                                                                                                           |
| 扁平预计算 | `TalentModifiers`                                                                                                     | `{ spec, role, stats, abilities, global, grants, procs }`，热路径只读它，永不逐 tick 遍历天赋                                                                                                                                                                            |
| 点数换算   | `talentPointsAtLevel(level)`                                                                                          | 等于已解锁行数（0～6），"点数"就是行选择数                                                                                                                                                                                                                               |

计算流程 `computeTalentModifiers(cls, alloc, level)`：先 `repairAllocation`；若已选专精，则把签名技能加入 `grants`，累加精通效果乘以 `min(1, level/20)`，再累加专精基线；最后累加每个已选行选项的效果。

消费点有三个：`recalcPlayerStats`（属性）、`abilitiesKnownAt`/`applyTalentMods`（技能修正与授予）、各战斗模块读取 `global` 与 `procs`。

### 4.3 行职能规则

`docs/design/class-design-rules.md` 给出的行设计纪律：

| 等级 | 行职能       | 输出规则                                                   |
| ---- | ------------ | ---------------------------------------------------------- |
| 5    | 机动         | 不得直接加伤害                                             |
| 8    | 生存         | 不得直接加伤害                                             |
| 11   | 控制         | 伤害只能是附带，不能成为循环收益                           |
| 14   | 资源行为     | 改变节奏或稳定性，不能同时给资源与伤害                     |
| 17   | 主要进攻选择 | 选出唯一的主要个人爆发                                     |
| 20   | 专精或功能   | 改变 17 级的选择或提供横向替代，不能再叠一个自由叠加的爆发 |

配套的"有趣度测试"：每个技能、触发、天赋至少要回答"是否改变下一个按键、资源花费时机、目标选择、风险与时机权衡、核心循环外的功能、玩法替换"之一，否则删除或并入已有技能。

### 4.4 相关文件分工

| 文件                                                       | 角色                                                                                                        | 是否在线路径 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------ |
| `content/talents.ts`                                       | 框架：类型、`TALENTS`、`computeTalentModifiers`、校验、修复、构筑字符串、loadout 常量                       | 是           |
| `content/talents_warrior.ts`、`content/talents_classic.ts` | 九职业的 `SpecDef`（专精、签名、精通）                                                                      | 是           |
| `content/talent_rows.ts`                                   | 行注册表 `ROW_TREES`、`rowTreeFor`、`rowForLevel`、导入时 `validateRowTree`                                 | 是           |
| `content/warrior_rows.ts`                                  | 战士六行 `WARRIOR_ROWS`                                                                                     | 是           |
| `content/choice_rows_classic.ts`                           | 其余八职业的六行 `*_CHOICE_ROWS`（带 `theme` 与 `decision` 说明）                                           | 是           |
| `content/choice_rows.ts`                                   | 同一数据的旧外观层（`CHOICE_ROWS`、`validateRows`、`repairRows`、`accumulateRowEffects`），目前只被测试引用 | 否           |
| `content/talent_abilities_v2.ts`（`_a`、`_b`）             | 只能通过行选项授予的技能定义，合并进 `ABILITIES`，不在职业基础套件里                                        | 是           |
| `content/spec_baselines.ts`                                | 专精基线 `SPEC_BASELINES`、`specBaselineFor`                                                                | 是           |
| `progression/talents.ts`                                   | 应用分配、设置专精、选择行、免费重置、保存/切换/删除 loadout（最多 10 套，名字不超过 24 字）                | 是           |
| `talent_allocation_input.ts`、`talent_loadouts.ts`         | 线上命令解析、存档修复                                                                                      | 是           |

校验与安全：`validateAllocation` 严格校验形状、专精等级、行等级与选项存在性；`sanitizeAllocation`/`repairAllocation` 丢弃无效内容；分配在战斗中与竞技场内被拒绝；`exportBuild`/`importBuild` 生成与解析 base64 构筑字符串（`TALENT_BUILD_VERSION = 2`）。

---

## 5. 战斗公式

"出处"一列：**经典原式**表示与早期经典 MMO 社区公认公式一致（根 `CLAUDE.md` 要求"不发明平衡数字"）；**项目调参**表示 WoC 自行调整或简化，需在新作中重新评估。

| 公式         | 实现（`src/sim/` 下）                              | 内容                                                                                                                                                          | 出处                                 |
| ------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 升级经验     | `XP_TABLE`、`xpForLevel`                           | 1～20 级：400, 900, 1400, 2100, 2800, 3600, 4500, 5400, 6500, 7600, 8800, 10100, 11400, 12900, 14400, 16000, 17700, 19400, 21300, 23200；到 20 级累计 167,200 | 经典原式                             |
| 怪物经验     | `mobXpValue`                                       | 基础 `45 + 5 × 怪物等级`；高于玩家每级 +5%（最多 4 级）；低于玩家按 `1 - 等级差 / ZD` 衰减，达到 ZD 即灰名为 0                                                | 经典原式                             |
| 零差带       | `zeroDiff`                                         | 玩家 1～7 级为 5，8～9 为 6，10～15 为 7，以上为 8                                                                                                            | 经典原式（区间略简化）               |
| 组队经验     | `GROUP_XP_BONUS`                                   | 1、1、1.166、1.3、1.43 人数加成；80 码内分享（`PARTY_XP_RANGE`）                                                                                              | 经典原式                             |
| 精英         | `createMob`、`combat/damage.ts`                    | 生命 ×2.3、伤害 ×1.5、经验 ×2                                                                                                                                 | 项目调参（经典精英概念）             |
| 休息经验     | `progression/xp.ts`                                | 旅店内每 8 游戏小时累积一级所需的 5%，上限 1.5 级                                                                                                             | 经典原式（近似）                     |
| 满级后       | `virtualLevel`、`PRESTIGE_XP_PER_RANK`             | 虚拟等级每级成本约增 10%；每威望等级 23,200                                                                                                                   | 项目自创                             |
| 近战未命中   | `meleeMissChance`                                  | 基础 5%；目标每低 1 级 -0.2%；目标高 1/2/3 级额外 +2.5/+14/+21 个百分点，之后饱和；上限 95%，下限 0.5%                                                        | 基础为经典原式，高等级惩罚为项目调参 |
| 怪打玩家     | `swingMissChance`、`MOB_VS_PLAYER_MAX_MISS`        | 野怪打玩家或玩家宠物，未命中率封顶 20%                                                                                                                        | 项目调参                             |
| 法术命中     | `spellHitChance`、`combat/spell_resist.ts`         | 同级 96%；目标每低 1 级 +1%；目标更高时用同一饱和惩罚；上限 99%，下限 5%                                                                                      | 基础为经典原式，惩罚为项目调参       |
| 命中等级     | `hitFractionFromRating` 等                         | 10 命中等级 = 1% 命中；20 暴击等级 = 1% 暴击；20 急速等级 = 1% 急速                                                                                           | 项目调参（等级制评级）               |
| 近战攻击表   | `combat/auto_attack.ts`                            | 单次掷骰依次判定未命中、闪避、招架、格挡；暴击另掷；没有偏斜与碾压                                                                                            | 经典结构的简化                       |
| 闪避         | `recalcPlayerStats`                                | 玩家 `5% + 敏捷 × 0.05%`；怪物 5% + 每高 1 级 0.5%                                                                                                            | 项目调参                             |
| 招架与格挡   | `combat/warrior_hit_table.ts`、`SHIELD_BLOCK_BASE` | 只有战士防守方有按力量换算的招架，且需面朝攻击者；持盾格挡基础 5%，格挡值抵扣伤害                                                                             | 项目调参                             |
| 近战暴击     | `recalcPlayerStats`                                | `5% + 敏捷 × 0.05%` + 共享暴击加成；目标每高 1 级 -0.2%；暴击伤害物理 2 倍                                                                                    | 暴伤倍数为经典原式，换算为项目简化   |
| 法术暴击     | `Sim` 的法术暴击计算                               | `5% + 智力 × 0.08%` + 共享暴击加成 + 光环；法术与治疗暴伤 1.5 倍                                                                                              | 暴伤为经典原式，换算为项目调参       |
| 护甲减伤     | `armorReduction`                                   | `护甲 / (护甲 + 85 × 攻击者等级 + 400)`，上限 75%                                                                                                             | 经典原式                             |
| 护甲来源     | `recalcPlayerStats`                                | 敏捷 × 2 计入护甲；破甲每层 2%，精灵之火 10%                                                                                                                  | 经典原式与项目调参混合               |
| 武器伤害     | `meleeSwing`                                       | `武器随机伤害 + 攻强 / 14 × 武器速度`，再乘倍率，加灌注平值                                                                                                   | 经典原式                             |
| 攻强         | `recalcPlayerStats`                                | 战士、圣骑士、萨满、德鲁伊：力量 × 2；盗贼、猎人：力量 + 敏捷；纯施法者：力量；猎人远程攻强：敏捷 × 2                                                         | 经典原式                             |
| 生命         | `hpFromStamina`                                    | 前 20 点耐力每点 1 生命，之后每点 10 生命；熊形态 ×1.15                                                                                                       | 经典原式                             |
| 法力         | `manaFromIntellect`                                | 前 20 点智力每点 1 法力，之后每点 15 法力                                                                                                                     | 经典原式                             |
| 怒气转换     | `rageConversion`                                   | `c = 0.0091 L² + 3.23 L + 4.27`                                                                                                                               | 经典原式                             |
| 造成伤害得怒 | `rageFromDealing`                                  | `7.5 × 伤害 / c`                                                                                                                                              | 经典原式                             |
| 受到伤害得怒 | `rageFromTaking`                                   | `伤害 / (攻击者等级 × 1.5)`                                                                                                                                   | 项目调参（经典为 `2.5 × 伤害 / c`）  |
| 怒气衰减     | `updateRegen`                                      | 脱战每 2 秒 -2                                                                                                                                                | 经典原式（近似）                     |
| 能量回复     | `updateRegen`                                      | 每 2 秒 20                                                                                                                                                    | 经典原式                             |
| 法力回复     | `updateRegen`                                      | 五秒规则外每 2 秒 `精神/3 + 4 + floor(等级/5)`                                                                                                                | 规则为经典，公式为项目调参           |
| 生命回复     | `updateRegen`                                      | 脱战每 2 秒 `耐力 × 0.3 + 2`                                                                                                                                  | 项目调参                             |
| 吃喝         | `CONSUME_DURATION`                                 | 坐下 18 秒分 9 跳恢复，受伤或起身中断；药水共享 120 秒冷却                                                                                                    | 经典原式                             |
| 施法推迟     | `CAST_PUSHBACK_SEC`、`CHANNEL_PUSHBACK_FRACTION`   | 0.5 秒；引导 25%                                                                                                                                              | 经典原式                             |
| 法术系数     | `spell_scaling.ts`                                 | 见 3.8                                                                                                                                                        | 经典原式（AoE 系数为近似）           |
| 物品等级     | `item_level.ts`                                    | 来源等级 + 品质加成（0/0/1/3/6/10）+ 团本 3                                                                                                                   | 项目自创                             |
| 属性预算     | `item_budget.ts`                                   | `round(物品等级 × 品质系数 × 部位系数 × 0.7)`；品质系数 优秀 0.55、精良 0.8、史诗 1.0、传说 1.9；武器 DPS 预算 `6.7 + 0.3 × 物品等级`                         | 项目自创                             |
| PvP 评级     | `pvp/power.ts`                                     | 10 评级 = 1%，攻防各封顶 20%，伤害乘 `(1 + 攻) × (1 - 防)`                                                                                                    | 项目自创                             |

平衡方法论（`docs/design/spell-balance-framework.md`）：每个输出专精跑"持续 180 秒单目标、爆发 60 秒单目标、AoE 60 秒 5 目标"三种确定性剖面，满级持续单体 DPS 最高与最低专精差距不超过 10%～15%；工具有 `scripts/balance_report.mjs`、`scripts/dummy_sim.mjs`、`tests/spell_balance.test.ts`。

---

## 6. 怪物与 AI

### 6.1 怪物模板 `MobTemplate`

| 字段组       | 字段                                                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 身份与等级   | `id`、`name`、`minLevel`、`maxLevel`（出生等级在区间内随机）、`family`                                                                                                                   |
| 数值         | `hpBase`/`hpPerLevel`、`dmgBase`/`dmgPerLevel`、`attackSpeed`、`armorPerLevel`（没有护甲基数）、`moveSpeed`、`aggroRadius`                                                               |
| 掉落         | `loot: LootEntry[]`，`LootEntry { itemId?, copper?, chance, questId?, rollGroup? }`；同 `rollGroup` 共用一次抽取实现"多选一"；带 `questId` 的只在玩家仍需要时掉                          |
| 表现提示     | `scale`、`color`                                                                                                                                                                         |
| 采集         | `componentTags`（剥皮/分解得到的部件类型）                                                                                                                                               |
| 标志         | `boss`、`rare`、`elite`、`worldBoss`、`quietMechanics`、`xpMult`、`canSwim`、`phasesThroughObstacles`、`ccImmune`、`slowImmune`、`ignoreTaunt`、`respawnMult`、`respawnSeconds`、`dummy` |
| 宠物与施法者 | `petSpell`（远程法术弹，可带前摇）、`petRanged`、`petRole`、`petCanTaunt`                                                                                                                |
| 机制字段     | 当前约 70 个可选声明式字段（见 6.3）                                                                                                                                                     |

怪物**没有技能书**：怪物不使用 `AbilityDef`，所有能力都是模板上的声明式机制字段。这与玩家技能体系是两套表达。

### 6.2 族群

`MobFamily` 当前 12 种：beast、humanoid、mudfin、spider、burrower、undead、troll、ogre、elemental、dragonkin、demon、reptile（demon 只用于术士宠物，reptile 只用于一个地窟怪）。

当前 `MOBS` 合并表约 118 个模板：区域一约 16、区域二约 17、区域三约 27、副本约 21、神殿 3 + 7、地窟约 18、术士宠物 7、法师宠物 1、Yumi 1、Vale Cup 球 1。

### 6.3 机制字段（按类别）

| 类别           | 字段                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 说明                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 定时与首领机制 | `aoePulse`、`stomp`、`bigCast`（真实读条加喊话）、`stoneskin`、`terrify`、`infernoChannel`（定身递增引导）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 多在近战交战中由 `runMobAttackMechanics` 驱动 |
| 全程触发       | `aoeSlow`（反放风筝减速）、`battleYells`、`charge`（仅英雄难度）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 追击中也会触发                                |
| 血量阈值与支援 | `summonAdds {mobId, count, atHpPct[]}`、`enrage {belowHpPct, dmgMult, hasteMult}`、`desperateHeal`、`mendAlly`、`wardAllies`、`channelHeal`（可打断的递增治疗）、`rally`、`warcry`                                                                                                                                                                                                                                                                                                                                                                                                        | `Sim.updateBossMechanics`                     |
| 命中词缀       | DoT 类（`venom`、`soulrot`、`bleed`、`frostbite`、`smolder`、`cinder`、`arcaneRot`、`stackPoison`）；治疗与吸血（`mortalStrike`、`healAbsorb`、`lifeleech`）；控制（`concuss`、`stunOnHit`、`ensnare`、`knockback`、`polymorphHex`）；易伤（`expose`、`corrode`、`spellVuln`、`vulnerability`、`critVuln`、`staggerHit`）；速度与施法（`slowStrike`、`chillOnHit`、`tongues`、`silence`、`blind`、`disarm`、`lockout`、`costTax`）；资源与属性（`manaBurn`、`sapVigor`、`enfeeble`、`enervate`、`plague`、`wither`、`demoralize`、`siphonSpirit`、`hex`）；其他（`purgeOnHit`、`cleave`） | `mob/mob_swing.ts` 的 `runMobSwingAffixes`    |
| 反应与死亡     | `thorns`、`spellReflect`、`frenzyOnHit`、`rampage`、`packFrenzy`（同伴死亡时）、`deathThroes`（尸体爆炸）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `mob/lifecycle.ts` 等                         |
| 喊话           | `yells {engage, summon, enrage}`、`battleYells {lines, every, range}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `mob/yells.ts`                                |

使用频率：多数词缀只有一个怪物使用；较常见的是 `aoePulse`（约 20）、`enrage`（约 15）、`summonAdds`（约 13）、`charge`（约 9）、`cleave`（约 7）；标志 `ccImmune` 约 35 个。

### 6.4 精英、稀有、首领

| 分级     | 定义方式                                         | 行为差异                                                                                                         |
| -------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 精英     | `elite: true`                                    | 生命 ×2.3、伤害 ×1.5、经验 ×2；不逃跑                                                                            |
| 稀有     | `rare: true`，放在数量为 1 的营地                | 刷新默认 4 倍（常被覆盖为 1 到 6 小时）；不逃跑；伤害贡献者全部获得保底任务掉落。**没有随机替换刷新机制**        |
| 首领     | `boss: true`                                     | 机制字段集中使用；首领召唤物预置仇恨                                                                             |
| 世界首领 | `worldBoss: true` + `world_boss.ts`              | 当前只有一个（Thunzharr），每 sim 小时出现一次，生命 4 万基础、每名参与者 +5000、上限 100 万；个人掉落、每日锁定 |
| 团本首领 | 专用脚本 `encounters/nythraxis.ts`（约 1600 行） | 两阶段、剧情过场、印石引导打断、标记分摊、英雄难度"宫廷"三小怪                                                   |
| 地窟首领 | 专用脚本 `delves/drowned_litany_boss.ts` 等      | 黑水印记、护盾阶段、钟声弹幕、祭坛谜题                                                                           |

首领编写方式：五人本首领（Morthen、Olen、Vael、Korgath、Velkhar、Korzul、Selthe、Ysolei）**全部是纯数据**（模板字段 + `content/dungeon_difficulty.ts` 难度表）；只有团本首领与一个地窟终局首领是代码脚本。

### 6.5 AI 状态与行为

| 行为       | 规则                                                                                                                                                      | 位置                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 状态机     | idle、chase、attack、flee、evade、dead（`AiState`）                                                                                                       | `mob/locomotion.ts` 的 `updateMob`       |
| 闲逛       | 出生点 2～9 码内以 0.35 倍速度游荡                                                                                                                        | 同上                                     |
| 主动仇恨   | 侦测半径 `max(4, min(20, aggroRadius + (怪等级 - 玩家等级) × 1.5))`；潜行按等级差缩小；低 10 级以上的"灰怪"不主动攻击                                     | `mob/targeting.ts`、`threat.ts`          |
| 社交仇恨   | 拉一只会带上 5 码内同模板闲置怪（mudfin 8 码）                                                                                                            | `Sim.aggroMob`、`mob/social_aggro.ts`    |
| 逃跑求援   | 20% 血以下、每次战斗一次、持续 5 秒；仅人形、穴居、mudfin、巨魔族群，且非精英/稀有/首领；逃跑中拉 5 码内同族群闲置怪                                      | `Sim.maybeFlee`、`flee_speed.ts`         |
| 拴绳与脱战 | 从拉怪点起算，野外 45 码、副本 70 码；脱战后清仇恨，1.6 倍速免疫回家，卡住 3 秒穿墙，到家完全重置                                                         | `LEASH_DISTANCE`、`resetEvadingMob`      |
| 战斗档案   | `MobCombatProfile`：近战距离、期望距离、追击倍速、能否拴绳、追击中挥击等；默认近战距离 `5 + (体型 - 1) × 3`；治疗者、施法者、近战三种分支                 | `mob_combat.ts`、`mob/combat_profile.ts` |
| 移动       | 不寻路；直线移动，受阻时扇形尝试（0、±0.5、±1.0、±1.6 弧度）；贴地；深水与陡坡门槛                                                                        | `Sim.moveToward`                         |
| 读条       | 怪物没有通用施法系统，读条只来自 `bigCast`、`channelHeal`、`infernoChannel` 与团本脚本                                                                    | `mob/healer_channel.ts`                  |
| 刷新       | 营地 `CampDef {mobId, center, radius, count}` 在 `Sim` 构造时按数组顺序生成；默认 25 秒刷新；尸体存在 60 秒；未拾取尸体腐烂后才刷新；副本怪在重置前不刷新 | `mob/lifecycle.ts` 的 `respawnMob`       |

外部驱动接口：本 fork 在 `types.ts` 中定义了 `AiActiveMobActionRequest`（意图：开战、逃跑、呼救）与 `AiActiveNpcActionRequest`（短距移动、回家），由 `Sim.aiActiveMobAction` 执行、`server/ai/active_triggers.ts` 调用。这是"让外部 AI（如大模型 GM）安全地驱动怪物与 NPC"的现成窄接口，与《箱庭纪》"诸神作为 GM"的支柱直接相关。

---

## 7. 世界内容

### 7.1 区域

世界是一条南北向长条：x 在 ±180，z 从 -180 到 900，三个区域按 z 分段，`zoneAt(z)` 判定。

| 区域                      | 等级   | 中心营地  | 怪物模板 | NPC   | 任务                      | 营地  | 稀有                    | 首领                                                    | 物品表                      |
| ------------------------- | ------ | --------- | -------- | ----- | ------------------------- | ----- | ----------------------- | ------------------------------------------------------- | --------------------------- |
| Eastbrook Vale（山谷）    | 1～7   | Eastbrook | 约 16    | 约 16 | 约 32（含 14 个专业任务） | 约 17 | 约 5                    | Gorrak                                                  | 共享 `BASE_ITEMS`（约 192） |
| Mirefen Marsh（沼泽）     | 6～13  | Fenbridge | 约 17    | 约 8  | 约 24                     | 约 22 | 约 4                    | The Broodmother、Deacon Voss                            | `ZONE2_ITEMS`（约 81）      |
| Thornpeak Heights（山峰） | 13～20 | Highwatch | 约 27    | 约 12 | 约 34                     | 约 23 | 约 9（含 3 个遗物召唤） | Warlord Drogmar、The Bound Guardian、世界首领 Thunzharr | `ZONE3_ITEMS`（约 136）     |
| Drowned Temple 外围       | 15～18 | 月门      | 3 + 7    | 1     | 约 6                      | 约 5  | 1                       | 无                                                      | 约 23                       |

每个区域模块导出 `ZONE{N}_ZONE`、`_MOBS`、`_NPCS`、`_QUESTS`、`_QUEST_ORDER`、`_CAMPS`、`_OBJECTS`、`_ROADS`、`_PROPS`；`ZoneDef` 包含 z 区间、等级区间、生物群系、中心营地、墓地、湖泊、兴趣点（带持久 id）与欢迎提示。

叙事骨架（`docs/design/master-spec.md`）：主线 Gravecaller 阴谋三幕（Eastbrook 的 Morthen、沼泽的 Vael、山峰的古龙 Korzul），支线 Drowned Moon，满级钩子 Nythraxis 团本。区域等级段有意重叠，组队内容作为高点嵌在单人链旁边而不堵主线。

### 7.2 副本、英雄难度与团本

| 副本                 | 等级   | 人数 | 小怪构成                        | 首领                                                                               |
| -------------------- | ------ | ---- | ------------------------------- | ---------------------------------------------------------------------------------- |
| The Hollow Crypt     | 7～10  | 5    | 亡灵与侍僧、蜘蛛                | Sexton Marrow（中）、Morthen the Gravecaller（Shadow Pulse）                       |
| The Sunken Bastion   | 11～13 | 5    | 亡灵与潮缚侍僧                  | Knight-Commander Olen（顺劈、冲锋）、Vael（Mist Surge，60%/30% 召唤）              |
| Gravewyrm Sanctum    | 18～20 | 5    | 骨卫与鳞卫                      | Korgath（践踏、狂暴）、Velkhar（66%/33% 召唤）、Korzul（Grave Inferno 引导、狂暴） |
| The Drowned Temple   | 16～18 | 5    | 神殿卫、侍僧、潜伏者、哨兵      | Choirmother Selthe、Ysolei（Lunar Tide、召唤、30% 狂暴）                           |
| Abandoned Crypt      | 20     | 1    | 剧情/调谐：3 个遗物召唤三位灵魂 | 无                                                                                 |
| Nythraxis Raid Arena | 20     | 10   | 3 块印石                        | Nythraxis, Scourge of Thornpeak                                                    |

- `DungeonDef` 字段：`id`、`name`、`index`、`doorPos`、`entry`、`exitOffset`、`interior`、`suggestedPlayers`、进出文案；没有等级区间字段（等级来自怪物）。人数不足时只警告不阻止。实例在同一平面远处的 x 带上，最多 24 个实例槽。
- 英雄难度（`content/dungeon_difficulty.ts` 的 `HEROIC_DUNGEON_TUNING`/`NORMAL_DUNGEON_TUNING`，`instances/difficulty.ts`）：所有怪物锁 22 级；生命 3.2～5.2 倍、伤害 7.25～20 倍（按副本，可逐怪覆盖）；召唤物单独倍率；首领免控免减速；最低移速 8；启用冲锋；英雄徽记与每日锁定；`buildHeroicVariants` 自动生成英雄版物品。
- 团本 Nythraxis：一阶段（重击正面溅射、召唤卫兵），70% 时 21 秒剧情过场，二阶段（灵魂撕裂标记分摊、10 秒"不死之怒"读条需玩家在印石上完成 5 秒引导来打断，否则全团承受 82% 最大生命伤害），5% 最终狂暴；英雄难度另加叠层诅咒与三个"宫廷"小怪。锁定 24 小时，普通与英雄分开。

### 7.3 地窟（delves）

| 地窟                    | 主题 | 等级 | 人数 | 结构                           | 首领                                      | 同伴                  |
| ----------------------- | ---- | ---- | ---- | ------------------------------ | ----------------------------------------- | --------------------- |
| The Collapsed Reliquary | 地穴 | 7+   | 1～2 | 3 模块 + 终局                  | Deacon Varric（钟鸣践踏、召唤、英雄狂暴） | Acolyte Tessa（治疗） |
| The Drowned Litany      | 遗迹 | 12+  | 1～2 | 6 选 3 模块 + 终局，黑水危险池 | Sister Nhalia（全脚本）                   | Edda Reedhand（治疗） |

- 普通与英雄两档：英雄 +3 敌人等级、1 个词缀、1.3 倍奖励；当前约 12 个词缀（按主题标记）；同伴 1～3 阶，3 阶每次可复活一次。
- 奖励：铜币、首通与重复经验、地窟徽记、传说解锁、徽记商店（按可用、通关次数、英雄通关门控）、小概率"丰饶"紫色宝箱。
- 开锁小游戏 Tumbler's Path：纯逻辑核心 `src/sim/lockpick.ts`，难度预设在 `content/delves/lockpick_tiers.ts`，押注决定奖励档位。
- 地窟是 WoC 中**最接近单机体验**的内容形态（1～2 人 + AI 同伴 + 随机模块 + 词缀 + 档位）。

### 7.4 任务

- `QuestDef`：`id`、`name`、`giverNpcId`、`turnInNpcId`/`turnInNpcIds`、`text`/`completionText`（`$N`、`$C` 替换）、`objectives[]`、`xpReward`、`copperReward`、`itemRewards`（按职业）、`requiresQuest`、`requiredItems`、`minLevel`、`retired`、`shareable`、`suggestedPlayers`、`repeatable`/`repeatCadenceTicks`、`completionEffect`。
- 目标类型：`kill`（约 56）、`collect`（约 47）、`interact`（地面物件或 NPC，约 4）、`gather`（约 4）、`craft`（0）。
- 当前约 96 个任务；约 50 条前置链接；约 16 个组队建议任务；约 11 个可重复任务。
- 奖励按职业原型共享（`REWARD_ARCHETYPE`：圣骑士与萨满用战士奖励，猎人用盗贼奖励，牧师、术士、德鲁伊用法师奖励），减少物品表膨胀。
- `docs/design/master-spec.md` 记录了任务经验预算方法：单个任务奖励不超过当级升级所需的 25%，副本小怪经验只占单刷的 0.572 倍，"副本是掉落与故事事件，不是经验农场"。

### 7.5 物品与稀有度

| 方面     | 事实                                                                                                                                                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 规模     | 手写物品约 615 个（基础约 192、专业约 68、区域二约 81、区域三约 136、神殿约 23、地窟约 30、英雄商人约 10、英雄约 35、PvP 约 40），另有自动生成的英雄变体                                                                                             |
| 结构     | `ItemDef` 是联合类型：护甲、武器、首饰、副手持物、其他；通用字段含 `slot`、`stats`、`spellPower`、`critRating`、`hasteRating`、`hitRating`、PvP 攻防评级、价格、`quality`、`requiredClass`、`requiredLevel`、`set`、`soulbound`、堆叠、背包格、`use` |
| 槽位     | 主手、副手、头、颈、肩、胸、腰、腿、手、脚、戒指 ×2（共 12 个位置）；没有披风、护腕、饰品、远程槽                                                                                                                                                    |
| 品质     | 粗糙、普通、优秀、精良、史诗、传说六档                                                                                                                                                                                                               |
| 武器类型 | 匕首、剑、法杖、锤、斧、魔杖、长柄；**没有弓弩**，猎人自动射击走主手                                                                                                                                                                                 |
| 职业锁   | `WAR`（战士/圣骑士/萨满）、`MAG`（法师/牧师/术士/德鲁伊）、`ROG`（盗贼/猎人），另有 `FERAL`、`CASTER_ALL`                                                                                                                                            |
| 消耗品   | 食物、饮料（坐下 18 秒）、药水（120 秒共享冷却）、药剂                                                                                                                                                                                               |
| 传说武器 | 2 件，带 `weaponProcs`（DoT/HoT 触发、连锁电弧加攻速减益）                                                                                                                                                                                           |
| 需求等级 | `item_level_req.ts` 的 `requiredLevelFor`：精良及以上需要来源等级                                                                                                                                                                                    |
| 货币     | 内部单位铜，显示金银铜（sim 自有 `format_money.ts`）                                                                                                                                                                                                 |

### 7.6 套装与附魔

- 套装（`content/item_sets.ts` 的 `ITEM_SETS`、`aggregateSetBonuses`）：当前约 10 套（T1 三套、T2 四套、三件套升级急速套三套）；2/3/4 件奖励，`SetBonusEffect` 可含属性、攻强、法强、暴击、急速、命中、施法推迟减免、击退抗性与触发器。
- 附魔（`content/enchants.ts` 的 `ENCHANTS`）：当前约 42 个，只有平值主属性或护甲加成，分基础、符文、强效三档，覆盖除副手外的大部分槽位；材料来自分解。

### 7.7 专业、配方与采集

| 方面   | 事实                                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 采集   | 采矿、伐木、草药（技能上限 100）、钓鱼（上限 200）；尸体剥取按 `componentTags`                                                                                    |
| 制作环 | `CRAFT_RING` 十种：工程、炼金、烹饪、制皮、裁缝、铭文、附魔、珠宝、武器锻造、护甲锻造（上限 125）；相邻两项组成"原型对"，对面一项为业余爱好；切换原型需要补偿任务 |
| 杰作   | 制作可出杰作（masterwork），有出处与实例叠放规则                                                                                                                  |
| 配方   | 当前约 75 个（通用、工具、施法者枢纽、组合、阶梯）；铭文与珠宝暂无配方，附魔走 `ENCHANTS`                                                                         |
| 采集点 | 当前约 33 个（矿、木、草各约 11），三区域分布，三档；稀有采集事件；按观察者各自刷新                                                                               |
| 工站   | 熔炉、厨房、药剂间、制革间、织机、工具间，另有限时移动工站                                                                                                        |
| 专精   | 技能 75 时专精：材料 -20%、充能 -25%                                                                                                                              |
| 代码   | 机制在 `src/sim/professions/`（自带 `CLAUDE.md`），数据在 `content/professions.ts`、`recipes.ts`、`gather_nodes.ts`、`profession_items.ts`                        |

### 7.8 功绩（Book of Deeds）

- `DeedDef { id, name, desc, category, renown, trigger, reward?, hidden?, feat? }`；`renown` 取 0/5/10/25/50；`DEEDS` 与只追加的 `DEED_ORDER` 在 `content/deeds.ts`。
- 触发词汇是封闭集合 `DeedTrigger`：`level`、`lifetimeXp`、`quest`/`quests`、`stat`（约 24 个计数器）、`dungeonClears`、`delveClears`、`arenaRating`、`craftSkill`、`gathering`、`collectItems`、`visit`/`visits`、`meta`、`meter`、`flag`、`manual`。
- 评估器 `src/sim/deeds.ts` 的 `updateDeeds`：在 tick 末尾只评估"脏"玩家，加一个 1 Hz 的地点接近扫描，**不抽 rng**；登录时对已加载状态重新评估并追溯授予（`retro: true`），还有"证据推断"与"永久不可达补偿"两类兜底。
- 当前约 219 条，分 11 类（成长、收集、PvP、副本、编年、社交、地窟、战斗、探索、隐藏、壮举）。WoC 的硬规则是**只给外观奖励**（头衔、边框），不给战力。

### 7.9 PvP 与 Warfare

| 系统         | 要点                                                                                                                   | 位置                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 决斗         | 3 秒倒计时，打到 1 HP 结束，60 码外判负                                                                                | `social/duel.ts`                                                   |
| 竞技场       | 1v1 与 2v2 排名，Elo（初始 1500、K=32、下限 100），5 秒倒计时，150 秒超时按血量百分比判定                              | `social/arena.ts`                                                  |
| Warfare      | 单一 PvP 战斗评级：10 评级 = 1% 增伤与减伤，各封顶 20%；只在敌对玩家间生效；荣誉货币与 FURY 商人（约 40 件 28 级史诗） | `pvp/`、`content/pvp_honor.ts`、`docs/design/warfare.md`           |
| Fiesta       | 2v2 计分复活赛，统一 20 级与默认构筑，三波强化选择，缩圈，场地强化物，离线有机器人陪练                                 | `social/fiesta.ts`、`social/fiesta_bots.ts`、`content/augments.ts` |
| Vale Cup     | 野猪球赛，8 国、分级赛程、角色分工，零 rng                                                                             | `social/vale_cup.ts`、`content/vale_cup.ts`                        |
| Protect Yumi | 3v3/5v5 迷宫保护猫，猫每 60 秒传送，600 秒突然死亡                                                                     | `social/yumi.ts`                                                   |
| Card Duel    | 卡牌小游戏（Card Master NPC），排队与超时判负                                                                          | `social/card_duel.ts`                                              |

---

## 8. 复用评估

### 8.1 评级定义

| 评级       | 含义                                                                |
| ---------- | ------------------------------------------------------------------- |
| 直接复用   | 代码或数据结构原样带走，只做命名与配置调整                          |
| 改造后复用 | 主体可用，需要按 2D、单机、等级 60、无职能主角、城建/RTS 接口等改造 |
| 仅参考     | 借鉴设计、结构或方法，代码与数据基本重写                            |
| 不复用     | 与新作方向不符，舍弃                                                |

### 8.2 总表

| 模块                                                                              | 评级                 | 理由                                                                          | 改造要点                                                                                                                   |
| --------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 确定性内核：tick、`DT`、`Rng`、`SimEvent`                                         | 直接复用             | 零依赖、已被大量测试与金样轨迹守护，天然适合单机存档、回放与"内核结果即事实"  | 保持 20 Hz；RTS 战场可评估子系统降频                                                                                       |
| `SimContext` 接缝与模块化范式                                                     | 直接复用             | 让新系统（城建、RTS、千门）以独立模块挂接而不膨胀协调器                       | 新系统各自建模块；协调器只登记阶段                                                                                         |
| `sim.ts` 协调器                                                                   | 改造后复用           | 约 1 万行里混有大量在线多人系统                                               | 剪除市场、邮件、交易、竞技场、Fiesta、Vale Cup、Yumi、Card Duel、监狱、Discord、持有者等阶段与委托；重排后重新建立金样轨迹 |
| 战斗引擎：`combat/` 的施法、效果分发、光环、控制、伤害、治疗、自动攻击、弹道      | 直接复用             | 与 3D 无关，是"复杂技能体系线性释放"的核心资产                                | 只需随资源模型与等级上限调整少量入口                                                                                       |
| 技能效果词汇 `AbilityEffect`（约 85 种）与光环类型（约 110 余种）                 | 直接复用             | 覆盖伤害、治疗、控制、位移、团队增益、召唤                                    | 删除 Vale Cup 小游戏专用效果；新增城建/RTS 需要的效果（如"鼓舞兵团""建造加速"）时按同一模式追加                            |
| 职业数据 `CLASSES`、`ABILITIES`                                                   | 改造后复用           | 世界观已决定沿用九职能；数值与机制成熟                                        | 显示名换皮为中文职能体系；等级上限扩到 60（补等级行与高阶技能）；保留内部 id 以减少改动                                    |
| 法术等级 `ranks` 与 `abilitiesKnownAt`                                            | 改造后复用           | 机制通用                                                                      | 等级行扩展到 60；对"无职能主角"放开基础套件                                                                                |
| 法术系数 `spell_scaling.ts`                                                       | 直接复用             | 经典系数模型，纯函数                                                          | 无                                                                                                                         |
| 专精与六行天赋                                                                    | 改造后复用           | 适合 NPC、同伴、英雄等"有职能"的角色                                          | 行等级随 60 级上限重排（例如每 10 级一行或更多行）；`min(1, level/20)` 精通曲线需改                                        |
| 天赋效果层 `TalentEffect`、`TalentModifiers`、`computeTalentModifiers`、`ProcDef` | 直接复用             | 是"千门回廊"的最佳载体（见 8.3）                                              | 扩展效果类别（系统功能解锁）                                                                                               |
| 战斗公式（`types.ts`）                                                            | 直接复用             | 经典原式为主，可解释、可测                                                    | 等级 60 扩展经验表；重审大等级差下的饱和规则（见 8.5）                                                                     |
| 仇恨 `threat.ts`                                                                  | 直接复用（RPG 部分） | 坦克与嘲讽体系完整                                                            | RTS 战场不使用仇恨制索敌                                                                                                   |
| 怪物模板与机制词缀                                                                | 直接复用             | 数据驱动、首领多为纯数据，换皮成本低                                          | 族群映射到《箱庭纪》种族与魔物；补"怪物技能书"可选扩展                                                                     |
| 怪物 AI（索敌、拴绳、社交、逃跑求援）                                             | 改造后复用           | RPG 野外与迷宫可用                                                            | RTS 单位不应"拴绳回出生点"，需用 `canLeash: false` 类档案或另写指令驱动 AI                                                 |
| 首领脚本（Nythraxis、Sister Nhalia）                                              | 仅参考               | 作为"脚本首领"模板与阶段机、过场、引导打断的实现参考                          | 新首领按新剧情重写                                                                                                         |
| 世界首领 `world_boss.ts`                                                          | 改造后复用           | 可转为单机的"世界事件首领"（女神降灾）                                        | 去掉多人贡献者与每日锁定，接入 GM 事件触发                                                                                 |
| 宠物 `pet/`                                                                       | 直接复用             | 跟随、协助、模式、远程、嘲讽已完整                                            | 同时作为 RTS 召唤物与随从的基础                                                                                            |
| 地窟同伴 `delves/companion.ts`                                                    | 改造后复用           | 单机同伴 AI 的原型                                                            | 扩展为多职能同伴、可编队、可培养                                                                                           |
| Fiesta 机器人 `social/fiesta_bots.ts`                                             | 仅参考               | 它用真实职业技能驱动"玩家型实体"，是英雄 AI 驱动器原型，但直接操纵 `Sim` 内部 | 新建经接缝的英雄 AI 模块                                                                                                   |
| 区域、任务、NPC、物品的**具体内容数据**                                           | 仅参考               | 世界观与地名完全不同                                                          | 结构、节奏、经验预算方法复用；内容重写                                                                                     |
| 任务引擎 `quests/`、`QuestDef`                                                    | 直接复用             | 击杀、收集、交互、采集、链式前置、按原型奖励都可用                            | 增加对话抉择、护送、建造、声望等目标类型                                                                                   |
| 副本与英雄难度                                                                    | 改造后复用           | 难度表、锁定、变体生成器都通用                                                | 5 人副本改为"主角 + 同伴"规模并重调数值                                                                                    |
| 地窟 delves                                                                       | 改造后复用           | 最贴近单机：小队、随机模块、词缀、档位、开锁                                  | 作为"迷宫"系统骨架（世界观第二幕有迷宫）                                                                                   |
| 物品、物品等级与预算、装备规则                                                    | 改造后复用           | 公式简单可扩展                                                                | 预算随 60 级扩展；补披风、饰品、远程等槽位与弓弩类型（按需）                                                               |
| 套装与触发                                                                        | 直接复用（机制）     | 机制通用                                                                      | 数据重做                                                                                                                   |
| 附魔                                                                              | 改造后复用           | 结构简单                                                                      | 数据重做                                                                                                                   |
| 专业与配方、采集点、工站                                                          | 改造后复用           | 采集点与工站天然可映射为城建资源点与建筑                                      | 从"个人背包经济"扩展到"领地库存经济"                                                                                       |
| 拾取（`loot/`）                                                                   | 改造后复用           | `rollLoot`、`rollGroup`、任务掉落有用                                         | 去掉队伍拾取策略、FFA 计时等多人部分                                                                                       |
| 功绩 Book of Deeds                                                                | 改造后复用           | 评估器与触发词汇可作为"钥"的判定引擎，也可保留为成就系统                      | 成就保持外观奖励；"钥"另建表，奖励可为能力                                                                                 |
| PvP（决斗、竞技场、Warfare、Fiesta、Vale Cup、Yumi）                              | 不复用               | 单机为主                                                                      | 决斗可改为 NPC 切磋；Card Duel 可作小游戏参考                                                                              |
| 社交与经济（队伍、交易、聊天、市场、邮件、公会）                                  | 大部分不复用         | 单机为主                                                                      | 队伍改为同伴编队；银行改为"门内庭院"仓库；市场仅参考                                                                       |
| 移动与物理（`player_motion.ts`、`physics/`、`climb.ts`）                          | 仅参考               | 3D 跳跃攀爬                                                                   | 2D 版只保留平面移动与滑动碰撞                                                                                              |
| 碰撞 `colliders.ts`、视线、寻路                                                   | 改造后复用           | 足迹与视线已是 XZ                                                             | 去高度字段或换瓦片；RTS 需群体寻路                                                                                         |
| 地形与水 `world.ts`、体素                                                         | 不复用               | 3D 高度场                                                                     | 2D 瓦片地图自建                                                                                                            |
| 空间网格 `spatial.ts`                                                             | 直接复用             | 纯 2D                                                                         | 无                                                                                                                         |
| `IWorld` 接缝范式                                                                 | 改造后复用           | 渲染/UI 与内核的唯一边界                                                      | facet 按单机与新系统重新裁剪                                                                                               |
| 3D 渲染 `src/render/`、HUD `src/ui/`                                              | 不复用               | Three.js 与 DOM HUD                                                           | UI 的"纯视图核心 + 薄绘制器"方法可参考                                                                                     |
| sim 英文文本 + 客户端匹配器本地化                                                 | 不复用               | 新作中文为主，匹配器维护成本高                                                | 内核直接发"键 + 参数"的事件                                                                                                |
| 强化学习环境 `headless/`、`obs.ts`                                                | 改造后复用           | 可训练同伴与英雄 AI、做平衡回归                                               | 去掉跳跃动作；动作集改为动态技能栏                                                                                         |
| 平衡方法论与工具                                                                  | 直接复用（方法）     | 三剖面、职业差距带、有趣度测试都通用                                          | 工具脚本按新内核重接                                                                                                       |
| 世界内容替换点 `WorldContent`、`map_doc.ts`、编辑器                               | 仅参考               | 编辑器为 3D                                                                   | 2D 关卡编辑器可借鉴文档校验器思路                                                                                          |

### 8.3 专项：主角"隐藏天赋逐步发掘"能否建在现有天赋系统上

世界观设定（`docs/20_world/world_bible.md` 第 11 节）：主角"无页之身"，公会卡显示 Lv1、无职能；原典天赋「千门」以"门"呈现，门后可能是技能、被动、系统功能或真相碎片；开门的"钥"是经历、物品、羁绊、抉择、地点；部分门互斥，部分门危险；可跨职能习得技能。

结论：**可以，评级为"改造后复用"**。效果层几乎可以原样复用，需要新建的是"门的图结构"和"钥的判定"，而判定引擎可以借用功绩评估器。

| 千门需求                   | 可复用的现有部件                                                                                                                                                                            | 缺口与改造                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 门后效果：技能、被动、数值 | `TalentEffect`（`stats`、`ability`、`global`、`grant`、`proc`）经 `computeTalentModifiers` 展开为 `TalentModifiers`；热路径只读扁平结果                                                     | 增加"系统功能解锁"效果类（识才、伪录、行路、千军、立国等门），在累加函数中合并为功能开关集合                                                        |
| 跨职能习得技能             | `grant` 授予绕过学习等级与专精过滤，且不检查技能所属职业，技术上已允许授予他职业技能                                                                                                        | **资源池单一**：他职业技能会扣主角当前唯一资源。需要为 `AbilityDef` 增加可选的资源声明，或为主角设计专属的多资源模型                                |
| 无职能主角                 | `abilitiesKnownAt` 以职业为参数                                                                                                                                                             | 新增一个"编外者"伪职业，基础套件为空或极简，全部能力来自门；属性成长曲线单独定义                                                                    |
| 开门的钥                   | 功绩的封闭触发词汇（`quest`、`quests`、`visit`、`visits`、`collectItems`、`flag`、`stat`、`meter`、`level`、`meta`、`manual`）与评估器 `updateDeeds`（脏标记、tick 末尾、零 rng、登录追溯） | 新增"羁绊/好感阈值""对话抉择""与特定人物同行"等触发；**不要直接把门挂在 `DEEDS` 表上**，因为 WoC 规定功绩只能给外观奖励，应复制评估器模式另建"钥"表 |
| 互斥门                     | 行内三选一与 `validateAllocation`/`repairAllocation` 的严格校验与修复                                                                                                                       | 从"固定 6 行"泛化为"互斥组"；`TalentAllocation.rows` 改为已开门集合加互斥选择记录                                                                   |
| 危险门（代价）             | 已有负面效果与光环：`selfDamagePctMax`、`heal_absorb`、`cost_tax` 等                                                                                                                        | 需要"永久负面状态"的持久化字段                                                                                                                      |
| 隐藏与逐步揭示             | 功绩的 `hidden` 标志与追溯授予                                                                                                                                                              | "门存在但未知""门已见未开""门已开"三态需要新数据与 UI                                                                                               |
| 线性释放节奏               | 行等级门控、`learnLevel`、法术等级行                                                                                                                                                        | 从"按等级"改为"按钥"，可保留"等级作为钥之一"                                                                                                        |
| 存档与构筑                 | `TalentAllocation` 存于 `PlayerMeta`，经 `serializeCharacter` 持久化；loadout 与构筑字符串                                                                                                  | 门是不可逆进度，不应提供免费重置；loadout 可保留为"已开门之间的取舍预设"                                                                            |
| 门内庭院                   | 无直接对应                                                                                                                                                                                  | 可借副本/地窟的私有实例槽与银行的容器逻辑（`bank.ts` 的 `moveBetweenContainers`）                                                                   |
| 鉴定与伪录                 | 无                                                                                                                                                                                          | 新系统，需要"对外显示状态"与"真实状态"分离的数据层                                                                                                  |

实施上建议保持 WoC 的两条硬约束：**分配时一次性扁平预计算、热路径不遍历门图**；**开门由内核权威判定、可追溯授予**。

### 8.4 专项：RTS 英雄单位与普通兵

**英雄单位：可以直接用现有战斗 sim（改造后复用）。**

- 英雄就是一个完整 `Entity`：职业套件、光环、天赋修正、命中表、仇恨、宠物，现有引擎全部可用，"个人强大是战略层王牌"可以在数值上与 RPG 阶段完全同源。
- 需要的是"英雄 AI 驱动器"：现有先例有三类，可组合参考：
  - 宠物 AI（`pet/pet_ai.ts`）：跟随、协助、模式切换、远程攻击、嘲讽；
  - 地窟同伴（`delves/companion.ts`）：经接缝的治疗型盟友 AI；
  - Fiesta 机器人（`social/fiesta_bots.ts`）：用真实职业技能驱动玩家型实体，但直接操纵 `Sim` 内部，需改写为经接缝的模块。
- 无头环境与 `obs.ts` 可用来训练或回归英雄 AI 策略。
- 需要改造的点：RTS 指令（攻击移动、集火、撤退、技能指令）替代 MMO 的仇恨索敌与拴绳；`MobCombatProfile` 已有 `canLeash: false` 先例。

**普通兵：需要轻量化模型。** 理由：

| 问题         | 现状                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| 实体过重     | `Entity` 接口约 450 行字段，每个单位都携带完整玩家/怪物状态                                                |
| 每 tick 成本 | 每次挥击都走命中表并抽共享 rng；AoE 对每个目标做视线采样（0.5 码步长）；每个怪物有独立仇恨表与光环列表     |
| AI 语义不符  | 怪物 AI 面向"被玩家拉怪"：主动仇恨半径、社交带怪、拴绳回家、逃跑求援，不面向指令与阵型                     |
| 规模未验证   | WoC 的设计规模是"野外几十只怪 + 几十名玩家"，未见数百单位同屏的基准数据（需用 `npm run bench` 类方法实测） |

建议的分层模型（仅为调研建议）：

| 层级       | 承载对象                   | 模型                                                                                                                    | 与战斗 sim 的关系                                                              |
| ---------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A 完整实体 | 主角、英雄、精英单位、首领 | 完整 `Entity` + 英雄 AI 驱动器                                                                                          | 原样使用                                                                       |
| B 兵团     | 普通兵                     | 轻量"兵团"记录：人数、单兵生命、护甲、攻速、伤害带、阵型半径、士气；可低于 20 Hz 结算；用命中表的**期望值**代替逐次掷骰 | 复用纯函数 `armorReduction`、`meleeMissChance`、`spellHitChance`，保证数值同源 |
| C 战略     | SLG 大地图军队             | 抽象战力 + 回合或方程式结算                                                                                             | 不跑实时 sim，只读兵团与英雄的汇总属性                                         |

层间适配：英雄的 AoE 按半径内估计人数对兵团结算；兵团对英雄的伤害仍走 `dealDamage`，以便触发吸收、光环、触发器；控制效果映射为兵团状态（混乱、减速、溃散）。

### 8.5 专项：等级上限从 20 扩展到 60

世界观（`docs/20_world/world_bible.md` 第 10.1 节）把"铭录"等级上限定为 60，并用位阶划分人才金字塔；WoC 的 `MAX_LEVEL = 20`。影响面：

| 受影响处   | 现状                                                                                                   | 需要的改造                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 经验表     | `XP_TABLE` 20 项                                                                                       | 扩展到 60 项（可沿用经典曲线的后续段，或按新节奏重定）                                                                                                                      |
| 技能等级   | 等级行与学习等级只到 20                                                                                | 补 21～60 的等级行与高阶技能                                                                                                                                                |
| 天赋行     | 6 行，5 到 20 级                                                                                       | 重排行等级或改为门系统                                                                                                                                                      |
| 精通       | `min(1, level/20)`                                                                                     | 改为按 60 或按位阶                                                                                                                                                          |
| 物品       | 预算随物品等级线性增长，需求等级回退值写死在 12/18/20                                                  | 预算可直接延伸；回退值与英雄变体来源等级（22）需重定                                                                                                                        |
| 等级差规则 | 高于目标 3 级以上的未命中/抵抗惩罚**饱和**在 +21 个百分点；暴击按每级 -0.2% 衰减；怪物经验按零差带衰减 | 世界观强调"隐藏的更强者"与"凡人不信"，大等级差（如 20 对 50）的手感需要重新设计：饱和规则会让巨大等级差只体现在数值上而不体现在命中上，这可能符合也可能违背设计意图，需决策 |
| 平衡框架   | 满级 20 的职业差距带                                                                                   | 改为多检查点（例如每个位阶边界）                                                                                                                                            |

### 8.6 专项：2D 化

见 1.6 与 1.7。评级：战斗与内容层直接复用；地形、移动、碰撞层改造后复用或重写。关键风险是"世界边界与水体原本由高度场隐式提供"，压平后必须显式补上，否则怪物与玩家会走出边界、钓鱼与游泳会静默失效。

### 8.7 专项：单机化

| 主题     | 建议                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------- |
| 宿主     | 采用 WoC 的离线宿主模式（浏览器或桌面壳内直接运行 `Sim`），不需要权威服务器                     |
| 存档     | 沿用 `serializeCharacter`/`addPlayer({ state })` 路线，扩展到世界状态（城建、领地、NPC 记忆）   |
| 多人内容 | 5 人副本改为"主角 + 同伴"；组队任务改为同伴任务；队伍系统改为同伴编队                           |
| 在线经济 | 世界市场、交易、邮件不复用；NPC 经济由女神 GM 与城建系统驱动                                    |
| 外部 AI  | 保留 `Sim.aiActiveMobAction` 这类"外部意图、内核裁决"的窄接口，作为大模型 GM 干预世界的唯一入口 |

### 8.8 换皮命名与许可

| 主题    | 事实与建议                                                                                                                                                                                                                                                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 技能 id | 内部 id 沿用经典 MMO 惯用英文名（`heroic_strike` 等），显示名已是 WoC 自创名；新作可保留内部 id、全部更换显示名，降低改动面                                                                                                                                      |
| 职能名  | 已在 `docs/20_world/world_bible.md` 中定为中文职能体系（战士、圣骑士、猎人（游侠）、盗贼（暗行者）等）                                                                                                                                                           |
| 族群    | 12 个 `MobFamily` 需映射到《箱庭纪》的种族与魔物分类                                                                                                                                                                                                             |
| 文本    | 新作建议内核只发"键 + 参数"，不走 WoC 的"英文文本 + 客户端正则匹配"路线                                                                                                                                                                                          |
| 许可    | WoC 源码（含 `src/sim/content/` 数据即代码）为 MIT，可商用；媒体资产按 `CREDITS.md` 逐项授权，其中 `public/ui/skills/` 的 CraftPix 职业技能图标**不可再分发**，部分音效为 CC BY-NC，商店与功绩图标等为保留权利的委托美术；"World of ClaudeCraft"名称与标识不授权 |

---

## 9. 复用建议总结

1. 把 `src/sim/` 的确定性内核（20 Hz、`Rng`、`SimEvent`、`SimContext` 接缝）作为《箱庭纪》战斗内核的起点，而不是从零写战斗。
2. 复用方式建议采用"固定提交的拷贝 + 来源记录 + 剪裁"，因为等级上限、无职能主角、资源模型、2D 化都会触及 `types.ts` 与协调器，难以作为外部依赖跟随上游。
3. 拷贝时连同对应测试与金样轨迹一起带走，剪裁每一步都以测试为锚，先删在线系统再改核心。
4. 战斗引擎（施法生命周期、效果分发、光环、控制、伤害、治疗、自动攻击、弹道）与 85 种效果词汇原样复用，作为"复杂技能体系线性释放"的底座。
5. 九职业数据整体保留并换皮为中文职能，内部 id 不改、显示名全换，把改动集中在命名与等级扩展上。
6. 等级上限扩到 60 时，先扩经验表、技能等级行与物品预算，再专门评审"大等级差饱和规则"是否符合"隐藏更强者"的设计意图。
7. "千门回廊"建在天赋效果层上：门的载荷用 `TalentEffect`，结果用 `TalentModifiers` 扁平预计算，触发器用 `ProcDef`。
8. "钥"的判定复制功绩评估器模式（封闭触发词汇、脏标记、tick 末尾、零 rng、登录追溯），另建表，不与外观成就混用。
9. 为跨职能习得补上资源模型：给 `AbilityDef` 增加可选资源声明，或为主角设计专属资源，否则他职业技能会扣错资源。
10. 新增"编外者"伪职业承载无职能主角，基础套件为空，全部能力来自门；NPC 与同伴继续使用九职能与专精加行天赋。
11. 2D 化只动地形、水体、边界、玩家垂直运动、碰撞表示五处，并显式补上原本由陡坡提供的边界墙与水体判定。
12. 保留圆形与 OBB 连续碰撞作为 2D 第一版碰撞方案，瓦片化只在关卡管线确定后再做；视线只需替换 `lineOfSightClear`。
13. 怪物模板与约 70 个机制词缀直接复用，首领优先用纯数据编写，只有剧情型首领才写脚本（参照 `encounters/nythraxis.ts` 的阶段机）。
14. 地窟（delves）作为单机"迷宫"系统的骨架：小队、同伴、随机模块、词缀、档位、开锁小游戏都已具备。
15. 同伴与英雄 AI 以 `pet/pet_ai.ts` 与 `delves/companion.ts` 为基础、以 `social/fiesta_bots.ts` 为参考，写成经接缝的独立模块，并用无头环境训练和回归。
16. RTS 采用三层模型：英雄与精英用完整实体，普通兵用轻量兵团（期望值命中、复用纯公式），SLG 用抽象结算；兵团规模上线前先做基准测试。
17. 专业、采集点与工站映射为城建的资源点与建筑，把"个人背包经济"扩展为"领地库存经济"，配方与杰作机制保留。
18. 任务引擎直接复用并补对话抉择、护送、建造、声望等目标类型；沿用 WoC 的任务经验预算方法（单任务不超过当级 25%、副本不做经验农场）。
19. PvP、世界市场、交易、邮件、公会等在线系统不复用；`Sim.aiActiveMobAction` 这类"外部意图、内核裁决"的窄接口保留给大模型 GM。
20. 沿用 WoC 的平衡方法论（三剖面、职业差距 10%～15%、有趣度测试、行职能纪律、"无公式不调数"），并只使用 MIT 许可的代码与 CC0 类资产，避开 CraftPix 图标等受限资产。

---

## 附录 A：文档与源码不一致清单

| 文档                                                     | 过时内容                                                                                            | 源码现状                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/sim/content/CLAUDE.md` 的天赋章节                   | 节点树、`row`/`col`/`pointsGate`、passive/active/choice 节点                                        | 专精 + 六行三选一，节点系统已删除                                                       |
| `docs/design/current-game-design.zh_CN.md`（2026-06-20） | 天赋 10 级起、每职业 26 节点、20 级 11 点；任务 89、怪物 104、物品 319、营地 79；Nythraxis 为半完成 | 天赋见第 4 节；任务约 96、怪物约 118、手写物品约 615、营地约 67；Nythraxis 已有完整团本 |
| 同上                                                     | 各职业"技能数"列（战士 16 等）                                                                      | 当前战士约 51、法师约 61 等（含行授予技能）                                             |
| `docs/design/spell-ranks.md`                             | 部分数值（如战吼为平值攻强、120 秒）                                                                | 战吼已改为团队 10% 攻强、1800 秒等                                                      |
| `src/sim/spell_scaling.ts` 头部注释                      | 施法时间夹在 1.5～7                                                                                 | 实际常量 `SPELL_COEFF_MAX_CAST = 3.5`                                                   |
| 职业印象                                                 | 法师奥术为输出专精                                                                                  | `arcane` id 现为治疗专精 Chronomancy                                                    |
| 职业印象                                                 | 德鲁伊野性为猫输出                                                                                  | `feral` 为坦克专精，猫形态显示名为 Wolf Form                                            |
| 物品注释                                                 | 提到 plate                                                                                          | `armorType` 只有 cloth、leather、mail                                                   |

## 附录 B：关键源码索引

| 主题         | 路径与符号                                                                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 内核协调器   | `src/sim/sim.ts`（`Sim`、`tick`、`buildSimContext`、`serializeCharacter`、`addPlayer`）                                                                                                                                                    |
| 接缝         | `src/sim/sim_context.ts`（`SimContext`）                                                                                                                                                                                                   |
| 类型与公式   | `src/sim/types.ts`（`Entity`、`AbilityDef`、`AbilityEffect`、`Aura`、`AuraKind`、`MobTemplate`、`QuestDef`、`DeedDef`、`WorldContent`、`XP_TABLE`、`mobXpValue`、`armorReduction`、`meleeMissChance`、`spellHitChance`、`rageConversion`） |
| 派生属性     | `src/sim/entity.ts`（`recalcPlayerStats`、`createMob`）                                                                                                                                                                                    |
| 数据合并     | `src/sim/data.ts`（`MOBS`、`QUESTS`、`ITEMS`、`DUNGEONS`、`CAMPS`、`GROUP_XP_BONUS`、`setActiveWorldContent`）                                                                                                                             |
| 职业与技能   | `src/sim/content/classes.ts`（`CLASSES`、`ABILITIES`、`abilitiesKnownAt`、`applyTalentMods`）                                                                                                                                              |
| 天赋         | `src/sim/content/talents.ts`（`TALENTS`、`TalentEffect`、`TalentModifiers`、`computeTalentModifiers`）、`src/sim/content/talent_rows.ts`（`ROW_LEVELS`、`ROW_TREES`）                                                                      |
| 法术系数     | `src/sim/spell_scaling.ts`                                                                                                                                                                                                                 |
| 仇恨         | `src/sim/threat.ts`                                                                                                                                                                                                                        |
| 怪物 AI      | `src/sim/mob/`、`src/sim/mob_combat.ts`                                                                                                                                                                                                    |
| 首领         | `src/sim/encounters/nythraxis.ts`、`src/sim/world_boss.ts`、`src/sim/delves/drowned_litany_boss.ts`                                                                                                                                        |
| 宠物与同伴   | `src/sim/pet/pet_ai.ts`、`src/sim/delves/companion.ts`、`src/sim/social/fiesta_bots.ts`                                                                                                                                                    |
| 功绩         | `src/sim/content/deeds.ts`、`src/sim/deeds.ts`、`docs/design/deeds.md`                                                                                                                                                                     |
| 2D 相关      | `src/sim/world.ts`、`src/sim/colliders.ts`（`lineOfSightClear`、`resolvePosition`）、`src/sim/pathfind.ts`（`findPath`）、`src/sim/spatial.ts`、`src/sim/player_motion.ts`                                                                 |
| 观测与无头   | `src/sim/obs.ts`、`headless/env_server.ts`                                                                                                                                                                                                 |
| 外部 AI 接口 | `src/sim/types.ts`（`AiActiveMobActionRequest`、`AiActiveNpcActionRequest`）、`server/ai/active_triggers.ts`                                                                                                                               |
| 设计规则     | `docs/design/class-design-rules.md`、`docs/design/spell-balance-framework.md`                                                                                                                                                              |
