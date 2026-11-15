# 世界地图构建（World Map）

> 所属：`docs/40_design/world/`（概要设计，正典优先级第 5 级）。上位依据：
> [`world_bible.md`](../../20_world/world_bible.md)（第 7、15 节）、[`geography.md`](../../20_world/geography.md)（第 0.1、2、3、4、6、7 节）、
> [`power_system.md`](../../20_world/power_system.md)（第 7.2 节澱度、第 9.6 节门内庭院、第 9.9 节门）、
> [`story_outline.md`](../../30_story/story_outline.md) 与分幕 `../../30_story/arcs/`（序章第 1 节，一幕第 2 节，二幕第 2、7 节，三幕第 2、7 节，四幕第 3、5、7 到 9 节，五幕第 6、7 节，六幕第 2、14 节）。
> 同级依据：[`content_outline.md`](../content/content_outline.md)（第 1、2 节）、[`grand_strategy_slg.md`](../systems/grand_strategy_slg.md)（第 1 节）、
> [`game_framework.md`](../game_framework.md)（第 4、6 节）、[`art_pipeline.md`](../../50_tech/art_pipeline.md)（第 1.3、1.4、5.1、5.2 节）、
> [`implementation_conventions.md`](../../50_tech/implementation_conventions.md)（第 2、4 节）。
> 姊妹文档：[`scene_flow.md`](scene_flow.md)（逐场景动线与外观层），与本文共用同一套地图 id 与编号。
> 数据：`data/world/atlas_regions.json`、`data/world/atlas_maps.json`、`data/world/atlas_routes.json`；类型与纯函数校验 `atlasProblems` 在
> `src/systems/world/atlas.ts`；三张表、编辑器表单与校验登记在 `src/content/packs/world.ts`；测试 `tests/world_atlas.test.ts`。
> 距离、行程与地名以地理志和分幕为准；正典没有给出的距离、坐落、编号与风格包由本文与 [`map_briefs.md`](map_briefs.md) 第 13 节落定。

## 0. 一页结论

- **四层，一套 id。** 世界图（大陆 SLG 地图，按省份）、区域图（节点式长途行进图，按行程表扣游戏内时间）、
  地块（连续可走的地图，出口相接）、场景（单独加载：遗迹与迷宫楼层、战场、神域）。地块与场景的 id 就是 `MapDef.id`；
  地理志 7.4 的 A1 到 A10、B1 到 B9、C1 到 C11 保留为 `code`。
- **一张图集登记全部地图。** 序章到终章共 60 个条目：已建 10（现有数据里的地图，测试场 `testfield` 除外）、
  战场网格 5（已有 `battle_scenarios` 网格，还没有地图）、规划 45。路线 61 条，分四层：步（地块出口）、区（区域图路段）、
  门（门内庭院、门址、众门环）、战（战役入口）。
- **每幕一个枢纽，全部可达。** 序章与第六幕是候见厅，第一、三、四、五幕是边石镇，第二幕是瓦伦堡，终章是造主的房间。
  校验保证每一幕的每张地图都能从该幕枢纽走到；第四、五幕的跨区域行进走世界图，按省份连线计算。
- **世界图就是 SLG 地图。** 每个地块标注所在省份，每个区域标注所在大陆区域，校验保证二者一致；
  洛萨境内的区域图路段与 `data/strategy/map.json` 的连线日数量级一致（第 2.3 节）。
- **现有数据的主要缺口：** 没有区域图行进（南大路 60 公里由一个出口直接换图）、镇北与界石线（A2）被压掉、
  荒原外缘一张图代表了荒原多幕内容、旧水道五个区压成一层、`MapDef.sediment` 用的是 0 到 7 的渲染标尺（第 6 节）。
- **制作顺序：** 先补第一幕的 A2、A5、A8、A7 与区域图行进系统，再做第二幕的苇桥村与断门厅，第三幕先荒原纵深与王都，
  第四、五幕按剧情需要逐国补城市地块，最后是终章的造主的房间（第 7 节）。

## 1. 分层与编号规则

### 1.1 四层

| 层 | 定义 | 尺寸 | 进出方式 | 时间 | 数据 |
| --- | --- | --- | --- | --- | --- |
| 世界图 | 大陆 SLG 地图：郡（现有数据是省份）与连线 | 现有数据 31 个省份 | 第四幕起在地图窗口里拉远与拉近；拉近回到省份内的地块 | 战略层按日步进，同一个世界时钟 | `data/strategy/map.json`；图集区域里唯一的 `continent` |
| 区域图 | 节点式长途行进图：节点是地块，边是超过约 15 公里的路段 | 每幕一张视图，由该幕开放的路段组成 | 走到地块的远行出口，打开区域图选目的地 | 按行程表扣游戏内时间，路上掷途中事件 | `atlas_routes` 里 `layer` 为 `region` 的路线 |
| 地块 | 连续可走的俯视地图，边缘以出口与相邻地块相接 | 建议 96×96 到 192×192 格（地理志 7.1）；现有已建为 48×32 到 60×48 | 地图出口 | 实时 | `MapDef`；`atlas_maps` 里 `tier` 为 `tile` |
| 场景 | 单独加载：遗迹与迷宫楼层、地下、战场网格、神域 | 建议 24×24 到 96×96 格 | 出口、门的能力、战役入口 | 实时；战场内冻结大地图时钟 | `MapDef` 或 `battle_scenarios`；`atlas_maps` 里 `tier` 为 `scene` |

另有两个界外领域（`realm`）：神域（候见厅、审庭、造主的房间）与庭间之隙（门内庭院）。它们不在箱庭的地理范围里，
没有区域图，也不属于任何省份。

### 1.2 id 与编号

- **id**：`<地名英文小写>` 或 `<地名>_<部位>`，英文取正典的代号（地理志第 9 节与各分幕的"新增命名"）。例：`rustridge_mine`（锈岭矿，Rustridge Mine）、
  `brokenspan_post`（折桥驿，Brokenspan Post）、`orien_isle`（奥瑞恩王岛）。战场网格写作 `<地名>_battle`，例 `reedbridge_battle`。
- **code**：地理志 7.4 的 A1 到 A10、B1 到 B9、C1 到 C11 原样保留；序章与神域用 P，私人领域用 X（P0、X1 为既定编号）。
  第四、五、六幕与终章的新编号用 D、E、F 三个系列：字母表示该图第一次承担主线功能的幕。
  一个编号下的子条目写作 `<父编号>-<序号>`，例 B6-1 是旧水道（B6）下的断门厅，C9-2 是荒原中层（C9）的门站残墟。
- **合并**：现有几张已建地图一图多用。`code` 只写一个且全表唯一，所覆盖的地理志编号写在 `covers`：
  `seal_ruins` 是 A3（覆盖 A3 与 A4 的中殿部分），`ash_waste` 是 A9（覆盖 A9、B9），`old_outpost` 是 A10（覆盖 A10、B8），
  `wallenburg` 是 B1（覆盖 B1、B2、B3）。
- **C1 灰烬边境领**不是一张地图，而是第三幕领地建设层覆盖的范围：A 系列、苇桥村（B7）、旧哨村与荒原南沿，加骨原（C1-1）、苇塘村（C1-3）。

### 1.3 什么算一张图

| 进图集 | 不进图集 |
| --- | --- |
| 地块、遗迹与迷宫、地下、战场网格、神域场景 | 建筑室内：在地块上掀顶（`art_pipeline.md` 第 5.6 节），例如醉月亭、公会、礼拜堂 |
| 规划中的同一模板多处实例（四座门站残墟、两处拾门者营地）各算一个条目 | 小于一间屋的地下室（醉月亭地窖）：作为地块室内层 |
| | 千门回廊（天赋界面兼梦境舞台）、庭镜（审庭里的道具）、序章的地球四景（过场） |
| | 只在战略层结算的战线（第五幕的夜岭关、荒原缘、瑟兰道）与只作事件节点的地点（圣徒营） |

### 1.4 尺度与行程换算

- 1 格 = 1 米 = 16 像素；玩家步行约 4.2 格每秒（`art_pipeline.md` 第 1.3 节）。
- 地块之间的距离按 4 到 10 倍压缩（地理志 7.2）：边石镇到封门遗迹 6 公里，地图上是 600 到 1500 格，实时步行 2.4 到 6 分钟。
- 游戏内 1 天约等于现实 24 分钟（`game_framework.md` 第 6 节），即实时 1 分钟约等于游戏内 1 小时。地块之间的步行由实时时钟自然消耗
  2 到 6 个游戏小时，与地理志的步行 1.5 小时同一量级，**地块路线不另外扣时**。
- 超过约 15 公里的路段走区域图（地理志 7.2）：玩家选目的地与方式，内核按路线的 `hours[方式]` 扣除游戏内时间。
  地理志的行程换算为小时：N 日按 N×24 小时，半日 12 小时，大半日 18 小时，小时照写。方式有步行 `walk`、骑马 `ride`、
  商队 `caravan`、船 `boat`（沿起点到终点方向）与回程船 `boatBack`。
- AI 居民离屏出行按同一张表结算（地块路线也登记了正典行程），保证"玩家看到的世界"和"NPC 走的世界"一致（地理志 7.2）。
- 依据：my_ai_town 的地图拓扑把路段与分钟数一起写进逻辑层（[调研 4.1、4.2 节](../../10_research/art_style/my_ai_town_visual_and_client.md)），
  图集是同一思路往上一级：地块是"地点"，路线是"带时长的路段"。

## 2. 世界图：区域与省份

### 2.1 图集区域

