# PK-M1-26 自有技能编号与第一幕技能：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施 1、QA 1 | 目录补两条第一幕条目；两份数据文件与全部引用换号；重命名表第 2 版与战斗切片 `idFields`；批次 `content_act1_abilities_01` 导入 6 行；校验收紧；新起会话审查后修 8 条 | 未提交 | `npm test` 2826 通过、3 失败（都不是本包）；本包相关 10 个文件 192 个用例通过；`node tools/content/validate.ts` 的 V3（技能与光环）与 V10 零命中；通关三条路线 3 passed（740.85 秒） | 1. 主会话按下面的文件清单提交；2. 请求回写：客户端读档传系统作迁移主人 |

## 2. 汇报

### 2026-11-17 实施 1、QA 1

**做法**

- 换号：临时脚本（不进仓库）按目录第 2、3.2 节得到旧 ID 到新 ID 与新显示名的对照，用一个跟踪 JSON 路径的词法器只改引用字段位置上的字符串，
  保留手排格式；每个文件改完与"同一映射作用于解析后的数据"做结构比对，一致才写回，再用 Biome 格式化。改动的字段见 `batch_card.md`。
- 读档迁移：`data/registry/renames.json` 升到第 2 版，登记 123 条 `ability`、84 条 `aura`（`door_step` 一个旧拼写两类两个去处）；
  战斗系统导出 `idFields`（`src/systems/combat/id_fields.ts`：光环、冷却、读条、门授技能、首领阶段技能、魔物来源）；
  事件环：`src/core/save/renames.ts` 增加 `eventFields`，技能与光环只在登记的事件字段改名，同一字段装两类 ID 时按登记顺序取第一个能改的
  （伤害与治疗事件的 `abilityId` 在周期跳伤、脉冲与反伤时是光环 ID，所以光环字段登记在前，并用 `ids` 只列会跳伤、脉冲或反伤的 20 个与会跳疗的
  4 个旧光环 ID），施法操作 `interrupted`、英雄技能 `charge`、物品 `ash_spirits` 这些同形的普通词不动；其余各类沿用"整串相等即改名"。
- 导入：映射模块 `tools/content/mappings/abilities_talents.ts` 四个映射，走 `import_catalog.ts` 的抽取、补全、校验（M0）、合入、验证、报告。
- 代码：系统里写死的光环 ID 换号（`aur_mon_schoollock`、`aur_st_presence_*`、`aur_st_revival_fatigue`）；同伴倒地起身改挂新导入的
  `aur_st_downed_weak`（数值与原 `spring_weakness` 相同，行为不变）。

**数量**

| 项 | 数 |
| --- | --- |
| 技能换号 | 123（显示名改 2：誓击、裂空啸） |
| 光环换号 | 84（显示名改 9）；合并 1（光环 `door_step` 并入 `aur_door_dodge`）；退休 1（`enrage` 不再是魔物光环，换成状态光环 `aur_st_enrage`）；删除 0 |
| 数据里改写的字符串 | 技能 332（ID 123，引用 209：职能表 87、魔物 65、门 56、同伴 1）；光环 173（ID 84，引用 89：技能效果 74、魔物 11、物品 2、门 2） |
| 代码里改写的光环 ID | 6 处 |
| 素材提示词库的 `ref` | 68（音效 61、特效 7）；素材 ID 本身不改 |
| 重命名表 | 第 1 版到第 2 版，新增 207 条与 5 条事件字段 |
| 导入行 | 6：`aur_ember_door`、`aur_st_downed_weak`、`fiend_colossus_remnant`、`sk_lok_summonremnant`、`sk_mon_remnantbar`、`sk_mon_remnantquake` |
| 天赋 | 0（第一幕没有 `tal_` 条目） |

**两条新设计条目**（[技能目录](../../40_design/content/catalog_abilities_talents.md)）

- 第 3.3 节：余烬门守套 `set_dg_seal_ruins` 的装备光环 `aur_ember_door` 余烬门扉，受到的伤害 -50%，3 秒，增益，不可驱散；触发与内置冷却留在
  套组件的 `procs` 上。
