# 调研归档（10_research）

本目录只记录事实、分析与可借鉴点，不具约束力。被采纳的结论已写入 `../20_world/` 到 `../60_production/`，
并在各设计文档中回链到这里。

## 目录

| 子目录 | 文件 | 内容 | 主要结论去向 |
|---|---|---|---|
| `anime/` | [README.md](anime/README.md) | 50 部穿越动画的选片标准与片单 | |
| | [titles_01_25.md](anime/titles_01_25.md) | 第 1 到 25 部逐部分析（含《月光下的异世界之旅》专项拆解） | 正典、叙事 |
| | [titles_26_50.md](anime/titles_26_50.md) | 第 26 到 50 部逐部分析，附 4 部非穿越参考 | 正典、叙事 |
| | [synthesis.md](anime/synthesis.md) | 综合提炼：母题统计、十二条核心提炼、候选点子池、追溯表、雷区 | 全局 |
| `ai_npc/` | [my_ai_town_agents.md](ai_npc/my_ai_town_agents.md) | my_ai_town 的 AI 居民实现（源码级） | AI 方案 |
| | [woc_ai_npc.md](ai_npc/woc_ai_npc.md) | world-of-claudecraft 现有 AI 改造（源码级） | AI 方案 |
| | [comparison_and_plan.md](ai_npc/comparison_and_plan.md) | 两者对比与《箱庭纪》AI 方案方向 | `../40_design/systems/`、`../50_tech/ai_architecture.md` |
| `art_style/` | [my_ai_town_visual_and_client.md](art_style/my_ai_town_visual_and_client.md) | my_ai_town 的 HD-2D 风格、客户端与程序化素材 | `../50_tech/art_pipeline.md` |
| `open_share/` | [city_rts_slg.md](open_share/city_rts_slg.md) | 城建、RTS、SLG、经济、策略 AI 的资料与借鉴 | 经营与战争系统 |
| | [game_dev_methodology.md](open_share/game_dev_methodology.md) | 游戏开发概念与方法论，及概要设计章节建议 | 设计方法、制作计划 |
| | [local_audio_generation.md](open_share/local_audio_generation.md) | 本机 ComfyUI 音频生成：模型筛选与许可、ACE-Step 翻奏机制、乐谱优先管线与试做 | 音频方向、素材管线 |
| `footnote/` | [asset_workbench.md](footnote/asset_workbench.md) | Footnote 制作工作台：工具收纳、三栏资产库、审核记录与写盘接口 | 素材审核台 |
| `open_source/` | [README.md](open_source/README.md) | 开源游戏源码调研总览：筛选、阅读路线、许可、本地镜像（`D:\hakoniwa_refs`，可用 `tools/refs/` 重建）、对第一轮实现的直接发现 | 城建、RTS、SLG、经济的详细设计与实现 |
| | [question_map.md](open_source/question_map.md) | 按设计章节反查源码（文件与符号） | 同上 |
| | [city_builders.md](open_source/city_builders.md) | 城建与人口模拟（Micropolis、Julius、Lincity-NG、Unknown Horizons 等） | `../40_design/systems/city_building.md` |
| | [economy_logistics.md](open_source/economy_logistics.md) | 经济型 RTS、物流、贸易、谍报（Widelands、Seven Kingdoms、OpenTTD 等） | 经济、城建物流、大战略谍报 |
| | [rts.md](open_source/rts.md) | 即时战术（0 A.D.、OpenRA、Curse of War 等） | `../40_design/systems/warfare_rts.md` |
| | [slg_4x.md](open_source/slg_4x.md) | 大战略、4X、战棋（Freeciv、FreeOrion、VCMI、Wesnoth、Unciv 等） | `../40_design/systems/grand_strategy_slg.md`、修正项合同 |
| | [colony_base_management.md](open_source/colony_base_management.md) | 地下城经营、基地管理、NPC 委托（KeeperRL、OpenXcom、Cataclysm-DDA 等） | 城建委托与招募、女神资助反应 |
| `woc_reuse/` | [combat_and_content_inventory.md](woc_reuse/combat_and_content_inventory.md) | 主工程战斗与内容体系盘点、复用评估 | 战斗、千门、技术复用 |
| | [internal_playbooks.md](woc_reuse/internal_playbooks.md) | 主工程执行指导方案的方法论与模板 | 研发流程 |