| id | 名称 | 层级 | 地理志区域 | 大陆图区域 | 幕 | 默认风格包 | 澱度区间 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `medius` | 梅迪乌斯大陆（世界图） | 大陆（世界图） | 梅迪乌斯大陆 | 无 | 四到五 | 无 | 无 |
| `divine_realm` | 神域 | 界外领域 | 无 | 无 | 序章、六、终章 | `divine_court` | 零 |
| `court_gap` | 庭间之隙（门内庭院） | 界外领域 | 无 | 无 | 一到五 | `divine_court` | 零 |
| `edgestone_area` | 边石镇区域 | 区域 | 洛萨王国 | `lotha` | 一到五 | `lothar_plain` | 一到二 |
| `valen_valley` | 瓦伦河谷区域（北段） | 区域 | 洛萨王国 | `lotha` | 二到五 | `valen_city` | 一到三 |
| `lotha_realm` | 洛萨王国区域 | 区域 | 洛萨王国 | `lotha` | 三到五 | `lothar_plain` | 一到三 |
| `ashen_waste` | 灰烬荒原 | 区域 | 灰烬荒原 | `ashen_waste` | 一到五 | `ash_waste` | 二到五 |
| `holy_see` | 圣艾琉恩教国 | 区域 | 圣艾琉恩教国 | `holy_see` | 四到五 | `holy_see_white` | 一到四 |
| `grantia` | 格兰提亚帝国 | 区域 | 格兰提亚帝国 | `grantia` | 四到五 | `grantia_ochre` | 一到三 |
| `mercato` | 梅尔卡托同盟与赤砧山 | 区域 | 梅尔卡托同盟与赤砧山 | `mercato` | 四到五 | `mercato_coast` | 一到三 |
| `silva` | 希尔瓦大森林 | 区域 | 希尔瓦大森林 | `silva` | 四到五 | `silva_canopy` | 零到三 |
| `windfang` | 风牙草原 | 区域 | 风牙草原 | `windfang` | 四到五 | `windfang_steppe` | 一到三 |
| `nightrealm` | 夜境 | 区域 | 夜境 | `nightrealm` | 四到五 | `night_basalt` | 二到五 |
| `sleepscale` | 眠鳞山脉 | 区域 | 眠鳞山脉 | `sleepscale` | 四到五 | `sleepscale_snow` | 一 |

- 洛萨王国在图集里拆成三个区域，对应地理志 7.4 的三组地块：边石镇区域（A）、瓦伦河谷区域（B）、洛萨王国区域（C）。
  三者都落在大陆图的 `lotha` 区域里。
- 封门遗迹按地理志 3.2 归灰烬荒原（荒原南沿，界石线以北），所以第一幕的地图分属两个区域；现有数据里它的 `region` 是 `borderstone_wilds`，只用来选风格包。
- 第四幕起各国的风格包编号以 [`../../50_tech/art_pipeline.md`](../../50_tech/art_pipeline.md) 第 1.4 节为准（取材于地理志 7.5 的主色与标志物）；风格包实装前图集用 `stylePlan` 写编号；地下场景用 `sealed_ruins`，矿坑与炉城用 `forge_deep`。
- 环海诸岛与终雾不进图集：前者是远期内容，后者主线不可到达（地理志 1.1、3.10）。

### 2.2 省份与地图

没有地图的省份只是世界图上的节点（经过、驻军、贸易），剧情需要时再补地块。

| 省份 | 名称 | 大陆图区域 | 图集地图 |
| --- | --- | --- | --- |
| `ash_border` | 灰烬边境（边石镇与旧哨村） | `lotha` | A1 `borderstone`（已建）、A2 `borderstone_north`、A5 `rustridge_mine`、A6 `forest_edge`（已建）、A7 `ironhemlock_deep`、A10 `old_outpost`（已建）、B7 `reedbridge`、C1-2 `bonefield_battle`、C1-3 `reedpond`、C11 `reedbridge_battle` |
| `wallenburg` | 瓦伦堡 | `lotha` | B1 `wallenburg`（已建）、B4 `wallenburg_outskirts`、B5 `gatefront_south`、B6 `wallenburg_sewers`（已建）、B6-1 `broken_door_hall`、B3-1 `wallenburg_harbor_battle`、C8 `blank_steles` |
| `blackoak` | 黑橡堡 | `lotha` | C4 `blackoak_keep`、C4-1 `frostbone_catacombs`、C5 `nightwind_corridor`、C5-1 `frostridge_battle` |
| `orien` | 奥瑞恩 | `lotha` | C2 `orien_isle`、C3 `orien_banks`、C3-1 `sunrise_gate_battle` |
| `sunset_haven` | 落日港 | `lotha` | 无 |
| `silversaddle` | 银鞍堡 | `lotha` | C6 `silversaddle_keep`、C6-1 `deer_ford_battle` |
| `greyelm_weald` | 苍榆林地 | `lotha` | C7 `elmfair` |
| `ash_rim` | 荒原外缘 | `ashen_waste` | A3 `seal_ruins`（已建）、A4 `seal_ruins_depths`（已建）、A8 `brokenspan_post`、A9 `ash_waste`（已建）、C1-1 `bonefield` |
| `ash_middle` | 荒原中层 | `ashen_waste` | C9 `glass_plain`、C9-1 `ash_sea`、C9-2 `gate_station_ruins`、C9-3 `gatepicker_camp` |
| `thousand_gates` | 千门都遗址 | `ashen_waste` | C10 `thousand_gates_ring`、C10-1 `thousand_gates_archive`、C10-2 `myriad_doors_ward`、E1 `thousand_gates_core`、E2 `main_gate_crater`、E3 `ashen_final_battle` |
| `firstlight` | 初光驿 | `holy_see` | 无 |
| `seran` | 瑟兰 | `holy_see` | D7 `seran`、D7-1 `martyrlight_catacombs` |
| `westpoise` | 西衡堡 | `grantia` | 无 |
| `grantis` | 格兰提斯 | `grantia` | D1 `grantis`、D1-1 `crownless_hall` |
| `redgravel` | 红砾城 | `grantia` | 无 |
| `wallheart` | 垒心城 | `grantia` | 无 |
| `scriva` | 斯克里瓦学城 | `grantia` | D2 `scriva`、D2-1 `endless_stacks` |
| `cloudstair` | 云阶城 | `grantia` | 无 |
| `scalebridge` | 秤桥城 | `mercato` | 无 |
| `goldbay` | 金湾 | `mercato` | D3 `goldbay`、D3-1 `deep_ledger_vault` |
| `redanvil` | 赤砧山 | `mercato` | E5 `redanvil` |
| `thornhedge` | 棘篱哨 | `silva` | 无 |
| `ringwood` | 环木议庭 | `silva` | D4 `ringwood_court`、D4-1 `deeproot_vale`、E4 `world_tree` |
| `frostwood` | 霜林 | `silva` | 无 |
| `fangmouth` | 牙口隘 | `sleepscale` | 无 |
| `feltmarket` | 毡市 | `windfang` | 无 |
| `windfang_rock` | 风牙岩 | `windfang` | D5 `windfang_rock` |
| `tuskgate` | 獠牙关 | `nightrealm` | 无 |
| `duskcrown` | 黯冠城 | `nightrealm` | D8 `duskcrown` |
| `edgetrial` | 试锋谷 | `nightrealm` | 无 |
| `vaulttouch` | 触穹峰 | `sleepscale` | D6 `seven_seats` |

- 省份连线比 `slg_links` 多一条：`blackoak` 到 `ash_rim`（夜风走廊西侧通往荒原东缘的小道，2 日；郡图 `cty_nightwind_south` 到 `cty_east_hamlets`，[战争目录](../content/catalog_warfare_strategy.md)第 8.2 节）。
- **战场地图**：每张 `role: battle` 的场景都有一个 `bat_` 剧本，反之亦然；对照与网格以战争目录第 5.24 节与[地图简报](map_briefs.md)第 9、10 节为准。补登的战场：`boundary_cairn_battle`（A1-1，界石之战）、`windfang_rock_battle`（D5-2，红帐血战）、
  `valen_fields_battle`（A10-1，第二战线）、`rootcourt_battle`（E4-2，根下庭之夜）、`borderstone_rear_battle`（A1-2，后方·边石）；众门环七个节点战场是各节点地图的战场变体，不另立图。
  `deer_ford_battle`、`sunrise_gate_battle` 的状态为"战场网格"。1 战场格 = 8 米 = 8×8 地图格。

### 2.3 世界图与区域图的关系

- **同一张图的两个缩放。** 地块写 `province`，区域写 `slgRegion`；校验要求省份存在，且省份的大陆图区域等于地图所在图集区域的 `slgRegion`。
- **第四、五幕的跨区域行进走世界图。** 世界图开放的幕由图集里 `continent` 条目的 `acts` 决定（第四、五幕）。
  这两幕里任何带省份的地块都是世界图上的进出点，场景只能从它的父地块进入；校验把省份连线（`slg_links`）当作边来算可达。
- **行程一致。** 洛萨境内两层都有的路段，量级吻合：边石镇到瓦伦堡区域图步行 2.5 日，大陆图 `ash_border` 到 `wallenburg` 3 日；
  瓦伦堡到黑橡堡 5 日对 5 日；瓦伦堡到奥瑞恩步行 10 日、顺流船 4 日，大陆图河运 8 日；奥瑞恩到银鞍堡 8 日对 8 日。
  大陆图的日数是军队行军（按全军最慢者），区域图是个人行程；两层并存时区域图为准，它分方式、更细。
- **个人在世界图上的行程：** 第四幕起个人跨区域旅行按 `slg_links.days` 计步行日数，骑马约为一半，门路（行路之门的门标网）瞬移不计时。
- **第四幕最短路（军队日数，从边石镇所在的 `ash_border` 出发）：**

| 目的地 | 日数 | 省份路径 |
| --- | --- | --- |
| 千门都 `thousand_gates` | 7 | ash_border、ash_rim、ash_middle、thousand_gates |
| 黯冠城 `duskcrown` | 10 | ash_border、ash_rim、tuskgate、duskcrown |
| 斯克里瓦 `scriva` | 15 | ash_border、blackoak、wallheart、scriva |
| 格兰提斯 `grantis` | 16 | ash_border、blackoak、wallheart、grantis |
| 瑟兰 `seran` | 20 | ash_border、wallenburg、orien、sunset_haven、seran（海路） |
| 金湾 `goldbay` | 21 | ash_border、wallenburg、orien、sunset_haven、goldbay（海路） |
| 触穹峰 `vaulttouch` | 23 | ash_border、blackoak、wallheart、scriva、cloudstair、vaulttouch |
| 环木议庭 `ringwood` | 24 | ash_border、ash_rim、tuskgate、duskcrown、edgetrial、frostwood、ringwood |
| 赤砧山 `redanvil` | 24 | ash_border、wallenburg、greyelm_weald、silversaddle、westpoise、redgravel、scalebridge、redanvil |
| 风牙岩 `windfang_rock` | 30 | 经环木议庭，同上再加 windfang_rock |

  几何上最短的路未必走得通：去环木议庭的最短路穿过夜境，去瑟兰要走同盟控制的金潮航线；外交与禁运会改写这张表（`grand_strategy_slg.md` 第 1.2、6.2 节）。
