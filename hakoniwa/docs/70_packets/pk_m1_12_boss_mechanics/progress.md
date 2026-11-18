# PK-M1-12 首领机制库与魔物机制字段：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-18 | 实施 1、QA 1 | 首领机制库、五种地面预警、引导、注册表第一幕字段、看到的灵压、澱病与伤病的战斗效果与伤病来源、遗落物端口、两路提示与内容校验；第一幕四场首领落到机制库；新起会话审查后修 16 条；接 PK-M1-49 的三项请求 | 未提交 | 见 `verification_matrix.md`；`tests/boss_mechanics.test.ts` 59 passed | 1. 主会话按下面的文件清单提交；2. 遗留转后续包；3. PK-M1-35 给出首领战场地点后把悬石的 `offset` 换成 `at` |
| 2026-11-18 | 实施 2（通关回归） | 以 HEAD 为基线逐条对比后定位三处原因并修：自动玩家记住走不到的目标（新 `src/game/autoplay/reach.ts`），波次首领失去目标时保留战斗状态（新 `pauseBoss`），自动玩家的首领战打法（等队伍、治疗同伴、打断、先治疗再跑、休息时用治疗）。数据见本节"通关回归" | 未提交 | `tests/autoplay_reach.test.ts` 3 passed；`tests/autoplay_party_ready.test.ts` 10 passed；`tests/boss_mechanics.test.ts` 61 passed；见第 2 节"通关回归" | 主会话一并提交；B、C 两组可先于 A 合入 |

## 2. 汇报

### 2026-11-18 实施 1、QA 1

**做法**

- 机制库是 `src/systems/combat/boss/` 下的一组小模块，`index.ts` 的 `tickBoss` 每个交战 tick 按"阶段、增援、软硬狂暴与叠层、护盾、部位"的顺序推进，每秒处理一次施放队列与非战斗解法；
  首领的战斗状态挂在单位的 `boss` 上，开战（第一次进入交战）起算，`resetBoss`（回家时）整体清掉，机制库挂的光环（阶段、软硬狂暴、叠层，来源 `boss`）一并摘除，机关复原，封场打开。
- 地面预警在 `telegraph.ts`：带 `telegraph` 的技能先锁定格集合并发 `combat.telegraph`，读条长度等于提前量（取读条与提前量的较大者，乘难度的 `telegraph_lead`，急速不缩短），
  读条结束时对格内敌方结算，不掷骰；脉冲区出现即生效，首跳不早于 1.2 秒；点名是跟随目标的圆；同一施法者的非脉冲区域至多 3 个，满了新的预警等待。
- 注册表字段在 `src/systems/combat/affixes/`：命中词缀用模板光环（时长、伤害、幅度由字段覆盖），计时词缀生成预警，出生与死亡规则、世界规则、净化各一个模块；
  `FIRST_ACT_FIELDS` 是第一幕字段的清单，内容校验拒收注册表以外的键。
- 跨系统只走现有接缝：伤病经澱病系统的命令 `ailments.injure`；迷宫遗落物经迷宫的端口 `registerLeftItemPort`（战斗注册，`bag_port.ts`）；
  物品使用门经库存的端口 `registerUseGate`（战斗注册，`use_gate_port.ts`）；解法的表达式用任务系统的纯求值器 `quests/conditions.ts`（千门、澱病同样引用）；作物修正项经 `registerModifier`。

