# PK-M1-15 同伴与队伍第一批：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS：[同伴][cmp]第 17.5 节标 M1 的十二行全部 PASS；"无模型"两行（每个里程碑）在本次实跑里被第一幕路线的停滞挡住（玩家在 `borderstone_north` 反复死亡，招到任何同伴之前），去掉同伴系统同样停滞，与本包无关（第 3 节） |
| 末次代码或内容变更 | 未提交；改动文件见 `progress.md`；末次改动是新起会话审查后的修复（身体保管端口、同 tick 归队、冷离、集火与避险的层次） |
| 完整实跑 | 2026-11-18，工作区状态（与 PK-M1-12、PK-M1-19、PK-M1-20、PK-M1-27、PK-M1-35 的并行改动同在一棵树上） |
| 审查 | 新起会话的覆盖审查一次：2 BLOCKING、16 SHOULD-FIX、15 NIT；处理见 `progress.md` |
| 遗留 | 见 `progress.md` 的请求回写与"留给后续包的事项" |

## 1. 验收条目：同伴第 17.5 节标 M1 的行

测试文件 `tests/party_companions.test.ts`（42 个用例）；命令 `npx vitest run --config vitest.config.ts tests/party_companions.test.ts`。

| 组 | 验收 | 结果 | 证据位置（用例名） | 状态 |
| --- | --- | --- | --- | --- |
| 招募 | 条件 | `a1_forest_accord` 为 `broken` 且不在场：`party.invite` 被拒（`unwilling`），剧情写的招募旗标被放回 `false`、不入队、发 `party.refused`；林约未破：邀请成功入队；兽潮结束时她在玩家 2 格处：写 `a1_tide_with_shiya`，可招募；远处不记 | "Shiya refuses while…"、"either condition is enough…"、"nobody far away…" | PASS |
| 队伍 | 随队位 | 第一幕夜羽、希雅、罗恩入队后欧拉为候命、不在世界里、`party.swap` 被拒（`party_full`）；切到第二幕后换入成功，随队 4 人，欧拉 27 级 | "act 1 takes three companions…"、"from act 2 a fourth companion joins" | PASS |
| 成长 | 并行经验 | 同一种子同一只怪，有三名同伴与无同伴时玩家的击杀经验相同且大于 0；300 点任务经验：玩家 +300，6 级玩家身边的希雅（5 级）同得 300，高于玩家 + 2 的罗恩不再升 | "the player earns the same for a kill…"、"quest experience reaches each companion in full…" | PASS |
| 成长 | 追赶 | 倍数表：低 8 级 ×3、低 3 级 ×2、低 2 级 ×1；20 级玩家身边 5 级的希雅得 200 点任务经验的 600；击杀份额之外另得 2 倍补差（原因 `catchup`） | "catch-up: a companion eight levels under…"、"catch-up adds to the kill share…" | PASS |
| 羁绊 | 关 | 个人线第 2 段之前：喜好礼物从 55 推到 59 为止，同场击杀也不再加；剧情旗标（狩猎完成）+15 到 74；`party.segment` 第 2 段之后新一周的礼物推到 79 为止；玩家来源的 `party.segment` 被拒 | "daily sources stop at 59 before personal-line segment 2…" | PASS |
| 羁绊 | 红线 | 握住澱核（`a1_core_choice == grasp`）：夜羽 35 到 15，`party.red_line` 为 `{ yeyu, RL-yeyu, -20, 1 }`，同一道线不再扣；入队前已成立的红线既不扣也不计数 | "act 1 red line…"、"a red line that already held when she joined…" | PASS |
| 羁绊 | 分立 | 羁绊在 party 切片，没有 `bond.` 旗标，`trust.ron` 不变；门钥 `bond`（罗恩 60）读羁绊，羁绊落回 30 后跨过的门槛仍算；非同伴的门钥 `trust`（布伦 40）读信任 | "the bond lives in the party slice…" | PASS |
| 战斗 | 指令 | 三名同伴在"跟随"姿态下各打各的，玩家选中 A 并下"集火"后，12 tick 内三人的目标都是 A | "focus: after the order every companion targets what the player targets" | PASS |
| 战斗 | 人格 | 夜羽"被动"；玩家生命 25% 被攻击：发 `party.rule`（`guard`，目标为攻击者），攻击者挂上 `aur_mon_blinded` | "Yeyu, passive, sends her ravens…" | PASS |
| 战斗 | 确定性 | 同一种子同一操作跑两次，同伴的施法与伤害事件序列逐条相同（多于 5 条） | "the companions act the same in two runs…" | PASS |
| 重伤 | 条件 | 剩 30% 生命时吃满额一击（溢出 70%）：`party.wounded` 为 `fatal`、3 日，状态 `resting`，实体移出，镜像 `companion.ron.state = resting`；剩 30% 吃 60%（溢出 30%）只倒地；同一场第二次倒地：`second_down`、2 日 | "a blow that overflows…"、"a blow with little overflow only downs…" | PASS |
| 铁人 | 单向 | 开启后 `party.ironman_off` 成功，变量为假；再写真被放回假，事件 `on`、`off`、`refused`；再关被拒（`not_ironman`）；开局写假之后写真同样被放回、切片为 `off` | "turned off it stays off…"、"a run begun without ironman…" | PASS |
| 无模型 | 人格 | 第一幕路线里夜羽的个人规则、口头禅与称呼 | `npm run playthrough` | VERIFY（路线在招募夜羽之前停滞，见第 3 节） |
| 无模型 | 通关 | 关闭模型从序章到离手 | `npm run playthrough` | FAIL（外因：见第 3 节） |

