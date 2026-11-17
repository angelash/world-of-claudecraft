# PK-M1-16 世界与地图机制（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-16` 世界与地图机制 |
| 状态 | 进行中 |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-16` |
| 形态 | 小包 |
| 工作流 | 系统 |
| 量级 | 4 代理人日，0.3 用户人日 |
| 依赖 | PK-M0-10（已完成） |
| 别名 | 无 |
| 立项日期 | 2026-11-17 |

## 1. 目标

地图简报第 1.10 节的机制在内核里可用（开关格、按图定级、否定旗标、局部澱度、跨图日程、7 种新装饰、门址），十张已建图的 `region` 与 `sediment` 换成图集区域与正典级，
图集登记全部 89 张图（67 个条目加第 9.1 节 22 个补登条目）与新路线，`atlasProblems` 核对地图与图集一致，动线度量有测试。

## 2. 范围与交付物

按决策 D-096 的切片优先：序章 P0 到 P4、舞台 X1 到 X4、第一幕 A1 到 A10 的条目与机制先做；第二幕起的条目随后同批登记。

| 序 | 范围条目 | 落点 | 设计依据（文档与节号） |
| --- | --- | --- | --- |
| 1 | 开关格 `MapDef.switches`（`closedTile`、`openWhen` 条件表达式）；世界系统的移动、寻路、落点与击退读按旗标算出的活地图；开关在路上关闭时停步、关在身上时推到最近可走格 | `src/systems/world/switches.ts`（`liveMap`、`switchedMap`、`switchProblems`）、`src/systems/world/index.ts`（`walkMap`）、`src/systems/combat/abilities.ts`、`src/systems/combat/spawning.ts` | `map_briefs.md` 第 1.10 节、第 12 节第 2 条 |
| 2 | `SpawnDef.level`（一个等级或等级段，与图鉴同一随机流）与 `requiresFlags` 的否定条目 `!名`（只在刷新点） | `src/systems/world/spawn_rules.ts`、`src/systems/combat/spawning.ts`；登记读取 `src/content/registry_refs.ts`、`registry_canon.ts`；编辑器 `src/editor/quests/flag_index.ts`；首领同步怪不得按图定级 `src/content/packs/combat.ts` | 第 1.6、1.10 节 |
| 3 | `MapDef.sediment` 存正典级、`LocationDef.sediment` 局部热点、渲染换算 round(级 × 7 / 6) | `src/systems/world/sediment.ts`、`src/client/render/scene.ts`（`sedimentLevel` 按镜头焦点）；编辑器上限 `src/editor/map/map_ui.ts` | 第 1.2 节；`art_pipeline.md` 第 2.8、2.12 节 |
| 4 | 跨图日程 `<地图>:<地点>` | `src/systems/npc/places.ts`（`resolvePlaceOn`、`placeRef`、`locationOfRef`）、`actions.ts`、`spawn.ts`、`schedule.ts`、`index.ts`、`chat.ts`、`diary.ts`；校验 `src/content/packs/npc.ts` | 第 1.10 节、第 12 节第 15 条 |
| 5 | 7 种新装饰（`standing_stone`、`doorframe`、`ground_mark`、`dry_well`、`shrine_ruin`、`landmark_tree`、`mine_lamp`）与门址 `gate_site` | `src/systems/world/look.ts`（`DECOR_KINDS`、`DECOR_LIGHTS`、`TREE_DECOR`、`lookProblems`）、`src/systems/world/map_rules.ts`（`isGateSite`、`gateSiteLanding`）、`src/client/render/decor_art.ts`、`src/client/hd2d/layout.ts` | 第 1.10 节、第 12 节第 13 条 |
| 6 | `MapDef.region` 用图集区域；十张图的 `region`、`sediment` 与 `forest_edge` 的显式风格包；`REGION_STYLE` 只留图集键 | `data/npc/maps.json`、`data/city/maps.json`、`data/scenes/maps.json`、`data/combat/maps/*.json`、`src/systems/world/look.ts` | 第 1.2、1.3 节 |
| 7 | 图集：新区域 `earth`、`court_gap` 全幕；7 个过场布景与 22 个补登条目；新路线与第 13.3 节的改动；`sky`、`battleSky` | `data/world/atlas_regions.json`、`atlas_maps.json`、`atlas_routes.json` | 第 3、9.1、13.3 节；`world_map.md` 第 2.1、9.1 节 |
| 8 | `atlasProblems` 扩充：地图的区域、澱度、风格包等于图集；天幕包与战场远山层；过场布景不参加可达性 | `src/systems/world/atlas.ts`、`src/content/packs/world.ts`（含 `mapMechanicProblems`） | 第 15 节第 1 条；`world_map.md` 第 9.2 节 |
| 9 | 动线度量与 `tests/map_metrics.test.ts` | `src/systems/world/map_metrics.ts` | 第 1.4、15 节；`scene_flow.md` 第 1、5 节 |
| 10 | 测试 | `tests/world_atlas.test.ts`、`tests/look_layer.test.ts`、`tests/map_metrics.test.ts`、`tests/world_mechanics.test.ts`、`tests/client_world_mechanics.test.ts` | 第 15 节 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 新建与扩建地图本身、第 12 节遗留修改的落图（刷新点外移、封门遗迹门厅开关格、按图定级的数据、装饰摆放、猎户的跨图日程） | PK-M1-35（第二幕的旧水道在 PK-M2-19，荒原外缘替身内容在 PK-M2-20） |
| 2 | 客户端画出开关格的开合（淡入淡出）、局部澱度的 2 秒淡入、城门"一个出口多种去处"的界面 | 客户端包（建议 PK-M1-24；最迟随第一张带开关格的图） |
| 3 | `act.<n>.entered` 在幕切换时写入 | 建议 PK-M1-45（幕时钟） |
| 4 | 按局部澱度的澱染暴露 | PK-M1-51 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 系统接缝、实体字段只经世界端口、系统不写内容 ID |
| [map_briefs.md](../../40_design/world/map_briefs.md) 第 1、9.1、12、13.3、15 节 | 机制定义、补登表、验收 |
| [world_map.md](../../40_design/world/world_map.md) 第 2.1、4、9 节 | 图集三表与校验规则 |
| `src/systems/world/` | 本包的接缝 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | 活地图只由旗标算出，不存进世界；按图定级与图鉴共用 `combat.spawn` 流且每只一次抽取 | `tests/world_mechanics.test.ts`、`tests/architecture.test.ts` |
| 行为不变 | 没有开关格的地图返回原对象，移动与寻路逐字节不变；澱度改正典级是设计要求的行为改动（见 `progress.md`） | `tests/grid_path.test.ts`、`tests/client_hd2d.test.ts` 的程序化基线 |
| 画质公平 | 澱的暗角与微粒在每个画质档都画（`art_pipeline.md` 第 2.12 节） | 渲染公式不按档分支 |
| 文本 | 系统代码无中文字面量 | `tests/i18n_kernel_guard.test.ts`、`tests/i18n_ui_guard.test.ts` |
| 内容 ID | 系统代码不写内容 ID | `tests/content_id_guard.test.ts` |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/world/sediment.ts`、`switches.ts`、`spawn_rules.ts`、`map_rules.ts`、`map_metrics.ts`；`tests/map_metrics.test.ts`、`tests/world_mechanics.test.ts`、`tests/client_world_mechanics.test.ts`；本目录 |
| 本包修改 | 见 `progress.md` 的改动文件表 |
| 越界改动 | `src/systems/combat/spawning.ts`、`abilities.ts`、`src/systems/npc/*`、`src/systems/goddess/wake.ts`、`src/content/packs/combat.ts`、`npc.ts`、`src/content/registry_*.ts`、`src/editor/quests/flag_index.ts`、`src/editor/map/map_ui.ts`、`tools/content/validators/namespace.ts`、`tests/time_skip.test.ts`、`docs/40_design/world_state_registry.md` 第 9.3 节第 1 条（逐条理由见 `progress.md`） |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。本包特有的：

| 序 | 条件 | 做法 |
| --- | --- | --- |
| 1 | 没有开关格的地图上世界哈希变化 | 停下定位；活地图对这类地图必须返回原对象 |

## 8. 验证命令

```
npx vitest run --config vitest.config.ts tests/world_atlas.test.ts tests/look_layer.test.ts tests/map_metrics.test.ts tests/world_mechanics.test.ts tests/client_world_mechanics.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 新起会话的覆盖性复查 | 必派 | 一次贡献结束；结论与处理见 `progress.md` |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、数据、测试、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；按 `progress.md` 的文件表提交 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 区域澱度区间放宽：`edgestone_area` 到一到三（锈岭矿深层三），`sleepscale` 到一到四（堕勇之墓四） | 推荐保留：补登表写定了这两张图的澱度，区间按地面最常见值写会让条目无法登记；另一选项是把这两张图按局部热点处理、条目降级 | 不阻塞 |
