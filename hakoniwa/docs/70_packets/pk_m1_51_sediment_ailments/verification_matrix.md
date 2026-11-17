# PK-M1-51 澱染暴露与澱病：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（遗留见 `progress.md` 的"留给后续包的事项"） |
| 末次代码或内容变更 | 未提交；改动文件见 [README.md](README.md) 第 7 节；末次改动是物品层交接（提前用药只记 2 点澱染、净纹抗性改读 `sedResist`） |
| 完整实跑 | 2026-11-17，工作区状态（与其他代理的并行改动同在一棵树上） |
| 审查 | 新起会话的覆盖审查一次：0 BLOCKING，11 SHOULD-FIX，11 NIT；处理见第 3 节 |
| 遗留 | 见 `progress.md` |

## 1. 验收条目

| 序 | 验收 | 命令或评审 | 结果（原样要点与量化数字） | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 暴露单测 | `npx vitest run --config vitest.config.ts tests/ailments.test.ts` | 各档整日漂移等于设计日率；地点热点覆盖地图档（北泉热点四级：+3，镇上：-0.3）；庭院每日 -2 且不低于 0；分段时辰按各自档计；净纹只减增量；穿未净重档皮甲在浓澱一日 +1.5，穿净纹中档 +0.8 | `tests/ailments.test.ts` 的 "taint arithmetic"、"exposure in the game"、"worn gear in game" | PASS |
| 2 | 发病单测 | 同上 | 9.2 表逐行（20、30、45、60、75、90）一致；只为下一阶段抽签、概率为 0 不抽；位阶 ×0.7、孩童 ×1.5；游戏内发病挂光环、镜像与事件；玩家澱化当日淤塞 +10、次日 +2、身体挂澱热光环 | 同上 "the dawn check of one body"、"sickness in the game" | PASS |
| 3 | 痊愈单测 | 同上 | 澱斑三日自愈（低于 15，回升重计），游戏内光环摘除、事件为 `self_heal`；澱热澱化不自愈；治疗按阶段降级、玩家来源被拒、非法阶段数被拒；消耗品按 `use.sed` 只治所列阶段 | 同上 | PASS |
| 4 | 伤病单测 | 同上 | 轻伤 3 日自愈并回写镜像；断肢到治疗为止、镜像 `limb`；玩家不得反冲与旧伤；退回门内清除伤病、保留澱染；NPC 反冲在 `sed.injury` 上抽旧伤 | 同上 "injuries"、"bodies besides the player" | PASS |
| 5 | 跳时 | 同上 | 长跳 30 小时与逐 tick 的身体、`sed.daily` 状态与全部 ailments 事件逐条相同（窗口含一次日检的抽签与一次伤病到期） | 同上 "time skip" | PASS |
| 6 | 孩子事件链接口 | 同上 | 镇内澱度 15、23、39；堵暗渠后 +3、封泉后 0、外部写入叠加；只在第一幕运行；米洛、托比、琳按条件推进与治愈 | 同上 "the town's sediment track and the children" | PASS |
| 7 | 第一幕常规路线的发病次数在设计范围内（20 个种子，无头） | `npx vitest run --config vitest.config.ts tests/ailments_pacing.test.ts` | 引擎与纯模型逐日一致；澱斑：16/20 个种子各 1 次（80%，范围 25% 到 90%）；澱热 0/20；澱化 0/20；全幕澱染总得均值 50.0（上限 72）；峰值澱染最小 24.1、中位 35、最大 46.2；耗时约 27 秒 | `tests/ailments_pacing.test.ts` 的输出行；`progress.md` | PASS |
| 8 | 伏击与目击改读局部澱度 | `npx vitest run --config vitest.config.ts tests/ailments_sediment_reads.test.ts` | 营地热点四级时伏击概率按四级算；别处热点不影响；两处源码只经 `sedimentAt` 读 | `tests/ailments_sediment_reads.test.ts` | PASS |
| 9 | 量表数据 | `tests/ailments.test.ts` 的 gauge 用例 | `ailmentGauge` 给出澱染（一位小数）、阈值 20/45/75、阶段、伤病与结束 tick | 同上 | PASS |

