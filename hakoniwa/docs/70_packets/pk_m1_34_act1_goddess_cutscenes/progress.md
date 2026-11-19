# PK-M1-34 第一幕女神与过场：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-19 | 实施、覆盖性复查、修复 | 第一幕十四场过场与改名；场景运行器增补（自请求触发、演出定时与条件、转场与静帧、归类结算、无答者归类、即兴说明与字面校验、写定锚点、对话抽取、归类不进回看、重选开场的重置）；女神六包 460 句与 `ln_janu`；神谕、托梦、征兆与雅努入夜轮的文字改从台词包取；女神第一幕数据；史料道具 H01 到 H06 与 H21 官译；神谕与梦境音频；转来的请求 | 未提交 | 见 `verification_matrix.md` | 主会话提交；计划状态列建议改为"已完成，带遗留"；第 3 节请求交各负责方 |

## 2. 汇报

### 2026-11-19 实施、覆盖性复查、修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `data/scenes/act1.json` | 重写 | 十四场 `cut_a1_*`：185 节点、543 行台词、488 条演出指令（其中 208 条按台词定时）、41 条战斗吠叫（51 句）、11 个自请求触发；八个旧场景按过场目录第 3.3 节改名或拆并 |
| `data/scenes/lore_items.json`、`lore.json` | 新增 | 史料道具 7 件（`lore_h01` 到 `lore_h06`、`lore_h21` 官译）；`lore.json` 为第一幕以后的史料场景预留，现为空表 |
| `data/scenes/speakers.json` | 修改 | 登记 26 位场景内说话者（序章九位、守护巨鸦、独眼瑟格、乌尔夫与第一幕场景用到的有名人物显示名） |
| `data/scenes/prologue.json` | 修改（只改两处） | `cut_p_discard` 加 `then: cut_a1_wake`；四个重选开场块加 `quest.q_p_*` 与 `resetPlayer`；去掉 24 处已有登记说话者的逐行显示名 |
| `data/scenes/acts2_5.json` | 修改（只删四处） | 第二到五幕引子直写 `seal_looseness` 的四条效果（PK-M1-33 请求第 5 项） |
| `src/systems/scenes/triggers.ts` | 新增 | 自请求触发：无场景播放、无排队时，按内容顺序取第一个"条件成立、玩家在地点、场景所属幕即当前幕"的场景 |
| `src/systems/scenes/stage_steps.ts` | 新增 | 演出指令按条件过滤、`at` 按实际显示的台词重排（被隐藏的台词把指令交给下一句） |
| `src/systems/scenes/improv.ts` | 新增 | 即兴回答的字面校验（`check.must` 至少一个、`check.never` 一个也不能有）与抽取值的白名单过滤 |
| `src/systems/scenes/runner.ts` | 修改 | 见下表"运行器增补"；另修：`once` 已用尽的兜底选项不再被归类重复选中（无模型与模型两条路径都修），模型不能声称自己的话是写定的 |
| `src/systems/scenes/types.ts` | 修改（本包的段；PK-M1-24 的段已由它自己的提交 `f5afadfed9` 收入，现存差异全是本包与 PK-M1-55 的段） | 见下表"`types.ts` 的本包段" |
| `src/systems/scenes/index.ts`、`view.ts` | 修改 | 每 tick 跑触发；新事件 `scene.classified`、`scene.improv_refused`；视图下发重排后的演出指令 |
| `src/systems/quests/progress.ts` | 修改（越界，加法） | `resetQuests`：丢掉任务进度与顺序项，按场景切片同步 `scenesSeen` |
| `src/systems/world/index.ts` | 修改（越界，一处） | 玩家默认外观提成导出常量 `DEFAULT_PLAYER_APPEARANCE` |
| `src/systems/goddess/actions.ts`、`brain/planner.ts`、`index.ts`、`types.ts` | 修改（越界，小） | 动作的 `slots`（按女神的台词槽）；参数 `slot` 只有内核来源可传且须是动作为她登记的槽；执行时从她的台词包抽一句（文本键）；黎明规划与雅努入夜轮改传槽位 |
| `src/content/packs/scenes.ts`、`goddess.ts` | 修改 | 新字段的内容校验（定时下标、条件、转场种类、静帧编号、即兴说明、锚点、抽取、无答者归类、触发的地图与地点）；动作槽位须在她的台词包里 |
| `data/dialogue/lines/ln_{eluen,valda,merca,sylvie,moira}.json`、`ln_janu.json` | 修改、新增 | 台词目录第一幕分册第 2 节六包 460 句（73、59、126、61、66、75），按目录顺序合入，保留本包补的神谕类槽位；`acts.<幕>.<槽>` 行合入包的幕覆盖 |
| `data/goddess/actions.json` | 修改 | 神谕、托梦、征兆的 `slots`（五司 `react.oracle_instruct`，希尔薇 `react.dream_vision`、`react.omen_beast`，雅努 `greet.neutral.dream`），去掉被取代的写定 `lines`（`request` 的委托键保留）；新增 `div_sylvie_bless`、`div_sylvie_migration`；`request` 冷却 72 小时 |
| `data/goddess/brain/reactions.json`、`schemes.json`、`personas.json` | 修改 | `div_react_eluen_01` 改为凝视 +5；盐季谋划加情报步与中止条件；希尔薇第一幕菜单加授予加护（W 4） |
| `data/quests/lore.json` | 修改（追加） | 七件史料的 15 条知识条目（凡人的误读与揭示，揭示读 `read.lore_hNN` 加台账条件） |
| `data/quests/quests.json`、`acts.json` | 修改（越界，只改场景编号） | 八个旧场景编号改为 `cut_a1_*`；`q_a1_m12_tide` 的黎明奖励加 `NOT scene.cut_a1_martha.seen` |
| `src/client/hud/story/divine_audio.ts` | 新增 | 纯核心：女神说神谕类台词时她的主题，梦境舞台放梦境曲，名讳未显的女神不放主题 |
| `src/client/app/story_wiring.ts` | 修改（越界，只加 `sendDivine` 与两行导入） | 每帧算一次音频提示，变化时调 `setDivine`、`setDream` |
| `src/content/references.ts` | 修改（越界，加法） | 见下表"共享文件的本包段" |
| `tools/content/validators/reach.ts`、`namespace.ts`、`lines.ts` | 修改（越界，小） | 见下表"共享文件的本包段" |
| `docs/40_design/world_state_registry.md`、`data/registry/vars.json` | 修改（越界，加法）、重生成 | 见下表"共享文件的本包段" |
| `data/autoplay/routes.json` | 修改（越界，加法） | 审判 `defense` 与梦 `ask` 的选项偏好（旧 `choose` 行指向已不存在的节点） |
| `locales/zh-Hans/content.generated.json`、`src/core/text_keys.generated.ts` | 工具重生成 | `node tools/i18n/extract_content.ts`、`node tools/i18n/gen_keys.ts`（同时带进他包同期的改动） |
| 测试 | 新增、修改 | 新增 `act1_cutscenes`（57）、`scenes_pk34_runner`（20）、`goddess_act1_content`（9）、`lore_documents`（12）、`client_divine_audio`（4）；修改见 `verification_matrix.md` 第 2 节 |
| `docs/70_packets/pk_m1_34_act1_goddess_cutscenes/` | 新增 | 本目录三件 |

