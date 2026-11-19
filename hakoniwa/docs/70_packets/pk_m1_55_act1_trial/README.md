# PK-M1-55 第一幕审判与出示证物（别名：出示核心、魔女审判）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-55` 第一幕审判与出示证物 |
| 状态 | 进行中（建议主会话改为"已完成，带遗留"，依据见 `verification_matrix.md`；遗留见 `progress.md` 第 3 节） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-55` |
| 形态 | 小包三件 |
| 工作流 | 系统 |
| 量级 | 2 代理人日，0.2 用户人日 |
| 依赖 | PK-M1-19（已完成：身份暴露与反应表）；PK-M1-34（同一会话：`cut_a1_trial` 的数据） |
| 立项日期 | 2026-11-19 |

## 1. 目标

魔女审判 `cut_a1_trial`（原 `a1_oola_trial`）的举证经出示核心进行：玩家把持有的证物放上审判台，核心判定落地、无关、伪证、重复或未持有；落地的证物证成审判点（物证、证词、拆穿、辩论，多名证人只计一项），无关与伪证由审判方按数据反驳并付出代价；判决按成立的项数（两项平反）。出示核心与第六幕审庭共用。审判当众说出圣光照不进玩家时触发身份暴露；反应表第 2 行（虔信者）推进指控（教会怀疑），第 4 行（卫兵与官员盘查）给审判或逮捕事件链打下预兆。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 出示核心：判定（`hit`、`wrong`、`forged`、`repeat`、`missing`）、出示记录、按点只计一次 | `src/systems/scenes/present.ts`（纯） | 第一幕第 4.2 节；第六幕第 3.3、4.1 节 |
| 2 | 第六幕审庭经核心判定命中与偏离，行为不变 | `src/systems/scenes/court.ts`（`courtPiece`、`presentEvidence`） | 第六幕第 3.3 节 |
| 3 | 第一幕审判：审判表（证物、各点、反驳、平反所需项数、点的旗标、计数旗标）；出示与反驳；判决计数 `compute trial_verdict` | `src/systems/scenes/trial.ts`；`data/scenes/trials.json` | 第一幕第 4.2 节；任务目录（前）A1-M09 无模型评分 |
| 4 | 场景的出示节点：`SceneNode.present` 在节点的写定选项前列出持有的证物；落地的证物可播自己的反应节点；无关与伪证留在节点上 | `src/systems/scenes/{runner,view,types,index}.ts`；`cut_a1_trial` 的 `defense` | 界面第 17 节 `tut_a1_present` |
| 5 | 身份暴露的审判来源：卡西安在广场当众说出此前礼拜堂的鉴定时（`a1_trial_light_public`），玩家在广场暴露一次；当场鉴定沿用 `a1_cassian_appraise` 的首次置位 | `data/cognition/sources.json`；`cut_a1_trial` 的 `square` | 内置 AI 第 5.6 节；PK-M1-19 遗留第 10 项前半 |
| 6 | 反应表的其他后果：第 2 行指控进度（`church_suspicion`，同一人每日一次）、第 4 行审判或逮捕的预兆步（`omen.<地图>.law`，每图每日一次）；后果名是行数据的封闭集合 | `src/systems/npc/brain/consequences.ts`；`reactions.ts`、`library.ts`；`data/npc/brain/reactions.json` | 内置 AI 第 5.6 节第 2、4 行；第 8.6 节 |
| 7 | 校验：审判表（物品、点、旗标、计数、反驳、说话者、编号唯一）、出示节点（不与输入或审庭并用、总有出口）、注册表名 | `src/content/packs/scenes.ts`；`src/content/packs/quests.ts`（计算名）；`src/content/registry_refs.ts`（`countFlag`）；`src/game/autoplay/routes.ts`（偏好表认证物） | 内容校验 V1、V4、V9 |
| 8 | 测试 | `tests/act1_trial.test.ts`；`tests/act1_cutscenes.test.ts`（出示节点的可达与剧本跑法） | 见 `verification_matrix.md` |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | `tut_a1_present` 的界面触发与高亮目标（客户端的教学信号只认审庭的 `court`） | PK-M1-23（请求见 `progress.md` 第 3 节） |
| 2 | 第六幕伪证的后果（被质询的防线加厚、本场口才归零） | 第六幕的后续包 |
| 3 | 读 `omen.<地图>.law` 的审判与逮捕事件链 | 审判与逮捕事件链的后续包 |
| 4 | 审判官或勇者的指认（`identity_guest`）、晚祷样本进入艾琉恩投影 | PK-M2 的赛琳线、PK-M2-11 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| [act1_borderstone.md](../../30_story/arcs/act1_borderstone.md) 第 4.2 节 | 审判的规则与结局 |
| [act6_review_and_epilogue.md](../../30_story/arcs/act6_review_and_epilogue.md) 第 3.3、4.1 节 | 审庭的出示与伪证 |
| [builtin_ai.md](../../40_design/systems/builtin_ai.md) 第 5.6、8.6 节 | 反应表的后果与预兆 |
| [catalog_quests_acts1_3.md](../../40_design/content/catalog_quests_acts1_3.md) A1-M09 | 无模型评分 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性 | 出示与判决不抽签；后果的每日记录按游戏日 | `tests/architecture.test.ts`；`tests/act1_trial.test.ts` |
| 系统不写内容编号 | 审判、证物、点、反驳、旗标都在审判表；后果名是封闭集合 | `tests/content_id_guard.test.ts` |
| 文本 | 反驳是审判表的内容文字（`c.trials.<审判>.rebuttals.<序>.text`）；出示句是系统键 | `node tools/i18n/check.ts` |
| 第六幕不变 | 命中与偏离的结果、旗标、切片形状与改动前相同 | `tests/scenes.test.ts` "breaks defense lines…" |

## 5.1 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/scenes/{present,trial}.ts`；`src/systems/npc/brain/consequences.ts`；`data/scenes/trials.json`；`tests/act1_trial.test.ts`；本目录 |
| 本包修改 | `src/systems/scenes/{court,runner,view,types,index}.ts`；`src/content/packs/scenes.ts`；`data/scenes/act1.json`（`cut_a1_trial` 的 `defense`、`water`、`verdict`、`square` 四个节点）；`locales/zh-Hans/sys_scenes.json`（三个键） |
| 越界改动（写进 `progress.md`） | `src/systems/npc/brain/{reactions,library}.ts`、`src/systems/npc/types.ts`（只加切片字段与事件）；`data/npc/brain/reactions.json`；`data/cognition/sources.json`；`src/systems/quests/effect_types.ts`、`src/content/packs/quests.ts`（计算名）；`src/content/registry_refs.ts`；`src/game/autoplay/routes.ts`、`data/autoplay/routes.json`；`docs/40_design/world_state_registry.md`；`data/registry/vars.json`（重生成）；`tests/act1_cutscenes.test.ts` |

## 6. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。

## 7. 验证命令

```
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.config.ts tests/act1_trial.test.ts tests/scenes.test.ts tests/act1_cutscenes.test.ts tests/disputes.test.ts tests/dialogue_talk_extras.test.ts tests/npc_cognition_arcs.test.ts tests/npc.test.ts tests/npc_brain.test.ts tests/cognition.test.ts tests/autoplay_reach.test.ts tests/content_validation.test.ts tests/content_id_guard.test.ts tests/architecture.test.ts tests/registry.test.ts
```

全量 `npm test` 与 `npm run playthrough` 按用户的指示延后（`progress.md` 第 2 节"延后的测试"）。

## 8. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起子代理） | 必派 | 一次贡献结束 |

## 9. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、数据、测试、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；本包验证命令绿 |
| `progress.md` 第 3 节的请求 | PK-M1-23、第六幕后续包、PK-M2-11 | 各自按表处理 |

## 10. 需用户决定

见 `progress.md` 第 4 节。