- 研究依据：省份图与"连地"把扩张变成路径问题，天然产生前线与要冲（[调研 4.1 节](../../10_research/open_share/city_rts_slg.md)）；
  空间要有安全区、风险区与高价值点（同上），对应图集的枢纽、野外与迷宫三种角色。

## 3. 各幕区域图

### 3.0 通则

- **节点与边。** 某一幕的区域图视图 = 该幕可玩的地图（`acts` 含该幕）+ 该幕开放的路线（`acts` 含该幕）。地块路线（步）在区域图上画成短边，不扣时。
- **开放条件。** 一张图在某幕是否可去由它的 `acts` 决定；一条路线何时开放写在 `opens`（设计措辞）与 `requiresFlags`（真实旗标）里。
  不可去的远方只以路名与传闻出现（例：第三幕区域图上光径北支通向初光驿，是圣战军的来路，不可进入）。
  依据：门槛要写清目的、条件、提示与解锁路径（[调研 3.1 节](../../10_research/open_share/game_dev_methodology.md)）。
- **途中事件。** 区域图路段带事件池 `events`，取值如下。掷法（细则见 [`../systems/travel_and_exploration.md`](../systems/travel_and_exploration.md) 第 3 节）：每 24 小时行程掷一次，基础概率 15%，
  两端地图较高的澱度每高于一级加 5%，从该路段的事件池里等权抽取；骑马与船按实际耗时折算次数。AI 居民离屏出行同样掷，结果以摘要入社会层。

| 标签 | 事件 | 常见路段 |
| --- | --- | --- |
| `bandits` | 劫匪 | 南大路北段、旧巡逻道东段 |
| `monsters` | 魔物 | 北境与林地的路段、荒原 |
| `undead` | 亡灵（灰民夜行） | 荒原、旧巡逻道东段 |
| `ashstorm` | 灰暴（Ashstorm，能见度降到数步之内） | 荒原中层与外环 |
| `caravan` | 商队 | 南大路、瓦伦河谷、王道 |
| `refugees` | 难民 | 南大路（第二幕起）、苍榆林地 |
| `patrol` | 巡逻（王国与边境军） | 瓦伦河谷、王道、北境大道 |
| `church_patrol` | 教会巡查 | 南大路（第二幕） |
| `pilgrims` | 朝圣者 | 瓦伦河谷（与光径北支并行）、回泉路 |
| `army` | 军队（行军与征发） | 第三幕的王道与北境大道、第五幕的进军线 |
| `rumor` | 传闻 | 有驿站与商队的大路 |
| `smugglers` | 走私者（灰路） | 荒原外缘到中层 |
| `weather` | 天气（第三幕第 9 到 18 周的冬季、暴风雪） | 北境大道、旧巡逻道东段、无字碑林 |

- **门的瞬移线**（地理志 7.2）：行路之门初阶（第二幕第 8 周前后）只在至多三处亲手安放的门标之间往返，门标由玩家放置，不进图集；
  进阶（第三幕）在复原的门址之间瞬移，图集登记 `gate_link_thirty_seven`（第三十七门与荒原门站）；第五幕千径之门连成众门环（第 3.6 节）。

### 3.1 序章：候见厅

单场景 `divine_court`，没有区域图。玩家从这里坠入封门遗迹（`data/quests/acts.json` 第一幕的入口是 `seal_ruins` 的 `wake_point`）。

### 3.2 第一幕：边石镇区域（无区域图）

活动半径约 15 公里（地理志 4.6），全部是地块步行；南大路在幕末伯爵来信后开放。门内庭院在幕末的梦后开启。

| id | 起点 | 终点 | 层 | 路名 | 公里 | 步行 | 骑马 | 其他 | 开放 | 途中事件 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `borderstone_seal_ruins` | `borderstone` | `seal_ruins` | 步 | 镇北小路（上残阶坡） | 6 | 1.5 小时 | 0.5 小时 |  |  |  | 已建 |
| `seal_ruins_stairs` | `seal_ruins` | `seal_ruins_depths` | 步 | 落灰阶 |  |  |  |  |  |  | 已建 |
| `seal_ruins_shaft` | `seal_ruins_depths` | `seal_ruins` | 步 | 巢井 |  |  |  | 单向 | 击败守护巨鸦后攀上巢井；`boss.guardian_raven.defeated` |  | 已建 |
| `borderstone_forest_edge` | `borderstone` | `forest_edge` | 步 | 东门外林缘路 | 3 | 0.7 小时 |  |  |  |  | 已建 |
| `borderstone_old_outpost` | `borderstone` | `old_outpost` | 步 | 旧巡逻道（贴铁杉林南缘东行） | 12 | 12 小时 | 2 小时 |  |  |  | 已建 |
| `old_outpost_ash_waste` | `old_outpost` | `ash_waste` | 步 | 北小道 | 8 |  |  |  |  |  | 已建 |
| `borderstone_inner_court` | `borderstone` | `inner_court` | 门 | 门内庭院之门 |  |  |  |  | 第一幕末梦后开启；从任意地点进入，返回原处（图上以本幕枢纽代表）；`feature.inner_court` |  | 已建 |
| `borderstone_north_road` | `borderstone` | `borderstone_north` | 步 | 西北矿道口 | 3 | 0.7 小时 |  |  |  |  | 规划 |
| `rustridge_mine_mouth` | `borderstone_north` | `rustridge_mine` | 步 | 锈岭矿口 |  |  |  |  | 第 2 到 3 周的矿道委托；下层在一夜打通塌方后开放 |  | 规划 |
| `forest_edge_deep` | `forest_edge` | `ironhemlock_deep` | 步 | 猎径 |  |  |  |  | 魔物季（第 7 周前后） |  | 规划 |
| `ash_road_upstream` | `borderstone_north` | `brokenspan_post` | 步 | 灰路（沿灰溪逆流而上） | 12 | 15 小时 |  |  |  |  | 规划 |
| `brokenspan_crystal_gully` | `brokenspan_post` | `ash_waste` | 步 | 灰路（往晶沟） | 5 |  |  |  |  |  | 规划 |

### 3.3 第二幕：瓦伦河谷北段区域图

节点：边石镇、苇桥村、瓦伦堡、旧哨村、荒原外缘（地理志 7.3）。本幕前半没有传送，往返要走路，路上有难民、商队、魔物与教会的巡查（二幕 2.1）；
第 8 周前后行路之门初阶开启。王都与他国不开放，只以传闻、信件、使者出现（二幕 2.4）。

| id | 起点 | 终点 | 层 | 路名 | 公里 | 步行 | 骑马 | 其他 | 开放 | 途中事件 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `borderstone_wallenburg` | `borderstone` | `wallenburg` | 区 | 南大路（经苇桥村不停留） | 60 | 2.5 日 | 1 日 | 商队 3 日 | 第一幕末伯爵来信后开放 | 商队、难民、魔物、教会巡查、传闻 | 已建 |
| `wallenburg_sewers_well` | `wallenburg` | `wallenburg_sewers` | 步 | 泥巷井口 |  |  |  |  |  |  | 已建 |
| `south_road_north` | `borderstone` | `reedbridge` | 区 | 南大路北段（沿灰溪东岸） | 30 | 1 日 | 12 小时 | 商队 1.5 日 |  | 商队、难民、劫匪、教会巡查 | 规划 |
| `south_road_south` | `reedbridge` | `wallenburg` | 区 | 南大路南段（过苇桥转入瓦伦河谷） | 30 | 1 日 | 12 小时 | 商队 1.5 日 |  | 商队、难民、传闻、教会巡查 | 规划 |
| `wallenburg_north_gate` | `wallenburg` | `wallenburg_outskirts` | 步 | 北门 |  |  |  |  |  |  | 规划 |
| `gatefront_ferry` | `wallenburg` | `gatefront_south` | 步 | 门前渡 |  |  |  |  |  |  | 规划 |
| `sewers_broken_door_hall` | `wallenburg_sewers` | `broken_door_hall` | 步 | 断门厅铁闸 |  |  |  |  | 第二幕第 13 周的仪式（钥匙是伯爵印戒） |  | 规划 |
| `ferry_watergate` | `wallenburg_sewers` | `gatefront_south` | 步 | 渡口水门 |  |  |  |  | 第二幕第 7 周发现 |  | 规划 |
| `wallenburg_harbor_battle_call` | `wallenburg` | `wallenburg_harbor_battle` | 战 |  |  |  |  |  | 第二幕第 13 周夜，断门厅仪式之后 |  | 已建 |

### 3.4 第三幕：洛萨王国区域图与荒原纵深

节点：灰烬边境领（边石镇、旧哨村、苇桥村、封门遗迹）、瓦伦堡、奥瑞恩、银鞍堡与榆集、黑橡堡与夜风走廊南段、无字碑林；荒原外缘、中层与千门都外环。
冬季（第 9 到 18 周）行军变慢；千门都外环澱度四，停留限时；核心只能从千门书库屋顶远望（三幕 2.2、2.3）。
帝国、夜境、教国不开放，区域图上只画到国界与夜风走廊南段。

