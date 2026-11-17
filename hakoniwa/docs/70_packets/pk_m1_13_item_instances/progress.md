# PK-M1-13 物品实例层与耐久：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施 1 | 实例层、耐久与修理、触发、冷却组、工坊端口、铁匠修理选项、存档补建与校验；覆盖性复查后修正 | 未提交 | 本包测试 `Tests 57 passed (57)`；相关 28 个文件 `Tests 486 passed`，10 个基线失败（`verification_matrix.md` 第 4 节）；通关两条路线 `Tests 2 passed (2)`（736 秒） | 主会话提交；PK-M1-11 接 `item.proc` 与遗落包；PK-M1-31 导入数据 |

## 2. 汇报

### 2026-11-17 实施 1

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/inventory/index.ts` | 修改 | 系统入口：切片与内容表声明、事件与命令（`inventory.repair` 新增，`inventory.equip` 与 `inventory.give` 可指定实例）、模块导出 |
| `src/systems/inventory/types.ts` | 新增 | `ItemDef` 扩展、`ItemInstance`、`StackPart`、`Holding`、`InventorySlice`、`ItemSetDef`、`EnchantDef`、`ProcDef`、`ConsumableGroup` |
| `src/systems/inventory/rules.ts` | 新增 | 纯规则：哪些带实例、耐久上限、澱度磨损系数、澱纹加成、精炼与附纹位、修理报价与谁能修、野外修理包、器痕、堆叠键、生业上限 |
| `src/systems/inventory/holding.ts` | 新增 | 件数总账与实例记录的对账、取出与放入（整件）、限定堆叠格 |
| `src/systems/inventory/ports.ts` | 新增 | 写端口：`addItem`、`addInstance`、`removeItem`、`takeItems`、`putItems`、`transferItem`、`addMoney`、`spendMoney` |
| `src/systems/inventory/gear.ts` | 新增 | 装备的实际属性（`equippedDefs`、`effectiveDef`）、套组（`activeSets`、`gearAuras`） |
| `src/systems/inventory/durability.ts` | 新增 | `applyDeathWear`、`applyCombatWear`、`applyWearShare`、`wearInstance`、`repairInstance`、`fieldRepair` |
| `src/systems/inventory/procs.ts` | 新增 | 触发的语法、来源顺序、判定、内部冷却、战斗事件到触发点、器痕 |
| `src/systems/inventory/use_groups.ts` | 新增 | 消耗品冷却组 |
| `src/systems/inventory/workshop.ts` | 新增 | 署名、净化（实例与堆叠）、精炼、附纹 |
| `src/systems/inventory/service.ts` | 新增 | 铁匠的修理选项（`player.talked` 与 `dialogue.option_chosen`） |
| `src/systems/inventory/slice.ts` | 新增 | 切片校验、改名字段、补建与物品规则指纹 |
| `src/content/packs/inventory.ts` | 修改 | `ITEM_FIELDS` 新字段；`itemSets`、`enchants` 表与编辑器结构；校验（触发、冷却组、澱纹档、套组与附纹、署名人物、碎料与修理主料） |
| `data/inventory/item_sets.json`、`data/inventory/enchants.json` | 新增 | 空表，第一幕条目随 PK-M1-31 |
| `data/combat/items.json` | 修改 | 9 件消耗品加 `use.group`（药水与净泉草 `cd_potion`，灰烬烈酒 `cd_drink`，石肤药剂 `cd_elixir_guard`，回门符 `cd_charm`），按消耗品目录第 1.4、3 节 |
| `locales/zh-Hans/sys_inventory.json`、`src/core/text_keys.generated.ts` | 修改 | 新键（冷却、修理、铁匠台词）；键类型重生成 |
| `src/systems/city/court.ts`、`src/systems/economy/company.ts` | 修改（越界） | 存取与商会调拨改用 `takeItems` 加 `putItems`，实例与限定格随物走，事件的原因串不变 |
| `src/content/entity_kinds.ts`、`tools/content/validators/namespace.ts` | 修改（越界） | 新表 `itemSets`、`enchants` 的实体种类与命名空间（`set_`、`ench_`，严格前缀） |
| `tests/inventory_instances.test.ts`、`tests/inventory_save.test.ts` | 新增 | 47 加 10 条 |
| `docs/50_tech/implementation_conventions.md` 第 6 节第 3 条、`docs/40_design/content/catalog_equipment.md` 第 1.6、11.2 节、`data/README.md` | 修改 | 回写落地形状与端口 |

**导出接口**

| 给谁 | 接口 |
| --- | --- |
| 战斗（PK-M1-11） | `applyDeathWear(ctx, entityId)`：已装备件各扣上限的 10%，不低于 0，返回被磨损的实例；`applyCombatWear(ctx, entityId)`：一场战斗每件 -1，金属在澱度三到五 ×1.5、×2、×3，骨角减半加乘；`applyWearShare(ctx, id, share, reason)`（同伴重伤退场 `RETREAT_WEAR` 10%、铁人复活 `REVIVE_WEAR` 25%）；`equippedDefs` 已按耐久、精炼、澱纹、附纹与套组折算（战斗的 `deriveStats` 不用改）；`item.proc` 事件（`effect` 已按物品等级解析）与 `fireProcs(ctx, ownerId, on, { targetId, env })`（`combat_start`、`low_hp` 与 `solo`、`hpFrac` 条件由战斗传入）；`gearAuras` 给套组光环；`GROUP_RULES` 的 `inCombat`、`gcd`；`isInstanced`、`takeItems`、`putItems` 给遗落包 |
| 生业（PK-M1-49） | `addInstance(ctx, ownerId, itemId, init)`（`signature`，玩家所制写 `UNRECORDED`；`sedTier`、`provenance` 等）、`addItem(..., init)` 的堆叠限定字段、`signInstance`、`purifyInstance`、`purifyStack`、`refineInstance`、`enchantInstance`、`repairInstance` 与 `Smith`、`CRAFT_SKILL_CAP`、`layerCap`、`craftTierOf`、`clampCraftSkill`、`REFINE_SKILL`、`REPAIR_FINE_SKILL` |
| 澱染（PK-M1-51） | `item.used` 的 `early`（澱药提前服用，药毒）；`equippedDefs` 返回的 `sed` 已是实例的档与净化状态；`sedResist` |
| 界面（PK-M1-22） | `Holding.instances`、`worn`、`stacks`；`item.durability`（`low`、`broken`、`shattered`、`repaired`）、`item.signed`、`item.purified`、`item.refined`、`item.enchanted`；`useWait`、`groupReadyAt` |

**验收逐条结果**

见 `verification_matrix.md` 第 1 节，全部 PASS。通关两条路线：`npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts` 得 `Test Files 2 passed (2)`、`Tests 2 passed (2)`，耗时 736 秒（战斗已在每场战斗结束与死亡时调用磨损端口；自动玩家不修理也走完了两条路线）。之后的唯一代码改动是 `procs.ts` 里一处等价的可选链写法（Biome 建议）。

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 装备第 1.6 节；战斗与职能第 13 节；实现约定第 6 节第 3 条 | `Holding.items` 拆为 `stacks` 与 `instances` | 保留 `items` 作件数总账，另加 `instances`、`worn`、`stacks`（只放带限定字段的格） | 十余处读件数的代码（城建库存、经济、图鉴、任务、自动玩家、客户端）与旧存档都不用改；实例与限定格仍按设计存 | 否（已回写实现约定与装备目录；战斗与职能第 13 节的一句由其负责方同步） |
| 发行工程第 5.5 节 | 结构变化时世界版本加一并写迁移步 | 不加世界版本（M2 之前迁移链为空）：读档后第一个 tick 补建实例，物品规则指纹变化时再扫一次；冻结存档金样不变 | 与 PK-M1-14、PK-M1-48 同样的懒建做法 | 否 |
| 装备第 2.7 节"骨角作减半" | 未写明减半的是什么 | 澱度带来的额外磨损减半（澱度五骨角件 ×2） | 只有加乘才有"减半"的对象 | 否 |
| 装备第 2.7 节"谁能修" | 名器只能交给名匠或原匠人 | 任何品质的件，原匠人（署名者）都能修；生业技能未落地前铁匠按普通铁匠 | 署名者修自己的作品合情理；技能数据随 PK-M1-49 | 否 |
| 消耗品第 2.1 节 `cd_charm` | 每种符各自冷却 | 各自冷却的时长写在物品的 `use.cooldown`（秒）；位移类按效果 `return` 共享 30 游戏分钟 | 目录没有给出各符的秒数 | 否 |
| 战斗与职能第 13.3 节 | `hit` 是自动攻击或武器技能命中 | 以伤害事件的 `weaponClass` 不为 `none` 判定武器出手；周期跳伤（`abilityId` 是光环）不算 | 事件里没有技能种类字段 | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `src/systems/city/court.ts`（存取） | `removeItem` 加 `addItem` 会让实例变新（白修、白净） | 领域 | 已改，两行 |
| `src/systems/economy/company.ts`（商会调拨） | 同上 | 领域 | 已改，两行 |
| `src/content/entity_kinds.ts`、`tools/content/validators/namespace.ts` | 新表的实体种类与命名空间 | 内容管线 | 已改 |
| `src/systems/combat/death_costs.ts` 的 `dropBag` 与 `reclaimBag` | 遗落包按 `stack > 1` 判定，工具（`tool` 标签）带实例却默认可堆叠会被遗落并在取回时变新；带限定字段的堆叠格取回时变成普通格 | PK-M1-11 | 请求回写：`droppable` 排除 `isInstanced(def)`，取出与放回用 `takeItems`、`putItems` 并把包裹存进遗落包 |
| `docs/40_design/systems/combat_and_classes.md` 第 13 节"`Holding.items` 拆为 `stacks` 与 `instances`" | 与落地形状不符 | 战斗文档负责方 | 请求回写：改为指向装备目录第 1.6 节 |
| `docs/README.md` | 新包目录不进索引（`70_packets/README.md` 第 1 节） | 无 | 不需要 |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 战斗处理 `item.proc`（光环、伤害、链、减速、周期、叠层、驱散、澱染、士气），伤害与治疗事件带 `fromProc`（`combat.heal` 尚无），`combat_start` 与 `low_hp` 触发点，`solo` 与 `hp<` 条件，淬毒 `charges` 的消耗，`gearAuras` 套组光环的施加 | PK-M1-11 |
| 战斗中禁用：野外修理包、修理、包扎、食饮、澱药与位移符（`GROUP_RULES.inCombat`）；公共冷却（`gcd`） | PK-M1-11（需要一个"是否在战斗中"的查询或实体标签，库存系统不读战斗切片） |
| 器痕的"老魔物 1"与"澱涌之主 20"（现只按 `rare` 5、`boss` 10） | PK-M1-12（魔物机制字段给出这两类的标记）或 PK-M1-30 |
| 自动玩家找铁匠修理（`player.talked` 后选 `repair`），修理系数 0.2 的校准 | PK-M1-10、PK-M1-42 |
| 武器与护甲的材质标签（`cloth`、`leather`、`mail`、`plate`、`staff`、`bow`、`bone`）进数据，澱度磨损才按材质区分；品质 3 以上的装备写 `repairMaterial` | PK-M1-31 |
| 第一幕条目：晶背剑 `eq_barga_crystalback_sword`（`maker: "barga"`）、`set_barga_forge`、`set_dg_seal_ruins`、附纹、野外修理包 `cs_field_repair_kit_t1`（`use: { effect: "repair", amount: 30, group: "cd_none" }`） | PK-M1-31 |
| 匠契 `boundTo` 的非绑定者减益（采集第 1.5 节未给数值）；金秤作信物多一个附纹位；深锤作精炼上限加一；门铜之作只能在门扉作工坊修；名器与传器在世界开局时的固定实例 | PK-M1-49、PK-M1-31 |
| 澱纹穿戴累积、净化的澱抗（`sedResist`）、澱药的药毒 | PK-M1-51 |
| 背包窗口显示耐久、署名、澱纹档与"属性失效"；`item.durability` 的音效；角色窗口按 `equippedDefs` 汇总属性 | PK-M1-22、PK-M1-06 |
| 经济的买卖与商队仍按件数（市场库存是数字），卖出的实例不进商人库存 | 记为设计取舍；需要"二手名器在商人手里"时由经济包处理 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 战斗已在每场战斗结束与死亡时调用磨损端口，自动玩家不会修理 | 长路线里装备会磨到 0，属性失效 | 两条路线本次都通过；数据换成第一幕装备后由 PK-M1-10、PK-M1-42 复查并给自动玩家加修理 |
| 劣品归零即碎：序章起手的锈蚀短剑（劣品，上限 20）死亡 10 次后碎掉 | 新手可能失去武器 | 设计如此；PK-M1-31 可给它写 `salvage` 或改上限 |

**需用户决定**

| 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- |
| `Holding.items` 保留为件数总账 | 推荐保留（已落地并回写） | 不阻塞 |

**下一步与恢复方式**

1. 主会话审阅并提交本包改动（文件见上表）。
2. 把"越界改动与请求回写"中的两条请求转给 PK-M1-11 与战斗文档负责方。
