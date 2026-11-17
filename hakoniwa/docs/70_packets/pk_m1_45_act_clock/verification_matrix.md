# PK-M1-45 幕时钟与周窗触发：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS |
| 末次代码或内容变更 | 未提交；改动文件清单见 `progress.md` |
| 完整实跑 | 2026-11-17；工作区状态（未提交，与 PK-M1-58 同一工作区） |
| 审查 | 新起子代理的覆盖性复查一次（与 PK-M1-58 合并审），结论与处理见第 3 节 |
| 遗留 | 见 `progress.md` 的"留给后续包的事项" |

## 1. 验收条目

| 序 | 验收 | 命令或评审 | 结果 | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 第一幕第 1.2、7.3 节的时间线有单测 | `npx vitest run --config vitest.config.ts tests/act_clock.test.ts` | "the act 1 timeline" 组 8 条：幕开始 `act_week` 1，每个周首 `seal_unrest` +9（10、19、28 到 91）；无行动时钳制在第 10 周暗月夜（`forced`）；落门与巨鸦（+5、+10）为默认的第 10 周；矿道（+10）提前到第 9 周；第 6 周就到 100 仍等第 8 周（最早钳制）；第 9 周暗月夜当晚开门的 +3 计入当夜；堵暗渠与送回澱晶（-5、-5）拖到第 10 周钳制；兽潮已过（`a1_beast_tide_cleared`）则夜规则作废、每周增长停止；另有节拍表（落地 1 到 5、暗面 6 到 9、高潮 10、拉远 11 到 12）与各幕周数 12、14、24、31、33、26 的单测 | `tests/act_clock.test.ts` | PASS |
| 2 | 20 个种子的兽潮夜都在第 8 到 10 周的暗月夜 | 同上，"acceptance: 20 seeds" | 每个种子以命名的 `Rng` 生成序章时长（0 到 13 天，可在历法周中间开幕）与第 7.3 节的来源时间表（落门、巨鸦、矿道、碎门坡、开门若干、堵暗渠、送回澱晶、接手澱晶生意），20 个种子都恰好触发一次，且都在 20 点、暗月日、幕内第 8 到 10 周，与测试里独立写的参考模型逐 tick 一致；兽潮周数在种子之间不止一种 | 同上 | PASS |
| 3 | 由历法算出 `act_week`，写成旗标；跨周首逐 tick 与按小时跳时一致 | 同上，"the clock across skips, ticks, acts and saves" | 逐 tick 与按小时步进跨周首结果相同，`act.week` 事件都在周首那一 tick；真实游戏里 `time.skip` 长跳与逐 tick 两种方式都在下一历法周首把旗标 `act_week` 写成 2（`flag.changed` 的 tick 等于周首）；幕在周中开始时第 1 周到该历法周末；换幕重新从 1 计，终章置 0；存档续玩与不中断运行世界哈希一致 | 同上 | PASS |
| 4 | 任务条件增加周窗与历法项 | 同上，"week windows and calendar terms" | `weekWindow` 3 到 4 的任务第 3 周首开始、窗外不开；带 `weekWindow` 的发布任务窗外不再提供、`quests.accept` 被拒；`dark_moon AND act_week >= 2` 在第 2 周暗月夜日落开始 | 同上 | PASS |
| 5 | 自动玩家读同一个时钟 | 同上，"the autoplayer reads the same clock" | `clockExtras` 与内核历法项一致；`windowOpenIn` 与内核周窗一致；`clockWait` 等到时钟的下一个事件或下一个整点；三条自动玩家路线通过（第 2 节） | 同上；`progress.md` | PASS |
| 6 | `act.<幕号>.entered`（PK-M1-16 的整合请求） | 同上 | 进入一幕写本幕及之前各有幕时钟的幕，跳幕补写；真实游戏经注册表守卫写入 | 同上 | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 退出码 0 | PASS |
| 默认套件 | `npm test` | 是 | `Test Files 1 failed \| 127 passed (128)`、`Tests 1 failed \| 2491 passed \| 2 skipped`；唯一失败 `tests/art_manifest.test.ts` 是第 4 节的基线问题 | PASS（扣除基线） |
| 相关子集 | `npx vitest run --config vitest.config.ts tests/act_clock.test.ts tests/quests.test.ts tests/time_skip.test.ts tests/save_*.test.ts tests/replay_segments.test.ts tests/architecture.test.ts tests/content_id_guard.test.ts tests/i18n_kernel_guard.test.ts tests/i18n_ui_guard.test.ts tests/calendar.test.ts tests/registry.test.ts tests/content_validation.test.ts tests/editor_quests.test.ts tests/scenes.test.ts tests/director.test.ts tests/core.test.ts tests/records*.test.ts tests/world_mechanics.test.ts tests/content_base_rebase.test.ts tests/goddess.test.ts` | 是 | 26 个文件 483 个用例全过（修复前一次）；修复后由全量套件覆盖 | PASS |
| 数据门 | `node tools/content/validate.ts` | 是 | V1 到 V10 全绿（含 V9 可达性） | PASS |
| 注册表 | `node tools/registry/build.ts --check` | 是 | `vars.json is current`，退出码 0 | PASS |
| 文本 | `node tools/i18n/check.ts` | 是 | 0 finding | PASS |
| 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 是 | 11 passed | PASS |
| 格式 | `npm run format -- <改动的 TS 与 JSON>` | 是 | 本包文件无告警 | PASS |
| 自动玩家路线 | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts tests/playthrough/rule_merca.playthrough.test.ts` | 是（任务书指定的三条） | 见 `progress.md` 的末次实跑 | PASS |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 覆盖性复查（新起子代理，只读） | 一次贡献结束 | PASS-WITH-FOLLOWUPS | 0 | 本包相关 3 条：无幕时钟的幕不重置 `act_week`；循环里的幕效果换幕后旧幕事件继续；`acts` 表缺失时 `markEntered` 会抛 | 三条都已修并补测（终章置 0 的断言；循环内换幕即停；`?? []`）；"旧存档没有时钟状态会从第 1 周重计"记为遗留（M2 起才有存档兼容承诺）；兽潮夜未接到 A1-M12 记为 PK-M1-33 的遗留 | `progress.md` 2026-11-17 段 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npm test` | `tests/art_manifest.test.ts`（清单与 `assets/art/` 不一致） | 任务书已注明：`assets/art/` 有用户未跟踪的图片 | 用户素材，非本包 |
| `npx tsc --noEmit -p .` | `tools/audio_gen/score.ts` 的隐式 any | 未跟踪的 `tools/audio_gen/` 属于别的工作；`npm run typecheck` 不含它，退出码 0 | 另一代理 |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 兽潮夜触发真实的兽潮任务 | 第一幕任务尚未按设计重导（`q_a1_m12_tide` 仍以审判完成开始） | PK-M1-33 |
