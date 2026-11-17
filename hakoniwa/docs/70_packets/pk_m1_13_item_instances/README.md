# PK-M1-13 物品实例层与耐久（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-13` 物品实例层与耐久 |
| 状态 | 进行中（建议主会话提交后改为已完成，遗留见 `progress.md`） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-13` |
| 形态 | 小包 |
| 工作流 | 系统 |
| 量级 | 4 代理人日，0.3 用户人日 |
| 依赖 | PK-M0-01（第 13 节设计已在 [combat_and_classes.md](../../40_design/systems/combat_and_classes.md)）、PK-M0-18（存档迁移框架，已完成） |
| 别名 | 无 |
| 立项日期 | 2026-11-17 |

## 1. 目标

物品分成可堆叠商品与带实例的物品（D-072）：装备、工具与鞍具每件一条实例记录，记耐久、器痕、署名、澱纹与净化、精炼、附纹与持有者；耐久降到 0 时整件不计但不损毁，死亡扣已装备件上限的 10%；
器意、附纹与套组触发走同一个 `procs` 形状，按固定顺序判定、不连锁；消耗品有共享冷却组；生业技能上限 150；M2 之前写下的存档读档后补建实例，冻结存档的迁移金样不变。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据（文档与节号） |
| --- | --- | --- | --- |
| 1 | 堆叠物与实例物分离：`Holding` 保留件数总账 `items`，加 `instances`、`worn`、`stacks`；实例的创建、移交、取出按整条记录走；堆叠键与限定字段 | `src/systems/inventory/types.ts`、`holding.ts`、`ports.ts`（`addItem`、`addInstance`、`takeItems`、`putItems`、`transferItem`） | [catalog_equipment.md](../../40_design/content/catalog_equipment.md) 第 1.6 节；战斗与职能第 19.3 节 |
| 2 | 耐久：按品质的上限、深相加成；死亡 10%、一场战斗 1 点与澱度对金属的加乘；20% 提示、0 时整件不计、劣品碎成材料；名器在器意认可的人手里不磨损 | `src/systems/inventory/durability.ts`（`applyDeathWear`、`applyCombatWear`、`applyWearShare`、`wearInstance`）、`rules.ts` | 装备第 2.3、2.7 节；战斗与职能第 13.2、15.1 节；[thousand_doors.md](../../40_design/systems/thousand_doors.md) 第 6.3 节 |
| 3 | 修理：报价（器价乘 0.2 乘损失比例）、精品以上的主料、谁能修；铁匠的修理选项；野外修理包 | `durability.ts`（`repairInstance`、`fieldRepair`）、`service.ts`、`index.ts` 的 `inventory.repair` | 装备第 2.7 节；实现约定第 6 节第 5 条 |
| 4 | 装备的实际属性：精炼每级 5%、澱纹档加成与醒纹、附纹属性；耐久为 0 的件不计属性、武器与套组件数 | `src/systems/inventory/gear.ts`（`equippedDefs`、`effectiveDef`、`activeSets`、`gearAuras`） | 战斗与职能第 13.1、13.2 节；装备第 2.6、2.8、6 节 |
| 5 | `procs`：形状、`do` 与 `when` 的语法、按槽位与附纹、套组的固定顺序判定，抽随机只在命名流 `combat.proc` 且只在有对应触发点的件上，内部冷却按件按条，不连锁（`kill` 除外）；击杀加器痕 | `src/systems/inventory/procs.ts`（`fireProcs`、`procSources`、`parseProcDo`、`parseProcWhen`、`addMarks`） | 战斗与职能第 13.3 节；装备第 1.5、2.8 节 |
| 6 | 消耗品冷却组 `use.group`：药水共享 120 秒、投掷 30 秒、包扎按被包扎者 60 秒、符各自冷却与位移类共享 30 游戏分钟、澱药 6 个游戏时辰（提前服用照吃无效） | `src/systems/inventory/use_groups.ts`、`index.ts` 的 `inventory.use`；`data/combat/items.json` 的 `use.group` | [catalog_consumables_magitools.md](../../40_design/content/catalog_consumables_magitools.md) 第 2.1 节；战斗与职能第 14.1 节 |
| 7 | 署名、净化、精炼、附纹的端口 | `src/systems/inventory/workshop.ts` | 装备第 2.6、2.8、6 节；[catalog_gathering_crafting.md](../../40_design/content/catalog_gathering_crafting.md) 第 1.4、1.5 节 |
| 8 | `ItemDef` 扩展（`procs`、`set`、`sed`、`use.group`，以及 `instanced`、`durability`、`maker`、`recognizes`、`salvage`、`repairMaterial`）；套组与附纹的表与校验 | `types.ts`；`src/content/packs/inventory.ts`；`data/inventory/item_sets.json`、`enchants.json` | 装备第 1.5、5、6、11.2 节 |
| 9 | 生业技能上限 150，六层各 25 点 | `rules.ts`（`CRAFT_SKILL_CAP`、`layerCap`、`craftTierOf`、`clampCraftSkill`） | D-072；采集与生业第 1.2 节 |
| 10 | 存档：`validateSlice`、`idFields`、读档后第一个 tick 的补建（与物品规则指纹不符时再扫一次） | `src/systems/inventory/slice.ts` | [release_engineering.md](../../50_tech/release_engineering.md) 第 5.5、10.4 节 |
| 11 | 测试 | `tests/inventory_instances.test.ts`、`tests/inventory_save.test.ts` | 计划包行的验收 |

## 3. 不做

| 序 | 不做的事 | 归属（哪个包或哪份文档负责） |
| --- | --- | --- |
| 1 | 第一幕的装备、套组、附纹、修理包与晶背剑等条目数据 | PK-M1-31 |
| 2 | 触发效果的结算（`item.proc` 落到光环、伤害、减速）、`combat_start` 与 `low_hp` 的触发点、`solo` 与 `hp<` 条件、战斗中禁用的检查、遗落包 | PK-M1-11 |
| 3 | 配方、工作台、杰作与熟练度；精炼与附纹的材料与工费 | PK-M1-49 |
| 4 | 背包窗口的耐久、署名与实例视图 `ItemInstanceView` | PK-M1-22 |
| 5 | 澱纹穿戴累积与澱药的效果（`item.used` 的 `early`） | PK-M1-51 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则、目录分工 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) 第 6、8 节 | 系统接缝、跨系统协作、文本 |
| 战斗与职能第 13、14、15、19 节；装备第 1.5、1.6、2.3、2.6 到 2.8、6、11 节；消耗品第 2.1 节；采集与生业第 1.2、1.4、1.5 节 | 本包实现的规则 |
| `src/systems/inventory/index.ts` | 入口与模块说明 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | 随机只走命名流 `combat.proc`；实例 ID 走 `ctx.newId('it')`；无墙钟 | `tests/architecture.test.ts` |
| 内容 ID | 系统代码不写内容 ID；标签词放进 `as const` 词表（`ITEM_TAG_WORDS`、`SERVICE_TAGS`） | `tests/content_id_guard.test.ts` |
| 文本 | 拒绝原因与台词都是 `sys.inventory.*` 键 | `tests/i18n_kernel_guard.test.ts`、`node tools/i18n/check.ts` |
| 旧存档 | 冻结存档迁移后的哈希不变，读档后补建实例 | `tests/save_migration.test.ts`、`tests/inventory_save.test.ts` |
| 格式 | 改过的 TS 与 JSON 用 `npm run format -- <文件>` | 改动文件 Biome |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/inventory/{types,rules,holding,ports,gear,durability,procs,use_groups,workshop,service,slice}.ts`、`data/inventory/`、`locales/zh-Hans/sys_inventory.json` 的新键、`tests/inventory_instances.test.ts`、`tests/inventory_save.test.ts`、本目录 |
| 本包修改 | `src/systems/inventory/index.ts`、`src/content/packs/inventory.ts`、`data/combat/items.json`、`src/core/text_keys.generated.ts`（生成）、`docs/50_tech/implementation_conventions.md`、`docs/40_design/content/catalog_equipment.md`、`data/README.md` |
| 越界改动 | `src/systems/city/court.ts`、`src/systems/economy/company.ts`（存取与商会调拨改为整件搬运）、`src/content/entity_kinds.ts`、`tools/content/validators/namespace.ts`（新表的命名空间）；见 `progress.md` |
| 不得修改 | `src/systems/combat/`、`src/systems/npc/`、`cognition/`、`dialogue/`、`ailments/`、`src/client/`、编辑器与素材工具 |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。本包特有的：冻结存档的迁移金样发生变化时停下，确认原因并记录新旧值。

