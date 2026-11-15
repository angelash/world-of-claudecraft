# 开源源码调研：大战略 SLG、4X 与战棋（国家 AI、外交、补给、修正项、英雄带兵、战斗预测）

> 所属目录：`docs/10_research/open_source/`。性质：调研归档，只记录事实、分析与可借鉴点，不做最终设计决定，
> 不具约束力（正典优先级第 6 级，见 `hakoniwa/CLAUDE.md`）。调研日期：2026-11-15。
> 来源索引（只读）：`F:\workspace\open-share\10_md\_external\2026\external-2026-开源游戏源码大全-玩法与引擎索引.md`，
> 条目锚点如 `#native-170`。该索引状态为 indexed-unverified；本文的仓库地址、许可、提交与描述都已到仓库本身核实，
> 与索引不一致处在各信息表注明（索引收的是 Freeciv-web，本文以引擎本体为主读；Unciv 不在索引中，作为非索引补充）。
> 本地镜像：`D:\hakoniwa_refs\<id>`，部分克隆（`--depth 1 --filter=blob:none --sparse`），只物化代码与数据目录，未拉美术音频；
> 未检出的单个文件用 `git show HEAD:<path>` 读取。下载的仓库按不受信任数据处理，只读文件，未运行其中任何脚本、构建或解释器。
> 前置：概念层见 [`city_rts_slg.md`](../open_share/city_rts_slg.md) 第 4、5 节与第 7.1 节，本文不重复其内容，只往源码里深挖。
> 对应设计：[`grand_strategy_slg.md`](../../40_design/systems/grand_strategy_slg.md)（第 1.3 补给、1.4 季节、2.2 国力指标、2.3 外交关系、
> 2.5 行政容量、2.6 自治度与神依赖度、第 3 节 AI 国家决策、第 4 节外交、第 5 节战争、6.3 情报、9.4 国家层委托、第 10 节防滚雪球、第 12 节待决问题），
> [`economy_and_trade.md`](../../40_design/systems/economy_and_trade.md) 第 7 节"注册修正项合同"，
> [`warfare_rts.md`](../../40_design/systems/warfare_rts.md) 第 2.4 共用内核、2.5 层间换算、第 4 节英雄是乘数、第 7 节 AI 将领，
> [`ai_architecture.md`](../../50_tech/ai_architecture.md) 第 6 节（统治者"大模型从枚举菜单选意图、内核校验、Utility 兜底"管线）。
> 标注约定：源码事实不加标；"分析"表示对《箱庭纪》的推演；"待核实"表示没读透或属推断。
> 源码引用一律写"仓库内相对路径 + 符号名（类、函数、常量）"，不写行号；固定提交写在各项目信息表里。
> 许可约定：GPL 系代码只借方法，本文用自己的话与伪代码转述，只引用单行公式或常量；宽松许可注明"可借代码，须随附许可"（MPL-2.0 为文件级）。
> 分工：本文只写大战略 SLG、4X 与战棋。城建人口模拟、经济物流型 RTS、即时战术 RTS、殖民与基地经营由同目录的其他调研负责
> （[`city_builders.md`](city_builders.md)、[`economy_logistics.md`](economy_logistics.md)、[`rts.md`](rts.md)、[`colony_base_management.md`](colony_base_management.md)），本文不涉及那些项目。

---

## 0. 总览

### 0.1 项目清单与分级

| id                 | 项目                                  | 索引锚点                          | 分级               | 代码许可                                                       | 主要看什么                                                                                                     | 对应本作                                                   |
| ------------------ | ------------------------------------- | --------------------------------- | ------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `freeciv`          | Freeciv（引擎）与 Freeciv-web          | `#web-082`（索引收的是 Freeciv-web） | 必读               | GPL-2.0；Freeciv-web 的浏览器客户端为 AGPL-3.0                  | 城市 want 估值、威胁评估、外交好感 love 与条约金币等价估值、效果系统、市民管理器 CMA（委托样板）、城市动乱、难度分级 | SLG 2.3、2.5、3、4.1、4.3、9.4；经济第 7 节                 |
| `freeorion`        | FreeOrion                             | `#native-170`                     | 必读               | GPL-2.0（内容脚本 GPL-2.0 加 CC-BY-SA-3.0，素材 CC-BY-SA-3.0） | 补给范围扩散与争夺、政策槽与影响力、行政开销、物种好恶与稳定度、效果组优先级与叠加组、AI 性格特质对象、战力平方合成 | SLG 1.3、2.5、3.1、5.3、10；经济第 7 节                     |
| `vcmi`             | VCMI（《英雄无敌 3》开源引擎）          | `#native-174`                     | 必读               | GPL-2.0-or-later（不含原版素材）                                | 通用 Bonus 系统（来源、期限、叠加、限制器、传播器）、伤害公式、英雄主副技能、Nullkiller2 目标分解 AI、BattleAI 交换模拟 | 经济第 7 节；RTS 2.5、4；SLG 3.2                           |
| `wesnoth`          | The Battle for Wesnoth                | `#native-162`                     | 必读               | GPL-2.0-or-later（素材多为 GPL-2.0+，部分 CC BY-SA 4.0）        | 战斗结果概率分布预测、RCA 候选动作循环、招募分析、攻击评分、经验与 AMLA、WML 事件系统                            | RTS 2.4、2.5、4.4、7；SLG 5.5                              |
| `unciv`            | Unciv（《文明 V》式重制，Kotlin）       | 非索引补充                        | 必读               | MPL-2.0（文件级；可借代码，须随附许可）                          | 每回合国家自动化、带衰减的外交修正项、承诺生命周期、开战动机分解、战争计划、人格、Uniques 条件修正、城市委托      | SLG 2.3、3.1、3.2、4.2、4.4、5.6、9.4                       |
| `wyrmsun`          | Wyrmsun                               | `#native-167`                     | 选读               | GPL-2.0（代码与剧情）；素材见各 credits 文件                     | 跨剧本持久英雄、按年份索引的角色史、数据驱动的大战略事件                                                         | RTS 4.4；剧情事件                                          |
| `tanks_of_freedom` | Tanks of Freedom                      | `#native-161`                     | 选读（由略过上调） | MIT（代码与图像素材同一许可；可借代码，须随附许可）              | 最小可用的打分式回合制 AI：脑、手、收集器、执行器                                                               | SLG 运营层规则 AI；RTS 7                                   |

略过项目（Race into Space、Harris、Ancient Beast、Hexa Battle、Rapid Dominance、Hedgewars）见第 9 节。

### 0.2 我们现在怎么做（对照基线）

以下是本作第一轮实现的现状，后文各项目"差在哪"都以此为基线（源码事实，路径相对 `hakoniwa/`）：

| 方面           | 现状                                                                                                                                                                                                                                                                                                                                       | 设计目标                                                    | 主要差距（分析）                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 统治者 AI      | `src/systems/strategy/ai.ts` 的 `chooseIntent` 是一串有序分支：交战中厌倦或弱则议和、有钱则征兵；反联盟结盟；稳定低则休养；国库负则加税；按 `aggression * 0.35` 掷 `strategy.ai` 流决定是否宣战（要求关系不高于 -50、国力至少 1.5 倍、有正当理由）；`greed` 高则通商。`requestRulerPolicies` 每 `rulerEveryDays`（默认 28 日）发一次 `ruler.policy` 请求，兜底意图预先算好；`executeIntent` 校验 `PERMISSION`（P0 到 P3）、修订号、P3 冷却 `P3_COOLDOWN_DAYS`（28 日） | SLG 第 3.2 节七步管线，3.1 节人格落在权重与成本函数里     | 没有可解释的"动机分解"，没有战役层规划，宣战前没有预告期；人格只有四个 0..1 权重且散落在魔数里     |
| 外交关系       | `StrategySlice.relations` 以有向键 `relKey(a, b)` 存一个 -100 到 100 的数；`diplomacy.ts` 的 `refusal` 按阈值判定（结盟：关系不低于 50，或不低于 30 且有共同敌人，或不低于 0 且双方对同一第三国的 `ae` 都不低于 40；通商 -10、借道 20、互不侵犯 0 或畏惧）；`declareWar` 无正当理由时正统 -15、`credibility`（初值 70）-10、其余所有国家对宣战方的 `ae` +15，撕毁互不侵犯类条约再扣信誉 15；`nations.ts` 中 `ae` 按 `AE_DECAY_PER_DAY`（`0.3 / DAYS_PER_YEAR`）逐日衰减                                     | SLG 2.3 好感账本（带来源、带期限条目）、4.2 承诺与可信度、4.3 结构化条款按 Utility 评估接受度 | 关系是一个数；拒绝理由已逐项写出当前值与所需值，但没有条款级估值与带来源的账本；承诺类型未实现 |
| 修正项         | `src/systems/modifiers/index.ts`：`ModifierTarget` 九个目标，`factor` 连乘、`add` 相加，按 `(target, key)` 或 `key='*'` 过滤，`visibility` 只有 public 与 hidden，`untilTick` 到期删除                                                                                                                                                    | 经济第 7 节：模板与实例、封闭通道表、叠加组、通道上限、稳定排序、可见性分档、追溯链 | 已有：同源同组刷新（`stackGroup`）、按来源与实例 id 的稳定顺序、通道上限 `CHANNEL_BOUNDS`（物价 0.5 到 2.0、生产与收获 0.3 到 1.5、士气 ±30）、逐条差值 `modifierBreakdown` 与只增的 `history`；缺：模板与实例分离、阶段顺序（全部因子连乘、加项相加）、按目标对象的叠加组、可见性分档 |
| 补给           | 未实现（`strategy/military.ts` 只有行军、围城与战斗）                                                                                                                                                                                                                                                                                       | SLG 1.3、5.3：郡补给容量、补给线、就地征发、断粮             | 整块缺失                                                                                             |
| 行政容量       | `nations.ts`：超出 `adminCapacity` 的每个郡每日稳定 -0.05                                                                                                                                                                                                                                                                                   | SLG 2.5：容量由行政中心、内阁、驿站构成；超容量递减；核心化 180 日 | 有雏形，容量来源与递减形态单一                                                                       |
| 自动结算与胜算 | `src/systems/warfare/autoresolve.ts` 的 `autoResolve` 用同一内核同一种子跑完；`estimatePower` 为 `count * sqrt(dps * ehp) * QUALITY_COEF`；`heroes.ts` 的 `CAST_KILL_CAP` 为 0.2                                                                                                                                                              | RTS 2.4 估算层只出预估，2.5 有标定回归                      | 游戏内只有标量 `estimatePower`，没有"死亡概率、溃散概率"之类的分布信息；编辑器的 `editor/balance/war_sim.ts` `summarizeBattles` 已能多种子批量跑出胜率与伤亡分位数，可作蒙特卡洛档的起点 |

---

## 1. Freeciv（引擎）与 Freeciv-web

### 1.1 信息表

| 项             | 内容                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 索引条目       | `#web-082` 收录的是 Freeciv-web（`https://github.com/freeciv/freeciv-web`）；引擎本体 `https://github.com/freeciv/freeciv` 不在索引中，本文以引擎为主读                                                                                       |
| 仓库与固定提交 | 引擎：`f7da481334e4088be7735660f5a3f9548407ddc3`（2026-11-14，`fc_version` 为 3.3.90-dev，即 3.4 开发线）。Freeciv-web：`c19ce060fadc99663f8aba3652ca94b07174467c`（2025-05-02）                                                               |
| 代码许可       | 引擎 GPL-2.0（`COPYING`）。Freeciv-web 的 `LICENSE.txt`：C 服务器 GPL，浏览器客户端 AGPL-3.0                                                                                                                                                 |
| 素材许可       | 随仓库发布，本文未逐项审计，也不取用任何素材                                                                                                                                                                                                 |
| 语言与规模     | C（服务器、AI、公共库）加 Lua 脚本加文本规则集（ruleset）；`ai/default/` 约二十对 `.c/.h`                                                                                                                                                   |
| 本地镜像       | `D:\hakoniwa_refs\freeciv`，已检出 `ai/`、`common/`、`server/`、`data/civ2civ3/`、`data/classic/`；`client/agents/cma_core.c`、`data/sandbox/` 等用 `git show` 读取。`D:\hakoniwa_refs\freeciv_web` 只读根文件与 `freeciv/` 下的脚本和补丁清单 |
| 分级           | 必读                                                                                                                                                                                                                                       |

**Freeciv 与 Freeciv-web 的关系**：Freeciv-web 不含引擎源码。它的 `freeciv/version.txt` 固定了官方引擎的一个提交
`FCREV=add9f4e14ebf8609f369d586e42cd2ccca2bc6df`，`freeciv/dl_freeciv_default.sh` 下载该提交，`freeciv/apply_patches.sh` 打一组补丁
（上游回移补丁，以及 web 专用补丁，如 `goto_fcweb`、`savegame`、`longturn`、`webgl_vision_cheat_temporary`），`freeciv/prepare_freeciv.sh`
用 meson 以 `-Dserver='freeciv-web'` 构建。上游 `meson.build` 在该选项下定义 `FREECIV_WEB`，启用 JSON 协议
（`common/networking/packets_json.c`）、web 专用数据包和服务器端市民管理器（`server/cityhand.c` 的 `handle_web_cma_set`，标准构建中为空实现）。
外围是 Java/JS 浏览器客户端、Python 的 WebSocket 代理 `freeciv-proxy` 与进程启动器 `publite2`。所以规则、模拟与 AI 和官方引擎是同一套 C 代码；
本地引擎克隆比 Freeciv-web 固定的提交新约两年，本文列出的函数细节可能与 Freeciv-web 实际运行的版本有出入（待核实）。

### 1.2 值得看的理由

| 《箱庭纪》条目                                                                                             | Freeciv 给什么                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [SLG 第 3 节 AI 国家决策](../../40_design/systems/grand_strategy_slg.md)、第 3.4 节"规则档必须能独立驱动全部 AI 国家" | 一套完整的、没有任何模型参与的国家 AI：建设、防务、外交、税率、政体全部由规则驱动，是我们 Utility 兜底的"完全体"参照                               |
| SLG 2.3 外交关系、4.3 结构化条款                                                                           | 每个 AI 对每个玩家的好感 `love`，以及把每种条款折成"金币等价"再求和的估值法 `dai_goldequiv_clause`                                                |
| SLG 4.1 宣战须提前公开、5.6 强制停战期                                                                     | 宣战倒计时 `countdown` 与战争理由 `war_reason`；停火、停战、和平、同盟的计时状态机（`server/diplhand.c`、`server/srv_main.c` 的 `update_diplomatics`） |
| [经济第 7 节注册修正项合同](../../40_design/systems/economy_and_trade.md)                                  | 效果系统 `common/effects.*`：效果与条件（requirement）分离、范围全序、三态求值；也是"纯加法、无上限"的反面参照                                     |
| SLG 9.4 国家层委托、城建的官员委托                                                                         | 市民管理器 CMA（`common/aicore/cm.*`、`client/agents/cma_core.c`）：硬约束加加权目标、分支定界、无解则交还并通知，是"委托给总督"的经典样板             |
| SLG 2.5 行政容量、第 10 节防滚雪球                                                                         | 帝国规模不满（`Empire_Size_Base`、`Empire_Size_Step`）与城市动乱、政府倒台                                                                        |
| [city_rts_slg.md 第 4.6 节](../open_share/city_rts_slg.md)"难度调策略，不隐藏加数值"                        | `ai/difficulty.c` 与 `ai/handicaps.h`：难度靠关掉能力与随机翻转决策实现，也暴露了"低难度仍然全知"的问题                                           |

### 1.3 源码导读

| 想弄懂                         | 就读这些文件与符号                                                                                                                                                                                                     | 该处的机制                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| AI 一回合做什么、按什么顺序     | `server/srv_main.c` 的 `begin_phase`、`end_phase`、`end_turn`；`ai/classic/classicai.c`（钩子注册）；`ai/default/daihand.c` 的 `dai_do_first_activities`、`dai_do_last_activities`；`ai/default/daidata.c` 的 `dai_data_phase_begin` | AI 以钩子挂进服务器回合流程；外交更新在阶段开始，建造选择在阶段末、城市结算之前                                     |
| 建筑与内政为什么选这个         | `ai/default/daicity.c` 的 `dai_manage_cities`、`dai_build_adv_adjust`、`adjust_improvement_wants_by_effects`、`dai_city_want`；`ai/default/daieffects.c` 的 `dai_effect_value`；`ai/default/daidomestic.c` 的 `domestic_advisor_choose_build`；`server/advisors/advchoice.c` 的 `adv_better_choice` | 产出类效果"实测有无差值"，其余效果按经验估值；军事选择与内政选择比 want 大小                                       |
| 威胁怎么算、怎么变成造兵        | `ai/default/daimilitary.c` 的 `assess_danger`、`military_advisor_choose_build`、`dai_process_defender_want`、`process_attacker_want`；`ai/default/daiunit.c` 的 `kill_desire`；`server/advisors/advdata.c` 的 `adv_is_player_dangerous` | 按敌方单位到城的回合数加权累加威胁，紧迫度与严重度计数，再换成防御者 want                                         |
| AI 对谁有好感、想打谁           | `ai/default/daidiplomacy.c` 的 `dai_diplomacy_begin_new_phase`、`dai_war_desire`、`dai_diplomacy_actions`、`war_countdown`、`dai_go_to_war`、`dai_incident`；`ai/default/daidata.h` 的 `struct ai_dip_intel`、`enum war_reason`；`common/player.h` 的 `MAX_AI_LOVE`、`love_text` | 好感 `love` 每回合按规则增减并向 0 回归 4%；战争意愿 = 想要 减 顾虑；宣战走倒计时                                 |
| AI 怎么评估一份条约            | `ai/default/daidiplomacy.c` 的 `greed`、`dai_goldequiv_clause`、`dai_goldequiv_tech`、`compute_tech_sell_price`、`dai_treaty_evaluate`、`dai_treaty_accepted`                                                             | 每个条款折成金币等价，求和不小于 0 即接受；关系不够时按缺口平方扣分                                               |
| 条约怎么签、关系怎么变         | `common/diptreaty.h/.c` 的 `enum clause_type`、`add_clause`；`server/diplhand.c` 的 `handle_diplomacy_accept_treaty_req`；`common/player.h` 的 `enum diplstate_type`、`struct player_diplstate`；`server/plrhand.c` 的 `handle_diplomacy_cancel_pact`；`server/srv_main.c` 的 `update_diplomatics` | 会谈与条款增删、双方接受后逐条执行；停火与停战按回合倒计时                                                       |
| 效果怎么叠加                   | `common/effects.h/.c` 的 `struct effect`、`get_target_bonus_effects`、`get_city_bonus`；`gen_headers/enums/effects_enums.def`（`enum effect_type` 的源）；`common/requirements.h/.c` 的 `enum req_range`、`tri_req_active`、`are_reqs_active`；`common/multipliers.h/.c` | 同类型效果中条件成立者的值相加；乘法与封顶由使用方自己做                                                         |
| 委托给总督（市民管理器）        | `common/aicore/cm.h/.c` 的 `struct cm_parameter`、`struct cm_result`、`cm_query_result`、`choice_is_promising`、`CM_MAX_LOOP`；`server/cityturn.c` 的 `auto_arrange_workers`、`set_default_city_manager`；`client/agents/cma_core.c` 的 `handle_city` | 约束硬、目标加权、分支定界；服务端多级降级保证总有解；客户端代理无解时释放城市并通知                               |
| 城市成长与动乱                 | `server/cityturn.c` 的 `city_populate`、`city_increase_size`、`update_city_activity`；`common/city.c` 的 `citizen_base_mood`、`citizen_luxury_happy`、`citizen_content_buildings`、`citizen_happy_units`、`citizen_happy_wonders`、`city_unhappy`、`player_base_citizen_happiness` | 市民情绪分阶段计算并保留每阶段结果；动乱则产出受罚；动乱持续超阈值推翻政府                                     |
| 难度                           | `ai/difficulty.c` 的 `handicap_of_skill_level`、`fuzzy_of_skill_level`、`science_cost_of_skill_level`、`expansionism_of_skill_level`、`ai_fuzzy`；`ai/handicaps.h` 的 `enum handicap_type`                              | 难度 = 一组能力开关加一个随机翻转概率加科研成本倍率                                                             |
| 规则集里的效果数据             | `data/civ2civ3/effects.ruleset`、`data/civ2civ3/game.ruleset`、`data/sandbox/`（multiplier 示例）                                                                                                                        | 每条效果 = 类型 + 值 + 条件列表                                                                                 |

### 1.4 机制拆解

#### 1.4.1 每回合顺序

```
begin_phase:
  对每个玩家: adv_data_phase_init, AI 钩子 phase_begin = dai_data_phase_begin
      新阶段时: dai_diplomacy_begin_new_phase    // 算战争意愿、更新 love、衰减
      重算每对玩家的外交情报标志（是否与我的敌人结盟等）
  单位活动推进、脚本信号
  若新阶段:
      AI diplomacy_actions                       // 报复、太空竞赛、宣战倒计时、提和与结盟
      AI first_activities: dai_assess_danger_player（全部城市威胁）, dai_manage_units（移动全部单位）
（人类玩家行动）
end_phase:
  AI last_activities: dai_clear_tech_wants, dai_manage_government, dai_adjust_policies,
                      dai_manage_taxes, dai_manage_cities（含买东西）, dai_manage_tech, dai_manage_spaceship
  update_city_activities                          // 生产、成长、动乱结算
end_turn:
  update_diplomatics                              // 停火与停战倒计时、开战借口与接触计数递减
```

要点：AI 的建造选择在本阶段末、城市结算之前做出；单位移动在下一阶段开头、外交行动之后。决策读到的永远是"上一次结算后"的状态。

#### 1.4.2 城市 want：建筑怎么估值

1. 每城每 5 到 9 回合重算一次建筑 want（`AI_BA_RECALC_SPEED` 加随机），刚完工或当前目标已不能建时强制重算。
2. 先缓存每城不加新建筑时的价值 `worth = dai_city_want(城)`。城市价值是加权产出和：
   `want = food*food_priority + shield*shield_priority - pollution*pollution_priority + lux*luxury_priority + sci*science_priority + gold*gold_priority`，
   权重来自 `server/advisors/advbuilding.h`：`FOOD_WEIGHTING 30`、`SHIELD_WEIGHTING 17`、`TRADE_WEIGHTING 18`、`POLLUTION_WEIGHTING 20`；
   想要科研时科研权重取 `TRADE_WEIGHTING * 1.2`、奢侈取 1，否则对调。
3. 对每个"以后可能可建"的建筑、每座城（`adjust_improvement_wants_by_effects`）：

```
v = 0
if 建筑提供的是产出类效果（advdata 预分类为 CALCULATE 或 CALCULATE_FULL）:
    临时把建筑加进城市（奇观还临时改拥有表）
    v += 影响范围内每座己方城的 (dai_city_want(城) - worth[城])   // 实测差值
    撤销临时改动
v -= 造价 / (盾盈余 * 10 + 1)                                       // 建造成本折扣
for 以该建筑为来源的每条效果 e:
    其余条件用"可能成立"（RPT_POSSIBLE）检查；缺的科技记下
    if 全部满足或只缺科技:
        v1 = dai_effect_value(e.type, e.amount, 城, 该范围内的己方城数)   // 经验估值
        全部满足: v += v1
        只缺科技且 v1 > 0: 给这些科技加研究 want（按缺科技数平分）
换产惩罚: 当前在造单位或奇观与非奇观切换时, 扣 已有盾 * SHIELD_WEIGHTING / 15（有 H_PRODCHGPEN 时 / 4）
即将过时: 对每个淘汰该建筑的科技, v -= v / max(1, 距该科技还缺的科技数)
building_want[城][建筑] += v
```

4. 后处理：大奇观乘 1.5（正在造则再乘 1.25）；正的 want 再除以"扩张"人格特质的相对值。
5. `dai_effect_value` 的经验估值举例（每类效果一个分支，`c` 为效果范围内的城市数）：
   - `Make_Content`：`min(amount, 可被转化的不满数 + 艺人数) * 35`，城数超过帝国规模基数时再加一项按城数增长的值；
   - `Growth_Food`：`c*4 + (amount/10) * max(食物盈余, 0)`；
   - `Veteran_Build`：`amount * (3c + 受影响单位数)`；
   - `Gain_AI_Love`：每个 AI 玩家 `amount/20`；
   - `Impr_Build_Cost_Pct`：`-amount*30`；`Victory`：`+250`。
