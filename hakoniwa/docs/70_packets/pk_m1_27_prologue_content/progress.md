# PK-M1-27 序章内容批次：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-18 | 实施、审查与修复 | 全部范围条目；新起会话的覆盖审查 7 条 SHOULD-FIX 与 8 条 NIT，数据与测试能修的已修，其余转请求与遗留 | 未提交 | 见 [verification_matrix.md](verification_matrix.md) 第 2 节 | 1. 主会话提交并再生成生成物；2. PK-M1-24、PK-M1-35 落定后复查演出指令与地球舞台；3. 下表请求交给各负责方 |

## 2. 汇报

### 2026-11-18 实施、审查与修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `data/scenes/prologue.json` | 重写 | 七场 `cut_p_`，272 个节点、449 行台词、213 个选项、18 个锚点节点、327 条演出指令 |
| `data/quests/quests.json` | 修改 | 文件开头加序章任务七条（五条主线、两条探索） |
| `data/quests/acts.json` | 修改 | 序章的引子场景 `prologue` 改为 `cut_p_earth` |
| `data/goddess/goddesses.json` | 修改 | 艾琉恩、梅尔卡的锚点表各追加 A09 的一句（"上面从来不看过程。""……上面在看吗？"） |
| `data/_batches/content_prologue_scenes_01.json`、`data/_staging/index.json` | 新增、修改 | 批次记录与批次索引 |
| `tests/prologue_content.test.ts` | 新增 | 场景链与字段、重选开场、五轮的多轮与归类、锚点节点、无模型与模型档通关（锚点按序各一次）、硬上限、重选开场保留名字 |
| `tests/scenes.test.ts`、`tests/scenes_runner_additions.test.ts`、`tests/client_prologue_stage.test.ts` | 修改 | 场景 id 与节点跳转按七场改写；驱动循环处理 `ui` 等待与地球段的输入 |
| `tests/client_adapters.test.ts`、`tests/client_gamepad_playthrough.test.ts`、`tests/client_player_input.test.ts`、`tests/client_story.test.ts` | 修改 | 驱动循环关闭灵镜；输入次数由 1 变 2（地球段没说出口的话加名字）；开场 B 传送到 `earth_store`；"无演出数据的场景"改用第一幕引子场景 |
| `tests/content_roles.test.ts`、`tests/content_id_guard.test.ts`、`tests/content_validation.test.ts` | 修改 | 样例场景 id 由 `prologue` 改为 `cut_p_earth` |
| `docs/40_design/world_state_registry.md` | 修改 | 第 11 节删去两行已落实的序章导入修正（`courtyard.first_object` 与 `prologue.last_words` 写中文值；`n12_free` 的 `storeAs`） |
| `locales/zh-Hans/content.generated.json`、`src/core/text_keys.generated.ts` | 重新生成 | |
| 本目录 | 新增 | |

**验收逐条结果**

