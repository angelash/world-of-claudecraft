# PK-M1-47 公会登记与委托板内核（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-47` 公会登记与委托板内核 |
| 状态 | 进行中 |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-47` |
| 形态 | 小包 |
| 工作流 | 系统 |
| 量级 | 4 代理人日，0.3 用户人日 |
| 依赖 | PK-M0-28（已完成）；PK-M1-45 幕时钟（已完成，`act_week` 与周窗）；PK-M1-58 任务模型（已完成，`commission` 任务种类、过期结局与新目标种类） |
| 别名 | 无 |
| 立项日期 | 2026-11-17 |

## 1. 目标

公会有了内核：玩家登记为 F 级（剧情条件或柜台缴费），委托板每个历法周首按模板 `cmm_` 用命名随机流补足挂单，接下的委托作为 `commission` 种类的任务实例由任务系统运行，
完成时按目录公式付报酬与经验（同模板同周递减、零经验差为 0），违约扣违约金并记违约，晋升按社会第 3.1、3.2 节（无考核的自动晋升、考核结果、实绩认定）；
动态事件 `ev_` 按触发、预兆、前兆与密度仲裁落地，复用认知的传闻与喜剧闸门和叙事导演的菜单；同一种子同一命令序列得到同样的挂单与事件。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据（文档与节号） |
| --- | --- | --- | --- |
| 1 | 公会登记：剧情条件 `registration.when`（免费，费用在任务金钱里）与柜台命令 `guild.register`（1 银）；`guild_rank` 旗标是级别的唯一事实，切片记完成件数、违约、实绩点与级别史 | `src/systems/guild/board.ts` 的 `register`、`settleMember`；`index.ts` | [society.md](../../20_world/society.md) 第 3.1、3.4 节；[catalog_quests_acts1_3.md](../../40_design/content/catalog_quests_acts1_3.md) 第 5.2 节 A1-M03 |
| 2 | 级别与晋升：F 到 S 的门槛表；无考核的级别（E）条件满足即自动晋升；`guild.promote` 收考核结果（下一级且其余条件满足）或实绩认定（任意更高一级，卡上记"实"）；剧情直接写 `guild_rank` 时记录跟随 | `src/systems/guild/ranks.ts`、`board.ts` 的 `autoPromote`、`setRank`、`followRankFlag` | 社会第 3.1、3.2 节 |
| 3 | 公会抽成：报酬的一成五由委托方另付，冒险者到手全额；告示板的讨伐状不抽成；公会账记抽成与付出 | `formulas.ts` 的 `guildCut`；切片 `ledger` | 社会第 3.3 节；目录第 2.1 节 |
| 4 | 报酬、经验、递减与违约金的公式 | `src/systems/guild/formulas.ts` | 目录第 2.3、2.4 节；[progression_and_pacing.md](../../40_design/progression_and_pacing.md) 第 3.1.1、3.1.2、7.4 节 |
| 5 | 委托板与模板：板的幕、可挂级别、级别门槛（自身级别或带队的公会冒险者的级别加板的余量，不低于板对任何会员开放的级别：边石分部 F、E 对谁都开放，D 要 D 级本人或 D 级以上的同行者带队）、同时挂单上限、每周补足的区间、挂单周数；模板的级别、种类、委托等级、距离、委托方、地点、期限、目标、条件、周窗、冷却、次数上限、权重、实绩点、写入、修正项、钥槽、并入主线的首个实例 | `src/systems/guild/types.ts`、`board.ts` 的 `settleBoards`、`refill`、`post`、`mayPost`；`data/guild/boards.json`、`commissions.json` | 目录第 2.1、2.2、2.5 节 |
| 6 | 实例化的接缝：接下挂单时生成 `commission` 种类的任务定义，经任务系统的实例接缝登记并开始；期限是任务的过期，放弃是向前失败，二者带违约金；交付后结算 | `src/systems/guild/instance.ts`；`src/systems/quests/instances.ts` | [quests_and_events.md](../../40_design/systems/quests_and_events.md) 第 3.5、3.9、6.5 节 |
| 7 | 委托板窗口的数据面：挂单的标题、级别、委托方、地点、报酬与抽成分两行、期限、委托人自述、所需级别；玩家级别、实字、晋升进度、已接 | `src/systems/guild/view.ts` 的 `boardView` | [ux_and_onboarding.md](../../40_design/ux_and_onboarding.md) 第 6.3.7 节 |
| 8 | 动态事件内核：触发（条件、每日概率、星期、一次性、冷却）、预兆、前兆、持续与结束结算、白名单写入与修正项；仲裁（同聚落严重事件至多 2 件且间隔 7 日、同区域魔物潮冷却 14 日、预兆至少 3 日、链内让路、过久延后即放弃、女神引潮自第三幕）；挂钩（紧急委托、加价、加挂单）；`ev.<事件>` 与 `ev.<事件>.count` | `src/systems/guild/events.ts`；`data/guild/events.json` | 目录第 3 节；任务与事件第 2.2、2.4、3.8 节 |
| 9 | 复用：传闻事件经认知的传闻引擎播种并受喜剧闸门节流；导演类事件作为导演菜单项由导演选择与旁白，内核在 `director.move` 时结算 | `events.ts` 的 `plantRumor`、`directorLanded`；`src/content/packs/guild.ts` 的 `directorItems` | [reputation_and_cognition.md](../../40_design/systems/reputation_and_cognition.md) 第 4、10 节；女神 GM 第 8.3 节 |
| 10 | 内容表与校验、证明内核的一批模板（第 5.6 节 9 个委托模板、第 5.7 节 7 个动态事件） | `src/content/packs/guild.ts`、`data/guild/` | 目录第 5.6、5.7 节 |
| 11 | 存档切片、校验与旧存档补建 | `src/systems/guild/slice.ts` | [release_engineering.md](../../50_tech/release_engineering.md) 第 5.5 节 |
| 12 | 变量登记：`guild_rank` 与 `cmm_count.<模板>` 的写入者；新增 `guild.practical`、`guild.done`、`guild.defaults`、`guild.merit`、`ev.<事件>`、`ev.<事件>.count` | [world_state_registry.md](../../40_design/world_state_registry.md) 第 2.3、8.2、8.6、8.7 节；`data/registry/vars.json`（生成） | 注册表第 2、9 节 |
| 13 | 单测：公式、级别、登记、晋升、实例化可复现、委托全流程、事件内核与二十个种子的密度实测 | `tests/guild.test.ts`、`tests/guild_events.test.ts`、`tests/guild_harness.ts` | 计划包行的验收 |

## 3. 不做

| 序 | 不做的事 | 归属（哪个包或哪份文档负责） |
| --- | --- | --- |
| 1 | 委托板窗口与 `BoardAdapter` 的接线 | PK-M1-23 |
| 2 | 第一幕全部 19 个委托模板与 36 个动态事件；按目录重导 A1-M03、A1-M04 并接上 `registration.when` 与 `firstIn` | PK-M1-33 |
| 3 | 护送目标（普通 NPC 跟随玩家）与护送类委托 | PK-M1-18、PK-M1-15 |
| 4 | 纷争默认格类事件（劫案、宵禁、搜查、抗税）与纷争决策点 | PK-M1-46 |
| 5 | 兽潮之夜的结算与魔物潮的波次编成 `mtide_` | PK-M1-52、战斗内容 |
| 6 | 首领与官员经意图菜单发布委托、居民求助转请托、女神组织挂单 | NPC 大脑与女神 GM 的后续包 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则、目录分工 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 分层、相位、切片、文本、内容 ID |
| [catalog_quests_acts1_3.md](../../40_design/content/catalog_quests_acts1_3.md) 第 2、3、5.6、5.7 节 | 委托板与动态事件的规则与条目 |
| [society.md](../../20_world/society.md) 第 3 节 | 定级、晋升、报酬区间、抽成、登记费 |
| `src/systems/guild/index.ts`、`src/systems/quests/instances.ts` | 系统与实例接缝 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | 抽取只走命名流 `guild.board.<板>` 与 `guild.events`；不用墙钟 | `tests/architecture.test.ts`、`tests/guild.test.ts` 的可复现用例 |
| 模型边界 | 登记、接、交、放弃拒收 `ai` 与 `fallback` 来源；晋升只收 `system` 与 `script` | `tests/guild.test.ts` |
| 内容 ID | 系统代码不写内容 ID：板、模板、事件、登记条件都在 `data/guild/` | `tests/content_id_guard.test.ts` |
| 文本 | 系统只发 `TextRef`；中文在 `locales/zh-Hans/sys_guild.json` 与 `data/guild/` | `tests/i18n_kernel_guard.test.ts`、`node tools/i18n/check.ts` |
| 注册表 | 只写已登记的名字 | `node tools/registry/build.ts --check`、开发构建的写入守卫 |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/guild/`、`src/content/packs/guild.ts`、`data/guild/`、`locales/zh-Hans/sys_guild.json`、`src/systems/quests/instances.ts`、`tests/guild.test.ts`、`tests/guild_events.test.ts`、`tests/guild_harness.ts`、本目录 |
| 本包修改 | `src/systems/quests/types.ts`、`progress.ts`、`outcomes.ts`、`view.ts`、`index.ts`（实例接缝，各几行）；`docs/40_design/world_state_registry.md`（第 2.3、8.2、8.6、8.7 节的行）；`tools/registry/parse.ts`（写入者 `guild`）；`tools/content/validators/namespace.ts`（`ev_`、`cmm_` 的表）；生成物 `data/registry/vars.json`、`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` |
| 不得修改 | `data/quests/quests.json`、`src/systems/disputes/`、`data/combat/`、`data/doors/`、`src/client/`、`src/editor/` |

## 7. 停止条件

| 序 | 条件 | 做法 |
| --- | --- | --- |
| 1 | 两条结局路线因本包改变 | 停下定位；本包只写自己的旗标与修正项 |
| 2 | 共享检查因他人半成品失败 | 只核对与本包相关的条目，其余写进基线问题 |

## 8. 验证命令

```
npx vitest run --config vitest.config.ts tests/guild.test.ts tests/guild_events.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 总闸（新起会话的审查） | 必派 | 一次贡献结束 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、数据、测试、本目录三件 | 主会话 | 抽看验证矩阵；按 `progress.md` 的文件清单提交 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 模板与事件的数据编号 | 注册表第 6.1 节写 `cmm_<定级>_<三位>_<slug>` 与 `ev_<来源>_<三位>_<slug>`，任务目录第 1.2 节写 `cmm_<首个适用幕>_<短名>` 与 `ev_<首个适用幕>_<短名>`；本包按任务目录（编号的主人），推荐把注册表第 6.1 节改成同样的写法 | 不阻塞 |
