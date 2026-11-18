# PK-M1-33 第一幕任务与纷争：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-18 | 实施、探针、覆盖性复查、修复 | 第一幕主线重导与支线、纷争节点、女神请托导入；目标的世界写入；封印量对账；兽潮任务改由幕时钟开启；其余六条纷争的运行数据；A1-M09 的"审判已开过"；目录第 5.3 节回写；委托模板与动态事件；任务视图的结束时刻；话题解锁任务；自动玩家的送达、说服与具名击杀；V9 的幕周取值 | 未提交 | 见 `verification_matrix.md` | 主会话提交；第 3 节的请求转各包；第 4 节待用户定 |

## 2. 汇报

### 2026-11-18 实施、探针、覆盖性复查、修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `data/quests/quests.json` | 修改 | 第一幕任务全部重导（50 条：主线 13、支线 22、纷争节点 6、女神请托 3、生业 3、同伴 1、迷宫 1、探索 1）；其余幕的记录逐字保留 |
| `data/quests/items.json` | 修改 | 11 件任务物品（`guild_letter`、`bounty_voucher`、`marked_bandit_blade`、`forest_pact_copy`、`otto_will`、`popo_hoard_list`、`viro_moss_pact`、`magistrate_seal_fragment`、`stolen_copper_bell`、`silver_buckle`、`oola_sketch_map`） |
| `data/quests/acts.json` | 修改 | 第一幕 `onEnter` 去掉 `seal_looseness`；第一幕时钟的周效果加"`a1_dian_trade == player_controls` 时 `seal_unrest` +2" |
| `data/disputes/act1.json` | 修改 | 六条纷争的运行记录（A1-D03、D05 到 D09）；A1-D02 的 `cassian_verdict` 的 `when` 与选项效果（见决定） |
| `data/disputes/act1_chains.json` | 修改 | 六条链任务（经验 300、250、250、200、200、200）；`ako_framed` 默认步从 A1-D04 移到 A1-D09 |
| `data/guild/commissions.json` | 修改 | 两个模板 `cmm_a1_boar_westfield`、`cmm_a1_spider_valley`（全部 11 个） |
| `data/guild/events.json` | 修改 | 27 个动态事件（第一幕共 34 个）；`ev_a1_tide_omens` 的条件；`ev_a1_beast_season` 写 `a1_beast_season`；`ev_a1_moira_coincidence` 的四选一 |
| `data/dialogue/topics/act1.json` | 修改（逐条插入） | 六个任务话题的 `unlocks.quests`；三个话题 `event_drunk_bandits`、`secret_toma_watch`、`secret_noi_mark` |
| `src/systems/quests/types.ts` | 修改 | 目标的公共部分加 `effects?: Effect[]` |
| `src/systems/quests/progress.ts` | 修改 | 导出 `metEffects`：目标满足时（`markMet`、`bump`）设路径并写一次 `effects`；看过的场景目标进阶段时经 `markMet` |
| `src/systems/quests/index.ts` | 修改 | `choose` 写选项效果之外再写目标的 `effects`；订阅 `dialogue.topic`（`outcome == answer` 时接受话题解锁的任务）；`player.talked` 先过一遍可选目标再计交谈 |
| `src/systems/quests/objective_events.ts` | 修改 | `talkObjectives` 加参数 `optionalOnly` |
| `src/systems/quests/topic_unlocks.ts` | 新增 | `topicUnlockedQuests`：话题 `unlocks.quests` 里未开始、给予者是答话人、前置成立的任务 |
| `src/systems/quests/view.ts` | 修改 | `QuestView.endTick`（完成取 `doneTick`，其余结束取 `endedTick`） |
| `src/systems/quests/objectives.ts` | 修改（头注释） | 采集与制作事件由生业内核发出（`src/systems/crafting/gather.ts`、`craft.ts`），决斗事件由 `src/systems/combat/duel.ts` |
| `src/client/windows/quest_log_model.ts` | 修改 | `endedNewestFirst`："已结束"页按结束时刻新到旧，没有时刻的排后 |
| `src/content/packs/quests.ts` | 修改（一行） | 目标 `effects` 走 `effectProblems` 校验 |
| `src/editor/quests/quest_graph.ts` | 修改 | `BUILTIN_VARS.act_week` 与 `actWeekValues`：V9 的幕周取内容条件里比较的周及其前后一周 |
| `src/game/autoplay/quest_gates.ts` | 新增 | `gatedObjective`：说服未过门槛时跳过；送达缺物品时找开着的、有货的市场去买（`marketFor`），没有市场或钱时跳过 |
| `src/game/autoplay/player.ts` | 修改（越界，四处，见下） | 接线 |
| `docs/40_design/world_state_registry.md` | 修改（越界，一行） | 见下 |
| `docs/40_design/content/catalog_quests_acts1_3.md` | 修改（回写） | 第 5.3 节：通则、各链的运行器格、决策点、结算与结局表 |
| `tests/act1_quests.test.ts` | 新增 | 见 `verification_matrix.md` |
| `tests/quests.test.ts`、`quest_model.test.ts`、`content_validation.test.ts`、`progression.test.ts`、`guild.test.ts`、`guild_events.test.ts` | 修改 | 随新数据：主线的幕时钟、主线经验 22,550、兽潮的首领前瞻、委托表、魔物季旗标 |
| `tests/dialogue_topics.test.ts`、`tests/act_clock.test.ts` | 修改（越界，小） | 第一幕话题数与三个话题在列；无玩家时兽潮之后 `seal_unrest` 为 30 |
| `tests/disputes.test.ts` | 修改 | 其余六条纷争进列表、决策点过滤到三条 Must、等待用例把 A1-M09 放到 `prepare`；真实游戏用例：兽潮把被定罪的欧拉拖出拘留室，A1-D02 以"欧拉逃走"结算（见第 3 节 PK-M1-52 第 1 行） |
| `data/registry/vars.json`、`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 工具重生成 | `node tools/registry/build.ts`、`node tools/i18n/gen_keys.ts`、`node tools/i18n/extract_content.ts`（同时带进了他包同期的改动） |
| `docs/70_packets/pk_m1_33_act1_quests/` | 新增 | 本目录三件 |

**共享文件的改动（逐处）**

`src/game/autoplay/player.ts`（其余改动属 PK-M1-12）：

1. 导入：`import { upcomingWaveBosses } from './prepare';` 之后加 `import { gatedObjective } from './quest_gates';`。
2. `objective()` 的 `case 'kill'` 第一行：`if (o.ref && this.holds(o.orWhen)) return -20;` 改为 `if (o.ref && o.orWhen && this.holds(o.orWhen)) return -20;`。空条件成立，原句让没有 `orWhen` 的具名击杀永远等待（A1-M01 `corridor` 卡在第 1,500 tick 之后）；改后与内核 `progress.ts` 的 `o.orWhen && conditionHolds(...)` 一致。
3. 同一处的备战门槛：注释 `// not ready: level first, unless no prey is left anywhere (the fight is the way on)` 与 `if (named && !this.readyFor(named) && this.huntingGround())` 改为两行注释与 `if (named && this.ranked(named) && !this.readyFor(named) && this.huntingGround())`（`ranked` 是 PK-M1-12 的帮助函数）。具名的普通怪物（A1-M05 `dian_wolf`、A1-M06 `burrow_worm`、A1-M07 `dian_spirit`）不再按首领留出等级余量。
4. 模型目标的分派：注释 `// the objective kinds of the quest model (objective_plan.ts)` 改为 `// the objective kinds of the quest model (objective_plan.ts); gated ones first (quest_gates.ts)`，其后加两行 `const gated = gatedObjective(this, o, why);`、`if (gated !== undefined) return gated;`。