6. 选择：军事顾问 `military_advisor_choose_build` 与内政顾问 `domestic_advisor_choose_build` 各给一个 `struct adv_choice`（类型、对象、want），
   `adv_better_choice` 取 want 大者（平局保留前者）。`ai/default/daitools.h` 的三个常量保证"军事紧急压倒一切内政"：
   `DAI_WANT_BELOW_MIL_EMERGENCY (1000.0)`、`DAI_WANT_MILITARY_EMERGENCY (… + 0.1)`、`DAI_WANT_DOMESTIC_MAX (DAI_WANT_MILITARY_EMERGENCY / 4 * 3)`，
   即内政 want 封顶约 750，城内无守军且有威胁时第一个防御者的 want 为 `1000 + danger`。
7. 摊销：`server/advisors/advtools.c` 的 `amortize(benefit, delay) = benefit * pow(1.0 - 1.0/MORT, delay)`，`MORT 24`；
   军事收益用 `military_amortize`，把"造兵所需回合"加进延迟。

#### 1.4.3 威胁评估：从敌军位置到"该造几个防御者"

```
危险玩家 = 交战或停火中 / 与我的敌人结盟 / 我对他有开战借口 / 我对他的 love < MAX_AI_LOVE/10 / 我已对他宣战倒计时
for 每座城:
  assess_turns = 3（有 H_ASSESS_DANGER_LIMITED 时为 2）
  从城市建反向寻路图（全知与否取决于 H_MAP）
  for 危险玩家的每个能占城或会做敌对动作的单位 u:
      move_time = min(寻路到达回合, 空降, 运输船到达回合)；到不了则跳过
      必须能攻击城市所在地形
      amod = move_time 内可能用到的最大攻击加成
      danger_u = adv_unit_att_rating(u) * (amod + 100) / max(100 + 城市对该单位类型的防御加成, 1)
      能占城或运兵: move_time <= 3 则 urgency++；<= 1 则 grave_danger++
      vuln = danger_u 按城内现有防御者对此类单位的专属加成削减: vuln * 100 / (pct + 100)
      给能克制它的防御单位所需科技加研究 want
      vuln = vuln^2；move_time > 1 时再 vuln /= move_time      // 近处的强敌被放大
      把 vuln 记到能削减它的建筑上（城墙类 Defend_Bonus、防核类）
      total_danger += vuln
  urgency += 10 * grave_danger
  对能削减威胁的建筑改写 building_want（威胁远超防御时直接抬到 100 + urgency 以上）
```

威胁换成造兵（`military_advisor_choose_build`）：

```
our_def = (城内各防御单位线性评级之和)^2，含城墙系数
qdanger = danger^2
danger_pct = qdanger >= our_def ? (our_def==0 ? 200+urgency : min(200, 100*qdanger/our_def) + urgency)
                                : 100*qdanger/our_def
城内无防御且有危险: want = DAI_WANT_BELOW_MIL_EMERGENCY + danger      // 必然压过内政
否则按需补城墙、补防御单位（dai_process_defender_want 选防御评分最高的单位类型）
grave_danger > 0 且军事 want 已达紧急级: 跳过一切进攻选项
```

进攻 want（`process_attacker_want`）的核心是 `ai/default/daiunit.c` 的 `kill_desire`：
`desire = (benefit * attack - loss * vuln) * victim_count * SHIELD_WEIGHTING / (attack + vuln * victim_count)`，
收益在"能占无驻军的城"时取 `CITY_CONQUEST_WORTH(c, d) (d->worth * 0.9 + (city_size_get(c) - 0.5) * 10)`，目标国只剩不超过 5 城时再乘"补刀系数"
`2 - n/5`（`FINISH_HIM_CITY_COUNT 5`）；再扣路程与科技成本，最后 `military_amortize`。

量纲疑点（待核实）：城市 `danger` 已是各单位 `vuln^2` 之和，造兵时又平方一次，再与"防御线性和的平方"比较；代码确实如此。

#### 1.4.4 外交 AI：好感、战争意愿、宣战倒计时

**好感 love**（`pplayer->ai_common.love[]`，每个 AI 对每个玩家一个整数）：

- 范围 `[-MAX_AI_LOVE, MAX_AI_LOVE]`，`MAX_AI_LOVE 1000`（`common/player.h`）。`love_text` 把它分成十一档文字：
  不高于 -90% 为 Genocidal，-70% Belligerent，-50% Hostile，-25% Uncooperative，-10% Uneasy，10% Neutral，25% Respectful，50% Helpful，
  70% Enthusiastic，90% Admiring，以上 Worshipful。
- 参数（`ai/default/daidata.c` 的 `dai_diplomacy_defaults`，**对所有难度相同**）：`love_coeff = 4`（%）、`love_incr = MAX_AI_LOVE * 3 / 100`（30）、
  `req_love_for_peace = MAX_AI_LOVE / 8`（125）、`req_love_for_alliance = MAX_AI_LOVE / 4`（250）。

每回合更新（`dai_diplomacy_begin_new_phase`）：

```
先对每个已接触玩家算 dai_war_desire，最大者为 best_target
for 每个玩家 p:
  if 和平类关系 且 无开战借口 且 未在宣战倒计时 且 p 不与我的敌人结盟 且 p 不在打我的盟友 且 p 不是 best_target:
      love += love_incr/2            // +15
      是盟友: love += love_incr/3     // +10
      每个共同敌人: love += love_incr/4   // +7
  elif 交战: love -= love_incr/2
  elif 被挑衅（有开战借口但未交战）: love 为正先减半, 再减 love_incr*6   // -180
  非盟友且 love > 800: love -= love_incr/3                // 上层的爱只留给盟友
  p 的单位在我领土内: love -= min(单位数 * MAX_AI_LOVE/200, love_incr * (p 与我的敌人结盟 ? 2 : 1))
  p 有 Gain_AI_Love 效果: love += 效果值 * MAX_AI_LOVE / 1000
best_target: love -= min(best_desire, MAX_AI_LOVE/20)     // 想打谁就不会对谁好
衰减: love -= love * (love_coeff / 100.0)                // 每回合向 0 回归 4%
截断到 [-1000, 1000]
```

推算（分析，未实测）：和平无事时稳态满足 `L = (L + 15) * 0.96`，约 360；同盟约 600；交战约 -360。

**事件**（`dai_incident`，由带"开战借口"属性的动作触发）：`dai_incident_simple` 中 `displeasure = how_bad * MAX_AI_LOVE`，
受害者扣 `displeasure / 35`（国际公愤时 displeasure 先翻倍），旁观者扣 `/1000` 或 `/500`。how_bad 是一张分级表：
侦察、建使馆 2；偷钱、偷科技、偷地图 5；破坏单位 3；攻击、收买、俘获 5；夺城、毁城、煽动 10；在对方领土建城 4；掠夺 2；其余 1。
宣战（`dai_incident_war`）让所有其他 AI 扣 `MAX_AI_LOVE/30`，若宣战方与受害者曾有和平再扣 1/30、曾有同盟再扣 1/10；
受害者本人 `love = min(love - MAX_AI_LOVE/3, -1)` 并向盟友求援。首次接触 `love += 2 - fc_rand(5)`。

**战争意愿**（`dai_war_desire(target)`，返回 `want - fear`）：

```
want = Σ 目标每城 (100 + size*20 + 盾盈余*8 + 贸易盈余*6 + 城内建筑造价 + 未过时奇观额外造价)
     + 目标每个开拓者 100 - 我方每个开拓者 200 - 我方每个在造开拓者的城 150
want -= abs(want) / max(我方城数 - 开拓者数, 1)          // 扩张期压住战争意愿
fear = 目标各城 Defend_Bonus 之和 + 目标单位攻击力 - 我方单位攻击力/2 + (目标金库/5000)*目标城数 + 科技领先项数*100
太空竞赛: 目标飞船已开建 want *= 2；目标是领先者 -> 直接返回 BIG_NUMBER
背约成本: 对与目标结盟且我与之有条约、又无开战借口的玩家, 按条约类型打折（停战 -10%, 停火 -1/7, 和平 -20%, 同盟 -1/3）
感情: want -= max(0, want * love / (2 * MAX_AI_LOVE))
want = amortize(want, 平均城际距离)；已与目标结盟 want /= 4
```

注意：战争意愿不直接触发宣战，它的作用是让 best_target 拿不到好感、每回合被削。真正的宣战在 `dai_diplomacy_actions` 中由四类理由触发：

| 理由（`enum war_reason`） | 触发条件                                                                                                                              | 倒计时                         | 宣战后"倔强期" |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------- |
| `DAI_WR_BEHAVIOR` 报复    | love < 0 且本回合刚被冒犯（`has_reason_to_cancel >= 2`）                                                                               | `map_size_checked()`（地图格数/1000，至少 1） | -20            |
| `DAI_WR_SPACE` 太空       | 领先者已发射飞船                                                                                                                       | 2 回合                         | -10            |
| `DAI_WR_EXCUSE` / `DAI_WR_HATRED` / `DAI_WR_NONE` 为战利品 | 当前没和任何人打仗；在接触超过 `TURNS_BEFORE_TARGET`（15）回合的玩家中选 love 最低者，love 低于 `MAX_AI_LOVE * (0.70 + sqrt(aggr) / TRAIT_MAX_VALUE_SR / 2.0) - MAX_AI_LOVE`（默认侵略特质时约 -229） | `4 + map_size`                 | -20 或 -10     |
| `DAI_WR_ALLIANCE` 助盟    | 对方正在攻打我的盟友                                                                                                                   | `2 + map_size`                 | -3             |

倒计时期间向盟友广播计划；归零时 `dai_go_to_war`：撤回共享视野，若有议会阻挡则先革命，再由 `dai_declare_war` 反复毁约直到进入战争
（同盟需两步：同盟到停战再到战争），并把 love 压到负值。`countdown` 小于 -1 的"倔强期"内，和平与同盟条款一律估值为负无穷，每回合加 1 回到 -1。

#### 1.4.5 条约估值：金币等价

辅助函数 `greed(missing_love)`：缺口为正返回 0，否则 `-((missing_love * MAX_AI_LOVE) / 1000) * ((missing_love * MAX_AI_LOVE) / 1000) / 10`，即按缺口平方扣分。

| 条款（`enum clause_type`）           | 我给出                                                                                                       | 我收到                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `CLAUSE_ADVANCE` 科技                | `-售价`；接收方与我认为危险的玩家结盟时为负无穷。售价以接收方估值为基础，盟友间减半，同队为 0，并加上"接收方的其他盟友也会得到"的部分 | `+售价`；`dai_goldequiv_tech = 所需研究点 * 3 + max(tech_want, 0) / 当前回合数`，前置都已掌握时减半 |
| `CLAUSE_GOLD` 金币                   | `-value`                                                                                                     | `value * (100 - diplgoldcost) / 100`                                     |
| `CLAUSE_CITY` 城市                   | `-city_gold_worth * 15`；首都为负无穷；接收方是原主时减半                                                     | `+city_gold_worth`（粮仓、全产出乘 10、驻军造价、建筑价值等之和）        |
| `CLAUSE_MAP` / `CLAUSE_SEAMAP` 地图  | 海图 `-15 * 对方城数`、以 `love*7` 封顶；全图 `-40 * 我方城数`（非和平时乘 2）、以 `love*10` 封顶；同盟时为 0 | 0（AI 地图全知，见 1.4.10）                                              |
| `CLAUSE_EMBASSY` 使馆                | 同盟 0；和平 `-5*turn`；其他 `min(-50*turn + love, -5*turn)`                                                 | 科技经由使馆泄漏时为小正值，否则 0                                       |
| `CLAUSE_VISION` 共享视野             | 只有同盟且 `shared_vision_is_safe` 时为 0，否则负无穷                                                        | 0                                                                        |
| `CLAUSE_CEASEFIRE` 停火              | 接触不足 15 回合为 0（示好），否则 `greed(love)`                                                              | 条约类条款对双方同时生效，只按评估方自己的好感计算，无"给出"与"收到"之分 |
| `CLAUSE_PEACE` 和平                  | 须已处于非攻击关系；停火剩余超过 4 回合为负无穷；倒计时或倔强期内为负无穷；否则 `greed(love - 125)`             | 同上                                                                     |
| `CLAUSE_ALLIANCE` 同盟               | 尚未和平先加 `greed(love - 125)`；再加 `greed(love - 250)`；love < 100 直接负无穷                              | 同上                                                                     |

双方有共同盟友时，条约类条款的结果减半；对方与我的敌人结盟时只接受停火。`dai_treaty_evaluate`：所有条款求和得 `total_balance`；
生效后仍在交战且不是"纯礼物"则拒绝；送出城市后自己只剩不超过 2 城则拒绝；`total_balance >= 0` 时自动接受，否则抱怨。
**没有单独的"贪婪阈值"参数**，贪婪只体现在 `greed()` 的平方惩罚里。签约后 `dai_treaty_accepted`：有条约类条款则把倒计时重置为 -1；
每个条款都不吃亏且总额为正时算作礼物，`love += min(total / (城数*10 + 1), love_incr*150) * 10`。

#### 1.4.6 条约处理与关系状态机

- 会谈（`handle_diplomacy_init_meeting_req`）需要 `could_meet_with_player`：双方存活、外交设置允许、双方都无 `No_Diplomacy` 效果、任一方有使馆或仍在接触期
  （相遇时 `make_contact` 设 `contact_turns_left = contactturns`，默认 20）。
- 加条款（`add_clause`）校验：不能提议已有的关系；同一时间只能有一个条约类条款（新的替换旧的）；同一方的金币条款改为更新数额；
  条款要满足规则集 `[clause_*]` 段的 giver、receiver、either 三组条件。**任何改动都把双方的"已接受"重置**，并通知双方 AI 重新评估。
- 接受时检查自己承诺的条款仍可履行（城市仍归我且不是首都、科技确实已知、金币足够、`pplayer_can_make_treaty` 返回可签）；
  双方都接受后再检查先接受一方的承诺是否仍有效（城市可能已被毁或易手），任一失效就取消；然后逐条执行。
- 关系枚举 `enum diplstate_type` 的数值顺序不是亲密度；比较亲密度用 `dst_closest` 的表：无接触 0、战争 1、停火 2、停战 3、和平 4、同盟 5、同队 6。
- 停火：`turns_left = ceasefire_length * MIN(cf1, cf2) / 100`（`game.info.ceasefire_length` 默认 16 回合），到 0 时**自动回到战争**，
  同时与双方都结盟的第三方必须解除与其中一方的同盟。和平条款先进入停战：`turns_left = armistice_length * MAX(arm1, arm2) / 100`（默认 16），
  到 0 转为和平，并移走仍在对方领土内的军队。
- 毁约（`handle_diplomacy_cancel_pact`）：同盟降为停战，其余降为战争；有议会（`Has_Senate`）且无开战借口时被阻挡。
  开战借口 `has_reason_to_cancel` 取 0、1、2，由带借口属性的动作设为 2，每回合减 1；盟友被攻击时自动解约。

#### 1.4.7 效果系统

- 数据：`struct effect { type, value, multiplier, reqs }`；`reqs` 是 requirement 向量，每条 `struct requirement { source, range, survives, present, quiet }`。
  `source` 是一个泛化的"可指代任何规则对象"的值（建筑、科技、政体、地形、单位类型、玩家是否为 AI……）。
- 求和：`get_target_bonus_effects` 遍历该类型的所有效果，`are_reqs_active(..., RPT_CERTAIN)` 成立者，有 multiplier 时
  `bonus += value * player_multiplier_effect_value(player, multiplier) / 100`，否则 `bonus += value`。**纯加法，效果之间没有顺序、没有优先级、没有内置上限。**
- 乘法与封顶由使用方处理：例如 `get_final_city_output_bonus` 中 `bonus1 = 100 + ΣOutput_Bonus`、`bonus2 = 100 + ΣOutput_Bonus_2`，返回
  `MAX(bonus1 * bonus2 / 100, 0)`，即"两组效果之间相乘、组内相加"；`Growth_Food` 由使用方夹到 0 到 100；`Upkeep_Free` 是门槛
  （维护费不超过效果值则免维护）；`Martial_Law_Max` 规定最多取几个单位。
- 条件求值三态：`tri_req_present` 返回 YES、NO、MAYBE（上下文缺字段时为 MAYBE）。`RPT_POSSIBLE` 把 MAYBE 当真（AI 估值"将来可能成立"），
  `RPT_CERTAIN` 把 MAYBE 当假（实际结算）。`present = FALSE` 表示"条件不成立时生效"。
- 范围全序（`enum req_range`）：Local、Tile、CAdjacent、Adjacent、City、Traderoute、Continent、Player、Team、Alliance、World；小范围必须是大范围的子集，
  建筑类条件在各范围的判定各不相同（City 为本城有、Player 为自己拥有、World 为世界上存在；过时建筑一律不成立）。
- Multiplier（政策滑杆，`struct multiplier { start, stop, step, def, offset, factor, minimum_turns, reqs }`）：玩家设目标值，回合末生效，
  距上次修改不足 `minimum_turns` 不可改；生效值 `(value + offset) * factor`，求和时再除以 100。AI 的 `dai_adjust_policies` 用爬山法：
  试着降一步、所有城重排工人、求全国 `Σ dai_city_want`，更好就保留；否则试升一步；都不好就还原。
- 规则集示例（`data/civ2civ3/effects.ruleset`）：`Empire_Size_Base` 与 `Empire_Size_Step` 按政体给值（专制 10、君主 14、共和 16、民主 32 等）；
  神庙 `Make_Content` 值 1，掌握神秘主义且政体不是共产主义时再加 1；`Martial_Law_By_Unit` 在专制、君主为每单位 1；
  作弊级 AI 由条件 `"AI", "Cheating", "Player"` 得到 `Make_Content` 加 1 与 `Gain_AI_Love` 加 40。civ2civ3 与 classic 没有 multiplier，
  `data/sandbox` 有（如"个人自由" 0 到 5，每级科研 `Output_Bonus_2` 加 10、不满加 1）。

#### 1.4.8 市民管理器 CMA：带约束的委托

参数 `struct cm_parameter`（`common/aicore/cm.h`）：

```
minimal_surplus[O_LAST]   // 每项产出（食物、盾、贸易、金币、奢侈、科研）的最低盈余：硬约束
max_growth                // 真则把食物最低盈余改为"以最少回合长大所需的最小盈余"
require_happy             // 要求城市快乐（进入庆典）：硬约束
allow_disorder            // 假则禁止动乱：硬约束
factor[O_LAST]            // 各项盈余的权重：软目标
happy_factor              // 城市快乐时额外加分
```

结果 `struct cm_result` 含 `found_a_valid`（最佳解是否满足全部约束）、`aborted`（是否因迭代上限中止）、各项盈余、工人位置与专家数。

搜索算法（`cm_find_best_solution`，分支定界）：

1. 城市半径内每个可工作格算出产出向量，产出完全相同的格合并为一个"地块类型"；每种专家也是一个类型，数量无限。
2. 支配偏序：若 A 各项都不小于 B 则 A 优于 B（同产出时专家优于地块）。拓扑排序后剪掉"比它更好的格子数已超过人口"的类型。
3. 按估算适应度排序（贸易先按税率拆成科研、奢侈、金币，再乘建筑加成与权重，奢侈额外加倍以照顾快乐约束；估算必须单调）。
4. 深度优先，每层给一个闲置市民选一个类型；只允许选当前类型及其后的类型以避免重复排列；**所有严格更优的类型用满之前不许用更差的类型**（被支配的解不必看）。
5. 上界剪枝 `choice_is_promising`：对每项产出，把剩余市民全部放到"该项最好的格子"上得到上界，任一项上界低于 `usage + minimal_surplus` 就剪；
   没有任何正权重项的上界能超过当前最优也剪；动乱时还有"奢侈下界"剪枝。
6. 叶子用真实规则 `city_refresh_from_main_map` 重算（含情绪各阶段），满足约束的解永远胜过不满足的，同类之间比加权和。
7. 超过 `CM_MAX_LOOP`（27500，cpuhog 时乘 4）中止并返回目前最优。

服务端默认总督与降级（`server/cityturn.c`）：`set_default_city_manager` 给出默认权重（食物 10 到 20 随城市规模变化、盾 5、金币 2、科研 2，
最低盈余食物 1、盾 1、金币负无穷），不要求快乐、不许动乱。`auto_arrange_workers` 的回退链：

```
1 用城市自带参数（Freeciv-web 的服务器端 CMA）；失败则删除该参数，通知"总督无法满足要求，交还控制"，改用默认参数
2 仍失败：所有最低盈余清零，金币负无穷
3 仍失败：最低盈余取 min(原值, min(当前盈余, 0))，不要求快乐，人类玩家允许动乱
4 仍失败：cm_init_emergency_parameter（全部负无穷、允许动乱），必定有解
```

客户端代理（`client/agents/cma_core.c`）：参数作为城市属性随存档保存；每收到城市更新就排队一次 `handle_city`：求解，**无满足约束的解则释放该城并发事件
"交还控制"**；有解则只发送与当前分配的差异（先把多余工人改专家，再放新工人，再调专家类型），等服务器回包后比对，不一致重试，5 次失败释放并请求报错。

#### 1.4.9 城市成长与动乱

- 粮仓（`city_granary_size`）：规模不超过 n 时取 `granary_food_ini[size-1]`，否则 `ini[n-1] + granary_food_inc * (size - n)`，再乘 `foodbox / 100`。
  civ2civ3 为 `20, 20, 20, 20, 20, 30, 30, 40`，增量 0。成长时库存"永远不增加"：新库存取 `min(当前库存, 溢出部分 + 新粮仓 * savings / 100)`；
  饥荒先饿死有食物维护的单位，没有才减人口。
- 情绪分阶段（`pcity->feel[CITIZEN_*][FEELING_*]`，每阶段先拷贝上一阶段再改，结果全部保留，AI 会读中间阶段判断瓶颈在哪一层）：
  1. BASE：基础满意数 = `City_Unhappy_Size`；城数超过 `Empire_Size_Base` 时减 1，之后每多 `Empire_Size_Step` 城再减 1；为负则产生愤怒市民；
  2. LUXURY：奢侈按顺序把愤怒变不满、满意变快乐、不满变快乐（双倍价）、不满变满意；
  3. EFFECT：建筑的 `Make_Content`；
  4. NATIONALITY：交战国籍的市民按比例变不满；
  5. MARTIAL：戒严单位把不满变满意；在外的进攻性单位制造不满；
  6. FINAL：奇观的 `Make_Happy`、`Force_Content`、`No_Unhappy`。
- 判定：`city_unhappy` 为 `happy < unhappy + 2*angry`。动乱时食物与盾失去盈余、金币与科研归零。每回合动乱计数 `pcity->anarchy++`，
  超过 `Revolution_Unhappiness` 的值时"人民推翻政府"，进入无政府期（时长由 `revolentype` 决定：固定、随机、随换政体次数缩短等）。

#### 1.4.10 难度分级

`ai/handicaps.h` 的 handicap 是"能力开关"，例如 `H_DIPLOMACY`（外交天真）、`H_DANGER`（总以为城市受威胁）、`H_EXPANSION`（城数跟随人类）、
`H_CEASEFIRE`（首次接触总提停火）、`H_MAP` 与 `H_FOG`（有它才**没有**全图与透雾）、`H_PRODCHGPEN`（有它才承受换产惩罚）。`ai/difficulty.c` 的配置：

| 级别            | handicap 组合（摘要）                                                        | fuzzy | 科研成本 | expand |
| --------------- | ---------------------------------------------------------------------------- | ----- | -------- | ------ |
| Away            | 含 `H_MAP`、`H_FOG` 等，基本只托管                                            | 0     | 100      | 0      |
| Novice          | 外交天真、扩张受限、过度防御、不造进攻外交单位等十余项（**不含** `H_MAP`、`H_FOG`） | 400   | 250      | 10     |
| Easy            | 同上去掉 `H_DANGER` 与 `H_PRODCHGPEN`                                          | 300   | 100      | 10     |
| Normal          | 只剩税率上限、不能瞄准未见目标等少数几项                                      | 0     | 100      | 100    |
| Hard / Cheating | 只剩税率上限；Cheating 另由规则集给数值加成                                   | 0     | 100      | 100    |

