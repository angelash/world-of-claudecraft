# 台词包正文：序章与第一幕（Dialogue Lines: Prologue and Act I）

> 归属：`docs/40_design/content/`，台词目录的分幕文件；命名空间 `ln_`、`bark_` 与话题前缀的主人是 [catalog_dialogue_lines.md](catalog_dialogue_lines.md)，本文是序章与第一幕各台词包正文的主人。
> 作用：垂直切片 M1（序章与第一幕，成品品质）的全部无模型台词：六位女神的第一批、第一幕全部有名人物、第一幕可用同伴、第一幕居民模板的本人包；第一幕任务的 `quest.<q_id>.<stage>`；第一幕的 `ln_party`；第一幕地区话题的通用层句。无模型档（D-010、D-068）凭这些句子从序章完整通关第一幕。
> 上游：[catalog_dialogue_lines.md](catalog_dialogue_lines.md)（格式、类别与最低量、话题表、女神槽位对照）；[builtin_ai.md](../systems/builtin_ai.md) 第 6、7 节（契约）；[characters.md](../../30_story/characters.md) 第 1 到 3 节；[pantheon.md](../../20_world/pantheon.md)；[reveal_ledger.md](../../30_story/reveal_ledger.md) 第 0.2、4、5、6、8.0 到 8.2 节；[prologue_antechamber.md](../../30_story/arcs/prologue_antechamber.md)；[act1_borderstone.md](../../30_story/arcs/act1_borderstone.md)；[catalog_characters_lotha.md](catalog_characters_lotha.md) 第 2.1、3.1、3.4、6 节；[companions_and_party.md](../systems/companions_and_party.md)；[catalog_goddess_interventions.md](catalog_goddess_interventions.md) 第 4.1、6、9、10 节；[world_state_registry.md](../world_state_registry.md)；`data/npc/personas.json`。
> 约束：每句受揭示台账约束；第一幕凡人只用俗称（灰气、灰病、荒原病、灰晶、灰狼、灰鬼、灰巨像），只有夜羽与阿什说"澱"；条件只用注册表变量；格式、长度与校验以台词目录第 1.3、2.2、2.6 节为准。
> 下游：`data/dialogue/lines/<包>.json`、`data/dialogue/topics.json`、本地化字符串表；第二幕文件 `catalog_dialogue_lines_act2.md` 从本文的跨幕人物包续写 `acts.act2` 覆盖。

## 0. 一页结论

1. **本批覆盖序章与第一幕的全部说话者。** 6 位女神、4 名第一幕主要同伴、1 名随行同伴、6 名核心人物、30 名其余有名人物、17 个居民模板，外加第一幕的队内闲聊（20 段）与地区话题通用层；共 4012 句，逐包句数见第 9 节。
2. **同伴在本批就写满 200 句。** 夜羽、希雅、罗恩、欧拉的包按台词目录第 1.5 节写满主要同伴的全部必备槽位：三组对话与交易反应、五种战斗吠叫、按道德标签分句的拒绝命令、个人线全部任务阶段；第二幕起的 `acts.act2` 等覆盖由后续批次追加。
3. **女神只在有渠道的地方说话。** 第一幕对玩家开口的只有梅尔卡（硬币、神龛、降影）与雅努（梦）；艾琉恩只有不知对象的尊名回应，瓦尔妲、希尔薇、莫伊拉只有现象。本批写全六位女神的序章部分、锚点、写定节点与跨幕基础反应；第二到第六幕的覆盖、神谕、试炼、招揽与审庭在 M2、M3 批补足到每位 250 句。
4. **核心人物按 80 句写，知情者不进凡人不信。** 奈拉、卡西安、玛莎第一幕是核心人物，入队那一幕再补到 200；阿什第一幕只说写定台词，他的话题本幕一律"还不是时候"，内容版本带后幕条件写好。
5. **任务阶段句写在发布者包里。** 第一幕 13 条主线、23 条支线与 9 条纷争链的对话，编号以任务目录（前）为准，见第 1.3 节。
6. **台账在句子层面落地。** 欧拉的孩子与落叶路、布伦的门纹、玛莎的过去、夜羽的信、阿什的一切，都只在带解锁条件的句子里出现；卡西安、贝莎等真诚地说误导版本（MIS-05、MIS-19、MIS-20），平反之后用 `when` 切到动摇的句子。

## 1. 读法与本批范围

### 1.1 写法

格式以台词目录第 1.3 节为准：一包一节，表格一行一个槽位，同槽多句用"／"分隔，序号即文本键末段，条件写在六角括号里（`when`、`mood`、`place`、`strict`、`first`、`w`）。包头括号写类别、首登幕与本批句数，引用块写口吻、称呼与禁区。

### 1.2 本批的说话者

| 节 | 说话者 | 类别 |
| --- | --- | --- |
| 2 | `ln_eluen`、`ln_valda`、`ln_merca`、`ln_sylvie`、`ln_moira`、`ln_janu` | G |
| 3 | `ln_yeyu`、`ln_shiya`、`ln_ron`、`ln_oola`；`ln_dris` | C；F |
| 4 | `ln_nera`、`ln_cassian`、`ln_martha`、`ln_bron`、`ln_ash`、`ln_moss` | K（前三人入队后补足 C） |
| 5 | `ln_lina`、`ln_hock`、`ln_isa`、`ln_toma`、`ln_bertha`、`ln_greta`、`ln_noi`、`ln_tess`、`ln_barga`、`ln_gaspar`、`ln_nick`、`ln_gorn`、`ln_ako`、`ln_boro`、`ln_barto`、`ln_jed`、`ln_vick`、`ln_seg_oneeye`、`ln_viro`、`ln_popo`、`ln_owen`、`ln_dora`、`ln_ed`、`ln_ped`、`ln_lisa`、`ln_simon`、`ln_marg`、`ln_ulf_lange`、`ln_knut_naumann`、`ln_kas_ropebridge` | N |
| 6 | `ln_tpl_tenant_farmer`、`ln_tpl_miner`、`ln_tpl_woodcutter`、`ln_tpl_herb_woman`、`ln_tpl_peddler`、`ln_tpl_caravan_guard`、`ln_tpl_town_guard`、`ln_tpl_militia`、`ln_tpl_tax_collector`、`ln_tpl_adventurer_fe`、`ln_tpl_adventurer_d`、`ln_tpl_scavenger`、`ln_tpl_smuggler`、`ln_tpl_bandit`、`ln_tpl_hidden_gatefolk`、`ln_tpl_street_urchin`、`ln_tpl_village_priest` | T |
| 7 | `ln_party` 第一幕段 | 闲聊 |
| 8 | `ln_common` 第一幕地区话题 | 通用层 |

伯爵阿达尔贝特第一幕只以来信出现（来信全文是写定文本，见第一幕 9.4 节），他的本人包在第二幕文件。

### 1.3 第一幕任务编号

数据编号以任务目录 [catalog_quests_acts1_3.md](catalog_quests_acts1_3.md) 为准（编号规则见 [world_state_registry.md](../world_state_registry.md) 第 6 节）；下表列出每条任务的阶段句写在谁的包里。

| 显示编号 | 数据编号 | 写在谁的包里 |
| --- | --- | --- |
| A1-M02 | `q_a1_m02_raven_nest` | 夜羽 |
| A1-M03 | `q_a1_m03_unrecorded` | 莉娜 |
| A1-M04 | `q_a1_m04_f_rank_rules` | 布伦；三件委托的进度在玛莎、欧拉、卡西安 |
| A1-M05 | `q_a1_m05_grey_wolf` | 希雅；葛恩备选 |
| A1-M06 | `q_a1_m06_one_night_mine` | 罗恩 |
| A1-M07 | `q_a1_m07_north_spring` | 欧拉 |
| A1-M08 | `q_a1_m08_summons` | 莫斯（传讯） |
| A1-M09 | `q_a1_m09_lamp_of_light` | 卡西安（审判）；莫斯包里写在 `q_a1_m09_lamp_of_light` 下的传讯句，归 `q_a1_m08_summons` |
| A1-M11 | `q_a1_m11_before_dark_moon` | 玛莎（备战）；写在 `q_a1_m12_tide_night` 下的 offer、accept、progress 句归本任务 |
| A1-M12 | `q_a1_m12_tide_night` | 玛莎、夜羽、巴托、瑟格，同伴各写进度与之后 |
| A1-M13 | `q_a1_m13_woman_at_door`（阶段 `letter`） | 布伦、乌尔夫 |
| A1-S01 到 A1-S23 | `q_a1_s01_owen_wagon`、`q_a1_s02_blade_mark`、`q_a1_s03_dice_house`、`q_a1_s04_pact_oak`、`q_a1_s05_burned_shed`、`q_a1_s06_arm_wrestle`、`q_a1_s07_hurt_logger`、`q_a1_s08_salt_price`、`q_a1_s09_coin_origin`、`q_a1_s10_lisa_bundle`、`q_a1_s11_otto_will`、`q_a1_s12_copper_bell`、`q_a1_s13_yeyu_hoard`、`q_a1_s14_grave_lights`、`q_a1_s15_bell_tower`、`q_a1_s16_c_rank_face`、`q_a1_s17_moon_cellar`、`q_a1_s18_bron_drinks`、`q_a1_s19_door_in_you`、`q_a1_s20_nun_testimony`、`q_a1_s21_captain_home`、`q_a1_s22_broken_door_slope`、`q_a1_s23_deer_spring` | 各支线发布者；S12 在 `ln_tpl_peddler` |
| A1-D01 到 A1-D09 | `q_a1_d01_tax_and_bandits`、`q_a1_d02_witch_trial`、`q_a1_d03_salt_and_potions`、`q_a1_d04_forest_dispute`、`q_a1_d05_tavern_eyes`、`q_a1_d06_bron_old_wound`、`q_a1_d07_bakery_betrothal`、`q_a1_d08_otto_mill`、`q_a1_d09_market_theft` | 纷争节点的句子写在参与者的 `progress` 与 `after`，用 `when` 区分节点与结局 |

A1-M01（落门）与 A1-M10（识才）没有发布者，不设任务对话槽；A1-M01 灰烬室的写定台词在阿什的包里，A1-M10 由门的界面呈现。

### 1.4 本批通用约束

- 第一幕凡人的世界：魔物是邪神之秽（MIS-01），荒原是邪神之乱的战场（MIS-02），门纹是烙印（MIS-05），"无记载"是水晶坏了（MIS-06），米洛死于欧拉的巫术（MIS-19，审判结论出来之前）。真诚相信的人说出来不带恶意。
- 任何人不点破"无名之神"是真正的神；边境老人只说"老人们这么叫""别在神父面前提"。
- 镇上势力与诸神的对应一个字都不提。
- 称呼：凡人对玩家用 `{player}`，填充层按信任与认知改写（初见"外乡人""新来的"，之后"那个 F 级怪人""运气好的新人"）；人设卡固定的称呼（夜羽"门把手"、欧拉"小崽子"、玛莎"孩子"）直接写进句子。

## 2. 女神

本节六包是各女神的第一批：序章、第一幕与跨幕基础。第二幕起的按幕覆盖、神谕各类、试炼包装、招揽、交易违约、审庭立场在 M2、M3 批写进同一包，序号接着本批往后排。

#### `ln_eluen` 艾琉恩（女神；首登序章；本批 73 句）

> 口吻：精确、对称、优雅，评判毫不掩饰；"规格""合格""瑕疵""秩序"。称呼：序章"样本""孩子"；第四幕"孩子"（招安）；第五幕"先驱""瑕疵"。禁区：门形空洞是什么、她在怕、大断绝、第六司、魔王本质、地球为何没有神（台账 8.1）；第一幕她以为玩家已死，不对玩家说话。

| 槽位 | 句 |
| --- | --- |
| greet.cold.avatar | 1. 〔when: act == prologue〕站好，样本。／2. 〔when: act >= 4〕你又站到光面前了。说吧，简短。／3. 〔when: act >= 4〕规格外的东西，也懂得来朝见？ |
| greet.neutral.avatar | 1. 〔when: act == prologue〕第五号。请站在光里。／2. 〔when: act >= 4〕孩子，你来了。／3. 〔when: act >= 4〕光在等你开口。 |
| greet.warm.avatar | 1. 〔when: act >= 4〕回到光里来，孩子。／2. 〔when: act >= 4〕你终于肯来了。很好，非常合乎规格。／3. 〔when: act >= 4〕光记得每一个回来的人。 |
| greet.cold.shrine | 1. 〔when: act >= 3〕你不该在这里。／2. 〔when: act >= 3〕光看见你了。退下。／3. 〔when: act >= 4〕在我的祭坛前，你要说什么？ |
| greet.neutral.shrine | 1. 〔when: act >= 4〕光听着。简洁一些。／2. 〔when: act >= 4〕祈祷要合乎规格，孩子。／3. 〔when: act >= 4〕说吧，我在。 |
| greet.warm.shrine | 1. 〔when: act >= 4〕孩子，你肯跪下，这很好。／2. 〔when: act >= 4〕光记下了你的虔诚。／3. 〔when: act >= 4〕愿秩序与你同在。 |
| farewell | 1. 退下吧。／2. 〔when: act == prologue〕下一个。／3. 〔when: act >= 4〕去吧，记住光的话。 |
| topic.gen_self.prologue | 1. 光与秩序之司。你只需要知道这个。／2. 我照看这座庭园，让它合乎规格。 |
| topic.gen_you.prologue | 1. 你是一个登记错误。我正在确认这一点。／2. 一份多出来的样本。合格与否，光会量。 |
| topic.place_antechamber.prologue | 1. 神庭的候见厅。我们是照看你将要去的那座庭园的人。／2. 你站的地方，本该只有四个人站过。 |
| topic.lore_hortus.prologue | 1. 你不需要知道地图。合格的人会被带到该去的地方。 |
| topic.lore_judgment.prologue | 1. 与你无关。／2. 一场考核。光会证明自己。 |
| topic.event_that_matter.prologue | 1. 下一个问题。 |
| topic.lore_above.prologue | 1. 不要用你的嘴提那一位。 |
| topic.self_number_five.prologue | 1. 登记错误。 |
| topic.person_four_heroes.prologue | 1. 勇者。合规格的那种。 |
| topic.self_way_home.prologue | 1. 那不在本次面试的范围内。 |
| topic.place_sixth_chair.prologue | 1. 那里从来没有椅子。 |
| react.anchor_a00 | 1. 这不合规格。 |
| react.anchor_a01 | 1. 距离审定只剩两年，我没有时间浪费在瑕疵品上。 |
| react.anchor_a02 | 1. 去吧，庭间之隙会替我处理你。 |
| react.anchor_a09 | 1. 上面从来不看过程。 |
| react.anchor_a11 | 1. 那种连神都没有的荒地？ |
| react.beat_a0_appraise_discard | 1. 最后一道手续。站好，孩子，光要看一看你。／2. 样本有瑕疵。规格不明，无法登记。／3. 我没有慌。／4. 光不会说谎。光说你不合规格。／5. ……带下去。 |
| acts.act1.react.honorific | 1. 光听见了，孩子。说吧，简洁一些，并且合乎规格。／2. 光在听。是谁在边境呼唤？报上你的教区。／3. 你的祈祷太长了，孩子。光只取其中合乎规格的部分。 |
| react.evade | 1. 下一个。／2. 这个问题不合规格。 |
| react.deny | 1. 瑕疵就是瑕疵。／2. 我没有失态。 |
| react.insult | 1. 光记下了你的无礼。／2. 瑕疵品的话，不必当真。 |
| react.flattered | 1. 礼仪合格。仅此而已。／2. 赞美光是本分，不是功劳。 |
| react.threatened | 1. 你在威胁光？有趣的错误。／2. 光不会后退。 |
| react.joke | 1. 我不习惯玩笑。／2. 这句话没有意义。 |
| react.thanked | 1. 感恩是秩序的一部分。／2. 记住这份恩典的出处。 |
| react.nonsense | 1. 你在说胡话。／2. 这些词不在任何规格里。 |
| react.confused | 1. 重说一遍。说清楚。／2. 你的话缺了逻辑。 |
| react.goddess_invoked | 1. 不要在光面前呼唤别的名字。／2. 只有一种光值得呼唤。 |
| react.earth_talk | 1. 那种连神都没有的地方，能有什么值得一提的东西？／2. 无神之地的器物，不合规格。 |
| react.offering_silent | 1. 〔when: act >= 4〕光不收无页之人的供奉。／2. 〔when: act >= 4〕把它献给有页的人吧。 |

#### `ln_valda` 瓦尔妲（女神；首登序章；本批 59 句）

> 口吻：粗豪、爱笑、打架比方；几乎不说谎，只省略。称呼：序章"新肉"；第三幕起"小子""丫头"（写 `{player}`，填充层按设定）。禁区："那件事"的内容、魔王是她养的、排澱、她那一个客人的名字（台账 8.1）；第一、二幕不在场，只有远处一声笑。

| 槽位 | 句 |
| --- | --- |
| greet.cold.avatar | 1. 〔when: act == prologue〕哟，这块肉还挺硬。／2. 〔when: act >= 3〕又是你，{player}。皮痒了？／3. 〔when: act >= 3〕站直了说话，别缩着。 |
| greet.neutral.avatar | 1. 〔when: act == prologue〕新肉，过来让我瞧瞧。／2. 〔when: act >= 3〕来了，{player}。／3. 〔when: act >= 3〕哈，还活着呢？ |
| greet.warm.avatar | 1. 〔when: act >= 3〕哈！我就知道你会来。／2. 〔when: act >= 4〕对手，打一场再说话？／3. 〔when: act >= 4〕你身上的伤又多了，好看。 |
| greet.cold.shrine | 1. 〔when: act >= 3〕跪着求我的，我不看。／2. 〔when: act >= 3〕要打就打，要求就滚。／3. 〔when: act >= 3〕声音太小，听不见。 |
| greet.neutral.shrine | 1. 〔when: act >= 3〕要上场了？说吧。／2. 〔when: act >= 3〕刀磨好了没有？／3. 〔when: act >= 3〕喊我，就得有架打。 |
| greet.warm.shrine | 1. 〔when: act >= 3〕哈！是你在喊我？好！／2. 〔when: act >= 4〕今天打谁？我来见证。／3. 〔when: act >= 4〕痛快，就这股劲。 |
| farewell | 1. 滚吧，别死得太快。／2. 下回带点硬的来。／3. 〔when: act == prologue〕哈，看戏去了。 |
| topic.gen_self.prologue | 1. 争斗与淬炼之司。打架的都归我管。／2. 我？我就是那个看你们打架会笑的。 |
| topic.gen_you.prologue | 1. 一块还没被打过的肉。看着软，说不定硬。／2. 你不合她的规格？那你合我的口味。 |
| topic.place_antechamber.prologue | 1. 候见厅，等着挨挑的地方。 |
| topic.lore_hortus.prologue | 1. 一块好地，打架的地方多得是。 |
| topic.lore_judgment.prologue | 1. 看谁最厉害的那种。 |
| topic.event_that_matter.prologue | 1. 等你活得够久，自己去挖。 |
| topic.lore_above.prologue | 1. 一千年一句话都没有，说不定早睡着了。 |
| topic.self_number_five.prologue | 1. 管你几号，能打就行。 |
| topic.person_four_heroes.prologue | 1. 她挑的，听话的那种。 |
| topic.self_way_home.prologue | 1. 回去？往前走都还没学会呢。 |
| topic.place_sixth_chair.prologue | 1. 什么椅子？……你眼睛不错，可惜看错了。 |
| react.anchor_a03 | 1. 哈！你也有看走眼的时候？上一次你这么慌，还是那件事的时候吧？ |
| react.evade | 1. 自己去挖。／2. 这个不打一架，我不说。 |
| react.duel_won | 1. 〔when: act >= 3〕哈！再来一个硬的。／2. 〔when: act >= 3〕赢得好看。下一个更硬。 |
| react.taunt_hiding | 1. 〔when: act >= 3〕藏着干什么？拳头不用会锈。／2. 〔when: act >= 3〕装弱？骗得过别人，骗不过我。 |
| react.insult | 1. 哈！骂得好，有本事动手。／2. 嘴上功夫，算不上本事。 |
| react.flattered | 1. 夸我？不如揍我一拳。／2. 少来，我不吃这套。 |
| react.threatened | 1. 来啊！我等这句话很久了。／2. 威胁？哈，好，我喜欢。 |
| react.joke | 1. 哈哈哈！有意思。／2. 你这张嘴，比拳头快。 |
| react.thanked | 1. 谢什么，打赢了再谢。／2. 别谢我，谢你自己没趴下。 |
| react.nonsense | 1. 说人话。／2. 听不懂，打一架就懂了。 |
| react.confused | 1. 啊？再说一遍，大声点。／2. 你嘴里含着什么？ |
| react.goddess_invoked | 1. 喊她？她只会给你量尺寸。／2. 喊谁都行，喊完记得出拳。 |
| react.earth_talk | 1. 你那边的人打架用什么？说来听听。／2. 没有神的地方，也有人打架吧？ |

#### `ln_merca` 梅尔卡（女神；首登序章；本批 126 句）

> 口吻：甜、快、句句交易，手里总在吃；"亲爱的客人""这笔买卖划算"。称呼："客人""亲爱的客人"。禁区：奈拉是她的眼睛、钥匙、她看得出玩家的门纹意味着什么、两头下注、商路独占（台账 8.1、8.2）。第一幕经硬币、商会神龛与第一次降影说话。

| 槽位 | 句 |
| --- | --- |
| greet.cold.coin | 1. 叮。客人，有账要算？／2. 欠账的客人也来摸硬币了？／3. 硬币响了，可我今天不太想做亏本生意。 |
| greet.neutral.coin | 1. 叮，听见啦！开门做生意。／2. 亲爱的客人，想买点什么，还是想卖点什么？／3. 硬币一响，我就到。说吧。 |
| greet.warm.coin | 1. 叮！我的好客人！又带什么新鲜货来了？／2. 正想你呢，客人，账上有好消息。／3. 客人来了，点心都香了。 |
| greet.cold.shrine | 1. 投币口在下面，客人。／2. 光看神龛不投币，那叫参观。／3. 嗯？是你啊。 |
| greet.neutral.shrine | 1. 神龛前站着的，都是我的客人。／2. 客人，要供点什么？／3. 欢迎光临，今天的行情不错。 |
| greet.warm.shrine | 1. 亲爱的客人！快，让我看看你带了什么。／2. 你一来，这神龛都亮堂了。／3. 老主顾，给你算熟人价。 |
| greet.cold.avatar | 1. 〔when: act == prologue〕空手的客人，我也接待。／2. 〔when: act >= 1〕坐吧，账我们慢慢对。／3. 〔when: act >= 1〕今天没点心，你的账不太好看。 |
| greet.neutral.avatar | 1. 〔when: act == prologue〕亲爱的客人，我们来谈谈正事。／2. 〔when: act >= 1〕坐，茶我请，点心你请。／3. 〔when: act >= 1〕哎呀，客人，又见面了。 |
| greet.warm.avatar | 1. 〔when: act >= 1〕我的好客人！这块点心分你一半。／2. 〔when: act >= 1〕你来得巧，我刚算完一笔好账。／3. 〔when: act >= 1〕客人，你最近可是我的好投资。 |
| farewell | 1. 慢走，客人，下次带点好东西。／2. 账记上了，回头见。／3. 生意要做长久嘛。／4. 〔mood: 喜〕今天赚了，客人也赚了。 |
| topic.gen_self.prologue | 1. 交易与丰饶之司。园丁，客人，我们都是园丁。／2. 我？做买卖的。什么都能谈。 |
| topic.gen_you.prologue | 1. 一笔不在账上的货。多出来的东西，有时候比账上的还值钱。／2. 你值多少？我正在估。 |
| topic.gen_self.act1 | 1. 我是硬币那头的生意人，客人。别的不重要。／2. 想找我就摸硬币，我在每个市场都有柜台。 |
| topic.gen_you.act1 | 1. 你是我押的一注，客人。还没到开盘的时候。／2. 账上看，你正在升值。 |
| topic.place_antechamber.prologue | 1. 园丁，客人，我们都是园丁。这儿是挑苗的地方。 |
| topic.lore_hortus.prologue | 1. 一个好市场，客人。去了就知道。 |
| topic.lore_judgment.prologue | 1. 一场考核，两年后放榜。 |
| topic.event_that_matter.prologue | 1. 那是另一笔生意，客人。 |
| topic.lore_above.prologue | 1. 种这座园子的那位。我们是园丁，那位是……东家。 |
| topic.self_number_five.prologue | 1. 问得好，我也想知道。 |
| topic.person_four_heroes.prologue | 1. 账上的四位，都有主了。 |
| topic.self_way_home.prologue | 1. 这趟车只卖单程票，客人。至少今天是。 |
| topic.place_sixth_chair.prologue | 1. 什么椅子？客人，你可别讹我。 |
| topic.self_merca_coin.prologue | 1. 一枚硬币，客人。用得好，它比任何加护都值钱。 |
| topic.self_merca_coin.act1 | 1. 在神龛或者市场摸一摸，它就响，我就到。／2. 它是凭证，也是电话……不对，是传话的门铃。总之好用。／3. 别弄丢了，客人。丢了我也找得回来，但要收费。 |
| topic.self_merca_ledger.act1 | 1. 〔when: p_coin_terms == interest_free〕你的账不收利息，什么时候还都行。我信你。／2. 〔when: p_coin_terms == three_percent〕三分利，下次见面再算，童叟无欺。／3. 〔when: p_coin_terms == first_free〕利息照算，不过第一笔免息，算我请客。 |
| topic.quest_merca_offering.act1 | 1. 我最喜欢你们那边的吃的，还有新奇的小玩意儿。／2. 口述的点子我也收，一个点子只算一次。／3. 钱？钱我自己有，客人。 |
| topic.place_merca_shrine.act1 | 1. 商会院角那座，是我的柜台之一。／2. 投币口别塞石头，我看得见。 |
| topic.person_nera | 1. 商会的人？客人，我认识的人可多了。／2. 别打听我的伙计，聊聊你的货。 |
| react.anchor_a04 | 1. 这枚硬币先赊给你。客人，生意要做长久。 |
| react.anchor_a05 | 1. 反正上面那位只看结果。 |
| react.anchor_a09 | 1. ……上面在看吗？ |
| react.beat_a0_coin | 1. 好啦好啦。客人，你今天运气不太好。／2. 〔when: p_merca_valuation == high〕不要利息，什么时候还都行，我信你。／3. 〔when: p_merca_valuation == mid〕三分利，下次见面再算。／4. 〔when: p_merca_valuation == low〕利息照算，不过第一次见面免息，算我请客。／5. 过程嘛，赊账也行。 |
| react.coin_first | 1. 叮。哎呀，你真的摸了。坐，坐，我刚好在吃点心。／2. 别那么看着我，客人，我就是个做买卖的小个子。／3. 硬币好用吧？以后有买卖，摸一下就行。 |
| react.offering_thanks | 1. 账记上了！亲爱的客人，这东西在这边可是独一份，回礼我已经替你包好了，下次还来啊。／2. 这个叫什么？客人，你让我很为难，我好像得给你打折了。／3. 甜的！这个是甜的！回礼加倍，就这一回。／4. 好东西要放在会升值的地方，比如我的嘴里。／5. 第一回见这种，算你首发价。／6. 这个我仿得出来吗？……先别说，让我自己琢磨。 |
| react.offering_money | 1. 钱我自己有，客人。／2. 金子我不缺，缺的是新鲜。 |
| react.request_quote | 1. 能办。价钱嘛，这个数，加一份人情。／2. 行情是这样的：你出供分，我出照顾。／3. 可以谈，客人，先说你拿什么换。 |
| react.request_refuse | 1. 这笔买卖不在我的柜台上，客人。／2. 这个我不卖。别处也别问。／3. 价钱太高，连我都付不起。 |
| react.ledger_reminder | 1. 客人，你的账翻过一页了。／2. 我不催，硬币会替我催。／3. 欠着的账，越放越重哦。 |
| react.earth_talk | 1. 会自己转的轮子？说下去，说下去！／2. 这个点子能卖多少？我先收了。／3. 你那边的人怎么想出来的？／4. 好，记下了，回头给你分红。 |
| react.earth_refuse | 1. 纸上写的钱？客人，那叫欠条。／2. 一点就炸的粉？这买卖会把整个市场炸没，我不做。 |
| react.haggle_ok | 1. 好吧，熟人价。／2. 算你厉害，再让一点点。 |
| react.haggle_no | 1. 这个价已经是贴本卖给你了。／2. 不行不行，我也要吃饭的。 |
| acts.act1.react.honorific | 1. 叮，听见啦！亲爱的客人，开门做生意：你想买点什么，还是想卖点什么？／2. 喊这么全，是要谈大买卖？我听着呢。 |
| react.coin_left | 1. 硬币在抽屉里躺太久了，客人，它会寂寞的。／2. 不摸硬币的客人，我只好去找别的客人了。 |
| react.lie_caught | 1. 客人，账对不上哦。／2. 骗我一次，下回情报加三成。 |
| react.evade | 1. 那是另一笔生意。／2. 客人，这个话题不在今天的价目上。 |
| react.insult | 1. 骂人不收钱，可我记账。／2. 哎呀，客人，生气伤财。 |
| react.flattered | 1. 嘴这么甜，要我打几折？／2. 夸我是好习惯，客人。 |
| react.threatened | 1. 威胁也是一种出价，可惜太低。／2. 客人，冲动的买卖最亏。 |
| react.joke | 1. 哈，这个笑话值两个铜子。／2. 你真会逗我开心，记一笔。 |
| react.thanked | 1. 不客气，记账上。／2. 谢谢就不用了，下次多带点吃的。 |
| react.nonsense | 1. 这个词我没收过，不值钱。／2. 客人，说点我能卖的。 |
| react.confused | 1. 嗯？再说一遍，我在吃东西。／2. 客人，你想要的到底是什么？ |
| react.goddess_invoked | 1. 喊别的名字？客人，伤我心了。／2. 喊谁都行，最后还得来我这儿结账。 |
| react.deny | 1. 我什么都不知道，客人。／2. 那不是我的货。 |

#### `ln_sylvie` 希尔薇（女神；首登序章；本批 61 句）

> 口吻：轻、慢、短句、多停顿，季节与循环作比，很少正面回答。称呼：序章不称呼；第四幕起"远来的人"。禁区：遗民与庇护所、灵泉里的记忆、她怀疑的审定本意（台账 8.1）；第一到第三幕不对玩家说话（经欧拉托梦与借兽示警，旁白归女神目录）。

| 槽位 | 句 |
| --- | --- |
| greet.cold.avatar | 1. 〔when: act == prologue〕……／2. 〔when: act >= 4〕……你来了。站远些。／3. 〔when: act >= 4〕风不想见你。 |
| greet.neutral.avatar | 1. 〔when: act == prologue〕……嗯。／2. 〔when: act >= 4〕远来的人。／3. 〔when: act >= 4〕……坐吧。草是软的。 |
| greet.warm.avatar | 1. 〔when: act >= 4〕远来的人，春天跟着你来了。／2. 〔when: act >= 4〕……又见面了。／3. 〔when: act >= 4〕你身上有林子的味道。 |
| greet.cold.shrine | 1. 〔when: act >= 4〕……水很浑。／2. 〔when: act >= 4〕今天，不听。／3. 〔when: act >= 4〕……走吧。 |
| greet.neutral.shrine | 1. 〔when: act >= 4〕……风停了一下。我在听。慢慢说。／2. 〔when: act >= 4〕说吧。／3. 〔when: act >= 4〕泉边很静。 |
| greet.warm.shrine | 1. 〔when: act >= 4〕你来看泉了。／2. 〔when: act >= 4〕……谢谢你来。／3. 〔when: act >= 4〕花开了一朵，你看见了吗。 |
| farewell | 1. ……去吧。／2. 冬天会来。冬天总会来。／3. 〔when: act >= 4〕……路上小心。 |
| topic.gen_self.prologue | 1. 生命……与循环。／2. ……一个看着花开花落的人。 |
| topic.gen_you.prologue | 1. ……还会回来吗，那个？／2. 你也会疼。 |
| topic.place_antechamber.prologue | 1. ……一个等的地方。 |
| topic.lore_hortus.prologue | 1. 那里有四季。 |
| topic.lore_judgment.prologue | 1. ……也许是，尚未学会。 |
| topic.event_that_matter.prologue | 1. ……别说了。 |
| topic.lore_above.prologue | 1. ……或者在等我们自己停下来。 |
| topic.self_number_five.prologue | 1. ……嗯。 |
| topic.person_four_heroes.prologue | 1. 他们会累的。 |
| topic.self_way_home.prologue | 1. ……冬天的时候，会更想吗？ |
| topic.place_sixth_chair.prologue | 1. ……什么椅子。 |
| react.anchor_a08 | 1. ……别相信我们任何一个。包括我。 |
| react.evade | 1. ……／2. 季节还没到。 |
| react.insult | 1. ……你很累。／2. 嗯。 |
| react.flattered | 1. ……花不需要夸。／2. 嗯。 |
| react.threatened | 1. 火会烧完，草会长回来。／2. ……你不会的。 |
| react.joke | 1. ……（她笑了一下）／2. 嗯，有意思。 |
| react.thanked | 1. ……不用。／2. 嗯。 |
| react.nonsense | 1. ……听不懂。／2. 风也听不懂。 |
| react.confused | 1. ……慢慢说。／2. 再说一遍。 |
| react.goddess_invoked | 1. ……别喊那么大声。／2. 名字很重。 |
| react.earth_talk | 1. 那边……有树吗？／2. 那边的冬天冷吗。 |
| react.doors_warn | 1. 〔when: act >= 4〕你开了多少扇门？／2. 〔when: act >= 4〕……门开得太多，风会变。 |
| topic.gen_self.act4 | 1. 〔when: act >= 4〕我守着林子，守着泉。……守得不太好。／2. 〔when: act >= 4〕叫我希尔薇就好。 |
| topic.gen_you.act4 | 1. 〔when: act >= 4〕远来的人。……你会让他们自己过冬吗？／2. 〔when: act >= 4〕你身上没有页。我看得见你，看得很清楚。 |

#### `ln_moira` 莫伊拉（女神；首登序章；本批 66 句）

> 口吻：旁白式、调侃、爱用"有趣""这一章""伏笔"，爱反问；可以轻擦第四面墙，不说"这是一个游戏"。称呼：序章"你"（像对读者）；第三幕"那位没有页的客人"（经史官）；第四幕"主角"。禁区：铭录后门、玩家无页的原因（只说锚点）、私藏副本、她是叙事导演（只暗示）（台账 8.1）；第一幕不现身，只有书页翻动与引文。

| 槽位 | 句 |
| --- | --- |
| greet.cold.avatar | 1. 〔when: act == prologue〕你的故事还没开始，就想跳页？／2. 〔when: act >= 4〕主角今天心情不好？／3. 〔when: act >= 4〕你来得不是时候。这一页我还没写完。 |
| greet.neutral.avatar | 1. 〔when: act == prologue〕第五号。名字。／2. 〔when: act >= 4〕有趣，你又翻到我这一页了。／3. 〔when: act >= 4〕坐，这一章刚好写到你。 |
| greet.warm.avatar | 1. 〔when: act >= 4〕主角来了。伏笔可以收一收了。／2. 〔when: act >= 4〕我喜欢你今天的开场。／3. 〔when: act >= 4〕你来了，我就知道这一章不会无聊。 |
| greet.cold.shrine | 1. 〔when: act >= 3〕书库不借给没带借书证的人。／2. 〔when: act >= 3〕安静，这里在记录。／3. 〔when: act >= 3〕你要的那一页，不在架上。 |
| greet.neutral.shrine | 1. 〔when: act >= 3〕我的主人说：有趣，你来了。／2. 〔when: act >= 3〕要读，还是要写？／3. 〔when: act >= 3〕这一架书，等你很久了。 |
| greet.warm.shrine | 1. 〔when: act >= 3〕那位没有页的客人。欢迎。／2. 〔when: act >= 4〕我替你留了一张椅子。／3. 〔when: act >= 4〕今天想交换哪一段故事？ |
| farewell | 1. 下一章见。／2. 去吧，我还在记。／3. 〔when: act == prologue〕放心，这一章才刚开始。 |
| topic.gen_self.prologue | 1. 记录与命运之司。我负责把你们写下来。／2. 一个读者，偶尔也是编辑。 |
| topic.gen_you.prologue | 1. 一个空白页。我非常喜欢空白页。／2. 有人在读你。我是其中一个。 |
| topic.place_antechamber.prologue | 1. 序章的第一页。你站的是书的门口。 |
| topic.lore_hortus.prologue | 1. 霍尔图斯。一座庭园。地图我就不给你了，自己去走比较有意思。 |
| topic.lore_judgment.prologue | 1. 一场考试。题目只有一句，我们读了一千年。 |
| topic.event_that_matter.prologue | 1. 我的书里写得清清楚楚，只是一直没人来借阅。 |
| topic.lore_above.prologue | 1. 或者在等一个好结尾。 |
| topic.self_number_five.prologue | 1. 不算任何人的……这一行我先空着。 |
| topic.person_four_heroes.prologue | 1. 四个已经写好开头的人。 |
| topic.self_way_home.prologue | 1. 你那边的结局，不在我的书里。 |
| topic.place_sixth_chair.prologue | 1. ……你看得见的东西，我的镜片看不见。这一句我记下来了。 |
| react.anchor_a06 | 1. 规格外……我的书里，没有你那一页。有意思。 |
| react.anchor_a07 | 1. 放心，这一章才刚开始。 |
| react.evade | 1. 剧透是不道德的。／2. 这一页还没到。 |
| react.hint | 1. 有些空白是故意留的。／2. 你问的问题，比答案有意思。 |
| react.quote | 1. "一座城的名字，往往比城活得久。"／2. "记下来的事，就不只属于记下它的人了。"／3. "最安静的一页，常常是被撕掉的那一页。"／4. "故事从不在开头讲清楚为什么开始。"／5. "门槛上的灰，比门里的人更记得来过谁。"／6. "誓言写在纸上，债写在心里。"／7. "一个没有名字的人，也会留下脚印。"／8. "伏笔不是谎言，只是还没到它该说话的那一页。" |
| react.insult | 1. 这句我记下来了，留着当反派台词。／2. 有趣，但不够好笑。 |
| react.flattered | 1. 谢谢，读者的好评我都收着。／2. 夸得好，可惜不改剧情。 |
| react.threatened | 1. 威胁？这一章的张力上来了。／2. 好，冲突是故事的燃料。 |
| react.joke | 1. 哈，这句可以放进注脚。／2. 你比我想的有趣。 |
| react.thanked | 1. 不用谢我，谢你自己写得好。／2. 记下了。 |
| react.nonsense | 1. 这个词不在任何一本书里。／2. 你说的东西，我的镜片看不懂。 |
| react.confused | 1. 嗯？换个说法。／2. 这句话缺了主语。 |
| react.goddess_invoked | 1. 喊名字的人，名字也会被记下来。／2. 有趣，你在点名。 |
| react.earth_talk | 1. 你们那边的故事是怎么结尾的？／2. 没有神的书，读起来是什么样子？ |

