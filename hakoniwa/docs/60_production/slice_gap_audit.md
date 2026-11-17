# 序章与第一幕差距盘点（Slice Gap Audit）

> 归属：`docs/60_production/`（制作计划，正典优先级第 5 级）。
> 作用：M1 垂直切片（序章与第一幕）的"设计有、实现缺"清单：内容数据的缺口、现有数据与设计的冲突、缺口对应的实施包。开发计划第 6.4 节的波次与 PK-M1-45 到 PK-M1-58 由本文得出。
> 依据：盘点时的 `hakoniwa/data/`、`src/` 与设计文档（分幕正典、各内容目录、地图简报、界面、系统文档）；决策 D-096。
> 维护：内容批次导入后，对应行改写为"已导入"或删去；冲突改正后从第 3 节删去。只写现状，不写过程。

## 0. 一页结论

1. **数据里还是第一轮的切片。** 第一幕 13 个任务、8 张地图、35 名第一幕有名人物的人设卡、19 种第一幕魔物、11 扇第一幕门、8 个场景；目录前缀的编号（`cmm_`、`ev_`、`deed_`、`title_`、`rcp_`、`node_`、`mat_`、`eq_`、`cs_`、`mt_`、`pet_`、`mnt_`、`cut_`、`nest_`）在数据里几乎都没有记录。
2. **序章能无模型走通**：`data/scenes/prologue.json` 是一个 113 个节点的场景图，由 `src/systems/scenes/runner.ts` 运行；它要拆成七个 `cut_p_` 并按过场目录扩写，序章任务 `q_p_` 尚无数据（PK-M1-27）。
3. **现有第一幕任务与设计有多处冲突**（第 3 节），导入批次 PK-M1-33 按目录重导时一并改正，不单独打补丁。
4. **基建缺口十余项无主**，已补成 PK-M1-45 到 PK-M1-58（第 4 节）；最重的是兽潮之夜结算、任务模型扩展、纷争运行器、公会与委托板、采集与生业。

## 1. 内容缺口（设计数对实现数）

