# PK-M0-14 内核文本键迁移：进度与汇报

> 只追加。入口见 [README.md](README.md)，验收见 [verification_matrix.md](verification_matrix.md)，逐批金样见 [golden_report.md](golden_report.md)。

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-16 | 基础 | `TextRef` 类型、渲染器、字符串表布局、棘轮守卫、金样工具、迁移前基线 | 未提交 | 金样 release 与基线一致 | B1 |
| 2026-11-16 | B1 | dialogue、cognition、npc | 未提交 | 两条路线金样一致；`src/systems` 上限 1406 到 990 | B2 |
| 2026-11-16 | B2 | city、strategy | 未提交 | 两条路线金样一致；上限 990 到 481 | B3 |
| 2026-11-16 | B3 | warfare、goddess、economy | 未提交 | 两条路线金样一致；上限 481 到 160 | B4 |
| 2026-11-16 | B4 与收尾 | combat、doors、quests、scenes、inventory、world、party、director、modifiers；拒绝原因收窄为 `TextRef`；`src/game` 清零；审查修复 | 未提交 | B4 与收尾快照两条路线金样一致；上限 160 到 0、`src/game` 83 到 0；`npm run typecheck` 退出码 0；`npm test` 1916 通过、1 项他包失败；`npm run playthrough` 在共享工作区因 PK-M0-29 卡在第二幕，只含本包改动的快照两条路线走到结局；其余见 [verification_matrix.md](verification_matrix.md) | PK-M0-29 落地后重跑通关，主会话提交并改计划状态 |

## 2. 汇报

### 2026-11-16 实施

**改动文件（按批）**

