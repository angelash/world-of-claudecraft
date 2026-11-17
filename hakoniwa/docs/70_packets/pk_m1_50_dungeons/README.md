# PK-M1-50 迷宫运行时（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-50` 迷宫运行时 |
| 状态 | 进行中 |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-50` |
| 形态 | 小包 |
| 工作流 | 系统 |
| 量级 | 4 代理人日，0.3 用户人日 |
| 依赖 | PK-M1-16 世界与地图机制（已完成：开关格 `switches`、地点澱度热点 `LocationDef.sediment`、`sedimentAt`） |
| 别名 | 无 |
| 立项日期 | 2026-11-17 |

## 1. 目标

迷宫有了运行时：每座迷宫是一个带状态量的实例（核压、活性、溢出钟、处置），玩家从站在哪里判定进出与层（地图出口、门、进入命令、剧情传送都算），进入命令在入口查队伍人数上限，
遗落物在迷宫里放满 7 个游戏日被吞掉（经本目录的遗落包端口），养、毁、净作为同一套处置作用于迷宫与澱巢；澱巢 `nest_` 按季成长、满巢抬高所在地块的澱度、第四阶转为浅迷宫，
毁后塌缩写入塌陷开关 `dg.<id>.collapsed`（地图开关格与刷新点读它），净化后地块澱度降一；状态镜像到注册表的 `dg.<id>.<字段>` 族；同一种子同一命令序列得到同一世界，存档往返后继续运行与不中断一致。
本包按 D-096 先做第一幕所需：第一幕运行时记录只放目录写全、地图与魔物都已存在的 `dg_seal_ruins`，第二幕起的迷宫只保证数据形状兼容。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据（文档与节号） |
| --- | --- | --- | --- |
| 1 | 迷宫实例：核压、活性、溢出钟、处置、首通、最深层、进入次数、吞掉的遗落物；首次用到时由记录生成；形态由核压定档 | `src/systems/dungeons/state.ts`、`layout.ts` 的 `formOf`、`formBand` | [catalog_dungeons_bosses.md](../../40_design/content/catalog_dungeons_bosses.md) 第 1.1 节 |
| 2 | 进出与层：层是整张图或图上一个地点矩形（同图分上下层、镇子里的地窖）；按玩家位置开始、换层、结束一次探访；进入命令（站在入口）与离开命令（在入口层）；最深层镜像到 `dg.<id>.depth` | `src/systems/dungeons/run.ts`、`layout.ts` 的 `floorAt` | 目录第 1.1、1.4 节；[ux_and_onboarding.md](../../40_design/ux_and_onboarding.md) `tut_a1_dungeon` |
| 3 | 场地状态数据：场地状态条 `ui_hud_dungeon` 的数据面（名称、层、形态、状态、队伍上限、本层首领、遗落物天数）；迷宫窗口 `ui_win_dungeon` 的列表数据面 | `src/systems/dungeons/view.ts` 的 `fieldView`、`dungeonsView` | 界面第 5.2 节 `ui_hud_dungeon`、第 6.3.10 节 |
| 4 | 队伍人数上限：记录自带的上限，否则按当前形态（澱巢 1、浅迷宫 2、迷宫 4、大迷宫 9，挑战梯由记录写 0）；进入命令超员拒绝并给出上限与人数；从地图出口走进来的不拦，记为超员 | `layout.ts` 的 `partyCap`；`index.ts` 的 `dungeons.enter`；`run.ts` | 目录第 1.4 节 |
| 5 | 活性与溢出：有页者死在迷宫里 +3，守核首领倒下 -60 并清溢出钟，养而一周无人清剿 +10（清剿经 `dungeons.patrol`），净化仪式 +30，剧情杠杆 `dungeons.shift`；60 起为活性期并起溢出钟；钟到或活性到顶溢出，回落到 40 | `state.ts` 的 `addActivity`、`clearDungeon`、`overflow`、`growNurtured` | 目录第 1.1、1.3 节 |
| 6 | 遗落物 7 日后被吞：遗落包端口（遗落物的样子与拿走它的办法）；在迷宫里放满 7 日被吞，迷宫塌缩时里面的立即被吞，净址不吞 | `src/systems/dungeons/left_items.ts` | 目录第 1.1 节活性表末行 |
| 7 | 养、毁、净：主人拒绝、条件、首领或巢主倒下、站在现场；毁后 3 到 7 日塌缩（命名流 `dungeons.collapse`），塌缩时仍在里面的人被送到入口；净化仪式按日数，可被打断；任务抉择直接写 `dg.<id>.choice` 时同样结算，主人拒绝时退回并发出事件 | `src/systems/dungeons/dispose.ts` | 目录第 1.2 节；[catalog_bestiary.md](../../40_design/content/catalog_bestiary.md) 第 2.8 节 |
| 8 | 澱巢：条件成立时出现；每一季未清长一阶（澱度二以上，进满巢要澱度三以上）；满巢抬高所在地块一级；第四阶转为记录指定的浅迷宫；第一阶头领、第二阶起巢主在巢前倒下即清巢；养停在第二阶；毁后塌缩写塌陷开关，地块一季内高一级；净化后地块低一级 | `src/systems/dungeons/nests.ts`、`sediment.ts` 的 `localSediment` | 图鉴第 2.8、6 节 |
| 9 | 内容表与校验：`dungeonConfig`、`dungeons`、`nests`；层与地点存在、每张图至多一个整图层、入口在外、到达点在本迷宫的层上、核压在形态带内、毁须有守核首领、净须写日数、澱巢编号按巢主、澱巢只在澱度二以上的地方 | `src/content/packs/dungeons.ts`；`data/dungeons/` | 目录第 1、2 节；图鉴第 6 节 |
| 10 | 第一幕运行时记录：`dg_seal_ruins`（地上外庭与神纹大厅、地下阶底与灰烬室、巢井与鸦巢三层，队伍一加二，主人教会，核即封印故不设处置） | `data/dungeons/dungeons.json` | 目录第 2、3.1.1 节；[map_briefs.md](../../40_design/world/map_briefs.md) A3、A4 |
| 11 | 存档：切片带版本、校验、`idFields`；旧存档无切片时首次使用建立并结算一次，已由任务写下的抉择照样结算；被改名表删去的迷宫的探访丢弃 | `src/systems/dungeons/slice.ts` | [release_engineering.md](../../50_tech/release_engineering.md) 第 5.5 节 |
| 12 | 时间跳跃：注册跳跃处理器，所有到期判断比的是时刻，按小时结算，跳跃与逐 tick 结果相同 | `index.ts` 的 `registerSkipHandler`；`settle.ts` | [travel_and_exploration.md](../../40_design/systems/travel_and_exploration.md) 第 7.5 节 |
| 13 | 变量登记：`dg.<迷宫>.<字段>` 的写入者改为迷宫系统，补 `stage`、`collapsed` 两个字段 | [world_state_registry.md](../../40_design/world_state_registry.md) 第 8.6 节；`tools/registry/parse.ts` | 注册表第 2、9 节 |
| 14 | 单测：形态与上限、进出与换层、超员、遗落物（逐 tick 与跳跃、塌缩、净址、无端口）、活性与溢出、养毁净、主人拒绝与仪式打断、清剿、窗口数据、存档往返与旧存档、澱巢生命周期与澱度、校验器 | `tests/dungeons.test.ts`、`tests/dungeon_nests.test.ts`、`tests/dungeons_harness.ts` | 计划包行的验收 |

## 3. 不做

| 序 | 不做的事 | 归属（哪个包或哪份文档负责） |
| --- | --- | --- |
| 1 | 第一幕迷宫与澱巢的内容记录（`dg_old_mine`、`dg_moon_cellar`、`nest_furrow_rat_queen` 等）与它们的魔物、首领 | PK-M1-30 |
| 2 | 迷宫子场景地图、地窖层、塌陷开关格与入口出口 | PK-M1-35 |
| 3 | 遗落包本身与它在迷宫里的保留时长 | PK-M1-11、PK-M1-13 |
| 4 | 把同伴留在入口外的队伍功能 | PK-M1-15 |
| 5 | 活性期的难度、词缀 `afx_` 与深相掉落；收晶 -15；澱巢的出生率、袭扰与小潮 | PK-M1-12 与战斗内容 |
| 6 | 地区澱值的账（毁、净、养对地区的影响，地区澱度上升一档 +20） | 女神与地区澱的后续包 |
| 7 | 溢出与满巢转成魔物潮 | PK-M1-52 与动态事件 |
| 8 | 两个窗口的界面与引导 | PK-M1-22、PK-M1-23 |
| 9 | 城下迷宫的生成实例 `dg_under:<聚落>` | 第三幕起的迷宫包 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则、目录分工 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 分层、相位、切片、文本、内容 ID |
| [catalog_dungeons_bosses.md](../../40_design/content/catalog_dungeons_bosses.md) 第 1 到 3.1 节 | 状态量、养毁净、队伍、第一幕迷宫 |
| [catalog_bestiary.md](../../40_design/content/catalog_bestiary.md) 第 2.8、6 节 | 澱巢的阶与处置、编号 |
| `src/systems/dungeons/index.ts` | 系统、命令、事件与订阅 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | 塌缩日数只走命名流 `dungeons.collapse`；不用墙钟；到期按时刻比 | `tests/architecture.test.ts`、`tests/dungeon_nests.test.ts` 的跳跃与逐 tick 对照 |
| 模型边界 | 进入、离开、处置拒收 `ai` 与 `fallback` 来源；清巢、杠杆、清剿、打断只收 `system` 与 `script` | `tests/dungeons.test.ts` |
| 内容 ID | 系统代码不写内容 ID：迷宫、层、巢、首领、地点都在 `data/dungeons/` | `tests/content_id_guard.test.ts` |
| 文本 | 系统只发 `TextRef`；中文在 `locales/zh-Hans/sys_dungeons.json` 与 `data/dungeons/` | `tests/i18n_kernel_guard.test.ts`、`node tools/i18n/check.ts` |
| 注册表 | 只写已登记的名字（`dg.<迷宫>.<字段>` 族） | 测试台以 `throw` 策略运行；`node tools/registry/build.ts --check` |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/dungeons/`、`src/content/packs/dungeons.ts`、`data/dungeons/`、`locales/zh-Hans/sys_dungeons.json`、`tests/dungeons.test.ts`、`tests/dungeon_nests.test.ts`、`tests/dungeons_harness.ts`、本目录 |
| 本包修改 | `src/content/entity_kinds.ts`、`src/content/references.ts`、`tools/content/validators/namespace.ts`、`tools/registry/parse.ts`、`docs/40_design/world_state_registry.md` 第 8.6 节一行、`tests/world_mechanics.test.ts` 一处钉住的报错文字；生成物 `data/registry/vars.json`、`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` |
| 不得修改 | `src/systems/combat/`、`data/combat/`、`src/systems/inventory/`、`src/systems/npc/`、`src/systems/cognition/`、`src/core/brain/`、`src/systems/ailments/`、`src/client/`、`src/systems/party/`、`src/systems/world/`、`src/editor/` |