`docs/40_design/world_state_registry.md`：`a1_tide_omen` 行之后加一行
`| \`a1_beast_season\` | 无 | 布尔 | 魔物季期间为真 | 动态事件 \`ev_a1_beast_season\`（落地时置真，期满置假） | 铁杉林深处（地图简报 A7）魔物季的刷新组与猎径出口 |`。
该文件里的其余差异属 PK-M1-52（写入者列与 `a1_seg_turned`）。

`src/content/references.ts`、`tools/content/validators/namespace.ts`、`data/README.md`：本包未改。

**新登记的注册表变量**：`a1_beast_season`。其余写入的变量都已登记；`node tools/registry/build.ts --check` 报 current。

**接入他系统的方式**

| 系统 | 方式 | 说明 |
| --- | --- | --- |
| 幕时钟（PK-M1-45） | 读 `act_week`、`a1_tide_night` | 无新钩子；V9 读不到常量写入，见 `actWeekValues` |
| 兽潮（PK-M1-52） | 读 `a1_beast_tide_started`、`a1_tide_stage`、`a1_beast_tide_cleared`；写 52 读的 `a1_tide_prep.*`、`a1_culvert_sealed`、`a1_graveyard_purified`、`a1_barto_family_safe`、`a1_moss_intercepted`、`a1_seg_turned` | 不写兽潮结算 |
| 纷争运行器（PK-M1-46） | 运行数据；节点任务写运行器读的变量 | 无新钩子 |
| 公会（PK-M1-47） | 模板的 `firstIn`；动态事件只用 `flag`、`add`、`append`、`line` 效果 | 无新钩子 |
| 话题（PK-M1-19） | 订阅 `dialogue.topic` | 话题系统已发此事件 |
| 经济 | 自动玩家用已有的交易流（`economy:trade`、`economy.buy`、`economy.close_trade`） | 无新钩子 |

