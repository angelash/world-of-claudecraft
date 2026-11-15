# 世界状态变量注册表（World State Registry）

> **归属**：`40_design/` 的设计源文档，成长与注册表代理所有；数据落在 `data/registry/vars.json`（D-076）。
> **作用**：定稿全作世界状态变量（`World.meta.flags`）的命名规则、命名空间、类型与范围、写入者与读取者、条件表达式文法、
> 显示编号与数据编号的规则，并收齐揭示台账、分幕文档、任务与事件文档、`data/quests`、`data/scenes`、`data/doors` 与其余数据、
> 以及内核代码里出现的全部旗标与变量，给出规范名与要统一的别名。落定详细设计事项 B-002、B-003、B-004（决策日志第 3 节）。
> **上游**：[决策日志][dlog] D-031、D-043、D-044、D-054、D-055、D-076；[揭示台账][rl]第 0.4 节（变量表与条件语法）；[任务与事件][qe]第 3.7、3.9、4 节；
> 全部分幕文档的世界状态节；[过场目录][cut]各幕的新旗标表与计算函数；[成长与节奏][pp]（`act_week` 与周表、传授池）；[千门][td]第 4、6 节（门阶、淤塞、门疲）；
> 代码 `src/systems/quests/conditions.ts`（条件求值器）、`src/systems/quests/effect_types.ts`（效果词表）、`src/core/engine.ts` 的 `setFlag`。
> **约束**：本文是变量名的唯一出处：台账、分幕文档、目录与数据引用变量时用本文的规范名；与本文不同的写法一律登记为别名，由加载器解析并在编辑器里提示。
> 变量只由内核结算写入，AI 只能经被校验的命令改变它们（[总框架 8][gf]）。

## 0. 一页结论

1. **一个变量一个名字。** 第 8 节登记 801 个规范名，其中 111 个是按实体索引的族（第 8.8 节是过场目录登记的 248 个，含 11 个族）；第 2.9 节登记 23 个计算函数；
   每个都有类型、范围、写入者与读取者；其余写法都是别名，加载时换成规范名（第 7、8 节）。
   现有数据里出现的 326 个名字全部能解析到本表（用 `src/systems/quests/conditions.ts` 的 `referencedVars` 抽取全部 `data/**/*.json` 的条件与效果核对）。
2. **七种变量。** 内置量（内核提供，只读）、全局量（跨幕持续）、剧情标记（布尔、单调）、幕出口量（某一幕的结局，带幕前缀）、族（按实体索引）、
   系统镜像（系统把自己的状态镜像出来供条件读取）、信号（一次性请求，读后清除）（第 2.2 节）。
3. **命名的三条硬规则。** 剧情标记与幕出口量用幕前缀 `p_`、`a1_` 到 `a6_`、`ep_`；按实体索引的量用"族名点实体代号"（`trust.oola`、`evidence.E07`）；
   枚举值一律英文小写下划线，中文只在显示时经文本键出现（第 2 节）。
4. **人物代号以人物目录与 `data/npc/personas.json` 的 ID 为准。** 欧拉是 `oola`、布伦是 `bron`、玛莎是 `martha`、陆辰是 `luchen`、夜后是 `night_queen`、
   剑帝是 `emperor`（第 2.4、7.1 节）。
5. **条件表达式只有一种写法**：揭示台账的 `AND`、`OR`、`NOT` 与比较符，加上 `IN`、`HAS`、`COUNT`、`MIN`、`MAX` 与括号；
   第 5 节给出可解析的文法，与 `src/systems/quests/conditions.ts` 的求值器一致。分幕文档里的"且""不低于"按第 5.4 节改写。
6. **编号。** 任务显示编号 `A1-M01`，数据编号 `q_a1_m01_<slug>`；史料道具 `H01` 到 `H24`，数据编号 `lore_h01` 到 `lore_h24`；证据 `E01` 到 `E36` 不变（第 6 节）。
7. **数据文件 `data/registry/vars.json`** 存规范名、族、别名、值别名与换算；内容校验要求每个被引用、被写入的名字都已登记，类型与枚举值一致，
   剧情标记不回写为假，幕前缀的量不在它的幕之前被读取（第 9 节）。
8. **M0 迁移一次做完。** 加载器先解析别名保证现有数据可跑；M0 的迁移批次把数据、代码与文档里的别名全部换成规范名；从 M2 起使用别名是校验错误（第 10 节）。

## 1. 定位与范围

### 1.1 什么是世界状态变量

世界状态变量是 `World.meta.flags` 里的键值对（`Record<string, FlagValue>`，值为数字、布尔或字符串，`src/core/world.ts`），由内核的
`SystemContext.setFlag` 写入（`src/core/system.ts`、`src/core/engine.ts`）。它们是任务、场景、门、台账、结局与 AI 题面共同读取的"世界记得的事"。

### 1.2 不在本表里的东西

| 东西 | 在哪里 | 为什么不登记 |
| --- | --- | --- |
| 实体与系统切片的内部状态（单位生命、背包、城建账本、女神神力账） | `World.slices.*` | 系统私有；需要被条件读取时由系统镜像为本表的镜像量 |
| 文本键（`react.*`、`chat.*`、`greet.*`、`opinion.*`、`banter.*`、`rumor.tpl.*`、`feat.*`） | 字符串表（D-077） | 是显示键不是状态 |
| AI 的长期记忆与日记 | AI 运行时（D-079 AQ-07） | 内核只存引用事件的有界日记 |
| 台账线索编号（`M01-C01`）、锚点（`A00`）、误导条目（`MIS-01`） | [揭示台账][rl] | 是线索的 ID，不是变量；线索的解锁条件引用本表变量 |
| 内容条目 ID（`door_`、`eq_`、`dg_` 等） | 各目录 | 作为族的实体代号出现在变量名里 |
| 物品与魔物的标签（`earth`、`tainted`、`gatebronze`、`forbidden`、`claim:<势力>`、`nameless`、`shiny`、光环标签） | 物品与魔物条目的 `tags` | 是条目属性，条件读取物品时用 `has.<物品>` |

### 1.3 与台账、数据、编辑器的关系

- [揭示台账 0.4][rl]是本表的前身与条件语法的基线；台账线索的解锁条件按本表的规范名书写。
- 数据层的条件、效果、门钥、地图出口的 `requiresFlags`、场景的 `storeAs` 都只能引用本表登记的名字（第 9.3 节）。
- 编辑器的"任务与剧情图"（旗标写入索引与可达性分析）、世界检视器的旗标面板读取 `data/registry/vars.json` 显示中文名、范围与别名提示（`src/editor/quests/`）。

## 2. 命名规则

### 2.1 形式

```
名字    = 段 , { "." , 段 } ;
段      = 小写字母 , { 小写字母 | 数字 | "_" } ;       族的实体代号段另允许大写字母与数字开头（证据编号 E07、门阶段 a3）
长度    ≤ 64 个字符；段数 ≤ 4
```

- 正则：`^[a-z][a-z0-9_]*(\.[A-Za-z0-9][A-Za-z0-9_]*){0,3}$`。
- 幕前缀后面用下划线，不用点号：`a4_refused_to_let_go`，不写 `a4.refused_to_let_go`。
- 布尔量不加 `is_`、`has_` 前缀；"做过某事"用过去分词或名词（`a1_yeyu_bound`、`a3_seal_aware`）。

### 2.2 七种变量

| 种 | 写法 | 写入 | 生命期 | 例 |
| --- | --- | --- | --- | --- |
| 内置量 | 固定名或 `player.*` | 内核，按时钟与实体状态 | 全程，只读 | `act`、`act_week`、`player.level` |
| 全局量 | 无前缀小写下划线 | 指定系统或内容效果 | 全程，跨幕更新 | `seal_looseness`、`autonomy` |
| 剧情标记 | `p_`、`a1_` 到 `a6_`、`ep_` 加事件 | 内容效果（任务、场景）与指定系统 | 写入后单调为真 | `a1_ash_met` |
| 幕出口量 | 幕前缀加主体加属性 | 本幕的结算 | 本幕结算后只读 | `a1_oola_fate`、`a2_wb_ruler` |
| 族 | 族名点实体代号 | 指定系统或内容效果 | 全程 | `trust.oola`、`evidence.E07`、`verdict.eluen` |
| 系统镜像 | 系统命名空间点名字 | 只由所属系统写 | 全程 | `quest.q_a1_m01_fall`、`boss.dian_colossus.defeated` |
| 信号 | 系统命名空间点 `pending` 或波次键 | 内容效果写，所属系统消费后清除 | 一次性 | `scene.pending`、`combat.wave.tide_first` |

### 2.3 命名空间总表

| 前缀或族 | 种 | 内容 | 写入者 | 例 |
| --- | --- | --- | --- | --- |
| `act`、`act_week`、`day`、`season`、`year`、`hour` | 内置 | 幕与历法 | 内核 | `act >= 3` |
| `ai_enabled`、`difficulty`、`ironman`、`cycle` | 内置 | 运行设置与周目 | 内核与新游戏 | `cycle >= 2` |
| `player.` | 内置 | 玩家的等级、名字、澱染、伤病与少数行为标记 | combat、inventory、goddess | `player.level` |
| 无前缀 | 全局 | 跨幕持续的量 | 第 8.2 节逐个写明 | `church_suspicion` |
| `p_` | 标记与出口 | 序章 | 序章场景 | `p_discarded`、`p_earth_opening` |
| `a1_` 到 `a6_` | 标记与出口 | 各幕 | 本幕的任务、场景与结算 | `a3_lothar_ending` |
| `ep_` | 标记与出口 | 终章、结局与隐藏结局 | 结局场景 | `ep_player_returned` |
| `trust.` | 族 | 人物对玩家的信任，0 到 100 | npc 关系、任务效果 | `trust.shiya` |
| `npc.` | 族 | 具名人物的剧情属性与成长状态 | 任务、场景、companion、cognition | `npc.bron.story_level` |
| `rep.`、`stance.`、`fame.` | 族 | 势力声望、国家立场、地区名望 | cognition、strategy | `rep.greyrats`、`stance.grantia` |
| `goddess.` | 族 | 女神对玩家的印象、兴趣、关系、记忆、注视与神力 | goddess、序章场景 | `goddess.merca.relation` |
| `lie_exposed.`、`verdict.`、`faith.`、`trial_wins.` | 族 | 女神的谎言、终审、信仰份额、试炼胜场 | 场景、court、strategy、goddess | `verdict.sylvie` |
| `court.`、`review.`、`witness_called.`、`evidence_combo.` | 族 | 第六幕审庭与审期 | scenes 的 court、quests 的 endings | `review.no_light` |
| `evidence.` | 族 | 证据 E01 到 E36 | 任务与场景 | `evidence.E36` |
| `door.`、`door_state.`、`door_hint.` | 族 | 门是否已开、门的状态、雅努的提示 | doors、goddess | `door.talent_sight` |
| `front.`、`front_mod.`、`ring_node.`、`hero_state.`、`key_fate.` | 族 | 第三到第五幕的战线、众门环、勇者团与门钥去向 | 场景、warfare、strategy | `front.north` |
| `quest.`、`scene.`、`feature.`、`companion.`、`boss.`、`combat.`、`war.`、`dg.` | 镜像 | 任务、场景、功能解锁、同伴、首领、波次、战场、迷宫 | 所属系统 | `quest.q_a2_m02_exam` |
| `city.`、`econ.`、`nation.`、`director.`、`ai.`、`breach.`、`sediment.`、`omen.`、`intel.`、`revelation.`、`request.` | 镜像 | 经营、经济、国家、导演、AI 分级、越约、澱、预兆、梅尔卡情报、天启、女神请托 | 所属系统 | `econ.company_founded` |
| `push_door.` | 信号 | 过场里的推门请求（第 8.8.4 节） | 过场写，doors 在过场结束时结算并清除 | `push_door.founding` |
| `general.` | 派生 | 将领名单 `war.generals` 的布尔镜像 | 派生 | `general.ron` |
| `front_wait.` | 族 | 第五幕战线待令 | strategy | `front_wait.north` |
| `has.`、`read.`、`col.`、`visited.`、`anchor_lost.`、`deed.`、`title.`、`term.` | 镜像 | 物品持有、已读、收藏、到访、锚失、事迹、称号、称谓开放 | inventory、world、deeds、quests | `has.lore_h04` |

### 2.4 实体代号

| 实体 | 代号来源 | 例 |
| --- | --- | --- |
| 人物 | 人物目录的 ID，即 `data/npc/personas.json` 的 `id`（[内容总纲 12][bible]"人物无前缀"） | `oola`、`bron`、`martha`、`luchen`、`night_queen`、`emperor`、`jonas` |
| 女神 | `eluen`、`valda`、`merca`、`sylvie`、`moira`、`janu`；写入"全体女神"时用效果目标 `all`，它不是变量 | `goddess.valda.interest` |
| 势力与机构 | 势力代号：区域代码（`lotha`、`grantia`、`holysee`、`mercato`、`silva`、`windfang`、`night`）、机构（`guild`、`academy`、`church`）、城市内势力（第 8.5 节 `rep.` 行） | `stance.night`、`rep.church` |
| 地区 | [内容总纲 4.1][bible]的区域代码 | `fame.lotha` |
| 门 | 门的数据 ID（`data/doors/doors.json` 的 `id`；门目录的 `door_` 代号是 `code`） | `door.wayfaring_advanced` |
| 物品 | 物品 ID | `has.lore_h04` |
| 迷宫 | `dg_` ID | `dg.dg_old_waterway.cleared` |
| 地图与地点 | `MapDef.id` 与地点 ID | `visited.seal_ruins_depths.ash_chamber` |
| 证据 | `E01` 到 `E36`（[第六幕 4.2][a6]，D-032） | `evidence.E07` |
| 战线 | `north`、`east`、`south`、`ring`、`rear` | `front.ring` |
| 审期危机 | `no_light`、`residue_tide`、`contract_halt`、`winter_famine`、`record_silence`（`src/systems/quests/endings.ts` 的 `CRISES`） | `review.residue_tide` |
| 防线 | `fact`、`just`、`need` | `court.eluen.just` |

### 2.5 枚举值与文本

- 枚举值英文小写下划线；显示名走文本键 `var.<规范名>.<值>`（D-077），文本键不进条件。
- 写入玩家输入或台词原文的量用"文本"类型（`player.name`、`p_free.*`），文本不参与比较，只做插槽。
- 物品与人物作枚举值时直接用其 ID（例 `p_earth_relic` 的值是 `relic_badge` 等物品 ID；`a6_patron` 的值是女神代号）。

### 2.6 量纲

| 量 | 范围 | 例 |
| --- | --- | --- |
| 人物对玩家的信任 | 0 到 100 | `trust.*` |
| 势力声望、国家立场、女神关系、双向关系 | -100 到 100；显示分七档：≤ -71 为 -3，-70 到 -31 为 -2，-30 到 -11 为 -1，-10 到 10 为 0，11 到 30 为 1，31 到 70 为 2，≥ 71 为 3 | `rep.*`、`stance.*`、`goddess.*.relation` |
| 剧情阶段与兴趣 | 0 到 3 | `npc.bron.story_level`、`goddess.*.interest` |
| 印象 | -3 到 3 | `goddess.*.impression` |
| 指数 | -100 到 100 | `release_index` |
| 度 | 0 到 100 | `seal_looseness`、`autonomy`、`continent` |
| 名望 | 0 到 100（[认知 5.1][rep]的 0 到 1 乘 100） | `fame.*` |

### 2.7 活变量与快照

同一个量在多幕里演化时，只有一个活变量（无前缀或族写法）；某幕结算需要冻结它给后续幕读取时，另写一个带该幕前缀的快照，不用数字后缀。

| 活变量 | 快照 | 不用的写法 |
| --- | --- | --- |
| `church_verdict` | `a2_church_verdict`、`a3_church_verdict` | `church_verdict_3` |
| `npc.selene.stance` | `a3_selene_stance`；第四幕的结局另立 `a4_selene_stance`（枚举不同） | `selene_stance_3`、`selene_stance_4` |

### 2.8 派生量

派生量由公式算出，内容不能写入；注册表写明公式（`derive`）。

| 派生量 | 公式 |
| --- | --- |
| `trust.archivist` | `MAX(trust.jonas, trust.hildegard)` |
| `a4_lies_exposed` | `COUNT(lie_exposed.eluen, lie_exposed.valda, lie_exposed.merca, lie_exposed.sylvie, lie_exposed.moira)`，第四幕结算时冻结 |
| `a5_purify_success` | `a5_purge_route == people AND a5_gate_ring >= 5`，决战结算时写入 |
| `mysteries_all` | `mysteries_revealed` 含 1 到 11 |
| `npc.ferryman.bond`（第二幕"老船夫信任"0 到 3） | `trust.ferryman` 0 到 24 为 0，25 到 49 为 1，50 到 74 为 2，≥ 75 为 3 |
| `evidence_set` | 全部为真的 `evidence.E*` 组成的集合（只作显示与 `HAS` 读取） |
| `npc_deaths` | 全部为真的 `npc.*.dead` 组成的集合 |

### 2.9 计算函数

计算函数是写在内核里、由内容效果 `compute <函数>` 触发的结算（`src/systems/quests/effect_types.ts` 的 `ComputeFn`）。它读一组变量，按固定规则写另一组变量；内容不直接写它的输出，校验时把这些输出的写入者记为该函数（第 9.3 节第 8 条）。规则以出处条目为准，本表登记输入、写入与调用方。函数名与变量名分属两个命名空间：`court_seat`、`summit_result` 既是函数名，也是变量 `a6_court_seat`、`a4_summit_result` 的别名，条件里出现时一律按变量解析。

| 函数 | 输入 | 写入 | 调用方 | 规则出处 |
| --- | --- | --- | --- | --- |
| `prologue_door_hints` | `p_hint.<倾向>` | `p_door_hints` | 序章面试结束（`cut_p_interview`） | [序章 4.8][a0] |
| `court_verdicts` | `court.<司>.<防线>`、`a6_veto`、`a6_fb_result.hibernate` | `verdict.<司>`、`court.contenders`、`a6_claimant` | 审庭各场（`cut_a6_verdicts`、`cut_a6_joint_reading`） | `src/systems/scenes/court.ts`；[过场目录][cut] `cut_a6_verdicts` |
| `janu_release` | `a6_janu_supports` 的各项（塔维被传唤且 `remnants >= 40`，阿什存活且 `witness_called.ash` 等） | `a6_janu_release`、`a6_janu_supports` | `cut_a6_janu_intent` | [第六幕][a6]；`src/systems/scenes/court.ts` |
| `ending` | 第六幕结局判定所列的全部变量 | `ending`、`a6_release_tone` | 审定前夜 | [第六幕][a6] 11；[过场目录][cut]第 11.1 节 |
| `act5_outcome` | `ring_node.<节点>`、`front.<线>` 的回合结算、第五回合的锁定 | `a5_gate_ring`、`a5_held_unaided`、`a5_janu_act`、`front.<线>`、`a5_alliance_races` | `cut_a5_mirror_c` 开头 | `src/systems/quests/endings.ts`；[过场目录][cut] `cut_a5_mirror_c` |
| `review_score` | 五场审期危机的结局 | `review.<危机>`、`a6_review_score` | 审期结算 | `src/systems/quests/endings.ts` |
| `tide_attribution` | 巨像战具名目击者的 `trust.<人>`、`a1_martha_strike`、`church_suspicion` | `a1_tide_credit` | `cut_a1_martha` | 具名目击者中信任不低于 60 者至少四人取 `player`；否则玛莎出手取 `martha`；否则 `church_suspicion >= 40` 取 `light`；其余取 `self_collapse`（[过场目录][cut]第 5.3 节） |
| `wb_council` | `a2_siege_result`、`a2_signet_holder`、`a2_charter_support`、`trust.rudolf`、`rep.heir_<人>`、`a2_blamed_heir`、`a2_heroes_follow_command`、`npc.selene.stance`、`a2_oracle_edit_proof`、`a2_council_stance`、`a2_heir_fallen` | `a2_wb_ruler` | `cut_a2_siege`（城议） | 七条规则（[过场目录][cut] `cut_a2_siege`） |
| `summit_motion` | 七席的表态（与 `cut_a4_conclave` 表态行同一组条件：`stance.<国>`、`a4_night_seated`、`a4_tavi_seated`、`a4_feast_emperor_ask` 等） | `a4_crusade_authorized` | `cut_a4_conclave` 段二 | 过半即通过（[过场目录][cut] `cut_a4_conclave`） |
| `summit_result` | `a4_summit_bloodshed`、`a4_crusade_authorized`、`npc.emperor.respect`、`a4_refuge_state`、`a4_night_seated`、`a4_tavi_seated`、各纷争链的出口量 | `a4_summit_result`、`a4_allies`、`a4_heresy_state` | `cut_a4_conclave` 段三 | 有人流血为 `broken`；授权通过为 `crusade`；帝国拒绝借道、庇护或迁入、夜后入席、门民之席有人、两条纷争好结局五项全满为 `league`；其余 `accord`（[第四幕][a4] 9.6） |
| `key_to_merca` | `a4_key_pending` | `key_fate.<钥> = merca`、`a4_merca_door_keys` 加 1 | `cut_a4_key_theft` 段四 | [过场目录][cut] `cut_a4_key_theft` |
| `key_to_player` | `a4_key_pending` | `key_fate.<钥> = player`、`a4_player_door_keys` 加 1、发物品 `rl_nameless_key_<n>` | `cut_a4_key_theft` 段四 | 同上 |
| `key_to_remnants` | `a4_key_pending` | `key_fate.<钥> = remnants`、`a4_remnant_door_keys` 加 1 | `cut_a4_key_theft` 段四（塔维存活） | 同上 |
| `key_to_sylvie` | `a4_key_pending` | `key_fate.<钥> = sylvie` | `cut_a4_key_theft` 段四（根下庭未被毁） | 同上 |
| `a5_confession_faith` | `a4_night_pact`、`a5_e09_relayed` | `faith.valda` 的分群修正、战线修正 `front_mod.<线>.<项>` | `cut_a5_confession` 段一 | 战士中不降、魔族平民中 -10；夜后派人数 +20%（`a4_night_pact` 时）；北线敌方诸侯派基准编成 -5% |
| `a5_full_record` | 无（`a5_moira_published` 置真时调用） | `faith.eluen` -20、教国分裂的国家事件、莫伊拉的故事丰度 +30 | `cut_a5_confession` 段四 | 全录之日（[过场目录][cut] `cut_a5_confession`） |
| `a5_luchen_shed_check` | `a5_luchen_answer`、`trust.luchen`、`has.rl_wooden_sparrow`、`has.rl_first_light_scabbard`、`col.col_eight_heroes.done`、`hero_state.yui`、`hero_state.marcus` | `a5_luchen_shed_ok` | `cut_a5_luchen` | 答"放下"计 2、"坐下"计 1；`trust.luchen >= 50` 加 1；三件遗物任一加 1；教国以结衣与马库斯要挟减 1；合计不少于 2 为卸光 |
| `a5_ring_tally` | `ring_node.R01` 到 `ring_node.R07` | `a5_ring_built` | `cut_a5_route` 段三入口 | 为 `built` 的节点数 |
| `act5_resolution` | `hero_state.luchen`、`a5_faceless_end`、`a5_gate_ring`、`a5_janu_act` | `a5_purge_route`、`a5_purify_success`、`continent`、`faith.<司>`、勇者团、萨莎与夜后的第五幕出口量 | `cut_a5_mirror_c` 的 `wrap` 节点 | 终光为 `god`；未用终光且救赎或 `a5_gate_ring >= 5` 为 `people`；其余 `collapse`；灰爆时 `continent` -25 |
| `court_seat` | `a5_purge_route`、`a5_gate_ring`、`a5_alliance_races`、`a4_eluen_page`、`goddess.<司>.relation` | `a6_court_seat`、`a6_witness_for` | `cut_a6_court_open` | `a5_purge_route == people`，或 `a5_gate_ring >= 4 AND a5_alliance_races >= 5` 为 `seated`；否则 `witness`，证人归 `a4_eluen_page` 时的艾琉恩或关系最高的在任女神 |
| `court_veto_claimant` | `a6_claimant`、`a6_court_seat`、`a6_veto` | `a6_veto` | `cut_a6_verdicts` 段一 | 庭之席全审一次；被否决者由 `court_verdicts` 重算 |
| `court_sentence_default` | `verdict.<司>`、`a6_court_seat` | `a6_sentence.<司>`、`court.merca.outlet` | `cut_a6_verdicts`（证人身份） | 自愿离手：艾琉恩 `mortal_walk`、瓦尔妲 `pardon`、梅尔卡 `stay_mortal`、希尔薇 `pardon`、莫伊拉 `handover`；被判离手一律 `exile` |
| `guest_choices` | `ep_player_returned`、客人的存亡与去向（`hero_state.<人>`、`npc.<人>.dead`、`a5_faceless_end`、`a5_sasha_fate`、`a4_hart_state`） | `ep_guest.<人>` | `cut_end_release` 的 `last_door` | 先写默认值，玩家作出单程门选择后对陆辰与结衣再结算一次（[过场目录][cut]第 11.3.1 节） |

## 3. 类型、范围与默认值

| 类型 | 值 | 默认 | 允许的写入 | 允许的比较 |
| --- | --- | --- | --- | --- |
| 标记 | 布尔，单调 | false | `flag` 置真 | 单独作条件；`== true`、`== false` |
| 布尔 | 布尔，可回写 | false | `flag` | 同上 |
| 整数 | 整数，带范围 | 0 或注册表默认 | `flag`、`add`（按范围截断） | 全部比较符 |
| 小数 | 小数，带范围与步长 | 0 | `flag`、`add` | 全部比较符 |
| 枚举 | 值集内的英文标识符 | 注册表默认（常为 `none` 或未写入） | `flag` | `==`、`!=`、`IN` |
| 集合 | 逗号连接的成员（`append` 写入） | 空 | `append` | `HAS` |
| 文本 | 任意字符串 | 空 | `flag`、`storeAs`、`name` | 不比较 |
| 时刻 | tick 或游戏日 | 未写入 | 系统写 | `>=`、`<`（与 `day` 同单位时） |

- 未写入的变量取注册表默认值（条件求值时由解析器提供，不写进存档）。
- `act` 与数字比较时按 `prologue` 0、`act1` 到 `act6` 1 到 6、`epilogue` 7（`actIndex`）。

## 4. 写入者与读取者

| 写入者 | 能写什么 | 怎么校验 |
| --- | --- | --- |
| 内容效果（任务阶段与奖励、场景节点与选项、门效果、导演菜单项、天启） | 注册表里 `writers` 含 `content` 的变量；剧情标记只写本幕的前缀 | 内容校验（第 9.3 节） |
| 系统（quests、scenes、doors、combat、city、economy、strategy、goddess、director、npc、cognition、party、warfare） | 注册表里 `writers` 含该系统的变量，镜像量只由所属系统写 | 代码评审加运行期断言（开发构建里写入未登记的键会抛错） |
| AI（女神、NPC、统治者、导演的提议） | 不能直接写；经被校验的命令（神权动作、对话结果、政策）由系统结算后写入 | 命令白名单（[AI 架构][aia]） |
| 玩家 | 不能直接写；经命令（选择、输入名字、开门、传授） | 同上 |

| 读取者 | 读什么 | 规则 |
| --- | --- | --- |
| 任务与场景条件、门钥、地图出口、台账解锁 | 全部（信号除外） | 只读已登记的名字；不读未来幕的前缀量（第 9.3 节第 7 条） |
| AI 题面 | 注册表里 `ai` 为 `prompt` 的变量，经台账过滤 | 隐藏量（`visibility: hidden`）不直接给 AI，只以线索的形式出现 |
| 界面 | `visibility: player` 的变量 | 显示中文名与分档，不显示隐藏量（例：封印松动度在第三幕 `a3_seal_aware` 之前不显示） |
| 编辑器与检视器 | 全部 | 显示别名提示与写入索引 |

## 5. 条件表达式

### 5.1 文法

以[揭示台账 0.4][rl]为基线（`AND`、`OR`、`NOT`、`>=`、`==`，不使用竖线符号），按[任务与事件 4.1][qe]扩展；与 `src/systems/quests/conditions.ts` 的分词与递归下降解析一致。

```
条件      = 或式 ;
或式      = 与式 , { "OR" , 与式 } ;
与式      = 非式 , { "AND" , 非式 } ;
非式      = "NOT" , 非式 | 比较式 ;
比较式    = 左项 , [ 比较符 , 右项
                   | "IN" , "(" , 右项 , { "," , 右项 } , ")"
                   | "HAS" , 右项 ] ;
比较符    = "==" | "!=" | ">=" | "<=" | ">" | "<" ;
左项      = "(" , 条件 , ")" | 数字 | 字符串 | "true" | "false" | 函数 | 变量 ;
右项      = "(" , 条件 , ")" | 数字 | 字符串 | "true" | "false" | 函数 | 枚举字面量 ;
函数      = ( "COUNT" | "MIN" | "MAX" ) , "(" , [ 条件 , { "," , 条件 } ] , ")" ;
变量      = 标识符 ;                   必须是注册表里的规范名、别名或族成员
枚举字面量 = 标识符 ;                   必须在左项变量的值集内
标识符    = ( 字母 | "_" ) , { 字母 | 数字 | "_" | "." | ":" | "-" } ;
数字      = [ "-" ] , 数字位 , { 数字位 } , [ "." , 数字位 , { 数字位 } ] ;
字符串    = "'" , { 非单引号字符 } , "'" | '"' , { 非双引号字符 } , '"' ;
关键字    = "AND" | "OR" | "NOT" | "IN" | "HAS" | "COUNT" | "MIN" | "MAX" | "true" | "false" ;   区分大小写
```

- 优先级从高到低：括号、比较（含 `IN`、`HAS`）、`NOT`、`AND`、`OR`。`NOT a == b` 读作 `NOT (a == b)`。
- 比较的右边是字面量：右边的裸标识符一律当枚举值，不当变量。两个变量之间不比较；需要时在注册表里立一个派生量。

### 5.2 语义

| 规则 | 内容 |
| --- | --- |
| 真值 | 未写入与 `false`、`0`、空字符串、`"false"`、`"0"` 为假，其余为真（`truthy`） |
| 数字比较 | 任一边是数字时按数字比较；布尔按 1 与 0；`act` 的值按幕序号 |
| 布尔比较 | 任一边是布尔时按真值比较，只支持 `==`、`!=` |
| 字符串比较 | 其余按字符串相等比较 |
| `IN` | 左项等于列表中任一项 |
| `HAS` | 左项是集合（逗号连接），含右项 |
| `COUNT` | 参数中为真的个数 |
| `MIN`、`MAX` | 参数按数字取最小、最大 |
| 空条件 | 为真 |
| 确定性 | 不读现实时间，不抽随机，不调用模型 |

### 5.3 注册表层的约束

1. 条件里的变量必须已登记；引用未登记的名字是编辑期错误，不是运行期的假。
2. 枚举只用 `==`、`!=`、`IN`，字面量必须在值集内；布尔标记直接作条件，不写 `== true`。
3. 条件只做比较与逻辑；加减乘除只出现在注册表的 `derive` 与幕初始化映射里。
4. "足够""较多"一类模糊阈值不进数据，写出数字。
5. 门钥里 `trust.<id> >= N` 与数据层 `bond.<id>.<N>` 等价，加载时统一为前者。
6. 条件长度不超过 400 字符；超过时在注册表里立派生量。

### 5.4 分幕写法的改写表（B-003）

| 分幕与目录里的写法 | 数据层写法 |
| --- | --- |
| 不低于、达到、以上、至少、满 | `>=` |
| 高于、超过 | `>` |
| 低于、不足、未满 | `<` |
| 不高于、至多 | `<=` |
| 为、是、等于、= | `==` |
| 不是、不为、≠ | `!=` |
| 且、并且、加上、同时 | `AND` |
| 或、或者 | `OR` |
| 未、没有、并非 | `NOT` |
| 之一、其中一种 | `IN (a, b, c)` |
| 三取二、N 取 M | `COUNT(a, b, c) >= 2` |
| 都已置真、全部 | 逐个 `AND` |
| 含有、在集合里 | `HAS` |
| ≥、≤（分幕表格里的数学符号） | `>=`、`<=` |
| 中文枚举值（众生、接人、是、否、守住） | 英文值（`people`、`receive`、`true`、`false`、`held`），见第 7.6 节 |

