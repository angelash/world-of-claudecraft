# PK-M1-22 HUD、对话、过场与回廊：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施、审查与修复 | 全部范围条目；两份覆盖审查的 BLOCKING 与多数 SHOULD-FIX 已修；PK-M1-26 转来的读档迁移器接线 | 未提交 | 本包 6 个新测试文件 139 项通过；`client_purity` 等 10 个相关文件 435 项中本包相关全过；`npm run build` 成功；见 [verification_matrix.md](verification_matrix.md) | 1. 主会话提交；2. 删除不再使用的 `conversation_box.ts`、`scene_panel.ts`；3. 其他并行包落定后重跑第 4 节列出的测试 |

## 2. 汇报

### 2026-11-17 实施、审查与修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/client/hud/story/`（`index.ts`、`constants.ts`、`handlers.ts`、`reading.ts`、`backlog.ts`、`portrait_plan.ts`、`stage.ts`、`letter_card.ts`、`dialogue_model.ts`、`cutscene_model.ts`、`story_controller.ts`、`ai_flags.ts`、`portrait_view.ts`、`backlog_view.ts`、`dialogue_panel.ts`、`cutscene_player.ts`、`story_view.ts`、`story.css`） | 新增 | 对话与过场播放器 |
| `src/client/app/story_wiring.ts` | 新增 | 会话侧的故事接线：设置、跳过长按、头像、音频接口、空闲时不建帧 |
| `src/client/hud/{confirm_model,confirm_pop}.ts`、`confirm_pop.css` | 新增 | `ui_pop_confirm`，含手柄 |
| `src/client/hud/{notify_model,notify,party_model,party_frames,hint_model,hint_bar,focus_model,focus_frame,tracker_model,tracker,gauges_model,gauges}.ts` 与 `notify.css`、`party_frames.css`、`hint_bar.css`、`hud_c.css` | 新增 | HUD 元件 |
| `src/client/app/{hud_extras,notify_context}.ts` | 新增 | HUD 元件的会话接线 |
| `src/client/windows/corridor/`（`corridor_model.ts`、`corridor_mode.ts`、`corridor.css`）、`src/client/adapters/corridor.ts` | 新增 | 回廊模式与适配器 |
| `src/client/windows/{quest_log_model}.ts`、`quest_log.css` | 新增 | 任务日志模型 |
| `src/client/windows/settings/`（`page.ts`、`shell_model.ts`、`controls_model.ts`、`gameplay_model.ts`、`graphics_page.ts`、`llm_page.ts`、`language_page.ts`、`gameplay_page.ts`、`controls_page.ts`、`settings.css`）、`src/client/windows/{help_model,help_window}.ts` | 新增 | 设置外壳与页、帮助 |
| `src/client/app/{newgame_model,newgame_screen,thumbnail}.ts`、`newgame.css`、`src/client/hud/{save_list_model,save_list,slot_extras}.ts`、`save_list.css` | 新增 | 新游戏、存档列表、缩略图 |
| `tests/{client_story,client_hud_party_notify,client_settings_shell,client_corridor_tracker,client_saves_newgame,client_saves_migrate}.test.ts` | 新增 | 纯核心单测 |
| `src/client/app/{main,session,player_input,event_router,boot_screen,adapters_wiring,settings_schema}.ts` | 修改 | 接线；`settings_schema.ts` 加 `gameplay`（文字速度、自动推进、引导级别） |
| `src/client/hud/{hud,save_slots}.ts`、`src/client/windows/{index,kit,settings_window,simple_windows,story_windows,window_context,window_manager,window_registry}.ts`、`src/client/view/adapters.ts`、`src/client/adapters/social.ts` | 修改 | 组合与窗口；`window_registry.ts` 加 `mode`、`pauses` |
| `src/client/input/{actions,contexts,input_controller,input_layer}.ts` | 修改 | 回廊情境；网页版窗口页签备键 Ctrl+] 与 Ctrl+[；Shift 加点击设焦点；确认弹层打开时手柄让给它；手柄选项光标改指新类名 |
| `src/client/client.css` | 修改 | 删去不再使用的对话框、场景面板与存档行规则 |
| `src/systems/scenes/types.ts`、`view.ts` | 修改 | 只加可选字段：`SceneDef.presentation`、`illustration`、`summary`，`SceneNode.stage`、`anchor`，`SceneChoice.confirm`，`StageDirective`、`ScenePresentation`；视图透传 |
| `locales/zh-Hans/ui.json`、`src/core/text_keys.generated.ts` | 修改、重新生成 | 本包的键（`ui.pop.confirm.*`、`ui.mode.dialogue.*`、`ui.mode.cutscene.*`、`ui.mode.corridor.*`、`ui.common.ai.*`、`ui.hud.{party,focus,notify,hint,tracker,gauges}.*`、`ui.win.quests.*`、`ui.set.*`、`ui.scr.settings.*`、`ui.scr.newgame.*`、`ui.scr.load.*`、`ui.win.saves.*`） |
| `tests/{client_purity,settings_store,desktop_settings}.test.ts` | 修改 | 纯核心名单；`gameplay` 字段 |
| `docs/40_design/ux_and_onboarding.md` | 修改 | 第 2 节各表"现有"一列 |

**验收逐条结果**

| 验收序号（`verification_matrix.md` 第 1 节） | 状态 | 命令与输出要点 |
| --- | --- | --- |
| 1.1 各 `ui_` 编号的空与错误状态 | PASS | 逐条见验收表 |
| 1.2 纯核心单测 | PASS | 6 个新文件 139 项通过 |
| 1.3 浏览器核对第 1 行 | PASS | 控制台无错误 |
| 1.3 浏览器核对第 2 行 | VERIFY | 页面被并行改动反复重载，未走到第一幕 |

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 界面第 4.1、17.8 节 | 引导级别存在存档的客户端段 | 暂存同步设置 `gameplay.guidance`，新游戏页写入 | 存档还没有客户端段，引导存储在 PK-M1-23 | 是（README 第 11 节第 1 项） |
| 发行工程第 5.2、5.3 节 | 缩略图存 `thumbs/<slotId>.png` 经存档后端；`summary` 记存档信息 | 缩略图与难度暂存页面本机存储，按 `runId` 与 `savedAt` 对上才显示 | 存档后端与 `summary` 是内核文件 | 是（README 第 11 节第 2 项） |
| 界面第 3.4.1 节 | 难度存在存档里 | 新游戏把内置量 `difficulty`、`ironman` 作为第 1 个 tick 的 `flag.set` 命令写入世界 | 注册表第 8.1 节的写入方是"内核与新游戏"，命令进重放日志，确定性不变 | 否 |
| 界面第 9.1 节 | 回廊是小型 HD-2D 场景 | 先做平面示意图（同一结构，信息一致） | 第 9.1 节允许平面档用示意图；场景转遗留 | 否 |
| 界面第 9.4 节 | 开门长按 1 秒 | 开门按钮单按 | 开门仪式与 `ui_pop_door` 在 PK-M1-57 | 否 |
| 界面第 5.2 节 `ui_hud_party` | 右键打开该同伴的指令环 | 右键只选中 | 输入层还没有从 HUD 打开环的接口 | 否 |
| 界面第 16.7 节 | 手柄震动 | 不在本包：音频子系统的震动表（`src/client/audio/rumble.ts`）已经接线，本包写的一份重复触发，已撤下 | 一个主人；低血心跳一行转 PK-M1-06 | 否 |
| 界面第 6.2.14、8.2 节 | 过场中短按 Esc 打开暂停菜单 | 短按 Esc 先关回看、梗概卡与隐藏文字，再无事可做时不开菜单 | 转遗留 | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `src/systems/scenes/types.ts`、`view.ts` | 播放器要读的可选字段（主会话允许的小改） | 叙事 | 已改并已告知 |
| `src/client/input/{actions,contexts,input_controller,input_layer}.ts` | 回廊情境、网页备键、焦点点击、确认弹层与手柄选项光标 | PK-M1-07（已完成） | 已改并已告知 |
| `src/client/adapters/social.ts` | 对话行的 `generated` 标记（AI 角标） | 客户端 | 已改 |
| `src/client/hud/conversation_box.ts`、`scene_panel.ts` | 已无引用 | 主会话 | 请删除（本包未创建，按纪律未删） |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 存档后端存缩略图、`SaveSummary` 加难度 | 内核负责方或 PK-M2-03 |
| 引导级别与追踪状态迁进存档的客户端段；全部 `tut_`；已读快进与全局已读表；回想页 | PK-M1-23 |
| 游戏性页其余项、难度可改、关闭铁人、窗口打开时暂停的开关、存档失败的"重试""换槽位"、开门仪式与 `ui_pop_door`、死亡回顾 | PK-M1-57 |
| 音频、无障碍、存档与隐私设置页；低血心跳震动；环境声覆盖与过场音效字幕 | PK-M1-06、PK-M1-23、PK-M1-57 |
| 大模型屏 A 到屏 J；AI 角标的连接名与模型名、`flags.jsonl` 经桌面壳、被屏蔽行换成内置 AI 的回应 | PK-M1-02 |
| 新游戏页的"连接一个服务"按钮（`ui_pop_llm_connect`）；标题链接新游戏页 | PK-M1-44 |
| 过场的镜头、光、天气、庭镜、动作指令的执行；当幕远景作插画退化 | 镜头导演包（新开）或 PK-M1-27 之后的客户端包 |
| 序章过场数据写 `presentation`、`stage`、`summary`、`anchor` | PK-M1-27 |
| 台词行的 `expression`、`claim`、心声、系统条、新知；对方态度标签与选项的灰显原因；无貌者标记 | 社会与叙事各包、PK-M1-27 |
| 门卡的危险五档、代价预览、互斥对象、新规则与新决策、"去哪里找"；门后的风 | 千门负责方（门视图字段），之后回廊门卡 |
| 追踪的方向与距离或"在某地一带"（标记缺任务编号与精度） | PK-M1-57 或任务标记负责方 |
| 已结束页按结束时刻排序（视图缺结束 tick） | 任务视图负责方 |
| HD-2D 回廊场景、团队格（超过 5 人） | PK-M2-16 |
| 手柄长按 AI 角标；从 HUD 打开队伍指令环 | PK-M1-23 |
| 画手每帧写同值的 `hidden`；散句之间同一对象不重打；同一节点再次进入不重放指令；追踪读屏标签随语言重画；提示条传送后重定原点 | 本包后续小修 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 其他并行包落定前，套件里有本包以外的失败 | 无法一次看到全绿 | 并行包落定后重跑 [verification_matrix.md](verification_matrix.md) 第 4 节列出的测试 |
| 缩略图存页面本机存储 | 桌面版与网页版都受本机存储上限约束（单张有上限） | 存档后端支持缩略图后迁移 |

**需用户决定**

| 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- |
| 见 [README.md](README.md) 第 11 节 | | 不阻塞 |
