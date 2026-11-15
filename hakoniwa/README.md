# 《箱庭纪》（工作代号 Hakoniwa）

一部带有《月光下的异世界之旅》味道的穿越题材 HD-2D 像素游戏。异世界由六位大模型驱动的女神担任游戏管理员（GM），
她们各有人格、目标与立场，彼此竞争；她们之上还有一位从不开口的造主（开发者）。玩家是被主神以"规格外"为由
丢弃的异界人，从一扇被封印的门里掉进世界，从一个小镇开始，逐层走到城市、王国、大陆、诸族与神庭。

- 前期：RPG 战斗与探索，复杂技能体系与"千门回廊"线性释放。
- 中后期：城建、RTS 战场、SLG 大战略、立国。
- 全程：AI 居民社会（立场、认知、记忆、传闻、"凡人不信"）与 AI 女神 GM 的干预。
- 主题："一个被精心照看的世界，能否学会自己生长；照看者，能否学会放手。"

当前阶段：**M0 基线与管线**。设计文档覆盖全作（决策日志第 2 节没有未决问题，剩余设计见其第 3 节）；第一轮可玩版本已实现全部玩法的底层系统、
编辑器与可视化审核工作台，无模型档可以从序章玩到结局。现状见 [docs/60_production/project_state.md](docs/60_production/project_state.md)，
开发计划见 [docs/60_production/development_plan.md](docs/60_production/development_plan.md)。大模型由玩家自己配置；未配置时女神、NPC 与
各方势力由内置 AI 驱动，游戏同样完整。美术与音频全部由 AI 生成，需求与提示词在 [assets/prompts/](assets/prompts/README.md)。

## 快速开始

1. 仓库根目录：`npm ci`（主工程工具链）。
2. `cd hakoniwa && npx npm@10 ci`（本子项目的依赖是官方 Claude SDK，供开发服务的模型代理使用；以及 `three`，
   供 HD-2D 场景渲染使用，与主工程同版本）。
3. `npm run dev`，打开 `http://localhost:5180/`（游戏）与 `http://localhost:5180/editor.html`（编辑器与审核工作台）。
4. 可选（开发期）：在启动开发服务的环境里提供 Claude 凭据（`ANTHROPIC_API_KEY` 或 `ant auth login`），并在游戏设置里打开"大模型"，
   女神与 NPC 由模型驱动；否则由内置 AI 驱动。发行版的大模型由玩家在设置里自配（[docs/50_tech/llm_providers.md](docs/50_tech/llm_providers.md)）。
5. 测试：`npm test`、`npm run playthrough`（无模型通关）、`npm run typecheck`、`npm run build`、`npm run prompts:check`（提示词库）。
6. 素材提示词：`npm run prompts` 把 `assets/prompts/` 的模板与条目展开为 `assets/prompts/out/`（逐条提示词、表格、按里程碑的批次与素材清单）。

## 从哪里读起

| 想了解                              | 先读                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------- |
| 这是什么游戏                        | [docs/00_vision/vision.md](docs/00_vision/vision.md)                   |
| 世界观的单一事实源                  | [docs/20_world/world_bible.md](docs/20_world/world_bible.md)           |
| 六位女神（同时是 AI GM 的人格正典） | [docs/20_world/pantheon.md](docs/20_world/pantheon.md)                 |
| 剧情结构与"天上序幕，逐层拉远"      | [docs/30_story/narrative_design.md](docs/30_story/narrative_design.md) |
| 主线大纲                            | [docs/30_story/story_outline.md](docs/30_story/story_outline.md)       |
| 玩法总框架                          | [docs/40_design/game_framework.md](docs/40_design/game_framework.md)   |
| 已做的决定与剩余设计                | [docs/00_vision/decision_log.md](docs/00_vision/decision_log.md)       |
| 项目现状与开发计划                  | [docs/60_production/project_state.md](docs/60_production/project_state.md)、[development_plan.md](docs/60_production/development_plan.md) |
| 用 AI 生成美术与音频                | [assets/prompts/README.md](assets/prompts/README.md)                   |
| 全部文档索引                        | [docs/README.md](docs/README.md)                                       |

## 目录

| 路径                                       | 内容                                                           |
| ------------------------------------------ | -------------------------------------------------------------- |
| `docs/00_vision/`                          | 愿景、设计支柱、决策日志、术语表                               |
| `docs/10_research/`                        | 调研归档：50 部穿越动画、AI 方案对比、开源资料、主工程复用盘点 |
| `docs/20_world/`                           | 世界观正典：宇宙、诸神、历史、地理、种族、国家、社会、力量体系 |
| `docs/30_story/`                           | 叙事设计、主线大纲、分幕剧情、角色、谜团揭示台账               |
| `docs/40_design/`                          | 游戏设计：总框架、各系统、内容清单                             |
| `docs/50_tech/`                            | 技术方案：架构、AI 架构、大模型提供方、复用映射、美术与素材方案（AI 生成素材加 HD-2D 渲染）、发行工程 |
| `docs/60_production/`                      | 制作计划：路线图、开发计划、项目状态、风险、研发流程           |
| `docs/70_packets/`                         | 实施包                                                         |
| `data/` `src/` `tools/` `tests/`            | 实现：内容数据、源码、开发服务与脚本、测试                     |
| `assets/`                                  | AI 生成的美术与音频、素材清单、提示词库 `assets/prompts/`      |

本目录的写作规则与正典优先级见 [CLAUDE.md](CLAUDE.md)。
