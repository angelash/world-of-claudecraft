# PK-M1-19 内置 AI：话题图与对话：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-18 | 实施、覆盖性复查、修复 | 话题图（数据、校验、拒答表、菜单、转移、轮转、防死循环、耐心）；序章分支对话树的规则归类与过场端口；说服选项；居民请托与首领每周发布；权威背书与近处重复；对话与审判的身份暴露；反应表的对话选项；测试 | 未提交 | 见 `verification_matrix.md` | 主会话提交；第 4 节请求转 PK-M1-27、PK-M1-29；计划状态列建议改为"已完成" |

## 2. 汇报

### 2026-11-18 实施、覆盖性复查、修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/dialogue/topics/`（`types.ts`、`content.ts`、`graph.ts`、`access.ts`、`menu.ts`、`talk.ts`、`ledger.ts`、`index.ts`） | 新增 | 话题图：字段与校验、索引与自由提问匹配、第 6.6 节拒答表、菜单与转移、会话中的回答与拒答、未解锁线索的不确认 |
| `src/systems/dialogue/topic_session.ts` | 新增 | 话题菜单的打开与返回、推荐话题选项、耐心 |
| `src/systems/dialogue/persuade.ts` | 新增 | 说服选项与尝试，发 `dialogue.persuaded` |
| `src/systems/dialogue/reaction_offers.ts` | 新增 | 反应表各行的对话选项（效果是封闭集合：关系、付钱、守秘、请托） |
| `src/systems/dialogue/commissions/`（`needs.ts`、`requests.ts`、`session.ts`、`index.ts`） | 新增 | 需求到请托模板的映射、个人请托、首领每周的发布意图、对话里的应允与推辞、办成后的关系与记忆 |
| `src/systems/dialogue/prologue/`（`answers.ts`、`port.ts`） | 新增 | 序章自由回答的规则归类（面试五轮、前世、判决回应）与自由提问到序章话题；向过场运行器登记 |
| `src/systems/dialogue/`（`index.ts`、`session.ts`、`replies.ts`、`speak.ts`、`types.ts`、`intent/respond.ts`） | 修改 | 内置选项"话题"；R1、R3、R4 经话题图；台账防护；会话上下文（待答问题只加分一轮、当前话题）；耐心；说服、请托、反应选项的接线；`speak` 的按序轮转；切片与会话的新字段（全部可缺省） |
| `src/systems/cognition/sources.ts` | 新增 | 权威权重与背书、公会晋级的承认、教会才管的解释、旗标暴露、自曝被采信、当面对上号（只对当事人） |
| `src/systems/cognition/`（`index.ts`、`rumor.ts`、`witness.ts`、`types.ts`） | 修改 | 订阅 `guild.registered`、`guild.promoted`、`flag.changed`；传话时的权威背书；近处重复目击的来源放宽到"另一件事迹"；`keepQuiet`；切片字段 `matched` |
| `src/systems/scenes/answer_port.ts` | 新增（越界，加法） | 过场自由输入的规则归类端口（登记一个分类函数） |
| `src/systems/scenes/runner.ts`、`types.ts`；`src/content/packs/scenes.ts` | 修改（越界，小） | `cmdInput` 先问规则归类，有结果就作为无模型结果与模型请求的兜底；`classify.fallback` 可缺省（缺省时规则不归类就照写好的回答走 `to`） |
| `src/systems/quests/`（`objectives.ts`、`objective_events.ts`、`index.ts`） | 修改（越界，小） | 打开对话不再满足 `persuade`；新查询 `openPersuasions`；订阅 `dialogue.persuaded` |
| `src/systems/guild/`（`board.ts`、`types.ts`） | 修改（越界，最小钩子） | `post` 的 `giver`、`payCap`、`personal`；个人请托由本人付、无抽成、交给本人、不计公会履历与违约 |
| `src/game/autoplay/objective_plan.ts`、`player.ts` | 修改（越界，小） | 自动玩家对 `persuade` 目标去选"说服" |
| `src/content/packs/dialogue.ts`、`cognition.ts` | 修改 | 装载话题、序章归类、请托与首领规则、反应选项、认知来源；各自的内容校验与编辑器表单 |
| `tools/content/validators/player_text.ts`、`namespace.ts`、`lines.ts` | 修改（越界，小） | 话题标题与反应选项文字进内容抽取与泄露扫描；话题前缀归 `topics` 表；台词包的话题槽位必须已登记 |
| `data/dialogue/topics/`（`generic.json`、`prologue.json`、`act1.json`）、`topic_cast.json`、`prologue_answers.json`、`commissions.json`、`reaction_options.json`；`data/cognition/sources.json` | 新增 | 见 `README.md` 第 2 节 |
| `data/dialogue/lines/ln_common.json` | 修改（只追加新槽位） | `topic.gen_*`（目录第 4.2 节）与 `react.deny`、`evade`、`persuaded`、`unpersuaded`、`identity_claim`、`identity_guest`、`identity_matched`、`no_work`、`declined`、`promise_noted`、`ask_help`（目录第 4.3 节原句） |
| `locales/zh-Hans/sys_dialogue.json`、`sys_cognition.json` | 修改 | 新系统文本键；重生成 `src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json`（同时带进了他包同期的改动） |
| `docs/40_design/systems/builtin_ai.md` | 修改 | 第 1.7 节数据落点；第 6.2 节话题图的补充字段与实现位置；第 6.6 节台账防护 |
| `tests/dialogue_topics.test.ts`、`dialogue_topics_harness.ts`、`dialogue_prologue_answers.test.ts`、`dialogue_talk_extras.test.ts` | 新增 | 见 `verification_matrix.md` |
| `tests/dialogue.test.ts`、`tests/quest_model.test.ts` | 修改 | 内置选项多了"话题"；说服目标要说服才满足；自动玩家的说服计划 |

