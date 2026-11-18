# PK-M1-24 HD-2D 表现补全：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-18 | 实施、审查与修复 | 全部范围条目；两份新起会话审查（正确性与公平、每帧开销）的 BLOCKING 与多数 SHOULD-FIX 已修 | 未提交 | 见 [verification_matrix.md](verification_matrix.md) 第 1、2 节 | 1. 主会话提交；2. 其他并行包落定后重跑第 4 节列出的测试；3. 遗留按第 3 节转交 |

## 2. 汇报

### 2026-11-18 实施、审查与修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/client/hd2d/sky.ts` | 新增 | 远景天幕纯核心：天幕包选择、按画质档保留的层与绘制顺序、俯角淡出、地平线、视差与云带漂移、渐变与星空、日月位置、程序化占位横条与有界缓存 |
| `src/client/hd2d/sky_layer.ts` | 新增 | 天幕与界外轻雾的全屏通道：不透明物体之后画、深度测试开、不写深度，只给地图留空的像素着色 |
| `src/client/hd2d/ground_marks.ts` | 新增 | 像素接触阴影、选中环（敌对环四个缺口）、悬停环、仇恨外环、剪影颜色 |
| `src/client/render/combat_marks.ts` | 新增 | 地面预警形状（内核锁定格、圆、环、锥、直线）与命中判定、格子外轮廓、施法条盒、屏幕边缘箭头、施法条与边缘箭头的判定 |
| `src/client/render/fairness.ts` | 新增 | 画质公平清单的数据：每档保留项与画在哪里、可削减项、画质档字段白名单、雾与粒子与调色雾与闪电的不透明度上限 |
| `src/client/render/stage_direct.ts` | 新增 | 演出指令的画面：镜头取景、时段与色调、画面天气、庭镜时限、立牌动作；1 秒过渡与离场回到世界 |
| `src/client/render/switch_fade.ts`、`sediment_fade.ts` | 新增 | 开关格活地图与 0.8 秒溶解时间线；澱度 2 秒渐变 |
| `src/client/app/stage_presenter.ts`、`stage_presenter.css` | 新增 | 演出指令的会话侧执行与庭镜画中画 |
| `src/client/app/world_presenter.ts` | 新增 | 会话每帧的活地图、澱度渐变、战斗标记（每 tick 读一次）与舞台 |
| `src/client/hud/exit_choice_model.ts`、`exit_choice_pop.ts`、`exit_choice_pop.css` | 新增 | 城门一出口多去处：分组、提示、去处选择弹层 |
| `tests/client_hd2d_completion.test.ts`、`tests/client_stage_direct.test.ts` | 新增 | 纯核心与画手接口的单测 |
| `src/client/hd2d/{shaders,materials}.ts` | 修改 | 统一光模型的 GLSL（与 `lightmap.ts` 同一常量生成）；窗光像素采样；开关格溶解；剪影材质 |
| `src/client/hd2d/lightmap.ts` | 修改 | 线性颜色、台阶表 `LIGHT_STEPS`、`lightAtPixel`；去掉存储值平方 |
| `src/client/hd2d/geometry.ts` | 修改 | 四坡屋顶两端三角面的贴图坐标按每米 16 像素 |
| `src/client/hd2d/entities.ts` | 修改 | 像素地面标记、仇恨外环、自身与队友剪影；标记按尺寸缓存，不再每帧分配 |
| `src/client/hd2d/hd2d_renderer.ts` | 修改 | 天幕、天气交叉淡化、色调、开关格新旧场景溶解、公平上限接线 |
| `src/client/hd2d/{scene_builder,daylight,quality,view,weather_overlay}.ts` | 修改 | 开关格角色；天光混合；`skyLayers`；镜头俯角范围与按俯角投影的朝向；天气淡化与上限 |
| `src/client/render/{scene,map_context,overlay_painter,flat_renderer,frame_signals,anim_state}.ts` | 修改 | 场景新字段；地图键与天幕包；预警、施法条、仇恨名字与边缘箭头；平面档的仇恨环、剪影、开关格淡出、色调与上限；帧签名 |
| `src/client/app/{session,player_input,story_wiring}.ts`、`src/client/hud/story/{stage,story_controller}.ts`、`src/client/input/input_layer.ts` | 修改 | 接线；故事帧先于世界画面；选择弹层打开时世界停住、手柄让给它 |
| `src/client/adapters/combat.ts`、`src/client/view/adapters.ts` | 修改 | `worldMarks`：仇恨、首领、施法（内核 `interruptibleNow`，引导递减）、内核预警 `telegraphsOn` 与无内核预警的范围施法圆 |
| `src/client/assets/runtime.ts` | 修改 | 只加 `bitmapPixels`（已通过的单图素材像素，给天幕层） |
| `src/systems/scenes/types.ts` | 越界修改 | `StageDirective` 加 `camera`、`camera_end`、`light`、`weather`、`mirror`、`mirror_end`、`motion` 与词汇常量；内核不读 |
| `locales/zh-Hans/ui.json`、`src/core/text_keys.generated.ts` | 修改 | 6 个新键（出门提示与去处选择）；键表重新生成 |
| `tests/{client_purity,client_frame_scheduler}.test.ts`、`tests/fixtures/procedural_baseline.json` | 修改 | 登记 8 个纯核心；签名覆盖清单加新字段；本包改动的两项摘要（`wallenburg` 屋顶来自四坡贴图坐标，`quality` 来自 `skyLayers`） |