### 5.5 例

| 出处 | 原文要点 | 表达式 |
| --- | --- | --- |
| [第二幕 4.2][a2] | 欧拉平反且教会怀疑度达到 60 | `a1_oola_fate == cleared AND church_suspicion >= 60` |
| [第三幕 9.3][a3] | 阿什讲述与艾琉恩开口都已置真，且阿什关系不是疏远 | `a3_ash_tells_sundering AND a3_eluen_speaks AND a3_ash_relation != distant` |
| [第一幕 11][a1] | 刃之门四取二（门钥） | `COUNT(has.eq_barga_crystalback_sword, a1_dris_duel_won, a1_seg_duel_won, trust.barto >= 40) >= 2` |
| [第三幕 10.3][a3] | 阿什警告已置且封印松动度达到 30 | `a3_ash_warning_doors AND seal_looseness >= 30` |
| [第六幕 11.1.1][a6] | 众生的办法且众门环不少于 5 节点 | `a5_purge_route == people AND a5_gate_ring >= 5` |
| [第六幕 11.1.1][a6] | 无战线溃败且无援守住不少于 3 且雅努接人 | `NOT (front.north == collapsed OR front.east == collapsed OR front.south == collapsed OR front.ring == collapsed OR front.rear == collapsed) AND a5_held_unaided >= 3 AND a5_janu_act == receive` |
| [第六幕 11.1.1][a6] | 五位女神均为自愿离手或被判离手 | `verdict.eluen IN (voluntary, judged) AND verdict.valda IN (voluntary, judged) AND verdict.merca IN (voluntary, judged) AND verdict.sylvie IN (voluntary, judged) AND verdict.moira IN (voluntary, judged)` |
| [揭示台账 7][rl] | 艾斯卡作证 | `trust.eska >= 50` |
| [第一幕 11][a1] | 识才之门三取二（门钥） | `COUNT(boss.crystal_mother.defeated, trust.shiya >= 40, a1_beast_tide_cleared) >= 2` |
| [成长与节奏 4.1][pp] | 落后补正 | 内核规则，不写条件 |

## 6. 编号规则（B-004）

### 6.1 显示编号与数据编号

| 对象 | 显示编号 | 数据编号 | 例 | 主人 |
| --- | --- | --- | --- | --- |
| 主线任务 | `A<幕>-M<两位>` | `q_a<幕>_m<两位>_<slug>` | `A1-M01` 与 `q_a1_m01_fall` | 任务目录（前、后） |
| 支线任务 | `A<幕>-S<两位>` | `q_a<幕>_s<两位>_<slug>` | `A2-S07` 与 `q_a2_s07_archivist` | 同上 |
| 纷争事件链 | `A<幕>-D<两位>`，节点 `A1-D01.a` | 链 `q_a<幕>_d<两位>_<slug>`，节点 `q_a<幕>_d<两位>_<字母>` | `A1-D01` 与 `q_a1_d01_tax_bandits`，节点 `q_a1_d01_a` | 同上 |
| 引路任务 | `A<幕>-G<两位>` | `q_a<幕>_g<两位>_<slug>` | `A4-G01` | 同上 |
| 第五幕战线链与众门环节点 | `A5-FN1`、`A5-FE1`、`A5-FS1`、`A5-FR1`、`A5-RL1`、`A5-R01` 到 `A5-R07` | `q_a5_fn1`、`q_a5_r01` 等 | | 任务目录（后） |
| 第六幕审前准备与下庭 | `A6-P01`、`A6-C01` | `q_a6_p01`、`q_a6_c01` | | 同上 |
| 终章 | `F-M01`、结局 `F-E01`、隐藏 `F-H01`、诸神之战 `F-W01`、新周目 `F-N01` | `q_f_m01` 等 | | 同上 |
| 女神线与女神请托 | `GL-<司>-<两位>` | `q_gl_<司>_<两位>` | `GL-merca-01` 与 `q_gl_merca_01` | 同上 |
| 女神试炼 | `GT-<司>-<两位>` | `trl_<司>_<slug>` | | [女神目录][gi] |
| 公会委托 | `GC-<定级>-<三位>` | 模板 `cmm_<定级小写>_<三位>_<slug>` | `GC-F-001` 与 `cmm_f_001_cellar_rats` | 任务目录 |
| 动态事件模板 | `DE-<来源>-<三位>`（来源 GOD、SOC、SET、DIR、OPS、NAT） | `ev_<来源小写>_<三位>_<slug>` | `DE-GOD-001` | 任务目录 |
| 写定神行节点 | `DB-A<幕>-<两位>` | `ev_db_a<幕>_<两位>` | `DB-A3-01` 曙光圣柱 | 任务目录 |
| 序章节拍 | `P1` 到 `P16` | 场景节点 ID | | [序章][a0] |
| 凡人不信与谨慎桥段 | `U<幕>-<序>`、`C<幕>-<序>` | 不进数据（由任务与台词包承载） | | 分幕文档 |
| 史料道具 | `H01` 到 `H24` | 物品 `lore_h01` 到 `lore_h24`；已读 `read.lore_h01` | `H04` 公会边石分部登记簿 | [编年史 12][his] |
| 证据 | `E01` 到 `E36` | 物品 `evidence_e01` 到 `evidence_e36`；取得 `evidence.E01` | | [第六幕 4.2][a6] |
| 主谜团与副谜团 | `M01` 到 `M12`、`S01` 到 `S08` | 同显示编号 | | [揭示台账][rl] |
| 台账线索 | `M01-C01`、`S01-C01`、`MIS-01` | 同显示编号（`data/quests/lore.json`） | | 同上 |

- 显示编号可以由数据编号机械地算出：去掉 `q_`，第一段大写，第一个下划线换成连字符，去掉 slug（`q_a1_m01_fall` 到 `A1-M01`）。
- 任务的数字按分幕文档的设计编号，不按数据的实现顺序；一条数据任务覆盖几段设计任务时，取最后一段的编号，其余段在任务目录里写"并入"。
- 史料道具用 `H` 是为了不与支线 `S` 和副谜团 `S01` 撞号；[编年史 12][his]的正文本身就写 `H01` 到 `H24`。

### 6.2 现有数据任务的数据编号

| 现有 ID | 设计编号 | 规范数据编号 |
| --- | --- | --- |
| `a1_m01_fall` | A1-M01 | `q_a1_m01_fall` |
| `a1_m02_raven` | A1-M02 | `q_a1_m02_raven` |
| `a1_m03_town` | A1-M03（前段） | `q_a1_m03_town` |
| `a1_m04_register` | A1-M03（后段，并入 A1-M03） | `q_a1_m03_register` |
| `a1_m05_hunt` | A1-M04 | `q_a1_m04_hunt` |
| `a1_m06_grey_wolf` | A1-M05 | `q_a1_m05_grey_wolf` |
| `a1_m07_mine` | A1-M06 | `q_a1_m06_mine` |
| `a1_s01_spring` | A1-M07 | `q_a1_m07_spring` |
| `a1_s02_coin` | A1-S09 | `q_a1_s09_coin` |
| `a1_m08_trial` | A1-M08 并入 A1-M09 | `q_a1_m09_trial` |
| `a1_m09_tide` | A1-M11 并入 A1-M12 | `q_a1_m12_tide` |
| `a1_m10_dream` | A1-M13（前段） | `q_a1_m13_dream` |
| `a1_m11_letter` | A1-M13（后段） | `q_a1_m13_letter` |
| `gq_merca_caravan` | GL-merca-01 | `q_gl_merca_01` |
| `gq_eluen_purge` | GL-eluen-01 | `q_gl_eluen_01` |
| `a2_m01_city` | A2-M01 | `q_a2_m01_city` |
| `a2_m02_exam` | A2-M02 | `q_a2_m02_exam` |
| `a2_m03_company` | A2-M03（商会段） | `q_a2_m03_company` |
| `a2_m04_village` | A2-M03（旧哨段） | `q_a2_m03_village` |
| `a2_m05_defense` | A2-M12 | `q_a2_m12_defense` |
| `a2_s01_archivist` | A2-S07 | `q_a2_s07_archivist` |
| `a3_m01_territory` | A3-M01 | `q_a3_m01_territory` |
| `a3_m02_build` | A3-M01（建设段） | `q_a3_m01_build` |
| `a3_m03_thousand` | A3-M02 | `q_a3_m02_thousand` |
| `a3_m04_ash` | A3-M08 并入 A3-M09 | `q_a3_m09_ash` |
| `a3_m05_ashline` | A3-M11 | `q_a3_m11_ashline` |
| `a3_s01_sealed_room` | A3-S04 | `q_a3_s04_sealed_room` |
| `a4_m01_nation` 到 `a4_m05_revelation` | 第四幕主线（编号以任务目录（后）为准） | `q_a4_m<目录编号>_<原 slug>` |
| `a5_m01_born` 到 `a5_m04_trial` | 第五幕主线（同上） | `q_a5_m<目录编号>_<原 slug>` |
| `a6_m01_court` | 第六幕主线（同上） | `q_a6_m<目录编号>_court` |

任务状态镜像随之是 `quest.q_a1_m01_fall`；`data/party/companions.json` 里的 `quest.a1_m05` 指向 `q_a1_m04_hunt`。

## 7. 统一写法对照表（B-002）

### 7.1 人物代号

| 人物 | 规范代号 | 别名 | 说明 |
| --- | --- | --- | --- |
| 欧拉 | `oola` | `ola` | `trust.ola` 到 `trust.oola`；`a1_oola_fate` 照旧；`a1_ola_fate`、`ola.fate` 是别名 |
| 布伦 | `bron` | `brun` | `brun.story_level` 到 `npc.bron.story_level`；`brun.secret_kept` 到 `npc.bron.secret_kept`；台账 `trust.bron`、`a1_bron_*` 照旧 |
| 玛莎 | `martha` | `marsha` | `marsha.assessment` 到 `npc.martha.assessment`；`marsha.revealed` 到 `npc.martha.revealed` |
| 陆辰 | `luchen` | `lu`、`lu_chen` | `hero_rel_lu`、`hero_rel_luchen` 到 `trust.luchen`；`hero_state_lu` 到 `hero_state.luchen`；`lu_lowered_sword` 到 `a3_luchen_lowered_sword` |
| 夜后 | `night_queen` | `vespera` | `trust.vespera` 到 `trust.night_queen` |
| 剑帝 | `emperor` | 无 | `emperor_respect` 到 `npc.emperor.respect` |
| 薇罗 | `viro` | `vero` | `vero.status` 到 `a1_viro_status`；首领战模板仍是 `vero`（战斗模板不是人物 ID） |
| 维克 | `vick` | `vik` | `vik.informant` 到 `a1_vick_informant` |
| 史官 | `jonas`、`hildegard` | `archivist` | `trust.archivist` 是派生量（第 2.8 节） |
| 老船夫 | `ferryman` | 无 | `ferryman_bond` 是 `trust.ferryman` 的派生分档 |
| 炉主 | `gunnhild_deephammer` | `gunnhild` | `trust.gunnhild` 到 `trust.gunnhild_deephammer` |

### 7.2 剧情标记与序章

| 读到的写法 | 规范名 | 说明 |
| --- | --- | --- |
| `met_ash` | `a1_ash_met` | |
| `a1_talent_door` | `door.talent_sight` | 开门由门族表示，不另立剧情标记 |
| `prologue.<属性>` | `p_<属性>` | 序章的出口量与标记统一用 `p_`（例 `prologue.earth_opening` 到 `p_earth_opening`） |
| `prologue.player_name`、`player.name` | `player.name` | 名字是玩家实体的属性；序章输入节点写它 |
| `prologue.hint.<倾向>` | `p_hint.<倾向>` | 族 |
| `prologue.free.<话题>` | `p_free.<话题>` | 族（文本） |
| `merca_coin.terms` | `p_coin_terms` | |
| `courtyard.first_object` | `p_courtyard_object` | |
| `eluen.believes_player_dead` | `p_eluen_believes_dead` | |
| `moira.page_anomaly_noted` | `p_moira_page_anomaly` | |
| `a2.nera_partner` | `a2_company_partner` | 同一件事（与奈拉合伙） |
| `a4.refused_to_let_go`、`a5.blood_for_key` | `a4_refused_to_let_go`、`a5_blood_for_key` | 幕前缀后用下划线 |
| `a5.breach_refused`、`eluen_page_accepted`、`eluen_page_torn`、`soul_ferry.held`、`god_war_clock`、`god_war_saved` | `a5_breach_refused`、`a4_eluen_page_accepted`、`a5_eluen_page_torn`、`a4_soul_ferry_held`、`a6_god_war_clock`、`a6_god_war_saved` | 千门文档与门目录的写法，补幕前缀 |
| `castle_well_open`、`deer_ford_result` | `a2_castle_well_open`、`a3_deer_ford_result` | 地图简报与战争目录的写法，补幕前缀 |
| `seal_looseness_known` | `a3_ash_warning_doors` | 同一件事（守门人的警告）；界面读它显示"门后的风" |
| `a1_dian_term_heard` | `term.dian_known` | 称谓切换走称谓族（D-030） |
| `nera.handed_over`、`cassian.path` | `npc.nera.handed_over`、`npc.cassian.path` | 人物属性族 |
| `sylvie_enmity` | `goddess.sylvie.enmity` | 女神族 |
| `a3_danger_door_vow` | `a3_vow_kept_reed_bridge` | 誓光之门不是禁门，不得被按名字计入 `danger_doors_opened`（C91） |
| `eluen_page_considered` | `a4_eluen_page_considered` | |
| `janu_restore_chosen` | `a6_janu_restore_chosen` | |
| `hidden_ending`、`maker_room_seen`、`earth_message_replied`、`player_returned`、`yeyu_stayed`、`court_keeper` | `ep_hidden_ending`、`ep_maker_room_seen`、`ep_earth_message_replied`、`ep_player_returned`、`ep_yeyu_stayed`、`ep_court_keeper` | 终章前缀 |
| `epilogue.ruler`、`epilogue.shown`、`new_god_disposal` | `ep_ruler`、`ep_shown`、`ep_new_god_disposal` | |
| `next_cycle` | `cycle` | 内置量 |

### 7.3 女神与梅尔卡

| 读到的写法 | 规范名 | 换算 |
| --- | --- | --- |
| `merca_favor`（-2 到 3） | `goddess.merca.relation`（-100 到 100） | 关系 = 好感 × 25；读条件 `merca_favor >= 2` 改写为 `goddess.merca.relation >= 50` |
| `merca_offerings` | `merca_offerings` | 供奉次数，与关系是两个量 |
| `god_rel_<司>`、`god_rel.<司>` | `goddess.<司>.relation` | 同量纲 |
| `eluen_awareness` | `goddess.eluen.gaze` | 同量纲 0 到 100 |
| `moira_sight` | `goddess.moira.gaze` | 同上 |
| `valda_interest`（第三幕 0 到 3） | `goddess.valda.interest` | 同量纲 |
| `goddess.<司>.impression`、`.interest`、`.memory_tags` | 照旧 | 序章产出（[序章 8][a0]） |
| `faith_<司>` | `faith.<司>` | 族 |
| `verdict_<司>` | `verdict.<司>` | 族 |
| `god_exposed_<司>` | `lie_exposed.<司>` | |
| `breach.<司>.<幕>` | 照旧 | 越约记录（goddess） |

### 7.4 快照、族写法与量纲

| 读到的写法 | 规范名 | 说明 |
| --- | --- | --- |
| `church_verdict_3` | `a3_church_verdict` | 快照 |
| `selene_stance` | `npc.selene.stance` | 活变量 |
| `selene_stance_3` | `a3_selene_stance` | 快照 |
| `selene_stance_4` | `a4_selene_stance` | 第四幕的结局（枚举不同） |
| `selene_evidence` | `npc.selene.evidence` | |
| `front_<线>` | `front.<线>` | 族 |
| `hero_state_<人>` | `hero_state.<人物 ID>` | `hero_state_lu` 到 `hero_state.luchen` |
| `hero_rel_<人>`（-100 到 100） | `trust.<人物 ID>`（0 到 100） | 信任 = (关系 + 100) ÷ 2，第二幕出口换算（[第二幕 10.2][a2]） |
| `hero_arrest_choice_<人>` | `a2_arrest_choice.<人物 ID>` | 族 |
| `stance_<国>`、`STANCE_*` | `stance.<国>` | 族 |
| `faction_rep_<势力>`（-3 到 3） | `rep.<势力>`（-100 到 100） | 声望 = 档 × 33 |
| `academy_rel`、`antler_rel`、`rats_rel` | `rep.academy`、`rep.antlers`、`rep.greyrats` | |
| `town_trust.<群体>`（0 到 100） | `rep.bs_<群体>`（-100 到 100） | 声望 = 信任 × 2 - 100 |
| `philip_rel`（-3 到 3） | `trust.philip` | 信任 = 50 + 档 × 15 |
| `nat_autonomy` | `autonomy` | |
| `nat_power`、`nat_polity`、`nat_legit` | `nation.power`、`nation.polity`、`nation.legit` | 国家层镜像 |
| `house_scale` | `econ.house_scale` | 商会规模，economy 写 |
| `hart_relation` | `npc.hart.relation` | 活变量（第二、三幕） |
| `door_seal`、`janu.seal_loosening`、`SEAL` | `seal_looseness` | D-031 |
| `bond.<人>` | `trust.<人>` | 同伴的羁绊就是信任 |
| `bond.<人>.<N>` | 条件 `trust.<人> >= N` | 门钥写法 |
| `item.<物品>` | `has.<物品>` | 物品持有 |
| `potential.seen` | `npc.<人>.potential_seen` | 集合拆成族 |
| `npc.deaths` | `npc.<人>.dead` | 集合拆成族，派生集合 `npc_deaths` |
| `npc.focus.<人>` | `ai.focus.<人>` | 避免与 `npc.<人>.<属性>` 冲突 |
| `ron.commander_awakened` | `npc.ron.awakened` | 启才之门的效果 |
| `dg_state.<迷宫>.<字段>` | `dg.<迷宫>.<字段>` | 迷宫状态镜像 |
| `act_index` | `act` | 与数字比较即可 |

### 7.5 证据

| 读到的写法 | 规范名 |
| --- | --- |
| 台账 `evidence.<编号>` | `evidence.E01` 到 `evidence.E36` |
| 第四、五幕出口表的集合 `evidence` | 派生集合 `evidence_set` |
| `evidence.report_978`、`a1_report_978_obtained`（第一幕） | `has.lb_report_978_copy`（侯克的报告抄本，二十年前的报告抄本，[遗物目录][relics]） |
| `evidence.oracle_text`（`data/strategy/config.json`） | `evidence.E15`（神谕原文） |
| `evidence.great_severance` | `evidence.E01`（守门人阿什的证言） |
| `evidence.demon_cycle` | `evidence.E10`（历代魔王诞生图） |
| `evidence.remnant_truth` | `evidence.E04`（遗民门歌） |
| `eluen_violation_evidence`（none、witnessed、recorded） | `a3_eluen_violation`；`evidence.E36` 在其为 witnessed 或 recorded 时由第三幕结算置真 |
| `evidence.<编号>.shown`（审庭呈示） | 照旧（court 镜像） |

### 7.6 枚举值

| 变量 | 规范值 | 值别名 |
| --- | --- | --- |
| `a5_purge_route` | `people`、`god`、`collapse` | 众生、`gods`、神、溃决 |
| `a5_faceless_end` | `redeemed`、`destroyed`、`final_light` | 救赎、毁灭、终光 |
| `a5_janu_act` | `receive`、`seal` | 接人、封隙 |
| `front.*` | `held`、`stalemate`、`lost`、`collapsed` | 守住、僵持、失守、溃败 |
| `verdict.*` | `voluntary`、`judged`、`refuse`、`contend` | 自愿离手、`willing`；被判离手；拒绝、`refused`；争掌、`claimant` |
| `review.*` | `self`、`barely`、`descend`、`fail` | 自持、勉强、下庭解决、失败 |
| `a6_court_seat` | `seated`、`witness` | 就座、证人 |
| `a6_returned_doors` | `all`、`some`、`none` | 全部、`partial`、部分 |
| `a4_summit_result` | `league`、`accord`、`crusade`、`broken` | 眠鳞同盟、分化、圣战联军、破裂；`a4_alliance` 的 `broad`、`narrow`、`broken` 分别读作 `league`、`accord`、`broken` |
| `p_earth_opening` | `a`、`b`、`c`、`d` | `A`、`B`、`C`、`D` |
| `p_rejection_response` | `r1` 到 `r5` | `R1` 到 `R5` |
| `p_last_words` | `back`、`regret`、`thanks`、`silent` | 序章数据里的四句原文（"我会回来的"、"你们会后悔的"、"谢谢你的硬币"、不说话） |
| `p_courtyard_object` | `lamp`、`empty_bowl`、`waiting_chair`、`old_chair`、`bare_tree`、`open_window`、`old_cup`、`old_scarf`、`unsent_letter`、`blank_paper` | 序章数据里的十句原文 |
| `ep_ruler` | 女神代号 | 艾琉恩、瓦尔妲、梅尔卡、希尔薇、莫伊拉 |
| `a1_count_letter` | `a`、`b`、`c`、`d` | 甲、乙、丙、丁 |
| `a4_night_pact`、`a4_eluen_page`、`a5_moira_published`、`a5_eska_consent` 一类"是、否" | 布尔 | 是、否 |
| `nation.polity` | `monarchy`、`doorcourt`、`federation`、`guild_republic`、`charter`、`masterless` | 王政、门庭议会、界石联邦、行会共和、学士宪政、无主之制 |
| `a1_tide_credit` | `player`、`martha`、`light`、`self_collapse` | `marsha` 即 `martha`；`collapse`、`collapsed` 即 `self_collapse`（过场目录与任务目录（前）的写法） |
| `a3_ashline_route` | `rout`、`persuade`、`bloodless`、`failed` | `fallen` 即 `failed`（过场目录 `cut_a3_ashen_line` 的写法） |

### 7.7 系统镜像与剧情标记的合并

同一件事有系统镜像又有剧情标记时，保留一个名字，另一个登记为别名，由写入的系统直接写规范名：

| 同一件事 | 规范名 | 别名 |
| --- | --- | --- |
| 立国 | `a4_nation_founded` | `slg.nation_founded` |
| 会盟结束 | `a4_conclave_done` | `slg.conclave_done`、`a4_conclave_scene_done` |
| 会盟结果 | `a4_summit_result` | `slg.summit_result`、`summit_result`、`a4_alliance` |
| 会盟流血 | `a4_summit_bloodshed` | `slg.summit_bloodshed` |
| 立村 | `a2_village_founded` | `city.village_founded` |
| 受封领地（城建扩张） | `a3_territory_granted` | `city.territory_granted` |
| 识才之门开启 | `door.talent_sight` | `a1_talent_door` |

### 7.8 过场目录的写法

[过场目录][cut]的场景脚本与新旗标表里，下列写法与本表已有的规范名是同一件事或不合第 2 节的命名规则，登记为别名；加载器按此换成规范名。

| 读到的写法 | 规范名 | 说明 |
| --- | --- | --- |
| `prologue.unsent_words`、`prologue.store_role`、`prologue.waiting_for`、`prologue.call_free_count`、`prologue.cycle_name_reaction` | `p_unsent_words`、`p_store_role`、`p_waiting_for`、`p_call_free_count`、`p_cycle_name_reaction` | 序章前缀按第 7.2 节统一为 `p_` |
| `prologue.round_end.<神>`、`prologue.free.call`、`prologue.free.appraise` | `p_round_end.<神>`、`p_free.call`、`p_free.appraise` | 族 |
| `a1_trial_debunk` | `a1_lamp_exposed` | 同一件事：审判当场拆穿光之鉴 |
| `a1_seep_channel_found` | `a1_spring_source_found` | 同一件事：A1-M07 找到渗泉暗渠（病源） |
| `a2_yui_saw_light_bend` | `a2_yui_saw_light` | 同一件事：光之奇迹祭上结衣察觉圣光绕开了玩家（`cut_a2_heroes` 在玩家站着不动时写入） |
| `a2_w6_false_record_unseen` | `a2_mirror_fooled` | 同一件事：第 6 周问话时伪录骗过照规镜，光之审提前到第 9 周 |
| `a2_forgery_source_found` | `a2_forgery_source` | 同一件事：拿到迪特里希伪证的来源 |
| `a2_charter_draft_found` | `a2_charter_found` | 同一件事：书房里没盖印的特许状草稿 |
| `a2_bishop_oracle_leverage` | `a2_oracle_edit_proof` | 同一件事：主教删改神谕的把柄 |
| `a2_held_<出口>`（`a2_held_mudlane` 等五个） | `a2_held.<出口>` | 按实体索引的量用族写法（第 0 节第 3 条） |
| `rule.ironman` | `ironman` | 内置量 |
| `territory_seat` | `a3_seat` | 同一件事：领主府选址；过场的两个值 `borderstone`、`old_outpost` 即聚落 ID |
| `a3_sigrid_witness` | `a3_physician_testimony` | 同一件事：御医 `sigrid` 愿意作证并回到床边（A3-S03） |
| `a3_jorg_spared` | `a3_jorg_home_visit` | 同一件事：放约尔格去边石镇看妹妹（A3-D02.c，桥段 U3-4） |
| `a4_vespera_sincere` | `a4_night_queen_sincere` | 人物代号按第 7.1 节（`vespera` 即 `night_queen`） |
| `door.door_<代号>`、`door_hint.door_<代号>`、`push_door.door_<代号>` | `door.<门 ID>`、`door_hint.<门 ID>`、`push_door.<门 ID>` | 门族的键是 `data/doors/doors.json` 的 `id`；写成门目录代号（`code`）时按 `code` 换成 `id`（例 `push_door.door_founding` 即 `push_door.founding`，`door.door_resonance` 即 `door.resonance`） |
| `a1_talent_door`（`cut_a1_talent` 的写入与触发） | `door.talent_sight` | 第 7.2 节；"本场已播"用 `scene.cut_a1_talent.seen` 判断 |

## 8. 变量总表

列说明：**规范名**；**别名**（加载时换成规范名的写法）；**类型**（第 3 节）；**范围或取值**；**首次写入**（谁、在哪一幕）；**读取处**（系统、文档与数据文件）。
数据文件简写：`q` = `data/quests/quests.json`，`lore` = `data/quests/lore.json`，`terms` = `data/quests/terms.json`，`acts` = `data/quests/acts.json`，
`s0` = `data/scenes/prologue.json`，`s1` = `data/scenes/act1.json`，`s25` = `data/scenes/acts2_5.json`，`sc` = `data/scenes/court.json`，
`se` = `data/scenes/endings.json`，`sep` = `data/scenes/epilogue.json`，`dr` = `data/doors/doors.json`，`gd` = `data/goddess/*.json`，
`pc` = `data/party/companions.json`，`np` = `data/npc/personas.json`。

### 8.1 内置量

| 规范名 | 别名 | 类型 | 范围或取值 | 首次写入 | 读取处 |
| --- | --- | --- | --- | --- | --- |
| `act` | `act_index` | 枚举 | `prologue`、`act1` 到 `act6`、`epilogue`；与数字比较按 0 到 7 | 新游戏；幕切换（quests 的 `act` 效果，`acts`） | 全部任务触发（`q`）、台账解锁（`lore`）、女神（`gd`）、门钥（`dr`） |
| `act_week` | 无 | 整数 | 1 到 33（各幕周数：12、14、24、31、33、26） | 内核日历（幕开始置 1，每 7 日加 1） | 任务时间窗、纷争链、默认发展、`act_week` 窗口（任务目录） |
| `day` | 无 | 整数 | ≥ 0 | 内核时钟 | 期限、冷却 |
| `season` | 无 | 枚举 | `spring`、`summer`、`autumn`、`winter` | 内核日历（13 周一季） | 事件、产出、行军 |
| `year` | 无 | 整数 | 998 起 | 内核日历 | 编年显示、事件 |
| `hour` | 无 | 整数 | 0 到 23 | 内核时钟 | 时辰事件、日程 |
| `ai_enabled` | 无 | 布尔 | | 设置与提供方连接测试 | 序章分支（`s0`） |
| `difficulty` | 无 | 枚举 | `story`、`standard`、`hard`、`legend` | 新游戏与设置 | 战斗与事件的明示修正（[成长 15][pp]） |
| `ironman` | `rule.ironman` | 布尔 | | 新游戏时开启；开局后可关闭，关闭不可逆（与难度无关） | 同伴与将领的死亡结算（D-073） |
| `cycle` | `next_cycle` | 整数 | ≥ 1 | 回收结局进入下一期（`se`） | 下一期内容（[第六幕 13][a6]） |
| `player.level` | 无 | 整数 | 1 到 60 | combat 升级 | 补正判定、少数任务条件 |
| `player.name` | `prologue.player_name`、`p_player_name` | 文本 | | 序章 N5 输入（`s0`） | 台词插槽（`s0`）、隐藏结局的信 |
| `player.taint` | 无 | 整数 | 0 到 100 | 澱染日结算（镜像） | 欧拉等人的台词、澱病相关任务 |
| `player.injury` | 无 | 枚举 | `none`、`minor`、`limb` | combat（镜像） | 台词 |
| `player.spoke_forbidden_name` | 无 | 标记 | | goddess 尊名唤醒（玩家念出被禁之名） | 女神与台账（D-023） |

### 8.2 全局量