| 批 | 文件 | 动作 | 说明 |
| --- | --- | --- | --- |
| 基础 | `src/core/text.ts` | 新增 | `TextRef`（`KeyText` 或 `RawText`）、`TextParam`、`tr`、`rawText`、`joinText`（列表拼接，分隔符 `sys.common.join.<sep>`）、`clipText`（截断指令，代替对文字的 `slice`）、`textEquals`、`isTextRef` |
| 基础 | `src/core/contracts.ts`、`shared_events.ts`、`ai_port.ts`、`index.ts` | 修改 | `CommandResult` 拒绝原因为 `TextRef`，成功说明为 `TextRef` 或内容字符串；共享事件文字字段（`dialogue.line`、`dialogue.options_offered`、`player.said`、`feat.performed.note`、`xp.awarded.reason`）与 `AiContextV1` 的文字字段为 `TextParam` |
| 基础 | `src/core/engine.ts` | 修改 | 只改 `no_handler` 一行为 `tr('sys.core.reject.no_handler', ...)` |
| 基础 | `src/core/registry/registry.ts` | 修改 | 判断汉字的正则区间改写为转义（检测器，不是文字） |
| 基础 | `src/shared_ui/i18n.ts` | 新增 | `t`、`tSource`、`renderTextDeep`、`formatText`、`formatMoney`、内容查找 `contentTextLookup` 与 `setContentText`、缺键与缺参处理 |
| 基础 | `src/ai/prompt.ts`、`src/ai/runner.ts` | 修改 | 组装题面前按源语言渲染上下文里的 `TextRef` |
| 基础 | `src/client/hud/log_format.ts`、`conversation_box.ts`、`src/client/app/event_router.ts`、`src/client/adapters/social.ts` | 修改 | 日志、拒绝原因、气泡、对话框按 `t()` 渲染 |
| 基础 | `tools/i18n/scan_literals.ts`、`stringify_check.ts`、`golden_diff.ts`，`tests/i18n_kernel_guard.test.ts`、`tests/fixtures/i18n_ceiling.json`、`tests/playthrough/text_golden.playthrough.test.ts`，`locales/zh-Hans/sys_common.json`、`sys_core.json` | 新增 | 扫描器、隐式字符串化检查、金样比对、守卫与上限、金样采集、公共表 |
| B1 | `src/systems/dialogue/**`、`locales/zh-Hans/sys_dialogue.json`、`src/systems/dialogue/input_lexicon.json`、`tests/dialogue.test.ts` | 修改、新增 | 内容台词模板填充遇到 `TextRef` 变量时返回拼接引用，渲染结果与旧字符串相同 |
| B1 | `src/systems/cognition/**`、`sys_cognition.json`、`tests/cognition.test.ts`、`src/client/adapters/{combat,log,social}.ts`、`src/client/view/adapters.ts` | 修改、新增 | 传闻细节去重改用 `textEquals` |
| B1 | `src/systems/npc/**`、`sys_npc.json`、`src/systems/npc/trait_words.json`、`tests/npc.test.ts`、`src/editor/roles/role_model.ts` | 修改、新增 | 记忆、日记、日程、关系、题面全部为键 |
| B2 | `src/systems/city/**`、`sys_city.json`、`src/systems/city/settler_names.json`、`tests/city.test.ts`、`src/systems/modifiers/index.ts`（说明字段放宽）、`src/systems/economy/types.ts`（报价标签放宽）、`src/client/adapters/{domain,log}.ts`、`src/client/view/adapters.ts`、`src/editor/balance/econ_sim.ts`、`src/editor/inspector/inspector_ui.ts` | 修改、新增 | 放置受限的分类不再看文字前缀 |
| B2 | `src/systems/strategy/**`、`sys_strategy.json`、`tests/strategy.test.ts`、`src/client/windows/{strategy_model,strategy_window,battle_window}.ts`、`src/client/adapters/domain.ts`、`src/systems/warfare/{autoresolve,types,queries}.ts`（战役名放宽） | 修改、新增 | |
| B3 | `src/systems/warfare/**`、`sys_warfare.json`、`src/systems/warfare/trait_words.json`、`tests/warfare.test.ts`、`src/client/windows/{battle_model,battle_window}.ts`、`src/editor/balance/{war_sim,balance_ui}.ts` | 修改、新增 | |
| B3 | `src/systems/goddess/**`、`sys_goddess.json`、`src/systems/goddess/input_lexicon.json`、`tests/goddess.test.ts`、`src/client/adapters/social.ts`、`src/client/view/adapters.ts`、`src/editor/ledger/leak_review.ts` | 修改、新增 | 禁名判断改读女神卡的 `hiddenName` 与 `revealWhen` |
| B3 | `src/systems/economy/**`、`sys_economy.json`、`tests/economy.test.ts`、`src/client/windows/economy_windows.ts` | 修改、新增 | 市场状态改为代码加标签键 |
| B4 | `src/systems/{combat,party,world,modifiers}/**`、`sys_{combat,party,world,modifiers}.json`、对应测试、`tests/core.test.ts`、`src/client/adapters/combat.ts`、`src/client/hud/log_format.ts`、`src/client/windows/social_windows.ts` | 修改、新增 | |
| B4 | `src/systems/{quests,scenes,director}/**`、`sys_{quests,scenes,director}.json`、对应测试、`src/client/hud/scene_model.ts` | 修改、新增 | 命名效果的默认名改读场景输入的 `empty` 值 |
| B4 | `src/systems/{inventory,doors}/**`、`sys_{inventory,doors}.json`、`tests/doors.test.ts`、`tests/i18n_money_format.test.ts`，客户端五处 `formatMoney` 的导入 | 修改、新增 | 内核的 `formatMoney` 删除，改由 `src/shared_ui/i18n.ts` 提供 |
| 收尾 | `src/core/contracts.ts`、`src/systems/city/officials.ts`、`tests/client_log_format.test.ts` | 修改 | 拒绝原因收窄为 `TextRef` |
| 收尾 | `src/game/ai_roles/templates/*.ts`、`src/game/ai_roles/*.ts`、`src/game/autoplay/player.ts`、`tests/playthrough/harness.ts` | 新增、修改 | 角色包题面原样移入模板目录（组装结果逐字节相同）；自动玩家开发日志改英文 |
| 审查修复 | `src/core/text.ts`（`commandText`、`isTextRef` 只认作用域键）、`src/shared_ui/i18n.ts`（畸形参数不抛错）、`src/core/engine.ts`（`no_handler` 英文原文，删 `sys_core.json`）、`src/systems/{dialogue/index,npc/index,npc/plan,npc/schedule,npc/diary,goddess/index,scenes/runner}.ts` | 修改 | 模型文字存为 `{ raw, lang }`，模型给的文本键拒收，规则回退长句截断 |
| 审查修复 | `tests/i18n_kernel_guard.test.ts`、`tests/text_ref.test.ts`（新）、`tests/npc.test.ts`、`tools/gate/steps.ts`、`tests/gate.test.ts`、`src/editor/inspector/{inspector_ui,inspector_model}.ts`、`locales/zh-Hans/sys_common.json`（短日期、截断指令）、`tools/README.md`、`tests/README.md` | 新增、修改 | 守卫补缺口；隐式字符串化检查进全量门；检视器渲染后显示与搜索 |

