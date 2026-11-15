# 复用映射（Reuse Map）

> 归属：`docs/50_tech/`（技术方案，正典优先级第 5 级）。与 `../20_world/`、`../00_vision/` 冲突时以后者为准，并回头修订本文。
> 作用：回答《箱庭纪》的每个系统"从哪里来、怎么拿、拿多少、哪些绝不能拿"。
> 约束：`../00_vision/decision_log.md` 的 D-003（场景视觉沿用 my_ai_town 的 HD-2D 方案）、D-004（战斗复用确定性 sim，在格子平面上计算）、D-005（等级上限 60）、D-006（九职能换皮，编外者伪职业）、
> D-015（主工程商标名、不可再分发图标、非商用音效不进入本作）、D-017（my_ai_town 只借鉴方法）、D-018（素材程序化优先），以及未决问题 Q-001（代码组织）。
> 核对基线：主工程 `main` 分支提交 `cd961d3210`（与调研同一基线）。引用代码只写稳定路径与导出符号，不写行号；数量均为近似，以源码为准。
> 姊妹文档：场景表现与素材方案见 [art_pipeline.md](art_pipeline.md)；AI 运行时见 [ai_architecture.md](ai_architecture.md)；
> 城建、RTS 的玩法细节见 [city_building.md](../40_design/systems/city_building.md)、[warfare_rts.md](../40_design/systems/warfare_rts.md)；
> 战斗、千门见 `../40_design/systems/combat_and_classes.md`、`../40_design/systems/thousand_doors.md`（待撰写）。
> 标注约定：【待决策 R-xx】表示需要上层拍板的技术取舍，本文只给选项、比较与推荐。

## 0. 一页结论

1. **三类来源，三种权利。** 主工程 world-of-claudecraft（下称 WoC）的源码是 MIT，可拷贝改造；my_ai_town 是 PolyForm Noncommercial，
   只借结构与方法，代码、像素、图标、音乐、地图数据、提示词原文一样不拿；open-share 是资料库，只取方法，其中索引的开源项目许可另行核验。
2. **战斗内核整体带走。** 20 Hz 确定性 tick、`Rng`、`SimEvent`、`SimContext` 接缝、`src/sim/combat/` 战斗引擎、全套技能效果词汇（`AbilityEffect`）、
   光环类型（`AuraKind`）、仇恨、法术系数、怪物模板与词缀、宠物、任务引擎，都是"直接复用"。
3. **改造集中在六件事：** 格子平面化五处（地形、边界、水体、垂直运动、碰撞表示）；等级 20 到 60；多资源模型；编外者伪职业；
   门效果建在天赋效果层（`TalentEffect`、`TalentModifiers`、`ProcDef`）；钥的判定复制功绩评估器模式另建表。
4. **在线多人整体丢弃：** 世界市场、邮件、交易、聊天频道、竞技场、PvP 评级、Fiesta、Vale Cup、Protect Yumi、Card Duel、地下城查找器、
   监狱与审核、Discord 与持有者等级等。3D 渲染器、地形高度场与体素不带。
5. **表现层只带方法与纯核心。** WoC 的渲染器与 HUD 不复用；少数 DOM 无关的纯核心（浮动战斗文字描述、施法条状态、仇恨牌判定、光环分类）
   可改造后复用；"纯核心 + 薄绘制器"、写入省略、画质档与公平性原则照搬。HD-2D 场景沿用 my_ai_town 的方案与做法（D-003），
   代码在本作内自行实现；渲染依赖 `three` 与 WoC 同版本。
6. **代码组织（Q-001）推荐：** 实现期用独立仓库，按固定提交拷贝 WoC 的 `src/sim/` 并附来源记录与上游同步脚本；
   不推荐直接引用主工程源码，因为 `types.ts` 与协调器必然被改。【待决策 R-01】
7. **工程原则大部分照搬：** 确定性、模块优先、接缝、测试密度、分层 QA 门、依赖极少、图形设置公平、生成文件不手改、文档锚点规则。
   需要调整的是 i18n（内核改发"键 + 参数"）与接缝形态（单机加回放两份世界实现，另加一条 AI 意图接缝）。
8. **绝不进入本作：** WoC 与 my_ai_town 的名称和标识；my_ai_town 的全部代码与素材；WoC 的 CraftPix 技能图标、保留权利的委托与生成美术、
   CC BY-NC 音效、"仅随本项目"类素材；WoC 自有的专有名词（区域、首领、技能与专精显示名）。

---

## 1. 来源、许可与复用方式

### 1.1 三类来源

| 来源                        | 位置                                                           | 许可                                                                                                                      | 本作可做到的最大程度                                                                                                                           | 调研依据                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| world-of-claudecraft（WoC） | `F:\workspace\github\world-of-claudecraft`，以 `src/sim/` 为主 | 源码（含 `src/sim/content/` 数据即代码）MIT，版权人 Levy Street；媒体资产逐项以 `CREDITS.md` 为准，未登记的媒体默认不授权 | 代码：拷贝、改造、商用，须随附 MIT 许可文本与版权声明；素材：只限 `CREDITS.md` 中可自由再分发且非"仅随本项目"的项（实际几乎用不上，见第 6 节） | [combat_and_content_inventory.md](../10_research/woc_reuse/combat_and_content_inventory.md)                                                                     |
| my_ai_town                  | `F:\workspace\github\my_ai_town`（只读）                       | 代码与原创文档 PolyForm Noncommercial 1.0.0；美术、图标仅随该项目及其非商业衍生分发（`licenses/ASSETS.txt`）              | 只借鉴结构、流程、规则与审美目标，全部自行实现                                                                                                 | [my_ai_town_visual_and_client.md](../10_research/art_style/my_ai_town_visual_and_client.md)、[my_ai_town_agents.md](../10_research/ai_npc/my_ai_town_agents.md) |
| open-share 资料库           | `F:\workspace\open-share`（只读）                              | 笔记、整理稿与脚本；其中索引的开源项目许可未审计（含 GPL 等传染性许可）                                                   | 只取方法与数据合同思路；任何开源项目代码进入本作前单独核验许可                                                                                 | [city_rts_slg.md](../10_research/open_share/city_rts_slg.md)、[game_dev_methodology.md](../10_research/open_share/game_dev_methodology.md)                      |

### 1.2 复用方式定义

| 方式       | 含义                                                      | 适用来源                          |
| ---------- | --------------------------------------------------------- | --------------------------------- |
| 直接复用   | 代码或数据结构原样带走，只改命名、配置与入口              | 仅 WoC                            |
| 改造后复用 | 主体带走，按格子平面、单机、60 级、编外者、城建与 RTS 接口改造 | 仅 WoC                            |
| 仅借鉴方法 | 借结构、流程、规则与审美目标，代码与数据自行编写          | 三类均可；my_ai_town 最多到这一级 |
| 不复用     | 与方向不符或许可不允许                                    |                                   |
| 新做       | 三类来源都没有                                            |                                   |

---

## 2. 复用总表

按本作系统组织（系统地图见 `../40_design/game_framework.md` 第 5 节）。"许可状态"列：
**MIT** 表示可拷贝，须随附许可文本；**方法** 表示只借思路、无许可负担；**方法（禁拷）** 表示原作非商用许可，连代码片段与素材都不得拷贝。

### 2.1 内核与战斗

| 本作系统                                                                           | 来源                                                                                                                           | 复用方式                                          | 改造要点                                                                                                               | 主要风险                                            | 许可状态 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------- |
| 确定性内核（`TICK_RATE`、`DT`、`Rng`、`SimEvent`）                                 | WoC `src/sim/types.ts`、`src/sim/rng.ts`                                                                                       | 直接复用                                          | 无；AI 意图与玩家命令一样作为外部输入记入输入日志，回放时不再调模型                                                    | 新系统误用墙钟或 `Math.random`                      | MIT      |
| 系统模块范式与 `SimContext` 接缝                                                   | WoC `src/sim/sim_context.ts`、`src/sim/CLAUDE.md`                                                                              | 直接复用                                          | 城建、RTS、千门、钥、认知与传闻、女神规则执行者各建模块挂到接缝                                                        | 协调器重新膨胀                                      | MIT      |
| 协调器 `Sim`                                                                       | WoC `src/sim/sim.ts`                                                                                                           | 改造后复用                                        | 剪除在线阶段与委托，按 3.11 的顺序剪裁，阶段删除后重录金样轨迹【待决策 R-05】                                          | 剪裁改变 rng 抽取顺序，旧金样作废                   | MIT      |
| 战斗引擎（施法生命周期、效果分发、光环、控制、伤害、治疗、自动攻击、触发器、弹道） | WoC `src/sim/combat/`、`src/sim/projectile_travel.ts`                                                                          | 直接复用                                          | 资源扣除入口随多资源模型调整（3.7）                                                                                    | 多资源改动触及 `combat/casting_lifecycle.ts` 热路径 | MIT      |
| 技能效果与光环词汇                                                                 | WoC `AbilityEffect`、`AuraKind`（`types.ts`），分类叶子 `aura_classify.ts`                                                     | 直接复用                                          | 删 Vale Cup 专用效果；城建与 RTS 新效果（鼓舞兵团、建造加速等）按同一模式追加                                          | 效果分发 switch 继续增长                            | MIT      |
| 战斗公式                                                                           | WoC `types.ts`（`armorReduction`、`meleeMissChance`、`spellHitChance`、`rageConversion` 等）、`spell_scaling.ts`、`stun_dr.ts` | 直接复用                                          | 经验相关扩到 60（3.6）；大等级差饱和规则另议（Q-003）                                                                  | 饱和规则与"隐藏更强者"的手感冲突                    | MIT      |
| 仇恨                                                                               | WoC `src/sim/threat.ts`                                                                                                        | 直接复用（RPG 部分）                              | RTS 兵团不走仇恨制索敌                                                                                                 | 无                                                  | MIT      |
| 空间网格与平面几何                                                                 | WoC `spatial.ts`（`SpatialGrid`）、`geometry2d.ts`                                                                             | 直接复用                                          | 无                                                                                                                     | 无                                                  | MIT      |
| 碰撞、视线、寻路                                                                   | WoC `colliders.ts`（`resolvePosition`、`lineOfSightClear`）、`physics/`、`pathfind.ts`（`findPath`）                           | 改造后复用                                        | 去高度字段；第一版保留圆形与 OBB 连续碰撞【待决策 R-03】；RTS 群体寻路另做                                             | 视线与渲染遮挡不一致                                | MIT      |
| 玩家移动与操作                                                                     | WoC `player_motion.ts`（`stepPlayerMotion`）、`move_input.ts`（`sanitizeMoveInput`）                                           | 改造后复用                                        | 关闭垂直分支；`MoveInput` 现为坦克式（前后、转向、平移、跳跃），需加"方向向量"输入模式或施法自动面向目标（对应 Q-002） | 操作手感                                            | MIT      |
| 地形、水体、体素                                                                   | WoC `world.ts`、`voxel.ts`、`voxel_mesh.ts`、`content/tunnels.ts`                                                              | `world.ts` 改造后复用（常数高度开关）；体素不复用 | 格子地图与水体由本作地图文档提供                                                                                        | 原由陡坡提供的边界与隔断丢失（3.5）                 | MIT      |
| 战斗表现（HD-2D 场景）                                                             | 无（WoC 是 3D 模型场景，my_ai_town 无战斗）                                                                                    | 新做                                              | 见 [art_pipeline.md](art_pipeline.md) 第 4 节                                                                    | 可读性                                              | 不适用   |

