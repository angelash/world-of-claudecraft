# PK-M0-15 界面字符串表、窗口编号与键位核心：进度与汇报

> 只追加。入口见 [README.md](README.md)，验收见 [verification_matrix.md](verification_matrix.md)，`c.` 键替换的金样见 [golden_report.md](golden_report.md)。

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-16 | 实施 | 字符串表与键类型、内容文本抽取与 `c.` 键、伪本地化与标红、界面表迁移与守卫、窗口登记表、按情境键位与改键核心、文本检查进全量门、文档回写 | 未提交 | 见 [verification_matrix.md](verification_matrix.md) | 审查 |
| 2026-11-16 | 审查与修复 | 新起会话的总闸审查一次；补换第二批内容键、客户端内容名回退、编辑器装入查表、改键锁定加强、导出过滤、文本检查规则与注释扫描、文档修正 | 未提交 | 见 [verification_matrix.md](verification_matrix.md) 第 3 节 | 主会话提交，改计划状态 |

## 2. 汇报

### 2026-11-16 实施与审查

**改动文件（按方面）**

| 方面 | 文件 | 动作 | 说明 |
| --- | --- | --- | --- |
| 字符串表 | `locales/zh-Hans/ui.json` | 新增 | 由删除的 `T` 表一次性转出（值逐条相同），键按界面第 20.2 节元件类组织；另加 31 个窗口的空、错误、帮助条目与 13 个规划窗口的标题；无人引用的旧条目删去 |
| 字符串表 | `src/shared_ui/text.ts`、`text_play.ts`、`text_battle.ts`、`text_strategy.ts` | 删除 | 由 `ui.json` 取代 |
| 键类型 | `tools/i18n/gen_keys.ts`、`src/core/text_keys.generated.ts`、`src/core/text.ts`（`TextKey`、`TextKeyArg`、`tr`） | 新增、修改 | 生成物放 `src/core`：内核不得引用 `src/shared_ui` |
| 渲染器 | `src/shared_ui/i18n.ts` | 修改 | `t(key, params)` 重载、`tc`、`tOr`、`hasText`、`listSeparator`；`SOURCE_TABLE` 只并 `ui.json` 与 `sys_*.json`；生成的内容表作后备；开发构建带伪语言 |
| 内容文本 | `src/core/content_key.ts`、`src/shared_ui/content_text.ts`、`tools/i18n/extract_content.ts`、`tools/i18n/extract_content_cli.ts`、`locales/zh-Hans/content.generated.json` | 新增 | 键 `c.<表>.<ID>.<字段>[.<序号>]`；`contentTextLookup` 用同一抽取器建查表 |
| 内核 | `src/systems/city/{construction,index,officials,orders,placement}.ts`、`src/systems/economy/{company,competitor,index,ports,trade}.ts`、`src/systems/strategy/{commands,military}.ts`、`src/systems/goddess/{actions,wake}.ts`、`src/systems/quests/index.ts`、`src/core/index.ts` | 修改 | 持有记录时以 `contentText(表, 记录, 回退)` 传显示名；两轮共 58 处 |
| 客户端 | `src/client/**`（35 个文件经一次性脚本从 `T` 改为 `t('ui.…')`，按数据补全的键用 `tOr`）、`src/client/view/content_names.ts`、`src/client/app/{main,config,dev_text_marks}.ts`、`src/client/client.css` | 修改、新增 | 启动一局时装入内容查表；`?lang=qps-wide`；开发构建标红；快捷栏名字可断行 |
| 编辑器与工具 | `src/editor/batch/batch_ui.ts`、`src/editor/inspector/inspector_ui.ts`、`tools/content/inputs.ts` | 修改 | V10 改读字符串表；检视器装入工作区内容的查表 |
| 伪本地化 | `src/shared_ui/pseudo.ts`、`src/shared_ui/missing_marks.ts` | 新增 | |
| 窗口与键位 | `src/client/windows/window_registry.ts`、`src/client/input/contexts.ts`、`src/client/app/settings_schema.ts` | 修改、新增 | 同步份新增字段 `contextKeys`（版本仍为 1，旧版本把它当作未知字段保留） |
| 文本检查 | `tools/i18n/text_check.ts`、`tools/i18n/check.ts`、`tools/gate/steps.ts`、`tests/gate.test.ts` | 新增、修改 | 全量门加 `text_check` 步 |
| 测试 | `tests/{i18n_ui_strings,i18n_ui_guard,client_keymap_contexts,client_window_catalogue}.test.ts` 新增；`tests/{i18n_kernel_guard,settings_store,desktop_settings,economy,city,goddess,text_ref,client_feature_labels}.test.ts`、`tests/playthrough/text_golden.playthrough.test.ts` 修改 | | 断言内容键与渲染结果 |
| 文档 | `docs/50_tech/release_engineering.md` 第 8.1 到 8.4 节、`docs/50_tech/implementation_conventions.md` 第 8 节、本目录 | 修改、新增 | |

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 发行工程第 8.2 节 | 键类型生成到 `src/shared_ui/text_keys.generated.ts` | 生成到 `src/core/text_keys.generated.ts` | `tr` 在内核，内核不得引用 `src/shared_ui`（守卫） | 否（已回写） |
| 发行工程第 8.2 节 | `pseudo/` 目录存伪语言表 | 开发构建运行时由源语言表生成，不落盘 | 生成物不必提交；发布构建不带 | 否（已回写） |
| 发行工程第 8.2 节 | 另有 `lines.generated.json` | 台词包的台词行也在 `content.generated.json`（`c.line_packs.*`） | 一个抽取器、一套键；PK-M0-25 把台词放进内容表 | 否（已回写） |
| 界面第 20.5 节 | 源表放 `src/shared_ui/text/zh_hans/<域>.ts`，译文在 `i18n/<语言>/` | 源表与译文都在 `locales/<语言>/` 的 JSON | 与发行工程第 8.2 节和 PK-M0-14 的系统表一致 | 是（建议改界面文档第 20.5 节） |
| 界面第 16.6 节第 7 条 | 改键存本机 | 存同步份 `contextKeys` | 发行工程第 4.4 节与 D-088 把键位放同步份 | 是（README 第 11 节第 1 条） |
| 界面第 16.6 节第 1 条 | Esc 主位与左键"选择"不可解绑 | 这些槽位既不能解绑也不能改到别的键；各情境的左键选取都锁定 | 改到别的键同样让"返回"失控 | 否 |
| 界面第 20.2 节 | 窗口键 `ui.win.<元件名>.<条目>` | 同；另有 `ui.common.panel.*`（窗口外壳）、`ui.common.unit.*`、`ui.common.calendar.*` 等公共键 | 多个元件共用的文字 | 否 |
| 发行工程第 8.1 节 | 参数里的实体一律传内容键 | 这一包换了城建、经济、战略、女神、任务交付；任务接受标签仍传字符串 | 后者被 PK-M0-29 的在制测试按字符串断言 | 否（遗留） |
| 编辑器 | 不本地化 | `src/editor/text.ts` 不动，守卫不覆盖 `src/editor` | 发行工程第 8.4 节 | 否 |

