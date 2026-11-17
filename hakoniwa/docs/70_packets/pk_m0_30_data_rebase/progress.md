# PK-M0-30 数据基线重标批次：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施 1 | 跑通内容批次七步（立包、抽取新增灰晶、补全价格与掉落、校验、合入、验证、报告）；补齐人物 ID 别名表；核对并改写 Hoarmane、Moon Cistern 的素材提示词英文代号；新建回归测试；独立子代理审查并修一处文档笔误 | 未提交 | V1 到 V10 绿；20 测试文件 405 测试通过；release 结局回归通过（约 1459 秒）；`npm run typecheck`、`node tools/registry/build.ts --check`、`node tools/i18n/{extract_content,check}.ts` 全绿 | 主会话确认封包，更新计划状态列与 `content_review.md` 的台账状态（已随本次改动一起改） |

## 2. 汇报

### 2026-11-17 实施 1

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `tools/content/mappings/gathering_crafting.ts` | 修改 | 新增 `crystals` 映射（采集 3.7 的四档灰晶）与 `crystalPrice` 解析器 |
| `data/_staging/content_base_rebase_01.json` | 新增后删除 | 暂存文件；合入后按导入 CLI 的约定删除 |
| `data/_batches/content_base_rebase_01.json` | 新增 | 批次机读记录（七步） |
| `data/_staging/index.json` | 修改 | 批次状态登记为 `promoted` |
| `data/combat/items.json` | 修改 | 28 项价格改动；新增 4 档灰晶 |
| `data/combat/monsters.json` | 修改 | 9 只魔物的 `loot` 改动 |
| `data/economy/items.json` | 修改 | `wool` 的 `desc` |
| `data/economy/config.json` | 修改 | `illegalItems` 加四档灰晶 |
| `locales/zh-Hans/content.generated.json` | 重新生成 | `node tools/i18n/extract_content.ts`；5,661 个键 |
| `tools/content/validators/balance.ts` | 修改 | 一行注释措辞更新（价格批次已落地） |
| `tools/content/names/known_works.json` | 修改 | 加入 `Dragonspine`、`Greymane`、`Moonwell` 防回潮 |
| `assets/prompts/specs/buildings.json`、`icons_equipment.json`、`icons_units.json`、`props.json`、`units.json` | 修改 | 8 处英文提示词改写为 Hoarmane、Moon Cistern；`art_doll_held_shiya_greymane_longbow` 与 `art_ico_item_eq_shiya_greymane_longbow` 统一拼法为"grey-mane" |
| `docs/40_design/content/content_review.md` | 修改 | 第 0、1、9.1、9.3 节：C45、C46、C91 从"数据导入批次"改为"已解决"，新增三行落点；台账状态统计改数 |
| `docs/40_design/content/content_bible.md` | 修改 | 第 4.3、14 节措辞改为指向已落地的批次 |
| `docs/40_design/content/catalog_equipment.md` | 修改 | 第 3.9 节去掉"原 value"列，改"定价（铜）"；`black_ridge_mantle` 来源改"保底" |
| `docs/40_design/content/catalog_consumables_magitools.md` | 修改 | 第 1.3、1.4 节的数据侧价格括号改为新值；第 10 节第 2 条措辞 |
| `docs/40_design/content/catalog_gathering_crafting.md` | 修改 | `drake_scale`、`dian_shard` 的价格括号改为新值；第 10 节第 4 条措辞 |
| `docs/40_design/content/catalog_bestiary.md` | 修改 | 第 1.3、3、12.2 节措辞；`sewer_sludge`、`drowned`、`faceless_king` 等级与掉落说明更新 |
| `docs/40_design/content/catalog_dungeons_bosses.md` | 修改 | `faceless_king` 等级说明改为指向成长与节奏 18.2 节 |
| `docs/40_design/world_state_registry.md` | 修改 | 第 11 节删去已解决的 C91 行 |
| `docs/50_tech/implementation_conventions.md` | 修改 | 第 3 节人物 ID 别名表补 4 行 |
| `docs/60_production/slice_gap_audit.md` | 修改 | 删去已解决的 `ash_cleaver` 价格冲突行 |
| `docs/60_production/development_plan.md` | 修改 | PK-M0-30 行把 C91 的改名目标由误写的 `a3_vow_taken` 改为 `a3_vow_kept_reed_bridge`（审查发现并修） |
| `tests/content_base_rebase.test.ts` | 新增 | 价格、掉落、门标记迁移、剩余条目的回归测试 |
| `docs/70_packets/pk_m0_30_data_rebase/` | 新增 | `README.md`、`batch_card.md`、`batch_report.md`、`verification_matrix.md`、本文件 |

**验收逐条结果**

| 验收序号（`verification_matrix.md` 第 1 节） | 状态 | 命令与输出要点 |
| --- | --- | --- |
| 1 | PASS | `tests/content_base_rebase.test.ts`：12 测试通过；`tests/economy.test.ts` 随 20 文件套件通过 |
| 2 | PASS | `node tools/content/validate.ts --warnings`：`all validators green` |
| 3 | PASS | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts`：`Tests 1 passed` |
| 4 | PASS | `batch_report.md` 第 1 到 3 节 |

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| `catalog_equipment.md`、`catalog_consumables_magitools.md`、`catalog_gathering_crafting.md` 的价格定值表 | 叙述性定价说明，不是可机读抽取的逐行记录 | 只给新增的四档灰晶建立可复用的导入映射（`gathering.crystals`），其余 28 处价格与 9 处掉落改动作为"manual"来源、手填的局部记录（id 加改动字段）记进批次的 parts | `release_engineering.md` 7.1"抽不出的列留给作者手填，不猜"；这些目录的表格本身是价格公式应用的叙述，不是逐行模板 | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `docs/60_production/development_plan.md` 第 186 行（PK-M0-30 行） | 本行是我自己包的计划行，指令允许改设计文档的裁决要求的部分；独立审查发现行内把 C91 的改名目标写错（`a3_vow_taken` 应为 `a3_vow_kept_reed_bridge`），不是范围变化，是笔误修正 | 本包；主会话可复核 | 已改并已告知 |

**留给后续包的事项**

| 事项 | 建议去处（包编号、项目状态缺口、风险编号） |
| --- | --- |
| `faceless_king` 的 `hpMult`、`dmgMult` 定稿（当前沿用 3 / 0.6） | PK-M1-42（PK-M0-29 已定） |
| 誓光之门以外、迷宫与首领目录管的首领与迷宫之主掉落（`crystal_mother`、`dian_colossus`、`crystal_centipede`、`faceless_king`） | 迷宫与首领目录批次（M2） |
| 信使、澄流、聆灵、立国、终门的门钥重写（C88、C89） | M2 批次（见发行工程 7.2 节） |
| V6 校验器不识别 `dian_shard` 与四档灰晶的价格带形状（既有缺口，本批次测试已用硬编译值兜底） | 数据层或 V6 校验器的后续改动，无阻塞 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 无 | | |

**需用户决定**

| 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- |
| 无 | | |

**下一步与恢复方式**

1. 主会话汇总本轮并行代理的改动后，统一运行 `npm run gate` 与完整 `npm run playthrough`；确认后把计划第 4 节的
   PK-M0-30 状态列由"进行中"改为"已完成"，并在 `docs/60_production/progress_log.md` 追加一行。
2. 若要恢复或复查本批次：先读本文件与 `verification_matrix.md`，再看 `data/_batches/content_base_rebase_01.json`
   的七步记录；`tests/content_base_rebase.test.ts` 是唯一的回归入口。
