# PK-M1-14 千门系统第一批（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-14` 千门系统第一批 |
| 状态 | 进行中（建议状态见 `progress.md` 最后一段） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-14` |
| 形态 | 小包 |
| 工作流 | 系统 |
| 量级 | 5 代理人日，0.5 用户人日 |
| 依赖 | PK-M0-27（已完成，提交 `355ee87db3`：变量注册表） |
| 别名 | 无 |
| 立项日期 | 2026-11-17 |

## 1. 目标

千门系统按[千门系统设计][td]运转第一批规则：门阶曲线与门阶只由开门推进；封印松动的半分存储、按幕封顶的阶段与 `seal_unrest` 的分幕规则；
淤塞折算与门疲；十六个钥原语与四种组合（含替钥与序钥）；物钥的记住与消耗；第一幕互斥组；无随机的提示导演与序章门缝；回廊段与翼；
现有 43 扇门改写到新字段。验收是[千门][td]第 23 节标 M1 的各行。按决策 D-096 先做序章与第一幕：`door_messenger` 的传书声明与
`a3_ash_warning_doors` 之后的阶段名是第二、三幕的事，第 23 节 M1 行不要求，本包不做。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 门阶曲线（整数形式 16 × P^3 >= r^4）、曲线文件与生成工具、门阶只由开门推进 | `src/systems/doors/rank.ts`、`data/doors/rank_curve.json`、`tools/doors/rank_curve.ts` | 千门 4.2、4.3 |
| 2 | 封印：半分 `seal_points`、镜像 `seal_looseness`、按幕封顶只升不降的 `seal_stage`、饱和 99、闭门回落；内容直接写 `seal_looseness` 时的同步 | `src/systems/doors/seal.ts` | 千门 6.4.1、6.4.3 |
| 3 | `seal_unrest` 的分幕规则（第一、二幕每门 +3，`none` 门不加；第三幕起只有遗迹地钥门与禁门） | 同上 `unrestDelta` | 千门 6.4.4 |
| 4 | 淤塞（澱染 4 比 1 折算、档位事件）与门疲（死亡置 60、过载每层淤塞 +3、每游戏时辰 -10）；复苏门疲状态时长改读门阶 | `src/systems/doors/costs.ts`；`src/systems/combat/formulas.ts`（`doorFatigueMinutes`）、`src/systems/combat/death.ts` | 千门 6.2、6.3；战斗 9.4、15.1 |
| 5 | 钥：十六个原语、`all`、`any`、`seq`、`alt`；判定纯读；替钥的缺位判定；序钥的步数与作废；物钥只消耗承担开门的那几把 | `src/systems/doors/keys.ts`、`sequence.ts` | 千门 5 |
| 6 | 互斥机制 `lock`、`actLock`（`act`、`until`）、`forceClose`、单向组的 `source`；第三幕撤回幕锁 | `src/systems/doors/exclusive.ts` | 千门 9.1 |
| 7 | 回廊段与翼、段尾之厅的门随段长出、序章门缝、无随机的提示导演（入梦、门旱时的传闻）、按显示档披露钥 | `src/systems/doors/hints.ts`、`view.ts`、`state.ts` | 千门 2、3.2、18 |
| 8 | 开门结算按 3.5 的顺序；闭门按 3.6；旧存档补字段（不加迁移） | `src/systems/doors/index.ts`、`slice.ts` | 千门 3.5、3.6、21.4 |
| 9 | 数据：43 扇门带 `segment`、`wing`、`seal`、`forbidden`、`unrest`、`rankValue`、`jam`、`closable`、`hall`、`main`、`tendency`，互斥组写 X 编号；识才之门第三把钥、希雅的钥、借形与澄流的替钥按门目录改正 | `data/doors/doors.json` | 门目录 1.4、1.5、2.1、2.2、6；差距盘点第 3 节 |
| 10 | 内容校验第 21.6 节八条，外加未知钥类、不计数的事件、禁门类不带禁门加权 | `src/content/packs/doors.ts` | 千门 21.6 |
| 11 | 回廊窗口在 `feature.door_corridor` 之前不可用 | `src/client/windows/window_registry.ts` | 千门 8 第 1 行 |
| 12 | 注册表新增族 `taught.<门>.<人>`；`seal_unrest`、`blockage`、`door_fatigue` 的写入方标 doors | `docs/40_design/world_state_registry.md` 第 8.2、8.5 节，`data/registry/vars.json`（工具生成） | 注册表 9.2 |
| 13 | 文本：翼名 `sys.doors.wing.*` | `locales/zh-Hans/sys_doors.json` | 实现约定 8 |
| 14 | 设计回写 | `docs/40_design/systems/thousand_doors.md` 第 4.3、5.1、5.4、5.8、6.2、8、9.1、18.3、21.1、21.4、21.6 节 | |
| 15 | 测试 | `tests/doors_harness.ts`、`tests/doors_rank_seal.test.ts`、`tests/doors_costs.test.ts`、`tests/doors_keys.test.ts`、`tests/doors_exclusive.test.ts`、`tests/doors_hints.test.ts`、`tests/doors_validation.test.ts`、`tests/doors_features.test.ts`；改 `tests/doors.test.ts`、`tests/combat.test.ts` | 千门 23 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 遗落包（每叠 25%、钱 10% 留在死亡之处、保留 3 日、兽伴守护）、`combat.player_returned` 按战斗 19.4 的扩展 | PK-M1-11（死亡五项代价） |
| 2 | 已装备物品死亡耐久 -10% | PK-M1-13（物品实例层与耐久） |
| 3 | 契约之门的从契读取方 `src/systems/party/retainers.ts`（功能 `servant`） | PK-M1-15 |
| 4 | HUD 门镜部件、回廊界面（显示档、钥孔数、阶段名） | PK-M1-22 |
| 5 | `door_messenger` 的传书声明、`a3_ash_warning_doors` 之后的阶段名、按幕的多套钥 `keySets`（渊契之门第三幕版本）、失灵、门技门疲、各翼的生长规则（流派龛、交手廊、七碑廊）、提示导演的钥孔鲤与师傅台词渠道和有模型时的润色 | PK-M2-13 |
| 6 | 第一幕缺的 8 扇门、门相句 `glimpse`、C88 信使之门与 C89 其余三扇的钥重写 | PK-M1-32 与后续内容批次 |
| 7 | 内容里直接写 `seal_looseness` 的效果（第一幕开场置 5、第一幕梦境 +5、第二到五幕场景 +5 到 +15、任务 +1）与 C84 的预算 | PK-M1-33、PK-M1-27 的重导批次（差距盘点第 3 节） |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则 |
| [implementation_conventions.md](../../50_tech/implementation_conventions.md)、[architecture.md](../../50_tech/architecture.md) | 系统接缝、旗标、文本、内容 ID |
| [thousand_doors.md][td] 第 2 到 9、18、21、23 节 | 规则与验收 |
| [catalog_doors.md](../../40_design/content/catalog_doors.md) 第 1.4、1.5、2、6 节 | 每扇门的松动档、互斥、钥 |
| [combat_and_classes.md](../../40_design/systems/combat_and_classes.md) 第 9.4、15.1 节 | 门疲与死亡代价 |
| `src/systems/doors/` | 本包的代码 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性 | 千门不抽随机；提示导演按整数分与门 ID 排序 | `tests/architecture.test.ts`、`tests/doors_hints.test.ts` |
| 内容 ID | 系统代码不写门、人物、地图 ID | `tests/content_id_guard.test.ts` |
| 文本 | 内核只发文本键；新句子在 `sys_doors` | `tests/i18n_kernel_guard.test.ts`、`node tools/i18n/check.ts` |
| 注册表 | 门钥读的变量都已登记 | 千门 21.6 第 2 条（`validateDoors`）、`node tools/registry/build.ts --check` |
| 旧存档 | 冻结存档迁移后的哈希不变，续玩不崩 | `tests/save_migration.test.ts` |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/doors/{costs,exclusive,hints,rank,seal,sequence,slice,state}.ts`、`data/doors/rank_curve.json`、`tools/doors/rank_curve.ts`、`tests/doors_harness.ts`、`tests/doors_{rank_seal,costs,keys,exclusive,hints,validation,features}.test.ts`、本目录 |
| 本包修改 | `src/systems/doors/{index,keys,types,view}.ts`、`src/content/packs/doors.ts`、`data/doors/doors.json`、`locales/zh-Hans/sys_doors.json`、`docs/40_design/systems/thousand_doors.md`、`tests/doors.test.ts` |
| 越界的最小改动 | `src/systems/combat/formulas.ts`、`src/systems/combat/death.ts`、`tests/combat.test.ts`（复苏门疲时长读门阶）；`src/client/windows/window_registry.ts`（回廊窗口一行门槛）；`docs/40_design/world_state_registry.md` 四行 |
| 工具重生成 | `src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json`、`data/registry/vars.json`（三者都含其他并行包的条目） |