| 类别 | 设计（序章加第一幕） | 实现 | 主要缺口 | 导入源 | 包 |
| --- | --- | --- | --- | --- | --- |
| 地图 | 19 张（P0 到 P4、X1 到 X4、A1 到 A10）加迷宫子场景 `dg_old_mine`、`dg_moon_cellar` | 8 张，均为扩建前尺寸 | `earth_train`、`earth_store`、`earth_hospital`、`earth_house`、`gap_void`、`door_corridor`、`dream_doorway`、`borderstone_north`、`rustridge_mine`、`ironhemlock_deep`、`brokenspan_post` 与两个子场景 | `map_briefs.md` 第 3、4、9.1、14、15 节 | PK-M1-35 |
| 序章任务 | 主线 5、可选 2 | 0（内容在场景 `prologue` 里） | `q_p_m01` 到 `q_p_m05`、`q_p_s01`、`q_p_s02` | 任务目录（前）第 4.1 到 4.3 节；序章正典第 1、7、8 节 | PK-M1-27 |
| 第一幕主线 | 13 | 12 | `q_a1_m10_talent_sight`；并入段 A1-M08（传唤）、A1-M11（兽潮六项准备） | 任务目录（前）第 5.1、5.2 节 | PK-M1-33 |
| 支线 | 39 | 1（`q_a1_s09_coin`） | 38 条，`q_a1_s01` 到 `q_a1_s39` | 第 5.4 节 | PK-M1-33 |
| 纷争链与节点 | 9 条链、6 个节点 | 0 | `q_a1_d01` 到 `q_a1_d09` 与六个节点 | 第 5.3、5.4 节 | PK-M1-33 |
| 女神请托 | 3 | 2（`q_gl_merca_01`、`q_gl_eluen_01`） | `q_a1_g03_first_ledger` | 第 5.5 节 | PK-M1-33 |
| 委托 `cmm_a1_` | 19 | 0 | 全部 | 第 5.6 节（公式第 2.3、2.4 节） | PK-M1-33 |
| 动态事件 `ev_a1_` | 36（21 加传闻 15） | 0 | 全部 | 第 5.7 节（规则第 3 节） | PK-M1-33 |
| 兽伴羁绊壳 `q_bond_` | 约 20（第一幕兽伴 9） | 0 | 全部 | 第 8.5 节 | PK-M1-15、PK-M1-33 |
| 有名人物人设卡 | 41 | 35 | `yeyu`、`ash`、`seg_oneeye`、`ulf_lange`、`knut_naumann`、`kas_ropebridge`；另有无台词包的 `fritz_kolb`、`lene_mahler`、`wilma_ascher` | 人物目录（洛塔）第 2.1、3.1、3.4、3.6 节 | PK-M1-28 |
| 居民模板 | 17 个 `tpl_` | 4 个旧居民组 | 全部 17 个 | 人物目录（洛塔）第 6 节 | PK-M1-28 |
| 台词包 | 64 包约 4,012 句，加 `ln_party` 第一幕 20 段、共享层第一幕区域话题 234 句 | `ln_common`（100 个通用槽）、`ln_lina`、`ln_class_clergy` | 63 包、`ln_party`、区域话题、15 个 `ln_role_`、11 个 `ln_class_`、47 个吠叫池、228 个话题（`data/dialogue/topics.json` 尚不存在） | 台词目录第一幕分册第 2 到 8 节；台词目录第 3.3、4、6、7 节 | PK-M1-29 |
| 过场 | 序章 7 个 `cut_p_`（约 193 节点）；第一幕 14 个 `cut_a1_`（174 节点、546 句、55 句战斗吠叫） | 序章 1 个旧场景；第一幕 8 个旧场景（35 节点、119 句） | 全新的 `cut_a1_raven`、`cut_a1_town`、`cut_a1_talent`、`cut_a1_yeyu_memory`、`cut_a1_tide`；其余改名并扩写 | 过场目录第 3.3、4.1 到 4.3、5.1 到 5.3 节 | PK-M1-27、PK-M1-34 |
| 魔物 | 常规与精英 33、稀有 8、巢主 2、首领 4、兽潮编成 2 | 常规与精英 13、稀有 2、首领 4、旧波次 4 | 21 种常规与精英、6 种稀有、`furrow_rat_queen`、`rust_matron`、`mtide_lotha_rim`、`mtide_waste_road` | 图鉴第 3、4.1、4.2、4.11、5、6、7.2、9 节 | PK-M1-30 |
| 迷宫 | `dg_seal_ruins`、`dg_old_mine`、`dg_moon_cellar` | 0（封门遗迹只有地图） | 全部三个 | 迷宫与首领目录第 2、3.1.1 到 3.1.3、5、7.1 节 | PK-M1-30 |
| 门 | 19（序章 1 扇 8 种变体、第一幕 18 扇） | 11 | 七扇生业门 `door_craft_*`、`door_garden_granary`、`door_truth_flaw`；现有门都没有段、翼、封印、淤塞与门阶字段 | 门目录第 2.1 到 2.3、5.2、5.5、5.6、6 节 | PK-M1-32 |
| 装备 | 一档基础阶梯约 70 型（规则生成）、第一幕独有 16、巢掉落 2、套装 1 | 旧的一到二档物品 13 | 生成器产物、`eq_` 独有装备、`set_dg_seal_ruins` | 装备目录第 3.3、3.4、3.9、4.1、4.13、5.1 节 | PK-M1-31 |
| 消耗品与魔道具 | 消耗品约 73 条或族、一档魔道具 10 | 旧消耗品 6 | 约 67 个 `cs_`、全部 `mt_` | 消耗品与魔道具目录第 1.4、3、4 节（一档行） | PK-M1-31 |
| 材料、采集点、配方 | 零到一档材料 81 行、采集点 9、配方 96（一档约 58） | 旧材料 12 加 6 种 `src_*_1`、旧商品配方 7 | `mat_silverleaf`（A1-M04 需要）等、全部 `node_`、全部 `rcp_` | 采集与制作目录第 2.7、3、4、6.2、6.3、7 节 | PK-M1-31 |
| 任务物品 | 第一幕 11 | 0 | `guild_letter`、`bounty_voucher`、`otto_will` 等 | 任务目录（前）第 11 节 | PK-M1-33 |
| 事迹与称号 | 事迹 40、称号 10 | 0（无事迹系统） | 全部 | 事迹目录第 3.1 到 3.14、4 节 | PK-M1-48、PK-M1-32 |
| 同伴、兽伴与坐骑 | `yeyu`、`shiya`、`ron`、`oola`、雇佣随从 `dris`、9 种 `pet_`、`mnt_donkey` | `yeyu`、`shiya`、`ron`、`oola`、`nera` | `dris`、全部兽伴与坐骑 | 同伴第 2.1 到 2.3 节；任务目录（前）第 8.4、8.5 节 | PK-M1-15 |
| 女神 | 写定神行 12（DB-A0、DB-A1）、请托模板 9、动作与 112 行反应 | 旧动作 10、导演菜单 10 | 全部 `div_` 编号 | 女神目录第 1.6、2、4.1、5.1 到 5.7、6、8.2 节 | PK-M1-34 |