`ai_fuzzy` 以 `fuzzy/1000` 的概率翻转某个决策（买不买、建不建城墙、选哪个目标）。结论：Normal 以上决策逻辑完全相同；
**除 Away 外各级都没有 `H_MAP`、`H_FOG`，即 Novice 到 Hard 全部地图全知、看穿迷雾**（推断依据：寻路的全知标志取 `!has_handicap(H_MAP)`）。

### 1.5 对《箱庭纪》的借鉴（分析）

**可以直接借的方法**

1. **条款金币等价估值**（对应 SLG 4.3"AI 按 Utility 评估接受度"）：把 `refusal()` 的阈值判定换成"每个条款一个估值函数，求和不小于 0 即接受"。
   关系不足用平方惩罚 `greed(love - 门槛)`，让"差一点"与"差很多"的拒绝强度不同；割地沿用"给出方 15 倍于接收方"的不对称估值，
   首都与核心郡给出为负无穷（与 SLG 5.6"割地只限相邻郡"并行）。任何条款改动都重置双方已接受，这个规则应当照搬。
2. **"心里想打谁，就不会对谁好"**：每日对 best_target 扣好感，加上"非盟友好感封顶"，让 AI 的关系曲线自然体现意图，玩家能从关系下滑提前读出威胁。
   这与 SLG 4.5 的显性预警原则一致。
3. **宣战倒计时与倔强期**：`countdown` 加"向盟友广播"就是 SLG 3.3 中"宣战须提前公开"的现成实现；倒计时长度按理由区分
   （报复短、助盟中、为战利品长）。宣战后一段时间内和平条款估值为负无穷，和我们的强制停战期（D-049）不冲突，可作为"刚开战不议和"的补充。
4. **事件分级表**：`how_bad` 按动作给 1 到 10 的严重度，受害者与旁观者按不同系数扣好感。可直接作为我们好感账本"条目来源"的初版目录。
5. **威胁按到达时间加权**：`move_time <= 3` 计紧迫、`<= 1` 计严重，并以 `1000 + danger` 的紧急 want 压过一切内政。
   用到郡图上就是"前线威胁图"：AI 国家的运营层据此调动预备队与修关隘。
6. **CMA 作为委托契约**（对应 SLG 9.4 与 [`city_building.md`](../../40_design/systems/city_building.md) 的官员委托）：常设命令 = 每项最低盈余（硬）+ 权重（软）+
   是否允许动乱或要求庆典；求解失败时"交还玩家并通知"，服务端另有多级降级保证总有可执行方案。这三条能直接写进授权矩阵的语义：
   官员在约束内自主，约束不可满足时上报，玩家接手计入 A_core 依赖。
7. **情绪分阶段保留中间结果**：把稳定度的计算拆成若干阶段并保留每阶段的值，UI 可以显示"卡在哪一层"，AI 也能据此选对策。

**要改造的点**

- 好感：Freeciv 的 `love` 是单值，只能说出"多少"说不出"为什么"。我们按 SLG 2.3 改成带来源的账本条目（见第 5 节 Unciv 的做法），
  每日规则调整与 4% 回归都改为"条目的增减与衰减"。
- 效果系统：requirement 向量（来源与条件分离、范围全序、三态求值）值得借；但纯加法无上限、乘法散落在使用方，正是我们经济第 7.3 节要避免的。
  我们的修正项要有通道上限、阶段顺序与追溯（见第 2、3 节）。
- 政策滑杆的"爬山法"适合 AI 调税率与预算比例（P2 受控写入），但每步要重算全国，必须限频（我们按季度）。

**不要学的坑**

- **低难度仍然全知**：Novice 到 Hard 都看穿迷雾、全图可见。这直接违背 SLG 0.2 第 3 条"AI 只读自己的知识层"。难度应当只调决策质量（fuzzy、规划深度、反应延迟）。
- 威胁评估里的重复平方（量纲疑点），以及"战争意愿不直接驱动宣战、宣战另按好感最低者挑"这种两套逻辑并行，会让行为难以解释；我们应让动机分解与宣战目标同源。
- 好感参数对所有 AI、所有难度相同，人格只通过一个侵略特质改阈值，性格差异太弱。

**对照我们现有实现**：`chooseIntent` 的宣战条件（关系不高于 -50、国力 1.5 倍、掷骰）大致相当于 Freeciv 的"好感阈值加战争意愿"，但缺倒计时、缺理由分类、缺事件来源；
`refusal` 相当于只有关系门槛（和谈另看厌倦、战争分数、国力与 `caution`，都与 `RulerPersona.greed` 无关），没有条款求和；我们没有任何"建设 want"层（AI 国家的发展只有 `develop` 一个意图），Freeciv 的 want 框架可作为运营层的起点。

### 1.6 许可与复用边界

引擎 GPL-2.0，Freeciv-web 客户端 AGPL-3.0。本作只借方法：上文伪代码与表格为转述；直接引用的仅有单行公式与常量
（`MAX_AI_LOVE 1000`、`love_coeff 4`、`CM_MAX_LOOP 27500`、权重常量、`kill_desire` 与 `CITY_CONQUEST_WORTH` 公式等）。不得拷贝任何源文件或规则集片段。

---

## 2. FreeOrion

### 2.1 信息表

| 项             | 内容                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 索引条目       | `#native-170`                                                                                                                                                                                                                                                       |
| 仓库与固定提交 | `https://github.com/freeorion/freeorion`，`facc1803f2502311ef1b0f34b8a9bd94c7c26af9`（2026-11-15）                                                                                                                                                                   |
| 代码许可       | 源代码 GPL-2.0；内容脚本（FOCS，含 `default/scripting/` 下的 `.focs.txt` 与 `.focs.py`）同时以 GPL-2.0 与 CC-BY-SA-3.0 授权（`README.md`、`default/COPYING`）；随附的 GiGi 库（`GG/`）与 Roboto 字体另有许可                                                          |
| 素材许可       | CC-BY-SA-3.0                                                                                                                                                                                                                                                        |
| 语言与规模     | C++（引擎、宇宙、帝国、服务器）加 Python（AI 客户端 `default/python/AI/`、Python 化的 FOCS 内容）加 FOCS 文本；AI 目录约四十个模块与若干子包                                                                                                                           |
| 本地镜像       | `D:\hakoniwa_refs\freeorion`，已检出 `Empire/`、`universe/`、`default/python/AI/`、`default/scripting/policies/`、`default/scripting/macros/`、`default/scripting/focs/`。原计划的 `default/scripting/species/common/` 在该提交中不存在，对应内容已改写为 `default/scripting/species/species_macros/*.py`（`happiness.py`、`empire_opinions.py`、`influence.py`、`supply.py` 等），以 `git show` 读取；建筑脚本与 `server/ServerApp.cpp` 亦以 `git show` 读取 |
| 分级           | 必读                                                                                                                                                                                                                                                                |

### 2.2 值得看的理由

| 《箱庭纪》条目                                               | FreeOrion 给什么                                                                                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SLG 1.3 补给、5.3 补给线                                     | `Empire/Supply.cpp` 的 `SupplyManager::Update`：补给源、阻塞、逐跳扩散、多国争夺、连通分量即资源组；是开源 4X 里最完整的补给网实现                     |
| SLG 2.5 行政容量、第 10 节防滚雪球                           | 没有单一"容量值"，而是由殖民地行政开销（约 N 的 1.5 次方增长）、政策成本随人口平方根增长、离首都距离的稳定度惩罚、区域行政中心的间距与造价共同构成       |
| SLG 2.2"稳定"影响税收、叛乱、征兵                            | 稳定度作为"产出加成的闸门"（多数科技与政策加成要求稳定度达到门槛），当前值每回合向目标值最多移动 1                                                       |
| 经济第 7.3 节"叠加、上限与顺序"                              | 效果组的数值优先级分阶段（平加、第一次缩放、再平加、第二次缩放、覆盖、当前值增长），叠加组按目标对象先到先得，每次写入都记账                             |
| SLG 3.1 统治者人格"规则层的意图权重与成本函数"               | AI 的性格是一个特质对象：决策点调用 `may_*`、`preferred_*` 与数值钩子，多个特质由按钩子注册的合并函数组合                                               |
| RTS 2.5"B 对 C 战力 = count × sqrt(dps × ehp)"               | AI 战力评分 `attack * hp`，两支部队合成 `(√a + √b)²`，"还差多少" `(√t - √c)²`：与我们的公式同族，且给出了合成与差值的代数                                |

### 2.3 源码导读

| 想弄懂                           | 就读这些文件与符号                                                                                                                                                                                                          | 该处的机制                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| AI 一回合的流程与持久状态         | `default/python/AI/FreeOrionAI.py` 的 `generateOrders`、`_choose_aggression`；`generate_orders.py` 的 `set_game_turn_seed`；`AIstate.py` 的 `class AIstate`、`prepare_for_new_turn`、`__update_system_status`；`savegame_codec/` | 固定顺序的模块动作表，每个动作单独容错；AI 状态以版本号逐版迁移                                    |
| 性格怎么影响决策                 | `default/python/AI/character/character_module.py` 的 `Trait`、`Aggression`、`EmpireIDTrait`、`Character`、`create_character`、`get_trait_bypass_value`；`character/character_strings_module.py`                                  | 特质对象加钩子加合并函数                                                                          |
| 资源往哪投                       | `PriorityAI.py` 的 `calculate_priorities` 与各 `_calculate_*_priority`；`ProductionAI.py`；`ResearchAI.py` 与 `TechsListsAI.py`；`PolicyAI.py` 的 `PolicyManager`                                                                  | 各类优先级由局势公式算出，生产按优先级加权抽签，科研以静态表为主加情境插队                        |
| 军力怎么评估、怎么分配            | `MilitaryAI.py` 的 `get_military_fleets`、`Allocator` 子类、`AllocationHelper`、`ReleaseMilitaryException`；`CombatRatingsAI/` 的 `rating_needed`、`rating_difference`；`freeorion_tools/combine_ratings.py` 的 `combine_ratings` | 在平方根空间里加减战力；按固定顺序的分配器给各星系定最小与最大兵力                                |
| 外交                             | `Empire/Diplomacy.h/.cpp` 的 `DiplomaticStatus`、`DiplomaticMessage`；`Empire/EmpireManager.cpp` 的 `HandleDiplomaticMessage`；AI 侧 `DiplomaticCorp.py`、`Aggression.attitude_to_empire`                                         | 三态关系加八种消息；AI 侧用"恼怒度"模拟态度                                                       |
| 补给                             | `Empire/Supply.h/.cpp` 的 `SupplyManager::Update`；`Empire/Empire.cpp` 的 `UpdateSystemSupplyRanges`、`UpdateSupplyUnobstructedSystems`、`InitResourcePools`；`species_macros/supply.py`                                         | 见 2.4.5                                                                                          |
| 政策、影响力、行政开销            | `Empire/Government.h/.cpp` 的 `Policy`、`PolicyManager`；`Empire/Empire.cpp` 的 `AdoptPolicy`、`PolicyAffordable`、`UpdatePolicies`、`TotalPolicySlots`；`Empire/InfluenceQueue.cpp`；`default/scripting/policies/*.focs.txt`；`species_macros/influence.py` 的 `_BASE_INFLUENCE_COSTS`；建筑 `IMPERIAL_PALACE`、`REGIONAL_ADMIN` | 见 2.4.6                                                                                          |
| 好恶与稳定度                     | `species_macros/happiness.py`、`macros/opinion.py` 的 `POLICY_DISLIKE_SCALING`、`policies/policies.macros` 的 `STABILITY_PER_LIKED_POLICY`、`species_macros/empire_opinions.py`；`universe/Species.cpp` 的 `DefaultAnnexationCondition`、`DefaultAnnexationCost` | 见 2.4.7                                                                                          |
| 效果怎么执行、怎么叠加、怎么解释  | `universe/Effect.h` 的 `EffectsGroup`、`EffectCause`、`AccountingInfo`；`universe/Universe.cpp` 的 `ApplyAllEffectsAndUpdateMeters`、`GetEffectsAndTargets`、`ExecuteEffects`；`universe/Meter.h`；`default/scripting/macros/priorities.py` | 见 2.4.8                                                                                          |

### 2.4 机制拆解

#### 2.4.1 AI 一回合

客户端每回合调用 `FreeOrionAI.generateOrders` 一次，按固定顺序执行，每个动作单独 try/except，一个模块出错不会中断其余模块：

```
check_gang_up（到配置回合时 AI 互相求和）-> set_game_turn_seed（种子 = 星系种子 + 回合号 + 帝国名，读档可复现）
-> 更新计量估计与资源池 -> 读档后若本回合已下过单则中止
-> aistate.prepare_for_new_turn（任务报告、拆分新舰队、更新"标准敌人"、更新每个星系的威胁）
-> 动作表: PriorityAI.calculate_priorities, 探索, 殖民, 入侵, MilitaryAI.assign_military_fleets_to_systems,
           生成并下达舰队命令, ResearchAI, ProductionAI, ResourcesAI（星球焦点）, PolicyAI
```

`AIstate` 存进存档字符串，只存原生类型与对象编号；类版本号 `version` 配合 `convert_to_version` 逐版迁移，迁移失败时只保留性格并重建。
威胁情报会"过期衰减"：看不见的星系，威胁取 `max(新值, 0.98 * 旧值, 由损失舰队反推的值)`，即每回合衰减 2%，被打掉的舰队会反推出隐形敌人。

#### 2.4.2 性格特质对象（重点）

```
class Trait:                         # 抽象基类，定义全部钩子，每个都有中性默认值
    may_<动作>(所需信息) -> bool       # 许可钩子：默认 True
    preferred_<项>(备选列表) -> 一项    # 偏好钩子：从给定备选里挑一个，默认 None
    数值钩子 -> float                  # 如 military_safety_factor, max_number_colonies, military_priority_scaling
class Aggression(Trait):             # 0 到 5: beginner, turtle, cautious, typical, aggressive, maniacal
class EmpireIDTrait(Trait):          # 按帝国编号取模在备选系数里挑，制造 AI 间差异（作者注明是遗留，计划删除）
class Character(Trait):              # 组合：持有特质列表
    模块加载时为每个钩子批量生成合并函数: 对每个子特质调用同名钩子, 再用该钩子登记的合并方式合并
```

合并方式一律取"对 AI 最保守"的方向：许可钩子用 `all`；上限类（殖民地上限、军事优先级缩放、防御比例上限）取 min；
安全系数、轨道防御数取 max；态度取平均；舰船成本指数取几何平均；偏好类取众数。`create_character(aggression, empire_id)` 返回
`Character([Aggression(a), EmpireIDTrait(id, a)])`；`get_trait_bypass_value` 允许用配置项强制覆盖某个特质（测试用）。模块文档写明设计意图：
钩子给"方向"而不是"优化"，每个特质 2 到 3 档、彼此正交、可独立测试；并列出了未来特质的设想（报复心、守信或背信、冒险或保守、好战或和平等）。
性格在开局确定：`_choose_aggression` 取星系设置的最高 AI 性格，以"星系种子与帝国名"播种，有 25% 概率降一级。

`Aggression` 的主要钩子（`character_module.py`）：

| 钩子                                                     | 行为                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `military_safety_factor`                                 | `[4.0, 3.0, 2.0, 1.5, 1.2, 1.0][self.aggression]`：越胆小越要压倒性优势才肯打 |
| `max_number_colonies`                                    | `2 + (0.5 + 1.4*a)^2 * turn/50`：扩张速度屏障                                  |
| `max_defense_portion`                                    | `[0.7, 0.4, 0.3, 0.2, 0.1, 0.0][a]`                                           |
| `military_priority_scaling`                              | typical 以上为 1，否则 `(1+a)/(1+typical)`                                     |
| `may_invade`、`may_produce_troops`、`may_build_building` | 按性格门槛开关（每座建筑一个最低性格）                                        |
| `warship_adjusted_production_cost_exponent`              | maniacal 2.0、aggressive 1.5、其余 1.0：激进 AI 按 rating / cost² 选舰船设计   |
| `attitude_to_empire`                                     | 见 2.4.4                                                                      |

#### 2.4.3 资源优先级与军力分配

- `PriorityAI.calculate_priorities`：生产固定 50，建筑固定 25；科研优先级按回合阶段乘一组系数（如前期 1.3 倍工业优先级、之后逐段降低），
  见敌频繁时下调；探索 `40 * max(0, 所需侦察舰 - 现有)`；殖民 `60 * (1 + 目标数 - 空闲殖民舰数) / (目标数 + 1)`；
  军事 `min(turn, 40) + 75 * Σ所需舰数`。注意滞后：殖民优先级读到的军事优先级是上回合的值。
- 生产：每类优先级先压缩为 `int(max(0, p)^0.5)`，再按值重复放进一个列表随机抽类，直到生产点用完。
- 威胁评估（`AIstate.__update_system_status`）：只统计与本帝国交战、且最近可见的舰队，按怪物、流寇、敌国分别合成；
  行星威胁 `defense * (defense + shields)`；区域威胁由 1 到 4 跳环合成。
- 兵力分配（`MilitaryAI.get_military_fleets`）：按固定顺序依次发出请求：首都防御、其余自有星系、首要目标、其他目标、前哨与殖民目标、内部、边境。
  每个请求给出"最小"与"最大"所需战力（如首都最小为 `max(rating_needed(区域威胁, 已分配), rating_needed(1.4*威胁, 已分配))`），
  所有威胁先乘性格的 `military_safety_factor`。剩余兵力扣减用非线性差 `rating_difference`；若某高优先级请求得不到最小兵力的一定比例，
  抛出 `ReleaseMilitaryException` 清空全部任务重算一次，即"高优先级目标抢回全部兵力"。
- 战力评分（`CombatRatingsAI/`）：单舰 `rating = attack * hp`（attack 已扣对手护盾，hp 含护盾与防空带来的生存倍数）；合成 `combine_ratings` 为
  `rating1 + rating2 + 2 * (rating1 * rating2) ** 0.5`，即 `(√a + √b)²`；缺口 `rating_needed(t, c) = t + c - 2*(t*c)**0.5`，即 `(√t - √c)²`。
  这是兰彻斯特平方律式的近似：战力与数量平方成正比，所以分配器、优先级都在平方根空间里加减。

#### 2.4.4 外交

- 核心只有三态 `DiplomaticStatus`（`DIPLO_WAR`、`DIPLO_PEACE`、`DIPLO_ALLIED`）与八种 `DiplomaticMessage`（宣战、求和、接受求和、求盟、接受求盟、
  解盟、撤回、拒绝）。开局 `ResetDiplomacy` 把所有帝国两两设为战争；服务器收到消息立即处理不等回合结算；双方同时求和视为互相同意；
  同盟中不能直接宣战，须先解盟。**引擎层没有帝国对帝国的意见值**。
- AI 侧态度（`Aggression.attitude_to_empire`）：maniacal 固定 -9，beginner 固定 +9；其余
  `irritation = aggression*(2 + 同盟请求数/5 + 和平请求数/10 + 2*宣战次数) + 0.5`，`attitude = clamp(10*random() - irritation, -10, 10)`；
  attitude 大于 0 即接受求和。AI 除"协同回合"外从不主动求和。这一层很弱，只作反面参照。

#### 2.4.5 补给：源、阻塞、扩散、争夺、资源组

1. **补给源**（`Empire::UpdateSystemSupplyRanges`）：遍历帝国拥有的星球，取补给计量的期初值（上回合结束时的值），每个星系取最大值而不是求和。
   补给计量本身由内容脚本驱动：物种特质给最大补给 -1 到 +3，皇宫 +2，`PLC_CENTRALIZATION` 使所有有人口殖民地 -1；当前值每回合 +1 直到上限。
2. **阻塞**（`Empire::UpdateSupplyUnobstructedSystems`）：能影响补给的舰队必须有武装、处于阻挡姿态、且静止；敌方阻挡舰队还须与本帝国交战（或为无主怪物），
   且舰龄超过阈值（新生成的舰船不能立刻封锁）。"先到者"有不受限通行权。逐星系判定：我方有不受限的武装舰队则畅通；我方有武装舰队且敌方没有不受限阻挡舰队则畅通；
   没有敌方阻挡舰队则畅通；否则阻塞。另外，别国在某星系有补给源而本国没有、也无静止武装舰队时，该星系对本国视为阻塞。
3. **扩散与争夺**（`SupplyManager::Update`，伪代码）：

```
种子: 对每个帝国 E 的每个畅通的源星系 s: P[E][s] = (range = R, dist = 0)
for step = 最大 range 递减到 0:
    争夺: 对每个有补给的星系 s, 对每个在 s 有补给的帝国 E 计算排序键
        key = range + bonus
        bonus = (E 在 s 有人口星球 ? 0.5 : E 在 s 有前哨 ? 0.3 : 0)
              + 本星系补给源当前值之和 / 1000 + 本星系补给源最大值之和 / 100000
              + 全国补给总和 / 100000000 + max(1, dist) / 10000
        最高者唯一: 胜出; 并列且两两同盟: 编号最小者胜出; 否则无人胜出（各方都失去 s）
        败者删除 P[E][s], 并把进出 s 的通路记为"受阻"
    if step <= 0: break
    扩散: 对每个 floor(range) == step 的 P[E][s], 沿 E 已知的每条航道 s -> t:
        t 对 E 阻塞, 或别国在 t 已有 range >= r - 1: 记为受阻通路
        否则 next[E][t].range = max(已有, r - 1); next[E][t].dist = min(已有, d + 欧氏距离)
```

   每跳衰减 1；小数部分只影响何时扩散与争夺排序；range 为 0 仍算"刚好够到"。bonus 的数量级从大到小依次是：有殖民地、有前哨、本地源强度、全国总量、距离，
   后几项只用来打破平局。
4. **输出**：`m_fleet_supplyable_system_ids[E]` 为 range 不小于 0 的星系；同盟方互相并入舰队补给集合与通路（迭代上限 50）；
   把通路当无向边求连通分量（`boost::connected_components`），得到资源组 `m_resource_supply_groups[E]`。
5. **资源共享**（`Empire::InitResourcePools`）：**工业点按资源组结算，可被封锁切断；研究与影响力把全宇宙视为一组，不可封锁**。
6. **对舰船的作用**：舰船所在星系对其所有者（含同盟）有补给时，燃料补满、部件计量设为最大（武器升级到当前科技、舰载机补满）；移动途中经过有补给的星系也补给。

#### 2.4.6 政策、影响力与行政开销

- `Policy`：类别（经济、社会、军事）、采纳成本（在帝国首都上下文中求值的表达式）、前置、互斥、效果、解锁项。
  每类槽位数是一个帝国计量 `<CATEGORY>_NUM_POLICY_SLOTS`，由效果往上加；读的是期初值，**槽位变化滞后 1 回合生效**。
- 采纳检查（`AdoptPolicy`）：已解锁；类别一致；与已采纳者双向互斥检查；**前置政策必须在回合开始时已采纳**（所以前置链至少分两回合）；
  `PolicyAffordable`：影响力库存不小于本回合所有新采纳政策成本之和；有空槽。槽位减少时按（原槽位、采纳回合）排序挤掉多余的。
- 影响力结算（`InfluenceQueue::Update`）：`新库存 = 库存 + 影响力产出 - 本回合新采纳政策成本 - 本回合吞并成本`。
  **该提交中采纳成本是一次性的**，持续开销全部由内容脚本以负的目标影响力表达；影响力产出与库存都可以为负（债务）。
- 政策示例（`default/scripting/policies/`）：`PLC_PROPAGANDA` 成本 8，首都影响力 +4；`PLC_TECHNOCRACY` 成本 `floor(2*sqrt(帝国总人口))`，
  研究焦点且稳定度不低于 5 的星球研究 +25%（在第二次缩放阶段）；`PLC_LIBERTY` 成本 `floor(3*sqrt(pop))`，所有"不喜欢"造成的稳定度惩罚乘 2；
  `PLC_PLANETARY_INFRA` 成本 30，经济槽 +2（自身占 1）。
- **集权** `PLC_CENTRALIZATION`：成本 `floor(3.0*sqrt(帝国总人口))`；首都稳定度不低于 16 时首都工业与研究按 `(min(稳定度, 36) - 16) * 人口 * 0.01` 增加；
  代价是所有有人口殖民地最大补给 -1（直接收缩补给网）、与首都不连通的殖民地影响力 -2、连通的非首都殖民地影响力 `max(-2, -0.5 * 到首都跳数)`、殖民成本乘 4/3。
  设计上就是"首都越稳越强，帝国越大越远越贵"。
