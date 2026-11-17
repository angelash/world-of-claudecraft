# PK-M1-07 输入、手柄与改键：进度与汇报

> 只追加。入口见 [README.md](README.md)，验收见 [verification_matrix.md](verification_matrix.md)。

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施 | 动作层与手柄状态机、手柄全表与改键核心、24 格快捷栏、软锁定、环形菜单、焦点导航、虚拟光标、按键图示与 `{key:}`、浮动键盘、镜头绑定、设置字段、会话接线、验收测试 | 未提交 | 见 [verification_matrix.md](verification_matrix.md) | 审查 |
| 2026-11-17 | 审查与修复 | 新起会话的覆盖审查一次（3 BLOCKING、11 SHOULD-FIX）；全部 BLOCKING 与 SHOULD-FIX 已修，补键盘回放、`PlayerInput` 单测与共用测试驱动；浏览器核对；界面第 16 节回写 | 未提交 | 输入相关 14 个测试文件 287 项通过；默认套件只剩 `art_manifest` 基线失败 | 主会话提交，改计划状态 |

## 2. 汇报

### 2026-11-17 实施、审查与修复

**改动文件**

| 方面 | 文件 | 动作 | 说明 |
| --- | --- | --- | --- |
| 动作层 | `src/client/input/actions.ts` | 新增 | 情境叠放 `contextStack`、对话叠在行走上时的动作过滤 `actionLive`、键鼠和弦 `chordOf`、`actionsForChord` |
| 动作层 | `src/client/input/input_hub.ts` | 新增 | `InputHub`：键鼠和弦与手柄快照变成动作；设备切换；手柄单按、长按、组合、组键与锁定；环、浮动键盘、虚拟光标；`GameSink` 与 `UiSink` 接缝 |
| 动作层 | `src/client/input/gamepad.ts`、`device.ts`、`input_settings.ts` | 新增 | 读手柄（死区、8 向、长按、连发、手势）；设备与字形家族；输入选项与默认值 |
| 绑定 | `src/client/input/contexts.ts` | 修改 | 键鼠表：第二行快捷栏（Shift+1 到 Shift+=）、选中自己与队友（Alt+1 到 Alt+6）、窗口方向键与上一页签、战场镜头平移与调出编组；推进移到对话情境；战场的英雄技能行改为亲身模式用快捷栏 |
| 绑定 | `src/client/input/pad_bindings.ts` | 新增 | 手柄全表（十个情境）、手柄独有动作清单、锁定、A/B 互换、组键校验、冲突、改键、恢复默认、覆盖缺口检查 |
| 辅助 | `src/client/input/soft_target.ts`、`radial.ts`、`focus_nav.ts`、`virtual_cursor.ts`、`osk.ts`、`glyphs.ts` | 新增 | 软锁定、环形菜单、焦点导航、虚拟光标、浮动键盘、按键图示与 `{key:}` 解析 |
| DOM 层 | `src/client/input/input_controller.ts` | 修改 | 只产出键鼠和弦交给动作层；指点仍直达会话；输入框里只放行 Esc；窗口外的空格与回车不按到 HUD 按钮 |
| DOM 层 | `src/client/input/input_layer.ts`、`gamepad_poller.ts`、`menu_pad.ts` | 新增 | 会话的输入层（轮询、焦点、光标点击、隐藏界面、全屏、覆盖层画手、`{key:}` 安装）；读 Gamepad API；标题屏手柄 |
| HUD | `src/client/hud/hotbar.ts` | 修改 | 24 格，键鼠两行或手柄三组，按键字形，按住组高亮 |
| HUD | `src/client/hud/hotbar_model.ts`、`radial_menu.ts`、`floating_keyboard.ts`、`virtual_cursor.ts` | 新增 | 快捷栏布局纯核心与三个覆盖层画手 |
| 样式 | `src/client/client.css` | 修改 | 快捷栏改竖排；末尾"Input"一节（行与组、焦点框、环、键盘、光标、隐藏界面） |
| 游戏一侧 | `src/client/app/player_input.ts` | 修改（重写） | 实现 `GameSink`：按情境的动作、软锁定、选项光标、Esc、B、Start、三种环、自由输入 |
| 接线 | `src/client/app/session.ts` | 修改 | `InputLayer` 取代 `InputController`；每帧轮询；`orbitView`、`stepSpeed`、`setTimeScale`（环开降速）；软目标进悬停环与目标框（标"候选"）；快捷栏布局；`SessionPrefs.sync` |
| 接线 | `src/client/app/main.ts` | 修改 | 默认 `{key:}` 解析、标题屏手柄 |
| 设置 | `src/client/app/settings_schema.ts` | 修改 | 同步份加 `padKeys` 与 `input`，逐字段校验；版本号不变（第 13.10 节：新字段旧版本当未知字段保留） |
| 共享 | `src/shared_ui/i18n.ts` | 修改（越界，小改） | `{key:<动作>}` 占位与 `setKeyText` |
| 共享 | `src/client/adapters/combat.ts`、`src/client/view/adapters.ts` | 修改（越界，一行） | `HOTBAR_SLOTS` 9 改 24；注释 |
| 文本 | `locales/zh-Hans/ui.json`、`src/core/text_keys.generated.ts` | 修改、重新生成 | 新增 `ui.common.key.*`、`ui.common.pad.*`（五个字形家族）、`ui.hud.wheel.*`、`ui.hud.target.candidate`、`ui.ovl.cursor.label`、`ui.pop.osk.*`；交互提示、剧场与对话提示、帮助、镜头提示、摆放、战场与大陆提示里的键名换成 `{key:}` |
| 测试 | `tests/client_gamepad_playthrough.test.ts`、`client_input_bindings.test.ts`、`client_input_hub.test.ts`、`client_input_cores.test.ts`、`client_player_input.test.ts`、`tests/input_harness.ts` | 新增 | 见验收矩阵 |
| 测试 | `tests/client_purity.test.ts`、`settings_store.test.ts`、`desktop_settings.test.ts`、`client_adapters.test.ts` | 修改 | 新纯核心入列与 DOM 检查只看代码；设置夹具加新字段；设置模式的依赖清单；适配器测试装默认 `{key:}` |
| 文档 | `docs/40_design/ux_and_onboarding.md` 第 16 节、本目录 | 修改、新增 | 第 16.1 节情境叠放与设备切换、16.2 战场行、16.3 交叉快捷栏顺序与窗口、全局、标题屏、16.4、16.5、16.6、新增 16.8 |