**遗留**

| 事项 | 建议去处 |
| --- | --- |
| 其余系统的内容显示名参数换成 `c.` 键：战场（兵团、英雄、技能、目标）、对话与场景（台词、选项、证据）、认知（地点）、NPC（地点、人名）、导演、同伴、门、任务进度与视图；客户端里物品名、任务与人名、施法条名字仍读内容原文 | 各系统下一次有内容改动的包 |
| 任务接受标签换成内容键 | PK-M0-29 落地后，连同 `tests/quests.test.ts` 一并改 |
| 存档里持久化的 `c.` 键不随内容重命名表改写（`src/core/save/renames.ts`） | 存档包：重命名表加 `c.` 键改写，或在渲染时经重命名表解析 |
| 第 19.2 节其余长度类别的规则（提示框标题、轻量通知、系统条、选项、加载提示、物品名、任务名等） | 对应界面落地的包 |
| 16.2 里尚未建模的键位行（选中自己与队友、窗口方向键、战场镜头平移与调出编组、对话左键推进） | PK-M1-07 |
| 发布构建也打包了生成的内容表（约 0.5 MB），而运行时总以本局内容的查表优先 | 语言包按需加载时（界面第 22 节"语言包"） |
| 待译清单导出工具 `tools/i18n/export_pending.ts` | 1.x 语言更新 |
| 两份界面文档条文与实现的差异（第 20.5 节表格、第 16.6 节第 7 条） | 文档代理 |

**风险**

| 风险 | 说明 |
| --- | --- |
| 内容表随 `data/` 过期 | 改了显示文字而不重跑抽取会让文本检查与 `tests/i18n_ui_strings.test.ts` 失败（这是有意的提醒）；并行包合入时后合的一方要重跑 `node tools/i18n/extract_content.ts` |
| 长度规则覆盖不全 | 文本检查只对已有规则的键族报超长 |