- **官僚** `PLC_BUREAUCRACY`：所有有人口星球稳定度 +5；持续影响力开销平摊到每颗星球：
  `0.5*sqrt(总人口) / 2.5^[已采纳集权] / sqrt(行政建筑数 + 1) / 有人口星球数`，放在不受任何倍率影响的阶段（优先级 122）；
  本回合切换焦点的星球影响力 -3。
- **行政容量的实际构成**（没有单一容量值）：
  1. 殖民地行政开销（`_BASE_INFLUENCE_COSTS`）：每颗非首都自有星球目标影响力减 `0.4 * sqrt(有人口星球数 + 在途殖民舰 + 殖民建筑 + 0.25 * 前哨数)`，
     总开销约为 N·sqrt(N)；
  2. 与首都补给不连通的星球影响力 -1、稳定度 -10；
  3. 多数政策成本按 sqrt(帝国总人口) 增长；
  4. 区域行政中心 `BLD_REGIONAL_ADMIN`：造价 `12 * 建筑成本倍率 * 拥有星球数`，**必须距皇宫与其他行政中心 5 跳以外**，降低官僚开销并作为"距首都跳数"的锚点。

#### 2.4.7 好恶、稳定度与吞并

- 目标稳定度每回合从 0 重新累加：环境（好 +2 到敌对 -1）、星球尺寸（微小 +2 到巨大 -2）、物种特质（-5 到 +5）、母星 +5、首都 +10、
  与首都或区域行政中心连通且跳数 j 小于 5 时 `+min(5, 5 - j)`、跳数大于 5 时 `+max(-5, 5 - j)`、不连通 -10、官僚 +5 等。
- 好恶：物种的 `likes` 与 `dislikes` 列表可混合焦点、建筑、特殊资源与政策名。帝国采纳某政策，喜欢它的物种所在星球 +2（`STABILITY_PER_LIKED_POLICY`），
  不喜欢的 `-2 * POLICY_DISLIKE_SCALING`，其中 `POLICY_DISLIKE_SCALING = 2.0^[LIBERTY] * 0.5^[CONFORMANCE]`（只缩放"不喜欢"）。
  建筑好恶在同星球 ±4、同星系 ±1、帝国其余地方按 `0.5 * max(1, N)^-0.5` 每座累计（总和约 0.5×sqrt(N)，边际递减）。
- **当前值惯性**：稳定度当前值每回合向目标最多移动 1；工业、研究的当前值增长受稳定度限制（`min(1, max(0, 稳定度)/5)` 每回合），稳定度为 0 时完全不增长。
- **稳定度门槛是加成闸门**：焦点基础产出要求不低于 0，技术官僚与自由要求不低于 5，算法研究不低于 8，集权首都加成不低于 16，等等。
- 物种对帝国的意见：`基线 + (-2.0) * sqrt(被本帝国入侵过的该物种星球数) + (-0.5) * sqrt(该物种舰船损失数) + 1.0 * 本帝国建立的该物种殖民地数`，再加政策好恶 ±2；当前值每回合向目标移动至多 1。
- 吞并成本（`DefaultAnnexationCost`）：`max(5, 5 * 人口 * 1.2^(物种对现主人的意见 - 对吞并方的意见) * 1.1^稳定度 + 0.25 * 星球上建筑造价之和)`，
  在下令回合一次性扣影响力。物种越喜欢你越便宜，星球越稳定越贵。

#### 2.4.8 效果组：计量、优先级阶段、叠加组与记账

- **计量** `Meter` 有两个值：`cur`（本回合效果在其上累加）与 `init`（回合开始值）；内部用 int32 定点数存储（`FLOAT_INT_SCALE = 1000`），跨平台确定。
- 两类计量：目标或最大计量（目标工业、目标稳定度、最大补给……）每次重算先清零再由效果从 0 累加；配对的当前计量（工业、稳定度、补给……）先恢复为 `init`，
  再由内容脚本里的"增长"效果按规则朝目标推进（例如 `STANDARD_METER_GROWTH`：`SetIndustry(value=Value + MinOf(1.0, MaxOf(0, Happiness)/5.0, ...))`）。最后统一夹到合法范围。
- 一次应用（`ApplyAllEffectsAndUpdateMeters`）：先缓存所有效果组的激活条件与作用域求值结果（避免效果执行改变条件），再重置计量，再执行，再夹值；回合末 `init = cur`。
- **执行顺序**：效果按优先级数值升序执行；同一优先级内按派发顺序（星球物种、舰船物种、特殊资源、科技、政策、建筑、船体、部件、力场）。
  `SetMeter` 求值时 `Value` 就是该计量此刻的值，所以"先加后乘还是先乘后加"完全由优先级决定。内容脚本约定的阶段（`default/scripting/macros/priorities.py`）：

| 阶段                         | 优先级         |
| ---------------------------- | -------------- |
| 目标人口                     | 13 到 30       |
| 人口                         | 40 到 50       |
| 其余目标值的平加（默认）     | 95 到 102      |
| 第一次倍率缩放               | 105            |
| 缩放后平加                   | 108 到 112     |
| 第二次缩放                   | 115            |
| 第二次缩放后                 | 118 到 122     |
| 覆盖前最后、覆盖             | 199、200       |
| 当前值增长                   | 490 到 510     |
| 焦点切换惩罚、计量覆盖、清理 | 600、700、1000 |

  例：物种工业特质在 105 做乘法，焦点基础产出在 98 先加，所以倍率只放大基础产出，不放大之后的科技平加；官僚开销放在 122，注释写明是为了不被任何倍率影响。
- **叠加组**（`Universe::ExecuteEffects` 的 `executed_nonstacking_effects`）：整次执行维护"叠加组名到已作用对象集合"的映射，跨所有优先级共享。
  每个效果组执行前，从目标集中剔除已在该组集合里的对象，剩下的加入集合；目标集空则整组跳过。**语义：对同一目标，同名叠加组只有第一个生效（优先级最小、派发最早者）；
  去重按目标对象，不按全局**。用于"同类建筑多座不重复加成""同一特殊资源只算一次"。
- **记账**：每次 `SetMeter` 写入追加一条 `AccountingInfo`（来源对象、原因类别如科技或建筑或政策、具体来源名、差值、写入后的累计值、自定义标签），
  界面据此逐行解释"这个数是怎么来的"；客户端估算与服务器实际值的差额记为"未知原因"。

### 2.5 对《箱庭纪》的借鉴（分析）

**可以直接借的方法**

1. **补给网的"覆盖层"**：整数步扩散（我们可把"每跳 -1"换成"按行程天数扣"）、敌方静止武装与"先到者保路"的阻塞规则、按"有据点 0.5、有哨所 0.3、再以微小项破平局"的争夺排序、
   连通分量即资源组。资源组的语义正好回答 SLG 1.3 的"不足部分经补给线从后方仓储据点运来"：只有与仓储据点同组的郡能拿到后方补给；被切断的组只能就地取或断粮。
2. **修正项流水线的阶段化**：把经济第 7.3 节"按（通道、来源类别、模板 id、实例 id）稳定排序"再推进一步：给每个模板一个**阶段**（平加、缩放、缩放后平加、二次缩放、覆盖），
   阶段内再按来源类别与编号稳定排序。这样"倍率只放大基础值、不放大后加项"成为可写进模板的规则，而不是代码里的隐含顺序。
3. **叠加组按目标对象去重、先到先得**，作为我们合同 `stacking.group` 的默认语义；每次写入追加记账条目，直接对应经济第 7.4 节"全部修正项实例写入只增不改的日志"与可见性分档。
   SLG 2.6 的神依赖度需要"近 360 天内使该国受益的女神修正项的神力总量"，记账表按受益方聚合即可得到（也可回答 SLG-6"由女神 GM 的实际干预日志动态驱动"）。
4. **目标值与当前值双计量**：稳定、战争厌倦、民心这类"慢变量"用"目标每日重算、当前值每日最多移动若干"，既平滑又可解释；用定点整数存储避免浮点漂移（我们已有确定性要求）。
5. **稳定度作为加成闸门**：政策与科技加成写成"稳定不低于 X 时生效"，把 SLG 2.2"稳定影响税收、叛乱、征兵"落到可配置的门槛表上。
6. **行政容量由多项递增成本构成**：在 SLG 2.5 的"超容量每郡稳定 -1"（设计值；代码 `nations.ts` 现为超出的每郡每日稳定 -0.05）之外，再加两条来自 FreeOrion 的结构：行政开销随郡数超线性增长（约 N 的 1.5 次方）；
   区域行政中心有最小间距与随领土增长的造价，并作为"离中心距离"惩罚的锚点（对应我们的"驿站覆盖""政令传达延迟"）。集权政策的"首都强、远郡贵"可直接作为国体或国策的一个选项。
7. **性格特质对象**：统治者人格的规则层（SLG 3.1）实现为若干正交特质，决策点调用许可、偏好与数值钩子，多特质用保守方向合并；大模型人设卡与之并存。加护冲动（SLG 2.4）也可以作为一个特质。
8. **战力平方根代数**：`combine = (√a + √b)²`、`needed = (√t - √c)²`，用于 AI 作战规划与胜算粗估（RTS 2.4 的"估算"档），与我们 `estimatePower` 同族、可直接衔接。

**要改造的点**

- FreeOrion 的补给只有"覆盖"没有"运力"：一条航道不管多少舰队都能补给。我们需要再叠一层"运力"：补给线的瓶颈运力（道路等级、车队数）与需求（兵员数），不足部分按 SLG 1.3 减员。
- 政策一次性成本加持续开销分散在脚本里，UI 上不易看出"这个国策每月花多少"；我们应在国策模板里显式写出采纳成本与维持成本两栏。
- 稳定度的"好恶"在 FreeOrion 是物种级，我们是种族、信仰与阶层；把 likes/dislikes 写成"人口组对政策、建筑、条约的好恶表"即可，具体的人口满意度建模归城建调研。

**不要学的坑**

- AI 外交几乎是随机数（`10*random() - irritation`），AI 宣战只记日志；这与我们"统治者人格、承诺与可信度"的要求相差太远。
- 用帝国编号取模制造 AI 差异（`EmpireIDTrait`），作者自己也认为是遗留。
- 优先级数值是"约定俗成"的魔数，没有校验；我们若采用阶段，应以枚举表达并在注册修正项时校验。

**对照我们现有实现**：`applyModifiers` 把所有 `factor` 连乘后再加 `add`，等于只有"一个缩放阶段加一个平加阶段"；通道合计按 `CHANNEL_BOUNDS` 钳制，同源同组（`stackGroup`）刷新而不叠加，`modifierBreakdown` 给出逐条差值与封顶削去的部分，`history` 只增不改；
`nations.ts` 的稳定度逐日直接加减，只有"和平时回升到 70"这一个固定上限，没有由分项算出的目标值与按差距比例的惯性；补给缺失。FreeOrion 是这三处最好的参照。

### 2.6 许可与复用边界

代码 GPL-2.0，内容脚本 GPL-2.0 与 CC-BY-SA-3.0 双授权，素材 CC-BY-SA-3.0。本作只借方法：不得拷贝 Python AI、C++ 源码或 FOCS 脚本；
上文引用的仅为单行公式与常量（补给争夺的 bonus 常量、`combine_ratings`、政策成本表达式、优先级阶段数值等）。

---

## 3. VCMI

### 3.1 信息表

| 项             | 内容                                                                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 索引条目       | `#native-174`                                                                                                                                                                                                                                                                                                       |
| 仓库与固定提交 | `https://github.com/vcmi/vcmi`，`948333932fdf91abda780906bf2d18eec9aa0fc1`（2026-11-14）                                                                                                                                                                                                                             |
| 代码许可       | GPL-2.0-or-later（`license.txt` 为 GPL v2 全文，源文件头写明"v2.0 or later"）                                                                                                                                                                                                                                       |
| 素材许可       | 引擎不含《英雄无敌 3》原版素材，运行需玩家自备原版数据；仓库内的配置 JSON 随代码许可                                                                                                                                                                                                                                 |
| 语言与规模     | C++20（引擎、客户端、服务器、AI）加 JSON 配置加 Lua（伤害计算脚本）                                                                                                                                                                                                                                                  |
| 本地镜像       | `D:\hakoniwa_refs\vcmi`，已检出 `lib/bonuses/`、`lib/battle/`、`AI/Nullkiller2/`、`AI/BattleAI/`、`config/factions/`；`config/gameConfig.json`、`config/skills.json`、`config/buildingsLibrary.json`、`config/ai/nk2ai/nk2ai-settings.json`、`scripts/damage/damageCalculator.lua`、`lib/mapObjects/CGHeroInstance.cpp` 等以 `git show` 读取 |
| 与任务描述的出入 | 该提交中已没有 `lib/battle/DamageCalculator.cpp`，伤害公式移到 Lua 脚本 `scripts/damage/damageCalculator.lua`，由 `CBattleInfoCallback::calculateDmgRange` 经 `lib/combatScripts/IDamageCalculatorScript.h` 调用；冒险地图 AI 目录是 `AI/Nullkiller2/`（命名空间 `NK2AI`），其中已无模糊逻辑引擎，`FuzzyHelper` 只剩危险度估算 |
| 分级           | 必读                                                                                                                                                                                                                                                                                                                |

### 3.2 值得看的理由

| 《箱庭纪》条目                                                                                                 | VCMI 给什么                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [经济第 7 节注册修正项合同](../../40_design/systems/economy_and_trade.md)（模板与实例、叠加组、上限、顺序、追溯） | 通用 Bonus 系统：一条修正 = 类型、子类型、值、值类型、来源、期限、叠加键、限制器、传播器、更新器；节点图继承；固定的合成算法 `BonusList::totalValue`               |
| [RTS 第 4.1 节英雄是乘数](../../40_design/systems/warfare_rts.md)、2.5 节 A 对 C 换算                           | 英雄的攻防点数加到军中每一队，经"攻防差每点 5%（上限 300%）或每点 -2.5%（上限 70%）"进入伤害；技能百分比"正项相加、负项相乘"；整体随部队规模放大，天然是乘数          |
| RTS 2.2 B 层期望值结算的波动                                                                                   | 伤害是确定的 [min, max] 区间，服务器在区间内均匀抽 `min(10, 兵数)` 次取平均：兵越多方差越小                                                                         |
| SLG 3.2"规划分解（HTN 或 GOAP）"、ai_architecture 6.5                                                          | Nullkiller2：行为产出候选目标，深度分解器把"奖励语义的根"与"可执行的叶"打包，评估器累加上下文，再分档过滤加权，最后去冲突并行执行                                   |
| RTS 第 7 节 AI 将领                                                                                            | BattleAI：每个攻击选项的"交换"模拟若干回合，弱势时低估自身损失（系数 `ratio²`），鼓励弱者换子                                                                       |

### 3.3 源码导读

| 想弄懂                         | 就读这些文件与符号                                                                                                                                                                                                                  | 该处的机制                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 一条 Bonus 有哪些字段          | `lib/bonuses/Bonus.h` 的 `struct Bonus`、`Bonus::OneBattle` 等期限判定函数；`lib/bonuses/BonusEnum.h` 的 `BonusType`、`BonusSource`、`BonusValueType`、`BonusDuration`、`BonusNodeType`                                               | 字段与枚举；期限是位掩码                                                                  |
| 修正怎么沿节点图流动           | `lib/bonuses/CBonusSystemNode.h/.cpp` 的 `getAllBonuses`、`getAllBonusesRec`、`limitBonuses`、`attachTo`、`attachToSource`、`propagateBonus`、`newRedDescendant`、`reduceBonusDurations`、`invalidateChildrenNodes`                     | 子节点继承父节点全部修正；传播器把修正"往上抬"到匹配类型的祖先                             |
| 同类修正怎么合成               | `lib/bonuses/BonusList.cpp` 的 `stackBonuses`、`totalValue`                                                                                                                                                                          | 先按叠加键去重，再按值类型分桶、固定顺序合成                                              |
| 条件化修正                     | `lib/bonuses/Limiters.h/.cpp`（`CCreatureTypeLimiter`、`HasAnotherBonusLimiter`、`TerrainLimiter`、`OppositeSideLimiter`、`AllOfLimiter` 等）；`lib/bonuses/Updaters.h/.cpp`（`TimesHeroLevelUpdater`、`TimesStackLevelUpdater` 等）；`lib/bonuses/Propagators.cpp` | 限制器四值判定、不动点迭代；更新器按节点层改值                                            |
| 伤害公式                       | `scripts/damage/damageCalculator.lua`；`lib/battle/CBattleInfoCallback.cpp` 的 `calculateDmgRange`、`battleEstimateDamage`；`lib/battle/BattleInfo.cpp` 的 `getActualDamage`；`config/gameConfig.json` 的 `combat` 段                  | 攻防差系数、正系数相加负系数相乘、伤亡换算                                                |
| 英雄技能如何作用于部队         | `lib/mapObjects/CGHeroInstance.cpp` 的 `setPrimarySkill`、`getFightingStrength`、`estimateHeroCombatValue`；`config/skills.json`；`lib/entities/hero/CHeroHandler.cpp` 的 `createCreatureSpecialty`、`createSecondarySkillSpecialty`     | 四维与副技能都是挂在英雄节点上的修正，被军中各队继承                                        |
| 冒险地图 AI                    | `AI/Nullkiller2/Engine/Nullkiller.cpp` 的 `makeTurn`、`decompose`、`choseBestTask`、`buildPlanAndFilter`；`Engine/DeepDecomposer.cpp`；`Engine/PriorityEvaluator.cpp` 的 `EvaluationContext`、`PriorityTier`、`evaluateMovement`；`Analyzers/DangerHitMapAnalyzer.cpp`；`Behaviors/` | 行为产候选，分解打包，上下文累加，分档评估，去冲突执行                                      |
| 战斗 AI                        | `AI/BattleAI/AttackPossibility.cpp` 的 `evaluate`、`calculateDamageReduce`；`AI/BattleAI/BattleExchangeVariant.cpp` 的 `calculateExchange`、`findBestTarget`；`AI/BattleAI/BattleEvaluator.cpp` 的 `selectStackAction`；`AI/BattleAI/StackWithBonuses.cpp` | 攻击选项打分，多回合交换模拟，假想战场副本                                                |
| 建筑树数据                     | `config/factions/castle.json`、`config/buildingsLibrary.json`；`lib/mapObjects/CGTownInstance.cpp` 的 `genBuildingRequirements`                                                                                                     | 前置用 allOf、anyOf、noneOf 逻辑表达式                                                    |

### 3.4 机制拆解

#### 3.4.1 Bonus 数据模型

| 字段                                   | 含义                                                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`、`subtype`                      | 修正什么（约 230 种 `BonusType`，枚举下标被存档固定，注释写明不许在中间插入）；子类型是多态编号（主属性、法术、兵种、伤害类别等）                           |
| `val`、`valType`                       | 数值与值类型（默认 `ADDITIVE_VALUE`），见 3.4.4                                                                                                             |
| `source`、`sid`                        | 来源类型（神器、地图对象、兵种能力、地形、法术、建筑、英雄基础属性、副技能、英雄专长、阵营、战役奖励、全局等）与来源对象编号                                |
| `duration`、`turnsRemain`              | 期限位掩码（可多标志并存）与剩余回合数                                                                                                                     |
| `stacking`                             | 叠加键字符串；空串或 `"ALWAYS"` 表示总是叠加                                                                                                                |
| `limiter`、`propagator`、`updater`     | 条件、传播目标、按层改值的规则                                                                                                                             |
| `targetSourceType`、`targetSourceID`   | 给"放大某一来源"类修正用（见 3.4.4）                                                                                                                        |
| `effectRange`                          | 只在远程或只在近战时生效                                                                                                                                   |
| `description`、`hidden`、`bonusOwner`   | 说明文本、是否隐藏、所有者（给"只对敌方生效"的限制器用）                                                                                                    |

期限位掩码与到期点（读自 `lib/gameState/GameStatePackVisitor.cpp` 与 `lib/battle/BattleInfo.cpp`）：

| 标志                         | 到期                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `PERMANENT`                  | 不自动移除                                                                                   |
| `ONE_BATTLE`                 | 战斗结果确认时，攻守双方英雄递归移除                                                         |
| `ONE_DAY`                    | 新的一天，从全局根节点递归移除                                                               |
| `ONE_WEEK`                   | 给予时设 `turnsRemain = daysInWeek + 1 - dayOfWeek`，每天递减                                 |
| `N_TURNS`                    | 战斗每轮开始递减（第一轮跳过，保留开场法术的完整时长）                                       |
| `N_DAYS`                     | 每天递减                                                                                     |
| `UNTIL_BEING_ATTACKED`       | 单位受到伤害时移除                                                                           |
| `UNTIL_ATTACK`、`UNTIL_OWN_ATTACK` | 每次攻击（含反击）后、只在主动攻击后移除                                                |
| `STACK_GETS_TURN`            | 单位轮到行动时移除                                                                           |

`reduceBonusDurations(选择器)`：在本节点自有的修正里挑出匹配项，`turnsRemain` 减 1，不大于 0 就移除，再对子节点递归。

#### 3.4.2 节点图：谁继承谁

每个节点有两张父表：`parentsToInherit`（用来继承，包括"只作来源"的父节点）与 `parentsToPropagate`（真实父节点）。
兵种、神器、船这类节点"只作来源"（`actsAsBonusSourceOnly`）。实际层级：全局效果节点下挂队伍，队伍下挂玩家，玩家下挂英雄、城镇与无主军队；
英雄在城里时改挂到"城镇与访客"节点；英雄下挂军中各队（每队另以"只作来源"方式挂兵种节点），神器以"只作来源"方式挂到英雄上；
战斗时双方军队挂到战场节点，战斗中的单位挂到对应的常驻部队上。**于是军中一队兵的修正列表 = 兵种基础值 + 英雄 + 英雄的神器 + 玩家 + 队伍 + 全局 + 战场**。

#### 3.4.3 查询流水线

```
getAllBonuses(selector, cacheKey):
  if 节点版本未变 且 有缓存: 返回缓存
  all = getAllBonusesRec()
      // 先递归收集所有父节点, 再加本节点自有修正
      // 每经过一层, 对带 updater 的修正以"该层节点"为上下文生成更新后的副本
      //   例: TimesHeroLevelUpdater 只在经过英雄层时乘以英雄等级; TimesStackLevelUpdater 只在部队层乘以经验等级
  accepted = limitBonuses(all)          // 以查询节点为上下文做限制器的不动点迭代, 见下
  accepted.stackBonuses()               // 去重与叠加键互斥, 见 3.4.4
  缓存并返回 selector 筛出的子集
```

限制器的判定有四个值：`ACCEPT`、`DISCARD`、`NOT_SURE`、`NOT_APPLICABLE`。`limitBonuses` 反复扫描未决列表，接受者移入已接受、丢弃者移出、
`NOT_SURE` 留待下一轮，直到某一轮没有任何变化；剩余的 `NOT_SURE` 一律丢弃；同一法术多个熟练等级的效果只保留最高的一组。
这让"依赖其他修正的修正"（如 `HasAnotherBonusLimiter`：已接受列表里有某类修正、且其值落在区间内才生效）可以正确求值。
推论：带 `CCreatureTypeLimiter` 的修正在英雄节点上查询时判为不适用，在兵节点上才被接受，**同一条修正在不同节点上看到的值不同**。

失效：任何挂接、解挂、增删修正都让全局计数器自增，并把本节点与整个子树的版本号设为新值；缓存按版本号判断。

传播器的方向是"往上抬"（已核实 `propagateBonus` 与 `getRedChildren`）：带传播器的修正从来源节点出发沿祖先方向走，遇到类型匹配的节点就加进去，
之后再经普通继承流到该节点的整棵子树。例：城堡建筑写 `"propagator": "PLAYER"`，从城镇抬到玩家节点，于是该玩家的所有英雄、城镇、兵都拿到；
战场范围的修正抬到战场节点后，常配合"只对敌方"限制器与所有者更新器。挂接时会把新子节点及其"红色祖先"（如英雄身上的神器）带传播器的修正重新传播，解挂时对称撤销。

#### 3.4.4 合成：`stackBonuses` 与 `totalValue`（最关键）

```
stackBonuses():
  1 按指针去重（同一条修正可能经多条路径收集到）
  2 排序键: stacking, type, subtype, valType, 最后按 abs(val) 降序
  3 线性扫描相邻对: 当前项 stacking 为空或为 "ALWAYS" 则保留;
    否则若与上一项 stacking、type、subtype、valType 都相同, 删除当前项
  效果: 同叠加键且同类型、子类型、值类型的修正中只保留 abs(val) 最大的一条（来源不同也互斥）

