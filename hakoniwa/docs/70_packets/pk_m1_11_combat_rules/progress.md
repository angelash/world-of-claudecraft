# PK-M1-11 战斗规则扩展：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施 1、QA 1 | 战斗规则扩展的十三项范围；新起会话审查后修 13 条；接上物品实例层（PK-M1-13）的战斗侧 | 未提交 | `tests/combat_rules.test.ts` 46 passed；相关 24 个测试文件 434 个用例里只有他包的守卫失败；通关见第 2 节"通关结果" | 1. 主会话按下面的文件清单提交（先提交 PK-M1-13）；2. 遗留转后续包 |

## 2. 汇报

### 2026-11-17 实施 1、QA 1

**做法**

- 每条规则一个小模块，`index.ts` 只协调：`control.ts`（递减、免疫、时长）、`presentation.ts`（命中音效字段）、`difficulty.ts`（难度修正项）、
  `death_costs.ts`（遗落包、目击、耐久端口）、`duel.ts`（单挑）、`pools.ts`（当架池）、`rack.ts`（技架）、`summons.ts`（随从与血契）。
- 难度的每一项登记为修正项（目标 `combat`、来源 `difficulty`，D-013），读取方一律取合计值；标准档不登记，新开局的修正项表不变。
- 死亡：致命一击当 tick 结算过载、遗落包、耐久、目击，玩家进入回廊（身体不在场）；复苏 tick 到时在复苏地点重塑、挂复苏门疲状态、发扩展的
  `combat.player_returned`；千门读回执里的层数与门疲下限（难度系数）。
