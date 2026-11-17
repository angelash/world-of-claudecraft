# PK-M1-48 事迹、称号、图鉴与传书内核：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（遗留见 `progress.md`，无 BLOCKING） |
| 末次代码或内容变更 | 未提交；文件清单见 `progress.md` 第 2 节 |
| 完整实跑 | 2026-11-17，未提交的工作区（多个包并行改动中） |
| 审查 | 新起会话的总闸式审查一次：16 条，修 12 条，其余转遗留（第 3 节） |
| 遗留 | PK-M1-23、PK-M1-32、PK-M1-45、PK-M1-14、PK-M2-02，及新包"事迹的认知触发与立名" |

## 1. 验收条目

| 序 | 验收 | 命令或评审 | 结果（原样要点与量化数字） | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 授予单测：条件、计数、曾持有、见过、手动、模型边界、入册等级、称号的授予失去与佩戴、记事柱、事迹簿 | `npx vitest run tests/records.test.ts` | `Tests 24 passed (24)` | 本节；`tests/records.test.ts` | PASS |
| 2 | 发现单测：人物、魔物（交手与击杀）、物品、书、收藏、回想、生灵、图鉴条目 | 同上 | 含在上行的 24 条内（`the codex` 两组） | 同上 | PASS |
| 3 | 投递单测：即时送达、寄出时冻结段落、在途小时、读信、回信、收附件、跳时粗步里送达 | 同上 | 含在上行的 24 条内（`letters`、`time skips and replays`） | 同上 | PASS |
| 4 | 存档往返：存读后世界哈希一致、继续运行与不中断一致（含在途的信）、旧存档补建、内容更新后重查、改名、切片校验、伯爵来信五种措辞 | `npx vitest run tests/records_save.test.ts` | `Tests 14 passed (14)` | `tests/records_save.test.ts` | PASS |
| 5 | 重放：命令日志重放到同一世界 | `tests/records.test.ts` 的 `a replay of the command log reaches the same world` | 世界哈希一致 | 同上 | PASS |
| 6 | 只记名：事迹与称号的记录不得带数值 | `validateRecords` 字段白名单；`changes nothing outside the records and their own mirrors when it grants` | 授予前后，records 切片与自身镜像之外的切片与旗标逐字节相同 | `tests/records.test.ts` | PASS |
| 7 | 既有结局路线不变（本包只写自己的镜像） | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts` | `Tests 1 passed (1)`，1681 秒；另一条路线未跑（按派发只跑 release 一条） | 本文第 2 节 | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 两个工程零错误 | PASS |
| 受影响的套件 | `npx vitest run tests/records.test.ts tests/records_save.test.ts tests/architecture.test.ts tests/content_id_guard.test.ts tests/i18n_kernel_guard.test.ts tests/i18n_ui_guard.test.ts tests/content_validation.test.ts tests/registry.test.ts tests/save_migration.test.ts tests/save_container.test.ts tests/save_recovery.test.ts tests/save_renames.test.ts tests/save_versions.test.ts tests/save_ironman.test.ts tests/replay_segments.test.ts tests/core.test.ts tests/docs_guard.test.ts` | 是 | `Test Files 17 passed (17)`，`Tests 313 passed (313)` | PASS |
| 默认套件 | `npx vitest run --config vitest.config.ts` | 是 | `Test Files 1 failed, 123 passed (124)`；`Tests 1 failed, 2401 passed, 2 skipped`；唯一失败是基线 `tests/art_manifest.test.ts`（第 4 节） | PASS（基线除外） |
| 内容校验 | `node tools/content/validate.ts` | 是 | V1 到 V10 全绿（`all validators green`） | PASS |
| 注册表 | `node tools/registry/build.ts --check` | 是 | `vars.json is current`；`Tests 37 passed (37)` | PASS |
| 文本检查 | `node tools/i18n/check.ts` | 是 | `0 finding(s)` | PASS |
| 生成物新鲜度 | `node tools/i18n/gen_keys.ts --check`、`node tools/i18n/extract_content.ts --check` | 是 | 两者 current | PASS |
| 改动文件格式 | `npm run format -- <改动的 TS 与 JSON>` | 是 | 无剩余告警 | PASS |
| 无模型通关 | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts` | 是（只跑 release 一条） | `Tests 1 passed (1)`，1681 秒 | PASS |
| 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 是 | 含在受影响的套件里 | PASS |
| 全量本地门 | `npm run gate` | 否（多包并行中，由主会话统一跑） | | N/A |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 新起会话的审查（覆盖面） | 一次贡献结束 | PASS-WITH-FOLLOWUPS | 0 | 10 | 已修：传书与失去称号的镜像变化不唤醒结算、读档不按新内容重查、旧存档图鉴为空、结算轮数用尽丢链、未得事迹显示名字、失去的称号读不出、魔物只在击杀时记下、模型来源能操作玩家的簿、切片校验缺项、注册表行（`player.title` 默认值、第 2.3 节）；并补了对应用例。转遗留：扩建后 12 格、自由书写回信与非物品附件、`act_week` 的写入方、名望的档与"未记之事" | 本会话 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npx vitest run --config vitest.config.ts` | `tests/art_manifest.test.ts`：`assets/art/` 下有未登记的用户图片 | 已知基线（开工前即失败） | 素材 |
| 同上（本包改动早期的一次全量） | `tests/time_skip.test.ts` 的野外夜袭概率：`forest_edge` 的 `sediment` 被世界方从 2 改为 1 | `git diff data/combat/maps/forest_edge.json` | PK-M1-16 |
| 同上（同一次） | `tests/content_id_guard.test.ts`：`src/systems/doors/` 写了 `'prologue'` | 失败文件属于千门 | PK-M1-14 |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 伯爵来信在实际游玩里寄出 | `act_week` 还没有写入方 | PK-M1-45 落地后由该包的通关路线覆盖 |
