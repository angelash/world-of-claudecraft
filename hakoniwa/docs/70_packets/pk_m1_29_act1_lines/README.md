# PK-M1-29 第一幕台词（别名：内容批次 `content_act1_lines_01`）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-29` 第一幕台词 |
| 状态 | 进行中，有阻塞：16 个吠叫池达不到心情偏好下限、句数下限的口径、重复率未达标，三项待用户决定，见 `progress.md` 第 4 节 |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-29` |
| 形态 | 内容包加两个小模块，按小包三件写 |
| 工作流 | 内容 |
| 量级 | 6 代理人日，3 用户人日 |
| 依赖 | PK-M1-19（话题图）；PK-M1-28（人设卡、居民模板） |
| 并行包 | PK-M1-34（六位女神的台词包，含 `ln_janu`）、PK-M1-33（话题的任务入口）、PK-M1-21（队内闲聊的选择） |
| 立项日期 | 2026-11-18 |

## 1. 目标

无模型档凭预写台词从序章走完第一幕：第一幕全部有名人物、17 个居民模板、共享层（`ln_common`、15 个 `ln_role_`、12 个 `ln_class_`）、48 个吠叫池与 `ln_party` 第一幕 20 段落成数据；每个第一幕话题都有人能答；台账的逐线索未解锁处理与"低置信加泄露签名记未知并送审"落地；阿什第一幕只说写定台词；内置 AI 第 7.8 节的最低覆盖与第 14.1 节的重复率有可运行的检查。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 目录台词导入：132 个新包，3 个旧包合并（只追加，旧序号不变），共 6805 句 | `data/dialogue/lines/*.json` | [台词目录](../../40_design/content/catalog_dialogue_lines.md) 第 4、6、7、8 节；[第一幕分册](../../40_design/content/catalog_dialogue_lines_act1.md) 第 3 到 8 节 |
| 2 | 目录未写台词的 7 个话题：6 个任务入口（PK-M1-33 的请求）与 `faith_nameless` | `ln_martha`、`ln_owen`、`ln_greta`、`ln_dris`、`ln_seg_oneeye`、`ln_bron`、`ln_oola`、`ln_noi`、`ln_tess`、`ln_tpl_hidden_gatefolk` | 目录第 3.3 节话题行；[种族](../../20_world/races.md) 遗民信仰；[历史](../../20_world/history.md) 遗民口传 |
| 3 | `ln_party`：槽位 `party.<编号>` 先放说话句，再放回应选项 | `data/dialogue/lines/ln_party.json` | `src/content/packs/party.ts` 的 `validateBanter` 契约 |
| 4 | 逐线索未解锁处理表与低置信规则 | `data/dialogue/ledger_refusals.json`；`src/systems/dialogue/topics/ledger.ts`、`intent/respond.ts` | [builtin_ai.md](../../40_design/systems/builtin_ai.md) 第 6.6 节；[reveal_ledger.md](../../30_story/reveal_ledger.md) 第 0.2 节 |
| 5 | 写定说话者：人设卡 `scripted` 列出的幕里只用本人包，不回退、不走规则模板、不请模型措辞 | `src/systems/dialogue/scripted.ts`（新）；`speak.ts`、`replies.ts`、`session.ts`、`lines/packs.ts`、`intent/respond.ts`；`src/systems/npc/chat.ts`、`types.ts`；`data/npc/personas.json` 阿什 | 第一幕分册第 0 节第 4 条 |
| 5a | 回退链修正：按幕覆盖全被条件挡住时先落到同一包的基础槽；自由输入读按幕覆盖；"X 里的 Y"按中心词选话题 | `lines/packs.ts`、`lines/select.ts`；`intent/respond.ts`、`intent/head.ts`（新） | builtin_ai 第 7.3 节"第一个有可用句子的来源"；第 6.3 节 |
| 6 | 最低覆盖与重复率 | `src/systems/dialogue/lines/coverage.ts`、`repetition.ts`（新）；V8 钩子 `tools/content/validators/lines.ts` | builtin_ai 第 7.8、14.1 节；目录第 1.5 节 |
| 7 | 测试 | `tests/dialogue_scripted.test.ts`、`dialogue_ledger_refusals.test.ts`、`lines_coverage.test.ts`、`dialogue_head.test.ts`（新）；`lines.test.ts`、`dialogue.test.ts`、`dialogue_topics.test.ts`（改） | |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 六位女神的台词包（`ln_eluen`、`ln_valda`、`ln_merca`、`ln_sylvie`、`ln_moira`、`ln_janu`）与女神、序章的 16 个话题 | PK-M1-34 |
| 2 | 队内闲聊的选择与触发 | PK-M1-21 |
| 3 | 给吠叫池编写目录之外的句子 | 目录作者（用户决定，`progress.md` 第 4 节） |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| builtin_ai.md 第 6.6、7 节 | 拒答表、台词包契约、回退链、最低覆盖 |
| 台词目录第 1、8 节；第一幕分册第 0、1 节 | 写法、类别与最低量、吠叫池 |
| `docs/70_packets/pk_m1_19_topics_dialogue/`、`pk_m1_28_act1_characters/` | 话题图与人设卡 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 序号只追加 | 合并已有包时旧句的位置不动，新句追加在后 | `tests/lines.test.ts` 的旧键摘要 |
| 台账 | 每句扫泄露签名；未解锁内容只在带 `when` 的句子里 | V5 |
| 俗称 | 共享层不出现"澱" | V8 |
| 系统不写内容 ID | 写定说话者由人设卡字段决定 | `tests/content_id_guard.test.ts` |

## 6. 文件范围

见 `progress.md` 第 2 节。

## 7. 验证命令

```
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.config.ts tests/lines.test.ts tests/lines_coverage.test.ts tests/dialogue_ledger_refusals.test.ts tests/dialogue_scripted.test.ts tests/dialogue_head.test.ts tests/dialogue.test.ts tests/dialogue_topics.test.ts tests/dialogue_talk_extras.test.ts tests/party_banter.test.ts tests/dialogue_prologue_answers.test.ts tests/npc_act1_cast.test.ts tests/npc.test.ts tests/npc_brain.test.ts tests/intent_classifier.test.ts tests/content_id_guard.test.ts
```

## 8. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起子代理） | 必派 | 覆盖与台账两个模块与数据 |

## 9. 需用户决定

见 `progress.md` 第 4 节。
