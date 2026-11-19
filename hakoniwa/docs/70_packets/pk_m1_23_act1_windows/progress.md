# PK-M1-23 第一幕窗口、引导与无障碍：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-18 到 11-19 | 实施（六路并行加整合）、新起子代理的覆盖性复查、修复 | 九个第一幕窗口与适配器、窗口开放规则、场地状态条、兽潮面板、硬币角标与供奉弹层、65 个引导步骤与调度与检查、无障碍页与色觉、文字、字幕、减少闪烁、存档客户端段与难度、输入（队伍指令环、灵镜情境、模态引导卡接手柄）、日志取名与实例标题、界面文档回写 | 未提交 | 见 [verification_matrix.md](verification_matrix.md) 第 1 节 | 1. 主会话提交；2. 跑第 5 节延后的全量测试；3. 各包按第 3 节的请求落地 |

## 2. 汇报

### 2026-11-18 到 11-19 实施、复查与修复

**做法。** 先读包行、界面文档与各包转来的请求，再把工作分成六路互不重叠的文件集合并行实施（记录类窗口；场地类窗口与同伴窗口；新手引导；无障碍；HUD 附件与背包；输入），整合层（适配器门面的汇总、窗口登记与工厂、会话接线、存档客户端段）由本会话完成；
之后派新起子代理做覆盖性复查，按发现退回原作者修复，整合层的发现由本会话修复。

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/client/view/adapters_records.ts`、`adapters_field.ts`、`adapters_tide.ts` | 新增 | 新适配器的门面：`DeedsAdapter`、`CodexAdapter`、`LettersAdapter`、`EvidenceAdapter`；`BoardAdapter`、`CraftAdapter`、`GatherAdapter`、`DungeonAdapter`、`BeastsAdapter`、`PartyRosterAdapter`；`TideAdapter` |
| `src/client/view/adapters.ts` | 修改 | 转出三个门面；`ClientAdapters` 加 11 个键 |
| `src/client/adapters/records.ts`、`field.ts`、`tide.ts` | 新增 | 适配器实现（读各系统导出的查询，拼命令） |
| `src/client/app/adapters_wiring.ts` | 修改 | 建全部新适配器 |
| `src/client/view/mortal_terms.ts`、`quest_title.ts` | 新增 | 知澱前后的叫法与旗标；任务与委托实例的标题（`QuestView.textOf`） |
| `src/client/adapters/log.ts`、`corridor.ts`、`combat.ts` | 修改 | `party.joined`、`party.left` 按 `companionId` 取名；实例标题；澱病光环的凡人名 |
| `src/client/windows/records/`（`deeds_*`、`codex_*`、`letters_*`、`evidence_*`、`mortal_name.ts`、`records.css`、`index.ts`） | 新增 | 事迹、图鉴（含回想页）、传书、证物与史料四个窗口 |
| `src/client/windows/field/`（`board_*`、`craft_*`、`dungeon_*`、`beasts_model.ts`、`party_window*`、`field.css`、`index.ts`） | 新增 | 委托板、生业与采集、迷宫与兽伴、同伴（名册、指令、铁人开关） |
| `src/client/windows/window_unlocks.ts` | 新增 | 第 1.5 节的开放时刻（`client.win.<id>`，开放后不收回，随存档） |
| `src/client/windows/window_registry.ts` | 修改（共享） | 九个窗口从计划移到已建；同伴、事迹等按开放键；菜单栏按第 5.2 节排序；见下方共享文件的改动 |
| `src/client/windows/index.ts`、`window_context.ts` | 修改 | 新窗口的工厂；同伴窗口改用 `field/party_window.ts`；帮助窗口读引导；证物备注；回想重播的回调位 |
| `src/client/windows/window_manager.ts`、`src/client/client.css` | 修改 | 标题栏"？"显示帮助条目；窗口根节点带 `data-hud` |
| `src/client/windows/social_windows.ts` | 修改 | 删去旧同伴窗口；女神窗口加"使用硬币"（`goddess.coin`） |
| `src/client/windows/inventory_view.ts`、`inventory_window.ts`、`inventory.css` | 修改、新增 | 实例的耐久、署名、澱纹档、"属性失效" |
| `src/client/windows/help_model.ts`、`help_window.ts` | 修改 | 引导卡页与术语表页 |
| `src/client/windows/settings/access_model.ts`、`access_page.ts` | 新增 | `ui_set_access` 四组 |
| `src/client/windows/settings_window.ts`、`settings/shell_model.ts`、`settings/controls_model.ts` | 修改 | 登记无障碍页与其"恢复默认"；灵镜情境只在序章列出 |
| `src/client/app/settings_schema.ts` | 修改 | `Accessibility` 加字幕大小、底色、位置、说话者颜色四项（同步份不升版本，旧值按默认） |
| `src/client/app/accessibility.ts`、`access_apply_model.ts`、`src/client/access.css` | 新增 | 色觉令牌、文字大小、对话加大、减少动画的应用 |
| `src/client/hud/dungeon_bar*.ts`、`tide_panel*.ts`、`coin_badge*.ts`、`offer_pop*.ts`、`hud_extra.css` | 新增 | `ui_hud_dungeon`、兽潮面板、`ui_hud_coin`、`ui_pop_offer` |
| `src/client/hud/hud.ts`、`menu_bar.ts`、`hotbar.ts`、`unit_frames.ts`、`gauges_model.ts`、`party_frames.ts`、`radial_menu.ts`、`tracker_model.ts`、`save_slots.ts` | 修改 | 组合新元件与引导用的 `data-hud`；计量读 `player.sed_stage`；队伍框右键开环；环标题；追踪的快照；存档写客户端段与难度 |
| `src/client/hud/creator/creator_panel.ts`、`src/client/app/creator_wiring.ts` | 修改 | 灵镜的 `creator` 情境（键盘与手柄可达全部控件） |
| `src/client/tutorial/`（`steps*.ts`、`catalog.ts`、`store.ts`、`scheduler.ts`、`triggers.ts`、`card_*`、`glow*`、`glossary.ts`、`check.ts`、`tutorial_session.ts`、`tutorial.css`、`index.ts`） | 新增 | 新手引导 |
| `tools/tutorial/check.ts`、`check_cli.ts` | 新增 | 引导检查 |
| `src/client/app/act1_wiring.ts`、`tut_signals.ts`、`client_segment.ts`、`read_log.ts` | 新增 | 会话侧接线；引导信号；存档客户端段；已读表 |
| `src/client/app/session.ts`、`main.ts`、`hud_extras.ts`、`player_input.ts`、`story_wiring.ts` | 修改 | 接线（见下） |
| `src/client/audio/cine_captions.ts`、`pad_unlock.ts` | 新增 | 过场音效字幕表；手柄首按解锁音频 |
| `src/client/audio/audio_settings.ts`、`caption_painter.ts`、`index.ts` | 修改（越界，小） | 字幕样式与位置 |
| `src/client/input/party_ring.ts`、`card_pad.ts` | 新增 | 单人指令环；模态引导卡的手柄应答 |
| `src/client/input/actions.ts`、`contexts.ts`、`pad_bindings.ts`、`input_hub.ts`、`input_layer.ts`、`radial.ts` | 修改 | `creator` 情境、AI 角标长按、带目标的环、长按改切换覆盖只有长按的键 |
| `src/core/save/header.ts`、`run_saver.ts`、`recovery.ts` | 修改（越界，加法） | 见下方共享文件的改动 |
| `locales/zh-Hans/ui_records.json`、`ui_field.json`、`tut.json`、`ui_tut.json`、`ui_access.json`、`ui_hud_extra.json`、`ui_input.json` | 新增 | 本包的界面与引导文本（按领域分文件，`gen_keys` 与运行时都读全部 `*.json`） |
| `locales/zh-Hans/ui.json` | 修改（共享） | 见下方共享文件的改动 |
| `src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 工具重生成 | `node tools/i18n/gen_keys.ts`、`node tools/i18n/extract_content.ts`（同时带进他包同期的数据改动） |
| `tests/client_act1_wiring.test.ts`、`client_records_windows.test.ts`、`client_field_windows.test.ts`、`client_tutorial.test.ts`、`client_access.test.ts`、`client_hud_extras.test.ts`、`client_input_extras.test.ts` | 新增 | 纯核心与存档段的单测 |
| `tests/client_purity.test.ts`、`client_window_catalogue.test.ts`、`client_player_input.test.ts`、`client_settings_shell.test.ts`、`client_keymap_contexts.test.ts`、`settings_store.test.ts`、`desktop_settings.test.ts` 及各路改到的既有客户端测试 | 修改 | 纯核心名单；窗口数 27 与 4；队伍环 5 扇区；分领域的界面表；新情境；无障碍新字段 |
| `docs/40_design/ux_and_onboarding.md` | 修改（回写） | 第 2 节各表"现有"一列；第 17.5 节 `tut_p_listen` 行（按序章文档，PK-M1-54 转来）；第 23.2 节引导检查行 |
| `docs/70_packets/pk_m1_23_act1_windows/` | 新增 | 本目录三件 |