**决定**

| 决定 | 理由 |
| --- | --- |
| 目标可带 `effects`，满足时写一次 | 备战小目标、证据件数、节点产物都是"做到这一步就写"，放在阶段 `onComplete` 会把可选目标也绑到阶段完成上 |
| 主线经验按结算点：主线合计 22,550 | 目录的结算点表；第一幕主线预算 23,520，差 4.1%，在 ±5% 内，不乘 `k` |
| `has.<物品>` 条件改为任务或旗标条件（序章 `q_p_m04_out_of_spec` 完成即有硬币；`a1_spring_source_found` 等） | 条件解析器没有实现 `has.`；物品由任务发出，任务完成即持有 |
| A1-D03 的合作结局：`S08 negotiate OR (S09 完成 AND q_gl_merca_01 完成)` | `trade_count.nera` 没有写入者（V4 拒绝内容写它）；成交过一笔由梅尔卡的请托代表 |
| A1-D02：`cassian_verdict` 只在主线没有占着审判（`prepare`、`verdict`）时开；每项写入带 `NOT a1_oola_fate`，欧拉的下场最后写 | 先开庭的一边写下场，后到的一边不改写；下场先写会让同一选项的其余写入被守卫挡掉 |
| A1-M09：`verdict` 进入时只在欧拉下场未定、无人到场的审判未判时播 `cut_a1_trial`，否则一句旁白；劫狱写 `fled` 且无冲突、无人到场判决时置 `a1_oola_jailbroken` | 计划包行；场景的分支请 PK-M1-34 补（第 3 节） |
| A1-M12：前兆或 `a1_tide_night` 开启；后续阶段读 52 的旗标；旧波次与 `a1_beast_tide_cleared` 只在 `NOT a1_beast_tide_started` 时兜底；巨像倒下 `seal_unrest = 30` | 52 的合约；没有兽潮系统的叙事夹具也能走完 |
| 第一幕不写 `seal_looseness`（`onEnter` 的 5 与 A1-M02 的 +1 去掉） | 千门 6.4.5：第一幕没有写定事件；封印松动只来自门（内核存 `seal_points`，`seal_looseness` 是镜像） |
| 暗面节拍 D6 落在 A1-M07 `culvert` 的 `onEnter`：第 8 周起夜羽一句写定台词并写 `term.dian_known` | 目录 A1-M07；旧数据在 A1-M02 写它，与 D-030 不符 |
| 自动玩家的门槛逻辑放 `quest_gates.ts`，`player.ts` 只接线 | 包约束 |
| V9 的幕周按内容条件取值 | 全部 34 周会让 A1-M07 的前置超过组合上限，判为"未定" |
| 交谈时先计对同一人的可选目标，再计交谈 | 只放可选目标先行：必需的交付与下一阶段的交谈仍各占一次交谈（A1-S15 的两段不被压成一段） |
| 两条女神请托不设给予者，请托旗标一立即开始 | 与女神系统的请托流程一致（`tests/goddess.test.ts`）；奈拉、卡西安挂单只是委托方的署名 |

**偏离目录之处**

