# PK-M1-24 HD-2D 表现补全：验收与证据

> 入口见 [README.md](README.md)；进度与汇报见 [progress.md](progress.md)。状态只用 PASS、FAIL、VERIFY、N/A。

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS：公平清单逐项核对通过、各画质档与公平天气已截图；截图回归的自动比对与 BM-01 推荐机帧率因 PK-M1-08、PK-M1-05 未开始而以手工截图与最近场景实测代替（VERIFY）；遗留见 [progress.md](progress.md) 第 3 节 |
| 末次代码或内容变更 | 未提交；改动文件见 [README.md](README.md) 第 6 节 |
| 完整实跑 | 2026-11-18，共享工作区（含其他并行包的未提交改动，见第 4 节） |
| 审查 | 新起会话的审查两份：正确性与公平一侧 26 条（1 条 BLOCKING）；每帧开销一侧 20 条（0 条 BLOCKING）；处理见第 3 节 |

## 1. 验收条目

### 1.1 包行验收

| 验收 | 方法 | 结果 | 状态 |
| --- | --- | --- | --- |
| 截图回归 | 自动比对的工具（`tests/visual/`）属 PK-M1-08，尚未开始；本包以真实浏览器（Chrome，ANGLE D3D11）截图代替：序章、第一幕边石镇、林缘，四个画质档（高、中、低、平面）乘四种天气（晴、雷雨、浓雾、落灰），天幕与界外 | 截图在会话临时目录，未入库；画面逐张核对，见第 2 节 | VERIFY（等 PK-M1-08 入库基线） |
| 公平清单核对 | 第 1.2 节逐项；冻结的战斗（一只敌人读条中的范围施法、内核预警锁定的 6 格、仇恨、屏幕外的仇恨敌人） | 16 张公平截图里每项都在 | PASS |
| BM-01 达推荐机帧率 | BM-01 与推荐机基线属 PK-M1-05，尚未开始；在最近的现有场景（第一幕边石镇 47 个实体、林缘 34 个实体）上每帧强制重画测 5 秒 | 见第 2.2 节 | VERIFY（测量机不是推荐参考机，且与其他代理共用） |

### 1.2 战斗表现公平清单（美术方案第 2.12、4.10 节）

| 项目 | 所有画质档 | 证据 | 状态 |
| --- | --- | --- | --- |
| 地面预警 | 形状、颜色、读条填充保留，在天气与雾之后画；内核预警画锁定的格子，跟随与标记画圆，脉冲区闪边 | `tests/client_hd2d_completion.test.ts`（"draws kernel cells"、"draws the weather first"、"fills warnings first"）；`tests/client_stage_direct.test.ts`（"draws the kernel warnings"）；公平截图 16 张 | PASS |
| 敌方施法条与可否打断 | 保留；按内核 `interruptibleNow`，不可打断带盾形边框；引导递减 | "shows cast bars and edge arrows only where the rules say"、"drains a channel"；截图 | PASS |
| 首领与敌人的预备动作 | 动画只看动作状态，不读画质档 | `render/anim_state.ts` 无画质输入（`KEPT_EVERY_TIER` 的 `windup_frames`） | PASS |
| 屏幕外威胁箭头 | 保留；首领更大带纹章；软锁定候选同样有箭头 | "puts edge arrows on the inset screen edge"；截图右缘箭头 | PASS |
| 仇恨标识 | 名字染红并总显示（屋顶下除外），外圈细环（两种渲染器） | "keeps an attacking enemy named in red"；截图 | PASS |
| 被挡住的自身与队友剪影 | HD-2D 用"更远才画"的深度测试；平面档按被后画物体覆盖的像素画棋盘格 | 截图（玩家被树挡住时的剪影）；`render/flat_renderer.ts` `silhouette` | PASS |
| 澱度提示 | 雾、动作色调之下仍保留澱的暗角与微粒；2 秒渐变 | "eases the haze to a new level over two seconds"；HD-2D 与平面档的色调都让位于澱的暗角 | PASS |
| 天气与雾 | 雾层不透明度上限 0.35，粒子 0.75，调色雾 0.2，闪电 0.35；两种渲染器都按上限 | "caps fog, particles and haze"；暴雨、浓雾、落灰截图里预警与选择环清楚 | PASS |
| 画质档只是观感开关 | `QUALITY_TIERS` 每档字段都在 `QUALITY_KNOBS` 白名单内；覆盖层与战斗标记不读画质档 | "lets a quality tier hold look knobs only" | PASS |
| 命中火花、技能特效、屏震与顿帧、闪白的描边替代 | 目前没有特效系统 | 见 [progress.md](progress.md) 第 3 节 | N/A |