**改动文件**（"战斗外"标出不在战斗目录的文件）

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/combat/boss/`（`index.ts`、`fight.ts`、`phases.ts`、`actions.ts`、`adds.ts`、`enrage.ts`、`marks.ts`、`shields.ts`、`terrain.ts`、`resolve.ts`、`arena.ts`、`interrupt.ts`、`door_seek.ts`） | 新增 | 机制库 |
| `src/systems/combat/boss.ts` | 删除 | 由 `boss/` 取代 |
| `src/systems/combat/affixes/`（`index.ts`、`on_hit.ts`、`timed.ts`、`life.ts`、`purify.ts`） | 新增 | 注册表字段 |
| `src/systems/combat/telegraph.ts`、`telegraph_shapes.ts` | 新增 | 地面预警与纯几何 |
| `src/systems/combat/mech_types.ts` | 新增 | 第 10、11 节的形状、运行时状态、新事件与命令 |
| `src/systems/combat/perceive.ts` | 新增 | 看到的灵压与灰色规则 |
| `src/systems/combat/injuries.ts` | 新增 | 伤病来源与淬体反冲端口 |
| `src/systems/combat/stand_down.ts` | 新增 | 认输与解法共用的停手 |
| `src/systems/combat/bag_port.ts` | 新增 | 迷宫遗落物端口 |
| `src/systems/combat/use_gate_port.ts` | 新增 | 物品使用门（PK-M1-49 的请求） |
| `src/systems/combat/abilities.ts` | 修改 | 预警、点名、引导、强制施放、打断窗口、首领被打断进冷却、澱热失控、双手武器锁、门技冷却、净化、伤病、命中破盾 |
| `src/systems/combat/damage.ts` | 修改 | 不掷骰、护盾吸收与免伤、引导受击 25%、互动受击中断、伏击首击 |
| `src/systems/combat/death.ts` | 修改 | 认输改走 `stand_down` 与解法标记、增援随之停手、`yieldNow`、机关被打破、首领倒下、死亡规则、击杀事件的部件与继名、倒地被救起给轻伤 |
| `src/systems/combat/monster_ai.ts` | 修改 | 看到的灵压、商队优先、追门、伏击、逃跑口径、封场不拴绳、计时词缀、人形认输与逃跑 |
| `src/systems/combat/spawning.ts` | 修改 | 实体标签、夜里与天气生成（每游戏时辰重试）、出生光环、首领机关、尸体起身、首领离场带走机关 |
| `src/systems/combat/stats.ts`、`auto_attack.ts`、`control.ts`、`threat.ts`、`units.ts`、`auras.ts` | 修改 | 恢复修正、双手武器锁、激怒；命中词缀与恢复；`ccImmune`、`slowImmune`；`ignoreTaunt`；不可选中与机关的可攻击者；状态光环与覆盖参数 |
| `src/systems/combat/index.ts`、`queries.ts`、`types.ts`、`formulas.ts`、`id_fields.ts`、`death_costs.ts` | 修改 | 接线与命令 `combat.interact`；单位视图的护盾、不可选中、失衡与引导；新字段；目标击杀时间与硬狂暴时刻、引导推迟系数；`idFields`；迷宫里的遗落包 |
| `src/content/packs/combat_boss_checks.ts` | 新增 | 机制库与注册表的内容校验、两路提示的覆盖检查 |
| `src/content/packs/combat.ts` | 修改 | 接入上面的校验与机关地点检查（文件里 `borderstone_north` 的地图导入是 PK-M1-35 的改动） |
| `data/combat/abilities.json` | 修改 | 灰羽风暴、翼击、晶落、重踏、灰潮、灰雨加 `telegraph`；新增 `sk_mon_cavein`、`sk_mon_doordrain`、`sk_mon_desperateheal` |
| `data/combat/auras.json` | 修改 | 新增 `aur_st_stagger`、`aur_st_berserk`、五个模板光环、`aur_st_drunk`；PK-M1-51 的澱斑、澱热、断肢两种、淬体反冲加战斗效果字段 |
| `data/combat/monsters.json` | 修改 | 守护巨鸦三块悬石；晶背之母二次塌方；澱巨像灰壳护盾、追门与汲门 |
| `data/combat/items.json` | 修改 | 灰烬烈酒 `use.drunk: 2`（PK-M1-49 的请求） |
| `locales/zh-Hans/sys_combat.json` | 修改 | 新拒绝原因与作物修正项说明 |
| `tests/boss_mechanics.test.ts` | 新增 | 60 个用例（含通关回归的波次首领一例） |
| `src/game/autoplay/reach.ts` | 新增 | 自动玩家记住走不到的目标（通关回归，见本节的实施 2） |
| `src/game/autoplay/player.ts` | 修改 | 挑目标时跳过走不到的；被拒时记一笔 |
| `tests/autoplay_reach.test.ts` | 新增 | 3 个用例 |
| `tests/combat.test.ts`、`tests/own_ability_ids.test.ts` | 修改 | 复苏地点改读地图（地图改版）；新编号与新 `idFields` |
| `docs/40_design/systems/combat_and_classes.md`、`docs/40_design/content/catalog_abilities_talents.md` | 修改 | 19.7 实现补充、21.1 与 21.2 现状；6.3 后的新编号说明、7.7 一句 |
| `docs/70_packets/pk_m1_12_boss_mechanics/` | 新增 | 包目录三件 |
| 战斗外：`data/audio/cues.json` | 修改 | 一行 `telegraph_warn`（`combat.telegraph` 的声音） |
| 战斗外：`docs/40_design/world_state_registry.md`、`data/registry/vars.json` | 修改 | `boss.<首领>.resolved`；`vars.json` 重建（同时带上并行包已改的行） |
| 战斗外：`data/crafting/config.json` | 修改 | `drunk.aura`（PK-M1-49 的请求） |
| 战斗外：`src/systems/crafting/index.ts`、`src/systems/crafting/use_gate.ts` | 修改、删除 | 去掉临时的使用门注册（PK-M1-49 的请求，战斗已自行注册） |
| 生成物：`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 修改 | 重生成；提交时在提交树上重跑 `node tools/i18n/gen_keys.ts` 与 `node tools/i18n/extract_content.ts` |