| 条目 | 目录 | 数据 | 原因与后续 |
| --- | --- | --- | --- |
| A1-M01 | `ash_chamber` 三种行为写 `quest_path` | 只到达；路径由场景 `a1_ash_glimpse` 写 | 请 PK-M1-34（第 3 节） |
| A1-M02 | `climb`、`flock`、`raven` 三段 | 并为 `raven` 一段（鸦群是可选目标，首领 80% 血量时唤来） | 首领机制在战斗数据 |
| A1-M05 | `track` 三处线索；`report` 阶段 | `track` 为到达猎径；回报由交付人 `shiya` 收尾 | 调查目标的线索点没有地图数据 |
| A1-M07 | `culvert`：`dian_dreg` ×4、`dian_spirit` ×1 | 只有 `dian_spirit` ×1 | `seal_ruins_depths` 没有 `dian_dreg` 的刷新组（PK-M1-35）；`dian_spirit` 的等级 11 到 13 高于目录的预计等级 8（PK-M1-12 或图鉴批次） |
| A1-D03 | 合作要 `trade_count.nera >= 1` | 见决定 | `trade_count` 落地后改回 |
| 委托模板 | 19 个 | 11 个 | 其余 8 个缺目标魔物或目标种类（第 3 节） |
| 动态事件 | 36 个 | 34 个 | `ev_a1_greyroad_tide`、`ev_a1_gather_rare` 待依赖（第 3 节） |
| 支线 | 45 条 | A1-S24 到 S30、S34 到 S37 未导入 | 第 3 节 |
| 动态事件效果 | 莫伊拉送物品、希尔薇开任务 | 去掉 | 动态事件只允许 `flag`、`add`、`append`、`line`（V1） |
| A1-G01、A1-G02 | 奈拉、卡西安挂单（给予者） | 无给予者，请托即开始 | 见决定 |

**U-08 未决项上的依赖**

| 落点 | 依赖的 U-08 项 | 现在的做法 | 另一选项 |
| --- | --- | --- | --- |
| 11 个委托模板的报酬（`data/guild/commissions.json`） | 第 1 项：委托报酬公式 | 按任务目录（前）第 2.3 节的级基价公式 | 改用成长 7.4 的"金钱权重 × G(L)"，第一幕 F、E 级的数值会变 |
| 支线份额里的委托经验（期望 16 次 × 325） | 第 1 项（同上，只影响报酬，经验公式不变） | 不变 | 不变 |
| 三条女神请托的经验（790） | 第 17 项只涉及试炼；第一幕没有试炼 | 按请托权重 0.4 发经验 | 若第 17 项推广到请托，三条改为只给钥与赏，经验并入同幕支线 |

**复查发现与处理**

新起的只读子代理复查一轮，33 条发现；下表按编号写处理。