| 规范名 | 别名 | 类型 | 范围或取值 | 首次写入 | 读取处 |
| --- | --- | --- | --- | --- | --- |
| `seal_looseness` | `door_seal`、`janu.seal_loosening`、`SEAL` | 小数 | 0 到 100，半分 | 第一幕开场置起始值（`acts`）；之后每次开门（doors）；门徒会行动 | `a3_seal_aware`、女神察觉阈值、`s25`、结局 |
| `seal_unrest` | 无 | 整数 | 0 到 100；序章末 10；兽潮后重置 30 加修正 | 序章末；第一幕每周 +9；开门（D-031 范围）；任务效果（`q`） | 兽潮时钟、第二幕遗迹危险度 |
| `doors_opened` | 无 | 整数 | ≥ 0 | doors 开门 | 计数门钥、事迹 |
| `danger_doors_opened` | 无 | 整数 | 0 到 9 | doors 开危险之门 | 揭示台账、结局与事迹、新神倾向（无主之制读 `danger_doors_act3`） |
| `door_rank` | 无 | 整数 | 1 到 99 | doors 开门（[千门 4][td]） | 阶钥、门技分档、兽伴与驯兽上限 |
| `blockage` | 无 | 整数 | 0 到 100 | 澱染折算、渊契技能、深澱死亡（[千门 6.2][td]） | 门失灵、吞门 |
| `blockage_survived` | 无 | 标记 | | 灰廊之夜撑过 | 残页之门 |
| `door_fatigue` | 无 | 整数 | 0 到 100 | 退回门内、门技过用（[千门 6.3][td]） | 门技、复苏 |
| `seal_points` | 无 | 整数 | 0 到 200（半分） | doors 开门与闭门、门以外的来源（[千门 6.4][td]） | 内核内部；对外只读镜像 `seal_looseness` = `seal_points` / 2 |
| `seal_stage` | 无 | 整数 | 0 到 6；只升不降，按幕封顶（阶段不超过当前幕次） | doors 封印结算（[千门 6.4.3][td]） | 女神察觉（`seal.stage_up`）、雅努入梦与出手、回廊"门后的风"的阶段名（[界面][ux]） |
| `breach_count` | `doors.breach` | 整数 | ≥ 0 | 破门之门每强开一扇门（[千门 10.2][td]） | 无貌者的镜像对白、事迹 |
| `danger_doors_act3` | 无 | 整数 | 0 到 9 | doors 在第三幕开启禁门 | D-054 无主之制的解锁条件（[千门 6.4.6][td]） |
| `gatebronze_smelted` | 无 | 整数 | ≥ 0 | 每熔一件带门铜合金的遗物加一（[遗物目录 1.5][relics]） | 阿什、学院学者与遗民长老、矮人炉工的反应；事迹 |
| `church_suspicion` | 无 | 整数 | 0 到 100 | 第一幕桥段与魔女审判（`q` 的 `a1_m08_trial`、`gq_eluen_purge`）；cognition 目击 | 赛琳初始怀疑、教会定性 |
| `church_verdict` | 无 | 枚举 | `clear`、`suspect`、`heresy_suspect`、`wanted`、`lost_lamb`、`heretic`、`demon_precursor` | 第二幕教会议政轮 | 第二、三幕审判与圣战 |
| `village_autonomy` | 无 | 整数 | 0 到 100 | city（村落阶段每日） | `territory_autonomy` 的起点 |
| `territory_autonomy` | 无 | 整数 | 0 到 100 | city（领地阶段每日） | 立国之门（`dr` 的 `founding`，D-044）、审期 |
| `autonomy` | `nat_autonomy` | 整数 | 0 到 100 | city（立国后每日，含 `autonomy_bonus`） | 战线、审期危机、真结局（D-043，`se`） |
| `autonomy_bonus` | 无 | 整数 | 0 到 20 | 第四幕会盟场景（`s25`） | city 的国家自治度 |
| `village_pop` | 无 | 整数 | 0 到 400 | city | 第二幕出口、第三幕起点 |
| `village_defense` | 无 | 整数 | 0 到 3 | city | 城下潮、第三幕 |
| `territory_pop` | 无 | 整数 | 0 到 10,000 | city | 第三幕出口 |
| `territory_scale` | 无 | 整数 | 0 到 9 | 第三幕里程碑 T1 到 T9 | 第三幕出口、立国 |
| `release_index` | 无 | 整数 | -100 到 100 | 审期结算（各国自治度按人口加权减神依赖度） | 冬至审定、E34 |
| `janu_faith` | 无 | 整数 | 0 到 100 | 第五幕封隙等事件（quests 的 `act5_outcome`） | 第六幕 |
| `continent` | 无 | 整数 | 0 到 100，默认 70 | 第一幕开场置 70（`acts`）；第五幕决战（`q`） | 回收（< 20）、真结局（≥ 50） |
| `yeyu_letters` | 无 | 整数 | 0 到 5 | 受封（1）、萨莎撤军（2）、瓦尔妲结盟提议（3）、莫伊拉点破同构（4）、灰烬决战结束（5）（`s25`） | 信使之门（`dr`）、`pc`、第七封（`sc`）、`se` |
| `merca_offerings` | 无 | 整数 | ≥ 0 | goddess 供品交易 | 梅尔卡线（`q`） |
| `miracle_count` | 无 | 整数 | ≥ 0 | goddess 神迹账 | E34、导演 |
| `eluen_fear` | 无 | 整数 | 0 到 100 | goddess 日结算（[女神目录 3.2][gi]） | 艾琉恩的越约条件；只进内核与审计，不进任何女神的题面 |
| `merca_stake` | 无 | 整数 | 0 到 100 | 同上 | 梅尔卡的越约条件 |
| `moira_keep` | 无 | 布尔 | | 同上 | 莫伊拉的护书条件 |
| `merca_ledger` | 无 | 整数 | 可为负（往来账余额，供分） | goddess 供品结算（[女神目录 9][gi]） | 回礼菜单、梅尔卡的态度 |
| `sylvie_kill_ledger` | 无 | 整数 | ≥ 0；30 游戏日滚动窗口 | goddess 日结算 | 希尔薇的反应、归泉之许 |
| `ops_revelations_landed` | 无 | 整数 | ≥ 0 | goddess 运营天启落地（D-079 AQ-05） | 天启节奏 |
| `div_journal_tier` | 无 | 整数 | 0 到 3 | goddess（[女神目录][gi]） | "神之记录"界面的开放档 |
| `fate_threads` | 无 | 整数 | ≥ 0 | director 巧合 | E21 命运丝 |
| `guild_rank` | 无 | 枚举 | `f`、`e`、`d`、`c`、`b`、`a`、`s` | 第一幕登记（`f`）；第二幕考核（`b`） | 委托板、"F 级国主" |
| `econ_indep` | 无 | 整数 | 0 到 100 | 第四幕经济战结算 | 战线补给、审期契约停摆 |
| `moira_pages` | 无 | 整数 | 0 到 11 | 与莫伊拉交易（`s25`） | E07、全录之日 |
| `remnants` | 无 | 整数 | 0 到 100 | 旧哨村遗民之屋（`q` 的 `a2_m04_village`）；苇塘；根下庭 | 共鸣之门（`dr`）、第四五幕 |
| `cult_keys` | 无 | 整数 | 0 到 15 | 第二幕门徒会绑走孩子 | 第三幕、`cult_door_keys` 起始值 |
| `cult_door_keys` | 无 | 整数 | 1 到 4 | 第四幕钥匙失窃 | 第五幕破门之门 |
| `handover_choices` | 无 | 整数 | ≥ 0 | 第一到三幕"交给众人决定"类选项 | D-054 无主之制 |
| `mysteries_revealed` | 无 | 集合 | 1 到 12 | 谜团揭开时 | 隐藏结局 |
| `mysteries_all` | 无 | 派生布尔 | 第 2.8 节 | quests 的 `ending` 计算 | `se`、`sep` |
| `ending` | 无 | 枚举 | `release`、`release_unfinished`、`new_god`、`rule_eluen`、`rule_valda`、`rule_merca`、`rule_sylvie`、`rule_moira`、`janu_restored`、`reclaim` | 冬至审定（quests 的 `ending` 计算） | 结局场景（`sc`、`se`）、终门（`dr`） |
| `xp_overflow` | 无 | 整数 | ≥ 0 | combat（满级后，[成长 4.4][pp]） | 庭院演武场传授 |
| `trust.archivist` | 无 | 派生整数 | `MAX(trust.jonas, trust.hildegard)` | 派生 | `np`、`lore` |

### 8.3 剧情标记

全部为标记（布尔、单调）。首次写入一栏写分幕事件，括号里是现有数据的写入点。

| 规范名 | 别名 | 首次写入 | 读取处 |
| --- | --- | --- | --- |
| `p_interview_done` | 无 | 序章 P10 五场面试结束（`s0`） | `lore` |
| `p_discarded` | 无 | 序章 P14 被丢弃（`s0`） | `lore` |
| `p_caught` | 无 | 序章 P15 坠落时听见"接住你了"（`s0`） | 台账 |
| `p_eluen_believes_dead` | `eluen.believes_player_dead` | 序章结束（`s0`） | 女神 GM（第一、二幕艾琉恩不关注玩家） |
| `p_moira_page_anomaly` | `moira.page_anomaly_noted` | 序章 P12（`s0`） | 莫伊拉导演的巧合 |
| `p_asked_sixth_chair` | `prologue.asked_sixth_chair` | 序章 N5（`s0`） | 第一幕神纹大厅独白（`s1`） |
| `p_reached_out` | `prologue.reached_out` | 序章 N13（`s0`） | 第一幕梦境（`s1`）、结局（`se`） |
| `p_mirror_done` | `prologue.mirror_done` | 序章镜前（`s0`） | `s0` |
| `p_heard_neighbors` | `prologue.heard_neighbors` | 序章偷听（`s0`） | `s0` |
| `a1_wake_ruins` | 无 | 第一幕开场（`acts`） | `lore` |
| `a1_ruins_gate_cleared` | 无 | 第一幕第 3 周从内侧清开封门遗迹门厅的落石 | 封门遗迹正门的开关格与出口 `to_borderstone`（[地图简报 12][mb]） |
| `a1_mine_cleared` | 无 | 锈岭矿塌方口一夜打通（第一幕） | 锈岭矿的开关格（[地图简报][mb]） |
| `a1_ash_met` | `met_ash` | A1-M01 灰烬室（`q` 的 `a1_m01_fall`） | `s1` |
| `a1_ash_page` | 无 | A1-M01 灰烬室里试图与阿什搭话（`s1`） | 第三幕阿什的回扣 |
| `a1_yeyu_bound` | 无 | A1-M02 契约（`q` 的 `a1_m02_raven`） | 澄流之门（`dr`）、`lore` |
| `a1_guild_registered` | 无 | A1-M03 登记（`q` 的 `a1_m04_register`） | `lore` |
| `a1_first_hunt` | 无 | A1-M04（`q` 的 `a1_m05_hunt`） | 事迹 |
| `a1_cassian_appraise` | 无 | 卡西安的圣光鉴定失败（`s1`） | 台账 |
| `a1_bron_drunk_tale` | 无 | A1-S18 布伦的醉话 | 台账 S02 |
| `a1_coin_story` | 无 | A1-S09（`q` 的 `a1_s02_coin`） | 商契之门（`dr`） |
| `a1_north_spring_found` | 无 | A1-M07（`q` 的 `a1_s01_spring`） | 借形之门（`dr`）、`s1` |
| `a1_witch_trial_started` | 无 | 魔女审判开始（`q` 的 `a1_m08_trial`） | `lore` |
| `a1_orphan_mark_seen` | 无 | 孤儿院门纹胎记（`s1`） | 女神（`gd`）、`lore` |
| `a1_moss_exposed` | 无 | 揭发莫斯 | 台账 |
| `a1_owen_left` | `owen.status`（离开） | 欧文第 6 周离开（税与匪默认发展） | 欧文的人设可见性（`np`） |
| `a1_dris_duel_won` | 无 | A1-S16 赢德里斯 | 刃之门 |
| `a1_seg_duel_won` | 无 | 与瑟格的决斗 | 刃之门 |
| `a1_beast_tide_started` | 无 | 兽潮开始（`q` 的 `a1_m09_tide`） | 波次 |
| `a1_beast_tide_cleared` | 无 | 兽潮结束（`q`） | 波次 `endOnFlag`、识才之门（`dr`）、`lore` |
| `a1_martha_strike` | 无 | 玛莎出手（`q`） | `lore` |
| `a1_dream_door_woman` | 无 | 兽潮次夜的梦（`s1`） | 门内庭院（`dr`）、雅努（`gd`）、`lore` |
| `a1_bron_sees_mark` | 无 | 布伦看见门纹（`s1`） | 台账 |
| `a2_arrive_valen` | 无 | A2-M01 进城（`q`） | 台账 |
| `a2_heroes_arrived` | 无 | 第 4 周勇者团抵城（`q`） | 勇者团人设出场（`np`） |
| `a2_promotion_exam` | 无 | A2-M02（`q`） | 伪录之门（`dr`） |
| `a2_heroes_met` | 无 | 光之奇迹祭初见（`s25`） | 收放之门（`dr`）、`lore` |
| `a2_selene_met` | 无 | 赛琳初见（`s25`） | 伪录之门（`dr`） |
| `a2_archivist_met` | 无 | A2-S07（`q` 的 `a2_s01_archivist`） | 术式之门（`dr`）、`lore` |
| `a2_greyrat_deal` | 无 | A2-S08 与黛拉的第一笔交易 | 台账 |
| `a2_company_partner` | `a2.nera_partner` | A2-M03 商会段（`q`） | 商契之门（`dr`）、奈拉随行（`pc`） |
| `a2_village_founded` | `city.village_founded` | 筑庐之门与立村（city） | 市场（`data/economy/markets.json`）、`q`、`s25`、审期 |
| `a2_remnants_settled` | 无 | 遗民之屋（`q` 的 `a2_m04_village`） | 筑庐之门、立国之门（`dr`） |
| `a2_disciples_lair` | 无 | A2-M08 门徒会据点（`s25`） | 隔扉之门、影之门（`dr`）、`lore` |
| `a2_dungeon_first` | 无 | 首次攻略旧水道（`q`） | 收放之门、伪录之门（`dr`） |
| `a2_ferryman_reveal` | 无 | A2-M07 瓦伦河一刀（`s25`） | 影之门（`dr`）、`lore` |
| `a2_count_poison_found` | 无 | A2-M09 验毒（`s25`） | 台账 |
| `a2_faceless_projection` | 无 | A2-M11 葬礼投影（`s25`） | 称谓（`terms`）、说话人显名（`data/scenes/speakers.json`） |
| `a2_aiden_no_page` | 无 | A2-M13 星笔塔（`s25`） | `lore` |
| `a2_ferryman_ninth` | 无 | A2-M13 门前渡（`s25`） | `lore` |
| `a2_barony_granted` | 无 | A2-M13 受封（`s25`） | `yeyu_letters` 第 1 封 |
| `a2_castle_well_open` | `castle_well_open` | 第二幕第 13 周后伯爵许可通行鹰丘旧井 | 瓦伦堡出口 `to_castle_well`（路线 `castle_well_shaft`，[地图简报][mb]） |
| `a3_territory_granted` | `city.territory_granted` | A3-M01 抵领（`q`） | city 扩张为领地 |
| `a3_thousand_gate` | 无 | A3-M02 千军场景（`s25`） | 千军之门的演出 |
| `a3_vow_taken` | 无 | 誓光之门的立誓选择（`s25`；可写 false） | `a3_vow_kept_reed_bridge` 的前提；注意：类型是布尔，不是标记 |
| `a3_vow_kept_reed_bridge` | `a3_danger_door_vow` | 立誓（`a3_vow_taken`）且在灰烬防线之战守住苇桥 | 誓光之门的钥（`dr`，C91）；不计入 `danger_doors_opened` |
| `a3_reedpond_resonance` | 无 | 门纹在苇塘芦苇深处共鸣（第三幕） | 芦苇小径 `reedpond_path` 的开关格（[地图简报][mb]） |
| `a3_archive_sealed_room` | 无 | A3-S04 七锁库（`q`） | `lore`、`terms` |
| `a3_hart_buys_nera` | 无 | 第 9 周金冠买下奈拉 | 台账 |
| `a3_holy_war_miracle` | 无 | 战役 4 净化之光（`s25`） | `lore` |
| `a3_massacre_witnessed` | 无 | 第 12 周苇塘村 | 台账 |
| `a3_marcus_shield_dark` | 无 | 第 12 周马库斯的盾熄灭 | 台账 |
| `a3_ash_tells_sundering` | 无 | A3-M08 千门书库（`s25`） | 回声之门（`dr`）、女神（`gd`）、`lore`、`terms`、`sc`、`speakers` |
| `a3_defaced_stele_found` | 无 | 远望凿碑台（`s25`） | 台账 |
| `a3_blank_era_ruin` | 无 | A3-S04 无字碑林 | 台账 |
| `a3_ash_warning_doors` | `seal_looseness_known` | 阿什（守门人）的警告，A3-M09（`s25`） | 女神（`gd`）、`lore`、回廊每扇门旁的"风"与"门后的风"一行（[千门 6.5][td]、[界面][ux]） |
| `a3_seal_aware` | 无 | `a3_ash_warning_doors AND seal_looseness >= 30`（`s25`） | 第三幕拉远；界面只显示阶段名，不显示数值 |
| `a3_selene_tremble_told` | 无 | A3-S19 赛琳的密信（`s25`） | 台账、第六幕 |
| `a3_martha_tale` | 无 | 玛莎讲出晚钟小队 | 台账 |
| `a3_moira_offer` | 无 | A3-S05 奥丽芙转达 | 台账、第四幕 |
| `a3_eluen_speaks` | 无 | 拉远第 6 步（`s25`） | 立国之门（`dr`）、女神（`gd`）、`lore` |
| `a3_sasha_retreat_line` | 无 | 拉远第 8 步（`s25`） | `yeyu_letters` 第 2 封 |
| `a3_luchen_lowered_sword` | `lu_lowered_sword` | 战役 4 陆辰放下剑 | 第五幕勇者线 |
| `a4_nation_founded` | `slg.nation_founded` | 立国（`q` 的 `a4_m01_nation`；strategy） | `s25`、`se`、`sep`、`q` |
| `a4_feast_of_strong` | 无 | 强者之宴（`s25`） | 灵语之门（`dr`）、`lore` |
| `a4_star_records` | 无 | 帝国星象台观测记录（`s25`） | 台账 |
| `a4_aiden_reads_charter` | 无 | 艾登读出两种读法（`s25`） | 台账 |
| `a4_yui_purify_truth` | 无 | 结衣发现净化只是把澱推走 | 台账、第六幕 |
| `a4_sanctuary_found` | 无 | 进入遗民庇护所（`s25`） | 灵语之门（`dr`）、女神（`gd`）、`s25` |
| `a4_elwin_testimony` | 无 | 艾尔温作证（`s25`） | 女神（`gd`）、`lore` |
| `a4_shiya_father_truth` | 无 | A4-D04.d（任务目录（后）） | 台账 |
| `a4_valda_alliance_offer` | 无 | `cut_a4_valda_offer`（`A4-M07` 第二阶段） | `yeyu_letters` 第 3 封 |
| `a4_key_theft_exposed` | 无 | 钥匙失窃（`s25`） | 女神（`gd`）、`lore` |
| `a4_nera_exposed` | 无 | `cut_a4_key_theft` 段二（`A4-D05.b`），奈拉不在场时 `A4-D01.e` | 女神（`gd`）、`lore` |
| `a4_moira_isomorphism` | 无 | 莫伊拉现身（`s25`） | `yeyu_letters` 第 4 封、同构禁令（台账 0.2 第 7 条） |
| `a4_moira_trade_records` | 无 | 交易成立（`s25`） | 女神（`gd`）、`lore`、`terms` |
| `a4_revelation_ash_full` | 无 | 天启「荒原之澱满」（`gd` 的天启） | 台账 |
| `a4_conclave_done` | `slg.conclave_done`、`a4_conclave_scene_done` | 七国会盟（strategy；`s25`） | `q`、`s25`、东线（endings 的战线） |
| `a4_summit_bloodshed` | `slg.summit_bloodshed` | 会盟上动刀（`s25`） | 第五幕 |
| `a4_eluen_page_considered` | `eluen_page_considered` | 写页招安的考虑（`s25`） | 第四幕 |
| `a4_refused_to_let_go` | `a4.refused_to_let_go` | 希尔薇"别再开了"时拒绝闭门 | 渡魂之门（`dr`） |
| `a4_tavi_seated` | 无 | 门歌者塔维入席（任务目录（后）） | 第六幕 |
| `a5_demon_king_born` | 无 | 无貌之王诞生：戴冠（`cut_a5_eska` 段二） | 女神（`gd`）、`lore`、`terms` |
| `a5_eska_descends` | 无 | 原龙银降（`s25`） | `speakers` |
| `a5_truth_purge_cycle` | 无 | 全录之日或其私下版（`cut_a5_confession` 段四） | 女神（`gd`）、`lore`、`terms` |
| `a5_yui_descent` | 无 | `cut_a5_final_war` 神降段（A5-M11 第三回合） | 台账 |
| `a5_faceless_named` | 无 | 门口的女人叫出他的名字（`cut_a5_mirror_c`，救赎分支） | `lore`、`terms` |
| `a5_ash_drawer` | 无 | 守门人的抽屉（`s25`） | `s25`（E17） |
| `a5_breach_refused` | `a5.breach_refused` | 门徒会的递刀被拒（[千门 10.2][td]） | 递刀事件关闭 |
| `a5_eluen_page_torn` | `eluen_page_torn` | 撕页（[千门 11.3][td]） | 第五、六幕；受页之门 |
| `a5_final_battle_done` | 无 | 灰烬决战结束（`s25`） | `yeyu_letters` 第 5 封 |
| `a5_revelation_trial` | 无 | 天启「审期至。六司归庭。」（`gd`） | 登庭之门（`dr`） |
| `a6_court_open` | 无 | 开庭（`sc`） | 女神（`gd`）、`lore`、`terms` |
| `a6_name_spoken` | 无 | 第六司之名第一次被说出（`sc`，D-053） | 名讳之门（`dr`）、`gd`、`lore`、`terms` |
| `a6_janu_intent_revealed` | 无 | 雅努的真实意图（`sc`） | 司掌之门（`dr`）、`gd`、`lore` |
| `a6_charter_read` | 无 | 共读（`sc`） | `gd`、`lore`、终审 |
| `a6_earth_truth` | 无 | 地球的真相（`sc`） | `lore`、`terms` |
| `a6_spring_memory` | 无 | 灵泉中的记忆（`sc`） | `sc`（E19） |
| `a6_letter7_delivered` | 无 | 审定前夜夜羽交出第七封（`cut_a6_letter7`；诸神之战时在崩塌中交出） | `se` |
| `a6_janu_restore_chosen` | `janu_restore_chosen` | 复原之门前的选择（`sc`） | 门之复辟判定 |
| `a6_judgment` | 无 | 冬至审定（quests 的 `ending`；`gd` 的天启） | 结局 |
| `ep_hidden_ending` | `hidden_ending` | 隐藏结局的门（`se`） | 台账 |
| `ep_maker_room_seen` | `maker_room_seen` | 造主的房间（`se`） | 事迹 |
| `ep_earth_message_replied` | `earth_message_replied` | 地球的回信（`se`） | 后日谈 |

### 8.4 幕出口量