**运行器增补（PK-M1-27 请求第 1 到 7 项与过场目录第 13.6 节）**

| 增补 | 做法 |
| --- | --- |
| 自请求触发 `SceneDef.triggers` | 条件、可选地图与地点；无场景播放与排队时检查，场景所属幕须是当前幕；场景必须自己把条件写成假（数据测试逐条验证不会重播） |
| 归类的第二种去向 `classify.settle` | 只结算归类选项的效果，再走输入自己的 `to`；不重播写定反应 |
| 无答者输入的模型归类 `classify.by` | 无答者但有归类的输入也发模型请求（默认旁白、`scene.improv`）；模型只给选项，台词仍是写定回复 |
| 即兴说明 | `SceneBrief`：目的、情境、含义键、禁区原样给模型；执行者按 `check`（`must` 至少含一个、`never` 一个都不能含）校验，不过换回写定台词并发 `scene.improv_refused` |
| 写定锚点 `input.anchor` | 回复之后由执行者说出，每次运行每个节点一次，无模型路径同样说 |
| 对话抽取 `input.extract` | 模型给的值只写节点列出的键、只取允许的值；被拒的回答不抽取 |
| 归类不进回看 | 归类选中不发 `scene.choice`，改发 `scene.classified` |
| 重选开场的重置 `restart.resetPlayer` | 清 `player.name`、`p_appearance`，实体名回 `?`、外观回默认；被清的 `quest.<任务>` 连同其子键清掉，任务进度回到未开始 |
| 演出指令 | `at`（按书写的台词下标，视图按实际显示重排）、`when`（进入节点时读）、`transition`（`door_wipe`、`dissolve`、`cut`）、`still`、`still_end`（`art_bg_cut_*`） |