| 验收（包行） | 状态 | 证据 |
| --- | --- | --- |
| 序章全部锚点按序出现 | PASS | `tests/prologue_content.test.ts` 两档通关的 `expectAnchorsInOrder`：A11、A00、A06、A01、A03、A09（问、答）、A04、A05、A07、A02、A08、A10 各一次、说话者正确、顺序递增；`tests/scenes.test.ts` 的锚点各一次 |
| 无模型档能走完 | PASS | `prologue_content`"without a model…"；`scenes.test`；`npm run playthrough` 的 `release`、`rule_merca`、`act1_minimal` |
| 模型档能走完 | PASS | `prologue_content`"with a model…"（模拟模型：五轮第二轮收束、归类到非兜底类别、前世与最后一句自由输入）与"never closes a round"（硬上限）；`scenes.test` 的模型回放 |
| 泄露扫描为 0 | PASS | `node tools/content/validate.ts --warnings`：V5 0 错误，9 条警告全部不属本批（无一条指向 `cut_p_` 或 `q_p_`） |

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 过场目录第 4.1 节"扩写量" | 七场扩写到合计 193 个节点 | 节点在"台词之后出现的演出指令"处切开，续段 id 为 `<原节点>_2`、`_3`（共 272 个节点）；只有指令没有台词的尾部并入前一段 | 演出指令在进入节点时一次执行，没有按台词行定时的字段；不切开时，节点末尾的 `@立绘撤` 会在第一句前就撤掉全部立绘，镜头与音效也会提前。现有节点 id 全部保留为首段 | 否（请求按行定时的指令后可合并） |
| 过场目录 4.1.2"归类的去向" | 面试五轮有模型时只结算类别的效果，再走输入自己的去向 | 每轮加一个归类结算节点 `<轮>_ai`（不会被进入），选项与正文选项同标签、同效果，去向为本轮收尾 | 运行器只有第一种语义（选中并走选项去向），会把写定反应与写定追问再播一遍 | 否（请求第二种语义后可删去结算节点） |
| 过场目录 `cut_p_interview` 的 `n10_past_gate` | 莫伊拉轮有模型时，按对话抽出的前世直接进入前世之后的流程 | 莫伊拉轮归类后进入 `n10_past`，前世由写定问题与它的自由回答决定 | 模型档没有从多轮对话里抽取前世的环节；经 `n10_past_gate` 会让模型档玩家一律被代笔 | 否 |
| 过场目录 `cut_p_door_white` 选择表 | 灵镜的 `creator` 在首位 | 照做（PK-M1-54 曾放在最后） | 自动玩家与测试驱动都已能关闭 `ui` 等待 | 否 |
| 分幕第 1 节；过场目录第 4.1.1 节第 5 条 | 重选开场清空序章旗标 | 清 `p_*` 与 `scene.cut_p_*`，不清 `player.name` | 叫号会再问名字并覆盖；只清旗标会让玩家实体名与旗标不一致 | 是（README 第 11 节第 1 项） |
| 任务目录第 4.2 节 P-M04、P-M05 的前置 | `p_interview_done`、`p_discarded` | 判决之后（`p_rejection_response`，下一期为当场丢弃）、被接住之后（`p_caught`）才开始；文字不提前说出锚点的词 | 任务标题"规格外""接住你了"是锚点原话，早开始会在锚点之前出现在任务日志与通知里 | 是（README 第 11 节第 2 项） |
| 任务目录第 4.3 节 P-S01、P-S02 | 窗口内可接，错过即关闭 | P-S01 在问起空椅子时开始并完成；P-S02 由贴墙听的选项开始（触发写作 `quest.q_p_s02_next_door == active`，只有该选项能让它成立），读 `p_heard_neighbors` 完成 | 自动开始会在日志里提前点出空椅子；补听也写 `p_heard_neighbors`，只有选项能区分两条路 | 否 |
| 过场目录 `cut_p_interview` 希尔薇轮 | S3 写"空院，只有一棵没开花的树" | 写注册表枚举值 `bare_tree` | 注册表第 7.6 节与规则 12（枚举不写中文） | 否 |
| 过场目录 `cut_p_judgement` | 写 `merca_coin.terms` | 写规范名 `p_coin_terms` | 别名从 M2 起是错误 | 否 |
| 过场目录 `cut_p_discard` 的 `n12_free` 与 `n12_drop_now` | 自由说的最后一句写 `free`，空值写 `silent`；当场丢弃写"（没来得及说）" | `n12_drop` 的效果：没有写过 `p_last_words` 且有原话时写 `free`，仍未写时写 `silent`；四个写定选项的复述写成三行带条件的原句；当场丢弃不写 `p_last_words` | 注册表：枚举只有五个值；`{flag:p_last_words}` 会把枚举值原样印出 | 否 |
| 过场目录 `cut_p_discard` 场景头 | 接续 `cut_a1_wake` | 不写 `then` | 第一幕起点还叫 `act1_intro`；收尾的幕切换会播放它 | 否 |
| 过场目录第 13.5 节 `@转场 门扉擦除` | 门框形遮罩转场 | 不写（白场、黑场照写） | `StageDirective` 没有转场指令 | 否（请求） |
| 过场目录 `cut_p_discard` 镜 4 | 全屏静帧 `art_bg_cut_floor_door` | 本场演出为"演出"，静帧未接 | 插画演出按整场显示静帧，而本场前半在面试厅、后半在纯黑 | 否（请求场景中途的静帧指令） |
| 过场目录各场镜头表 | 每镜有机位、景别、运动与调度 | `camera` 写机位、景别、运动；目录点名舞台地点的镜头加 `focus`（地球四景的门、灵镜、帘幕、长椅、号码板、长桌与第六把椅子）；只有"定"的镜头（字幕卡、纯黑）不写 | 其余调度是画面描述，不是地点；指令形状取 PK-M1-24 工作区里的类型 | 否 |
| 分幕第 6 节与台账第 4 节 A09 | 光闪、全体抬头与一问一答同属 A09 | 光闪的节点 `n11_verdict_5` 也标为锚点 | 跳过不能越过光闪 | 否 |

