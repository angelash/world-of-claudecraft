# 技能、天赋与光环目录（Catalog of Abilities, Talents and Auras）

> 内容总纲第 12 节第 15 号目录，命名空间 `sk_`（技能）、`tal_`（天赋）、`aur_`（光环）。范围：`data/combat/abilities.json` 与
> `auras.json` 现有 ID 到本作自有编号的对照表（覆盖两份数据文件的全部现有 ID，RE-27 的输入）；编外者第一幕各门授予的技能族与技架；
> 第一幕同伴与有名 NPC 的 1 到 15 级技能组；第一幕魔物与首领的技能与光环；[战斗与职能][cmb]第 19.5 节定义的状态光环 `aur_st_*` 的编号。
> 九职能全量（每职能约 26 项基础技能）、3 个流派的真意与奥义、七道铭纹、战场技能 `sk_bf_` 不在本文范围，归 PK-M2-36（第 8 节）。
> 上游：[战斗与职能][cmb]（数值骨架：标准量 `S(L)`、强度系数、资源模型、九职能总则、编外者伪职能、技能与光环通用读法、状态与控制、
> 首领机制、第 19.5 节状态光环定义）、[内容总纲][bible]（命名空间一个 ID 一个主人、禁止复用主工程显示名）、
> [千门系统][td]（门的效果类型 `abilities`、`pool`、`spec`）、[门目录][doors]（职能门、流派之门、第一幕开启的门与钥）、
> [同伴与队伍][cmp]（第 4.3 节锚点等级、第 6 节技能来源）、[魔物图鉴][best]、[迷宫与首领目录][dgc]、
> [第一幕][a1]（第 10、11 节）、[序章][a0]（第 2.2 节前世之门）、[力量体系][pow]（第 5 节技能与天赋的世界观解释）。
> 约束：发布前全部技能与光环使用本作自有编号 `sk_`、`tal_`、`aur_`（决策日志 D-071 的 R-09）；ID 全小写加下划线，稳定不改；
> 每个 ID 只有一个主人（总纲 13）；显示名原创，不用主工程技能名与已知作品名（总纲 1 第 8 条）。
> 撰写时点：2026-11-17。

## 0. 一页结论

1. **对照表覆盖两份数据文件的全部现有 ID：** `abilities.json` 123 条、`auras.json` 84 条，每条给出去向：原样保留（只换前缀与显示名）、
   重命名（换一个更贴切的原创显示名）、合并（多条旧 ID 的效果并入同一个新 ID）、拆分（技能内嵌的光环效果独立登记出一个新光环 ID）、
   退休（不进本作编号体系，功能并入魔物机制字段或内核效果原语）。第一幕实际用到的每一个 `sk_`、`tal_`、`aur_` 在本文有且只有一条定义行。
2. **编外者的第一幕技能全部来自门，不来自职阶表：** 初门·醒给"门之一击"与"门之闪身"；刃、猎、借形、渊契四扇职能门各给一族基础技
   （现有数据的 `abilities` 门效果原样对照，只换编号）；技架容量随历练等级扩大（第 4 节）。
3. **第一幕同伴与战斗 NPC 的 1 到 15 级技能组按学会等级给出：** 夜羽、希雅、罗恩、欧拉四名随队同伴，德里斯、巴托两名战士族战斗
   NPC，各给一套按职能技能表折算的技能组（第 5 节）。
4. **第一幕魔物与首领的技能、光环按现有数据原样换编号，机制字段不动：** 守护巨鸦、晶背之母、瑟格"独眼"、澱巨像四场首领战逐条列出
   阶段技能与光环对照；异名者（裂耳、黑脊）与区域魔物各一行（第 6 节）。
5. **`aur_st_*` 状态光环在本文落编号，效果仍以[战斗与职能][cmb]对应小节为定义源：** 威压三个（位阶差 4 及以上沿用压境的编号）、复苏门疲、泉畔之代价、逆泉印记、
   倒地虚弱、失衡、软硬狂暴、醉意、药毒、澱斑三阶、失信、伤病五类，共 21 个编号；本文只负责编号与现行数据 ID 的对照，不重写效果
   数值（第 7 节）。
6. **两处现有数据的显示名与主工程技能显示名完全相同，已改名：** `crusader_strike`"十字军打击"改为"誓击"（`sk_pal_oathstrike`）；
   `psychic_scream`"心灵尖啸"改为"裂空啸"（`sk_pri_rendingwail`）。扫描结果与改名理由见第 10 节。
7. **第二幕起的九职能全量、3 个流派、七道铭纹与战场技能 `sk_bf_` 不在本文内：** 本文只登记序章与第一幕引用的条目；第 8 节给出一段
   范围说明并止笔，交给 PK-M2-36（技能、天赋与光环目录，第二幕起）。
8. **第一幕另有两条新条目：** 余烬门守套的装备光环 `aur_ember_door`（第 3.3 节）；渊契之门第一幕版本立约所得的契约魔巨像残意
   `fiend_colossus_remnant`，含模板、两项技能、召唤技能与血契代价（第 4.5 节）。数据层用的就是本文的编号：两份数据文件的全部 ID
   已换成 `sk_`、`aur_`，旧 ID 登记在重命名表里随读档迁移，两条新条目与 `aur_st_downed_weak` 随内容批次
   `content_act1_abilities_01` 导入（PK-M1-26）。第一幕没有天赋（`tal_`）条目：编外者没有铭纹，同伴的铭纹全表归 PK-M2-36。

## 1. ID 对照表的读法

- **去向**：`保留` 只换前缀，显示名不变或仅小修；`重命名` 换一个原创显示名（原名撞到主工程或已知作品，或原名过于笼统）；
  `合并` 多条旧 ID 的效果并入同一个新 ID（旧 ID 的字段作为该新 ID 的技阶或变体参数，不再独立存在）；`拆分` 技能定义里内嵌的光环效果
  （`effects` 数组里的 `aura` 项）独立登记出一个新光环 ID；`退休` 不进本作编号体系，效果并入魔物机制字段（已在[战斗 11][cmb]登记）或内核
  效果原语，不需要单独的技能或光环 ID。
- **新 ID 的命名**：`sk_<族>_<词>`、`aur_<族>_<词>`；编外者门技用 `sk_door_<词>`；九职能技能按职能族前缀：`war`（战士）、`pal`（圣骑士）、
  `hun`（猎人）、`rog`（盗贼）、`pri`（牧师）、`sha`（萨满）、`mag`（法师）、`lok`（术士）、`dru`（德鲁伊）；魔物与首领技能、光环按
  `sk_mon_<词>`、`aur_mon_<词>`（契约魔的战斗模板是魔物模板加 `pet` 行为，它的技能与光环同样用 `sk_mon_`、`aur_mon_`）；
  装备光环用光环键 `aur_<键>`（[装备 11.2][eqp]第 4 条）；状态光环见第 7 节的 `aur_st_<词>`。
- **显示名**：全部原创；与现有数据 `name` 字段对比，逐条过第 10 节的扫描，撞主工程显示名或已知作品名的改名，其余沿用或按本文定稿微调。
- **数值**：本文只定编号与去向，不改现有数据的数值公式；效果摘要写现有数据的 `amount` 公式摘要，供核对。自有编号替换只换编号与
  本文改定的显示名，数值原样；按标准量 `S(L)` 与强度系数的重算，与状态光环按[战斗][cmb]各节重写的数值，随战斗规则扩展与 M1 平衡回归
  落地（PK-M1-11、PK-M1-42）。

## 2. 技能对照表

### 2.1 编外者门技（2 条）：初门·醒

| 旧 ID | 旧名 | 新 ID | 新名 | 去向 | 效果摘要 |
| --- | --- | --- | --- | --- | --- |
| `door_strike` | 门之一击 | `sk_door_strike` | 门之一击 | 保留 | 武器 ×1.2 加（基础 6，每级 2.5）；冷却 6 秒；[战斗 7][cmb] |
| `door_step` | 门之闪身 | `sk_door_step` | 门之闪身 | 保留 | 瞬发，自我施加 `aur_door_dodge`（闪避 +40%，6 秒，拆分登记见 3.1 节） |

### 2.2 编外者通用门技（5 条）：前世之门与收放之门

| 旧 ID | 旧名 | 新 ID | 新名 | 去向 | 效果摘要 |
| --- | --- | --- | --- | --- | --- |
| `first_aid` | 急救 | `sk_door_firstaid` | 急救 | 保留 | 施加 `aur_door_firstaid`（周期治疗，1.5 秒读条，冷却 60 秒）；前世之门"白衣"授予 |
| `hearty_meal` | 热饭 | `sk_door_heartymeal` | 热饭 | 保留 | 施加 `aur_well_fed`（团队增益）；前世之门"灶火"授予 |
| `field_mend` | 修补 | `sk_door_fieldmend` | 修补 | 保留 | 施加 `aur_door_fieldmend`（护甲增益）；前世之门"扳手"授予 |
| `release_presence` | 释放灵压 | `sk_door_releasepresence` | 释放灵压 | 保留 | 施加 `aur_mon_overawed`；[战斗 3.5][cmb]收放之门的"释放" |
| `clear_flow` | 澄流 | `sk_door_clearflow` | 澄流 | 保留 | 驱散 2 个减益加治疗；澄流之门 |

### 2.3 战士（刃之门，10 条）

| 旧 ID | 旧名 | 新 ID | 新名 | 去向 | 效果摘要（学会等级按[战斗][cmb] 6.2 的现行数据） |
| --- | --- | --- | --- | --- | --- |
| `heroic_strike` | 英勇打击 | `sk_war_heroicstrike` | 英勇打击 | 保留 | 武器 ×1 加（基础 11，每级 2.5）；消耗战意 15；threat ×1.3 |
| `battle_shout` | 战斗怒吼 | `sk_war_battleshout` | 战斗怒吼 | 保留 | 消耗战意 10；施加 `aur_war_battleshout`（团队攻强增益） |
| `charge` | 冲锋 | `sk_war_charge` | 冲锋 | 保留 | 位移技能，冷却 15 秒，命中施加 `aur_war_chargestun`（昏迷 1 秒） |
| `rend` | 撕裂 | `sk_war_rend` | 撕裂 | 保留 | 消耗战意 10；施加持续伤害 `aur_war_rend` |
| `thunder_clap` | 雷霆一击 | `sk_war_thunderclap` | 雷霆一击 | 保留 | 范围伤害（基础 10，每级 2）；消耗战意 20；施加 `aur_war_thunderclapslow` |
| `taunt` | 嘲讽 | `sk_war_taunt` | 嘲讽 | 保留 | 冷却 8 秒；[战斗 2.5][cmb]嘲讽效果 |
| `sunder_armor` | 破甲攻击 | `sk_war_sunderarmor` | 破甲攻击 | 保留 | 消耗战意 15；施加 `aur_war_sunderarmor`（破甲，5 层） |
| `cleave` | 顺劈斩 | `sk_war_cleave` | 顺劈斩 | 保留 | 武器 ×1 加（基础 5，每级 1.5），范围；消耗战意 20 |
| `execute` | 斩杀 | `sk_war_execute` | 斩杀 | 保留 | 伤害（基础 125，每级 12，系数 0.4）；消耗战意 15；残血技 |
| `shield_wall` | 盾墙 | `sk_war_shieldwall` | 盾墙 | 保留 | 冷却 120 秒；施加 `aur_war_shieldwall`（受伤 -50%，10 秒） |

