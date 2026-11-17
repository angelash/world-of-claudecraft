# PK-M0-26 意图分类器与大脑检查器：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS |
| 末次代码或内容变更 | 未提交；改动文件清单见 `progress.md` 第 2 节 |
| 完整实跑 | 2026-11-17；基于提交 `76000f3001a6d7d8fcecc48dd42fc74e5459df05` 之上的工作区改动 |
| 审查 | 一次只读通读（见第 3 节）：发现 31 条，已修复或已核验 20 余条，其余为已登记的"不做"范围或经核对符合设计原意而驳回 |
| 遗留 | 话题图、台账拒答五种处理、转移话题候选、耐心值与第三次拒答结束会话、台词历史接线、NPC 大脑真正的决策产出：均转 PK-M1-18、PK-M1-19，见 `README.md` 第 3 节 |

## 1. 验收条目

| 序 | 验收 | 命令或评审 | 结果（原样要点与量化数字） | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 语料（500 句）非 `unknown` 覆盖率不低于 68% | `npx vitest run --config vitest.config.ts tests/intent_corpus.test.ts` | `corpus: coverage 90.0% (450/500), accuracy 89.6% (403/450)` | 本次实跑标准输出（见下方"通用检查"行） | PASS |
| 2 | 语料被分类句正确率不低于 72% | 同上 | `accuracy 89.6% (403/450)` | 同上 | PASS |
| 3 | 保留集（120 句，从未用于调参）同样过线，验证不过拟合 | 同上 | `holdout: coverage 82.5% (99/120), accuracy 78.8% (78/99)` | 同上 | PASS |
| 4 | 52 种意图在语料里每种都至少被正确分类一次（覆盖率不是靠一种意图撑起来的） | `tests/intent_corpus.test.ts`："the corpus labels every one of the 52 intent ids, each at least once correctly" | 4 个用例全过（含新加的"每种意图至少一次 correct"与"unknown 自身召回率非零"两条，取代早期仅检查 `classified>0` 的较弱断言） | 同上 | PASS |
| 5 | 分类结果驱动关系与认知写入 | `tests/intent_classifier.test.ts` 的 "respondTo world effects" 与 "dialogue.say end to end" 两组 | 11 个用例：谢谢升好感、冒犯降好感并发事件、谢谢每日一次防刷、吹嘘写入认知证据、注入攻击不改关系或认知、告辞立即说出台词并以 `bye` 关闭、重复吹嘘的后续权重显著衰减、道歉恢复部分冒犯损失、无台词内容的身份问题仍有真实回答（不是"confused"）、火药走拒答分支 | `npx vitest run --config vitest.config.ts tests/intent_classifier.test.ts` | PASS |
| 6 | 调试面板的大脑检查器骨架：能看任一行动者的当前层与解释 | `tests/brain_inspector.test.ts` | 7 个用例全过：`SystemContext.brainTrace` 接线、`TraceBook` 32 条环形、空行动者处理、记录从不进存档、`traceLines`/`traceDisplayLines` 纯格式化 | 同上 | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck`（`tsc -p tsconfig.json` 加 `tsc -p desktop/tsconfig.json`） | 是 | 无输出，0 错误 | PASS |
| 本包与相邻测试套 | `npx vitest run --config vitest.config.ts tests/intent_classifier.test.ts tests/intent_corpus.test.ts tests/brain_inspector.test.ts tests/dialogue.test.ts tests/cognition.test.ts tests/brain.test.ts tests/lines.test.ts tests/architecture.test.ts tests/i18n_kernel_guard.test.ts tests/i18n_ui_guard.test.ts tests/content_id_guard.test.ts tests/client_windows.test.ts tests/client_purity.test.ts tests/client_window_catalogue.test.ts tests/core.test.ts` | 是 | `Test Files 15 passed (15)`，`Tests 293 passed (293)` | PASS |
| 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 是（改了 `builtin_ai.md` 与本包文档） | 11 个用例全过（本包补齐 `verification_matrix.md`、`progress.md` 后，原先的断链找不到两个文件的问题已解决） | PASS |
| 改动文件格式 | `npm run format -- <改动的 TS 与 JSON>`（逐批对本包自己的文件执行，未触碰其他代理的文件） | 是 | 每批 `Checked N files`；仅 1 条预先存在于 `classify.ts`（本次评审未改动的部分）的 `mergeOrder` 未用参数警告，不是不安全修复不执行，不影响本包 | PASS |
| 数据校验门 | `node tools/content/validate.ts` | 是（新增 `intentLexicon`、`intentRules` 两个内容表，新增 `react.nonsense` 台词槛位） | `all validators green`（V1 到 V10 均 0 错误；既有警告数未变） | PASS |
| i18n 扫描 | `node tools/i18n/check.ts` | 是 | `text check: 0 finding(s) {}; 1776 key uses scanned` | PASS |
| 文本键重生成 | `node tools/i18n/gen_keys.ts` | 是（新增 `sys.dialogue.intent.*`、`ui.win.debug.brain*` 共 7 个键） | `wrote src/core/text_keys.generated.ts (1899 keys)` | PASS |
| 内容文本重生成 | `node tools/i18n/extract_content.ts` | 是（新增 `react.nonsense` 两行台词） | `wrote locales/zh-Hans/content.generated.json (5663 keys from 48 tables)`；`git diff` 核对后确认除本包新增的 `c.line_packs.ln_common.slots.react_nonsense.*` 两个键外，余下差异全部是 PK-M0-30 当时工作区里未提交的数据改动，不是本包引入 | PASS（越界说明见 `progress.md` 第 2 节"越界改动与请求回写"） |
| 无模型通关（一条结局路线） | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts` | 是（触及对话系统核心路径与 `SystemContext`） | `Test Files 1 passed (1)`，`Tests 1 passed (1)`，`Duration 365.09s`；另一条路线与其余回放、文本金样未跑（brief 只要求这一条） | PASS |
| 构建 | `npm run build` | 否（本包不改构建配置，宣称可合入前由主会话统一跑） | 未在本次验证中单独执行 | N/A |
| 全量本地门 | `npm run gate` | 否（宣称可合入前由主会话统一跑） | 未在本次验证中单独执行 | N/A |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 一次只读覆盖性审查（通用代理，非固定角色名） | 本包收官前的强制覆盖性复查（brief 要求） | 发现 31 条，分 BLOCKING 1、SHOULD-FIX 22、NIT 9 | 1（本文件与 `progress.md` 缺失导致文档守卫失败） | 22 | 已修复：告辞立即出台词并以 `bye` 关闭（而非 `patience`）；重复吹嘘的认知证据改用按意图去重的独立性键，不再按 tick 无限计数；道歉读取 `restore` 字段恢复部分好感；R8 通知改为发 `dialogue.notified` 事件（原先被丢弃）；production 路径传入真正的 `flag` 读取器（禁名解禁后不再永久 forbidden）；`@intro`/`@rumor` 兜底改为真正调用内置回复而非被过滤丢弃；`earth_refuse` 的 `&& false` 改为真正检查匹配来源；`troubled` 读取现有的饥饿/疲劳需求而非恒假；`unbelief` 改接已注册的 `react.nonsense` 槛位（原先的 `react.unverified` 不在词典注册表，已被我自己的回归套件 `tests/lines.test.ts` 当场拦下）；`ruleSetProblems` 新增对 `if` 条件名的校验；`splitClauses` 修正"连接词在词语中间被误判为分句点"的真实误判（如"还有"出现在"你家里还有什么人"中间）并同时修掉了其 O(n^2) 的逐字符拼接；`compact()` 不再抹掉引号，修复带引号未知专名永远提取不到的问题；`classifyIntent` 新增输入长度夹断与私用区字符过滤。核验为符合设计、驳回不改：`insult`/`threaten`/`joke` 没有每日上限是 builtin_ai.md 5.5 原文明确只给 `thanks`/`apologize`/`compliment`/闲聊加每日一次上限，冒犯类意图理应可无限累积作为惹恼的代价。遗留未动（已登记为本包"不做"或转 PK-M1-18/19）：`advance` 的 `repeat_today`、`third_insult`、耐心值、台词历史、`afterQuestion`/`inTopic` 真正来源、次要意图的简短反应、`ask_plan` 的 `{activity}` 槛位替换、`R5 entry` 真正接住。 | 见本节与 `progress.md` 第 2 节逐条表 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | `tests/time_skip.test.ts`、`src/systems/travel/system.ts` 的若干类型错误 | 这两个文件在本包开工前、本会话全程都是另一代理（PK-M0-31）尚在工作区的未提交文件（`git status --short` 一直显示为 `??`）；排除后本包自身代码的类型检查全程保持 0 错误 | PK-M0-31 |
| （whole-repo）`biome check .` | 预先存在的仓库级红 | `CLAUDE.md` 明确记为"故意保留的红"，不是本包回归 | 已登记的历史技术债，不属于任何单包 |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 两条结局路线的完整通关（本次只跑了一条） | brief 明确限定"跑一条，一次，放到最后"，未要求跑完整套播放测试 | 主会话或下一次全量 `npm run gate` 时跑另一条路线与完整套件 |
| 真机或多人同桌的大脑检查器视觉效果 | 需要真实运行客户端截图；本包只验证了纯核心的格式化逻辑与存在性接线 | PK-M1-18 接入真正的 NPC 大脑决策后，连带做一次界面截图 |