| 规范名 | 别名 | 类型 | 范围或取值 | 首次写入 | 读取处 |
| --- | --- | --- | --- | --- | --- |
| `p_earth_opening` | `prologue.earth_opening` | 枚举 | `a`、`b`、`c`、`d` | 序章 N1（`s0`） | `s1`、`se`、隐藏结局的门 |
| `p_earth_relic` | `prologue.earth_relic` | 枚举 | `relic_badge`、`relic_receipt`、`relic_mint`、`relic_key` | 序章 N1（`s0`） | `s0`、伪录之门、梅尔卡供品 |
| `p_appearance` | `prologue.appearance` | 文本 | | 序章镜前（`s0`） | 渲染 |
| `p_past_life_door` | `prologue.past_life_door` | 枚举 | `abacus`、`nightlight`、`whitecoat`、`wrench`、`notes`、`hearth`、`signpost`、`podium` | 序章 N10（`s0`） | 前世之门（`dr`）、`s1` |
| `p_default_past_life` | `prologue.default_past_life` | 枚举 | `abacus`、`nightlight`、`whitecoat`、`wrench`、`hearth` | 序章开场按地球开场（`cut_p_earth`；B 开场店员取 `nightlight`、顾客取 `hearth`） | `s0` |
| `p_door_attempts_refused` | `prologue.door_attempts_refused` | 整数 | 0 到 3 | 序章 N2（`s0`） | 第六幕雅努的回扣 |
| `p_eavesdrop_level` | `prologue.eavesdrop_level` | 整数 | 0 到 3 | 序章 N4（`s0`） | 莫伊拉 P6 首句、夜羽记忆提示（`s0`） |
| `p_answers` | `prologue.answers` | 集合 | 五轮的类别编号 | 序章 N6 到 N10（`s0`） | 第六幕"面试在面试什么" |
| `p_door_hints` | `prologue.door_hints` | 集合 | 六种倾向取最高的两条（[序章 4.8][a0]） | quests 的 `prologue_door_hints` 计算 | 第一幕门缝 |
| `p_earth_anchor_trigger` | `prologue.earth_anchor_trigger` | 枚举 | `player`、`moira`、`relic` | 序章锚点（`s0`） | 终章措辞（`s0`） |
| `p_rejection_response` | `prologue.rejection_response` | 枚举 | `r1` 到 `r5` | 序章 N11（`s0`） | 第三幕艾琉恩与瓦尔妲的题面 |
| `p_last_words` | `prologue.last_words` | 枚举 | `back`、`regret`、`thanks`、`silent` | 序章 N12（`s0`） | 第三幕重逢的回扣（`sc`） |
| `p_merca_valuation` | `prologue.merca_valuation` | 枚举 | `high`、`mid`、`low` | 梅尔卡面试（`s0`） | `s0`、硬币兑换 |
| `p_coin_terms` | `merca_coin.terms` | 枚举 | `interest_free`、`three_percent`、`first_free` | 梅尔卡估价（`s0`） | 神龛兑换比例、奈拉的反应 |
| `p_courtyard_object` | `courtyard.first_object` | 枚举 | 第 7.6 节十种 | 希尔薇轮或开场默认（`s0`） | 第一幕末门内庭院 |
| `p_mode` | `prologue.mode` | 枚举 | `ai`、`rules` | 运行环境 | 调试与平衡 |
| `a1_bs_survival` | `borderstone.survival` | 枚举 | `intact`、`damaged`、`ravaged` | 兽潮结算（[第一幕 8.6][a1]） | 旧哨村难民规模 |
| `a1_bs_population` | `borderstone.population` | 整数 | 600 到 900 | 兽潮结算与离开者 | 边石镇人力 |
| `a1_bs_prosperity` | `borderstone.prosperity` | 整数 | 0 到 100 | 兽潮结算、税率、独眼团与莫斯的结局 | 商会起步资金与物价 |
| `a1_oola_fate` | `a1_ola_fate`、`ola.fate` | 枚举 | `cleared`、`convicted`、`fled`、`executed`（executed 只由第二幕光之审写入，D-055） | 魔女审判（`s1`） | `dr`、`pc`、`q`、`np`、`sep`、第二幕光之审 |
| `a1_moss_fate` | `moss.fate` | 枚举 | `in_power`、`puppet`、`arrested`、`fled_south`、`dead`、`retained`、`dismissed`、`handed_over` | 税与匪 | 第二幕伯爵府、A2-S11 |
| `a1_oneeye_fate` | `oneeye.fate` | 枚举 | `active`、`absorbed`、`destroyed`、`scattered` | 税与匪 | 旧哨村 |
| `a1_viro_status` | `viro.status`、`vero.status` | 枚举 | `in_band`、`fled_wallenburg`（别名值 `fled_to_wallenburg`）、`captured`、`recruited` | 税与匪 | 瓦伦堡灰鼠线 |
| `a1_old_watch` | `old_watch.status` | 枚举 | `bandits`、`cleared`、`camp` | 税与匪 | 第二幕立村起点 |
| `a1_dian_trade` | `dian_crystal.trade` | 枚举 | `stopped`、`continued`、`player_controls` | 税与匪 | 第二幕买家线 |
| `a1_dian_evidence` | `dian_crystal.evidence` | 整数 | 0 到 5 | 税与匪 | 第二幕 |
| `a1_forest_accord` | `forest.accord` | 枚举 | `restored`、`partial`、`broken` | 林地之争 | 希雅、第四幕兽王之争 |
| `a1_shiya_family` | `shiya_family` | 枚举 | `in_town`、`left` | 林地之争 | 同上 |
| `a1_children_safe` | `refugee_children.safe` | 布尔 | | 魔女审判、兽潮 | 门徒会绑架难度 |
| `a1_children_exposed` | `refugee_children.exposed` | 布尔 | | A1-S19 | 同上 |
| `a1_children_location` | `refugee_children.location` | 枚举 | `orphanage`、`mill`、`forest`、`with_oola` | 兽潮结算 | 同上 |
| `a1_toby_state` | `children.toby` | 枚举 | `recovered`、`dead` | 澱病线（第 8 周期限） | 贝莎与孤儿院 |
| `a1_lin_state` | `children.lin` | 枚举 | `healthy`、`recovered`、`dead` | 澱病线 | 同上 |
| `a1_mill_owner` | `mill.owner` | 枚举 | `orphanage`、`vick`、`company` | A1-S11 | 孤儿院存续 |
| `a1_lisa_nick` | `lisa_nick` | 枚举 | `married`、`broken`、`eloped` | A1-S10 | 瓦伦堡客串 |
| `a1_vick_informant` | `vik.informant` | 布尔 | | A1-S10 | 账本证据 |
| `a1_jed_exposed` | `jed.status` | 布尔 | | A1-S12 | 卫队 |
| `a1_town_dian` | `town_dian` | 整数 | 0 到 100 | 镇内澱度（澱病线） | 北区后遗症 |
| `a1_tide_credit` | `rumor.tide_attribution` | 枚举 | `player`、`martha`、`light`、`self_collapse` | 兽潮归功 | 瓦伦堡第一印象 |
| `a1_count_letter` | `count_letter.variant` | 枚举 | `a`、`b`、`c`、`d` | 伯爵来信 | 伯爵府态度 |
| `a1_janu_dream_answer` | `janu.first_dream_answer` | 枚举 | `like`、`unsure`、`dislike` | 兽潮次夜的梦（`s1`） | 第六幕回扣 |
| `a2_wb_ruler` | `wb_ruler` | 枚举 | `edric`、`cecilia`、`lucas`、`regency`、`citizen_council`、`martial_chaos` | 城议（`q` 的 `a2_m05_defense`） | `q`、`territory_autonomy` 起点（市民议会 +10） |
| `a2_wb_damage` | `wb_damage` | 整数 | 0 到 100 | 城下潮 | 第三幕瓦伦堡 |
| `a2_signet_holder` | `signet_holder` | 枚举 | `edric`、`cecilia`、`lucas`、`rudolf`、`charter_sealed`、`lost` | 葬礼与城议 | 第三幕 |
| `a2_poisoner_exposed` | `poisoner_exposed` | 枚举 | `public`、`private`、`buried` | A2-M09 | 第三幕 |
| `a2_blamed_heir` | `blamed_heir` | 枚举 | `none`、`cecilia`、`lucas`、`edric` | A2-M09 | 第三幕来投的继承人 |
| `a2_house_partner` | `house_partner_nera` | 枚举 | `equal`、`weighted` | A2-M03 | 商会分红 |
| `a2_remnant_trust` | `remnant_trust` | 整数 | 0 到 3 | 梅芙、救回的孩子、遗民之屋 | `remnants` |
| `a2_arrest_choice.<人>` | `hero_arrest_choice_<人>` | 族·枚举 | 人：`luchen`、`yui`、`aiden`、`marcus`；值：`refused`、`delayed`、`abstained`、`complied`、`warned` | 第 12 周逮捕令 | 第三幕勇者团 |
| `a2_heroes_saw_power` | `heroes_saw_power` | 枚举 | `hidden`、`partial`、`full` | 显露度 | 第三幕 |
| `a2_aiden_report` | `aiden_report` | 枚举 | `kept`、`reported` | 拉远场景 | 第三幕 |
| `a2_trial_outcome` | `trial_outcome` | 枚举 | `acquitted`、`penance`、`exiled`、`rescued_by_force`、`exiled_branded`、`executed` | A2-M10 光之审 | 第三幕、`a1_oola_fate` 的改写 |
| `a2_church_verdict` | 无 | 枚举 | `clear`、`suspect`、`heresy_suspect`、`wanted` | 第二幕结算（`church_verdict` 快照） | 第三幕 |
| `a2_rescued_children` | `rescued_children` | 整数 | 0 到 9 | 第二幕门徒会线 | `remnants`、第三幕 |
| `a2_emil_fate` | `emil_fate` | 枚举 | `captured`、`dead`、`escaped` | 断门厅 | 第三幕 |
| `a2_rumor_shape` | `rumor_shape` | 枚举 | `blond_knight`、`heroes_porter`、`hidden_master`、`spec_outsider` | 芬恩、显露度 | 第三幕 |
| `a2_valda_seed` | `valda_seed` | 整数 | 0 到 1 | 红沙场 | 第三幕瓦尔妲 |
| `a2_blank_chronicle` | `blank_chronicle` | 枚举 | `burned`、`saved`、`in_garden` | A2-S07 | 第三幕档案馆 |
| `a3_lothar_ending` | `lothar_ending` | 枚举 | `rump_kingdom`、`partitioned`、`imperial_vassal` | 王国分支结局（第 24 周） | 第四幕 |
| `a3_ash_exile` | `ash_exile` | 布尔 | | 战役 4 失败 | 第四幕立国分支 |
| `a3_philip_fate` | `philip_fate` | 枚举 | `crowned`、`puppet`、`captive`、`dead`、`exile_with_player` | 宫廷线 | 第四幕 |
| `a3_drake_fate` | `drake_fate` | 枚举 | `fled_to_empire`、`governor`、`captured`、`dead` | 宫廷线 | 第四幕 |
| `a3_archbishop_fate` | `archbishop_fate` | 枚举 | `captured`、`dead`、`retreated`、`south_regent` | 战役 4 | 第四幕 |
| `a3_wb_status` | `wb_status` | 枚举 | `ally`、`independent_city`、`imperial`、`church`、`ruined` | 王国分支结局 | 第四幕 |
| `a3_crest` | `crest` | 文本 | 玩家设计的纹章 | A3-S01 | 显示 |
| `a3_sasha_result` | `sasha_result` | 枚举 | `defeated`、`draw`、`repelled`、`none` | 战役 2 | `a4_sasha_stance` 起始值 |
| `a3_sasha_interest` | `sasha_interest` | 整数 | 0 到 3 | 战役 2、东北丘陵 | 第四幕"红牙离营" |
| `a3_empire_view` | `empire_view` | 整数 | 0 到 3 | 鹿渡、卡西米尔、第二战线 | `npc.emperor.respect` 起始值 |
| `a3_orianna_respect` | `orianna_respect` | 整数 | 0 到 2 | 鹿渡之战、决斗 | 第四幕 |
| `a3_migrants_status` | `migrants_status` | 枚举 | `integrated`、`allied`、`scattered`、`hostile` | 东部兽人移民 | 第四幕 |
| `a3_north_status` | `north_status` | 枚举 | `loyal_to_philip`、`allied_with_player`、`gunther_warlord`、`fallen` | 北境线 | 第四幕 |
| `a3_church_verdict` | `church_verdict_3` | 枚举 | `lost_lamb`、`heretic`、`demon_precursor` | 第三幕结算（快照） | 第四幕 |
| `a3_selene_stance` | `selene_stance_3` | 枚举 | `hunt`、`enforce`、`waver`、`covert_ally` | 第三幕结算（快照） | 第四幕 |
| `a3_reedpond_outcome` | `reedpond_outcome` | 枚举 | `saved`、`partial`、`massacred` | A3-M07 | `remnants`、第四五幕 |
| `a3_eluen_violation` | `eluen_violation_evidence` | 枚举 | `none`、`witnessed`、`recorded` | 战役 4 | `evidence.E36`、`data/strategy/config.json` |
| `a3_ash_relation` | `ash_relation` | 枚举 | `entrusted`、`warned`、`distant` | 荒原深处 | 第三幕拉远、第五六幕 |
| `a3_blank_era_fragments` | `blank_era_fragments` | 整数 | 0 到 5 | 档案馆与空白纪 | `moira_pages` |
| `a3_moira_trade` | `moira_trade` | 枚举 | `accepted`、`declined`、`deceived` | A3-S05 | 第四幕莫伊拉 |
| `a3_debt_holder` | `debt_holder` | 枚举 | `player`、`hart`、`alliance`、`empire` | A3-S06 | 第四幕经济战 |
| `a3_hedwig_fate` | `hedwig_fate` | 枚举 | `captured`、`dead`、`escaped` | A3-S14、战役 4 | 第四幕钥匙失窃 |
| `a3_cassian_state` | `cassian_state` | 枚举 | `stays_without_grace`、`leaves`、`regains` | A3-S11 | 第四幕 |
| `a3_bonefield_result` | 无 | 枚举 | `won`、`lost` | 骨原夜袭 `bat_a3_bonefield`（[战争目录][war]） | 第三幕出口 |
| `a3_salvage_raid` | 无 | 枚举 | `held`、`evacuated`、`destroyed` | 拾遗营夜袭 `bat_a3_salvage_raid` | 第三幕出口 |
| `a3_deer_ford_result` | `deer_ford_result` | 枚举 | `held`、`duel`、`lost` | 鹿渡之战 `bat_a3_deer_ford` | `a3_empire_view`、`a3_orianna_respect` |
| `a3_second_front` | 无 | 枚举 | `held`、`lost` | 第二战线 `bat_a3_second_front` | `a3_empire_view`、第四幕 |
| `a4_goddess_versions_heard` | 无 | 整数 | 0 到 5 | 女神招揽（`s25`） | 台账 |
| `a4_lies_exposed` | 无 | 派生整数 | 0 到 5（第 2.8 节） | 第四幕结算（`s25`） | `lore` |
| `a4_hart_state` | `hart_state` | 枚举 | `hostile`、`routed`、`reconciled`、`allied` | 经济战 | 第五幕、审期 |
| `a4_econ_vassal` | `econ_vassal` | 布尔 | | 经济战沦为附庸 | 第五幕 |
| `a4_heresy_state` | `heresy_state` | 枚举 | `formed`、`split`、`unformed` | 异端之国 | 第五幕 |
| `a4_selene_stance` | `selene_stance_4` | 枚举 | `loyal`、`witness`、`joined`、`dead` | 异端之国 | 第五六幕 |
| `a4_refuge_state` | `refuge_state` | 枚举 | `public`、`migrated`、`destroyed` | 根下庭 | 第五幕 |
| `a4_elwin_witness` | `elwin_testimony` | 枚举 | `none`、`private`、`public` | 根下庭 | 第五六幕（E03） |
| `a4_beast_king` | `beast_king` | 枚举 | `shaman`、`warchief`、`dual`、`shiya`、`split` | 兽王之争 | 第五幕 |
| `a4_player_door_keys` | `player_door_keys` | 整数 | 0 到 3 | 钥匙失窃 | 第五幕 |
| `a4_remnant_door_keys` | `remnant_door_keys` | 整数 | 0 到 3 | 钥匙失窃 | 第五幕 |
| `a4_merca_door_keys` | `merca_door_keys` | 整数 | 3 到 6 | 钥匙失窃 | 第五六幕 |
| `a4_summit_convener` | `summit_convener` | 枚举 | `cohost`、`guild`、`church` | 会盟召集 | 会盟 |
| `a4_summit_result` | `summit_result`、`slg.summit_result`、`a4_alliance` | 枚举 | `league`、`accord`、`crusade`、`broken` | 七国会盟（`s25`；strategy） | 千径之门（`dr`）、`s25`、第五幕 |
| `a4_allies` | `allies` | 集合 | 势力代号 | 会盟 | 第五幕联盟 |
| `a4_night_pact` | `night_pact` | 布尔 | | 强者之宴与夜后 | 第五幕（D-042） |
| `a4_sasha_stance` | `sasha_stance` | 枚举 | `nemesis`、`duel_pledge`、`mutual_respect` | 第三幕与强者之宴 | 第五幕 |
| `a4_eluen_page` | `eluen_page` | 布尔 | | 写页招安（D-037，`s25`） | 第五六幕、庭之席 |
| `a4_eluen_page_accepted` | `eluen_page_accepted` | 布尔 | | 受页之门的答应（反悔或谈判破裂时写假，[千门 11.1][td]） | 副署谈判 |
| `a4_soul_ferry_held` | `soul_ferry.held` | 文本 | 人物 ID | 泉畔守夜"握住"（第四幕起，[千门 10.1.3][td]） | 第一次渡魂的目标 |
| `a4_boundary_war` | 无 | 枚举 | `won`、`lost` | 界石之战 `bat_a4_boundary_war`（[战争目录][war]） | 第四幕边境与国家事件、`territory_autonomy` |
| `a4_claim` | 无 | 枚举 | `claimed`、`awaiting`、`silent` | 立国（任务目录（后）） | 第四幕 |
| `a4_ration_mode` | 无 | 枚举 | `garden`、`depot` | 立国（同上） | 自治度依赖 |
| `a4_f_king` | 无 | 枚举 | `accepted`、`protested` | "F 级国主"（同上） | 喜剧桥段 |
| `a4_first_quarrel` | 无 | 枚举 | `court`、`personal` | 首场纠纷（同上） | 自治度 |
| `a4_feast_answer` | 无 | 枚举 | `parry`、`dodge`、`trust`、`fearless`、`counter`、`feign` | 一剑问（同上） | `npc.emperor.respect` |
| `a4_register_volunteers` | `register_volunteers` | 整数 | ≥ 0 | 人簿自愿登记（同上） | 立国之门"众愿"（门槛 3,000） |
| `a4_boundstone_groups` | `boundstone_groups` | 整数 | 0 到 10 | 界石到场的出身群体（同上） | 立国之门"界石"（至少 5） |
| `a4_white_writ` | 无 | 枚举 | `repelled`、`stalemate`、`breached` | 战役"白诏南下"（任务目录（后）） | 第五幕 |
| `a4_false_fangs` | 无 | 枚举 | `held`、`lost`、`unmasked` | 战役"獠牙下的边郡"（同上） | 第五幕 |
| `a5_purge_route` | `purge_route` | 枚举 | `people`、`god`、`collapse` | 第五幕抉择（`s25`） | `q`、`s25`、`sc`、`se`、庭之席 |
| `a5_gate_ring` | `gate_ring` | 整数 | 0 到 7 | 众门环（`s25`） | `s25`、`sc`、`se`、真结局 |
| `a5_held_unaided` | `held_unaided` | 整数 | 0 到 5 | 决战结算（quests 的 `act5_outcome`） | `se`、审期残澱之潮 |
| `a5_urgent_orders` | `urgent_orders` | 整数 | ≥ 0 | 急令 | 第六幕 |
| `a5_faceless_end` | `faceless_end` | 枚举 | `redeemed`、`destroyed`、`final_light` | 首领战（`s25`） | `se`、`sep`、E18 |
| `a5_janu_act` | `janu_act` | 枚举 | `receive`、`seal` | 决战结算 | `s25`、`sc`、`se` |
| `a5_purify_success` | 无 | 派生标记 | 第 2.8 节 | 决战结算 | `s25`、台账 |
| `a5_night_queen` | `night_queen` | 枚举 | `allied`、`watching`、`isolated` | 第五幕阵营 | 第六幕 |
| `a5_sasha_fate` | `sasha_fate` | 枚举 | `slayer`、`turned`、`fallen`、`gone` | 第五幕 | 后日谈 |
| `a5_eska_consent` | `eska_consent` | 布尔 | | 银之问（`s25`） | `s25`、`sc`、E30 |
| `a5_blood_for_key` | `a5.blood_for_key` | 枚举 | `blood`、`dian`（玩家选；未写为无） | 灰中对谈的动摇分支或门徒会递刀（[千门 10.2][td]） | 破门之门的择钥（`dr`） |
| `a5_moira_published` | `moira_published` | 布尔 | | 全录之日 | 第六幕 |
| `a5_ring_locks` | `ring_locks` | 整数 | ≥ 0 | 众门环（任务目录（后）） | 战线链 |
| `a5_yui_vessel` | `yui_vessel` | 枚举 | `bound`、`invoked`、`broken` | 神降之器条款（任务目录（后）A5-S05） | 第六幕 |
| `a6_court_seat` | `court_seat` | 枚举 | `seated`、`witness` | 开庭（`sc`） | 庭之席的量处与否决 |
| `a6_review_score` | `review_score` | 小数 | 0 到 1 | 审期结算（quests 的 `review_score`） | 真结局（≥ 0.6，`se`）、E27 |
| `a6_descents` | `descents` | 整数 | 0 到 5 | 下庭 | `a6_review_score` |
| `a6_janu_release` | `janu_release` | 布尔 | | 雅努放手（`sc`） | `sc`、结局 |
| `a6_janu_supports` | `janu_supports` | 整数 | 0 到 5 | quests 的 `janu_release` 计算 | 同上 |
| `a6_player_absorb` | `player_absorb` | 布尔 | | 接受全部权能（`sc`） | 新神结局 |
| `a6_patron` | `patron` | 枚举 | 女神代号 | 争掌时结盟（`sc`） | 某神之治（`se`） |
| `a6_god_war` | `god_war` | 布尔 | | 两位以上争掌且无人否决（court） | 回收（`se`） |
| `a6_god_war_clock` | `god_war_clock` | 整数 | 0 到 3 | 审期回合结算（[千门 12][td]） | `a6_god_war` |
| `a6_god_war_saved` | `god_war_saved` | 整数 | ≥ 0 | 诸神之战段落中送进庭院的有名人物数 | 下一期回声之门 |
| `a6_returned_doors` | `returned_doors` | 枚举 | `all`、`some`、`none` | 离手之门（`se`） | 隐藏结局（`se`） |
| `a6_returned_doors_pre` | `returned_doors_pre` | 枚举 | `all`、`some`、`none` | 审庭里先行闭门（`sc`） | 离手之门 |
| `a6_release_tone` | `release_tone` | 枚举 | `gentle`、`hard` | 冬至审定（自愿离手 ≥ 4 为 gentle） | 后日谈（`se`） |
| `ep_ruler` | `epilogue.ruler` | 枚举 | 女神代号 | 某神之治的结局（`se`） | 后日谈 |
| `ep_player_returned` | `player_returned` | 布尔 | | 离手结局的单程门（D-074，`se`） | `se`、`sep` |
| `ep_yeyu_stayed` | `yeyu_stayed` | 布尔 | | 结局（`se`） | `se`、`sep` |
| `ep_court_keeper` | `court_keeper` | 布尔 | | 离手·未竟的守席选择（`cut_end_release_unfinished`，`se`）：玩家留在神庭做庭之席的守席人 | `sep`（离手·未竟的两版后日谈） |
| `ep_new_god_disposal` | `new_god_disposal` | 枚举 | `exile`、`seal`、`vassal` | 新神结局（`se`） | `sep` |
| `ep_shown` | `epilogue.shown` | 枚举 | `ending` 的值 | scenes 的结局场景 | 完结档 |

### 8.5 族

| 规范名 | 别名 | 类型 | 键与取值 | 首次写入 | 读取处 |
| --- | --- | --- | --- | --- | --- |
| `trust.<人>` | `bond.<人>`、`hero_rel_<人>`（换算）、`trust.ola`、`trust.vespera`、`trust.gunnhild`、`philip_rel`（换算） | 整数 | 人物 ID；0 到 100；起始值取人设 `attitude` | npc 关系结算、任务效果（`q`）、人设初始化 | 门的缘钥（`dr`）、台账、`np`、`s1` |
| `npc.<人>.<属性>` | `<人>.<属性>`（例 `nera.stance`） | 按属性 | 下行逐个属性 | 任务、场景、companion、cognition | 任务与台词 |
| `npc.nera.stance` | `nera.stance` | 枚举 | `partner`、`neutral`、`hostile`、`bought` | A1-S09（`q`）、A2-M03（`q`） | `q`、第二幕商会 |
| `npc.cassian.doubt` | `cassian.doubt` | 整数 | 0 到 3 | 魔女审判平反、兽潮 | 第三幕信仰危机 |
| `npc.bron.story_level` | `bron.story_level`、`brun.story_level` | 整数 | 0 到 3 | A1-S18 | 公会大区与教会注意玩家的时机 |
| `npc.bron.secret_kept` | `bron.secret_kept`、`brun.secret_kept` | 布尔 | | 布伦的旧伤（`s1`） | 第二幕 |
| `npc.martha.assessment` | `martha.assessment`、`marsha.assessment` | 整数 | -5 到 10 | 酒馆的眼睛 | 玛莎能为玩家打开的门 |
| `npc.martha.revealed` | `martha.revealed`、`marsha.revealed` | 布尔 | | 兽潮之夜玛莎出手 | 第二、三幕 |
| `npc.yeyu.memory_shards` | `yeyu.memory_shards` | 整数 | 0 到 7 | 夜羽记忆线 | 信使之门、第六幕 |
| `npc.selene.stance` | `selene_stance` | 枚举 | `hunt`、`enforce`、`waver`、`covert_ally` | 第二幕赛琳线 | 第二、三幕 |
| `npc.selene.evidence` | `selene_evidence` | 整数 | 0 到 5 | 问话、伪录 | 光之审 |
| `npc.faceless.interest` | `faceless_interest` | 整数 | 0 到 3 | 葬礼、断门厅 | 第三到五幕 |
| `npc.hart.relation` | `hart_relation` | 枚举 | `hostile`、`rival`、`partner`、`shareholder` | A2-S03、S04 | 第三幕、`a4_hart_state` |
| `npc.emperor.respect` | `emperor_respect` | 整数 | 0 到 100；起始值 `a3_empire_view` × 20 | 强者之宴（`s25`） | 第五幕帐篷、第六幕 |
| `npc.ferryman.bond` | `ferryman_bond` | 派生整数 | 0 到 3（第 2.8 节） | 派生 | 第二幕 |
| `npc.<人>.awakened` | `ron.commander_awakened` | 标记 | 人物 ID | 启才之门（`dr`） | 将领与官员 |
| `npc.<人>.potential_seen` | `potential.seen` | 标记 | 人物 ID | 识才之门注视 | 培养与任命 |
| `npc.<人>.dead` | `npc.deaths` | 标记 | 人物 ID | 任何死亡结算 | 后日谈、悼念 |
| `npc.<人>.gate` | 无 | 整数 | 0 到 5（已过的关数，[成长 8.2][pp]） | 铭录破关结算 | 同伴等级 |
| `npc.<人>.temper_days` | 无 | 整数 | 0 到 30 | 淬体修炼期日结算 | 淬体关 |
| `npc.<人>.tellings` | 无 | 整数 | ≥ 0 | 讲述数日结算（[成长 12][pp]） | 立名关 |
| `npc.<人>.injury` | 无 | 枚举 | `none`、`minor`、`major`、`limb`、`temper_recoil`、`old_wound` | combat 与 party（[成长 10][pp]） | 同伴随行 |
| `npc.nera.handed_over` | `nera.handed_over` | 标记 | | 交出奈拉（交给哈特或逐出商会） | 双账之门的强制闭门 X10（[千门 9][td]） |
| `npc.cassian.path` | `cassian.path` | 枚举 | `reform`、`chapel`、`zealot` | 个人线 `PL-cassian-4` 的信仰危机抉择（[同伴 9.2][cmp]） | 卡西安入队（`chapel`）、后日谈 |
| `pl.<人>` | 无 | 整数 | 人物 ID；个人线已完成的段号，只升不降 | party 个人线（[同伴 9][cmp]） | 羁绊关、过关事件、个人线回报 |
| `ferried.<人>` | 无 | 标记 | 人物 ID | 渡魂结算（[千门 10.1][td]） | 分幕存亡判定、后日谈 |
| `spring_farewell.<人>` | 无 | 标记 | 人物 ID | 泉畔守夜"放手" | 羁绊之门的门环、告别事迹 |
| `rep.<势力>` | `faction_rep_<势力>`、`faction_rep.<势力>`（`merchant_union` 即 `merchants_union`、`antler` 即 `antlers`、`commoners` 即 `commons`）、`town_trust.<群体>`、`academy_rel`、`antler_rel`、`rats_rel`（换算） | 整数 | -100 到 100；势力：`bs_chapel`、`bs_guild`、`bs_company`、`bs_eastslope`、`bs_loggers`、`bs_watch`、`bs_commons`、`guild`、`merchants_union`、`city_guard`、`church`、`academy`、`greyrats`、`antlers`、`commons`（下城街区另有 `commons.<街区>`）、`heir_edric`、`heir_cecilia`、`heir_lucas`、`redmane`（赤鬃佣兵团）、`crafters`（工匠） | cognition 声望结算 | 价格、委托、招募、审判 |
| `stance.<国>` | `stance_<国>`、`STANCE_*` | 整数 | -100 到 100；国：`grantia`、`holysee`、`lotha`、`mercato`、`silva`、`windfang`、`night`、`guild`、`academy` | strategy 外交结算 | 第四五幕外交、会盟 |
| `fame.<区域>` | 无 | 整数 | 0 到 100；区域代码 | cognition 地区画像 | 立名地区数、鉴定反应 |
| `goddess.<司>.impression` | `goddess.<司>.impression`（序章同名） | 整数 | -3 到 3 | 序章面试（`s0`） | 女神态度起点 |
| `goddess.<司>.interest` | `valda_interest`（第三幕） | 整数 | 0 到 3 | 序章（`s0`）、A1-S09（`q`） | 女神 GM 关注度、莫伊拉巧合数 |
| `goddess.<司>.relation` | `god_rel_<司>`、`god_rel.<司>`、`merca_favor`（换算） | 整数 | -100 到 100 | 任务效果（`q` 的 `gq_merca_caravan`）、goddess | 招揽、交易、终审 |
| `goddess.<司>.memory_tags` | 无 | 集合 | 至多三条 | 序章（`s0`；目标 `all` 写全部五位） | 女神私密题面 |
| `goddess.<司>.gaze` | `eluen_awareness`、`moira_sight` | 整数 | 0 到 100 | goddess 视线结算 | 女神察觉、第四六幕 |
| `goddess.<司>.trade` | 无 | 整数 | ≥ 0 | 与女神交易（`s25` 的莫伊拉） | 交易门槛 |
| `goddess.<司>.power` | 无 | 整数 | ≥ 0 | goddess 神力账（镜像） | 调试、E34 |
| `goddess.<司>.score` | 无 | 整数 | | goddess 日规划（镜像） | 某神之治的判定 |
| `goddess.<司>.invoked` | 无 | 时刻 | tick | 尊名唤醒 | 冷却 |
| `goddess.sylvie.enmity` | `sylvie_enmity` | 标记 | | 渡魂之门开门结算（[千门 10.1][td]） | 女神 GM、归泉之许、第六幕 |
| `hostility.<司>.<幕>.count`、`hostility.<司>.<幕>.power` | 无 | 整数 | 女神代号；幕 `act1` 到 `act6`；本幕敌对动作的次数与神力用量 | goddess 敌对预算账本（[女神目录 3.6][gi]） | 敌对动作的闸门 |
| `collateral.<施动者>.<受害者所属司>` | 无 | 整数 | 女神代号；波及记录的死亡数 | goddess 风险声明结算（[女神目录 3.2][gi]） | 越约判定、E34 |
| `breach_evidence.<违约>` | 无 | 枚举 | 违约编号 `E34-B01` 到 `E34-B07`；`none`、`witnessed`、`recorded`（第三幕曙光圣柱沿用 `a3_eluen_violation`） | 证据系统 | E34、审庭 |
| `echo_documented.<司>` | 无 | 整数 | 女神代号；玩家记录到的澱源回声数 | 证据系统 | E34 的旁证 |
| `revelation_stance.<天启>.<司>` | 无 | 枚举 | 天启 ID、女神代号；解读立场代号（[女神目录 11][gi]） | goddess 天启解读 | 女神私密题面、内置女神大脑 |
| `inquisitor_seen.<地区>` | 无 | 时刻 | 地区代码；tick | cognition（审判官在当地出现） | 逮捕令的预兆 |
| `trial_done.<试炼>` | 无 | 标记 | 试炼 ID（`trl_`） | 女神试炼首胜 | 首胜奖励、试炼赏门 |
| `offering_novelty.<物品>` | 无 | 整数 | 物品 ID；新奇衰减计数 | goddess 供品结算（[女神目录 9][gi]） | 供分 |
| `offering_idea.<键>` | 无 | 标记 | 口述过的异界点子 | goddess 供品结算 | 供分、梅尔卡的反应 |
| `seek_relic.<遗物>` | 无 | 整数 | 遗物 ID；0 到 3（寻物阶段） | goddess 锚失结算（[女神目录 13][gi]） | 寻物事件 |
| `oracle.<司>.<键>` | 无 | 标记 | 神谕标记 | goddess 神谕 | 任务触发（`q`） |
| `lie_exposed.<司>` | `god_exposed_<司>` | 标记 | `eluen`、`valda`、`merca`、`sylvie`、`moira` | 证据对质（`s25`） | 女神（`gd`）、`a4_lies_exposed` |
| `verdict.<司>` | `verdict_<司>` | 枚举 | 五位在任女神；`voluntary`、`judged`、`refuse`、`contend` | 终审（scenes 的 court） | `sc`、`se`、`sep` |
| `faith.<司>` | `faith_<司>` | 整数 | 0 到 100 | strategy 信仰份额 | 第五六幕 |
| `trial_wins.<司>` | 无 | 整数 | `eluen`、`valda`、`merca`、`sylvie`、`moira`、`dream` | 女神试炼 | 试炼赏门 |
| `breach.<司>.<幕>` | 无 | 标记 | 幕：`act1` 到 `act6` | goddess 越约（D-026） | 蚀痕证据、第六幕 |
| `court.<司>.<防线>` | 无 | 枚举 | 防线 `fact`、`just`、`need`；值 `intact`、`broken` | 质证（scenes 的 court） | 终审 |
| `court.collapsed` | 无 | 整数 | 0 到 15 | 终审（court） | 结局 |
| `court.janu.e32`、`court.merca.outlet`、`court.valda.duel`、`court.tavi_called`、`court.player_lets_go` | 无 | 标记 | | 审庭场景（`sc`） | 终审 |
| `review.<危机>` | 无 | 枚举 | 第 2.4 节五场；`self`、`barely`、`descend`、`fail` | 审期结算（quests 的 `review_score`） | `sc`、`a6_review_score` |
| `review.<危机>.descend` | 无 | 标记 | | 下庭（`sc`） | 审期结算 |
| `witness_called.<人>` | 无 | 标记 | 人物 ID | 证人传唤（任务目录（后）） | 质证 |
| `evidence_combo.<组>` | 无 | 标记 | 证据编号组 | 证据组合呈示（同上） | 防线击破 |
| `evidence.<编号>` | 第 7.5 节 | 标记 | `E01` 到 `E36` | 取得物证或证词 | 审庭、台账第 7 节 |
| `evidence.<编号>.shown` | 无 | 标记 | | 审庭呈示（court） | 防线 |
| `front.<线>` | `front_<线>` | 枚举 | `north`、`east`、`south`、`ring`、`rear`；`held`、`stalemate`、`lost`、`collapsed` | 决战结算（quests 的 `act5_outcome`） | 真结局、E28 |
| `front_mod.<线>.<项>` | 无 | 小数 | 战线修正（任务目录（后）第 8.2 节） | 战线链任务 | 战线结算 |
| `ring_node.<节点>` | 无 | 枚举 | `R01` 到 `R07`；`unsurveyed`、`surveyed`、`building`、`built`、`held`、`fallen` | 众门环节点任务 | `a5_gate_ring`（决战结束时为 `held` 的节点数） |
| `ring_node.<节点>.integrity` | 无 | 整数 | `R01` 到 `R07`；0 到 100 | 众门环守备 `bat_a5_ring_node`（[战争目录][war]） | 战线结算 |
| `ring_node.<节点>.built` | 无 | 派生标记 | `ring_node.<节点>` 为 `built` 或 `held` | 派生 | 国家事件 `nev_crisis_ring_works` |
| `nev.<事件>` | 无 | 枚举 | 国家事件 ID 去掉 `nev_` 前缀；值为玩家或 AI 所选的选项代号 | strategy 国家事件结算（[战争目录 9][war]） | 后续事件、外交、任务 |
| `act.<幕号>.entered` | 无 | 派生标记 | `1` 到 `6`；等价于 `act >= 幕号`，每幕开头写入 | 幕切换 | 地图刷新组与出口的 `requiresFlags`（只接受旗标的场合，[地图简报][mb]） |
| `hero_state.<人>` | `hero_state_<人>`、`hero_state_lu` | 枚举 | `luchen`：`loyal`、`wavering`、`final_light`、`shed`、`dead`；`yui`：`loyal`、`wavering`、`defected`、`bannerless`、`saint_witness`、`dead`、`vessel`；`aiden`：`rear`、`with_player`、`tempted`、`scholar`、`traitor`、`vanished`；`marcus`：`defected`、`wavering`、`dead`、`rear`、`south` | 第三幕勇者团线 | 第四到六幕 |
| `key_fate.<钥>` | 无 | 枚举 | `k3`、`k5`、`k6`；`merca`、`player`、`remnants`、`sylvie`、`lost` | 钥匙失窃 | 第五六幕 |
| `door.<门>` | 第 7.7 节 | 标记 | 门 ID；为真表示已开且未闭 | doors 开门（闭门时置假） | 门钥（`dr`）、`pc` |
| `door.<门>.tier` | 无 | 整数 | 1 到 2 | 两阶门进阶（[千门 3.5][td]） | 门效果 |
| `door_state.<门>` | 无 | 枚举 | `hidden`、`hinted`、`openable`、`opened`、`locked`、`closed` | doors | 回廊界面、提示导演 |
| `door_hint.<门>` | 无 | 标记 | 门 ID | 雅努的提示（goddess） | 门显影 |
| `p_hint.<倾向>` | `prologue.hint.<倾向>` | 整数 | `blade`、`beast`、`breath`、`pact`、`shadow`、`spirit` | 序章回答（`s0`） | `p_door_hints` |
| `p_free.<话题>` | `prologue.free.<话题>` | 文本 | `eluen`、`valda`、`merca`、`sylvie`、`moira`、`past_life`、`rejection`、`call`、`appraise` | 序章自由回答（`s0` 的 `storeAs`；`call` 由 `cut_p_call`、`appraise` 由 `cut_p_judgement` 写入） | 女神题面、第六幕 |

### 8.6 系统镜像

| 规范名 | 别名 | 类型 | 键与取值 | 写入者 | 读取处 |
| --- | --- | --- | --- | --- | --- |
| `quest.<任务>` | `quest.<现有 ID>`（第 6.2 节） | 枚举 | `inactive`、`active`、`ready`、`done`、`failed`、`expired`、`by_other`（由他人先完成） | quests | 任务触发（`q`）、`pc` |
| `quest.<任务>.choice` | 无 | 枚举 | 抉择选项 ID | quests | 后续阶段 |
| `scene.<场景>.seen` | 无 | 标记 | 场景 ID | scenes | 重播、事迹 |
| `feature.<功能>` | 无 | 标记 | `door_corridor`、`servant`、`tide_sight`、`appraise_talent`、`inner_court`、`company`、`village`、`city`、`rts`、`slg`、`restraint`、`false_record`、`board`（公会登记后委托板可用）、`sight`（神之视线显性化，第二幕）、`beyond_door`、`messenger`、`awaken_talent`、`travel_gate`、`travel_gate_advanced`、`echoes`、`clear_flow`、`resonance`、`dominion`、`soul_ferry`、`thousand_paths`、`breach`、`ascent`、`true_name`、`last_door`（[千门 8][td]）、`continent_map`（大陆地图界面，`cut_a3_map` 段二） | doors、quests 与过场的 `feature` 效果 | 界面、`data/city/*.json`、`data/world/atlas_routes.json`、千军之门（`dr`） |
| `companion.<人>.recruited` | 无 | 标记 | 人物 ID | party 与 quests 的 `companion` 效果 | `dr`、导演菜单（`gd`）、`s1`、`s25`、`sc`、`se`、`sep`、战场（`data/warfare/scenarios.json`）、魔物（`data/combat/monsters.json`） |
| `companion.<人>.state` | 无 | 枚举 | `active`、`resting`、`injured`、`left`、`dead` | party | 随行、战线 |
| `companion.<人>.injured_until` | 无 | 整数 | 游戏日 | party | 归队 |
| `boss.<首领>.defeated` | 无 | 标记 | 首领 ID | combat 奖励结算 | `q` 的 `orWhen`、`dr`、`pc`、地图出口（`data/combat/maps/*.json`、`atlas_routes.json`） |
| `boss.<首领>.yielded` | 无 | 标记 | 首领 ID | combat 败退 | `q` 的 `orWhen` |
| `combat.wave.<波次>.state` | 无 | 枚举 | `active`、`cleared` | combat 波次 | `q` 的 `orWhen` |
| `war.<剧本>.result` | 无 | 枚举 | `won`、`lost`、`draw` | warfare | 任务 |
| `war.first_battle_won` | 无 | 标记 | | warfare：骨原夜袭（`bat_a3_bonefield`）里罗恩举旗守住阵线的那一刻，战败也成立 | 千军之门（`dr`） |
| `war.generals` | `generals` | 集合 | 人物 ID | warfare | 第三幕出口、战线 |
| `dg.<迷宫>.<字段>` | `dg_state.<迷宫>.<字段>`；不带字段的 `dg_state.<迷宫或巢>` 即 `.choice` | 按字段 | 迷宫或澱巢 ID；字段 `choice`（养毁净的抉择：`nurture`、`destroy`、`purify`）、`cleared`（标记）、`depth`（整数）、`pressure`（整数）、`active`（布尔）、`phase`（枚举 `lair`、`shallow`、`dungeon`、`great`、`overflow`、`purified`） | 迷宫系统 | 门钥、首通经验、城建 |
| `city.court_study` | 无 | 标记 | | city 建成（`src/systems/city/construction.ts`） | 配方（`data/economy/recipes.json`） |
| `city.officials` | `officials` | 集合 | 人物 ID | city 任命 | 第三幕出口 |
| `econ.company_founded` | 无 | 标记 | | economy 商会成立 | `data/city/buildings.json`、配方、`q`、`s25`、审期 |
| `econ.house_scale` | `house_scale` | 整数 | 0 到 5 | economy | 第二幕出口、第三幕 |
| `nation.power` | `nat_power` | 整数 | 0 到 100 | strategy | 第五幕 |
| `nation.polity` | `nat_polity` | 枚举 | 第 7.6 节 | 立国 | 自治度成长、待令 |
| `nation.legit` | `nat_legit` | 整数 | 0 到 7 | strategy 外交 | 会盟 |
| `director.tension` | 无 | 整数 | 0 到 100 | director | 导演菜单 |
| `director.<菜单项>` | 无 | 标记 | `enemy_slip`、`lost_item`、`old_friend`、`passing_merchant`、`rumor_hint` | 导演菜单项（`gd` 的 `director_menu.json`） | 冷却与日志 |
| `ai.focus.<人>` | `npc.focus.<人>` | 整数 | 人物 ID | npc 分级推理 | 调试 |
| `sediment.<地图>` | 无 | 小数 | 地图 ID；澱值 | goddess 澱结算 | 魔物生成、城建 |
| `omen.<地图>` | 无 | 时刻 | tick | goddess 预兆 | 事件前兆 |
| `intel.merca.<情报>` | 无 | 标记 | 情报 ID（`gd` 的 `merca_intel.json`） | goddess 梅尔卡情报交易 | 女神 |
| `revelation.<天启>` | 无 | 标记 | 天启 ID（`gd` 的 `revelations.json`） | goddess 天启 | 任务（`q`） |
| `request.<司>.<请托>` | 无 | 文本 | 请托文本（经净化）；非空即"已发布" | goddess 神权动作 `request` | 女神请托任务的触发（`q`） |
| `has.<物品>` | `item.<物品>`；`evidence.report_978` 与 `a1_report_978_obtained` 即 `has.lb_report_978_copy` | 整数 | 物品 ID；持有件数（随身、庭院仓库、商会仓） | inventory（派生） | 门的物钥、任务 |
| `read.<物品>` | 无 | 标记 | 书与史料的物品 ID | inventory 阅读 | 识钥（[遗物][relics]）、探索经验 |
| `col.<收藏>.done` | 无 | 标记 | 收藏 ID | 收藏完成 | 门钥（OR 条件）、事迹 |
| `visited.<地图>` | 无 | 标记 | 地图 ID | world 到访（doors 记录） | 地钥、探索经验 |
| `visited.<地图>.<地点>` | 无 | 标记 | 地点 ID | 同上 | 同上 |
| `anchor_lost.<遗物>` | 无 | 小数 | 遗物 ID；锚失累计天数（在夜幕下每日 +0.5，[遗物目录][relics]、[女神目录 13][gi]） | goddess 每日结算 | 寻物事件 |
| `deed.<事迹>` | 无 | 标记 | 事迹 ID | 事迹系统 | 历钥（[千门 5.3][td]） |
| `title.<称号>` | 无 | 标记 | 称号 ID | 事迹系统 | 称呼、认知 |
| `term.<称谓>` | `a1_dian_term_heard`（即 `term.dian_known`） | 标记 | 称谓 ID（台账第 6 节） | 任务效果（`q` 写 `term.dian_known`：第一幕玩家第一次从夜羽口中听到"澱"） | 界面切换正式名（D-030、[界面][ux]的文本键条件） |

