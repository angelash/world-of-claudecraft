# PK-M0-15 界面字符串表、窗口编号与键位核心：验收与证据

> 入口见 [README.md](README.md)；进度与汇报见 [progress.md](progress.md)；`c.` 键替换的金样见 [golden_report.md](golden_report.md)。状态只用 PASS、FAIL、VERIFY、N/A。

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS：界面第 23.1 节 M0 各行与包行验收都有证据；遗留项（其余系统的内容键、未建模的键位行、长度规则补全）见 [progress.md](progress.md) |
| 末次代码或内容变更 | 未提交；改动文件见 [progress.md](progress.md) 第 2 节 |
| 完整实跑 | 2026-11-16，共享工作区（含 PK-M0-29 与 PK-M0-25 的未提交改动）；金样在隔离快照上跑（[golden_report.md](golden_report.md) 第 1 节） |
| 审查 | 新起会话的总闸审查一次：1 条 BLOCKING、10 条 SHOULD-FIX，处理见第 3 节 |
| 遗留 | 转后续包，见 [progress.md](progress.md) 的遗留表 |

## 1. 验收条目

### 1.1 界面第 23.1 节的 M0 行

| 序 | 验收（M0 行拆成的条目） | 命令或评审 | 结果 | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | `t()` 就位：按键查表、带参数、渲染 `TextRef`、内容文字 `tc`、缺键显示键名 | `npx vitest run --config vitest.config.ts tests/i18n_ui_strings.test.ts tests/text_ref.test.ts` | `i18n_ui_strings` 21 项、`text_ref` 12 项通过 | `tests/i18n_ui_strings.test.ts` 的 "t, tc and tOr" 组 | PASS |
| 2 | `TextRef` 就位，键受类型约束：拼错的字面量键类型检查失败 | `npm run typecheck`；`tests/i18n_ui_strings.test.ts` 里的 `@ts-expect-error` 用例 | 两个工程无本包错误；拼错键的用例在类型检查中被拒（去掉标注即报 `UnknownTextKey`） | `src/core/text.ts` 的 `TextKeyArg` | PASS |
| 3 | 文本检查工具就位并进全量门 | `node tools/i18n/check.ts`；`npx vitest run --config vitest.config.ts tests/gate.test.ts` | `text check: 0 finding(s)`；门表 `text_check` 一步已钉住，36 项通过 | `tools/gate/steps.ts`、`tests/gate.test.ts` | PASS |
| 4 | 内核中文字面量迁移完 | `npx vitest run --config vitest.config.ts tests/i18n_kernel_guard.test.ts` | 14 项通过；三个作用域上限为 0 | `tests/fixtures/i18n_ceiling.json` | PASS |
| 5 | 界面中文字面量迁移完（`src/client`、`src/shared_ui`） | `npx vitest run --config vitest.config.ts tests/i18n_ui_guard.test.ts` | 5 项通过；只剩 4 条列出的例外（两个读文字的正则、伪语言的两个边界符）与开发构建的沙盒；加一条中文字面量即失败（已做变异核对） | `tests/i18n_ui_guard.test.ts` | PASS |
| 6 | 窗口登记表带 `ui_` 编号（第 23.2 节窗口检查：编号、空与错误状态文本键、帮助条目） | `npx vitest run --config vitest.config.ts tests/client_window_catalogue.test.ts` | 4 项通过：第 2.3 节 31 个窗口全部登记（已建 18，规划 13），每项的四个文本键都在表里 | `src/client/windows/window_registry.ts` | PASS |
| 7 | 按情境的键位表有单测（第 23.2 节键位检查：默认键位同一情境内与全局无冲突） | `npx vitest run --config vitest.config.ts tests/client_keymap_contexts.test.ts` | 18 项通过：10 个情境、默认表 `keymapConflicts` 为空、跨情境复用允许 | `src/client/input/contexts.ts` | PASS |
| 8 | 改键纯核心有单测（冲突、锁定、保留键警告、Alt+F4 拒绝、恢复默认、持久化到同步份） | 同上；`tests/settings_store.test.ts`、`tests/desktop_settings.test.ts` | 同上 18 项；设置两份 47 项通过 | `src/client/app/settings_schema.ts` 的 `contextKeys` | PASS |
| 9 | 伪本地化可用 | `tests/i18n_ui_strings.test.ts` 的 "pseudo-localization" 组；开发服务 `?lang=qps-wide` | 3 项通过；三屏截图见本表第 1.2 节 | `src/shared_ui/pseudo.ts`、[screenshots/](screenshots/) | PASS |

