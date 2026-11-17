# PK-M1-13 物品实例层与耐久：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（本包验收全过；遗留见 `progress.md`） |
| 末次代码或内容变更 | 未提交；改动文件见 `progress.md` 2026-11-17 汇报 |
| 完整实跑 | 2026-11-17，工作区状态（其他代理的未提交改动同在） |
| 审查 | 覆盖性复查（新起会话）：2 条 BLOCKING、17 条 SHOULD-FIX 与若干 NIT，处理见第 3 节 |
| 遗留 | 见 `progress.md` 的"留给后续包的事项" |

## 1. 验收条目

| 序 | 验收 | 命令或评审 | 结果（原样要点与量化数字） | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 实例往返：实例记录（耐久、署名、来历、限定堆叠格）存档写出再读入，世界哈希不变，续跑一致 | `npx vitest run --config vitest.config.ts tests/inventory_instances.test.ts` 的"round-trips instances through a save" | 通过；哈希逐字节一致，续跑 10 tick 后一致 | `tests/inventory_instances.test.ts` | PASS |
| 2 | 迁移：冻结存档（`tests/fixtures/saves/` 全部样本）带上库存的存档校验与改名字段后仍得到金样哈希；第一个 tick 补建实例，件数不变、每件一条记录、穿戴位对上、切片校验干净；补建后的世界存档往返不变 | `npx vitest run --config vitest.config.ts tests/inventory_save.test.ts` | `Tests 10 passed (10)`；金样未改（新旧值相同，无需重录） | `tests/inventory_save.test.ts` | PASS |
| 3 | 迁移链与冻结金样不变 | `npx vitest run --config vitest.config.ts tests/save_migration.test.ts` | 通过（含每个样本续跑 2000 tick） | 同上 | PASS |
| 4 | 改名表：物品改名落到件数、装备位、实例与堆叠格；删除的物品按补偿折钱，旧存档仍能通过校验，扫过后残留记录清除 | `tests/inventory_instances.test.ts` 的两条改名用例 | 通过 | 同上 | PASS |
| 5 | 耐久单测：按品质的上限与深相；死亡扣上限 10%、不低于 0、只扣已装备件；20% 提示与归零事件；归零件不计属性、武器、套组与触发；劣品碎成材料；名器在认可者手里不磨损；一场战斗 1 点与澱度对金属、骨角、软料的系数 | `tests/inventory_instances.test.ts` 的 durability 与 pinned 组 | 通过 | 同上 | PASS |
| 6 | 修理单测：报价（器价乘 0.2 乘损失比例）与精品主料；谁能修（普通、技能 75、名匠、原匠人）；钱或材料不够时不改任何状态；铁匠的修理选项与报价；玩家自己的修理命令只在铁匠身旁、按普通铁匠、自付；野外修理包的阶与品质限制 | 同上 repair 与 smith service 组 | 通过 | 同上 | PASS |
| 7 | `procs`：语法、固定顺序（主手到信物，件自身、附纹，再套组）、只在有对应触发点时抽随机、内部冷却到 tick 为止、条件、不连锁（`kill` 照常）、归零件不触发、器痕 | 同上 triggers 组 | 通过 | 同上 | PASS |
| 8 | 冷却组：药水 120 秒与投掷 30 秒在长度减 1 时仍拒绝、到点放行；包扎按被包扎者 60 秒；符各自冷却；澱药提前服用照吃、带 `early`、不重置计时 | 同上 cooldown 组 | 通过 | 同上 | PASS |
| 9 | 生业上限 150，六层各 25 点 | 同上 | 通过 | 同上 | PASS |
| 10 | 本包两份测试合计 | `npx vitest run --config vitest.config.ts tests/inventory_instances.test.ts tests/inventory_save.test.ts` | `Tests 57 passed (57)`（47 加 10） | 同上 | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 本包文件零错误；其余错误在 `src/systems/npc/brain/`、`src/systems/ailments/`、`src/content/packs/ailments.ts`（其他代理进行中） | PASS（本包） |
| 相关套件 | 28 个文件：本包两份、`economy`、`city`、`city_autonomy_bonus`、`records`、`records_save`、`save_migration`、`save_container`、`save_recovery`、`save_renames`、`save_versions`、`save_ironman`、`replay_segments`、`architecture`、`content_id_guard`、两个 i18n 守卫、`docs_guard`、`party`、`doors`、`quests`、`combat`、`core`、`content_validation`、`dialogue`、`client_windows`、`time_skip` | 是 | `Tests 486 passed`，10 个失败全部是基线问题（第 4 节） | PASS（本包） |
| 内容校验 | `node tools/content/validate.ts` | 是 | V1、V2、V3 绿（新表 `itemSets`、`enchants` 已登记命名空间）；V4 的 17 个错误是 `npcBrain` 的未登记变量（第 4 节） | PASS（本包） |
| 变量注册表 | `node tools/registry/build.ts --check` | 是 | 本包未新增变量；唯一失败是 `src/client/audio/audio_world.ts` 的 `tension_high` 别名（第 4 节） | PASS（本包） |
| 文本检查 | `node tools/i18n/check.ts` | 是 | 本包新增 `sys.inventory.*` 键无缺失、无无用；5 个发现全在 `src/systems/npc/brain/`（第 4 节） | PASS（本包） |
| 文档守卫 | `tests/docs_guard.test.ts` | 是 | 通过 | PASS |
| 改动文件格式 | `npm run format -- <改动的 TS 与 JSON>` 后 `biome check` | 是 | 零错误、零格式差异 | PASS |
| 无模型通关 | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts` | 是 | `Test Files 2 passed (2)`、`Tests 2 passed (2)`，736 秒 | PASS |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 覆盖性复查（新起会话，只读） | 一次贡献结束 | 首轮 FAIL；修复后本表第 1 节全部重跑 | 2 | 17 | BLOCKING 两条已修：改名表删除物品后堆叠格的校验放宽并在下次扫描时清除；城建存取与商会调拨改为整件搬运（战斗遗落包排除实例物转 PK-M1-11）。SHOULD-FIX 已修：残留记录的重扫（物品规则指纹）、实例里的附纹与人物 ID 登记改名字段、实际属性带实例的澱纹档、名器补记持有者、包扎计时记在被包扎者身上、澱药提前服用、玩家修理命令的信任边界、重装时选可用件、非实例物占位时清旧实例、定义变化时双向对账、测试钉死长度与门槛。转后续包：触发的战斗接线、老魔物与澱涌之主的器痕、战斗中禁用、自动玩家修理、按材质的数据标签、匠契的减益（见 `progress.md`） | 本会话 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `tests/content_validation.test.ts`、`tests/core.test.ts` | V4：`npcBrain reactions[*].when` 的变量未登记 | 失败行全在 `npcBrain` 表 | PK-M1-18 |
| `tests/i18n_kernel_guard.test.ts`、`tests/i18n_ui_guard.test.ts` | `ui.json` 的 `ui.mode.creator.row.hairColor` 键形；`sys.npc.*` 缺键 | 文件属客户端与 NPC 大脑 | PK-M1-22、PK-M1-18 |
| `tests/replay_segments.test.ts`、`tests/save_recovery.test.ts` 第 3、4 级、`tests/time_skip.test.ts` T-16 | 从锚点回放或读档续跑的哈希不一致 | 临时探针逐切片比对：只有 `npc` 切片不同，`inventory` 切片逐字节一致（探针已删） | PK-M1-18 |
| `node tools/registry/build.ts --check` | `src/client/audio/audio_world.ts` 第 261 行的别名 `tension_high` | 文件属客户端音频 | PK-M1-06 |
| `npm run typecheck` | `src/systems/npc/brain/`、`src/systems/ailments/`、`src/content/packs/ailments.ts` | 文件属其他包 | PK-M1-18、PK-M1-51 |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 触发效果在战斗里的落地 | 战斗处理 `item.proc` 的代码 | PK-M1-11 |
| 真实物品数据上的耐久与修理节奏（修理支出占钱包 8% 到 12%） | 第一幕装备与修理包数据、自动玩家的修理行为 | PK-M1-31、PK-M1-42 |