**关键决定**

| 事项 | 决定 | 依据 |
| --- | --- | --- |
| 4 向显示 | 程序化与素材两条路已经是左由右镜像；本包补的是朝向按斜俯视投影（地图南北方向按俯角正弦缩短）后再量化，所以屏幕上斜着走的人朝向与画面一致 | 美术方案第 3.5 节 |
| 头像与立绘 | PK-M1-22 已经接入素材解析器（`portrait_plan.ts`、`dialogue_panel.ts`、`cutscene_player.ts`），本包核对后不重做 | 包行"头像与立绘接入" |
| 光模型 | 光照图与动态光同一模型，统一后外两档比原先亮；用户可决定是否调灯的强度 | README 第 11 节第 1 条 |
| 地面预警 | 有内核预警的施法画内核锁定的格子（命中按单位中心所在格）；跟随单位的预警与标记画圆；没有内核预警的范围施法画内核用的距离圆；预警画在覆盖层、天气之后 | 美术方案第 4.6 节；`src/systems/combat/telegraph.ts` |
| 演出的世界 | 只有"演出"呈现（`presentation: staged`）在有指令时让世界照常流动；剧场与插画照旧静止 | 过场目录第 13.1 节 |
| 庭镜 | 目标地图的平面档小画中画，开启时烘一次，按水面帧（650 毫秒）重画；画不出时用该区域远景 | 过场目录第 13.5 节 |
| 开关格变化 | 整个静态场景按活地图重建，新旧两份在变化的矩形里按有序抖动溶解；地面只重画变化区块要等地面分块 | 美术方案第 2.5 节；遗留第 3 节 |

**审查结论与处理**（详见 [verification_matrix.md](verification_matrix.md) 第 3 节）

正确性与公平一侧 26 条（1 条 BLOCKING）、每帧开销一侧 20 条（0 条 BLOCKING，2 条接近）。已修：内核预警接入、施法条按内核可打断与引导递减、天幕随镜头方向、开关格矩形边缘的墙面、色调淡出与交替、剧场不再让世界流动、平面档剪影、仇恨名字强制显示、选择弹层不吞按键松开、词汇外的取值退回默认、屋顶下不漏施法条、平面档色调不盖澱度暗角、闪电上限、故事帧顺序、平面档朝向、剪影深度偏移、锚点晚到、梦光的金边、光照图绘制提速、天幕通道早期深度剔除与便宜的散列、天幕横条有界缓存与零拷贝、云带占位提速、施法条与边缘箭头的签名、标记每 tick 读一次、地面标记不再每帧分配、庭镜不再每帧建上下文、模态打开时世界画面静止、移动标记材质的释放。

## 3. 留给后续包的事项

| 事项 | 归属 |
| --- | --- |
| 开关格变化与庭镜开启时整图重烘地面（`seal_ruins` 实测约 60 到 130 毫秒一次）；地面只重画变化区块 | PK-M1-03（地面分块） |
| 技能特效、命中火花、"减少闪烁"的描边替代、屏震与顿帧（目前没有特效系统） | 特效素材批次与战斗表现后续包 |
| 冲锋直线的箭头、首领以外的威胁等级箭头颜色、预警的像素贴花（现为覆盖层矢量） | PK-M1-12 交付完整预警数据后的客户端补强 |
| 门廊幽境门影层、第六幕天穹替换云带、战场天幕 | PK-M2-09 |
| `@转场`、插画缺失时的当幕远景退化 | 故事层后续（PK-M1-22 遗留） |
| 主角手背门纹亮点、主要角色左向修正件 | PK-M1-37 |
| 截图回归自动化、BM-01 基准场景与推荐机基线 | PK-M1-08、PK-M1-05 |
| 新着色器程序的预编译（`compileAsync`） | PK-M1-05 之后的性能包 |