## 2. 计划包行其余各项与通用检查

| 序 | 验收 | 命令或评审 | 结果 | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 六层行为树、四姿态、九指令 | `tests/party.test.ts`、`tests/party_companions.test.ts` | 协助打玩家的目标；治疗者治最伤的人；守嘲讽打玩家的敌人；被动不出手；集火；护短规则；反应延迟；被点名走开；护盾技能 | 各用例 | PASS |
| 2 | 倒地起身与伤病退场 | 同上 | 敌人消失后全队安静 15 秒起身，带 `aur_st_downed_weak`；玩家倒下时倒地的同伴转重伤（`defeat`）；剧情重伤休养 2 日（`until - tick = 2 × 28800`，`injured_until = 2`），两日后回到队伍、11 级 | "a downed companion gets back up…"、"the player falling while a companion is down…"、"rests two game days…" | PASS |
| 3 | 铁人下的战殁与护命期 | 同上 | 奈拉（无护命期）进泉畔、镜像 `dead`，7 日后 `dead` 并写 `companion.nera.lost`；罗恩（护命到千军之门）照旧休养；旧存档（变量为真、切片无记录）照旧按铁人 | "under ironman an unprotected fall…"、"an older save with ironman on…" | PASS |
| 4 | 同伴反应延迟 | 同上 | 普通难度：站进预警后 10 tick 内一动不动，2 秒后已走出预警格 | "stands for the difficulty delay…" | PASS |
| 5 | 首领机制的同伴侧（PK-M1-12 交来） | 同上 | 被点名（散开）的同伴走到玩家 3 格外；只有"鸦群"能破的护盾在时，夜羽对它放"鸦群" | "a marked companion steps out…"、"Yeyu turns her ravens on a shield…" | PASS |
| 6 | 契约之门的从契（千门第 23 节 F 行 `servant`） | 同上 | 功能为假时 `party.pact` 被拒（`locked`）；为真时力竭的侵蚀者结为从兽（同伴一方、门疲 10 到 30）；夜羽加一只从兽占满两位后再结被拒（`no_place`）；未力竭的被拒（`not_bindable`） | "without the feature the hand is not offered…"、"only a yielded being can be bound" | PASS |
| 7 | 狩猎之门的兽伴与守遗落包 | 同上 | 门未开被拒；开门后驯服灰毛狼，不占随队位，等级 min(门阶 5, 种限 20, 6 + 2) = 5，门阶 30 时为 8；第二只被拒（`one_pet`）；守物的野猪在玩家过图后留在遗落包所在的地图，包被取回后跟上 | "tames a wolf once the door is open…"、"a bag-keeping beast stays…" | PASS |
| 8 | 坐骑 `mnt_donkey` | 同上 | 没有驴时拒绝；持有后可骑，日行程 27.5，澱度二不停、三止步；卖掉即下鞍 | "rides a donkey the player holds…" | PASS |
| 9 | 临时同伴 | 同上 | 陪同目标的希雅（带职能标签的 NPC）在该阶段里由同伴系统驱动、不占随队位、不计入 `isInParty`；阶段推进后关系解除，人还在 | "a carded person walks and fights…" | PASS |
| 10 | 希雅随家离开 | 同上 | 信任 50 时 `a1_shiya_family = left`：离队（镜像 `left`），第二幕第 5 周回来；信任 75 时留下 | "leaves with her family below trust 70…" | PASS |
| 11 | 澱染暴露与 `ailments.crystal_due`、门纹孩子 | 同上 | 一个时辰后随队的罗恩与有名 NPC 布伦都有身体，带 `door_mark` 的诺伊没有，写给她的澱染一个时辰内洗掉；澱化到期：罗恩重伤（`crystal`）且带走的身体澱染 50，布伦死亡并发 `entity.died` | "enrols companions and named people…"、"a crystallised companion leaves…" | PASS |
| 12 | 迷宫入口外等候 | 同上 | 留守的罗恩不计入 `isInParty` 但仍占位；玩家过图后他留在原图，希雅跟上；叫回后跟到新图 | "a waiting companion stays put…" | PASS |
| 13 | 名册的保管（审查修复） | 同上 | 同日离队又归队澱染仍为 30；同一 tick 出去又进来的罗恩下一 tick 带单位回来、11 级；休养中跨过第三道红线，休养结束后冷离；个人线段重复报告只加一次羁绊 | "the roster keeps what a companion carries" 一组 | PASS |
| 14 | 存档往返 | `npx vitest run --config vitest.config.ts tests/party_save.test.ts` | 名册各状态、战术指令、铁人、兽伴、坐骑的世界存档往返后校验通过、哈希相同，各续跑 3 小时零 7 tick 哈希仍相同；没有 `state` 的旧成员按随队载入并能继续换人 | `tests/party_save.test.ts` | PASS |
| 15 | U-10、U-11 | 同上；文档 | 重伤休养基准 2 日（用例 2）并回写成长第 10.1、19 节；罗恩 11 级、欧拉 27 级（用例"joins at the card level…"、"from act 2…"） | `docs/40_design/progression_and_pacing.md` | PASS |

