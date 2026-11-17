# PK-M1-51 澱染暴露与澱病：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施 1 与 QA 1 | 新系统 `ailments`（暴露、日检、三种澱病、伤病、镜像、量表数据、孩子事件链接口）、八条状态光环、伏击与目击改读 `sedimentAt`、变量登记、单测与二十个种子的节奏实测；覆盖审查后修正 | 未提交 | 本包三份测试 57 通过；节奏实测：澱斑 16/20、澱热 0/20、澱化 0/20、总得均值 50.0；通关见第 2 节末段 | 主会话提交；遗留按下表转出 |

## 2. 汇报

### 2026-11-17 实施 1 与 QA 1

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/ailments/types.ts` | 新增 | 闭集、配置与病例形状、切片、事件与命令 |
| `src/systems/ailments/formulas.ts` | 新增 | 暴露、穿戴、净纹抗性、发病概率与修正、一次日检 `stepBody`、治疗 |
| `src/systems/ailments/body.ts` | 新增 | 逐时辰取样、日检、光环、镜像、端口（澱染、治疗、伤病、消耗品与提前用药）、玩家澱化的淤塞；净纹抗性读物品层的 `sedResist` |
| `src/systems/ailments/story.ts` | 新增 | 镇内澱度轨道、病例、只在相关旗标变化时结算 |
| `src/systems/ailments/slice.ts`、`view.ts`、`index.ts` | 新增 | 切片与存档校验、量表视图、系统（相位 35）与跳时处理器 |
| `src/content/packs/ailments.ts` | 新增 | 内容表与校验 |
| `data/ailments/config.json`、`tracks.json`、`cases.json` | 新增 | 规则数值、镇内澱度轨道、米洛、托比、琳的病例 |
| `data/combat/auras.json` | 修改 | 末尾加 `aur_st_sed_spot`、`aur_st_sed_fever`、`aur_st_sed_crystal` 与五个 `aur_st_injury_*`（先确认 PK-M1-11 未加） |
| `locales/zh-Hans/sys_ailments.json` | 新增 | 七条拒绝原因 |
| `src/systems/travel/rest.ts` | 修改 | `sleepAmbushChance` 改读 `sedimentAt` |
| `src/systems/cognition/witness.ts` | 修改 | 只改目击的巫术加成一处读法（PK-M1-18 本波负责该目录） |
| `docs/40_design/world_state_registry.md` | 修改 | 第 2.3 节两行；第 8.1 节 `player.taint`、`player.injury` 与新行 `player.sed_stage`；第 8.3 节新行 `a1_culvert_sealed`、`a1_north_spring_boarded`；第 8.4 节 `a1_toby_state`、`a1_lin_state`、`a1_town_dian`、`a1_mill_owner` 的读写栏；第 8.6 节新行 `sed_case.<病例>` |
| `tools/registry/parse.ts` | 修改 | 系统名加 `ailments`，槽名加"病例" |
| `docs/50_tech/architecture.md` | 修改 | 相位表加 35 ailments |
| `data/registry/vars.json`、`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 重生成 | 由各自工具生成 |
| `tests/ailments.test.ts`、`tests/ailments_harness.ts`、`tests/ailments_pacing.test.ts`、`tests/ailments_sediment_reads.test.ts`、`tests/fixtures/ailments_act1_regular_route.json` | 新增 | 单测、夹具与节奏实测 |
| 本目录三件 | 新增 | 包文档 |

**验收逐条结果**

| 验收序号 | 状态 | 命令与输出要点 |
| --- | --- | --- |
| 1 到 6、8、9 | PASS | `npx vitest run --config vitest.config.ts tests/ailments.test.ts tests/ailments_sediment_reads.test.ts`：56 通过 |
| 7 | PASS | `npx vitest run --config vitest.config.ts tests/ailments_pacing.test.ts`：`spot onsets by seed 1,1,1,1,1,1,1,0,1,0,1,0,0,1,1,1,1,1,1,1; fever 全 0; crystal 全 0; seeds with spot 16/20, with fever 0/20; mean gross taint 50.0; peak taint min 24.1 median 35 max 46.2` |