| id | 起点 | 终点 | 层 | 路名 | 公里 | 步行 | 骑马 | 其他 | 开放 | 途中事件 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `old_outpost_bonefield` | `old_outpost` | `bonefield` | 步 | 界石线外北坡 | 6 |  |  |  | 第三幕第 2 周 |  | 规划 |
| `bonefield_rim` | `bonefield` | `ash_waste` | 步 | 外缘 |  |  |  |  |  |  | 规划 |
| `bonefield_battle_call` | `old_outpost` | `bonefield_battle` | 战 |  |  |  |  |  | 第三幕第 2 周夜 |  | 已建 |
| `reedpond_path` | `reedbridge` | `reedpond` | 步 | 芦苇沼小径 |  |  |  |  | 第三幕第 11 周门纹共鸣 |  | 规划 |
| `reedbridge_battle_call` | `reedbridge` | `reedbridge_battle` | 战 |  |  |  |  |  | 第三幕第 20 到 21 周 |  | 已建 |
| `valen_river` | `wallenburg` | `orien_banks` | 区 | 瓦伦河谷（河路与陆路并行） | 240 | 10 日 | 5.5 日 | 船 4 日；回程船 8 日 | 第三幕第 4 周王都觐见 | 商队、巡逻、朝圣者、传闻、军队 | 规划 |
| `orien_bridges` | `orien_banks` | `orien_isle` | 步 | 王岛的两座石桥 |  |  |  |  |  |  | 规划 |
| `sunrise_gate_battle_call` | `orien_banks` | `sunrise_gate_battle` | 战 |  |  |  |  |  | 第三幕第 16 周夜（可选） |  | 战场网格 |
| `kings_road` | `orien_banks` | `silversaddle_keep` | 区 | 王道（横原大道西段） | 180 | 8 日 | 4 日 |  |  | 商队、巡逻、军队、传闻 | 规划 |
| `silversaddle_elmfair` | `silversaddle_keep` | `elmfair` | 区 | 苍榆林地小路 | 50 | 2 日 | 1 日 |  |  | 难民、魔物、传闻 | 规划 |
| `deer_ford_battle_call` | `silversaddle_keep` | `deer_ford_battle` | 战 |  |  |  |  |  | 第三幕第 7 到 8 周 |  | 战场网格 |
| `northern_march_road` | `wallenburg` | `blackoak_keep` | 区 | 北境大道（沿瓦伦河上溯） | 120 | 5 日 | 3 日 | 船 4 日 | 第三幕第 9 周 | 巡逻、军队、魔物、天气 | 规划 |
| `old_patrol_road_east` | `old_outpost` | `blackoak_keep` | 区 | 旧巡逻道东段（荒原南缘与北境丘陵之间） | 100 | 4 日 | 2.5 日 |  | 第三幕第 9 周 | 魔物、亡灵、劫匪、天气 | 规划 |
| `nightwind_south_mouth` | `blackoak_keep` | `nightwind_corridor` | 步 | 夜风走廊南口 |  |  |  |  |  |  | 规划 |
| `frostbone_gate` | `blackoak_keep` | `frostbone_catacombs` | 步 | 城外合葬坑 |  |  |  |  |  |  | 规划 |
| `frostridge_battle_call` | `nightwind_corridor` | `frostridge_battle` | 战 |  |  |  |  |  | 第三幕第 10 到 11 周 |  | 已建 |
| `blank_steles_trail` | `wallenburg` | `blank_steles` | 区 | 北境丘陵西端谷地 | 70 | 3 日 | 1.5 日 |  | 第三幕第 5 周起 | 魔物、传闻、天气 | 规划 |
| `rim_to_glass_plain` | `ash_waste` | `glass_plain` | 区 | 无路（外缘到中层） | 35 | 2 日 |  |  | 第三幕第 13 周 | 灰暴、亡灵、魔物、走私者 | 规划 |
| `glass_plain_ash_sea` | `glass_plain` | `ash_sea` | 区 | 无路（中层西侧） | 25 | 2 日 |  |  |  | 灰暴、魔物 | 规划 |
| `glass_plain_gate_station` | `glass_plain` | `gate_station_ruins` | 步 | 门站残墟 |  |  |  |  |  |  | 规划 |
| `glass_plain_gatepicker_camp` | `glass_plain` | `gatepicker_camp` | 步 | 拾门者营地 |  |  |  |  |  |  | 规划 |
| `glass_plain_outer_rings` | `glass_plain` | `thousand_gates_ring` | 区 | 无路（中层到外环） | 35 | 2.5 日 |  |  | 第三幕第 14 周（深澱，停留限时） | 灰暴、亡灵 | 规划 |
| `outer_rings_archive` | `thousand_gates_ring` | `thousand_gates_archive` | 步 | 书库倒塌的正门 |  |  |  |  |  |  | 规划 |
| `outer_rings_myriad_doors` | `thousand_gates_ring` | `myriad_doors_ward` | 步 | 万户街的门 |  |  |  |  |  |  | 规划 |
| `gate_link_thirty_seven` | `wallenburg_sewers` | `gate_station_ruins` | 门 | 第三十七门与荒原门站 |  |  |  |  | 以门纹复原一座门站后（行路之门进阶），门址之间可瞬移 |  | 规划 |

### 3.5 第四幕：世界图

立国后世界图开放（`feature.slg`）。跨区域行进走世界图（第 2.3 节），区域内的路线如下。剧情需要的地图：

| 纷争或事件 | 地图 |
| --- | --- |
| 立国（界石垒在封门遗迹前） | `seal_ruins`、`borderstone` |
| 强者之宴 | `grantis`、`crownless_hall` |
| 莫伊拉揭开同构 | `scriva`、`endless_stacks` |
| 经济战与钥匙失窃 | `goldbay`、`deep_ledger_vault`；线索回到 `wallenburg_sewers` 与 `broken_door_hall`、`duskcrown`（夜境黑市）、荒原 |
| 森林的秘密 | `ringwood_court`、`world_tree`、`deeproot_vale` |
| 兽王之争 | `windfang_rock` |
| 七国会盟 | `seven_seats` |
| 异端之国（可选潜入） | `seran`、`martyrlight_catacombs` |

| id | 起点 | 终点 | 层 | 路名 | 公里 | 步行 | 骑马 | 其他 | 开放 | 途中事件 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `grantis_palace` | `grantis` | `crownless_hall` | 步 | 皇宫深处 |  |  |  |  | 剑帝的请柬（建国事件链第 7 步） |  | 规划 |
| `scriva_stacks` | `scriva` | `endless_stacks` | 步 | 总院书库 |  |  |  |  | 莫伊拉现身的触发条件成立后 |  | 规划 |
| `goldbay_vault` | `goldbay` | `deep_ledger_vault` | 步 | 梅尔卡大神殿地下 |  |  |  |  | 深账库之夜之后 |  | 规划 |
| `wellspring_path` | `ringwood_court` | `world_tree` | 区 | 回泉路（林中无路，靠精灵向导） | 40 | 2 日 |  |  |  | 魔物、朝圣者、天气 | 规划 |
| `rootcourt_path` | `world_tree` | `deeproot_vale` | 步 | 秘密小径 |  |  |  |  | 森林的秘密第 1 步（林中烟） |  | 规划 |
| `seran_catacombs` | `seran` | `martyrlight_catacombs` | 步 | 大圣堂地下 |  |  |  |  | 后期潜入 |  | 规划 |

### 3.6 第五幕：进军线、战线与众门环

- **进军线**：封门遗迹到主门坑约 100 公里，灰地 6 到 7 日（地理志 4.3）。图集的三段 `rim_to_glass_plain`（2 日）、`glass_plain_outer_rings`（2.5 日）、
  `outer_rings_core`（2 日）合计 6.5 日。
- **战线**（五幕 7.2）：主门坑（核心）是首领战场 `main_gate_crater`；北线夜岭关、东线荒原缘、南线瑟兰道由战略层结算，
  联军战场网格是 `ashen_final_battle`；后方·边石落在 `borderstone` 与 `seal_ruins`；门环线是下表的六条门路线。
- **众门环**（五幕 6.2）：

| 节点 | 地图 | 路线 | 条件 |
| --- | --- | --- | --- |
| 一 主门坑（核心） | `main_gate_crater` | 六条门路线的起点 | 必建 |
| 二 世界树根下 | `world_tree` | `ring_treeroot` | 根下庭未被毁 |
| 三 炉心 | `redanvil` | `ring_forgeheart` | 已与矮人签凡约 |
| 四 祖灵石 | `windfang_rock` | `ring_ancestor_stone` | 兽王之争的结果允许 |
| 五 月井 | `duskcrown` | `ring_moonwell` | 月下之约，或夜后已倒向联盟 |
| 六 旧水道 | `broken_door_hall` | `ring_old_waterways` | 瓦伦堡的掌权者友好 |
| 七 眠鳞碑下 | `seven_seats` | `ring_sleepscale_foot` | 艾斯卡同意 |

| id | 起点 | 终点 | 层 | 路名 | 公里 | 步行 | 骑马 | 其他 | 开放 | 途中事件 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `outer_rings_core` | `thousand_gates_ring` | `thousand_gates_core` | 区 | 封门到主门坑的进军线（核心段） | 30 | 2 日 |  |  |  | 灰暴、亡灵、军队 | 规划 |
| `core_crater` | `thousand_gates_core` | `main_gate_crater` | 步 | 坑沿 |  |  |  |  |  |  | 规划 |
| `ashen_final_battle_call` | `main_gate_crater` | `ashen_final_battle` | 战 |  |  |  |  |  | 1000 年夏至前后，灰烬决战 |  | 已建 |
| `ring_treeroot` | `main_gate_crater` | `world_tree` | 门 | 众门环：世界树根下 |  |  |  |  | 千径之门开启，玩家亲临并以门钥或执钥人锁定节点 |  | 规划 |
| `ring_forgeheart` | `main_gate_crater` | `redanvil` | 门 | 众门环：炉心 |  |  |  |  | 同上，且已与矮人签凡约 |  | 规划 |
| `ring_ancestor_stone` | `main_gate_crater` | `windfang_rock` | 门 | 众门环：祖灵石 |  |  |  |  | 同上，且兽王之争的结果允许 |  | 规划 |
| `ring_moonwell` | `main_gate_crater` | `duskcrown` | 门 | 众门环：月井 |  |  |  |  | 同上，且有月下之约或夜后已倒向联盟 |  | 规划 |
| `ring_old_waterways` | `main_gate_crater` | `broken_door_hall` | 门 | 众门环：旧水道 |  |  |  |  | 同上，且瓦伦堡的掌权者友好 |  | 规划 |
| `ring_sleepscale_foot` | `main_gate_crater` | `seven_seats` | 门 | 众门环：眠鳞碑下 |  |  |  |  | 同上，且艾斯卡同意 |  | 规划 |

### 3.7 第六幕与终章

- 第六幕回到 `divine_court`（候见厅变为审庭）。审期危机的"下庭"是庭镜上出现的门，把玩家送回箱庭里已有的地图处理危机，
  不另建地图，也不进图集路线（六幕 2.4）。
- 终章的隐藏结局在 `maker_room`：门出现在千门回廊尽头（界面，不是地图）或玩家地球上的房间里（过场），所以它自成一幕的枢纽（六幕 14.2）。

## 4. 地图总表

列说明：幕写可玩的幕（含回访），"序章"为 0、"终章"为 7；澱度用 `power_system.md` 第 7.2 节的六级；尺寸是格，规划条目写建议值；
状态"战场网格"表示已有 `battle_scenarios` 网格、尚无地图。连接列：步（地块出口）、区（区域图路段，带公里）、门（门的能力）、
战（战役入口）、世（第四、五幕经世界图，带省份）。现有数据里的地图名与图集名不同时，以图集名为设计名，数据名见各条 `note`。

### 4.1 序章、神域与私人领域

