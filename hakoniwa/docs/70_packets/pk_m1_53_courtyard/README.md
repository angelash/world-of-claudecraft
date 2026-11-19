# PK-M1-53 门内庭院功能（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-53` 门内庭院功能 |
| 状态 | 进行中（内核侧的进门规则、身份暴露、储物、陈列、园圃档位与扩建一档已落地；界面与几项跨系统配合见 `progress.md` 第 3 节，待用户定的见第 4 节） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-53` |
| 形态 | 系统包，三件套 |
| 工作流 | 系统（城建的庭院部分） |
| 量级 | 2 代理人日，0.2 用户人日 |
| 依赖 | PK-M1-14（已完成，千门第一批，`feature.inner_court`）；PK-M1-32（仓廪之门写 `feature.court_expansion_1`）；PK-M1-56（身份暴露的事件形状，请求 4） |
| 立项日期 | 2026-11-19 |

## 1. 目标

门内庭院从"一个按钮传送进去的仓库"变成设计里的样子：只能从一扇关着的门推门进去，进出被旁人看见时算一次门的身份暴露；
存进庭院的东西整件进出、死亡不遗落；陈列中的物由陈列自己持有，取下要等一日；园圃数、陈列位与小仓库的容量随庭院扩建档走，扩建档读仓廪之门的功能旗标。
所有数字写在 `data/city/sites.json` 庭院一行的 `court` 块里，系统代码里没有地图、地点或建筑 ID。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 从关着的门进入：玩家站在当前地图（按旗标算出的实时地图）上某格门地块的可及距离内，或数据点名的闭合开关、带标签的地点旁；冷却按游戏分钟写在数据里，现值 0 | `src/systems/city/court.ts`（`enterCourt`、`atCourtDoor`、`courtCooldownLeft`）；`src/systems/city/court_tiers.ts`（`doorWithinReach`）；`court.door` | 一幕 9.2；旅行 5.1 庭院之门一行 |
| 2 | 进出的身份暴露：进门成功后在进门前的位置、出门成功后在出来的位置各发一次 `identity.exposed`（`identity_door`） | `court.ts` 的 `enterCourt`、`leaveCourt` | PK-M1-56 进度第 3 节请求 4；内置 AI 5.6 |
| 3 | 储物：实例记录与堆叠限定字段整件往返；库容上限按扩建档；死亡遗落只取背包 | `court.ts` 的 `deposit`、`withdraw`；`common.ts` 的 `storageCap` 读扩建档 | 城建 2.2 仓库一行；城建目录 4.2 `bld_court_store` |
| 4 | 陈列：陈列位按档（初开架 3，扩建一档加柜 6）；陈列中的物由陈列持有者持有（`court.displayOwner`），不能用、不能卖、不算开门的物钥；取下等一日后收进庭院库房；带 `tainted` 的件数只进视图 | `src/systems/city/court_display.ts`（命令 `city.display_put`、`city.display_take`，整点结算 `settleDisplay`）；`src/systems/city/court_view.ts`（查询 `courtView`） | 遗物目录 1.7 第 1、2、5 条；城建目录 4.1 陈列位一列 |
| 5 | 园圃：每圃每日 `herb` 2、`grain` 2，不受修正项影响（已有）；圃数上限按档（初开 3、扩建一档 5） | `placement.ts` 的上限读 `buildingCap`；`court.tiers[].buildingMax` | 城建 2.2；城建目录 4.2 `bld_court_garden` |
| 6 | 扩建一档：`feature.court_expansion_1` 为真时庭院进入"仓廪"档：柜 6、园圃 5、小仓库二级 1,200 | `court.tiers` 第二档 | 城建目录 4.1、4.2；千门 13；PK-M1-32 进度第 3 节 |
| 7 | 数据校验与旧存档：`court` 块的校验接进城建 pack；城建切片的新字段可缺省；陈列条目的物品 ID 进改名表 | `court_tiers.ts` 的 `courtConfigProblems`；`src/content/packs/city.ts`；城建系统的 `idFields` | 发行工程 5.5、7.4 |
| 8 | 测试 | `tests/court.test.ts`（新增）；`tests/city.test.ts`（门扉节点一例先站到门前） | 计划包行的验收 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 扩建二档到五档（兵器架、书斋、秘仓、无名祠、调度室）、各陈列位的收物规则、庭井与庭材、庭格与门息、受邀者 | PK-M2-06 |
| 2 | 庭院窗口、陈列界面、进门按钮按"门前"置灰 | 客户端（`progress.md` 第 3 节请求 1） |
| 3 | 带澱之物让庭院淤积、拖慢门中淤塞的恢复（遗物目录 1.7 第 2 条的效果本身） | 千门与澱病（请求 4） |
| 4 | 战斗中进门的拒绝 | 待用户定（第 4 节第 3 条）与整合接线（请求 2） |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| [act1_borderstone.md](../../30_story/arcs/act1_borderstone.md) 第 9.2 节 | "在任意一扇关着的门前推门进入庭院（有冷却）" |
| [travel_and_exploration.md](../../40_design/systems/travel_and_exploration.md) 第 5.1 节 | 庭院之门一行：冷却、随行、目击 |
| [city_building.md](../../40_design/systems/city_building.md) 第 2.1 到 2.7 节 | 庭院的功能、扩展与数据对象 |
| [catalog_buildings_city.md](../../40_design/content/catalog_buildings_city.md) 第 4.1、4.2 节 | 扩建总表与庭院设施 |
| [catalog_relics_lore.md](../../40_design/content/catalog_relics_lore.md) 第 1.7 节 | 陈列位与九条规则 |
| [thousand_doors.md](../../40_design/systems/thousand_doors.md) 第 13 节 | 庭院扩建档表 |
| [pk_m1_56_door_readers](../pk_m1_56_door_readers/progress.md) 第 3 节请求 4 | 身份暴露的事件形状 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 跨系统 | 城建只导入 world、inventory 与 core；战斗状态不直接读 | `tests/architecture.test.ts` |
| 无内容 ID | 门、陈列持有者、档位、园圃上限与仓库容量都从数据读 | `tests/content_id_guard.test.ts` |
| 文本 | 新的玩家可见文字只经 `tr()` 键，放 `locales/zh-Hans/sys_city.json` | `node tools/i18n/check.ts` |
| 旧存档 | 城建切片 `court` 的新字段 `lastEnterTick`、`display` 可缺省，读时按空处理 | `tests/court.test.ts` 末条 |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/city/court_tiers.ts`、`court_display.ts`、`court_view.ts`；`tests/court.test.ts`；本目录 |
| 本包修改 | `src/systems/city/court.ts`；`data/city/sites.json`（庭院一行加 `court` 块）；`data/city/buildings.json`（`court_garden` 的 `max`）；`locales/zh-Hans/sys_city.json`（只加键） |
| 城建内的小改动 | `src/systems/city/index.ts`、`types.ts`、`common.ts`、`daily.ts`、`production.ts`、`placement.ts`；`src/content/packs/city.ts`；`tests/city.test.ts`（逐条见 `progress.md` 第 2 节） |
| 越界的最小改动 | `data/README.md`（`city/` 一行） |
| 工具重生成 | `src/core/text_keys.generated.ts` |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。

## 8. 验证命令

```
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.config.ts tests/court.test.ts tests/city.test.ts tests/doors_keys.test.ts tests/client_feature_labels.test.ts tests/doors_features.test.ts tests/content_id_guard.test.ts tests/save_renames.test.ts tests/save_migration.test.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起会话，只读） | 必派 | 包行、设计文档与请求的覆盖；测试断言是否有区分力 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 查询 `courtView`、`atCourtDoor`、`courtCooldownLeft`；命令 `city.display_put`、`city.display_take`；事件 `city.court_display` | 客户端 | 庭院窗口显示档位、库容、陈列位与条目、园圃上限；进门按钮按 `door.near` 与冷却置灰 |
| 视图字段 `courtView().tainted` | 千门与澱病 | 淤积效果读这个件数 |
| `court` 块的二档到五档 | PK-M2-06 | 在 `court.tiers` 追加档位与陈列位，不改代码 |