**与设计文档不一致或文档未写而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 战斗 10.3 | "同级标准档非坦克成员最大生命"未给公式 | 非坦克职能裸装生命加标准档预算三分之一折成耐力的平均值 | 可计算、随职能数据走 | 是（README 第 11 节第 2 条） |
| 成长 9.3 | 澱斑"体力恢复 -10%" | 生命恢复 -10%（`hpRegen`） | 本作没有独立的体力池 | 是（README 第 11 节第 3 条） |
| 成长 10.2 与技能目录 7.6 | 成长写"断肢在玩家身上表现为门技冷却 +20%"，技能目录写"额外叠加" | 按技能目录：断肢光环本身带门技冷却 +20%，肢体效果照常 | 技能目录是光环编号与效果的主人 | 否（如需按成长改，只删光环的肢体字段） |
| 迷宫目录 1.1 与千门 6.3 | 遗落物 7 日与遗落包 3 日 | 迷宫外 3 日；在站着的迷宫里留到第 7 日被吞 | PK-M1-50 的推荐 | 是（README 第 11 节第 1 条） |
| 战斗 10.8 | 灰壳"夜羽的鸦群扑面可击碎一次" | 数据写 `breakBy: damage`（打穿吸收量）；机制库支持 `breakBy: ability` | 夜羽还没有这项技能 | 否（转 PK-M1-15） |
| 战斗 10.8 | 二次塌方"三到四个圆" | 每名成员脚下一个，至多 3 个 | 同屏 3 个的硬约束 | 否 |
| 战斗 11 | `frenzyOnHit` 的 `{ amount, max }` 未定读法 | 每少一成生命急速 +amount，至多 max | 主工程同名字段的读法 | 否 |
| 战斗 11 | `nightOnly` 的"白天减弱"未给数值 | 字段可写 `aura`，白天出生时挂上；不写则无效果 | 不自造平衡数值 | 否 |
| 战斗 11 | `crystalEat` 的 `{ grade }` | 另加 `items`（按顺序找背包里的晶） | 物品没有晶档标签 | 否（物品批次给晶档标签后可改读） |
| 战斗 11 | `rumorScale` 读认知系统的传闻强度 | 读修正项 `monster` 的 `rumor:<魔物>`（认知系统登记） | 战斗不导入认知系统 | 否（请求 PK-M1-18） |
| 战斗 12.2 | 警戒半径与等级 | 警戒半径仍按等级差每级 ±0.25 格缩放 | 第 11 节 `aggroRadius` 行写明 | 否 |
| 战斗 10.6 | 机关是地图声明的物件 | 首领数据按地点 ID（`at`）引用；地图还没给地点时按相对出生点的偏移放置 | 地图归 PK-M1-35 | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `data/audio/cues.json` | 预警的声音条目（两路提示） | 音频 | 已改一行 |
| `src/client/audio/audio_world.ts` | `combat.telegraph` 还没有派发到声音（`events()` 没有这一支），`telegraph_warn` 目前不会响；需要把事件的 `school` 映射到字段 | 客户端（PK-M1-24 或音频） | 请求回写 |
| `data/crafting/config.json`、`src/systems/crafting/index.ts`、`src/systems/crafting/use_gate.ts` | PK-M1-49 请求战斗自行注册使用门、给醉意光环 | PK-M1-49（已收尾） | 已改 |
| `data/npc/`（诺伊、苔丝） | 门纹孩子的实体标签 `door_mark`（追门的目标） | PK-M1-18 | 请求回写 |
| 认知系统 | 异名者的传闻强度登记为修正项 `monster`、键 `rumor:<魔物>`；`combat.kill` 的 `nameInherit` 由认知系统决定继名 | PK-M1-18 | 请求回写 |
| 世界系统 | 寻路读 `movementTraits`（穿墙、入水）；地图出口读 `arenaSealed` | 内核 | 请求回写 |
| 千门 | 回门符读 `arenaSealed`（誓锁禁回门符）；门技消耗读 `doorSkillCost` | PK-M2-13 | 请求回写 |