**决定**

| 决定 | 理由 |
| --- | --- |
| 话题图按幕分文件（`data/dialogue/topics/*.json`），话题字段在设计之外补了 `owners`、`region`、`act`/`until`、`locked`/`lockedBy`、`mis`、`aliases`、`keywords`、`introduced`、`scene`、`service`、`askOnly`、`trouble` | 设计第 6.2 节的字段不足以表达目录第 3.3 节的"范围""首次可谈""台账"三列与序章的作答；已回写设计第 6.2 节 |
| 自由提问时，句中实体从后往前找话题（头名词在后），说话者能谈的优先、本人话题优先；意图归错类时仍按句中点名的话题作答 | "遗迹里的神纹"被分到问地方，但真正问的是神纹 |
| 话题图登记了的编号，一律不再按槽位名直接读台词 | 绕过话题图会跳过范围、条件、层级、信任与幕次 |
| 误导版本是真诚的回答，不计入拒答次数与耐心 | 台账第 0.2 节：说误导版本的人自己相信 |
| 台账防护：这一轮没有话题作答而说中了未解锁线索时，知情者回避、不知情者当作胡话；同一线索第三次结束会话 | 第 6.6 节第 5、6 行与防死循环；线索的逐条处理方式表在台账里还没有数据化 |
| 当面对上号与自曝被采信只让当事人反应（不再按 10 格广播） | 旁人没听见传闻也没听见自白 |
| 权威背书只由已接受玩家事迹的权威在传话时附带；邪术与神迹两种解释只有教会的权威才推得动；公会晋级（不含 F 级登记）算公会的承认，实字档 2、常规 3 | 名声与认知第 3.1、3.4、4.4、6.1 节 |
| 近处重复目击：同一类事迹再次在近处看见（原规则），或任何事迹而且上一次是至少一游戏小时前的另一件事 | 第 3.4 节"当众复现"；同一场战斗的几下不算另一件事 |
| 个人请托经公会的告示板挂出（`personal`），在对话里当场接，不要求登记；本人付钱、无抽成、交给本人、不计公会履历 | 任务与事件第 6.2 节第 3 步"个人委托，报酬来自其财产"；本人在场就是请托的入口 |
| 首领每周第一天 8 时规划：发布效用 = 6 × 威胁（`seal_unrest`/100）+ 1（板上有空位），维持现状 2；板满不发 | 第 9.2、9.6 节；没有威胁时各自的模板仍由公会每周补板 |
| `gen_trouble` 只在说话者心情为愁、乏、怒、惧或有未满足的映射需求时出现 | 第 6.2 节"本人最低的需求或未完成的目标"；免得人人都来求助 |
| 待答问题的加分只在问完后的那一轮 | 第 6.3 节"NPC 上一句是提问" |

**复查发现与处理**（新起的只读子代理一轮，覆盖性复查）

