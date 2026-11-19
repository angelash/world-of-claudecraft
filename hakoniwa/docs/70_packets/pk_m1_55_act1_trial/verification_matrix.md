# PK-M1-55 第一幕审判与出示证物：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（审判各结局可达，出示错误证物的反应有单测；出示核心与第六幕共用且第六幕行为不变；身份暴露与反应表两行的后果落地；`tut_a1_present` 的界面触发、第六幕伪证后果、预兆的读者转后续，见 `progress.md` 第 3 节） |
| 末次代码或内容变更 | 未提交；改动文件清单见 `progress.md` 第 2 节 |
| 完整实跑 | 2026-11-19；工作区状态（未提交，与他包并行的同一工作区） |
| 审查 | 新起子代理的覆盖性复查一轮，发现与处理见 `progress.md` 第 2 节 |
| 遗留 | 见 `progress.md` 第 3 节 |

## 1. 验收条目

计划包行验收栏："审判各结局可达；出示错误证物的反应单测"。

| 序 | 验收 | 证据（`tests/act1_trial.test.ts`） | 状态 |
| --- | --- | --- | --- |
| 1 | 平反（两项） | "cleared: two points (the water and a witness)"；"the lamp exposed and a spoken debate are points: the two clear her"：`a1_trial_points` 2，`a1_oola_fate` 为 `cleared` | PASS |
| 2 | 审判成立 | "witnesses count once…"、"Bron vouches for the player…"、"a wrong piece does not count…"、"a silent debate is no point…"：项数 1，`convicted` | PASS |
| 3 | 冲突 | "brawl: convicted with the forest accord broken"：`fled`、`a1_trial_brawl` | PASS |
| 4 | 已开过、劫狱、贿赂三种短版 | "the short versions…, each to its written outcome"：首节点 `held`、`empty`、`bribed`，不进 `defense`；下场与周报 `convicted`/`convicted`、`fled`/`fled`、`cleared`/`unresolved` | PASS |
| 5 | 出示错误证物的反应 | "a wrong piece gets the rebuttal and its cost; it proves nothing"：卡西安的反驳是审判表的内容键、教会怀疑 +2、不写物证点、事件 `outcome: wrong`；"a forged piece…"：伪证反驳、+5、`forgeryCaught` | PASS |
| 6 | 拒收 | "a piece the player does not hold…"（不列出、拒收、状态与修订号不变、无事件）；"the same piece twice…"（第二次拒收、不再扣） | PASS |
| 7 | 出示核心（纯） | "judges each outcome…"、"records what is shown…"、"counts each point once…"、"act 6: an evidence record becomes a piece…" | PASS |
| 8 | 第六幕不变 | `tests/scenes.test.ts` "breaks defense lines with evidence and only counts a piece once" 全过（命中、偏离、重复、强度 5、旗标） | PASS |
| 9 | 身份暴露的审判来源 | "Cassian telling the square about the chapel appraisal exposes the player there, once"；"without a chapel appraisal, the light in the square exposes once" | PASS |
| 10 | 反应表第 2 行指控进度 | "cassian, explaining the player by sorcery…: suspicion +1 once"（经真实的暴露与反应路径；同日第二次反应仍发生、后果只一次）；"a person who is not devout raises no case"；纯函数用例（封顶 100、每人每日一次） | PASS |
| 11 | 反应表第 4 行审判预兆 | "a lawman matching the player to a hot rumor: the challenge row stamps the law omen"（`omen.borderstone.law`，女神的 `omen.borderstone` 不动）；纯函数用例（每图每日一次、未知名无效） | PASS（读者 FOLLOWUP） |
| 12 | 数据与校验 | "the two rows name their consequence…"；"the brain check rejects… unknown consequence"；"the shipped table is clean"；"names every broken rule…" | PASS |
| 13 | `tut_a1_present` | 内核侧：出示节点、`piece:` 选项与 `trial.presented` 事件齐全；客户端教学信号只认审庭 | FOLLOWUP（PK-M1-23） |

## 2. 检查命令与结果（2026-11-19，末次变更之后）

| 命令 | 结果 | 本包相关 |
| --- | --- | --- |
| `npm run typecheck` | 他包文件有错误（与 PK-M1-34 矩阵所列相同） | 本包文件 0 错误 |
| `node tools/content/validate.ts` | V1、V2、V3、V4、V6、V7、V9、V10 0 错误；V5 2 错误；V8 16 错误 | V5 是已提交的雅努称号，V8 是台词批次未跟踪的吠叫池；本包 0 错误 |
| `node tools/registry/build.ts --check` | current（730 名，129 族） | PASS |
| `node tools/i18n/check.ts` | 0 findings（2713 key uses） | PASS |
| 禁用字符扫描（本包写过的文件） | 0 | PASS |
| `npx vitest run --config vitest.config.ts`（两包合跑 30 个文件） | `Test Files 5 failed | 25 passed (30)`，`Tests 10 failed | 723 passed (733)` | `act1_trial` 29 例全过；失败的 10 例：`scenes.test.ts` 四个整局走查（本包前已失败，停在第一幕第 1 周）、`content_validation` 两例（V5、V8）、`architecture` 一例（`src/systems/dialogue/lines/repetition.ts`）、`i18n_kernel_guard` 两例（`src/systems/dialogue/intent/head.ts` 与新增的界面字符串表）、`registry` 一例（`src/client/tutorial/check.ts`），都不是本包文件 |

## 3. 延后的测试

见 `progress.md` 第 2 节"延后的测试"。
