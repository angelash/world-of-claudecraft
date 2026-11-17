# PK-M1-35 序章与第一幕地图：进度与汇报

## 0. 先发布的地图与地点 ID（供 PK-M1-27 等并行包引用）

地图 ID 与图集一致；地点 ID 以[地图简报](../../40_design/world/map_briefs.md)第 3、4 节的关键地点表为准，本包新增的另列。
地球四景的门位用地点标签标出：`stage_door` 是门第一次出现的位置，`door_corner:<n>` 是第 n 次转身后门所在的转角（0 为初见处，3 为开了一条缝的那一处），`stage_start` 是开场起点。

| 地图 | 地点（按简报） | 本包新增的地点与标签 |
| --- | --- | --- |
| `divine_court`（32×24） | `antechamber`、`bench`、`spirit_mirror`、`number_board`、`curtain`、`interview_hall`、`long_table`、`sixth_chair`、`court_mirror`、`court_seat`、`witness_stand`、`evidence_stand` | 无；整体平移 (4, 4)，出生点改为 (10.5, 13.5) |
| `earth_train`（24×8） | `seat`、`opposite`、`window`、`car_door`、`gangway` | `near_corner`；门位 `car_door`（0）、`gangway`（1）、`opposite`（2）、`near_corner`（3） |
| `earth_store`（16×12） | `counter`、`freezer`、`entrance`、`aisle`、`stockroom` | `near_corner`、`sidewalk`；门位 `freezer`（0）、`stockroom`（1）、`aisle`（2）、`near_corner`（3） |
| `earth_hospital`（24×8） | `chairs`、`nurse_station`、`ward_door`、`exit_sign`、`elevator` | `near_corner`；门位 `exit_sign`（0）、`elevator`（1）、`ward_door`（2）、`near_corner`（3） |
| `earth_house`（12×10） | `old_chair`、`door_frame`、`wardrobe`、`window`、`stairs` | `near_corner`；门位 `wardrobe`（0）、`stairs`（1）、`door_frame`（2）、`near_corner`（3） |
| `gap_void`（16×16） | `fall` | 无 |
| `door_corridor`（64×16） | `wake_hall`、`knot_hall`、`mirror_hall`、`corridor_mid`、`restoration_door` | 无 |
| `dream_doorway`（16×12） | `doorway` | `dream_door`（门本身） |
| `inner_court`（48×40） | `court_arrival`、`court_center`、`court_cabin`、`court_respawn`、`court_garden_old`、`court_pond`、`court_corridor_edge`、`court_table` | 无；整体平移 (12, 10) |
| `borderstone`（96×80） | 第 4 节 A1 表全部地点 | `gate_borderstone_north_w`（西口到达点）；醉月亭地窖 `moon_cellar_stairs`（门内入口）、`moon_cellar`、`moon_cellar_landing`、`moon_cellar_barrels`、`moon_cellar_chest`、`moon_cellar_long_box`；北门到达点沿用 `gate_seal_ruins`（见第 2 节"与设计文档不一致"） |
| `borderstone_north`（128×96） | 第 4 节 A2 表全部地点 | `gate_seal_ruins`、`gate_rustridge_mine`、`gate_brokenspan_post`（各方向的到达点）、`south_of_line`（界石线以南局部一） |
| `seal_ruins`（64×48） | `wake_point`、`sigil_hall`、`corridor`、`ash_stairs`、`outer_ring`、`six_sigil_lintel`、`forbid_stele`、`gate_hall`、`shaft_top` | `west_wing`、`east_wing`、`stair_antechamber`、`gate_yard`（正门内侧的安全点）；南来的到达点沿用 `gate_borderstone` |
| `seal_ruins_depths`（48×40） | `gate_seal_ruins`、`ash_chamber`、`sealed_door`、`dead_end_cache`、`nest_shaft`、`raven_nest`、`seep_channel` | `stair_foot`（入口平台）、`rat_hole`、`boss_platform`（首领前平台） |
| `rustridge_mine`（64×64） | `mine_antechamber`、`upper_gallery`、`collapse_mouth` | `gate_borderstone_north`、`gallery_head`、`west_gallery`、`old_miner_shed`、`east_gallery`、`old_mine_stairs`、`gate_dg_old_mine` |
| `dg_old_mine`（48×48） | `crystal_vein`、`smuggler_camp`、`mother_nest`、`hollow_rift` | `gate_rustridge_mine`、`old_mine_landing`、`vent_shaft`、`old_mine_lower` |
| `forest_edge`（112×80） | 第 4 节 A6 表全部地点 | `trail_mouth`、`gate_ironhemlock_deep` |
| `ironhemlock_deep`（128×128） | 第 4 节 A7 表全部地点 | `outer_wood` |
| `brokenspan_post`（128×96） | 第 4 节 A8 表全部地点 | `greymud_flats`、`gate_ash_waste` |
| `ash_waste`（128×112） | 第 4 节 A9 表全部地点 | `digger_camp`、`ashwood_heart`（灰心）、`bone_slope`、`gate_brokenspan_post`；旧有的中层替身地点暂留（第 11 节过渡期） |
| `old_outpost`（96×80） | 第 4 节 A10 表全部地点 | `build_north`、`build_east_bank`、`build_hilltop`、`patrol_road_west`、`patrol_road_east`、`northwest_mouth` |

