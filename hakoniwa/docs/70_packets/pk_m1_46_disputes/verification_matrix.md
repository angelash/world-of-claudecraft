# PK-M1-46 纷争链运行器与第一幕自走：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（全部验收 PASS；遗留转去的包见 `progress.md`） |
| 末次代码或内容变更 | 未提交；改动文件清单见 `progress.md` |
| 完整实跑 | 2026-11-17；工作区状态（未提交，与 PK-M1-45、PK-M1-58 及其他并行包同一工作区） |
| 审查 | 新起子代理的覆盖性复查一次，修复后同一审查者复核一次（结论与处理见第 3 节） |
| 遗留 | 见 `progress.md` 的"留给后续包的事项" |

## 1. 验收条目

计划包行验收栏："无头运行 20 个种子，每条 Must 纷争走到合法结局、无死锁；玩家介入可改变结局"；路线图第 5.3 节 VS-08 的第一幕部分（每条 Must 纷争至少触达两个不同结局；幕末世界状态变量全部写入）。

命令：`npx vitest run --config vitest.config.ts tests/disputes.test.ts`（33 passed）。

| 序 | 验收 | 用例（`tests/disputes.test.ts`） | 结果要点 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 无头运行 20 个种子，三条 Must 纷争走到合法结局、无死锁 | `acceptance: 20 seeds with no player` 第一条 | 种子 1 到 20，开幕日随机推迟 0 到 13 天，`seal_unrest` 另有随机增量（兽潮落在第 8 周 8 次、第 9 周 4 次、第 10 周 8 次）；每条纷争都在第 11 周首之前结算；每个决策点都已决定或作废；没有悬而未决的决策；结局落在合法结局表内；链任务由他人先完成 | PASS |
| 2 | 不介入时的结局与正典一致 | 同上 | 税与匪 20 次南逃（`moss_cart = flee_south`、`viro_raid = raid_farm`）；魔女审判 20 次审判成立（`isa_testify = keep_silent`、`cassian_verdict = convict`，`church_suspicion` 15）；林地之争 20 次冲突升级（`gorn_council = stay`、`boro_revenge = blood_debt`）。林地之争在兽潮夜当刻结算；莫斯兽潮夜之前在任、之后南逃；欧拉兽潮夜之前已定罪 | PASS |
| 3 | 幕末世界状态变量全部写入 | `expectSettledLegally`（所有验收用例） | 税与匪：`a1_moss_fate`、`a1_dian_trade`、`a1_oneeye_fate`、`a1_old_watch`、`a1_viro_status`、`a1_tax_rate`；魔女审判：`a1_oola_fate`、`a1_cassian_report`；林地之争：`a1_shiya_family`、`a1_forest_accord`；另有 `dispute.<任务>.ending`、`.by` | PASS |
| 4 | 真实游戏全系统、注册表守卫开启也一样 | `runs the same in the real game ...` | `createGame` 加整点时钟，所有系统，`flagPolicy: throw`；到第 11 周三条纷争的结局与无头运行一致；纷争系统排在任务系统之后 | PASS |
| 5 | 玩家介入改变结局：税与匪 | `tax and bandits` 两条 | 护送欧文后他不在第 6 周末离开；三件证据加对质：揭发（被拘、十取一、灰晶停、收回许可、平民声望 +30），链任务完成并发 600 经验；收编加截车：留任且收编叠加，链任务完成；只截车：留任但不发经验 | PASS |
| 6 | 玩家介入改变结局：魔女审判 | `witch trial` 五条 | 泉水加伊莎信任 70：伊莎作证、卡西安平反（怀疑 2、周报平反），完成并发 550 经验；只有泉水：伊莎沉默、审判成立；贿赂：`bribed`、周报 `unresolved`、不发经验，并使莫斯留任（跨链咬合）；劫狱：隐匿；主线审判任务进行中：运行器的裁决等场景，不重复定罪、不加教会怀疑 | PASS |
| 7 | 玩家介入改变结局：林地之争 | `forest dispute` 四条 | 林约、狼巢、救伐木工：和解（两个决策点作废），完成并发 400 经验；只有林约：葛恩留下、部分和解；站伐木工一边：驱逐、不发经验；镇上敌视东坡：葛恩自己东迁 | PASS |
| 8 | 每条 Must 纷争至少触达两个不同结局（VS-08） | `reaches at least two different endings ...` | 一跑不介入、一跑介入：税与匪 `fled`、`in_power`；魔女审判 `convicted`、`cleared`；林地之争 `broken`、`partial` | PASS |
| 9 | 决策点可被 NPC 大脑调用（接缝） | `the NPC brain answers ...`；`takes a chooser answer ...` | `openDecisions` 按人列出；`disputes.decide`（系统来源）在截止前作答即生效（`source: chooser`）；玩家来源、坏选项、无此决策都拒绝；`decisionMenu` 给出合法菜单与规则效用 | PASS |
| 10 | 运行器机制 | `the runner` 九条 | 阶段与升级档；到周开启、到点兜底（截止落在非轮询 tick 时当 tick 兜底）；`after` 接续与连带作废；窗内条件开启；提前结算与玩家促成；条件阶段覆盖；幕结束强制结算；存档中途读回与不间断运行世界哈希一致；逐 tick 路径 | PASS |
| 11 | 决策效用与结局选择 | `the decision utility`、`outcome selection` | 四项权重 0.35、0.25、0.20、0.15（满分 0.95），违背必须保持 -100；写定项裁剪菜单；同分按 ID；带内抽取只用给定的流 | PASS |
| 12 | 内容校验 | `the content checks` 两条 | 发行数据 0 问题；默认结局缺失或多于一个、全条件菜单、`after` 指向后面的点、未知人物、升级档越界、跨度越界、坏名段、名长超 64、结算周越界、链任务缺 `byOther`、非纷争链都报出 | PASS |
| 13 | 按周默认发展与运行器同周协作 | `the act clock and the chains together` | 第 1 到 7 周的默认步骤与写入、第 6、7 周的决策点、跳时两天内葛恩的决定 | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 本包文件 0 错误；同时存在的错误都在他包正在改的 `src/systems/guild/`、`src/client/audio/` | PASS（扣除他包） |
| 相关套件 | `npx vitest run --config vitest.config.ts tests/disputes.test.ts tests/quests.test.ts tests/act_clock.test.ts tests/quest_model.test.ts tests/brain.test.ts tests/architecture.test.ts tests/content_id_guard.test.ts tests/i18n_kernel_guard.test.ts tests/i18n_ui_guard.test.ts tests/content_validation.test.ts tests/director.test.ts tests/scenes.test.ts tests/goddess.test.ts tests/registry.test.ts tests/docs_guard.test.ts tests/editor_registry.test.ts tests/editor_checks.test.ts tests/editor_quests.test.ts tests/core.test.ts tests/save_container.test.ts` | 是 | `Test Files 1 failed \| 19 passed (20)`、`Tests 1 failed \| 435 passed (436)`；唯一失败见第 4 节 | PASS（扣除他包） |
| 默认套件 | `npm test` | 是 | `Test Files 2 failed \| 139 passed (141)`、`Tests 2 failed \| 2845 passed \| 2 skipped (2849)`；两项失败见第 4 节 | PASS（扣除基线与他包） |
| 数据门 | `node tools/content/validate.ts` | 是 | V1 到 V10 全绿 | PASS |
| 注册表 | `node tools/registry/build.ts --check` | 是 | `data/registry/vars.json is current (720 names, 123 families, 38 quest ids, 4 skipped rows)`；随后附带的 `tests/registry.test.ts` 一项失败见第 4 节 | PASS（扣除他包） |
| 文本 | `node tools/i18n/check.ts`；`node tools/i18n/extract_content.ts --check` | 是 | `text check: 0 finding(s)`；内容文本表为最新 | PASS |
| 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 是 | 11 passed | PASS |
| 改动文件格式 | `npm run format -- <改动的 TS 与 JSON>` | 是 | 已格式化 | PASS |
| 自动玩家路线 | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts` | 是 | 末次代码变更之后：`Test Files 2 passed (2)`、`Tests 2 passed (2)`，`Duration 807.74s`，退出码 0（第一幕最短路线到第二幕、真结局路线到终章；两条路线都在第 3 周打完兽潮，三条纷争随兽潮清理结算） | PASS |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 覆盖性复查（新起子代理，只读） | 一次贡献结束 | FAIL（修复前） | 2：测试文件的类型导入；无人到场的审判与主线光之鉴争写 `a1_oola_fate` | 11 | 全部处理或转去指名的包（逐条见 `progress.md` 的"复查发现与处理"）；主线 A1-M09 的重导与场景分支转 PK-M1-33 | `progress.md` 2026-11-17 段 |
| 同一审查者复核修复 | 修复之后 | PASS-WITH-FOLLOWUPS | 0 | 1：玩家第 8 周前还没开始 A1-M09 时场景仍会改写定罪（已转 PK-M1-33） | 另提醒兽潮结算按结局代号判定冲突升级的伤亡（已写进 `progress.md` 的 PK-M1-52 一行）；冲台在现有内容下到不了（正典默认时序，已在用例中写明）；计划范围栏回写由主会话做 | 同上 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npm test` | `tests/art_manifest.test.ts` | 已知基线（用户的未跟踪美术） | 用户 |
| `npm test`、`node tools/registry/build.ts --check` | `tests/registry.test.ts` 的 "write and read canonical names only"：`src/client/audio/audio_world.ts` 的 `tension_high` | 失败文件属于 PK-M1-06 正在改的音频 | PK-M1-06 |
| `npm run typecheck` | `src/systems/guild/`、`src/client/audio/` 的类型错误 | 失败文件属于 PK-M1-47、PK-M1-06 | PK-M1-47、PK-M1-06 |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 节点任务驱动的介入 | 节点任务还不存在，介入用例写的是节点任务的产物变量 | PK-M1-33 落地时各加一条走真实节点任务的用例 |
| 人设驱动的决策 | NPC 大脑还不存在，决策用数据里的规则效用 | PK-M1-18 |