## 7. 停止条件

| 序 | 条件 | 做法 |
| --- | --- | --- |
| 1 | 需要改遗落包或队伍才能达标 | 只在本目录定义端口与查询，接线写进遗留 |
| 2 | 共享检查因他人半成品失败 | 只核对与本包相关的条目，其余写进基线问题 |

## 8. 验证命令

```
npx vitest run --config vitest.config.ts tests/dungeons.test.ts tests/dungeon_nests.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npm test
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 总闸（新起会话的覆盖面审查） | 必派 | 一次贡献结束 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、数据、测试、本目录三件 | 主会话 | 抽看验证矩阵；按 `progress.md` 的文件清单提交 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 遗落包在迷宫里留多久 | 千门第 6.3 节与战斗第 15.1 节写遗落包保留 3 个游戏日（迷宫里同样），迷宫目录第 1.1 节写迷宫里放 7 个游戏日后被吞。甲：迷宫里遗落包留到第 7 日被吞（推荐，迷宫目录与界面第 6.3.10 节都按 7 日写，战斗在迷宫里用 `swallowTick` 延长）；乙：迷宫里也是 3 日，到期即被吞，改迷宫目录与界面 | 不阻塞本包；阻塞端口接线 |
| 2 | 队伍人数上限从地图出口走进来时拦不拦 | 甲：队伍能把同伴留在入口外之后，地图出口也按上限拦（推荐）；乙：上限只是满编，超员只记录并由 `partySync` 调强度 | 不阻塞 |
