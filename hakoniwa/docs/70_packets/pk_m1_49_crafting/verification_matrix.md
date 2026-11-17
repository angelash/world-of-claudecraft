# PK-M1-49 采集与生业内核：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（本包验收全过；请求与遗留见 `progress.md`） |
| 末次代码或内容变更 | 未提交；改动文件见 `progress.md` 2026-11-18 汇报 |
| 完整实跑 | 2026-11-18，工作区状态（其他代理的未提交改动同在） |
| 审查 | 覆盖性复查（新起会话，只读）：1 条 BLOCKING、13 条 SHOULD-FIX 与若干 NIT，处理见第 3 节 |
| 遗留 | 见 `progress.md` 的"留给后续包的事项" |

## 1. 验收条目

| 序 | 验收 | 命令或评审 | 结果（原样要点与量化数字） | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 采集单测：技能阶与工具阶的门槛、高一阶减半、徒手只采一阶点、工具磨损、刷新日、可采次数与只随事件的点、可采条件（夜里）、站位、死者不能采、按地点澱度的澱染（澱度三轻档、五重档，站在地点外也一样）、稀有事件五倍且署名 `unrecorded`、`gather.done` 的载荷、按种子可复现 | `npx vitest run --config vitest.config.ts tests/crafting.test.ts` 的 rules 与 gathering 组 | 通过 | `tests/crafting.test.ts` | PASS |
| 2 | 制作单测：工站类与档、需求技能、学会条件、投入不够时不扣任何东西、替代投入、主料澱纹（未净与已净）、副产、杰作高一档且署名并记第一件、节流（一游戏分钟 10 次）、精炼与附纹经工坊端口（技能、级别、槽位、工站费）、精炼与附纹只发 `crafting.worked` 不发 `craft.done`、`craft.done` 的载荷 | 同上 crafting 组 | 通过 | 同上 | PASS |
| 3 | 品质分布可复现：同一种子 300 次制作的杰作序列逐件相同；换种子序列不同；杰作数在 4 到 30 之间（四档工站与技能升到 T2 后约 4% 到 5%） | 同上 "draws masterworks reproducibly" | 通过 | 同上 | PASS |
| 4 | 熟练度到第一幕上限：开局上限 25，第一幕 50；高于上限的技能不被削；四态曲线（全、半、四分之一、零）；技能授予只收剧情与脚本 | 同上 skill caps 组 | 通过 | 同上 | PASS |
| 5 | 路由项：铁匠按对口生业修理与 `crafters` 数据（巴尔加 35）；T6 件只在 T6 修理点修（扣主料与钱）；匠契折减；金鳞信物两个附纹位、劣品仍为 0；深锤第四级要 125、其余件三级封顶；涂层（无武器拒绝且不消耗、上涂层、武器命中触发并扣次数、主手损坏时不扣、用完消失并发事件） | 同上 routed 组 | 通过 | 同上 | PASS |
| 6 | 使用闸门：登记的闸门拒绝时不消耗物品；不持有的物品先报"缺物品"；战斗转来的使用不再查；与真战斗系统一起时，战斗中饮酒报 `in_combat`（原因键 `sys.combat.reject.item.in_combat`）、药水照常 | 同上 use gate 组 | 通过 | 同上 | PASS |
| 7 | 醉意：每杯 2 层、至多 10 层、每游戏时辰 -1、醒酒丸清零并 10 游戏分钟内不叠加；层数等于所配光环的层数 | 同上 | 通过 | 同上 | PASS |
| 8 | 内容：发行数据通过本包校验；坏数据逐条报出（醉意光环、T6 次数、地点不存在、一档纹台、装备品质对工站档、缺杰作产出、未知副产、经济不变式、人物与技能范围）；`ItemUse` 新字段与涂层的校验；边石镇铁匠铺用发行数据炼出一锭铁 | 同上 shipped data 组 | 通过 | 同上 | PASS |
| 9 | 存档：带采集点时钟、醉意、节流与技能的世界存档往返哈希不变、续跑一致；没有切片的旧存档校验通过、第一次用到时建切片；坏切片与更新版本的切片被拒；采集点改名落到切片 | `npx vitest run --config vitest.config.ts tests/crafting_save.test.ts` | `Tests 4 passed (4)` | `tests/crafting_save.test.ts` | PASS |
| 10 | 本包两份测试合计 | `npx vitest run --config vitest.config.ts tests/crafting.test.ts tests/crafting_save.test.ts` | `Tests 40 passed (40)`（36 加 4） | 同上 | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 零错误 | PASS |
| 相关套件 | `npx vitest run --config vitest.config.ts tests/crafting.test.ts tests/crafting_save.test.ts tests/inventory_instances.test.ts tests/inventory_save.test.ts tests/combat.test.ts tests/architecture.test.ts tests/content_id_guard.test.ts` | 是 | `Test Files 7 passed (7)`、`Tests 162 passed (162)`（复查修正之后） | PASS |
| 全量单测 | `npm test` | 是 | 22 个失败全部不属本包，见第 4 节 | PASS（本包） |
| 内容校验 | `node tools/content/validate.ts` | 是 | V1 到 V10 全部 ok（V4 332、V5 9、V6 9、V7 3、V9 9 条警告，全为既有） | PASS |
| 变量注册表 | `node tools/registry/build.ts --check` | 是 | `Tests 37 passed (37)`；本包未新增变量 | PASS |
| 文本检查 | `node tools/i18n/check.ts` | 是 | `text check: 0 finding(s)`，2327 处键使用 | PASS |
| 生成物 | `node tools/i18n/gen_keys.ts`、`node tools/i18n/extract_content.ts` | 是 | 键 2911 个；内容文本 6664 键、60 张表 | PASS |
| 改动文件格式 | `npm run format -- <改动的 TS 与 JSON>` 后 `biome check` | 是 | 42 个文件零错误、零格式差异 | PASS |
| 禁用字符 | 对改动与新增文件扫描破折号、U+2015、emoji、U+2600 到 U+27BF | 是 | 零命中 | PASS |
| 无模型通关 | `npm run playthrough` | 是 | 未跑完，见第 4 节 | VERIFY |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 覆盖性复查（新起会话，只读） | 一次贡献结束 | 首轮有 BLOCKING；修复后第 1、2 节重跑 | 1 | 13 | BLOCKING：测试里 `reduce` 的类型（已修）。SHOULD-FIX 已修：澱染按采集点所在地点；死者不能采集与制作；涂层在主手损坏时不扣、只能 `on: hit`、必须是消耗品；`inventory.use` 先判"缺物品"再问闸门；精炼与附纹改发 `crafting.worked`；装备产出对工站档、缺杰作产出、一档纹台、T6 采集点次数、醉意光环引用的校验；副产 `byproducts`；`runs` 非数；多次制作的杰作说明。转用户决定：工具门槛、匠契只折属性、深锤第四级技能、醒酒丸时长、`stn_` 前缀。转请求或后续：醉意光环与闸门登记归战斗、材料阶加成与来历、带澱染料理的按份澱染、多变体配方 | 本会话 |