迷宫记录（`data/dungeons/dungeons.json`）：`dg_old_mine` 的上层是 `rustridge_mine` 的 `upper_gallery` 矩形、下层是整张 `dg_old_mine`；`dg_moon_cellar` 是边石镇上的室内层 `moon_cellar`，入口在醉月亭里的 `moon_cellar_stairs`。
地点的发现点写在地点的 `discovery` 字段（`kind` 为 `map`、`landmark`、`vista`、`secret`，`act` 为首开幕，缺省为本图首开幕）。

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施 1（进行中） | 序章 P0 扩建，P1 到 P4、X2 到 X4 新建并登记为已建 | 未提交 | 进行中 | X1，然后第一幕各图 |
| 2026-11-18 | 实施 1 | 十九张图与 A5-2 全部落成；迷宫记录、平移表、上线检查测试；他包测试的坐标按平移换算 | 未提交 | 见 `verification_matrix.md` 第 1、2 节 | 覆盖审查后修正；主会话提交 |
| 2026-11-18 | QA 1 | 覆盖审查（2 BLOCKING、7 SHOULD-FIX）后修正；三条无模型路线在门厅停住，门厅改为见过阿什即通；第一幕最短路线通过 | 未提交 | 见 `verification_matrix.md` 第 3、5 节 | 主会话在提交树上跑全量测试与两条长路线后提交 |

## 2. 汇报

### 2026-11-18 实施 1

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `data/scenes/maps.json` | 修改 | P0 扩建；新增 P1 到 P4、X2 到 X4 七张布景 |
| `data/city/maps.json` | 修改 | X1、A10 扩建 |
| `data/npc/maps.json` | 修改（只改 `borderstone`） | A1 扩建；`wallenburg` 未动 |
| `data/combat/maps/seal_ruins.json`、`seal_ruins_depths.json`、`forest_edge.json`、`ash_waste.json` | 修改 | A3、A4、A6、A9 扩建 |
| `data/combat/maps/borderstone_north.json`、`rustridge_mine.json`、`dg_old_mine.json`、`ironhemlock_deep.json`、`brokenspan_post.json` | 新增 | A2、A5、A5-2、A7、A8 |
| `data/world/atlas_maps.json` | 修改 | 十九张图与 A5-2 已建、实际尺寸；`dg_old_mine` 的幕扩到一到五 |
| `data/world/atlas_routes.json` | 修改 | 已建路线写出口；`borderstone_seal_ruins` 起点改为 `borderstone_north`、3 公里；`rustridge_deep_rift` 起点改为 `dg_old_mine`；新增 `old_mine_vent_shaft` |
| `data/world/map_shifts.json` | 新增 | 八张扩建图的平移量、新旧尺寸与锚点 |
| `data/dungeons/dungeons.json` | 修改 | `dg_seal_ruins` 的入口改到 `borderstone_north:gate_seal_ruins`；新增 `dg_old_mine`、`dg_moon_cellar`（只有层、入口与基本量，处置与魔物归 PK-M1-30） |
| `src/content/packs/combat.ts` | 修改（越界） | 导入五张新战斗图并登记编辑器文件 |
| `src/content/packs/scenes.ts` | 修改（越界） | 新游戏出生点随 P0 平移，(6.5, 9.5) 改为 (10.5, 13.5) |
| `tests/map_launch.test.ts` | 新增 | 上线检查：尺寸与图集、步行可达、开关格、发现点统计、局部澱度、地球四景的门位、迷宫层、平移表与冻结存档 |
| `tests/map_metrics.test.ts`、`world_atlas.test.ts`、`look_layer.test.ts` | 修改 | 已建图清单、豁免只剩旧水道、补登条目与路线的钉住值、按图的装饰上限、矿灯算出口提示 |
| `tests/fixtures/procedural_baseline.json` | 修改 | 八张扩建图的布局与屋顶摘要（风格包摘要不变；瓦伦堡与旧水道的摘要重算后与基线相同） |
| 他包测试里写死的坐标 | 修改（越界） | 见下方越界表 |
| `locales/zh-Hans/content.generated.json`、`src/core/text_keys.generated.ts` | 再生成 | 新地名与地点名（同时带上了其他包当下的数据） |
| `docs/70_packets/pk_m1_35_maps/` | 新增 | 本包三件 |