**PK-M1-35 的首领战场地图需求**

| 地图 | 需要的地点（ID 建议） | 用途 |
| --- | --- | --- |
| `seal_ruins_depths` | `raven_stone_w`、`raven_stone_e`、`raven_stone_s`（巢井壁上可走的边格，各 1 格） | 守护巨鸦的三块悬石；给出后把 `monsters.json` 里悬石的 `offset` 换成 `at` |
| `borderstone`（或北区地图） | `cover_north_gate`（北门门洞）、`cover_eaves_1` 到 `cover_eaves_3`（屋檐） | 灰雨的掩体（`terrain` 的 `cover`） |
| 同上 | `north_spring_square`（北泉小广场）、`orphanage_street`（孤儿院前街） | 引怪路线与灰雨落点；孤儿院前街的木屋与栅栏（`breakable`）给 `orphanage_hut_1`、`orphanage_fence_1` 等 |
| `dg_old_mine`（下层晶脉） | 无硬需求 | 二次塌方按成员脚下落 |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 记账鼠婆、迷宫专属魔物与各魔物的注册表字段取值（例：澱渣的 `ashPuddle`、澱野猪的 `charge`、坟火的 `nightOnly`）；澱巨像崩解期的澱核部位与澱渣增援；活性词缀 `afx_` 与活性期首领 | PK-M1-30 |
| 首领战场地点与物件 | PK-M1-35 |
| 夜羽的"鸦群扑面"（灰壳 `breakBy: ability`）；同伴对预警、点名、危险区的反应与 `needsOrder`；同伴读难度的反应 | PK-M1-15 |
| 淬体破关本身（调用 `temperBacklash`）；伤病"睡一夜并接受治疗" | PK-M1-15 |
| 施法条盾形边框与打断窗口、预警贴花与格集合叠图、护盾条、失衡图标、声音字幕 | PK-M1-22、PK-M1-24 |
| `combat.telegraph` 的声音派发（见上表） | 客户端 |
| 暂停的波次首领在玩家回场时仍在原阶段，但客户端 `audio_world.endBoss(false)` 换图后忘了音乐阶段，回场时按第 0 阶段放（通关回归的审查） | 客户端（音频） |
| 首领首次挑战胜率与击杀时间、预警设计伤害的复核 | PK-M1-42 |
| 注册表首需为"二"到"六"的字段 | M2、M3 的战斗包 |
| `each_member` 一律至多 3 个圆（4 人队时最后一人按编号不落圆） | 第二幕人数上去时复核 |

**全量单测**

`npm test`（末次代码改动之后，2026-11-18）：`Test Files 7 failed | 160 passed (167)`，`Tests 7 failed | 3427 passed | 2 skipped (3436)`。七条失败都不是本包：