| 序 | 发现 | 处理 |
| --- | --- | --- |
| 1 | A1-S17 写 `dg.dg_moon_cellar.choice`，迷宫系统没有该迷宫的 `choices` 表，立刻写回原值；用例的夹具没有迷宫系统 | 迷宫数据属 PK-M1-50，转请求（第 3 节第 20 行） |
| 2 | 可选交付与同阶段对同一人的必需交谈：交谈先关掉阶段，交付永远不成（A1-M03 黑羽、A1-M13 凭证） | 已修：`player.talked` 先过一遍可选目标（`talkObjectives(ctx, npc, true)`），再计交谈；补测 |
| 3 | 审判的输入 `a1_trial_evidence`、`a1_trial_testimony`、`a1_trial_debate`、`a1_lamp_exposed` 没有写入者；`a1_oola_bribed`（A1-D02.h 贿赂路线）没有导入 | 前四项的写入者是 `cut_a1_trial`（注册表），转 PK-M1-34（第 3 节第 21 行）；贿赂路线转后续（第 3 节第 22 行） |
| 4 | 定罪后、押送前的劫狱没有入口 | 转后续（第 3 节第 22 行） |
| 5 | 52 在场时十二次击杀就能把 A1-M12 推到巨像阶段 | 已修：`wave1`、`wave2` 各加一个旗标目标 `a1_tide_stage >= 2`（`>= 3`）或 `NOT a1_beast_tide_started`；补测 |
| 6 | 截车目标在莫斯决定之前到南门就会用掉 | 转后续（第 3 节第 22 行） |
| 7 | `ev_a1_greyroad_smugglers` 要 `a1_dian_trade == continued`，而它只在 A1-D01 结算时写 | 已修：`(NOT a1_dian_trade OR a1_dian_trade == continued) AND NOT dg.dg_old_mine.collapsed`；补测 |
| 8 | 没有任何内容写 `a1_dian_trade = player_controls`；兽潮后的 +10 与周增的潮后守卫缺失 | 已修：A1-D01.g 加 `take_over`（路径仍是 `blackmail`）；巨像倒下置 30 后接手生意再 +10；周增加 `NOT a1_beast_tide_cleared`；补测 |
| 9 | A1-D05 的 `weak`（第 8 周初）早于审判，`wind`（第 10 周）可能晚于兽潮 | 转后续（第 3 节第 22 行）；兽潮可能落在第 8 周，周初的默认步对不准 |
| 10 | 暗面节拍 D6 只在第 8 周以后进暗渠才发生，而 A1-M07 多在第 3 到 7 周 | 已修：A1-M12 `prep` 进入时兜底（目录：D6 未发生则在前夜发生） |
| 11 | 刀上暗记计了两次（A1-D01.a 与 A1-S02 `show`） | 已修：只在 A1-D01.a 计 |
| 12 | 节点任务在纷争结算后还能改写结果 | 已修：A1-D01.f、A1-D01.g 在 A1-D01 结算时过期；A1-D04.e 在 A1-D04 结算、东迁或驱逐时过期 |
| 13 | 欧拉被定罪后隐藏，A1-M07 接不到 | 转后续（第 3 节第 22 行） |
| 14 | 托比的治愈总要把药交给欧拉 | 转后续（第 3 节第 22 行） |
| 15 | 审判的竞态（玩家与无人到场的审判同时在 6 小时窗里；玩家开庭时 `boro_storm` 随之放弃） | 转后续（第 3 节第 22 行） |
| 16 | 莫伊拉的巧合在四项都用完或林地之争已结时没有句子，也不写线索 | 转后续（第 3 节第 22 行） |
| 17 | A1-M13 缺 `a1_dream_bed`、`npc.yeyu.memory_shards` +1；A1-M09 缺 `a1_tess_in_crowd` | 转后续（第 3 节第 22 行）；`a1_count_letter` 由场景写 |
| 18 | 醉月亭地窖没有老鼠刷新，A1-M04 `cellar` 与 A1-S17 的击杀在别的地图完成 | 地图属 PK-M1-35，转请求（第 3 节第 11 行） |
| 19 | 自动玩家买东西：不按市场挑商人；交易选项不出现时没有退避 | 转后续（第 3 节第 22 行）；今天只有边石镇一个市场 |
| 20 | A1-S14 的撒盐路线不写 `a1_graveyard_purified` | 已修：三条路线都写（门的路线仍要借形之门） |
| 21 | 布伦的完整讲述是第 7 周初的一次性检查 | 转后续（第 3 节第 22 行） |
| 22 | A1-S10 的过期周晚一周 | 转后续（第 3 节第 22 行） |
| 23 | `popo_hoard_list`、`stolen_copper_bell` 没有发放 | 转后续（第 3 节第 22 行） |
| 24 | `ev_a1_eastslope_search` 要前置事件 `ev_a1_eastslope_curfew` | 保留：搜查类事件按 V1 必须有前置；东坡平静时没有宵禁也就没有搜查 |
| 25 | 包文档不全；README 说五个份额都在 5 个百分点内 | 已修：补 `verification_matrix.md`、本表；README 第 1 节改写 |
| 26 | 目录 5.3 的小出入（A1-D02 的周、当事） | 已修 |
| 27 到 31 | 日志同刻排序、话题解锁的边界、传讯三日默认、旧哨村是一个选择、`cmm_a1_boar_westfield` 的地点 | 转后续（第 3 节第 22 行） |
| 32 | 支线份额比目录的 25.1% 低 3.4 个百分点 | 在 5 个百分点内；未导入的支线补齐后回升 |
| 33 | 雅努的 `actsWhen` 读 `seal_looseness >= 10`，第一幕内容不再写它 | 由门系统的镜像供给；转 PK-M1-34 与女神线确认（第 3 节第 5 行） |

