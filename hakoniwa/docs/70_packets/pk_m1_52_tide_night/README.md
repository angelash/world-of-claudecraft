# PK-M1-52 兽潮之夜结算（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-52` 兽潮之夜结算 |
| 状态 | 进行中（建议主会话改为已完成，依据见 `verification_matrix.md`；遗留转去的包见 `progress.md` 第 3 节） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-52` |
| 形态 | 大包的量级按小包三件写（单会话完成，范围由计划包行与第一幕第 8 节写定） |
| 工作流 | 系统 |
| 量级 | 5 代理人日，0.5 用户人日 |
| 依赖 | PK-M1-45（已完成：幕时钟在暗月夜日落写 `a1_tide_night`）；PK-M1-46（已完成：纷争运行器的结局与决策点）；PK-M1-18（已完成：NPC 关系与记忆的端口）；PK-M1-50（已完成：`dungeon.overflow`、`dungeon.nest_stage`）；PK-M1-20（已完成：兽潮前兆 DB-A1-04） |
| 并行 | PK-M1-33（第一幕任务与纷争，同一主人）：`q_a1_m12_tide` 以 `a1_tide_night` 开启，按本包的旗标推进与完成；接口见第 6 节 |
| 立项日期 | 2026-11-18 |

## 1. 目标

兽潮之夜由内核结算：暗月夜日落开始，按小时走过黄昏、入夜、午夜前、午夜四个阶段，在巨像前等玩家把它打倒，澱流扑向当时最弱的一面、玛莎按条件出手，黎明写下伤亡、后果与归功；四道防线与东坡同时结算，NPC 按状态过滤后的行动判定表行事；魔物潮的波次是数据（`mtide_`），迷宫溢出与满巢也转成魔物潮。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 阶段与时刻：黄昏（日落）、入夜（+1 时）、午夜前（+3 时）、午夜（+4 时，巨像到来，等巨像倒下）、澱流（巨像倒下时）、黎明（6 时，且至少在澱流之后 1 时）；阶段变量 `a1_tide_stage` 0 到 5；各阶段的波次经旗标 `combat.wave.<ID>` 交给战斗的波次运行器 | `data/tide/nights.json` 的 `phases`；`src/systems/tide/night.ts` | 第一幕 8.2 |
| 2 | 四道防线与东坡：基础防御、各阶段压力、备战修正（修东栅 +15、暗渠已堵第一波 -10、墓地未净化第二拍南门 +10）、玩家 +40 与同行者各 +10、缺口 | `lines`、`mods`；`src/systems/tide/rules.ts`（`lineDefence`、`linePressure`、`gapOf`） | 第一幕 8.3、8.6 |
| 3 | NPC 行动判定表：20 名（组）当事人、46 行，按状态过滤，每个结算、巨像与暴民阶段开始时每人取一行（条件成立的行合法，没有一行成立时才轮到"其他"行；取第一个合法行，"任何情况"行叠加；黄昏与黎明不取）；选择者（NPC 大脑、模型提议）经命令 `tide.act` 只能在合法行里改选，从下一阶段起生效；死者不再行动，民兵与伐木工这样的群体在头领死后照常 | `actors`；`rules.ts`（`legalRows`、`pickRows`、`pickAll`）；`index.ts` 的 `tide.act` | 第一幕 8.4；内置 AI 第 5.8 节 |
| 4 | 玛莎出手：澱流扑向最弱面（托马的钟声先调去 10 点防御），缺口大于 0 时她一刀斩断、该面损失归零，写 `a1_martha_strike`、`npc.martha.revealed`；`npc.martha.assessment` 5 以上时黎明的那杯酒 `a1_martha_drink`；缺口为 0 时她旁观、`npc.martha.revealed = false`、澱流照常来 | `striker`；`rules.ts`（`weakestFace`、`surgeOutcome`）；`night.ts`（`startSurge`） | 第一幕 8.5 |
| 5 | 伤亡与后果：每线每阶段平民死亡（缺口 / 10 取整，乘欧拉、奈拉、罗恩的修正）；具名者的重伤（缺口 20 以上 50%，写 `npc.<人>.injury = major`）与死亡（缺口 40 以上 30%，跨幕保护者只重伤）、博罗与德里斯的特别规则，开小差与逃走的人（防御为负的岗位）不掷；缺口 30 以上损毁防线后的一处建筑；`a1_bs_survival`、`a1_bs_population`、`a1_bs_prosperity`、`npc.<人>.dead`、`a1_tide_other_dead`；信任（同守一线 +15、被救 +25、离开孩子 -20）；东坡被关在栅外的怨气（`tide.grievance` 事件，-30）；托比与琳；`a1_children_exposed`（A1-M11 把孩子留在玩家看得见的地方时不暴露）、`a1_children_location`；暴民（贝莎）无人拦阻时欧拉被拖出北门；林地之争冲突升级的伤亡 | `settle`、`mob`、`escalation`、`children`、`childrenAt`；`rules.ts`、`night.ts` | 第一幕 7.2、8.4、8.6；第一幕 4.4 |
| 6 | 归功：巨像战的具名目击者（在北门、跟着玩家、在巨像身边、在礼拜堂，或倒下时在玩家 10 格内），按倒下那一刻的信任；四个版本依次检验，写 `a1_tide_credit`；第一传播者随 `tide.ended` 事件发出；注册表的计算函数 `tide_attribution` | `credit`；`rules.ts`（`creditVersion`、`postedWitnesses`）；`night.ts`（`creditOf`）；`index.ts` | 第一幕 8.7；注册表 2.9 |
| 7 | 读第一幕纷争：`dispute.q_a1_d01_tax_and_bandits.choice.viro_raid`、`choice.moss_cart`、`a1_moss_fate`、`a1_oneeye_fate`、`a1_forest_accord`、`a1_oola_fate`；冲突升级的伤亡按 `dispute.q_a1_d04_forest_dispute.ending == broken` | 行动表的条件；`escalation` | 第一幕 4.1、4.2、4.4；PK-M1-46 的请求 |
| 8 | 魔物潮波次 `mtide_`：写定兽潮夜的八个波次（兽群、亡灵、墓地澱渣、巨像、四个方向的澱流）与林缘系统潮 `mtide_lotha_rim_wild` | `data/tide/waves.json`（并入 `waves` 表，战斗的波次运行器生成） | 魔物图鉴 7.1、7.2 |
| 9 | 迷宫溢出与满巢转成潮：`dungeon.overflow` 带 `toMap`、`dungeon.nest_stage` 到满巢阶，按规则表起潮，同一地区冷却 14 日（潮真的起了才计冷却） | `data/tide/surges.json`；`src/systems/tide/surges.ts` | 魔物图鉴 7.1、7.3；迷宫目录 1.1 |
| 10 | 测试与节奏报告 | `tests/tide_rules.test.ts`（行动表与结算逐行）、`tests/tide_night.test.ts`（运行时）、`tests/tide_pacing.test.ts` 与 `tests/playthrough/tide_pacing.playthrough.test.ts`（20 个种子的伤亡与归功分布） | 计划包行验收 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | `q_a1_m12_tide` 的任务数据（以 `a1_tide_night` 开启、按本包旗标推进与完成）与 A1-M11 的备战小目标 | PK-M1-33 |
| 2 | 兽潮的过场（`cut_a1_tide`、`cut_a1_martha`）与其中的玩家选择 | PK-M1-34 |
| 3 | 兽潮之夜的界面（防线状态、阶段提示、音乐层） | PK-M1-23、PK-M1-57 |
| 4 | 战斗的波次与首领机制（澱巨像的追门由战斗自己做） | PK-M1-12 与战斗内容 |
| 5 | 四个归功版本作为传闻的生成与竞争传播 | 认知的后续包 |
| 6 | 系统版魔物潮的失守代价（产出修正项、地块澱度） | 城建与经济的后续包 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| [act1_borderstone.md](../../30_story/arcs/act1_borderstone.md) 第 7.2、8 节 | 本包的规则 |
| [catalog_quests_acts1_3.md](../../40_design/content/catalog_quests_acts1_3.md) A1-M11、A1-M12、A1-D01、A1-D04 | 备战与兽潮任务、纷争节点 |
| [catalog_bestiary.md](../../40_design/content/catalog_bestiary.md) 第 7 节 | 魔物潮编成 |
| [catalog_cutscenes.md](../../40_design/content/catalog_cutscenes.md) `cut_a1_tide`、`cut_a1_martha` | 场景读写的变量与时机 |
| [world_state_registry.md](../../40_design/world_state_registry.md) 第 2.9、8.3、8.4、8.8.2 节 | 变量与计算函数 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性 | 掷骰只走命名流 `tide.fates`（防线上的具名者）与 `tide.escalation`（冲突升级），按表序抽取；阶段由游戏时间与旗标决定 | `tests/architecture.test.ts`；`tests/tide_night.test.ts` 的同种子与存档续跑 |
| 系统不写内容 ID | 地图、地点、人物、波次、变量名都在 `data/tide/` | `tests/content_id_guard.test.ts` |
| 文本 | 系统文本是键（`sys.tide.*`）；行动表的行描述是内容文本（`c.tide_nights.*`），用作人物的记忆 | `node tools/i18n/check.ts`、`tests/i18n_kernel_guard.test.ts` |
| 注册表 | 写入的每个旗标都已登记，写入者含 `tide` | `node tools/registry/build.ts --check`；注册表守卫（`flagPolicy: 'throw'`） |

## 5.1 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/tide/`（`types.ts`、`rules.ts`、`night.ts`、`surges.ts`、`slice.ts`、`index.ts`）；`src/content/packs/tide.ts`；`data/tide/`（`nights.json`、`waves.json`、`surges.json`）；`locales/zh-Hans/sys_tide.json`；`tests/tide_rules.test.ts`、`tide_night.test.ts`、`tide_pacing.test.ts`、`tide_harness.ts`、`tests/playthrough/tide_pacing.playthrough.test.ts`；本目录 |
| 越界改动（写进 `progress.md`） | `src/systems/npc/spawn.ts`、`src/systems/npc/index.ts`（读 `npc.<人>.dead` 的在场钩子）；`src/systems/quests/effect_types.ts`、`src/content/packs/quests.ts`（计算函数名 `tide_attribution`）；`tools/registry/parse.ts`（写入者系统 `tide`）；`docs/40_design/world_state_registry.md`（写入者列与新变量 `a1_seg_turned`）；`data/README.md`（`tide/` 一行）；生成物 `data/registry/vars.json`、`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` |

