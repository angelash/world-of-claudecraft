# PK-M0-30 数据基线重标批次：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS |
| 末次代码或内容变更 | 未提交（改动文件清单见 `README.md` 第 6 节与本会话 `progress.md`） |
| 完整实跑 | 2026-11-17；工作区（未提交） |
| 审查 | 新起只读子代理：PASS-WITH-FOLLOWUPS（1 项已修，2 项记为低严重度不改，1 项记为既有缺口，详见第 3 节） |
| 遗留 | 无新增遗留；`faceless_king` 倍率仍待 PK-M1-42；C88、C89 仍待 M2 批次 |

## 1. 验收条目

| 序 | 验收 | 命令或评审 | 结果（原样要点与量化数字） | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 经济校验通过 | `tests/content_base_rebase.test.ts`（违法品、保留物）、`tests/economy.test.ts` | 20 测试文件、405 测试全部通过 | 本文第 2 节；`batch_report.md` 第 9、11 节 | PASS |
| 2 | V1 到 V10 通过 | `node tools/content/validate.ts --warnings` | `all validators green`；0 errors across V1-V10 | `batch_report.md` 第 8 节 | PASS |
| 3 | 通关回归通过 | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts` | `Test Files 1 passed`、`Tests 1 passed`，耗时约 1459 秒 | `batch_report.md` 第 11 节；`.local/pk30/release_playthrough.log`（本机临时目录，未提交） | PASS |
| 4 | 批次报告列出全部改动 ID | `batch_report.md` | 新增 4 项、价格改动 28 项、掉落改动 9 项逐条列出 | `batch_report.md` 第 1 到 3 节 | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 根 `tsconfig.json` 干净；`desktop/tsconfig.json` 干净；`tests/time_skip.test.ts` 的 7 处报错与本批次无关（见第 4 节） | PASS |
| 默认套件（受影响部分） | 见验证命令（20 个测试文件） | 是 | 405 passed，0 failed | PASS |
| 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 是（改了文档） | 见本次会话命令记录（通过，禁用字符与链接检查为零） | PASS |
| 改动文件格式 | `npm run format -- <改动的 TS 与 JSON>` | 是 | Biome 对改动的 `tools/content/mappings/gathering_crafting.ts`、`tools/content/validators/balance.ts`、`tests/content_base_rebase.test.ts`、全部改动的 `data/*.json` 与 `tools/content/names/known_works.json`、`assets/prompts/specs/*.json` 均为 0 差异（数据文件采用保留原格式的就地编辑脚本写入，再经 Biome 核对） | PASS |
| 无模型通关 | `npm run playthrough` | 否（本批次只跑一条结局路线，按包指示不跑全套；全套由主会话汇总各代理改动后统一跑） | 本批次单独跑了 release 结局，通过 | N/A（范围内） |
| 构建 | `npm run build` | 否（本批次不改变构建入口或资产清单结构） | 未跑 | N/A |
| 提示词库新鲜度 | `npm run prompts:check` | 是（改了 `assets/prompts/specs/`） | `prompt library ok: 10387 entries` | PASS |
| 全量本地门 | `npm run gate` | 否（多代理并行改动中，由主会话收尾时统一跑） | 未跑 | N/A |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 新起只读子代理（覆盖面审查） | 收官前的独立覆盖检查 | PASS-WITH-FOLLOWUPS | 0 | 1（已修：`development_plan.md` PK-M0-30 行把 C91 的改名目标误写为 `a3_vow_taken`，应为 `a3_vow_kept_reed_bridge`） | 已修（见本文件最后一条改动） | 本会话消息记录（子代理 `a318ea7b7753fa76c` 的交接报告） |

审查另报两条 nit / 低严重度，按其严重度不单独改动，记录在案：
- `assets/prompts/specs/icons_equipment.json` 的 `art_doll_held_shiya_greymane_longbow`、`art_ico_item_eq_shiya_greymane_longbow` 英文提示词原写"gray-mane"，与同文件另两处"grey-mane"拼法不一致；已顺手改为"grey-mane"统一拼法（见本会话改动记录）。
- `tools/content/validators/balance.ts` 的 V6 材料价格带校验（`materialTiers`）不识别 `dian_shard` 与四档未净炼灰晶的 ID 形状，这些 ID 的价格因此不经 V6 的公式区间校验；五项价格已由本批次测试 `tests/content_base_rebase.test.ts` 的 `PRICES` 常量逐项硬编译核对，且 `crystal_king_raw` 的价格（1,000,000 铜）本身高于 T5 材料带（设计既定：王晶同时是货币，总纲 7.7），扩大 V6 的识别范围会对这一项产生误报。判定为既有缺口，留给数据层或 V6 校验器的后续改动，不在本批次处理。

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npm run typecheck` | `tests/time_skip.test.ts` 7 处 `TS2339` | 该文件不在本批次改动范围（`src/systems/travel/skip.ts` 等归并行的跳时内核批次）；开工前已存在，与本批次改动的文件（`data/`、`tools/content/`、相关文档）无交集 | 并行的 PK-M0-31 跳时内核批次 |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 无 | | |