### 2.2 职能、成长与内容

| 本作系统                                  | 来源                                                                                                                                                                 | 复用方式                                   | 改造要点                                                                                                              | 主要风险                                   | 许可状态                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------- |
| 九职能（NPC、同伴、英雄）                 | WoC `src/sim/content/classes.ts`（`CLASSES`、`ABILITIES`、`abilitiesKnownAt`、`applyTalentMods`）                                                                    | 改造后复用                                 | 内部 id 保留，显示名全部换成本作中文职能与技能名；等级行扩到 60【待决策 R-09：内部 id 是否改名】                      | 显示名残留 WoC 专有名词                    | MIT                          |
| 专精与六行天赋（有职能的角色）            | WoC `content/talents.ts`、`talent_rows.ts`（`ROW_LEVELS`、`ROW_TREES`）、`choice_rows_classic.ts`、`warrior_rows.ts`、`spec_baselines.ts`、`talent_abilities_v2*.ts` | 改造后复用                                 | 行等级随 60 级重排；精通 `min(1, level/20)` 改为按 60 或按位阶；行设计纪律（`docs/design/class-design-rules.md`）照搬 | 行数与位阶节奏不匹配                       | MIT                          |
| 编外者伪职业                              | 无对应；挂在 `CLASSES` 体系上                                                                                                                                        | 新做（在 WoC 结构上）                      | 见 3.8                                                                                                                | 跨职能技能扣错资源                         | MIT（宿主结构）              |
| 千门回廊（门效果）                        | WoC `TalentEffect`、`TalentModifiers`、`computeTalentModifiers`、`ProcDef`、`combat/talent_procs.ts`                                                                 | 改造后复用                                 | 门图结构、互斥组、危险门、系统功能解锁效果类；热路径只读扁平结果（3.9）                                               | 门图被逐 tick 遍历                         | MIT                          |
| 钥的判定                                  | WoC 功绩评估器 `src/sim/deeds.ts`（`updateDeeds`）与封闭触发词汇 `DeedTrigger`                                                                                       | 改造后复用（复制模式，另建表）             | 不挂在 `DEEDS` 上（WoC 规定功绩只给外观奖励）；新增羁绊阈值、对话抉择、同行者、目击人数等触发                         | 两张表语义混淆                             | MIT                          |
| 功绩与称号（莫伊拉的铭录称号）            | WoC `content/deeds.ts`、`deeds.ts`、`docs/design/deeds.md`                                                                                                           | 改造后复用                                 | 机制保留、数据重写；坚持"只给外观与称号，不给战力"                                                                    | 无                                         | MIT                          |
| 成长与经验                                | WoC `progression/xp.ts`、`XP_TABLE`、`mobXpValue`、`zeroDiff`                                                                                                        | 改造后复用                                 | 扩到 60（3.6）；休息经验改挂旅店与门内庭院                                                                            | 节奏                                       | MIT                          |
| 怪物模板与机制词缀                        | WoC `MobTemplate`（`types.ts`）、`mob/` 各模块、`mob_combat.ts`                                                                                                      | 直接复用（机制）；数据仅参考               | 族群 `MobFamily` 映射到本作魔物与亡灵分类（澱的显化）；首领优先纯数据编写                                             | 换皮后仍像 WoC 怪物                        | MIT                          |
| 怪物 AI（索敌、拴绳、社交仇恨、逃跑求援） | WoC `mob/targeting.ts`、`mob/locomotion.ts`、`mob/social_aggro.ts`、`flee_speed.ts`                                                                                  | 改造后复用                                 | RPG 野外与迷宫沿用；RTS 单位用 `canLeash: false` 一类档案或指令驱动                                                   | 拴绳逻辑误入战场                           | MIT                          |
| 首领脚本                                  | WoC `encounters/nythraxis.ts`、`delves/drowned_litany_boss.ts`                                                                                                       | 仅借鉴方法                                 | 阶段机、过场、打断引导的写法参考；首领按本作剧情重写                                                                  | 照抄机制显得似曾相识                       | MIT                          |
| 女神降灾首领（世界事件）                  | WoC `world_boss.ts`                                                                                                                                                  | 改造后复用                                 | 去多人贡献者与每日锁定，改由女神 GM 事件触发                                                                          | 无                                         | MIT                          |
| 宠物、召唤、随从                          | WoC `pet/pet_ai.ts`、`pet/pet_commands.ts`、`content/warlock_pets.ts`、`content/mage_pets.ts`                                                                        | 直接复用                                   | 兼作 RTS 召唤物与随从的底座                                                                                           | 无                                         | MIT                          |
| 同伴 AI 与队伍                            | WoC `delves/companion.ts`（`updateDelveCompanion`）、`social/party.ts`、`social/fiesta_bots.ts`                                                                      | 改造后复用（同伴、编队）；仅借鉴（机器人） | 同伴扩到多职能、可编队；英雄 AI 驱动器写成经接缝的新模块，参考 Fiesta 机器人"用真实职业技能驱动实体"的思路            | Fiesta 机器人直接操纵 `Sim` 内部，不能照搬 | MIT                          |
| 任务与事件                                | WoC `quests/quest_credit.ts`、`quests/quest_commands.ts`、`QuestDef`                                                                                                 | 直接复用                                   | 增加对话抉择、护送、建造、声望、传闻核实等目标类型；沿用"单任务不超过当级 25%"的经验预算                              | 无                                         | MIT                          |
| 迷宫与地窟                                | WoC `delves/runs.ts`、`delves/lockpick_controller.ts`、`lockpick.ts`、`instances/dungeons.ts`、`instances/difficulty.ts`、`content/dungeon_difficulty.ts`            | 改造后复用                                 | 5 人副本改为"主角 + 同伴"规模并重调；地窟作为"迷宫"（澱的结晶）骨架                                                   | 数值重调量大                               | MIT                          |
| 物品、装备、套装、附魔                    | WoC `items.ts`、`item_level.ts`、`item_budget.ts`、`item_level_req.ts`、`equipment_rules.ts`、`content/item_sets.ts`、`content/enchants.ts`                          | 改造后复用（机制）；数据重做               | 预算随 60 级延伸；按需补槽位与弓弩类武器                                                                              | 回退等级写死在 12/18/20                    | MIT                          |
| 拾取                                      | WoC `loot/loot_roll.ts`（`rollLoot`）                                                                                                                                | 改造后复用                                 | 去队伍分配策略；`loot/loot_ffa.ts` 丢弃                                                                               | 无                                         | MIT                          |
| 死亡与复苏（退回门内）                    | WoC `spirit.ts`、`resurrection.ts`                                                                                                                                   | 改造后复用                                 | 灵魂跑尸改为"退回门内庭院复苏"，代价按 `../40_design/game_framework.md` 第 12 节                                      | 无                                         | MIT                          |
| 背包与仓库（门内庭院仓库）                | WoC `bags.ts`、`bank.ts`（`moveBetweenContainers`）                                                                                                                  | 改造后复用                                 | 银行改为门内庭院的仓库，扩展为领地库存                                                                                | 无                                         | MIT                          |
| 具体内容数据（区域、NPC、任务、物品表）   | WoC `content/zone1.ts` 到 `zone3.ts`、`content/items.ts` 等                                                                                                          | 仅借鉴方法                                 | 结构、节奏、经验预算复用；名称、文本、地名全部重写                                                                    | 专有名词残留                               | MIT（但见第 6 节的名称限制） |