通用检查的数字见第 3 节。

## 3. 命令与数字

（末次代码改动之后在同一棵工作树上跑；并行包的失败单列。）

| 命令 | 结果 |
| --- | --- |
| `npx vitest run --config vitest.config.ts tests/party.test.ts tests/party_companions.test.ts tests/party_save.test.ts` | `Tests 57 passed (57)`（13 + 42 + 2） |
| `npm run typecheck` | 退出码 0，0 个错误 |
| `node tools/content/validate.ts` | 退出码 0；V1 到 V10 全部 0 错误（V4 332 条警告、V5、V6、V9 各 9 条、V7 4 条，均为既有） |
| `node tools/registry/build.ts --check` | 退出码 0；`vars.json` 为最新（725 名、128 族）；`tests/registry.test.ts` 37 passed |
| `node tools/i18n/check.ts` | 退出码 0；`text check: 0 finding(s)`，2372 处键名 |
| `npm test` | `Test Files 12 failed / 168 passed (180)`，`Tests 12 failed / 3555 passed / 2 skipped (3569)`，257.78 秒。12 个失败里 9 个是负载下超时，单独重跑：`core` 8/8、`dialogue_talk_extras` 15/15、`disputes` 33/33（全系统、注册表守卫开）、`goddess_reactions` 6/6、`i18n_kernel_guard` 14/14、`ailments_pacing` 1/1、`replay_segments` 6/6、`registry` 37/37 通过；`ailments.test.ts` 的长跳用例单独跑仍在 32.8 秒超时（它的系统表不含同伴系统）。其余 3 个是断言失败且不属本包：`art_manifest`（基线）、`client_hd2d` 的 `old_outpost` 场景布局（地图与 HD-2D，PK-M1-35）、`guild_events` 的导演选项（PK-M1-20） |
| `npm run playthrough` | 第一次（实施之后、审查修复之前）：`Test Files 9 failed / 1 passed / 1 skipped (11)`，`Tests 8 failed / 1 passed / 5 skipped (14)`，2734 秒。`npc_alive` 四组是对话包的 `TypeError`（`quests/progress.ts` 的 `activeQuests`，PK-M1-19，之后已修）；第一幕极简、真结局、梅尔卡之治、重放四条在 tick 641830 停滞（`no progress for 230400 ticks while: rest`，7 级，死亡 61 次，`q_a1_m02_raven` 之前，一名同伴都还没招到）；`replay_segments` 的准备阶段超时。诊断：玩家反复死在新地图 `borderstone_north`（PK-M1-35）的魔物手下；去掉同伴系统重跑，前 90000 tick 的死亡时刻与位置逐条相同，路线长度不受本包影响。第二次（末次改动之后）：`npc_alive` 四组按组均值失败（如传闻覆盖 0.39 到 0.48，阈值 0.5；该测试的系统表不含同伴系统）；四条路线仍卡在同一处，委托任务不断完成使停滞判定不触发，各跑两小时以上未完；`replay_segments` 存到第 36 档（tick 1080001，仍在第一幕）后超时；为不占用共享机器在 08:40 手动停止。另在末次代码上单跑 400000 tick 的诊断：死亡 39 次、没有招到同伴、停在同一处 |

[cmp]: ../../40_design/systems/companions_and_party.md