| 失败 | 归属与依据 |
| --- | --- |
| `docs_guard` 断链 | `pk_m1_35_maps/README.md` 链到尚未建立的 `verification_matrix.md`（PK-M1-35） |
| `doors_costs` "wears off ten an hour" | 地图改版后玩家在新的醒来点附近被魔物打死，门疲被复苏重置；把 `monster_ai.ts` 换回提交版本后同样复现（PK-M1-35） |
| `art_manifest` | 基线 |
| `client_player_input` | 客户端（其他包） |
| `core` 日历、`registry` 一日旗标守卫、`ailments` 长跳 | 全量并行下超时（30 秒）；单独运行全部通过（`core` 与 `registry` 45 passed，`ailments` 与 `disputes` 85 passed） |

**通关结果**

`npm run playthrough`（末次代码改动之后）：`Test Files 5 failed | 5 passed | 1 skipped (11)`。`act1_minimal`、`release`、`rule_merca` 三条路线都停在同一处：
`no progress for 230400 ticks while: q_a1_m02_raven: 击败守护巨鸦 (not ready): travel to borderstone_north to grind Lv7`（第 605918 tick，7 级，死亡 1 次）；
`replay` 因此停在第一幕；`replay_segments` 只存到第 17 档（要 40 档）后钩子超时。

诊断（临时探针，跑完即删）：封门遗迹正门的落石开关格（`data/combat/maps/seal_ruins.json` 的 `openWhen: a1_ruins_gate_cleared OR boss.guardian_raven.defeated`，PK-M1-35 本轮新加）
在巨鸦倒下之前封住出口；自动玩家对教学首领要求高出 4 级（独行）再加败北次数，未就绪时去遗迹外练级，`world.move_to` 一直回 `unreachable`，
只能在遗迹里打 1 到 3 级的澱鼠与澱渣，7 级以后这些魔物不给经验，于是停住。卡点来自地图的门与自动玩家的就绪规则，不是首领机制；
需 PK-M1-35（落石开关的条件）或自动玩家（PK-M1-10：遗迹封住时不以练级为前提，或降低教学首领的就绪余量）处理。

为确认首领机制本身不卡路线，另跑了一次开局写 `a1_ruins_gate_cleared = true` 的第一幕路线（临时探针，跑完即删；同种子 `SEED`、`release` 路线、无模型）：
第一幕在第 568421 tick 进入第二幕，13 级，完成 20 个任务；守护巨鸦在第 410462 tick 认输（`boss.guardian_raven.resolved = yield`）；
澱巨像进入裂解后灰壳护盾升起（吸收 320）、打穿后破碎，灰雨按致命档预警，第 557688 tick 倒下；第一幕时长 568265 tick（约 19.7 个游戏日，
与 PK-M1-51 记录的"第一幕走了 20 个清晨"相当）。死亡 41 次，几乎都在新地图 `borderstone_north` 上被当地魔物打死，属地图内容与节奏（PK-M1-35、PK-M1-42）。

### 2026-11-18 实施 2：通关回归

**先量后改**

主会话在提交树（已含 PK-M1-35 的地图）上实跑，报回 `release` 与 `rule_merca` 用完 600 万 tick 预算仍 `ending=null`、死亡 332 与 362 次，`act1_minimal` 第一幕 757,552 tick。
为分清原因，在 `$TEMP` 复制了工作树逐条对比（同种子 `SEED`、无模型，临时探针跑完即删）：`a` 是 HEAD 的 `git archive`（基线），`b` 是 HEAD 加本包修前，`c` 是 HEAD 加本包修后。
探针记每幕的起点、死亡的凶手与地图、玩家受到的伤害来源、按自动玩家意图分桶的 tick；第五幕另从同一存档（HEAD 跑到第五幕时的世界）分别用 `a` 与 `c` 的代码续跑。