### 8.7 任务目录（序章到第三幕）登记的变量

由 [任务目录（前）][qa13]第 1.4、5.3、6、7.3 节的条目写入；含义、写入点与取值的详细说明以该目录为准。列同第 8.4 节；写法与本表不同的列为别名。

| 规范名 | 别名 | 类型 | 范围或取值 | 首次写入 | 读取处 |
| --- | --- | --- | --- | --- | --- |
| `p_heard_next_door` | `prologue.heard_next_door` | 布尔 | | 序章 N3 选项 1（`P-S02`） | 第二幕初见勇者团时的一句独白 |
| `quest.<任务>.stage` | `quest_stage.<任务>` | 枚举 | 当前阶段代号 | quests | 台词 `when` 条件（`progress` 槽的版本） |
| `quest.<任务>.path` | `quest_path.<任务>` | 枚举 | 完成时走过的解法代号 | quests | 日志"还有别的做法"、传闻版本 |
| `cmm_count.<模板>` | 无 | 整数 | 委托模板 ID；本周完成次数 | quests 委托板 | 委托经验递减 |
| `trade_count.<人>` | 无 | 整数 | 人物 ID；与此人的合作交易次数 | economy、quests | 纷争节点、前世之门加成 |
| `route_state.<路>` | 无 | 整数 | 路线 ID；风险档 -3 到 3（委托与事件按周增减） | quests、world | 途中事件、委托报酬 |
| `badges_returned` | 无 | 整数 | ≥ 0 | 跨幕支线"带他们回家"（第一幕起） | 后续段、事迹 |
| `donkey_road` | 无 | 整数 | 0 到 3 | 跨幕支线"驴之路" | 后续段 |
| `letters_delivered` | 无 | 整数 | ≥ 0 | 跨幕支线"送信人"（第三幕起） | 十二封与二十四封的结算、事迹 |
| `letters_found` | 无 | 整数 | ≥ 0 | 万户街每层的灰夜家书 | "送信人"、事迹"十二封信" |
| `ash_pages_returned` | 无 | 整数 | ≥ 0 | 交还阿什的灰页（第三幕起） | `trial_ash_vigil` 的条件、第四幕 |
| `doorplates_returned` | 无 | 整数 | 0 到 12 | 外环门牌归位 | 收藏 `col_thousand_archive` |
| `a1_tide_prep.<项>` | 无 | 布尔 | `east_fence`、`nera_stock`、`eastslope_in`、`children_safe`、`oola_placed`、`barto_seg` | A1-M11 的六个小目标 | `a1_defense` |
| `a1_defense` | 无 | 整数 | 0 到 120 | A1-M11 结算（第一幕 8.6 的防御值） | 兽潮结算 |
| `a1_lamp_exposed` | `a1_trial_debunk` | 布尔 | | A1-M09 当场拆穿光之鉴（`cut_a1_trial`） | 教会怀疑、台账 |
| `a1_summons_answer` | 无 | 枚举 | `appeared`、`refused`、`investigated` | A1-M08 | 魔女审判 |
| `a1_moss_evidence` | 无 | 整数 | 0 到 7 | 税与匪的证据件数 | `a1_moss_fate`、A1-D01 结局 |
| `a1_tax_rate` | 无 | 枚举 | `tenth`、`sixth` | 税与匪 | 镇民信任、第二幕 |
| `a1_permit_revoked` | 无 | 标记 | | 越界伐木许可被收回（林地之争） | `a1_forest_accord` |
| `a1_gorn_decision` | `gorn.decision` | 枚举 | `stay`、`leave` | 林地之争 | 东坡猎户、第四幕 |
| `a1_ako_framed` | `ako.framed` | 布尔 | | 集市失窃案 | 镇民信任 |
| `a1_jed_debt_known` | `jed.debt_known` | 标记 | | 骰子屋（A1-S12） | 反咬节点 |
| `a1_boro_calmed` | `boro.calmed` | 标记 | | 扳手腕（A1-S06） | 林地之争的冲突升级概率 |
| `a1_dris_face` | `dris.face` | 枚举 | `won`、`yielded`、`refused` | C 级的面子 | 兽潮中德里斯的表现 |
| `a1_barto_family_safe` | `barto.family_safe` | 标记 | | 巴托的家人 | `a1_tide_prep.barto_seg` |
| `a1_three_toes_fate` | `three_toes.fate` | 枚举 | `purified`、`slain` | 三趾（第一幕到第二幕） | 兽伴、希雅 |
| `a1_wolf_den` | `forest.wolf_den` | 枚举 | `cleared` | 狼穴清剿（林地之争节点 f） | 林地之争结局 |
| `a1_tide_omen` | 无 | 标记 | | 兽潮前兆事件 `ev_a1_tide_omens` | A1-M11 前置、`cut_a1_yeyu_memory` |
| `a1_spring_source_found` | `a1_seep_channel_found` | 标记 | | A1-M07 找到渗泉源头 | 魔女审判的物证 |
| `a1_moss_intercepted` | 无 | 标记 | | 南门截下莫斯的澱晶车 | `a1_moss_fate` 不写 `fled_south` |
| `a1_blade_mark_seen` | 无 | 标记 | | 匪徒刀上的暗记 | A1-S02 |
| `a1_lair_located` | 无 | 标记 | | 护送伏击中活捉匪徒 | 旧哨村据点 |
| `a1_viro_pact_known` | 无 | 标记 | | 薇罗与莫斯的密约线索 | 税与匪的反咬 |
| `a1_forest_pact_proof` | 无 | 标记 | | 约树刻痕与林约抄本 | 林地之争 |
| `a1_bell_tab_seen` | 无 | 标记 | | 醉月亭地窖"净"的结局 | 副谜团 S02 |
| `a1_graveyard_purified` | 无 | 标记 | | 墓地的光 | 兽潮第二拍、委托出现条件 |
| `a1_greyroad_page` | 无 | 标记 | | 截下灰晶走私队 | 第二幕收货仓旁证 |
| `a2_heir_pledge` | 无 | 枚举 | `edric`、`cecilia`、`lucas`、`balanced`、`none` | A2-M05 三家的请柬 | 继承之争 |
| `a2_heir_favors` | 无 | 整数 | ≥ 0 | 同上（示好次数） | 三家声望上限 |
| `a2_access_eagle_hill`、`a2_access_eagle_hill_inner` | `access.eagle_hill`、`access.eagle_hill_inner` | 标记 | | A2-M01、A2-M05 | 鹰丘与内院通行 |
| `a2_remnant_shelter` | `remnant_shelter` | 枚举 | `open`、`secret`、`refused` | A2-M03 旧哨村 | 门徒会与审判庭的注意、遗民 |
| `a2_heroes_reveal` | `heroes_reveal` | 整数 | 0 到 100（隐藏） | 勇者团初见与同行 | `heroes_saw_power` 的结算 |
| `a2_told_heroes_earth` | 无 | 标记 | | 承认"也是穿越来的" | 勇者线 |
| `a2_yui_saw_light` | `a2_yui_saw_light_bend` | 标记 | | 光之奇迹祭玩家在结衣 3 格内（`cut_a2_heroes`：玩家站着不动时） | 结衣动摇、`goddess.eluen.gaze` |
| `a2_mirror_fooled` | `a2_w6_false_record_unseen` | 标记 | | A2-M06 问话时伪录骗过照规镜（光之审提前到第 9 周） | 光之审 |
| `a2_heroes_saw_cages` | 无 | 标记 | | 勇者团同去门徒会据点 | 结衣动摇、A2-S13 |
| `a2_clue_symptom`、`a2_clue_dregs`、`a2_clue_ledger`、`a2_clue_apothecary` | 无 | 标记 | | 伯爵之死的四条线索 | 点名埃米尔（三取三） |
| `a2_ritual_early` | 无 | 标记 | | 公开揭发埃米尔 | 城下潮提前一天 |
| `a2_signet_now` | `signet_now` | 文本 | 人物 ID 或 `player` | 葬礼上印戒的下落 | 继承之争结局 |
| `a2_player_arrested` | 无 | 标记 | | 逮捕令下投降 | 城下潮从静室开局 |
| `a2_tide_exits_held` | 无 | 整数 | 0 到 5 | 城下潮守住的出口数 | 城下潮结局 |
| `a2_charter_found` | `a2_charter_draft_found` | 标记 | | A2-D01.f 书房里的市民自治特许状草稿 | 城议结局 |
| `a2_oracle_edit_proof` | `a2_bishop_oracle_leverage` | 标记 | | 主教删改神谕的把柄 | 光之审、`compute wb_council` 第 5 条 |
| `a2_forgery_source` | `a2_forgery_source_found` | 标记 | | A2-D02.d 伪证的来源（A2-S08 的卷宗或向灰鼠买消息） | 光之审 |
| `a2_grain_route` | `grain_route` | 枚举 | `hart`、`house`、`guild` | 粮道之争 | 粮价、营地 |
| `a2_camp_riot` | `camp_riot` | 枚举 | `none`、`casualties`（不介入时第 12 周暴动有伤亡） | 粮道之争 | 第三幕难民、链结算经验 |
| `a2_haber_exposed` | 无 | 标记 | | 揭发哈伯 | 莫斯线 |
| `a2_sick_water_source` | 无 | 标记 | | 病水的源头 | 鹿角会 |
| `a2_reynard_letter` | 无 | 标记 | | 金狮的面子（友善结局） | 雷纳德 |
| `a2_ferryman_talks` | `ferryman_talks` | 整数 | ≥ 0（交谈次数） | 老船夫的酒 | 夜渡 |
| `a2_ferryman_secret_kept` | `ferryman_secret_kept` | 标记 | | 从未说出老船夫的身份 | 夜渡 A2-S27 |
| `a3_title_confirmed` | 无 | 标记 | | 宫廷（爵位确认） | 第三幕出口 |
| `court_chip.<种>` | 无 | 整数 | `favor`、`leverage`、`credit`、`merit`；各 0 到 5 | 宫廷各节点 | 回援王都、宫廷结局 |
| `a3_council_stance` | 无 | 枚举 | `oppose`、`fight_first`、`silent` | 宫廷 | 宫廷结局 |
| `a3_drake_exposed` | 无 | 标记 | | 宰相的密约被揭 | `a3_drake_fate` |
| `a3_konrad_defied` | `konrad.defied` | 标记 | | 宫廷 | 第三幕 |
| `a3_brigitte_impression` | `brigitte.first_impression` | 枚举 | `cold`、`respect`、`trust` | 北境军团长初见 | 霜骨墓窟通行、`a3_north_status` |
| `a3_hiska_letters` | 无 | 枚举 | `read`、`released`、`kept` | 宫廷 | 第四幕 |
| `a3_massacre_evidence` | 无 | 整数 | 0 到 3 | 苇塘村 | 第四、六幕 |
| `a3_door_restraint_vow` | 无 | 标记 | | 克制之誓 | 门的克制 |
| `a3_crown_seal_holder` | `crown_seal_holder` | 文本 | 人物 ID | 朝阳门之夜（冠石印 `rl_crownstone_seal`） | 王国结局 |
| `a3_archive_saved` | 无 | 标记 | | 七锁库 | 第四幕史料 |
| `a3_ashline_route` | 无 | 枚举 | `rout`、`persuade`、`bloodless`、`failed`（值别名见第 7.6 节） | A3-M11 灰烬防线（战场剧本 `act3_ash_line`） | 战役结算、`cut_a3_ashen_line`、`cut_a3_eluen_speaks` |
| `a3_deer_ford_won` | 无 | 派生标记 | `a3_deer_ford_result IN (held, duel)` | 派生 | 任务条件 |
| `a3_luchen_spared` | 无 | 标记 | | 战役 4 | 勇者线 |
| `a3_aiden_escorted` | 无 | 标记 | | 战役中护送艾登 | 勇者线 |
| `a3_delay_days` | 无 | 整数 | ≥ 0 | 圣战军在瓦伦堡一带被拖延的天数 | 灰烬防线 |
| `a3_jorg_home_visit` | `jorg.home_visit`、`a3_jorg_spared` | 布尔 | | 约尔格回乡 | 第四幕 |
| `a3_seat` | `territory_seat` | 文本 | 领主府所在聚落 ID（`borderstone`、`old_outpost`） | A3-M01 领主府选址（`cut_a3_domain`） | 第四幕国都 |
| `a3_philip_courage` | `philip.courage` | 整数 | 0 到 3 | 三次剑课 | `a3_philip_fate` |
| `a3_physician_testimony` | `a3_sigrid_witness` | 标记 | | A3-S03 御医的证词 | 宫廷、`cut_a3_crown_falls` |
| `a3_sunrise_delay` | 无 | 标记 | | 为老王延命的路线 | 朝阳门之夜的时间 |
| `a3_scavenge_rights` | `scavenge_rights` | 枚举 | `player`、`shared`、`hart` | 骨原拾遗权之争 | 第三幕经济 |
| `a3_kaya_fate` | `kaya.fate` | 枚举 | `follows`（追随玩家，将领候选）、`dead`、`imperial` | 卡娅的打算 | 移民、泰姆 |
| `a3_regis_redeemed` | `regis.redeemed` | 标记 | | 石栏村 | 霜骨墓窟旧地道 |
| `a3_holger_father_found` | `holger.father_found` | 标记 | | 荒原中层寻骨 | 荒原向导 |
| `a3_aiden_pillar_hint` | 无 | 标记 | | 艾登的交换 | 第五幕圣柱 |
| `a3_bridgehead` | 无 | 枚举 | `stone`、`mixed`、`timber` | 博德里克的城墙 | 灰烬防线工事 |
| `a3_territory_mining` | `territory_mining` | 整数 | 0 到 3（领地矿务的规模档） | city 领地矿务 | 锈岭矿深层的进入条件（不低于 2） |
| `a3_barga_blackiron` | `barga.blackiron` | 整数 | 0 到 3（黑铁成长线） | 锈岭矿深层 | 巴尔加 |
| `a3_frostbeard_alive` | `frostbeard.alive` | 布尔 | | 霜胡子 | `ev_a3_winter_tide` 的预兆 |
| `a3_doorway_dream` | 无 | 标记 | | 门口的另一个人（第三幕段） | 跨幕后续 |
| `a3_wenzel_copy` | 无 | 标记 | | 文策尔的密约抄本 | 宫廷、巧合事件 |
| `a3_capital_reinforced` | 无 | 标记 | | 回援王都 | 北境空虚 |
| `a3_saints_camp_scouted` | 无 | 标记 | | 侦察圣徒营 | 灰烬防线第一阶段 |
| `a3_ron_confessed` | `ron.confessed` | 标记 | | A3-S45 罗恩的夜谈（坦白当年逃跑的事） | 个人线、`cut_a3_ashen_line` 战前夜 |
| `a3_oola_leaf_road_told` | `oola.leaf_road_told` | 标记 | | 欧拉的托梦 | 落叶路之门 |

- 第一幕的 `a1_moss_fate` 另有取值 `retained`、`dismissed`、`handed_over`（任务目录（前）第 13 节）。
- 任务目录（前）里出现的 `martha.*`、`bron.*`、`hart_relation` 等写法按第 7.1、7.4 节换成规范名；`hero_rel.<人>` 与 `hero_rel_<人>` 同为 `trust.<人>` 的换算别名。
- 报告抄本的持有以 `has.lb_report_978_copy` 为规范名；`a1_report_978_obtained` 与 `evidence.report_978` 是别名。

### 8.8 过场目录登记的变量

由[过场目录][cut]各幕的新旗标表（第 4.3、5.3、6.3、7.3、8.3、9.3、10.3、11.11、12.2.2 节）与请求回写写入；含义、写入点与取值的详细说明以该目录的条目为准。
列说明：**种**取第 2.2 节的写法（标记、出口、全局、族、镜像、派生、信号），另加"段落"；**写入者**写过场编号、请求方任务的显示编号或系统；**读取处**写读取它的过场、系统与题面。

- **段落旗标**（Beat Flag，`<名>_beat`）：同一场过场的多入口。请求方（任务、战场剧本或女神 GM）写入起点值后请求过场，过场在每段结束时写 `<段>_done` 或 `done`。它是可回写的幕前缀枚举，只在请求方与本场之间使用，不作幕出口读取。
- **只读旗标**：过场只读、由任务、战斗、迷宫、女神或内核写入的变量，按写入者核对后登记在同一张表里，写入者一列写明主人；任务目录（前）没有点名的，按语义指派给对应的任务条目或系统。
- **别名**：与本表已有规范名同义的过场写法见第 7.8 节，不另立变量；已登记变量被过场读写的情况见第 8.8.9 节。计算函数见第 2.9 节。

#### 8.8.1 序章

来源：过场目录第 4.3 节。

| 规范名 | 别名 | 种 | 类型 | 取值与默认 | 写入者 | 读取处 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `p_unsent_words` | `prologue.unsent_words` | 出口 | 文本 | 至多 40 字（B 开场至多 12 字）；空值 A"（没有回）"、B"（还没想好）"、C"（还没想好）"、D"（没有说出口）" | `cut_p_earth` | `cut_p_earth`；终章回到地球的四个开场（`cut_end_release`）、第六幕地球真相（`cut_a6_earth_truth`）的回扣 | 地球最后一刻没说出口的那句话：A 回家吃饭的回复，B 猫的名字，C 结果出来时的第一句，D 对老房间说的话 |
| `p_store_role` | `prologue.store_role` | 出口 | 枚举 | `clerk`、`customer`；默认未写入 | `cut_p_earth` | `p_default_past_life`（店员取 `nightlight`，顾客取 `hearth`）、终章回到地球 B（`cut_end_release`） | B 开场站在收银台的哪一边 |
| `p_waiting_for` | `prologue.waiting_for` | 出口 | 文本 | 至多 12 字；空值"某个人" | `cut_p_earth` | 终章回到地球 C（`cut_end_release`） | C 开场在等谁的结果 |
| `p_call_free_count` | `prologue.call_free_count` | 出口 | 整数 | 0 到 3；默认 0 | `cut_p_call` | `cut_p_call`（有模型时自由提问的次数上限） | 叫号时有模型的自由提问次数 |
| `p_round_end.<神>` | `prologue.round_end.<神>` | 族 | 枚举 | 键：`eluen`、`valda`、`merca`、`sylvie`、`moira`；值 `closed`、`soft`、`hard`；默认未写入 | `cut_p_interview` | `cut_p_interview`（`hard` 时由莫伊拉敲桌收尾）、各女神题面（`ai_prompt`） | 有模型时该轮面试的结束方式 |
| `p_cycle_name_reaction` | `prologue.cycle_name_reaction` | 出口 | 枚举 | `falter`、`drop`；默认未写入；只在 `cycle >= 2` 写入 | `cut_p_call`、`cut_p_interview` | `cut_p_judgement`、`cut_p_discard`；第六幕证据 E16 的下一期加注（对艾琉恩的事实防线强度 1）、`cut_p_interview` | 下一期在候见厅说出被禁之名时艾琉恩的反应：面试前说出为 `falter`（手在发抖），面试中说出为 `drop`（当场丢弃） |

#### 8.8.2 第一幕

来源：过场目录第 5.3 节。

| 规范名 | 别名 | 种 | 类型 | 取值与默认 | 写入者 | 读取处 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `a1_first_door_seen` | 无 | 标记 | 标记 | 默认假 | `cut_a1_wake` | `cut_a1_wake` | 初门·醒的开门段已播 |
| `a1_ash_attacked` | 无 | 标记 | 标记 | 默认假 | `cut_a1_ash_glimpse` | 第三幕阿什的题面（`ai_prompt`）与重逢台词 | 玩家在灰烬室试图攻击阿什（第三幕阿什的题面可引用） |
| `a1_ash_revisit_seen` | 无 | 标记 | 标记 | 默认假 | `cut_a1_ash_glimpse` | `cut_a1_ash_glimpse` | 灰烬室复访版已播 |
| `a1_raven_refused` | 无 | 标记 | 标记 | 默认假 | `cut_a1_yeyu_bound` | `cut_a1_yeyu_bound` | 三次不伸手，契约之门自己打开 |
| `a1_town_entered` | 无 | 标记 | 标记 | 默认假 | `cut_a1_town` | `cut_a1_town`、`cut_a1_guild` | 进镇段已播 |
| `a1_badge_returned` | 无 | 标记 | 标记 | 默认假 | `cut_a1_guild`；第 1 周内在公会柜台交还时由 quests 写入 | 布伦的台词（`ln_bron`）与 `npc.bron.story_level` 的回扣 | 巢中的公会旧铜牌已交还布伦（第 1 周内在柜台交还也写） |
| `a1_trial_evidence` | 无 | 标记 | 标记 | 默认假 | `cut_a1_trial` | `cut_a1_trial` | 审判时出示了物证（北泉灰水，暗渠） |
| `a1_trial_testimony` | 无 | 标记 | 标记 | 默认假 | `cut_a1_trial` | `cut_a1_trial` | 审判时有证词（伊莎、托马、格蕾塔任一） |
| `a1_trial_debate` | 无 | 标记 | 标记 | 默认假 | `cut_a1_trial` | `cut_a1_trial` | 公开辩论成立（陈述不是空白） |
| `a1_trial_speech` | 无 | 出口 | 文本 | 至多 200 字；空白记 `silent` | `cut_a1_trial` | `cut_a1_trial` | 玩家在审判台上的陈述原话 |
| `a1_trial_brawl` | 无 | 标记 | 标记 | 默认假 | `cut_a1_trial` | quests（A1-D02 冲突结局：伤亡与礼拜堂受损） | 审判冲突发生；内核据此结算伤亡与礼拜堂受损 |
| `a1_tess_covered` | 无 | 标记 | 标记 | 默认假 | `cut_a1_trial` | `cut_a1_trial` | 玩家抢在苔丝说漏之前护住了她 |
| `a1_noi_spoke` | 无 | 标记 | 标记 | 默认假 | `cut_a1_trial`；任务目录（前）`A1-S19` | `cut_a1_trial` | 诺伊已对玩家说过"你身上有一扇门。"（S19 也写） |
| `a1_cassian_report` | 无 | 出口 | 枚举 | `convicted`、`cleared`、`fled`；默认未写入 | `cut_a1_trial` | 第二幕赛琳的追查（`npc.selene.evidence` 的起点、`cut_a2_arrival` 起的赛琳台词） | 卡西安第 8 周周报的版本；第二幕赛琳追查时读取 |
| `a1_yeyu_told_fall` | 无 | 标记 | 标记 | 默认假 | `cut_a1_yeyu_memory` | 夜羽的台词包（同一句不重复）、`npc.yeyu.memory_shards` 的记忆线 | 夜羽说过"你掉下来那天晚上，整个遗迹都在响。" |
| `a1_tide_dusk_seen` | 无 | 标记 | 标记 | 默认假 | `cut_a1_tide` | `cut_a1_tide` | 兽潮黄昏段已播 |
| `a1_tide_post` | 无 | 出口 | 枚举 | `north`、`east`、`south`、`west`、`free`；默认未写入 | `cut_a1_tide` | combat 兽潮防线结算（玩家所在防线 +40） | 黄昏时玩家选择赶去的防线 |
| `a1_east_gate_ordered` | 无 | 标记 | 标记 | 默认假 | `cut_a1_tide` | combat 兽潮防线结算（林约 `partial` 时东坡不延迟入栅） | 玩家下令开东栅（林约 `partial` 时东坡不延迟入栅） |
| `a1_mob_seen` | 无 | 标记 | 标记 | 默认假 | `cut_a1_tide` | `cut_a1_tide` | 礼拜堂暴民段已播 |
| `a1_bertha_mob` | 无 | 出口 | 枚举 | `player`、`isa`、`dragged`；默认未写入 | `cut_a1_tide` | `a1_oola_wounded` 的结算、欧拉与伊莎的台词 | 暴民的收场：玩家拦下、伊莎拦下、欧拉被拖出北门 |
| `a1_tide_left_post` | 无 | 标记 | 标记 | 默认假 | `cut_a1_tide` | combat 兽潮防线结算（原防线本阶段失去玩家的 +40） | 玩家丢下防线赶去礼拜堂（原防线本阶段失去玩家的 +40） |
| `a1_oola_wounded` | 无 | 标记 | 标记 | 默认假 | `cut_a1_tide` | `cut_a1_martha` | 欧拉被丢出北门，受伤后由鹿引入林中 |
| `a1_colossus_seen` | 无 | 标记 | 标记 | 默认假 | `cut_a1_tide` | `cut_a1_tide` | 巨像段已播 |
| `a1_core_choice` | 无 | 出口 | 枚举 | `smash`、`grasp`、`shattered`；默认未写入 | `cut_a1_tide` | 渊契之门的序钥（doors）、`trust.yeyu`、`church_suspicion`、事迹 | 澱核的处置（`shattered`：借形之门已开，澱核自碎） |
| `a1_core_choice_made` | 无 | 标记 | 标记 | 默认假 | `cut_a1_tide` | `cut_a1_tide` | 澱核段已播 |
| `a1_martha_drink` | 无 | 标记 | 标记 | 默认假 | `cut_a1_martha` | 玛莎的台词（第一幕 8.5 的隐性盟友） | 玛莎请了那杯不收钱的酒（第一幕 8.5 的隐性盟友） |
| `a1_dream_free_question` | 无 | 出口 | 文本 | 至多 80 字；默认空 | `cut_a1_dream` | 雅努的题面（有模型时）、第六幕回扣 | 梦中玩家最后一次自由提问的原话 |
| `a1_court_first_visit` | 无 | 标记 | 标记 | 默认假 | `cut_a1_mark` | 门内庭院的复苏点说明（界面，只给一次） | 门内庭院首访（复苏点说明已给出） |
| `a1_isa_will_testify` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）`A1-S20`（`q_a1_s20_nun_testimony` 完成时置真）；伊莎亲眼看见孩子有危险时由 quests 按 A1-D02 的兜底置真 | `cut_a1_tide`、`cut_a1_trial` | 伊莎肯作证（S20 完成，或她亲眼看到孩子有危险） |
| `a1_toma_will_testify` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）`A1-S15`（`q_a1_s15_bell_tower` 完成时置真） | `cut_a1_trial` | 托马肯开口（S15 完成） |
| `a1_grey_lamp_seen` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）`A1-M07` 的 `spring` 阶段（病房里发灰的灯，暗面节拍 D2） | `cut_a1_trial` | 暗面节拍 D2：玩家在病房里看见灯焰发灰 |
| `a1_oola_jailbroken` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）A1-D02.f（`A1-M09` 的劫狱解法，`quest.q_a1_m09_lamp_of_light.path == jailbreak`；定罪后到押送前同样写入） | `cut_a1_trial` | 劫狱成功（第一幕 4.2 节点 f，第 7 周起，定罪后到押送前也可） |
| `a1_oola_bribed` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）A1-D02.h（`A1-M09` 的贿赂路线，`quest_path = bribed`） | `cut_a1_trial` | 贿赂莫斯放人（节点 h） |
| `a1_tess_in_crowd` | 无 | 出口 | 布尔 | 默认假 | quests：`A1-M09` 的 `verdict` 阶段开场结算（`trust.isa >= 60`、`A1-S19` 守密、或孩子已改住磨坊时为假） | `cut_a1_trial` | 审判时苔丝在人群里；内核在审判开场结算：伊莎信任 60 以上、或 S19 守密、或孩子已改住磨坊时为否 |
| `a1_vouched` | 无 | 标记 | 标记 | 默认假 | cognition 社会结算（任一人物信任不低于 80，且在审判、传讯或广场公开替玩家说话）；`cut_a1_trial`（布伦作证） | `cut_a1_talent`、`cut_a1_trial` | 一位凡人当众替玩家担保（任一 NPC 信任 80 以上，在审判、传讯或广场公开替玩家说话；识才之门的第三把钥）；社会结算写入，`cut_a1_trial` 的布伦作证也写 |
| `a1_vouch_by` | 无 | 出口 | 文本 | 人物 ID；默认空 | 与 `a1_vouched` 同时写入（第一次当众担保的人） | `cut_a1_talent` | 第一次当众担保的人 |
| `a1_tide_night` | 无 | 标记 | 标记 | 默认假 | quests：`A1-M12` 开始（暗月夜日落） | `cut_a1_tide` | 暗月夜日落 |
| `a1_tide_stage` | 无 | 出口 | 整数 | 0 到 5；默认 0 | combat 兽潮波次结算（`A1-M12` 的 `dusk` 到 `dawn`，[第一幕 8.2][a1]） | `cut_a1_tide` | 兽潮阶段（第一幕 8.2） |
| `a1_colossus_target` | 无 | 出口 | 枚举 | `player`、`children`；默认未写入 | combat：澱巨像抵达时按玩家是否在射程内结算（`A1-M12` 的 `colossus` 阶段） | `cut_a1_tide` | 巨像抵达时追的目标（玩家在射程内追玩家，否则追门纹孩子） |
| `a1_tide_weakest` | 无 | 出口 | 枚举 | `north`、`east`、`south`、`west`；默认未写入 | combat 防线结算（`A1-M12` 的 `second_surge` 之前，按 [第一幕 8.6][a1] 的防御值） | `cut_a1_tide`、`cut_a1_martha` | 第二波扑向的最弱面 |
| `a1_tide_gap_weakest` | 无 | 出口 | 整数 | 0 以上；默认 0 | combat 防线结算（同上；压力减防御，小于 0 取 0） | `cut_a1_martha` | 最弱面第二波的缺口（压力减防御，小于 0 取 0） |
| `a1_tide_other_dead` | 无 | 出口 | 整数 | 0 以上；默认 0 | combat 伤亡结算（`A1-M12` 的 `dawn`） | `cut_a1_martha` | 博罗、德里斯、巴托、加斯帕之外的具名死者人数 |
| `a1_dream_bed` | 无 | 出口 | 枚举 | `tavern`、`guild`、`chapel`；默认未写入 | quests：`A1-M13` 开始时按醉月亭是否受损结算（`a1_bs_survival`） | `cut_a1_dream`、`cut_a1_mark` | 兽潮次夜的睡处（醉月亭客房受损时改睡公会石屋或礼拜堂） |

