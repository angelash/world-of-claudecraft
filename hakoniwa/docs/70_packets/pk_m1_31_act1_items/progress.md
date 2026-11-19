# PK-M1-31 第一幕物品与生业：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-18 到 19 | 实施 1、覆盖性复查、修复 | 新内容包 `items` 与五个物品文件、物品光环、一档阶梯生成器、套组与附纹、采集点与工站与配方、已有物品行的字段加法、按份澱纹的内核接线、测试 | 未提交 | 见 `verification_matrix.md` | 主会话提交；缺的读取方与授予按第 3 节派给各包；第 4 节四项待用户定 |

## 2. 汇报

### 2026-11-19 实施 1 与复查修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/content/packs/items.ts` | 新增 | 内容包 `items`：五个物品文件与物品光环的装载、编辑器模式（加 `weaponClass`、`armorClass`）、第一幕导入规则的校验（`itemRowProblems`） |
| `tools/content/equipment_ladder.ts` | 新增 | 一档基础阶梯生成器：规格表加目录公式，`--check` 判断产物是否过期 |
| `data/items/equipment_t1.json` | 新增（生成） | 71 条：凡品型号 65 条加六条配方的良品杰作产出 6 条 |
| `data/items/equipment_act1.json` | 新增 | 27 条：目录 4.1 的 16 件、巢主掉落 2 件、余烬门守 4 件、晶背炉 4 件、晶背剑 |
| `data/items/consumables_act1.json` | 新增 | 73 条：`cs_` 64（含工具 8）、`mt_` 9 |
| `data/items/materials_act1.json` | 新增 | 86 条：零到一档材料与部件，加第一幕条目引用到的高阶主料 9 条（见下） |
| `data/items/goods_act1.json` | 新增 | 20 条：遗物 5、书籍 9、商品 6 |
| `data/items/auras.json` | 新增 | 20 条：消耗品与料理的增益 19，药毒 1 |
| `data/inventory/item_sets.json` | 修改 | 余烬门守 `set_dg_seal_ruins`、晶背炉 `set_barga_forge`（原为空表） |
| `data/inventory/enchants.json` | 修改 | 一档附纹 14 道（原为空表） |
| `data/crafting/nodes.json` | 修改 | 种子 3 处保留并补副产，新增 6 处；旧矿铜脉写 `taint: 0` |
| `data/crafting/stations.json` | 修改 | 种子 5 座保留，新增 6 座 |
| `data/crafting/recipes.json` | 修改 | 种子 2 条保留，新增 63 条（14 道附纹、6 件兵器、4 条精炼、冶炼初加工与料理炼剂符箭等） |
| `data/combat/items.json` | 修改（越界，只加键） | 27 行的字段加法，逐项见下 |
| `src/systems/inventory/index.ts` | 修改（越界） | `item.used` 事件加 `sedTier`：消耗品改走 `takeItems`，取所吃那一格的澱纹档（已净化的不计） |
| `src/systems/ailments/body.ts`、`types.ts` | 修改（越界） | `itemUsed` 读 `sedTier`，按 `portionTaint` 加澱染；配置字段 `portionTaint` |
| `src/content/packs/ailments.ts` | 修改（越界） | `portionTaint` 的校验（三个非负数） |
| `data/ailments/config.json` | 修改（越界） | `portionTaint: [1, 3, 8]`（消耗品 2.4 的轻、中、重） |
| `src/content/registry_refs.ts` | 修改（越界，一处） | `procs` 内的 `when` 不当成世界状态条件（装备 1.5 的触发语法自有解析与校验） |
| `src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 重生成（越界） | `node tools/i18n/gen_keys.ts`、`node tools/i18n/extract_content.ts` |
| `tests/items_act1.test.ts` | 新增 | 7 条 |
| 本目录 | 新增 | `README.md`、`progress.md`、`verification_matrix.md` |

**`data/combat/items.json` 的逐行加法**（只加键，旧值一律保留；核对脚本确认 56 行的旧字段无一改动）

| 行 | 加的键 |
| --- | --- |
| `rusty_shortsword` | `weaponClass: sword`、`tags: [sword, metal]`、`salvage: { itemId: iron_ore, count: 1 }` |
| `recruit_longsword` | `weaponClass: sword`、`tags: [sword, metal]` |
| `hunters_bow` | `weaponClass: bow`、`tags: [bow, two_hand, wood]` |
| `oak_staff` | `weaponClass: staff`、`tags: [staff, two_hand, wood]` |
| `grey_fang_dagger` | `weaponClass: dagger`、`tags: [dagger, bone]`、`sed: { grade: light }` |
| `ash_cleaver` | `weaponClass: axe`、`tags: [axe, metal]`、`sed: { grade: light }` |
| `crystal_spine_blade` | `weaponClass: sword`、`tags: [sword, bone]`、`sed: { grade: mid }`、`repairMaterial: mat_blackiron_ingot` |
| `red_fang_gauntlet` | `weaponClass: fist`、`tags: [fist, metal]`、`repairMaterial: mat_nightiron_ingot` |
| `dented_round_shield` | `tags: [metal]` |
| `worn_leather_vest` | `armorClass: leather`、`tags: [leather]`、`level: 1`（装备 3.9 的劣 1 到凡 1 行） |
| `wolfhide_boots`、`sewer_waders` | `armorClass: leather`、`tags: [leather]` |
| `spider_silk_gloves`、`cultist_robe` | `armorClass: cloth`、`tags: [cloth]` |
| `bone_helm` | `armorClass: plate`、`tags: [plate, bone, style:salvage]` |
| `raven_quill_charm` | `repairMaterial: mat_copper_ingot` |
| `black_ridge_mantle` | `armorClass: leather`、`tags: [leather]`、`sed: { grade: mid }`、`repairMaterial: mat_hardened_leather` |
| `ashen_plate` | `armorClass: plate`、`tags: [plate, style:salvage]`、`sed: { grade: mid }`、`repairMaterial: mat_nightiron_ingot` |
| `drake_scale_leggings` | `armorClass: mail`、`tags: [mail]`、`repairMaterial: drake_scale` |
| 五种药水与石肤药剂 | 族标签（`potion`、`elixir`）；二档以上的晶药 `use.taint`（0.2、0.5，消耗品 2.2 的晶药澱染列） |
| `ash_spirits`、`door_charm` | `tags: [drink, liquor]`、`tags: [charm]` |

**数值溯源**

| 数值 | 出处 |
| --- | --- |
| 阶梯价 | 装备 1.3 的速查表：一档基价 150 乘品质系数乘类别系数 |
| 武器伤害 | 装备 1.4 的单手凡品 DPS 指导值（表内线性插值）乘类修正（双手近战 1.35、法杖 0.8、录杖 0.7、弩 1.05）乘品质（良 1.1）；`min + max = 2 × DPS × 速度`，`min` 取三分之一 |
| 攻速 | 目录没给：匕首 1.7、单手剑 2.4、弓 2.6、法杖 2.8 取已有数据，拳套 1.6、单手斧 2.8 同理；锤 2.6、录杖 2.2、弩 3.0、双手长柄 3.2、双手剑 3.4、双手斧与锤 3.6 由本包定（待决第 3 条） |
| 属性 | 装备 1.4：预算 = 等级乘品质系数（凡 0.5、良 0.8、精 1.0）乘槽位系数；凡品一项主属性，良品按 2.4 的纹码分两键，百分比键按 1% = 6 点取半个百分点的整步 |
| 护甲 | 装备 3.2：胸甲 `10 + Lv × k`（布 2.5、皮 5、锁 8、板 12）乘槽位倍率；盾 `10 + Lv × 13`；良品 +5% |
| 消耗品效果与价 | 消耗品 1.3 的族基价与 2.2 的按阶缩放表（一档治疗 90、灵力 120、战剂 +4、守剂 +10、600 秒）；晶药澱染取同表 |
| 材料价 | 采集与生业第 3、4 节各行的基准价；加工料按 7.1 的加工料价式 |
| 工具 | 消耗品 3.15：耐久 200、一档价 80 铜、`tool:<种类>` 取生业内核的种类表 |
| 按份澱染 | 消耗品 2.4：轻 +1、中 +3、重 +8 |
| 附纹 | 装备 6 的规则行与 6.1 到 6.7 各道的效果与材料 |

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 装备 2.7；计划包行 | 包行写"良品以上的 `repairMaterial`" | 精品（品质 3）以上才要求 | 目录 2.7"精品以上每修 25% 另耗一份本阶主料"，良品不耗主料 | 否 |
| 装备 5.3 | 晶背炉四件套"与晶背剑同用"才给同炉共鸣 | 晶背剑入套，触发改挂五件 | 触发语法没有"穿着某件"的条件；入套后四甲加剑正好五件 | 否 |
| 装备 5 | 套组件默认精品 | 余烬门守四件为良品 | 目录 11.1 第 2 条：第一幕新增单列物一律良品 | 否 |
| 装备 3.1 | 良品按纹码派生 | 只生成六条配方要的杰作产出 | 其余良品由升品配方产出，不预铺数据 | 否 |
| 采集与生业 6.2 | 旧矿铜脉澱染"无" | 写 `taint: 0` | 不写就按地点澱度（3）折成轻档 | 否 |
| 消耗品 3.15 | 有剥皮刀 `cs_tool_knife_t1` | 未导入 | 生业内核的工具种类表没有 `knife`（解兽是标签活动） | 是（第 4 节第 4 条） |
| 消耗品 3.8、采集与生业 7.6 | 同一道料理两处投入不同 | 按消耗品目录的"制"列 | 消耗品目录是该条目的主管目录 | 否 |

**覆盖性复查**

新起会话只读复查一轮，22 条发现。本包处理：数据类四项已修（旧矿铜脉 `taint`、晶背剑入套、三件后期装备的修理主料、随之补入两种高阶主料）。
其余按第 3 节派给owning 包、按第 4 节转为待决、按第 5 节记为延后测试；复查判为本包之外的（场景、任务、女神、台词包的校验失败）不动。

## 3. 遗留事项（含待读取方的效果与光环）

| 事项 | 建议去处 |
| --- | --- |
| 消耗品的 `use` 效果没有读取方：`food`、`drink`、`throw`、`gate`、`detect`、`light`、`ward`、`rest`、`bait`、`feed`、`purify`、`conceal`、`pact`、`beast_cure`（共 24 件物品）。**已知问题**：`inventory.use` 现在照常扣掉消耗品并发 `item.used`，这些效果没人结算，玩家会白扣一件。按最小改动留作已知问题，不在本包加闸门 | 战斗（`throw`、`food`、`drink`）、澱病（`detect`、`purify`）、成长与位阶（`gate`）、认知（`conceal`）、兽伴（`feed`、`beast_cure`）、库存（闸门：无读取方的效果拒绝使用） |
| 预防品的三条光环没有读取方：`aur_item_greybanetea`（环境澱染 -30%）、`aur_item_ashveil`（不到浓灰之地 -50%）、`aur_item_ashsachet`（澱斑风险孩童 -50%、成人 -20%） | PK-M1-51 的后续（澱染暴露读修正项或光环） |
| 药毒第二档的施加（`aur_st_physic_poison` 只有数据，无人挂上）；`aur_item_ale`、`aur_item_otherworldsweets` 两条光环等经济物品行决定 `kind` 后才能用 | 库存与澱病（疗程内提前再用）；经济物品行的 `kind` 归经济 |
| 器意的 `slow`、`dot`、`hot`、`stack` 四种效果：战斗的 `onItemProc` 现在直接忽略（等触发光环） | PK-M1-12 或战斗的后续包 |
| `has.<物品>` 镜像旗标没有写入方：`rcp_moon_tavern_trio_*` 与四条 `rcp_earth_menu_*` 的 `requires` 因此永远不成立 | 库存（派生镜像的写入方，注册表第 1050 行已登记为 inventory 派生） |
| `trade_count.<人>` 没有写入方（前世之门加成与纷争节点读它） | 经济与任务 |
| 支线 A1-S34 到 S37 的任务数据（草药、炼剂、锻造、采集四条生业支线） | PK-M1-33（`data/quests/` 是它的文件；本包已备齐它们要的材料、配方与采集点） |
| 炉边前世自带《异界菜单》前三页；S02 交付晶背剑的授予（现在只给门钥） | PK-M1-27、PK-M1-33、PK-M1-56 |
| 商店货架与补货：新物品没有进 `data/economy/markets.json`，"售常"条目只能做不能买；钱包收入 ±20% 与修理支出 8% 到 12% 未测量 | PK-M1-42（平衡与回归），PK-M1-18 的补货请求同落此处 |
| 收藏 `col_` 一条未导入；遗物与证物 `lb_report_978_copy`、`lb_moss_second_ledger`、`lb_ash_road_notes`、`ky_rusty_key`、`rl_lamp_of_judgment`、`evi_smuggler_ledger_leaf`、`rl_yeyu_satchel`、`tg_pawn_ticket` 未导入 | PK-M1-33（任务物品与证物）、遗物批次 |
| 名器传器在世界开局时的固定实例（玛莎、欧拉等人手里的名器） | PK-M1-13 的后续 |
| 料理的澱纹应取"全部未净投入中最重的一档"（生业内核现在品质 3 以下只看主料）；按份澱纹只读堆叠格，定义带 `sed` 的堆叠物与实例消耗品不计 | PK-M1-49 的后续（生业内核的 `grainFrom`） |
| 采集点的缘钥与清巢门槛：`node_lotha_greybane_hollow` 要"欧拉告知地点"的旗标，`node_lotha_rim_nest` 要"澱巢已清"的旗标与本地一档澱源材副产 | PK-M1-33（旗标由 S34 与清巢任务写）；旗标落地后本包的数据补 `when` |
| 一档琢磨台（手磨台）没有地点，`rcp_glass_blank` 与法杖录杖法器三条配方在第一幕无处可做；一档纹台按目录 2.4 不存在，十四道附纹配方因此在第一幕不可用（设计如此） | PK-M1-35（地点）、PK-M2-13（二档纹台在瓦伦堡） |
| 附纹配方的浅档工费 30 银（`fee`）未写 | 本包的后续补数据或 PK-M1-42 |
| 目录有"制"但没有 `rcp_` 族的条目（野外修理包、灰巾、香囊、醒酒丸、北境黑麦酒、箭与弩矢、试灰纸、火油瓶、烟球、铁蒺藜、投索、门纹膏、净坛、蛋等 20 条）：要先在采集与生业目录补配方族 | 采集与生业目录的负责方，之后的物品批次导入 |
| 魔道具的月余澱（九件各一个数）与弹药的批量数没有字段 | 城建与经济（余澱计量）、采集与生业目录（批量数） |
| PK-M1-30 请求的其余条目（T2 部件、`nm_*` 异名物、`rat_queen_heart`、`rustmatron_carapace`、证物与遗物约 25 个 ID）尚未核对，只保留了它掉落表要的 8 个 | 本包的后续或 PK-M2-23（T2 部件）、PK-M1-33（证物） |

## 4. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 十一条配方因目录给的投入与价格破坏经济不变式（产出买回价不得高于投入基准价之和，买回率取各市场最高 0.45），本包先不导入 | 逐条两个数（买回价对投入价）：一档匕首 135 对 105、单手斧 135 对 90、拳套 135 对 105、长柄 202.5 对 100、弓 202.5 对 26、弩 202.5 对 106、法杖 202.5 对 32、录杖 135 对 82、法器 81 对 72、次级灵力药水 36 对 35、钓具 36 对 16。推荐：按阶提高这些行的投入件数（弓与法杖最明显，目录只给 `wood` ×2 加一份辅料）；或下调装备 1.3 的双手类别系数；或把买回率从 0.45 降到 0.3 | 阻塞这十一条配方 |
| 2 | 工具一档价 80 铜落在采集与生业目录的一档材料价带（2 到 20 铜）之外（V6 八条告警） | 推荐按消耗品 1.3 的工具行保留 80 铜（工具不是材料）；或把工具移出材料价带的检查 | 不阻塞 |
| 3 | 攻速表（目录没给任何武器的攻速） | 推荐沿用本包的表（已落地，见第 2 节数值溯源）；或由 PK-M1-42 按 DPS 实测调整 | 不阻塞 |
| 4 | 剥皮刀 `cs_tool_knife_t1`（消耗品 3.15）没有对应的工具种类 | 推荐在生业内核的工具种类表加 `knife`（解兽用，归 PK-M1-49 的后续）；或把剥皮刀作普通消耗品导入，不作工具 | 不阻塞 |
| 5 | 凡人俗称"薄灰之地、积灰之地、浓灰之地"是本包按 D-030 自造的说法（D-030 只给了灰气、灰病、灰晶、灰狼、灰鬼） | 推荐收进 D-030 与术语表；或改用"薄灰、积灰、浓灰"四字以内的短说法 | 不阻塞 |

## 5. 延后测试（本包很可能影响、但按用户要求未跑）

| 套件或命令 | 为什么可能受影响 |
| --- | --- |
| `npm test` 全量 | 物品表增加约 300 条记录，任何按物品计数或遍历物品表的断言都可能变 |
| `npm run playthrough`（含 `tests/playthrough/release.playthrough.test.ts`、`act1_minimal`） | 自动玩家会捡到、买到、做出新物品；掉落与商店未变但物品定义变了 |
| `tests/content_validation.test.ts` | 已跑，三条失败全部指向并行包的场景与任务引用（见 `verification_matrix.md` 第 4 节） |
| `tests/economy.test.ts`、`tests/city.test.ts` | 物品价与材料表进了市场与生产链的计算范围 |
| `tests/combat.test.ts`、`tests/combat_rules.test.ts`、`tests/boss_mechanics.test.ts` | 武器与护甲的类字段改变命中音效与伤害种类的取值路径 |
| `tests/save_migration.test.ts` | 持有物与实例的定义变多；本包未改存档形状 |
| `tests/art_*`（素材覆盖与清单） | 新物品 ID 需要 `art_ico_item_*` 图标登记（V7 已告警 4 条） |
| `tests/registry.test.ts`、`tests/content_id_guard.test.ts` | 已跑，失败指向并行包（场景规则 8、自动玩家） |