史料与收藏（遗物目录、H01 起的史料道具）与兽伴目录本次没有逐条盘点，随 PK-M1-34、PK-M1-15 导入时核对。

## 2. 基建缺口与落点

| 缺口 | 设计出处 | 包 |
| --- | --- | --- |
| 幕内周 `act_week`、`seal_unrest` 每周加 9、兽潮夜限在第 8 到 10 周的暗月夜、任务条件的周窗 | 第一幕第 1.2、7.3 节 | PK-M1-45 |
| 跳时与睡眠（A1-M12 前夜、A1-M13 入睡、A1-M06 一夜破口、S18 夜间） | 旅行第 3、4 节 | PK-M0-31 |
| 任务模型：送达、护送、调查、说服、潜行、不致死决斗、跟随、营救、采集、制作、交易、陪同等目标；纷争、委托、请托、同伴线、生业、迷宫、探索等种类；`by_other` 与过期结局、`quest.<id>.path`、开门钥事件 | 任务目录（前）第 1、2 节 | PK-M1-58 |
| 纷争链运行器与第一幕自走（VS-08） | 第一幕第 4 节；NPC 社会第 9 节 | PK-M1-46 |
| 公会登记、委托板与动态事件 | 第一幕 A1-M03、A1-M04；任务目录（前）第 2.3、2.4、3 节 | PK-M1-47 |
| 事迹、称号、图鉴与传书 | 界面第 6.3.1、6.3.2、6.3.8 节；第一幕第 9.4 节 | PK-M1-48 |
| 采集、生业、工具档、配方与剥取 | 采集与制作目录；成长第 6.3 节 | PK-M1-49 |
| 迷宫运行时与澱巢生命周期 | 迷宫与首领目录第 1 节；图鉴第 6 节 | PK-M1-50 |
| 澱染暴露、澱病与伤病 | 成长第 9、10 节；第一幕第 7.1、7.2 节 | PK-M1-51 |
| 兽潮之夜结算（防线、压力、NPC 行动判定表、玛莎出手、伤亡、归功、四条战线） | 第一幕第 8.2 到 8.7 节 | PK-M1-52 |
| 门内庭院的储物、陈列、园圃与从任意关着的门进入 | 第一幕第 9.2 节；旅行第 5.1 节 | PK-M1-53 |
| 序章舞台机制（P2、P5、P15）、造像与纸娃娃组装器、场景运行器增补（`ui` 效果、回合上限、限时选择、分段场景、战斗吠叫、重选开场） | 序章第 1 节；界面第 3.4.3 节 | PK-M1-54 |
| 第一幕审判的证物出示与评分 | 第一幕第 4.2 节；`tut_a1_present` | PK-M1-55 |
| 前世之门效果与识才之门潜质的读取方 | 序章第 2.2 节；第一幕第 5.3 节 | PK-M1-56 |
| 标 M1 而无主的界面编号 | 界面第 2 节 | PK-M1-57 |
| 魔物机制字段（`nightOnly`、`purifyTo`、`ambushEmerge`、`packFrenzy`、`deathThroes` 等）与兽潮编成的压力预算；澱巨像"追最大的门" | 图鉴第 9 节；第一幕第 10.4 节 | PK-M1-12 |
| 地图机制（开关格、地点澱度、否定旗标、跨图日程、新装饰与 `gate_site`、区域取图集区域、扩建的存档迁移） | 地图简报第 1 节 | PK-M1-16、PK-M1-35 |
| 兽伴与坐骑 | 同伴第 2.3 节 | PK-M1-15 |

## 3. 现有数据与设计的冲突

导入批次按目录重导时改正；改正前，自动玩家与通关测试以现有数据为准。