**共享文件的改动（逐处）**

| 文件 | 改动 |
| --- | --- |
| `src/client/windows/window_registry.ts` | `WindowId` 加九个；`PlannedWindowId` 只剩 `atlas`、`market`、`council`、`army`；`WINDOW_DEFS` 重排为第 5.2 节的菜单栏顺序，`party`、`deeds`、`codex`、`craft`、`letters`、`beasts`、`dungeon`、`evidence` 带 `requiresAll: ['client.win.<id>']`，`board`、`gather` 不上菜单栏；快捷键标签 `O`、`J`、`U`、`T`、`H`、`Shift+O` |
| `locales/zh-Hans/ui.json` | 加 `ui.win.goddess.use_coin`、`ui.common.not_yet`、`ui.common.panel.help`、`ui.common.panel.help_mark`；`ui.win.party.empty_state` 补第 6.2.7 节的第二句；删去只被旧同伴窗口用的 `ui.win.party.next_bond`（同表里他包同期加的 `ui.common.feature.*` 九行不是本包的） |
| `src/core/save/header.ts` | `SaveSummary.difficulty?`；`ClientSegmentData`、`CLIENT_SEGMENT_LIMIT`（32768）；`SlotHeaderDraft.client?`；`isHeaderDraft` 查 `client` 为不超限的对象、`summary.difficulty` 为短字符串 |
| `src/core/save/run_saver.ts` | `SaveRequest.client?`，写进草稿 |
| `src/core/save/recovery.ts` | 恢复存档带上原槽位头的 `client` |
| `src/client/audio/audio_settings.ts`、`caption_painter.ts`、`index.ts` | 字幕样式（`captionStyle`）与绘制；`index.ts` 一行把样式传给画手 |
| `src/client/app/story_wiring.ts` | 过场音效带字幕（`cineCaption`）；`creatorOpen`、`aiMark`、`listenTierNow` |
| `src/client/hd2d/ground_marks.ts`、`entities.ts`、`hd2d_renderer.ts`、`src/client/render/flat_renderer.ts`、`overlay_painter.ts`、`src/client/hud/minimap_model.ts`、`minimap.ts`、`src/client/windows/map_window.ts` | 色觉模式到达画布：选择环、头顶名字、地面预警、小地图与地图的点读新纯模块 `src/client/render/palette_modes.ts`（`ringColor`、`nameColor`、`dotColor`、`activePalette`），模式变化时环的材质缓存键随 `paletteVersion()` 换；两个渲染器的"减少动画"改读页面设置（`worldCalm()`），闪电与粒子随之；原有常量表保留为标准档 |
| `tests/i18n_ui_guard.test.ts` | 允许清单加三条检测用的正则（`tutorial/card_model.ts` 的 `firstSentence`，`tutorial/check.ts` 的 `KEY_WORDS`、`displayLength`），它们读文字、从不显示 |
| `src/client/tutorial/card_pop.ts` | （同包内跨路）`tutorialCardState`、`answerTutorialCard`，模态卡接手柄 |

