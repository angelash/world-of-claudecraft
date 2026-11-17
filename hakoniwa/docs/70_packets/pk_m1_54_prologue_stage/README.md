# PK-M1-54 序章舞台机制与造像（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-54` 序章舞台机制与造像 |
| 状态 | 进行中（实施与验证已完成，建议主会话提交后改为"已完成"，见 [verification_matrix.md](verification_matrix.md)） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-54` |
| 形态 | 大包（6 代理人日）；按本目录约定只写入口、验收与进度三件 |
| 工作流 | 客户端（含场景运行器增补） |
| 量级 | 6 代理人日，0.5 用户人日 |
| 依赖 | PK-M0-10、PK-M0-15；在 PK-M1-22（过场播放器、故事层）与 PK-M1-06（音频引擎 `GameAudio`）之上 |
| 立项日期 | 2026-11-17 |

## 1. 目标

序章先行（D-096）：做出序章内容批次（PK-M1-27）要用的舞台机制与运行器功能。序章三处机制：P2 每个转角重现的门、P5 按距离分档的偷听、P15"伸手"键；
造像模式 `ui_mode_creator`（灵镜，序章 P4）与纸娃娃组装器；场景运行器增补：`ui` 效果、软硬回合上限、限时选择、分段场景与段标记、由波次与首领触发的战斗吠叫、重选序章开场；
`sceneView` 改用叙事解析器，与运行器一致读历法项。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | `ui` 效果：选项或节点的效果里打开界面，场景等待（`waiting: 'ui'`），客户端以 `scenes.ui_done`（带运行与修订号）关闭后走本节点或选项的去向；界面结果由内核核验后写入（灵镜：外观与造像串，写入效果的 `storeAs`）；其他界面没有结果时直接关闭 | `src/systems/scenes/{runner,ui_results,types,index}.ts`、`src/systems/quests/{effect_types,effects}.ts`、`src/content/packs/{quests,scenes}.ts` | 过场目录第 4.1.2、13.6 节 |
| 2 | 软硬回合上限：`SceneInput.turns`（软、硬、`storeAs`）；有模型时输入在每次回应后重开，软上限起题面要求收尾（`wrapUp`），答者以 `done` 收束，到硬上限由运行器结束；结束方式 `closed`、`soft`、`hard` 写入旗标；无模型时写定回应即收束 | `runner.ts`（`roundEnd`） | 过场目录第 4.1.2 节；序章第 1 节节拍规则 |
| 3 | 限时选择：`SceneChoice.timeout`（秒，按 tick 计，重放一致）；`key`（由对话情境的输入动作选中，显示为按键提示）；`hidden`（不进编号列表） | `runner.ts`（`choiceTimeouts`）、`view.ts` | 过场目录第 2.2、13.6 节 |
| 4 | 分段场景与段标记：`SceneNode.segment`、`SceneDef.segments`（段梗概）；视图给出当前段与段梗概，事件 `scene.segment` | `runner.ts`、`view.ts` | 过场目录第 2.2、13.3 节 |
| 5 | 战斗吠叫：`SceneDef.barks`（波次出现与肃清、首领阶段、首领倒下），场景系统订阅战斗系统已有事件（`combat.wave_spawned`、`combat.wave_cleared`、`combat.boss_phase`、`combat.boss_defeated`），不改战斗；默认每个世界一次，已说过的记在切片 `barked` | `src/systems/scenes/barks.ts`、`index.ts` | 过场目录第 5 节"战斗插演" |
| 6 | 重选序章开场：`SceneDef.restart`（重播的场景、要清的旗标与前缀、要收回的物品、到哪一段为止）；命令 `scenes.restart`；播放器工具栏"重选开场"，先确认 | `runner.ts`（`cmdRestart`）、`cutscene_player.ts` | 过场目录第 4.1.1 节第 5 条；序章第 1 节 |
| 7 | `sceneView` 改用叙事解析器（`worldResolver`：旗标、当前 tick 的历法项、`ai_enabled`），与运行器共用选项过滤 `openChoices` | `src/systems/quests/effects.ts`、`view.ts` | `calendar_terms.ts`；PK-M1-45 |
| 8 | P2 每个转角重现的门：演出指令 `door`（计数旗标、上限、`open`）与 `door_end`；门卡按转身次数显示"关着、又在转角、开了一条缝有风、开了"，门光逐次加强 | `src/client/hud/story/{prologue_stage,stage,cutscene_model,cutscene_player}.ts`、`prologue_stage.css` | 序章第 1、7 节 N2；过场目录 `cut_p_door_white` |
| 9 | P5 按距离分档的偷听：演出指令 `listen`（档位旗标）、`noise`（降一档）、`listen_end`；姿态定档（长椅远、帘幕前三步中、贴帘近；咳嗽姿态先在帘幕前，咳嗽之后转远）；档位经故事帧交给 `GameAudio.setListenTier`，远档的人声淡一档 | 同上、`src/client/app/story_wiring.ts` | 序章第 3.1 节；音频方向第 8.4 节 |
| 10 | P15"伸手"键：对话情境新增动作 `reach_out`（键鼠 E，手柄 RB；内核的按键动作表 `SCENE_CHOICE_KEYS`）；坠落节点只显示"伸手"的按键提示，按下即选中写 `p_reached_out`，30 秒不按由运行器选"什么也不做" | `src/client/input/{contexts,pad_bindings}.ts`、`src/client/app/player_input.ts`、`scene_model.ts` | 序章第 1、7 节 N13；界面第 17 节 `tut_p_reach` |
| 11 | 造像模式 `ui_mode_creator`：体型（性别、体型）、脸（眼、嘴、肤色）、头发（发型、发色）、衣着（服装、配色）四页，随机、还原、照好了，预览可转四向；节点台词读完后才打开；造像串存档往返 | `src/client/hud/creator/`、`src/client/app/creator_wiring.ts` | 界面第 3.4.3 节 |
| 12 | 纸娃娃组装器：读现有清单里已通过的部件，按人台的颈与手的位置叠放并按色槽换色；任何部件缺失时保留程序化占位，逐像素一致 | `src/client/assets/doll_compose.ts`、`runtime.ts` | 美术方案第 3.3 节 |
| 13 | 序章数据挂点（只加机制需要的钩子，台词不动） | `data/scenes/prologue.json` | 见第 6 节 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 把 `prologue` 拆成七个 `cut_p_`、写 `presentation`、`stage`、`summary`、`anchor`、各转角台词与面试五轮的 `turns` | PK-M1-27 |
| 2 | 地球舞台地图（`earth_*` 的转角地点）与 P2 在可操作场景里把门实体摆到转角；镜头、光、动作指令的执行 | 地图负责方与镜头导演包（PK-M1-22 遗留） |
| 3 | `tut_p_*` 引导（含 `tut_p_listen`、`tut_p_reach`、`tut_p_restart`） | PK-M1-23 |
| 4 | 片尾 `ui_mode_credits` 与带走的记忆 `ui_pop_deja` 的界面（`ui` 效果已能打开它们，客户端暂时立即关闭） | 终章与界面后续包 |
| 5 | 部件美术与素材工具 | 美术批次（第三方） |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md`、[architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 分层、确定性、文本键、纯核心加薄画手 |
| [PK-M1-22 包](../pk_m1_22_hud_dialogue/README.md) | 过场播放器、故事层、场景可选字段 |
| [prologue_antechamber.md](../../30_story/arcs/prologue_antechamber.md) 第 1、3.1、7、8 节 | 三处机制与产出的变量 |
| [catalog_cutscenes.md](../../40_design/content/catalog_cutscenes.md) 第 2.2、4.1.1、4.1.2、13.6 节与 `cut_p_door_white`、`cut_p_quarrel`、`cut_p_discard` | 运行器增补的契约 |
| [ux_and_onboarding.md](../../40_design/ux_and_onboarding.md) 第 3.4.3、17 节 | 灵镜与序章引导 |
| [art_pipeline.md](../../50_tech/art_pipeline.md) 第 3.3 节 | 纸娃娃分层 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性 | 限时选择与回合按 tick 计；界面结果是命令，进重放日志；系统代码无 `Math.random`、墙钟 | `tests/architecture.test.ts`；`tests/scenes_runner_additions.test.ts` 的重放用例 |
| 内容 ID | 系统代码不写内容 ID：旗标名、场景、物品都来自数据（`storeAs`、`restart`、`barks`） | `tests/content_id_guard.test.ts` |
| 结果核验 | 灵镜结果来自玩家：底型只许人形五种，四色为十六进制，纸娃娃只许灵镜会写的 `body`、`outfit`、`head`、`hair` 四个字段，限长且过资产 ID 检查，造像串限长与字符集；不合规整份拒收，不写任何东西 | `checkCreatorResult` 与其单测 |
| 纯核心 | `prologue_stage.ts`、`creator_look.ts`、`creator_model.ts`、`doll_compose.ts` 列入 `CLIENT_PURE_CORES` | `tests/client_purity.test.ts` |
| 占位一致 | 没有素材时组装后的立牌与程序化占位逐像素一致、缓存键一致 | `tests/client_prologue_stage.test.ts` |
| 文本 | 界面文字全部是 `ui.*` 键，拒绝原因是 `sys.scenes.reject.*` 键 | `tests/i18n_ui_guard.test.ts`、`node tools/i18n/check.ts` |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/scenes/{ui_results,barks}.ts`、`src/client/hud/story/prologue_stage.ts` 与 `prologue_stage.css`、`src/client/hud/creator/`（`creator_look.ts`、`creator_model.ts`、`creator_panel.ts`、`creator.css`）、`src/client/app/creator_wiring.ts`、`src/client/assets/doll_compose.ts`、`tests/{scenes_runner_additions,client_prologue_stage}.test.ts`、本目录 |
| 本包修改（叙事） | `src/systems/scenes/{types,runner,index,view}.ts`、`src/systems/quests/{effect_types,effects}.ts`、`src/content/packs/{quests,scenes}.ts`、`locales/zh-Hans/sys_scenes.json` |
| 本包修改（客户端） | `src/client/hud/scene_model.ts`、`src/client/hud/story/{stage,cutscene_model,cutscene_player,handlers,story_controller}.ts`、`src/client/app/{story_wiring,player_input}.ts`、`src/client/input/{contexts,pad_bindings}.ts`、`src/client/assets/runtime.ts`、`locales/zh-Hans/ui.json`、`tests/client_purity.test.ts` |
| 越界小改 | `src/game/autoplay/player.ts` 与 `tests/narrative_harness.ts`（遇到 `waiting: 'ui'` 时不带结果关闭，防止自动玩家卡住）；`tests/client_story.test.ts`（场景视图夹具补四个新字段） |
| 序章数据挂点 | `data/scenes/prologue.json`：`n2_door`、`n2_turn3`、`n2_push`、`n3_white` 的 `door` 指令；`n3_mirror` 末尾加选项 `creator`（`ui` 效果，`storeAs: p_appearance`）；`n4_s1` 的 `listen`、`n4_cough` 的 `noise`、`n5_call` 的 `listen_end`；`n6_eluen` 的段标记 `interview` 与场景的 `restart`；`n13_fall` 的 `reach`（`key: reach_out`、`hidden`）与 `still`（`timeout: 30`、`hidden`） |
| 重新生成 | `src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json`（主会话提交时再生成一次） |
| 不得修改 | 其他并行包：`src/systems/{combat,inventory,npc,cognition,dialogue,ailments,dungeons}/`、`src/core/brain/`、`data/combat/`、`data/dungeons/`、`src/editor/`、`tools/assets/`、`tools/audio_gen/`、`tools/dev_api.ts`、`assets/`、`docs/README.md`、`docs/10_research/` |

## 7. 停止条件

dev_process 第 3.6 节全部适用；本包未触发。

## 8. 验证命令

在 `hakoniwa/` 下运行：

```
npx vitest run --config vitest.config.ts tests/scenes_runner_additions.test.ts tests/client_prologue_stage.test.ts
npx vitest run --config vitest.config.ts tests/scenes.test.ts tests/client_story.test.ts tests/client_purity.test.ts tests/client_input_bindings.test.ts tests/client_keymap_contexts.test.ts tests/client_assets.test.ts tests/client_sprites.test.ts tests/i18n_ui_guard.test.ts tests/architecture.test.ts tests/content_id_guard.test.ts
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
| 新起会话的覆盖审查 | 必派 | 一次贡献结束；结论见 [verification_matrix.md](verification_matrix.md) 第 3 节 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 运行器字段：`ui` 效果、`turns`、`timeout`、`key`、`hidden`、`segment`、`segments`、`barks`、`restart`；演出指令 `door`、`listen`、`noise` 与对应的结束指令 | PK-M1-27（序章内容批次） | 七个 `cut_p_` 按过场目录写这些字段：`cut_p_door_white` 的 `creator` 选项与门指令、`cut_p_quarrel` 的偷听指令、`cut_p_interview` 五轮 `turns`（`storeAs: p_round_end.<神>`）、`cut_p_discard` 的坠落；`cut_p_earth` 到 `cut_p_call` 各带 `restart`（无 `until`） |
| `barks` 数据格式 | 第一幕过场批次（`cut_a1_raven`、`cut_a1_tide` 的插演表） | 插演表按触发写成 `barks` |
| 主会话 | 代码、字符串表、测试、本目录 | 抽看验收表；上面的验证命令在其他并行包落定后全绿 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 偷听档的来源：分幕文档第 3.1 节写"一次姿态选择决定，不按站位实时计算"，界面第 17 节 `tut_p_listen` 写"一直在远档 30 秒后提示靠近"，暗含实时移动 | 推荐按分幕文档（正典优先）：档位来自姿态，`noise` 指令只往下降；`tut_p_listen` 改成"选了远档时提示偷听有三档"，由 PK-M1-23 回写界面文档 | 不阻塞 |
| 2 | "重选开场"放在哪里：过场目录写"系统菜单多一项"，但过场中短按 Esc 不开菜单（PK-M1-22 遗留） | 推荐本包做法：先放在过场工具栏，菜单在过场中可开之后再移进菜单 | 不阻塞 |
