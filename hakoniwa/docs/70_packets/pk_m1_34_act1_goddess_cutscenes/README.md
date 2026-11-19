# PK-M1-34 第一幕女神与过场（别名：`content_act1_cutscenes_01`、女神第一幕批次）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-34` 第一幕女神与过场 |
| 状态 | 进行中（建议主会话改为"已完成，带遗留"，依据见 `verification_matrix.md`；遗留与转去的包见 `progress.md` 第 3 节） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-34` |
| 形态 | 小包三件（单会话完成，范围由计划包行与转来的请求写定） |
| 工作流 | 内容（含场景运行器增补） |
| 量级 | 3 代理人日，0.5 用户人日 |
| 依赖 | PK-M1-20（已完成：女神大脑、写定神行、梅尔卡往来账）；PK-M1-27（已完成：七个 `cut_p_`）；PK-M1-54（已完成：场景运行器第一批增补）；PK-M1-52（兽潮之夜的接口，见其 README 第 6 节）；PK-M1-33（第一幕任务，场景编号的请求方） |
| 立项日期 | 2026-11-18 |

## 1. 目标

第一幕的十四场过场按过场目录第 5 节写成场景数据并接上任务；女神有第一幕的台词包（六包，含门口的女人 `ln_janu`）、神谕与托梦的文字从她自己的台词包取；第一幕史料道具 H01 起有物品与知识条目；场景运行器补上序章转来的增补（只结算归类效果、无答者输入的模型归类、即兴说明、写定锚点、对话抽取、归类不进回看、重选开场的重置）与第一幕要用的自请求触发、按台词定时与带条件的演出指令、转场与中途静帧；客户端在女神开口与梦境时调用 `GameAudio.setDivine`、`setDream`。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 第一幕十四场过场 `cut_a1_wake` 到 `cut_a1_letter`：节点、台词、选项、效果、演出、梗概、分段、战斗吠叫；八个旧场景按第 3.3 节改名或拆并，引用它们的任务与幕定义同批改名 | `data/scenes/act1.json`；`data/quests/quests.json`、`acts.json`（只改场景编号） | 过场目录第 2、3.3、5、13.9 节 |
| 2 | 自请求触发：没有任务阶段请求的过场（落门第二段、灰烬室复访、巢中之鸦、进镇、识才之门、夜羽的记忆、兽潮之夜四段）按条件与地点自己请求 | `SceneDef.triggers`；`src/systems/scenes/triggers.ts` | 过场目录第 5 节各条目"触发"行 |
| 3 | 演出指令：`at`（按台词定时）、`when`（条件指令）、`transition`（门扉擦除、溶、切）、`still` 与 `still_end`（演出中途的全屏静帧）；视图按实际显示的台词重排 `at` | `src/systems/scenes/types.ts`（`StageDirectiveMore`、`StageTiming`、`ShownStep`）；`stage_steps.ts`；`view.ts` | 过场目录第 2.3、13.5 节；PK-M1-27 请求 |
| 4 | 序章转来的运行器增补：归类的第二种去向（`classify.settle`）；无答者输入的模型归类（`classify.by`）；即兴说明（目的、情境、含义键、禁区，与执行者的字面校验 `check`）；写定锚点（`input.anchor`，每次运行一次）；从对话抽取取值（`input.extract`）；归类选中不进回看（`scene.classified`）；重选开场时重置任务进度、玩家实体的名字与外观（`restart.resetPlayer`） | `src/systems/scenes/runner.ts`、`improv.ts`、`types.ts`；`src/systems/quests/progress.ts`（`resetQuests`）；`src/systems/world/index.ts`（`DEFAULT_PLAYER_APPEARANCE`） | 过场目录第 2.4、4.1.2、13.6 节；PK-M1-27 `progress.md` 请求第 1 到 7 项 |
| 5 | 序章末 `then: cut_a1_wake`；四个重选开场块加任务与玩家重置 | `data/scenes/prologue.json` | PK-M1-27 遗留 |
| 6 | 场景内说话者登记（序章九位与第一幕场景内说话者） | `data/scenes/speakers.json` | 过场目录第 4.6、14.5 节 |
| 7 | 女神台词包：五司与门口的女人六包的序章、第一幕与跨幕基础（460 句）；审读 PK-M1-20 补写的占位句；神谕、托梦、征兆的文字改从她台词包的槽位取（动作的 `slots`），雅努的入夜轮同样取她的包 | `data/dialogue/lines/ln_{eluen,valda,merca,sylvie,moira,janu}.json`；`data/goddess/actions.json`；`src/systems/goddess/`（`actions.ts`、`brain/planner.ts`、`index.ts`、`types.ts`） | 台词目录第一幕分册第 2 节；女神目录第 1.1、1.6 节；PK-M1-20 遗留第 7 项 |
| 8 | 女神第一幕数据：新动作 `div_sylvie_bless`、`div_sylvie_migration` 与 `request` 的冷却；`div_react_eluen_01` 按目录改为凝视；"魔物季的盐与药"补情报步与中止条件；希尔薇第一幕菜单加授予加护 | `data/goddess/actions.json`、`brain/reactions.json`、`brain/schemes.json`、`brain/personas.json` | 女神目录第 2、5.3、5.4、6 节；PK-M1-20 遗留第 8、11 项 |
| 9 | 第一幕史料道具 H01 到 H06 与 H21 官译：物品与知识条目（凡人的误读与揭示） | `data/scenes/lore_items.json`；`data/quests/lore.json` | 编年史第 12 节；遗物目录第 1.8 到 1.10 节 |
| 10 | 神谕与梦境的音频：女神说神谕类台词时她的主题，梦境舞台（混响区 `dream`）放梦境曲 | `src/client/hud/story/divine_audio.ts`（纯核心）；`src/client/app/story_wiring.ts`（`sendDivine`） | 音频方向第 5.1 节第 4、5 条 |
| 11 | 转来的请求：场景不直写 `seal_looseness`（含第二到五幕引子）；审判"已开过"的分支；灰烬室写 A1-M01 的解法；暗面节拍 D6 是场景；兽潮黄昏段与暴民段的写入时机；玛莎一刀调 `compute tide_attribution`；V8 女神覆盖改回错误 | 同上与 `tools/content/validators/lines.ts` | PK-M1-33 第 3 节第 5 到 8 项；PK-M1-52 README 第 6 节；协调者 |
| 12 | 校验与工具：场景新字段的内容校验；触发场景的可达性；`lore_h` 命名空间；`scenes` 的引用行；`quest.<任务>.path` 的过场写入方；自动玩家对审判与梦的选项偏好 | `src/content/packs/scenes.ts`、`goddess.ts`；`tools/content/validators/reach.ts`、`namespace.ts`；`src/content/references.ts`；`docs/40_design/world_state_registry.md`；`data/autoplay/routes.json` | 内容校验 V2、V3、V4、V9 |
| 13 | 测试 | `tests/act1_cutscenes.test.ts`、`scenes_pk34_runner.test.ts`、`goddess_act1_content.test.ts`、`lore_documents.test.ts`、`client_divine_audio.test.ts`；改：`prologue_content`、`scenes`、`scenes_runner_additions`、`goddess_beats`、`goddess_reactions`、`goddess_brain`、`act1_quests`、`client_story`、`client_adapters`、`client_purity` | 见 `verification_matrix.md` |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 女神目录第一幕其余动作与反应行里需要新执行器、新事件或新谓词的部分（逐条见 `progress.md` 第 3 节） | PK-M2-11 与梅尔卡线的后续包 |
| 2 | 女神台词包扩写到每位 250 句（第二到第六幕的覆盖） | M2、M3 的台词批次 |
| 3 | 客户端执行 `at`、`transition`、`still`（过场播放器的演出层） | PK-M1-22 或 PK-M1-24（请求见 `progress.md` 第 3 节） |
| 4 | 史料道具的取得点（H03 以外）与"阅读"写 `read.<物品>` | PK-M1-33、PK-M1-29、库存（请求见 `progress.md` 第 3 节） |
| 5 | 审判的证物出示与反驳 | PK-M1-55 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| [catalog_cutscenes.md](../../40_design/content/catalog_cutscenes.md) 第 2、3.3、5、13 节 | 过场数据与演出 |
| [catalog_dialogue_lines_act1.md](../../40_design/content/catalog_dialogue_lines_act1.md) 第 2 节 | 女神台词包 |
| [catalog_goddess_interventions.md](../../40_design/content/catalog_goddess_interventions.md) 第 1、2、5、6、17 节 | 女神第一幕数据与验收 |
| [history.md](../../20_world/history.md) 第 12 节 | 史料道具 |
| [audio_direction.md](../../40_design/audio_direction.md) 第 5.1 节 | 神临与梦境 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性 | 触发按内容顺序取第一个成立的、不抽签；场景没有新随机 | `tests/architecture.test.ts`；`tests/scenes_pk34_runner.test.ts` |
| 系统不写内容编号 | 触发、演出重排、即兴校验、女神台词槽都读数据；女神主题按资产命名规则、梦境按地图的混响区，隐藏名讳的女神按她自己的 `hiddenName` | `tests/content_id_guard.test.ts` |
| 文本 | 女神的话是她台词包的文本键；模型不能声称自己的话是"写定"、不能传台词槽、不能写清单外的旗标 | `node tools/i18n/check.ts`；`tests/scenes_pk34_runner.test.ts`；`tests/goddess_act1_content.test.ts` |
| 揭示纪律 | 第一幕凡人台词不出现"澱"（D-030）；门口的女人在 `a6_name_spoken` 前不显示名讳，主题也不播 | `tests/act1_cutscenes.test.ts`；`tests/client_divine_audio.test.ts` |

## 5.1 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/scenes/{triggers,stage_steps,improv}.ts`；`src/client/hud/story/divine_audio.ts`；`data/scenes/{lore,lore_items}.json`；`data/dialogue/lines/ln_janu.json`；上表新测试；本目录 |
| 本包修改 | `src/systems/scenes/{runner,index,view,types}.ts`；`data/scenes/{act1,prologue,speakers,acts2_5}.json`；女神五包；`data/goddess/{actions.json,brain/reactions.json,brain/schemes.json,brain/personas.json}`；`src/systems/goddess/{actions,index,types}.ts`、`brain/planner.ts`；`src/content/packs/{scenes,goddess}.ts`；`data/quests/lore.json`（追加） |
| 越界改动（写进 `progress.md`） | `src/systems/quests/progress.ts`（`resetQuests`）；`src/systems/world/index.ts`（`DEFAULT_PLAYER_APPEARANCE`）；`src/client/app/story_wiring.ts`（`sendDivine`）；`data/quests/{quests,acts}.json`（场景编号）；`src/content/references.ts`；`tools/content/validators/{reach,namespace,lines}.ts`；`docs/40_design/world_state_registry.md`；`data/registry/vars.json`（重生成）；`data/autoplay/routes.json`；他包测试里的场景编号与断言 |