**地图一览**

| 编号 | 地图 | 尺寸 | 风格包 | 澱度（局部） | 出口 | 第一幕常驻魔物组 | 装饰 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | `divine_court` | 32×24 | `divine_court` | 0 | 无 | 无 | 2 |
| P1 到 P4 | `earth_train`、`earth_store`、`earth_hospital`、`earth_house` | 24×8、16×12、24×8、12×10 | `earth_modern` | 0 | 无 | 无 | 4、1、4、3 |
| X1 | `inner_court` | 48×40 | `divine_court` | 0 | 无 | 无 | 7 |
| X2 到 X4 | `gap_void`、`door_corridor`、`dream_doorway` | 16×16、64×16、16×12 | `door_corridor` | 0 | 无 | 无 | 0、4、1 |
| A1 | `borderstone` | 96×80 | `lothar_plain` | 1（北泉 2） | 北、西、东、东南、南 | 无 | 70 |
| A2 | `borderstone_north` | 128×96 | `wild_forest` | 2（线南 1） | 南、西南、北、西北、东北 | 6 | 21 |
| A3 | `seal_ruins` | 64×48 | `sealed_ruins` | 2（回廊、落灰阶 3） | 南、落灰阶 | 5 | 10 |
| A4 | `seal_ruins_depths` | 48×40 | `sealed_ruins` | 3 | 巢井顶、落灰阶 | 6（含首领后一组） | 7 |
| A5 | `rustridge_mine` | 64×64 | `forge_deep` | 2 | 矿口、旧矿阶 | 4 | 8 |
| A5-2 | `dg_old_mine` | 48×48 | `forge_deep` | 2（晶脉 3） | 旧矿阶、通风竖井（首领后） | 3（走私营地两组、晶背之母） | 7 |
| A6 | `forest_edge` | 112×80 | `wild_forest` | 1（老林深处 2） | 西、东（猎径） | 17 | 17 |
| A7 | `ironhemlock_deep` | 128×128 | `wild_forest` | 2（磷光林 3） | 西南 | 7 | 7 |
| A8 | `brokenspan_post` | 128×96 | `ash_waste` | 2 | 西南、北 | 5 | 11 |
| A9 | `ash_waste` | 128×112 | `ash_waste` | 2（晶沟、灰心 3） | 南、西南 | 4（第二幕起加 2，第三幕起加 16） | 22 |
| A10 | `old_outpost` | 96×80 | `lothar_plain` | 1 | 西、北 | 无 | 12 |

**动线度量**（`tests/map_metrics.test.ts`；各幕相同时只写一次）

| 地图 | 首次接触（米） | 安全点与警戒圈（米） | 常驻最高等级 |
| --- | --- | --- | --- |
| `borderstone_north` | 12.7 | 16.2（矿工工棚） | 8 |
| `seal_ruins` | 11.7（从苏醒点也是 9.2） | 9.5（正门内侧） | 3 |
| `seal_ruins_depths` | 10.8 | 6.5（阶底平台）、4.0（首领前平台） | 5 |
| `rustridge_mine` | 13.4 | 3.9（矿口前室） | 8 |
| `dg_old_mine` | 20.7 | 7.9（阶底平台） | 8 |
| `forest_edge` | 10.9 | 5.3（猎人营地） | 8 |
| `ironhemlock_deep` | 19.7 | 9.8（旧营地） | 12 |
| `brokenspan_post` | 21.4 | 13.6（拾荒者营火） | 9 |
| `ash_waste` | 8.8 | 3.8（荒原营火） | 第一幕 11，第二幕 27，第三到五幕 44 |

