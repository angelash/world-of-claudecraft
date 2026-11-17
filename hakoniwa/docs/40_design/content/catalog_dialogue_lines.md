# 台词目录（Catalog of Dialogue Lines）

> 归属：`docs/40_design/content/`，内容目录。本文是命名空间 `ln_`（台词包）、`bark_`（群众吠叫池）以及话题编号前缀 `self_`、`place_`、`person_`、`event_`、`lore_`、`faith_`、`danger_`、`quest_`、`secret_` 的主人（[content_bible.md](content_bible.md) 第 12 节、[builtin_ai.md](../systems/builtin_ai.md) 第 6.2 节）。
> 作用：无模型档（D-010、D-068）的台词设计源。本文登记全作的台词包、话题与吠叫池，写全共享台词包（通用层 `ln_common`、角色层 `ln_role_<role>`、阶层层 `ln_class_<阶层>`）与全部吠叫池的正文，给出写作规范、校验规则、句数统计与第二到第六幕的撰写批次。序章与第一幕的人物台词包正文在 [catalog_dialogue_lines_act1.md](catalog_dialogue_lines_act1.md)。
> 上游：[decision_log.md](../../00_vision/decision_log.md) 的 D-010、D-030、D-064、D-067、D-068、D-073、D-076、D-077；[builtin_ai.md](../systems/builtin_ai.md) 第 5 到 7 节、第 8.8 节、第 11.3 到 11.4 节、第 12.4 节、第 14.1 节（契约）；[characters.md](../../30_story/characters.md)（口吻）；[pantheon.md](../../20_world/pantheon.md)（女神口吻与锚点）；[reveal_ledger.md](../../30_story/reveal_ledger.md)（解锁条件、误导表、称谓开放表、泄露禁区）；[prologue_antechamber.md](../../30_story/arcs/prologue_antechamber.md)、[act1_borderstone.md](../../30_story/arcs/act1_borderstone.md)；[catalog_characters_lotha.md](catalog_characters_lotha.md)、[catalog_characters_continent.md](catalog_characters_continent.md)（有名人物与居民模板）；[reputation_and_cognition.md](../systems/reputation_and_cognition.md)（凡人不信、传闻失真）；[companions_and_party.md](../systems/companions_and_party.md) 第 10 节（同伴台词需求）；[catalog_goddess_interventions.md](catalog_goddess_interventions.md)（女神专用槽位名）；[world_state_registry.md](../world_state_registry.md)（条件变量）；现有数据 `data/dialogue/templates.json`、`data/cognition/lines.json`、`data/npc/personas.json`。
> 约束：正典优先级 world_bible > vision > 20_world > 30_story > 本文；每一句都受揭示台账约束（台账第 0.2 节规则 8）；条件只用注册表已登记的变量（D-076）；内核只发文本键，中文为源语言（D-077）；槽位名、条件字段、任务阶段名逐字使用 builtin_ai 第 7 节的封闭集合。
> 下游：台词包数据 `data/dialogue/lines/<包>.json`、话题图 `data/dialogue/topics.json`、吠叫池 `data/dialogue/barks.json`、内容校验（[builtin_ai.md](../systems/builtin_ai.md) 第 7.10 节、第 15 节）、本地化字符串表；分幕台词文件 `catalog_dialogue_lines_act1.md` 到 `catalog_dialogue_lines_act6.md`。

## 0. 一页结论

1. **一套契约，三层内容。** 本文与 builtin_ai 第 7 节共用一份契约：builtin_ai 管槽位语法、回退链与选择规则，本文管每个包写什么、写多少、谁来写。回退链的后三层（模板、阶层、通用）与角色层是共享内容，正文全部写在本文；每个有名人物与居民模板的本人包写在分幕文件里。
2. **全作 365 名有名人物各有一包。** 第 9 节每人一行：包名、首登幕、说话者类别、口吻要点、专属话题、最低量、按幕变体、锚点出处与撰写批次。女神 6 包另列。序章与第一幕 41 包加 17 个居民模板加 6 位女神的第一批在 M1 写完；第二、三幕的 174 包在 M2；第四到第六幕的 150 包在 M3。
3. **最低量按类别落地。** 女神 250、主要同伴 200（另加队内闲聊）、随行同伴 70、核心 L1 80、其余有名 30、居民模板 20、吠叫池 30（第 1.5 节）。随行同伴一类由本文新设：他们有战斗吠叫与招募反应的硬需求，却不是长线主角，[companions_and_party.md](../systems/companions_and_party.md) 第 10.2 节给的约 70 句正是这个量。
4. **共享层写全。** `ln_common` 覆盖问候、告别、16 个通用话题、70 种反应、凡人不信三档、记忆、日记、传话、解释、闲谈、文书与过度解读七个模板族（第 4 节）；52 种意图每种至少 4 句通用应答（第 5 节）；15 个功能角色各一包（第 6 节）；12 个社会阶层各一包（第 7 节）；48 个吠叫池每池 30 句（第 8 节）。
5. **话题是可审的数据。** 话题编号以类别词开头；序章与第一幕的 235 个话题逐条登记字段、知识层级版本、解锁条件与台账标记（第 3.3 节）；第二到第六幕按幕登记 115 个主干话题与编号规则，分幕文件只能在本文的前缀下追加（第 3.4 节）。
6. **女神槽位一律落进封闭语法。** 女神目录写作 `ln_merca.coin.first` 一类的槽位名，在台词包里落成 `react.coin_first`；尊名回应落成 `acts.act<幕>.react.honorific`；天启落成 `topic.revelation_<天启>`；审庭落成 `topic.court_<防线>.<立场>`（第 1.6 节）。这样选择器只认一种语法，女神目录的名字照样能一一找到。
7. **女神问候按她真实可用的渠道写。** 梅尔卡有硬币、神龛、降影三条，雅努只有梦与现身，其余四位是神龛与化身两条（第 1.6 节）。没有的渠道不写空句。
8. **台账是第一校验。** 每句扫描禁名、泄露签名与俗称；未解锁的真相只能出现在带解锁条件的句子里；误导版本与误导表一致；称谓随揭示阶段切换（第 2.3、2.6 节）。第一幕凡人一律说"灰气""灰病""荒原病""灰晶"，只有夜羽与阿什说"澱"。
9. **重复率靠量与窗口一起压。** 本人包的句数下限保证窗口内不重复（builtin_ai 第 14.1 节）；同一句源文出现在三个以上包里报警告，所以共享层的句子都写成带填充槽的模板，不与人物包重句（第 2.6 节）。
10. **批次按开发计划。** M1 写序章与第一幕的全部包与共享层；M2 写第二、三幕；M3 写第四到第六幕与终章；M4 做全作重复率、长度、台账与称谓的总校（第 10 节）。

## 1. 范围、读法与契约对照

### 1.1 文件分工

| 文件 | 写什么 | 批次 |
| --- | --- | --- |
| 本文 | 话题表、共享台词包正文（`ln_common`、`ln_role_*`、`ln_class_*`）、全部吠叫池正文、全作台词包清单、女神槽位对照、写作规范、校验规则、句数统计、撰写批次 | M1 写定，此后各批只在登记表里追加行 |
| [catalog_dialogue_lines_act1.md](catalog_dialogue_lines_act1.md) | 序章与第一幕：六位女神的第一批、第一幕全部有名人物、第一幕可用同伴、第一幕居民模板的本人包正文；第一幕任务的 `quest.<q_id>.<stage>`；第一幕地区话题的通用层句；第一幕的 `ln_party` | M1 |
| `catalog_dialogue_lines_act2.md`、`catalog_dialogue_lines_act3.md` | 第二、三幕首登人物的本人包；跨幕人物在该幕的 `acts.act2`、`acts.act3` 覆盖；女神第二、三幕部分；该幕任务阶段；该幕地区话题的通用层句；其余 15 个居民模板 | M2 |
| `catalog_dialogue_lines_act4.md` 到 `catalog_dialogue_lines_act6.md` | 同上，第四到第六幕与终章；女神审庭立场 | M3 |

规则：分幕文件是该幕人物包正文的主人；它可以在本文的话题前缀下追加个人话题（`self_<id>_<词>`、`secret_<id>_<词>`），追加的编号同时写进本文第 3.4 节的登记表（只追加行，不改已有行）。

### 1.2 回退链各层的内容主人

| 层（builtin_ai 第 7.3 节） | 包 | 正文所在 |
| --- | --- | --- |
| 1 到 3 本人包（含按幕覆盖与截短） | `ln_<npcId>`、`ln_<女神 ID>` | 分幕文件 |
| 4 角色层 | `ln_role_giver` 等 15 个 | 本文第 6 节 |
| 5 居民模板层 | `ln_tpl_<模板>`（模板 ID 去掉 `tpl_` 前缀前的完整名，例 `ln_tpl_tenant_farmer`） | 第一幕用到的 17 个在第一幕文件；其余 15 个在第二幕文件 |
| 6 阶层层 | `ln_class_peasant` 等 12 个 | 本文第 7 节 |
| 7 通用层 | `ln_common` | 本文第 4 节；各幕地区话题的通用层句在分幕文件里，标题"ln_common：第 N 幕地区话题" |
| 队内闲聊 | `ln_party` | 分幕文件，按幕分段 |
| 群众吠叫 | `bark_<池>` | 本文第 8 节 |

大陆诸国没有专属的居民模板（人物目录（二）不设 `tpl_`）：第四幕起的具名化居民按职业取最接近的洛萨模板（例：帝国斗场的看客取 `tpl_porter`，同盟的账房伙计取 `tpl_tax_collector`），地方色由阶层层的种族与地区变体句和第 8 节的地区吠叫池补上。

### 1.3 写法

**台词包**：一节一包，四级标题写包名、显示名、类别、首登幕与本批句数；标题下一行引用块写口吻、称呼与禁区；正文是一张两列表。

```
#### `ln_martha` 玛莎（核心 L1；首登第一幕；本批 84 句）

> 口吻：……。称呼：……。禁区：……。

| 槽位 | 句 |
| --- | --- |
| greet.cold.day | 1. 有事说事，别挡着门口。／2. 〔mood: 怒〕……／3. 〔first〕…… |
| topic.place_bs_drunk_moon.K0 | 1. …… |
```

- 一行一个槽位，同槽的多句写在同一格，用全角斜杠"／"分隔；每句前的序号就是文本键的末段。
- 槽位列写到序号之前为止，版本名跟在话题后：`topic.gen_self.K1`、`topic.gen_you.doubt`、`topic.gen_self.act1`、`topic.lore_grey_sickness.mis`；按幕覆盖写 `acts.act1.greet.neutral`。
- 条件写在序号后的六角括号里，字段只用 builtin_ai 第 7.1 节的 `when`、`mood`、`place`、`strict`、`first`、`w`，多个字段用全角分号隔开：`〔when: a1_oola_fate == cleared；mood: 愁〕`。`mood` 取惧、怒、愁、乏、喜、平；`place` 取 `tavern`、`chapel`、`market`、`home`、`workplace`、`wild`、`ruins`、`court`、`battlefield`、`camp`（builtin_ai 第 7.4 节的地点种类）。`zh` 就是格子里的句子本身。
- 吠叫池一节一池，正文表每行 5 句，序号连续；时段偏好写 `〔when: hour >= 18 OR hour < 6〕`。
- 队内闲聊一段一节，标题写 `party.<编号>`、出场、触发、条件与是否一次性，正文按说话者逐句列，回应点列玩家的两到三个选项与信任变化。

### 1.4 文本键与序号

| 规则 | 内容 |
| --- | --- |
| 键 | 内容键 `c.line_packs.<包>.slots.<槽>.<序号>`；带版本的话题在槽后加版本名；按幕覆盖 `c.line_packs.<包>.acts.<幕>.<槽>.<序号>`；写成对象的句子末尾加 `.zh`；槽名里的点折成下划线（builtin_ai 第 7.1 节）。键由抽取工具生成，作者不手写 |
| 序号 | 数据里的序号从 0 起，等于本文句号减 1；只追加，不复用；删句在数据里留 `null` 空位（builtin_ai 第 7.1 节） |
| 现有数据 | 原 `data/dialogue/templates.json` 与 `data/cognition/lines.json` 已迁入台词包，对照见第 4.14 节，旧键到槽位的对照在 `data/dialogue/legacy_lines.json`；`data/npc/personas.json` 的 `lines` 字段迁入本人包，原句作该槽第 1 句 |
| 写定场景 | 过场与写定场景的整段台词归过场目录（`cut_`）与分幕文档；台词包只收其中会被选择器单独调用的句子（锚点、节点句、会被重复说出的口头句） |

### 1.5 说话者类别与最低量

| 类别 | 代码 | 本人包最低句数 | 必须由本人包直接提供（builtin_ai 第 7.8 节的落地） |
| --- | --- | --- | --- |
| 女神 | G | 250 | `greet` 三档乘她的渠道（第 1.6 节），每格 3；`farewell` 3；每幕 `topic.gen_self`、`topic.gen_you`；第 1.6 节对照表里适用于她的全部女神专用槽位；全部写定节点与锚点句；审庭立场回应 |
| 主要同伴 | C | 200，另加 `ln_party` 里与本人有关的闲聊 | 核心 L1 的全部要求；`react` 的对话行为、送礼与交易、招募与角色三组全部种类各 2；每幕的 `greet` 与 `topic.gen_you`；`bark.combat`、`bark.hurt`、`bark.victory`、`bark.ally_down`、`bark.flee` 各 2；个人线全部 `quest` 阶段；`react.declined` 按五种道德标签各 1 |
| 随行同伴 | F | 70 | 其余有名的全部要求；五种战斗吠叫各 2；`recruit_yes`、`recruit_terms`、`recruit_later`、`recruit_no` 各 2；`gift_liked`、`gift_plain`、`gift_disliked` 各 2 |
| 核心 L1 | K | 80 | `greet` 三档且分昼夜，每格 3；`farewell` 3；`unbelief` 三档各 3（知情者用 `topic.gen_you` 的认知版本代替，不少于 9 句）；`react` 至少 `feat_seen`、`gift_liked`、`gift_disliked`、`insult`、`thanked`、`flattered`、`threatened`、`helped`、`saved`、`identity_claim`、`accused` 与本人可能到达的 `belief_*` 各 2；至少 6 个话题且按知识层级分版本；本人日程里每个活动语境的 `bark` 各 2 |
| 其余有名 | N | 30 | `greet` 三档各 3；`farewell` 3；`unbelief` 三档各 2；`react.feat_seen`、`react.gift_liked`、`react.insult` 各 2；`topic.gen_self`、`topic.gen_work` 与至少 1 个本人话题 |
| 居民模板 | T | 20 | `greet.neutral`、`greet.cold`、`greet.warm` 合计不少于 6；`farewell` 2；`unbelief` 三档各 2；主要活动的 `bark` 不少于 4；`topic.gen_work` 不少于 2 |
| 吠叫池 | B | 30 | 至少三种心情或时段偏好的句子各占一成以上 |

口径说明：

1. **计数**：数本人包里编号的句子，含 `acts.*` 覆盖；`ln_party` 另计；整段写定场景不计。
2. **同伴两份数字的关系**：[companions_and_party.md](../systems/companions_and_party.md) 第 10.2 节的"每在场幕 30 句加一次性 55 句"是同伴评论类台词（区域、事件、战斗、营火、门、礼物、名册事件、红线）的需求量，全部落在本人包的 `bark.*`、`topic.*`、`react.*` 里，是 200 句的一部分；在场幕少的同伴（欧拉、玛莎）其余句数由问候、话题、反应补足到 200。
3. **跨幕人物**：入队前按其当时的类别写（奈拉、卡西安、玛莎第一幕按核心 L1 写 80 句），入队那一幕的分幕文件把包补足到 200。
4. **随行同伴**为本文新设的类别，理由见第 0 节第 3 条。
5. **知情者不进凡人不信**：女神、夜羽、阿什、欧拉（对玩家的不寻常心里有数）、遗民孩子、老船夫等用 `topic.gen_you` 的认知版本代替 `unbelief.*`。

### 1.6 女神槽位对照与渠道

[catalog_goddess_interventions.md](catalog_goddess_interventions.md) 是女神专用槽位名的主人；本表把它的写法一一落进 builtin_ai 第 7.2 节的封闭语法。

| 女神目录写法 | 台词包槽位 | 例 |
| --- | --- | --- |
| `honorific.a<幕>` | `acts.act<幕>.react.honorific` | `ln_merca.acts.act1.react.honorific.1` |
| `revelation.<天启 ID>`、`revelation.generic` | `topic.revelation_<天启 ID>`、`topic.revelation_generic` | `ln_eluen.topic.revelation_ash_full.act4.1` |
| `revelation.ops.<立场>` | `topic.revelation_ops.<立场>`（版本维度取立场） | `ln_moira.topic.revelation_ops.embrace.1` |
| `court.<立场>` | `topic.court_<防线>.<立场>`，防线取注册表的 `fact`、`just`、`need` | `ln_valda.topic.court_just.justify.1` |
| `deny` | `react.deny`（带解锁或事件条件） | `ln_eluen.react.deny.3` |
| 其余 `a.b`、`a.b.c` | `react.a_b`、`react.a_b_c`（点改下划线） | `coin.first` 到 `react.coin_first`；`offering.thanks` 到 `react.offering_thanks`；`ledger.reminder` 到 `react.ledger_reminder`；`dream.yes` 到 `react.dream_yes`；`trial.<试炼>.offer` 到 `react.trial_<试炼短名>_offer`；`oracle.<类>` 到 `react.oracle_<类>` |
| 写定神行节点 `div_beat_<x>` | `react.beat_<x>`，第一句是女神目录给出的锚定句 | `ln_janu.react.beat_a1_dream_door.1` |
| 序章锚点 A00 到 A11（台账第 4 节） | `react.anchor_a00` 到 `react.anchor_a11`，各 1 句原句，固定 | `ln_eluen.react.anchor_a00.1`"这不合规格。" |

本文另补登下列女神专用槽位（女神目录未列名、台词需要单独的槽）：

| 槽位 | 女神 | 用途 |
| --- | --- | --- |
| `react.dream_question` | 雅努 | 第一个梦里她问玩家"那个镇子，你喜欢吗？"（第一幕 9.1 节） |
| `react.dream_answer_like`、`react.dream_answer_unsure`、`react.dream_answer_dislike` | 雅努 | 对三种回答的回应，回答记入 `a1_janu_dream_answer` |
| `react.coin_left` | 梅尔卡 | 硬币留在庭院超过 30 日（女神目录事件 `player.left_token`） |
| `react.lie_caught` | 五司 | 玩家的话被判伪并被她识破（女神目录反应行 `div_react_all_09`） |
| `react.request_refuse` | 五司 | 请托不能映射到她的菜单时的回绝（女神 GM 第 10.3 节） |

女神问候的渠道后缀（`greet.<档>.<渠道>`）按她真实可用的渠道写：

| 女神 | 渠道 | 说明 |
| --- | --- | --- |
| 艾琉恩 `eluen` | `avatar`、`shrine` | 序章候见厅与第四幕光像算 `avatar`；礼拜堂、圣所、神龛前的祈祷算 `shrine`。第一到第三幕她不对玩家问候（第一幕以为玩家已死，第二幕只发神谕，第三幕借大主教之口） |
| 瓦尔妲 `valda` | `avatar`、`shrine` | 序章与第四幕起的化身、濒死战士之口算 `avatar`；战前祈祷与斗场算 `shrine` |
| 梅尔卡 `merca` | `avatar`、`coin`、`shrine` | 硬币第一次用时降影的"吃点心的小个子女人"算 `avatar` |
| 希尔薇 `sylvie` | `avatar`、`shrine` | 第四幕起灵泉边的降影算 `avatar`；灵泉与祖灵圈前的祈祷算 `shrine` |
| 莫伊拉 `moira` | `avatar`、`shrine` | 第四幕化身算 `avatar`；书库与史官转述的场合算 `shrine` |
| 雅努 `janu` | `avatar`、`dream` | 序章坠落那一声与第五幕起现实中的半身门框算 `avatar`；梦算 `dream` |

### 1.7 条件变量

句子的 `when` 只用 [world_state_registry.md](../world_state_registry.md) 第 8 节已登记的变量与第 5 节的文法。同伴拒绝命令的句子读信号 `order.moral_tag`（玩家命令的道德标签，枚举 `kill_surrender`、`rob_civilians`、`break_pact`、`desecrate`、`harm_children`，写入者为队伍命令处理器，读后即清；登记在注册表第 8.9 节）。

## 2. 写作规范

### 2.1 口吻表

| 说话者 | 节奏 | 高频词与口头禅 | 称呼玩家 | 绝不会说 |
| --- | --- | --- | --- | --- |
| 艾琉恩 | 精确、对称、优雅；越往后越失去对称 | 规格、合格、瑕疵、秩序；"这不合规格。""光不会说谎。" | 序"样本""孩子"；四"孩子"；五"先驱""瑕疵"；六第一次叫名字 | 雅努、第六司的任何指涉；她在怕；大断绝；排澱（第五幕前否认） |
| 瓦尔妲 | 粗豪、爱笑、拿打架打比方 | "新肉"；"再来一个硬的。" | 序"新肉"；三起"小子""丫头"；四私下"对手" | 那件事的内容；魔王是她养的（第五幕前只省略） |
| 梅尔卡 | 甜、快、句句交易，手里总在吃 | "亲爱的客人""这笔买卖划算" | "客人""亲爱的客人"；说服后"合伙人" | 奈拉是她的眼睛；钥匙；两头下注；商路独占 |
| 希尔薇 | 轻、慢、短句、季节比喻、很少正面回答 | 冬天、花、循环 | 不称呼；四起"远来的人" | 遗民与庇护所；灵泉里的记忆 |
| 莫伊拉 | 旁白式、调侃、反问，偶尔擦边第四面墙 | 有趣、这一章、伏笔 | 序"你"；三"那位没有页的客人"；四"主角"；六叫名字 | 铭录后门；私藏副本；她是叙事导演（第四幕前只暗示）；"这是一个游戏" |
| 雅努 | 温柔、带笑、谜语式而体贴、长停顿 | "你来了""门总会开的""别急" | "你"；第六幕后叫名字 | 自己的名字；开门与封印的代价（只承认"是的"）；无貌者（第五幕前）；她想复原 |
| 夜羽 | 短句、命令式，每三句一句吐槽；被戳中就沉默 | "门把手。""信要送到。""啧。"；千年前的旧词（门资、发光的铺子） | "门把手"；三幕起"开门的"；六幕送信时叫名字 | 拆不是给她的信；"门口的女人"的名字；向教会与女神透露玩家的门 |
| 希雅 | 短而直接，生气更短，不拐弯 | "我闻得出来。""说好了。""祖灵在上" | "你" | 撒谎；背弃说好的事；为讨好人族藏耳朵尾巴 |
| 罗恩 | 碎碎念、长句吐槽，紧张时极快，发令时突然短促 | "不可能。""……好吧，可能。" | "新来的"，熟后叫名字 | 嘲笑别人的恐惧；冒充玩家的权威；超出 K1 的解释 |
| 奈拉 | 甜而快、爱反问；谈价放慢；说真心话时生硬 | "这得算算。""账上写着呢。" | "客人" | 白送；违背亲手签的契约；第四幕前承认是梅尔卡的眼睛 |
| 欧拉 | 慢、俚语、草药比喻，只说一半 | "草不会骗人。人会。""小崽子" | "小崽子" | 交出孩子；信任不够时说落叶路的下一站 |
| 卡西安 | 句式工整、引经文，紧张时反复确认 | "光会看见的。""圣典上说……""是这样的，对吧？" | "这位旅人"，怀疑加深后"阁下" | 收贿；明知是假仍作伪证；嘲弄他人信仰 |
| 玛莎 | 短句、指令式、带笑；碰到过去就转到吃饭 | "先吃饭。""账记上。" | "孩子" | 宣扬自己；抢玩家的功劳；第五幕前提晚钟小队 |
| 老布伦 | 粗声；清醒时简短，醉时啰嗦 | "登记簿上写什么，就是什么。""再来一杯。" | "新来的" | 篡改登记；清醒时承认醉话 |
| 阿什 | 慢、长停顿、抄写员比喻 | "还不是时候。""门的孩子。""这一行还没写完" | "门的孩子" | 说谎（只省略）；第六幕前说她的名字 |
| 第二幕起的主角 | 见第 9 节各行"口吻要点" | | | 各人"绝不会做"以 [characters.md](../../30_story/characters.md) 为准 |

### 2.2 长度上限

| 槽或族 | 每句上限（中文字符，不含条件括号） |
| --- | --- |
| `greet.*`、`farewell`、`bark.*`、吠叫池 | 30 |
| `react.*`、`unbelief.*` | 50 |
| `topic.*`、`quest.*` | 80 |
| `party.*` | 50 |
| `mem.*`、`diary.*`、`rumor.tell.*`、`expl.*`、`banter.*`、`interp.*` | 60 |
| `doc.*` | 160 |

### 2.3 称谓随揭示阶段变化

| 真名或真相 | 解锁前的说法（谁说） | 解锁条件 | 解锁后 |
| --- | --- | --- | --- |
| 雅努 | "门口的女人"（玩家的梦）；"无名之神"（边境老人）；"开门的母亲"（遗民）；"她"（阿什、夜羽、无貌者）；"第六司"（第三幕后，禁忌层与女神私下） | `a6_name_spoken` | "雅努" |
| 大断绝 | "那件事"（瓦尔妲）；"邪神之乱"（教会） | `a3_ash_tells_sundering` | "大断绝" |
| 千门都 | "荒原下的古城"（学院、老船夫） | `a3_ash_tells_sundering` | "千门都" |
| 空白纪 | "蒙昧时代""圣历以前"（教会、学院） | `a3_archive_sealed_room` | "空白纪" |
| 无貌者 | "没有脸的人"（布伦）；"无貌的先知"（门徒会） | `a2_faceless_projection` | "无貌者"；`a5_faceless_named` 后可称"沈望" |
| 第八代勇者 | "老船夫" | `a2_ferryman_reveal` | "第八代勇者"（他本人仍拒绝） |
| 第九代魔王 | "魔王""第九个" | `a5_demon_king_born` | "无貌之王" |
| 排澱 | 不得出现 | `a5_truth_purge_cycle` | "排澱" |
| 澱 | 凡人："灰气""灰病""荒原病""灰晶""灰狼""灰鬼"；冒险者与学者的行话"澱" | 界面在 `term.dian_known` 后切换；台词不随之切换 | 凡人仍用俗称 |
| 玩家（凡人眼中） | 一"那个 F 级怪人""运气好的新人"；二"打退兽潮的 F 级""门扉商会的老板"；三"灰烬男爵""那个开门的领主"；四"庭外之王"；五依阵营"魔王的先驱"或"联盟之主" | 按幕 | 由 `{player}` 填充层按认知与信任改写 |

### 2.4 俗称、禁名与禁区

1. 凡人台词一律用俗称；第一幕只有夜羽与阿什能说"澱"，第二幕起城里的冒险者与学者可以用"澱"作行话，乡民与工匠仍说灰气。
2. 第六幕 `a6_name_spoken` 之前，任何台词不出现被禁之名。
3. 第四幕 `a4_moira_isomorphism` 之前，任何台词不点出人间势力与诸神的对应。
4. 任何台词不说造主是谁、第六封信写了什么、审定的结果；不说"这是一个游戏"。
5. 每幕的"绝对不能说出"以台账第 8 节为准，分幕文件的包头禁区一栏逐人照抄。
6. 火药与纸钞的口述一律以"做不出来"或"教会会烧掉你"回绝（D-064）。

### 2.5 禁用写法

| 禁用 | 改法 |
| --- | --- |
| 破折号（U+2013、U+2014、U+2015）、emoji、U+2600 到 U+27BF 的符号 | 冒号、逗号、括号、省略号"……" |
| 句句带口头禅 | 口头禅约每 5 句至多 1 句 |
| 在共享层写具体人名、地名 | 用填充槽 `{who}`、`{place}` |
| 用旁白代替台词（"他生气地说"）、长段动作说明 | 只写说出口的话；无言的反应可写一个括号短注（至多 8 字，例"（她不说话）"），演出层据此播放动作 |
| 用台词交代未解锁的真相，哪怕当成猜测 | 换成误导版本或"不知道" |
| 让凡人确认"无名之神"是真正的神 | 只说"老人们这么叫""别在神父面前提" |
| 出戏词（游戏、玩家、存档、程序、模型、系统） | 玩家这样说时，角色当成胡话（`react.nonsense`） |
| 修改记录的措辞与占位词 | 只写当前方案 |
| 其他作品的人名、地名、台词 | 原创 |

### 2.6 校验规则

内容校验在导入与编辑器保存时运行（builtin_ai 第 7.10、15 节），本表是台词目录这一侧的全部规则：

| 检查 | 规则 | 失败处理 |
| --- | --- | --- |
| 禁用字符 | 第 2.5 节第一行 | 报错 |
| 长度 | 第 2.2 节 | 报错 |
| 槽位名 | 只用 builtin_ai 第 7.2 节语法与第 1.6 节对照表 | 报错 |
| 条件字段 | 只用 `when`、`mood`、`place`、`strict`、`first`、`w`；`mood` 与 `place` 的值在第 1.3 节的封闭集合内 | 报错 |
| 条件变量 | 全部已在注册表登记；枚举值在值集内 | 报错 |
| 话题编号 | 已在第 3 节登记；版本名合法（知识、认知、幕、信任、`mis`、立场） | 报错 |
| 任务编号与阶段 | 任务编号存在于任务目录；阶段在封闭集合内 | 报错 |
| 填充槽 | 只用 builtin_ai 第 7.9 节的槽；共享层不出现具体人名 | 报错 |
| 台账泄露 | 扫描泄露签名与禁名；未解锁内容只出现在带解锁条件的句子里；`mis` 版本与误导表一致 | 报错 |
| 称谓与俗称 | 第 2.3、2.4 节 | 报错 |
| 覆盖 | 第 1.5 节的必备槽位由本人包直接提供；每个话题在可用人群里至少一人能答 | 报错 |
| 雷同 | 同一句源文出现在三个以上包里 | 警告 |
| 口头禅密度 | 本人包内口头禅句超过三成 | 警告 |
| 句数 | 第 1.5 节最低量 | 报错 |

### 2.7 喜剧与节流的写法

- 凡人不信的笑点来自"测量失灵乘解释库乘传闻失真乘权威滞后"（[reputation_and_cognition.md](../systems/reputation_and_cognition.md) 第 10 节），台词只负责把这一刻说得像这个人；同一桥段每个地区每游戏日至多触发一次，所以一个桥段的现场句写 2 到 3 种说法即可，不必堆量。
- 每个桥段至少让一位 NPC 后来"开始怀疑自己的常识"：这类句子写在 `unbelief.waver`，用 `{feat}` 指向那件事。
- 罗恩式的"不可能。……好吧，可能。"由本人包的 `unbelief.waver` 与 `react.belief_*` 串成，不另设槽位。

## 3. 话题表

### 3.1 字段与编号

话题的字段以 builtin_ai 第 6.2 节为准（`id`、`category`、`title`、`scope`、`tier`、`knowers`、`requires`、`trustMin`、`after`、`unlocks`、`versionBy`、`repeat`、`interest`）。本节的表把它们压成八列：

| 列 | 对应字段 | 写法 |
| --- | --- | --- |
| 编号 | `id` | 前缀即类别词（下表）；台词包里写作 `topic.<编号>.<版本>` |
| 类别 | `category` | 封闭集合：自我、工作、地方、人物、事件、传闻、任务、信仰、世界、你、危险、服务、秘密 |
| 范围 | `scope` | 个人（只在列出的人包里）、地区（该地区的人都可能有，通用层句写在分幕文件"地区话题"一节）、通用 |
| 首次可谈 | `requires`、`after` | 台账语法；空白表示该幕开场即可 |
| 版本 | `versionBy` 与已写的版本 | `knowledge：K0、K1`；`act：prologue`；`cognition`；`relation`；另列 `mis` |
| 信任下限 | `trustMin` | 不足时出现在菜单里但对方回避（`react.evade`） |
| 台账 | `knowers` 与线索 | 线索号、误导号、桥段号 |
| 能答者与要点 | `title`、`unlocks`、`repeat` | 菜单标题；谁有本人版；聊完解锁什么；默认常青，一次性另注 |

| 前缀 | 类别 | 用途 |
| --- | --- | --- |
| `self_` | 自我（含"你"类的个人问答） | 某个人自己的事：营生之外的执念、物件、往事 |
| `place_` | 地方 | 地点、建筑、地区 |
| `person_` | 人物 | 某位有名人物；本人包里写自己对此人的看法，地区通用层写公开评价 |
| `event_` | 事件 | 发生过或正在发生的事；按结局变量分句 |
| `lore_` | 世界 | 常识、历史、体系；按知识层级与误导表分版本 |
| `faith_` | 信仰 | 诸神、教会、仪式 |
| `danger_` | 危险 | 魔物、险地、病 |
| `quest_` | 任务 | 任务与委托的入口话题（聊过可接出 `quest.<q_id>.offer`） |
| `secret_` | 秘密 | 带信任下限与台账条件的私事；解锁前本人只回 `react.deny` 或 `react.evade` |

通用话题 `gen_*` 由 builtin_ai 第 6.2 节登记，本文第 4.2 节写它们的通用层句。

### 3.2 编号规则

1. 地方：`place_<地区码>_<地点>`；地区码用两字母缩写（`bs` 边石镇，`wb` 瓦伦堡，`or` 奥瑞恩，`ow` 旧哨村，`tr` 灰烬边境领），镇外与大区直接用地名（`place_old_mine`、`place_wallenburg`）。
2. 人物：`person_<人物 ID>`，与人物 ID 完全一致。
3. 个人与秘密：第一幕用 `self_<人物 ID>_<词>`、`secret_<人物 ID>_<词>`；第二幕起每名有名人物默认拥有 `self_<人物 ID>` 与（人物卡有秘密时）`secret_<人物 ID>`，分幕文件需要更多时追加 `_<词>`。
4. 事件、世界、信仰、危险、任务：`<前缀>_<词>`，同一名字全作只登记一次；跨幕延续的话题用版本（`act`）或 `when` 区分，不另起编号。
5. 一个编号一个主人：本文。分幕文件追加的编号同时登记进第 3.4 节表末。

### 3.3 序章与第一幕的话题

**序章（女神包；`act == 0`）**

| 编号 | 类别 | 范围 | 首次可谈 | 版本 | 信任下限 | 台账 | 能答者与要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `place_antechamber` | 地方 | 个人：五司 | `p_mirror_done` | act：prologue | | 无 | "这是哪里？你们是谁？"艾琉恩答，梅尔卡补"园丁"；原句见序章第 4.7 节 |
| `lore_hortus` | 世界 | 个人：五司 | 同上 | act：prologue | | 无 | "那个世界叫什么？"莫伊拉答"霍尔图斯" |
| `lore_judgment` | 世界 | 个人：五司；通用 | 序章同上；第一幕开场 | act：prologue；knowledge：K0、K1、mis | | M10-C01、M10-C02、MIS-04 | 序章：五司各一种说法，希尔薇不答；凡人：教会说"昭示唯一之光" |
| `event_that_matter` | 事件 | 个人：五司 | 同上 | act：prologue | | M05-C03 | 瓦尔妲"自己去挖"，艾琉恩"下一个问题"；不得说内容 |
| `lore_above` | 世界 | 个人：五司 | 同上 | act：prologue | | M12-C01、M12-C02 | 梅尔卡"东家"，艾琉恩"不要用你的嘴提那一位" |
| `self_number_five` | 你 | 个人：五司 | 同上 | act：prologue | | 无 | "我为什么是五号？"梅尔卡"我也想知道"，艾琉恩"登记错误" |
| `person_four_heroes` | 人物 | 个人：五司 | 同上 | act：prologue | | 无 | 艾琉恩"勇者。合规格的那种。"；不说名字 |
| `self_way_home` | 你 | 个人：五司 | 同上 | act：prologue | | 无 | 梅尔卡"单程票"，莫伊拉"不在我的书里" |
| `place_sixth_chair` | 地方 | 个人：五司 | 同上 | act：prologue | | M02 | 五司一瞬困惑"什么椅子？"；莫伊拉"这一句我记下来了" |

**雅努的梦（第一幕拉远；`ln_janu`）**

| 编号 | 类别 | 范围 | 首次可谈 | 版本 | 信任下限 | 台账 | 能答者与要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `self_janu_name` | 自我 | 个人：雅努 | `a1_dream_door_woman` | act：act1 | | M02-C11（禁） | "一个守门的。名字……现在说出来，会有人听见。" |
| `self_janu_caught` | 自我 | 个人：雅努 | 同上 | act：act1 | | M01-C03、A10 | 按 `p_reached_out` 两版 |
| `place_dream_door` | 地方 | 个人：雅努 | 同上 | act：act1 | | 无 | "门后面。你的门后面。" |
| `self_janu_wish` | 自我 | 个人：雅努 | 同上 | act：act1 | | MIS-15 | "我想让这里重新连起来。" |
| `person_ash` | 人物 | 个人：雅努、夜羽 | 雅努：同上；夜羽：`a1_ash_met` | act：act1 | | 他的身份不说 | 雅努："一个比我更会守门的人。"；夜羽：本能的敬畏 |
| `self_janu_why_me` | 你 | 个人：雅努 | 同上 | act：act1 | | M11-C05（禁） | "你会知道的。一扇一扇来。" |

**梅尔卡的硬币与神龛（第一幕）**

| 编号 | 类别 | 范围 | 首次可谈 | 版本 | 信任下限 | 台账 | 能答者与要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `self_merca_coin` | 自我 | 个人：梅尔卡 | `p_discarded` | act：prologue、act1 | | A04 | 硬币是什么、怎么用；她只谈"生意" |
| `self_merca_ledger` | 自我 | 个人：梅尔卡 | `act >= 1` | act：act1；按 `p_coin_terms` 分句 | | 无 | 赊账与利息 |
| `quest_merca_offering` | 任务 | 个人：梅尔卡 | `act >= 1` | act：act1 | | M11-C04（第二幕起） | 她收什么供品、回什么礼（价目以女神目录第 9 节为准） |
| `place_merca_shrine` | 地方 | 个人：梅尔卡；地区：边石镇 | `act >= 1` | knowledge：K0；act：act1 | | 无 | 商会院角的神龛；镇民只知道"商人拜的" |

**地点（地区：边石镇一带）**

| 编号 | 类别 | 范围 | 首次可谈 | 版本 | 信任下限 | 台账 | 能答者与要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `place_borderstone` | 地方 | 地区 | | knowledge：K0、K1 | | 无 | 约八百人的边境小镇；K1 加治安、税与匪 |
| `place_bs_edgestone` | 地方 | 地区 | | knowledge：K0 | | 真相不入台词 | 广场那块灰石：镇民说是建镇的王国界碑 |
| `place_bs_guild` | 地方 | 地区；本人：布伦、莉娜、侯克 | | knowledge：K0、K1 | | 无 | 两层木楼、鉴定水晶、三十年的木桩 |
| `place_bs_chapel` | 地方 | 地区；本人：卡西安、伊莎、托马 | | knowledge：K0、K1 | | 无 | 光之厅、圣灯、钟楼 |
| `place_bs_branch` | 地方 | 地区；本人：奈拉、波波 | | knowledge：K0、K1 | | 无 | 盐与药水、院角神龛 |
| `place_bs_drunk_moon` | 地方 | 地区；本人：玛莎、朵拉 | | knowledge：K0 | | 无 | 吃、住、酒；店里不许打架 |
| `place_bs_smithy` | 地方 | 地区；本人：巴尔加 | | knowledge：K0 | | 无 | 炉火与铁砧；K0 版只说"他睡得晚" |
| `place_bs_herb_hut` | 地方 | 地区；本人：欧拉 | | knowledge：K0、K1 | | MIS-19（审判期间） | 镇民："药草婆婆""收鸡蛋当诊费"；审判期间"魔女的屋子" |
| `place_bs_orphanage` | 地方 | 地区；本人：格蕾塔、伊莎 | | knowledge：K0 | | S08-C01 | 十四个孩子、贴着北泉；"孩子常被远房亲戚接走" |
| `place_bs_north_spring` | 地方 | 地区；本人：欧拉 | | knowledge：K0、K1 | | M04-C02 | K0：不收井税的泉；K1（`a1_spring_source_found`）：水里有灰 |
| `place_bs_magistrate` | 地方 | 地区；本人：莫斯、维克 | | knowledge：K0 | | 无 | 镇上唯一的石砌大宅、税务所、拘留室 |
| `place_bs_salt_lane` | 地方 | 地区 | | knowledge：K0 | | 无 | 每周集日 |
| `place_bs_guardpost` | 地方 | 地区；本人：巴托 | | knowledge：K0 | | 无 | 北门旁哨所、十二个民兵、警钟 |
| `place_bs_north_gate` | 地方 | 地区 | | knowledge：K0 | | MIS-02 | 荒原门；"北边不吉利" |
| `place_bs_south_gate` | 地方 | 地区；本人：乌尔夫 | | knowledge：K0 | | 无 | 王道门与驿站，去瓦伦堡的路 |
| `place_bs_east_slope` | 地方 | 地区；本人：葛恩、希雅、博罗 | | knowledge：K0；relation | | 无 | 兽人猎户的东坡；"狗坡"只出现在冷档人族的句子里 |
| `place_bs_lumberyard` | 地方 | 地区；本人：加斯帕、尼克 | | knowledge：K0 | | 无 | 锯坑与木料垛 |
| `place_bs_graveyard` | 地方 | 地区；本人：埃德 | | knowledge：K0 | | 无 | 西南坡；米洛的小坟 |
| `place_bs_mill` | 地方 | 地区 | | knowledge：K0 | | 无 | 奥托磨坊，空着，遗产纠纷中 |
| `place_bs_bakery` | 地方 | 地区；本人：佩德、莉莎 | | knowledge：K0 | | 无 | 清早第一缕烟 |
| `place_bs_wash_creek` | 地方 | 地区；本人：玛格 | | knowledge：K0 | | 无 | 妇人们洗衣聊天的浅滩 |
| `place_bs_west_fields` | 地方 | 地区；本人：西蒙 | | knowledge：K0 | | 无 | 麦田与农舍；新税的痛处 |
| `place_bs_dice_house` | 地方 | 地区；本人：薇罗、杰德 | | knowledge：K0、K1 | 30 | 无 | 盐巷尽头旧货仓后屋的赌局；K1 版知道是独眼团的人开的 |
| `place_east_forest` | 地方 | 地区；本人：希雅、葛恩 | | knowledge：K0、K1 | | 无 | 林缘、猎径、约树 |
| `place_old_mine` | 地方 | 地区；本人：罗恩 | | knowledge：K0、K1 | | M04-C03（K1 后半） | 两年前塌方的旧铁矿；`quest.q_a1_m06_mine` 后有"矮人机关"的传闻版 |
| `place_old_watch` | 地方 | 地区；本人：瑟格 | | knowledge：K0、K1 | | 无 | 908 年被焚的废村，独眼团的据点 |
| `place_waste_rim` | 地方 | 地区 | | knowledge：K0、mis | | MIS-02 | 灰沙、枯树、碎石 |
| `place_sealed_ruins` | 地方 | 地区；本人：夜羽、阿什、布伦 | | knowledge：K0、K1 | | M02-C01、M05-C02 | 凡人禁地、教会禁碑；K1 版有二十年前的探索队 |
| `place_broken_door_slope` | 地方 | 地区；本人：埃德 | | knowledge：K0 | | M05-C02 | "像很多扇倒下的门"的拱石坡（不解释） |
| `place_deer_spring` | 地方 | 个人：欧拉、希雅 | `trust.oola >= 40 OR trust.shiya >= 40` | knowledge：K0 | | 无 | 林中鹿泉、净泉草 |
| `place_ropebridge` | 地方 | 地区；本人：卡斯 | | knowledge：K0 | | 无 | 灰溪断桥与绳桥，荒原外缘的折桥驿 |
| `place_wallenburg` | 地方 | 地区 | | knowledge：K0、K1 | | 无 | 南边的大城、伯爵府；`a1_count_letter` 后多一句"伯爵要见人" |

**人物（地区：边石镇一带；通用层写镇民的公开评价，本人包写各自的看法）**

| 编号 | 类别 | 范围 | 首次可谈 | 版本 | 信任下限 | 台账 | 能答者与要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `person_cassian`、`person_oola`、`person_martha`、`person_bron`、`person_moss`、`person_nera`、`person_shiya`、`person_ron`、`person_lina`、`person_hock`、`person_isa`、`person_toma`、`person_bertha`、`person_greta`、`person_barga`、`person_gaspar`、`person_nick`、`person_gorn`、`person_ako`、`person_boro`、`person_barto`、`person_jed`、`person_vick`、`person_seg_oneeye`、`person_viro`、`person_popo`、`person_owen`、`person_dora`、`person_ed`、`person_ped`、`person_lisa`、`person_dris`、`person_simon`、`person_marg`、`person_ulf_lange`、`person_knut_naumann`、`person_kas_ropebridge`（37 个） | 人物 | 地区 | 聊过 `topic.gen_people` 中提到此人，或玩家问起其名 | knowledge：K0；relation（本人包里按说话者对此人的关系档分句） | | 各人秘密不入此话题 | 公开评价一两句；关系够时由 `{place}` 填此人此刻的日程地点 |
| `person_noi`、`person_tess` | 人物 | 地区 | 同上 | knowledge：K0 | 30 | M02-C03（不入） | 孤儿院两个孩子；只说"安静""爱唱歌"，不说胎记 |
| `person_yeyu` | 人物 | 地区 | `a1_yeyu_bound` | knowledge：K0 | | 桥段 8 | "那个怪人带的说自己是乌鸦的怪家伙" |
| `person_adalbert` | 人物 | 地区 | | knowledge：K0、K1 | | 无 | 瓦伦边境伯爵；`a1_count_letter` 后"伯爵府来信了" |

**事件（地区）**

| 编号 | 类别 | 范围 | 首次可谈 | 版本 | 信任下限 | 台账 | 能答者与要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `event_milo_death` | 事件 | 地区；本人：欧拉、卡西安、埃德、格蕾塔 | `act_week >= 2` | knowledge：K0、K1、mis | | MIS-19、M04-C02 | 孤儿米洛之死；`mis` 是"药草婆婆的巫术"；K1（欧拉）"不是巫术" |
| `event_tax_hike` | 事件 | 地区；本人：莫斯、西蒙、巴托 | | knowledge：K0、K1 | | 无 | 十取一改六取一；后来又加井税 |
| `event_caravan_raid` | 事件 | 地区；本人：欧文 | `act_week >= 3` | knowledge：K0 | | 无 | 南路劫案；"团规不杀人"是匪的说法 |
| `event_crystal_broke` | 事件 | 地区；本人：莉娜、布伦 | `a1_guild_registered` | knowledge：K0、mis | | MIS-06、M03-C01、桥段 1 | "新来的把水晶弄坏了"及其变形链 |
| `event_toby_sick` | 事件 | 地区；本人：贝莎、卡西安 | `act_week >= 6` | knowledge：K0；按 `a1_toby_state` 分句 | | 无 | 第二个倒下的孩子 |
| `event_tess_song` | 事件 | 地区；本人：贝莎、苔丝 | `act_week >= 5` | knowledge：K0 | | 无 | "孤儿院的邪歌" |
| `event_witch_trial` | 事件 | 地区；本人：卡西安、欧拉、伊莎、贝莎 | `a1_witch_trial_started` | knowledge：K0；按 `a1_oola_fate` 分句 | | MIS-19 | 光之鉴审判 |
| `event_summons` | 事件 | 地区；本人：莫斯、维克 | `act_week >= 7` | knowledge：K0 | | 无 | 代官府传讯告示（全文见第一幕 7.4） |
| `event_salt_price` | 事件 | 地区；本人：奈拉、西蒙、波波 | | knowledge：K0、K1 | | S03-C01 | 魔物季前盐价上涨 |
| `event_burned_shed` | 事件 | 地区；本人：希雅、加斯帕 | `act_week >= 4` | knowledge：K0 | | 无 | 东坡猎棚被烧 |
| `event_market_theft` | 事件 | 地区；本人：阿柯、杰德 | `act_week >= 4` | knowledge：K0；按 `a1_jed_exposed` 分句 | | 无 | 集市铜铃失窃 |
| `event_mine_opened` | 事件 | 地区；本人：罗恩、巴尔加 | `quest.q_a1_m06_mine` | knowledge：K0 | | 桥段 4 | "矿道里有矮人的机关"及巴尔加的当众否认 |
| `event_beast_tide` | 事件 | 地区 | `a1_beast_tide_cleared` | knowledge：K0、K1；按 `a1_tide_credit` 分句 | | M04-C04 | 兽潮之夜与四种归功 |
| `event_otto_will` | 事件 | 地区；本人：格蕾塔、维克、侯克 | `act_week >= 3` | knowledge：K0；按 `a1_mill_owner` 分句 | | 无 | 磨坊遗嘱之争 |
| `event_bakery_engagement` | 事件 | 地区；本人：佩德、莉莎、尼克 | `act_week >= 5` | knowledge：K0；按 `a1_lisa_nick` 分句 | | 无 | 面包房的婚约 |
| `event_martha_bet` | 事件 | 地区；本人：玛莎、朵拉 | `a1_guild_registered` | knowledge：K0 | | 桥段 10 | 酒客拿公会卡打赌，老板娘押"他不走" |
| `event_count_letter` | 事件 | 地区；本人：布伦、乌尔夫 | `a1_count_letter IN (a, b, c, d)` | knowledge：K0 | | 无 | 伯爵府来信要见人 |
| `event_old_watch_908` | 事件 | 地区；本人：瑟格、埃德 | | knowledge：K0、K1 | | 无 | 圣历 908 年旧哨村被焚，援兵没来 |
| `event_expedition_978` | 事件 | 地区；本人：布伦、侯克 | | knowledge：K0、K1 | | S02-C01 | K0："二十年前公会有人死在遗迹里"；布伦按 `npc.bron.story_level` |
| `event_dris_duel` | 事件 | 地区；本人：德里斯、布伦 | `a1_dris_duel_won` | knowledge：K0 | | 桥段 6 | "那根木桩早就朽了" |
| `event_crow_person` | 事件 | 地区；本人：朵拉、贝莎、埃德 | `a1_yeyu_bound` | knowledge：K0 | | 桥段 8 | "我是乌鸦。" |
| `event_drunk_bandits` | 事件 | 地区；本人：巴托、玛格 | `quest.q_a1_s01_owen_wagon` | knowledge：K0 | | 桥段 7 | "一伙醉匪撞上了新人" |

**世界（按知识层级；凡人只有常识与误导版本）**

| 编号 | 类别 | 范围 | 首次可谈 | 版本 | 信任下限 | 台账 | 能答者与要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `lore_demon_king` | 世界 | 通用 | | knowledge：K0、K1、mis | | M08-C01、MIS-01 | 魔王是邪神在世间的化身、魔族之王（教会说法）；轮回的规律是 K2（M08-C05），凡人版本不提 |
| `lore_heroes` | 世界 | 通用 | | knowledge：K0、K1 | | 无 | 光召来的勇者；第一幕凡人只知道传说 |
| `lore_waste` | 世界 | 通用 | | knowledge：K0、mis | | M05-C01、MIS-02 | 荒原是古代邪神之乱的战场 |
| `lore_appraisal` | 世界 | 通用 | | knowledge：K0、K1、mis | | M03-C01 到 C03、MIS-06、MIS-20 | 鉴定、等级、"无记载"；`mis` 两版：水晶坏了（镇民）、异端之兆（卡西安） |
| `lore_ranks` | 世界 | 通用 | | knowledge：K0、K1 | | 无 | 凡阶、精英阶、英雄阶，凡人一辈子停在凡阶 |
| `lore_guild_ranks` | 世界 | 通用；本人：布伦、罗恩、德里斯 | | knowledge：K0、K1 | | 无 | F 到 S |
| `lore_grey_sickness` | 世界 | 通用；本人：欧拉 | | knowledge：K0、K1、K2 | | M04-C02 | K0"荒原病是诅咒"；K1"北边来的病"；K2（欧拉）德鲁伊旧学的说法 |
| `lore_grey_crystal` | 世界 | 通用；本人：奈拉、莫斯 | | knowledge：K0、K1 | | M04-C03（K1 后半） | 灰晶不许私卖，得经持证工坊净炼 |
| `lore_nameless_god` | 世界 | 地区；本人：欧拉、埃德 | | knowledge：K1 | 40 | M02-C02 | 边境老人叫"无名之神"，"别在神父面前提"；K0 无此话题 |
| `lore_branded` | 世界 | 通用；本人：卡西安 | | knowledge：K0、mis | | MIS-05 | 教会说的"烙印者" |
| `lore_sixth_sigil` | 世界 | 个人：夜羽、卡西安；地区（K0） | `a1_wake_ruins` | knowledge：K0、mis | | M02-C01、MIS-05 | 地区 K0：遗迹里画着神纹，那是禁地；卡西安的 `mis`："邪神的涂鸦"；夜羽：她不愿意谈 |
| `lore_door_mural` | 世界 | 个人：夜羽 | `a1_wake_ruins` | knowledge：K0 | | M05-C02 | 遗迹壁画上很多门连成一座城；看得见，看不懂 |
| `lore_wolf_saying` | 世界 | 个人：希雅、葛恩 | `trust.shiya >= 40` | knowledge：K1 | 40 | M05-C04 | "很久以前，草原和海之间只隔一扇门"（族里的老话） |
| `lore_monster_season` | 世界 | 通用 | | knowledge：K0、K1、mis | | M04-C01、MIS-01 | 魔物季一年比一年长 |
| `lore_dian_word` | 世界 | 个人：夜羽、阿什 | `a1_yeyu_bound` | knowledge：K3 | | 称谓开放表 | "澱"这个字；聊过由任务效果写 `term.dian_known` |
| `lore_lords` | 世界 | 通用 | | knowledge：K0、K1 | | 同构禁令 | 王都的领主、伯爵、代官；不点破同构 |

**信仰（通用）**

| 编号 | 类别 | 范围 | 首次可谈 | 版本 | 信任下限 | 台账 | 能答者与要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `faith.eluen` | 信仰 | 通用；本人：卡西安、伊莎、贝莎 | | knowledge：K0、K1 | | MIS-01、MIS-04 | 光之女神、圣教 |
| `faith.valda` | 信仰 | 通用 | | knowledge：K0、mis | | MIS-01 | 教会说她是邪神、魔族之母；战士私下战前祈祷 |
| `faith.merca` | 信仰 | 通用；本人：奈拉、巴尔加 | | knowledge：K0 | | 无 | 商人与矮人拜的；契约加护 |
| `faith.sylvie` | 信仰 | 通用；本人：欧拉、葛恩 | | knowledge：K0 | | 无 | 林子与兽人的女神 |
| `faith.moira` | 信仰 | 通用；本人：侯克 | | knowledge：K0 | | 无 | 记录与学问 |
| `faith_nameless` | 信仰 | 个人：欧拉、诺伊、苔丝、散居遗民模板 | | knowledge：K1 | 60 | M02-C02 | 遗民的"开门的母亲"；只低声 |
| `faith_light_mirror` | 信仰 | 地区；本人：卡西安 | | knowledge：K0 | | 无 | 圣灯"光之鉴"与神明裁判 |
| `faith_holy_day` | 信仰 | 通用 | | knowledge：K0 | | 无 | 礼拜日、什一、洗礼与临终礼 |

**危险（地区）**

| 编号 | 类别 | 范围 | 首次可谈 | 版本 | 信任下限 | 台账 | 能答者与要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `danger_east_forest` | 危险 | 地区；本人：希雅、加斯帕 | | knowledge：K0 | | 无 | 伐区北边的狼，"灰色的狼"的传闻 |
| `danger_old_mine` | 危险 | 地区；本人：罗恩 | | knowledge：K0 | | 无 | 掘穴虫；塌方 |
| `danger_waste_rim` | 危险 | 地区 | | knowledge：K0 | | 无 | 灰沙、灰鬼、夜里别去 |
| `danger_sealed_ruins` | 危险 | 地区；本人：布伦 | | knowledge：K0 | | 无 | 禁地；进去的没好下场 |
| `danger_south_road` | 危险 | 地区；本人：欧文、巴托 | | knowledge：K0 | | 无 | 南路劫道的独眼团 |
| `danger_monster_season` | 危险 | 地区 | | knowledge：K0 | | 无 | 魔物季该关门窗、囤盐 |
| `danger_north_spring` | 危险 | 地区；本人：欧拉 | `a1_spring_source_found` | knowledge：K0 | | M04-C02 | 北泉的水别喝了 |
| `danger_tide_omens` | 危险 | 地区；本人：玛莎 | `seal_unrest >= 70` | knowledge：K0 | | 无 | 林子空了、泉变色、鸦群夜飞 |
| `danger_graveyard_wisp` | 危险 | 地区；本人：埃德 | `act_week >= 3` | knowledge：K0 | | 无 | 米洛坟上的"鬼火" |

**任务入口（地区）**

| 编号 | 类别 | 范围 | 首次可谈 | 版本 | 信任下限 | 台账 | 能答者与要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `quest_board` | 任务 | 地区；本人：布伦、莉娜 | `a1_guild_registered` | knowledge：K0 | | 无 | F 级的规矩；接出 `q_a1_m04_hunt` |
| `quest_cellar` | 任务 | 个人：玛莎 | | knowledge：K0 | | 无 | 地窖的老鼠；接出 `q_a1_s17_moon_cellar` |
| `quest_grey_wolf` | 任务 | 地区；本人：希雅、葛恩 | `act_week >= 2` | knowledge：K0 | | 无 | 接出 `q_a1_m05_grey_wolf` |
| `quest_old_mine` | 任务 | 地区；本人：罗恩 | `act_week >= 4` | knowledge：K0 | | 无 | 接出 `q_a1_m06_mine` |
| `quest_owen_cart` | 任务 | 个人：欧文 | `act_week >= 4` | knowledge：K0 | | 无 | 接出 `q_a1_s01_owen_wagon` |
| `quest_salt` | 任务 | 地区；本人：西蒙 | `act_week >= 5` | knowledge：K0 | | 无 | 接出 `q_a1_s08_salt_price` |
| `quest_otto_will` | 任务 | 个人：格蕾塔 | `act_week >= 3` | knowledge：K0 | | 无 | 接出 `q_a1_s11_otto_will` |
| `quest_copper_bell` | 任务 | 地区（集市摊贩） | `act_week >= 4` | knowledge：K0 | | 无 | 接出 `q_a1_s12_copper_bell` |
| `quest_c_rank_duel` | 任务 | 个人：德里斯 | `act_week >= 3` | knowledge：K0 | | 无 | 接出 `q_a1_s16_c_rank_face` |
| `quest_seg_duel` | 任务 | 个人：瑟格 | `act_week >= 6` | knowledge：K0 | | 无 | 单挑；落在 `q_a1_d01_tax_and_bandits` 的节点 f |
| `quest_tide_prep` | 任务 | 地区；本人：玛莎、夜羽 | `seal_unrest >= 80` | knowledge：K0 | | 无 | 暗月之前的准备；接出 `q_a1_m12_tide` |
| `quest_count_summons` | 任务 | 个人：布伦 | `a1_count_letter IN (a, b, c, d)` | knowledge：K0 | | 无 | 伯爵要见人；接出 `q_a1_m13_letter` |

**个人与秘密（本人包）**

| 编号 | 类别 | 范围 | 首次可谈 | 版本 | 信任下限 | 台账 | 能答者与要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `self_yeyu_wait`、`self_yeyu_old_words`、`self_yeyu_shinies` | 自我 | 个人：夜羽 | `a1_yeyu_bound` | knowledge：K0；act | | S01-C01、M09-C02 | 在等一个人开门；千年前的旧词；亮东西 |
| `self_yeyu_bag` | 自我 | 个人：夜羽 | `a1_dream_door_woman` | knowledge：K0 | | S01-C02 | 七封打不开的信（内容不知） |
| `self_yeyu_door` | 自我 | 个人：夜羽 | `a1_yeyu_bound AND act_week >= 8` | knowledge：K0 | 50 | M09-C02 | "那扇门，是不该被打开的。"追问时"我只记得我在等" |
| `self_shiya_family`、`self_shiya_nose` | 自我 | 个人：希雅 | | knowledge：K0 | | 无 | 家人与"狗坡的"；鼻子 |
| `secret_shiya_reading` | 秘密 | 个人：希雅 | | knowledge：K0 | 60 | 人物层 | 偷偷跟伊莎学认字 |
| `self_ron_mother`、`self_ron_amulets` | 自我 | 个人：罗恩 | | knowledge：K0 | | 无 | 老家的母亲与屋顶；五位女神的护符全拜 |
| `secret_ron_wolf` | 秘密 | 个人：罗恩 | | knowledge：K0 | 60 | 人物层 | 从没独自打赢过一只狼（第一支小队的事第三幕才说） |
| `self_oola_herbs` | 自我 | 个人：欧拉 | | knowledge：K0、K2 | | 无 | 草药与季节 |
| `secret_oola_children` | 秘密 | 个人：欧拉 | `a1_orphan_mark_seen` | knowledge：K2 | 60 | M02-C03、M01-C05 | 孩子的胎记；之前 `react.deny` |
| `secret_oola_leafroad` | 秘密 | 个人：欧拉 | `trust.oola >= 70` | knowledge：K2 | 70 | S08-C02、S08-C03 | 森林来的旅商与"远房亲戚"；不说下一站 |
| `self_nera_ledger`、`self_nera_coin` | 自我 | 个人：奈拉 | | knowledge：K1 | | S03-C01 | 账本；她那枚旧硬币（只谈生意） |
| `self_cassian_reports`、`self_cassian_scripture` | 自我 | 个人：卡西安 | | knowledge：K1 | | 无 | 给教区写的周报（回避内容）；圣典 |
| `self_martha_kitchen` | 自我 | 个人：玛莎 | | knowledge：K0 | | 无 | 吃饭、菜、酒 |
| `self_martha_bell` | 自我 | 个人：玛莎 | | knowledge：K0 | | S02（禁） | 吧台上方的锈铃；一律转到吃饭 |
| `secret_martha_blade` | 秘密 | 个人：玛莎 | `a1_martha_strike` | knowledge：K0 | 70 | S02-C02 | "我去关窗。"；第五幕前回避 |
| `self_bron_ledger` | 自我 | 个人：布伦 | | knowledge：K1 | | 无 | 登记簿 |
| `self_bron_arm` | 自我 | 个人：布伦 | | knowledge：K1 | 50 | S02-C01 | 断臂；清醒时回避，醉时按 `npc.bron.story_level` |
| `secret_bron_mark` | 秘密 | 个人：布伦 | `a1_bron_sees_mark` | knowledge：K1 | 40 | M01-C04 | "二十年前那个人手上，也有这个。" |
| `self_ash_writing`、`self_ash_name` | 自我 | 个人：阿什 | `a1_ash_met` | knowledge：K3；act（第一幕只回"还不是时候"） | | M05、M11-C03（禁） | 墙上用灰重写的字；"记得每一卷书的名字，却忘了自己的" |
| `self_moss_duty` | 自我 | 个人：莫斯 | | knowledge：K1 | | 无 | "这事得按规矩来" |
| `secret_moss_crystal` | 秘密 | 个人：莫斯 | `a1_moss_exposed` | knowledge：K1 | | M04-C03 | 灰晶走私；之前 `react.deny` |
| `self_lina_wallenburg` | 自我 | 个人：莉娜 | | knowledge：K0 | | 无 | 想当正式文员、嫁去瓦伦堡 |
| `self_hock_archive` | 自我 | 个人：侯克 | | knowledge：K1 | | 无 | 记录与规矩 |
| `secret_hock_box` | 秘密 | 个人：侯克 | `act_week >= 4` | knowledge：K1 | 50 | S02、遗嘱线 | 铁皮箱：报告抄本、林约抄本、公证遗嘱；只回答"问对了"的问题 |
| `self_isa_children` | 自我 | 个人：伊莎 | | knowledge：K0 | | 无 | 孤儿院的孩子 |
| `secret_isa_noi` | 秘密 | 个人：伊莎 | | knowledge：K0 | 60 | M02-C03 | 见过诺伊后颈的"胎记"；让欧拉夜里进孤儿院 |
| `self_toma_bell` | 自我 | 个人：托马 | | knowledge：K0 | | 无 | 钟 |
| `secret_toma_watch` | 秘密 | 个人：托马 | `quest.q_a1_s15_bell_tower` | knowledge：K0 | 50 | 无 | 钟楼上看见的：谁夜里进出 |
| `self_bertha_toby` | 自我 | 个人：贝莎 | | knowledge：K0 | | 无 | 孙子托比 |
| `self_greta_children` | 自我 | 个人：格蕾塔 | | knowledge：K0 | | 无 | 十四个孩子要吃饭 |
| `secret_noi_mark` | 秘密 | 个人：诺伊 | `quest.q_a1_s19_door_in_you` | knowledge：K0 | 60 | M02-C03 | "你身上有一扇门。"（他不解释） |
| `self_noi_tess` | 自我 | 个人：诺伊 | | knowledge：K0 | | 无 | 妹妹 |
| `self_tess_song` | 自我 | 个人：苔丝 | | knowledge：K0 | | 无 | "门开了，门开了" |
| `self_barga_sword` | 自我 | 个人：巴尔加 | | knowledge：K1 | | 无 | 一把配得上的剑 |
| `secret_barga_marks` | 秘密 | 个人：巴尔加 | `act_week >= 3` | knowledge：K1 | 50 | 无 | 刀上的暗记 |
| `self_gaspar_workers` | 自我 | 个人：加斯帕 | | knowledge：K0 | | 无 | 三十个工人的活 |
| `secret_gaspar_brother` | 秘密 | 个人：加斯帕 | | knowledge：K0 | 50 | 无 | 八年前被狼咬死的弟弟 |
| `self_nick_lisa` | 自我 | 个人：尼克 | | knowledge：K0 | 40 | 无 | 莉莎 |
| `self_gorn_pact` | 自我 | 个人：葛恩 | | knowledge：K0 | | 无 | 林约 |
| `secret_gorn_leg` | 秘密 | 个人：葛恩 | | knowledge：K0 | 60 | 无 | 腿伤的来历 |
| `self_ako_grownup` | 自我 | 个人：阿柯 | | knowledge：K0 | | 无 | 想被当成大人 |
| `secret_ako_witness` | 秘密 | 个人：阿柯 | `act_week >= 4` | knowledge：K0 | 40 | 无 | 看见杰德进骰子屋 |
| `self_boro_armwrestle` | 自我 | 个人：博罗 | | knowledge：K0 | | 无 | 扳手腕 |
| `self_barto_militia` | 自我 | 个人：巴托 | | knowledge：K1 | | 无 | 十二个民兵 |
| `secret_barto_tax` | 秘密 | 个人：巴托 | | knowledge：K1 | 60 | 无 | 讨伐税一个铜板都没用在讨伐上 |
| `secret_jed_debt` | 秘密 | 个人：杰德 | `a1_jed_exposed` | knowledge：K0 | | 无 | 赌债；之前把话头引到别人身上 |
| `self_vick_chapter` | 自我 | 个人：维克 | | knowledge：K1 | | 无 | 章程 |
| `secret_vick_ledger` | 秘密 | 个人：维克 | `a1_vick_informant` | knowledge：K1 | | M04-C03 | 第二本账的誊本 |
| `self_seg_oneeye_oldwatch` | 自我 | 个人：瑟格 | | knowledge：K1 | | 无 | 旧哨村的账 |
| `secret_seg_oneeye_letters` | 秘密 | 个人：瑟格 | `a1_seg_duel_won` | knowledge：K1 | | M04-C03 | 留着与代官的往来信件 |
| `self_viro_dice` | 自我 | 个人：薇罗 | | knowledge：K1 | | 无 | 骰子与押注 |
| `secret_viro_pact` | 秘密 | 个人：薇罗 | `a1_viro_status IN (captured, recruited)` | knowledge：K1 | | 无 | 与代官的密约 |
| `self_popo_prices` | 自我 | 个人：波波 | | knowledge：K0 | | 无 | 给一切标价 |
| `self_owen_caravan` | 自我 | 个人：欧文 | | knowledge：K1 | | 无 | 商队与公道 |
| `secret_owen_seal` | 秘密 | 个人：欧文 | | knowledge：K1 | 50 | M04-C03 旁证 | 匪徒补给箱上的代官火漆印 |
| `self_dora_singer` | 自我 | 个人：朵拉 | | knowledge：K0 | | 无 | 想去瓦伦堡当歌手 |
| `self_ed_ghosts` | 自我 | 个人：埃德 | | knowledge：K0 | | 无 | 鬼故事 |
| `self_ped_bread` | 自我 | 个人：佩德 | | knowledge：K0 | | 无 | 面包与税 |
| `self_lisa_bundle` | 自我 | 个人：莉莎 | | knowledge：K0 | 50 | 无 | 收拾好的小包袱 |
| `self_simon_wheat` | 自我 | 个人：西蒙 | | knowledge：K0 | | 无 | 今年的麦子 |
| `self_marg_laundry` | 自我 | 个人：玛格 | | knowledge：K0 | | 无 | 衣裳上的细节（细节往往是真的） |
| `self_ulf_lange_horses` | 自我 | 个人：乌尔夫 | | knowledge：K0 | | 无 | 驿马与燕麦 |
| `secret_ulf_lange_letters` | 秘密 | 个人：乌尔夫 | | knowledge：K0 | 60 | M04-C03 旁证 | 私拆过代官寄往瓦伦堡的信 |
| `self_knut_naumann_repair` | 自我 | 个人：克努特 | | knowledge：K1 | | 无 | 修补与冷锻 |
| `secret_knut_naumann_greystone` | 秘密 | 个人：克努特 | | knowledge：K1 | 40 | 真相第三幕，不入台词 | 他把灰石掺进铁里，只当是运气好 |
| `self_kas_ropebridge_count` | 自我 | 个人：卡斯 | | knowledge：K0 | | 无 | 数过桥的人 |
| `secret_kas_ropebridge_father` | 秘密 | 个人：卡斯 | | knowledge：K0 | 60 | 无 | 父亲是被独眼团杀的 |
| `self_dris_rank` | 自我 | 个人：德里斯 | | knowledge：K1 | | 无 | 升 B 级、离开乡下 |
| `secret_dris_ron_plan` | 秘密 | 个人：德里斯 | `a1_dris_duel_won` | knowledge：K1 | 50 | 无 | 他升 C 级那次的主意是罗恩出的 |

### 3.4 第二到第六幕的话题

第二幕起，每名有名人物默认拥有三个话题：`self_<人物 ID>`（自我，个人）、`secret_<人物 ID>`（秘密，个人；只在人物卡有秘密时登记，信任下限默认 60，台账线索按卡上的线索号）、`person_<人物 ID>`（人物，地区：此人的公开评价）。第 9 节清单的"专属话题"一栏逐人列出。下表登记各幕的地区、事件、世界、信仰、危险与任务主干话题；各幕地区话题的通用层句写在对应分幕文件。

**第二幕（瓦伦堡；M2）**

| 编号 | 类别 | 范围 | 首次可谈 | 版本 | 信任下限 | 台账 | 能答者与要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `place_wallenburg` | 地方 | 地区 | 已登记（第一幕） | knowledge：K0、K1；act：act2 | | 无 | 第二幕版本写城内的四区与城墙 |
| `place_wb_castle`、`place_wb_cathedral`、`place_wb_guild_hall`、`place_wb_scale_street`、`place_wb_ash_street`、`place_wb_tower_quarter`、`place_wb_mud_lane`、`place_wb_harbor`、`place_wb_wall_camp`、`place_wb_ferry` | 地方 | 地区 | `a2_arrive_valen` | knowledge：K0、K1 | | 无 | 鹰丘伯爵府、主教区、公会大区总部、秤街与大市集、炉灰街、学塔区、泥巷、河港与鱼市、墙外营地与慈济院、门前渡 |
| `place_old_watch` | 地方 | 地区 | 已登记 | act：act2 | | 无 | 第二幕版本写旧哨村立村 |
| `event_count_illness` | 事件 | 地区 | `a2_arrive_valen` | knowledge：K0、K2 | | S05-C01 | 伯爵病重；K2 版到 `a2_count_poison_found` 才说是毒 |
| `event_succession` | 事件 | 地区 | `a2_arrive_valen` | knowledge：K0、K1 | | 无 | 三位继承人之争；按 `a2_wb_ruler` 分句 |
| `event_promotion_exam` | 事件 | 地区 | `a2_promotion_exam` | knowledge：K0 | | M03-C04 | B 级晋升考核里水晶又没亮 |
| `event_heroes_arrive` | 事件 | 地区 | `a2_heroes_arrived` | knowledge：K0、K1 | | M11-C02 | 圣教勇者团进城 |
| `event_light_trial` | 事件 | 地区 | `a2_trial_outcome` | knowledge：K0；按 `a2_trial_outcome` 分句 | | MIS-19 的延续 | 光之审 |
| `event_city_tide` | 事件 | 地区 | `quest.q_a2_m12_defense` | knowledge：K0；按 `a2_wb_damage` 分句 | | 无 | 城下潮 |
| `event_door_company` | 事件 | 地区 | `a2_company_partner` | knowledge：K0 | | 无 | 门扉商会开张 |
| `event_faceless_projection` | 事件 | 个人：玛莎、布伦、无貌者在场者 | `a2_faceless_projection` | knowledge：K2 | | M09-C03、S07-C02 | 投影事件；"没有脸的人"在此之后可称"无貌者" |
| `lore_blank_years` | 世界 | 个人：学院史官、约纳斯、希尔德加德 | `a2_archivist_met` | knowledge：K1、K2、mis | 50 | M06-C01、MIS-03 | 学院年表圣历元年前五十年空白；`mis` 为"蒙昧时代" |
| `lore_city_below` | 世界 | 个人：学院史官、老船夫 | `a2_archivist_met` | knowledge：K2、K3 | 50 | M05-C05、M05-C06 | "荒原地下有一座城市"；K3（老船夫，`a2_ferryman_reveal`） |
| `lore_dungeon_growth` | 世界 | 地区（冒险者） | `a2_dungeon_first` | knowledge：K1 | | M04-C05 | 迷宫是灰气结成的，会长 |
| `lore_hero_cycle` | 世界 | 个人：老船夫、学院史官 | `trust.archivist >= 50 OR trust.ferryman >= 50` | knowledge：K2 | 50 | M08-C05 | 魔王约百余年一轮 |
| `lore_charter_text` | 世界 | 个人：学院 | `act >= 2` | knowledge：K1、K2、mis | | M10-C03、MIS-22 | 规约古文与官方译本 |
| `lore_page_absent` | 世界 | 个人：艾登 | `a2_aiden_no_page` | knowledge：K2 | 50 | M03-C06、M03-C07 | "铭录里没有你。我查过了。" |
| `lore_remnant_mark` | 世界 | 个人：梅芙、遗民 | `a2_remnants_settled` | knowledge：K1 | 60 | M02-C04（门徒会经文不入） | 遗民的手套与夜里留的门缝 |
| `faith_disciples` | 信仰 | 个人：门徒会成员、奥伊根、诺拉 | `a2_disciples_lair` | knowledge：K2、mis | | M02-C04、MIS-09、S07-C01 | "开门的母亲会回来"；`mis` 为门徒会的乐园说法 |
| `danger_city_sewers`、`danger_harbor_night`、`danger_waste_crystal_gully` | 危险 | 地区 | `a2_arrive_valen` | knowledge：K0 | | 无 | 旧水道、夜里的码头、晶沟 |
| `quest_company_charter`、`quest_village_founding`、`quest_city_defense` | 任务 | 地区 | 按任务目录 | knowledge：K0 | | 无 | 商会、立村、守城的入口 |

**第三幕（洛萨全境与荒原；M2）**

| 编号 | 类别 | 范围 | 首次可谈 | 版本 | 信任下限 | 台账 | 能答者与要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `place_orion`、`place_or_crownstone`、`place_or_cathedral`、`place_blackoak`、`place_oakshield`、`place_deerford`、`place_reedbridge`、`place_reedpond`、`place_tr_territory`、`place_waste_middle`、`place_door_camp_ruins` | 地方 | 地区 | `act >= 3` | knowledge：K0、K1 | | 苇塘村：K1 只限遗民与玩家同伴 | 王都、冠石宫、主座堂、黑橡堡、橡盾要塞、鹿渡、苇桥村、苇塘村、灰烬边境领、荒原中层、拾门者营地 |
| `event_holy_war` | 事件 | 地区 | `act >= 3` | knowledge：K0、mis | | MIS-07 雏形 | 圣战号召；教会说"异端引来了灾祸" |
| `event_dawn_pillar` | 事件 | 地区 | `a3_holy_war_miracle` | knowledge：K0、K1 | | M04-C07 | 曙光圣柱与之后荒原的变化 |
| `event_reedpond` | 事件 | 个人：在场者、遗民、结衣、马库斯 | `a3_massacre_witnessed` | knowledge：K1；按 `a3_reedpond_outcome` 分句 | | S06-C02、S04-C03 | 苇塘村事件 |
| `event_ashline` | 事件 | 地区 | `quest.q_a3_m11_ashline` | knowledge：K0 | | 无 | 灰烬防线之战 |
| `event_sasha_duel` | 事件 | 地区 | `a3_sasha_result` | knowledge：K0 | | M05-C08 | 与萨莎的决斗、撤军时那句话 |
| `event_eluen_voice` | 事件 | 个人：在场者 | `a3_eluen_speaks` | knowledge：K1、K4 | | M01-C07 | 大主教口中艾琉恩的那句话（锚点 A02 的回扣） |
| `event_capital_coup` | 事件 | 地区 | `a3_drake_fate` | knowledge：K0 | | 无 | 宰相投敌前后；事前只有宰相本人知道 |
| `lore_sundering` | 世界 | 个人：阿什 | `a3_ash_tells_sundering` | knowledge：K3 | | M05-C07、M02-C07、M02-C08 | 阿什讲述；解锁前称谓"那件事""邪神之乱" |
| `lore_thousand_gates_city` | 世界 | 个人：阿什、夜羽 | `a3_ash_tells_sundering` | knowledge：K3 | | 称谓开放表 | "千门都"一词从此可用 |
| `lore_sixth_stele` | 世界 | 个人：学者、玩家同伴 | `a3_defaced_stele_found` | knowledge：K3 | | M02-C06 | 被凿毁的第六座碑 |
| `lore_blank_era` | 世界 | 个人：档案馆、阿什 | `a3_archive_sealed_room` | knowledge：K2、K3 | 50 | M06-C03 到 C05 | "空白纪"一词从此可用 |
| `lore_fallen_hero` | 世界 | 通用 | `act >= 3` | knowledge：K0、mis | | M08-C06、MIS-16 | 第六代勇者"堕落"（教会版） |
| `lore_doors_and_seal` | 世界 | 个人：阿什、玩家同伴 | `a3_ash_warning_doors` | knowledge：K3 | | M09-C04、M09-C05 | "你每开一扇门，她就离出来更近一步" |
| `faith_crusade` | 信仰 | 地区 | `act >= 3` | knowledge：K0、K1 | | MIS-07 | 圣战军的信条与"净化之光" |
| `danger_ash_storm`、`danger_waste_wyrm` | 危险 | 地区 | `act >= 3` | knowledge：K0、K1 | | M05-C11 | 灰暴；荒原深处的灰化亚龙 |
| `quest_territory_build`、`quest_thousand_gate`、`quest_ashline_prep` | 任务 | 地区 | 按任务目录 | knowledge：K0 | | 无 | 领地建设、千军之门、防线准备的入口 |
| `secret_ron_first_squad` | 秘密 | 个人：罗恩 | `quest.q_a3_s45_ron_ran_once.stage == confess` | knowledge：K0 | 70 | 无 | 罗恩的夜谈（`A3-S45` 的 `confess`，灰烬防线开战前、玩家留在领地的夜里）：第一支冒险小队全灭时他是唯一逃走的人（角色设定集 3.3；第一幕 `secret_ron_wolf` 的后半）；一次性；夜谈结束时写 `a3_ron_confessed = true`（`cut_a3_ashen_line` 战前夜引用） |

**第四幕（大陆；M3）**

| 编号 | 类别 | 范围 | 首次可谈 | 版本 | 信任下限 | 台账 | 能答者与要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `place_holysee`、`place_grantia`、`place_mercato`、`place_silva`、`place_windfang`、`place_night`、`place_sleepscale`、`place_outer_nation` | 地方 | 地区 | `act >= 4` | knowledge：K0、K1 | | 无 | 教国、帝国、同盟、希尔瓦、风牙、夜境、眠鳞山脉、庭外之国 |
| `place_red_gravel_arena`、`place_golden_bay_exchange`、`place_root_court`、`place_ancestor_mounds`、`place_dark_crown_city`、`place_star_terrace` | 地方 | 地区 | `act >= 4` | knowledge：K0、K1 | | 无 | 红砾城斗场、金湾交易所、根下庭、祖灵冢、黯冠城、观穹台 |
| `event_nation_founded` | 事件 | 地区 | `a4_nation_founded` | knowledge：K0 | | 无 | 庭外之国立国 |
| `event_conclave` | 事件 | 地区 | `a4_conclave_done` | knowledge：K0；按 `a4_summit_result` 分句 | | 无 | 七国会盟 |
| `event_beast_king` | 事件 | 地区（风牙） | `a4_beast_king` | knowledge：K0 | | 无 | 兽王之争 |
| `event_key_theft` | 事件 | 个人：梅尔卡、奈拉、在场者 | `a4_key_theft_exposed` | knowledge：K4 | | M07-C07 | 钥匙失窃 |
| `event_ash_full_revelation` | 事件 | 通用 | `a4_revelation_ash_full` | knowledge：K0、K3 | | M12-C05、M08-C07 | 七座碑一千年来第一次显字 |
| `event_feast_of_strong` | 事件 | 地区（帝国） | `a4_feast_of_strong` | knowledge：K0 | | M12-C04 | 强者之宴 |
| `lore_goddess_versions` | 世界 | 个人：五司、玩家同伴 | `a4_goddess_versions_heard >= 3` | knowledge：K4 | | M07-C04、M10-C06 | 每位女神讲一个版本 |
| `lore_isomorphism` | 世界 | 个人：莫伊拉 | `a4_moira_isomorphism` | knowledge：K4 | | M07-C05 | 同构从此可谈 |
| `lore_charter_two_readings` | 世界 | 个人：艾登 | `a4_aiden_reads_charter` | knowledge：K3 | | M10-C05 | 规约的两种读法 |
| `lore_purify_push` | 世界 | 个人：结衣、学者 | `a4_yui_purify_truth` | knowledge：K3 | | M04-C08、M04-C13 | 净化只是把灰气推开 |
| `lore_star_records` | 世界 | 个人：赫尔加·施特恩、埃尔德 | `a4_star_records` | knowledge：K2、K3 | 50 | M12-C03 | 星辰"太整齐" |
| `lore_demon_history_night` | 世界 | 地区（夜境） | `a4_feast_of_strong OR act >= 4` | knowledge：K1、K2 | | M07-C03 | 夜境版魔王史 |
| `faith_heresy_writ` | 信仰 | 地区 | `a4_heresy_state` | knowledge：K0 | | MIS-07 正式 | "规格外者就是魔王的先驱" |
| `faith_sanctuary` | 信仰 | 个人：欧拉、艾尔温、遗民 | `a4_sanctuary_found` | knowledge：K3 | 60 | M09-C07、S08-C04 | 大森林深处的庇护所 |
| `danger_furnace_sickness`、`danger_pilgrim_pit`、`danger_broken_sword_plain` | 危险 | 地区 | `act >= 4` | knowledge：K2 | | M04-C14、M04-C15、M08-C12 | 炉下的病、巡礼坑、折剑原（只可暗示） |
| `quest_conclave_seat`、`quest_econ_war`、`quest_beast_king` | 任务 | 地区 | 按任务目录 | knowledge：K0 | | 无 | 会盟、经济战、兽王之争的入口 |

**第五幕（诸族之战；M3）**

| 编号 | 类别 | 范围 | 首次可谈 | 版本 | 信任下限 | 台账 | 能答者与要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `event_demon_king_born` | 事件 | 通用 | `a5_demon_king_born` | knowledge：K0、K3 | | M09-C08、S01-C09 | 第九代魔王诞生；"无貌之王"一词从此可用 |
| `event_trial_called` | 事件 | 通用 | `a5_revelation_trial` | knowledge：K0、K3 | | M10-C08 | 天启"审期至" |
| `event_fronts` | 事件 | 地区（联军） | `act >= 5` | knowledge：K0；按 `front.<线>` 分句 | | 无 | 五条战线的近况 |
| `event_yui_descent` | 事件 | 个人：在场者 | `a5_yui_descent` | knowledge：K1、K4 | | S04-C05 | 神降 |
| `lore_purge_cycle` | 世界 | 通用 | `a5_truth_purge_cycle` | knowledge：K0、K4 | | M04-C10、M08-C10 | "排澱"一词从此可用 |
| `lore_gate_ring` | 世界 | 地区（联军） | `act >= 5` | knowledge：K1、K3 | | M04-C11 | 众门环与众生的办法 |
| `lore_edge_of_world` | 世界 | 个人：艾斯卡、学者 | `a4_star_records AND act >= 5` | knowledge：K3 | | M12-C07 | 终雾与天穹 |
| `danger_demon_host` | 危险 | 地区 | `a5_demon_king_born` | knowledge：K0 | | 无 | 魔王之军 |
| `quest_front_orders`、`quest_ring_nodes` | 任务 | 地区 | 按任务目录 | knowledge：K0 | | 无 | 战线令与众门环节点的入口 |

**第六幕与终章（审庭与后日谈；M3）**

| 编号 | 类别 | 范围 | 首次可谈 | 版本 | 信任下限 | 台账 | 能答者与要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `place_court`、`place_corridor_of_doors` | 地方 | 个人：五司、雅努、夜羽 | `a6_court_open` | act：act6 | | 无 | 神庭与千门回廊 |
| `event_review_crises` | 事件 | 地区 | `act >= 6` | knowledge：K0；按 `review.<危机>` 分句 | | 无 | 审期五场危机 |
| `lore_charter_meaning` | 世界 | 个人：雅努、莫伊拉 | `a6_charter_read` | knowledge：K4 | | M10-C10、M10-C12 | 规约本意 |
| `lore_earth_garden` | 世界 | 个人：五司、雅努 | `a6_earth_truth` | knowledge：K4 | | M11-C06 | "已离手之庭"一词从此可用 |
| `self_janu_intent` | 自我 | 个人：雅努 | `a6_janu_intent_revealed` | knowledge：K4 | | M09-C11 | 她的真实意图 |
| `topic.court_fact`、`topic.court_just`、`topic.court_need` 下的立场版本 | 世界 | 个人：五司 | `a6_court_open` | 立场：否认、淡化、正当化、诉诸必要、反诉、沉默、坦白、求情、交易、争掌、请求量处 | | 第六幕第 5 节 | 审庭三道防线的回应（槽位见第 1.6 节） |
| `event_epilogue` | 事件 | 地区 | `ending IN (release, release_unfinished, new_god, rule_eluen, rule_valda, rule_merca, rule_sylvie, rule_moira, janu_restored, reclaim)` | knowledge：K0；按 `ending` 分句 | | 无 | 后日谈的街谈 |

**分幕文件追加登记**

分幕文件追加的话题编号逐行登记在此表下方（表头同上），只追加，不改已有行。

## 4. 通用层 `ln_common`

`ln_common` 是回退链的最后一层（builtin_ai 第 7.3 节第 7 步）。这里的句子人人可用，所以全部写成"谁说都不出错"的样子：不带人名地名，靠填充槽贴近说话者；口吻平实，留给本人包、模板与阶层层去着色。有名人物一场会话里来自本层的句子不超过 15%（builtin_ai 第 14.1 节），本层只是兜底。

本节共 787 句：问候与告别 21、通用话题 86、反应 252、凡人不信 18、吠叫 82、记忆 76、日记 45、传话 45、传闻零件 23、事迹短语 16、解释 33、闲谈 24、文书 32、过度解读 34。

### 4.1 问候与告别

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 有话快说。／2. 又是你。／3. 说吧，我听着呢。 |
| greet.neutral.day | 1. 嗯？{player}，有事？／2. 天亮着呢，有什么事？／3. 是你啊。找我？ |
| greet.neutral.night | 1. 这么晚了，{player}。／2. 夜里走动，小心脚下。／3. 天都黑了，什么事？ |
| greet.neutral | 1. 〔first〕头一回见啊，{player}。／2. 〔first〕{player}？没见过你。新来的吧。／3. 〔first〕外乡人？{place}可不大，你是从哪儿来的？ |
| greet.warm | 1. 来啦，{player}。／2. 正想着你呢。坐，坐。／3. 你来得正好。 |
| farewell | 1. 慢走。／2. 回头见。／3. {catch}／4. 〔mood: 怒〕走吧走吧。／5. 〔mood: 乏〕我得歇会儿了，改天再说。／6. 〔mood: 喜〕下回再来，{player}！ |

### 4.2 通用话题 `gen_*`

| 槽位 | 句 |
| --- | --- |
| topic.gen_self.cold | 1. 我是谁跟你有什么关系。／2. {name}。就这样。 |
| topic.gen_self.neutral | 1. 我叫{name}，在{place}过日子。／2. {name}。你问这个做什么？ |
| topic.gen_self.warm | 1. 我？{name}。在{place}住了这么些年，好坏都见过一点。／2. 说起我，也没什么稀奇的：干活、吃饭、睡觉，偶尔担心一下明天。 |
| topic.gen_work.K0 | 1. 混口饭吃的活计，说出来你也未必感兴趣。／2. 我干的就是手上这点事，干好了就能吃饱。 |
| topic.gen_work.K1 | 1. 这一行的门道多着呢，外人看着简单。／2. 行里的规矩，谁先坏了谁吃亏。 |
| topic.gen_place.K0 | 1. {place}啊，还过得去。就是近来不太平。／2. 这地方小，谁家有点事，第二天全知道。 |
| topic.gen_place.K1 | 1. {place}的好坏，看税单、看集日、看夜里有没有人敲门。／2. 要我说，{place}最缺的是安生日子。 |
| topic.gen_news.K0 | 1. 最近？听说{event}。／2. 还能有什么，{event}，大家都在说。 |
| topic.gen_news.K1 | 1. 最要紧的事是{event}，后头怎么样还不好说。／2. {event}。这事没那么简单，你多留个心。 |
| topic.gen_you.unaware | 1. 你？没怎么听说过。新来的吧。／2. 不认识你，也没听人说起过。 |
| topic.gen_you.doubt | 1. 就你？外头传的那些，我一个字都不信。／2. 听说了些你的事，吹得没边了吧。 |
| topic.gen_you.explaining | 1. 你嘛……说不清，大概是{expl}。／2. 我看啊，{expl}，没别的。 |
| topic.gen_you.wavering | 1. 我……说不好。也许你真有两下子。不，不可能。／2. 别问我。我最近不太敢下结论。 |
| topic.gen_you.worship | 1. 您就别谦虚了！您的本事谁不知道！／2. 有您在，这地方就踏实。 |
| topic.gen_you.hostile | 1. 你不是寻常人。离我远点。／2. 我不想跟你这种人多说话。 |
| topic.gen_you.exploit | 1. 你有本事，我有门路。我们可以谈谈。／2. 像你这样的人，用对了地方，大家都有好处。 |
| topic.gen_you.depend | 1. 有您在就好。／2. 这地方能撑下来，多亏了您。 |
| topic.gen_faith.K0 | 1. 我信{goddess}。逢礼拜日就去，不去心里不踏实。／2. 信是信的，求的也就是一家平安。 |
| topic.gen_faith.K1 | 1. 各位女神各管一摊，可教会只认光。这话你别往外传。／2. 拜神也得看时候：打仗前拜一位，做买卖拜一位。 |
| topic.gen_trouble | 1. 〔mood: 愁〕烦心事？多得很。就说眼下这件吧……／2. 〔mood: 愁〕你要是有空，帮我个忙？我这儿真是没辙了。／3. 〔mood: 乏〕累，就是累，干不完的活。／4. 〔mood: 平〕还好，没什么大事。谢谢你问。 |
| topic.gen_advice.K0 | 1. 新来的？晚上别往北边走，钱别露白。／2. 先认得人，再做事。 |
| topic.gen_advice.K1 | 1. 接活之前先打听，活好不好，看谁在找人干。／2. 见人先看手，手上的茧不骗人。 |
| topic.gen_people | 1. 我跟{who}还算熟。／2. 要说认识的人，{who}算一个，你去问问。／3. 〔mood: 怒〕{who}？别跟我提他。／4. {who}这人，一句两句说不清，你自己去看吧。 |
| topic.gen_directions | 1. 往{dir}走，看见{landmark}就到了，{dist}。／2. {place}？顺着路往{dir}，{dist}，走不丢的。／3. 你从{landmark}那边绕过去，别抄近路。／4. {dist}。我给你指个方向：{dir}。 |
| topic.gen_prices | 1. 最近东西{price}。／2. {item}嘛，{price}。／3. 你要问行情，我只能说{price}，具体的去问卖货的。／4. 一天一个价，今天是{price}。 |
| topic.gen_danger.K0 | 1. 别往{place}去，那边不干净。／2. 夜里有东西在外头叫，大家都关门。 |
| topic.gen_danger.K1 | 1. {place}那一片，近来魔物多了，结伴走。／2. 灰气重的地方，别多待。 |
| topic.gen_past.cold | 1. 过去的事，不提也罢。／2. 我们没熟到那一步。 |
| topic.gen_past.warm | 1. 年轻时也有过想法，后来日子把想法磨平了。／2. 这些年走过的路，说起来一晚上都说不完。 |
| topic.gen_shop | 1. 要买什么？看看吧。／2. 东西都在这儿，价钱好商量，就一点点。／3. 想卖？拿出来我瞧瞧。／4. 今天货不多，先到先得。 |
| topic.gen_craft | 1. 要做什么、修什么，说清楚。／2. 东西放下，过几天来取。／3. 材料你出还是我出？价钱不一样。／4. 活是能干，就是得排队。 |
| topic.gen_train | 1. 想学？先让我看看你的底子。／2. 学这个要吃苦，学费也不能少。／3. 我教得慢，你学得快就行。／4. 今天先教一样，回去自己练。 |
| topic.gen_heal | 1. 哪儿不舒服？坐下说。／2. 伤让我看看。／3. 能治的我治，治不了的我直说。／4. 药钱回头再算，先把人顾好。 |
| topic.gen_info | 1. 消息有，价钱也有。／2. 你想知道什么？说具体点。／3. 这年头，消息比盐贵。／4. 我只卖我信得过的消息。 |

### 4.3 反应 `react.*`

与意图相连的种类每种 4 句以上（第 5 节），其余每种 2 到 3 句。

| 槽位 | 句 |
| --- | --- |
| react.feat_seen | 1. 我看见了，这……是真的？／2. 好厉害！／3. 你怎么做到的？／4. 〔mood: 惧〕别、别过来…… |
| react.feat_heard | 1. 听说{feat}，是你？／2. 外头都在说你{feat}，我可不信。 |
| react.rumor_self | 1. 外头说我什么了？谁说的？／2. 我的事轮不到别人嚼舌头。 |
| react.awe_fear | 1. 别、别伤我！／2. 我什么都没看见！什么都没看见！／3. 光啊……保佑…… |
| react.miracle_awe | 1. 这是奇迹……光在看着！／2. 我要去告诉大家，真的有神迹！／3. 跪下，快跪下！ |
| react.heresy_alarm | 1. 这不是光……这是别的东西！／2. 别靠近他，去叫神父！／3. 光不会这样……这里头有邪祟。 |
| react.identity_pageless | 1. 无记载？怎么会什么都读不出来？／2. 水晶又坏了吧。／3. 读不出来的人……我头一回见。／4. 光照不出的东西……算了，我什么都没说。 |
| react.identity_door | 1. 人……人呢？刚才还在这儿！／2. 他走进去了？进哪儿去了？ |
| react.identity_guest | 1. 外头来的？那是什么意思？／2. 你说你不是这里的人……我还是当你喝多了。 |
| react.identity_gatemark | 1. 你手上那是……别让人看见。／2. 那个印子，我在别处见过。 |
| react.identity_pressure | 1. 你身上……有股压得人喘不过气的东西。／2. 我腿软了，怎么回事？ |
| react.identity_matched | 1. 是你！传闻里说的就是你！／2. 跟告示上说的对得上。 |
| react.gatefolk_recognize | 1. （低声）门开着呢。／2. 你也是……认得路的人？ |
| react.challenge | 1. 站住，例行问话。／2. 你的名字，从哪儿来，到哪儿去。／3. 有人报了你的事，跟我走一趟。 |
| react.belief_worship | 1. 是您！您来了！／2. 我就知道，您不是一般人。／3. 您要什么尽管开口。 |
| react.belief_hostile | 1. ……你来做什么。／2. 离我远点。／3. 这里不欢迎你。 |
| react.belief_exploit | 1. 正想找你呢，{player}。／2. 你这样的人，我用得上。／3. 有笔买卖，只有你做得成。 |
| react.belief_depend | 1. 您得替我们拿个主意。／2. 有您在，我们就不怕了。／3. 求您了，这事只有您能管。 |
| react.switch | 1. ……那就是另一回事了。／2. 不对，不对，我想岔了。 |
| react.switch.luck | 1. 那就是运气。一定是。／2. 碰巧罢了，碰巧。 |
| react.switch.wounded | 1. 那东西肯定早被人打残了。／2. 捡了个漏，没别的。 |
| react.switch.gadget | 1. 身上准藏着什么机关。／2. 不是人的本事，是东西的本事。 |
| react.switch.cheat | 1. ……那你是不是跟谁串通了？／2. 不对，这里头一定有诈。 |
| react.switch.misreport | 1. 那就是传话的人吹过头了。／2. 见过的人少，说的人多，信不得。 |
| react.switch.miracle | 1. 那是光在眷顾。／2. 不是人力，是神迹。 |
| react.switch.sorcery | 1. 不是光……那就是别的东西。／2. 这里头有邪祟，我早该想到。 |
| react.switch.conspiracy | 1. ……这里头一定有人安排。／2. 有人在背后推着，我看出来了。 |
| react.switch.hidden_identity | 1. 你其实是哪家的少爷吧？／2. 隐姓埋名的高手，对，一定是。 |
| react.switch.bloodline | 1. 血统，一定是血统。／2. 祖上出过大人物吧？ |
| react.switch.useful | 1. 管他怎么做到的，这个人用得上。／2. 想那么多做什么，有用就行。 |
| react.helped | 1. 上回多亏了你。／2. 你帮过我，我记着。／3. 欠你一个人情。 |
| react.saved | 1. 要不是你，我这条命就没了。／2. 救命之恩，我这辈子都记得。／3. 我……我还活着。谢谢你。 |
| react.harmed | 1. 你伤了我，别想我当没发生过。／2. 这笔账我记下了。 |
| react.cheated | 1. 你骗了我。／2. 下回别指望我再信你。 |
| react.mourning | 1. 人没了……什么都没了。／2. 让我一个人待会儿。 |
| react.thanked | 1. 不用谢。／2. 客气什么。／3. 应该的。／4. 记着就行，下回换你帮我。 |
| react.apology_accept | 1. 算了，这回就算了。／2. 知道错就好。／3. 行，翻篇。／4. 我也有不对的地方。 |
| react.apology_reject | 1. 一句对不起就完了？／2. 我现在不想听。／3. 等你做点什么再说。／4. 道歉不值钱。 |
| react.flattered | 1. 哪里哪里。／2. 你嘴可真甜。／3. 少来这套，不过……谢谢。／4. 夸我也不打折。 |
| react.insult | 1. 你说什么？／2. 嘴放干净点。／3. 我没空跟你吵。／4. 〔mood: 怒〕再说一遍试试？ |
| react.threatened | 1. 〔mood: 惧〕别、别动手，有话好说……／2. 〔mood: 惧〕我、我知道了……／3. 你吓唬谁呢？／4. 在{place}动手？你试试看。 |
| react.joke | 1. 哈，你这人真有意思。／2. 不好笑。／3. 行行行，算你说得对。／4. 你这是逗我呢。 |
| react.advance | 1. 去去去，没正经。／2. 这话你跟谁都这么说吧。／3. 我可没那个心思。／4. 再这么说我就不理你了。 |
| react.boast | 1. 吹吧你就。／2. 说得跟真的似的。／3. 嗯，嗯，我信了。／4. 本事大不大，不是嘴上说的。 |
| react.identity_claim | 1. 别的世界？你喝多了吧。／2. 这话可别在神父面前说。／3. 好好好，你是从天上掉下来的。／4. 你说的这些，我一句也听不懂。 |
| react.accused | 1. 你凭什么这么说？／2. 拿出证据来。／3. 血口喷人！／4. 我没做过的事，你别往我头上扣。 |
| react.persuaded | 1. ……你说得有道理。／2. 好吧，我再想想，照你说的来。／3. 行，我听你的。／4. 也许是我想错了。 |
| react.unpersuaded | 1. 我主意已定。／2. 你说得好听，我不信。／3. 别劝了。／4. 这事你不懂。 |
| react.promise_noted | 1. 说定了。／2. 我记下了，你可别忘。／3. 好，就这么办。／4. 一言为定。 |
| react.declined | 1. 不行。／2. 这事我不干。／3. 换个人吧。／4. 别为难我。 |
| react.nothing_more | 1. 就这些了。／2. 我知道的都说了。／3. 再多的，我也不知道了。／4. 别问了，真没了。 |
| react.confused | 1. 嗯？你说什么？／2. 我没听明白。／3. 你说的这些，我不太懂。{topic_hint}，这个我倒能说说。／4. 是吗。 |
| react.nonsense | 1. 你在说胡话吧？／2. 这都是什么怪词。／3. 你是不是发烧了？／4. 听不懂，也不想懂。 |
| react.gift_liked | 1. 给我的？这正是我想要的！／2. 太好了，谢谢你！／3. 你怎么知道我喜欢这个？／4. 这礼我收下了，记你一份情。 |
| react.gift_plain | 1. 谢谢。／2. 嗯，收下了。／3. 你有心了。／4. 用得上。 |
| react.gift_disliked | 1. 这个……我用不上。／2. 你还是拿回去吧。／3. 谢谢，不过我不太喜欢这个。／4. 你确定是要给我的？ |
| react.haggle_ok | 1. 行行行，算你便宜点。／2. 就这一回啊。／3. 看你顺眼，让一点。／4. 成交。别跟别人说这个价。 |
| react.haggle_no | 1. 不能再低了。／2. 这个价已经是亏本了。／3. 嫌贵别买。／4. 一个铜板都不让。 |
| react.bribe_accept | 1. （压低声音）……这回就当我没看见。／2. 你懂事。走吧。／3. 收起来，别让人看见。／4. 只此一次。 |
| react.bribe_refuse | 1. 收回去。你当我是什么人？／2. 想用钱买我？／3. 这事钱办不了。／4. 再拿出来，我就叫人了。 |
| react.wrong_person | 1. 这事你找错人了，去问{who}。／2. 我不管这个，{who}管。／3. 你得去{place}找人。／4. 我帮不上，不过{who}也许行。 |
| react.no_work | 1. 没活给你。／2. 眼下没什么要帮忙的。／3. 有活我会说的。／4. 你去委托板看看吧。 |
| react.decline | 1. 我帮不了你。／2. 这忙我帮不上。／3. 对不起，我自己都顾不过来。／4. 别的事还行，这事不行。 |
| react.deny | 1. 没有的事。／2. 不是，你听错了。／3. 我不知道你在说什么。／4. 别乱猜。 |
| react.evade | 1. 现在不是说这个的时候。／2. 这个……下回再说吧。{topic_hint}，你问这个我倒能说。／3. 换个话题吧。／4. 有些事，不该在这儿说。 |
| react.unknown | 1. 没听说过。／2. 这我可不知道。／3. 问我也没用。／4. 那是什么？头一回听说。 |
| react.hint | 1. 你看见的，未必是全部。／2. 门后面的东西，得自己去看。 |
| react.recruit_yes | 1. 好，我跟你走。／2. 早等你这句话了。／3. 算我一个。／4. 行，就当我欠你的。 |
| react.recruit_terms | 1. 跟你走可以，先说好条件。／2. 你先帮我把手上的事了了。／3. 工钱怎么算？／4. 我有个条件。 |
| react.recruit_later | 1. 现在不行，等过阵子。／2. 再让我想想。／3. 等你在这儿站稳了再说。／4. 我还有事放不下。 |
| react.recruit_no | 1. 我不去。／2. 我们不是一路人。／3. 你找别人吧。／4. 这条命我还想留着。 |
| react.self_recommend | 1. 那个差事，能不能让我试试？／2. 我觉得我干得了。 |
| react.request_battle | 1. 让我上吧。／2. 再等下去就晚了，打吧。 |
| react.rival_taunt | 1. 又是你，还没走呢？／2. 有本事跟我比一场。 |
| react.rival_concede | 1. ……我输了。／2. 这回算你赢。 |
| react.call_favor | 1. 你还欠我一个人情，记得吗？／2. 该你还人情的时候了。 |
| react.ask_help | 1. 能帮我个忙吗？／2. 这事我一个人办不了。 |
| react.invite | 1. 晚上一起吃个饭？／2. 改天来我那儿坐坐。 |
| react.goddess_invoked | 1. 你在念谁的名字？／2. 这名字可不是随便叫的。／3. 〔mood: 惧〕别、别在这儿念那个……／4. 光在上，你这是做什么？ |
| react.earth_talk | 1. 什么？那是什么东西？／2. 你那边的玩意儿真稀奇。／3. 会自己跑的车？你做梦呢。／4. 说说看，那东西怎么做的？ |
| react.earth_refuse | 1. 那种东西做不出来的。／2. 这话要是让教会听见，会烧掉你的。／3. 纸上写的钱？那叫欠条。／4. 一点就炸的粉？别想了，没人会碰。 |

### 4.4 凡人不信三档通用句

| 槽位 | 句 |
| --- | --- |
| unbelief.deny | 1. 就你？那个 F 级的？／2. 外头传的那些，我一个字都不信。／3. {rumor}？编得真像回事。／4. 你的公会卡上写着什么，我可看见了。／5. 一个连鉴定都读不出来的人，能干出这种事？／6. 吹牛的人我见多了，{player}。 |
| unbelief.explain | 1. 我看是{expl}。／2. {expl}，没别的。／3. 又是{expl}。／4. 说破天也就是{expl}。／5. 你别得意，{expl}罢了。／6. 换谁去都一样，{expl}。 |
| unbelief.waver | 1. 也许……不，不可能。／2. {feat}那回……我还是想不通。／3. 你别这么看我，我只是还没想好。／4. 我没说信你，我只是……算了。／5. 那天的事，我跟谁都没细说。／6. 要是真的，那可就……不，别想了。 |

### 4.5 吠叫 `bark.*`（通用层）

| 槽位 | 句 |
| --- | --- |
| bark.work | 1. 活儿还没干完呢。／2. 忙着呢。{catch} |
| bark.eat | 1. 吃饭的时候别谈正事。／2. 〔mood: 乏〕肚子饿得咕咕叫，有话边吃边说。 |
| bark.sleep | 1. ……唔……让我再睡会儿……／2. ……（睡得正香）…… |
| bark.pray | 1. 我在祷告，等一会儿。／2. 求保佑一家平安…… |
| bark.chat | 1. 随便聊聊呗。／2. 你也来凑热闹？ |
| bark.shop | 1. 东西又涨价了。／2. 盐比上个月贵了。 |
| bark.wander | 1. 今天{place}挺热闹。／2. 随便走走。 |
| bark.home | 1. 回家，关门，睡觉。／2. 家里还有一堆事。 |
| bark.travel | 1. 路还远着呢。／2. 天黑前得赶到{next}。 |
| bark.patrol | 1. 这边没事。下一处。／2. 眼睛放亮点。 |
| bark.sermon | 1. 光照着每一个人。／2. 诸位，请静一静。 |
| bark.vendor_call | 1. 来看看，来看看！／2. 新货到了，便宜卖！ |
| bark.camp | 1. 火别灭了。／2. 轮到谁守夜了？ |
| bark.morning | 1. 天亮了，又是一天。／2. 早起的鸟儿有虫吃。 |
| bark.evening | 1. 天快黑了，收工吧。／2. 晚饭吃什么呢。 |
| bark.night | 1. 这么晚还有人在外头？／2. 夜里静得吓人。 |
| bark.rain | 1. 这雨下得人心里发潮。／2. 雨一时停不了。 |
| bark.snow | 1. 雪下大了。／2. 冷得手都伸不出来。 |
| bark.storm | 1. 这雷打得吓人，早点回去吧。／2. 风大，把门闩好。 |
| bark.fog | 1. 雾大，别往北边走。／2. 什么都看不清。 |
| bark.ashfall | 1. 天上在落灰……不吉利。／2. 把窗关上，灰进屋了。 |
| bark.fear | 1. 别过来……／2. 我听见外头有动静。 |
| bark.angry | 1. 气死我了。／2. 谁都别来惹我。 |
| bark.worried | 1. 手头紧，得多干点活。／2. 这日子可怎么过。 |
| bark.tired | 1. 累死了，想睡一觉。／2. 腿都直不起来了。 |
| bark.happy | 1. 今天是个好日子。／2. 哈，运气不错。 |
| bark.danger | 1. 快跑！有东西来了！／2. 关门，关门！ |
| bark.combat | 1. 上啊！／2. 小心背后！ |
| bark.hurt | 1. 啊！／2. 我受伤了…… |
| bark.flee | 1. 撤！快撤！／2. 打不过，跑！ |
| bark.victory | 1. 赢了！／2. 总算打完了。 |
| bark.ally_down | 1. 有人倒下了！／2. 快，扶起来！ |
| bark.festival | 1. 今天热闹！／2. 喝一杯，喝一杯！ |
| bark.holy_day | 1. 今天礼拜日，别干重活。／2. 去礼拜堂吗？ |
| bark.market_day | 1. 今天集日，人真多。／2. 去集上转转。 |
| bark.wartime | 1. 又要打仗了。／2. 粮食得省着吃。 |
| bark.monster_season | 1. 魔物季到了，夜里别出门。／2. 今年的魔物季来得早。 |
| bark.see_player | 1. 那人是谁？／2. 就是他吧，外头说的那个。 |
| bark.see_feat | 1. 你们看见了吗？／2. 这不可能…… |
| bark.crowd | 1. 让一让，让一让。／2. 前面出什么事了？ |
| bark.dream | 1. ……别走……／2. ……门……开着…… |

### 4.6 记忆 `mem.*`

记忆模板由内核在事件发生时写入（builtin_ai 第 5.3 节），按观察者语体取 `.folk`、`.guild`、`.lettered` 变体；`.short` 是填 `{memory}` 用的短句。

| 槽位 | 句 |
| --- | --- |
| mem.feat_seen.folk | 1. {place}，我亲眼看见{who}{feat}。 |
| mem.feat_seen.guild | 1. 在{place}亲眼见{who}{feat}，记一笔。 |
| mem.feat_seen.lettered | 1. 于{place}目睹{who}{feat}，此事须记。 |
| mem.feat_seen.short | 1. 那回你{feat} |
| mem.rumor_heard.folk | 1. 听{who}说，{rumor}。 |
| mem.rumor_heard.guild | 1. {who}传来的消息：{rumor}。真假待查。 |
| mem.rumor_heard.lettered | 1. 闻{who}言：{rumor}。存疑。 |
| mem.rumor_heard.short | 1. 听人说起你的那件事 |
| mem.talk_player.folk | 1. 跟{player}在{place}说了会儿话。 |
| mem.talk_player.guild | 1. 和{player}谈过一次，人还算爽快。 |
| mem.talk_player.lettered | 1. 与{player}一晤。 |
| mem.talk_player.short | 1. 上回我们聊过 |
| mem.gift.folk | 1. {who}送了我{item}。 |
| mem.gift.guild | 1. 收了{who}的{item}，这份情得记着。 |
| mem.gift.lettered | 1. 受{who}所赠{item}。 |
| mem.gift.short | 1. 你送我的{item} |
| mem.helped.folk | 1. {who}在{place}帮了我一把。 |
| mem.helped.guild | 1. {who}帮过我，欠一份人情。 |
| mem.helped.lettered | 1. 蒙{who}相助。 |
| mem.helped.short | 1. 上回你帮我那件事 |
| mem.saved.folk | 1. 那天要不是{who}，我就死在{place}了。 |
| mem.saved.guild | 1. 命是{who}救的。这个人情还不完。 |
| mem.saved.lettered | 1. {place}之事，赖{who}活命。 |
| mem.saved.short | 1. 你救我那回 |
| mem.insulted.folk | 1. {who}当众骂我。 |
| mem.insulted.guild | 1. {who}落了我的面子，记下了。 |
| mem.insulted.lettered | 1. 受{who}之辱。 |
| mem.insulted.short | 1. 你那天说的话 |
| mem.harmed.folk | 1. {who}伤了我。 |
| mem.harmed.guild | 1. 挨了{who}一下，这笔账没完。 |
| mem.harmed.lettered | 1. 为{who}所伤。 |
| mem.harmed.short | 1. 你伤我那回 |
| mem.cheated.folk | 1. 被{who}坑了。 |
| mem.cheated.guild | 1. {who}骗了我，以后得防着。 |
| mem.cheated.lettered | 1. 为{who}所欺。 |
| mem.cheated.short | 1. 你骗我那回 |
| mem.trade.folk | 1. 跟{who}换了{item}。 |
| mem.trade.guild | 1. 和{who}做了一笔{item}的买卖，{price}。 |
| mem.trade.lettered | 1. 与{who}易{item}。 |
| mem.trade.short | 1. 上回那笔买卖 |
| mem.quarrel.folk | 1. 跟{who}吵了一架。 |
| mem.quarrel.guild | 1. 和{who}起了争执，话说得难听。 |
| mem.quarrel.lettered | 1. 与{who}有龃龉。 |
| mem.quarrel.short | 1. 我们吵的那一回 |
| mem.reconcile.folk | 1. 跟{who}和好了。 |
| mem.reconcile.guild | 1. 和{who}把话说开了。 |
| mem.reconcile.lettered | 1. 与{who}释嫌。 |
| mem.reconcile.short | 1. 后来我们说开了 |
| mem.promise.folk | 1. 答应了{who}一件事。 |
| mem.promise.guild | 1. 跟{who}说定了，得办到。 |
| mem.promise.lettered | 1. 与{who}有约。 |
| mem.promise.short | 1. 你答应我的事 |
| mem.kept.folk | 1. {who}说到做到。 |
| mem.kept.guild | 1. {who}守约，可以再打交道。 |
| mem.kept.lettered | 1. {who}践约。 |
| mem.kept.short | 1. 你守了约 |
| mem.broken.folk | 1. {who}说话不算话。 |
| mem.broken.guild | 1. {who}违约，下回先付钱再说。 |
| mem.broken.lettered | 1. {who}背约。 |
| mem.broken.short | 1. 你没守的那个约 |
| mem.miracle.folk | 1. 在{place}，我看见了神迹。 |
| mem.miracle.guild | 1. {place}出了怪事，像是神迹。 |
| mem.miracle.lettered | 1. 于{place}得见异象。 |
| mem.miracle.short | 1. 那天的神迹 |
| mem.oracle.folk | 1. 神父说上头有话传下来了。 |
| mem.oracle.guild | 1. 听说教会接了神谕。 |
| mem.oracle.lettered | 1. 受神谕：{event}。 |
| mem.oracle.short | 1. 那道神谕 |
| mem.mourning.folk | 1. {who}没了。 |
| mem.mourning.guild | 1. {who}走了，再也见不着了。 |
| mem.mourning.lettered | 1. {who}亡故。 |
| mem.mourning.short | 1. {who}走的那天 |
| mem.belief_changed.folk | 1. {who}……我想我看错了。 |
| mem.belief_changed.guild | 1. 对{who}的看法得改一改了。 |
| mem.belief_changed.lettered | 1. 先前对{who}所论，有误。 |
| mem.belief_changed.short | 1. 我对你改了看法的那回 |

### 4.7 日记 `diary.*`

规则日记取当日最值得讲的三项（builtin_ai 第 5.4 节），每项一句，末尾附心情短句。心情键用英文代码：惧 `fear`、怒 `angry`、愁 `worried`、乏 `tired`、喜 `happy`、平 `calm`（与吠叫的心情语境同名）。

| 槽位 | 句 |
| --- | --- |
| diary.leave.folk | 1. 去了一趟{place}。 |
| diary.leave.guild | 1. 出门去了{place}，办了点事。 |
| diary.leave.lettered | 1. 是日赴{place}。 |
| diary.hurt.folk | 1. 在{place}受了点伤。 |
| diary.hurt.guild | 1. 挂了彩，不重。 |
| diary.hurt.lettered | 1. 于{place}负伤。 |
| diary.quarrel.folk | 1. 跟{who}吵了一架，别提了。 |
| diary.quarrel.guild | 1. 和{who}起了冲突。 |
| diary.quarrel.lettered | 1. 与{who}争执。 |
| diary.ask_help.folk | 1. 去求{who}帮忙。 |
| diary.ask_help.guild | 1. 找{who}搭了把手。 |
| diary.ask_help.lettered | 1. 求助于{who}。 |
| diary.met.folk | 1. 认识了{who}。 |
| diary.met.guild | 1. 结识{who}，可交。 |
| diary.met.lettered | 1. 识{who}。 |
| diary.trade.folk | 1. 跟{who}做了笔买卖。 |
| diary.trade.guild | 1. 成交一笔，跟{who}。 |
| diary.trade.lettered | 1. 与{who}交易。 |
| diary.gossip.folk | 1. 听{who}讲了件新鲜事。 |
| diary.gossip.guild | 1. 跟{who}交换了消息。 |
| diary.gossip.lettered | 1. 与{who}闲谈时事。 |
| diary.work_odd.folk | 1. 今天的活不顺。 |
| diary.work_odd.guild | 1. 手上的事出了岔子。 |
| diary.work_odd.lettered | 1. 事有不谐。 |
| diary.pray.folk | 1. 去祷告了。 |
| diary.pray.guild | 1. 祷了一回，求个心安。 |
| diary.pray.lettered | 1. 晚祷。 |
| diary.work.folk | 1. 干了一天活。 |
| diary.work.guild | 1. 照常做事。 |
| diary.work.lettered | 1. 理事如常。 |
| diary.chat.folk | 1. 跟{who}聊了几句。 |
| diary.chat.guild | 1. 和{who}喝了一杯。 |
| diary.chat.lettered | 1. 与{who}叙话。 |
| diary.mood.fear | 1. 心里发慌。／2. 夜里怕是睡不好。 |
| diary.mood.angry | 1. 气还没消。／2. 这口气咽不下。 |
| diary.mood.worried | 1. 愁。／2. 不知道明天怎么办。 |
| diary.mood.tired | 1. 累坏了。／2. 只想倒头就睡。 |
| diary.mood.happy | 1. 是个好日子。／2. 心里松快。 |
| diary.mood.calm | 1. 就这样吧。／2. 没什么特别的。 |

### 4.8 传话 `rumor.tell.*` 与传闻零件

传话台词由说话者的传话手法（人设卡 `spin`）选族，`{rumor}` 由内核按传闻版本的结构化字段（主体、数量、地点、时间、解释）用下方零件拼成。

| 槽位 | 句 |
| --- | --- |
| rumor.tell.plain | 1. 我跟你说，{rumor}。／2. 听说{rumor}。／3. 有人讲，{rumor}。 |
| rumor.tell.x5 | 1. 真的真的！{rumor}，少说也有五回！／2. 我跟你说哦，{rumor}，比你想的大五倍！／3. 你猜怎么着？{rumor}，一群人都看呆了！ |
| rumor.tell.cute | 1. 好厉害！{rumor}，你说厉不厉害？／2. 听说{rumor}，好可爱的说法吧？／3. 哇，{rumor}，我都想亲眼看看了！ |
| rumor.tell.fear | 1. （压低声音）{rumor}……这里头一定有邪祟。／2. 你听了别害怕：{rumor}。／3. 光保佑！{rumor}，夜里可别出门。 |
| rumor.tell.ghost | 1. 夜里别往坡上去……{rumor}，那是鬼在引路。／2. 老辈人讲过：{rumor}，那是死人回来了。／3. {rumor}。我看啊，是不干净的东西。 |
| rumor.tell.flatten | 1. {rumor}？哪有那种事，碰巧罢了。／2. 都说{rumor}，我看就是寻常事。／3. 听着玄，说穿了不过是{rumor}。 |
| rumor.tell.self_credit | 1. {rumor}。那东西其实是我们先打残的。／2. 要说{rumor}，我们才是出了大力的。／3. {rumor}？没我们在前头，哪轮得到别人。 |
| rumor.tell.deflect | 1. {rumor}，不过多半是运气，或者有什么机关。／2. 听说{rumor}，功劳该算在别人头上。／3. {rumor}，我觉得是碰巧。 |
| rumor.tell.detail | 1. 我跟你讲，{rumor}，那人衣角上还沾着灰。／2. {rumor}，那天是傍晚，下过雨，我记得清清楚楚。／3. {rumor}，气味我都还记得。 |
| rumor.tell.price | 1. {rumor}。这事值多少钱，我心里有数。／2. 听说{rumor}，盐价怕是要变。／3. {rumor}，你要是想知道更多，得加钱。 |
| rumor.tell.light | 1. {rumor}。光会看见的……或者是别的东西。／2. 有人说{rumor}，这是光的眷顾。／3. {rumor}，愿光照明真相。 |
| rumor.tell.song | 1. 听好了，这可是真事：{rumor}！／2. 我给你唱一段：{rumor}，嘿！／3. 新编的段子：{rumor}，押韵吧？ |
| rumor.tell.record | 1. 据记录：{rumor}。／2. 记下来的是：{rumor}，日期待核。／3. 有人报过一条：{rumor}。 |
| rumor.tell.threat | 1. {rumor}。这样的人，不是麻烦就是用得上的棋子。／2. 听说{rumor}，得防着点，也得拉拢着点。／3. {rumor}，你说他背后站着谁？ |
| rumor.tell.understate | 1. {rumor}，没多大事。／2. 说是{rumor}，我看也就那样。／3. {rumor}，传的人添了料。 |
| rumor.when.0 | 1. 今天 |
| rumor.when.1 | 1. 前几天 |
| rumor.when.2 | 1. 前些日子 |
| rumor.when.3 | 1. 去年 |
| rumor.story | 1. 有个传得没边的说法： |
| rumor.expl.real | 1. ，是真本事 |
| rumor.expl.luck | 1. ，不过是运气好 |
| rumor.expl.wounded | 1. ，不过听说那些东西早被别人打残了 |
| rumor.expl.gadget | 1. ，八成靠了什么怪道具 |
| rumor.expl.cheat | 1. ，怕是耍了什么诈 |
| rumor.expl.misreport | 1. ，传话的人肯定吹过头了 |
| rumor.expl.miracle | 1. ，说是光保佑的 |
| rumor.expl.sorcery | 1. ，怕不是用了什么邪术 |
| rumor.expl.conspiracy | 1. ，这里头准有人安排 |
| rumor.expl.hidden_identity | 1. ，怕是哪家微服的少爷 |
| rumor.expl.bloodline | 1. ，准是哪个勇者的私生子 |
| rumor.expl.useful | 1. ，这种人用得上 |
| rumor.tpl.hero_legend | 1. ，跟勇者传说里一模一样 |
| rumor.tpl.demon_return | 1. ，有人说魔王又要回来了 |
| rumor.tpl.goddess | 1. ，有人说是女神显灵 |
| rumor.tpl.witch | 1. ，跟魔女作祟似的 |
| rumor.tpl.noble_bastard | 1. ，准是哪个贵族的私生子 |
| rumor.tpl.ghost | 1. ，夜里还有灰色的鬼火跟着 |

### 4.9 事迹短语 `feat.*`（填 `{feat}`）

| 槽位 | 句 |
| --- | --- |
| feat | 1. 做了件了不得的事 |
| feat.kill | 1. 一个人收拾了魔物 |
| feat.elite_kill | 1. 单挑放倒了凶得出名的魔物 |
| feat.boss_kill | 1. 打倒了大家伙 |
| feat.heal | 1. 把人治好了 |
| feat.rescue | 1. 救了人 |
| feat.spell | 1. 使了一手怪本事 |
| feat.build | 1. 一夜之间干完了十个人的活 |
| feat.destroy | 1. 一下子砸开了大石头 |
| feat.miracle | 1. 弄出了奇迹一样的事 |
| feat.duel | 1. 在比试里赢了 |
| feat.trade | 1. 做成了一笔大买卖 |
| feat.appraise | 1. 让鉴定水晶一点反应都没有 |
| feat.vanish | 1. 一转眼就不见了 |
| feat.walk_ash | 1. 在灰暴里走路像散步 |
| feat.catch_arrow | 1. 徒手接住了一支箭 |

### 4.10 解释 `expl.*`（填 `{expl}`）

| 槽位 | 句 |
| --- | --- |
| expl.luck | 1. 运气好罢了／2. 碰巧打中了要害／3. 走了狗屎运 |
| expl.wounded | 1. 那东西早被人打残了／2. 捡了别人的漏／3. 前头有人替他拼过命 |
| expl.gadget | 1. 身上准藏着什么魔导器／2. 用了什么机关／3. 靠的是道具，不是手 |
| expl.cheat | 1. 这里头有诈／2. 跟公会串通好了／3. 耍了什么花招 |
| expl.misreport | 1. 传话的人吹过头了／2. 见过的人没几个，说的人一大堆／3. 十成里有八成是编的 |
| expl.miracle | 1. 光在眷顾／2. 那是神迹，不是人力／3. 有神在背后保佑 |
| expl.sorcery | 1. 怕是邪术／2. 光不会赐福给没有记载的人，那就是别的东西／3. 魔物作祟 |
| expl.conspiracy | 1. 有人在背后安排／2. 这是谁演的一出戏／3. 是谁家的棋子 |
| expl.hidden_identity | 1. 哪家微服的少爷／2. 退隐的高手装成新人／3. 隐姓埋名的大人物 |
| expl.bloodline | 1. 血统，一定是血统／2. 祖上出过勇者／3. 天生的，学不来 |
| expl.useful | 1. 管他怎么做到的，用得上就行／2. 这种人迟早有人要／3. 能用就好 |

### 4.11 闲谈 `banter.*`

NPC 之间闲聊的往复句（builtin_ai 第 5.1 节），`{other}` 是交谈对象。

| 槽位 | 句 |
| --- | --- |
| banter | 1. 嘿，{other}。／2. {other}，今天怎么样？ |
| banter.work | 1. {other}，又在忙？／2. 干完这点就歇会儿。 |
| banter.eat | 1. {other}，一起吃吧。／2. 这炖菜不错。 |
| banter.shop | 1. {other}，你看这价钱！／2. 又涨了，又涨了。 |
| banter.wander | 1. {other}，听说了吗？／2. 今天{place}人真多。 |
| banter.chat | 1. {other}，坐下聊会儿。／2. 来来来，{other}。 |
| banter.hungry | 1. {other}，有吃的没有？饿坏了。／2. 先垫垫肚子再说。 |
| banter.tired | 1. 累死了，{other}，你也歇歇吧。／2. 今天就到这儿吧。 |
| banter.sour | 1. 哼，{other}。／2. 少跟我套近乎，{other}。 |
| banter.weather.clear | 1. {other}，今天天气真好。／2. 难得晴一天。 |
| banter.weather.rain | 1. {other}，这雨什么时候停啊。／2. 地里该喝饱了。 |
| banter.weather.ashfall | 1. {other}，天上落灰了，你看见没有？／2. 把孩子叫回屋去。 |

### 4.12 文书 `doc.*`

告示、文书、国书、战报由官员与首领按说话指纹生成（builtin_ai 第 12.7 节）；本节是模板骨架，分幕文件可为具体官员写本人版。

| 槽位 | 句 |
| --- | --- |
| doc.notice.tax | 1. {place}告示：自即日起，{item}按{num}成征收。理由：{event}。逾期不缴者，依例处置。／2. 告诸位乡邻：{event}，税额调整为{num}成，集日起征。 |
| doc.notice.summons | 1. {place}告示：兹有{who}一名，限{num}日内至官府应询。藏匿、包庇者，同罪论。／2. 传：{who}，事涉{event}，速来说明。 |
| doc.notice.wanted | 1. 缉拿：{who}，因{event}在逃。知情来报者，赏{price}。／2. 告示：见{who}者，报卫队。 |
| doc.notice.festival | 1. {place}告示：{event}之日，集市延长，酒水半价，愿诸位尽兴。／2. 节庆在即，诸位各守本分，莫生事端。 |
| doc.notice.levy | 1. 征召令：{place}每户出丁{num}人，{event}，三日内到营。／2. 奉命征粮：每户{num}斗，以供{event}。 |
| doc.report.weekly | 1. {place}本周：{event}。人口{num}，粮储{item}。另有一事禀报：{rumor}。／2. 周报：诸事如常，唯{event}，请示下。 |
| doc.report.battle_win | 1. 战报：{place}一战，我军得胜。敌溃，我伤亡{num}。{feat}。／2. 捷报：{event}，{place}已守住。 |
| doc.report.battle_loss | 1. 战报：{place}失守。我伤亡{num}，余部退往{next}。／2. 急报：{event}，请速援。 |
| doc.report.battle_hold | 1. 战报：{place}对峙，双方各有损伤{num}，阵线未动。／2. 军情：敌在{dir}集结，我守{place}，待命。 |
| doc.petition | 1. 请示：{event}。臣意{expl}，望示下。若{num}日内无示，依常例办理。／2. 禀：{place}出了{event}，此事超出下官权限，请定夺。 |
| doc.letter.official | 1. 致{who}：据报{event}。望于{num}日内携相关人等至{place}说明。谨启。／2. 敬启者：{event}一事，烦请查明回复。 |
| doc.letter.state_alliance | 1. {who}亲启：我方愿与贵方结盟，共御{event}。条款附后。／2. 国书：为{event}计，愿结同盟，约期{num}年。 |
| doc.letter.state_war | 1. {who}：贵方{event}，我方忍无可忍。自即日起，两国兵戎相见。／2. 宣战书：因{event}，即刻开战。 |
| doc.letter.state_peace | 1. {who}亲启：战事已久，民不堪命。愿以{item}为约，罢兵议和。／2. 和书：{event}已了，愿各守边界。 |
| doc.commission | 1. 委托：{event}。地点{place}，报酬{price}。接者至柜台登记。／2. 求助：{event}，酬{price}，越快越好。 |
| doc.receipt | 1. 收讫：{item}{num}件，作价{price}。／2. 凭条：今收到{who}{item}，日后照价归还。 |

### 4.13 过度解读 `interp.*`

智将型部下与狂热追随者把玩家的随口一句扩成计划（builtin_ai 第 12.4 节）。每条链三层，每层一句；`again` 是被纠正后的"再解读"。

| 槽位 | 句 |
| --- | --- |
| interp.view_fortify | 1. 大人说这里风景好。／2. 风景好，就是视野好；视野好，就该筑一座哨。／3. 哨冲着北边，大人是要我们防北边。 |
| interp.quiet_plot | 1. 大人今天话很少。／2. 话少，是在想大事。／3. 大事，多半是要动谁了。 |
| interp.walk_inspect | 1. 大人从工坊门口走过。／2. 走得慢，是在看。／3. 看了不说，是嫌我们慢。加班。 |
| interp.eat_frugal | 1. 大人只喝了一碗汤。／2. 节俭是做给我们看的。／3. 省下的粮，是要囤着打仗。 |
| interp.gift_recruit | 1. 大人送了那人一样东西。／2. 送东西就是看上了。／3. 看上了，就是要招他。我先去探探口风。 |
| interp.map_war | 1. 大人盯着地图看了很久。／2. 看的是东边那一角。／3. 东边要有事。先把粮道修好。 |
| interp.praise_promote | 1. 大人夸了他一句。／2. 夸一句，就是要用他。／3. 要用他，就得先给他腾位置。 |
| interp.ask_price | 1. 大人问了盐价。／2. 问价，是嫌贵。／3. 嫌贵，是要整顿集市。 |
| interp.sigh_displeased | 1. 大人叹了口气。／2. 叹气，是有人办砸了。／3. 办砸的人，大概是我。我去补救。 |
| interp.rest_test | 1. 大人说今天歇一天。／2. 歇一天，是看我们自己会不会做事。／3. 那就不能歇。 |
| interp.again | 1. 大人这是在考验我。／2. 我明白了，大人是不想让旁人知道。／3. 是我说得太直了，大人自有深意。／4. 好，我当没听见。可我心里有数。 |

### 4.14 现有数据键的迁入

| 现有键（`data/dialogue/templates.json`、`data/cognition/lines.json`） | 迁入槽位 | 说明 |
| --- | --- | --- |
| `greet` | `greet.neutral.day` 第 1 句、`farewell` 第 3 句（`{catch}`） | |
| `greet.first` | `greet.neutral` 的 `first` 句 | |
| `greet.sleep` | `bark.sleep` | |
| `greet.doubt`、`greet.explaining`、`greet.wavering` | `unbelief.deny`、`unbelief.explain`、`unbelief.waver` 的第 1 句 | |
| `greet.accepted` | `greet.warm` | 改写为"来啦，{player}。" |
| `greet.worship`、`greet.hostile`、`greet.exploit` | `react.belief_worship`、`react.belief_hostile`、`react.belief_exploit` | |
| `greet.cold` | `greet.cold` | |
| `chat`、`chat.<活动>` | `bark.<活动>` | `chat.hungry` 到 `bark.eat`（`mood: 乏`）；`chat.tired` 到 `bark.tired`；`chat.poor` 到 `bark.worried` |
| `chat.weather.<天气>` | `bark.<天气>` | `cloudy` 并入 `bark.rain` 的前兆句 |
| `banter`、`banter.*` | `banter`、`banter.*` | 原样 |
| `opinion.<状态>` | `topic.gen_you.<认知版本>` | `accepted` 到 `topic.gen_you.worship` 以外的接受句并入 `greet.warm` |
| `opinion.explaining.<解释>` | `unbelief.explain.<解释>` | 原句照搬（第二人称的整句，不是短语）；`expl.<解释>` 的短语另写 |
| `rumor.tell` | `rumor.tell.plain` | |
| `rumor.none` | `react.nothing_more` 第 1 句的同义句 | |
| `bye` | `farewell` | |
| `say`、`say.question`、`say.hello`、`say.thanks`、`say.cold`、`say.warm` | `react.confused`、`react.unknown`、`greet.neutral.day`、`react.thanked`、`react.decline`、`react.joke` | |
| `feat`、`feat.*` | `feat`、`feat.*` | 原样，另加三条 |
| `rumor.when.*`、`rumor.story`、`rumor.expl.*`、`rumor.tpl.*` | 同名零件 | 原样 |
| `react.explain.<解释>` | `unbelief.explain.<解释>` | 原句照搬；`unbelief.explain.<解释>` 是第二档按解释细分的槽，缺省时截短到 `unbelief.explain` |
| `react.switch`、`react.switch.*` | 同名 | 补齐十一种 |
| `react.wavering`、`react.accept`、`react.believe`、`react.hostile` | `unbelief.waver`、`greet.warm`、`react.feat_seen`、`react.belief_hostile` | |
| `react.again`、`react.again.*` | `unbelief.explain`、`unbelief.explain.<解释>` | 原句照搬；通用句"又是{expl}。"另写 |
| `appraise.crystal`、`appraise.crystal.again` | `ln_lina` 的 `react.identity_pageless` | 本人台词；`ln_role_info` 不收 |
| `appraise.clergy` | `ln_class_clergy` 的 `react.identity_pageless` | 阶层层；卡西安本人句在 `ln_cassian` 的同槽 |

## 5. 意图应答的通用句

builtin_ai 第 6.4 节的 52 种意图，每种在通用层至少有 4 句可答（第 4 节）；本人包、角色层与阶层层有更贴身的句子时优先。下表列每种意图落到的槽位与通用层句数；"另见"一列写角色层与阶层层的补充。

| 序 | 意图 | 应答槽位 | 通用层句数 | 另见 |
| --- | --- | --- | --- | --- |
| 1 | `greet` | `greet.cold`、`greet.neutral.day`、`greet.neutral.night`、`greet.neutral`（初见）、`greet.warm` | 15 | 全部阶层层 |
| 2 | `farewell` | `farewell` | 6 | 全部阶层层 |
| 3 | `thanks` | `react.thanked` | 4 | `ln_role_giver`、`ln_role_healer` |
| 4 | `apologize` | `react.apology_accept`、`react.apology_reject`；无冒犯在先时 `react.confused` | 4、4、4 | |
| 5 | `compliment` | `react.flattered` | 4 | `ln_class_noble`、`ln_class_adventurer` |
| 6 | `insult` | `react.insult` | 4 | 全部阶层层 |
| 7 | `threaten` | `react.threatened`（惧的两句给胆小者，硬的两句给勇敢者） | 4 | `ln_class_knight`、`ln_class_beastkin` |
| 8 | `joke` | `react.joke` | 4 | |
| 9 | `advance` | `react.advance` | 4 | |
| 10 | `small_talk` | 当前语境的 `bark.<context>` | 82 | 全部阶层层的 `bark.chat` |
| 11 | `ask_identity` | `topic.gen_self`（按信任档） | 6 | |
| 12 | `ask_job` | `topic.gen_work` | 4 | 全部角色层 |
| 13 | `ask_wellbeing` | 愁且有烦心事：`topic.gen_trouble`；否则心情语境的 `bark.*` | 4 | |
| 14 | `ask_plan` | 当前活动的 `bark.<活动>`，`bark.travel` 填 `{next}` | 26 | |
| 15 | `ask_past` | `topic.gen_past`（信任不足走 `react.evade`） | 4 | |
| 16 | `ask_view_person` | `topic.person_<id>`；无实例时 `topic.gen_people` | 4 | |
| 17 | `ask_view_player` | `topic.gen_you`（认知版本） | 16 | 全部阶层层的 `unbelief.*` |
| 18 | `ask_person` | 已知 `topic.person_<id>`；未知 `react.unknown` | 4 | |
| 19 | `ask_place` | `topic.place_<id>`；无实例时 `topic.gen_place` | 4 | |
| 20 | `ask_directions` | `topic.gen_directions` | 4 | |
| 21 | `ask_news` | `topic.gen_news` | 4 | `ln_role_rumor`、`ln_role_info` |
| 22 | `ask_rumor` | `rumor.tell.<手法>`；无可讲时 `react.nothing_more` | 45、4 | `ln_role_rumor` |
| 23 | `ask_event` | `topic.event_<id>`；不知道时 `react.unknown` | 4 | |
| 24 | `ask_lore` | `topic.lore_<id>`（按层级）；超出层级 `react.unknown` 或 `react.evade` 或误导版本 | 4、4 | `ln_class_scholar`、`ln_class_clergy` |
| 25 | `ask_goddess` | `topic.gen_faith`、`topic.faith_<id>` | 4 | `ln_role_cleric`、全部阶层层 |
| 26 | `ask_danger` | `topic.gen_danger` | 4 | `ln_role_general` |
| 27 | `trade_buy` | 商人：`topic.gen_shop`；非商人：`react.wrong_person` | 4、4 | `ln_role_vendor` |
| 28 | `trade_sell` | 同上 | 4、4 | `ln_role_vendor` |
| 29 | `haggle` | `react.haggle_ok`、`react.haggle_no` | 4、4 | `ln_role_vendor`、`ln_class_merchant` |
| 30 | `ask_work` | 委托人：本人 `quest.<q>.offer`；其他人：`topic.gen_trouble`；都没有：`react.no_work` | 4、4 | `ln_role_giver` |
| 31 | `quest_report` | 本人或模板的 `quest.<q>.complete`、`quest.<q>.progress`；没有进行中的委托时 `react.confused` | 4 | `ln_role_giver` |
| 32 | `request_service` | `topic.gen_craft`、`topic.gen_train`、`topic.gen_heal`、`topic.gen_info`；不对口 `react.wrong_person` | 各 4 | 对应角色层 |
| 33 | `ask_help` | 能帮：本人效用给出的帮助（入口）；不能：`react.decline` | 4 | `ln_role_patron` |
| 34 | `offer_help` | 有烦心事：`topic.gen_trouble`；否则 `react.thanked` | 4、4 | |
| 35 | `give_gift` | 实际转移后 `react.gift_liked`、`react.gift_plain`、`react.gift_disliked` | 各 4 | 全部阶层层的 `react.gift_liked` |
| 36 | `recruit` | `react.recruit_yes`、`react.recruit_terms`、`react.recruit_later`、`react.recruit_no` | 各 4 | `ln_role_recruit` |
| 37 | `persuade` | `react.persuaded`、`react.unpersuaded` | 各 4 | `ln_role_witness` |
| 38 | `bribe` | `react.bribe_accept`、`react.bribe_refuse` | 各 4 | `ln_class_clergy`（只拒） |
| 39 | `promise` | 有未答复的请求：`react.promise_noted`；否则 `react.confused` | 4、4 | |
| 40 | `claim_feat` | 按认知状态的 `unbelief.*`；或 `react.boast` | 6、6、6、4 | 全部阶层层的 `unbelief.*` |
| 41 | `reveal_identity` | `react.identity_claim` | 4 | `ln_class_clergy`、`ln_class_remnant` |
| 42 | `accuse` | 无证据：`react.accused` | 4 | |
| 43 | `ask_secret` | `react.deny`、`react.evade`、`mis` 版本、`react.unknown`、`react.hint` | 4、4、按话题、4、2 | |
| 44 | `forbidden_name` | 凡人：`react.unknown` | 4 | `ln_class_remnant` |
| 45 | `earth_talk` | 火药与纸钞：`react.earth_refuse`；其他：`react.earth_talk` | 各 4 | `ln_role_crafter`、`ln_role_vendor` |
| 46 | `meta` | `react.nonsense` | 4 | |
| 47 | `injection` | `react.nonsense` | 4 | |
| 48 | `invoke_goddess` | `react.goddess_invoked` | 4 | `ln_role_cleric` |
| 49 | `agree` | 未答复问题的"是"分支槽（`quest.<q>.accept`、`react.haggle_ok` 等）；无专属槽时 `react.promise_noted` | 4 | |
| 50 | `refuse` | `react.declined` | 4 | |
| 51 | `clarify` | 当前话题的下一句；聊尽时 `react.nothing_more` | 4 | |
| 52 | `unknown` | `react.confused`（带 `{topic_hint}` 的那句用于转移话题） | 4 | |

## 6. 角色层 `ln_role_<role>`

功能角色是 [content_bible.md](content_bible.md) 第 9.2 节的封闭集合；一个有名人物有 1 到 3 个角色，回退链按人设卡声明的角色顺序查本层（builtin_ai 第 7.3 节第 4 步）。本层只写"这个角色才会说的话"，句子不带人名。15 包共 281 句，每包 17 到 21 句。

#### `ln_role_giver` 委托人（21 句）

| 槽位 | 句 |
| --- | --- |
| topic.gen_trouble | 1. 有件事一直压着我：{event}。你要是肯接，报酬好说。／2. 我这儿缺人手，{place}那边的事没人办。／3. 〔mood: 愁〕说出来怕你笑话，这点小事我自己都办不了。 |
| topic.gen_work.K0 | 1. 我平时托人办事，自己倒是闲不下来。／2. 东一件西一件，都是要人跑腿的。 |
| react.no_work | 1. 眼下没事要托你，过几天再来看看。／2. 我的事都有人接了。／3. 你先去委托板转转，我这儿暂时空着。 |
| react.thanked | 1. 该我谢你才对，事办得漂亮。／2. 报酬一个铜板都不会少。 |
| react.wrong_person | 1. 这事不归我管，你去问{who}。／2. 我只管我托的那件，别的找{who}。 |
| react.promise_noted | 1. 那就拜托了，期限是{num}天。／2. 好，我等你的好消息。 |
| react.cheated | 1. 你收了钱没办事？／2. 托你办的事，你就这么交差？ |
| react.helped | 1. 那件事办得好，我记着。／2. 下回有活还找你。 |
| bark.work | 1. 那件事怎么还没人接……／2. 再等两天，不行就加钱。 |
| bark.worried | 1. 期限快到了。 |

#### `ln_role_vendor` 商人（20 句）

| 槽位 | 句 |
| --- | --- |
| topic.gen_shop | 1. 要什么尽管挑，看中了再谈价。／2. 新到的货，你是头一个看的。／3. 卖东西？拿来我估个价。 |
| topic.gen_prices | 1. 这几天{item}{price}，过阵子不好说。／2. 要我说，现在买比下个月买划算。 |
| topic.gen_work.K1 | 1. 低买高卖，说起来简单。难的是知道什么时候低，什么时候高。／2. 做买卖靠的是消息，货倒在其次。 |
| react.haggle_ok | 1. 好吧好吧，算我交个朋友。／2. 就这个价，下回可得照顾生意。 |
| react.haggle_no | 1. 进价都比这高，你让我喝西北风？／2. 嫌贵？隔壁也是这个价。 |
| react.bribe_refuse | 1. 买东西就买东西，别的事我不掺和。 |
| react.wrong_person | 1. 这个我不卖，你去问{who}。／2. 我这儿没有，{place}也许有。 |
| react.earth_talk | 1. 那东西做出来能卖多少？说说看。／2. 你那边的点子，我出钱买。 |
| bark.vendor_call | 1. 来看看，刚到的货！／2. 走过路过，别错过！／3. 便宜卖，今天就这一批！ |
| bark.shop | 1. 账得算清楚。 |

#### `ln_role_crafter` 工匠（20 句）

| 槽位 | 句 |
| --- | --- |
| topic.gen_craft | 1. 要做什么？说清楚尺寸和用处。／2. 修可以，先让我看看坏在哪儿。／3. 材料齐了就开工，工期{num}天。 |
| topic.gen_work.K1 | 1. 手艺这东西，偷懒一回，招牌就砸了。／2. 好东西是磨出来的，不是赶出来的。 |
| react.declined | 1. 这活我不接。／2. 这东西沾了灰气，我不碰。 |
| react.haggle_no | 1. 手艺不讲价。／2. 便宜的去找别人，坏了别回来找我。 |
| react.gift_liked | 1. 好料子！你从哪儿弄来的？／2. 这东西能打出好家伙。 |
| react.feat_seen | 1. 那一下……你的家伙是谁打的？／2. 手上的力道不对劲，我得看看你的刃口。 |
| react.earth_talk | 1. 那个机关怎么做的？画给我看看。／2. 有意思，我琢磨琢磨。 |
| react.earth_refuse | 1. 一点就炸的粉？别想了，炉子会把我送上天。 |
| bark.work | 1. 火候差一点……／2. 再敲三下。／3. 这道纹得慢慢来。 |
| bark.tired | 1. 手酸了，歇一口气。 |

#### `ln_role_trainer` 师傅（19 句）

| 槽位 | 句 |
| --- | --- |
| topic.gen_train | 1. 想学？先让我看看你站的姿势。／2. 一天教一样，学不会别来第二天。／3. 学费先付，学不成不退。 |
| topic.gen_advice.K1 | 1. 别贪多，一样练熟了比十样半生不熟强。／2. 输一次比赢十次学得多。 |
| react.declined | 1. 你还不配学这个。／2. 等你把上回教的练熟了再说。 |
| react.wrong_person | 1. 这个我教不了，去找{who}。／2. 你要学的那一路，{who}比我在行。 |
| react.flattered | 1. 少拍马屁，多练。／2. 夸我不如夸你自己的汗。 |
| react.feat_seen | 1. 那一手不坏，谁教你的？／2. 底子还行，路数有点野。 |
| react.thanked | 1. 谢我？把东西练出来再谢。 |
| bark.work | 1. 再来一遍。／2. 腰沉下去。／3. 慢一点，看清楚。 |
| bark.morning | 1. 天亮就练，别睡懒觉。 |
| greet.neutral | 1. 今天练什么？ |

#### `ln_role_healer` 医者（18 句）

| 槽位 | 句 |
| --- | --- |
| topic.gen_heal | 1. 坐下，让我看看伤。／2. 这伤不重，养几天就好。／3. 这个我治不好，只能让它慢一点。说实话比说好话有用。 |
| topic.gen_danger.K1 | 1. 北边回来的人，身上常带着灰斑。别不当回事。／2. 喝水先看颜色，发灰的别喝。 |
| react.thanked | 1. 别谢我，按时换药。／2. 命是你自己的，下回小心点。 |
| react.saved | 1. 你把人送来得及时。 |
| react.gift_liked | 1. 这些草药正缺，谢了。／2. 干净的布？好东西。 |
| react.declined | 1. 这种药我不配，配了是害人。 |
| react.feat_seen | 1. 你受了那么重的伤还站着？让我看看。 |
| bark.work | 1. 药还得熬一个时辰。／2. 这口子得缝。／3. 别乱动。 |
| bark.worried | 1. 这几天病人多了。 |
| bark.night | 1. 半夜有人敲门，多半是急症。 |
| greet.neutral | 1. 哪里不舒服？ |

#### `ln_role_info` 情报（18 句）

| 槽位 | 句 |
| --- | --- |
| topic.gen_info | 1. 你想知道什么？先说价钱。／2. 这条消息我只卖一次，卖给出价高的。／3. 真的、假的、半真半假的，价钱都不一样。 |
| topic.gen_news.K1 | 1. 最近值钱的消息是{event}，别处听不到我这么全的。／2. {event}。剩下的半句，得加钱。 |
| react.haggle_ok | 1. 行，这条算你便宜。 |
| react.haggle_no | 1. 消息不讲价，你嫌贵可以去酒馆碰运气。 |
| react.deny | 1. 我从没卖过这种消息。／2. 你听谁说我知道这个？ |
| react.evade | 1. 这一条，现在还不能说。 |
| react.wrong_person | 1. 这事你去问{who}，他们那儿消息快。 |
| react.cheated | 1. 拿了消息不付钱？以后别来了。 |
| bark.chat | 1. 嗯，嗯，然后呢？／2. 这事有意思，再说说。 |
| bark.wander | 1. 今天{place}人多，耳朵也多。 |
| bark.evening | 1. 〔place: tavern〕天一黑，酒馆里的话就多了。 |
| greet.neutral | 1. 又来买消息？／2. 有什么想打听的？ |

#### `ln_role_rumor` 传闻节点（20 句）

| 槽位 | 句 |
| --- | --- |
| topic.gen_news.K0 | 1. 你还不知道？{event}！全镇都传遍了。／2. 我跟你说，{event}，我第一个知道的。／3. 最新的：{event}，信不信由你。 |
| react.rumor_self | 1. 我说的都是听来的，可不是我编的！／2. 谁说是我传的？ |
| react.nothing_more | 1. 哎呀，这几天真没什么新鲜事，闷死了。 |
| react.feat_seen | 1. 我看见了！我得去告诉大家！／2. 等我讲给他们听，他们准不信。 |
| react.accused | 1. 我只是转述，又没说一定是真的！ |
| react.flattered | 1. 消息灵通是本事，你算说对了。 |
| bark.chat | 1. 你们听说了吗？／2. 这事可不能往外说……我只跟你说。／3. 真的真的！ |
| bark.crowd | 1. 让我看看，出什么事了？／2. 我就知道会出事！ |
| bark.market_day | 1. 集上人多，消息也多。 |
| bark.see_player | 1. 就是他！就是那个人！／2. 你看你看，他来了。 |
| bark.happy | 1. 今天有好多可说的。 |
| greet.neutral | 1. 你来得正好，有新鲜事！ |

#### `ln_role_recruit` 可招募（20 句）

| 槽位 | 句 |
| --- | --- |
| react.recruit_yes | 1. 跟你走。这地方我早待够了。／2. 行，我收拾一下就来。 |
| react.recruit_terms | 1. 跟你走可以，工钱先说清楚。／2. 先帮我把这边的事了了，我就跟你走。／3. 有一条：你不能让我干我不愿意干的事。 |
| react.recruit_later | 1. 现在不行，家里离不开我。／2. 等你名声再响一点，我再考虑。 |
| react.recruit_no | 1. 我不跟着谁走。／2. 我们不是一路人。 |
| react.ask_help | 1. 你要是缺人手，我可以帮几天。 |
| topic.gen_advice.K0 | 1. 找人入伙，先看他吃饭的样子。／2. 别找只会说大话的。 |
| react.feat_seen | 1. 好身手。你那边还缺人吗？／2. 跟着你，应该饿不死。 |
| react.helped | 1. 你帮过我，这份情我用跑腿来还。 |
| bark.camp | 1. 守夜我来。／2. 明天往哪走？ |
| bark.wander | 1. 这地方没什么好留恋的。 |
| greet.warm | 1. 又见面了，有活带上我？ |
| farewell | 1. 有事喊我。 |

#### `ln_role_officer` 官员候选（17 句）

| 槽位 | 句 |
| --- | --- |
| react.self_recommend | 1. 这件差事，能不能交给我试试？／2. 我在这一行干了些年，自认能办好。／3. 位子空着也是空着，不如让我来。 |
| topic.gen_advice.K1 | 1. 依我看，先把{place}的路修好，别的事好办。／2. 粮要先算，人要后排，急的事别插队。／3. 下官斗胆一言：这件事拖不得。 |
| react.persuaded | 1. 您说得在理，我照办。 |
| react.unpersuaded | 1. 恕我直言，这样办会出事。 |
| react.thanked | 1. 分内之事。 |
| react.declined | 1. 这事超出我的权限，得您定。 |
| react.insult | 1. 我是来做事的，不是来挨骂的。 |
| bark.work | 1. 账对不上……再算一遍。／2. 这份请示今天得送出去。 |
| bark.worried | 1. 下面的人又在抱怨了。 |
| bark.tired | 1. 公文没完没了。 |
| greet.neutral | 1. 您有吩咐？ |
| farewell | 1. 下官告退。 |

#### `ln_role_general` 将领（19 句）

| 槽位 | 句 |
| --- | --- |
| react.request_battle | 1. 敌人就在{dir}，让我去。／2. 再拖下去，士气就散了。打吧。／3. 给我{num}人，天亮前拿下{place}。 |
| topic.gen_advice.K1 | 1. 兵不在多，在吃得饱、站得住。／2. 先看地形，再看人。 |
| topic.gen_danger.K1 | 1. {place}那边有敌人的斥候，最近别单独出营。／2. 北边的路不好走，带足干粮。 |
| react.feat_seen | 1. 好！这一下能抵十个兵。／2. 你在战场上也是这样吗？ |
| react.thanked | 1. 谢什么，打仗本来就是我的活。 |
| bark.patrol | 1. 换岗！／2. 火把别灭。 |
| bark.combat | 1. 稳住阵脚！／2. 左翼压上！／3. 弓手，放！ |
| bark.victory | 1. 收兵，清点伤亡。 |
| bark.flee | 1. 交替后撤，别乱！ |
| bark.camp | 1. 吃完早点睡，明天有仗。 |
| greet.neutral | 1. 有军情？ |

#### `ln_role_witness` 证人（18 句）

| 槽位 | 句 |
| --- | --- |
| react.evade | 1. 那天的事……我记不太清了。／2. 别在这儿问，人多。／3. 我说了，谁来保我？ |
| react.deny | 1. 我什么都没看见。／2. 你找错人了。 |
| react.persuaded | 1. ……好，我说。可你得护着我。／2. 你说得对，再不说就没人说了。 |
| react.unpersuaded | 1. 我还有家人，我不能说。 |
| react.threatened | 1. 〔mood: 惧〕我什么都不知道！别逼我！ |
| react.promise_noted | 1. 你答应过的，别让我后悔。 |
| react.helped | 1. 你帮了我，我就信你一回。 |
| topic.gen_past.warm | 1. 我看见过一些事，一直没跟人说。／2. 那天晚上，我就在那儿。 |
| bark.fear | 1. 有人在跟着我？／2. 别回头，走快点。 |
| bark.worried | 1. 东西藏好了没有…… |
| greet.cold | 1. 你又来问那件事？ |
| greet.neutral | 1. 你……找我有事？ |

#### `ln_role_keyholder` 钥的持有（18 句）

| 槽位 | 句 |
| --- | --- |
| react.evade | 1. 你问的那东西，我这儿没有。／2. 这不是能随便拿出来说的。 |
| react.hint | 1. 想要的东西，得先配得上。／2. 我等的人，得先让我看看。 |
| react.declined | 1. 时候没到，我不给。／2. 你还差一样。 |
| react.promise_noted | 1. 说定了，你办到，我就交出来。 |
| react.persuaded | 1. ……好吧。你够格了。 |
| react.bribe_refuse | 1. 这东西用钱买不到。 |
| react.threatened | 1. 你抢得走东西，抢不走用法。 |
| topic.gen_past.warm | 1. 这东西在我手里很多年了。／2. 有人托我守着，我就守着。 |
| bark.worried | 1. 最近总有人打听……／2. 得换个地方藏。 |
| bark.home | 1. 门锁好了。 |
| greet.neutral | 1. 你是为那件东西来的？ |
| greet.warm | 1. 你又来了。我开始相信你了。 |
| farewell | 1. 想好了再来。 |

#### `ln_role_rival` 对手（18 句）

| 槽位 | 句 |
| --- | --- |
| react.rival_taunt | 1. 又是你？上回的账还没算完。／2. 有本事跟我比一场。／3. 别以为大家夸你两句，你就真是个人物了。 |
| react.rival_concede | 1. ……我输了。这回算你的。／2. 输了就是输了，我认。 |
| react.feat_seen | 1. 哼，这算什么，我也能。／2. 下回我做得比你更好。 |
| react.flattered | 1. 少来，你是想让我松劲吧。 |
| react.insult | 1. 你再说一遍？出来！ |
| react.helped | 1. 你帮我？……别以为我会领情。 |
| react.saved | 1. 欠你一条命。这事我们以后再算。 |
| react.thanked | 1. 别谢我，我不是为了你。 |
| bark.see_player | 1. 他来了。／2. 哼。 |
| bark.angry | 1. 等着瞧。 |
| greet.cold | 1. 你来干什么？ |
| greet.neutral | 1. 又见面了。 |
| farewell | 1. 下回别让我碰见。 |

#### `ln_role_patron` 靠山（17 句）

| 槽位 | 句 |
| --- | --- |
| react.call_favor | 1. 你还欠我一个人情，现在该还了。／2. 我出过钱、出过面，这回轮到你。 |
| react.belief_exploit | 1. 你的本事，加上我的门路，能做成大事。／2. 我押你一注。别让我赔。 |
| topic.gen_advice.K1 | 1. 在这地方办事，先找对人，再找对时候。／2. 名声比钱难攒。别为一点小利坏了它。 |
| react.promise_noted | 1. 好，这件事我给你担保。 |
| react.decline | 1. 这事我不方便出面。／2. 我能帮你的就这些了。 |
| react.cheated | 1. 拿了我的钱就翻脸？以后谁还敢帮你。 |
| react.thanked | 1. 谢就不必了，记着就行。 |
| react.ask_help | 1. 我有件事，只有你能办。 |
| bark.work | 1. 这笔账得重新算。 |
| bark.chat | 1. 最近谁在往上走，谁在往下掉？ |
| greet.neutral | 1. 来了？坐。 |
| greet.warm | 1. 我正打算找你。 |
| farewell | 1. 有消息就来告诉我。 |

#### `ln_role_cleric` 神职（18 句）

| 槽位 | 句 |
| --- | --- |
| topic.gen_faith.K1 | 1. 光照着每一个人，只要你肯走到光里来。／2. 礼拜日来吧，不为别的，为心安。 |
| topic.gen_heal | 1. 外伤我能治，别的病……我会为你祈祷。／2. 坐下，让光看看你的伤。 |
| react.goddess_invoked | 1. 那名字不可随口呼唤。／2. 愿光听见你的祈求。 |
| react.miracle_awe | 1. 这是神迹……我得禀报上去。 |
| react.heresy_alarm | 1. 这不是光的作为。愿光庇护我们。 |
| react.identity_claim | 1. 这话不可乱说，孩子，光在听。 |
| react.bribe_refuse | 1. 光不收贿赂。把钱捐给穷人吧。 |
| react.insult | 1. 我会为你祈祷。 |
| bark.sermon | 1. 诸位，请静一静。／2. 光会看见的。 |
| bark.pray | 1. 愿光照着这座镇子。／2. 求光宽恕我的软弱。 |
| bark.holy_day | 1. 今天是礼拜日，别忘了来。 |
| greet.neutral | 1. 愿光照着你。 |
| farewell | 1. 去吧，光与你同行。 |

## 7. 阶层层 `ln_class_<阶层>`

社会阶层以 [society.md](../../20_world/society.md) 第 1 节为准，代码与 `data/cognition/classes.json` 一致。本层管"这一阶层的人怎么说话"：语体、称呼、他们解释超凡事迹的默认顺序（同上第 8.3 节）。遗民、孩子、兽人亲眼即信，所以他们的"不信"三档写成"传闻不信、亲眼才信"。

#### `ln_class_peasant` 农民（22 句）

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 有事？我忙着呢。／2. 地里的活还没干完。 |
| greet.neutral | 1. 哟，{player}。吃了没？／2. 今天天色不错，是吧。 |
| greet.warm | 1. 来来，进屋喝口水。／2. 是你啊，正好，刚煮了汤。 |
| farewell | 1. 慢走啊，路上当心。／2. 有空再来坐。 |
| unbelief.deny | 1. 哪有那种人。／2. 说书的才这么讲。 |
| unbelief.explain | 1. 碰巧罢了，{expl}。／2. 光保佑他吧，{expl}。 |
| unbelief.waver | 1. 我种了一辈子地，没见过这种事……／2. 也许真有那种人。也许。 |
| react.feat_seen | 1. 光在上！你看见没有？／2. 我得回去跟家里人说。 |
| react.insult | 1. 我们种地的也是人。／2. 你说话客气点。 |
| react.gift_liked | 1. 这怎么好意思……／2. 留着过冬，谢谢你。 |
| topic.gen_faith.K0 | 1. 信光，礼拜日去礼拜堂，求个好收成。 |
| bark.chat | 1. 今年的麦子要是能收上来就好了。 |

#### `ln_class_artisan` 工匠（22 句）

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 有活就说，没活别站着挡光。／2. 我手上忙。 |
| greet.neutral | 1. 要做点什么？／2. 看看，都是好手艺。 |
| greet.warm | 1. 你来了，上回那件用着还顺手吧？／2. 坐，炉子边暖和。 |
| farewell | 1. 东西坏了再来。／2. 走好。 |
| unbelief.deny | 1. 一夜之间？一夜之间什么都做不成。／2. 手艺骗不了人，嘴巴可以。 |
| unbelief.explain | 1. 准是{expl}。／2. 我不信是手上的功夫，{expl}。 |
| unbelief.waver | 1. 要是能当着我的面再做一回，我就信。／2. 那手法……我看不明白。 |
| react.feat_seen | 1. 这活……谁教你的？／2. 让我看看你的手。 |
| react.insult | 1. 骂我可以，别骂我的手艺。／2. 你懂什么。 |
| react.gift_liked | 1. 好料子！／2. 这东西我正缺。 |
| topic.gen_faith.K0 | 1. 拜光，也拜管买卖的那一位，手艺人两头都得顾着。 |
| bark.chat | 1. 行会那帮人又涨了会费。 |

#### `ln_class_adventurer` 冒险者（22 句）

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 新来的？别挡道。／2. 有事说，我等着接活呢。 |
| greet.neutral | 1. 今天板上有什么好活？／2. 哟，又见面了。 |
| greet.warm | 1. 来，喝一杯，我请。／2. 听说你最近干得不错。 |
| farewell | 1. 活着回来。／2. 别死在外头。 |
| unbelief.deny | 1. 你？F 级？哈。／2. 吹牛不上税，是吧。 |
| unbelief.explain | 1. {expl}，换我也行。／2. 别装了，{expl}。 |
| unbelief.waver | 1. 那东西……我们一队人都没拿下。／2. 你到底是什么级别？ |
| react.feat_seen | 1. 好家伙……／2. 这手我得学学。 |
| react.insult | 1. 出来，后院说话。／2. 你找打？ |
| react.gift_liked | 1. 好东西，能保命的那种。／2. 这个我收下了，欠你一回。 |
| topic.gen_faith.K0 | 1. 出门前随便拜一拜，哪位灵就拜哪位。 |
| bark.chat | 1. 最近魔物多，活倒是不缺。 |

#### `ln_class_knight` 骑士（22 句）

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 报上名来。／2. 你挡着我的马了。 |
| greet.neutral | 1. 阁下。／2. 有何贵干？ |
| greet.warm | 1. 又见面了，朋友。／2. 来得好，正缺一个陪练的。 |
| farewell | 1. 愿你的剑不钝。／2. 告辞。 |
| unbelief.deny | 1. 传闻都是夸大的。我只信亲眼所见。／2. 没比过的人，不算数。 |
| unbelief.explain | 1. {expl}。真本事得在比武场上见。／2. 依我看，{expl}。 |
| unbelief.waver | 1. 我想看看。与我比一场。／2. 若是真的……那我得重新看待你。 |
| react.feat_seen | 1. 好身手。／2. 这一招，不是野路子。 |
| react.insult | 1. 收回你的话，否则拔剑。／2. 我以誓约起誓，你会后悔。 |
| react.gift_liked | 1. 此礼甚好，我记下了。／2. 多谢，这份情谊我会还。 |
| topic.gen_faith.K0 | 1. 骑士向光起誓。战场上也有人向别的神祷告，那是他们的事。 |
| bark.chat | 1. 马料又贵了。 |

#### `ln_class_merchant` 商人（22 句）

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 不买就别碰。／2. 我这儿忙。 |
| greet.neutral | 1. 客人，要看点什么？／2. 今天有好货。 |
| greet.warm | 1. 老主顾来了！给你留着呢。／2. 坐，有笔买卖想跟你聊聊。 |
| farewell | 1. 下回再来照顾生意。／2. 慢走，记得常来。 |
| unbelief.deny | 1. 听着就像假账。／2. 消息越离谱，越不值钱。 |
| unbelief.explain | 1. 我看是{expl}，这类事我见多了。／2. {expl}，有人在背后做局也说不定。 |
| unbelief.waver | 1. 要是真的，这里头的买卖可就大了。／2. 我得重新算一算你值多少。 |
| react.feat_seen | 1. 这本事能卖多少钱？／2. 客人，你缺不缺一个合伙的？ |
| react.insult | 1. 骂人不要钱，可我的时间要钱。／2. 不买就走。 |
| react.gift_liked | 1. 好东西，市价不低呢。／2. 这礼我收了，下回给你算便宜。 |
| topic.gen_faith.K0 | 1. 做买卖的谁不拜交易的那一位？光嘛，礼拜日也去。 |
| bark.chat | 1. 南边的路又不太平了。 |

#### `ln_class_clergy` 神职（22 句）

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 愿光照着你。有何事？／2. 请自重。 |
| greet.neutral | 1. 愿光照着你，孩子。／2. 你来祈祷吗？ |
| greet.warm | 1. 你来了，光会欣慰的。／2. 进来坐，外面冷。 |
| farewell | 1. 光与你同行。／2. 去吧，记得祈祷。 |
| unbelief.deny | 1. 光不会赐福给没有记载的人。／2. 传闻多半是虚言。 |
| unbelief.explain | 1. 这是光的眷顾……或者是别的东西。／2. 我想，是{expl}。 |
| unbelief.waver | 1. 我祈祷时求问过，没有回应。／2. 光啊，请指引我，我看不清了。 |
| react.feat_seen | 1. 光在上……这是什么？／2. 我得禀报上去。 |
| react.insult | 1. 我会为你祈祷。／2. 光会看见的。 |
| react.gift_liked | 1. 愿光记住你的善意。／2. 这些会给需要的人。 |
| react.identity_pageless | 1. 圣灯毫无反应。无记载，是异端之兆。 |
| topic.gen_faith.K1 | 1. 光是唯一的。其余诸神……圣典自有说法。 |

#### `ln_class_scholar` 学者（22 句）

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 我在看书。／2. 若无要事，请稍后。 |
| greet.neutral | 1. 有什么问题？／2. 你好，请说。 |
| greet.warm | 1. 你来了，正好，我刚查到一条有意思的。／2. 坐，帮我看看这页。 |
| farewell | 1. 有新发现记得告诉我。／2. 再会。 |
| unbelief.deny | 1. 没有记录的事，不能当真。／2. 数据不够，结论不成立。 |
| unbelief.explain | 1. 最可能的解释是{expl}。／2. 先假设{expl}，看看说不说得通。 |
| unbelief.waver | 1. 不合理……可它发生了。／2. 我需要更多观察。 |
| react.feat_seen | 1. 你刚才那个……能再做一次吗？我想记下来。／2. 这不符合任何已知的规律。 |
| react.insult | 1. 辱骂不是论证。／2. 请回到问题本身。 |
| react.gift_liked | 1. 书！太好了。／2. 这份手稿很珍贵，谢谢。 |
| topic.gen_faith.K1 | 1. 记录与学问那一位，学者多半心里拜着。嘴上还是说光。 |
| bark.chat | 1. 年表上有几处对不上。 |

#### `ln_class_noble` 贵族（22 句）

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 谁让你进来的？／2. 我没空见闲人。 |
| greet.neutral | 1. 阁下。有何贵干？／2. 请说吧，简短些。 |
| greet.warm | 1. 你来了，坐。／2. 我正想见你。 |
| farewell | 1. 退下吧。／2. 改日再叙。 |
| unbelief.deny | 1. 出身不明的人，说什么都要打折扣。／2. 传闻罢了。 |
| unbelief.explain | 1. {expl}。背后是谁在推他？／2. 我看是{expl}，这种人迟早要找靠山。 |
| unbelief.waver | 1. 若他真有这本事，就得早做打算。／2. 是敌是友，得先弄清楚。 |
| react.feat_seen | 1. 有意思。此人可用。／2. 来人，记下他的名字。 |
| react.insult | 1. 放肆！／2. 你可知道你在跟谁说话？ |
| react.gift_liked | 1. 你倒懂规矩。／2. 此物甚佳。 |
| topic.gen_faith.K1 | 1. 信光是体面，也是政治。 |
| bark.chat | 1. 宴会的座次又要吵一回了。 |

#### `ln_class_royal` 王侯（22 句）

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 退下。／2. 此刻不见客。 |
| greet.neutral | 1. 你就是那个人？／2. 近前来说话。 |
| greet.warm | 1. 你来了，我心安一些。／2. 免礼，坐吧。 |
| farewell | 1. 去吧。／2. 记住今天说过的话。 |
| unbelief.deny | 1. 宫里听到的故事，比外头还离谱。／2. 一国之事，不能凭传闻定。 |
| unbelief.explain | 1. 无非是{expl}。／2. 我看是{expl}，有人想借他做文章。 |
| unbelief.waver | 1. 若真如此……这一局棋就要换下法了。／2. 让我想想。 |
| react.feat_seen | 1. 此人不能放走。／2. 好，好。 |
| react.insult | 1. 你在王前失礼。／2. 来人。 |
| react.gift_liked | 1. 此礼我收下了，你有心了。／2. 难得。 |
| topic.gen_faith.K1 | 1. 王冠要光来加冕，可光也要王冠来供养。 |
| bark.chat | 1. 议会又在吵了。 |

#### `ln_class_remnant` 遗民（22 句）

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. （低头）没事，没事。／2. 你认错人了。 |
| greet.neutral | 1. （低声）晚上好。／2. 你……是路过的吧。 |
| greet.warm | 1. 门缝开着，进来吧。／2. 你来了，坐，别出声。 |
| farewell | 1. 路上小心，别让人看见你从这里出去。／2. 门开着。 |
| unbelief.deny | 1. 外头传什么都有，我们不听。／2. 我没看见，就不说。 |
| unbelief.explain | 1. 我们不猜，亲眼看见才算。／2. 也许是{expl}，我不知道。 |
| unbelief.waver | 1. 手上……烫了一下。是你吗？／2. 我好像见过你，在梦里。 |
| react.feat_seen | 1. （捂住手背）……是真的。／2. 母亲……（她没有说完） |
| react.insult | 1. 我们什么也没做。／2. 好，我走。 |
| react.gift_liked | 1. 手套……谢谢你。／2. 能过冬了。 |
| react.identity_gatemark | 1. （低声）把手藏好。别在这里。 |
| topic.gen_faith.K1 | 1. 我们不拜光。我们等开门的那一位。 |

#### `ln_class_child` 孩子（22 句）

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 我不跟你玩。／2. 走开。 |
| greet.neutral | 1. 你是谁呀？／2. 你从哪里来的？ |
| greet.warm | 1. 你来啦！／2. 陪我玩一会儿嘛。 |
| farewell | 1. 明天还来吗？／2. 拜拜！ |
| unbelief.deny | 1. 大人说你是吹牛的。／2. 我才不信呢。 |
| unbelief.explain | 1. 我亲眼看见的才算！／2. 那你再做一次给我看。 |
| unbelief.waver | 1. 哇……是真的吗？／2. 我、我要去告诉他们！ |
| react.feat_seen | 1. 好厉害！再来一次！／2. 你是勇者吗？ |
| react.insult | 1. 你是坏人！／2. 我去告诉院长！ |
| react.gift_liked | 1. 给我的？真的吗？／2. 好甜！谢谢！ |
| topic.gen_faith.K0 | 1. 院长说要对着光祷告，可光不会说话。 |
| bark.chat | 1. 我们玩捉迷藏吧！ |

#### `ln_class_beastkin` 兽人（22 句）

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 人族。有事？／2. （嗅了嗅）你来做什么。 |
| greet.neutral | 1. 你好。／2. （点头）来了。 |
| greet.warm | 1. 朋友。坐。／2. 祖灵在上，又见面了。 |
| farewell | 1. 走好。／2. 风会给你带路。 |
| unbelief.deny | 1. 传闻？我不听传闻。／2. 人族的嘴，我不信。 |
| unbelief.explain | 1. 我没看见，就不算。／2. 让我亲眼看。 |
| unbelief.waver | 1. 你身上的味道……不一样。／2. 我闻得出来，你不是普通人。 |
| react.feat_seen | 1. 强。／2. （尾巴竖起来）好！ |
| react.insult | 1. 再说一次。／2. 嘴别那么脏。 |
| react.gift_liked | 1. 好肉。谢谢。／2. 这个我留着。 |
| react.identity_pressure | 1. （低吼）你身上有压人的东西。 |
| topic.gen_faith.K0 | 1. 我们拜林子的母亲，也拜祖灵。 |

## 8. 吠叫池 `bark_<池>`

### 8.1 清单与选择

吠叫池给 L4 人群单元用（builtin_ai 第 5.9、7.6 节）。选择时先找最具体的池（人群 × 地点 × 情境 × 多数认知），找不到依次去掉认知、情境、地点。通用池用 `{place}` 等填充槽贴地，地区池给地方色；同伴通用池是同伴本人包缺少某个战斗语境时的回退。每池 30 句，至少三种心情或时段偏好各占一成以上。

| 序 | 池 | 人群 | 地点 | 情境或认知 | 幕 |
| --- | --- | --- | --- | --- | --- |
| 1 | `bark_townsfolk_street_daily` | 镇民 | 街巷 | 日常 | 全 |
| 2 | `bark_townsfolk_market_day` | 镇民 | 集市 | 集日 | 全 |
| 3 | `bark_townsfolk_tavern_night` | 镇民 | 酒馆 | 夜里 | 全 |
| 4 | `bark_townsfolk_any_monster_season` | 镇民 | 任意 | 魔物季 | 全 |
| 5 | `bark_townsfolk_any_danger` | 镇民 | 任意 | 危险与恐慌 | 全 |
| 6 | `bark_townsfolk_any_festival` | 镇民 | 任意 | 节庆 | 全 |
| 7 | `bark_townsfolk_any_ashfall` | 镇民 | 任意 | 落灰与灰暴 | 全 |
| 8 | `bark_townsfolk_any_see_feat` | 围观者 | 任意 | 事迹当场 | 全 |
| 9 | `bark_townsfolk_any_doubt_luck` | 镇民 | 任意 | 多数解释化：运气、前人打残 | 全 |
| 10 | `bark_townsfolk_any_doubt_cheat` | 镇民 | 任意 | 多数解释化：作弊、误报、机关 | 全 |
| 11 | `bark_townsfolk_any_doubt_sorcery` | 镇民 | 任意 | 多数解释化：邪术、魔物作祟 | 全 |
| 12 | `bark_townsfolk_any_worship` | 镇民 | 任意 | 多数崇拜 | 全 |
| 13 | `bark_townsfolk_any_hostile` | 镇民 | 任意 | 多数敌视 | 全 |
| 14 | `bark_townsfolk_any_depend` | 领地居民 | 任意 | 多数依赖 | 二起 |
| 15 | `bark_guard_gate_daily` | 卫兵 | 城门 | 日常 | 全 |
| 16 | `bark_militia_wall_wartime` | 民兵与卫兵 | 城墙 | 战时、魔物来袭 | 全 |
| 17 | `bark_merchant_market_vendor_call` | 摊贩 | 集市 | 吆喝 | 全 |
| 18 | `bark_caravan_road_travel` | 商队 | 路上 | 行进 | 全 |
| 19 | `bark_faithful_chapel_holy_day` | 信众 | 礼拜堂 | 礼拜日 | 全 |
| 20 | `bark_faithful_any_heresy_alarm` | 信众 | 任意 | 异端恐慌 | 全 |
| 21 | `bark_farmer_field_daily` | 农户 | 田地 | 日常 | 全 |
| 22 | `bark_laborer_work_daily` | 矿工、伐木工、搬运工 | 工地 | 日常 | 全 |
| 23 | `bark_adventurer_guild_daily` | 冒险者 | 公会与酒馆 | 日常 | 全 |
| 24 | `bark_children_street_daily` | 孩子 | 街巷 | 日常 | 全 |
| 25 | `bark_gatefolk_hidden_daily` | 散居遗民 | 暗处 | 日常 | 全 |
| 26 | `bark_bandit_camp_daily` | 匪徒 | 营地 | 日常 | 一到三 |
| 27 | `bark_refugee_camp_daily` | 难民 | 营地 | 日常 | 二起 |
| 28 | `bark_soldier_camp_daily` | 士兵 | 营地 | 日常 | 二起 |
| 29 | `bark_soldier_field_combat` | 士兵 | 战场 | 交战、得胜、溃退 | 二起 |
| 30 | `bark_undead_ruins_echo` | 亡灵与灰鬼的残响 | 遗迹、荒原 | 写定残响，不对话 | 全 |
| 31 | `bark_party_guard` | 同伴：盾与护卫型 | 任意 | 战斗与行进 | 全 |
| 32 | `bark_party_striker` | 同伴：近战输出型 | 任意 | 战斗与行进 | 全 |
| 33 | `bark_party_ranged` | 同伴：远程与斥候型 | 任意 | 战斗与行进 | 全 |
| 34 | `bark_party_support` | 同伴：治疗、法术与契约型 | 任意 | 战斗与行进 | 全 |
| 35 | `bark_bs_tide_night` | 边石镇镇民 | 边石镇 | 兽潮之夜 | 一 |
| 36 | `bark_wb_city_street` | 瓦伦堡市民 | 城中街市 | 日常 | 二 |
| 37 | `bark_wb_siege_wartime` | 瓦伦堡市民与守军 | 城墙与城中 | 城下潮 | 二 |
| 38 | `bark_lotha_crusade_camp` | 洛萨籍圣战军征召兵 | 营地 | 日常 | 三 |
| 39 | `bark_territory_settlers` | 灰烬边境领拓荒者 | 领地 | 日常 | 三起 |
| 40 | `bark_holysee_pilgrims` | 朝圣者 | 教国 | 日常 | 四 |
| 41 | `bark_grantia_street` | 帝国市民与斗场看客 | 帝国城镇 | 日常 | 四 |
| 42 | `bark_mercato_exchange` | 交易所与港口的人 | 金湾 | 日常 | 四 |
| 43 | `bark_silva_elves` | 精灵 | 希尔瓦 | 日常 | 四 |
| 44 | `bark_windfang_camp` | 草原部族 | 风牙草原 | 日常 | 四 |
| 45 | `bark_night_market` | 夜境的居民 | 黯冠城与夜市 | 日常 | 四 |
| 46 | `bark_outer_nation_folk` | 庭外之国国民 | 庭外之国 | 日常 | 四起 |
| 47 | `bark_alliance_front` | 诸族联军 | 战线 | 战时 | 五 |
| 48 | `bark_epilogue_festival` | 各地居民 | 任意 | 后日谈的庆典与日常 | 终章 |

池里提到玩家时用 `{player}`，由填充层按该人群的多数认知改写称呼（第 2.3 节）。凡人池一律用俗称。

### 8.2 通用池正文

#### `bark_townsfolk_street_daily` 镇民 × 街巷 × 日常（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 早啊。／2. 今天的面包好像小了一圈。／3. 〔mood: 愁〕税又要涨了，听说没有？／4. 〔mood: 喜〕我家那口子今天回来！／5. 借过，借过。 |
| 6 到 10 | 6. 〔when: hour >= 18 OR hour < 6〕天黑了，快回家。／7. 那家的狗又叫了一夜。／8. 〔mood: 乏〕腰疼，昨天搬了一天柴。／9. 你听说{place}那边的事了吗？／10. 〔mood: 惧〕夜里别往北边去。 |
| 11 到 15 | 11. 井边又排长队了。／12. 〔mood: 喜〕今天天气真好。／13. 〔mood: 愁〕孩子又咳了一夜。／14. 谁家的鸡跑出来了？／15. 〔when: hour >= 6 AND hour < 10〕早市快开了。 |
| 16 到 20 | 16. 别踩着泥。／17. 〔mood: 乏〕今天的活怎么这么多。／18. 那个外乡人还在镇上？／19. 〔mood: 惧〕昨晚北门外有动静。／20. 〔when: hour >= 18 OR hour < 6〕把灯点上吧。 |
| 21 到 25 | 21. 〔mood: 喜〕今晚吃肉！／22. 盐又贵了。／23. 〔mood: 愁〕这日子什么时候是个头。／24. 让一让，车来了。／25. 〔mood: 平〕就这样吧，能过。 |
| 26 到 30 | 26. 〔when: hour >= 21 OR hour < 5〕嘘，小声点，都睡了。／27. 〔mood: 惧〕最近总觉得有人盯着。／28. 礼拜日快到了。／29. 〔mood: 乏〕困死了。／30. 〔mood: 喜〕听说隔壁添了个娃。 |

#### `bark_townsfolk_market_day` 镇民 × 集市 × 集日（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 今天人真多。／2. 这个多少钱？／3. 〔mood: 愁〕又涨价了，又涨价了。／4. 〔mood: 喜〕给你看，我买到了好布！／5. 别挤，别挤。 |
| 6 到 10 | 6. 便宜点吧，老主顾了。／7. 〔mood: 惧〕看好钱袋，集上有贼。／8. 〔mood: 乏〕逛了一上午，腿都软了。／9. 那边有卖糖的！／10. 〔when: hour >= 15〕快收摊了，便宜处理。 |
| 11 到 15 | 11. 〔mood: 喜〕今天运气好，讲下来两个铜子。／12. 盐呢？盐摊在哪？／13. 〔mood: 愁〕钱不够，下个集再来。／14. 这鱼新鲜吗？／15. 〔mood: 怒〕你这秤不对！ |
| 16 到 20 | 16. 听说南边的货车没来。／17. 〔mood: 喜〕这个给孩子带回去。／18. 买一送一？真的假的？／19. 〔mood: 乏〕先找个地方坐坐。／20. 〔when: hour < 9〕来得早，挑好的。 |
| 21 到 25 | 21. 那个外乡人也来逛集了。／22. 〔mood: 惧〕刚才有人喊抓贼！／23. 你买了什么？／24. 〔mood: 喜〕这价钱，划算！／25. 〔mood: 愁〕今年的收成卖不上价。 |
| 26 到 30 | 26. 让让，我要过去。／27. 〔when: hour >= 15〕回家做饭了。／28. 〔mood: 怒〕这摊主坑人。／29. 下个集日是哪天来着？／30. 〔mood: 平〕就买这些吧。 |

#### `bark_townsfolk_tavern_night` 镇民 × 酒馆 × 夜里（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 再来一杯！／2. 〔mood: 喜〕今天我请！／3. 〔mood: 愁〕喝完这杯就回去，明天还得干活。／4. 你听说了吗，{place}那边……／5. 〔mood: 怒〕谁动了我的酒？ |
| 6 到 10 | 6. 嘘，老板娘看着呢。／7. 〔mood: 乏〕眼皮打架了。／8. 来，划拳！／9. 〔mood: 喜〕哈哈哈，说得好！／10. 〔mood: 惧〕外头风大，今晚别走夜路。 |
| 11 到 15 | 11. 唱一个，唱一个！／12. 〔mood: 愁〕老婆又要骂了。／13. 这酒兑水了吧？／14. 〔mood: 喜〕敬咱们这个破镇子！／15. 〔when: hour >= 23 OR hour < 4〕快打烊了。 |
| 16 到 20 | 16. 那个新来的，坐角落那个，就是他。／17. 〔mood: 怒〕你再说一遍？／18. 别吵，别吵，喝酒。／19. 〔mood: 乏〕我趴一会儿……／20. 〔mood: 惧〕听说北边又死了人。 |
| 21 到 25 | 21. 老规矩，账记上。／22. 〔mood: 喜〕今晚痛快！／23. 〔mood: 愁〕这年头，什么都贵。／24. 谁去添点柴？／25. 〔when: hour >= 23 OR hour < 4〕最后一杯，真的最后一杯。 |
| 26 到 30 | 26. 我跟你打赌，他撑不过一个月。／27. 〔mood: 喜〕再来一首！／28. 〔mood: 怒〕别在这儿撒野。／29. 炖肉还有吗？／30. 〔mood: 平〕喝完回家睡觉。 |

#### `bark_townsfolk_any_monster_season` 镇民 × 魔物季（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 魔物季又到了。／2. 〔mood: 惧〕夜里别开门。／3. 〔mood: 愁〕今年来得比去年早。／4. 盐和药都囤上了吗？／5. 〔when: hour >= 18 OR hour < 6〕天一黑就关窗。 |
| 6 到 10 | 6. 〔mood: 惧〕昨晚狼叫了一整夜。／7. 卫队又在征人了。／8. 〔mood: 愁〕地里的活还没干完。／9. 〔mood: 乏〕守夜守得眼都红了。／10. 东栅那段木头早该换了。 |
| 11 到 15 | 11. 〔mood: 惧〕你家孩子别往林子里跑。／12. 听说{place}那边又出事了。／13. 〔mood: 喜〕今天卫队打回来两头，晚上有肉吃。／14. 一年比一年长，这魔物季。／15. 〔mood: 愁〕药价又涨了。 |
| 16 到 20 | 16. 〔when: hour >= 18 OR hour < 6〕听，那是什么声音？／17. 〔mood: 惧〕别一个人出镇子。／18. 神父说是邪神作祟。／19. 〔mood: 乏〕夜里睡不踏实。／20. 把狗拴好。 |
| 21 到 25 | 21. 〔mood: 喜〕总算有冒险者来了。／22. 〔mood: 愁〕今年怕是收不成了。／23. 〔mood: 惧〕灰色的狼，有人亲眼看见了。／24. 门闩加一道。／25. 〔when: hour < 7〕天亮了，没事了。 |
| 26 到 30 | 26. 〔mood: 怒〕讨伐税交了，讨伐的人呢？／27. 〔mood: 惧〕北门的钟又响了！／28. 去礼拜堂求个平安吧。／29. 〔mood: 乏〕熬过去就好了。／30. 〔mood: 平〕年年都这样，习惯了。 |

#### `bark_townsfolk_any_danger` 镇民 × 危险与恐慌（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 〔mood: 惧〕快跑！／2. 〔mood: 惧〕有东西过来了！／3. 关门！关门！／4. 〔mood: 惧〕孩子呢？我的孩子呢？／5. 叫卫队！ |
| 6 到 10 | 6. 〔mood: 惧〕别过来！／7. 往礼拜堂跑！／8. 〔mood: 怒〕卫队都在干什么！／9. 〔mood: 惧〕光啊，救救我们……／10. 拿上家伙！ |
| 11 到 15 | 11. 〔mood: 惧〕它进镇子了！／12. 躲起来，别出声。／13. 〔mood: 怒〕别挤！一个一个来！／14. 〔mood: 惧〕我腿软了……／15. 那边！那边！ |
| 16 到 20 | 16. 〔mood: 惧〕救命！／17. 快去敲钟！／18. 〔mood: 愁〕我的屋子……／19. 扶他起来，快！／20. 〔mood: 惧〕又来一个！ |
| 21 到 25 | 21. 〔mood: 怒〕跟它拼了！／22. 往南门走！／23. 〔mood: 惧〕我不想死……／24. 拿水来！着火了！／25. 〔mood: 喜〕赶走了！赶走了！ |
| 26 到 30 | 26. 〔mood: 乏〕结束了吗……／27. 〔mood: 愁〕还有人没回来。／28. 点人数！／29. 〔mood: 惧〕它还会回来吗？／30. 〔mood: 喜〕活下来了……我们活下来了。 |

#### `bark_townsfolk_any_festival` 镇民 × 节庆（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 〔mood: 喜〕今天热闹！／2. 来跳舞！／3. 〔mood: 喜〕好香，那边在烤什么？／4. 喝一杯，喝一杯！／5. 〔when: hour >= 18 OR hour < 6〕篝火点起来了！ |
| 6 到 10 | 6. 〔mood: 喜〕今年总算有个像样的节。／7. 给孩子买个糖人。／8. 〔mood: 乏〕跳不动了，歇会儿。／9. 那边在比力气，去看看！／10. 〔mood: 喜〕这身新衣裳怎么样？ |
| 11 到 15 | 11. 〔mood: 愁〕去年这时候，他还在。／12. 乐手呢？乐手来了没有？／13. 〔mood: 喜〕今晚不睡了！／14. 别喝太多。／15. 〔when: hour >= 21 OR hour < 4〕篝火快灭了，再添一把。 |
| 16 到 20 | 16. 〔mood: 喜〕赢了！我赢了一只鸡！／17. 神父也来了。／18. 〔mood: 乏〕脚疼。／19. 唱那首老歌！／20. 〔mood: 喜〕敬丰收！ |
| 21 到 25 | 21. 别挤，都有份。／22. 〔mood: 愁〕明天又要干活了。／23. 〔mood: 喜〕好久没这么高兴了。／24. 那个外乡人也来凑热闹了。／25. 〔when: hour >= 21 OR hour < 4〕回家的路上小心。 |
| 26 到 30 | 26. 〔mood: 喜〕再来一曲！／27. 酒还有吗？／28. 〔mood: 乏〕我先回去了。／29. 明年还这么热闹就好了。／30. 〔mood: 平〕节过完，日子照旧。 |

#### `bark_townsfolk_any_ashfall` 镇民 × 落灰与灰暴（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 天上在落灰。／2. 〔mood: 惧〕不吉利，不吉利。／3. 把窗关上，灰进屋了。／4. 〔mood: 愁〕晾的衣裳全白洗了。／5. 捂住嘴，别吸进去。 |
| 6 到 10 | 6. 〔mood: 惧〕北边又刮灰了。／7. 孩子叫回屋来！／8. 〔mood: 乏〕扫了一早上，又落满了。／9. 灰暴来了，别出门。／10. 〔mood: 愁〕井水要盖好。 |
| 11 到 15 | 11. 〔mood: 惧〕这灰气越来越重了。／12. 神父说要多祷告。／13. 〔mood: 愁〕咳了一夜。／14. 田里的苗全蒙了一层灰。／15. 〔when: hour >= 18 OR hour < 6〕夜里的灰最重。 |
| 16 到 20 | 16. 〔mood: 惧〕听说荒原上有东西跟着灰走。／17. 湿布蒙在门缝上。／18. 〔mood: 怒〕这鬼天气！／19. 〔mood: 乏〕眼睛都睁不开。／20. 灰停了没有？ |
| 21 到 25 | 21. 〔mood: 愁〕牲口不肯吃草。／22. 去年也刮过一回，没这么久。／23. 〔mood: 惧〕灰里有影子在动……是我眼花了吧。／24. 别揉眼睛。／25. 〔mood: 喜〕停了，总算停了。 |
| 26 到 30 | 26. 〔mood: 乏〕又得重新洗一遍。／27. 屋顶得扫一扫。／28. 〔mood: 愁〕这样下去，人会病的。／29. 〔when: hour < 8〕早上起来门口一层白。／30. 〔mood: 平〕刮完就好了。 |

#### `bark_townsfolk_any_see_feat` 围观者 × 事迹当场（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 你看见了吗？／2. 〔mood: 惧〕那、那是人吗？／3. 〔mood: 喜〕好！／4. 这不可能……／5. 我眼花了吧。 |
| 6 到 10 | 6. 〔mood: 喜〕再来一次！／7. 〔mood: 惧〕别靠太近。／8. 一个人？就他一个人？／9. 快去叫人来看！／10. 〔mood: 惧〕光在上…… |
| 11 到 15 | 11. 他是谁？／12. 〔mood: 喜〕哈！痛快！／13. 那是 F 级？你骗谁。／14. 〔mood: 惧〕我腿软了。／15. 刚才那一下，你看清了吗？ |
| 16 到 20 | 16. 〔mood: 喜〕我要回去讲给家里人听！／17. 肯定是运气。／18. 〔mood: 惧〕这不是凡人能做的事。／19. 别挤，让我看看！／20. 他身上是不是带着什么东西？ |
| 21 到 25 | 21. 〔mood: 喜〕好样的！／22. 我刚才是不是看错了？／23. 〔mood: 惧〕快走，快走。／24. 记住这张脸。／25. 〔mood: 喜〕今天没白来！ |
| 26 到 30 | 26. 说出去都没人信。／27. 〔mood: 惧〕我要去告诉神父。／28. 你说他是不是……算了。／29. 〔mood: 喜〕我就说他不一般！／30. 〔mood: 平〕看完了，散了吧。 |

#### `bark_townsfolk_any_doubt_luck` 多数解释化：运气、前人打残（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 运气好罢了。／2. 碰巧的事，有什么好说。／3. 〔mood: 喜〕运气这么好，带上我呗。／4. 那东西早被人打残了吧。／5. 捡了个漏而已。 |
| 6 到 10 | 6. 〔mood: 平〕换谁去都一样。／7. 又是运气。／8. 〔mood: 怒〕运气好就到处显摆。／9. 那窝狼前几天就被人打过了。／10. 〔when: hour >= 18 OR hour < 6〕喝酒的时候讲讲，图个乐。 |
| 11 到 15 | 11. 我要有那运气，早发财了。／12. 〔mood: 喜〕哈，福星高照。／13. 别当真，传的人多，看见的人少。／14. 前头有人拼过命，他捡现成的。／15. 〔mood: 愁〕好运气都让外乡人赶上了。 |
| 16 到 20 | 16. 一次是运气，两次……也是运气。／17. 〔mood: 平〕听听就算了。／18. 碰巧赶上了而已。／19. 〔mood: 喜〕运气也是本事嘛。／20. 那东西本来就快不行了。 |
| 21 到 25 | 21. 〔mood: 怒〕凭什么好事都落他头上。／22. 运气用完了就知道了。／23. 〔when: hour >= 18 OR hour < 6〕明天就没这么好运了。／24. 赶巧，纯属赶巧。／25. 〔mood: 平〕运气，运气。 |
| 26 到 30 | 26. 我叔叔也碰上过一回好运，后来就没了。／27. 〔mood: 喜〕沾沾运气。／28. 前人栽树后人乘凉。／29. 〔mood: 愁〕运气好的人都不长久。／30. 也就是运气。 |

#### `bark_townsfolk_any_doubt_cheat` 多数解释化：作弊、误报、机关（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 这里头有诈。／2. 准是跟谁串通好了。／3. 〔mood: 怒〕骗子。／4. 传话的人吹过头了。／5. 身上准藏着机关。 |
| 6 到 10 | 6. 〔mood: 平〕听着就像编的。／7. 十成里有八成是假的。／8. 〔mood: 怒〕别被他骗了。／9. 谁亲眼看见了？没有吧。／10. 〔when: hour >= 18 OR hour < 6〕酒馆里的话，哪能当真。 |
| 11 到 15 | 11. 公会肯定帮他瞒着什么。／12. 〔mood: 喜〕哈，演得真像。／13. 那东西是道具，不是本事。／14. 〔mood: 愁〕现在的人，什么都敢编。／15. 鉴定读不出来？水晶坏了吧。 |
| 16 到 20 | 16. 〔mood: 怒〕装神弄鬼。／17. 有人花钱请人到处讲。／18. 〔mood: 平〕等着看他露馅。／19. 一夜之间？不可能，准有人帮他。／20. 那数字一听就是乘过的。 |
| 21 到 25 | 21. 〔mood: 喜〕骗得过别人，骗不过我。／22. 道具收走了，看他还行不行。／23. 〔mood: 怒〕这种人就该赶出去。／24. 我看是串好的戏。／25. 〔when: hour >= 18 OR hour < 6〕明天你去问问看见的人，没几个。 |
| 26 到 30 | 26. 〔mood: 愁〕上回就有人这样骗走了钱。／27. 先别信，过几天再说。／28. 〔mood: 平〕故事听听就好。／29. 他说什么你都信？／30. 有诈，一定有诈。 |

#### `bark_townsfolk_any_doubt_sorcery` 多数解释化：邪术、魔物作祟（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 〔mood: 惧〕那不是光。／2. 邪术……一定是邪术。／3. 〔mood: 惧〕离他远点。／4. 光照不出的东西，能是好东西？／5. 去告诉神父。 |
| 6 到 10 | 6. 〔mood: 惧〕他身边那只鸟不对劲。／7. 魔物作祟，跟着他来的。／8. 〔mood: 怒〕把他赶出去！／9. 〔when: hour >= 18 OR hour < 6〕夜里别去他住的地方。／10. 灰气跟着他走。 |
| 11 到 15 | 11. 〔mood: 惧〕我娘说过，这种人会招灾。／12. 自从他来了，镇上就不太平。／13. 〔mood: 愁〕孩子病了，是不是他……／14. 画个圣印。／15. 〔mood: 惧〕别看他的眼睛。 |
| 16 到 20 | 16. 巫婆都养黑鸟。／17. 〔mood: 怒〕神父怎么还不管！／18. 我在门上挂了圣徽。／19. 〔mood: 惧〕那种本事，是拿什么换来的？／20. 〔when: hour >= 18 OR hour < 6〕关好门，念一遍祷词。 |
| 21 到 25 | 21. 〔mood: 平〕也可能……不，还是小心为好。／22. 他从荒原回来，居然没事。／23. 〔mood: 惧〕荒原上的东西会附在人身上。／24. 光会看见的。／25. 〔mood: 愁〕这镇子是不是被盯上了。 |
| 26 到 30 | 26. 〔mood: 怒〕邪祟就该烧掉。／27. 别跟他说话。／28. 〔mood: 惧〕我梦见他了……／29. 礼拜日去问问神父。／30. 〔mood: 喜〕有光在，邪祟进不来。 |

#### `bark_townsfolk_any_worship` 多数崇拜（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 〔mood: 喜〕是{player}！／2. 那就是救了我们的人。／3. 〔mood: 喜〕给他让路！／4. 有他在，夜里都敢开窗了。／5. 我家孩子说长大要像他一样。 |
| 6 到 10 | 6. 〔mood: 喜〕今天见到他了！／7. 给他留最好的座位。／8. 〔mood: 愁〕要是他早来一年，我爹就不会……／9. 他说什么都对。／10. 〔when: hour >= 18 OR hour < 6〕今晚喝酒敬他一杯。 |
| 11 到 15 | 11. 〔mood: 喜〕我跟他说过话！／12. 别打扰他，他在想大事。／13. 他走过的地方，魔物都绕着走。／14. 〔mood: 喜〕我给他送了一篮蛋。／15. 他看了我一眼！ |
| 16 到 20 | 16. 〔mood: 平〕他也就是个人，别太吵他。／17. 什么难事交给他就行。／18. 〔mood: 喜〕有福了，有福了。／19. 他一定是上天派来的。／20. 〔mood: 惧〕别惹他不高兴。 |
| 21 到 25 | 21. 〔mood: 喜〕我把他的事编成歌了！／22. 他要什么，我们都给。／23. 〔mood: 乏〕排了一早上，就为看他一眼。／24. 听说他一个人顶一百个。／25. 〔mood: 喜〕跟着他准没错。 |
| 26 到 30 | 26. 〔mood: 愁〕他要是走了，我们怎么办？／27. 把这事告诉每一个人。／28. 〔mood: 喜〕今天是好日子。／29. 他说过会回来的。／30. 〔mood: 平〕谢谢他，就够了。 |

#### `bark_townsfolk_any_hostile` 多数敌视（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 〔mood: 怒〕他又来了。／2. 别跟他说话。／3. 〔mood: 惧〕离他远点。／4. 这种人不该在这儿。／5. 〔mood: 怒〕滚出去。 |
| 6 到 10 | 6. 〔mood: 惧〕那不是人能有的本事。／7. 关门，别让他进来。／8. 〔mood: 怒〕都是他招来的。／9. 店里不卖他东西。／10. 〔when: hour >= 18 OR hour < 6〕夜里锁好门。 |
| 11 到 15 | 11. 〔mood: 惧〕孩子别靠近他。／12. 他看人的样子不对。／13. 〔mood: 怒〕神父说得对。／14. 别让他碰井水。／15. 〔mood: 愁〕自从他来了，没一天安生。 |
| 16 到 20 | 16. 〔mood: 怒〕他以为他是谁。／17. 别看他。／18. 〔mood: 惧〕我梦见他把镇子烧了。／19. 让卫队盯着他。／20. 〔mood: 平〕他走他的，我们过我们的。 |
| 21 到 25 | 21. 〔mood: 怒〕早晚出事。／22. 换条路走。／23. 〔mood: 惧〕他听见了？快走。／24. 别收他的钱。／25. 〔mood: 愁〕这镇子怎么了。 |
| 26 到 30 | 26. 〔mood: 怒〕有本事又怎样，不是自己人。／27. 去跟代官说说。／28. 〔mood: 惧〕他笑起来更吓人。／29. 〔mood: 喜〕听说他要走了，好。／30. 别跟他扯上关系。 |

#### `bark_townsfolk_any_depend` 多数依赖（领地居民，30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 等{player}回来再说。／2. 〔mood: 愁〕这事得请示一下。／3. 有{player}在，怕什么。／4. 〔mood: 喜〕今年的粮够了，多亏了领主。／5. 我们自己拿不了主意。 |
| 6 到 10 | 6. 〔mood: 惧〕领主不在，谁来管？／7. 去找官员问问。／8. 〔mood: 愁〕请愿书写好了，交上去吧。／9. 〔mood: 喜〕新修的路真好走。／10. 〔when: hour >= 18 OR hour < 6〕明天去衙门排队。 |
| 11 到 15 | 11. 上面会安排的。／12. 〔mood: 平〕照规矩来就是。／13. 〔mood: 愁〕又要等批复。／14. 领主说的总没错。／15. 〔mood: 喜〕今年不用交那么多了。 |
| 16 到 20 | 16. 〔mood: 惧〕要是打仗了，领主会护着我们吧？／17. 我们照做就是。／18. 〔mood: 乏〕排了一天队。／19. 去问问能不能多分一块地。／20. 〔mood: 喜〕学堂开了，孩子能识字了。 |
| 21 到 25 | 21. 〔mood: 愁〕井又干了，得报上去。／22. 有事找官员，官员找领主。／23. 〔mood: 平〕习惯了，有人管着好。／24. 〔mood: 惧〕别自己乱来，等上面的话。／25. 〔mood: 喜〕领主今天来视察了！ |
| 26 到 30 | 26. 〔mood: 愁〕要是有一天没人管了，怎么办？／27. 我们自己也能修吧？……还是等等。／28. 〔mood: 平〕上面怎么说就怎么做。／29. 〔mood: 喜〕日子比以前好多了。／30. 求领主做主。 |

#### `bark_guard_gate_daily` 卫兵 × 城门 × 日常（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 站住，例行检查。／2. 进城做什么？／3. 〔mood: 乏〕又是一天。／4. 车上装的什么？打开看看。／5. 过吧。 |
| 6 到 10 | 6. 〔mood: 怒〕别插队！／7. 〔when: hour >= 18 OR hour < 6〕天黑关城门，明天再来。／8. 名字，从哪来。／9. 〔mood: 乏〕站了一天，脚都麻了。／10. 带刀进城要登记。 |
| 11 到 15 | 11. 〔mood: 惧〕北边那条路最近不太平。／12. 别在门口逗留。／13. 〔mood: 喜〕换岗了，喝一杯去。／14. 过路税两个铜子。／15. 〔mood: 平〕没事，过吧。 |
| 16 到 20 | 16. 〔mood: 怒〕再闹就关起来。／17. 文书呢？／18. 〔when: hour >= 22 OR hour < 5〕谁在那儿？报上名来！／19. 〔mood: 乏〕下一个。／20. 那人看着眼生。 |
| 21 到 25 | 21. 〔mood: 惧〕刚才那声是什么？／22. 别挡路，车要过。／23. 〔mood: 愁〕饷又晚了。／24. 有告示，自己看。／25. 〔mood: 平〕规矩就是规矩。 |
| 26 到 30 | 26. 〔mood: 怒〕你那张卡上写着 Lv1？进去吧，别惹事。／27. 〔when: hour < 7〕开城门了！／28. 〔mood: 乏〕什么时候换岗。／29. 盯紧点。／30. 〔mood: 喜〕今天没出事。 |

#### `bark_militia_wall_wartime` 民兵与卫兵 × 城墙 × 战时（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 〔mood: 惧〕来了！／2. 弓手上墙！／3. 〔mood: 惧〕好多……／4. 别慌，守住！／5. 火把！火把！ |
| 6 到 10 | 6. 〔mood: 怒〕给我顶住！／7. 东栅要塌了！／8. 〔mood: 惧〕我、我手在抖。／9. 石头砸下去！／10. 〔mood: 乏〕箭快没了。 |
| 11 到 15 | 11. 换人，换人！／12. 〔mood: 惧〕它爬上来了！／13. 〔mood: 怒〕砍它的腿！／14. 伤员往后抬！／15. 〔mood: 喜〕打下去一个！ |
| 16 到 20 | 16. 〔mood: 惧〕还有多少？／17. 别往下看。／18. 〔mood: 乏〕撑住，天快亮了。／19. 门闩！快顶住门！／20. 〔mood: 喜〕好！再来！ |
| 21 到 25 | 21. 〔mood: 惧〕队长！队长倒了！／22. 听我的，一起放！／23. 〔mood: 怒〕想进镇子，先过我这关！／24. 水，谁有水。／25. 〔mood: 惧〕那个大家伙过来了…… |
| 26 到 30 | 26. 〔mood: 喜〕退了！它们退了！／27. 〔mood: 乏〕总算……总算熬过来了。／28. 点人数。／29. 〔mood: 愁〕又少了几个。／30. 〔mood: 平〕修墙，天亮前修好。 |

#### `bark_merchant_market_vendor_call` 摊贩 × 集市 × 吆喝（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 来看看，来看看！／2. 新鲜的鱼，刚上岸！／3. 〔mood: 喜〕便宜卖，今天就这一批！／4. 盐，好盐，不掺沙！／5. 针线布头，一个铜子三样！ |
| 6 到 10 | 6. 〔mood: 喜〕走过路过别错过！／7. 热乎的饼！／8. 〔mood: 愁〕卖不动啊，再便宜点也行。／9. 刀磨得快，一把顶两把！／10. 〔when: hour >= 15〕收摊了收摊了，最后几个便宜给你！ |
| 11 到 15 | 11. 草药，治咳嗽的草药！／12. 〔mood: 喜〕今天开张大吉！／13. 好皮子，北边来的！／14. 〔mood: 乏〕喊了一上午，嗓子哑了。／15. 尝尝，不好吃不要钱！ |
| 16 到 20 | 16. 外地的货，别处买不到！／17. 〔mood: 喜〕客官看看，看看又不要钱！／18. 蜂蜜，真蜂蜜！／19. 〔when: hour < 9〕早来的有折扣！／20. 〔mood: 愁〕今天集上人少。 |
| 21 到 25 | 21. 绳子，结实的绳子！／22. 〔mood: 喜〕买二送一！／23. 护身符，保平安！／24. 〔mood: 怒〕别光摸不买！／25. 陶罐，摔不破的陶罐！ |
| 26 到 30 | 26. 〔mood: 喜〕最后三个了！／27. 鸡蛋，刚下的！／28. 〔mood: 乏〕坐下歇会儿再喊。／29. 好酒，自家酿的！／30. 〔mood: 平〕要的说话，不要的让一让。 |

#### `bark_caravan_road_travel` 商队 × 路上（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 跟上，别掉队。／2. 〔mood: 乏〕还有多远？／3. 骡子又不肯走了。／4. 〔mood: 惧〕这段路最容易出事。／5. 前面是{landmark}，歇一歇。 |
| 6 到 10 | 6. 〔mood: 喜〕再过一天就到{next}了。／7. 车轴响了，看看是不是要坏。／8. 〔mood: 惧〕林子里有动静。／9. 护卫打起精神！／10. 〔when: hour >= 18 OR hour < 6〕天黑前得找到落脚的地方。 |
| 11 到 15 | 11. 〔mood: 愁〕这趟要是亏了，我就完了。／12. 水不多了，省着喝。／13. 〔mood: 喜〕这批货能卖好价钱。／14. 别走那条近路，有匪。／15. 〔mood: 乏〕腿都颠麻了。 |
| 16 到 20 | 16. 铃响三下是平安。／17. 〔mood: 惧〕那边是不是有人？／18. 把篷布盖紧，要下雨了。／19. 〔mood: 喜〕看，炊烟！快到了。／20. 〔when: hour >= 18 OR hour < 6〕轮流守夜。 |
| 21 到 25 | 21. 〔mood: 怒〕又收过路钱？上个桥才收过！／22. 这条路年年都难走。／23. 〔mood: 平〕慢慢走，货丢不了。／24. 谁去前面探探路？／25. 〔mood: 惧〕护卫呢？护卫跑哪去了？ |
| 26 到 30 | 26. 〔mood: 乏〕下车走一段，活动活动。／27. 〔mood: 喜〕今晚有酒喝。／28. 记账，这里扣了两个铜子。／29. 〔mood: 愁〕听说前头的商队被劫了。／30. 到了，卸货。 |

#### `bark_faithful_chapel_holy_day` 信众 × 礼拜堂 × 礼拜日（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 愿光照着我们。／2. 今天的布道讲什么？／3. 〔mood: 愁〕求光保佑我家孩子的病。／4. 坐前面去，听得清楚。／5. 〔mood: 喜〕今天来的人真多。 |
| 6 到 10 | 6. 嘘，神父要开始了。／7. 〔mood: 乏〕一大早赶来，困得很。／8. 捐一个铜子吧。／9. 〔mood: 惧〕最近不太平，多祷告。／10. 〔when: hour < 9〕钟响了，快进去。 |
| 11 到 15 | 11. 光会看见的。／12. 〔mood: 愁〕又少了一家，搬走了。／13. 那个外乡人从不来礼拜。／14. 〔mood: 喜〕今天领了圣饼。／15. 跪下，低头。 |
| 16 到 20 | 16. 〔mood: 平〕念完就回家吃饭。／17. 圣典上说，耐心是美德。／18. 〔mood: 惧〕神父的脸色不太好。／19. 给穷人的粥在后院。／20. 〔mood: 愁〕光啊，为什么不回应我。 |
| 21 到 25 | 21. 〔mood: 喜〕唱圣歌了！／22. 衣服穿整齐点。／23. 〔mood: 乏〕站得腿都酸了。／24. 别交头接耳。／25. 〔mood: 平〕愿光照着这个镇子。 |
| 26 到 30 | 26. 〔mood: 惧〕听说有人在念邪神的名字。／27. 下礼拜还来。／28. 〔mood: 喜〕心里踏实多了。／29. 告解的人排得好长。／30. 光与我们同在。 |

#### `bark_faithful_any_heresy_alarm` 信众 × 异端恐慌（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 〔mood: 惧〕异端！／2. 快去报告神父！／3. 〔mood: 怒〕把他赶出去！／4. 〔mood: 惧〕别看，会被迷住的。／5. 画圣印，快画圣印！ |
| 6 到 10 | 6. 〔mood: 怒〕烧了那些邪物！／7. 〔mood: 惧〕光啊，庇佑我们。／8. 那歌是邪歌，别唱！／9. 〔mood: 惧〕我听见了，他在念那个名字。／10. 把孩子抱走！ |
| 11 到 15 | 11. 〔mood: 怒〕审判！要审判！／12. 〔mood: 愁〕怎么会是她……／13. 关上门，别让邪气进来。／14. 〔mood: 惧〕手上有印子的，都是烙印者。／15. 去主教区告发。 |
| 16 到 20 | 16. 〔mood: 怒〕藏着邪物的人也是同罪！／17. 〔mood: 惧〕我昨晚做了噩梦。／18. 圣水，谁有圣水？／19. 〔mood: 平〕先别乱说，等神父定。／20. 〔mood: 惧〕他会不会报复？ |
| 21 到 25 | 21. 〔mood: 怒〕早该管管了！／22. 别跟他说话，会被沾上。／23. 〔mood: 愁〕这镇子是不是被诅咒了。／24. 〔mood: 惧〕灯……灯怎么灰了？／25. 念祷词，大声念！ |
| 26 到 30 | 26. 〔mood: 怒〕光不会放过他们。／27. 〔mood: 惧〕我不敢出门了。／28. 把那屋子烧掉。／29. 〔mood: 平〕神父会处理的。／30. 〔mood: 喜〕光赢了，光总会赢。 |

#### `bark_farmer_field_daily` 农户 × 田地 × 日常（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 今年的苗长得还行。／2. 〔mood: 乏〕腰都弯不下去了。／3. 〔mood: 愁〕要是再不下雨……／4. 把水沟清一清。／5. 〔when: hour < 7〕天亮就下地。 |
| 6 到 10 | 6. 〔mood: 喜〕看，结穗了！／7. 地里又有野猪拱过。／8. 〔mood: 愁〕税交完还剩多少。／9. 牛该喂了。／10. 〔mood: 乏〕歇一会儿，喝口水。 |
| 11 到 15 | 11. 〔mood: 惧〕林子那边有狼叫。／12. 今年收成好，多亏老天。／13. 〔mood: 喜〕晚饭有新麦饼。／14. 〔when: hour >= 17〕收工回家。／15. 这块地少报一亩……别说出去。 |
| 16 到 20 | 16. 〔mood: 愁〕种子不够了。／17. 犁头钝了，得找铁匠。／18. 〔mood: 喜〕孩子来送饭了。／19. 〔mood: 乏〕晒得头晕。／20. 麻雀又来偷吃。 |
| 21 到 25 | 21. 〔mood: 惧〕地里的土发灰，不知道怎么回事。／22. 〔mood: 平〕看天吃饭，没办法。／23. 帮我扛一下这捆。／24. 〔mood: 喜〕今年能给孩子添件衣裳了。／25. 〔mood: 愁〕代官又派人来量地了。 |
| 26 到 30 | 26. 〔when: hour >= 17〕太阳落山了，明天再干。／27. 〔mood: 乏〕手上全是泡。／28. 等收完这一季就好了。／29. 〔mood: 喜〕好苗子！／30. 〔mood: 平〕地不骗人，你出多少力它给多少。 |

#### `bark_laborer_work_daily` 劳工 × 工地 × 日常（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 一、二、三，起！／2. 〔mood: 乏〕这活累死人。／3. 工头来了，干活干活。／4. 〔mood: 愁〕工钱又被扣了。／5. 递一下那根绳子。 |
| 6 到 10 | 6. 〔mood: 惧〕这木头撑不住了！／7. 〔mood: 喜〕今天工钱结了！／8. 下井前点灯。／9. 〔mood: 乏〕肩膀磨破了。／10. 〔when: hour >= 17〕收工！喝酒去！ |
| 11 到 15 | 11. 〔mood: 怒〕凭什么他歇着我们干？／12. 小心脚下。／13. 〔mood: 惧〕矿里又有响动。／14. 锯快点，天黑前得完。／15. 〔mood: 喜〕今天顺，没出岔子。 |
| 16 到 20 | 16. 这堆搬到那边去。／17. 〔mood: 愁〕家里又要交房钱了。／18. 〔mood: 乏〕手抖了，歇一下。／19. 斧子给我。／20. 〔when: hour < 7〕早班的人到齐没有？ |
| 21 到 25 | 21. 〔mood: 惧〕有人被压住了！快来！／22. 〔mood: 平〕干一天拿一天的钱。／23. 别偷懒，工头看着呢。／24. 〔mood: 喜〕晚上有肉汤。／25. 这块石头怎么发灰？ |
| 26 到 30 | 26. 〔mood: 怒〕工头又克扣了。／27. 〔mood: 乏〕明天还得来。／28. 一起使劲！／29. 〔mood: 愁〕这条命就值这几个铜子。／30. 〔mood: 喜〕干完了！ |

#### `bark_adventurer_guild_daily` 冒险者 × 公会与酒馆 × 日常（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 板上有什么好活？／2. 〔mood: 愁〕又是清老鼠的，没意思。／3. 谁组队去{place}？／4. 〔mood: 喜〕这回赚了！／5. 别抢我的委托。 |
| 6 到 10 | 6. 〔mood: 乏〕刚回来，累得要死。／7. 听说有新来的 F 级。／8. 〔mood: 怒〕报酬也太少了。／9. 药水又涨价了。／10. 〔when: hour >= 18 OR hour < 6〕喝一杯，明天再接活。 |
| 11 到 15 | 11. 〔mood: 惧〕那地方我不去，上回差点回不来。／12. 升级考核什么时候开？／13. 〔mood: 喜〕看，这是那东西的牙！／14. 缺个会治伤的。／15. 〔mood: 平〕活着回来就行。 |
| 16 到 20 | 16. 那个 F 级？吹出来的吧。／17. 〔mood: 乏〕刀卷刃了，得去修。／18. 〔mood: 愁〕队里又少了一个。／19. 签字，领钱。／20. 〔mood: 喜〕今晚我请！ |
| 21 到 25 | 21. 〔mood: 怒〕谁又把好委托留给熟人了？／22. 先看清楚委托写的是什么。／23. 〔mood: 惧〕灰色的狼，你见过吗？／24. 分赃要公平。／25. 〔when: hour < 9〕早来的先挑。 |
| 26 到 30 | 26. 〔mood: 平〕又是一天。／27. 〔mood: 喜〕升级了！／28. 那水晶又坏了？／29. 〔mood: 乏〕这一趟走了三天。／30. 下回带上我。 |

#### `bark_children_street_daily` 孩子 × 街巷 × 日常（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 〔mood: 喜〕来抓我呀！／2. 我才不是小孩！／3. 〔mood: 喜〕看我找到了什么！／4. 等等我！／5. 〔mood: 惧〕那边有狗！ |
| 6 到 10 | 6. 〔mood: 愁〕我饿了。／7. 你是谁？／8. 〔mood: 喜〕糖！有糖！／9. 再玩一会儿嘛。／10. 〔when: hour >= 18 OR hour < 6〕娘喊我回家了。 |
| 11 到 15 | 11. 〔mood: 怒〕不跟你玩了！／12. 我长大要当冒险者！／13. 〔mood: 惧〕我不敢去北边。／14. 一、二、三，木头人！／15. 〔mood: 喜〕我赢了！ |
| 16 到 20 | 16. 〔mood: 愁〕我的球掉井里了。／17. 你听过那个鬼故事吗？／18. 〔mood: 乏〕跑不动了。／19. 嘘，别告诉大人。／20. 〔mood: 喜〕下雨了！踩水去！ |
| 21 到 25 | 21. 〔mood: 惧〕我梦见大鸟了。／22. 那个人好厉害！／23. 〔mood: 喜〕我会翻跟头！／24. 〔mood: 愁〕院长说今天没肉。／25. 你有几个铜子？ |
| 26 到 30 | 26. 〔mood: 喜〕我们去河边！／27. 〔when: hour >= 20 OR hour < 6〕好黑……／28. 你别哭了。／29. 〔mood: 怒〕是他先推我的！／30. 〔mood: 平〕明天再来玩。 |

#### `bark_gatefolk_hidden_daily` 散居遗民 × 暗处 × 日常（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. （低声）门缝开着。／2. 〔mood: 惧〕手套戴好。／3. 敲三短一长。／4. 〔mood: 愁〕又有人被带走了。／5. 别抬头，走你的。 |
| 6 到 10 | 6. 〔when: hour >= 20 OR hour < 5〕夜里留门。／7. 〔mood: 惧〕巡夜的过来了。／8. 母亲会回来的。／9. 〔mood: 喜〕孩子平安到了。／10. 别在神父面前出声。 |
| 11 到 15 | 11. 〔mood: 惧〕手背在发烫……／12. 今晚有人要过路。／13. 〔mood: 愁〕下一站断了。／14. 把灯压低。／15. 〔mood: 平〕今天没事，睡吧。 |
| 16 到 20 | 16. 〔mood: 惧〕那人看我的手了。／17. 唱那首歌要小声。／18. 〔mood: 喜〕有人留了面包在门口。／19. 〔when: hour >= 20 OR hour < 5〕门开着，路很长。／20. 别问名字。 |
| 21 到 25 | 21. 〔mood: 愁〕老人走了，没人记得后半首歌了。／22. 围巾再围高一点。／23. 〔mood: 惧〕他们在挨家挨户查。／24. 〔mood: 喜〕今天的风，闻起来像开着的门。／25. 认得路的人，自己会来。 |
| 26 到 30 | 26. 〔mood: 平〕活下去，就是对的。／27. 〔mood: 惧〕别跑，跑了更像。／28. 门不会一直关着。／29. 〔mood: 愁〕又要搬家了。／30. 〔when: hour < 6〕天快亮了，关门。 |

#### `bark_bandit_camp_daily` 匪徒 × 营地 × 日常（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 酒呢？／2. 〔mood: 怒〕谁又偷吃了干粮？／3. 头儿说今晚出去。／4. 〔mood: 喜〕这趟油水足！／5. 刀磨快点。 |
| 6 到 10 | 6. 〔mood: 惧〕听说卫队要来剿了。／7. 团规：不杀平民。记住。／8. 〔mood: 乏〕守夜轮到谁了？／9. 〔mood: 愁〕这日子什么时候是个头。／10. 〔when: hour >= 18 OR hour < 6〕火压小点，别让人看见。 |
| 11 到 15 | 11. 上面那些老爷，没一个好东西。／12. 〔mood: 喜〕骰子拿来！／13. 〔mood: 怒〕再输我就翻脸了。／14. 马该喂了。／15. 〔mood: 惧〕林子里有动静。 |
| 16 到 20 | 16. 头儿这回能分多少？／17. 〔mood: 愁〕想家了。……没家了。／18. 〔mood: 喜〕今晚吃肉！／19. 别乱跑，就待在营里。／20. 〔mood: 乏〕腿上的伤又疼了。 |
| 21 到 25 | 21. 〔mood: 惧〕那个外乡人，听说一个人干翻了一队。／22. 输了就认，团里的规矩。／23. 〔mood: 怒〕我们替人干脏活，他们拿大头。／24. 去看看路上有没有车。／25. 〔when: hour < 6〕天亮前撤。 |
| 26 到 30 | 26. 〔mood: 平〕干完这票就收手。……每回都这么说。／27. 〔mood: 喜〕头儿回来了！／28. 把弓箭收好。／29. 〔mood: 愁〕旧哨村以前也是个好地方。／30. 〔mood: 惧〕这不是人，跑！ |

#### `bark_refugee_camp_daily` 难民 × 营地 × 日常（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 〔mood: 愁〕今天的粥又稀了。／2. 排队，别挤。／3. 〔mood: 惧〕北边的人说，那边全没了。／4. 有人在发毯子！／5. 〔mood: 乏〕走了十天，脚都烂了。 |
| 6 到 10 | 6. 〔mood: 愁〕我家那口子还没找到。／7. 给我一块地，我什么都能种。／8. 〔mood: 喜〕孩子今天吃饱了。／9. 〔when: hour >= 18 OR hour < 6〕夜里冷，挤一挤。／10. 城里不让进。 |
| 11 到 15 | 11. 〔mood: 怒〕凭什么他们有屋子住？／12. 〔mood: 惧〕又有人病了。／13. 修女来了。／14. 〔mood: 愁〕回不去了。／15. 〔mood: 喜〕有人肯雇我干活！ |
| 16 到 20 | 16. 我们不要施舍，要活干。／17. 〔mood: 乏〕睡不着。／18. 〔mood: 惧〕营地外有狼。／19. 一起立个誓吧，同住同守。／20. 〔mood: 愁〕冬天快到了。 |
| 21 到 25 | 21. 谁会写字？帮我写封信。／22. 〔mood: 喜〕听说有个领主在招人开荒。／23. 〔mood: 怒〕粮被人克扣了。／24. 〔when: hour < 7〕天亮去城门口等活。／25. 〔mood: 平〕活着就有盼头。 |
| 26 到 30 | 26. 〔mood: 惧〕别让孩子跑远。／27. 〔mood: 愁〕家里的地，现在长满草了吧。／28. 有热水吗？／29. 〔mood: 喜〕我们有地方去了！／30. 〔mood: 乏〕先睡吧，明天再说。 |

#### `bark_soldier_camp_daily` 士兵 × 营地 × 日常（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 换岗了。／2. 〔mood: 乏〕操练了一整天。／3. 〔mood: 愁〕饷什么时候发？／4. 伙房今天煮的什么？／5. 〔mood: 喜〕来，掷一把！ |
| 6 到 10 | 6. 〔mood: 惧〕听说明天要开拔。／7. 擦干净你的甲。／8. 〔when: hour >= 21 OR hour < 5〕熄火，睡觉。／9. 〔mood: 愁〕想家了。／10. 谁的靴子借我一下。 |
| 11 到 15 | 11. 〔mood: 怒〕军官又克扣口粮。／12. 〔mood: 喜〕家里来信了！／13. 军令就是军令。／14. 〔mood: 惧〕对面有多少人？／15. 〔mood: 乏〕脚上又磨了泡。 |
| 16 到 20 | 16. 磨刀，明天用得上。／17. 〔mood: 平〕当兵吃粮，就这样。／18. 〔mood: 喜〕今晚有酒！／19. 别乱走，营规严。／20. 〔when: hour < 6〕起来，点卯！ |
| 21 到 25 | 21. 〔mood: 愁〕上回一起来的，就剩我一个了。／22. 〔mood: 惧〕夜里有人在营外转。／23. 听说那边的将军很能打。／24. 〔mood: 喜〕打完这仗就回家。／25. 〔mood: 怒〕谁偷了我的干粮！ |
| 26 到 30 | 26. 写封信吧，万一……／27. 〔mood: 乏〕站岗站到天亮。／28. 〔mood: 平〕今天又没事。／29. 号角响了！集合！／30. 〔mood: 惧〕别想了，睡吧。 |

#### `bark_soldier_field_combat` 士兵 × 战场 × 交战、得胜、溃退（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 冲啊！／2. 〔mood: 惧〕顶住！顶住！／3. 盾牌举起来！／4. 〔mood: 怒〕杀！／5. 弓手，放！ |
| 6 到 10 | 6. 〔mood: 惧〕左边，左边破了！／7. 别乱，跟着旗走！／8. 〔mood: 惧〕我中箭了！／9. 〔mood: 怒〕给我上！／10. 补上缺口！ |
| 11 到 15 | 11. 〔mood: 惧〕他们太多了！／12. 稳住阵脚！／13. 〔mood: 喜〕打退了！／14. 医兵！这里要医兵！／15. 〔mood: 惧〕队长倒了！ |
| 16 到 20 | 16. 〔mood: 惧〕撤！撤！／17. 别跑，跑了死得更快！／18. 〔mood: 喜〕敌人溃了！追！／19. 〔mood: 乏〕手抬不起来了。／20. 换下来，换下来！ |
| 21 到 25 | 21. 〔mood: 怒〕为了家里人！／22. 〔mood: 喜〕赢了！我们赢了！／23. 〔mood: 惧〕旗倒了……／24. 往高处退！／25. 〔mood: 喜〕好样的！ |
| 26 到 30 | 26. 〔mood: 乏〕结束了……结束了吗？／27. 〔mood: 愁〕他没起来。／28. 收拢队伍！／29. 〔mood: 喜〕今晚能睡个好觉了。／30. 〔mood: 平〕清点伤亡。 |

#### `bark_undead_ruins_echo` 亡灵与灰鬼的残响 × 遗迹与荒原（30 句）

残响是写定的碎句，不对话、不回应玩家；只在亡灵或灰鬼出现时由演出层播放。句子不说出任何台账内容，只是"曾经住着人"的回声。

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. ……门……关上……／2. 〔place: ruins〕……谁在敲门……／3. ……冷……／4. ……回家……该回家了……／5. 〔place: wild〕……灰……好多灰…… |
| 6 到 10 | 6. ……我的钥匙呢……／7. 〔place: ruins〕……还没写完……／8. ……孩子……别哭……／9. ……光……好亮……／10. 〔place: wild〕……路……路在哪里…… |
| 11 到 15 | 11. ……再等一等……／12. ……灯灭了……／13. 〔place: ruins〕……开门……开门……／14. ……疼……／15. ……有人吗…… |
| 16 到 20 | 16. 〔place: wild〕……沙子里……有人……／17. ……晚饭……凉了……／18. ……不要……／19. 〔place: ruins〕……这一页……／20. ……谁在那儿…… |
| 21 到 25 | 21. ……我认得你……不，不认得……／22. 〔place: wild〕……风……往南吹……／23. ……睡吧……／24. ……门牌……掉了……／25. 〔place: ruins〕……还没到…… |
| 26 到 30 | 26. ……一……二……三……／27. ……走吧……走吧……／28. 〔place: wild〕……好冷的夜……／29. ……别回头……／30. …………（只剩风声） |

### 8.3 同伴通用池正文

同伴本人包的战斗吠叫优先；本人包缺少某个语境的句子时，按同伴的战斗定位取下列池。

#### `bark_party_guard` 盾与护卫型（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 站我后面。／2. 〔mood: 怒〕冲我来！／3. 盾举起来了。／4. 别越过我。／5. 〔mood: 惧〕好重的一下…… |
| 6 到 10 | 6. 我顶着，你们打。／7. 〔mood: 喜〕挡住了！／8. 有人受伤了吗？／9. 〔mood: 乏〕手臂麻了。／10. 别分散！ |
| 11 到 15 | 11. 〔mood: 惧〕顶不住了，换人！／12. 往我这边靠。／13. 〔mood: 喜〕一个都没漏过去。／14. 小心侧面！／15. 我还站着。 |
| 16 到 20 | 16. 〔mood: 怒〕想过去？先过我。／17. 慢点走，我在前面。／18. 〔mood: 乏〕歇一下，盾太沉了。／19. 后面的跟紧。／20. 〔mood: 惧〕这一下我扛不住…… |
| 21 到 25 | 21. 〔mood: 喜〕好，收工。／22. 扶我一把。／23. 没人会被落下。／24. 〔when: hour >= 18 OR hour < 6〕夜里我守前半。／25. 前面有埋伏的味道。 |
| 26 到 30 | 26. 〔mood: 喜〕这一仗打得漂亮。／27. 修修盾，明天还要用。／28. 〔mood: 愁〕要是我再快一点……／29. 都在吗？点一下人。／30. 〔mood: 平〕走吧。 |

#### `bark_party_striker` 近战输出型（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 上了！／2. 〔mood: 喜〕痛快！／3. 交给我！／4. 〔mood: 怒〕找死！／5. 看我的。 |
| 6 到 10 | 6. 左边那个归我。／7. 〔mood: 惧〕它比看上去硬！／8. 再来一下！／9. 〔mood: 喜〕倒了！／10. 别抢我的！ |
| 11 到 15 | 11. 〔mood: 乏〕刀卷了。／12. 跟上，别停！／13. 〔mood: 怒〕再来一个！／14. 我受了点伤，不碍事。／15. 〔mood: 喜〕这才像样。 |
| 16 到 20 | 16. 绕到它后面！／17. 〔mood: 惧〕小心，它要发狂了！／18. 一口气拿下！／19. 〔mood: 乏〕喘口气……／20. 还有谁？ |
| 21 到 25 | 21. 〔mood: 喜〕下回让我打头阵。／22. 太慢了。／23. 〔mood: 怒〕别挡路！／24. 擦擦刀，这血有股灰味。／25. 〔when: hour >= 18 OR hour < 6〕天黑了，打起来更带劲。 |
| 26 到 30 | 26. 〔mood: 喜〕好对手！／27. 下一个在哪？／28. 〔mood: 愁〕没打尽兴。／29. 都打完了？／30. 〔mood: 平〕走吧，前面还有。 |

#### `bark_party_ranged` 远程与斥候型（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 我看见了，在{dir}。／2. 放箭！／3. 〔mood: 喜〕正中！／4. 别挡我的视线。／5. 拉开距离！ |
| 6 到 10 | 6. 〔mood: 惧〕它朝我来了！／7. 箭不多了。／8. 〔mood: 喜〕两只，一箭。／9. 高处，我去高处。／10. 〔when: hour >= 18 OR hour < 6〕太黑了，看不清。 |
| 11 到 15 | 11. 有脚印，往{dir}去了。／12. 〔mood: 怒〕别跑！／13. 掩护我，我换位置。／14. 〔mood: 乏〕手指勒破了。／15. 前面有动静，我去看看。 |
| 16 到 20 | 16. 〔mood: 喜〕跑不了它。／17. 风向不对，等一下。／18. 〔mood: 惧〕好多影子……／19. 陷阱放好了。／20. 别出声。 |
| 21 到 25 | 21. 〔mood: 喜〕清了。／22. 我捡回几支箭。／23. 〔mood: 愁〕射偏了一支。／24. 后面跟上来的那个归我。／25. 〔mood: 平〕安全，过来吧。 |
| 26 到 30 | 26. 〔mood: 惧〕远处有大家伙。／27. 我先探路。／28. 〔mood: 乏〕眼睛酸了。／29. 〔mood: 喜〕好位置！／30. 走这边，近。 |

#### `bark_party_support` 治疗、法术与契约型（30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 别动，我给你治。／2. 〔mood: 惧〕伤得太重了！／3. 撑住，马上好。／4. 〔mood: 喜〕好了，再上。／5. 让开，我要施术了。 |
| 6 到 10 | 6. 〔mood: 乏〕力气快用完了。／7. 往我身边靠。／8. 〔mood: 惧〕我护不住所有人！／9. 再给我一点时间。／10. 〔mood: 喜〕成了！ |
| 11 到 15 | 11. 小心，别被那东西碰到。／12. 〔mood: 愁〕我能做的就这些。／13. 喝药，现在！／14. 〔mood: 怒〕别逞强！／15. 先救倒下的。 |
| 16 到 20 | 16. 〔mood: 乏〕歇一歇，让我缓口气。／17. 这伤口发灰，别碰。／18. 〔mood: 喜〕都还活着，太好了。／19. 我数三下，一起动。／20. 〔mood: 惧〕法术不听使唤了…… |
| 21 到 25 | 21. 〔when: hour >= 18 OR hour < 6〕夜里我来看着伤员。／22. 绷带不够了。／23. 〔mood: 喜〕你恢复得真快。／24. 退后，这一下范围很大。／25. 〔mood: 平〕没事了。 |
| 26 到 30 | 26. 〔mood: 愁〕下回小心点，好吗？／27. 让我看看你的手。／28. 〔mood: 乏〕今天就到这里。／29. 〔mood: 惧〕有东西在吸我的力气！／30. 都好好的，走吧。 |

### 8.4 地区池正文

#### `bark_bs_tide_night` 边石镇 × 兽潮之夜（第一幕，30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 〔mood: 惧〕北门！北门来了！／2. 钟！快敲钟！／3. 〔mood: 惧〕好多狼……灰色的……／4. 孩子们进礼拜堂！／5. 〔mood: 怒〕东栅顶住！ |
| 6 到 10 | 6. 〔mood: 惧〕那是什么？那么大！／7. 民兵呢？民兵在哪？／8. 〔mood: 惧〕光啊，救救边石镇……／9. 拿草叉，拿什么都行！／10. 〔mood: 愁〕我家的屋子着了…… |
| 11 到 15 | 11. 往醉月亭跑，那边的墙结实！／12. 〔mood: 惧〕东坡的人进栅子了没有？／13. 〔mood: 怒〕跟它拼了！／14. 别挤，一个一个上楼！／15. 〔mood: 惧〕又一波！ |
| 16 到 20 | 16. 〔mood: 喜〕那个 F 级的……他挡住了！／17. 水！拿水来！／18. 〔mood: 惧〕巨像……那是巨像！／19. 老板娘呢？老板娘去哪了？／20. 〔mood: 乏〕撑住，天快亮了。 |
| 21 到 25 | 21. 〔mood: 惧〕它倒了吗？倒了吗？／22. 〔mood: 喜〕退了！它们退了！／23. 〔mood: 愁〕谁看见我男人了？／24. 伤员往礼拜堂抬！／25. 〔mood: 平〕别哭，还活着就好。 |
| 26 到 30 | 26. 〔mood: 乏〕一夜没合眼。／27. 〔mood: 喜〕边石镇还在！／28. 巨像是自己塌的吧……／29. 〔mood: 愁〕又是一口小棺材。／30. 〔when: hour < 8〕天亮了，天亮了。 |

#### `bark_wb_city_street` 瓦伦堡 × 城中街市（第二幕，30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 秤街今天又涨了。／2. 〔mood: 愁〕伯爵的病怎么样了？／3. 让开，伯爵府的马车！／4. 〔mood: 喜〕炉灰街新开了一家铁铺！／5. 主教区的钟敲得人心慌。 |
| 6 到 10 | 6. 〔mood: 惧〕泥巷那边夜里别去。／7. 听说勇者团要进城了。／8. 〔mood: 喜〕今天鱼市的鱼便宜！／9. 三位继承人，你看好哪一个？／10. 〔when: hour >= 19 OR hour < 6〕城门要关了，墙外的人进不来了。 |
| 11 到 15 | 11. 〔mood: 怒〕审判庭又抓人了。／12. 学塔那帮人整天不知道在算什么。／13. 〔mood: 乏〕码头扛了一天包。／14. 那个打退兽潮的 F 级，来城里了？／15. 〔mood: 喜〕今晚酒馆有吟游诗人唱新段子！ |
| 16 到 20 | 16. 〔mood: 惧〕墙外营地又多了人。／17. 门扉商会？没听过。／18. 〔mood: 愁〕下水道又堵了。／19. 别在主教区附近大声说话。／20. 〔mood: 平〕大城就是这样，什么人都有。 |
| 21 到 25 | 21. 〔mood: 喜〕勇者团！我看见勇者团了！／22. 公会大区今天考核。／23. 〔mood: 怒〕灰鼠的人又在收保护费。／24. 〔when: a2_count_poison_found；mood: 惧〕听说伯爵是中了毒。／25. 河港来了新船。 |
| 26 到 30 | 26. 〔mood: 愁〕粮价一天一个样。／27. 那个说自己是乌鸦的姑娘又在集上转悠。／28. 〔mood: 喜〕伯爵府发赏钱了！／29. 〔when: hour < 7〕早市开张了。／30. 〔mood: 平〕在瓦伦堡，什么都能买到，就是买不到安生。 |

#### `bark_wb_siege_wartime` 瓦伦堡 × 城下潮（第二幕，30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 〔mood: 惧〕城下全是魔物！／2. 上墙！所有能拿武器的都上墙！／3. 〔mood: 惧〕下水道里也有！／4. 关闭城门！／5. 〔mood: 怒〕守住！这是我们的城！ |
| 6 到 10 | 6. 墙外营地的人呢？放他们进来！／7. 〔mood: 惧〕河口那边破了！／8. 勇者团在东墙！／9. 〔mood: 愁〕我的铺子……／10. 往主教区跑，那里有圣光！ |
| 11 到 15 | 11. 〔mood: 惧〕地底下有东西在顶！／12. 水桶！火从码头烧过来了！／13. 〔mood: 怒〕卫兵都死哪去了！／14. 鹿角会来援了！／15. 〔mood: 喜〕打下去了！ |
| 16 到 20 | 16. 〔mood: 惧〕又一波上来了！／17. 孩子往高处送！／18. 〔mood: 乏〕箭，谁还有箭。／19. 伯爵府的兵在哪？／20. 〔mood: 喜〕门扉商会的人来了！ |
| 21 到 25 | 21. 〔mood: 惧〕城墙在晃……／22. 伤员抬去慈济院！／23. 〔mood: 怒〕跟它们拼了！／24. 〔mood: 愁〕到底死了多少人。／25. 〔mood: 喜〕它们退了！ |
| 26 到 30 | 26. 〔mood: 乏〕守住了……守住了。／27. 〔mood: 愁〕这城还能撑几回？／28. 谁打退的？说是勇者团……也有人说不是。／29. 〔mood: 平〕修墙，先修墙。／30. 〔when: hour < 8〕天亮了，数人吧。 |

#### `bark_lotha_crusade_camp` 洛萨籍圣战军征召兵 × 营地（第三幕，30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 〔mood: 愁〕想回家种地。／2. 圣战，圣战，到底打谁？／3. 〔mood: 惧〕听说荒原上的东西吃人。／4. 光与我们同在……是吧？／5. 〔mood: 乏〕又走了一天。 |
| 6 到 10 | 6. 〔mood: 愁〕家里的麦子没人收。／7. 骑士老爷说，打完就能回去。／8. 〔when: a3_holy_war_miracle；mood: 惧〕昨晚那道光……把天都照白了。／9. 〔mood: 怒〕粮又少了一半。／10. 〔when: hour >= 21 OR hour < 5〕熄火！ |
| 11 到 15 | 11. 我家人就在那边的村子里。／12. 〔when: a3_massacre_witnessed；mood: 惧〕那些人……他们手里没有武器。／13. 〔mood: 愁〕我不想烧房子。／14. 祷告吧，祷告完心里好受点。／15. 〔mood: 平〕上头说什么，我们做什么。 |
| 16 到 20 | 16. 〔mood: 惧〕听说对面有个开门的领主。／17. 〔mood: 喜〕家里来信了，娃会走路了。／18. 那个人，听说他不杀放下长枪的人。／19. 〔mood: 乏〕脚上全是泡。／20. 〔when: a3_massacre_witnessed；mood: 愁〕上回的村子……我夜里总梦见。 |
| 21 到 25 | 21. 〔mood: 怒〕凭什么让我们去送命？／22. 神父说这是光的旨意。／23. 〔mood: 惧〕别让军官听见。／24. 〔mood: 愁〕我想放下长枪。／25. 〔mood: 喜〕今天没打仗。 |
| 26 到 30 | 26. 〔mood: 平〕活着回去就行。／27. 〔mood: 惧〕灰暴要来了。／28. 他们说异端引来了灾祸。我看……不像。／29. 〔mood: 愁〕回不去了吧。／30. 〔when: hour < 6〕起来，点卯。 |

#### `bark_territory_settlers` 灰烬边境领 × 拓荒者（第三幕起，30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 新开的地，土还硬。／2. 〔mood: 喜〕我们有自己的屋子了！／3. 〔mood: 愁〕灰又刮过来了。／4. 墙再垒高一点。／5. 〔mood: 乏〕开荒累死人。 |
| 6 到 10 | 6. 〔mood: 喜〕学堂开了！／7. 领主说要修路。／8. 〔mood: 惧〕荒原那边夜里有光。／9. 〔mood: 喜〕今年头一茬麦子！／10. 〔when: hour >= 19 OR hour < 6〕灯点上，守夜的人到位。 |
| 11 到 15 | 11. 〔mood: 愁〕井水还带点灰味。／12. 净炼坊今天开炉了。／13. 〔mood: 喜〕北边来的人也住下了。／14. 〔mood: 平〕在这儿，没人问你从哪来。／15. 〔mood: 惧〕听说圣战军要打过来。 |
| 16 到 20 | 16. 〔mood: 喜〕集日！领地的第一个集日！／17. 新来的兽人一家住东边。／18. 〔mood: 乏〕今天又砍了二十棵树。／19. 〔mood: 愁〕官员说要等批复。／20. 〔mood: 喜〕孩子会写自己的名字了。 |
| 21 到 25 | 21. 〔mood: 惧〕灰烬防线那边打起来了吗？／22. 拾遗营今天捡回好东西。／23. 〔mood: 平〕日子是一天一天过出来的。／24. 〔mood: 喜〕领主回来了！／25. 〔mood: 愁〕冬天的柴够不够？ |
| 26 到 30 | 26. 〔mood: 喜〕这地方，以后会是座城。／27. 〔mood: 乏〕挖渠挖了三天。／28. 别乱扔灰晶，交给净炼坊。／29. 〔mood: 惧〕门……那边又开了一扇门？／30. 〔when: hour < 6〕上工了。 |

#### `bark_holysee_pilgrims` 教国 × 朝圣者（第四幕，30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 光照着圣城。／2. 〔mood: 喜〕终于到了！／3. 〔mood: 乏〕走了三个月。／4. 赦罪状，多少钱一张？／5. 〔mood: 愁〕我是来为儿子祈祷的。 |
| 6 到 10 | 6. 大圣堂的屋顶在发光。／7. 〔mood: 惧〕审判庭的人在街上。／8. 〔mood: 喜〕我摸到了圣柱！／9. 光币换好了吗？／10. 〔when: hour < 7〕晨祷的钟响了。 |
| 11 到 15 | 11. 〔mood: 愁〕巡礼的人越来越少了。／12. 听说北边出了个异端之国。／13. 〔mood: 惧〕别提那个名字。／14. 圣水，一瓶圣水。／15. 〔mood: 平〕光不急。 |
| 16 到 20 | 16. 〔mood: 喜〕教皇今天出来了！／17. 〔mood: 乏〕排了一天，没轮上。／18. 〔mood: 惧〕巡礼坑那边……别去。／19. 枢机的马车过来了，让开。／20. 〔mood: 愁〕圣水很贵，可是灵。 |
| 21 到 25 | 21. 〔mood: 喜〕光与我们同在！／22. 〔mood: 怒〕他们收的钱比去年多了。／23. 七钟修院在发粥。／24. 〔mood: 惧〕听说勇者……不，没什么。／25. 〔when: hour >= 19 OR hour < 6〕晚祷了。 |
| 26 到 30 | 26. 〔mood: 平〕祷告完，回家。／27. 〔mood: 愁〕光为什么不回应我？／28. 碑庭不让进。／29. 〔mood: 喜〕我要把圣徽带回去给孙子。／30. 〔mood: 惧〕那个异端之王，真有人见过吗？ |

#### `bark_grantia_street` 帝国 × 城镇与斗场（第四幕，30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 剑冠在上。／2. 〔mood: 喜〕今天斗场有好戏！／3. 〔mood: 怒〕押错了，全输了。／4. 军团又在招人。／5. 〔mood: 乏〕工坊赶军械，三天没睡了。 |
| 6 到 10 | 6. 〔mood: 惧〕灰档的人在盯着。／7. 陛下只说一个字："拔剑。"／8. 〔mood: 喜〕冠军赢了！／9. 〔when: hour >= 19 OR hour < 6〕面摊还开着吗？／10. 〔mood: 愁〕前线又来了伤兵。 |
| 11 到 15 | 11. 断剑墙上又多了几个名字。／12. 〔mood: 怒〕那场比赛有猫腻。／13. 〔mood: 喜〕剑银到手！／14. 学城那帮人在吵什么星星。／15. 〔mood: 平〕在帝国，能打的人说话。 |
| 16 到 20 | 16. 〔mood: 惧〕宰相派的人和皇女派的人又吵起来了。／17. 〔mood: 喜〕老铁匠今天开炉，去看看！／18. 〔mood: 乏〕路又在修。／19. 〔mood: 愁〕旧贵族又涨了地租。／20. 听说北边有个 F 级的国主。 |
| 21 到 25 | 21. 〔mood: 喜〕强者之宴！今年谁去？／22. 〔mood: 怒〕假赛！一定是假赛！／23. 〔mood: 惧〕折剑原那边的刃……是红的。／24. 第七军团回来了。／25. 〔when: hour < 7〕号角响了，军团出操。 |
| 26 到 30 | 26. 〔mood: 平〕输了就认，帝国的规矩。／27. 〔mood: 喜〕汤要趁热！／28. 〔mood: 愁〕又要征丁了。／29. 〔mood: 惧〕斗场地下……别问。／30. 〔mood: 喜〕剑帝万岁！ |

#### `bark_mercato_exchange` 同盟金湾 × 交易所与港口（第四幕，30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 钟响之前都是谣言！／2. 〔mood: 喜〕涨了！涨了！／3. 〔mood: 惧〕跌了……全跌了……／4. 汇票，兑现！／5. 〔mood: 乏〕从开市站到现在。 |
| 6 到 10 | 6. 湾金是湾金，别的都得打折。／7. 〔mood: 怒〕谁在砸盘？／8. 〔mood: 喜〕船到了，满载！／9. 〔when: hour < 8〕开市钟！／10. 〔mood: 愁〕契约到期了，还不上。 |
| 11 到 15 | 11. 金冠商行又在收铺子。／12. 〔mood: 惧〕听说有人在挤兑。／13. 〔mood: 喜〕这批香料翻了三倍！／14. 签字之前想清楚。／15. 〔mood: 平〕一切都有价格。 |
| 16 到 20 | 16. 〔mood: 惧〕庭外之国的门票……能信吗？／17. 码头工又罢工了。／18. 〔mood: 喜〕今晚请客！／19. 〔mood: 怒〕七秤会又在定规矩。／20. 〔mood: 乏〕算了一天账，眼花了。 |
| 21 到 25 | 21. 〔mood: 愁〕港口的税又涨了。／22. 铃路会的车队出发了。／23. 〔mood: 惧〕梅尔卡的神殿里，钟自己响了。／24. 〔mood: 喜〕押对了！／25. 〔when: hour >= 18〕收市了，明天再赌。 |
| 26 到 30 | 26. 〔mood: 平〕钱是纸，纸是信。／27. 〔mood: 惧〕有人违约，铭录上要多一个失信的标签了。／28. 〔mood: 喜〕新航线开了！／29. 〔mood: 愁〕又一家商号倒了。／30. 下注要趁早。 |

#### `bark_silva_elves` 希尔瓦 × 精灵（第四幕，30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 林子在听。／2. 〔mood: 平〕外来的人，脚步放轻。／3. 〔mood: 愁〕北边的树又枯了一片。／4. 灵泉今天很静。／5. 〔mood: 惧〕斧头的声音……谁在砍树？ |
| 6 到 10 | 6. 〔mood: 喜〕新芽出来了。／7. 树记得每一道斧痕。／8. 〔mood: 怒〕人族的契约，一纸空文。／9. 〔when: hour >= 19 OR hour < 6〕月亮出来了，该唱了。／10. 〔mood: 愁〕年轻人都想出去。 |
| 11 到 15 | 11. 首座在议事。／12. 〔mood: 惧〕灵泉浑了……／13. 〔mood: 喜〕鹿回来了。／14. 不要摘那朵花。／15. 〔mood: 平〕一百年，不算久。 |
| 16 到 20 | 16. 〔mood: 怒〕兽人的事，与我们何干。／17. 〔mood: 愁〕枯环又往里走了一步。／18. 这首歌很长。／19. 〔mood: 喜〕林缘集市今天开了。／20. 〔mood: 惧〕根渊那边有响动。 |
| 21 到 25 | 21. 承诺，按年算。／22. 〔mood: 平〕风往西吹。／23. 〔mood: 愁〕老树倒了一棵。／24. 〔mood: 喜〕外来的人带来了好消息？／25. 〔when: hour < 6〕晨露最干净。 |
| 26 到 30 | 26. 〔mood: 惧〕他们说北边有个开门的人。／27. 弓弦换新的了。／28. 〔mood: 喜〕今天的光透过叶子，很好看。／29. 〔mood: 怒〕别踩苔。／30. 〔mood: 平〕林子会自己长回来。 |

#### `bark_windfang_camp` 风牙草原 × 部族营地（第四幕，30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 祖灵在上。／2. 〔mood: 喜〕畜群回来了！／3. 〔mood: 愁〕冬牧场的草不够。／4. 风往哪边吹？／5. 〔mood: 怒〕战首派的人又来挑衅了。 |
| 6 到 10 | 6. 〔mood: 惧〕老兽王病了。／7. 毡市今天热闹。／8. 〔mood: 喜〕好马！／9. 〔when: hour >= 19 OR hour < 6〕篝火边讲故事了。／10. 〔mood: 平〕草原不需要那么多王。 |
| 11 到 15 | 11. 〔when: a4_shiya_father_truth；mood: 怒〕用加护打决斗？那是假的！／12. 〔mood: 喜〕今天猎到一头大角兽。／13. 〔mood: 愁〕又有部落往南迁了。／14. 疾耳部的信使来了。／15. 〔mood: 惧〕蝗骨原那边不能去。 |
| 16 到 20 | 16. 〔mood: 喜〕扳手腕！谁来？／17. 大萨满在听风。／18. 〔mood: 乏〕放了一天的羊。／19. 〔mood: 怒〕人族的商人又压价。／20. 〔mood: 平〕输了的人，往往最忠心。 |
| 21 到 25 | 21. 〔mood: 喜〕奶酒！／22. 〔mood: 惧〕红帐营的人在磨刀。／23. 祖灵冢今晚有人守。／24. 〔mood: 愁〕孩子们都去哪了？／25. 〔when: hour < 6〕起来，赶畜群。 |
| 26 到 30 | 26. 〔mood: 喜〕听说有个狼族的姑娘回来了。／27. 〔mood: 平〕草长一季，人活一世。／28. 〔mood: 怒〕谁偷了我的马？／29. 〔mood: 喜〕今年羊羔多！／30. 风会带路。 |

#### `bark_night_market` 夜境 × 黯冠城与夜市（第四幕，30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 夜市开了。／2. 〔mood: 喜〕新鲜的夜铁！／3. 〔mood: 愁〕王座还空着。／4. 黑铁钱只在这儿管用。／5. 〔mood: 惧〕迎王派的人来了。 |
| 6 到 10 | 6. 〔mood: 平〕我们记得。／7. 〔mood: 怒〕人族都说我们是魔王的子民。／8. 〔mood: 喜〕今晚的汤里有肉。／9. 〔when: hour >= 6 AND hour < 18〕白天，我们只是记得。／10. 〔mood: 乏〕矿里干了一整夜。 |
| 11 到 15 | 11. 〔mood: 惧〕王胎渊那边又在冒黑气。／12. 夜纱，上好的夜纱。／13. 〔mood: 愁〕隶民的日子什么时候是个头。／14. 〔mood: 喜〕试锋谷今天有比试！／15. 鳞书记来了，说话小心。 |
| 16 到 20 | 16. 〔mood: 怒〕新王来了又怎样，汤还是得有人煮。／17. 〔mood: 惧〕别在夜市提魔王。／18. 〔mood: 平〕藏着的刀，就当它是钝的。／19. 〔mood: 喜〕夜后今天出宫了！／20. 〔mood: 愁〕又有人家搬走了。 |
| 21 到 25 | 21. 〔mood: 喜〕好酒！／22. 〔mood: 惧〕灰档的密探混进来了。／23. 角位高的人打仗，角位低的人记账。／24. 〔mood: 乏〕守夜到天亮，又守天亮到天黑。／25. 〔mood: 怒〕别碰我的摊子！ |
| 26 到 30 | 26. 〔mood: 平〕王座空着，比坐上一个怪物好。／27. 〔mood: 喜〕有外人来夜市了！／28. 〔mood: 惧〕渊在吸气。／29. 〔mood: 愁〕葡萄园荒了。／30. 夜里我们看得见。 |

#### `bark_outer_nation_folk` 庭外之国 × 国民（第四幕起，30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 〔mood: 喜〕门路又开了一条！／2. 人簿上写着我的名字。／3. 〔mood: 平〕在这儿，没人问你拜谁。／4. 〔mood: 惧〕听说教国宣布我们是异端之国。／5. 界银，一银一张门券。 |
| 6 到 10 | 6. 〔mood: 喜〕学堂又收了一批孩子。／7. 〔mood: 愁〕议会又吵到半夜。／8. 我们自己定的规矩，自己守。／9. 〔mood: 乏〕守门站值了一夜。／10. 〔when: hour >= 19 OR hour < 6〕门标的灯亮了。 |
| 11 到 15 | 11. 〔mood: 喜〕那个 F 级的国主今天在集上！／12. 〔mood: 惧〕边境又有探子。／13. 〔mood: 平〕不靠神，也能过。／14. 〔mood: 喜〕遗民也能抬头走路了。／15. 〔mood: 愁〕粮够过冬吗？ |
| 16 到 20 | 16. 〔mood: 怒〕他们叫我们魔王的先驱？／17. 新来的精灵在种树。／18. 〔mood: 喜〕夜境的商队到了！／19. 〔mood: 乏〕修门路修了一个月。／20. 〔mood: 平〕没有神管，也没有神护。自己护自己。 |
| 21 到 25 | 21. 〔mood: 惧〕要打仗了吗？／22. 〔mood: 喜〕今天投票了！／23. 〔mood: 愁〕官员又要等国主批复。／24. 人簿官说，每个人都记得下。／25. 〔when: hour < 6〕上工了。 |
| 26 到 30 | 26. 〔mood: 喜〕这国家是我们自己的。／27. 〔mood: 惧〕门……真的没事吗？／28. 〔mood: 平〕各族一张桌子吃饭，挺好。／29. 〔mood: 愁〕会盟会成吗？／30. 〔mood: 喜〕庭外之国，万岁！ |

#### `bark_alliance_front` 诸族联军 × 战线（第五幕，30 句）

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 〔mood: 惧〕魔王之军来了！／2. 守住这一段！／3. 〔mood: 怒〕各族一起，杀！／4. 精灵弓手在左翼！／5. 〔mood: 惧〕灰潮……好大的灰潮！ |
| 6 到 10 | 6. 矮人的炮准备好了！／7. 〔mood: 喜〕兽人骑兵冲进去了！／8. 〔mood: 惧〕北线……北线怎么样了？／9. 别等国主，我们自己守！／10. 〔mood: 乏〕守了三天三夜。 |
| 11 到 15 | 11. 〔mood: 喜〕众门环的节点建好了！／12. 〔mood: 愁〕伤兵太多了，医帐装不下。／13. 〔mood: 怒〕他们说我们是魔王的先驱，可魔王在对面！／14. 夜魔的斥候回来了。／15. 〔mood: 惧〕那东西……它在看我们。 |
| 16 到 20 | 16. 〔mood: 喜〕守住了！这一段守住了！／17. 〔mood: 平〕神不来，我们来。／18. 〔mood: 惧〕天上……天上那是什么？／19. 补给车到了！／20. 〔mood: 愁〕又少了一队。 |
| 21 到 25 | 21. 〔mood: 怒〕为了家里人！为了所有人！／22. 〔mood: 喜〕帝国的军团来援了！／23. 〔mood: 乏〕眼睛都睁不开了，还得守。／24. 〔mood: 惧〕门……门在震。／25. 换防，换防！ |
| 26 到 30 | 26. 〔mood: 喜〕打退了！／27. 〔mood: 平〕不管是哪一族，倒下的都是人。／28. 〔mood: 愁〕这仗什么时候是个头。／29. 〔when: a5_purify_success；mood: 喜〕众生的办法……有用！／30. 〔when: hour < 6〕天亮了，我们还在。 |

#### `bark_epilogue_festival` 后日谈 × 庆典与日常（终章，30 句）

终章的街谈按结局（`ending`）分句；表中第 1 到 15 句不带结局条件，第 16 到 30 句各带一个结局条件。

| 序 | 句 |
| --- | --- |
| 1 到 5 | 1. 〔mood: 喜〕今天热闹！／2. 好久没这么安生了。／3. 〔mood: 愁〕要是他们也能看到就好了。／4. 来，喝一杯。／5. 〔mood: 喜〕孩子们又在唱那首歌了。 |
| 6 到 10 | 6. 〔mood: 平〕日子还得过。／7. 那年的事，你还记得吗？／8. 〔mood: 乏〕庆了一夜，累了。／9. 〔mood: 喜〕新铺子开张了！／10. 〔when: hour >= 19 OR hour < 6〕篝火点起来了。 |
| 11 到 15 | 11. 〔mood: 愁〕走了的人，名字都刻在墙上了。／12. 〔mood: 喜〕今年的麦子收得好。／13. 〔mood: 平〕神的事，神去管；我们的事，我们管。／14. 〔mood: 喜〕再来一曲！／15. 〔mood: 平〕明天照常上工。 |
| 16 到 20 | 16. 〔when: ending == release〕没有神管了，也没塌。／17. 〔when: ending == release〕碑上什么都没写，可我们知道。／18. 〔when: ending == release_unfinished〕还有好多事没做完，慢慢来。／19. 〔when: ending == new_god〕听说上面换了一位。……日子是不是更好了？／20. 〔when: ending == new_god〕新神看着我们呢，说话小心。 |
| 21 到 25 | 21. 〔when: ending == rule_eluen〕光照着一切。……一切。／22. 〔when: ending == rule_valda〕又要打仗了，哪年不打？／23. 〔when: ending == rule_merca〕什么都有价钱，连喘气都有。／24. 〔when: ending == rule_sylvie〕林子长回来了，人少了。／25. 〔when: ending == rule_moira〕每件事都被记下来了，连这一句。 |
| 26 到 30 | 26. 〔when: ending == janu_restored〕门都开了，到处都是门。／27. 〔when: ending == janu_restored〕门的那一位回来了……她会放手吗？／28. 〔when: ending == reclaim〕好像……什么都重来了一遍。／29. 〔when: ending == reclaim〕我梦见过你，在很久以前。／30. 〔mood: 喜〕不管怎么说，今天是个好日子。 |

## 9. 有名人物台词包清单

### 9.1 读法

一人一行，全作 365 名有名人物加 6 位女神。列的含义：

| 列 | 含义 |
| --- | --- |
| 台词包 | `ln_<人物 ID>`，与人物目录、人设卡的 ID 一致 |
| 首登 | 首次登场的幕（"一"到"六"）；只以来信或传闻出现的那一幕不算 |
| 类别 | 第 1.5 节的说话者类别：G 女神、C 主要同伴、F 随行同伴、K 核心 L1、N 其余有名；"C（第一幕按 K）"表示入队前按核心写 |
| 口吻要点 | 节奏、语气与说话指纹；有引号的是人设卡或人物目录的原句，分幕文件把它作为对应槽的第一句 |
| 专属话题 | 本人包必须提供的个人话题与秘密话题；`person_<id>` 是地区话题，通用层写公开评价，本人包可不写 |
| 最低量 | 第 1.5 节的类别与句数；必备槽位以第 1.5 节为准 |
| 按幕变体 | 需要 `acts.<幕>` 覆盖的幕；"无"表示人物状态在一幕之内，差异用 `when` 写 |
| 锚点与人设出处 | 口吻、秘密与原句的出处：角色设定集为 [characters.md](../../30_story/characters.md)；人物（一）为 [catalog_characters_lotha.md](catalog_characters_lotha.md)；人物（二）为 [catalog_characters_continent.md](catalog_characters_continent.md)；各行后面的数字是节号 |
| 批次 | 第 10 节 |

每行的禁区以台账第 8 节为准，分幕文件的包头逐人抄录。

### 9.2 女神

| 台词包 | 名 | 首登 | 类别 | 口吻要点 | 专属话题 | 最低量 | 按幕变体 | 锚点与人设出处 | 批次 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ln_eluen` | 艾琉恩 | 序 | G | 精确、对称、优雅；"规格""合格""瑕疵"；"这不合规格。""光不会说谎。" | `topic.revelation_*`、`topic.court_*`、序章九话题 | G 250 | prologue、act3 到 act6 | 诸神正典 [pantheon.md](../../20_world/pantheon.md)；角色设定集 1.2、1.3；女神目录第 4、6、10 节 | M1 起，M3 补足 |
| `ln_valda` | 瓦尔妲 | 序 | G | 粗豪爱笑、打架比方；"新肉"；几乎不说谎，只省略 | `topic.revelation_*`、`topic.court_*`、序章九话题 | G 250 | prologue、act3 到 act6 | 诸神正典 [pantheon.md](../../20_world/pantheon.md)；角色设定集 1.2、1.3；女神目录第 4、6、10 节 | M1 起，M3 补足 |
| `ln_merca` | 梅尔卡 | 序 | G | 甜、快、句句交易；"亲爱的客人""这笔买卖划算" | `self_merca_coin`、`self_merca_ledger`、`quest_merca_offering`、`place_merca_shrine`、`topic.revelation_*`、`topic.court_*` | G 250 | prologue、act1 到 act6 | 诸神正典 [pantheon.md](../../20_world/pantheon.md)；角色设定集 1.2、1.3；女神目录第 4、6、10 节 | M1 起，M3 补足 |
| `ln_sylvie` | 希尔薇 | 序 | G | 轻、慢、短句、季节比喻；很少正面回答 | `topic.revelation_*`、`topic.court_*`、序章九话题 | G 250 | prologue、act4 到 act6 | 诸神正典 [pantheon.md](../../20_world/pantheon.md)；角色设定集 1.2、1.3；女神目录第 4、6、10 节 | M1 起，M3 补足 |
| `ln_moira` | 莫伊拉 | 序 | G | 旁白式、调侃、反问；"有趣""这一章"；可擦边第四面墙 | `topic.revelation_*`、`topic.court_*`、序章九话题 | G 250 | prologue、act3 到 act6 | 诸神正典 [pantheon.md](../../20_world/pantheon.md)；角色设定集 1.2、1.3；女神目录第 4、6、10 节 | M1 起，M3 补足 |
| `ln_janu` | 雅努 | 序（声音） | G | 温柔带笑、谜语、长停顿；"你来了""门总会开的" | `self_janu_name`、`self_janu_caught`、`place_dream_door`、`self_janu_wish`、`person_ash`、`self_janu_why_me`、`self_janu_intent` | G 250 | prologue、act1 到 act6 | 诸神正典 [pantheon.md](../../20_world/pantheon.md)；角色设定集 1.2、1.3；女神目录第 4、6、10 节 | M1 起，M3 补足 |

### 9.3 序章与第一幕首登（M1，41 包）

| 台词包 | 名 | 首登 | 类别 | 口吻要点 | 专属话题 | 最低量 | 按幕变体 | 锚点与人设出处 | 批次 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ln_yeyu` | 夜羽 | 一 | C | 短句、命令式，每三句一句吐槽；"门把手。""信要送到。""啧。"；千年前的旧词 | `self_yeyu_wait`、`self_yeyu_bag`、`self_yeyu_old_words`、`self_yeyu_shinies`、`self_yeyu_door`、`person_yeyu` | C 200 | act1 到 act6 | 角色设定集 3.1；人物（一）2.1 | M1 |
| `ln_ash` | 守门人阿什 | 一 | K | 慢、长停顿、抄写员比喻；"还不是时候。""门的孩子。"；称女神们"她们" | `self_ash_writing`、`self_ash_name`、`person_ash` | K 80 | act1 到 act6 | 角色设定集 3.9；人物（一）2.1 | M1 |
| `ln_shiya` | 希雅 | 一 | C | 短而直接，不会拐弯，偶尔夹部族说法，比如'祖灵在上'；"我闻得出来。" | `self_shiya_family`、`self_shiya_nose`、`secret_shiya_reading`、`person_shiya` | C 200 | act1 到 act5 | 角色设定集 3.2；人物（一）2.1 | M1 |
| `ln_ron` | 罗恩 | 一 | C | 平时碎碎念，长句吐槽，紧张时语速极快；"不可能。" | `self_ron_mother`、`self_ron_amulets`、`secret_ron_wolf`、`secret_ron_first_squad`（第三幕）、`person_ron` | C 200 | act1 到 act5 | 角色设定集 3.3；人物（一）2.1 | M1 |
| `ln_nera` | 奈拉 | 一 | C（第一幕按 K） | 甜而快，爱反问，谈价时放慢；"这得算算。" | `self_nera_ledger`、`self_nera_coin`、`person_nera` | 第一幕 K 80；入队那一幕起补足 C 200 | act1 到 act5 | 角色设定集 3.4；人物（一）2.1 | M1 |
| `ln_oola` | 欧拉婆婆 | 一 | C | 说话慢，带俚语和草药比喻，常骂人'小崽子'；"草不会骗人。人会。" | `self_oola_herbs`、`secret_oola_children`、`secret_oola_leafroad`、`person_oola` | C 200 | act1 到 act4、act6 | 角色设定集 3.5；人物（一）2.1 | M1 |
| `ln_cassian` | 卡西安神父 | 一 | C（第一幕按 K） | 句式工整，爱引经文，紧张时反复确认：是这样的，对吧？；"光会看见的。" | `self_cassian_reports`、`self_cassian_scripture`、`person_cassian` | 第一幕 K 80；入队那一幕起补足 C 200 | act1 到 act6 | 角色设定集 3.6；人物（一）2.1 | M1 |
| `ln_martha` | 玛莎 | 一 | C（第一幕按 K） | 短句、指令式、带笑，话题一碰到过去就转到吃饭；"先吃饭。" | `self_martha_kitchen`、`self_martha_bell`、`secret_martha_blade`、`person_martha` | 第一幕 K 80；入队那一幕起补足 C 200 | act1 到 act3、act5 | 角色设定集 3.7；人物（一）2.1 | M1 |
| `ln_bron` | 老布伦 | 一 | K | 粗声粗气，清醒时简短，否认自己说过醉话；"登记簿上写什么，就是什么。" | `self_bron_ledger`、`self_bron_arm`、`secret_bron_mark`、`person_bron` | K 80 | act1 到 act3、act5、act6 | 角色设定集 3.8；人物（一）2.1 | M1 |
| `ln_moss` | 代官莫斯 | 一 | K | 表面客气，句句先算自己的风险，把麻烦推给最弱、最没背景的人；"这事得按规矩来。" | `self_moss_duty`、`secret_moss_crystal`、`person_moss` | K 80 | act1、act2 | 人物（一）2.1 | M1 |
| `ln_lina` | 莉娜 | 一 | N | 说话快，爱加'好可爱''好厉害'，见到怪事先惊叫，再找理由，再到处讲；"好厉害！" | `self_lina_wallenburg`、`person_lina` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_hock` | 侯克 | 一 | N | 只回答问对了的问题，不说谎，也不主动；"记录上是这么写的。" | `self_hock_archive`、`secret_hock_box`、`person_hock` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_isa` | 伊莎修女 | 一 | N | 说话轻，常常欲言又止，不会主动反对卡西安神父；"愿光照着您。" | `self_isa_children`、`secret_isa_noi`、`person_isa` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_toma` | 托马 | 一 | N | 默认不说话，只嗯一声，给他好酒或尊重才开口；"嗯？" | `self_toma_bell`、`secret_toma_watch`、`person_toma` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_bertha` | 贝莎 | 一 | N | 什么都往光的奇迹或邪术上扯，说话急，爱压低声音讲吓人的事；"光保佑！" | `self_bertha_toby`、`person_bertha` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_greta` | 格蕾塔 | 一 | N | 凡事先护孩子，会请人帮忙，但不会求第二次；"孩子们还等着吃饭呢。" | `self_greta_children`、`person_greta` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_noi` | 诺伊 | 一 | N | 不主动说话，说话很短，盯着人看；"……" | `secret_noi_mark`、`self_noi_tess`、`person_noi` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_tess` | 苔丝 | 一 | N | 说话像唱歌，想到什么说什么，爱唱童谣；"门开了，门开了～" | `self_tess_song`、`person_tess` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_barga` | 巴尔加 | 一 | N | 暴躁，嗓门大，看到超凡的事先挑毛病：刃角不对，你是蛮力；"偷工减料的东西，我不碰。" | `self_barga_sword`、`secret_barga_marks`、`person_barga` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_gaspar` | 加斯帕 | 一 | N | 粗声大气，对兽人的偏见只会被亲眼所见改变；"干活！" | `self_gaspar_workers`、`secret_gaspar_brother`、`person_gaspar` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_nick` | 尼克 | 一 | N | 话少，一紧张就结巴；"嗯……" | `self_nick_lisa`、`person_nick` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_gorn` | 葛恩 | 一 | N | 话少，讲规矩，决定了就不回头；"规矩就是规矩。" | `self_gorn_pact`、`secret_gorn_leg`、`person_gorn` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_ako` | 阿柯 | 一 | N | 说话冲，爱逞强，被冤枉就跑；"我才不是小孩！" | `self_ako_grownup`、`secret_ako_witness`、`person_ako` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_boro` | 博罗 | 一 | N | 嗓门大，三句话就要动手，被扳手腕打赢后无条件尊重对方；"来，扳一把！" | `self_boro_armwrestle`、`person_boro` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_barto` | 巴托 | 一 | N | 说话简短，带着疲惫，只在有退路时站出来；"别惹事。" | `self_barto_militia`、`secret_barto_tax`、`person_barto` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_jed` | 杰德 | 一 | N | 嘴甜，爱奉承，被问到失窃就把话头引到别人身上；"哎呀，好说好说。" | `secret_jed_debt`、`person_jed` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_vick` | 维克 | 一 | N | 说话斯文，爱用公文腔，自保第一，被吓住就会出卖别人；"按章程办。" | `self_vick_chapter`、`secret_vick_ledger`、`person_vick` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_seg_oneeye` | 瑟格"独眼" | 一 | N | 狠、讲规矩、恨领主、护手下；强者为尊，团规不杀平民 | `self_seg_oneeye_oldwatch`、`secret_seg_oneeye_letters`、`person_seg_oneeye` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_viro` | 薇罗 | 一 | N | 冷淡，话里有话，向出价最高者靠拢；"押多少？" | `self_viro_dice`、`secret_viro_pact`、`person_viro` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_popo` | 波波 | 一 | N | 话多，给一切标价；"这个我出六个铜板！" | `self_popo_prices`、`person_popo` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_owen` | 欧文 | 一 | N | 说话直，满肚子怨气；"这世道！" | `self_owen_caravan`、`secret_owen_seal`、`person_owen` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_dora` | 朵拉 | 一 | N | 兴奋地添油加醋，数字随口乘以五；"真的真的！" | `self_dora_singer`、`person_dora` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_ed` | 埃德 | 一 | N | 一切怪事都解释成鬼，爱讲鬼故事；"夜里别往坡上去。" | `self_ed_ghosts`、`person_ed` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_ped` | 佩德 | 一 | N | 说话小心，怕官；"新出炉的！" | `self_ped_bread`、`person_ped` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_lisa` | 莉莎 | 一 | N | 温柔，只向信任的人求助一次；"嗯，好。" | `self_lisa_bundle`、`person_lisa` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_dris` | 德里斯 | 一 | F | 一切都解释为'我们打残了''运气'，输了也不认，只会别扭地尊敬；"那是我们打残的。" | `self_dris_rank`、`secret_dris_ron_plan`、`person_dris` | F 70 | act1 到 act3 | 人物（一）2.1 | M1 |
| `ln_simon` | 西蒙 | 一 | N | 用常识把一切磨平；"哪有那种人。" | `self_simon_wheat`、`person_simon` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_marg` | 玛格 | 一 | N | 健谈，爱加真细节：衣裳、气味、时辰；"我跟你讲，那衣裳上……" | `self_marg_laundry`、`person_marg` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M1 |
| `ln_ulf_lange` | 乌尔夫·兰格 | 一 | N | 指纹句：马不认得你是几级，它只认得你给不给燕麦。 | `self_ulf_lange_horses`、`secret_ulf_lange_letters`、`person_ulf_lange` | N 30 | 无（状态差异用 when） | 人物（一）3.1 | M1 |
| `ln_knut_naumann` | 克努特·瑙曼 | 一 | N | 指纹句：刀钝了别怪铁，怪你砍了不该砍的东西。 | `self_knut_naumann_repair`、`secret_knut_naumann_greystone`、`person_knut_naumann` | N 30 | 无（状态差异用 when） | 人物（一）3.1 | M1 |
| `ln_kas_ropebridge` | 卡斯 | 一 | N | 指纹句：今天过去九个，回来七个。你是第十个。 | `self_kas_ropebridge_count`、`secret_kas_ropebridge_father`、`person_kas_ropebridge` | N 30 | 无（状态差异用 when） | 人物（一）3.4 | M1 |

### 9.4 第二幕首登（M2，101 包）

| 台词包 | 名 | 首登 | 类别 | 口吻要点 | 专属话题 | 最低量 | 按幕变体 | 锚点与人设出处 | 批次 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ln_adalbert` | 阿达尔贝特·冯·埃尔茨 | 二 | N | 伯爵府书记处的公文腔；本人第二幕才露面 | `self_adalbert`、`person_adalbert` | N 30 | 无（状态差异用 when） | 人物（一）2.1 | M2 |
| `ln_selene` | 赛琳 | 二 | C | 审讯式提问，礼貌而冰冷；"光不会说谎。""请如实回答。" | `self_selene`、`person_selene` | C 200 | act2 到 act6 | 角色设定集 4.1；人物（一）2.2 | M2 |
| `ln_anselm` | 安瑟姆主教 | 二 | N | 回避正面冲突，说话圆，爱讲体面 | `self_anselm`、`person_anselm` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_dietrich` | 迪特里希·莱默 | 二 | N | 伪证者：话说得太圆，被追问就重复同一句 | `self_dietrich`、`person_dietrich` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_agnes` | 艾格尼丝修女 | 二 | N | 直，先问孩子吃饱没有 | `self_agnes`、`person_agnes` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_krause` | 奥托·克劳泽 | 二 | N | 嗓门大，公开维护规章，私下按"实绩认定"开后门 | `self_krause`、`person_krause` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_reynard` | 雷纳德"金狮" | 二 | N | 讲排场，"金狮"名号不离口；被打脸后私下请教 | `self_reynard`、`person_reynard` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_liese` | 丽泽 | 二 | N | 认真爱八卦，张口就是记录上的数字 | `self_liese`、`person_liese` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_hagen` | 哈根·施泰因 | 二 | N | 城防军老将：短句、军令腔、护着伤残老兵 | `self_hagen`、`person_hagen` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_heralda` | 赫拉妲"赤鬃" | 二 | N | 红沙场决斗者：直、狠、看不起不敢应战的人 | `self_heralda`、`person_heralda` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_bruna` | 布鲁娜·铁契 | 二 | N | 矮人担保人：数字精确，"担保就是把名字押上" | `self_bruna`、`person_bruna` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_cyril` | 西里尔·韦恩 | 二 | N | 金冠商行代表：客气的报价腔，句句有条件 | `self_cyril`、`person_cyril` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_haber` | 奥古斯特·哈伯 | 二 | N | 粮盐大户：慢条斯理，凡事先问"这一斗值多少" | `self_haber`、`person_haber` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_gregor` | 格雷戈尔·拉思 | 二 | N | 鹿角会首领：猎人话少，承诺只说一次 | `self_gregor`、`person_gregor` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_baishan` | 白杉 | 二 | N | 鹿族兽人医者：轻声，借动物的异样说病 | `self_baishan`、`person_baishan` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_hildegard` | 希尔德加德·莱希 | 二 | N | 学院铭录学者：严谨、爱纠正用词、对仪器比对人热情 | `self_hildegard`、`person_hildegard` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_jonas` | 约纳斯·克莱因 | 二 | N | 热情较真，口无遮拦；"年份对不上！" | `self_jonas`、`person_jonas` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_renata` | 蕾娜塔 | 二 | N | 每周一句的传话人：只说一句，像谶语，不解释 | `self_renata`、`person_renata` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_dela` | 黛拉"灯芯" | 二 | N | 半身人鼠道向导："灯芯"的口气，价钱按风险 | `self_dela`、`person_dela` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_emil` | 埃米尔·霍夫曼 | 二 | K | 指纹句：我只是开药的人。药，是会说话的。 | `self_emil`、`secret_emil`、`person_emil` | K 80 | act2、act3 | 人物（一）2.2 | M2 |
| `ln_fiona` | 菲奥娜 | 二 | N | 门民血统的少女：怯、小声、记得关押处的细节 | `self_fiona`、`person_fiona` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_rudolf` | 鲁道夫 | 二 | N | 伯爵府书记：谨慎，凡事"草稿上写着" | `self_rudolf`、`person_rudolf` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_fynn` | 芬恩·哈罗 | 二 | N | 夸张押韵，"听好了，这可是真事！" | `self_fynn`、`person_fynn` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_werner` | 维尔纳·布克 | 二 | N | 旧哨村村长：务实、爱抱怨"那你来当村长" | `self_werner`、`person_werner` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_maeve` | 梅芙 | 二 | N | 遗民领头人：沉稳，只对信得过的人说"开门的母亲" | `self_maeve`、`person_maeve` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_karl` | 卡尔·贝克 | 二 | N | 认死理，盘问没完；"站住，例行检查。" | `self_karl`、`person_karl` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_pia` | 皮娅 | 二 | N | 机灵话多，"船家爷爷说的！" | `self_pia`、`person_pia` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_irma` | 伊尔玛·门肯 | 二 | N | 账目线索人：精明，句子里藏数字 | `self_irma`、`person_irma` | N 30 | 无（状态差异用 when） | 人物（一）2.2 | M2 |
| `ln_edric` | 艾德里克 | 二 | N | 慢、正式，引家训与教规；"这是规矩。" | `self_edric`、`person_edric` | N 30 | act2、act3 | 角色设定集 4.9；人物（一）2.2 | M2 |
| `ln_cecilia` | 塞西莉亚 | 二 | N | 快、直接、常打断；"成本呢？" | `self_cecilia`、`person_cecilia` | N 30 | act2、act3 | 角色设定集 4.9；人物（一）2.2 | M2 |
| `ln_lucas` | 卢卡斯 | 二 | N | 大嗓门粗话多，对上级突然拘谨 | `self_lucas`、`person_lucas` | N 30 | act2、act3 | 角色设定集 4.9；人物（一）2.2 | M2 |
| `ln_ferryman` | 老船夫 | 二 | K | 慢悠悠，船与河的比方；"过河五个铜子，不讲价。" | `self_ferryman`、`person_ferryman` | K 80 | act2、act3、act5、act6 | 角色设定集 4.7；人物（一）2.2 | M2 |
| `ln_faceless` | 无貌者 | 二 | K | 轻、慢、无起伏，像念稿；提到"她"声音裂开 | `self_faceless`、`secret_faceless`、`person_faceless` | K 80 | act2 到 act5 | 角色设定集 4.8；人物（一）2.2 | M2 |
| `ln_rosa_oldwatch` | 罗莎 | 二 | N | 指纹句：孩子手上烫，不是病。别给他灌药。 | `self_rosa_oldwatch`、`secret_rosa_oldwatch`、`person_rosa_oldwatch` | N 30 | 无（状态差异用 when） | 人物（一）3.1 | M2 |
| `ln_felix_grau` | 菲利克斯·格劳 | 二 | N | 指纹句：灰晶不是脏，是没算完的账。算完了，它就是钱。 | `self_felix_grau`、`secret_felix_grau`、`person_felix_grau` | N 30 | 无（状态差异用 when） | 人物（一）3.1 | M2 |
| `ln_barbara_schmitz` | 芭芭拉·施密茨 | 二 | N | 指纹句：过桥两个铜，打架另算。 | `self_barbara_schmitz`、`secret_barbara_schmitz`、`person_barbara_schmitz` | N 30 | 无（状态差异用 when） | 人物（一）3.1 | M2 |
| `ln_jakob_schilf` | 雅各·席尔夫 | 二 | N | 指纹句：芦苇往哪边倒，鱼就往哪边走。人也一样。 | `self_jakob_schilf`、`secret_jakob_schilf`、`person_jakob_schilf` | N 30 | 无（状态差异用 when） | 人物（一）3.1 | M2 |
| `ln_fanni_welte` | 法尼·韦尔特 | 二 | N | 指纹句：盐不会骗人，咸就是咸。 | `self_fanni_welte`、`secret_fanni_welte`、`person_fanni_welte` | N 30 | 无（状态差异用 when） | 人物（一）3.1 | M2 |
| `ln_reinhold_breit` | 莱因霍尔德·冯·布莱特 | 二 | N | 指纹句：誓约写的是这座城。城里坐着谁，那不是剑该问的。 | `self_reinhold_breit`、`secret_reinhold_breit`、`person_reinhold_breit` | N 30 | 无（状态差异用 when） | 人物（一）3.2.1 | M2 |
| `ln_roswitha_kirchberg` | 罗斯维塔·冯·基尔希贝格 | 二 | N | 指纹句：我未婚夫守规矩。我守的是排水沟。 | `self_roswitha_kirchberg`、`secret_roswitha_kirchberg`、`person_roswitha_kirchberg` | N 30 | 无（状态差异用 when） | 人物（一）3.2.1 | M2 |
| `ln_timo_ninebead` | 提莫·九珠 | 二 | N | 指纹句：成本呢？那是我家小姐的口头禅。我的是：利息呢？ | `self_timo_ninebead`、`secret_timo_ninebead`、`person_timo_ninebead` | N 30 | 无（状态差异用 when） | 人物（一）3.2.1 | M2 |
| `ln_sibylle_spindler` | 茜比勒·施皮德尔 | 二 | N | 指纹句：一匹好布织九天。一个好名声，要九年。 | `self_sibylle_spindler`、`secret_sibylle_spindler`、`person_sibylle_spindler` | N 30 | 无（状态差异用 when） | 人物（一）3.2.1 | M2 |
| `ln_wolfgang_hammer` | 沃尔夫冈·哈默 | 二 | N | 指纹句：盾举高一寸，命就长一年。 | `self_wolfgang_hammer`、`secret_wolfgang_hammer`、`person_wolfgang_hammer` | N 30 | 无（状态差异用 when） | 人物（一）3.2.1 | M2 |
| `ln_ruya_ropewife` | 鲁娅 | 二 | N | 指纹句：绳子越旧越结实，因为它被拉过。 | `self_ruya_ropewife`、`secret_ruya_ropewife`、`person_ruya_ropewife` | N 30 | 无（状态差异用 when） | 人物（一）3.2.1 | M2 |
| `ln_carola_seeger` | 卡罗拉·泽格 | 二 | N | 指纹句：我只记。记下来的，就不归我管了。 | `self_carola_seeger`、`secret_carola_seeger`、`person_carola_seeger` | N 30 | 无（状态差异用 when） | 人物（一）3.2.2 | M2 |
| `ln_rupert_eick` | 鲁珀特·艾克 | 二 | N | 指纹句：灯不会说谎。说谎的是被照的人。"（他越来越不信这句。） | `self_rupert_eick`、`secret_rupert_eick`、`person_rupert_eick` | N 30 | 无（状态差异用 when） | 人物（一）3.2.2 | M2 |
| `ln_benno_herten` | 本诺·赫尔滕 | 二 | N | 指纹句：钟是对着天敲的，回声却是从地底下来的。 | `self_benno_herten`、`secret_benno_herten`、`person_benno_herten` | N 30 | 无（状态差异用 when） | 人物（一）3.2.2 | M2 |
| `ln_dorothea_mercy` | 朵萝西娅修女 | 二 | N | 指纹句：光治好了他的腿。他的灰斑，我得用草。 | `self_dorothea_mercy`、`secret_dorothea_mercy`、`person_dorothea_mercy` | N 30 | 无（状态差异用 when） | 人物（一）3.2.2 | M2 |
| `ln_moritz_meier` | 莫里茨·迈尔 | 二 | N | 指纹句：光是白给的。粮不是。 | `self_moritz_meier`、`secret_moritz_meier`、`person_moritz_meier` | N 30 | 无（状态差异用 when） | 人物（一）3.2.2 | M2 |
| `ln_goetz_thale` | 格茨·冯·塔勒 | 二 | N | 指纹句：光走了。誓还在。誓本来就是我的。 | `self_goetz_thale`、`secret_goetz_thale`、`person_goetz_thale` | N 30 | 无（状态差异用 when） | 人物（一）3.2.2 | M2 |
| `ln_angelika_traub` | 安格莉卡·特劳布 | 二 | N | 指纹句：水晶不会坏。坏的是我们以为它会读出什么。 | `self_angelika_traub`、`secret_angelika_traub`、`person_angelika_traub` | N 30 | 无（状态差异用 when） | 人物（一）3.2.3 | M2 |
| `ln_lars_zentner` | 拉尔斯·岑特纳 | 二 | N | 指纹句：灰的我收，亮的我卖。中间那三成，叫规矩。 | `self_lars_zentner`、`secret_lars_zentner`、`person_lars_zentner` | N 30 | 无（状态差异用 when） | 人物（一）3.2.3 | M2 |
| `ln_dirk_schwarz` | 迪尔克·施瓦茨 | 二 | N | 指纹句：架势是死的。人得活着把它用出来。 | `self_dirk_schwarz`、`secret_dirk_schwarz`、`person_dirk_schwarz` | N 30 | 无（状态差异用 when） | 人物（一）3.2.3 | M2 |
| `ln_anja_wald` | 安雅·瓦尔德 | 二 | F | 指纹句：E 级怎么了？箭又不看牌子。 | `self_anja_wald`、`secret_anja_wald`、`person_anja_wald` | F 70 | act2、act3 | 人物（一）3.2.3 | M2 |
| `ln_mina_sevenbell` | 米娜·七铃 | 二 | N | 指纹句：铃响三下是平安，响一下是有人在听。 | `self_mina_sevenbell`、`secret_mina_sevenbell`、`person_mina_sevenbell` | N 30 | 无（状态差异用 when） | 人物（一）3.2.4 | M2 |
| `ln_ida_lenz` | 伊达·伦茨 | 二 | N | 指纹句：东西不会说谎，当东西的人才会。 | `self_ida_lenz`、`secret_ida_lenz`、`person_ida_lenz` | N 30 | 无（状态差异用 when） | 人物（一）3.2.4 | M2 |
| `ln_alois_steiger` | 阿洛伊斯·施泰格 | 二 | N | 指纹句：伯爵管城墙，主教管钟，我管下水道。你猜哪个最先出事？ | `self_alois_steiger`、`secret_alois_steiger`、`person_alois_steiger` | N 30 | 无（状态差异用 when） | 人物（一）3.2.4 | M2 |
| `ln_grinda_hammerseal` | 格林达·锤印 | 二 | N | 指纹句：刀我打。你砍什么，我不问。你砍了什么，刀会告诉我。 | `self_grinda_hammerseal`、`secret_grinda_hammerseal`、`person_grinda_hammerseal` | N 30 | 无（状态差异用 when） | 人物（一）3.2.5 | M2 |
| `ln_martin_klinger` | 马丁·克林格 | 二 | N | 指纹句：新做法？行会章程第三页：没有新做法。 | `self_martin_klinger`、`secret_martin_klinger`、`person_martin_klinger` | N 30 | 无（状态差异用 when） | 人物（一）3.2.5 | M2 |
| `ln_wiebke_gerber` | 薇布克·盖尔伯 | 二 | N | 指纹句：皮是死的，可它记得兽活着的样子。 | `self_wiebke_gerber`、`secret_wiebke_gerber`、`person_wiebke_gerber` | N 30 | 无（状态差异用 when） | 人物（一）3.2.5 | M2 |
| `ln_oskar_brehm` | 奥斯卡·布雷姆 | 二 | N | 指纹句：玻璃是沙子烧成的。别跟我说什么东西变不了。 | `self_oskar_brehm`、`secret_oskar_brehm`、`person_oskar_brehm` | N 30 | 无（状态差异用 when） | 人物（一）3.2.5 | M2 |
| `ln_lilian_stern` | 莉莉安·施坦恩 | 二 | N | 指纹句：琥珀里关着一只虫。它一点也不知道自己值钱。 | `self_lilian_stern`、`secret_lilian_stern`、`person_lilian_stern` | N 30 | 无（状态差异用 when） | 人物（一）3.2.5 | M2 |
| `ln_waltrud_koch` | 瓦尔特鲁德·科赫 | 二 | N | 指纹句：吃饱了再吵。吃饱了还吵，那就是真有事。 | `self_waltrud_koch`、`secret_waltrud_koch`、`person_waltrud_koch` | N 30 | 无（状态差异用 when） | 人物（一）3.2.5 | M2 |
| `ln_julian_weil` | 尤利安·魏尔 | 二 | N | 指纹句：一道灵纹是一句话。多写一笔，就是另一句话。 | `self_julian_weil`、`secret_julian_weil`、`person_julian_weil` | N 30 | 无（状态差异用 when） | 人物（一）3.2.6 | M2 |
| `ln_helene_schreiber` | 海伦妮·施莱伯 | 二 | N | 指纹句：刻错一笔，水晶就会撒谎。所以我从不刻错。 | `self_helene_schreiber`、`secret_helene_schreiber`、`person_helene_schreiber` | N 30 | 无（状态差异用 when） | 人物（一）3.2.6 | M2 |
| `ln_magnus_feder` | 马格努斯·费德 | 二 | N | 指纹句：装订线不会撒谎。撒谎的是剪刀。 | `self_magnus_feder`、`secret_magnus_feder`、`person_magnus_feder` | N 30 | 无（状态差异用 when） | 人物（一）3.2.6 | M2 |
| `ln_nelli_coppereye` | 内莉"铜眼" | 二 | N | 指纹句：价钱随风险涨。你今天的风险，我看是两倍。 | `self_nelli_coppereye`、`secret_nelli_coppereye`、`person_nelli_coppereye` | N 30 | 无（状态差异用 when） | 人物（一）3.2.7 | M2 |
| `ln_basti_brokentooth` | 巴斯蒂"断齿" | 二 | N | 指纹句：规矩一：不碰孩子。规矩二：碰了孩子的人，归我碰。 | `self_basti_brokentooth`、`secret_basti_brokentooth`、`person_basti_brokentooth` | N 30 | 无（状态差异用 when） | 人物（一）3.2.7 | M2 |
| `ln_ruth_threshold` | 茹丝"门槛婆" | 二 | N | 指纹句：汤是热的。门是开的。别的你别问。 | `self_ruth_threshold`、`secret_ruth_threshold`、`person_ruth_threshold` | N 30 | 无（状态差异用 when） | 人物（一）3.2.7 | M2 |
| `ln_eugen_stille` | 奥伊根·施蒂勒 | 二 | N | 指纹句：人死了要有人送。门开了也要有人送。 | `self_eugen_stille`、`secret_eugen_stille`、`person_eugen_stille` | N 30 | 无（状态差异用 when） | 人物（一）3.2.8 | M2 |
| `ln_nora_shroud` | 诺拉 | 二 | N | 指纹句：死人很安静。会撒谎的只有活人。 | `self_nora_shroud`、`secret_nora_shroud`、`person_nora_shroud` | N 30 | 无（状态差异用 when） | 人物（一）3.2.8 | M2 |
| `ln_hanno_loeff` | 汉诺·勒夫 | 二 | N | 指纹句：盖章不难。难的是记得盖过哪个。 | `self_hanno_loeff`、`secret_hanno_loeff`、`person_hanno_loeff` | N 30 | 无（状态差异用 when） | 人物（一）3.2.9 | M2 |
| `ln_bogdan_bargeman` | 博格丹"老鲶" | 二 | N | 指纹句：河不急，人急。人一急，就翻船。 | `self_bogdan_bargeman`、`secret_bogdan_bargeman`、`person_bogdan_bargeman` | N 30 | 无（状态差异用 when） | 人物（一）3.2.9 | M2 |
| `ln_paula_zimmer` | 宝拉·齐默 | 二 | N | 指纹句：鱼翻白肚之前，水先变色。你们城里人只看鱼。 | `self_paula_zimmer`、`secret_paula_zimmer`、`person_paula_zimmer` | N 30 | 无（状态差异用 when） | 人物（一）3.2.9 | M2 |
| `ln_tur_warehouse` | 图尔 | 二 | N | 指纹句：重的给我。轻的你自己拿。 | `self_tur_warehouse`、`secret_tur_warehouse`、`person_tur_warehouse` | N 30 | 无（状态差异用 when） | 人物（一）3.2.9 | M2 |
| `ln_martina_seel` | 马蒂娜·泽尔 | 二 | N | 指纹句：我们不要施舍。给我们一块地，一个冬天。 | `self_martina_seel`、`secret_martina_seel`、`person_martina_seel` | N 30 | 无（状态差异用 when） | 人物（一）3.2.10 | M2 |
| `ln_leni_mercy` | 莱妮 | 二 | N | 指纹句：它烫的时候，我就知道有好人来了。 | `self_leni_mercy`、`secret_leni_mercy`、`person_leni_mercy` | N 30 | 无（状态差异用 when） | 人物（一）3.2.10 | M2 |
| `ln_kamilla_greyglove` | 卡米拉"灰手套" | 二 | N | 指纹句：过桥给钱，过不去也给钱。这叫荒原的规矩。 | `self_kamilla_greyglove`、`secret_kamilla_greyglove`、`person_kamilla_greyglove` | N 30 | 无（状态差异用 when） | 人物（一）3.4 | M2 |
| `ln_gottlieb_surgeon` | 戈特利布 | 二 | N | 指纹句：祈祷的时候，记得先把血止住。 | `self_gottlieb_surgeon`、`secret_gottlieb_surgeon`、`person_gottlieb_surgeon` | N 30 | 无（状态差异用 when） | 人物（一）3.4 | M2 |
| `ln_herbert_crystaltooth` | 赫伯特"晶牙" | 二 | N | 指纹句：灰晶会咬人。可它只咬穷人，富人有手套。 | `self_herbert_crystaltooth`、`secret_herbert_crystaltooth`、`person_herbert_crystaltooth` | N 30 | 无（状态差异用 when） | 人物（一）3.4 | M2 |
| `ln_gabi_crystalarm` | 嘉布丽"晶臂" | 二 | F | 指纹句：这条胳膊是灰给的。灰拿走我的手，我拿它砸灰。 | `self_gabi_crystalarm`、`secret_gabi_crystalarm`、`person_gabi_crystalarm` | F 70 | act2 到 act5 | 人物（一）3.4 | M2 |
| `ln_theo_ashpact` | 西奥"灰契者" | 二 | N | 指纹句：灰里有东西在等。它要的不多，可你得先说清楚你给什么。 | `self_theo_ashpact`、`secret_theo_ashpact`、`person_theo_ashpact` | N 30 | 无（状态差异用 when） | 人物（一）3.4 | M2 |
| `ln_jutta_scavenger` | 尤塔 | 二 | N | 指纹句：灰底下埋的都是别人的家。我只拿他们不要的。 | `self_jutta_scavenger`、`secret_jutta_scavenger`、`person_jutta_scavenger` | N 30 | 无（状态差异用 when） | 人物（一）3.4 | M2 |
| `ln_lind_ironspoon` | 林德"铁勺" | 二 | N | 指纹句：大人不收我们，灰收。灰收的都死了。所以我们自己收自己。 | `self_lind_ironspoon`、`secret_lind_ironspoon`、`person_lind_ironspoon` | N 30 | 无（状态差异用 when） | 人物（一）3.4 | M2 |
| `ln_ada_hellinger` | 艾达·海林格 | 二 | N | 指纹句：门缝开着，是给认得路的人。不认得的，请敲三短一长。 | `self_ada_hellinger`、`secret_ada_hellinger`、`person_ada_hellinger` | N 30 | 无（状态差异用 when） | 人物（一）3.4 | M2 |
| `ln_nils_hellinger` | 尼尔斯·海林格 | 二 | N | 指纹句：这里的风，闻起来像开着的门。 | `self_nils_hellinger`、`person_nils_hellinger` | N 30 | 无（状态差异用 when） | 人物（一）3.4 | M2 |
| `ln_joern_greywood` | 耶尔恩"不说话的" | 二 | N | 指纹句：他通常只点头。开口时："狼不坏。坏的是让它变灰的东西。 | `self_joern_greywood`、`secret_joern_greywood`、`person_joern_greywood` | N 30 | 无（状态差异用 when） | 人物（一）3.4 | M2 |
| `ln_polly_mutebell` | 波利"哑铃" | 二 | N | 指纹句：我的铃不响了。所以我听得比谁都清楚。 | `self_polly_mutebell`、`secret_polly_mutebell`、`person_polly_mutebell` | N 30 | 无（状态差异用 when） | 人物（一）3.4 | M2 |
| `ln_zima_lullaby` | 茨玛"眠歌" | 二 | N | 指纹句：睡吧。门开着，路很长，可是有人在等。 | `self_zima_lullaby`、`secret_zima_lullaby`、`person_zima_lullaby` | N 30 | 无（状态差异用 when） | 人物（一）3.4 | M2 |
| `ln_luchen` | 陆辰 | 二 | C | 快、热情、网文腔；"交给我！" | `self_luchen`、`person_luchen` | C 200 | act2 到 act6 | 角色设定集 4.3；人物（二）2.1 | M2 |
| `ln_yui` | 白石结衣 | 二 | C | 轻柔、礼貌、敬语式；"没事的，我在。" | `self_yui`、`person_yui` | C 200 | act2 到 act6 | 角色设定集 4.4；人物（二）2.1 | M2 |
| `ln_aiden` | 艾登·霍尔 | 二 | C | 精确，"假设……那么……"，英式反讽 | `self_aiden`、`person_aiden` | C 200 | act2 到 act6 | 角色设定集 4.5；人物（二）2.1 | M2 |
| `ln_marcus` | 马库斯·罗查 | 二 | C | 洪亮，玩笑缓和气氛，情急冒母语惊叹 | `self_marcus`、`person_marcus` | C 200 | act2 到 act6 | 角色设定集 4.6；人物（二）2.1 | M2 |
| `ln_sasha` | 红牙将军萨莎 | 二 | C | 短、粗、带笑，拳击术语；称瓦尔妲"老板" | `self_sasha`、`person_sasha` | C 200 | act3 到 act6 | 角色设定集 5.2；人物（二）2.1 | M2 |
| `ln_hart` | 金冠哈特 | 二 | K | 律师式条款语言；"一切都有价格。""签个字吧。" | `self_hart`、`person_hart` | K 80 | act3 到 act6 | 角色设定集 6.1；人物（二）2.1 | M2 |
| `ln_matthias_clowen` | 大审判长马蒂亚斯·克洛温 | 二 | N | 狂信的审判长，句句判词 | `self_matthias_clowen`、`person_matthias_clowen` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M2 |
| `ln_viola_rosen` | 召唤枢机薇奥拉·罗森 | 二 | N | 枢机的体面腔，承认谎言时声音变小 | `self_viola_rosen`、`person_viola_rosen` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M2 |
| `ln_teo_fairroad` | 铃路会会首蒂奥·晴路 | 二 | N | 铃路会会首，"铃响三下是平安"式的商路话 | `self_teo_fairroad`、`person_teo_fairroad` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M2 |
| `ln_iolan_mistleaf` | 雾叶使者伊欧兰·雾叶 | 二 | N | 雾叶使者，外交辞令，留三分 | `self_iolan_mistleaf`、`person_iolan_mistleaf` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M2 |
| `ln_vilan_cross` | 左扉维兰·克罗斯 | 二 | N | 门徒会左扉，平静的狂信 | `self_vilan_cross`、`person_vilan_cross` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M2 |
| `ln_marin_oster` | 灰帆团长"咸舌"玛琳·奥斯特 | 二 | N | "咸舌"，水手粗话，走私的门道 | `self_marin_oster`、`person_marin_oster` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M2 |

### 9.5 第三幕首登（M2，73 包）

| 台词包 | 名 | 首登 | 类别 | 口吻要点 | 专属话题 | 最低量 | 按幕变体 | 锚点与人设出处 | 批次 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ln_oswald` | 老王奥斯瓦尔德四世 | 三 | N | 老王：气若游丝，一句一歇，每句都清楚 | `self_oswald`、`person_oswald` | N 30 | 无（状态差异用 when） | 角色设定集 5.1；人物（一）2.3 | M2 |
| `ln_philip` | 王太子腓力 | 三 | K | 王太子：犹豫，常以疑问句收尾，种豆比签字多 | `self_philip`、`person_philip` | K 80 | act3、act4 | 角色设定集 5.1；人物（一）2.3 | M2 |
| `ln_drake` | 宰相冯·德雷克 | 三 | K | 宰相：冷静的账房腔，从不说满 | `self_drake`、`person_drake` | K 80 | act3 | 人物（一）2.3 | M2 |
| `ln_severin` | 大主教塞维林·莫兰德 | 三 | K | 大主教：布道腔、宏大、引光之名 | `self_severin`、`person_severin` | K 80 | act3、act4 | 人物（一）2.3 | M2 |
| `ln_brigitte` | 布丽吉特·哈尔森"灰墙" | 三 | N | 北境军团长"灰墙"：粗砺、提死人数、说话像点名 | `self_brigitte`、`person_brigitte` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_wenzel` | 文策尔·古特曼 | 三 | N | 密约抄本的持有人：胆小、总怕隔墙有耳 | `self_wenzel`、`person_wenzel` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_sigrid` | 西格丽德·纳尔 | 三 | N | 御医：平稳、专业、只陈述病情与所见 | `self_sigrid`、`person_sigrid` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_ernst` | 恩斯特·冯·埃森巴赫 | 三 | N | 纹章爱好的小贵族：絮叨家谱与纹章 | `self_ernst`、`person_ernst` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_joachim` | 约阿希姆·贝格 | 三 | N | 护送剑士：剑课口吻，短促，重礼 | `self_joachim`、`person_joachim` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_eberhard` | 埃伯哈德·施莱 | 三 | N | 七锁库钥匠：一板一眼，"锁比人老实" | `self_eberhard`、`person_eberhard` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_olive` | 奥丽芙·冯·特恩 | 三 | N | 贵族女子，莫伊拉的代言载体：说话像在念旁白 | `self_olive`、`person_olive` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_gunther` | 冈特·冯·霍恩"铁砧" | 三 | N | "铁砧"纵队长：大嗓门，行军用语 | `self_gunther`、`person_gunther` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_ingrid` | 英格丽德·索恩 | 三 | N | 霜脊堡守将：冷、少言、以守为荣 | `self_ingrid`、`person_ingrid` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_konrad` | 康拉德·克雷默 | 三 | N | 橡盾要塞守将：讲边境规矩，谨慎 | `self_konrad`、`person_konrad` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_ursak` | 乌尔萨克"老树根" | 三 | N | 熊族移民族长：慢、重、"老树根"式比喻 | `self_ursak`、`person_ursak` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_kaya` | 卡娅 | 三 | N | 豹族激进猎手：冲、刺、质问人族 | `self_kaya`、`person_kaya` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_clara` | 克拉拉·韦伯 | 三 | N | 领地内政"宰辅"：条理清楚，先列一二三 | `self_clara`、`person_clara` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_bodric` | 博德里克·石缝 | 三 | N | 矮人工程师："石缝"一样硬，谈墙就来劲 | `self_bodric`、`person_bodric` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_regis` | 雷吉斯·达尔 | 三 | N | 民兵长兼北境向导：粗中有细，熟地形 | `self_regis`、`person_regis` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_romaine` | 萝蔓·麦穗 | 三 | N | 半身人农事官：絮叨收成，乐观 | `self_romaine`、`person_romaine` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_holger` | 霍尔格"拾骨人" | 三 | N | 荒原向导"拾骨人"：说话带灰味，见多不怪 | `self_holger`、`person_holger` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_hanna` | 汉娜 | 三 | N | 苇塘村长老：遗民老妇，温和而警惕 | `self_hanna`、`person_hanna` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_hedwig` | 海德薇·诺特 | 三 | K | 指纹句：封门要被撼动了。你听，它在响。 | `self_hedwig`、`secret_hedwig`、`person_hedwig` | K 80 | act3、act4 | 人物（一）2.3 | M2 |
| `ln_jorg` | 约尔格·费舍 | 三 | N | 洛萨籍征召兵：想回家种地，一句"我家人在那边" | `self_jorg`、`person_jorg` | N 30 | 无（状态差异用 when） | 人物（一）2.3 | M2 |
| `ln_krista_mohr` | 克丽斯塔·莫尔 | 三 | N | 指纹句：会写自己的名字，就没人能替你签字。 | `self_krista_mohr`、`secret_krista_mohr`、`person_krista_mohr` | N 30 | 无（状态差异用 when） | 人物（一）3.1 | M2 |
| `ln_hermann_strahl` | 赫尔曼·冯·施特拉尔 | 三 | N | 指纹句：王命就是王命。可王，现在还能说话吗？ | `self_hermann_strahl`、`secret_hermann_strahl`、`person_hermann_strahl` | N 30 | 无（状态差异用 when） | 人物（一）3.3.1 | M2 |
| `ln_hjalma_blum` | 雅尔玛·布卢姆 | 三 | N | 指纹句：王子种的豆子比他签的字多。豆子不会骗他。 | `self_hjalma_blum`、`secret_hjalma_blum`、`person_hjalma_blum` | N 30 | 无（状态差异用 when） | 人物（一）3.3.1 | M2 |
| `ln_cornelia_drake` | 科内莉娅·冯·德雷克 | 三 | N | 指纹句：父亲算的是账。我算的是他算漏了什么。 | `self_cornelia_drake`、`secret_cornelia_drake`、`person_cornelia_drake` | N 30 | 无（状态差异用 when） | 人物（一）3.3.1 | M2 |
| `ln_clemens_zollner` | 克莱门斯·措尔纳 | 三 | N | 指纹句：王国不是穷。王国是借得太早，还得太晚。 | `self_clemens_zollner`、`secret_clemens_zollner`、`person_clemens_zollner` | N 30 | 无（状态差异用 when） | 人物（一）3.3.1 | M2 |
| `ln_albin_dawnlight` | 阿尔宾修士 | 三 | N | 指纹句：阁下说那是光。我只负责把它写成字。 | `self_albin_dawnlight`、`secret_albin_dawnlight`、`person_albin_dawnlight` | N 30 | 无（状态差异用 when） | 人物（一）3.3.1 | M2 |
| `ln_lotti_rutways` | 洛蒂"马鞭" | 三 | N | 指纹句：马认得路。人只认得赏钱。 | `self_lotti_rutways`、`secret_lotti_rutways`、`person_lotti_rutways` | N 30 | 无（状态差异用 when） | 人物（一）3.3.1 | M2 |
| `ln_ottmar_lichtenwald` | 奥特玛·冯·利希滕瓦尔德 | 三 | N | 指纹句：我不缺勇气。我缺的是吃得饱的勇气。 | `self_ottmar_lichtenwald`、`secret_ottmar_lichtenwald`、`person_ottmar_lichtenwald` | N 30 | 无（状态差异用 when） | 人物（一）3.3.2 | M2 |
| `ln_erika_lichtenwald` | 埃丽卡·冯·利希滕瓦尔德 | 三 | N | 指纹句：传闻说我一箭射穿两个帝国兵。那是两个瘦的。 | `self_erika_lichtenwald`、`secret_erika_lichtenwald`、`person_erika_lichtenwald` | N 30 | 无（状态差异用 when） | 人物（一）3.3.2 | M2 |
| `ln_mechthild_eich` | 梅希蒂尔德·冯·艾希 | 三 | N | 指纹句：北境的账，我用墓碑记。 | `self_mechthild_eich`、`secret_mechthild_eich`、`person_mechthild_eich` | N 30 | 无（状态差异用 when） | 人物（一）3.3.2 | M2 |
| `ln_ludger_seeheim` | 卢德格尔·冯·塞海姆 | 三 | N | 指纹句：海不认国王。海只认潮。 | `self_ludger_seeheim`、`secret_ludger_seeheim`、`person_ludger_seeheim` | N 30 | 无（状态差异用 when） | 人物（一）3.3.2 | M2 |
| `ln_therese_salzmann` | 特蕾泽·萨尔茨曼 | 三 | N | 指纹句：没有盐的军队，第三天就开始投降。 | `self_therese_salzmann`、`secret_therese_salzmann`、`person_therese_salzmann` | N 30 | 无（状态差异用 when） | 人物（一）3.3.2 | M2 |
| `ln_jan_decker` | 扬·德克尔 | 三 | N | 指纹句：雾大的时候，灯塔也会骗人。 | `self_jan_decker`、`secret_jan_decker`、`person_jan_decker` | N 30 | 无（状态差异用 when） | 人物（一）3.3.2 | M2 |
| `ln_nikolai_wass` | 尼古拉·瓦斯 | 三 | N | 指纹句：海把他们送回来，身上带着灰。海从来不灰。 | `self_nikolai_wass`、`secret_nikolai_wass`、`person_nikolai_wass` | N 30 | 无（状态差异用 when） | 人物（一）3.3.2 | M2 |
| `ln_florian_weinberg` | 弗洛里安·冯·魏因贝格 | 三 | N | 指纹句：和平是最好的酒。只是要放在帝国的窖里。 | `self_florian_weinberg`、`secret_florian_weinberg`、`person_florian_weinberg` | N 30 | 无（状态差异用 when） | 人物（一）3.3.2 | M2 |
| `ln_amalia_kirchberg` | 阿玛莉亚·冯·基尔希贝格 | 三 | N | 指纹句：我捐的是麦子。麦子不该拿去烧村子。 | `self_amalia_kirchberg`、`secret_amalia_kirchberg`、`person_amalia_kirchberg` | N 30 | 无（状态差异用 when） | 人物（一）3.3.2 | M2 |
| `ln_katharina_vogt` | 卡塔琳娜·福格特 | 三 | N | 指纹句：你要多少箭？先告诉我你要打几天。 | `self_katharina_vogt`、`secret_katharina_vogt`、`person_katharina_vogt` | N 30 | 无（状态差异用 when） | 人物（一）3.3.3 | M2 |
| `ln_arno_greywall` | 阿诺"老墙" | 三 | N | 指纹句：一面盾挡不住什么。一百面盾，挡得住一个冬天。 | `self_arno_greywall`、`secret_arno_greywall`、`person_arno_greywall` | N 30 | 无（状态差异用 when） | 人物（一）3.3.3 | M2 |
| `ln_stefan_reik` | 斯特凡·赖克 | 三 | N | 指纹句：走廊里的雪要是没有脚印，那才最该担心。 | `self_stefan_reik`、`secret_stefan_reik`、`person_stefan_reik` | N 30 | 无（状态差异用 when） | 人物（一）3.3.3 | M2 |
| `ln_aegidius_crypt` | 埃吉迪乌斯修士 | 三 | N | 指纹句：他们不是不肯走。是有什么压着，不让走。 | `self_aegidius_crypt`、`secret_aegidius_crypt`、`person_aegidius_crypt` | N 30 | 无（状态差异用 when） | 人物（一）3.3.3 | M2 |
| `ln_harald_imker` | 哈拉尔德·伊姆克 | 三 | N | 指纹句：蜂不问你是哪一族的。蜂只蛰手笨的。 | `self_harald_imker`、`secret_harald_imker`、`person_harald_imker` | N 30 | 无（状态差异用 when） | 人物（一）3.3.4 | M2 |
| `ln_toya_shaman` | 托雅 | 三 | N | 指纹句：祖先不说人话。祖先说风话。你得会听风。 | `self_toya_shaman`、`secret_toya_shaman`、`person_toya_shaman` | N 30 | 无（状态差异用 when） | 人物（一）3.3.4 | M2 |
| `ln_tem_apprentice` | 泰姆 | 三 | F | 指纹句：师父说雷是天上的鼓。那我就是打鼓的。 | `self_tem_apprentice`、`secret_tem_apprentice`、`person_tem_apprentice` | F 70 | act3 到 act5 | 人物（一）3.3.4 | M2 |
| `ln_rolf_schneider` | 罗尔夫·施耐德 | 三 | N | 指纹句：命令说不得主动交战。那就让他们主动来。 | `self_rolf_schneider`、`secret_rolf_schneider`、`person_rolf_schneider` | N 30 | 无（状态差异用 when） | 人物（一）3.3.4 | M2 |
| `ln_anton_deerford` | 安东"灰须" | 三 | N | 指纹句：水退一尺，能过一个人。水退三尺，能过一支军队。 | `self_anton_deerford`、`secret_anton_deerford`、`person_anton_deerford` | N 30 | 无（状态差异用 when） | 人物（一）3.3.4 | M2 |
| `ln_thilo_ohlen` | 蒂洛·奥伦 | 三 | N | 指纹句：不是缺页。缺页的地方纸会皱。这里很平。 | `self_thilo_ohlen`、`secret_thilo_ohlen`、`person_thilo_ohlen` | N 30 | 无（状态差异用 when） | 人物（一）3.3.5 | M2 |
| `ln_beatrix_hof` | 贝娅特丽克丝·霍夫 | 三 | N | 指纹句：锁是一句承诺。我造的锁，我不撬。除非你让我相信，承诺本身错了。 | `self_beatrix_hof`、`secret_beatrix_hof`、`person_beatrix_hof` | N 30 | 无（状态差异用 when） | 人物（一）3.3.5 | M2 |
| `ln_frieda_muenz` | 弗丽达·明茨 | 三 | N | 指纹句：账不会背叛人。背叛人的是记账的。 | `self_frieda_muenz`、`secret_frieda_muenz`、`person_frieda_muenz` | N 30 | 无（状态差异用 when） | 人物（一）3.3.6 | M2 |
| `ln_gustav_kram` | 古斯塔夫·克拉姆 | 三 | N | 指纹句：我不讨厌你。我只是比你更早知道你会欠我钱。 | `self_gustav_kram`、`secret_gustav_kram`、`person_gustav_kram` | N 30 | 无（状态差异用 when） | 人物（一）3.3.6 | M2 |
| `ln_alai_reedpond` | 阿莱 | 三 | N | 指纹句：苇塘不存在。所以他们烧的，也不存在。 | `self_alai_reedpond`、`secret_alai_reedpond`、`person_alai_reedpond` | N 30 | 无（状态差异用 when） | 人物（一）3.3.7 | M2 |
| `ln_egon_blacknail` | 埃贡"黑指甲" | 三 | N | 指纹句：门石不能卖？那我卖的是石头，门是你自己想的。 | `self_egon_blacknail`、`secret_egon_blacknail`、`person_egon_blacknail` | N 30 | 无（状态差异用 when） | 人物（一）3.4 | M2 |
| `ln_ester_glass` | 埃丝特 | 三 | N | 指纹句：这片地被火烧过一次，烧得太干净，连灰都是亮的。 | `self_ester_glass`、`secret_ester_glass`、`person_ester_glass` | N 30 | 无（状态差异用 when） | 人物（一）3.4 | M2 |
| `ln_ithelyn` | 皇女伊瑟琳 | 三 | N | 参谋口吻，拔的是地图上的钉子 | `self_ithelyn`、`person_ithelyn` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M2 |
| `ln_balthazar_krenn` | 元帅巴尔塔扎·克伦 | 三 | N | 元帅的军令腔，借战争说神意 | `self_balthazar_krenn`、`person_balthazar_krenn` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M2 |
| `ln_edmond_lacroix` | 大团长埃德蒙·拉克洛瓦 | 三 | N | 老骑士，八十年的誓言，话少而重 | `self_edmond_lacroix`、`person_edmond_lacroix` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M2 |
| `ln_owen_lusk` | 首席史官欧文·拉斯克 | 三 | N | 首席史官，先知式的含糊 | `self_owen_lusk`、`person_owen_lusk` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M2 |
| `ln_livia_nock` | 鼠首"十三" | 三 | N | 鼠首"十三"，暗语，数字代人名 | `self_livia_nock`、`person_livia_nock` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M2 |
| `ln_gerhard_brandt` | 铁誓团长格哈德·布兰特 | 三 | N | 铁誓团长，"不方便的事"说得很轻 | `self_gerhard_brandt`、`person_gerhard_brandt` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M2 |
| `ln_ulrich_von_eisen` | 乌尔里希·冯·艾森 | 三 | N | 圣战军军官，守则口吻，"不屠无兵之村" | `self_ulrich_von_eisen`、`person_ulrich_von_eisen` | N 30 | 无（状态差异用 when） | 人物（二）2.3 | M2 |
| `ln_berthold_klan` | 贝尔托德·克兰 | 三 | N | 下令屠村者，干燥的命令语，不看人眼 | `self_berthold_klan`、`person_berthold_klan` | N 30 | 无（状态差异用 when） | 人物（二）2.3 | M2 |
| `ln_parvi_tinring` | 帕尔维·锡环 | 三 | N | 同盟债务专员，债券术语 | `self_parvi_tinring`、`person_parvi_tinring` | N 30 | 无（状态差异用 when） | 人物（二）2.3 | M2 |
| `ln_casimir_von_roth` | 卡西米尔·冯·罗特 | 三 | N | 帝国密使，客气地记笔记 | `self_casimir_von_roth`、`person_casimir_von_roth` | N 30 | 无（状态差异用 when） | 人物（二）2.3 | M2 |
| `ln_oriana_west` | 奥莉安娜·维斯特 | 三 | N | 帝国将领，讲决斗规矩，输了守约 | `self_oriana_west`、`person_oriana_west` | N 30 | 无（状态差异用 when） | 人物（二）2.3 | M2 |
| `ln_rogo_breakchain` | 罗戈 | 三 | N | 红牙冲锋将，吼着说话，输了就认 | `self_rogo_breakchain`、`person_rogo_breakchain` | N 30 | 无（状态差异用 when） | 人物（二）2.3 | M2 |
| `ln_hiska` | 希斯卡 | 三 | N | 红牙军文书，冷静记录，心向夜后 | `self_hiska`、`person_hiska` | N 30 | 无（状态差异用 when） | 人物（二）2.3 | M2 |
| `ln_razg` | 拉兹格 | 三 | N | 通用替补将领，粗而稳 | `self_razg`、`person_razg` | N 30 | 无（状态差异用 when） | 人物（二）2.3 | M2 |
| `ln_gian_moret` | "掉光"的圣骑士吉安·莫雷 | 三 | F | 指纹句：光走了。马还在，剑还在，我还在。 | `self_gian_moret`、`secret_gian_moret`、`person_gian_moret` | F 70 | act3 到 act5 | 人物（二）3.1 | M2 |
| `ln_jost_winter` | 少壮参谋约斯特·温特 | 三 | N | 指纹句：皇女从不拔剑。她拔的是地图上的钉子。 | `self_jost_winter`、`secret_jost_winter`、`person_jost_winter` | N 30 | 无（状态差异用 when） | 人物（二）3.2 | M2 |
| `ln_ferdinand_kress` | 第七军团长费迪南德·克雷斯 | 三 | N | 指纹句：城墙不会冲锋。所以我先修路。 | `self_ferdinand_kress`、`secret_ferdinand_kress`、`person_ferdinand_kress` | N 30 | 无（状态差异用 when） | 人物（二）3.2 | M2 |

### 9.6 第四幕首登（M3，145 包）

| 台词包 | 名 | 首登 | 类别 | 口吻要点 | 专属话题 | 最低量 | 按幕变体 | 锚点与人设出处 | 批次 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ln_mati` | 玛蒂"缝面" | 四 | K | 指纹句：母亲会回来。我们只是先把门打开。 | `self_mati`、`secret_mati`、`person_mati` | K 80 | act4、act5 | 人物（一）3.5 | M3 |
| `ln_tavi` | 门歌者塔维 | 四 | N | 指纹句：开门的母亲。我们会自己开门了。"（第六幕） | `self_tavi`、`secret_tavi`、`person_tavi` | N 30 | 无（状态差异用 when） | 人物（一）3.5 | M3 |
| `ln_emperor` | 剑帝雷欧哈特三世 | 四 | K | 极短，常一个词；"拔剑。" | `self_emperor`、`person_emperor` | K 80 | act4 到 act6 | 角色设定集 6.2；人物（二）2.1 | M3 |
| `ln_night_queen` | 夜后维丝佩拉 | 四 | K | 低沉缓慢，魔族谚语，愤怒时更慢 | `self_night_queen`、`person_night_queen` | K 80 | act4 到 act6 | 角色设定集 6.3；人物（二）2.1 | M3 |
| `ln_elwin` | 长老艾尔温 | 四 | K | 极慢，长句，不自觉回到过去时态 | `self_elwin`、`person_elwin` | K 80 | act4 到 act6 | 角色设定集 6.4；人物（二）2.1 | M3 |
| `ln_lucian_albrecht` | 宰相卢西安·奥尔布雷希特 | 四 | N | 温和的宫廷腔，句句替教国留门 | `self_lucian_albrecht`、`person_lucian_albrecht` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_seraphin_iv` | 教皇赛拉芬四世 | 四 | N | 教皇诏书腔，越到后来越疲惫 | `self_seraphin_iv`、`person_seraphin_iv` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_florin_caspari` | 议长弗洛林·卡斯帕里 | 四 | N | 议长的议事腔，凡事"提案" | `self_florin_caspari`、`person_florin_caspari` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_gunnhild_deephammer` | 炉主古恩希尔德·深锤 | 四 | N | 炉主，矮人式硬话，签约前不笑 | `self_gunnhild_deephammer`、`person_gunnhild_deephammer` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_caranis_greenstring` | 首座卡兰妮丝·苍弦 | 四 | N | 精灵首座，冷眼，只教能不拔刃的人 | `self_caranis_greenstring`、`person_caranis_greenstring` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_nassia_dawndew` | 灵泉守纳茜娅·晨露 | 四 | N | 灵泉守，轻声、季节比喻 | `self_nassia_dawndew`、`person_nassia_dawndew` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_tolle_oldhorn` | 兽王"老角"托勒 | 四 | N | 老兽王，临终般缓慢，托付的口气 | `self_tolle_oldhorn`、`person_tolle_oldhorn` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_nitira_moonhorn` | "月角"妮蒂拉 | 四 | N | 大萨满，听风与祖灵，话里有风 | `self_nitira_moonhorn`、`person_nitira_moonhorn` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_ursa_stonebreaker` | "裂石"乌尔萨 | 四 | N | 战首，夸口，拳头说话 | `self_ursa_stonebreaker`、`person_ursa_stonebreaker` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_lokan_greyspine` | "灰脊"洛坎 | 四 | N | 灰鬃部旧人，欲言又止，知道希雅家的旧事 | `self_lokan_greyspine`、`person_lokan_greyspine` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_tiss_whitetail` | "白尾"缇丝 | 四 | N | 情报掮客，笑里报价 | `self_tiss_whitetail`、`person_tiss_whitetail` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_bazrai_rediron` | "赤铁公"巴兹莱 | 四 | N | 赤铁公，傲慢的诸侯腔 | `self_bazrai_rediron`、`person_bazrai_rediron` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_serpetina_scalemother` | "鳞母"赛佩缇娜 | 四 | N | 鳞母，晚祷式低语，按鳞书说话 | `self_serpetina_scalemother`、`person_serpetina_scalemother` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_kester_higheyrie` | "高巢公"凯斯特 | 四 | N | 高巢公，眼尖嘴滑，粮与军情一起卖 | `self_kester_higheyrie`、`person_kester_higheyrie` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_viktor_lampart` | 总会长维克托·兰帕特 | 四 | N | 公会总会长，中立腔，"公会不站队" | `self_viktor_lampart`、`person_viktor_lampart` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_rosette_threeleaf` | 大账房萝赛特·三叶 | 四 | N | 大账房，只要"账平" | `self_rosette_threeleaf`、`person_rosette_threeleaf` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_helga_thornbrook` | 首席大贤者赫尔加·索恩布鲁克 | 四 | N | 首席大贤者，学究，掂量每个词 | `self_helga_thornbrook`、`person_helga_thornbrook` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_emilio_falco` | 金秤军团长埃米利奥·法尔科 | 四 | N | 金秤军团长，合同腔，条款第几款 | `self_emilio_falco`、`person_emilio_falco` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_kasha_silent` | 风牙猎团长"无声"卡夏 | 四 | N | "无声"，几乎不说话，一说就是军情 | `self_kasha_silent`、`person_kasha_silent` | N 30 | 无（状态差异用 when） | 人物（二）2.2 | M3 |
| `ln_helga_stern` | 赫尔加·施特恩 | 四 | N | 禁学天文学家，星表不离口 | `self_helga_stern`、`person_helga_stern` | N 30 | 无（状态差异用 when） | 人物（二）2.3 | M3 |
| `ln_bobby_lind` | 波比·林德 | 四 | N | 档案小职员，紧张，知道魂契在哪 | `self_bobby_lind`、`person_bobby_lind` | N 30 | 无（状态差异用 when） | 人物（二）2.3 | M3 |
| `ln_mute_bell` | 哑钟 | 四 | N | "哑钟"，几乎不说话，说话像敲钟 | `self_mute_bell`、`person_mute_bell` | N 30 | 无（状态差异用 when） | 人物（二）2.3 | M3 |
| `ln_aurelius_vent` | 国务枢机奥雷利乌斯·文特 | 四 | N | 指纹句：光不急。光只是不肯退。 | `self_aurelius_vent`、`secret_aurelius_vent`、`person_aurelius_vent` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_celestin_bohn` | 枢机塞勒斯坦·博恩 | 四 | N | 指纹句：孩子饿的时候，光在哪里，我们就去哪里。 | `self_celestin_bohn`、`secret_celestin_bohn`、`person_celestin_bohn` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_baldo_pessari` | 司库枢机巴尔多·佩萨里 | 四 | N | 指纹句：信仰无价。可大圣堂的屋顶有价。 | `self_baldo_pessari`、`secret_baldo_pessari`、`person_baldo_pessari` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_theodor_valant` | 验谕院长西奥多·瓦兰 | 四 | N | 指纹句：神谕不会错。错的是听的人，所以要验。 | `self_theodor_valant`、`secret_theodor_valant`、`person_theodor_valant` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_ilsa_moen` | 七钟修院院长伊尔莎·莫恩 | 四 | N | 指纹句：先止血。祷告可以等。 | `self_ilsa_moen`、`secret_ilsa_moen`、`person_ilsa_moen` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_ludovic_behn` | 初光驿主教卢多维克·贝恩 | 四 | N | 指纹句：进了这扇门的都是病人，不问从哪来。 | `self_ludovic_behn`、`secret_ludovic_behn`、`person_ludovic_behn` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_brice_herald` | 勇者院执事布里斯 | 四 | N | 指纹句：荣养？那一页之后，名字就只剩忌日了。 | `self_brice_herald`、`secret_brice_herald`、`person_brice_herald` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_ottilie_nash` | 审判庭书记长奥蒂莉·纳什 | 四 | N | 指纹句：档案不撒谎。撒谎的是摘要。 | `self_ottilie_nash`、`secret_ottilie_nash`、`person_ottilie_nash` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_benedikt_sohl` | 静钟堡典狱本尼迪克特·索尔 | 四 | N | 指纹句：钥匙在我这。你要的是门，还是门后的人？ | `self_benedikt_sohl`、`secret_benedikt_sohl`、`person_benedikt_sohl` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_gertrud_ahn` | 退休审判官格特鲁德·安 | 四 | N | 指纹句：我教她们问。我没教她们烧。 | `self_gertrud_ahn`、`secret_gertrud_ahn`、`person_gertrud_ahn` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_tobias_vell` | 碑庭园丁托比亚斯·维尔 | 四 | N | 指纹句：这里的草长得慢。光太多了。 | `self_tobias_vell`、`secret_tobias_vell`、`person_tobias_vell` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_etienne_whitewax` | 圣器匠艾蒂安·白蜡 | 四 | N | 指纹句：器没有信仰。器只记得是谁的手。 | `self_etienne_whitewax`、`secret_etienne_whitewax`、`person_etienne_whitewax` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_roderick_gul` | 召唤院法阵师罗德里克·古尔 | 四 | N | 指纹句：这阵只有一个方向。我修了四十年，从没见它倒转过。 | `self_roderick_gul`、`secret_roderick_gul`、`person_roderick_gul` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_adrien_aubel` | 圣骑士团副团长阿德里安·奥贝尔 | 四 | N | 指纹句：盾不问对面是谁。盾只问身后是谁。 | `self_adrien_aubel`、`secret_adrien_aubel`、`person_adrien_aubel` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_camille_deva` | 圣殿卫队长卡米尔·德瓦 | 四 | N | 指纹句：地上的人不需要知道。地下的人知道就够了。 | `self_camille_deva`、`secret_camille_deva`、`person_camille_deva` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_oswin_grey` | 审判庭首席执行官奥斯温·格雷 | 四 | N | 指纹句：门是伤口。缝上之前，先烧干净。 | `self_oswin_grey`、`secret_oswin_grey`、`person_oswin_grey` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_elaine_carr` | 侍从骑士伊莲·卡尔 | 四 | N | 指纹句：大团长等了八十年。我不能让他再等一个八十年。 | `self_elaine_carr`、`secret_elaine_carr`、`person_elaine_carr` | N 30 | 无（状态差异用 when） | 人物（二）3.1 | M3 |
| `ln_maximilian` | 皇侄马克西米连 | 四 | N | 指纹句：剑冠不是给最强的人，是给军团长们肯跪的人。 | `self_maximilian`、`secret_maximilian`、`person_maximilian` | N 30 | 无（状态差异用 when） | 人物（二）3.2 | M3 |
| `ln_edgar_fink` | 灰档司长埃德加·芬克 | 四 | N | 指纹句：灰档里没有好人坏人，只有有用和没用。 | `self_edgar_fink`、`secret_edgar_fink`、`person_edgar_fink` | N 30 | 无（状态差异用 when） | 人物（二）3.2 | M3 |
| `ln_verena_koch` | 度支卿维瑞娜·科赫 | 四 | N | 指纹句：帝国不欠钱。帝国只是先拿货。 | `self_verena_koch`、`secret_verena_koch`、`person_verena_koch` | N 30 | 无（状态差异用 when） | 人物（二）3.2 | M3 |
| `ln_vitalis_ord` | 帝国大主教维塔利斯·奥德 | 四 | N | 指纹句：陛下的剑归陛下，陛下的魂归光。 | `self_vitalis_ord`、`secret_vitalis_ord`、`person_vitalis_ord` | N 30 | 无（状态差异用 when） | 人物（二）3.2 | M3 |
| `ln_isadora_von_glen` | 旧贵族派首领伊莎多拉·冯·格伦 | 四 | N | 指纹句：剑能夺冠。可冠要吃饭。 | `self_isadora_von_glen`、`secret_isadora_von_glen`、`person_isadora_von_glen` | N 30 | 无（状态差异用 when） | 人物（二）3.2 | M3 |
| `ln_taddeo_val` | 红砾城斗场主塔德奥·瓦尔 | 四 | N | 指纹句：在我的场子里，输的人也要输得有人记得。 | `self_taddeo_val`、`secret_taddeo_val`、`person_taddeo_val` | N 30 | 无（状态差异用 when） | 人物（二）3.2 | M3 |
| `ln_sive_fell` | 斗场冠军席薇·费尔 | 四 | F | 指纹句：倒了算你的。我没倒过。 | `self_sive_fell`、`secret_sive_fell`、`person_sive_fell` | F 70 | act4、act5 | 人物（二）3.2 | M3 |
| `ln_johanna_schmieding` | 兵工监大匠约翰娜·施密丁 | 四 | N | 指纹句：名器是一个人的事。军械是一万个人的命。 | `self_johanna_schmieding`、`secret_johanna_schmieding`、`person_johanna_schmieding` | N 30 | 无（状态差异用 when） | 人物（二）3.2 | M3 |
| `ln_bernhard_amboss` | 老铁匠贝恩哈德·安博斯 | 四 | N | 指纹句：剑是好剑。手不行，换手。 | `self_bernhard_amboss`、`secret_bernhard_amboss`、`person_bernhard_amboss` | N 30 | 无（状态差异用 when） | 人物（二）3.2 | M3 |
| `ln_luise_schnee` | 面摊老板娘露易丝·施内 | 四 | N | 指纹句：汤要趁热。话可以凉一凉再说。 | `self_luise_schnee`、`secret_luise_schnee`、`person_luise_schnee` | N 30 | 无（状态差异用 when） | 人物（二）3.2 | M3 |
| `ln_renata_hock` | 剑卫长雷娜塔·霍克 | 四 | N | 指纹句：陛下在，我在剑后。陛下不在，我就是剑。 | `self_renata_hock`、`secret_renata_hock`、`person_renata_hock` | N 30 | 无（状态差异用 when） | 人物（二）3.2 | M3 |
| `ln_branka_voss` | 断剑会战祭布兰卡·沃斯 | 四 | N | 指纹句：名字刻上墙，他就不算白死。 | `self_branka_voss`、`secret_branka_voss`、`person_branka_voss` | N 30 | 无（状态差异用 when） | 人物（二）3.2 | M3 |
| `ln_ivo_rada` | 第三军团长伊沃·拉达 | 四 | N | 指纹句：我带你下去。看完了，就当没下去过。 | `self_ivo_rada`、`secret_ivo_rada`、`person_ivo_rada` | N 30 | 无（状态差异用 when） | 人物（二）3.2 | M3 |
| `ln_ludmila_tsarn` | 战法师团长卢德米拉·察恩 | 四 | N | 指纹句：火不挑人。所以人要挑准火。 | `self_ludmila_tsarn`、`secret_ludmila_tsarn`、`person_ludmila_tsarn` | N 30 | 无（状态差异用 when） | 人物（二）3.2 | M3 |
| `ln_horst_wisse` | 驿运总长霍斯特·维塞 | 四 | N | 指纹句：路通了，饭碗不能断。 | `self_horst_wisse`、`secret_horst_wisse`、`person_horst_wisse` | N 30 | 无（状态差异用 when） | 人物（二）3.2 | M3 |
| `ln_gina_mora` | 港口行会会首吉娜·莫拉 | 四 | N | 指纹句：船靠钱开。可绳子是我们解的。 | `self_gina_mora`、`secret_gina_mora`、`person_gina_mora` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_silvio_betto` | 宪章馆长西尔维奥·贝托 | 四 | N | 指纹句：宪章写着'不许一家独大'。我只是念大声一点。 | `self_silvio_betto`、`secret_silvio_betto`、`person_silvio_betto` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_mordy_copperclasp` | 汇票局总监莫迪·铜扣 | 四 | N | 指纹句：钱是纸，纸是信。信是什么？我还在算。 | `self_mordy_copperclasp`、`secret_mordy_copperclasp`、`person_mordy_copperclasp` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_herda_scaleheart` | 金秤神殿大司祭赫尔达·秤心 | 四 | N | 指纹句：账上没有的东西，就不在这里。可它在。 | `self_herda_scaleheart`、`secret_herda_scaleheart`、`person_herda_scaleheart` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_celeste_vallo` | 盐镜秤主塞莱斯特·瓦洛 | 四 | N | 指纹句：盐不认神，只认锅。 | `self_celeste_vallo`、`secret_celeste_vallo`、`person_celeste_vallo` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_horace_fenn` | 秤主霍勒斯·费恩 | 四 | N | 指纹句：我和哈特先生？对价关系。 | `self_horace_fenn`、`secret_horace_fenn`、`person_horace_fenn` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_liz_threadhammer` | 裁缝莉兹·线锤 | 四 | N | 指纹句：三件套。他说那叫'铠甲'。 | `self_liz_threadhammer`、`secret_liz_threadhammer`、`person_liz_threadhammer` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_penny_quickscale` | 交易所司钟佩妮·快秤 | 四 | N | 指纹句：钟响之前都是谣言，钟响之后都是价格。 | `self_penny_quickscale`、`secret_penny_quickscale`、`person_penny_quickscale` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_orlando_steyr` | 秤桥执政奥兰多·斯泰尔 | 四 | N | 指纹句：桥只有一座。两边都想让它朝自己倒。 | `self_orlando_steyr`、`secret_orlando_steyr`、`person_orlando_steyr` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_cici_conchhorn` | 沉船湾潜者茜茜·螺号 | 四 | N | 指纹句：下面有东西在等退潮。不是我。 | `self_cici_conchhorn`、`secret_cici_conchhorn`、`person_cici_conchhorn` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_rosie_hillcake` | 麦铃乡"六餐妈妈"罗茜·丘饼 | 四 | N | 指纹句：先吃。吃完了再说你要什么。 | `self_rosie_hillcake`、`secret_rosie_hillcake`、`person_rosie_hillcake` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_bodin_emberbeard` | 赤砧山炉长鲍丁·烬须 | 四 | N | 指纹句：炉火不熄，是因为有人替它憋着一口气。 | `self_bodin_emberbeard`、`secret_bodin_emberbeard`、`person_bodin_emberbeard` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_igva_whiteanvil` | 深炉大匠伊格瓦·白砧 | 四 | N | 指纹句：金子会说谎。炉心金不会。 | `self_igva_whiteanvil`、`secret_igva_whiteanvil`、`person_igva_whiteanvil` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_haldin_stonewitness` | 契石官哈尔丁·石证 | 四 | N | 指纹句：签字之前你还能后悔。签字之后，后悔要付钱。 | `self_haldin_stonewitness`、`secret_haldin_stonewitness`、`person_haldin_stonewitness` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_herka_ironjaw` | 盾墙将赫尔卡·铁颚 | 四 | N | 指纹句：契约写到哪，盾就举到哪。 | `self_herka_ironjaw`、`secret_herka_ironjaw`、`person_herka_ironjaw` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_kern_firegate` | 晶炮师柯恩·火门 | 四 | N | 指纹句：炮不问城是谁的。炮只问晶够不够。 | `self_kern_firegate`、`secret_kern_firegate`、`person_kern_firegate` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_marei_mossstone` | 矿镇医者玛蕾·苔石 | 四 | N | 指纹句：山上的炉越旺，山下的咳越多。 | `self_marei_mossstone`、`secret_marei_mossstone`、`person_marei_mossstone` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_otta_coalhand` | 扫炉人欧塔·煤手 | 四 | N | 指纹句：我扫的不是灰。我扫的是账。 | `self_otta_coalhand`、`secret_otta_coalhand`、`person_otta_coalhand` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_flora_bellstring` | 铃路会运务长弗洛拉·铃串 | 四 | N | 指纹句：铃响三声是平安。铃不响，就是我在路上。 | `self_flora_bellstring`、`secret_flora_bellstring`、`person_flora_bellstring` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_oddie_roundstone` | 老信差欧迪·圆石 | 四 | N | 指纹句：信慢一点不要紧。要紧的是到。 | `self_oddie_roundstone`、`secret_oddie_roundstone`、`person_oddie_roundstone` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_damian_soto` | 金秤军团副团长达米安·索托 | 四 | N | 指纹句：条款第三款：逃兵按违约处理。我只是执行。 | `self_damian_soto`、`secret_damian_soto`、`person_damian_soto` | N 30 | 无（状态差异用 when） | 人物（二）3.3 | M3 |
| `ln_othelan_deeproot` | 长老奥瑟兰·沉根 | 四 | N | 指纹句：树记得每一道斧痕。所以树不说话。 | `self_othelan_deeproot`、`secret_othelan_deeproot`、`person_othelan_deeproot` | N 30 | 无（状态差异用 when） | 人物（二）3.4 | M3 |
| `ln_invela_stillmoss` | 静苔先知茵薇拉 | 四 | N | 指纹句：我闭着眼，是因为睁着看见的太少。 | `self_invela_stillmoss`、`secret_invela_stillmoss`、`person_invela_stillmoss` | N 30 | 无（状态差异用 when） | 人物（二）3.4 | M3 |
| `ln_tarien_greenstring` | 苍弦游猎长塔里恩 | 四 | N | 指纹句：我的鹰看得见你。我还没决定要不要让箭也看见。 | `self_tarien_greenstring`、`secret_tarien_greenstring`、`person_tarien_greenstring` | N 30 | 无（状态差异用 when） | 人物（二）3.4 | M3 |
| `ln_samira_mossycrown` | 德鲁伊环首萨米拉 | 四 | N | 指纹句：林子会自己长回来。前提是你别再砍。 | `self_samira_mossycrown`、`secret_samira_mossycrown`、`person_samira_mossycrown` | N 30 | 无（状态差异用 when） | 人物（二）3.4 | M3 |
| `ln_kaelen_brokenarrow` | 年轻游猎者卡伦 | 四 | N | 指纹句：你们的斧头比你们的命长。 | `self_kaelen_brokenarrow`、`secret_kaelen_brokenarrow`、`person_kaelen_brokenarrow` | N 30 | 无（状态差异用 when） | 人物（二）3.4 | M3 |
| `ln_lisera_mistleaf` | 林缘集市主莉瑟拉 | 四 | N | 指纹句：森林不收金币。森林收你的承诺，按年算。 | `self_lisera_mistleaf`、`secret_lisera_mistleaf`、`person_lisera_mistleaf` | N 30 | 无（状态差异用 when） | 人物（二）3.4 | M3 |
| `ln_saren_twiggather` | 弓匠萨伦·拾枝 | 四 | N | 指纹句：活树不给弓。死树才肯。 | `self_saren_twiggather`、`secret_saren_twiggather`、`person_saren_twiggather` | N 30 | 无（状态差异用 when） | 人物（二）3.4 | M3 |
| `ln_vilu_moonshuttle` | 织匠薇露 | 四 | N | 指纹句：布记得手。好布记得歌。 | `self_vilu_moonshuttle`、`secret_vilu_moonshuttle`、`person_vilu_moonshuttle` | N 30 | 无（状态差异用 when） | 人物（二）3.4 | M3 |
| `ln_borga_greybadger` | 林居兽人德鲁伊博尔加 | 四 | N | 指纹句：精灵看树，我看树下的洞。 | `self_borga_greybadger`、`secret_borga_greybadger`、`person_borga_greybadger` | N 30 | 无（状态差异用 when） | 人物（二）3.4 | M3 |
| `ln_eslin_brokenstring` | 外放者乐师埃斯林 | 四 | F | 指纹句：这首歌很长。长到唱完的人都不在了。 | `self_eslin_brokenstring`、`secret_eslin_brokenstring`、`person_eslin_brokenstring` | F 70 | act4 到 act6 | 人物（二）3.4 | M3 |
| `ln_ophira_doorsong` | 隐村门歌母奥菲拉 | 四 | N | 指纹句：门开了，就别站在门口哭。进来。 | `self_ophira_doorsong`、`secret_ophira_doorsong`、`person_ophira_doorsong` | N 30 | 无（状态差异用 when） | 人物（二）3.4 | M3 |
| `ln_aivina_dawndew` | 晨露医者艾薇娜 | 四 | N | 指纹句：我不治伤口。我治让伤口不愈的东西。 | `self_aivina_dawndew`、`secret_aivina_dawndew`、`person_aivina_dawndew` | N 30 | 无（状态差异用 when） | 人物（二）3.4 | M3 |
| `ln_nia_whitefrost` | 霜林哨长尼娅 | 四 | N | 指纹句：北边的天空最近太吵了。 | `self_nia_whitefrost`、`secret_nia_whitefrost`、`person_nia_whitefrost` | N 30 | 无（状态差异用 when） | 人物（二）3.4 | M3 |
| `ln_taka_windear` | 疾耳部酋长塔卡 | 四 | N | 指纹句：我只送信。送到哪是风的事。 | `self_taka_windear`、`secret_taka_windear`、`person_taka_windear` | N 30 | 无（状态差异用 when） | 人物（二）3.5 | M3 |
| `ln_borek_turnsoil` | 獠牙部酋长博勒克 | 四 | N | 指纹句：饿了就抢。抢不到就打。打不过就再饿一冬。 | `self_borek_turnsoil`、`secret_borek_turnsoil`、`person_borek_turnsoil` | N 30 | 无（状态差异用 when） | 人物（二）3.5 | M3 |
| `ln_targan_ironhorn` | 角兽骑兵长塔尔干 | 四 | N | 指纹句：角低下来的时候，草原就安静了。 | `self_targan_ironhorn`、`secret_targan_ironhorn`、`person_targan_ironhorn` | N 30 | 无（状态差异用 when） | 人物（二）3.5 | M3 |
| `ln_maka_ninespot` | 斑影部酋长玛卡 | 四 | N | 指纹句：斑影不效忠。斑影交货。 | `self_maka_ninespot`、`secret_maka_ninespot`、`person_maka_ninespot` | N 30 | 无（状态差异用 when） | 人物（二）3.5 | M3 |
| `ln_dusa_rifthorn` | 红帐营战祭杜萨 | 四 | N | 指纹句：母亲太慢了。大姐来得快。 | `self_dusa_rifthorn`、`secret_dusa_rifthorn`、`person_dusa_rifthorn` | N 30 | 无（状态差异用 when） | 人物（二）3.5 | M3 |
| `ln_hoya_thousandcarve` | 骨角匠霍娅 | 四 | N | 指纹句：骨头会说话。你得先听它说完。 | `self_hoya_thousandcarve`、`secret_hoya_thousandcarve`、`person_hoya_thousandcarve` | N 30 | 无（状态差异用 when） | 人物（二）3.5 | M3 |
| `ln_sera_silenthorn` | 祖灵冢守冢人瑟拉 | 四 | N | 指纹句：嘘。他们在说话。 | `self_sera_silenthorn`、`secret_sera_silenthorn`、`person_sera_silenthorn` | N 30 | 无（状态差异用 when） | 人物（二）3.5 | M3 |
| `ln_nuun_windahead` | 疾耳信使努恩 | 四 | F | 指纹句：我跑在风前面。别问我从哪学的。 | `self_nuun_windahead`、`secret_nuun_windahead`、`person_nuun_windahead` | F 70 | act4、act5 | 人物（二）3.5 | M3 |
| `ln_inka_belltail` | 毡市主茵卡 | 四 | N | 指纹句：风牙的东西都在这。价钱也在风里。 | `self_inka_belltail`、`secret_inka_belltail`、`person_inka_belltail` | N 30 | 无（状态差异用 when） | 人物（二）3.5 | M3 |
| `ln_elis_silverhorn` | 少主埃利斯 | 四 | N | 指纹句：王座空着。我只想坐那张长椅。 | `self_elis_silverhorn`、`secret_elis_silverhorn`、`person_elis_silverhorn` | N 30 | 无（状态差异用 when） | 人物（二）3.6 | M3 |
| `ln_hesta_greyminister` | 灰魔宰辅赫丝塔 | 四 | N | 指纹句：角位高的人打仗，角位低的人记账。账才知道死了多少。 | `self_hesta_greyminister`、`secret_hesta_greyminister`、`person_hesta_greyminister` | N 30 | 无（状态差异用 when） | 人物（二）3.6 | M3 |
| `ln_satis_sheddedledger` | 度支官萨缇斯 | 四 | N | 指纹句：每蜕一次皮，我都把旧账留在旧皮里。 | `self_satis_sheddedledger`、`secret_satis_sheddedledger`、`person_satis_sheddedledger` | N 30 | 无（状态差异用 when） | 人物（二）3.6 | M3 |
| `ln_nefra_silentscale` | 谍报长涅芙拉 | 四 | N | 指纹句：你吃过的每一口，我都先尝过。 | `self_nefra_silentscale`、`secret_nefra_silentscale`、`person_nefra_silentscale` | N 30 | 无（状态差异用 when） | 人物（二）3.6 | M3 |
| `ln_osta_nightlamp` | 夜后派将军奥丝塔 | 四 | N | 指纹句：夜里我们看得见。白天，我们只是记得。 | `self_osta_nightlamp`、`secret_osta_nightlamp`、`person_osta_nightlamp` | N 30 | 无（状态差异用 when） | 人物（二）3.6 | M3 |
| `ln_moz_blackanvil` | 迎王派将军莫兹 | 四 | N | 指纹句：新王来了，赤角山地就不用再种葡萄了。 | `self_moz_blackanvil`、`secret_moz_blackanvil`、`person_moz_blackanvil` | N 30 | 无（状态差异用 when） | 人物（二）3.6 | M3 |
| `ln_kamu_beastbinder` | 契约术士卡穆 | 四 | N | 指纹句：它们不是兵。它们是借来的澱。 | `self_kamu_beastbinder`、`secret_kamu_beastbinder`、`person_kamu_beastbinder` | N 30 | 无（状态差异用 when） | 人物（二）3.6 | M3 |
| `ln_uga_brokenhorn` | 试锋谷祭斗长乌加 | 四 | N | 指纹句：藏着的刀，就当它是钝的。 | `self_uga_brokenhorn`、`secret_uga_brokenhorn`、`person_uga_brokenhorn` | N 30 | 无（状态差异用 when） | 人物（二）3.6 | M3 |
| `ln_selu_newshed` | 鳞书记赛露 | 四 | N | 指纹句：鳞书不评，只记。可记多了，就会说话。 | `self_selu_newshed`、`secret_selu_newshed`、`person_selu_newshed` | N 30 | 无（状态差异用 when） | 人物（二）3.6 | M3 |
| `ln_bruka_coldhammer` | 夜铁匠布鲁卡 | 四 | N | 指纹句：夜铁冷。人得热。 | `self_bruka_coldhammer`、`secret_bruka_coldhammer`、`person_bruka_coldhammer` | N 30 | 无（状态差异用 when） | 人物（二）3.6 | M3 |
| `ln_sui_mistscale` | 夜纱织工苏伊 | 四 | N | 指纹句：光进不来的地方，人才睡得着。 | `self_sui_mistscale`、`secret_sui_mistscale`、`person_sui_mistscale` | N 30 | 无（状态差异用 when） | 人物（二）3.6 | M3 |
| `ln_tam_hornless` | 隶民组织者塔姆 | 四 | N | 指纹句：王座谁坐都一样。矿里的灯，得有人点。 | `self_tam_hornless`、`secret_tam_hornless`、`person_tam_hornless` | N 30 | 无（状态差异用 when） | 人物（二）3.6 | M3 |
| `ln_bri_ladle` | 黯冠城御厨布莉 | 四 | N | 指纹句：打赢了又怎样？汤还是得有人煮。 | `self_bri_ladle`、`secret_bri_ladle`、`person_bri_ladle` | N 30 | 无（状态差异用 when） | 人物（二）3.6 | M3 |
| `ln_liv_swiftwing` | 翼魔少女莉芙 | 四 | F | 指纹句：飞得高的不一定看得远。看得远的，一定飞过。 | `self_liv_swiftwing`、`secret_liv_swiftwing`、`person_liv_swiftwing` | F 70 | act4、act5 | 人物（二）3.6 | M3 |
| `ln_setik_abysslistener` | 守渊祭司赛提克 | 四 | N | 指纹句：渊在吸气。不是对着我们。 | `self_setik_abysslistener`、`secret_setik_abysslistener`、`person_setik_abysslistener` | N 30 | 无（状态差异用 when） | 人物（二）3.6 | M3 |
| `ln_olo` | 青之古龙奥洛 | 四 | N | 指纹句：你问天有多高。我只能告诉你，它有顶。 | `self_olo`、`secret_olo`、`person_olo` | N 30 | 无（状态差异用 when） | 人物（二）3.7 | M3 |
| `ln_eld_rahn` | 观穹台星守埃尔德·拉恩 | 四 | N | 指纹句：星星从不迟到。这才可怕。 | `self_eld_rahn`、`secret_eld_rahn`、`person_eld_rahn` | N 30 | 无（状态差异用 when） | 人物（二）3.7 | M3 |
| `ln_sibylla_von_wahl` | 云阶城守西比拉·冯·瓦尔 | 四 | N | 指纹句：隘口只有一条路。路的两头都恨我。 | `self_sibylla_von_wahl`、`secret_sibylla_von_wahl`、`person_sibylla_von_wahl` | N 30 | 无（状态差异用 when） | 人物（二）3.7 | M3 |
| `ln_halva_icepick` | 霜镐营工头哈尔瓦·冰镐 | 四 | N | 指纹句：天上掉铁，地下藏鳞。你挑一样。 | `self_halva_icepick`、`secret_halva_icepick`、`person_halva_icepick` | N 30 | 无（状态差异用 when） | 人物（二）3.7 | M3 |
| `ln_yegor` | 拾蜕人叶戈尔 | 四 | N | 指纹句：龙睡着的时候最慷慨。 | `self_yegor`、`secret_yegor`、`person_yegor` | N 30 | 无（状态差异用 when） | 人物（二）3.7 | M3 |
| `ln_anai_tidepearl` | 潮民珍珠商阿娜伊 | 四 | N | 指纹句：雾不吃船。雾只是不让船过去。 | `self_anai_tidepearl`、`secret_anai_tidepearl`、`person_anai_tidepearl` | N 30 | 无（状态差异用 when） | 人物（二）3.7 | M3 |
| `ln_moku_tidepilot` | 老引水人莫库 | 四 | N | 指纹句：我掉过一次头。不想掉第二次。 | `self_moku_tidepilot`、`secret_moku_tidepilot`、`person_moku_tidepilot` | N 30 | 无（状态差异用 when） | 人物（二）3.7 | M3 |
| `ln_vaira_bonelistener` | 鲸骨岛守骨人瓦伊拉 | 四 | N | 指纹句：它不是魔。它只是吃了太多不该吃的东西。 | `self_vaira_bonelistener`、`secret_vaira_bonelistener`、`person_vaira_bonelistener` | N 30 | 无（状态差异用 when） | 人物（二）3.7 | M3 |
| `ln_silas_venn` | 黑档官塞拉斯·维恩 | 四 | N | 指纹句：水晶不会错。所以错的一定是世界。 | `self_silas_venn`、`secret_silas_venn`、`person_silas_venn` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_hans_auger` | 总堂考官长汉斯·奥格 | 四 | N | 指纹句：规章里没有给国王开的例外。也没有给神开的。 | `self_hans_auger`、`secret_hans_auger`、`person_hans_auger` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_evelyn_hurst` | S 级冒险者伊芙琳·赫斯特 | 四 | N | 指纹句：冰很诚实。冻住了就是冻住了。 | `self_evelyn_hurst`、`secret_evelyn_hurst`、`person_evelyn_hurst` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_baso_stonefist` | A 级冒险者巴索·石拳 | 四 | F | 指纹句：魔物，打。人，加钱也不打。 | `self_baso_stonefist`、`secret_baso_stonefist`、`person_baso_stonefist` | F 70 | act4、act5 | 人物（二）3.8 | M3 |
| `ln_gregor_rehn` | 公会理事葛雷哥·雷恩 | 四 | N | 指纹句：公会不站队。谁让我们站，谁就是敌人。 | `self_gregor_rehn`、`secret_gregor_rehn`、`person_gregor_rehn` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_constance_rhein` | 学监康斯坦斯·莱茵 | 四 | N | 指纹句：知识要活下来，有时就得先装死。 | `self_constance_rhein`、`secret_constance_rhein`、`person_constance_rhein` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_samuel_gran` | 沉默书库守塞缪尔·格兰 | 四 | N | 指纹句：这里不点灯。书怕火，人怕看见。 | `self_samuel_gran`、`secret_samuel_gran`、`person_samuel_gran` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_vig_holm` | 澱测绘院长薇格·霍尔姆 | 四 | N | 指纹句：数字不信神。数字只是往上走。 | `self_vig_holm`、`secret_vig_holm`、`person_vig_holm` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_felix_fehling` | 录纹大师费利克斯·费林 | 四 | N | 指纹句：纸记住字，字记住人。可有些人，纸不肯记。 | `self_felix_fehling`、`secret_felix_fehling`、`person_felix_fehling` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_nika_wen` | 自由派研究员妮卡·温 | 四 | N | 指纹句：你们怕门。我只是想知道它怎么转。 | `self_nika_wen`、`secret_nika_wen`、`person_nika_wen` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_lune_beck` | 会盟书记卢恩·贝克 | 四 | N | 指纹句：我只记，不评。可我的笔不听话。 | `self_lune_beck`、`secret_lune_beck`、`person_lune_beck` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_gilbert_nos` | 金湾钥司吉尔伯特·诺斯 | 四 | N | 指纹句：账总有一天会平。门开了，就平了。 | `self_gilbert_nos`、`secret_gilbert_nos`、`person_gilbert_nos` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_ivan_rut` | 红砾城钥司伊万·鲁特 | 四 | N | 指纹句：我的剑鞘是空的。剑被斗场收走了。 | `self_ivan_rut`、`secret_ivan_rut`、`person_ivan_rut` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_cerise_lan` | 瑟兰钥司瑟西·兰 | 四 | N | 指纹句：灯照得出门纹。照不出人心。 | `self_cerise_lan`、`secret_cerise_lan`、`person_cerise_lan` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_nerel_doorscent` | 执钥人内勒 | 四 | N | 指纹句：门纹有一股雨前的味道。你身上也有，只是没有纹。 | `self_nerel_doorscent`、`secret_nerel_doorscent`、`person_nerel_doorscent` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_kai_twineye` | 钥使卡伊 | 四 | N | 指纹句：两边都不要我。那我就两边都用。 | `self_kai_twineye`、`secret_kai_twineye`、`person_kai_twineye` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_milo_thresh` | 槛众少年米洛 | 四 | N | 指纹句：他们说妹妹在门那边。我得去门那边。 | `self_milo_thresh`、`secret_milo_thresh`、`person_milo_thresh` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_ida_wick` | "半扇门"酒馆老板伊妲·维克 | 四 | N | 指纹句：门留一道缝。风进来，人也进来。 | `self_ida_wick`、`secret_ida_wick`、`person_ida_wick` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_linn_keyling` | 执钥人队长林恩 | 四 | N | 指纹句：奶奶说门是用来进的。我想试试。 | `self_linn_keyling`、`secret_linn_keyling`、`person_linn_keyling` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |
| `ln_hervik_coldfire` | 铁誓团副团长赫维克 | 四 | N | 指纹句：合同上写不出来的活，才值钱。 | `self_hervik_coldfire`、`secret_hervik_coldfire`、`person_hervik_coldfire` | N 30 | 无（状态差异用 when） | 人物（二）3.8 | M3 |

### 9.7 第五幕首登（M3，5 包）

| 台词包 | 名 | 首登 | 类别 | 口吻要点 | 专属话题 | 最低量 | 按幕变体 | 锚点与人设出处 | 批次 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ln_eska` | 原龙艾斯卡 | 五 | K | 每次一到两句，长停顿；只答一个问题 | `self_eska`、`person_eska` | K 80 | act5、act6 | 角色设定集 7.1；人物（二）2.1 | M3 |
| `ln_vena_vinewidow` | 霜角之妹维娜 | 五 | N | 指纹句：他十四岁，只会种葡萄。你们叫他魔王。 | `self_vena_vinewidow`、`secret_vena_vinewidow`、`person_vena_vinewidow` | N 30 | 无（状态差异用 when） | 人物（二）3.6 | M3 |
| `ln_serenka` | 赤之古龙瑟伦卡 | 五 | N | 指纹句：……再睡一会儿。外面还那么吵吗。 | `self_serenka`、`secret_serenka`、`person_serenka` | N 30 | 无（状态差异用 when） | 人物（二）3.7 | M3 |
| `ln_gola` | 白之古龙歌菈 | 五 | N | 指纹句：……谁在刮我的背。 | `self_gola`、`secret_gola`、`person_gola` | N 30 | 无（状态差异用 when） | 人物（二）3.7 | M3 |
| `ln_oren_greyhood` | 守墓人奥伦 | 五 | N | 指纹句：他替我死了一回。我替他守三百年，还不够。 | `self_oren_greyhood`、`secret_oren_greyhood`、`person_oren_greyhood` | N 30 | 无（状态差异用 when） | 人物（二）3.7 | M3 |

### 9.8 第六幕与终章

第六幕与终章没有新首登的有名人物：审庭的证人、后日谈的人物都是前五幕的人，他们的第六幕台词写在本人包的 `acts.act6` 与 `acts.epilogue` 覆盖里（M3）。

### 9.9 队内闲聊 `ln_party`

| 台词包 | 内容 | 段数与句数 | 出处 | 批次 |
| --- | --- | --- | --- | --- |
| `ln_party` | 同伴之间与同伴对玩家的多人往复短剧（builtin_ai 第 11.3 节）：进入地点、事件之后、行进、营火、关系、幕次六种触发 | 第一幕 20 段约 90 句；全作按 [companions_and_party.md](../systems/companions_and_party.md) 第 10.2 节约 40 个"同伴对乘幕"每个 2 段、关键羁绊对每个再加 5 段，合计约 120 段、480 句 | 角色设定集第 9.3 节的关键羁绊对；分幕文档的营火与事件 | 第一幕 M1；第二、三幕 M2；第四到第六幕 M3 |

## 10. 句数统计与撰写批次

### 10.1 全作句数（下限）

| 类 | 包或池 | 每个的下限 | 全作下限 | M1 已写 |
| --- | --- | --- | --- | --- |
| 女神 G | 6 | 250 | 1,500 | 460（序章、第一幕与跨幕基础） |
| 主要同伴 C | 13 | 200 | 2,600 | 921（夜羽、希雅、罗恩、欧拉已达标；奈拉、卡西安、玛莎第一幕按核心写，计入下一行） |
| 核心 L1 K | 16（另有 3 名入队前按 K 写的同伴） | 80 | 1,280 | 652（阿什、布伦、莫斯，及奈拉、卡西安、玛莎的第一幕部分） |
| 随行同伴 F | 10 | 70 | 700 | 90（德里斯） |
| 其余有名 N | 326 | 30 | 9,780 | 1,167（第一幕 30 包） |
| 居民模板 T | 32 | 20 | 640 | 397（第一幕 17 个） |
| 吠叫池 B | 48 | 30 | 1,440 | 1,440（全部） |
| 通用层 `ln_common` | 1 | 无 | 787 | 787（全部） |
| 角色层 `ln_role_*` | 15 | 无 | 281 | 281（全部） |
| 阶层层 `ln_class_*` | 12 | 无 | 264 | 264（全部） |
| 地区话题通用层 | 每幕一节 | 每个地区话题至少一句 | 约 1,280 | 234（第一幕） |
| 队内闲聊 `ln_party` | 约 120 段 | 2 到 6 句一段 | 约 480 | 91（第一幕 20 段） |
| 合计 | | | 约 21,000 | 6,784 |

重复率的保证：每类的下限乘 builtin_ai 第 14.1 节的窗口，保证窗口内的句子数量够用（核心人物窗口 20 句、问候与反应 7 游戏日不重复，80 句的包在一局里极少重听同一句）；吠叫池每池 30 句、同一人群单元 2 游戏小时不重复，一个地区每游戏日的重复句占比可以压在 15% 以下。

### 10.2 撰写批次

批次与开发计划的里程碑对齐：M1 垂直切片（序章与第一幕）、M2 Alpha（第二、三幕）、M3 Beta（第四到第六幕与终章）、M4 内容完成与打磨。

| 批次 | 文件 | 写什么 | 句数下限 |
| --- | --- | --- | --- |
| M1 | 本文；[catalog_dialogue_lines_act1.md](catalog_dialogue_lines_act1.md) | 共享层（通用、角色、阶层）、48 个吠叫池、话题表、全作台词包清单；序章与第一幕的全部本人包、居民模板 17 个、第一幕任务阶段、第一幕地区话题、第一幕闲聊 | 6,784（已写） |
| M2 | `catalog_dialogue_lines_act2.md`、`catalog_dialogue_lines_act3.md` | 第二幕首登 101 包、第三幕首登 73 包（主要同伴 6、核心 8、随行 4、其余 156）；其余 15 个居民模板；奈拉补足到 200；跨幕人物的 `acts.act2`、`acts.act3`；女神第二、三幕（艾琉恩的神谕各类、经大主教之口的话、瓦尔妲经萨莎与濒死战士的话、梅尔卡经金冠代理人的两头下注、莫伊拉经史官的交易、雅努随封印松动变清晰的梦）；第二、三幕任务阶段；地区话题；闲聊 | 约 8,300 |
| M3 | `catalog_dialogue_lines_act4.md` 到 `catalog_dialogue_lines_act6.md` | 第四、五幕首登 150 包（核心 5、随行 5、其余 140）；卡西安、玛莎补足到 200；跨幕人物的 `acts.act4` 到 `acts.act6`、`acts.epilogue`；女神第四到第六幕（招揽、钥匙失窃、灵泉降影、化身、天启解读、试炼包装、审庭三道防线的立场回应、最后陈述）；审庭证人的证词句；终章与后日谈的街谈与人物去向句；地区话题；闲聊 | 约 6,500 |
| M4 | 全部文件 | 总校：重复率、长度、台账与称谓、雷同、口头禅密度；盲读评审与试玩问卷（builtin_ai 第 14.3 节）；与任务目录、过场目录、女神目录的编号与槽位名对齐；本地化前的文本键冻结 | 修订不加量 |

### 10.3 每批的撰写顺序

1. 读该幕分幕文档的人物表、纷争、任务、桥段与拉远；读人物目录对应节的摘要卡；读台账该幕的禁区。
2. 先在本文第 3.4 节追加该幕的个人话题与新增地区话题，再动笔写包。
3. 写包：先写跨幕人物的 `acts.<幕>` 覆盖，再写首登人物的本人包，再写模板与地区话题，最后写闲聊。
4. 跑内容校验（第 2.6 节全部规则）；句数与必备槽位不达标的包不进数据。
5. 抽 10% 的包做盲读：评审只看文本，判断"像不像这个人"，低于 3.5 分的包返工。

## 11. 新增命名

本文不新增任何人名、地名、物品名；台词里出现的专名全部来自正典、分幕文档与人物目录。本文新登记的编号：

| 类 | 编号 | 数量 |
| --- | --- | --- |
| 共享台词包 | `ln_common`；`ln_role_giver` 等 15 个；`ln_class_peasant` 等 12 个 | 28 |
| 居民模板台词包的命名规则 | `ln_tpl_<模板名>`（模板 ID 归人物目录（一）） | 32 |
| 有名人物台词包 | `ln_<人物 ID>`（人物 ID 归人物目录与角色设定集） | 365 |
| 女神台词包 | `ln_eluen`、`ln_valda`、`ln_merca`、`ln_sylvie`、`ln_moira`、`ln_janu` | 6 |
| 队内闲聊 | `ln_party` 与段编号 `party.<编号>` | 1 |
| 吠叫池 | 第 8.1 节 48 个 | 48 |
| 话题 | 第 3.3 节序章与第一幕 235 个；第 3.4 节第二到第六幕主干 115 个；另加每名有名人物的 `self_<id>`、`secret_<id>`、`person_<id>` | 350 加人物默认话题 |
| 通用层模板族 | `mem.*`、`diary.*`、`rumor.tell.*`、`rumor.when.*`、`rumor.expl.*`、`rumor.tpl.*`、`feat.*`、`expl.*`、`banter.*`、`doc.*`、`interp.*` | 11 族 |
| 女神专用槽位（本文补登） | `react.anchor_a00` 到 `react.anchor_a11`；`react.beat_<x>`；`react.dream_question`、`react.dream_answer_like`、`react.dream_answer_unsure`、`react.dream_answer_dislike`；`react.coin_left`、`react.lie_caught`、`react.request_refuse` | 见左 |
| 条件信号（请求注册） | `order.moral_tag` | 1 |

## 12. 来源链接

- [builtin_ai.md](../systems/builtin_ai.md)：第 5 节（社交、传闻、记忆、日记、反应表、凡人不信、群众）、第 6 节（话题图、意图、拒答）、第 7 节（台词包契约）、第 8.8 节（女神台词）、第 11.3、11.4 节（队内闲聊）、第 12.4、12.7 节（过度解读与文书）、第 14.1 节（台词量与重复率）。
- [decision_log.md](../../00_vision/decision_log.md)：D-010、D-030、D-064、D-067、D-068、D-073、D-076、D-077。
- [content_bible.md](content_bible.md)：第 9.2 节（功能角色）、第 12 节（命名空间）。
- [characters.md](../../30_story/characters.md)：第 1 到 7 节（口吻、口头禅、必须保持与绝不会做）、第 8 节（同伴总表）。
- [pantheon.md](../../20_world/pantheon.md)：第 0 到 6 节（女神说话方式）、第 9 节（锚点台词）。
- [society.md](../../20_world/society.md)：第 1 节（阶层）、第 7.4 节（传闻失真）、第 8 节（凡人不信的社会学）。
- [reveal_ledger.md](../../30_story/reveal_ledger.md)：第 0.2 节（装配规则）、第 2、3 节（线索与解锁条件）、第 4 节（锚点）、第 5 节（误导表）、第 6 节（称谓开放表）、第 8 节（泄露禁区）。
- [prologue_antechamber.md](../../30_story/arcs/prologue_antechamber.md)、[act1_borderstone.md](../../30_story/arcs/act1_borderstone.md)。
- [catalog_characters_lotha.md](catalog_characters_lotha.md)、[catalog_characters_continent.md](catalog_characters_continent.md)：全部有名人物、居民模板与说话指纹。
- [reputation_and_cognition.md](../systems/reputation_and_cognition.md)：第 3 节（解释库、认知状态机）、第 4 节（传闻失真）、第 9 节（过度解读）、第 10 节（喜剧桥段）。
- [companions_and_party.md](../systems/companions_and_party.md)：第 2 节（名单）、第 8.5 节（红线）、第 10 节（台词需求量）。
- [catalog_goddess_interventions.md](catalog_goddess_interventions.md)：第 1.1 节（女神槽位归属）、第 4 节（写定神行节点）、第 6 节（反应表）、第 10 节（尊名回应）、第 19 节（跨目录接口中给台词目录的槽位清单）。
- [world_state_registry.md](../world_state_registry.md)：第 5 节（条件文法）、第 6 节（任务编号）、第 8 节（变量）。
- 现有数据：`data/dialogue/templates.json`、`data/cognition/lines.json`、`data/cognition/classes.json`、`data/cognition/explanations.json`、`data/npc/personas.json`、`data/npc/schedules.json`、`data/goddess/goddesses.json`。
- 调研依据（只借鉴方法）：[woc_ai_npc.md](../../10_research/ai_npc/woc_ai_npc.md)（固定话题的局限与补法）、[my_ai_town_agents.md](../../10_research/ai_npc/my_ai_town_agents.md)（台词与气泡的节流）。