totalValue(baseValue):
  if 列表为空: return baseValue
  第一遍: 收集"按来源放大"的百分比
     PERCENT_TO_SOURCE: pctBySource[b.source] += b.val
     PERCENT_TO_TARGET_TYPE: 有 targetSourceID 则只放大该来源对象, 否则 pctBySource[b.targetSourceType] += b.val
  第二遍: 每条修正先被自己来源的百分比放大, 再归入值类型桶
     v = b.val * (100 + p) / 100      // 兵种能力来源向远离 0 取整, 其余向 0 截断
     BASE_NUMBER -> base; PERCENT_TO_BASE -> pctBase; ADDITIVE_VALUE -> add; PERCENT_TO_ALL -> pctAll
     INDEPENDENT_MAX -> 取最大（含义: 结果至少为 v）; INDEPENDENT_MIN -> 取最小（结果至多为 v）
  base = (baseValue + Σbase) * (100 + pctBase) / 100
  base += add
  first = base * (100 + pctAll) / 100
  上下限冲突（indMin < indMax）时以上限为准
  if 存在非 INDEPENDENT 修正: return clamp(first, indMax, indMin)
  只有上下限两类: 取二者中点; 只有一类: 取该值   // 此时忽略 baseValue
```

即：`((基础 + BASE) × (1 + PERCENT_TO_BASE) + ADDITIVE) × (1 + PERCENT_TO_ALL)`，再以 INDEPENDENT 钳制。JSON 中 `AT_LEAST` 与 `AT_MOST` 是两个钳制类型的别名。

#### 3.4.5 伤害公式（`scripts/damage/damageCalculator.lua`）

```
单只生物基础伤害区间 [mn, mx]（各至少 1）; 只被诅咒取 (mn, mn), 只被祝福取 (mx, mx)
baseMin = mn * count; baseMax = mx * count
raising = 1.0; lowering = 1.0
for 每个系数 f:
    f > 0: raising += f                      // 正系数相加
    f < 0: lowering *= (1 + max(-1, f))      // 负系数相乘, 单个最多抵消 100%
damage = (max(1, floor(baseMin * raising * lowering)), max(1, floor(baseMax * raising * lowering)))
```

系数清单（正）：攻防差 `adv = 攻击 - 防御`，大于 0 时 `min(0.05*adv, 3.0)`；进攻术或箭术 `PERCENTAGE_DAMAGE_BOOST/100`；祝福类 `GENERAL_DAMAGE_PREMY/100`；
幸运一击 +1.0；冲锋 `冲锋距离 * JOUSTING/100`；致死一击 +1.0；对特定兵种双倍伤害；仇恨 `HATE/100`。
（负）：攻防差小于 0 时 `-min(0.025*(-adv), 0.7)`；铠甲术 `GENERAL_DAMAGE_REDUCTION` 中非法术来源部分；护盾类法术；远程距离惩罚 -0.5；隔墙 -0.5；
致盲与麻痹；不幸 -0.5；遗忘；石化。常量来自 `config/gameConfig.json` 的 `combat` 段：`attackPointDamageFactor 0.05`、`attackPointDamageFactorCap 3.0`、
`defensePointDamageFactor 0.025`、`defensePointDamageFactorCap 0.7`。

伤亡：`killedBy(d) = d < 首只剩余血量 ? 0 : min(1 + floor((d - 首只剩余血量) / 单只最大血量), count)`。实际结算（`BattleInfo::getActualDamage`）：
区间两端不等时，在区间内均匀抽 `k = min(10, 攻方数量)` 次取平均。反击估算（`battleEstimateDamage`）分别以"守方挨了最小伤害后"与"挨了最大伤害后"的状态各跑一次反向攻击，取包络。

士气与幸运用带偏置的随机（`lib/callback/GameRandomizer.cpp` 的 `RandomizationBias::roll`）：每个军队对好运、坏运、高士气、低士气各有累积量，
成功则累积量减、失败则加，降低连续好运或坏运；骰子 `moraleDiceSize 24`、`moraleBias 8`、`goodMoraleChance [1,2,3]`、`badMoraleChance [2,4,6]`；
默认 `badLuckChance` 为空，所以负幸运在默认配置下无效。

#### 3.4.6 英雄如何作用于部队

- 四维：英雄的攻击与防御是挂在英雄节点上的 `PRIMARY_SKILL` 修正（来源英雄基础属性、值类型默认加法），没有传播器；军中各队是英雄的子节点，
  所以一队兵的攻击 = 兵种 `BASE_NUMBER` + 英雄的加法项 + 神器、建筑、法术的部分。
- 副技能（`config/skills.json`，每级的修正挂在英雄节点上，来源副技能）：

| 技能         | 修正类型 / 子类型                              | 值类型            | 初级 / 中级 / 高级 |
| ------------ | ---------------------------------------------- | ----------------- | ------------------ |
| offence      | `PERCENTAGE_DAMAGE_BOOST` / 近战               | `BASE_NUMBER`     | 10 / 20 / 30       |
| archery      | `PERCENTAGE_DAMAGE_BOOST` / 远程               | `BASE_NUMBER`     | 10 / 25 / 50       |
| armorer      | `GENERAL_DAMAGE_REDUCTION` / 全部              | `BASE_NUMBER`     | 5 / 10 / 15        |
| leadership   | `MORALE`                                       | `BASE_NUMBER`     | 1 / 2 / 3          |
| luck         | `LUCK`                                         | `BASE_NUMBER`     | 1 / 2 / 3          |
| tactics      | `BEFORE_BATTLE_REPOSITION`                     | `BASE_NUMBER`     | 2 / 4 / 6          |
| logistics    | `MOVEMENT` / 陆地                              | `PERCENT_TO_BASE` | 10 / 20 / 30       |

  它们最终作为 3.4.5 的系数生效：进攻术、箭术是正系数，与其他正系数相加；铠甲术是负系数，与其他负系数相乘。
- 专长：兵种专长生成"该兵种攻防按 `PERCENT_TO_TARGET_TYPE` 放大兵种能力来源"的修正，值 `specialtyCreatureGrowth`（5），配 `TimesHeroLevelUpdater(stepSize = 兵种等级)`，
  效果为兵种基础攻防乘以 `1 + 5% * floor(英雄等级 / 兵种等级)`；副技能专长让该技能自身修正乘以 `(100 + 5*level)/100`（例：10 级进攻术专家，高级 30 变 45）。
- **"乘数"的真实含义**：战斗数学里英雄不是一个显式乘法项。它把点数加到每一队，再经攻防差换成伤害倍率；技能百分比进入 raising 或 lowering；士气与幸运带来额外行动或伤害。
  因为伤害 = 单只基础伤害 × 数量 × 倍率，英雄的效果天然与部队规模成正比，等价于乘在整支部队上。
- 上限：攻防差的贡献分别封顶 3.0 与 0.7；单个负系数最多抵消 100%，任何伤害至少 1；士气与幸运有钳制；**进攻类正系数没有总上限**。
- AI 视角的显式乘数（`CGHeroInstance.cpp`）：`getFightingStrength = sqrt((1+0.05*A)*(1+0.05*D))`，`estimateHeroCombatValue = 英雄强度 * 部队战斗价值`
  （部队战斗价值 `getAIValue(兵种) * count`，源码 TODO 注明此处未计英雄与神器修正）。

#### 3.4.7 Nullkiller2：目标分解与分档优先级

```
makeTurn:
  resetState（清锁定资源与锁定英雄）
  for pass in 1..maxPass:
     优先轮: 反复从 招募英雄、买兵、建造 三个行为中分解出任务, 取最高优先级执行, 直到没有正分任务（至多 maxPriorityPass 次）
     预留城防所需兵力
     tasks = 分解(占领对象, 1) + 分解(集群, 10) + 分解(防守, 10) + 分解(逃离, 1) + 分解(集结军队, 10) + 分解(探索, 10)
     为每个任务建一次评估上下文（并行）
     for tier in INSTAKILL, INSTADEFEND, KILL, 单向传送探测, ESCAPE, EXPLORE_AND_GATHER, DEFEND:
         selected = 按本档规则打分并过滤; 非空则停
     selected 按优先级降序; TaskPlan::mergeAndFilter 去冲突（同一英雄或影响同一对象的任务互斥, 保留高分者）
     逐个执行; 失败时按情况重规划、试下一个或结束回合
     本 pass 毫无成功: 结束回合
```

- 分解（`Engine/DeepDecomposer.cpp`）：行为本身也是目标，`decompose` 得到子目标；栈式深度优先展开，遇到可执行的叶子时把"根到叶"整条路径打包成 `Composition`
  （根提供奖励语义，叶是真正要执行的动作）；防环（祖先链上出现等价目标）；带哈希的目标做分解缓存并回填祖先。
- 威胁热力图（`Analyzers/DangerHitMapAnalyzer.cpp`）：对记忆中可见的敌方英雄做寻路，每个格子记 `danger = 英雄强度 * 部队战力`、到达回合 `turn`，
  `value() = danger / sqrt(turn/3 + 1)`；保留价值最大与最快到达的两条。城防判断"威胁可控"：存在一条路径使 `我方强度 / 威胁 > 2`（`THREAT_IGNORE_RATIO`）且能更早到达。
- 战损估计：`ratio = danger / (armyValue * heroStrength)`，`loss = armyValue * ratio^2`。
- 评估上下文（`EvaluationContext`）由十余个构建器累加：移动成本、参与英雄数、危险、战损比、敌方英雄危险比、金币奖励、军队奖励、军队成长、技能奖励、
  战略价值、征服价值、是否防守等。分档打分示例：INSTAKILL 要求本回合、移动成本小于 1、战损比不超过"愿意损失的上限"
  `maxWillingToLose = min(maxArmyLossTarget / powerRatio, 1)`，分数 `armyInvolvement * conquestValue * (1 - 战损比)`；
  INSTADEFEND 分数 `1/(1 + abs(投入兵力 - 0.75*威胁) / 威胁)`（希望投入约为威胁的 75%）；探索与集结档把金币、技能、军队奖励按英雄角色加权求和；
  最后统一做移动修正 `cost < 1` 时除以 `cost^0.6`，否则除以 `0.75 + cost^1.3`。
- 难度配置（`config/ai/nk2ai/nk2ai-settings.json`，五档 pawn、knight、rook、queen、king）：`maxPass` 5 / 10 / 40 / 40 / 40，`maxPriorityPass` 2 / 5 / 40 / 40 / 40，
  `threatTurnDistanceLimit` 1 / 3 / 5 / 5 / 5，`maxArmyLossTarget` 0.65 / 0.50 / 0.35 / 0.35 / 0.35，`safeAttackRatio` 均为 1.1。**难度只改规划深度、威胁视距与风险偏好**。
- 英雄角色（`HeroManager`）：按战斗力评分排序，前 `clamp(城镇数 + 大地图系数, 1, 城镇数*2)` 名为主力，其余为侦察。

#### 3.4.8 BattleAI：攻击选项与交换模拟

- `AttackPossibility::evaluate`：对每个出手格，模拟攻击（含多次攻击、溅射、反击、射手被贴身的收益），按单位计"对敌方战力的削减"：
  `calculateDamageReduce = 单只价值 * (0.5*击杀数 + 0.5*血量折算)`，其中血量折算用曲线 `hpFunction(s, e) = (2/3)*(4 - s - e)*(s - e)/2`（打掉最后一段血更值钱）；
  `damageDiff = 敌方削减 - 我方被反击削减 - 误伤 + 堵射手收益`。
- `BattleExchangeEvaluator::calculateExchange`：收集本回合内能到达目标周围的所有单位，按行动顺序在假想战场副本（`HypotheticBattle`，按需复制单位）上模拟若干回合
  （`simulationTurnsCount`：难度低于 4 为 2，否则 10），双方都挑对对方伤害最大的目标；
  分数 `scoreValue = 敌方削减 - 我方削减 * negativeEffectMultiplier`，`negativeEffectMultiplier = strengthRatio >= 1 ? 1 : strengthRatio^2`：
  **我方弱时低估自己的损失，打法更敢换**；需要先走过去的攻击按 `1 - min(0.2, 0.05*turn)` 打折。
- `selectStackAction`：攻击分不低于移动分时攻击（必要时先等待），误伤过半且分数为负时防御；英雄施法要求"施法后最佳行动分"高于不施法。
- 假想单位 `StackWithBonuses` 的修正列表 = 原列表减去移除项、加上更新项与新增项；源码 TODO 注明不重跑限制器与叠加。

#### 3.4.9 建筑树数据

阵营文件只写与通用库（`config/buildingsLibrary.json`）的差异，最终定义是两者合并。前置 `requires` 是逻辑表达式：数组首元素为 `"allOf"`、`"anyOf"`、`"noneOf"` 时其后每项是子表达式，
单个建筑名是值节点；`genBuildingRequirements` 隐式补上"被升级的基础建筑"并递归展开前置的前置。建筑的 `bonuses` 以建筑来源生成修正，走完整的 Bonus 规则。
（城镇建造本身属城建调研范围，此处只说明数据形状。）

### 3.5 对《箱庭纪》的借鉴（分析）

**字段对照：我们的合同与 VCMI 的 Bonus**

| 我们（经济第 7.1 节）                          | VCMI                                                  | 建议                                                                                                           |
| ---------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `channel`（封闭通道表）                        | `type` 加 `subtype`                                   | 保持封闭；子类型对应"通道内的细分键"（如兵种类别、商品标签），通道表本身不扩张                                 |
| `op: mul 或 add`                               | 八种 `valType`                                        | 扩为五类即可：基础值、对基础的百分比、加法、对全部的百分比、钳制下限与上限；对应固定合成顺序                     |
| `scopeKind` 加 `scopeIds`                      | 节点图加 `propagator`                                 | 作用域写成"挂在哪个节点 + 是否上抬到某类祖先"，比枚举作用域更能表达"对全国所有兵团生效"                        |
| `duration`、`decay`                            | `duration` 位掩码加事件驱动到期                       | 增加事件型期限："本场战斗""直到被攻击""直到下次行动"，对女神神迹与战场光环有用                                   |
| `stacking: { group, sameSource, maxStacks }`   | `stacking` 字符串，同键只留 `abs(val)` 最大一条       | 保留我们的组语义；同组冲突时显式选 max 或 min，不按绝对值                                                       |
| `visibility`、`revealedTo`                     | `hidden`                                              | 我们更细，保持                                                                                                 |
| `trace`                                        | `source`、`sid`、`description`                        | 我们更细，保持；可借"来源类型 + 来源编号"作为追溯链的最小单元                                                   |
| 无                                             | `limiter`（四值判定、不动点）                          | 新增"条件"字段：如"仅对骑兵""仅在森林郡""仅当该国已有某条约"，依赖其他修正的条件用不动点求值                     |
| 无                                             | `updater`（按节点层改值）                             | 新增"缩放规则"：如"随将领统帅值缩放""随国家规模缩放"                                                             |

**可以直接借的方法**

1. **固定合成顺序**：`((基础 + 基础项) × (1 + 对基础百分比) + 加法项) × (1 + 对全部百分比)`，最后钳制。把它写进合同，配合 FreeOrion 的"阶段"表达力相当，而且更容易让 UI 逐行解释。
2. **正项相加、负项相乘**：伤害与减伤的系数按此组合，保证减伤永远不超过 100%、增伤是线性可读的。我们 B 层期望值公式里的"克制系数 × 侧背系数 × 地形系数 × 士气系数 × 疲劳系数 × 修正项"
   全部连乘（RTS 2.2；英雄光环先相加封顶 0.3 再乘一次；注册修正项不进这条公式，只改开战士气），多个大于 1 的系数叠在一起会指数放大；可考虑把"增益类"改为相加后再乘一次。
3. **攻防差封顶**：英雄与将领的点数经"差值每点 x%、封顶 y"换算，比直接给百分比更不容易失控；这是"英雄是乘数（封顶）"的另一种写法，可用于将领的统帅、勇武对兵团的作用。
4. **伤害区间 + 按兵数取样平均**：确定区间、在区间内抽 `min(10, 兵数)` 次取平均，兵越多方差越小；与我们"每个兵团每个内核步（0.2 秒）抽一次 0.9 到 1.1 的波动"（设计 RTS 2.2 写的是每秒一次）相比，这个规则让大兵团天然稳定，可作为波动收窄的依据。
5. **目标分解 + 分档优先级 + 去冲突**：适合我们战役层规划（SLG 3.2 第 4 步）：意图（根，带奖励语义）分解为任务链（叶，可执行），评估上下文沿链累加，
   先按硬性分档过滤（"能立即歼灭""必须立即防守"优先于"探索与积累"），再在档内加权；同一军队或同一郡的任务互斥。难度只调规划深度与风险偏好（`maxArmyLossTarget`）。
6. **交换模拟与弱者系数**：AI 将领评估作战方案时模拟若干回合的双方最优反应，弱势一方用 `ratio²` 低估自身损失，避免"弱者永远龟缩"。

**要改造的点**

- 叠加键按 `abs(val)` 比较会让 -5 胜过 +3，且不同来源也互斥：我们改为同组按方向显式取 max 或 min，来源互斥要逐组声明。
- `PERCENT_TO_SOURCE` 只在同一次查询筛出的列表内生效，UI 很难解释"为什么这个值被放大"；若采用，放大关系要进追溯链。
- 只有钳制类修正时忽略基础值，是隐蔽的坑；我们的合同规定"修正项只能在基础规则算出的值上加减乘，不能替换公式"（经济 7.3），应禁止这种情形。

**不要学的坑**

- 进攻类正系数没有总上限：多个百分比叠加可以失控；我们的通道总上限（经济 7.3）必须保留。
- 假想战场副本不重跑限制器与叠加：评估与实战口径不一，会让 AI 的预测偏离；我们的 AI 评估应调用与内核相同的修正求值。

**对照我们现有实现**：`applyModifiers` 相当于只有"对全部百分比（连乘）+ 加法"两桶且顺序与 VCMI 相反（我们先乘后加），没有基础项、条件与缩放；叠加键只有同源同组刷新（`stackGroup`），通道合计按 `CHANNEL_BOUNDS` 钳制；
`heroes.ts` 的 `CAST_KILL_CAP` 是"单次击倒上限"，VCMI 没有对应物，是我们自己的保险。

### 3.6 许可与复用边界

GPL-2.0-or-later。本作只借方法：上文伪代码为转述，引用的仅为单行公式与常量（`attackPointDamageFactor` 等四个战斗常量、副技能数值表、`hpFunction`、
`negativeEffectMultiplier`、难度配置数值）。不得拷贝源文件、Lua 脚本或配置 JSON。原版《英雄无敌 3》素材与 VCMI 无关，更不可用。

---

## 4. The Battle for Wesnoth

### 4.1 信息表

| 项             | 内容                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 索引条目       | `#native-162`                                                                                                                                                                              |
| 仓库与固定提交 | `https://github.com/wesnoth/wesnoth`，`dc63f40dd0279f7895b7d86f68e665a18ca9da28`（2026-11-14）                                                                                              |
| 代码许可       | GPL-2.0-or-later（`COPYING`、源文件头 `copyright`）                                                                                                                                         |
| 素材许可       | 逐文件登记于 `copyrights.csv`：多数为 GNU GPL v2+，部分音乐等为 CC BY-SA 4.0                                                                                                                 |
| 语言与规模     | C++（引擎、AI、战斗）加 WML（数据与脚本语言）加 Lua（部分 AI 候选动作与 WML 标签实现）                                                                                                      |
| 本地镜像       | `D:\hakoniwa_refs\wesnoth`，已检出 `src/ai/`、`src/actions/`、`src/game_events/`、`data/ai/` 以及 `src/` 根下的文件（含 `src/attack_prediction.cpp/.hpp`）；`data/core/macros/*.cfg`、`data/game_config.cfg`、`src/units/abilities.cpp` 等以 `git show` 读取 |
| 分级           | 必读                                                                                                                                                                                       |

### 4.2 值得看的理由

| 《箱庭纪》条目                                                                                                      | Wesnoth 给什么                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [RTS 2.4 共用内核：估算档"只出预估"](../../40_design/systems/warfare_rts.md)、2.5 标定、SLG 5.5 自动结算              | `src/attack_prediction.cpp`：一次交战后双方生命值的**完整概率分布**（死亡概率、不受伤概率、期望生命值、中毒与减速概率），并与实战共用同一个单方数值构造函数 |
| RTS 第 7 节 AI 将领、ai_architecture 6.7"作战方案菜单"                                                              | RCA（Register Candidate Action）循环：候选动作带固定上限分数，每次只执行最优者的一步，执行不改变局面则本回合拉黑                                              |
| 人格参数如何进入打分                                                                                                | 攻击评分 `attack_analysis::rating` 中 `aggression` 只缩放"自身损失"、`caution` 只缩放"地形暴露"，参数各有单一职责                                              |
| RTS 4.4 将领成长、兵团老兵等级                                                                                      | 经验公式 `kill_xp`、`combat_xp`，晋升与满级后的进阶（AMLA）                                                                                                      |
| RTS 4.2 光环、修正项同类合成                                                                                        | `leadership`（每差一级 +25%）、`illuminates` 与时段加成的合成规则：同类取最高、不同类相加、抗性独立相乘                                                         |
| 任务与事件（本作纷争、会盟、战争事件的触发）                                                                        | WML 事件系统：处理器是纯数据（名字、编号、一次性、优先级、过滤器、动作），事件泵队列加深度上限                                                                  |

### 4.3 源码导读

| 想弄懂                       | 就读这些文件与符号                                                                                                                                                                                                                         | 该处的机制                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 战斗结果概率分布             | `src/attack_prediction.hpp/.cpp` 的 `combatant`（`hp_dist`、`untouched`、`poisoned`、`slowed`、`fight`、`average_hp`）、`prob_matrix`、`probability_combat_matrix`（`receive_blow_a/b`）、`monte_carlo_combat_matrix`、`complex_fight`、`no_death_fight`、`one_strike_fight`、`fight_complexity`、`MONTE_CARLO_SIMULATION_THRESHOLD` | 二维（攻方血量 × 守方血量）概率表逐击更新；复杂度超阈值改为 5000 次模拟              |
| 单方数值（命中、伤害、出手数） | `src/actions/attack.hpp/.cpp` 的 `battle_context_unit_stats`、`battle_context`（`better_combat`、`choose_attacker_weapon`、`choose_defender_weapon`）、`swarm_blows`；`src/utils/math.hpp` 的 `round_damage`；`src/units/attack_type.cpp`；`src/units/unit.cpp` 的 `resistance_value` | 预测与实战共用同一个构造函数                                                       |
| 实战循环                     | `src/actions/attack.cpp` 的 `attack::perform`、`attack::perform_hit`、`attack::refresh_bc`、`biased_rng::roll_hit`                                                                                                                         | 逐击掷骰；每次事件后重建数值                                                       |
| AI 主循环                    | `src/ai/composite/rca.hpp/.cpp` 的 `candidate_action`（`evaluate`、`execute`、`BAD_SCORE`、`HIGH_SCORE`）；`src/ai/default/stage_rca.cpp` 的 `candidate_action_evaluation_loop::do_play_stage`；`src/ai/gamestate_observer.cpp`；`data/core/macros/ai_candidate_actions.cfg` | 固定上限分数 + 动态评估 + 一步执行 + 失败拉黑                                      |
| 攻击怎么打分                 | `src/ai/default/attack.cpp` 的 `attack_analysis::analyze`、`attack_analysis::rating`；`src/ai/default/aspect_attacks.cpp` 的 `do_attack_analysis`、`rate_terrain`；`src/ai/contexts.cpp` 的 `power_projection`                             | 组合攻击的期望收益、损失、地形暴露、支援与脆弱度                                     |
| 招募                         | `src/ai/default/recruitment.cpp` 的 `recruitment::execute`、`update_important_hexes`、`compare_unit_types`、`do_combat_analysis`、`update_state`、`get_estimated_income`                                                                     | 地图关键格、兵种对抗分析、期望兵种构成、存钱滞回                                     |
| 经验与晋升                   | `src/game_config.hpp` 的 `kill_xp`、`combat_xp`；`src/actions/advancement.cpp` 的 `advance_unit_at`、`get_advanced_unit`、`get_amla_unit`；`data/core/macros/amla.cfg` 的 `AMLA_DEFAULT`                                                     | 击杀经验按等级，满级后循环进阶                                                     |
| 光环合成                     | `src/units/abilities.cpp` 的 `unit_abilities::effect`；`src/actions/attack.cpp` 的 `under_leadership`；`tod_manager::get_illuminated_time_of_day`                                                                                          | 按 priority 分组，组内同 id 取最大、不同 id 相加或连乘，最后钳制                     |
| WML 事件                     | `src/game_events/handlers.hpp/.cpp` 的 `event_handler`；`src/game_events/manager.cpp`、`manager_impl.cpp`；`src/game_events/pump.hpp/.cpp` 的 `wml_event_pump`、`queued_event`；`src/game_events/action_wml.cpp`；`data/lua/wml-utils.lua` | 处理器数据化、过滤器可序列化、动作注册表、一次性先禁用再执行、泵的嵌套与深度保护      |

