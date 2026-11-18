# PK-M1-24 HD-2D 表现补全（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-24` HD-2D 表现补全 |
| 状态 | 进行中（实施与验证已完成，建议主会话提交后改为"已完成"，见 [verification_matrix.md](verification_matrix.md)） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-24` |
| 形态 | 大包（5 代理人日）；按本目录约定只写入口、验收与进度三件 |
| 工作流 | 渲染（含过场演出指令的画面执行） |
| 量级 | 5 代理人日，0.5 用户人日 |
| 依赖 | PK-M0-10、PK-M0-19；读 PK-M1-16 的 `liveMap`；在 PK-M1-22（故事层、`StageDirective`）与 PK-M1-54（序章舞台）之上 |
| 立项日期 | 2026-11-17 |

## 1. 目标

把 HD-2D 场景补到美术方案第 2 到 4 节的目标规格：4 向显示按斜俯视投影换算（左由右镜像）；远景天幕分层（A-15）；第一轮未做的像素细节（窗光贴图抗锯齿、四坡屋顶像素密度、接触阴影与选中环像素化、光照图与动态光颜色统一、界外轻雾）；
战斗表现的画质公平清单（地面预警、敌方施法条与不可打断标记、仇恨标识、屏幕外威胁箭头、被挡住的自身与队友剪影，任何画质档都保留）；开关格开合的淡入淡出、局部澱度两秒渐变与城门一出口多去处；
过场与对话的镜头、光、天气、庭镜与动作指令（`StageDirective`）的画面执行。头像与半身立绘的显示已由 PK-M1-22 接入素材解析器，本包不重做（见 [progress.md](progress.md) 第 2 节）。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 4 向显示：朝向按镜头方位角与俯角投影到屏幕再量化（斜俯视下地图南北方向缩短），左向为右向镜像（程序化与素材两条路已有），从未移动的人物正面朝向镜头 | `src/client/hd2d/view.ts`（`screenFacing` 的俯角参数）、`src/client/render/anim_state.ts` | 美术方案第 3.5 节 |
| 2 | 远景天幕：环绕镜头的横带，渐变、星空、日月由代码画；每个天幕包远山、中景、云带三层（特殊天幕两层），图集 `sky` 优先、本图风格包、区域风格包；俯角 45 度起淡出、60 度不显示；视差 0.02 与 0.05，云带每游戏小时漂四分之一屏；画质档保留 3、3、2、1、0 层；缺图时用程序化占位横条 | `src/client/hd2d/sky.ts`（纯核心）、`sky_layer.ts`、`quality.ts`（`skyLayers`）、`src/client/render/map_context.ts`（`sky`）、`src/client/assets/runtime.ts`（`bitmapPixels`） | 美术方案第 2.11、2.13 节；地图简报第 1.7 节 |
| 3 | 像素细节：窗光（自发光贴图）与颜色贴图同一套像素抗锯齿采样；四坡屋顶两端三角面按每米 16 像素取贴图；接触阴影、选中环、悬停环、点击移动标记改为像素贴图（敌对环带四个缺口）；光照图与动态光同一光模型（线性颜色、同一台阶表与抖动、同一 4 像素每格网格）；界外深色底与随地面移动的轻雾 | `src/client/hd2d/shaders.ts`、`materials.ts`、`geometry.ts`、`ground_marks.ts`（纯核心）、`entities.ts`、`lightmap.ts`、`sky_layer.ts` | 美术方案第 2.3 到 2.7 节；首个可玩版本已知缺口表 |
| 4 | 战斗表现公平清单：地面预警（内核预警画锁定的格子，跟随与标记画圆，没有内核预警的范围施法画内核用的距离圆；读条填充，脉冲区每次脉冲闪边）、敌方头顶施法条（按内核此刻能否打断，不可打断带盾形边框；引导递减）、仇恨（名字染红并总显示、外圈细环）、屏幕外威胁与软锁定候选的边缘箭头（首领更大带纹章）、被挡住的自身与队友剪影（两种渲染器）；全部不读画质档，覆盖层在天气之后画；雾层、天气粒子、调色雾与闪电的不透明度上限 | `src/client/render/combat_marks.ts`、`fairness.ts`（纯核心）、`overlay_painter.ts`、`flat_renderer.ts`、`src/client/hd2d/weather_overlay.ts`、`entities.ts`、`src/client/adapters/combat.ts`（`worldMarks`）、`src/client/view/adapters.ts` | 美术方案第 2.12、4.1、4.2、4.6、4.10 节 |
| 5 | 开关格：渲染、小地图读活地图；开合时旧画面在变化的矩形里按有序抖动溶出、新画面溶入（0.8 秒），平面档同样淡出旧地面 | `src/client/render/switch_fade.ts`（纯核心）、`map_context.ts`（`key`）、`hd2d_renderer.ts`、`scene_builder.ts`、`flat_renderer.ts`、`src/client/app/world_presenter.ts` | 地图简报第 1.10 节；PK-M1-16 遗留 |
| 6 | 局部澱度：镜头所在处的澱度变化在 2 秒内线性过渡，换图时直接取新值 | `src/client/render/sediment_fade.ts`（纯核心）、`world_presenter.ts` | 地图简报第 1.2、1.11 节 |
| 7 | 城门一出口多去处：出口格及相邻格上的多个出口算同一道门；提示写"N 个去处"，交互键弹出去处选择（数字键、方向键、手柄十字键与 A、B），未开放的去处列出但不能选 | `src/client/hud/exit_choice_model.ts`（纯核心）、`exit_choice_pop.ts`、`src/client/app/player_input.ts`、`session.ts`、`src/client/input/input_layer.ts` | 旅行与探索第 2 节"远行出口"；地图简报第 12 节 |
| 8 | 演出指令的画面执行：`@镜`（机位、景别、推拉摇移升降，取景对象为玩家、实体或内容编号、地点或坐标）、`@光`（五个时段与四种色调，1 秒过渡）、`@天气`（画面天气 1 秒交叉淡化，灰暴为落灰加暗色）、`@庭镜`（另一张图集地图的小幅平面画中画，至多 20 秒；画不出时显示该区域远景）、`@动作`（立牌动作与朝向；`art_chr_` 特殊帧缺图时站立帧）；词汇以外的取值退回默认；"演出"呈现的过场里世界照常流动 | `src/systems/scenes/types.ts`（指令类型，越界改动）、`src/client/hud/story/stage.ts`、`story_controller.ts`（`stageNow`）、`src/client/app/story_wiring.ts`（`stage`）、`src/client/render/stage_direct.ts`（纯核心）、`src/client/app/stage_presenter.ts`、`stage_presenter.css` | 过场目录第 2.3、13.5 节 |
| 9 | 接线与帧调度：新字段进入帧签名，任何变化都会重画 | `src/client/render/scene.ts`、`frame_signals.ts`、`src/client/app/session.ts` | 发行工程第 6.3 节 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 技能特效、命中火花、闪白的"减少闪烁"描边替代、屏震与顿帧（目前没有特效系统） | 特效素材批次与战斗表现后续包（见 [progress.md](progress.md) 遗留） |
| 2 | 冲锋直线的箭头与按威胁等级的箭头颜色（内核预警已按格子画出） | PK-M1-12 交付完整预警数据之后 |
| 3 | 门廊幽境的门影层、第六幕天穹替换云带、战场天幕 `battleSky` | 回廊场景与战场进 HD-2D（PK-M2-09） |
| 4 | `@转场`（门扉擦除、溶、切）与插画退化为当幕远景 | 故事层后续（PK-M1-22 遗留） |
| 5 | 主角手背门纹亮点、主要角色左向修正件 | 素材导入工具与纸娃娃（PK-M1-37） |
| 6 | 截图回归的自动化（SwiftShader 截图比对）与 BM-01 基准场景 | PK-M1-08、PK-M1-05 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、目录分工 |
| [architecture.md](../../50_tech/architecture.md) 第 7 节、[art_pipeline.md](../../50_tech/art_pipeline.md) 第 2 到 4 节 | 渲染分层与本包规格 |
| [catalog_cutscenes.md](../../40_design/content/catalog_cutscenes.md) 第 2.3、13.5 节 | 演出指令词汇 |
| [map_briefs.md](../../40_design/world/map_briefs.md) 第 1.2、1.7、1.10 节 | 澱度换算、天幕包、开关格 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 纯核心 | 规则在纯模块里，登记在 `CLIENT_PURE_CORES`；画手与渲染器只做 DOM 与 three.js | `tests/client_purity.test.ts` |
| 画质公平 | 画质档只是观感开关（`QUALITY_KNOBS`），覆盖层与战斗标记不读画质档；雾、粒子与调色雾有上限 | `tests/client_hd2d_completion.test.ts` |
| 世界只读 | 演出指令只改画面（视图、时刻、天气、调色、立牌动作），不写世界；内核忽略这些指令 | `tests/client_stage_direct.test.ts`；`tests/scenes.test.ts` |
| 素材 | 只经 `src/client/assets/` 读已通过的素材，缺图用程序化占位；不改 `assets/` 与 `tools/assets/` | `tests/art_manifest.test.ts`（基线） |
| 文本 | 新增文字全是 `ui.*` 键 | `node tools/i18n/check.ts`、`tests/i18n_ui_guard.test.ts` |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/client/hd2d/{sky,sky_layer,ground_marks}.ts`、`src/client/render/{combat_marks,fairness,stage_direct,switch_fade,sediment_fade}.ts`、`src/client/app/{stage_presenter,world_presenter}.ts`、`stage_presenter.css`、`src/client/hud/{exit_choice_model,exit_choice_pop}.ts`、`exit_choice_pop.css`、`tests/{client_hd2d_completion,client_stage_direct}.test.ts`、本目录 |
| 本包修改 | `src/client/hd2d/{hd2d_renderer,entities,materials,shaders,geometry,lightmap,scene_builder,daylight,quality,view,weather_overlay}.ts`、`src/client/render/{scene,map_context,overlay_painter,flat_renderer,frame_signals,anim_state}.ts`、`src/client/app/{session,player_input,story_wiring}.ts`、`src/client/hud/story/{stage,story_controller}.ts`、`src/client/input/input_layer.ts`、`src/client/adapters/combat.ts`、`src/client/view/adapters.ts`、`src/client/assets/runtime.ts`（只加 `bitmapPixels`）、`locales/zh-Hans/ui.json`、`src/core/text_keys.generated.ts`（重新生成）、`tests/{client_purity,client_frame_scheduler}.test.ts`、`tests/fixtures/procedural_baseline.json`（本包改动的两项摘要） |
| 越界改动 | `src/systems/scenes/types.ts`：只加 `StageDirective` 的可选成员与词汇常量，内核不读 |
| 不得修改 | 其他并行包的文件：`assets/`、`tools/assets/`、`src/editor/`、地图数据、`src/systems/` 其余部分 |