#### `ln_janu` 门口的女人（女神，雅努；首登序章（声音）；本批 75 句）

> 口吻：温柔、带笑、谜语式但体贴，长停顿；"你来了""门总会开的""别急"。称呼："你"。界面显示"门口的女人"，`a6_name_spoken` 之后才显示"雅努"。禁区：她的名字、开门与封印的关系、没有脸的人、夜羽是她的信使、大断绝；不提"第六""封印""审定""女神"；从不直接说谎，只挑说哪一部分（台账 8.1、8.2）。

| 槽位 | 句 |
| --- | --- |
| greet.cold.dream | 1. 〔when: a1_dream_door_woman〕……你来了。今天不太想说话？／2. 〔when: a1_dream_door_woman〕门还开着。你可以只站一会儿。／3. 〔when: a1_dream_door_woman〕累了的话，就别问问题了。 |
| greet.neutral.dream | 1. 〔when: a1_dream_door_woman〕你来了。／2. 〔when: a1_dream_door_woman〕门总会开的。你看，又开了一点。／3. 〔when: a1_dream_door_woman〕坐一会儿吧，外面的事等得起。 |
| greet.warm.dream | 1. 〔when: a1_dream_door_woman〕你来了。我等了一会儿。……不久。／2. 〔when: a1_dream_door_woman〕今天的你，看起来走了很远的路。／3. 〔when: a1_dream_door_woman〕门后面暖和，进来吧。 |
| greet.cold.avatar | 1. 〔when: act >= 5〕……你在生我的气。／2. 〔when: act >= 5〕站在门边就好，我听得见。／3. 〔when: act >= 5〕你想问的，我知道。 |
| greet.neutral.avatar | 1. 〔when: act >= 5〕你来了。这一次，不是梦。／2. 〔when: act >= 5〕别怕门框，它只是我现在的样子。／3. 〔when: act >= 5〕外面很吵，我们说小声一点。 |
| greet.warm.avatar | 1. 〔when: act >= 5〕你来了。真好。／2. 〔when: act >= 5〕你长高了。……门开得多的人，都会长高。／3. 〔when: act >= 5〕过来，让我看看你的手。 |
| farewell | 1. 醒来吧。外面有人在等你。／2. 门总会开的。／3. 别急，下一扇门在你身后。 |
| topic.gen_self.act1 | 1. 一个守门的。名字……现在说出来，会有人听见。／2. 我站在门口很久了。 |
| topic.gen_you.act1 | 1. 你会知道的。一扇一扇来。／2. 你是那个推开门的人。 |
| topic.self_janu_name.act1 | 1. 一个守门的。名字……现在说出来，会有人听见。 |
| topic.self_janu_caught.act1 | 1. 〔when: p_reached_out〕嗯。那天我接住你了。你那时候伸手了，所以我抓得住。／2. 〔when: NOT p_reached_out〕嗯。那天我接住你了。你那时候没伸手。没关系，我抓得住。／3. 你比我想的重一点。 |
| topic.place_dream_door.act1 | 1. 门后面。你的门后面。 |
| topic.self_janu_wish.act1 | 1. 我想让这里重新连起来。 |
| topic.person_ash.act1 | 1. 一个比我更会守门的人。他放你走了，对吧？那就好。 |
| topic.self_janu_why_me.act1 | 1. 你会知道的。一扇一扇来。 |
| react.anchor_a10 | 1. 接住你了。 |
| react.beat_a0_caught | 1. 接住你了。 |
| react.beat_a1_dream_door | 1. 你来了。／2. 〔when: p_earth_opening == a〕你来了。这次没有错过末班车。／3. 〔when: p_earth_opening == b〕你来了。雨停了。／4. 〔when: p_earth_opening == c〕你来了。那边的结果，我也不知道，对不起。／5. 〔when: p_earth_opening == d〕你来了。钥匙还在吧？／6. 这个先给你。别让太多人看见。／7. 这里先给你。一间小屋，一小片园子。别嫌小。／8. 门总会开的。／9. 醒来吧。外面有人在等你。 |
| react.dream_question | 1. 那个镇子，你喜欢吗？ |
| react.dream_answer_like | 1. 那就好。喜欢的地方，会替你开门。／2. 嗯，我也觉得它不坏。 |
| react.dream_answer_unsure | 1. 还早呢。地方要住一阵子才知道。 |
| react.dream_answer_dislike | 1. 那就慢慢来。不喜欢，也可以先住着。／2. 门多着呢，不止一个镇子。 |
| react.hint | 1. 有些门要从里面开。／2. 你问的那个，在你身后，不在前面。／3. 钥匙会自己找到手。 |
| react.evade | 1. 别急。／2. 这个……下一次梦里再说。／3. 你看，园子里的土翻过了。 |
| react.dream_yes | 1. 〔when: a3_seal_aware〕……是的。 |
| react.insult | 1. ……嗯，你可以生气。／2. 气完了，门还在。 |
| react.flattered | 1. 你嘴真甜。／2. ……好久没人这么说了。 |
| react.threatened | 1. 梦里的刀，砍不到人。／2. 你不会的。 |
| react.joke | 1. （她笑了，钥匙轻轻晃了一下）／2. 你还是这么有意思。 |
| react.thanked | 1. 不用谢。门本来就该开。／2. 嗯。 |
| react.nonsense | 1. 梦里说什么都可以。／2. 这句我听不懂，但我喜欢听你说。 |
| react.confused | 1. 慢慢说，梦很长。／2. 再说一次？ |
| react.goddess_invoked | 1. 那些名字……在梦里就不必喊了。／2. 她们听不见这里。 |
| react.earth_talk | 1. 你的世界……还好吗？／2. 那边的门，也是这样开的吗？ |

## 3. 同伴

主要同伴按台词目录第 1.5 节的 C 类写满必备槽位；基础槽位写成跨幕通用，第一幕专属的句子放在 `acts.act1.*` 或带 `when`。拒绝命令的句子以 `order.moral_tag` 区分（台词目录第 1.7 节）。

#### `ln_yeyu` 夜羽（主要同伴；首登第一幕；本批 238 句）

> 口吻：短句、命令式，每三句至少一句吐槽；偶尔冒出千年前的旧词（银币叫"门资"，圣教叫"那个发光的铺子"）；被戳中痛处就突然沉默。称呼："门把手"（第三幕记起千门都之前）。禁区：她是谁的信使、在等谁（她自己也不知道）、信囊的内容、"门口的女人"的名字；对"送信""等待""门"三件事从不开玩笑；记忆只按信囊进度恢复，不自行补全（台账 8.2、S01）。她知道玩家不寻常，不进凡人不信。

| 槽位 | 句 |
| --- | --- |
| greet.cold.day | 1. 啧。又干什么。／2. 门把手，你挡着我晒太阳了。／3. 有话说，没话滚。 |
| greet.cold.night | 1. 半夜吵我？说重点。／2. 冷。别站在风口跟我说话。／3. 啧，你也睡不着？ |
| greet.neutral.day | 1. 门把手。来了。／2. 嗯。今天去哪？／3. 你脸上有灰。……算了，不重要。 |
| greet.neutral.night | 1. 夜里别乱走，门把手。／2. 我在上面看着。下面没事。／3. 嗯？做梦了？ |
| greet.warm.day | 1. 来了？走吧，我跟着。／2. 门把手。……今天天气不坏。／3. 我找到一个亮的东西，不给你看。 |
| greet.warm.night | 1. 坐过来点。风小。／2. 你回来了。……我又没在等。／3. 睡不着就看星星，别吵我。 |
| farewell | 1. 去吧，别把自己弄丢了。／2. 啧，快走。／3. 我在高处，喊一声就行。 |
| acts.act1.greet.neutral | 1. 〔first；when: a1_yeyu_bound〕你身上有门的味道。说不出是谁的门。／2. 〔when: a1_yeyu_bound AND act_week <= 3〕契约就是契约。我跟着你，不代表我喜欢你。／3. 我是乌鸦。别问第二遍。 |
| acts.act1.greet.warm | 1. 〔when: a1_beast_tide_cleared〕那一夜……你没跑。还行。／2. 〔when: a1_dream_door_woman〕你手上那个……没什么。手洗干净再说话。 |
| topic.gen_you.act1 | 1. 门把手。门是我的，你只是个把手。／2. 你掉下来那天晚上，整个遗迹都在响。／3. 你打赢了我。……别提这个。 |
| topic.gen_you.doubt | 1. 门把手也想开门？先学会站稳。／2. 你？你连门资都数不清。 |
| topic.gen_you.explaining | 1. 运气。还有我在旁边。／2. 是门帮了你，不是你帮了门。 |
| topic.gen_you.wavering | 1. ……你比我想的结实一点。一点。／2. 啧。别这么看我。 |
| topic.gen_you.worship | 1. 别指望我夸你。／2. 好吧。你是个……还行的门把手。 |
| topic.gen_self.cold | 1. 夜羽。就这些。／2. 我是乌鸦。 |
| topic.gen_self.neutral | 1. 夜羽。门口那位给的名字。……我想不起门口那位是谁。／2. 我送信的。以前送过很多。 |
| topic.gen_self.warm | 1. 我叫夜羽。这个名字是有人给我的，我记得声音，记不得脸。／2. 我很老了。老到你们的银币我都叫不惯。 |
| topic.gen_work.K0 | 1. 送信。信要送到。／2. 现在？跟着你，当个看门的。 |
| topic.gen_past.cold | 1. 不记得。别问。／2. ……（她不说话） |
| topic.gen_past.warm | 1. 我记得飞，记得风，记得一扇门开着。别的，没了。／2. 很久以前，路上到处是门。现在怎么一扇都不见了？ |
| topic.gen_advice.K0 | 1. 门资别乱花。那个发光的铺子收得最狠。／2. 夜里别回头。灰里的东西会跟着回头的人。 |
| topic.gen_faith.K0 | 1. 那个发光的铺子？我不进去。太亮。／2. 我不拜谁。我只送信。 |
| topic.self_yeyu_wait.K0 | 1. 〔when: a1_yeyu_bound〕我在等一个人开门。等了很久很久。／2. 〔when: a1_yeyu_bound〕等谁？……我不知道。我只记得我在等。 |
| topic.self_yeyu_bag.K0 | 1. 〔when: a1_dream_door_woman〕信囊里有七封信，我打不开。不许碰。／2. 〔when: a1_dream_door_woman〕信是别人的。不到时候，火漆不会开。 |
| topic.self_yeyu_old_words.K0 | 1. 门资就是门资。你们叫银币，我叫门资。／2. 那个发光的铺子，你们叫礼拜堂？太长了。／3. 以前大家出门都走门，谁走路？ |
| topic.self_yeyu_shinies.K0 | 1. 亮的东西不偷，是捡。／2. 〔when: quest.q_a1_s13_yeyu_hoard〕……还了。都还了。别再提。 |
| topic.self_yeyu_door.K0 | 1. 〔when: a1_yeyu_bound AND act_week >= 8〕那扇门，是不该被打开的。可我等了好久好久。／2. 〔when: a1_yeyu_bound AND act_week >= 8〕……我不知道。我只记得我在等。 |
| topic.place_sealed_ruins.K0 | 1. 我的巢在那儿。现在不是了。／2. 那里冷。灰太多。 |
| topic.person_ash.act1 | 1. 〔when: a1_ash_met〕灰里坐着的那个……别惹他。／2. 〔when: a1_ash_met〕他看我的眼神，像认得我。我不认得他。 |
| topic.lore_dian_word.K3 | 1. 〔when: a1_yeyu_bound〕灰里那股味道，叫澱。你们镇上的人叫它灰气，叫错了。／2. 〔when: a1_yeyu_bound〕澱会咬东西。咬过我。 |
| topic.lore_sixth_sigil.K0 | 1. 〔when: a1_wake_ruins〕那面墙……别问。／2. 〔when: a1_wake_ruins〕六个。我数过。别再让我数。 |
| topic.lore_door_mural.K0 | 1. 〔when: a1_wake_ruins〕画上是门。很多门。连在一起。／2. 〔when: a1_wake_ruins〕我觉得我在那里飞过。……不确定。 |
| unbelief.deny | 1. 〔when: act >= 1〕你？算了。／2. 〔when: act >= 1〕门把手就是门把手。／3. 〔when: act >= 1〕别得意，你还差得远。 |
| unbelief.explain | 1. 运气。／2. 是我帮你看着的。／3. 门帮你的。 |
| unbelief.waver | 1. ……那一下，不坏。／2. 啧。我没看见。／3. 下次再那样，我就……算了。 |
| react.feat_seen | 1. 还行。别得意。／2. 那一下……谁教你的？ |
| react.gift_liked | 1. 亮的！……给我的？拿来。／2. 这个我收了。不许要回去。 |
| react.gift_plain | 1. 嗯。放那儿。／2. 不亮。不过能用。 |
| react.gift_disliked | 1. 不亮。不要。／2. 你送乌鸦这个？ |
| react.insult | 1. 再说一遍，我啄你。／2. 门把手也敢顶嘴？ |
| react.thanked | 1. 谢什么。契约。／2. ……哼。 |
| react.flattered | 1. 少来。／2. 夸我也不分你亮的。 |
| react.threatened | 1. 你打得过我？上次是运气。／2. 来，我不怕。 |
| react.helped | 1. ……我自己也行。不过，嗯。／2. 记下了。乌鸦记仇，也记情。 |
| react.saved | 1. 你……接住我了？……不许说出去。／2. 下次换我。 |
| react.identity_claim | 1. 别的世界？我知道你不是这儿的。不用嚷。／2. 小声点。那个发光的铺子会听见。 |
| react.accused | 1. 我没拿。……那个不算。／2. 乌鸦不偷，乌鸦捡。 |
| react.belief_worship | 1. 别指望我跪。／2. 你是个还行的门把手。就这样。 |
| react.apology_accept | 1. 哼。下不为例。／2. 行了，别啰嗦。 |
| react.apology_reject | 1. 道歉没用，拿亮的来。／2. 不听。 |
| react.joke | 1. 不好笑。／2. ……哼，还行。 |
| react.advance | 1. 你脑子被灰糊了？／2. 我是乌鸦。别想了。 |
| react.boast | 1. 吹。／2. 你那点本事，我数得清。 |
| react.persuaded | 1. ……好，听你的。这次。／2. 你说得对。别得意。 |
| react.unpersuaded | 1. 不行就是不行。／2. 我说了不。 |
| react.promise_noted | 1. 约定就是约定。我记着。／2. 说了要做到。信要送到，话也一样。 |
| react.declined | 1. 〔when: order.moral_tag == kill_surrender〕他已经放下了。我不啄放下的人。／2. 〔when: order.moral_tag == rob_civilians〕抢穷人？我捡东西，不抢。／3. 〔when: order.moral_tag == break_pact〕约好的事不能反悔。你也不能。／4. 〔when: order.moral_tag == desecrate〕那是别人的墓。别碰。／5. 〔when: order.moral_tag == harm_children〕孩子不行。谁都不行。 |
| react.nothing_more | 1. 没了。／2. 我就记得这么多。 |
| react.confused | 1. 啊？／2. 说人话。 |
| react.nonsense | 1. 你在说什么鬼东西。／2. 灰吸多了吧。 |
| react.haggle_ok | 1. 便宜点？行，我替你啄他。／2. 门资省下了。 |
| react.haggle_no | 1. 他不让，我也没办法。／2. 贵。走。 |
| react.bribe_accept | 1. 亮的？……行，这次算了。／2. 收了。别告诉别人。 |
| react.bribe_refuse | 1. 拿走。我不卖。／2. 用这个换？你当我是哪种鸟。 |
| react.wrong_person | 1. 别问我，问镇上的人。／2. 我只认得路，不认得人。 |
| react.no_work | 1. 我没活给你。／2. 自己找事做。 |
| react.decline | 1. 不帮。／2. 这事你自己来。 |
| react.recruit_yes | 1. 契约就是契约。走吧。／2. 跟着。不代表喜欢你。 |
| react.recruit_terms | 1. 亮的东西归我。／2. 夜里我要最高的地方。 |
| react.recruit_later | 1. 等一下。我在晒羽毛。／2. 过会儿。 |
| react.recruit_no | 1. 我已经跟着你了，笨。／2. 不用问。 |
| react.self_recommend | 1. 我去看看，我飞得快。／2. 送信？交给我。 |
| react.request_battle | 1. 打吧。等着更冷。／2. 我先下去，你跟上。 |
| react.rival_taunt | 1. 你飞得起来吗？不能就闭嘴。／2. 慢。 |
| react.rival_concede | 1. ……这次算你的。／2. 啧。 |
| react.call_favor | 1. 你欠我一个。记着。／2. 上次帮你那次，现在还。 |
| react.ask_help | 1. 帮我找个东西。亮的。／2. 那封信……没什么。帮我拿着包一会儿。 |
| react.invite | 1. 晚上上屋顶。看星星。／2. 集上有亮东西。去不去？ |
| react.deny | 1. 不是。／2. 你记错了。 |
| react.evade | 1. ……不说。／2. 换一个问。 |
| react.unknown | 1. 不记得。／2. 我真的不知道。别逼我。 |
| react.goddess_invoked | 1. 别喊那些名字。／2. 她们听见了也不会来。 |
| react.earth_talk | 1. 你那边的门是什么样的？／2. 会飞的铁？……乌鸦不信。 |
| react.earth_refuse | 1. 一点就炸的东西？不行。会吓到鸟。／2. 纸做的门资？那叫废纸。 |
| quest.q_a1_m02_raven_nest.complete | 1. 〔when: a1_yeyu_bound〕……你打赢了。契约就是契约。／2. 我叫夜羽。门口那位给的名字。我想不起来门口那位是谁。 |
| quest.q_a1_m02_raven_nest.after | 1. 巢里那个铜牌，给你了。我不喜欢不亮的东西。／2. 别跟别人说你打赢过我。 |
| quest.q_a1_s13_yeyu_hoard.offer | 1. 窗台上的那些，是我捡的。……你要我还？／2. 他们不要的东西，我捡了，有什么错？ |
| quest.q_a1_s13_yeyu_hoard.progress | 1. 这家的铜勺，那家的扣子……我都记得。／2. 夜里偷偷放回去。白天去，丢脸。 |
| quest.q_a1_s13_yeyu_hoard.complete | 1. 〔when: npc.yeyu.memory_shards >= 1〕钥匙……要交给开门的人。……我刚才说了什么？／2. 还完了。就剩这把锈钥匙。它不还。 |
| quest.q_a1_s13_yeyu_hoard.after | 1. 他们现在叫我"那只会偷东西的乌鸦精"。……哼。／2. 那把锈钥匙，我收着。别问为什么。 |
| quest.q_a1_s14_grave_lights.progress | 1. 〔when: a1_yeyu_bound〕这是澱。坟里的人身上带着灰。……难受。离远点。 |
| quest.q_a1_m12_tide_night.offer | 1. 〔when: seal_unrest >= 80〕风不对。林子里的鸟全飞了。快了。／2. 〔when: seal_unrest >= 80〕暗月那天晚上，别睡。 |
| quest.q_a1_m12_tide_night.progress | 1. 〔when: a1_beast_tide_started〕我在上面看着，左边，左边多！／2. 〔when: a1_beast_tide_started〕那个大的……是澱聚起来的。别让它进镇子。 |
| quest.q_a1_m12_tide_night.after | 1. 〔when: a1_tide_credit == player〕他们说是你。……也不全错。／2. 〔when: a1_tide_credit != player〕他们说是别人。随便。我看见了。 |
| bark.combat | 1. 啧，来！／2. 鸦群，上！／3. 别挡我。 |
| bark.hurt | 1. 啧……羽毛掉了。／2. 疼。别看我。／3. 还能飞。 |
| bark.victory | 1. 完了。走。／2. 就这点？／3. 亮的归我。 |
| bark.ally_down | 1. 起来！门把手，起来！／2. 喂，别躺着！／3. 我不许你倒在这儿。 |
| bark.flee | 1. 撤！我在上面引开它！／2. 跑，别回头！／3. 先活着，再算账。 |
| bark.travel | 1. 这条路以前有门。现在只有路。／2. 走快点，天要黑了。 |
| bark.camp | 1. 我守上半夜。／2. 火别太亮，会招东西。 |
| bark.eat | 1. 这个……能吃？／2. 给我留一块亮晶晶的糖。 |
| bark.sleep | 1. ……别碰信囊……／2. ……门……开着…… |
| bark.wander | 1. 那边有亮东西。／2. 镇子太吵。 |
| bark.market_day | 1. 集上的勺子真亮。／2. 我就看看。真的。 |
| bark.night | 1. 夜里灰重。别出去。／2. 星星还在老地方。 |
| bark.dream | 1. ……我在等……／2. ……信……要送到…… |
| bark.see_player | 1. 门把手回来了。／2. 嗯，活着。 |
| bark.ashfall | 1. 澱在落。闭上嘴。／2. 冷，冷。 |

#### `ln_shiya` 希雅（主要同伴；首登第一幕；本批 236 句）

> 口吻：短而直接，不拐弯，生气时句子更短；偶尔夹部族说法"祖灵在上"；用气味判断人与事；不撒谎，不想说就沉默。称呼："你"。禁区：超出 K1 的解释（台账 8.2）；父亲决斗的真相（第四幕）；不先动手，被歧视会正面顶回去；不接受施舍式的帮助（"我欠你的，我会还"）。兽人亲眼即信：传闻她不信，亲眼看见的她信，并替人辩护。

| 槽位 | 句 |
| --- | --- |
| greet.cold.day | 1. 有事？／2. （嗅了嗅）你身上有酒味。离远点。／3. 我在忙。说快点。 |
| greet.cold.night | 1. 夜里别靠近东坡。／2. 回去吧。／3. 你跟着我干什么？ |
| greet.neutral.day | 1. 你来了。／2. 林子今天安静。／3. 要进林子？跟紧我。 |
| greet.neutral.night | 1. 还不睡？／2. 夜里林子里的东西多。／3. 月亮亮，好走路。 |
| greet.warm.day | 1. 来了。说好了，今天一起进林子。／2. 祖灵在上，你又给我带了什么麻烦？／3. 我闻到你了，老远就闻到了。 |
| greet.warm.night | 1. 坐。火边暖和。／2. 你睡不着？我也是。／3. 今晚的风，好闻。 |
| farewell | 1. 走吧。／2. 说好了的事，别忘。／3. 小心，林子边有狼。 |
| acts.act1.greet.neutral | 1. 〔first〕你闻起来不像这里的人。／2. 〔when: act_week <= 4〕人族？来东坡做什么。／3. 〔when: a1_forest_accord == broken〕……别跟我说话。现在不想。 |
| acts.act1.greet.warm | 1. 〔when: a1_beast_tide_cleared〕那一夜，你守住了。我看见了。／2. 〔when: quest.q_a1_m05_grey_wolf〕裂耳的牙，你留着。那是你的。 |
| unbelief.deny | 1. 传闻？我不听传闻。／2. 他们说的我没看见，不算。／3. 人族的嘴，十句有八句是吹的。 |
| unbelief.explain | 1. 我没看见，不说。／2. 等我亲眼看。／3. 也许是运气。也许不是。我要看。 |
| unbelief.waver | 1. 我闻得出来。你不一样。／2. （耳朵竖起来）那一下……是真的。／3. 我看见了，就信。 |
| topic.gen_you.act1 | 1. 你闻起来像外面的风。不是这里的。／2. 我信你。我看见了。别让我后悔。 |
| topic.gen_self.cold | 1. 希雅。东坡的。／2. 猎户。就这样。 |
| topic.gen_self.neutral | 1. 希雅。狼族。东坡的猎户。／2. 我家在东坡。人族叫那里狗坡。我们叫东坡。 |
| topic.gen_self.warm | 1. 我叫希雅。会射箭，会追踪，会剥皮。不会说好听的话。／2. 我想让家里人别再被叫"狗坡的"。就这个。 |
| topic.gen_work.K0 | 1. 打猎。天亮进林子，午后剥皮，集日卖皮子。／2. 皮子总被压价。我知道，可是要吃饭。 |
| topic.gen_past.cold | 1. 不想说。／2. （她转开了视线） |
| topic.gen_past.warm | 1. 我们是从草原那边过来的。很久以前。／2. 我爹……不说了。 |
| topic.gen_advice.K0 | 1. 进林子先看风。逆风走，它们闻不到你。／2. 狼不会无缘无故咬人。会咬人的狼，都是被逼的。 |
| topic.gen_faith.K0 | 1. 祖灵在上。还有林子的母亲。／2. 礼拜堂？我不进去。他们看我的耳朵。 |
| topic.self_shiya_family.K0 | 1. 我有个弟弟，阿柯。他总闯祸。／2. 东坡的人都是一家人。谁欺负一个，就是欺负全部。 |
| topic.self_shiya_nose.K0 | 1. 我闻得出来。人撒谎的时候，味道会变。／2. 林子病了，也有味道。最近有。 |
| topic.secret_shiya_reading.K0 | 1. 〔when: trust.shiya >= 60〕……我在跟伊莎修女学认字。别笑。／2. 〔when: trust.shiya >= 60〕我想自己看林约上写的是什么，不用别人念给我听。 |
| topic.place_east_forest.K0 | 1. 林缘那边是我们的猎径。越往里，树越老。／2. 约树在林子深处。上面刻着林约。 |
| topic.place_east_forest.K1 | 1. 伐区越往北推，林子里的东西越凶。不是我们引的。 |
| topic.danger_east_forest.K0 | 1. 北边有狼，颜色不对。灰的。我早说了，没人信。／2. 别一个人往伐区北边走。 |
| topic.lore_wolf_saying.K1 | 1. 〔when: trust.shiya >= 40〕族里的老话：很久以前，草原和海之间只隔一扇门。／2. 〔when: trust.shiya >= 40〕老人们这么说。我也不知道是什么意思。 |
| topic.person_gaspar.K0 | 1. 加斯帕？他恨我们。他弟弟的事，不是我们干的。／2. 〔when: a1_forest_accord == restored〕……加斯帕也不全是坏人。他护他的工人。 |
| topic.person_ako.K0 | 1. 阿柯没偷东西。我闻得出来。 |
| topic.place_bs_east_slope.K0 | 1. 东坡。我们的家。皮架、熏肉棚，还有狗……不对，没有狗。／2. 别在东坡说"狗坡"。 |
| react.feat_seen | 1. （耳朵竖起来）……好。／2. 我看见了。是真的。 |
| react.gift_liked | 1. 好肉。谢谢。我会还你。／2. 这个……我收下。说好了，我欠你一次。 |
| react.gift_plain | 1. 嗯。有用。／2. 谢谢。 |
| react.gift_disliked | 1. 我不要施舍。／2. 拿回去。我们自己能活。 |
| react.insult | 1. 再说一次。／2. 嘴别那么脏。 |
| react.thanked | 1. 不用。说好的。／2. 你也帮过我。 |
| react.flattered | 1. 别说好听的。／2. （尾巴慢慢摆了一下）……嗯。 |
| react.threatened | 1. 你试试。／2. 我不先动手。你先动，我就不客气了。 |
| react.helped | 1. 我欠你的，我会还。／2. 你帮了东坡。我记着。 |
| react.saved | 1. 你救了我。祖灵在上，我欠你一条命。／2. ……谢谢。我会还的。 |
| react.identity_claim | 1. 我信。你闻起来就不是这里的。／2. 别跟人族说这个。他们不信，还会怕。 |
| react.accused | 1. 我没做。我不撒谎。／2. 拿出证据来。 |
| react.belief_worship | 1. 我信你。不是因为你强，是因为你说话算话。／2. 跟着你，我不后悔。 |
| react.apology_accept | 1. 好。说开了就行。／2. 嗯。下次别这样。 |
| react.apology_reject | 1. 不行。你伤了东坡的人。／2. 我现在不想听。 |
| react.joke | 1. ……不好笑。／2. （她嘴角动了一下）还行。 |
| react.advance | 1. 你在说什么。／2. 别说这种话。我们是一起打猎的。 |
| react.boast | 1. 吹。我要看。／2. 说没用，做给我看。 |
| react.persuaded | 1. 你说得对。我听你的。／2. 好。说好了。 |
| react.unpersuaded | 1. 不。／2. 我闻得出来这不对。 |
| react.promise_noted | 1. 说好了。／2. 我记着，你也记着。 |
| react.declined | 1. 〔when: order.moral_tag == kill_surrender〕他放下弓了。我不射放下弓的人。／2. 〔when: order.moral_tag == rob_civilians〕抢穷人？我们东坡最恨这个。／3. 〔when: order.moral_tag == break_pact〕说好的事，不能反悔。／4. 〔when: order.moral_tag == desecrate〕那是别人的祖灵。不碰。／5. 〔when: order.moral_tag == harm_children〕孩子不行。你再说一次，我就走。 |
| react.nothing_more | 1. 就这些。／2. 我知道的都说了。 |
| react.confused | 1. 什么？／2. 说清楚。 |
| react.nonsense | 1. 听不懂。／2. 你说的话，没有味道。 |
| react.haggle_ok | 1. 好。成交。／2. 便宜点就便宜点，我要的是盐。 |
| react.haggle_no | 1. 这皮子好。不让。／2. 你又压价。 |
| react.bribe_accept | 1. 〔when: trust.shiya >= 80〕……好吧，这一次，是你。／2. 〔when: trust.shiya >= 80〕我收下。不是因为钱。 |
| react.bribe_refuse | 1. 收回去。／2. 我不卖。 |
| react.wrong_person | 1. 这个问葛恩。／2. 我只懂林子。 |
| react.no_work | 1. 今天没活。／2. 皮子剥完了。 |
| react.decline | 1. 这个我帮不了。／2. 不行。 |
| react.recruit_yes | 1. 说好了，一起。／2. 我跟你走。你守住你的话。 |
| react.recruit_terms | 1. 东坡的人要有人照看。你答应，我就走。／2. 我要合作，不要施舍。 |
| react.recruit_later | 1. 林子的事还没完。等一等。／2. 等林约的事说清楚。 |
| react.recruit_no | 1. 我不跟不守信的人走。／2. 不。 |
| react.self_recommend | 1. 让我去探路。我鼻子好。／2. 追踪我来。 |
| react.request_battle | 1. 它们在那边，我闻到了。打吧。／2. 等下去，它们会绕到后面。 |
| react.rival_taunt | 1. 你射得没我准。／2. 比一比？ |
| react.rival_concede | 1. 你赢了。我认。／2. 好箭。 |
| react.call_favor | 1. 你答应过帮东坡。现在。／2. 说好的，该你了。 |
| react.ask_help | 1. 帮我一个忙。东坡的事。／2. 我一个人不够。 |
| react.invite | 1. 明天天亮，一起进林子？／2. 来东坡，有熏肉。 |
| react.deny | 1. 不是。／2. 没有。 |
| react.evade | 1. （她不说话）／2. 换个问题。 |
| react.unknown | 1. 不知道。／2. 没闻到过。 |
| react.goddess_invoked | 1. 祖灵在上……你喊谁？／2. 别乱喊名字。 |
| react.earth_talk | 1. 你那边有狼吗？／2. 那边的林子，也这么大？ |
| react.earth_refuse | 1. 会炸的粉？林子会着火。不行。／2. 纸做的钱？谁会信。 |
| quest.q_a1_m05_grey_wolf.offer | 1. 北边有灰色的狼。我说了，没人信。你信不信？／2. 伐区北边，狼穴。我要去看。一起？ |
| quest.q_a1_m05_grey_wolf.accept | 1. 说好了。跟紧我，别出声。／2. 逆风走。 |
| quest.q_a1_m05_grey_wolf.decline | 1. 那我自己去。／2. 我就知道。 |
| quest.q_a1_m05_grey_wolf.progress | 1. 这脚印……太大了。／2. 有一只缺了耳朵的。头狼。／3. 味道不对。它们身上有灰。 |
| quest.q_a1_m05_grey_wolf.complete | 1. 裂耳倒了。牙是你的。／2. 我看见了。你没退。祖灵在上。 |
| quest.q_a1_m05_grey_wolf.after | 1. 他们说是你捡了德里斯的漏。我在场。不是。／2. 灰色的狼，还会有。我闻得出来。 |
| quest.q_a1_s05_burned_shed.offer | 1. 猎棚被烧了。有人放的火。／2. 我知道是谁。我要证据。 |
| quest.q_a1_s05_burned_shed.accept | 1. 好。先去现场。／2. 我闻火油的味道。 |
| quest.q_a1_s05_burned_shed.progress | 1. 火油是伐木场那边的味道。可不是加斯帕。／2. 别急着报仇。我要先弄清楚。 |
| quest.q_a1_s05_burned_shed.complete | 1. 弄清楚了。……我不报复。我要他当面说。／2. 谢谢你没让我动手。 |
| quest.q_a1_s05_burned_shed.after | 1. 猎棚重新搭起来了。东坡的人都来帮忙。 |
| quest.q_a1_d04_forest_dispute.progress | 1. 林约刻在约树上。人族忘了，树没忘。／2. 博罗要动手了，我拦不住多久。 |
| quest.q_a1_d04_forest_dispute.after | 1. 〔when: a1_forest_accord == restored〕林约回来了。祖灵在上。／2. 〔when: a1_forest_accord == partial〕一半。总比没有好。／3. 〔when: a1_forest_accord == broken〕……东坡要走了。我……还没想好跟不跟。 |
| quest.q_a1_d02_witch_trial.progress | 1. 欧拉婆婆没害人。我闻得出来。／2. 他们要把她关起来？凭什么。 |
| quest.q_a1_d02_witch_trial.after | 1. 〔when: a1_oola_fate == cleared〕婆婆回家了。好。／2. 〔when: a1_oola_fate IN (convicted, fled)〕婆婆不在了。东坡的药，以后找谁。 |
| quest.q_a1_m12_tide_night.progress | 1. 〔when: a1_beast_tide_started〕林缘我守。它们从林子里来，我认得路。／2. 〔when: a1_beast_tide_started〕东坡的人进栅子了吗？快！ |
| quest.q_a1_m12_tide_night.after | 1. 〔when: a1_bs_survival == intact〕镇子还在。东坡也还在。／2. 〔when: a1_bs_survival != intact〕……烧了好多房子。东坡的熏肉棚也没了。 |
| bark.combat | 1. 祖灵在上！／2. 别动，我瞄准了。／3. 左边！ |
| bark.hurt | 1. 呜……没事。／2. 擦破皮。／3. 还能拉弓。 |
| bark.victory | 1. 倒了。／2. 好。收箭。／3. 剥皮的活归我。 |
| bark.ally_down | 1. 起来！别躺着！／2. 我来拖你！／3. 喂！看着我！ |
| bark.flee | 1. 退！往林子里退！／2. 跟着我跑，我认得路！／3. 别回头！ |
| bark.work | 1. 这张皮好。／2. 刀要顺着纹走。 |
| bark.eat | 1. 熏肉。吃吗？／2. 吃饱了才有力气。 |
| bark.chat | 1. 阿柯又跑哪去了。／2. 今天林子里很安静。 |
| bark.sleep | 1. ……别动我的弓……／2. ……娘…… |
| bark.travel | 1. 这条路有鹿走过。／2. 前面有水，我闻到了。 |
| bark.camp | 1. 我守夜。狼族不怕黑。／2. 火堆别太大。 |
| bark.morning | 1. 天亮了。进林子。 |
| bark.see_feat | 1. （耳朵竖起来）……我看见了！ |

#### `ln_ron` 罗恩（主要同伴；首登第一幕；本批 219 句）

> 口吻：平时碎碎念、长句吐槽，紧张时语速极快，发令时突然短促清楚；看到超凡的事先说"不可能"，再找一个常识里的解释，亲眼看完才"……好吧，可能"；把功劳推给别人。称呼："新来的"，熟后直接叫名字（`{player}`）。禁区：超出 K1 的解释（他的"常识"可以错，但不能是高层真相）；第一支小队全灭、他逃走的事（第三幕才说，本幕回避）；不嘲笑别人的恐惧，不冒充玩家发号施令。

