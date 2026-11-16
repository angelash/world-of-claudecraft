# PK-M0-14 内核文本键迁移（别名：RE-13）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M0-14` 内核文本键迁移 |
| 状态 | 进行中（实施与验证已完成；建议在 PK-M0-29 落地、`npm run playthrough` 重跑通过后由主会话改为"已完成"，见 [verification_matrix.md](verification_matrix.md)） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.1 节 `PK-M0-14` |
| 形态 | 大包（5 代理人日）；按本目录约定只写入口、验收与进度三件，另附逐批金样报告 [golden_report.md](golden_report.md) |
| 工作流 | 内核 |
| 量级 | 5 代理人日，0.5 用户人日 |
| 依赖 | PK-M0-12（已完成） |
| 别名 | RE-13 |
| 立项日期 | 2026-11-16 |

## 1. 目标

内核（`src/core/`）、16 个玩法系统（`src/systems/*`）与游戏编排（`src/game/`，题面模板目录除外）不再含中文字面量：玩家可见的文字一律是 `TextRef`，源语言文本在 `locales/zh-Hans/sys_<系统>.json`，客户端与题面组装按表渲染，渲染结果与迁移前逐字节相同。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | `TextRef`、`TextParam`、`tr`，模型原文 `{ raw, lang }`，嵌套参数 | `src/core/text.ts`（另有 `rawText`、`joinText`、`clipText`、`textEquals`、`isTextRef`、`commandText`） | [release_engineering.md](../../50_tech/release_engineering.md) 第 8.1 节；D-087 |
| 2 | `CommandResult` 的拒绝原因换成 `TextRef`；共享事件与 `AiContextV1` 的文字字段换成 `TextParam` | `src/core/contracts.ts`、`src/core/shared_events.ts`、`src/core/ai_port.ts`、`src/core/engine.ts`（一行） | [architecture.md](../../50_tech/architecture.md) 第 4.5 节 |
| 3 | 16 个系统按第 8.4 节顺序分四批迁移 | `src/systems/*`、`locales/zh-Hans/sys_<系统>.json`（另有公共表 `sys_common.json`：列表分隔符、金钱单位、季节、日期样式、截断指令） | 发行工程第 8.2、8.4 节 |
| 4 | 棘轮守卫与上限 | `tests/i18n_kernel_guard.test.ts`、`tests/fixtures/i18n_ceiling.json`、扫描器 `tools/i18n/scan_literals.ts` | 发行工程第 8.4 节第 1、6 步；[implementation_conventions.md](../../50_tech/implementation_conventions.md) 第 8 节 |
| 5 | 客户端渲染：日志、拒绝原因、对话框、气泡、各窗口视图模型；参数格式（数字、金钱、日期、时长、嵌套引用、复数、选择），缺参保留占位、开发构建告警 | `src/shared_ui/i18n.ts`（`t`、`tSource`、`renderTextDeep`、`formatText`、`formatMoney`）与各适配器 | [ux_and_onboarding.md](../../40_design/ux_and_onboarding.md) 第 20.3 节 |
| 6 | 题面组装按源语言渲染上下文里的 `TextRef` | `src/ai/prompt.ts` 的 `renderContext`、`src/ai/runner.ts`（`speakAs`） | D-077；发行工程第 8.6 节 |
| 7 | 角色包题面模板移入模板目录（中文保留） | `src/game/ai_roles/templates/` | 发行工程第 8.4 节表格 `src/game/` 行 |
| 8 | 逐批金样对比 | `tests/playthrough/text_golden.playthrough.test.ts`、`tools/i18n/golden_diff.ts` | 发行工程第 8.4 节第 5 步 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 界面表 `src/shared_ui/text*.ts` 迁到 `ui.json`、键类型生成、伪本地化、`tc` | PK-M0-15 |
| 2 | 内容文本表 `content.generated.json` 与 `c.` 键的生成；本包只让渲染器能经内容查找解析 `c.<表>.<ID>.<字段>`，内核暂把内容显示名作为字符串参数传 | PK-M0-15 |
| 3 | 台词包与吠叫池（`ln_`、`bark_`）的键化 | PK-M0-25 |
| 4 | 编辑器与内容 pack 的字段标签 | 不本地化（发行工程第 8.4 节） |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、目录分工 |
| [implementation_conventions.md](../../50_tech/implementation_conventions.md) 第 8 节 | 文本规则 |
| [release_engineering.md](../../50_tech/release_engineering.md) 第 8 节 | 文本模型、字符串表、迁移步骤 |
| [ux_and_onboarding.md](../../40_design/ux_and_onboarding.md) 第 20 节 | 键的作用域、参数与格式 |
| `src/core/text.ts`、`src/shared_ui/i18n.ts` | 类型与渲染器 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | `tr` 等函数纯函数，无墙钟与非命名随机 | `tests/architecture.test.ts` |
| 内核不查表 | `src/core`、`src/systems`、`src/game` 不引用 `src/shared_ui` 与 `locales/` | `tests/i18n_kernel_guard.test.ts` |
| 行为不变 | 两条结局路线渲染后的事件序列、世界切片、旗标与元数据与迁移前一致 | [golden_report.md](golden_report.md) |
| 文本 | 内核只发 `TextRef`；测试断言键与参数 | `tests/i18n_kernel_guard.test.ts` |
| 禁用字符 | 源码、字符串表、文档无破折号、emoji、U+2600 到 U+27BF | 守卫与 `tests/docs_guard.test.ts` |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/core/text.ts`、`src/shared_ui/i18n.ts`、`locales/zh-Hans/*.json`、`tools/i18n/{scan_literals,stringify_check,golden_diff}.ts`、`tests/i18n_kernel_guard.test.ts`、`tests/text_ref.test.ts`、`tests/i18n_money_format.test.ts`、`tests/fixtures/i18n_ceiling.json`、`tests/playthrough/text_golden.playthrough.test.ts`、`src/game/ai_roles/templates/*.ts`、系统旁的词表 JSON（见 [progress.md](progress.md)） |
| 本包修改 | `src/core/{contracts,shared_events,ai_port,engine,index}.ts`、`src/core/registry/registry.ts`（一处正则改写为转义）、`src/systems/**`、`src/ai/{prompt,runner}.ts`、`src/game/ai_roles/*.ts`、`src/game/autoplay/player.ts`、客户端适配器与窗口模型、`tools/gate/steps.ts`（加一步）、`tools/README.md`、`tests/README.md`、相关测试 |
| 越界改动 | `src/editor/**` 的少量渲染行（逐处见 [progress.md](progress.md)） |

## 7. 停止条件

金样出现文字以外的差异即停下定位；四批均未触发。

## 8. 验证命令

在 `hakoniwa/` 下运行：

```
node tools/i18n/scan_literals.ts
npx vitest run --config vitest.config.ts tests/i18n_kernel_guard.test.ts
node tools/i18n/stringify_check.ts
npm run typecheck
npm test
npm run playthrough
TEXT_GOLDEN_OUT=<文件> TEXT_GOLDEN_ROUTE=<release 或 rule_merca> npx vitest run --config vitest.playthrough.config.ts tests/playthrough/text_golden
node tools/i18n/golden_diff.ts <迁移前.json> <迁移后.json>
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 总闸（新起会话审查差异） | 必派 | 一次贡献结束；结论见 [verification_matrix.md](verification_matrix.md) 第 3 节 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、字符串表、守卫与金样工具、本目录四份文档 | 主会话 | 抽看 [verification_matrix.md](verification_matrix.md)；`npm test` 与 `npm run playthrough` 绿 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 系统旁的词表 JSON（性格词、玩家输入词、聚落居民名）何时迁入 `data/` | 推荐随内容管线的下一批一并迁入并给人设卡加性格代码 | 不阻塞 |