## 7. 验证命令

在 `hakoniwa/` 下运行：

```
npm run typecheck
npx vitest run tests/doors.test.ts tests/doors_rank_seal.test.ts tests/doors_costs.test.ts tests/doors_keys.test.ts tests/doors_exclusive.test.ts tests/doors_hints.test.ts tests/doors_validation.test.ts tests/doors_features.test.ts
npx vitest run tests/combat.test.ts tests/content_base_rebase.test.ts tests/time_skip.test.ts tests/save_migration.test.ts tests/architecture.test.ts tests/content_id_guard.test.ts tests/i18n_kernel_guard.test.ts tests/i18n_ui_guard.test.ts
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
node tools/doors/rank_curve.ts --check
npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts tests/playthrough/act1_minimal.playthrough.test.ts
```

## 8. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起的通用代理，只读） | 必派 | 一次贡献结束；结论与处理见 `verification_matrix.md` 第 3 节 |

## 9. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 千门第一批规则与新字段的门数据 | PK-M1-32（第一幕门与事迹） | 新门按 21.1 的字段入库，`validateDoors` 全绿 |
| 门阶 `door_rank`、门疲、淤塞的镜像旗标与查询 `doorCosts` | PK-M1-22（门镜部件）、PK-M1-11（死亡代价） | 门镜读 `doorCosts`；死亡结算读 `door_rank` |
| `corridorOpen`、`corridorLayout`、按显示档披露的 `corridorView` | PK-M1-22（回廊模式） | 门缝档不显示门名与代号 |

[td]: ../../40_design/systems/thousand_doors.md