#### 8.8.3 第二幕

来源：过场目录第 6.3 节。

| 规范名 | 别名 | 种 | 类型 | 取值与默认 | 写入者 | 读取处 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `a2_count_request` | 无 | 出口 | 枚举 | `accepted`、`deferred`；默认未写入 | `cut_a2_arrival` | 伯爵与鲁道夫的台词（伯爵之死之前） | 对伯爵托付"城底下有声音，替我听听"的回应 |
| `a2_count_audience_done` | 无 | 标记 | 标记 | 默认假 | `cut_a2_arrival` | `cut_a2_arrival`、`cut_a2_exam` | 帘后觐见已完成 |
| `a2_exam_refused` | 无 | 标记 | 标记 | 默认假 | `cut_a2_exam` | `cut_a2_exam` | 拒考，按委托积分晋升（第 8 周到 C） |
| `a2_reynard_duel` | 无 | 出口 | 枚举 | `crush`、`grace`、`lost`；默认未写入 | 任务目录（前）`A2-M02` 的对练遭遇 `reynard_walter_duel`（碾压 `crush`、体面 `grace`、故意输 `lost`） | `cut_a2_exam` | 考核对练的结果 |
| `a2_luchen_question` | 无 | 出口 | 枚举 | `admit`、`deny`、`deflect`、`silent`；默认未写入 | `cut_a2_heroes` | 陆辰的台词与题面 | 对"你也是穿越来的？"的回应；选 `admit` 的同一效果置 `a2_told_heroes_earth` |
| `a2_chase_route` | 无 | 出口 | 枚举 | `shore`、`ferry_boat`、`rat_tunnel`、`absent`；默认未写入 | `cut_a2_ferryman`；玩家不在场时由 quests（`A2-M07`）写 `absent` | `cut_a2_ferryman` | 瓦伦河夜追的路线；absent 为不在场 |
| `a2_chase_survived` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）`A2-M07` 的驳船遭遇 `river_catfish_king`（撑过三轮扑击） | `cut_a2_ferryman` | 在驳船上撑过沉河鲶王三轮扑击 |
| `a2_ferryman_cut_witnessed` | 无 | 标记 | 标记 | 默认假 | `cut_a2_ferryman` | `cut_a2_ferryman` | 亲眼看见老船夫那一刀 |
| `a2_trial_defendant` | 无 | 出口 | 枚举 | `oola`、`shiya`、`ron`；默认未写入 | `cut_a2_selene_trial` | `cut_a2_selene_trial`、`cut_a2_funeral`、`cut_a2_siege` | 光之审的被告 |
| `a2_cage_evidence` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）`A2-M08`（取得晶窟笼子的证据） | `cut_a2_selene_trial` | 取得晶窟笼子的证据 |
| `a2_fiona_turned` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）`A2-M08` 与 A2-D03（菲奥娜引路并愿作证） | `cut_a2_selene_trial` | 菲奥娜被策反并愿作证 |
| `a2_luchen_saw_defendant_good` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）`A2-M04` 或 `A2-S13` 的同行记录 | A2-D02 的"勇者作证"解法 | 陆辰亲眼见过被告做好事 |
| `a2_agnes_witness` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）`A2-S10` | `cut_a2_selene_trial` | 艾格尼丝愿为被告作证 |
| `a2_false_record_exposed` | 无 | 出口 | 布尔 | 默认假 | `cut_a2_selene_trial`（选 `falserec` 时由内核钩子按照规镜判定写入） | `cut_a2_selene_trial` | 光之审中以伪录作证被照规镜看破 |
| `a2_trial_postponed` | 无 | 标记 | 标记 | 默认假 | `cut_a2_selene_trial` | `cut_a2_selene_trial`、`cut_a2_funeral` | 伪证揭穿，本案延期（葬礼后撤销） |
| `a2_trial_sentenced` | 无 | 标记 | 标记 | 默认假 | `cut_a2_selene_trial` | `cut_a2_selene_trial`、`cut_a2_funeral` | 判火刑，待葬礼后结算 |
| `a2_dietrich_dismissed` | 无 | 标记 | 标记 | 默认假 | `cut_a2_selene_trial` | A2-D02 结局与第三幕教会的台词 | 迪特里希被当众撤职 |
| `a2_selene_deceived` | 无 | 标记 | 标记 | 默认假 | `cut_a2_selene_trial` | `npc.selene.evidence`（"欺瞒"）与赛琳的题面 | 赛琳识破玩家以伪录欺瞒（"欺瞒"） |
| `a2_undertaker_exposed` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）A2-D03 的调查节点（第 10 周起"夜里的抬棺人"，`A2-M11` 之前） | `cut_a2_funeral` | 葬礼前查出安眠葬仪社是门徒会的门面 |
| `a2_funeral_choice` | 无 | 出口 | 枚举 | `guard_signet`、`chase`、`guard_people`；默认未写入 | `cut_a2_funeral` | quests（`A2-M11` 结算：平民伤亡与印戒去向） | 葬礼袭击中玩家的应对 |
| `a2_signet_taken` | 无 | 标记 | 标记 | 默认假 | `cut_a2_funeral` | `cut_a2_siege` | 印戒在葬礼上被门徒会夺走 |
| `a2_siege_scale_down` | 无 | 标记 | 标记 | 默认假 | `cut_a2_funeral` | `cut_a2_siege` | 印戒没被抢走，门徒会只能炸闸，城下潮缩小一级 |
| `a2_arrest_response` | 无 | 出口 | 枚举 | `surrender`、`flee_ferry`、`flee_tunnel`、`talk_delayed`、`resist`；默认未写入 | `cut_a2_arrest` | `cut_a2_siege` | 玩家对逮捕令的回应 |
| `a2_player_jailed` | 无 | 出口 | 布尔 | 默认假 | `cut_a2_arrest`、`cut_a2_siege` | `cut_a2_siege` | 玩家被关在静室；城下潮开局时由赛琳放出；选投降的同一效果置 `a2_player_arrested` |
| `a2_aiden_names_given` | 无 | 标记 | 标记 | 默认假 | `cut_a2_arrest` | `cut_a2_no_page` | 逮捕那天把三种名字写给了艾登 |
| `a2_siege_started` | 无 | 标记 | 标记 | 默认假 | `cut_a2_siege` | `cut_a2_siege` | 城下潮已开始（入口一播过） |
| `a2_heralda_hired` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）`A2-M12` 的 `deploy`（选赤鬃小队；A2-D08 胜后可长期结约） | `cut_a2_siege` | 雇下赤鬃佣兵当第四支小队 |
| `a2_heroes_follow_command` | 无 | 标记 | 标记 | 默认假 | `cut_a2_siege` | `compute wb_council` 第 5 条、城下潮的勇者协同 | 勇者团接受玩家调度一次 |
| `a2_rotunda_reached` | 无 | 标记 | 标记 | 默认假 | 迷宫系统：断门厅脚本（`A2-M12` 的 `core`，[迷宫与首领目录][dgb]） | `cut_a2_siege` | 玩家进入断门厅圆厅 |
| `a2_hall_entered` | 无 | 标记 | 标记 | 默认假 | `cut_a2_siege` | `cut_a2_siege` | 断门厅前厅段已播 |
| `a2_ritual_ended` | 无 | 标记 | 标记 | 默认假 | `cut_a2_siege` | `cut_a2_siege` | 玩家用门纹合上门框，仪式终止，战斗停止增援 |
| `a2_gateframe_touched` | 无 | 标记 | 标记 | 默认假 | `cut_a2_siege` | 隔扉之门的历钥（doors） | 触碰古门框、听见残响（隔扉之门的历钥） |
| `a2_hall_children_freed` | 无 | 出口 | 整数 | 0 到 9；默认 0 | 迷宫系统：断门厅脚本（按缄门者被击碎的部位，同时计入 `a2_rescued_children`） | `a2_rescued_children`、事迹 | 断门厅里松脱的孩子数（同时计入 `rescued_children`） |
| `a2_emil_fled` | 无 | 标记 | 标记 | 默认假 | 迷宫系统：断门厅脚本（玩家拖得太久时） | `cut_a2_siege` | 玩家拖得太久，埃米尔已从渡口水门逃走 |
| `a2_emil_custody` | 无 | 出口 | 枚举 | `selene`、`lucas`；默认未写入 | `cut_a2_siege` | 第三幕埃米尔的审讯（`a2_emil_fate == captured`） | 被俘的埃米尔交给谁 |
| `a2_signet_in_hand` | 无 | 标记 | 标记 | 默认假 | `cut_a2_siege` | `cut_a2_siege` | 印戒在玩家手里（从埃米尔身上追回） |
| `a2_siege_descended` | 无 | 标记 | 标记 | 默认假 | warfare：`bat_a2_undertide` 结算（玩家在战斗中下到过断门厅） | `cut_a2_siege` | 玩家在战斗中下到过断门厅 |
| `a2_siege_result` | 无 | 出口 | 枚举 | `held`、`fell`；默认未写入 | warfare：`bat_a2_undertide` 结算（黎明钟敲响为 `held`，城破为 `fell`，与 `quest.q_a2_m12_tide_under_city` 的完成与失败一致） | `cut_a2_siege` | 城下潮结果；fell 进入军管分支 |
| `a2_held.<出口>` | `a2_held_<出口>`（例 `a2_held_mudlane`） | 族 | 布尔 | 键：`mudlane`、`fishmarket`、`harbor`、`cathedral`、`eaglewell`；默认假 | warfare：`bat_a2_undertide` 结算（下城三口按守备，上城两口由内核按 AI 友军结算） | `cut_a2_siege` | 五个出口是否守住到黎明；`a2_tide_exits_held` 是其中为真的个数 |
| `a2_bell_tower_fell` | 无 | 标记 | 标记 | 默认假 | warfare：`bat_a2_undertide` 结算 | `cut_a2_siege` | 白钟钟楼倒塌（黎明钟改由小钟楼敲） |
| `a2_heir_fallen` | 无 | 出口 | 枚举 | `none`、`edric`、`cecilia`、`lucas`；默认未写入 | warfare：`bat_a2_undertide` 结算（同时写 `npc.<人>.dead`） | `cut_a2_siege`、`cut_a2_barony`；`compute wb_council` 第 7 条 | 战死的继承人 |
| `a2_edric_mercy_rescue` | 无 | 标记 | 标记 | 默认假 | warfare：`bat_a2_undertide` 结算（艾德里克的 AI 自主行动） | `cut_a2_siege` | 艾德里克亲自冲进慈济院救人（民心记忆反转） |
| `a2_dawn_done` | 无 | 标记 | 标记 | 默认假 | `cut_a2_siege` | `cut_a2_siege` | 黎明段已播 |
| `a2_selene_last_answer` | 无 | 出口 | 枚举 | `truth`、`evade`、`ask_back`、`silent`；默认未写入 | `cut_a2_siege` | 赛琳的题面与第三幕 `a3_selene_stance` 的起点 | 对赛琳最后一问的回答 |
| `a2_arrest_shelved` | 无 | 标记 | 标记 | 默认假 | `cut_a2_siege` | 第三幕 `church_verdict` 的结算与赛琳线 | 逮捕令暂缓，"待城安定再议" |
| `a2_charter_support` | 无 | 派生 | 派生整数 | 0 到 6 | 派生：`COUNT(rep.guild >= 33, rep.merchants_union >= 33, rep.city_guard >= 33, rep.crafters >= 33, rep.antlers >= 33, rep.commons >= 33)`（分幕的"友善"即 +1 档，按第 7.4 节换算为 33） | `compute wb_council` 第 2 条、`cut_a2_siege` 的盖印选项 | 公会、商会联合、城防军、工匠、鹿角会、平民六方中声望不低于"友善"的数目 |
| `a2_council_stance` | 无 | 出口 | 枚举 | `edric`、`cecilia`、`lucas`、`regency`、`charter`、`none`；默认未写入 | `cut_a2_siege` | `compute wb_council` 第 6 条 | 城议上玩家的表态或印戒交付 |
| `a2_council_done` | 无 | 标记 | 标记 | 默认假 | `cut_a2_siege` | `cut_a2_siege`、`cut_a2_no_page` | 城议结束（军管分支在黎明段写入） |
| `a2_no_page_reply` | 无 | 出口 | 枚举 | `admit`、`ask_back`、`joke`、`silent`；默认未写入 | `cut_a2_no_page` | `cut_a2_no_page` | 对"铭录里没有你"的回应 |

#### 8.8.4 第三幕

来源：过场目录第 7.3 节。

| 规范名 | 别名 | 种 | 类型 | 取值与默认 | 写入者 | 读取处 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `a3_domain_beat` | 无 | 段落 | 枚举 | `arrival`、`flag`、`arrival_done`、`done`；默认未写入 | 请求方 `A3-M01`、战场剧本 `act3_bone_field`；`cut_a3_domain` | `cut_a3_domain` | `cut_a3_domain` 的段落旗标 |
| `territory_address` | 无 | 全局 | 枚举 | `name`、`lord`、`kneel`；默认未写入 | `cut_a3_domain` | `cut_a4_founding`；领地 NPC 的称呼与吠叫（台词目录） | 领地对玩家的称呼与气氛（U3-5） |
| `push_door.<门>` | `push_door.door_<门目录代号>`（键写成门目录代号时按 `data/doors/doors.json` 的 `code` 换成 `id`，例 `push_door.door_founding` 即 `push_door.founding`） | 信号 | 标记 | 键：门 ID；为真表示过场提交了推门请求；默认假 | 过场（`cut_a3_domain`、`cut_a3_warning`、`cut_a3_ashen_line`、`cut_a4_founding`） | doors：把过场结束的那一刻（含战斗插演）视为安全时刻，按开门结算处理并清除该键（[千门 3.4][td]） | 过场里的推门请求；千门系统在过场结束时按开门结算处理并清除 |
| `a3_crest_reply` | 无 | 出口 | 枚举 | `draw`、`ask`、`yeyu`；默认未写入 | `cut_a3_audience` | 宫廷线的台词与腓力的题面 | 觐见时对"一根骨头？"的回应 |
| `a3_curtain_approach` | 无 | 出口 | 枚举 | `stepped`、`looked`、`stayed`；默认未写入 | `cut_a3_audience` | 宫廷线的台词与 `goddess.eluen.gaze` 的帘后回扣 | 帘前的举动 |
| `a3_reedpond_beat` | 无 | 段落 | 枚举 | `night`、`dawn`、`told`、`done`；默认未写入 | 请求方 `A3-M07`；`cut_a3_massacre` | `cut_a3_massacre` | `cut_a3_massacre` 的段落旗标 |
| `a3_reedpond_present` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）`A3-M07`（第 12 周夜玩家身在苇塘村时置真） | `cut_a3_massacre`、`cut_a3_ashen_line` | 第 12 周夜玩家身在苇塘村 |
| `a3_reedpond_evacuated` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）`A3-M07`（先遣队抵达前疏散完成时置真；结算时 `a3_reedpond_outcome = saved`） | `cut_a3_massacre` | 先遣队抵达前已完成疏散 |
| `a3_reedpond_act` | 无 | 出口 | 枚举 | `intercept`、`shield_marcus`、`fog_lead`、`record`；默认未写入 | `cut_a3_massacre` | `cut_a3_massacre` | 屠村那一刻玩家做的一件事 |
| `a3_reedpond_record` | 无 | 标记 | 标记 | 默认假 | `cut_a3_massacre` | `cut_a3_ashen_line` | 卡西安记下了名字（说服路线的证据） |
| `a3_seen_by_lamp` | 无 | 标记 | 标记 | 默认假 | `cut_a3_massacre` | `church_suspicion` 与第四幕异端诏书的理由 | 照规灯照出了玩家的门纹 |
| `a3_cassian_refused` | 无 | 标记 | 标记 | 默认假 | `cut_a3_massacre` | 女神目录 `div_beat_a3_cassian_fade` 的触发、卡西安线（`npc.cassian.path`） | 卡西安拒绝为处刑祝祷（`div_beat_a3_cassian_fade` 的触发） |
| `a3_archive_reached` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）`A3-M08`（抵达千门书库正厅时置真） | `cut_a3_sundering` | 玩家抵达千门书库正厅 |
| `a3_static_ash_night` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）`A3-M08`（抵达那一夜是第 14 周的静灰夜时置真） | `cut_a3_sundering` | 抵达书库的那一夜是第 14 周的静灰夜 |
| `yeyu_address` | 无 | 全局 | 枚举 | `handle`、`opener`、`name`；默认 `handle` | `cut_a3_sundering` 写 `opener`；`cut_a6_letter7`（第七封信）写 `name` | 夜羽的台词与吠叫（按称呼取词）、`data/party/companions.json` 的称呼 | 夜羽对玩家的称呼：门把手、开门的、名字（`characters.md` 第 3.1 节）；对话与吠叫按它取称呼 |
| `a3_pit_stared` | 无 | 标记 | 标记 | 默认假 | `cut_a3_sundering` | `cut_a3_warning` | 在书库屋顶"再看一眼"主门坑（C3-3），休整一日 |
| `a3_ash_question` | 无 | 出口 | 文本 | 至多 60 字；默认空 | `cut_a3_sundering` | 阿什的题面（`ai_prompt`） | 玩家问阿什的自由问题 |
| `a3_warning_beat` | 无 | 段落 | 枚举 | `w6`、`w6_done`、`archive`、`ruins`、`dream`、`done`；默认未写入 | 请求方任务与 `cut_a3_sundering`；`cut_a3_warning` | `cut_a3_warning` | `cut_a3_warning` 的段落旗标 |
| `a3_ash_fragment_given` | 无 | 标记 | 标记 | 默认假 | `cut_a3_warning` | `a3_blank_era_fragments`、千门书库通行 | 阿什交出空白纪碎片五 |
| `a3_archive_open` | 无 | 标记 | 标记 | 默认假 | `cut_a3_warning` | 千门书库出入口的 `requiresFlags` | 千门书库此后随时可进（受托） |
| `a3_danger_stance` | 无 | 出口 | 枚举 | `forsworn`、`continue`、`undecided`；默认未写入 | `cut_a3_warning` | 夜羽与阿什的对白（不锁门） | 玩家对危险之门的表态（不锁门，只影响之后的对白） |
| `a3_yeyu_consent_whisper` | 无 | 标记 | 标记 | 默认假 | `cut_a3_warning` | 低语之门的钥（doors） | 夜羽同意开低语之门（该门的一把钥） |
| `a3_dream_w15_asked` | 无 | 出口 | 枚举 | `release`、`vague`；默认未写入 | `cut_a3_warning` | `cut_a3_warning` | 第 15 周梦里问了哪一种 |
| `a3_dream_words` | 无 | 出口 | 文本 | 至多 60 字；默认空 | `cut_a3_warning` | 雅努的题面（`ai_prompt`）与第五幕梦的回扣 | 玩家在梦里对门口的女人说的话 |
| `a3_crown_beat` | 无 | 段落 | 枚举 | `gate`、`deathbed`、`deathbed_mid`、`after_bed`、`morning`、`done`；默认未写入 | 请求方 `A3-M10`、战场剧本 `act3_sunrise_gate`；`cut_a3_crown_falls` | `cut_a3_crown_falls` | `cut_a3_crown_falls` 的段落旗标 |
| `a3_sunrise_route` | 无 | 出口 | 枚举 | `in_capital`、`waystone`、`messenger`、`none`；默认未写入 | 任务目录（前）`A3-M10`（`capital` 路线按途径细分为 `in_capital`、`waystone`、`messenger`；`downriver` 路线记 `none`） | `cut_a3_crown_falls` | 朝阳门之夜玩家能否到场及途径 |
| `a3_sunrise_fought` | 无 | 标记 | 标记 | 默认假 | `cut_a3_crown_falls` | 腓力与约阿希姆的台词、事迹 | 玩家参加了朝阳门之战 |
| `a3_king_bedside` | 无 | 标记 | 标记 | 默认假 | warfare：`bat_a3_sunrise_gate`（剧本 `act3_sunrise_gate`，抵达帘幕寝殿时）；`cut_a3_crown_falls` | `cut_a3_crown_falls` | 玩家到了老王床边 |
| `a3_king_entrusted` | 无 | 标记 | 标记 | 默认假 | `cut_a3_crown_falls` | 离手结局的后日谈（`sep`） | 老王把"别让北境的孩子再去当勇者的垫脚石"托付给玩家；离手结局后日谈引用 |
| `a3_king_died` | 无 | 标记 | 标记 | 默认假 | `cut_a3_crown_falls` | 王冠线（`A3-M13`）的台词 | 老王驾崩 |
| `a3_ashline_beat` | 无 | 段落 | 枚举 | `eve`、`battle`、`duel`、`duel_end`、`pillar`、`end`、`fallen`、`done`；默认未写入 | 请求方 `A3-M11`、战场剧本 `act3_ash_line`；`cut_a3_ashen_line` | `cut_a3_ashen_line`、`cut_a3_eluen_speaks` | `cut_a3_ashen_line` 的段落旗标 |
| `a3_second_front_general` | 无 | 出口 | 枚举 | `ursak`、`konrad`、`lucas`、`ron`、`shiya`；默认未写入 | `cut_a3_ashen_line` | warfare 第二战线 `bat_a3_second_front` 的将领 | 第二战线的将领 |
| `general.<人>` | 无 | 派生 | 派生标记 | 键：人物 ID；默认假 | 派生：`war.generals HAS <人>`（不写入） | 条件表达式（`cut_a3_ashen_line` 的第二战线选项） | 该将领在可用名单里（`act3_lothar_crisis.md` 第 10.2 节 `generals` 集合的布尔镜像，供条件表达式使用） |
| `a3_lu_duel_choice` | 无 | 出口 | 枚举 | `full`、`holdback`；默认未写入 | `cut_a3_ashen_line` | `cut_a3_ashen_line` | 与陆辰对决时是否留手 |
| `a3_marcus_crossed` | 无 | 标记 | 标记 | 默认假 | `cut_a3_ashen_line` | warfare（马库斯的生死结算）、`hero_state.marcus` | 马库斯在净化之光里越过战线（战争系统据此结算他的生死） |
| `a3_sasha_threw` | 无 | 标记 | 标记 | 默认假 | `cut_a3_ashen_line` | 萨莎的台词与题面 | 萨莎把石头掷进光柱 |
| `a3_pillar_response` | 无 | 出口 | 枚举 | `interrupt`、`close`、`endure`；默认未写入 | `cut_a3_ashen_line` | `cut_a3_eluen_speaks` | 对净化之光的应对 |
| `a3_pillar_breach` | 无 | 标记 | 标记 | 默认假 | goddess：越约窗口 `div_breach_eluen_pillar` 成立时（战场剧本 `act3_ash_line` 内，[女神目录][gi]），同一结算写 `breach.eluen.act3` | `cut_a3_ashen_line` | 光柱致死了兽人信徒（越约窗口 `div_breach_eluen_pillar` 触发） |
| `a3_supply_cut` | 无 | 标记 | 标记 | 默认假 | warfare：`bat_a3_reedbridge`（剧本 `act3_ash_line`，断粮路径） | `cut_a3_ashen_line` | 不杀而胜：断了圣战军的粮 |
| `a3_archbishop_seized` | 无 | 标记 | 标记 | 默认假 | warfare：`bat_a3_reedbridge`（剧本 `act3_ash_line`，夜擒路径） | `cut_a3_ashen_line` | 不杀而胜：夜擒大主教 |
| `a3_oracle_public` | 无 | 标记 | 标记 | 默认假 | 任务目录（前）`A3-S19` 的 `choice` 选"公开" | `cut_a3_ashen_line` | 玩家选择公开赛琳寄来的神谕原文（`A3-S19` 的"公开"） |
| `a3_bodric_wall` | 无 | 派生 | 派生标记 | 默认假 | 派生：`a3_bridgehead == stone`（`A3-S20` 写 `a3_bridgehead`） | `cut_a3_ashen_line` | 桥头段升级为灰石垒（`A3-S20`） |
| `a3_eluen_reply` | 无 | 出口 | 枚举 | `why`、`defy`、`words`、`silent`；默认未写入 | `cut_a3_eluen_speaks` | 艾琉恩的题面（`ai_prompt`）与第六幕审庭回扣 | 对借大主教之口的光的回应 |
| `a3_eluen_words` | 无 | 出口 | 文本 | 至多 60 字；默认空 | `cut_a3_eluen_speaks` | 艾琉恩的题面（`ai_prompt`）与第六幕审庭回扣 | 玩家对那道光说的话 |
| `a3_cassian_saw_voice` | 无 | 标记 | 标记 | 默认假 | `cut_a3_eluen_speaks` | `A3-S11` 的转折点（卡西安线） | 卡西安看见光对别人说话（`A3-S11` 的转折点） |
| `a3_map_beat` | 无 | 段落 | 枚举 | `ash`、`ash_done`、`map`、`done`；默认未写入 | 请求方 `A3-M12`、`A3-M13`；`cut_a3_map` | `cut_a3_map` | `cut_a3_map` 的段落旗标 |
| `a3_ash_she_fears` | 无 | 标记 | 标记 | 默认假 | `cut_a3_map` | `cut_a4_isomorphism` | 阿什说出"她是怕你"（M01-C08 已落地） |
| `a3_philip_crown_answer` | 无 | 出口 | 枚举 | `wear`、`refuse`、`yours`；默认未写入 | `cut_a3_map` | `trust.philip` 与腓力的台词（不改王冠结局） | 对"该不该戴"的回答 |
| `a3_autonomy_charter` | 无 | 标记 | 标记 | 默认假 | `cut_a3_map` | 第四幕立国的宣称（`a4_claim`）与 `territory_autonomy` | 腓力授灰烬边境永久自治特许（残存弱国） |

#### 8.8.5 第四幕

来源：过场目录第 8.3 节。

| 规范名 | 别名 | 种 | 类型 | 取值与默认 | 写入者 | 读取处 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `a4_founding_beat` | 无 | 段落 | 枚举 | `claim`、`claim_done`、`registry`、`registry_done`、`stone`、`oath_done`、`door`、`done`；默认未写入 | 请求方 `A4-M01`、立国链第 3 序、`A4-M04`、千门系统；`cut_a4_founding` | `cut_a4_founding`、`cut_a4_feast`、`cut_a4_edict` | `cut_a4_founding` 的段落旗标（door 由千门系统在立国之门开启后写入） |
| `a4_oath_reader` | 无 | 出口 | 枚举 | `player`、`elder`；默认未写入 | `cut_a4_founding` | `cut_a4_founding` | 界石誓由谁念 |
| `a4_nation_name` | 无 | 出口 | 文本 | 玩家输入；空值"庭外之国" | `cut_a4_founding` | 台词与界面的插槽（不进条件） | 国名（显示用插槽，不进条件） |
| `a4_feast_beat` | 无 | 段落 | 枚举 | `invite`、`invited`、`hall`、`done`；默认未写入 | 请求方立国链第 7 序、强者之宴主线；`cut_a4_feast` | `cut_a4_feast` | `cut_a4_feast` 的段落旗标 |
| `a4_emperor_duel` | 无 | 标记 | 标记 | 默认假 | `cut_a4_feast` | `trial_emperor_hook` 提前开放、后日谈内容池（`sep`） | 一剑问答"不怕"：剑帝约定战后决斗（后日谈内容池，`trial_emperor_hook` 提前开放） |
| `a4_feast_emperor_ask` | 无 | 出口 | 枚举 | `refuse_road`、`ally`、`his_call`；默认未写入 | `cut_a4_feast` | `compute summit_result`（会盟上帝国"拒绝借道"的倾向） | 第三轮对剑帝之问的回答（会盟上帝国"拒绝借道"的倾向读它） |
| `a4_night_queen_sincere` | `a4_vespera_sincere`（人物代号按第 7.1 节） | 标记 | 标记 | 默认假 | `cut_a4_feast` | `cut_a4_feast`；月下之约（分幕 5.6） | 夜后把玩家对第三轮之问的回答判为真心（月下之约的前置，分幕 5.6） |
| `a4_hart_offer` | 无 | 出口 | 枚举 | `accepted`、`refused`、`mortal_pact`；默认未写入 | `cut_a4_feast` | 经济战的起点（`a4_hart_state`、`a4_econ_vassal`） | 宴上对哈特贸易协定的回应（经济战起点，分幕 5.6、8.1） |
| `a4_hart_clause_read` | 无 | 标记 | 标记 | 默认假 | `cut_a4_feast` | 哈特的台词与经济战条款 | 让波比·林德把条款念全 |
| `a4_elwin_invited` | 无 | 标记 | 标记 | 默认假 | `cut_a4_feast` | "森林的秘密"（`A4-D03.d`）完整分支的钥 | 艾尔温"来森林"的邀请（"森林的秘密"完整分支的钥） |
| `a4_versions_beat` | 无 | 段落 | 枚举 | merca、eluen、sylvie、moira 与各自的 `_done`；默认未写入 | 女神 GM 的 DB-A4-01、02、04、05，`A4-S07`；`cut_a4_versions` | `cut_a4_versions` | `cut_a4_versions` 的段落旗标 |
| `a4_version_heard.<司>` | 无 | 族 | 标记 | 键：`eluen`、`valda`、`merca`、`sylvie`、`moira`；默认假 | `cut_a4_versions`、`cut_a4_valda_offer` | `cut_a4_key_theft`、`cut_a4_isomorphism` | 听过某位女神的版本（对照页按此逐列填入；`a4_goddess_versions_heard` 是它的计数）；每置真一位，同一效果把 `a4_goddess_versions_heard` 加 1 |
| `a4_eluen_pitch` | 无 | 出口 | 枚举 | `accepted`、`refused`、`deferred`；默认未写入 | `cut_a4_versions` | `cut_a4_versions`、`cut_a4_edict`；女神 GM（发 `pitch.accepted` 或 `pitch.refused`）、`a4_eluen_page_considered` | 对艾琉恩招安的回应；女神 GM 据此发 `pitch.accepted` 或 `pitch.refused`；`a4_eluen_page` 只在副署成立后写 |
| `a4_key_beat` | 无 | 段落 | 枚举 | `night`、`night_done`、`plea`、`plea_done`、`chase`、`chase_done`、`fate`、`fate_done`；默认未写入 | 请求方 `A4-D05.a`、`.b`、`.d`、`.e`；`cut_a4_key_theft` | `cut_a4_key_theft` | `cut_a4_key_theft` 的段落旗标 |
| `a4_key_pending` | 无 | 出口 | 枚举 | `k3`、`k5`、`k6`；默认未写入 | 任务目录（后）`A4-D05.e`（三条线索的任务，写本次追回的是哪一枚） | `cut_a4_key_theft`；`compute key_to_merca`、`key_to_player`、`key_to_remnants`、`key_to_sylvie` | 本次追回的是哪一枚（`compute key_to_*` 读它） |
| `a4_key_chase` | 无 | 出口 | 枚举 | `player`、`officers`、`refused`；默认未写入 | `cut_a4_key_theft` | `cut_a4_key_theft` | 门钥由谁去追 |
| `a4_nera_choice` | 无 | 出口 | 枚举 | `merca`、`player`、`ransom`；默认未写入 | `cut_a4_key_theft` | 奈拉的去向（`companion.nera.lost`、后日谈 `sep`）与梅尔卡的题面 | 奈拉暴露后的抉择（站梅尔卡、只报账不报人、请玩家赎身） |
| `a4_mute_bell_fate` | 无 | 出口 | 枚举 | `yielded`、`killed`、`escaped`；默认未写入 | 迷宫系统：`mute_bell_chase` 的结算（[迷宫与首领目录][dgb]） | `cut_a4_key_theft` | 哑钟一线的结局 |
| `a4_valda_beat` | 无 | 段落 | 枚举 | `altar`、`done`；默认未写入 | 请求方 `A4-M07` 第二阶段；`cut_a4_valda_offer` | `cut_a4_valda_offer` | `cut_a4_valda_offer` 的请求与完成 |
| `a4_valda_answer` | 无 | 出口 | 枚举 | `allied`、`refused`、`own_way`；默认未写入 | `cut_a4_valda_offer` | `cut_a5_confession` | 对瓦尔妲结盟提议的回应 |
| `a4_moira_first_tier` | 无 | 出口 | 枚举 | `tell`、`insight`、`surrender`、`none`；默认未写入 | `cut_a4_isomorphism` | 莫伊拉的题面与客卷 | 空白层第一笔交易的付法 |
| `a4_moira_tale` | 无 | 出口 | 文本 | 玩家输入，至多 400 字；默认空 | `cut_a4_isomorphism` | 莫伊拉的私密题面（`ai_prompt`）与客卷 | 讲述档的故事（进莫伊拉的私密题面与"客卷"） |
| `a4_moira_earth_answer` | 无 | 出口 | 文本 | 玩家输入，至多 200 字；默认空 | `cut_a4_isomorphism` | 莫伊拉的私密题面（`ai_prompt`） | "人们靠什么活着"的回答 |
| `a4_moira_memory_taken` | 无 | 标记 | 标记 | 默认假 | `cut_a4_isomorphism`；此后的交出由莫伊拉的交易界面写入 | `cut_a6_earth_truth` | 交出了一段前世记忆（不可逆；回忆场景里那一刻显示为空白页） |
| `a4_edict_beat` | 无 | 段落 | 枚举 | `decree`、`decree_done`、`arrival`、`arrival_done`、`oracle`、`oracle_done`、`choice`、`choice_done`、`rescued`、`revoked`、`done`；默认未写入 | 请求方 `A4-D02.a`、`.c`、`.e`、`.f`、营救任务、女神 GM；`cut_a4_edict` | `cut_a4_edict` | `cut_a4_edict` 的段落旗标 |
| `a4_edict_issued` | 无 | 标记 | 标记 | 默认假 | `cut_a4_edict` | 撤诏段与写页的先后判断（`cut_a4_edict`） | 异端之国诏已颁布（撤诏段与写页的先后判断读它） |
| `a4_chapel_choice` | 无 | 出口 | 枚举 | `let_go`、`forbid`、`rite`；默认未写入 | `cut_a4_edict` | 国内礼拜堂的台词与信仰份额（strategy） | 诏书到达后礼拜堂的处置 |
| `a4_selene_pressured` | 无 | 标记 | 标记 | 默认假 | `cut_a4_edict` | `cut_a4_edict` | 玩家在赛琳入境时收买或恐吓她（走向效忠） |
| `a4_selene_rescue_vow` | 无 | 标记 | 标记 | 默认假 | `cut_a4_edict` | `cut_a4_edict` | 玩家许诺去接回瑟兰作证的赛琳 |
| `a4_conclave_beat` | 无 | 段落 | 枚举 | `summit`、`summit_done`、`debate`、`debate_done`、`close`、`done`；默认未写入 | 请求方 `A4-M13`；`cut_a4_conclave` | `cut_a4_conclave` | `cut_a4_conclave` 的段落旗标 |
| `a4_night_seated` | 无 | 标记 | 标记 | 默认假 | `cut_a4_conclave` | `cut_a4_conclave` | 夜后在会盟入席（眠鳞同盟的条件之一） |
| `a4_monopoly_deal` | 无 | 出口 | 枚举 | `accepted`、`better`、`refused`；默认未写入 | `cut_a4_conclave` | `cut_a4_conclave` | 对同盟"专营换弃权"的回应 |
| `a4_crusade_authorized` | 无 | 标记 | 标记 | 默认假 | `compute summit_motion`（`cut_a4_conclave` 段二） | `cut_a4_conclave` | 圣战授权通过 |
| `a4_revelation_beat` | 无 | 段落 | 枚举 | `stele`、`night`、`dawn`、`done`；默认未写入 | `cut_a4_conclave`、`A4-M14`；`cut_a4_revelation` | `cut_a4_revelation` | `cut_a4_revelation` 的段落旗标 |
| `director.a4_disputes_midway` | 无 | 镜像 | 整数 | 0 到 5；默认 0 | director：按五条纷争链的节点进度写 | `cut_a4_isomorphism` | 已进入中段的纷争数（分幕 7.1 的触发条件"至少两条纷争进入中段"） |

