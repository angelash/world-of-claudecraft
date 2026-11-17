# PK-M1-47 公会登记与委托板内核：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（遗留见 `progress.md`，无 BLOCKING） |
| 末次代码或内容变更 | 未提交；文件清单见 `progress.md` 第 2 节 |
| 完整实跑 | 2026-11-17，未提交的工作区（多个包并行改动中） |
| 审查 | 新起会话的覆盖面审查一次：1 条 BLOCKING、13 条 SHOULD-FIX、若干低项与测试缺口；已修与转遗留见第 3 节 |
| 遗留 | PK-M1-33、PK-M1-23、PK-M1-18 之后的委托包、任务模型的后续包，及 `progress.md` 列出的请求回写 |

## 1. 验收条目

| 序 | 验收 | 命令或评审 | 结果（原样要点与量化数字） | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 委托的实例化可复现 | `npx vitest run --config vitest.config.ts tests/guild.test.ts` 的 `is reproducible from the seed` | 同一种子跑 9 周的挂单逐字节相同，换种子不同；抽取只走 `guild.board.<板>` | `tests/guild.test.ts` | PASS |
| 2 | 事件的实例化可复现 | `tests/guild_events.test.ts` 的 `rolls its chance on its own stream` | 同一种子 40 日的落地日相同；每日至多一次掷骰（流 `guild.events`） | `tests/guild_events.test.ts` | PASS |
| 3 | 登记单测 | `tests/guild.test.ts` 的 `registration` 与 `takes a story write of guild_rank before any record as the registration` | 剧情登记为 F 级不收费；柜台登记要站在柜台前、收 100 铜、钱不够拒绝、重复拒绝、模型来源拒绝；剧情直接写 `guild_rank` 记为登记 | 同上 | PASS |
| 4 | 升级单测 | `tests/guild.test.ts` 的 `ranks` 与 `promotion` | E 级条件（卡面 Lv5、10 件 F 级、无违约）与自动晋升；考核级不自动；考核只升一级且其余条件须满足（D 到 C 要 30 实绩点）；实绩认定 F 到 B 并记"实"；剧情改级别时记录跟随 | 同上 | PASS |
| 5 | 事件密度在任务目录第 3 节的范围内 | `tests/guild_events.test.ts` 的 `measured density over twenty seeds`，另有仲裁的逐条用例 | 第一幕数据：20 个种子 60 件，每周 0.25 件；加压集合：2,015 件，每周 8.50 件，同聚落同时进行的严重事件至多 2、起点最小间隔 7 日、魔物潮最小间隔 14 日、预兆最少提前 3 日、同聚落同桥段每日至多 1 次 | `progress.md` 的实测表 | PASS |
| 6 | 公式与目录第 5.6 节一致 | `tests/guild.test.ts` 的 `commission formulas` | 9 个模板的报酬与经验逐个等于目录的数；难度分档、夹区间、紧急、抽成、违约金、递减、零经验差 | `tests/guild.test.ts` | PASS |
| 7 | 委托作为 `commission` 任务运行到报酬 | `tests/guild.test.ts` 的 `a commission from the board to the pay` 与 `the quests system instance seam` | 接、杀、交（板前与对话两条路）、报酬、经验（理由 `quest:<模板>`）、本周计数、抽成与付出、修正项、放弃与逾期扣违约金、告示板当场付款、存档往返后继续交付、旧存档无切片可读 | 同上 | PASS |
| 8 | 复用传闻、喜剧与导演引擎 | `tests/guild_events.test.ts` 的 `the rumor, comedy and director engines` 与 `in the whole game` | 登记的传闻进认知引擎由莉娜持有；同聚落同桥段当日不再落地、次日落地；导演在安静时选中莫伊拉的巧合并由内核结算，每幕一次（兴趣 2 以上两次）；全系统与旗标写入守卫下跑两周无错 | 同上 | PASS |
| 9 | 既有结局路线不变 | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts` | 末次改动后：`Test Files 2 passed (2)`，`Tests 2 passed (2)`，734 秒（审查前另跑一次同样通过，699 秒） | 第 2 节 | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 两个工程零错误 | PASS |
| 本包单测 | `npx vitest run --config vitest.config.ts tests/guild.test.ts tests/guild_events.test.ts` | 是 | `Tests 36 passed (36)`、`Tests 17 passed (17)` | PASS |
| 受影响的套件 | `npx vitest run --config vitest.config.ts tests/guild.test.ts tests/guild_events.test.ts tests/quests.test.ts tests/quest_model.test.ts tests/act_clock.test.ts tests/cognition.test.ts tests/director.test.ts tests/architecture.test.ts tests/content_id_guard.test.ts tests/i18n_kernel_guard.test.ts tests/i18n_ui_guard.test.ts tests/registry.test.ts tests/content_validation.test.ts tests/time_skip.test.ts tests/records.test.ts tests/records_save.test.ts tests/core.test.ts tests/save_renames.test.ts tests/save_migration.test.ts tests/text_ref.test.ts tests/scenes.test.ts tests/goddess.test.ts tests/docs_guard.test.ts tests/editor_quests.test.ts tests/client_adapters.test.ts` | 是 | `Test Files 1 failed, 24 passed (25)`；`Tests 1 failed, 480 passed (481)`；唯一失败见第 4 节 | PASS（基线除外） |
| 内容校验 | `node tools/content/validate.ts` | 是 | V1 到 V10 全绿（`all validators green`） | PASS |
| 注册表 | `node tools/registry/build.ts --check` | 是 | `vars.json is current`；`Tests 36 passed`，1 条失败见第 4 节 | PASS（基线除外） |
| 文本检查 | `node tools/i18n/check.ts` | 是 | `0 finding(s)` | PASS |
| 生成物新鲜度 | `node tools/i18n/gen_keys.ts --check`、`node tools/i18n/extract_content.ts --check` | 是 | 两者 current | PASS |
| 改动文件格式 | `npm run format -- <改动的 TS 与 JSON>` | 是 | 无剩余错误与告警 | PASS |
| 无模型通关（末次改动后） | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts` | 是 | `Test Files 2 passed (2)`，`Tests 2 passed (2)`，734 秒 | PASS |
| 全量本地门 | `npm run gate` | 否（多包并行中，由主会话统一跑） | | N/A |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 新起会话的覆盖面审查 | 一次贡献结束 | FAIL 后修复 | 1 | 13 | 已修：旧存档无切片时校验失败；告示板显示的所需级别；只有条件的事件每小时重复落地（每日至多一次，校验器要求一次性、概率、冷却或魔物潮）；边石分部的门槛让 E 级独自接 D（改为板的开放级别加带队者）；剧情先写 `guild_rank` 时记为登记；经验理由改为 `quest:<模板>`（第一幕追赶加成适用）；守夜改为到岗、守满、交班三段；预兆宣布前先查位置并预留，宣布后必到，按 tick 计满整日；过期挂单每小时撤下；紧急委托只上事件地图上的板、同板不重复、挂到事件当天；紧急加价随事件结束恢复；违约金由公会按实扣；零经验差与战斗同界；期限含接单当天；板前与柜台的位置检查；校验器补项（模板的幕有板、难度分档递增、紧急委托的板在事件的幕与地图上、加价须有持续、传闻话题）；补了对应用例。转遗留或记为决定：见 `progress.md` | 本会话 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npx vitest run --config vitest.config.ts tests/registry.test.ts` | `zero aliases in src/`：`src/client/audio/audio_world.ts` 的 `tension_high` | 失败文件属于音频 | PK-M1-06 |
| `npx vitest run --config vitest.config.ts` | `tests/art_manifest.test.ts`：未登记的用户图片 | 已知基线 | 素材 |
| 本包改动中途的一次 | `tests/architecture.test.ts` 的 `core/ has no DOM access`：重生成的 `text_keys.generated.ts` 含 `ui.set.controls.context.window` | 键属于设置界面的操作页；之后该键的负责方已处理，末次运行通过 | PK-M1-07 或设置界面的包 |
| 本包改动中途的一次 | `tests/i18n_ui_guard.test.ts`：`ui.audio.*` 不在第 20.2 节的元件类里 | 失败键属于音频；末次运行通过 | PK-M1-06 |
| 本包改动中途的一次 | `node tools/content/validate.ts` 的 V1（图集的音乐与环境声字段）与 V3（`disputes` 表的 `q_` 前缀） | 分属音频与 PK-M1-46；末次运行全绿 | PK-M1-06、PK-M1-46 |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 实际游玩里的登记与第一批委托 | A1-M03、A1-M04 的数据还没有接上 `registration.when` 与 `firstIn` 的口径（现有数据写 `a1_guild_registered`，已能触发剧情登记） | PK-M1-33 导入时由通关路线覆盖 |
| 委托板窗口 | 窗口与 `BoardAdapter` 未接 | PK-M1-23 |
