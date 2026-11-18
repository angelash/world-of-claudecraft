# PK-M1-41 音频 M1：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PARTIAL（本轮目标"候选池接进游戏"已达到：729 条暂定采用、导入、开发版可播；计划包行的验收"`assets:check` 的响度、真峰值、循环点全过；声音巡游无缺失与可听接缝"未达，199 条在 `rework`，原因见 `progress.md` 第 3 节） |
| 末次改动 | 未提交；工作区状态（与他包并行的同一工作区） |
| 完整实跑 | 2026-11-18 |
| 审查 | 新起子代理的覆盖性复查一轮，发现与处理见第 5 节 |
| 建议状态 | 计划状态列保持"进行中" |

## 1. 验收条目

| 序 | 条目 | 命令与结果 | 状态 |
| --- | --- | --- | --- |
| 1 | M1 的 726 条都有原文件与 `review` 记录，采用经审核台代码 | 采用脚本只调用 `tools/assets/review/store.ts` 的 `adopt`；`assets/manifest.json` 有 729 条音频记录（M1 726，M2 3）；`assets/review_log.jsonl` 每次采用一行；备注写明规则号与"未试听" | PASS |
| 2 | 导入与校验 | `npm run assets:import`（分七组并行跑，全部记录都有处理结果）；`npm run assets:check -- --mark`；末次 `npm run assets:check`：`946 record(s), 0 error(s), 0 stale, 371 failing check(s): not ok` | 部分：0 错误、0 过时；371 条校验不过（音频 199 条记录，美术 1 条） |
| 3 | 响度、真峰值、循环点全过（计划包行验收） | 音频 530 条 `review`；199 条 `rework`：`seam` 47、`loudness` 89、`format` 41、`format,loudness` 22 | FAIL（交 `progress.md` 第 3 节 B1 到 B7） |
| 4 | 开发版加载 `review` 音频，发布版不变 | 开发服务里音频索引第一次导入时 650 个可播编号，`?assets=approved` 时 0；抽查 7 个编号的处理结果在浏览器里取到并解码成功（48 kHz，循环曲带循环点）；发布版的加载器只在 `import.meta.env.DEV` 时运行，默认只认 `approved` | PASS |
| 5 | 声音巡游（序章到第一幕，每张地图昼夜各 1 分钟） | 未做：浏览器自动化里没有出声的耳朵，只验证了文件取到与解码；地图环境底层全在 `rework`（B1） | VERIFY（主审戴耳机走一遍） |
| 6 | 单测 | `npx vitest run --config vitest.config.ts tests/client_assets.test.ts tests/audio_engine.test.ts tests/art_manifest.test.ts tests/asset_review.test.ts tests/client_purity.test.ts`：`Test Files 5 passed (5)`，`Tests 259 passed (259)` | PASS（工作期间执行器又交付了 3 张新图，`art_manifest` 的双向对应一度不过，登记后通过） |
| 7 | 类型检查 | `npm run typecheck`：唯一的错误在 `tools/content/validators/lines.ts` 第 283 行，是他包正在改的文件，本包没碰；排除这一个文件后 0 错误 | PASS（基线问题单列） |
| 8 | 文档守卫 | 见 PK-M0-11 的 `verification_matrix.md` 第 1 节第 8 行 | 见那里 |

## 2. 体积（Git LFS 路径，留在本机，等单独的素材仓库）

| 路径 | 文件数 | 体积 |
| --- | --- | --- |
| `assets/audio/**`（采用的原文件，Ogg q8） | 729 | 231.3 MB |
| `assets/processed/audio/**`（处理结果与元数据） | 2527 | 123.1 MB |

## 3. 干净克隆上会失败的测试（进待办）

素材原文件与音频处理结果留在本机、不进本仓库时，只提交清单与美术处理结果的克隆里：

| 测试 | 为什么 |
| --- | --- |
| `tests/art_manifest.test.ts` 的"the committed manifest"用例 | `reconcile` 双向核对记录与 `art/`、`audio/` 下的文件：946 条记录全部报 `missingFiles` |
| `npm run assets:check` | 同上，另报全部音频处理结果缺失 |
| `tests/client_assets.test.ts` 的真实清单用例 | 不依赖原文件，干净克隆上照常通过 |
| `ART_GATE=<里程碑> npm test`（`tests/art_coverage.test.ts`） | 默认关闭；打开时要求通过与最新的处理结果 |

## 4. 清理

| 删除了什么 | 为什么 |
| --- | --- |
| `assets/_rejected/audio/` 下 26 个 Ogg（约 82.5 MB） | R3 换候选时，审核台把被替换的原文件移到这里（4 个与现行原文件逐字节相同，因为又换回了第一版）；每一版都还在候选池里，可以从审核台重新采用；素材说明第 3.3 节写明 `_rejected/` 只在本机，批次关闭后删除 |

同一轮扫描里没有发现的：原文件之间没有重复哈希；没有对不上编号的文件；处理结果都有对应的记录与元数据（工作期间执行器新交付的 21 张先登记、再导入，处理结果随之有主）；没有临时文件。候选池 `_candidates/` 一个都没动。

## 5. 覆盖性复查

新起的子代理按覆盖性看了全部改动与两份问题清单。下表是它的发现和处理结果。

| 发现 | 处理 |
| --- | --- |
| 两处调用 `loadedStatuses` 都写死了 `true` | 改为传 `import.meta.env.DEV` |
| `loadAudioIndex` 是否把状态传下去没有测试 | 加了一个测试 |
| 真实清单的那条测试实际什么也没测 | 改为用开发状态走一遍取文件的路径 |
| README 把 `release_bundle.test.ts` 当成"发布只认通过"的守卫，它其实不查状态 | 守卫一栏改写 |
| B3 写 8 条，实际列了 9 条 | 改正 |
| B11 的归属与种类写错了 | 改正，并在 PK-M0-11 的 A12 写全 |
| 美术那条 `rework` 漏了 | 补为 A15 |
| `xiaojiu` 的 `aigcLabel` 与本包自己查到的结果矛盾 | 改写 |
| PT-07 的音频样板没写进去 | 补进 PK-M0-11 第 2 节 |

这一轮没有改的几条：

| 未处理 | 去向 |
| --- | --- |
| 设计文档里"只加载通过"的说法：美术方案第 6.4 节、音频方向第 9.2 节、素材说明第 0 与 3.3 节 | `progress.md` 第 4 节，请用户定是否回写 |
| 两份包的形态比模板少了 `batch_card.md`、`review.md` 与若干小节 | 留到下一轮补 |
| 采用脚本在本机临时目录，不在仓库里，没法按"命令原样"重放 | 留到下一轮补 |
| Stability 社区许可的营收上限还没登记为风险 | `progress.md` 第 4 节 |