#### 8.8.6 第五幕

来源：过场目录第 9.3 节与第 10.6 节。

| 规范名 | 别名 | 种 | 类型 | 取值与默认 | 写入者 | 读取处 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `a5_seal_torn` | 无 | 标记 | 标记 | 默认假 | `cut_a5_mirror_a` | `cut_a5_route` | 撕封之夜，无貌者用门钥与门纹撕开封印一角（千门 6.4.2 的 +10 改挂此标记；M09-C08、S07-C04 的解锁途径） |
| `a5_other_at_door_done` | 无 | 标记 | 标记 | 默认假 | `cut_a5_mirror_a` | `cut_a5_mirror_a`、`cut_a5_mirror_c` | 梦境任务"门口的另一个人"完成（`A3-S39` 的第五幕阶段；救赎条件第四条；门口之门的梦中历钥） |
| `a5_mirror_a_beat` | 无 | 段落 | 枚举 | `tear`、`second`、`ask`；`tear_done`、`second_done`、`done`；默认未写入 | 请求方任务与 `cut_a5_mirror_a` | `cut_a5_mirror_a` | 段落旗标 |
| `a5_eska_beat` | 无 | 段落 | 枚举 | `quiet`、`crown`、`crown_yeyu`、`descent`、`tent`、`question`、`question_return`；`quiet_done`、`crown_done`、`descent_done`、`tent_done`、`question_done`、`done`；默认未写入 | 请求方任务与 `cut_a5_eska` | `cut_a5_eska` | 段落旗标 |
| `a5_eska_wait` | 无 | 出口 | 布尔 | 默认假 | `cut_a5_eska` | `cut_a5_eska` | 答"消化"而众门环未开工，待外围节点建成三处后复问 |
| `a5_eska_closed` | 无 | 标记 | 标记 | 默认假 | `cut_a5_eska` | 众门环节点 `R07` 的可用性（`ring_node.R07`） | 原龙已拒绝（答"清洗"或偷过龙的东西）；眠鳞碑下节点 `R07` 永久不可用 |
| `a5_confession_beat` | 无 | 段落 | 枚举 | `valda`、`altar`、`ferry`、`record`；`valda_done`、`altar_done`、`ferry_done`、`done`；默认未写入 | 请求方任务与 `cut_a5_confession` | `cut_a5_confession` | 段落旗标 |
| `a5_valda_pig` | 无 | 出口 | 枚举 | `made`、`butcher`、`silent`；默认未写入 | `cut_a5_confession` | 第六幕瓦尔妲的防线（可被行动说服的第一道裂缝）与瓦尔妲的题面 | 祭坛前对"你吃肉的时候，会给猪道歉吗"的回答；`made` 是第六幕瓦尔妲可被行动说服的第一道裂缝 |
| `a5_e09_relayed` | 无 | 标记 | 标记 | 默认假 | `cut_a5_confession` | `cut_a5_confession` | E09 由玩家转述取得（老船夫未出面），第六幕证据强度降一级 |
| `a5_moira_reason` | 无 | 出口 | 枚举 | `choose`、`child`、`defeat`；默认未写入 | `cut_a5_confession` | `cut_a5_confession` | 请求莫伊拉公开时给的理由（`defeat` 被拒） |
| `a5_luchen_beat` | 无 | 段落 | 枚举 | `chapel`、`shed`、`fall`；`chapel_done`、`done`；默认未写入 | 请求方任务与 `cut_a5_luchen` | `cut_a5_luchen` | 段落旗标 |
| `a5_luchen_answer` | 无 | 出口 | 枚举 | `strike`、`lay_down`、`sit`、`end_it`；默认未写入 | `cut_a5_luchen` | `cut_a5_luchen` | 礼拜堂里玩家对陆辰的回答 |
| `a5_luchen_collapsed_seen` | 无 | 标记 | 标记 | 默认假 | `cut_a5_luchen` | `cut_a5_mirror_c` | 玩家目睹陆辰崩溃却劝他"砍吧"；他执行终光时一缕古澱倒灌（后日谈的"下一轮的种子"） |
| `a5_luchen_node_invite` | 无 | 标记 | 标记 | 默认假 | `cut_a5_luchen` | `cut_a5_luchen` 段二（由玩家带去看节点） | 玩家邀请陆辰去看节点运转（段二由玩家带去） |
| `a5_luchen_shed_ok` | 无 | 标记 | 标记 | 默认假 | `compute a5_luchen_shed_check`（`cut_a5_luchen`） | `cut_a5_luchen` | 卸光判定的结果（计算 `a5_luchen_shed_check`，规则见条目） |
| `a5_luchen_death` | 无 | 出口 | 枚举 | `alone`、`purged`；默认未写入 | `cut_a5_luchen` | `hero_state.luchen == dead` 的死因分版、证据 E35、后日谈（`sep`） | 陆辰在决战前的死因：独闯主门坑，或被教国以叛教清除（并入 E35） |
| `a5_mirror_b_beat` | 无 | 段落 | 枚举 | `flag`、`talk`；`flag_done`、`done`；默认未写入 | 请求方任务与 `cut_a5_mirror_b` | `cut_a5_mirror_b` | 段落旗标 |
| `a5_mirror_b_refused` | 无 | 标记 | 标记 | 默认假 | `cut_a5_mirror_b` | 无貌者的镜像对白与救赎倾向 | 玩家拒绝了灰中对谈 |
| `a5_faceless_lean` | 无 | 出口 | 整数 | -2 到 5；默认 0 | `cut_a5_mirror_b`、`cut_a5_final_war` | `cut_a5_mirror_b`、`cut_a5_mirror_c` | 无貌者的救赎倾向（分幕 2.4 方向表；门歌 +1） |
| `a5_faceless_name_asked` | 无 | 标记 | 标记 | 默认假 | `cut_a5_mirror_b`、`cut_a5_final_war` | `cut_a5_mirror_c` | 玩家问过他的名字（救赎的必需项） |
| `a5_mb_dirs` | 无 | 出口 | 集合 | `empathy`、`rebut`、`name`、`mock`、`threat`、`waver`；默认空 | `cut_a5_mirror_b`、`cut_a5_final_war` | `a5_faceless_lean` 的计分（每个方向全幕只计一次） | 已用过的对话方向，每个方向全幕只计一次 |
| `a5_mb_round` | 无 | 出口 | 整数 | 1 到 3；默认 0 | `cut_a5_mirror_b` | `cut_a5_mirror_b` | 灰中对谈的轮次（场景内用） |
| `a5_faceless_waver` | 无 | 标记 | 标记 | 默认假 | `cut_a5_mirror_b` | `seal_points` +6、无貌者入梦的事件 | 玩家在灰中对谈里动摇（`seal_points` +6；他此后侵入玩家的梦） |
| `a5_route_beat` | 无 | 段落 | 枚举 | `plans`、`drawer`、`eve`；`plans_done`、`drawer_done`、`done`；默认未写入 | 请求方任务与 `cut_a5_route` | `cut_a5_route` | 段落旗标 |
| `a5_route_plan` | 无 | 出口 | 枚举 | `ring`、`both`、`god`；默认未写入 | `cut_a5_route` | `cut_a5_mirror_c` | 两份方案的意向：决定众门环是否开工、联军是否给勇者突击队让路；不是路线结果 |
| `a5_ring_built` | 无 | 出口 | 整数 | 0 到 7；默认 0 | `compute a5_ring_tally`（`cut_a5_route` 段三入口） | `cut_a5_route`、`cut_a5_final_war` | 决战前夜建成的节点数（计算 `a5_ring_tally`） |
| `a5_emperor_turned` | 无 | 标记 | 标记 | 默认假 | `cut_a5_route` | `cut_a5_final_war` | 剑帝在决战前夜宣布倒戈（第二回合他的兵转入东线我方） |
| `a5_fw_beat` | 无 | 段落 | 枚举 | `open`、`report`、`urgent`、`tear`、`song`、`descent`、`trio`、`home` 与各自的 `_done`；默认未写入 | combat 首领战与 strategy 战线回合（`bat_a5_final_war`）写起点；`cut_a5_final_war` 写 `_done` | `cut_a5_final_war`、`cut_a5_mirror_c` | 段落旗标 |
| `a5_fw_round` | 无 | 出口 | 整数 | 1 到 4；默认 0 | strategy 战线回合结算（`bat_a5_final_war`） | `cut_a5_final_war` | 刚结算完的战役回合 |
| `a5_fw_urgent_front` | 无 | 出口 | 枚举 | `north`、`east`、`south`、`ring`、`rear`；默认未写入 | strategy 战线回合结算（刚下急令的战线） | `cut_a5_final_war` | 刚下急令的战线 |
| `front_wait.<线>` | 无 | 族 | 布尔 | 键：`north`、`east`、`south`、`ring`、`rear`；默认假；每回合重算 | strategy 战线回合结算（待令判定，[战争目录][war]） | `cut_a5_final_war` | 本回合该线进入待令（分幕 7.3） |
| `a5_valda_ashclash` | 无 | 标记 | 标记 | 默认假 | goddess：越约窗口 `div_breach_valda_ashclash` 成立时（[女神目录][gi]） | `cut_a5_final_war` | 瓦尔妲的化身迎上神降（`div_breach_valda_ashclash` 触发） |
| `a5_tear_stopped` | 无 | 标记 | 标记 | 默认假 | combat：首领战 `faceless_king`（三块门石全部引导完成） | `cut_a5_final_war`、`cut_a5_mirror_c`（70% 撕门被阻止的分版） | 70% 的撕门被阻止（三块门石全部引导完成） |
| `a5_redeem_ready` | 无 | 标记 | 标记 | 默认假 | `cut_a5_mirror_c` | `cut_a5_mirror_c` | 最后一扇门打开时救赎条件齐（读她出手之前的封印值） |
| `a5_faceless_register_name` | 无 | 出口 | 文本 | 至多 8 字；空值"无名" | `cut_a5_mirror_c` | 第六幕传唤 E18 时的显示名 | 玩家在人簿上替他写下的名字（第六幕传唤 E18 时的显示名） |
| `a5_faceless_survived` | 无 | 出口 | 布尔 | 默认假 | `cut_a5_mirror_c` | `cut_a5_trial_called` | 救赎之后他活了下来（救赎·生）；假为救赎·逝 |
| `a5_alliance_races` | 无 | 出口 | 整数 | 0 到 7；默认 0 | `compute act5_outcome`（决战结算时写入联盟中的种族数） | `compute court_seat`（第六幕庭之席判定：联盟中至少五个种族） | 第五幕决战结束时联盟里的种族数 |

#### 8.8.7 第六幕

来源：过场目录第 10.3 节。

| 规范名 | 别名 | 种 | 类型 | 取值与默认 | 写入者 | 读取处 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `a6_sitting` | 无 | 出口 | 整数 | 1 到 6；默认 0 | 任务目录（后）`A6-M01` 到 `A6-M09` 进场时写 | `cut_a6_court_open`、`cut_a6_janu_intent`、`cut_a6_ask_back`、`cut_a6_verdicts` | 当前审理场次（开庭、指控、质证一、质证二、陈述、终审） |
| `a6_open_beat` | 无 | 段落 | 枚举 | `open`、`open_done`、`charges`、`done`；默认未写入 | 请求方 `A6-M01`、`A6-M02`；`cut_a6_court_open` | `cut_a6_court_open` | `cut_a6_court_open` 的段落旗标 |
| `a6_witness_for` | 无 | 出口 | 枚举 | `eluen`、`valda`、`merca`、`sylvie`、`moira`；默认未写入 | `compute court_seat`（`cut_a6_court_open`） | `cut_a6_court_open` | 证人身份时传唤玩家的女神（`a4_eluen_page` 时为艾琉恩，否则关系最高者） |
| `court.<司>.charged` | 无 | 族 | 标记 | 键：六位司掌者（含 `janu`）；默认假 | `cut_a6_court_open` | 质证玩法（立案的对象可主动出示证据） | 庭之席对她立案 |
| `a6_crisis` | 无 | 出口 | 枚举 | `no_light`、`residue_tide`、`contract_halt`、`winter_famine`、`record_silence`；默认未写入 | quests 审期结算（审期危机开始时，`src/systems/quests/endings.ts` 的 `CRISES`） | `cut_a6_descent` | 当前审期危机 |
| `a6_descent_beat` | 无 | 段落 | 枚举 | `door`、`gone`、`stay`、`back`、`report`、`done`；默认未写入 | 审期危机任务、下庭任务；`cut_a6_descent` | `cut_a6_descent` | `cut_a6_descent` 的段落旗标 |
| `a6_absence_cost` | 无 | 出口 | 枚举 | `unanswered`、`thicken`、`witness_missed`；默认未写入 | scenes 的 court（回庭时结算） | `cut_a6_descent` | 下庭缺席当场审理的代价（10.2 `cut_a6_descent` 变体表） |
| `a6_absence_witness` | 无 | 出口 | 文本 | 人物 ID；默认空 | scenes 的 court（回庭时结算） | `cut_a6_descent` 的变体（错过出庭的证人） | 因无人传唤而错过出庭的证人 |
| `a6_intent_beat` | 无 | 段落 | 枚举 | `rise_done`、`letgo`、`done`；默认未写入 | `cut_a6_janu_intent`、`cut_a6_earth_truth` | `cut_a6_janu_intent`、`cut_a6_ask_back` | `cut_a6_janu_intent` 的段落旗标 |
| `a6_janu_omissions_named` | 无 | 标记 | 标记 | 默认假 | `cut_a6_janu_intent` | 雅努放手的结算（`janu_release`）与雅努的台词 | 玩家把她没说的部分摆上了证物台 |
| `a6_letgo_speaker` | 无 | 出口 | 枚举 | `player`、`sylvie`；默认未写入 | `cut_a6_janu_intent` | 雅努与希尔薇的台词 | "放手不是丢弃"由谁说出 |
| `a6_corridor_fight` | 无 | 标记 | 标记 | 默认假 | `cut_a6_janu_intent` | `cut_a6_final_battles` | 她拒绝放手后，玩家选择在千门回廊迎战 |
| `a6_earth_told` | 无 | 出口 | 文本 | 至多 80 字；空值"（你没有说话，只是看着那颗星）" | `cut_a6_earth_truth` | 台词插槽（不进条件） | 前世记忆未交出时，玩家对地球的讲述（插槽用，不进条件） |
| `a6_verdict_beat` | 无 | 段落 | 枚举 | `claim`、`final`、`done`；默认未写入 | 内核审期回合结算、`A6-M09`；`cut_a6_verdicts` | `cut_a6_verdicts`、`cut_a6_letter7` | `cut_a6_verdicts` 的段落旗标 |
| `a6_claimant` | 无 | 出口 | 枚举 | 五位在任女神代号；默认未写入 | scenes 的 court（`compute court_verdicts` 在本场末有女神转为争掌时） | `cut_a6_verdicts` | 本场末新转为争掌的女神 |
| `a6_veto` | 无 | 出口 | 枚举 | `eluen`、`valda`、`merca`、`sylvie`、`moira`；默认未写入 | `cut_a6_verdicts`（`compute court_veto_claimant` 把 `a6_claimant` 写入） | `cut_a6_verdicts` | 庭之席否决了谁的争掌（全审一次） |
| `a6_sentence.<司>` | 无 | 族 | 枚举 | 键：五位在任女神；值 `exile`、`mortal_walk`、`handover`、`pardon`、`stay_mortal`；默认未写入 | `cut_a6_verdicts`（含证人身份的 `compute court_sentence_default`） | `cut_a6_verdicts`；后日谈（`sep`）与结局场景 | 量处：逐、凡行、交接令、赦、留凡 |
| `court.contenders` | 无 | 镜像 | 整数 | 0 到 5；默认 0 | `compute court_verdicts`（scenes 的 court） | `cut_a6_verdicts` | 当前争掌的在任女神数 |
| `a6_fb_beat` | 无 | 段落 | 枚举 | `avatar_open`、`avatar_stop`、`avatar_won`、`avatar_lost`、`sword_open`、`sword_tip`、`sword_won`、`sword_lost`、`corridor_open`、`corridor_close1`、`corridor_half`、`corridor_offer`、`corridor_won`、`corridor_lost`、`siege_open`、`siege_p2` 到 `siege_p5`、`siege_won`、`siege_lost`、`proxies_open`、`proxies_won`、`proxies_lost`、`gate_open`、`gate_won`、`gate_lost`、`rewrite_open`、`rewrite_fix`、`rewrite_won`、`hib_open`、`hib_found`、`reckon_open`、`reckon_offer1` 到 `reckon_offer3`、`godwar_open`、`godwar_saved`、`godwar_end`；默认未写入 | combat、解谜与谈判段、任务目录（后）`A6-M06`、`A6-M10`、`F-W01` 写起点；`cut_a6_final_battles` 写收尾值 | `cut_a6_final_battles` | `cut_a6_final_battles` 的段落旗标 |
| `a6_fb_result.<战>` | 无 | 族 | 枚举 | 键：`avatar`、`sword`、`corridor`、`siege`、`proxies`、`gate`、`rewrite`、`hibernate`、`reckon`、`godwar`；值 `won`、`lost`、`yielded`；默认未写入 | `cut_a6_final_battles` | `compute ending`（第六幕结局判定）、`compute court_verdicts`（`hibernate == won` 时保留 `verdict.sylvie = voluntary`） | 每场终战的结果（yielded 指对手停手或玩家接受权能） |
| `a6_sword_returned` | 无 | 标记 | 标记 | 默认假 | `cut_a6_final_battles` | `cut_a6_final_battles`、`cut_end_release`；后日谈（`sep`） | 断剑之约中把主门剑尖还给了瓦尔妲 |
| `court.valda.duel_accepted` | 无 | 族 | 标记 | 默认假 | `cut_a6_final_battles` | 瓦尔妲的终审与后日谈 | 接受了断剑之约（区别于打赢后的 `court.valda.duel`） |
| `a6_corridor_closed` | 无 | 出口 | 整数 | ≥ 0；默认 0 | combat：千门回廊之战（关上的门数） | `cut_a6_final_battles` | 千门回廊之战中关上的门数 |
| `a6_rewrite_fixed` | 无 | 出口 | 整数 | 0 到 3；默认 0 | scenes：改写终章的解谜段 | `cut_a6_final_battles` | 改写终章中已校正的页数 |
| `a6_letter7_told` | 无 | 标记 | 标记 | 默认假 | `cut_a6_letter7` | 夜羽的后日谈（`sep`） | 玩家把第七封信念给了夜羽 |

#### 8.8.8 终章与后日谈

来源：过场目录第 11.11、12.2.2 节。