- 物品实例层（PK-M1-13）先提交：战斗直接导入库存的 `applyDeathWear`、`applyCombatWear`、`fireProcs`、`envFor`、`gearAuras`、
  `takeItems`、`putItems`、`isInstanced`、`GROUP_RULES`；本包要在它之后提交。

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/combat/control.ts` | 新增 | 递减阶梯、谁递减、免疫表、控制时长 |
| `src/systems/combat/presentation.ts` | 新增 | 命中音效的五个字段 |
| `src/systems/combat/difficulty.ts` | 新增 | 难度表、修正项登记、切换规则 |
| `src/systems/combat/death_costs.ts` | 新增 | 遗落包（库存包裹，不收带实例的物品）、目击、耐久端口（死亡与一场战斗） |
| `src/systems/combat/duel.ts` | 新增 | 单挑、观战、`duel.ended` |
| `src/systems/combat/pools.ts` | 新增 | 当架池、换脉、双脉换算 |
| `src/systems/combat/rack.ts` | 新增 | 技架 |
| `src/systems/combat/summons.ts` | 新增 | 召唤（自 `abilities.ts` 移出）、同组随从一只、血契 |
| `src/systems/combat/item_procs.ts` | 新增 | `item.proc` 的效果、套组光环 |
| `src/systems/combat/proc_points.ts` | 新增 | `combat_start`、`low_hp` 触发点与情境 |
| `src/systems/combat/items_use.ts` | 修改 | 消耗品冷却组的战斗禁用与公共冷却（`useItemGate`） |
| `src/systems/combat/threat.ts` | 修改 | 进入战斗时报 `combat_start` |
| `src/systems/combat/types.ts` | 修改 | 第 19 节与 19.6 的字段、事件与命令 |
| `src/systems/combat/formulas.ts` | 修改 | 威压新表、控制的位阶系数、`S(L)`、技架容量、单挑系数、复苏时长、死亡常量 |
| `src/systems/combat/auras.ts` | 修改 | 控制管线、按施加者、显式层数、驱散顺序与类别、破除 |
| `src/systems/combat/stats.ts` | 修改 | 新修正项、缴械、按层数的效果、同组取最强、敌方生命的难度系数 |
| `src/systems/combat/damage.ts` | 修改 | 音效字段、抗压、难度系数、推迟两次、记功计数、单挑 |
| `src/systems/combat/presence.ts` | 修改 | 场效应新表与缺省 6 格、抗压 |
| `src/systems/combat/abilities.ts` | 修改 | 技架、当架池、缴械、间隔、不可打断、学派锁定、驱散类别 |
| `src/systems/combat/death.ts` | 修改 | 死亡结算顺序、复苏地点与回廊 |
| `src/systems/combat/rewards.ts` | 修改 | 记功口径；升级补位技架 |
| `src/systems/combat/ports.ts` | 修改 | 门授技能进技架、门授池定当架池；导出 `startDuel` |
| `src/systems/combat/monster_ai.ts` | 修改 | 残意习性；不插手单挑 |
| `src/systems/combat/boss.ts` | 修改 | 软狂暴读难度（一行；首领机制库在 PK-M1-12） |
| `src/systems/combat/index.ts` | 修改 | 三个命令、难度旗标、复苏、遗落包、随从光环、单挑与日常结算 |
| `src/systems/combat/skip.ts`、`units.ts`、`auto_attack.ts`、`queries.ts`、`id_fields.ts` | 修改 | 跳时结算复苏与遗落包；`isPartySide`；攻击间隔；可读性数据面与 `rackView`、`dropBags`；改名字段 |
| `src/content/packs/combat.ts` | 修改 | 魔物控制时长上限与学派锁定上限；新引用与取值的校验 |
| `src/systems/modifiers/index.ts` | 修改（一行，内核文件） | `ModifierTarget` 加 `combat` |
| `src/systems/doors/costs.ts`、`src/systems/doors/index.ts` | 修改 | 门疲下限与过载层数读 `combat.player_returned` |
| `src/systems/party/ai.ts` | 修改（两处） | 同伴不插手别人的单挑 |
| `data/combat/auras.json` | 修改 | 本包的行：`aur_st_presence_unease` 新增，压境、失神、复苏门疲、泉畔之代价按文档重写，`aur_st_enrage`、`aur_st_downed_weak` 加类别，`aur_mag_polymorph` 走变形阶梯，`aur_lok_remnantpact` 新增。文件末尾的 8 行 `aur_st_sed_*`、`aur_st_injury_*` 是 PK-M1-51 的，提交时分块 |
| `data/combat/monsters.json` | 修改 | 首领层次（守护巨鸦 `tutorial`、晶背之母与瑟格 `lair`、澱巨像 `story` 按 `dungeon`、百尾鼠王 `dungeon`）；瑟格的 `duelWatch`；巨像残意与契约烬仔的随从字段 |
| `data/combat/classes.json` | 修改 | 各职能 `weaponClass` |
| `data/combat/maps/seal_ruins.json` | 修改 | 神纹大厅加 `revive` 标签 |
| `locales/zh-Hans/sys_combat.json` | 修改 | 拒绝原因、难度修正项说明 |
| `src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 修改（生成物） | 重生成；工作区里同时有并行包的键，提交时在提交树上重跑 `node tools/i18n/gen_keys.ts` 与 `node tools/i18n/extract_content.ts` |
| `docs/40_design/world_state_registry.md`、`data/registry/vars.json` | 修改 | `feature` 一行加 `dual_pulse`、`triple_pulse`；`vars.json` 重建（同时带上了并行包已改的注册表行，提交时在提交树上重跑 `node tools/registry/build.ts`） |
| `docs/40_design/systems/combat_and_classes.md` | 修改 | 5.5 单挑系数、9.3 免疫与打断补充、15.1 遗落范围与复苏、16 修正项、19.6 实现补充、21.2 现状 |
| `docs/40_design/systems/thousand_doors.md` | 修改 | 6.3 遗落不含剧情物 |
| `docs/40_design/content/catalog_abilities_talents.md` | 修改 | 4.5 血契、习性与一只契约魔已落地；7.7 威压与死亡代价的数值 |
| `tests/combat_rules.test.ts` | 新增 | 42 个用例 |
| `tests/combat.test.ts`、`tests/doors_costs.test.ts`、`tests/own_ability_ids.test.ts` | 修改 | 新威压表、复苏延迟与地点、技架与遗落包的改名字段、后续导入的光环编号 |
| `docs/70_packets/pk_m1_11_combat_rules/` | 新增 | 包目录三件 |

工作区里 `src/systems/doors/keys.ts` 的改动（`npc.*.captured` 等缺席变量）不是本包的，属 PK-M1-18。

**验收逐条结果**：见 `verification_matrix.md` 第 1 节。

**通关结果**

`npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts tests/playthrough/rule_merca.playthrough.test.ts`：
末次代码改动之后的实跑 `Test Files 3 passed (3)`、`Tests 3 passed (3)`、`Duration 768.78s`（审查修复之前的一次同为 3 passed，999.74 秒）。
更早的一次第一幕极简路线失败在 NPC 包写未登记的旗标 `npc.barto.at_spring`（`src/systems/npc/brain/absence.ts`），不是本包。

**确定性金样**

- 冻结存档的迁移金样（`tests/fixtures/saves/manifest.json`）不变：`tests/save_migration.test.ts` 在本包改动后通过，没有重录。
- 新开局的状态哈希变了：玩家单位开局即带技架（`rack`），状态光环的数值与编号、魔物与职能数据都有改动。没有测试钉住新开局的哈希；
  通关与回放测试比的是同一构建的两次运行。
- 运行中多了确定的状态：单位的 `dr`、`downs`、`fighting`、`fedAt`，切片的 `presenceStruck`、`bags`、`duels`、`pendingReturn`、`auraSeq`。
  这些字段都在不用时删除而不是写成 `undefined`，读档后键序不变（已用一次 JSON 读档对照战斗、千门与修正项三个切片）。
- 命名随机流：只多了恐惧受伤时的破除判定（`combat.proc`），且只在身上有恐惧、概率低于 1 时抽；威压、控制、单挑与遗落包不抽随机。

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 战斗 15.1、千门 6.3 | 每一叠可堆叠物品的 25% 遗落 | 钥匙、遗物书籍与证据不遗落 | 剧情物随一次死亡丢失会卡任务；两份文档已写明 | 是（不阻塞，`README.md` 第 11 节） |
| 战斗 15.1 第 3 步 | 遗落包经世界端口生成实体 | 遗落包记在战斗切片，查询 `dropBags` 给地图标记，走回 1.5 格内取回 | 第一幕没有可拾取实体的接缝；兽伴守护与 NPC 拾取都还没有 | 否 |
| 战斗 5.5、17.4 | "满编比例"缩放；瑟格单挑 3.32 倍 | 单挑的生命系数按满编一栏的上端（巢主 3）：(1/3)^0.8 = 0.415 | 17.4 的 3.32 只能这样得出；5.5 已写明 | 否 |
| 战斗 3.5 | 位阶差 4 起"之后移速 -25%、间隔 +15%" | 压境的第二层（`byStacks`），不另立编号 | 技能目录 7.2 已定"按量级加档" | 否 |
| 战斗 9.3 | 免疫按控制类别 | 带减速的光环对免减速者只去掉减速，其余照常；硬控制被免疫时整条不生效 | 暴风雪一类的伤害不该因为首领免减速而消失 | 否（9.3 已写明） |
| 战斗 9.1、9.3 | 打断的学派锁定 | 首领同样被锁，锁定不进递减；不可打断的读条也不被沉默打断 | "首领免控但不免打断" | 否（9.3 已写明） |
| 千门 9.5 | 双脉由玩家指定哪两池 | 当架池加池种顺序里的下一池 | 指定命令 `doors.set_pulse` 随千门第二批 | 否（转 PK-M2-13） |
| 战斗 16 | 修正项"在设置页与战斗日志写明" | 登记为修正项并发 `combat.difficulty`；日志与设置页的写法归界面 | 本包只做内核 | 否 |
| 战斗 12.3 | 每名术士同一时刻一只契约魔 | 魔物数据 `petGroup: fiend` 的随从，召出另一只时前一只回到契约里 | 经典做法 | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `src/systems/modifiers/index.ts` | `ModifierTarget` 加 `combat`（难度的修正项） | 内核 | 已改（一行） |
| `src/systems/doors/costs.ts`、`index.ts` | 门疲下限与过载层数改读回执 | 战斗方（实现约定第 1 节千门归战斗） | 已改 |
| `src/systems/party/ai.ts` | 同伴不插手单挑 | 战斗方（同伴归战斗；PK-M1-15 未开工） | 已改 |
| `tests/own_ability_ids.test.ts` | PK-M1-26 的钉子加后续导入的光环编号（本包两个、PK-M1-51 八个）与新的改名字段 | PK-M1-26（已封包） | 已改 |
| `src/editor/inspector/inspector_ui.ts` | 修正项目标的下拉列表加 `combat` | 编辑器包 | 请求回写（本包未动） |
| `data/combat/items.json` | 武器与胸甲行补 `weaponClass`、`armorClass`（19.3；现行数据没有，内核按标签与职能退回） | PK-M1-13 或 PK-M1-31 | 请求回写（本包未动，物品行正被 PK-M1-13 改） |
| `src/systems/ailments/` | 玩家复苏时清除全部伤病（8.2、15.1 第 7 步；伤病是澱病系统按来源挂的常驻光环） | PK-M1-51 | 请求回写 |
| `src/systems/npc/brain/absence.ts` | 写了未登记的 `npc.<人>.at_spring`，开发构建里第一幕通关在玩家死亡处抛错 | PK-M1-18 | 请求回写 |