### 2.4 圣骑士（誓光之门，10 条）

| 旧 ID | 旧名 | 新 ID | 新名 | 去向 | 效果摘要 |
| --- | --- | --- | --- | --- | --- |
| `crusader_strike` | 十字军打击 | `sk_pal_oathstrike` | 誓击 | 重命名（主工程技能显示名零命中，第 10 节） | 武器 ×1.1 加（基础 4，每级 1）；冷却 6 秒 |
| `holy_light` | 圣光术 | `sk_pal_holylight` | 圣光术 | 保留 | 读条 2.5 秒；治疗（基础 42，每级 22，系数 0.71） |
| `devotion_aura` | 虔诚光环 | `sk_pal_devotionaura` | 虔诚光环 | 保留 | 施加 `aur_pal_devotionaura`（团队护甲增益） |
| `judgement` | 审判 | `sk_pal_judgement` | 审判 | 保留 | 冷却 8 秒；伤害（基础 15，每级 4.5，系数 0.4） |
| `divine_protection` | 圣佑术 | `sk_pal_divineprotection` | 圣佑术 | 保留 | 冷却 120 秒；施加 `aur_pal_divineprotection`（受伤 -50%，8 秒） |
| `hammer_of_justice` | 制裁之锤 | `sk_pal_hammerofjustice` | 制裁之锤 | 保留 | 冷却 30 秒，射程 6；施加 `aur_pal_hojstun`（昏迷 3 秒） |
| `lay_on_hands` | 圣疗术 | `sk_pal_layonhands` | 圣疗术 | 保留 | 冷却 300 秒；治疗目标生命的 100% |
| `holy_taunt` | 正义防御 | `sk_pal_holytaunt` | 正义防御 | 保留 | 冷却 10 秒，射程 8；嘲讽效果 |
| `consecration` | 奉献 | `sk_pal_consecration` | 奉献 | 保留 | 冷却 8 秒；施加 `aur_pal_consecration`（周期范围伤害，光相） |
| `flash_of_light` | 圣光闪现 | `sk_pal_flashoflight` | 圣光闪现 | 保留 | 读条 1.5 秒；治疗（基础 30，每级 10，系数 0.43） |

### 2.5 猎人（猎之门，9 条）

| 旧 ID | 旧名 | 新 ID | 新名 | 去向 | 效果摘要 |
| --- | --- | --- | --- | --- | --- |
| `raptor_strike` | 猛禽一击 | `sk_hun_raptorstrike` | 猛禽一击 | 保留 | 武器 ×1 加（基础 5，每级 1.5） |
| `arcane_shot` | 奥术射击 | `sk_hun_arcaneshot` | 奥术射击 | 保留 | 冷却 6 秒，射程 8；伤害（基础 13，每级 3.5，系数 0.15，攻强） |
| `serpent_sting` | 毒蛇钉刺 | `sk_hun_serpentsting` | 毒蛇钉刺 | 保留 | 射程 8；施加持续伤害 `aur_hun_serpentsting` |
| `hunters_mark` | 猎人印记 | `sk_hun_huntersmark` | 猎人印记 | 保留 | 射程 10；施加 `aur_hun_huntersmark`（目标受伤加成，120 秒） |
| `concussive_shot` | 震荡射击 | `sk_hun_concussiveshot` | 震荡射击 | 保留 | 冷却 12 秒；伤害（基础 5，每级 1）加 `aur_hun_concussive`（减速） |
| `aspect_of_the_hawk` | 雄鹰守护 | `sk_hun_aspectofthehawk` | 雄鹰守护 | 保留 | 自我施加 `aur_hun_aspectofthehawk`（攻强增益，1800 秒） |
| `wing_clip` | 摔绊 | `sk_hun_wingclip` | 摔绊 | 保留 | 伤害（基础 5，每级 0.5）加 `aur_hun_wingclip`（减速） |
| `multi_shot` | 多重射击 | `sk_hun_multishot` | 多重射击 | 保留 | 冷却 10 秒，射程 8；武器 ×1 加（每级 2），范围 |
| `aimed_shot` | 瞄准射击 | `sk_hun_aimedshot` | 瞄准射击 | 保留 | 冷却 6 秒，读条 3 秒；武器 ×1 加（基础 70，每级 8） |

### 2.6 盗贼（影之门，9 条）

| 旧 ID | 旧名 | 新 ID | 新名 | 去向 | 效果摘要 |
| --- | --- | --- | --- | --- | --- |
| `sinister_strike` | 邪恶攻击 | `sk_rog_sinisterstrike` | 邪恶攻击 | 保留 | 消耗气息 45；武器 ×1 加（基础 3，每级 1.2）；得 1 点破绽 |
| `eviscerate` | 剔骨 | `sk_rog_eviscerate` | 剔骨 | 保留 | 消耗气息 35；伤害（基础 6，每级 1.5，系数 0.03）加每破绽（基础 8，每级 3） |
| `backstab` | 背刺 | `sk_rog_backstab` | 背刺 | 保留 | 消耗气息 60；武器 ×1.5 加（基础 15，每级 2）；得 1 点破绽 |
| `gouge` | 凿击 | `sk_rog_gouge` | 凿击 | 保留 | 冷却 10 秒，消耗气息 45；施加 `aur_rog_gouge`（瘫痪类）；得 1 点破绽 |
| `evasion` | 闪避 | `sk_rog_evasion` | 闪避 | 保留 | 冷却 120 秒；自我施加 `aur_rog_evasion`（闪避增益） |
| `slice_and_dice` | 切割 | `sk_rog_sliceanddice` | 切割 | 保留 | 消耗气息 25；自我施加 `aur_rog_sliceanddice`（急速增益，按破绽延长） |
| `sprint` | 疾跑 | `sk_rog_sprint` | 疾跑 | 保留 | 冷却 120 秒；自我施加 `aur_rog_sprint`（移速增益） |
| `kick` | 脚踢 | `sk_rog_kick` | 脚踢 | 保留 | 冷却 10 秒，消耗气息 25；打断效果（学派锁定 4 秒） |
| `rupture` | 割裂 | `sk_rog_rupture` | 割裂 | 保留 | 消耗气息 25；施加持续伤害 `aur_rog_rupture`（按破绽） |

### 2.7 牧师（祷之门，10 条）

| 旧 ID | 旧名 | 新 ID | 新名 | 去向 | 效果摘要 |
| --- | --- | --- | --- | --- | --- |
| `smite` | 惩击 | `sk_pri_smite` | 惩击 | 保留 | 读条 2 秒；伤害（基础 13，每级 6，系数 0.57），光相 |
| `lesser_heal` | 次级治疗术 | `sk_pri_lesserheal` | 次级治疗术 | 保留 | 读条 2 秒；治疗（基础 46，每级 6，系数 0.57） |
| `power_word_fortitude` | 真言术：韧 | `sk_pri_fortitude` | 真言术：韧 | 保留 | 施加 `aur_pri_fortitude`（团队耐力增益） |
| `shadow_word_pain` | 暗言术：痛 | `sk_pri_shadowpain` | 暗言术：痛 | 保留 | 射程 9；施加持续伤害 `aur_pri_shadowpain`，幽相 |
| `power_word_shield` | 真言术：盾 | `sk_pri_powerwordshield` | 真言术：盾 | 保留 | 冷却 4 秒；施加吸收盾 `aur_pri_powerwordshield` 加 `aur_pri_weakenedsoul` |
| `renew` | 恢复 | `sk_pri_renew` | 恢复 | 保留 | 施加周期治疗 `aur_pri_renew` |
| `mind_blast` | 心灵震爆 | `sk_pri_mindblast` | 心灵震爆 | 保留 | 冷却 8 秒，读条 1.5 秒；伤害（基础 39，每级 8，系数 0.43），幽相 |
| `psychic_scream` | 心灵尖啸 | `sk_pri_rendingwail` | 裂空啸 | 重命名（与主工程技能显示名完全相同，第 10 节） | 冷却 30 秒，范围；施加 `aur_mon_feared` |
| `heal` | 治疗术 | `sk_pri_heal` | 治疗术 | 保留 | 读条 3 秒；治疗（基础 120，每级 28，系数 0.86） |
| `flash_heal` | 快速治疗 | `sk_pri_flashheal` | 快速治疗 | 保留 | 读条 1.5 秒；治疗（基础 60，每级 14，系数 0.43） |

### 2.8 萨满（聆灵之门，9 条）

| 旧 ID | 旧名 | 新 ID | 新名 | 去向 | 效果摘要 |
| --- | --- | --- | --- | --- | --- |
| `lightning_bolt` | 闪电箭 | `sk_sha_lightningbolt` | 闪电箭 | 保留 | 读条 2 秒；伤害（基础 13，每级 7，系数 0.57），自然相 |
| `healing_wave` | 治疗波 | `sk_sha_healingwave` | 治疗波 | 保留 | 读条 2.5 秒；治疗（基础 36，每级 25，系数 0.71） |
| `rockbiter_weapon` | 石化武器 | `sk_sha_rockbiterweapon` | 石化武器 | 保留 | 自我施加 `aur_sha_rockbiter`（攻强增益） |
| `earth_shock` | 地震术 | `sk_sha_earthshock` | 地震术 | 保留 | 冷却 6 秒，射程 6；伤害（基础 19，每级 6，系数 0.39）加打断（锁 2 秒） |
| `lightning_shield` | 闪电之盾 | `sk_sha_lightningshield` | 闪电之盾 | 保留 | 自我施加反伤光环 `aur_sha_lightningshield` |
| `flame_shock` | 烈焰震击 | `sk_sha_flameshock` | 烈焰震击 | 保留 | 冷却 6 秒，射程 6；伤害（基础 10，每级 3，系数 0.15）加持续伤害 `aur_sha_flameshock`，火相 |
| `frost_shock` | 冰霜震击 | `sk_sha_frostshock` | 冰霜震击 | 保留 | 冷却 6 秒，射程 6；伤害（基础 25，每级 6，系数 0.38）加 `aur_sha_frostshockslow`，冰相 |
| `stormstrike` | 风暴打击 | `sk_sha_stormstrike` | 风暴打击 | 保留 | 冷却 10 秒；武器 ×1，体相伤害，加 `aur_sha_stormstrike`（目标易伤） |
| `chain_heal` | 治疗链 | `sk_sha_chainheal` | 治疗链 | 保留 | 读条 2.5 秒，范围；治疗（基础 120，每级 12，系数 0.71） |

### 2.9 法师（术式之门，9 条）