| 项 | a（HEAD） | b（本包修前） | 读法 |
| --- | --- | --- | --- |
| 第一幕 | 691,975 tick，13 级，53 死 | 757,552 tick，13 级，53 死 | 慢 65,577 tick，死亡一样多 |
| 第一幕的凶手 | 游荡白骨 37、澱野猪 9、澱渣 3、澱灵 2、澱巨像 2 | 游荡白骨 27、澱野猪 19、澱渣 3、澱巨像 3、澱狼 1 | 构成变了，总数不变；灵压没有让低级魔物缠住玩家（灰色击杀 140 对 103） |
| 第一幕按意图的 tick | 休息 284,009，"退开休息" 119,921 | 同上，另有"打林蛛（击退兽潮前锋）" 100,290 | 多出来的一桶就是慢掉的部分 |
| `release` 与 `rule_merca` | 2,244,122 与 1,783,298 tick 到结局，各 55 死（第五幕 2 死） | 第五幕卡住，死亡堆在无貌之王的场上 | |

**原因与修法**

| 原因 | 证据 | 修法 | 测试 |
| --- | --- | --- | --- |
| 兽潮前锋（`tide_first`，`borderstone` 的 `gate_forest_edge` 出生）有一只林蛛落在走不到的口袋格；"击退兽潮前锋"按最近的目标挑，自动玩家一直挑它，`world.move_to` 一直回 `unreachable` | 第一幕意图分桶里这一桶 100,290 tick，a 树没有；同时刻的事件里每 8 tick 一条 `unreachable` | 自动玩家记住走不到的目标（新 `src/game/autoplay/reach.ts`）：活着的玩家被拒时记下那个目标，4 个游戏时辰内挑目标（反击时不在 2 格内的、顺手清、练级与选练级地图、任务狩猎）跳过它，到时再试；点名的任务目标只剩它时仍是目标 | `tests/autoplay_reach.test.ts`（3 例，自带围墙试场；去掉过滤后 2 例失败） |
| 无貌之王是波次成员（`data/combat/waves.json` 的 `faceless_king`）。玩家退走后它的仇恨表清空，波次成员不回家，走"原地转回 idle"那一支；修前那一支调 `resetBoss`，阶段与增援记号清掉而生命不回满，下一次进场在"千貌"线以下重新进阶段、重新叫增援 | 修前从第五幕存档续跑：单次进场 `combat.adds` 连发 20 次以上，阶段事件反复 | 不回家的首领失去目标时暂停战斗（新 `pauseBoss`，`src/systems/combat/boss/index.ts`；`monster_ai.ts` 改调它）：封场打开，已宣告未出现的增援取消（那一波可以再来），战斗时钟停走（下一次进场时战斗起点、`every` 增援、计时词缀、计时盾都顺延停的时长）；脱战回满血后整场重置；回家的首领仍走 `resetBoss` | `tests/boss_mechanics.test.ts` "a wave boss left without a foe keeps its fight"（换回 `resetBoss` 即失败）与 "a paused wave boss that heals back to full"（去掉回满重置即失败） |

**第五幕的无貌之王：自动玩家打首领的方式（与本包机制无关，可单独合入）**

主会话与 PK-M1-20 查明：第五幕最后一战在 HEAD 上就对起跑 tick 敏感（同一存档先空走 N tick 再交给自动玩家，有的 N 0 死通关，有的 N 进入"死、休息、回场"的循环），结果随存档走、不随代码走。
本包用 HEAD 的代码在主会话给的两个存档（`D:/pk20_head/probe/rm_act5.json` 是 HEAD 的，`D:/pk20_diag/probe/rm_act5.json` 是 HEAD 加 PK-M1-20 的）上逐个 N 测了自动玩家（`rule_merca`，上限 40 死、40 万 tick）。
按回合的探针看到的打法问题（不是数值）：同伴倒地或刚爬起来就回场，等于独自再拉一次首领；玩家是祭司，却只给自己加血，同伴在身边被打倒；半血就跑，正在读的治疗被扔掉；首领读条自愈（澱灌）不打断。

