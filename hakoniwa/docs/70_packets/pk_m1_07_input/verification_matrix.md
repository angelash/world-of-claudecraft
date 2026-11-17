# PK-M1-07 输入、手柄与改键：验收与证据

> 入口见 [README.md](README.md)；进度与汇报见 [progress.md](progress.md)。状态只用 PASS、FAIL、VERIFY、N/A。

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS：包行两条验收与界面第 23.2 节键位检查都有自动证据；遗留（操作与改键页的画面、震动、Steam 输入、第二幕起的模式接线）见 [progress.md](progress.md) |
| 末次代码或内容变更 | 未提交；改动文件见 [progress.md](progress.md) 第 2 节 |
| 完整实跑 | 2026-11-17，共享工作区（含其他并行包的未提交改动） |
| 审查 | 新起会话的覆盖审查一次：3 条 BLOCKING、11 条 SHOULD-FIX、17 条 NIT，处理见第 3 节 |
| 遗留 | 见 [progress.md](progress.md) 的遗留表 |

## 1. 验收条目

### 1.1 包行验收

| 序 | 验收 | 命令或评审 | 结果 | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 模拟手柄从序章走到第一场战斗 | `npx vitest run --config vitest.config.ts tests/client_gamepad_playthrough.test.ts` | 通过。真实引擎（全部系统、无模型）、真实适配器与事件路由、真实 `PlayerInput`；合成的 Gamepad API 快照经 `InputHub` 驱动：A 推进、十字键移动选项光标加 A 选择（与自动玩家发行路线同选）、序章 P6 用浮动键盘输入两个汉字（`player.name` 等于输入）、View 开地图窗口后左摇杆走焦点、B 关窗、左摇杆走向魔物、软锁定选中它、A 攻击并锁定、LT 加十字键左施放快捷栏第 1 格；断言玩家对魔物造成伤害、软目标就是被打的魔物、`combat.attack` 与 `combat.cast` 都由输入层发出、作弊命令为 0、设备始终是手柄 | `tests/client_gamepad_playthrough.test.ts`、`tests/input_harness.ts` | PASS |
| 2 | 界面第 23.2 节键位检查：默认键位在同一情境内（与全局之间）无冲突 | `npx vitest run --config vitest.config.ts tests/client_input_bindings.test.ts tests/client_keymap_contexts.test.ts` | 键鼠表 `keymapConflicts` 为空；手柄表 `padKeymapConflicts` 为空，A/B 互换后仍为空；对话情境叠在行走之上时不遮住行走、窗口与缩放（`tests/client_input_hub.test.ts` 的 "never lets the dialogue table shadow"） | `src/client/input/contexts.ts`、`src/client/input/pad_bindings.ts` | PASS |
| 3 | 第 23.2 节：每个动作在键鼠与手柄上各至少有一个绑定 | 同上 | 每个键鼠动作都有手柄绑定（按键、摇杆手势、环、导航或快捷栏格），手柄独有的动作都在 `PAD_ONLY_ACTIONS` 里且各有绑定；`padCoverageGaps()` 为空，人为缺口能被报出 | `pad_bindings.ts` 的 `padCoverageGaps` | PASS |
| 4 | 第 23.2 节：扫描文本里写死的键名，必须用 `{key:}` | 同上 | 全部字符串表扫描键名（Esc、Tab、F 键、空格、回车、数字键等）、界面表的单个拉丁大写字母、鼠标键名（指点手势除外）：0 处；扫描本身对样例命中（防空测）；表里每个 `{key:}` 引用在键鼠与手柄上都能渲染 | `tests/client_input_bindings.test.ts` 的 "no fixed key names" 组 | PASS |
| 5 | 第 23.2 节"输入回放"：两种设备都全程可玩（本包范围：到第一场战斗） | `tests/client_gamepad_playthrough.test.ts` 的 "plays the same stretch with the keyboard alone" | 通过：空格、数字键、WASD、I 开背包（方向键走焦点、W 照常行走）、Esc 关窗、Tab 选敌、E 攻击、1 施放；名字经剧场面板自己的提交路径 | 同上 | PASS |

### 1.2 范围条目的单测

| 序 | 条目 | 命令 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 动作层与手柄状态机（情境叠放、下落、按住移动、设备切换、单按与长按、组合、组键与锁定、环、浮动键盘、虚拟光标、右摇杆、窗口独占按键、对话独占摇杆、暂停不连发、开局按住的键不算、A/B 互换进覆盖层） | `npx vitest run --config vitest.config.ts tests/client_input_hub.test.ts` | 25 项通过 | PASS |
| 2 | 纯核心（读手柄、死区、8 向、手势、字形家族、键帽与手柄字样、`{key:}`、软锁定、环、焦点导航、虚拟光标、浮动键盘、快捷栏布局） | `npx vitest run --config vitest.config.ts tests/client_input_cores.test.ts` | 19 项通过 | PASS |
| 3 | 游戏一侧（Esc、B、Start 的关闭与菜单、R3 锁定与解除、40 米脱锁、键鼠软锁定开关、散句占空格与 A 而键盘 A 照常行走、三种环、战斗中开环降速 0.3 倍、"用默认"提交空名字） | `npx vitest run --config vitest.config.ts tests/client_player_input.test.ts` | 9 项通过 | PASS |
| 4 | 改键与设置（手柄锁定、固定项、冲突、组键整组搬家与校验、恢复默认、A/B 互换、`padKeys` 与 `input` 的逐字段校验） | `npx vitest run --config vitest.config.ts tests/client_input_bindings.test.ts tests/settings_store.test.ts tests/desktop_settings.test.ts` | 通过（`client_input_bindings` 18 项） | PASS |
| 5 | 纯核心守卫：新增 15 个纯模块列入 `CLIENT_PURE_CORES` | `npx vitest run --config vitest.config.ts tests/client_purity.test.ts` | 通过；DOM 检查不再把字符串 `'window'`（情境名）与同名对象键当成访问页面，`globalThis.window` 仍会被抓 | PASS |