**`types.ts` 的本包段**（PK-M1-24 的 `camera` 到 `motion` 分支与 `STAGE_*` 常量已由提交 `f5afadfed9` 收入，本包未改；PK-M1-55 在同一文件加了 `TrialSpec`、`SceneNode.present`、`ScenesSlice.trials`，见它的包）

| 段 | 内容 |
| --- | --- |
| `SceneInput` | `classify` 改用 `SceneClassify`（加 `settle`、`by`）；新字段 `improv`、`anchor`、`extract` |
| 新类型 | `SceneClassify`、`SceneBrief`（含 `check`）、`SceneExtract` |
| `SceneImprov` | 加 `meaningKeys`、`forbidden`、`check` |
| `StageDirective` | 并入 `StageDirectiveMore`（`transition`、`still`、`still_end`）；`STAGE_TRANSITIONS`；`StageTiming`、`StageStep`、`ShownStep` |
| `SceneNode.stage` | 类型改为 `StageStep[]` |
| `SceneDef` | 加 `triggers`；新类型 `SceneTrigger` |
| `ShownLine` | 加 `line`（书写下标，供客户端定时用，尚未填，见第 3 节） |
| `SceneRestart` | 加 `resetPlayer` |
| `SceneRun` | 加 `anchored` |

**共享文件的本包段**

| 文件 | 段 |
| --- | --- |
| `src/content/references.ts` | `scenes` 的 `nodes[].input.agentId` 从只认女神改为认全部说话者（审判里卡西安作答）；加 `nodes[].input.anchor[].speaker`、`nodes[].input.classify.by`、`triggers[].mapId` 四行 |
| `tools/content/validators/reach.ts` | 带触发的场景在它所属的幕可达（一段 4 行） |
| `tools/content/validators/namespace.ts` | `lore_h0`、`lore_h1`、`lore_h2` 三个前缀归史料道具（`items` 表），比话题的 `lore_` 长，`lore_heroes` 仍是话题 |
| `tools/content/validators/lines.ts` | `PROVISIONAL` 清空：女神包的覆盖发现改回错误（协调者的要求；六包齐后女神覆盖错误为 0，只剩每包 250 句的总量警告） |
| `docs/40_design/world_state_registry.md` | `quest.<任务>.path` 的写入方加过场 `cut_a1_ash_glimpse`（一格）；新行 `a1_janu_dream_words`（梦中自己作答的原话，文本） |
| `data/registry/vars.json` | `node tools/registry/build.ts` 重生成 |

**转来的请求的处理**

