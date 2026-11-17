# PK-M1-58 任务模型扩展（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-58` 任务模型扩展 |
| 状态 | 进行中（建议主会话改为已完成，依据见 `verification_matrix.md`） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-58` |
| 形态 | 小包 |
| 工作流 | 系统 |
| 量级 | 4 代理人日，0.3 用户人日 |
| 依赖 | PK-M1-45（同一会话先完成，见 [../pk_m1_45_act_clock/README.md](../pk_m1_45_act_clock/README.md)） |
| 别名 | 无 |
| 立项日期 | 2026-11-17 |

## 1. 目标

任务数据能写出任务目录（前）第 1、2 节要的目标种类、任务种类、结局与写入：十二种新目标、八种新任务种类、向前失败与失败分支、过期与"由他人先完成"、`quest.<id>.path` 与 `.stage`、开门钥事件；现有任务数据不改一字照常通过。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 目标种类 `deliver`、`escort`、`investigate`（线索集 `Clue`）、`persuade`、`stealth`、`duel`（不致死）、`follow`、`rescue`、`gather`、`craft`、`trade`、`accompany`；每个目标可带 `path` | `src/systems/quests/types.ts`（`Objective`、`OBJECTIVE_TYPES`）、`src/systems/quests/objectives.ts`（判定、事件契约、人员是否已不在）、`src/systems/quests/objective_events.ts`（订阅） | 任务与事件第 5 节；任务目录（前）第 1.3 节 |
| 2 | 任务种类 `dispute`、`node`、`commission`、`goddess`、`companion`、`craft`、`dungeon`、`explore`（`QUEST_KINDS`）；纷争链的按周默认推进 `defaults`，节点的 `chain` 与 `node` | `types.ts`、`src/systems/quests/disputes.ts`（`runDefaults`，由幕时钟在周首调用） | 任务与事件第 3.1、3.6 节；第一幕第 4 节 |
| 3 | 结局：向前失败（`failure`、阶段 `onFail` 与 `failTo`）、过期（`expiry`）、由他人先完成（`byOther`）；从未接过的任务也会结束 | `src/systems/quests/outcomes.ts`、`progress.ts`（`objectiveFailed`、`checkStage`） | 任务与事件第 3.5 节 |
| 4 | `quest.<id>.path`（最近一次达成的、带解法代号的目标或选项）与 `quest.<id>.stage`（当前阶段代号） | `progress.ts`（`markMet`、`setPath`、`enterStage`）、`index.ts`（抉择） | 注册表第 8.7 节 |
| 5 | 开门钥事件效果 `{ type: 'key', doorId, keyKind, keyId }`：写 `door_key.<门>.<钥>` 并发 `quest.key` | `effect_types.ts`（`KEY_KINDS`）、`effects.ts`（`keyFlag`） | 任务目录（前）第 1.6 节；任务与事件第 3.4 节 |
| 6 | 任务日志：`kind` 为 `QuestKind`，新增 `path` 与 `ended` 一栏 | `src/systems/quests/view.ts` | 任务与事件第 8 节 |
| 7 | 数据校验：种类、目标与引用、失败分支、结局、链与节点、默认步骤、钥事件 | `src/content/packs/quests_model.ts`（新）、`src/content/packs/quests.ts` | 发行工程第 7.4 节 V1、V2 |
| 8 | 自动玩家对新目标的做法（交谈、走到、等待） | `src/game/autoplay/objective_plan.ts`（新）、`player.ts` 一处 | |
| 9 | 注册表：新增族 `door_key.<门>.<钥>`；`quest.<任务>.path` 的口径 | `docs/40_design/world_state_registry.md` 第 8.7 节 | |
| 10 | 文档回写：任务与事件第 3.4、3.5、5 节 | `docs/40_design/systems/quests_and_events.md` | |
| 11 | 测试 | `tests/quest_model.test.ts`（新） | 计划包行验收栏 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 采集与制作系统（发出 `gather.done`、`craft.done`） | PK-M1-49 |
| 2 | 普通 NPC 跟随玩家（护送、救援、陪伴的非同伴对象）、潜行发现（`stealth.detected`）、`npc.goto` 跨图 | PK-M1-18、PK-M1-15 |
| 3 | 不致死决斗本身（发出 `duel.ended`） | 战斗方（PK-M1-11、PK-M1-12） |
| 4 | 纷争的决策点与结局结算 | PK-M1-46 |
| 5 | 委托实例化与 `cmm_count` | PK-M1-47 |
| 6 | 按设计重导第一幕任务 | PK-M1-33 |
| 7 | 门数据读 `door_key.*`、门计数 `quest.key` | PK-M1-14 的后续（门数据批次 PK-M1-32） |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| [catalog_quests_acts1_3.md](../../40_design/content/catalog_quests_acts1_3.md) 第 1、2 节 | 字段、编号、变量、钥事件、委托 |
| [quests_and_events.md](../../40_design/systems/quests_and_events.md) 第 3、5 节 | 数据对象、结局、目标类型与数据层对照 |
| `src/systems/quests/objectives.ts`、`outcomes.ts`、`disputes.ts` | 实现 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性 | 判定只读内核证据（事件、实体位置、世界事实），不用随机与墙钟 | `tests/architecture.test.ts` |
| 系统不写内容 ID | 人物、物品、地点都来自任务数据 | `tests/content_id_guard.test.ts` |
| 跨系统 | 不导入别的业务系统：跟随用 NPC 系统的 `npc.goto` 命令，交易读 `economy.traded` 事件，钥只写旗标与事件 | 约定第 6 节 |
| 现有数据零改动 | `data/quests/quests.json` 未改 | `tests/quest_model.test.ts`、数据门 |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/quests/{objectives,objective_events,outcomes,disputes}.ts`、`src/content/packs/quests_model.ts`、`src/game/autoplay/objective_plan.ts`、`tests/quest_model.test.ts`、本目录 |
| 本包修改 | `src/systems/quests/{types,progress,index,view,effects,effect_types,act_clock}.ts`、`src/content/packs/quests.ts`、`src/game/autoplay/player.ts`、`src/content/registry_refs.ts` 与 `src/editor/quests/flag_index.ts`（钥事件写入的索引，各几行）、注册表文档与 `vars.json`、`docs/40_design/systems/quests_and_events.md` |
| 越界时 | 见 `progress.md` |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。

## 8. 验证命令

```
npx vitest run --config vitest.config.ts tests/quest_model.test.ts tests/quests.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起子代理） | 必派 | 一次贡献结束 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、测试、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；本包验证命令绿 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 无 | | |