**会话接线（`src/client/app/act1_wiring.ts`，`session.ts` 只加调用点）**

- 窗口可用性读"世界旗标加开放键"（`AvailabilityFlags`，每 tick 至多算一次，已开放的不再探测）；菜单栏同源。
- 引导：每次 HUD 刷新（4 Hz）给 `TutorialSession` 一帧：旗标、上次以来的事件（只留引导目录用到的事件种类，有上限）、信号（`tut_signals.ts`：近旁、战斗、生命、委托板、采集点、工站、黄昏、可存档、手柄；序章的报名与面试、坠落、关键抉择、出示证物、偷听档、商店、明确期限）、打开的窗口与新开的菜单。
- 模态引导卡、设置、存档、菜单、帮助与确认框是同一个"世界静止"判定（`worldHeld`），步进、故事层与帧调度都读它。
- 存档：每次存档读客户端段（引导、追踪、证物备注、已开放窗口，超限时先丢追踪的历史再丢备注）；读档时 `main.ts` 把槽位头的 `client` 交给新会话恢复；存档里的引导级别成为设置页显示的级别（存档没带有效级别时不动设置）。
- 无障碍：开机与每次设置或系统"减少动画"偏好变化时重新应用；手柄第一次按键解锁音频。
- 交互键：站在委托板、采集点、工站旁打开对应窗口（交谈与出口优先）；锁着的窗口按快捷键时给一行"还不能使用"。
- 队伍框右键打开该同伴的指令环。

