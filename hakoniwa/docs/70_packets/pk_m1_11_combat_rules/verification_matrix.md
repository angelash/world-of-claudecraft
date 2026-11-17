# PK-M1-11 战斗规则扩展：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS：战斗文档第 20 节标 M1、按第 21 节归本包的行全部 PASS；同表里归 PK-M1-12、PK-M1-13、PK-M1-15、PK-M1-42、PK-M1-51 与界面包的行在第 5 节列去处 |
| 末次代码或内容变更 | 未提交；改动文件清单见 `progress.md` |
| 完整实跑 | 2026-11-17；工作区状态（未提交，NPC、澱病、物品实例、客户端等并行包同时在改） |
| 审查 | 新起会话的覆盖性审查一次：16 条 SHOULD-FIX、14 条 NIT，处理见第 3 节 |
| 遗留 | 见第 5 节与 `progress.md` 的遗留表 |

## 1. 验收条目：战斗文档第 20 节标 M1 的行

测试文件 `tests/combat_rules.test.ts`（46 个用例）；命令 `npx vitest run --config vitest.config.ts tests/combat_rules.test.ts`。

| 组 | 验收 | 结果 | 证据位置 | 状态 |
| --- | --- | --- | --- | --- |
| 组队 | 玩家不摊薄 | 三名随队同伴时玩家所得与单人相同，都等于 `mobXpValue(5, 5)` | "玩家不摊薄 and 同伴另算" | PASS |
| 组队 | 同伴另算 | 每名同伴 `mobXpValue(5, 4) × groupXpBonus(4) ÷ 3` | 同上 | PASS |
| 组队 | 不给经验 | 首领增援（`summonerId`）被杀，玩家经验不变 | "不给经验" | PASS |
| 组队 | 落后补正 | 第二幕 13 级 ×1.5，第一幕 ×1 | "落后补正" | PASS |
| 命中事件 | 音效字段 | 持剑打穿板甲的人形：`sword`、`slash`、`plate`；未命中、闪避、招架的事件同带五个字段 | "a sword on plate" | PASS |
| 命中事件 | 缴械与重击 | 缴械中为 `unarmed`、`blunt`，武器技能被拒（`disarmed`）；标 `heavy` 的技能命中 `heavy: true` | "a disarmed hand" | PASS |
| 光环 | 按施加者 | 两名施法者各一份 `perSource` 持续伤害，两份各自跳伤 | "按施加者" | PASS |
| 光环 | 同组取最强 | 30% 与 50% 减速生效 50%，50% 到期后回到 30%；另用一组受伤修正（-10%、-30%）钉住组规则本身 | "同组取最强"两例 | PASS |
| 控制 | 时长上限 | 现行数据零问题；4 秒昏迷的魔物技能被内容校验报出；打断的学派锁定超过 4 秒同样报出 | "时长上限" | PASS |
| 控制 | 递减阶梯 | 18 秒内四次主动昏迷：120、60、30 tick、免疫（`resisted`、`dr`）；18 秒后第五次 120 | "递减阶梯" | PASS |
| 控制 | 类别独立 | 起手昏迷之后主动昏迷全额 | "类别独立" | PASS |
| 控制 | 谁递减 | 普通野兽四次全额；老魔物按阶梯；教学首领按阶梯 | "谁递减"、"the tutorial raven" | PASS |
| 控制 | 位阶缩放 | 6 秒对高两阶 3.9 秒，高两阶对低阶 8.1 秒（公式与实战两路） | "位阶缩放" | PASS |
| 控制 | 修正范围 | -90% 按 -75%（30 tick），+150% 按 +100%（240 tick） | "修正范围" | PASS |
| 控制 | 首领免疫 | 巢主可减速、免昏迷（`immune`）；迷宫之主免减速；两者的读条都被打断并挂学派锁定；不可打断的读条不被打断、不被沉默打断；免减速的首领照吃带减速光环的伤害 | "首领免疫"、"a slow-immune lord" | PASS |
| 控制 | 破除 | 瘫痪受 1 点伤害即解；恐惧受十分之一生命的一击必解；二十分之一时按概率解（30 次里 6 到 24 次） | "破除" | PASS |
| 驱散 | 顺序 | 两个魔法减益，一次驱散移除后施加的那个；毒类不受魔法驱散 | "two magic debuffs" | PASS（数据里的驱散类别见第 5 节） |
| 首领 | 软狂暴与难度 | 30% 的软狂暴：故事 25% 不触发、20% 触发；困难 34% 触发；标准 34% 不触发 | "软狂暴与难度" | PASS |
| 首领 | 观战 | 单挑开战时瑟格生命为 (1/3)^0.8 = 0.415 倍；同伴打他一下，观战的独眼团转敌对，`duel.ended` 平局；破盘后生命按比例回到满编值 | "观战"、"a companion does not join" | PASS |
| 首领 | 认输 | 守护巨鸦到 2% 停手并记 `boss.guardian_raven.yielded`（现有用例） | `tests/combat.test.ts`"the guardian raven summons" | PASS |
| 注册表 | 威压缺省 | 未写 `presence` 的高一阶单位在 6 格内给出 `aur_st_presence_unease`，6 格外没有 | "威压缺省" | PASS |
| 物品 | 耐久（死亡与战斗两路的调用） | 死亡：已装备件当前耐久减上限的 10%（50 到 45，经库存系统的 `applyDeathWear`）；一场战斗结束：减 1（`applyCombatWear`），只结一次 | "a death takes 10%"、"a fight that ends" | PASS（耐久本体是 PK-M1-13） |
| 死亡 | 五项代价 | 门疲下限 60；门阶 45 时复苏门疲状态 6 个游戏时辰；遗落包每叠 25% 与钱币 10%；已装备件不进遗落包；信徒视线内死亡 `witnessed: 1` 并发 `feat.performed`；走回遗落包取回 | "五项代价" | PASS |
| 死亡 | 过载 | 一个游戏日内第四次死亡：层数 3，门疲时长 ×2.5，淤塞 +9；淤塞读回执的层数 | "过载"、"doors take the overload stacks" | PASS |
| 死亡 | 复苏地点 | 庭院未开在神纹大厅（带 `revive` 标签的地点），开了在门内庭院 | "复苏地点"；`tests/combat.test.ts`两例 | PASS |
| 死亡 | 结算顺序 | 同一种子两次死亡结算的事件序列与世界哈希一致 | "结算顺序" | PASS |
| 倒地 | 起身与重伤 | 战斗侧：同伴倒地记本场倒地次数，整个队伍脱战后清零；起身、倒地虚弱与重伤退场在同伴系统 | "15.2: downs in a fight" | PASS（战斗侧）；其余转 PK-M1-15 |
| 难度 | 修正项 | 故事档登记八项修正（标准值以外的项）；故事档死亡后门疲下限 30、时长减半、不遗落钱；故事、标准、困难脱战可切换，战斗中切换被拒；传说档开局后不能切换也不能切入 | "修正项"、"a standard run registers nothing" | PASS |
| 可读性 | 施法条边框（数据面） | `combat.cast` 的 `start` 带 `interruptible`；`unitView` 的读条带 `interruptible`、光环带类别、驱散类别与递减阶 | "pushback and the readable cast bar" | PASS（数据面）；边框画法转 PK-M1-22 |
| 威压 | 新表 | 位阶差 1：命中 -3、伤害 ×0.92（公式）；位阶差 3 首次进入失神 3 秒，同场只一次，之后转压境 | `tests/combat.test.ts`"applies presence from one rank up"；"新表" | PASS |

