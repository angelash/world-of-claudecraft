# PK-M0-14 内核文本键迁移：验收与证据

> 入口见 [README.md](README.md)；进度与汇报见 [progress.md](progress.md)；逐批金样见 [golden_report.md](golden_report.md)。状态只用 PASS、FAIL、VERIFY、N/A。

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS：本包的验收全部有证据；`npm run playthrough` 在当前共享工作区因并行包 PK-M0-29 的在制玩法改动失败（第 4 节），只含本包改动的快照上两条路线均走到结局且金样与迁移前一致，待 PK-M0-29 落地后由主会话重跑 |
| 末次代码或内容变更 | 未提交；改动文件见 [progress.md](progress.md) 第 2 节 |
| 完整实跑 | 2026-11-16，工作区（含并行包 PK-M0-29 未提交的玩法改动） |
| 审查 | 新起会话的总闸审查一次：2 条 BLOCKING（遗留临时测试、包文档未完成）、7 条 SHOULD-FIX，已全部处理或转后续，详见第 3 节 |
| 遗留 | 转 PK-M0-15（界面表、内容文本表、键类型）与内容管线（词表 JSON 迁入 `data/`），见 [progress.md](progress.md) |

## 1. 验收条目

| 序 | 验收 | 命令或评审 | 结果（原样要点与量化数字） | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 棘轮上限为 0 | `node tools/i18n/scan_literals.ts`；`npx vitest run --config vitest.config.ts tests/i18n_kernel_guard.test.ts` | 扫描输出 `[]`；`tests/fixtures/i18n_ceiling.json` 三个作用域均为 0；守卫 14 项通过 | `tests/fixtures/i18n_ceiling.json` | PASS |
| 2 | 每批的金样重录有报告且除文字字段外无行为差异 | `TEXT_GOLDEN_OUT=... npx vitest run --config vitest.playthrough.config.ts tests/playthrough/text_golden`；`node tools/i18n/golden_diff.ts` | B1 到 B4 两条路线均 `identical (text rendered)`；收尾快照（B4 加本包之后的改动）两条路线也一致 | [golden_report.md](golden_report.md) | PASS |
| 3 | 全部测试通过 | `npm test` | 末次实跑：95 个文件，1916 项通过、2 项跳过、1 项失败（`art_manifest`，与本包无关，第 4 节）；前一次实跑另有 `registry` 一项在并行负载下超时，单独重跑 37 项全过 | 本表第 4 节 | PASS（基线问题除外） |
| 4 | 通关回归通过 | `npm run playthrough` | 当前工作区：`replay` 与 PK-M0-29 新加的 `act1_minimal` 通过；`release`、`rule_merca` 在第二幕卡住（no prey for Lv14），`replay_segments` 的准备钩子 30 分钟超时（同一卡住的路线）。只含本包改动的快照：收尾金样两条路线 `finished`、结局正确且与迁移前一致；存档与锚点回放由默认套件的 `tests/replay_segments.test.ts` 覆盖（通过） | 本表第 4 节；[golden_report.md](golden_report.md) | VERIFY（工作区失败归 PK-M0-29，待其落地后重跑） |
| 5 | 类型检查 | `npm run typecheck` | 两个工程均无错误，退出码 0 | 本会话 | PASS |
| 6 | 渲染等同 | 金样之外：`tests/text_ref.test.ts`（12 项）、`tests/i18n_money_format.test.ts`；B4 快照 400000 tick 的探针 | 探针：9728 个 `TextRef` 渲染后 0 个残留，缺键缺参 0 | [golden_report.md](golden_report.md) 第 3 节 | PASS |
| 7 | 无隐式字符串化 | `node tools/i18n/stringify_check.ts` | `0 implicit TextRef stringification(s)`；已并入全量门 `text_stringify` 步 | `tools/gate/steps.ts` | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 见第 1 节第 5 条 | PASS |
| 默认套件 | `npm test` | 是 | 见第 1 节第 3 条 | PASS（基线问题除外） |
| 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 是 | 11 项通过 | PASS |
| 改动文件格式 | `node ../node_modules/@biomejs/biome/bin/biome check <本包文件>` | 是 | 本包文件无错误；剩余提示属他包既有代码 | PASS |
| 无模型通关 | `npm run playthrough` | 是 | 见第 1 节第 4 条 | VERIFY |
| 构建 | `npm run build` | 是（确认 Vite 打进 `locales/` 的表） | 退出码 0；产物里有表中文本 | PASS |
| 全量本地门 | `npm run gate`（快速档） | 是 | forbidden_chars、typecheck、prompts_check、registry_check、content_validate、text_stringify、build、build_release 通过；biome_changed 只在他包的 `assets/processed/**/*.json` 上失败；test 只有 `art_manifest` 失败（第 4 节）；playthrough 需 `--full`，另跑见第 1 节第 4 条 | PASS（基线问题除外） |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 总闸（新起会话，只读） | 一次贡献结束 | 需修复后通过 | 2 | 7 | 见下表 | 本会话 |