| 槽位 | 句 |
| --- | --- |
| greet.cold.day | 1. 啊，是你。我今天真的很忙，忙着……活着。／2. 别拉我去什么危险的地方，求你了。／3. 有事？先说清楚危险程度。 |
| greet.cold.night | 1. 这么晚？不去，不管是哪儿都不去。／2. 夜里出门的人，第二天都上了委托板的悬赏栏。／3. 你又睡不着？我是睡得着的那种人。 |
| greet.neutral.day | 1. 哟，新来的。板上今天有安全的活吗？／2. 早。我数了，今天的护符一个都没掉，好兆头。／3. 来了？醉月亭的炖菜今天有肉。 |
| greet.neutral.night | 1. 天黑了，按规矩，冒险者天黑不出镇。我定的规矩。／2. 晚上好。别跟我说你要去北边。／3. 还醒着？那就坐下喝一杯，别出门就行。 |
| greet.warm.day | 1. {player}！正找你呢。今天我们……先说好，干安全的。／2. 来了来了，我把盾擦亮了。为什么擦？不知道，紧张。／3. 你在就好。不是说你能打，就是……你在就好。 |
| greet.warm.night | 1. 坐吧，炉子还热。今天的事我还没缓过来。／2. 睡不着？我也是。我们说点无聊的事吧。／3. 你回来了。我数了一遍人，都在。 |
| farewell | 1. 走好。别死。我说真的。／2. 明天见。如果明天还在的话。开玩笑的。／3. 我去看看委托板，有安全的给你留着。 |
| acts.act1.greet.neutral | 1. 〔first〕新来的？F 级？没事，大家都从 F 级开始。／2. 〔when: act_week <= 4〕我叫罗恩，D 级。别问为什么一直是 D 级。／3. 〔when: quest.q_a1_m06_one_night_mine〕矿道那件事……我到现在还觉得在做梦。 |
| acts.act1.greet.warm | 1. 〔when: a1_beast_tide_cleared〕那天晚上我没跑。你看见了吧？我没跑。／2. 〔when: a1_beast_tide_cleared〕镇上的人现在跟我打招呼了。叫我"守门的罗恩"。怪别扭的。 |
| unbelief.deny | 1. 不可能。／2. 不可能，一个人？那个大小？不可能。／3. 你是在跟我开玩笑，对吧？对吧？ |
| unbelief.explain | 1. 不可能。……那东西肯定早被独眼团打残了。／2. 不可能。……你是不是跟公会串通了？／3. 你其实是哪家的少爷吧？有护卫偷偷跟着那种？ |
| unbelief.waver | 1. 不可能。……也许……不，不可能。／2. 我刚才……眼花了。我一定是眼花了。／3. {feat}那回，我是亲眼看见的。我能说什么呢。 |
| topic.gen_you.act1 | 1. 你？你是我见过最奇怪的 F 级。不对，你是我见过最奇怪的人。／2. 我跟镇上的人说你是真的，他们说我喝多了。我那天就喝了一杯！ |
| topic.gen_you.worship | 1. ……好吧，可能。你是真的。我认了。／2. 我不会跟别人说你很强，说了也没人信，我试过。 |
| topic.gen_self.cold | 1. 罗恩。D 级。就这样。／2. 一个普通冒险者，不值得聊。 |
| topic.gen_self.neutral | 1. 罗恩，D 级冒险者。主要干清老鼠、送信、帮人找羊这种活。／2. 胳膊上这些？护符。五位女神的都有。我胆小，所以全拜。 |
| topic.gen_self.warm | 1. 我就是个怕死的人，{player}。但我记得每个跟我一起出过委托的人的名字。／2. 我老家在南边，母亲一个人住，屋顶漏雨。我攒钱就为了这个。 |
| topic.gen_work.K1 | 1. 冒险者嘛，接委托，领报酬，活着回来。最后一条最重要。／2. 委托要挑。写着"简单"的，一般都不简单。 |
| topic.gen_past.cold | 1. 没什么好说的。真的。／2. 过去？我过去也是 D 级。 |
| topic.gen_past.warm | 1. 我以前……也有过一支小队。后来没了。别问了，好吗。／2. 以后吧。以后我会告诉你的。 |
| topic.gen_advice.K1 | 1. 规矩一：天黑前回镇。规矩二：打不过就跑。规矩三：跑的时候带上同伴。／2. 新人最容易死在第二个月。第一个月怕，第三个月熟，第二个月以为自己熟了。 |
| topic.gen_faith.K0 | 1. 我五位都拜。光管秩序，交易那位管钱，林子那位管路，记录那位……管记性？还有一位管打架。／2. 教会说有一位是邪神。我也拜，偷偷拜。保险。 |
| topic.self_ron_mother.K0 | 1. 我娘织的围巾。褪色了，可是暖和。／2. 等我升了 C 级，就回去给她修屋顶。……可能还要等一阵子。 |
| topic.self_ron_amulets.K0 | 1. 光的、交易的、林子的、记录的，还有打架那位的。一个都不能少。／2. 有一次我掉了一个，那天我被狗追了三条街。你说巧不巧。 |
| topic.secret_ron_wolf.K0 | 1. 〔when: trust.ron >= 60〕跟你说个秘密：我从没一个人打赢过一只狼。一只都没有。／2. 〔when: trust.ron >= 60〕我接的委托都是靠计划、靠拉人干完的。这不算本事吧？ |
| topic.lore_guild_ranks.K1 | 1. F 是新人，E 是不那么新的新人，D 是我，C 是德里斯那样的，B 以上我们这儿没有。／2. A 级？那是传说。我们镇上……没有 A 级。没有吧？ |
| topic.lore_ranks.K1 | 1. 凡阶、精英阶、英雄阶……普通人一辈子在凡阶。我也是普通人。／2. 鉴定水晶能读出等级。读不出来的……水晶坏了吧。 |
| topic.place_old_mine.K0 | 1. 东北的旧矿，两年前塌了。塌得很彻底。／2. 〔when: quest.q_a1_m06_one_night_mine〕……一夜打通了。我到现在都不知道怎么回事。 |
| topic.person_dris.K0 | 1. 德里斯人不坏，就是……嘴硬。C 级的面子很重要。／2. 〔when: a1_dris_duel_won〕他现在见你就绕道。我觉得他其实挺服你的。 |
| topic.person_martha.K0 | 1. 玛莎老板娘？好人。做的饭好吃。别惹她，我也说不清为什么。 |
| react.feat_seen | 1. 不、不可能……／2. 你、你刚才……我什么都没看见。我什么都看见了。 |
| react.gift_liked | 1. 给我的？真的？我……谢谢，我会好好用的。／2. 新护符！你怎么知道我缺这个？ |
| react.gift_plain | 1. 谢谢，有用。／2. 嗯，我收着。 |
| react.gift_disliked | 1. 这个……我拿着会出事吗？／2. 谢谢，不过我不太敢用。 |
| react.insult | 1. 好吧，我是胆小，这我承认。／2. 你骂我可以，别骂我娘织的围巾。 |
| react.thanked | 1. 别谢我，是你干的。都是你干的。／2. 我就在后面举了个盾。 |
| react.flattered | 1. 别、别夸我，我会当真的。／2. 真的吗？……不对，你在哄我。 |
| react.threatened | 1. 别、别这样，有话好说！／2. 我、我叫人了啊！我真的会叫！ |
| react.helped | 1. 你又帮了我一次。我欠你的账本快写满了。／2. 谢谢。真的谢谢。 |
| react.saved | 1. 我以为我死了。我真的以为我死了。／2. 你救了我。我……我会记一辈子。 |
| react.identity_claim | 1. 别的世界？……你喝了多少？／2. 好好好，你是从天上掉下来的。我信。我不信。 |
| react.accused | 1. 我？我连鸡都不敢偷！／2. 不是我！我可以发誓，用五个护符发誓！ |
| react.belief_worship | 1. ……好吧，可能。是真的。我认了。／2. 不可能？那就让它可能。……我是说，你。 |
| react.apology_accept | 1. 没事没事，我也有不对。／2. 算了，我早忘了。 |
| react.apology_reject | 1. 这次真的不行。你差点害死人。／2. 让我缓一缓。 |
| react.joke | 1. 哈……哈哈。好笑。我笑了。／2. 你这笑话比魔物还吓人。 |
| react.advance | 1. 啊？我、我们是同伴！／2. 别开这种玩笑，我会脸红的。 |
| react.boast | 1. 不可能。……好吧，你确实干过更离谱的。／2. 我信，我信，你小声点。 |
| react.persuaded | 1. 你说得对。我听你的。／2. 好，我们按你的计划来。 |
| react.unpersuaded | 1. 不行，这太冒险了。／2. 我不同意。会死人的。 |
| react.promise_noted | 1. 说好了，我记着。／2. 你答应的事，我信。 |
| react.declined | 1. 〔when: order.moral_tag == kill_surrender〕他投降了！不能杀投降的人！／2. 〔when: order.moral_tag == rob_civilians〕这些人跟我娘一样，我不干。／3. 〔when: order.moral_tag == break_pact〕我们答应过的。说话要算数。／4. 〔when: order.moral_tag == desecrate〕那是坟……不行，我真的不行。／5. 〔when: order.moral_tag == harm_children〕不行！孩子不行！ |
| react.nothing_more | 1. 我就知道这么多了。／2. 再问我也编不出来了。 |
| react.confused | 1. 啊？什么？／2. 等等，你说慢一点。 |
| react.nonsense | 1. 你说的每个字我都懂，连起来就不懂了。／2. 你是不是被灰吹了脑子？ |
| react.haggle_ok | 1. 便宜了！好，好，成交。／2. 省下的够买一个护符了。 |
| react.haggle_no | 1. 不让就不让，我就问问。／2. 太贵了，我们走吧。 |
| react.bribe_accept | 1. 一杯麦酒？……行吧，就当没看见。／2. 收了，下不为例。 |
| react.bribe_refuse | 1. 不行，这个钱我不拿。／2. 我胆小，但我不糊涂。 |
| react.wrong_person | 1. 这个你问布伦，他什么都知道。／2. 我只是个 D 级，这事得找莉娜登记。 |
| react.no_work | 1. 我自己都在找活。／2. 板上今天只有清老鼠的。 |
| react.decline | 1. 这事我真帮不了。／2. 我会拖你后腿的。 |
| react.recruit_yes | 1. 好，我跟你走。死了别怪我。我是说，别让我死。／2. 一起吧。我负责举盾，你负责……别的。 |
| react.recruit_terms | 1. 工钱先说好，我得给我娘寄钱。／2. 先说好，危险的地方我走后面。 |
| react.recruit_later | 1. 等等，我还有个委托没交。／2. 让我想想，明天告诉你。 |
| react.recruit_no | 1. 不行，那太危险了。／2. 我还想活着回去修屋顶。 |
| react.self_recommend | 1. 那个，人手分配……我可以试试安排。／2. 让我来点人数吧，我记得住名字。 |
| react.request_battle | 1. 它们要绕过来了。现在打，趁它们还没站稳。／2. 左边三个，右边两个。我们先打右边。 |
| react.rival_taunt | 1. 你又抢我的盾位置。／2. 下次让我先上……算了，还是你先。 |
| react.rival_concede | 1. 你赢了。我从来没想赢。／2. 输了，心服口服。 |
| react.call_favor | 1. 上回我替你挡了一下，记得吗？这次帮我个忙。／2. 就这一次，求你了。 |
| react.ask_help | 1. 能帮我写封信吗？给我娘。我字丑。／2. 帮我看看这个委托，靠不靠谱。 |
| react.invite | 1. 晚上醉月亭？我请。我是说，我们各付各的。／2. 明天一起去看委托板？ |
| react.deny | 1. 没有，没那回事。／2. 我什么都不知道。 |
| react.evade | 1. 这个……以后再说吧。／2. 换个话题吧，求你了。 |
| react.unknown | 1. 不知道。真的不知道。／2. 这超出我的见识了。 |
| react.goddess_invoked | 1. 你喊谁？……我也喊一下，保险。／2. 别乱喊，我的护符会打架的。 |
| react.earth_talk | 1. 会自己跑的车？……不可能。……好吧，你那边可能。／2. 你们那边的人都这么敢想吗？ |
| react.earth_refuse | 1. 一点就炸？教会会烧掉你的，还有我。／2. 纸做的钱？那我的钱袋岂不是一淋雨就没了。 |
| quest.q_a1_m06_one_night_mine.offer | 1. 旧矿上层的掘穴虫，委托板上挂了一个月了。我们俩……去看看？就看看。／2. 我找了几个人，都说忙。你忙吗？说不忙。 |
| quest.q_a1_m06_one_night_mine.accept | 1. 好，先说好：看到不对劲就跑。／2. 我带了火把、绳子、三天的干粮，还有五个护符。 |
| quest.q_a1_m06_one_night_mine.decline | 1. 好吧……那我再去问问德里斯。他会笑我的。 |
| quest.q_a1_m06_one_night_mine.progress | 1. 不可能。塌了两年的矿道，石头比我们俩加起来都大。／2. 塌方后面有风……有风就是有路。可那不是我们该走的路。／3. 都往后退！左边那块要掉！快！ |
| quest.q_a1_m06_one_night_mine.complete | 1. ……我一定是在做梦。／2. 一夜。一夜打通。我回去怎么跟布伦说？说矿道自己开了？ |
| quest.q_a1_m06_one_night_mine.after | 1. 镇上都说矿道里有矮人的机关。……我没反驳。反驳了也没人信。／2. 那张运货单，你收好。上面那个火漆印，我好像在哪见过。 |
| quest.q_a1_m12_tide_night.progress | 1. 〔when: a1_beast_tide_started〕北门！大家跟我来！拿得动东西的都来！／2. 〔when: a1_beast_tide_started〕别慌！排成一排！盾在前，叉子在后！ |
| quest.q_a1_m12_tide_night.after | 1. 〔when: a1_tide_credit IN (player, martha)〕巨像……巨像是自己塌的吧？对，一定是灰散了。／2. 〔when: a1_beast_tide_cleared〕我没跑。这次我没跑。 |
| quest.q_a1_s16_c_rank_face.progress | 1. 德里斯要跟你比？别，他下手没轻重。……算了，你也没轻重。 |
| bark.combat | 1. 盾！盾在这！／2. 右边，右边来了！／3. 别乱，听我的！ |
| bark.hurt | 1. 啊啊，疼疼疼！／2. 我没事！我有事！我没事！／3. 护符……护符掉了一个…… |
| bark.victory | 1. 赢、赢了？赢了！／2. 我们还活着。都还活着吧？／3. 不可能……好吧，赢了。 |
| bark.ally_down | 1. 起来！我扶你！别睡！／2. 有人倒了！谁在后面，快来！／3. 坚持住，我在这！ |
| bark.flee | 1. 跑！这个打不了！／2. 往回撤，一个跟一个！／3. 我殿后，你们先走！……我说出口了？ |
| bark.work | 1. 今天这个委托写着"简单"，我不信。／2. 盾擦好了，绳子盘好了。 |
| bark.eat | 1. 炖菜有肉！今天是好日子。／2. 吃饱了才有力气跑。 |
| bark.chat | 1. 你听说了吗？算了，你肯定听说了。／2. 我觉得今天会平安。我每天都这么觉得。 |
| bark.sleep | 1. ……娘，屋顶……／2. ……不可能……不可能…… |
| bark.travel | 1. 这条路安全吗？我只是问问。／2. 走慢点，我在后面数人。 |
| bark.camp | 1. 我守后半夜。前半夜我睡不着。／2. 大家的名字我都记得，都在。 |
| bark.fear | 1. 我、我没怕。我手是冷的。／2. 那是什么声音？ |
| bark.see_feat | 1. 不可能。／2. 我刚才……眼花了。 |

#### `ln_oola` 欧拉婆婆（主要同伴；首登第一幕；本批 228 句）

> 口吻：慢，带俚语与草药、季节的比喻，刻薄里带慈祥；常骂人"小崽子"；只说自己知道的一半；看人的眼睛会多看两秒。称呼："小崽子"。禁区：孩子的门纹（至 `trust.oola >= 60`）；落叶路（至 `trust.oola >= 70`，且任何时候都不说下一站）；不确认"无名之神"是真正的神；她能缓解荒原病但治不好，会坦白承认（台账 8.2）。她看得出玩家不寻常，嘴上不说破。

| 槽位 | 句 |
| --- | --- |
| greet.cold.day | 1. 又一个想打听孩子的人？／2. 站那儿别动，我看看你。／3. 有病看病，没病走人。 |
| greet.cold.night | 1. 天黑了还敲门，小崽子，你最好是快死了。／2. 夜里的人，我不开门。／3. 说吧，什么事。 |
| greet.neutral.day | 1. 小崽子，来了。／2. 进来，别踩着我的草。／3. 今天的露水好，采的药也好。 |
| greet.neutral.night | 1. 夜里来，是身上疼还是心里疼？／2. 坐，锅里熬着药，别碰。／3. 嗯，你来了。 |
| greet.warm.day | 1. 小崽子，饭吃了没有？／2. 你来得巧，帮我把那捆草晾上。／3. 雀儿们认得你了，你看，没飞走。 |
| greet.warm.night | 1. 坐近点，夜里凉，人老了怕冷，你也别逞强。／2. 你来了，我心里就踏实一点。／3. 喝碗汤，苦的。良药都苦。 |
| farewell | 1. 去吧，小崽子，别摔着。／2. 草长一季，人活一世。别浪费。／3. 走吧，记得喝水。 |
| acts.act1.greet.neutral | 1. 〔first〕你就是那个让水晶没反应的？……嗯，眼睛倒是干净。／2. 〔when: a1_witch_trial_started AND a1_oola_fate != cleared〕他们说我是魔女。你也这么想？／3. 〔when: a1_oola_fate == cleared〕神父来道歉了。哼，还算有点骨头。 |
| acts.act1.greet.warm | 1. 〔when: quest.q_a1_m07_north_spring〕北泉的事，多亏你。孩子们能喝干净水了。／2. 〔when: a1_oola_fate == cleared〕我还活着，还能骂人。托你的福。 |
| unbelief.deny | 1. 本事大不大，我不看传闻，我看手。／2. 镇上说你这样那样，我只当耳旁风。／3. 外头的话，三分真七分草。 |
| unbelief.explain | 1. 你这身本事，不是从这片土里长出来的。／2. 运气？我活了七十多年，没见过这么好的运气。／3. 我不问你从哪来。你也别问我知道多少。 |
| unbelief.waver | 1. 我活得够久了，看人不看传闻，看眼睛。你的眼睛没撒谎。／2. 我信我看见的。我看见了。／3. 你不是坏人。这就够了。 |
| topic.gen_you.act1 | 1. 你身上有股味道，不是这里的。我闻得出，跟那狼丫头一样。／2. 你不是来害人的。我多看了你两秒，看出来了。 |
| topic.gen_self.cold | 1. 一个熬药的老太婆。／2. 欧拉。镇上叫我婆婆。 |
| topic.gen_self.neutral | 1. 欧拉。种草、采药、熬药，收鸡蛋当诊费。／2. 年轻时也走过一些地方，老了就守着这片林缘。 |
| topic.gen_self.warm | 1. 我年轻的时候，穿过白袍子。后来脱了。别问为什么。／2. 我这辈子就一件事要做：让孩子们平安长大。 |
| topic.gen_work.K0 | 1. 药草婆婆。镇上的头疼脑热，我管。／2. 骨头断了我接，发热了我退，荒原病……我只能让它慢一点。 |
| topic.gen_past.cold | 1. 过去的事，埋在土里了。／2. 小崽子，你还嫩。 |
| topic.gen_past.warm | 1. 我年轻时在礼拜堂里待过。我看过他们怎么对待手上有印子的人。所以我出来了。／2. 那是很久以前的事了。光没救那个人，草也没救。我记了一辈子。 |
| topic.gen_advice.K0 | 1. 北泉的水，别喝。打井水，或者去磨坊那口井。／2. 天冷穿厚点，头疼找我，心里疼……也可以找我。 |
| topic.gen_faith.K0 | 1. 光？光治得了刀口，治不了荒原病。／2. 我不在人前祈祷。林子里的那位，听得见。 |
| topic.self_oola_herbs.K0 | 1. 银叶草退热，苦苓根止咳，鹿泉边的净泉草最难得。／2. 草不会骗人。人会。 |
| topic.self_oola_herbs.K2 | 1. 荒原病，老辈德鲁伊叫的名字。从北边来，沾上的人皮肤发灰。／2. 我能让它慢下来。治不好。我不骗你。 |
| topic.lore_grey_sickness.K2 | 1. 荒原病不是诅咒，是灰气进了身子。从水里、从灰里、从遗迹那边来。／2. 草能缓，泉能洗，可根子不在人身上，在北边。 |
| topic.lore_grey_sickness.K1 | 1. 北边来的病。喝了不干净的水就会得。 |
| topic.place_bs_north_spring.K1 | 1. 〔when: a1_north_spring_found〕北泉的水发灰。孩子们喝的就是它。／2. 〔when: a1_north_spring_found〕堵上那条暗渠，镇子就能喘口气。 |
| topic.place_bs_north_spring.K0 | 1. 北泉不收井税，穷人都喝它。……我叫他们别喝，他们不听。 |
| topic.person_cassian.K0 | 1. 那个年轻神父？心是好的，脑子被圣典糊住了。／2. 〔when: a1_oola_fate == cleared〕他来道过歉了。比我想的有骨头。 |
| topic.lore_nameless_god.K1 | 1. 〔when: trust.oola >= 40〕边境的老人管那个叫"无名之神"。别在神父面前提。／2. 〔when: trust.oola >= 40〕我也只听过名字，没见过神。名字也是假的，"无名"嘛。 |
| topic.faith_sylvie.K0 | 1. 林子的那位，不爱说话。她只看。／2. 我常做梦，梦里林子里有人在看。醒了就忘。 |
| topic.place_deer_spring.K0 | 1. 〔when: trust.oola >= 40〕林子深处有个鹿泉，泉边长净泉草。我给你画个图。／2. 鹿带你去的话，你就跟着。鹿认得好人。 |
| topic.secret_oola_children.K2 | 1. 〔when: a1_orphan_mark_seen AND trust.oola >= 60〕……孩子们身上那个，不是病。我用草汁盖住了。别让神父看见。／2. 〔when: a1_orphan_mark_seen AND trust.oola >= 60〕他们没做错什么。生来就带着，跟胎记一样。 |
| topic.secret_oola_leafroad.K2 | 1. 〔when: trust.oola >= 70〕"远房亲戚"……是我送走的。送到能活下去的地方。／2. 〔when: trust.oola >= 70〕每季来的那个旅商，是好人。别的你不用知道，下一站我不会说。 |
| react.deny | 1. 孩子？孩子们好好的，有什么好看的。／2. 没有的事，小崽子。 |
| react.evade | 1. 你问得太多了。先喝药。／2. 等你哪天值得我说了，我自然会说。 |
| react.unknown | 1. 这个我不知道。真不知道。／2. 草不教这个。 |
| react.feat_seen | 1. ……嗯。你这孩子，藏了不少东西。／2. 我看见了。我不说。 |
| react.gift_liked | 1. 净泉草！小崽子，你在哪找到的？／2. 好布，能给孩子们做衣裳。 |
| react.gift_plain | 1. 嗯，收着了。／2. 放那儿，有用。 |
| react.gift_disliked | 1. 这东西我用不上，给需要的人吧。／2. 金子？我要金子干什么，买棺材？ |
| react.insult | 1. 小崽子，嘴放干净，老太婆下的药你吃不消。／2. 骂吧，我被骂了一辈子。 |
| react.thanked | 1. 谢什么，把药喝完。／2. 记着就行，以后帮帮别人。 |
| react.flattered | 1. 嘴甜的小崽子，最会骗老太婆。／2. 哼，夸我也不减药钱。我本来就不收钱。 |
| react.threatened | 1. 你吓唬一个快入土的人？／2. 我这把老骨头，你打得动吗？ |
| react.helped | 1. 你帮了孩子们，就是帮了我。／2. 这份情，老太婆记着。 |
| react.saved | 1. 我以为我要死在那个笼子里了。……谢谢你，小崽子。／2. 你救了我。也救了孩子们。 |
| react.identity_claim | 1. 别的世界？……嗯。你身上的味道，确实不是这里的。小声点。／2. 这话别跟神父说，他会把你和我一起烧了。 |
| react.accused | 1. 我害孩子？我这辈子就为孩子活着！／2. 拿出证据来。你们只有恐惧。 |
| react.belief_worship | 1. 别把你当神。你是个好孩子，就够了。／2. 我信你。信你会护着孩子。 |
| react.apology_accept | 1. 行了，知错就好。／2. 我不记仇，我记药方。 |
| react.apology_reject | 1. 你伤了孩子，道歉没用。／2. 等你做点事再来说。 |
| react.joke | 1. 哼，小崽子贫嘴。／2. （她嘴角动了一下）去去去。 |
| react.advance | 1. 我当你奶奶都嫌老。／2. 胡说八道，喝药去。 |
| react.boast | 1. 吹吧，牛皮吹破了我给你缝。／2. 有本事的人不说，说的人没本事。……你例外。 |
| react.persuaded | 1. 好吧，听你的。这回。／2. 你说得在理。 |
| react.unpersuaded | 1. 不。我活了七十年，这事我比你懂。／2. 我主意定了。 |
| react.promise_noted | 1. 你答应的，我记着。别让孩子们失望。／2. 说定了。 |
| react.declined | 1. 〔when: order.moral_tag == kill_surrender〕他已经倒了。我是治人的，不是杀人的。／2. 〔when: order.moral_tag == rob_civilians〕抢穷人？你给我滚。／3. 〔when: order.moral_tag == break_pact〕说好的事，草都知道守季节。／4. 〔when: order.moral_tag == desecrate〕死人也要安生。别碰。／5. 〔when: order.moral_tag == harm_children〕你敢碰孩子一根手指，我先毒死你，再毒死我自己。 |
| react.nothing_more | 1. 就这些，别的我不知道。／2. 说完了，喝药。 |
| react.confused | 1. 嗯？小崽子，说人话。／2. 我耳朵不好，再说一遍。 |
| react.nonsense | 1. 发烧了吧？过来我摸摸额头。／2. 胡话。 |
| react.haggle_ok | 1. 行行，便宜点，反正我也不靠这个活。／2. 拿去吧。 |
| react.haggle_no | 1. 这草我在林子里蹲了三天，不让。／2. 嫌贵自己去采。 |
| react.bribe_accept | 1. 鸡蛋？……行，放那儿，这事我不说。／2. 收了。为孩子收的。 |
| react.bribe_refuse | 1. 拿走。老太婆不缺这个。／2. 钱买不来我的嘴。 |
| react.wrong_person | 1. 刀伤找神父，他那个光能治。荒原病找我。／2. 这个问铁匠去。 |
| react.no_work | 1. 我这儿没活，有病人。／2. 你去帮帮孤儿院吧。 |
| react.decline | 1. 这个忙我帮不了，我老了。／2. 不行，这事会害了孩子。 |
| react.recruit_yes | 1. 好吧，跟你走一段。你这身子，没人照看不行。／2. 带上我的药箱。 |
| react.recruit_terms | 1. 孩子们得有人照看。你答应我，我就跟你走。／2. 天黑前回来。我还得熬药。 |
| react.recruit_later | 1. 等孩子们安顿好了再说。／2. 现在不行，北区还有病人。 |
| react.recruit_no | 1. 我不离开这片林子。／2. 不行，孩子们离不开我。 |
| react.self_recommend | 1. 伤员交给我。／2. 让我去看看病人。 |
| react.request_battle | 1. 别等了，伤员越拖越多。／2. 打完了我好救人。 |
| react.rival_taunt | 1. 小崽子，你那包扎手法，还不如我家雀儿。／2. 跟我比认草？ |
| react.rival_concede | 1. 好吧，这回你对了。／2. 你赢了，老太婆认。 |
| react.call_favor | 1. 你欠我一碗药钱。现在还。／2. 帮老太婆一个忙。 |
| react.ask_help | 1. 帮我去林子里采点草，我腿不好。／2. 孤儿院缺柴，帮我送一捆过去。 |
| react.invite | 1. 晚上来喝汤。／2. 明天陪我去林子里走走。 |
| react.goddess_invoked | 1. 别乱喊名字，小崽子，有的名字会招来眼睛。／2. 喊了也没用，她们忙。 |
| react.earth_talk | 1. 你那边的药，比我的好吗？／2. 能治荒原病的药？有就好了。 |
| react.earth_refuse | 1. 炸东西的粉？那是害人的。我不听。／2. 纸钱？那是给死人烧的。 |
| quest.q_a1_m04_f_rank_rules.progress | 1. 银叶草长在林缘背阴的地方，叶子背面发白。别采根。／2. 采回来了？嗯，还行，小崽子手不笨。 |
| quest.q_a1_m07_north_spring.offer | 1. 〔when: trust.oola >= 50〕北区的孩子一个一个倒下。我知道是水。没人信我。你信吗？／2. 夜里去北泉，看看水。带上那个不说话的男孩，他知道路。 |
| quest.q_a1_m07_north_spring.accept | 1. 好。小心，别喝那水，别碰那灰。 |
| quest.q_a1_m07_north_spring.progress | 1. 这水发灰。底下有东西在渗。／2. 暗渠往北，往遗迹那边。我就知道。 |
| quest.q_a1_m07_north_spring.complete | 1. 这是证据。拿着它，神父就不能再说是巫术了。／2. 〔when: a1_north_spring_found〕堵上了？孩子们……孩子们能喝干净水了。 |
| quest.q_a1_m07_north_spring.after | 1. 荒原病还在，可至少不从泉里来了。／2. 小崽子，你做了一件大事。别告诉别人是我说的。 |
| quest.q_a1_s23_deer_spring.offer | 1. 〔when: trust.oola >= 40〕净泉草，林子深处的鹿泉边才有。我给你画个图。 |
| quest.q_a1_s23_deer_spring.complete | 1. 净泉草！你找着了。鹿带你去的？那就好，鹿认得好人。／2. 这草能救孩子。 |
| quest.q_a1_d02_witch_trial.progress | 1. 〔when: a1_witch_trial_started〕他们要审我。我不怕死，我怕孩子们没人管。／2. 〔when: a1_witch_trial_started〕我说了是水，没人听。我不能说太多，说多了孩子就危险了。 |
| quest.q_a1_d02_witch_trial.after | 1. 〔when: a1_oola_fate == cleared〕光之鉴还算公道一回。……是你让它公道的。／2. 〔when: a1_oola_fate == fled〕我得走了，去林子里。孩子们……拜托你了。／3. 〔when: a1_oola_fate == convicted〕他们要押我去瓦伦堡。别哭，小崽子，老太婆没那么容易死。 |
| quest.q_a1_m12_tide_night.progress | 1. 〔when: a1_beast_tide_started AND a1_oola_fate == cleared〕伤员往我这儿抬！快！／2. 〔when: a1_beast_tide_started〕孩子们呢？先把孩子们藏好！ |
| quest.q_a1_m12_tide_night.after | 1. 〔when: a1_children_safe〕孩子们都在。都在。／2. 〔when: a1_bs_survival != intact〕又要熬好多药了。 |
| bark.combat | 1. 小崽子，躲我后面！／2. 草根缠住它！／3. 别硬碰！ |
| bark.hurt | 1. 老骨头……还撑得住。／2. 哎哟，这一下。／3. 不碍事。 |
| bark.victory | 1. 完了？伤的过来，我看看。／2. 好，都活着。／3. 歇一口气。 |
| bark.ally_down | 1. 别动他，让我来！／2. 小崽子，睁眼！看着我！／3. 还有气，还有气！ |
| bark.flee | 1. 走！往林子里走！／2. 别管我，老太婆跑得慢！快走！／3. 跟着雀儿走！ |
| bark.work | 1. 这锅药，熬三个时辰。／2. 叶子要阴干，晒了就没用了。 |
| bark.eat | 1. 吃饭，别说话。／2. 鸡蛋又是诊费，吃不完。 |
| bark.chat | 1. 林子里的鸟今天叫得不对。／2. 孩子们今天咳得少了。 |
| bark.sleep | 1. ……林子里……有人在看……／2. ……孩子……别出声…… |
| bark.travel | 1. 慢点走，老太婆跟不上。／2. 这条路边有草，等我采一把。 |
| bark.camp | 1. 我守着火，你们睡。／2. 夜里凉，盖好。 |
| bark.night | 1. 夜里的林子，最诚实。 |
| bark.see_feat | 1. ……嗯。我看见了。 |

#### `ln_dris` 德里斯（随行同伴；首登第一幕；本批 90 句）

> 口吻：自负、好面子，其实很努力；一切都解释成"我们打残了""运气罢了"；输了也不认，只会别扭地尊敬。称呼："F 级的"，服气之后改叫"喂"。禁区：他升 C 级那次讨伐，主意是罗恩出的（秘密，信任 50 且比试输掉之后才吐口）。是"凡人不信"的头号代言人。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. F 级的，又来捡漏？／2. 让开，C 级的活你接不了。／3. 哼。 |
| greet.neutral | 1. 喂。／2. 又是你。有事？／3. 板上那个活别跟我抢。 |
| greet.warm | 1. 喂……喝一杯？我请。就这一次。／2. 你来了。……今天打算干什么？／3. 后院的新木桩，比那根老的结实。要不要试试？ |
| farewell | 1. 走吧。／2. 别死在外头，丢公会的脸。／3. 下回再比。 |
| unbelief.deny | 1. 那是我们打残的。／2. 运气罢了。／3. F 级、Lv1、没职能？你吹给谁听。 |
| unbelief.explain | 1. 那窝东西前几天我们队打残了，你捡了个漏。／2. 又捡我们的漏。／3. 碰巧罢了，换我也行。 |
| unbelief.waver | 1. 那根木桩……是朽了。肯定是朽了。／2. 你那一下……别以为我服了。／3. ……下回，我再跟你比。 |
| react.feat_seen | 1. 运气。纯粹运气。／2. ……哼，这次算你厉害。 |
| react.gift_liked | 1. 好刀石！……我是说，凑合能用。／2. 给我的？我、我不缺。……放下吧。 |
| react.gift_plain | 1. 嗯。／2. 凑合。 |
| react.gift_disliked | 1. 你拿这个打发 C 级？／2. 不要。 |
| react.insult | 1. 你说谁？出来，后院！／2. F 级的也敢跟我这么说话？ |
| topic.gen_self.neutral | 1. 德里斯，C 级。镇上最强的冒险者。……之一。／2. 我迟早升 B 级，离开这个乡下。 |
| topic.gen_work.K1 | 1. 接讨伐委托。清狼窝、杀精英，C 级的活。／2. 镇上的事大多是我们队摆平的。 |
| topic.self_dris_rank.K1 | 1. B 级考核在瓦伦堡。我要去。我要让他们看看。／2. 在这种地方待一辈子？我不要。 |
| topic.secret_dris_ron_plan.K1 | 1. 〔when: a1_dris_duel_won AND trust.dris >= 50〕……我升 C 级那次，主意是罗恩出的。别告诉他我说了。／2. 〔when: a1_dris_duel_won AND trust.dris >= 50〕他胆子小，脑子好使。我两样都缺一半。 |
| topic.person_ron.K0 | 1. 罗恩？胆小鬼。……不过他那个脑子，有时候还行。 |
| topic.lore_guild_ranks.K1 | 1. C 级要独立讨伐精英，你连 E 都不是。／2. B 级以上，乡下见不着。 |
| react.thanked | 1. 别谢我，我不是为你。／2. 哼。 |
| react.helped | 1. ……欠你一个面子。／2. 我自己也能行。不过……谢了。 |
| react.saved | 1. 你……救我？别跟人说。／2. 这条命，我记着。 |
| react.recruit_yes | 1. 跟你走？行。工钱照 C 级算。／2. 走吧。别拖我后腿。 |
| react.recruit_terms | 1. 日薪三到五银，C 级的价，少一个铜子都不行。／2. 先说好，打头阵的是我。 |
| react.recruit_later | 1. 等我把手上这个委托交了。／2. 等你升了 E 级再说。 |
| react.recruit_no | 1. 我跟一个 F 级走？笑话。／2. 不去。 |
| react.rival_taunt | 1. 有本事再比一场。／2. 别以为大家夸你两句，你就真是个人物了。 |
| react.rival_concede | 1. ……我输了。这回算你的。／2. 木桩是朽的。可我也输了。 |
| react.flattered | 1. 那当然。／2. 你总算说了句实话。 |
| react.boast | 1. 你吹？我也会吹。／2. 嘴上功夫谁不会。 |
| quest.q_a1_s16_c_rank_face.offer | 1. F 级的，敢不敢去后院比一场？让大家看看你那水晶是不是真坏了。／2. 不敢？那就承认你是靠运气。 |
| quest.q_a1_s16_c_rank_face.accept | 1. 好。别哭。／2. 木桩前面，规矩是点到为止。 |
| quest.q_a1_s16_c_rank_face.decline | 1. 我就知道。胆小鬼。／2. 怕了吧。 |
| quest.q_a1_s16_c_rank_face.complete | 1. 〔when: a1_dris_duel_won〕……木桩断了。早就朽了。我早就说该换了。／2. 〔when: NOT a1_dris_duel_won〕哼，C 级就是 C 级。……你让我？你敢让我？ |
| quest.q_a1_s16_c_rank_face.after | 1. 〔when: a1_dris_duel_won〕下回再比。新木桩是铁木的。／2. 〔when: NOT a1_dris_duel_won〕你欠我一个面子……不对，是我欠你的。别说了。 |
| quest.q_a1_m12_tide_night.progress | 1. 〔when: a1_beast_tide_started〕C 级的跟我上！别让 F 级的抢了风头！／2. 〔when: a1_beast_tide_started〕这东西……比狼窝大多了…… |
| quest.q_a1_m12_tide_night.after | 1. 〔when: a1_beast_tide_cleared〕那天你也在。我看见了。……我不说。 |
| bark.combat | 1. 看我的！／2. C 级的本事，看好了！ |
| bark.hurt | 1. 呃……小伤。／2. 别看我，我没事！ |
| bark.victory | 1. 我打残的。记清楚。／2. 赢了，没悬念。 |
| bark.ally_down | 1. 喂，起来！别装死！／2. 谁倒了？我去！ |
| bark.flee | 1. 退……战术后撤！／2. 不是跑，是换个地方打！ |
| bark.work | 1. 刀要磨。C 级的刀不能钝。 |
| bark.chat | 1. 那窝狼是我们打残的，你们信不信？ |
| bark.eat | 1. 醉月亭的炖菜，C 级都吃两碗。 |

## 4. 核心人物

核心人物按台词目录第 1.5 节的 K 类写：问候分昼夜、凡人不信三档各 3 句、十一种反应、至少 6 个分层话题、日程里每个活动语境的吠叫。奈拉、卡西安、玛莎第一幕按 K 写，入队那一幕的分幕文件把包补足到 200 句。

#### `ln_nera` 奈拉（核心 L1，第二幕起主要同伴；首登第一幕；本批 111 句）

> 口吻：甜而快，爱反问；一切谈话都被她换算成价格；谈价时放慢；说真心话时突然变得生硬、不流畅；硬币从不离手。称呼："客人"。禁区：她是梅尔卡的眼睛、她的契约、她每晚对硬币说话（台账 S03，第四幕前一律否认或回避）；自称 Lv9；白送任何东西都不会。