| 请求方与条目 | 处理 |
| --- | --- |
| PK-M1-20 遗留第 7 项（审读占位句；神谕、托梦、征兆改从神谕类槽位取） | 占位句换成台词目录第一幕分册的原句（理由见下"决定"）；动作的 `slots` 与执行时抽句已落地，雅努入夜轮同样取她的包；扩写到每位 250 句不在本包（第 3 节） |
| PK-M1-20 遗留第 8 项（盐季谋划的情报步与中止） | 已补 |
| PK-M1-20 遗留第 11 项（反应行的简化） | `eluen_01` 已按目录改；`all_03` 的记忆标签与"每区每日一次"要新效果与新计数，转 PK-M2-11 |
| PK-M1-27 运行器请求第 1 到 7 项 | 全部落地（上表）；第 8 项旧存档悬空、第 9 项 `p_mode` 不在本包 |
| PK-M1-27 客户端请求第 1 到 4 项（转场、中途静帧、按台词定时、条件指令） | 内核与视图落地；客户端执行转 PK-M1-22、PK-M1-24（第 3 节） |
| PK-M1-27 遗留：序章末 `then`；场景说话者登记 | 已做 |
| PK-M1-33 第 3 节第 5 项（场景不直写 `seal_looseness`） | 第一幕与第二到五幕引子全部去掉 |
| PK-M1-33 第 3 节第 6 项（审判已开过的分支） | `cut_a1_trial` 起点按劫狱、贿赂、已开过分到 `empty`、`bribed`、`held`；任务仍在下场已定时不请求场景，请 PK-M1-33 放开（第 3 节） |
| PK-M1-33 第 3 节第 7 项（灰烬室写 A1-M01 解法） | 写 `quest.q_a1_m01_fall.path`（`bowed`、`spoke`、`struck`）；注册表加过场写入方 |
| PK-M1-33 第 3 节第 8 项（D6 做成场景） | `cut_a1_yeyu_memory`（暗渠版与钟楼版两个触发）；任务里的兜底写入请 PK-M1-33 去掉（第 3 节） |
| 协调者：`cut_a1_trial` 写举证四项 | 写 `a1_trial_evidence`、`a1_trial_testimony`、`a1_trial_debate`、`a1_lamp_exposed` |
| 协调者：雅努的 `seal_looseness >= 10` 门槛由门系统镜像供给 | 确认：场景与任务都不再直写，`seal_looseness` 只由门系统的 `seal_points` 镜像 |
| PK-M1-52 README 第 6 节 | 黄昏段写 `a1_tide_post`、`a1_east_gate_ordered`，在哪都触发、未看过时先播（阶段 1 之前）；暴民段写 `a1_bertha_mob`、`a1_tide_left_post`（阶段 2 内）；核心段读 `a1_tide_stage >= 4`（巨像倒下的三种方式）；`cut_a1_martha` 调 `compute tide_attribution` |
| 协调者：`ln_janu` 与 V8 女神覆盖改回错误 | 已做 |

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 过场目录第 2.4 节"模型改写须含全部含义键" | 含义键逐字出现 | 含义键与禁区原样给模型读；执行者校验另写字面的 `check`（`must` 至少一个、`never` 一个不许） | 含义键是意思，不是固定字句：逐字要求全部会拒掉每一个回答（审判的写定回复本身也缺两个）；禁区是规则句，不能当词匹配 | 是（第 4 节第 1 项） |
| 过场目录各场的分支写法 | 有台词的节点直接分支 | 9 处拆出直通节点 `<节点>_then` | 运行器在台词说完立刻走分支，不等推进 | 否 |
| 过场目录 `cut_a1_wake`、`cut_a1_tide` 的场景头 | 写地图 | 不写场景头地图，起点节点自己传送 | 每段开头都会被传送 | 否 |
| 过场目录 `cut_a1_dream` | `a1_janu_dream_answer` 存玩家原话 | 存三值枚举（自己作答时按归类结算，原话另存 `a1_janu_dream_words`） | 注册表第 7.6 节：枚举 `like`、`unsure`、`dislike` | 否 |
| 过场目录 `cut_a1_trial` 尾声 | 贿赂获释写 `cleared` | 贿赂获释写 `unresolved` | 注册表第 8.8 节与纷争运行器 | 否 |
| 过场目录 `cut_a1_tide` 巨像段 | 夜羽的"澱"无条件 | 按 `term.dian_known` 分两句，之前说"灰" | D-030：钟楼版记忆可能错过 | 否 |
| 过场目录战斗插演表 | 巢中之鸦 5 句、兽潮 50 句 | 吠叫 51 句（鸦 2、潮 49） | 鸦的 80% 召唤、悬石砸中、潮的"鸦！扑它的脸！"没有对应的战斗事件；鸦的 50% 句已在魔物数据的阶段台词 | 否（请求战斗事件，第 3 节） |
| 台词目录第一幕分册的占位句 | PK-M1-20 补写的硬币初用、记账提醒、硬币问候、莫伊拉引语 | 换成分册原句 | 原句是她的口吻（熟客才叫"亲爱的客人"，不白送） | 否 |