| 旧 ID | 旧名 | 新 ID | 新名 | 去向 | 效果摘要 |
| --- | --- | --- | --- | --- | --- |
| `fireball` | 火球术 | `sk_mag_fireball` | 火球术 | 保留 | 读条 2.5 秒；伤害（基础 15，每级 10，系数 0.71），火相 |
| `frost_armor` | 霜甲术 | `sk_mag_frostarmor` | 霜甲术 | 保留 | 自我施加 `aur_mag_frostarmor`（护甲增益） |
| `frostbolt` | 寒冰箭 | `sk_mag_frostbolt` | 寒冰箭 | 保留 | 读条 2 秒；伤害（基础 18，每级 8，系数 0.57）加 `aur_mag_frostboltchill`，冰相 |
| `fire_blast` | 火焰冲击 | `sk_mag_fireblast` | 火焰冲击 | 保留 | 冷却 8 秒，射程 6；伤害（基础 27，每级 7，系数 0.43），火相 |
| `polymorph` | 变形术 | `sk_mag_polymorph` | 变形术 | 保留 | 读条 1.5 秒；施加 `aur_mag_polymorph`（瘫痪类，只对野兽与人形） |
| `frost_nova` | 冰霜新星 | `sk_mag_frostnova` | 冰霜新星 | 保留 | 冷却 25 秒，范围；伤害（基础 20，每级 3，系数 0.13）加 `aur_mag_frostnovaroot`（定身） |
| `arcane_explosion` | 魔爆术 | `sk_mag_arcaneexplosion` | 魔爆术 | 保留 | 范围；伤害（基础 32，每级 6，系数 0.14），奥术相 |
| `blizzard` | 暴风雪 | `sk_mag_blizzard` | 暴风雪 | 保留 | 冷却 8 秒，射程 10；施加 `aur_mag_blizzard`（周期范围伤害加减速），冰相 |
| `counterspell` | 法术反制 | `sk_mag_counterspell` | 法术反制 | 保留 | 冷却 24 秒，射程 10；打断效果（锁 6 秒） |

### 2.10 术士（渊契之门，10 条）

| 旧 ID | 旧名 | 新 ID | 新名 | 去向 | 效果摘要 |
| --- | --- | --- | --- | --- | --- |
| `shadow_bolt` | 暗影箭 | `sk_lok_shadowbolt` | 暗影箭 | 保留 | 读条 2.5 秒；伤害（基础 14，每级 10，系数 0.71），幽相 |
| `demon_skin` | 恶魔皮肤 | `sk_lok_demonskin` | 恶魔皮肤 | 保留 | 自我施加 `aur_lok_demonskin`（护甲增益） |
| `immolate` | 献祭 | `sk_lok_immolate` | 献祭 | 保留 | 读条 1.5 秒；伤害（基础 8，每级 4，系数 0.2）加持续伤害 `aur_lok_immolate`，火相 |
| `summon_imp` | 召唤契约小鬼 | `sk_lok_summonimp` | 召唤契约小鬼 | 保留 | 读条 3 秒；召唤 `contract_imp` |
| `corruption` | 腐蚀术 | `sk_lok_corruption` | 腐蚀术 | 保留 | 施加持续伤害 `aur_lok_corruption`，幽相 |
| `life_tap` | 生命分流 | `sk_lok_lifetap` | 生命分流 | 保留 | 自身：以生命（基础 30，每级 8）换灵力；[战斗 4.5][cmb]代价术 |
| `curse_of_agony` | 痛苦诅咒 | `sk_lok_curseofagony` | 痛苦诅咒 | 保留 | 施加持续伤害 `aur_lok_curseofagony`，幽相 |
| `fear` | 恐惧术 | `sk_lok_fear` | 恐惧术 | 保留 | 读条 1.5 秒；施加 `aur_mon_feared` |
| `drain_life` | 吸取生命 | `sk_lok_drainlife` | 吸取生命 | 保留 | 伤害（基础 10，每级 5，系数 0.3）加吸血 |
| `rain_of_fire` | 火焰之雨 | `sk_lok_rainoffire` | 火焰之雨 | 保留 | 冷却 8 秒，范围，射程 10；施加 `aur_lok_rainoffire`（周期范围伤害），火相 |

### 2.11 德鲁伊（借形之门，10 条）

| 旧 ID | 旧名 | 新 ID | 新名 | 去向 | 效果摘要 |
| --- | --- | --- | --- | --- | --- |
| `wrath` | 愤怒 | `sk_dru_wrath` | 愤怒 | 保留 | 读条 2 秒；伤害（基础 13，每级 7，系数 0.57），自然相 |
| `healing_touch` | 治疗之触 | `sk_dru_healingtouch` | 治疗之触 | 保留 | 读条 2.5 秒；治疗（基础 40，每级 26，系数 0.71） |
| `mark_of_the_wild` | 野性印记 | `sk_dru_markofthewild` | 野性印记 | 保留 | 施加团队增益 `aur_dru_markofthewild`（五项主属性加护甲） |
| `moonfire` | 月火术 | `sk_dru_moonfire` | 月火术 | 保留 | 射程 9；伤害（基础 9，每级 4，系数 0.15）加持续伤害 `aur_dru_moonfire`，奥术相 |
| `rejuvenation` | 回春术 | `sk_dru_rejuvenation` | 回春术 | 保留 | 施加周期治疗 `aur_dru_rejuvenation` |
| `thorns` | 荆棘术 | `sk_dru_thorns` | 荆棘术 | 保留 | 施加反伤光环 `aur_dru_thorns` |
| `entangling_roots` | 纠缠根须 | `sk_dru_entanglingroots` | 纠缠根须 | 保留 | 读条 1.5 秒，射程 9；施加 `aur_dru_entanglingroots`（定身加持续伤害） |
| `regrowth` | 愈合 | `sk_dru_regrowth` | 愈合 | 保留 | 读条 2 秒；治疗（基础 90，每级 14，系数 0.5）加周期治疗 `aur_dru_regrowth` |
| `barkskin` | 树皮术 | `sk_dru_barkskin` | 树皮术 | 保留 | 冷却 60 秒；自我施加 `aur_dru_barkskin`（受伤降低） |
| `insect_swarm` | 虫群 | `sk_dru_insectswarm` | 虫群 | 保留 | 射程 9；施加持续伤害 `aur_dru_insectswarm`，自然相 |

### 2.12 魔物与首领技能（30 条）

本节覆盖 `abilities.json` 中不属于任何职能技能表、也不是编外者门技的全部条目。族前缀统一 `sk_mon_`；旧名多为现有数据的中文占位名，
与主工程技能名与已知作品名核对后零命中（第 10 节），沿用。

| 旧 ID | 旧名 | 新 ID | 新名 | 去向 | 效果摘要 | 使用者 |
| --- | --- | --- | --- | --- | --- | --- |
| `peck_eyes` | 啄目 | `sk_mon_peckeyes` | 啄目 | 保留 | 冷却 20 秒；施加 `aur_mon_blinded`（瘫痪类） | `raven_flock` 鸦群 |
| `lime_powder` | 石灰粉 | `sk_mon_limepowder` | 石灰粉 | 保留 | 冷却 25 秒，射程 2；施加 `aur_mon_blinded` | `oneeye_bandit` 独眼团匪徒、`vero` 薇罗 |
| `dian_bite` | 澱蚀 | `sk_mon_dianbite` | 澱蚀 | 保留 | 冷却 10 秒；武器 ×0.6（体相）加持续伤害 `aur_mon_dianrot` | `dian_wolf` 等五种澱化异兽（含晶脊蜈系） |
| `grey_web` | 灰丝 | `sk_mon_greyweb` | 灰丝 | 保留 | 冷却 15 秒，射程 6；施加 `aur_mon_webbed`（定身） | `edge_spider` 林缘织网蛛 |
| `blood_rage` | 血怒 | `sk_mon_bloodrage` | 血怒 | 保留 | 冷却 20 秒；自我施加 `aur_mon_bloodrage`（急速加伤害增益） | `split_ear` 裂耳（异名者）、`seg_oneeye` 瑟格"独眼"（软狂暴） |
| `wail` | 枯哭 | `sk_mon_wail` | 枯哭 | 保留 | 冷却 20 秒，范围；施加 `aur_mon_demoralized`（士气低落） | `wandering_bones` 游荡骸骨 |
| `grave_chill` | 冥寒 | `sk_mon_gravechill` | 冥寒 | 保留 | 冷却 10 秒，范围；伤害（基础 8，每级 2.5） | `waste_wraith` 荒原怨灵、`drowned` 溺亡者、`ash_elemental` 灰烬元素 |
| `maul_swipe` | 重击 | `sk_mon_maulswipe` | 重击 | 保留 | 冷却 8 秒；武器 ×1.5 | `black_ridge` 黑脊（异名者） |
| `crystal_fall` | 晶落 | `sk_mon_crystalfall` | 晶落 | 保留 | 冷却 12 秒，范围；伤害（基础 15，每级 4） | `crystal_mother` 晶背之母（迷宫之主） |
| `monster_cleave` | 顺劈 | `sk_mon_cleave` | 顺劈 | 保留 | 冷却 6 秒；武器 ×1，范围 | `seg_oneeye`、`rat_king`、`ashen_knight`、`dian_drake`、`redfang_brute`、`faceless_soldier` |
| `monster_charge` | 猛冲 | `sk_mon_charge` | 猛冲 | 保留 | 冷却 20 秒，射程 10；位移加武器 ×0.8 加 `aur_mon_chargestun` | `crystal_centipede`、`ashen_knight`、`redfang_brute`、`sasha` 萨莎 |
| `terrify` | 恐吓 | `sk_mon_terrify` | 恐吓 | 保留 | 冷却 30 秒，范围；施加 `aur_mon_terrified`（恐惧） | `black_ridge`、`dian_drake` |
| `feather_storm` | 灰羽风暴 | `sk_mon_featherstorm` | 灰羽风暴 | 保留 | 冷却 10 秒，范围；伤害（基础 10，每级 3），幽相 | `guardian_raven` 守护巨鸦（首领）、`dian_drake` |
| `wing_buffet` | 翼击 | `sk_mon_wingbuffet` | 翼击 | 保留 | 冷却 14 秒，范围；伤害（基础 5，每级 2）加击退 3 格 | `guardian_raven`（阶段二，机制字段 `phases.abilities`） |
| `heart_peck` | 啄心 | `sk_mon_heartpeck` | 啄心 | 保留 | 冷却 10 秒；武器 ×1.2 加 `aur_mon_mortalwound`（致命伤） | `guardian_raven`（阶段三） |
| `stomp` | 重踏 | `sk_mon_stomp` | 重踏 | 保留 | 冷却 15 秒，范围；伤害（基础 10，每级 3）加 `aur_mon_stompstun`（短晕） | `dian_colossus` 澱巨像（剧情首领） |
| `ash_tide` | 灰潮 | `sk_mon_ashtide` | 灰潮 | 保留 | 冷却 18 秒，范围，幽相；施加 `aur_mon_ashtideslow`（减速） | `dian_colossus`、`ash_elemental` |
| `ash_shell` | 灰壳 | `sk_mon_ashshell` | 灰壳 | 保留 | 冷却 30 秒；自我施加吸收盾 `aur_mon_ashshell` | `dian_colossus`（阶段二，机制字段） |
| `ash_rain` | 灰雨 | `sk_mon_ashrain` | 灰雨 | 保留 | 冷却 25 秒，读条 3.5 秒，范围，幽相；伤害（基础 30，每级 6） | `dian_colossus`（阶段二）、`faceless_king` 无貌之王 |
| `dian_fist` | 澱拳 | `sk_mon_dianfist` | 澱拳 | 保留 | 冷却 6 秒；武器 ×1.3 | `dian_colossus`、`faceless_soldier` |
| `rift_slash` | 裂门斩 | `sk_mon_riftslash` | 裂门斩 | 保留 | 冷却 12 秒，读条 1.5 秒；武器 ×2，范围 | `faceless_king`（终战剧情首领） |
| `dian_mark` | 澱痕 | `sk_mon_dianmark` | 澱痕 | 保留 | 冷却 15 秒，射程 10，范围，幽相；施加 `aur_mon_dianmark`（周期伤害） | `faceless_king` |
| `thousand_pain` | 千貌之痛 | `sk_mon_thousandpain` | 千貌之痛 | 保留 | 冷却 12 秒，射程 10，幽相；施加 `aur_mon_thousandpain`（易伤，10 层） | `faceless_king`（阶段一） |
| `dian_infusion` | 澱灌 | `sk_mon_dianinfusion` | 澱灌 | 保留 | 冷却 30 秒，读条 4 秒；自我治疗（基础 200，每级 40） | `faceless_king`（阶段一，机制字段） |
| `jab` | 刺拳 | `sk_mon_jab` | 刺拳 | 保留 | 冷却 4 秒；武器 ×0.8 加（基础 5，每级 1） | `sasha` 萨莎（大迷宫首领） |
| `haymaker` | 重拳 | `sk_mon_haymaker` | 重拳 | 保留 | 冷却 12 秒，读条 1 秒；武器 ×2.5 加 `aur_mon_dazed`（短晕） | `sasha` |
| `crystal_spike` | 晶刺 | `sk_mon_crystalspike` | 晶刺 | 保留 | 冷却 8 秒，范围；伤害（基础 10，每级 3）加自我施加 `aur_mon_crystalpillars` | `crystal_centipede` 晶脊蜈（迷宫之主） |
| `sludge_spit` | 腐泥喷吐 | `sk_mon_sludgespit` | 腐泥喷吐 | 保留 | 冷却 10 秒，射程 6，自然相；伤害（基础 8，每级 2.5）加 `aur_mon_sludgeslow`（减速） | `sewer_sludge` 腐泥团（第二幕引用） |
| `leech_drain` | 吸血 | `sk_mon_leechdrain` | 吸血 | 保留 | 冷却 8 秒；武器 ×0.8 加吸血 | `dian_leech` 澱化水蛭（第二幕引用） |
| `page_burn` | 焚页 | `sk_mon_pageburn` | 焚页 | 保留 | 冷却 10 秒，射程 8，火相；伤害（基础 10，每级 3）加 `aur_mon_burningpages`（持续伤害） | `ash_bookwraith` 灰烬书灵（第二幕引用） |

