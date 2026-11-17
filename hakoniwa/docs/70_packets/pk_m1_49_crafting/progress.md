# PK-M1-49 采集与生业内核：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-18 | 实施 1 | 新系统 `crafting`（采集、工站、配方与杰作、熟练度、醉意、工站修理）；库存一侧的路由项（铁匠技能、匠契、金鳞、深锤、T6 修理点、涂层、使用闸门端口、`ItemUse` 新字段）；种子数据；覆盖性复查后修正 | 未提交 | 见 `verification_matrix.md` | 主会话提交；PK-M1-12 补醉意光环并自己登记使用闸门；PK-M1-31 导入第一幕条目 |

## 2. 汇报

### 2026-11-18 实施 1

**改动文件**（"越界"指本系统目录 `src/systems/crafting/` 以外）

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/crafting/index.ts` | 新增 | 系统入口（相位 52）：切片与内容表声明、命令 `crafting.gather`、`crafting.craft`、`crafting.repair`、`crafting.set_skill`、`crafting.reset_node`，事件 `crafting.skill`、`crafting.rare`、`crafting.masterwork`、`crafting.worked`、`crafting.drunk`，订阅 `item.used` 与 `world.hour` |
| `src/systems/crafting/types.ts` | 新增 | 采集点、工站、配方、内核参数、切片的形状；词表 `NODE_KINDS`、`STATION_TYPES`、`RECIPE_OPS` |
| `src/systems/crafting/rules.ts` | 新增 | 纯规则：`gatherVerdict`、`halfYield`、`gatherTaint`、`gainFactor`、`gainedSkill`、`masterworkChance`、`recipeSkill`、`recipeStationTier` |
| `src/systems/crafting/skills.ts` | 新增 | 熟练度读写、层与上限（数据里的条件）、增长 |
| `src/systems/crafting/places.ts`、`tools.ts` | 新增 | 站在采集点或工站旁的判定；工具（`tool` 与 `tool:<种类>`，阶即物品阶）与磨损 |
| `src/systems/crafting/gather.ts`、`craft.ts` | 新增 | 采集与制作的计划（无副作用的拒绝判定）与执行 |
| `src/systems/crafting/drink.ts` | 新增 | 醉意的加层、按时辰消退、醒酒丸，层数镜像为战斗光环的层数 |
| `src/systems/crafting/service.ts` | 新增 | 工站的修理服务（T6 修理点） |
| `src/systems/crafting/use_gate.ts` | 新增 | 把战斗的 `useItemGate` 登记进库存的使用闸门端口（过渡，战斗自己登记后删除） |
| `src/systems/crafting/view.ts`、`slice.ts` | 新增 | 给界面的查询；切片版本、校验、改名字段 |
| `src/content/packs/crafting.ts` | 新增（越界：内容包目录） | 表与编辑器结构；校验（地点存在、物品与附纹引用、工站与配方的档、装备品质对工站档、杰作产出、纹台二档起、T6 采集点的次数、经济不变式、条件可解析、人物存在） |
| `data/crafting/{config,nodes,stations,recipes,crafters}.json` | 新增（越界：数据目录） | 内核参数（全部取自目录与成长文档）；种子数据：采集点 `node_lotha_rustridge_iron`（边石镇 `miners_shack`）、`node_lotha_ironhemlock`（林缘 `logging_site`）、`node_lotha_north_spring`（边石镇 `north_spring`），只写现有物品的产出；工站：巴尔加铁匠铺的砧炉与村熔炉、伐木场的炭窑、欧拉的药草小屋、醉月亭后厨（二档）；配方 `rcp_smelt_iron`、`rcp_charcoal`；巴尔加锻兵锻甲 35（凡阶·熟 Lv14 按第 1.2 节阶梯折到 T2 段） |
| `locales/zh-Hans/sys_crafting.json` | 新增（越界：字符串表） | 拒绝原因与说明 |
| `src/systems/inventory/use_gate.ts` | 新增（越界：库存） | 使用闸门端口 `registerUseGate`、`checkUseGate` |
| `src/systems/inventory/types.ts` | 修改（越界：库存） | `ItemUse` 加 `taint`、`sed`、`drunk`；`ItemInstance.refine` 到 4、`coating`；生业词表 `PROFESSIONS` 与 `CrafterDef` |
| `src/systems/inventory/rules.ts` | 修改（越界：库存） | `STYLE_TAGS`、`maxRefine`、`REFINE_SKILL[4]`、金鳞的 `enchantSlots`、`BOUND_STAT_SHARE` 与 `boundElsewhere`、`Smith.skills` 与 `t6`、`repairTrade`、`smithSkill`、`canRepair` 的对口技能与 T6 |
| `src/systems/inventory/gear.ts` | 修改（越界：库存） | 匠契折减（`effectiveDef` 的 `wearer`、`wearerOf`） |
| `src/systems/inventory/procs.ts` | 修改（越界：库存） | 触发来源 `coating`；`applyCoating`、`spendCoatingCharges`；武器命中（主手可用时）扣一次 |
| `src/systems/inventory/workshop.ts` | 修改（越界：库存） | 精炼按 `maxRefine` 与对口技能 |
| `src/systems/inventory/service.ts` | 修改（越界：库存） | 铁匠的技能读 `crafters`（`crafterSmith`） |
| `src/systems/inventory/slice.ts` | 修改（越界：库存） | 校验：精炼到 4、涂层；改名字段：涂层物品 |
| `src/systems/inventory/index.ts` | 修改（越界：库存） | `inventory.use` 在"缺物品"之后问使用闸门、处理 `coat`；内容表 `crafters`；事件 `item.coating`，`item.proc` 的来源加 `coating` |
| `src/content/packs/inventory.ts` | 修改（越界） | `crafters` 空表；`use.taint`、`use.sed`、`use.drunk`、涂层的校验 |
| `locales/zh-Hans/sys_inventory.json` | 修改（越界） | `sys.inventory.reject.no_weapon` |
| `src/content/entity_kinds.ts`、`src/content/references.ts`、`tools/content/validators/namespace.ts`、`tools/registry/parse.ts` | 修改（越界，登记） | 三张新表的实体种类、引用行、命名空间（`node_`、`rcp_` 加表、新前缀 `stn_`、严格前缀）、系统名 `crafting` |
| `src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 重生成（越界） | `node tools/i18n/gen_keys.ts`、`node tools/i18n/extract_content.ts` |
| `tests/crafting.test.ts`、`tests/crafting_save.test.ts`、`tests/crafting_harness.ts` | 新增 | 36 加 4 条 |
| `docs/50_tech/architecture.md`（第 4.6 节相位表）、`docs/50_tech/implementation_conventions.md`（第 1 节所有权、第 6 节第 3 条）、`data/README.md` | 修改（越界：文档） | 回写落地形状 |
| 本目录 | 新增 | `README.md`、`progress.md`、`verification_matrix.md` |

