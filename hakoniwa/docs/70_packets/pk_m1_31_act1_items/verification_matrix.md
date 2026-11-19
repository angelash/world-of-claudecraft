# PK-M1-31 第一幕物品与生业：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（第一幕物品、材料、采集点、配方、套组与附纹的数据已落地并自洽：本包的表在内容校验里零错误，本包与相关内核套件全绿；"V1 到 V10 全绿"这条验收在本工作区**未达到**，余下的错误全部出自并行包的场景、任务、女神与台词包；钱包 ±20% 未测量，归 PK-M1-42） |
| 末次代码或内容变更 | 2026-11-19，未提交；改动文件清单见 `progress.md` 第 2 节 |
| 完整实跑 | 2026-11-19，与多个并行包共用同一工作区（它们同期改动场景、任务、台词、界面窗口与魔物数据，下表的"他包"行会随它们变化） |
| 审查 | 新起会话的覆盖性复查一轮，22 条发现；处理见 `progress.md` 第 2 节末与第 3、4、5 节 |
| 遗留 | `progress.md` 第 3 节（含待读取方的效果与光环清单） |
| 需用户决定 | `progress.md` 第 4 节五项，其中第 1 项（十一条配方破坏经济不变式）阻塞那十一条配方 |

## 1. 验收条目

计划包行验收栏："V1 到 V10 全绿；钱包收入在成长第 7.2 节目标 ±20%"。

| 序 | 验收 | 阈值 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 内容校验 V1 到 V10 | 全绿 | V3、V6、V7、V10 全绿；V1 10、V2 12、V4 5、V5 2、V8 16、V9 13 个错误，逐条核对后**没有一条出自本包的表**（第 2 节） | FAIL（他包），本包零错误 |
| 2 | 钱包收入在成长 7.2 的 ±20%（第一幕目标 2 金） | 测量值在区间内 | 未测量：新物品还没有进商店货架，自动玩家也没有采集与制作行为 | 延后（PK-M1-42，`progress.md` 第 3 节） |
| 3 | 本包测试 | 全绿 | `tests/items_act1.test.ts` 7 条通过 | PASS |
| 4 | 相关内核套件（生业、库存、澱病） | 全绿 | 7 个文件 160 条通过（第 3 节） | PASS |
| 5 | 一档阶梯产物与生成器一致 | `--check` 退出 0 | `data/items/equipment_t1.json is current (71 models)` | PASS |
| 6 | 变量注册表产物最新 | `--check` 退出 0 | `node tools/registry/build.ts --check` 通过 | PASS |
| 7 | 类型检查 | 本包文件零错误 | 本包文件零错误；工作区另有 16 个 `src/client/windows/`、`src/client/hud/` 文件的键名错误，全部出自并行的界面窗口包（那些文件未登记在本包，且 `locales/zh-Hans/ui.json` 里没有它们的键） | PASS（本包），他包 FAIL |
| 8 | 文本检查 | 本包零 finding | `node tools/i18n/check.ts` 152 个 finding，全部是 `missing_key` 与 `missing_prefix`，逐条指向上面同一批并行界面文件；本包的物品文本经 `extract_content` 生成后无 finding | PASS（本包），他包 FAIL |

## 2. 内容校验的逐条归属

命令：`node tools/content/validate.ts`（墙钟约 14 秒）。

| 验证器 | 错误数 | 归属 |
| --- | --- | --- |
| V1 schema | 10 | 9 条是任务与幕引用未建的场景（`act1_intro`、`a1_yeyu_bound`、`a1_dream` 等，PK-M1-34 与 PK-M1-33）；1 条是场景效果引用 `lore_h03`，出自场景包尚空的 `data/scenes/lore_items.json` |
| V2 references | 12 | 同上的场景引用 |
| V4 variable registry | 5 | 场景包的 `read.lore_h03` 镜像写入与 `quest.<id>.path` 的写入方（场景包与任务包） |
| V5 reveal ledger | 2 | 女神人格卡 `janu` 的尊名在第一幕仍封锁（PK-M1-34） |
| V8 text | 16 | 台词包的吠叫池覆盖率（PK-M1-29） |
| V9 reachability | 13 | 场景无人请求（PK-M1-34） |
| V3、V6、V7、V10 | 0 | 全绿；V6 的 16 条告警里 8 条是本包工具价 80 铜落在材料价带外（`progress.md` 第 4 节第 2 条），V7 的 4 条是新 ID 还没有图标登记 |

核对方式：过滤掉表名为 `scenes`、`quests`、`acts`、`goddesses`、`linePacks` 与自动玩家的错误后，错误列表为空；本包的表（`items`、`itemSets`、`enchants`、`gatherNodes`、`craftStations`、`recipes`、`auras`）在六个失败的验证器里都没有出现。

## 3. 测试

命令：`npx vitest run --config vitest.config.ts tests/items_act1.test.ts tests/crafting.test.ts tests/crafting_save.test.ts tests/inventory_instances.test.ts tests/inventory_save.test.ts tests/ailments.test.ts tests/ailments_sediment_reads.test.ts`

结果：`Test Files 7 passed (7)`，`Tests 160 passed (160)`。

| 用例（`tests/items_act1.test.ts`） | 断言的是什么 |
| --- | --- |
| 1 | 本包的物品行通过第一幕导入规则（`validateItems`），生业数据通过 `validateCrafting`（包含经济不变式与工站档） |
| 2 | `data/items/equipment_t1.json` 等于生成器的输出（产物不过期） |
| 3 | 每件工具是 `tool:<种类>` 加耐久 200，种类在生业内核的工具表里 |
| 4 | 计划包行点名的条目在位：晶背剑署名 `barga`、野外修理包的 `repair` 30、锈剑的 `salvage`、两套同炉套组、余烬门守四件都带 `set`、十四道一档附纹；每条做装备的配方都有高一品质的杰作产出 |
| 5 | 全部武器有 `weaponClass`，全部躯干护甲有 `armorClass` |
| 6 | 吃下带澱纹的那一格：`item.used` 带 `sedTier`，澱染按档增加（中档 +3、重档 +8） |
| 7 | 干净的一格与已净化的一格都不加澱染，也不带 `sedTier` |

第 6、7 条是"带澱度的食物按份数传澱度档"这条包行的直接证据（消耗品 2.4）。

## 4. 复查发现的处理

| 类别 | 条数 | 处理 |
| --- | --- | --- |
| 数据类、本包修（已修） | 4 | 旧矿铜脉 `taint: 0`；晶背剑入套、同炉共鸣改挂五件；三件后期装备补修理主料（并补入它们要的两种高阶主料行） |
| 缺运行时读取方 | 6 | 转 `progress.md` 第 3 节，按效果归到战斗、库存、澱病、经济、PK-M1-56 |
| 设计冲突（配方经济不变式） | 1 | 转 `progress.md` 第 4 节第 1 条，逐条写出两个数，不自行改数 |
| 缺任务数据与授予 | 4 | 转 PK-M1-33、PK-M1-27 |
| 缺目录条目（配方族、收藏、证物） | 3 | 转 `progress.md` 第 3 节与目录负责方 |
| 测试深度与编辑器模式 | 3 | 记为延后（`progress.md` 第 5 节）与本包的后续补强 |
| 判为他包或可接受 | 1 | 并行包的校验失败不动 |

## 5. 未跑与原因

按用户要求"测试放在最后"，本次只跑了上面第 3 节的套件与四个检查命令；`npm test` 全量与 `npm run playthrough` 未跑，清单与理由见 `progress.md` 第 5 节。