### 1.3 浏览器核对

| 序 | 核对 | 方法 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 9 | 画手与接线在真实页面里工作 | 开发服务（预览工具，配置 `hakoniwa`，端口 5180）；在页面里把 `navigator.getGamepads` 换成替身手柄并逐帧改按键与摇杆；核对后停掉服务 | 标题屏 A 把焦点落到"新的旅程"并显示焦点框；按住 A 开始新游戏，开局后第一个选项没有被误选；十字键下把选项光标移到第 2 项（金色框）；P6 打开浮动键盘，键格、计数、提示正确，"用默认"让名字成为"无名氏"；第一幕手柄快捷栏三组（LT 组可见），按住 LT 该组高亮；长按 View 打开窗口环（只列已开放的窗口），右推高亮"任务"，松开打开任务窗口；B 关窗；Start 打开菜单、再按关闭；走近魔物后目标框显示"候选"；控制台无错误 | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 两个工程退出码 0 | PASS |
| 默认套件 | `npx vitest run --config vitest.config.ts` | 是 | 末次实跑：125 个文件中 123 个通过；2411 项通过、2 项跳过、3 项失败，都不是本包引起（见第 4 节）：`tests/art_manifest.test.ts` 的基线，`tests/architecture.test.ts` 两项指向并行任务包正在改的 `src/systems/quests/`、`src/content/packs/quests.ts`；同一套件在这些改动落地之前的一次实跑只有 `art_manifest` 失败 | PASS |
| 文本检查 | `node tools/i18n/check.ts`；`node tools/i18n/gen_keys.ts --check` | 是 | `0 finding(s)`；键类型为最新 | PASS |
| 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 是 | 通过 | PASS |
| 改动文件格式 | `npm run format -- <改动的 TS、JSON 与 CSS>` | 是 | 无剩余问题 | PASS |
| 无模型通关 | `npm run playthrough` | 否（不改内核、系统与内容） | | N/A |
| 构建与全量门 | `npm run build`、`npm run gate` | 否（并行时由主会话统一跑） | | VERIFY |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 新起会话的覆盖审查（只读） | 一次贡献结束 | FAIL（修复前） | 3 | 11 | 全部 BLOCKING 已修：B1 按住 View+Start 每帧暂停（`releaseAll` 不再重置读手柄，仍按着的键记为已用）；B2 散句或对话时键盘 A 被自动推进挡住不能左移、H 与 PageUp 也被挡住（对话情境叠在行走之上时只保留推进、选项与自由输入）；B3 仅键盘用不了窗口（窗口打开即居上接管方向导航，焦点落到第一个控件）。SHOULD-FIX：S1 窗口打开时手柄键漏到行走（手柄只剩窗口与全局，按键的长按与等待由首个绑定它的情境决定）已修；S2 对话时左摇杆既移光标又行走、数字键落到快捷栏（对话中手柄不行走，交谈时数字键不落下）已修；S3 Start 改为菜单本身已修；S4 A/B 互换进覆盖层与标题屏已修；S5 空格与回车不再按到 HUD 按钮、小键盘回车等同回车已修；S6 `{key:}` 不再在 t() 里读实时情境（用上一帧的情境，加重入保护）、`surface()` 不再渲染文字已修；S7 摆放结束后光标消失已修；S8 鼠标键名进扫描、战场与大陆的"左键、右键"改为 `{key:}` 已修；S9 长按改切换：环保持打开、扳机组单按锁定已修；S10 补键盘回放、`PlayerInput` 单测、窗口与散句路径已修；S11 Tab 与 Ctrl+Tab 用同一张列表已修。NIT 已修 6 条（候选标注不覆盖副标题、死代码、陈旧注释、`globalThis.window` 仍被抓、组键不能落到十字键与面键且不能清空、`resetPadKeymap`、`{a}/{b}` 分隔、指针切换加 250 毫秒窗口），其余转遗留 | 本会话审查回报；修复后同一组测试全绿 |

修复后的复核：第 1、2 节的命令在末次改动之后重跑，结果如上。

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npx vitest run --config vitest.config.ts` | `tests/art_manifest.test.ts` 的 "manifest.json and tools.json are valid and match the files under art/ and audio/ both ways" | `assets/art/` 里有用户未登记的图片（开工前已知的基线），本包不碰 `assets/` | 用户的美术导入 |
| `npx vitest run --config vitest.config.ts` | `tests/architecture.test.ts` 的 "content/ has no DOM access" 与 "systems/ has no DOM access" | 报出的文件是 `src/systems/quests/progress.ts`、`src/systems/quests/types.ts`、`src/content/packs/quests.ts`，都是并行包的在制改动，本包不碰 `src/systems/` 与 `src/content/` | 任务系统的并行包（PK-M1-58 等） |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 真手柄（Xbox、PlayStation、Switch、Steam Deck）的字形与按键位置 | 实体手柄与 Steam Deck | 用户，M1 参考机核对（PK-M1-05 基准场景与参考机） |
| 仅键鼠与仅手柄从序章玩到第一幕结束（界面第 23.1 节 M1 行） | 本包只到第一场战斗；第一幕后段的窗口（交易、千门回廊）用焦点导航可达但未逐个走通 | PK-M1-08 端到端与截图回归（RE-20）用合成键鼠与手柄事件走第一幕全程 |
| `npm run build`、`npm run gate` | 并行包同时改动，构建与全量门由主会话统一跑 | 主会话提交前 |