**导出接口**

| 给谁 | 接口 |
| --- | --- |
| 任务（PK-M1-58 的目标） | `gather.done { entityId, itemId, count, nodeId, mapId }`（每种产出一条）；`craft.done { entityId, recipeId, itemId, count, quality }`（只在做出物品时，精炼与附纹另发 `crafting.worked`） |
| 战斗（PK-M1-12） | `registerUseGate`（请战斗自己登记 `useItemGate`）；`spendCoatingCharges(ctx, ownerId, n)`（库存已在每次武器命中扣一次，战斗只为伤害事件里没有的命中调用）；`item.proc` 的 `source: 'coating'`；醉意层数作为 `craftingConfig.drunk.aura` 所写光环的层数（经 `addPassive`、`removePassives`，来源 `crafting.drunk`） |
| 内容（PK-M1-31） | 采集点、工站、配方、人物技能的数据模式与校验；物品：工具写 `tags: ["tool", "tool:<种类>"]`、`durability: 200`、按阶的 `level`；涂层写 `use.effect: "coat"`、`use.amount`（次数）、`procs`（`on: hit`）；酒写 `use.drunk`；醒酒丸写 `use.effect: "sober"`；澱药写 `use.sed`、晶药写 `use.taint` |
| 界面（PK-M1-22） | `craftingView`、`recipeRows`、`nodesHere`；事件 `crafting.skill`、`crafting.rare`、`crafting.masterwork`、`crafting.worked`、`crafting.drunk`、`item.coating` |
| 澱病（PK-M1-51，已完成） | `ItemUse.taint`、`ItemUse.sed` 的类型与校验（澱病系统照旧读） |

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 采集与生业第 1.5 节；装备第 1.6 节 | 匠契"只有绑定者出全部属性"，未给数 | 非绑定者属性按 0.5 计（只折属性） | 需要一个数；一半足以让"解契"有意义 | 是（README 第 11 节第 1、7 条） |
| 采集与生业第 2.8 节；千门第 14 节 | 层由生业之门决定 | 生业之门落地前按幕给层：开局层一（25），第一幕起层二（50） | 门未落地；成长第 6.3 节第一幕末目标 50 | 是（第 2 条） |
| 消耗品第 3.10 节 | 醒酒丸"10 分钟内醉意不叠加" | 游戏时间 10 分钟（数据可改） | 与游戏内时钟一致 | 是（第 3 条） |
| 装备第 2.8 节 | 深锤作"+1 级上限" | 第四级要层五 125 | 沿用每级一层的规律 | 是（第 5 条） |
| 消耗品第 3.15 节 | 工具阶决定能做的配方，锻锤加杰作率 | 制作只计工具磨损，不设门槛与加成 | 文档没有给门槛与数值 | 是（第 6 条） |
| 采集与生业第 1.3 节 | 高一阶时"产量减半" | 向上取整（1 件仍得 1 件），减半时不抽稀有事件 | 整数产量；稀有事件要求完整产量 | 否 |
| 采集与生业第 1.4 节 | 澱度三以上之地的采集物带澱染 | 取采集点所在地点中心的澱度（站在地点外的可及范围内也一样） | 澱染属于产地，不属于采集者脚下 | 否 |
| 采集与生业第 2.6 节 | 工站档的杰作加成"注册修正项" | 先写在内核参数里（三档 +1%、四档 +2%） | 修正项系统还没有"工站"目标 | 否（随平衡包改成修正项） |
| 采集与生业第 7.1 节 | 配方族内按阶分支 | 一行一条配方，`family` 字段归族；一条配方一个主产出，副产写 `byproducts`；"或"写在单个投入的 `alt` | 数据可校验；整组替代（如废矿炼铁要 3 炭）写成另一行 | 否 |

