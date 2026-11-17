# PK-M1-16 世界与地图机制：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS |
| 末次代码或内容变更 | 未提交；文件表见 `progress.md` |
| 完整实跑 | 2026-11-17；工作区状态（含其他包未提交的改动） |
| 审查 | 新起会话的覆盖性复查一次：18 条，全部处理（第 3 节） |
| 遗留 | `progress.md` "留给后续包的事项"：PK-M1-35、PK-M1-24、PK-M1-45、PK-M1-51、PK-M2-19、PK-M2-20 |

## 1. 验收条目

| 序 | 验收 | 命令或评审 | 结果（原样要点与量化数字） | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | `tests/world_atlas.test.ts` 通过 | `npx vitest run --config vitest.config.ts tests/world_atlas.test.ts` | 49 passed | 本表 | PASS |
| 2 | 外观层测试通过 | `npx vitest run --config vitest.config.ts tests/look_layer.test.ts tests/client_world_mechanics.test.ts` | 两个文件全过（新装饰 7 种、`landmark_tree` 只落树格的正反例、矿灯光照、区域表 14 个图集键） | 本表 | PASS |
| 3 | `tests/map_metrics.test.ts` 通过 | `npx vitest run --config vitest.config.ts tests/map_metrics.test.ts` | 18 passed；十张已建图各一个用例；未达标的五张图登记现测值与改法 | `progress.md` 留给后续包的事项 | PASS |
| 4 | 机制的内核路径 | `npx vitest run --config vitest.config.ts tests/world_mechanics.test.ts` | 28 passed：澱度换算与热点、开关格（寻路、停步、推出、传送、转向）、否定条目与旗标监听、按图定级与抽取次数、首领同步禁按图定级、门址（含标签）、出口不认否定、跨图日程（生成、回家、差使、提议、校验）、登记读取与改名、编辑器索引、命名空间例外 | 本表 | PASS |
| 5 | 地图简报第 15 节第 1 条：已建图的区域、澱度、风格包等于图集 | 同序 1（`atlasProblems` 全部交叉检查） | 零问题；十张图的区域与澱度以字面值钉住 | 本表 | PASS |
| 6 | 补登条目与新路线 | 同序 1 | 89 张图（7 个过场布景、22 个补登）、89 条路线；新条目与新路线逐字段钉住 | 本表 | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 退出码 0 | PASS |
| 受影响的套件 | `npx vitest run --config vitest.config.ts`（33 个文件：本包测试、`grid_path`、`npc`、`combat`、`cognition`、`goddess`、`city`、`time_skip`、`architecture`、`content_id_guard`、`content_validation`、两个 i18n 守卫、`registry`、编辑器四个、客户端五个、`save_migration`、`save_versions`、`replay_segments`、`core`、`docs_guard`、`dialogue`） | 是 | 33 files，731 passed | PASS |
| 默认套件 | `npx vitest run --config vitest.config.ts` | 是 | 125 files，2411 passed，2 skipped，3 failed；3 条都是第 4 节的基线，本包引起的失败为 0 | PASS |
| 内容校验 | `node tools/content/validate.ts` | 是 | V1 到 V10 全绿（警告均为既有） | PASS |
| 注册表 | `node tools/registry/build.ts --check` | 是 | 通过 | PASS |
| 文本 | `node tools/i18n/check.ts` | 是 | 0 finding | PASS |
| 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 是 | 11 passed | PASS |
| 改动文件格式 | `npm run format -- <改动的 TS 与 JSON>` | 是 | 无格式差异；一条既有 lint 警告（`orderMove` 的可选链） | PASS |
| 程序化基线 | `tests/client_hd2d.test.ts` 的"no art: the built maps draw as in the first round" | 是 | 十张图的风格包、布局与屋顶摘要不变 | PASS |
| 通关 | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts tests/playthrough/act1_minimal.playthrough.test.ts` | 是 | 2 files，2 passed（1622 秒，与其他会话并行） | PASS |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 新起会话的覆盖性复查 | 一次贡献结束 | 18 条发现 | 0 | 9 | 已修：闲聊轨迹的家图引用、击退与刷新落点读活地图、开关在路上关闭与关在身上、否定条目只在刷新点（登记、改名、编辑器、出口校验）、编辑器 `openWhen`、门址认标签、补测试、度量不再空过、首领同步禁按图定级、编辑器澱度上限、跨图日程三处小问题、`divineLevel` 去掉地图 id、文档回写；转后续：客户端画开关格（PK-M1-24）、被取代分幕组不清场与 `act.<n>.entered` 写入（PK-M1-35、PK-M1-45）、伏击与目击读局部澱度（PK-M1-51） | 本会话 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npx vitest run --config vitest.config.ts` | `tests/art_manifest.test.ts`（`assets/art/` 下未登记的用户图片） | 任务书列为已知基线；失败内容只涉及 `assets/art/` 的文件 | 素材导入 |
| `npx vitest run --config vitest.config.ts` | `tests/architecture.test.ts` 的 content/ 与 systems/ "no DOM access" 两条 | 命中的 `src/content/packs/quests.ts`、`src/systems/quests/progress.ts`、`types.ts` 是并行会话正在改的任务模型文件，本包未触及；本包改动后的第一次全量实跑这两条是绿的 | 任务模型包（并行会话） |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 开关格与局部澱度的画面 | 没有地图用开关格；客户端未画开关格开合 | PK-M1-24 或第一张带开关格的图（PK-M1-35） |