**复查发现与处理**

新起子代理复查全部改动，报 8 条 BLOCKING 与若干 SHOULD-FIX、NIT（逐条列在本会话记录里）。处理：

| 发现 | 等级 | 处理 |
| --- | --- | --- |
| 25 个引导步骤没有信号产出方、3 个永不完成 | BLOCKING | 改用已有内核事件（死亡与复苏、传闻、光环、读条、拾取、装备、物品变化、同伴重伤、场景界面开关、等待）并按玩家过滤；会话补产出 31 个信号；目录声明每个信号的来源，检查对"无产出也没写明在等哪个包"的信号报错，对在等的列出（见第 3 节） |
| 模态引导卡让只用手柄的玩家卡住 | BLOCKING | 模态卡打开时手柄的确认、返回、Y、X 交给卡（`card_pad.ts`） |
| "看到即完成"的提示条一出现就被结束 | BLOCKING | 完成条件为"看到"时不提前结束提示条 |
| 色觉模式几乎不起作用 | BLOCKING | DOM 的关系色与品质色读模式令牌；画布的环、名字、预警、小地图点读 `palette_modes.ts`；`applyAccessibility` 返回需要重画时会话让世界重画。第 18.2 节的预警斜纹与品质点渲染器本来没有画，转渲染的后续包 |
| 已读快进、AI 角标长按、回想重播接不上 | BLOCKING | 三处都需要过场播放器（PK-M1-34/55 的文件）开入口：已读快进的默认键位先撤下，避免按了没反应；AI 角标的输入侧保留（面板加 `toggleAiMark` 后即生效）；回想页先只列已看过的过场；接线写成请求（第 3 节） |
| 同伴窗口泄露夜羽的头衔，职能显示英文枚举 | BLOCKING | 不显示头衔；名字、职能、职业都经文本键 |
| `party.joined` 未按 `companionId` 取名 | BLOCKING | 已改，`party.left` 同改 |
| 包目录与文档未写 | BLOCKING | 本目录三件与界面文档回写 |
| 窗口开放会收回；探测每 tick 全量重算；事件缓冲会丢一次性触发；客户端段全有或全无；恢复存档丢客户端段；读档改写引导设置的副作用；模态卡只停步进；系统"减少动画"变化不重新应用 | SHOULD-FIX | 均已修 |
| 委托实例标题未经 `textOf`；图鉴与迷宫首领的澱名泄露；证物页把遗物算进去；未记之事；兽伴自己的状态写成所在不明；生业名与正典不符；"澱补剂"等凡人叫法；首领列表剧透未达楼层 | SHOULD-FIX | 均已修 |
| 侧边卡抢焦点、挡住危险提示；开窗口吞掉卡片；读档后已看未完成的步骤不再完成；事件不分主人；简要级别卡片太长；文本写死按键名 | SHOULD-FIX | 均已修 |
| 文字大小重复缩放；减少闪烁把过场淡入淡出变成硬切；字幕盖住关键通知与过场选项；页内说明与实际不符；灵镜按钮无法用回车；队伍环用原始名字；长按改切换不覆盖开门 | SHOULD-FIX | 均已修 |
| 菜单栏超过 14 个按钮的"更多"折叠与新开放的小圆点；关键抉择以外的帮助搜索；名望档的数字显示 | SHOULD-FIX | 转 PK-M1-57（第 3 节） |
| 其余 NIT（死代码、重复常量、长度上限、样式） | NIT | 多数已修；余下见第 3 节 |

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 界面第 4.1、17.8 节 | 引导级别存在存档的客户端段 | 存在客户端段；游戏性页仍改同步设置 `gameplay.guidance`，读档时把存档的级别写回该设置，新游戏页照旧写入 | 设置页只有一个值可显示；这样"当前这局的级别"与页面一致 | 否 |
| 发行工程第 5.2 节 | 缩略图经存档后端（`thumbs/<slotId>.png`） | 难度进 `SaveSummary`；缩略图仍存页面本机存储 | 缩略图在槽位头写完之后的下一帧才截到，进头要么等一帧再写、要么另设文件种类，都是内核容器的改动 | 是（第 4 节） |
| 界面第 6.3.4、6.3.7 节 | 站到板前、走近采集点按交互键打开 | 交谈与出口优先，其次委托板、采集点、工站 | 委托板与接待员同处公会，交谈不能被板挡住 | 否 |
| 界面第 18.2 节 | 色觉模式替换令牌 | DOM 侧经 CSS 令牌；画布侧经调色板接口 | 画布不读 CSS 变量 | 否 |

