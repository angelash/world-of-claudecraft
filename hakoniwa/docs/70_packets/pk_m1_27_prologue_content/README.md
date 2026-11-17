# PK-M1-27 序章内容批次（别名：content_prologue_scenes_01）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-27` 序章内容批次 |
| 状态 | 进行中（实施与验证已完成，建议主会话提交后改为"已完成"，见 [verification_matrix.md](verification_matrix.md)） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-27` |
| 形态 | 内容批次（4 代理人日）；按本目录约定只写入口、验收与进度三件，批次记录在 `data/_batches/content_prologue_scenes_01.json` |
| 工作流 | 内容 |
| 量级 | 4 代理人日，1 用户人日 |
| 依赖 | PK-M0-26；PK-M1-22（过场播放器）；PK-M1-54（舞台机制与运行器增补）；地球舞台与 `gap_void` 的地图来自并行的 PK-M1-35 |
| 立项日期 | 2026-11-17 |

## 1. 目标

序章先行（D-096）：把现有的单个场景 `prologue` 拆成过场目录第 4 节的七场 `cut_p_earth`、`cut_p_door_white`、`cut_p_quarrel`、`cut_p_call`、`cut_p_interview`、`cut_p_judgement`、`cut_p_discard`，
按过场目录第 4.2 节的场景脚本扩写到成品台词，写入演出、演出指令、跳过梗概与锚点；面试五轮在有模型时是多轮对话，结束方式写入 `p_round_end.<女神>`；
前四场可"重选开场"；导入任务目录（前）第 4 节的序章任务 `q_p_m01` 到 `q_p_m05`、`q_p_s01`、`q_p_s02`。
包行验收：序章全部锚点按序出现；无模型与模型档都能走完；泄露扫描为 0。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 七场拆分与扩写：场景头（标题、幕、地图与位置、起点、接续、收尾），台词、选项、效果、输入、分支逐行按目录脚本；现有节点 id 原样沿用 | `data/scenes/prologue.json`（一个文件放七场） | 过场目录第 4.1.1、4.1.2、4.2 节 |
| 2 | `presentation`（面试为剧场，其余为演出）、`summary`（第 13.9 节梗概原文）、节点 `anchor`（含锚点台词的节点） | 同上 | 过场目录第 13.1、13.9 节；界面第 8.3、8.4 节；分幕第 6 节 |
| 3 | `stage`：音乐、音效、环境、静默、立绘、黑白场、字幕、震屏，镜头（`@镜` 按各场镜头表的机位、景别与运动；目录点名舞台地点的镜头带 `focus`）、光、天气、动作；PK-M1-54 的门、偷听与坠落挂点保留 | 同上 | 过场目录第 2.3、13.5 节；PK-M1-54 第 10 节交接 |
| 4 | 面试五轮：自由回答的输入写 `turns`（软 6 硬 10，`storeAs: p_round_end.<女神>`），模型归类只结算该类别的效果再进本轮收尾 | 同上（各轮的归类结算节点 `<轮>_ai`） | 过场目录 `cut_p_interview` 的"有模型时的面试规则"；分幕第 1、4.8 节 |
| 5 | 重选开场：`cut_p_earth` 到 `cut_p_call` 各带 `restart`（无 `until`），清 `p_*` 与 `scene.cut_p_*`，收回四件遗物与号码牌 | 同上 | 分幕第 1 节节拍规则；过场目录第 4.1.1 节第 5 条 |
| 6 | 灵镜：`creator`（`ui_mode_creator`）放在首位，六个快照在后 | 同上 | 过场目录 `cut_p_door_white` |
| 7 | 序章任务七条 | `data/quests/quests.json` | 任务目录（前）第 4 节 |
| 8 | 开场幕的引子场景改为 `cut_p_earth` | `data/quests/acts.json` | 过场目录第 3.3 节 |
| 9 | 锚点补齐：艾琉恩、梅尔卡人格卡的锚点表补上 A09 的问与答 | `data/goddess/goddesses.json` | 诸神正典第 9 节；台账第 4 节 |
| 10 | 批次记录 | `data/_batches/content_prologue_scenes_01.json`、`data/_staging/index.json` | 发行工程第 7.3 节 |
| 11 | 测试：本包新测试与拆分引起的测试更新 | `tests/prologue_content.test.ts`；见第 6 节 | |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 地图：P0 候见厅外观、P1 到 P4 地球布景、`gap_void`；P2 在可操作场景里把门实体摆到转角 | PK-M1-35 |
| 2 | 六位女神的台词包 `ln_eluen` 等（含 `react.anchor_*` 与序章九话题） | PK-M1-29（计划包行"6 位女神第一批"） |
| 3 | `tut_p_*` 引导 | PK-M1-23 |
| 4 | 运行器与客户端功能（转场指令、场景中途的全屏静帧、按台词行定时的指令、归类的第二种去向、模型档从对话里抽取前世与庭院物品） | 见 [progress.md](progress.md) 的请求表 |
| 5 | 第一幕起点改名 `cut_a1_wake`（本批最后一场不写 `then`，由幕切换播放第一幕的引子场景） | 第一幕过场批次 PK-M1-34 |
| 6 | 下一期（`cycle >= 2`）的入口：回收结局接回候见厅 | M3 终章批次（本批按目录写好了下一期的节点，当前不可达） |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| [prologue_antechamber.md](../../30_story/arcs/prologue_antechamber.md) | 序章正典：节拍、台词稿、锚点、无模型对话树、产出的世界状态 |
| [catalog_cutscenes.md](../../40_design/content/catalog_cutscenes.md) 第 2.2、4、13 节 | 七场的脚本与播放器契约 |
| [catalog_quests_acts1_3.md](../../40_design/content/catalog_quests_acts1_3.md) 第 4 节 | 序章任务 |
| [reveal_ledger.md](../../30_story/reveal_ledger.md) 第 4、8.1 节 | 锚点回扣与序章禁区 |
| [PK-M1-54 包](../pk_m1_54_prologue_stage/README.md)、[PK-M1-22 包](../pk_m1_22_hud_dialogue/README.md) | 运行器字段与过场字段 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 正典 | 锚点一字不差；分幕与目录冲突时按分幕 | `tests/prologue_content.test.ts` 的锚点顺序；`tests/scenes.test.ts` 的锚点各一次 |
| 揭示 | 玩家可见文本（台词、选项、输入提示、梗概、任务文字）不早于台账解锁 | V5（`node tools/content/validate.ts`） |
| 变量 | 只写注册表里的规范名与值（`p_coin_terms`，不用别名 `merca_coin.terms`；`p_courtyard_object` 写枚举值） | V4、`node tools/registry/build.ts --check` |
| 文本 | 数据里的中文由抽取工具生成内容键；禁用字符为 0 | `node tools/i18n/check.ts`；文档守卫 |
| 不碰系统代码 | `src/systems/**`、`src/core/**`、`src/client/**` 一行未改 | 改动清单 |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 数据 | `data/scenes/prologue.json`、`data/quests/quests.json`、`data/quests/acts.json`、`data/goddess/goddesses.json`、`data/_batches/content_prologue_scenes_01.json`、`data/_staging/index.json` |
| 新测试 | `tests/prologue_content.test.ts` |
| 拆分引起的测试更新 | `tests/scenes.test.ts`、`tests/scenes_runner_additions.test.ts`、`tests/client_prologue_stage.test.ts`、`tests/client_adapters.test.ts`、`tests/client_gamepad_playthrough.test.ts`、`tests/client_player_input.test.ts`、`tests/client_story.test.ts`、`tests/content_roles.test.ts`、`tests/content_id_guard.test.ts`、`tests/content_validation.test.ts` |
| 重新生成 | `locales/zh-Hans/content.generated.json`、`src/core/text_keys.generated.ts`（主会话提交时再生成一次） |
| 文档 | 本目录；`docs/40_design/world_state_registry.md` 第 11 节两行已落实的导入修正（只删这两行） |
| 不得修改 | 其他并行包的文件：`src/systems/**`、`src/core/**`（生成物除外）、`src/client/**`、`data/scenes/maps.json`、`data/combat/**`、`data/world/**`、`data/npc/**`、`data/dialogue/lines/ln_common.json`、`src/editor/**`、`tools/assets/**`、`tools/audio_gen/**`、`tools/dev_api.ts`、`assets/`、`docs/README.md`、`docs/10_research/` |

## 7. 停止条件

dev_process 第 3.6 节全部适用；本包未触发。

## 8. 验证命令

在 `hakoniwa/` 下运行：

```
npx vitest run --config vitest.config.ts tests/prologue_content.test.ts tests/scenes.test.ts tests/scenes_runner_additions.test.ts
npx vitest run --config vitest.config.ts tests/client_prologue_stage.test.ts tests/client_adapters.test.ts tests/client_gamepad_playthrough.test.ts tests/client_player_input.test.ts tests/client_story.test.ts tests/content_roles.test.ts tests/content_id_guard.test.ts tests/content_validation.test.ts tests/quests.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npm test
npm run playthrough
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 新起会话的覆盖审查 | 必派 | 正典忠实、锚点顺序、泄露规则、需求覆盖；结论见 [verification_matrix.md](verification_matrix.md) 第 3 节 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 七场 `cut_p_` 的演出指令（含镜头、光、天气、动作） | PK-M1-24（客户端执行） | 指令形状与 `src/systems/scenes/types.ts` 的 `StageDirective` 一致；该包落定后复查一次 |
| 地球舞台的传送（`earth_train`、`earth_store`、`earth_hospital`、`earth_house` 的起点，`gap_void` 的 `fall`） | PK-M1-35 | 地图与地点存在（当前工作区已有） |
| 女神台词包的序章部分与锚点槽 | PK-M1-29 | 包里的锚点句与本批场景台词逐字一致 |
| 主会话 | 数据、测试、本目录 | 抽看验收表；第 8 节命令在其他并行包落定后全绿 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 重选开场是否清 `player.name` | 本包定为不清：叫号时莫伊拉会再问一次名字并覆盖；运行器清旗标时不发 `flag.changed`，只清旗标会让玩家实体的名字（世界系统只在写入时同步）与旗标不一致。若要清，需要运行器同时重置实体名（请求见 progress） | 不阻塞 |
| 2 | 序章任务"规格外""接住你了"的开始时机 | 本包让它们在判决之后、被接住之后才开始，标题不抢在锚点台词之前出现；目录写的前置是 `p_interview_done` 与 `p_discarded`。推荐维持本包做法 | 不阻塞 |