- 第 4.5 节：渊契之门第一幕版本的契约魔巨像残意 `fiend_colossus_remnant`：模板（`demon`、`pact`，随施法者等级，生命 ×1.2、伤害 ×0.6、护甲 ×1.5，
  每秒 3.6 格）、技能拦门 `sk_mon_remnantbar`（嘲讽）与残震 `sk_mon_remnantquake`（半径 3 的幽相范围伤害，仇恨 ×2）、召唤技能
  唤起巨像残意 `sk_lok_summonremnant`（读条 3 秒、灵力上限的 30%、冷却 60 秒，由渊契之门授予）、血契代价 `aur_lok_remnantpact`（生命上限 -15%，
  内核能力到位后导入）。

**世界哈希**

- 冻结存档的迁移金样全部重定（`tests/fixtures/saves/manifest.json`，旧到新）：`v1/prologue.hks` ade5b210 到 9da2482f；`v1/act1.hks` e821ff4c 到 bfc18e9a；
  `v1/act2.hks` 3a47b5e9 到 0d0dd6e8；`v1/act3.hks` de479816 到 100dcce4；`v1/act4.hks` a5eeb05f 到 c001c207；`v1/act5.hks` a51fd179 到 cc91f81c；
  `v1/act6.hks` b9c16c98 到 c0291b07；`v1/r0_act2.hks` 97cd429e 到 688d9846；`save_container/act6_release.hks` 2a248ead 到 84de4bb6（状态哈希同步重定）。
  原因：样本在第 1 版下写成，读档时第 2 版把战斗切片里的旧 ID 换成新 ID；`worldHash` 不含事件环。
- 新开局的世界里光环与技能 ID 换了拼写，状态哈希随之变化；仓库里没有钉住新开局哈希的测试，通关与回放测试比较的是同一构建的两次运行。

**通关回归**

`npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts tests/playthrough/rule_merca.playthrough.test.ts tests/playthrough/act1_minimal.playthrough.test.ts`：
结果见本节末"通关结果"。

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `data/combat/abilities.json` | 修改 | 123 个 ID、效果里的光环引用、2 个显示名；末尾 3 个导入行 |
| `data/combat/auras.json` | 修改 | 84 个 ID、9 个显示名；末尾 2 个导入行 |
| `data/combat/classes.json` | 修改 | 职能技能表 |
| `data/combat/items.json` | 修改 | `ash_spirits`、`stoneskin_draught` 的 `use.ability`（物品 ID 不变） |
| `data/combat/monsters.json` | 修改 | 技能、阶段技能、被动、狂暴与淬炼光环；末尾 1 个导入行 |
| `data/doors/doors.json` | 修改 | 门授技能与被动光环；渊契之门加 `sk_lok_summonremnant` |
| `data/party/companions.json` | 修改 | 夜羽的 `avoid` |
| `data/warfare/abilities.json` | 修改 | 英雄技能 `firestorm` 的显示名改"焚阵"（V10；ID 留给 `sk_bf_` 编号） |
| `data/registry/renames.json` | 修改 | 第 2 版 |
| `data/_batches/content_act1_abilities_01.json` | 新增 | 批次记录 |
| `data/_staging/index.json` | 修改 | 批次索引 |
| `locales/zh-Hans/content.generated.json` | 修改（生成物） | 重生成；提交时在提交树上重跑 `node tools/i18n/extract_content.ts`，因为工作区里还有并行包的新内容键 |
| `src/core/save/renames.ts` | 修改 | `EventField`、`RenameTable.eventFields`、`RenameSet.eventId`，表检查 |
| `src/systems/combat/id_fields.ts` | 新增 | `COMBAT_ID_FIELDS` |
| `src/systems/combat/index.ts` | 修改 | 系统对象导出 `idFields`，再导出 `id_fields` |
| `src/systems/combat/abilities.ts`、`presence.ts`、`death.ts` | 修改 | 光环 ID 字面量 |
| `src/systems/party/ai.ts` | 修改 | 倒地起身挂 `aur_st_downed_weak` |
| `src/game/autoplay/player.ts` | 修改（一行） | `aur_st_revival_fatigue`；该文件另有并行包已暂存的改动，提交时只取这一行 |
| `src/content/references.ts` | 修改 | V2 补 `companions.avoid[]`、`items.use.ability`、`monsters.mechanics.onHit[].aura`、`monsters.mechanics.phases[].aura` |
| `tools/content/mappings/abilities_talents.ts` | 新增 | 四个映射与 `dataFields` |
| `tools/content/mappings/index.ts` | 修改 | 登记映射 |
| `tools/content/validators/namespace.ts` | 修改 | `abilities`、`auras` 进严格表；`fiend_` 可进 `monsters`。该文件同时有 PK-M1-46、PK-M1-47 的 `q_`、`ev_`、`cmm_` 改动，提交时分块 |
| `tools/content/validators/namespace_legacy.json`、`names_reviewed.json`、`names.ts` | 修改 | 清掉已改名的遗留与已审例外；注释 |
| `tests/own_ability_ids.test.ts` | 新增 | 对照表落地、重命名表、旧存档读档、代码字面量、导入行与召唤 |
| `tests/combat.test.ts`、`doors.test.ts`、`doors_costs.test.ts`、`party.test.ts` | 修改 | 新 ID |
| `tests/content_validation.test.ts` | 修改 | V10 期望零命中；V2、V3 反例 |
| `tests/save_renames.test.ts` | 修改 | 探针字段加技能与光环 |
| `tests/save_migration.test.ts` | 修改 | 迁移主人加战斗系统；样本覆盖按世界版本；每份样本核对战斗 ID 与再迁移零改动 |
| `tests/fixtures/saves/manifest.json` | 修改 | 迁移金样重定；提交时在提交树上重跑 `tests/save_migration.test.ts` 核对（迁移读变量注册表，工作区里 `data/registry/vars.json` 有并行包未提交的改动） |
| `assets/prompts/specs/audio_sfx.json`、`vfx.json` | 修改 | 技能条目的 `ref` 换新 ID（`assets/prompts/out/` 不入库，已本地重生成） |
| `docs/40_design/content/catalog_abilities_talents.md` | 修改 | 第 3.3、4.5 节新条目；第 0、1、7.7、10 节；交叉引用节号 |
| `docs/40_design/content/catalog_doors.md` | 修改 | 第 2.1 节第 24 行：新 ID 与召唤技能 |
| `docs/40_design/content/catalog_warfare_strategy.md` | 修改 | `firestorm` 显示名 |
| `docs/40_design/systems/combat_and_classes.md` | 修改 | 第 15.2、19.5、21.2 节的旧 ID |
| `docs/40_design/audio_direction.md` | 修改 | 两条音效说明里的技能名 |
| `docs/50_tech/release_engineering.md` | 修改 | 第 5.5 节示例与事件字段规则 |
| `docs/70_packets/pk_m1_26_skill_ids/` | 新增 | 包目录五件 |

**验收逐条结果**

