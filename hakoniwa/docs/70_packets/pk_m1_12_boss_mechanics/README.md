# PK-M1-12 首领机制库与魔物机制字段（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-12` 首领机制库与魔物机制字段 |
| 状态 | 进行中（实施与验证已完成，待主会话确认封包） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-12` |
| 形态 | 小包（量级 4 代理人日，按小包三件写；范围按计划包行、战斗文档第 10、11 节与第 20 节归本包的 M1 行切分） |
| 工作流 | 系统 |
| 量级 | 4 代理人日，0.5 用户人日 |
| 依赖 | PK-M1-11（战斗规则，已提交 `04ecbee240`）；承接 PK-M1-51（澱病与伤病，`1a910bfb1e`）、PK-M1-50（迷宫运行时，`0be6f65220`）转来的战斗侧遗留 |
| 别名 | 无 |
| 立项日期 | 2026-11-17 |

## 1. 目标

[战斗与职能系统][cmb]第 10 节的首领机制库在内核里成立（阶段、读条与引导、五种地面预警、增援、软硬狂暴、点名、打断窗口、护盾与失衡、地形机关、非战斗解法、封场），
第 11 节首需为"一"的魔物机制字段由内核读取，澱巨像"追最大的门"与孤儿受威胁（[第一幕 10.4][a1]）按 10.8 落地；连同 PK-M1-11 转来的看到的灵压、两路提示、
引导受击损失 25%，PK-M1-51 转来的澱病与伤病光环在战斗里的效果与伤病来源，PK-M1-50 转来的迷宫遗落物端口。验收：每种机制一条单测；一击致命的预警提前不少于 2 秒。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 首领机制库：每种机制一个模块，`tickBoss` 协调、`resetBoss` 清空 | `src/systems/combat/boss/`（`index.ts`、`fight.ts`、`phases.ts`、`actions.ts`、`adds.ts`、`enrage.ts`、`marks.ts`、`shields.ts`、`terrain.ts`、`resolve.ts`、`arena.ts`、`interrupt.ts`、`door_seek.ts`） | [战斗][cmb] 10.1、10.2、21.1 |
| 2 | 五种地面预警：锁定、不掷骰、掩体、首次减半、提前量按档与难度、同屏 3 个、脉冲区 | `src/systems/combat/telegraph.ts`、`telegraph_shapes.ts`；事件 `combat.telegraph`、`combat.telegraph_ended` | [战斗][cmb] 10.3、18 |
| 3 | 读条与引导：带预警的读条、引导分跳与递增、引导受击失去剩余 25%、打断窗口、护盾期间不可打断 | `src/systems/combat/abilities.ts`、`damage.ts`、`boss/interrupt.ts`；事件 `combat.channel` | [战斗][cmb] 3.9、10.4 |
| 4 | 第 11 节首需为"一"的注册表字段（命中、计时、反应、标志、出生、世界规则、净化） | `src/systems/combat/affixes/`（`on_hit.ts`、`timed.ts`、`life.ts`、`purify.ts`、`index.ts`）；`spawning.ts`、`death.ts`、`stats.ts`、`control.ts`、`threat.ts`、`monster_ai.ts` 的接线 | [战斗][cmb] 11；[图鉴][best] 9；[迷宫目录][dgn] 1.6 |
| 5 | 魔物字段的口径扩展：野兽逃跑不求援、人形呼 3 格内同类、`social` 缺省 3 格；看到的灵压 | `src/systems/combat/monster_ai.ts`、`perceive.ts` | [战斗][cmb] 11、12.2 |
| 6 | 澱巨像追门与汲门 | `boss/door_seek.ts`；技能 `sk_mon_doordrain`；事件 `combat.door_seek` | [战斗][cmb] 10.8；[第一幕][a1] 10.4 |
| 7 | 第一幕四场首领落到机制库 | `data/combat/monsters.json`（守护巨鸦三块悬石、晶背之母二次塌方、澱巨像灰壳护盾与追门）；`data/combat/abilities.json`（各技能的 `telegraph`） | [战斗][cmb] 10.8 |
| 8 | 澱病与伤病光环在战斗里的效果：生命恢复 -10%、澱热 10% 灵素失控、灵力恢复 -50%、双手武器锁、门技冷却 +20% | `data/combat/auras.json`（PK-M1-51 的八行加字段）；`stats.ts`、`auto_attack.ts`、`abilities.ts` | [战斗][cmb] 9.4；[成长][prg] 9.3、10.1、10.2 |
| 9 | 伤病来源：同伴倒地后被救起、首领技能、淬体反冲（端口） | `src/systems/combat/injuries.ts`（经澱病系统的命令 `ailments.injure`） | [成长][prg] 8.2、10.1 |
| 10 | 迷宫遗落物端口接遗落包 | `src/systems/combat/bag_port.ts`、`death_costs.ts` | [迷宫目录][dgn] 1.1 |
| 11 | 两路提示与内容校验：提前量按档、设计伤害按档、每次施放与每阶段至多 3 个区域、全部库条目的引用、注册表以外的键、致命档与重击档预警与首领读条的声音条目 | `src/content/packs/combat_boss_checks.ts`、`combat.ts`；`data/audio/cues.json` 的 `telegraph_warn` | [战斗][cmb] 10.1、10.3、18、20 |
| 12 | 注册表：`boss.<首领>.resolved` | [注册表](../../40_design/world_state_registry.md) 8.6；`data/registry/vars.json` | [战斗][cmb] 10.7 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 第一幕魔物与首领的内容批次（记账鼠婆、迷宫专属魔物、异名者、活性词缀 `afx_` 与活性期首领、各魔物的注册表字段取值） | PK-M1-30 |
| 2 | 首领战场地图的地点与物件（悬石、门洞与屋檐掩体、孤儿院前街的木屋与栅栏、北泉小广场） | PK-M1-35（本包机关按地点 ID 读取，地图未给地点前按偏移放置） |
| 3 | 同伴对预警、点名与危险区的反应、`needsOrder` 的执行、夜羽的"鸦群扑面" | PK-M1-15 |
| 4 | 寻路读取穿墙与入水（`movementTraits`）、地图出口与回门符读取封场（`arenaSealed`） | 内核（世界系统）、千门第二批 |
| 5 | 施法条盾形边框、地面预警贴花、护盾条与失衡图标、声音字幕 | PK-M1-22、PK-M1-24 |
| 6 | 首领胜率与击杀时间的平衡测量 | PK-M1-42 |
| 7 | 注册表首需为"二"到"六"的字段 | M2、M3 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 系统接缝、实体字段只经世界端口、文本键 |
| [战斗][cmb] 3.9、9.4、10、11、12.2、18、19.7、20、21 | 本包的规则、契约补充与验收行 |
| `src/systems/combat/boss/index.ts`、`telegraph.ts`、`affixes/index.ts`（文件头的说明） | 改动的接缝 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | 随机只走命名流：命中词缀、澱热失控、伤病概率与淬体反冲走 `combat.proc`（只在概率小于 1 时抽），尸体起身走 `combat.spawn`；点名、追门、增援出生点不抽随机 | `tests/architecture.test.ts`；`tests/boss_mechanics.test.ts` 的重放用例 |
| 系统边界 | 战斗读澱病只经其命令 `ailments.injure`；读迷宫只经 `dungeons/left_items.ts` 的端口；解法表达式用任务系统的纯求值器 `quests/conditions.ts`（千门与澱病同样引用）；实体只经世界端口 | `tests/architecture.test.ts` |
| 文本 | 新拒绝原因与修正项说明是 `sys.combat.*` 键；首领台词是内容键（`c.monsters.<首领>.mechanics.…`） | `node tools/i18n/check.ts` |
| 内容编号 | 系统代码不写内容编号：机关读首领数据的地点 ID 或偏移，追门读数据的标签 | `tests/content_id_guard.test.ts` |

## 6. 文件范围

见 `progress.md` 的改动文件表。战斗以外的改动：`data/audio/cues.json`（一行 `telegraph_warn`）、`docs/40_design/world_state_registry.md` 与 `data/registry/vars.json`（`boss.<首领>.resolved`）、
`docs/40_design/content/catalog_abilities_talents.md`（6.3 后加新编号说明、7.7 改一句）、`tests/own_ability_ids.test.ts`（新编号与新 `idFields`）；
应 PK-M1-49 的请求：`data/crafting/config.json`（`drunk.aura`）、`src/systems/crafting/index.ts`（去掉一行导入）、删除 `src/systems/crafting/use_gate.ts`（使用门改由战斗的 `use_gate_port.ts` 注册）。
通关回归（`progress.md` 第 2 节的实施 2，分 B、C 两组可单独合入）：`src/game/autoplay/reach.ts`（新增）、`src/game/autoplay/player.ts`、`src/game/autoplay/fight.ts`、`tests/autoplay_reach.test.ts`（新增）、`tests/autoplay_party_ready.test.ts`（新增）。

## 7. 停止条件

dev_process 第 3.6 节全部适用。

## 8. 验证命令

```
npx vitest run --config vitest.config.ts tests/boss_mechanics.test.ts tests/combat_rules.test.ts tests/combat.test.ts tests/own_ability_ids.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npm test
npm run playthrough
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 新起会话的差异审查 | 必派 | 机制面广，覆盖与确定性 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、数据、测试、文档回写、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；按 `progress.md` 的文件清单提交 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 迷宫里的遗落包留多久 | 推荐：留到迷宫第 7 日吞掉（本包已按此接线，迷宫外照旧 3 日）；或一律 3 日（迷宫的吞并从不发生）。承接 PK-M1-50 README 第 11 节第 1 条 | 不阻塞 |
| 2 | 致命档与重击档的"标准档非坦克成员最大生命" | 推荐：非坦克职能裸装生命加标准档预算三分之一折成耐力的平均值（`standardMemberHp`，[战斗][cmb] 19.7）；或由 PK-M1-42 给出一张按等级的表 | 不阻塞 |
| 3 | 澱斑"体力恢复 -10%"的读法 | 推荐：生命恢复 -10%（本作没有独立的体力池，`hpRegen`）；或改为气息（`energy`）恢复 -10% | 不阻塞 |

[cmb]: ../../40_design/systems/combat_and_classes.md
[a1]: ../../30_story/arcs/act1_borderstone.md
[best]: ../../40_design/content/catalog_bestiary.md
[dgn]: ../../40_design/content/catalog_dungeons_bosses.md
[prg]: ../../40_design/progression_and_pacing.md
