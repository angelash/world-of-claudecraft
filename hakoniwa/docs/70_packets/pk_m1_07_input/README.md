# PK-M1-07 输入、手柄与改键（别名：RE-16）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-07` 输入、手柄与改键 |
| 状态 | 进行中（实施与验证已完成，建议主会话提交后改为"已完成"，见 [verification_matrix.md](verification_matrix.md)） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-07` |
| 形态 | 大包（5 代理人日）；按本目录约定只写入口、验收与进度三件 |
| 工作流 | 客户端 |
| 量级 | 5 代理人日，0.5 用户人日 |
| 依赖 | PK-M0-15（已完成：按情境的键位表与改键纯核心 `src/client/input/contexts.ts`） |
| 别名 | RE-16（[release_engineering.md](../../50_tech/release_engineering.md) 第 4.4 节）；界面第 16 节 |
| 立项日期 | 2026-11-17 |

## 1. 目标

键鼠与手柄都经同一个动作层驱动游戏：按情境叠放的绑定、24 格快捷栏、软锁定、环形菜单、焦点导航、虚拟光标、按键图示、浮动键盘与手柄镜头都就位，
序章与第一幕只用键盘或只用手柄都能玩到第一场战斗；界面第 23.2 节的键位检查通过（决策 D-096：序章与第一幕优先）。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 动作层：情境叠放与动作下落、键鼠和弦解析、手柄按键状态机（单按、长按、组合、组键）、设备切换 | `src/client/input/actions.ts`、`src/client/input/input_hub.ts`、`src/client/input/device.ts`、`src/client/input/input_controller.ts` | 界面第 1.3、16.1 节；发行工程第 4.4 节 |
| 2 | 按情境绑定：键鼠表补齐（第二行快捷栏、选中自己与队友、窗口方向键与上一页签、战场镜头平移与调出编组）；手柄全表与改键核心（锁定、A/B 互换、组键整组搬家、冲突、恢复默认） | `src/client/input/contexts.ts`、`src/client/input/pad_bindings.ts` | 界面第 16.2、16.3、16.6 节 |
| 3 | 24 格快捷栏：键鼠两行各 12，手柄三组各 8，按键字形 | `src/client/hud/hotbar_model.ts`、`src/client/hud/hotbar.ts`、`src/client/adapters/combat.ts` 的 `HOTBAR_SLOTS` | 界面第 5.2 节 `ui_hud_hotbar` |
| 4 | 软锁定：锥角与距离、攻击者优先、40 米脱锁、R3 锁定与解除、施法时锁定、轮换 | `src/client/input/soft_target.ts`、`src/client/app/player_input.ts` | 界面第 16.4 节；D-072 |
| 5 | 环形菜单：窗口环、随身物环、队伍指令环（行动环与编组环建模，第二幕起接） | `src/client/input/radial.ts`、`src/client/hud/radial_menu.ts`、`player_input.ts` 的 `ringSectors`、`ringChoose`、`ringOpen` | 界面第 16.5 节 `ui_hud_wheel` |
| 6 | 焦点导航：窗口、剧场选项与对话选项、标题屏 | `src/client/input/focus_nav.ts`、`src/client/input/input_layer.ts`、`src/client/input/menu_pad.ts` | 界面第 1.3、16.3、18.5 节 |
| 7 | 虚拟光标 | `src/client/input/virtual_cursor.ts`、`src/client/hud/virtual_cursor.ts` | 发行工程第 4.4 节 |
| 8 | 按键图示与 `{key:}` 占位 | `src/client/input/glyphs.ts`、`src/shared_ui/i18n.ts` 的 `setKeyText`、`locales/zh-Hans/ui.json` 的 `ui.common.key.*`、`ui.common.pad.*` | 界面第 16.6 节第 6 条、第 20.3 节 |
| 9 | 浮动键盘（序章 P6 报名字） | `src/client/input/osk.ts`、`src/client/hud/floating_keyboard.ts` | 发行工程第 4.4、4.8 节 |
| 10 | 手柄镜头绑定：右摇杆转动俯仰，L3 加右摇杆缩放与转方位，L3 街景，长按 Y 复位 | `pad_bindings.ts`、`input_hub.ts` 的 `analog` | 界面第 16.3 节；美术方案第 2.3 节 |
| 11 | 设置：手柄改键 `padKeys` 与输入选项 `input`（死区、灵敏度、俯仰反向、软锁定、锥角、施法锁定、震动强度、A/B 互换、字形家族、长按时长） | `src/client/app/settings_schema.ts`、`src/client/input/input_settings.ts` | 界面第 4.4 节；发行工程第 13.10 节 |
| 12 | 会话接线 | `src/client/app/session.ts`（`InputLayer`、轮询、环开时降速、软目标显示）、`src/client/app/main.ts`（标题屏手柄与默认键字） | 发行工程第 6.3 节 |
| 13 | 文档回写 | 界面第 16 节（16.1 情境叠放、16.2 战场行、16.3 交叉快捷栏顺序与 Start、B、16.4、16.5、16.6、新增 16.8） | 本包 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 设置里的 `ui_set_controls` 操作与改键页（画面）；改键与选项的纯核心已就位 | PK-M1-22（设置外壳） |
| 2 | 手柄震动（第 16.7 节）的触发；强度设置已在 `input` 里 | 见 [progress.md](progress.md) 遗留 |
| 3 | Steam 输入的动作集与官方字形、Steam 浮动键盘 | RE-17（Steam 集成） |
| 4 | 回廊、领主视图与摆放、战场、大陆、行进、审庭的输入接线（表已建模） | 第二幕起建这些模式的包 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、目录分工 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 纯核心加薄画手；`tests/client_purity.test.ts` 的 `CLIENT_PURE_CORES` |
| [ux_and_onboarding.md](../../40_design/ux_and_onboarding.md) 第 1.3、4.4、5.2、16、18.5、20.3、23.2 节 | 本包实现的规则与验收 |
| [release_engineering.md](../../50_tech/release_engineering.md) 第 4.4 节 | RE-16 |
| `src/client/input/`、`src/client/app/player_input.ts` | 动作层与游戏一侧 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 纯核心 | 输入规则全部是纯模块（无 DOM、无真随机与墙钟），DOM 只在 `input_controller.ts`、`input_layer.ts`、`gamepad_poller.ts`、`menu_pad.ts` 与 HUD 画手里 | `tests/client_purity.test.ts` |
| 游戏性中立 | 软锁定只在 Tab 同一过滤（`enemiesNear`）的目标里挑；手柄移动仍是 8 向意图，与键盘一致 | `tests/client_input_cores.test.ts`、`tests/client_player_input.test.ts` |
| 文本 | 界面文字全部是 `ui.*` 键；字符串表里不写死按键名 | `tests/i18n_ui_guard.test.ts`、`tests/client_input_bindings.test.ts` |
| 设置 | 新字段逐字段校验；同步份不升版本号（旧版本把新字段当未知字段保留，第 13.10 节） | `tests/settings_store.test.ts`、`tests/desktop_settings.test.ts`、`tests/client_input_bindings.test.ts` |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/client/input/{actions,device,focus_nav,gamepad,gamepad_poller,glyphs,input_hub,input_layer,input_settings,menu_pad,osk,pad_bindings,radial,soft_target,virtual_cursor}.ts`、`src/client/hud/{hotbar_model,radial_menu,floating_keyboard,virtual_cursor}.ts`、`tests/{client_gamepad_playthrough,client_input_bindings,client_input_hub,client_input_cores,client_player_input}.test.ts`、`tests/input_harness.ts`、本目录 |
| 本包修改 | `src/client/input/{contexts,input_controller}.ts`、`src/client/app/{player_input,session,settings_schema,main}.ts`、`src/client/hud/hotbar.ts`、`src/client/client.css`（末尾的输入一节与快捷栏竖排）、`src/client/adapters/combat.ts`（`HOTBAR_SLOTS`）、`src/client/view/adapters.ts`（注释）、`src/shared_ui/i18n.ts`（`{key:}`）、`locales/zh-Hans/ui.json`、`src/core/text_keys.generated.ts`（重新生成）、`tests/{client_adapters,client_purity,desktop_settings,settings_store}.test.ts`、`docs/40_design/ux_and_onboarding.md` 第 16 节 |
| 不得修改 | 其他并行包的文件：`src/systems/doors/`、`src/systems/world/`、`data/world/`、`src/systems/records/`、`src/game/registry.ts`、`data/quests/`、`data/scenes/`；`tools/assets/` 的他人改动 |