**决定**

| 决定 | 理由 |
| --- | --- |
| 触发不记状态，场景自己把条件写成假 | 状态多一份就多一种存档不一致；数据测试逐条验证每个触发播完后不再成立 |
| 触发只在无场景播放、无排队时检查 | 触发不打断场景；期间成立的在下一 tick 补上 |
| 演出 `at` 按书写下标写，视图重排为实际显示下标 | 作者对着剧本写，客户端只数屏幕上的句子 |
| 模型的 `written` 一律不认 | 只有内核来源的兜底才是写定；否则模型能绕过泄露过滤、模型标记与显示名限制 |
| 无答者归类时模型只给选项 | 旁白不应以模型的话发言 |
| 女神主题按资产命名规则 `mus_god_<女神>`，名讳未显的按她的 `hiddenName` 静音 | 系统代码不写内容编号 |
| 神谕类槽位登记在动作数据（`slots`），模型不能传槽位 | 槽位是内核选句的入口，模型只给自己的话 |
| 场景编号改名不加存档改名表行 | 发行前没有玩家存档（与 PK-M1-20 遗留第 18 项同口径） |

**覆盖性复查与处理**（新起的只读子代理一轮，下表是它的发现与处理）

| 发现 | 处理 |
| --- | --- |
| 模型可声称 `written: true` 绕过泄露过滤、模型标记、校验与显示名（回归） | 模型来源一律不认 `written`；补测 |
| 客户端不执行 `at`、`transition`、`still` | 内核与视图已对；客户端执行转 PK-M1-22、PK-M1-24（第 3 节第 1 行） |
| 神谕与梦境音频只在过场里发、而导演按"过场优先"取曲 | 转请求（第 3 节第 2 行）；纯核心与接线保留 |
| 女神目录 17.1 未全过 | 能用现有执行器表达的已补；其余逐条列入第 3 节 |
| 重选开场在真实序章数据里不重置 | 四个重选开场块加 `quest.q_p_*` 与 `resetPlayer`；`player.name` 一并清；用真实序章数据补测 |
| 禁区是规则句、含义键要求全部逐字 | 改为字面 `check`（见"不一致"第 1 行）；补测 |
| 拒绝路径不读台词条件；即兴节点不给模型说明 | 改用按条件过滤的写定台词；`requestImprov` 带说明；补测 |
| 锚点不是"每次运行一次"、无模型路径不说 | 加 `SceneRun.anchored`；无模型路径同样说；补测 |
| 无答者归类时写定回复丢失、旁白以模型的话发言 | 只取模型的选项，台词用写定回复；补测 |
| `resetQuests` 不清 `scenesSeen`、子键残留 | 同步 `scenesSeen`；清 `quest.<任务>.*` |
| 审判 `held`、`empty`、`bribed` 不可达 | 任务的请求条件属 PK-M1-33（第 3 节第 4 行） |
| 兽潮黄昏段不保证在阶段 1 前、核心段只读一个首领旗标 | 黄昏在哪都触发、未看过先播；核心读阶段 4；补测 |
| D6 的首次"澱"被任务兜底抢先 | 任务兜底属 PK-M1-33（第 3 节第 4 行） |
| 贿赂周报写 `cleared`；梦中自己作答写原话进枚举 | 改 `unresolved`；归类为三值，原话另存；补测 |
| 梦中自由提问不结算、用尽的 `why` 循环 | `settle`；`once` 用尽的兜底不再选（两条路径） |
| 雅努的梦仍取 `actions.json` 原句、`lines` 与台词包漂移 | 入夜轮取她的包；被取代的 `lines` 删去 |
| `div_sylvie_bless` 不在任何菜单 | 加入希尔薇第一幕菜单，W 4 |
| 测试过滤掉槽位问题、只测硬编码表 | 槽位问题计入；测试改读数据，跑规划器与裁决器的真路径 |
| 话题的按幕版本键（`topic.*.prologue`）在 `versionBy` 不是幕的话题上选不中 | 转 PK-M1-29（第 3 节第 7 行） |
| 史料只有 H03 可得、`read.*` 无人写 | 转库存与 PK-M1-33、PK-M1-29（第 3 节第 5、6 行） |
| `tests/scenes.test.ts` 四个整局走查失败 | 本包前已失败（PK-M1-52 `progress.md` 已记）；本包只改其中的场景编号 |
| 其余（`ShownLine.line` 未填、`lore.json` 空表、`scene.classified` 不带场景编号、触发说明里的守卫说法、视图每次求值 `when`、`sendDivine` 每帧建集合、13.4 连续失败两次后全用写定、存档改名） | 记入第 3 节或作为已知限制，不阻塞 |