| 发现 | 处理 |
| --- | --- |
| 冒犯与威胁扣两次耐心 | 只按意图数据扣（`intents.json` 已写 `patience: -1`）；补测 |
| `gen_directions` 永远没有目的地 | R1 把句中地点（通用词经话题别名换成地点）传给话题；补测 |
| 当面对上号与自曝把暴露广播给 10 格内的人 | 改为只让当事人按反应表反应并记下；自曝每人一次；补测 |
| R1 的槽位兜底按模板名判断，会绕过话题图 | 改按解析出的编号判断 |
| 只命中线索的拒答没有防死循环与耐心代价 | 记 `clue:<编号>`，第三次结束会话，重问扣耐心；补测 |
| 待答问题永远有效 | 加分只一轮；之后只能点选项作答 |
| 话题菜单打开时自由文字的说服判断看不到选项；自由文字说服失败不扣耐心 | 看主选项表；失败扣 1；补测 |
| 个人请托计入公会履历、交给接待员、重复与上限、办成无回报 | 不计履历与违约、交给本人、守模板上限、办成后关系与记忆；补测（本人付钱、玩家收钱、好感上升、履历为空） |
| 任何权威都能推翻神迹与邪术 | 只限教会的权威（数据 `authority.church`） |
| 自动玩家不会选"说服" | 计划带选项 `persuade` |
| 板满仍发 | 板满不发 |
| 尚未上场的四人的人物话题没有标题 | 补标题 |
| `repeat` 不生效、轮转只记 8 句 | 实现 `once` 与 `daily`；记 16 句 |
| 误导版本计入拒答 | 不计；补测 |
| 耐心在话题选项上用尽时丢了那句回答 | 先说那句，再告别 |
| 对话自己的选项前缀可能截走别的系统的选项 | 只认系统为 `dialogue` 的选项 |
| 付不起封口费的提示当作人物台词 | 改为旁白行 |
| 拒答话题时题面仍叫模型照答 | 拒答用单独的题面键 `sys.dialogue.prompt.topic_refused` |
| 推荐话题在主选项表里越积越多 | 新的推荐替换旧的 |
| 部分内容（单测只合并几个 pack）下校验误报 | 对别的 pack 的表只在已合并时检查（地图别名经地图集） |
| `gen_prices`、`{goddess}` 永远空、`unlocks.quests` 不执行、L4 居民不求助、判决暴露只在旗标首次置位时 | 转后续（第 3 节） |

**"活着"运行的回退与修复**（复查之后的四组实跑：种子 7、18、19 的传闻到邻镇中位 4.37 到 4.87 日，超出 2 到 4 日；镇内两日到达约 0.58，改动前约 0.79）

| 实验（种子 7，42 游戏日，同一份代码按开关跑五个变体） | 镇内两日到达 | 到邻镇的传闻数 | 认知弧 |
| --- | --- | --- | --- |
| 现行代码 | 0.73 | 9 | 7 |
| 关掉权威背书 | 0.73（与现行逐位相同） | 9 | 6 |
| 关掉当面对上号 | 0.88 | 13 | 4 |
| 关掉放宽的近处重复 | 0.83 | 8 | 2 |
| 三者都关 | 0.80 | 12 | 3 |

结论：回退来自当面对上号。旁人里已经亲眼见过玩家、多半已崇拜玩家的人在每次交谈时被"对上号"，反应表的崇拜一行给他手里所有关于玩家的传闻加热；旧传闻一直热，挤掉了新事迹的传闻（镇内传话先挑热的，邻镇每日只带最热的三条）。权威背书没有影响；放宽的近处重复略降到达但带来认知弧，保留。修复：只有仅凭传闻认识玩家的人（信念证据里没有亲眼目睹）才会对上号，每条传闻一次；对上号的反应按"认出"处理，不走崇拜、敌视等立场行（`src/systems/cognition/sources.ts` 的 `matchOnTalk`、`exposeTo`）。阈值未改。

## 3. 留给后续包的事项

| 序 | 事项 | 建议归属 |
| --- | --- | --- |
| 1 | 序章与第一幕 222 个话题实例、序章九问的台词（人物包、地区层）；台词未写之前这些话题不进菜单，自由提问时由拒答或回退句作答 | PK-M1-29 |
| 2 | `ln_common` 的 `topic.gen_trouble` 已有 PK-M1-18 的两句求助句，目录第 4.2 节的四句（分心情）未追加；本包追加的第 4.2、4.3 节槽位 PK-M1-29 不必再导 | PK-M1-29 |
| 3 | 三个话题等任务数据：`event_drunk_bandits`（`q_a1_s01_owen_wagon`）、`secret_toma_watch`（`q_a1_s15_bell_tower`）、`secret_noi_mark`（`q_a1_s19_door_in_you`）；六个任务入口话题的 `unlocks.quests` 指向尚未入库的任务，已去掉 | 第一幕任务导入的包；导入后补回 |
| 4 | 话题的 `unlocks.quests`（聊过才接出委托）只登记不执行 | 任务系统的后续包（或 PK-M1-29 与任务导入同批） |
| 5 | `{goddess}` 槽（凡人对女神的称呼按知识与揭示阶段），`gen_faith` 的第一句因此作废 | PK-M1-20 |
| 6 | `gen_prices` 的 `{price}`、`{item}`（市场档位价），在此之前该话题不出现 | 经济系统的后续包 |
| 7 | 台账逐条线索的"解锁前处理"（否认、回避、误导、不知、暗示）还没有数据列，只命中线索时知情者一律回避；"分类置信度低且命中泄露签名按不知处理并记审计" | 台账数据化的后续包（叙事） |
| 8 | 说服成功时纷争立场向玩家移 0.1（第 6.4 节第 37 行） | 纷争的后续包 |
| 9 | L4 居民（无名居民）的求助转请托；现在只有有名人物 | 内置 AI 的 M2 调优 |
| 10 | 审判圣灯的暴露只在旗标首次置位时、在玩家所在处触发；审判官与勇者的指认 | PK-M1-55 |
| 11 | 反应表其余后果（指控进度、审判预兆、请愿队列、服务价格） | PK-M1-55、PK-M2 城建官员、经济 |
| 12 | `gen_directions` 的 `{landmark}` 未填（用到它的两句作废） | 内置 AI 的 M2 调优 |
| 13 | `docs/README.md` 的索引未加本目录（本包不得修改该文件） | 主会话 |