### 4.4 机制拆解

#### 4.4.1 战斗结果概率分布（核心）

**数据模型**（`combatant`）：

- `hp_dist[h]`：战后生命值恰好为 h 的概率，h 从 0 到最大生命；`hp_dist[0]` 就是死亡概率。
- `summary[0]`、`summary[1]`：未减速与已减速两种状态下的生命分布，二者之和为 `hp_dist`。
- `untouched`：一次都没被击中的概率；`poisoned`、`slowed`：战后处于该状态的概率。
- 链式战斗：构造时传入上一场的守方结果，继承其分布。于是"多支部队依次攻击同一目标"的预览，守方从上一场的**分布**出发，而不是从一个确定的生命值出发。

**概率表**（`prob_matrix`）：行是攻方生命（0 到最大），列是守方生命（0 到最大），共四个平面对应"攻方是否减速 × 守方是否减速"，只分配可能用到的平面；
每个平面维护已用行与已用列集合（稀疏优化）；初值是两方分布的外积；第 0 行与第 0 列是吸收态（死者不再出手也不再挨打）。

**一次出手**（以攻方打守方为例，`receive_blow_b(p)`）：

```
for 源平面 src 倒序（避免重复搬运）:
    dst = 攻方有减速攻击 ? (src 加上"守方已减速"位) : src
    damage = (src 中攻方已减速) ? 攻方减速后伤害 : 攻方伤害
    对每个存活行 r、存活列 c: 把 val * p 搬走
        c < damage（致命）: 搬到 (clamp(r + 吸血量(按实际打掉的 c 计), 1, 攻方最大), 0)
        否则:               搬到 (clamp(r + 吸血量(按 damage 计), 1, 攻方最大), c - damage)
```

**完整计算**（`complex_fight`）：

```
rounds = max(双方回合数)                 // 狂暴（berserk）为 30, 否则 1
max_attacks = max(双方出手次数)
do:
    for i in 0..max_attacks-1:
        if i < 攻方出手数: 攻方出手 receive_blow_b(攻方命中率)
        if i < 守方出手数: 守方出手 receive_blow_a(守方命中率)
while --rounds 且 任一方死亡概率 < 0.99   // 狂暴打到一方死亡率达到 99% 或 30 轮用完
```

- 出手顺序：若对手有先手（firststrike）而自己没有，交换双方再算，所以矩阵里永远是"A 先 B 后"交替；双方都有先手时攻方先。
- 升级：若"本场交战经验"足以升级，则所有存活质量并入"满血、未减速"行（`forced_levelup`）；若只有"击杀经验"足以升级，则只把对手死亡那一列的存活质量并入满血行（`conditional_levelup`）。
  **AI 与预测都把"升级等于满血"算进期望值**。
- 石化：先当作秒杀算，事后把被假秒杀的质量搬回（注释承认只对第一场精确）。

**快速路径**（`do_fight`）：仅在双方都无减速、吸血、石化且只打一轮时启用：双方都至多 1 击用一维向量直接算（`one_strike_fight`）；
若"这一场谁都打不死谁"（出手数乘伤害小于对方可能的最小生命），双方伤害独立，各做一次二项式卷积（`no_death_fight`）；其余走完整矩阵。
蜂群（swarm）的出手数随生命变化，若生命已是分布，就按"出手数相同"的生命区间切片，对每对切片各算一次再按概率合并。

**蒙特卡洛回退**：`fight_complexity = 切片数乘积 × 减速平面倍数 × 攻方最大生命 × 守方最大生命`，超过 `MONTE_CARLO_SIMULATION_THRESHOLD = 50000u`（且用户偏好允许）时，
改用 `monte_carlo_combat_matrix` 跑 `NUM_ITERATIONS = 5000u` 次随机模拟，按结果计入矩阵再除以 5000。若开启了"偏置随机"模式，预测总是走模拟。

**输出**：死亡概率 `hp_dist[0]`、`untouched`、期望生命 `average_hp(治疗量)`、生命分布条形图、中毒与减速概率。中毒概率按"原本已中毒且未被碰、已中毒且被碰、原本健康且被碰"三类累加，
并考虑"击杀即升级、升级解毒"。

#### 4.4.2 单方数值：预测与实战共用

`battle_context_unit_stats` 一个构造函数同时服务预测、AI 与实战：

```
命中率: base = 守方所在地形的"被命中率"（如 60）
        cth = clamp(base + 武器精度 - 对方格挡, 0, 100)
        再套 [chance_to_hit] 特技: magical 固定 70（不累加）; marksman 为"至少 60"（累加模式下取 max）, 只在进攻时
伤害:   base_damage = 套过 [damage] 特技的武器伤害（冲锋、背刺为乘 2）
        mult = 100 + 时段修正 + 领导力
             时段: lawful +lb, chaotic -lb, liminal 取"最大值 - abs(lb)", fearless 时下限 0
        mult *= 守方对该伤害类型的承伤百分比（如 80 表示 20% 抗性）
        damage = round_damage(base_damage, mult, 10000); 减速时 round_damage(base_damage, mult, 20000)
出手数: 套 [attacks] 特技; 蜂群按生命比例在最小与最大之间插值
```

`round_damage`（`src/utils/math.hpp`，转述为单行公式）：基础伤害为 0 时返回 0，否则
`max(1, (base_damage * bonus + rounding) / divisor)`，其中 `rounding = divisor/2 - (bonus <= divisor 或 divisor == 1 ? 0 : 1)`。
含义：四舍五入，恰好一半时向基础伤害一侧取整；非零伤害至少为 1。例：基础 7、白天守序 +25 加领导力 +25，`mult = 150 * 100 = 15000`，`(7*15000 + 4999) / 10000 = 10`。
时段与领导力**相加**后再与抗性**相乘**。

武器选择：`better_combat` 先比"对方死亡率 - 我方死亡率 × 伤害权重"，差值超过 0.01 定胜负；否则比期望生命与中毒期望的加权；再持平比伤害。
守方从同射程武器中选对自己最好的反击；攻方对每把武器先求守方最优反击，再挑对自己最好的。AI 传入 `harm_weight = 1 - aggression`；界面默认选中武器用 0.5。

实战（`attack::perform`）用同一个 `battle_context` 求出命中率、伤害与出手数，逐击掷骰（`rand(0..99) < cth`，偏置模式改用 `roll_hit`）；
每次命中、击杀、石化等事件之后 `refresh_bc()` 重建数值，因为事件脚本可能改了单位。预测与实战的差异来源只有：狂暴在 99% 处截断、石化只对首场精确、AI 的数值缓存、蒙特卡洛采样误差。

偏置随机（`biased_rng::roll_hit`）：`expected = (cth * 剩余出手数 + credit) / 100`，在 `[0, 剩余出手数 - 1]` 取随机整数，小于 expected 判命中，
`credit += cth - (命中 ? 100 : 0)`：类似发牌的方差压缩，预测必须用同规则模拟。

#### 4.4.3 RCA 主循环

```
do_play_stage（每回合一次）:
  所有候选动作 enable(); 按 max_score 降序排序
  loop:
    best = BAD_SCORE(0)
    for ca in 候选动作:
        if 未启用: continue
        if ca.max_score <= best: break          // 剪枝: 后面的上限都不可能超过当前最好
        s = ca.evaluate()                         // 同时缓存"打算怎么做"
        if s > best: best = s; best_ca = ca
    if best > 0:
        observer = 局面观察器
        best_ca.execute()                         // 只执行缓存的计划的第一步
        if 局面未改变: best_ca.disable()          // "说谎"的候选动作本回合拉黑
        continue loop                             // 执行过就全局重评一次
    else: break
```

默认候选动作与上限分数（`data/core/macros/ai_candidate_actions.cfg`，常量 `BAD_SCORE = 0`、`HIGH_SCORE = 10000000`）：

| 候选动作             | 上限分数 | 备注                                                                                   |
| -------------------- | -------- | -------------------------------------------------------------------------------------- |
| goto                 | 200000   | 有指定目的地的单位                                                                     |
| retreat_injured      | 192000   | 动态分：存在击杀率超过 0.5 的单兵攻击时降到 95000，让战斗先打                           |
| spread_poison        | 190000   |                                                                                        |
| recruitment          | 180000   |                                                                                        |
| move_leader_to_goals | 140000   |                                                                                        |
| move_leader_to_keep  | 120000   |                                                                                        |
| high_xp_attack       | 100010   | 只有"会让敌方升级"的目标能打时抢在 combat 前                                            |
| combat               | 100000   | 组合攻击只用来打分，每次只落实第一步                                                   |
| place_healers        | 96000    |                                                                                        |
| healing              | 80000    |                                                                                        |
| villages             | 60000    |                                                                                        |
| move_to_targets      | 20000    |                                                                                        |
| leader_shares_keep   | 10000    |                                                                                        |
| move_to_any_enemy    | 1000     | 兜底                                                                                   |

固定上限构成字典序优先级，"可行性"让高优先级动作在不可行时自动让路；每走一步全局重评，于是自然串出"招兵、领袖回城堡、再招兵、打一下、撤伤兵、治疗、抢村、推进"的序列，不需要任何显式脚本。

#### 4.4.4 攻击评分

组合生成（`do_attack_analysis`，递归，深度上限 5、结果上限 1000）：对每个敌人，从空组合开始，为每个还能攻击的己方单位挑一个可达的相邻格，
格子评分 `(100 - 被命中率) + 治疗格、村庄加分`，再乘领导力与背刺、夹击系数；累计 `vulnerability`（敌方对该格的威胁投射）与 `support`（友方对该格的投射）。

`analyze()` 沿组合顺序链式模拟（守方分布逐场传递），累计：击杀概率 `chance_to_kill`、目标价值 `target_value = cost * (1 + xp/max_xp)`、
期望损失 `avg_losses`（含升级带来的抵扣）、期望造成与承受伤害、投入资源 `resources_used`、地形质量（攻击站位的被命中率加权）与"不攻击时的最佳地形质量"。

`rating(aggression)`（核心公式，转述）：

```
if 威胁到我方领袖: aggression = 1.0
if 动用领袖:      aggression = leader_aggression（默认 -4.0, 即损失权重 5 倍）
value = chance_to_kill * target_value - avg_losses * (1 - aggression)
if 攻击站位比不攻击更差:
    exposure = (动用领袖 ? 2.0 : caution) * resources_used * (地形差) * vulnerability / max(0.01, support)
    value -= exposure * (1 - aggression)
value += ((目标已损血/3 + avg_damage_inflicted) - (1 - aggression) * avg_damage_taken) / 10
高风险否决: vulnerability > 50 且 > 2*support 且 击杀率 < 0.02 且 aggression < 0.75 且附近没有友军在打 -> 返回 -1
value *= support / (vulnerability * 地形质量)           // 支援多、暴露少则放大
value /= (resources_used/2 + resources_used/2 * 地形质量)
威胁领袖时 value *= 5
```

默认 `aggression 0.4`、`caution 0.25`（`data/ai/utils/default_config.cfg`）。`aggression` 整体缩放"自身损失"的权重，等于 1 表示无视损失，为负表示过度规避；
`caution` 只出现在地形暴露项（以及撤退与领袖最大风险）。源码注释明确写着：拿 rating 与 caution 做阈值比较会让 AI 极度不敢打，所以不要这样做。

#### 4.4.5 招募分析（摘要）

1. 地图分析：与敌人相邻的己方单位格、双方移动代价图的"边界"（离双方都近的那段）、边界附近的村庄，统计这些关键格上的地形分布。
2. 兵种对抗（`compare_unit_types`）：用假单位与"关键地形上的平均防御"做双向模拟，价值比 `伤害 / (对方最大生命 * 我方造价)` 互比，结果按防御差缓存。
3. 打分：对每个可招兵种，对敌方现有单位（不足 5 个时补上敌方招募表）求对抗值加权和，再按"多样性"参数线性映射到 0 到 100；同进阶树的兵种互相分摊；加随机项。
4. 分数表达的是**期望的全军兵种构成**而不是"本次要招什么"：每次招募取 `期望数 - 现有数` 最大的兵种。
5. 存钱：按"我方单位价值 / 敌方单位价值"比值进入或退出存钱状态（进入 1.5、退出 1.1，带滞回），收入按未来 5 回合的村庄与维护费预测。

#### 4.4.6 经验、晋升与光环合成

- `src/game_config.hpp`：`kill_xp(level)` 为 `level ? kill_experience * level : kill_experience / 2`，`combat_xp(level)` 为 `combat_experience * level`；
  `data/game_config.cfg` 中 `kill_experience=8`，`combat_experience` 用代码默认 1。即击杀 0 级单位得 4、交战得 0；经验需求按 `(需求 * experience_modifier + 50) / 100` 缩放。
- 交战双方先各记对方等级的交战经验，击杀时击杀者的经验替换为击杀经验（不叠加）。战后逐次检查升级（最多 20 次支持连升）：换类型、满血、清除中毒减速、经验取溢出值。
- AMLA（满级后进阶，`AMLA_DEFAULT`）：最多 100 次，每次最大生命 +3、经验需求 +20%、满血解毒解减速。
- 光环合成（`unit_abilities::effect`）：按 ability 的 `priority` 分组逐组处理，上一组结果作下一组基值；组内 `value=` 非累加的取最高（负值取最低），
  `add=` 同 id 取最大、不同 id 相加，`multiply=` 同 id 取最大、不同 id 连乘，最后按 `max_value`、`min_value` 钳制。
  领导力宏：`value="(25 * (level - other.level))"`、`cumulative=no`，只影响相邻且等级更低的友军；照明（illuminates）同类取最强并钳在 ±25。
  **结论：同类光环只取最高、不叠加；时段与领导力相加；抗性独立相乘。**

#### 4.4.7 WML 事件系统

- 注册：`[event]` 的系统字段为 `name`（逗号分隔多个名字，可含变量）、`id`（唯一）、`first_time_only`（默认是）、`priority`；过滤子标签 `[filter]`（位置 1 的单位）、
  `[filter_second]`（位置 2 的单位）、`[filter_attack]`、`[filter_side]`、`[filter_condition]`、`filter_formula`，全部为"且"关系；其余子标签构成动作体。
  处理器按优先级降序稳定排序；名字含变量的放进"动态"列表，触发时再插值。
- 触发与泵：`fire(name, loc1, loc2, data)` = 入队加立即泵。泵把共享队列换成本地队列（处理中新入队的事件进新共享队列），嵌套层数超过 65536 报错；
  逐个事件：设置位置变量，复制一份当前处理器列表（本次处理中新增的不执行），名字匹配且过滤通过则执行。**一次性处理器先禁用再执行**，防止动作里再次触发同一事件时重入；
  被禁用的处理器在最外层泵结束时才物理删除，保证遍历中列表不变。
- 动作分派：动作体按顺序遍历子标签，从注册表取对应函数执行（C++ 以宏静态注册，大多数标签由 Lua 实现）；条件标签走条件注册表，未知条件视为通过。
  事件可以中止正在进行的移动或攻击（上下文标志向上合并）。
- 标准事件名：开局 `prestart`、`start`；回合 `turn_N`、`new_turn`、`side_turn`；回合内 `moveto`、`enter_hex`、`sighted`、`recruit`；战斗 `attack`、`attacker_hits`、`attack_end`、
  `last_breath`、`die`；升级 `advance`；结局 `victory`、`defeat`。

### 4.5 对《箱庭纪》的借鉴（分析）

**可以直接借的方法**

1. **预测与实战共用单方数值构造**：这是 D-012"自动结算与手动战斗共用确定性内核"在"胜算预估"层的落地形式。我们的 `autoResolve` 已经是同内核，
   但 RTS 2.4 的"估算档"应当调用与内核相同的单兵数值函数（命中、伤害、出手间隔），而不是另写一套。
2. **输出分布而不是期望值**：胜算预估界面至少给出"我方溃败概率、敌方溃败概率、期望伤亡、不受损概率"四个数。英雄单挑、具名人物决斗、A 层少量单位可直接用"生命值联合分布矩阵"精确计算；
   兵团人数多，矩阵过大，可借 `no_death_fight` 的思想：在"谁都打不垮谁"的区间把双方伤亡当作独立的二项式（或正态近似）卷积，在可能溃败的区间切换到蒙特卡洛。
3. **复杂度阈值切换到蒙特卡洛**：精确算法有成本上限（`fight_complexity` 超 50000 改 5000 次模拟）；我们的战役方程可以保留为最粗一档，按"预算"在三档之间切换，并以内核回归测试标定（RTS 2.5 的 ±10% 要求）。
4. **偏置随机若采用，预测必须同规则**：若我们给关键判定（士气崩溃、斩首、劝降）引入"防连坏运"的随机，胜算预估就只能走同规则模拟。
5. **RCA 作为运营层与 AI 将领的执行骨架**：每个意图或作战方案是一个候选动作，`max_score` 表达优先级，`evaluate` 给出当下可行性与具体计划，每次只执行一步，
   执行未改变局面则本回合拉黑。这正好补上 ai_architecture 6.5"效用兜底"之后的"规则执行"层，也天然满足"世界不等模型"。
6. **人格参数单一职责**：`aggression` 只管"损失权重"，`caution` 只管"地形暴露"，避免一个参数同时影响多处导致调参互相牵制。我们的 `RulerPersona` 与将领 `traits` 可照此拆分。
7. **光环同类取最高**：领导力与照明都是"同类只取最强"，与我们合同"同源刷新不叠加"一致；"每差一级 +25%"是"英雄是乘数"的一种可读写法，可用于将领统帅对低级兵团的加成（注意保持已有的英雄光环上限：伤害与防御各自封顶 0.3；现有光环没有 id、同类相加，要同类取最高须先给光环加 id）。
8. **事件处理器数据化**：会盟、战争事件、纷争节点的触发可以照 WML 的结构写成数据：名字、过滤器（谓词对象可序列化进存档）、动作列表、一次性先禁用再执行、泵深度保护。

**要改造的点**

- Wesnoth 是回合制、单位少、生命小（几十），精确矩阵可行；我们兵团是 5 Hz 连续结算、人数以百计，只能把它的思想用在"估算档"与"单挑档"。
- 招募分析的"期望兵种构成"适合 AI 国家的征兵意图（SLG 5.1），但它依赖大量模拟，我们应限频（每月或战役开始时）并缓存。

**不要学的坑**

- 攻击评分里存在只算不用的残留变量，结果上限对多目标的偏置也未经验证（待核实）；不要照搬常数。
- 石化、狂暴的近似处理会让预测与实战不一致；若我们有类似"必杀"机制，应给出精确或标明是近似。

**对照我们现有实现**：`autoresolve.ts` 已满足"同内核同种子"，但游戏内只有标量 `estimatePower`，界面没有分布信息；编辑器的 `editor/balance/war_sim.ts` `summarizeBattles` 已能多种子批量跑出胜率与伤亡分位数，可作蒙特卡洛档的起点；`strategy/ai.ts` 的日常运营 `runAiOperations` 只有两条规则：野战军向按路线长度最近的敌控郡行军；不涉及玩家的战争中任一方厌倦达 70 或战争分数绝对值达 60 即议和，
没有候选动作的优先级与失败处理，RCA 是直接可用的改进方向。

### 4.6 许可与复用边界

GPL-2.0-or-later，素材以 GPL-2.0+ 为主、部分 CC BY-SA 4.0。本作只借方法：上文伪代码为转述，引用的仅为单行公式与常量
（`round_damage` 的取整公式、`MONTE_CARLO_SIMULATION_THRESHOLD`、`NUM_ITERATIONS`、候选动作分数表、经验公式、默认 aspect 值）。不得拷贝源文件、WML 或 Lua。

---

## 5. Unciv

### 5.1 信息表

| 项             | 内容                                                                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 索引条目       | 非索引补充                                                                                                                                                                                                                                                                     |
| 仓库与固定提交 | `https://github.com/yairm210/Unciv`，`90175e1ff22b107a59964e9df4de682754aa524e`（2026-11-13）                                                                                                                                                                                   |
| 代码许可       | **MPL-2.0**（`LICENSE`，已核实；`README.md` 写明"源代码以 MPL-2.0 提供，另有注明者除外"）；`TextureArraySpriteBatch.java` 为 CC0 1.0                                                                                                                                              |
| 素材许可       | 混合：CC BY-SA 4.0、CC BY 3.0/4.0、CC0 与公有领域（见 `docs/Credits.md`）；README 明确不得使用原版《文明》的任何素材                                                                                                                                                              |
| 语言与规模     | Kotlin（libGDX），JSON 规则集；`core/src/com/unciv/logic/automation/` 下城市、国家、单位三类自动化共二十余个文件，外交管理器与回合管理器合计约一千四百行                                                                                                                         |
| 本地镜像       | `D:\hakoniwa_refs\unciv`，已检出 `core/src/com/unciv/logic/`、`core/src/com/unciv/models/ruleset/unique/`、`android/assets/jsons/Civ V - Gods & Kings/`；`models/ruleset/nation/Personality.kt`、`models/ModConstants.kt`、`view/*.kt`、`ui/components/extensions/FormattingExtensions.kt` 以 `git show` 读取 |
| 分级           | 必读                                                                                                                                                                                                                                                                           |

### 5.2 值得看的理由

| 《箱庭纪》条目                                                                                           | Unciv 给什么                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [SLG 2.3 好感账本](../../40_design/systems/grand_strategy_slg.md)（带来源、玩家能看到为什么）              | `DiplomacyManager.diplomaticModifiers`：按类别存放的外交修正项，意见 = 各项之和；`DiplomacyTurnManager.nextTurnDiplomaticModifiers` 中每类各有回归 0 的速度          |
| SLG 4.2 承诺与可信度（非绑定承诺、背弃者信誉下降、所有国家看得见）                                       | `Demand` 枚举：要求、同意、期限内检测违约、履约奖励、背约惩罚、第三方观察者惩罚的完整生命周期                                                                      |
| SLG 3.2 Utility 兜底、调试视图里的理由                                                                   | `MotivationToAttackAutomation.hasAtLeastMotivationToAttack`：开战动机是一张**带名字的修正项列表**，每项可单独显示                                                  |
| SLG 3.2 规划分解、4.1 宣战须提前公开                                                                     | `DeclareWarTargetAutomation` 与 `DeclareWarPlanEvaluator`：联合宣战、加入战争、直接宣战、秘密准备四种计划，按动机阈值依次尝试                                     |
| SLG 5.6 战争目标与和谈                                                                                   | `DiplomacyAutomation.offerPeaceTreaty` 与 `TradeEvaluation.evaluatePeaceCostForThem`：何时求和、和约附多少金                                                       |
| SLG 3.1 统治者人格                                                                                       | `Personality`：十余个 0 到 10 的人格值与统一的投影函数 `modifierFocus`                                                                                             |
| SLG 2.2 稳定、5.7 战争厌倦                                                                               | Uniques 的条件修正（如"幸福度低于 -10 时产能 -50%"）把阈值惩罚写成数据                                                                                              |
| SLG 9.4 国家层委托                                                                                       | 城市焦点 `CityFocus` 与贪心分配市民、建造自动化 `ConstructionAutomation`                                                                                           |
| SLG 0.2 第 3 条"AI 只读自己的知识层"                                                                     | 视图层 `com.unciv.view`：AI 与界面应只经 `CivView`、`ForeignCivView` 访问游戏状态（迁移中）                                                                        |

### 5.3 源码导读