| 数据 | 冲突 | 设计出处 |
| --- | --- | --- |
| `q_a1_m02_raven` | 写入 `term.dian_known`，而玩家第一次听到"澱"是第 8 周后夜羽的 D6 节拍（D-030）；另加 `seal_looseness` 1，设计没有 | 任务目录（前）A1-M07；过场目录第 5 节 |
| `q_a1_m03_register` | 对话对象是 `bron`，设计的登记人是 `lina`；没有 100 铜的赏金段与事迹 | 任务目录（前）A1-M03 |
| `q_a1_m04_hunt` | 标题与目标不同：设计是三件 F 级委托（酒馆地窖澱鼠 4 只、`mat_silverleaf` 5 份、给 `cassian` 送信）；钱 300 对 270 | A1-M04 |
| `q_a1_m05_grey_wolf` | 没有 `act_week >= 2` 门槛；击杀数 3 对设计的 6 灰狼加 2 澱狼；无条件给同伴希雅（设计只在同猎路线临时随队，正式入队要林地之约未破或兽潮夜并肩） | A1-M05；同伴第 2.1 节 |
| `q_a1_m06_mine` | 击杀目标不限地图；没有 `crystal_mother` 目标、`act_week >= 4` 门槛与 `crystal_carapace`、`dian_shard` 奖励 | A1-M06 |
| `q_a1_m07_spring` | 种类是支线（设计为主线）；没有暗渠一战；`trust.oola` 加 20 对 10 | A1-M07 |
| `q_a1_s09_coin` | 写 `npc.nera.stance = partner`，设计里这是纷争 A1-D03 的结局、A1-M11 的门槛；目标其实是 A1-G03 的神龛引导 | A1-D03、A1-G03 |
| `q_a1_m09_trial` | 触发是"M04 到 M06 完成"，设计是 `act_week >= 8` 且 `a1_witch_trial_started`；自己写 `a1_witch_trial_started`（设计由 D02 链写）；没有 `a1_summons_answer` 段 | A1-M08、A1-M09 |
| `q_a1_m12_tide` | 开始时 `seal_unrest = 100`（设计由周时钟驱动）；无条件写 `a1_martha_strike`（设计有第 8.5 节的条件）；结束把 `seal_unrest` 归 0（设计 30 加修正）；钱 2,000 对 660；无条件给 `colossus_core`（设计是选择） | 第一幕第 8.5、8.6 节；A1-M12 |
| `q_gl_merca_01`、`q_gl_eluen_01` | 钱 500、300 对 70、55 铜；目标是笼统的"击杀 3" | 任务目录（前）第 5.5 节 |
| `data/combat/waves.json` | `tide_flood` 在设计里没有对应（设计的 `second_surge` 是目击节拍，不是战斗）；`tide_second` 缺 `raven_flock` 与条件出现的 `dian_dreg` | 第一幕第 8.2 节 |
| `MapDef.region` | 用旧编号（`borderstone_region`、`borderstone_wilds` 等），图集已有 `edgestone_area`、`ashen_waste`、`divine_realm` | 地图简报第 1.3 节 |
| `data/doors/doors.json` | `talent_sight` 第三把钥是 `a1_beast_tide_cleared`，设计是凡人当众为玩家作保（认知阈值）；希雅相关的钥读队伍 `bond`，任务目录读 `trust.shiya` | 门目录第 6 节；D-089 |
| `data/scenes/prologue.json` | 炉灶前世没有给 `lb_otherworld_menu` | 序章第 2.2 节 |

## 4. 文档之间的冲突

| 冲突 | 落点 |
| --- | --- |
| 首领等级：数据按成长第 18.2 节（`guardian_raven` 3 级、`crystal_mother` 8 级），图鉴第 3 节与任务目录第 5.1 节仍写 5 级、9 级 | PK-M0-04 |
| 第一幕地图张数：开发计划原先写 12 张，地图简报第 14 节是 19 张 | 已按地图简报改 PK-M1-35 |

## 5. 来源链接

- [development_plan.md](development_plan.md) 第 4.2、6.4 节；[roadmap.md](roadmap.md) 第 5 节；[project_state.md](project_state.md) 第 2 节
- [prologue_antechamber.md](../30_story/arcs/prologue_antechamber.md)、[act1_borderstone.md](../30_story/arcs/act1_borderstone.md)
- [catalog_quests_acts1_3.md](../40_design/content/catalog_quests_acts1_3.md)、[map_briefs.md](../40_design/world/map_briefs.md)、[progression_and_pacing.md](../40_design/progression_and_pacing.md)、[ux_and_onboarding.md](../40_design/ux_and_onboarding.md)
