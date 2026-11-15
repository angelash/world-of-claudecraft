# 地图设计简报（Map Briefs）

> **归属**：`docs/40_design/world/`（概要设计，正典优先级第 5 级）。地图负责方编写；地图数据（`data/**/maps.json`、`data/combat/maps/*.json`）、
> 图集三表（`data/world/atlas_*.json`）与美术提示词库（`assets/prompts/specs/*.json`）按本文落地。
> **作用**：全作每一张地图的设计简报：图集 67 个条目逐张给出层级、尺寸、风格包、澱度、布局、地点、出入口、动线、居民、魔物、采集、
> 迷宫结构、照明、外观层、任务挂点、美术素材与制作排期；另补图集之外仍需落图的迷宫与战场，给出荒原外缘替身内容的迁移、
> 场景动线 15 条遗留修改的具体改法、`MapDef.sediment` 与 `MapDef.region` 的统一方案，以及对正典出入的结论。
> **上游**：[`world_map.md`](world_map.md)（四层地图、图集总表、第 6 到 8 节）、[`scene_flow.md`](scene_flow.md)（动线原则、十张已建图、五种模板、第 8 节）、
> [`geography.md`](../../20_world/geography.md)（第 0、3、4、7 节）、分幕文档 `../../30_story/arcs/`、
> [`catalog_dungeons_bosses.md`](../content/catalog_dungeons_bosses.md)、[`catalog_bestiary.md`](../content/catalog_bestiary.md)、
> [`catalog_gathering_crafting.md`](../content/catalog_gathering_crafting.md)（第 6 节采集点）、[`content_bible.md`](../content/content_bible.md)（第 4 节）、
> [`catalog_characters_lotha.md`](../content/catalog_characters_lotha.md)（第 4 节名册）、[`catalog_characters_continent.md`](../content/catalog_characters_continent.md)、
> [`art_pipeline.md`](../../50_tech/art_pipeline.md)（风格包、地图三层）、决策 D-039、D-046、D-062、D-063、D-069、D-070、D-075、D-078。
> 姊妹文档：[`../systems/travel_and_exploration.md`](../systems/travel_and_exploration.md)（区域图行进、快速移动、探索与跳时）。
> **约束**：地名、距离、澱度以正典为准；本文新定的落点、尺寸与距离以"本文落定"标出，需要正典确认的列入第 13 节与汇报的回写请求。
> 魔物、采集点、人物、迷宫只按 ID 引用各自目录；美术编号只给前缀与建议名，最终编号以提示词库 `assets/prompts/specs/` 为准。

## 0. 一页结论

1. **一张图一份简报，字段统一。** 图集 67 个条目全部覆盖：已建 10 张写"现状到目标"的扩建方案，规划 50 张（含 7 个过场布景）与 7 个战场网格写新建方案。
   另补图集之外仍需落图的 13 处迷宫场景与 5 个战场，并把门站残墟与拾门者营地拆成实例（第 9 节，共 22 个补登条目），合计 89 张图。
2. **尺寸到建议值。** 已建的 48×32 到 60×48 地块扩到 96×80 到 160×128；封印遗迹与旧水道扩到能容纳完整分层的 48×40 到 96×72。
   扩建保留现有地点 id、出口 id 与外观层件数的口径，坐标整体平移后按新布局重排（第 1.11 节）。
3. **澱度统一。** `MapDef.sediment` 存正典级（零到五，临界记 6），渲染层按"渲染级 = 正典级 × 7 / 6 四舍五入"换算到 0 到 7 的雾与暗角标尺；
   局部热点用地点级 `sediment` 覆盖（第 1.2 节）。现有十张图的数值逐张给出（第 1.2 节表）。
4. **区域用图集 id。** `MapDef.region` 一律写图集区域 id（`edgestone_area`、`valen_valley`、`lotha_realm`、`ashen_waste` 等），`REGION_STYLE` 按图集补齐，
   与区域默认风格包不同的图在地图上显式写 `style`（第 1.3 节）。
5. **风格包共 16 个（编号以 `../../50_tech/art_pipeline.md` 第 1.4 节为准）。** 现有 6 个，加矿坑与炉城 `forge_deep`、门廊幽境 `door_corridor`、地球日常 `earth_modern` 与第四幕起的 7 个国别包（`holy_see_white`、`grantia_ochre`、`mercato_coast`、`silva_canopy`、
   `windfang_steppe`、`night_basalt`、`sleepscale_snow`）；每个包给出地面、建筑、道具、远景天幕的素材底座，各图只写增量（第 2 节）。
6. **荒原外缘去替身。** `ash_waste` 只承担外缘（第一、二幕为主），图上的中层门址、圣战军营、红牙丘、亚龙栖处、古澱边缘与三幕以上的刷新组，
   分别迁到 C9 玻璃原、C9-2 门站残墟、C10 外环、E1 核心、E2 主门坑与 B7 苇桥村南岸（第 11 节）。
7. **缺的战场补齐。** 鹿渡之战（C6-1，64×40）、朝阳门之夜（C3-1，64×48）给出完整网格；第四幕的界石之战（`bat_a4_boundary_war`，地图 A1-1 界石垒，56×36，第四幕的必经战斗）
   与红帐血战（`bat_a4_redtent_bloodfight`，地图 D5-2 兽王台，64×40，兽王之争的血战分支），四张都给网格、部署区、目标区与咽喉（第 10 节）；1 战场格 = 8 米。每个 `bat_` 都有地图，对照见战争目录第 5.24 节。
8. **场景动线 15 条遗留修改逐条给出坐标级改法**（第 12 节）；图集第 8 节与 B-014 的正典出入逐条给出结论，需要回写正典的列成请求（第 13 节）。
9. **制作顺序对齐里程碑。** M1 做序章与 A 系列 19 张图（含门内庭院与 7 个过场布景）；M2 做 B、C 系列与五个战场进入 HD-2D；M3 做 D、E、F 系列与第四、五幕迷宫；
   M4 只做可选内容的打磨与回访变化（第 14 节）。

## 1. 读法与通用规则

### 1.1 简报字段

每张图一节：标题写 `code`、`id`、中文名与英文名；先一张"项与内容"表，再一张关键地点表。

| 项 | 写法 |
| --- | --- |
| 层级与角色 | 图集 `tier`（地块、场景）与 `role`（枢纽、野外、迷宫、战场、私人、舞台）；可选内容注明 |
| 幕与区域 | 可玩的幕（含回访）；图集区域 id；省份 id（`data/strategy/map.json` 的 `provinces`） |
| 尺寸 | 已建写"现状到目标"，规划写目标；单位为格（1 格 = 1 米 = 16 像素） |
| 风格包 | 第 2 节的包 id；与区域默认不同的写明理由 |
| 澱度 | 正典级（D-039）与渲染级（第 1.2 节）；局部热点另列 |
| 等级带 | 本图常驻魔物与首领的等级区间，按幕分列；对照 D-069 的幕等级带 |
| 地形与布局 | 方位、分区、地标、主路；扩建图写新增的部分 |
| 出入口与路线 | 出口 id、所在边、目标图与图集路线 id；规划路线写"本文落定" |
| 动线与镜头 | 第 1.4 节的模板代号；入口方位、镜头预设与"北入图"补救 |
| 驻留 NPC | 人物目录 ID；模板居民写模板来源 |
| 魔物分布 | 图鉴或迷宫目录的 ID、等级、所在区、出现条件（第 1.6 节） |
| 采集点 | 采集目录的 `node_` ID |
| 迷宫结构 | 只有迷宫写：层、区、核、机关（含新增机制） |
| 照明与夜间 | 光源配方、"灯止处"、室内或室外 |
| 装饰与外观层 | 装饰种类与件数区间、`looks` 覆盖、需要的新装饰种类 |
| 任务挂点 | 分幕与任务目录的事件、纷争、迷宫与门的挂点 |
| 美术素材 | 只写本图增量：地面（`art_tile_`）、建筑（`art_bld_`）、道具（`art_prop_`）、远景（`art_bg_`）；底座见第 2 节 |
| 优先级与里程碑 | P0 到 P3 与 M1 到 M4（第 1.9 节） |

关键地点表的列：地点 id、名、位置（区或方位）、功能、发现（第 1.5 节）。已建图的地点 id 与现有数据一致，新增的用小写英文加下划线。

### 1.2 澱度：正典六级加临界与渲染标尺

**存储与换算（本文落定）**

| 正典级（D-039） | 名 | `MapDef.sediment` 存储值 | 渲染级（0 到 7） | 画面 | 城建读数（`site.sediment`） |
| --- | --- | --- | --- | --- | --- |
| 零 | 清域 | 0 | 0 | 无澱雾；神域与清域另有暖光微粒 | 0 |
| 一 | 薄澱 | 1 | 1 | 几乎不可见的紫色微粒 | 1 |
| 二 | 积澱 | 2 | 2 | 轻暗角，微粒稀疏 | 2（澱斑风险起点） |
| 三 | 浓澱 | 3 | 4 | 明显暗角与紫色微粒，夜里加重 | 3 |
| 四 | 深澱 | 4 | 5 | 重暗角，画面降饱和，鉴定读数抖动 | 4 |
| 五 | 渊澱 | 5 | 6 | 极重暗角，微粒成流 | 5 |
| 临界 | 临界 | 6 | 7 | 满档：暗角、微粒与色偏全开 | 不建城 |

- 公式：渲染级 = round(存储值 × 7 / 6)，半数进位。渲染层的 `sedimentLevel(map)` 先查此表再除以 7，现有暗角与微粒的强度公式不变。
- 理由：正典级是城建、魔物生成与疾病的口径（城建已按"不少于 2 有澱斑"读数），存正典级让逻辑层不必换算；三级以上是"亡灵夜行、迷宫结晶"的门槛，
  渲染上从 2 跳到 4，玩家一进浓澱就看得出来。
- **局部热点**：地点（`LocationDef`）可选 `sediment` 字段，玩家站进该矩形时渲染按局部值淡入（2 秒），逻辑层的澱染累积也按局部值。
  例：`ash_waste` 的晶沟与灰心局部三，主门坑的古澱湖局部临界。
- **现有十张图的数值**（数据导入时按此改写，同时图集校验增加"`MapDef.sediment` 等于图集 `sediment`"一条）：

| 地图 | 现有值 | 正典级 | 存储值 | 渲染级 |
| --- | --- | --- | --- | --- |
| `divine_court` | 无 | 零 | 0 | 0 |
| `inner_court` | 0 | 零 | 0 | 0 |
| `borderstone` | 1 | 一 | 1 | 1 |
| `forest_edge` | 2 | 一 | 1 | 1 |
| `old_outpost` | 1 | 一 | 1 | 1 |
| `seal_ruins` | 3 | 二 | 2 | 2 |
| `seal_ruins_depths` | 3 | 三 | 3 | 4 |
| `ash_waste` | 4 | 二（晶沟、灰心局部三） | 2 | 2 |
| `wallenburg` | 1 | 一 | 1 | 1 |
| `wallenburg_sewers` | 2 | 三 | 3 | 4 |

### 1.3 `MapDef.region` 用图集区域 id

- 每张地图的 `region` 写图集区域 id，并且等于该图图集条目的 `region`；`REGION_STYLE` 以图集区域为键：

| 图集区域 | 默认风格包 |
| --- | --- |
| `divine_realm`、`court_gap` | `divine_court` |
| `earth` | `earth_modern` |
| `edgestone_area`、`lotha_realm` | `lothar_plain` |
| `valen_valley` | `valen_city` |
| `ashen_waste` | `ash_waste` |
| `holy_see` | `holy_see_white` |
| `grantia` | `grantia_ochre` |
| `mercato` | `mercato_coast` |
| `silva` | `silva_canopy` |
| `windfang` | `windfang_steppe` |
| `nightrealm` | `night_basalt` |
| `sleepscale` | `sleepscale_snow` |

- 与区域默认不同的图在地图上显式写 `style`（例：`forest_edge` 在 `edgestone_area` 里但用 `wild_forest`；封印遗迹在 `ashen_waste` 里但用 `sealed_ruins`）。
- 现有十张图的迁移：

| 地图 | 现有 `region` | 图集区域 | 显式 `style` |
| --- | --- | --- | --- |
| `divine_court` | `divine_court` | `divine_realm` | 不写 |
| `inner_court` | `court_gap` | `court_gap` | 不写 |
| `borderstone` | `borderstone_region` | `edgestone_area` | 不写 |
| `forest_edge` | `borderstone_wilds` | `edgestone_area` | `wild_forest` |
| `old_outpost` | `lotha_north` | `edgestone_area` | 不写 |
| `seal_ruins` | `borderstone_wilds` | `ashen_waste` | `sealed_ruins`（已有） |
| `seal_ruins_depths` | `borderstone_wilds` | `ashen_waste` | `sealed_ruins`（已有） |
| `ash_waste` | `ash_waste` | `ashen_waste` | 不写 |
| `wallenburg` | `valen_valley` | `valen_valley` | 不写 |
| `wallenburg_sewers` | `wallenburg` | `valen_valley` | `sealed_ruins`（已有） |

- 迁移顺序：先在 `REGION_STYLE` 加入图集键并保留旧键，十张图改写后删去旧键（`borderstone_region`、`lotha_north`、`lothar_north`、`borderstone_wilds`、`wallenburg`、`ash_waste`、`divine`、`divine_court`），
  同一次改动给图集校验加两条：`MapDef.region` 等于图集 `region`；`styleOf(map)` 等于图集条目的 `style`（条目不写时取区域的）。M1 前完成。

### 1.4 动线模板与镜头（D-063）

| 代号 | 模板（[`scene_flow.md`](scene_flow.md) 第 5 节） | 度量要点 |
| --- | --- | --- |
| T-H | 城镇枢纽 | 到达点到复苏点不超过 25 米；主要店铺不超过 35 米；外门朝南或东西不少于八成；主动线夜间照明不少于 85%；主动线全身遮挡不超过 10% |
| T-D | 迷宫楼层 | 入口平台不小于 3×3，首次接触不少于 8 米；主动线 30 到 80 米，至少一处回环，首领后捷径；同层常驻等级跨度不超过 6 |
| T-F | 野外地块 | 入口到营地不超过 10 米；营地与警戒圈相距不少于 3 米；等级按离入口的距离单调上升；稀有与精英在 35 米以外 |
| T-B | 战场 | 部署区在南（镜头一侧），敌来自北或侧翼，咽喉在中线，两侧展开不少于 6 格；建筑不超过 3 米 |
| T-S | 神域与私人 | 无出口，物件之间相距 6 到 16 米；扩建围绕中央向外长 |

- **镜头预设**：默认（方位 0、俯角 36 度，南看北）；俯视（俯角 64 度，城建与战场可选）；剧情镜头由过场目录定义。可转镜头（每次 45 度），但不得要求玩家转镜头才找得到门。
- **入口在南、目标在北**是默认；正典方位逼出的"北入图"（第一幕边石镇的北门、第二幕瓦伦堡的北门）用三条补救：第一屏的地点名、门朝街且朝南、目标侧缝立牌。
- 室外图的远景天幕（D-078）是环绕镜头的横带，按远景、中景、云带三层随方位角转动，不按方位另出图（第 1.7 节）。

### 1.5 发现点（探索经验的挂点）

- 关键地点表的"发现"列标出探索经验的挂点：**图**（第一次进入本图）、**标**（地标，第一次走进其矩形）、**望**（远望点，站上去触发镜头拉远与地名浮现）、
  **秘**（隐藏地点、暗道、隐藏段）。括号里写首开的幕，与本图首开幕相同时省略。
- 战场、神域与序章不设发现点。区域图的路段首行另计（`travel_and_exploration.md` 第 6 节）。
- 各种类的权重与经验公式以 `progression_and_pacing.md` 第 3.5 节为准（种类对应见 `travel_and_exploration.md` 第 6.2 节）；各幕发现点统计在 `travel_and_exploration.md` 第 6.3 节，由本文的发现点逐张统计得出。

### 1.6 魔物分布写法

- 写成"`id` Lv 低到高（所在区；条件）"。条件只写幕次与旗标：幕次旗标统一用 `act.<n>.entered`（[变量注册表](../world_state_registry.md)第 8.5 节的 `act.<幕号>.entered`），刷新点用 `requiresFlags` 实现。
- 一张图跨多幕时按幕分行：后一幕的组与前一幕并存或取代，取代时前一幕的组加"直到某幕"的条件（实现为该组只在没有后续幕旗标时生成，需要 `SpawnDef` 支持否定旗标，第 1.10 节）。
- 等级口径：野外常驻按图鉴；迷宫与首领按迷宫目录；剧情首领按 D-060 落在所在幕的等级带。
- **按图定级**：图鉴等级低于本图等级带下限两级以上的种类，刷新点写 `SpawnDef.level`（本文落定的字段）按本图等级带生成，魔物 ID 不变，掉落阶随定级后的等级；简报里写作"按图 X 到 Y"，迷宫里写作"按迷宫定级"。图鉴的等级是地表种群的基准。

### 1.7 美术素材清单写法

- 编号前缀：地面 `art_tile_<风格包>_<名>`、建筑部件 `art_bld_<风格包>_<名>`、道具 `art_prop_<名>`、区域图插画 `art_map_<区域>`、远景 `art_bg_`。
- **远景天幕**（D-078；[`../../50_tech/art_pipeline.md`](../../50_tech/art_pipeline.md) 第 2.13 节；编号以 `assets/prompts/specs/backgrounds.json` 为准）：
  - 12 个室外风格包（`lothar_plain`、`valen_city`、`wild_forest`、`ash_waste`、`divine_court`、`holy_see_white`、`grantia_ochre`、`mercato_coast`、`silva_canopy`、`windfang_steppe`、`night_basalt`、`sleepscale_snow`）各有三层 `art_bg_<风格包>_far`、`_mid`、`_clouds`；
    `sealed_ruins`、`forge_deep`、`door_corridor`、`earth_modern` 没有自己的天幕。天幕是环绕镜头的横带，不分方位，不按地图另出图；四时、昼夜与天气由光照调色与天气层驱动。
  - **天幕包**：一张图默认用本图风格包的三层；本图风格包没有天幕时用所在区域风格包的三层；简报写明理由时可以另指一个风格包的三层（图集字段 `sky`，[`world_map.md`](world_map.md) 第 9.1 节）。
  - **特殊天幕**两层 `art_bg_sky_<名>_far`、`_near`：`earth_night_city` 用于地球四景（P1 到 P4）的窗外与门外；`dream_door_sea` 用于梦境场景（门口的女人出现的梦）；
    `divine_heights` 用于神域区域（`divine_realm`）的露天段；`vault` 第六幕起替换室外地图的云层，远景与中景照旧；`mist_edge` 只用于结局演出，由过场指定，不挂地图。
- **区域图插画**（编号以 `assets/prompts/specs/maps.json` 为准）：世界图 `art_map_medius`；区域图 `art_map_edgestone_area`、`art_map_ashen_waste`、`art_map_valen_valley`、`art_map_lotha_realm`、`art_map_divine_realm`、`art_map_court_gap`、
  `art_map_holy_see`、`art_map_grantia`、`art_map_mercato`、`art_map_silva`、`art_map_windfang`、`art_map_nightrealm`、`art_map_sleepscale`，与图集区域 id 一一对应，供区域图界面使用（A1、B1 的简报顺带列出所属区域的插画）；`art_map_lore_*` 是史料里的草图，归遗物目录。
- 有名建筑不单出立牌：由风格包的墙、屋顶、立面部件组装（[`../../50_tech/art_pipeline.md`](../../50_tech/art_pipeline.md) 第 2.6 节），简报"美术素材"一栏里的建筑编号是这栋建筑要增补的部件。各栏写需求编号，正式编号与里程碑以提示词库 `assets/prompts/specs/*.json` 为准；两边不一致时改简报。
- 每个风格包有一套"底座"（第 2 节）：用这个包的图默认拥有底座里的全部素材；每张图的简报只列底座之外的增量，生成者按"底座先、增量后"的顺序出图。
- 提示词里不出现其他作品、作者、工作室与商标的名字，也不写"HD-2D"这个词；写法见提示词库的模板。

### 1.8 照明与夜间通则

| 地图类型 | 光源 | 夜间 |
| --- | --- | --- |
| 城镇 | 门灯（每扇外门一盏，自动）、路灯（主路每 8 到 12 格、路口、城门内侧、广场四角）、窗光 | 危险方向的城门外不点灯 |
| 野外 | 回城出口一盏路灯、营地火盆、敌方营火 | "灯止于危险开始处"；其余全黑，亡灵与夜行魔物出现 |
| 迷宫 | 火盆每层 4 到 7 盆：入口平台、关键门口、首领门槛一对 | 室内固定光；不随时刻变化 |
| 神域与私人 | 恒定柔光或与箱庭同步的天光 | 庭院有门灯与路灯 |
| 战场 | 我方阵地营火与火盆；敌来向全黑 | 夜战地面预警与兵团旗标不受画质档影响 |

光只有暖色一种；冷光留给澱与神迹（保留语义色）。

### 1.9 优先级与里程碑

| 优先级 | 含义 |
| --- | --- |
| P0 | 主线必经，或本幕的枢纽；缺了不能通关 |
| P1 | 主线相关或高复用（迷宫首领、纷争舞台、战场）；缺了体验断裂 |
| P2 | 可选内容（可选迷宫、可选战役、隐藏结局） |
| P3 | 回访变化与收藏向的外观加料 |

里程碑名称按简报第 4 节：M1 垂直切片（序章与第一幕）、M2 Alpha（第二、三幕）、M3 Beta（第四到第六幕与终章）、M4 内容完成与打磨。
每张图上线时同步三件事：地图数据、图集条目的 `status` 与实际尺寸、路线的 `fromExit` 与 `toExit`（[`world_map.md`](world_map.md) 第 7 节）。

### 1.10 本文需要的空间层与逻辑层机制

这些机制在多张图上重复出现，统一在这里定义；实现归内核与世界系统，作为请求列在第 13.3 节。

| 机制 | 定义 | 用到的图 |
| --- | --- | --- |
| 开关格 `switches` | 地图上的矩形列表，每项写 `closedTile`（关时的地块）、`openWhen`（旗标表达式）；旗标变化时可走性重算，渲染淡入淡出 | 封门遗迹门厅落石、锈岭矿塌方口、旧水道沉锁闸水位、断门厅铁闸、苇塘村芦苇小径、沉船湾潮时 |
| 局部澱度 | `LocationDef.sediment`，见第 1.2 节 | 荒原外缘晶沟与灰心、主门坑古澱湖、王胎渊渊底 |
| 否定旗标 | `SpawnDef.requiresFlags` 支持 `!flag`（该旗标为假时才生成） | 多幕图的分幕刷新组 |
| 跨图日程 | NPC 日程段的地点可写 `<地图>:<地点>`；玩家不在该图时按离屏规则执行，玩家在该图时在该地点生成 | 猎户入林、矿工上工、守墓人巡墓 |
| 新装饰种类 | `standing_stone`（立石：边石、界石、禁碑）、`doorframe`（门框：门影、残门，变体 1 为倒伏的拱门）、`ground_mark`（地面记号：粉笔记号、血迹、圣痕）、`dry_well`（枯井）、`shrine_ruin`（砸毁的神龛）、`landmark_tree`（地标树：约树、世界树落枝处）、`mine_lamp`（矿灯，夜里亮，半径 3） | 第一幕多张图与后续各幕 |
| 门址标记 | 地点 `kind` 为 `gate_site` 的矩形；行路之门进阶的落点取其中心最近的可走格 | 封门遗迹、旧水道、门站残墟、无字碑林、万户街、沉船湾、主门坑 |

### 1.11 扩建的做法（已建十张图）

1. **先平移后长图**：现有网格整体平移到新图的对应位置（每张图给出平移量），保证地点、出口、刷新点与装饰的相对位置不变；再在四周按本文布局补地块。
2. **出口跟着地理方位走**：出口所在的边不变；新增的出口按第 1.1 节的路线表落在相应的边上；到达点仍是 `gate_<来源图>` 地点，离出口格 2 到 3 格。
3. **外观层重排**：装饰按新坐标移植后跑 `lookProblems` 与外观层测试；新增装饰按模板配方补足。
4. **度量重测**：每张扩建图都按 [`scene_flow.md`](scene_flow.md) 第 1 节重测首次接触距离、警戒圈压线、遮挡率、夜间照明与死路数，写进该图的验收记录。
5. **存档兼容**：存档里玩家与实体的坐标按平移量换算，存档版本号加一，迁移函数随地图数据一起提交。

## 2. 风格包与素材底座

风格包的数据在 `src/client/hd2d/style_packs.ts`，编号表在 `src/systems/world/look.ts` 的 `STYLE_IDS`。新增的 10 个包与现有 6 个同构：地面色阶、建筑外观候选、树形、四时光照调色、胶片调色、氛围默认值。
下表的"底座"是每个包第一批要生成的素材，供提示词库直接成条。

| 风格包 | 用途 | 主色 | 地面底座（`art_tile_`） | 建筑底座（`art_bld_`） | 道具底座（`art_prop_`） | 远景底座（`art_bg_`） | 首用里程碑 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `lothar_plain` | 洛萨北境乡镇与村落 | 暗绿、灰褐、木色、陶红 | 草地、土路、碎石路、石板广场、麦田、菜畦、浅溪、木桥 | 灰泥半木墙、原木墙、木栅、石砌矮墙、陶红瓦与茅草屋顶、木门、圆窗 | 路灯、井、告示牌、货摊、木桶、木箱、推车、草垛、长椅、旗帜、墓碑 | `art_bg_lothar_plain_far`、`_mid`、`_clouds`（北境远山、林线与礼拜堂尖顶、积云带） | M1 |
| `valen_city` | 瓦伦堡与洛萨城市 | 石灰、蓝灰石板瓦、砖红 | 石板路、鹅卵石、码头木板、广场石、河岸泥、桥面 | 石墙、砖墙、蓝灰石板屋顶、塔楼、城墙与城门、拱桥、教堂钟楼 | 街灯、喷泉、货摊雨棚、鱼摊、木吊车、缆桩、城门旗帜 | `art_bg_valen_city_far`、`_mid`、`_clouds`（河谷远山、瓦伦堡城郭剪影、雨意层积云） | M2 |
| `wild_forest` | 野地、林缘与林中 | 深绿、苔绿、树皮褐 | 林地草、苔石、落叶、林间土路、泉水、灌丛 | 猎人木屋、伐木棚、林中石台 | 营火、皮架、陷阱、伐木桩、蘑菇丛、倒木 | `art_bg_wild_forest_far`、`_mid`、`_clouds`（层叠针叶树冠、林线剪影、晨雾带） | M1 |
| `sealed_ruins` | 封印遗迹与地下 | 冷灰石、苔绿、灰白 | 冷灰石板、碎石、积灰地、浅水渠、深水渠、石阶 | 半高剖面石墙、拱门、圆形大厅墙、门形浮雕墙、石柱 | 火盆、落石堆、铁闸、封条、骨堆、残卷 | 无（地下）；露天段用区域风格包的天幕 | M1 |
| `ash_waste` | 灰烬荒原 | 灰白、铁锈、淡紫晶光 | 灰地、灰沙、灰泥、石化树根地、晶沟碎晶、玻璃原熔面 | 灰村残墙、门框残骸、拱石、营帐 | 石化树、枯树、晶簇、灰堆、残门牌、营火 | `art_bg_ash_waste_far`、`_mid`、`_clouds`（灰白地平线与门框残骸、石化林与灰村残墙、灰暴云带） | M1 |
| `divine_court` | 神域与门内庭院 | 白石、金、恒定柔光 | 白石地砖、金线地纹、庭院草地、庭泉 | 白墙、帘幕、白石柱、庭院小屋 | 长椅、长桌、座席、庭镜、门框（门扉金） | `art_bg_divine_court_far`、`_mid`、`_clouds`（雾白浮岛、白石柱廊、光云带） | M1 |
| `forge_deep` | 矿坑、矿道与炉城（锈岭矿与深层、赤砧山与深炉；锈岭矿所需的部件 M1，矮人炉城部件 M3） | 铁锈红、煤黑、原木黄、晶脉淡紫 | 矿道土、碎矿石、矿渣、木轨、积水坑、晶脉岩面 | 原木支护、矿口木框、矿工棚、竖井木架 | 矿车、矿灯、镐与铲、绞盘、塌方堆、木梯 | 无（地下）；矿口外的露天段用区域风格包的天幕 | M1 |
| `holy_see_white` | 圣艾琉恩教国 | 白、金、橄榄绿 | 白石路、大理石广场、橄榄林地、白垩坡 | 白石穹顶、钟楼、拱廊、修院高墙 | 圣灯、钟架、朝圣者推车、圣像、香炉 | `art_bg_holy_see_white_far`、`_mid`、`_clouds`（白垩丘陵、瑟兰穹顶群、晴空积云） | M3 |
| `grantia_ochre` | 格兰提亚帝国 | 赭红、钢灰、麦黄 | 赭红砖路、麦田、斗场沙地、军营土场 | 赭红砖城、长垒段墙、竞技场看台、军营帐 | 军旗、兵器架、马槽、斗场铁栅、石碑 | `art_bg_grantia_ochre_far`、`_mid`、`_clouds`（千穗麦浪与长垒、帝都城郭、列队高积云） | M3 |
| `mercato_coast` | 梅尔卡托同盟 | 海蓝、金、赤陶 | 海港石堤、沙滩、赤陶街砖 | 赤陶屋顶商馆、仓栈、交易所 | 秤、货箱、船帆、缆绳 | `art_bg_mercato_coast_far`、`_mid`、`_clouds`（海面岬角与冒烟的火山、港城天际线、海风流云） | M3 |
| `silva_canopy` | 希尔瓦大森林 | 深绿、银、雾白 | 林冠苔地、银苔、根桥、灵泉水面、落枝 | 巨树树屋、林冠桥、议庭环木、根下石室 | 银灯、藤帘、祭坛石、灵泉莲 | `art_bg_silva_canopy_far`、`_mid`、`_clouds`（巨树林冠云海、林冠层吊桥、雾带） | M3 |
| `windfang_steppe` | 风牙草原 | 草黄、天蓝、毡红 | 长草地、短草地、季河浅滩、碎石岗 | 毡帐、木栅营、石台、祖灵冢土丘 | 图腾柱、马桩、皮鼓、风铃、篝火 | `art_bg_windfang_steppe_far`、`_mid`、`_clouds`（草原地平线与风牙岩、毡帐与马群、大朵积云） | M3 |
| `night_basalt` | 夜境 | 黑、暗红、温泉青白 | 黑岩地、火山灰、温泉水面、冻原苔 | 黑岩城墙、角冠式尖塔、温泉浴屋、山地堡 | 暗红灯笼、角饰、熔岩槽、黑铁门 | `art_bg_night_basalt_far`、`_mid`、`_clouds`（火山群与烟柱、黯冠城城郭、火山烟云） | M3 |
| `sleepscale_snow` | 眠鳞山脉 | 冰蓝、雪白、岩灰 | 雪地、冰面、碎岩坡、高山草甸 | 石座、雪中石屋、栈道 | 七席石座、经幡式风绳、冰柱、龙鳞碎片 | `art_bg_sleepscale_snow_far`、`_mid`、`_clouds`（雪峰与触穹峰、雪岭栈道、云海与龙影） | M3 |
| `door_corridor` | 千门回廊与门口的女人出现的梦境 | 幽暗、门扉金微光、镜面暗地 | 镜面暗地、门槛石小路、钥纹地砖、旧木廊地板、褪色长地毯、碎裂悬浮的地面边缘 | 门框叠墙、钥纹墙板、暗镜墙、梦中灰泥墙、悬浮门、巨门、门阶 | 各廊的门、空门框、门灯、钥台、六椅 | 回廊无天幕（远处是代码绘制的门影层）；梦境用特殊天幕 `art_bg_sky_dream_door_sea_far`、`_near` | M1 |
| `earth_modern` | 序章的四个地球开场 | 荧光灯冷白、雨水反光、无字招牌 | 车厢地板、便利店白地砖、医院地胶、老宅木地板、湿柏油、人行道方砖 | 车厢内墙板、瓷砖墙、医院墙裙、老宅墙纸、便利店门面、电车车厢 | 车厢长座、吊环、滑门、货架等室内陈设 | 室外段用特殊天幕 `art_bg_sky_earth_night_city_far`、`_near` | M1 |

- 夜境地下与各国地下迷宫一律用 `sealed_ruins`，以 `looks` 换材质（白瓷、录墨、炉渣、黑岩）区分；不为每座迷宫单立风格包。
- 远景天幕（D-078）按风格包分层：12 个室外风格包各有远景、中景、云层三层（四时、昼夜与天气由光照调色与天气层驱动，灰暴是天气，不另出天幕）；特殊天幕五套另列 `art_bg_sky_<名>_far`、`_near`，用法见第 1.7 节。

## 3. 序章、神域、私人领域与过场布景

过场布景（`role: stage`）只在过场里出现：没有出口，不进图集路线，由过场的 `teleport` 进入（[过场目录](../content/catalog_cutscenes.md)第 2.6 节）。地球四景属新区域 `earth`，坠落、千门回廊与梦中的门口属 `court_gap`。

### P0 `divine_court` 候见厅（审庭）（The Antechamber）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，舞台；单场景，无出口 |
| 幕与区域 | 序章、第六幕；`divine_realm`；无省份 |
| 尺寸 | 24×16 到 32×24（平移 (4, 4)；北半纵深从 6 格扩到 10 格容纳审庭，南半保留"纯白、无窗"的尺度） |
| 风格包 | `divine_court`（区域默认） |
| 澱度 | 零，存储 0，渲染 0 |
| 等级带 | 无；第六幕终战段按 60（迷宫目录的 `eluen_avatar`、`valda_broken_sword` 等化身在审庭北半的终战布局里进行） |
| 地形与布局 | 南半候见厅：长椅（西南）、号码板（帘幕南侧中段）、灵镜（东墙中段）；中线一排帘幕门格；北半面试厅到审庭：序章是长桌与第六把椅子，第六幕是庭镜居中轴、五司坐长桌后的白椅（第六把仍空着），长桌对面玩家当初站立的地方由剧情长出庭之席（门木椅子），证人台与证物台分列两侧、南沿一排旁听长椅。面试厅与审庭是同一张图的两套外观，第六幕由剧情旗标切换 `looks` 与装饰组 |
| 出入口与路线 | 无出口。序章出生点在帘幕西端南边；第六幕入口 `antechamber`。审期危机的"下庭"是庭镜上的门，由剧情传送到箱庭里既有的地图，不进图集路线 |
| 动线与镜头 | T-S；固定默认镜头，不可转（序章不教镜头）；序章 P4 主动线：出生点到灵镜到长椅到帘幕到庭之席；第六幕从帘幕进入正对庭镜 |
| 驻留 NPC | 五司以声音与身影出现（剧情脚本）；序章隔壁面试的勇者团 `luchen`、`yui`、`aiden`、`marcus`；第六幕证人按第六幕证人表传唤 |
| 魔物分布 | 无常驻；第六幕终战段由剧情生成 |
| 采集点 | 无 |
| 照明与夜间 | 恒定柔光，无昼夜；第六幕审期按阶段由剧情改变光色（开庭冷白、质证暖白、终审金） |
| 装饰与外观层 | 序章 2 件（长椅两张）；第六幕装饰组 14 件：长桌白椅 6（五司与第六把）、庭之席 1（剧情长出前不显示）、证人台 1、证物台 1、旁听长椅 4、庭镜基座 1。正典只写"纯白"，不加别的物件 |
| 任务挂点 | 序章 P3 到 P6（外貌、号码、偷听三档、面试）；第六幕开庭、指控、质证、陈述、终审、下庭门 |
| 美术素材 | 建筑：`art_bld_divine_court_curtain`（帘幕门格）；道具：`art_prop_number_board`、`art_prop_spirit_mirror`、`art_prop_long_table`、`art_prop_sixth_chair`、`art_prop_court_seat`（庭之席：白石地板裂纹里长出的门木椅子，一把）、`art_prop_witness_stand`、`art_prop_evidence_stand`、`art_prop_court_mirror`；远景无 |
| 优先级与里程碑 | P0；序章布局 M1，第六幕审庭外观组 M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `antechamber` | 候见厅 | 南半 | 序章自由探索 | 无 |
| `bench` | 长椅 | 西南 | 偷听"远"档 | 无 |
| `spirit_mirror` | 灵镜 | 东墙中段（离帘幕东端 5 格以上） | 外貌定制 | 无 |
| `number_board` | 号码板 | 帘幕南侧中段 | 序章号码 | 无 |
| `curtain` | 帘幕 | 中线 | 偷听"中""近"档的参照 | 无 |
| `interview_hall` | 面试厅（审庭） | 北半 | 序章面试；第六幕开庭 | 无 |
| `long_table` | 长桌 | 北半，帘幕以北 | 序章五位女神的面试席；第六幕五司的座席 | 无 |
| `sixth_chair` | 第六把椅子 | 长桌尽头 | 序章只作画面与声响；第六幕仍空着（只有透过门才看得见） | 无 |
| `court_seat` | 庭之席 | 北半中轴 | 第六幕 | 无 |
| `court_mirror` | 庭镜 | 北半正中 | 证据展示；下庭门 | 无 |
| `witness_stand`、`evidence_stand` | 证人台、证物台 | 北半两侧 | 第六幕质证 | 无 |

### X1 `inner_court` 门内庭院（The Inner Court）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，私人；复苏点 |
| 幕与区域 | 第一幕末到第五幕（第六幕审庭期间仍可进入）；`court_gap`；无省份 |
| 尺寸 | 24×20 到 48×40（平移 (12, 10)：现有庭院居中，四周一圈 12 格宽的雾中草地，随城建扩建逐圈揭开） |
| 风格包 | `divine_court`（区域默认；包内有草地与树形） |
| 澱度 | 零，存储 0，渲染 0 |
| 等级带 | 无（清域，任何女神看不进来） |
| 地形与布局 | 中央格（建设辐射中心，永不建房）；门影在南；小屋在西北（复苏点在门前）；旧园子在北；池塘在东南。扩建四圈按 [`city_building.md`](../systems/city_building.md) 的门内庭院条目：仓廪（东）、演武场（西）、研究所（东北）、隐城（南外圈）；第四幕东北角边缘出现"从未开过的回廊"（门框装饰，不可进入，属剧情外观） |
| 出入口与路线 | 无出口；门路线 `borderstone_inner_court`：从任意地点进入，落在门影，离开回到进门之前的位置；死亡后在小屋门前复苏 |
| 动线与镜头 | T-S；门影到中央到小屋到园子一条短线始终留空；城建摆放时允许转镜头与俯视预设 |
| 驻留 NPC | 被允许出入的从者与伙伴（同伴与将领重伤退场时在此休养，D-073）；夜羽常驻小屋檐下 |
| 魔物分布 | 无 |
| 采集点 | `node_garden_plot`（庭园药畦，T0）、`node_garden_well`（庭井，T0） |
| 照明与夜间 | 时间与箱庭同步；小屋门灯、门前路灯；扩建建筑各自门灯；不加灯以外的光源 |
| 装饰与外观层 | 现有 6 件；门框 1（门影，`doorframe`，门扉金）；每次扩建加栅栏、长椅各 1 到 2 件；中央格留空 |
| 任务挂点 | 第一幕末梦后开启；仓库、复苏、伙伴休养；庭具制作（门标、回门符、庭泉茶）；第四幕的回廊外观；第五幕执钥人集结 |
| 美术素材 | 地面：`art_tile_divine_court_garden_grass`、`art_tile_divine_court_spring`；建筑：`art_bld_divine_court_cabin`（木与白石小屋）、扩建四种建筑各一套；道具：`art_prop_doorframe_gold`（门影）、`art_prop_herb_plot`、`art_prop_court_well`；远景：`art_bg_divine_court_far`、`art_bg_divine_court_mid`、`art_bg_divine_court_clouds` |
| 优先级与里程碑 | P0；M1（第一幕末开启），扩建圈 M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `court_arrival` | 门影 | 南 | 进出落点 | 无 |
| `court_center` | 庭院中央 | 中 | 建设中心 | 无 |
| `court_cabin`、`court_respawn` | 小屋与门前 | 西北 | 仓库、复苏点 | 无 |
| `court_garden_old` | 旧园子 | 北 | 药畦 | 无 |
| `court_pond` | 庭泉池塘 | 东南 | 庭井取水 | 无 |
| `court_corridor_edge` | 回廊边缘 | 东北外圈 | 第四幕外观 | 无 |
| `court_table` | 小屋前的木桌 | 西北，小屋门前 | 门内庭院里的谈话（第四幕起） | 无 |

### F1 `maker_room` 造主的房间（The Maker's Room，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，舞台；可选（隐藏结局） |
| 幕与区域 | 终章；`divine_realm`；无省份 |
| 尺寸 | 12×10 |
| 风格包 | `divine_court`，以 `looks` 覆盖为木墙、木地板（书房） |
| 澱度 | 零，存储 0，渲染 0 |
| 等级带 | 无 |
| 地形与布局 | 一间书房：桌子居中偏北，椅子推开；西墙石板；东侧第二扇门（推不开，门缝下透光）；进门的门在南墙。构图与序章"玩家在候见厅外等待、隔壁在面试"相同 |
| 出入口与路线 | 无出口；由终章剧情（千门回廊尽头的门，或地球房间墙上的门）进入 |
| 动线与镜头 | T-S；固定镜头；进门到桌子 4 米、到石板 4 米、到第二扇门 6 米 |
| 驻留 NPC | 无 |
| 魔物分布 | 无 |
| 采集点 | 无 |
| 照明与夜间 | 室内一盏灯；玩家碰第二扇门时光闪一下（剧情） |
| 装饰与外观层 | 桌、椅、杯、草稿纸叠、信、石板、第二扇门；合计 7 件 |
| 任务挂点 | 第六幕 14.3：读信、翻草稿、看石板、推门 |
| 美术素材 | 地面：`art_tile_maker_room_floorboard`；建筑：`art_bld_maker_room_wall`；道具：`art_prop_maker_desk`、`art_prop_maker_chair`、`art_prop_maker_letter`、`art_prop_maker_cup`、`art_prop_maker_drafts`（大陆轮廓与六位女神的早期速写，画风有意不同）、`art_prop_maker_tablet`（一个像"未"又不是同一种文字的字）、`art_prop_maker_door_light` |
| 优先级与里程碑 | P2；M3 |

### P1 `earth_train` 末班车车厢（The Last Train）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，舞台（过场布景）；只由过场传送进入 |
| 幕与区域 | 序章、终章；`earth`；无省份 |
| 尺寸 | 24×8（一节车厢 20 米长，两端各留 2 格贯通道） |
| 风格包 | `earth_modern` |
| 澱度 | 零，存储 0，渲染 0 |
| 等级带 | 无 |
| 地形与布局 | 东西向的一节车厢：两侧长座椅，中间过道；北侧是车门与车窗（窗外是隧道与城市夜景），南侧座椅是玩家起点；东端贯通道通往下一节（转角） |
| 出入口与路线 | 无出口，不进图集路线；`cut_p_earth` 与 `cut_end_release` 以 `teleport` 进入 |
| 动线与镜头 | T-S；固定镜头，入口在南、门出现的位置在北（D-063）；起点到车门 3 米 |
| 驻留 NPC | 无常驻；过场按条目放置路人立牌（`art_chr_earth_*`） |
| 魔物分布 | 无 |
| 采集点 | 无 |
| 照明与夜间 | 车厢顶灯冷白，隧道段窗外忽明忽暗；门出现时暖金的门光压过顶灯 |
| 装饰与外观层 | 长座椅 4、扶手吊环 2 组、车门 2；合计约 8 件 |
| 任务挂点 | 序章开场 A（末班车）、`cut_p_door_white` 的门；真结局回到地球 A |
| 美术素材 | 地面：`art_tile_earth_modern_train_floor_01`、`_02`；建筑：`art_bld_earth_modern_wall_train_panel`、`art_bld_earth_modern_facade_train`、`art_bld_earth_modern_train_car`；道具：`art_prop_earth_modern_train_seat`、`art_prop_earth_modern_train_handholds`、`art_prop_earth_modern_train_door`；远景：`art_bg_sky_earth_night_city_far`、`art_bg_sky_earth_night_city_near` |
| 优先级与里程碑 | P0；M1 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `seat` | 座位 | 南侧中段 | 玩家起点 | 无 |
| `opposite` | 对面座位 | 北侧中段 | 醉汉的座位 | 无 |
| `window` | 车窗 | 北墙 | 窗外夜景与倒影 | 无 |
| `car_door` | 车门 | 北墙东段 | 门出现的位置 | 无 |
| `gangway` | 贯通道 | 东端 | 转角（离开时消失的方向） | 无 |

### P2 `earth_store` 雨夜便利店（The Convenience Store in the Rain）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，舞台（过场布景）；只由过场传送进入 |
| 幕与区域 | 序章、终章；`earth`；无省份 |
| 尺寸 | 16×12 |
| 风格包 | `earth_modern` |
| 澱度 | 零，存储 0，渲染 0 |
| 等级带 | 无 |
| 地形与布局 | 南墙是玻璃门与入口（门外是雨夜的人行道），西侧收银台，中间两排货架，北墙一排冷柜，东北角是仓库门 |
| 出入口与路线 | 无出口，不进图集路线；`cut_p_earth` 与 `cut_end_release` 以 `teleport` 进入 |
| 动线与镜头 | T-S；固定镜头，入口在南、门出现的位置在北（冷柜）；收银台到冷柜 8 米 |
| 驻留 NPC | 无常驻；过场按条目放置路人立牌（`art_chr_earth_*`） |
| 魔物分布 | 无 |
| 采集点 | 无 |
| 照明与夜间 | 店内日光灯通明，门外雨夜；冷柜的灯带是唯一的冷色光源 |
| 装饰与外观层 | 货架 4、冷柜 3、收银台 1、伞架 1、杂志架 1、自动售货机 1（门外）；合计约 11 件 |
| 任务挂点 | 序章开场 B（店员或顾客两种身份）、`cut_p_door_white` 的门；真结局回到地球 B（给猫起名） |
| 美术素材 | 地面：`art_tile_earth_modern_store_tile_01`、`_02`、`art_tile_earth_modern_wet_asphalt_01`、`_02`、`art_tile_earth_modern_sidewalk_pavers_01`、`_02`；建筑：`art_bld_earth_modern_wall_store_tile`、`art_bld_earth_modern_facade_store`、`art_bld_earth_modern_store_front`；道具：`art_prop_earth_modern_store_shelf`、`art_prop_earth_modern_store_fridge`、`art_prop_earth_modern_store_counter`、`art_prop_earth_modern_umbrella_stand`、`art_prop_earth_modern_magazine_rack`、`art_prop_earth_modern_vending_machine`、`art_prop_earth_modern_cat_box` |
| 优先级与里程碑 | P0；M1 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `counter` | 收银台 | 西 | 店员版的起点 | 无 |
| `freezer` | 冷柜 | 北墙 | 门出现的位置 | 无 |
| `entrance` | 入口 | 南墙正中 | 顾客版的起点；门外屋檐下有猫 | 无 |
| `aisle` | 货架通道 | 中 | 走位 | 无 |
| `stockroom` | 仓库门 | 东北角 | 转角 | 无 |

### P3 `earth_hospital` 凌晨的医院走廊（The Hospital Corridor Before Dawn）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，舞台（过场布景）；只由过场传送进入 |
| 幕与区域 | 序章、终章；`earth`；无省份 |
| 尺寸 | 24×8 |
| 风格包 | `earth_modern` |
| 澱度 | 零，存储 0，渲染 0 |
| 等级带 | 无 |
| 地形与布局 | 东西向的走廊：南侧一排候诊长椅，中段护士站，北墙一排病房门，北墙东段安全出口指示灯下是一段空墙，东端电梯口 |
| 出入口与路线 | 无出口，不进图集路线；`cut_p_earth` 与 `cut_end_release` 以 `teleport` 进入 |
| 动线与镜头 | T-S；固定镜头，入口在南、门出现的位置在北（安全出口灯下）；长椅到门 4 米 |
| 驻留 NPC | 无常驻；过场按条目放置路人立牌（`art_chr_earth_*`） |
| 魔物分布 | 无 |
| 采集点 | 无 |
| 照明与夜间 | 走廊夜灯调暗，护士站一盏台灯，安全出口灯是绿色的点光 |
| 装饰与外观层 | 候诊长椅 3、护士站 1、输液架 1、轮椅 1、推床 1、自动售货机 1；合计约 8 件 |
| 任务挂点 | 序章开场 C（在等一个结果）、`cut_p_door_white` 的门；真结局回到地球 C |
| 美术素材 | 地面：`art_tile_earth_modern_hospital_vinyl_01`、`_02`；建筑：`art_bld_earth_modern_wall_hospital_wainscot`、`art_bld_earth_modern_facade_hospital_house`；道具：`art_prop_earth_modern_waiting_chairs`、`art_prop_earth_modern_nurse_station`、`art_prop_earth_modern_iv_stand`、`art_prop_earth_modern_wheelchair`、`art_prop_earth_modern_gurney`、`art_prop_earth_modern_vending_machine` |
| 优先级与里程碑 | P0；M1 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `chairs` | 候诊长椅 | 南侧中段 | 玩家起点 | 无 |
| `nurse_station` | 护士站 | 中 | 夜班护士 | 无 |
| `ward_door` | 病房门 | 北墙西段 | 在等的结果所在的病房 | 无 |
| `exit_sign` | 安全出口灯下 | 北墙东段 | 门出现的位置 | 无 |
| `elevator` | 电梯口 | 东端 | 转角 | 无 |

### P4 `earth_house` 老宅最后一个房间（The Last Room of the Old House）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，舞台（过场布景）；只由过场传送进入 |
| 幕与区域 | 序章、终章；`earth`；无省份 |
| 尺寸 | 12×10 |
| 风格包 | `earth_modern` |
| 澱度 | 零，存储 0，渲染 0 |
| 等级带 | 无 |
| 地形与布局 | 搬空了的老房间：家具盖着白布，地上几只纸箱；南侧一把旧椅子，西墙是房门，东墙是窗，北墙是旧衣柜，西南角楼梯口通往楼下 |
| 出入口与路线 | 无出口，不进图集路线；`cut_p_earth`、`cut_end_release` 与隐藏结局"回去"版以 `teleport` 进入 |
| 动线与镜头 | T-S；固定镜头，入口在南、门出现的位置在北（衣柜）；旧椅子到衣柜 5 米 |
| 驻留 NPC | 无常驻；过场按条目放置路人立牌（`art_chr_earth_*`） |
| 魔物分布 | 无 |
| 采集点 | 无 |
| 照明与夜间 | 傍晚，窗外的光斜进来；没有开灯 |
| 装饰与外观层 | 旧椅子 1、旧衣柜 1、盖布的家具 3、纸箱 3、遗物一小堆 1；合计约 9 件 |
| 任务挂点 | 序章开场 D（搬家前最后一天）、`cut_p_door_white` 的门；真结局回到地球 D（搬走旧椅子）；隐藏结局"回去"版墙上的门 |
| 美术素材 | 地面：`art_tile_earth_modern_old_house_floorboard_01`、`_02`；建筑：`art_bld_earth_modern_wall_old_house_wallpaper`、`art_bld_earth_modern_facade_hospital_house`；道具：`art_prop_earth_modern_old_chair`、`art_prop_earth_modern_old_wardrobe`、`art_prop_earth_modern_sheeted_furniture`、`art_prop_earth_modern_cardboard_boxes`、`art_prop_earth_modern_keepsakes` |
| 优先级与里程碑 | P0；M1 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `old_chair` | 旧椅子 | 南侧中段 | 玩家起点 | 无 |
| `door_frame` | 房门门框 | 西墙 | 搬家工人在门外 | 无 |
| `wardrobe` | 旧衣柜 | 北墙 | 门出现的位置 | 无 |
| `window` | 窗 | 东墙 | 傍晚的光 | 无 |
| `stairs` | 楼梯口 | 西南角 | 转角 | 无 |

### X2 `gap_void` 庭间之隙（坠落与黑）（The Gap Between Courts）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，舞台（过场布景）；只由过场传送进入 |
| 幕与区域 | 序章、第五幕、第六幕、终章；`court_gap`；无省份 |
| 尺寸 | 16×16（无地面，坠落与漂浮） |
| 风格包 | `door_corridor`（只取虚空边缘与门光） |
| 澱度 | 零，存储 0，渲染 0 |
| 等级带 | 无 |
| 地形与布局 | 没有地面的黑：画面中央是下坠或漂浮的玩家，四周偶尔掠过门框的暖金轮廓；底部不画任何东西 |
| 出入口与路线 | 无出口，不进图集路线；序章坠落（`cut_p_discard`）、最后一扇门的门后（`cut_a5_mirror_c`）、地球真相里门外的黑（`cut_a6_earth_truth`）与回收结局（`cut_end_reclaim`）以 `teleport` 进入 |
| 动线与镜头 | T-S；固定镜头居中，镜头随坠落缓慢下移 |
| 驻留 NPC | 无 |
| 魔物分布 | 无 |
| 采集点 | 无 |
| 照明与夜间 | 全黑；只有门框轮廓与接住时手腕处的一圈暖金 |
| 装饰与外观层 | 无装饰；漂浮门框为特效层 |
| 任务挂点 | "接住你了"（序章）；回收的"黑。然后，一扇门" |
| 美术素材 | 地面：`art_tile_door_corridor_void_edge_01`、`_02`（只作边缘遮罩）；道具：`art_prop_door_corridor_floating_frames` |
| 优先级与里程碑 | P0；M1 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `fall` | 坠落 | 中 | 坠落与漂浮的落点 | 无 |

### X3 `door_corridor` 千门回廊（The Corridor of a Thousand Doors）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，舞台（过场布景）；只由过场传送进入；回廊界面 `ui_mode_corridor` 的门列表不是这张图 |
| 幕与区域 | 第一到第六幕、终章；`court_gap`；无省份 |
| 尺寸 | 64×16（一条东西向的长廊，两侧是门） |
| 风格包 | `door_corridor` |
| 澱度 | 零，存储 0，渲染 0 |
| 等级带 | 无 |
| 地形与布局 | 长廊两侧排着玩家开过与未开的门，地面是镜面与门槛石路；西端醒厅（第一扇门），其后结绳廊、镜廊等以门为界的厅段；中段开阔；东端尽头是一扇大门（复原之门与隐藏结局的门在此） |
| 出入口与路线 | 无出口，不进图集路线；开门演出、离手之门、千门回廊之战与隐藏结局"留下"版以 `teleport` 进入 |
| 动线与镜头 | T-S；横向跟拍，玩家自西向东走；离手之门倒着走（自东向西） |
| 驻留 NPC | 无；第六幕终战时门口的女人在中段 |
| 魔物分布 | 无常驻；千门回廊之战由剧情生成门后的影子 |
| 采集点 | 无 |
| 照明与夜间 | 门缝的暖金是主光；每扇开过的门前一盏门灯 |
| 装饰与外观层 | 门按玩家已开的门生成（门的状态件）；门灯随门；钥台 1、拱门 3 |
| 任务挂点 | 第一幕开门、契约之门、识才之门的演出；第六幕千门回廊之战、五司围门、复原之门；离手之门；隐藏结局"留下"版 |
| 美术素材 | 地面：`art_tile_door_corridor_mirror_floor_01`、`_02`、`art_tile_door_corridor_threshold_path_01`、`_02`、`art_tile_door_corridor_keywork_mosaic_01`、`_02`；建筑：`art_bld_door_corridor_wall_stacked_doorframes`、`art_bld_door_corridor_wall_mirror_obsidian`、`art_bld_door_corridor_great_door`；道具：`art_prop_door_corridor_door_states`、`art_prop_door_corridor_door_sealed_states`、`art_prop_door_corridor_hall_arch`、`art_prop_door_corridor_door_lamp`、`art_prop_door_corridor_key_pedestal`、`art_prop_door_corridor_end_door` |
| 优先级与里程碑 | P0；M1（醒厅与第一幕的厅段），第六幕的中段与尽头 M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `wake_hall` | 醒厅 | 西端 | 第一扇门（初门·醒）；开门演出的默认落点 | 无 |
| `knot_hall` | 结绳廊 | 醒厅以东 | 契约之门（夜羽） | 无 |
| `mirror_hall` | 镜廊 | 结绳廊以东 | 识才之门 | 无 |
| `corridor_mid` | 回廊中段 | 中 | 千门回廊之战 | 无 |
| `restoration_door` | 复原之门 | 东端尽头 | 五司围门；复原之门的抉择 | 无 |

### X4 `dream_doorway` 梦中的门口（The Doorway in the Dream）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，舞台（过场布景）；只由过场传送进入 |
| 幕与区域 | 第一到第五幕；`court_gap`；无省份 |
| 尺寸 | 16×12 |
| 风格包 | `door_corridor`（梦的灰泥墙与门扉） |
| 澱度 | 零，存储 0，渲染 0 |
| 等级带 | 无 |
| 地形与布局 | 黑里只有一扇门与门前一小块地：门在北，门缝漏出暖光；布景按封印松动度分阶段增减（门缝一指宽、一掌宽、半开、门框上的钥匙钉与第二扇门的门框），由剧情旗标切换 `looks` |
| 出入口与路线 | 无出口，不进图集路线；门口的女人的全部梦境以 `teleport` 进入 |
| 动线与镜头 | T-S；固定镜头，玩家在南、门在北，相距 3 米 |
| 驻留 NPC | 门口的女人（剧情）；第五幕梦 A 里门口站着的人另由剧情放置 |
| 魔物分布 | 无 |
| 采集点 | 无 |
| 照明与夜间 | 梦光；门缝的暖金随阶段变宽 |
| 装饰与外观层 | 门 1（按阶段换外观）、门框上的钥匙钉 1（第四幕起）；合计 2 件 |
| 任务挂点 | 第一幕"门口的女人"、第二幕第四周与第十周的梦、第三幕警告的梦、第四幕的梦、第五幕撕封之夜 |
| 美术素材 | 建筑：`art_bld_door_corridor_wall_dream_plaster`、`art_bld_door_corridor_facade_dream_doorway`；远景：`art_bg_sky_dream_door_sea_far`、`art_bg_sky_dream_door_sea_near`；静帧 `art_bg_cut_a1_dream_door` 作首梦底图 |
| 优先级与里程碑 | P0；M1 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `doorway` | 门前 | 中，门在北 | 梦的落点：玩家站在门前 | 无 |

## 4. 第一幕：A 系列（边石镇区域）

### A1 `borderstone` 边石镇（Edgestone）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，枢纽 |
| 幕与区域 | 第一到第五幕（第一、三、四、五幕的枢纽）；`edgestone_area`；`ash_border` |
| 尺寸 | 56×44 到 96×80（平移 (20, 18)：镇子居中；北加缓坡与北门外小路，南加墓园、驿站马厩院与南大路起点，东西各加东坡林缘人家与西田磨坊） |
| 风格包 | `lothar_plain`（区域默认） |
| 澱度 | 一，存储 1，渲染 1；北泉一带局部二（第一幕澱病的源头，净渗后回落） |
| 等级带 | 镇内无常驻战斗；兽潮之夜 6 到 14（首领 `dian_colossus` 14）；第五幕后方·边石 50 到 56 |
| 地形与布局 | 矮丘上的木栅镇，北段石墙。广场居中，中央立边石（半人高的灰石）；礼拜堂位于广场北侧正中，钟楼是镇上最高处，北门进来一路可见其屋顶，门朝南开向广场；公会在广场东北，醉月亭在广场西南、主门开在南墙。北门（荒原门）外是通往界石线的镇北小路；南门（镇民俗称王道门）出南大路；东门外是东坡猎户聚居地与欧拉的药草小屋；西口过洗衣溪石桥接西北矿道。镇外：西北路口矿工棚、南门外驿站马厩院、西南小坡墓园、东北溪边伐木场 |
| 出入口与路线 | 北 `to_borderstone_north`（镇北小路，3 公里，到 A2 南缘；本文落定：去封门遗迹经 A2 上残阶坡；北门内的到达点 `gate_seal_ruins` 随之更名 `gate_borderstone_north`）；西 `to_borderstone_north_w`（西北矿道，`borderstone_north_road`，到 A2 西南缘）；东 `to_forest_edge`（`borderstone_forest_edge`）；东南 `to_old_outpost`（`borderstone_old_outpost`）；南 `to_south_road`（区域图出口：`south_road_north` 到苇桥村，`borderstone_wallenburg` 到瓦伦堡）；门内庭院门（`borderstone_inner_court`） |
| 动线与镜头 | T-H；第一幕首访是北入图：北门外一对旗帜与路牌、门内路灯与哨所火盆、第一屏可见礼拜堂钟楼与公会侧缝立牌；之后多从南门与东门进入，符合"入口在南或侧、目标在北" |
| 驻留 NPC | `bron`、`hock`、`lina`、`ron`、`dris`（公会）；`cassian`、`isa`、`toma`、`bertha`（礼拜堂）；`greta`、`noi`、`tess`（孤儿院）；`martha`、`dora`（醉月亭）；`nera`、`popo`（商会分号）；`moss`、`vick`（代官宅）；`barga`（铁匠铺）；`oola`（药草小屋）；`gorn`、`shiya`、`ako`、`boro`（东坡）；`gaspar`、`nick`（伐木场）；`barto`、`jed`（哨所）；`ped`、`lisa`（面包房）；`owen`（集日）；`ed`（墓地）；`simon`（西田）；`marg`（洗衣溪）；`viro`（骰子屋）；`ulf_lange`（驿站）；锈岭矿工模板 3 人（矿工棚） |
| 魔物分布 | 常驻无。兽潮之夜（第一幕第 10 周前后，`mtide_lotha_rim` 与 `data/combat/waves.json` 的 `tide_*`）：第一波东门外 `dian_wolf` Lv8 到 12、`dian_boar` Lv4 到 6、`edge_spider` Lv6；第二拍北门外 `wandering_bones` Lv6 到 9；`dian_colossus` Lv14（北门外到孤儿院 29 米的追击线）；第二波澱流 `dian_dreg` Lv1 到 2 与 `dian_spirit` Lv11 到 13。第五幕后方·边石：`ashtide_vanguard` Lv50 到 56 自北门与旧巡逻道口来（战线结算触发） |
| 采集点 | `node_lotha_north_spring`（北泉泉边，T1）；`node_lotha_silverleaf_meadow`（镇南缓坡，T1） |
| 照明与夜间 | 门灯约 26 盏（自动）；路灯 22 盏：南北路 4、东西路 4、广场四角 4、盐巷 1、四门内侧各 1、南门外出口 1、驿站马厩院 1、矿工棚 1、墓园入口 1、东坡 2；火盆 3（哨所、铁匠铺炉火、东坡熏肉棚）。北门外不点灯；两条主动线夜间照明不少于 90% |
| 装饰与外观层 | 现有 55 件按平移移植；增立石 1（边石）、马厩院推车与草垛 3、矿工棚矿车与木箱 3、墓园墓碑 2、钟楼下长椅 1；合计约 65（枢纽城镇上限 70，外观层测试同步）。`looks`：磨坊 `sign: wheel`、面包房 `sign: bread`、驿站 `sign: horseshoe`；礼拜堂墙高 4.2 米、钟楼 6 米 |
| 任务挂点 | 第一幕：公会登记（无记载）、委托板、税与匪、魔女审判（广场审判台）、盐与药（商会后仓）、林地之争（东坡）、酒馆的眼睛与醉月亭地窖（`dg_moon_cellar`，室内层）、布伦的旧伤（公会档案室）、面包房的婚约、奥托磨坊的遗产、集市失窃案、兽潮之夜、伯爵来信（驿站）；第三幕领主府候选；第四幕国都与界石之战（A1-1 界石垒）；第五幕后方·边石（玛莎、布伦、卡西安、欧拉守城） |
| 美术素材 | 建筑：`art_bld_lothar_plain_chapel_bell`（礼拜堂与钟楼）、`art_bld_lothar_plain_guild_twostory`、`art_bld_lothar_plain_tavern_drunkmoon`、`art_bld_lothar_plain_magistrate_stone`、`art_bld_lothar_plain_orphanage_manor`、`art_bld_lothar_plain_mill_wheel`、`art_bld_lothar_plain_post_station`、`art_bld_lothar_plain_east_slope_hut`（兽人木屋与皮架）、`art_bld_lothar_plain_north_gatehouse`（石砌门楼）；道具：`art_prop_edgestone`、`art_prop_smoke_shed`、`art_prop_judgement_stage`、`art_prop_merca_shrine_coinslot`、`art_prop_new_grave_milo`；远景：`art_bg_lothar_plain_far`、`art_bg_lothar_plain_mid`、`art_bg_lothar_plain_clouds`（天幕不分方位；北面荒原方向的灰天由区域天光调色表现）；地图插画 `art_map_edgestone_area` |
| 优先级与里程碑 | P0；M1（第一张扩建图） |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `plaza`、`plaza_well` | 边石广场与广场井 | 中 | 复苏点、告示、审判台 | 图 |
| `edgestone_stone` | 边石 | 广场正中 | 门纹回扣（第一幕末月光下亮一瞬） | 标 |
| `guild` | 冒险者公会边石分部 | 广场东北 | 登记、委托板、档案室 | 无 |
| `chapel` | 小礼拜堂与钟楼 | 广场北侧正中 | 圣灯"光之鉴"、避难所 | 标 |
| `drunk_moon` | 醉月亭 | 广场西南 | 客房、地窖（`dg_moon_cellar`） | 无 |
| `merchant_branch` | 梅尔卡托商会边石分号 | 广场东 | 盐与药、梅尔卡神龛 | 无 |
| `north_spring` | 北泉 | 北区栅内 | 澱病源头 | 标 |
| `orphanage` | 圣灯孤儿院 | 北区，贴北泉 | 门纹孩子 | 无 |
| `magistrate` | 代官宅邸与税务所 | 东北 | 双账本、拘留室 | 无 |
| `salt_market` | 盐巷集市 | 东南 | 集日、失窃案 | 无 |
| `smithy` | 巴尔加铁匠铺 | 东 | 秘密订单 | 无 |
| `dice_house` | 骰子屋 | 盐巷尽头 | 独眼团耳目 | 无 |
| `guard_post`、`north_gate` | 卫队哨所与荒原门 | 北门 | 兽潮防线 | 无 |
| `south_gate`、`post_station`、`post_yard` | 王道门、驿站与马厩院 | 南门外 | 伯爵来信、驿马、坐骑寄存 | 无 |
| `east_gate` | 东门（东栅的门） | 东侧 | 兽潮东栅防线、东坡入栅 | 无 |
| `east_slope`、`herb_hut` | 东坡与欧拉的药草小屋 | 东门外 | 林地之争、借形之门 | 标 |
| `lumberyard` | 伐木场 | 东北溪边 | 林地之争 | 无 |
| `graveyard`、`gravekeeper_hut` | 墓地与守墓人小屋 | 西南小坡 | 米洛的坟、夜里的坟火 | 标 |
| `mill`、`washing_creek`、`west_field` | 奥托磨坊、洗衣溪、西田 | 西 | 遗产纷争、传闻、加税 | 无 |
| `miners_shack` | 矿工棚路口 | 西北镇外 | 矿工上工的集合点 | 无 |
| `town_hall` | 镇公所 | 广场东北，代官宅邸前厅（第三幕抵领后改作镇公所，城建 `bld_hall` 的落点） | 立国（`cut_a4_founding`）；领地议事 | 无 |
| `lord_house` | 领主宅 | 广场西北 | 玩家在国都的住处（第四幕起） | 无 |
| `refugee_chapel` | 难民礼拜堂 | 南门外驿站东侧（第四幕起的木棚礼拜堂） | 难民收容；诸神的版本与光的诏书的落点 | 无 |
| `tavi_camp` | 门民营地 | 东坡外 | 塔维与执钥人的帐篷（第四幕起） | 无 |
| `dian_post` | 澱哨台 | 北门内哨所旁（城建 `bld_sed_watch`） | 读数盘与预警（`cut_a5_eska`） | 无 |

### A2 `borderstone_north` 镇北与界石线（North of Edgestone and the Boundary Line）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，野外 |
| 幕与区域 | 第一到第五幕；`edgestone_area`；`ash_border` |
| 尺寸 | 128×96 |
| 风格包 | `wild_forest`；界石线以北的地面以 `looks` 用 `ash_waste` 的灰地色阶抖动过渡（不换包） |
| 澱度 | 二，存储 2，渲染 2；界石线以南局部一 |
| 等级带 | 第一幕 3 到 8；第二幕起北坡 10 到 14 |
| 地形与布局 | 南缘是边石镇北门外的缓坡与镇北小路；中段一排界石自西向东横贯全图（5 根刻字石柱，相隔约 25 格），线南是枯草与铁杉幼林，线北灰化；北缘中段是残阶坡，坡顶通封门遗迹；西北是锈岭的红褐丘岭，锈岭矿口骑在界石线上，矿口南侧有矿工工棚；东北角灰溪自荒原流出，灰路沿溪逆流而上；线南洼地是祛灰草洼 |
| 出入口与路线 | 南 `to_borderstone`（镇北小路，3 公里，本文落定的路线 `borderstone_north_trail`）；西南 `to_borderstone_w`（西北矿道，`borderstone_north_road`）；北 `to_seal_ruins`（残阶坡，3 公里；图集 `borderstone_seal_ruins` 的起点调整为本图）；西北 `to_rustridge_mine`（`rustridge_mine_mouth`）；东北 `to_brokenspan_post`（灰路，`ash_road_upstream`，12 公里） |
| 动线与镜头 | T-F；南入北出；入口路灯两盏（回镇方向是亮的）；营地是矿工工棚（入口西北 9 米）；第一个警戒圈离入口不少于 8 米 |
| 驻留 NPC | 锈岭矿工模板 2 到 3 人（跨图日程：`borderstone:miners_shack` 到本图 `mine_camp`，6 到 17 点）；`ron`（第一幕第 2 到 3 周的矿道委托在矿口集合） |
| 魔物分布 | 第一幕：`field_hare` Lv1 到 3（中立，南缓坡）；`forest_boar` Lv3 到 6（线南灌丛）；`dian_boar` Lv3 到 6（界石线一带）；`dian_rat` Lv1 到 3（矿口外）；`ashhorn_deer` Lv6 到 8（线北，成群 4）；`wandering_bones` Lv6 到 8（夜间越过界石线，北半）；异名者 `three_toes` 三趾（线北深处，离入口 40 米以外）。第二幕起追加：`northern_elk` Lv10 到 14（锈岭北坡）、`rust_beetle` Lv7 到 11（矿口废巷）、`greyroad_smuggler` Lv6 到 12（灰路，可交涉） |
| 采集点 | `node_lotha_rustridge_iron`（锈岭铁脉，T1，矿口南坡）；`node_lotha_greybane_hollow`（祛灰草洼，T2，第一幕末）；`node_lotha_rim_nest`（清理过的澱巢残迹，线北） |
| 照明与夜间 | 镇北小路南段路灯 2；矿工工棚火盆 1；矿口矿灯 2（`mine_lamp`）；界石线以北全黑 |
| 装饰与外观层 | 立石 5（界石）；岔口路牌 2（北往遗迹、西北往矿、东北往灰路）；工棚木箱 2、矿车 1、推车 1；残阶坡脚圣教禁行告示牌 1；合计 13 |
| 任务挂点 | 史料 S01（界石拓印）；一夜矿道（在矿口集合，罗恩线）；税与匪的灰路走私；兽潮之夜澱流的来路（越过界石线扑向北门）；第三幕领地矿业 |
| 美术素材 | 地面：`art_tile_wild_forest_grey_transition`（线北灰化抖动）、`art_tile_wild_forest_slag_slope`；建筑：`art_bld_forge_deep_shack`、`art_bld_forge_deep_mouth_frame`（与 A5 共用）；道具：`art_prop_boundary_stone`（刻字石柱，字不可读）、`art_prop_church_warning_board`、`art_prop_mine_cart`；远景：`art_bg_wild_forest_far`、`art_bg_wild_forest_mid`、`art_bg_wild_forest_clouds` |
| 优先级与里程碑 | P0；M1（第一张新建图） |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `gate_borderstone` | 镇北小路口 | 南缘 | 到达点 | 图 |
| `gate_borderstone_w` | 西北矿道口 | 西南缘 | 从边石镇西口来的到达点 | 无 |
| `north_trail` | 镇北小路 | 南北中轴 | 第一幕往返的主路 | 无 |
| `boundary_stones` | 界石线 | 中段东西一线 | 史料 S01 | 标 |
| `mine_camp` | 矿工工棚 | 西北，矿口南侧 | 营地、委托集合 | 标 |
| `rustridge_mouth` | 锈岭矿口 | 西北 | 进 A5 | 无 |
| `greybane_hollow` | 祛灰草洼 | 中南洼地 | 祛灰草 | 标 |
| `ash_road_head` | 灰路起点 | 东北 | 往折桥驿 | 无 |
| `stair_slope` | 残阶坡顶 | 北缘中段 | 远望封门遗迹与荒原 | 望 |
| `old_hunting_blind` | 废猎棚 | 西北林中 | 978 年调查队的落脚处（`expedition_badge` 一枚） | 秘 |
| `winter_camp` | 联军冬营 | 界石线以南的缓坡 | 第五幕冬营（`cut_a5_eska`） | 无 |
| `imperial_camp` | 帝国军营的野战祭坛 | 冬营东侧的帝国营区 | 瓦尔妲的坦白（`cut_a5_confession`） | 无 |

### A3 `seal_ruins` 封门遗迹（外庭、中殿）（Sealed Gate Ruins: Outer Court and Nave）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_seal_ruins` 的地上部分） |
| 幕与区域 | 第一到第五幕（第三幕回访，第五幕后方·边石）；`ashen_waste`；`ash_rim` |
| 尺寸 | 36×28 到 64×48（平移 (14, 8)：神纹大厅与回廊居中；南加外庭柱廊与六神纹门楣，东西加两翼回廊，北加落灰阶顶前室） |
| 风格包 | `sealed_ruins`（显式；区域默认是 `ash_waste`）；外庭露天部分以 `looks` 用灰草地与灰地 |
| 澱度 | 二，存储 2，渲染 2；回廊与落灰阶局部三 |
| 等级带 | 第一幕 1 到 4；第三幕起回廊躁动层 10 到 14；第五幕外庭 50 到 56（灰潮支流） |
| 地形与布局 | 外庭（地上，露天）：倒塌柱廊、半埋拱门、六神纹门楣（正门只剩一副巨大石门框）、圣教禁碑；门厅（有顶）：从外看被落石堵死，第 3 周从内侧清开；神纹大厅（圆形，六龛位，地面一圈古庭语铭文，苏醒点在第六神纹下）；回廊（绕大厅一周，墙上满是门形浮雕，东、西、南三段成环）；落灰阶顶（东，下通深处）；巢井井口在外庭西北的草地（来自深处的单向出口）。`indoor` 为假：外庭有昼夜，大厅与回廊在玩家入内时掀顶 |
| 出入口与路线 | 南 `to_borderstone_north`（正门，残阶坡；开关格：门厅落石在 `a1_ruins_gate_cleared` 之前为岩石）；东 `to_depths`（落灰阶，`seal_ruins_stairs`）；来自深处的 `seal_ruins_shaft`（单向，落在外庭西北井口）；门址 `sigil_hall`（行路之门初阶地钥、进阶门址） |
| 动线与镜头 | T-D；首访从中心出发，苏醒点两侧一对火盆照亮第一屏，东门内与阶顶的火盆连成一线指向落灰阶；回访从南入，外庭到门厅到大厅北上 |
| 驻留 NPC | 无常驻；第三幕 A3-S14 海德薇与门徒会夜叩封门（剧情首领）；第四幕立国时各群体代表在外庭垒界石 |
| 魔物分布 | 第一幕：`dian_dreg` Lv1 到 2（西、东、南回廊）、`dian_rat` Lv1 到 3（西南、东南回廊）；外环两组并入西、东回廊（第 12 节第 2 条）。第三幕（`act.3.entered` 且 `seal_unrest` 高于阈值）：`glyph_shade` Lv10 到 13（浮雕墙）、`ash_page_swarm` Lv12 到 14、`dian_spirit` Lv11 到 13。第五幕后方·边石：`ashtide_vanguard` Lv50 到 56（外庭，战线结算触发） |
| 采集点 | 外庭门槛的门址尘点（`mat_gate_dust`，第二幕末阿什信任后）：请采集目录登记为 `node_waste_first_gate`（第 13.3 节）；`node_lotha_rim_nest`（清理过的澱巢处） |
| 迷宫结构 | 层：地上一层。区：外庭、门厅、神纹大厅、西回廊、东回廊、南回廊、阶顶前室。核：封印本身（在 A4 灰烬室后壁，核即封印，不可毁）。机关：门厅落石（开关格）；回访期 `seepTiles`（阶顶与回廊的灰每分钟加厚，站久叠澱染）；大厅地面铭文在门纹出现后可读一行（剧情） |
| 照明与夜间 | 火盆 4（苏醒点两侧、东门内、阶顶）；外庭禁碑旁路灯 1（回镇方向） |
| 装饰与外观层 | 火盆 4、路灯 1、立石 1（禁碑）、路牌 1、门框 1（六神纹门楣）、地面记号 1（门厅内侧的绳结与断矛）；合计 9 |
| 任务挂点 | 第一幕开场（`wake_point`）、初门·醒（回廊首战后）、M7 渗泉调查起点、第 3 周清开落石；第三幕回访阿什、A3-S14；第四幕立国的界石垒（外庭南沿）；第五幕后方·边石 |
| 美术素材 | 地面：`art_tile_sealed_ruins_ritual_ring`（古庭语铭文圆环）、`art_tile_sealed_ruins_ash_drift`；建筑：`art_bld_sealed_ruins_round_hall`（六龛位圆厅）、`art_bld_sealed_ruins_relief_wall`（门形浮雕墙）、`art_bld_sealed_ruins_colonnade`（倒塌柱廊）；道具：`art_prop_six_sigil_lintel`（六神纹：光轮、断剑、硬币、枝叶、书卷、被凿空的门形）、`art_prop_forbid_stele`、`art_prop_rubble_heap`、`art_prop_rope_knot_spear`；远景：`art_bg_ash_waste_far`、`art_bg_ash_waste_mid`、`art_bg_ash_waste_clouds`（外庭露天段；`sealed_ruins` 没有天幕，按区域风格包） |
| 优先级与里程碑 | P0；M1 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `wake_point` | 苏醒点（第六神纹下） | 大厅北 | 第一幕入口 | 图 |
| `sigil_hall` | 神纹大厅 | 中 | 初门·醒、门址 | 标 |
| `corridor` | 回廊 | 环绕大厅 | 战斗教学 | 无 |
| `ash_stairs` | 落灰阶 | 东 | 往深处 | 无 |
| `outer_ring` | 外庭与柱廊 | 南 | 正门、界石垒 | 标 |
| `six_sigil_lintel` | 六神纹门楣 | 外庭正门 | 谜团回扣 | 标 |
| `forbid_stele` | 圣教禁碑 | 外庭南 | 禁令 | 无 |
| `gate_hall` | 门厅 | 外庭与大厅之间 | 落石、绳结与断矛 | 秘 |
| `shaft_top` | 巢井井口 | 外庭西北 | 来自深处的出口 | 无 |

### A4 `seal_ruins_depths` 封门遗迹深处（回廊、鸦巢、灰烬之厅）（Sealed Gate Ruins: Depths）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_seal_ruins` 的地下部分） |
| 幕与区域 | 第一到第五幕；第六幕新神或门之复辟路线强行破封时的灰烬之厅；`ashen_waste`；`ash_rim` |
| 尺寸 | 30×24 到 48×40（平移 (9, 8)：阶底与灰烬室居中；东侧巢井下段加宽为首领前平台，南加渗泉暗渠全段） |
| 风格包 | `sealed_ruins`（显式） |
| 澱度 | 三，存储 3，渲染 4 |
| 等级带 | 第一幕 1 到 5（首领 `guardian_raven` 5），首领后暗渠 11 到 13；第三幕回访 10 到 14；第六幕剧情首领守门人阿什按 60（D-060） |
| 地形与布局 | 落灰阶底（西北，入口平台）；阶底东侧一条死胡同（尽头是 978 年调查队阵亡者的遗物）；灰烬室（中，两门，西进东出，灰积到膝，正中阿什坐在灰里，封印之门在北墙正中，门上缠五道光的锁链）；巢井下段（东，首领前平台）；石桥；鸦巢（北，骨头、黑羽与闪亮小物编成的巨巢）；巢井顶（东北，出口）；隐：渗泉暗渠（巢井下段往南，灰色的水向南流） |
| 出入口与路线 | 西北 `to_ruins`（回落灰阶）；东北 `to_shaft_top`（巢井顶，`seal_ruins_shaft`，需 `boss.guardian_raven.defeated`） |
| 动线与镜头 | T-D；阶底到灰烬室 16 米、到鸦巢 16 米、到巢井顶 6 米；首次接触离阶底不少于 8 米 |
| 驻留 NPC | 守门人阿什（`data/combat/fixtures.json` 的固定存在，灰烬室中央）；夜羽（首领战后结契） |
| 魔物分布 | 第一幕：`dian_rat` Lv1 到 3（阶底以南 9 米外）；`raven_flock` Lv3 到 5（巢井顶 3 组，首领后由夜羽安抚，`pacifiedBy`）；`guardian_raven` Lv5（鸦巢，首领）；`dian_spirit` Lv11 到 13（渗泉暗渠，首领后）。第三幕：`glyph_shade` Lv10 到 13、`ash_page_swarm` Lv12 到 14；活性期 `ash_scroll_drift` 灰页之卷 Lv14 占据巢井（不杀的解法：三处风口挂湿布） |
| 采集点 | 无 |
| 迷宫结构 | 层：地下一层（阶底、灰烬室）、地下二层（巢井与鸦巢）、隐（渗泉暗渠）。区：阶底平台、死胡同、灰烬室、巢井下段、石桥、鸦巢、巢井顶、暗渠。核：封印之门（五道封纹，玩家不能通过）。机关：巢井顶出口首领后开放；暗渠首领后出现澱灵；回访期 `seepTiles`；灰页群可用网、罐或鸦群收拢而不烧毁 |
| 照明与夜间 | 火盆 4（阶底、灰烬室西门外、桥头一对）；灰烬室不点火（只有阿什眼窝里的冷光）；巢井顶漏一线天光 |
| 装饰与外观层 | 火盆 4、木箱 1（死胡同尽头的调查队遗物）、骨堆 2、焦页散落（地面记号）2；合计 9 |
| 任务挂点 | 第一幕首日：阿什的一瞥（写定场景）、守护巨鸦首领战与契约之门、M7 渗泉暗渠调查终点；第三幕回访阿什（讲述的前置）与净渗；第六幕两条路线的灰烬之厅首领战 |
| 美术素材 | 地面：`art_tile_sealed_ruins_knee_ash`（积到膝的灰）、`art_tile_sealed_ruins_grey_seep`（暗渠灰水）；建筑：`art_bld_sealed_ruins_seal_door`（巨门与五道光的锁链，门形神纹）、`art_bld_sealed_ruins_shaft_wall`；道具：`art_prop_ash_skeleton_seated`（阿什的坐姿骸骨，眼窝冷光）、`art_prop_burnt_pages`、`art_prop_raven_great_nest`、`art_prop_stone_bridge_short`；远景无 |
| 优先级与里程碑 | P0；M1 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `gate_seal_ruins` | 落灰阶底 | 西北 | 入口平台 | 图 |
| `ash_chamber` | 灰烬室 | 中 | 阿什 | 标 |
| `sealed_door` | 封印之门 | 灰烬室北墙 | 核 | 无 |
| `dead_end_cache` | 死胡同尽头 | 阶底东 | 调查队遗物（`expedition_badge` 一枚） | 秘 |
| `nest_shaft`、`raven_nest` | 巢井与鸦巢 | 东、北 | 首领战 | 无 |
| `seep_channel` | 渗泉暗渠 | 南 | 澱病源头 | 秘 |

### A5 `rustridge_mine` 锈岭矿（Rustridge Mine）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_old_mine` 边石旧矿；下层往下是 A5-1 锈岭矿深层） |
| 幕与区域 | 第一到第五幕（第三幕起归领地，按养毁净改变）；`edgestone_area`；`ash_border` |
| 尺寸 | 64×64 |
| 风格包 | `forge_deep`（本文落定） |
| 澱度 | 二，存储 2，渲染 2；下层晶脉局部三 |
| 等级带 | 6 到 12（首领 `crystal_mother` 9，精英 `grayroad_foreman` 11）；第二幕起废巷 7 到 13 |
| 地形与布局 | 上层坑道：矿口前室（入口平台，北）进 T 形主巷，东西两条废巷；主巷南端是塌方口（"一夜打通"的门槛）；下层：晶脉洞（晶簇照出淡紫的光）、走私营地（下层东侧，独眼团暗采澱晶的帐篷与灰晶箱）、晶背之母的巢（下层最深处，西南）；巢的南墙有罗恩说的"空心石"裂缝，第三幕往下通锈岭矿深层。入口在北是因为矿口骑在界石线上、玩家从南边的 A2 往北走进来，进矿后路线向南推进，镜头为此提供"俯视"预设并在主巷各岔口立矿灯 |
| 出入口与路线 | 北 `to_borderstone_north`（矿口，`rustridge_mine_mouth`）；南（第三幕）`to_rustridge_deep`（空心石裂缝，本文落定的路线 `rustridge_deep_rift`） |
| 动线与镜头 | T-D；矿口前室到塌方口 34 米；塌方口到晶脉 12 米、到巢 26 米；首领后捷径：巢西侧的旧通风竖井直上矿口前室（开关格，`boss.crystal_mother.defeated`） |
| 驻留 NPC | `ron`（同行）；夜羽（从裂缝侦察）；第三幕"养"之后领地矿工模板 4 人 |
| 魔物分布 | 第一幕：`dian_rat` Lv1 到 3（前室外主巷）；`burrow_worm` Lv5 到 8（上层废巷）；`vein_grub` Lv6 到 9（晶脉）；`oneeye_bandit` Lv4 到 8（走私营地）；`grayroad_foreman` Lv11（营地，`yieldAtPct` 0.3 交出运货单）；`crystal_mother` Lv9（巢，首领）。第二幕起：`rust_beetle` Lv7 到 11（废巷）、异名者 `ironbelly` 铁胃（东废巷尽头）、巢主 `rust_matron` 锈母 Lv13（西废巷尽头的废矿棚）。第三幕回访活性词条"连塌" |
| 采集点 | `node_lotha_oldmine_copper`（边石旧矿铜脉，T1，晶脉洞北壁） |
| 迷宫结构 | 层：上层、下层。区：矿口前室、上层主巷、东废巷、西废巷、塌方口、晶脉洞、走私营地、巢。核：浅迷宫不出核（"毁"时得中晶 1，下层塌死、通深层的旧路封死）。机关：塌方口开关格（`a1_mine_cleared`，一夜打通）；二次塌方（罗恩指挥，识才之门的场景）；首领后通风竖井捷径；第三幕活性词条"连塌" |
| 照明与夜间 | 室内固定光；矿灯 7（前室 2、主巷岔口 3、塌方口 1、走私营地 1）；晶脉洞靠晶簇自发光，巢前一对火盆 |
| 装饰与外观层 | 矿灯 7、矿车 2、木梯 1、塌方堆 2（开关格两侧）、灰晶箱 3、帐篷 2；合计 17（迷宫上限 12 的例外：矿道分两层，按每层 12 计） |
| 任务挂点 | 第一幕第 2 到 3 周矿道委托（前置），第 4 周 M6 一夜矿道（委托板，罗恩）；莫斯走私的证据（运货单接 `dian_crystal.evidence`）；刃之门（晶背之母甲壳）；渊契之门的物钥候选（下层大澱晶）；识才之门（罗恩在二次塌方里的指挥）；第三幕领地矿业的养毁净 |
| 美术素材 | 地面：`art_tile_forge_deep_crystal_vein_floor`；建筑：`art_bld_forge_deep_timber_support`（支护梁）、`art_bld_forge_deep_vent_shaft`；道具：`art_prop_crystal_mother_nest`（晶簇巢）、`art_prop_smuggler_tent`、`art_prop_greycrystal_crate`、`art_prop_collapse_heap`、`art_prop_mine_lamp`、`art_prop_hollow_stone_rift`（空心石裂缝）；远景无 |
| 优先级与里程碑 | P0；M1 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `mine_antechamber` | 矿口前室 | 北 | 入口平台 | 图 |
| `upper_gallery` | 上层主巷 | 中北 | 主路 | 无 |
| `collapse_mouth` | 塌方口 | 中 | 一夜打通 | 标 |
| `crystal_vein` | 下层晶脉洞 | 中南 | 澱晶、铜脉 | 标 |
| `smuggler_camp` | 走私营地 | 下层东 | 证据、工头 | 标 |
| `mother_nest` | 晶背之母的巢 | 下层西南 | 首领 | 无 |
| `hollow_rift` | 空心石裂缝 | 巢南墙 | 第三幕通深层 | 秘（三） |

### A6 `forest_edge` 铁杉林林缘（Ironhemlock Forest Edge）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，野外 |
| 幕与区域 | 第一到第五幕；`edgestone_area`；`ash_border` |
| 尺寸 | 48×32 到 112×80（平移 (0, 24)：入口仍在西缘；北加老林深处纵深，东加蛛谷、狼穴与鹿泉东延到通往深处的猎径口，南加南路哨与伐区） |
| 风格包 | `wild_forest`（显式；区域默认是 `lothar_plain`） |
| 澱度 | 一，存储 1，渲染 1；老林深处局部二 |
| 等级带 | 第一幕 2 到 10（稀有 `black_ridge` 移到 A7）；第二幕起北缘 6 到 10 |
| 地形与布局 | 西缘入口（东门外林缘路）；入口东 7 米是猎人营地；约树（百年老橡，树干上刻着人族与兽人猎户的林约）是第一屏的地标；猎径在约树东南分岔：东支经鹿泉到狼穴，南支到南路哨（独眼团的瞭望台）；北面是老林深处，东北是蛛谷；东缘猎径继续进铁杉林深处；伐区在西南，每周向林内推进（林地之争的结局改变伐区边界，以 `looks` 换地块） |
| 出入口与路线 | 西 `to_borderstone`（`borderstone_forest_edge`）；东 `to_ironhemlock_deep`（猎径，`forest_edge_deep`，魔物季前后开放） |
| 动线与镜头 | T-F；入口到营地 7 米，营地火盆第一屏可见；入口到约树 18 米、鹿泉 39 米、狼穴 53 米 |
| 驻留 NPC | `gorn`、`shiya`、`boro`（猎户，跨图日程 5 到 11 点在 `hunter_camp`）；`gaspar`、`nick`（伐木工，白天在伐区）；`oola`（采药，隔日清晨在鹿泉） |
| 魔物分布 | 第一幕：`greyelm_deer` Lv3 到 7（中立会逃，鹿泉）；`grey_wolf` Lv2 到 4（猎径与狼穴）；`dian_boar` Lv3 到 6（伐区，南移见第 12 节第 4 条）；`forest_boar` Lv3 到 6（南路哨外）；`edge_spider` Lv3 到 6（蛛谷）；`dian_wolf` Lv5 到 8（老林深处，北移见第 12 节第 4 条）；`oneeye_bandit` Lv4 到 8（南路哨）；异名者 `split_ear` 裂耳 Lv6（狼穴）。第二幕起：`ashhorn_deer` Lv6 到 10（北缘） |
| 采集点 | `node_lotha_ironhemlock`（铁杉林，T1，伐区与林缘） |
| 照明与夜间 | 入口路灯 1、营地火盆 1、南路哨匪徒营火 1；猎径整段是黑的 |
| 装饰与外观层 | 现有 12 件按平移移植；增地标树 1（约树，`landmark_tree`）、伐区界桩 2、鹿泉石 1；合计 16 |
| 任务挂点 | 第一幕 M6"灰色的狼"、林地之争（约树林约、伐区）、猎之门（与希雅同猎、裂耳獠牙、约树）、魔物增多、税与匪（南路哨）；兽伴来源（鹿泉小鹿） |
| 美术素材 | 建筑：`art_bld_wild_forest_bandit_lookout`（木栅瞭望台）、`art_bld_wild_forest_hunter_lean_to`；道具：`art_prop_pact_oak`（约树，树干刻痕）、`art_prop_spider_web_large`、`art_prop_wolf_den_rock`、`art_prop_log_pile`、`art_prop_stump_field`；远景：`art_bg_wild_forest_far`、`art_bg_wild_forest_mid`、`art_bg_wild_forest_clouds` |
| 优先级与里程碑 | P0；M1 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `gate_borderstone` | 林缘路口 | 西缘 | 到达点 | 图 |
| `hunter_camp` | 猎人营地 | 入口东 7 米 | 安全点 | 无 |
| `pact_oak` | 约树 | 营地东 | 林约刻痕 | 标 |
| `deer_spring` | 鹿泉 | 中东 | 兽伴来源 | 标 |
| `wolf_den` | 狼穴 | 东 | 裂耳 | 标 |
| `spider_vale` | 蛛谷 | 东北 | 灰丝 | 标 |
| `deep_woods` | 老林深处 | 北 | 澱狼 | 无 |
| `logging_site` | 伐区 | 西南 | 林地之争 | 无 |
| `bandit_lookout` | 南路哨 | 南 | 独眼团 | 无 |

### A7 `ironhemlock_deep` 铁杉林深处（Ironhemlock Deep）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，野外 |
| 幕与区域 | 第一到第五幕；`edgestone_area`；`ash_border` |
| 尺寸 | 128×128 |
| 风格包 | `wild_forest`（显式） |
| 澱度 | 二，存储 2，渲染 2；磷光林积澱斑局部三 |
| 等级带 | 第一幕 8 到 13（魔物季起）；第二幕起北缘 10 到 14 |
| 地形与布局 | 西南入口（猎径）；入口北 8 米是猎户的旧营地（营地）；林分三层：外林（铁杉熊与林猪的地盘）、中林（磷光林，积澱斑上长着发光的菌，魔物季时澱狼在这里聚群）、深林（东北，魔物巢：一片被翻倒的树根与兽骨围成的空地，兽潮第一波的源头）；北缘贴着界石线以北的灰烬林，石化树墙不可通行；东南缘远处可见旧巡逻道（远景，不连通） |
| 出入口与路线 | 西南 `to_forest_edge`（`forest_edge_deep`） |
| 动线与镜头 | T-F；入口到旧营地 8 米；魔物巢离入口约 90 米，是第一幕最远的野外点 |
| 驻留 NPC | 无常驻；`shiya` 在猎之门的"同猎"任务中同行 |
| 魔物分布 | 第一幕（魔物季旗标起）：`greyelm_deer` Lv3 到 7（中立，外林）；`ironpine_bear` Lv8 到 12（外林）；`dian_wolf` Lv8 到 12（磷光林，成群 3 到 4）；`ashhorn_deer` Lv8 到 10（北缘）；`dian_boar` Lv6 到 8（外林）；异名者 `black_ridge` 黑脊 Lv11（深林，离入口 60 米以外）。魔物巢在兽潮前一周空掉（第一幕 8.1 的前兆"林子空了"）。第二幕起：`northern_elk` Lv10 到 14（北缘） |
| 采集点 | `node_lotha_glowcap_grove`（磷光林，T2）；`node_lotha_amber_bank`（北境琥珀坡，T2，北缘，第二幕起） |
| 照明与夜间 | 旧营地火盆 1；磷光林的菌夜里发淡紫光（澱的冷光，保留语义色，不照路） |
| 装饰与外观层 | 火盆 1、旧营木箱 2、兽骨堆 3、倒木 3、路牌 1（入口岔口）；合计 10 |
| 任务挂点 | 第一幕魔物季事件；兽潮前兆调查（第一幕 8.1）；猎之门同猎；黑脊的异名者事迹；第二幕琥珀与驼鹿委托 |
| 美术素材 | 地面：`art_tile_wild_forest_glowcap_patch`（积澱斑与发光菌）；道具：`art_prop_beast_nest_roots`（魔物巢）、`art_prop_fallen_log_large`、`art_prop_bone_pile`、`art_prop_bear_den`；远景：`art_bg_wild_forest_far`、`art_bg_wild_forest_mid`、`art_bg_wild_forest_clouds` |
| 优先级与里程碑 | P1；M1 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `gate_forest_edge` | 猎径口 | 西南 | 到达点 | 图 |
| `old_hunter_camp` | 旧营地 | 入口北 | 安全点 | 标 |
| `glowcap_grove` | 磷光林 | 中 | 积澱斑 | 标 |
| `beast_nest` | 魔物巢 | 东北深林 | 兽潮源头 | 标 |
| `north_crag` | 北缘岩台 | 北 | 远望灰烬林与荒原 | 望 |
| `bear_den` | 熊洞 | 西北 | 冬眠的铁杉熊，林约的另一半刻痕 | 秘 |

### A8 `brokenspan_post` 灰溪上游与折桥驿（Upper Greybrook and Brokenspan Post）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，野外 |
| 幕与区域 | 第一到第五幕；`ashen_waste`；`ash_rim` |
| 尺寸 | 128×96 |
| 风格包 | `ash_waste`（区域默认） |
| 澱度 | 二，存储 2，渲染 2 |
| 等级带 | 第一幕 4 到 12；第二幕 8 到 16 |
| 地形与布局 | 西南入口（灰路自 A2 东北角而来）；灰溪自北向南流过全图中线，东岸是灰泥滩；中段的旧石桥断成两截，断口架着绳桥；折桥驿在西岸高地：一座被木栅围起的旧驿站，石砌马厩改作仓库，木瞭望台望得见晶沟方向；北缘灰路继续往西北通晶沟 |
| 出入口与路线 | 西南 `to_borderstone_north`（`ash_road_upstream`，12 公里）；北 `to_ash_waste`（灰路往晶沟，`brokenspan_crystal_gully`，5 公里） |
| 动线与镜头 | T-F；入口到灰溪岸的拾荒者营火 9 米；驿站在入口东北 40 米，正门朝南面向灰路 |
| 驻留 NPC | 第一幕：`seg_oneeye`（独眼团首领，平时坐镇驿站；对手战在旧哨村哨塔）、`knut_naumann`（锻兵）；`kas_ropebridge`（绳桥）；`herbert_crystaltooth`（掘脉，黑市）；`gottlieb_surgeon`（外科与灰百合）；`jutta_scavenger`（旧物）；`polly_mutebell`（骡队）。第二幕起：`kamilla_greyglove`（灰路新主，刀手模板 2）；独眼团收编时驿站变为领地的驿点 |
| 魔物分布 | 第一幕：`oneeye_bandit` Lv4 到 8（驿外哨，按纷争结局撤走）；`greyroad_smuggler` Lv6 到 12（灰路）；`waste_jackal` Lv8 到 12（灰路两侧）；`greybrook_crayfish` Lv8 到 12（灰溪）；`bone_vulture` Lv10 到 16（中立，上空）；`wandering_bones` Lv6 到 9（夜）；异名者 `toll_taker` 收路钱的（灰路断里程碑旁）。第二幕起：`greyshard_fence` Lv14 到 20（驿站交货点） |
| 采集点 | `node_waste_greybrook_upper`（灰溪上游，T2，第二幕）；`node_waste_ashmud_flats`（灰泥滩，T1，第二幕） |
| 照明与夜间 | 驿站门灯与瞭望台火盆（第一幕是敌营的光，收编后是驿站的灯）；拾荒者营火 1；灰路两端只立路牌不点灯 |
| 装饰与外观层 | 火盆 2、营火 1、路牌 2、木箱 3、绳桥两端桩 2、断里程碑 1（立石变体）；合计 11 |
| 任务挂点 | 第一幕税与匪（独眼团老巢，谈判、驱逐、收编）；灰路走私线；骡队与绳桥（交通）；第二幕灰路新主与灰晶黑商 |
| 美术素材 | 地面：`art_tile_ash_waste_greymud_flat`、`art_tile_ash_waste_brook_bank`；建筑：`art_bld_ash_waste_post_station_palisade`（木栅驿站）、`art_bld_ash_waste_stone_stable`；道具：`art_prop_broken_bridge`（断成两截的石桥）、`art_prop_rope_bridge`、`art_prop_watchtower_wood`、`art_prop_milestone_broken`；远景：`art_bg_ash_waste_far`、`art_bg_ash_waste_mid`、`art_bg_ash_waste_clouds` |
| 优先级与里程碑 | P1；M1 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `gate_borderstone_north` | 灰路口 | 西南 | 到达点 | 图 |
| `scavenger_fire` | 拾荒者营火 | 入口北 | 安全点 | 无 |
| `broken_bridge` | 断桥与绳桥 | 中 | 过溪 | 标 |
| `brokenspan_post` | 折桥驿 | 西岸高地 | 独眼团老巢 | 标 |
| `post_watchtower` | 驿站瞭望台 | 驿站东北角 | 远望晶沟与荒原 | 望 |
| `smuggler_cellar` | 马厩地下的灰晶窖 | 驿站内 | 走私账本 | 秘 |

### A9 `ash_waste` 荒原外缘（灰烬林、晶沟）（The Ashen Rim）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，野外（覆盖地理志 A9 与 B9） |
| 幕与区域 | 第一到第五幕（第一幕南段，第二幕全段，第三幕起是去中层的出发点）；`ashen_waste`；`ash_rim` |
| 尺寸 | 48×40 到 128×112（平移 (40, 72)：现有网格落在新图南部中段，南口不变；北扩到外缘北沿，西扩灰烬林与西部灰村，东扩东部灰村与通骨原的北坡） |
| 风格包 | `ash_waste`（区域默认） |
| 澱度 | 二，存储 2，渲染 2；晶沟与灰烬林灰心局部三 |
| 等级带 | 第一幕 6 到 14（南段）；第二幕 5 到 20（全段）；第三幕东侧 18 到 30；第四幕天启后北段 15 到 40（中层种类外推一层） |
| 地形与布局 | 南口（北小道）进来 7 米是荒原营火；南段：灰沙坡（西南）、枯树林（东南）、碎门坡（中南，一大片断裂的拱石，像无数扇倒下的门，谜团 5 的第一处物证）；西段：灰烬林（石化的死林）与其中的灰心斑块、豺窟；西南角：晶沟（露天澱晶冲沟，掘手的营地），灰路从这里接折桥驿；中段：西部灰村与东部灰村（千门都郊外村落的残迹）；东段：界石线外北坡通骨原；北沿：外缘与中层交界的灰丘，"无路"的起点 |
| 出入口与路线 | 南 `to_old_outpost`（北小道，`old_outpost_ash_waste`，8 公里）；西南 `to_brokenspan_post`（灰路往晶沟，`brokenspan_crystal_gully`）；东 `to_bonefield`（`bonefield_rim`，第三幕）；北 `to_waste_middle`（区域图出口，`rim_to_glass_plain`，第三幕第 13 周） |
| 动线与镜头 | T-F；入口到营火 7 米；第一个警戒圈离入口不少于 8 米；南段的三股势力标记在营火边看得见；北沿的区域图出口只立路牌 |
| 驻留 NPC | 拾荒者与晶沟掘手模板各 3 到 4 人；`jutta_scavenger`（旧物，西部灰村）；`ada_hellinger`（撷草与澱斑医，西部灰村）；`zima_lullaby`（灰村的送魂者）；`joern_greywood`（灰烬林隐居的游侠）；`herbert_crystaltooth`（晶沟）；第三幕 `holger`（中层向导，在营火） |
| 魔物分布 | 第一幕（南段）：`wandering_bones` Lv6 到 9（夜，灰沙坡）；`waste_wraith` Lv8 到 11（碎门坡夜）；`waste_jackal` Lv8 到 14（灰路两侧）；`shard_louse` Lv9 到 13（晶沟）；`gully_digger` Lv8 到 14（中立，纷争中可敌对）；`greyroad_smuggler` Lv6 到 12；`waste_scavenger` Lv5 到 14（中立）；异名者 `old_louse` 晶沟老虱。第二幕（`act.2.entered`）：`ash_shade` Lv12 到 20（只在灰暴中生成）、`ashwood_mantis` Lv12 到 17（灰烬林）、巢主 `jackal_den_matriarch` 豺窟老母 Lv16（豺窟）、`ashfolk` Lv15 到 20（北段零散，夜）、门徒会外缘营地 `disciple_initiate` Lv12 到 18 与 `disciple_undertaker` Lv18 到 24（西段，第二幕门徒会线结束后撤走）。第三幕：`boneplain_skeleton` Lv18 到 26、`bone_hound` Lv20 到 30（东段近骨原）；异名者 `ashstorm_shepherd` 赶灰的（灰暴中）。第四幕天启「荒原之澱满」后：`ashfolk` 群 Lv25 到 34、`dianshard_golem` Lv32 到 40（北段），外缘的野兽与拾荒者消失。第五幕吞澱期出生率乘 0.2；灰潮支流 `ashtide_vanguard` Lv50 到 56 自北沿流向南口 |
| 采集点 | `node_waste_crystal_gully`（晶沟，T1 到 T2）；`node_waste_ash_hamlet`（灰村古铁，T2，第二幕）；`node_waste_ashmud_flats`（灰泥滩，T1，第二幕）；`node_waste_ashwood_heart`（灰烬林灰心，T3，第二幕） |
| 照明与夜间 | 南口路灯 1、营火 1、掘手营地火盆 1；第二幕起两处灰村各一堆拾荒者篝火；北沿与灰烬林全黑；夜里亡灵出没 |
| 装饰与外观层 | 现有 12 件中营火、南口路灯与路牌、木箱、长椅保留；门徒会、圣战军、红牙丘的旗帜与火盆按第 11 节迁走或改作二幕门徒会营地；增倒伏门框 6（碎门坡，`doorframe` 变体 1）、灰村残墙门牌 3、掘手营地木箱 2、路牌 2；合计约 18 |
| 任务挂点 | 第一幕 W4：谜团 5 第一处物证（碎门坡）；走私线（晶沟，代官莫斯的货源）；灰暴迷路事件；第二幕外缘全段开放与门徒会外缘营地；第三幕渊契之门的钥（晶沟深处的大澱晶）与去中层的出发点；第五幕灰潮支流 |
| 美术素材 | 地面：`art_tile_ash_waste_crystal_gully`、`art_tile_ash_waste_petrified_roots`；建筑：`art_bld_ash_waste_hamlet_ruin`（灰村残墙与门牌）、`art_bld_ash_waste_digger_shelter`；道具：`art_prop_fallen_arch_field`（碎门坡的倒伏拱石群）、`art_prop_petrified_tree`、`art_prop_crystal_cluster_small`、`art_prop_great_crystal_gully`（晶沟深处的大澱晶）、`art_prop_jackal_den`；远景：`art_bg_ash_waste_far`、`art_bg_ash_waste_mid`、`art_bg_ash_waste_clouds`（灰暴是天气：天气层压暗画面，云带用本包的灰暴云带） |
| 优先级与里程碑 | P0；M1（全图地形与第一幕刷新组），第二到第四幕刷新组随 M2、M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `gate_old_outpost` | 南口 | 南 | 到达点 | 图 |
| `waste_camp` | 荒原营火 | 南口北 7 米 | 安全点 | 标 |
| `grey_sand_slope` | 灰沙坡 | 西南 | 骸骨夜行 | 无 |
| `dead_grove` | 枯树林 | 东南 | 野外 | 无 |
| `broken_gate_slope` | 碎门坡 | 中南 | 谜团 5 物证 | 标 |
| `crystal_gully` | 晶沟 | 西南角 | 掘手、走私 | 标 |
| `ashwood` | 灰烬林 | 西 | 林螳、灰心 | 标（二） |
| `west_hamlet` | 西部灰村 | 中西 | 拾荒者 | 标（二） |
| `east_hamlet` | 东部灰村 | 中东 | 拾荒者 | 标（二） |
| `jackal_den` | 豺窟 | 灰烬林边 | 巢主 | 秘（二） |
| `rim_crest` | 北沿灰丘 | 北 | 远望中层玻璃原的反光 | 望（二） |
| `great_crystal` | 晶沟深处的大澱晶 | 晶沟最深处 | 渊契之门物钥 | 秘 |

### A10 `old_outpost` 旧巡逻道与旧哨村（Oldwatch）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，枢纽（覆盖地理志 A10 与 B8） |
| 幕与区域 | 第一到第五幕（第一幕废村，第二幕建村，第三幕领地中心）；`edgestone_area`；`ash_border` |
| 尺寸 | 48×40 到 96×80（平移 (24, 20)：小丘与废墟居中；东加灰溪东岸与旧巡逻道东段口，西加旧巡逻道西段与铁杉林南缘，北加通荒原的树林带与通骨原的西北口，南加建设外圈） |
| 风格包 | `lothar_plain`（区域默认） |
| 澱度 | 一，存储 1，渲染 1 |
| 等级带 | 第一幕 4 到 12（独眼团据点与夜间亡卫）；第二幕事件 8 到 16；第三幕起战场在 C1-2 |
| 地形与布局 | 小丘上的废村，丘顶有一眼泉；倒塌的石哨塔（丘顶东北）、石砌粮仓（匪帮的赃物库）、干井、被砸毁的村祠、约二十处房基与残存土墙；东西大路贯穿全图，过灰溪的桥在东段；北小道是一格宽的土路穿过树林带；建设用地扩为八块（核心、村落、东、南、西各一，新增北林边、东岸、丘顶三块小用地）；废墟地标（粮仓、哨塔、干井、村祠）不在任何用地里 |
| 出入口与路线 | 西 `to_borderstone`（旧巡逻道，12 公里）；北 `to_ash_waste`（北小道，8 公里）；西北 `to_bonefield`（界石线外北坡，`old_outpost_bonefield`，6 公里，第三幕第 2 周）；东 `to_patrol_road_east`（区域图出口，`old_patrol_road_east` 到黑橡堡，第三幕第 9 周）；战役入口 `bonefield_battle_call`（第三幕第 2 周夜） |
| 动线与镜头 | T-H（建设后）；西口到村中心 20 米，村中心到北口 22 米；中心格永不建房，是火的位置；哨塔修复后是全村最高点 |
| 驻留 NPC | 第一幕：独眼团（`seg_oneeye`、`vero` 与匪徒，纷争驱动）。第二幕：`werner`（村长，第一位 AI 官员）、`maeve`（遗民）、`rosa_oldwatch`（撷草与医）、`ron`（民兵队长）、`knut_naumann` 与 `seg_oneeye`（收编时）、难民模板。第三幕：`alai_reedpond`、`toya_shaman`（移民村整合时）、`cassian`（若留下）、`oola`（若随行）、`nick`（伐木工迁入） |
| 魔物分布 | 常驻无。第一幕：`oneeye_bandit` Lv4 到 8（据点，纷争解决后撤走）；`oldwatch_sentinel` Lv7 到 9（夜，废村，哨塔修复后 `pacifiedBy`）；异名者 `bell_weeper` 哭钟（暗月半夜）。第二幕：第 3 周夜荒原外缘的试探（`wandering_bones` Lv8 到 9、`waste_jackal` Lv10 到 14，事件波次） |
| 采集点 | `node_lotha_oldwatch_ley`（旧哨村泉眼，T3，第二幕） |
| 照明与夜间 | 村中心一盆火（第一幕匪帮的火，第二幕难民的火，之后是村子的火）；建成的建筑门灯；哨塔修复后塔顶火盆 1；废村时期其余全黑 |
| 装饰与外观层 | 现有 10 件按平移移植；干井与村祠的岩石格换成可走地块加 `dry_well`、`shrine_ruin` 装饰（第 12 节第 11 条）；增路牌 2（西北口、东口）；合计 14 |
| 任务挂点 | 第一幕独眼团据点（税与匪）、瑟格对手战（哨塔，迷宫目录）、废墟巡礼；第二幕建村 V1 到 V6；第三幕领地中心与领主府候选、千军营、骨原夜袭（C1-2）、遗民之屋；第四幕庭外之国的村镇；第五幕后方 |
| 美术素材 | 建筑：`art_bld_lothar_plain_ruined_watchtower`（倒塌与修复两态）、`art_bld_lothar_plain_stone_granary`、`art_bld_lothar_plain_burnt_house_base`；道具：`art_prop_dry_well`、`art_prop_smashed_shrine`、`art_prop_village_center_fire`（三态：匪火、难民火、村火）；远景：`art_bg_lothar_plain_far`、`art_bg_lothar_plain_mid`、`art_bg_lothar_plain_clouds` |
| 优先级与里程碑 | P0；M1（第二幕建设外圈 M2） |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `village_center` | 村中心 | 中 | 火与建设中心 | 图 |
| `ruined_tower` | 石哨塔 | 丘顶东北 | 对手战、修复后远望 | 标 |
| `old_granary` | 石砌粮仓 | 西 | 匪帮赃物库 | 无 |
| `dry_well` | 干井 | 中南 | 废墟巡礼 | 无 |
| `smashed_shrine` | 被砸毁的村祠 | 南 | 废墟巡礼 | 标 |
| `hill_spring` | 丘顶泉眼 | 丘顶 | 灵露 | 标（二） |
| `tower_top` | 修复后的哨塔顶 | 丘顶东北 | 远望荒原外缘与铁杉林 | 望（二） |

## 5. 第二幕：B 系列（瓦伦河谷北段）

### B1 `wallenburg` 瓦伦堡（Valenburg）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，枢纽（覆盖地理志 B1、B2、B3） |
| 幕与区域 | 第二到第五幕（第二幕枢纽，第五幕联盟军议）；`valen_valley`；`wallenburg` |
| 尺寸 | 60×48 到 160×128。现有网格太挤，不做整体平移：按区重排，地点 id 与相对方位保留，坐标约放大 2.5 倍；存档迁移按地点映射（玩家落到原所在地点在新图上的中心） |
| 风格包 | `valen_city`（区域默认） |
| 澱度 | 一，存储 1，渲染 1；泥巷与鱼市排水口局部二（下城地势最低，澱顺水沉到这里） |
| 等级带 | 城内无常驻野外魔物；城下委托 3 到 24（地窖与排水口的小威胁）；城下潮在 B3-1 |
| 地形与布局 | 河边台地上的城，北高南低。北带上城：鹰丘（北面岩丘上的伯爵城堡，6 米塔，城堡旧井通断门厅的封闸）、主教区（白钟大教堂 5.2 米钟楼、慈济院、审判庭分署静室）、贵族宅邸；中带中城：公会街（大区总部与沙环）、秤街（金秤会馆、交易所、梅尔卡神龛）、大市集与市政厅（广场，光之审的刑台）、学塔区（星笔塔与观星台，中城高处）、炉灰街（工匠与矮人作坊）；南带下城与河港：泥巷（贫民区，漏灯酒窖是灰鼠鼠巢，旧水道主入口）、鱼市、铁闸营（西墙）、河港仓库与吊车、门前渡北岸码头；南缘是瓦伦河。主街是东西向的两条街，主要店铺排在主街北侧、门朝南开（第 12 节第 1 条）；神职人员走大教堂北墙的后巷（第 12 节第 10 条）；门前渡是渡船码头，南岸的老船夫小屋在 B5（第 12 节第 6 条） |
| 出入口与路线 | 北门 `to_north_gate`：一个出口两种去处，出门时选择"城外（B4）"或"远行（区域图）"：`wallenburg_north_gate`（步，到 B4）、`borderstone_wallenburg`、`south_road_south`、`northern_march_road`（陆路）、`blank_steles_trail`；泥巷井口 `to_sewers`（`wallenburg_sewers_well`）；门前渡码头 `to_gatefront_south`（`gatefront_ferry`，渡船）；河港码头 `to_river_port`（区域图：`valen_river` 的船行与回程船、`northern_march_road` 的逆流船）；鹰丘旧井 `to_castle_well`（到 B6-1，本文落定的路线 `castle_well_shaft`，第二幕第 13 周后经伯爵许可）；战役入口 `wallenburg_harbor_battle_call` |
| 动线与镜头 | T-H；第二幕到达是北入图：北门外旗帜一对、门内路灯一对、南北街路口一盏灯，第一屏看见大教堂钟楼与前庭；前庭（复苏点）到市集 12 米以内、到公会 25 米以内；城内巡访线全身遮挡目标不超过 10% |
| 驻留 NPC | 城堡：`edric`、`cecilia`、`lucas`（继承之争三家）；主教区：`anselm`、`agnes`、`selene`、`krause`、`dorothea_mercy`、`goetz_thale`、`rupert_eick`；公会：`dirk_schwarz`、`wolfgang_hammer`、`reinhold_breit`、`gregor`、`anja_wald`；勇者团住大教堂：`luchen`、`yui`、`aiden`、`marcus`；秤街：`bruna`、`lars_zentner`、`mina_sevenbell`、`moritz_meier`；学塔：`hildegard`、`julian_weil`、`helene_schreiber`、`emil`；炉灰街：`grinda_hammerseal`、`martin_klinger`、`wiebke_gerber`、`ruya_ropewife`、`sibylle_spindler`、`oskar_brehm`、`benno_herten`、`lilian_stern`；泥巷：`basti_brokentooth`、`dela`、`nelli_coppereye`、`liese`、`fynn`；河港：`paula_zimmer`、`bogdan_bargeman`、`hanno_loeff`；中城：`waltrud_koch`、`ida_lenz`、`karl`、`jonas`；铁闸营：`reynard`（赤鬃佣兵团）；葬仪社：`eugen_stille`；门前渡北岸：`pia` |
| 魔物分布 | 常驻无。城下委托：`chapel_rat` Lv3 到 7（主教区地窖）、`lamp_ooze` Lv6 到 10（灯石街与工坊排水口）、`mud_fiend` Lv20 到 24（泥巷排水口，第二幕后半）；异名者 `pale_bishop` 白主教（大教堂地窖祭坛台阶）。城下潮见 B3-1 |
| 采集点 | `node_lotha_valen_river`（瓦伦河渔场，T1，下城与门前渡） |
| 照明与夜间 | 门灯约 60 盏（自动）；路灯约 40 盏：两条主街北路肩每 10 格一盏、南北街、前庭四角、市集、下街、码头一线、门前渡码头一对、泥巷 3（漏灯酒窖不挂招牌，以西侧一盏灯为记号）；城外方向的北门外只立旗帜不点灯 |
| 装饰与外观层 | 现有 53 件按区移植；增路灯约 20、货摊 4、旗帜 4、长椅 3、吊车 2、渡船 1；合计约 70（枢纽城镇上限 70）。`looks`：公会、星笔塔、金秤会馆、中城酒馆、炉灰街作坊的门在南墙；侧缝立牌只留给保留北门的漏灯酒窖与两处民居 |
| 任务挂点 | 第二幕：觐见与继承之争（鹰丘）、异端审判（主教区与静室，第 6 周）、公会晋升考核（第 2 周）、商会注册（秤街）、门徒会（泥巷与葬仪社）、渡口的老人（门前渡）、星笔塔观星台（第 14 周拉远）、光之审（广场刑台）、劫法场（可选）、城下潮（第 13 周夜）；第三幕回访与北境大道、瓦伦河出发；第四幕门钥线索（旧水道）；第五幕联盟军议（鹰丘大厅）与节点六 |
| 美术素材 | 建筑：`art_bld_valen_city_cathedral_whitebell`（白钟大教堂与钟楼）、`art_bld_valen_city_hawkhill_castle`（岩丘城堡）、`art_bld_valen_city_stylus_tower`（星笔塔与观星台）、`art_bld_valen_city_goldscale_hall`、`art_bld_valen_city_guild_regional`、`art_bld_valen_city_city_hall`、`art_bld_valen_city_mercy_house`、`art_bld_valen_city_ironsluice_barracks`、`art_bld_valen_city_harbor_warehouse`、`art_bld_valen_city_mud_lane_shack`；道具：`art_prop_execution_stage`（广场刑台）、`art_prop_harbor_crane`、`art_prop_ferry_boat`、`art_prop_fish_stall`、`art_prop_sand_ring_post`、`art_prop_chalk_mark_ratfolk`（灰鼠粉笔记号，`ground_mark`）；远景：`art_bg_valen_city_far`、`art_bg_valen_city_mid`、`art_bg_valen_city_clouds`；地图插画 `art_map_valen_valley` |
| 优先级与里程碑 | P0；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `cathedral_square` | 大教堂前庭 | 上城南沿 | 复苏点、传闻 | 图 |
| `cathedral` | 白钟大教堂 | 上城 | 光之奇迹祭、静室 | 标 |
| `castle` | 鹰丘堡 | 北岩丘 | 继承之争、军议 | 标 |
| `castle_old_well` | 城堡旧井 | 鹰丘堡院内 | 通断门厅的封闸 | 秘 |
| `guild_hall`、`sand_ring` | 公会大区总部与沙环 | 中城 | 考核、委托 | 无 |
| `market`、`city_hall` | 大市集与市政厅 | 中城广场 | 物价、城议、刑台 | 标 |
| `academy` | 星笔塔（学塔区） | 中城高处 | 研究、观星台 | 无 |
| `stylus_tower_roof` | 星笔塔观星台 | 塔顶 | 远望全城与河谷 | 望 |
| `scale_street` | 秤街与金秤会馆 | 中城东 | 商会、交易所 | 无 |
| `ash_lane` | 炉灰街 | 中城与下城之间 | 工匠 | 无 |
| `mid_tavern` | 中城酒馆 | 中城 | 传闻 | 无 |
| `mud_lane`、`sewer_entrance` | 泥巷与水道口 | 下城低处 | 旧水道入口 | 无 |
| `leaky_lamp` | 漏灯酒窖 | 泥巷 | 灰鼠鼠巢 | 秘 |
| `iron_gate_camp` | 铁闸营 | 下城西墙 | 城防与佣兵 | 无 |
| `river_port` | 瓦伦河港与鱼市 | 下城南 | 货运、城下潮主战场 | 无 |
| `ferry` | 门前渡北岸码头 | 河港西端 | 渡船 | 标 |
| `river_council` | 联盟军议大帐 | 瓦伦河港东侧的河滩（第五幕） | 联盟军议（`cut_a5_confession`、`cut_a5_route`） | 无 |

### B4 `wallenburg_outskirts` 瓦伦堡城外（Valenburg Outskirts）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，野外 |
| 幕与区域 | 第二到第五幕；`valen_valley`；`wallenburg` |
| 尺寸 | 160×128 |
| 风格包 | `lothar_plain`（显式；区域默认是 `valen_city`） |
| 澱度 | 一，存储 1，渲染 1；静钟墓园与鹿角林病水河段局部二 |
| 等级带 | 15 到 22（城外委托）；低于带的野兽与指标动物照常出现 |
| 地形与布局 | 南缘是瓦伦堡北墙与北门；北门外是墙外营地（难民棚户，人口随剧情增减）与第八代魔王战争的阵亡碑；东侧是红沙场（练兵场兼比武场）与灰溪汇入瓦伦河的汇流口（黏土岸）；西侧是静钟墓园（伯爵家族墓、平民墓区、只为伯爵家敲的静钟）；西南是鹿角林（猎场、鹿角会营地、瓦伦河下游的病水河段，林中有旧水道沉锁闸的出水暗渠口）；北缘是北境丘陵的采石场与老橡林 |
| 出入口与路线 | 南 `to_wallenburg`（北门，`wallenburg_north_gate`）；本图不设区域图出口（远行从瓦伦堡北门或河港出发） |
| 动线与镜头 | T-F；入口（北门外）到墙外营地 10 米，营地是安全点；红沙场、墓园、鹿角林分别在东、西、西南，离入口 40 到 90 米 |
| 驻留 NPC | `baishan`（城外的森之祭司与澱热医）；墙外营地难民模板 6 到 12 人（旧哨村的人口来源）；鹿角会模板 3 人；静钟墓园守墓模板 1 人；红沙场：`reynard` 与赤鬃佣兵团模板；`ferryman`（每年在阵亡碑前站一会儿，剧情） |
| 魔物分布 | `field_hare` Lv1 到 3（中立）；`ear_moth` Lv4 到 8（麦田，灰年多）；`grave_robber` Lv8 到 14（墓园）；`gravefield_wisp` Lv9 到 12（墓园夜，墓地未净化时）；`dian_leech` Lv19 到 21（鹿角林病水出口）；`disciple_undertaker` Lv18 到 24（静钟墓园，葬仪社，第二幕）；`northern_deserter` Lv10 到 16（北缘林地，第二幕起）；`disciple_initiate` Lv12 到 18（墙外营地的施粥摊，第二幕） |
| 采集点 | `node_lotha_valen_claybank`（瓦伦河黏土岸，T1，汇流口）；`node_lotha_northhill_quarry`（北境丘陵采石场，T1 到 T2，北缘） |
| 照明与夜间 | 北门外营地篝火 2、红沙场火盆 1、静钟墓园入口路灯 1；鹿角林全黑 |
| 装饰与外观层 | 难民棚 6（建筑外观）、营地篝火 2、阵亡碑 1（立石）、墓碑 12、静钟钟架 1、红沙场木桩 4、旗帜 2、路牌 3；合计约 31（棚与碑按装饰计） |
| 任务挂点 | 难民招募（旧哨村来源）、墙外营地的绑架事件、阵亡碑（老船夫）、红沙场决斗、鹿角林病水调查（第二幕第 3 周起）、静钟墓园的葬礼（第 11 周）；第三幕北境大道的军队集结 |
| 美术素材 | 建筑：`art_bld_lothar_plain_refugee_shack`、`art_bld_lothar_plain_antler_lodge`（鹿角会营地）；道具：`art_prop_war_memorial_eighth`（阵亡碑）、`art_prop_silent_bell_frame`（静钟）、`art_prop_training_post`、`art_prop_drain_outlet`（出水暗渠口）；远景：`art_bg_valen_city_far`、`art_bg_valen_city_mid`、`art_bg_valen_city_clouds`（天幕包 `valen_city`：中景是瓦伦堡的城郭剪影，城外看得见北墙与鹰丘） |
| 优先级与里程碑 | P1；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `gate_wallenburg` | 北门外 | 南缘 | 到达点 | 图 |
| `wall_camp` | 墙外营地 | 北门外 | 难民、安全点 | 标 |
| `war_memorial` | 阵亡碑 | 营地西 | 老船夫 | 标 |
| `red_sand_field` | 红沙场 | 东 | 决斗、练兵 | 标 |
| `silent_bell_cemetery` | 静钟墓园 | 西 | 葬礼、葬仪社 | 标 |
| `antler_wood` | 鹿角林 | 西南 | 病水、鹿角会 | 标 |
| `drain_outlet` | 沉锁闸出水暗渠口 | 鹿角林深处 | 病水源头 | 秘 |

### B5 `gatefront_south` 门前渡南岸（Gatefront Ferry, South Bank）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，野外 |
| 幕与区域 | 第二到第五幕；`valen_valley`；`wallenburg` |
| 尺寸 | 96×96 |
| 风格包 | `lothar_plain`（显式） |
| 澱度 | 一，存储 1，渲染 1；渡口水门出口局部三（门站之澱渗出） |
| 等级带 | 15 到 30 |
| 地形与布局 | 北缘是瓦伦河与南岸渡口；渡口西侧是老船夫的小屋，藏在芦苇丛里；东北的河岸石壁下是渡口水门的出口（千门时代第三十七门的出口，水下暗道通旧水道）；南面芦苇丛与湿地向南展开，光径北支的石路从湿地中穿过，通往南缘 |
| 出入口与路线 | 北 `to_wallenburg`（门前渡渡船，`gatefront_ferry`）；东北 `to_sewers`（渡口水门，`ferry_watergate`，第二幕第 7 周发现）；南 `to_lightway_north`（区域图出口：光径北支陆路，本文落定把 `valen_river` 拆成船行与陆路两条，陆路一条 `lightway_north` 从这里出发，第三幕第 4 周） |
| 动线与镜头 | T-F；渡口到老船夫小屋 12 米；小屋门朝南（镜头一侧）；渡口水门出口只立路牌，不点灯 |
| 驻留 NPC | `ferryman`（老船夫，第八代勇者）、`pia`（渡船） |
| 魔物分布 | `drowned` Lv19 到 21（夜间渡口与河岸）；`dian_leech` Lv19 到 21（湿地）；`disciple_cultist` Lv25 到 27（渡口水门出口，门徒会撤退路线，第二幕）；中立指标动物 `reedmarsh_heron`、`valen_otter` |
| 采集点 | `node_lotha_valen_river`（瓦伦河渔场，T1，南岸一段） |
| 照明与夜间 | 小屋门灯与屋前一盏渔灯；渡口码头一对灯；芦苇丛全黑 |
| 装饰与外观层 | 渔网架 2、小船 2、木桶 2、路牌 2（渡口、光径）、渔灯 1；合计 9 |
| 任务挂点 | 第二幕渡口的老人（老船夫线）与夜追；门徒会撤退路线（渡口水门）；更强者的可挑战段 `trial_ferryman_crossing`（夜渡）；第五幕渡口证言（第八代勇者） |
| 美术素材 | 地面：`art_tile_lothar_plain_reed_marsh`、`art_tile_lothar_plain_lightway_stones`（光径石路）；建筑：`art_bld_lothar_plain_ferryman_hut`；道具：`art_prop_watergate_arch`（半没水中的古拱门）、`art_prop_fishing_net_rack`、`art_prop_reed_boat`；远景：`art_bg_valen_city_far`、`art_bg_valen_city_mid`、`art_bg_valen_city_clouds`（天幕包 `valen_city`：隔河望瓦伦堡与鹰丘） |
| 优先级与里程碑 | P1；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `ferry_landing` | 南岸渡口 | 北缘 | 到达点 | 图 |
| `ferry_hut` | 老船夫的小屋 | 渡口西 | 老船夫线 | 标 |
| `watergate_exit` | 渡口水门出口 | 东北河岸石壁下 | 门徒会撤退路线 | 秘 |
| `lightway_mouth` | 光径北支口 | 南缘 | 第三幕陆路远行 | 标 |

### B6 `wallenburg_sewers` 旧水道迷宫（Old Aqueduct Labyrinth）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_old_waterway` 的第一到第四区与隐道；第五区断门厅是 B6-1） |
| 幕与区域 | 第二到第五幕（第二幕分层开放，第四幕回访，第五幕节点六的通道）；`valen_valley`；`wallenburg` |
| 尺寸 | 40×30 到 96×72（三层并排画在同一张图里：北带上层 96×24，中带中层 96×24，南带底层门站前厅 48×24 与隐道；层与层之间以石阶格相连） |
| 风格包 | `sealed_ruins`（显式；区域默认是 `valen_city`） |
| 澱度 | 三，存储 3，渲染 4 |
| 等级带 | 第一区 16 到 18、第二区 19 到 21、第三区 22 到 24、第四区 25 到 27；第四幕回访澱晶窟深处 46（钥饲晶母，钥让它长到这一级） |
| 地形与布局 | 上层（洛萨建国后的排水渠）：井下平台（入口平台）、第一区排水廊（低矮砖渠，污水没膝，三座窄桥与两侧可走的渠肩形成回环，南端是鼠巢）、第二区沉锁闸（水闸与蓄水池，升降水位开辟通道）；中层（帝国行省时代的石砌水道）：第三区旧城基（水道切过更古老城镇的地基，墙上的字一行行被凿掉、烧掉）、第四区前半澱晶窟（结晶成澱的洞窟，头顶就是大教堂钟楼）；底层（千门时代门站）：第四区后半第三十七门前厅（门徒会据点与牢房，拱门上嵌青铜铭牌）；隐：渡口水门暗道（从前厅通门前渡南岸）。每层都从一处带火盆的平台出发 |
| 出入口与路线 | 西北 `to_wallenburg`（泥巷井口）；南 `to_broken_door_hall`（断门厅铁闸，`sewers_broken_door_hall`，第二幕第 13 周）；东南 `to_gatefront_south`（渡口水门，`ferry_watergate`）；门 `gate_link_thirty_seven`（第三十七门与荒原门站，第三幕行路之门进阶） |
| 动线与镜头 | T-D；考核线（井口到鼠巢）约 50 米；深入线（井口到第三十七门前厅）约 160 米，各区平台之间不超过 60 米；第三十七门前厅的门址落点是迷宫的后门 |
| 驻留 NPC | `dela`（灰鼠，粉笔记号指路，可同行）；联合攻略的勇者团 `luchen`、`yui`、`aiden`、`marcus`（AI 同行）；门徒会据点的被绑孩子（第 8 周解救） |
| 魔物分布 | 第一区：`dian_rat` 按迷宫定级 Lv16 到 18（第 12 节第 5 条）、`sewer_sludge` Lv16 到 18、`rat_king` Lv18（鼠巢首领）。第二区：`drowned` Lv19 到 21、`dian_leech` Lv19 到 21、`rustgate_colossus` 锈闸巨像 Lv21（首领）。第三区：`ash_bookwraith` Lv22 到 24、`burner_servant` Lv22 到 24、`book_burner` 焚书者 Lv24（首领）。第四区：`crystal_centipede_young` Lv25 到 27、`bell_crystal_wisp` Lv25 到 27、`disciple_cultist` Lv25 到 27、`disciple_bomber` Lv20 到 26、`crystal_centipede` 晶脊蜈 Lv27（首领）。第四幕回访（活性期，钥被取走前不回落）：`keyfed_crystal_queen` 钥饲晶母 Lv46（剧情首领）与 `crystal_centipede_young`（按回访定级 44 到 46） |
| 采集点 | `node_lotha_aqueduct_cistern`（旧水道蓄水池，T3，中层旧城基的蓄水池）；`node_lotha_gate37`（第三十七门门址，T3，第二幕末到第三幕） |
| 迷宫结构 | 层：上层、中层、底层、隐道。区：井下平台、排水廊、鼠巢、沉锁闸、旧城基、澱晶窟、第三十七门前厅、渡口水门暗道。核：缄门者所守的核在断门厅（B6-1）。机关：鼠洞三堵（先堵三处鼠洞再打鼠王）；水位（开关格：闸绳放水时沉锁闸的两条通道与锈闸巨像的核心露出，`waterLevel`）；焚年墙（打断"焚年"保住残页）；晶柱（`pillarHarden`）与教堂钟声（场地计时：钟响时晶体嗡鸣，`aoePulse`）；分层开放：第一区第 2 周或第 5 周，第二、三区第 5 周，第四区第 8 周，渡口水门第 7 周 |
| 照明与夜间 | 室内固定光；火盆 7：井下平台、排水廊东门、沉锁闸闸室、旧城基书灵房、澱晶窟入口、前厅柱廊一对 |
| 装饰与外观层 | 火盆 7、补给木箱 2、灰鼠粉笔记号 4（`ground_mark`，替代路牌立牌）、闸绳绞盘 2、青铜铭牌 1（前厅拱门，建筑外观）；合计 16（三层，按每层 12 计在上限内） |
| 任务挂点 | 第二幕考核讨伐（第 2 周）、联合攻略（第 5 周起，显露度）、A2-M08 晶窟深处（门址石，行路之门初阶）、门徒会据点与牢房、第 7 周渡口水门、第 13 周断门厅仪式入口；第三幕第三十七门与门站互通；第四幕无名之钥的一枚（门徒会旧巢在澱晶窟深处）；第五幕节点六的盐室通道 |
| 美术素材 | 地面：`art_tile_sealed_ruins_brick_sewer_water`（没膝污水）、`art_tile_sealed_ruins_imperial_aqueduct`、`art_tile_sealed_ruins_crystal_grotto`；建筑：`art_bld_sealed_ruins_sluice_gate`（水闸与蓄水池）、`art_bld_sealed_ruins_burnt_inscription_wall`（被凿被烧的字墙）、`art_bld_sealed_ruins_gate37_arch`（第三十七门拱门与铭牌）；道具：`art_prop_sluice_winch`、`art_prop_bronze_plaque_s09`、`art_prop_disciple_cage`、`art_prop_bell_resonant_crystal`；远景无 |
| 优先级与里程碑 | P0；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `sewer_landing` | 井下平台 | 上层西北 | 入口平台 | 图 |
| `drain_hall` | 排水廊 | 上层西 | 第一区 | 标 |
| `rat_nest` | 鼠巢 | 排水廊南端 | 百尾鼠王 | 无 |
| `sluice_gate` | 沉锁闸 | 上层东 | 第二区 | 标 |
| `old_foundation` | 旧城基 | 中层西 | 第三区、焚书者 | 标 |
| `crystal_grotto` | 澱晶窟 | 中层东 | 第四区、晶脊蜈 | 标 |
| `gate_37` | 第三十七门前厅 | 底层 | 门址、门徒会据点 | 标 |
| `watergate_tunnel` | 渡口水门暗道 | 底层东南 | 隐道 | 秘（二） |

### B6-1 `broken_door_hall` 断门厅（The Broken Door Hall）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_old_waterway` 第五区，守核） |
| 幕与区域 | 第二到第五幕（第二幕第 13 周仪式；第五幕众门环节点六"旧水道"）；`valen_valley`；`wallenburg` |
| 尺寸 | 48×48 |
| 风格包 | `sealed_ruins`（显式） |
| 澱度 | 三，存储 3，渲染 4；古门框下局部四（仪式期间） |
| 等级带 | 28 到 30（剧情首领钥司埃米尔 28、守核首领缄门者 30）；第五幕门环线守备 50 到 56 |
| 地形与布局 | 北是铁闸前廊（首领前平台，一对火盆）；中是圆厅（门站内厅），中央立着崩塌的古门框，纹样与玩家手背的门纹相同；东侧是通鹰丘城堡旧井的封闸；东西两侧各三个侧龛（第五幕改作盐室，按学院澱测绘封存澱晶） |
| 出入口与路线 | 北 `to_sewers`（铁闸，`sewers_broken_door_hall`，伯爵印戒为钥）；东 `to_castle_well`（封闸，本文落定的 `castle_well_shaft`）；门 `ring_old_waterways`（第五幕众门环） |
| 动线与镜头 | T-D；铁闸到圆厅中心 18 米；首领战场是圆厅，直径约 30 格，五块门形澱板分布在古门框四周 |
| 驻留 NPC | 第二幕：`emil`（钥司，剧情首领第一阶段）、被锁在门框上的孩子（共鸣之门的来源）；第五幕：学院学者（节点六守将）与执钥人一队 |
| 魔物分布 | 第二幕第 13 周：`disciple_zealot` Lv28 到 30；`emil` 钥司埃米尔 Lv28（剧情首领）；`doorsealer_construct` 缄门者 Lv30（守核）；第三阶段无貌者投影（不可战斗）。第五幕门环线：门徒会袭击队（`disciple_guide` Lv50 到 52）、教国拆门队（战争目录的兵种）、瓦尔妲催动的魔物潮（`mtide_lotha_city` 按第五幕定级） |
| 采集点 | 无（门址尘点在 B6 的第三十七门） |
| 迷宫结构 | 层：底层。区：铁闸前廊、圆厅、东侧封闸、侧龛六处。核：缄门者所守的门站之核（核当量 1；"毁"则中层与澱晶窟塌缩，门站石不塌）。机关：铁闸（开关格，伯爵印戒）；`breakableParts` 五块门形澱板，每碎一块松开一个孩子；"合扉"读条定身；第三阶段以门纹"合上"门；第五幕古门框重新点亮，门路锁定台（`mt_path_lock_disc`）安放在门框前 |
| 照明与夜间 | 前廊火盆一对；古门框门扉金的冷光；第五幕盐室各一盏灯 |
| 装饰与外观层 | 火盆 2、铁链 5（门框上的孩子，剧情状态）、侧龛盐箱 6（第五幕）、门路锁定台 1（第五幕）；合计 14 |
| 任务挂点 | 第二幕第 13 周断门厅仪式（"一个都没少"）、隔扉之门残响（焚书者的残页）；第四幕门钥线索；第五幕众门环节点六（盐封，`ring_old_waterways`） |
| 美术素材 | 建筑：`art_bld_sealed_ruins_inner_rotunda`；道具：`art_prop_collapsed_gateframe`（崩塌的古门框，第五幕点亮态）、`art_prop_iron_portcullis_signet`、`art_prop_salt_vault_crate`、`art_prop_path_lock_altar`（门路锁定台）；远景无 |
| 优先级与里程碑 | P0；M2（第五幕外观组 M3） |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `portcullis_hall` | 铁闸前廊 | 北 | 首领前平台 | 图 |
| `rotunda` | 圆厅 | 中 | 首领战 | 无 |
| `ancient_gateframe` | 崩塌的古门框 | 圆厅中央 | 守核、第五幕节点 | 标 |
| `castle_well_seal` | 旧井封闸 | 东 | 通鹰丘堡 | 无 |

### B7 `reedbridge` 苇桥村与南大路（Reedbridge）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，枢纽（南大路中继；第三幕灰烬防线之战的宿主） |
| 幕与区域 | 第二到第五幕；`valen_valley`；`ash_border` |
| 尺寸 | 128×96 |
| 风格包 | `lothar_plain`（显式；区域默认是 `valen_city`） |
| 澱度 | 一，存储 1，渲染 1 |
| 等级带 | 第二幕 10 到 20；第三幕战后 30 到 36 |
| 地形与布局 | 灰溪自东北向西南斜穿全图；南大路北段沿东岸南下，在图中央以一座石桥越过灰溪，转入西岸南去瓦伦堡；苇桥村（约三百人）在东岸桥头：一条街、客栈兼换马站、路边小祠、渔户；东岸桥头两侧各留 8 格以上的空地（战时阵地）；东岸往东是开阔的田地，渐升向东北的丘陵；沿河上下游是芦苇沼，下游西南的芦苇深处有一条只有门纹能"听见"的小径通苇塘村 |
| 出入口与路线 | 北 `to_south_road_north`（区域图出口，`south_road_north` 到边石镇）；西南 `to_south_road_south`（区域图出口，`south_road_south` 到瓦伦堡）；西南芦苇 `to_reedpond`（`reedpond_path`，开关格：芦苇小径在 `a3_reedpond_resonance` 之后可走）；战役入口 `reedbridge_battle_call`（第三幕第 20 到 21 周） |
| 动线与镜头 | T-H；从北来的到达点在村北路口，第一屏看见客栈招牌与石桥；客栈到桥头 15 米 |
| 驻留 NPC | `barbara_schmitz`（客栈、换马、武人师傅、情报）；`jakob_schilf`（渔户、平底船、游侠与垂纶）；`fanni_welte`（盐与杂货）；药草婆模板 1；更强者的可挑战段 `trial_grete_bridge` 的葛蕾特·铁栏（桥头） |
| 魔物分布 | `greybrook_crayfish` Lv8 到 12（浅滩）；`northern_deserter` Lv10 到 16（芦苇沼与东北丘陵，第二到第三幕）；第三幕战后 `crusade_straggler` Lv30 到 36（桥西南岸，第 21 周后）；中立指标动物 `reedmarsh_heron` |
| 采集点 | `node_lotha_greybrook_lower`（灰溪下游，T1） |
| 照明与夜间 | 门灯约 14；路灯 6（村北路口、街两端、桥头两侧、客栈前）；桥西南岸不点灯（第三幕敌军来向） |
| 装饰与外观层 | 路灯 6、路边小祠 1（`shrine_ruin` 的完好变体）、渔网架 2、换马栏 1、货摊 3、路牌 2；合计 15 |
| 任务挂点 | 第二幕南大路的中继（区域图节点、V6 集市日的货流）与难民潮；第三幕第 11 周苇塘村线入口、第 12 周屠村之后的证据线、第 20 到 21 周灰烬防线之战（C11）、葛蕾特过桥挑战；第四幕庭外之国南境 |
| 美术素材 | 建筑：`art_bld_lothar_plain_reedbridge_inn`（客栈兼换马站）、`art_bld_lothar_plain_fisher_house`；道具：`art_prop_reed_stone_bridge`（三拱石桥，桥头石墩）、`art_prop_wayside_shrine`、`art_prop_horse_change_pen`；远景：`art_bg_lothar_plain_far`、`art_bg_lothar_plain_mid`、`art_bg_lothar_plain_clouds` |
| 优先级与里程碑 | P0；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `gate_south_road_north` | 村北路口 | 北 | 到达点 | 图 |
| `reed_bridge` | 苇桥（石桥） | 中央 | 咽喉 | 标 |
| `reedbridge_inn` | 客栈兼换马站 | 东岸桥头 | 复苏点、换马 | 无 |
| `wayside_shrine` | 路边小祠 | 村街东 | 无神职的祠 | 标 |
| `reed_marsh` | 芦苇沼 | 上下游 | 逃兵、垂纶 | 无 |
| `resonance_path` | 芦苇小径 | 西南芦苇深处 | 通苇塘村 | 秘（三） |
| `burnt_chapel` | 烧毁的礼拜堂 | 苇桥南岸（第三幕灰烬防线之战烧毁） | 陆辰的回答（`cut_a5_luchen`） | 无 |

### B3-1 `wallenburg_harbor_battle` 城下潮（下城与河港）（The Undertide）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，战场；网格 `act2_city_defense`（小队） |
| 幕与区域 | 第二幕；`valen_valley`；`wallenburg` |
| 尺寸 | 网格 32×20 战场格；HD-2D 场景按 1 战场格 = 8 米渲染为 256×160 地图格（第 10.1 节） |
| 风格包 | `valen_city`（与 B1 下城共用素材） |
| 澱度 | 一，存储 1，渲染 1；五个出口处局部三（澱从出口涌出） |
| 等级带 | 27 到 30（第一波泥魔与溺亡者，终段缄门者 30） |
| 地形与布局 | 按 B1 下城与河港的真实布局：北边东西主街，中间鱼市广场，南面码头与河；泥巷井口、鱼市排水口、河港闸门三个出口在图上，上城两个出口由友军守、以战报回传 |
| 出入口与路线 | 战役入口 `wallenburg_harbor_battle_call`（第二幕第 13 周夜，断门厅仪式之后） |
| 动线与镜头 | T-B；屏幕上部署区在下（河港一侧的码头开阔地），澱从北面与东西出口涌来；罗盘标注真实方位 |
| 驻留 NPC | 守军按第二幕 7.3：卢卡斯与城防军、商会护卫、灰鼠、老船夫（信任 3 时守河港闸门一波）、勇者团（按状态） |
| 魔物分布 | 澱鼠潮、`sewer_sludge`、`mud_fiend`、`drowned`、`crystal_centipede_young`、门徒会 `disciple_bomber`；终段（仪式未终止时）`doorsealer_construct` 在鱼市破地而出 |
| 照明与夜间 | 夜战：码头一线五盏灯与守军火盆；出口方向全黑；黎明钟为胜利条件的计时 |
| 装饰与外观层 | 沿用 B1 下城外观；战线上不放装饰 |
| 任务挂点 | 第二幕主线城下潮（守住鱼市直到黎明钟声）；弃点保人与关键 NPC 的存亡 |
| 美术素材 | 复用 B1 下城与河港；增 `art_prop_barricade_cart`（街垒车）、`art_prop_drain_burst`（喷澱的排水口） |
| 优先级与里程碑 | P0；M2（进入 HD-2D 的第一个战场） |

## 6. 第三幕：C 系列（洛萨王国与荒原纵深）

第三幕的野外图普遍出现"图鉴等级低于本幕等级带"的种类（洛萨生态带 1 到 19）。规则：野外刷新点按本图等级带定级（`SpawnDef.level`，第 1.6 节），
魔物 ID 不变，掉落阶按定级后的等级取；图鉴里的等级是地表种群的基准。下文写作"按图 X 到 Y"。

### C1-1 `bonefield` 骨原（The Bone Plain）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，野外（灰烬边境领的新增地块） |
| 幕与区域 | 第三到第五幕；`ashen_waste`；`ash_rim` |
| 尺寸 | 128×128 |
| 风格包 | `ash_waste`（区域默认） |
| 澱度 | 二，存储 2，渲染 2；骨冢一带局部三 |
| 等级带 | 26 到 34 |
| 地形与布局 | 界石线外、旧哨村西北的白骨平原：浅灰的地面铺满碎骨，骨堆按年代成层（骨原是一张战争年表）；东南角是从旧哨村西北口上来的北坡（与 C1-2 战场相邻）；中央是骨冢（骷髅兵聚成的骨堆，未收的骨堆会让下一次更大）；西南是拾遗营（拾荒者收骨与旧兵器的营地）；北缘渐入中层，玻璃原边缘的反光在天际；西缘接荒原外缘东段 |
| 出入口与路线 | 东南 `to_old_outpost`（`old_outpost_bonefield`，6 公里，第三幕第 2 周）；西 `to_ash_waste`（`bonefield_rim`） |
| 动线与镜头 | T-F；入口到拾遗营 10 米；骨冢离入口约 60 米；北缘只立路牌 |
| 驻留 NPC | 拾荒者模板 3 人（拾遗营）；`zima_lullaby`（送魂，夜里来）；`jutta_scavenger`（收旧兵器，隔日） |
| 魔物分布 | `boneplain_skeleton` 按图 26 到 30（成队，夜间加倍）；`bone_hound` 按图 26 到 30；`ashfolk` 按图 28 到 32（夜）；`thousandbone_whelp` 千骨行者幼体 30（精英，北半）；巢主 `bonepile_lord` 骨冢 按图 34（骨原中央）；`bone_vulture` 中立。第三幕第 21 周后（净化之光的余波）亡灵数量翻倍；第四幕天启后中层种类外推 |
| 采集点 | `node_waste_bonefield`（骨原拾遗场，T2 到 T3） |
| 照明与夜间 | 拾遗营火盆 1；北坡入口路灯 1；其余全黑，夜里骨原有列队的脚步声（`mtide_waste_boneplain` 的前兆） |
| 装饰与外观层 | 骨堆 8、旧兵器插地 4（跨越几百年的式样）、拾遗营木箱 2、帐篷 1、路牌 2；合计 17 |
| 任务挂点 | 第三幕第 2 周骨原夜袭的前后（侦察与战后收骨）；拾遗营委托；骨冢（收骨或送魂）；余波（M04-C07 亡灵翻倍）；骨原魔物潮 |
| 美术素材 | 地面：`art_tile_ash_waste_bone_strewn`（碎骨铺地）；道具：`art_prop_bone_heap_layered`（分层骨堆）、`art_prop_old_weapons_planted`、`art_prop_bonepile_lord_mound`；远景：`art_bg_ash_waste_far`、`art_bg_ash_waste_mid`、`art_bg_ash_waste_clouds` |
| 优先级与里程碑 | P1；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `gate_old_outpost` | 北坡入口 | 东南 | 到达点 | 图 |
| `relic_camp` | 拾遗营 | 西南 | 安全点、收骨 | 标 |
| `bone_mound` | 骨冢 | 中央 | 巢主 | 标 |
| `north_slope_crest` | 北坡高处 | 东南 | 远望骨原全景 | 望 |
| `war_chronicle_pit` | 年表坑 | 东 | 一处被冲开的骨层，兵器从上到下跨越几个世纪 | 秘 |

### C1-2 `bonefield_battle` 骨原夜袭（Night Raid on the Bone Plain）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，战场；网格 `act3_bone_field`（连队，教学战） |
| 幕与区域 | 第三幕第 2 周夜；`edgestone_area`；`ash_border` |
| 尺寸 | 网格 36×22 战场格；HD-2D 场景按 1 战场格 = 8 米渲染为 288×176 地图格（第 10.1 节） |
| 风格包 | `wild_forest`（铁杉林与骨原之间的北坡） |
| 澱度 | 二，存储 2，渲染 2 |
| 等级带 | 30 到 32（精英千骨行者幼体 30） |
| 地形与布局 | 北是丘陵（亡灵来向），中段两段残破石墙与一条浅溪（亡灵渡流水变慢），东侧瞭望塔，南部是村子（守点）；屏幕方向与真实方位一致：部署区在南 |
| 出入口与路线 | 战役入口 `bonefield_battle_call`（旧哨村） |
| 动线与镜头 | T-B；咽喉是溪上的浅滩（中线），两侧展开各 8 格以上 |
| 驻留 NPC | 我方：罗恩（民兵 60）、希雅（猎手 10）、玩家；罗恩第一次指挥会留空左翼 |
| 魔物分布 | 骨原亡灵约 150：`boneplain_skeleton`、`bone_hound`（兵团），精英 `thousandbone_whelp` |
| 照明与夜间 | 村中火盆与民兵营火；北面全黑 |
| 装饰与外观层 | 村内火盆 3、拒马 4（不在战线上）、补给木箱 2；合计 9 |
| 任务挂点 | 千军之门的钥"第一次守土之战"；罗恩举旗（连队规模开启） |
| 美术素材 | 复用 A10 与 C1-1；增 `art_prop_watchtower_burnt`、`art_prop_cheval_de_frise` |
| 优先级与里程碑 | P0；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `north_slope` | 北坡阵线 | 北 | 骨原夜袭之后的阵线（`cut_a3_domain` 段二） | 无 |

### C1-3 `reedpond` 苇塘村（Reedpond）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，野外（遗民的隐村，第 12 周之后是废墟与证据） |
| 幕与区域 | 第三到第五幕；`valen_valley`；`ash_border` |
| 尺寸 | 96×96 |
| 风格包 | `wild_forest`（显式；以 `looks` 用芦苇沼地块） |
| 澱度 | 一，存储 1，渲染 1；门纹祠局部零（遗民的门歌让澱散开） |
| 等级带 | 34 到 38 |
| 地形与布局 | 苇桥下游芦苇沼深处的高脚屋群，栈道相连；村心一座不起眼的小祠，门楣上有一个被泥糊住的门形纹；第 12 周屠村后，北半的屋子被烧毁，栈道断成数段，祠被砸开，露出门纹 |
| 出入口与路线 | 东北 `to_reedbridge`（芦苇沼小径，`reedpond_path`，门纹共鸣后可走） |
| 动线与镜头 | T-F；入口到村心栈道广场 20 米（屠村前是安全点，屠村后营地在南岸废船里） |
| 驻留 NPC | 屠村前：遗民模板约 40 人、`alai_reedpond`（游侠，幸存者之一）；屠村后：幸存者 3 人（证人，按第三幕 4.0） |
| 魔物分布 | 屠村前：无（`reedmarsh_heron` 中立）；第 12 周屠村事件：审判庭卫队 `inquisition_guard` 按图 34 到 36 与圣誓志愿军（战争目录兵种）；屠村后：`gravefield_wisp` 按图 34 到 38（夜，未送魂时）、`northern_deserter` 按图 34 到 36（劫掠废墟） |
| 采集点 | `node_lotha_greybrook_lower` 的下游段（同一采集点，灰溪下游） |
| 照明与夜间 | 屠村前：家家户户的油灯（遗民夜里点灯不出门）；屠村后：只剩幸存者的一盏 |
| 装饰与外观层 | 栈道灯 6、渔网架 3、小船 3、门纹祠 1；屠村后换为焚屋残骸与断栈道（外观组切换） |
| 任务挂点 | 第三幕第 11 周门纹共鸣寻村（共鸣之门的门守相关）；第 12 周屠村（暗面）；证据线（幸存者、记录与证词，供灰烬防线之战的"说服"路线）；遗民迁入领地 |
| 美术素材 | 地面：`art_tile_wild_forest_reed_water`（芦苇浅水）；建筑：`art_bld_wild_forest_stilt_house`（高脚屋，完好与焚毁两态）、`art_bld_wild_forest_boardwalk`；道具：`art_prop_gate_sigil_shrine`（门纹小祠）、`art_prop_oil_lamp_pole`；远景：`art_bg_wild_forest_far`、`art_bg_wild_forest_mid`、`art_bg_wild_forest_clouds` |
| 优先级与里程碑 | P0；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `gate_reedbridge` | 芦苇小径口 | 东北 | 到达点 | 图 |
| `boardwalk_square` | 栈道广场 | 中 | 村心 | 标 |
| `sigil_shrine` | 门纹祠 | 村心北 | 门纹 | 秘 |
| `burnt_rows` | 焚屋 | 北半 | 屠村证据 | 标（三，第 12 周后） |

### C2 `orien_isle` 奥瑞恩王岛（Orien Isle）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，舞台 |
| 幕与区域 | 第三到第五幕；`lotha_realm`；`orien` |
| 尺寸 | 128×96 |
| 风格包 | `valen_city`（区域默认是 `lothar_plain`，王都用城市包） |
| 澱度 | 一，存储 1，渲染 1 |
| 等级带 | 无常驻；档案馆委托 32 到 36；朝阳门之夜在 C3-1 |
| 地形与布局 | 瓦伦河心的岛，四周是河；冠石宫居中（帘幕寝殿在宫北，老王卧于层层帘幕之后）；长桌厅在宫东翼（评议会，一张能坐三十人的长桌）；王宫旧翼在西，是王国档案馆，档案馆深处是存放空白纪封匣的七锁库；岛南北各一座石桥通两岸；宫前广场朝南 |
| 出入口与路线 | 北桥 `to_old_town`、南桥 `to_new_town`（`orien_bridges`；本文落定把它拆成 `orien_bridge_north` 与 `orien_bridge_south` 两条路线，两桥各一个出口）；王岛码头（小船，朝阳门之夜的撤离路线之一） |
| 动线与镜头 | T-H；从南桥进入正对宫前广场与冠石宫南立面；档案馆的门朝东开向宫内庭 |
| 驻留 NPC | `joachim`（王党禁卫）、`hermann_strahl`（武人）、`eberhard` 与 `thilo_ohlen`（档案馆与录纹）、`cornelia_drake`（宫廷魔导）、`olive`、`wenzel`；王子腓力、老王、宰相与评议会六诸侯按人物目录（一）第 3.3.1、3.3.2 节 |
| 魔物分布 | 常驻无；档案馆封匣室外的委托：`bookmite` 按图 32 到 34、`misrecord_wisp` 按图 34 到 36（录澱） |
| 采集点 | 无 |
| 照明与夜间 | 宫灯与桥头灯；档案馆起火时（朝阳门之夜）旧翼火光 |
| 装饰与外观层 | 宫前旗帜 6、桥头灯 4、长桌厅外长椅 2、卫兵岗亭 2；合计 14 |
| 任务挂点 | 第三幕第 4 周觐见、第 5 周长桌厅评议会、档案馆与七锁库（空白纪碎片、`ky_` 系列的档案）、宫廷线、第 16 周宰相开城后按 `lothar_ending` 换外观（帝国驻军或王党控制） |
| 美术素材 | 建筑：`art_bld_valen_city_crownstone_palace`（冠石宫）、`art_bld_valen_city_curtain_bedchamber`、`art_bld_valen_city_longtable_hall`、`art_bld_valen_city_royal_archive`；道具：`art_prop_seven_lock_vault_door`、`art_prop_long_table_thirty`；远景：`art_bg_valen_city_far`、`art_bg_valen_city_mid`、`art_bg_valen_city_clouds` |
| 优先级与里程碑 | P0；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `palace_square` | 宫前广场 | 南 | 到达点 | 图 |
| `crownstone_palace` | 冠石宫与帘幕寝殿 | 中北 | 觐见 | 标 |
| `longtable_hall` | 长桌厅 | 东翼 | 评议会 | 标 |
| `royal_archive` | 王国档案馆 | 西翼 | 空白纪 | 标 |
| `seven_lock_vault` | 七锁库 | 档案馆深处 | 封匣 | 秘 |
| `crownstone_gallery` | 冠石宫长廊 | 冠石宫内，帘幕寝殿外 | 觐见前的等候（`cut_a3_audience`） | 无 |
| `crownstone_balcony` | 冠石宫阳台 | 冠石宫南面，俯瞰宫前广场 | 王冠坠地之夜（`cut_a3_crown_falls`）；加冕礼的远景 | 无 |

### C3 `orien_banks` 奥瑞恩两岸（Orien, Both Banks）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，枢纽 |
| 幕与区域 | 第三到第五幕；`lotha_realm`；`orien` |
| 尺寸 | 192×160 |
| 风格包 | `valen_city`（显式） |
| 澱度 | 一，存储 1，渲染 1；车辙区与新城排水口局部二 |
| 等级带 | 城内委托 32 到 38 |
| 地形与布局 | 瓦伦河自东北流向西南，横穿全图中部，河心是王岛（C2，不在本图）；北岸旧城：晨光主座堂（大主教塞维林的讲坛，钟楼）、贵族区、宰相府；南岸新城：市场、同盟银行分号兼债务署、码头、车辙区（车夫与搬运工的下城，有通到城外的旧沟渠）、朝阳门（对着王道，在新城东南）；两岸桥头各有一座门楼通王岛 |
| 出入口与路线 | 北岸码头 `to_river_port`（区域图：`valen_river` 船行）；北岸东北城门 `to_lightway_north`（区域图：`lightway_north` 陆路）；朝阳门 `to_kings_road`（区域图：`kings_road`）；南岸南门（光径北支往初光驿，第四幕经世界图）；北桥头 `to_isle_north`、南桥头 `to_isle_south`；战役入口 `sunrise_gate_battle_call` |
| 动线与镜头 | T-H；两岸各自一个枢纽：北岸以主座堂前庭为复苏点，南岸以市场广场为复苏点；两条主街都排在街北、门朝南 |
| 驻留 NPC | 北岸：`severin`（大主教）、`albin_dawnlight`、宰相与家臣（人物目录（一）3.3.1）；南岸：`frieda_muenz`、`gustav_kram`、`parvi_tinring`（同盟债务专员）、`lotti_rutways`（驿车）、`sigrid`（炼剂）、`beatrix_hof`（机巧）；隐：`hjalma_blum`（森之祭司，车辙区） |
| 魔物分布 | 常驻无；城下委托：`purse_mouse` 按图 32 到 34（银号地下）、`lamp_ooze` 按图 32 到 34（新城排水口）、`chapel_rat` 按图 32 到 34（座堂地窖）、`disciple_undertaker` 按图 34 到 36（王都的葬仪社） |
| 采集点 | `node_lotha_south_vineyard`（南部葡萄坡，T1，南门外缘） |
| 照明与夜间 | 门灯约 80、路灯约 50；朝阳门外王道一盏不点（第三幕敌军来向） |
| 装饰与外观层 | 约 70 件（城镇上限）：两岸码头吊车与货箱、市场货摊 8、主座堂前庭长椅与路灯、桥头旗帜 |
| 任务挂点 | 第三幕第 4 周王都觐见、宫廷线（宰相府、主座堂讲坛）、同盟银行的债券、车辙区旧沟渠（朝阳门之夜的撤离路线）、圣徒营（王都以南的事件节点，不进图集）；第四幕光径北支的起点 |
| 美术素材 | 建筑：`art_bld_valen_city_dawnlight_cathedral`（晨光主座堂）、`art_bld_valen_city_chancellor_house`、`art_bld_valen_city_league_bank_branch`、`art_bld_valen_city_sunrise_gate`（朝阳门）、`art_bld_valen_city_carter_quarter`；道具：`art_prop_bridge_gatehouse`、`art_prop_debt_notice_board`；远景：`art_bg_valen_city_far`、`art_bg_valen_city_mid`、`art_bg_valen_city_clouds` |
| 优先级与里程碑 | P0；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `cathedral_forecourt` | 主座堂前庭 | 北岸 | 复苏点 | 图 |
| `dawnlight_cathedral` | 晨光主座堂 | 北岸 | 大主教 | 标 |
| `chancellor_house` | 宰相府 | 北岸贵族区 | 宫廷线 | 标 |
| `new_market` | 新城市场 | 南岸 | 复苏点 | 无 |
| `league_bank` | 同盟银行分号 | 南岸 | 债券 | 标 |
| `sunrise_gate` | 朝阳门 | 南岸东南 | 王道 | 标 |
| `carter_ditch` | 车辙区旧沟渠 | 南岸下城 | 通城外 | 秘 |
| `cathedral_belfry` | 主座堂钟楼 | 北岸 | 远望两岸与王岛 | 望 |

### C3-1 `sunrise_gate_battle` 朝阳门之夜（The Night of the Sunrise Gate，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，战场（小队，四到六支）；可选 |
| 幕与区域 | 第三幕第 16 周夜（债券在玩家手里时提前到第 15 周）；`lotha_realm`；`orien` |
| 尺寸 | 网格 64×48 战场格（第 10.3 节）；HD-2D 场景按 1 战场格 = 8 米渲染为 512×384 地图格（第 10.1 节） |
| 风格包 | `valen_city` |
| 澱度 | 一，存储 1，渲染 1 |
| 等级带 | 40 到 44 |
| 地形与布局 | 王都夜城的压缩：南部是南岸新城（朝阳门在东南、车辙区与旧沟渠在西南）；中部是河与王岛（两座石桥、冠石宫与起火的档案馆旧翼）；北部是北岸旧城（主座堂与宰相府）。屏幕部署区在下：玩家从车辙区（南岸西南）潜入，帝国"护送使团"自朝阳门（东南）入城 |
| 出入口与路线 | 战役入口 `sunrise_gate_battle_call`（C3）；前提：玩家人在王都、或已在王都安放门标、或信使之门让夜羽提前传信 |
| 动线与镜头 | T-B；目标依次：宰相府夺冠石印（北岸）、冠石宫救腓力与御医（王岛）、可选抢救档案馆（王岛西翼）、撤出（旧沟渠、河上小船或门标） |
| 驻留 NPC | 我方：约阿希姆与王党禁卫约 80、艾登（条件）；敌方：帝国护送使团约 800（债券在手时减半）、宰相派宫廷禁卫约 200 |
| 魔物分布 | 无（人形兵团，战争目录） |
| 照明与夜间 | 夜战：档案馆的火是全图最亮处；街灯半数熄灭；朝阳门外火把列队 |
| 装饰与外观层 | 沿用 C2、C3 外观；战线上不放装饰 |
| 任务挂点 | `philip_fate`、冠石印的去向、档案馆碎片、艾登的去留 |
| 美术素材 | 复用 C2、C3；增 `art_prop_archive_fire`（起火的档案架）、`art_prop_river_skiff` |
| 优先级与里程碑 | P2；M2 |

### C4 `blackoak_keep` 黑橡堡（Blackoak Keep）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，枢纽 |
| 幕与区域 | 第三到第五幕；`lotha_realm`；`blackoak` |
| 尺寸 | 128×128 |
| 风格包 | `valen_city`（显式；以 `looks` 用北境灰石与黑橡木） |
| 澱度 | 二，存储 2，渲染 2；城外合葬坡局部三 |
| 等级带 | 36 到 42（城外） |
| 地形与布局 | 夜风走廊南口的石堡，背靠北境丘陵：北半是主堡（北境军团主堡，戍军约两千五百）与北门（走廊方向），北门内立 909 年的阵亡碑（史料 S11，三百个名字）；南半是外城（军需库、马厩、军营、小礼拜堂）；东北城外是合葬坡与霜骨墓窟的坑口营；西南城门通旧巡逻道东段，南门通北境大道 |
| 出入口与路线 | 南 `to_northern_march`（区域图：`northern_march_road`）；西南 `to_patrol_road_east`（区域图：`old_patrol_road_east`）；北 `to_nightwind_corridor`（`nightwind_south_mouth`）；东北 `to_frostbone_catacombs`（`frostbone_gate`） |
| 动线与镜头 | T-H；从南门进入，外城主街北上直通主堡南门；城墙箭楼是远望点 |
| 驻留 NPC | 北境军团长布丽吉特（人物目录（一）3.3.3）、`arno_greywall`、`gunther`（武人）、`stefan_reik`（游侠、护送）、`aegidius_crypt`（礼拜堂、霜骨墓窟）、`katharina_vogt`（军需）；军团兵模板 |
| 魔物分布 | 城外合葬坡（冬夜）：`frostbone_soldier` 按图 36 到 38；异名者 `oakwall_warden` 黑橡守夜人（外墙，夜）与 `frostbeard` 霜胡子（沿城墙带狼群，冬） |
| 采集点 | 无（北境丘陵的采集点在 C5） |
| 照明与夜间 | 主堡与城墙火盆约 12；外城门灯与路灯；北门外不点灯（走廊方向） |
| 装饰与外观层 | 约 45 件：军旗 8、兵器架 6、火盆 12、阵亡碑 1、马槽 4、补给车 4、路牌与告示 4、木箱木桶 6 |
| 任务挂点 | 第三幕第 9 周北境开放；北境军团与 `north_status`；霜骨墓窟（可选）；霜脊堡之战的出发地（第 10 到 11 周）；罗戈佯攻黑橡堡（钉住布丽吉特）；阵亡碑拓本（送魂的钥） |
| 美术素材 | 建筑：`art_bld_valen_city_blackoak_main_keep`、`art_bld_valen_city_greywall_rampart`；道具：`art_prop_memorial_909`（阵亡碑）、`art_prop_northern_banner`、`art_prop_weapon_rack`；远景：`art_bg_lothar_plain_far`、`art_bg_lothar_plain_mid`、`art_bg_lothar_plain_clouds`（天幕包 `lothar_plain`：堡寨在北境山地，不用城郭剪影；冬季由四时调色） |
| 优先级与里程碑 | P0；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `south_gate_yard` | 南门内 | 南 | 到达点、复苏点 | 图 |
| `main_keep` | 主堡 | 北 | 北境军团 | 标 |
| `memorial_909` | 北门阵亡碑 | 北门内 | 史料 S11 | 标 |
| `mass_grave_slope` | 合葬坡与坑口营 | 东北城外 | 霜骨墓窟入口 | 标 |
| `rampart_tower` | 城墙箭楼 | 西北角 | 远望走廊与霜脊 | 望 |

### C4-1 `frostbone_catacombs` 霜骨墓窟（Frostbone Catacombs，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_frostbone_crypt`）；可选 |
| 幕与区域 | 第三幕第 9 周起到第五幕；`lotha_realm`；`blackoak` |
| 尺寸 | 96×96 |
| 风格包 | `sealed_ruins`（显式；以 `looks` 用冰面、霜壁与坑底的白瓷色） |
| 澱度 | 三，存储 3，渲染 4；光之坑局部四 |
| 等级带 | 36 到 42（迷宫目录现值 26 到 32，与 D-069 的第三幕等级带 30 到 45 不合；本图按 36 到 42 定级，首领 38、40、42，第 13.2 节请求迷宫目录与总纲 4.4 同步） |
| 地形与布局 | 坑口营（掘墓人的旧木屋，北境军团的封条与值守）；骨廊（按军阶码放的骸骨冻在冰里）；冻河段（地下冻住的小河，冰层可击破）；旗厅（909 年守军最后的阵线，冻在墙上的军旗）；光之坑（坑底的骸骨与冰都是苍白的瓷色，光滑、对称）；隐：少年兵的地道（只容孩子与小兽，从坑口营直通旗厅背后） |
| 出入口与路线 | 西南 `to_blackoak_keep`（`frostbone_gate`，须布丽吉特的通行令或老兵口中的旧地道） |
| 动线与镜头 | T-D；坑口营到旗厅约 60 米，到光之坑约 85 米；首领后捷径：光之坑的冰阶直上坑口营 |
| 驻留 NPC | 坑口营值守老兵模板 1（讲 909 年的事）；`aegidius_crypt`（送魂时同行）；布丽吉特（少年兵的地道只有她记得） |
| 魔物分布 | `frostbone_soldier` 按图 36 到 38（骨廊、冻河段成队）；`frozen_banner_bearer` 冻旗手 按图 39（精英）；`porcelain_frostling` 白霜童 按图 40 到 41（光之坑）；首领 `frost_pike_captain` 霜矛队长 按图 38（旗厅）、`winter_throat` 冬喉 按图 40（冻河段）、`rimelight_icon` 白霜像 按图 42（光之坑，守核） |
| 采集点 | 无 |
| 迷宫结构 | 层：坑道一层、坑底一层。区：坑口营、骨廊、冻河段、旗厅、光之坑、少年兵的地道。核：白霜像所守之核（核当量 1）。机关：寒气按分钟叠 `frostbite`；冻旗手的旗可放倒（附近亡灵失去 `rally`）；冻河段冰层可击破（开关格：冰面变深水，成队的霜骨兵沉下去）；冰柱遮蔽（冬喉第三阶段）；送魂念名（阵亡碑拓本，非战斗解） |
| 照明与夜间 | 室内固定光；火盆 5（坑口营、骨廊入口、冻河段岸、旗厅门槛一对）；光之坑本身发冷白光 |
| 装饰与外观层 | 火盆 5、冻在冰里的骸骨 6、军旗 1、掘墓人木屋 1、封条 2；合计 15 |
| 任务挂点 | 祷之门（送魂）；事迹"三百个名字""守线者""光下无人起身"；北境老兵归心；第五幕"神迹产生澱"的地方性证据 |
| 美术素材 | 地面：`art_tile_sealed_ruins_ice_floor`、`art_tile_sealed_ruins_porcelain_pit`；建筑：`art_bld_sealed_ruins_frozen_ossuary_wall`；道具：`art_prop_frozen_banner_909`、`art_prop_bones_in_ice`、`art_prop_gravedigger_hut` |
| 优先级与里程碑 | P2；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `pit_camp` | 坑口营 | 西南 | 入口平台 | 图 |
| `bone_gallery` | 骨廊 | 中西 | 霜骨兵 | 无 |
| `frozen_river` | 冻河段 | 中 | 冬喉 | 标 |
| `banner_hall` | 旗厅 | 北 | 霜矛队长 | 标 |
| `light_pit` | 光之坑 | 东北 | 白霜像 | 标 |
| `boy_soldier_tunnel` | 少年兵的地道 | 坑口营到旗厅背后 | 隐道 | 秘 |

### C5 `nightwind_corridor` 夜风走廊南段（Nightwind Corridor, South）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，野外 |
| 幕与区域 | 第三到第五幕；`lotha_realm`；`blackoak` |
| 尺寸 | 160×128 |
| 风格包 | `wild_forest`（显式；第 9 到 18 周冬季以 `looks` 换雪地） |
| 澱度 | 二，存储 2，渲染 2 |
| 等级带 | 36 到 42 |
| 地形与布局 | 南缘是黑橡堡北门外的走廊南口；走廊向北收窄，两侧是荒原东缘与帝国西北丘陵；西侧山脊上是霜脊堡，扼守通往冻铃河谷的岔道；冻铃河自西流入，河谷里是白桦村、冰渡村、石栏村（居民约一千二百）；东北山坳是魔狼窟；北缘走廊继续伸向獠牙关（第三幕不开放，第四幕经世界图） |
| 出入口与路线 | 南 `to_blackoak_keep`（`nightwind_south_mouth`）；战役入口 `frostridge_battle_call`（第三幕第 10 到 11 周） |
| 动线与镜头 | T-F；入口到走廊南口哨站 10 米（营地）；霜脊堡在西北 70 米，三村沿河谷分布 |
| 驻留 NPC | 霜脊堡守将英格丽德与守军（人物目录（一）3.3.3）；三村村民模板；向导雷吉斯（随玩家分队） |
| 魔物分布 | `warg` 按图 36 到 40（走廊）；`redhorn_stoat` 按图 36 到 38；`greyback_bear` 按图 40 到 42（精英，北段林地）；`night_deserter` 按图 36 到 40；`thrall_trader` 按图 38 到 40（山道）；`warg_rider_outlaw` 按图 40 到 42（北缘）；巢主 `warg_den_alpha` 狼窟头狼 按图 42（魔狼窟）；异名者 `frosthorn_steed` 霜角的坐骑；冬季魔物潮 `mtide_lotha_winter`（封死走廊 14 日） |
| 采集点 | `node_lotha_old_oak`（北境老橡林，T2，走廊南口丘陵） |
| 照明与夜间 | 南口哨站火盆 1、三村窗光、霜脊堡城墙火盆；走廊中段与北段全黑；暴风雪时可见度降低（天气由内核状态驱动） |
| 装饰与外观层 | 哨站火盆与木箱 3、三村各 4 件（柴垛、雪橇、晾鱼架）、路牌 3；合计 18 |
| 任务挂点 | 第三幕第 10 周北线（萨莎突袭）、霜脊堡之战（C5-1）、救回被掳村民、信使穿越翼魔封锁、冬季魔物潮 |
| 美术素材 | 地面：`art_tile_wild_forest_snow`、`art_tile_wild_forest_frozen_river`；建筑：`art_bld_wild_forest_frostridge_fort`（山脊石堡）、`art_bld_wild_forest_birch_village_house`；道具：`art_prop_warg_den_mouth`、`art_prop_fish_drying_rack`、`art_prop_sled`；远景：`art_bg_wild_forest_far`、`art_bg_wild_forest_mid`、`art_bg_wild_forest_clouds` |
| 优先级与里程碑 | P0；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `south_mouth_post` | 走廊南口哨站 | 南 | 到达点、营地 | 图 |
| `frostridge_fort` | 霜脊堡 | 西北山脊 | 守军 | 标 |
| `bellfrost_valley` | 冻铃河谷三村 | 西 | 撤离对象 | 标 |
| `warg_den` | 魔狼窟 | 东北山坳 | 巢主 | 标 |
| `frostridge_crest` | 霜脊 | 西北 | 远望走廊北段 | 望 |

### C5-1 `frostridge_battle` 霜脊堡之战（The Battle of Frostridge）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，战场；网格 `act3_north_raid`（军团） |
| 幕与区域 | 第三幕第 10 到 11 周；`lotha_realm`；`blackoak` |
| 尺寸 | 网格 44×26 战场格；HD-2D 场景按 1 战场格 = 8 米渲染为 352×208 地图格（第 10.1 节） |
| 风格包 | `wild_forest`（雪地外观） |
| 澱度 | 二，存储 2，渲染 2 |
| 等级带 | 36 到 40（萨莎按对手战，不可击倒取胜） |
| 地形与布局 | 北半是雪原（红牙军来向）；中线是冻河（冰层可击破）；两侧林地；南半是霜脊堡（守点）与南去黑橡堡的路；屏幕方向与真实方位一致 |
| 出入口与路线 | 战役入口 `frostridge_battle_call`（C5） |
| 动线与镜头 | T-B；咽喉是冻河上的冰面与堡门 |
| 驻留 NPC | 我方：英格丽德与守军约 700、冈特的救援纵队约 1500（第三日）、玩家分队约 250；敌方：萨莎、罗戈（佯攻）、希斯卡 |
| 魔物分布 | 红牙军（战争目录兵种）与驯澱魔兽（`warg` 骑） |
| 照明与夜间 | 暴风雪阶段降低视野；堡内火盆；魔族夜战加成 |
| 装饰与外观层 | 堡内火盆 4、补给 2；战线无装饰 |
| 任务挂点 | `sasha_result`、`sasha_interest`、`north_status`、勇者团被救的记忆 |
| 美术素材 | 复用 C5；增 `art_prop_cracked_ice_sheet` |
| 优先级与里程碑 | P0；M2 |

### C6 `silversaddle_keep` 银鞍堡与银鞍桥（Silversaddle Keep）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，枢纽 |
| 幕与区域 | 第三到第五幕；`lotha_realm`；`silversaddle` |
| 尺寸 | 160×128 |
| 风格包 | `valen_city`（显式） |
| 澱度 | 一，存储 1，渲染 1 |
| 等级带 | 城外 33 到 38 |
| 地形与布局 | 银鞍河自北向南流过全图东部；王道上的石桥银鞍桥横跨河面，西岸桥头是桥头堡与城（约一万二千人，含戍军两千）；城西是王道来路；城北与西北是苍榆林地边缘；河上游方向（北）的河岸小路通往鹿渡（战场，经战役入口）；东岸桥头只有一座关卡小屋，再往东是帝国西衡堡（第三幕不开放） |
| 出入口与路线 | 西 `to_kings_road`（区域图：`kings_road`）；西北 `to_elmfair`（区域图：`silversaddle_elmfair`）；东 `to_west_poise`（银鞍桥，第四幕经世界图）；战役入口 `deer_ford_battle_call`（第三幕第 7 到 8 周） |
| 动线与镜头 | T-H；从西入城，主街东去桥头堡，桥头堡南立面迎着镜头 |
| 驻留 NPC | `ottmar_lichtenwald`、`rolf_schneider`（武人）、`erika_lichtenwald`（游侠、冷眼流派、情报）、`anton_deerford`（鹿渡渡船，第三幕往来于鹿渡）；橡盾要塞守将康拉德（人物目录（一）3.3.4，平时在鹿渡）；堡礼拜堂司祭模板 |
| 魔物分布 | 城外：`northern_deserter` 按图 33 到 36（王道沿线）；帝国游骑斥候（战争目录兵种，第 6 周起）；`greyelm_deer` 中立 |
| 采集点 | `node_lotha_silversaddle_galena`（银鞍河方铅银脉，T2，上游河岸） |
| 照明与夜间 | 城门灯与路灯；桥头堡火盆 4；东岸桥头不点灯 |
| 装饰与外观层 | 约 50 件：桥头旗帜 4、关卡栅栏 2、城内货摊 6、路灯 18、军需车 4 等 |
| 任务挂点 | 第三幕第 6 周东线开放；帝国试探（奥莉安娜）；鹿渡之战出发；康拉德的"不得主动交战"之令与密约抄本；第四幕银鞍桥过境 |
| 美术素材 | 建筑：`art_bld_valen_city_bridgehead_keep`、`art_bld_valen_city_silversaddle_bridge`（多拱石桥）；道具：`art_prop_border_toll_hut`、`art_prop_galena_outcrop`；远景：`art_bg_lothar_plain_far`、`art_bg_lothar_plain_mid`、`art_bg_lothar_plain_clouds`（天幕包 `lothar_plain`：堡与桥在乡野，不用城郭剪影） |
| 优先级与里程碑 | P0；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `west_gate` | 西门 | 西 | 到达点 | 图 |
| `bridgehead_keep` | 桥头堡 | 东 | 戍军 | 标 |
| `silversaddle_bridge` | 银鞍桥 | 东缘 | 国界 | 标 |
| `keep_tower` | 堡塔 | 桥头堡顶 | 远望银鞍河与帝国方向 | 望 |

### C6-1 `deer_ford_battle` 鹿渡之战（The Battle of Deer Ford）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，战场（军团）；网格本文设计（第 10.2 节） |
| 幕与区域 | 第三幕第 7 到 8 周；`lotha_realm`；`silversaddle` |
| 尺寸 | 网格 64×40 战场格；HD-2D 场景按 1 战场格 = 8 米渲染为 512×320 地图格（第 10.1 节） |
| 风格包 | `wild_forest`（西岸苍榆林地、清晨雾） |
| 澱度 | 一，存储 1，渲染 1 |
| 等级带 | 33 到 37 |
| 地形与布局 | 银鞍河横穿网格中部（屏幕上方是东岸，帝国来向）；鹿渡在河中段，齐膝深的浅滩宽 8 格；橡盾要塞在西岸鹿渡西北的山丘上；西岸南半是苍榆林地（雾、伏击位），林间空地是百帐营（老弱约 900）；网格西南角是去榆集的林路（撤离点） |
| 出入口与路线 | 战役入口 `deer_ford_battle_call`（C6） |
| 动线与镜头 | T-B；屏幕方向按"部署区在下"：西岸画在下方，罗盘标注东在上 |
| 驻留 NPC | 我方：罗恩与灰烬兵 200 到 300、康拉德与橡盾要塞守军约 900（受令约束）、乌尔萨克与百帐营兽人约 300、卡娅的猎手 60（结盟时）；敌方：奥莉安娜与帝国第七军团前锋约 2400 |
| 魔物分布 | 无（人形兵团） |
| 照明与夜间 | 清晨雾（视野降低，林地伏击加成）；夜袭可选时段火光 |
| 装饰与外观层 | 百帐营帐篷 8（不在战线上）、要塞旗帜 2 |
| 任务挂点 | 六日之内阻止前锋过河；保住百帐营；可选：说服康拉德抗命、夺帝国军旗、与奥莉安娜单挑；`empire_view` |
| 美术素材 | 复用 C6、C7；增 `art_bld_wild_forest_oakshield_fort`（橡盾要塞）、`art_prop_refugee_tent`、`art_prop_ford_stakes` |
| 优先级与里程碑 | P0；M2 |

### C7 `elmfair` 苍榆林地与榆集（Greyelm Weald and Elmfair）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，枢纽 |
| 幕与区域 | 第三到第五幕；`lotha_realm`；`greyelm_weald` |
| 尺寸 | 160×128 |
| 风格包 | `wild_forest`（显式） |
| 澱度 | 一，存储 1，渲染 1 |
| 等级带 | 33 到 38 |
| 地形与布局 | 银鞍河西岸的落叶林带；中央是集镇榆集（兽人移民聚居，木屋与蜂场）；东南林间空地是百帐营（新一波逃难者的帐篷）；西北林中有兽人移民搭起的小祖灵石圈（聆灵之门的"祖灵之地"候选）；东南缘林路通鹿渡 |
| 出入口与路线 | 东南 `to_silversaddle`（区域图：`silversaddle_elmfair`） |
| 动线与镜头 | T-H；入口到榆集广场 20 米；百帐营在东南 40 米 |
| 驻留 NPC | `ursak`（兽人首领，摔跤）、`kaya`（猎手，激进）、`toya_shaman`（灵语者与医）、`tem_apprentice`（学徒、信使）、`harald_imker`（养蜂与鹿皮、蜂蜜酒）；移民与难民模板 |
| 魔物分布 | `forest_boar` 按图 33 到 36（林猪群糟蹋百帐营的菜地）；`northern_deserter` 按图 34 到 38（林中）；`greyelm_deer` 中立；指标动物 `elm_bee_swarm` |
| 采集点 | `node_lotha_greyelm_weald`（苍榆林地，T1） |
| 照明与夜间 | 榆集门灯与路灯；百帐营篝火 4；祖灵石圈一盆火 |
| 装饰与外观层 | 约 35 件：蜂箱 6、帐篷 10（百帐营）、篝火 4、皮架 3、路牌 2、木箱 4、图腾柱 2、长椅 2、路灯 2 |
| 任务挂点 | 第三幕 4.6 东部林地的兽人移民（次级纷争）；鹿渡之战的结盟；聆灵之门（托雅的认可）；百帐营老弱的保护 |
| 美术素材 | 建筑：`art_bld_wild_forest_elmfair_hall`、`art_bld_wild_forest_orc_longhouse`；道具：`art_prop_beehive_log`、`art_prop_refugee_tent`（与 C6-1 共用）、`art_prop_small_ancestor_circle`、`art_prop_totem_pole_small`；远景：`art_bg_wild_forest_far`、`art_bg_wild_forest_mid`、`art_bg_wild_forest_clouds` |
| 优先级与里程碑 | P1；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `elmfair_square` | 榆集广场 | 中 | 到达后的复苏点 | 图 |
| `hundred_tents` | 百帐营 | 东南 | 难民 | 标 |
| `ancestor_circle_small` | 小祖灵石圈 | 西北 | 聆灵之门 | 标 |
| `apiary_glade` | 蜂场林间地 | 北 | 委托 | 无 |

### C8 `blank_steles` 无字碑林（The Field of Blank Steles）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，野外 |
| 幕与区域 | 第三幕第 5 周起到第五幕；`lotha_realm`；`wallenburg` |
| 尺寸 | 128×96 |
| 风格包 | `wild_forest`（显式；碑林以 `looks` 用灰石地） |
| 澱度 | 二，存储 2，渲染 2；碑廊中心局部三（录澱） |
| 等级带 | 32 到 40 |
| 地形与布局 | 北境丘陵西端的谷地，数百块石碑立成林，碑面全被凿平；谷底中心是门市的公共碑廊（千门时代刻着法令、契约与史事）；碑廊一块铺路石凿着门市编号（门址）；斜光（日出与日落前后各一小时）下可拓出残字；东侧谷口是来路，西侧谷尾有一座废弃的守碑人小屋 |
| 出入口与路线 | 东 `to_blank_steles_trail`（区域图：`blank_steles_trail` 到瓦伦堡） |
| 动线与镜头 | T-F；谷口到守碑人小屋旧址的营地 10 米（在谷口）；碑廊中心离入口约 50 米 |
| 驻留 NPC | 乡民模板 2（谷口放羊）；拓碑的学者按第三幕 4.7 随行 |
| 魔物分布 | `northern_elk` 按图 32 到 35（谷地）；`misrecord_wisp` 按图 34 到 38（碑廊，录澱）；`inquisition_guard` 按图 34 到 36（第三幕审判庭巡查，禁止拓碑，可回避）；`grave_robber` 按图 32 到 34（盗碑贼） |
| 采集点 | 无（拓本是任务物） |
| 照明与夜间 | 谷口营火 1；碑林全黑；斜光时段的光照是拓碑的机制（只在日出与日落前后各一小时显出残字） |
| 装饰与外观层 | 石碑以建筑外观批量生成（不计装饰）；装饰：营火 1、守碑人小屋残迹木箱 2、路牌 1；合计 4 |
| 任务挂点 | 第三幕 4.7 王国档案馆与空白纪（拓残字、史料 S13）；行路之门进阶门址（门市石 `ky_gatestone_stele_market`） |
| 美术素材 | 建筑：`art_bld_wild_forest_blank_stele`（凿平的石碑，三种高度）、`art_bld_wild_forest_stele_colonnade`（碑廊）；道具：`art_prop_rubbing_paper`、`art_prop_gate_market_paving`（凿着编号的铺路石）；远景：`art_bg_wild_forest_far`、`art_bg_wild_forest_mid`、`art_bg_wild_forest_clouds` |
| 优先级与里程碑 | P1；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `valley_mouth` | 谷口 | 东 | 到达点、营地 | 图 |
| `stele_forest` | 碑林 | 中 | 拓碑 | 标 |
| `market_colonnade` | 门市碑廊 | 谷底中心 | 门址 | 标 |
| `valley_ridge` | 谷口高台 | 东北 | 远望碑林 | 望 |
| `slant_light_text` | 斜光残字 | 碑廊西壁 | 史料 S13 | 秘 |

### C9 `glass_plain` 荒原中层：玻璃原（The Glass Plain）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，野外 |
| 幕与区域 | 第三幕第 13 周起到第五幕；`ashen_waste`；`ash_middle` |
| 尺寸 | 192×192 |
| 风格包 | `ash_waste`（区域默认；以 `looks` 用玻璃熔面地块） |
| 澱度 | 三，存储 3，渲染 4；门火心局部四 |
| 等级带 | 30 到 35；门火心 38 到 40；红牙斥候丘 38 到 42 |
| 地形与布局 | 门火熔化后冷却的玻璃平原，反光刺眼、无处藏身；中央是门火心（熔面最厚处，一圈门框的熔痕）；西南、东南、东北三角是三座门站残墟的入口（各自通一张门站场景），西门站在灰海边缘（经 C9-1 进入）；西侧与东侧各一处拾门者营地入口；东北角是红牙斥候丘（夜境方向）；南缘是来路，西缘接灰海，北缘渐入外环 |
| 出入口与路线 | 南 `to_waste_rim`（区域图：`rim_to_glass_plain`）；西 `to_ash_sea`（区域图：`glass_plain_ash_sea`）；北 `to_outer_rings`（区域图：`glass_plain_outer_rings`）；三角 `to_gate_station_sw`、`to_gate_station_se`、`to_gate_station_ne`；两侧 `to_gatepicker_camp_w`、`to_gatepicker_camp_e`（门站与营地按第 6 节 C9-2、C9-3 的实例拆分） |
| 动线与镜头 | T-F；南缘到达点旁是霍尔格的灰地营地（10 米）；白天全员轻度 `blind`（反光），夜里反光消失但亡灵更多 |
| 驻留 NPC | `holger`（向导）；`ester_glass`（玻璃原的琢晶匠，季节性） |
| 魔物分布 | `ashfolk` Lv30 到 34（成群，昼夜）；`glass_scorpion` Lv30 到 35；`dianshard_golem` 按图 32 到 35；`waste_ghoul` Lv30 到 34（从 A9 迁来）；`gatefire_ember` 按图 38 到 40（门火心）；异名者 `glass_bride` 玻璃新娘（玻璃下移动）、`late_courier` 迟到的信使（沿路敲门站的门）；首领 `thousand_bone_walker` 千骨行者 36（`dg_gate_stations` 守核，须引到灰海边的沙丘拆散）；红牙斥候丘（第三到第四幕）：`redfang_brute` Lv38 到 42、`wing_demon_scout` Lv38 到 42（从 A9 迁来）；荒原外环魔物潮在门站复原后可能冲毁门站 |
| 采集点 | `node_waste_glass_plain`（玻璃原，T3）；`node_waste_ashlily_field`（灰百合原，T3，北缘） |
| 照明与夜间 | 霍尔格的营火 1；门火心夜里发淡紫光；红牙斥候丘营火；复原的门站门框亮门扉金 |
| 装饰与外观层 | 营火 2、门框熔痕 4（`doorframe` 熔化变体）、路牌 6（门站与营地方向）、红牙旗 2；合计 14 |
| 任务挂点 | 第三幕第 13 周远征（A3-M08）；千骨行者；门站复原（行路之门进阶）；拾门者营地物证；灰暴迷路；第五幕进军线（经本图） |
| 美术素材 | 地面：`art_tile_ash_waste_glass_melt`（玻璃熔面，反光像素）、`art_tile_ash_waste_gatefire_heart`；道具：`art_prop_melted_gateframe_scar`、`art_prop_glass_shard_field`、`art_prop_redfang_scout_banner`；远景：`art_bg_ash_waste_far`、`art_bg_ash_waste_mid`、`art_bg_ash_waste_clouds` |
| 优先级与里程碑 | P0；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `holger_camp` | 霍尔格的营地 | 南缘 | 到达点、营地 | 图 |
| `gatefire_heart` | 门火心 | 中央 | 千骨行者、磷火 | 标 |
| `redfang_scout_hill` | 红牙斥候丘 | 东北 | 夜境方向 | 标 |
| `fused_ridge` | 熔脊 | 中北 | 远望外环与四座门站 | 望 |
| `bride_under_glass` | 玻璃下的影 | 西南 | 玻璃新娘 | 秘 |

### C9-1 `ash_sea` 荒原中层：灰海（The Ash Sea）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，野外 |
| 幕与区域 | 第三到第五幕；`ashen_waste`；`ash_middle` |
| 尺寸 | 160×160 |
| 风格包 | `ash_waste`（区域默认；新增地块"灰丘"，移速乘 0.7） |
| 澱度 | 三，存储 3，渲染 4 |
| 等级带 | 33 到 37 |
| 地形与布局 | 西侧流动的灰色沙丘，陷足减速，灰暴频繁；沙丘每次灰暴后按种子重排一部分（地块层两套预设轮换）；中央有一道"岛一样的背脊"露出沙面（沉灰巨蠕）；北部沙丘中露出半埋的灰村屋顶；东缘接玻璃原 |
| 出入口与路线 | 东 `to_glass_plain`（区域图：`glass_plain_ash_sea`）；西北 `to_gate_station_w`（西门站，在灰海边缘） |
| 动线与镜头 | T-F；入口到风蚀岩下的避风处 9 米（营地）；静灰夜（无灰暴的夜）巨蠕沉睡，可直穿中央 |
| 驻留 NPC | 无 |
| 魔物分布 | `dian_aggregate` 按图 33 到 37；`ash_crawler` Lv33 到 37（只在灰暴之后浮出）；`ash_shade` 按图 33 到 36（只在灰暴中）；首领 `sunken_ash_wyrm` 沉灰巨蠕 37（可绕行） |
| 采集点 | 无 |
| 照明与夜间 | 避风处火盆 1；其余全黑 |
| 装饰与外观层 | 火盆 1、半埋屋顶 4（建筑外观）、路牌 2；合计 3 |
| 任务挂点 | 第三幕慢而稳的路线（绕开玻璃原）；千骨行者的拆散地（灰海边的沙丘）；静灰夜直穿 |
| 美术素材 | 地面：`art_tile_ash_waste_ash_dune`（两套轮换）；道具：`art_prop_wyrm_back_ridge`、`art_prop_buried_roof`；远景：`art_bg_ash_waste_far`、`art_bg_ash_waste_mid`、`art_bg_ash_waste_clouds` |
| 优先级与里程碑 | P1；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `windbreak_rock` | 风蚀岩避风处 | 东缘 | 到达点、营地 | 图 |
| `wyrm_back` | 巨蠕背脊 | 中央 | 首领 | 标 |
| `buried_roofs` | 半埋的灰村屋顶 | 北 | 拾荒 | 标 |
| `still_ash_path` | 静灰夜的直道 | 中央 | 只在静灰夜出现 | 秘 |

### C9-2 `gate_station_ruins` 门站残墟（Gate Station Ruins）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_gate_stations` 的门站部分）；同一模板四个实例 |
| 幕与区域 | 第三幕第 13 周起到第五幕；`ashen_waste`；`ash_middle` |
| 尺寸 | 48×48（每个实例） |
| 风格包 | `ash_waste`（区域默认；以 `looks` 用门铜与门石） |
| 澱度 | 三，存储 3，渲染 4；门框下局部四 |
| 等级带 | 35 到 40（首领残门卫长 38） |
| 地形与布局 | 外场（门站外围的门柱残列，残门卫按门规巡守）；门站大厅（中央一副站立的大门框，基座有门址石的凹位）；侧室（门站值守的屋子，东北站里有停摆的时刻牌）；后场（倒塌的站台，门路的轨痕）。四个实例同一结构、不同朝向与破损：西南站最完整（第一座被复原的门站，残门卫长只在这里），西站半埋在灰海边，东南站顶塌，东北站侧室完好 |
| 出入口与路线 | 南 `to_glass_plain`（各实例回到玻璃原的对应角）；西南站另有门 `gate_link_thirty_seven`（复原后与旧水道第三十七门互通）；复原后四站之间可经行路之门进阶互传 |
| 动线与镜头 | T-D；入口到门站大厅 25 米；大厅本身是首领场与复原场 |
| 驻留 NPC | 无；第四幕回访：门徒会执钥人"哑钟"（`mute_bell`）携一枚无名之钥进入荒原，最后落脚在一座门站 |
| 魔物分布 | `remnant_gateguard` Lv35 到 40（`gateCredential`：玩家独行且有门纹时中立，带兵或同伴未经担保则开战）；`dianshard_golem` 按图 35 到 38；首领 `gate_warden_captain` 残门卫长 38（西南站，只问一句"凭证"） |
| 采集点 | `node_waste_gate_station`（门站残墟，T3 到 T4） |
| 迷宫结构 | 层：地上一层。区：外场、门站大厅、侧室、后场。核：无（`dg_gate_stations` 的核在玻璃原门火心，由千骨行者守）。机关：门不渡兵（`gateCredential`）；复原机关（门纹加门址尘放进基座凹位，门站成为门址，`ky_gatestone_*` 可取）；东北站的停摆时刻牌（拨回即掉出隙落物） |
| 照明与夜间 | 室外昼夜；复原后门框亮门扉金，大厅两盏火盆 |
| 装饰与外观层 | 门柱残列 8（建筑外观）、火盆 2（复原后）、时刻牌 1（东北站）；合计约 3 件装饰 |
| 任务挂点 | 第三幕行路之门进阶（第三处门址）；"门不渡兵"的和平通过；第四幕哑钟线；第五幕门路的补给线 |
| 美术素材 | 建筑：`art_bld_ash_waste_gate_station_hall`（门站大厅，四种破损态）、`art_bld_ash_waste_gate_pillar_row`；道具：`art_prop_standing_great_gateframe`（站立的大门框，复原前后两态）、`art_prop_stopped_time_board`、`art_prop_gatestone_socket` |
| 优先级与里程碑 | P0（西南站）、P1（其余三站）；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `station_yard` | 外场 | 南 | 入口 | 图（每个实例各一） |
| `station_hall` | 门站大厅 | 中 | 复原、首领 | 标（每个实例各一） |
| `time_board_room` | 时刻牌侧室 | 东北站 | 停摆的时刻牌 | 秘 |

### C9-3 `gatepicker_camp` 拾门者营地（Gatepicker Camp，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_gate_stations` 的营地部分）；同一模板两个实例；可选 |
| 幕与区域 | 第三到第五幕；`ashen_waste`；`ash_middle` |
| 尺寸 | 64×64（每个实例） |
| 风格包 | `ash_waste` |
| 澱度 | 三，存储 3，渲染 4 |
| 等级带 | 35 到 40 |
| 地形与布局 | 圣历四世纪教会远征队的营地：一圈腐朽的木栅、成排的帐篷骨架、深挖的探坑（坑底是被撬走门石的空凹位）、账房帐篷（营地账簿记着"运往瑟兰"的车次）；穿旧式教会甲胄的亡灵还在挖 |
| 出入口与路线 | 南 `to_glass_plain`（西营与东营各回玻璃原的对应侧） |
| 动线与镜头 | T-D；入口到账房帐篷 40 米，探坑在中央 |
| 驻留 NPC | `egon_blacknail`（门石商，季节扎营于西营外，活人） |
| 魔物分布 | `gatepicker_dead` Lv35 到 40；拾门者监工（迷宫目录 3.3.1 的专属精英）；异名者 `cross_shovel` 十字铲；无首领 |
| 采集点 | `node_waste_gatepicker_camp`（拾门者营地，T3） |
| 迷宫结构 | 层：地上一层与探坑。区：栅门、帐篷列、探坑、账房帐篷。核：无（营地本身是物证）。机关：探坑底的空凹位与门站的基座同形（遗民靠近时门纹发热） |
| 照明与夜间 | 室外昼夜；亡灵挖坑的提灯（冷光） |
| 装饰与外观层 | 帐篷骨架 8、探坑木架 3、提灯 4；合计 15 |
| 任务挂点 | 真相 T16（拾门远征是挖掘，门石进了瑟兰的召唤大阵）；艾登研究召唤阵的旁证；营地账簿 |
| 美术素材 | 建筑：`art_bld_ash_waste_old_church_camp`（四世纪式样）；道具：`art_prop_dig_pit_frame`、`art_prop_church_armor_relic`、`art_prop_camp_ledger_desk` |
| 优先级与里程碑 | P2；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `camp_gate` | 栅门 | 南 | 入口 | 图（每个实例各一） |
| `dig_pit` | 探坑 | 中 | 空凹位 | 标 |
| `ledger_tent` | 账房帐篷 | 北 | 营地账簿 | 秘 |

### C10 `thousand_gates_ring` 千门都外环（The Outer Rings）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，野外 |
| 幕与区域 | 第三幕第 14 周起到第五幕；`ashen_waste`；`thousand_gates` |
| 尺寸 | 192×192 |
| 风格包 | `ash_waste`（区域默认；以 `looks` 用门框街区） |
| 澱度 | 四，存储 4，渲染 5 |
| 等级带 | 40 到 45 |
| 地形与布局 | 由门连接、彼此隔开的郊区街区群：没有城墙，每个街区四周一圈门框；越往北越密；处处是"这里曾经住满了普通人"的痕迹：晾衣绳、门牌、家书、孩子的涂鸦；西侧是千门书库倒塌的正门；中部散布万户街的入口；东侧是古城货栈（澱化亚龙的窝，核是一片龙蜕）；北缘是通核心的进军线起点，远处主门坑周围的门框群立在天际 |
| 出入口与路线 | 南 `to_glass_plain`（区域图：`glass_plain_outer_rings`）；西 `to_archive`（`outer_rings_archive`）；中 `to_myriad_doors`（`outer_rings_myriad_doors`）；北 `to_core`（区域图：`outer_rings_core`，第五幕） |
| 动线与镜头 | T-F；全区 `sedimentClock`（停留限时）：到达点有阿什留下的一圈护符石，站在圈里不计时 |
| 驻留 NPC | 阿什（第 14 周静灰夜从倒塌的书架之间走出来，之后在书库）；守门残影（书库外） |
| 魔物分布 | `hollow_armor` 空壳甲 Lv40 到 44（精英）；`hollow_wolf` 按图 40 到 42；`ash_elemental` 按图 40 到 42 与 `ashen_knight` 按图 41 到 43（精英）从 A9 迁来；`dian_drake` 澱化亚龙 Lv42 到 44（精英，古城货栈，从 A9 迁来）；`dian_aggregate` 按图 40 到 42；`hearth_widow` 守炉灰妇（中立，碰灶才敌对）；`door_knocker` 叩门童（中立，用门纹替他开门即消散）；巢主 `empty_house_master` 空屋主 44；异名者 `thousand_lamps` 千灯；外环魔物潮 `mtide_waste_ring` |
| 采集点 | `node_waste_outer_ring`（千门都外环，T4） |
| 照明与夜间 | 护符石圈内一盆冷火（阿什的）；千灯亮起时整条街的灯同时亮；其余全黑 |
| 装饰与外观层 | 门框 12（街区边界，`doorframe`）、晾衣绳 6、门牌 8（`ground_mark` 与墙面）、护符石 5（立石）；合计 31（野外上限 15 的例外：外环的叙事物件即关卡，上限放宽到 35） |
| 任务挂点 | 第三幕第 14 周静灰夜与阿什；停留限时；送魂（守炉灰妇、叩门童）；千门都遗物；澱化亚龙的龙蜕核（证据线索） |
| 美术素材 | 地面：`art_tile_ash_waste_ward_street`（门框街区的石路）；建筑：`art_bld_ash_waste_ward_house`（门挨着门的民居）、`art_bld_ash_waste_old_warehouse`（古城货栈）；道具：`art_prop_laundry_line_ash`、`art_prop_door_number_plate`、`art_prop_child_doodle_wall`、`art_prop_ward_stones`；远景：`art_bg_ash_waste_far`、`art_bg_ash_waste_mid`、`art_bg_ash_waste_clouds` |
| 优先级与里程碑 | P0；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `ward_circle` | 护符石圈 | 南缘 | 到达点、不计时 | 图 |
| `laundry_street` | 晾衣街 | 中南 | 送魂 | 标 |
| `old_warehouse` | 古城货栈 | 东 | 澱化亚龙 | 标 |
| `doorplate_square` | 门牌广场 | 中 | 万户街入口群 | 标 |
| `ring_tower_base` | 外环高塔残基 | 中北 | 远望核心 | 望 |
| `knocker_door` | 叩门童的家门 | 西 | 用门纹开门 | 秘 |

### C10-1 `thousand_gates_archive` 千门书库（The Thousand Gates Archive）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，舞台（含 `dg_thousand_archive` 的书库部分） |
| 幕与区域 | 第三幕第 14 周起到第五幕（第五幕天启后活性期与深相首领）；`ashen_waste`；`thousand_gates` |
| 尺寸 | 64×64 |
| 风格包 | `sealed_ruins`（显式；以 `looks` 用倒塌书架与焦墨） |
| 澱度 | 四，存储 4，渲染 5 |
| 等级带 | 40 到 44（活性期深相首领 46） |
| 地形与布局 | 书库区街巷（门挨着门，散落的门牌可拾取，归位后对应的门打开成捷径）；阅览厅（书架倒塌，灰里埋着残卷；阿什在时无敌人；屋顶可远望主门坑与凿碑台）；书库下层（焚卷层，地面墨池，书架会洇出墨）；封存架（活性期，七道封蜡锁着的书架） |
| 出入口与路线 | 南 `to_outer_rings`（`outer_rings_archive`，书库倒塌的正门） |
| 动线与镜头 | T-D；正门到阅览厅 30 米；屋顶经阅览厅北侧的残阶 |
| 驻留 NPC | 阿什（讲述大断绝）；守门残影 |
| 魔物分布 | 门牌响、灰中读者、墨渍爬虫（迷宫目录 3.3.2 的专属魔物）；首领 `doorplate_crone` 叫门的老妇 42（街巷）、`ink_tide` 墨潮 43（焚卷层，守核）、`shelf_sealer` 封书锁 44（活性期，深相首领加 2） |
| 采集点 | 无 |
| 迷宫结构 | 层：地上（街巷、阅览厅、屋顶）与地下（焚卷层、封存架）。区：书库区街巷、阅览厅、屋顶、焚卷层、封存架。核：墨潮所守之核。机关：`sedimentClock`；十二块门牌归位打开捷径；墨池洇墨；七道封蜡（每碎一道掉出一页残行） |
| 照明与夜间 | 室内固定光；阅览厅一盆冷火（阿什在时）；焚卷层只有墨池的暗光 |
| 装饰与外观层 | 倒塌书架 10（建筑外观）、门牌 12（可拾取，逻辑层物件）、冷火 1；装饰合计 1 |
| 任务挂点 | 阿什讲述大断绝（`a3_ash_tells_sundering`）；残响之门（书库铭环）；残影之门（守门残影的应允）；空白纪碎片五（受托时）；屋顶远望（`a3_defaced_stele_found`） |
| 美术素材 | 建筑：`art_bld_sealed_ruins_collapsed_stacks`；道具：`art_prop_ink_pool`、`art_prop_wax_sealed_shelf`、`art_prop_archive_ring`（书库铭环）；远景：`art_bg_ash_waste_far`、`art_bg_ash_waste_mid`、`art_bg_ash_waste_clouds`（屋顶露天段；`sealed_ruins` 没有天幕，按区域风格包） |
| 优先级与里程碑 | P0；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `archive_gate` | 倒塌的正门 | 南 | 入口 | 图 |
| `reading_hall` | 阅览厅 | 中 | 阿什的讲述 | 标 |
| `archive_roof` | 书库屋顶 | 中北 | 远望主门坑 | 望 |
| `burnt_scroll_floor` | 焚卷层 | 地下 | 墨潮 | 秘 |

### C10-2 `myriad_doors_ward` 万户街（Myriad Doors Ward，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_myriad_street`）；可选 |
| 幕与区域 | 第三幕第 14 周后到第五幕；`ashen_waste`；`thousand_gates` |
| 尺寸 | 96×96 |
| 风格包 | `ash_waste`（区域默认；门巷外观） |
| 澱度 | 四，存储 4，渲染 5 |
| 等级带 | 40 到 45 |
| 地形与布局 | 门挨着门的居住区迷宫：门巷（每扇门后是一户人家的"最后一夜"，物件停在当时的位置）；晾衣庭与涂鸦墙；家书屋（一间信差的屋子，十二封没寄出去的信）；水井广场（四面全是门） |
| 出入口与路线 | 南 `to_outer_rings`（`outer_rings_myriad_doors`） |
| 动线与镜头 | T-D；门巷两两相通，万户门石归位后开出短门路（迷宫内捷径） |
| 驻留 NPC | 无 |
| 魔物分布 | 门槛魂、灰偶、空门框（迷宫目录 3.3.4 的专属魔物）；活性期首领倚门之群；平时无首领 |
| 采集点 | 无 |
| 迷宫结构 | 层：地上一层。区：门巷、晾衣庭、家书屋、水井广场。核：无（活性期才有守巷的群体）。机关：`sedimentClock`；万户门石（`ky_gatestone_myriad_street`，门址，迷宫内短门路） |
| 照明与夜间 | 室外昼夜；屋里的灯在玩家推门时亮一瞬（"最后一夜"的回放） |
| 装饰与外观层 | 晾衣绳 6、涂鸦墙 3、信 12（逻辑层物件）、水井 1；合计 10 |
| 任务挂点 | 收藏（门牌、涂鸦、家书）；第五幕送魂；门址 |
| 美术素材 | 建筑：`art_bld_ash_waste_door_alley`（门巷，八种门）；道具：`art_prop_unsent_letters`、`art_prop_last_night_table`（停在当时的饭桌）、`art_prop_square_well_doors` |
| 优先级与里程碑 | P2；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `alley_mouth` | 门巷口 | 南 | 入口 | 图 |
| `laundry_court` | 晾衣庭与涂鸦墙 | 西 | 收藏 | 标 |
| `letter_house` | 家书屋 | 东 | 十二封信 | 标 |
| `well_square` | 水井广场 | 北 | 活性期首领 | 标 |
| `myriad_doorstone` | 万户门石 | 某户门槛 | 门址 | 秘 |

### C11 `reedbridge_battle` 灰烬防线之战（苇桥）（The Ash Line at Reedbridge）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，战场；网格 `act3_ash_line`（军团，第三幕高潮） |
| 幕与区域 | 第三幕第 20 到 21 周；`valen_valley`；`ash_border` |
| 尺寸 | 网格 48×28 战场格；HD-2D 场景按 1 战场格 = 8 米渲染为 384×224 地图格（第 10.1 节） |
| 风格包 | `lothar_plain`（早春融雪，低洼泥泞） |
| 澱度 | 一，存储 1，渲染 1；净化之光落点局部升到二（战后余波） |
| 等级带 | 42 到 45（RTS 英雄下限 45，D-060） |
| 地形与布局 | 灰溪横穿网格中部（融雪水深及胸），中央是苇桥（四格宽的石桥），上下游各一处浅滩；玩家守东岸（苇桥村一侧，田地升向东北丘陵），圣战军自西南岸来；网格屏幕方向按"部署区在下"旋转 180 度绘制（东岸画在下方），罗盘标注真实方位 |
| 出入口与路线 | 战役入口 `reedbridge_battle_call`（B7） |
| 动线与镜头 | T-B；咽喉是桥与两处浅滩；桥头两侧各留 8 格阵地；第二战线（瓦伦堡东面）由将领在战略层结算 |
| 驻留 NPC | 我方按第三幕 7.4（灰烬民兵、罗恩、希雅、门扉商会佣兵、遗民斥候与门守、百帐营、瓦伦堡援军、赤鬃佣兵团、北境援军）；敌方圣战军约 6200 与勇者团、大主教与曙光圣柱；第三方萨莎残部（东北丘陵） |
| 魔物分布 | 无（人形兵团） |
| 照明与夜间 | 第一日夜袭时段只有我方营火；第二日黄昏"净化之光"是全场最亮的光（神光白金，保留色） |
| 装饰与外观层 | 东岸营地火盆 4、拒马 6（不在桥面）、补给车 3 |
| 任务挂点 | 第三幕高潮：五阶段与三条胜利路线；誓光之门；`archbishop_fate`、`church_verdict_3`、`lothar_ending` |
| 美术素材 | 复用 B7；增 `art_prop_dawnpillar_relic`（曙光圣柱，神光特效另见特效目录）、`art_prop_siege_catapult` |
| 优先级与里程碑 | P0；M2 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `bridgehead` | 东岸桥头堡 | 东岸桥头 | 灰烬防线守住时的落点（`cut_a3_ashen_line`） | 无 |
| `stone_bridge` | 石桥 | 中 | 防线的主战线 | 无 |
| `ne_hills` | 东北丘陵 | 东北 | 侧翼与援军出现处 | 无 |

## 7. 第四幕：D 系列（诸国要地）

第四幕起跨区域行进走世界图（[`world_map.md`](world_map.md) 第 2.3 节）；D 系列地块是世界图上各省的落脚点，到达点统一叫 `world_arrival`（城门或驿站），离开时打开世界图。
各国城市的地表生态等级低（图鉴 1 到 19），第四幕的战斗经验主要来自迷宫、热点与战场；城外委托的刷新点按本图等级带定级。

### D1 `grantis` 格兰提斯（帝都与皇宫）（Grantis）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，枢纽 |
| 幕与区域 | 第四到第五幕；`grantia`；`grantis` |
| 尺寸 | 192×192 |
| 风格包 | `grantia_ochre`（区域默认） |
| 澱度 | 一，存储 1，渲染 1（帝国腹地反而干净：神迹少） |
| 等级带 | 城外委托 45 到 50 |
| 地形与布局 | 格兰河自北向南穿城；河东是皇城（皇宫居北，宫内深处是无冠厅），河西是市井与军营区（第三军团的营地，营地地下有一座不该存在的瓦尔妲祭坛，满墙刻着战死者的名字）；城东北角的钟塔顶是剑帝的私人星象台；南门外是千穗平原的麦田与田埂；西门外是帝国大道（西衡堡方向）；南城码头接格兰河航运 |
| 出入口与路线 | 西门、南门、东门 `world_arrival` 系（世界图）；皇宫 `to_crownless_hall`（`grantis_palace`，剑帝的请柬后）；南门外 `to_redgravel_road`（区域图，本文落定的 `grantis_redgravel_road`，4 日，到 D1-2 红砾城地下斗场） |
| 动线与镜头 | T-H；南门进城，御道北上直达宫前；主街房子排街北 |
| 驻留 NPC | `emperor`（剑帝雷欧哈特三世）、`ithelyn`（皇女）、`lucian_albrecht`（宰相）、`balthazar_krenn`（元帅）；第三军团长伊沃·拉达与皇女的参谋约斯特·温特（人物目录（二）2.4）；帝国街市模板 |
| 魔物分布 | 城外田埂：`locust_swarm` 按图 45 到 47（千穗平原东部）、`rampart_deserter` 按图 45 到 48（村庄与林地）、`moor_wild_horse` 中立 |
| 采集点 | `node_grantia_plain_margins`（千穗田埂，T1）；`node_grantia_gran_sturgeon`（格兰河鲟湾，T3，南城码头下游） |
| 照明与夜间 | 帝都路灯网；皇城城墙火盆；军营营火 |
| 装饰与外观层 | 约 70 件：军旗、兵器架、马槽、市集货摊、御道路灯 |
| 任务挂点 | 强者之宴（建国事件链第 7 步的请柬）、瓦尔妲的招揽（军营地下祭坛）、剑帝的秘密星象台（星律互证）、借道（会盟关键）、第五幕东线（剑帝亲征时） |
| 美术素材 | 建筑：`art_bld_grantia_ochre_palace`、`art_bld_grantia_ochre_legion_camp`、`art_bld_grantia_ochre_clocktower_observatory`；道具：`art_prop_valda_hidden_altar`（满墙名字的祭坛）、`art_prop_imperial_banner`；远景：`art_bg_grantia_ochre_far`、`art_bg_grantia_ochre_mid`、`art_bg_grantia_ochre_clouds` |
| 优先级与里程碑 | P0；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `world_arrival` | 南门 | 南 | 到达点 | 图 |
| `imperial_palace` | 皇宫 | 北 | 强者之宴入口 | 标 |
| `legion_camp` | 第三军团营地 | 河西 | 军营 | 标 |
| `valda_altar` | 军营地下的祭坛 | 营地地下 | 瓦尔妲的招揽 | 秘 |
| `emperor_observatory` | 钟塔星象台 | 东北 | 星律 | 望 |

### D1-1 `crownless_hall` 无冠厅（The Crownless Hall）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，舞台 |
| 幕与区域 | 第四到第五幕；`grantia`；`grantis` |
| 尺寸 | 32×24 |
| 风格包 | `grantia_ochre`（室内） |
| 澱度 | 一，存储 1，渲染 1 |
| 等级带 | 无常驻；更强者的可挑战段 `trial_emperor_hook`（剑帝） |
| 地形与布局 | 长厅，北端是一座空的王座台（没有王冠，也没有王座，只有台）；长桌两侧按强者之宴的座次排开；东墙一排铁钩挂着历代来客的座签；厅中央留一块空地（一剑问的位置） |
| 出入口与路线 | 南 `to_grantis`（`grantis_palace`） |
| 动线与镜头 | T-S；入口到座位 10 米，到空地 14 米；固定镜头，剧情镜头由过场目录定义 |
| 驻留 NPC | 强者之宴的与会者：`emperor`、`night_queen`、`sasha`（侍立）、`hart`、`elwin` 等（按第四幕 5.2 座次） |
| 魔物分布 | 无 |
| 采集点 | 无 |
| 照明与夜间 | 室内烛台，宴会光；一剑问时只留王座台上一束光 |
| 装饰与外观层 | 长桌 1、椅 12、铁钩座签架 1、烛台 6；合计 20 |
| 任务挂点 | 强者之宴四轮对话、一剑问、可达成的外交结果；`trial_emperor_hook` |
| 美术素材 | 建筑：`art_bld_grantia_ochre_crownless_hall`；道具：`art_prop_empty_dais`、`art_prop_iron_hook_name_tags`、`art_prop_feast_table_long` |
| 优先级与里程碑 | P0；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `long_table` | 长桌 | 厅中 | 强者之宴（`cut_a4_feast`） | 无 |
| `moon_gallery` | 宫外回廊 | 厅外西侧 | 宴间的私谈 | 无 |

### D2 `scriva` 斯克里瓦学城（Scriva）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，枢纽 |
| 幕与区域 | 第四到第五幕；`grantia`；`scriva` |
| 尺寸 | 160×160 |
| 风格包 | `grantia_ochre`（以 `looks` 用学城的灰石与青瓦） |
| 澱度 | 一，存储 1，渲染 1；总院书库周边局部二（录澱） |
| 等级带 | 城内委托 45 到 50 |
| 地形与布局 | 自治学城：中央是学院总院与中庭，中庭立莫伊拉之碑；北是总院书库（无尽书库的入口）；东是旧讲堂区（一座封闭的旧讲堂是澱巢）；西是学生街与书肆；城外近郊是青石矿；屋顶上到处是衔页鸦 |
| 出入口与路线 | `world_arrival`（城门，世界图）；北 `to_endless_stacks`（`scriva_stacks`） |
| 动线与镜头 | T-H；城门到中庭 30 米，中庭到书库 25 米 |
| 驻留 NPC | `helga_thornbrook`（首席大贤者）、`owen_lusk`（首席史官）；会盟书记卢恩·贝克；学院学者与禁学派学者模板 |
| 魔物分布 | 城内委托：`bookmite` 按图 45 到 46、`page_ghost` 按图 45 到 48、`misrecord_wisp` 按图 46 到 48、`quill_crow` 按图 45 到 46；巢主 `old_lecture_echo` 旧讲堂的回音 按图 50；异名者 `first_page` 第一页 |
| 采集点 | `node_grantia_scriva_lapis`（学城青石矿，T3） |
| 照明与夜间 | 书院窗光与路灯；书库入口一对灯 |
| 装饰与外观层 | 约 50 件：书肆货摊、长椅、路灯、讲台、钟架 |
| 任务挂点 | 莫伊拉的第一次见面（第四幕 6.5，中庭碑前）；莫伊拉揭开同构的触发（D2-1）；禁书库（`dg_skriva_vault`）；识才之门进阶；第五幕学院学者（节点六守将）的出处 |
| 美术素材 | 建筑：`art_bld_grantia_ochre_academy_hall`、`art_bld_grantia_ochre_old_lecture_hall`；道具：`art_prop_moira_stele`（莫伊拉之碑）、`art_prop_book_stall`；远景：`art_bg_grantia_ochre_far`、`art_bg_grantia_ochre_mid`、`art_bg_grantia_ochre_clouds` |
| 优先级与里程碑 | P0；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `world_arrival` | 城门 | 南 | 到达点 | 图 |
| `academy_court` | 中庭与莫伊拉之碑 | 中 | 第一次见面 | 标 |
| `stacks_gate` | 总院书库门 | 北 | 进 D2-1 | 无 |
| `old_lecture_hall` | 旧讲堂 | 东 | 巢主 | 标 |

### D2-1 `endless_stacks` 无尽书库与空白层（The Endless Stacks）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，舞台（含 `dg_skriva_vault` 斯克里瓦禁书库，迷宫段可选；空白层必经） |
| 幕与区域 | 第四到第五幕；`grantia`；`scriva` |
| 尺寸 | 48×64（纵向三段） |
| 风格包 | `sealed_ruins`（显式；以 `looks` 用书架与录墨）；空白层以 `looks` 用纯白地面（与 `divine_court` 同色） |
| 澱度 | 一，存储 1，渲染 1；禁书库三层局部三（录澱） |
| 等级带 | 禁书库 46 到 50（首领 47、48、50） |
| 地形与布局 | 北段开架层（学者往来，安全）；中段禁书库三层（星禁之后的封存，`dg_skriva_vault`）；南段最底层空白层（没有书架，只有一张长桌）。镜头向下层推进时用"俯视"预设 |
| 出入口与路线 | 北 `to_scriva`（`scriva_stacks`） |
| 动线与镜头 | T-D（禁书库）与 T-S（空白层）；开架层到空白层的必经路线绕开禁书库（一条螺旋梯），禁书库从螺旋梯中段的封门进入 |
| 驻留 NPC | 学城书库员模板；莫伊拉（空白层，第四幕 7.2）；背星表的遗民孩子（禁书库的非战斗解） |
| 魔物分布 | 禁书库：`catalog_moth` 目录蛾 46 到 48、`censor_stamp` 审查章 47 到 49、`greyrobe_shade` 灰袍学徒影 49（精英）；首领 `index_hound` 检目犬 47、`greyrobe_marginalia` 页边低语 48、`star_ledger_warden` 星簿守 50（守核） |
| 采集点 | 无 |
| 迷宫结构 | 层：开架层、禁书库三层、空白层。区：开架阅览、螺旋梯、禁一（目录廊）、禁二（批注室）、禁三（星台室）、空白层。核：星簿守所守之核。机关：`pageBlind`（检目犬看不见无页的玩家）；`annotate`；星台七座须转到正确次序（背星表为非战斗解）；灰袍的九条批注收集 |
| 照明与夜间 | 室内固定光；空白层是均匀的白光 |
| 装饰与外观层 | 书架以建筑外观生成；装饰：阅览灯 4、长桌 1（空白层）、星台 7；合计 12 |
| 任务挂点 | 莫伊拉揭开同构（空白层，"你在边石镇做的事"）；以空白纪记录换玩家的故事（7.3）；禁书库三事迹 |
| 美术素材 | 建筑：`art_bld_sealed_ruins_endless_shelves`、`art_bld_sealed_ruins_spiral_stair`；道具：`art_prop_star_platform`、`art_prop_blank_floor_long_table`、`art_prop_censor_stamp_giant` |
| 优先级与里程碑 | P0（空白层）、P2（禁书库）；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `open_stacks` | 开架层 | 北 | 入口 | 图 |
| `forbidden_stacks` | 禁书库 | 中 | 迷宫 | 标 |
| `star_platform_room` | 星台室 | 禁书库最深 | 守核 | 无 |
| `blank_layer` | 空白层 | 南 | 莫伊拉 | 标 |
| `book_ladder` | 最底层的书梯 | 开架层最底处 | 莫伊拉的版本（`cut_a4_versions`） | 无 |
| `stair_spiral` | 螺旋楼梯 | 空白层与开架层之间 | 空白层的尾声（`cut_a4_isomorphism`） | 无 |
| `rewrite_stacks` | 改写的书库 | 本图的变体外观（书架上是玩家走过的场景） | 改写终章（`cut_a6_final_battles`） | 无 |

### D3 `goldbay` 金湾（金秤广场与交易所）（Goldbay）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，枢纽 |
| 幕与区域 | 第四到第五幕；`mercato`；`goldbay` |
| 尺寸 | 192×160 |
| 风格包 | `mercato_coast`（区域默认） |
| 澱度 | 一，存储 1，渲染 1；盐沼排水口局部二（契澱顺水沉到湾里） |
| 等级带 | 城外委托 45 到 50 |
| 地形与布局 | 海湾环抱的商都：中央金秤广场（交易所、梅尔卡大神殿、梅尔卡之碑）；北是商馆街（金冠商行）；东是港口与金潮航线码头（深潜船停在东码头）；西南是盐沼与排水口；湾外海崖下是退潮时露出的沉船湾入口；城郊有一家倒闭的银号 |
| 出入口与路线 | `world_arrival`（城门与码头，世界图）；神殿地下 `to_deep_ledger_vault`（`goldbay_vault`，深账库之夜后）；海崖 `to_wreck_bay`（本文落定的 `goldbay_wreck_bay`，退潮时，到 D3-2）；东码头 `to_abyss_dive`（区域图，本文落定的 `goldbay_deep_dive`，深潜船 3 日，到 D3-3，第五幕） |
| 动线与镜头 | T-H；城门到金秤广场 30 米 |
| 驻留 NPC | `hart`（金冠哈特）、`bobby_lind`（契约书记）、`rosette_threeleaf`（大账房）、`florin_caspari`（同盟议长）、`emilio_falco`（金秤军团长）、`marin_oster`（灰帆团长） |
| 魔物分布 | 城外委托：`scalepan_crab` 按图 45 到 46（外滩）、`counterfeit_beetle` 按图 45 到 47（作坊区）、`ledger_moth` 按图 45 到 46（账房）、`purse_mouse` 按图 45 到 46（仓库地下）、`debt_bruiser` 按图 46 到 48、`wrecker` 按图 46 到 48（海崖）、`goldgulp_toad` 按图 48（精英，盐沼）；异名者 `old_scale` 老秤、`fat_goldbay` 金湾胖子、`the_clerk` 账房先生；巢主 `counting_house_hoard` 账房宝窟 按图 50（倒闭的银号） |
| 采集点 | `node_mercato_goldbay_reef`（金湾礁，T2） |
| 照明与夜间 | 港口灯塔与码头灯；交易所彻夜灯火 |
| 装饰与外观层 | 约 70 件：秤、货箱、缆桩、船帆、商馆招牌（纹章，不写字） |
| 任务挂点 | 金湾之围（经济战，第四幕 8.1）、金湾挤兑（交易所的物流小游戏）、深账库之夜（8.5）、梅尔卡的招揽（6.3）、波比·林德与魂契 |
| 美术素材 | 建筑：`art_bld_mercato_coast_exchange`、`art_bld_mercato_coast_merca_temple`、`art_bld_mercato_coast_merchant_hall`；道具：`art_prop_merca_stele`、`art_prop_great_scale`、`art_prop_deep_dive_boat`；远景：`art_bg_mercato_coast_far`、`art_bg_mercato_coast_mid`、`art_bg_mercato_coast_clouds` |
| 优先级与里程碑 | P0；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `world_arrival` | 城门 | 北 | 到达点 | 图 |
| `goldscale_square` | 金秤广场与交易所 | 中 | 挤兑 | 标 |
| `merca_temple` | 梅尔卡大神殿 | 广场北 | 深账库入口 | 标 |
| `east_docks` | 东码头 | 东 | 深潜船 | 无 |
| `lighthouse` | 港口灯塔 | 东南 | 远望海湾与沉船湾 | 望 |
| `failed_bank` | 倒闭的银号 | 城郊 | 巢主 | 秘 |
| `tea_stall` | 金秤广场的茶摊 | 金秤广场西角 | 梅尔卡的版本（`cut_a4_versions`） | 无 |

### D3-1 `deep_ledger_vault` 深账库（The Deep Ledger Vault）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，舞台 |
| 幕与区域 | 第四到第五幕；`mercato`；`goldbay` |
| 尺寸 | 48×48 |
| 风格包 | `sealed_ruins`（显式；以 `looks` 用金纹石与铜门） |
| 澱度 | 一，存储 1，渲染 1；账册厅局部二（契澱） |
| 等级带 | 48 到 52 |
| 地形与布局 | 梅尔卡大神殿地下：铜门廊、账册厅（一本一人高的总账，抵押人一栏写着"无（自持）"）、七龛室（七个钥龛，深账库之夜后四个空了）、看守的密道（门徒会潜入的路线，墙上有新撬的痕迹） |
| 出入口与路线 | 北 `to_goldbay`（`goldbay_vault`） |
| 动线与镜头 | T-D；铜门到七龛室 30 米 |
| 驻留 NPC | 神殿账房看守（模板）；梅尔卡（经硬币，6.3 拆穿谎言） |
| 魔物分布 | `chest_mimic` 宝箱怪 按图 48 到 50；`breach_imp` 违约小鬼 按图 48 到 50（违约者的账页上爬出来）；神殿守卫（金秤军团兵种） |
| 采集点 | 无 |
| 照明与夜间 | 室内金色灯火；七龛室每龛一盏 |
| 装饰与外观层 | 账册台 1、钥龛 7、铜灯 8；合计 16 |
| 任务挂点 | 深账库之夜后的追查（三条线索）；供词（E24）；门钥的去向抉择 |
| 美术素材 | 建筑：`art_bld_sealed_ruins_gilded_vault`；道具：`art_prop_great_ledger`、`art_prop_seven_key_niches`、`art_prop_pried_wall` |
| 优先级与里程碑 | P0；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `copper_gallery` | 铜门廊 | 北 | 入口 | 图 |
| `ledger_hall` | 账册厅 | 中 | 总账 | 标 |
| `seven_niches` | 七龛室 | 南 | 门钥 | 标 |
| `cult_passage` | 门徒会的密道 | 西 | 线索 | 秘 |

### D4 `ringwood_court` 环木议庭（Ringwood Court）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，枢纽 |
| 幕与区域 | 第四到第五幕；`silva`；`ringwood` |
| 尺寸 | 160×160 |
| 风格包 | `silva_canopy`（区域默认） |
| 澱度 | 一，存储 1，渲染 1 |
| 等级带 | 林中委托 45 到 50 |
| 地形与布局 | 一圈环形生长的巨树围成议庭（氏族议会的会场在环心的林地上）；巨树上是树屋聚落与林冠桥；南面是银苔聚落与林蚕园；林中无路，进出靠精灵向导；北面的回泉路通世界树（区域图） |
| 出入口与路线 | `world_arrival`（林缘的引路石，世界图，须精灵向导或首座许可）；北 `to_wellspring_path`（区域图：`wellspring_path`，40 公里，到世界树）；西南 `to_withered_ring`（区域图，本文落定的 `ringwood_withered_path`，3 日，到 D4-2，第五幕） |
| 动线与镜头 | T-H；引路石到议庭环心 35 米，林冠桥是第二层动线（俯视预设时可见） |
| 驻留 NPC | `elwin`（长老）、`caranis_greenstring`（首座）、`nassia_dawndew`（灵泉守）、`iolan_mistleaf`（雾叶使者）；闭关派长老奥瑟兰；精灵守护者模板 |
| 魔物分布 | 林中委托：`canopy_deer` 中立；`silk_moth` 按图 45 到 46；`moon_owl` 按图 45 到 47（夜）；`mistvale_bear` 按图 46 到 48；`overgrowth_vine` 按图 46 到 48；异名者 `the_gardener` 园丁 |
| 采集点 | `node_silva_forestsilk_grove`（林蚕园，T4）；`node_silva_mistlake`（雾湖，T3） |
| 照明与夜间 | 银灯（冷白偏暖，不用澱色）；林冠桥的挂灯 |
| 装饰与外观层 | 约 45 件：银灯、藤帘、祭坛石、林冠桥栏 |
| 任务挂点 | 森林的秘密（第四幕 8.3：林中烟、氏族议会、长老的三个考验、引渡、收场）；希尔薇的招揽（6.4）；艾尔温的证言（私证与公证） |
| 美术素材 | 建筑：`art_bld_silva_canopy_ring_trees`（环木）、`art_bld_silva_canopy_tree_house`、`art_bld_silva_canopy_canopy_bridge`；道具：`art_prop_guide_stone`、`art_prop_silver_lamp`；远景：`art_bg_silva_canopy_far`、`art_bg_silva_canopy_mid`、`art_bg_silva_canopy_clouds` |
| 优先级与里程碑 | P0；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `world_arrival` | 林缘引路石 | 南 | 到达点 | 图 |
| `council_ring` | 议庭环心 | 中 | 氏族议会 | 标 |
| `silvermoss_hamlet` | 银苔聚落 | 南 | 林蚕园 | 标 |
| `canopy_lookout` | 林冠瞭望台 | 东北巨树顶 | 远望世界树树冠 | 望 |

### D4-1 `deeproot_vale` 深根谷（根下庭）（Deeproot Vale and the Rootcourt）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，舞台 |
| 幕与区域 | 第四到第五幕；`silva`；`ringwood` |
| 尺寸 | 96×96 |
| 风格包 | `silva_canopy`（显式；根下的苔石与根桥） |
| 澱度 | 一，存储 1，渲染 1 |
| 等级带 | 被毁路线的袭击事件 48 到 52 |
| 地形与布局 | 世界树根下的隐谷：外圈是巨根垂下形成的幕墙；谷里是遗民隐居数百年的根下庭（根洞屋、门歌石、小田）；德鲁伊的看守棚在谷口。结局三态：公开庇护（精灵守护者驻守）、迁入（人去屋空，留下门歌石）、被毁（审判官焚烧后的焦根与断屋） |
| 出入口与路线 | 北 `to_world_tree`（`rootcourt_path`，秘密小径，森林的秘密第 1 步后） |
| 动线与镜头 | T-S；谷口到根下庭中心 30 米 |
| 驻留 NPC | 遗民模板约 30 人与长者；门歌者塔维（第四幕门务官的出处）；德鲁伊模板 |
| 魔物分布 | 平时无；被毁路线：审判庭卫队 `inquisition_guard` 按图 48 到 52 与审判官（战争目录兵种） |
| 采集点 | 无 |
| 照明与夜间 | 根洞屋的油灯；门歌石夜里微亮门扉金 |
| 装饰与外观层 | 门歌石 1、小田栅 4、根洞屋门灯 8；被毁态换为焦根外观组 |
| 任务挂点 | 森林的秘密（遗民的门歌、长老的考验、引渡、`refuge_state`）；希尔薇的兽来到玩家面前 |
| 美术素材 | 建筑：`art_bld_silva_canopy_root_dwelling`（完好与焚毁两态）；道具：`art_prop_door_song_stone`、`art_prop_root_curtain` |
| 优先级与里程碑 | P0；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `vale_mouth` | 谷口看守棚 | 北 | 入口 | 图 |
| `rootcourt` | 根下庭 | 中 | 遗民 | 标 |
| `door_song_stone` | 门歌石 | 根下庭中央 | 门歌 | 秘 |

### D5 `windfang_rock` 风牙岩（兽王台）（Windfang Rock）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，枢纽 |
| 幕与区域 | 第四到第五幕；`windfang`；`windfang_rock` |
| 尺寸 | 160×160 |
| 风格包 | `windfang_steppe`（区域默认） |
| 澱度 | 一，存储 1，渲染 1 |
| 等级带 | 草原委托 48 到 53 |
| 地形与布局 | 草原上拔起的巨岩风牙岩居中，岩顶是兽王台（会盟与继位的石台）；岩脚四周是诸部的季节营地（长角部、岩掌部、灰鬃部、赤尾部各一片毡帐）；岩东南是祖灵石（第五幕节点四，本文落定的坐落）；岩西北的坡下是祖灵冢的入口；季河从北边流过 |
| 出入口与路线 | `world_arrival`（毡路口，世界图）；西北 `to_ancestor_barrow`（本文落定的 `windfang_barrow_steps`，到 D5-1）；战役入口 `windfang_rock_battle_call`（D5-2，兽王之争的血战分支）；门 `ring_ancestor_stone`（第五幕） |
| 动线与镜头 | T-H；毡路口到各部营地 30 到 50 米；兽王台的岩阶在南面（镜头一侧） |
| 驻留 NPC | `tolle_oldhorn`（代兽王，第四幕开场病逝）、`nitira_moonhorn`（长角部大萨满）、`ursa_stonebreaker`（岩掌部酋长与战首）、`lokan_greyspine`、`tiss_whitetail`、`kasha_silent`（风牙猎团长）；`shiya`（希雅调停路线） |
| 魔物分布 | 草原委托：`wild_hornbeast` 按图 48 到 50、`steppe_horse` 中立、`windfang_eagle` 按图 48 到 49、`locust_swarm` 按图 48 到 50、`bloodhorn_bull` 按图 50 到 52、`steppe_raider` 按图 49 到 52；异名者 `whitehorn` 白角、`thousand_mouths` 千口 |
| 采集点 | `node_windfang_sage_heights`（风鬃高坡，T4）；`node_windfang_season_river`（季河，T1）；`node_windfang_windseed_steppe`（风籽草场，T1） |
| 照明与夜间 | 各部篝火；兽王台顶一盆长明火 |
| 装饰与外观层 | 约 50 件：毡帐、图腾柱、马桩、皮鼓、风铃 |
| 任务挂点 | 兽王之争（第四幕 8.4：两种牙、战首的夸口、狼族的旧约、希雅的抉择、萨莎、收场）；`beast_king`；第五幕众门环节点四 |
| 美术素材 | 建筑：`art_bld_windfang_steppe_yurt_clan`（四部配色）、`art_bld_windfang_steppe_beast_king_dais`；道具：`art_prop_ancestor_stone`（祖灵石）、`art_prop_totem_pole_tall`；远景：`art_bg_windfang_steppe_far`、`art_bg_windfang_steppe_mid`、`art_bg_windfang_steppe_clouds` |
| 优先级与里程碑 | P0；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `world_arrival` | 毡路口 | 南 | 到达点 | 图 |
| `beast_king_dais` | 兽王台 | 岩顶 | 继位 | 标 |
| `clan_camps` | 诸部营地 | 岩脚四周 | 部族 | 标 |
| `ancestor_stone` | 祖灵石 | 东南 | 第五幕节点四 | 标 |
| `rock_summit` | 风牙岩顶 | 岩顶北缘 | 远望草原 | 望 |

### D6 `seven_seats` 七席石（眠鳞会盟）（The Seven Seats）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，舞台 |
| 幕与区域 | 第四到第五幕；`sleepscale`；`vaulttouch` |
| 尺寸 | 96×96 |
| 风格包 | `sleepscale_snow`（区域默认） |
| 澱度 | 一，存储 1，渲染 1（原龙所在几乎不积澱） |
| 等级带 | 登山路 53 到 55 |
| 地形与布局 | 触穹峰顶第七碑下：七座千门时代的议事石座围成半环，面向峰顶的第七碑（眠鳞碑）；南面是登山路的最后一段（终盘）；西坡下是观穹台（隐修者的石屋，星眼石穴在台下）；东坡远处是银巢的外缘（原龙艾斯卡的居所，不进入） |
| 出入口与路线 | `world_arrival`（登山路口，世界图）；北坡 `to_fallen_hero_tomb`（区域图，本文落定的 `vaulttouch_north_descent`，2 日，到 D6-1，第五幕）；门 `ring_sleepscale_foot`（第五幕） |
| 动线与镜头 | T-S；登山路口到石座半环 40 米；七席面南（镜头一侧） |
| 驻留 NPC | `eska`（原龙艾斯卡，只在剧情与 `trial_eska_silver_eyrie` 出现）；观穹台的隐修者模板；会盟时的七方代表（第四幕 9.3） |
| 魔物分布 | 登山路：`snow_ibex` 中立；`vault_vulture` 按图 53 到 54；`scaleborn_lizard` 按图 53 到 55；`glacier_bear` 按图 54 到 55 |
| 采集点 | `node_sleepscale_vaultpeak`（触穹峰顶，T6，第五幕起）；`node_sleepscale_star_eye`（星眼石穴，T5）；`node_sleepscale_vaultfall`（落铁坡，T5） |
| 照明与夜间 | 极高处的星空；观穹台一盏灯；会盟夜的火盆七座 |
| 装饰与外观层 | 石座 7（建筑外观）、风绳 6、火盆 7（会盟）、冰柱 4；合计 17 |
| 任务挂点 | 七国会盟（第四幕 9：召集、座次、议题、底线、联盟构成）；第五幕眠鳞碑下节点（`eska_consent`）；银巢之静（`trial_eska_silver_eyrie`） |
| 美术素材 | 建筑：`art_bld_sleepscale_snow_seven_seats`、`art_bld_sleepscale_snow_vault_observatory`；道具：`art_prop_seventh_stele`（眠鳞碑）、`art_prop_wind_cords`；远景：`art_bg_sleepscale_snow_far`、`art_bg_sleepscale_snow_mid`、`art_bg_sleepscale_snow_clouds` |
| 优先级与里程碑 | P0；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `world_arrival` | 登山路口 | 南 | 到达点 | 图 |
| `seven_seats_ring` | 七席石座 | 中北 | 会盟 | 标 |
| `vault_observatory` | 观穹台 | 西坡 | 隐修者 | 标 |
| `summit_edge` | 峰顶边缘 | 北 | 远望云海与银巢 | 望 |
| `summit_camp` | 云阶道营地 | 南缘，云阶道上来的山肩 | 会盟各国的营地（`cut_a4_conclave`） | 无 |
| `silver_nest` | 银巢 | 峰顶以北的冰崖 | 原龙的巢（`cut_a5_eska`） | 无 |

### D7 `seran` 瑟兰（白冕大圣堂与碑庭）（Seran，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，枢纽；可选（异端之国只能潜入） |
| 幕与区域 | 第四到第五幕；`holy_see`；`seran` |
| 尺寸 | 192×160 |
| 风格包 | `holy_see_white`（区域默认） |
| 澱度 | 一，存储 1，渲染 1（地表）；大圣堂下方局部三（地下的千年神迹之澱外渗） |
| 等级带 | 城内巡查 45 到 54 |
| 地形与布局 | 圣都：北是白冕大圣堂（全城最高，钟楼群）与碑庭（艾琉恩之碑）；东是勇者院（召唤大阵在院内，后院花坛边石是初阵残石）；西是审判庭与静钟堡（禁书库：审判庭的神谕档案）；南是朝圣者的长街与客舍；城外是白石丘陵与橄榄林 |
| 出入口与路线 | `world_arrival`（朝圣者城门，世界图；异端之国诏下须潜入：灰鼠的骨货船、赛琳给的巡查路线或影之门）；大圣堂地下 `to_martyrlight_catacombs`（`seran_catacombs`） |
| 动线与镜头 | T-H；朝圣长街自南向北通大圣堂，房子排街北 |
| 驻留 NPC | `seraphin_iv`（教皇）、`matthias_clowen`（大审判长）、`viola_rosen`（召唤枢机）、`edmond_lacroix`（圣骑士团大团长）；国务枢机奥雷利乌斯·文特；`selene`（绝罚入狱时在审判庭地牢，营救目标） |
| 魔物分布 | 城内：审判庭卫队 `inquisition_guard` 按图 45 到 50（巡查，警戒）；`porcelain_dove` 中立（檐下）；城外：`whitestone_goat` 中立、`lightway_robber` 按图 45 到 47（光径北支） |
| 采集点 | `node_holysee_marble_quarry`（白石采石场，T3）；`node_holysee_olive_grove`（橄榄林，T1） |
| 照明与夜间 | 圣灯通明（神光白金只在大圣堂内）；潜入线走灯照不到的后巷 |
| 装饰与外观层 | 约 70 件：圣灯、钟架、朝圣者推车、圣像、香炉 |
| 任务挂点 | 异端之国（禁书库的神谕原件 E15、赛琳的营救）；勇者院（初阵残石 `ky_gatestone_first_array`，召唤大阵会低鸣）；殉光地下墓的入口 |
| 美术素材 | 建筑：`art_bld_holy_see_white_whitecrown_cathedral`、`art_bld_holy_see_white_hero_academy`、`art_bld_holy_see_white_inquisition_keep`；道具：`art_prop_eluen_stele`、`art_prop_summoning_array_floor`（勇者院内的阵）；远景：`art_bg_holy_see_white_far`、`art_bg_holy_see_white_mid`、`art_bg_holy_see_white_clouds` |
| 优先级与里程碑 | P2；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `world_arrival` | 朝圣者城门 | 南 | 到达点 | 图 |
| `whitecrown_cathedral` | 白冕大圣堂与碑庭 | 北 | 艾琉恩之碑 | 标 |
| `hero_academy` | 勇者院 | 东 | 召唤大阵 | 标 |
| `inquisition_archive` | 审判庭禁书库 | 西 | 神谕档案 | 秘 |
| `academy_garden_stone` | 勇者院后院的花坛边石 | 东 | 初阵残石 | 秘 |
| `white_crown_balcony` | 白冕大圣堂阳台 | 大圣堂正面高处 | 光的诏书宣读（`cut_a4_edict`） | 无 |
| `seran_outskirts` | 瑟兰城外 | 朝圣者城门外的大道 | 出狱一节（`cut_a4_edict`） | 无 |
| `chapel_gate` | 礼拜堂门前 | 碑庭东侧的礼拜堂 | 战争诏书张贴（`cut_a5_confession`） | 无 |

### D7-1 `martyrlight_catacombs` 殉光地下墓（Martyrs' Catacomb，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_martyr_catacomb`）；可选 |
| 幕与区域 | 第四到第五幕（第三幕只闻其名）；`holy_see`；`seran` |
| 尺寸 | 96×96 |
| 风格包 | `sealed_ruins`（显式；以 `looks` 用白瓷骨匣） |
| 澱度 | 四，存储 4，渲染 5；白瓷穹局部五 |
| 等级带 | 45 到 50（迷宫目录现值 40 到 46，与第四幕等级带 45 到 55 不合；本图按 45 到 50 定级，首领 46、48、50，第 13.2 节请求同步） |
| 地形与布局 | 骨货道（巡礼车往荒野运骨的隧道，入口兼撤离路线）；圣骨堂（成排的瓷白骨匣，按"规格"分拣）；暗守哨（活着的圣骑士巡逻点）；殉光廊（历代殉光者的墓龛）；隐：白瓷穹（大圣堂正下方一整片瓷白的结晶穹顶，千年神迹之澱） |
| 出入口与路线 | 北 `to_seran`（`seran_catacombs`）；骨货道东端（撤离，回城外） |
| 动线与镜头 | T-D；潜入为主，警报招来暗守骑士；先到白瓷穹再回暗守哨，可以不打 |
| 驻留 NPC | 暗守骑士（人形精英） |
| 魔物分布 | 瓷犬与匣中圣徒（迷宫专属）、`porcelain_hound` 按图 45 到 47、`saintface_wraith` 按图 46 到 48、`prism_spider` 按图 46 到 48、`crown_wisp` 按图 47 到 49；首领 `porcelain_deacon` 白瓷执事 按图 46（`symmetryJudge`）、`undercroft_warden` 暗守队长 按图 48、`martyr_remnant` 殉光圣者 按图 50（守核，`reliquaryLink`）；异名者 `shadowless` 无影 |
| 采集点 | `node_holysee_ossuary_seep`（殉光墓渗口，T3 到 T4） |
| 迷宫结构 | 层：上层（骨货道、圣骨堂）、中层（暗守哨、殉光廊）、隐（白瓷穹）。区：骨货道、圣骨堂、暗守哨、殉光廊、白瓷穹。核：殉光圣者所守之核。机关：潜入警报（声响与灯）；`symmetryJudge`；`reliquaryLink`（击碎圣骸匣记一次"亵渎"）；"看见"白瓷穹即可让暗守队长放下剑 |
| 照明与夜间 | 室内固定光；圣骨堂的瓷白反光；白瓷穹自发冷白光 |
| 装饰与外观层 | 骨匣架以建筑外观生成；装饰：巡礼车 2、圣灯 6、警铃 3；合计 11 |
| 任务挂点 | 神迹产生澱的直接物证；暗守队长的转变；事迹 |
| 美术素材 | 建筑：`art_bld_sealed_ruins_porcelain_ossuary`、`art_bld_sealed_ruins_porcelain_vault`（白瓷穹）；道具：`art_prop_bone_cart_pilgrim`、`art_prop_reliquary_box`、`art_prop_alarm_bell_small` |
| 优先级与里程碑 | P2；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `bone_cart_tunnel` | 骨货道 | 东 | 入口与撤离 | 图 |
| `ossuary` | 圣骨堂 | 中 | 白瓷执事 | 标 |
| `martyr_gallery` | 殉光廊 | 北 | 守核 | 标 |
| `porcelain_vault` | 白瓷穹 | 大圣堂正下方 | 物证 | 秘 |

### D8 `duskcrown` 黯冠城（Duskcrown）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，枢纽 |
| 幕与区域 | 第四到第五幕；`nightrealm`；`duskcrown` |
| 尺寸 | 192×160 |
| 风格包 | `night_basalt`（区域默认） |
| 澱度 | 二，存储 2，渲染 2 |
| 等级带 | 城外委托 45 到 52 |
| 地形与布局 | 黑岩火山城：北是暗夜王座所在的宫城；中是温泉浴屋与集市；西是夜境黑市（地下，第四幕门钥线索之一，本文落定的坐落）；东是月井（第五幕节点五，本文落定的坐落：宫城东侧一口温泉井，魔族夜饮之地）；城外是灰魔牧场（烟鬃驹）、黑曜熔流与硫磺口 |
| 出入口与路线 | `world_arrival`（城门，世界图）；北 `to_horncrown`（区域图，本文落定的 `duskcrown_horncrown_road`，2 日，到 D8-1）；西 `to_edgetrial`（区域图 `duskcrown_edgetrial_road`，5 日，到 D8-2）；北深 `to_kingwomb`（区域图 `duskcrown_kingwomb_road`，3 日，到 D8-3，第五幕）；门 `ring_moonwell`（第五幕） |
| 动线与镜头 | T-H；城门到宫城 60 米；夜境常年暗，光就是路的原则在这里最重：路灯用暗红灯笼 |
| 驻留 NPC | `night_queen`（夜后维丝佩拉）、`sasha`（侍立）、`bazrai_rediron`（鬼人大诸侯）、`serpetina_scalemother`（蛇人大诸侯）、`kester_higheyrie`（翼魔诸侯）；黑市商人与隶贩模板 |
| 魔物分布 | 城外：`tundra_reindeer` 中立、`blackrock_ibex` 按图 45 到 46、`warg` 按图 46 到 48、`redhorn_crow` 按图 45 到 47、`night_deserter` 按图 46 到 48、`thrall_trader` 按图 47 到 49、`warg_rider_outlaw` 按图 49 到 52 |
| 采集点 | `node_night_basalt_quarry`（黯冠黑石场，T3）；`node_night_obsidian_flow`（黑曜熔流，T3）；`node_night_warmfen`（温泽，T3）；`node_night_sulfur_vent`（硫磺口，T2） |
| 照明与夜间 | 暗红灯笼网；温泉的青白蒸汽光；火山烟下的星空 |
| 装饰与外观层 | 约 65 件：暗红灯笼、角饰、熔岩槽、黑铁门、浴屋木桶 |
| 任务挂点 | 月下之约（强者之宴外交）；夜境黑市（门钥一枚，经夜境渠道）；夜后的问题；第五幕节点五月井（夜后第一个饮） |
| 美术素材 | 建筑：`art_bld_night_basalt_night_throne_palace`、`art_bld_night_basalt_bathhouse`、`art_bld_night_basalt_black_market_cellar`；道具：`art_prop_moonwell`、`art_prop_red_lantern_string`、`art_prop_lava_trough`；远景：`art_bg_night_basalt_far`、`art_bg_night_basalt_mid`、`art_bg_night_basalt_clouds` |
| 优先级与里程碑 | P0；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `world_arrival` | 城门 | 南 | 到达点 | 图 |
| `night_throne_palace` | 暗夜王座宫城 | 北 | 夜后 | 标 |
| `moonwell` | 月井 | 宫城东 | 第五幕节点五 | 标 |
| `night_market` | 夜境黑市 | 西地下 | 门钥线索 | 秘 |
| `volcano_ledge` | 火山肩 | 东北 | 远望夜境冻原 | 望 |
| `war_tents` | 夜境军帐 | 城外火山肩下 | 第五幕战前（`cut_a5_confession`） | 无 |

## 8. 第五幕：E 系列

### E1 `thousand_gates_core` 千门都核心（万门广场）（The Core of the Thousand Gates）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，野外（第五幕唯一的连续地图） |
| 幕与区域 | 第五幕；`ashen_waste`；`thousand_gates` |
| 尺寸 | 192×192 |
| 风格包 | `ash_waste`（区域默认；以 `looks` 用门框林与黑灰） |
| 澱度 | 五，存储 5，渲染 6；坑沿局部临界（古澱湖的风吹上来时） |
| 等级带 | 55 到 60 |
| 地形与布局 | 主门坑四周立满门框的万门广场：南半是外环与核心交界的废街（进军线的终段），北半是一片门框林（成千副门框立在黑灰里，越往坑越密）；正北是坑沿（通 E2）；东侧是千貌兵的集结地，西侧是门徒会引导者的仪式圈；第五幕的营地是联军前哨（南缘） |
| 出入口与路线 | 南 `to_outer_rings`（区域图：`outer_rings_core`）；北 `to_crater`（`core_crater`）；第五幕荒原外缘的"古澱边缘"地点与无貌之王波次迁到本图（第 11 节） |
| 动线与镜头 | T-F；前哨到坑沿约 120 米，途中三道门框林的咽喉；全区 `sedimentClock`，前哨与门环节点的光圈内不计时 |
| 驻留 NPC | 联军前哨的将领与军需模板；门歌者塔维与执钥人队（第五幕节点一） |
| 魔物分布 | `ashtide_vanguard` 灰潮先锋 Lv50 到 56；`faceless_soldier` 千貌兵 Lv52 到 55；`disciple_guide` 门徒会引导者 Lv50 到 52（精英，仪式圈）；`abyss_hound` 渊狼影 Lv50 到 56（坑沿外）；吞澱期出生率乘 0.2，扩张期灰潮溢出（`mtide_waste_ashtide`） |
| 采集点 | 无（坑沿的采集点在 E2） |
| 照明与夜间 | 联军前哨的火盆与门环节点的门扉金光圈；门框林全黑，只有古澱湖的暗光映在天上 |
| 装饰与外观层 | 门框 20（`doorframe`，门框林）、联军前哨火盆 4、军旗 4、补给车 3；合计 31（例外上限 35，同 C10） |
| 任务挂点 | 第五幕进军线；千貌兵与门徒会；众门环节点一的建设；后方战线的战报回传 |
| 美术素材 | 地面：`art_tile_ash_waste_black_ash_core`；道具：`art_prop_gateframe_forest`（门框林，五种高度）、`art_prop_faceless_banner`、`art_prop_coalition_outpost`；远景：`art_bg_ash_waste_far`、`art_bg_ash_waste_mid`、`art_bg_ash_waste_clouds` |
| 优先级与里程碑 | P0；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `coalition_outpost` | 联军前哨 | 南缘 | 到达点、营地 | 图 |
| `gateframe_forest` | 门框林 | 北半 | 咽喉 | 标 |
| `ritual_circle` | 门徒会仪式圈 | 西 | 引导者 | 标 |
| `faceless_muster` | 千貌兵集结地 | 东 | 千貌兵 | 标 |
| `core_rim_edge` | 古澱边缘 | 北缘 | 远望古澱湖 | 望 |

### E2 `main_gate_crater` 主门坑（古澱湖、凿碑台）（The Main Gate Crater）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_main_gate_pit`，终战场；十人团队首领战） |
| 幕与区域 | 第四到第五幕（第四幕只开放坑沿的凿碑台与门框断面：`A4-S01`、`A4-S02`、`A4-M14` 与天启之后的天亮）；`ashen_waste`；`thousand_gates` |
| 尺寸 | 96×96 |
| 风格包 | `ash_waste`（显式；坑底以 `looks` 用古澱湖的黑水） |
| 澱度 | 五，存储 5，渲染 6；古澱湖局部临界（存储 6，渲染 7） |
| 等级带 | 58 到 60（`faceless_king` 按总纲取 60，数据导入时统一） |
| 地形与布局 | 坑沿（首领前平台，号令石在坑沿西侧：急令的引导点）；凿碑台（坑沿东侧的石台，第六座天启碑的碑面被凿毁，凿碑匠的亡灵反复做凿的动作）；螺旋道（沿坑壁下行）；坑底（古澱湖与主门遗址：一副断成两截的巨大门框，剑尖嵌在门框断面上）；首领场（坑底湖心的石台，直径约 40 格，四周三处门石位与七处澱灌锚点）；裂缝（撕门的位置）；门环核心节点（坑沿北侧，六条门路线的起点，门路锁定台） |
| 出入口与路线 | 南 `to_core`（`core_crater`）；战役入口 `ashen_final_battle_call`（E3）；门 `ring_treeroot`、`ring_forgeheart`、`ring_ancestor_stone`、`ring_moonwell`、`ring_old_waterways`、`ring_sleepscale_foot` |
| 动线与镜头 | T-D；坑沿到坑底首领场约 70 米；首领战用拉远的默认镜头（俯角 42 度）以容纳十人；"归乡之梦"阶段场地整体换为序章所选的地球场景（场景外观组切换，逻辑格不变） |
| 驻留 NPC | 门歌者塔维与执钥人；同伴与盟友至多九名（AI） |
| 魔物分布 | `stele_chiseler` 凿碑匠的亡灵 Lv52 到 56（凿碑台）；`abyss_hound` Lv54 到 56（螺旋道）；`disciple_guide` Lv52（澱壳的引导者）；千貌兵援军（按战线结算）；异名者 `stilled_hammer` 停锤者（凿碑台）；首领 `faceless_king` 无貌之王 60 |
| 采集点 | `node_waste_crater_rim`（主门坑沿，T6） |
| 迷宫结构 | 层：坑沿、螺旋道、坑底。区：坑沿平台、号令石、凿碑台、螺旋道、主门遗址、湖心首领场、裂缝、门环核心节点。核：古澱湖（临界，魔王成形之处，非可毁之核）。机关：号令石（急令，引导 5 秒）；门石三块（转阶段"撕门"）；门圈（分摊）；澱灌锚点（数量 = 7 减守住的众门环节点数，神的办法固定为 5）；"归乡之梦"（场地切换与即死门）；最后一扇门（剧情） |
| 照明与夜间 | 室外但无昼夜（澱遮天）；古澱湖的暗紫光；门环核心节点的门扉金；号令石一盆火 |
| 装饰与外观层 | 号令石 1、门路锁定台 1、门石 3（逻辑层物件的外观）、凿碑匠的凿子与碎石 4；合计 9 |
| 任务挂点 | 灰烬决战与无貌之王首领战（五阶段）；救赎、毁灭、终光的抉择；雅努第一次出手；证据 E02（主门剑尖）与 E08（凿碑台拓片）的现场 |
| 美术素材 | 地面：`art_tile_ash_waste_ancient_lake`（古澱湖黑水，临界态）；建筑：`art_bld_ash_waste_main_gate_ruin`（断成两截的巨门框）、`art_bld_ash_waste_chiseled_stele_terrace`；道具：`art_prop_command_stone`、`art_prop_gate_sword_tip`（主门剑尖与光蚀纹）、`art_prop_defaced_sixth_stele`；远景：`art_bg_ash_waste_far`、`art_bg_ash_waste_mid`、`art_bg_ash_waste_clouds` |
| 优先级与里程碑 | P0；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `crater_rim` | 坑沿平台 | 南 | 入口、首领前平台 | 图 |
| `chiseled_stele_terrace` | 凿碑台 | 东 | 第六座碑 | 标 |
| `main_gate_ruin` | 主门遗址 | 坑底北 | 剑尖 | 标 |
| `lake_arena` | 湖心首领场 | 坑底 | 无貌之王 | 无 |
| `ring_core_node` | 门环核心节点 | 坑沿北 | 众门环 | 无 |

### E3 `ashen_final_battle` 灰烬决战（The Ashen Final Battle）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，战场；网格 `act5_final_war`（联军） |
| 幕与区域 | 第五幕（1000 年夏至前后）；`ashen_waste`；`thousand_gates` |
| 尺寸 | 网格 56×32 战场格；HD-2D 场景按 1 战场格 = 8 米渲染为 448×256 地图格（第 10.1 节） |
| 风格包 | `ash_waste` |
| 澱度 | 五，存储 5，渲染 6 |
| 等级带 | 55 到 60（RTS 英雄下限 55，D-060） |
| 地形与布局 | 网格是三条战线的示意战场：北区夜岭关（山口）、东区荒原缘（灰潮来向）、南区瑟兰道；中央是主门坑的外缘。玩家本人只能在主门坑（E2）；本网格用于玩家在战前部署与查看战线、以及不在场战线的可视化结算 |
| 出入口与路线 | 战役入口 `ashen_final_battle_call`（E2） |
| 动线与镜头 | T-B；三条战线各有自己的守点矩形（`hold_north`、`hold_east`、`hold_south`） |
| 驻留 NPC | 各战线的 AI 将领（第五幕 7.2） |
| 魔物分布 | 千貌军、灰潮、圣战联军或教国突击队、夜境诸侯派军团（战争目录兵种） |
| 照明与夜间 | 澱遮天，无昼夜 |
| 装饰与外观层 | 战线无装饰；三处我方营地各火盆 2 |
| 任务挂点 | 战役回合零到五；`held_unaided`；急令；待令 |
| 美术素材 | 复用 E1；增 `art_prop_frontline_marker`（战线旗标，不受画质档影响） |
| 优先级与里程碑 | P0；M3 |

### E4 `world_tree` 世界树与灵泉（The World Tree and the Wellspring）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，野外（清域） |
| 幕与区域 | 第四到第五幕；`silva`；`ringwood` |
| 尺寸 | 160×160 |
| 风格包 | `silva_canopy`（区域默认） |
| 澱度 | 零，存储 0，渲染 0（全大陆最清） |
| 等级带 | 外根 50 到 54（根渊入口外围） |
| 地形与布局 | 世界树居中（树干占 12×12 格，树冠是远景层）；树南是灵泉（希尔薇之碑立在泉边，灵泉莲池）；树北的外根盘结成丘，外根间有根渊的入口；树东的林地是秘密小径的起点（通深根谷）；外族不得近前：南缘是精灵守护者的界线 |
| 出入口与路线 | 南 `to_ringwood`（区域图：`wellspring_path`）；东 `to_deeproot_vale`（`rootcourt_path`）；北 `to_root_abyss`（本文落定的 `worldtree_root_descent`，到 E4-1）；门 `ring_treeroot`（第五幕） |
| 动线与镜头 | T-F；守护者界线到灵泉 30 米，到树根 50 米 |
| 驻留 NPC | `nassia_dawndew`（灵泉守）；精灵守护者模板；希尔薇的兽（半鹿半狼，剧情出现） |
| 魔物分布 | `wellspring_stag` 中立（清域）；外根：`root_grub` Lv50 到 52、`spore_husk` Lv50 到 52（根渊外围） |
| 采集点 | `node_silva_worldtree_fallen`（世界树落枝，T5）；`node_silva_spring_lotus`（灵泉莲池，T5）；`node_silva_worldtree_dew`（世界树凝露，T6，第五到第六幕，一年一次）；`node_silva_wellspring`（灵泉取水处，T4） |
| 照明与夜间 | 灵泉的清光（不是澱色，是暖白）；树冠滤下的光斑 |
| 装饰与外观层 | 落枝 4、泉边石 3、守护者路牌 2、地标树 1（世界树落枝处）；合计 10 |
| 任务挂点 | 森林的秘密（兽来到玩家面前、门钥沉进灵泉的去向）；第五幕节点二（根滤：世界树永久失去一根大枝） |
| 美术素材 | 建筑：`art_bld_silva_canopy_world_tree_trunk`；道具：`art_prop_sylvie_stele`（希尔薇之碑）、`art_prop_wellspring_pool`、`art_prop_great_fallen_branch`；远景：`art_bg_silva_canopy_far`、`art_bg_silva_canopy_mid`、`art_bg_silva_canopy_clouds` |
| 优先级与里程碑 | P0；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `warden_line` | 守护者界线 | 南 | 到达点 | 图 |
| `wellspring` | 灵泉与希尔薇之碑 | 树南 | 碑 | 标 |
| `world_tree_trunk` | 世界树 | 中央 | 节点二 | 标 |
| `outer_roots` | 外根 | 树北 | 根渊入口 | 标 |
| `canopy_gap` | 树冠空隙 | 树干东侧的高根 | 远望整片希尔瓦 | 望 |
| `spring_meadow` | 灵泉下游的春草地 | 灵泉以南的下游 | 希尔薇的版本（`cut_a4_versions`；兽引路，不受"外族不得近前"的限制） | 无 |

### E5 `redanvil` 赤砧山（炉心）（Mount Redanvil）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 地块，枢纽 |
| 幕与区域 | 第四到第五幕；`mercato`；`redanvil` |
| 尺寸 | 160×128 |
| 风格包 | `forge_deep`（显式；以 `looks` 用矮人黑石、火山黑砂与炉铁） |
| 澱度 | 二，存储 2，渲染 2；废矿坑局部三 |
| 等级带 | 山麓委托 50 到 55 |
| 地形与布局 | 矮人山城：城筑在火山坡上，层层石台；最高层是炉主会议厅与契约法庭；中层是工坊街与炉道；山腹是炉心（第五幕节点三，地热锻炉）；东侧山麓是炉渣堆（渣心的巢）；西侧是外矿与明矾坡；山下是废矿坑（深炉秘密倾倒澱渣之处）；北坡下有深炉的古炉区入口 |
| 出入口与路线 | `world_arrival`（山门，世界图）；北 `to_deep_forge`（本文落定的 `redanvil_forge_descent`，到 E5-1）；门 `ring_forgeheart`（第五幕） |
| 动线与镜头 | T-H；山门在南，石台自南向北升高，最高的会议厅在北（目标在北） |
| 驻留 NPC | `gunnhild_deephammer`（炉主）；炉长鲍丁·烬须（节点三主持者）；矮人工匠模板；扫炉人欧塔与医者玛蕾（人物目录（二）） |
| 魔物分布 | `lava_lizard` 按图 50 到 52（火山口与温泉带）；`slag_golem` 按图 52 到 54（精英，炉道两侧）；巢主 `slagheap_heart` 渣心 按图 55（炉渣堆）；废矿坑的魔物（深炉倾倒的澱渣养出来的，图鉴的废坑魔物） |
| 采集点 | `node_mercato_redanvil_copper`（赤砧铜脉，T1 到 T2）；`node_mercato_alum_vent`（明矾坡，T1）；`node_mercato_quicksilver_seep`（灵汞渗，T3）；`node_mercato_firejade_vein`（火玉脉，T4）；`node_mercato_redanvil_slopes`（赤砧南坡，T2）；`node_mercato_stonebloom_cave`（石花窟，T3）；`node_mercato_spoil_pits`（废矿坑，T3） |
| 照明与夜间 | 炉火映红的夜；工坊街的炉灯；炉心的地热光 |
| 装饰与外观层 | 约 60 件：铁砧、炉塔、矿车、风箱、契约石 |
| 任务挂点 | 经济战的凡约（与矮人签一份没有神见证的契约）；深炉的试约；T03 废矿坑的真相；第五幕节点三（炉炼，三百条凡约） |
| 美术素材 | 建筑：`art_bld_forge_deep_dwarf_terrace_city`、`art_bld_forge_deep_forge_tower`、`art_bld_forge_deep_contract_court`；道具：`art_prop_forgeheart_core`（炉心）、`art_prop_slag_heap_large`、`art_prop_contract_stone`；远景：`art_bg_mercato_coast_far`、`art_bg_mercato_coast_mid`、`art_bg_mercato_coast_clouds`（矿口与山腰的露天段；`forge_deep` 没有天幕，按区域风格包，远山层有冒烟的火山） |
| 优先级与里程碑 | P0；M3 |

| 地点 id | 名 | 位置 | 功能 | 发现 |
| --- | --- | --- | --- | --- |
| `world_arrival` | 山门 | 南 | 到达点 | 图 |
| `forge_council` | 炉主会议厅与契约法庭 | 北最高层 | 凡约 | 标 |
| `forgeheart` | 炉心 | 山腹 | 第五幕节点三 | 标 |
| `spoil_pits` | 废矿坑 | 山下 | 澱渣真相 | 秘 |
| `crater_lip` | 火山口沿 | 北坡 | 远望同盟海岸 | 望 |

## 9. 图集补登

图集 67 个条目之外，下列地图在分幕、迷宫目录或本文的布局里必须有落图；按 [`world_map.md`](world_map.md) 第 1.2 节的编号规则补登（子条目继承父编号的字母）。
数据写入 `data/world/atlas_maps.json` 与 `atlas_routes.json` 属数据负责方，作为请求列在第 13.3 节。

### 9.1 补登总表

| 编号 | id | 名称 | 层 | 角色 | 幕 | 区域 | 省份 | 风格包 | 澱度（存储） | 等级段 | 尺寸 | 父图与路线 | 可选 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1-1 | `boundary_cairn_battle` | 界石垒（界石之战 `bat_a4_boundary_war`） | 场景 | 战场 | 四 | `edgestone_area` | `ash_border` | `wild_forest` | 2 | 45 到 48 | 56×36 | A1 战役入口 `boundary_cairn_battle_call` | 否 |
| A5-1 | `rustridge_deep` | 锈岭矿深层 | 场景 | 迷宫 | 三到五 | `edgestone_area` | `ash_border` | `forge_deep` | 3 | 34 到 40 | 64×64 | A5 步 `rustridge_deep_rift`；A2 步 `rustridge_new_shaft`（旧矿被毁时） | 是 |
| C9-4 | `gate_station_ruins_se` | 门站残墟（东南） | 场景 | 迷宫 | 三到五 | `ashen_waste` | `ash_middle` | `ash_waste` | 3 | 35 到 40 | 48×48 | C9 步 `glass_plain_gate_station_se` | 否 |
| C9-5 | `gate_station_ruins_w` | 门站残墟（西） | 场景 | 迷宫 | 三到五 | `ashen_waste` | `ash_middle` | `ash_waste` | 3 | 35 到 40 | 48×48 | C9-1 步 `ash_sea_gate_station_w` | 否 |
| C9-6 | `gate_station_ruins_ne` | 门站残墟（东北） | 场景 | 迷宫 | 三到五 | `ashen_waste` | `ash_middle` | `ash_waste` | 3 | 35 到 40 | 48×48 | C9 步 `glass_plain_gate_station_ne` | 否 |
| C9-7 | `gatepicker_camp_east` | 拾门者营地（东） | 场景 | 迷宫 | 三到五 | `ashen_waste` | `ash_middle` | `ash_waste` | 3 | 35 到 40 | 64×64 | C9 步 `glass_plain_gatepicker_camp_east` | 是 |
| D1-2 | `redgravel_pit` | 红砾城地下斗场 | 场景 | 迷宫 | 四到五 | `grantia` | `redgravel` | `grantia_ochre` | 2 | 45 到 55 | 48×48 | D1 区 `grantis_redgravel_road`（4 日） | 是 |
| D3-2 | `wreck_bay` | 沉船湾 | 场景 | 迷宫 | 四到五 | `mercato` | `goldbay` | `mercato_coast` | 3 | 46 到 50 | 96×64 | D3 步 `goldbay_wreck_bay`（退潮时） | 是 |
| D3-3 | `abyss_lord_wreck` | 渊主沉骸 | 场景 | 迷宫 | 五 | `mercato` | `goldbay` | `sealed_ruins` | 3（腹腔局部五） | 58 到 60 | 128×96 | D3 区 `goldbay_deep_dive`（深潜船 3 日） | 是 |
| D4-2 | `withered_ring` | 枯环 | 场景 | 迷宫 | 五 | `silva` | `ringwood` | `silva_canopy` | 3（环心局部四） | 55 到 58 | 96×96 | D4 区 `ringwood_withered_path`（3 日） | 是 |
| D5-1 | `ancestor_barrow` | 祖灵冢的地下墓道 | 场景 | 迷宫 | 四到五 | `windfang` | `windfang_rock` | `sealed_ruins` | 3 | 47 到 51 | 96×96 | D5 步 `windfang_barrow_steps` | 否（祖灵试炼路线必经） |
| D5-2 | `windfang_rock_battle` | 兽王台（红帐血战 `bat_a4_redtent_bloodfight`） | 场景 | 战场 | 四 | `windfang` | `windfang_rock` | `windfang_steppe` | 1 | 48 到 52 | 64×40 | D5 战役入口 `windfang_rock_battle_call` | 是（血战分支） |
| D6-1 | `fallen_hero_tomb` | 堕勇之墓 | 场景 | 迷宫 | 五 | `sleepscale` | `vaulttouch` | `sealed_ruins` | 4 | 57 到 60 | 64×64 | D6 区 `vaulttouch_north_descent`（2 日） | 是 |
| D8-1 | `horncrown_ruins` | 角冠宫废墟 | 场景 | 迷宫 | 四到五 | `nightrealm` | `duskcrown` | `night_basalt` | 4 | 50 到 54 | 96×96 | D8 区 `duskcrown_horncrown_road`（2 日） | 是 |
| D8-2 | `edgetrial_caves` | 试锋谷的试炼窟 | 场景 | 迷宫 | 四到五 | `nightrealm` | `edgetrial` | `night_basalt` | 3 | 48 到 54 | 64×96 | D8 区 `duskcrown_edgetrial_road`（5 日） | 是 |
| D8-3 | `kingwomb_abyss` | 王胎渊 | 场景 | 迷宫 | 五 | `nightrealm` | `duskcrown` | `night_basalt` | 4（渊底局部五） | 56 到 60 | 96×128 | D8 区 `duskcrown_kingwomb_road`（3 日） | 是 |
| E4-1 | `root_abyss` | 根渊 | 场景 | 迷宫 | 四到五 | `silva` | `ringwood` | `silva_canopy` | 3 | 50 到 54 | 96×96 | E4 步 `worldtree_root_descent` | 是 |
| E5-1 | `deep_forge` | 深炉 | 场景 | 迷宫 | 四到五 | `mercato` | `redanvil` | `forge_deep` | 3 | 48 到 52 | 96×96 | E5 步 `redanvil_forge_descent` | 是 |
| A10-1 | `valen_fields_battle` | 瓦伦平野（第二战线 `bat_a3_second_front`） | 场景 | 战场 | 三 | `valen_valley` | `valen_plain` | `lothar_plain` | 1 | 43 到 45 | 56×36 | 战役入口 `valen_fields_battle_call`（灰烬防线同时，自动结算为主） | 否 |
| E4-2 | `rootcourt_battle` | 根下庭（根下庭之夜 `bat_a4_rootcourt_night`） | 场景 | 战场 | 四 | `silva` | `ringwood` | `silva_canopy` | 2 | 47 到 50 | 48×36 | E4 战役入口 `rootcourt_battle_call` | 否 |
| A1-2 | `borderstone_rear_battle` | 边石后方（后方·边石 `bat_a5_front_rear`） | 场景 | 战场 | 五 | `edgestone_area` | `ash_border` | `lothar_plain` | 2 | 55 到 58 | 48×32 | `borderstone` 与 `seal_ruins` 的战场变体 | 否 |
| A5-2 | `dg_old_mine` | 边石旧矿（锈岭矿口一侧的旧矿道） | 子场景 | 迷宫 | 一 | `edgestone_area` | `ash_border` | `forge_deep` | 2 | 6 到 12 | 48×48 | `rustridge_mine` 的子场景（矿工叫它边石旧矿） | 否 |

- 地球四景是图集条目 P1 到 P4（第 3 节的过场布景），不补登。
- `gate_station_ruins`（C9-2）是西南站，`gatepicker_camp`（C9-3）是西营；四座门站与两处营地共用 C9-2、C9-3 的简报。
- `dg_moon_cellar`（醉月亭的地窖）按图集规则是边石镇的室内层，不补登；`dg_skriva_vault` 在 D2-1 里，不补登。
- 补登的区域图路段（新增路线的时长按第 0.1 节换算：1 日 = 24 小时）：

| id | 起点 | 终点 | 层 | 种类 | 公里 | 步行 | 骑马 | 其他 | 开放 | 途中事件 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `grantis_redgravel_road` | `grantis` | `redgravel_pit` | 区 | road | 100 | 96 | 48 | 无 | 第四幕；"无名战士"木牌 | `caravan`、`patrol`、`rumor` |
| `goldbay_deep_dive` | `goldbay` | `abyss_lord_wreck` | 区 | river（海路） | 300 | 无 | 无 | 船 72 | 第五幕；同盟深潜船 | `weather` |
| `ringwood_withered_path` | `ringwood_court` | `withered_ring` | 区 | trail | 60 | 72 | 无 | 无 | 第五幕；守护者许可或森林线达成 | `monsters`、`weather` |
| `vaulttouch_north_descent` | `seven_seats` | `fallen_hero_tomb` | 区 | pass | 40 | 48 | 无 | 无 | 第五幕；《堕勇手记》或观穹台隐修者 | `monsters`、`weather` |
| `duskcrown_horncrown_road` | `duskcrown` | `horncrown_ruins` | 区 | road | 50 | 48 | 24 | 无 | 第四幕；夜后许可或月下之约 | `monsters`、`patrol` |
| `duskcrown_edgetrial_road` | `duskcrown` | `edgetrial_caves` | 区 | road | 125 | 120 | 60 | 无 | 第四幕；祭斗季或萨莎、夜后引荐 | `pilgrims`、`monsters`、`rumor` |
| `duskcrown_kingwomb_road` | `duskcrown` | `kingwomb_abyss` | 区 | trail | 70 | 72 | 36 | 无 | 第五幕；月下之约或诸侯派打开渊口 | `monsters`、`army` |
| `lightway_north` | `gatefront_south` | `orien_banks` | 区 | road | 240 | 240 | 132 | 商队 288 | 第三幕第 4 周 | `caravan`、`patrol`、`pilgrims`、`rumor`、`army` |

  `valen_river` 只保留船行（`boat` 96、`boatBack` 192），起点是瓦伦堡河港；陆路走 `lightway_north`。补登的地块路线（步）：`borderstone_north_trail`（A1 北门到 A2，3 公里，0.7 小时）、
  `rustridge_deep_rift`、`rustridge_new_shaft`、`castle_well_shaft`（B1 鹰丘旧井到 B6-1）、`orien_bridge_north`、`orien_bridge_south`（替换 `orien_bridges`）、
  `glass_plain_gate_station_se`、`glass_plain_gate_station_ne`、`ash_sea_gate_station_w`、`glass_plain_gatepicker_camp_east`、`goldbay_wreck_bay`、`windfang_barrow_steps`、
  `worldtree_root_descent`、`redanvil_forge_descent`；战役路线 `boundary_cairn_battle_call`、`windfang_rock_battle_call`。

### 9.2 补登迷宫的简报

战场 A1-1、D5-2 的简报在第 10 节。门站与营地的实例按 C9-2、C9-3。每座补登迷宫计两个发现点：入口（图）与核心区（标），首开幕按 9.1 表。

#### A5-1 `rustridge_deep` 锈岭矿深层（Rustridge Deep，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_rustridge_deep`）；第三幕起归领地矿业 |
| 尺寸、风格包、澱度 | 64×64；`forge_deep`；三，存储 3，渲染 4 |
| 等级带 | 34 到 40（首领 `blackiron_maw` 黑铁颚 37、`geode_heart` 晶洞之心 40） |
| 地形与布局 | 旧矿下层晶脉往下的"空心石"层：裂缝下口（入口平台）、帝国行省时代的古巷（矿工的铁锈工具还挂在墙上）、矿难之班的工作面（一整班人没上来的地方）、黑铁脉、晶洞腔（一颗颗晶洞像肺一样呼吸） |
| 出入口与路线 | 北 `to_rustridge_mine`（`rustridge_deep_rift`）；东 `to_borderstone_north`（`rustridge_new_shaft`，只在旧矿被"毁"、塌死旧路时由领地另挖，工期两周） |
| 动线与镜头 | T-D；裂缝下口到晶洞腔约 70 米，古巷成环 |
| 驻留 NPC | 领地矿工模板（"养"之后）；罗恩（"塌方的石头其实是空心的"） |
| 魔物分布 | `rust_beetle` 按图 34 到 36；迷宫目录 3.3.3 的专属魔物；矿难之班的亡灵矿工（同节）；首领 `blackiron_maw` 37（黑铁脉）、`geode_heart` 40（晶洞腔，守核） |
| 采集点 | `node_lotha_rustridge_deep`（锈岭深层黑铁脉，T3） |
| 迷宫结构 | 层：古巷层、晶洞层。区：裂缝下口、古巷、工作面、黑铁脉、晶洞腔。核：晶洞之心。机关：晶洞呼吸（开关格：晶洞每 40 秒胀缩一次，挤窄或放宽两处通道）；`pillarHarden`（晶洞之心）；不灭矿灯（招牌物 `eq_undying_minelamp` 的来处） |
| 照明与夜间 | 室内固定光；矿灯 6；晶洞自发淡紫光 |
| 装饰与外观层 | 矿灯 6、古工具架 2、塌方堆 2；合计 10 |
| 任务挂点 | 第三幕领地矿业第二档；养毁净；矿难之班的送魂 |
| 美术素材 | 地面：`art_tile_forge_deep_hollow_stone`；道具：`art_prop_breathing_geode`、`art_prop_ancient_miner_tools`、`art_prop_geode_heart` |
| 优先级与里程碑 | P2；M2 |

#### D1-2 `redgravel_pit` 红砾城地下斗场（The Redgravel Undercroft Arena，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_redgravel_pit`，挑战梯，独行，`oathLock`） |
| 尺寸、风格包、澱度 | 48×48；`grantia_ochre`（地下斗场：沙地、铁栅、看台）；二，存储 2，渲染 2，沙下局部三 |
| 等级带 | 45 到 55（七梯：45、47、48、50、51、53、55） |
| 地形与布局 | 候场廊（凭"无名战士"木牌入场）；七层梯级（逐层下沉的圆形沙坑，每层一个对手）；看台环绕最底层；冠军厅在最深处 |
| 出入口与路线 | 区域图 `grantis_redgravel_road`（到达点是红砾城竞技场的后门，经候场廊进梯） |
| 动线与镜头 | T-D；每层沙坑直径约 16 格，下一层的入口在当层北侧 |
| 驻留 NPC | 斗场掮客模板；竞技场主；`sasha`（引荐） |
| 魔物分布 | `chain_brawler` 45、`pit_beastmaster` 47（带 `warg` 按图 47）、`mirror_shield_duelist` 48、`pit_sand_shade` 50、`blind_veteran` 51、`twin_blade_sisters` 53、首领 `iron_laurel_champion` 55 |
| 采集点 | 无 |
| 迷宫结构 | 层：七梯。区：候场廊、梯一到梯七、冠军厅。核：沙下战澱之核（封场时砸碎）。机关：`oathLock`；链斗、沙时（沙面上涨，场地缩小）、盲斗（全场黑暗）；观众欢呼（`battleYells`） |
| 照明与夜间 | 室内火把环；盲斗梯熄灯 |
| 装饰与外观层 | 铁栅门 7、火把 14、看台旗 4；合计 25（挑战梯按七层计） |
| 任务挂点 | 揭穿冠军的暗授加护；养毁净（继续开场或封场）；套组 `set_dg_redgravel_pit` |
| 美术素材 | 建筑：`art_bld_grantia_ochre_sunken_arena`；道具：`art_prop_arena_chain_post`、`art_prop_laurel_iron_crown`、`art_prop_nameless_fighter_tag` |
| 优先级与里程碑 | P2；M3 |

#### D3-2 `wreck_bay` 沉船湾（Wreck Bay，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_wreck_bay`） |
| 尺寸、风格包、澱度 | 96×64；`mercato_coast`（以 `looks` 用沉港石、藤壶、湿木）；三，存储 3，渲染 4 |
| 等级带 | 46 到 50（首领 `ledger_crab_matriarch` 47、`defaulted_pact_fiend` 49、`tidegate_keeper` 50） |
| 地形与布局 | 退潮滩（入口与退潮池）；沉港街（半没水中的旧仓栈）；违约者码头（违约留下的契约魔）；门港（千门时代的一座门港，潮门在最深处） |
| 出入口与路线 | 北 `to_goldbay`（`goldbay_wreck_bay`，退潮窗口内可进出） |
| 动线与镜头 | T-D；退潮滩到门港约 75 米；涨潮前须回到高地 |
| 驻留 NPC | 灰鼠与潮民向导模板；同盟打捞队模板 |
| 魔物分布 | `gilded_drowned` 溺金者 按图 46 到 48；`scalepan_crab` 按图 46；`wrecker` 按图 46 到 47；迷宫目录 3.4.3 的专属魔物；异名者 `wreck_bell` 沉钟；首领如上，潮门守守核 |
| 采集点 | `node_mercato_wreck_pools`（沉船湾退潮池，T4） |
| 迷宫结构 | 层：一层。区：退潮滩、沉港街、违约者码头、门港。核：潮门守所守之核。机关：`tideWindow`（开关格：每 20 游戏分钟涨落一次，涨潮时低处地块变深水并溺伤）；门港门址（`ky_gatestone_wreck_bay`）；`gateCredential`（潮门守） |
| 照明与夜间 | 室外昼夜；渔灯与沉船上的磷光 |
| 装饰与外观层 | 沉船残骸 6、缆桩 4、渔灯 3；合计 13 |
| 任务挂点 | 门港石（进阶门址）；打捞执照；招牌物 `eq_unstealable_coin` |
| 美术素材 | 地面：`art_tile_mercato_coast_tidal_flat`；建筑：`art_bld_mercato_coast_sunken_warehouse`、`art_bld_mercato_coast_tide_gate_arch`；道具：`art_prop_wreck_hull`、`art_prop_barnacle_pile` |
| 优先级与里程碑 | P2；M3 |

#### D3-3 `abyss_lord_wreck` 渊主沉骸（Wreck of the Abyss Lord，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_abyss_lord_wreck`，大迷宫，一加九） |
| 尺寸、风格包、澱度 | 128×96；`sealed_ruins`（以 `looks` 用巨骨、藤壶、深海色）；外围三（存储 3，渲染 4），腹腔局部五 |
| 等级带 | 58 到 60（首领 `barnacle_choir` 58、`fleet_admiral_drowned` 59、`whale_heart_engine` 60、`abyss_lord_vestige` 60） |
| 地形与布局 | 深潜船泊位（入口平台，气钟）；外舱（巨骨的肋拱，沉没的联防船队残骸）；沉舰提督的旗舰；腹腔（鲸心）；渊主遗形（最深处） |
| 出入口与路线 | 区域图 `goldbay_deep_dive`（深潜船，从金湾或盐镜港出海） |
| 动线与镜头 | T-D；泊位到腹腔约 110 米，十人团队的首领场直径 40 格以上 |
| 驻留 NPC | 同盟深潜船船员模板 |
| 魔物分布 | `gilded_drowned` 按图 56 到 58；迷宫目录 3.5.4 的专属魔物；首领如上 |
| 采集点 | 无 |
| 迷宫结构 | 层：外舱、腹腔。区：泊位、肋拱廊、旗舰、腹腔、遗形室。核：渊主遗形。机关：气时（潜行时限，同 `sedimentClock` 的机制，回到气钟重置）；水压分区（深区持续伤害） |
| 照明与夜间 | 深海无昼夜；磷光与气钟的灯 |
| 装饰与外观层 | 气钟 2、船骸 8、巨骨 6；合计 16 |
| 任务挂点 | 第五幕大迷宫；同盟联防的起源；套组 `set_dg_abyss_lord_wreck` |
| 美术素材 | 建筑：`art_bld_sealed_ruins_leviathan_ribs`；道具：`art_prop_diving_bell`、`art_prop_sunken_flagship`、`art_prop_whale_heart_engine` |
| 优先级与里程碑 | P2；M3 |

#### D4-2 `withered_ring` 枯环（The Withered Ring，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_withered_ring`） |
| 尺寸、风格包、澱度 | 96×96；`silva_canopy`（以 `looks` 用枯林与蝗蜕）；环外三（存储 3，渲染 4），环心局部四 |
| 等级带 | 55 到 58（首领 `hatching_mother` 孵蝗母 56、`regret_bloom` 枯环之心 58） |
| 地形与布局 | 一圈枯死的林子：外圈枯林、孵化坑、环心（一株花永远在开，也永远在烂） |
| 出入口与路线 | 区域图 `ringwood_withered_path` |
| 动线与镜头 | T-D；外圈到环心约 50 米，绕环一周可回到入口 |
| 驻留 NPC | 精灵守护者模板（守望） |
| 魔物分布 | `locust_husk` 按图 55 到 56；`root_grub` 按图 55；异名者 `ring_whisperer` 枯环的低语；首领如上 |
| 采集点 | `node_silva_withered_ring`（枯环外缘，T5） |
| 迷宫结构 | 层：一层。区：枯林外圈、孵化坑、环心。核：枯环之心。机关：`regrowth`（被破坏的枯枝数十秒后长回）；`swarmBody`；第五幕魔物潮使环心升档 |
| 照明与夜间 | 室外昼夜；环心的花自发病态的光 |
| 装饰与外观层 | 蝗蜕 6、枯树 10；合计 16 |
| 任务挂点 | 希尔薇的蝗灾真相（第五幕）；招牌物 `eq_four_season_seed` |
| 美术素材 | 道具：`art_prop_locust_husk_giant`、`art_prop_eternal_rotting_bloom`、`art_prop_dead_tree_ring` |
| 优先级与里程碑 | P2；M3 |

#### D5-1 `ancestor_barrow` 祖灵冢的地下墓道（The Ancestor Barrow Tunnels）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_ancestor_barrow`）；兽王之争"祖灵试炼"的必经地 |
| 尺寸、风格包、澱度 | 96×96；`sealed_ruins`（以 `looks` 用夯土墓道与骨铃）；三，存储 3，渲染 4 |
| 等级带 | 47 到 51（首领 `barrow_wardbeast` 守冢兽 48、`howling_ancestors` 祖嚎 50、`unnamed_shaman` 被除名的祭司 51） |
| 地形与布局 | 冢门（守冢人的许可）；历代兽王墓道（坟丘下的长廊）；祖灵祭司墓室；最底层没有名字的墓室（蝗王） |
| 出入口与路线 | 北 `to_windfang_rock`（`windfang_barrow_steps`） |
| 动线与镜头 | T-D；冢门到无名墓室约 80 米；玩家"放手"时由候选人独行（AI），玩家在冢门等候并只能听见墓道里的声音 |
| 驻留 NPC | 守冢人模板；候选人（大萨满派的候选或希雅） |
| 魔物分布 | `barrow_wanderer` 冢间游魂 按图 47 到 49；迷宫目录 3.4.4 的专属魔物；异名者 `barrow_grandmother` 守冢婆（中立）；首领如上 |
| 采集点 | 无 |
| 迷宫结构 | 层：墓道层、墓室层。区：冢门、兽王墓道、祭司墓室、无名墓室。核：被除名的祭司所守之核。机关：骨铃（摇响即唤醒一段墓道）；"放手"模式（候选人独行的 AI 推进） |
| 照明与夜间 | 室内固定光；骨铃灯 6 |
| 装饰与外观层 | 骨铃 6、祭器 4；合计 10 |
| 任务挂点 | 兽王之争的祖灵试炼；招牌物 `eq_ancestor_bone_bell` |
| 美术素材 | 建筑：`art_bld_sealed_ruins_rammed_earth_barrow`；道具：`art_prop_bone_bell`、`art_prop_unnamed_tomb_door` |
| 优先级与里程碑 | P1；M3 |

#### D6-1 `fallen_hero_tomb` 堕勇之墓（Tomb of the Fallen Hero，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_fallen_hero_tomb`） |
| 尺寸、风格包、澱度 | 64×64；`sealed_ruins`（以 `looks` 用雪下石冢）；四，存储 4，渲染 5 |
| 等级带 | 57 到 60（首领 `cairn_shieldbearer` 冢前盾卫 57、`backflow_light` 冢中逆光 59、`fallen_hero_remnant` 堕勇残念 60） |
| 地形与布局 | 冢前（盾卫的誓压着的石门）；冢道；逆光室；墓室 |
| 出入口与路线 | 区域图 `vaulttouch_north_descent` |
| 动线与镜头 | T-D；冢前到墓室约 45 米 |
| 驻留 NPC | 无 |
| 魔物分布 | 迷宫目录 3.5.3 的专属魔物；首领如上（`spareTheFallen`） |
| 采集点 | 无 |
| 迷宫结构 | 层：一层。区：冢前、冢道、逆光室、墓室。核：堕勇残念。机关：`spareTheFallen`（攻击已认输者则首领狂暴） |
| 照明与夜间 | 室内固定光；逆光室的光从下往上 |
| 装饰与外观层 | 盾卫石像 1、冰柱 4；合计 5 |
| 任务挂点 | 第五幕 M08（堕勇第一个看穿排澱之约）；套组 `set_dg_fallen_hero_tomb` |
| 美术素材 | 建筑：`art_bld_sealed_ruins_snow_cairn`；道具：`art_prop_shieldbearer_statue`、`art_prop_fallen_hero_sword` |
| 优先级与里程碑 | P2；M3 |

#### D8-1 `horncrown_ruins` 角冠宫废墟（The Horncrown Palace Ruins，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_horncrown_ruins`） |
| 尺寸、风格包、澱度 | 96×96；`night_basalt`（废墟外观）；四，存储 4，渲染 5 |
| 等级带 | 50 到 54（首领 `horn_guard_marshal` 角卫元帅 51、`iron_horn_crown` 铁角冠 53、`first_king_echo` 角冠残影 54） |
| 地形与布局 | 前庭（亲卫至今列队）；王座空台（暗夜王座原址）；铸冠厅；地下王陵 |
| 出入口与路线 | 区域图 `duskcrown_horncrown_road` |
| 动线与镜头 | T-D；前庭到王陵约 90 米 |
| 驻留 NPC | 无 |
| 魔物分布 | `oldking_warrior` 旧王军骸 按图 50 到 52（精英）；`orphan_horn` 按图 50 到 51；迷宫目录 3.4.8 的专属魔物；首领如上 |
| 采集点 | 无 |
| 迷宫结构 | 层：地上宫、地下陵。区：前庭、王座空台、铸冠厅、王陵。核：角冠残影。机关：`crownSeek`、`breakableParts`（铁角冠）；`pageBlind` |
| 照明与夜间 | 室外昼夜（夜境长夜）；亲卫列队手中的残火 |
| 装饰与外观层 | 列队骸骨 12（建筑外观）、残旗 4；装饰合计 4 |
| 任务挂点 | 第一代魔王的真相；套组 `set_dg_horncrown_ruins` |
| 美术素材 | 建筑：`art_bld_night_basalt_horncrown_ruin`；道具：`art_prop_empty_night_dais`、`art_prop_iron_horn_crown` |
| 优先级与里程碑 | P2；M3 |

#### D8-2 `edgetrial_caves` 试锋谷的试炼窟（The Edgetrial Caves，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_edge_trial`，挑战梯，独行） |
| 尺寸、风格包、澱度 | 64×96（谷壁一串洞窟，纵向）；`night_basalt`；三，存储 3，渲染 4 |
| 等级带 | 48 到 54（七窟：49、50、50、51、52、53、首领 `stele_shadow` 斗碑之影 54） |
| 地形与布局 | 谷底是瓦尔妲之碑与碑前斗场；谷壁自下而上七个洞窟；谷口外是古斗场 |
| 出入口与路线 | 区域图 `duskcrown_edgetrial_road` |
| 动线与镜头 | T-D；谷底到第七窟沿谷壁栈道约 100 米 |
| 驻留 NPC | 祭斗者与朝圣者模板 |
| 魔物分布 | 七窟守窟者：`gauntlet_shade`、`thorn_ascetic`、`hourglass_duelist`、`bare_hand_shade`、`one_arm_shade`、`trio_shades`、`stele_shadow`；谷口外 `edge_duelist_ghost` 按图 48 到 49，异名者 `ninety_nine` 九十九 |
| 采集点 | `node_night_edgetrial_scrap`（试锋谷断刃冢，T4） |
| 迷宫结构 | 层：七窟。区：谷底斗场、窟一到窟七。核：无（碑与谷不可毁）。机关：瓦尔妲的规则块（连战、禁疗、限时、无门、单栏、以一敌三、碑前）；"不献之胜"使活性下降 |
| 照明与夜间 | 正午斗碑的影是机制（碑前之战只在正午开放） |
| 装饰与外观层 | 断刃冢 3、栈道灯 7；合计 10 |
| 任务挂点 | 祭斗；瓦尔妲之碑（斗碑）；九十九 |
| 美术素材 | 建筑：`art_bld_night_basalt_cliff_caves`；道具：`art_prop_valda_stele`、`art_prop_broken_blade_mound` |
| 优先级与里程碑 | P2；M3 |

#### D8-3 `kingwomb_abyss` 王胎渊（The Kingwomb Abyss，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_womb_abyss`，大迷宫，一加九） |
| 尺寸、风格包、澱度 | 96×128（纵向下行）；`night_basalt`（渊壁）；外围四（存储 4，渲染 5），渊底局部五 |
| 等级带 | 56 到 60（首领 `womb_mouth` 胎口 56、`bloodmoon_afterimage` 57、`skyrend_afterimage` 58、`frosthorn_afterimage` 59、`unborn_one` 未生者 60） |
| 地形与布局 | 胎口（渊沿，风往里吸）；八王回廊（一条回廊上并排几处"模"，每一处是一代魔王成形的地方）；空摇篮（一处很小的石窝，什么都没有，很安静，不设战斗）；渊底 |
| 出入口与路线 | 区域图 `duskcrown_kingwomb_road` |
| 动线与镜头 | T-D；胎口到渊底约 120 米（下行）；八王回廊的三处残像顺序可选 |
| 驻留 NPC | 无 |
| 魔物分布 | `womb_spawn` 按图 56 到 58；`orphan_horn` 按图 56 到 58；巢主 `womb_brood` 胎渊巢母 按图 58（外围裂口）；异名者 `half_face` 半张；首领如上 |
| 采集点 | `node_night_womb_rim`（王胎渊外缘，T5 到 T6） |
| 迷宫结构 | 层：胎口、回廊、渊底。区：胎口、八王回廊、空摇篮、渊底。核：渊底的汇点（未生者守）。机关：`seepTiles`、`sedimentClock` 在渊底全开；`vesselSeek`（未生者） |
| 照明与夜间 | 无昼夜；回廊的"模"发暗红光 |
| 装饰与外观层 | 模的石窝 8（建筑外观）、空摇篮 1；装饰合计 1 |
| 任务挂点 | 魔王成形之处的物证；空摇篮（第九代魔王缺席的位置）；套组 `set_dg_womb_abyss` |
| 美术素材 | 建筑：`art_bld_night_basalt_abyss_wall`；道具：`art_prop_king_mold_niche`、`art_prop_empty_cradle` |
| 优先级与里程碑 | P2；M3 |

#### E4-1 `root_abyss` 根渊（The Root Abyss，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_root_abyss`） |
| 尺寸、风格包、澱度 | 96×96；`silva_canopy`（根下外观）；三，存储 3，渲染 4 |
| 等级带 | 50 到 54（首领 `rootrot_matriarch` 根腐之母 52、`sorrow_seedling` 悲苗 54） |
| 地形与布局 | 外根口；根须林（千百条根垂到地下）；根尖澱湖；悲苗（核）。根渊与根下庭不相通 |
| 出入口与路线 | 南 `to_world_tree`（`worldtree_root_descent`；`refuge_state` 为公开庇护或迁入时开放，被毁时封闭到第五幕） |
| 动线与镜头 | T-D；外根口到悲苗约 70 米 |
| 驻留 NPC | 精灵守护者模板（引路） |
| 魔物分布 | `root_grub` 按图 50 到 52；`spore_husk` 按图 50 到 52；迷宫目录 3.4.7 的专属魔物；首领如上 |
| 采集点 | 无 |
| 迷宫结构 | 层：根须层、根尖层。区：外根口、根须林、根尖澱湖、悲苗。核：悲苗。机关：`regrowth`；根滤（世界树的根周期性吸澱，澱湖水位涨落） |
| 照明与夜间 | 无昼夜；根须的荧光 |
| 装饰与外观层 | 根须帘 8、荧菇 4；合计 12 |
| 任务挂点 | 第五幕节点二"根滤"的天然版；招牌物 `eq_rootlace_staff` |
| 美术素材 | 建筑：`art_bld_silva_canopy_root_cavern`；道具：`art_prop_root_tip_pool`、`art_prop_sorrow_seedling` |
| 优先级与里程碑 | P2；M3 |

#### E5-1 `deep_forge` 深炉（The Deep Furnaces，可选）

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，迷宫（`dg_deep_forge`） |
| 尺寸、风格包、澱度 | 96×96；`sealed_ruins`（以 `looks` 用炉膛、炉渣与铁轨）；三，存储 3，渲染 4 |
| 等级带 | 48 到 52（首领 `slag_herald` 渣潮使 49、`oathbound_smiths` 誓炉三匠 51、`the_unquenched` 不熄者 52） |
| 地形与布局 | 古炉区入口；炉道（炉渣河）；誓炉厅（三位炉长立下"火不熄、人不离"的炉誓）；炉膛核心 |
| 出入口与路线 | 南 `to_redanvil`（`redanvil_forge_descent`；炉长会许可或契约法庭的试约委托） |
| 动线与镜头 | T-D；入口到炉膛约 80 米 |
| 驻留 NPC | 无 |
| 魔物分布 | `slag_golem` 按图 48 到 50；迷宫目录 3.4.5 的专属魔物；首领如上 |
| 采集点 | 无（灵汞渗在 E5 的深层边缘） |
| 迷宫结构 | 层：炉道层、炉膛层。区：入口、炉道、誓炉厅、炉膛。核：不熄者。机关：炉渣河（定时漫过炉道）；炉誓（解约即可让三匠停手的非战斗解） |
| 照明与夜间 | 炉火的红光 |
| 装饰与外观层 | 铁砧 3、风箱 3、炉渣车 4；合计 10 |
| 任务挂点 | 试约；T03 的线索（倾倒的澱渣从这里出）；套组 `set_dg_deep_forge` |
| 美术素材 | 建筑：`art_bld_sealed_ruins_ancient_furnace`；道具：`art_prop_slag_river_channel`、`art_prop_oath_anvil_three` |
| 优先级与里程碑 | P2；M3 |

## 10. 战场网格

### 10.1 通则

- **网格是逻辑层**：`data/warfare/scenarios.json` 的 `rows` 与 `legend`（`.` 平地、`=` 道路、`B` 建筑、`W` 深水、`~` 浅滩、`#` 墙、`^` 高地、`T` 林地、`*` 雪地、`:` 澱地）；目标区写 `zone`（x、y、宽、高）。
- **战场格与地图格**：1 战场格 = 8 米 = 8×8 地图格（1 地图格 = 1 米 = 16 像素），以[战争目录](../content/catalog_warfare_strategy.md)第 7.2 节为准。战场进入 HD-2D 场景时每个战场格渲染为 8×8 地块（128×128 像素），兵团立牌在格内按阵型排开；
  网格尺寸保持在 32 到 64 宽，画面纵深 256 到 512 米，镜头以兵团视图为主。
- **部署区在下**：屏幕上玩家的部署区画在下方（镜头一侧），敌军从上方或侧翼来；真实方位与此不一致时（灰烬防线、鹿渡）整张图旋转绘制，界面角落的罗盘标注真实方位。
- **剧本归战争目录**：本节给地图与目标区；兵种、编成、援军波次与胜负结算由 [`catalog_warfare_strategy.md`](../content/catalog_warfare_strategy.md) 的 `bat_` 剧本拥有，剧本的 `map` 字段写本节的图集 id。

已有五个网格的地图评估：

| 网格 | 图集 id | 屏幕方向 | 结论 |
| --- | --- | --- | --- |
| `act2_city_defense` | `wallenburg_harbor_battle` | 守点（鱼市）在中，河在下 | 合格；码头开阔地是部署区 |
| `act3_bone_field` | `bonefield_battle` | 村子（守点）在下，亡灵自北来 | 合格 |
| `act3_north_raid` | `frostridge_battle` | 堡在中下，红牙军自北来 | 合格 |
| `act3_ash_line` | `reedbridge_battle` | 玩家守北岸（上方） | 绘制时旋转 180 度，东岸画在下方 |
| `act5_final_war` | `ashen_final_battle` | 三战线示意 | 合格；只作部署与战线结算的可视化 |

### 10.2 C6-1 `deer_ford_battle` 鹿渡之战（64×40，军团）

屏幕上方是东岸（帝国第七军团前锋自东来），下方是西岸（我方）；罗盘：东在上。

```
^^^^^^^^.......................==.....................^^^^^^^^^^
^^^^^^^^.......................==.....................^^^^^^^^^^
^^^^^^^^.......................==.....................^^^^^^^^^^
...............................==.....................^^^^^^^^^^
...............................==...............................
...............................==...............................
...............................==...............................
...............................==...............................
...............................==...............................
...............................==...............................
WWWWW~~WWWWWWWWWWWWWWWWWWWWW~~~~~~~~WWWWWWWWWWWWWWWWWWWWWWWWWWWW
WWWWW~~WWWWWWWWWWWWWWWWWWWWW~~~~~~~~WWWWWWWWWWWWWWWWWWWWWWWWWWWW
WWWWW~~WWWWWWWWWWWWWWWWWWWWW~~~~~~~~WWWWWWWWWWWWWWWWWWWWWWWWWWWW
WWWWW~~WWWWWWWWWWWWWWWWWWWWW~~~~~~~~WWWWWWWWWWWWWWWWWWWWWWWWWWWW
................................................................
................................................................
................................................................
................................................................
TTTTTTTTTT^^^^^^^^^^^^^^TTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
TTTTTTTTTT^^##########^^TTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
TTTTTTTTTT^^#........#^^TTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
TTTTTTTTTT^^#........#^^TTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
TTTTTTTTTT^^#........#^^TTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
TTTTTTTTTT^^#........#^^TTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
TTTTTTTTTT^^####..####^^TTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
TTTTTTTTTT^^^^^^^^^^^^^^TTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT==T..............TTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT==T..BBB..BBB....TTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT==T..BBB..BBB....TTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT==T...........BB.TTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT==T...........BB.TTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT==T..BBB..BBB....TTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT==T..BBB..BBB....TTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT==T..............TTTTTTTTTTTTTTTT
......TTTTTTTTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
======TTTTTTTTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
......TTTTTTTTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
......TTTTTTTTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
```

| 要素 | 网格位置 | 说明 |
| --- | --- | --- |
| 帝国大道与东岸集结区 | 第 0 到 9 行，第 31 到 32 列道路 | 敌军部署；东北、西北角高地是弩手位 |
| 银鞍河 | 第 10 到 13 行 | 深水不可过 |
| 鹿渡 | 第 10 到 13 行，第 28 到 35 列 | 齐膝深的主渡口，宽 8 格（咽喉） |
| 上游窄滩 | 第 10 到 13 行，第 5 到 6 列 | 冒险涉水的侧翼，宽 2 格 |
| 西岸滩头 | 第 14 到 17 行 | 我方前沿；目标区 `hold_ford`（26, 14, 12, 4） |
| 橡盾要塞 | 第 18 到 25 行，第 10 到 23 列 | 山丘上的木石要塞，南门在第 24 行；康拉德守军驻此（受令约束，可说服出城） |
| 苍榆林地 | 第 18 到 39 行 | 雾与伏击；林中道路南去榆集 |
| 百帐营 | 第 28 到 35 行，第 34 到 47 列 | 老弱约 900；目标区 `protect_camp`（34, 28, 14, 8） |
| 撤离点 | 第 36 到 39 行，第 0 到 5 列 | 焦土让渡时移民从这里撤走 |

目标：`hold_ford`（主，六日压缩为实时约 10 分钟，敌方伤亡过两成或判定"洛萨东线有强者"即收兵）；`protect_camp`（次）；可选：`capture_banner`、与奥莉安娜单挑（`oathLock`）。

### 10.3 C3-1 `sunrise_gate_battle` 朝阳门之夜（64×48，小队）

真实方位北在上：上部北岸旧城、中部王岛、下部南岸新城；朝阳门在东墙（第 39 到 41 行，第 62 到 63 列）；车辙区与旧沟渠在西南角。

```
BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBB
BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBB
BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBB
================================================================
========================================BBBBBBBB================
BBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBB
BBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBB
BBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBB
================================================================
================================================================
BBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBB
BBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBB
BBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBB
BBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBBBBBBBB==BBBBBBBBBBBB
WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW==WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW==WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW==WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW==WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW
WWWWWWWW................................................WWWWWWWW
WWWWWWWW..............####################..............WWWWWWWW
WWWWWWWW..............#..................#..............WWWWWWWW
WWWWWWWW..............#.BBBBBB.....BBBBB.#..............WWWWWWWW
WWWWWWWW..............#.BBBBBB.....BBBBB.#..............WWWWWWWW
WWWWWWWW..............#.BBBBBB.....BBBBB.#..............WWWWWWWW
WWWWWWWW..............#.BBBBBB...........#..............WWWWWWWW
WWWWWWWW..............#..................#..............WWWWWWWW
WWWWWWWW..~~~.........#..................#..............WWWWWWWW
WWWWWWWW..~~~.........########....########..............WWWWWWWW
WWWWWWWW................................................WWWWWWWW
WWWWWWWW................................................WWWWWWWW
WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW==WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW==WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW==WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW==WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW
BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB##
BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB##
BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB##
==============================================================##
==============================================================##
BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==
BB..........BB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==
BB..........BB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==
BB..........BB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB##
==..........==================================================##
==..........==================================================##
~~~.........BB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB##
~~~BBBBBBBBBBB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==BBBB############
~~~BBBBBBBBBBB==BBBBBBBBBBBBBB==BBBBBBBBBBBBBB==BBBB############
```

| 要素 | 网格位置 | 说明 |
| --- | --- | --- |
| 北岸旧城 | 第 0 到 13 行 | 主座堂（西北街区）、宰相府（第 4 到 7 行，第 40 到 47 列）；目标区 `seize_seal`（40, 4, 8, 4） |
| 北桥、南桥 | 第 14 到 17 行与第 30 到 33 行，第 30 到 31 列 | 两座石桥，咽喉 |
| 王岛与冠石宫 | 第 18 到 29 行；宫墙第 19 到 27 行 | 帘幕寝殿（第 21 到 23 行，第 35 到 39 列）：目标区 `rescue_philip`（35, 21, 5, 3）；档案馆旧翼起火（第 21 到 24 行，第 24 到 29 列）：可选目标区 `save_archive`（24, 21, 6, 4） |
| 王岛码头 | 第 26 到 27 行，第 10 到 12 列 | 河上小船的撤离点 |
| 南岸新城 | 第 34 到 47 行 | 朝阳门（东墙）是敌军入城点；车辙区院子（第 40 到 45 行，第 2 到 11 列）是我方潜入的部署区 |
| 旧沟渠 | 第 45 到 47 行，第 0 到 2 列 | 撤离点 `escape_ditch` |

目标：`rescue_philip`、`seize_seal`（主）；`save_archive`（可选）；撤离（`escape_ditch`、王岛码头小船，或玩家已安放在王都的门标）。帝国护送使团约 800（债券在玩家手里时减半）自朝阳门分两路入城，一路直扑南桥，一路沿南岸主街包抄车辙区。

### 10.4 A1-1 `boundary_cairn_battle` 界石垒：界石之战 `bat_a4_boundary_war`（56×36，军团；第四幕的必经战斗）

真实方位北在上：上部是封门遗迹的外庭（澱与门徒会的来向），中部是界石垒与残阶坡，下部是各群体代表的营地；东缘是灰溪。

```
^^^^^^^^^^^^################################^^^^^^WWWWWW
^^^^^^^^^^^^##............................##^^^^^^WWWWWW
^^^^^^^^^^^^##............................##^^^^^^WWWWWW
^^^^^^^^^^^^##............................##^^^^^^WWWWWW
^^^^^^^^^^^^##............................##^^^^^^WWWWWW
^^^^^^^^^^^^##............................##^^^^^^WWWWWW
^^^^^^^^^^^^##############....##############......WWWWWW
^^^^^^^^^^^^..............====....................WWWWWW
^^^^^^^^^^^^..............====....................WWWWWW
^^^^^^^^^^##..##..##..##..====##..##..##..##......WWWWWW
..........##..##..##..##..====##..##..##..##......WWWWWW
..........................====....................WWWWWW
^^^^^^........^^^^^^^^^^^^====^^^^^^^^^^^^^^^^^^^^WWWWWW
^^^^^^........^^^^^^^^^^^^====^^^^^^^^^^........^^WWWWWW
^^^^^^^^^^^^^^^^^^^^^^^^^^====^^^^^^^^^^........^^~~~~~~
^^^^^^........^^^^^^^^^^^^====^^^^^^^^^^^^^^^^^^^^~~~~~~
^^^^^^........^^^^^^^^^^^^====^^^^^^^^^^........^^~~~~~~
^^^^^^^^^^^^^^^^^^^^^^^^^^====^^^^^^^^^^........^^~~~~~~
^^^^^^........^^^^^^^^^^^^====^^^^^^^^^^^^^^^^^^^^WWWWWW
^^^^^^........^^^^^^^^^^^^====^^^^^^^^^^........^^WWWWWW
^^^^^^^^^^^^^^^^^^^^^^^^^^====^^^^^^^^^^........^^WWWWWW
^^^^^^........^^^^^^^^^^^^====^^^^^^^^^^^^^^^^^^^^WWWWWW
^^^^^^........^^^^^^^^^^^^====^^^^^^^^^^........^^WWWWWW
^^^^^^^^^^^^^^^^^^^^^^^^^^====^^^^^^^^^^........^^WWWWWW
^^^^^^........^^^^^^^^^^^^====^^^^^^^^^^^^^^^^^^^^WWWWWW
^^^^^^........^^^^^^^^^^^^====^^^^^^^^^^........^^WWWWWW
..........................====....................WWWWWW
..........................====....................WWWWWW
......BBBBBB....BBBBBB....====....BBBBBB..........WWWWWW
......BBBBBB....BBBBBB....====....BBBBBB..........WWWWWW
......BBBBBB....BBBBBB....====....BBBBBB..BBBB....WWWWWW
..........................====............BBBB....WWWWWW
..........................====............BBBB....WWWWWW
..........................====....................WWWWWW
..........................====....................WWWWWW
..........................====....................WWWWWW
```

| 要素 | 网格位置 | 说明 |
| --- | --- | --- |
| 封门遗迹外庭 | 第 0 到 6 行，第 12 到 43 列 | 门徒会叩封门引出的"封印躁动"从外庭的南门（第 6 行，第 26 到 29 列）涌出 |
| 界石垒 | 第 9 到 10 行 | 各群体代表各带一块石头垒成的界石，一排九座，彼此间隔 2 格；目标区 `hold_cairn`（10, 8, 36, 4） |
| 残阶坡 | 第 12 到 25 行 | 台阶道路居中，东西各一列梯田台地（射手位） |
| 灰溪与浅滩 | 第 0 到 35 行，第 50 到 55 列；浅滩第 14 到 17 行 | 门徒会的侧翼沿灰路涉水而来 |
| 代表营地 | 第 26 到 35 行 | 立国仪式后的营地；目标区 `protect_delegates`（6, 28, 40, 5） |

- **为什么设这一战**：D-069 要求每幕的必经内容都含战斗，第四幕的五条纷争都可交给官员办，主线上缺一场必经战斗。立国后 30 到 90 日的一个夜里，
  门徒会借界石垒立成、封印受震的时机叩封门，"封印躁动"的澱与门徒会精锐一起扑向界石垒；不认新国的邻居的先遣同夜从另一侧压来（按 `lothar_ending`，残王国结局没有这一波）。
  这是新国的第一次守土之战，剧本是战争目录的 `bat_a4_boundary_war` 界石之战（第 5.11 节），规模用第三幕已有的军团，
  不依赖第三幕的教会结局（无论 `church_verdict_3` 取值如何都会发生），也让第五幕"后方·边石"有一个前例。
- **敌军**：第一波，门徒会信徒与精锐（`disciple_zealot` 按战场定级 45 到 47）、门徒会引导者（`disciple_guide` 48，若海德薇在第三幕存活由她带队）、
  封印躁动的澱生体（`glyph_shade`、`dian_spirit` 按战场定级 45 到 46）。第二波按来向从西缘（北境军阀，旧巡逻道）、南缘（讨叛军，南大路）或东北角（清剿先遣，荒原外缘）进场。兵团与波次由战争目录的剧本写定。
- **我方**：庭外之国的常备队与民兵、首批官员中的将领、阿什（只守封门本身，不守界石垒）。
- **结算**：守住界石垒（`hold_cairn`）且代表营地伤亡不超过两成为胜；界石誓的"有一天我们不再需要立誓的人，这块石头也照样立着"在胜利后由众人复述；
  失败时界石垒被推倒一半，立国之门仍开（钥已满足），但 `territory_autonomy` 下降 5。分幕回写请求见第 13.3 节。

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，战场（军团）；第四幕的必经战斗（推荐） |
| 幕与区域 | 第四幕，立国后 30 到 90 日的一个夜里（剧本 `bat_a4_boundary_war` 界石之战，[战争目录](../content/catalog_warfare_strategy.md)第 5.11 节）；`edgestone_area`；`ash_border`；战役入口 `boundary_cairn_battle_call`（A1） |
| 尺寸 | 网格 56×36 战场格；HD-2D 场景按 1 战场格 = 8 米渲染为 448×288 地图格（第 10.1 节） |
| 风格包 | `wild_forest`（A2 残阶坡的外观），外庭部分用 `sealed_ruins` 外观组 |
| 澱度 | 二，存储 2，渲染 2；外庭南门局部三（封印躁动） |
| 等级带 | 45 到 48（RTS 英雄下限 45） |
| 驻留 NPC | 各群体代表（洛萨难民、魔族逃兵、遗民、兽人移民、矮人与半身人行商的代表模板）；首批官员中的将领；阿什（只守封门本身） |
| 照明与夜间 | 夜战：代表营地火盆与界石垒旁的火把；外庭方向全黑，只有封印躁动的紫光 |
| 装饰与外观层 | 营地火盆 6、帐篷 4；界石垒九座以建筑外观生成；战线上无装饰 |
| 美术素材 | 复用 A2、A3；增 `art_prop_boundary_cairn`（一人高的石垒，九座各不相同：各族带来的石头）、`art_prop_delegate_tent` |
| 优先级与里程碑 | P0；M3 |

### 10.5 D5-2 `windfang_rock_battle` 兽王台：红帐血战 `bat_a4_redtent_bloodfight`（64×40，连队；兽王之争的血战分支）

真实方位北在上：上部是季河以北的岩掌部营地与魔族佣兵；中部是风牙岩（不可通行），兽王台的岩阶在岩南；下部是长角部营地与祖灵冢入口。

```
................................................................
................................................................
......BBBBBB......................................BBBBBBBB......
......BBBBBB......................................BBBBBBBB......
......BBBBBB......................................BBBBBBBB......
................................................................
................................................................
................................................................
................................................................
WWWWWWWWWWWWWW~~~~WWWWWWWWWWWWWWWWWWWWWWWWWW~~~~WWWWWWWWWWWWWWWW
WWWWWWWWWWWWWW~~~~WWWWWWWWWWWWWWWWWWWWWWWWWW~~~~WWWWWWWWWWWWWWWW
WWWWWWWWWWWWWW~~~~WWWWWWWWWWWWWWWWWWWWWWWWWW~~~~WWWWWWWWWWWWWWWW
................................................................
................................................................
..........................############..........................
....^^^^^.................############..........................
....^^^^^.................############..........................
....^^^^^.................############................^^^^^.....
..........................############................^^^^^.....
..................^^^^....############................^^^^^.....
..................^^^^....############....^^^^........^^^^^.....
..................^^^^....############....^^^^..................
..........................############....^^^^..................
..........................############..........................
..........................############..........................
..........................############..........................
..............................====..............................
..............................====..............................
..............................====..............................
..............................====..............................
...............................==...............................
...............................==...............................
........BBBBBB.................==...............................
........BBBBBB.................==.......BBBBBB..................
........BBBBBB......BBBBBB.....==.......BBBBBB....^^^^^^........
....................BBBBBB.....==.......BBBBBB....^....^........
....................BBBBBB.....==.................^....^........
...............................==.................^^^^^^........
...............................==...............................
...............................==...............................
```

| 要素 | 网格位置 | 说明 |
| --- | --- | --- |
| 岩掌部与魔族佣兵营 | 第 0 到 8 行 | 敌军部署（西北、东北两营） |
| 季河 | 第 9 到 11 行；两处浅滩第 14 到 17 列、第 44 到 47 列 | 咽喉 |
| 风牙岩 | 第 14 到 25 行，第 26 到 37 列 | 不可通行，把战场分成东西两翼 |
| 兽王台岩阶 | 第 26 到 29 行，第 30 到 33 列 | 目标区 `hold_dais`（22, 26, 20, 4） |
| 长角部营地 | 第 30 到 39 行 | 我方部署 |
| 祖灵冢入口 | 第 34 到 37 行，第 50 到 55 列 | 祖灵试炼进行中；目标区 `protect_trial`（50, 34, 6, 4） |

- **触发**：玩家支持祖灵试炼时，岩掌部战首拒绝结果、带魔族佣兵来抢兽王台（第四幕 8.4 第 6 步"萨莎可能临阵撤走"的"阵"就是这一战）；玩家支持血战时，本战是血战本身，阵营互换。
- **萨莎**：强者之宴互敬时，她在第二回合带佣兵撤走（佣兵兵团减半）；否则她是敌方英雄（对手战规则）。
- **结算**：写 `beast_king`（第四幕 8.4 收场表）；"希雅调停"路线不触发本战。

| 项 | 内容 |
| --- | --- |
| 层级与角色 | 场景，战场（军团）；兽王之争的血战分支 |
| 幕与区域 | 第四幕；`windfang`；`windfang_rock`；战役入口 `windfang_rock_battle_call`（D5） |
| 尺寸 | 网格 64×40 战场格；HD-2D 场景按 1 战场格 = 8 米渲染为 512×320 地图格（第 10.1 节） |
| 风格包 | `windfang_steppe`（区域默认） |
| 澱度 | 一，存储 1，渲染 1 |
| 等级带 | 48 到 52 |
| 驻留 NPC | 我方：长角部（`nitira_moonhorn`）与玩家的军队；敌方：岩掌部（`ursa_stonebreaker`）与魔族佣兵、`sasha`（条件）；中立：守冢人 |
| 照明与夜间 | 白昼战；风沙降低远处视野 |
| 装饰与外观层 | 两侧营地的毡帐与图腾；战线上无装饰 |
| 美术素材 | 复用 D5；增 `art_prop_war_totem_banner` |
| 优先级与里程碑 | P1；M3 |

## 11. 荒原外缘替身内容的迁移

`ash_waste` 现在一张图承载了 A9、B9 之外的中层门址、圣战军营、红牙丘、亚龙栖处与古澱边缘。迁移后外缘只承担外缘：第一幕南段、第二幕全段、第三幕通骨原与中层的出发点。

| 现有内容 | 现有 id | 迁往 | 新位置 | 幕 | 理由 |
| --- | --- | --- | --- | --- | --- |
| 荒原中层门址 | `waste_gate_site` | C9-2 `gate_station_ruins` | 西南门站的门站大厅 | 三 | 门址就是门站；行路之门进阶的第三处门址 |
| 灰烬元素三组 | `aw_elemental_w`、`aw_elemental_c`、`aw_elemental_e` | C10 | 外环街区（按图 40 到 42） | 三 | 图鉴：外环 |
| 荒原食尸鬼三组 | `aw_ghoul_w`、`aw_ghoul_c`、`aw_ghoul_e` | C9 | 玻璃原南半 | 三 | 图鉴：中层 |
| 灰烬骑士两组 | `aw_knight_w`、`aw_knight_e` | C10 | 外环街区（按图 41 到 43） | 三 | 图鉴：外环街区 |
| 亚龙栖处与澱化亚龙 | `drake_roost`、`aw_dian_drake` | C10 | 古城货栈 `old_warehouse` | 三 | 核是古城货栈里的龙蜕 |
| 红牙丘与重步兵、翼魔两组 | `redfang_hill`、`aw_brute_*`、`aw_scout_*` | C9 | 红牙斥候丘 `redfang_scout_hill` | 三到四 | 夜境方向；萨莎本人的试货在 C5-1 |
| 红牙军试货（事件波次） | 红牙丘到营火 | C9 | 红牙斥候丘到霍尔格营地 | 三 | 同上 |
| 圣战军营与士兵、审判官 | `crusader_camp`、`aw_crusader_*`、`aw_inquisitor` | B7 | 苇桥西南岸的圣战军前锋营 `crusade_vanguard_camp` | 三（第 18 到 21 周） | 正典：圣战军从西南岸来过苇桥；外缘不是它的路 |
| 古澱边缘 | `core_rim` | E1 | 古澱边缘 `core_rim_edge` | 五 | 核心的坑沿 |
| 无貌之王（事件波次） | 古澱边缘到南口 | E1 | 古澱边缘到联军前哨 | 五 | 第五幕的连续地图只有核心 |
| 门徒会营地与信徒两组 | `disciple_camp`、`aw_cultist_*` | 留在 A9 | 西段门徒会外缘营地（第二幕） | 二 | 第二幕门徒会线的外缘据点；等级按第二幕带（槛众 12 到 18、葬仪社打手 18 到 24，信徒 25 到 27 作营地头目） |
| 游荡骸骨、荒原怨灵 | `aw_bones_*`、`aw_wraith_*` | 留在 A9 | 南段（坐标按第 12 节第 3 条） | 一 | 外缘第一幕 |

- **过渡期**（M1 到 M2，C9、C10、E1 建成之前）：被迁走的组一律加 `requiresFlags: ["act.3.entered"]`（古澱边缘与无貌之王加 `act.5.entered`），第一、二幕的玩家不会遇到；
  C9、C10、E1 上线的同一次改动里从 `ash_waste.json` 删除这些组与地点，并把图集 A9 的 `levels` 写为 5 到 30。
- **验收**：迁移后 `ash_waste` 在 `act.4.entered` 之前没有 30 级以上的常驻组；营火与所有警戒圈相距不少于 3 米；首次接触不少于 8 米。

## 12. 场景动线遗留修改的具体改法（[`scene_flow.md`](scene_flow.md) 第 8 节）

坐标是现有网格的坐标（扩建前）；扩建时按第 1.11 节的平移量换算。"层"沿用 `scene_flow.md` 的写法。

| 序 | 地图 | 改法 | 层 | 验收 |
| --- | --- | --- | --- | --- |
| 1 | `wallenburg` | 门移到南墙：公会大区总部 (12, 20) 到 (12, 26)；星笔塔 (45, 20) 到 (45, 26)；金秤会馆 (55, 20) 到 (55, 25)；中城酒馆 (23, 29) 到 (23, 33)；炉灰街作坊 (36, 29) 到 (36, 33)。下城民居加南门 (47, 34)，中城民居加南门 (55, 32)。漏灯酒窖保留北门（灰鼠的据点不对街），侧缝一盏灯为记号；老船夫小屋随第 6 条移到 B5。扩建图按"主要店铺排在主街北侧、门朝南"重排 | 空间层 | 外门朝南或东西不少于八成；城内巡访线全身遮挡不超过 10% |
| 2 | `seal_ruins` | 开关格：门厅 (17, 23) 与 (18, 23) 在 `a1_ruins_gate_cleared` 之前为岩石；出口 `to_borderstone` 加 `requiresFlags: ["a1_ruins_gate_cleared"]`；旗标由第一幕第 3 周"从内侧清开落石"的任务写入。外环两组 `sr_dreg_gate`、`sr_rat_gate` 删除，并入西回廊 `sr_dreg_w`（数量 2）与东南回廊 `sr_rat_se`（数量 2） | 逻辑层与空间层 | 首访无法从正门离开；清开后正门可走；从正门进来首次接触 8 米以上 |
| 3 | `ash_waste` | 高等级组按第 11 节加幕次旗标并迁出；`aw_ghoul_e` 过渡期移到 (34.5, 18.5)；`aw_bones_grove` 移到 (44.5, 29.5)；`aw_bones_south` 并入 `aw_bones_slope`（数量 3）；`aw_wraith_e` 移到 (26.5, 19.5) | 逻辑层 | 营火与警戒圈相距 3.8 米以上；首次接触 8 米以上 |
| 4 | `forest_edge` | `fe_dian_wolf_w` 移到 (19.5, 1.5)，游荡半径 1.5；`fe_boar_logging_e` 移到 (13.5, 26.5)；`fe_boar_logging_w` 移到 (7.5, 29.5)；`fe_grey_wolf_trail_s` 移到 (20.5, 23.5) | 逻辑层 | 营地与警戒圈相距 3 米以上；首次接触 6 米以上（扩建后 8 米以上） |
| 5 | `wallenburg_sewers` | 两组澱鼠按迷宫定级（`SpawnDef.level` 16 到 18）；`ws_rat_hall_n` 移到 (3.5, 15.5)；`ws_drowned_n` 移到 (22.5, 7.5) | 逻辑层 | 第一区常驻等级跨度不超过 6；平台与警戒圈相距 4 米以上；首次接触 8 米 |
| 6 | `wallenburg` | 第 40 到 43 行第 4 到 5 列的桥格换成深水，桥头 (4 到 5, 39) 做渡船码头，出口 `to_gatefront_south` 在 (5, 39)；第 44 到 47 行的南岸条带并入 B5（老船夫小屋、芦苇丛、光径北支口都在 B5） | 空间层 | 南岸内容全部可达（经渡船到 B5） |
| 7 | `borderstone` | 西路西端 (0, 21) 与 (0, 22) 设出口 `to_borderstone_north_w`，通 A2 西南缘的西北矿道口；在 A2 落在 `gate_borderstone_w`，从 A2 回来落在边石镇西口内的 `gate_borderstone_north_w` | 空间层与逻辑层 | 西路有出口；出口 4 格内有路牌 |
| 8 | `borderstone` | 醉月亭北门 (19, 24) 封为墙，南墙 (19, 29) 开主门，招牌移到南门；酒客走第 30 行的后街进出 | 空间层 | 醉月亭门口全身可见；西段东西路的人流减少 |
| 9 | `borderstone` | 驿站东墙 (38, 41) 开门，(39 到 49, 39 到 43) 登记为地点 `post_yard`（驿站马厩院，驿马与坐骑寄存），放推车与草垛 | 空间层 | 无围死的可走区 |
| 10 | `wallenburg` | 大教堂北墙 (30, 5) 开后门；第 4 行登记为地点 `clergy_lane`；`anselm`、`agnes`、`selene`、`krause` 与勇者团四人的日程改走后巷 | 空间层与逻辑层 | 前庭的 NPC 人流下降；后巷两端都通 |
| 11 | `old_outpost` | 干井 (25, 26) 与村祠 (16, 29) 的岩石格换为土路格，放 `dry_well` 与 `shrine_ruin` 装饰；`previewPlacement` 的占用集合加入 `kind` 为 `ruin` 的地点 | 逻辑层与空间层 | 废墟地标上不能建房；两处看得出是井与祠 |
| 12 | `divine_court` | 灵镜在东墙中段，地点 `spirit_mirror` 为 (21, 11, 2, 1)；偷听档由争吵开始前的姿态选择决定，不按到帘幕的距离计算（`prologue_antechamber.md` 第 3.1 节） | 空间层 | 灵镜的位置不影响偷听档 |
| 13 | 多张 | `DECOR_KINDS` 加 `standing_stone`、`doorframe`、`ground_mark`、`dry_well`、`shrine_ruin`、`landmark_tree`、`mine_lamp`，`src/client/render/decor_art.ts` 补模板；摆放：边石镇边石 (29.5, 21.5)、封门遗迹禁碑（替换借用的墓碑立牌）、门内庭院门框 (11.5, 17.5)、荒原外缘碎门坡倒伏门框 6 件、旧水道粉笔记号替换路牌立牌。`landmark_tree` 是唯一允许站在树格上的装饰：它替换该格的树形 | 外观层 | `lookProblems` 与外观层测试通过；`landmark_tree` 只能落在树格 |
| 14 | `borderstone` | `looks`：`mill` 的 `sign` 为 `wheel`，`bakery` 为 `bread`，`post_station` 为 `horseshoe` | 外观层 | 招牌与功能一致 |
| 15 | `forest_edge` | 约树：`landmark_tree` 放在 (19.5, 10.5)（`pact_oak` 正北的树格）；猎户：`gorn`、`shiya`、`boro` 的日程 5 到 11 点写 `forest_edge:hunter_camp`（跨图日程），玩家在林缘时于营地生成 | 外观层与逻辑层 | 约树一眼认得出；清晨营地有人 |

## 13. 正典出入与已决事项

### 13.1 [`world_map.md`](world_map.md) 第 8.2 节与 B-014

| 主题 | 结论 | 理由 | 回写 |
| --- | --- | --- | --- |
| 锈岭矿的方位 | 取地理志：边石镇西北约 5 公里，矿口骑在界石线上；"边石旧矿"是矿工对锈岭矿口的叫法 | 地理志优先级高于分幕；A2 与 A5 的布局按此 | 请求回写第一幕 2.3 W2 |
| 边石镇南门的路 | 取南大路；"王道门"保留为镇民的老叫法（南大路往南最终汇入王道） | 不改正典地名，只解释俗称 | 请求回写第一幕 2.1 |
| 深根谷与根下庭 | 地理志已写定"根下庭是深根谷里的隐谷"；图集名"深根谷（根下庭）"一致 | 已统一 | 图集 D4-1 的 `note` 写"深根谷（根下庭），地理志 3.6" |
| 深账库 | 地理志 3.5 已写定"梅尔卡大神殿地下的深账库" | 已统一 | 图集 D3-1 的 `note` 删去关于碑库的说明 |
| 第三幕东线战场 | 取分幕：鹿渡与橡盾要塞（银鞍堡上游约 20 公里）；银鞍桥是东线前哨 | 分幕写定了战役 | 请求回写地理志 7.3、7.4、6.4 |
| 灰暴的两种含义 | 灰暴（Ashstorm）专指荒原的灰尘暴；第五幕残澱的爆散另名"灰爆"（Ashburst） | 中文同名会让途中事件、天气与结局判定混淆 | 请求回写第五幕全文 |
| 荒原外缘的开放幕次 | 第一幕开放外缘南段（封门遗迹周边、折桥驿、晶沟、灰沙坡、碎门坡）；第二幕开放外缘全段（东西灰村、灰烬林） | 第一幕 W4 写了碎门坡，地理志写"第一幕只到南沿"，A9 本就是"外缘南段" | 请求回写地理志 4.5 |
| 澱度标尺 | 第 1.2 节：存正典级，渲染按公式换算 | 逻辑层与城建读数一致 | 美术方案 2.8 与代码注释（第 13.3 节） |

### 13.2 [`world_map.md`](world_map.md) 第 8.1 节的已决事项

| 事项 | 结论 |
| --- | --- |
| 1 D、E、F 编号与子条目写法 | 采纳；补登条目按第 9 节 |
| 2 第四幕起的国别风格包编号 | 采纳 7 个，编号以 `../../50_tech/art_pipeline.md` 第 1.4 节为准（第 2 节） |
| 3 正典未给的距离 | 采纳；第 9.1 节补登路段的距离一并落定：格兰提斯到红砾城 100 公里（大陆图 4 日）、金湾到渊主沉骸 300 公里海路、环木议庭到枯环 60 公里、触穹峰顶到堕勇之墓 40 公里山路、黯冠城到角冠宫废墟 50 公里、到试锋谷 125 公里（大陆图 5 日）、到王胎渊 70 公里 |
| 4 庭外之国的国都 | 国都就是第三幕末领主府的所在（边石镇或旧哨村，第三幕"领主府候选"的结果）；图集第四、五幕的可达性枢纽固定为边石镇，与国都选址无关 |
| 5 夜境黑市、月井、祖灵石的坐落 | 采纳：黑市与月井在黯冠城（D8），祖灵石在风牙岩（D5） |
| 6 行程换算、途中事件掷法、个人在世界图上的行程 | 采纳，细则在 [`travel_and_exploration.md`](../systems/travel_and_exploration.md) 第 2、3 节 |
| 7 `MapDef.region` 用图集区域 id | 采纳（第 1.3 节） |
| 8 锈岭矿的风格包 | `forge_deep`，锈岭矿、锈岭矿深层与赤砧山诸炉共用 |

### 13.3 对其他文件的请求

| 文件 | 位置 | 请求 |
| --- | --- | --- |
| `docs/30_story/arcs/act1_borderstone.md` | 2.3 W2 | "东北丘陵里废弃的铁矿"写为"镇西北约 5 公里锈岭的旧铁矿口（矿口骑在界石线上，矿工叫它边石旧矿）" |
| 同上 | 2.1 第一段 | "南门通往瓦伦堡的王道"写为"南门通往瓦伦堡的南大路（镇民按老习惯把南门叫王道门：南大路往南最终汇入王道）" |
| `docs/20_world/geography.md` | 4.5 外缘表"可到达" | "第一幕到南沿与外缘南段（封门遗迹周边、折桥驿、晶沟、灰沙坡、碎门坡）；第二幕外缘全段开放（东西灰村、灰烬林）" |
| 同上 | 7.3 第三幕行、7.4 C6 行、6.4 第三幕行 | 银鞍桥写为"鹿渡（银鞍堡上游约 20 公里）"；C6 内容写"东线前哨（战场在上游的鹿渡）"；6.4 写"王道、银鞍桥与鹿渡" |
| 同上 | 4.3 距离与路线表 | 追加第 13.2 节第 3 条的距离（作为地理志的行程行） |
| `docs/30_story/arcs/act5_war_of_races.md` | 第 2.5、6.3 节与第 10、12 节表中表示"残澱爆散"的"灰暴" | 写为"灰爆"；新增命名表"灰暴 Ashburst"一行写为"灰爆 Ashburst" |
| `docs/30_story/arcs/act4_continental_board.md` | 4.2 建国事件链第 4 步之后 | 加一行"界石之战（`bat_a4_boundary_war`，地图 `boundary_cairn_battle`）：立国后 30 到 90 日的一个夜里，门徒会借封印受震叩封门，封印躁动的澱与门徒会精锐扑向界石垒，不认新国的邻居同夜从另一侧压来；守住则界石誓由众人复述" |
| `data/world/atlas_maps.json` | 全表 | 补登第 9.1 节 22 个条目；已建十张扩建后写实际尺寸；`frostbone_catacombs` 的 `levels` 为 36 到 42；`martyrlight_catacombs` 为 45 到 50；`rustridge_mine` 为 6 到 12；`ash_waste` 迁移后为 5 到 30；D2-1 的 `note` 写明含 `dg_skriva_vault` |
| `data/world/atlas_regions.json` | 全表 | 新区域 `earth`（`tier: realm`，`acts` [0, 7]，`style` `earth_modern`，无澱度）；`court_gap` 的 `acts` 为 [0, 1, 2, 3, 4, 5, 6, 7] |
| `data/world/atlas_maps.json` | 过场布景与主门坑 | 第 3 节 P1 到 P4、X2 到 X4 七个过场布景（`tier: scene`，`role: stage`，`status: planned`，不写 `hubOf`）；`main_gate_crater` 的 `acts` 为 [4, 5]，`note` 补"第四幕只开放坑沿的凿碑台与门框断面（`A4-S01`、`A4-S02`、`A4-M14` 与天启之后的天亮）" |
| `data/world/atlas_routes.json` | 全表 | 第 9.1 节的新路线；第四幕世界图到 `main_gate_crater` 的接入（省份 `thousand_gates`）；`borderstone_seal_ruins` 起点为 `borderstone_north`、公里 3；`valen_river` 只留船行；`orien_bridges` 拆为两条 |
| `docs/40_design/content/catalog_dungeons_bosses.md` 与 `content_bible.md` 4.4 | `dg_frostbone_crypt`、`dg_martyr_catacomb`、`dg_gate_stations` | 霜骨墓窟 36 到 42（首领 38、40、42，专属魔物同步加 10）；殉光地下墓 45 到 50（首领 46、48、50）；门站群的玻璃原段 30 到 35、灰海段 33 到 37（与第三幕 7.5 一致） |
| `docs/40_design/content/catalog_gathering_crafting.md` | 6.3 | 加 `node_waste_first_gate`（封门遗迹外庭门槛，special，T3，`mat_gate_dust`，第二幕末到第三幕） |
| `docs/40_design/content/catalog_bestiary.md` | 1.2 或 4 节前言 | 写明"野外刷新点可按所在图的等级带定级（`SpawnDef.level`），图鉴等级是地表种群的基准"；`black_ridge` 的地点写"铁杉林深处" |
| `docs/40_design/content/catalog_warfare_strategy.md` | 战场剧本 | 鹿渡、朝阳门之夜、界石之战、红帐血战四个剧本的 `map` 写本文的图集 id（已在战争目录第 5.24 节落地）；1 战场格 = 8 米 |
| 内核与世界系统（`src/systems/world/`） | 类型与校验 | `SpawnDef.level`；`requiresFlags` 支持否定；开关格 `switches`；`LocationDef.sediment`；跨图日程；7 种新装饰；`MapDef.sediment` 注释写正典级；`REGION_STYLE` 用图集键；图集校验加"`MapDef.region` 与 `sediment` 等于图集""`styleOf` 等于图集风格包"；城门"一个出口多种去处"的选择界面 |
| `docs/README.md` | 索引 | 加入本文与 `travel_and_exploration.md` |

## 14. 制作优先级与里程碑总表

| 里程碑 | 地图（编号） | 张数 | 说明 |
| --- | --- | --- | --- |
| M1 垂直切片 | P0 到 P4、X1 到 X4、A1 到 A10（A9 全地形与第一幕刷新组；X3 第六幕的中段与尽头在 M3） | 19 | 第一张扩建图是 A1，第一张新建图是 A2；区域图行进的第一条路段南大路在 M1 内可走（第一幕末） |
| M2 Alpha | B1、B3-1、B4、B5、B6、B6-1、B7；C1-1 到 C11（含 C3-1、C4-1、C9-3、C10-2 可选）；补登 A5-1、C9-4 到 C9-7；A9 的第二、三幕刷新组 | 33 | 五个战场在 M2 内进入 HD-2D（D-078）；荒原外缘替身内容在 C9、C10 上线时迁出 |
| M3 Beta | D1 到 D8（含子条目）、E1 到 E5、F1；补登 A1-1、D1-2、D3-2、D3-3、D4-2、D5-1、D5-2、D6-1、D8-1 到 D8-3、E4-1、E5-1；P0 第六幕审庭外观组 | 37 | 先做 7 个国别风格包，再按剧情权重：D1 与 D1-1、D3 与 D3-1、D4、E4、D4-1、D5、D6、D2 与 D2-1、D8；第五幕 E1、E2 最后联调 |
| M4 内容完成与打磨 | 全部 P2、P3 的回访变化与外观加料；度量复测 | 无新图 | 每张图跑第 15 节的验收 |

## 15. 校验与验收

**每张图上线时**（地图负责方自检，内容校验与测试强制）：

1. 图集一致：`MapDef.id`、`region`、`sediment`、`style` 与图集条目一致；`status` 为 `built`，尺寸为实际值；每个出口都被一条路线引用。
2. 动线度量：按所属模板（第 1.4 节）跑首次接触、警戒圈压线、等级梯度、遮挡、夜间照明、死路数，记进验收记录；不达标须写理由。
3. 外观层：`lookProblems` 零问题；装饰件数在上限内（例外按本文各图注明的上限）；室外图每个出口 4 格内有提示。
4. 内容引用：魔物、采集点、人物、迷宫、门、旗标的 ID 都存在于各自目录或数据；按图定级的刷新点写了 `level`。
5. 发现点：关键地点表里标"图、标、望、秘"的地点都登记为发现点；种类与经验条目的对应按 `travel_and_exploration.md` 第 6.2 节，经验按 `progression_and_pacing.md` 第 3.5 节。
6. 美术：本图增量素材都在提示词库有条目，里程碑与本图一致；底座素材已生成。

**测试**：`tests/world_atlas.test.ts` 钉住补登条目、新路线与"`MapDef.region` 等于图集"；`tests/look_layer.test.ts` 加新装饰种类与 `landmark_tree` 只落树格的正反例；
新增 `tests/map_metrics.test.ts`（真实地图上首次接触不少于模板值、营地压线不少于 3 米、多幕图在本幕旗标下的常驻等级不超过本幕等级带上限加 2），每张图一个用例。

## 16. 来源链接

- 正典：[`world_bible.md`](../../20_world/world_bible.md)、[`geography.md`](../../20_world/geography.md)、[`power_system.md`](../../20_world/power_system.md)、
  [`prologue_antechamber.md`](../../30_story/arcs/prologue_antechamber.md)、[`act1_borderstone.md`](../../30_story/arcs/act1_borderstone.md)、
  [`act2_wallenburg.md`](../../30_story/arcs/act2_wallenburg.md)、[`act3_lothar_crisis.md`](../../30_story/arcs/act3_lothar_crisis.md)、
  [`act4_continental_board.md`](../../30_story/arcs/act4_continental_board.md)、[`act5_war_of_races.md`](../../30_story/arcs/act5_war_of_races.md)、
  [`act6_review_and_epilogue.md`](../../30_story/arcs/act6_review_and_epilogue.md)。
- 决策：[`decision_log.md`](../../00_vision/decision_log.md) D-003、D-039、D-046、D-060、D-062、D-063、D-069、D-070、D-075、D-078，B-014、B-015。
- 设计：[`world_map.md`](world_map.md)、[`scene_flow.md`](scene_flow.md)、[`content_bible.md`](../content/content_bible.md)、
  [`catalog_dungeons_bosses.md`](../content/catalog_dungeons_bosses.md)、[`catalog_bestiary.md`](../content/catalog_bestiary.md)、
  [`catalog_gathering_crafting.md`](../content/catalog_gathering_crafting.md)、[`catalog_characters_lotha.md`](../content/catalog_characters_lotha.md)、
  [`catalog_characters_continent.md`](../content/catalog_characters_continent.md)、[`catalog_relics_lore.md`](../content/catalog_relics_lore.md)、
  [`catalog_creatures_mounts.md`](../content/catalog_creatures_mounts.md)、[`warfare_rts.md`](../systems/warfare_rts.md)、[`city_building.md`](../systems/city_building.md)、
  [`travel_and_exploration.md`](../systems/travel_and_exploration.md)。
- 技术：[`art_pipeline.md`](../../50_tech/art_pipeline.md)；代码 `src/systems/world/atlas.ts`（`atlasProblems`）、`src/systems/world/look.ts`（`STYLE_IDS`、`REGION_STYLE`、`DECOR_KINDS`、`lookProblems`）、
  `src/systems/world/types.ts`（`MapDef`、`SpawnDef`、`ExitDef`）、`src/client/render/scene.ts`（`sedimentLevel`）、`src/systems/city/placement.ts`（`previewPlacement`）。
- 数据：`data/world/atlas_maps.json`、`atlas_routes.json`、`atlas_regions.json`；`data/npc/maps.json`、`data/city/maps.json`、`data/scenes/maps.json`、`data/combat/maps/*.json`、
  `data/warfare/scenarios.json`、`data/strategy/map.json`。
- 调研：[`my_ai_town_visual_and_client.md`](../../10_research/art_style/my_ai_town_visual_and_client.md)（第 4.1、4.2 节：地图拓扑与路段时长）、
  [`game_dev_methodology.md`](../../10_research/open_share/game_dev_methodology.md)（第 3.1、4.2 节：挑战递进、地标与环境叙事）、
  [`city_rts_slg.md`](../../10_research/open_share/city_rts_slg.md)（第 4.1 节：安全区、风险区与高价值点）。