## 7. 停止条件

dev_process 第 3.6 节全部适用；本包未触发。

## 8. 验证命令

在 `hakoniwa/` 下运行：

```
npx vitest run --config vitest.config.ts tests/client_hd2d_completion.test.ts tests/client_stage_direct.test.ts tests/client_purity.test.ts tests/client_frame_scheduler.test.ts tests/client_hd2d.test.ts tests/client_world_mechanics.test.ts tests/client_story.test.ts tests/client_prologue_stage.test.ts tests/client_sprites.test.ts tests/client_assets.test.ts tests/architecture.test.ts tests/i18n_ui_guard.test.ts
npm run typecheck
node tools/i18n/check.ts
npm test
npm run build
```

浏览器核对：开发服务 `npx vite --config vite.config.ts --mode nohmr --port <空闲端口> --strictPort`，序章与第一幕地图、各画质档与公平天气截图、帧时间，核对后停掉服务（见 [verification_matrix.md](verification_matrix.md) 第 2 节）。

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 新起会话的覆盖审查（正确性、每帧开销、画质公平） | 必派 | 一次贡献结束；结论见 [verification_matrix.md](verification_matrix.md) 第 3 节 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、字符串表、测试、本目录 | 主会话 | 抽看 [verification_matrix.md](verification_matrix.md)；验证命令在其他并行包落定后全绿 |
| `StageDirective` 的 `camera`、`camera_end`、`light`、`weather`、`mirror`、`mirror_end`、`motion` 与词汇常量 | PK-M1-27（序章内容批次） | 按 `src/systems/scenes/types.ts` 的类型写；`focus` 与 `who` 可写 `player`、实体编号、内容编号、地点编号或"x,y" |
| 地面预警的读取：`telegraphsOn` 的锁定格、`follow` 与 `mark` 的半径、`pulse` 的下次脉冲；施法条读 `interruptibleNow` 与 `CastState.channel` | PK-M1-12（首领机制） | 这些字段改名或改义时同步 `src/client/adapters/combat.ts` 的 `worldMarks`；`tests/client_stage_direct.test.ts` 钉住读法 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 光照图改为线性光后，灯的外圈比原先亮（原先存储值被平方，外两档几乎看不见） | 推荐保持统一后的亮度（规格第 2.7 节的三档台阶本来就该看得见）；若觉得夜里太亮，调灯的 `intensity` 而不是改回平方 | 不阻塞 |
| 2 | "演出"呈现的过场（有镜头、光、天气或动作指令）里世界不再静止：水、天气与立牌待机动作照常播放 | 推荐如此（过场目录第 13.1 节"场景内运镜"）；剧场与插画两种演出不变，指令照常改画面 | 不阻塞 |
| 3 | 开关格变化与庭镜开启时整图重烘地面，大图上会卡一下（`seal_ruins` 约 60 到 130 毫秒） | 推荐随 PK-M1-03 的地面分块改成只重画变化区块；开关格只在剧情节点翻转，暂可接受 | 不阻塞 |
