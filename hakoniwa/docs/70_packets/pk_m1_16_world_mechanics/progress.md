# PK-M1-16 世界与地图机制：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施 1 | 机制、图集补登、十张图迁移、度量与测试；覆盖性复查后修正 | 未提交 | 见 `verification_matrix.md` 第 1、2 节 | 主会话提交；PK-M1-35 落图时删去度量登记 |

## 2. 汇报

### 2026-11-17 实施 1

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/world/sediment.ts` | 新增 | 正典级、渲染换算 `renderSedimentLevel`、局部热点 `sedimentAt`、校验 |
| `src/systems/world/switches.ts` | 新增 | 开关格：`closedSwitches`、`switchedMap`（按地图与关闭集合缓存）、`liveMap`、校验 |
| `src/systems/world/spawn_rules.ts` | 新增 | 否定条目 `flagListMet`、`flagListNames`，按图定级 `rollSpawnLevel`、`spawnLevelBand`，校验 |
| `src/systems/world/map_rules.ts` | 新增 | 门址 `isGateSite`、`gateSiteLanding`；汇总校验 `mapMechanicProblems`（含出口不认否定） |
| `src/systems/world/map_metrics.ts` | 新增 | 动线度量：入口、走路距离、首次接触、警戒圈压线、按幕旗标的常驻等级 |
| `src/systems/world/types.ts` | 修改 | `TILE_KINDS`、`SwitchDef`、`SpawnLevel`、`SpawnDef.level`、`LocationDef.sediment`、`MapDef.switches`，`region` 与 `sediment` 的注释 |
| `src/systems/world/index.ts` | 修改 | `walkMap`；移动、寻路、生成、传送与跳时读活地图；开关关在路上停步、关在身上推出 |
| `src/systems/world/look.ts` | 修改 | 7 种新装饰、`DECOR_LIGHTS`、`TREE_DECOR`（`landmark_tree` 只站树格）、`REGION_STYLE` 只留图集键（加 `earth`） |
| `src/systems/world/atlas.ts` | 修改 | `sky`、`battleSky`、`AtlasContentMap`；已建图的区域、澱度、风格包核对；`isCutsceneStage` 不参加可达性 |
| `src/systems/combat/spawning.ts` | 修改（越界） | 刷新判定走 `flagListMet`，旗标监听读否定条目的名字，按图定级，落点读活地图 |
| `src/systems/combat/abilities.ts` | 修改（越界） | 击退读活地图 |
| `src/systems/npc/places.ts`、`actions.ts`、`spawn.ts`、`schedule.ts`、`index.ts`、`chat.ts`、`diary.ts`、`types.ts` | 修改（越界） | 跨图日程：解析、换图瞬移、轨迹按家图引用、大模型日程只去模板里的外图地点、`npc.goto` 支持外图 |
| `src/systems/goddess/wake.ts` | 修改（越界） | 物品标签 `earth` 改为常量词表，免与新区域 `earth` 撞名（内容 ID 守卫） |
| `src/content/packs/world.ts` | 修改 | 图集表单加 `sky`、`battleSky`；地图校验调用 `mapMechanicProblems` |
| `src/content/packs/combat.ts`、`npc.ts` | 修改（越界） | 首领同步怪不得按图定级；跨图地点的报错写目标图 |
| `src/content/registry_refs.ts`、`registry_canon.ts` | 修改（越界） | 刷新点的否定条目按名字登记与改名；`openWhen` 是条件字段 |
| `src/editor/quests/flag_index.ts`、`src/editor/map/map_ui.ts` | 修改（越界） | 编辑器旗标索引认否定条目与 `openWhen`；澱度输入上限 6 |
| `src/client/render/scene.ts`、`decor_art.ts`、`src/client/hd2d/layout.ts` | 修改 | 渲染换算与局部热点；7 种装饰的程序化立牌；地标树替换该格的树；灯光表 |
| `tools/content/validators/namespace.ts` | 修改（越界） | V3：`dg_` 可作地图 id（A5-2），`door_corridor` 是地名不是门 |
| `data/world/atlas_regions.json`、`atlas_maps.json`、`atlas_routes.json` | 修改 | 区域 15、地图 89、路线 89 |
| `data/npc/maps.json`、`data/city/maps.json`、`data/scenes/maps.json`、`data/combat/maps/*.json` | 修改 | 十张图的 `region`、`sediment`；`forest_edge` 显式 `wild_forest`；`divine_court` 写 `sediment: 0` |
| `locales/zh-Hans/content.generated.json` | 再生成 | 新图集条目的名称与说明（同时带上了其他包当下的数据） |
| `tests/map_metrics.test.ts`、`tests/world_mechanics.test.ts`、`tests/client_world_mechanics.test.ts` | 新增 | 见验证矩阵 |
| `tests/world_atlas.test.ts`、`tests/look_layer.test.ts`、`tests/client_hd2d.test.ts`、`tests/time_skip.test.ts` | 修改 | 新规则的正反例与字面值钉住；`time_skip` 的林缘伏击概率按正典一级 |
| `docs/40_design/world/map_briefs.md`、`world_map.md` | 修改 | 第 1.2、1.3、1.10、9.1、13.3 节与图集文档第 2.1、4、6、9 节按现状改写 |
| `docs/40_design/world_state_registry.md` | 修改（越界） | 第 9.3 节第 1 条加 `openWhen` 与刷新点否定条目 |
| `docs/70_packets/pk_m1_16_world_mechanics/` | 新增 | 本包三件 |

**验收逐条结果**：见 `verification_matrix.md` 第 1 节。

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| `world_map.md` 第 2.1 节 | `edgestone_area` 一到二、`sleepscale` 一 | 放宽到一到三、一到四，并在区域说明里写明只有哪张图到上限 | 补登表 A5-1 是三、D6-1 是四；图集要求地图在区域区间内 | 是（README 第 11 节，不阻塞） |
| `map_briefs.md` 第 9.1 节 | A10-1 省份 `valen_plain` | 条目不写省份 | 大陆图省份表没有 `valen_plain`；战场不经世界图进入 | 否 |
| `map_briefs.md` 第 9.1 节 | A5-2、A10-1、A1-2 未给路线 id | `rustridge_old_mine`、`valen_fields_battle_call`（旧哨村）、`borderstone_rear_battle_call`（边石镇） | 每个出入口要有路线；A10-1 的编号挂在 A10 | 否 |
| `map_briefs.md` 第 13.3 节 | 第四幕世界图接入主门坑 | 外环到主门坑的坑沿小路 `ring_crater_rim`（第四幕） | 场景不经世界图进入；外环在第四幕经省份可达 | 否 |
| `map_briefs.md` 第 9.1 节 | `borderstone_north_trail` 与既有 `borderstone_north_road` | 新增前者（镇北小路，3 公里，0.7 小时）；后者保留为西北矿道 | A1、A2 简报里两条路线名分别指北门小路与西北矿道 | 否 |
| `map_briefs.md` 第 1.10 节 | 门址是地点 `kind: gate_site` | 另有主种类的地点带标签 `gate_site` 也算 | 封门遗迹神纹大厅与碎门坡是 `ruin` 加标签；不改它们的种类 | 否 |
| `map_briefs.md` 第 1.2 节 | 局部热点渲染 2 秒淡入 | 渲染按镜头焦点取局部值，暂不淡入 | 淡入要会话层状态，归客户端 | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `src/systems/combat/spawning.ts`、`abilities.ts`、`src/content/packs/combat.ts` | 按图定级、否定条目、开关格要在刷新与击退里生效 | 战斗 | 已改并告知 |
| `src/systems/npc/*`、`src/content/packs/npc.ts` | 跨图日程 | 社会 | 已改并告知 |
| `src/systems/goddess/wake.ts` | 新区域 `earth` 与物品标签字面量撞名 | 叙事 | 已改并告知 |
| `src/content/registry_*.ts`、`src/editor/quests/flag_index.ts`、`src/editor/map/map_ui.ts` | 新字段的登记与编辑器 | 内核、编辑器 | 已改并告知 |
| `tools/content/validators/namespace.ts` | 新地图 id 的命名空间例外 | 内容工具 | 已改并告知；该文件另有记录类包的改动，提交时分开 |
| `docs/40_design/world_state_registry.md` 第 9.3 节第 1 条 | 新的读取字段与否定写法 | 注册表 | 已改并告知 |
| `tests/time_skip.test.ts` | 林缘澱度从 2 改为正典 1 | 旅行 | 已改并告知 |

**行为改动（设计要求）**：十张图的澱度改为正典级后，`forest_edge` 2 到 1、`ash_waste` 4 到 2、`seal_ruins` 3 到 2、`wallenburg_sewers` 2 到 3。
读到它的有：营地睡眠的伏击概率（`src/systems/travel/rest.ts` 的 `ambushChance`，林缘与荒原外缘减半）、目击者规则（`src/systems/cognition/witness.ts`，林缘不再算澱地）、
渲染的雾与暗角（按换算表）。城建读数（旧哨村 1）不变。没有开关格的地图移动与寻路不变。

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 已建图未达动线模板（首次接触、营地压线、荒原外缘第一二幕的高等级组）：`tests/map_metrics.test.ts` 登记了现测值与改法 | PK-M1-35（A3、A4、A6、A9 的第一幕组）、PK-M2-19（B6）、PK-M2-20（A9 替身内容） |
| 第 12 节第 2、5、13、15 条的落图（封门遗迹门厅开关格与正门旗标、旧水道按图定级、装饰摆放、猎户跨图日程） | PK-M1-35；旧水道 PK-M2-19 |
| 客户端画出开关格开合（渲染、小地图、拾取都读内容地图；`liveMap` 是接缝），局部澱度的 2 秒淡入，城门一个出口多种去处 | PK-M1-24（最迟随第一张带开关格的图） |
| 幕切换时写入 `act.<n>.entered`（注册表第 8.5 节；现在没有写入方，分幕组的否定条目要它才生效） | PK-M1-45 |
| 被取代的分幕组在下一幕不清场（只停生成与补刷） | PK-M1-35 落分幕组时决定是否需要清场 |
| 按局部澱度的暴露；伏击与目击读 `sedimentAt` | PK-M1-51 |
| 开发计划包行写"图集补登 18 条"，补登表现为 22 条 | 主会话改计划 |

**风险**：无新增。

**需用户决定**：README 第 11 节第 1 条（不阻塞）。

**下一步与恢复方式**

1. 主会话按上表提交（`tools/content/validators/namespace.ts` 与 `locales/zh-Hans/content.generated.json` 里有其他包的改动）。
2. 计划第 4.2 节状态与 `project_state.md` 由主会话更新。