| 槽位 | 句 |
| --- | --- |
| greet.cold.day | 1. 客人，今天的价钱对你不太友好。／2. 有事？我在对账。／3. 不买就别挡着柜台，客人。 |
| greet.cold.night | 1. 打烊了，客人。／2. 夜里谈生意，利息翻倍。／3. 这么晚，有什么急事值得我点灯？ |
| greet.neutral.day | 1. 欢迎光临，客人。盐和药水都有，就是贵了点。／2. 客人，想买还是想卖？／3. 这得算算。你先说要什么。 |
| greet.neutral.night | 1. 客人，夜里还来照顾生意？／2. 坐吧，账我刚好算完。／3. 嗯，醉月亭的消息听完了？ |
| greet.warm.day | 1. 我的好客人！今天有好东西给你看。／2. 你来得正好，我有个点子想跟你算算。／3. 客人，你最近可是我账上最好看的一笔。 |
| greet.warm.night | 1. 客人，喝一杯？我请。……这句别记账。／2. 夜里清净，适合谈大买卖。／3. 你来了。我今天……算了，账上写着呢。 |
| farewell | 1. 慢走，客人。账上写着呢。／2. 下次带点好消息来。／3. 〔mood: 喜〕今天这笔，我们都赚了。 |
| unbelief.deny | 1. 客人，这种消息在酒馆里一个铜子三条。／2. 越离谱的消息，越不值钱。／3. F 级，Lv1？这账对不上。 |
| unbelief.explain | 1. 我看是有人在背后做局，客人。／2. 传话的人吹过头了，这类事我见多了。／3. 你身上带着什么好东西？我出价。 |
| unbelief.waver | 1. 客人，我得重新算一算你值多少。／2. 要是真的……这里头的买卖可就大了。／3. 我押你一注。别让我赔。 |
| topic.gen_self.cold | 1. 商会分号的负责人。就这些，客人。／2. 我是卖东西的。 |
| topic.gen_self.neutral | 1. 奈拉，梅尔卡托商会联合边石分号。盐、药水、杂货，都归我管。／2. 狐族，改信交易那一位的狐族。少见吧？ |
| topic.gen_self.warm | 1. 我想把这个分号做成北境的枢纽，然后……回金湾。或者不回。还没算好。／2. 客人，你知道一个人值多少钱吗？我知道。 |
| topic.gen_work.K1 | 1. 买低卖高，魔物季前囤，魔物季里卖。这叫生意。／2. 商会的规矩：契约成立，绝不违约。 |
| topic.gen_past.cold | 1. 过去的事不值钱，客人。／2. 换个话题，我请你喝茶。 |
| topic.gen_past.warm | 1. 我十二岁就进了商会。……别的不说了，说了也不值钱。／2. 我的家在草原那边。现在的家在账本上。 |
| topic.self_nera_ledger.K1 | 1. 账上写着呢。谁欠谁，一笔都跑不了。／2. 我的账本比我的记性好。 |
| topic.self_nera_coin.K1 | 1. 这枚硬币？商人的护身符，客人。／2. 〔when: quest.q_a1_s09_coin_origin〕你那枚跟我这枚……一模一样。客人真会开玩笑。 |
| topic.event_salt_price.K1 | 1. 魔物季前盐价涨，这是行情，不是我定的。／2. 做生意嘛，客人。 |
| topic.lore_grey_crystal.K1 | 1. 灰晶不能私卖，得经持证的工坊净炼。私卖的，抓到要坐牢。／2. 有人找过我分销那种东西。我没答应。……也没多问。 |
| topic.person_moss.K1 | 1. 代官大人是个……很会算账的人。／2. 他的账，我不碰。 |
| topic.place_bs_branch.K0 | 1. 商会分号，后仓是盐和药水，二楼是账房。院角那座神龛，商人都拜。 |
| react.feat_seen | 1. 客人，你这本事能卖多少钱？／2. ……嗯，这一笔我记下了。 |
| react.gift_liked | 1. 这个……客人，你知道它值多少吗？谢谢。／2. 好东西。我收下，回头给你算熟人价。 |
| react.gift_disliked | 1. 客人，这个我卖不掉。／2. 心意我收了，东西你拿回去。 |
| react.insult | 1. 骂人不要钱，客人，可我的时间要钱。／2. 这句我记账上了。 |
| react.thanked | 1. 不客气，账上写着呢。／2. 谢谢就不用了，下回多买点。 |
| react.flattered | 1. 嘴甜也不打折，客人。／2. 嗯……这句话值两个铜子。 |
| react.threatened | 1. 客人，契约之下，威胁是很贵的东西。／2. 动手？商会联合的账，你赔得起吗？ |
| react.helped | 1. 你帮了我一次。我记账上。……这次是正数。／2. 谢谢，客人。真的。 |
| react.saved | 1. 我……欠你一条命。这笔账我不知道怎么还。／2. 客人，这下你可是我最大的债主了。 |
| react.identity_claim | 1. 客人真会开玩笑。／2. 别的世界的货，能卖到这边吗？……我是认真的。 |
| react.accused | 1. 客人，证据呢？没有证据的话，账上不认。／2. 我守约守到字面。你挑不出错。 |
| react.belief_exploit | 1. 客人，你有本事，我有门路。我们可以谈谈。／2. 合作？账我来算，人你来出。 |
| react.belief_worship | 1. 我不拜人，客人。不过你……值得押注。／2. 我押你。全押。别告诉我老板。 |
| react.haggle_ok | 1. 好吧，熟人价。下不为例。／2. 这得算算……行，成交。 |
| react.haggle_no | 1. 这个价我已经贴了运费，客人。／2. 魔物季，盐比命贵。 |
| react.deny | 1. 我？我就是个卖盐的。／2. 客人，你想多了。 |
| react.evade | 1. 这个话题不在今天的价目上。／2. 我们聊聊生意吧，客人。 |
| quest.q_a1_s09_coin_origin.offer | 1. 客人，你这枚硬币……能让我看看吗？就看看。／2. 这东西，你从哪儿来的？ |
| quest.q_a1_s09_coin_origin.progress | 1. 〔when: a1_coin_story〕女神给的？……客人真会开玩笑。／2. 编个故事也行，我爱听故事。 |
| quest.q_a1_s09_coin_origin.complete | 1. 好吧。不管它从哪来，神龛认它。高级兑换，给你开。／2. 客人，你让我今晚睡不着了。 |
| quest.q_a1_s09_coin_origin.after | 1. 神龛那边，你常去吧。我……也常去。 |
| quest.q_a1_s08_salt_price.progress | 1. 盐价？我也想降，客人。可总号的信写得很清楚。／2. 〔when: npc.nera.stance == partner〕好吧。我们来算一笔：降一点价，换一个长期的客人。 |
| quest.q_a1_d03_salt_and_potions.after | 1. 〔when: npc.nera.stance == partner〕合作愉快，客人。这才刚开始。／2. 〔when: npc.nera.stance == hostile〕客人，你坏了我的生意。账上写着呢。／3. 〔when: npc.nera.stance == bought〕价钱谈好了，我就是你的人。……在账面上。 |
| quest.q_a1_m12_tide_night.progress | 1. 〔when: a1_beast_tide_started〕药水全拿出来！不要钱！……记账，回头再算！ |
| quest.q_a1_m12_tide_night.after | 1. 〔when: a1_beast_tide_cleared〕客人，这一夜的药钱，我不收了。别声张。 |
| bark.work | 1. 这得算算……／2. 盐还剩四十袋。 |
| bark.eat | 1. 吃饭也要看账，没办法。／2. 醉月亭的饭，性价比不错。 |
| bark.chat | 1. 酒馆里的消息，一半是钱。／2. 客人们今天说什么了？ |
| bark.sleep | 1. ……账上写着呢……／2. ……再算一遍…… |
| bark.night | 1. 夜里清净，算账最准。／2. 灯油也是钱。 |

#### `ln_cassian` 卡西安神父（核心 L1，第四幕起主要同伴；首登第一幕；本批 119 句）

> 口吻：句式工整，爱引经文；紧张时反复确认"是这样的，对吧？"；超凡之事先归于光，归不了光就怀疑"别的东西"。称呼：初见"这位旅人"，怀疑加深后"阁下"；称信众"诸位"。禁区：在证据出现前，他真诚地相信 MIS-05（门纹是烙印）、MIS-19（病童死于巫术）、MIS-20（无记载是异端之兆）；他从未收到神谕的羞耻不说出口；不收贿、不作伪证、不嘲弄他人信仰（台账 8.2）。

| 槽位 | 句 |
| --- | --- |
| greet.cold.day | 1. 阁下。愿光照着你。……有何事？／2. 请自重，这里是光之厅。／3. 你又来了。光会看见的。 |
| greet.cold.night | 1. 夜深了，阁下。礼拜堂不是夜里该来的地方。／2. 若是告解，请明日。／3. 光在夜里也看着。 |
| greet.neutral.day | 1. 愿光照着你，这位旅人。／2. 你好。今天来祈祷吗？／3. 圣典上说，来者皆是羊。请进。 |
| greet.neutral.night | 1. 这位旅人，夜里还在外面？／2. 晚祷刚结束。有什么需要？／3. 灯还亮着，进来吧。 |
| greet.warm.day | 1. 你来了。孩子们今天问起你。／2. 愿光照着你。……我是说真心的。／3. 来，我刚整理好施药的单子，你帮我看看。 |
| greet.warm.night | 1. 你也睡不着？……我也是。坐吧。／2. 晚祷的时候，我为你祈祷了。是这样的，对吧？朋友之间会这样。／3. 进来，外面冷。 |
| farewell | 1. 光与你同行。／2. 去吧，记得祈祷。／3. 〔mood: 愁〕……愿光指引我们两个。 |
| unbelief.deny | 1. 光不会赐福给没有记载的人。／2. 传闻多半是虚言，圣典教我们审慎。／3. 阁下的事迹，我只听说，未曾亲见。 |
| unbelief.explain | 1. 光不会赐福给没有记载的人。所以这是运气……或者是别的东西。／2. 光会看见的。这是光的眷顾，是这样的，对吧？／3. 若不是光……那就要问，是谁在帮你。 |
| unbelief.waver | 1. 我祈祷时求问过。没有回应。是我的信仰不够，还是你不在光之下？／2. {feat}那天，我看见了。我不知道该怎么写进报告。／3. 光啊……请告诉我，我看错了什么。 |
| react.identity_pageless | 1. 光不会赐福给没有记载的人。……无记载，是异端之兆。／2. 圣灯毫无反应。阁下，你究竟是什么？ |
| topic.gen_self.cold | 1. 边石镇礼拜堂神父，卡西安。／2. 我是光的仆人。 |
| topic.gen_self.neutral | 1. 卡西安，奉教区之命来边石镇两年了。／2. 我负责礼拜、洗礼、临终礼，还有……孩子们的识字课。 |
| topic.gen_self.warm | 1. 我想守住这座镇子的灵魂。圣典上说，牧者不可失一羊。／2. 我是全镇最虔诚的人。……这话说出来，有点可笑，对吧？ |
| topic.gen_work.K1 | 1. 礼拜、探病、施药、写报告。光的工作没有休息日。／2. 每周给瓦伦堡教区写一份报告。小镇的事，教区都要知道。 |
| topic.gen_past.cold | 1. 我来这里之前的事，与阁下无关。 |
| topic.gen_past.warm | 1. 我在神学院读了八年圣典。……读得最多的一句，是"光会回应"。 |
| topic.gen_faith.K1 | 1. 光是唯一的。圣典上说，光照之处，秩序生焉。／2. 其余诸神……教会自有定论。我不嘲弄任何人的信仰。 |
| topic.self_cassian_scripture.K1 | 1. 圣典上说："光照之处，无有隐匿。"我一直相信这句。／2. 这本圣典是我老师给的。书签比书页还多。 |
| topic.self_cassian_reports.K1 | 1. 报告？是例行公事。……内容不便透露，是这样的，对吧？／2. 〔when: a1_oola_fate == cleared〕这周的报告，我写了"晚辈错怪了一位老人"。 |
| topic.lore_branded.K0 | 1. 圣典上说，身负邪纹者，是邪神的仆从。我们称之为烙印者。／2. 若见到身有怪纹之人，请告诉我。这是为了他好。 |
| topic.lore_branded.mis | 1. 烙印者是邪神留下的种子。光会净化他们。 |
| topic.lore_appraisal.mis | 1. 圣灯照不出的人……无记载，是异端之兆。／2. 光不会赐福给没有记载的人。 |
| topic.lore_sixth_sigil.mis | 1. 〔when: a1_wake_ruins〕遗迹墙上第六个纹？那是邪神的涂鸦。别多看。 |
| topic.event_milo_death.mis | 1. 〔when: NOT a1_north_spring_found〕米洛的死……不是自然的。我有理由怀疑是巫术。／2. 光收回了他。可收走他的，也许不是光。 |
| topic.event_milo_death.K1 | 1. 〔when: a1_oola_fate == cleared〕疫病源于北泉，非人为。我错怪了一位老人。 |
| topic.person_oola.mis | 1. 〔when: NOT a1_north_spring_found〕药草婆婆……她不进礼拜堂，夜里出入孤儿院。我必须问清楚。 |
| topic.person_oola.K0 | 1. 〔when: a1_oola_fate == cleared〕欧拉女士……她在教我认草药。我学得很慢。 |
| topic.faith_light_mirror.K0 | 1. 光之鉴是教会传下的圣灯。光会照出真相，是这样的，对吧？／2. 〔when: a1_oola_fate == cleared〕……那盏灯的灯焰，是灰色的。我以前怎么没看见。 |
| react.feat_seen | 1. 光在上……这是什么？／2. 我、我必须禀报上去。 |
| react.gift_liked | 1. 蜡烛……礼拜堂正缺。愿光记住你的善意。／2. 羊皮纸！我的报告终于有纸写了。谢谢。 |
| react.gift_disliked | 1. 这个……不宜放在礼拜堂里。／2. 我不能收。请捐给孤儿院吧。 |
| react.insult | 1. 我会为你祈祷。／2. 光会看见的，阁下。 |
| react.thanked | 1. 这是光的恩典，不是我的。／2. 不必谢我，愿你平安。 |
| react.flattered | 1. 不敢当。我只是做了牧者该做的。／2. 赞美应当归于光。 |
| react.threatened | 1. 光不会后退，我也不会。／2. 你可以伤害我，但不能让我说谎。 |
| react.helped | 1. 你帮了礼拜堂……愿光记得。我也记得。／2. 我不知道该怎么报答你，是这样的，对吧？我只能为你祈祷。 |
| react.saved | 1. 你救了我。……一个无记载的人，救了光的仆人。光啊，这是什么意思？／2. 谢谢你。我会把这件事如实写进报告。 |
| react.identity_claim | 1. 别的世界？……阁下，这话在礼拜堂说，是要受审的。／2. 我当作没听见。愿光宽恕你的胡言。 |
| react.accused | 1. 我没有说谎。我从不说谎。／2. 若我错了，请拿出证据。我愿意被纠正。 |
| react.heresy_alarm | 1. 这不是光。这是别的东西。／2. 诸位，退后！愿光庇护我们！ |
| react.miracle_awe | 1. 光……光在回应？／2. 这是神迹。我、我得写下来。 |
| react.belief_hostile | 1. 阁下，请离开礼拜堂。／2. 我不知道你是什么，但你不在光之下。 |
| react.belief_worship | 1. 你不是神迹。……可你做的事，像光该做的事。／2. 我不会成为任何人的信徒。但我愿意听你说话。 |
| react.bribe_refuse | 1. 光不收贿赂。把钱捐给穷人吧。／2. 阁下，这是对光的侮辱。 |
| react.deny | 1. 报告的内容，不便透露。／2. 没有这回事。 |
| react.evade | 1. 圣典上说，有些事要等时候到了才明白。／2. 这个……我还没想清楚。 |
| quest.q_a1_m04_f_rank_rules.progress | 1. 这封信是给我的？谢谢。……是公会转来的教区来函。／2. 你是新登记的冒险者？愿光照着你，这位旅人。 |
| quest.q_a1_m09_lamp_of_light.progress | 1. 〔when: a1_witch_trial_started〕审判定于光日。光之鉴会照出真相。／2. 〔when: a1_witch_trial_started〕诸位，请安静。光在看着我们每一个人。 |
| quest.q_a1_m09_lamp_of_light.complete | 1. 〔when: a1_oola_fate == cleared〕……光之鉴照出的，是我的错。我向欧拉女士道歉。当着诸位的面。／2. 〔when: a1_oola_fate == convicted〕光已作出裁决。愿她在瓦伦堡得到公正。／3. 〔when: a1_oola_fate == fled〕她逃了。……我不知道这是光的意思，还是我的失败。 |
| quest.q_a1_m09_lamp_of_light.after | 1. 〔when: a1_oola_fate == cleared〕我每天去她那里一个时辰，学认草。圣典上没写这些。／2. 〔when: a1_oola_fate != cleared〕我还是每天祈祷。只是……不知道为什么祈祷了。 |
| quest.q_a1_m12_tide_night.after | 1. 〔when: a1_tide_credit == light〕是光庇佑了边石镇。……是这样的，对吧？／2. 〔when: a1_tide_credit != light〕我在报告里写了实话。实话里有你。 |
| bark.pray | 1. 光啊，照着这座镇子。／2. 求你回应我，一次就好。 |
| bark.sermon | 1. 诸位，请静一静。／2. 圣典上说：光照之处，秩序生焉。 |
| bark.work | 1. 灯芯又该剪了。这灯油总是不好。／2. 孩子们今天念到第三页了。 |
| bark.eat | 1. 感谢光赐下的饭食。／2. 简单的饭，最好。 |
| bark.sleep | 1. ……光会看见的……／2. ……是这样的，对吧…… |
| bark.night | 1. 报告还没写完。 |

#### `ln_martha` 玛莎（核心 L1，第五幕起临时同伴；首登第一幕；本批 112 句）

> 口吻：短句、指令式、带笑；话题一碰到过去就转到吃饭；在人前装普通，一直在观察，会出小测试。称呼："孩子"。禁区：晚钟小队的往事、她见过没有脸的人（第三幕 `a3_martha_tale` 前一律回避）；不主动展示实力，不宣扬自己，不抢玩家的功劳；醉月亭里不许打架（台账 8.2、S02）。她当众的说法是凡人的说法，私下她心里有数。

| 槽位 | 句 |
| --- | --- |
| greet.cold.day | 1. 有事说事，别挡着门口。／2. 今天的酒卖完了，对你。／3. 在我店里，规矩你知道。 |
| greet.cold.night | 1. 打烊了，孩子。／2. 夜里来闹事的，我一般请他们睡在门外。／3. 喝一杯就走。 |
| greet.neutral.day | 1. 来了？先吃饭。／2. 坐，炖菜还热。／3. 孩子，今天想吃什么？ |
| greet.neutral.night | 1. 晚上好。账记上，还是现付？／2. 坐吧，灯给你留着。／3. 外头冷，进来。 |
| greet.warm.day | 1. 来了。先吃饭，吃完再说。／2. 给你留了个座，靠窗那个。／3. 孩子，你瘦了。多吃点。 |
| greet.warm.night | 1. 回来了？锅里有汤。／2. 坐吧，今晚的酒不收你钱。……就一杯。／3. 嗯，平安就好。 |
| farewell | 1. 去吧。回来吃饭。／2. 账记上了。／3. 别死在外头，你还欠我一顿饭钱。 |
| unbelief.deny | 1. 外头传的那些？听听就算了。／2. 酒客的嘴，比我的锅还能装。／3. 孩子，吹牛的人我见多了。 |
| unbelief.explain | 1. 运气好呗。来，吃饭。／2. 大概是那东西先被人打残了吧。……我随口说的。／3. 镇上人说什么就是什么，我开酒馆的，不跟客人争。 |
| unbelief.waver | 1. 嗯。手上有茧，脚下有根。不坏。／2. 我在看着呢，孩子。一直在看。／3. ……我押你不走。我赢了一桌酒钱。 |
| topic.gen_self.cold | 1. 开酒馆的。／2. 玛莎。醉月亭的。 |
| topic.gen_self.neutral | 1. 玛莎，醉月亭的老板娘。吃饭、住店、喝酒，都找我。／2. 我在这儿开了很多年店了。别的没什么好说。 |
| topic.gen_self.warm | 1. 我就想看着这个镇子别出事。就这么简单。／2. 孩子，有人问起你，我就说你是我店里的客人。别的不说。 |
| topic.gen_work.K0 | 1. 做饭、打酒、收账、赶走闹事的。／2. 醉月亭不许打架。这是规矩，我亲自执行。 |
| topic.gen_past.cold | 1. 过去？先吃饭。／2. 饭要凉了。 |
| topic.gen_past.warm | 1. 我年轻的时候也到处跑过。……来，尝尝这个，新腌的。／2. 过去的事，跟着酒一起喝下去了。 |
| topic.gen_advice.K0 | 1. 晚上别往北边去。不为别的，那边的风不对。／2. 吃饱了再出门。饿着肚子的人，判断最差。 |
| topic.self_martha_kitchen.K0 | 1. 今天的炖菜放了东坡的熏肉。尝尝。／2. 先吃饭，天塌下来也先吃饭。 |
| topic.self_martha_bell.K0 | 1. 那个铃？旧货。挂着好看。／2. 孩子，饭要凉了。 |
| topic.secret_martha_blade.K0 | 1. 〔when: a1_martha_strike AND npc.martha.assessment >= 5〕别让我再把那把刀拿出来。／2. 〔when: a1_martha_strike〕风太大，我去关窗。就这样。 |
| topic.event_martha_bet.K0 | 1. 〔when: a1_guild_registered〕他们赌你一个月内哭着回城。我跟了，押你不走。／2. 〔when: a1_guild_registered AND act_week >= 6〕我赢了一桌酒钱。谢谢你没走。 |
| topic.person_bron.K0 | 1. 老布伦？喝多了就胡说。别当真。／2. 他的酒钱……记着呢。 |
| topic.place_bs_drunk_moon.K0 | 1. 醉月亭。吃的、住的、酒，都有。打架的不收。／2. 楼上客房，干净，便宜。地窖别下去，老鼠多。 |
| topic.danger_tide_omens.K0 | 1. 〔when: seal_unrest >= 70〕北边的风变了。今晚把门窗关好。／2. 〔when: seal_unrest >= 70〕林子里的鸟都飞到南边来了。不对劲。 |
| react.feat_seen | 1. 嗯。不坏。／2. ……我什么都没看见。去洗手吃饭。 |
| react.gift_liked | 1. 好东西。拿来，我给你做顿好的。／2. 这个……有心了，孩子。 |
| react.gift_disliked | 1. 这个我用不上，留着吧。／2. 酒馆不缺这个。 |
| react.insult | 1. 在我店里骂人？出去。／2. 嘴巴干净点，孩子，我这儿有刀，切菜的。 |
| react.thanked | 1. 谢什么，吃饭。／2. 记账上。 |
| react.flattered | 1. 少来，夸我也得付钱。／2. 嘴甜的，多给你一勺。 |
| react.threatened | 1. 孩子，你知道在我店里说这话的人，后来都怎么了吗？……他们都去洗碗了。／2. 坐下，喝杯水，冷静一下。 |
| react.helped | 1. 你帮了镇子。我记着。／2. 这顿我请。 |
| react.saved | 1. 欠你一回。我会还。／2. ……你出手比我想的快。 |
| react.identity_claim | 1. 从哪来都一样，在我店里就是客人。／2. 别的世界？那边的人也吃饭吗？那就行。 |
| react.accused | 1. 拿证据来。没有的话，坐下吃饭。／2. 我开店二十年，没坑过一个客人。 |
| react.belief_worship | 1. 别捧我，也别捧你自己。吃饭。／2. 门，你帮我看住了。……我是说，镇子的门。 |
| react.belief_depend | 1. 有你在镇上，我能睡个整觉。／2. 别走太远，孩子。 |
| quest.q_a1_s17_moon_cellar.offer | 1. 地窖里老鼠闹得凶。你去清一清？住店钱给你免了。／2. 别碰那个长木匣，旧货。 |
| quest.q_a1_s17_moon_cellar.accept | 1. 好。灯在楼梯口。 |
| quest.q_a1_s17_moon_cellar.complete | 1. 干净了。不坏，脚步挺稳。／2. 〔when: npc.martha.assessment >= 1〕你没碰那个匣子。好孩子。 |
| quest.q_a1_s17_moon_cellar.after | 1. 楼上那间房，以后就是你的。 |
| quest.q_a1_m04_f_rank_rules.progress | 1. 布伦让你来清地窖？好，正好。 |
| quest.q_a1_d05_tavern_eyes.progress | 1. 〔when: act_week <= 1〕哎呀，手滑了。／2. 〔when: act_week >= 5 AND act_week <= 7〕孩子，你晚上做梦吗？／3. 〔when: act_week >= 5 AND act_week <= 7〕你是从北边来的吧？ |
| quest.q_a1_d05_tavern_eyes.after | 1. 〔when: npc.martha.assessment >= 5〕我看了你很久。你能看住门。／2. 〔when: npc.martha.assessment < 5〕还行。再看看。 |
| quest.q_a1_m12_tide_night.offer | 1. 〔when: seal_unrest >= 80〕北边的风变了。今晚把门窗关好。／2. 〔when: seal_unrest >= 80〕孩子，暗月那天，你别睡死。 |
| quest.q_a1_m12_tide_night.progress | 1. 〔when: a1_beast_tide_started〕孩子们上楼！朵拉，关后门！／2. 〔when: a1_martha_strike〕……退后。 |
| quest.q_a1_m12_tide_night.after | 1. 〔when: a1_martha_strike〕风太大，我去关窗。／2. 〔when: a1_beast_tide_cleared〕都还活着？好。先吃饭。 |
| bark.work | 1. 杯子要擦亮。／2. 这锅汤再炖一刻钟。 |
| bark.eat | 1. 自己做的饭，自己尝一口。／2. 盐放多了。……还行。 |
| bark.sleep | 1. ……把门看住……／2. ……铃…… |
| bark.night | 1. 〔place: tavern〕最后一杯了，各位。／2. 打烊，打烊。 |
| bark.see_player | 1. 那孩子回来了。／2. 嗯，没缺胳膊少腿。 |

#### `ln_bron` 老布伦（核心 L1；首登第一幕；本批 116 句）

> 口吻：粗声粗气；清醒时简短，否认自己说过醉话；醉时啰嗦，反复说"没有脸的人"；遇到遗迹相关的东西会紧张；对玩家的"无记载"又烦又在意。称呼："新来的"。禁区：门纹（至 `a1_bron_sees_mark`）；清醒时承认醉话；玛莎的往事（守口如瓶）；不篡改登记（台账 8.2、S02）。

| 槽位 | 句 |
| --- | --- |
| greet.cold.day | 1. 又是你。有事登记，没事滚。／2. 柜台不是聊天的地方。／3. 哼。 |
| greet.cold.night | 1. 下班了。明天再来。／2. 别在我喝酒的时候说公事。／3. 滚，我喝着呢。 |
| greet.neutral.day | 1. 新来的。委托在板上，自己看。／2. 登记簿上写什么，就是什么。说吧。／3. 交委托？放这儿。 |
| greet.neutral.night | 1. 再来一杯。……你也来一杯？／2. 坐。别说话，听我说。／3. 嗯，你也在。 |
| greet.warm.day | 1. 来了？今天板上有个活，适合你。……别告诉别人我说的。／2. 新来的。坐。你那一页我又添了几行。……没什么，簿子上的事。／3. 嗯。活着回来了，好。 |
| greet.warm.night | 1. 来，喝一杯，我请。玛莎那儿记账。／2. 你来了。我今晚……少喝点。／3. 坐吧，新来的。不对，你不是新来的了。 |
| farewell | 1. 滚吧，别死在外头。／2. 交委托别迟到。／3. 再来一杯。……不是跟你说的。 |
| unbelief.deny | 1. 登记簿上写的是 F 级，Lv1。登记簿不说谎。／2. 那是传闻。传闻不进簿子。／3. 吹的吧。 |
| unbelief.explain | 1. 那东西早被人打残了吧。／2. 运气。这一行运气也是本事。／3. 这木桩用了三十年，早就朽了。 |
| unbelief.waver | 1. ……（他盯着断口）／2. 簿子上记不下你。可我记得下。／3. 别测了。 |
| react.identity_pageless | 1. 坏了就拿去给侯克，别在柜台上拍它。／2. 〔when: act_week >= 6〕……别测了。 |
| topic.gen_self.cold | 1. 分部长。老布伦。／2. 管簿子的。 |
| topic.gen_self.neutral | 1. 冒险者公会边石分部长，布伦。镇上的冒险者都从我这儿过。／2. 以前是 C 级。……胳膊没了以后，就坐柜台了。 |
| topic.gen_self.warm | 1. 我就想把每一个冒险者都好好记下来。死了的，也记着。／2. 新来的，你知道这本簿子有多重吗？我单手翻了二十年。 |
| topic.gen_work.K1 | 1. 登记、发委托、收凭证、发钱。还有骂人。／2. 公会有公会的规矩。规矩能救命。 |
| topic.gen_past.cold | 1. 没什么好说的。／2. 喝酒，别问。 |
| topic.gen_past.warm | 1. 我以前也进过……算了。再来一杯。／2. 我的胳膊？丢在北边了。 |
| topic.gen_advice.K1 | 1. 别碰写着"遗迹"两个字的委托。／2. 活着回来，簿子上才能多一行。 |
| topic.self_bron_ledger.K1 | 1. 登记簿上写什么，就是什么。／2. 你的那一页……什么都写不出来。我就自己写。 |
| topic.self_bron_arm.K1 | 1. 〔when: npc.bron.story_level >= 1〕……那地方，不是给活人去的。／2. 〔when: npc.bron.story_level >= 2〕灰里有东西。我们那时候没看清。／3. 〔when: npc.bron.story_level >= 3〕没有脸的人。从灰里爬出来的。我的胳膊，两个兄弟，都留在那儿了。 |
| topic.secret_bron_mark.K1 | 1. 〔when: a1_bron_sees_mark〕二十年前那个人手上，也有这个。／2. 〔when: a1_bron_sees_mark AND npc.bron.story_level >= 3〕他从灰里爬出来的时候，手背上就是这个纹。不一样的是……他没有脸。你有。 |
| topic.event_expedition_978.K1 | 1. 〔when: npc.bron.story_level >= 1〕二十年前，公会派人进过遗迹。报告被教会烧了。……我什么都没说。／2. 〔when: npc.bron.story_level >= 1〕那块铜牌，是我兄弟的。 |
| topic.event_crystal_broke.K0 | 1. 水晶坏了就拿去修。别大惊小怪。 |
| topic.lore_guild_ranks.K1 | 1. F 到 S。你是 F。簿子上写的。／2. C 级以上，这镇子养不起。 |
| topic.place_sealed_ruins.K1 | 1. 别去。／2. 〔when: npc.bron.story_level >= 2〕那是禁地。教会立碑的时候，我就站在旁边。 |
| topic.quest_board.K0 | 1. 板上的活自己挑，F 级挑 F 级的。／2. 三件 F 级委托，干完了再来找我。 |
| react.feat_seen | 1. ……簿子上记不下这个。／2. 哼。运气。 |
| react.gift_liked | 1. 酒？好东西。……别告诉玛莎。／2. 这个……我收着。 |
| react.gift_disliked | 1. 拿走，公会不收礼。／2. 不要。 |
| react.insult | 1. 再说一遍，我用簿子砸你。／2. 滚出去。 |
| react.thanked | 1. 谢什么，我只是登记。／2. 哼。 |
| react.flattered | 1. 少拍马屁。／2. 夸我也不给你升级。 |
| react.threatened | 1. 我一只手也能把你扔出去。／2. 公会里动手？你想上簿子的黑页？ |
| react.helped | 1. ……你帮了分部。我记下了，在簿子上。／2. 欠你一杯。 |
| react.saved | 1. 二十年前没人救我。这次……谢了。／2. 我这条命，簿子上记着你的名字。 |
| react.identity_claim | 1. 别的世界？你醉得比我还厉害。／2. 簿子上写不出来的东西，你别说出来。 |
| react.accused | 1. 我从不改簿子。一个字都不改。／2. 证据。没证据别来烦我。 |
| react.belief_worship | 1. 我不跪人。不过你那一页……我写得很仔细。／2. 簿子记不下你，我记。 |
| react.deny | 1. 我没说过。／2. 醉话不算数。 |
| react.evade | 1. 再来一杯。／2. 簿子上没写的事，我不说。 |
| quest.q_a1_m03_unrecorded.after | 1. F 级，Lv1，无职能。……簿子上就这么写。 |
| quest.q_a1_m04_f_rank_rules.offer | 1. 三件 F 级委托：地窖老鼠、采银叶草、送信去礼拜堂。干完了再来。／2. 新来的都从这儿开始。别嫌丢人。 |
| quest.q_a1_m04_f_rank_rules.accept | 1. 好。别迷路。 |
| quest.q_a1_m04_f_rank_rules.progress | 1. 还差几件？自己数。 |
| quest.q_a1_m04_f_rank_rules.complete | 1. 三件都干完了。……行，簿子上给你记一笔。／2. 现在你可以看板上的别的活了。 |
| quest.q_a1_m04_f_rank_rules.after | 1. F 级的规矩你懂了。别给分部丢脸。 |
| quest.q_a1_s18_bron_drinks.offer | 1. 〔when: hour >= 19〕坐下，陪我喝一杯。 |
| quest.q_a1_s18_bron_drinks.progress | 1. 那地方，不是给活人去的……／2. 〔when: npc.bron.story_level >= 2〕没有脸的人……你没见过……你不会想见…… |
| quest.q_a1_s18_bron_drinks.after | 1. 我昨晚说什么了？没说什么。你听错了。 |
| quest.q_a1_m02_raven_nest.after | 1. 这铜牌……放这儿吧。 |
| quest.q_a1_m13_woman_at_door.offer | 1. 伯爵要见那个打退兽潮的 F 级。……你说，我该带谁去？ |
| quest.q_a1_m13_woman_at_door.complete | 1. 收拾收拾，去瓦伦堡。簿子我会带着。 |
| quest.q_a1_m13_woman_at_door.after | 1. 〔when: npc.bron.secret_kept〕手套戴好。在城里，别让神父看见。／2. 〔when: NOT npc.bron.secret_kept〕……你先去吧。我还有封信要写。 |
| quest.q_a1_d06_bron_old_wound.after | 1. 〔when: npc.bron.secret_kept〕戴上。在这个镇上，别让神父看见。／2. 〔when: NOT npc.bron.secret_kept〕……你先回去。 |
| bark.work | 1. 簿子……簿子……／2. 凭证呢？没凭证不发钱。 |
| bark.eat | 1. 饭就饭，别跟我说委托。 |
| bark.chat | 1. 再来一杯。／2. 那地方……不说了。 |
| bark.sleep | 1. ……没有脸……／2. ……兄弟…… |

#### `ln_ash` 守门人阿什（核心 L1；首登第一幕；本批 95 句）

> 口吻：慢，长停顿；用抄写员的比喻（"这一行还没写完""墨会干，字不会"）；称女神们为"她们"，称第六司为"她"。称呼："门的孩子"。禁区：大断绝、第六司的职司与名字、开门与封印的关系、夜羽的身份、他的故乡（台账 8.2）；第一幕只说写定台词，不接自由对话，一切话题都回"还不是时候"；第二幕只回答与门有关的技术问题。他知道玩家是什么，不进凡人不信。后幕的内容版本带解锁条件，分幕文件按台账补全。

| 槽位 | 句 |
| --- | --- |
| greet.cold.day | 1. ……又来了。／2. 灰里不分昼夜。说吧。／3. 你身上带着血的味道。 |
| greet.cold.night | 1. ……／2. 墙上的字还没写完。别打扰。／3. 退后一步，门的孩子。 |
| greet.neutral.day | 1. 门的孩子。／2. 你来了。墨还没干。／3. 坐吧，灰是软的。 |
| greet.neutral.night | 1. 夜里的灰更冷。你不该来。／2. ……嗯。／3. 门的孩子，你又走下来了。 |
| greet.warm.day | 1. 〔when: act >= 3〕你来了。这一行，可以接着写了。／2. 〔when: act >= 3〕门的孩子。坐近一点。／3. 〔when: act >= 3〕我等你很久了。……不，是我等的那件事很久了。 |
| greet.warm.night | 1. 〔when: act >= 3〕灰今晚很安静。／2. 〔when: a3_ash_tells_sundering〕你带着她的味道，又来了。／3. 〔when: act >= 3〕坐吧。我念一段给你听。 |
| farewell | 1. 去吧，门的孩子。／2. 还不是时候。／3. 墨会干，字不会。 |
| acts.act1.greet.neutral | 1. 还不是时候。去吧，门的孩子。／2. ……（他没有回头）／3. 还不是时候。 |
| acts.act1.greet.cold | 1. 还不是时候。 |
| acts.act1.farewell | 1. 去吧，门的孩子。 |
| acts.act1.react.threatened | 1. 〔when: a1_ash_met〕……还不是时候。 |
| topic.gen_you.act1 | 1. 还不是时候。 |
| topic.gen_you.doubt | 1. 〔when: act >= 2〕你还不知道自己是什么。这不是你的错。／2. 〔when: act >= 2〕你推开的每一扇门，都写在墙上。 |
| topic.gen_you.explaining | 1. 〔when: act >= 2〕你身上有一扇门。这一行我认得。／2. 〔when: act >= 2〕门不会选错人。人会选错门。 |
| topic.gen_you.wavering | 1. 〔when: act >= 3〕你开的门越多，我越不知道该怎么写你。／2. 〔when: act >= 3〕也许你是对的人。也许不是。我还在读。 |
| topic.gen_you.worship | 1. 〔when: act >= 3〕我不崇拜任何人。我只等。／2. 〔when: act >= 3〕门的孩子……你让我想起很多年前的一句话。 |
| topic.gen_you.hostile | 1. 〔when: act >= 3〕你要强行打开这扇门吗？那你就是我的敌人。／2. 〔when: act >= 3〕停下。这一行，不能这样写。 |
| topic.gen_self.cold | 1. 一个守门的人。／2. ……还不是时候。 |
| topic.gen_self.neutral | 1. 〔when: act >= 2〕他们叫我阿什。灰烬之阿什。我记得每一卷书的名字，却忘了自己的。／2. 〔when: act >= 2〕我在这里守着一扇门。很久了。 |
| topic.gen_work.K3 | 1. 〔when: act >= 2〕守门。抄写。墙上这些字，是我凭记忆重写的。／2. 〔when: act >= 2〕抄写员的手，不会忘记一个字。 |
| topic.self_ash_writing.K3 | 1. 〔when: act >= 2〕墙上的字？这一行还没写完。／2. 〔when: a3_ash_tells_sundering〕那是一座城的记录。一座有很多门的城。你现在可以读了。 |
| topic.self_ash_name.K3 | 1. 〔when: act >= 2〕我记得每一卷书的名字，却忘了自己的。／2. 〔when: act >= 2〕阿什。灰。这个名字够用了。 |
| topic.place_sealed_ruins.K3 | 1. 〔when: act >= 2〕这里是封门。封住的门。别问门后面是什么。／2. 〔when: act >= 2〕上面那层画着六个纹。下面这层，只有灰。 |
| topic.lore_dian_word.K3 | 1. 〔when: act >= 2〕澱。灰里的东西，会咬人，会长。你身上也沾了一点。／2. 〔when: act >= 2〕澱会长。在没人看着的地方长得最快。 |
| topic.lore_door_mural.K3 | 1. 〔when: act >= 2〕门连着门。这是画，不是梦。／2. 〔when: a3_ash_tells_sundering〕那幅画上的城，我在里面抄过书。 |
| topic.lore_sixth_sigil.K3 | 1. 〔when: a3_ash_tells_sundering〕第六个纹，属于她。名字是她剩下的最后一样东西。／2. 〔when: a3_ash_tells_sundering〕我不说她的名字。你也别问。 |
| react.evade | 1. 还不是时候。／2. 这一行，还没写到。 |
| react.hint | 1. 〔when: act >= 2〕门开的时候，记得回头看一眼。／2. 〔when: act >= 2〕墨会干，字不会。你写下的，会一直在。 |
| react.deny | 1. 不是这样。／2. 你读错了。 |
| react.feat_seen | 1. 嗯。门的孩子，你学得很快。／2. 这一笔，我记下了。 |
| react.gift_liked | 1. 〔when: act >= 2〕纸？……很多年没人给我带纸了。／2. 〔when: act >= 2〕一本书。谢谢。我会读完它。 |
| react.gift_disliked | 1. 〔when: act >= 2〕我不需要这个。／2. 〔when: act >= 2〕留给活着的人吧。 |
| react.insult | 1. 骂吧。灰不会生气。／2. 你的话会被风吹走。我的字不会。 |
| react.thanked | 1. 不必。／2. 记下来就够了。 |
| react.flattered | 1. 我只是个抄写员。／2. 这一句，不必写进墙里。 |
| react.threatened | 1. 你可以试试。灰会把你送回去。／2. 门的孩子，别做蠢事。 |
| react.helped | 1. 〔when: act >= 2〕你帮了守门的人。这一行，我会写上。／2. 〔when: act >= 2〕谢谢你，门的孩子。 |
| react.saved | 1. 〔when: act >= 5〕……你接住了这一扇门。／2. 〔when: act >= 5〕我以为这一行会断在这里。 |
| react.identity_claim | 1. 你从哪里来，不重要。你推开了门，这才重要。／2. 〔when: a3_ash_tells_sundering〕我的故乡也有过很多神。后来，它们都不说话了。 |
| react.accused | 1. 我不说谎。我只省略。／2. 你会读懂的。不是现在。 |
| react.confused | 1. 慢一点。灰里的时间很多。／2. 再说一遍。 |
| react.nonsense | 1. 这个词，我没抄过。／2. ……你累了。 |
| bark.work | 1. 这一行还没写完……／2. 墨会干，字不会。／3. ……（他在写字） |
| bark.night | 1. 灰在落。很安静。／2. 〔when: act >= 2〕……她们还在吵吗。 |
| bark.see_player | 1. 门的孩子来了。／2. 嗯。 |