### 1.3 范围条目

| 条目 | 证据 | 状态 |
| --- | --- | --- |
| 4 向显示按投影量化 | "four display directions follow the projected facing" | PASS |
| 远景天幕 | "the far sky" 一组 7 项；截图：黎明的远山、林线、云带与渐变，俯视时只剩界外与轻雾 | PASS |
| 窗光采样抗锯齿 | "window light takes the pixel sampling of the colour map" | PASS |
| 四坡屋顶像素密度 | "the hip roof keeps the pixel density of its slopes"（三种矩形，檐边 16 像素每米） | PASS |
| 接触阴影与选中环像素化 | "ground marks are pixel art at the ground resolution" | PASS |
| 光照图与动态光颜色统一 | "the light map and the dynamic lights share one light model"（40 乘 40 像素逐个与 GLSL 动态光路径的 JS 写法相等） | PASS |
| 界外轻雾 | 截图 | PASS |
| 开关格开合淡入淡出 | "paints closed switches into the live map"、"fades only the switches that changed"；地图上暂无翻转中的开关格，浏览器未见实例 | PASS（画面待第一张翻转开关格的图） |
| 局部澱度两秒渐变 | "eases the haze" | PASS |
| 城门一出口多去处 | "a gate with several ways out" 三项；现有地图没有一格多出口，浏览器未见实例 | PASS（画面待 PK-M1-35 的城门） |
| 演出指令 | "the stage records the world directives"、"a shot of the stage camera" 四项、"light, mood and weather" 四项、"staged motions and the court mirror" 两项、"the shipped scenes speak the stage vocabulary"（序章的全部指令都在词汇内） | PASS |

## 2. 浏览器核对

### 2.1 过程

开发服务 `npx vite --config vite.config.ts --mode nohmr --port 5247 --strictPort`（5180、5190 被其他会话占用；带热更新时被其他代理改 `data/audio/cues.json` 触发整页重载一次，改用 nohmr），puppeteer-core 驱动 Chrome 无头模式（`--use-angle=d3d11`，渲染器 ANGLE NVIDIA GeForce RTX 4060 Laptop GPU），1920 乘 1080，设备像素比 1。
新的旅程开局进序章（演出化的开场，镜头、时段与雨天指令在数据里），再把场景清掉传送到第一幕边石镇与林缘。控制台：只有一条 404 资源请求（`assets/` 的素材清单之外的文件，与本包无关），没有页面异常。核对后停掉服务。

### 2.2 帧时间（每帧强制重画，5 秒）

| 场景 | 画质档 | 平均 | 中位 | p95 |
| --- | --- | --- | --- | --- |
| 边石镇（47 个实体） | 高 | 10.92 毫秒 | 8.8 毫秒 | 14.8 毫秒 |
| 边石镇 | 中 | 9.72 毫秒 | 8.4 毫秒 | 14.8 毫秒 |
| 边石镇 | 低 | 7.68 毫秒 | 6.5 毫秒 | 13.6 毫秒 |
| 边石镇 | 平面 | 21.29 毫秒 | 13.1 毫秒 | 105 毫秒 |
| 林缘（34 个实体） | 高 | 14.48 毫秒 | 14.1 毫秒 | 20.5 毫秒 |
| 林缘 | 中 | 14.13 毫秒 | 13.5 毫秒 | 20.7 毫秒 |
| 林缘 | 低 | 13.62 毫秒 | 13.1 毫秒 | 20.0 毫秒 |