## 6. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。

## 7. 验证命令

```
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.config.ts tests/act1_cutscenes.test.ts tests/scenes_pk34_runner.test.ts tests/scenes_runner_additions.test.ts tests/prologue_content.test.ts tests/goddess_act1_content.test.ts tests/goddess_brain.test.ts tests/goddess_reactions.test.ts tests/goddess_beats.test.ts tests/goddess.test.ts tests/goddess_region.test.ts tests/director_menu.test.ts tests/director.test.ts tests/lore_documents.test.ts tests/lines.test.ts tests/lines_coverage.test.ts tests/act1_quests.test.ts tests/client_story.test.ts tests/client_adapters.test.ts tests/client_prologue_stage.test.ts tests/client_stage_direct.test.ts tests/client_divine_audio.test.ts tests/client_purity.test.ts tests/content_validation.test.ts tests/content_id_guard.test.ts tests/i18n_kernel_guard.test.ts tests/architecture.test.ts
```

全量 `npm test` 与 `npm run playthrough` 按用户的指示延后（`progress.md` 第 2 节"延后的测试"）。

## 8. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起子代理） | 必派 | 一次贡献结束 |

## 9. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、数据、测试、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；本包验证命令绿 |
| `progress.md` 第 3 节的请求 | PK-M1-22、PK-M1-24、PK-M1-29、PK-M1-33、PK-M1-52、库存、PK-M2-11 | 各自按表处理 |

## 10. 需用户决定

见 `progress.md` 第 4 节。