## 2. 通用检查

末次改动（物品层交接：提前用药、`sedResist`）之后在同一棵工作树上重跑；并行代理先前的失败在这一轮都已消失。

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 两个工程都无错误 | PASS |
| 本包测试 | 第 1 节三条命令 | 是 | `ailments.test.ts` 52 通过；`ailments_sediment_reads.test.ts` 4 通过；`ailments_pacing.test.ts` 1 通过（输出与第 1 节第 7 条相同） | PASS |
| 相关套件 | `npx vitest run --config vitest.config.ts tests/time_skip.test.ts tests/world_mechanics.test.ts tests/doors.test.ts`；`tests/architecture.test.ts tests/content_id_guard.test.ts tests/i18n_kernel_guard.test.ts tests/doors_costs.test.ts tests/cognition.test.ts tests/registry.test.ts`；客户端六份（`client_corridor_tracker`、`client_logic`、`client_adapters`、`client_world_mechanics`、`client_story`、`client_windows`）；全游戏六份（`quests`、`scenes`、`guild`、`disputes`、`act_clock`、`core`） | 是 | 69、98、117、142 通过，0 失败 | PASS |
| 内容校验 | `node tools/content/validate.ts` | 是 | all validators green | PASS |
| 注册表 | `node tools/registry/build.ts --check` | 是 | `vars.json` 最新（724 个名字、127 个族） | PASS |
| 文本 | `node tools/i18n/check.ts` | 是 | 0 finding；生成物已重生成 | PASS |
| 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 是 | 本目录无问题；唯一失败是 `pk_m1_54_prologue_stage` 的断链（其他包） | PASS（本包） |
| 改动文件格式 | `npm run format -- <本包的 TS 与 JSON>` | 是 | 已格式化；`rest.ts` 的一条既有警告不是本包的行 | PASS |
| 无模型通关 | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts` | 是 | 审查修正之后的一轮：2 通过（991 秒）；末次改动之后的一轮见 `progress.md` 末段 | PASS |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 覆盖审查（新起会话） | 一次贡献结束 | PASS-WITH-FOLLOWUPS | 0 | 11 | 已修：镜像旧事件回写、非法阶段数、病例治愈条件改为 `cure.when`（进入注册表规则检查）、同轮治愈、消耗品按阶段与 `use.taint`、净纹抗性、死者不抽签与不计时、玩家以外身体的澱化到期事件、反冲带旧伤、节奏实测按周等级与引擎里真穿澱纹、范围写进本包；转出：同伴与 NPC 自动纳入、光环写不出的效果、预防品、动态澱度、A1-M07 的写入（`progress.md`） | 本包 `progress.md` 第 2 节 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| 中途几轮（已消失） | `time_skip` 的"resumes a skip saved midway"、`cognition` 两例、`registry` 与 `core` 的 `npcBrain` 条件、`i18n_kernel_guard` 的 `sys.npc.*`、类型检查里 `cognition` 与 `src/client` 的错误 | 探针比对 JSON 往返的世界，只有 `npc` 切片不同；其余条目都在 `npc`、`cognition` 的并行改动里；本包对 `witness.ts` 只改一处读法，数据里没有任何地点带热点，`sedimentAt` 与原读法逐点相同。末轮全部通过 | PK-M1-18、PK-M1-22 |
| `tests/docs_guard.test.ts` | `pk_m1_54_prologue_stage/README.md` 指向不存在的 `verification_matrix.md` | 其他包的目录 | PK-M1-54 |
| `tests/world_mechanics.test.ts`（中途一轮，已消失） | 前缀表的文字多了 `dungeons` | PK-M1-50 改了 `src/content/entity_kinds.ts` | PK-M1-50 |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 7 | 常规路线自动玩家（目前只有极简路线），以及真实的吞服内容（晶药、未净饭食的条目） | PK-M1-10 与 PK-M1-42 接上常规路线后重测；PK-M1-13 与消耗品批次补条目 |
| 8 | 目击的读法只有源码守卫，没有行为测试（需要完整的 NPC 与认知装置） | PK-M1-18 的目击测试里补一个热点用例 |
