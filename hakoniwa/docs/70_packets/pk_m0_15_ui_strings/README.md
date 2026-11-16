# PK-M0-15 界面字符串表、窗口编号与键位核心（别名：RE-14）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M0-15` 界面字符串表、窗口编号与键位核心 |
| 状态 | 进行中（实施与验证已完成，建议主会话提交后改为"已完成"，见 [verification_matrix.md](verification_matrix.md)） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.1 节 `PK-M0-15` |
| 形态 | 大包（4 代理人日）；按本目录约定只写入口、验收与进度三件，另附金样报告 [golden_report.md](golden_report.md) 与伪本地化截图 [screenshots/](screenshots/) |
| 工作流 | 客户端 |
| 量级 | 4 代理人日，0.5 用户人日 |
| 依赖 | PK-M0-14（已完成，`94eba662bb`） |
| 别名 | RE-14；界面文档第 24.2 节 M0 项 |
| 立项日期 | 2026-11-16 |

## 1. 目标

界面文字全部来自字符串表并能按语言、伪语言渲染；内容显示文字有自动抽取的文本表并以 `c.` 键流转；窗口带 `ui_` 编号，按情境的键位表与改键纯核心可单测；文本检查进全量门。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 字符串表布局；`t(key, params)`、`t(ref)`、`tc`、`tOr`、`hasText`、`listSeparator` | `locales/zh-Hans/`、`src/shared_ui/i18n.ts` | 发行工程第 8.2 节；界面第 20.3 节 |
| 2 | 键的联合类型（生成物）与新鲜度检查；`tr` 与 `t` 的键参数受约束 | `tools/i18n/gen_keys.ts`、`src/core/text_keys.generated.ts`、`src/core/text.ts` 的 `TextKeyArg` | 发行工程第 8.2 节 |
| 3 | 内容文本抽取 `content.generated.json`；内容键构造 `contentKey`、`contentRef`、`contentText`；客户端装入查表 | `tools/i18n/extract_content.ts`、`tools/i18n/extract_content_cli.ts`、`src/shared_ui/content_text.ts`、`src/core/content_key.ts`、`src/client/app/main.ts`、`src/editor/inspector/inspector_ui.ts` | D-087；发行工程第 8.3 节 |
| 4 | 内核把持有记录的内容显示名参数换成 `c.` 键（城建、经济、战略、女神行动与唤醒、任务交付） | `src/systems/{city,economy,strategy,goddess,quests}/**` | 发行工程第 8.1 节 |
| 5 | 伪本地化 `qps-wide`；开发构建标红缺参与缺键 | `src/shared_ui/pseudo.ts`、`src/shared_ui/missing_marks.ts`、`src/client/app/dev_text_marks.ts`、`src/client/app/config.ts`（`?lang=`） | 界面第 20.3、20.6 节 |
| 6 | 界面表迁移：`src/shared_ui/text*.ts` 删除，`locales/zh-Hans/ui.json` 按元件类组织，客户端一律 `t('ui.…')`；客户端内容显示名经内容键 | `locales/zh-Hans/ui.json`、`src/client/**`、`src/client/view/content_names.ts` | 发行工程第 8.4 节第 7 步；界面第 20.2 节 |
| 7 | 界面棘轮守卫 | `tests/i18n_ui_guard.test.ts` | 发行工程第 8.4 节第 6 步 |
| 8 | 窗口登记表：31 个窗口的 `ui_win_` 编号、标题、空、错误、帮助文本键与里程碑 | `src/client/windows/window_registry.ts`（`WINDOW_DEFS`、`PLANNED_WINDOWS`、`ALL_WINDOWS`、`windowByUiId`） | 界面第 2.3、23.2 节 |
| 9 | 按情境的键位表与改键纯核心；改键存同步份 `contextKeys` | `src/client/input/contexts.ts`、`src/client/app/settings_schema.ts` | 界面第 16.1、16.2、16.6 节；D-088 |
| 10 | 文本检查工具与全量门一步 | `tools/i18n/text_check.ts`、`tools/i18n/check.ts`、`tools/gate/steps.ts`（`text_check`）、`tests/gate.test.ts` | 发行工程第 8.7 节第 4 步；界面第 20.5、23.2 节 |
| 11 | 翻译导出过滤：跳过 `sys.*.prompt.*` 与只供题面读的内容字段 | `tools/i18n/text_check.ts` 的 `exportableKeys`、`src/shared_ui/content_text.ts` 的 `isSourceOnlyContentKey` | 发行工程第 8.1、8.6 节 |
| 12 | 文档回写 | `docs/50_tech/release_engineering.md` 第 8.1 到 8.4 节、`docs/50_tech/implementation_conventions.md` 第 8 节 | PK-M0-14 的请求回写 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 改键界面、手柄键位表、按键字形与 `{key:<动作>}` 的渲染、按情境的输入层接入 `InputController` | PK-M1-07 |
| 2 | 按揭示阶段取值的字符串表条目（界面第 20.4 节）与术语表 `ui.glossary.*` | PK-M1-22、PK-M1-23（窗口与术语表落地时） |
| 3 | 编辑器与内容 pack 的字段标签本地化 | 不本地化（发行工程第 8.4 节） |
| 4 | 其余系统里以字符串传显示名的参数换成内容键（战场、对话、认知、NPC、场景、导演、同伴等） | 后续包（见 [progress.md](progress.md) 遗留） |
| 5 | 待译清单导出工具 `tools/i18n/export_pending.ts` 与 `_meta.json` | 1.x 语言更新（发行工程第 8.7 节） |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、目录分工 |
| [release_engineering.md](../../50_tech/release_engineering.md) 第 8 节 | 文本模型、布局、内容文本、文本检查 |
| [implementation_conventions.md](../../50_tech/implementation_conventions.md) 第 8 节 | 文本规则 |
| [ux_and_onboarding.md](../../40_design/ux_and_onboarding.md) 第 2.3、16、20、23 节 | 窗口编号、键位、键格式与伪本地化、验收 |
| `src/core/text.ts`、`src/core/content_key.ts`、`src/shared_ui/i18n.ts` | 类型与渲染器 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | 内容键构造纯函数，不读表 | `tests/architecture.test.ts` |
| 内核不查表 | `src/core`、`src/systems`、`src/game` 不引用 `src/shared_ui` 与 `locales/` | `tests/i18n_kernel_guard.test.ts` |
| 行为不变 | `c.` 键替换后两条结局路线渲染后的事件、切片、旗标与迁移前一致 | [golden_report.md](golden_report.md) |
| 界面无中文字面量 | `src/client`、`src/shared_ui` 只允许逐条列出的例外 | `tests/i18n_ui_guard.test.ts` |
| 禁用字符 | 源码、字符串表、文档无破折号、emoji、U+2600 到 U+27BF | `tests/docs_guard.test.ts`、全量门 |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `locales/zh-Hans/ui.json`、`locales/zh-Hans/content.generated.json`、`src/core/content_key.ts`、`src/core/text_keys.generated.ts`、`src/shared_ui/{content_text,pseudo,missing_marks}.ts`、`src/client/app/dev_text_marks.ts`、`src/client/input/contexts.ts`、`src/client/view/content_names.ts`、`tools/i18n/{gen_keys,extract_content,extract_content_cli,text_check,check}.ts`、`tests/{i18n_ui_strings,i18n_ui_guard,client_keymap_contexts,client_window_catalogue}.test.ts`、本目录 |
| 本包删除 | `src/shared_ui/text.ts`、`text_play.ts`、`text_battle.ts`、`text_strategy.ts` |
| 本包修改 | `src/core/{text,index}.ts`、`src/shared_ui/{i18n,dom}.ts`、`src/client/**`（迁表与内容名）、`src/systems/{city,economy,strategy,goddess,quests}/**`（内容键）、`src/editor/batch/batch_ui.ts`、`src/editor/inspector/inspector_ui.ts`、`tools/content/inputs.ts`、`tools/gate/steps.ts`、`tests/{i18n_kernel_guard,settings_store,desktop_settings,economy,city,goddess,gate,text_ref,client_feature_labels}.test.ts`、`tests/playthrough/text_golden.playthrough.test.ts`（加 `TEXT_GOLDEN_MAX_TICKS`）、两份技术文档 |
| 不得修改 | PK-M0-29 的在制文件（`src/core/time.ts`、`src/systems/combat/{progression,rewards,threat,index,types}.ts`、`src/systems/strategy/diplomacy.ts`、`src/game/autoplay/{player,prepare}.ts`、`tools/content/validators/balance.ts`、`data/` 下的改动、`tests/{combat,quests,warfare,client_log_format,content_validation,calendar,progression}.test.ts`）；PK-M0-25 的 `src/core/brain/`、`src/systems/dialogue/lines/`、`data/dialogue/`、`data/cognition/lines.json` |

