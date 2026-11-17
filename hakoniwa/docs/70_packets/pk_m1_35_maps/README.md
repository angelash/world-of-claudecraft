# PK-M1-35 序章与第一幕地图（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-35` 序章与第一幕地图 |
| 状态 | 进行中（实施与验证已完成，建议主会话提交后改为"已完成"，见 [verification_matrix.md](verification_matrix.md)） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-35` |
| 形态 | 大包（9 代理人日）；按本目录约定只写入口、验收与进度三件 |
| 工作流 | 内容（地图数据） |
| 量级 | 9 代理人日，1.5 用户人日 |
| 依赖 | PK-M1-16 世界与地图机制（开关格、按图定级、否定旗标、局部澱度、跨图日程、新装饰、门址、动线度量，已完成）；PK-M1-50 迷宫运行时（层、入口、塌陷开关，已完成）；PK-M1-54 序章舞台机制（P2 的门，已完成） |
| 别名 | 无 |
| 立项日期 | 2026-11-17 |

## 1. 目标

[地图简报](../../40_design/world/map_briefs.md)第 14 节 M1 的十九张图（P0 到 P4、X1 到 X4、A1 到 A10）与迷宫子场景 `dg_old_mine`、醉月亭地窖 `dg_moon_cellar` 落成数据：每张图按简报的尺寸、风格包、澱度、布局、地点、出入口、魔物、照明与装饰建好，图集登记为已建，扩建图有平移表，
每张图通过第 15 节的上线检查（图集一致、动线度量、外观层、内容引用、发现点）。

## 2. 范围与交付物

序章先行（D-096）：先做 P0 到 P4 与 X1 到 X4，再按第一幕 VS-A（A3、A4、A1、A2、A6、A5）、VS-B（A7、A8、A9、A10）的顺序，最后是迷宫子场景。

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | P0 候见厅扩建 32×24（平移 (4, 4)，北半审庭纵深 10 格；灵镜按第 12 节第 12 条）；新游戏出生点随平移 | `data/scenes/maps.json`；`src/content/packs/scenes.ts` 的 `worldStarts` | 简报 P0、第 12 节第 12 条 |
| 2 | P1 到 P4 地球四景、X2 坠落、X3 千门回廊（全长 64×16，第六幕中段与尽头的陈设在 M3）、X4 梦中的门口 | `data/scenes/maps.json` | 简报 P1 到 P4、X2 到 X4 |
| 3 | P2 世界内的门：地球四景的门位与转角地点（标签 `stage_door`、`door_corner:<0 到 3>`、`stage_start`） | 同上 | 序章第 1、7 节 N2；PK-M1-54 交接 |
| 4 | X1 门内庭院扩建 48×40（平移 (12, 10)，外圈雾中草地；池塘、木桌、回廊边缘地点；门影门框） | `data/city/maps.json` | 简报 X1 |
| 5 | A1 边石镇扩建 96×80（平移 (20, 18)）：北门外镇北小路、西口西北矿道、驿站马厩院、矿工棚、墓园墓碑、边石；醉月亭主门移到南墙、驿站东门；`looks` 招牌与钟楼墙高；北泉局部澱度二；醉月亭地窖室内层 | `data/npc/maps.json` | 简报 A1、第 12 节第 7、8、9、13、14 条 |
| 6 | A2 镇北与界石线 128×96 新建（界石线、残阶坡、锈岭矿口、矿工工棚、祛灰草洼、灰路、灰溪、冬营） | `data/combat/maps/borderstone_north.json` | 简报 A2 |
| 7 | A3 封门遗迹扩建 64×48（平移 (14, 8)）：外庭柱廊与六神纹门楣、两翼回廊、阶顶前室；门厅落石开关格 `gate_hall_rockfall`；外环两组并入回廊；回廊与落灰阶局部澱度三；`indoor` 改为假 | `data/combat/maps/seal_ruins.json` | 简报 A3、第 12 节第 2、13 条 |
| 8 | A4 封门遗迹深处扩建 48×40（平移 (9, 8)）：阶底平台、鼠洞、首领前平台、渗泉暗渠全段 | `data/combat/maps/seal_ruins_depths.json` | 简报 A4 |
| 9 | A5 锈岭矿 64×64 与 A5-2 边石旧矿 48×48 新建：矿口前室、T 形主巷、东西废巷、塌方口开关格 `mine_collapse`；旧矿下层的晶脉洞、走私营地、晶背之母的巢、空心石裂缝（开关格 `hollow_rift_seal`，第三幕）、旧通风竖井捷径 | `data/combat/maps/rustridge_mine.json`、`dg_old_mine.json` | 简报 A5、第 9.1 节 A5-2；迷宫目录第 3.1.2 节 |
| 10 | A6 铁杉林林缘扩建 112×80（平移 (0, 24)）：老林深处、蛛谷与狼穴东延、猎径口、南路哨与伐区；约树地标树；第 12 节第 4 条的刷新点外移 | `data/combat/maps/forest_edge.json` | 简报 A6、第 12 节第 4、15 条 |
| 11 | A7 铁杉林深处 128×128、A8 灰溪上游与折桥驿 128×96 新建 | `data/combat/maps/ironhemlock_deep.json`、`brokenspan_post.json` | 简报 A7、A8 |
| 12 | A9 荒原外缘扩建 128×112（平移 (40, 72)）全地形与第一幕刷新组；替身内容按第 11 节过渡期加幕次旗标 | `data/combat/maps/ash_waste.json` | 简报 A9、第 11 节、第 12 节第 3 条 |
| 13 | A10 旧哨村扩建 96×80（平移 (24, 20)）：旧巡逻道东西段、北林带、三块新用地；干井与村祠换为可走地块加装饰 | `data/city/maps.json` | 简报 A10、第 12 节第 11 条 |
| 14 | 迷宫记录：`dg_seal_ruins` 的入口改到 A2 残阶坡下；新增 `dg_old_mine`（上层为锈岭矿主巷矩形，下层为旧矿整图）与 `dg_moon_cellar`（边石镇室内层） | `data/dungeons/dungeons.json` | 迷宫目录第 3.1 节；PK-M1-50 交接 |
| 15 | 图集：十九张图与 A5-2 记为已建并写实际尺寸；新路线 `old_mine_vent_shaft`；已建路线的出口 | `data/world/atlas_maps.json`、`atlas_routes.json` | 简报第 1.9、15 节；`world_map.md` 第 7 节 |
| 16 | 扩建图的存档迁移数据：平移表与锚点 | `data/world/map_shifts.json` | 简报第 1.11 节第 5 条 |
| 17 | 发现点：关键地点表的"图、标、望、秘"写进地点的 `discovery` | 各地图数据 | 简报第 1.5 节；`travel_and_exploration.md` 第 6.2、6.3 节 |
| 18 | 上线检查的测试 | `tests/map_launch.test.ts`（新增）；`tests/map_metrics.test.ts`、`world_atlas.test.ts`、`look_layer.test.ts` | 简报第 15 节 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 魔物、首领与迷宫处置的内容（图鉴里尚无的种类不落刷新点，位置写进汇报） | PK-M1-12、PK-M1-30 |
| 2 | 人设卡、日程与无名居民模板（猎户、矿工的跨图日程） | PK-M1-18 |
| 3 | 采集点记录（引用本包的地图与地点） | PK-M1-49 |
| 4 | 世界版本迁移步骤的代码（M2 兼容承诺之前由内核接线，数据见 `data/world/map_shifts.json`） | 内核 |
| 5 | 区域图出口（南大路、北沿、旧巡逻道东段）与第三幕起的出口（骨原、锈岭矿深层） | PK-M1-17、M2 地图包 |
| 6 | 开关格开合的淡入、室内层的画法、地球陈设的立牌 | PK-M1-24、镜头导演包 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则 |
| [map_briefs.md](../../40_design/world/map_briefs.md) 第 1、3、4、9.1、11、12、14、15 节 | 每张图的简报与上线检查 |
| [PK-M1-16](../pk_m1_16_world_mechanics/README.md) | 地图机制与度量 |
| [PK-M1-50](../pk_m1_50_dungeons/README.md) | 迷宫的层与入口 |
| [progress.md](progress.md) 第 0 节 | 已发布的地图与地点 ID |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 只改数据 | 系统代码（`src/systems/**`、`src/core/**`、`src/client/**`）不改；代码需要写成请求 | 评审 |
| 不改名 | 既有地图 ID 不改；既有地点与出口的 ID 不改（例外见 `progress.md`） | `tests/map_launch.test.ts` |
| 扩建先平移 | 旧网格整体平移，地点、出口、刷新点与装饰的相对位置不变；锚点进平移表 | `tests/map_launch.test.ts` 的平移用例 |
| 动线 | 野外与迷宫首次接触不少于 8 米、安全点与警戒圈相距不少于 3 米、多幕图常驻等级不超过本幕上限加 2 | `tests/map_metrics.test.ts` |
| 文本 | 地名经内容文本管线（`c.maps.*`），`src/` 无中文 | `node tools/i18n/check.ts`、V10 |
| 禁用字符 | 无破折号、emoji、U+2600 到 U+27BF | Stop 钩子、`tests/docs_guard.test.ts` |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `data/combat/maps/borderstone_north.json`、`rustridge_mine.json`、`dg_old_mine.json`、`ironhemlock_deep.json`、`brokenspan_post.json`；`data/world/map_shifts.json`；`tests/map_launch.test.ts`；本目录 |
| 本包修改 | `data/scenes/maps.json`、`data/city/maps.json`、`data/npc/maps.json`（只改 `borderstone`）、`data/combat/maps/seal_ruins.json`、`seal_ruins_depths.json`、`forest_edge.json`、`ash_waste.json`、`data/world/atlas_maps.json`、`atlas_routes.json`、`data/dungeons/dungeons.json`、`tests/map_metrics.test.ts`、`world_atlas.test.ts`、`look_layer.test.ts`、`tests/fixtures/procedural_baseline.json`（八张扩建图的布局摘要） |
| 越界改动 | 见 `progress.md` 第 2 节的越界表（内容包两处、他包测试里写死的坐标） |
| 生成物 | `locales/zh-Hans/content.generated.json`、`src/core/text_keys.generated.ts`（同时带上了其他包当下的数据） |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。本包特有的：

| 序 | 条件 | 做法 |
| --- | --- | --- |
| 1 | 自动玩家在改过的图上停住 | 修图或把停住的位置与原因写进汇报 |
| 2 | 引用的魔物、人物在目录里不存在 | 不落刷新点，写进请求 |

## 8. 验证命令

```
npx vitest run --config vitest.config.ts tests/map_launch.test.ts tests/map_metrics.test.ts tests/world_atlas.test.ts tests/look_layer.test.ts tests/world_mechanics.test.ts tests/client_hd2d.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npm test
npm run playthrough
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 新起会话的覆盖审查（对照简报第 15 节） | 必派 | 一次贡献结束；结论与处理见 [verification_matrix.md](verification_matrix.md) 第 3 节 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 地图与地点 ID（`progress.md` 第 0 节） | PK-M1-27、PK-M1-30、PK-M1-49、PK-M1-18 | 过场、任务、迷宫处置、采集点、日程按这些 ID 写 |
| 平移表 `data/world/map_shifts.json` | 内核 | 兼容承诺起点前接成世界版本迁移步骤 |
| 请求清单（`progress.md` 第 2 节） | 各负责方 | 逐条处理 |
| 代码、数据、测试、本目录三件 | 主会话 | 抽看验证矩阵；按 `progress.md` 的文件表提交 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 边石镇北门内的到达点是否改名 `gate_borderstone_north`、封门遗迹南来的到达点是否改名 `gate_borderstone_north`（简报 A1 与第 1.11 节的命名） | 推荐暂不改名：旧名被社会包的必需到达点、兽潮波次与迷宫记录引用，改名要跨三个包并进重命名表；等下一次统一改名时一起做 | 不阻塞 |
| 2 | 边石旧矿的拆分：简报 A5 把上下两层都写在锈岭矿，第 9.1 节又补登了 48×48 的子场景 `dg_old_mine` | 推荐本包做法：锈岭矿是矿口、主巷、废巷与塌方口（迷宫上层），`dg_old_mine` 是塌方口下去的旧矿下层；简报 A5 与第 9.1 节按此改写 | 不阻塞 |
| 3 | 世界每 tick 模拟所有地图上的魔物，第一幕新增五张有刷新点的图后，全系统世界的耗时约增一到三成，几项重测试在并行全量跑时超过 30 秒的超时 | 推荐由内核与战斗包让无人地图上的魔物降频或休眠；另一选项是削减各图的魔物组 | 不阻塞本包，影响全量门的稳定 |
| 4 | 封门遗迹门厅落石何时打开：简报要首访出不了正门、第 3 周从内侧清开；但没有清开的写入方，自动玩家又要出遗迹练级才打巨鸦，且换图寻路不看开关格 | 推荐本包做法：见到阿什之后门厅即通（`a1_ruins_gate_cleared OR a1_ash_met`），等清开落石的任务与自动玩家的开关格寻路都有了再收回；另一选项是完全按简报，需要先改自动玩家 | 不阻塞本包；收回前必须先改自动玩家 |