城镇与舞台（A1、A10、X1、P0 到 P4、X2 到 X4）没有常驻魔物。城镇模板的"到达点到复苏点不超过 25 米"在扩建后的边石镇达不到：出口按第 1.11 节第 2 条落在图边，北口到广场井约 34 米、东口约 46 米。

**与设计文档不一致或文档未写而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 简报 A1、第 1.11 节 | 北门内的到达点 `gate_seal_ruins` 改名 `gate_borderstone_north`；到达点一律 `gate_<来源图>` | 边石镇北门到达点沿用 `gate_seal_ruins`（现在由 A2 来），封门遗迹南来的到达点沿用 `gate_borderstone`（现在由 A2 来）；新到达点照命名规则 | 旧名被社会包的必需到达点、兽潮三个波次与迷宫记录引用，改名要跨三个包并进重命名表 | 是（README 第 11 节第 1 条） |
| 简报 A5、第 9.1 节 | A5 写了上下两层；A5-2 是 48×48 的子场景，没有简报 | 锈岭矿：矿口前室、T 形主巷、东西废巷（第二幕锈母与铁胃之处）、塌方口与旧矿阶；`dg_old_mine`：晶脉洞、走私营地、晶背之母的巢、空心石裂缝、旧通风竖井；迷宫 `dg_old_mine` 上层是主巷矩形、下层是整张旧矿 | 任务目录 A1-M06 把"上层坑道、塌方口、下层晶脉、走私营地、巢"都算在 `dg_old_mine`，A2-S22、S23 的废矿棚在锈岭矿 | 是（README 第 11 节第 2 条） |
| 简报 A5 | 塌方口到晶脉 12 米、到巢 26 米 | 塌方口经旧矿阶换图：阶底到晶脉约 17 米、到巢约 39 米 | 下层整张图落在子场景里 | 否 |
| 简报 A5 | 首领后捷径是开关格 | 旧通风竖井做成首领后开放的出口 `to_mine_vent`，直上矿口前室，加路线 `old_mine_vent_shaft` | 两层在两张图上 | 否 |
| 简报 A5 | 南出口 `to_rustridge_deep` | 不设出口；空心石裂缝在旧矿巢南墙，开关格 `hollow_rift_seal` 在第三幕打开；路线 `rustridge_deep_rift` 起点改为 `dg_old_mine`，`dg_old_mine` 的幕扩到一到五 | 深层是第三幕迷宫（M2），目标图未建 | 否 |
| 第 12 节第 2 条 | 门厅开关格，另给正门出口加 `requiresFlags` | 只设开关格，正门出口不加旗标 | 正典路线是巢井出地面后从外庭正门离开（`scene_flow.md` 的"巢井井口到南出口 16 米"）；开关格已让大厅一侧出不去 | 否 |
| 简报 A3 | 装饰合计 9 | 10：落灰阶底加一盏火盆 | `indoor` 为假之后，室外图每个出口 4 格内要有提示 | 否 |
| 简报 A2 | 营地"入口西北 9 米" | 矿工工棚离西南的西北矿道口约 9 米（矿口南侧）；南口（镇北小路）离工棚远 | 简报同时写营地在矿口南侧，只有西南口能同时满足 | 否 |
| 简报 A7 | 魔物季旗标起的刷新组与猎径开放 | 刷新组与出口暂不按旗标 | 注册表没有魔物季的旗标；请求叙事登记一个 | 否（请求） |
| 简报 A9、第 11 节 | 过渡期被迁走的组加 `act.3.entered` | 照做；门徒会两组加 `act.2.entered`；替身地点（门址、军营、红牙丘、亚龙栖处、古澱边缘）暂留在新图南部 | 第 11 节过渡期 | 否 |
| 简报 A10 | 第一幕独眼团据点的匪徒与夜间亡卫 | 不落魔物刷新点 | 枢纽图按模板不放常驻魔物；匪徒由纷争驱动 | 否 |
| 简报 A1 | 路灯 22 盏 | 现有 13 盏加 2 盏（南门外出口、矿工棚），装饰合计 70 | 枢纽城镇装饰上限 70 | 否 |
| 简报 A1 | 醉月亭地窖是"室内层" | 镇图西南角一块被墙与树围住的地窖矩形，走不进去，只由迷宫进入命令从醉月亭里的 `moon_cellar_stairs` 进出 | 图集规则不补登；同图出口不能被路线引用 | 否（客户端请求：室内层只在进入时画） |
| 简报 P1 到 P4 | 陈设件数（座椅、吊环、货架、冷柜、收银台等） | 大件用墙格（货架、冷柜、收银台、衣柜、盖布家具），小件借通用装饰（座椅为长椅、纸箱与猫箱为木箱、推床为推车） | 装饰种类表没有地球陈设 | 否（请求） |
| 简报 X1 | 外圈雾中草地随城建逐圈揭开 | 外圈画成草地与零星树，暂由庭院原有的树墙隔开 | 揭开机制属城建（M2） | 否 |
| 旅行与探索第 6.2 节 | 地点数据增加 `discovery` | 地点写 `discovery: { kind, act }`，`kind` 用英文四种，`act` 只在晚于本图首开幕时写 | 内核类型未有此字段 | 否（请求） |
| 第 12 节第 2 条 | 门厅落石在 `a1_ruins_gate_cleared` 之前为岩石 | 开关格条件写 `a1_ruins_gate_cleared OR a1_ash_met`：从苏醒到灰烬室见到阿什（`q_a1_m01_fall` 的奖励旗标）这一段出不了正门，之后门厅通 | 没有任何数据或代码写入 `a1_ruins_gate_cleared`；只按它会让遗迹内部从此只能经复活进入（第三幕 `q_a3_m09_ash` 与迷宫入口卡住）。先试过 `OR boss.guardian_raven.defeated`：三条无模型路线都在第一幕开头停住，自动玩家要先练到 7 级再打巨鸦（单人比首领高 4 级），它选的练级图要穿过关着的门厅，换图寻路不看开关格（`no progress for 230400 ticks while: q_a1_m02_raven ... travel to borderstone_north to grind Lv7`） | 是（README 第 11 节第 4 条：自动玩家看开关格、清开落石的任务写入旗标之后收回到简报原意） |
| 简报 A5 | 塌方口在 `a1_mine_cleared` 之前不通 | 开关格条件写 `a1_mine_cleared OR quest.q_a1_m06_mine == active OR quest.q_a1_m06_mine == done`；旧矿阶出口与路线 `rustridge_old_mine` 要 `quest.q_a1_m06_mine` | 同样没有写入方；一夜矿道开始之后才能下去，自动玩家在任务开始前不会选这条腿 | 否（请求：一夜矿道的奖励写入 `a1_mine_cleared`） |
| 简报 A3 | 第一幕澱渣在西、东、南回廊 | 西、东两组放在新的两翼回廊里（西翼 (9.5, 14.5)、东翼 (55.5, 13.5)），南组与两组澱鼠的游荡半径改为 1 | 魔物的警戒只看距离不看墙，苏醒点与巢井井口周围 8 米内不能有警戒圈 | 否 |
| 第 12 节第 4 条 | 林缘四组的坐标（换算后 `fe_dian_wolf_w` (19.5, 25.5)、`fe_boar_logging_e` (13.5, 50.5)、`_w` (7.5, 53.5)、`fe_grey_wolf_trail_s` (20.5, 47.5)） | 澱狼三组移进扩出的老林深处（(17.5, 13.5)、(28.5, 9.5)、(40.5, 13.5)），伐区两组移进南扩的伐区（(12.5, 58.5)、(7.5, 63.5)），猎径南组照表 | 扩建后老林与伐区本身外移；照表的位置离入口不足 8 米 | 否 |
| 第 12 节第 11 条 | 干井与村祠的岩石格换为土路格加装饰，同时让摆放跳过废墟地点 | 两格保持岩石，不放 `dry_well`、`shrine_ruin` | 摆放规则在城建代码里；只换地块会让两处废墟可以盖房（回退）；两半要一起做 | 否（请求城建） |
| 简报 A1、A3 | 出口 `to_borderstone_north`（A1 北口、A3 正门） | 照做：边石镇旧出口 `to_seal_ruins` 与封门遗迹旧出口 `to_borderstone` 改名为 `to_borderstone_north` | 出口改通 A2；图集路线随之改 | 否（注册表第 9 节一处提到旧出口名，请注册表负责方顺手改） |
| 简报 A1 | 钟楼 6 米 | 只给礼拜堂地点写墙高 4.2 米 | 外观层按地点覆盖，钟楼与礼拜堂是同一座建筑 | 否（客户端：建筑的局部塔楼） |
| 简报 A7 | 魔物巢离入口约 90 米 | 东北深林，直线约 140 米 | 128×128 的图上入口在西南、巢在东北，两条写法不能同时成立；保留方位 | 否 |
| 简报 A10 | 西口到村中心 20 米、村中心到北口 22 米 | 46 米与 39.5 米 | 出口按第 1.11 节落在扩出的图边 | 否 |
| 简报 A2、A8、A5-2 | 冬营、折桥驿、走私营地 | 冬营北边的澱野猪组移到线北；折桥驿种类写 `fort`、走私营地写 `lair` | `camp` 在旅行的休息规则里算营地，敌营与警戒圈旁的营地不该能睡 | 否 |
| 采集包（PK-M1-49）的请求 | 采集点要的地点 | 新增 `dg_old_mine:copper_vein`（晶脉洞北壁）、`borderstone:silverleaf_meadow`（镇南缓坡）、`borderstone_north:rim_nest`（线北的澱巢残迹）；磷光林沿用 `ironhemlock_deep:glowcap_grove`；家织机没有简报地点，建议用 `borderstone:farmhouse` | 简报 A1、A2、A5、A7 的采集点 | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `src/content/packs/combat.ts` | 新战斗图要进内容包 | 战斗 | 已改并告知（导入与文件表） |
| `src/content/packs/scenes.ts` | 出生点随 P0 平移 | 叙事 | 已改并告知（一行） |
| `tests/npc.test.ts` | 边石镇尺寸与出口钉住值、广场坐标、跳过室内层的可达检查 | 社会（PK-M1-18） | 已改并告知 |
| `tests/city.test.ts`、`tests/city_autonomy_bonus.test.ts` | 旧哨村与门内庭院的摆放坐标按平移换算 | 领域 | 已改并告知 |
| `tests/quest_model.test.ts` | 边石镇坐标按平移换算 | 叙事 | 已改并告知 |
| `tests/doors.test.ts`、`doors_costs.test.ts`、`doors_hints.test.ts`、`combat.test.ts`、`combat_rules.test.ts`、`party.test.ts`、`progression.test.ts`、`own_ability_ids.test.ts` | 封门遗迹、深处与林缘坐标按平移换算；林缘跟随测试的目标避开狼群 | 战斗 | 已改并告知 |
| `tests/dungeons.test.ts` | 三个层的取点坐标按平移换算 | 迷宫 | 已改并告知 |
| `tests/time_skip.test.ts`、`tests/ailments_harness.ts`、`tests/ailments_sediment_reads.test.ts` | 镇、酒馆、营地、深处、庭院坐标按平移换算；澱狼刷新点改为新位置 | 旅行、澱病 | 已改并告知 |
| `tests/act_clock.test.ts`、`cognition.test.ts`、`dialogue.test.ts`、`director.test.ts`、`goddess.test.ts` | 仍通过但坐标已落在新图别处：广场、公会、醉月亭、林缘、边石镇的坐标按平移换算 | 幕时钟、社会、叙事 | 已改并告知 |
| `data/README.md` | `world/`、`combat/`、`scenes/` 三行补上新地图与平移表 | 数据目录说明 | 已改 |