## 7. 停止条件

金样出现文字以外的差异即停下定位；未触发。

## 8. 验证命令

在 `hakoniwa/` 下运行：

```
node tools/i18n/gen_keys.ts --check
node tools/i18n/extract_content.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.config.ts tests/i18n_ui_strings.test.ts tests/i18n_ui_guard.test.ts tests/client_keymap_contexts.test.ts tests/client_window_catalogue.test.ts tests/i18n_kernel_guard.test.ts
npm run typecheck
npm test
npm run build
npm run build:release
node tools/content/validate.ts
TEXT_GOLDEN_OUT=<文件> TEXT_GOLDEN_ROUTE=<release 或 rule_merca> npx vitest run --config vitest.playthrough.config.ts tests/playthrough/text_golden
node tools/i18n/golden_diff.ts <替换前.json> <替换后.json>
```

伪本地化截图：开发服务加 `?lang=qps-wide`，见 [screenshots/](screenshots/) 与 [verification_matrix.md](verification_matrix.md) 第 1 节。

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 总闸（新起会话审查差异） | 必派 | 一次贡献结束；结论见 [verification_matrix.md](verification_matrix.md) 第 3 节 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、字符串表、生成物、工具、守卫与测试、两份技术文档的回写、本目录 | 主会话 | 抽看 [verification_matrix.md](verification_matrix.md)；`npm test` 与 `node tools/i18n/check.ts` 绿 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 改键随云同步还是只存本机：界面第 16.6 节第 7 条写"改键存本机"，发行工程第 4.4 节与 D-088 把键位放在同步份 | 推荐随同步份（本包做法），并把界面文档第 16.6 节第 7 条改成"随设置同步份"；导出与导入照旧 | 不阻塞 |
| 2 | 其余系统的内容显示名参数何时换成 `c.` 键 | 推荐在各系统下一次有内容改动的包里顺手换，每次以两条路线的渲染金样核对 | 不阻塞 |