### 2.3 AI、社会与神域

本节只列复用来源与方式，架构设计归 [ai_architecture.md](ai_architecture.md)。依据见 [comparison_and_plan.md](../10_research/ai_npc/comparison_and_plan.md)。

| 本作系统                                                         | 来源                                                                                                                     | 复用方式                                    | 改造要点                                                    | 主要风险                               | 许可状态           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------- | -------------------------------------- | ------------------ |
| NPC 居民内核（持续会话、回执闭环、懒唤醒、动作版本号判过时）     | my_ai_town 的居民 Agent                                                                                                  | 仅借鉴方法                                  | 自行实现；接入五档分级推理（D-009）                         | 照着源码"翻译"等同拷贝                 | 方法（禁拷）       |
| 记忆与认知纪律（亲见、转述、推断，带可信度；两次独立经历才支持） | my_ai_town                                                                                                               | 仅借鉴方法                                  | 加"常识上限"与"信念跃迁阈值"，即"凡人不信"引擎              | 同上                                   | 方法（禁拷）       |
| 决策契约、意图白名单、目标校验                                   | WoC `server/ai/ai_types.ts`（`AiJobContextV1`、`AiDecisionV1`）、`server/ai/intent_validator.ts`（`validateAiDecision`） | 改造后复用                                  | 按角色（女神、首领、NPC）扩展意图集合；拒绝原因写回会话     | 原实现绑在 `GameServer` 上             | MIT                |
| 正典守卫                                                         | WoC `server/ai/canon_guard.ts`                                                                                           | 改造后复用（主体分级部分）                  | 子串黑名单不带，改为结构化正典事实库加知识层级可见性        | 黑名单误杀                             | MIT                |
| 口吻控制                                                         | WoC `server/ai/speech_style.ts` 等                                                                                       | 仅借鉴方法                                  | 女神与主要角色的说话指纹按 `../30_story/characters.md` 重写 | 无                                     | MIT                |
| 审计与回放                                                       | WoC `server/ai_audit.ts`；my_ai_town 的轨迹日志与录像重演                                                                | 改造后复用（WoC）；仅借鉴方法（my_ai_town） | 每个 AI 决策可回放，供"造主"复核                            | 无                                     | MIT / 方法（禁拷） |
| 外部 AI 驱动实体的窄接口                                         | WoC `Sim.aiActiveMobAction`、`AiActiveMobActionRequest`、`AiActiveNpcActionRequest`（`types.ts`）                        | 改造后复用                                  | 作为女神 GM 与 NPC 意图进入内核的唯一入口，扩展意图种类     | 意图绕过校验直写状态                   | MIT                |
| 群体本能与个体性                                                 | WoC `server/ai/family_semantics.ts`（`FAMILY_SEMANTICS`）、`individualProfileFor`                                        | 仅借鉴方法                                  | 作为 L4 群众与魔物的廉价群体人格                            | 无                                     | MIT                |
| 女神 GM（规则执行者 + 人格会话）                                 | my_ai_town 的"法官状态机 + 智子"思路；WoC `AiWorldDirectorProposal` 字段形状                                             | 仅借鉴方法                                  | 规则执行者确定性、数据驱动；修正项注册进内核（D-013）       | 无                                     | 方法               |
| 统治者与势力首领决策管线                                         | open-share 策略 AI 资料（感知摘要、枚举意图、P0 到 P4 权限、HTN/Utility 兜底）                                           | 仅借鉴方法                                  | 自行实现                                                    | 资料中 HTN、Utility 为补充内容，待核实 | 方法               |
| 认知、传闻、声望                                                 | 无直接来源                                                                                                               | 新做                                        | 传闻作为一等数据对象（来源、可信度、失真度、传播路径）      | 无                                     | 不适用             |

### 2.4 经营、战争与战略

| 本作系统                                                                      | 来源                                                                                          | 复用方式                             | 改造要点                                                                                                 | 主要风险                 | 许可状态     |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------ | ------------ |
| 地图文档三层（逻辑、空间、外观）                                              | my_ai_town 地图文档与生成器                                                                   | 仅借鉴方法                           | 自定义文档格式；外观层（风格包、建筑外观、装饰）只有渲染器读，画风与玩法语义分离                                                                       | 无                       | 方法（禁拷） |
| 统一校验器（手写、生成、玩家摆放、AI 规划都过同一校验，输出机器码加人话原因） | my_ai_town 校验器思路；WoC `map_doc.ts`（自定义地图文档与校验）                               | 仅借鉴方法                           | 自行实现；原因码与画面证据见 art_pipeline.md 第 5.5 节                                                  | 无                       | 方法         |
| 建筑与设施数据合同（容量、供能、生产队列、升级事务、维护欠缴三段）            | open-share 修仙 GDD 的洞府设施规格                                                            | 仅借鉴方法                           | 数值为 design_only，只取结构                                                                             | 数值未验证               | 方法         |
| 资源点与工站、配方                                                            | WoC `professions/`、`content/gather_nodes.ts`、`content/recipes.ts`、`content/professions.ts` | 改造后复用                           | 从"个人背包经济"扩展到"领地库存经济"；采集点与工站映射为城建资源点与建筑                                 | 专业系统体量大，按需裁剪 | MIT          |
| 经济与物价                                                                    | open-share 经济资料（供给链审计、通胀监控、价格分解）                                         | 仅借鉴方法                           | 女神调价走注册修正项（D-013）                                                                            | 无                       | 方法         |
| RTS 英雄单位                                                                  | WoC 完整 `Entity` + 战斗引擎                                                                  | 改造后复用                           | 指令驱动替代仇恨索敌与拴绳                                                                               | 单位过重                 | MIT          |
| RTS 兵团（轻量单位）                                                          | open-share RTS 资料（稳定 ID、邻居网格分桶、状态压缩、迷雾只算可见区）；WoC 纯公式            | 仅借鉴方法（结构）；直接复用（公式） | 兵团用命中表期望值结算，复用 `armorReduction`、`meleeMissChance`、`spellHitChance` 保证数值同源（D-012） | 规模未经基准验证         | 方法 / MIT   |
| 寻路与群体移动                                                                | open-share（HPA*、流场、局部避让为补充内容）                                                  | 仅借鉴方法                           | 英雄用网格 A*，大军用流场                                                                                | 资料中为补充，待核实     | 方法         |
| SLG 大地图                                                                    | open-share（固定层级渲染、实例化、地形分块）                                                  | 仅借鉴方法                           | 自行实现                                                                                                 | 无                       | 方法         |
| 开源 RTS、城建、SLG 项目代码                                                  | open-share 索引的 0 A.D.、OpenRA、Widelands 等 40 个仓库（[逐项许可](../10_research/open_source/README.md)第 4 节） | 不复用（代码）；CorsixTH、Tanks of Freedom（MIT）与 Unciv（MPL-2.0 文件级）可借代码 | 只可读设计；移植公式改用命名随机流并先写黄金样例测试 | GPL 等许可传染 | 已核验 |

### 2.5 表现层与客户端