技能对照合计 123 条：编外者门技 7（2.1 加 2.2）、九职能基础技能族 86（2.3 到 2.11）、魔物与首领技能 30（2.12），7 + 86 + 30 = 123。

## 3. 光环对照表

### 3.1 编外者门技内嵌光环（拆分登记，2 条）

| 旧来源 | 新 ID | 新名 | 去向 | 效果摘要 |
| --- | --- | --- | --- | --- |
| `door_step`（旧技能内嵌 `kind: buff, stats.dodge: 40`） | `aur_door_dodge` | 门之闪身（光环） | 拆分 | 闪避 +40%，6 秒 |
| （旧 `auras.json` 的 `door_step` 条目本身） | 同上 | 同上 | 合并 | 现有 `auras.json` 已有同名独立条目，与技能内嵌效果合并为一条，避免重名 |

### 3.2 光环对照表（`auras.json`，84 条）

族前缀与第 2 节技能一致；状态光环（标 `aur_st_`）的编号与去向见第 7 节，本表只列引用处，不重复定义。

| 旧 ID | 旧名 | 新 ID | 新名 | 去向 | 效果摘要 | 施加来源 |
| --- | --- | --- | --- | --- | --- | --- |
| `door_step` | 门之闪身 | `aur_door_dodge` | 门之闪身 | 合并（见 3.1） | 闪避 +40%，6 秒 | `sk_door_step` |
| `first_aid` | 急救 | `aur_door_firstaid` | 急救 | 保留 | 周期治疗（基础 4，每级 1.5，每秒），8 秒 | `sk_door_firstaid` |
| `well_fed` | 吃饱了 | `aur_well_fed` | 吃饱了 | 保留 | 耐力与精神增益，1800 秒 | `sk_door_heartymeal`；多条消耗品引用 |
| `field_mend` | 修补过的甲胄 | `aur_door_fieldmend` | 修补过的甲胄 | 保留 | 护甲增益，600 秒 | `sk_door_fieldmend` |
| `runners_stride` | 跑者的步子 | `aur_door_runnersstride` | 跑者的步子 | 保留 | 移速 +8%，不可驱散 | 前世之门"路标" |
| `door_mirror` | 门镜 | `aur_door_mirror` | 门镜 | 保留 | 闪避加命中小额增益，不可驱散 | 初门·醒（`door_awaken` 的被动光环） |
| `overawed` | 震慑 | `aur_mon_overawed` | 震慑 | 保留 | 减速 50%，造成伤害 -20%，6 秒 | `sk_door_releasepresence` |
| `presence_pressure` | 威压 | `aur_st_presence_pressure` | 威压·压境 | 保留（状态光环，见第 7 节） | [战斗 3.5][cmb]位阶差 2 档的场效应 | 位阶场效应（系统，非技能触发） |
| `presence_paralysis` | 动弹不得 | `aur_st_presence_paralysis` | 威压·失神 | 保留（状态光环，见第 7 节） | [战斗 3.5][cmb]位阶差 3 档首次进入的昏迷 | 同上 |
| `door_fatigue` | 门疲 | `aur_st_revival_fatigue` | 复苏门疲 | 重命名（随状态光环定稿，见第 7 节） | [战斗 15.1][cmb]复苏门疲状态；数值按该节重写 | 死亡退回门内 |
| `spring_weakness` | 泉畔之代价 | `aur_st_spring_toll` | 泉畔之代价 | 重命名（随状态光环定稿） | [战斗 15.3][cmb]复活代价；数值按该节重写 | 复活 |
| `interrupted` | 封咒 | `aur_mon_schoollock` | 学派封锁 | 保留 | 该学派 4 秒内不可施放（打断后的学派锁定） | `sk_mon_*` 的打断效果与 `sk_rog_kick`、`sk_mag_counterspell`、`sk_sha_earthshock` 共用的锁定时长 |
| `battle_shout` | 战斗怒吼 | `aur_war_battleshout` | 战斗怒吼 | 保留 | 攻强增益（基础 15，每级 3），120 秒 | `sk_war_battleshout` |
| `charge_stun` | 冲撞昏迷 | `aur_war_chargestun` | 冲撞昏迷 | 保留 | 昏迷 1 秒 | `sk_war_charge` |
| `rend` | 撕裂 | `aur_war_rend` | 撕裂 | 保留 | 持续伤害（基础 5，每级 1.2，系数 0.02），每 3 秒一跳，9 秒 | `sk_war_rend` |
| `thunder_clap_slow` | 雷霆一击 | `aur_war_thunderclapslow` | 雷霆震荡 | 重命名（避免与技能同名造成界面混淆） | 减速 30%，急速 -10%，10 秒 | `sk_war_thunderclap` |
| `sunder_armor` | 破甲 | `aur_war_sunderarmor` | 破甲 | 保留 | 护甲 -4%，5 层，30 秒 | `sk_war_sunderarmor` |
| `shield_wall` | 盾墙 | `aur_war_shieldwall` | 盾墙 | 保留 | 受伤 -50%，10 秒 | `sk_war_shieldwall` |
| `devotion_aura` | 虔诚光环 | `aur_pal_devotionaura` | 虔诚光环 | 保留 | 护甲增益（基础 30，每级 12），600 秒 | `sk_pal_devotionaura` |
| `divine_protection` | 圣佑术 | `aur_pal_divineprotection` | 圣佑术 | 保留 | 受伤 -50%，8 秒 | `sk_pal_divineprotection` |
| `hoj_stun` | 制裁之锤 | `aur_pal_hojstun` | 制裁之锤 | 保留 | 昏迷 3 秒 | `sk_pal_hammerofjustice` |
| `consecration` | 奉献 | `aur_pal_consecration` | 奉献 | 保留 | 周期范围伤害（基础 8，每级 1.5，系数 0.04，光相），每秒一跳，8 秒 | `sk_pal_consecration` |
| `serpent_sting` | 毒蛇钉刺 | `aur_hun_serpentsting` | 毒蛇钉刺 | 保留 | 持续伤害（基础 4，每级 1.4，系数 0.02，自然相），每 3 秒一跳，15 秒 | `sk_hun_serpentsting` |
| `hunters_mark` | 猎人印记 | `aur_hun_huntersmark` | 猎人印记 | 保留 | 目标受伤 +5%，120 秒 | `sk_hun_huntersmark` |
| `concussive` | 震荡 | `aur_hun_concussive` | 震荡 | 保留 | 减速 50%，4 秒 | `sk_hun_concussiveshot` |
| `aspect_of_the_hawk` | 雄鹰守护 | `aur_hun_aspectofthehawk` | 雄鹰守护 | 保留 | 攻强增益（基础 20，每级 4），1800 秒 | `sk_hun_aspectofthehawk` |
| `wing_clip` | 摔绊 | `aur_hun_wingclip` | 摔绊 | 保留 | 减速 50%，10 秒 | `sk_hun_wingclip` |
| `gouge` | 凿击 | `aur_rog_gouge` | 凿击 | 保留 | 瘫痪类，受伤即破除，4 秒 | `sk_rog_gouge` |
| `evasion` | 闪避 | `aur_rog_evasion` | 闪避 | 保留 | 闪避 +50%，15 秒 | `sk_rog_evasion` |
| `slice_and_dice` | 切割 | `aur_rog_sliceanddice` | 切割 | 保留 | 急速 +30%，按破绽延长，基础 15 秒 | `sk_rog_sliceanddice` |
| `sprint` | 疾跑 | `aur_rog_sprint` | 疾跑 | 保留 | 移速 +70%，8 秒 | `sk_rog_sprint` |
| `rupture` | 割裂 | `aur_rog_rupture` | 割裂 | 保留 | 持续伤害（基础 10，每级 2，系数 0.03），按破绽延长，每 2 秒一跳，基础 8 秒 | `sk_rog_rupture` |
| `power_word_fortitude` | 真言术：韧 | `aur_pri_fortitude` | 真言术：韧 | 保留 | 耐力增益（基础 3，每级 0.9），1800 秒 | `sk_pri_fortitude` |
| `shadow_word_pain` | 暗言术：痛 | `aur_pri_shadowpain` | 暗言术：痛 | 保留 | 持续伤害（基础 5，每级 2.2，系数 0.1，幽相），每 3 秒一跳，18 秒 | `sk_pri_shadowpain` |
| `power_word_shield` | 真言术：盾 | `aur_pri_powerwordshield` | 真言术：盾 | 保留 | 吸收盾（基础 44，每级 15，系数 0.1），30 秒 | `sk_pri_powerwordshield` |
| `weakened_soul` | 虚弱灵魂 | `aur_pri_weakenedsoul` | 虚弱灵魂 | 保留 | 不可驱散的内部冷却标记，15 秒 | `sk_pri_powerwordshield` |
| `renew` | 恢复 | `aur_pri_renew` | 恢复 | 保留 | 周期治疗（基础 9，每级 4，系数 0.2），每 3 秒一跳，15 秒 | `sk_pri_renew` |
| `feared` | 恐惧 | `aur_mon_feared` | 恐惧 | 保留 | 恐惧，6 秒 | `sk_lok_fear`、`sk_pri_rendingwail` |
| `terrified` | 惊恐 | `aur_mon_terrified` | 惊恐 | 保留 | 恐惧，4 秒 | `sk_mon_terrify` |
| `rockbiter` | 石化武器 | `aur_sha_rockbiter` | 石化武器 | 保留 | 攻强增益（基础 10，每级 4），300 秒 | `sk_sha_rockbiterweapon` |
| `lightning_shield` | 闪电之盾 | `aur_sha_lightningshield` | 闪电之盾 | 保留 | 反伤（基础 13，每级 4），600 秒 | `sk_sha_lightningshield` |
| `flame_shock` | 烈焰震击 | `aur_sha_flameshock` | 烈焰震击 | 保留 | 持续伤害（基础 4，每级 1.5，系数 0.05，火相），每 3 秒一跳，12 秒 | `sk_sha_flameshock` |
| `frost_shock_slow` | 冰霜震击 | `aur_sha_frostshockslow` | 冰霜震击·迟滞 | 重命名（技能与光环同名的消歧） | 减速 50%，8 秒 | `sk_sha_frostshock` |
| `stormstrike` | 风暴打击 | `aur_sha_stormstrike` | 风暴打击·破绽 | 重命名（技能与光环同名的消歧） | 目标受伤 +10%，12 秒 | `sk_sha_stormstrike` |
| `frost_armor` | 霜甲术 | `aur_mag_frostarmor` | 霜甲术 | 保留 | 护甲增益（基础 30，每级 8），1800 秒 | `sk_mag_frostarmor` |
| `frostbolt_chill` | 冰寒 | `aur_mag_frostboltchill` | 冰寒 | 保留 | 减速 40%，5 秒 | `sk_mag_frostbolt` |
| `polymorph` | 变形术 | `aur_mag_polymorph` | 变形术 | 保留 | 瘫痪类，受伤即破除，20 秒 | `sk_mag_polymorph` |
| `frost_nova_root` | 冰霜新星 | `aur_mag_frostnovaroot` | 冰霜新星·定身 | 重命名（技能与光环同名的消歧） | 定身，6 秒 | `sk_mag_frostnova` |
| `blizzard` | 暴风雪 | `aur_mag_blizzard` | 暴风雪 | 保留 | 减速 30%，周期伤害（基础 6，每级 2.2，系数 0.04，冰相），每秒一跳，6 秒 | `sk_mag_blizzard` |
| `demon_skin` | 恶魔皮肤 | `aur_lok_demonskin` | 恶魔皮肤 | 保留 | 护甲增益（基础 40，每级 8），1800 秒 | `sk_lok_demonskin` |
| `immolate` | 献祭 | `aur_lok_immolate` | 献祭 | 保留 | 持续伤害（基础 4，每级 2，系数 0.13，火相），每 3 秒一跳，15 秒 | `sk_lok_immolate` |
| `corruption` | 腐蚀术 | `aur_lok_corruption` | 腐蚀术 | 保留 | 持续伤害（基础 6，每级 2.2，系数 0.15，幽相），每 3 秒一跳，18 秒 | `sk_lok_corruption` |
| `curse_of_agony` | 痛苦诅咒 | `aur_lok_curseofagony` | 痛苦诅咒 | 保留 | 持续伤害（基础 3，每级 1.5，系数 0.08，幽相），每 2 秒一跳，24 秒 | `sk_lok_curseofagony` |
| `rain_of_fire` | 火焰之雨 | `aur_lok_rainoffire` | 火焰之雨 | 保留 | 周期范围伤害（基础 8，每级 2.5，系数 0.05，火相），每秒一跳，6 秒 | `sk_lok_rainoffire` |
| `mark_of_the_wild` | 野性印记 | `aur_dru_markofthewild` | 野性印记 | 保留 | 五项主属性加护甲增益，1800 秒 | `sk_dru_markofthewild` |
| `moonfire` | 月火术 | `aur_dru_moonfire` | 月火术 | 保留 | 持续伤害（基础 2，每级 1.2，系数 0.1，奥术相），每 3 秒一跳，12 秒 | `sk_dru_moonfire` |
| `rejuvenation` | 回春术 | `aur_dru_rejuvenation` | 回春术 | 保留 | 周期治疗（基础 8，每级 4，系数 0.2），每 3 秒一跳，12 秒 | `sk_dru_rejuvenation` |
| `thorns` | 荆棘术 | `aur_dru_thorns` | 荆棘术 | 保留 | 反伤（基础 3，每级 1.2），600 秒 | `sk_dru_thorns` |
| `entangling_roots` | 纠缠根须 | `aur_dru_entanglingroots` | 纠缠根须 | 保留 | 定身加持续伤害（基础 2，每级 0.6，自然相），每 3 秒一跳，12 秒 | `sk_dru_entanglingroots` |
| `regrowth` | 愈合 | `aur_dru_regrowth` | 愈合 | 保留 | 周期治疗（基础 6，每级 2.5，系数 0.1），每 3 秒一跳，12 秒 | `sk_dru_regrowth` |
| `barkskin` | 树皮术 | `aur_dru_barkskin` | 树皮术 | 保留 | 受伤 -20%，12 秒 | `sk_dru_barkskin` |
| `insect_swarm` | 虫群 | `aur_dru_insectswarm` | 虫群 | 保留 | 持续伤害（基础 5，每级 2，系数 0.1，自然相），每 2 秒一跳，12 秒 | `sk_dru_insectswarm` |
| `blinded` | 失明 | `aur_mon_blinded` | 失明 | 保留 | 瘫痪类，受伤即破除，3 秒 | `sk_mon_peckeyes`、`sk_mon_limepowder` |
| `dian_rot` | 澱蚀 | `aur_mon_dianrot` | 澱蚀 | 保留 | 持续伤害（基础 2，每级 1，幽相），每 3 秒一跳，12 秒 | `sk_mon_dianbite` |
| `webbed` | 灰丝缠身 | `aur_mon_webbed` | 灰丝缠身 | 保留 | 定身，4 秒 | `sk_mon_greyweb` |
| `blood_rage` | 血怒 | `aur_mon_bloodrage` | 血怒 | 保留 | 急速 +30%，造成伤害 +10%，8 秒 | `sk_mon_bloodrage`；`seg_oneeye` 软狂暴 |
| `demoralized` | 士气低落 | `aur_mon_demoralized` | 士气低落 | 保留 | 造成伤害 -10%，15 秒 | `sk_mon_wail` |
| `mortal_wound` | 致命伤 | `aur_mon_mortalwound` | 致命伤 | 保留 | 受治疗 -50%，不可驱散，10 秒 | `sk_mon_heartpeck` |
| `stomp_stun` | 站立不稳 | `aur_mon_stompstun` | 站立不稳 | 保留 | 昏迷，1.5 秒 | `sk_mon_stomp` |
| `ash_tide_slow` | 灰潮 | `aur_mon_ashtideslow` | 灰潮 | 保留 | 减速 50%，6 秒 | `sk_mon_ashtide` |
| `ash_shell` | 灰壳 | `aur_mon_ashshell` | 灰壳 | 保留 | 吸收盾（基础 60，每级 20），15 秒；首领的护盾阶段（[战斗 10.4][cmb]） | `sk_mon_ashshell` |
| `dian_mark` | 澱痕 | `aur_mon_dianmark` | 澱痕 | 保留 | 周期伤害（基础 5，每级 3，幽相），每秒一跳，6 秒 | `sk_mon_dianmark` |
| `thousand_pain` | 千貌之痛 | `aur_mon_thousandpain` | 千貌之痛 | 保留 | 目标受伤 +0.5% 每层，10 层，30 秒 | `sk_mon_thousandpain` |
| `dazed` | 发懵 | `aur_mon_dazed` | 发懵 | 保留 | 昏迷，1 秒 | `sk_mon_haymaker` |
| `crystal_pillars` | 晶柱 | `aur_mon_crystalpillars` | 晶柱 | 保留 | 护甲 +10%、受伤 -4%，8 层，60 秒；[战斗 11][cmb]`pillarHarden` 的前身 | `sk_mon_crystalspike` |
| `sludge_slow` | 腐泥 | `aur_mon_sludgeslow` | 腐泥 | 保留 | 减速 40%，6 秒 | `sk_mon_sludgespit` |
| `burning_pages` | 燃烧的书页 | `aur_mon_burningpages` | 燃烧的书页 | 保留 | 持续伤害（基础 3，每级 1.2，火相），每 3 秒一跳，9 秒 | `sk_mon_pageburn` |
| `ash_mane` | 灰鬃 | `aur_mon_ashmane` | 灰鬃 | 保留 | 反伤（基础 2，每级 0.8），不可驱散，常驻 | `dian_boar` 澱野猪的被动光环（`passives`） |
| `crystal_hide` | 晶背 | `aur_mon_crystalhide` | 晶背 | 保留 | 护甲 +30%，不可驱散，常驻 | `crystal_mother`、`crystal_centipede_young` 的被动光环 |
| `enrage` | 狂暴 | `aur_st_enrage` | 软狂暴 | 退休（并入状态光环，定义见第 7.4 节，本行不再是定义行） | 造成伤害 +50%、急速 +25%，不可驱散，常驻；[战斗 10.5][cmb]软狂暴缺省光环 | `guardian_raven`、`dian_colossus`、`rat_king`、`crystal_centipede`、`faceless_king` 的 `enrage` 机制字段 |
| `tempering` | 淬炼 | `aur_mon_tempering` | 淬炼 | 保留 | 造成伤害 +5%、急速 +3% 每层，20 层，不可驱散，120 秒 | `sasha` 萨莎的 `ramp` 机制字段（第三幕） |
| `faceless_veil` | 千貌 | `aur_mon_facelessveil` | 千貌 | 保留 | 受伤 -15%，不可驱散，常驻 | `faceless_king` 的被动光环 |
| `ash_spirits` | 灰烬烈酒 | `aur_item_ashspirits` | 灰烬烈酒 | 保留 | 力量增益（基础 8，每级 0.3）、耐力增益（基础 4，每级 0.2），600 秒 | 消耗品 `ash_spirits`（[消耗品 3.9][csm]） |
| `stoneskin_draught` | 石肤药剂 | `aur_item_stoneskindraught` | 石肤药剂 | 保留 | 护甲增益（基础 150，每级 20），600 秒 | 消耗品 `stoneskin_draught`（[消耗品 3.4][csm]） |