仍写着旧坐标的两处在 PK-M1-18 正在改的文件里，本包没有动：`tests/npc_society.test.ts`（边石镇 (30.5, 21.5)）、`tests/intent_classifier.test.ts`（公会 (36.5, 13.5)）。按平移表换算：边石镇加 (20, 18)。

**请求**

| 请求 | 负责方 |
| --- | --- |
| `LocationDef.discovery`（`kind`、`act`）的类型声明；发现点登记与经验（`discovery.ts`）按本包数据生成第 6.3 节的统计 | 内核、PK-M1-17 |
| 世界版本迁移步骤：按 `data/world/map_shifts.json` 平移八张扩建图上的玩家与实体坐标（`tests/map_launch.test.ts` 已验证冻结存档的实体平移后都站在可走格上） | 内核（M2 兼容承诺之前） |
| 无人地图上的魔物降频或休眠：世界每 tick 模拟所有图的魔物，新五张图的刷新点让全系统世界的耗时约增一到三成（六个游戏小时：去掉新图刷新点 3,095 与 3,305 毫秒，全部 3,557 与 4,224 毫秒） | 内核、战斗 |
| 魔物种类（图鉴尚无；刷新点位置在简报里，种类入库后落图）：`field_hare`、`forest_boar`、`ashhorn_deer`、`three_toes`、`northern_elk`、`rust_beetle`、`greyroad_smuggler`、`greyelm_deer`、`ironpine_bear`、`vein_grub`、`grayroad_foreman`、`ironbelly`、`rust_matron`、`waste_jackal`、`greybrook_crayfish`、`bone_vulture`、`toll_taker`、`greyshard_fence`、`shard_louse`、`gully_digger`、`waste_scavenger`、`old_louse`、`oldwatch_sentinel`、`bell_weeper`、`glyph_shade`、`ash_page_swarm`、`coinmouth_rat`、`tally_rat_crone`、`ashtide_vanguard` | PK-M1-12、PK-M1-30 |
| 迷宫处置与内容：`dg_old_mine`、`dg_moon_cellar` 的养毁净、核压与魔物；地窖巢主入库后在层上写 `boss` | PK-M1-30 |
| 跨图日程：猎户 `gorn`、`shiya`、`boro` 5 到 11 点在 `forest_edge:hunter_camp`（第 12 节第 15 条）；锈岭矿工模板在 `borderstone:miners_shack` 与 `borderstone_north:mine_camp`；伐木工在 `forest_edge:logging_site` | PK-M1-18 |
| 魔物季的旗标（登记后给铁杉林深处的刷新组与猎径出口加条件） | 叙事、注册表 |
| `previewPlacement` 的占用集合加入 `kind` 为 `ruin` 的地点（第 12 节第 11 条：废墟地标不能建房） | 城建 |
| 装饰种类：骨堆、塌方堆、倒木、帐篷、地球陈设（车厢座椅与吊环、货架、冷柜、收银台、自动售货机、候诊椅、输液架、轮椅、衣柜、盖布家具） | 内核（`look.ts`）、客户端 |
| 客户端：开关格开合淡入；醉月亭地窖等室内层只在玩家进入时画；虚空围起的布景不画边缘；P2 的门在 `door_corner:<n>` 地点出现 | PK-M1-24、镜头导演包 |
| 简报改写：A1 到达点的命名（视用户决定）、A5 与第 9.1 节的拆分、第 12 节第 2 条只用开关格、A2 营地方位 | 地图负责方（设计文档） |
| 写入 `a1_ruins_gate_cleared`（第 3 周清开门厅落石）与 `a1_mine_cleared`（一夜矿道的奖励）；写入方有了、自动玩家也看开关格之后，本包把开关格条件收回到这两个旗标（简报原意：门厅只看 `a1_ruins_gate_cleared`，塌方口只看 `a1_mine_cleared`） | PK-M1-33（主会话已转） |
| 自动玩家的换图寻路看开关格：`nextLeg` 只看出口旗标，走向被开关格挡住的出口会停住（覆盖审查的探针在关闭的门厅后、塌方后都复现了）；建议选腿前在活地图上核对能否走到 | PK-M1-10（主会话已转） |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 第二幕起的刷新组（A2 北坡、A5 废巷、A6 北缘、A7 北缘、A8 驿站交货点、A9 灰暴与灰烬林）与第三幕组（A3 回廊躁动层、A9 东段） | M2 地图包，种类入库之后 |
| 区域图出口：A1 南大路（苇桥村）、A9 北沿（玻璃原）、A10 旧巡逻道东段；第三幕出口：A9 与 A10 往骨原、A5-2 往锈岭矿深层 | PK-M1-17、M2 地图包 |
| X3 第六幕的中段与尽头陈设、P0 第六幕审庭外观组 | M3 |
| X1 外圈随城建揭开、A10 建设外圈 | M2 城建 |
| A9 替身内容迁出（C9、C10、E1 建成时删去，并把图集等级段写为 5 到 30） | PK-M2-20 |