## 7. 停止条件

dev_process 第 3.6 节全部适用；本包未触发。

## 8. 验证命令

在 `hakoniwa/` 下运行：

```
npx vitest run --config vitest.config.ts tests/client_gamepad_playthrough.test.ts tests/client_input_bindings.test.ts tests/client_input_hub.test.ts tests/client_input_cores.test.ts tests/client_player_input.test.ts
npx vitest run --config vitest.config.ts tests/client_keymap_contexts.test.ts tests/client_purity.test.ts tests/client_window_catalogue.test.ts tests/settings_store.test.ts tests/desktop_settings.test.ts tests/i18n_ui_guard.test.ts tests/i18n_ui_strings.test.ts tests/client_adapters.test.ts
npm run typecheck
node tools/i18n/check.ts
node tools/i18n/gen_keys.ts --check
npm test
```

浏览器核对：开发服务（`.claude/launch.json` 的 `hakoniwa`，端口 5180），在页面里用替身的 `navigator.getGamepads` 模拟手柄（见 [verification_matrix.md](verification_matrix.md) 第 1 节第 9 行）。

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 新起会话的覆盖审查 | 必派 | 一次贡献结束；结论见 [verification_matrix.md](verification_matrix.md) 第 3 节 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、字符串表、测试、界面第 16 节回写、本目录 | 主会话 | 抽看 [verification_matrix.md](verification_matrix.md)；上面的验证命令全绿（`art_manifest` 的基线失败除外） |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 手柄 B 在什么都没有时是否打开菜单：第 1.3 节写"Esc（手柄 B）……目标也没有时打开菜单"，第 16.3 节写"B 取消、Start 菜单" | 推荐本包做法：B 只逐层关闭，Start 打开菜单；把第 1.3 节改成"Esc 最后打开菜单，手柄由 Start 打开" | 不阻塞 |
| 2 | 战斗设计第 2.3 节（12 格手柄快捷栏、Tab 12 格、F1 到 F5 选队友、软锁定 12 格）与界面第 16 节（24 格、Alt+1 到 Alt+6、25 米）不一致 | 推荐以界面第 16 节为准（本包做法），改战斗设计第 2.3 节 | 不阻塞 |
