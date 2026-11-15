# src/：游戏源码

分层与约定见 `../docs/50_tech/architecture.md`。依赖只能向下：

| 目录 | 内容 |
|---|---|
| `core/` | 确定性内核：时钟、随机流、事件与命令契约、引擎、AI 端口、存档与重放 |
| `content/` | 内容包机制（`packs/` 下每个系统一个包，自动发现）与校验 |
| `systems/` | 玩法系统，每个系统一个目录（`index.ts` 导出 `system` 即自动注册） |
| `ai/` | AI 编排层：提供方、运行器、预算与降级、题面、输出校验、审计 |
| `game/` | 游戏工厂与系统注册、AI 角色包（`ai_roles/`）、自动玩家（`autoplay/`） |
| `client/` | 2D 客户端（Canvas2D 渲染、输入、HUD、窗口、视图适配器） |
| `editor/` | 编辑器与可视化审核工作台 |
| `shared_ui/` | 客户端界面文本与 DOM 小工具 |

`core`、`content`、`systems`、`ai`、`game` 不得引用 DOM；`core`、`systems`、`game` 不得使用非确定性的时间与随机
（`tests/architecture.test.ts` 守卫）。
