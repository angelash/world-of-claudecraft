# PK-M1-51 澱染暴露与澱病（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-51` 澱染暴露与澱病 |
| 状态 | 进行中 |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-51` |
| 形态 | 小包 |
| 工作流 | 系统 |
| 量级 | 3 代理人日，0.3 用户人日 |
| 依赖 | PK-M0-29（已完成，历法与成长重标）；PK-M1-16（已完成，地图与地点的正典澱度、`sedimentAt`）；时间跳过内核 PK-M0-31（已完成，跳时处理器） |
| 别名 | 无 |
| 立项日期 | 2026-11-17 |

## 1. 目标

每个被跟踪的身体（玩家必在其中）按所在之处的局部澱度逐时辰累积暴露，每日清晨 06:00（睡醒时同刻）做一次日检：结算当日的环境与穿戴澱染，
在命名随机流 `sed.daily` 上为下一阶段抽一次签；三种澱病以 `aur_st_sed_*` 光环挂上身体，玩家的澱化改为门塞（淤塞），澱斑按规则自愈；
伤病以 `aur_st_injury_*` 光环与各自的时钟运行；第一幕的镇内澱度按幕周结算，孩子的病例按条件推进并镜像给任务与过场；
跳时与逐 tick 结算得到同一世界；第一幕常规路线的发病次数在本文第 2 节的设计范围内。

## 2. 第一幕常规路线的设计范围

计划包行的验收要求"第一幕常规路线的发病次数在设计范围内"，设计文档没有写出数字。本包按以下依据定范围（需用户确认，见第 11 节）：

| 项 | 范围 | 依据 |
| --- | --- | --- |
| 澱化 | 20 个种子全为 0 | 澱化是深澱之地的凡人杀手（[力量 7.6](../../20_world/power_system.md)）；第一幕的地图最深为浓澱 |
| 澱斑 | 出现澱斑的种子占 25% 到 90%；单局至多 2 次 | 灰狼皮起澱斑是欧拉教"净"字的地方（[内容总纲](../../40_design/content/content_bible.md)），所以常见；肯净化、少用晶药的人能避开（[消耗品 2.2][csm]"第一个关于澱的日常取舍"），所以不是必然 |
| 澱热 | 出现澱热的种子至多 2 个（10%）；单局至多 1 次 | 第一、二幕只有欧拉能治澱热（[成长 9.3][pp]），应当罕见 |
| 全幕澱染总得 | 不超过 60 的 120% | 千门第 6.2 节：第一幕全程淤塞约 15，按 4 点澱染记 1 点淤塞约为 60 |

路线画像在 `tests/fixtures/ailments_act1_regular_route.json`：周的节拍按[成长 2.3][pp]与第一幕第 1.2 节，可选内容按常规路线约六成（[成长 17.1][pp]），
地图取地图集的正典澱度，玩家等级按第 2.3 节的预计等级（第 7 周起为凡阶·熟），吞服按[消耗品 2.2、2.4][csm]（野外日的未净饭食、第 7 周起的二阶晶药），
一半的局在第 2 到 5 周穿一件未净的轻档澱纹皮甲（引擎里真的穿上）。吞服量按千门的第一幕预算定，所以"总得"的下限只是画像的自检，上限才是验收。

## 3. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据（文档与节号） |
| --- | --- | --- | --- |
| 1 | 暴露：每游戏时辰按 `sedimentAt` 记一时辰到该档；日检时按每档日率折算（清域 -2、薄澱 -0.3、积澱 +0.2、浓澱 +1、深澱 +3、渊澱 +10，临界按渊澱）；穿戴未净澱纹按 10、5、2 日 1 点（读物品层给出的实例纹档，穿着中长出的纹也算）；净纹按物品层的 `sedResist`（10%、20%、30%，取最高）减澱区的增量 | `src/systems/ailments/formulas.ts` 的 `exposureDelta`、`wearDelta`、`stepBody`；`body.ts` 的 `sampleHour`、`wornPattern`；`data/ailments/config.json` | [成长 9.1][pp]；[消耗品 2.4][csm]；[装备 1.5、2.6][eq] |
| 2 | 日检：06:00 一次，按身体 ID 顺序；只为下一阶段抽一次签，概率为 0 时不抽；位阶每高一阶 ×0.7，孩童与老人 ×1.5（在封顶之后乘） | `formulas.ts` 的 `onsetChance`、`onsetFactor`；`body.ts` 的 `dawnCheck` | [成长 9.2][pp] |
| 3 | 三种澱病：澱斑在澱染低于 15 满 3 日后自愈；澱热、澱化不自愈；治疗按阶段降级；状态光环为常驻被动，死亡不清除 | `formulas.ts` 的 `cureBody`、`cureSteps`；`body.ts` 的 `cureStage`、`itemUsed`；`data/combat/auras.json` 的 `aur_st_sed_*` | [成长 9.3][pp]；[战斗 9.4][cmb]；[技能目录 7.5][cat] |
| 4 | 玩家的特例：澱染镜像到 `player.taint`（取整），千门按其增量记淤塞（本包不重复折算）；澱化当日淤塞 +10，此后每日 +2，身体仍按澱热 | `body.ts` 的 `mirrorPlayer`、`dawnCheck`；`src/systems/doors/costs.ts` 的 `addBlockage`（只调用） | [成长 9.4][pp]；[千门 6.2][td] |
| 5 | 伤病：轻伤 3 日、断肢到治疗为止、淬体反冲 7 日、旧伤复发 14 日，反冲时 30% 同时旧伤复发；玩家只得轻伤与断肢；玩家退回门内时清除全部伤病、保留澱染；`player.injury` 镜像 | `body.ts` 的 `injure`、`healInjury`、`settleInjuries`；`index.ts` | [成长 10.1、10.2][pp]；[技能目录 7.6][cat] |
| 6 | 消耗品接口：`item.used` 的 `taint` 效果、`sed_cure` 效果（数量为澱染栏，`use.sed` 指明能治的阶段）与任意效果上的 `use.taint`（晶药的剂量、未净饭食）；疗程内提前用药（物品层标 `early`）只记 2 点澱染、不生效（药毒一档） | `body.ts` 的 `itemUsed` | [消耗品 2.4、2.9、3.6][csm] |
| 7 | 澱病的终局：玩家以外的身体澱化满 7 日发 `ailments.crystal_due`，由 NPC 与同伴的负责方结算 | `body.ts` 的 `dawnCheck` | [成长 9.3][pp] |
| 8 | 孩子事件链的接口：镇内澱度 `a1_town_dian` 第 1 周 15、每周 +8，堵暗渠后 +3、封泉后 0，外部写入（任务的 -20）照常叠加；病例米洛、托比、琳按条件推进并镜像到 `sed_case.<病例>`，治愈条件成立即 `cured`；死亡与结局仍归剧情 | `src/systems/ailments/story.ts`；`data/ailments/tracks.json`、`cases.json` | [第一幕 7.1、7.2][a1] |
| 9 | HUD 量表数据：`ailmentGauge`（澱染、三道阈值、所处阶段、是否门塞、伤病与结束 tick）与三个镜像旗标；画法归 PK-M1-22 | `src/systems/ailments/view.ts` | [界面 5.2](../../40_design/ux_and_onboarding.md) `ui_hud_gauges` |
| 10 | 跳时：世界的跳时步发出每个时辰与清晨的事件，本系统的处理器每步结算一次剧情钩子；长跳与逐 tick 结果一致 | `index.ts` 的 `registerSkipHandler` | [旅行 7.5](../../40_design/systems/travel_and_exploration.md) |
| 11 | 伏击与目击改读局部澱度 | `src/systems/travel/rest.ts` 的 `sleepAmbushChance`；`src/systems/cognition/witness.ts` 的 `witnessFeat`（只改这一处读法） | 计划包行 |
| 12 | 内容表与校验、存档切片与校验 | `src/content/packs/ailments.ts`；`src/systems/ailments/slice.ts` | [release_engineering.md](../../50_tech/release_engineering.md) 第 5.5 节 |
| 13 | 变量登记：`player.taint`、`player.injury` 改由 ailments 写；新增 `player.sed_stage`、`sed_case.<病例>`、`a1_culvert_sealed`、`a1_north_spring_boarded`；`a1_town_dian` 的写入者 | [world_state_registry.md](../../40_design/world_state_registry.md) 第 2.3、8.1、8.3、8.4、8.6 节；`data/registry/vars.json`（生成） | 注册表第 9 节 |
| 14 | 单测与节奏实测 | `tests/ailments.test.ts`、`tests/ailments_pacing.test.ts`、`tests/ailments_sediment_reads.test.ts`、`tests/ailments_harness.ts` | 计划包行的验收 |

## 4. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | HUD 量表与光环栏的画法；凡人称谓（灰病、灰斑）在光环名上的切换（D-030） | PK-M1-22 |
| 2 | 光环里写不出的效果：澱斑体力恢复 -10%、澱热施法 10% 灵素失控（`combat.proc`）、淬体反冲灵力恢复 -50%、断肢不能用双手武器、玩家断肢门技冷却 +20% | PK-M1-11（战斗规则扩展） |
| 3 | 澱病与伤病消耗品的条目（祛灰水、澱斑膏、退澱热汤等）、`use.sed` 与 `use.taint` 字段的类型、药毒二档与光环 `aur_st_physic_poison`、预防品（祛灰茶、灰巾、祛灰香囊） | PK-M1-13 与消耗品内容批次 |
| 4 | 同伴与具名 NPC 自动纳入暴露；同伴澱化的重伤退场与澱染置 50、凡人的死亡；门纹孩子的免疫 | PK-M1-15、PK-M1-18 |
| 5 | 伤病的来源接线（同伴倒地、首领技能、冲关）与"睡一夜并接受治疗" | PK-M1-11、PK-M1-15 |
| 6 | 澱巢与女神的动态澱度对暴露的影响 | PK-M1-50 |
| 7 | A1-M07 `seal` 选项写 `a1_culvert_sealed` 与 -20；封泉的写入；借形之门的北泉净化（每周 -10） | PK-M1-33、PK-M1-56 |
| 8 | 常规路线自动玩家的真实测量 | PK-M1-10、PK-M1-42 |

## 5. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 相位、切片、端口、文本、内容 ID |
| [成长 9、10][pp] | 规则本体 |
| [第一幕 7.1、7.2][a1] | 镇内澱度与孩子 |
| `src/systems/ailments/index.ts` | 系统入口 |

## 6. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | 随机只走 `sed.daily` 与 `sed.injury`；无墙钟 | `tests/architecture.test.ts`；本包的跳时一致测试 |
| 单一来源 | `player.taint` 是玩家澱染的镜像；千门按其增量折算淤塞 | `tests/ailments.test.ts`、`tests/doors_costs.test.ts` |
| 文本 | 内核只发文本键；系统文字在 `locales/zh-Hans/sys_ailments.json` | `tests/i18n_kernel_guard.test.ts`、`node tools/i18n/check.ts` |
| 内容 ID | 系统代码不写内容 ID；剧情变量与病例都在 `data/ailments/` | `tests/content_id_guard.test.ts` |

## 7. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/ailments/`；`src/content/packs/ailments.ts`；`data/ailments/`；`locales/zh-Hans/sys_ailments.json`；`tests/ailments*.ts`；`tests/fixtures/ailments_act1_regular_route.json`；本目录 |
| 本包修改 | `src/systems/travel/rest.ts`（一处读法）；`src/systems/cognition/witness.ts`（一处读法，PK-M1-18 本波负责该目录）；`data/combat/auras.json`（末尾八条）；`docs/40_design/world_state_registry.md`（第 2.3、8.1、8.3、8.4、8.6 节的行）；`tools/registry/parse.ts`（系统名与槽名）；`docs/50_tech/architecture.md`（相位表一行） |
| 生成物 | `data/registry/vars.json`、`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` |

