# PK-M1-23 第一幕窗口、引导与无障碍（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-23` 第一幕窗口、引导与无障碍 |
| 状态 | 进行中（实施、复查与修复已完成，建议主会话提交后改为"已完成"，依据见 [verification_matrix.md](verification_matrix.md)；遗留与请求见 [progress.md](progress.md) 第 3 节） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-23` |
| 形态 | 大包（6 代理人日）；按本目录约定只写入口、验收与进度三件 |
| 工作流 | 客户端 |
| 量级 | 6 代理人日，1 用户人日 |
| 依赖 | PK-M1-22（已完成：HUD、对话、过场、回廊、设置外壳、存档列表） |
| 立项日期 | 2026-11-18 |

## 1. 目标

界面第 24.2 节 M1 后段：第一幕的新窗口（委托板、事迹、图鉴、生业、采集、迷宫、证物、传书、兽伴）各自在玩家遇到它的那一刻开放；序章与第一幕的全部 `tut_` 与相关 `tut_any_` 有数据、调度、呈现与检查；
无障碍首批（色觉模式、文字大小、声音字幕的开关与样式、减少闪烁、长按改切换）有设置页并作用于界面；存档带客户端段（引导级别与步骤、追踪、证物备注、已开放的窗口），难度进 `SaveSummary`；
并答复各包转来的界面请求（PK-M1-15 名册与铁人开关、PK-M1-20 硬币与供品、PK-M1-47 委托板与实例标题、PK-M1-48 三个记录窗口、PK-M1-50 场地状态条与迷宫窗口、PK-M1-52 兽潮之夜面板、PK-M1-54 灵镜手柄情境与 `tut_p_*`、PK-M1-06 无障碍页与字幕样式）。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 九个第一幕窗口：纯视图核心加薄画手，适配器在各自的门面文件；登记表从"计划"移到"已建"；菜单栏按第 5.2 节排序 | `src/client/windows/records/`（事迹、图鉴、传书、证物）、`src/client/windows/field/`（委托板、生业与采集、迷宫与兽伴、同伴）；`src/client/view/adapters_records.ts`、`adapters_field.ts`；`src/client/adapters/records.ts`、`field.ts`；`window_registry.ts`、`windows/index.ts` | 界面第 2.3、6.1、6.3.1 到 6.3.11 节 |
| 2 | 窗口开放：在第 1.5 节写的时刻开放，开放后不收回，不出现空壳；锁着时按快捷键给一行"还不能使用"；委托板、采集点、工站站在旁边按交互键打开；每个窗口标题栏的"？"显示帮助条目 | `src/client/windows/window_unlocks.ts`、`window_manager.ts`、`src/client/app/player_input.ts` | 界面第 1.5、6.1、17.7 节；UX-8 |
| 3 | HUD：场地状态条、兽潮之夜面板、梅尔卡硬币角标与供奉弹层；门代价与澱染计量读 `player.sed_stage`；澱病光环与形态、状态名在知澱之前用凡人叫法 | `src/client/hud/dungeon_bar*.ts`、`tide_panel*.ts`、`coin_badge*.ts`、`offer_pop*.ts`、`gauges_model.ts`；`src/client/view/mortal_terms.ts`、`adapters_tide.ts`；`src/client/adapters/tide.ts` | 界面第 5.2、6.4 节；D-030 |
| 4 | 新手引导：65 个步骤（序章 9、第一幕 41、任何时候 15）的数据、触发与完成、调度（优先级、间隔、抑制、超时）、引导级别、提示条、高亮、引导卡、帮助的引导卡页与术语表；引导检查工具 | `src/client/tutorial/`、`tools/tutorial/check.ts`、`src/client/windows/help_model.ts`、`help_window.ts`、`src/client/app/tut_signals.ts`、`act1_wiring.ts` | 界面第 17 节、第 23.2 节引导检查 |
| 5 | 无障碍：设置页四组；色觉模式与高对比的令牌；文字大小与对话加大；字幕的开关、大小、底色、位置与说话者颜色；减少闪烁；长按改切换覆盖开门；过场音效的字幕；只用手柄时的音频解锁 | `src/client/windows/settings/access_model.ts`、`access_page.ts`；`src/client/app/accessibility.ts`、`access_apply_model.ts`；`src/client/access.css`；`src/client/audio/caption_painter.ts`、`cine_captions.ts`、`pad_unlock.ts` | 界面第 4.7、18 节；音频方向第 10.4 节 |
| 6 | 存档的客户端段与难度：槽位头的不透明字段 `client`（引导、追踪、证物备注、已开放窗口），读档时还给会话；`SaveSummary.difficulty` | `src/client/app/client_segment.ts`、`src/client/hud/save_slots.ts`、`tracker_model.ts`；`src/core/save/header.ts`、`run_saver.ts`、`recovery.ts`（越界，小） | 界面第 4.1、17.8 节；发行工程第 5.3 节 |
| 7 | 输入：从队伍框右键打开单个同伴的指令环与"单人指令"扇区；灵镜的 `creator` 情境；手柄长按 AI 角标的输入侧；模态引导卡接手柄；读过文字的已读表与快进判定（控制器接线请求 PK-M1-34/55） | `src/client/input/`（`party_ring.ts`、`card_pad.ts`、`contexts.ts`、`pad_bindings.ts`、`input_hub.ts`、`input_layer.ts`）、`src/client/hud/party_frames.ts`、`src/client/hud/creator/creator_panel.ts`、`src/client/app/creator_wiring.ts`、`read_log.ts` | 界面第 3.4.3、5.2、7.3、16.5、18.5 节 |
| 8 | 日志与标题：`party.joined`、`party.left` 按 `companionId` 取名；委托实例的标题经 `QuestView.textOf` | `src/client/adapters/log.ts`、`corridor.ts`；`src/client/view/quest_title.ts` | PK-M1-15 请求 5；PK-M1-47 |
| 9 | 文档回写 | 界面第 2 节各表"现有"一列、第 17.5 节 `tut_p_listen` 行、第 23.2 节引导检查行 | 本包 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 第二幕起的窗口（行进、市场、议事、军队）与第二幕起的 `tut_` | PK-M2 各包 |
| 2 | 游戏性页其余项（名望显示等）、开门仪式、死亡回顾、人物卡 `ui_pop_charcard`、菜单栏"更多"折叠与新开放小圆点 | PK-M1-57 |
| 3 | 过场播放器内部：回想页的只读重播、AI 角标弹层、已读快进的控制器接线 | PK-M1-34/55（请求见 `progress.md`） |
| 4 | 内核视图的新字段（证物的审庭字段、兽伴喂食与饱足、公会的"在板前"查询等） | 见 `progress.md` 第 3 节的请求 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、目录分工 |
| [ux_and_onboarding.md](../../40_design/ux_and_onboarding.md) 第 1.5、4.7、5.2、6、16.5、17、18、19.2、23 节 | 本包实现的规则与验收 |
| [architecture.md](../../50_tech/architecture.md) 第 7 节、[implementation_conventions.md](../../50_tech/implementation_conventions.md) 第 8 节 | 客户端只读 `GameView`、文本键 |
| `src/client/tutorial/index.ts` 的头注释 | 引导模块的局部规则 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 纯核心 | 规则在纯模块（无 DOM、无真随机与墙钟），画手只写 DOM | `tests/client_purity.test.ts` 的 `CLIENT_PURE_CORES` |
| 文本 | 玩家可见文字全是文本键（含 `aria-label` 与 `title`）；按键写 `{key:<情境>.<动作>}`；源码无中文字面量；无禁用字符 | `node tools/i18n/check.ts`、`tests/i18n_ui_guard.test.ts` |
| 引导 | 触发与完成只引用注册的旗标、真实事件或有产出方的信号；每步有完成条件；`tut.*` 长度上限 | `node tools/tutorial/check.ts` |
| 内核 | 不改 `src/systems/*`；存档头只加可选字段，旧存档照常读 | `tests/save_container.test.ts` 等存档用例、`tests/client_act1_wiring.test.ts` |
| 公平 | 画质与无障碍只减装饰，不减可行动信息（UX-6、第 18.2 节） | `tests/client_access.test.ts` 的对比度与令牌检查 |

## 6. 文件范围

逐文件清单与越界改动见 [progress.md](progress.md) 第 2 节。

## 7. 验证命令

在 `hakoniwa/` 下运行（按用户要求，只跑下列检查与本包新增或改动的客户端测试文件；全量 `npm test` 与 `npm run playthrough` 延后，见 `progress.md` 第 5 节）：

```
npm run typecheck
node tools/i18n/check.ts
node tools/tutorial/check.ts
node tools/content/validate.ts
npx vitest run --config vitest.config.ts tests/client_act1_wiring.test.ts tests/client_records_windows.test.ts tests/client_field_windows.test.ts tests/client_tutorial.test.ts tests/client_access.test.ts tests/client_hud_extras.test.ts tests/client_input_extras.test.ts
npx vitest run --config vitest.config.ts tests/client_purity.test.ts tests/client_window_catalogue.test.ts tests/client_windows.test.ts tests/client_player_input.test.ts tests/client_settings_shell.test.ts tests/i18n_ui_guard.test.ts tests/i18n_ui_strings.test.ts tests/settings_store.test.ts tests/desktop_settings.test.ts
npx vitest run --config vitest.config.ts tests/client_input_bindings.test.ts tests/client_keymap_contexts.test.ts tests/client_input_cores.test.ts tests/client_input_hub.test.ts tests/client_prologue_stage.test.ts tests/client_gamepad_playthrough.test.ts tests/client_saves_newgame.test.ts tests/client_saves_migrate.test.ts tests/client_corridor_tracker.test.ts tests/client_hud_party_notify.test.ts tests/client_adapters.test.ts tests/client_story.test.ts tests/client_log_format.test.ts tests/audio_engine.test.ts
npx vitest run --config vitest.config.ts tests/save_container.test.ts tests/save_ironman.test.ts tests/save_migration.test.ts tests/save_recovery.test.ts tests/save_renames.test.ts tests/save_versions.test.ts
```

## 8. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 新起子代理的覆盖性复查 | 必派 | 一次贡献结束；结论与处理见 [progress.md](progress.md) 第 2 节 |

## 9. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、字符串表、测试、界面文档回写、本目录 | 主会话 | 抽看 [verification_matrix.md](verification_matrix.md)；第 7 节命令绿；延后的全量测试在提交前跑一次 |
| 请求（引导信号的事件、过场播放器的三处接线、内核视图字段） | 各包，见 `progress.md` 第 3 节 | 各包落地后，对应 `tut_` 的等待项在引导检查里消失 |

## 10. 需用户决定

见 [progress.md](progress.md) 第 4 节。
