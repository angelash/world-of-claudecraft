# 进度日志（Progress Log）

> 归属：`docs/60_production/`（制作计划，正典优先级第 5 级）。
> 作用：项目级的"发生过什么"：按日期记录完成的实施包与已提交的部分交付，每行带提交号。只追加，旧行不改。
> 上游：[dev_process.md](dev_process.md) 第 6.2 节（项目级四件套）与第 6.3 节（进度的写法）；[development_plan.md](development_plan.md) 第 4 节（包清单与状态列）、第 10 节（维护规则）。
> 姊妹文档：现在什么是真的见 [project_state.md](project_state.md)；每个包的状态以开发计划第 4 节的状态列为准；包内的进度与证据见 [70_packets/README.md](../70_packets/README.md)。

## 0. 怎样记

| 时机 | 记什么 |
| --- | --- |
| 一个包完成 | 在当天的小节末尾追加一行：包编号与标题、别名、交付了什么、提交号、验证依据 |
| 一个包的部分范围已提交 | 同上，在"内容"栏开头写"部分："，并写明交付了范围栏的哪几项；包仍为"进行中" |
| 一个包取消 | 追加一行，写砍线编号与决策编号 |
| 里程碑门 | 追加一行，写门的结论与证据台账位置 |

- 每天一个小节，标题是日期（`yyyy-mm-dd`）；同一天的行按提交先后排列。
- "提交号"写短哈希；有多个提交时全部列出；还没提交的不记。
- "验证"写实际运行的完整命令与量化结果，或指向包内 `verification_matrix.md`；本目录建立之前完成的包没有包目录，验证依据是提交说明与计划状态列的说明。
- 与本次无关的既有失败不写进这一行，写进包内 `verification_matrix.md` 的基线问题一节。
- 多个代理并行时，本日志由主会话统一追加（[70_packets/README.md](../70_packets/README.md) 第 4 节）。

## 1. 记录

### 2026-11-16

| 包 | 别名 | 内容 | 提交号 | 验证 |
| --- | --- | --- | --- | --- |
| PK-M0-06 Git LFS 与素材目录 | 无 | `hakoniwa/.gitattributes` 把 `assets/art/`、`assets/audio/` 的原文件与 `assets/processed/audio/` 交给 Git LFS，不改仓库根的属性文件；新增空的 `assets/manifest.json` 与 `assets/tools.json`；`assets/README.md` 写明存放规则 | `b9ae46ffe4` | 计划状态列：本机 LFS 往返已验证；远端配额与克隆耗时随 PK-M0-11 首批素材实测 |
| PK-M0-07 提示词库收尾 | 无 | 部分：`tools/prompts/build.ts` 为每条展开后的提示词写入 `promptHash`（中文、英文与反向提示词的 sha256），出现在 Markdown、CSV 与素材清单的登记字段里；技能类图标条目与规格后处理仍在本包范围内 | `1e3084789e` | `tests/prompts_library.test.ts` 增指纹用例（提交说明） |
| PK-M0-12 世界端口取代直写 | RE-11 | `src/systems/world/ports.ts` 导出 `setLife`、`setTagValue`、`setTag`、`haltEntity`、`setMoveSpeed`；战斗系统的调用点改走端口；删除 `src/systems/combat/entity_ops.ts`；`tests/architecture.test.ts` 增实体字段写入守卫；新增 `tests/world_ports.test.ts` | `c32a13bf18` | 提交说明：两条结局路线的世界哈希与旧代码逐检查点一致 |
| PK-M0-19 帧调度器与按需重画 | RE-06 | `src/client/render/frame_scheduler.ts`（纯逻辑核心，登记进 `CLIENT_PURE_CORES`）按脏原因与场景各部分的变化签名决定每帧画不画；HD-2D 渲染器的世界层与覆盖层分开绘制；模拟与输入的时序不变 | `96d28572e6` | `tests/client_frame_scheduler.test.ts`；提交说明：暂停画面一帧不画，静止画面约四分之一的帧重画 |
| PK-M0-22 本地全量门与提交流水线 | RE-19（提交部分） | `npm run gate`（`tools/gate.ts` 与 `tools/gate/`）依次运行禁用字符扫描、改动文件的 Biome、类型检查、默认测试、提示词库检查、构建，`--full` 加无模型通关；不在失败处停下，汇总每一步的退出码与耗时；仓库根 `.github/workflows/hakoniwa-ci.yml` 在推送时运行 | `9cd3e354b6` | `tests/gate.test.ts`；主工程 `tests/ci_workflow.test.ts` 的流水线钉住增加子项目类别（提交说明） |
| PK-M0-13 内容 ID 解耦 | RE-12 | 系统代码不再写死地图、地点、市场、女神、国家与幕：复生地图、幕序、宫廷名册与裁决、竞争市场、城市物品职能与自动通关路线都从数据读，载入时校验；新增 `map_roles.ts`、`goddess/roster.ts`、`quests/act_order.ts`、`game/autoplay/routes.ts` 与 `data/autoplay/routes.json`、`data/city/config.json`；语法树守卫 `tests/content_id_guard.test.ts` 的系统白名单为空 | `ff48818963` | 提交说明：两条结局路线的世界哈希逐检查点一致；`npm run playthrough` 通过 |
| PK-M0-04 设计对账与回写收尾 | 无 | 部分：落实过场目录第 15 节的回写，登记过场变量与计算函数、127 条过场音效、过场所需的特写、特效、专用动画与立绘（新增提示词条目 413 条）、三种界面模式、大地与梦境的舞台图、第六幕结局规则与新的台账标记；各文档的素材数随提示词库重新同步 | `a270138484` | 提交说明；`npm run prompts:check` |
| PK-M0-32 项目文档与流程落地 | 无 | 建立 `docs/70_packets/` 与 `_template/`（`brief.md`、`acceptance.md`、`report.md`）、`docs/60_production/reviewers/README.md`、本日志；架构与实施约定对齐已落地的代码；决策 D-087 定下文本引用 `{ key, params }` 与内容文本键 `c.<表>.<内容 ID>.<字段>` | `14f7a24558` | `npx vitest run tests/docs_guard.test.ts`：11 条通过；禁用字符扫描为 0 |