## 十条跨调研的关键结论

1. **类型定位**：50 部作品里只有《月光下的异世界之旅》同时命中全部 17 个母题，但它没有展开立国与战争。
   本作的差异化在稀缺母题："主角被神轻视"（8/50）、城建经营（14/50）、立国经营（17/50）。
   来源：[anime/synthesis.md](anime/synthesis.md) 第 1 节。
2. **AI 差距是结构性的**：my_ai_town 的居民是"持续会话 + 回执闭环 + 有后果的行动 + 带来源的记忆"，
   主工程现有 AI 是"围着玩家的一次性表演"。来源：[ai_npc/comparison_and_plan.md](ai_npc/comparison_and_plan.md)。
3. **主持者不该是大模型本身**：my_ai_town 的法官是确定性状态机，智子是普通 LLM 居民。女神 GM 拆成"规则执行者 + 人格会话"。
   来源：[ai_npc/my_ai_town_agents.md](ai_npc/my_ai_town_agents.md) 第 6.6 节。
4. **"凡人不信"可以系统化**：测量工具失灵（铭录无页）+ 认知纪律（亲见、转述、推断的可信度）+ 常识上限。
   来源：[anime/synthesis.md](anime/synthesis.md) 第 2.3 节、[ai_npc/my_ai_town_agents.md](ai_npc/my_ai_town_agents.md) 第 4 节。
5. **谨慎来自信息不对称，不是数值差**；更强者应藏在制度与凡人之中。来源：[anime/synthesis.md](anime/synthesis.md) 第 2.5 节。
6. **主工程战斗 sim 可以 2D 化**：战斗几乎全在 XZ 平面计算，sim 零外部依赖；需改地形、边界、水体、垂直运动、碰撞五处；
   等级上限需从 20 扩到 60。来源：[woc_reuse/combat_and_content_inventory.md](woc_reuse/combat_and_content_inventory.md)。
7. **千门回廊可建在主工程天赋效果层之上**（`TalentEffect`、`ProcDef`），"钥"的评估仿照功绩评估器另建表；
   跨职能习得已有入口，但需要补多资源模型。来源同上。
8. **大规模单位与 AI 必须分层**：英雄用完整实体，兵团按期望值结算，SLG 抽象结算；普通居民与士兵走规则批量模拟。
   英雄应是乘数而不是清场器。来源：[open_share/city_rts_slg.md](open_share/city_rts_slg.md)。
9. **统治者 AI 管线**：感知摘要，大模型从枚举菜单选意图，内核按 P0 到 P4 校验，HTN/Utility 执行，模型不可用时 Utility 兜底。
   女神的价格与灾害干预以注册过的修正项进入内核。来源同上。
10. **研发方法**：按层推进并设评审门（愿景与正典、调研、叙事、概要设计、详细设计、技术方案、实施包、代码）；
    首个版本只验证一组核心问题，无模型降级档必须能通关。
    来源：[woc_reuse/internal_playbooks.md](woc_reuse/internal_playbooks.md)、[open_share/game_dev_methodology.md](open_share/game_dev_methodology.md)。
11. **城建、RTS、SLG 都有可读的开源实现，但几乎只能借方法**：40 个仓库核实后，可借代码的只有 CorsixTH、Tanks of Freedom（MIT）与 Unciv（MPL-2.0 文件级）；
    其余为 GPL 系或无许可。跨品类共识是：软数值用"目标值加有限步长趋近"，所有加成走一条带叠加组与记账的修正项管线，委托只调目标、优先级与开关，
    AI 只通过玩家同一条命令通道行动。来源：[open_source/README.md](open_source/README.md) 第 4、6 节。

## 许可提醒（复用主工程时）

主工程源码（含数据即代码）为 MIT，可复用；但 `public/ui/skills/` 下的第三方技能图标不可再分发，部分音效为非商用许可，
"World of ClaudeCraft"名称不授权。详见 [woc_reuse/combat_and_content_inventory.md](woc_reuse/combat_and_content_inventory.md) 的许可一节。