**物品实例层（PK-M1-13）请求的战斗侧**

| 请求 | 处理 |
| --- | --- |
| 1. 结算 `item.proc` | 已做 `aura`、`dmg`、`chain`、`cleanse`；`slow`、`dot`、`hot`、`stack` 需要触发用的光环编号（技能目录登记后接上）；`sed` 归澱染系统、`morale` 归兵团层 |
| 2. `combat.heal` 加 `fromProc` | 已做 |
| 3. `combat_start`、`low_hp` 触发点，情境带 `solo` 与 `hpFrac` | 已做 |
| 4. 消耗涂层的 `charges` | 未做：次数记在库存的实例上，需要库存给一个扣次数的端口（例如 `useProcCharge(ctx, ownerId, source, index)`） |
| 5. 套组光环 `gearAuras` | 已做（来源 `gear`，每秒与穿戴时对齐） |
| 6. 冷却组的战斗禁用（`inCombat`、`gcd`） | 已做为命令 `combat.use_item`（先判再转 `inventory.use`）与 `item.used` 上的公共冷却；直接发 `inventory.use` 不经这道门，界面与自动玩家在战斗中应走 `combat.use_item` |
| 7. 遗落包排除带实例的物品、用 `takeItems`/`putItems` | 已做 |
| 8. 第 13 节关于 `Holding` 的句子 | 已改为实现约定第 6 节第 3 条的形状 |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 首领机制库、第 11 节字段、看到的灵压、引导的受击损失、可读性两路提示的内容校验 | PK-M1-12 |
| 数据里的驱散类别（9.5）、技能的 `heavy`、`uninterruptible`、`dr` 标记；技能与光环数值按 `S(L)` 与系数重算（本包只给 `standardAmount`，第 20 节没有钉技能数值的 M1 规则行，数值由平衡行驱动，需要自动玩家的测量） | PK-M1-42（重算）；PK-M2-36（全量技能与驱散类别） |
| 醉意、药毒的施加与消退（本包给了抗压字段）；涂层次数的扣减端口；`inventory.use` 在战斗中也走冷却组的禁用 | PK-M1-13 |
| 触发效果 `slow`、`dot`、`hot`、`stack` 的光环编号 | 技能目录与 PK-M1-31 |
| 澱热的施法失控、伤病随复苏清除 | PK-M1-51 |
| 起身、倒地虚弱、重伤退场；同伴读难度的反应与规避；兽伴守遗落包 | PK-M1-15 |
| 双脉由玩家指定两池（`doors.set_pulse`）；门技读复苏门疲的 `doorSkillCost` | PK-M2-13 |
| 难度修正项写进战斗日志与设置页；技架窗口；施法条盾形边框；遗落包地图标记 | PK-M1-22、PK-M1-57 |
| 例外地点（神庭、写定单人战不遗落）；复苏门疲的三种减免（梦扉、眠歌、收藏） | 各幕内容包；PK-M2-13 |
| 第二幕以后首领的层次（`crystal_centipede`、`sasha`、`faceless_king` 现在按巢主） | 各幕首领批次 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 威压缺省 6 格对每个单位生效 | 第一幕 9 级以下的玩家靠近 10 级以上的魔物时出手变慢；高等级玩家穿过低级区时魔物被压 | 第一幕通关回归；PK-M1-42 的节奏报告看死亡数与击杀时间 |
| 复苏要等 1 个游戏时辰 | 自动玩家死亡后约 1200 tick 不能行动 | 通关回归；任务的限时目标遇死亡时的余量由 PK-M1-42 复查 |
| 当架池一次一池 | 同时开刃之门与猎之门的编外者，另一池的技能在换脉之前不可用；自动玩家不换脉 | 通关回归；自动玩家按需换脉可放进 PK-M1-42 |
