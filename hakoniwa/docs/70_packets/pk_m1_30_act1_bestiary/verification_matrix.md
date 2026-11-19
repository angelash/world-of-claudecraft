# PK-M1-30 第一幕魔物、首领与迷宫：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（数据与刷新组全部落地并通过本包覆盖的单测；活性期、袭扰、澱度层等运行时项与新物品转去的包见 `progress.md` 第 3 节；待用户定的三项见第 4 节） |
| 末次代码或内容变更 | 未提交；改动文件清单见 `progress.md` 第 2 节 |
| 完整实跑 | 2026-11-18，工作区状态（与他包并行的同一工作区） |
| 审查 | 新起子代理的覆盖性复查（第二次派发完成；第一次被模型安全机制中止）：0 BLOCKING、8 SHOULD-FIX、若干 NIT，处理见 `progress.md` 第 2 节"QA 1"；下表是修后重跑的结果 |
| 延后的测试 | 见第 2 节 |

## 1. 验收条目

计划包行验收栏："V6 等级在等级带内；首领首次挑战胜率与击杀时间进节奏报告"。

| 序 | 条目 | 命令 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | V6 等级带：本包的魔物、刷新组与澱巢不触发 V6 错误 | `node tools/content/validate.ts` | V6 `0 errors, 16 warnings`；V3、V7、V10 全绿；V1、V2、V4、V5、V8、V9 的错误共 79 条，全部是他包的数据（配方与杰作、装备修理材料、附纹条件、场景与序章道具、女神称号、台词包的吠叫池），筛选魔物、地图、迷宫、澱巢、刷新点的错误为 0 条 | PASS（本包范围） |
| 2 | 图鉴行、异名者与巢主层次、注册表字段、部件标签、战场地点、迷宫与澱巢记录、刷新门控、引擎里的鼠巢与地窖与魔物季 | `npx vitest run tests/act1_bestiary.test.ts` | 15 passed | PASS |
| 3 | 地图上线检查（步行可达、热点、动线度量、等级上限、枢纽图无常驻魔物） | `npx vitest run tests/map_launch.test.ts tests/map_metrics.test.ts` | 随第 5 行一并通过 | PASS |
| 4 | 首领机制、战斗内容、战斗规则、门、重命名表、迷宫与澱巢、自有技能编号、NPC 地图 | `npx vitest run tests/boss_mechanics.test.ts tests/combat.test.ts tests/combat_rules.test.ts tests/doors.test.ts tests/save_renames.test.ts tests/dungeons.test.ts tests/dungeon_nests.test.ts tests/own_ability_ids.test.ts tests/npc.test.ts` | 随第 5 行一并通过 | PASS |
| 5 | 第 2 到 4 行合跑 | 上面十二个文件一条命令 | `Test Files 12 passed (12)`，`Tests 357 passed (357)` | PASS |
| 6 | 注册表 | `node tools/registry/build.ts --check` | `vars.json is current (727 names, 128 families, 38 quest ids)` | PASS |
| 7 | 文本 | `node tools/i18n/check.ts`（先跑 `extract_content.ts`、`gen_keys.ts`） | `0 finding(s)` | PASS |
| 8 | 类型检查 | `npm run typecheck` | 退出码 0（修后重跑） | PASS |
| 9 | 首领首次挑战胜率与击杀时间 | 节奏报告 | 未测：转 PK-M1-42（垄沟鼠后、锈母、记账鼠婆、澱巨像崩解期） | 转出 |
| 10 | 禁用字符 | 本包三件文档、新测试与改动的数据 | 无 | PASS |

**两条随内容变化而失效的旧用例**：新增的刷新组让开局多抽了 `combat.spawn` 等命名流，两条依赖站位运气的用例随之失败（把本包的地图改动临时换回提交版本，两条都通过，验证后已恢复）。修法只改用例的站位：

| 用例 | 原因 | 修法 |
| --- | --- | --- |
| `combat.test.ts` "reforms in the sigil hall ... drop bag" | 玩家死在神纹大厅中央，复苏点就在旁边，1.5 格内会立刻捡回遗落包；尸体停在哪里随开局抽取变化 | 让玩家倒在正门内侧的 `gate_yard`（`killPlayer` 与 `isolate` 加可选坐标） |
| `combat_rules.test.ts` "观战 ..." | 瑟格出生在玩家 3 格内（警戒半径 5），决斗命令落地前已被拉进战斗，命令回 `in_combat` | 瑟格与观战的匪徒放到警戒圈外（决斗距离上限 40 格） |

## 2. 延后的测试（按用户指示不跑）

| 套件或路线 | 为什么可能受影响 |
| --- | --- |
| `npm test` 全量 | 新增 48 个刷新组改变各命名流的抽取顺序，其他依赖站位或时序的用例可能像上表两条一样漂移；`tests/content_validation.test.ts` 的全绿用例目前因他包的数据失败 |
| `npm run playthrough`：`act1_minimal`、`release`、`rule_merca`、`replay`、`replay_segments`、`tide_pacing` | 第一幕各野外图多了魔物（锈岭矿口外、线北、林缘、折桥驿、荒原外缘）；游荡骸骨与荒原怨灵改为只在夜里生成；地窖与西田鼠巢随任务与周次出现；第二幕起的刷新组；都会改变两条完整路线的练级、死亡与时长。路线目前本就卡在第一幕（问题清单 T-01），本包未处理 |
| `tests/autoplay_*.test.ts` | 自动玩家挑练级图与目标时读刷新点 |
| `tests/tide_*.test.ts`、`tests/ailments*.test.ts`、`tests/time_skip.test.ts` | 边石镇、遗迹深处与林缘的刷新组与夜间生成 |
| `tests/client_hd2d.test.ts` 的程序化基线 | `borderstone` 的新地点全是 `open`、`no_roof`，边石镇的基线已通过；`old_outpost` 的失败来自他包 |

## 3. 流程记录

| 项 | 状态 |
| --- | --- |
| 新起子代理的覆盖性复查 | 第一次派发被模型的安全机制中止（消息 ID `msg_011ChAX7ixdibR5f4G1yjEyX`）；换措辞后第二次派发完成，发现与处理见 `progress.md` 第 2 节"QA 1"；修后第 2 到 8 行全部重跑 |