## 4. 全量实跑与基线问题

| 命令 | 结果 | 本包相关的失败 | 其余失败与归属 |
| --- | --- | --- | --- |
| `npm test`（复查修正之后，2026-11-18 00:59 起，同机另有两路通关在跑） | `Test Files 14 failed, 152 passed (166)`；`Tests 22 failed, 3387 passed, 2 skipped (3411)`；318.9 秒 | 无：`tests/crafting*.test.ts`、`tests/inventory_*.test.ts`、`combat`、`architecture`、`content_id_guard`、`i18n_kernel_guard`、`save_migration` 全过 | 地图重建（PK-M1-35）：`time_skip` T-08、T-09（床、营地、警戒圈）、`party` 跟随距离、`client_hd2d` 已建地图；序章（PK-M1-27）：`client_player_input` 空名、`docs_guard`（`pk_m1_27`、`pk_m1_24` 的 README 链到未建的文件）；战斗进行中（PK-M1-12）：`own_ability_ids` 两条、`doors_costs` 门疲（门疲的回落取决于战斗的退回门内流程，`death.ts`、`death_costs.ts` 正在改；该测试的装配不含本系统）；素材（基线）：`art_manifest`；负载超时：`core` 的时辰事件（单跑通过）、`ailments` 跳时、`ailments_pacing`、`disputes` 20 种子、`doors_hints`、`registry` 的整日旗标守卫 |
| `npm run playthrough` | 未跑完：00:52 起跑全部通关文件；`npc_alive_1` 到 `npc_alive_4` 各在约 2010 秒时超过 30 分钟的单测时限（同机另有一路全量通关与 NPC 通关在跑，度量数据本身正常、`stuck` 为 0）；其余文件（含 `act1_minimal`、`release`）在汇报时仍在跑（`replay_segments` 单跑也要约 64 分钟） | 无结论 | VERIFY：建议主会话在负载低时跑 `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts`；本系统不进自动玩家的行为（自动玩家不采集、不制作、不用物品），对通关的影响只有新切片与两个事件订阅 |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 醉意在战斗里的效果（精神、抗压、踉跄） | 光环 `aur_st_drunk` 还不在战斗数据里 | PK-M1-12 补光环后在战斗测试里验 |
| 第一幕常规路线上的采集与制作 | 第一幕条目与自动玩家的生业行为都还没有 | PK-M1-31、PK-M1-42 |