## 6. 接口（PK-M1-33、PK-M1-34、PK-M1-15 依赖的旗标）

时刻以开始旗标写入的那一刻为准（幕时钟在暗月夜日落 20:00 写 `a1_tide_night`）；"小时"是游戏时。

| 旗标或事件 | 值 | 何时写 | 说明 |
| --- | --- | --- | --- |
| `a1_tide_night`（读） | `true` | 幕时钟：暗月夜日落 | 兽潮之夜开始；已有 `a1_beast_tide_cleared` 时不再开始 |
| `a1_beast_tide_started` | `true` | 日落（与 `a1_tide_night` 同一 tick） | PK-M1-33 用它关掉任务里旧波次的兜底 |
| `a1_tide_stage` | 0 到 5 | 0 日落；1 入夜（+1 时）；2 午夜前（+3 时）；3 午夜（+4 时）；4 巨像倒下（`boss.dian_colossus.defeated` 或 `yielded`，或其波次清空）；5 黎明（6 时，且至少在 4 之后 1 时） | 巨像不倒，阶段停在 3，夜不会结束 |
| `combat.wave.<ID>` | `go` | 1：`mtide_lotha_rim`；2：`mtide_lotha_rim_undead`，墓地未净化时加 `mtide_lotha_rim_grave`；3：`mtide_lotha_rim_colossus`；4：`mtide_lotha_rim_surge_<面>`（玛莎斩断时不来） | 全部以 `a1_beast_tide_cleared` 收尾 |
| `a1_colossus_target` | `player`、`children` | 阶段 3 开始：玩家在北门 20 格内为 `player` | 德里斯"拿头功"在 `children` 时死 |
| `a1_children_exposed` | `true` | 阶段 3 开始（巨像扑向礼拜堂人群中的孩子），或巨像转向门纹孩子（`combat.door_seek` 的 `mark`）时 | 孩子在磨坊、或 A1-M11 把他们留在玩家看得见的地方（`a1_tide_prep.children_safe`）时不写 |
| `a1_bertha_mob` | `player`、`isa`、`dragged` | 阶段 2 结束：暴民起了且场景没写时兜底 | `dragged` 另写 `a1_oola_fate = fled`、`a1_oola_wounded = true` |
| `npc.<人>.dead` | `true` | 死的那一刻：阶段 1 开始（冲突升级）、阶段 1、2 结束（防线）、阶段 3 结束（德里斯）、阶段 4 开始（最弱面，未被斩断时） | NPC 系统随即把此人从地图上带走 |
| `npc.<人>.injury` | `major` | 重伤的那一刻（同上的时刻） | 谁来治好它是请求（见 `progress.md` 第 3 节） |
| `a1_tide_weakest`、`a1_tide_gap_weakest` | 面、缺口 | 阶段 4 开始 | 托马的 10 点已计入 |
| `a1_martha_strike`、`npc.martha.revealed` | `true`；`true` 或 `false` | 阶段 4 开始 | 缺口大于 0 才出手 |
| `a1_bs_survival`、`a1_bs_population`、`a1_bs_prosperity`、`a1_tide_other_dead`、`a1_tide_credit`、`a1_toby_state`、`a1_lin_state`、`a1_children_location`、`a1_martha_drink` | 见注册表 | 阶段 4 开始（澱流的数字在它扑出的那一刻就定了，结算随即写下，倒下后的过场可以马上读） | 托比若在兽潮时还没进三期，之后他进三期的那一小时写 `dead`；琳兽潮时没病，第 10 周起写 `healthy`，兽潮后才病且没治好则第 10 周写 `dead`；孩子的变量与 `a1_children_location` 已有值时不改 |
| 信任与记忆 | `trust.<人>` 经 NPC 关系端口 | 阶段 4 开始 | 每人记住自己这一夜做的事（至多两条） |
| `a1_beast_tide_cleared` | `true` | 阶段 5（黎明），本夜的最后一笔 | PK-M1-15 的 `a1_tide_with_shiya` 在它变真的那一刻按希雅与玩家的距离写入，含义不变 |
| 事件 | `tide.phase`、`tide.settled`、`tide.fate`、`tide.damaged`、`tide.strike`、`tide.mob`、`tide.rescue_attempt`、`tide.grievance`、`tide.ended`、`tide.surge` | 各自发生时 | `tide.ended` 带归功版本与第一传播者；`tide.surge` 带起了的与被挡住的波次 |
| 计算函数 | `compute tide_attribution` | 场景调用时 | 按目击者在巨像倒下那刻的信任与此刻的条件重算 `a1_tide_credit` |
| 读（场景写） | `a1_tide_post`、`a1_tide_left_post`、`a1_east_gate_ordered`、`a1_bertha_mob` | 黄昏段在阶段 1 之前写；暴民段在阶段 2 结束之前写 | 玩家的防线按实际站位：本阶段亲自玩过的游戏时间里至少一半站在某线 12 格内；整个阶段都在跳时里度过时，用黄昏选定的 `a1_tide_post` |
| 读（任务写） | `a1_tide_prep.east_fence`、`nera_stock`、`eastslope_in`、`barto_seg`、`a1_culvert_sealed`、`a1_graveyard_purified`、`a1_barto_family_safe`、`a1_moss_intercepted`、`a1_seg_turned` 等 | 阶段开始前 | 不读 `a1_defense`：各线的防御直接由来源算出 |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。

## 8. 验证命令

```
npx vitest run --config vitest.config.ts tests/tide_rules.test.ts tests/tide_night.test.ts tests/tide_pacing.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npm test
npx vitest run --config vitest.playthrough.config.ts tests/playthrough/tide_pacing.playthrough.test.ts
npm run playthrough
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起子代理） | 必派 | 一次贡献结束 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、数据、测试、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；本包验证命令绿 |
| 第 6 节的接口 | PK-M1-33、PK-M1-34 | 任务与过场按表读写 |

## 11. 需用户决定

见 `progress.md` 第 4 节。
