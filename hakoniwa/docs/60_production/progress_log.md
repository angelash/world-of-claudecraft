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
| PK-M0-23 大模型契约与适配器 | 无 | 中立调用规格 `LlmCallSpec` 与 20 个问题代码（`src/ai/contracts.ts`、`src/ai/providers/problems.ts`）；`none`、`anthropic`、`openai_compat`、`local` 四个纯函数适配器（不发网络请求）；模式方言改写与改写缓存；能力表与探针解读、连续三次后通道下移；`data/llm/price_book.json` 与 `known_models.json`；开发代理的 `/api/llm` 按请求体分流新旧契约，新增 `/api/llm/test` 与 `/api/llm/models`；旧 `src/ai/providers.ts` 拆进 `src/ai/providers/`，导入路径不变 | `9afe88d70d` | `npx vitest run --config vitest.config.ts llm_`：4 个文件 223 条通过；暂存树单独导出后 `npm run typecheck` 通过、`npm test` 1211 条通过（另 2 条失败只因导出树不含仓库根的工作流与主工程文档） |
| PK-M0-21 桌面壳骨架 | RE-01 | 部分：`desktop/` 主进程、`app://` 协议与内容安全策略、导航与新窗口拦截、权限、单实例、通道白名单与逐通道校验、日志脱敏与轮转、大模型网关进程、密钥录入窗、预载桥 `window.hk`；`npm run build:desktop`、`npm run desktop:dev`；`PlatformHost` 与 `npm run pack:win` 未做 | `c00a7ddc61` | `tests/desktop_security.test.ts` 59 条，连同 `desktop_ipc`、`desktop_storage_layout` 与架构守卫共 96 条通过，10 处变异全部被测出；Electron 43.8.1 实机从标题页玩到第一场战斗，页面无 `require` 与 `process` |
| PK-M0-04 设计对账与回写收尾 | 无 | 部分：分幕（序章到第五幕）、角色设定集、场景动线、千门、地图简报，以及任务（前）、台词、战争、女神、迷宫、门各目录落实过场目录的回写请求；第一到三幕任务补写入声明；修正跨目录悬空引用；五处美术不一致按正典裁定（无貌之王对话框只显示空框、救赎后脸回来、哑钟与塞维林统一到首领三视图、五位女神的专属表情、鹰丘印戒为鹰纹）；提示词库合计 10,342 条，各文档计数随之同步 | `9578be7e26` | `npm run prompts:check`：10,342 条通过；`npx vitest run tests/docs_guard.test.ts tests/prompts_library.test.ts`：23 条通过；禁用字符扫描为 0 |
| PK-M0-08 美术导入管线 | 无 | `tools/assets/` 的 `register`、`import`、`atlas`、`check` 四个入口与纯逻辑核心 `tools/assets/core/`（自写 PNG 编解码、抠色、切格、像素网格、色板量化、描边、锚点、帧、检查、MaxRects 图集、联系表）；素材清单登记、导入别名表、纸娃娃键色核对；`npm run assets:*` 用仓库根的 tsx 运行 | `72590d59f9` | `tests/art_import.test.ts`、`art_manifest`、`art_coverage`：样例图走通 13 步，同一原图两次导出的 PNG 与元数据逐字节一致，坏样例给出 `frames`、`palette` 原因码；`ART_GATE=M0` 列出 51 条缺失 |
| PK-M0-09 音频导入分支与事件表 | 无 | `assets:*` 的音频分支（`tools/assets/core/audio/`）：拼接与切分、裁切、循环接缝、BS.1770 响度与 4 倍过采样真峰值、前视限幅、Ogg 48 kHz 编码与复测、元数据；`data/audio/cues.json` 首版；`src/client/audio/` 的 `audio_director`、`cue_map`、`bus_model` 纯逻辑骨架；分轨未接入 | `72590d59f9` | `tests/audio_import.test.ts`：响度、真峰值、循环点问题各给原因码，重导编码字节一致；状态机单测通过；暂存树单独导出后 `npm run typecheck` 通过、`npm test` 1316 条通过（另 2 条失败只因导出树不含仓库根文件） |