光环对照合计 86 条：`auras.json` 现有 84 条全部覆盖，另加第 3.1 节的拆分新增 1 条（`door_step` 的技能内嵌效果独立登记，随即与同名的旧
`auras.json` 条目合并，实际净增 0 条新光环 ID，技能对照与光环对照各自的 ID 集合互不重叠）。

### 3.3 第一幕的装备光环

[装备 11.2][eqp]第 4 条：装备目录写的光环名是光环键，数据层登记为 `aur_<键>`；本节登记第一幕光环键的编号与数值（`aur_` 编号归本目录，
[战斗 19.5][cmb]）。第一幕只有一个套组用到光环键：
封门遗迹的余烬门守套 `set_dg_seal_ruins`（[装备 5.1][eqp]，`eq_emberward` 头、手、脚、信物）。

| 新 ID | 新名 | 光环键 | 施加来源 | 效果 | 数据字段 |
| --- | --- | --- | --- | --- | --- |
| `aur_ember_door` | 余烬门扉 | `ember_door` | 余烬门守套的套组触发：`on: low_hp, icd 300, do: aura:ember_door@self`（[装备 5.1][eqp]） | 受到的伤害 -50%，3 秒；增益，单层，不可驱散 | `kind: buff`、`duration: 3`、`mods.damageTaken: -0.5`、`dispellable: false` |

