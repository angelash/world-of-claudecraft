# PK-M1-23 第一幕窗口、引导与无障碍：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（第 1 节各条通过；引导步骤里等其他包事件的项、过场播放器的三处入口与延后的全量测试见第 2、3 节） |
| 末次代码或内容变更 | 未提交；改动文件清单见 [progress.md](progress.md) 第 2 节 |
| 完整实跑 | 2026-11-19；与他包并行的同一工作区（未提交） |
| 审查 | 新起子代理的覆盖性复查一轮，发现按原作者退回修复，整合层由本会话修复（[progress.md](progress.md) 第 2 节） |
| 遗留 | [progress.md](progress.md) 第 3 节 |

## 1. 验收条目

计划包行验收栏："界面第 23.1 节 M1 行；引导检查与文本检查通过"。第 23.1 节 M1 行与本包相关的部分逐条列在下表；其余部分（仅键鼠与仅手柄的整段通关、大模型页、第 22 节预算、可用性测试）不在本包，见第 2 节。

| 序 | 验收（来源） | 证据（命令与结果） | 状态 |
| --- | --- | --- | --- |
| 1 | 标为 M1 的本包 `ui_` 编号实现：九个窗口、`ui_hud_dungeon`、`ui_hud_coin`、`ui_pop_offer`、`ui_pop_tutorial`、`ui_set_access`（23.1） | 窗口登记 27 个已建、4 个计划（`tests/client_window_catalogue.test.ts`）；各窗口的纯核心单测（`client_records_windows`、`client_field_windows`、`client_hud_extras`、`client_access`、`client_tutorial`）；界面文档第 2 节"现有"一列已回写 | PASS |
| 2 | 空与错误状态逐一核对（23.1、6.1） | 每个新窗口的 `ui.win.<id>.empty_state`、`error_state`、`help` 键存在（`client_window_catalogue`）；空状态在各窗口模型的单测里断言；锁着的窗口按快捷键给"还不能使用"；标题栏"？"显示帮助条目 | PASS |
| 3 | 序章与第一幕的 `tut_` 与相关 `tut_any_` 全部可触发（23.1） | `node tools/tutorial/check.ts`：见第 1.1 节 | PASS（等待项见第 1.1 节） |
| 4 | 色觉模式、文字大小、声音字幕、减少闪烁、长按改切换可用（23.1） | `tests/client_access.test.ts`（令牌对比度、模式应用、字幕样式与位置、过场音效字幕全覆盖）；`client_input_extras`（长按改切换覆盖只有长按的键，含开门）；`settings_store`、`desktop_settings`（新字段旧版本按默认） | PASS（浏览器复核见第 2 节） |
| 5 | 无模型档下没有空洞或等待状态（23.1、D-010） | 新窗口全部读内核视图，不依赖模型；空状态写"为什么空、怎么会有" | PASS |
| 6 | 引导检查通过（23.2） | `node tools/tutorial/check.ts`：0 个错误 | PASS |
| 7 | 文本检查通过（23.2） | `node tools/i18n/check.ts`：0 个发现 | PASS |
| 8 | 纯核心单测（23.2） | `tests/client_purity.test.ts` 全部纯核心无 DOM、无真随机与墙钟 | PASS |
| 9 | 存档客户端段与难度 | `tests/client_act1_wiring.test.ts`（写入与读回、超限时的丢弃顺序、旧槽位头与坏字段）；存档容器六个测试文件 | PASS |
| 10 | 各包请求的答复 | [progress.md](progress.md) 第 2 节的复查表与第 3 节的请求表 | PASS-WITH-FOLLOWUPS |

### 1.1 引导检查的结果

`node tools/tutorial/check.ts`：0 个发现，65 步（序章 9、第一幕 41、任何时候 15），251 种事件，7 步在等其他包（报告不算失败）：

| 步骤 | 所等信号 | 负责方 |
| --- | --- | --- |
| `tut_a1_map` | `far_from_tracked` | PK-M1-57 |
| `tut_any_offscreen` | `offscreen_threat` | PK-M1-57 |
| `tut_any_llm_error` | `llm_error` | PK-M1-02 |
| `tut_any_degrade` | `degraded` | PK-M1-02 |
| `tut_any_bagfull` | `bag_full`（背包容量拒绝） | 内核库存（负责包待定） |
| `tut_any_spoil` | `item_spoiled` | 内核库存（负责包待定） |
| `tut_any_contraband` | `contraband`（流通限制拒绝） | 内核经济（负责包待定） |

近似触发：`tut_a1_rumor` 在任何一条传闻传到时触发（`cognition.rumor_heard` 不带"关于玩家"）；`tut_any_debuff` 在任何他人施加的光环时触发（`combat.aura` 不带害益与驱散类别）；`tut_a1_coin` 在第一次供奉或用硬币时触发；`tut_p_camera` 20 秒后结束。

## 2. 未在本包验证的项

| 项 | 原因 | 去处 |
| --- | --- | --- |
| 全量 `npm test`、`npm run playthrough` | 用户要求测试放最后、不跑全量 | 主会话提交前 |
| 仅键鼠、仅手柄从序章玩到第一幕结束（23.1） | 需要真人或输入回放（23.2 输入回放未建） | PK-M1-10 的通关矩阵、可用性测试 |
| 三种分辨率、伪本地化与每种色觉模式的截图检查（23.2） | 截图检查工具未建 | 截图检查的后续包 |
| 第 22 节界面性能预算在参考机上 | 需要参考机 | 性能场景脚本 |

## 3. 已知遗留

见 [progress.md](progress.md) 第 3 节。

## 4. 实跑记录

末次变更之后（2026-11-19）：

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | 0 个错误 |
| `node tools/i18n/check.ts` | 0 个发现（2695 处键的使用） |
| `node tools/tutorial/check.ts` | 0 个发现，7 步等待 |
| `npx vitest run --config vitest.config.ts` 的 14 个文件（`i18n_ui_guard`、`client_purity`、`client_act1_wiring`、`client_records_windows`、`client_field_windows`、`client_tutorial`、`client_access`、`client_hud_extras`、`client_input_extras`、`client_window_catalogue`、`client_player_input`、`client_settings_shell`、`settings_store`、`desktop_settings`） | 14 个文件，475 项通过 |
| 修复轮之前：输入、存档、HUD、故事、音频的 13 个客户端测试文件；存档容器的 6 个测试文件 | 279 项、117 项通过（修复轮后未重跑，列入延后） |
| `node tools/content/validate.ts` | 失败 18 项，都不是本包：台词包吠叫池的覆盖 16 项（PK-M1-29 的数据）、女神雅努的锁定文本 2 项 |
| `tests/client_hd2d.test.ts` | 据无障碍一路报告失败于 `old_outpost` 的布局摘要（他包改了地图数据）；本会话未跑 |