| 编号 | id | 名称 | 层 | 幕 | 风格包 | 澱度 | 等级段 | 尺寸 | 角色 | 状态 | 连接 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | `divine_court` | 候见厅（审庭） | 场景 | 序章、六 | `divine_court` | 零 清域 | 无 | 24×16 | 舞台 | 已建 | 无（单场景） |
| X1 | `inner_court` | 门内庭院 | 场景 | 一到五 | `divine_court` | 零 清域 | 无 | 24×20 | 私人 | 已建 | 门 borderstone |

### 4.2 第一幕：A 系列

| 编号 | id | 名称 | 层 | 幕 | 风格包 | 澱度 | 等级段 | 尺寸 | 角色 | 状态 | 连接 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | `borderstone` | 边石镇 | 地块 | 一到五 | `lothar_plain` | 一 薄澱 | 1 到 15 | 56×44 | 枢纽 | 已建 | 步 seal_ruins 6；步 forest_edge 3；步 old_outpost 12；区 wallenburg 60；门 inner_court；步 borderstone_north 3；区 reedbridge 30；世 ash_border |
| A2 | `borderstone_north` | 镇北与界石线 | 地块 | 一到五 | `wild_forest` | 二 积澱 | 3 到 8 | 128×96 | 野外 | 规划 | 步 borderstone 3；步 rustridge_mine；步 brokenspan_post 12；世 ash_border |
| A3（含 A4） | `seal_ruins` | 封门遗迹（外庭、中殿） | 场景 | 一到五 | `sealed_ruins` | 二 积澱 | 1 到 4 | 36×28 | 迷宫 | 已建 | 步 borderstone 6；步 seal_ruins_depths；步 seal_ruins_depths（单向来） |
| A4 | `seal_ruins_depths` | 封门遗迹深处（回廊、鸦巢、灰烬之厅） | 场景 | 一到五 | `sealed_ruins` | 三 浓澱 | 1 到 8 | 30×24 | 迷宫 | 已建 | 步 seal_ruins；步 seal_ruins（单向去） |
| A5 | `rustridge_mine` | 锈岭矿 | 场景 | 一到五 | `sealed_ruins` | 二 积澱 | 5 到 10 | 64×64 | 迷宫 | 规划 | 步 borderstone_north |
| A6 | `forest_edge` | 铁杉林林缘 | 地块 | 一到五 | `wild_forest` | 一 薄澱 | 2 到 10 | 48×32 | 野外 | 已建 | 步 borderstone 3；步 ironhemlock_deep；世 ash_border |
| A7 | `ironhemlock_deep` | 铁杉林深处 | 地块 | 一到五 | `wild_forest` | 二 积澱 | 8 到 13 | 128×128 | 野外 | 规划 | 步 forest_edge；世 ash_border |
| A8 | `brokenspan_post` | 灰溪上游与折桥驿 | 地块 | 一到五 | `ash_waste` | 二 积澱 | 7 到 12 | 128×96 | 野外 | 规划 | 步 borderstone_north 12；步 ash_waste 5；世 ash_rim |
| A9（含 B9） | `ash_waste` | 荒原外缘（灰烬林、晶沟） | 地块 | 一到五 | `ash_waste` | 二 积澱 | 8 到 30 | 48×40 | 野外 | 已建 | 步 old_outpost 8；步 brokenspan_post 5；步 bonefield；区 glass_plain 35；世 ash_rim |
| A10（含 B8） | `old_outpost` | 旧巡逻道与旧哨村 | 地块 | 一到五 | `lothar_plain` | 一 薄澱 | 8 到 30 | 48×40 | 枢纽 | 已建 | 步 borderstone 12；步 ash_waste 8；步 bonefield 6；战 bonefield_battle；区 blackoak_keep 100；世 ash_border |

### 4.3 第二幕：B 系列

| 编号 | id | 名称 | 层 | 幕 | 风格包 | 澱度 | 等级段 | 尺寸 | 角色 | 状态 | 连接 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B1（含 B2、B3） | `wallenburg` | 瓦伦堡 | 地块 | 二到五 | `valen_city` | 一 薄澱 | 15 到 30 | 60×48 | 枢纽 | 已建 | 区 borderstone 60；步 wallenburg_sewers；区 reedbridge 30；步 wallenburg_outskirts；步 gatefront_south；战 wallenburg_harbor_battle；区 orien_banks 240；区 blackoak_keep 120；区 blank_steles 70；世 wallenburg |
| B4 | `wallenburg_outskirts` | 瓦伦堡城外 | 地块 | 二到五 | `lothar_plain` | 一 薄澱 | 15 到 22 | 160×128 | 野外 | 规划 | 步 wallenburg；世 wallenburg |
| B5 | `gatefront_south` | 门前渡南岸 | 地块 | 二到五 | `lothar_plain` | 一 薄澱 | 15 到 30 | 96×96 | 野外 | 规划 | 步 wallenburg；步 wallenburg_sewers；世 wallenburg |
| B6 | `wallenburg_sewers` | 旧水道迷宫 | 场景 | 二到五 | `sealed_ruins` | 三 浓澱 | 16 到 30 | 40×30 | 迷宫 | 已建 | 步 wallenburg；步 broken_door_hall；步 gatefront_south；门 gate_station_ruins |
| B6-1 | `broken_door_hall` | 断门厅 | 场景 | 二到五 | `sealed_ruins` | 三 浓澱 | 28 到 30 | 48×48 | 迷宫 | 规划 | 步 wallenburg_sewers；门 main_gate_crater |
| B7 | `reedbridge` | 苇桥村与南大路 | 地块 | 二到五 | `lothar_plain` | 一 薄澱 | 15 到 30 | 128×96 | 枢纽 | 规划 | 区 borderstone 30；区 wallenburg 30；步 reedpond；战 reedbridge_battle；世 ash_border |
| B3-1 | `wallenburg_harbor_battle` | 城下潮（下城与河港） | 场景 | 二 | `valen_city` | 一 薄澱 | 27 到 30 | 32×20 | 战场 | 战场网格 | 战 wallenburg |

### 4.4 第三幕：C 系列

| 编号 | id | 名称 | 层 | 幕 | 风格包 | 澱度 | 等级段 | 尺寸 | 角色 | 状态 | 连接 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C1-1 | `bonefield` | 骨原 | 地块 | 三到五 | `ash_waste` | 二 积澱 | 30 到 34 | 128×128 | 野外 | 规划 | 步 old_outpost 6；步 ash_waste；世 ash_rim |
| C1-2 | `bonefield_battle` | 骨原夜袭 | 场景 | 三 | `wild_forest` | 二 积澱 | 30 到 32 | 36×22 | 战场 | 战场网格 | 战 old_outpost |
| C1-3 | `reedpond` | 苇塘村 | 地块 | 三到五 | `wild_forest` | 一 薄澱 | 34 到 38 | 96×96 | 野外 | 规划 | 步 reedbridge；世 ash_border |
| C2 | `orien_isle` | 奥瑞恩王岛 | 地块 | 三到五 | `valen_city` | 一 薄澱 | 32 到 45 | 128×96 | 舞台 | 规划 | 步 orien_banks；世 orien |
| C3 | `orien_banks` | 奥瑞恩两岸 | 地块 | 三到五 | `valen_city` | 一 薄澱 | 32 到 45 | 192×160 | 枢纽 | 规划 | 区 wallenburg 240；步 orien_isle；战 sunrise_gate_battle；区 silversaddle_keep 180；世 orien |
| C3-1 | `sunrise_gate_battle` | 朝阳门之夜（可选） | 场景 | 三 | `valen_city` | 一 薄澱 | 40 到 44 | 64×48 | 战场 | 战场网格 | 战 orien_banks |
| C4 | `blackoak_keep` | 黑橡堡 | 地块 | 三到五 | `valen_city` | 二 积澱 | 36 到 45 | 128×128 | 枢纽 | 规划 | 区 wallenburg 120；区 old_outpost 100；步 nightwind_corridor；步 frostbone_catacombs；世 blackoak |
| C4-1 | `frostbone_catacombs` | 霜骨墓窟（可选） | 场景 | 三到五 | `sealed_ruins` | 三 浓澱 | 38 到 45 | 96×96 | 迷宫 | 规划 | 步 blackoak_keep |
| C5 | `nightwind_corridor` | 夜风走廊南段 | 地块 | 三到五 | `wild_forest` | 二 积澱 | 36 到 42 | 160×128 | 野外 | 规划 | 步 blackoak_keep；战 frostridge_battle；世 blackoak |
| C5-1 | `frostridge_battle` | 霜脊堡之战 | 场景 | 三 | `wild_forest` | 二 积澱 | 36 到 40 | 44×26 | 战场 | 战场网格 | 战 nightwind_corridor |
| C6 | `silversaddle_keep` | 银鞍堡与银鞍桥 | 地块 | 三到五 | `valen_city` | 一 薄澱 | 33 到 45 | 160×128 | 枢纽 | 规划 | 区 orien_banks 180；区 elmfair 50；战 deer_ford_battle；世 silversaddle |
| C6-1 | `deer_ford_battle` | 鹿渡之战 | 场景 | 三 | `wild_forest` | 一 薄澱 | 33 到 37 | 64×40 | 战场 | 战场网格 | 战 silversaddle_keep |
| C7 | `elmfair` | 苍榆林地与榆集 | 地块 | 三到五 | `wild_forest` | 一 薄澱 | 33 到 45 | 160×128 | 枢纽 | 规划 | 区 silversaddle_keep 50；世 greyelm_weald |
| C8 | `blank_steles` | 无字碑林 | 地块 | 三到五 | `wild_forest` | 二 积澱 | 32 到 40 | 128×96 | 野外 | 规划 | 区 wallenburg 70；世 wallenburg |
| C9 | `glass_plain` | 荒原中层：玻璃原 | 地块 | 三到五 | `ash_waste` | 三 浓澱 | 30 到 35 | 192×192 | 野外 | 规划 | 区 ash_waste 35；区 ash_sea 25；步 gate_station_ruins；步 gatepicker_camp；区 thousand_gates_ring 35；世 ash_middle |
| C9-1 | `ash_sea` | 荒原中层：灰海 | 地块 | 三到五 | `ash_waste` | 三 浓澱 | 33 到 37 | 160×160 | 野外 | 规划 | 区 glass_plain 25；世 ash_middle |
| C9-2 | `gate_station_ruins` | 门站残墟 | 场景 | 三到五 | `ash_waste` | 三 浓澱 | 35 到 40 | 48×48 | 迷宫 | 规划 | 步 glass_plain；门 wallenburg_sewers |
| C9-3 | `gatepicker_camp` | 拾门者营地（可选） | 场景 | 三到五 | `ash_waste` | 三 浓澱 | 35 到 40 | 64×64 | 迷宫 | 规划 | 步 glass_plain |
| C10 | `thousand_gates_ring` | 千门都外环 | 地块 | 三到五 | `ash_waste` | 四 深澱 | 40 到 45 | 192×192 | 野外 | 规划 | 区 glass_plain 35；步 thousand_gates_archive；步 myriad_doors_ward；区 thousand_gates_core 30；世 thousand_gates |
| C10-1 | `thousand_gates_archive` | 千门书库 | 场景 | 三到五 | `sealed_ruins` | 四 深澱 | 40 到 45 | 64×64 | 舞台 | 规划 | 步 thousand_gates_ring |
| C10-2 | `myriad_doors_ward` | 万户街（可选） | 场景 | 三到五 | `ash_waste` | 四 深澱 | 40 到 45 | 96×96 | 迷宫 | 规划 | 步 thousand_gates_ring |
| C11 | `reedbridge_battle` | 灰烬防线之战（苇桥） | 场景 | 三 | `lothar_plain` | 一 薄澱 | 42 到 45 | 48×28 | 战场 | 战场网格 | 战 reedbridge |