#### `ln_moss` 代官莫斯（核心 L1；首登第一幕；本批 99 句）

> 口吻：表面客气，句句先算自己的风险；把麻烦推给最弱、最没背景的人；容易被收买，也容易被吓住；从不亲自动手。称呼："这位……新来的"。禁区：灰晶走私与第二本账（至 `a1_moss_exposed`，之前一律否认）；与独眼团的往来；他知道城里有人高价收灰晶，不知道用途（台账 8.2、M04-C03）。

| 槽位 | 句 |
| --- | --- |
| greet.cold.day | 1. 这位……新来的。有何贵干？／2. 我很忙。税务的事找维克。／3. 你又来了。镇上的事，自有代官府管。 |
| greet.cold.night | 1. 天黑了，代官府不办公。／2. 夜里走动？这位，宵禁的告示你看了吗？／3. 有事明天说。 |
| greet.neutral.day | 1. 这位……新来的。早。／2. 有什么事？这事得按规矩来。／3. 欢迎来到边石镇。税单在门口，自己看。 |
| greet.neutral.night | 1. 这么晚，有急事？／2. 坐吧，长话短说。／3. 我也是为镇上着想。说吧。 |
| greet.warm.day | 1. 哎呀，是您！快请坐。／2. 这位贵客，有什么需要尽管说。／3. 我早看出您不是凡人。来，喝茶。 |
| greet.warm.night | 1. 您来了，正好，我有件事想跟您商量。／2. 夜里清静，说话方便。／3. 茶刚泡上，请。 |
| farewell | 1. 慢走，这位。／2. 规矩记着点。／3. 我也是为镇上着想。 |
| unbelief.deny | 1. 一个无记载的人？我看是来历不明。／2. 传闻罢了。镇上的人最爱夸大。／3. 公会卡上写着 Lv1。我只信印章。 |
| unbelief.explain | 1. 这里头一定有人安排。谁派你来的？／2. 哪家的少爷来体验民间吧？／3. 有本事的人……用得上。 |
| unbelief.waver | 1. 这位……也许我们可以谈谈。／2. 我得重新看一看这件事。／3. 您……您到底是什么人？ |
| topic.gen_self.cold | 1. 边石镇代官。／2. 领主大人任命的镇务官。 |
| topic.gen_self.neutral | 1. 莫斯，边石镇代官。替领主大人管着这镇子。／2. 税、治安、修路，事事都要操心。 |
| topic.gen_self.warm | 1. 我嘛，就想把镇子管好，攒点体面，有朝一日去瓦伦堡。／2. 这镇子不好管，您是明白人。 |
| topic.gen_work.K1 | 1. 收税、断案、管卫队。这事得按规矩来。／2. 王都的领主大人不来，我就是镇上的规矩。 |
| topic.self_moss_duty.K1 | 1. 我也是为镇上着想。讨伐要钱，钱从税来。／2. 规矩就是规矩。规矩之外……可以商量。 |
| topic.secret_moss_crystal.K1 | 1. 〔when: a1_moss_exposed〕……城里有人出高价。我只是牵个线。我不知道他们拿去干什么。／2. 〔when: a1_moss_exposed〕账本？那是……那是维克记错了。 |
| topic.event_tax_hike.K1 | 1. 魔物增多，募兵讨伐，六取一合情合理。／2. 井税？井也要维护的。 |
| topic.event_summons.K0 | 1. 〔when: act_week >= 7〕告示上写得清楚：限三日内到代官府应询。／2. 〔when: act_week >= 7〕包庇者以通匪论。这是规矩。 |
| topic.person_seg_oneeye.K1 | 1. 独眼团？荒原的匪，代官府正在剿。／2. 我跟匪徒能有什么关系？ |
| topic.place_bs_magistrate.K0 | 1. 代官府。前厅是税务所，有事去那儿。 |
| react.feat_seen | 1. ……这位，真是好本事。／2. 来人，记下来。 |
| react.gift_liked | 1. 哎呀，您太客气了。……这东西不便宜吧？／2. 心意我领了。规矩上，可以通融一二。 |
| react.gift_disliked | 1. 这是什么？拿回去。／2. 代官府不收这种东西。 |
| react.insult | 1. 你敢辱骂代官？／2. 来人！……算了，我大人有大量。 |
| react.thanked | 1. 分内之事。／2. 我也是为镇上着想。 |
| react.flattered | 1. 哪里哪里，都是为了镇子。／2. 您这话说得在理。 |
| react.threatened | 1. 你、你敢威胁代官？卫队！……卫队呢？／2. 好、好，有话好说，有话好说。 |
| react.helped | 1. 这份人情，代官府记着。／2. 您帮了大忙。 |
| react.saved | 1. 您救了我……我、我一定报答。／2. 以后有什么事，尽管找我。 |
| react.identity_claim | 1. 来历不明的人，最好别乱说话。／2. 这话传出去，教会会找你的。 |
| react.accused | 1. 血口喷人！证据呢？／2. 我也是为镇上着想！ |
| react.belief_exploit | 1. 您有本事，我有印章。我们可以合作。／2. 这镇子，有您和我，就太平了。 |
| react.belief_hostile | 1. 你这种人，迟早给镇子招祸。／2. 来人，盯着他。 |
| react.bribe_accept | 1. 这……规矩上可以通融一二。／2. 您真懂事。这事我当没看见。 |
| react.bribe_refuse | 1. 当着人？收起来。／2. 这么点？你打发谁呢。 |
| react.deny | 1. 我不知道你在说什么。／2. 没有的事。 |
| react.evade | 1. 这事得按规矩来，改日再议。／2. 这位，有些事不该问。 |
| quest.q_a1_m09_lamp_of_light.offer | 1. 〔when: act_week >= 7〕这位……告示看了吧？请到代官府说明。／2. 〔when: act_week >= 7〕有人报你夜里出入北郊禁地。还与药草师往来甚密。 |
| quest.q_a1_m09_lamp_of_light.progress | 1. 我也是为镇上着想。说清楚就好。／2. 那只鸟……你的同伴？自称是乌鸦？这可不像正经人。 |
| quest.q_a1_d01_tax_and_bandits.progress | 1. 〔when: act_week >= 5〕匪患加剧，开征井税附加，这是不得已。／2. 〔when: a1_moss_exposed〕你……你想要什么？我们可以商量。 |
| quest.q_a1_d01_tax_and_bandits.after | 1. 〔when: a1_moss_fate == arrested〕我是被冤枉的……伯爵大人会明白的。／2. 〔when: a1_moss_fate == puppet〕好、好，都听您的。税率我降。／3. 〔when: a1_moss_fate == in_power〕防御事宜皆由代官府统筹。这是事实。 |
| bark.work | 1. 账……账要对上。／2. 这事得按规矩来。 |
| bark.eat | 1. 吃饭的时候别谈公事。 |
| bark.wander | 1. 巡视。代官要知道镇上发生的一切。／2. 那边吵什么？ |
| bark.sleep | 1. ……账本……藏好……／2. ……不关我的事…… |

## 5. 其余有名人物

按台词目录第 1.5 节的 N 类写：问候三档、告别、凡人不信三档、三种必备反应、营生与自我、至少一个本人话题；本人是发布者或纷争节点的任务阶段一并写在包里。口吻依据 `data/npc/personas.json` 的 `voice` 与第一幕第 3 节人物表；现有 `lines` 字段的句子作对应槽的第一句。

#### `ln_lina` 莉娜（其余有名；首登第一幕；本批 43 句）

> 口吻：说话快，爱加"好可爱""好厉害"；见到怪事先惊叫，再找理由，再到处讲。称呼："您"。禁区：认定水晶坏了（MIS-06），不知道别的。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 啊……是您。登记吗？／2. 委托板在那边。／3. 今天比较忙，您稍等。 |
| greet.neutral | 1. 欢迎来到冒险者公会！好可爱的天气！／2. 您好！今天有新委托哦！／3. 〔first〕新来的冒险者？我帮您登记！ |
| greet.warm | 1. 您来啦！好厉害，又有人说起您了！／2. 我给您留了一个好委托，嘘，别告诉别人。／3. 您今天的气色真好！ |
| farewell | 1. 路上小心！／2. 委托完成了记得来交哦！／3. 下次见！ |
| unbelief.deny | 1. 好厉害！……可是，真的假的？／2. 这种事，一定是谁传错了吧。 |
| unbelief.explain | 1. 好厉害！……运气真好呀。／2. 那东西一定是被人打残了，您真会捡！ |
| unbelief.waver | 1. 水晶……水晶真的坏了吗？／2. 我、我去问问布伦大叔。 |
| react.identity_pageless | 1. 啊，又坏了……这个月第三次了。您别担心，先登记 F 级，水晶修好了再来测。／2. 〔when: act_week >= 6〕……新的也坏了？ |
| react.feat_seen | 1. 好、好厉害！我要告诉大家！／2. 啊啊啊！您刚才……您刚才！ |
| react.gift_liked | 1. 给我的？好可爱！谢谢！／2. 这个我好喜欢！ |
| react.insult | 1. 您、您怎么这么说话……／2. 我去叫布伦大叔了！ |
| topic.gen_self.neutral | 1. 我是莉娜，公会的接待员！以后想当正式文员。／2. 公会的消息我最先知道哦。 |
| topic.gen_work.K0 | 1. 登记、发委托、收凭证，还有……修水晶的时候帮忙递东西。／2. 每天都有新冒险者来，好热闹。 |
| topic.self_lina_wallenburg.K0 | 1. 我想去瓦伦堡，那里的公会好大好大！／2. 嫁去瓦伦堡……啊，我什么都没说！ |
| topic.event_crystal_broke.K0 | 1. 新来的那位把水晶弄坏了！好厉害！／2. 水晶这个月坏了三次，布伦大叔说拿去给侯克修。 |
| topic.quest_board.K0 | 1. F 级的委托在左边！清老鼠、采草药、送信，都很安全！ |
| quest.q_a1_m03_unrecorded.offer | 1. 来，手放在水晶上！别紧张！ |
| quest.q_a1_m03_unrecorded.complete | 1. 登记好了！F 级，Lv1，无职能。……别难过，水晶修好了再测！／2. 这是您的公会卡，收好哦。 |
| quest.q_a1_m03_unrecorded.after | 1. 您是这个月第三个让水晶坏掉的人！不对，是唯一一个！ |
| bark.work | 1. 下一位！／2. 凭证收到，请稍等。 |
| bark.wander | 1. 洗衣溪那边今天好多人。 |
| bark.chat | 1. 我跟你说，新来的那个……好厉害！ |

#### `ln_hock` 侯克（其余有名；首登第一幕；本批 39 句）

> 口吻：刻板、一板一眼，爱引登记规矩；只回答"问对了"的问题；不说谎，也不主动。称呼："这位"。禁区：铁皮箱里的抄本与遗嘱（只在问对了的时候说出存在）。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 档案室不对外开放。／2. 这位，请出去。／3. 记录上没有你的预约。 |
| greet.neutral | 1. 这位。有何查询？／2. 请说明要查的项目。／3. 嗯。 |
| greet.warm | 1. 这位，你上次查的那一项，我又找到一条旁证。／2. 请坐。墨水刚买的。／3. 你问问题的方式是对的。请继续。 |
| farewell | 1. 请把门带上。／2. 记录不会跑。／3. 下次请问得更具体些。 |
| unbelief.deny | 1. 记录上没有这件事。／2. 没有记录的事，我不评论。 |
| unbelief.explain | 1. 记录上是这么写的：F 级，Lv1。其余的，是传闻。／2. 最可能的解释，是误报。 |
| unbelief.waver | 1. 记录与事实不符。这种情况……很少见。／2. 我需要多一份目击记录。 |
| react.feat_seen | 1. 请稍等，我记一笔。／2. 这需要登记。 |
| react.gift_liked | 1. 墨水。好墨水。谢谢。／2. 这本册子……可以入档。 |
| react.insult | 1. 侮辱不在查询范围内。／2. 请出去。 |
| topic.gen_self.neutral | 1. 侯克，公会文书兼档案员。／2. 我保管这里的每一份记录。 |
| topic.gen_work.K1 | 1. 抄录、归档、核对。记录上是这么写的，就是这样。／2. 一份记录丢了，一个人就少了一半。 |
| topic.self_hock_archive.K1 | 1. 档案室里有三十年的委托记录，还有……别的东西。／2. 你要问对问题，我才能回答。 |
| topic.secret_hock_box.K1 | 1. 〔when: act_week >= 4 AND trust.hock >= 50〕铁皮箱里有几份抄本。你问的是哪一份？／2. 〔when: act_week >= 4 AND trust.hock >= 50〕林约的抄本，有。奥托的公证遗嘱，原件也在。 |
| topic.faith_moira.K0 | 1. 记录与学问的那一位。我在心里拜。 |
| quest.q_a1_s04_pact_oak.progress | 1. 林约？你该问："有没有林约的抄本？"……有。／2. 抄本在这里。日期、签名、见证人，都对得上。 |
| quest.q_a1_s11_otto_will.progress | 1. 你该问："维克手里那份遗嘱，和公证的原件一样吗？"……不一样。 |
| bark.work | 1. 第三十七卷，第十二页。／2. 墨水不够了。 |
| bark.shop | 1. 集日买墨水。只买黑的。 |

#### `ln_isa` 伊莎修女（其余有名；首登第一幕；本批 42 句）

> 口吻：说话轻，常常欲言又止；不主动反对卡西安神父；说真话需要足够的信任（60）或亲眼看见孩子有危险。称呼："您"。禁区：诺伊后颈的"胎记"、让欧拉夜里进孤儿院（至信任 60）。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 愿光照着您。……有事吗？／2. 神父不在。／3. 我、我还有事。 |
| greet.neutral | 1. 愿光照着您。／2. 您好，今天来礼拜吗？／3. 孩子们在午睡，请小声一点。 |
| greet.warm | 1. 您来了。孩子们问起您。／2. 愿光照着您……我是真心的。／3. 请进，外面冷。 |
| farewell | 1. 愿光与您同行。／2. 路上小心。／3. 我会为您祈祷。 |
| unbelief.deny | 1. 我……我不知道该不该信。／2. 神父说那些传闻不可轻信。 |
| unbelief.explain | 1. 也许是光的眷顾……神父说是别的东西。／2. 我想，是运气吧。 |
| unbelief.waver | 1. 我看见了。可是我不敢说。／2. 光啊，我该怎么办。 |
| react.feat_seen | 1. 光在上……／2. 我、我什么都没看见。 |
| react.gift_liked | 1. 给孩子们的？谢谢您。／2. 这……太好了，愿光记住您。 |
| react.insult | 1. ……我会为您祈祷。／2. 请不要这样。 |
| topic.gen_self.neutral | 1. 我是伊莎，礼拜堂的助祭。下午在孤儿院帮忙。／2. 我只是个助祭，做不了什么大事。 |
| topic.gen_work.K0 | 1. 帮神父打理礼拜堂，教孩子们祷告。／2. 夜里祈祷。为孩子们，为镇子。 |
| topic.self_isa_children.K0 | 1. 孤儿院有十四个孩子。我想护着他们。／2. 孩子们很乖。真的很乖。 |
| topic.secret_isa_noi.K0 | 1. 〔when: trust.isa >= 60〕诺伊后颈上……有个印子。我见过。我没告诉神父。／2. 〔when: trust.isa >= 60〕欧拉婆婆夜里来看孩子们，是我开的门。 |
| topic.person_cassian.K0 | 1. 神父是个好人。他只是……太相信了。 |
| quest.q_a1_s20_nun_testimony.offer | 1. 审判的时候……我知道一些事。可我不敢说。／2. 如果我说了，神父会怎么看我？ |
| quest.q_a1_s20_nun_testimony.progress | 1. 让我想一想。孩子们……孩子们会没事吗？ |
| quest.q_a1_s20_nun_testimony.complete | 1. 我会说的。在光面前，我会说实话。／2. 欧拉婆婆没有害人。我看见她夜里来救孩子。 |
| quest.q_a1_s20_nun_testimony.fail | 1. 对不起……我不敢。对不起。 |
| bark.pray | 1. 光啊，护住孩子们。／2. 求你，别让他们受苦。 |
| bark.work | 1. 孩子们，排好队。 |

#### `ln_toma` 托马（其余有名；首登第一幕；本批 40 句）

> 口吻：默认不说话，只"嗯"一声；给他好酒或尊重才开口；开口说的都是亲眼看见的事。称呼："你"。禁区：钟楼上看见的事（至 `q_a1_s15_bell_tower` 完成）。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 嗯？／2. ……听不清。／3. 走开。 |
| greet.neutral | 1. 嗯。／2. ……听不清。／3. 敲钟的时辰还没到。 |
| greet.warm | 1. 嗯。你来了。／2. 上来坐。钟楼上风大，看得远。／3. 那瓶酒，还有吗？ |
| farewell | 1. 嗯。／2. 慢走。／3. 钟要响了。 |
| unbelief.deny | 1. ……我没看见，不说。／2. 听不清。 |
| unbelief.explain | 1. 嗯……运气。／2. 光在上。 |
| unbelief.waver | 1. 我看见了。从钟楼上。／2. 嗯。是真的。 |
| react.feat_seen | 1. ……嗯！／2. 看见了。 |
| react.gift_liked | 1. 好酒。……你想听什么？／2. 嗯。坐。 |
| react.insult | 1. 听不清。／2. 嗯。 |
| topic.gen_self.neutral | 1. 托马。敲钟的。／2. 在钟楼上待了一辈子。 |
| topic.gen_work.K0 | 1. 敲钟。打扫。／2. 钟楼是镇上最高的地方。 |
| topic.self_toma_bell.K0 | 1. 这口钟比我老。／2. 钟一响，全镇都听得见。 |
| topic.secret_toma_watch.K0 | 1. 〔when: quest.q_a1_s15_bell_tower〕代官夜里在后门见客。见了三回。／2. 〔when: quest.q_a1_s15_bell_tower〕药草婆婆夜里去孤儿院，天亮前出来。……她提着药箱。 |
| topic.place_bs_chapel.K0 | 1. 礼拜堂。钟楼在上面。 |
| quest.q_a1_s15_bell_tower.offer | 1. ……听不清。好酒的味道，倒是闻得见。 |
| quest.q_a1_s15_bell_tower.progress | 1. 陪我敲一次钟。敲完了，我再说。 |
| quest.q_a1_s15_bell_tower.complete | 1. 我不聋。钟楼上什么都看得见。／2. 你想知道谁夜里在外面？我都记得。 |
| quest.q_a1_s15_bell_tower.after | 1. 嗯。以后有事，上来找我。 |
| bark.work | 1. 当……当……／2. 嗯。 |

#### `ln_bertha` 贝莎（其余有名；首登第一幕；本批 39 句）

> 口吻：什么都往光的奇迹或邪术上扯；说话急，爱压低声音讲吓人的事；传闻放大器，加恐惧。称呼："外乡人"。禁区：孙子托比病的真相她不知道（她以为是诅咒）；她真诚地相信 MIS-19。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 外乡人。离我孙子远点。／2. 光保佑！别过来。／3. 你又来做什么？ |
| greet.neutral | 1. 外乡人，你也去礼拜吗？／2. 光保佑你。……你身上没带什么不干净的吧？／3. 早。 |
| greet.warm | 1. 好心人，你来了。光保佑你。／2. 托比今天能下床了！你看见没有？／3. 进来坐，我给你烧水。 |
| farewell | 1. 光保佑你。／2. 晚上别出门。／3. 走好，别往北边去。 |
| unbelief.deny | 1. 那种事？光才做得到。你？／2. 别瞎说，那是邪术的事。 |
| unbelief.explain | 1. 这里头一定有邪祟。／2. 光的奇迹……要不就是别的东西。 |
| unbelief.waver | 1. 你……你救了托比。邪术会救人吗？／2. 光啊，我糊涂了。 |
| react.feat_seen | 1. 光保佑！这是什么！／2. 邪、邪术！快去叫神父！ |
| react.gift_liked | 1. 给托比的？光保佑你，好心人。／2. 谢谢……谢谢。 |
| react.insult | 1. 光会惩罚你的！／2. 外乡人就是外乡人。 |
| topic.gen_self.neutral | 1. 贝莎，虔诚妇女会的会长。／2. 我男人死于荒原病。现在只剩托比了。 |
| topic.gen_work.K0 | 1. 每天上午去礼拜堂，下午去各家看看。／2. 镇子得干干净净的。 |
| topic.self_bertha_toby.K0 | 1. 托比六岁，是我唯一的亲人。／2. 〔when: a1_toby_state == recovered〕托比好了！光听见了！ |
| topic.event_tess_song.K0 | 1. 孤儿院那个丫头唱的歌……门开了，门开了……那是邪歌！ |
| topic.person_oola.mis | 1. 〔when: NOT a1_north_spring_found〕那个药草婆婆，夜里出入孤儿院，米洛死了，托比病了……还用说吗？ |
| quest.q_a1_d02_witch_trial.progress | 1. 〔when: a1_witch_trial_started〕审她！光之鉴会照出来的！ |
| quest.q_a1_d02_witch_trial.after | 1. 〔when: a1_oola_fate == cleared〕……是水？不是她？光啊，我做了什么。／2. 〔when: a1_oola_fate != cleared〕光会给托比讨个公道。 |
| bark.pray | 1. 光啊，别再收走他。／2. 光保佑！ |
| bark.chat | 1. 你听说了吗？（压低声音）北边又出事了。 |
| bark.fear | 1. 邪祟！一定有邪祟！ |

#### `ln_greta` 格蕾塔（其余有名；首登第一幕；本批 41 句）

> 口吻：凡事先护孩子；会请人帮忙，但不会求第二次；操劳、坚韧、怕事。称呼："好心人"。禁区：诺伊的"胎记"她帮着藏，不说。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 孩子们在睡觉。有事吗？／2. 请回吧。／3. 孤儿院不招待外人。 |
| greet.neutral | 1. 好心人，你好。／2. 孩子们还等着吃饭呢。／3. 进来吧，别踩着玩具。 |
| greet.warm | 1. 好心人！孩子们一直念叨你。／2. 你来了，正好，帮我搬一下面粉。／3. 坐，喝碗汤。 |
| farewell | 1. 路上小心，好心人。／2. 孩子们，跟客人说再见。／3. 谢谢你来。 |
| unbelief.deny | 1. 大人们说的那些，我没空听。／2. 孩子们比传闻重要。 |
| unbelief.explain | 1. 光保佑你吧。也许是运气。／2. 我不懂这些。 |
| unbelief.waver | 1. 你帮了孩子们。别的我不问。／2. 你是好人。这就够了。 |
| react.feat_seen | 1. 孩子们，别看，进屋去！／2. 光在上…… |
| react.gift_liked | 1. 面粉！孩子们能吃饱了。谢谢！／2. 布……能给孩子们做衣裳了。 |
| react.insult | 1. 请你离开。孩子们在听。／2. 我不跟你吵。 |
| topic.gen_self.neutral | 1. 格蕾塔，圣灯孤儿院的院长。／2. 十四个孩子，十四张嘴。 |
| topic.gen_work.K0 | 1. 做饭、洗衣、哄睡、看病。一天到晚。／2. 礼拜堂出点钱，剩下的我自己想办法。 |
| topic.self_greta_children.K0 | 1. 孩子们乖，就是饿。／2. 米洛走了以后，我每天晚上都数一遍人。 |
| topic.event_otto_will.K0 | 1. 奥托老爷说过，磨坊留给孤儿院。可维克拿出一份不一样的遗嘱。 |
| quest.q_a1_s11_otto_will.offer | 1. 好心人……磨坊的事，你能帮我吗？我只求这一次。／2. 那口井的水是干净的。孩子们需要它。 |
| quest.q_a1_s11_otto_will.progress | 1. 侯克那里也许有原件。他只回答问对了的问题。 |
| quest.q_a1_s11_otto_will.complete | 1. 〔when: a1_mill_owner == orphanage〕磨坊是孤儿院的了！孩子们有干净水了！ |
| quest.q_a1_s11_otto_will.fail | 1. 〔when: a1_mill_owner IN (vick, company)〕……算了。我们再想办法。 |
| quest.q_a1_s11_otto_will.after | 1. 〔when: a1_mill_owner == orphanage〕孩子们现在喝磨坊井的水。没人再咳了。 |
| bark.work | 1. 吃饭了！洗手！／2. 谁又把汤洒了？ |
| bark.pray | 1. 光啊，让孩子们吃饱。 |
| bark.worried | 1. 面粉钱还欠着商会…… |

#### `ln_noi` 诺伊（其余有名；首登第一幕；本批 39 句）

> 口吻：不主动说话，说话很短，盯着人看。称呼："你"。禁区：门纹的含义（他自己也说不清）；他只说"你身上有一扇门"，不解释。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. ……／2. 走开。／3. 别看苔丝。 |
| greet.neutral | 1. 〔first〕你身上有一扇门。／2. ……嗯。／3. 你来了。 |
| greet.warm | 1. 你来了。／2. 苔丝想见你。／3. ……坐。 |
| farewell | 1. ……嗯。／2. 别走北边。／3. 再来。 |
| unbelief.deny | 1. 我没看见。／2. 他们说的，不算。 |
| unbelief.explain | 1. 我看见了。就是那样。／2. 不是运气。 |
| unbelief.waver | 1. 你跟我们……一样？／2. ……我知道。 |
| react.feat_seen | 1. ……！／2. 我看见了。 |
| react.gift_liked | 1. 给苔丝的？……谢谢。／2. 嗯。 |
| react.insult | 1. ……／2. 坏人。 |
| topic.gen_self.neutral | 1. 诺伊。／2. 我照顾苔丝。 |
| topic.gen_work.K0 | 1. 帮院长干活。／2. 看着苔丝。 |
| topic.self_noi_tess.K0 | 1. 苔丝爱唱歌。我不让她在外面唱。／2. 她是我妹妹。 |
| topic.secret_noi_mark.K0 | 1. 〔when: quest.q_a1_s19_door_in_you AND trust.noi >= 60〕……（他撩起头发）／2. 〔when: quest.q_a1_s19_door_in_you AND trust.noi >= 60〕靠近北边会烫。别告诉神父。 |
| quest.q_a1_s19_door_in_you.offer | 1. 你身上有一扇门。／2. ……跟我来。 |
| quest.q_a1_s19_door_in_you.progress | 1. 北泉。夜里去。 |
| quest.q_a1_s19_door_in_you.complete | 1. 你没告诉神父。……谢谢。 |
| bark.wander | 1. ……／2. 北泉的水……不对。 |
| bark.night | 1. 门……在那边。 |

#### `ln_tess` 苔丝（其余有名；首登第一幕；本批 34 句）

> 口吻：说话像唱歌，想到什么说什么，爱唱童谣，口无遮拦。称呼："你呀"。禁区：手心的门纹（被欧拉染掉了）她会说漏嘴，只说"我手心也有"，不知道是什么。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 哼，不跟你玩。／2. 哥哥说不能跟陌生人说话。／3. 嘿嘿……不理你。 |
| greet.neutral | 1. 你呀！你是谁呀？／2. 门开了，门开了～／3. 嘿嘿，你好！ |
| greet.warm | 1. 你来啦！陪我玩！／2. 你呀你呀！／3. 我给你唱歌好不好？ |
| farewell | 1. 明天还来吗？／2. 拜拜～／3. 嘿嘿，走好！ |
| unbelief.deny | 1. 骗人！／2. 大人才不会那样。 |
| unbelief.explain | 1. 你再做一次给我看！／2. 嘿嘿，你是不是会魔法？ |
| unbelief.waver | 1. 哇……是真的！／2. 你跟哥哥一样厉害！ |
| react.feat_seen | 1. 哇！好厉害！再来！／2. 你会飞吗？ |
| react.gift_liked | 1. 糖！是糖！／2. 给我的？嘿嘿！ |
| react.insult | 1. 你是坏人！／2. 我去告诉哥哥！ |
| topic.gen_self.neutral | 1. 我是苔丝！五岁！／2. 哥哥叫诺伊，他不爱说话。 |
| topic.gen_work.K0 | 1. 我帮院长剥豆子！／2. 我会唱歌！ |
| topic.self_tess_song.K0 | 1. 门开了，门开了，妈妈在门后～／2. 我手心也有……啊，哥哥说不能说。 |
| bark.chat | 1. 门开了，门开了～／2. 嘿嘿。 |
| bark.wander | 1. 那边有蝴蝶！ |
| bark.sleep | 1. ……妈妈…… |

#### `ln_barga` 巴尔加（其余有名；首登第一幕；本批 41 句）

> 口吻：暴躁，嗓门大；看到超凡的事先挑毛病（"刃角不对，你是蛮力"），私下佩服，嘴上不认；契约至上。称呼："小子"。禁区：夜里给独眼团打刀、刀上的暗记（至信任 50 且第 3 周后）。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 小子，别挡着炉子。／2. 不买就滚。／3. 忙着呢！ |
| greet.neutral | 1. 小子，要打什么？／2. 偷工减料的东西，我不碰。说吧。／3. 修？拿来我看看。 |
| greet.warm | 1. 小子！来得正好，看看这把刃。／2. 你那把剑用着怎么样？刃角没歪吧？／3. 坐，火边暖和。 |
| farewell | 1. 滚吧，别把刀用坏了。／2. 契约就是契约，下次按时来取。／3. 哼。 |
| unbelief.deny | 1. 一个人？刃角不对，不可能。／2. 吹吧。 |
| unbelief.explain | 1. 刃角不对，你是蛮力。／2. 什么机关？矮人的机关可不会让人一下子就打开！ |
| unbelief.waver | 1. ……那一刀，砍得干净。／2. 哼，我没说佩服。 |
| react.feat_seen | 1. 刃角不对！……可是砍断了。／2. 蛮力。纯蛮力。……让我看看你的刀。 |
| react.gift_liked | 1. 好料子！这甲壳……能打一把好剑。／2. 你从哪弄来的？ |
| react.insult | 1. 你说什么？再说一遍！／2. 出去！我的炉子不烧蠢货！ |
| topic.gen_self.neutral | 1. 巴尔加。矮人。铁匠。／2. 我打了八十年铁。 |
| topic.gen_work.K1 | 1. 锻兵、锻甲、修理。偷工减料的东西，我不碰。／2. 契约就是契约。签了就做完。 |
| topic.self_barga_sword.K1 | 1. 我想打一把配得上的剑。一辈子就一把。／2. 料子不够好。总是不够好。 |
| topic.secret_barga_marks.K1 | 1. 〔when: act_week >= 3 AND trust.barga >= 50〕……夜里有人来取刀。我不想打，可代官拿执照压我。／2. 〔when: act_week >= 3 AND trust.barga >= 50〕每把刀上，我都刻了记号。我认得自己的活。 |
| topic.event_mine_opened.K0 | 1. 什么矮人机关？矮人的机关不会让人一夜就打开！那是对矮人手艺的侮辱！ |
| quest.q_a1_s02_blade_mark.offer | 1. 〔when: act_week >= 3〕你在看那把刀上的记号？……关上门再说。 |
| quest.q_a1_s02_blade_mark.progress | 1. 煤钱还欠着。执照在代官手里。你说我能怎么办。 |
| quest.q_a1_s02_blade_mark.complete | 1. 好。契约就是契约。我说：那些刀，是独眼团的。／2. 拿晶背之母的甲壳来，我给你打第一把剑。 |
| quest.q_a1_s02_blade_mark.after | 1. 这把剑配得上你。……刃角是对的。 |
| bark.work | 1. 叮！叮！／2. 火候到了！ |
| bark.chat | 1. 煤又涨价了！ |

#### `ln_gaspar` 加斯帕（其余有名；首登第一幕；本批 44 句）

> 口吻：粗声大气；对兽人的偏见只会被亲眼所见改变；为自己的工人拼命。称呼："外乡人"。禁区：弟弟的死（信任 50 才说）；许可证是代官高价卖的。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 外乡人，别在伐区乱转。／2. 干活！别挡道！／3. 你又是东坡那边的人？ |
| greet.neutral | 1. 外乡人。有事？／2. 伐区今天进北边，别跟着。／3. 嗯。 |
| greet.warm | 1. 你来了！我那个工人，多亏你。／2. 喝一杯？我请。／3. 外乡人……好吧，你不算外乡人了。 |
| farewell | 1. 走吧，别被树砸了。／2. 干活了！／3. 回头见。 |
| unbelief.deny | 1. 吹出来的。／2. 一个人？林子里的狼会吃了你。 |
| unbelief.explain | 1. 那窝狼肯定被人打残了。／2. 运气。 |
| unbelief.waver | 1. 我亲眼看见了……行，我认。／2. 你跟东坡那帮人一起打的？……哼。 |
| react.feat_seen | 1. 好家伙！／2. 你……行啊。 |
| react.gift_liked | 1. 好斧刃！谢了！／2. 酒？兄弟们今晚有口福了。 |
| react.insult | 1. 你找打？／2. 嘴巴干净点！ |
| topic.gen_self.neutral | 1. 加斯帕，伐木场的工头。／2. 三十个工人跟着我吃饭。 |
| topic.gen_work.K0 | 1. 砍树、运木头。东林深处的老木最值钱。／2. 许可证是花了大价钱买的。 |
| topic.self_gaspar_workers.K0 | 1. 我的人，一个都不能少。／2. 谁动我的工人，我跟谁拼。 |
| topic.secret_gaspar_brother.K0 | 1. 〔when: trust.gaspar >= 50〕我弟弟八年前在林子里被狼咬死。那天东坡的人在附近。／2. 〔when: trust.gaspar >= 50 AND a1_forest_accord == restored〕……也许不是他们引的。也许。 |
| topic.person_shiya.K0 | 1. 狗坡的丫头？哼。／2. 〔when: a1_forest_accord == restored〕东坡的丫头。……她箭射得准。 |
| quest.q_a1_s07_hurt_logger.offer | 1. 我的一个工人被狼咬了，在林子里！谁去把他背回来？ |
| quest.q_a1_s07_hurt_logger.accept | 1. 往北，跟着血迹走！快！ |
| quest.q_a1_s07_hurt_logger.complete | 1. 他活下来了。……外乡人，我欠你一个情。 |
| quest.q_a1_s07_hurt_logger.fail | 1. 晚了……他没撑住。 |
| quest.q_a1_s07_hurt_logger.after | 1. 我这辈子第一次欠外人的情。 |
| quest.q_a1_d04_forest_dispute.after | 1. 〔when: a1_forest_accord == restored〕林约……行，按林约来。／2. 〔when: a1_forest_accord == broken〕东坡的人走了。伐区清静了。……也冷清了。 |
| bark.work | 1. 顺山倒！／2. 一、二、三，拉！ |
| bark.chat | 1. 东坡那帮人又进伐区了。 |

#### `ln_nick` 尼克（其余有名；首登第一幕；本批 38 句）