## 3. 遗留与请求

**请求（交给其他包）**

| 序 | 事项 | 负责方 |
| --- | --- | --- |
| 1 | 过场播放器的三处入口：回想页的只读重播（`ctx.replayScene`）；对话面板的 `toggleAiMark()` 与连接名、模型名；已读快进的控制器接线（`ReadLog`、`skipReadAllowed`，补回 Ctrl 与 RT 的默认键位，`actions.ts` 的 `chordOf` 在按键本身是修饰键时不再叠修饰位） | PK-M1-34/55 |
| 2 | 引导在等的事件与信号（引导检查列出的等待项，按包）：人物卡打开、名望设置、信任变化、腐坏、违禁品、背包满、大模型错误与降级、屏幕外威胁、预警的出现与结束、威压的感受与离开、首次拿到精品等 | 见 `node tools/tutorial/check.ts` 的等待清单（每项写明负责包） |
| 3 | 公会：只读查询"玩家是否在某块委托板前"（客户端现按地点矩形加一格余量自判，可能与内核 `atBoard` 漂移） | PK-M1-47 |
| 4 | 生业：按配方的"持有"（含限定格）与精品几率的只读查询 | PK-M1-49 |
| 5 | 同伴：兽伴的喂食命令、饱足、深化与名伴字段；兽伴休养与泉畔的剩余天数 | PK-M1-15 |
| 6 | 魔物：凡人俗称字段 `nameMortal`（现按"澱"换"灰"的规则显示） | PK-M1-30 |
| 7 | 证物：审庭编号 E01 到 E36、取得方式、所证、保管链、真伪与防线标签的内核来源 | PK-M1-31/32 |
| 8 | 女神：梅尔卡往来账的只读查询（供奉记录现为非公开，弹层只显示本次会话的回执与账面的文字档） | PK-M1-20 |
| 9 | 兽潮：阶段的显示名进内容（现用界面键，新的夜晚要补键） | PK-M1-52 |
| 10 | 全量门加一步 `tutorial_check`：`node tools/tutorial/check.ts`（形同 `tools/gate/steps.ts` 的 `text_check`） | 门的负责方 |
| 11 | 桌面壳：窗口的 `webPreferences.autoplayPolicy: 'no-user-gesture-required'`（Chromium 不把手柄按键算作用户激活，网页版只能尽力） | 桌面壳负责方 |
| 12 | 存档容器：缩略图的文件种类（`thumbs/<slotId>`），之后缩略图从页面本机存储迁入 | 内核负责方 |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 菜单栏超过 14 个按钮的"更多"折叠、新开放窗口的小圆点；游戏性页的名望显示与"重置引导记录"按钮 | PK-M1-57 |
| 交互提示条对委托板、采集点、工站的提示；人物卡与 `charcard_opened` | PK-M1-57 |
| 第 18.2 节的地面预警斜纹与点纹、品质点；覆盖层名字、气泡、浮字随文字大小缩放 | 渲染的后续包 |
| 澱巢的状态条与"第一次进入澱巢"、女神试炼的规则块 | PK-M1-50 之后的客户端包 |
| 帮助的搜索与"关于"页；术语表的第二幕以后条目 | PK-M2 |
| 兽潮黎明结算的关闭状态进存档 | 本包后续小修 |

