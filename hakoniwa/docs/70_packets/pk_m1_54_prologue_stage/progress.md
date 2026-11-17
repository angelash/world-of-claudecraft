# PK-M1-54 序章舞台机制与造像：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施、审查与修复 | 全部范围条目；新起会话的覆盖审查 2 条 BLOCKING 与多数 SHOULD-FIX 已修 | 未提交 | 本包 2 个新测试文件 44 项通过；相关客户端与守卫测试见 [verification_matrix.md](verification_matrix.md) | 1. 主会话提交并再生成生成物；2. PK-M1-27 按第 10 节交接写序章数据；3. 其他并行包落定后重跑第 2 节命令 |

## 2. 汇报

### 2026-11-17 实施、审查与修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/scenes/ui_results.ts` | 新增 | 界面结果的核验与写入（灵镜：人形底型、四色、纸娃娃只许 `body`、`outfit`、`head`、`hair` 且限长、造像串限长与字符集） |
| `src/systems/scenes/barks.ts` | 新增 | 战斗吠叫：按触发与引用索引，条件、一次与重复、切片记录 |
| `src/systems/scenes/types.ts` | 修改 | `SceneChoice.timeout`、`key`、`hidden`；`SceneInput.turns`、`SceneTurns`、`RoundEnd`；`SCENE_CHOICE_KEYS`；演出指令 `listen`、`noise`、`listen_end`、`door`、`door_end`；`SceneNode.segment`；`SceneDef.segments`、`barks`、`restart`；`SceneWait` 加 `ui`；`SceneRun` 的 `timed`、`turn`、`ui`、`segment`、`restartClosed`；切片 `barked`（旧存档缺省） |
| `src/systems/scenes/runner.ts` | 修改 | `enterNode` 拆出 `settleNode`；`ui` 等待与 `cmdUiDone`；限时选择 `choiceTimeouts`；多轮 `roundEnd`（只存首轮原话，轮中空输入拒收）；女神答者的题面补 `scenes.resolve`；段标记；`cmdRestart`（清旗标、收物品、按清掉的旗标忘记已播场景，队列保留）；`openChoices` 与视图共用 |
| `src/systems/scenes/index.ts` | 修改 | 新事件 `scene.ui`、`scene.ui_closed`、`scene.segment`、`scene.restarted`；新命令 `scenes.ui_done`、`scenes.restart`；订阅四个战斗事件 |
| `src/systems/scenes/view.ts` | 修改 | 叙事解析器；`runId`、`revision`、`ui`、`uiStoreAs`、`segment`、`segmentSummary`、`restartable`；选项带 `hidden`、`key`、`timeout` |
| `src/systems/quests/effect_types.ts`、`effects.ts` | 修改 | 效果 `ui`（`UI_EFFECT_IDS`）；`worldResolver`（`narrativeResolver` 改由它实现） |
| `src/content/packs/quests.ts`、`scenes.ts` | 修改 | 新字段的内容校验（未知界面、超时、按键动作、隐藏选项、回合、段、吠叫、重选开场、演出指令） |
| `src/client/hud/story/prologue_stage.ts`、`prologue_stage.css` | 新增 | P2 门卡、P5 偷听档、按键提示的纯核心与样式 |
| `src/client/hud/creator/`（`creator_look.ts`、`creator_model.ts`、`creator_panel.ts`、`creator.css`） | 新增 | 灵镜：选项表、造像串、纸娃娃配方、模式模型与画手 |
| `src/client/app/creator_wiring.ts` | 新增 | 灵镜与其他 `ui` 界面的会话接线 |
| `src/client/assets/doll_compose.ts` | 新增 | 纸娃娃组装器（人台锚点、色槽换色） |
| `src/client/assets/runtime.ts`、`sprite_source.ts` | 修改 | 组装结果接入立牌帧；注释更新 |
| `src/client/hud/scene_model.ts`、`src/client/hud/story/{stage,cutscene_model,cutscene_player,handlers,story_controller}.ts` | 修改 | 隐藏选项不编号、按键提示、门卡、远档淡色、重选开场按钮；按运行重置舞台；段梗概；只有按键提示时不显示选择提示 |
| `src/client/app/{story_wiring,player_input}.ts` | 修改 | 偷听档交给音频；按键选项；灵镜输入；重选开场命令 |
| `src/client/input/{contexts,pad_bindings}.ts` | 修改 | 对话情境动作 `reach_out`（E、RB） |
| `locales/zh-Hans/ui.json`、`sys_scenes.json` | 修改 | `ui.mode.creator.*`、`ui.mode.cutscene.{prompt,restart,door}.*`、`ui.set.controls.action.reach_out`；`sys.scenes.reject.{no_ui,bad_result,no_restart,empty_turn}`，`sys.scenes.prompt.resolve` 写明 `done` |
| `data/scenes/prologue.json` | 修改 | 机制挂点（README 第 6 节） |
| `tests/scenes_runner_additions.test.ts`、`tests/client_prologue_stage.test.ts` | 新增 | 内核与客户端单测 |
| `tests/client_purity.test.ts` | 修改 | 四个新纯核心 |
| `src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 重新生成 | |

**验收逐条结果**

| 验收（包行） | 状态 | 证据 |
| --- | --- | --- |
| 序章三处机制单测 | PASS | `tests/client_prologue_stage.test.ts` 的 P2、P5、P15 三组；内核侧 `tests/scenes_runner_additions.test.ts` 的坠落用例 |
| 运行器各增补项单测 | PASS | `tests/scenes_runner_additions.test.ts` 的 `ui`、限时与按键、多轮、段、吠叫、视图解析器、重选开场、加固各组 |
| 造像结果存档往返 | PASS | `client_prologue_stage` 的"round-trips through a save" |
| 纸娃娃组装与无素材时的占位一致 | PASS | `client_prologue_stage` 的组装器一组 |

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 分幕文档第 3.1 节与界面第 17 节 `tut_p_listen` | 前者：偷听档一次姿态选择决定；后者暗含实时靠近 | 按分幕文档：档位来自姿态旗标，`noise` 只往下降一档；咳嗽姿态先站在帘幕前（中档），咳嗽后转远档 | 正典优先级 | 是（README 第 11 节第 1 项） |
| 过场目录第 4.1.1 节第 5 条 | "重选开场"在系统菜单 | 先放在过场工具栏，带确认 | 过场中短按 Esc 不开菜单（PK-M1-22 遗留） | 是（README 第 11 节第 2 项） |
| 过场目录 `cut_p_door_white` 选择表 | `creator` 列在 `n3_mirror` 第一项 | 现有数据里放在六个快照之后 | 自动玩家与叙事测试按"第一项"走，放最后不改变现有通关路径；拆分批次可按目录调整次序（自动玩家已能关闭灵镜） | 否 |
| 界面第 3.4.3 节 | 体型、脸（眼、嘴、肤色） | 眼与嘴只记在造像串里，组装器还不叠脸部层；性别同样只在造像串 | `doll_face` 的表情锚点未录入，脸部层与表情一并做 | 否（转遗留） |
| 美术方案第 3.3 节 | 每套服装画在其体型的人台上 | 小体型、大体型的服装条取 `<服装>_hs`、`_hb` | 地球服装只在标准人台上立项 | 否（转素材请求） |
| 分幕文档第 1 节 P2 | 三次转身后门开了一条缝，走过时自己开了 | 第三次转身显示"开了一条缝、有风"，白场进入时门开 | 现有数据把两句放在同一节点，拆句是内容批次的事 | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `src/game/autoplay/player.ts` | 遇到 `waiting: 'ui'` 时不带结果关闭，防止自动玩家卡住 | 内核（总负责人） | 已改，请知悉 |
| `tests/narrative_harness.ts` | 同上，叙事测试的场景驱动 | 叙事 | 已改 |
| `tests/client_story.test.ts` | 场景视图夹具补新字段（`runId`、`revision`、`ui`、`uiStoreAs`、`segment`、`segmentSummary`、`restartable`） | PK-M1-22 | 已改 |
| `tests/client_adapters.test.ts`、`tests/client_gamepad_playthrough.test.ts` | 坠落节点只有按键选项：测试改用按键（E、RB）选中，数字与选项光标只走编号列表 | 客户端、PK-M1-07 | 已改 |
| `docs/README.md` | 新增本目录后应更新索引 | 第三方正在编辑，本包不碰 | 请主会话补索引行 |
| `docs/40_design/world_state_registry.md` | 本包不新增变量；`p_appearance` 现在有两种取值格式（快照 `base:colors` 与灵镜 `v1;…`） | 叙事 | 请在 `p_appearance` 行注明格式（本包未改） |
| `docs/40_design/ux_and_onboarding.md` 第 17 节 `tut_p_listen` | 与分幕文档的偷听规则不一致 | PK-M1-23 | 待用户决定后回写 |
| 素材清单 | 灵镜所需部件：`art_doll_res_earth_casual`、`art_doll_res_earth_office` 的 `_hs`、`_hb` 版本，`art_doll_head_hair_<发型>` 十种，`art_doll_head_base_{h,hb,hs_halfling}` | 美术批次 | 请求 |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 拆分七个 `cut_p_` 并写入本包的字段（门、偷听、坠落、灵镜、面试五轮 `turns`、各场 `restart`） | PK-M1-27 |
| 可操作场景的 P2：在地球舞台地图上把门实体摆到 `转角` 地点、镜头跟随 | 地图负责方与镜头导演包 |
| 纸娃娃的脸部层（眼、嘴、表情）、性别对部件的影响、人台锚点改由导入记录 | 美术管线与客户端后续包 |
| 灵镜的专用输入情境（手柄的还原、转向；键盘焦点能到达底部按钮） | PK-M1-23 或输入层后续包 |
| `ui_mode_credits`、`ui_pop_deja` 的界面（现在 `ui` 效果打开后立即关闭） | 终章与界面后续包 |
| 第一幕插演表写成 `barks` | 第一幕过场批次 |
| 重选开场后，玩家实体外观与已填的名字保留（只清 `p_` 旗标） | PK-M1-27 决定是否把 `player.name` 列入 `clear` |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 人台锚点取自程序化人形 | 部件到位后头部与手持物可能差一两个像素 | 导入记录人台锚点后改读元数据 |
| 其他并行包落定前，套件里有本包以外的失败 | 无法一次看到全绿 | 并行包落定后重跑第 2 节命令 |

**需用户决定**

| 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- |
| 见 [README.md](README.md) 第 11 节 | | 不阻塞 |