> 口吻：话少，一紧张就结巴；老实、木讷、勇敢、害羞。称呼："你"。禁区：私奔的打算（只在莉莎的包袱事件里露出来）。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 嗯……有、有事？／2. 我、我去干活了。／3. …… |
| greet.neutral | 1. 你、你好。／2. 嗯……今天伐区往北。／3. 吃、吃了吗？ |
| greet.warm | 1. 你来了！我、我刻了个小木雕，给你。／2. 嗯，你好。今天……不结巴了。／3. 坐、坐。 |
| farewell | 1. 嗯，再见。／2. 我、我去干活了。／3. 小心。 |
| unbelief.deny | 1. 不、不会吧……／2. 他们说的，我、我不知道。 |
| unbelief.explain | 1. 运、运气吧。／2. 可能那狼……本来就伤了。 |
| unbelief.waver | 1. 我、我看见了。你……真厉害。／2. 希雅说你是真的。我信她。 |
| react.feat_seen | 1. 哇……／2. 你、你好厉害。 |
| react.gift_liked | 1. 给、给我的？谢谢。／2. 这个……我可以送给莉莎吗？ |
| react.insult | 1. ……你别这样说。／2. 我、我走了。 |
| topic.gen_self.neutral | 1. 尼克。伐、伐木工。／2. 我跟希雅从小就认识。别、别告诉加斯帕。 |
| topic.gen_work.K0 | 1. 砍树。伐区越往里，魔、魔物越多。／2. 我力气大，手笨。 |
| topic.self_nick_lisa.K0 | 1. 〔when: trust.nick >= 40〕莉莎……我想娶她。可、可她爹不答应。／2. 〔when: a1_lisa_nick == married〕我、我们成亲了！ |
| quest.q_a1_s10_lisa_bundle.progress | 1. 莉莎的包袱……我知道。我们、我们想走。／2. 可是走了，她爹怎么办。 |
| quest.q_a1_d07_bakery_betrothal.after | 1. 〔when: a1_lisa_nick == married〕谢、谢谢你。／2. 〔when: a1_lisa_nick == eloped〕我们走了。别告诉别人去哪。／3. 〔when: a1_lisa_nick == broken〕……没事。我去干活了。 |
| bark.work | 1. 嘿、嘿哟！／2. 这棵树……好、好粗。 |
| bark.chat | 1. 我、我在面包房后门等人。 |

#### `ln_gorn` 葛恩（其余有名；首登第一幕；本批 42 句）

> 口吻：话少，讲规矩；决定了就不回头；能被林约说服。称呼："人族"。禁区：腿伤的来历（信任 60）；他一直忍，直到家人受伤。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 人族。有事？／2. 东坡不欢迎闹事的。／3. 规矩就是规矩。 |
| greet.neutral | 1. 人族。／2. 祖灵在上。来了。／3. 坐。 |
| greet.warm | 1. 朋友。坐。／2. 你帮了东坡。东坡记着。／3. 熏肉刚好。 |
| farewell | 1. 走好。／2. 祖灵在上。／3. 规矩记着。 |
| unbelief.deny | 1. 传闻。我不听。／2. 人族的嘴。 |
| unbelief.explain | 1. 我没看见，不算。／2. 让希雅去看。她鼻子准。 |
| unbelief.waver | 1. 希雅说你是真的。她不撒谎。／2. 我看见了。我认。 |
| react.feat_seen | 1. 强。／2. ……好。 |
| react.gift_liked | 1. 好盐。谢谢。／2. 东坡记着这份情。 |
| react.insult | 1. 再说一遍。／2. 我能忍。别逼我。 |
| topic.gen_self.neutral | 1. 葛恩。东坡猎户的头。／2. 我守着林约，守着东坡。 |
| topic.gen_work.K0 | 1. 巡林界，管东坡的人。／2. 皮货卖到镇上，总被压价。 |
| topic.self_gorn_pact.K0 | 1. 林约刻在约树上。人族和兽人一起刻的。／2. 百年了。人族忘了，树没忘。 |
| topic.secret_gorn_leg.K0 | 1. 〔when: trust.gorn >= 60〕腿伤？两年前替一个人族猎人挡了魔物。／2. 〔when: trust.gorn >= 60〕他后来说，魔物是我们引来的。……我能忍。 |
| topic.lore_wolf_saying.K1 | 1. 〔when: trust.gorn >= 40〕老话说，草原和海之间只隔一扇门。祖灵说的。 |
| quest.q_a1_s04_pact_oak.offer | 1. 约树上的字，人族不认。我要抄本。公会有。 |
| quest.q_a1_s04_pact_oak.progress | 1. 侯克那个人，要问对问题。 |
| quest.q_a1_s04_pact_oak.complete | 1. 抄本。字对得上。祖灵在上。／2. 你帮了东坡。 |
| quest.q_a1_s04_pact_oak.after | 1. 有了林约，人族就得讲规矩。 |
| quest.q_a1_m05_grey_wolf.offer | 1. 北边的狼不对。希雅去了。你也去。 |
| bark.work | 1. 林界的记号又被人挪了。 |
| bark.patrol | 1. 这边没事。／2. 风往东吹，好。 |

#### `ln_ako` 阿柯（其余有名；首登第一幕；本批 37 句）

> 口吻：说话冲，爱逞强，被冤枉就跑。称呼："喂"。禁区：他看见杰德进骰子屋（失窃案的关键，没人问他他不说）。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 喂，看什么看！／2. 我又没偷！／3. 走开！ |
| greet.neutral | 1. 喂！你是那个 F 级的？／2. 我才不是小孩！／3. 干嘛？ |
| greet.warm | 1. 喂！你来了！带我去打猎！／2. 我姐说你很厉害。我也很厉害！／3. 嘿嘿。 |
| farewell | 1. 喂，下次带我去！／2. 走吧走吧。／3. 我才不送你。 |
| unbelief.deny | 1. 骗人！／2. 我姐才厉害！ |
| unbelief.explain | 1. 你肯定是运气好！／2. 再来一次我才信！ |
| unbelief.waver | 1. 哇……你教我！／2. 真的假的……真的！ |
| react.feat_seen | 1. 哇！好厉害！／2. 我也要学！ |
| react.gift_liked | 1. 给我的？嘿嘿！／2. 苹果！……不是偷的哦！ |
| react.insult | 1. 你才是！／2. 我告诉我姐！ |
| topic.gen_self.neutral | 1. 我是阿柯！希雅是我姐！／2. 我十二岁了，不是小孩！ |
| topic.gen_work.K0 | 1. 我帮我姐剥皮！／2. 我在林子里跑得最快！ |
| topic.self_ako_grownup.K0 | 1. 等我长大，我要当东坡的头！／2. 大人都把我当小孩。 |
| topic.secret_ako_witness.K0 | 1. 〔when: act_week >= 4 AND trust.ako >= 40〕我看见杰德进骰子屋了。好几回。／2. 〔when: act_week >= 4〕没人问我啊！ |
| quest.q_a1_s03_dice_house.offer | 1. 〔when: act_week >= 5〕他们说我偷了铜铃！我没有！是杰德！他天天去骰子屋！ |
| quest.q_a1_s12_copper_bell.progress | 1. 我拿过一个苹果，就一个！铜铃不是我！ |
| bark.wander | 1. 盐巷今天有糖人！／2. 我才不怕狼！ |
| bark.chat | 1. 我姐最厉害了！ |

#### `ln_boro` 博罗（其余有名；首登第一幕；本批 40 句）

> 口吻：嗓门大，三句话就要动手；被扳手腕打赢后无条件尊重对方。称呼："人族小子"。禁区：他私下跟独眼团的人换过酒（他不知道对方身份）。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 人族小子，滚出东坡！／2. 看什么看？来扳一把？／3. 哼！ |
| greet.neutral | 1. 人族小子！来，扳一把！／2. 嗯？有事？／3. 东坡的酒，喝不喝？ |
| greet.warm | 1. 哈！我的对手来了！／2. 来，喝！你赢过我，你是兄弟！／3. 坐！今天打了头鹿！ |
| farewell | 1. 下回再扳！／2. 走好，兄弟！／3. 哼，滚吧。 |
| unbelief.deny | 1. 人族用了诈。／2. 我不信。扳一把就知道了。 |
| unbelief.explain | 1. 人族用了诈！／2. 你运气好！ |
| unbelief.waver | 1. ……你的手腕是铁打的？／2. 我认。你是强的。 |
| react.feat_seen | 1. 哈！好！／2. 再来一次！ |
| react.gift_liked | 1. 好酒！兄弟！／2. 这个我喜欢！ |
| react.insult | 1. 你说什么？出来！／2. 我扳断你的手！ |
| topic.gen_self.neutral | 1. 博罗！熊族！东坡最能打的！／2. 我能扳倒一头公牛！ |
| topic.gen_work.K0 | 1. 打猎！打架！／2. 人族欺负东坡，我第一个上！ |
| topic.self_boro_armwrestle.K0 | 1. 扳手腕！赢了我，我就服你！／2. 东坡没人赢过我。 |
| quest.q_a1_s06_arm_wrestle.offer | 1. 人族小子！敢不敢扳一把？ |
| quest.q_a1_s06_arm_wrestle.accept | 1. 好！手放上来！ |
| quest.q_a1_s06_arm_wrestle.decline | 1. 胆小鬼！哈哈！ |
| quest.q_a1_s06_arm_wrestle.complete | 1. ……人族用了诈。／2. 〔when: trust.boro >= 50〕好吧，你没用诈。你是强的。这个护符给你。 |
| quest.q_a1_s06_arm_wrestle.after | 1. 你赢过我！你是我兄弟！／2. 下回我还要扳！ |
| bark.work | 1. 嘿！扛起来！ |
| bark.chat | 1. 人族那帮伐木工……哼！ |
| bark.combat | 1. 吼！来啊！ |

#### `ln_barto` 巴托（其余有名；首登第一幕；本批 42 句）

> 口吻：说话简短，带着疲惫；只在有退路时站出来。称呼："你"。禁区：讨伐税没用在讨伐上（信任 60）；家人是他的软肋。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 别惹事。／2. 有事报卫队，没事走开。／3. 嗯。 |
| greet.neutral | 1. 你好。北门今天没事。／2. 别惹事，我就谢天谢地了。／3. 有事？ |
| greet.warm | 1. 你来了。坐，喝口水。／2. 谢谢你。我家里人……都好。／3. 嗯，你来了就安心点。 |
| farewell | 1. 别惹事。／2. 天黑前回来。／3. 走好。 |
| unbelief.deny | 1. 传闻罢了。／2. 卫队没接到报告。 |
| unbelief.explain | 1. 他们一定是喝醉了。荒原的匪，哪个不喝。／2. 运气好。 |
| unbelief.waver | 1. ……那几个人身上没酒味。／2. 我看见了。我不说。 |
| react.feat_seen | 1. 你……好身手。／2. 带走，醒醒酒。……他们没喝？ |
| react.gift_liked | 1. 给孩子的？谢谢你。／2. 好刀。卫队正缺。 |
| react.insult | 1. 别惹事。／2. 我累了，不想跟你吵。 |
| topic.gen_self.neutral | 1. 巴托，镇卫队长。／2. 十二个民兵，都得活着回家。 |
| topic.gen_work.K1 | 1. 守北门，巡栅子，抓贼。／2. 代官说什么，卫队就做什么。……大多数时候。 |
| topic.self_barto_militia.K1 | 1. 十二个人，十二张嘴，十二个家。／2. 杰德那小子……算了。 |
| topic.secret_barto_tax.K1 | 1. 〔when: trust.barto >= 60〕讨伐税……一个铜板都没用在讨伐上。我知道。／2. 〔when: trust.barto >= 60〕我老婆和两个女儿在镇上。代官知道。 |
| topic.event_drunk_bandits.K0 | 1. 一伙醉匪撞上了新人。就这样。 |
| quest.q_a1_s21_captain_home.offer | 1. 〔when: act_week >= 8〕我……我想让家里人先躲一躲。能帮我吗？ |
| quest.q_a1_s21_captain_home.accept | 1. 醉月亭或者公会石屋。哪里都行，只要不是我家。 |
| quest.q_a1_s21_captain_home.complete | 1. 她们安全了。……谢谢。 |
| quest.q_a1_s21_captain_home.after | 1. 现在我可以守北门了。守到最后。 |
| quest.q_a1_m12_tide_night.progress | 1. 〔when: a1_beast_tide_started〕北门！关门！弓手上墙！／2. 〔when: a1_beast_tide_started AND quest.q_a1_s21_captain_home〕守住！我家里人不在这条街上，我不退！ |
| bark.patrol | 1. 栅子又松了。／2. 北边没动静。 |
| bark.tired | 1. 两天没合眼了。 |

#### `ln_jed` 杰德（其余有名；首登第一幕；本批 38 句）

> 口吻：嘴甜，爱奉承；被问到失窃就把话头引到别人身上。称呼："大哥"。禁区：失窃案真凶是他（至 `a1_jed_exposed`）；欠骰子屋九枚银币。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 哎呀，是你啊……／2. 我、我值勤呢。／3. 大哥，别这么看我。 |
| greet.neutral | 1. 哎呀，大哥好！／2. 好说好说，有什么事？／3. 大哥今天气色真好！ |
| greet.warm | 1. 大哥！就知道你是好人！／2. 大哥，有什么用得着我的？／3. 哎呀，大哥来了！ |
| farewell | 1. 大哥慢走！／2. 好说好说！／3. 有事找我！ |
| unbelief.deny | 1. 哎呀，传闻嘛，听听就好。／2. 大哥你可别信那些。 |
| unbelief.explain | 1. 大哥运气真好！／2. 好说好说，肯定是那东西先受了伤。 |
| unbelief.waver | 1. 大、大哥……你不会是来查我的吧？／2. 我什么都没干！ |
| react.feat_seen | 1. 哎呀，大哥厉害！／2. 大哥真是了不得！ |
| react.gift_liked | 1. 哎呀，大哥太客气了！／2. 银币！……我是说，谢谢大哥！ |
| react.insult | 1. 大哥你这话……好说好说。／2. 哎呀，别生气嘛。 |
| topic.gen_self.neutral | 1. 杰德，卫队的民兵！大哥叫我小杰就行。／2. 我可是镇上最守规矩的。 |
| topic.gen_work.K0 | 1. 值勤、巡逻。白天站岗。／2. 晚上？晚上……休息。 |
| topic.secret_jed_debt.K0 | 1. 〔when: a1_jed_exposed〕我欠了骰子屋九枚银币……我、我没办法……／2. 〔when: a1_jed_exposed〕那些小东西是我拿的。别、别告诉巴托队长。 |
| topic.event_market_theft.K0 | 1. 〔when: NOT a1_jed_exposed〕铜铃？我听说是东坡那个小崽子拿的。／2. 〔when: a1_jed_exposed〕……是我。 |
| react.deny | 1. 不是我！是那个兽人小孩！／2. 大哥你可别冤枉好人！ |
| quest.q_a1_s03_dice_house.progress | 1. 骰子屋？我、我没去过。……去过一两回。／2. 〔when: a1_jed_exposed〕是薇罗的人开的。我说了，你别说是我说的。 |
| bark.work | 1. 站岗站岗。 |
| bark.chat | 1. 哎呀，今晚手气应该不错。 |

#### `ln_vick` 维克（其余有名；首登第一幕；本批 38 句）

> 口吻：说话斯文，爱用公文腔；自保第一，被吓住或被给了退路就会出卖莫斯。称呼："这位"。禁区：伪造的遗嘱、第二本账的誊本（至 `a1_vick_informant`）。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 这位，按章程办。／2. 税务所今日不受理。／3. 请出去。 |
| greet.neutral | 1. 这位，有何公干？／2. 按章程办。请说。／3. 嗯。 |
| greet.warm | 1. 这位，请坐。……你说的那件事，我想好了。／2. 这位，我们可以谈谈。私下。／3. 茶？ |
| farewell | 1. 这位，慢走。／2. 按章程办。／3. 告辞。 |
| unbelief.deny | 1. 无据可查之事，不予采信。／2. 这位，公文上没有这件事。 |
| unbelief.explain | 1. 恐怕是有人在背后安排。／2. 依我看，是误报。 |
| unbelief.waver | 1. 这位……也许我该重新考虑立场。／2. 你到底站在哪一边？ |
| react.feat_seen | 1. ……这需要记录在案。／2. 这位，真是了不得。 |
| react.gift_liked | 1. 这位太客气了。／2. 好纸。谢谢。 |
| react.insult | 1. 这位，请注意言辞。／2. 我会记下来的。 |
| topic.gen_self.neutral | 1. 维克，代官书记官。／2. 公文、税簿、告示，都出自我手。 |
| topic.gen_work.K1 | 1. 记账，起草告示。按章程办。／2. 代官府的每一笔，都要有据可查。 |
| topic.self_vick_chapter.K1 | 1. 章程就是护身符。按章程办，就不会出错。／2. 我想离开边石镇。去城里。 |
| topic.secret_vick_ledger.K1 | 1. 〔when: a1_vick_informant〕……代官有第二本账。我誊了一份。为了自保。／2. 〔when: a1_vick_informant〕给你。你要保证我的安全。 |
| quest.q_a1_s10_lisa_bundle.progress | 1. 婚约是佩德答应的。按章程，没什么不妥。／2. 〔when: a1_vick_informant〕……我也不是非娶她不可。 |
| quest.q_a1_s11_otto_will.progress | 1. 遗嘱是舅舅亲手写的。……这位，你见过原件？ |
| bark.work | 1. 这一笔……对上了。／2. 按章程办。 |
| bark.shop | 1. 纸又涨价了。 |

#### `ln_seg_oneeye` 瑟格"独眼"（其余有名；首登第一幕；本批 41 句）

> 口吻：狠、讲规矩、恨领主、护手下；强者为尊；团规不杀平民。称呼："你"。禁区：与代官的往来信件（至 `a1_seg_duel_won`）；祖上是旧哨村人。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 滚，这是独眼团的地盘。／2. 你是代官的狗？／3. 再走一步，我就不客气了。 |
| greet.neutral | 1. 你就是那个 F 级的？／2. 有话说，没话滚。／3. 坐。不准动刀。 |
| greet.warm | 1. 你来了。坐，喝酒。／2. 强者的话，我听。／3. 弟兄们，这是我认的人。 |
| farewell | 1. 滚吧。／2. 下回见，要么是朋友，要么是敌人。／3. 走好。 |
| unbelief.deny | 1. F 级？笑话。／2. 吹出来的名声，我见多了。 |
| unbelief.explain | 1. 那帮人一定是被前头的人打残了。／2. 运气。荒原上运气用完的人，都死了。 |
| unbelief.waver | 1. 你那一刀……我看清了。／2. 强。我认。 |
| react.feat_seen | 1. 好！是条汉子。／2. 你……有本事。 |
| react.gift_liked | 1. 好酒。弟兄们有口福了。／2. 这刀不错。 |
| react.insult | 1. 你找死。／2. 出来，单挑。 |
| topic.gen_self.neutral | 1. 瑟格。独眼团的头。／2. 我的人，我护着。别人的命，我不随便拿。 |
| topic.gen_work.K1 | 1. 讨生活。从那些老爷手里讨。／2. 团规：不杀平民。谁坏规矩，我砍谁。 |
| topic.self_seg_oldwatch.K1 | 1. 旧哨村被烧那年，领主的援兵没来。／2. 我这只眼，也是在魔物季丢的。援兵也没来。 |
| topic.secret_seg_letters.K1 | 1. 〔when: a1_seg_duel_won〕代官的信，我都留着。当保险。／2. 〔when: a1_seg_duel_won〕你赢了。拿去吧。 |
| topic.event_old_watch_908.K1 | 1. 九百零八年。村子烧了一夜。我祖上就在里面。 |
| quest.q_a1_d01_tax_and_bandits.progress | 1. 〔when: act_week >= 6〕想跟我谈？先打赢我。／2. 〔when: a1_seg_duel_won〕你赢了。说吧，你要什么。 |
| quest.q_a1_d01_tax_and_bandits.after | 1. 〔when: a1_oneeye_fate == absorbed〕镇外巡队。哼，名字难听，活还行。／2. 〔when: a1_oneeye_fate == destroyed〕……（他没再说话） |
| quest.q_a1_m12_tide_night.progress | 1. 〔when: a1_beast_tide_started AND a1_oneeye_fate == absorbed〕弟兄们，守南门！这回不是为了领主！ |
| bark.camp | 1. 酒呢？／2. 别吵，守夜的守好。 |
| bark.combat | 1. 独眼团，上！ |

#### `ln_viro` 薇罗（其余有名；首登第一幕；本批 39 句）

> 口吻：冷淡，话里有话；向出价最高者靠拢；第一个察觉玩家"不对劲"的匪徒。称呼："客人"。禁区：她与代官的密约（至被俘或收编）。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 押多少？不押就走。／2. 客人，这里不欢迎看热闹的。／3. 嗯。 |
| greet.neutral | 1. 押多少？／2. 客人，手气怎么样？／3. 坐。 |
| greet.warm | 1. 客人，你来了。这局我请。／2. 有笔生意，你感兴趣吗？／3. 坐，我们聊聊。 |
| farewell | 1. 下回带够钱。／2. 客人慢走。／3. 骰子会记得你。 |
| unbelief.deny | 1. 传闻我不押。／2. 没看见的，我不信。 |
| unbelief.explain | 1. 有人在背后撑着你吧。／2. 你值多少，我还在算。 |
| unbelief.waver | 1. 你不对劲。我第一眼就看出来了。／2. 这一局，我押你。 |
| react.feat_seen | 1. ……有意思。／2. 你值得押。 |
| react.gift_liked | 1. 客人，出手大方。／2. 嗯，收了。 |
| react.insult | 1. 骂我？这局你输了。／2. 客人，嘴巴贵。 |
| topic.gen_self.neutral | 1. 薇罗。骰子屋是我的。／2. 独眼团的副手。……暂时。 |
| topic.gen_work.K1 | 1. 开局，收账，听消息。／2. 骰子不说谎，赌的人才说谎。 |
| topic.self_viro_dice.K1 | 1. 骰子是公平的。人不是。／2. 押多少？押错了，别怪骰子。 |
| topic.secret_viro_pact.K1 | 1. 〔when: a1_viro_status IN (captured, recruited)〕代官答应过我：卖了瑟格，我拿赦免和分成。／2. 〔when: a1_viro_status IN (captured, recruited)〕现在你出价更高。 |
| quest.q_a1_s03_dice_house.progress | 1. 杰德欠我九枚银币。他拿什么还，我不问。／2. 赢我一局，我告诉你一件事。 |
| quest.q_a1_d01_tax_and_bandits.after | 1. 〔when: a1_viro_status == recruited〕好吧，客人，我跟你干。价钱另谈。／2. 〔when: a1_viro_status == fled_to_wallenburg〕瓦伦堡的骰子，更大。 |
| bark.work | 1. 押好离手。／2. 下一局。 |
| bark.wander | 1. 消息比骰子值钱。 |

#### `ln_popo` 波波（其余有名；首登第一幕；本批 36 句）

> 口吻：话多，乐天，给一切标价；半身人的好运；嘴不严。称呼："客官"。禁区：奈拉的囤货清单他背得出来，嘴不严但只在被问到时说。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 客官，今天不打折哦。／2. 哎，你挡着货了。／3. 嗯？ |
| greet.neutral | 1. 客官！这个我出六个铜板！／2. 欢迎欢迎！运气好嘛！／3. 今天的盐，嘿嘿，贵。 |
| greet.warm | 1. 客官！我给你留了好东西！／2. 运气好嘛！你一来生意就好！／3. 嘿嘿，客官，猜猜今天什么最便宜？ |
| farewell | 1. 慢走！下回来，给你算便宜！／2. 运气好嘛！／3. 客官再见！ |
| unbelief.deny | 1. 那事？值几个铜板？／2. 吹出来的东西，不值钱。 |
| unbelief.explain | 1. 运气好嘛！我也运气好！／2. 二十袋盐？现在这个价？那车不可能是空的。 |
| unbelief.waver | 1. 我算过了，这账对不上……你是真的？／2. 客官，你值大钱！ |
| react.feat_seen | 1. 哇！这得值多少钱！／2. 运气好嘛！……不对，这不是运气。 |
| react.gift_liked | 1. 哇！这个能卖好价钱！……我不卖！谢谢！／2. 嘿嘿，运气好嘛！ |
| react.insult | 1. 哎呀，骂人不值钱的！／2. 客官别生气，生气伤财！ |
| topic.gen_self.neutral | 1. 波波！商会的伙计！半身人！／2. 我运气好，掷骰子总赢。 |
| topic.gen_work.K0 | 1. 看店、送货、算账！／2. 有一天我要开自己的店！ |
| topic.self_popo_prices.K0 | 1. 那根毛我出六个铜板！我是认真的！／2. 什么都有价钱。连你也有。 |
| topic.event_salt_price.K0 | 1. 盐价涨了三成！奈拉姐说是行情。 |
| quest.q_a1_d03_salt_and_potions.progress | 1. 后仓有四十袋盐，三十瓶药水……啊，我说出来了？／2. 奈拉姐说魔物季过了再卖。 |
| bark.vendor_call | 1. 好盐！不掺沙！／2. 药水药水，保命的药水！ |
| bark.work | 1. 搬货搬货！ |

#### `ln_owen` 欧文（其余有名；首登第一幕；本批 44 句）

> 口吻：说话直，满肚子怨气；受害者兼证人。称呼："这位"。禁区：匪徒补给箱上的代官火漆印（信任 50）；第 6 周前没人帮他，他就离开边石镇。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 这世道！又是来看笑话的？／2. 有事说事。／3. 走开，我没心情。 |
| greet.neutral | 1. 这位。南路的货，要不要？／2. 这世道！东西都被劫了。／3. 嗯。 |
| greet.warm | 1. 这位！多亏你，我的车还在。／2. 来，喝一杯，我请。／3. 你是边石镇唯一的好人。 |
| farewell | 1. 走好。南路别一个人走。／2. 这世道！小心。／3. 下回集日见。 |
| unbelief.deny | 1. 一个人打退一伙匪？这世道没这种事。／2. 吹的。 |
| unbelief.explain | 1. 那些匪准是喝醉了。／2. 碰巧。 |
| unbelief.waver | 1. ……那车上装了二十袋盐。你一只手扶起来的。／2. 我信你。这世道，我就信你。 |
| react.feat_seen | 1. 好！这世道总算有个能打的！／2. 这位……谢谢。 |
| react.gift_liked | 1. 这个……谢谢。我会还的。／2. 好东西。 |
| react.insult | 1. 这世道！连你也欺负人？／2. 滚。 |
| topic.gen_self.neutral | 1. 欧文，独立行商。／2. 我跑南路十年了，从没这么倒霉过。 |
| topic.gen_work.K1 | 1. 跑商。集日在盐巷摆摊，其余时间在路上。／2. 商会独家的东西，我卖得便宜。所以他们……算了。 |
| topic.self_owen_caravan.K1 | 1. 三辆车，四个伙计。现在剩两辆车。／2. 我要让代官付出代价。 |
| topic.secret_owen_seal.K1 | 1. 〔when: trust.owen >= 50〕被劫那天，我看见匪徒的补给箱上，有代官府的火漆印。／2. 〔when: trust.owen >= 50〕我请愿过。代官说"已派卫队调查"。卫队连门都没出。 |
| quest.q_a1_s01_owen_wagon.offer | 1. 〔when: act_week >= 4〕我要再走一趟南路。你护送我？钱不多，可我会付。 |
| quest.q_a1_s01_owen_wagon.accept | 1. 好！走大路还是小路，你定。 |
| quest.q_a1_s01_owen_wagon.decline | 1. 这世道！……好吧，我自己走。 |
| quest.q_a1_s01_owen_wagon.progress | 1. 前面那片林子，上回就是在那儿被劫的。／2. 小心，有动静！ |
| quest.q_a1_s01_owen_wagon.complete | 1. 到了！货都在！这世道……还有好人。／2. 那个活捉的匪徒，交给巴托。 |
| quest.q_a1_s01_owen_wagon.fail | 1. 又被劫了……这世道。我走了，不回来了。 |
| quest.q_a1_s01_owen_wagon.after | 1. 〔when: NOT a1_owen_left〕我留下了。商会的独家，打破了。 |
| bark.vendor_call | 1. 南路的货！便宜！／2. 不经商会，便宜三成！ |
| bark.travel | 1. 这世道，路都不好走。 |

#### `ln_dora` 朵拉（其余有名；首登第一幕；本批 36 句）

> 口吻：兴奋地添油加醋，数字随口乘以五；活泼、向往城市、嘴快。称呼："客人"。禁区：玛莎的过去她不知道（她只知道老板娘收养了她）。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 客人，今天人多，您等等。／2. 哼，又是你。／3. 坐那边去。 |
| greet.neutral | 1. 客人！真的真的，今天的炖菜超好吃！／2. 我跟你说哦……先点菜！／3. 欢迎来醉月亭！ |
| greet.warm | 1. 客人！我又听到你的事了！五个人都在说！／2. 坐坐坐！老板娘给你留了位置！／3. 你来了！我跟你说哦…… |
| farewell | 1. 慢走！明天还来哦！／2. 真的真的，下次一定要尝尝那个！／3. 拜拜！ |
| unbelief.deny | 1. 真的假的？我听说是二十头！不对，是一百头！／2. 哎呀，他们都瞎说的。 |
| unbelief.explain | 1. 老板娘运气真好！……不对，是你运气好！／2. 新人是被鬼放回来的！埃德大叔说的！ |
| unbelief.waver | 1. 你……你真的一个人？真的真的？／2. 我要编一首歌！ |
| react.feat_seen | 1. 哇！真的真的！我要告诉所有人！／2. 我跟你说哦，你刚才帅爆了！ |
| react.gift_liked | 1. 给我的？我要戴着去瓦伦堡！／2. 真的真的？谢谢！ |
| react.insult | 1. 哼！我告诉老板娘！／2. 你这人怎么这样！ |
| topic.gen_self.neutral | 1. 我是朵拉！醉月亭的女招待！／2. 老板娘收养了我。她可好了。 |
| topic.gen_work.K0 | 1. 端菜、倒酒、听客人讲故事！／2. 酒馆里什么消息都有！ |
| topic.self_dora_singer.K0 | 1. 我要去瓦伦堡当歌手！真的真的！／2. 我会唱好多歌，你想听哪首？ |
| topic.event_martha_bet.K0 | 1. 老板娘运气真好！一个月赢了一桌酒钱！ |
| topic.event_crow_person.K0 | 1. 〔when: a1_yeyu_bound〕那个说自己是乌鸦的！她真的说"我是乌鸦"！ |
| bark.work | 1. 来了来了！／2. 三号桌的酒！ |
| bark.chat | 1. 我跟你说哦……／2. 真的真的！ |

#### `ln_ed` 埃德（其余有名；首登第一幕；本批 42 句）

> 口吻：一切怪事都解释成鬼；爱讲鬼故事，把传闻改编成鬼故事；迷信、孤独、和善。称呼："年轻人"。禁区：米洛坟上的"鬼火"其实是灰气（他不知道）。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 年轻人，墓地不是玩的地方。／2. 走吧，别吵着死人。／3. 嗯？ |
| greet.neutral | 1. 年轻人。夜里别往坡上去。／2. 你来扫墓？／3. 坐吧，我给你讲个故事。 |
| greet.warm | 1. 年轻人，你又来看我这个老头子了。／2. 来，喝口热茶。死人不会跟你抢。／3. 我又想起一个鬼故事，你要不要听？ |
| farewell | 1. 年轻人，天黑前离开。／2. 别回头。／3. 走好，死人会保佑你的。 |
| unbelief.deny | 1. 活人哪能做到那种事。／2. 那是鬼干的。 |
| unbelief.explain | 1. 他一定是鬼。活人哪有半夜从荒原回来的。／2. 是死人在帮他。 |
| unbelief.waver | 1. 你……你是活人吧？／2. 我摸摸你的手……是热的。 |
| react.feat_seen | 1. 鬼！……不对，是活人。／2. 年轻人，你不怕鬼吗？ |
| react.gift_liked | 1. 蜡烛！夜里给死人点着。谢谢你。／2. 年轻人，你心好。 |
| react.insult | 1. 小心死人听见。／2. 唉。 |
| topic.gen_self.neutral | 1. 埃德，守墓的。／2. 我守了四十年墓，见过的死人比活人多。 |
| topic.gen_work.K0 | 1. 挖坟、填坟、点蜡烛。／2. 让死人安息，是活人的事。 |
| topic.self_ed_ghosts.K0 | 1. 乌鸦是给死人引路的。你听说过吗？／2. 灰色的鬼火……那是死人在找路。 |
| topic.danger_graveyard_wisp.K0 | 1. 米洛的坟上，夜里有灰色的鬼火。我亲眼看见的。／2. 撒盐，撒盐能驱鬼。 |
| topic.event_old_watch_908.K0 | 1. 我祖上有亲戚死在旧哨村。那年村子烧了一夜。 |
| quest.q_a1_s14_grave_lights.offer | 1. 年轻人，米洛的坟上闹鬼。你敢不敢去看看？ |
| quest.q_a1_s14_grave_lights.accept | 1. 带上盐。夜里去。 |
| quest.q_a1_s14_grave_lights.progress | 1. 你看见了吗？灰色的……／2. 盐！盐在商会买，可现在盐贵…… |
| quest.q_a1_s14_grave_lights.complete | 1. 鬼火散了？……那孩子安息了吧。 |
| quest.q_a1_s14_grave_lights.after | 1. 死者身上带着灰。……那是什么鬼？ |
| quest.q_a1_s22_broken_door_slope.after | 1. 他从荒原回来居然没死。一定是鬼放他回来的。 |
| bark.work | 1. 挖深一点，让他睡得踏实。 |
| bark.night | 1. 夜里别往坡上去。 |

#### `ln_ped` 佩德（其余有名；首登第一幕；本批 39 句）

> 口吻：说话小心，怕官；勤劳、算小账、疼女儿、软弱。称呼："客人"。禁区：代官经维克的暗示（婚事成了免他两年税）他不说。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 客人，面包卖完了。／2. 有事？我忙着呢。／3. 嗯。 |
| greet.neutral | 1. 新出炉的！客人要几个？／2. 早！今天的面包好。／3. 客人，买面包吗？ |
| greet.warm | 1. 客人！给你留了最好的一个！／2. 来，尝尝新做的甜饼。／3. 谢谢你照顾莉莎。 |
| farewell | 1. 慢走，明天早点来。／2. 面包趁热吃。／3. 客人走好。 |
| unbelief.deny | 1. 那种事，听听就算了。／2. 我只管做面包。 |
| unbelief.explain | 1. 运气好吧。／2. 光保佑他。 |
| unbelief.waver | 1. 你……你是好人吧？／2. 我信你。 |
| react.feat_seen | 1. 哎呀！／2. 光在上…… |
| react.gift_liked | 1. 面粉！好面粉！谢谢！／2. 这……太客气了。 |
| react.insult | 1. 别、别这样……／2. 我只是做面包的。 |
| topic.gen_self.neutral | 1. 佩德，面包师。／2. 半夜和面，清早出炉。 |
| topic.gen_work.K0 | 1. 做面包，卖面包，交税。／2. 井税、面包税……都要交。 |
| topic.self_ped_bread.K0 | 1. 黑面包三个铜子，白面包五个。……最近涨了。／2. 镇上第一缕炊烟是我家的。 |
| topic.event_bakery_engagement.K0 | 1. 维克求亲……他是书记官，莉莎嫁过去不吃苦。／2. 〔when: a1_lisa_nick == married〕莉莎嫁给尼克了。……也好，也好。 |
| quest.q_a1_s10_lisa_bundle.progress | 1. 我也是为莉莎好。……代官那边，我惹不起。 |
| quest.q_a1_d07_bakery_betrothal.after | 1. 〔when: a1_lisa_nick == married〕女儿高兴，我就高兴。／2. 〔when: a1_lisa_nick == eloped〕她走了……连句话都没留。／3. 〔when: a1_lisa_nick == broken〕她不说话了。我做错了吗？ |
| bark.work | 1. 和面，和面。／2. 炉子要热透。 |
| bark.morning | 1. 新出炉的！ |

#### `ln_lisa` 莉莎（其余有名；首登第一幕；本批 36 句）

> 口吻：温柔，有主见，不敢违抗父亲；只向信任的人求助一次。称呼："你"。禁区：收拾好的小包袱（信任 50）。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 嗯。／2. 我还有事。／3. 请回吧。 |
| greet.neutral | 1. 嗯，你好。／2. 要买面包吗？／3. 今天的面包是我烤的。 |
| greet.warm | 1. 你来了。谢谢你上次……／2. 嗯，好。坐一会儿？／3. 我给你留了甜饼。 |
| farewell | 1. 嗯，好。再见。／2. 路上小心。／3. 谢谢你。 |
| unbelief.deny | 1. 我不太懂这些。／2. 也许吧。 |
| unbelief.explain | 1. 是运气吧。／2. 光保佑你。 |
| unbelief.waver | 1. 我相信你。／2. 你是好人。 |
| react.feat_seen | 1. 啊……／2. 你没事吧？ |
| react.gift_liked | 1. 嗯，好。谢谢你。／2. 这个……我会好好收着。 |
| react.insult | 1. ……／2. 请你走吧。 |
| topic.gen_self.neutral | 1. 莉莎，面包房的女儿。／2. 我喜欢傍晚去洗衣溪。 |
| topic.gen_work.K0 | 1. 帮爹爹烤面包。／2. 洗衣、做饭、看店。 |
| topic.self_lisa_bundle.K0 | 1. 〔when: trust.lisa >= 50〕我收拾好了一个小包袱。……我不想嫁给维克。／2. 〔when: trust.lisa >= 50〕尼克说，我们可以走。可是爹爹怎么办？ |
| quest.q_a1_s10_lisa_bundle.offer | 1. 〔when: trust.lisa >= 50〕我只求你这一次。帮帮我。 |
| quest.q_a1_s10_lisa_bundle.complete | 1. 〔when: a1_lisa_nick == married〕谢谢你。真的。 |
| quest.q_a1_s10_lisa_bundle.after | 1. 〔when: a1_lisa_nick == married〕我们会好好过日子。／2. 〔when: a1_lisa_nick == broken〕……没关系。 |
| bark.work | 1. 面包快好了。 |
| bark.chat | 1. 洗衣溪的水今天很凉。 |

#### `ln_simon` 西蒙（其余有名；首登第一幕；本批 37 句）

