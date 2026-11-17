# PK-M1-49 采集与生业内核（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-49` 采集与生业内核 |
| 状态 | 进行中（建议主会话提交后改为已完成，遗留见 `progress.md`） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-49` |
| 形态 | 三件套（量级超过小包上限，按 PK-M1-13 的先例只写 `README.md`、`verification_matrix.md`、`progress.md`） |
| 工作流 | 系统 |
| 量级 | 4 代理人日，0.3 用户人日 |
| 依赖 | PK-M1-13（已完成，物品实例层与工坊端口）；PK-M1-58（已完成，任务目标里的采集与制作在等 `gather.done`、`craft.done`）；PK-M1-11（已完成，战斗的使用闸门 `combat.use_item` 与醉意的抗压字段）；PK-M1-51（已完成，澱病系统读 `use.taint`、`use.sed`） |
| 别名 | 无 |
| 立项日期 | 2026-11-17 |

## 1. 目标

新系统 `crafting`（相位 52）：采集点按地图与地点摆放，按技能阶与工具阶决定能不能采、采多少；工站按类与档摆放；配方在对口工站上制作物品、精炼与附纹（后两者经物品实例层的工坊端口），
杰作按[采集与生业](../../40_design/content/catalog_gathering_crafting.md)第 2.6 节的概率在命名随机流上抽签，品质分布可复现；生业熟练度按主工程的四态曲线增长到所在层的上限（第一幕 50，[成长](../../40_design/progression_and_pacing.md)第 6.3 节）；
发出 `gather.done`、`craft.done` 供任务目标计数。随本包落地的还有：铁匠技能数据与按对口生业的修理、匠契 `boundTo` 的属性折减、金鳞作多一附纹位、深锤作多一精炼级、T6 修理点、
涂层次数与扣次数的端口、醉意、`inventory.use` 走战斗的使用闸门、`ItemUse` 的 `use.taint`、`use.sed`（以及醉意的 `use.drunk`）。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据（文档与节号） |
| --- | --- | --- | --- |
| 1 | 采集点：类（矿、林、草、水、特殊）、阶、产出（主产、副产按概率）、位置（地图与地点，可多处统一刷新）、刷新日（按阶；0 为只随事件）、可采次数、可采条件、澱染档 | `src/systems/crafting/gather.ts`、`types.ts`；`data/crafting/nodes.json` | 采集与生业第 1.3、6.1 节 |
| 2 | 采集规则：死者不能采；采集点阶不超过技能阶加一、不超过工具阶加一；两者都达到才有完整产量与署名，否则产量减半（向上取整）；约 1/90 的稀有采集事件产量五倍、全为署名材（玩家署 `unrecorded`）；采集点所在地点（地点中心）的澱度三以上时，采集物按第 1.4 节的档带澱染 | `rules.ts`（`gatherVerdict`、`gatherTaint`、`halfYield`）、`gather.ts` | 采集与生业第 1.3、1.4、1.5 节；消耗品第 3.15 节 |
| 3 | 工具：`tool` 标签加种类标签 `tool:<种类>`，种类与生业的对应写在数据里；工具阶即物品阶；每次采集或制作扣 1 耐久，耐久归零按徒手 | `tools.ts`；`data/crafting/config.json` 的 `tools` | 消耗品第 3.15 节；装备第 2.7 节 |
| 4 | 工站：十三类（主工程 `StationType` 加录案、纹台、琢轮、晾架、行炉架、庭院工坊位），一到四档，位置、可用条件、修理服务（T6 修理点） | `types.ts`、`craft.ts` 的 `stationAt`、`service.ts`；`data/crafting/stations.json` | 采集与生业第 2.4 节；装备第 2.7 节 |
| 5 | 配方：生业、阶、需求技能（缺省为本阶首点）、工站类与档（缺省按阶）、投入（可替代、主料）、做法（制作、精炼、附纹）、产出、杰作产出与副产、工站费、学会条件；每 60 秒游戏时间至多 10 次；装备产出要对应品质的工站档（良品二档、精品三档），品质未到上限的装备写明杰作产出；纹台从二档起 | `craft.ts`；`data/crafting/recipes.json` | 采集与生业第 2.4、7.1 节；装备第 2.8 节 |
| 6 | 杰作：基础 3%、每高一阶 +1%、署名投入 +2%、专攻 +3%、三档 +1%、四档 +2%、上限 15%；名器不制作；杰作得高一档的产出（或同一件）并署名，记"第一件杰作"；产物取主料（精品以上取全部投入）的澱纹 | `rules.ts` 的 `masterworkChance`、`craft.ts` | 采集与生业第 2.6 节；装备第 2.3、2.6 节 |
| 7 | 熟练度：0 到 150、六层；层由数据给出（基础层一，第一幕起层二，即上限 50）；增长按主工程四态曲线（全、半、四分之一、零），只增不减 | `skills.ts`、`rules.ts` 的 `gainFactor` | 采集与生业第 1.2、2.2 节；成长第 6.3 节 |
| 8 | 事件：`gather.done`、`craft.done`（任务目标；只在做出物品时发）、`crafting.worked`（精炼与附纹）、`crafting.skill`、`crafting.rare`、`crafting.masterwork`、`crafting.drunk` | `index.ts` | 任务模型（PK-M1-58） |
| 9 | 铁匠技能数据：人物的生业技能与名匠身份（`crafters` 表，巴尔加锻兵锻甲 35）；修理按件的对口生业（武器锻兵、布裁织、皮与鞍具鞣革、信物琢晶、工具机巧、其余锻甲） | 库存 `rules.ts`（`repairTrade`、`smithSkill`、`Smith.skills`）、`service.ts`（`crafterSmith`）；`data/crafting/crafters.json` | 装备第 2.7 节"谁能修" |
| 10 | 匠契：实例带 `boundTo` 时，穿戴者不是绑定者则该件全部属性按 `BOUND_STAT_SHARE`（0.5）计 | 库存 `rules.ts`、`gear.ts` | 装备第 1.6 节；采集与生业第 1.5 节 |
| 11 | 金鳞作信物多一附纹位；深锤作多一精炼级（+4，需层五 125） | 库存 `rules.ts`（`enchantSlots`、`maxRefine`、`REFINE_SKILL`）、`workshop.ts` | 装备第 2.5、2.8 节 |
| 12 | T6 修理点：T6 件只能在带 `t6` 修理服务的工站修（门内庭院工坊位） | 库存 `rules.ts` 的 `canRepair`；`crafting.repair` | 装备第 2.7 节 |
| 13 | 涂层：`use.effect: coat` 给主手武器上一种涂层（次数为 `use.amount`，触发为涂层物品的 `procs`，只能是 `on: hit`，涂层物品必须是消耗品），主手武器可用时每次武器命中扣一次，用完消失；扣次数的端口 `spendCoatingCharges`（战斗只为伤害事件里没有的命中调用） | 库存 `procs.ts`（`applyCoating`、`spendCoatingCharges`、触发来源 `coating`）、`index.ts` | 消耗品第 2.1、3.14 节；战斗与职能第 13.3 节 |
| 14 | 醉意：`use.drunk` 加层（至多 10）、每游戏时辰 -1、醒酒丸（`use.effect: sober`）清零并 10 分钟内不叠加；层数作为数据所写状态光环的层数 | `drink.ts` | 消耗品第 2.1、3.10 节；战斗与职能第 9.4 节 |
| 15 | `inventory.use` 走战斗的使用闸门：库存给出端口 `registerUseGate`，战斗自己的 `combat.use_item` 转来的使用不再查 | 库存 `use_gate.ts`、`index.ts`；登记在 `src/systems/crafting/use_gate.ts`（过渡，见第 11 节） | 战斗与职能第 14.1 节 |
| 16 | `ItemUse` 加 `use.taint`、`use.sed`、`use.drunk` 与校验 | 库存 `types.ts`、`src/content/packs/inventory.ts` | 消耗品第 2.4、2.9、3.10 节 |
| 17 | 存档：切片带版本、校验、改名字段（采集点 ID）；旧存档读档后第一次用到时建切片 | `slice.ts` | 发行工程第 5.5 节 |
| 18 | 内容包与校验、命名空间（`node_`、`rcp_`、`stn_`）、实体种类、引用行、文本 | `src/content/packs/crafting.ts`；`src/content/entity_kinds.ts`、`references.ts`；`tools/content/validators/namespace.ts`；`tools/registry/parse.ts`；`locales/zh-Hans/sys_crafting.json` | 内容总纲第 12 节；发行工程第 7.4、8 节 |
| 19 | 测试 | `tests/crafting.test.ts`、`tests/crafting_save.test.ts`、`tests/crafting_harness.ts` | 计划包行的验收 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 第一幕的材料、采集点、配方、工具、修理包、涂层与酒的条目（本包只带几条用现有物品的种子数据：三处采集点、五座工站、两条配方、巴尔加的技能） | PK-M1-31 |
| 2 | 战斗侧的醉意光环 `aur_st_drunk`、`ash_spirits` 的 `use.drunk`、使用闸门由战斗自己登记 | PK-M1-12（请求，见 `progress.md`） |
| 3 | 生业之门（十四扇 `door_craft_<生业>`）决定的层与历钥 | PK-M2-13（千门第二批） |
| 4 | 专攻（技能 75 选定）、出师之作与五道关、解兽（整剥）、钓鱼小游戏、领地生产与工头 | 第二幕以后的包（专攻在第一幕上限 50 之上） |
| 5 | 采集与制作的界面窗口 | PK-M1-22 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则、目录分工 |
| [architecture.md](../../50_tech/architecture.md) 第 4 节、[implementation_conventions.md](../../50_tech/implementation_conventions.md) 第 6、8 节 | 系统接缝、跨系统协作、文本 |
| 采集与生业第 1 到 3 节（尤其 1.2 到 1.5、2.4、2.6）、第 6.1、7.1 节；成长第 6.3 节；装备第 1.6、2.5 到 2.8 节；消耗品第 2.1、3.10、3.14、3.15 节；战斗与职能第 9.4、14.1 节 | 本包实现的规则 |
| `src/systems/crafting/index.ts` | 入口与模块说明 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | 随机只走命名流 `crafting.gather`、`crafting.masterwork`；时间只读 tick；无墙钟 | `tests/architecture.test.ts` |
| 内容 ID | 系统代码不写内容 ID：采集点、工站、配方、工具种类、层的条件都在数据里；词表用 `as const` | `tests/content_id_guard.test.ts` |
| 文本 | 拒绝原因与说明都是 `sys.crafting.*` 键 | `tests/i18n_kernel_guard.test.ts`、`node tools/i18n/check.ts` |
| 地图 | 不改地图文件；采集点与工站只按地图 ID 与地点 ID 引用 | 内容校验（地点必须存在） |
| 旧存档 | 冻结存档的迁移金样不变；没有切片的存档照常读 | `tests/save_migration.test.ts`、`tests/crafting_save.test.ts` |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/crafting/`（`index.ts`、`types.ts`、`rules.ts`、`skills.ts`、`places.ts`、`tools.ts`、`gather.ts`、`craft.ts`、`drink.ts`、`service.ts`、`use_gate.ts`、`view.ts`、`slice.ts`）、`src/content/packs/crafting.ts`、`data/crafting/`、`locales/zh-Hans/sys_crafting.json`、`src/systems/inventory/use_gate.ts`、三份测试、本目录 |
| 本包修改 | `src/systems/inventory/`（`types.ts`、`rules.ts`、`gear.ts`、`procs.ts`、`workshop.ts`、`service.ts`、`slice.ts`、`index.ts`）、`src/content/packs/inventory.ts`、`locales/zh-Hans/sys_inventory.json`、`src/content/entity_kinds.ts`、`src/content/references.ts`、`tools/content/validators/namespace.ts`、`tools/registry/parse.ts`、生成物（`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json`）、`docs/50_tech/architecture.md`（相位表）、`docs/50_tech/implementation_conventions.md`（第 1、6 节）、`data/README.md` |
| 不得修改 | `src/systems/combat/`、`data/combat/`、地图文件（`data/scenes/maps.json`、`data/combat/maps/`、`data/world/`、`data/npc/maps.json`）、NPC、认知、对话、客户端、编辑器与素材工具 |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。本包特有的：冻结存档的迁移金样发生变化时停下。

