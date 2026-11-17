# PK-M1-22 HUD、对话、过场与回廊（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-22` HUD、对话、过场与回廊 |
| 状态 | 进行中（实施与验证已完成，建议主会话提交后改为"已完成"，见 [verification_matrix.md](verification_matrix.md)） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-22` |
| 形态 | 大包（7 代理人日）；按本目录约定只写入口、验收与进度三件 |
| 工作流 | 客户端 |
| 量级 | 7 代理人日，1 用户人日 |
| 依赖 | PK-M0-15（字符串表与 `t()`）；PK-M1-07（输入层：24 格快捷栏、按键图示、环形菜单、改键纯核心） |
| 立项日期 | 2026-11-17 |

## 1. 目标

界面第 24.2 节 M1 前段：HUD 补齐（队伍框、焦点框、追踪、通知、门代价与澱染计量、提示条），对话两种版式与头像、半身立绘，过场播放器三种演出（音乐编号、起始层、静默、音效），
回廊模式，设置外壳，新游戏（难度、铁人、引导级别），读档与存档元数据、缩略图，AI 生成文本的标识与举报入口。按 D-096 先做序章与第一幕、先做无模型档；`ui_hud_focus`（M2 项）与 AI 角标最后做。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 确认弹层（不可逆操作长按 0.6 秒或按两次，Esc 与 B 取消，手柄可用） | `src/client/hud/confirm_model.ts`、`confirm_pop.ts` | 界面第 6.4 节 `ui_pop_confirm`、第 18.5 节 |
| 2 | 对话两种版式：常规（左侧头像、名字、职名、最近 6 行、编号选项与系统标签、自由输入与字数、回看、离开）与剧情（半身立绘在面板上方，说话者亮、听者暗）；散句；打字机、自动推进、回看；头像与立绘解析及缺图退化 | `src/client/hud/story/`（`dialogue_model.ts`、`dialogue_panel.ts`、`portrait_plan.ts`、`portrait_view.ts`、`reading.ts`、`backlog.ts`） | 界面第 7 节；美术方案第 3.6 节 |
| 3 | 过场播放器：演出（上下黑边）、剧场、插画三种演出；演出指令（音乐、音效、环境、静默、立绘、黑白场、字幕、信件、震屏）；跳过到下一个选择点或锚点并显示梗概卡；回看、自动、隐藏文字；不可逆选项先确认；音频经接口交给音频子系统 | `src/client/hud/story/`（`cutscene_model.ts`、`cutscene_player.ts`、`stage.ts`、`letter_card.ts`、`story_controller.ts`、`story_view.ts`）、`src/client/app/story_wiring.ts`；`src/systems/scenes/types.ts` 与 `view.ts` 的可选字段 | 界面第 8.1 到 8.4 节；过场目录第 2.7、13 节 |
| 4 | 回廊模式：平面示意图（门前厅、六段、段尽头的厅、翼），门的状态按形状与文字区分，门缝档不露门名与钥数，门卡、开门、闭门（确认）、钉到追踪、筛选；门镜（门阶、淤塞、门疲）；模式窗口打开时关闭其他窗口并暂停世界 | `src/client/windows/corridor/`、`src/client/adapters/corridor.ts`、`window_manager.ts` 的模式窗口 | 界面第 1.3、9 节；千门目录第 3.2 节 |
| 5 | 任务日志：主线、纷争、委托、同伴、女神、已结束六个页签，种类徽标，"本幕第 N 周"，已结束一栏与所走的路径（不写红色"任务失败"）；追踪开关 | `src/client/windows/quest_log_model.ts`、`story_windows.ts` | 界面第 14.1 节；PK-M1-45、PK-M1-58 遗留 |
| 6 | HUD：任务追踪、门代价与澱染计量、队伍框、焦点框、通知（四级优先级）、提示条 | `src/client/hud/{tracker,gauges,party,focus,notify,hint}*`、`src/client/app/hud_extras.ts`、`notify_context.ts` | 界面第 5.2、5.4、14.2、17.2、17.3 节 |
| 7 | 设置外壳与页：画质、操作与改键（PK-M1-07 遗留）、游戏性（文字速度、自动推进、引导级别、难度只读）、大模型（原开关）、语言；帮助窗口按设备重画；网页版窗口页签备键 | `src/client/windows/settings/`、`settings_window.ts`、`help_model.ts`、`help_window.ts`；`settings_schema.ts` 的 `gameplay` 字段 | 界面第 4.1、4.4、4.5、16.6 节 |
| 8 | 新游戏页：难度四卡、铁人、引导级别、大模型只读卡、存储提示、开局确认；开局时把内置量 `difficulty`、`ironman` 作为第 1 个 tick 的命令写入 | `src/client/app/newgame_model.ts`、`newgame_screen.ts`、`main.ts` | 界面第 3.4 节；变量注册表第 8.1 节 |
| 9 | 读档与存档：一份列表组件供标题读档与存档窗口共用，元数据（缩略图、幕与地点、日期、游玩时长、历练等级、难度与铁人角标、AI 模式、存档时间）、空与错误状态；序章不能存档；铁人局只有一个槽；读档经全部系统作为切片主人的迁移器（改名到达战斗切片） | `src/client/hud/save_list_model.ts`、`save_list.ts`、`save_slots.ts`、`slot_extras.ts`、`src/client/app/thumbnail.ts`、`main.ts` | 界面第 3.5、6.2.13 节；发行工程第 5.1、5.3、5.5、5.9 节 |
| 10 | 暂停规则：设置、存档、菜单、帮助与确认弹层打开时世界暂停；传说难度开环不降速 | `window_registry.ts` 的 `pauses`、`session.ts`、`player_input.ts` | 界面第 1.3 节；PK-M1-07 遗留 |
| 11 | 文档回写 | 界面第 2 节各表"现有"一列 | 本包 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 音频、无障碍、存档与隐私三个设置页；游戏性页的其余项 | PK-M1-06、PK-M1-23、PK-M1-57 |
| 2 | 大模型页屏 A 到屏 J、连接弹层 `ui_pop_llm_connect` | PK-M1-02、PK-M1-44 |
| 3 | 全部 `tut_`、`TutorialStore`、引导卡 | PK-M1-23 |
| 4 | 开门仪式（长按）与 `ui_pop_door`、死亡回顾等弹层 | PK-M1-57 |
| 5 | 手柄震动表（本包的震动触发与音频子系统的 `src/client/audio/rumble.ts` 重复，已撤下） | PK-M1-06 |
| 6 | HD-2D 回廊场景、过场的镜头、光、天气与庭镜指令的执行 | 见 [progress.md](progress.md) 遗留 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、目录分工 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 纯核心加薄画手；`tests/client_purity.test.ts` 的 `CLIENT_PURE_CORES` |
| [ux_and_onboarding.md](../../40_design/ux_and_onboarding.md) 第 1.3、2、3.4、3.5、4、5、6.4、7、8、9、14、17.2、19.2、22、24 节 | 本包实现的规则与验收 |
| [catalog_cutscenes.md](../../40_design/content/catalog_cutscenes.md) 第 2.7、13 节 | 过场播放器的契约 |
| [art_pipeline.md](../../50_tech/art_pipeline.md) 第 3.6 节 | 头像、立绘与缺图退化 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 纯核心 | 规则全部在纯模块（无 DOM、无真随机与墙钟），画手只写 DOM，写入前比较 | `tests/client_purity.test.ts` |
| 文本 | 界面文字全部是 `ui.*` 键；字符串表里不写死按键名与鼠标键名；键名的末段不写 DOM 全局名（架构守卫扫描 `src/core` 的生成文件） | `tests/i18n_ui_guard.test.ts`、`tests/client_input_bindings.test.ts`、`tests/architecture.test.ts`、`node tools/i18n/check.ts` |
| 设置 | 新字段逐字段校验；同步份不升版本号（旧版本把新字段当缺省） | `tests/settings_store.test.ts`、`tests/desktop_settings.test.ts` |
| 世界 | 客户端只经命令改世界；开局的难度与铁人是第 1 个 tick 的 `flag.set` 命令，进重放日志 | `tests/client_saves_newgame.test.ts` |
| 内核字段 | `src/systems/scenes/` 只加可选字段，内核不读 | `tests/scenes.test.ts` |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/client/hud/story/`、`src/client/hud/{confirm_model,confirm_pop,focus_frame,focus_model,gauges,gauges_model,hint_bar,hint_model,notify,notify_model,party_frames,party_model,save_list,save_list_model,slot_extras,tracker,tracker_model}.ts` 与同名 CSS、`src/client/hud/hud_c.css`、`src/client/windows/corridor/`、`src/client/windows/settings/`、`src/client/windows/{help_model,help_window,quest_log_model}.ts`、`quest_log.css`、`src/client/adapters/corridor.ts`、`src/client/app/{hud_extras,newgame_model,newgame_screen,notify_context,story_wiring,thumbnail}.ts`、`newgame.css`、`tests/{client_corridor_tracker,client_hud_party_notify,client_saves_migrate,client_saves_newgame,client_settings_shell,client_story}.test.ts`、本目录 |
| 本包修改 | `src/client/app/{main,session,player_input,event_router,boot_screen,adapters_wiring,settings_schema}.ts`、`src/client/hud/{hud,save_slots}.ts`、`src/client/windows/{index,kit,settings_window,simple_windows,story_windows,window_context,window_manager,window_registry}.ts`、`src/client/view/adapters.ts`、`src/client/adapters/social.ts`、`src/client/input/{actions,contexts,input_controller,input_layer}.ts`、`src/client/client.css`（删去不再使用的对话框、场景面板与存档行规则）、`src/systems/scenes/{types,view}.ts`、`locales/zh-Hans/ui.json`、`src/core/text_keys.generated.ts`（重新生成）、`tests/{client_purity,settings_store,desktop_settings}.test.ts`、界面文档第 2 节 |
| 不再使用 | `src/client/hud/conversation_box.ts`、`src/client/hud/scene_panel.ts`（已无引用；本包未创建它们，按并行纪律未删，交主会话删除） |
| 不得修改 | 其他并行包的文件：`src/client/audio/`、`src/systems/` 的其他系统、`data/`、`src/editor/`、`tools/` |