## 4. 请求

| 对象 | 请求 |
| --- | --- |
| 主会话（随本包提交改 `data/scenes/prologue.json`，PK-M1-27 的版本先提交） | 见下方"序章数据的两处改动"。改动后 `tests/dialogue_prologue_answers.test.ts` 里的夹具副本可以去掉 |
| 主会话 | 开发计划 PK-M1-29 行写"序章与第一幕 228 个话题"，台词目录第 0 节与第 3.3 节实为 235 个（本包登记 9 + 223，其中 3 个暂缓） |

### 序章数据的两处改动（`data/scenes/prologue.json`）

1. 去掉下列选项条件里的 `ai_enabled`，让自由输入在两档都出现（无模型时由本包的规则归类作答）：

| 场景 | 节点 | 选项 | 现在的 `when` | 改为 |
| --- | --- | --- | --- | --- |
| `cut_p_call` | `n5_questions` | `ask`（到 `n5_q_free`） | `ai_enabled AND p_call_free_count < 3` | `p_call_free_count < 3` |
| `cut_p_interview` | `n6_eluen` | `free`（到 `n6_eluen_free`） | `ai_enabled` | 删去 `when` |
| `cut_p_interview` | `n7_valda` | `free`（到 `n7_valda_free`） | `ai_enabled` | 删去 `when` |
| `cut_p_interview` | `n8_merca` | `free`（到 `n8_merca_free`） | `ai_enabled` | 删去 `when` |
| `cut_p_interview` | `n9_sylvie` | `free`（到 `n9_sylvie_free`） | `ai_enabled` | 删去 `when` |
| `cut_p_interview` | `n10_moira` | `free`（到 `n10_moira_free`） | `ai_enabled` | 删去 `when` |
| `cut_p_interview` | `n10_past` | `free`（到 `n10_past_free`） | `ai_enabled` | 删去 `when` |
| `cut_p_judgement` | `n11_stance` | `free`（到 `n11_say`） | `ai_enabled` | 删去 `when` |
| `cut_p_judgement` | `n11_response` | `free`（到 `n11_free`） | `ai_enabled` | 删去 `when` |
| `cut_p_discard` | `n12_last` | `free`（到 `n12_free`） | `ai_enabled` | 删去 `when` |

2. 给 `cut_p_call` 节点 `n5_q_free` 的 `input` 加：`"classify": { "node": "n5_questions", "choices": ["where", "world", "review", "thing", "above", "five", "neighbors", "home", "chair"] }`，不写 `fallback`（规则不归类时照写好的回答回到 `n5_questions`）。九个选项依次由话题 `place_antechamber`、`lore_hortus`、`lore_judgment`、`event_that_matter`、`lore_above`、`self_number_five`、`person_four_heroes`、`self_way_home`、`place_sixth_chair` 作答（`data/dialogue/topics/prologue.json` 的 `scene.choice`）。

## 5. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 个人请托的形态 | 推荐本包的做法：挂在告示板上、在对话里当场接、不要求公会登记、本人付钱不抽成、不计公会履历；另一选项是请托完全不经公会 | 不阻塞 |
| 2 | 解释库里"神迹"能否被权威推翻 | 数据（`data/cognition/explanations.json`）写"权威"，设计第 3.4 节写"行事者不信神或被证明无加护"；本包让只有教会的权威推得动神迹与邪术。推荐认知数据随后把神迹的推翻条件改成设计原文 | 不阻塞 |
| 3 | 说服目标的语义改为"在对话里说服"而不是"门槛成立时交谈" | 推荐采纳（计划包行原意）；暂无任务数据使用说服目标 | 不阻塞 |