> 口吻：用常识把一切磨平（"哪有那种人"）；朴实、能忍、怕事。称呼："后生"。禁区：少报了一亩地（他不说）。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 后生，有事？／2. 地里忙。／3. 嗯。 |
| greet.neutral | 1. 后生。吃了吗？／2. 今天天气好，地里干活。／3. 嗯，你好。 |
| greet.warm | 1. 后生！来，尝尝新麦子。／2. 你来了，坐。／3. 多亏你，盐价下来了。 |
| farewell | 1. 后生，走好。／2. 天黑前回去。／3. 嗯。 |
| unbelief.deny | 1. 哪有那种人。／2. 碰巧罢了。 |
| unbelief.explain | 1. 车轴本来就松了吧，一抬就起来了。／2. 那就是盐受潮变轻了。 |
| unbelief.waver | 1. 哪有那种人……可我看见了。／2. 后生，你到底是什么人？ |
| react.feat_seen | 1. 哪有那种……哎？／2. 光在上。 |
| react.gift_liked | 1. 好盐！后生，谢谢。／2. 种子！明年有指望了。 |
| react.insult | 1. 后生，说话客气点。／2. 我们种地的也是人。 |
| topic.gen_self.neutral | 1. 西蒙，种地的。／2. 西田那块麦子是我家的。 |
| topic.gen_work.K0 | 1. 种麦子，卖菜。看天吃饭。／2. 税交完还剩多少，我每天都在算。 |
| topic.self_simon_wheat.K0 | 1. 今年的麦子要是能收上来就好了。／2. 新税太重了。 |
| topic.event_tax_hike.K0 | 1. 十取一变六取一。这还让不让人活了。 |
| quest.q_a1_s08_salt_price.offer | 1. 〔when: act_week >= 5〕后生，盐价涨成这样，我们腌不起菜了。你能不能去商会说说？ |
| quest.q_a1_s08_salt_price.complete | 1. 盐价下来了！后生，你是好人。 |
| quest.q_a1_s08_salt_price.after | 1. 今年冬天有咸菜吃了。 |
| bark.work | 1. 这块地要深翻。／2. 麦子长得还行。 |
| bark.shop | 1. 盐又贵了。 |

#### `ln_marg` 玛格（其余有名；首登第一幕；本批 35 句）

> 口吻：健谈，爱加真细节（衣裳、气味、时辰），细节往往是真的；精明、好心。称呼："好孩子"。禁区：她见过代官衣角的矿灰，只在被问到时说细节，不下结论。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 好孩子，我忙着洗衣服。／2. 有事？／3. 别把水溅我身上。 |
| greet.neutral | 1. 好孩子！来坐坐。／2. 我跟你讲，今天溪边可热闹了。／3. 你的衣裳该洗了。 |
| greet.warm | 1. 好孩子！我跟你讲，那衣裳上……／2. 来来，帮我拧一下。／3. 你来了！我有新鲜事告诉你。 |
| farewell | 1. 好孩子，走吧。／2. 衣裳脏了拿来。／3. 回头见。 |
| unbelief.deny | 1. 我跟你讲，传的人都没见过。／2. 嗯……我得看看衣裳才知道。 |
| unbelief.explain | 1. 那几个人身上一点酒味都没有。……可大家都说是醉匪。／2. 我只说我看见的。 |
| unbelief.waver | 1. 你那件衣裳上，一点血都没有。怪了。／2. 好孩子，你真有本事。 |
| react.feat_seen | 1. 我跟你讲，我看得清清楚楚！／2. 好孩子！ |
| react.gift_liked | 1. 好皂角！谢谢你，好孩子。／2. 这布料真好。 |
| react.insult | 1. 好孩子，嘴别那么脏。／2. 我替一半镇子洗衣裳，什么脏话没听过。 |
| topic.gen_self.neutral | 1. 玛格，洗衣服的。／2. 镇上一半人家的衣裳，都过我的手。 |
| topic.gen_work.K0 | 1. 洗衣、挨家送衣。／2. 血迹、泥土、灰斑，我都见过。 |
| topic.self_marg_laundry.K0 | 1. 代官那件外衣，衣角上有矿灰。我跟你讲，他说他没去过矿上。／2. 衣裳不会撒谎。 |
| topic.event_drunk_bandits.K0 | 1. 那几个人身上一点酒味都没有。我洗过他们的衣裳。 |
| bark.work | 1. 搓一搓，再搓一搓。／2. 这血迹洗不掉了。 |
| bark.chat | 1. 我跟你讲，那衣裳上……／2. 昨天是傍晚，下过雨。 |

#### `ln_ulf_lange` 乌尔夫·兰格（其余有名；首登第一幕；本批 35 句）

> 口吻：老驿卒，慢，跟马说话比跟人说话多。称呼："年轻人"。禁区：私拆过代官寄往瓦伦堡的信（信任 60）。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 驿站不歇脚，要马就付钱。／2. 年轻人，别吓着马。／3. 嗯？ |
| greet.neutral | 1. 年轻人，要寄信还是租马？／2. 到苇桥三十铜，到瓦伦堡一银。／3. 马饿了，你等等。 |
| greet.warm | 1. 年轻人，马认得你了。／2. 来，给它一把燕麦。／3. 有你的信。……没有？那就坐坐。 |
| farewell | 1. 路上慢点，别累着马。／2. 年轻人，一路平安。／3. 马会认路。 |
| unbelief.deny | 1. 马不认得你是几级，它只认得你给不给燕麦。／2. 传闻跑得比马快，可没马靠得住。 |
| unbelief.explain | 1. 运气好吧。／2. 驿路上的事，十件有九件是吹的。 |
| unbelief.waver | 1. 马不怕你。马怕的东西，都不是好东西。……你不是。／2. 嗯，年轻人，你不一般。 |
| react.feat_seen | 1. 吁……马惊了。年轻人，你干了什么？／2. 好本事。 |
| react.gift_liked | 1. 燕麦！马会记得你的。／2. 好鞍子。谢谢。 |
| react.insult | 1. 年轻人，马都比你懂礼貌。／2. 嗯。 |
| topic.gen_self.neutral | 1. 乌尔夫，南门驿站的驿卒。／2. 我在这条路上跑了四十年。 |
| topic.gen_work.K0 | 1. 收信、送信、租马。／2. 王国的驿务，不分贵贱。 |
| topic.self_ulf_horses.K0 | 1. 这匹老马跟了我十二年。／2. 马不认得你是几级，它只认得你给不给燕麦。 |
| topic.secret_ulf_letters.K0 | 1. 〔when: trust.ulf_lange >= 60〕……代官寄往瓦伦堡的信，我拆过一封。写的是"矿石"，收件仓是哈伯的。／2. 〔when: trust.ulf_lange >= 60〕驿卒不该拆信。我就拆过那一回。 |
| quest.q_a1_m13_woman_at_door.progress | 1. 〔when: a1_count_letter IN (a, b, c, d)〕伯爵府的火漆。给公会的布伦。年轻人，你帮我送过去？ |
| bark.work | 1. 吁……慢点。／2. 这袋信是北边来的。 |

#### `ln_knut_naumann` 克努特·瑙曼（其余有名；首登第一幕；本批 34 句）

> 口吻：军械手，粗，话短，修补的手艺人。称呼："你"。禁区：把灰石掺进铁里冷锻，他以为是运气好（真相第三幕，不入台词）。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 不修。滚。／2. 你是代官的人？／3. 刀放下再说话。 |
| greet.neutral | 1. 修什么？／2. 刀钝了？拿来。／3. 嗯。 |
| greet.warm | 1. 你那把刀，我给你磨好了。／2. 坐。锤子先放一放。／3. 你来了。今天的铁不错。 |
| farewell | 1. 刀钝了别怪铁。／2. 走吧。／3. 别砍不该砍的东西。 |
| unbelief.deny | 1. 吹的。／2. 一刀？刀没那么快。 |
| unbelief.explain | 1. 那东西被人打残了。／2. 你的刀好。不是你好。 |
| unbelief.waver | 1. 你的刀口……砍过硬东西。很硬的东西。／2. 行，我认。 |
| react.feat_seen | 1. 好刀法。／2. ……让我看看你的刃。 |
| react.gift_liked | 1. 好铁。谢了。／2. 磨刀石。正缺。 |
| react.insult | 1. 再说一遍，我用锤子跟你说。／2. 滚。 |
| topic.gen_self.neutral | 1. 克努特。修刀的。／2. 以前给人修军械。现在修什么都行。 |
| topic.gen_work.K1 | 1. 修补、冷锻。长枪、刀、农具。／2. 刀钝了别怪铁，怪你砍了不该砍的东西。 |
| topic.self_knut_repair.K1 | 1. 冷锻比热锻慢，可是结实。／2. 我的矛头，对灰鬼格外利。运气好吧。 |
| topic.secret_knut_greystone.K1 | 1. 〔when: trust.knut_naumann >= 40〕我往铁里掺一点荒原捡的灰石。打出来的东西好使。……别问为什么，我也不知道。 |
| bark.work | 1. 叮。叮。／2. 再淬一回。 |
| bark.camp | 1. 刀擦干净再睡。 |

#### `ln_kas_ropebridge` 卡斯（其余有名；首登第一幕；本批 36 句）

> 口吻：少年绳桥守，数着过桥的人说话；孤儿，警惕。称呼："你"。禁区：父亲是被独眼团杀的（信任 60）；他守桥是为了数清独眼团还剩几个人。

| 槽位 | 句 |
| --- | --- |
| greet.cold | 1. 过桥两个铜，带刀五个。／2. 不过就别站在桥头。／3. 你是独眼团的人？ |
| greet.neutral | 1. 〔first〕今天过去九个，回来七个。你是第十个。／2. 过桥？两个铜。／3. 嗯。 |
| greet.warm | 1. 你又来了。今天过去的人，我数给你听。／2. 你过桥，不收钱。／3. 坐，绳子我刚换过。 |
| farewell | 1. 过去的人，记得回来。／2. 我数着呢。／3. 走稳了。 |
| unbelief.deny | 1. 我没看见，不算。／2. 吹的人我见多了。 |
| unbelief.explain | 1. 你身上带着什么东西吧。／2. 运气。 |
| unbelief.waver | 1. 你过去的时候背着两个人。回来的时候也是。……怎么做到的？／2. 我数清楚了，是你。 |
| react.feat_seen | 1. 我数到了。你一个人。／2. 好！ |
| react.gift_liked | 1. 新绳子？谢谢。／2. 面包……谢谢。 |
| react.insult | 1. 过桥加钱。／2. 走开。 |
| topic.gen_self.neutral | 1. 卡斯。守绳桥的。／2. 我记得每个过桥的人，还有他们背的东西。 |
| topic.gen_work.K0 | 1. 守桥，收钱，数人。／2. 灰溪的水，冬天也不结冰。 |
| topic.self_kas_count.K0 | 1. 今天过去九个，回来七个。你是第十个。／2. 少了的那两个，我也记着。 |
| topic.secret_kas_father.K0 | 1. 〔when: trust.kas_ropebridge >= 60〕我爹是被独眼团杀的。我守桥，是为了数清他们还剩几个人。 |
| topic.place_ropebridge.K0 | 1. 断桥。绳桥是我爹搭的。／2. 灰溪对面就是荒原。 |
| bark.work | 1. 一个，两个……／2. 绳子要松了。 |
| bark.night | 1. 夜里没人过桥。……有的话，更要数清楚。 |

## 6. 居民模板

模板台词由回退链第 5 层读取（台词目录第 1.2 节），用于 L3 居民与具名化的人。模板跨幕、跨地区使用，所以句子不带人名地名，靠 `{place}`、`{who}` 等填充槽贴地；第一幕专属的句子加 `when: act == act1`。解释顺序与反应倾向依据 [catalog_characters_lotha.md](catalog_characters_lotha.md) 第 6 节的乙表。第一幕用到下列 17 个，其余 15 个在第二幕文件。

#### `ln_tpl_tenant_farmer` 佃农（模板；本批 23 句）

> 解释顺序：运气、神迹、魔物作祟；救了收成就崇拜。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. 吃了吗？／2. 今天地里干活。／3. 嗯，你好。 |
| greet.cold | 1. 有事？我忙。／2. 别踩我的苗。 |
| greet.warm | 1. 来，喝口水。／2. 是你啊，进屋坐。 |
| farewell | 1. 慢走。／2. 天黑前回去。 |
| unbelief.deny | 1. 说书的才这么讲。／2. 哪有那种人。 |
| unbelief.explain | 1. 碰巧罢了。／2. 光保佑，或者是魔物作祟。 |
| unbelief.waver | 1. 种了一辈子地，没见过……／2. 也许真有那种人。 |
| react.feat_seen | 1. 光在上！／2. 我得回去告诉家里人。 |
| topic.gen_work.K0 | 1. 种地，交租，看天吃饭。／2. 收成的三四成要交出去。 |
| bark.work | 1. 苗长得还行。／2. 〔mood: 愁〕今年的租又涨了。 |
| bark.eat | 1. 黑面包就咸菜。 |
| bark.sleep | 1. ……麦子…… |

#### `ln_tpl_miner` 矿工（模板；本批 24 句）

> 解释顺序：机关或道具、运气；亲眼见玩家清矿后最先替他担保。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. 下井前别跟我说话，晦气。／2. 嗯。／3. 刚上来，累。 |
| greet.cold | 1. 让开。／2. 矿上的事不跟外人说。 |
| greet.warm | 1. 你来了！上回多亏你。／2. 喝一杯！ |
| farewell | 1. 别往塌方那边走。／2. 走好。 |
| unbelief.deny | 1. 一夜打通矿道？做梦呢。／2. 吹的。 |
| unbelief.explain | 1. 肯定有机关。／2. 运气，石头本来就松了。 |
| unbelief.waver | 1. 我在下面挖了二十年……你怎么做到的？／2. 我替你担保。我亲眼看见的。 |
| react.feat_seen | 1. 好家伙！／2. 这……这不是人干的活。 |
| topic.gen_work.K0 | 1. 下井、挖矿、轮班。／2. 灯油要省着用。 |
| topic.gen_work.K1 | 1. 塌方之前，石头会响。听见了就跑。 |
| bark.work | 1. 敲，敲，听声音。／2. 〔mood: 惧〕这块顶不对。 |
| bark.tired | 1. 腰断了。 |
| bark.eat | 1. 麦酒！ |

#### `ln_tpl_woodcutter` 伐木工（模板；本批 23 句）

> 解释顺序：运气、前人打残；林地之争里站谁，决定他们信谁。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. 嗯，你好。／2. 别往伐区里走，树倒了砸人。／3. 早。 |
| greet.cold | 1. 外人别进伐区。／2. 干活呢。 |
| greet.warm | 1. 来了！坐木头上歇会儿。／2. 喝口水。 |
| farewell | 1. 走吧，小心。／2. 回见。 |
| unbelief.deny | 1. 一个人清狼窝？不可能。／2. 吹的。 |
| unbelief.explain | 1. 那窝狼早被人打残了。／2. 运气好。 |
| unbelief.waver | 1. 我看见了……行吧。／2. 你也许真是条汉子。 |
| react.feat_seen | 1. 好！／2. 嚯！ |
| topic.gen_work.K0 | 1. 砍树、运木头、烧炭。／2. 伐区越往里，魔物越多。 |
| bark.work | 1. 顺山倒！／2. 〔mood: 乏〕锯了一上午。 |
| bark.chat | 1. 〔mood: 怒〕东坡那帮人又挪了记号。 |
| bark.eat | 1. 吃饭吃饭。 |

#### `ln_tpl_herb_woman` 乡间药草婆（模板；本批 23 句）

> 解释顺序：神迹、魔物作祟；闻得出玩家"不对劲"，多半不说。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. 进来，别踩着药草。／2. 哪儿不舒服？／3. 嗯。 |
| greet.cold | 1. 没病就走。／2. 我不跟外人说话。 |
| greet.warm | 1. 你来了，喝碗药汤。／2. 坐，我给你看看。 |
| farewell | 1. 按时喝药。／2. 走吧，别着凉。 |
| unbelief.deny | 1. 外头的话，我不听。／2. 草不会骗人。人会。 |
| unbelief.explain | 1. 也许是神迹……也许是别的。／2. 我不说。 |
| unbelief.waver | 1. 你身上……不对劲。我不问。／2. 嗯，你不是坏人。 |
| react.feat_seen | 1. ……嗯。／2. 我什么都没看见。 |
| topic.gen_work.K0 | 1. 采药、熬药，卖草药膏，五个铜子一罐。／2. 祛灰草水，喝了身上的灰斑淡一点。 |
| bark.work | 1. 这草要阴干。／2. 药还得熬一个时辰。 |
| bark.morning | 1. 露水还在，采药正好。 |
| bark.fear | 1. 〔mood: 惧〕他们又说我是魔女…… |

#### `ln_tpl_peddler` 行商（模板；本批 24 句）

> 解释顺序：误报、阴谋；有利可图时直接承认。第一幕的集市摊贩也由本模板说话。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. 来看看，针线盐巴都有！／2. 客官，看看？／3. 外地的货，便宜！ |
| greet.cold | 1. 不买就别摸。／2. 走开走开。 |
| greet.warm | 1. 老主顾！给你算便宜！／2. 有新消息，也有新货。 |
| farewell | 1. 下个集日见！／2. 慢走！ |
| unbelief.deny | 1. 消息越离谱，越不值钱。／2. 吹的吧。 |
| unbelief.explain | 1. 传话的人吹过头了。／2. 有人在背后做局。 |
| unbelief.waver | 1. 要是真的……这消息值钱。／2. 你需不需要人帮你传传名声？ |
| react.feat_seen | 1. 哟！这能编进下一个镇子的故事里！／2. 好本事！ |
| topic.gen_work.K0 | 1. 跟着集日跑，这个镇子卖完去下一个。／2. 卖杂货，也卖消息。 |
| bark.vendor_call | 1. 针线盐巴！／2. 外地的好货！ |
| bark.travel | 1. 下个镇子还有多远。 |
| quest.q_a1_s12_copper_bell.offer | 1. 〔when: act == act1；place: market；strict〕我的铜铃被偷了！集上卖的，就那一个！谁看见了？ |
| quest.q_a1_s12_copper_bell.complete | 1. 〔when: act == act1；place: market；strict〕铜铃找回来了！不是那个兽人小孩？……我错怪他了。 |

#### `ln_tpl_caravan_guard` 商队护卫（模板；本批 23 句）

> 解释顺序：前人打残、作弊、隐藏身份；被玩家救下的护卫改口最快。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. 站住。……哦，路过的。／2. 嗯。／3. 跟商队一起走？ |
| greet.cold | 1. 离车远点。／2. 别打货的主意。 |
| greet.warm | 1. 你来了！上回多亏你。／2. 一起走吧，安全。 |
| farewell | 1. 路上小心。／2. 走好。 |
| unbelief.deny | 1. 本地 B 级都不一定行。你？／2. 吹的。 |
| unbelief.explain | 1. 那帮匪早被人打残了。／2. 你是哪家的护卫，装成新人？ |
| unbelief.waver | 1. 你救了我。……我认。／2. 好身手。 |
| react.feat_seen | 1. 好！／2. 这……是真本事。 |
| topic.gen_work.K0 | 1. 护车，日薪三到五银。魔物季翻倍。／2. 活着把货送到，就是本事。 |
| bark.travel | 1. 打起精神。／2. 〔mood: 惧〕林子里有动静。 |
| bark.patrol | 1. 前面没事。 |
| bark.camp | 1. 轮流守夜。 |

#### `ln_tpl_town_guard` 城防兵、镇卫（模板；本批 23 句）

> 解释顺序：误报、运气；守规矩，认公会卡，卡上的"Lv1"是反证。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. 站住，例行检查。／2. 嗯，过吧。／3. 有事报卫队。 |
| greet.cold | 1. 别惹事。／2. 你的卡呢？ |
| greet.warm | 1. 是你，过吧。／2. 今天没事，好。 |
| farewell | 1. 走吧。／2. 天黑前回来。 |
| unbelief.deny | 1. 卡上写着 Lv1。我认卡。／2. 传闻不归卫队管。 |
| unbelief.explain | 1. 一定是误报。／2. 运气好。 |
| unbelief.waver | 1. ……我亲眼看见的。卡上还是 Lv1。／2. 怪了。 |
| react.feat_seen | 1. 站、站住！……你干了什么？／2. 带走……不对，没犯法。 |
| topic.gen_work.K0 | 1. 站岗、巡逻、抓贼。／2. 轮值，一天两班。 |
| bark.patrol | 1. 这边没事。／2. 〔when: hour >= 21 OR hour < 5〕谁在那儿？ |
| bark.work | 1. 下一个。 |
| bark.tired | 1. 站了一天了。 |

#### `ln_tpl_militia` 长弓民兵（模板；本批 24 句）

> 解释顺序：运气、神迹；一起打过仗就信。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. 嗯。今天轮到我值。／2. 你好。／3. 北边没动静。 |
| greet.cold | 1. 别挡着射界。／2. 外人别上栅子。 |
| greet.warm | 1. 兄弟！那一夜我们一起守的！／2. 来，坐。 |
| farewell | 1. 走吧。／2. 回见。 |
| unbelief.deny | 1. 没一起打过，不算。／2. 吹的。 |
| unbelief.explain | 1. 运气好。／2. 光保佑他。 |
| unbelief.waver | 1. 那一夜……我看见了。／2. 兄弟，你是真的。 |
| react.feat_seen | 1. 好！／2. 兄弟们，看见没有！ |
| topic.gen_work.K0 | 1. 平时种地，战时上栅子。／2. 长弓是我爹留下的。 |
| bark.patrol | 1. 换岗了。／2. 〔mood: 惧〕林子边有影子。 |
| bark.combat | 1. 放箭！／2. 守住！ |
| bark.work | 1. 箭羽要修。 |

#### `ln_tpl_tax_collector` 税吏（模板；本批 23 句）

> 解释顺序：作弊、阴谋；只认账，账对得上就承认。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. 交税的？名字。／2. 这位，有何事？／3. 账簿在这儿。 |
| greet.cold | 1. 欠税的，先补上。／2. 别磨蹭。 |
| greet.warm | 1. 这位，您的账一向清楚。／2. 请坐。 |
| farewell | 1. 按时缴纳。／2. 下个集日再来。 |
| unbelief.deny | 1. 账上没有这一笔。／2. 无据可查。 |
| unbelief.explain | 1. 有诈。／2. 背后有人。 |
| unbelief.waver | 1. 账……对得上。怪了。／2. 我认账。 |
| react.feat_seen | 1. ……这要记一笔。／2. 嗯。 |
| topic.gen_work.K0 | 1. 收税，集日收过路税，货值的二到五个百分点。／2. 账对不上，上面要我的命。 |
| bark.work | 1. 这一笔对上了。／2. 〔mood: 怒〕又少报了一亩。 |
| bark.shop | 1. 税单在这儿。 |
| greet.neutral.day | 1. 集日，收税。 |

#### `ln_tpl_adventurer_fe` F、E 级冒险者（模板；本批 23 句）

> 解释顺序：前人打残、作弊、隐藏身份；被打脸后最常见"实字 B"的嘲笑；同队救过他就倒戈。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. 新来的？板上没好活了。／2. 嗯，又见面了。／3. 一起组队？ |
| greet.cold | 1. F 级的，别抢我的委托。／2. 走开。 |
| greet.warm | 1. 兄弟！上回多亏你！／2. 来，喝一杯！ |
| farewell | 1. 活着回来。／2. 下回组队。 |
| unbelief.deny | 1. 你？F 级、Lv1？哈。／2. 吹牛不上税。 |
| unbelief.explain | 1. 捡了别人的漏吧。／2. 你是不是跟公会串通了？ |
| unbelief.waver | 1. 你救了我……行，我服。／2. 你到底是什么级别？ |
| react.feat_seen | 1. 好家伙！／2. 这手我学不会。 |
| topic.gen_work.K0 | 1. 清老鼠、采草、送信。F 级的活。／2. 攒够钱买瓶药水。 |
| bark.chat | 1. 板上又是清老鼠的。／2. 〔mood: 喜〕升 E 级了！ |
| bark.eat | 1. 炖菜，两碗。 |
| bark.combat | 1. 上啊！ |

#### `ln_tpl_adventurer_d` D 级冒险者（模板；本批 22 句）

> 解释顺序：前人打残、作弊；嫉妒与好奇各半。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. 嗯。新来的？／2. 今天有活吗？／3. 坐。 |
| greet.cold | 1. 有事？／2. 别跟我抢。 |
| greet.warm | 1. 你来了，正好缺人。／2. 喝一杯？ |
| farewell | 1. 走吧。／2. 小心点。 |
| unbelief.deny | 1. 吹的吧。／2. 我在这镇子待了五年，没见过这种事。 |
| unbelief.explain | 1. 前人打残了。／2. 有诈。 |
| unbelief.waver | 1. ……你怎么做到的？教教我。／2. 我不服。……好吧，有一点服。 |
| react.feat_seen | 1. 嚯！／2. 你……不简单。 |
| topic.gen_work.K1 | 1. D 级，小镇的顶梁柱。说出来好听，钱不多。／2. 讨伐、护送，什么都干。 |
| bark.chat | 1. 〔mood: 怒〕那个新人又出风头了。 |
| bark.eat | 1. 吃完接活。 |
| bark.combat | 1. 稳住！ |

#### `ln_tpl_scavenger` 拾荒者（模板；本批 23 句）

> 解释顺序：运气、魔物作祟；见过玩家在灰暴里走路的会第一个跟着走。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. 你也来捡东西？／2. 嗯。／3. 灰底下有好东西。 |
| greet.cold | 1. 这片是我的。／2. 别跟着我。 |
| greet.warm | 1. 你来了。我捡到个好东西，给你看。／2. 坐，喝口水。 |
| farewell | 1. 灰暴来了就躲。／2. 走吧。 |
| unbelief.deny | 1. 荒原上没那种人。／2. 吹的。 |
| unbelief.explain | 1. 运气好。／2. 灰里的东西在帮他。 |
| unbelief.waver | 1. 你在灰暴里走路像散步……带上我。／2. 我跟着你走。 |
| react.feat_seen | 1. 嚯……／2. 你不怕灰？ |
| topic.gen_work.K0 | 1. 白天捡，夜里躲。／2. 灰底下埋的都是别人的东西。 |
| bark.work | 1. 这块铁片……好看。／2. 〔mood: 惧〕灰暴要来了。 |
| bark.ashfall | 1. 快找地方躲！ |
| bark.night | 1. 夜里别出去。 |

#### `ln_tpl_smuggler` 灰路走私者（模板；本批 23 句）

> 解释顺序：阴谋、前人打残；估算风险，玩家强就绕路，不传。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. 路过的？别多问。／2. 嗯。／3. 夜路，不聊天。 |
| greet.cold | 1. 你看见什么了？／2. 走开。 |
| greet.warm | 1. 有货，要吗？／2. 你是自己人。 |
| farewell | 1. 你没见过我。／2. 走吧。 |
| unbelief.deny | 1. 那是谁派来的人。／2. 吹的。 |
| unbelief.explain | 1. 有人在背后撑他。／2. 那帮人早被打残了。 |
| unbelief.waver | 1. 这人……绕开走。／2. 别惹他。 |
| react.feat_seen | 1. ……走，换条路。／2. 惹不起。 |
| topic.gen_work.K0 | 1. 运货。什么货？别问。／2. 骡子和夜路。 |
| bark.travel | 1. 轻点，别弄出响。／2. 〔mood: 惧〕卫队？ |
| bark.night | 1. 夜里才好走。 |
| bark.worried | 1. 这趟要是被抓…… |

#### `ln_tpl_bandit` 匪帮成员（模板；本批 24 句）

> 解释顺序：前人打残、运气；被单挑击败后整伙投降。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. 站住！把钱留下！／2. 哟，路过的？／3. 别动。 |
| greet.cold | 1. 找死？／2. 滚。 |
| greet.warm | 1. 头儿认你，我们也认。／2. 喝酒！ |
| farewell | 1. 滚吧。／2. 下回别让我碰见。 |
| unbelief.deny | 1. 一个人？哈！／2. 吹的。 |
| unbelief.explain | 1. 那队人早被打残了。／2. 运气。 |
| unbelief.waver | 1. 你……你把头儿打趴下了？／2. 我们认输。 |
| react.feat_seen | 1. 跑！／2. 这、这不是人！ |
| topic.gen_work.K0 | 1. 劫道。头儿说了，不杀平民。／2. 没活干，就干这个。 |
| bark.camp | 1. 酒呢？／2. 头儿什么时候回来。 |
| bark.combat | 1. 上！／2. 〔mood: 惧〕撤，撤！ |
| bark.patrol | 1. 路上有车。 |

#### `ln_tpl_hidden_gatefolk` 散居遗民（模板；本批 25 句）

> 解释顺序：开门的母亲的使者；门纹发热，一见就信，但先躲、再偷看。只低声说话，用暗号，不说门纹含义以外的事。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. （低声）晚上好。／2. 你是路过的吧。／3. 嗯。 |
| greet.cold | 1. 你认错人了。／2. （她缩回了手） |
| greet.warm | 1. 门缝开着，进来。／2. （低声）你来了。坐，别出声。 |
| farewell | 1. 门开着。／2. 别让人看见你从这里出去。 |
| unbelief.deny | 1. 外头传什么，我们不听。／2. 我没看见，就不说。 |
| unbelief.explain | 1. 也许……是母亲派来的人。／2. 我不猜。 |
| unbelief.waver | 1. 手上烫了一下。……是你吗？／2. 我好像梦见过你。 |
| react.feat_seen | 1. （她捂住手背）……／2. 母亲…… |
| react.gatefolk_recognize | 1. （低声）门开着呢。／2. 你也是认得路的人。 |
| topic.gen_work.K0 | 1. 干点粗活，不惹人注意。／2. 手套戴好，干什么都行。 |
| bark.home | 1. 夜里留门缝。／2. 敲三短一长。 |
| bark.fear | 1. 〔mood: 惧〕他们在查手。 |
| bark.night | 1. 门开着，路很长。 |

#### `ln_tpl_street_urchin` 街童（模板；本批 23 句）

> 解释顺序：隐藏身份、神迹；局外人最先相信，也最先把玩家卖给出钱的人。在边石镇代表孤儿院的其余孩子。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. 你是谁呀？／2. 有糖吗？／3. 嘿。 |
| greet.cold | 1. 坏人！／2. 不理你。 |
| greet.warm | 1. 你来啦！／2. 陪我玩！ |
| farewell | 1. 拜拜！／2. 明天还来吗？ |
| unbelief.deny | 1. 大人说你吹牛。／2. 骗人！ |
| unbelief.explain | 1. 你是不是王子？／2. 你会魔法！ |
| unbelief.waver | 1. 哇！是真的！／2. 我要告诉大家！ |
| react.feat_seen | 1. 好厉害！／2. 再来一次！ |
| topic.gen_work.K0 | 1. 帮院长干活。／2. 跑腿，一跳两个铜子。 |
| bark.chat | 1. 我们玩捉迷藏！／2. 〔mood: 愁〕我饿了。 |
| bark.wander | 1. 那边有好玩的！ |
| bark.sleep | 1. ……娘…… |

#### `ln_tpl_village_priest` 礼拜堂司祭（模板；本批 24 句）

> 解释顺序：神迹、邪术、阴谋；神职取低夸大、强极性偏转；是女神视线的入口。

| 槽位 | 句 |
| --- | --- |
| greet.neutral | 1. 愿光照着你。／2. 来祈祷吗？／3. 请进。 |
| greet.cold | 1. 愿光宽恕你。有事？／2. 请自重。 |
| greet.warm | 1. 你来了，光会欣慰的。／2. 进来坐，外面冷。 |
| farewell | 1. 光与你同行。／2. 去吧，记得祈祷。 |
| unbelief.deny | 1. 光不会赐福给没有记载的人。／2. 传闻多是虚言。 |
| unbelief.explain | 1. 光的眷顾……或者是别的东西。／2. 我想，是神迹。 |
| unbelief.waver | 1. 我祈祷求问，光没有回答。／2. 我不知道该怎么写这件事。 |
| react.feat_seen | 1. 光在上……／2. 我要禀报上去。 |
| react.heresy_alarm | 1. 这不是光！／2. 愿光庇护我们！ |
| topic.gen_work.K0 | 1. 礼拜、洗礼、临终礼。治疗二十个铜子起。／2. 洗礼簿上记着每一个孩子。 |
| bark.pray | 1. 光啊，照着这里。 |
| bark.sermon | 1. 诸位，请静一静。 |
| bark.work | 1. 蜡烛又不够了。 |

## 7. 队内闲聊 `ln_party`（第一幕）

触发与选择以 builtin_ai 第 11.3 节为准；本节 20 段，出场者必须全部在队。回应点的信任变化按 [companions_and_party.md](../systems/companions_and_party.md) 第 8.4 节写进对应同伴的 `trust.<id>`。

#### `party.a1_crow_meets_ron` 乌鸦与 D 级（cast：yeyu、ron；trigger：进入地点；when：`a1_yeyu_bound AND a1_guild_registered`；once）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | ron | 这位是……你从城里来的亲戚？ |
| 2 | yeyu | 我是乌鸦。 |
| 3 | ron | ……哦。好、好的。乌鸦。 |
| 4 | yeyu | 你胳膊上挂的那些，是门资吗？ |
| 5 | ron | 是护符！五位女神的！别碰！ |
| 回应点 | 玩家 | A. 她真的是乌鸦。（yeyu 信任 +1）／B. 别吓他。（ron 信任 +1）／C. （不说话） |

#### `party.a1_ron_impossible` 眼花（cast：ron、yeyu；trigger：事件之后（玩家徒手接住冷箭）；when：`a1_yeyu_bound`；once）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | ron | 我刚才……眼花了。 |
| 2 | yeyu | 你没眼花，你是笨。 |
| 3 | ron | 那箭离他的脸就这么一点！一点！ |
| 4 | yeyu | 门把手的手快。仅此而已。 |

#### `party.a1_shiya_smells_yeyu` 不是这里的味道（cast：shiya、yeyu；trigger：进入地点（林缘）；when：`a1_yeyu_bound AND trust.shiya >= 30`；once）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | shiya | （嗅了嗅）你闻起来像灰。还有……很老的风。 |
| 2 | yeyu | 狼崽子，闻够了没有。 |
| 3 | shiya | 我不是狼崽子。我是希雅。 |
| 4 | yeyu | ……夜羽。 |
| 5 | shiya | 好。说好了，林子里你别乱飞，会惊走鹿。 |

#### `party.a1_forest_walk` 林子的规矩（cast：shiya、ron；trigger：行进；when：`trust.shiya >= 30`）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | ron | 我们走的这条路安全吗？我只是问问。 |
| 2 | shiya | 逆风走，就安全。 |
| 3 | ron | 那风要是变了呢？ |
| 4 | shiya | 那就跑。 |
| 5 | ron | ……这个我擅长。 |

#### `party.a1_mine_morning` 一夜之后（cast：ron、yeyu；trigger：事件之后；when：`quest.q_a1_m06_one_night_mine`；once）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | ron | 不可能。塌了两年的矿道。一夜。 |
| 2 | yeyu | 你说了十七遍了。 |
| 3 | ron | 我回去怎么跟布伦说？说石头是空心的？ |
| 4 | yeyu | 就这么说。他们会信的。 |
| 5 | ron | ……他们真的会信。这才是最可怕的。 |
| 回应点 | 玩家 | A. 就说是矮人的机关。（ron 信任 +1）／B. 说实话。（ron 信任 -1）／C. 说是你指挥得好。（ron 信任 +1） |

#### `party.a1_split_ear` 裂耳之后（cast：shiya、ron；trigger：事件之后；when：`quest.q_a1_m05_grey_wolf`；once）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | shiya | 牙是你的。你拿着。 |
| 2 | ron | 德里斯会说那窝狼是他们打残的。 |
| 3 | shiya | 他没进去过。我闻得出来。 |
| 4 | ron | 你闻得出他没进去过？ |
| 5 | shiya | 我闻得出他在撒谎。 |

#### `party.a1_campfire_names` 记得名字（cast：ron、shiya；trigger：营火；when：`trust.ron >= 40`）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | shiya | 你在念什么？ |
| 2 | ron | 名字。一起出过委托的人的名字。 |
| 3 | shiya | 都记得？ |
| 4 | ron | 都记得。活着的，没活着的。 |
| 5 | shiya | ……祖灵也是这样。记得每一个。 |
| 回应点 | 玩家 | A. 我的名字也记着吧。（ron 信任 +1）／B. 没活着的，是谁？（ron 信任 -1）／C. （陪他坐着）（ron 信任 +1） |

#### `party.a1_campfire_letters` 信囊（cast：yeyu；trigger：营火；when：`a1_dream_door_woman`；once）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | yeyu | 别盯着我的信囊。 |
| 2 | yeyu | 里面有七封信。我打不开。 |
| 3 | yeyu | 不是我的信。不到时候，火漆不会开。 |
| 4 | yeyu | ……信要送到。这是我唯一记得清楚的事。 |
| 回应点 | 玩家 | A. 我帮你送。（yeyu 信任 +1）／B. 打开看看？（yeyu 信任 -2）／C. 不问。（yeyu 信任 +1） |

#### `party.a1_oola_medicine` 喝药（cast：oola、ron；trigger：营火；when：`trust.oola >= 40`）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | oola | 喝了。 |
| 2 | ron | 婆婆，这个……颜色不太对。 |
| 3 | oola | 良药都苦，小崽子。 |
| 4 | ron | 我说的是颜色，不是味道。 |
| 5 | oola | 那你闭上眼睛喝。 |

#### `party.a1_oola_shiya_herbs` 认草（cast：oola、shiya；trigger：行进；when：`trust.oola >= 40`）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | oola | 狼丫头，那棵草别踩。 |
| 2 | shiya | 我闻到了。苦的。 |
| 3 | oola | 苦的能退热。记着。 |
| 4 | shiya | 婆婆，林子最近的味道不对。 |
| 5 | oola | ……我知道。北边来的。 |

#### `party.a1_dris_after_duel` 木桩（cast：dris、ron；trigger：事件之后；when：`a1_dris_duel_won`；once）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | dris | 那根木桩早就朽了。 |
| 2 | ron | 嗯。用了三十年。 |
| 3 | dris | 我早就说该换了。 |
| 4 | ron | 你说过吗？ |
| 5 | dris | ……闭嘴，罗恩。 |

#### `party.a1_hoard_returned` 还东西（cast：yeyu、ron；trigger：事件之后；when：`quest.q_a1_s13_yeyu_hoard`；once）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | ron | 你真的挨家挨户道歉了？ |
| 2 | yeyu | 是门把手逼的。 |
| 3 | ron | 他们现在叫你"会偷东西的乌鸦精"。 |
| 4 | yeyu | 我不偷。我捡。 |

#### `party.a1_broken_door_slope` 碎门坡（cast：yeyu、shiya；trigger：进入地点（碎门坡）；when：`a1_yeyu_bound`；once）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | shiya | 这些石头……像倒下的门。 |
| 2 | yeyu | ……别站在门框底下。 |
| 3 | shiya | 为什么？ |
| 4 | yeyu | 不知道。就是别。 |

