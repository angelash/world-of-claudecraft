# PK-M1-15 同伴与队伍第一批（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-15` 同伴与队伍第一批 |
| 状态 | 进行中（实施与验证已完成，待主会话确认封包） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-15` |
| 形态 | 小包（三件；范围按[同伴][cmp]第 17.5 节标 M1 的行与计划包行列出的转入项切分） |
| 工作流 | 系统 |
| 量级 | 5 代理人日，0.3 用户人日 |
| 依赖 | PK-M1-11（战斗规则扩展，已完成）；承接 PK-M1-11、PK-M1-12、PK-M1-14、PK-M1-46、PK-M1-50、PK-M1-51、PK-M1-58 转来的同伴项 |
| 别名 | 无 |
| 立项日期 | 2026-11-18 |

## 1. 目标

[同伴与队伍][cmp]第 17.5 节标 M1 的十二行在内核里成立：希雅的招募条件、第一幕随队 3 位、并行经验与追赶倍数、羁绊关与红线、
羁绊与信任分立（门钥类型 `bond`）、"集火"指令、夜羽的个人规则、同伴行动的确定性、致命一击的重伤退场、铁人单向开关；
连同计划包行的其余各项：六层行为树、四姿态九指令、倒地起身与伤病退场、同伴对地面预警与点名的反应延迟、狩猎之门的兽伴与它守遗落包、
坐骑 `mnt_donkey`、契约之门的从契读取方（功能 `servant`）、临时同伴、希雅信任 70 以上不随家离开、同伴与有名 NPC 的澱染暴露与 `ailments.crystal_due`、
门纹孩子的免疫、同伴在迷宫入口外等候。U-10 与 U-11 按项目状态记录的推荐落实。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 名册：随队、候命、留守、休养、离队、冷离、泉畔、阵亡；第一幕随队 3 位、第二幕起 4 位；兽伴与临时同伴不占位；不在场的成员不在世界里，等级、经验与澱染记在名册上 | `src/systems/party/roster.ts`；命令 `party.invite`、`party.dismiss`、`party.swap`、`party.wait` | [同伴][cmp] 2.5、3.1、3.2 |
| 2 | 招募条件：邀请与雇佣读同伴数据的 `recruit.when`，剧情招募照旧写旗标；条件不成立时把旗标放回并发 `party.refused`；在场记录 `presence`（兽潮结束时希雅在玩家 20 格内） | `roster.ts`、`story.ts`；变量 `a1_tide_with_shiya` | [同伴][cmp] 2.1、2.5 |
| 3 | 经验：任务、首通与探索经验并行给随队同伴；追赶 ×2（低 3 级）与 ×3（低 8 级）；上限玩家等级 + 2；不在队的同伴得玩家所得的一半 | `src/systems/party/growth.ts` | [同伴][cmp] 4.2；[成长][prg] 3.3 |
| 4 | 羁绊：日常来源的羁绊关（个人线第 2、3、4 段之前分别至多 59、79、89）；击杀每游戏日合计至多 +3；礼物 1 + 品质、喜好 ×2、每游戏周计 3 件；剧情旗标、红线与个人线段不受关；红线一次一扣并发对峙钩子，三次红线主要同伴冷离 | `src/systems/party/bond.ts`、`story.ts`；命令 `party.segment`、`party.reconcile` | [同伴][cmp] 8.1 到 8.5、9.1 |
| 5 | 六层行为树（存活、写定、指令、避险、职责、跟随）；四姿态；九条战术指令；人格权重与个人规则（护短、护孩子、后撤线）；站位预设 | `src/systems/party/ai.ts`；命令 `party.order`、`party.tactic`、`party.formation` | [同伴][cmp] 7.1 到 7.5、3.3 |
| 6 | 反应延迟与规避：站进地面预警后按难度延迟（简单 0.3、普通 0.6、困难 1.0 秒）再走出；困难档首领大技能与 `needsOrder` 的点名只在"散开"或"去这里"时执行；被点名时按散开、追身、集合三类走位 | `ai.ts`（避险层） | [同伴][cmp] 7.5；[战斗][cmb] 10.3、10.5、16 |
| 7 | 倒地与重伤退场：倒地后全队脱战 15 秒起身，带倒地虚弱（轻伤由战斗挂）；致命一击（溢出不低于最大生命一半）、同一场第二次倒地（普通以上难度）、战斗以失败结束时仍倒地、剧情写定、澱化到期，都转重伤退场；休养基准 2 日（致命一击 +1、七日内每多一次 +1，1 到 4 日），全身装备耐久 -10% | `src/systems/party/wounds.ts`；命令 `party.wound` | [同伴][cmp] 7.6、11.1 到 11.3；[成长][prg] 10.1 |
| 8 | 铁人：第一次写入定下；关闭不可逆，之后的开启被放回并发 `party.ironman` 的 `refused`；铁人下护命期外的致命情形进泉畔（7 日，从者 14 日，兽伴 3 日），到期阵亡并写 `companion.<人>.lost` | `src/systems/party/ironman.ts`、`wounds.ts`；命令 `party.ironman_off` | [同伴][cmp] 11.4 |
| 9 | 契约之门的从契：功能 `servant` 为真时，对力竭的侵蚀者或可净化的异兽"伸手"；从者位 2（夜羽占一位），每次门疲 +20；从兽随队时占随队位 | `src/systems/party/pets.ts`；命令 `party.pact`；查询 `pactCandidates` | [千门][td] 3.7、8 第 3 行、15.1 |
| 10 | 狩猎之门的兽伴：猎之门已开才能驯；只驯可驯物种的普通个体，等级不高于门阶；一只出战，不占随队位；等级 min(门阶, 种限, 历练等级 + 2)；守物的兽在玩家退回门内时留守遗落包 | `pets.ts`；`data/party/pets.json`；命令 `party.tame`、`party.release`；查询 `bagKeeper` | [同伴][cmp] 2.3；[千门][td] 15.2；[生灵][cre] 3.3、3.6、9 |
| 11 | 坐骑：驴 `mnt_donkey`（同时是一件物品，15 银）；骑乘玩家持有的坐骑，卖掉即下鞍；给旅行的查询：日行程与"澱度三站住不走"（旅行的读取是请求） | `src/systems/party/mounts.ts`；`data/party/mounts.json`；命令 `party.ride`；查询 `activeMount`、`rideDayKm`、`mountStops` | [生灵][cre] 10.1；[旅行][trv] 2.4 |
| 12 | 临时同伴：护送、营救、陪同目标里带同伴卡的人（第一幕招募前的希雅、罗恩）在该任务阶段里随玩家作战；双腿仍是 NPC 系统的跟随指令 | `src/systems/party/temps.ts` | [任务与事件][qe] 5；`src/systems/npc/brain/quest_orders.ts` |
| 13 | 希雅随家离开：`a1_shiya_family` 为 `left` 且信任不到 70 时离队，第二幕第 5 周（或第三幕起）回来；信任 70 以上留下 | 同伴数据 `leaves`；`story.ts` | [第一幕][a1] 4.4 |
| 14 | 澱染暴露：每游戏时辰在澱病系统取样之前登记随队同伴与有名 NPC 的身体；带 `door_mark` 标签的不登记、身上的澱染洗掉；`ailments.crystal_due` 到期：同伴重伤退场且澱染置 50（铁人下死亡），有名凡人死亡；不在场同伴的身体经澱病系统的 `takeBody`、`putBody` 由同伴系统保管 | `src/systems/party/exposure.ts`、`roster.ts`；`src/systems/ailments/slice.ts`（两个端口） | [成长][prg] 9.1、9.3；[第一幕][a1] 7.2 |
| 15 | 迷宫入口外等候：留守的同伴原地守着、不随玩家过图、不计入 `isInParty`（迷宫人数上限因此只数进去的人） | `party.wait`；`view.ts` 的 `isInParty` | [迷宫][dgn] 1.4 |
| 16 | 首领机制的同伴侧：夜羽的标志技能"鸦群"`sk_yeyu_ravenswarm`；首领护盾写明由某技能击碎时，会这项技能的同伴在护盾在时对它使用 | `data/party/abilities.json`；`ai.ts` | [战斗][cmb] 10.4、10.8 |
| 17 | U-10：重伤休养取同伴文档的 2 日，回写成长第 10.1、19 节；U-11：罗恩 11 级、欧拉 27 级按人物表落到数据 | `data/party/companions.json`；[成长][prg] 10.1、19 | [project_state.md](../../60_production/project_state.md) 第 6 节 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 各幕锚点、雇佣欠薪、任职与统兵互斥、休养随庭院扩建与医疗官员减日、将领档案推导与阵亡转重伤、归队后 7 日的最大生命 -15% | PK-M2-14 |
| 2 | 五道关与过关事件（含淬体破关调用 `temperBacklash`）、合法复活 `party.revive`、渡魂、剧情之死、后日谈命运表 | PK-M3-14 |
| 3 | 人格权重对战术的细调、内置 AI 按姿态亲和替同伴选姿态、队内闲聊与营地谈话、危急解围与探望的羁绊 | PK-M1-21 |
| 4 | 兽伴的喂食与饱足、兽舍、伴契深化与名伴、复活兽伴与希尔薇的许可、从兽复澱 | 生灵的后续包（M2） |
| 5 | 同伴窗口、名册、指令轮盘、铁人开关的界面 | PK-M1-22、PK-M1-57 |
| 6 | 买驴的任务与驿站货架（A1-S30）、随行同伴的数据（德里斯等） | PK-M1-33、PK-M1-28 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 相位、切片、端口、文本键、内容编号 |
| [同伴][cmp] 2 到 4、7、8、11、17 | 本包的规则与验收行 |
| [千门][td] 3.7、15、23 | 从契、半契与功能读取方 |
| `src/systems/party/index.ts` 与各模块文件头 | 改动的接缝 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性 | 行为树不抽随机；同一局面同一反应；倒地溢出由每 tick 的生命快照与本 tick 的命中算出，存在切片里 | `tests/architecture.test.ts`；`tests/party_companions.test.ts` 的确定性用例 |
| 系统边界 | 不改战斗；战斗只经导出端口与查询读写；条件只经纯条件模块（`quests/conditions.ts`、`quests/calendar_terms.ts`）求值 | `tests/architecture.test.ts` |
| 内容编号 | 系统代码不写人物、门、魔物编号：招募条件、红线、离队、在场记录、护命期、驯兽与从契的前提都在数据里 | `tests/content_id_guard.test.ts` |
| 文本 | 拒绝原因、姿态、指令与名册状态是 `sys.party.*` 键 | `node tools/i18n/check.ts` |
| 存档 | 新字段一律可缺省；无 `state` 的旧成员按随队处理 | `tests/party_save.test.ts` |

## 6. 文件范围

见 `progress.md` 的改动文件表；越界改动在同表标出。

## 7. 停止条件

dev_process 第 3.6 节全部适用。

## 8. 验证命令

```
npx vitest run --config vitest.config.ts tests/party.test.ts tests/party_companions.test.ts tests/party_save.test.ts
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
| 总闸 | 必派 | 一次贡献结束 |
| 新起会话的差异审查 | 必派 | 范围广，覆盖、确定性与存档 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、数据、测试、文档回写、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；按 `progress.md` 的文件清单提交 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 夜羽、希雅、奈拉加入时的等级 | 数据仍是 3、5、8，人物表与锚点表写 12、8、21（U-11 只点了欧拉与罗恩）。推荐：随 PK-M2-14 的锚点一起改（锚点是 M2 行）；另一种是现在就改为人物表的值，第一幕战斗会明显变轻 | 不阻塞 |
| 2 | "兽潮之夜与她并肩"的判定 | 推荐：本包的在场记录（兽潮结束那一刻她在玩家 20 格内，写 `a1_tide_with_shiya`）；另一种是由兽潮结算（PK-M1-52）按它自己的口径写同一个变量 | 不阻塞 |
| 3 | 夜羽的标志技能"鸦群"的数值 | 现为射程 10、冷却 30 秒、目标失明 3 秒（借用 `aur_mon_blinded`，受伤即醒）；推荐由技能目录登记正式编号与数值后替换 | 不阻塞 |
| 4 | 战斗中撤离地图算不算"战斗以失败结束" | 推荐：算（同伴文档 11.2 的"用回门符撤走而同伴倒在原地"），战斗结束后正常过图不算 | 不阻塞 |

[cmp]: ../../40_design/systems/companions_and_party.md
[td]: ../../40_design/systems/thousand_doors.md
[cmb]: ../../40_design/systems/combat_and_classes.md
[prg]: ../../40_design/progression_and_pacing.md
[cre]: ../../40_design/content/catalog_creatures_mounts.md
[dgn]: ../../40_design/content/catalog_dungeons_bosses.md
[trv]: ../../40_design/systems/travel_and_exploration.md
[qe]: ../../40_design/systems/quests_and_events.md
[a1]: ../../30_story/arcs/act1_borderstone.md