### 4.5 第四幕：D 系列

| 编号 | id | 名称 | 层 | 幕 | 风格包 | 澱度 | 等级段 | 尺寸 | 角色 | 状态 | 连接 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | `grantis` | 格兰提斯（帝都与皇宫） | 地块 | 四到五 | `grantia_ochre` | 一 薄澱 | 45 到 55 | 192×192 | 枢纽 | 规划 | 步 crownless_hall；世 grantis |
| D1-1 | `crownless_hall` | 无冠厅 | 场景 | 四到五 | `grantia_ochre` | 一 薄澱 | 45 到 55 | 32×24 | 舞台 | 规划 | 步 grantis |
| D2 | `scriva` | 斯克里瓦学城 | 地块 | 四到五 | `grantia_ochre` | 一 薄澱 | 45 到 55 | 160×160 | 枢纽 | 规划 | 步 endless_stacks；世 scriva |
| D2-1 | `endless_stacks` | 无尽书库与空白层 | 场景 | 四到五 | `sealed_ruins` | 一 薄澱 | 45 到 55 | 48×64 | 舞台 | 规划 | 步 scriva |
| D3 | `goldbay` | 金湾（金秤广场与交易所） | 地块 | 四到五 | `mercato_coast` | 一 薄澱 | 45 到 55 | 192×160 | 枢纽 | 规划 | 步 deep_ledger_vault；世 goldbay |
| D3-1 | `deep_ledger_vault` | 深账库 | 场景 | 四到五 | `sealed_ruins` | 一 薄澱 | 48 到 52 | 48×48 | 舞台 | 规划 | 步 goldbay |
| D4 | `ringwood_court` | 环木议庭 | 地块 | 四到五 | `silva_canopy` | 一 薄澱 | 45 到 55 | 160×160 | 枢纽 | 规划 | 区 world_tree 40；世 ringwood |
| D4-1 | `deeproot_vale` | 深根谷（根下庭） | 场景 | 四到五 | `silva_canopy` | 一 薄澱 | 48 到 52 | 96×96 | 舞台 | 规划 | 步 world_tree |
| D5 | `windfang_rock` | 风牙岩（兽王台） | 地块 | 四到五 | `windfang_steppe` | 一 薄澱 | 48 到 53 | 160×160 | 枢纽 | 规划 | 门 main_gate_crater；世 windfang_rock |
| D6 | `seven_seats` | 七席石（眠鳞会盟） | 地块 | 四到五 | `sleepscale_snow` | 一 薄澱 | 53 到 55 | 96×96 | 舞台 | 规划 | 门 main_gate_crater；世 vaulttouch |
| D7 | `seran` | 瑟兰（白冕大圣堂与碑庭）（可选） | 地块 | 四到五 | `holy_see_white` | 一 薄澱 | 50 到 55 | 192×160 | 枢纽 | 规划 | 步 martyrlight_catacombs；世 seran |
| D7-1 | `martyrlight_catacombs` | 殉光地下墓（可选） | 场景 | 四到五 | `sealed_ruins` | 四 深澱 | 50 到 55 | 96×96 | 迷宫 | 规划 | 步 seran |
| D8 | `duskcrown` | 黯冠城 | 地块 | 四到五 | `night_basalt` | 二 积澱 | 45 到 55 | 192×160 | 枢纽 | 规划 | 门 main_gate_crater；世 duskcrown |

### 4.6 第五幕：E 系列

| 编号 | id | 名称 | 层 | 幕 | 风格包 | 澱度 | 等级段 | 尺寸 | 角色 | 状态 | 连接 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E1 | `thousand_gates_core` | 千门都核心（万门广场） | 地块 | 五 | `ash_waste` | 五 渊澱 | 55 到 60 | 192×192 | 野外 | 规划 | 区 thousand_gates_ring 30；步 main_gate_crater；世 thousand_gates |
| E2 | `main_gate_crater` | 主门坑（古澱湖、凿碑台） | 场景 | 五 | `ash_waste` | 五 渊澱 | 58 到 60 | 96×96 | 迷宫 | 规划 | 步 thousand_gates_core；战 ashen_final_battle；门 world_tree；门 redanvil；门 windfang_rock；门 duskcrown；门 broken_door_hall；门 seven_seats |
| E3 | `ashen_final_battle` | 灰烬决战 | 场景 | 五 | `ash_waste` | 五 渊澱 | 55 到 60 | 56×32 | 战场 | 战场网格 | 战 main_gate_crater |
| E4 | `world_tree` | 世界树与灵泉 | 地块 | 四到五 | `silva_canopy` | 零 清域 | 50 到 60 | 160×160 | 野外 | 规划 | 区 ringwood_court 40；步 deeproot_vale；门 main_gate_crater；世 ringwood |
| E5 | `redanvil` | 赤砧山（炉心） | 地块 | 四到五 | `forge_deep` | 二 积澱 | 50 到 60 | 160×128 | 枢纽 | 规划 | 门 main_gate_crater；世 redanvil |

### 4.7 终章：F 系列

| 编号 | id | 名称 | 层 | 幕 | 风格包 | 澱度 | 等级段 | 尺寸 | 角色 | 状态 | 连接 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | `maker_room` | 造主的房间（可选） | 场景 | 终章 | `divine_court` | 零 清域 | 无 | 12×10 | 舞台 | 规划 | 无（单场景） |

### 4.8 角色与可选内容

| 角色 | 含义 | 例 |
| --- | --- | --- |
| 枢纽 | 城镇与村落，有安全区、商店、委托与回访价值 | 边石镇、旧哨村、瓦伦堡、奥瑞恩两岸 |
| 野外 | 连续的野地，刷新魔物，按澱度给危险梯度 | 林缘、荒原外缘、玻璃原 |
| 迷宫 | 遗迹、矿与地下的楼层，有首领 | 封门遗迹、旧水道、霜骨墓窟、主门坑 |
| 战场 | 战役网格，由战役入口进入 | 城下潮、骨原夜袭、灰烬防线之战 |
| 私人 | 神之视线之外的私域 | 门内庭院 |
| 舞台 | 以剧情、对话与外交为主的场景 | 候见厅、奥瑞恩王岛、无冠厅、七席石 |

可选（`optional`）的条目不在主线必经之路上：朝阳门之夜、霜骨墓窟、拾门者营地、万户街、瑟兰与殉光地下墓、造主的房间。

## 5. 按幕连通图

图例（只用 ASCII，地图写编号与 id，`*` 为已建）：`-` 与 `|` 为地块路线（步行，不扣时），`=` 与 `||` 为区域图路段（扣时），
`.` 与 `:` 为门的能力，`+` 为路口；线上的数字是公里。战役入口单独列在每张图下面。

### 5.1 序章、第六幕与终章

```
 P0 divine_court*        (prologue, act 6)
 F1 maker_room           (epilogue, hidden ending)
```

### 5.2 第一幕

```
             A4 seal_ruins_depths*
               |  ^  (^ = shaft, one way up)
             A3 seal_ruins*            A5 rustridge_mine
               |                         |
               6                         |
               |                         |
 X1 ....... A1 borderstone* ---3--- A2 borderstone_north ---12--- A8 brokenspan_post
 inner_court*  |      |                                               |
               3      +---------------12--------------+               5
               |                                      |               |
             A6 forest_edge*                     A10 old_outpost* --8-- A9 ash_waste*
               |
             A7 ironhemlock_deep
```

战役入口：无（兽潮之夜在边石镇地块上以战斗波次进行）。

### 5.3 第二幕

```
 A1 borderstone* ===30=== B7 reedbridge ===30=== B1 wallenburg* ---- B4 wallenburg_outskirts
   ||                                              ||  |   |
   ||                                              ||  |   +---- B5 gatefront_south
   ||                                              ||  |                    |
   ++=======================60=====================++  |                    |
                                                       |                    |
                                                  B6 wallenburg_sewers* ----+
                                                       |
                                                  B6-1 broken_door_hall
```

战役入口：B1 `wallenburg` 到 B3-1 `wallenburg_harbor_battle`（城下潮）。第一幕的地块全部仍可去（见 5.2）。

### 5.4 第三幕：洛萨王国

```
 C1-1 bonefield
   |
 A10 old_outpost* ====================100==================== C4 blackoak_keep ---- C4-1 frostbone_catacombs
   |                                                              ||   |
   12                                                             ||  C5 nightwind_corridor
   |                                                              ||
 A1 borderstone*                                                  ||
   ||                                                             ||
   30                                                             120
   ||                                                             ||
 B7 reedbridge ---- C1-3 reedpond                                 ||
   ||                                                             ||
   30                                                             ||
   ||                                                             ||
 B1 wallenburg* ==================================================++
   ||  ||
   ||  70
   ||  ||
   ||  C8 blank_steles
  240
   ||
 C3 orien_banks ---- C2 orien_isle
   ||
  180
   ||
 C6 silversaddle_keep ===50=== C7 elmfair
```

第一、二幕的地块与路线照旧可去（见 5.2、5.3），图上只画第三幕的骨架。战役入口：A10 到 C1-2 `bonefield_battle`；C6 到 C6-1 `deer_ford_battle`；C5 到 C5-1 `frostridge_battle`；C3 到 C3-1 `sunrise_gate_battle`（可选）；B7 到 C11 `reedbridge_battle`。