物品实例层（PK-M1-13）的战斗侧（不是本包第 20 节的行，测试同在本文件）：战斗开始与生命跌破 30% 报触发点（带 `solo`），套组光环随穿戴挂上与摘下；
触发的 `chain`、`aura`、`cleanse` 结算，伤害带 `fromProc`；战斗中包扎被拒、药水不进公共冷却、战剂进公共冷却；带实例的工具不进遗落包。

本包另外钉住的规则（不是第 20 节的行）：编外者技架（8、12 格，未上架的技能被拒，战斗中锁定，升级补位）；门授资源池（当架池、脱战换脉、双脉）；
受击推迟至多两次；契约魔一只、血契生命上限 -15% 随残意在场；残意在遗迹深处走向灰烬室；记功（同伴单独击杀照记，守卫单独击杀不记，十分之一伤害）。

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npx tsc --noEmit -p tsconfig.json` | 是 | 战斗、千门、同伴、修正项与测试文件 0 错误；其余错误都在 NPC、澱病、物品实例、过场与客户端的未完成文件 | PASS（本包） |
| 本包与相关测试 | `npx vitest run --config vitest.config.ts tests/combat_rules.test.ts tests/combat.test.ts tests/own_ability_ids.test.ts tests/doors.test.ts tests/doors_costs.test.ts tests/doors_rank_seal.test.ts tests/party.test.ts tests/progression.test.ts tests/content_id_guard.test.ts tests/architecture.test.ts tests/save_renames.test.ts tests/save_migration.test.ts` | 是 | 全部通过 | PASS |
| 守卫 | `tests/i18n_kernel_guard.test.ts`、`tests/content_validation.test.ts` | 是 | 各 1 个失败：`ui.json` 的 `ui.mode.creator.row.hairColor` 键（客户端包）；V4 的 `npcBrain` 条件未登记（NPC 包）；与本包无关 | 基线（第 4 节） |
| 内容校验 | `node tools/content/validate.ts` | 是 | 末次改动之后 V1 到 V10 全绿 | PASS |
| 变量注册表 | `node tools/registry/build.ts --check` | 是 | `vars.json` 当前；附带的测试有 3 条失败，全部是 NPC 包的条件与旗标 | PASS（本包） |
| 文本 | `node tools/i18n/check.ts` | 是 | 0 条战斗键问题；20 条全部是 `sys.npc.*` | PASS（本包） |
| 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 是 | 11 passed | PASS |
| 改动文件格式 | `npm run format -- <改动的 TS 与 JSON>` | 是 | 已格式化；Biome 无告警 | PASS |
| 无模型通关 | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts tests/playthrough/rule_merca.playthrough.test.ts` | 是 | 末次改动之后：3 passed，768.78 秒 | PASS |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 新起会话的覆盖性审查 | 规则面广 | PASS-WITH-FOLLOWUPS | 0 | 16 | 修 13 条与多数 NIT（免减速只去掉减速、教学首领、千门读回执的过载、同伴与宠物不插手单挑、破盘回血、威压表修剪与只对玩家方发事件、学派锁定落在首领、校验新引用、遗落包物品改名、换算每 tick 一次、倒地计数按队伍的战斗、技架随等级补位、测试加强）；3 条转后续包（数据里的驱散类别与技能标记、双脉由玩家指定两池、伤病随复苏清除） | `progress.md` 2026-11-17 段 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `tests/architecture.test.ts` | `systems/ has no DOM access`：`src/systems/npc/brain/root.ts` | 文件属 NPC 包 | PK-M1-18 |
| `tests/i18n_kernel_guard.test.ts` | `sys.npc.*` 缺键；`ui.json` 坏键 | 键属 NPC 与客户端包 | PK-M1-18、PK-M1-22 |
| `tests/registry.test.ts`、`content_validation` V4 | `npcBrain` 条件未登记；`npc.*.at_spring` 写入 | 数据与代码属 NPC 包 | PK-M1-18 |
| `tests/time_skip.test.ts` T-16、`replay_segments`、`save_recovery` | 跳时与读档后世界哈希不同 | 首个差异在 NPC 切片的键序（`note` 与 `transit`）；战斗、千门与修正项三个切片经一次 JSON 读档走过战斗、死亡与复苏逐字节一致（临时检查，已删） | PK-M1-18 |

## 5. 未验证项与转出

| 条目 | 缺什么 | 去处 |
| --- | --- | --- |
| 首领各行（阶段计时、预警、增援、打断窗口、护盾、地形、追门、点名）、注册表第一幕字段与口径扩展、看到的灵压、可读性两路提示 | 首领机制库与魔物字段 | PK-M1-12 |
| 物品的归零、澱纹与精炼、触发三行、消耗品两行 | 物品实例与 `procs` | PK-M1-13、PK-M1-31 |
| 状态：醉意、澱热 | 光环的施加与消退（本包给了抗压字段 `presenceResist`，测试用醉意样式的夹具） | PK-M1-13（醉意）、PK-M1-51（澱热） |
| 倒地后的起身、倒地虚弱与重伤退场 | 同伴系统 | PK-M1-15 |
| 平衡两行 | 自动玩家的平衡回归 | PK-M1-42 |
| 可读性：画质与天气截图、施法条盾形边框的画法 | 客户端 | PK-M1-22 |