| 本作系统                                                                  | 来源                                                                                                                                                                                                    | 复用方式                                         | 改造要点                                                                                                | 主要风险                      | 许可状态     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------ |
| 3D 渲染器                                                                 | WoC `src/render/`                                                                                                                                                                                       | 不复用（代码）；仅借鉴方法                       | 画质档 `gfx.ts` 的思路、自适应预算 `render_budget.ts` 的思路、纯核心登记 `RENDER_PURE_CORES` 的做法照搬；`three` 与 WoC 同版本 | 无                            | MIT          |
| HUD 框架                                                                  | WoC `src/ui/hud.ts` 及窗口                                                                                                                                                                              | 不复用（代码）；仅借鉴方法                       | "纯视图核心 + 薄绘制器"、`PainterHost` 写入省略、焦点管理、无障碍契约照搬                               | 无                            | MIT          |
| 战斗表现纯核心                                                            | WoC `src/ui/fct_core.ts`（`describeFct`）、`src/render/cast_bar.ts`（`castBarState`）、`src/render/nameplate_threat.ts`（`isMobThreateningViewer`）、`src/ui/auras_view.ts`、`src/sim/aura_classify.ts` | 改造后复用                                       | 去 3D 投影假设；颜色只出类别令牌；新增门、钥、声望等浮字类别                                            | 依赖 WoC 的 `Entity` 字段形状 | MIT          |
| 程序化图标                                                                | WoC `src/ui/icons.ts`（`iconDataUrl`、`IconRecipe`）                                                                                                                                                    | 改造后复用（仅程序化配方部分，作为缺图时的占位） | 不带 `ABILITY_IMAGE_IDS` 指向的 CraftPix 图片                                                           | 误把图片清单一起带走          | MIT          |
| i18n 框架与格式化                                                         | WoC `src/ui/i18n.ts`（`t`、`formatNumber`、`formatMoney`、`formatDateTime`）、`src/ui/i18n.catalog/` 的分域目录结构                                                                                     | 改造后复用                                       | 源语言改为中文；内核发"键 + 参数"，不走英文正则匹配器 `src/ui/sim_i18n.ts`【待决策 R-04】               | 匹配器维护成本                | MIT          |
| HD-2D 场景（正交斜俯视相机、像素贴图地面与立体房屋、立牌深度规则、光照图与太阳阴影、抖动过渡、调色、泛光、移轴、掀顶溶解） | my_ai_town `frontend/town-2d/src/map/hd2d/`                                                                                                                                                             | 仅借鉴方法                                       | 按同一做法在本作内自行实现（Three.js 三维场景）；见 [art_pipeline.md](art_pipeline.md) 第 1、2 节                                                        | 照着源码改写等同拷贝          | 方法（禁拷） |
| 参数化纸娃娃                                                              | my_ai_town `VillagerLook`、字母格模板思路                                                                                                                                                               | 仅借鉴方法                                       | 自建部件库与体型模板，扩战斗动作与魔物体型；见 [art_pipeline.md](art_pipeline.md) 第 3 节                                                              | 同上                          | 方法（禁拷） |
| 风格包                                                                    | my_ai_town `MapTheme`、`STYLE_PRESETS` 的思路                                                                                                                                                           | 仅借鉴方法                                       | 每个地域一份风格包（地块色阶、建筑外观候选、树形、光照与胶片调色），程序化模板与渲染调色读同一份；见 [art_pipeline.md](art_pipeline.md) 第 1.4 节                                                      | 同上                          | 方法（禁拷） |
| 程序化素材（"模型挑参数，代码出像素"） | my_ai_town 的逐像素绘制与积木建筑思路 | 仅借鉴方法 | 场景素材全部由本作代码模板在运行时绘制，不加载 GLB；见 [art_pipeline.md](art_pipeline.md) 第 6 节 | 照着源码改写等同拷贝 | 方法（禁拷） |
| AI 行为的画面映射（心声、发言卡、动态列表、头顶符号）                     | my_ai_town `town-shared/src/` 的 UI 映射                                                                                                                                                                | 仅借鉴方法                                       | 自行设计；女神神谕、神之视线、传闻为新增                                                                | 同上                          | 方法（禁拷） |
| 录像重演与素材工厂                                                        | my_ai_town 录像与导演脚本                                                                                                                                                                               | 仅借鉴方法                                       | 基于本作输入日志与回放世界实现                                                                          | 无                            | 方法（禁拷） |
| 像素画面的 3D 结构技巧                                                    | open-share《山海旅人2》演讲整理                                                                                                                                                                         | 仅借鉴方法                                       | 像素对齐、世界空间像素化、贴花层、深度用法                                                              | 无                            | 方法         |
| 光照图、遮挡与迷雾                                                        | open-share Unite 2024 URP 2D 光影资料                                                                                                                                                                   | 仅借鉴方法                                       | 室内外光照图、遮挡、迷雾 RT                                                                             | 无                            | 方法         |
| 桌面壳                                                                    | WoC `electron/` 与 `docs/desktop-release.md`                                                                                                                                                            | 改造后复用                                       | 去 WoC 品牌与商店特定逻辑                                                                               | 品牌残留                      | MIT          |
| 单文件离线版                                                              | 本仓库工作区未提交的 `src/standalone/`、`scripts/standalone/`                                                                                                                                           | 仅借鉴方法                                       | 证明了"浏览器内单机存档"路径可行                                                                        | 未提交、未定型                | 未定         |

### 2.6 工程与工具

| 本作系统                                       | 来源                                                                                                                                                                                  | 复用方式                             | 改造要点                                                                 | 主要风险                           | 许可状态            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------- | ------------------- |
| 金样轨迹与 rng 抽取顺序门                      | WoC `tests/parity/`（`harness`、`scenarios.ts`、`golden/`）                                                                                                                           | 改造后复用                           | 剪裁后重录本作基线                                                       | 基线重录时混入真回归               | MIT                 |
| 架构守卫（sim 纯净、禁用 API、纯核心登记）     | WoC `tests/architecture.test.ts`                                                                                                                                                      | 改造后复用                           | 扫描范围改为本作目录；登记表重建                                         | 无                                 | MIT                 |
| 接缝成员钉住                                   | WoC `tests/world_api_parity.test.ts`（`IWORLD_MEMBERS`）                                                                                                                              | 改造后复用                           | 改为钉住单机世界与回放世界两份实现                                       | 无                                 | MIT                 |
| 平衡方法与工具                                 | WoC `docs/design/spell-balance-framework.md`、`scripts/balance_report.mjs`、`scripts/dummy_sim.mjs`                                                                                   | 直接复用（方法）；改造后复用（脚本） | 检查点改为位阶边界                                                       | 无                                 | MIT                 |
| 无头环境与强化学习                             | WoC `headless/env_server.ts`、`src/sim/obs.ts`、`python/wow_env.py`                                                                                                                   | 改造后复用【待决策 R-08】            | 去 `jump` 动作，动作集改为动态技能栏；用于同伴与英雄 AI 的训练与平衡回归 | 维护成本                           | MIT                 |
| 质量门                                         | WoC `.claude/hooks/qa-stop.sh`、`.githooks/pre-push`、`npm run gate` 的分层思路、`.claude/agents/` 评审代理                                                                           | 改造后复用                           | 见第 5 节                                                                | 无                                 | MIT                 |
| 工具链                                         | WoC 的 TypeScript 严格模式、Vite、esbuild、Vitest、Biome 配置                                                                                                                         | 直接复用                             | 版本钉在独立仓库自己的 `package.json`                                    | 无                                 | MIT（工具各自许可） |
| 文档体系与评审门                               | WoC 执行方案的方法论（[internal_playbooks.md](../10_research/woc_reuse/internal_playbooks.md)）、open-share 方法论                                                                    | 仅借鉴方法                           | 决策日志只追加、按层评审                                                 | 无                                 | 方法                |

### 2.7 素材

| 素材                                                  | 来源                         | 复用方式 | 说明                                                                                                               | 许可状态                |
| ----------------------------------------------------- | ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| 全部场景素材与人物（程序化模板、风格包、纸娃娃）     | 本作代码（D-003、D-018）     | 新做     | 运行时由代码绘制，见 [art_pipeline.md](art_pipeline.md) 第 6 节                                                   | 自有                    |
| 位图例外（UI 图标图集、渲染器拍的封面与宣传图）       | 本作自制                     | 新做     | 见 [art_pipeline.md](art_pipeline.md) 第 6.4 节                                                                   | 自有                    |
| my_ai_town 道具像素图、厚涂图标图集、封面、logo、音乐 | my_ai_town                   | 不复用   | D-017                                                                                                              | 禁用                    |
| WoC 3D 模型与贴图                                     | WoC `public/`                | 不复用   | 本作不加载 GLB（D-018）；其中 CC0 包（KayKit、Quaternius、Kenney 等）如需作为仓库外的造型参考，从原始发布处获取，不从 WoC 仓库取 | CC0 可用，其余见第 6 节 |
| WoC 技能图标 `public/ui/skills/`                      | WoC                          | 不复用   | CraftPix 购买许可只授予 Levy Street，不可再分发                                                                    | 禁用                    |
| WoC 音效与音乐                                        | WoC `public/audio/`          | 不复用   | @jamiecypher 音效为 CC BY-NC，商用授权不随分叉转移；配乐为"仅随本项目"                                             | 禁用                    |
| Kenney 等 CC0 音效                                    | 原始发布处                   | 可用     | 不经 my_ai_town 或 WoC 转手，直接从发布处取并登记                                                                  | CC0                     |

---

## 3. 主工程 sim 的复用方案（模块级）

### 3.1 总体做法

- **固定提交拷贝 + 来源记录 + 以测试为锚的剪裁。** 拷贝 WoC 指定提交的 `src/sim/` 及其相关测试（含 `tests/parity/` 金样与 rng 抽取顺序日志、
  sim 相关单测、`tests/architecture.test.ts` 的 sim 纯净部分），先在新位置跑通原样测试，再按 3.11 的顺序一步一步剪裁，每一步都有测试兜底。
- **改动只走接缝。** 本作新增的系统（千门、钥、认知与传闻、女神规则执行者、城建、RTS、战略）各自是 `SimContext` 后面的独立模块，
  协调器只登记阶段，不新增方法簇（WoC 根 `CLAUDE.md` 的模块优先原则）。
- **状态留在 `Sim`，模块只持有函数**；新随机走 `ctx.rng`，新输出走 `ctx.emit`。

### 3.2 原样带走（直接复用）

| 类别         | 模块（`src/sim/` 下）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 随机与纯叶子 | `rng.ts`、`threat.ts`、`spatial.ts`、`geometry2d.ts`、`spell_scaling.ts`、`stun_dr.ts`、`aura_classify.ts`、`flee_speed.ts`、`cooldown_persist.ts`、`tab_target.ts`、`assist.ts`、`dead_target.ts`、`lockpick.ts`、`vendor_stack.ts`                                                                                                                                                                                                                                                                                                     |
| 战斗         | `combat/` 全部：`casting_lifecycle.ts`、`effect_dispatch.ts`、`auras.ts`、`cc.ts`、`damage.ts`、`heal.ts`、`auto_attack.ts`、`talent_procs.ts`、`set_procs.ts`、`equip_procs.ts`、`empower_next.ts`、`thorns_charge.ts`、`spell_resist.ts`、`ranged_shot.ts`、`aura_stacking.ts`、`aura_cancel.ts`、`exclusive_aura.ts`、`form_swing.ts`，以及职业专属模块（`warrior_stances.ts`、`warrior_hit_table.ts`、`fire_mage.ts`、`frost_mage.ts`、`chronomancy.ts`、`forms.ts`、`heroic_leap.ts`、`hunter_trap.ts` 等）；`projectile_travel.ts` |
| 怪物         | `mob/targeting.ts`、`mob/combat_profile.ts`、`mob/mob_swing.ts`、`mob/lifecycle.ts`、`mob/social_aggro.ts`、`mob/charge.ts`、`mob/healer_channel.ts`、`mob/nearby_allies.ts`、`mob/scan_counters.ts`、`mob_combat.ts`                                                                                                                                                                                                                                                                                                                    |
| 宠物         | `pet/pet_ai.ts`、`pet/pet_commands.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 任务         | `quests/quest_credit.ts`（目标类型扩展在新模块里做）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 名册与目标   | `entity_roster.ts`、`targeting.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

