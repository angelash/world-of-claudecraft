# PK-M1-31 第一幕物品与生业（别名：`content_act1_items_01`）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-31` 第一幕物品与生业 |
| 状态 | 进行中（数据已落地，遗留与待决见 `progress.md`） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-31` |
| 形态 | 内容批次包，按 PK-M1-13 的先例只写 `README.md`、`progress.md`、`verification_matrix.md` |
| 工作流 | 内容 |
| 量级 | 4 代理人日，0.5 用户人日 |
| 依赖 | PK-M1-13（已完成，物品实例层）；PK-M1-49（已完成，采集与生业内核）；PK-M1-11、PK-M1-51（已完成，使用闸门与澱病字段） |
| 立项日期 | 2026-11-18 |

## 1. 目标

把四份物品目录与采集目录的第一幕部分导入数据：装备（一档基础阶梯与第一幕单列件）、消耗品与魔道具、材料与部件、商品与遗物书籍、
同炉套组与附纹、采集点、工站与配方。物品行接上物品实例层与生业内核的字段：署名、套组、`repairMaterial`、`salvage`、
澱染磨损的材质标签、`weaponClass` 与 `armorClass`、工具的 `tool:<种类>` 与耐久 200、涂层、酒的醉意、澱药的疗程字段。
带澱纹的食物按份把澱纹档交给澱病系统。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 新内容包 `items`：按目录分文件装载物品表与物品光环，校验第一幕导入规则（武器与护甲的类、材质标签、精品以上的修理主料、工具的种类与耐久、装备的等级） | `src/content/packs/items.ts` | 装备 1.2、1.6、2.7；战斗与职能 19.3；消耗品 3.15 |
| 2 | 一档基础阶梯：按目录公式生成的凡品型号，与六条配方的良品杰作产出 | `tools/content/equipment_ladder.ts`、`data/items/equipment_t1.json`（71 条） | 装备 1.3、1.4、3.1 到 3.3 |
| 3 | 第一幕单列装备、巢主掉落两件、余烬门守与晶背炉套组件、晶背剑 | `data/items/equipment_act1.json`（27 条） | 装备 4.1、4.13、5.1、5.3、7.1 |
| 4 | 同炉套组两套与一档附纹十四道 | `data/inventory/item_sets.json`、`enchants.json` | 装备 5.1、5.3、6.1 到 6.7 |
| 5 | 第一幕消耗品与魔道具：药、包扎、澱病线与预防品、关药、料理、异界料理、饮品与醒酒丸、符、弹药、投掷物、毒与涂层、工具八件、野外修理包、兽药与兽食、魔道具九件 | `data/items/consumables_act1.json`（73 条：`cs_` 64、`mt_` 9，其中工具 8） | 消耗品 1.3、2.1、2.2、3.1 到 3.19、4.1 到 4.9 |
| 6 | 物品光环：消耗品与料理的增益、药毒 | `data/items/auras.json`（20 条） | 消耗品 2.2；技能与光环 3.2、7.5 |
| 7 | 零到一档材料与部件，加第一幕条目引用到的少数高阶主料 | `data/items/materials_act1.json`（86 条） | 采集与生业 3.1 到 3.9、4.1 到 4.12 |
| 8 | 第一幕商品、遗物与书籍 | `data/items/goods_act1.json`（20 条） | 遗物与书籍目录第 3、5 节；商品目录第 3、6.1 节 |
| 9 | 采集点、工站与配方的第一幕条目 | `data/crafting/nodes.json`（9）、`stations.json`（11）、`recipes.json`（65） | 采集与生业 2.4、6.2、6.3、7.2 到 7.14 |
| 10 | 已有物品行的字段加法：武器与护甲的类、材质标签、澱纹档、锈剑的 `salvage`、精品以上的修理主料、药水与药剂的族标签与晶药澱染 | `data/combat/items.json`（27 行，只加键） | 装备 2.6、2.7、3.9；消耗品 1.4、2.2 |
| 11 | 带澱纹的食物按份计澱染：库存在 `item.used` 上带所吃那一格的澱纹档，澱病系统按档加澱染 | `src/systems/inventory/index.ts`、`src/systems/ailments/{body,types}.ts`、`src/content/packs/ailments.ts`、`data/ailments/config.json` | 消耗品 2.4、2.9；采集与生业 1.4 |
| 12 | 物品触发的 `when` 不再被当成世界状态条件（它有自己的语法） | `src/content/registry_refs.ts`（一处） | 装备 1.5 |
| 13 | 测试 | `tests/items_act1.test.ts` | 计划包行的验收 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 第二、三幕的物品、材料、配方与采集点 | PK-M2-23 |
| 2 | 预防品、投掷、关药、照明、探测、兽食等效果的运行时读取方 | 战斗、库存、澱病、女神各自的后续包（见 `progress.md` 第 3 节） |
| 3 | 器意的 `slow`、`dot`、`hot`、`stack` 四种效果的战斗读取方 | PK-M1-12 或战斗的后续包 |
| 4 | `has.<物品>` 镜像旗标与 `trade_count.<人>` 的写入方 | 库存与经济（`progress.md` 第 3 节；条件读取方已在任务系统） |
| 5 | 支线 A1-S34 到 S37 的任务数据 | PK-M1-33（任务数据是它的文件） |
| 6 | 炉边前世自带《异界菜单》前三页的授予 | PK-M1-27（序章内容）或 PK-M1-56（前世之门效果读取方） |
| 7 | 第一幕商店货架与补货；钱包收入 ±20% 的测量 | PK-M1-42（平衡与回归） |
| 8 | 名器传器在世界开局时的固定实例 | PK-M1-13 的后续 |
| 9 | 收藏（`col_`）与余下的遗物、证物条目 | PK-M1-33、PK-M1-34 与遗物批次 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则 |
| [implementation_conventions.md](../../50_tech/implementation_conventions.md) 第 6、8 节 | 物品与持有物的协作方式、文本 |
| 装备目录 1.2 到 1.6、2.3、2.6 到 2.8、3.1 到 3.3、3.9；消耗品目录 1.3、2.1、2.2、2.4、2.9；采集与生业目录 1.4、2.4、6.1、7.1 | 本包导入的规则与公式 |
| `src/content/packs/{inventory,crafting,items}.ts` | 字段、校验与新包 |
| [pk_m1_13_item_instances](../pk_m1_13_item_instances/progress.md)、[pk_m1_49_crafting](../pk_m1_49_crafting/progress.md) 的遗留表 | 路由到本包的条目 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 不编平衡数 | 每个数值出自目录的表或公式；公式算出的值在 `tools/content/equipment_ladder.ts` 的注释里写明出处 | `progress.md` 的数值溯源表 |
| 内容 ID | 系统代码不写物品、采集点、配方 ID | `tests/content_id_guard.test.ts` |
| 玩家文本 | 中文；不泄露【真相】；第一幕按 D-030 用凡人俗称（灰气、灰斑） | `node tools/content/validate.ts`（V5、V8） |
| 实例层 | 工具与装备是实例物；堆叠物的限定字段只能是约定的五项 | `tests/inventory_instances.test.ts` |
| 经济不变式 | 产出的商人买回价不高于投入的基准价之和 | `src/content/packs/crafting.ts`（`validateCrafting`） |
| 并行包的文件 | `data/combat/items.json` 只加键，不改旧值；门数据、任务数据、魔物数据不动 | `progress.md` 第 2 节的越界清单 |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/content/packs/items.ts`、`tools/content/equipment_ladder.ts`、`data/items/`（六个文件）、`tests/items_act1.test.ts`、本目录 |
| 本包修改 | `data/inventory/{item_sets,enchants}.json`、`data/crafting/{nodes,stations,recipes}.json` |
| 越界的最小改动 | `data/combat/items.json`（27 行加键）、`src/systems/inventory/index.ts`、`src/systems/ailments/{body,types}.ts`、`src/content/packs/ailments.ts`、`data/ailments/config.json`、`src/content/registry_refs.ts` |
| 工具重生成 | `src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` |
| 不得修改 | `data/doors/`、`data/quests/`、`data/npc/`、`data/scenes/`、`src/systems/combat/`、地图文件、编辑器与素材工具 |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。本包特有的：目录给的投入与价格让配方破坏经济不变式时，
把两个数一起写进待决事项，不自行改数（`progress.md` 第 4 节）。

## 8. 验证命令

在 `hakoniwa/` 下运行：

```
npm run typecheck
node tools/content/validate.ts
node tools/content/equipment_ladder.ts --check
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.config.ts tests/items_act1.test.ts tests/crafting.test.ts tests/crafting_save.test.ts tests/inventory_instances.test.ts tests/inventory_save.test.ts tests/ailments.test.ts tests/ailments_sediment_reads.test.ts
```

延后的套件见 `progress.md` 第 5 节。

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起会话，只读） | 必派 | 内容批次的目录保真与路由请求的覆盖；结论与处理见 `progress.md` |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 第一幕物品、材料、部件与两件巢主掉落的 ID | PK-M1-30（第一幕图鉴） | 魔物掉落引用的 8 个 ID 存在，内容校验绿 |
| 采集点、工站、配方数据 | PK-M1-42（平衡） | 钱包收入与修理支出的校准有数据可测 |
| 待读取方的效果清单与光环清单 | 战斗、库存、澱病的后续包；PK-M1-56 | 按 `progress.md` 第 3 节接线 |
| 缺的任务数据与授予（S34 到 S37、晶背剑交付、《异界菜单》） | PK-M1-33、PK-M1-27 | 任务与序章侧补齐 |