**字面量计数与上限**

| 系统 | 迁移前 | 迁移后 | 批 |
| --- | --- | --- | --- |
| dialogue | 61 | 0 | B1 |
| cognition | 172 | 0 | B1 |
| npc | 182 | 0 | B1 |
| city | 311 | 0 | B2 |
| strategy | 198 | 0 | B2 |
| warfare | 109 | 0 | B3 |
| goddess | 128 | 0 | B3 |
| economy | 84 | 0 | B3 |
| combat、doors、quests、scenes、inventory、world、party、director、modifiers | 49、25、17、31、11、11、10、5、1 | 0 | B4 |
| `src/core` | 1（正则区间） | 0 | 基础 |
| `src/game`（模板目录除外） | 83 | 0 | 收尾 |

上限历史（`tests/fixtures/i18n_ceiling.json` 的 `src/systems`）：1406、990、481、160、0；`src/core` 始终 0；`src/game` 83 到 0。计数口径是含中日韩字符（汉字、全角标点与全角形式）的字符串、模板与正则字面量。

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 发行工程第 8.1 节 | 事件文字字段是 `TextRef` | 事件与视图里可能装内容显示名的字段用 `TextParam`（`TextRef` 或字符串）；命令成功说明也可是内容字符串；拒绝原因严格为 `TextRef` | 内容文本表在 PK-M0-15，之前内容名只能以字符串传；拒绝原因全部是内核写的 | 否 |
| 界面文档第 20.3 节 | 数字走 `{n, number}` | 迁移时一律 `{n}`（原样），格式化写法已实现但未用 | 本包要求渲染结果与旧字面量逐字节相同 | 否 |
| 发行工程第 8.2 节 | 客户端 `t` 在 `src/shared_ui/i18n.ts` | 同；另由 AI 层的 `src/ai/prompt.ts` 引用它按源语言渲染题面 | 题面固定用中文；渲染核心不碰 DOM | 否 |
| 发行工程第 8.4 节第 2 步 | 四类：拒绝原因、事件与模板句、默认名与标签、开发者文字 | 另有第五类"词表"：玩家输入关键词（问候、致谢、疑问、念神名时去标点）、与中文内容值比对的性格词、聚落居民名表，暂放系统旁的 JSON | 它们是数据而非显示文字，`data/` 本包不能动 | 是（何时迁入 `data/`） |
| 发行工程第 8.4 节第 5 步 | 金样哈希每批重录 | 不比原样哈希，改为渲染后再比，比原样哈希更严 | 见 [golden_report.md](golden_report.md) | 否 |
| 界面文档第 20.3 节 | `{d, date}`、`{d, date, short}` | 另支持 `{d, date, <样式键>}`，样式模板放各系统表（例 `sys.npc.time.label`）；`short` 按第 19.5 节短格式 | 旧字面量的日期写法各不相同 | 否 |
| 发行工程第 8.1 节 | 开发者文字不进字符串表 | `no_handler` 内部错误是英文原文 `{ raw: 'no handler for ...', lang: 'en' }` | 拒绝原因字段必须是 `TextRef` | 否 |
| 发行工程第 8.1、8.6 节 | 模型文字是 `{ raw, lang }` | 模型写进世界的台词、计划、日记、女神与场景台词存为原文加语言；`lang` 暂取源语言（1.0 只发简体中文，输出语言参数到 1.1 再接） | 内核不知道界面语言 | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `src/editor/inspector/{inspector_ui,inspector_model}.ts`、`balance/{balance_ui,econ_sim,war_sim}.ts`、`roles/role_model.ts`、`ledger/leak_review.ts` | 编辑器显示或扫描内核文字，需渲染；只改相关行 | 编辑器（内容管线代理也在动 `src/editor/**`） | 已改，汇报告知 |
| `src/game/ai_roles/**` | 题面模板移入 `templates/`，组装结果逐字节相同 | AI 层 | 已改，汇报告知 |
| `tools/gate/steps.ts`、`tests/gate.test.ts` | 隐式字符串化检查进全量门（按该表约定追加一条） | 发行工程 | 已改 |
| `docs/50_tech/release_engineering.md` 第 8.1 节、`docs/50_tech/implementation_conventions.md` 第 8 节 | 写明：事件与视图里可装内容显示名的字段是 `TextParam`；成功说明可为内容字符串；`commandText` 的规则；第五类"词表"；`{d, date, <样式键>}`；`sys.*.prompt.*` 键只按源语言渲染（翻译导出应跳过） | 文档代理 | 请求回写待落地 |
| `src/systems/modifiers/index.ts`、`src/systems/economy/types.ts`、`src/systems/warfare/*` | 跨批端口类型放宽（在各自批次内最终迁完） | 各系统 | 已改 |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 界面表迁 `ui.json`、键联合类型生成（`tr` 与 `t` 的键受类型约束）、伪本地化 `qps-wide` | PK-M0-15 |
| 内容文本表 `content.generated.json` 与 `tc`；内核把内容显示名从字符串参数换成 `{ key: 'c.<表>.<ID>.<字段>' }`；渲染器已能经 `setContentText` 解析 `c.` 键 | PK-M0-15 |
| 词表 JSON 迁入 `data/`（人设卡与将领卡加性格代码，玩家输入词表做成多语言并集） | 内容管线 |
| 城建临时效果的 `id` 现在是渲染为"种类:标签"的拼接引用，应换成代码 | 城建后续包（需重录金样） |
| 客户端尚未调用 `setContentText`：内核目前不发 `c.` 键，等内容键落地时在客户端会话装配处接上（`src/client/app/**` 由设置与平台包在改，本包未动） | PK-M0-15 |
| 缺参在开发构建只在控制台告警，界面上未标红 | PK-M0-15（伪本地化与文本检查一并做） |
| 认知"声望"查询原先按渲染后的中文分组与比较，现在按键分组，平票时取哪一条可能不同（只影响声望窗口，不进世界） | 认知后续包 |
| 窗口与键位核心、按揭示阶段取值的文本（第 20.4 节） | PK-M0-15 |
| `sys.*.prompt.*` 键只给题面用（`tSource` 按源语言渲染），翻译导出与伪本地化应跳过，或迁到单独的表 | PK-M0-15 |
| 模型输出语言：AI 层把界面语言作为题面参数并在命令里带回，`commandText` 按它打 `lang` 标签 | AI 层后续包 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 内核字段里的 `TextRef` 被模板字面量、拼接、`join` 或 `String()` 隐式变成 "[object Object]"，类型检查查不出 | 界面显示错字 | `node tools/i18n/stringify_check.ts` 全工程为 0，已并入全量门（`text_stringify` 步） |
| `TextRef` 是对象，按引用比较在存档读回后失效 | 读档后行为分叉 | 已知的比较改用 `textEquals`；`tests/replay_segments.test.ts` 与 `npm run playthrough` 的回放用例覆盖 |
| 渲染器的格式与旧字符串不一致 | 文字变化 | 金样渲染后逐字节比较；`tests/i18n_money_format.test.ts` 钉住金钱格式 |

**需用户决定**

| 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- |
| 词表 JSON 何时迁入 `data/` | 推荐随内容管线下一批 | 不阻塞 |