### 1.2 包行验收与任务验收

| 序 | 验收 | 命令或评审 | 结果 | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 伪本地化三屏截图无溢出 | `node .local/pk15/shots.mjs http://localhost:5191 docs/70_packets/pk_m0_15_ui_strings/screenshots`（puppeteer，1280×720，SwiftShader；脚本不入库，测法写在报告里：文本节点 `scrollWidth` 大于 `clientWidth` 即溢出） | 标题、游戏中的 HUD、背包窗口（另测角色窗口）溢出均为 0；界面字符全部被【】包住。HUD 截图里剧场面板的序章台词与选项仍是中文：它们是内容台词，由场景系统以内容原文传出，尚未换成 `c.` 键（遗留） | [screenshots/qps_title.png](screenshots/qps_title.png)、[screenshots/qps_hud.png](screenshots/qps_hud.png)、[screenshots/qps_window_inventory.png](screenshots/qps_window_inventory.png)、[screenshots/qps_report.json](screenshots/qps_report.json) | PASS |
| 2 | 生成物不手改、有新鲜度检查 | `node tools/i18n/gen_keys.ts --check`；`node tools/i18n/extract_content.ts --check` | 两者都报 current；文本检查调用两者 | `tools/i18n/check.ts` | PASS |
| 3 | 内容文本表按 D-087 的键生成，客户端经 `setContentText` 装入 | `tests/i18n_ui_strings.test.ts` 的 "content keys" 与 "content text extraction" 组 | 5653 个键，无折叠冲突；生成物与重新抽取一致；启动一局与编辑器检视器都装入查表 | `src/client/app/main.ts` 的 `startWith`、`src/editor/inspector/inspector_ui.ts` | PASS |
| 4 | `c.` 键替换前后两条结局路线渲染后的金样一致 | `TEXT_GOLDEN_OUT=... TEXT_GOLDEN_ROUTE=... npx vitest run --config vitest.playthrough.config.ts tests/playthrough/text_golden`；`node tools/i18n/golden_diff.ts` | 两轮都是 release 与 rule_merca 均 `identical (text rendered)`；两条路线都走到结局（release 2366897 tick、324011 个事件，rule_merca 1778105 tick、308735 个事件） | [golden_report.md](golden_report.md) | PASS |
| 5 | 翻译导出跳过 `sys.*.prompt.*` | `tests/i18n_ui_strings.test.ts` 的 "keeps prompt keys out of translation export" | 通过：表里有题面键，导出清单里没有；只供题面读的内容字段也被过滤 | `tools/i18n/text_check.ts` 的 `exportableKeys` | PASS |
| 6 | 文档回写 | 评审；`npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 发行工程第 8.1 到 8.4 节、实现约定第 8 节按现行设计改写；文档守卫通过 | 两份文档 | PASS |
| 7 | 类型检查 | `npm run typecheck` | 两个工程中本包文件无错误；剩下的错误只在 PK-M0-25 的 `src/systems/dialogue/lines/` 与 `tests/lines.test.ts`（第 4 节） | 本会话 | PASS（基线问题除外） |
| 8 | 全部测试 | `npm test` | 101 个文件，2036 项通过、2 项跳过、2 项失败：`art_manifest`（基线，第 4 节）与 `docs_guard` 的链接项（当时本文件尚未写出，写出后重跑通过） | 本表第 4 节 | PASS（基线问题除外） |
| 9 | 构建 | `npm run build`；`npm run build:release` | 两者退出码 0；发布包的泄漏扫描通过；发布包里没有伪语言表 | 本会话 | PASS |
| 10 | 内容校验 | `node tools/content/validate.ts` | `all validators green` | 本会话 | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 见第 1.2 节第 7 条 | PASS |
| 默认套件 | `npm test` | 是 | 见第 1.2 节第 8 条 | PASS |
| 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 是 | 11 项通过 | PASS |
| 改动文件格式 | `node ../node_modules/@biomejs/biome/bin/biome check --write <本包文件>` | 是 | 本包文件无错误，只剩提示级信息 | PASS |
| 禁用字符 | 本包文件逐行扫描 U+2013 到 U+2015、U+2600 到 U+27BF 与 emoji | 是 | 0 处 | PASS |
| 无模型通关 | `npm run playthrough` | 是（触及内核） | 未在共享工作区跑：PK-M0-29 的在制改动让通关结果属于它；隔离快照上的金样两条路线都走到结局（第 1.2 节第 4 条） | VERIFY |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 总闸（新起会话，只读） | 一次贡献结束 | 需修复后通过 | 1 | 10 | 见下表 | 本会话 |

| 序 | 发现 | 严重度 | 处理 |
| --- | --- | --- | --- |
| 1 | 内容键替换不完整，与文档"一律"的写法不符 | BLOCKING | 第二轮补换 19 处（女神名与神行动标签、梅尔卡、商会名、缺料与竞争者物品名、城建连通性、行军路线与野战名）；文档改写为"已换的系统"加遗留说明；其余系统转遗留；任务接受标签受 PK-M0-29 的测试约束保留字符串 |
| 2 | 共享工作区里内容表过期（PK-M0-25 删了 `data/dialogue/templates.json`） | SHOULD-FIX | 重跑抽取，当前树上文本检查为 0；风险写进 progress |
| 3 | 客户端内容名查不到时显示键名 | SHOULD-FIX | `src/client/view/content_names.ts` 改用 `tOr`，回退到记录原文 |
| 4 | 编辑器未装入内容查表 | SHOULD-FIX | 检视器 `attach` 时装入工作区内容的查表 |
| 5 | 锁定槽位只防清除，能被改到别的键；只锁了野外的左键选择 | SHOULD-FIX | 锁定槽位不能清除也不能改；各情境的左键选取都锁定；存档读入同样拒收 |
| 6 | 第 16.2 节部分键位行未建模 | SHOULD-FIX | 转 PK-M1-07（遗留表） |
| 7 | 持久化的 `c.` 键不随内容重命名改写 | SHOULD-FIX | 转存档包（遗留表） |
| 8 | 导出过滤与文档不符（内容字段未过滤） | SHOULD-FIX | `exportableKeys` 接受内容过滤函数，测试覆盖内容表 |
| 9 | 文档若干陈述与代码不符（`lines.generated.json`、"一律"、长度上限覆盖、"构建步骤"、数量） | SHOULD-FIX | 逐条改写 |
| 10 | 长度规则覆盖不全，关闭按钮规则不匹配任何键 | SHOULD-FIX | 修正按钮与页签规则，门名改为 8；其余类别转遗留，文档写明覆盖范围 |
| 11 | 覆盖数上限 128 小于情境键位的槽位数 | SHOULD-FIX | 新增 `MAX_CONTEXT_KEY_OVERRIDES` 按槽位数计算，测试覆盖全槽位 |
| 12 到 23 | 头注释措辞、原型链名字、Alt+Tab、注释里的 `/*` 被当成注释、伪语言的列表分隔符、过时措辞与数量、注释里的中文示例、导入重复等 | NIT | 头注释、`Object.hasOwn`、Alt+Tab、注释扫描、`list_sep`、过时措辞、注释中文已改；其余（内容表打包体积、查表构建耗时、局部变量名）记入遗留或不改 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npm test` | `tests/art_manifest.test.ts`：`assets/art/` 下若干图片未登记 | 本包不动 `assets/`；图片由并行的素材工作新增，PK-M0-14 已记录同一失败 | 素材导入 |
| `npm test` | `tests/architecture.test.ts` 的 `systems/ has no DOM access` | 命中 `src/systems/dialogue/lines/select.ts` 注释里的英文单词 window；该文件是 PK-M0-25 的未跟踪文件 | PK-M0-25 |
| `npm run typecheck` | `src/systems/dialogue/lines/*.ts`、`tests/lines.test.ts` | PK-M0-25 的在制文件 | PK-M0-25 |
| `npm test`（负载下） | `tests/registry.test.ts` 整日旗标守卫、`tests/editor_quests.test.ts` 真内容索引超时（30 秒） | 同时有两条金样路线在跑；单独重跑 53 项全过 | 机器负载 |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 共享工作区上的 `npm run playthrough` | PK-M0-29 与 PK-M0-25 落地后的工作区 | 主会话，在两包落地后重跑 |
| 三种分辨率与色觉模式的截图检查（界面第 23.2 节） | 截图回归工具 | PK-M1-08 |