## 8. 验证命令

```
npx vitest run --config vitest.config.ts tests/ailments.test.ts tests/ailments_sediment_reads.test.ts tests/ailments_pacing.test.ts
npx vitest run --config vitest.config.ts tests/time_skip.test.ts tests/world_mechanics.test.ts tests/doors.test.ts tests/doors_costs.test.ts tests/architecture.test.ts tests/content_id_guard.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts tests/playthrough/release.playthrough.test.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 总闸（新起会话的覆盖审查） | 必派 | 一次贡献结束 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、数据、测试、本目录三件、审查结论 | 主会话 | 抽看 `verification_matrix.md`；本包测试绿 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 第一幕常规路线的发病设计范围（第 2 节） | 推荐按第 2 节；实测在千门预算的 85% 时澱斑约七到八成、澱热 0 到 2%，吞服到满预算时澱热升到约一成，所以第一幕的未净吞服宜控制在澱染总得 50 左右（交 PK-M1-42） | 不阻塞 |
| 2 | 玩家澱化时身体挂哪个光环 | 推荐澱热的光环（成长 9.4"不作用于身体"读作身体停在澱热）；另一读法是不挂光环 | 不阻塞 |

[pp]: ../../40_design/progression_and_pacing.md
[csm]: ../../40_design/content/catalog_consumables_magitools.md
[eq]: ../../40_design/content/catalog_equipment.md
[cmb]: ../../40_design/systems/combat_and_classes.md
[cat]: ../../40_design/content/catalog_abilities_talents.md
[td]: ../../40_design/systems/thousand_doors.md
[a1]: ../../30_story/arcs/act1_borderstone.md
