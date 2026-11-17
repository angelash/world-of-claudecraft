# PK-M1-26 自有技能编号与第一幕技能（别名：RE-27、`content_act1_abilities_01`）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-26` 自有技能编号与第一幕技能 |
| 状态 | 进行中（实施与验证已完成，待主会话确认封包） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-26` |
| 形态 | 内容批次包，兼全仓屏障提交（计划第 6.1 节 M1 行："技能改名是全仓的屏障提交"） |
| 工作流 | 数据 |
| 量级 | 2 代理人日，0.3 用户人日 |
| 依赖 | PK-M0-02 技能目录（已完成）、PK-M0-28 内容管线（已完成）；用到 PK-M0-18 的重命名表与迁移（已完成） |
| 别名 | RE-27（[发行工程][rel]第 13.8、17 节）、内容批次 `content_act1_abilities_01`（发行工程第 7.2 节） |
| 立项日期 | 2026-11-17 |

## 1. 目标

两份战斗数据 `data/combat/abilities.json`、`auras.json` 的全部 ID 与每一处引用都换成[技能目录][abl]的 `sk_`、`aur_` 自有编号，
旧 ID 登记进重命名表，旧存档读档后只见新 ID；第一幕所需而数据里没有的两条设计条目先写进目录再导入：V3 无前缀 ID 零命中，
V10 主工程技能显示名零命中，通关回归通过。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 补两条第一幕设计条目：余烬门守套的装备光环 `aur_ember_door`；渊契之门第一幕版本的契约魔巨像残意 `fiend_colossus_remnant`（模板、两项技能、召唤技能、血契代价） | [技能目录][abl]第 3.3、4.5 节；[门目录][doors]第 2.1 节第 24 行补召唤技能 | [装备][eqp]第 5.1 节与第 11.2 节第 4 条；[战斗][cmb]第 6.5.8、12.3 节；[生灵][cre]第 11 节 |
| 2 | 123 个技能、84 个光环换号，显示名按目录"新名"栏（2 个技能、9 个光环改名） | `data/combat/abilities.json`、`auras.json` | [技能目录][abl]第 2、3、7 节 |
| 3 | 全部引用处换号 | `data/combat/classes.json`、`items.json`、`monsters.json`、`data/doors/doors.json`、`data/party/companions.json`（`avoid`）；`src/systems/combat/abilities.ts`、`presence.ts`、`death.ts`、`src/systems/party/ai.ts`、`src/game/autoplay/player.ts`；素材提示词库的 `ref`（`assets/prompts/specs/audio_sfx.json`、`vfx.json`）；相关测试 | 同上 |
| 4 | 重命名表第 2 版：207 条 `ability`、`aura` 改名；事件环里这两类 ID 只在登记的字段改名（`eventFields`）；战斗系统登记切片里的 ID 字段（`idFields`） | `data/registry/renames.json`；`src/core/save/renames.ts`（`EventField`、`RenameSet.eventId`）；`src/systems/combat/id_fields.ts` | [发行工程][rel]第 5.5、7.6、10.4 节 |
| 5 | 导入批次 `content_act1_abilities_01`：`aur_ember_door`、`aur_st_downed_weak`、`fiend_colossus_remnant`、`sk_lok_summonremnant`、`sk_mon_remnantbar`、`sk_mon_remnantquake`；渊契之门授予召唤技能；同伴倒地起身改挂 `aur_st_downed_weak` | `tools/content/mappings/abilities_talents.ts`；`data/_batches/content_act1_abilities_01.json`；`data/doors/doors.json`；`src/systems/party/ai.ts` | [发行工程][rel]第 7.3 节；[战斗][cmb]第 15.2 节 |
| 6 | 校验收紧：V3 把 `abilities`、`auras` 列为严格表，`fiend_` 可进 `monsters`；V2 补同伴 `avoid`、魔物 `onHit` 与阶段光环三条引用；清掉已改名的命名空间遗留与 V10 已审例外 | `tools/content/validators/namespace.ts`、`namespace_legacy.json`、`names_reviewed.json`；`src/content/references.ts` | [发行工程][rel]第 7.4 节 |
| 7 | 生成物重生成；回归与迁移测试；存档金样重定 | `locales/zh-Hans/content.generated.json`；`tests/own_ability_ids.test.ts`、`tests/save_migration.test.ts`、`tests/save_renames.test.ts`、`tests/fixtures/saves/manifest.json` | [发行工程][rel]第 10.4 节 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 按标准量 `S(L)` 重算技能数值；状态光环按战斗文档各节重写数值（复苏门疲、泉畔之代价） | PK-M1-11（战斗规则扩展）、PK-M1-42（M1 平衡回归），目录第 1 节已改写 |
| 2 | 其余 15 个 `aur_st_*` 的数据行（威压·出手迟疑、失衡、硬狂暴、澱病三阶、伤病五类、醉意、药毒、失信、逆泉印记） | 随施加它们的系统落地，目录第 7.7 节逐个写明去处 |
| 3 | 巨像残意的血契代价 `aur_lok_remnantpact` 与"在封门遗迹附近不听命令"的习性 | PK-M1-11（内核还没有生命上限百分比修正与随召唤物在场的挂载） |
| 4 | 战场英雄技能 `sk_bf_` 编号（`data/warfare/abilities.json` 的 `charge`、`cleave` 等是 `hero_abilities` 表，不是战斗技能） | PK-M2-08、PK-M2-36；本包只把 `firestorm` 的显示名"烈焰风暴"改为"焚阵"以满足 V10 |
| 5 | 设计文档里引用旧 ID 的地方（门目录、战斗文档、图鉴等） | 技能目录第 2、3 节即对照表；各目录下次修订时顺手换号 |
| 6 | 第一幕天赋 `tal_` | 第一幕没有天赋条目（编外者无铭纹，同伴铭纹全表在 PK-M2-36） |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则 |
| [技能目录][abl]第 1 到 4.5、7 节 | 对照表、导入条目、状态光环去处 |
| [发行工程][rel]第 5.5、7.3、7.4、10.4、13.8 节 | 重命名表、批次流程、校验层、迁移测试、RE-27 |
| `src/core/save/renames.ts`、`data/registry/renames.json` | 改名的读档迁移与事件环规则 |
| `src/systems/combat/id_fields.ts` | 战斗切片里存放内容 ID 的字段 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 行为不变 | 只换编号与目录改定的显示名，数值原样；新增只在导入条目与同伴起身的光环 | 通关回归、`tests/combat.test.ts`、`tests/party.test.ts` |
| 存档 | 旧存档读档后新 ID 零残留；事件环里拼写相同的普通词不动 | `tests/own_ability_ids.test.ts`、`tests/save_migration.test.ts`、`tests/save_renames.test.ts` |
| 一个 ID 一个主人 | 新 ID 都在目录里有且只有一条定义行 | V3、`tests/own_ability_ids.test.ts` |
| 禁用字符与格式 | 文档与数据无禁用字符；改过的 TS 与 JSON 用 `npm run format` | Stop 钩子、Biome |

## 6. 文件范围

见第 2 节落点与 `progress.md` 的改动文件表。不得修改：`src/systems/disputes/`、`src/systems/guild/`、`src/client/hud/`、`src/client/audio/`、
编辑器与素材工具（并行的其他包与第三方在改）。

## 7. 停止条件

dev_process 第 3.6 节全部适用。本包特有：目录对照表与数据对不上（新旧 ID 数不等、重名）时停下回目录核对，不猜。

## 8. 验证命令

```
npx vitest run --config vitest.config.ts tests/own_ability_ids.test.ts tests/save_renames.test.ts tests/save_migration.test.ts tests/content_validation.test.ts
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npm run typecheck
npm test
npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts tests/playthrough/rule_merca.playthrough.test.ts tests/playthrough/act1_minimal.playthrough.test.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 总闸 | 必派 | 一次贡献结束 |
| 新起会话的差异审查 | 必派 | 屏障提交：全仓改名的覆盖与迁移正确性 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 数据、代码、测试、目录条目、批次记录与报告、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；按 `progress.md` 的文件清单提交 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 目录第 1 节原写"重算与自有编号替换同批落地，归 PK-M1-26" | 本包只换号不重算，重算转 PK-M1-11 与 PK-M1-42（推荐：换号是全仓屏障，混入数值改动会让回归无法区分两种变化）；或另立一个数值批次 | 不阻塞 |

[rel]: ../../50_tech/release_engineering.md
[abl]: ../../40_design/content/catalog_abilities_talents.md
[doors]: ../../40_design/content/catalog_doors.md
[eqp]: ../../40_design/content/catalog_equipment.md
[cmb]: ../../40_design/systems/combat_and_classes.md
[cre]: ../../40_design/content/catalog_creatures_mounts.md