- 触发条件（生命低）与内置冷却 300 秒属于套组件的 `procs`（[战斗 13][cmb]），不写在光环上；光环只管效果。套组随回访升阶
  （一幕 9、三幕 34、五幕 56、六幕 60）只改套组的属性加成，不改本光环。
- 读取方：物品的 `procs` 结算器与余烬门守的四件套组件随第一幕物品批次落地（PK-M1-13、PK-M1-31），套组件的触发引用本光环。
- 装备目录第 11.2 节第 4 条的其余光环键（`archive_recall`、`forge_skin` 等）都在第二幕以后，与第二幕起的光环全表归 PK-M2-36。


## 4. 编外者门技的技族与技架

### 4.1 初门·醒：仅两招

初门·醒（`door_awaken`）自动开启，授予 `sk_door_strike`（门之一击，`data/combat/classes.json` 编外者基础技）与
`sk_door_step`（门之闪身，`abilities` 效果；[门目录 2.1 第 1 行][doors]）。这是玩家唯一能在没有开任何职能门之前使用的两招，
对应[力量 9.9][pow]"门把手唯一一招"的设定；门之闪身额外给出 `aur_door_dodge`（3.1 节）。

### 4.2 九职能门各给一族基础技，技能本体见第 2 节

[门目录 2.1][doors] 第 4 到 27 行逐门列出 `abilities` 效果：每扇门开启时直接授予其中几项（例如刃之门给 `sk_war_heroicstrike`、
`sk_war_battleshout`、`sk_war_charge`、`sk_war_rend`、`sk_war_thunderclap`、`sk_war_taunt` 六项），同一职能族剩余的技能按 `data/combat/classes.json` 的学会等级
随升级补齐（本文第 2.3 到 2.11 节的九族技能表已覆盖该职能的全部基础技，门只是其中的开局子集，二者用同一套编号，不是两套）；
门同时给出资源池（`pool`，第 4.3 节）、护甲与武器开放（`proficiency`）与属性加成（`stats`），这些不是技能，不进本节。
第一幕实际可开的职能门（按[门目录 2.1 到 2.2][doors]与[第一幕 11][a1]的钥）：刃之门（战士）、猎之门（猎人）、借形之门（德鲁伊，
二幕初也可能在一幕末触发）；渊契之门（术士）第一幕版本的钥是"澱巨像倒下时握住澱核，然后择钥立约"，属于兽潮之夜（A1-M12）之后，
同样算一幕内容。其余六扇职能门（誓光、影、祷、聆灵、术式）要到二到三幕才开，不在本文的技架示例范围，技能定义仍在第 2 节一次性给全。

### 4.3 技架容量

技架容量随历练等级扩大（口径：[门目录 1.6 到 1.8][doors]的门架与当架规则只管同职能三流派的换架，技架容量是另一件事，
由本文随技能目录一并定稿，供界面技能栏使用）：

| 等级区间 | 技架容量 |
| --- | --- |
| 1 到 9（凡阶·初） | 8 |
| 10 到 19（凡阶·熟） | 12 |
| 20 到 34（精英阶） | 16 |
| 35 到 49（英雄阶） | 20 |
| 50 以上 | 24 |

第一幕的编外者（1 到 15 级左右）落在前两档，8 到 12 格；门技（`sk_door_*`）与当架职能的基础技一起占格，第 4.4 节的门疲表决定
门技的使用代价，不决定它占不占格。

### 4.4 门技的门疲（引用，不重算）

[千门 6.3][td]的门技门疲表：门步 `sk_door_step` +2；回门符 +5；短门、户门 +5；行路传送 +10；门钥技 +10；从契、启才 +20；破门 +25；
渡魂 +40。第一幕只会用到门步与回门符；回门符本身是道具而非技能，不进本文的技能编号。

### 4.5 渊契之门第一幕版本的契约魔：巨像残意

[生灵 11][cre]定下巨像残意 `fiend_colossus_remnant` 的来历、条款与代价，它的 `fiend_` 编号归生灵目录：澱巨像倒下时伸手握住澱核
`dian_core`，再择钥立约（[力量 9.9][pow]、[第一幕 10.4、11][a1]）；没有条款，它只有一个念头："门。"本节只写它的战斗面：按
[战斗 6.5.8、12.3][cmb]的通则（契约魔的战斗模板是魔物模板加 `pet` 行为）写模板、技能、召唤技能与血契代价的编号与数值。