**越界改动与请求回写**

| 文件或负责方 | 原因 | 状态 |
| --- | --- | --- |
| 场景运行器（叙事，PK-M1-54 后续） | 1. 归类的第二种去向（过场目录第 13.6 节）；2. 没有答者的输入也能请求模型归类（`n11_free` 判决后的自由回应在模型档一律落到兜底 R5）；3. 输入的即兴要点（目的、情境、含义键、禁区）没有字段，模型只读到输入提示，八处即兴要点未进数据；4. 执行者插入原句（A11 第一次提到地球、瓦尔妲"不是用拳头输的"、莫伊拉"那我替你写一个"、追问锚点的回避原句）与下一期面试中说出被禁之名当场丢弃；5. 模型档希尔薇轮 S1、S2 从八件物品里选庭院物品、莫伊拉轮从对话抽前世；6. 归类选中的选项不进回看（现在 `scene.choice` 带标签，回看会显示成玩家选的写定选项）；7. 重选开场同时重置被清旗标对应的任务进度（现在序章任务只进不退）与玩家实体名、外观；8. 旧存档里 `prologue` 场景的运行在载入后悬空（序章不存档，只影响冻结样本 `v1/prologue.hks`，2000 tick 回放仍通过）；9. 引擎将来在新游戏时写 `p_mode`，`p_*` 的清单会把它清掉 | 请求 |
| 客户端（PK-M1-22、PK-M1-24） | 1. 转场指令（门扉擦除）；2. 场景中途的全屏静帧（`art_bg_cut_floor_door`）；3. 按台词行定时的演出指令（可合并本批切开的续段；`n13_end` 的字幕现在与"然后，一切都暗了下去。"同时出现）；4. 面试硬上限时莫伊拉敲桌的音效 `sfx_cin_table_knock` 需要带条件的指令 | 请求 |
| PK-M1-35 | 地球四景与 `gap_void` 的地图和地点（`seat`、`counter`、`chairs`、`old_chair`、`car_door`、`freezer`、`exit_sign`、`wardrobe`、`fall`）；本批的传送与镜头焦点用它们，工作区里已有 | 依赖 |
| PK-M1-29 | 六位女神台词包的序章部分（`react.anchor_*`、序章九话题、`quest.q_p_s01_sixth_chair.complete`）；`tests/lines.test.ts` 对每个槽位做不带女神专属反应的语法检查，女神包落地时要一并放宽 | 请求 |
| PK-M1-23 | `tut_p_*`；"重选开场"现在在前四场都可用 | 告知 |
| `data/scenes/speakers.json` | 过场目录第 4.6 节请求登记场景内说话者（醉汉、店长、店员、护士、搬家工人、隔壁三声、帘幕后的声音）；本批沿用逐行显示名 | 遗留（叙事） |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 第一幕起点改名 `cut_a1_wake` 后，`cut_p_discard` 补 `then` | 第一幕过场批次 PK-M1-34 |
| 事迹 `deed_col_earth_keepsakes` 的第一件计数；灶火前世的 `lb_otherworld_menu` 前三页（数据里还没有这件物品） | 事迹批次；生业与史料批次 |
| 第二幕初见勇者团的独白读 `quest.q_p_s02_next_door == done` | 第二幕内容批次 |
| 下一期：回收结局接回 `cut_p_door_white` 的 `n3_cycle`；`n5_cycle_gate` 的莫伊拉兴趣 +1 在重选开场后会再加一次 | M3 终章批次 |
| 场景内说话者登记进 `speakers.json` | 叙事 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 镜头、光、天气、动作指令的形状取自 PK-M1-24 工作区里的类型 | 该包改形状时，数据里的指令被客户端忽略（JSON 不经类型检查） | PK-M1-24 落定后对照 `StageDirective` 复查一次 |
| 地球舞台与 `gap_void` 来自 PK-M1-35 的未提交地图 | 那边改 id 时传送失败（玩家留在候见厅），`client_adapters` 的开场断言失败 | 两包同批提交 |
| 序章任务只进不退 | 在叫号里重选开场后，任务日志会显示已过的阶段 | 运行器请求第 7 项 |

**需用户决定**

| 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- |
| 见 [README.md](README.md) 第 11 节 | | 不阻塞 |