| 规范名 | 别名 | 种 | 类型 | 取值与默认 | 写入者 | 读取处 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ep_guest.<人>` | 无 | 族 | 枚举 | 键：`aiden`、`luchen`、`yui`、`marcus`、`faceless`、`hart`、`sasha`、`ash`；值 `return`、`stay`、`follow`、`rest`；默认未写入（离手·未竟不写） | `cut_end_release` 的最后一扇门段落：`compute guest_choices` 写默认值，玩家选项与客人的 AI 在默认值附近覆盖 | `cut_end_release`；后日谈（`sep`） | 离手结局最后一扇门前每位客人的去留（D-074）。默认：艾登 `return`；陆辰、结衣、马库斯 `stay`（玩家选择回去时陆辰与结衣由各自 AI 再选一次）；无貌者由玩家代选；哈特与萨莎由各自 AI 按人格选择，萨莎倾向 `follow`；阿什默认 `rest`，玩家请求时 `stay` |
| `ep_cat_name` | 无 | 出口 | 文本 | 至多 8 字（经内容过滤）；空为"无" | `cut_end_release` | `cut_end_release`；后日谈与回到地球 B 的台词插槽 | 回到地球 B 时给猫起的名字（经内容过滤） |
| `ep_old_chair_taken` | 无 | 出口 | 布尔 | 默认假 | `cut_end_release` | 后日谈（`sep`） | 回到地球 D 时搬走了旧椅子 |
| `companion.<人>.lost` | 无 | 镜像 | 标记 | 键：人物 ID；默认假 | party：铁人规则下的死亡结算与剧情离队结算（希雅留在草原、奈拉站到梅尔卡一边、卡西安走狂热线、艾登投门徒会未悔悟、妮蒂拉随战首派离开） | 后日谈（`sep`） | 永久失去。死亡另写 `npc.<人>.dead`，两者区分"死了"与"走了"；剧情死亡有专用变量时同时读专用变量 |

#### 8.8.9 已登记变量的过场读写索引

下表按过场列出它写入与读取的已登记变量（规范名；只列条件与效果里出现的变量，过场自己新建的变量见上面八张表）。这些变量的写入者与读取处在本表原行的基础上加上对应的过场；与原行的"首次写入"不同的，以本节为补充。

| 过场 | 写入 | 读取 |
| --- | --- | --- |
| `cut_p_earth` | `p_courtyard_object`、`p_default_past_life`、`p_door_attempts_refused`、`p_earth_opening`、`p_earth_relic`、`p_mode` | `cycle` |
| `cut_p_door_white` | `p_appearance`、`p_door_attempts_refused`、`p_heard_neighbors`、`p_mirror_done` | `cycle`、`p_earth_opening`、`scene.cut_p_earth.seen` |
| `cut_p_quarrel` | `p_eavesdrop_level` | `p_heard_neighbors`、`p_mirror_done` |
| `cut_p_call` | `p_asked_sixth_chair`、`p_free.call`、`player.name` | `cycle`、`p_eavesdrop_level`、`scene.cut_p_quarrel.seen` |
| `cut_p_interview` | `p_answers`、`p_courtyard_object`、`p_door_hints`、`p_earth_anchor_trigger`、`p_interview_done`、`p_merca_valuation`、`p_past_life_door` | `p_earth_relic`、`scene.cut_p_call.seen` |
| `cut_p_judgement` | `p_coin_terms`、`p_free.appraise`、`p_moira_page_anomaly`、`p_rejection_response` | `cycle`、`p_interview_done`、`p_merca_valuation` |
| `cut_p_discard` | `p_caught`、`p_discarded`、`p_eluen_believes_dead`、`p_last_words`、`p_reached_out`、`seal_unrest` | `scene.cut_p_judgement.seen` |
| `cut_a1_wake` | `a1_wake_ruins` | `door.awaken`、`p_asked_sixth_chair`、`p_earth_opening` |
| `cut_a1_ash_glimpse` | `a1_ash_met`、`a1_ash_page`、`seal_unrest` | `act_week`、`companion.yeyu.recruited`、`scene.cut_a1_ash_glimpse.seen` |
| `cut_a1_raven` | `boss.guardian_raven.defeated` | `a1_ash_met`、`scene.cut_a1_raven.seen` |
| `cut_a1_yeyu_bound` | `a1_yeyu_bound`、`seal_unrest`、`trust.yeyu` | `boss.guardian_raven.defeated`、`door.pact`、`p_reached_out` |
| `cut_a1_town` | `npc.martha.assessment`、`trust.barto` | `a1_yeyu_bound` |
| `cut_a1_guild` | `a1_guild_registered`、`npc.bron.story_level`、`trust.bron` | `companion.yeyu.recruited` |
| `cut_a1_talent` | `npc.<人>.potential_seen` | `door.talent_sight`、`scene.cut_a1_talent.seen`、`boss.crystal_mother.defeated`、`companion.ron.recruited`、`companion.shiya.recruited`、`trust.shiya` |
| `cut_a1_trial` | `a1_cassian_appraise`、`a1_children_exposed`、`a1_lamp_exposed`、`a1_oola_fate`、`a1_orphan_mark_seen`、`church_suspicion`、`npc.cassian.doubt`、`npc.martha.assessment`、`trust.oola`、`trust.toma` | `a1_forest_accord`、`a1_spring_source_found`、`a1_witch_trial_started`、`act_week`、`scene.cut_a1_trial.seen`、`trust.bron` |
| `cut_a1_yeyu_memory` | `npc.yeyu.memory_shards`、`term.dian_known` | `a1_tide_omen`、`act_week`、`companion.yeyu.recruited`、`p_eavesdrop_level`、`scene.cut_a1_yeyu_memory.seen` |
| `cut_a1_tide` | `a1_oola_fate`、`church_suspicion`、`danger_doors_opened`、`seal_unrest`、`trust.yeyu` | `a1_forest_accord`、`a1_toby_state`、`boss.dian_colossus.defeated`、`door.vocation_druid`、`npc.cassian.doubt`、`trust.isa` |
| `cut_a1_martha` | `a1_martha_strike`、`a1_tide_credit`、`npc.martha.revealed` | `a1_bs_survival`、`a1_lin_state`、`a1_moss_fate`、`a1_toby_state`、`church_suspicion`、`npc.<人>.dead`、`npc.martha.assessment` |
| `cut_a1_dream` | `a1_dream_door_woman`、`a1_janu_dream_answer` | `a1_beast_tide_cleared`、`p_courtyard_object`、`p_earth_opening`、`p_reached_out` |
| `cut_a1_mark` | `a1_bron_sees_mark`、`npc.bron.secret_kept`、`npc.yeyu.memory_shards` | `a1_children_safe`、`companion.yeyu.recruited`、`npc.bron.story_level`、`p_courtyard_object`、`p_earth_opening`、`trust.bron` |
| `cut_a1_letter` | `a1_count_letter`、`act` | `a1_bron_sees_mark`、`a1_moss_fate`、`a1_tide_credit`、`act_week`、`companion.yeyu.recruited`、`scene.cut_a1_letter.seen`、`trust.ron` |
| `cut_a2_arrival` | `a2_arrive_valen`、`a2_selene_met` | `church_suspicion`、`companion.ron.recruited`、`companion.shiya.recruited`、`companion.yeyu.recruited`、`npc.bron.secret_kept` |
| `cut_a2_exam` | `a2_promotion_exam`、`a2_selene_met`、`guild_rank`、`trust.reynard` | `boss.rat_king.defeated`、`church_suspicion`、`companion.yeyu.recruited`、`npc.bron.secret_kept` |
| `cut_a2_heroes` | `a2_heroes_met`、`a2_selene_met`、`a2_told_heroes_earth`、`a2_yui_saw_light`、`goddess.eluen.gaze`、`trust.luchen`、`trust.marcus`、`trust.yui` | `a2_arrive_valen`、`act_week`、`church_suspicion`、`companion.yeyu.recruited` |
| `cut_a2_dream_w4` | `scene.cut_a2_dream_w4.seen` | `companion.yeyu.recruited`、`scene.cut_a2_heroes.seen`、`seal_looseness` |
| `cut_a2_ferryman` | `a2_ferryman_reveal`、`a2_rescued_children`、`trust.ferryman` | `act_week`、`companion.yeyu.recruited`、`door.talent_sight`、`scene.cut_a2_ferryman.seen` |
| `cut_a2_dream_w10` | 无 | `act_week`、`companion.yeyu.recruited`、`scene.cut_a2_dream_w10.seen`、`scene.cut_a2_dream_w4.seen`、`scene.cut_a2_selene_trial.seen`、`seal_looseness` |
| `cut_a2_selene_trial` | `a1_oola_fate`、`a2_trial_outcome`、`church_verdict`、`goddess.eluen.gaze`、`npc.selene.evidence`、`npc.selene.stance`、`trust.aiden`、`trust.luchen`、`trust.marcus`、`trust.selene`、`trust.yui` | `a2_mirror_fooled`、`act_week`、`church_suspicion`、`companion.shiya.recruited`、`companion.yeyu.recruited`、`npc.cassian.doubt`、`scene.cut_a2_selene_trial.seen` |
| `cut_a2_funeral` | `a1_oola_fate`、`a2_faceless_projection`、`a2_poisoner_exposed`、`a2_signet_holder`、`a2_trial_outcome`、`goddess.eluen.gaze`、`ironman`、`npc.faceless.interest`、`npc.selene.stance` | `a2_count_poison_found`、`act_week`、`companion.yeyu.recruited` |
| `cut_a2_arrest` | `a2_player_arrested`、`a2_arrest_choice.aiden`、`a2_arrest_choice.luchen`、`a2_arrest_choice.marcus`、`a2_arrest_choice.yui`、`church_verdict`、`goddess.eluen.gaze`、`trust.aiden`、`trust.luchen`、`trust.marcus`、`trust.selene`、`trust.yui` | `a2_faceless_projection`、`a2_trial_outcome`、`act_week`、`npc.selene.stance`、`rep.antlers`、`scene.cut_a2_arrest.seen` |
| `cut_a2_siege` | `a2_charter_found`、`a2_emil_fate`、`a2_signet_holder`、`a2_wb_ruler`、`church_verdict`、`npc.faceless.interest`、`npc.selene.evidence`、`npc.selene.stance`、`trust.dris`、`trust.ron`、`trust.rudolf`、`trust.selene` | `a2_arrest_choice.luchen`、`a2_arrest_choice.marcus`、`a2_blank_chronicle`、`a2_poisoner_exposed`、`a2_trial_outcome`、`act_week`、`boss.doorsealer_construct.defeated`、`companion.shiya.recruited`、`companion.yeyu.recruited`、`scene.cut_a2_arrest.seen`、`trust.ferryman`、`trust.luchen` |
| `cut_a2_no_page` | `a2_aiden_no_page`、`a2_aiden_report`、`a2_ferryman_ninth`、`npc.ferryman.bond`、`trust.aiden`、`trust.ferryman`、`trust.pia` | `a2_rumor_shape`、`companion.yeyu.recruited` |
| `cut_a2_barony` | `a2_barony_granted`、`yeyu_letters` | `a2_ferryman_ninth`、`a2_wb_ruler`、`companion.yeyu.recruited` |
| `cut_a3_domain` | `a3_seat`、`a3_thousand_gate` | `war.first_battle_won`、`a1_moss_fate`、`a2_barony_granted` |
| `cut_a3_audience` | `church_suspicion`、`trust.philip` | `companion.yeyu.recruited`、`scene.cut_a3_audience.seen` |
| `cut_a3_massacre` | `a3_marcus_shield_dark`、`a3_massacre_witnessed`、`a3_reedpond_outcome`、`church_suspicion`、`cult_keys`、`hero_state.marcus`、`trust.luchen`、`trust.marcus` | `a2_aiden_report`、`npc.selene.stance` |
| `cut_a3_sundering` | `a3_ash_tells_sundering`、`a3_defaced_stele_found` | `a1_ash_met`、`a1_dream_door_woman`、`a2_archivist_met`、`a3_archive_sealed_room`、`companion.yeyu.recruited`、`door.door_tide_sight` |
| `cut_a3_warning` | `a3_ash_relation`、`a3_ash_warning_doors`、`a3_blank_era_fragments`、`a3_seal_aware` | `a3_ash_tells_sundering`、`companion.yeyu.recruited`、`seal_looseness` |
| `cut_a3_crown_falls` | `a3_philip_fate` | `a3_debt_holder`、`a3_drake_fate`、`a3_physician_testimony` |
| `cut_a3_ashen_line` | `a3_ash_exile`、`a3_church_verdict`、`a3_holy_war_miracle`、`a3_luchen_lowered_sword`、`a3_vow_kept_reed_bridge`、`hero_state.luchen`、`trust.luchen` | `a2_heroes_saw_power`、`a2_wb_ruler`、`a3_archbishop_fate`、`a3_ash_relation`、`a3_ash_warning_doors`、`a3_ashline_route`、`a3_eluen_violation`、`a3_empire_view`、`a3_jorg_home_visit`、`a3_massacre_witnessed`、`a3_migrants_status`、`a3_north_status`、`a3_philip_fate`、`a3_ron_confessed`、`a3_sasha_interest`、`a3_sasha_result`、`door.door_resonance`、`hero_state.aiden`、`hero_state.marcus`、`hero_state.yui` |
| `cut_a3_eluen_speaks` | `a3_eluen_speaks`、`a3_sasha_retreat_line`、`yeyu_letters` | `a2_heroes_saw_power`、`a3_archbishop_fate`、`a3_ash_exile`、`a3_ash_tells_sundering`、`a3_eluen_violation`、`a3_sasha_interest`、`companion.yeyu.recruited` |
| `cut_a3_map` | `door_hint.door_founding`、`trust.philip` | `a3_ash_exile`、`a3_ash_relation`、`a3_ash_tells_sundering`、`a3_drake_fate`、`a3_eluen_speaks`、`a3_empire_view`、`a3_lothar_ending`、`a3_north_status`、`a3_philip_fate`、`a3_wb_status`、`companion.yeyu.recruited` |
| `cut_a4_founding` | `a4_claim`、`a4_f_king`、`a4_nation_founded`、`territory_autonomy` | `a3_ash_exile`、`a3_lothar_ending`、`a4_boundstone_groups`、`companion.yeyu.state`、`door_state.founding` |
| `cut_a4_feast` | `a4_feast_answer`、`a4_feast_of_strong`、`a4_night_pact`、`a4_sasha_stance`、`npc.emperor.respect`、`stance.grantia`、`stance.night`、`trust.elwin`、`trust.night_queen` | `a3_sasha_result`、`companion.yeyu.state` |
| `cut_a4_versions` | `a4_eluen_page_considered`、`a4_goddess_versions_heard`、`a4_refused_to_let_go` | `a1_oola_fate`、`a3_ash_exile`、`a3_cassian_state`、`a4_feast_answer`、`a4_nation_founded` |
| `cut_a4_key_theft` | `a4_key_theft_exposed`、`a4_merca_door_keys`、`a4_nera_exposed`、`a4_player_door_keys`、`a4_remnant_door_keys`、`autonomy`、`cult_door_keys`、`key_fate.k3`、`key_fate.k5`、`key_fate.k6`、`trust.nera` | `a2_company_partner`、`a3_seal_aware`、`companion.nera.state`、`companion.yeyu.state` |
| `cut_a4_valda_offer` | `a4_goddess_versions_heard`、`a4_valda_alliance_offer`、`yeyu_letters` | `a4_feast_of_strong` |
| `cut_a4_isomorphism` | `a4_moira_isomorphism`、`a4_moira_trade_records`、`goddess.moira.gaze`、`lie_exposed.moira`、`moira_pages`、`yeyu_letters` | `a1_oola_fate`、`companion.yeyu.state`、`deed.deed_god_five_offers`、`nation.polity` |
| `cut_a4_edict` | `a4_selene_stance`、`autonomy`、`trust.selene` | `a3_cassian_state`、`a3_church_verdict`、`a3_selene_stance`、`a3_selene_tremble_told`、`a4_eluen_page`、`a4_feast_answer`、`companion.yeyu.state`、`npc.emperor.respect` |
| `cut_a4_conclave` | `a4_allies`、`a4_conclave_done`、`a4_elwin_witness`、`a4_heresy_state`、`a4_summit_bloodshed`、`a4_summit_result`、`a4_tavi_seated`、`autonomy_bonus`、`continent`、`econ_indep`、`stance.holysee`、`stance.night` | `a3_lothar_ending`、`a4_beast_king`、`a4_econ_vassal`、`a4_hart_state`、`a4_moira_isomorphism`、`a4_night_pact`、`a4_refuge_state`、`a4_sasha_stance`、`a4_summit_convener`、`companion.yeyu.state`、`cult_door_keys`、`npc.emperor.respect`、`npc.tavi.dead`、`trust.elwin`、`trust.philip` |
| `cut_a4_revelation` | `a4_revelation_ash_full` | `a3_ash_relation`、`a3_church_verdict`、`a3_defaced_stele_found`、`a4_lies_exposed`、`a4_star_records`、`a4_summit_result`、`companion.yeyu.state`、`evidence.E02`、`evidence.E08`、`lie_exposed.sylvie` |
| `cut_a5_mirror_a` | `seal_points` | `a3_doorway_dream`、`a4_nation_founded`、`companion.yeyu.state`、`cult_door_keys`、`cult_keys`、`npc.faceless.interest` |
| `cut_a5_eska` | `a5_demon_king_born`、`a5_eska_consent`、`a5_eska_descends` | `a3_lothar_ending`、`a4_allies`、`a4_night_pact`、`a4_refuge_state`、`a4_summit_result`、`companion.yeyu.state`、`has.ky_unclasped_talon`、`ring_node.R01`、`ring_node.R02`、`ring_node.R03`、`ring_node.R04`、`ring_node.R05`、`ring_node.R06`、`title.title_infamy_grave_robber` |
| `cut_a5_confession` | `a5_moira_published`、`a5_truth_purge_cycle` | `a4_night_pact`、`a4_summit_result`、`companion.yeyu.state`、`goddess.moira.relation`、`hero_state.luchen`、`moira_pages`、`npc.ferryman.bond` |
| `cut_a5_luchen` | `hero_state.luchen` | `companion.yeyu.state`、`hero_state.marcus`、`hero_state.yui`、`ring_node.R01` |
| `cut_a5_mirror_b` | `a5_blood_for_key`、`seal_points` | `companion.ron.state`、`companion.yeyu.state`、`doors_opened`、`npc.faceless.interest`、`p_earth_opening` |
| `cut_a5_route` | `a5_ash_drawer`、`hero_state.aiden` | `a4_sasha_stance`、`a4_summit_result`、`companion.yeyu.state`、`door.thousand_paths`、`has.relic_badge`、`has.relic_key`、`has.relic_mint`、`has.relic_receipt`、`hero_state.luchen`、`npc.emperor.respect`、`p_earth_relic`、`trust.ash` |
| `cut_a5_final_war` | `a5_yui_descent` | `a1_beast_tide_cleared`、`a4_sasha_stance`、`a4_summit_result`、`breach_count`、`companion.yeyu.state`、`front.east`、`front.north`、`front.rear`、`front.ring`、`front.south`、`hero_state.luchen`、`hero_state.marcus`、`hero_state.yui`、`p_earth_opening` |
| `cut_a5_mirror_c` | `a5_faceless_end`、`a5_faceless_named`、`a5_final_battle_done`、`a5_purify_success`、`hero_state.luchen`、`janu_faith` | `a5_gate_ring`、`a5_janu_act`、`a5_sasha_fate`、`door.bond_yeyu`、`evidence.E17`、`front.east`、`front.north`、`front.rear`、`front.ring`、`front.south`、`has.ky_unclasped_talon`、`hero_state.aiden`、`hero_state.marcus`、`hero_state.yui`、`p_reached_out`、`seal_looseness` |
| `cut_a5_trial_called` | `a5_revelation_trial`、`yeyu_letters` | `a5_final_battle_done`、`companion.shiya.state`、`front.rear` |
| `cut_a6_court_open` | `a6_court_open`、`a6_court_seat`、`a6_name_spoken` | `a4_eluen_page`、`a5_eska_consent`、`goddess.sylvie.enmity`、`p_last_words`、`p_rejection_response`、`player.name` |
| `cut_a6_descent` | `a6_descents`、`review.contract_halt.descend`、`review.no_light.descend`、`review.record_silence.descend`、`review.residue_tide.descend`、`review.winter_famine.descend` | `a6_review_score`、`review.contract_halt`、`review.no_light`、`review.record_silence`、`review.residue_tide`、`review.winter_famine` |
| `cut_a6_janu_intent` | `a6_janu_intent_revealed`、`a6_janu_release`、`a6_janu_restore_chosen`、`a6_janu_supports`、`a6_player_absorb`、`court.janu.e32`、`court.player_lets_go`、`court.tavi_called`、`witness_called.ash`、`witness_called.tavi` | `a3_seal_aware`、`a5_faceless_end`、`a5_gate_ring`、`a5_janu_act`、`a6_court_seat`、`companion.yeyu.recruited`、`court.collapsed`、`evidence.E17`、`evidence.E18`、`evidence.E32`、`verdict.sylvie`、`yeyu_letters` |
| `cut_a6_joint_reading` | `a6_charter_read`、`a6_spring_memory` | `a5_eska_consent`、`a6_janu_intent_revealed`、`evidence.E19`、`evidence.E31`、`verdict.sylvie` |
| `cut_a6_earth_truth` | `a6_earth_truth`、`witness_called.ash` | `a3_ash_tells_sundering`、`a6_charter_read`、`a6_court_seat`、`merca_offerings`、`npc.ash.dead`、`p_earth_opening` |
| `cut_a6_ask_back` | 无 | `a6_court_seat`、`a6_janu_release`、`p_answers`、`p_asked_sixth_chair`、`scene.cut_a6_ask_back.seen`、`verdict.eluen`、`verdict.merca`、`verdict.moira`、`verdict.sylvie`、`verdict.valda` |
| `cut_a6_verdicts` | `a6_god_war`、`a6_god_war_clock`、`a6_patron`、`court.collapsed` | `a6_court_seat`、`a6_janu_release`、`verdict.eluen`、`verdict.merca`、`verdict.moira`、`verdict.sylvie`、`verdict.valda` |
| `cut_a6_final_battles` | `a6_god_war`、`a6_god_war_saved`、`a6_janu_release`、`a6_patron`、`a6_player_absorb`、`a6_returned_doors_pre`、`a6_spring_memory`、`court.valda.duel`、`verdict.eluen`、`verdict.merca`、`verdict.moira`、`verdict.sylvie`、`verdict.valda` | `a6_janu_intent_revealed`、`a6_janu_restore_chosen`、`evidence.E19` |
| `cut_a6_letter7` | `a6_letter7_delivered`、`player.name` | `a6_god_war`、`a6_god_war_saved`、`a6_janu_release`、`a6_janu_restore_chosen`、`a6_player_absorb` |
| `cut_end_release` | `a6_returned_doors`、`ep_earth_message_replied`、`ep_hidden_ending`、`ep_player_returned`、`ep_shown`、`ep_yeyu_stayed` | `a1_oola_fate`、`a4_nation_founded`、`a5_faceless_end`、`a6_letter7_delivered`、`a6_release_tone`、`a6_returned_doors_pre`、`companion.nera.recruited`、`companion.ron.recruited`、`companion.shiya.recruited`、`companion.yeyu.recruited`、`hero_state.luchen`、`hero_state.marcus`、`hero_state.yui`、`mysteries_all`、`npc.ash.dead`、`npc.bron.dead`、`npc.faceless.dead`、`npc.luchen.dead`、`npc.marcus.dead`、`npc.martha.dead`、`npc.nera.dead`、`npc.oola.dead`、`npc.ron.dead`、`npc.shiya.dead`、`npc.yui.dead`、`p_earth_opening`、`verdict.eluen`、`verdict.merca`、`verdict.moira`、`verdict.sylvie`、`verdict.valda`、`witness_called.ash`、`yeyu_letters` |
| `cut_end_release_unfinished` | `ep_court_keeper`、`ep_shown` | `a5_gate_ring`、`a5_held_unaided`、`a5_janu_act`、`a5_purge_route`、`a6_review_score`、`companion.yeyu.recruited`、`front.east`、`front.north`、`front.rear`、`front.ring`、`front.south` |
| `cut_end_new_god` | `ep_new_god_disposal`、`ep_ruler`、`ep_shown` | `a1_oola_fate`、`companion.nera.recruited`、`companion.ron.recruited`、`companion.shiya.recruited`、`companion.yeyu.recruited`、`npc.cassian.dead`、`npc.nera.dead`、`npc.oola.dead`、`npc.ron.dead`、`npc.shiya.dead` |
| `cut_end_rule_eluen` | `ep_ruler` | `a1_oola_fate`、`a6_patron`、`companion.ron.recruited`、`companion.shiya.recruited`、`companion.yeyu.recruited`、`npc.cassian.dead`、`npc.cassian.path`、`npc.oola.dead`、`npc.ron.dead`、`npc.shiya.dead` |
| `cut_end_rule_valda` | `ep_ruler` | `a1_oola_fate`、`a5_sasha_fate`、`a6_patron`、`companion.ron.recruited`、`companion.shiya.recruited`、`companion.yeyu.recruited`、`npc.oola.dead`、`npc.ron.dead`、`npc.sasha.dead`、`npc.shiya.dead` |
| `cut_end_rule_merca` | `ep_ruler` | `a1_oola_fate`、`a4_hart_state`、`a6_patron`、`companion.nera.recruited`、`companion.ron.recruited`、`companion.yeyu.recruited`、`npc.hart.dead`、`npc.nera.dead`、`npc.oola.dead`、`npc.ron.dead` |
| `cut_end_rule_sylvie` | `ep_ruler` | `a1_oola_fate`、`a6_patron`、`companion.ron.recruited`、`companion.shiya.recruited`、`companion.yeyu.recruited`、`npc.cassian.dead`、`npc.oola.dead`、`npc.ron.dead`、`npc.shiya.dead` |
| `cut_end_rule_moira` | `ep_ruler` | `a6_patron`、`companion.nera.recruited`、`companion.ron.recruited`、`companion.shiya.recruited`、`companion.yeyu.recruited`、`npc.nera.dead`、`npc.ron.dead`、`npc.shiya.dead` |
| `cut_end_janu_restored` | `ep_shown` | `companion.ron.recruited`、`companion.shiya.recruited`、`companion.yeyu.recruited`、`npc.ron.dead`、`npc.shiya.dead`、`npc.tavi.dead` |
| `cut_end_reclaim` | `cycle`、`ep_shown` | `a6_god_war`、`p_reached_out` |
| `cut_end_maker` | `ep_maker_room_seen`、`ep_shown` | `a6_returned_doors`、`ep_hidden_ending`、`ep_player_returned`、`mysteries_all` |

读写的分工：`cut_a1_talent` 用 `scene.cut_a1_talent.seen` 判断本场已播，`door.talent_sight` 由门系统写入；`war.first_battle_won` 由 warfare 在骨原夜袭罗恩举旗的那一刻写入（第 8.6 节），`cut_a3_domain` 只读；序章的 `p_mirror_done`、`p_heard_neighbors`、`p_asked_sixth_chair`、`p_reached_out` 默认为假，不由开场写入（标记不回写为假，第 9.3 节第 6 条）；门族的键写门 ID，过场目录里的门目录代号按第 7.8 节的别名导入。

### 8.9 信号

| 规范名 | 类型 | 取值 | 写入者 | 消费者 |
| --- | --- | --- | --- | --- |
| `scene.pending` | 文本 | 场景 ID | quests 的 `scene` 效果、幕切换 | scenes 播放后清除 |
| `war.pending` | 文本 | 战场剧本 ID | quests 的 `war` 效果 | warfare 开战后清除 |
| `combat.wave.<波次>` | 枚举 | `go` | quests 的 `wave` 效果 | combat 生成波次后清除，状态转入 `combat.wave.<波次>.state` |
| `order.moral_tag` | 枚举 | `kill_surrender`、`rob_civilians`、`break_pact`、`desecrate`、`harm_children` | 队伍命令处理器（读后即清） | 同伴拒绝命令的台词与羁绊结算（[同伴 8.5][cmp]、[内置 AI 11.2][bai]） |

## 9. `data/registry/vars.json`

### 9.1 结构

```json
{
  "version": 1,
  "vars": [
    {
      "name": "seal_looseness",
      "kind": "num",
      "scope": "global",
      "range": [0, 100],
      "step": 0.5,
      "default": 0,
      "values": null,
      "aliases": ["door_seal", "janu.seal_loosening", "SEAL"],
      "writers": ["doors", "content", "goddess"],
      "readers": ["quests", "goddess", "scenes", "ledger"],
      "derive": null,
      "monotone": false,
      "act": null,
      "visibility": "hidden",
      "ai": "ledger",
      "label": "var.seal_looseness",
      "source": "docs/30_story/reveal_ledger.md"
    }
  ],
  "families": [
    {
      "pattern": "trust.<npc>",
      "keyDomain": "npc",
      "kind": "int",
      "range": [0, 100],
      "default": "persona.attitude",
      "aliases": ["bond.<npc>", "trust.ola=trust.oola", "trust.vespera=trust.night_queen"],
      "writers": ["npc", "content"],
      "readers": ["doors", "quests", "ledger", "scenes"],
      "visibility": "player",
      "ai": "prompt"
    }
  ],
  "valueAliases": {
    "a5_purge_route": { "gods": "god" },
    "verdict.*": { "willing": "voluntary", "refused": "refuse", "claimant": "contend" }
  },
  "conversions": [
    { "from": "merca_favor", "to": "goddess.merca.relation", "scale": 25, "offset": 0 },
    { "from": "hero_rel_<npc>", "to": "trust.<npc>", "scale": 0.5, "offset": 50 },
    { "from": "faction_rep_<faction>", "to": "rep.<faction>", "scale": 33, "offset": 0 },
    { "from": "town_trust.<group>", "to": "rep.bs_<group>", "scale": 2, "offset": -100 }
  ],
  "keyDomains": {
    "npc": "data/npc/personas.json#id",
    "goddess": ["eluen", "valda", "merca", "sylvie", "moira", "janu"],
    "door": "data/doors/doors.json#id",
    "item": "content.items#id",
    "evidence": "data/scenes/evidence.json#id",
    "quest": "data/quests/quests.json#id"
  }
}
```

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `kind` | `flag`、`bool`、`int`、`num`、`enum`、`set`、`text`、`tick` | 第 3 节 |
| `scope` | `builtin`、`global`、`act_exit`、`act_flag`、`family`、`mirror`、`signal` | 第 2.2 节 |
| `act` | 0 到 7 或 null | 幕前缀量所属的幕（`p_` 为 0，`ep_` 为 7） |
| `values` | 字符串数组 | 枚举值集 |
| `writers`、`readers` | 系统名、`content`、`ledger`、`ai_prompt`、`ui` | 第 4 节 |
| `derive` | 条件文法里的函数表达式，或带四则运算的公式 | 只有派生量有 |
| `visibility` | `player`、`hidden` | 界面是否显示 |
| `ai` | `prompt`、`ledger`、`none` | `prompt` 直接进题面；`ledger` 只经台账线索进入；`none` 不进 |
| `label` | 文本键 | 中文名走字符串表（D-077） |

### 9.2 生成与归属

- `data/registry/vars.json` 由本文第 7、8 节生成：构建脚本 `tools/registry/build.ts` 读取本文的表格，产出 JSON 与一份 `docs` 侧的校验报告；
  本文是设计源，JSON 是数据，二者由构建步骤保持一致（与图集、门阶曲线同样的"文档定数，脚本生成"做法）。
- 新变量先登记到本文，再写进内容；任务目录与系统文档新登记的变量（例：任务目录（后）第 1.4 节的变量）在同一次改动里补进本文第 8 节。

### 9.3 内容校验规则

内容校验（`src/editor/checks/` 与测试）对下列规则逐条检查；"错误"阻止构建，"警告"进报告。

| 序 | 规则 | 级别 |
| --- | --- | --- |
| 1 | 每个被读取或写入的名字（条件、效果 `key`、门钥 `flag`、`requiresFlags`、`endOnFlag`、`pacifiedBy`、`removeOnFlag`、`storeAs`、`from`、`trustKey`、`evidenceFlags`、`revealWhen`、`hideWhen`）都能解析到规范名或族成员 | 错误 |
| 2 | 族成员的键属于该族的键域（人物 ID、门 ID、物品 ID、证据编号等） | 错误 |
| 3 | 使用别名：M0 到 M1 为警告并自动换成规范名；M2 起为错误 | 警告到错误 |
| 4 | 条件能被 `checkCondition` 解析；枚举字面量在值集内；`HAS` 的左项是集合；`IN` 的列表项在值集内 | 错误 |
| 5 | 写入的值类型与 `kind` 一致；数值写入在 `range` 内；`add` 只用于 `int`、`num`；`append` 只用于 `set` | 错误 |
| 6 | 剧情标记（`flag`）不被写为假 | 错误 |
| 7 | 幕前缀的量（`a<n>_`）只由第 n 幕或之后的内容读取；只由第 n 幕的内容写入（结算快照与第 n 幕的派生除外） | 错误 |
| 8 | 写入者在 `writers` 内；系统镜像不被内容效果写入 | 错误 |
| 9 | 派生量不被写入 | 错误 |
| 10 | 每个登记的变量至少有一个写入点与一个读取点（读取者含 `ledger`、`ai_prompt`、`ui` 也算） | 警告 |
| 11 | 可见的枚举值都有文本键 `var.<名>.<值>` | 警告 |
| 12 | 数据层不出现中文枚举值 | 错误 |
| 13 | 台账线索（`data/quests/lore.json`）与称谓（`data/quests/terms.json`）的 `unlock` 只引用已登记的名字 | 错误 |
| 14 | 名字符合第 2.1 节的正则与长度 | 错误 |

### 9.4 运行期

- 加载器在内容装载时把别名与值别名换成规范名，把 `bond.<人>.<N>` 换成 `trust.<人> >= N`，把换算别名按 `conversions` 改写比较的阈值。
- 解析器 `flagResolver` 对未写入的名字返回注册表默认值。
- 开发构建里 `setFlag` 写入未登记的名字时抛错；发布构建只记日志。

## 10. 迁移（M0）

| 步 | 内容 | 产出 |
| --- | --- | --- |
| 1 | 生成 `data/registry/vars.json`（第 9.2 节），加载器启用别名解析 | 现有数据不改也能跑 |
| 2 | 迁移批次：按第 7 节把 `data/` 里的别名、值别名、中文枚举值换成规范写法；任务 ID 换成第 6.2 节的数据编号 | 数据零别名 |
| 3 | 代码里的字面键与模板键（`src/systems/**`）换成规范名：例 `verdict_${g}` 到 `verdict.${g}`、`front_${f}` 到 `front.${f}`、`npc.focus.` 到 `ai.focus.`、`city.village_founded` 到 `a2_village_founded`、`slg.nation_founded` 到 `a4_nation_founded`、`purge_route` 等第 8.4 节的出口量加幕前缀 | 代码零别名 |
| 4 | 文档：揭示台账、分幕文档、任务与事件、目录里的别名按第 7 节换成规范名 | 文档零别名 |
| 5 | 校验第 9.3 节第 3 条在 M2 起升为错误 | 防回退 |

迁移前后世界哈希一致是验收条件：同一种子同一命令序列，迁移前后的回放在别名换算后得到相同的世界状态（D-071 的回放测试）。

## 11. 导入修正清单（现有数据与本表的出入）

| 文件 | 位置 | 现状 | 修正 |
| --- | --- | --- | --- |
| `data/npc/personas.json` | `oola.hideWhen` | `a1_oola_fate=convicted` 等三处用单个等号，求值器无法解析 | 写成 `a1_oola_fate == convicted`，或合成 `a1_oola_fate IN (convicted, fled, executed)` |
| `data/npc/personas.json` | 欧拉的 `trustKey` | 读 `trust.ola`，而任务写 `trust.oola` | 统一为 `trust.oola` |
| `data/party/companions.json` | 罗恩的 `flag` | `quest.a1_m05`（不存在的任务 ID） | `quest.q_a1_m04_hunt == done`（第 6.2 节） |
| `data/scenes/prologue.json` | `courtyard.first_object`、`prologue.last_words` | 写入中文原文作为值 | 写枚举值（第 7.6 节），原文进文本键 |
| `data/scenes/endings.json` | `epilogue.ruler` | 中文女神名 | 女神代号 |
| `data/scenes/acts2_5.json` | `hart_state` | 写 `rival`、`pending`，不在第四幕值集内 | `a4_hart_state` 只写 `hostile`、`routed`、`reconciled`、`allied`；第二三幕的竞争关系写 `npc.hart.relation` |
| `data/scenes/acts2_5.json` | `a4_alliance` | `broad`、`narrow`、`broken` | `a4_summit_result` 的 `league`、`accord`、`broken` |
| `data/strategy/config.json` | `evidenceFlags` | `evidence.oracle_text` 等命名证据 | 第 7.5 节的 `evidence.E15`、`E01`、`E10`、`E04` 与 `a3_eluen_violation` |
| `data/doors/doors.json` | 誓光之门的钥 | `a3_danger_door_vow` | `a3_vow_kept_reed_bridge`（C91；立誓本身读 `a3_vow_taken`） |
| `data/doors/doors.json` | 门钥 `bond.<人>.<N>` | 与台账写法并存 | `trust.<人> >= N` |
| `data/quests/quests.json` | 触发 `act == act1` 与 `act_index` | `act_index` 是重复的量 | 统一读 `act` |

## 12. 来源链接

- 决策：[决策日志][dlog] D-023、D-026、D-030、D-031、D-032、D-037、D-042、D-043、D-044、D-053、D-054、D-055、D-071、D-073、D-074、D-076、D-077
- 叙事：[揭示台账][rl]第 0.4、6、7 节；[序章][a0]第 8 节；[第一幕][a1]第 12 节；[第二幕][a2]第 10 节；[第三幕][a3]第 10 节；[第四幕][a4]第 11 节；
  [第五幕][a5]第 10 节；[第六幕][a6]第 2、3、11、13 节；[编年史][his]第 12 节
- 设计：[过场目录][cut]第 4.3、5.3、6.3、7.3、8.3、9.3、10.3、11.11、12.2.2、13.6 节；[迷宫与首领目录][dgb]；[任务与事件][qe]第 3.7、3.9、4 节；[成长与节奏][pp]；[千门][td]；[认知][rep]第 5 节；[内容总纲][bible]第 4、12 节；[总框架][gf]第 8 节；
  [女神目录][gi]；[遗物目录][relics]
- 技术：[AI 架构][aia]
- 代码：`src/systems/quests/conditions.ts`（`checkCondition`、`evaluate`、`referencedVars`、`flagResolver`）、`src/systems/quests/effect_types.ts`（`EFFECT_TYPES`）、
  `src/systems/quests/endings.ts`（`CRISES`、`act5Outcome`、`reviewOutcome`）、`src/systems/scenes/court.ts`、`src/systems/doors/index.ts`（`openDoor`）、
  `src/systems/city/daily.ts`（`writeFlags`）
- 调研：[主工程内部方法][play]（决策只追加、注册表与校验先行）、[开源资料的城建与 SLG 方法][city]（可见性分层：secret、player_known、public）

[dlog]: ../00_vision/decision_log.md
[rl]: ../30_story/reveal_ledger.md
[qe]: systems/quests_and_events.md
[pp]: progression_and_pacing.md
[td]: systems/thousand_doors.md
[rep]: systems/reputation_and_cognition.md
[bible]: content/content_bible.md
[gf]: game_framework.md
[gi]: content/catalog_goddess_interventions.md
[ux]: ux_and_onboarding.md
[mb]: world/map_briefs.md
[war]: content/catalog_warfare_strategy.md
[cmp]: systems/companions_and_party.md
[qa13]: content/catalog_quests_acts1_3.md
[cut]: content/catalog_cutscenes.md
[dgb]: content/catalog_dungeons_bosses.md
[bai]: systems/builtin_ai.md
[relics]: content/catalog_relics_lore.md
[aia]: ../50_tech/ai_architecture.md
[his]: ../20_world/history.md
[a0]: ../30_story/arcs/prologue_antechamber.md
[a1]: ../30_story/arcs/act1_borderstone.md
[a2]: ../30_story/arcs/act2_wallenburg.md
[a3]: ../30_story/arcs/act3_lothar_crisis.md
[a4]: ../30_story/arcs/act4_continental_board.md
[a5]: ../30_story/arcs/act5_war_of_races.md
[a6]: ../30_story/arcs/act6_review_and_epilogue.md
[play]: ../10_research/woc_reuse/internal_playbooks.md
[city]: ../10_research/open_share/city_rts_slg.md