| ID | 名 | 模板来源 | 族群与势力 | 等级 | 倍率 | 移动与警戒 | 技能 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fiend_colossus_remnant` | 巨像残意 | 主工程 `gloomshade` 框架（厚血、重甲、嘲讽）加范围攻击（[生灵 11.1][cre]） | `demon`，势力 `pact` | 随施法者，1 到 60 | 生命 ×1.2、伤害 ×0.6、护甲 ×1.5；近战，体相 | 每秒 3.6 格；警戒 4 格，拴绳 30 格（随从跟着主人走，不受拴绳约束，[战斗 12.3][cmb]） | `sk_mon_remnantbar`、`sk_mon_remnantquake` |

| 新 ID | 新名 | 使用者 | 效果摘要 | AI 用法 |
| --- | --- | --- | --- | --- |
| `sk_lok_summonremnant` | 唤起巨像残意 | 编外者：渊契之门第一幕版本立约所得 | 自身，读条 3 秒，消耗灵力上限的 30%，冷却 60 秒，幽相；召唤 `fiend_colossus_remnant` 一只，等级随施法者；它还在场时不再召出第二只 | `summon` |
| `sk_mon_remnantbar` | 拦门 | `fiend_colossus_remnant` | 射程 6，冷却 8 秒，不占公共冷却；嘲讽（[战斗 2.5][cmb]） | `taunt` |
| `sk_mon_remnantquake` | 残震 | `fiend_colossus_remnant` | 以自身为心半径 3，冷却 10 秒，幽相；伤害（基础 8，每级 2.5），仇恨 ×2 | `aoe` |

| 新 ID | 新名 | 施加来源 | 效果 | 落地 |
| --- | --- | --- | --- | --- |
| `aur_lok_remnantpact` | 血契·巨像残意 | 契约魔在场时挂在主人身上，契约魔散去即解除 | 生命上限 -15%；减益，常驻，不可驱散（[生灵 11.2][cre]的血契） | 已导入：`mods.maxHpPct: -0.15`；魔物数据 `fiend_colossus_remnant.mechanics.ownerAura` 指向它，随从散去时内核摘掉（`src/systems/combat/summons.ts`） |

- 数值的来历：生命与护甲按主工程 `gloomshade` 的承伤定位折到本作的魔物曲线（生命 ×1.2、护甲 ×1.5），伤害与契约小鬼
  `contract_imp` 同档（×0.6）；残震的量与冥寒 `sk_mon_gravechill` 同档，仇恨 ×2 让它能把一群小怪从队友身上拉走。拦门与战士的嘲讽
  `sk_war_taunt` 同形。
- 随从规则（[战斗 6.5.8、12.3][cmb]）：每名施法者同一时刻一只契约魔（契约魔的魔物数据写 `mechanics.petGroup: fiend`，召出另一只时前一只
  回到契约里）；被击散即回到契约里，召唤技能冷却结束后可再召；不分经验；跟随、姿态与技能使用按 `pet` 行为。
- 习性（[生灵 11.2][cre]）：在封门遗迹附近不听命令，会往灰烬之厅走。数据 `mechanics.petQuirk.walkTo`：在封门遗迹走向落灰阶顶，
  在遗迹深处走向灰烬室；离开这两张图即照常跟随。
- 门：渊契之门第一幕版本（`vocation_warlock`，[门目录 2.1 第 24 行][doors]）的 `abilities` 效果授予 `sk_lok_summonremnant`；
  握住澱核即锁闭借形之门的第一幕版本（X2），由门数据的 `exclusive` 承担，本节不另写。

## 5. 第一幕同伴与战斗 NPC 的 1 到 15 级技能组

### 5.1 读法

下表只列角色在 15 级以内学会的技能（按本文第 2 节的新 ID），用于战斗 AI 的技能池与界面的技能栏展示；角色本人在第一幕的实际
等级可能高于或低于 15（第 9 节登记差异），技能组仍按"升到该级学会的技能"累加，不随等级回落。学会等级取
`data/combat/classes.json` 现有的职能技能表（本文第 2 节已把每个 ID 的学会等级写在技能对照表的效果摘要旁，这里按角色的职能
汇总成一张表，不重复数值）。NPC 的"铭录职能"按[同伴 2.1][cmp]与[人物一 2.1][chl]的角色定位换算成最接近的九职能之一：
巴托与德里斯都是"武人"路数，按战士族技能换算。

### 5.2 夜羽（术士，咒蚀派）

[同伴 2.1][cmp]：铭录职能术士，持续伤害、诅咒、鸦群；一幕锚点 12 级（[同伴 4.3][cmp]）。

| 学会等级 | 技能 |
| --- | --- |
| 1 | `sk_lok_shadowbolt`（暗影箭）、`sk_lok_demonskin`（恶魔皮肤）、`sk_lok_immolate`（献祭） |
| 2 | `sk_lok_summonimp`（召唤契约小鬼） |
| 4 | `sk_lok_corruption`（腐蚀术） |
| 6 | `sk_lok_lifetap`（生命分流） |
| 8 | `sk_lok_curseofagony`（痛苦诅咒）、`sk_lok_fear`（恐惧术） |
| 14 | `sk_lok_drainlife`（吸取生命） |

12 级锚点时夜羽已会全部八招到 `sk_lok_drainlife`（14 级一行按锚点就位，不缺招）；`sk_lok_rainoffire`（20 级）在一幕用不上。

### 5.3 希雅（猎人，兽群流）

[同伴 2.1][cmp]：铭录职能猎人，远程、陷阱、驯兽；一幕锚点 8 级。

| 学会等级 | 技能 |
| --- | --- |
| 1 | `sk_hun_raptorstrike`（猛禽一击） |
| 4 | `sk_hun_arcaneshot`（奥术射击）、`sk_hun_serpentsting`（毒蛇钉刺） |
| 6 | `sk_hun_huntersmark`（猎人印记） |
| 8 | `sk_hun_concussiveshot`（震荡射击） |

8 级锚点正好学完震荡射击；`sk_hun_aspectofthehawk`（10 级）与之后的招式一幕用不上，随同伴升到二幕锚点 22 级时补上。

### 5.4 罗恩（战士，铁卫流）

[同伴 2.1][cmp]：铭录职能战士，盾，个人层的坦克；一幕锚点 11 级。

| 学会等级 | 技能 |
| --- | --- |
| 1 | `sk_war_heroicstrike`（英勇打击）、`sk_war_battleshout`（战斗怒吼） |
| 4 | `sk_war_charge`（冲锋）、`sk_war_rend`（撕裂） |
| 6 | `sk_war_thunderclap`（雷霆一击） |
| 10 | `sk_war_taunt`（嘲讽）、`sk_war_sunderarmor`（破甲攻击） |

11 级锚点时罗恩已会到破甲攻击；[人物一 2.5 节][chl]记罗恩的角色设定集年龄对应等级为 22（跨幕角色设定集口径，第 9 节登记），
本表按 1 到 15 级的学会节奏列出，不随之外推。

### 5.5 欧拉（德鲁伊，林心派）

[同伴 2.1][cmp]：铭录职能德鲁伊，治疗与自然控制；一幕随队期短（兽潮之夜前后），[人物一 2.5 节][chl]记第一幕与数据层等级为 18
（跨幕角色设定集口径，高于本节 15 级上限，第 9 节登记）。

| 学会等级 | 技能 |
| --- | --- |
| 1 | `sk_dru_wrath`（愤怒）、`sk_dru_healingtouch`（治疗之触）、`sk_dru_markofthewild`（野性印记） |
| 4 | `sk_dru_moonfire`（月火术）、`sk_dru_rejuvenation`（回春术） |
| 6 | `sk_dru_thorns`（荆棘术） |
| 8 | `sk_dru_entanglingroots`（纠缠根须） |
| 12 | `sk_dru_regrowth`（愈合） |

本表仍按 1 到 15 级的学会节奏列出（第 12 级一行已够随队期使用），不外推到她的实际等级。

### 5.6 德里斯（战士族，随行同伴）

[同伴 2.2][cmp]：随行同伴，"战士（不屈）"；`data/npc/personas.json` 现有等级 16（第 9 节登记，超出本节 15 级上限一级）。
按战士族技能表折到 15 级：

| 学会等级 | 技能 |
| --- | --- |
| 1 | `sk_war_heroicstrike`（英勇打击）、`sk_war_battleshout`（战斗怒吼） |
| 4 | `sk_war_charge`（冲锋）、`sk_war_rend`（撕裂） |
| 6 | `sk_war_thunderclap`（雷霆一击） |
| 10 | `sk_war_taunt`（嘲讽）、`sk_war_sunderarmor`（破甲攻击） |

兽潮之夜（A1-M12）里"和巴托并肩守北门"或"抢最危险的位置"（[第一幕 8.4][a1]）用得上的就是这八招；16 级这一级本身不学新技能
（战士族下一个学会等级是 20 级的 `sk_war_cleave`），所以 15 级表与他的实际等级表现一致，不缺招。

### 5.7 巴托（战士族，镇卫队长）

`data/npc/personas.json` 现有等级 15；[人物一 2.1][chl]记"war：镇卫队；刃之门架势"，按战士族技能表换算：

| 学会等级 | 技能 |
| --- | --- |
| 1 | `sk_war_heroicstrike`（英勇打击）、`sk_war_battleshout`（战斗怒吼） |
| 4 | `sk_war_charge`（冲锋）、`sk_war_rend`（撕裂） |
| 6 | `sk_war_thunderclap`（雷霆一击） |
| 10 | `sk_war_taunt`（嘲讽）、`sk_war_sunderarmor`（破甲攻击） |

15 级恰好是战士族下一次学技能（20 级 `sk_war_cleave`）之前的最后一级，巴托在兽潮之夜"死守北门到天亮"（[第一幕 8.4][a1]）
用的就是这八招外加一面盾（装备，不在本表）。


## 6. 第一幕魔物与首领的技能与光环

### 6.1 读法

本节只摘出第一幕出场的条目（等级 1 到 14 左右，[成长 18.2][prg]的重标值为准，`act1_borderstone.md` 第 10.3、10.4 节更早的等级
数字已被该节取代，见第 7 节第 1 条）；技能与光环的编号、效果摘要已在第 2.12 节与第 3.2 节给全，本节按怪物条目分组，补一行
"阶段"或"血线机制"的引用，机制字段本体仍以[战斗 11][cmb]魔物机制字段注册表与各自的 `mechanics` 数据为准，本文不重写机制。

### 6.2 区域魔物（按 `data/combat/monsters.json` 等级区间）

| ID | 名 | 等级 | 技能 | 常驻光环 |
| --- | --- | --- | --- | --- |
| `dian_dreg` | 澱渣团 | 1 到 2 | 无（纯近战） | 无 |
| `dian_rat` | 澱鼠 | 1 到 3 | 无 | 无 |
| `grey_wolf` | 灰毛狼 | 2 到 4 | 无 | 无 |
| `raven_flock` | 鸦群 | 3 到 5 | `sk_mon_peckeyes`（啄目） | 无 |
| `dian_boar` | 澱野猪 | 3 到 6 | 无 | `aur_mon_ashmane`（灰鬃，反伤） |
| `edge_spider` | 林缘织网蛛 | 3 到 6 | `sk_mon_greyweb`（灰丝） | 无 |
| `oneeye_bandit` | 独眼团匪徒 | 4 到 8 | `sk_mon_limepowder`（石灰粉） | 无 |
| `dian_wolf` | 澱狼 | 5 到 8 | `sk_mon_dianbite`（澱蚀） | 无 |
| `burrow_worm` | 掘穴虫 | 5 到 8 | 无 | 无 |
| `split_ear` | 裂耳（异名者） | 6 | `sk_mon_bloodrage`（血怒） | 无 |
| `wandering_bones` | 游荡骸骨 | 6 到 9 | `sk_mon_wail`（枯哭） | 无 |
| `waste_wraith` | 荒原怨灵 | 8 到 11 | `sk_mon_gravechill`（冥寒） | 无 |
| `vero` | 薇罗（骰子屋情报线） | 10（精英） | `sk_mon_limepowder`（石灰粉） | 无 |
| `black_ridge` | 黑脊（异名者） | 11 | `sk_mon_maulswipe`（重击）、`sk_mon_terrify`（恐吓） | 无 |

裂耳与黑脊是[门目录 2.1 第 4 行][doors]刃之门"三取二"历钥的两个单挑对象，各自只有一招主动技加一个软狂暴（裂耳本体的
`sk_mon_bloodrage` 既是主动技也是她的狂暴光环来源，见血线触发表 6.4）。薇罗的战斗面只在"骰子屋黑市"的冲突分支出现，等级与
匪徒持平。

### 6.3 四场首领战

层次、人数、血线与机制条目按[战斗 10.8][cmb]与[成长 18.2][prg]（等级为重标后的终值，见第 7 节第 1 条）；本表只给技能与光环。

| 首领 | 等级 | 层次 | 阶段与对应技能 | 常驻与触发光环 |
| --- | --- | --- | --- | --- |
| 守护巨鸦 `guardian_raven` | 3 | 教学首领（老魔物，1） | 巢守 100% 到 60%：`sk_mon_featherstorm`；振翼 60% 到 25%：加 `sk_mon_wingbuffet`；澱狂 25% 到 0：`sk_mon_heartpeck` 加 `sk_mon_featherstorm` | 25% 以下软狂暴 `aur_st_enrage`（第 7.4 节）；`sk_mon_heartpeck` 命中附 `aur_mon_mortalwound`；召鸦群用 `raven_flock` 本体技能 |
| 晶背之母 `crystal_mother` | 8 | 巢主（2.5，3） | 单阶段：`sk_mon_crystalfall`；50% 二次塌方召 `burrow_worm` 两只 | 常驻 `aur_mon_crystalhide`（护甲 +30%） |
| 瑟格"独眼" `seg_oneeye` | 12 | 巢主（2.5，3；单挑时 1） | 单阶段，无大技能，只有 `sk_mon_cleave` | 30% 以下 `aur_mon_bloodrage`（软狂暴，血怒量级） |
| 澱巨像 `dian_colossus` | 14 | 迷宫之主，剧情首领（4.5，3） | 行进 100% 到 70%：`sk_mon_dianfist`、`sk_mon_stomp`、`sk_mon_ashtide`；裂解 70% 到 35%：加 `sk_mon_ashshell`、`sk_mon_ashrain`；崩解 35% 到 0：同裂解去掉护盾阶段 | 常驻以外，裂解起自我施加 `aur_mon_ashshell`（吸收盾，夜羽的技能可击碎，呼应[战斗 10.4][cmb]"夜羽的鸦群扑面击碎灰壳"）；35% 以下软狂暴 `aur_st_enrage`（第 7.4 节）；灰潮附 `aur_mon_ashtideslow` |

首领机制库（PK-M1-12）另有三条魔物技能：`sk_mon_cavein`（二次塌方：晶背之母 50% 阶段的进入动作，每名成员脚下一个致命档圆，提前 2 秒）、
`sk_mon_doordrain`（汲门：澱巨像追到门纹持有者 3 格内时的引导，可打断，越久越重）、`sk_mon_desperateheal`（绝境自愈：注册表字段 `desperateHeal` 的读条，可打断）；
注册表字段的模板光环 `aur_mon_smolder`（灼烧）、`aur_mon_corrode`（腐蚀）、`aur_mon_packfrenzy`（群怒）、`aur_mon_rumor`（传闻之威）、`aur_mon_thorns`（反伤）
同包导入，字段写明的时长、伤害与幅度在施加时覆盖模板。

守护巨鸦的 `yieldAtPct` 0.02（力竭而不死）与澱巨像倒下后的澱核抉择场景都不改变技能与光环编号，只是战斗结算的出口，按
[战斗 10.7][cmb]非战斗解法接口处理，不在本文范围。


## 7. `aur_st_*` 状态光环

### 7.1 读法

[战斗 19.5][cmb]把状态光环的编号权交给本文，效果定义仍留在战斗文档的对应小节（3.5 位阶与威压、9.4 本作特有状态、10.4
读条与护盾、10.5 增援与狂暴、15.1 玩家退回门内、15.2 同伴倒地、15.3 复活与泉畔之代价）；本节只定编号、现行数据对照与去向，
不重写数值。全部 `aur_st_*` 不可驱散（[战斗 9.4 末][cmb]），只能等、治疗或专门手段解除。

### 7.2 位阶与威压（战斗 3.5）

| 新 ID | 新名 | 现行数据 ID | 去向 | 触发条件 |
| --- | --- | --- | --- | --- |
| `aur_st_presence_unease` | 威压·出手迟疑 | 无（新增） | 新增 | 位阶差 g = 1，场效应：施法与攻击间隔 +5% |
| `aur_st_presence_pressure` | 威压·压境 | `presence_pressure` | 保留 | 位阶差 g = 2，场效应：移速 -15%、施法与攻击间隔 +10% |
| `aur_st_presence_paralysis` | 威压·失神 | `presence_paralysis` | 保留 | 位阶差 g = 3，首次进入时定身昏迷 3 秒，之后转为 g = 2 的效果 |

位阶差 4 及以上的"首次进入昏迷 5 秒，之后移速 -25%、间隔 +15%"沿用 `aur_st_presence_pressure` 的编号体系按量级加档处理
（战斗文档未单独命名），不另立编号，避免 `aur_st_presence_*` 族群在没有新效果形状时无限细分。

### 7.3 死亡与复活（战斗 15.1 到 15.3）

| 新 ID | 新名 | 现行数据 ID | 去向 | 效果（数值来源） |
| --- | --- | --- | --- | --- |
| `aur_st_revival_fatigue` | 复苏门疲 | `door_fatigue` | 重命名 | 时长 2 + floor(门阶 / 10) 个游戏时辰，上限 10；期间伤害与治疗 -30%、最大生命 -20%、门技消耗 ×1.5（[战斗 15.1][cmb]） |
| `aur_st_spring_toll` | 泉畔之代价 | `spring_weakness` | 重命名 | 伤害与治疗 -30%、最大生命 -20%；战斗中复活持续到战斗结束后 120 秒，战后复活持续 1 个游戏日（[战斗 15.3][cmb]） |
| `aur_st_downed_weak` | 倒地虚弱 | 无 | 新增 | 造成的伤害 -20%，120 秒（[战斗 15.2][cmb]；与泉畔之代价不是同一回事：倒地不经泉畔，所以单独编号） |

[千门系统 10.1.5][td]另有"逆泉印记"（渡魂之门把人从泉畔拉回所挂）：持续 30 个游戏日，最大生命 -15%、受到的治疗 -25%，效果量级
与泉畔之代价不同，不共用编号；本文为它单独定号：`aur_st_soul_recall`（逆泉印记）。

### 7.4 首领机制（战斗 10.4 到 10.5）

| 新 ID | 新名 | 现行数据 ID | 去向 | 效果 |
| --- | --- | --- | --- | --- |
| `aur_st_stagger` | 失衡 | 无（新增） | 新增 | 不能移动、施放、攻击，读条中断；只由机关与破盾给出，不计入控制递减，时长上限 6 秒（[战斗 10.4][cmb]） |
| `aur_st_enrage` | 软狂暴 | `enrage` | 保留（换号） | 造成的伤害 +50%、急速 +25%；故事难度推迟 30%，困难提前 15%，传说提前 30%（[战斗 10.5][cmb]） |
| `aur_st_berserk` | 硬狂暴 | 无（新增） | 新增 | 造成的伤害 +500%、攻击速度 +150%；只给迷宫之主、大迷宫首领与澱涌之主，第一幕四场首领战都不设硬狂暴（[战斗 10.5][cmb]） |

注意：现行数据 `enrage` 的定义行在本表（第 3.2 节的对照表把它标为退休，不再是定义行），魔物与首领条目统一引用
`aur_st_enrage`；第 2.12 节"使用者"栏与第 6.3 节已按这一个编号书写。

### 7.5 本作特有状态（战斗 9.4）

| 新 ID | 新名 | 现行数据 ID | 来源 | 效果摘要 |
| --- | --- | --- | --- | --- |
| `aur_st_drunk` | 醉意 | 无（新增） | 饮酒（[消耗品 3.10][csm]"醉意"列） | 每层精神 -2、抗压 +0.03（至多 0.15）；五层以上"踉跄"：移速 -15%、施法与攻击间隔 +10%；每游戏时辰 -1 层 |
| `aur_st_physic_poison` | 药毒 | 无（新增） | 疗程内提前再用澱药（[消耗品 2.1][csm] `cd_sed`） | I：只记 2 点澱染；II：药水回复 -20%；到该疗程结束（6 个游戏时辰） |
| `aur_st_sed_spot` | 澱斑 | 无（新增） | 澱染日检一期（[成长 9.2、9.3][prg]） | 最大生命 -5% |
| `aur_st_sed_fever` | 澱热 | 无（新增） | 澱染日检二期 | 最大生命 -15%、命中 -5%；施法者每次施法 10% 灵素失控（打断并损失本次灵力） |
| `aur_st_sed_crystal` | 澱化 | 无（新增） | 澱染日检三期 | 最大生命 -30%、移动 -20%；玩家的澱化不作用于身体，表现为门塞 |
| `aur_st_default_mark` | 失信 | 无（新增） | 违约者页上的"失信"标签、活性词缀 `afx_bad_faith`（只对有页者） | 受到的治疗 -30% |

### 7.6 伤病（战斗 9.4，引用成长 10.1 到 10.2）

伤病的子类用 `aur_st_injury_<类型>` 展开，不留通配符：

| 新 ID | 新名 | 效果 |
| --- | --- | --- |
| `aur_st_injury_light` | 轻伤 | 最大生命 -10% |
| `aur_st_injury_maimed_arm` | 断肢·失手 | 不能用双手武器、伤害 -20% |
| `aur_st_injury_maimed_leg` | 断肢·失腿 | 移动 -30% |
| `aur_st_injury_backlash` | 淬体反冲 | 灵力恢复 -50%、受伤 +10% |
| `aur_st_injury_relapse` | 旧伤复发 | 命中 -5% 或移动 -10% |

玩家只会得轻伤与断肢（`aur_st_injury_light`、`aur_st_injury_maimed_arm`、`aur_st_injury_maimed_leg` 三者之一），断肢在玩家身上
额外叠加门技冷却 +20%（[成长 10.2][prg]），这一条效果挂在断肢光环本身，不另立编号。

### 7.7 本节编号合计

本节新增、重命名或换号的 `aur_st_*` 编号共 21 个：位阶威压 3（7.2）、死亡与复活 4（7.3，含新增的逆泉印记）、首领机制 3（7.4）、
本作特有状态 6（7.5）、伤病子类 5（7.6）。连同第 2、3 节已覆盖的 123 条技能与 84 条光环，技能目录（PK-M0-02）的编号覆盖义务在本节
收尾。

数据里的状态光环：`aur_st_presence_pressure`、`aur_st_presence_paralysis`、`aur_st_revival_fatigue`、`aur_st_spring_toll`、`aur_st_enrage`
五个由现行数据换号而来，数值暂按现行数据；`aur_st_downed_weak` 随 `content_act1_abilities_01` 导入（同伴倒地后起身时挂上）。其余
15 个编号随施加它们的系统落地，届时导入数据行：`aur_st_presence_unease`（位阶威压）已随战斗规则扩展（PK-M1-11）导入，
同包按战斗文档 3.5、15.1、15.3 重写了压境、失神、复苏门疲与泉畔之代价的数值；`aur_st_stagger`、`aur_st_berserk` 已随首领机制库（PK-M1-12）导入；`aur_st_sed_spot`、`aur_st_sed_fever`、`aur_st_sed_crystal`
与五个 `aur_st_injury_*` 随澱染与澱病（PK-M1-51）；`aur_st_drunk`、`aur_st_physic_poison` 随物品实例与消耗品（PK-M1-13）；
`aur_st_default_mark` 随契约违约与活性词缀的结算；`aur_st_soul_recall` 随千门第二批（PK-M2-13）。


## 8. 第二幕起的范围说明

本文只登记序章与第一幕实际引用的技能、光环与门技编号（第 2 到 7 节），覆盖 `abilities.json` 123 条与 `auras.json` 84 条两份数据
文件的全部现有 ID。第二幕起新增的内容不在本文内，留给 PK-M2-36（技能、天赋与光环目录，第二幕起）：九职能满编技能库（每职能约
26 项，含二幕起才学到的后段技能，例如猎人的 `sk_hun_multishot`、`sk_hun_aimedshot`）；[门目录 3.2][doors]二十七扇流派之门给出的 3 个流派
真意与标志技能（奥义，例如 `mortal_strike`、`bloodthirst`、`shield_slam`、`holy_shock` 一类，门目录已先写出世界观描述，技能本体与
自有编号留给 PK-M2-36）；七道铭纹（[战斗 6.4][cmb]）；编外者的战场技能 `sk_bf_`（[战斗 7][cmb]"编外者伪职能"更完整的后段）。
`door_rank >= 35` 的进阶流派门、立国之门、千径之门等经营与通行类门效果不含技能编号，不受本范围说明影响。

## 9. 现有冲突与处理

| 冲突 | 两侧说法 | 处理（按正典优先级，[CLAUDE.md][claude]） |
| --- | --- | --- |
| 守护巨鸦、晶背之母的等级 | `act1_borderstone.md` 10.3 节与更早的迷宫目录草稿曾用 5 级、9 级；[成长 18.2][prg]的 D-060 重标与 `data/combat/monsters.json` 现行数据用 3 级、8 级 | 取 3 级、8 级：[成长 18.2][prg]是后出的重标定稿，`30_story/` 与 `40_design/` 同层时以数据已落地的一侧为准，且本文第 6.3 节已用 3、8、12、14 四个终值 |
| 德里斯的等级 | [同伴 2.2][cmp]"随行同伴"未写数字；`data/npc/personas.json` 现行数据为 16 级，略高于本文 1 到 15 级的收录上限 | 按战士族技能表核对：16 级不新学技能（战士族下一个学会等级是 20 级），15 级表与他的技能面完全一致，不缺招，本文第 5.6 节照录 |
| 欧拉、罗恩的等级 | `data/party/companions.json` 种子等级（欧拉 10、罗恩 5）、[同伴 4.3][cmp]锚点表（欧拉 27、罗恩 11）、[人物一 2.5][chl]角色设定集口径（欧拉 18、罗恩 22）三处不一 | [人物一 2.5][chl]已登记"按正典优先级同层（均在 `30_story/`），以跨幕的角色设定集为准，数据层待修"；本文第 5.4、5.5 节按 1 到 15 级的学会节奏列出技能组，不取三者中的任何一个具体数字作为角色的"当前等级"，避免在未决的数值上二次表态 |
| 技能、光环内嵌效果与独立数据条目同名 | `door_step` 同时是 `abilities.json` 的技能 ID 与 `auras.json` 的光环 ID，技能内嵌效果与独立光环条目描述一致 | 第 3.1 节把两者合并为一条光环定义 `aur_door_dodge`，技能侧 `sk_door_step` 只引用这一个光环 ID，不产生两条并存的定义 |
| 现行数据 `enrage` 的编号归属 | [战斗 19.5][cmb]把 `aur_st_enrage`（状态光环体系）列为 `enrage` 的新编号，但第一轮多个首领的 `mechanics.enrage.aura` 字段仍写 `enrage`，技能对照表若原样保留会产生 `aur_mon_enrage` 与 `aur_st_enrage` 两条定义 | 第 3.2 节把 `enrage` 的定义行标为退休，唯一定义落在第 7.4 节的 `aur_st_enrage`；魔物与首领条目统一引用这一个编号（第 2.12、6.3 节） |

## 10. 新增命名的原创性

全部新显示名（第 2、3 节"新名"栏与第 4 到 7 节新增的 `sk_door_*`、`aur_st_*`）已核对 `tools/content/names/woc_names.json`
`categories.skills.zh`（452 个主工程技能显示名）与 `tools/content/names/known_works.json`（已知作品名）：精确子串命中两处，
且都落在"旧名"栏而非"新名"栏：`crusader_strike` 的旧名"十字军打击"、`psychic_scream` 的旧名"心灵尖啸"，两者已在本文改名为
"誓击"（`sk_pal_oathstrike`）与"裂空啸"（`sk_pri_rendingwail`）。本文全部新名使用平实的中文描述或四字短语，不复用任何一个
主工程或已知作品里的专有技能、天赋、光环名。第 3.3、4.5 节的新名（余烬门扉、巨像残意、唤起巨像残意、拦门、残震、
血契·巨像残意）与第 7.3 节的倒地虚弱按同一组名单核对，零命中；数据层由内容校验 V10 在每次校验时重扫。


## 11. 来源链接

[cmb]: ../systems/combat_and_classes.md
[bible]: content_bible.md
[td]: ../systems/thousand_doors.md
[doors]: catalog_doors.md
[cmp]: ../systems/companions_and_party.md
[best]: catalog_bestiary.md
[dgc]: catalog_dungeons_bosses.md
[a1]: ../../30_story/arcs/act1_borderstone.md
[a0]: ../../30_story/arcs/prologue_antechamber.md
[pow]: ../../20_world/power_system.md
[chl]: catalog_characters_lotha.md
[prg]: ../progression_and_pacing.md
[csm]: catalog_consumables_magitools.md
[cre]: catalog_creatures_mounts.md
[eqp]: catalog_equipment.md
[claude]: ../../../CLAUDE.md