| 想弄懂                       | 就读这些文件与符号（路径相对 `core/src/com/unciv/`）                                                                                                                                                         | 该处的机制                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| AI 一回合做什么              | `logic/automation/civilization/NextTurnAutomation.kt` 的 `automateCivMoves`、`adoptPolicy`、`issueRequests`、`onDemandViolation`                                                                               | 固定顺序的任务表                                                                 |
| 外交关系的数据与关系档        | `logic/civilization/diplomacy/DiplomacyManager.kt` 的 `RelationshipLevel`、`DiplomacyFlags`、`DiplomaticModifiers`、`opinionOfOtherCiv`、`relationshipIgnoreAfraid`、`addDiminishingModifier`、`smoothedOpinionOfOtherCiv` | 修正项账本、标志倒计时、关系档阈值、平滑意见                                     |
| 修正项怎么随时间变化          | `logic/civilization/diplomacy/DiplomacyTurnManager.kt` 的 `nextTurnFlags`、`nextTurnDiplomaticModifiers`、`revertToZero`、`accumulateToAtMost`、`nextTurnCityStateInfluence`                                       | 每类修正按固定步长回归 0；标志到期触发事件；城邦影响力向静止点回归               |
| 宣战的连锁反应                | `logic/civilization/diplomacy/DeclareWar.kt` 的 `declareWar`、`changeOpinions`、`breakTreaties`                                                                                                                | 对受害者、第三方、盟友分别记修正项                                               |
| 承诺                         | `logic/civilization/diplomacy/Demand.kt`；`DiplomacyManager.kt` 中处理同意与拒绝的函数                                                                                                                         | 承诺生命周期                                                                     |
| 想不想打、打谁、怎么打        | `logic/automation/civilization/MotivationToAttackAutomation.kt`、`DeclareWarTargetAutomation.kt`、`DeclareWarPlanEvaluator.kt`、`DiplomacyAutomation.kt` 的 `declareWar`                                         | 命名修正项列表求和、四种计划按阈值尝试                                           |
| 求和、结盟、谴责              | `DiplomacyAutomation.kt` 的 `offerPeaceTreaty`、`wantsToSignDeclarationOfFrienship`、`wantsToSignDefensivePact`、`denounce`                                                                                    | 动机公式                                                                         |
| 交易估值                      | `logic/trade/TradeEvaluation.kt` 的 `getTradeAcceptability`、`evaluateBuyCost`、`evaluateSellCost`、`evaluatePeaceCostForThem`                                                                                 | 双方报价求差、关系敌对时加价                                                     |
| 人格与难度                    | `models/ruleset/nation/Personality.kt`、`PersonalityValue.kt`；规则集 `Personalities.json`、`Difficulties.json`                                                                                                 | 0 到 10 的人格值与投影；难度为 AI 成本倍率                                       |
| 条件修正与临时修正            | `models/ruleset/unique/UniqueType.kt`、`Unique.kt` 的 `conditionalsApply`、`getUniqueMultiplier`；`Conditionals.kt`；`TemporaryUnique.kt`；规则集 `GlobalUniques.json`                                           | 文本模板 + 参数 + 条件后缀 + 计时后缀                                           |
| 数值怎么汇总                  | `logic/city/CityStats.kt` 的 `StatTreeNode`、`updateFinalStatList`、`updateCityHappiness`；`logic/battle/BattleDamage.kt` 的 `modifiersToFinalBonus`、`damageModifier`；`logic/battle/GreatGeneralImplementation.kt` | 按来源分层的数值树；百分比加成先求和再乘一次；大将军取最大                       |
| 城市委托                      | `logic/city/CityFocus.kt`；`logic/city/managers/CityPopulationManager.kt` 的 `autoAssignPopulation`；`logic/automation/Automation.kt` 的 `rankStatsForCityWork`、`threatAssessment`；`logic/automation/city/ConstructionAutomation.kt` 的 `chooseNextConstruction` | 焦点权重、贪心分配、建造选择                                                     |
| 知识边界                      | `view/View.kt`、`view/GameView.kt`、`view/CivView.kt`、`view/ForeignCivView.kt`                                                                                                                               | 以观察者视角包装游戏状态                                                         |

### 5.4 机制拆解

#### 5.4.1 AI 一回合

`NextTurnAutomation.automateCivMoves` 的顺序：

```
回应弹窗（对方的要求、友谊宣言） -> 回应交易请求
主要国家:
    DiplomacyAutomation.declareWar -> offerPeaceTreaty -> askForHelp -> offerDeclarationOfFriendship
    宗教花费 -> denounce -> 提使馆 -> 提开放边界 -> 提研究协定 -> 提防御条约 -> 检查边境驻军 -> 交换奢侈品
    issueRequests（检查承诺违约） -> adoptPolicy -> 腾出资源
选科技 -> 城市炮击 -> 花金币 -> 保护与勒索城邦
automateUnits（最贵的一步） -> 宗教信条、间谍
automateCities（第二贵） -> 训练开拓者 -> 外交胜利投票
```

政策选择 `adoptPolicy`：优先完成未完成的政策分支，除非有更高优先级的新分支可选；候选分支中取"剩余政策最少"者，同分随机；
分支内按权重随机挑一条。随机数来自 `state.stateBasedRandom(调用名)`，即 `Random(hashOf(caller.hashCode(), seed, this.hashCode()))`，
以调用名与上下文对象播种的局部随机流（上下文含国家对象，其哈希是否跨进程稳定待核实）。

#### 5.4.2 外交修正项账本与关系档

- 每对国家各持一份 `DiplomacyManager`（有向：我对你的看法存在我这边）。`diplomaticModifiers` 是"修正项类别名到数值"的映射，类别来自枚举 `DiplomaticModifiers`，
  每个类别带一句给玩家看的说明，例如：负面的"你向我们宣战""你的好战作风无法接受""你攻占了我们的城市""你背弃了友谊宣言""你违背了不在我们附近建城的承诺""你公开谴责我们"；
  正面的"多年和平增进了关系""共同的军事斗争拉近了我们""我们签了公开的友谊宣言""开放边界拉近了我们""你履行了不攻击我们的承诺""我们感谢你的礼物""我们信仰同一宗教"。
- 意见 `opinionOfOtherCiv()` = 各类别数值之和（特例："摧毁受保护城邦"与"攻击受保护城邦"不叠加）。注释说明基线是"每回合和平 1 点"，宣战能抹掉四十年的和平，攻城再扣三四十。
- 关系档（`relationshipIgnoreAfraid`，主要国家之间）：意见不高于 -80 为 Unforgivable；不高于 -40 或交战为 Enemy；不高于 -15 为 Competitor；
  不低于 80 为 Ally；不低于 40 为 Friend；不低于 15 为 Favorable；其余 Neutral。
- 标志 `flagsCountdown`：类别名到剩余回合数；每回合减 1；**减到负数也继续计数**（用来计时，例如"秘密备战已持续几回合"）；减到 0 时触发到期事件
  （防御条约到期回到和平、研究协定到期结算科研、承诺到期记"履约"正修正）。

#### 5.4.3 衰减与累积

`DiplomacyTurnManager.nextTurnDiplomaticModifiers` 每回合执行：

```
revertToZero(类别, 步长):        // 向 0 移动一个步长, 越过 0 则删除
    实际步长 = 0.67 * 步长 / 游戏速度系数      // SPEED_ADJUSTMENT_NORMALIZATION_FACTOR = 0.67, 以"快速"档为基准
accumulateToAtMost(类别, 步长, 上限):   // 向上限累积
```

| 类别                                       | 产生时的初值（读到的部分）                                                          | 每回合回归步长              |
| ------------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------- |
| 多年和平 `YearsOfPeace`                    | 和平时每回合 +0.5，上限 30；宣战时整项删除                                           | 交战时 0.5                  |
| 开放边界 `OpenBorders`                     | 每有一方开放边界每回合 +1/8                                                          | 无开放时 1/8                |
| 你向我们宣战 `DeclaredWarOnUs`             | 受害者 `addDiminishingModifier(-20)`                                                 | 1/8（注释：约 160 回合才忘掉） |
| 好战 `WarMongerer`                         | 宣战时，每个与受害者关系高于 Competitor、且未与之交战的第三方 -5                      | 1/2                         |
| 攻占我们的城市 `CapturedOurCities`          | `-(10 + 该城人口占原主国总人口的百分比)`（`CityConquestFunctions.diplomaticRepercussionsForConqueringCity`）；同时每个认识征服者的大国：与原主交战者记"共同敌人" `+aggro/10`，否则记"好战" `-aggro/10` | 1/4                         |
| 背弃友谊宣言 `BetrayedDeclarationOfFriendship` | 受害者 -40、其他认识的国家 -20，再乘对方人格的 `modifierFocus(Loyal, 0.3)`        | 1/8                         |
| 背弃防御条约 `BetrayedDefensivePact`        | 受害者 -20、其他 -10，同样乘忠诚系数（可与上项叠加）                                 | 1/16                        |
| 共同敌人 `SharedEnemy`                     | 与受害者同在交战的第三方 +5 乘忠诚系数                                               | 未在该函数中衰减（待核实）  |
| 公开谴责 `Denunciation`                    | `INITIAL_OPINION_CHANGE_WHEN_DENOUNCED = -35`                                       | 1/8                         |
| 背约（各类承诺） `BetrayedPromise*`         | -20（递减叠加），见 5.4.4                                                            | 1/8                         |
| 拒绝承诺 `Refused*`                         | -15                                                                                 | 拒绝"不在附近建城"1/4、拒绝"不攻击"1/2；其余两类未出现在衰减表中（待核实） |
| 礼物 `GaveUsGifts`                          | 按金额                                                                              | `max(abs(值) * k / 100, k / 5)`，k 按关系档从 Ally 的 1 到 Unforgivable 的 10 |

**递减叠加**（`addDiminishingModifier`）：新值与现值同号时，实际加 `amount * amount / (现值 + amount)`，异号或现值为 0 时直接加。
效果是同类负面事件反复发生，单次的边际影响越来越小，避免账本被一种事件刷爆。

**城邦影响力的静止点回归**（`nextTurnCityStateInfluence`）：影响力高于静止点则每回合下降（基础 1，敌对性格 1.5，对方是城邦侵略者 2，再乘百分比修正，同宗教慢 25%），
低于静止点则每回合上升（基础 1，同宗教快 50%）；静止点 = 0 + 各类加成 + 作为保护者 10 - 对方被"警惕"时 20；交战时影响力按 -60 计但保留原值。
这是"带静止点的关系值"的一个干净样板。

#### 5.4.4 承诺生命周期（`Demand`）

`Demand` 枚举的每一项（不要在我们附近建城、不要向我们传教、不要派间谍、不要攻击我们）都打包了七样东西：同意标志、违约标志、"将忽略违约"标志、
拒绝修正项、背约修正项、履约修正项、各种提示文本。流程：

```
AI 发现对方的"违约行为"（如在附近建城）且对方此前未承诺:
    对方威胁不高时才提出要求（不招惹强者）; "不要攻击我们"总会提出
对方同意: 在 AI 一侧设同意标志 100 回合
对方拒绝: AI 记"拒绝"修正 -15
期限内再次违约（同意标志仍在）:
    弹窗告知对方"我们发现了你的背约"; 设"将忽略违约"标志 100 回合（避免反复惩罚）
    addDiminishingModifier(背约修正, -20); 移除同意标志
    若是"不要攻击我们": 对所有共同认识的国家, 它们对违约者 addDiminishingModifier(-10)
期限届满未违约: 同意标志到期时记"履约"修正 +10
交战期间大多数违约不检查（"不要攻击我们"除外）
```

#### 5.4.5 平滑意见与谴责

`smoothedOpinionOfOtherCiv` 是意见的指数滑动平均，周期 `EMA_PERIOD = 30` 乘游戏速度：`新均值 = (新值 + 旧均值 * (周期 - 1)) / 周期`。
`denounce` 在"意见下降速度"超过阈值时谴责：`意见 - 平滑意见 <= -65 * (1 / scaledFocus(谴责意愿)) * 1.005^意见 * 1.1^当前谴责数`。
注释给出的效果：意见从 135 骤降到 50、从 65 降到 0、从 0 降到 -50、从 -60 降到 -100 时会谴责。**触发看的是"变化的速度"而不是"绝对值"**。

#### 5.4.6 开战动机：命名修正项列表

`hasAtLeastMotivationToAttack(本国, 目标视图, 门槛)`：

```
若没有与目标相邻的城市对, 或全部目标城都"没有能攻城而不死的单位": 返回 0
baseForce = 100; 我方战力与对方战力（含其保护者）分别计算
modifiers = [
  ("Base motivation",            -15 * inverseScaledFocus(DeclareWar)),
  ("Relative combat strength",   战力比阶梯: >5 +20, >4 +15, >3 +12, >2 +10, >1.8 +8, >1.6 +6, >1.4 +4, >1.2 +2, >0.8 -5, >0.6 -10, >0.4 -20, 否则 -40
                                 （对方战力加上 0.8 * 正在与我交战的各国战力之和）),
  ("Concurrent wars",            -20 * 我方正在进行的其他战争数),
  ("Their concurrent wars",      +3 * 对方正在进行的战争数),
  ("Their allies",               对方每个防御条约盟友按其战力比 -2 到 -15),
  ("No other threats",           +10, 当相邻大国中除目标外没有关系低于 Friend 者),
  ("Relative score",             对方为大国时: 分数比阶梯 +15 到 -10),
  ("Over unit supply" 或 "Relative production", 我方超出单位补给上限时 +2/每单位（封顶 20）, 否则产能比阶梯 +10 到 -15),
  ("Far away cities",            最近城距超过 20、14、10 格分别 -10、-8、-3, 再乘 inverseScaledFocus(Aggressive)),
  ("Close cities",               最近城距小于 6 时 +5 * inverseScaledFocus(Aggressive)),      // 防守型人格更想处理身边的威胁
  ("Research Agreement",         有研究协定时 -5 * scaledFocus(Science) * scaledFocus(Commerce)),
  ("Declaration of Friendship",  -10 * scaledFocus(Loyal)), ("Defensive Pact", -15 * scaledFocus(Loyal)),
  ("Relationship",               关系档: Unforgivable +10, Enemy +5, Competitor +2, Favorable -2, Friend -5, Ally -10, 再乘 scaledFocus(Loyal)),
  ("Denunciation",               已谴责时 +5 * inverseScaledFocus(Diplomacy)),
  ("PlanningAttack",             正在对目标秘密备战时 +已备战回合 * scaledFocus(Aggressive) / 2;
                                 否则 "PlanningAttackAgainstOtherCivs" 为 -5 * 正在备战的其他目标数 * inverseScaledFocus(Aggressive)),
  ("Receiving trade resources",  正从对方获得资源时 -8 * scaledFocus(Commerce)),
  ("Isolated city",              目标城不含其首都且彼此孤立时 +10 * scaledFocus(Aggressive)),
  ("War with allies",            盟友正与之交战时的加成), 城邦目标另有保护者、影响力、同盟城邦等项, 奇观相关项
]
去掉值为 0 的项（"仅为调试"）; motivation = Σ
if motivation < 门槛: 立即返回（短路, 不跑寻路）
motivation += 攻击路径修正（A* 检查陆路与海路是否可达）
```

注意战力比在"AI 对人类"时乘 `aiUnitCostModifier^1.5`，以减少高难度下 AI 专挑人类玩家（见 5.4.11）。

#### 5.4.7 战争计划

`DiplomacyAutomation.declareWar` 的前置：有城市、认识他国、人格"宣战"值不为 0、幸福度为正、军事单位数不少于城市数且不少于 4、总人口不少于 12；
目标须有已探明的城市且当前可宣战（无和约剩余回合）。动机为正的目标按分数从高到低交给 `DeclareWarTargetAutomation.chooseDeclareWarTarget`，对每个目标依次尝试：

| 计划                     | 动机门槛 | 评估（`DeclareWarPlanEvaluator`，返回值大于 0 才执行）                                                                                                                                                      | 动作                                         |
| ------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 联合宣战 `tryTeamWar`    | 大于 5   | 伙伴关系不低于 Neutral（Neutral 再 -5）；伙伴不与目标相邻 -40；合力不足"目标战力乘风险系数（动机越高系数越小，1.2 到 0.8）"按差距扣，合力超过目标两倍也扣（"何必以多欺少"）；伙伴分数过高扣；最后 -20 | 向伙伴发"一起对某国宣战"的交易请求          |
| 加入战争 `tryJoinWar`    | 不低于 15 | 伙伴关系须高于 Favorable；信任检查"伙伴意见 + 2 * 动机 < 80"时按差扣；伙伴不与目标相邻 -20；伙伴战力不足目标一半扣；合力不足扣；最后 -15                                                          | 向已在交战的伙伴申请加入                     |
| 直接宣战                 | 不低于 20 | 若在秘密备战中：`turnsToPlan = max(3, 10 - 动机/10)`，`turnsToWait = turnsToPlan + 已备战回合（负计数）`，返回 `动机 - turnsToWait * 3`；否则返回 `动机 - 40`                                       | `declareWar()`                               |
| 秘密备战 `prepareWar`    | 不低于 15 | 尚未备战时返回 `动机 - 15`                                                                                                                                                                                  | 设 `WaryOf = -1`，此后每回合负向计数；超过 10 回合未开战则取消 |

于是：动机很高时可以直接开战；中等时先秘密备战若干回合（`logic/automation/unit/UnitAutomation.kt` 的 `tryPrepare`：无战事时，对处于备战或互相谴责状态的国家，把军队调往离其最近的己方城市集结），备战越久"等待成本"越低；更稳妥时拉伙伴一起。

#### 5.4.8 求和与和约附金

`offerPeaceTreaty` 对每个敌国：刚宣战不足 `minimumWarDuration`（`models/ModConstants.kt` 默认 10 回合）或对方刚拒绝过则跳过；
对其动机不低于 10 则继续打；敌方有城市生命低于 50%（"马上要拿下了"）则继续打；我方战力减去 0.8 倍交战各国战力仍为正时，以种子
`敌国序号 + 我方战争数 + 123 * 回合数` 掷骰，有 20% 概率继续打；否则提出和约，并按 `evaluatePeaceCostForThem` 附金或索金。

`evaluatePeaceCostForThem(我, 敌)`：双方战力在 1.5 倍之内返回 0；我方占优时，若我方已无开战动机返回 0，否则
`绝对优势 * 相对优势 / (通胀系数 * 2)`（我方要价）；我方劣势时返回负值 `-(绝对劣势 * 相对劣势 / (通胀系数 * 2))`，封顶 `maxGoldTradeOffer`
（代码注释称上限约十万，`ModConstants.kt` 实际默认 10000）。

#### 5.4.9 交易接受度

`getTradeAcceptability(交易, 评估方, 对方)`：

```
要求割让的城市数 > ceil(评估方城市数 / 5): 拒绝
要求评估方同时对多国宣战: 拒绝
theirs = Σ 对方给的每项的"买价"（含通胀）
ours   = Σ 评估方给的每项的"卖价"
不含和约与研究协定时: 关系 Enemy 则 ours *= 1.5, Unforgivable 则 ours *= 2      // 讨厌你就加价
含防御条约且关系不是 Ally: 拒绝
return theirs - ours + （可选）对方此前送礼的余额        // 不小于 0 即接受
```

卖价示例（`evaluateSellCost`）：使馆按关系 300 / 60 / 30；每回合金币按 `数额 * 回合数 * 4/5`；和约按 `evaluatePeaceCostForThem`；
防御条约在"想签"时为 0，否则 100000；奢侈品有富余时 250、最后一份 600；太空竞赛所需的战略资源为整数上限（"我们宁可赢下这局"）。

#### 5.4.10 结盟动机（`wantsToSignDeclarationOfFrienship`）

```
已拒绝过或关系低于 Favorable: 否
motivation = 意见 - 40
+ 好战修正 * scaledFocus(Diplomacy)
+ 威胁评估: VeryHigh +10, High +5, VeryLow -5            // 强者更想交好
+ 朋友数少于"存活国家的 1/4 乘外交倾向"时 +(10 - 10*朋友数/目标数), 否则按超出比例扣到 -120
- 10 * 对方已有朋友数                                      // 抑制抱团
- 50 * 已灭亡国家比例                                      // 防止一群朋友吞并全图后僵局
+ 10 * 我方正在进行的战争数                                // 战争越多越需要朋友
- 认识的国家不足 75% 时最多 -30                            // 等认识更多国家再说
若对方是附近唯一的非友好大国（唯一的扩张对象）: -20
- 2 * 对其的开战动机（以 motivation/2 为门槛短路）
return motivation > 0
```

#### 5.4.11 人格与难度

- `Personality`（`models/ruleset/nation/Personality.kt`）：产能、粮食、金币、科研、文化、幸福、信仰七个产出偏好，加军事、侵略、宣战、商业、外交、忠诚、扩张、谴责意愿八个行为偏好，
  均为 0 到 10、默认 5；另有政策分支优先级表与偏好的胜利类型。投影函数：`scaledFocus(v) = v / 5`（10 为 2、5 为 1、0 为 0）；
  `inverseScaledFocus(v) = (10 - v) / 5`；`modifierFocus(v, weight) = 1 + (scaledFocus(v) - 1) * weight`（以 1 为中心、weight 控制偏离幅度）。
  `Personalities.json` 开头给出模板，并说明各值依据原作数据网站的领袖参数换算。
- 难度（`Difficulties.json`）：玩家侧的基础幸福、单位与建筑成本倍率、不幸福倍率；AI 侧 `aiCityGrowthModifier`、`aiUnitCostModifier`、`aiBuildingCostModifier`、`aiWonderCostModifier`、
  `aiUnhappinessModifier`、免费科技与额外起始单位等。即**难度主要改 AI 的经济成本，不改决策逻辑**；唯一进入决策的是"AI 对人类的战力比乘 `aiUnitCostModifier^1.5`"，用来抵消高难度 AI 兵多带来的针对性。

#### 5.4.12 Uniques：文本模板的条件修正

- 一条 Unique 是一行文本，按 `UniqueType` 的模板解析，例如 `"[stats] [cityFilter]"`、`"[relativeAmount]% [stat]"`；可附任意个条件后缀，如
  `<when at war>`、`<when below [-10] [Happiness]>`、`<for [N] turns>`（计时）、`<for every [countable]>`（乘子）。
- `Unique.conditionalsApply`：所有条件都成立才生效；`getUniqueMultiplier`：多个"每有一个某物"乘子相乘；带计时后缀的 Unique 变成 `TemporaryUnique`，每回合 `turnsLeft` 减 1，到 0 移除。
- 规则集 `GlobalUniques.json` 把幸福度阈值惩罚写成数据：`"[-75]% growth [in all cities] <when between [-10] and [-1] [Happiness]>"`、
  `"Nullifies Growth [in all cities] <when below [-10] [Happiness]>"`、`"[-50]% [Production] [in all cities] <when below [-10] [Happiness]>"`、
  `"[-33]% Strength <for [All] units> <when below [-10] [Happiness]>"`、`"Cannot build [Settler] units <when below [-10] [Happiness]>"`、
  `"Rebel units may spawn <when below [-20] [Happiness]>"`。
- 汇总：城市数值用 `StatTreeNode` 按"来源层级"存放（建筑、专家、各 Unique 来源各一支），总值为各叶之和，界面可逐层展开；百分比加成同样汇成一棵树，
  **先把所有百分比相加，再一次性乘 `1 + Σ/100`**（`toPercent()` 即 `1 + 值/100`）。战斗修正同理：`modifiersToFinalBonus` 为 `1 + Σ修正/100`，
  各修正以名字为键（"大将军""侧翼""地形""过河"等）便于界面列出；大将军加成在范围内**只取最大的一个**，不叠加。

#### 5.4.13 战斗伤害（简）

`BattleDamage.damageModifier`：`ratio = 攻击强度 / 防御强度`，`强弱比 = max(ratio, 1/ratio)`，`ratioModifier = (((强弱比 + 3) / 4)^4 + 1) / 2`，弱方受到的比值取倒数；
`伤害 = (24 + 12 * random) * ratioModifier * 受伤程度系数`。随机数以 `回合数 * 格子位置哈希` 播种（`getRandomness`），注释写明是为了防止存档重读刷结果。

#### 5.4.14 城市委托

- 焦点 `CityFocus`：单项焦点对该产出乘 3.05（"平局时偏向焦点"），复合焦点如"金币加成长"对金币乘 2、粮食乘 1.5。
- 分配市民（`CityPopulationManager.autoAssignPopulation`）：**贪心**，每次把一个空闲市民放到 `Automation.rankStatsForCityWork` 评分最高的格子或专家位上，平局按坐标固定次序。
  评分把粮食拆成"不饿所需"（权重乘 8）与"成长所需"，城市规模小于 10 时科研减半等。