## 8. 验证命令

```
npx vitest run --config vitest.config.ts tests/crafting.test.ts tests/crafting_save.test.ts
npx vitest run --config vitest.config.ts tests/inventory_instances.test.ts tests/inventory_save.test.ts tests/combat.test.ts tests/combat_rules.test.ts tests/architecture.test.ts tests/content_id_guard.test.ts tests/i18n_kernel_guard.test.ts tests/save_migration.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npm test
npm run playthrough
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起会话） | 必派 | 确定性、存档、规则保真与越界改动 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 内核、数据模式、种子数据、测试、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；相关套件绿 |
| 采集点、配方、工站、工具、涂层与酒的数据模式（`nodes.json`、`recipes.json`、`stations.json`、`crafters.json`、`ItemUse` 的新字段） | PK-M1-31 | 按模式导入第一幕条目，内容校验绿 |
| 地点需求（第一幕采集点的位置，见 `progress.md`） | PK-M1-35 | 地图上有对应地点 |
| `registerUseGate`、`spendCoatingCharges`、醉意光环的层数约定 | PK-M1-12 | 战斗登记自己的闸门；补 `aur_st_drunk` |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 匠契的属性折减比例（设计只写"只有绑定者出全部属性"） | 推荐 0.5（非绑定者得一半属性）；或 0（完全不出） | 不阻塞 |
| 2 | 第一幕的层：生业之门未落地前，第一幕起所有生业层二（上限 50） | 推荐按幕给（已落地）；生业之门落地后改由门决定 | 不阻塞 |
| 3 | 醒酒丸的"10 分钟" | 推荐游戏时间 10 分钟（已落地，数据可改）；或 1 倍速现实 10 分钟（游戏 10 个时辰） | 不阻塞 |
| 4 | 新前缀 `stn_`（工站）不在内容总纲第 12.2 节 | 推荐收进总纲；或改用地图地点直接当工站 | 不阻塞 |
| 5 | 深锤作的第四级精炼要多少技能（设计只写"深锤作 +1 级上限"） | 推荐层五 125（按 +1 层二、+2 层三、+3 层四 的规律，已落地）；或仍按层四 | 不阻塞 |
| 6 | 工具对配方的门槛（消耗品第 3.15 节只写"阶决定能做的配方"，锻锤"杰作率 +"未给数） | 推荐先只计磨损（已落地），数值随 PK-M1-42 平衡；或要求工具阶不低于配方阶减一 | 不阻塞 |
| 7 | 匠契折减只作用于属性（武器伤害、触发与套组件数照旧） | 推荐只折属性（已落地）；或连武器伤害一并折减 | 不阻塞 |
