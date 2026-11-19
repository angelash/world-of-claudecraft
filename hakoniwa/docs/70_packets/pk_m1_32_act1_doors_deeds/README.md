# PK-M1-32 第一幕门与事迹（别名：`content_act1_doors_01`、`content_act1_deeds_01`）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-32` 第一幕门与事迹 |
| 状态 | 进行中（数据已落地，遗留与待决见 `progress.md`） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-32` |
| 形态 | 内容批次包，三件套 |
| 工作流 | 内容 |
| 量级 | 3 代理人日，0.5 用户人日 |
| 依赖 | PK-M1-14（已完成，千门第一批）；PK-M1-48（已完成，事迹、称号、图鉴与传书内核）；PK-M1-49（已完成，`gather.done` 与 `craft.done` 的发出方） |
| 立项日期 | 2026-11-19 |

## 1. 目标

把门目录第一幕的门补齐到 18 扇（序章的前世之门另算），带千门第 21.1 节的段、翼、松动、门阶值与失灵字段；把事迹目录第一幕的事迹与称号导入事迹内核；
生业之门的计数钥接上生业内核的事件；`deed_col_earth_keepsakes` 从序章起计数。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 七扇第一幕生业之门：掘脉、樵伐、撷草、炼剂、庖厨、鞣革、锻兵（师傅钥加计数钥，单人师傅带替钥） | `data/doors/doors.json`（追加） | 门目录 5.6、6；千门 14 |
| 2 | 仓廪之门（庭院扩建一档） | 同上 | 门目录 5.5；千门 13 |
| 3 | 瑕之门（真相，灰廊） | 同上 | 门目录 5.2、6；台账 M01 |
| 4 | 千门的计数事件加 `gather.done`、`craft.done`、`party.recovered`；`count` 钥可按事件的件数累加（`sum`） | `src/systems/doors/{types,keys}.ts`、`src/content/packs/doors.ts` | 千门 5.1 计数原语；门目录 5.6 |
| 4a | 正典门读事迹作历钥：观澜、契约、刃之门；刃之门的甲壳钥另认 A1-S02 的剑钥，改为四取二 | `data/doors/doors.json` | 事迹目录 2.7；门目录 2.1 |
| 5 | 第一幕事迹 31 条、称号 7 个（加原有的 8 条与 3 个） | `data/records/deeds.json`、`titles.json` | 事迹目录 3.1 到 3.13、4 |
| 6 | 新功能的标签与注册 | `locales/zh-Hans/ui.json`（9 个 `ui.common.feature.*`）；`docs/40_design/world_state_registry.md` 的 `feature.<功能>` 一行（工具重生成 `data/registry/vars.json`） | 实现约定 8；注册表 9.2 |
| 7 | 测试 | `tests/doors_act1.test.ts`（新增）；`tests/doors.test.ts`、`tests/records_save.test.ts`（改） | 计划包行的验收 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 生业之门开门后真正改变生业层（现在层仍按幕给，见 PK-M1-49 的待决第 2 条）；第三扇起松动加倍 | PK-M2-13（千门第二批，生业之门的层） |
| 2 | 庖厨之门的"让朵拉吃完"、仓廪之门的"备足两百份木材"两把门钥的写入（`door_key.<门>.<钥>` 由任务写） | PK-M1-33（任务数据） |
| 3 | 纹感 `doorsense` 与庭院扩建一档 `court_expansion_1` 两个功能的运行时效果 | PK-M1-56（门效果读取方）、PK-M1-53（庭院） |
| 4 | 事迹的 `belief`、`witness`、`rumorReach` 读取方 | PK-M1-48 之后的"事迹的认知触发与立名"包 |
| 5 | 收藏系统（`col.<收藏>.done` 的写入方） | 遗物与收藏批次 |
| 6 | 成就表的生成 | PK-M2-02 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| [thousand_doors.md](../../40_design/systems/thousand_doors.md) 第 2、4.2、5、13、14、17、21 节 | 门的字段、门阶值、计数钥、开门节奏与校验 |
| [catalog_doors.md](../../40_design/content/catalog_doors.md) 第 5.2、5.5、5.6、6 节 | 九扇新门的钥与效果 |
| [catalog_deeds_titles.md](../../40_design/content/catalog_deeds_titles.md) 第 1、3、4 节 | 事迹与称号的字段、触发与幕 |
| [pk_m1_48_records_kernel](../pk_m1_48_records_kernel/progress.md) | 触发种类到数据字段的映射 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 千门 21.6 八条 | 段翼松动失灵齐全；钥读的变量已登记；单人钥有替钥；物钥不是商品；主线门无阶钥；D-023；互斥；门阶曲线 | `validateDoors`（`tests/doors_act1.test.ts` 第 1 条） |
| 事迹只记名 | 事迹与称号只有约定字段，不带数值 | `validateRecords` |
| 文本 | 第一幕文本不泄露真相、用 D-030 俗称、不出现第六司名 | `node tools/content/validate.ts`（V5、V8、V10） |
| 旧门不动 | 门数据只追加；`boss.seg_oneeye_duel.defeated`（PK-M1-30）保留 | `git diff data/doors/doors.json` 只有新增行 |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `tests/doors_act1.test.ts`、本目录 |
| 本包修改 | `data/doors/doors.json`（追加 9 扇，改 3 扇正典门的钥）、`data/records/deeds.json`、`data/records/titles.json`、`src/systems/doors/{types,keys}.ts`、`src/content/packs/doors.ts` |
| 越界的最小改动 | `locales/zh-Hans/ui.json`（9 个功能标签）、`docs/40_design/world_state_registry.md`（`feature.<功能>` 一行补取值）、`tests/doors.test.ts`（两把待任务写的门钥）、`tests/records_save.test.ts`（冻结存档的事迹与称号清单） |
| 工具重生成 | `data/registry/vars.json`、`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。

## 8. 验证命令

```
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.config.ts tests/doors_act1.test.ts tests/doors.test.ts tests/doors_keys.test.ts tests/doors_validation.test.ts tests/doors_features.test.ts tests/doors_hints.test.ts tests/doors_rank_seal.test.ts tests/doors_costs.test.ts tests/doors_exclusive.test.ts tests/records.test.ts tests/records_save.test.ts tests/client_feature_labels.test.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起会话，只读） | 必派 | 包行与目录的覆盖、门钥的可达性 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 两把待写门钥 `door_key.craft_cooking.dora_dish`、`door_key.garden_granary.timber` | PK-M1-33 | 任务写入后从 `tests/doors.test.ts` 的待写名单里删掉 |
| 功能 `doorsense`、`court_expansion_1`、`craft_<生业>` | PK-M1-56、PK-M1-53、PK-M2-13 | 读取方接上 |
| 23 条只能显式授予的事迹 | 各场景、任务与认知包 | 在结算点调 `records.deed.grant` |