**延后的测试**（用户指示：不跑全量 `npm test` 与 `npm run playthrough`）

| 套件或路线 | 为什么可能受影响 |
| --- | --- |
| `npm run playthrough` 的序章路线与两条全程路线（`release`、`rule_merca`） | 都经过第一幕十四场过场、序章末的 `then`、重选开场的重置与自动玩家的新偏好 |
| `tests/scenes.test.ts` 的整局走查（真结局、梅尔卡之治、新神、全游戏） | 本包前已失败；本包改了第一幕全部场景 |
| `tests/goddess.test.ts` 的揭示台账整局走查 | 同上 |
| `tests/playthrough/goddess_alive_*` | 神谕、托梦、征兆改为台词包的文本键；希尔薇菜单多一项 |
| `tests/save*.test.ts`、冻结样本回放 | 场景改名、新切片字段 `anchored`、玩家默认外观常量 |
| 客户端过场与音频套件（`client_cutscene*`、`client_audio*`） | 视图下发的演出指令带 `at`；音频新调用 |
| 全量 `npm test` | 共享文件的改动与重生成物 |

## 3. 留给后续包的事项与请求

| 序 | 事项 | 建议归属 |
| --- | --- | --- |
| 1 | 过场播放器执行 `at`（按 `reader` 的当前句发指令，不在节点进入时一次发完）、`transition`（失败退化为溶）、`still`、`still_end`；`ShownLine.line` 现在不填，客户端按视图下发的重排 `at` 数句即可 | PK-M1-22（过场播放器）或 PK-M1-24（演出层） |
| 2 | 音频导演"过场优先于神临与梦境"：过场里的女神主题与梦境曲要么由场景的 `@乐` 写明，要么导演在过场里也认 `divine`、`dream`；神谕与托梦动作在过场外（`dialogue.line` 的 `divine`）也要驱动 `setDivine` | PK-M1-22 或音频的后续包 |
| 3 | 女神目录第一幕其余动作与反应行：`div_all_answer_prayer`、`borrow_record`、`message`、`pact`、`accuse`、`revoke`、`trial`、`seek_relic`（无执行器）；`div_eluen_dream_oracle`（缺"对象在睡"的门槛）；`div_merca_intel`、`div_moira_intel`（`intel_reveal` 通道）；`div_moira_title` 等页与台账执行器；`div_sylvie_return`、`div_janu_door_hint`；反应行 `eluen_06`、`valda_08`、`valda_09`、`sylvie_05`、`sylvie_06`（他神的供品渠道）、`merca_04`（假货与赃物谓词）、`valda_02`；`all_03` 的记忆标签与每区每日一次；旧动作编号改为 `div_` 编号（要改代码的分支与存档改名）；`miracle`、`calamity`、`monster_tide` 的可越约标记（`tests/goddess.test.ts` 用 `miracle` 测越约） | PK-M2-11；梅尔卡线的后续包 |
| 4 | 任务侧：`q_a1_m09_trial` 的 `verdict` 在下场已定时仍请求 `cut_a1_trial`（场景自己分到 `held`、`empty`、`bribed`），去掉那句旁白；劫狱（A1-D02.f）写 `a1_oola_jailbroken` 的时机放到审判之前；`q_a1_m07`、`q_a1_m12` 不再兜底写 `term.dian_known`（由 `cut_a1_yeyu_memory` 写）；`q_a1_m12_tide` 的 `core` 阶段与场景的核心选择重复结算；`cut_a1_mark` 与 `q_a1_m13_letter` 的布伦段重叠 | PK-M1-33 |
| 5 | 史料的取得点：`lore_h01`（镇北界石）、`h02`（孩子的童谣）、`h04`（公会登记簿）、`h05`（礼拜堂讲台）、`h06`（孤儿院或欧拉）、`h21`（礼拜堂官译）各需一个 `item` 效果（任务、话题或场景） | PK-M1-33（任务）、PK-M1-29（话题） |
| 6 | 阅读：`inventory.use` 遇 `use.effect: 'read'` 写 `read.<物品>`、不消耗；`has.<物品>` 镜像没有写入方（影响全部 `has.` 条件） | 库存的后续包（PK-M1-13 或 PK-M1-48） |
| 7 | 女神包里 `topic.<话题>.prologue` 一类按幕版本键：话题的 `versionBy` 不是幕时选不中（例：艾琉恩 `topic.gen_self` 只有 `prologue` 键） | PK-M1-29（话题与台词的版本规则） |
| 8 | 战斗事件：首领召唤、悬石砸中首领、灰壳被击碎（插演表三句没有事件可挂） | PK-M1-12 |
| 9 | 女神台词包扩写到每位 250 句（第二到第六幕） | M2、M3 台词批次 |
| 10 | 过场目录回写：`held` 分支、效果在台词之前生效（目录写成先台词后效果的几处）、含义键与 `check` 的分工、抽取是"AI 不写旗标"的例外 | 过场目录的维护（叙事） |
| 11 | 过场目录第 13.4 节"同一场连续失败两次后余下即兴全用写定" | 场景运行器的后续包 |
| 12 | `scene.classified` 带场景编号并进客户端的故事事件 | PK-M1-22 |

## 4. 需用户决定

| 序 | 事项 | 现状 | 选项 |
| --- | --- | --- | --- |
| 1 | 即兴回答的校验口径 | 含义键与禁区给模型读；执行者只查字面 `check`（至少含一个核心短语、不含禁词） | 保持；或按目录逐字要求全部含义键（实际会拒掉全部模型回答） |
| 2 | 门口的女人在名讳显现前不放主题 | 梦境里只放梦境曲 | 保持；或第一幕的梦也叠她的动机种子 |
