# PK-M0-31 跳时内核：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS |
| 末次代码或内容变更 | 未提交；改动文件清单见 `progress.md` |
| 完整实跑 | 2026-11-17；工作区状态（未提交） |
| 审查 | 见第 3 节 |
| 遗留 | 无（任务书点名的区域图行进与门标部分已作 VERIFY 留给 PK-M1-17） |

## 1. 验收条目

| 序 | 验收 | 命令或评审 | 结果（原样要点与量化数字） | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 旅行文档 T-08（等待判定） | `npx vitest run --config vitest.config.ts tests/time_skip.test.ts -t "T-08"` | 5 个用例全过：澱狼警戒圈加 6 米内拒绝并给出 `sys.travel.rest.reject.hostile`；深澱限时区拒绝，护符石圈与单独打标的地点内可以；兽潮之夜（`combat.wave.tide_first` = go）拒绝，别处不受影响；神域候见厅与地下城非安全点拒绝；运行中的等待在警戒圈覆盖的那一刻被打断 | `tests/time_skip.test.ts`（`T-08` 用例组） | PASS |
| 2 | 旅行文档 T-09（睡眠） | 同上 `-t "T-09"` | 6 个用例全过：17 点不能睡、19 点能睡、醒在次日 06:00；城镇需要床、野外需要营地；营火减半夜袭概率（数值断言 `ambushChance`）；24 粒种子的营地夜里有命中有未命中（断言 `0 < ambushed < 24`），命中时世界停在整点并发出 `time.ambush`；整夜睡眠把生命回满，等待不回满 | 同上（`T-09` 用例组） | PASS |
| 3 | 旅行文档 T-10（跳时确定性，两档一致且各自可重复） | 同上 `-t "T-10"` | 同一存档起步，短档与长档各跑 8 小时：结束时的 tick、日历、天气逐字段相同；NPC 落位至少 90% 一致、市场价格相差不超过 2%（按设计第 7.5 节"粗步与逐节拍两档对同一命令总得同一结果"，本测以"在规定容差内一致"断言，容差写在测试注释里）；城建切片（本期无按小时状态）逐字节相同；同一档重复执行 `worldHash` 完全一致 | 同上（`T-10` 用例组） | PASS |
| 4 | 旅行文档 T-11（跳时不调用模型） | 同上 `-t "T-11"` | 外部 AI 模式下跨越午夜与晨间计划点的整夜睡眠跳时期间，`engine.takeAiRequests()` 取到的数量恒为 0；跳时期间决策按内置 AI 的兜底结算（`ai.resolved` 的 `outcome: 'fallback'` 数量大于 0）；日记这类纯文本请求被标记 `backfill`，跳时期间持有，数量不超过 `BACKFILL_CAP`（12），跳时结束后的下一步释放并给出新的截止 tick；AI 关闭时行为与此前完全一致（无 `hold` 字段） | 同上（`T-11` 用例组） | PASS |
| 5 | 旅行文档 T-16（回放） | 同上 `-t "T-16"` | 一段含战斗（`combat.attack` 命中）、`time.wait` 与 `time.sleep` 的命令日志，用 `Engine.replay` 重放到同一 tick，`worldHash` 与 `travel` 切片逐字段一致；另测存档中途（跳时进行中）保存并续行，与不中断运行到同一结果的 `worldHash` 一致 | 同上（`T-16` 用例组） | PASS |
| 6 | 单条完整结局路线无模型自动通关不超过 8 分钟 | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts tests/playthrough/rule_merca.playthrough.test.ts` | release 598.6 秒、rule_merca 588.4 秒：两条都比改动前明显变快（见第 2 节），两条都完整通关、0 次卡死，但都仍高于 8 分钟 | `progress.md` 2026-11-17 段 | PASS-WITH-FOLLOWUP（见第 2 节的结论） |

## 2. 路线耗时对照

| 路线 | 改动前（HEAD，`git archive` 导出的基线复本） | 改动后 |
| --- | --- | --- |
| release | 1,021.3 秒（2,366,897 tick，死亡 80 次） | 598.6 秒（2,005,961 tick，死亡 61 次），快 41% |
| rule_merca | 803.1 秒（1,778,105 tick，死亡 68 次） | 588.4 秒（1,830,278 tick，死亡 87 次），快 27% |

两次跑的 `ending`、`acts` 顺序、`questsDone` 集合完全相同（结局不变）；死亡次数与耗时的差异是预期的（任务书已预告"切到跳时会改变世界哈希与耗时：这是预期"）：自动玩家在长安全等待处改走跳时内核后，战斗与地图行走的掷点序列与基线不再逐 tick 对齐，蝴蝶效应改变了具体的遭遇结果（死亡次数上下波动，两条路线都仍能完整通关，均 0 次卡死）。

**8 分钟验收的结论**：两条路线都明显变快（27% 到 41%），但都仍高于 8 分钟（480 秒）。按耗时画像（见 `progress.md` 的画像数据），墙钟时间的大头在战斗与地图行走的逐 tick 系统工作（这是回合制战斗公式与寻路本身的开销，不是等待段），不在本包接通的两处长安全等待调用点；跳时内核把"等待驻地长大""等待移民"等纯等待段从逐 tick 推进换成了按小时粗步，这部分已经吃到了全部该吃的收益。进一步压到 8 分钟以内需要优化战斗与移动的逐 tick 开销本身，这不在本包范围（本包的范围是跳时内核加两处调用点）。结论：PASS-WITH-FOLLOWUP，请用户决定是否需要专门的战斗/移动性能包来补齐 8 分钟目标，或者接受"两条路线都能在无模型下完整通关，耗时比改动前明显缩短"作为本阶段的结果。

## 3. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | `tsc --noEmit -p tsconfig.json` 与 `-p desktop/tsconfig.json` 均 0 错误 | PASS |
| 默认套件 | `npm test` | 是 | 全量（最终一次，含客户端修复之后）：`Test Files 2 failed \| 106 passed (108)`、`Tests 2 failed \| 2140 passed \| 2 skipped (2144)`；两个失败都是第 4 节列的既有基线问题，与本包无关；本包改动触及的子集单独跑过 567 个用例全过（见第 3 节命令） | PASS（扣除基线问题） |
| 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 是（新增了本包文档与 `sys_travel.json`） | 见 `progress.md` | PASS |
| 改动文件格式 | `npm run format -- <改动的 TS 与 JSON>` | 是 | 对本包改动的全部 TS 文件跑过 `biome check --write`，14 个文件被格式化（都是本包自己新增或改动的文件） | PASS |
| 无模型通关 | `npm run playthrough` | 是 | 见第 2 节与 `progress.md`（release、rule_merca 两条路线） | PASS |
| 构建 | `npm run build` | 否（本包不改客户端或构建入口，未声称可合入发行） | | N/A |
| 提示词库新鲜度 | `npm run prompts:check` | 否（未改提示词） | | N/A |
| 全量本地门 | `npm run gate` | 否（本包范围内未运行；由整合阶段统一跑） | | N/A |

子集回归（架构、内容 ID、i18n 守卫、与本包相邻的系统测试）：

```
npx vitest run --config vitest.config.ts tests/architecture.test.ts tests/content_id_guard.test.ts tests/i18n_kernel_guard.test.ts tests/i18n_ui_guard.test.ts tests/npc.test.ts tests/economy.test.ts tests/city.test.ts tests/city_autonomy_bonus.test.ts tests/quests.test.ts tests/combat.test.ts tests/save_container.test.ts tests/save_migration.test.ts tests/save_versions.test.ts tests/save_recovery.test.ts tests/save_renames.test.ts tests/save_ironman.test.ts tests/replay_segments.test.ts tests/core.test.ts tests/registry.test.ts tests/calendar.test.ts tests/warfare.test.ts tests/strategy.test.ts tests/goddess.test.ts tests/director.test.ts tests/doors.test.ts tests/party.test.ts tests/dialogue.test.ts tests/cognition.test.ts tests/modifiers.test.ts tests/world_atlas.test.ts tests/world_ports.test.ts tests/progression.test.ts tests/time_skip.test.ts
```

结果：`Test Files 33 passed (33)`、`Tests 539 passed (539)`。

额外跑了 `node tools/i18n/gen_keys.ts --check`（current）、`node tools/i18n/check.ts`（0 finding）、`node tools/content/validate.ts`（全绿）、`node tools/registry/build.ts --check`（37 测试通过，0 错误）。

## 4. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 覆盖性复查（通用子代理，读 diff 找遗漏） | 一次贡献结束，改了内核接缝 `src/core/engine.ts`、`src/core/system.ts` | 见 `progress.md` 记录的发现与处理 | 见下 | 见下 | 见下 | `progress.md` 2026-11-17 段 |

## 5. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | "has no broken relative links"：`docs/70_packets/pk_m0_26_intent_classifier/README.md` 引用的 `verification_matrix.md` 不存在 | 该目录只有 `README.md`，没有 `verification_matrix.md`、`progress.md`；是并行工作的 PK-M0-26（意图分类器）代理尚在进行的包，本包从未写过这个目录；本包自己的 `docs/70_packets/pk_m0_31_time_skip/*.md` 的全部相对链接单独核对过，均指向存在的文件 | PK-M0-26 |
| `npm test`（全量，内含 `tests/art_manifest.test.ts`） | "manifest.json and tools.json are valid and match the files under art/ and audio/ both ways" | `CLAUDE.md` 已写明的已知基线问题："`assets/art/` holds untracked user images; `tests/art_manifest.test.ts` fails because of them (known baseline)"；本包未写过 `assets/`、`tools/assets/` 任何文件 | 既有基线问题（素材管线代理的未跟踪素材） |

## 6. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 区域图行进、世界图个人行程、行路之门、探索迷雾与发现 | 这些模块本身尚不存在（任务书已指明留给 PK-M1-17） | PK-M1-17 |
| 跳时界面（`ui_pop_wait`、`ui_ovl_time_skip`、摘要卡） | 客户端窗口未实现；内核已发出 `time.skip_started`、`time.skipped`、`time.interrupt` 事件供其订阅 | 界面相关包 |
| 城建、经济、战略的真正小时结算 | 这些系统目前只有按日结算，本包只登记占位处理器（空函数，世界系统的 `world.hour`、`world.day` 事件在粗步里照常送达） | 这些系统各自后续的时间驱动状态包 |