| 改动（只在 `src/game/autoplay/`） | 做法 |
| --- | --- |
| `fight.ts` 新 `companionsReady` | 跟队的同伴都在世界里、同图的都站着、没隐身、没有"倒地虚弱"这类限时削弱（读光环数据，不写内容编号）、血量在八成以上，才算"队伍就绪"；只算 `state` 为 `party` 的成员（HEAD 的 `Member` 没有这个字段，按 `party` 读） |
| `player.ts` 点名击杀目标 | 目标是有阶位的魔物（精英、稀有、首领，读 `rank`）、没有敌人在打、队伍未就绪时，先休息等队伍，不独自拉 |
| `fight.ts` `chooseAbility` 新"1a" | 生存之后：目标读条显示可打断时，按优先级用打断技能 |
| `fight.ts` `chooseAbility` 新"1b" 与 `companionInNeed` | 最伤的同伴低于 45% 时用治疗或护盾、低于 70% 时补持续治疗（只用"对友方"的技能；看射程，并按那名同伴核一遍可用性，避免卡在护盾的冷却光环上） |
| `fight.ts` 新 `selfHeal`；`player.ts` 撤退分支、`healing()`、`rest` | 该跑时手上有治疗就先治疗（同一段输局只试一次，200 tick 内不重试）、正在读治疗就读完（血量 20% 以上）；休息时血量不满九成、灵力五成以上就用治疗回血，先放下目标（同伴在玩家施法时会去打玩家的目标），不放护盾 |

这些改动不碰战斗系统，HEAD 代码与本包代码都能用；与 `reach.ts` 那一组互不依赖，可以分开合入（见第 2 节末"可分开合入的改动"）。

同一存档、同一预算下的 N 扫描（"死 / 到第六幕的 tick"；"未"表示 40 万 tick 内没打完；修前一列 HEAD 存档的 N=2、3、5、50、100 是主会话的数）：

| N | HEAD 存档：修前（HEAD 代码） | HEAD 存档：修后（HEAD 代码） | PK-M1-20 存档：修前（HEAD 代码） | PK-M1-20 存档：修后（HEAD 代码） |
| --- | --- | --- | --- | --- |
| 0 | 0 / 15,528 | 0 / 36,838 | 未（29 死） | 0 / 34,950 |
| 1 | 2 / 30,258 | 17 / 228,436 | 未（30 死） | 1 / 63,312 |
| 2 | 3 死仍在第五幕（6 万截止） | 0 / 27,870 | 未（30 死） | 1 / 52,368 |
| 3 | 0 死 | 1 / 41,086 | 未测 | 未（29 死） |
| 5 | 0 死 | 未（25 死） | 未测 | 1 / 31,142 |
| 10 | 未（29 死） | 2 / 34,810 | 0 / 14,318 | 0 / 31,054 |
| 20 | 29 死、399,110 | 0 / 36,810 | 未（28 死） | 1 / 39,338 |
| 50 | 3 死仍在第五幕（6 万截止） | 2 / 34,810 | 未测 | 0 / 31,054 |
| 100 | 3 死仍在第五幕（6 万截止） | 0 / 36,810 | 未测 | 1 / 39,338 |

修后 18 个样本里 16 个在 40 万 tick 内进入第六幕，其中 15 个在 0 到 2 次死亡内，1 个（HEAD 存档 N=1）17 次、22.8 万 tick；仍有 2 个（HEAD 存档 N=5、PK-M1-20 存档 N=3）在 40 万 tick 内打不完（25 与 29 次死亡）。
修前同一批 N 里有 6 个打不完（28 到 30 次死亡），其余有记录的也有 3 次死亡后仍在第五幕的。没有达到"每个 N 都在少量死亡内进入第六幕"的验收。
打不完的样本按回合看都是"满队满血回场、首领每回合掉 4,000 到 5,000、同伴在 300 到 500 tick 里相继倒下、玩家撤退、首领回满"的循环，已不是独自回场。
这是队伍对这场首领战的胜率本身（第五幕玩家 35 级、同伴 33 到 34 级，打 `partySync` 同步到 35 级、3 倍生命的首领）的问题，需要 PK-M1-42 的首领首次挑战胜率复核，或自动玩家在连败后先练级。后者本包没有做，因为需要定"连败几次去练级"的数字。

**可分开合入的改动**