复查之后的再修改另外跟着这些测试改动：`tests/dialogue_topics.test.ts`（第一幕话题数 222 到 225，三个话题由不在改为在）；`tests/act_clock.test.ts`（无玩家时兽潮之后 `seal_unrest` 为 30，不是 100）；`tests/quests.test.ts`（梅尔卡的请托恢复为请托即开始，与 `tests/goddess.test.ts` 一致）。

## 3. 留给后续包的事项与请求

| 序 | 事项 | 建议归属 |
| --- | --- | --- |
| 1 | 兽潮之夜把被定罪且无人去救的欧拉拖出北门（`dragged` 写 `a1_oola_fate = fled`、`a1_oola_wounded`），A1-D02 随之以"欧拉逃走"（`by: world`）结算；`tests/disputes.test.ts` 的真实游戏用例已按此断言（先断言 `a1_oola_wounded`）。请确认这是想要的结果；若默认应仍是"审判成立"，改潮夜的写入或 A1-D02 的结局顺序 | PK-M1-52 |
| 2 | 本包写的 `a1_tide_prep.*` 键：`east_fence`、`nera_stock`、`eastslope_in`、`barto_seg`、`children_safe`、`oola_placed`；后两项 52 的接口表没有列，请确认是否读；`a1_defense` 本包仍写（备战 +15 等），52 不读，只留给场景 | PK-M1-52 |
| 3 | A1-M12 的兜底：旧波次与 `a1_beast_tide_cleared` 只在 `NOT a1_beast_tide_started` 时由任务写；52 在场时任务只读。请 52 保持 `a1_beast_tide_started` 在日落与 `a1_tide_night` 同 tick 写入 | PK-M1-52 |
| 4 | A1-D01.f 的 `turned` 现在写 `a1_seg_turned`（52 的行动判定读它） | PK-M1-52（知会） |
| 5 | 场景里的封印量：`a1_dream` +5、`act2_intro` +5、`act3_intro` +10、`act4_intro` +10、`act5_intro` +15（直接写 `seal_looseness`），按千门 6.4.5 第一到三幕没有写定事件、第四幕只有门徒会盗钥 +2、第五幕只有无貌者撕封 +10；而且封印松动由门系统的 `seal_points` 镜像，场景直写会被覆盖。请去掉或改为千门的写定事件 | PK-M1-34 |
| 6 | `cut_a1_trial` 加"审判已开过"的分支（A1-M09 现在用一句旁白代替） | PK-M1-34 |
| 7 | `a1_ash_glimpse` 写 A1-M01 的 `quest_path`（`bowed`、`spoke`、`struck`） | PK-M1-34 |
| 8 | 暗面节拍 D6 现在是 A1-M07 `culvert` 进入时的一句夜羽台词；若要做成过场，换成场景并保留 `term.dian_known` 的写入条件 | PK-M1-34 |
| 9 | `a1_ruins_gate_cleared` 由 A1-M07 `vein` 阶段进入时写，`a1_mine_cleared` 由 A1-M06 `breach` 写；地图简报里的临时值可以复核 | PK-M1-35 |
| 10 | `a1_beast_season` 由 `ev_a1_beast_season` 写（落地真、期满假），A7 铁杉林深处的季节刷新组与猎径出口可以读它 | PK-M1-35 |
| 11 | `seal_ruins_depths` 的渗泉暗渠没有 `dian_dreg` 刷新组；`dian_spirit` 等级 11 到 13 与 A1-M07 预计等级 8 不符 | PK-M1-35、PK-M1-12 |
| 12 | 未导入的支线：A1-S24 `red_sock`、S26 `toll_taker`、S27 `old_louse`、S28 `three_toes`（异名者没有魔物数据）；S25 `furrow_queen`（巢没有数据，`dg.<迷宫>.choice` 的写入随它）；S29 第一只兽伴（驯养）；S30 驴道（护送）；S34 到 S37 草药、炼金、烹饪、制革（没有配方） | 图鉴与战斗数据批次、PK-M1-49、宠物与护送机制的包 |
| 13 | 未导入的委托模板：`cmm_a1_field_hares`（`field_hare`）、`cmm_a1_grave_wisps`（`gravefield_wisp`）、`cmm_a1_mine_pests`（`rust_beetle`）、`cmm_a1_bone_vulture`（`bone_vulture`）、`cmm_a1_jackal_road`（`waste_jackal`）、`cmm_a1_strange_tracks`（`ashhorn_deer`、`greyelm_deer`）缺魔物数据；`cmm_a1_south_road_escort` 缺护送目标种类；`cmm_a1_bounty_named` 缺异名者 | 图鉴批次、PK-M1-47 后续 |
| 14 | 未导入的动态事件：`ev_a1_greyroad_tide`（`mtide_waste_road` 波次与灰路魔物）、`ev_a1_gather_rare`（采集内核的稀有事件，不是公会事件） | PK-M1-52 或图鉴批次；PK-M1-49 |
| 15 | 条件 `has.<物品>` 与交易计数 `trade_count.<人>` 没有实现；落地后 A1-D03 合作、A1-G01 前置、A1-D06 报告到手改回目录的写法 | 任务内核、经济的后续包 |
| 16 | 首通（12%）与探索（8%）两个经验份额在内核里没有发放方（`first:`、`explore:` 只有补正口径）；第一幕这两份现在是 0，计划包行的"五个份额相差不超过 5 个百分点"只能对主线、支线两份达成，击杀份额由自动玩家测 | 需主会话指定（PK-M1-42 或迷宫、地图的后续包） |
| 17 | 自动玩家第一幕的节奏：同一工作区下，原第一幕数据与新数据的探针都在第 3 周以后才打赢守护巨鸦（原 HEAD 的第一幕 588,653 tick 走完），新数据还要在第 10 周的兽潮之夜才能结束第一幕；`act1_minimal` 的 `maxTicks` 2,000,000 与 A1-M04 的周窗（第 1 到 2 周，过期 `by_other`）都会受影响，详见 `verification_matrix.md` 第 3 节 | PK-M1-12、PK-M1-42 |
| 18 | A9 替身内容的迁移 | PK-M2-20 |
| 19 | 首领 `seg_oneeye` 没有人设卡 | PK-M1-28 |
| 20 | `dg_moon_cellar` 没有 `choices` 表，A1-S17 写的 `dg.dg_moon_cellar.choice` 被迷宫系统写回；请给它 `purify`、`seal`、`keep` 等抉择（目录 A1-S17） | PK-M1-50 |
| 21 | `cut_a1_trial` 当庭写 `a1_trial_evidence`、`a1_trial_testimony`、`a1_trial_debate`、`a1_lamp_exposed`（注册表的写入者是它，现在都没写），A1-D02 的平反计数与 `cassian_verdict` 的 `clear` 读它们；另请加"审判已开过"的分支（第 6 行） | PK-M1-34 |
| 22 | 复查转后续的内容项：A1-M09 的贿赂路线（`quest_path = bribed`、`a1_oola_bribed`）与定罪后、押送前的劫狱入口；截车目标在 `moss_cart` 决定前用掉；A1-D05 两个默认步的周；A1-M07 在欧拉隐藏后没有入口（目录：托比倒下后自动开、白衣前世直开）；托比治愈的借形之门路线；审判的竞态与 `boro_storm`；莫伊拉巧合的兜底句与线索写入；A1-M13 的 `a1_dream_bed` 与夜羽记忆碎片、A1-M09 的 `a1_tess_in_crowd`；自动玩家按市场挑商人与交易退避；布伦的完整讲述；A1-S10 的过期周；`popo_hoard_list`、`stolen_copper_bell` 的发放；日志同刻排序；话题解锁的误导答与替代给予者；传讯三日不应的默认；旧哨村的单挑与强攻；`cmm_a1_boar_westfield` 的地点 | 本包的下一轮内容批次 |
| 23 | 本包话题指向的台词（`event_drunk_bandits`、`secret_toma_watch`、`secret_noi_mark` 与六个任务话题的应答）在台词包里 | PK-M1-29 |

## 4. 需用户决定

| 序 | 事项 | 现状 | 选项 |
| --- | --- | --- | --- |
| 1 | 兽潮之夜无人去救时，A1-D02 的世界结局 | "欧拉逃走"（潮夜把她拖出拘留室） | 保持；或潮夜不改写已定罪的下场，默认仍是"审判成立" |
| 2 | A1-M04 的周窗 | 第 1 到 2 周，过期由他人完成（目录） | 保持；或从登记那周起算两周（玩家第 3 周才登记时仍能做） |
| 3 | 首通与探索两个份额的发放方由哪个包做 | 无 | 见第 3 节第 16 行 |