**越界改动与请求回写**

| 文件或事项 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `src/systems/inventory/**`、`src/content/packs/inventory.ts` | 计划包行路由到本包的库存侧条目 | 内核（本包按任务授权） | 已改 |
| 战斗登记自己的使用闸门 | 使用闸门的登记方应是战斗；现由 `src/systems/crafting/use_gate.ts` 过渡登记（深引用 `../combat/items_use`） | PK-M1-12 | 请求：在战斗模块里 `registerUseGate((ctx, ownerId, itemId) => ...)`，之后删掉本包的过渡文件 |
| `data/combat/auras.json` 加 `aur_st_drunk` | 醉意的战斗效果（每层精神 -2、抗压每层 0.03 至多 0.15、五层以上踉跄：移速 -15%、施法与攻击间隔 +10%，战斗与职能第 9.4 节） | PK-M1-12 | 请求：加光环（`maxStacks` 10、`presenceResist`、`byStacks` 写踉跄）并更新 `tests/own_ability_ids.test.ts` 的 `LATER_AURAS`；之后在 `data/crafting/config.json` 的 `drunk` 写 `"aura": "aur_st_drunk"` |
| `data/combat/items.json` 的 `ash_spirits` | 消耗品第 3.10 节醉意 2 | PK-M1-12 或 PK-M1-31 | 请求：`use.drunk: 2` |
| `src/systems/quests/objectives.ts` 文件头 | 注释说 `gather.done`、`craft.done` 还没有发出方 | 任务方 | 请求：改为"生业系统发出" |
| 内容总纲第 12.2 节 | 新前缀 `stn_`（工站） | 内容总纲负责方 | 请求：收进命名空间表（README 第 11 节第 4 条） |
| 地点需求（第一幕采集点与工站） | 种子数据引用的地点 ID 要保持：边石镇 `smithy`、`lumberyard`、`herb_hut`、`drunk_moon`、`north_spring`、`miners_shack`，林缘 `logging_site`。第一幕其余采集点要的地点：`node_lotha_oldmine_copper`（`dg_old_mine` 内）、`node_lotha_silverleaf_meadow`（边石镇南缓坡）、`node_lotha_glowcap_grove`（铁杉林深处的积澱斑，带 `sediment`）、`node_lotha_rim_nest`（玩家清理过的澱巢处）；`node_lotha_greybane_hollow` 可用边石北郊的 `greybane_hollow`；家织机（一档织机）要一处民居地点 | PK-M1-35 | 请求 |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 第一幕的材料、采集点、配方、工具、修理包、涂层、酒与醒酒丸、铁匠以外的匠人技能 | PK-M1-31 |
| 生业之门决定的层与历钥；专攻（技能 75）；出师之作与匠人的五道关；同伴与雇员的本业、闲艺与刻深 | PK-M2-13、第二幕以后的包 |
| 杰作的材料阶加成、锻锤的杰作加成、杰作写入来历（谁、何时、哪座炉）；工站档的加成改成修正项 | PK-M1-42（平衡）与第二幕以后 |
| 带澱染的料理与药剂按份加澱染（第 1.4 节）：`item.used` 带上所吃那一格的澱纹档，澱病系统读它 | 内核与 PK-M1-51 的后续 |
| 解兽（整剥）、钓鱼的咬钩与收线、领地按同一份配方生产 | 第二幕以后（城建、PK-M2-23） |
| 醉意光环在单位重建时的补挂（现只在层数变化时同步） | PK-M1-12 补光环时一并处理 |
| 自动玩家采集与制作；修理系数与钱包收入的校准 | PK-M1-10、PK-M1-42 |
| 采集与制作窗口 | PK-M1-22 |

**覆盖性复查**

新起会话只读复查（见 `verification_matrix.md` 第 3 节）：1 条 BLOCKING（测试文件的类型错误）已修；SHOULD-FIX 已修：澱染改按采集点所在地点、死者不能采集与制作、涂层在主手损坏时不扣次数、涂层校验（只能 `on: hit`、必须是消耗品）、`inventory.use` 先判"缺物品"再问闸门、精炼与附纹不发 `craft.done`（改发 `crafting.worked`）、装备产出与工站档和杰作产出的校验、纹台二档起、T6 采集点要写次数、醉意光环的引用校验、副产 `byproducts`、`runs` 非数时按 1、多次制作里有一件杰作就说杰作；转为用户决定或后续：工具门槛、匠契只折属性、深锤第四级的技能、醉意光环与闸门由战斗接手、材料阶加成与来历。
