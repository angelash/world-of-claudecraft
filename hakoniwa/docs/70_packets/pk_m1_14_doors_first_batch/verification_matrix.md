# PK-M1-14 千门系统第一批：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS：第 23 节 M1 行里"Y 遗落"一行与"F 功能"的 `servant` 读取方不在本包落点（分别归 PK-M1-11 与 PK-M1-13、PK-M1-15），其余 M1 行 PASS |
| 末次代码或内容变更 | 未提交；改动文件清单见 `progress.md` |
| 完整实跑 | 2026-11-17；工作区状态（未提交，多个并行包同时在改） |
| 审查 | 新起的覆盖性复查一次，2 条 BLOCKING、13 条 SHOULD-FIX 与若干 NIT，处理见第 3 节 |
| 遗留 | 见第 5 节与 `progress.md` 的遗留表 |

## 1. 验收条目：千门第 23 节标 M1 的行

| 组 | 验收 | 命令或评审 | 结果 | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| R | 曲线钉点：P 为 4、15、37、55、74、94、182 时门阶为 5、15、30、40、50、60、99 | `npx vitest run tests/doors_rank_seal.test.ts` | 七个钉点逐一断言，钉点减一时各低一阶；4.3 表的十八列门槛与曲线文件逐阶相等；P 为 3 时门阶 4（门镜第一次读数） | `tests/doors_rank_seal.test.ts`"R: the door rank curve" | PASS |
| R | 只由开门推进：闭门、死亡、淤塞变化后门阶不变 | 同上 | 三扇门开后门阶 6（`doors.rank_up` 依次 3、5、6）；闭门、一次退回门内、澱染 40 折成淤塞 10 之后门阶与 `door_rank` 仍为 6 | 同上"only opening a door moves the rank" | PASS |
| S | 档位增量：开一扇中档门 `seal_points` +4；禁门另 +4 | 同上 | 中档 +4（镜像 2），中档禁门 +8（镜像 6），`danger_doors_opened` 1；`door.opened` 的 `sealDelta` 为 2、4；饱和在 99（198 点） | 同上"S: seal tiers in half points" | PASS |
| S | 阶段封顶：第一幕内 `seal_looseness` 达 20 时 `seal_stage` 为 1；进入第二幕升为 2 | 同上 | 第一幕 20 读阶段 1，换到第二幕升 2（`seal.stage_up` 0 到 1、1 到 2）；闭门让数值落回 15 以下，阶段不回退 | 同上"S: the stage is capped by the act" | PASS |
| S | `seal_unrest`：第一幕初门·醒与庭院不加；第三幕起只有遗迹地钥门与禁门加 | 同上 | 第一幕醒、庭院 0，观澜 +3，渊契 +18；第三幕普通门 0、共鸣（遗迹）+3、禁门 +6，`danger_doors_act3` 1；`unrestDelta` 逐幕断言 | 同上"S: seal_unrest by act" | PASS |
| U | 澱染折算：得 8 点澱染淤塞 +2 | `npx vitest run tests/doors_costs.test.ts` | 8 点得 2；余数留到下一次（11 仍 2，12 得 3）；澱染下降不退淤塞；档位跨越发 `doors.blockage_tier` | `tests/doors_costs.test.ts`"U: taint turns into blockage" | PASS |
| Y | 复苏门疲时长：门阶 45 时为 6 个游戏时辰；过载两层为 12 | 同上 | `doorFatigueMinutes(45, 0)` 360 分、`(45, 2)` 720 分；真实一次死亡在门阶 45 时光环剩余 360 游戏分钟；门疲置 60，过载每层淤塞 +3，每游戏时辰 -10 | 同上"Y: the revival-fatigue state"、"Y: door fatigue and overload" | PASS |
| Y | 遗落：遗落包含每叠 25% 与 10% 钱币；已装备物品耐久 -10% | 无 | 未实现：遗落包与死亡五项代价的结算顺序归 PK-M1-11，耐久归 PK-M1-13（物品实例层尚不存在）；现行战斗仍是 10% 钱币直接扣掉 | 第 5 节 | FAIL（转 PK-M1-11、PK-M1-13） |
| K | 判定纯度：同一世界状态重复判定结果相同，不写世界 | `npx vitest run tests/doors_keys.test.ts` | 全部 43 扇门判两遍结果逐字段相等；判定前后世界 JSON 与 `worldHash` 不变；至少一扇门的钥已满足（不是空比较）；未知钥类判为不满足且不打断刷新 | `tests/doors_keys.test.ts`"K: the judge is pure" | PASS |
| K | 替钥：原钥 NPC 死亡后替钥启用，门可开 | 同上 | 两人都在内容里时，替钥人的信任不顶替（门不可开、开门被拒 `no_key`）；写 `npc.bron.dead` 后替钥生效，门进入可开并开启；借形之门的 `when`（`a1_oola_fate` 已定且不为 `cleared`）与猎之门（希雅离队）各一例；替钥的进度跟随在用的那一把 | 同上"K: substitutes" | PASS |
| K | 物钥：记住型开门后仍在背包；消耗型被移除；陈列中的物不算持有 | 同上 | 晶背甲壳开门后仍为 1，澱核为 0；物在另一个持有者（庭院陈列，PK-M1-53 的持有者）名下时门不显影、开门被拒 | 同上"K: item keys" | PASS（陈列本体在 PK-M1-53；钥只读玩家自己的持有） |
| X | 第一幕的互斥组（X1 到 X13 的 M1 部分） | `npx vitest run tests/doors_exclusive.test.ts` | 数据带 X1 `lock`、X2 `actLock`（`act` 1、`until` 3）、X3 `lock`；选定前世后其余七扇锁闭到第三幕仍锁；第一幕握澱核后借形之门与澄流之门锁闭，第二幕仍锁，第三幕借形回到未见、澄流仍锁；第三幕开渊契不触发 X2；`forceClose` 与单向组 `source` 的例子；旧存档里被旧规则锁死的借形之门补上 `until` | `tests/doors_exclusive.test.ts` | PASS（X4 到 X13 的门尚不在数据里，归 M2、M3） |
| N | 无模型：关闭模型时全部提示来自预写台词，第一幕门缝照常出现 | `npx vitest run tests/doors_hints.test.ts` | 序章倾向 `blade,shadow`：回廊显形（`feature.door_corridor`）的那一刻刃之门与伪录之门（第二幕门）以门缝显影，门缝档不给门名与代号，只露第一把钥；提示事件的文本是门自己的门缝句内容键 `c.doors.<id>.hint`；封印阶段 1 起一夜睡眠给一次入梦提示，同一天第二次睡眠不再给 | `tests/doors_hints.test.ts`"N: no model" | PASS |
| F | 第 8 节功能（第一幕各门的功能） | `npx vitest run tests/doors_features.test.ts` | `door_corridor`：之前回廊窗口不可用、`corridorOpen` 为假，置真后两者可用；`tide_sight`：目标框等级从 `?` 变为等级区间；`appraise_talent`：鉴定罗恩从无潜质到读出潜质；`inner_court`：进庭院从拒绝 `locked` 到成功（复苏点在 `tests/combat.test.ts` 已钉） | `tests/doors_features.test.ts` | PASS（`servant` 归 PK-M1-15，FAIL 转出） |
| V | 内容校验：21.6 的八条规则各有一个反例数据，校验能报出 | `npx vitest run tests/doors_validation.test.ts` | 现行数据零问题；八条各有反例（段翼档与失灵、未登记变量五种钥、单人缘钥与分支事迹、商店常备物、剧情与主线门的阶钥、第六司之名、互斥组两端与 `freeze`/`rack` 归属与 `actLock` 缺幕、曲线第 60 阶被改）；另加未知钥类、不计数的事件、禁门类缺禁门加权 | `tests/doors_validation.test.ts` | PASS |
| E | 无模型通关：极简与常规两条脚本路线，回放与原局世界哈希一致 | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts tests/playthrough/act1_minimal.playthrough.test.ts` | 复查修复之后的末次实跑：`Test Files 2 passed (2)`、`Tests 2 passed (2)`、`Duration 1590.86s`（release 走到 `ending_release`；第一幕极简路线进入第二幕且等级达标、零作弊命令） | `progress.md` 2026-11-17 段 | PASS（两条路线）；回放哈希 VERIFY（本包未跑 `replay.playthrough.test.ts`） |

本包顺带完成的 M2 行（不计入本包验收）：X2 的幕锁（第三幕回到未见）、提示导演"同一状态选出的门相同、禁门不被雅努推荐"、序钥的按序与作废（用合成门测试；渊契之门第三幕的 `keySets` 仍归 PK-M2-13）。

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 0 错误 | PASS |
| 本包测试 | 第 1 节各文件加 `tests/doors.test.ts` | 是 | `Test Files 8 passed (8)`、`Tests 85 passed (85)` | PASS |
| 相邻套件 | `npx vitest run tests/combat.test.ts tests/content_base_rebase.test.ts tests/time_skip.test.ts tests/save_migration.test.ts tests/architecture.test.ts tests/content_id_guard.test.ts tests/i18n_kernel_guard.test.ts tests/i18n_ui_guard.test.ts tests/registry.test.ts tests/core.test.ts tests/client_windows.test.ts tests/client_window_catalogue.test.ts tests/docs_guard.test.ts` | 是 | `Test Files 13 passed (13)`、`Tests 214 passed (214)` | PASS |
| 默认套件 | `npx vitest run` | 是 | `Test Files 2 failed \| 122 passed (124)`、`Tests 2 failed \| 2400 passed \| 2 skipped`；两个失败见第 4 节，都不是本包引起 | PASS（扣除基线） |
| 内容校验 | `node tools/content/validate.ts` | 是 | V1 到 V10 全绿 | PASS |
| 注册表 | `node tools/registry/build.ts --check` | 是 | 37 测试通过 | PASS |
| 文本 | `node tools/i18n/gen_keys.ts`、`node tools/i18n/extract_content.ts`、`node tools/i18n/check.ts` | 是 | 0 finding | PASS |
| 门阶曲线 | `node tools/doors/rank_curve.ts --check` | 是 | current | PASS |
| 改动文件格式 | `npm run format -- <改动的 TS 与 JSON>`；`biome check` | 是 | 无问题 | PASS |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 覆盖性复查（新起的通用代理，只读） | 一次贡献结束 | FAIL（修复前） | 2 | 13 | 见下表 | 本会话 |

| 发现 | 处理 |
| --- | --- |
| 同一 tick 内内容写 `seal_looseness` 又有门开启时，写入被门的增量覆盖（第一幕梦境场景约一成概率丢 5） | 已修：开门、闭门、阶段结算前先从旗标同步半分；新测试逐个 tick 相位断言 |
| 遗落包未实现 | 转 PK-M1-11、PK-M1-13（第 1 节 FAIL 行） |
| 门缝档仍给门名与代号 | 已修：视图在门缝档清空 `name` 与 `code`；客户端的显示档版式归 PK-M1-22 |
| 旧存档拿不到新门的运行条目 | 已修：`ensureDoorEntries` 每次刷新补齐 |
| 旧存档里被旧规则锁死的 X2 永不回来 | 已修：首次补字段时按组补 `lockedUntil` |
| 没有 `keySets` | 转 PK-M2-13（渊契之门第三幕版本） |
| 未知钥类让刷新抛错；计数钥可写不计数的事件 | 已修：判定的缺省分支；校验拒绝未知钥类与不在 `COUNTABLE_EVENTS` 的事件 |
| 替钥不带进度；`all` 不看子钥进度 | 已修：`started` 语义与替钥读在用那一把的进度；信任与门阶读数本身不显影门 |
| 内容直接写封印与 C84 不符 | 转 PK-M1-33、PK-M1-27 的重导 |
| 序钥在部分旗标与物品变化时不推进 | 已修旗标一侧（每次旗标变化都推进）；物品与羁绊变化在下一次刷新推进，同一 tick 反序写入视作同时发生，写进 5.1 的语义 |
| 提示测试有空断言 | 已改：禁门在最高分时仍被入梦跳过；+20、+10、门旱、每日 +5 各有断言 |
| 传闻可以挑没有地点与人物的门 | 已修：传闻只讲带地点或人物钥的门 |
| 阶段名、传书、从契、门镜、观澜精度 | 转出（第 5 节） |
| 名讳之门缺 `auto` | 已修 |
| 各翼生长规则 | 转 PK-M2-13 |
| 门缝早于回廊显形出现；撤锁后重复门缝；入梦一夜多次；提示日用 tick 除法 | 已修：门缝等 `feature.door_corridor`；撤锁不清显示档；入梦一夜一次；用日历日 |
| 曲线工具的 `--check` 与格式化后的文件不符 | 已修：比对门槛数组本身 |
| 注册表 `blockage`、`door_fatigue`、`seal_unrest` 的写入方 | 已改：写入方标 doors；内容写 `blockage`、`door_fatigue` 时同步进切片 |
| 禁门类不强制禁门加权；第六司之名校验不看显影钥 | 已修 |
| 未见即锁闭的门出现在回廊里 | 已修：从未显影的锁闭门不进回廊视图 |
| 其余 NIT（`door.opened` 缺 `tier` 与 `rankDelta`、过载两处计数、`any` 消耗顺序、聆灵之门幕次） | 记入遗留，不在本包改 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npx vitest run` | `tests/art_manifest.test.ts`：清单与 `assets/art/` 不符 | `assets/art/` 下是用户未跟踪的图片（任务书已列为已知基线） | 用户素材 |
| `npx vitest run` | `tests/client_input_bindings.test.ts`："uses {key:} references"：`ReferenceError: MOUSE_KEY is not defined` | 测试文件本身未定义的常量，属于正在进行的输入包 | PK-M1-07 |
| `npx vitest run tests/time_skip.test.ts`（中途一次） | 营地夜袭概率 0.01 对 0.02 | 读 `map.sediment`，世界与地图机制包正在改该字段；末次全量运行已通过 | PK-M1-16 |

## 5. 未验证项与转出

| 条目 | 缺什么 | 由谁、何时补 |
| --- | --- | --- |
| Y 遗落 | 遗落包实体、拾取与保留 3 日、兽伴守护、已装备耐久 -10%、`combat.player_returned` 按战斗 19.4 扩展 | PK-M1-11（死亡五项代价）、PK-M1-13（耐久） |
| F `servant` | 从契读取方 `src/systems/party/retainers.ts` | PK-M1-15 |
| E 的回放哈希 | 本包按任务书只跑两条路线，没有跑 `tests/playthrough/replay.playthrough.test.ts` | 整合阶段的全量门 |