| 验收序号 | 状态 | 命令与输出要点 |
| --- | --- | --- |
| 1 | PASS | `node tools/content/validate.ts`：技能与光环零命中 |
| 2 | PASS | V10 0 errors、0 warnings |
| 3 | PASS | 三条路线 3 passed，740.85 秒 |
| 4 | PASS | `tests/own_ability_ids.test.ts` 14 个用例 |
| 5 | PASS | `tests/save_renames.test.ts`、`tests/save_migration.test.ts`、`tests/own_ability_ids.test.ts` |
| 6 | PASS | 批次记录七步 |

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 技能目录第 1 节 | 数值重算与换号同批，归本包 | 只换号；重算转 PK-M1-11、PK-M1-42，目录已改写 | 计划包行与验收不含数值；屏障提交混入数值会让回归分不清两种变化 | 是（不阻塞，见 `README.md` 第 11 节） |
| 技能目录第 3.2 与 7.3 节 | `aur_st_revival_fatigue` 的新名一处写"复苏门疲"、一处写"复苏门疲状态" | 统一为"复苏门疲" | 光环名用短名，与第 3.2 节一致 | 否 |
| 技能目录第 7 节 | 21 个状态光环编号 | 只导入换号得来的 5 个与 `aur_st_downed_weak`；其余 15 个随施加它们的系统导入 | 未接线的数据行没有读取方，部分效果（生命上限百分比、门技消耗）内核还表达不了 | 否 |
| 战场技能 | `firestorm` 的改名归 `content_act3_warfare_01` | 本包只改显示名为"焚阵"，ID 不动 | 本包验收要求 V10 主工程技能显示名零命中 | 否 |
| 渊契之门 | 门数据只有一行（第一幕版本） | 召唤技能加在这一行 | 第三幕版本落地时再拆 | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `src/client/app/main.ts` | 建 `ClientSaves` 时传 `migrate: createMigrator({ owners: <游戏的系统> })`，让读档时战斗切片（以及已登记 `idFields` 的记录、公会切片）也按重命名表迁移；现在只有恢复路径传了 | 客户端包或主会话（该文件正被并行包修改，本包未动） | 请求回写待落地 |
| `tools/content/validators/namespace.ts` | 与 PK-M1-46、PK-M1-47 同改一个文件 | 主会话提交时分块 | 已告知 |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 客户端读档的迁移主人（上表） | 客户端包；M2 兼容承诺之前必须落地 |
| 命令日志 `world.log` 里旧的 `combat.cast` 命令不迁移（第 3 级恢复的回放会拒收） | 存档与回放的后续包；M2 之前开发存档作废，影响仅限开发 |
| 已开渊契之门的旧存档拿不到新加的召唤技能（门的授予只在开门时执行） | PK-M1-32（第一幕门批次）或门效果读取方 PK-M1-56 |
| 巨像残意的血契 `aur_lok_remnantpact` 与"在封门遗迹附近不听命令" | PK-M1-11 |
| 其余 15 个 `aur_st_*` 数据行 | 目录第 7.7 节逐个写明（PK-M1-11、PK-M1-12、PK-M1-13、PK-M1-51、PK-M2-13 与契约违约的结算） |
| 技能数值按 `S(L)` 重算；状态光环数值按战斗文档重写 | PK-M1-11、PK-M1-42 |
| 战场英雄技能 `sk_bf_` 编号 | PK-M2-08、PK-M2-36 |
| 其他设计文档里的旧技能 ID（图鉴、门目录其余行等） | 各目录下次修订；技能目录第 2、3 节是对照表 |
| 契约魔同一时刻只有一只的跨种限制（内核只拦同一种召唤物） | PK-M1-11 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 并行包的未提交改动与本包同在工作区 | 提交本包的文件时，生成物与金样可能与提交树不一致 | 提交后在提交树上重跑 `node tools/i18n/extract_content.ts`、`npx vitest run --config vitest.config.ts tests/save_migration.test.ts tests/i18n_ui_strings.test.ts` |
| 事件环里同一字段装两类 ID | 既有直接伤害又有同名持续伤害的四个技能（献祭、烈焰震击、月火术、愈合）的直接命中事件在迁移后记成光环 ID | 只影响读档前的历史事件显示；事件环不进世界哈希 |

**需用户决定**

| 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- |
| 数值重算的归属 | 见 `README.md` 第 11 节 | 不阻塞 |

**通关结果**

三条路线 `release`、`rule_merca`、`act1_minimal`：3 个文件 3 个用例全部通过，耗时 740.85 秒，退出码 0。通关开跑之后只改了读档迁移
（`src/core/save/renames.ts` 与 `data/registry/renames.json` 的事件字段，只作用于重命名版本低于 2 的存档）、测试与文档，不影响通关路线。
批次记录补上第 6 步（验证）与第 7 步（报告，`batch_report.md`）。
