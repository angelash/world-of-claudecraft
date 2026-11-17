# PK-M1-26 自有技能编号与第一幕技能：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（遗留见 `progress.md` 的"留给后续包的事项"） |
| 末次代码或内容变更 | 未提交；改动文件见 `progress.md` 2026-11-17 汇报 |
| 完整实跑 | 2026-11-17，工作区状态（并行的其他包未提交改动同在工作区） |
| 审查 | 新起会话的差异审查一次：14 条发现，处理见第 3 节 |
| 遗留 | 客户端读档未传系统作迁移主人（请求回写）；15 个未导入的 `aur_st_*`；巨像残意的血契与习性；数值重算（PK-M1-11、PK-M1-42） |

## 1. 验收条目

| 序 | 验收 | 命令或评审 | 结果 | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | V3 无前缀 ID 零命中 | `node tools/content/validate.ts` | `abilities`、`auras` 已是严格表（每个 ID 带 `sk_`、`aur_`）；V3 对技能与光环零命中。V3 全表在本包的改动上为 0 错误；工作区里另有 PK-M1-46 未完成的 `disputes` 表命中，随该包落地 | `tests/own_ability_ids.test.ts`、`tests/content_validation.test.ts`（V3 严格表的反例） | PASS |
| 2 | V10 主工程技能显示名零命中 | `node tools/content/validate.ts` | V10 0 errors、0 warnings（原 3 条已审例外：`十字军打击`、`心灵尖啸`、战场技能 `烈焰风暴`，全部改名，例外表清空）；M1 档同样为 0 | `tests/content_validation.test.ts` 的 V10 用例 | PASS |
| 3 | 通关回归通过 | `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts tests/playthrough/rule_merca.playthrough.test.ts tests/playthrough/act1_minimal.playthrough.test.ts` | `Test Files 3 passed (3)`、`Tests 3 passed (3)`，740.85 秒，退出码 0 | `progress.md` 2026-11-17 汇报的"通关结果" | PASS |
| 4 | 对照表全部落地（123 个技能、84 个光环；显示名按"新名"栏） | `npx vitest run --config vitest.config.ts tests/own_ability_ids.test.ts` | 目录第 2、3.2 节逐行与数据的 ID、显示名一致；数据的 ID 集合正好是目录新 ID 加 6 个导入行 | 同左 | PASS |
| 5 | 旧存档读档后只见新 ID | `npx vitest run --config vitest.config.ts tests/own_ability_ids.test.ts tests/save_renames.test.ts tests/save_migration.test.ts` | 重命名表第 2 版逐条造存档读回无残留；冻结样本 9 份迁移后战斗切片与战斗事件里没有旧 ID；事件环里同形的普通词（施法操作 `interrupted`、英雄技能 `charge`、物品 `ash_spirits`）不动；再迁移一次零改动 | 同左 | PASS |
| 6 | 两条第一幕设计条目先写进目录再导入 | 评审；`node tools/content/import_catalog.ts status --batch content_act1_abilities_01` | 目录第 3.3、4.5 节；批次七步（抽取、补全、校验、合入、验证、报告）记录在 `data/_batches/content_act1_abilities_01.json` | `batch_card.md`、`batch_report.md` | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 唯一错误在 `tests/disputes.test.ts`（PK-M1-46 未完成） | PASS（本包无错误） |
| 默认套件 | `npm test` | 是 | 141 个文件 2831 个用例：2826 通过、2 跳过、3 失败；3 个失败都不是本包引起（第 4 节） | PASS（本包无失败） |
| 本包相关文件 | `npx vitest run --config vitest.config.ts tests/own_ability_ids.test.ts tests/save_renames.test.ts tests/save_migration.test.ts tests/content_validation.test.ts tests/combat.test.ts tests/doors.test.ts tests/doors_costs.test.ts tests/party.test.ts tests/records_save.test.ts tests/docs_guard.test.ts` | 是 | 10 个文件 192 个用例全部通过 | PASS |
| 内容校验 | `node tools/content/validate.ts` | 是 | V1、V2、V4 到 V10 绿；V3 只剩 PK-M1-46 的 `disputes` 命中 | PASS（本包无错误） |
| 注册表新鲜度 | `node tools/registry/build.ts --check` | 是 | `data/registry/vars.json is current`；附带的 `tests/registry.test.ts` 只在 `src/client/audio/audio_world.ts` 的 `tension_high` 上失败（PK-M1-06） | PASS（本包无改动） |
| 文本检查 | `node tools/i18n/check.ts` | 是 | 7 条发现全在 `src/client/audio/`（PK-M1-06） | PASS（本包无发现） |
| 内容文本生成物 | `node tools/i18n/extract_content.ts` | 是 | 重生成；`c.abilities.*`、`c.auras.*` 换成新 ID | PASS |
| 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 是 | 通过 | PASS |
| 改动文件格式 | `npm run format -- <改动的 TS 与 JSON>` | 是 | 已格式化；`src/game/autoplay/player.ts` 的一条 `useOptionalChain` 提示在本包之前就有 | PASS |
| 提示词库新鲜度 | `node tools/prompts/build.ts --check` | 是（改了 68 条 `ref`） | `prompt library ok: 10387 entries` | PASS |
| 平衡批量模拟 | 平衡实验室 | 否：导入的契约魔是随从模板，现有路线不开渊契之门；数值按目录第 4.5 节由既有模板折算，批量模拟归 PK-M1-42 | 无 | N/A |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 新起会话的差异审查 | 屏障提交的覆盖与迁移正确性 | 14 条发现（0 条阻断，8 条应修，其余为小项） | 0 | 8 | 已修：伤害与治疗事件里周期跳伤的光环 ID 按光环改名，`eventFields` 按登记顺序取第一个能改的；物品使用事件的光环字段；迁移测试的事件 ID 核对；V2 补 `items.use.ability`；V2、V3 的反例测试；召唤测试断言第二次读条完成；代码里的光环 ID 字面量钉到数据；设计文档里的旧 ID 与改动历史写法。转出：客户端读档的迁移主人（请求回写）、命令日志不迁移与已开门的补授（遗留）、提交时的分块与重生成（汇报） | `progress.md` 2026-11-17 汇报 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npm test` | `tests/architecture.test.ts` "core/ has no DOM access" | 命中 `src/core/text_keys.generated.ts`，该文件是另一个包的未提交改动，本包不碰 | 并行的界面文本包 |
| `npm test` | `tests/art_manifest.test.ts` | 已知基线：未跟踪的用户美术 | 用户 |
| `npm test` | `tests/registry.test.ts` "write and read canonical names only" | 命中 `src/client/audio/audio_world.ts` 的 `tension_high` | PK-M1-06 |
| `npm run typecheck` | `tests/disputes.test.ts` | 新文件，属于纷争运行器 | PK-M1-46 |
| `node tools/content/validate.ts` | V3 的 `disputes` 表命中（工作中时有时无） | 纷争表与命名空间登记由该包在改 | PK-M1-46 |
| `node tools/content/validate.ts` | V1 的 `guild: commission cmm_a1_night_watch` 一条（工作中时有时无） | 委托板数据由该包在改 | PK-M1-47 |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 客户端读档迁移战斗切片 | `src/client/app/main.ts` 建 `ClientSaves` 时没传 `migrate`，读档走不带系统的缺省迁移，战斗切片的 `idFields` 不生效（恢复路径 `src/core/save/recovery.ts` 已传）；该文件正由并行的客户端包修改 | 主会话或客户端包按 `progress.md` 的请求回写补一行；M2 之前的开发存档不需要迁移（[发行工程](../../50_tech/release_engineering.md)第 5.5、13.8 节），兼容承诺开始前补上即可 |