注："直接复用"仍会随 3.6 与 3.7 被动修改少量入口（例如 `combat/damage.ts` 的 `grantXp` 读 60 级经验表、`combat/casting_lifecycle.ts` 的资源扣除）；
这些修改在各自专项里登记，不视为另起炉灶。

### 3.3 改造后带走

| 模块                                                                                                            | 改造要点                                                                                                                  | 对应专项       |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `sim.ts`（`Sim`、`tick`、`buildSimContext`、`serializeCharacter`、`addPlayer`）                                 | 剪除在线阶段与委托；新增系统登记阶段；存档扩展到世界状态                                                                  | 3.10、3.11     |
| `sim_context.ts`（`SimContext`）                                                                                | 删除被丢弃系统的回调（无消费者即同时删声明与绑定）；只追加新回调                                                          | 3.11           |
| `types.ts`                                                                                                      | `MAX_LEVEL`、`XP_TABLE` 等扩到 60；`AbilityDef` 加可选资源声明；`Entity` 加多资源池；`SimEvent` 文本类事件改为"键 + 参数" | 3.6、3.7、R-04 |
| `entity.ts`（`recalcPlayerStats`、`createPlayer`、`createMob`）                                                 | 编外者属性曲线；多资源池初始化；门修正汇入                                                                                | 3.7、3.8、3.9  |
| `data.ts`（`setActiveWorldContent`、`MOBS`、`QUESTS`、`ITEMS`、`ABILITIES`）                                    | 合并本作内容表；世界布局常量改为读本作地图文档                                                                            | 3.10           |
| `content/classes.ts`、`content/talents.ts`、`content/talent_rows.ts` 及职业数据                                 | 显示名换皮；等级行扩到 60；加编外者伪职业                                                                                 | 3.6、3.8       |
| `progression/talents.ts`、`progression/xp.ts`                                                                   | NPC 与同伴保留专精加行；玩家改走门分配（不可逆，无免费重置）；休息经验改挂地点                                            | 3.6、3.9       |
| `deeds.ts`                                                                                                      | 保留为称号系统；复制其评估器模式写钥评估器                                                                                | 3.9            |
| `world.ts`（`groundHeight`、`terrainHeight`、`WATER_LEVEL`）                                                    | 平面世界开关，返回常数；水位改读地图文档                                                                                  | 3.5            |
| `colliders.ts`、`physics/`、`pathfind.ts`、`player_motion.ts`、`move_input.ts`                                  | 去高度与垂直运动；方向向量输入；视线换平面算法（若瓦片化）                                                                | 3.5            |
| `mob/locomotion.ts`、`mob/yells.ts`                                                                             | 去地形贴地与深水门槛；喊话改发键                                                                                          | 3.5、R-04      |
| `quests/quest_commands.ts`                                                                                      | 新目标类型（对话抉择、护送、建造、声望、传闻核实）                                                                        | 新模块配合     |
| `items.ts`、`interaction.ts`、`bags.ts`、`bank.ts`、`item_budget.ts`、`item_level_req.ts`、`equipment_rules.ts` | 预算与需求等级扩到 60；仓库改为门内庭院与领地库存                                                                         | 3.6            |
| `loot/loot_roll.ts`                                                                                             | 去队伍分配策略                                                                                                            | 3.4            |
| `instances/dungeons.ts`、`instances/difficulty.ts`、`content/dungeon_difficulty.ts`                             | 人数规模改为"主角 + 同伴"；英雄难度锁定等级不再写死 22                                                                    | 3.6            |
| `delves/runs.ts`、`delves/companion.ts`、`delves/lockpick_controller.ts`                                        | 迷宫骨架；同伴扩展为多职能                                                                                                | 2.2            |
| `world_boss.ts`                                                                                                 | 女神降灾首领                                                                                                              | 2.2            |
| `spirit.ts`、`resurrection.ts`                                                                                  | 退回门内庭院复苏                                                                                                          | 2.2            |
| `social/party.ts`                                                                                               | 同伴编队                                                                                                                  | 2.2            |
| `professions/`（含其 `CLAUDE.md`）                                                                              | 领地库存经济；按需裁剪                                                                                                    | 2.4            |
| `dev_commands.ts`                                                                                               | 保留"开发作弊面须显式开关"的门控思想，命令集重写                                                                          | 第 5 节        |
| `obs.ts`（`ACTIONS`、`encodeObs`）                                                                              | 去 `jump`；动态技能栏                                                                                                     | R-08           |

### 3.4 丢弃