### 5.5 第三幕：荒原纵深

```
 C10-1 thousand_gates_archive ---- C10 thousand_gates_ring ---- C10-2 myriad_doors_ward
                                         ||
                                         35
                                         ||
 C9-1 ash_sea ===25=== C9 glass_plain ===++
                         ||   |    |
                         ||   |    +---- C9-3 gatepicker_camp
                         ||   |
                         ||  C9-2 gate_station_ruins ......... B6 wallenburg_sewers*
                         ||
                         35
                         ||
 A8 brokenspan_post --- A9 ash_waste* --- C1-1 bonefield
                           |                  |
                           8                  6
                           |                  |
                         A10 old_outpost* ----+
```

门路线：C9-2 门站残墟复原后与 B6 第三十七门互通（行路之门进阶）。

### 5.6 第四幕：世界图（区域层）

```
             ashen_waste ------------ nightrealm ------------------ silva
                  |                       |                       /     |
                  |                       |                     /       |
                  |                       |                   /         |
 holy_see ----- lotha --------------------+------ grantia            windfang
                  \                                  |   \              |
                   \                                 |     \            |
                    \                                |       \          |
                     \----------(sea)------------ mercato --- sleepscale
```

区域之间的连线来自省份连线：lotha 与 ashen_waste（ash_border、ash_rim）、holy_see（orien、firstlight；海路 sunset_haven、seran）、
grantia（silversaddle、westpoise；blackoak、wallheart）、nightrealm（blackoak、tuskgate）、mercato（海路 sunset_haven、goldbay）；
ashen_waste 与 nightrealm（ash_rim、tuskgate；thousand_gates、tuskgate）；grantia 与 mercato（grantis、scalebridge；redgravel、scalebridge）、
nightrealm（wallheart、duskcrown）、silva（cloudstair、thornhedge）、sleepscale（cloudstair、vaulttouch）；mercato 与 sleepscale（fangmouth）；sleepscale 与 windfang（fangmouth、feltmarket）；
windfang 与 silva（windfang_rock、ringwood）；silva 与 nightrealm（frostwood、edgetrial）。各区域里的地图见第 2.2 节；区域内的路线：

```
 D1 grantis --- D1-1 crownless_hall          D2 scriva --- D2-1 endless_stacks
 D3 goldbay --- D3-1 deep_ledger_vault       D7 seran --- D7-1 martyrlight_catacombs
 D4 ringwood_court ===40=== E4 world_tree --- D4-1 deeproot_vale
 D5 windfang_rock     D6 seven_seats     D8 duskcrown     E5 redanvil
```

### 5.7 第五幕

```
 A9 ash_waste* ==35== C9 glass_plain ==35== C10 thousand_gates_ring
                                                   ||
                                                   30
                                                   ||
                                            E1 thousand_gates_core
                                                   |
                                            E2 main_gate_crater
                                                   :
     ..............................................:...............................................
     :               :               :                       :                  :                  :
 E4 world_tree   E5 redanvil   D5 windfang_rock         D8 duskcrown   B6-1 broken_door_hall  D6 seven_seats
```

战役入口：E2 `main_gate_crater` 到 E3 `ashen_final_battle`。第四幕的地图与世界图全部仍可去。

## 6. 现有数据对照与缺口

| 项 | 现有数据 | 图集与设计 | 处理 |
| --- | --- | --- | --- |
| 区域图行进 | 出口直接换图：边石镇南门一步到瓦伦堡（60 公里）；不扣时、不掷途中事件 | 区域图路段按 `hours` 扣时、掷途中事件；NPC 离屏出行用同一张表 | 内核与客户端读取 `atlas_routes` 做区域图界面与结算（[`travel_and_exploration.md`](../systems/travel_and_exploration.md) 第 2、3 节；第 7 节 W1 系统）；出口数据不必改 |
| 镇北与界石线（A2） | 北门出口直达封门遗迹；界石（史料 S01）、锈岭矿口、灰路起点都没有地块 | A2 规划；北路从 A2 穿过 | 北门出口指向 A2，镇北小路 `borderstone_north_trail` 3 公里（[地图简报](map_briefs.md)第 9.1 节）；W1 建 A2 时改出口，在此之前图集同时登记直连路线与 A2 |
| 地块尺寸 | 已建地块 48×32 到 60×48 | 地理志 7.1 建议 96 到 192 | 已建地块是压缩版，按地图简报第 1.11 节逐张扩到建议尺寸；扩建时同步图集 `size`，校验对不一致报错 |
| 荒原外缘 `ash_waste` | 一张图承载 A9、B9，还放了荒原中层门址、圣战军营、红牙丘、古澱边缘，以及红牙试货、萨莎决斗与无貌之王的战斗波次 | 外缘只承担 A9、B9；中层、外环、核心各有规划图 | C9、C10、E1、E2 建成后把相应地点与波次迁走（地图简报第 11 节） |
| 旧水道 | 排水廊到第三十七门前厅压成一层；没有断门厅与渡口水门 | B6 加 B6-1 断门厅，加渡口水门路线 | 第二幕补完时做 B6-1 |
| 旧水道的风格包 | `region` 为 `wallenburg`，按 `REGION_STYLE` 落在 `valen_city` | `art_pipeline.md` 1.4 把旧水道归 `sealed_ruins`，图集按此登记 | 地图显式写 `style: sealed_ruins`（地图简报第 1.3 节与 B6） |
| 澱度字段 | `MapDef.sediment` 注释为 0 到 7，渲染按七分之几画雾；`ash_waste` 填 4、`seal_ruins` 3、`forest_edge` 2、`wallenburg_sewers` 2 | 图集按正典六级记：外缘二、封门遗迹上层二、林缘一、旧水道三 | 存正典级（0 到 5，临界记 6），渲染按"渲染级 = 正典级 × 7 / 6 四舍五入"换算（地图简报第 1.2 节，[`art_pipeline.md`](../../50_tech/art_pipeline.md) 第 2.8 节）；十张已建图的数值按地图简报第 1.2 节的表改写 |
| `MapDef.region` | 九个只用于选风格包的键（`borderstone_region`、`lotha_north`、`borderstone_wilds` 等） | 图集区域对齐地理志 2.2 与大陆图区域 | `MapDef.region` 用图集区域 id，`REGION_STYLE` 按图集补齐（地图简报第 1.3 节） |
| 战场 | 五个 `battle_scenarios` 是独立网格，不挂地图 | 图集登记为战场条目，用战役路线挂到宿主地块 | 鹿渡之战、朝阳门之夜的网格见地图简报第 10.2、10.3 节，界石之战与红帐血战见第 10.4、10.5 节 |
| 苇桥村 | 没有地块；灰烬防线之战只有网格 | B7 规划，是 C11 的宿主，也是第二幕南大路的中继 | 第二幕补完时做 |
| 门内庭院 | 由城建系统的门内庭院能力传送 | 门路线 `borderstone_inner_court` 以枢纽代表"任意地点" | 无 |
| 编号写法 | 合并地图写作 A3/A4、A10/B8、B1 到 B3 合一 | `code` 单值且唯一，合并写进 `covers` | 无 |
| 大陆图数值 | `grantis` 的澱度为 0 | 地理志 3.4：帝国腹地澱度一 | 取地理志：`grantis` 的澱度为一；省份与郡的澱度以[战争与战略目录](../content/catalog_warfare_strategy.md)第 8 节郡表为准，`data/strategy/map.json` 按郡表导入 |

## 7. 制作顺序

| 阶段 | 内容 | 理由 |
| --- | --- | --- |
| W0 图集 | 图集三表、`atlasProblems`、编辑器表单与测试 | 先有总表，后续每张图有编号、区域、路线与校验可挂 |
| W1 第一幕补完 | A2 镇北与界石线（并把北门出口改经 A2）；A5 锈岭矿；A8 折桥驿；A7 铁杉林深处；视需要把 A1、A6、A9 扩到建议尺寸 | 第一幕是垂直切片（`game_framework.md` 第 15 节）；税与匪、一夜打通矿道、魔物季三条纷争都缺舞台 |
| W1 系统 | 区域图行进：界面、按 `hours` 扣时、途中事件、NPC 离屏出行 | 南大路是第一条区域图路段；第二幕开头就要用 |
| W2 第二幕 | B7 苇桥村（也是第三幕决战的宿主）；B6-1 断门厅与渡口水门；B4 城外；B5 门前渡南岸 | 第二幕高潮与老船夫线的舞台；苇桥村两幕复用 |
| W3 第三幕 | 按剧情周次：C1-1 骨原（第 2 周）；C3、C2 奥瑞恩（第 4、5 周）；C8 无字碑林（第 5 周起）；C6、C7 与鹿渡网格（第 6 到 8 周）；C4、C5（第 9 到 11 周）；C1-3 苇塘村（第 11 周）；C9 系列（第 13 周）；C10 系列（第 14 周）；可选的 C3-1、C4-1 最后 | 跟着周次做，现有的荒原外缘替身同步迁出 |
| W4 第四幕 | 先做各国风格包；再按剧情权重：D1 与 D1-1、D3 与 D3-1、D4 与 E4 与 D4-1、D5、D6、D2 与 D2-1、D8；可选的 D7、D7-1 | 强者之宴、经济战、森林、兽王、会盟是第四幕的五条主线 |
| W5 第五幕 | E1 千门都核心、E2 主门坑（首领战）、E5 赤砧山；众门环节点复用 D 系列与 B6-1 | 第五幕的连续地图只有千门都核心（地理志 7.3），其余战线在战略层 |
| W6 终章 | F1 造主的房间 | 隐藏结局，最后做 |

每张图上线时同步三件事：地图数据（`MapDef`）、图集条目的 `status` 设为 `built` 并写实际尺寸、路线的 `fromExit` 与 `toExit` 指到真实出口；
校验会逐项检查这三处是否对得上。

## 8. 已决事项与正典出入

### 8.1 本文的已决事项

全部按 [`map_briefs.md`](map_briefs.md) 第 13.2 节落定：

1. D、E、F 编号系列与 `<父编号>-<序号>` 的子条目写法：采纳；补登条目按地图简报第 9 节。
2. 第四幕起各国风格包编号已由 [`../../50_tech/art_pipeline.md`](../../50_tech/art_pipeline.md) 第 1.4 节定稿：`holy_see_white`、`grantia_ochre`、`mercato_coast`、`silva_canopy`、`windfang_steppe`、`night_basalt`、`sleepscale_snow`。
3. 正典未给的距离与相邻关系：采纳；旧哨村到荒原外缘约 8 公里，镇北到折桥驿约 12 公里，折桥驿到晶沟约 5 公里，旧哨村到骨原约 6 公里，玻璃原到灰海约 25 公里，环木议庭到世界树约 40 公里；
   补登路段的距离见地图简报第 13.2 节第 3 条。
