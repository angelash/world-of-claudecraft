# PK-M0-30 数据基线重标批次（别名：`content_base_rebase_01`）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M0-30` 数据基线重标批次 |
| 状态 | 进行中（实施与验证已完成，待主会话确认封包） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.1 节 `PK-M0-30` |
| 形态 | 内容批次包（2 代理人日） |
| 工作流 | 数据 |
| 量级 | 2 代理人日，0.5 用户人日 |
| 依赖 | PK-M0-28（已完成） |
| 别名 | `content_base_rebase_01` |
| 立项日期 | 2026-11-17 |

## 1. 目标

内容批次 `content_base_rebase_01` 落地后，已有数据的价格、掉落与一枚标记名都与总纲、各目录和注册表一致：经济校验、
内容校验器 V1 到 V10、存档重命名测试与一条结局回归全部通过，批次报告列出全部改动 ID。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | C45：已有装备、消耗品与材料按价格公式重标 | `data/combat/items.json`、`data/economy/items.json` | [装备 3.9][eq]、[消耗品 1.4][cs]、[采集 3.4、3.5、3.7、3.9][gat]、[总纲 6.4][bible] |
| 2 | 新增四档未净炼灰晶（`crystal_small_raw` 到 `crystal_king_raw`） | `data/combat/items.json`；`tools/content/mappings/gathering_crafting.ts` 新增 `crystals` 映射 | [采集 3.7][gat] |
| 3 | C46：整个等级区间在 10 级以上、归本文（图鉴）管的魔物改掉本阶澱晶；黑脊按异名者规则保底并升一档 | `data/combat/monsters.json` | [图鉴 1.3、2.5 到 2.7、第 5 节][bes]、[总纲 5.4][bible] |
| 4 | 未净炼灰晶列入违法品，自动玩家不卖 | `data/economy/config.json` 的 `illegalItems` | [采集 3.7][gat]（D-040） |
| 5 | C91：誓光之门的钥改读规范名，旧键登记重命名 | `data/doors/doors.json`（已是规范名）；[注册表][reg]第 7.2、8.3、11 节 | 台账 C91；[注册表][reg] |
| 6 | C40、C41：`spring_herb` 标签、`wool` 描述 | `data/combat/items.json`、`data/economy/items.json` | 台账 C40、C41 |
| 7 | X16、C30：`dian_dreg` 显示名核对；`faceless_king` 等级与同步偏移核对（不改倍率） | `data/combat/monsters.json` | 台账 X16；[成长与节奏][pp]第 18.2 节 |
| 8 | 人物 ID 别名表补全（`martha`、`luchen`、`vick`、`gunnhild_deephammer`） | [实现约定][impl]第 3 节 | 台账 C16 |
| 9 | 替换后的英文代号（Hoarmane、Moon Cistern）在素材提示词库里核对并改写；加入专有名词清单阻止回潮 | `assets/prompts/specs/*.json`、`tools/content/names/known_works.json` | D-075、D-082 |
| 10 | 批次记录与报告 | `data/_batches/content_base_rebase_01.json`、本目录 `batch_card.md`、`batch_report.md` | [发行工程 7.3 节][rel] |
| 11 | 回归测试 | `tests/content_base_rebase.test.ts` | 本包 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 首领与迷宫之主（`crystal_mother`、`dian_colossus`、`crystal_centipede`、`faceless_king`）的掉落 | 迷宫与首领目录批次（M2） |
| 2 | C88、C89（信使、澄流、聆灵、立国、终门的门钥重写） | M2 批次（见[发行工程 7.2 节][rel]） |
| 3 | `faceless_king` 的生命与伤害倍率（仍沿用 3 / 0.6） | PK-M1-42（PK-M0-29 已定） |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、目录分工 |
| [content_review.md][review] 第 9.1 节（C45、C46、C91）与第 1 节对应行 | 本批次的裁决 |
| [release_engineering.md][rel] 第 7 节 | 内容管线七步与校验层 |
| `tools/content/README` 同等内容（模块注释） | 导入 CLI 命令 |
| `data/_batches/content_act1_items_01.json`、`content_base_progression_01.json` | 既有批次记录的写法 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 旧存档 | 任何改名的变量都登记进重命名表并带迁移测试 | `tests/save_renames.test.ts`、`tests/content_base_rebase.test.ts` |
| 已有正典 | 不动 `faceless_king` 的生命与伤害倍率（PK-M0-29 的结论） | `tests/progression.test.ts`、本包测试 |
| 数据层不出现中文枚举值、别名 | 新字段只写规范名 | V3、V4 校验 |
| 禁用字符 | 破折号、emoji、U+2600 到 U+27BF | `.claude/hooks/qa-stop.sh`、`tests/docs_guard.test.ts` |
| 格式 | 改过的 TS 与 JSON 用 `npm run format -- <文件>`；不格式化 markdown | 本包命令记录 |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `data/_batches/content_base_rebase_01.json`、`tests/content_base_rebase.test.ts`、本目录 |
| 本包修改 | `data/combat/items.json`、`data/combat/monsters.json`、`data/economy/items.json`、`data/economy/config.json`、`data/_staging/index.json`、`locales/zh-Hans/content.generated.json`、`tools/content/mappings/gathering_crafting.ts`、`tools/content/validators/balance.ts`（一行注释）、`tools/content/names/known_works.json`、`assets/prompts/specs/{buildings,icons_equipment,icons_units,props,units}.json`、`docs/40_design/content/{content_review,content_bible,catalog_equipment,catalog_consumables_magitools,catalog_gathering_crafting,catalog_bestiary,catalog_dungeons_bosses}.md`、`docs/40_design/world_state_registry.md`、`docs/50_tech/implementation_conventions.md`、`docs/60_production/{development_plan,slice_gap_audit}.md` |
| 不得修改 | `src/`、`server/`、其余代理在本轮负责的系统文件、`tools/assets/core/anchor.ts`、`meta.ts`（另一代理的未提交改动） |