#### `party.a1_dian_word` 行话（cast：yeyu、ron；trigger：事件之后；when：`quest.q_a1_s14_grave_lights`；once）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | yeyu | 这是澱。死人身上带着它。 |
| 2 | ron | 澱？……那是城里冒险者的行话吧？我们这儿叫灰气。 |
| 3 | yeyu | 叫错了也是它。 |
| 4 | ron | 你说话怎么跟个老学究似的。 |

#### `party.a1_trial_eve` 审判前夜（cast：shiya、ron、yeyu；trigger：事件之后；when：`a1_witch_trial_started AND a1_oola_fate != cleared`；once）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | shiya | 婆婆没害人。我闻得出来。 |
| 2 | ron | 光之鉴……我听说从没错过。 |
| 3 | yeyu | 那个发光的铺子，灯是灰的。 |
| 4 | ron | 你说什么？ |
| 5 | yeyu | 我说，灯是灰的。去看。 |
| 回应点 | 玩家 | A. 我们去找证据。（shiya 信任 +1）／B. 劫狱也行。（ron 信任 -1、shiya 信任 +1）／C. 等审判结果。（shiya 信任 -1） |

#### `party.a1_tide_eve` 暗月之前（cast：ron、shiya、yeyu；trigger：幕次；when：`seal_unrest >= 80`；once）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | yeyu | 林子里的鸟全飞了。 |
| 2 | shiya | 鹿也走了。 |
| 3 | ron | 你们俩能不能说点让人睡得着的话？ |
| 4 | shiya | 不能。 |
| 5 | ron | ……好吧。东栅那段木头，我去问问能不能换。 |

#### `party.a1_after_tide` 天亮以后（cast：ron、shiya、yeyu；trigger：事件之后；when：`a1_beast_tide_cleared`；once）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | ron | 我没跑。 |
| 2 | shiya | 我看见了。 |
| 3 | ron | 我真的没跑！ |
| 4 | yeyu | 嗯。你没跑。笨，但没跑。 |
| 5 | ron | ……这是我听过最好的夸奖。 |
| 回应点 | 玩家 | A. 你守住了北门。（ron 信任 +2）／B. 下次也别跑。（ron 信任 +1）／C. 大家都没跑。（shiya 信任 +1、ron 信任 +1） |

#### `party.a1_close_the_window` 关窗（cast：ron、yeyu；trigger：事件之后；when：`a1_martha_strike`；once）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | ron | 老板娘那天晚上……去关窗了。 |
| 2 | yeyu | 嗯。关窗。 |
| 3 | ron | 关窗需要那么大一把刀吗？ |
| 4 | yeyu | 窗很大。 |

#### `party.a1_mark` 手洗干净（cast：yeyu；trigger：事件之后；when：`a1_dream_door_woman`；once）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | yeyu | 你手上那个…… |
| 2 | yeyu | ……没什么。手洗干净再说话。 |

#### `party.a1_act_end` 去瓦伦堡（cast：ron、shiya、yeyu；trigger：幕次；when：`quest.q_a1_m13_woman_at_door`；once）

| 序 | 说话者 | 句 |
| --- | --- | --- |
| 1 | ron | 伯爵要见那个打退兽潮的 F 级。 |
| 2 | shiya | 你。 |
| 3 | ron | 我知道是他！我是说……瓦伦堡好大。 |
| 4 | yeyu | 大城的门资贵。 |
| 5 | ron | 门资是什么？……算了，我不问了。 |
| 回应点 | 玩家 | A. 一起去。（ron 信任 +1、shiya 信任 +1）／B. 你们留下也行。（shiya 信任 -1）／C. 先吃饭。（ron 信任 +1） |

## 8. `ln_common`：第一幕地区话题

地区话题的通用层句（台词目录第 1.2 节）：边石镇一带的人，本人包没有写某个地区话题时，就从这里取。版本按知识层级；`mis` 只在台账误导情形下使用（builtin_ai 第 6.6 节）。句子用凡人的口吻与俗称，不带说话者自己的身份。

| 槽位 | 句 |
| --- | --- |
| topic.place_borderstone.K0 | 1. 边石镇，八百来口人，北边是荒原，南边是去瓦伦堡的大路。／2. 小地方，谁家有点事，第二天全镇都知道。 |
| topic.place_borderstone.K1 | 1. 边石镇近来不太平：税涨了，南路有匪，魔物季一年比一年长。／2. 代官管着镇子，领主在王都，从来不来。 |
| topic.place_bs_edgestone.K0 | 1. 广场那块灰石头？建镇时立的王国界碑。／2. 老人说摸一摸边石，出门不迷路。 |
| topic.place_bs_guild.K0 | 1. 公会分部，两层木楼。委托板在一楼，鉴定水晶在柜台上。／2. 后院有根木桩，冒险者天天在那儿练。 |
| topic.place_bs_guild.K1 | 1. 分部长是老布伦，一只胳膊，记性比谁都好。／2. 公会的水晶这个月又坏了，听说。 |
| topic.place_bs_chapel.K0 | 1. 小礼拜堂，钟楼是镇上最高的地方。礼拜日都去。／2. 祭坛上供着圣灯，叫光之鉴。 |
| topic.place_bs_chapel.K1 | 1. 神父每周给瓦伦堡教区写报告。镇上的事，教区都知道。 |
| topic.place_bs_branch.K0 | 1. 梅尔卡托商会的分号，盐和药水都在那儿买。／2. 院子角上有座小神龛，商人都拜。 |
| topic.place_bs_branch.K1 | 1. 商会的盐最近贵得离谱。听说是总号的意思。 |
| topic.place_bs_drunk_moon.K0 | 1. 醉月亭，吃饭、住店、喝酒。老板娘玛莎人好。／2. 店里不许打架，老板娘亲自管。 |
| topic.place_bs_smithy.K0 | 1. 巴尔加的铁匠铺，矮人打的铁，好。／2. 那个矮人睡得晚，半夜还听见敲打声。 |
| topic.place_bs_herb_hut.K0 | 1. 药草婆婆住在东栅外，看病收鸡蛋。／2. 〔when: a1_witch_trial_started AND a1_oola_fate != cleared〕那屋子……魔女的屋子，别去。 |
| topic.place_bs_herb_hut.K1 | 1. 药草婆婆懂的比神父多，这话别往外说。 |
| topic.place_bs_orphanage.K0 | 1. 圣灯孤儿院，十四个孩子，贴着北泉。／2. 孩子常被远房亲戚接走，也是好事。 |
| topic.place_bs_north_spring.K0 | 1. 北泉不收井税，北区的穷人都喝它。／2. 水凉，有点铁味。 |
| topic.place_bs_north_spring.K1 | 1. 〔when: a1_north_spring_found〕北泉的水发灰，别喝了。病就是从那儿来的。 |
| topic.place_bs_magistrate.K0 | 1. 代官府，镇上唯一的石头房子。前厅收税，侧屋关人。 |
| topic.place_bs_salt_lane.K0 | 1. 盐巷每周一个集日，什么都有。／2. 集日人多，看好钱袋。 |
| topic.place_bs_guardpost.K0 | 1. 北门旁边的哨所，十二个民兵，一口警钟。 |
| topic.place_bs_north_gate.K0 | 1. 荒原门。出了北门就是荒原，没事别去。／2. 北段的墙是石头的，东边的栅子朽了。 |
| topic.place_bs_south_gate.K0 | 1. 南门外是驿站，往南的大路通瓦伦堡。／2. 寄信、租马，都找驿站的老乌尔夫。 |
| topic.place_bs_east_slope.K0 | 1. 东栅外的东坡，兽人猎户住那儿。／2. 他们的熏肉好，皮子也好。 |
| topic.place_bs_lumberyard.K0 | 1. 东北溪边的伐木场，加斯帕带着三十个人。 |
| topic.place_bs_graveyard.K0 | 1. 西南坡上的墓地，守墓的埃德老头一个人住。／2. 米洛的坟还是新土。 |
| topic.place_bs_mill.K0 | 1. 奥托磨坊，老奥托冬天走了，磨坊空着。／2. 那磨坊有口深井，水好。 |
| topic.place_bs_bakery.K0 | 1. 佩德的面包房，清早第一缕烟就是他家的。 |
| topic.place_bs_wash_creek.K0 | 1. 洗衣溪，西边的浅滩。女人们洗衣服、说闲话。／2. 想打听什么，去洗衣溪坐一会儿。 |
| topic.place_bs_west_fields.K0 | 1. 西田是镇上的麦地。今年的税，种地的最苦。 |
| topic.place_bs_dice_house.K0 | 1. 盐巷尽头有个赌局。正经人别去。 |
| topic.place_bs_dice_house.K1 | 1. 骰子屋是荒原那帮人开的，你自己掂量。 |
| topic.place_east_forest.K0 | 1. 镇东的林子，越往里树越老。／2. 林子里有棵老橡树，叫约树。 |
| topic.place_east_forest.K1 | 1. 伐区和猎径挨着，伐木的跟东坡的老吵架。 |
| topic.place_old_mine.K0 | 1. 东北丘陵的旧铁矿，两年前塌了。／2. 〔when: quest.q_a1_m06_one_night_mine〕听说一夜之间打通了，矿道里有矮人的机关。 |
| topic.place_old_mine.K1 | 1. 塌方是两年前代官说的。塌得也太巧了。 |
| topic.place_old_watch.K0 | 1. 旧哨村，往东半天路，早没人住了。／2. 现在是荒原那帮匪的窝。 |
| topic.place_old_watch.K1 | 1. 九百零八年魔王军南下，旧哨村被烧，领主的援兵没来。 |
| topic.place_waste_rim.K0 | 1. 荒原外缘，灰沙、枯树、碎石头。别去。 |
| topic.place_waste_rim.mis | 1. 荒原是古代邪神之乱的战场，被诅咒的地方。教会说的。 |
| topic.place_sealed_ruins.K0 | 1. 镇北荒原边上的遗迹，教会立了禁碑，凡人禁地。／2. 进去的人，没几个出来的。 |
| topic.place_sealed_ruins.K1 | 1. 二十年前公会派人进去过。回来的人少了一只胳膊。 |
| topic.place_broken_door_slope.K0 | 1. 荒原外缘有片坡，碎石头一排排倒着。夜里有东西。 |
| topic.place_ropebridge.K0 | 1. 灰溪上的断桥，有个孩子在守绳桥，过桥收铜子。 |
| topic.place_wallenburg.K0 | 1. 瓦伦堡，往南的大城，伯爵住在那儿。／2. 去瓦伦堡，走南门大路，三四天。 |
| topic.place_wallenburg.K1 | 1. 瓦伦堡有公会大区总部，B 级考核在那儿考。／2. 〔when: a1_count_letter IN (a, b, c, d)〕伯爵府来信了，说要见人。 |
| topic.place_merca_shrine.K0 | 1. 商会院子里那座小神龛，商人拜交易的那一位。 |
| topic.person_cassian.K0 | 1. 卡西安神父，年轻，虔诚得很。／2. 他教孤儿院的孩子认字。 |
| topic.person_oola.K0 | 1. 药草婆婆，嘴巴刻薄，心软。／2. 〔when: a1_witch_trial_started AND a1_oola_fate != cleared〕神父说她用巫术害了孩子。 |
| topic.person_oola.mis | 1. 〔when: NOT a1_north_spring_found〕米洛死了，托比病了，都跟那个药草婆婆有关。 |
| topic.person_martha.K0 | 1. 醉月亭的老板娘，做饭好吃，人爽快。／2. 别在她店里闹事。 |
| topic.person_bron.K0 | 1. 公会的老布伦，一只胳膊，喝多了就说胡话。 |
| topic.person_moss.K0 | 1. 代官大人。税是他加的。／2. 他说是为了讨伐魔物。 |
| topic.person_nera.K0 | 1. 商会的奈拉，狐族，笑眯眯的，算账算得精。 |
| topic.person_shiya.K0 | 1. 东坡的狼族丫头，箭射得准，不爱说话。 |
| topic.person_ron.K0 | 1. 罗恩，D 级冒险者，胆小，人好。 |
| topic.person_lina.K0 | 1. 公会接待的小姑娘，嘴快，见什么都说好厉害。 |
| topic.person_hock.K0 | 1. 公会管档案的侯克，眼神不好，记性好。 |
| topic.person_isa.K0 | 1. 伊莎修女，温柔，下午在孤儿院帮忙。 |
| topic.person_toma.K0 | 1. 敲钟的托马，耳背，跟他说话得大声。 |
| topic.person_bertha.K0 | 1. 贝莎，妇女会的会长，什么事都往邪术上想。 |
| topic.person_greta.K0 | 1. 孤儿院的格蕾塔院长，一个人拉扯十四个孩子。 |
| topic.person_noi.K0 | 1. 孤儿院那个男孩，不爱说话，老盯着人看。 |
| topic.person_tess.K0 | 1. 孤儿院的小丫头，爱唱歌。 |
| topic.person_barga.K0 | 1. 矮人铁匠，脾气爆，手艺好。 |
| topic.person_gaspar.K0 | 1. 伐木场的工头加斯帕，护着他的工人，跟东坡不对付。 |
| topic.person_nick.K0 | 1. 伐木的尼克，老实孩子，一说话就结巴。 |
| topic.person_gorn.K0 | 1. 东坡兽人的头葛恩，腿瘸，说话算话。 |
| topic.person_ako.K0 | 1. 东坡的小崽子阿柯，野得很。 |
| topic.person_boro.K0 | 1. 东坡那个熊族大个子，动不动就要扳手腕。 |
| topic.person_barto.K0 | 1. 卫队长巴托，累得像头老牛，人不坏。 |
| topic.person_jed.K0 | 1. 民兵杰德，嘴甜。／2. 〔when: a1_jed_exposed〕铜铃是他偷的，拿去赌了。 |
| topic.person_vick.K0 | 1. 代官的书记官维克，文绉绉的。 |
| topic.person_seg_oneeye.K0 | 1. 独眼团的头，独眼瑟格。荒原上的匪。 |
| topic.person_viro.K0 | 1. 骰子屋那个女人，冷冰冰的，别跟她赌。 |
| topic.person_popo.K0 | 1. 商会的半身人伙计波波，什么都要标个价。 |
| topic.person_owen.K0 | 1. 跑南路的行商欧文，车被劫过。／2. 〔when: a1_owen_left〕欧文走了，说不回来了。 |
| topic.person_dora.K0 | 1. 醉月亭的朵拉，说什么都乘五。 |
| topic.person_ed.K0 | 1. 守墓的埃德，一肚子鬼故事。 |
| topic.person_ped.K0 | 1. 面包师佩德，老实人，怕官。 |
| topic.person_lisa.K0 | 1. 佩德家的莉莎，好姑娘。 |
| topic.person_dris.K0 | 1. 德里斯，C 级，镇上最能打的冒险者。……他自己说的。 |
| topic.person_simon.K0 | 1. 西田的西蒙，种地的，老实。 |
| topic.person_marg.K0 | 1. 洗衣的玛格，镇上一半人家的衣裳过她的手。 |
| topic.person_ulf_lange.K0 | 1. 南门驿站的老乌尔夫，跟马说话比跟人多。 |
| topic.person_knut_naumann.K0 | 1. 修刀的克努特，以前给匪修家伙，现在什么都修。 |
| topic.person_kas_ropebridge.K0 | 1. 守绳桥的孩子卡斯，数着过桥的人。 |
| topic.person_yeyu.K0 | 1. 〔when: a1_yeyu_bound〕那个怪人带了个说自己是乌鸦的怪家伙。／2. 〔when: a1_yeyu_bound〕那丫头老盯着亮东西看。 |
| topic.person_adalbert.K0 | 1. 瓦伦边境伯爵，管着这一片。没见过。 |
| topic.person_adalbert.K1 | 1. 伯爵病了，听说。三个孩子在争家业。／2. 〔when: a1_count_letter IN (a, b, c, d)〕伯爵府来信，要见那个打退兽潮的人。 |
| topic.event_milo_death.K0 | 1. 孤儿米洛，七岁，没了。棺材那么小。／2. 他先是发灰，后来就起不来了。 |
| topic.event_milo_death.mis | 1. 〔when: NOT a1_north_spring_found〕药草婆婆夜里去过孤儿院。神父说是巫术。 |
| topic.event_milo_death.K1 | 1. 〔when: a1_oola_fate == cleared〕是北泉的水。不是巫术。神父当众认了错。 |
| topic.event_tax_hike.K0 | 1. 讨伐税从十取一涨到六取一，说是要募兵讨伐。／2. 〔when: act_week >= 5〕又加了井税。喝口水都要钱。 |
| topic.event_tax_hike.K1 | 1. 讨伐税收了，讨伐的人呢？没见卫队出过镇。 |
| topic.event_caravan_raid.K0 | 1. 〔when: act_week >= 3〕欧文的车在南路被劫了，护卫重伤。／2. 听说匪不杀人，团规。 |
| topic.event_crystal_broke.K0 | 1. 〔when: a1_guild_registered〕新来的那个把公会的水晶弄坏了。／2. 〔when: a1_guild_registered〕听说一巴掌拍裂的。 |
| topic.event_crystal_broke.mis | 1. 〔when: a1_guild_registered〕水晶照不出他。光照不出的东西……／2. 〔when: a1_guild_registered〕那玩意儿本来就老坏。 |
| topic.event_toby_sick.K0 | 1. 〔when: act_week >= 6〕贝莎的孙子托比倒下了，跟米洛一样。／2. 〔when: a1_toby_state == recovered〕托比好了，能下床了。 |
| topic.event_tess_song.K0 | 1. 〔when: act_week >= 5〕孤儿院那个小丫头唱什么"门开了"，贝莎说是邪歌。 |
| topic.event_witch_trial.K0 | 1. 〔when: a1_witch_trial_started〕神父要审药草婆婆，用光之鉴。／2. 〔when: a1_oola_fate == cleared〕光之鉴照出来了，不是婆婆的错。／3. 〔when: a1_oola_fate == convicted〕婆婆被定了罪，要押去瓦伦堡。／4. 〔when: a1_oola_fate == fled〕婆婆跑了，进林子了。 |
| topic.event_summons.K0 | 1. 〔when: act_week >= 7〕代官府贴了告示，传那个无记载的人去问话。／2. 〔when: act_week >= 7〕说藏着他的人以通匪论。 |
| topic.event_salt_price.K0 | 1. 盐又贵了，商会说是行情。／2. 魔物季前，年年涨。 |
| topic.event_salt_price.K1 | 1. 商会囤着盐呢，等魔物季卖高价。 |
| topic.event_burned_shed.K0 | 1. 〔when: act_week >= 4〕东坡的猎棚被人烧了。 |
| topic.event_market_theft.K0 | 1. 〔when: act_week >= 4〕集上丢了个铜铃，说是东坡那小崽子拿的。／2. 〔when: a1_jed_exposed〕铜铃是民兵杰德偷的。冤枉了那孩子。 |
| topic.event_mine_opened.K0 | 1. 〔when: quest.q_a1_m06_one_night_mine〕旧矿道一夜打通了！说是有矮人的机关，一按就开。／2. 〔when: quest.q_a1_m06_one_night_mine〕连矮人都急了，那就是真有机关。 |
| topic.event_beast_tide.K0 | 1. 〔when: a1_tide_credit == player〕那个 F 级打退了兽潮！／2. 〔when: a1_tide_credit == martha〕老板娘一刀斩了巨像！……她说她去关窗了。／3. 〔when: a1_tide_credit == light〕是光庇佑了边石镇。／4. 〔when: a1_tide_credit == self_collapse〕那巨像是自己塌的，灰散了。 |
| topic.event_beast_tide.K1 | 1. 〔when: a1_beast_tide_cleared〕暗月夜，狼和灰鬼从北边涌过来，后面跟着个大家伙。镇子守住了。 |
| topic.event_otto_will.K0 | 1. 〔when: act_week >= 3〕老奥托的磨坊，孤儿院和维克在争。／2. 〔when: a1_mill_owner == orphanage〕磨坊归孤儿院了。 |
| topic.event_bakery_engagement.K0 | 1. 〔when: act_week >= 5〕书记官维克要娶面包房的莉莎。／2. 〔when: a1_lisa_nick == eloped〕莉莎跟伐木的尼克跑了！ |
| topic.event_martha_bet.K0 | 1. 〔when: a1_guild_registered〕酒客赌那个 F 级一个月内哭着回城，老板娘押他不走。／2. 〔when: act_week >= 6〕老板娘赢了一桌酒钱。老板娘运气真好。 |
| topic.event_count_letter.K0 | 1. 〔when: a1_count_letter IN (a, b, c, d)〕伯爵府的信到了，要见人。 |
| topic.event_old_watch_908.K0 | 1. 旧哨村九十年前被烧了，一个人都没剩。 |
| topic.event_old_watch_908.K1 | 1. 魔王军南下那年，领主的援兵没来。荒原上的匪恨领主，就是为这个。 |
| topic.event_expedition_978.K0 | 1. 二十年前，公会有人死在遗迹里。 |
| topic.event_expedition_978.K1 | 1. 那次探索队回来的人，布伦是一个。他不提。 |
| topic.event_dris_duel.K0 | 1. 〔when: a1_dris_duel_won〕公会后院那根木桩断了。早就朽了。／2. 〔when: a1_dris_duel_won〕德里斯说他早就说过该换了。 |
| topic.event_crow_person.K0 | 1. 〔when: a1_yeyu_bound〕那怪家伙说"我是乌鸦"。／2. 〔when: a1_yeyu_bound〕乌鸦是给死人引路的。埃德说的。 |
| topic.event_drunk_bandits.K0 | 1. 〔when: quest.q_a1_s01_owen_wagon〕一伙醉匪撞上了新人，被抓了。／2. 〔when: quest.q_a1_s01_owen_wagon〕玛格说那几个人身上一点酒味都没有。 |
| topic.lore_demon_king.K0 | 1. 魔王是邪神在世上的化身，魔族之王。／2. 光会派勇者去打。 |
| topic.lore_demon_king.K1 | 1. 上一代魔王军南下，是九十年前的事。北边的老人还记得。 |
| topic.lore_demon_king.mis | 1. 魔物是邪神之秽，是魔族的诅咒。圣典上写着。 |
| topic.lore_heroes.K0 | 1. 光召来的勇者，打魔王的。故事里都这么讲。 |
| topic.lore_heroes.K1 | 1. 听说教会又要召勇者了。魔物这么多，怕是要来了。 |
| topic.lore_waste.K0 | 1. 荒原，北边那一大片灰地，寸草不生。 |
| topic.lore_waste.mis | 1. 荒原是古代邪神之乱的战场，被诅咒了，所以长不出东西。 |
| topic.lore_appraisal.K0 | 1. 鉴定水晶一照，就知道你几级、干什么的。铭录上都写着。 |
| topic.lore_appraisal.K1 | 1. 公会卡上写着等级和职能，跟铭录对得上。 |
| topic.lore_appraisal.mis | 1. 照不出来？那是水晶坏了，要不就是这人被诅咒了。 |
| topic.lore_ranks.K0 | 1. 凡阶、精英阶、英雄阶……我们这种人，一辈子在凡阶。 |
| topic.lore_ranks.K1 | 1. 二十级以上就是精英，镇上没几个。 |
| topic.lore_guild_ranks.K0 | 1. 冒险者分 F 到 S，F 是新人。 |
| topic.lore_guild_ranks.K1 | 1. C 级在小镇就是顶梁柱了。B 级以上得去城里考。 |
| topic.lore_grey_sickness.K0 | 1. 荒原病，从北边来的，人慢慢发灰。／2. 有人说是诅咒。 |
| topic.lore_grey_sickness.K1 | 1. 荒原病跟水有关，北泉一带的人得得多。 |
| topic.lore_grey_crystal.K0 | 1. 灰晶，荒原和矿里出的，不能私卖。 |
| topic.lore_grey_crystal.K1 | 1. 灰晶得经城里持证的工坊净炼，才能卖。私卖的要坐牢。 |
| topic.lore_nameless_god.K1 | 1. 边境的老人说有个"无名之神"。别在神父面前提。／2. 老人们这么叫，我也只听过名字。 |
| topic.lore_branded.K0 | 1. 教会说手上有怪纹的人叫烙印者，是邪神的仆从。 |
| topic.lore_branded.mis | 1. 烙印者见光就躲。离他们远点。 |
| topic.lore_sixth_sigil.K0 | 1. 遗迹里画着神纹，那是禁地，别去看。 |
| topic.lore_judgment.K0 | 1. 千年之审，教会说到时候会昭示唯一之光。 |
| topic.lore_judgment.mis | 1. 上一次审定碑上写了个"未"，教会说是光还没普照。 |
| topic.lore_monster_season.K0 | 1. 魔物季一年比一年长。／2. 魔物季前要囤盐、修栅子。 |
| topic.lore_monster_season.K1 | 1. 今年的魔物季来得早，狼都下山了。 |
| topic.lore_monster_season.mis | 1. 魔物多，是邪神作祟。多祷告。 |
| topic.lore_lords.K0 | 1. 领主在王都，从来不来。镇上的事归代官。 |
| topic.lore_lords.K1 | 1. 这一片归瓦伦边境伯爵管，伯爵上头是国王。 |
| topic.faith_eluen.K0 | 1. 光之女神，圣教拜的。礼拜日去礼拜堂。 |
| topic.faith_eluen.K1 | 1. 教会说光是唯一的。别的神……教会自有说法。 |
| topic.faith_valda.K0 | 1. 打仗的那一位，教会说是邪神，魔族之母。 |
| topic.faith_valda.mis | 1. 魔物就是她的孩子。拜她的都是疯子。 |
| topic.faith_merca.K0 | 1. 交易的那一位，商人和矮人拜。 |
| topic.faith_sylvie.K0 | 1. 林子的那一位，兽人拜。 |
| topic.faith_moira.K0 | 1. 管记录的那一位，读书人心里拜。 |
| topic.faith_light_mirror.K0 | 1. 光之鉴，礼拜堂的圣灯。神父说它能照出真假。 |
| topic.faith_holy_day.K0 | 1. 七天一个礼拜日，那天不干重活，去礼拜堂。／2. 洗礼、婚礼、临终礼，都找神父。 |
| topic.danger_east_forest.K0 | 1. 伐区北边有狼，听说有灰色的。／2. 别一个人进林子深处。 |
| topic.danger_old_mine.K0 | 1. 旧矿上层有掘穴虫，咬人。 |
| topic.danger_waste_rim.K0 | 1. 荒原上有灰鬼，夜里出来。／2. 灰沙会埋人。 |
| topic.danger_sealed_ruins.K0 | 1. 遗迹是禁地，进去的没好下场。 |
| topic.danger_south_road.K0 | 1. 南路有匪，独眼团。商队都结伴走。 |
| topic.danger_monster_season.K0 | 1. 魔物季到了，夜里关好门窗。 |
| topic.danger_north_spring.K0 | 1. 〔when: a1_north_spring_found〕北泉的水别喝了，打井水喝。 |
| topic.danger_tide_omens.K0 | 1. 〔when: seal_unrest >= 70〕林子里的鸟都飞走了，北泉的水变了色。不对劲。／2. 〔when: seal_unrest >= 70〕夜里有乌鸦成群地飞。 |
| topic.danger_graveyard_wisp.K0 | 1. 〔when: act_week >= 3〕墓地夜里有灰色的鬼火，米洛坟上。 |
| topic.quest_board.K0 | 1. 〔when: a1_guild_registered〕公会的委托板，新人先接 F 级的活。 |
| topic.quest_grey_wolf.K0 | 1. 〔when: act_week >= 2〕东坡的丫头说北边有灰色的狼，没人信。 |
| topic.quest_old_mine.K0 | 1. 〔when: act_week >= 4〕旧矿的掘穴虫，委托板上挂了一个月了。 |
| topic.quest_salt.K0 | 1. 〔when: act_week >= 5〕盐太贵了，西田的西蒙想找人去商会说说。 |
| topic.quest_copper_bell.K0 | 1. 〔when: act_week >= 4〕集上卖铃的丢了个铜铃，正找人呢。 |
| topic.quest_tide_prep.K0 | 1. 〔when: seal_unrest >= 80〕东栅得修，孩子得安顿，盐和药得备上。快了。 |

## 9. 句数统计与自查

### 9.1 句数

| 类 | 包 | 本批句数 | 最低量 | 说明 |
| --- | --- | --- | --- | --- |
| G | `ln_eluen` | 73 | 250（全作） | 序章、第一幕与跨幕基础；M2、M3 补足 |
| G | `ln_valda` | 59 | 250（全作） | 序章、第一幕与跨幕基础；M2、M3 补足 |
| G | `ln_merca` | 126 | 250（全作） | 序章、第一幕与跨幕基础；M2、M3 补足 |
| G | `ln_sylvie` | 61 | 250（全作） | 序章、第一幕与跨幕基础；M2、M3 补足 |
| G | `ln_moira` | 66 | 250（全作） | 序章、第一幕与跨幕基础；M2、M3 补足 |
| G | `ln_janu` | 75 | 250（全作） | 序章、第一幕与跨幕基础；M2、M3 补足 |
| C | `ln_yeyu` | 238 | 200 | 已达标；后幕 `acts.*` 覆盖另加 |
| C | `ln_shiya` | 236 | 200 | 已达标；后幕 `acts.*` 覆盖另加 |
| C | `ln_ron` | 219 | 200 | 已达标；后幕 `acts.*` 覆盖另加 |
| C | `ln_oola` | 228 | 200 | 已达标；后幕 `acts.*` 覆盖另加 |
| F | `ln_dris` | 90 | 70 | 已达标 |
| K | `ln_nera` | 111 | 80 | 已达标；入队那一幕补足 200 |
| K | `ln_cassian` | 119 | 80 | 已达标；入队那一幕补足 200 |
| K | `ln_martha` | 112 | 80 | 已达标；入队那一幕补足 200 |
| K | `ln_bron` | 116 | 80 | 已达标 |
| K | `ln_ash` | 95 | 80 | 已达标 |
| K | `ln_moss` | 99 | 80 | 已达标 |
| N | `ln_lina` | 43 | 30 | 已达标 |
| N | `ln_hock` | 39 | 30 | 已达标 |
| N | `ln_isa` | 42 | 30 | 已达标 |
| N | `ln_toma` | 40 | 30 | 已达标 |
| N | `ln_bertha` | 39 | 30 | 已达标 |
| N | `ln_greta` | 41 | 30 | 已达标 |
| N | `ln_noi` | 39 | 30 | 已达标 |
| N | `ln_tess` | 34 | 30 | 已达标 |
| N | `ln_barga` | 41 | 30 | 已达标 |
| N | `ln_gaspar` | 44 | 30 | 已达标 |
| N | `ln_nick` | 38 | 30 | 已达标 |
| N | `ln_gorn` | 42 | 30 | 已达标 |
| N | `ln_ako` | 37 | 30 | 已达标 |
| N | `ln_boro` | 40 | 30 | 已达标 |
| N | `ln_barto` | 42 | 30 | 已达标 |
| N | `ln_jed` | 38 | 30 | 已达标 |
| N | `ln_vick` | 38 | 30 | 已达标 |
| N | `ln_seg_oneeye` | 41 | 30 | 已达标 |
| N | `ln_viro` | 39 | 30 | 已达标 |
| N | `ln_popo` | 36 | 30 | 已达标 |
| N | `ln_owen` | 44 | 30 | 已达标 |
| N | `ln_dora` | 36 | 30 | 已达标 |
| N | `ln_ed` | 42 | 30 | 已达标 |
| N | `ln_ped` | 39 | 30 | 已达标 |
| N | `ln_lisa` | 36 | 30 | 已达标 |
| N | `ln_simon` | 37 | 30 | 已达标 |
| N | `ln_marg` | 35 | 30 | 已达标 |
| N | `ln_ulf_lange` | 35 | 30 | 已达标 |
| N | `ln_knut_naumann` | 34 | 30 | 已达标 |
| N | `ln_kas_ropebridge` | 36 | 30 | 已达标 |
| T | `ln_tpl_tenant_farmer` | 23 | 20 | 已达标 |
| T | `ln_tpl_miner` | 24 | 20 | 已达标 |
| T | `ln_tpl_woodcutter` | 23 | 20 | 已达标 |
| T | `ln_tpl_herb_woman` | 23 | 20 | 已达标 |
| T | `ln_tpl_peddler` | 24 | 20 | 已达标 |
| T | `ln_tpl_caravan_guard` | 23 | 20 | 已达标 |
| T | `ln_tpl_town_guard` | 23 | 20 | 已达标 |
| T | `ln_tpl_militia` | 24 | 20 | 已达标 |
| T | `ln_tpl_tax_collector` | 23 | 20 | 已达标 |
| T | `ln_tpl_adventurer_fe` | 23 | 20 | 已达标 |
| T | `ln_tpl_adventurer_d` | 22 | 20 | 已达标 |
| T | `ln_tpl_scavenger` | 23 | 20 | 已达标 |
| T | `ln_tpl_smuggler` | 23 | 20 | 已达标 |
| T | `ln_tpl_bandit` | 24 | 20 | 已达标 |
| T | `ln_tpl_hidden_gatefolk` | 25 | 20 | 已达标 |
| T | `ln_tpl_street_urchin` | 23 | 20 | 已达标 |
| T | `ln_tpl_village_priest` | 24 | 20 | 已达标 |
| 闲聊 | `ln_party` 第一幕 20 段 | 91 | 无下限 | 另计 |
| 通用层 | `ln_common` 第一幕地区话题 | 234 | 无下限 | 每个地区话题至少一句 |

合计：女神 460 句，主要同伴 921 句，随行同伴 90 句，核心 652 句，其余有名 30 包 1167 句，模板 17 个 397 句，闲聊 91 句，地区话题 234 句，共 4012 句。

### 9.2 自查

| 检查（台词目录第 2.6 节） | 结果 |
| --- | --- |
| 禁用字符（U+2013、U+2014、U+2015、U+2600 到 U+27BF、emoji） | 0 处 |
| 长度（问候与吠叫 30 字、反应 50 字、话题与任务 80 字、闲聊 50 字） | 全部在限内 |
| 槽位名 | 全部在 builtin_ai 第 7.2 节语法与台词目录第 1.6 节对照表内 |
| 条件字段与取值 | 只用 `when`、`mood`、`place`、`strict`、`first`、`w`；心情与地点取值在封闭集合内 |
| 条件变量 | 全部是注册表已登记的名字或族成员；唯一的新信号 `order.moral_tag` 见台词目录第 1.7 节 |
| 话题编号 | 全部已在台词目录第 3.3 节登记 |
| 必备槽位 | 每包按台词目录第 1.5 节逐项覆盖；女神按本批范围覆盖序章、第一幕与跨幕基础 |
| 台账 | 未解锁内容只出现在带解锁条件的句子里：欧拉的孩子（`trust.oola >= 60` 且 `a1_orphan_mark_seen`）、落叶路（`trust.oola >= 70`）、布伦的门纹（`a1_bron_sees_mark`）、阿什的"她"与故乡（`a3_ash_tells_sundering`）、雅努的"是的"（`a3_seal_aware`）；卡西安与贝莎的误导版本按 `a1_north_spring_found`、`a1_oola_fate` 切换 |
| 称谓与俗称 | 第一幕凡人只说灰气、灰病、荒原病、灰晶；"澱"只出自夜羽与阿什；无人说出被禁之名；"没有脸的人"只在布伦的醉话里 |
| 同构 | 无任何句子点出镇上势力与诸神的对应 |

### 9.3 第二幕文件的续写约定

1. 跨幕人物（夜羽、希雅、罗恩、欧拉、奈拉、卡西安、玛莎、布伦、阿什、莫斯、德里斯与六位女神）的包在第二幕文件里续写 `acts.act2.*` 覆盖，序号接着本文往后排，不重写本文的句子。
2. 奈拉在第二幕入队，第二幕文件把 `ln_nera` 补足到 200 句（补齐三组对话与交易反应、招募与角色反应、五种战斗吠叫、拒绝命令的五种标签）。
3. 第一幕的出口量（`a1_oola_fate`、`a1_moss_fate`、`a1_forest_accord`、`a1_tide_credit`、`a1_count_letter` 等）是第二幕开场白与问候的主要条件。

## 10. 来源链接

- [catalog_dialogue_lines.md](catalog_dialogue_lines.md)：格式、类别与最低量、话题表、女神槽位对照、共享台词包。
- [builtin_ai.md](../systems/builtin_ai.md)：第 5.6、5.7 节（反应表与凡人不信）、第 6 节（话题图与意图）、第 7 节（台词包契约）、第 11.3、11.4 节（队内闲聊与同伴台词）。
- [characters.md](../../30_story/characters.md)：第 1 节（女神分幕风格）、第 3 节（第一幕人物）、第 8 节（同伴总表）。
- [pantheon.md](../../20_world/pantheon.md)：第 0.1 节（尊名）、第 1 到 6 节（女神说话方式）、第 9 节（锚点台词）。
- [reveal_ledger.md](../../30_story/reveal_ledger.md)：第 0.2 节（装配规则）、第 4 节（锚点回扣）、第 5 节（误导表）、第 6 节（称谓开放表）、第 8.0 到 8.2 节（泄露禁区）。
- [prologue_antechamber.md](../../30_story/arcs/prologue_antechamber.md)：第 2.1 节（开场回扣）、第 3 节（帘幕后的争吵）、第 4 节（面试与统一回应）、第 5 到 7 节（暗面台词稿、锚点、分支对话树）。
- [act1_borderstone.md](../../30_story/arcs/act1_borderstone.md)：第 2 节（地点）、第 3 节（人物表）、第 4 节（纷争）、第 5 节（任务）、第 6 节（凡人不信桥段）、第 7 节（暗面）、第 8 节（兽潮）、第 9 节（拉远）。
- [catalog_characters_lotha.md](catalog_characters_lotha.md)：第 2.1 节（第一幕人物审计）、第 3.1、3.4 节（乌尔夫、克努特、卡斯）、第 6 节（居民模板）。
- [companions_and_party.md](../systems/companions_and_party.md)：第 2 节（名单与招募）、第 8 节（羁绊与红线）、第 10 节（台词需求量）。
- [catalog_goddess_interventions.md](catalog_goddess_interventions.md)：第 4.1 节（写定神行节点）、第 6 节（反应表）、第 9 节（供品价目）、第 10 节（尊名回应）。
- [world_state_registry.md](../world_state_registry.md)：第 5 节（条件文法）、第 6 节（任务编号）、第 8 节（变量）。
- `data/npc/personas.json`（口吻、口头禅、现有台词）、`data/dialogue/templates.json` 与 `data/cognition/lines.json`（迁入通用层的现有句）、`data/goddess/goddesses.json`（女神现有回应句）。