天幕通道开与关的对比（边石镇高档，重复跑一次）：中位 15.8 与 15.6 毫秒，天幕的开销在噪声以内。同一台机器上其他代理在跑测试，重复测量的平均值相差到一倍（平面档关掉剪影的对照反而更慢），所以这些数只说明量级：高档中位在 9 到 16 毫秒之间，高于 60 帧所需的 16.7 毫秒的帧只出现在 p95 一侧。推荐参考机上的 BM-01 由 PK-M1-05 给出。

## 3. 审查

| 审查 | 发现 | BLOCKING | SHOULD-FIX | 处理 |
| --- | --- | --- | --- | --- |
| 新起会话：正确性与画质公平 | 26 条 | 1 | 15 | BLOCKING 已修：地面预警改读内核的 `telegraphsOn`（锁定格、跟随圆、脉冲），有内核预警的施法不再画合成的圆。SHOULD-FIX 已修：施法条按 `interruptibleNow` 与引导递减；天幕随镜头方向；开关格矩形东南边缘的墙面；色调淡出与交替；剧场不再让世界流动；平面档剪影；仇恨名字总显示；选择弹层不吞按键松开、忽略连发；词汇外取值退回默认并加数据核对；平面档色调让位于澱度暗角；软锁定候选的边缘箭头。转遗留：直线箭头与威胁等级颜色、脉冲闪边以外的预警像素贴花、开关格与庭镜整图重烘（见 [progress.md](progress.md) 第 3 节） |
| 新起会话：每帧开销 | 20 条 | 0 | 11 | 已修：光照图绘制把颜色换算提出像素循环；天幕通道放到不透明物体之后并开深度测试、换成不用正弦的散列、雾的时间取模；天幕横条有界缓存（6 条）且纹理不再复制；云带占位预先算好起伏表；施法条与屏幕外箭头的签名只看看得见的变化；战斗标记每 tick 读一次并复用本帧的实体表；地面标记按尺寸缓存在实体上；庭镜开启时只建一次上下文、按水面帧重画；模态打开时世界画面静止；移动标记材质与平面档旧地面的释放。转遗留：开关格变化整图重建（约 60 到 130 毫秒一次，随 PK-M1-03 地面分块）；淡化期间两份静态场景都提交；新着色器程序未预编译 |

## 4. 完整实跑与基线

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 0 个错误（退出码 0） |
| `node tools/i18n/check.ts` | 0 条发现，扫描 2327 处键使用 |
| 本包测试：`tests/client_hd2d_completion.test.ts`、`tests/client_stage_direct.test.ts` | 32 项、21 项全部通过 |
| 本包相关 13 个文件（含 `client_purity`、`client_frame_scheduler`、`client_hd2d`、`client_world_mechanics`、`client_story`、`client_prologue_stage`、`client_sprites`、`client_assets`、`client_adapters`、`architecture`、`i18n_ui_guard`） | 409 项全部通过 |
| 基线 `tests/art_manifest.test.ts` | 18 通过，1 失败：`assets/art/backgrounds/` 下第三方新生成的文件尚未登记（"unregistered"），与本包无关 |
| `npm test` | 169 个文件中 149 个通过；3366 项通过、36 项失败、23 项跳过。失败的 20 个文件都不经过 `src/client/`：战斗与首领机制（`boss_mechanics`、`combat`、`combat_rules`、`scenes` 的整局用例卡在 `src/systems/combat/telegraph.ts`，PK-M1-12）；序章内容（`client_player_input` 的输入次数、`registry`，PK-M1-27）；NPC 与纷争（`disputes`、`core`，PK-M1-18）；跳时、存档与重放（`time_skip`、`save_migration`、`save_recovery`、`replay_segments`、`doors_costs`、`doors_hints`、`party`、`ailments`、`ailments_pacing`，并行包的数据与内核改动）；`docs_guard`（PK-M1-35 包目录缺 `verification_matrix.md`）；第三方素材 `art_manifest`；他人的临时文件 `zz_tmp_debug3` |
| `npm run build` | 成功（退出码 0；只有分块大小的既有提示） |

`tests/fixtures/procedural_baseline.json`：本包只改两项摘要，`wallenburg` 的屋顶（四坡屋顶贴图坐标）与 `quality`（加了 `skyLayers`）；其余地图的布局与屋顶摘要随 PK-M1-35 的地图改动由其负责方重算。