## 7. 停止条件

dev_process 第 3.6 节全部适用；本包未触发。

## 8. 验证命令

在 `hakoniwa/` 下运行：

```
npx vitest run --config vitest.config.ts tests/client_story.test.ts tests/client_hud_party_notify.test.ts tests/client_settings_shell.test.ts tests/client_corridor_tracker.test.ts tests/client_saves_newgame.test.ts tests/client_saves_migrate.test.ts
npx vitest run --config vitest.config.ts tests/client_purity.test.ts tests/client_windows.test.ts tests/client_window_catalogue.test.ts tests/client_input_bindings.test.ts tests/client_keymap_contexts.test.ts tests/client_input_cores.test.ts tests/i18n_ui_guard.test.ts tests/settings_store.test.ts tests/desktop_settings.test.ts tests/architecture.test.ts
npx vitest run --config vitest.config.ts tests/client_adapters.test.ts tests/client_player_input.test.ts tests/client_gamepad_playthrough.test.ts tests/save_recovery.test.ts tests/save_migration.test.ts
npm run typecheck
node tools/i18n/check.ts
npm run build
```

浏览器核对：开发服务（`.claude/launch.json` 的 `hakoniwa`，端口 5180），核对后停掉服务（见 [verification_matrix.md](verification_matrix.md) 第 1.3 节）。

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 新起会话的覆盖审查（两份：故事与 HUD 一侧；设置、存档与回廊一侧） | 必派 | 一次贡献结束；结论见 [verification_matrix.md](verification_matrix.md) 第 3 节 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、字符串表、测试、界面第 2 节回写、本目录 | 主会话 | 抽看 [verification_matrix.md](verification_matrix.md)；上面的验证命令在其他并行包落定后全绿（基线问题见第 4 节） |
| 过场数据字段（`presentation`、`illustration`、`summary`、`stage`、`anchor`、`confirm`） | PK-M1-27（序章内容批次） | 序章 `cut_p_` 按过场目录第 2.2 节写这些字段，播放器即按此演出 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 引导级别存在哪里：界面第 4.1 节写"存在存档的客户端段"，现在还没有客户端段 | 推荐本包做法：暂存同步设置 `gameplay.guidance`，引导存储（PK-M1-23）落地时迁进存档的客户端段 | 不阻塞 |
| 2 | 缩略图与难度存在哪里：发行工程第 5.2 节写 `thumbs/<slotId>.png` 经存档后端，槽位头的 `summary` 没有难度字段 | 推荐本包做法：暂存页面本机存储，按槽位头的 `runId` 与 `savedAt` 对上才显示；后端与 `summary` 字段由内核负责方补 | 不阻塞 |