4. 庭外之国的国都就是第三幕末领主府的所在（边石镇或旧哨村）；第四、五幕的可达性枢纽固定为边石镇，与国都选址无关。
5. 夜境黑市与月井节点在黯冠城（D8），祖灵石节点在风牙岩（D5）。
6. 行程换算（日按 24 小时）、途中事件的掷法、个人在世界图上的行程：细则在 [`../systems/travel_and_exploration.md`](../systems/travel_and_exploration.md) 第 2、3 节。
7. `MapDef.region` 用图集区域 id（地图简报第 1.3 节）。
8. 锈岭矿、锈岭矿深层与赤砧山诸炉用 `forge_deep`。

### 8.2 正典出入（取舍见地图简报第 13.1 节；需要改正典的列为回写请求）

| 主题 | 较高优先级的说法 | 另一处的说法 | 图集取 |
| --- | --- | --- | --- |
| 锈岭矿的方位 | 地理志 3.1、4.2、4.3：边石镇西北约 5 公里，矿口骑在界石线上 | 一幕 2.3 W2：东北丘陵里的"边石旧矿" | 地理志；"边石旧矿"是矿工对锈岭矿口的叫法（`dg_old_mine` 为 `rustridge_mine` 的子场景） |
| 边石镇南门的路 | 地理志 4.1、6.3：南大路（王道是落日港、奥瑞恩、银鞍堡一段） | 一幕 2.1、L14：南门通往瓦伦堡的"王道" | 南大路；"王道门"是镇民的老叫法 |
| 遗民的森林庇护所 | 地理志 3.6：深根谷，根下庭是深根谷里的隐谷 | 四幕 8.3：世界树根下的隐谷"根下庭" | `deeproot_vale`，名称写"深根谷（根下庭）" |
| 门钥失窃的金库 | 地理志 3.5：梅尔卡大神殿地下的深账库 | 四幕 8.5：同 | 深账库 |
| 第三幕东线战场 | 三幕 7.4：上游约 20 公里的鹿渡与橡盾要塞 | 地理志 7.3：银鞍桥 | 鹿渡；银鞍桥是东线前哨 |
| 灰暴与灰爆 | 地理志 3.2、第 9 节：灰暴（Ashstorm），荒原的灰尘暴 | 五幕：残澱的爆散 | 灰暴只指灰尘暴；残澱的爆散另名"灰爆"（Ashburst） |
| 荒原外缘的开放幕次 | 一幕 W4：碎门坡 | 地理志 4.5：第一幕只到南沿 | 第一幕开放外缘南段，第二幕外缘全段 |
| 澱度标尺 | 正典六级加临界（D-039） | 旧图集写渲染级 | 存正典级，渲染按地图简报第 1.2 节的公式换算 |

## 9. 数据与校验

### 9.1 三张表

`atlas_regions`（`data/world/atlas_regions.json`）：

| 字段 | 含义 |
| --- | --- |
| `id`、`name` | 区域 id 与名称 |
| `tier` | `continent`（世界图，全表唯一）、`region`（区域）、`realm`（界外领域） |
| `parent` | 区域所属的大陆（`region` 必填，其他层级不写） |
| `geo`、`slgRegion` | 地理志 2.2 的区域名；所在的大陆图区域（`ProvinceDef.region` 的取值） |
| `acts` | 区域在用的幕；对 `continent` 是世界图开放的幕 |
| `style`、`stylePlan` | 默认风格包（`STYLE_IDS` 之一）；规划中、还没进入 `STYLE_IDS` 的风格包编号 |
| `sediment` | 正典澱度区间 [低, 高] |

`atlas_maps`（`data/world/atlas_maps.json`）：

| 字段 | 含义 |
| --- | --- |
| `id`、`code`、`covers`、`name` | 地图 id（已建即 `MapDef.id`）；唯一编号；合并时覆盖的地理志编号；设计名 |
| `tier`、`role`、`status` | `tile` 或 `scene`；`hub`、`field`、`dungeon`、`battle`、`private`、`stage`；`built`、`scenario`、`planned` |
| `region`、`province` | 图集区域；所在省份（`slg_provinces`） |
| `acts`、`hubOf` | 可玩的幕（含回访）；作为可达性起点的幕 |
| `style`、`stylePlan` | 风格包，或规划中的风格包编号；不写时用区域的 |
| `sky` | 天幕包：某个有天幕的风格包编号或特殊天幕名（[地图简报](map_briefs.md)第 1.7 节）；不写时用本图风格包，本图风格包没有天幕时用区域的；室内与地下图不显示天幕 |
| `sediment`、`levels`、`size` | 正典澱度 0 到 5；等级段；尺寸（已建与战场网格写实际，规划写建议） |
| `scenario`、`optional`、`source`、`note` | 战场网格 id（战场图另写其 `bat_` 剧本，[战争目录](../content/catalog_warfare_strategy.md)第 5.24 节）；可选内容；正典出处；说明 |
| `music`、`musicNight` | 地点曲的昼与夜编号（`mus_`）；`musicNight` 可空，空则按减层规则（[音频方向](../audio_direction.md)第 5.1 节） |
| `ambience`、`ambiencePoints` | 环境底层与生灵层组合（`amb_`）；点缀池 |
| `reverbZone` | 混响区：室外、城镇街巷、室内小间、室内大厅、迷宫、地下水道、神庭、梦境之一（音频方向第 8.4 节） |

`atlas_routes`（`data/world/atlas_routes.json`）：

| 字段 | 含义 |
| --- | --- |
| `id`、`from`、`to`、`oneWay` | 路线 id；两端地图；只能从起点到终点 |
| `layer`、`kind` | `tile`（`road`、`trail`、`river`、`waste`、`passage`）、`region`（`road`、`trail`、`river`、`waste`、`pass`）、`door`（`gate`）、`event`（`battle`） |
| `road`、`km`、`hours` | 正典路名；公里；各方式的游戏小时（`walk`、`ride`、`caravan`、`boat`、`boatBack`） |
| `acts`、`opens`、`requiresFlags` | 开放的幕；开放条件；需要的旗标 |
| `fromExit`、`toExit` | 已建地图上实现这条路线的出口 id 与回程出口 id |
| `events`、`status`、`note` | 途中事件池；`built` 或 `planned`；说明 |

### 9.2 校验规则（`atlasProblems`）

内容校验时由世界包调用；只装了部分内容包、没有剧情地图的构建（只测某几个系统的测试）跳过与地图数据的交叉检查，图集自身的检查照做。

1. **已建条目与内容地图一一对应**（`testfield` 除外）：每张内容地图都有 `built` 条目，每个 `built` 条目都有内容地图，尺寸一致；规划与战场网格条目不得与内容地图同 id。
2. **每个已建地图的每个出口都被一条路线引用**（`fromExit`，或双向路线的 `toExit`），被引用的出口存在且通向另一端；已建的步与区路线必须写出口。
3. **风格包合法**：地图与区域的 `style` 是 `STYLE_IDS` 之一；每张图在自身或区域上至少有风格包或规划中的风格包编号；`sky` 是 12 个室外风格包或 5 套特殊天幕之一。
4. **引用存在**：区域、父区域、路线两端、省份、大陆图区域、战场网格；战场网格的尺寸与 `battle_scenarios` 一致；地图的省份与区域落在同一个大陆图区域。
5. **编号**：`code` 符合 P、X、A 到 F 加数字（可带 `-序号`）且全表唯一；`covers` 同格式。
6. **每幕从枢纽出发全部可达**：每幕恰好一个枢纽；按该幕开放的路线（单向路线只按方向）走，世界图开放的幕再按省份连线走；该幕每张图都要走得到。
7. **一致性**：幕次在 0 到 7 且不重复；地图的幕在区域的幕之内，路线的幕在两端地图的幕之内；层与种类的组合合法；
   区域图路段必须有公里与行程；途中事件与行程方式取值合法；战场只由战役路线进入，战役路线只通向战场；地图澱度在区域澱度区间内。

### 9.3 测试

`tests/world_atlas.test.ts`：一个小型夹具覆盖每条规则的正反两面（合法夹具无问题，每次只改一处，断言出现对应的问题文本）；
真实内容在全部交叉检查打开时零问题；已建条目与编号、战场网格与网格 id、每幕枢纽都以字面值钉住；部分内容构建不误报；
编辑器表单声明了图集三表的全部字段。

## 10. 依据

- 正典：[`world_bible.md`](../../20_world/world_bible.md)、[`geography.md`](../../20_world/geography.md)、[`power_system.md`](../../20_world/power_system.md)、
  [`story_outline.md`](../../30_story/story_outline.md)、[`prologue_antechamber.md`](../../30_story/arcs/prologue_antechamber.md)、
  [`act1_borderstone.md`](../../30_story/arcs/act1_borderstone.md)、[`act2_wallenburg.md`](../../30_story/arcs/act2_wallenburg.md)、
  [`act3_lothar_crisis.md`](../../30_story/arcs/act3_lothar_crisis.md)、[`act4_continental_board.md`](../../30_story/arcs/act4_continental_board.md)、
  [`act5_war_of_races.md`](../../30_story/arcs/act5_war_of_races.md)、[`act6_review_and_epilogue.md`](../../30_story/arcs/act6_review_and_epilogue.md)。
- 设计与技术：[`content_outline.md`](../content/content_outline.md)、[`grand_strategy_slg.md`](../systems/grand_strategy_slg.md)、
  [`city_building.md`](../systems/city_building.md)、[`game_framework.md`](../game_framework.md)、[`art_pipeline.md`](../../50_tech/art_pipeline.md)、
  [`implementation_conventions.md`](../../50_tech/implementation_conventions.md)。
- 调研：[`my_ai_town_visual_and_client.md`](../../10_research/art_style/my_ai_town_visual_and_client.md)（第 4.1、4.2 节：地图拓扑与路段时长）、
  [`city_rts_slg.md`](../../10_research/open_share/city_rts_slg.md)（第 4.1 节：省份图、连地、安全区与风险区）、
  [`game_dev_methodology.md`](../../10_research/open_share/game_dev_methodology.md)（第 3.1 节：门槛与预示）。