| 组 | 文件与片段 | 依赖 |
| --- | --- | --- |
| A：首领机制（本包主体） | `src/systems/combat/` 全部、`src/content/packs/combat*.ts`、`data/combat/` 四个文件与其余数据，含波次首领暂停（`boss/index.ts` 的 `pauseBoss`、`monster_ai.ts` 的调用与回满重置、`mech_types.ts` 的 `pausedAt`） | 无 |
| B：走不到的目标 | 新 `src/game/autoplay/reach.ts`；`player.ts` 的 `reach`、`walkFor`、`chasing`、`reachable()`、`atHand()`、`command.result` 里记一笔、`moveOnMap` 记目标、`fight()` 记目标、反击与顺手清与练级与任务狩猎的过滤、`groundWithin` 跳过；`tests/autoplay_reach.test.ts` | 无（HEAD 代码可用） |
| C：首领战打法 | `fight.ts` 的 `checkAbility` 导入、`companionInNeed`、`selfHeal`、`weakened`、`companionsReady`、`chooseAbility` 的"1a"与"1b"；`player.ts` 的 `HEAL_RETRY`、`healTriedAt`、撤退分支的治疗、`healing()`、`ranked()`、点名击杀的"等队伍"、`rest()` 的治疗；`tests/autoplay_party_ready.test.ts` | 无（HEAD 代码可用，已在 HEAD 代码上跑过上表） |

B 与 C 都只在 `src/game/autoplay/`，在 HEAD 代码上通过类型检查与单测。

**修后实跑**（本包 A 加 B 加 C，同种子 `SEED`，`$TEMP` 的副本树，跑完即删；预算、时限与路线断言都没动）

| 路线 | a：HEAD | b：本包修前（主会话实跑） | 本包加 B 加 C |
| --- | --- | --- | --- |
| 第一幕（`act1_minimal` 的跑法） | 691,975 tick，13 级，53 死 | 757,552 tick，13 级，53 死 | 700,336 tick，13 级，57 死 |
| `release` | 2,244,122 tick 到结局，55 死（第一幕 53、第五幕 2） | 600 万 tick 用完，332 死 | 2,925,086 tick 到结局，76 死（第一幕 57、第五幕 19） |
| `rule_merca` | 1,783,298 tick 到结局，55 死（第一幕 53、第五幕 2） | 600 万 tick 用完，362 死 | 2,464,259 tick 到结局，76 死（第一幕 57、第五幕 19） |

各幕 tick（本包加 B 加 C）：第二幕 531,684、第三幕 116,633、第四幕 401,238；第五幕 `release` 1,174,964、`rule_merca` 714,164（HEAD 是 494,236 与 33,436）。第五幕仍比 HEAD 长，
原因就是上面那场首领战在本次起跑 tick 上要打好几次（19 死）；HEAD 自己换一个起跑 tick 也会这样，见上表。

真实的路线测试也各跑了一次（`act1_minimal`、`release`、`rule_merca` 三个 `*.playthrough.test.ts`，本包加 B，C 之前的版本）：三条都通过断言；`release` 与 `rule_merca` 单独跑时各用 1,659 秒与 1,280 秒，在 30 分钟时限内；
同机并行跑四个以上模拟时会超过 30 分钟时限（机器负载，不是 tick）。

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 魔物不再按玩家等级套灰色规则 | 高等级玩家穿过低级区时，亡灵与澱生等无本能魔物会主动攻击；野兽两阶以下不再主动 | 通关回归；第一幕玩家与魔物都在凡阶，两阶差不出现 |
| 增援出现前有 1.2 秒出生光效 | 首领召唤比第一轮晚 1.2 秒 | 通关回归 |
| 首领的范围技能改为带预警的读条 | 守护巨鸦、晶背之母与澱巨像的范围伤害可躲，读条期间首领停步 | PK-M1-42 的节奏报告看击杀时间 |
| 工作区的 `tests/save_recovery.test.ts` 有 2 例失败（第 3 级恢复：`release` 自动玩家在 1,500 到 2,400 tick 之间没有发出命令） | 不是本包：工作区副本把 `src/game/autoplay/` 的 `fight.ts` 与 `player.ts` 换回 HEAD 仍是这 2 例失败；HEAD 加本包 A、B、C 的副本树、HEAD 代码加 B、C 的副本树都全过，差别在工作区其他包的改动 | 主会话合入顺序定下后，在合入后的树上复跑这个文件 |