- 建造（`ConstructionAutomation.chooseNextConstruction`）：把建筑、工人、军事单位等候选各给一个"选择修正"（人格 `modifierFocus` 参与），取 `修正 / 剩余工作量` 最大者；
  没有候选时转为把产能变科研、金币、文化或信仰。

#### 5.4.15 视图层：知识边界

`view/View.kt` 的注释是一份设计声明：界面与"以某国身份自动化"的代码都应只经视图访问游戏状态，以保留"AI 只合法访问已知数据"；视图从观察者视角包装每个游戏对象，
只有受自己控制的对象才有改状态的函数，改状态函数返回"是否成功"。现状是迁移中：`ForeignCivView` 仍暴露 `getCiv()` 与 `getStatForRanking`（全局真值排名），
动机计算里有"临时仍用 City 计算"的注释。

### 5.5 对《箱庭纪》的借鉴（分析）

**可以直接借的方法**

1. **好感账本 = 按类别的修正项映射**：账本条目 `{类别键, 数值, 回归步长或到期日, 是否递减叠加}`，意见为条目之和，关系档由阈值推导，每个类别配一句文本键给玩家看。
   这与 SLG 2.3 写的"带来源、带期限条目"可以合并：Unciv 用"回归步长"，十字军之王式用"剩余天数"，两种都支持即可；建议默认用回归步长（更像记忆淡忘），剧情性条目用到期日。
2. **不同事件不同的遗忘速度**：宣战 1/8、背弃防御条约 1/16、好战 1/2、谴责 1/8……这张"遗忘速度表"本身就是人格与文化可以调节的对象（如"记仇"的种族把背约类步长减半）。
   攻城的扣分按"该城人口占原主国人口的比例"计、第三方按十分之一记"好战"或"共同敌人"，正是 SLG 4.5 侵略扩张值的一个按人口加权、按立场分流的版本：
   我们的 `ae` 可借"按被占郡的人口份额加权"与"与受害者交战的国家反而加好感"两点。
3. **递减叠加**：同类负面反复发生时边际递减，防止一种事件刷爆账本；同时保留"多次背约仍然越来越糟"。
4. **承诺生命周期**：我们 SLG 4.2 的"非绑定承诺"直接照 `Demand` 做：要求、同意（写入期限）、违约检测、背约惩罚（受害者与第三方观察者都扣）、履约奖励、"将忽略违约"的冷却。
   第三方扣分就是我们公开"信誉"值的来源；"不招惹强者"的提出条件也值得保留。
5. **开战动机 = 带名字的修正项列表**：Utility 兜底（ai_architecture 6.5）的每一项都带名字与数值，既能进调试视图（SLG 3.2"理由只进调试视图"），也能直接成为大模型感知摘要中的"局势要点"。
   低于门槛立即短路，再跑昂贵的寻路，这个顺序也值得照搬。
6. **战争计划分级与秘密备战计数**：联合、加入、直接、备战四档按动机阈值依次尝试；备战期用负计数记录，越久等待成本越低，超过上限取消。
   映射到我们：备战期就是"宣战须提前公开"之前的"军队集结"阶段，玩家可通过情报看到边境集结（显性信号），与 Freeciv 的宣战倒计时组合使用。
7. **谴责看变化速度**：用意见的指数滑动平均与当前值之差触发"公开谴责"之类的外交表态，让 AI 对"突然的恶化"敏感、对"长期的冷淡"迟钝，更像人。
8. **人格 0 到 10 加统一投影**：把我们 `RulerPersona` 的四个 0..1 权重改为十余个 0 到 10 的值，所有使用点都经 `modifierFocus(v, weight)` 投影，避免各处魔数；
   SLG 3.1 表中的"重力量对比""重安全""重不干涉""重收益"都能落到这套值上。
9. **阈值惩罚写成数据**：稳定（SLG 2.2）与战争厌倦（5.7）的分档效果写成"条件修正项"：如"稳定低于 30 时税收 -25%""低于 10 时可能叛乱"，与注册修正项合同共用一套求值。
10. **百分比先求和再乘一次**、**同类光环只取最大**：与 Wesnoth 结论一致，可写进合同的默认规则。
11. **和约附金公式**：势均力敌时不附金，优势方按"绝对优势乘相对优势"要价，劣势方赔款封顶；作为 SLG 5.6"AI 按战争分数、战争厌倦与性格评估接受度"的起点（我们再加战争分数与厌倦）。

**要改造的点**

- 账本以"类别"合并，失去单次事件的细节（谁、何时、哪件事）；我们的条目应保留事件引用，以便"玩家能看到为什么"（SLG 2.3）与莫伊拉的记录。
- Uniques 是开放的文本模板（便于模组），而我们的修正项通道是封闭集合（经济 7.2"不允许万能通道"）。只借"条件后缀"与"计时后缀"的形式，不借开放性。
- 城市分配市民是贪心，满足不了"必须不饿、必须不动乱"的硬约束；总督委托的复杂情形应参照 Freeciv CMA 的约束与回退。

**不要学的坑**

- 视图层迁移未完成，AI 仍读全局真值排名（`getStatForRanking`）计算战力比与分数比，这违背我们"AI 只读知识层"的硬约束；我们应从一开始就只给 AI 知识层投影。
- 以对象哈希播种的局部随机（`stateBasedRandom`）跨进程是否稳定存疑；我们已有按系统命名的随机流，派生子流应只用稳定键（实体编号、日期、调用名）。
- 求和时"强势方有 20% 概率继续打"是硬编码的随机，没有与人格挂钩；我们应改为人格加局势决定。
- 代码注释与常量不一致（和约金上限注释十万、常量一万），引用数值前须读常量本身。

**对照我们现有实现**：`relations` 单值对应 Unciv 的 `opinionOfOtherCiv()` 结果，但我们没有组成它的条目；`credibility` 对应 Unciv 第三方背约扣分的累积效果；
`chooseIntent` 的宣战分支对应"直接宣战"一档，缺联合、加入与备战三档；`refusal` 对应 `getTradeAcceptability` 的极简版。

### 5.6 许可与复用边界

MPL-2.0 是**文件级**弱著作权：若把某个 Kotlin 文件的逻辑移植或改写为本作的 TypeScript 文件（如 `DiplomacyTurnManager.kt` 的衰减表、`DeclareWarPlanEvaluator.kt` 的计划评估），
该文件必须以 MPL-2.0 授权、保留原版权与许可声明、随附许可文本，并公开该文件的源码（含修改）；本作其余文件不受影响。可借代码，须随附许可。
只借方法（本文的转述与伪代码）不受此限。素材不在借用范围（混合许可，且与原版《文明》素材无关）。

---

## 6. Wyrmsun（选读）

### 6.1 信息表

| 项             | 内容                                                                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 索引条目       | `#native-167`                                                                                                                                                                                |
| 仓库与固定提交 | `https://github.com/andrettin/wyrmsun`（数据仓库），`f0330d2a747f6746ea8c067e65cf6c944a4653f3`（2025-04-17）；引擎是独立仓库 Wyrmgus（`https://github.com/Andrettin/Wyrmgus`，本次未克隆、未读） |
| 代码许可       | `readme.txt`：引擎与本仓库的代码、剧情元素为 GPL-2.0（`license.txt`）；仓库另附 `cc0.txt`、`cc_by_sa_3_0.txt` 等                                                                                 |
| 素材许可       | 图像、音效、音乐的许可见 `graphics/credits.txt`、`sounds/credits.txt`、`music/credits.txt`（未逐项审计）                                                                                         |
| 语言与规模     | 数据：自定义配置格式（`data/`）加 Lua 脚本（`scripts/`）                                                                                                                                      |
| 本地镜像       | `D:\hakoniwa_refs\wyrmsun`，已检出 `scripts/grand_strategy/`、`scripts/ai/`、`data/characters/`                                                                                                |
| 分级           | 选读                                                                                                                                                                                         |

### 6.2 值得看的理由与机制

- **持久英雄**（对应 RTS 4.4 将领、跨幕继承）：`readme.txt` 写明"持久英雄在各剧本间保留等级、能力与物品"，可自建自定义持久英雄；有些英雄只有其王朝掌权时才能招募；
  局内年份（每现实分钟一年）限制部分英雄的招募。持久化逻辑在引擎仓库中，本次未读（待核实）。
- **按时间索引的角色史**：`data/characters/<族群>/*.txt` 每个角色是一段配置，例如 `durin`：名字、兵种、文明、默认阵营、性别、特质、可信奉的神祇、禁止的升级、出场条件，
  以及 `history = { -25000 = { active = true, faction = ..., location = ... } }`，即"年份到状态补丁"的映射，说明角色在某年处于何阵营、何地、是否活跃。
- **数据驱动的大战略事件**：`scripts/grand_strategy/*.lua` 用 `DefineGrandStrategyEvent(名称, { Description, Conditions = 函数, Persistent, Options, OptionEffects, OptionTooltips })` 定义事件；
  条件函数里直接用 `SyncRand` 掷概率并检查资源、科技、建筑；选项效果直接改资源。`grand_strategy.lua` 的外交只有 `DeclareWar`、`OfferPeace`、`RespondPeaceOffer` 几个状态设置函数，
  军力 `GetFactionMilitaryScore` 为各省军力分之和。这些脚本的版权年份到 2022，大战略模式在当前版本是否仍启用待核实。

### 6.3 对《箱庭纪》的借鉴（分析）

- 具名人物（将领、统治者、同伴）跨幕的状态可写成"日期到状态补丁"的历史表：分幕切换时按日期回放补丁，既能表达"第三幕后依 `lothar_ending` 变化"之类的分支（补丁带条件），也便于编辑器可视化。
- 事件的数据形状（描述、条件、选项、选项效果、选项提示）可直接作为纷争与危机事件的字段清单；但条件函数里直接掷随机数会破坏可预测性，我们应在条件里只读状态，概率交给内核的命名随机流。
- 持久英雄的"等级、能力、物品跨剧本保留"与我们"玩家亲身替将领打赢则经验减半"（RTS 4.4）不冲突，可作为将领档案的持久字段参照。

### 6.4 许可与复用边界

GPL-2.0，只借方法；素材按各 credits 文件，未审计、不取用。

---

## 7. Tanks of Freedom（选读，由略过上调）

### 7.1 信息表

| 项             | 内容                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 索引条目       | `#native-161`                                                                                                              |
| 仓库与固定提交 | `https://github.com/w84death/Tanks-of-Freedom`，`b1cad8b6999227971d4001d7646846bac7d7ffdc`（2025-02-03）                    |
| 代码与素材许可 | MIT（`LICENSE.md` 写明"本许可同时适用于代码与仓库内全部图像素材"）；可借代码，须随附许可                                    |
| 语言与规模     | GDScript（Godot 引擎），AI 位于 `scripts/ai/`，十余个文件                                                                   |
| 本地镜像       | `D:\hakoniwa_refs\tanks_of_freedom`（未检出工作区，全部以 `git show` 读取）                                                  |
| 分级           | 选读（任务原列为略过；其小型回合制 AI 结构清晰、许可最宽松，故上调并简写）                                                  |

### 7.2 机制

- `scripts/ai/ai.gd`：每个 AI 刻（tick）若没有"当前动作"，就让收集器 `collector` 收集全部可用动作，按 `score` 降序取第一个作为当前动作；
  执行器 `egzekutor` 按动作类型找到对应的"手"（`spawn_hand`、`move_hand`）执行一步；动作的 `can_continue()` 为真时下个刻继续执行（多步动作），否则清空。
- `scripts/ai/actions/collector.gd`：按实体类型分派"脑"：单位脑（士兵、坦克、直升机）与建筑脑（总部、兵营、工厂、机场、信号塔），每个脑对其实体产出带分的动作列表。
- `scripts/ai/actions/types/base_action.gd`：动作带 `score` 与 `score_cap`（封顶）。
- `scripts/ai/actions/brains/unit_brain.gd` 的打分常量：`base_attack_value 80`、`attack_bonus 10`、`kill_bonus 40`、`teamwork_bonus 20`、`building_protection_bonus 50`、
  `hq_protection_bonus 50`、`base_capture_value 100`、`immediate_capture_bonus 50`、`hq_capture_bonus 500`、`distance_penalty 5`、`preserve_ap 1`、`aggression_range 4`（坦克脑覆盖为 16）。

### 7.3 对《箱庭纪》的借鉴（分析）

- "脑产出带分动作、手执行动作类型、当前动作可多步"是最小可用的打分式 AI 骨架，适合我们 C 层战术小模块或运营层的某些规则 AI 起步；MIT 许可允许直接借代码（须随附许可）。
- 与 Wesnoth RCA 的差别：这里每刻重新收集全部动作，没有"上限分数剪枝"，也没有"执行不改变局面则拉黑"，规模一大就会慢、也可能卡在无效动作上；正式实现应以 RCA 为准，ToF 只作入门样板。

### 7.4 许可与复用边界

MIT：可复用代码与图像素材，须保留版权与许可声明。素材的像素等距风格与本作的纯 2D 俯视像素风不一致，不建议取用。

---

## 8. 跨项目结论

### 8.1 设计条目速查（分析）

| 本作条目                                                                                                      | 首选参考（项目与符号）                                                                                                              | 次选参考                                                                    |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| SLG 1.3、5.3 补给与补给线                                                                                     | FreeOrion `SupplyManager::Update`（覆盖层）                                                                                         | 运力层无现成开源实现，需自建                                                |
| SLG 2.2 稳定的阈值效果                                                                                        | Unciv `GlobalUniques.json` 的条件修正                                                                                               | FreeOrion 稳定度门槛、目标值与当前值双计量                                  |
| SLG 2.3 好感账本                                                                                              | Unciv `DiplomacyManager.diplomaticModifiers` 与 `DiplomacyTurnManager.nextTurnDiplomaticModifiers`                                   | Freeciv `dai_incident` 的事件分级表                                         |
| SLG 2.5 行政容量                                                                                              | FreeOrion `_BASE_INFLUENCE_COSTS`、`PLC_BUREAUCRACY`、`PLC_CENTRALIZATION`、`BLD_REGIONAL_ADMIN`                                     | Freeciv `Empire_Size_Base`、`Empire_Size_Step`                              |
| SLG 2.6 神依赖度的"近 360 天受益神力"                                                                         | FreeOrion `AccountingInfo` 记账结构（按受益方聚合）                                                                                 | 无                                                                          |
| SLG 3.1 统治者人格                                                                                            | FreeOrion `character_module.py` 的 `Trait` 与 `Character`                                                                           | Unciv `Personality.modifierFocus`                                           |
| SLG 3.2 Utility 兜底                                                                                          | Unciv `MotivationToAttackAutomation`（命名修正项列表）                                                                              | Freeciv `dai_war_desire`                                                    |
| SLG 3.2 规划分解                                                                                              | VCMI Nullkiller2 `DeepDecomposer`、`PriorityEvaluator`                                                                              | Unciv `DeclareWarTargetAutomation`                                          |
| SLG 3.2 规则执行（运营层）                                                                                    | Wesnoth `candidate_action_evaluation_loop`                                                                                          | Tanks of Freedom 脑与手                                                     |
| SLG 4.1、4.3 条款与接受度                                                                                     | Freeciv `dai_goldequiv_clause`、`dai_treaty_evaluate`                                                                               | Unciv `TradeEvaluation.getTradeAcceptability`                               |
| SLG 4.2 承诺与可信度                                                                                          | Unciv `Demand` 与 `onDemandViolation`                                                                                               | Freeciv `has_reason_to_cancel`                                              |
| SLG 4.1 宣战须提前公开                                                                                        | Freeciv `countdown` 与 `war_reason`                                                                                                 | Unciv `WaryOf` 备战计数                                                     |
| SLG 4.5 反联盟                                                                                                | Freeciv `dai_incident_war`（第三方好感下降）                                                                                        | Unciv `WarMongerer` 与 `wantsToSignDeclarationOfFrienship`                  |
| SLG 5.5 自动结算与胜算预估                                                                                    | Wesnoth `combatant::fight`、`battle_context_unit_stats`                                                                             | VCMI `battleEstimateDamage`；FreeOrion `combine_ratings`                    |
| SLG 5.6 和谈                                                                                                  | Unciv `offerPeaceTreaty`、`evaluatePeaceCostForThem`                                                                                | Freeciv 和平条款的 `greed` 门槛                                             |
| SLG 6.3、6.5 情报与知识层                                                                                     | FreeOrion 威胁情报过期衰减（每回合 2%）与损失反推                                                                                   | Unciv 视图层的设计声明（反例：迁移未完成）                                  |
| SLG 9.4 国家层委托                                                                                            | Freeciv `cm_query_result` 与 `auto_arrange_workers` 回退链                                                                          | Unciv `CityFocus` 与 `autoAssignPopulation`                                 |
| 经济第 7 节修正项合同                                                                                         | FreeOrion 优先级阶段、叠加组、`AccountingInfo`                                                                                      | VCMI `BonusList::totalValue`、限制器、更新器                                |
| RTS 2.5 A 对 C、第 4 节英雄是乘数                                                                             | VCMI 攻防差封顶与"正项相加、负项相乘"                                                                                               | Wesnoth `leadership`、Unciv 大将军取最大                                    |
| RTS 4.4 将领成长                                                                                              | Wesnoth `kill_xp`、`combat_xp`、AMLA                                                                                                | Wyrmsun 持久英雄                                                            |
| RTS 第 7 节 AI 将领                                                                                           | Wesnoth `attack_analysis::rating` 与 RCA                                                                                            | VCMI BattleAI 交换模拟                                                      |

### 8.2 结论（分析）

1. **国家 AI 分三层，各取所长。** 动机层用 Unciv 式"带名字的修正项列表"（可解释、可短路）加 FreeOrion 式"性格特质钩子"（许可、偏好、数值三类，保守合并），这一层同时是 Utility 兜底与大模型感知摘要的来源；
   计划层用 Unciv 的"联合、加入、直接、备战"分级与 Nullkiller2 的"分解、分档、去冲突"；执行层用 Wesnoth RCA（固定上限分数、一次一步、失败拉黑）。三层都只读知识层投影，难度只调规划深度、风险偏好与随机翻转，不给 AI 真值。
2. **外交关系 = 修正项账本加阈值关系档。** 条目按类别保存并按各自速度回归 0（Unciv），同类反复事件递减叠加；事件严重度用分级表（Freeciv how_bad）；"心里想打谁就不会对谁好"与"非盟友好感封顶"让关系曲线提前暴露意图；
   条约接受用条款级金币等价估值求和（Freeciv），关系缺口按平方惩罚，讨厌对方时我方给出项加价（Unciv）；承诺按 `Demand` 生命周期处理，第三方观察者扣分构成公开信誉。
3. **宣战要有前奏。** 备战计数（Unciv `WaryOf`）对应军队集结，宣战倒计时（Freeciv `countdown`）对应公开预告并通知盟友；宣战后短期内和平条款估值为负无穷，与强制停战期互补。这正是 SLG 4.1 与第 10 节"反扑必须可预警"的实现。
4. **补给分两层建。** 覆盖层照搬 FreeOrion：补给源按行程逐步扩散、敌方静止武装阻塞、先到者保路、争夺按"有据点、有哨所、微小项破平局"排序、连通分量即补给组；运力层自建：补给线的瓶颈运力与需求，
   不足则按 SLG 1.3 减员与降士气。工业类资源按补给组结算可被切断，信息类资源全局共享，这一分法值得保留。
5. **修正项叠加用"阶段 + 值类型 + 叠加组 + 记账"。** 合成顺序取 VCMI 的 `((基础 + 基础项) × (1 + 对基础百分比) + 加法项) × (1 + 对全部百分比)` 再钳制，阶段编号借 FreeOrion 的优先级表以便插入"覆盖"类修正；
   百分比先求和再乘一次、同类光环只取最高（Wesnoth、Unciv）；叠加组按目标对象先到先得（FreeOrion）；每次写入追加记账（来源类别、来源、差值、累计值），供可见性分档、追溯与神依赖度统计。
   不学 VCMI 按绝对值比较叠加键、Freeciv 纯加法无上限、Unciv 的开放文本模板。
6. **英雄带兵：让英雄的贡献"加到每个单位"再进入伤害式。** VCMI 的攻防差每点 5%（封顶 300%）、Wesnoth 的领导力每差一级 +25%、Unciv 的大将军取最大，都是"随部队规模放大"的乘数实现；
   本作已有英雄光环上限（伤害与防御各自封顶 0.3）与单次击倒 20% 上限，应保留；建议再采用"增益相加、减益相乘"与"同类取最高"两条规则（现有光环同类相加），防止多个系数连乘指数放大。
7. **自动结算与胜算预估：同一数值构造，输出分布，按预算降级。** 预测与实战共用单方数值函数（Wesnoth `battle_context_unit_stats`）；胜算界面给溃败概率、期望伤亡与不受损概率；
   单挑与具名人物用精确分布，兵团在"谁也打不垮谁"的区间用独立近似、在可能溃败的区间用蒙特卡洛，最粗一档用平方根合成（FreeOrion）；若关键判定用了防连坏运的偏置随机，预测必须同规则模拟。
   各档以内核回归测试标定（RTS 2.5 的 ±10%）。
8. **委托：约束硬、目标软、无解交还、降级保底。** 总督与内阁的常设命令写成"最低盈余与禁止事项（硬）加权重（软）"，求解失败时交还玩家并通知（计入 A_core），服务端多级降级保证总有可执行方案（Freeciv CMA）；
   简单场景用焦点权重贪心（Unciv）即可。
9. **慢变量用"目标值加当前值"。** 稳定、战争厌倦、民心、意见都按"目标每日重算、当前值每日最多移动若干"处理（FreeOrion 计量、Unciv 平滑意见），并用定点整数存储；外交表态（如谴责）看变化速度而不是绝对值。
10. **能借代码的只有 Unciv（MPL-2.0，文件级）与 Tanks of Freedom（MIT）。** Freeciv、FreeOrion、VCMI、Wesnoth、Wyrmsun 均为 GPL 系，只借方法；若移植 Unciv 的某个文件，该 TS 文件须以 MPL-2.0 授权并随附许可。

---

## 9. 未能获取或略过

| 项目                          | 索引锚点       | 处理               | 理由                                                                                                         |
| ----------------------------- | -------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Race into Space               | `#native-156`  | 略过（未克隆）     | 回合制太空竞赛管理（预算、任务成败），与国家 AI、外交、补给、修正项、英雄带兵关系弱                           |
| Harris                        | `#native-133`  | 略过（未克隆）     | 二战轰炸机司令部的作战管理（目标选择、机组与天气），题材与规模偏离大战略的多国博弈                             |
| Ancient Beast                 | `#web-080`     | 略过（未克隆）     | 回合制怪兽对战，属小规模战术层，与本文主题无交集                                                             |
| Hexa Battle                   | `#web-083`     | 略过（未克隆）     | TypeScript、React 与 SVG 的回合制地牢探险，技术栈相近但玩法与 SLG 无关                                       |
| Rapid Dominance               | `#web-084`     | 略过（未克隆）     | 回合制夺旗克隆，规模小，无外交与补给                                                                         |
| Hedgewars                     | `#native-134`  | 略过（未克隆）     | 回合制火炮与动作喜剧，无参考价值                                                                             |
| Tanks of Freedom              | `#native-161`  | 由略过上调为选读   | 见第 7 节                                                                                                    |
| Wyrmgus（Wyrmsun 的引擎）     | 无             | 未读               | 持久英雄的持久化逻辑在引擎仓库，本次只读了数据仓库（待核实）                                                 |
| FreeOrion `default/scripting/species/common/` | `#native-170` | 路径不存在 | 该提交已改为 `species/species_macros/*.py`，已改读后者                                                    |
| VCMI `lib/battle/DamageCalculator.cpp` | `#native-174` | 文件不存在   | 伤害公式已移到 `scripts/damage/damageCalculator.lua`，已改读后者                                             |

全部计划克隆的仓库均获取成功，无"未能获取"项。各仓库检出体积：freeciv 约 55MB、wesnoth 约 17MB、unciv 约 15MB、freeorion 约 8.5MB、vcmi 约 6.2MB、wyrmsun 约 5.5MB，
freeciv_web 与 tanks_of_freedom 不足 1MB，合计远低于 300MB 的上限。