## 4. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 缩略图经存档后端 | 推荐：内核负责方给容器加缩略图文件种类后迁移；在此之前留在页面本机存储（PK-M1-22 的做法） | 不阻塞 |
| 2 | 凡人叫法的用词：迷宫形态（灰窝、浅地穴、地穴、大地穴）、状态（平静、躁动、漫出来了、正在塌落、正在清洗）、灰纹轻中重、"第二波：灰潮"、"祛灰茶饮"；图鉴与首领名按"澱"换"灰" | 推荐采用，待内容目录给出正式俗称后替换 | 不阻塞 |
| 3 | 名望五档的门槛（0、10、30、60、100）与布伦口吻的句子 | 目录第 8.3 节只要求按名望区间给句，未给门槛；推荐先用，平衡包复核 | 不阻塞 |
| 4 | 字幕样式的取值（四档字号 13、15、18、22 像素乘文字大小；底色 0、50、75、100%；底部或顶部）与各过场音效字幕的级别 | 推荐采用 | 不阻塞 |
| 5 | 引导卡按钮"此后不提示这类"7 个字，超过按钮上限 6 | 推荐保留设计文档原文，在文档第 19.2 节注明引导卡按钮例外 | 不阻塞 |
| 6 | `tut_a1_night` 在 18 时或黄昏信号触发；"此后不提示这类"的分类归属（门、存档与任务日志算操作类；从者、兽伴、迷宫算战斗类） | 推荐采用 | 不阻塞 |
| 7 | 兽潮面板不点名出手者（玛莎），黎明结算只给平民伤亡数 | 推荐采用（UX-3：只显示角色有理由知道的） | 不阻塞 |

## 5. 延后的测试

按用户要求，本包只跑了类型检查、文本检查、引导检查、内容校验，以及本包新增或改动的客户端测试文件与存档容器测试。以下延后，提交前由主会话跑一次：

| 测试 | 原因 |
| --- | --- |
| `npm test`（全量） | 用户要求测试放最后、不跑全量；本包改了存档头（加法），全量里其余读写存档的用例应一并确认 |
| `npm run playthrough` | 同上；本包不改内核行为，但引导与窗口接在会话上，通关矩阵是最终确认 |
| `tests/architecture.test.ts`、`tests/i18n_kernel_guard.test.ts` | 内核文件只改了存档头三处；守卫在全量里跑 |
| 截图检查、对比度在真机上的复核、仅手柄与仅键鼠的序章到第一幕通关（界面第 23.1、23.2 节） | 需要浏览器与人工；见 [verification_matrix.md](verification_matrix.md) 第 2 节 |