另用纯模型对同一画像跑 200 个种子，看吞服量对结果的影响（草稿测量，不进套件）：吞服 ×0.8 时总得 40.2、澱斑 31%、澱热 0%；×1 时 49.9、72%、2%；×1.17（约满预算 60）时 58.1、93%、9%；×1.4 时 69.2、98%、44%。澱热在千门预算附近陡升。

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 成长 9.1 | 环境累积按"日" | 每游戏时辰按所在之处记一时辰，日检时按时辰折算 | "按所待之处"的直接读法；跳时与逐 tick 都在整点取样，结果一致 | 否 |
| 成长 9.1 | 临界档未给日率 | 按渊澱 +10 | 临界只在灰烬荒原中心，不比渊澱低 | 否 |
| 成长 9.2 | 位阶修正与封顶的先后 | 先封顶，再乘位阶与孩童、老人的系数 | 文档把系数写在封顶公式之后 | 否 |
| 成长 9.4、战斗 9.4 | 玩家的澱化"不作用于身体" | 身体保留澱热的光环 | 澱热不自愈，玩家到澱化时身体仍在澱热 | 是（README 第 11 节第 2 条） |
| 计划包行 | 发病次数的设计范围未写 | README 第 2 节 | 依据内容总纲的灰狼皮一课、成长 9.3 欧拉独治澱热、千门 6.2 的第一幕淤塞预算 | 是（README 第 11 节第 1 条） |
| 消耗品 2.1 | 疗程内提前再用澱药：药毒一档"只记 2 点澱染" | 物品层在 `item.used` 上标 `early`，本系统只加 `earlyTaint`（2）、不治疗；二档的回复 -20% 与光环归物品层 | 物品层与本系统各管一半 | 否 |
| 消耗品 2.9 | `sed_cure` 的数量含义未写 | `amount` 为澱染栏，`use.sed` 写能治的阶段（`treats`、`down`），`use.taint` 为任意消耗品附带的澱染 | 一个效果字段装不下"降阶加澱染" | 否（请 PK-M1-13 定类型） |
| 第一幕 7.2 | 琳"第 9 周时"判定 | 只在第 9 周判定 | 照原句 | 否 |
| 注册表 | `player.injury` 由 combat 写 | 由 ailments 写镜像，伤的来源经端口 | 伤病状态与时钟在本系统 | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `src/systems/cognition/witness.ts` | 计划包行指定的目击读法 | PK-M1-18 | 已改一处读法，请知悉 |
| `data/combat/auras.json` | 八条状态光环 | PK-M1-11 | 已加在末尾。改写时曾把整份文件按 JSON 重排，随即按提交版本的原文恢复未改条目、保留 PK-M1-11 正在改的条目，内容逐条核对一致；PK-M1-11 那几条的排版由本包的格式化器给出 |
| `src/systems/combat/`（未改） | 光环写不出的效果：体力与灵力恢复、施法失控、双手武器限制、门技冷却 | PK-M1-11 | 请求回写 |
| `src/systems/inventory/`（未改） | `ItemDef.use` 加 `taint` 与 `sed`（`treats`、`down`）的类型 | PK-M1-13 | 请求回写 |
| `tools/registry/parse.ts` | 系统名 `ailments` 与槽名"病例" | 内核 | 已改 |
| `docs/50_tech/architecture.md` | 相位表 | 内核 | 已改一行 |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 同伴与具名 NPC 自动纳入暴露；同伴澱化满 7 日的重伤退场与澱染置 50、凡人死亡（消费 `ailments.crystal_due`）；门纹孩子不染病 | PK-M1-15、PK-M1-18 |
| 光环写不出的效果（见上表） | PK-M1-11 |
| 消耗品条目、`use.sed` 与 `use.taint` 的类型、药毒、预防品（祛灰茶、灰巾、祛灰香囊，宜用修正项） | PK-M1-13 与消耗品内容批次 |
| 伤病的来源接线（倒地、首领技能、冲关）与"睡一夜并接受治疗"；淬体汤减半 | PK-M1-11、PK-M1-15 |
| 澱巢与女神的动态澱度进入暴露读数 | PK-M1-50 |
| A1-M07 `seal` 选项写 `a1_culvert_sealed` 与 -20；封泉写 `a1_north_spring_boarded`；托比的治疗写 `a1_toby_state` | PK-M1-33 |
| 借形之门的北泉净化（每周 -10，可直接加到 `a1_town_dian`） | PK-M1-56 |
| 常规路线自动玩家上重测发病次数；第一幕未净吞服的总量宜控制在澱染总得 50 左右 | PK-M1-10、PK-M1-42 |
| 光环名的凡人称谓切换（灰斑、灰热）与量表读 `player.sed_stage` | PK-M1-22 |
| 自动玩家的澱病对策（买药、在庭院休养）：没有它，后几幕的深澱地会让玩家一直挂着澱热 | PK-M1-10 |
| 切片的 `idFields`（病例与身体的键），M2 存档兼容前补 | 本系统的后续包 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 全程通关里玩家在后几幕的深澱地累积澱染、无药可用 | 澱热（最大生命 -15%、命中 -5）一直挂着，首领战胜率下降；澱化后淤塞每日 +2 | 看本次通关结果；消耗品与自动玩家的对策落地后复查 |
| 第一幕吞服量接近千门预算时澱热变常见 | 第一幕玩家频繁需要欧拉 | PK-M1-42 按本包的灵敏度数字定吞服量 |

**需用户决定**

| 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- |
| 第一幕常规路线的发病设计范围 | 见 README 第 11 节第 1 条 | 不阻塞 |
| 玩家澱化时身体的光环 | 见 README 第 11 节第 2 条 | 不阻塞 |

**下一步与恢复方式**

1. 主会话提交本包文件（见 README 第 7 节）。
2. 计划第 4.2 节 `PK-M1-51` 的状态列建议改为"已完成"（遗留已转出）；项目状态与进度日志由主会话统一改。

### 2026-11-17 收尾：末次改动之后的通关与自动玩家探针

**通关**：末次改动（物品层交接）之后重跑 `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts`，两条都通过（同轮另带一份草稿探针，跑完即删）。审查修正之后、交接之前的一轮也是 2 通过，耗时 991 秒。

**第一幕极简路线的实况**（草稿探针，种子 `SEED`，跑完即删，不进套件）：第一幕走了 20 个清晨，玩家澱染峰值 2.37，没有任何发病；`player.taint` 只写了两次，按 4:1 记的淤塞不到 1 点。
到第二幕时淤塞是 100，全部来自退回门内的过载：37 次退回，每次 +3 或 +6，是千门与战斗的既有代价，与本包无关。这值得 PK-M1-10 与 PK-M1-42 看一眼：极简路线的死亡次数远超第一幕每幕至多 5 次的阈值（[成长 17.4](../../40_design/progression_and_pacing.md)）。
镇内澱度到第二幕时为 39，米洛的病例走到澱化，托比与琳的病例没有触发：极简路线在第 6 周之前就离开了第一幕。
