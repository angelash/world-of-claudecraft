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
| PK-M0-27 世界状态变量注册表 | 无 | `tools/registry/`（`npm run registry`、`registry:check`）从注册表文档生成 `data/registry/vars.json`（692 个规范名、110 个族、23 张值别名表）；`src/core/registry/` 的 `FlagRegistry`；内容层实现第 9.3 节 14 条规则并经注册表换算载入；开发构建写未登记名即抛错的守卫；数据与系统代码换成规范名（数据自动改写 571 处）；第 11 节的修正：同伴门钥读同伴羁绊、会盟过场与大战略会盟各用各的完成标记、`trust.oola` 合并 | `355ee87db3` | 暂存树单独导出：`npm run typecheck` 通过，`node tools/registry/build.ts --check` 通过，`npm test` 1354 条通过，`npm run playthrough` 3 个文件通过；纯改名阶段两条结局路线在别名换算后世界逐项一致 |
| PK-M0-16 存档容器、PK-M0-17 命令日志分段与回放工具 | RE-04、RE-28 | `src/core/save/`：内容寻址的 gzip 快照与只增命令分段、槽位头最后提交并自哈希、上一代回退、回收站与可恢复存档、内存、IndexedDB 与 node:fs 三种存储；`Engine.drainLog` 与 `replayFrom`；`tools/replay/` 的 `replay` 与 `record`；客户端 `ClientSaves` 取代 localStorage 整局存档并迁入旧存档 | `90b1e12f8a` | `tests/save_container.test.ts` 37 条（每一步写入都断电、云冲突、第六幕夹具）、`replay_segments` 6 条；完整离手路线 45 次存档，44 段逐段回放与中间锚点到终点的哈希一致；暂存树单独导出后 `npm test` 1397 条通过 |
| PK-M0-21 桌面壳骨架 | RE-01 | 收尾：`src/platform/` 的 `PlatformHost` 与桌面、网页、测试三种实现，架构守卫禁止内核、系统、游戏与 AI 层引用它；`npm run pack:win`（未签名的 Windows 包，熔断位写入后读回比对，`hkBuild` 盖章）；打包后的路径布局；决策 D-088 定下网页版设置存两个本地存储键 | `83898f0829` | `npx vitest run --config vitest.config.ts tests/platform_ tests/desktop_ tests/architecture.test.ts`：132 条通过；打包后的程序进入标题页，新游戏进入第一场战斗；默认通道带调试参数即退出；暂存树单独导出后 `npm test` 1433 条通过 |
| PK-M0-24 路由、预算与模型替身 | 无 | `src/ai/llm_config/`：设置模型与四种预设、决策类别表、按档位与轮次的路由（绑定、倾向或最高档、就近槽、降档、按连接熔断改道）、估算器与校准、`llm` 分区的版本与迁移；`Budget` 重写为小时、日、局三窗口的金额与 token 口径与 0 到 9 级（带滞回）；运行器按设置路由并接入通道降级、坏输出、估算与价目；`IpcTransport`、`LocalHttpTransport`、`DevProxyTransport`（只在开发构建动态引入）；RE-22 替身：脚本、回声、混沌、录带、假钥匙串、本机模拟服务；`data/llm/presets.json`、`estimate_baseline.json` | `452c53ee83` | `llm_settings`、`llm_routing`、`llm_budget`、`llm_estimate`、`llm_transports`、`llm_mocks`：114 条通过（预算随机不变量 6000 步）；暂存树单独导出后 `npm run typecheck` 通过、`npm test` 1547 条通过、`npm run build` 通过且游戏入口的块不含 `/api/llm`；`npm run playthrough` 4 个文件通过 |
| PK-M0-07 提示词库收尾 | 无 | 部分：规格后处理全部落地：魔物、首领、兵团、坐骑立牌改用"只画生灵"的风格锚变体；有名 NPC 头像依赖各自首领三视图；界面图标与兵种图标去重；曙光圣柱损毁件；战争目录的战场远景、郡图底纹、地块与战场特效补入条目；新增经校验的导入字段 `body`、`anchor`、`blankRows`、`exprKey`、`styleVariant`；过场表情按美术方案第 3.6 节落到画得出的格子，另加两张第八种表情；全库 10,386 条（美术 9,172、音频 1,214） | `3645babd0e` | `npm run prompts:check` 通过；`npx vitest run tests/prompts_library.test.ts tests/art_manifest.test.ts tests/art_coverage.test.ts tests/art_import.test.ts tests/docs_guard.test.ts`：87 条通过、2 条跳过；未改条目的指纹新旧脚本逐条一致 |
| PK-M0-10 素材解析器与外观数据 | 无 | `src/client/assets/`：`AssetResolver`（只认通过且有元数据的记录，其余给原因码）、帧图集裁切与左向镜像、立牌、头像与半身立绘的解析顺序、开发构建的加载器（`?art=procedural` 强制占位）；`Appearance` 增 `sheet`、`doll`、`portrait`、`bust`、`variants` 与 `appearanceProblems`；`look.ts` 的 16 个风格包、按图集区域取风格、穹顶、圆锥帐顶与尖塔；`AnimName` 对齐 13 条动作条；`ultra` 档存在但不进设置菜单；`data/combat/monsters.json` 的 15 个 `base` 改为体型别名 | `c3d01bd356` | `tests/client_assets.test.ts` 31 条等；无素材时 109 个实体的全部帧与 10 张地图、四档画质的摘要与改动前基线逐像素一致；暂存树单独导出后 `npm run typecheck` 通过、`npm test` 1606 条通过、`npm run build` 通过 |
| PK-M0-20 设置存储 | RE-29 | `SettingsStore` 与纯逻辑设置模型 `settings_schema.ts`：同步份（按键、语言、无障碍、字幕、音量）与本机份（画质、视角、窗口、显卡偏好、帧率上限、安装编号、`llm` 分区），逐字段校验、版本迁移、三个旧键一次性迁入；桌面主进程原子写 `settings.*.json`、损坏文件改名 `.bad`、`hk:save.*` 由文件存档容器应答、窗口记忆；客户端启动时选 `PlatformHost`，存档经 `host.saves`，标题前安装已通过的素材 | `ab5f4d6f80` | `tests/settings_store.test.ts` 24 条、`desktop_settings` 23 条，连同桌面、平台与守卫共 257 条通过；浏览器开发版旧键迁入、存读档与刷新后设置保留；桌面开发版快速存档、重启读档；暂存树单独导出后 `npm test` 1653 条通过，`npm run build`、`npm run build:desktop` 通过 |
| PK-M0-04 设计对账与回写收尾 | 无 | 部分：揭示台账、序章到第六幕、18 份内容目录与三份系统文档换成注册表的规范名与任务编号（关系量纲按注册表换算）；注册表补登第二幕七个标记、`npc.ron.command_growth`、遗言存放处与值别名（700 个名字）；灰路、澱巢、路线、老船夫旧桨、开门事件词等悬空引用收尾；决策 D-089 到 D-094（羁绊与信任分立、任务编号、A3-S19 与苇桥的写入点、澱巢与路线编号、战场天幕、变量口径）；提示词库 10,387 条 | `fd91aa44e1` | 暂存树单独导出：`node tools/registry/build.ts --check` 通过，`npm test` 1653 条通过；`npm run prompts:check` 通过；禁用字符扫描为 0 |
| PK-M0-18 存档迁移与恢复 | RE-05 | 读档管线：世界迁移链、重命名表 `data/registry/renames.json`（由注册表推导，449 条）、切片校验；五个版本号任一较新即拒读拒写且不动文件；四级恢复（上一代、锚点重放、候选恢复到新槽并标 `recovered`）；铁人局一局一槽、只收自动与退出存档、每次换幕留锚点；`Engine.replay` 支持 AI 关闭局的回放；客户端与桌面壳写入当前的 `RENAME_VERSION`，旧 localStorage 存档迁入时按版本 0 处理 | `d92fc0d474` | `tests/save_migration`、`save_renames`、`save_recovery`、`save_versions`、`save_ironman`：77 条，逐行对应发行工程第 10.4 节；`replay_segments` 通关测试通过；暂存树单独导出后 `npm run typecheck` 通过、`npm test` 1730 条通过 |
| PK-M0-28 内容管线与校验层 | RE-24 | `tools/content/`：按目录表格的声明式映射抽取到 `data/_staging/`、七步命令与批次记录 `data/_batches/`；`node tools/content/validate.ts` 的 V1 到 V10（模式含外观字段、引用、命名空间、变量注册表、揭示台账、数值带、素材引用、玩家文本、可达性、专有名词）；`src/content/` 的字段路径、引用表与实体种类表（内容 ID 守卫共用）；编辑器的批次视图与变量注册表视图；第一个批次 `content_act1_items_01` 第一段合入 6 种一档澱源材 | `940fddfc43` | 暂存树单独导出：`node tools/content/validate.ts` V1 到 V10 全绿（只有报警），`npm run typecheck` 通过，`npm test` 除负载下 30 秒超时外全部通过（超时的 5 个文件单独重跑通过），`npm run build` 通过；合入前后 release 路线 10 个检查点世界哈希一致，`npm run playthrough` 通过 |