| 序 | 发现 | 严重度 | 处理 |
| --- | --- | --- | --- |
| 1 | 临时探针测试留在 `tests/` | BLOCKING | 已删 |
| 2 | 包文档未完成 | BLOCKING | 已补齐本目录四份文档 |
| 3 | 模型命令可以塞入文本键或绕过长度上限 | SHOULD-FIX | `commandText`：来源为模型时只收字符串，规则回退的文本键另按上限截断；计划的槽位备注对模型只收短字符串 |
| 4 | 渲染器遇到畸形参数会抛错 | SHOULD-FIX | `formatText` 对非文本对象渲染为空并上报；`isTextRef` 只认 `sys.`、`ui.`、`tut.`、`c.` 作用域的键 |
| 5 | 对话回复的规则回退丢了 120 字截断 | SHOULD-FIX | 已按 120 截断（`clipText`） |
| 6 | 声望查询分组从渲染文字变为键 | SHOULD-FIX | 只影响声望窗口的平票取舍，不进世界；转后续（[progress.md](progress.md)） |
| 7 | 模型文字没有存为 `{ raw, lang }` | SHOULD-FIX | `dialogue.reply`、`npc.say`、`npc.plan`、`npc.diary_batch`、`goddess.say`、`scenes.resolve` 来自模型的文字存为原文加语言 |
| 8 | 守卫缺口 | SHOULD-FIX | 守卫新增：内核 JSON 只许列出的词表含中文、内核没有 `.ts` 以外的代码文件、内核不引用字符串表、键前缀与无用键、`tr` 参数与占位一一对应、双引号与反引号的键；隐式字符串化检查进全量门 |
| 9 | 设计文档仍写事件字段为 `TextRef` | SHOULD-FIX | 设计文档由文档代理维护，已在 [progress.md](progress.md) 写请求回写 |
| 10 到 16 | 短日期样式、编辑器事件检视显示键、开发者文字在中文表、题面键混在玩家表、共享标签表进 AI 上下文等 | NIT | 已加 `sys.common.date.short`；检视器渲染后显示与搜索；`no_handler` 改英文原文并删去 `sys_core.json`；共享表复制后进上下文；题面键的处理转 PK-M0-15 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | `src/editor/batch/batch_ui.ts`、`tests/save_ironman.test.ts`（早期）、`tests/ai_units.test.ts`、`tests/editor_workspace.test.ts`、`tests/progression.test.ts` 的类型错误 | 均为并行包的在制文件，本包未改动这些行 | 内容管线、存档、AI 提供方、PK-M0-29 |
| `npm run playthrough` | `release`、`rule_merca` 卡在第二幕；`replay_segments` 钩子超时 | 第二幕开始于 tick 558750，迁移前基线是 520824，分叉始于第一幕的升级与经验；本包四批与收尾的快照都早于 PK-M0-29 的改动且金样逐字节一致；已提前告知主会话 | PK-M0-29 |
| `npm run gate` 的 biome_changed | `assets/processed/backgrounds/cg/art_style_lothar_plain.json` 等三个素材清单 JSON 格式不符 | 本包不动 `assets/` | 素材导入 |
| `npm test` | `tests/art_manifest.test.ts`：`art/backgrounds/cg/art_style_lothar_plain.png` 等图片未登记 | 本包不动 `assets/`；图片由并行的素材工作新增 | 素材导入 |
| `npm test` | `tests/registry.test.ts` 的整日旗标守卫用例超时（30 秒） | 同时有通关与金样进程占满处理器；单独重跑 `npx vitest run --config vitest.config.ts tests/registry.test.ts` 37 项全过 | 机器负载 |
| `npm test`（中途一次） | `tests/client_log_format.test.ts` 季节换算、`tests/combat.test.ts` 首领等级、`tests/replay_segments.test.ts` 回放 | 前两项随 PK-M0-29 的历法与首领规则在制改动出现、之后由其修正；回放一项在数据文件被改写的那几分钟内失败，单独重跑 6 项全过 | PK-M0-29 |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 接模型时的显示 | 真实模型档下模型原文 `{ raw, lang }` 在各窗口的显示只经单元测试与模拟提供方覆盖 | 主会话或 PK-M0-15 在开发服务下抽看 |