**验收逐条结果**：见 [verification_matrix.md](verification_matrix.md) 第 1 节，全部 PASS；构建与全量门 VERIFY（由主会话跑）。

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 界面第 16.2 节 | "推进对白与散句：空格、回车"列在行走与战斗表 | 推进归对话情境；对话框或散句显示时对话情境（只含推进、选项、自由输入）叠在行走之上 | 手柄 A 同时是交互与推进，同一情境里会冲突；叠放后两种设备都不冲突（已回写第 16.1 节） | 否 |
| 界面第 16.2 节战场指挥 | 英雄技能 1 到 0 与调出编组 1 到 4 同在战场情境 | 战场情境（指挥模式）只留调出编组；英雄技能在亲身模式用快捷栏 | 原表在同一情境内冲突（已回写） | 否 |
| 界面第 1.3 节 | Esc（手柄 B）最后打开菜单 | 手柄 B 只逐层关闭，菜单由 Start 打开 | 第 16.3 节把 Start 定为菜单、B 定为取消 | 是（README 第 11 节第 1 条） |
| 界面第 16.3 节 | LT 组配"十字键与 A、B、X、Y"，未定顺序 | 十字键左、上、右、下，再 X、Y、B、A（两组各顺时针从左起，交叉快捷栏惯例） | 需要一个确定顺序（已回写） | 否 |
| 界面第 16.3 节 | 全局系统键（隐藏界面、全屏、调试）、快速存读档无手柄键 | View+Y、View+L3、View+R3；帮助与快速存读档经菜单 | 第 23.2 节要求每个动作在手柄上有绑定（已回写） | 否 |
| 界面第 16.5 节 | "松开摇杆或按键即选定，推回中心即取消" | 推着摇杆时松开开环的键选定，摇杆回中时松开即取消；A 也可选定 | 原句两处互相矛盾（已回写） | 否 |
| 界面第 16.5 节 | 随身物环是玩家指定的 8 个 | 指定之前取背包里可用的消耗品，按品质前 8 个 | 还没有指定随身物的存储 | 否（遗留） |
| 界面第 16.5 节 | 队伍指令环 8 个扇区 | 只放队伍系统现有的四个指令（跟随、协助、待命、原地） | 其余指令系统还没有 | 否（遗留） |
| 界面第 18.5 节 | 每一类长按都可改成"按一下开、再按一下关" | 环：长按后保持打开，A 选、B 取消；扳机组：单按锁定、再按解锁 | 单按已有别的动作（View 单按是地图、LB 单按是上一个敌人），长按仍用来区分 | 否 |
| 战斗设计第 2.3 节 | 手柄 12 格快捷栏、Tab 12 格、F1 到 F5 选队友、软锁定 12 格 | 按界面第 16 节：24 格、Tab 20 米、Alt+1 到 Alt+6、软锁定 25 米 | 包行明写 24 格，界面第 16 节是后定的操作规范 | 是（README 第 11 节第 2 条） |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `src/shared_ui/i18n.ts` | `{key:}` 占位要在 `t()` 里解析（界面第 20.3 节），加 `setKeyText` 与一个匹配分支 | 共享界面层（PK-M0-15 建） | 已改并在此告知 |
| `src/client/adapters/combat.ts`、`src/client/view/adapters.ts` | 快捷栏从 9 格扩到 24 格（界面第 5.2 节） | 客户端适配器 | 已改并在此告知 |
| `src/client/app/session.ts`、`src/client/app/main.ts` | 输入层接线 | 客户端外壳 | 已改并在此告知 |
| `docs/40_design/ux_and_onboarding.md` 第 2.2 节 `ui_hud_hotbar` 与 `ui_hud_wheel` 的"现有"列、第 24.1 节键位行 | 现状已变（24 格、环形菜单、手柄与改键核心） | 文档代理或主会话 | 请求回写待落地 |
| `docs/40_design/systems/combat_and_classes.md` 第 2.3 节 | 与界面第 16 节不一致（见上表） | 文档代理，待用户决定 | 请求回写待落地 |
| `src/client/windows/window_registry.ts` | 无需登记（本包没有新窗口） | | 未改 |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| `ui_set_controls` 操作与改键页：按情境的键鼠与手柄绑定列表、录键、冲突时"替换或取消"、手柄选项、长按时长、恢复默认（全部与本情境）、导出与导入；纯核心已有（`rebind`、`rebindPad`、`chordConflicts`、`padChordConflicts`、`resetKeymap`、`resetPadKeymap`、`chordText`、`padBindingText`、`input` 字段） | PK-M1-22（设置外壳） |
| 一次画好就不再刷新的字符串在换设备后仍是旧字形：对话框的"空格 继续"与输入框占位、帮助窗口的各行、剧场提示在同一节点内 | PK-M1-22（对话两种版式、剧场播放器、设置与帮助外壳时按设备重画） |
| 帮助窗口的指点手势行（"鼠标左键点地面"）对手柄玩家不适用，帮助要按设备分组 | PK-M1-23（帮助与术语表，界面第 17.7 节） |
| 手柄震动（第 16.7 节）：首领重击、低血心跳、开门、威压；"减少闪烁与震动"开时默认关；`input.rumble` 已存 | PK-M1-22 或音频反馈相关包（新开小包也可） |
| Steam 输入的动作集、官方字形、Steam 浮动键盘、Steam 报告的虚拟手柄类型 | PK-M2-02（Steam 集成，RE-17） |
| 回廊、领主视图与摆放、战场、大陆、行进、审庭的输入接线（表已建模，`PlayerInput.action` 对这些情境返回不处理）；摆放与战场的键盘光标（第 18.5 节）；行动环与编组环的扇区 | 各自建模式的包（第二幕起） |
| 第 16.3 节尚无系统承接的行：Y 次要交互、长按 X 人物卡、长按 RB 友方轮换、十字键上追踪与长按看地图、长按 R3 设焦点、LB+RB 坐骑、长按 B 与长按 Esc 跳过过场、对话的回看、自动推进与隐藏文字 | PK-M1-22（焦点框、追踪、过场播放器、对话版式）、PK-M1-57（`ui_pop_charcard`）、坐骑所在的包 |
| 玩家指定的随身物（随身物环的内容） | 背包与随身物相关包 |
| 传说难度下开环不降速（还没有难度系统） | PK-M1-22（新游戏的难度） |
| 网页版 Ctrl+Tab 与 Ctrl+Shift+Tab 被浏览器占用（桌面版无此问题）；需要时给窗口页签换一组网页可用的备键 | PK-M1-22 |
| 旧的无情境键位表 `src/client/input/keymap.ts` 的 `DEFAULT_KEYMAP` 只剩设置里旧字段 `keys` 在用；退役需同步份升到第 2 版并写迁移 | 设置相关的下一个包 |
| 仅键鼠与仅手柄从序章玩到第一幕结束（界面第 23.1 节 M1 行），用合成事件走第一幕全程 | PK-M1-08（端到端与截图回归，RE-20） |
| 真手柄与 Steam Deck 上的字形与按键位置 | PK-M1-05（参考机）时由用户核对 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 窗口打开时键鼠的方向键与 Tab 归窗口 | 开着地图窗口时方向键不再走路、Tab 不再选敌（WASD 照常） | 这是第 1.3 节"窗口接管方向导航"的规定；可用性测试（第 23.3 节）若有反馈，再加"窗口不抢方向键"的游戏性设置 |
| 手柄开窗口环在战斗中降速，键鼠开窗口不降速 | 手柄玩家在战斗中开窗口时多一点时间 | 第 16.5 节的规定；只在亲身战斗中、开环期间 |

**需用户决定**：见 [README.md](README.md) 第 11 节（两条，均不阻塞）。