## 7. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。本包特有：

| 序 | 条件 | 做法 |
| --- | --- | --- |
| 1 | 重标价格或掉落改变了既有结局路线的通过性 | 停下，核对自动玩家的保留物与门钥逻辑，写进 `progress.md` |
| 2 | 世界哈希在价格重标批次之外发生变化 | 记录为预期（价格改动本就会变哈希），在报告里写明；若变化范围超出本批次改动的字段，停下定位 |

## 8. 验证命令

在 `hakoniwa/` 下运行：

```
node tools/content/validate.ts --warnings
node tools/registry/build.ts --check
node tools/i18n/extract_content.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.config.ts tests/content_base_rebase.test.ts tests/economy.test.ts \
  tests/save_renames.test.ts tests/save_migration.test.ts tests/content_validation.test.ts \
  tests/i18n_ui_strings.test.ts tests/combat.test.ts tests/quests.test.ts tests/doors.test.ts
npm run typecheck
npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 总闸（`qa-checklist`） | 必派 | 一次贡献结束 |
| `content-obligations-reviewer` | 不适用（本批次不新增内容记录，只重标已有数据，世界哈希变化已预期） | 无新增 ID 需要補 Deeds、Reliquary 或 wiki |
| 新起会话的通用读diff审查 | 已执行 | 见 `verification_matrix.md` 第 3 节 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 批次记录 `data/_batches/content_base_rebase_01.json` | 主会话、编辑器批次视图 | 批次状态 `promoted`，`validation.ok` 为真 |
| 代码、测试、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；`node tools/content/validate.ts` 绿 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 无 | | |

[eq]: ../../40_design/content/catalog_equipment.md
[cs]: ../../40_design/content/catalog_consumables_magitools.md
[gat]: ../../40_design/content/catalog_gathering_crafting.md
[bes]: ../../40_design/content/catalog_bestiary.md
[bible]: ../../40_design/content/content_bible.md
[review]: ../../40_design/content/content_review.md
[reg]: ../../40_design/world_state_registry.md
[impl]: ../../50_tech/implementation_conventions.md
[pp]: ../../40_design/progression_and_pacing.md
[rel]: ../../50_tech/release_engineering.md