| 类别               | 模块                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 理由                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 在线经济           | `market.ts`、`market_query.ts`、`market_listing_ids.ts`、`mail/post_office.ts`、`social/trade.ts`、`loot/loot_ffa.ts`、`loot_master.ts`                                                                                                                                                                                                                                                                                                                                                                    | 单人主线（D-002）；NPC 经济由城建与女神 GM 驱动 |
| 聊天与社交         | `social/chat.ts`、`social/chat_readouts.ts`、`social/away.ts`、`social/ready_check.ts`、`social/dungeon_finder.ts`、`content/dungeon_finder.ts`                                                                                                                                                                                                                                                                                                                                                            | 与 AI 对话系统无关的在线功能                    |
| PvP 与小游戏       | `social/duel.ts`（决斗规则仅参考，可改为 NPC 切磋）、`social/arena.ts`、`pvp/`、`content/pvp_honor.ts`、`social/fiesta.ts`、`social/fiesta_bots.ts`（仅留作参考）、`content/augments.ts`、`social/vale_cup.ts`、`social/vale_cup_bots.ts`、`vale_cup_ball.ts`、`vale_cup_layout.ts`、`content/vale_cup.ts`、`social/yumi.ts`、`yumi_maze_layout.ts`、`content/yumi.ts`、`social/card_duel.ts`、`social/card_duel_queue.ts`、`minigames/card_hand.ts`、`instances/card_master.ts`、`content/card_master.ts` | 单人主线；卡牌小游戏若需要另行设计              |
| 运营与账号         | `jail.ts`、`discord_relay.ts`、`discord_roles.ts`、`discord_tier.ts`、`holder_tier.ts`、`account_flair.ts`、`client_challenge.ts`、`leaderboard_page.ts`、`character_rename.ts`、`dev_tier.ts`                                                                                                                                                                                                                                                                                                             | 在线运营专属                                    |
| 商城外观           | `content/skins.ts`、`content/weapon_skins.ts`、`content/weapon_skin_rules.ts`、`content/ptr_dev_vendor.ts`、`instances/heroic_vendor.ts`、`content/heroic_vendor.ts`                                                                                                                                                                                                                                                                                                                                       | 与本作经济无关                                  |
| 3D 地形与攀爬      | `voxel.ts`、`voxel_mesh.ts`、`content/tunnels.ts`、`climb.ts`、`physics/ledge.ts`、`decoration_dims.ts`                                                                                                                                                                                                                                                                                                                                                                                                    | 内核在格子平面上计算（D-004），地形高度与攀爬不进内核 |
| WoC 世界布局与内容 | `eastbrook_layout.ts`、`dock_layout.ts`、`banker_chest_layout.ts` 等布局叶子，`content/zone1.ts` 到 `zone3.ts`、`content/temple.ts`、`content/letters.ts`、`content/mailboxes.ts`、`removed_zone1_content.ts`                                                                                                                                                                                                                                                                                              | 世界观与地名完全不同，结构仅参考                |
| 首领与地窟脚本     | `encounters/nythraxis.ts`、`delves/drowned_litany_*.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 仅作脚本写法参考，不带入本作代码                |

### 3.5 改造专项 A：格子平面化五处改动

依据：[combat_and_content_inventory.md](../10_research/woc_reuse/combat_and_content_inventory.md) 第 1.6、1.7 节。战斗、内容、AI、观测层天然是 XZ 平面；改动集中在下表五处。

| 序  | 改动             | 涉及路径与符号                                                                                                             | 做法                                                                                                                | 验收                                                 |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | 地形压平         | `world.ts` 的 `groundHeight`、`terrainHeight`（调用方分布在多个模块）                                                      | 加"平面世界"开关返回常数；保留函数签名，调用方不改                                                                  | 出生、传送、怪物贴地测试照常通过                     |
| 2   | 边界与隔断显式化 | `WorldContent.blockers`；原由陡坡门槛 `MAX_CLIMB_SLOPE` 隐式提供                                                           | 地图文档生成阻挡墙；区域边缘、悬崖、建筑外墙都成为显式碰撞体                                                        | 新测试：追击、冲锋、击退、闪现、恐惧逃跑都不出界     |
| 3   | 水体改谓词       | `WATER_LEVEL`、`waterLevelAt`、`isSwimming`、`professions/fishing.ts`、冲锋与击退的深水门槛、怪物岸边停步                  | 改为地图文档的"水体格"谓词；深水不可通行或可游泳由地图标注                                                          | 钓鱼、岸边停步、击退入水测试                         |
| 4   | 关闭垂直运动     | `player_motion.ts` 的垂直分支、`climb.ts`、`physics/ledge.ts`、`Collider` 的 `moveTopY` 与 `standable`、`obs.ts` 的 `jump` | 输入不再产生跳跃；去掉可站立道具；开放世界也走平地分支                                                              | `player_motion` 相关测试改写后通过；观测维度变化登记 |
| 5   | 碰撞表示         | `colliders.ts`（`resolvePosition`、`lineOfSightClear`、`isBlocked` 一类窄接口）、`physics/`、`pathfind.ts`（`findPath`）   | 第一版保留圆形与 OBB 连续碰撞，只去高度字段；若关卡管线确定为瓦片，再换瓦片碰撞并把视线改成 DDA 遍历【待决策 R-03】 | 视线、寻路、冲锋路径测试                             |
| 附  | 操作与朝向       | `MoveInput`（`move_input.ts`）、`MELEE_ARC` 面向判定、"You must be facing your target." 报错                               | 移动方向相对屏幕（按相机方位角旋转后交给内核）；宿主按移动方向或鼠标方向设 `facing`；或施法时自动面向目标；与 Q-002 一起在原型里定                                  | 原型手感评审                                         |

快照与轨迹格式：保持 `pos.y = 0`，可让实体快照与金样轨迹结构不变。

### 3.6 改造专项 B：等级 20 到 60（D-005）

| 受影响处               | 现状（WoC）                                                                                   | 改造                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 等级上限               | `MAX_LEVEL = 20`（`types.ts`）                                                                | 改为 60；全仓检索 `MAX_LEVEL` 与按字面量 20 表达等级的写法，逐处登记                 |
| 经验表                 | `XP_TABLE` 20 项，经典曲线                                                                    | 扩到 60 项，沿用经典公式推导后续段，不手填数字；表由战斗系统文档给出并钉测试         |
| 怪物经验与零差带       | `mobXpValue`、`zeroDiff`                                                                      | 零差带按经典规则延伸到 60                                                            |
| 满级后的虚拟等级与威望 | `virtualLevel`、`MAX_VIRTUAL_LEVEL`、`PRESTIGE_XP_PER_RANK`                                   | 本作不需要威望；建议移除或保留为隐藏统计                                             |
| 技能等级行与学习等级   | `AbilityRank`、`learnLevel` 只到 20                                                           | 补 21 到 60 的等级行与高阶技能（NPC 与同伴用；编外者经门获得）                       |
| 天赋行                 | `ROW_LEVELS = [5, 8, 11, 14, 17, 20]`                                                         | NPC 与同伴的行等级按位阶重排（例如每个位阶边界一行），具体由战斗系统文档定           |
| 精通                   | `computeTalentModifiers` 中 `min(1, level/20)`                                                | 改为按 60 或按位阶分段                                                               |
| 物品                   | `item_budget.ts` 预算线性可延伸；`item_level_req.ts` 回退值写死 12/18/20；英雄变体来源等级 22 | 回退值与变体来源等级随 60 重定                                                       |
| 英雄难度锁定等级       | `HEROIC_DUNGEON_TUNING` 所有怪物锁 22 级                                                      | 改为按迷宫所在位阶给定                                                               |
| 平衡框架               | 满级 20 的职业差距带                                                                          | 多检查点：9、19、34、49、59、60（位阶边界，`../20_world/world_bible.md` 第 10.1 节） |
| 大等级差               | 高 3 级以上的未命中与抵抗惩罚饱和在 +21 个百分点                                              | 不在本文定；对应 Q-003（位阶差"威压"修正）                                           |
| 观测归一化             | `obs.ts` 中按等级归一的字段                                                                   | 随上限更新，登记观测版本                                                             |

### 3.7 改造专项 C：多资源模型

问题：`AbilityDef` 没有资源类型字段，消耗总是扣施法者当前 `resourceType` 的资源池（`combat/casting_lifecycle.ts`）。
编外者经门跨职能习得技能后，会出现"用法力付怒气技能"的错扣。

| 选项                            | 做法                                                                                                                                            | 优点                                                    | 缺点                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| 甲：技能资源声明 + 实体多资源池 | `AbilityDef` 加可选 `resource`（缺省为施法者主资源）；`Entity` 加按资源类型索引的多池；回复规则（怒气衰减、能量回复、法力五秒规则）各池独立运行 | 忠实经典节奏；跨职能玩法丰富                            | 触及施法、回复、属性、观测与 HUD；玩家同时管多条资源，认知负担大 |
| 乙：统一资源"灵素"              | 编外者只有一条正典资源"灵素"（`../20_world/world_bible.md` 第 5 节第 1 条）；门授技能的原消耗按换算表折算                                       | 改动最小；世界观自洽；界面简单                          | 丢失怒气、能量、连击点的节奏差异；换算表的平衡风险集中           |
| 丙：门授资源池                  | 实现同甲，但资源池本身由门授予（开某扇门获得某职能的资源池），技能扣自己声明的池                                                                | 新资源本身就是一次"发掘"，与支柱 2 契合；NPC 侧不受影响 | 实现成本同甲；需要设计"池的上限与回复也能被门改写"               |

推荐：丙（甲的实现方式 + 门授池），连击点继续挂在实体上；界面只显示已获得的池。
理由：符合"龙傲天但需要发掘"的线性释放，并且 NPC 与同伴的九职能保持原样。【待决策 R-02】，最终由 `../40_design/systems/combat_and_classes.md`（待撰写）定稿。

### 3.8 改造专项 D：编外者伪职业（D-006）

| 项                     | 做法                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 职业登记               | `CLASSES` 增加一个伪职业（内部 id 暂定 `outsider`），`isPetClass` 等判定按需扩展                                                                |
| 基础套件               | `ClassDef.abilities` 为空或只含普通攻击；"初门·醒"等起始能力全部经门授予（`grants` 绕过学习等级与专精过滤，且不检查技能所属职业，技术上已支持） |
| 资源                   | 按 3.7 的结论                                                                                                                                   |
| 护甲与武器             | 由门开放护甲等级与武器组（`equipment_rules.ts` 读门修正）                                                                                       |
| 属性成长               | 单独定义成长曲线（"数值上高于同级凡人"，`../40_design/game_framework.md` 第 4 节），在 `recalcPlayerStats` 内实现，不在外面派生                 |
| 对外显示与真实状态分离 | 鉴定显示"无记载"、公会卡"Lv1、无职能"是展示层规则；伪录之门可伪造展示值。真实状态只在内核，展示状态是另一份数据                                 |
| 任务奖励原型           | `REWARD_ARCHETYPE` 为编外者指定按门倾向或按装备选择的奖励规则                                                                                   |
| NPC 与同伴             | 继续使用九职能、专精与行天赋                                                                                                                    |

### 3.9 改造专项 E：门效果层与钥判定

| 千门需求                           | 落点                                                                                                                                                                                            | 做法                                                                                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 门后效果（技能、被动、数值、触发） | `TalentEffect` 的超集（暂名 `DoorEffect`）：沿用 `stats`、`ability`、`global`、`grant`、`proc`，新增 `features`（系统功能解锁开关：识才、伪录、行路、千军、立国等）与 `resourcePools`（3.7 丙） | 累加函数（暂名 `computeDoorModifiers`）产出与 `TalentModifiers` 兼容的扁平结果加功能开关集合；三个消费点（`recalcPlayerStats`、`abilitiesKnownAt`/`applyTalentMods`、战斗模块读 `global` 与 `procs`）不改 |
| 门的图结构                         | 新数据表（门、互斥组、隐藏标志、危险代价、钥条件）                                                                                                                                              | 放在 `content/` 下作为数据即代码；导入时校验（仿 `validateRowTree`）                                                                                                                                      |
| 分配状态                           | `TalentAllocation` 的替代（已开门集合、互斥选择、已见未开集合）                                                                                                                                 | 不可逆，无免费重置；loadout 可保留为"已开门之间的取舍预设"                                                                                                                                                |
| 钥的判定                           | 新模块，复制 `deeds.ts` 的模式：封闭触发词汇、脏标记、tick 末尾评估、零 rng、读档追溯                                                                                                           | 新触发：羁绊阈值、对话抉择、指定同伴在场、地点加时刻、持有物、被多少人目击、传闻核实                                                                                                                      |
| 危险门的永久代价                   | `PlayerMeta` 新增持久化字段                                                                                                                                                                     | 负面状态走既有光环体系，但需要"永久"标志                                                                                                                                                                  |
| 硬约束                             | 来自 WoC                                                                                                                                                                                        | 分配时一次性扁平预计算，热路径不遍历门图；开门由内核权威判定、可追溯授予                                                                                                                                  |

### 3.10 改造专项 F：单机宿主、存档与 AI 输入

- **宿主：** 沿用 WoC 的离线宿主模式（浏览器或桌面壳内直接运行 `Sim`），不需要权威服务器。
- **存档：** 沿用 `serializeCharacter` 与 `addPlayer({ state })` 的路线，扩展到世界状态（城建、领地、势力、女神规则执行者的状态、钥与门）。
  NPC 的长期记忆由 AI 运行时以稳定居民 id 与世界历法为键另存，内核只存可校验的事实与回执。
- **AI 输入：** AI 运行时在内核之外，只产出结构化意图；意图经内核校验后执行，并与玩家命令一起写入输入日志。
  回放读日志，不调用模型，从而保持确定性（open-share 确定性模拟资料的分析结论，见 [city_rts_slg.md](../10_research/open_share/city_rts_slg.md) 第 6.4 节）。
- **世界内容替换点：** `setActiveWorldContent` 可整体换 `WorldContent`，但 `MOBS`、`QUESTS`、`ITEMS`、`ABILITIES` 是静态合并表，换世界观要换数据模块本身。

### 3.11 剪裁顺序与检查点

| 步  | 内容                                                    | 检查点                                                   |
| --- | ------------------------------------------------------- | -------------------------------------------------------- |
| 1   | 拷贝固定提交的 `src/sim/` 与相关测试，写来源记录（4.4） | 原样测试全绿；金样与 rng 抽取顺序日志一致                |
| 2   | 按 3.4 分组删除在线系统，每删一组跑一次测试             | 金样失败只能源于被删阶段；逐条记录后重录，形成"剪裁基线" |
| 3   | 格子平面化五处（3.5）                                      | 每处带新测试；重录"平面基线"                             |
| 4   | 文本事件改"键 + 参数"（R-04）                           | 事件快照测试；不再依赖英文匹配器                         |
| 5   | 60 级扩展（3.6）                                        | 经验表、预算、精通的钉住测试                             |
| 6   | 多资源与编外者（3.7、3.8）                              | 资源扣除与回复测试；跨职能技能测试                       |
| 7   | 门与钥（3.9）                                           | 扁平预计算测试、钥评估零 rng 测试、读档追溯测试          |
| 8   | 换皮与本作内容                                          | 无 WoC 专有名词的扫描测试（见第 6 节）                   |

每个检查点的金样重录都要在提交说明里写清"为什么变"，避免把真回归混进新基线。

---

## 4. 代码组织：同仓还是独立仓库（Q-001）

### 4.1 选项

| 编号 | 方案         | 说明                                                                            |
| ---- | ------------ | ------------------------------------------------------------------------------- |
| A    | 同仓直接引用 | `hakoniwa/src/` 直接 import 主工程 `src/sim/`                                   |
| A'   | 同仓拷贝     | 在 `hakoniwa/src/sim/` 放固定提交的拷贝，与主工程源码并列                       |
| B    | 独立仓库拷贝 | 新建本作仓库，按固定提交拷贝 WoC 的 `src/sim/` 与相关测试，附来源记录与同步脚本 |
| C    | 抽共享包     | 把 sim 抽成两边共同依赖的包（工作区包或发布包）                                 |

### 4.2 比较

| 维度                                          | A 同仓直接引用                                                                                      | A' 同仓拷贝                                                                 | B 独立仓库拷贝                      | C 共享包                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------- |
| 上游同步                                      | 自动获得修复，也自动获得不想要的改动                                                                | 用 git 比较固定提交与新上游，手工挑选                                       | 同 A'，需同步脚本生成差异清单       | 两边共用，同步最省                     |
| 改动自由度（`types.ts`、协调器、60 级、资源） | 几乎为零：改动会污染主工程，或要在主工程里加只为本作服务的配置钩子                                  | 完全自由                                                                    | 完全自由                            | 很低：每个改动都要对两边都成立         |
| 确定性测试                                    | 主工程金样会被本作需求牵动，两边互相阻塞                                                            | 本作单独一套金样，互不影响                                                  | 同 A'                               | 共享一套金样，任何一边改动都要两边重录 |
| 构建与工具                                    | 根 `tsconfig.json` 不含 `hakoniwa/`，需另写配置；主工程 `npm run gate` 与本作耦合                   | 需为 `hakoniwa/` 另配 tsconfig、Vitest、Vite；根目录的钩子与 Biome 照常生效 | 自有完整工具链，可直接拷 WoC 的配置 | 需要拆包与发布流程，主工程大改         |
| 对主工程的影响                                | 大                                                                                                  | 小（仓库体积变大，两份相似代码易混淆）                                      | 无                                  | 很大（主工程重构）                     |
| 品牌与许可边界                                | 产品代码与 WoC 品牌混在一起                                                                         | 同左                                                                        | 清晰：只带 MIT 代码与许可文本       | 中等                                   |
| 本仓库的分叉维护规则                          | 本仓库根 `CLAUDE.md` 规定只有 `main` 一个本地分支、定期合并上游；本作代码混入会增加上游合并的冲突面 | 同左（冲突面较小，因为目录独立）                                            | 不受影响                            | 受影响                                 |
| 迁移成本（以后再拆）                          | 高                                                                                                  | 中（目录可整体迁出）                                                        | 无                                  | 高                                     |

### 4.3 推荐【待决策 R-01，即 Q-001，需用户决定】

- **实现期采用 B：独立仓库 + 固定提交拷贝 + 来源记录 + 上游同步脚本。** 理由：60 级、多资源、编外者、格子平面化都会改 `types.ts` 与协调器，
  A 与 C 不可行；B 的品牌、许可、金样、构建边界最清楚，与调研建议"固定提交的拷贝 + 来源记录 + 剪裁"一致。
- **过渡：** 独立仓库建立之前，如需技术原型（例如 HD-2D 渲染与战斗手感的验证），可临时在 `hakoniwa/` 下按 A' 拷贝进行，原型结束后整体迁出；
  设计文档（`hakoniwa/docs/`）可以继续留在本仓库，也可随代码迁出，取决于用户是否希望文档与主工程并列。
- **不推荐：** A（直接引用）与 C（共享包）。

### 4.4 来源记录与上游同步规程

- 拷贝目录根放一份来源记录（暂名 `UPSTREAM.md` 或 `upstream.json`）：上游仓库、提交号、拷贝日期、拷贝路径清单与各文件哈希、
  WoC 的 MIT 许可全文与版权声明、本地改动登记表（文件、改动类别、对应专项）。
- 同步脚本：比较"已钉提交"与"新上游提交"在 `src/sim/` 上的差异，按本地改动登记表分成三类输出：可直接移植、与本地改动冲突、
  属于已丢弃模块（忽略）。移植后跑全部测试与金样，再把来源记录的钉住提交前移。
- 主工程中不涉及三维地形与在线功能的修复（例如战斗公式缺陷）优先移植；新玩法与在线功能不移植。

---

## 5. 与主工程工程原则的对应

| 原则             | WoC 做法（依据）                                                                                                                                | 本作处理            | 说明                                                                                                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 确定性           | 20 Hz 固定步长；所有随机走 `Rng`；禁 `Math.random`、`Date.now`、`performance.now`；`tests/architecture.test.ts` 机械校验；金样与 rng 抽取顺序门 | 照搬，并补一条      | 补：大模型输出与玩家命令同等视为外部输入，写入输入日志；回放不调模型                                                                                                                                                                                   |
| sim 纯净         | sim 无 DOM、Three、浏览器依赖，不 import 表现层                                                                                                 | 照搬                | 扫描范围改为本作 sim 目录                                                                                                                                                                                                                              |
| 模块优先         | 新系统是 `SimContext` 后的独立模块；四个协调器不得变大；纯逻辑抽成可单测的叶子                                                                  | 照搬                | 本作协调器：sim 协调器、HUD 协调器、渲染协调器、客户端入口；城建、RTS、千门、认知、女神规则执行者各成模块                                                                                                                                              |
| 接缝（`IWorld`） | 表现层只经 `IWorld` 读世界、经命令改世界；分面文件；离线 `Sim` 与在线 `ClientWorld` 双实现；成员清单钉住                                        | 调整                | 单机没有在线镜像；第二份实现改为"回放世界"（读输入日志与快照，供录像重演、宣传素材与回归对比），远期"他人的箱庭"也走这条接缝；两份实现的成员清单照样钉住；分面按本作领域重划（战斗、同伴、千门、认知与传闻、神域、城建、战场、战略、背包、任务、对话） |
| AI 接缝          | WoC 的 AI 挂在服务器上，`Sim.aiActiveMobAction` 是窄入口                                                                                        | 新增                | AI 运行时与内核之间只有"意图进、回执出"一条接缝；内核不知道模型存在                                                                                                                                                                                    |
| i18n             | 每条玩家可见文本是 `t()` 键；贡献者只加英文；sim 发英文，客户端正则匹配器本地化，S3 守卫 `tests/localization_fixes.test.ts`                     | 调整【待决策 R-04】 | 推荐：内核发"键 + 参数"事件，不走匹配器；源语言为中文，其他语言后补；数字、货币、日期仍走格式化函数；模型生成的台词属动态文本，按玩家语言生成，降级档的预写台词是键                                                                                    |
| 图形设置公平     | 画质档只能削减装饰，不能隐藏或延迟玩家要据以行动的信息                                                                                          | 照搬                | 本作的具体清单见 [art_pipeline.md](art_pipeline.md) 第 2.12 节                                                                                                                                                                                                         |
| 依赖极少         | 不随意加包                                                                                                                                      | 照搬                | 渲染只加 `three` 一个依赖，与 WoC 同版本（art_pipeline.md 第 2.1 节）；素材全部由代码绘制，不引入素材工具链与模型加载器                                                                                                                                              |
| 生成文件不手改   | 生成物只由所属构建步骤重生                                                                                                                      | 照搬并扩展          | 场景素材由代码模板在运行时绘制，不入库；渲染器拍出的封面与宣传图、纸娃娃导出的头像、素材清单都是生成物，改模板或参数后重生，不手改输出                                                                                                                                                                                   |
| 测试密度         | sim 与服务器改动必带测试；纯核心 Node 可测；金样轨迹                                                                                            | 照搬并扩展          | 新增：AI 题面快照测试、素材模板与地图外观层的自动校验（art_pipeline.md 第 6.6 节）、无模型降级档通关回归（D-010）                                                                                                                                                   |
| 缺陷先测后修     | 先写复现失败的测试，再做最小修复                                                                                                                | 照搬                |                                                                                                                                                                                                                                                        |
| 分层 QA 门       | Stop 钩子拦字符；pre-push 跑 tsc、守卫测试、Biome；`npm run gate` 全量；评审代理（`.claude/agents/`）                                           | 照搬，评审代理改写  | 保留确定性评审、表现层接缝评审、测试覆盖评审；去掉数据库与在线同步相关评审；新增"许可与素材来源"评审                                                                                                                                                   |
| 文档锚点规则     | 写稳定路径与导出符号，不写会腐烂的数量与行号                                                                                                    | 照搬                |                                                                                                                                                                                                                                                        |
| 提交规范         | Conventional Commits 带作用域，必须有正文                                                                                                       | 照搬                |                                                                                                                                                                                                                                                        |
| 禁用字符         | 不用破折号、emoji                                                                                                                               | 照搬                | 本目录已受 Stop 钩子约束                                                                                                                                                                                                                               |
| 开发作弊面门控   | `ALLOW_DEV_COMMANDS` 只在开发环境                                                                                                               | 照搬思想            | 单机版也要保证发布构建里没有作弊面入口                                                                                                                                                                                                                 |

---

## 6. 许可清单

### 6.1 不得进入本作

| 类别                            | 具体内容                                                                                                                                                                           | 来源                                               | 原因                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 名称与标识                      | "World of ClaudeCraft"、"Levy Street" 的名称、logo 与品牌；my_ai_town 的名称与标识                                                                                                 | WoC `CREDITS.md` 的品牌一节；my_ai_town            | 商标法管辖，不随 MIT 授权（D-015）                                                                                  |
| my_ai_town 的全部代码与原创文档 | `frontend/`、`crates/`、`scripts/`、`data/` 下的一切，包括地图生成器、校验器、纸娃娃字母格模板、着色器、提示词原文（如建镇规划提示词）                                             | my_ai_town                                         | PolyForm Noncommercial（D-017）                                                                                     |
| my_ai_town 的全部素材           | 道具像素图、厚涂 UI 图标图集、选镇封面、logo、全部音乐与提示音、预制角色长相数据                                                                                                   | my_ai_town                                         | 仅随该项目及其非商业衍生分发（D-017）                                                                               |
| WoC 的 CraftPix 职业技能图标    | `public/ui/skills/<class>/*.webp`                                                                                                                                                  | WoC                                                | CraftPix 许可只授予 Levy Street，不可再分发                                                                         |
| WoC 保留权利的美术              | Season 1 Armory 武器与商店图、Claudium 视觉资产、旧 Claudium 原型武器、Book of Deeds 功绩图标、Professions 2.0 美术、精英龙徽、生成的物品图标、Tripo 芦苇模型                      | WoC `CREDITS.md`                                   | 标注"No, permission required"                                                                                       |
| 经许可使用的 WoC 素材           | 两枚法师技能原画、`fireball_form` 与 `counterspell` 原画、`temporal_clock` 音效                                                                                                    | WoC `CREDITS.md`                                   | 许可只给 Levy Street                                                                                                |
| WoC 非商用音效                  | @jamiecypher 的全部音效（任务、开锁、魔杖、升级与功绩、学派冲击与弹道、近战与脚步、怪物叫声）                                                                                      | WoC `CREDITS.md`                                   | CC BY-NC 4.0；商用授权只给 Levy Street，不随分叉转移                                                                |
| WoC "仅随本项目"类素材          | 生物群系背景全景、Meshy 与 Tripo 生成模型、程序生成的界面音效、HUD 启动器图标、袋子图标、重制配乐等                                                                                | WoC `CREDITS.md`                                   | 只允许"作为 WoC 或其分叉的一部分"发布；本作是新游戏，不按分叉对待                                                   |
| 第三方商标                      | Twitch、X、Kick、YouTube、Discord、Solana、USDC 标识                                                                                                                               | WoC `src/ui/ui_icons.ts`、`public/claudium/icons/` | 商标                                                                                                                |
| WoC 的专有名词                  | 区域名（Eastbrook Vale、Mirefen Marsh、Thornpeak Heights 等）、首领与 NPC 名（Nythraxis、Morthen 等）、技能与专精显示名（Reaver Strike、Battlecraft 等）、货币与商城名（Claudium） | WoC `src/sim/content/`                             | 代码虽是 MIT，但愿景要求"不复刻任何具体作品的名称"（`../00_vision/vision.md` 第 8 节），且这些名称与 WoC 品牌强关联 |
| WoC 程序化配乐的旋律数据        | `src/game/music.ts` 等的音符数据                                                                                                                                                   | WoC                                                | 代码 MIT，但旋律是 WoC 作品的可识别内容；建议不带入（建议级，非法律结论）                                           |

### 6.2 可以进入，但需记录

| 内容                                                       | 条件                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| WoC 源码（`src/sim/`、纯核心、工具脚本、测试）             | 随附 MIT 许可全文与"Copyright (c) 2026 Levy Street"版权声明（放在来源记录与第三方声明中）；这属于版权声明，不构成品牌使用 |
| WoC 内部技能 id（经典 MMO 惯用英文名，如 `heroic_strike`） | 不出现在任何玩家可见文本中；是否在发布前改为本作自有 id【待决策 R-09】                                                    |
| CC0 素材（Kenney 音效等）                                  | 从原始发布处获取，登记来源、版本与许可                                                                                    |
| SIL OFL 字体（如思源系列）                                 | 按 OFL 随附许可；本作 UI 默认用系统字体，可不打包字体                                                                     |
| 位图例外（UI 图标图集、封面与宣传图）                      | 本作自制，登记在素材清单，见 art_pipeline.md 第 6.4、6.7 节                                                                      |
| open-share 资料中的方法                                    | 无需登记许可；设计文档回链来源                                                                                            |

### 6.3 合规动作

1. 独立仓库建立时一并建立第三方声明文件，列出 WoC MIT 许可与所有运行时依赖的许可。
2. 素材清单的每一项必须有来源与许可字段，构建期校验缺失即失败（art_pipeline.md 第 6.5、6.6 节）。
3. 增加一个"专有名词扫描"测试：在本作内容数据与界面文本中扫描 WoC 的区域、首领、技能与专精显示名清单，命中即失败。
4. 任何开源项目代码（open-share 索引的 RTS 与城建项目）进入前，先在决策日志里记录许可审查结论。
5. 新增"许可与素材来源"评审代理或检查清单，纳入 QA 门。

---

## 7. 待决策清单

| 编号 | 问题                                                                | 推荐                                         | 谁定           |
| ---- | ------------------------------------------------------------------- | -------------------------------------------- | -------------- |
| R-01 | 代码组织（即 Q-001）：独立仓库拷贝、同仓拷贝、同仓直接引用、共享包  | 实现期独立仓库拷贝；原型可临时同仓拷贝       | 用户           |
| R-02 | 多资源模型：技能资源声明加多池、统一"灵素"、门授资源池              | 门授资源池（多池实现）                       | 战斗系统设计   |
| R-03 | 碰撞表示：保留圆形与 OBB 连续碰撞，还是改瓦片碰撞                   | 第一版保留连续碰撞，关卡管线定型后再评估     | 技术原型       |
| R-04 | 内核文本：发"键 + 参数"还是沿用英文加客户端匹配器；源语言是否为中文 | 键加参数；中文为源语言                       | 用户与技术方案 |
| R-05 | 协调器：剪裁 WoC 的 `sim.ts`，还是新写薄协调器只登记需要的阶段      | 先剪裁（每步可证），稳定后再按需重构         | 技术方案       |
| R-08 | 是否保留无头强化学习环境与 Python 绑定                              | 保留在工具层，用于同伴与英雄 AI 及平衡回归   | 技术方案       |
| R-09 | 内部技能 id 是否在发布前改为本作自有 id                             | 原型期保留，发布前评估存档与模组可见性后决定 | 用户           |
| 关联 | 大等级差饱和与位阶"威压"修正                                        | 见 Q-003                                     | 数值设计       |
| 关联 | 战斗操作手感（目标锁定或动作向）                                    | 见 Q-002                                     | 原型验证       |

（编号 R-06、R-07 预留给战斗系统文档中的天赋行重排与经验表定稿。）

---

## 8. 依据

- 调研：[combat_and_content_inventory.md](../10_research/woc_reuse/combat_and_content_inventory.md)（第 1、8、9 节与附录 B）、
  [comparison_and_plan.md](../10_research/ai_npc/comparison_and_plan.md)、
  [my_ai_town_visual_and_client.md](../10_research/art_style/my_ai_town_visual_and_client.md)（第 9、10 节）、
  [city_rts_slg.md](../10_research/open_share/city_rts_slg.md)（第 3、6、7 节）、
  [internal_playbooks.md](../10_research/woc_reuse/internal_playbooks.md)、
  [../10_research/README.md](../10_research/README.md)（十条跨调研结论与许可提醒）。
- 正典与决策：`../00_vision/decision_log.md`、`../00_vision/vision.md`、`../20_world/world_bible.md`、`../40_design/game_framework.md`。
- 主工程：根 `CLAUDE.md`、`src/sim/CLAUDE.md`、`src/render/CLAUDE.md`、`src/ui/CLAUDE.md`、`src/world_api/CLAUDE.md`、`CREDITS.md`、`LICENSE`。
