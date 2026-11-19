# PK-M1-29 第一幕台词：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | BLOCKED。台词数据、话题补句、逐线索拒答的已映射部分、写定说话者，以及覆盖与重复率的检查都已落地并有测试；三项待用户决定：16 个吠叫池的心情偏好、句数下限的口径、重复率未达标，见 `progress.md` 第 4 节 |
| 末次代码或内容变更 | 未提交；改动文件见 `progress.md` 第 2 节 |
| 完整实跑 | 2026-11-19，与他包并行的同一工作区；只跑下表命令，全量 `npm test` 与 `npm run playthrough` 延后（`progress.md` 第 5 节） |
| 审查 | 新起子代理复查一轮：2 个阻塞、10 个主要、16 个次要。已修 M1、M2、M5、M6、M8 与 m1、m3、m5（注释）、m8、m14；其余列入后续或待用户决定，见 `progress.md` |

## 1. 验收条目

计划包行验收栏："内置 AI 第 7.8 节最低覆盖与第 14.1 节重复率达标；泄露与禁名扫描为 0"。

| 序 | 条目 | 证据 | 状态 |
| --- | --- | --- | --- |
| 1 | 目录台词全部导入：141 个包中本包 135 个（6 个女神包归 PK-M1-34）；转换器 0 问题，逐包句数与目录标题声明一致；复查者独立比对 134 包 6233 句无漏句错号 | `data/dialogue/lines/`；转换报告 | PASS |
| 2 | 每个第一幕与序章话题都有人能答：253 个话题中 237 个有句子，其余 16 个都是女神或序章话题（PK-M1-34） | 按话题图逐个检查（人工，自动检查列为后续） | PASS（本包范围） |
| 3 | 三个旧包只追加：旧键摘要不变；复查者逐句核对旧序号 | `tests/lines.test.ts` "every former template key reads exactly its old lines" | PASS |
| 4 | 最低覆盖（7.8）：G、C、K、N、T 的必备槽位齐全（女神包已由 PK-M1-34 落地，女神缺口按错误检查且无报）；句数缺口 6 处报警告（口径待定） | `node tools/content/validate.ts` V8；`tests/lines_coverage.test.ts` | PARTIAL |
| 5 | 吠叫池的心情或时段偏好（7.8） | V8：16 个错误 | BLOCKED |
| 6 | 重复率（14.1） | 测量有单测；复查者在真实数据上测得核心、有名、同伴都超上限 | BLOCKED |
| 7 | 逐线索未解锁处理：已映射的 29 行按人给出五种处理之一；知情者用行默认；台账写"全体"的行对所有人生效；其余人当胡话 | `tests/dialogue_ledger_refusals.test.ts` 15 个用例 | PARTIAL（未映射行见 `progress.md` 第 3 节） |
| 8 | 低置信加泄露签名：答"不知"并发审计事件"疑似抢答"（带线索与说话者） | 同上 | PASS（事件已发；送入审阅列为后续） |
| 9 | 阿什第一幕只说写定台词：回退链只剩本人包；问候、初见问候、告别与规则模板从本人包取句；自由输入没有答案时说本人的回避句；玩家对话与 NPC 闲聊都不请模型；第二幕起回退链恢复 | `tests/dialogue_scripted.test.ts` 6 个用例（含模型档的固定存在阿什；断言必须取自 `ln_ash`） | PASS |
| 10 | 泄露扫描（V5）：本包台词 0 错误；1 个警告判为误报 | V5；`progress.md` 决定表 | PASS |
| 11 | 6 个失败用例逐条判定 | `progress.md` 第 2 节判定表 | PASS（5 个数据落地，1 个回归已修代码：MIS-05） |
| 12 | 按幕覆盖全被条件挡住时不再跳过本人包；自由输入读按幕覆盖 | `tests/lines.test.ts` 新用例；`tests/dialogue_scripted.test.ts` | PASS |
| 13 | "X 里的 Y"按中心词 Y 选话题（遗迹里的神纹到卡西安的误导） | `tests/dialogue_head.test.ts`；`tests/dialogue_topics.test.ts` 的 MIS-05 两个用例 | PASS |

## 2. 命令与结果

复查修复之后的末次实跑（同一工作区，他包并行进行中）：

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | `src/client/` 以外 0 个错误（`src/client/` 里他包进行中的错误不计） |
| `node tools/content/validate.ts` | V1、V2、V3、V4、V6、V7、V9、V10 ok。V8 16 个错误，全部是吠叫池心情偏好（本包阻塞）；V5 2 个是 `goddesses:janu`（PK-M1-34） |
| `node tools/registry/build.ts --check` | 通过 |
| `node tools/i18n/check.ts` | 0 finding，2672 key uses scanned |
| `node tools/i18n/extract_content.ts` | 重生成 `locales/zh-Hans/content.generated.json`（16154 keys，71 张表） |
| `npx vitest run --config vitest.config.ts`（15 个文件：`lines`、`lines_coverage`、`dialogue_ledger_refusals`、`dialogue_scripted`、`dialogue_head`、`dialogue`、`dialogue_topics`、`dialogue_talk_extras`、`party_banter`、`dialogue_prologue_answers`、`npc_act1_cast`、`npc`、`npc_brain`、`intent_classifier`、`content_id_guard`） | 273 passed、1 failed：`lines.test.ts` "V8 runs the line pack checks" 的 `good` 一臂，正是上面 16 个吠叫池错误；未放宽该断言 |