## 8. 验证命令

```
npx vitest run --config vitest.config.ts tests/inventory_instances.test.ts tests/inventory_save.test.ts
npx vitest run --config vitest.config.ts tests/save_migration.test.ts tests/economy.test.ts tests/city.test.ts tests/combat.test.ts tests/architecture.test.ts tests/content_id_guard.test.ts tests/i18n_kernel_guard.test.ts tests/i18n_ui_guard.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 总闸 | 必派 | 一次贡献结束 |
| 覆盖性复查（新起会话） | 必派 | 存档、确定性与规则保真，见 `verification_matrix.md` 第 3 节 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、数据、测试、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；相关套件绿 |
| 端口 `applyDeathWear`、`applyCombatWear` 与事件 `item.proc` 的契约 | PK-M1-11 | 战斗的死亡代价与一场战斗结束时调用端口；`item.proc` 落到效果 |
| `addInstance`、`addItem` 的实例初值、`signInstance`、`refineInstance`、`enchantInstance`、`purifyStack`、`CRAFT_SKILL_CAP` | PK-M1-49 | 制作产出带署名的实例，精炼与附纹走端口 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | `Holding.items` 保留为件数总账，而非设计文字里的"拆为 `stacks` 与 `instances`" | 推荐保留（已落地）：所有读件数的系统与旧存档不改；实例与限定格另存 | 不阻塞 |
