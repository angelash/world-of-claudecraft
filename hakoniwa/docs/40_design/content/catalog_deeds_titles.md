# 事迹与称号目录（Catalog: Deeds and Titles）

> 本文是内容设计一轮的第 12 号目录（[总纲 12][bible]）：玩家与他人做过的事如何被记下、被讲述、被命名，以及这些名字值什么。
> 本文拥有两个命名空间：事迹 `deed_`、称号 `title_`。其余 ID（异名者与 `nm_` 异名物、`dg_` 迷宫、NPC、`col_` 收藏、`door_` 门、
> 可挑战段 `trial_`）一律按原目录引用；门 ID 以[门目录][drs]为准，门读事迹的接口以[千门 5.3][td]为准（2.7）；变量名以[变量注册表][reg]为准（D-076）。
> 正典优先级按 `hakoniwa/CLAUDE.md`：`world_bible` > `vision` > 其余 `20_world` > `30_story` > `40_design`；冲突登记在第 8 节。
> 机制底座借主工程称号簿（[事迹规则][deeds]、[事迹数据][deedsts]），但本作的事迹承载实际效果（[力量 12][pow] 映射表：钥另建"事迹"系统，
> 不改变主工程称号的纯外观约束）。撰写时点：2026-11-15。

## 0. 一页结论

1. **三份记录，三个版本。** 一件事在神的书（铭录，只记有页者）、人的书（布伦手录，第四幕起是国家的人簿）、街头的嘴（传闻）里各有一个版本。
   三者可以不一致，不一致本身就是内容：凡人不信、错名、冒名、立名都从这道缝里长出来。
2. **事迹有效，名望无效。** 一条事迹的效果来自它"被谁记下"：千门读它作历钥，命名者据它授称号，NPC 把它当证据，收藏据它完成。
   名望（记功）沿主工程 0、5、10、25、50 五档，只是数字，不换任何力量。
3. **玩家没有页。** 玩家的称号写不进铭录，也推不动玩家过关（玩家开门不过关，[力量 9.2][pow]）。玩家的称号就是"别人怎么叫你"：
   它改变称呼、身份先验与传闻，不改变数值。
4. **立名的引擎在玩家身边。** 同伴与 NPC 的传颂级称号由"讲述数"决定；传闻的主体替换会把讲述数记到被替换者名下。
   于是藏拙工具"让别人担名"变成推同伴过立名关的手段，勇者团也会因为玩家的事迹而立名（"余威所至"）。
5. **铭录不分善恶，只数讲述。** 恶名照样立名；玩家下的命令没有页可记，就记在执行命令的人的页上。
6. **只追加，不擦除。** 铭录对被证伪的称号加"注"而不删（"书记官不烧书"）；手录与人簿同理；已得事迹永不撤回（主工程规则 9）。
7. **数量。** 事迹 248 条（14 类，含 10 条他人事迹模板），称号 87 个（9 类）。每条事迹至少喂一扇门、一个称号、一次认知转变或一项收藏；
   纯计数事迹全目录只有 1 条，名望封顶 5（第 6.2 节）。名望 50 的事迹 17 条，与 Steam 成就的 C 组一一对应（2.13）。
8. **揭示纪律。** 凡人可见的名字与描述遵守[揭示台账][rl]与称谓开放表；隐藏事迹带【真相】与最早揭示幕；第六位女神的名字在第六幕之前不出现（D-023、D-053）。

## 1. 读法与口径

### 1.1 范围与归属

| 本文拥有 | 本文引用（不拥有） |
| --- | --- |
| 全部 `deed_`（玩家事迹）与 `deed_world_`（他人事迹模板，实例键为 `deed_world_<模板>:<npc_id>`）；全部 `title_` | 异名者与 `nm_`（[魔物图鉴][best]）；`dg_` 与首领、`trial_`（[迷宫目录][dgc]）；NPC（[人物一][chl]、[人物二][chc]）；`col_`、`rl_`、`ky_`、`lb_`（[遗物目录][rel]）；`door_`（[力量 9.9][pow] 与[门目录][drs]）；`pet_`、`mnt_`（[兽伴目录][cre]）；`eq_`（[装备目录][eqc]）；`cs_`（[消耗品目录][csm]）；剧情标记与世界变量（[台账 0.4][rl]、[任务与事件 3.7][qe]） |

### 1.2 事迹条目字段

| 字段 | 说明 |
| --- | --- |
| ID | `deed_<类>_<名>`；类码见第 3 节各小节标题 |
| 名 | 玩家可见名（受台账约束；隐藏事迹得到之前不显示） |
| 触发 | 主工程 `DeedTrigger` 种类沿用原名；本作新增种类前缀"新·"（1.3） |
| 名望 | 0、5、10、25、50（1.4） |
| 奖励 | 称号 `title_`、记事柱一格（2.8）、陈列物或"无"。多数事迹没有奖励，价值在"喂给"一栏 |
| 喂给 | 门（钥的种类）、称号、认知（谁的信念画像如何变、何种证据）、收藏 |
| 通道 | [总纲 2.1][bible] 价值通道代码，主通道在前 |
| 隐 | 空：可见；隐：隐藏事迹（得到之前不可见，公开面剔除）；壮：壮举（`feat`，零名望，不计完成度） |
| 幕 | 最早可得的幕；序、一到六、终 |

### 1.3 触发种类

| 种类 | 来源 | 本作用法 |
| --- | --- | --- |
| `quest`、`quests` | 主工程 | 任务编号（`A1-M05`、`A2-S01`，[任务与事件 3.9][qe]） |
| `flag` | 主工程 | 剧情标记（`a1_ash_met` 等，[台账 0.4][rl]）；主工程的 `DeedFlagId` 在本作扩展为台账标记集 |
| `stat` | 主工程 | 终身计数（`deedStats`）；本作只用于少数计数 |
| `dungeonClears` | 主工程 | 迷宫通关，键为 `dg_` ID |
| `collectItems` | 主工程 | 持有或曾持有物品（归还、赠予、陈列计"曾藏"，[遗物 1.7][rel] 第 7 条） |
| `visit`、`visits` | 主工程 | 交互标记（`poi:<区域>:<地点>`、`npc:<id>`） |
| `meter` | 主工程 | 持久数值（门阶 `door_rank`、开门数 `doors_opened` 等，[注册表 8.2][reg]） |
| `meta` | 主工程 | 其他事迹全部达成 |
| `manual` | 主工程 | 在具体场景的结算点显式授予（遭遇战机制、限制条件、抉择结果） |
| 新·`cond` | 新增 | 世界状态条件表达式（[任务与事件 4][qe] 语法，枚举、比较、`AND`）；主工程 `flag` 只有布尔，这里补上枚举与数值 |
| 新·`doorState` | 新增 | 门达到某状态（显影、可开、已开、锁闭、关闭，[力量 9.5][pow]），读 `door_state.<数据 id>` 与 `door.<数据 id>.tier` |
| 新·`witness` | 新增 | 事迹发生时的具名目击者条件：至少 N 人、某人在场、或零目击（[认知 3.1][rep]） |
| 新·`rumorReach` | 新增 | 锚定该事件的某个传闻版本在 N 个地区成为主流说法，或热度越过阈值（[认知 4.6][rep]） |
| 新·`belief` | 新增 | 指定 NPC 或至少 N 名有名 NPC 对玩家处于某认知状态（[认知 3.5][rep]） |
| 新·`exposure` | 新增 | 在某观众群体的显露度不高于某档的条件下完成（[认知 6.3][rep]） |
| 新·`tellCount` | 新增 | 有页者的讲述数越过立名阈值（第 2.6 节、[成长 12][pp]）；只用于同伴与他人事迹 |

新增种类全部是对已存在的内核状态（世界变量、门状态、信念画像、传闻画像、显露度、讲述数）的只读谓词，不新建计数器；评估器沿主工程
`src/sim/deeds.ts` 的结构（末尾结算、只看脏玩家、不抽随机数），见[力量 12][pow]。

**判定接口**（与[千门 5.2][td]的钥判定同一种写法）：

```
evalDeed(view: DeedView, deed: DeedDef, ctx?: EventCtx): boolean
DeedView = 只读视图 { var(k), doorState(dataId), doorTier(dataId), deed(id),
                     witnesses(eventId), rumor(anchorId) -> { mainstreamRegions, heat },
                     belief(npcId), beliefCount(state, filter), exposure(audience),
                     tellings(npcId), tellRegions(npcId), writtenSources(npcId) }
EventCtx = 结算点上的事件上下文 { eventId, kind, actor, target, place, tick }
```

| 新触发 | 字段 | 读什么 | 结算点 | 例 |
| --- | --- | --- | --- | --- |
| `cond` | `expr` | 世界变量；表达式用[注册表 5][reg]的文法（`AND`、`OR`、`NOT`、比较、`IN`、`HAS`、`COUNT`），变量必须已登记 | 订阅所引用变量的变化，按脏标记重算 | `territory_autonomy >= 40` |
| `doorState` | `door`、`state`、`tier?`、`first?` | `door_state.<数据 id>`（hidden、hinted、openable、opened、locked、closed）与 `door.<数据 id>.tier`；"任一"写作门族（例：`door_school_*` 二阶），"第一次主动闭门"读千门的 `doors.closed` 事件来源为玩家 | 千门的 `door.opened`、`doors.closed`、`doors.state` 事件（[千门 21.5][td]） | `door_state.last == opened` |
| `witness` | `min?`、`npc?`、`zero?`、`trust?` | 事件结算时认知系统给出的具名目击者列表与清晰度（[认知 3.1][rep]） | 事件结算点（同一 tick 末尾） | 零目击潜入；信任 60 以上者至少四人 |
| `rumorReach` | `anchor`、`regions?`、`heat?` | 认知系统的传闻画像：锚定该事件的版本在 N 个地区是主流，或热度越过阈值（[认知 4.6][rep]） | 传闻网的日结算 | 名伴的名字传到第二座城镇 |
| `belief` | `npc?`、`state`、`count?`、`filter?` | 信念画像的认知状态（无视、怀疑、解释化、动摇、接受、崇拜、敌视，[认知 3.5][rep]） | 认知状态变化事件 | 希雅进入"接受" |
| `exposure` | `audience`、`max` | 观众群体的显露度（隐藏、部分、完全，[认知 6.3][rep]；按历练等级计，[千门 4.7][td]） | 与 `manual` 同在事件结算点 | 显露度"部分"以下取胜 |
| `tellCount` | `npc` | `npc.<id>.tellings` 不低于 1,500，讲述来自至少 2 个地区，至少一份书面来源（[成长 12][pp]） | 讲述数的日结算 | 希雅立名 |

- 判定只读、不抽随机、不写世界；事迹授予由事迹系统写 `deed.<id>` 与 `title.<id>`（[注册表 8.6][reg]），并发 `deed.granted`：千门系统据此判定以事迹为历钥的门（[千门 5.3][td]），客户端的成就映射据此解锁 Steam 成就（2.13）。
- 他人事迹模板的实例存在事迹系统的状态里，键为 `deed_world_<模板>:<npc_id>`，人簿与对方的铭录各写一行。

### 1.4 名望、隐藏与壮举

| 档 | 用于 | 说明 |
| --- | --- | --- |
| 0 | 运气型完成（靠掉落凑齐的收藏）、代价型事迹（记下付出，不奖励付出）、壮举 | 主工程规则 2；代价型是本作补充：交出记忆、开危险之门这类事被记下，但不给分，免得系统奖励玩家伤害自己 |
| 5 | 日常与喜剧的小事 | |
| 10 | 标准事迹 | |
| 25 | 值得讲的事；迷宫的机制挑战；各幕的关键节点 | |
| 50 | 幕级的大事与高难限制 | |

- **隐藏**只给惊喜与剧透两类（主工程规则 8）；隐藏事迹的【真相】一栏写最早揭示幕，得到之前名与描述都不显示。
- **壮举**是可能永久错过的记录（主工程规则 5）：零名望，不计完成度，保留可见。
- **不留永久错过**：抉择型事迹给每个分支各一条，或只记"做了抉择"；同伴死亡或世界状态封死时按主工程 `retroFallbackGrants` 的口径补发或转壮举。
- **分支事迹**（本作补充）：依赖世界分支结果的事迹（例：欧拉平反、边石没有失守、霜胡子活着）与隐藏事迹一样，得到之前不计入完成度的分母；
  分支一旦关上，它在本期显示为"这一期没有发生"，不扣分，留到下一期（回声之门的新周目，只有回收结局进入下一期，[成长 16][pp]）再拿。叙事游戏的分支天然会错过，
  这条规则让"错过"变成记录，而不是缺口。只依赖一次性世界事件的（例：全录之日）直接记为壮举。

### 1.5 称号条目字段

| 字段 | 说明 |
| --- | --- |
| ID、称号 | 称号文本（凡人可见，受台账约束） |
| 授予 | 命名者（2.3）与触发（多为一条事迹，或一个传闻版本） |
| 谁看得见 | 地区、势力、鉴定（有页者的称号栏可被鉴定读出，[力量 2.2][pow]） |
| 称呼与认知 | 对 NPC 称呼与信念画像的影响 |
| 立名 | 对有页者的立名关有无作用；玩家一律"无" |
| 如何失去 | 撤销、褪去、被取代、被加注 |
| 幕 | 最早出现的幕 |

### 1.6 揭示约束（本文自查口径）

| 真相或名讳 | 凡人可见文本可用的说法 | 解锁 |
| --- | --- | --- |
| 第六位女神 | "门口的女人"（梦）、"无名之神"、"她"；钥称"无名之钥" | 第六幕开庭点名（D-053，`a6_name_spoken`） |
| 大断绝、千门都 | "那件事""邪神之乱""荒原下的古城" | `a3_ash_tells_sundering` |
| 空白纪 | "蒙昧时代""圣历以前" | `a3_archive_sealed_room` |
| 无貌者 | "没有脸的人" | `a2_faceless_projection`；本名在 `a5_faceless_named` |
| 第八代勇者 | "老船夫" | `a2_ferryman_reveal` |
| 第九代魔王 | "魔王""第九个" | `a5_demon_king_born`，之后可称"无貌之王" |
| 排澱 | 不得以任何称谓出现 | `a5_truth_purge_cycle` |
| 立名关的计分规则 | 凡人只知道"名字要被人讲" | 第四幕莫伊拉揭开同构之后可由她点破 |
| 澱 | 第一幕凡人用"灰气""灰病""灰晶"（D-030） | 夜羽第一次说出"澱"之后界面切换 |

## 2. 设计规则（A）

### 2.1 三份记录与两个暗读者

| 记录 | 谁写 | 记谁 | 记什么 | 玩家看得见吗 | 在系统里的作用 |
| --- | --- | --- | --- | --- | --- |
| 铭录（录侧称号栏与履历） | 莫伊拉亲手写，或她预设的规则自动写（[力量 2.3][pow]） | 有页者：同伴、NPC、勇者团；有名的魔物写在残页上（异名者） | 等级、技能、称号；履历不对鉴定开放 | 只能看别人的：鉴定读得到称号栏 | 立名关；称号加护；异名者的强化（`rumorScale`，[图鉴 2.7][best]） |
| 布伦手录（第二幕起）与人簿（第四幕起） | 老布伦（`bron`）用手写；第四幕起由人簿官署与国民共同写（[第四幕 4.6][a4]） | 先只记玩家这个"无页之人"，人簿起记全体国民 | 名字、来处、所做之事、所立之约；不记等级与职能 | 是：这就是玩家的事迹簿 | 认知证据（书面）；国家的户籍与征募；第六幕证据 E26 |
| 传闻 | 街头、酒馆、商队、诗人、神职（[认知 4][rep]） | 一切被看见的人与物 | 结构化版本：核心事件、主体、数量、地点、细节、模板 | 是：传闻簿与声望面板 | 俗名与错名的来源；讲述数的来源；神之视线的样本 |

两个暗读者不写字，只读：

| 暗读者 | 读什么 | 用来做什么 |
| --- | --- | --- |
| 千门 | 玩家的事迹本身（不论有没有人看见） | 历钥：门不在乎有没有目击者（2.7） |
| 莫伊拉的客卷 | 第三到第四幕交易起，玩家讲给她的故事与她旁观到的事（[第四幕 7.3][a4]） | 她据此预判玩家，并可能把情报卖给其他女神；第五幕"全录之日"的条件之一 |

**三份记录不必一致。** 玩家在荒原一夜清掉一座澱巢：千门照记（历钥成立）；手录写"自述，未核"；传闻里是"独眼团打残的巢被人捡了漏"；
铭录里什么也没有。玩家把首级带回公会，手录改为"旁证"，传闻开始转向；若巢里救出的猎户是有页者，他的履历上多一行"被无记载者所救"
（玩家对有页者的影响以间接视线出现在铭录里，[力量 8.6][pow]）。

### 2.2 一件事迹的五步

| 步 | 内核做什么 | 玩家看到什么 | 失败或变形 |
| --- | --- | --- | --- |
| 发生 | 战斗与事件日志结算事迹（谁、对谁、多少、在哪），判读表观位阶（[认知 3.2][rep]） | 千门回廊对应门旁出现刻痕（若此事是某门的历钥） | 无：发生了就是发生了 |
| 被看见 | 记录具名目击者与清晰度；零目击也是一种结果 | 无 | 零目击：手录只能记"自述" |
| 被记下 | 手录或人簿按证据分三级入册：亲见（记录者或可信者亲眼）、旁证（证词、物证）、自述（未核） | 事迹簿新增一行，附布伦的批注 | 自述一级可在之后补证升级；永不降级 |
| 被讲述 | 生成锚定该事件的传闻，逐跳失真（[认知 4.3][rep]） | 传闻簿；声望面板的主流说法 | 夸大、主体替换、缩小、模板化 |
| 被命名 | 命名者据主流版本或据事迹本身授称号（2.3） | 称号；NPC 的称呼改变 | 错名（据失真版本命名）、冒名（名不副人） |

### 2.3 命名者

| 命名者 | 给谁命名 | 名字从哪里来 | 写在哪里 | 谁看得见 | 撤销 |
| --- | --- | --- | --- | --- | --- |
| 铭录（莫伊拉） | 有页者与残页（异名者、夜羽） | 自动规则：讲述数越过阈值时，取主流版本按称号模板生成；或莫伊拉以"授称号"动作手写（神力 1 到 5，同对象冷却 7 日，[女神 GM 5.7][gm]） | 称号栏 | 鉴定可读；本人可感 | 不撤销，只加注（2.6） |
| 冒险者公会 | 会员 | 定级与实绩认定；分部长与考官的个人判断 | 公会卡与黑档；玩家的卡永远手工登记 | 出示卡的对象；公会网络 | 降级、除名、黑档备注 |
| 王冠与诸国 | 臣民、外人 | 册封、勋赏、军功 | 诏书、勋章、纹章、座次 | 该国官员与贵族；本国民间 | 剥夺（宫廷结局、叛离、外交破裂） |
| 圣教会 | 信徒与异端 | 封圣、赐名；或定性与烙印（规格外者、异端、魔王的先驱，[认知 5.2][rep]） | 教会文书、通缉令、讲道 | 教国全境与各地礼拜堂；神谕链 | 平反（光之审、证词、全录之日、第六幕终审） |
| 街头 | 任何被谈论的人 | 地区传闻画像里占比最高的模板（[认知 4.6][rep]） | 人嘴里 | 该地区的居民 | 热度衰减、被新版本取代、事实锚压制 |
| 诸族 | 外族 | 各族的认可习俗：兽人摔跤，魔族角位，精灵林名，矮人看断面，半身人转述，龙族不命名 | 各族的口头传统 | 该族 | 违背该族的规矩 |
| 人簿（第四幕起） | 国民（含玩家） | 议事日的众议（众名） | 人簿 | 本国国民；外国人看作"书面" | 议事日撤回（极少） |

### 2.4 称号的三档，以及玩家能戴什么

| 档 | 例 | 来源 | 对有页者 | 对玩家 |
| --- | --- | --- | --- | --- |
| 俗名 | 打退兽潮的 F 级、勇者的挑夫 | 街头与诸族 | 可能被铭录写入（讲述数够时） | 不可选戴；声望面板显示为"人们怎么叫你" |
| 职名 | 实字 B、准男爵、角位、誓蹄之友 | 公会、王冠、教会、诸族、人簿 | 莫伊拉可以把它写进称号栏，但职名本身不推立名 | 可选戴一个，显示在名牌、对话框与人簿抄本上 |
| 传颂级 | 余威所至、认路的乌鸦、苇桥的守夜人 | 只有铭录 | 立名关的唯一钥匙（[力量 3.3][pow]） | 不存在：没有页可写 |

**自报名号。** 玩家戴着的职名在陌生人那里充当身份先验：带印信的职名（诏书、公会卡、人簿抄本）按权威背书计 2 到 4（[认知 3.1][rep]）；
没有印信的说法只是言辞，按言辞可信度检验，检验失败时触发冒名桥段（U2-1 的系统化）。俗名与错名不能自报，只能被人叫。

### 2.5 称呼：认知状态加称号

NPC 叫玩家什么，由他对玩家的认知状态决定，称号只在正式场合覆盖（U3-5 的选择决定领地内的称呼风格）。

| 认知状态（[认知 3.5][rep]） | 镇民与冒险者 | 官员与贵族 | 神职 | 兽人与魔族 |
| --- | --- | --- | --- | --- |
| 无视 | "喂""新来的" | 不搭理 | "孩子" | 不看 |
| 怀疑 | "那个 F 级" | "那位……登记员" | "无记载的那位" | "人族小子" |
| 解释化 | 用当前解释称呼："运气好的那个""捡漏的" | 用职名，语气带引号 | "带着别的东西的人" | 不存在（亲眼即信） |
| 动摇 | 叫名字，不加称呼 | 职名，不带引号 | 沉默或"你" | 不存在 |
| 接受 | "大人""先生"，或当地俗名 | 职名加敬语 | 视立场：名字或定性 | 战称或角位 |
| 崇拜 | "那位"，或最夸大的俗名 | 同上加谦辞 | "圣者"（误读） | "头领" |
| 敌视 | "那个怪物""异端" | 职名后加"之流" | 教会定性 | "懦夫"（只在你藏拙时） |

### 2.6 立名：称号如何推同伴与 NPC 过关

立名关（34 到 35）的条件是铭录写下一个传颂级称号（[力量 3.3][pow]）。本文把"被足够多的人讲述"落成可计算的讲述数，阈值与节奏以[成长 12][pp]为准（C98）：

```
讲述数（对某有页者）= Σ 相信版本 v 的人数（有名 NPC 计 1；人群单元计 份额 × 人口 × 0.1）
                      × 主体系数（主体就是他 1.0；版本已故事化，失真度 ≥ 0.8，0.5；主体被替换 0，记给替换后的主体）
                      × 地区系数（1 个地区 0.5；2 个 0.8；3 个以上 1.0）
立名阈值：讲述数 ≥ 1,500，且讲述来自至少 2 个地区，且至少一份书面来源（歌谣、颂歌纸、告示、手录或人簿）
```

讲述数随传闻网每日结算，记在 `npc.<id>.tellings`（[注册表 8.5][reg]）；达到阈值且经验已满 34 级的有页者，在下一次日检时由铭录写下传颂级称号，破关到 35。
参考量级：小镇级的事一件约 50 到 80，城市级 300 到 500，王国级 800 到 1,500，大陆级 3,000 以上（[成长 12][pp]）。

| 规则 | 内容 | 设计意图 |
| --- | --- | --- |
| 称号文本取主流版本 | 自动授称时，称号文本从称号模板表中按主流版本的核心事件、地点、数量填槽生成，不交给模型自由命名 | 错名的源头：失真版本会被写进神的书 |
| 主体替换转移讲述数 | 版本的主体被替换时，讲述数记到新主体名下（若新主体有页） | "余威所至"让勇者团立名；"其实是玛莎出的手"给玛莎添名 |
| 让别人担名 | 玩家可以在交付、归功、对目击者说话时把事迹的名分让给在场的有页同伴；目击者采信与否仍按认知规则结算 | 藏拙的收益与同伴的成长对齐，也是"放手"主题的个人层 |
| 歌者加速 | 潜质 `bard` 的同伴（芬恩 `fynn`、门歌者塔维 `tavi` 等）讲的版本热度加倍、失真减半；斗场主塔德奥 `taddeo_val` 是帝国最大的放大器 | 歌者潜质的去向（[总纲 9.3][bible]） |
| 关药 | 颂歌纸 `cs_ballad_sheet` 给一件真实事迹在一个地区的讲述热度 +3，持续一季；立名宴 `cs_naming_feast` 把被宴请者的一件事迹播到每位宾客的家乡（[成长 8.3][pp]）；两者都不能伪造事迹 | 立名是可以经营的，但故事必须是真的 |
| 善恶不论 | 恶名的讲述数照算；屠村的命令写在执行者的页上 | 玩家的选择有人替他背 |
| 只加注，不擦除 | 被事实锚证伪的传颂级称号加注"存疑"或"不实"：位阶不退，称号加护失效，听者对他的敬意按证伪幅度下降 | 铭录只追加（书记官不烧书）；位阶回退会改页，属于神约第三条的重事 |
| 称号加护 | 莫伊拉可以给传颂级称号附一层称号加护（I 到 II 级，[力量 6.2][pow]），代价是此人成为她的视线锚 | 同伴得到小而独特的效果，玩家身边多一双她的眼睛 |
| 残页与例外 | 异名者的称号写在残页上（[图鉴 2.7][best]）；夜羽的残页被契约之门部分覆写（D-052），称号照写，鉴定仍只显示"残页，Lv ？" | 统一规则，保留正典的特例 |
| 勇者的捷径 | 圣教到处传颂勇者，"传颂级来得极快"（[力量 10.4][pow]）；本文按讲述数规则自然成立，不另设特权 | 勇者与同伴的对照：一个靠教会的嘴，一个靠玩家的手 |

**示例：苇桥。** 葛蕾特·铁栏在 968 年独守苇桥一夜，传颂里成了"苇桥之盾"的是赶来的小领主之子（主体替换）；她的讲述数是零，卡在 34 三十年
（[迷宫目录 6.8][dgc]）。玩家过桥获胜后把她的故事讲出去：一位 `bard` 同伴唱，或玩家自己的传闻带着她的名字走；讲述数够了，铭录给她写下
`title_named_grete`，她到 35。同一刻，小领主之子的"苇桥之盾"被加注"存疑"，他的家族名声塌了，洛萨贵族里多一个记恨玩家的人。

### 2.7 事迹即历钥

门读事迹，不读名望，也不读目击者（[千门 5.3][td]）。下表是正典门（[力量 9.9][pow]）与[门目录][drs]里由本文事迹承载的钥；剧情必开的门只用时钥，事迹从不卡主线（[任务与事件 3.4][qe]）。
作历钥的分支事迹必须有替钥（内容校验检查）；事迹被门读作钥的那一刻，回廊里那扇门旁出现一道刻痕。

| 门 | 钥的组合（正典） | 本文事迹承担的钥 |
| --- | --- | --- |
| 观澜之门 `door_tide_sight` | 历钥：初见守门人时保持清醒 | `deed_grow_stand_before_ash` |
| 刃之门 `door_vocation_warrior` | 缘钥、历钥 | 历钥 `deed_grow_first_stance` |
| 猎之门 `door_vocation_hunter` | 缘钥、历钥 | 历钥 `deed_grow_lone_track`；物钥 `split_ear_fang` 由 `deed_rare_split_ear` 记录 |
| 契约之门 `door_pact` | 历钥、择钥 | 历钥 `deed_grow_spared` |
| 识才之门 `door_talent_sight` | 缘钥、历钥 | 历钥 `deed_grow_underestimated`；缘钥的进度由 `deed_bond_first_believer` 记录 |
| 门内庭院 `door_inner_garden` | 时钥、历钥 | 历钥 `deed_grow_dream_door` |
| 收放之门 `door_restraint` | 历钥、择钥 | 历钥 `deed_grow_leak_and_hold` |
| 伪录之门 `door_false_record` | 历钥、物钥 | 历钥 `deed_mortal_new_crystal` 与 `deed_mortal_second_crystal`（"鉴定接连失败"） |
| 影之门 `door_vocation_rogue` | 历钥或缘钥 | 历钥 `deed_grow_unseen_exit` |
| 祷之门 `door_vocation_priest` | 择钥、历钥 | 历钥 `deed_grow_unnamed_prayer` |
| 筑庐之门 `door_settlement` | 历钥、地钥 | 历钥 `deed_mgmt_old_watch_refuge` |
| 行路之门 `door_wayfaring` | 物钥、地钥 | 地钥记录 `deed_exp_gatesite_pair`、`deed_exp_gatesite_third` |
| 信使之门 `door_messenger` | 物钥、缘钥 | 物钥记录 `deed_col_yeyu_memories` |
| 誓光之门 `door_vocation_paladin` | 择钥、历钥 | 历钥 `deed_grow_kept_vow` |
| 千军之门 `door_thousand_legions` | 缘钥、历钥 | 历钥 `deed_war_first_defense` |
| 残响之门 `door_echoes` | 地钥、识钥 | 识钥记录 `deed_truth_ash_sundering` |
| 澄流之门 `door_clear_flow` | 地钥、缘钥 | 地钥记录 `deed_dg_root_sorrow_sapling` |
| 共鸣之门 `door_resonance` | 缘钥、地钥 | 缘钥进度 `deed_dg_waterway_none_missing`；辅助 `deed_col_doorsong` |
| 立国之门 `door_founding` | 地钥、缘钥、物钥，自治度不低于 40（D-044） | 众愿 `deed_mgmt_register_3000`；自治度 `deed_mgmt_autonomy_40` |
| 名讳之门 `door_true_name` | 识钥 | 识钥记录 `deed_truth_name_spoken` |
| 晚钟之门 `door_bond_martha`、铁卫之门 `door_school_warrior_prot` | 门目录 | 历钥 `deed_bond_trial_martha` |
| 斩伐之门 `door_school_warrior_arms` | 门目录 | 历钥 `deed_bond_trial_emperor`（负时的剑理） |
| 关门之门 `door_bond_ash`、撑渡之门 `door_bond_ferryman` | 门目录 | 历钥 `deed_bond_trial_ash`、`deed_bond_trial_ferryman` |
| 双脉之门 `door_dual_pulse`、汤与铃之门 `door_combo_warrior_rogue` | 门目录 | 历钥 `deed_grow_two_arts`；缘钥 `deed_bond_soup_and_bell` |
| 生业之门 `door_craft_` 十四扇 | 门目录（层一到层六） | 历钥 `deed_mgmt_craft_first_masterwork`、`deed_mgmt_craft_outer_edge` |
| 兽群、掘脉、哑碑、门港、遮页、空白之门 | 门目录 | 异名者事迹记录的历钥候选与物钥（3.3） |
| 离手之门 `door_release`、回声之门 `door_recall` | 门目录（力量 9.9 的候选门） | 离手不由事迹作钥（`deed_grow_closed_door` 只是伏笔）；回声由 `deed_feat_next_cycle` 记录 |

"记录"的意思是：地钥、物钥、识钥本身由到达、持有、得知判定，事迹只是把那一刻写进事迹簿，不额外加钥；历钥则由事迹本身充当。

### 2.8 玩家得到什么，得不到什么

| 得到 | 规则 | 上限 |
| --- | --- | --- |
| 认知 | 事迹入册即成证据：亲见级按目击计，旁证级按物证或证词计，手录本身计书面 1；奥托 `krause` 为推荐信背书后计 2；人簿对本国国民计权威背书 3，对外国人计书面 1 | 受[认知 4.5][rep]的误会上限与喜剧节流约束 |
| 称呼 | 2.5 表；职名在正式场合覆盖 | 无 |
| 门的钥 | 2.7 表 | 门的效果由门决定，事迹本身不给数值 |
| 庭院陈列 | **记事柱**：门内庭院里一根木柱，玩家选至多 7 条事迹刻上去；来访的有页同伴会读，夜羽会评价；纯外观 | 7 格（扩建 IV 后 12 格） |
| 收藏完成 | 收藏的完成奖励只有外观、认知、门钥三类（[遗物 1.7][rel] 第 6 条） | 遗物目录的钳制 |
| 名器的器痕 | 与某件精品相关的事迹称号给该件器痕 20（[装备 2.8][eqc]） | 器痕只记在实例上，开锋仍要名匠 |

**得不到的：** 属性、伤害、治疗量、经验倍率、掉落率。称号对玩家没有任何加护（无页之身只能接受附物加护，那是物品不是称号）。
同伴的称号加护是莫伊拉对有页者的写入，不经玩家之手。

### 2.9 阴面：恶名、错名与烙印

| 种类 | 怎么来 | 作用 | 怎么去 |
| --- | --- | --- | --- |
| 恶名 | 真实的坏事：屠戮降者与平民、违背契约（凡人违约的标签为"失信"，D-047）、掘冢、强夺名器 | 价格、招募、卫兵盘问、挑战者（[认知 5.3][rep]）；有页的执行者在铭录里背上恶名 | 赔偿与归还；人簿的裁决；时间不能洗掉恶名，只能让它变冷 |
| 错名 | 失真的传闻：冒名、带衰、贿赂来的 B、魔女同谋、大当家 | 同上，外加冒名桥段 | 亲眼目睹、事实锚（公告、审判、告示）、更强的新版本；当事人急着否认会越描越黑（[认知 4.4][rep]） |
| 烙印 | 机构定性：规格外者、异端、魔王的先驱、带门之瑕者 | 审判、通缉、圣战目标；教会成员的权威背书反向 | 机构的反转：光之审的平反、赛琳的证词、全录之日、第六幕终审 |

恶名与错名都走与正名相同的管线，所以玩家能用同样的工具对付它：制造可复现的证据、请权威作证、出示手录、或者干脆让它在荒原里变冷。

### 2.10 名望、计数与反刷

1. 名望只做两件事：事迹簿上的记功总数（布伦："这个人干了多少活"），以及第 6.2 节的价值审计。它不进任何门、价格或认知公式。
2. 记录结果，不记尝试（主工程规则 6）：死亡、失败、反复挑衅不给分；喜剧事迹的触发是"桥段走完"，不是"被嘲笑了几次"。
3. 纯计数事迹全目录只留 1 条（`deed_hunt_thousand`），名望 5；凡是数字门槛，必须同时写明它让谁信了什么或开了什么。
4. 运气型完成（例：异名者战利墙）零名望；代价型事迹零名望并隐藏；壮举零名望不计完成度。
5. 传闻不能刷：讲述数只来自锚定真实事件的版本（[认知 4.5][rep]），颂歌纸与立名宴核对事迹记录，假事迹无效。

### 2.11 事迹簿的界面随幕变化

| 幕 | 事迹簿叫什么 | 谁的笔迹 | 说明 |
| --- | --- | --- | --- |
| 序章到第一幕 | 门旁的刻痕 | 无 | 千门回廊里，事迹以刻痕出现在它所钥的门旁；没有钥意义的事迹暂存为"未记之事" |
| 第二幕到第三幕 | 布伦手录 | 布伦的手写，带批注 | 布伦开始写手录时把第一幕补录一遍（主工程 `retro: true` 的世界观版本）：他亲见的记"亲见"，听来的记"旁证"或"自述" |
| 第四幕到第五幕 | 人簿·第一页 | 人簿官署的楷书，布伦是首任人簿官 | 玩家这个无页之人第一次有了一页，是国民给的（[第四幕 4.6][a4]）；国民的事迹也入簿，他人事迹模板（3.14）从这里显示 |
| 第六幕 | 人簿（呈堂） | 同上 | 运转一年以上的人簿是证据 E26（[台账 7][rl]） |

### 2.12 降级档与 AI 边界

事迹的判定、入册、讲述数、称号文本全部由内核与模板决定（D-010）。模型只负责布伦的批注、NPC 念出称号时的口吻与即兴台词；
模型不能授予事迹、不能改称号文本、不能把台账未解锁的真相写进批注。无模型时，批注与称号都用预写模板（带人名、地点、数量的插槽）。

### 2.13 Steam 成就：由事迹规则生成

成就表由生成器从本目录导入的事迹数据、幕次表与结局表生成，不手挑；规则以[发行工程 4.2][re]为准，本目录只承担"事迹这一侧"的口径：

| 规则 | 内容 |
| --- | --- |
| 大事迹（C 组） | 名望 50 的事迹全部映射，API 名 `HK_DEED_<事迹 ID 去掉 deed_ 前缀并大写>`，全部设为隐藏成就。本目录的名望 50 事迹定为 17 条（6.1）；增删名望 50 的事迹会改变成就总数（全作 51 个），须同步发行工程 4.2 |
| 类满页（D 组） | 十一个可计类（成长、讨伐、异名者、迷宫、探索、收藏、社交与羁绊、经营、战争、诸神、凡人不信）各一个，`HK_BOOK_<类码大写>`；全簿一个 `HK_BOOK_ALL` |
| 分母 | 按 1.4 节：不含隐藏、壮举、未发生的分支；也不含名望 0 的运气型与代价型事迹（成就不奖励玩家伤害自己） |
| 不映射 | 壮举（`feat`）、分支事迹、他人事迹（`world`）、只由模型输出决定的结果 |
| 揭示水位 | 非隐藏成就的名字与描述用事迹名与"做了什么"，必须通过第一幕开局水位的泄露扫描；标"隐"的事迹一律映射为隐藏成就 |
| 无模型 | 任何成就在无模型档都能达成（D-010） |
| 图标 | 达成图来自提示词库的 `art_ico_ach_<slug>`，64 乘 64 |

## 3. 事迹（B）

类码与主工程分类的对照（主工程 `DeedCategory` 只作参照，本作的事迹系统独立实现）：

| 节 | 类 | 类码 | 主工程对照 | 本作的意义 |
| --- | --- | --- | --- | --- |
| 3.1 | 成长 | `grow` | `progression` | 无页之身的成长就是开门：本类事迹大多是正典门的历钥 |
| 3.2 | 讨伐 | `hunt` | `combat` | 首领、澱涌之主、剧情战；喂认知与传闻 |
| 3.3 | 异名者 | `rare` | `combat`（稀有） | 40 只异名者各一条；核心动作是"落名" |
| 3.4 | 迷宫 | `dg` | `dungeon` | 23 座迷宫的机制与抉择 |
| 3.5 | 探索 | `exp` | `exploration` | 碑、门址、地界 |
| 3.6 | 收藏 | `col` | `collection` | 收藏完成与收藏附带的称号 |
| 3.7 | 社交与羁绊 | `bond` | `social` | 同伴、隐藏强者、可挑战段、兽伴、同伴立名 |
| 3.8 | 经营 | `mgmt` | 无 | 村落、领地、国家、制度、匠人五关 |
| 3.9 | 战争 | `war` | 无 | 会战、战线、外交大事 |
| 3.10 | 诸神 | `god` | 无 | 与女神打交道；代价型事迹在这里 |
| 3.11 | 真相 | `truth` | `hidden` | 台账的大揭示；大多隐藏 |
| 3.12 | 凡人不信 | `mortal` | 无 | 喜剧桥段走完的那一刻 |
| 3.13 | 隐藏与壮举 | `hid`、`feat` | `hidden`、`feat` | 惊喜、剧透与可能错过的记录 |
| 3.14 | 他人事迹 | `world` | 无 | NPC 的事迹模板：立名、出师、守桥 |

**落名**（本文定义）：把异名物或证物交给公会、受害者或当事人，或在目击者面前完成送魂、净化、驯服，使锚定这只异名者的传闻"落地"。
落名之后名字终止，不再被继名者继承（[图鉴 2.7][best] `nameInherit`）。异名者事迹一律以落名为触发，而不是以击杀为触发：
杀了而无人知道，名字还会活下去。

### 3.1 成长（`deed_grow_`）

| ID | 名 | 触发 | 名望 | 奖励 | 喂给 | 通道 | 隐 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deed_grow_registered` | 无记载，F 级 | `flag:a1_guild_registered` | 5 | 称号 `title_guild_f_handwritten` | 手录第一行（布伦补录为"亲见"）；认知：公会职员对鉴定的信任成为第一份反证 | cog、collect | | 一 |
| `deed_grow_stand_before_ash` | 在灰里站住了 | `flag:a1_ash_met` 且 `manual`：初见时的威压判定通过 | 10 | 无 | 门：`door_tide_sight` 历钥；认知：阿什那一眼在第三幕回扣为宽恕（C3-2） | key、story | | 一 |
| `deed_grow_first_stance` | 学来的架势 | `manual`：向持职战士（葛恩 `gorn` 或巴托 `barto`）求教后，用所学架势赢下一场真刀真枪的战斗 | 10 | 无 | 门：`door_vocation_warrior` 历钥 | key、bond | | 一 |
| `deed_grow_lone_track` | 独猎 | `manual`：无同伴在队，独力追踪并猎获一头异兽 | 10 | 无 | 门：`door_vocation_hunter` 历钥；认知：东坡猎户的常识上限升一档 | key、cog | | 一 |
| `deed_grow_spared` | 手下留命 | `manual`：击败一头被灰气侵蚀的生灵后选择不杀 | 10 | 无 | 门：`door_pact` 历钥（择钥由抉择本身判定） | key、bond | | 一 |
| `deed_grow_underestimated` | 被低估者的一刻 | `manual`：亲眼看见一名被低估者的决定性一刻（罗恩 `ron`、伊莎 `isa`、诺伊 `noi` 等写定场景之一） | 10 | 无 | 门：`door_talent_sight` 历钥 | key、bond | | 一 |
| `deed_grow_dream_door` | 门口的女人 | `flag:a1_dream_door_woman` | 10 | 记事柱一格 | 门：`door_inner_garden` 历钥 | key、story | | 一末 |
| `deed_grow_leak_and_hold` | 漏了，又收住 | `manual`：一次因灵压外泄被人看穿；之后 新·`exposure`：在同一观众群体显露度"部分"以下赢下一场战斗 | 10 | 无 | 门：`door_restraint` 历钥 | key、cog | | 二 |
| `deed_grow_unseen_exit` | 全身而退 | 新·`witness`：零目击地潜入一处戒备之地并离开 | 10 | 无 | 门：`door_vocation_rogue` 历钥 | key | | 二 |
| `deed_grow_unnamed_prayer` | 不献名的祈求 | `manual`：在神殿之外为他人真心祈求，且没有念任何女神的尊名（[女神 GM 6.3][gm]） | 10 | 无 | 门：`door_vocation_priest` 历钥；认知：在场者的解释库命中"神迹"却找不到神 | key、divine | | 二 |
| `deed_grow_two_arts` | 两门一战 | `manual`：两扇资源不同的职能门已开，同一场战斗里把两种资源都用到见底并取胜 | 10 | 无 | 门：双脉之门 `door_dual_pulse` 初阶的历钥（[门目录][drs]） | key、power | | 二 |
| `deed_grow_kept_vow` | 无人祈祷之处的誓 | `manual`：在没有任何人为你祈祷的地方以自己的名义立誓守护，誓约期满且被守护者存活 | 25 | 记事柱一格 | 门：`door_vocation_paladin` 历钥；认知：被守护者进入"接受" | key、bond | | 三 |
| `deed_grow_doors_ten` | 十扇门 | `meter:doors_opened >= 10` | 5 | 无 | 认知：阿什在 `a3_ash_warning_doors` 那一场里会提到"你已经开了十扇门"（台词分支，不改该标记的触发）；事迹簿从此附一栏封印的账 | story、key | | 二 |
| `deed_grow_closed_door` | 门是可以关上的 | 新·`doorState`：第一次主动把一扇已开的门关上 | 25 | 记事柱一格 | 门：离手之门 `door_release` 的伏笔（它的钥是识钥与择钥，本事迹不作钥）；认知：`a3_ash_relation` 稳固 | key、story | | 三 |
| `deed_grow_beyond_sixty` | 刻度之外 | `meter:door_rank >= 61`，且 `act >= 5`（门镜第五幕才刻出 60 以上，[千门 4.3][td]） | 25 | 无 | 认知：门镜第一次显示一个铭录写不下的数；夜羽与阿什的对话分支 | story | 隐 | 五 |
| `deed_grow_first_signature` | 第一招奥义 | 新·`doorState`：任一流派之门（`door_school_*`）到二阶 | 10 | 无 | 认知：教奥义的那位师傅在本地开始讲"那个无记载者学会了"；二十七扇流派进阶的汇总记录（门目录不逐门立事迹） | power、cog | | 三 |
| `deed_grow_three_schools` | 三派同修 | 新·`doorState`：同一职能门下三扇流派之门的初阶都已开 | 25 | 记事柱一格 | 认知：三位师傅的传人互相听说了你（凡人一生一职，做不到）；当架切换的教学对话（[千门 9.5][td]） | power、cog | | 四 |
| `deed_grow_first_combo` | 两个人教的一招 | 新·`doorState`：任一合技之门（`door_combo_*`）已开 | 10 | 无 | 认知：教这一招的两位搭档对你的信念画像加"接得住"；十五扇合技的汇总记录 | power、bond | | 三 |

- `deed_grow_beyond_sixty`：【真相】门阶可以越过铭录上限 60（[力量 9.2][pow]），玩家最终抵达的是"超越"（[力量 3.1][pow]）；第五幕之前不出现在任何文本中。

### 3.2 讨伐（`deed_hunt_`）

| ID | 名 | 触发 | 名望 | 奖励 | 喂给 | 通道 | 隐 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deed_hunt_first_grey` | 第一张灰斑狼皮 | `stat:kills >= 1`（灰化野兽）且剥下一张完整狼皮 | 5 | 无 | 认知：BE-01 的第一份证据（[图鉴 8.2][best]）；欧拉婆婆教"净"字的引子 | cog、sed | | 一 |
| `deed_hunt_tide_night` | 兽潮之夜 | `flag:a1_beast_tide_cleared` | 25 | 无 | 称号：`a1_tide_credit`（别名 `rumor.tide_attribution`）为 `player` 时授 `title_street_tide_f`；认知：伯爵来信的措辞（[第一幕 9.4][a1]） | cog、war | | 一 |
| `deed_hunt_colossus_seen` | 巨像不是自己塌的 | `quest:A1-M12` 且 新·`witness`：巨像战具名目击者中信任 60 以上者至少四人 | 25 | 无 | 认知：传闻版本"那个 F 级打退了兽潮"成立；罗恩、希雅、伊莎、格蕾塔成为第一传播者 | cog | | 一 |
| `deed_hunt_rat_king` | 百尾鼠王 | `quest:A2-M02` 的讨伐段 | 10 | 称号 `title_guild_b_real` | 认知：雷纳德 `reynard` 的"作弊"解释被推翻 | cog | | 二 |
| `deed_hunt_redfang_round` | 第一回合 | `manual`：霜脊堡之战中与萨莎 `sasha` 交手，撑到她说"第一回合" | 25 | 无 | 认知：`a3_sasha_interest`；`trial_sasha_third_round` 的前置 | cog、bond | | 三 |
| `deed_hunt_dawnpillar` | 打断曙光 | `manual`：苇桥第四阶段打断举柱者，或在净化之光下撑过（`archbishop_dawnpillar`） | 25 | 无 | 认知：E36 越约的蚀痕 `a3_eluen_violation` 为 witnessed 的条件之一 | story、cog | | 三 |
| `deed_hunt_surge_ashstorm` | 风眼里站着 | `manual`：击败灰暴之心 `ashstorm_heart` | 25 | 无 | 经营：玻璃原到灰海的拾荒路可走一季；收藏：古澱高档澱源材入 `col_six_fingerprints` | manage、collect | | 三 |
| `deed_hunt_surge_frostbell` | 冰钟停了 | `manual`：击败冻铃夜哭 `frostbell_dirge` | 25 | 无 | 军需：北境冻铃河谷的冬季补给线；认知：BE-06 的旁证 | war、cog | | 三 |
| `deed_hunt_surge_blades` | 万刃归鞘 | `manual`：击败万刃冢 `ten_thousand_blades` | 25 | 无 | 认知：帝国巡逻队对你的身份先验升一档；断剑会注意你 | cog | | 四 |
| `deed_hunt_surge_bonecrown` | 骨冠落地 | `manual`：击败骨冕蝗云 `bonecrown_swarm` | 25 | 无 | 经营：风牙诸部一季免蝗；认知：诸部把你算作兽王会盟的一方 | manage、cog | | 四 |
| `deed_hunt_surge_goldtide` | 潮水吐出了钱 | `manual`：击败吞金潮 `goldtide_maw` | 25 | 无 | 经济：被吞的钱按比例回到盐户手里；认知：金湾盐户的画像转向你（经济战的民心） | econ、cog | | 四 |
| `deed_hunt_surge_redhorn` | 角潮退去 | `manual`：击败红角潮主 `redhorn_tide` | 25 | 无 | 军需：赤角山地的隶民村一季免于征召；认知：夜后派对你的信任 | war、bond | | 四末 |
| `deed_hunt_surge_rotcrown` | 花谢了 | `manual`：击败腐冠花潮 `rotcrown_bloom` | 25 | 无 | 澱：枯环外缘的泉水不再发苦；认知：精灵对外族的戒备降一档 | sed、bond | | 五 |
| `deed_hunt_surge_pale_choir` | 唱诗停了 | `manual`：击败白瓷圣咏 `pale_choir` | 25 | 无 | 认知：瑟兰下城的节庆之夜不再死人；`col_pale_reliquary` 的旁证 | cog、story | | 四末到五 |
| `deed_hunt_surge_mortal` | 涌潮里的凡人 | 新·`tellCount`：一名有页同伴或雇员在澱涌之主战中补上最后一击或得到名器，其讲述数因此越过阈值 | 25 | 无 | 立名：生成他人事迹 `deed_world_surge_last_blow`，称号模板 `title_named_surge_slayer`（澱涌之主是"凡人立名的机器"，[迷宫目录 4.1][dgc]） | cog、bond | | 三 |
| `deed_hunt_thousand` | 一千 | `stat:kills >= 1000` | 5 | 无 | 全目录唯一的纯计数，封顶（2.10） | collect | | 三 |

### 3.3 异名者（`deed_rare_`）

| ID | 名 | 触发（落名的方式） | 名望 | 奖励 | 喂给 | 通道 | 隐 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deed_rare_split_ear` | 裂耳落名 | `collectItems:[split_ear_fang]`，交公会领赏 | 10 | 无 | 门：`door_vocation_hunter` 物钥（正典）；认知：东林猎户 | key、cog | | 一 |
| `deed_rare_black_ridge` | 博罗没有冲过去 | `manual`：兽潮第一波中击倒黑脊 `black_ridge`，且博罗 `boro` 存活 | 10 | 无 | 认知与羁绊：熊族（葛恩、博罗）对你进入"接受"；`black_ridge_mantle` | bond、cog | | 一 |
| `deed_rare_red_sock` | 红袜子回家了 | `manual`：把 `nm_faded_red_sock` 赠给西田磨坊人家的孩子 | 10 | 无 | 羁绊：西田磨坊人家莲娜·马勒 `lene_mahler` 一家（[人物一 3.6][chl]）；认知：西田农户把红布挂回去 | bond、cog | | 一 |
| `deed_rare_three_toes` | 接住的角 | `manual`：净化三趾 `three_toes`，希雅接住它脱落的灰角 | 10 | 无 | 门：兽群之门 `door_school_hunter_beast_mastery` 的历钥候选（把一头二级异兽净化回野兽）；羁绊：`trust.shiya` | key、bond | | 一到二 |
| `deed_rare_bell_weeper` | 旧哨的钟又响了 | `manual`：重挂村钟后和平送魂哭钟 `bell_weeper` | 10 | 无 | 经营：`nm_oldwatch_clapper` 挂回旧哨村哨塔；认知：行商不再绕路 | manage、cog | | 一到二 |
| `deed_rare_ironbelly` | 一车铁 | `manual`：讨伐铁胃 `ironbelly`，把 `nm_ironbelly_gizzard` 嵌进领地冶炼坊 | 10 | 无 | 经营：铁锭产出；门：掘脉之门 `door_craft_mining` 高层的辅钥 | manage、key | | 一到二 |
| `deed_rare_frostbeard` | 活着的号角 | 新·`cond`：霜胡子 `frostbeard` 存活至第三幕末，且它的嚎声至少一次给北境预警 | 25 | 无 | 军需：夜境调兵的活预警；认知：黑橡堡哨兵 | war、cog | | 三 |
| `deed_rare_oakwall_warden` | 守夜人下哨 | `manual`：送魂黑橡守夜人 `oakwall_warden` | 25 | 无 | 叙事：他的口令；认知：BE-06 | story、cog | | 三 |
| `deed_rare_pale_bishop` | 座堂的老鼠 | `manual`：把 `nm_porcelain_incisor` 交学院对照 | 10 | 无 | 认知：BE-04（第二幕注意到，第四幕对照） | story、cog | | 三 |
| `deed_rare_toll_taker` | 铜狗牌回家 | `manual`：把 `nm_brass_dog_tag` 还给边石镇的遗孀薇尔玛 `wilma_ascher` | 10 | 无 | 认知：灰路走私者对你中立；门：影之门 `door_vocation_rogue` 的认可线（门目录口径）；收藏：`col_restitution_ledger` 一笔 | cog、bond | | 一到二 |
| `deed_rare_old_louse` | 老虱的肚子 | `manual`：讨伐晶沟老虱 `old_louse`，把腹晶给掘手看 | 10 | 无 | 认知：掘手不再把老虱腹晶与晶沟深处那块大晶弄混，你不会被引到错的地方 | cog、craft | | 一到二 |
| `deed_rare_ashstorm_shepherd` | 跟着口哨走 | `manual`：不攻击赶灰的 `ashstorm_shepherd`，跟随口哨走出灰暴，抵达被埋的门址 | 10 | 无 | 门：`door_wayfaring` 进阶的地钥记录；收藏：`nm_bone_whistle` | key、collect | | 二 |
| `deed_rare_glass_bride` | 婚礼那一夜 | `manual`：送魂玻璃新娘 `glass_bride`，对上戒指内圈的日子 | 25 | 无 | 认知：BE-09；收藏：`nm_glass_sealed_ring` | story、collect | | 三 |
| `deed_rare_late_courier` | 信送到了 | `manual`：跟迟到的信使 `late_courier` 跑完四座门站，把 `nm_undelivered_letter` 送到外环那一户 | 25 | 无 | 门：行路之门的坐标候选；收藏：`col_unsent_letters` | key、collect | | 三 |
| `deed_rare_cross_shovel` | 坑底没有圣光 | `manual`：讨伐十字铲 `cross_shovel`，把铲柄的教会印交给学者 | 10 | 无 | 认知：BE-07 | story、cog | | 三 |
| `deed_rare_thousand_lamps` | 千灯熄 | `manual`：讨伐千灯 `thousand_lamps` | 25 | 无 | 收藏：`nm_last_gate_lamp`（门目录不为它单立门）；认知：外环"千灯亮的那条街，门还会开"被证伪一半 | key、sed | | 三 |
| `deed_rare_stilled_hammer` | 停手的人 | `manual`：送魂停锤者 `stilled_hammer` | 25 | 无 | 认知：拓第六碑清晰度加一档（E08）；门：哑碑之门 `door_stele_mute` 的物钥 `nm_unstruck_chisel` | story、key | | 五 |
| `deed_rare_vesper_sister` | 第七钟的姐妹 | `manual`：在七钟修院封死的下层地窖听完晚祷修女 `vesper_sister` 的段落 | 25 | 无 | 认知：你知道教会正史原本藏在哪（证人 `ilsa_moen` 的传唤线索，E07 第十页的旁证） | story | | 四 |
| `deed_rare_shadowless` | 光自己养的狗 | `manual`：替圣骑士团清剿无影 `shadowless` | 25 | 无 | 认知：圣骑士团对你敬疑参半；誓蹄线（`edmond_lacroix`）的前置之一 | cog | | 四 |
| `deed_rare_procession_tail` | 巡礼的尾巴 | `manual`：取得巡礼车的封条 `nm_procession_seal` | 10 | 无 | 认知：BE-24；E35 旁证候选 | story、cog | | 四 |
| `deed_rare_old_legate` | 替长垒点完名 | `manual`：用帝国军籍册替老营长 `old_legate` 点完名 | 10 | 无 | 军需：`nm_rollcall_board`；认知：长垒戍兵 | war、cog | | 四 |
| `deed_rare_first_page` | 没被开除 | `manual`：在斯克里瓦旧讲堂听完第一页 `first_page` 念的那一句 | 10 | 无 | 认知：BE-15，E14 星表一线的旁证；门：空白之门 `door_truth_blank_era` 的物证线（门目录口径） | story、key | | 四 |
| `deed_rare_crowd_favorite` | 放生欢呼 | `manual`：活捕欢呼 `crowd_favorite` 后放生，不卖回斗场 | 10 | 无 | 羁绊；认知：斗场主 `taddeo_val` 不悦，但从此知道你不卖 | bond、cog | | 四 |
| `deed_rare_hiltless` | 刃尖指北 | `manual`：持 `nm_hiltless_shard` 抵达眠鳞北麓的无名石冢 | 25 | 无 | 认知：BE-21；E13（堕勇之墓）的取得途径之一 | story、key | | 四到五 |
| `deed_rare_old_scale` | 过秤 | `manual`：用老秤的秤盘 `nm_old_scale_pan` 当众识破一枚伪币 | 10 | 无 | 门：契眼之门 `door_trial_merca` 的同向（门目录不为它单立门）；认知：金湾账房伙计 | key、econ | | 四 |
| `deed_rare_fat_goldbay` | 印戒还主 | `manual`：把 `nm_swallowed_signet` 交还失主（金湾一家商行的掌柜，无名居民模板具名化） | 10 | 无 | 认知：失主的人情（经济战）；收藏：`col_restitution_ledger` 一笔 | econ、cog | | 四 |
| `deed_rare_the_clerk` | 不欠账的客人 | `manual`：身上没有任何违约契约时击败账房先生 `the_clerk` | 10 | 无 | 认知：BE-19 | cog | | 四 |
| `deed_rare_wreck_bell` | 门港的编号 | `manual`：讨伐沉钟 `wreck_bell`，取得 `nm_harbor_master_chain` | 25 | 无 | 认知：BE-17；门：门港之门 `door_site_harbor` 的物钥（与门港石 `ky_gatestone_wreck_bay` 互证） | story、key | | 四 |
| `deed_rare_mossback` | 没有杀的熊 | `manual`：应精灵之请净化苔背老爷 `mossback` | 10 | 无 | 羁绊：精灵好感；认知：银苔的孩子 | bond、sed | | 四 |
| `deed_rare_the_gardener` | 园丁的种荚 | `manual`：讨伐园丁 `the_gardener`，把 `nm_gardener_pod` 种进领地或投入一件杰作 | 10 | 无 | 经营与澱的取舍：产量翻倍、地块澱值上升；认知：药草师的玩笑话"园丁种出的月苔药效翻倍"成真 | manage、sed | | 四 |
| `deed_rare_ring_whisperer` | 第一张蝗蜕 | `manual`：经精灵许可取走 `nm_first_molt` | 25 | 无 | 认知：BE-20（断代到圣历二世纪） | story | | 五 |
| `deed_rare_whitehorn` | 白角的角鞘 | `manual`：驯服白角 `whitehorn`，或在兽王之争中出示 `nm_whitehorn_sheath` | 25 | 无 | 认知：风牙诸部立场变动；兽王之争的筹码 | cog、war | | 四 |
| `deed_rare_thousand_mouths` | 千口散了 | `manual`：夏末之前清掉千口 `thousand_mouths` | 10 | 无 | 经营：下一季不起蝗潮；认知：诸部"千口来的那年要死一个王"没有应验；`nm_swarm_queen_wing` | manage | | 四 |
| `deed_rare_barrow_grandmother` | 守冢婆不骂了 | `manual`：以萨满仪式送魂守冢婆 `barrow_grandmother` | 10 | 无 | 认知：BE-23；萨满信任 | story、bond | | 四 |
| `deed_rare_frosthorn_steed` | 小主人的鞍环 | `manual`：驯服霜角的坐骑 `frosthorn_steed` | 25 | 无 | 认知：BE-23；夜境鬼人老人 | story、cog | | 四 |
| `deed_rare_half_face` | 半张脸 | `manual`：讨伐半张 `half_face` | 25 | 无 | 认知：BE-22；门：遮页之门 `door_false_record_deep` 的物钥 `nm_half_mask` | story、power | | 四到五 |
| `deed_rare_ninety_nine` | 第一百场 | `manual`：一对一击败九十九 `ninety_nine` | 10 | 无 | 诸神：瓦尔妲注意；认知：魔族认可，`title_tribe_night_hornseat` 的辅证 | divine、cog | | 四 |
| `deed_rare_tomb_keeper_wolf` | 喂了三次 | `manual`：喂食三次驯服守冢狼 `tomb_keeper_wolf`，不动石冢 | 10 | 无 | 认知：E13 的引子；北麓山民 | story、bond | | 四到五 |
| `deed_rare_red_freckle` | 一桶酒的路 | `manual`：讨伐或驱走红雀斑 `red_freckle`，把 `nm_freckled_scale` 交给龙族 | 10 | 无 | 认知：龙族信任；云阶隘商路 | cog、econ | | 四 |
| `deed_rare_scale_orphan` | 逆鳞的去处 | `manual`：把 `nm_orphan_reverse_scale` 赠予原龙艾斯卡 `eska` | 25 | 无 | 认知：龙族信任；`a5_eska_consent` 的判定多一份分量（只作分量，不替代正典条件） | cog、divine | | 五 |
| `deed_rare_spared_route` | 不杀也拿到 | `meta`：十二只可不杀的异名者中，以送魂、净化或驯服路线落名至少六只 | 25 | 称号 `title_rare_gentle_hand` | 认知：猎户、萨满与精灵把你记为"留手的人" | cog、bond | | 四 |
| `deed_rare_hushed` | 压下去的名字 | `manual`：替村民辟谣，把一只异名者的传闻强度压到 0 之后再讨伐 | 10 | 无 | 认知：`rumorScale` 的反向用法；当地人群从"恐惧"转"感激" | cog | | 一起 |
| `deed_rare_inherited` | 继名者 | `manual`：讨伐一只继名者，这一次让名字落地 | 10 | 无 | 认知：你亲眼看见"名字比魔物活得久" | cog、story | 隐 | 二起 |

- `deed_rare_stilled_hammer`：【真相】停锤者认得被凿去的名字，所以停手；任何台词都不得说出那个名字（第六幕前，[台账 6][rl]）。
- `deed_rare_inherited`：【真相】莫伊拉的称号规则也作用于残页（[力量 7.4][pow]）；规则本身最早第四幕由莫伊拉点破。
- 异名者事迹不计"击杀全部 40 只"；收集全部异名物的完成记在收藏类 `deed_col_named_trophies`，零名望（运气不进分的口径，[遗物 1.7][rel] 第 8 条）。

### 3.4 迷宫（`deed_dg_`）

每座迷宫一条（第一幕到第五幕，主门坑的终战记在 3.9），挑选的是迷宫目录"事迹钩"里最能改变别人看法或打开别的东西的那一条；
其余事迹钩留作迷宫目录的内部挑战，不进事迹簿。

| ID | 名 | 触发 | 名望 | 奖励 | 喂给 | 通道 | 隐 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deed_dg_seal_grey_page` | 带一页灰回来 | `manual`：回访封门遗迹 `dg_seal_ruins` 时收拢灰页群而不烧毁，交还阿什 | 10 | 无 | 认知：`a3_ash_relation`；收藏：`col_thousand_archive` 的线索 | story、bond | | 三 |
| `deed_dg_old_mine_one_night` | 一夜之间 | `manual`：边石旧矿 `dg_old_mine` 从塌方口到晶脉一夜完成 | 5 | 无 | 认知：表观位阶 26 的事迹（[认知 3.2][rep]）；`deed_mortal_dwarf_mechanism` 的起点 | cog | | 一 |
| `deed_dg_moon_cellar_untouched` | 只看不碰 | `manual`：清完醉月亭地窖 `dg_moon_cellar`，没碰长木匣 | 0 | 无 | 认知：玛莎的测试 T3 评价不降；`trial_martha_evening_bell` 的解锁倾向 | bond、cog | 隐 | 一 |
| `deed_dg_waterway_none_missing` | 一个都没少 | `manual`：旧水道 `dg_old_waterway` 断门厅救出全部孩子 | 25 | 记事柱一格 | 门：`door_resonance` 的缘钥进度（遗民孩子）；认知：门徒会的敌意升级 | key、bond | | 二 |
| `deed_dg_frostbone_names` | 三百个名字 | `manual`：以北门阵亡碑上的名字送魂霜骨墓窟 `dg_frostbone_crypt` 的全部霜骨兵 | 25 | 无 | 认知：BE-06；黑橡堡戍军 | story、cog | | 三 |
| `deed_dg_stations_all_lit` | 四站俱明 | `manual`：复原门站残墟 `dg_gate_stations` 的全部四座门站 | 25 | 无 | 门：`door_wayfaring` 进阶的地钥记录；收藏：四块门站石入 `col_gatestones` | key、collect | | 三 |
| `deed_dg_archive_no_burn` | 一页不烧 | `manual`：千门书库 `dg_thousand_archive` 墨潮战中不烧任何书架 | 25 | 无 | 收藏：`col_thousand_archive`；认知：阿什 | collect、story | | 三 |
| `deed_dg_rustridge_hollow_stone` | 罗恩说对了一次 | `manual`：在锈岭矿深层 `dg_rustridge_deep` 找到罗恩说过的那块空心石 | 5 | 无 | 认知与羁绊：罗恩会把这件事讲一辈子；第一幕"矮人机关"桥段的反转 | bond | 隐 | 三 |
| `deed_dg_myriad_twelve_letters` | 十二封信 | `manual`：万户街 `dg_myriad_street` 活性期内把十二封家书送到对应的门 | 25 | 无 | 收藏：`col_unsent_letters`；认知：收信人家的"我们从北方来" | collect、cog | | 三 |
| `deed_dg_martyr_reliquaries` | 不碎一匣 | `manual`：殉光地下墓 `dg_martyr_catacomb` 殉光圣者战中不击碎圣骸匣 | 25 | 无 | 认知：`col_pale_reliquary` 的旁证；圣殿卫队 | cog、story | | 四 |
| `deed_dg_skriva_star_table` | 星表 | `manual`：斯克里瓦禁书库 `dg_skriva_vault` 以背诵解开星簿守 | 25 | 无 | 认知：E14 赫尔加星表的旁证；书库守 `samuel_gran` | story、cog | | 四 |
| `deed_dg_redgravel_seven` | 七梯 | `dungeonClears:dg_redgravel_pit >= 1`（挑战梯七级全胜） | 25 | 称号 `title_crown_pit_after_champion` | 认知：帝国最大的传颂放大器 `taddeo_val` 开始讲你 | cog、collect | | 四 |
| `deed_dg_redgravel_fixed` | 揭穿假赛 | `manual`：在红砾城地下斗场揭穿席薇 `sive_fell` 三十连胜里的七场下药 | 25 | 无 | 立名：席薇得到一场没被安排的比赛（`title_named_sive`）；萨莎"拒绝假赛"的同构 | cog、bond | | 四 |
| `deed_dg_wreck_harbor` | 门港重开 | `manual`：沉船湾 `dg_wreck_bay` 复原潮门 | 25 | 无 | 门：`door_wayfaring` 海上门址的地钥记录，门港之门 `door_site_harbor`；收藏：`ky_gatestone_wreck_bay` | key、collect | | 四 |
| `deed_dg_barrow_wait` | 门外等 | `manual`：祖灵冢墓道 `dg_ancestor_barrow` 让候选人独自走完，你只在冢外等 | 10 | 无 | 立名：候选人得到 `deed_world_lone_walk`；放手的个人层 | bond、cog | | 四 |
| `deed_dg_forge_mortal_oath` | 以凡约解誓 | `manual`：深炉 `dg_deep_forge` 用一份凡约解开炉长会的旧誓 | 25 | 无 | 经营：凡约制度的第一块试金石；认知：赤砧山炉长会第一次承认凡约 | manage、cog | | 四 |
| `deed_dg_edge_seven_caves` | 七窟 | `dungeonClears:dg_edge_trial >= 1`（七窟全胜） | 25 | 称号 `title_tribe_night_hornseat`（经乌加 `uga_brokenhorn` 承认） | 认知：魔族把你当成可以下战书的人 | cog、divine | | 四 |
| `deed_dg_root_sorrow_sapling` | 悲苗 | `manual`：根渊 `dg_root_abyss` 以净代战解决悲苗 | 25 | 无 | 门：`door_clear_flow` 地钥记录；羁绊：精灵守护者 | key、sed | | 四 |
| `deed_dg_horncrown_empty_dais` | 空台 | `manual`：角冠宫废墟 `dg_horncrown_ruins` 铁角冠战中没有同伴被加冕满 10 秒 | 25 | 无 | 认知：夜后的评价；`trial_vespera_eight_wars` 的场地 | cog | | 四 |
| `deed_dg_withered_turns` | 它自己会转 | `manual`：枯环 `dg_withered_ring` 以循环试炼解开悔之花 | 25 | 无 | 认知：希尔薇式试炼"不杀某物"（与 `trial_elwin_silent_walk` 同构） | cog、sed | | 五 |
| `deed_dg_womb_none_chosen` | 无一被择 | `manual`：王胎渊 `dg_womb_abyss` 未生者战中没有同伴被附 | 50 | 无 | 认知：守渊的夜魔老兵；BE-22 的终点 | cog | | 五 |
| `deed_dg_tomb_sword_left` | 不取剑 | `manual`：离开堕勇之墓 `dg_fallen_hero_tomb` 时佩剑仍在原处 | 25 | 无 | 认知：E13 的取得途径；证人 `oren_greyhood` 的认可 | story、cog | | 五 |
| `deed_dg_abyss_four_hearts` | 四心 | `manual`：渊主沉骸 `dg_abyss_lord_wreck` 四心全破 | 50 | 无 | 军需：同盟深潜船的航路；认知：潮民与同盟水手把你当作"下过鲸腹的人" | war、cog | | 五 |
| `deed_dg_three_ways` | 养、毁、净 | `meta`：对三座不同的迷宫分别选择养、毁、净各一次 | 25 | 称号 `title_dg_three_ways` | 认知：迷宫与领地的取舍（[迷宫目录 1.2][dgc]） | manage、cog | | 三 |

- `deed_dg_moon_cellar_untouched`：【真相】长木匣里是玛莎当年的刀；她的往事最早在 `a3_martha_tale` 讲出。
- `deed_dg_rustridge_hollow_stone`：隐藏只为惊喜，不涉台账。
- `deed_dg_frostbone_names`：【真相】霜骨墓窟坑底是 909 年"光之奇迹"留下的光澱（[迷宫目录 9.1][dgc] 第 6 条），最早第五幕可点破。

### 3.5 探索（`deed_exp_`）

| ID | 名 | 触发 | 名望 | 奖励 | 喂给 | 通道 | 隐 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deed_exp_gatesite_pair` | 两处门址 | `visits:[poi:lotha:seal_first_gate, poi:lotha:waterway_gate37]` 且持 `gate_stone` | 10 | 无 | 门：`door_wayfaring` 初阶的地钥记录（D-046） | key | | 二 |
| `deed_exp_gatesite_third` | 第三处门址 | `visit:poi:waste:middle_station` | 10 | 无 | 门：`door_wayfaring` 进阶的地钥记录 | key | | 三 |
| `deed_exp_main_gatestone` | 主门石 | `collectItems:[ky_gatestone_main_gate]` | 25 | 无 | 门：千径之门 `door_thousand_paths` 的节点规划；收藏：`col_gatestones` | key、collect | | 五 |
| `deed_exp_stele_customs` | 按碑的规矩 | `collectItems:[ky_rubbing_eluen, ky_rubbing_valda, ky_rubbing_merca, ky_rubbing_sylvie]`，每张按当地规矩取得（默许或夜潜、碑前决斗、交拓费、守泉者许可） | 25 | 无 | 认知：各司的规矩各是什么样；收藏：`col_seven_steles` | cog、divine | | 四 |
| `deed_exp_stele_mute` | 透光的哑碑 | `collectItems:[ky_rubbing_hollow]`（只在天启之夜可拓） | 25 | 无 | 认知：碑上原本有字；收藏：`col_seven_steles` | story、collect | | 四到五 |
| `deed_exp_stele_sky` | 天碑 | `collectItems:[ky_rubbing_seventh]`（`a5_eska_consent` 之后） | 25 | 无 | 收藏：`col_seven_steles`、`col_dragon_traces` | collect、story | | 五 |
| `deed_exp_pit_gaze` | 再看一眼 | `manual`：在书库屋顶远望主门坑时选择"再看一眼"（C3-3），被迫退回庭院休整一日 | 0 | 无 | 认知：观澜之门隔着几里地也只读出"？"；夜羽拽你的那一下 | story | 隐 | 三 |
| `deed_exp_falling_iron` | 天上掉下来的铁 | `visit:poi:sleepscale:vault_terrace` 时恰逢落铁，拾起 `mat_vaultiron_chunk` | 10 | 无 | 认知：BE-16；收藏：`col_boundary_proofs` | collect、story | | 四 |
| `deed_exp_garden_guest` | 庭院的客人 | `manual`：第一次带一位有页同伴进门内庭院 | 5 | 无 | 认知：同伴第一次见到箱庭之外；诸神：他的页显示"所在不明"，引来莫伊拉的书签（[力量 8.6][pow]） | bond、divine | | 一末到二 |
| `deed_exp_nine_lands` | 九地的路 | `visits`：九个可游玩区域各至少一处地标 | 25 | 称号 `title_late_known_abroad`（另需 新·`rumorReach`：七个地区） | 认知：各国的传闻画像里都有你 | cog | | 五 |

- `deed_exp_stele_mute`：【真相】哑碑是被凿去名字的第六座碑，碑上的名字第六幕才可读出（D-053）。
- `deed_exp_pit_gaze`：【真相】远期伏笔；最早第五幕 `a5_demon_king_born` 之后可回看，正典不预设其余细节。
- `deed_exp_falling_iron`：【真相】穹铁是天穹边界剥落的东西（[总纲 7.1][bible]），"箱庭有边"最早在 `a4_star_records AND act>=5` 之后可说（M12-C07）。

### 3.6 收藏（`deed_col_`）

收藏的规则与完成奖励归遗物目录（[遗物 1.7、6][rel]）；本节只登记"完成那一刻"的事迹与遗物目录请求的称号。

| ID | 名 | 触发 | 名望 | 奖励 | 喂给 | 通道 | 隐 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deed_col_earth_keepsakes` | 那间屋子的门 | `col_earth_keepsakes` 五件 | 10 | 收藏的外观 | 认知：前世之门的回忆对话 | collect、story | | 序到一 |
| `deed_col_guest_relics` | 远方的东西（六幕后：邻庭的东西） | `col_guest_relics` 完成（十件中至少八件） | 25 | 称号 `title_col_neighbor_collector`（`a6_earth_truth` 之后才授） | 认知：与 E33 前世记忆同时出示时组合加 1（[遗物 6][rel]） | collect、story | | 六 |
| `deed_col_named_trophies` | 四十个名字 | `collectItems`：全部 `nm_` 异名物（曾藏计） | 0 | 称号 `title_col_trophy_wall` | 收藏：`col_named_trophies`（公开陈列时同伴立名略快） | collect、cog | | 四到五 |
| `deed_col_gatestones` | 门网星图 | `col_gatestones` 十三块 | 25 | 收藏的外观 | 门：千径之门节点规划的推断级认知；门标上限 | key、collect | | 五 |
| `deed_col_seven_steles` | 七碑同文 | `col_seven_steles` 七张 | 50 | 称号 `title_col_seven_steles` | 认知：MIS-21 被推翻的组合物证；第六幕共读多一个可选应答 | story、collect | | 五到六 |
| `deed_col_doorsong` | 五个歌结 | `col_doorsong` 五结 | 25 | 无 | 门：`door_resonance` 领祷的缘钥辅助；E04 的取得途径之一（[遗物 4.4][rel]） | key、story | | 四到五 |
| `deed_col_yeyu_memories` | 信使的路 | `col_yeyu_memories` 六片（消耗的按曾藏计） | 25 | 无 | 门：`door_messenger` 物钥记录；羁绊：夜羽第六幕多一句话 | key、bond | | 二到五 |
| `deed_col_yeyu_shinies` | 那不是收藏 | `col_yeyu_shinies` 八件 | 5 | 夜羽的窝 | 羁绊：夜羽否认那是收藏 | bond、collect | | 一 |
| `deed_col_eight_heroes` | 八光的收殓人 | `col_eight_heroes` 八件 | 25 | 称号 `title_col_eight_lights` | 认知（`a5_truth_purge_cycle` 后）：八个人都被用完了；老船夫会哭一次 | story、bond | | 五 |
| `deed_col_eight_kings` | 八冠 | `col_eight_kings` 八件 | 25 | 称号 `title_col_eight_crowns` | 认知（第五幕）：他们都说听见了声音（与 E10 同时出示时组合加 1）；夜后的对话分支 | story | | 五 |
| `deed_col_unsent_letters` | 送信人 | `col_unsent_letters` 寄出 24 封 | 25 | 称号 `title_col_letter_carrier` | 羁绊：夜羽大增；认知：北境收信人家 | bond、cog | | 三到五 |
| `deed_col_fallen_badges` | 带他们回家 | `col_fallen_badges`：晚钟小队与各迷宫阵亡者的铜牌交回分部或家人 | 25 | 称号 `title_col_bring_home` | 羁绊：玛莎、布伦；公会信任 | bond、cog | | 一到五 |
| `deed_col_six_greys` | 六种灰 | `col_six_fingerprints` 六件 | 25 | 称号 `title_col_six_greys` | 认知（第五幕）：每一种灰都有来处（M04-C10 的推断级认知） | story、sed | | 五 |
| `deed_col_duel_tokens` | 斗证 | `col_duel_tokens` 四件 | 25 | 称号 `title_col_duelist` | 诸神：瓦尔妲派来挑战者更频繁（代价也是机会） | divine、cog | | 四 |
| `deed_col_songs_tales` | 歌与谣 | `col_songs_and_tales` 八件 | 10 | 称号 `title_col_songkeeper` | 立名：`bard` 同伴的培养略快；传闻澄清加成 | cog、collect | | 二到四 |
| `deed_col_restitution` | 归还者 | `col_restitution_ledger` 24 笔 | 25 | 称号 `title_col_restorer` | 认知：各族首领的信念画像加"他会把东西还回来" | cog、bond | | 三到六 |
| `deed_col_thousand_archive` | 书库复原 | `col_thousand_archive` 十件 | 25 | 收藏的外观（书斋书架） | 羁绊：阿什成为人簿与史馆第一位馆员的去向更可能 | story、bond | | 三到五 |
| `deed_col_pale_reliquary` | 苍白的圣遗物 | `col_pale_reliquary` 五件 | 25 | 无 | 认知（第四幕）：圣遗物是苍白之兽的骨；结衣与卡西安的动摇 | story、cog | | 四 |
| `deed_col_garden_creatures` | 庭院的小东西 | `col_garden_creatures` 完成（八种庭生灵都出现过，[遗物 6][rel]） | 10 | 无 | 收藏与羁绊：庭院生灵（[兽伴目录][cre]） | collect、bond | | 二到六 |

### 3.7 社交与羁绊（`deed_bond_`）

| ID | 名 | 触发 | 名望 | 奖励 | 喂给 | 通道 | 隐 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deed_bond_first_believer` | 第一个相信你的人 | 新·`belief`：希雅 `shiya` 进入"接受"，且 `trust.shiya >= 60` | 10 | 无 | 门：`door_talent_sight` 的缘钥进度；认知：希雅成为你在东坡的第一位担保人 | bond、key | | 一 |
| `deed_bond_oola_cleared` | 药草婆婆平反 | 新·`cond`：`a1_oola_fate == cleared` | 25 | 记事柱一格 | 认知：贝莎的"邪术"解释被推翻，`church_suspicion` 下降；欧拉 `oola` 的信任开放落叶路 | bond、cog | | 一 |
| `deed_bond_brun_glove` | 旧手套 | 新·`cond`：`npc.bron.secret_kept == true` | 10 | 布伦的旧手套 | 认知：礼拜堂里门纹被看见的几率降低；手录从信任开始写 | bond、cog | | 一 |
| `deed_bond_brun_first_line` | 实绩如下 | `flag:a2_arrive_valen`（布伦的推荐信随你入城） | 5 | 事迹簿改名"布伦手录" | 认知：推荐信计书面 1；奥托 `krause` 背书后手录升为书面 2 | cog、collect | | 二 |
| `deed_bond_gave_credit` | 让出去的功劳 | `manual`：第一次把一件事迹的名分让给在场的有页同伴，且目击者采信 | 10 | 无 | 立名：该同伴的讲述数上升；认知：你的注视度不升（藏拙） | bond、cog | | 二 |
| `deed_bond_hidden_six` | 六位的点头 | 新·`belief`：十二位隐藏强者（[人物二 3.11][chc]）中至少六人进入"接受"，且你从未挑衅过任何一人两次 | 25 | 称号 `title_bond_nodded_at` | 认知：观澜之门对"凡人"的估计永远多留一分（C2-1 的系统化）；各人的缘钥 | cog、key | | 四到五 |
| `deed_bond_soup_and_bell` | 汤与铃 | `manual`：露易丝 `luise_schnee` 与欧迪 `oddie_roundstone` 一前一后同时对练，你撑完全程 | 25 | 称号 `title_bond_soup_bell_heir` | 门：汤与铃之门 `door_combo_warrior_rogue` 的缘钥；双脉之门 `door_dual_pulse` 进阶的缘钥 | key、bond | | 四 |
| `deed_bond_trial_martha` | 铃响了一次 | `manual`：`trial_martha_evening_bell` 胜 | 25 | 无 | 门：晚钟之门 `door_bond_martha` 的历钥，同一场给铁卫之门 `door_school_warrior_prot` 一把钥；玛莎在 `PL-martha-5` 走哪一支由它决定：有这条事迹时她请求随玩家进魔王战（玩家可以答应，也可以请她回去守边石镇），没有时她守住边石镇战线（[同伴与队伍 4.4、8][cmp]） | key、bond | | 三到四 |
| `deed_bond_trial_ferryman` | 撑过去 | `manual`：`trial_ferryman_crossing` 胜 | 25 | 无 | 门：撑渡之门 `door_bond_ferryman` 的历钥；`door_wayfaring` 对门址的感知加深 | key、bond | | 二到四 |
| `deed_bond_trial_sasha` | 第三回合 | `manual`：`trial_sasha_third_round` 胜（任一规则） | 50 | 无 | 认知：萨莎从此叫你的名字；羁绊：第五幕萨莎的招募条件；无加护之战让她"第一次背对瓦尔妲"的分支更稳 | bond、war | | 四到五 |
| `deed_bond_trial_ash` | 灰中静坐 | `manual`：`trial_ash_vigil` 胜（一夜不开任何门） | 25 | 无 | 门：关门之门 `door_bond_ash` 的历钥；认知："门是可以关上的"，`deed_grow_closed_door` 的伏笔 | story、key | | 三到五 |
| `deed_bond_trial_emperor` | 座签 | `manual`：`trial_emperor_hook` 完成且未用门的能力（胜负皆可） | 25 | 胜时称号 `title_crown_emperor_seat` | 门：负时得斩伐之门 `door_school_warrior_arms` 的一把历钥（剑理）；胜时可看帝国星象台的记录（`col_boundary_proofs` 旁证） | key、cog | | 四到五 |
| `deed_bond_trial_vespera` | 你数了 | `manual`：`trial_vespera_eight_wars` 胜 | 25 | 无 | 认知：`trust.night_queen` 大幅上升（按台账 60 开放《堕勇手记》，不另设捷径）；月下之约多一条逃兵安置条款 | cog、war | | 四 |
| `deed_bond_trial_elwin` | 默行 | `manual`：`trial_elwin_silent_walk` 胜（一路不杀任何生灵） | 25 | 称号 `title_tribe_elf_silent_walker` | 认知：门歌残句；公证的意愿更强（不改 `a4_elwin_witness`） | story、bond | | 四 |
| `deed_bond_trial_grete` | 过桥 | `manual`：`trial_grete_bridge` 胜 | 25 | 无 | 立名：可选把她的故事讲出去（`title_named_grete`）；守城将领候选 | bond、cog | | 三 |
| `deed_bond_trial_eska` | 空手下山 | `manual`：`trial_eska_silver_eyrie` 中什么都没拿 | 25 | 无 | 诸神：原龙同意供能的判定多一份分量（不替代 `a5_eska_consent` 的正典条件）；认知：龙族记住你空手下山 | divine | 隐 | 五 |
| `deed_bond_famed_pet` | 第一只名伴 | 新·`rumorReach`：你给兽伴起的名字传到第二座城镇（[兽伴 1.3][cre]） | 10 | 无 | 兽伴：名伴特性；认知："那个人养着……" | bond、cog | | 二起 |
| `deed_bond_pet_farewell` | 为亡伴送魂 | `manual`：认出在野外游荡的亡伴并为它送魂 | 10 | 无 | 羁绊：解开伴契残痕；认知：那一带的猎户不再说"林子里有条鬼狗" | bond | | 二起 |
| `deed_bond_hornfather` | 祖角认主 | `collectItems:[mnt_hornfather]` | 25 | 无 | 认知：骑进风牙营地时全营起立 | cog、bond | | 四 |
| `deed_bond_oathhoof` | 受赠誓蹄 | `collectItems:[mnt_oathhoof]` | 25 | 称号 `title_church_oathhoof_friend` | 认知：圣骑士团站到你一边的公开信号；圣殿卫队行礼 | cog、war | | 四到五 |
| `deed_bond_named_shiya` | 希雅的名字 | 新·`tellCount`：希雅 | 25 | 无 | 立名：`title_named_shiya`，她跨过 34（正典第三幕 Lv36） | bond、cog | | 三 |
| `deed_bond_named_yeyu` | 乌鸦的名字 | 新·`tellCount`：夜羽 `yeyu` | 25 | 无 | 立名：`title_named_yeyu`，写在残页上（D-052） | bond、cog | | 三 |
| `deed_bond_named_ron` | 罗恩的名字 | 新·`tellCount`：罗恩 | 50 | 无 | 立名：`title_named_ron`；正典第四幕 Lv34、第五幕 Lv40"靠自己爬上来"，本文把这段卡关与过关落在讲述数上 | bond、war | | 五 |
| `deed_bond_named_three` | 你身边的名字 | `meta`：三位同伴经你的事迹立名 | 25 | 称号 `title_people_namegiver`（第四幕起由人簿授） | 认知：酒馆里开始说"跟着他的人都出了名" | cog、bond | | 四到五 |
| `deed_bond_first_knot` | 第一根绳 | 新·`doorState`：门目录新增的十二扇羁绊之门（`door_bond_*`）任一已开 | 10 | 无 | 认知：门上系着的那个人知道"那扇门系着我"；十二扇新增羁绊门的汇总记录（[同伴与队伍 8.6][cmp]） | bond | | 二 |
| `deed_bond_door_opener` | 开门的 | `collectItems:[ky_scorched_quill]`（`a3_ash_tells_sundering` 之后） | 10 | 称号 `title_bond_door_opener` | 羁绊：夜羽从此称你"开门的"（[遗物 4.2][rel]）；残响之门多一段信使的视角 | bond、story | | 三 |
| `deed_bond_naming_feast` | 席上的名字 | 新·`tellCount`：一位有页同伴的讲述数，在一场立名宴 `cs_naming_feast` 之后的日结算里越过阈值 | 10 | 无 | 立名：该同伴过关；认知：宾客的家乡都听说了这个名字 | bond、cog | | 三 |
| `deed_bond_farewell` | 送别 | 新·`cond`：铁人规则下任一同伴 `companion.<人>.state == dead`（泉畔期已过） | 0 | 记事柱一格（可刻其名） | 羁绊：他的羁绊之门门环变冷，门后力量减半（[千门 2.2][td]）；认知：同伴们为他守一夜（[同伴与队伍 11.4][cmp] 的告别事迹） | bond | 隐 | 一 |
| `deed_bond_blade_returned` | 一年之约 | `manual`：祭斗季冠军一年期满，把 `eq_edgetrial_festival_blade` 交还祭斗长乌加 `uga_brokenhorn` | 10 | 无 | 认知：魔族把你记为守约的人，`title_tribe_night_hornseat` 的辅证；收藏：`col_restitution_ledger` 一笔 | cog、bond | | 五 |

- `deed_bond_trial_eska`：隐藏只为惊喜，不涉台账；艾斯卡在第六幕之前多于一句话即越界（[台账 8.6][rl]），所以这条事迹没有台词，连布伦的批注也是空的。
- 同伴立名的三条（希雅、夜羽、罗恩）记在人簿与对方的铭录里，是"你身边的名字"而不是你的功劳：玩家这一侧只得到认知与 `title_people_namegiver`。

### 3.8 经营（`deed_mgmt_`）

| ID | 名 | 触发 | 名望 | 奖励 | 喂给 | 通道 | 隐 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deed_mgmt_old_watch_refuge` | 旧哨的第一户 | `manual`：在旧哨村收容第一批难民与遗民 | 10 | 无 | 门：`door_settlement` 历钥 | key、manage | | 二 |
| `deed_mgmt_barony` | 准男爵 | `flag:a2_barony_granted` | 10 | 称号 `title_crown_baronet` | 认知：官员与贵族改用职名；`deed_mortal_bone_crest` 的引子 | cog、manage | | 二末 |
| `deed_mgmt_first_officer` | 他自己办好了 | `manual`：一名你授权的官员独立处理一件领地事件并成功 | 10 | 无 | 经营：`territory_autonomy` 上升；认知：这名官员从此敢自己拿主意 | manage | | 三 |
| `deed_mgmt_autonomy_40` | 四十 | 新·`cond`：`territory_autonomy >= 40` | 25 | 无 | 门：`door_founding` 的自治度条件（D-044） | key、manage | | 三到四 |
| `deed_mgmt_register_3000` | 三千个名字 | 新·`cond`：人簿上自愿登记的国民不少于三千（[第四幕 3.1][a4]、[D-044][dlog]） | 25 | 无 | 门：`door_founding` 的众愿（缘钥） | key、manage | | 四 |
| `deed_mgmt_nation_founded` | 界石誓 | `flag:a4_nation_founded` | 50 | 称号 `title_crown_founder` | 认知：七国把你写进外交文书 | manage、cog | | 四 |
| `deed_mgmt_people_register` | 人簿第一页 | `manual`：人簿制度建立，你的一页由国民写下 | 25 | 事迹簿改名"人簿·第一页"；称号 `title_people_first_page` | 认知：人簿对本国国民计权威背书 3；他人事迹模板开始入簿 | cog、manage | | 四 |
| `deed_mgmt_mortal_contract` | 凡约 | `manual`：第一份凡约在法庭上被维持 | 10 | 无 | 认知：对哈特契约权能的免疫层（[第四幕 4.6][a4]） | manage、econ | | 四 |
| `deed_mgmt_year_without_you` | 你不在的那一年 | 新·`cond`：你离开国土至少一季，期间国家没有让你紧急返回 | 25 | 称号 `title_people_fine_without_you` | 经营：自治度；E34 箱庭离手指数的一份记录 | manage、story | | 四到五 |
| `deed_mgmt_register_year` | 人簿满一年 | 新·`cond`：人簿运转一年以上，且布伦交出手录 | 25 | 无 | 叙事：第六幕证据 E26 成立；收藏：布伦交出的手录成为人簿的第一页 | story | | 五到六 |
| `deed_mgmt_craft_first_masterwork` | 无记载者之作 | `manual`：你第一次做出杰作（鉴定只显示"无记载者之作"） | 5 | 无 | 门：对应生业之门（`door_craft_` 十四扇，[门目录][drs]）下一层的历钥；认知：传闻的源头之一 | key、craft | | 一起 |
| `deed_mgmt_craft_patron` | 你的匠人出师了 | 新·`cond`：一名你雇用或培养的匠人以出师之作改写为 Lv10 | 10 | 无 | 他人事迹 `deed_world_apprentice_work`；认知：镇上会传 | manage、cog | | 二起 |
| `deed_mgmt_craft_same_forge` | 同炉 | `manual`：一位具名匠人为你出一组同炉套组（`rcp_same_forge_batch`） | 25 | 无 | 立名：该匠人 `deed_world_named_work` 的讲述数大增 | craft、cog | | 三起 |
| `deed_mgmt_craft_open_edge` | 开锋 | `manual`：第一次请名匠为你的精品开锋成名器（[装备 2.8][eqc]） | 10 | 无 | 认知：器意从器痕的来历里长出来；名匠的讲述数 | craft、power | | 三起 |
| `deed_mgmt_craft_outer_edge` | 外缘之作 | `manual`：你完成一件外缘之作（门铜、门木、原龙鳞、世界树露、穹纱、渊晶之一入料） | 50 | 无 | 门：生业之门层六的历钥；认知：你欠下的那段关系（稀缺锁） | key、craft | | 五到六 |
| `deed_mgmt_tribute_bow` | 贡弓还乡 | `manual`：把 `eq_fangmouth_tribute_bow` 还给长角部 | 10 | 无 | 认知：风牙态度上升；收藏：`col_restitution_ledger` 一笔 | cog、bond | | 四 |

### 3.9 战争（`deed_war_`）

| ID | 名 | 触发 | 名望 | 奖励 | 喂给 | 通道 | 隐 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deed_war_castle_tide` | 城下潮 | `quest:A2-M12` | 25 | 无 | 认知：卫兵长卡尔 `karl` 亲眼看见；瓦伦堡的 `a2_rumor_shape` 定型 | war、cog | | 二 |
| `deed_war_first_defense` | 守土 | `manual`：领地的第一次守土之战胜利，罗恩为将 | 25 | 无 | 门：`door_thousand_legions` 历钥 | key、war | | 三 |
| `deed_war_three_hundred` | 三百人 | `manual`：鹿渡之战以三百人守住渡口 | 25 | 无 | 认知：奥莉安娜 `oriana_west` 认定洛萨藏了一支军团，按兵不动两日（U3-2）；`title_street_three_hundred` 的来源 | war、cog | | 三 |
| `deed_war_frostspine` | 守住了 | `manual`：霜脊堡之战北线守住 | 10 | 无 | 认知：布丽吉特 `brigitte` 把战报划到只剩"守住了"三个字（U3-6）；北境口碑 | war、cog | | 三 |
| `deed_war_reed_bridge` | 苇桥 | `manual`：灰烬防线之战任一胜利路线 | 25 | 无 | 解锁：`trial_grete_bridge`；认知：战后有人说桥头的血不是圣战军的（E36 的一条传闻线索） | war、cog | | 三 |
| `deed_war_banner_returned` | 还旗 | `manual`：和谈时把缴获的军旗还给对方 | 10 | 无 | 收藏：`col_war_banners` 计曾藏；认知：对方将领的敬意 | cog、bond | | 三起 |
| `deed_war_goldbay` | 金湾之围 | `manual`：经济战中以门券或凡约破围（[第四幕 8.1][a4]） | 25 | 无 | 经济：门券信用；认知：同盟商会联合 | econ、war | | 四 |
| `deed_war_one_sword` | 一剑问 | `manual`：强者之宴上剑帝的一剑问，你答"不怕" | 25 | 无 | 解锁：`trial_emperor_hook` 的延期决斗约定；认知：`npc.emperor.respect` | cog | | 四 |
| `deed_war_seven_nations` | 七国会盟 | `manual`：七国会盟达成任一联盟结果 | 50 | 称号 `title_crown_league_seat` | 认知：各国精英的看法；第五幕阵营抉择 | war、cog | | 四 |
| `deed_war_gate_ring` | 众门环 | 新·`cond`：`a5_gate_ring >= 5` | 50 | 称号 `title_war_ring_keeper` | 叙事：众生路线的前提（[第五幕 6.2][a5]）；E29 | war、story | | 五 |
| `deed_war_dismantlers` | 拆门队 | `manual`：击败或说服拆门队队长奥斯温 `oswin_grey`，保住至少一个门环节点 | 25 | 称号 `title_war_dismantlers_foe` | 认知：教国对你的定性在门环线上具体化 | war、cog | | 五 |
| `deed_war_four_fronts` | 你不在的战线 | 新·`cond`：灰烬决战中你不在场的北、东、南与门环战线全部自行守住 | 50 | 无 | 经营：自治度的终极检验（[第五幕 7.3][a5]）；认知：国民相信"没有他我们也行"；E34 | war、manage | | 五 |
| `deed_war_rear_held` | 边石没有失守 | 新·`cond`：后方·边石守住，守将为玛莎或布伦 | 25 | 无 | 立名：守将的 `deed_world_held_place`；全作开始的地方 | war、bond | | 五 |
| `deed_war_faceless_king` | 无貌之王 | `flag:a5_final_battle_done` | 50 | 无 | 叙事：三条路线之一落定；称号：`title_street_pit_stander` 的来源 | story、war | | 五 |

### 3.10 诸神（`deed_god_`）

| ID | 名 | 触发 | 名望 | 奖励 | 喂给 | 通道 | 隐 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deed_god_full_name` | 念出尊名 | `manual`：第一次在祈祷或对话中念出一位女神的完整尊名 | 5 | 无 | 诸神：一次"主动被看见"（[女神 GM 6.3][gm]）；认知：你学会了怎么叫她们来，也知道了代价 | divine | | 二起 |
| `deed_god_five_offers` | 五份招揽 | `flag:a4_goddess_versions_heard` | 25 | 无 | 认知：对照页的前两列；`a4_moira_isomorphism` 的前置 | story、divine | | 四 |
| `deed_god_none_accepted` | 一个也没答应 | 新·`cond`：五位女神的招揽全部婉拒，且第四幕结束时未与任何一司立约 | 25 | 无 | 诸神：五司的档案各记一笔"不可收买"；认知：第六幕庭上的说服基础 | divine、cog | 隐 | 四 |
| `deed_god_moira_story` | 讲述 | `manual`：与莫伊拉完成第一笔交易（`a3_moira_offer` 之后） | 10 | 无 | 诸神：她的客卷开卷，`goddess.moira.gaze` 上升；称号 `title_court_guest_scroll` | divine、story | | 三到四 |
| `deed_god_memory_given` | 交出 | `manual`：把一段前世记忆交给莫伊拉 | 0 | 无 | 代价型：前世之门的对应加成永久失去；回忆里那一段显示为空白；认知：莫伊拉对你的可见度上升 | story | 隐 | 四 |
| `deed_god_danger_door` | 门缝里的风 | 新·`cond`：`danger_doors_opened >= 1` | 0 | 无 | 代价型：`seal_looseness`；认知：阿什的警告应验，他说她会更近（C3-8） | story、key | 隐 | 三 |
| `deed_god_eska_consent` | 原龙的应允 | 新·`cond`：`a5_eska_consent == true` | 50 | 无 | 叙事：净澱工程的供能；E30；认知：龙族与精灵把你当作说动过原龙的人 | divine、story | | 五 |
| `deed_god_six_chairs` | 第六把椅子 | 新·`doorState`：六椅厅六扇门全部已开（含梦扉之门 `door_trial_dream`） | 25 | 无 | 认知：候见厅里那把只有你看得见的椅子，在梦里第一次有人坐过（P）；六扇试炼赏门的汇总记录 | divine、story | 隐 | 四 |
| `deed_god_ownerless` | 无主之身 | 新·`cond`：直到第五幕末，从未佩戴任何附物加护的锚物（[力量 6.8][pow]） | 0 | 称号 `title_late_ownerless` | 诸神：五司的档案里你始终是"看不清的人" | divine、cog | 壮 | 五 |

- `deed_god_none_accepted`：【真相】五司的招揽各有隐瞒（[第四幕 6][a4]）；不答应本身不揭示任何真相，隐藏只为惊喜。
- `deed_god_memory_given`、`deed_god_danger_door`：代价型，零名望，隐藏到发生为止，免得事迹簿诱导玩家付出代价。

### 3.11 真相（`deed_truth_`）

本类全部隐藏：名与描述在标记置真之前不可见，事迹本身就是揭示的那一刻。名字只用该标记解锁后的称谓。

| ID | 名 | 触发 | 名望 | 奖励 | 喂给 | 通道 | 隐 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deed_truth_brun_mark` | 二十年前那个人手上 | `flag:a1_bron_sees_mark` | 10 | 无 | 认知：布伦的旧伤线（S02）；手录里从此多一页他不给人看的 | story | 隐 | 一 |
| `deed_truth_faceless_projection` | 没有脸的人 | `flag:a2_faceless_projection`，且你没有出手 | 10 | 无 | 认知：`npc.faceless.interest`；"另一个你"的第一面 | story | 隐 | 二 |
| `deed_truth_ferryman` | 老船夫 | `flag:a2_ferryman_reveal` | 10 | 无 | 认知：称谓"第八代勇者"解锁（他本人拒绝这个称呼） | story | 隐 | 二 |
| `deed_truth_ash_sundering` | 那件事 | `flag:a3_ash_tells_sundering` | 25 | 无 | 门：`door_echoes` 识钥记录；称谓"大断绝""千门都"解锁；E01 | story、key | 隐 | 三 |
| `deed_truth_sealed_room` | 七锁库 | `flag:a3_archive_sealed_room` | 25 | 无 | 认知：称谓"空白纪"解锁 | story | 隐 | 三 |
| `deed_truth_defaced_stele` | 凿痕 | `flag:a3_defaced_stele_found` | 25 | 无 | 认知：圣教凿毁过一座碑（M02-C06）；E08 可拓，`deed_rare_stilled_hammer` 的清晰度加成从此有用 | story | 隐 | 三 |
| `deed_truth_isomorphism` | 一模一样 | `flag:a4_moira_isomorphism` | 25 | 无 | 认知：对照页追加"我"一列；立名关的计分规则从此可由莫伊拉点破 | story | 隐 | 四 |
| `deed_truth_lies_five` | 五个版本 | 新·`cond`：`lie_exposed.*` 五司全部为真 | 50 | 无 | 认知：第六幕说服五司的材料 | story、divine | 隐 | 四到五 |
| `deed_truth_purge_cycle` | 此页已录 | `flag:a5_truth_purge_cycle` | 50 | 无 | 认知：全录之日若发生，凡人不信反转为凡人不再信神 | story | 隐 | 五 |
| `deed_truth_name_spoken` | 名讳 | `flag:a6_name_spoken` | 50 | 无 | 门：`door_true_name` 识钥记录 | story、key | 隐 | 六 |
| `deed_truth_earth` | 已离手之庭 | `flag:a6_earth_truth` | 50 | 无 | 收藏：`col_guest_relics` 改名；`title_col_neighbor_collector` 可授 | story | 隐 | 六 |
| `deed_truth_charter_read` | 共读 | `flag:a6_charter_read` | 50 | 无 | 认知：规约本意，审定前的最后一块拼图 | story | 隐 | 六 |

- `deed_truth_brun_mark`：【真相】那个人就是"没有脸的人"（S02、S07）；称谓在 `a2_faceless_projection` 之后可用，身份最早第五幕 `a5_faceless_named`。
- `deed_truth_faceless_projection`：【真相】他与玩家同为无页之身，鉴定把他读成残页（D-029）；他是谁最早第五幕。
- `deed_truth_ferryman`：【真相】勇者"用完"的含义（排澱）最早第五幕 `a5_truth_purge_cycle`。
- `deed_truth_ash_sundering`：【真相】阿什只说"她们"，动手者的名单要等第四幕五司各自的版本与第五幕的坦白。
- `deed_truth_sealed_room`：【真相】记录是被有意毁掉的，焚书令原件在空白纪副本第十页（第四幕，E07）。
- `deed_truth_defaced_stele`：【真相】被凿去的是第六座碑上的名字，第六幕开庭点名时才读出（D-053）。
- `deed_truth_isomorphism`、`deed_truth_lies_five`、`deed_truth_purge_cycle`、`deed_truth_name_spoken`、`deed_truth_earth`、`deed_truth_charter_read`：揭示本身就在所标的幕，按台账第 2 节对应线索。

### 3.12 凡人不信（`deed_mortal_`）

喜剧事迹的触发是"桥段走完"（解释被推翻、版本定型、当事人亲眼看见），不是"被嘲笑了几次"（2.10）。
每条都写明桥段之后谁的常识变了，这是它存在的理由（[第一幕 6.2][a1] 末条规则：每个桥段至少有一位 NPC 开始怀疑自己的常识）。

| ID | 名 | 触发 | 名望 | 奖励 | 喂给 | 通道 | 隐 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deed_mortal_crystal_broke` | 水晶坏了 | `quest:A1-M03` 的登记鉴定显示"无记载" | 5 | 称号 `title_street_crystal_breaker` | 认知：莉娜"这个月第三次了"；鉴定反证的第一笔 | cog | | 一 |
| `deed_mortal_dwarf_mechanism` | 矮人机关 | 新·`rumorReach`：版本"矿道里有矮人的机关"成为边石镇主流说法，且巴尔加 `barga` 当众否认过 | 10 | 无 | 认知：西蒙"连矮人都急了，那就是真有机关"；巴尔加知道不是机关，从此对你另眼相看 | cog、bond | | 一 |
| `deed_mortal_new_crystal` | 新的也坏了 | `manual`：第六周后重测，新水晶仍"无记载"，布伦抬头说"别测了" | 10 | 无 | 门：`door_false_record` 历钥（鉴定接连失败之一）；认知：布伦开始怀疑自己的常识 | key、cog | | 一 |
| `deed_mortal_window` | 只是去关窗 | 新·`cond`：兽潮之后 `a1_tide_credit` 已结算，无论哪个版本占优 | 10 | 无 | 认知：边石镇选择了相信什么；伯爵来信的措辞 | cog、story | | 一 |
| `deed_mortal_ron_converted` | 不可能。……好吧，可能。 | 新·`belief`：罗恩的三个解释被逐项推翻后进入"接受" | 10 | 无 | 认知：他转述时没人信，镇民笑他"又喝多了"；他成为最早替你辩护的人之一 | cog、bond | | 一到二 |
| `deed_mortal_blond_knight` | 不是金发骑士 | 新·`belief`：卫兵长卡尔 `karl` 亲眼看见后进入"接受" | 10 | 无 | 称号：`title_wrong_impostor` 在瓦伦堡北门失效 | cog | | 二 |
| `deed_mortal_second_crystal` | 第二块坏水晶 | `quest:A2-M02` 的鉴定段仍"无记载" | 10 | 无 | 门：`door_false_record` 历钥（鉴定接连失败之二）；`title_wrong_bribed_b` 的来源 | key、cog | | 二 |
| `deed_mortal_heroes_glory` | 余威所至 | `manual`：联合攻略第一层，你独自清掉鼠王巢，记录员写下"勇者团余威所至" | 10 | 无 | 立名：主体替换把讲述数记给勇者团（`title_named_heroes_glory`）；称号 `title_street_heroes_porter` | cog | | 二 |
| `deed_mortal_saint_miracle` | 圣女的奇迹 | `manual`：门扉商会的退热草治好的孩子被记作圣女的奇迹（U2-5） | 10 | 无 | 诸神：艾琉恩的账上多了一份不存在的神迹；认知：结衣 `yui` 认真道歉，又没人信 | divine、bond | | 二 |
| `deed_mortal_grass_renovated` | 草翻新的 | `manual`：税吏伊尔玛 `irma` 住一晚后把税率改成"新建"（U2-6） | 10 | 无 | 经营：旧哨村税率；认知：她临走那句"药师那笔账也不对" | manage、cog | | 二 |
| `deed_mortal_bone_crest` | 骨头纹章 | `manual`：觐见时被问"一根骨头？"，当场画出纹章（A3-S01） | 10 | 无 | 认知：司礼官恩斯特 `ernst` 后来为纹章写了一首诗（书面来源，讲述数加成） | cog、story | | 三 |
| `deed_mortal_should_i_kneel` | 我是不是该跪 | `manual`：抵领时选定领地的称呼风格（叫名字、叫大人，或让罗恩真跪一次再拉起来） | 5 | 无 | 认知：领地气氛亲近或敬畏（2.5）；公会卡多一行 `title_guild_baronet_line` | cog、manage | | 三 |
| `deed_mortal_slippery` | 地太滑 | `manual`：与乌尔萨克 `ursak` 摔跤三次，第三次他大笑着认了 | 10 | 称号 `title_tribe_orc_unthrown` | 认知：百帐营的信任 | cog、bond | | 三 |
| `deed_mortal_three_times` | 第三次就不是运气 | 新·`cond`：同一地区同一类越界事迹被目击第三次 | 10 | 无 | 认知："可复现"成立，"运气"解释失效；当地模板的常识上限升一档（[人物一 6][chl]） | cog | | 一起 |
| `deed_mortal_scenery` | 风景不错 | `manual`：智将型官员把你一句"风景不错"落实成坡上的哨塔，你默认，后来哨塔真的派上用场 | 10 | 无 | 认知：误会被落实成事实（[认知 10][rep] 桥段 6） | manage、cog | | 三 |
| `deed_mortal_soup_pot` | 汤锅里的兵器 | `manual`：挑衅隐藏强者露易丝 `luise_schnee` 一次 | 0 | 无 | 认知：谨慎；第二次挑衅触发公会规章，不再是事迹 | cog | 隐 | 四 |
| `deed_mortal_crystal_lit` | 水晶终于亮了一次 | `manual`：全录之日那一天你去鉴定，水晶第一次显示了东西，显示的却是另一页 | 0 | 无 | 认知：凡人不信的反转 | story、cog | 壮 | 五 |

- `deed_mortal_soup_pot`：零名望：挑衅不该得分，记下它只是为了让第一次挑衅成为一个笑话而不是一次损失。
- `deed_mortal_crystal_lit`：【真相】那一页是"排澱之约"（[第五幕 4.4][a5]）；只在全录之日发生时可得，因此是壮举。

### 3.13 隐藏与壮举（`deed_hid_`、`deed_feat_`）

| ID | 名 | 触发 | 名望 | 奖励 | 喂给 | 通道 | 隐 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deed_hid_orphan_mark` | 孩子手上的纹 | `flag:a1_orphan_mark_seen` | 10 | 无 | 羁绊：欧拉；门：`door_resonance` 的远期前置 | bond、story | 隐 | 一 |
| `deed_hid_ferryman_ninth` | 第九个要来了 | `flag:a2_ferryman_ninth` | 10 | 无 | 认知：老船夫的预感 | story | 隐 | 二 |
| `deed_hid_no_page` | 没有那一页 | `flag:a2_aiden_no_page` | 10 | 无 | 认知：艾登在铭录里找不到你（A2-M13） | story | 隐 | 二 |
| `deed_hid_letter7` | 第七封的火漆 | `flag:a6_letter7_delivered` | 25 | 收藏 `ky_last_wax` | 羁绊：夜羽 | bond、story | 隐 | 六 |
| `deed_hid_yeyu_name` | 她叫了你的名字 | `manual`：第六幕夜羽第一次叫你的名字 | 25 | 无 | 羁绊：`col_yeyu_memories` 的那一句 | bond | 隐 | 六 |
| `deed_hid_knocker_home` | 门环回家 | `manual`：把万户街铜门环 `eq_myriad_door_knocker` 挂回叩门童 `door_knocker` 敲的那扇门（门环从背包移除，不可再取） | 10 | 无 | 认知：叩门童散去前回头看了一眼；收藏：`col_restitution_ledger` 一笔（主张者是那一户人家） | story、bond | 隐 | 三 |
| `deed_feat_unbroken_path` | 一次也没回去 | 新·`cond`：第一幕到第三幕末，一次也没有退回门内 | 0 | 记事柱一格 | 认知：边石镇的"不死的人"传闻从来没有机会出现 | collect | 壮 | 三 |
| `deed_feat_released` | 离手 | 新·`cond`：达成真结局"离手"（`ending == release`，D-043） | 0 | 称号 `title_late_released` | 叙事 | story | 壮 | 终 |
| `deed_feat_next_cycle` | 下一期 | `manual`：新周目开局时回声之门显影 | 0 | 称号 `title_late_echo` | 门：回声之门 `door_recall` | key | 壮 | 终 |
| `deed_feat_last_door` | 终门 | 新·`doorState`：`door.last` 为已开 | 0 | 无 | 门：`door_last` | key | 壮 | 终 |
| `deed_feat_none_smelted` | 一个也没熔 | 新·`cond`：到达任一结局时 `gatebronze_smelted == 0`（[遗物 1.5][rel]） | 0 | 称号 `title_late_unsmelted` | 认知：阿什在结局里多说一句"书都还在" | collect、story | 壮 | 终 |

- `deed_hid_orphan_mark`：【真相】孤儿院孩子的门纹（S08）；欧拉的部分在 `trust.oola >= 60` 时说出，遗民的全貌在第三幕遗民之谷。
- `deed_hid_ferryman_ninth`：【真相】第九代魔王将在荒原诞生（`a5_demon_king_born`）；第三幕老船夫只能说"第九个要来了"。
- `deed_hid_no_page`：【真相】铭录为无页之身留有接口（E20），称谓"门的接口"在 `a6_court_open` 之后才可用。
- `deed_hid_letter7`：第七封信的内容以第六幕文档为准，本文不转述；第六封信的内容是全程禁区（[台账 8.0][rl]）。
- `deed_hid_yeyu_name`：【真相】她的残页被契约之门部分覆写（D-052）；她为什么到此刻才叫出你的名字，第六幕说破。

### 3.14 他人事迹（`deed_world_` 模板）

模板按人物实例化（`deed_world_<模板>:<npc_id>`），记在人簿（第四幕起显示）与对方的铭录里；它们是立名关与匠人五关在系统里的落点。
玩家从这里得到的不是名望，而是"我身边的人因为我而有了名字"：每个实例都喂对方的称号与对方对玩家的信念画像。

| ID | 模板 | 主体 | 触发 | 记在哪里 | 对关的作用 | 玩家的角色 | 通道 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deed_world_apprentice_work` | 某人的出师之作 | 无职能的匠人（同伴、雇员、领地匠人） | 在主业中、二档以上工站第一次出杰作（[生业 2.6][gath]） | 铭录改写 Lv10；人簿 | 出师（9 到 10） | 雇主、师傅、署名材的供应者 | craft、cog | 一起 |
| `deed_world_harvest` | 一季丰收 | 农人 | 一季（13 周）内主持的田地收成达到村落的丰收线（[成长 8.2][pp]） | 同上 | 出师（9 到 10） | 领主、良种的提供者 | manage、cog | 二起 |
| `deed_world_tempered` | 淬体之作 | 匠人或熟手 | 在灵穴或迷宫边开炉一季，或在战场上完成一件救命的军需 | 铭录 | 淬体（19 到 20） | 提供工站与战场的人 | craft、war | 三起 |
| `deed_world_named_work` | 名作流传 | 名匠 | 一件署名精品被强者长年使用并被传唱，或同炉套组出世 | 讲述数计入匠人 | 立名（34 到 35） | 持有者：你用它打出的事迹就是匠人的故事 | craft、cog | 三起 |
| `deed_world_final_work` | 终器 | 名匠 | 以一生最在意的东西打出终器（[生业 2.3][gath]） | 铭录 | 明执（49 到 50） | 见证者；材料往往要你去取 | craft、story | 四起 |
| `deed_world_held_place` | 守住一处 | 任何有页者 | 独守一处（桥、门、村口）一夜或一战，被具名目击者看见 | 讲述数 | 立名 | 讲述者：你讲，或你的歌者讲 | cog、war | 一起 |
| `deed_world_surge_last_blow` | 涌潮最后一击 | 有页的同伴或雇员 | 澱涌之主战中补上最后一击或得到名器 | 讲述数 | 立名 | 让出最后一击的人 | cog、power | 三起 |
| `deed_world_lone_walk` | 独自走完 | 候选人、学徒 | 在玩家不在场时独自完成一场试炼 | 讲述数加部族口传 | 立名或定流 | 在外面等的人 | cog、bond | 四 |
| `deed_world_spoke_against` | 拒读 | 有职务的有页者 | 拒绝执行一项不义的命令并承担后果（卡西安拒读谴责文书是原型） | 铭录（加护可能被剥夺）；人簿 | 立名（讲述数照算） | 被保护的人 | cog、divine | 三起 |
| `deed_world_carried_order` | 奉命 | 执行你命令的有页者 | 执行一项会被讲述的命令，善恶皆可 | 铭录称号栏（恶名也写） | 立名（善恶不论） | 下令的人：你没有页，账记在他的页上 | war、cog | 三起 |

## 4. 称号（C）

读法：玩家的称号一律"立名：无"（无页之身没有关可过）；"如何失去"写撤销、褪去、被取代或加注。
可选戴的只有职名与众名（2.4）；俗名、错名、恶名只决定别人怎么叫你，显示在声望面板。

### 4.1 街头俗名（`title_street_`）

从嘲弄到敬畏，再到走样。俗名是地区传闻画像里占比最高的模板（[认知 4.6][rep]），同一时刻不同地区可以各有一个。

| ID | 称号 | 授予 | 谁看得见 | 称呼与认知 | 立名 | 如何失去 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `title_street_f_oddball` | F 级怪人 | 街头：登记之后边石镇的第一个模板 | 边石镇 | "那个 F 级"；身份先验压在凡阶·初 | 无 | 被"运气好的新人"或"打退兽潮的 F 级"取代 | 一 |
| `title_street_crystal_breaker` | 弄坏水晶的 | 街头：`deed_mortal_crystal_broke` 的传闻链（莉娜到朵拉到贝莎） | 边石镇；公会职员之间 | 职员对仪器的信任反扣到你身上；波波给每次鉴定标价 | 无 | 布伦说"别测了"之后，公会内部改口"测不出的那个" | 一 |
| `title_street_lucky_newbie` | 运气好的新人 | 街头：缩小版本（[认知 4.3][rep]），传得最远的那一版 | 边石镇到瓦伦堡的商路 | 解释化的默认解释是"运气"；冒险者不服 | 无 | 可复现证据（`deed_mortal_three_times`）让它在当地失效 | 一到二 |
| `title_street_tide_f` | 打退兽潮的 F 级 | 街头：`a1_tide_credit` 为 `player`（F 级版本占优）时（`deed_hunt_tide_night`） | 边石镇；随伯爵来信到瓦伦堡 | 半讽半敬的"F 级大人"；伯爵来信里的"那个 F 级" | 无 | 到了瓦伦堡被芬恩的歌对照，引出冒名（`title_wrong_impostor`） | 一末 |
| `title_street_heroes_porter` | 勇者的挑夫 | 街头：芬恩 `fynn` 的新歌《勇者与挑夫》（U2-3 后） | 瓦伦堡平民与虔诚者 | 平民当你是勇者团的跟班 | 无 | 城下潮被亲眼看见；或勇者团的纠正被第二个权威采信 | 二 |
| `title_street_hidden_master` | 无名高手 | 街头：佣兵版本（`a2_rumor_shape` 为 hidden_master） | 瓦伦堡佣兵与冒险者 | 挑战者上门；佣兵团出价挖人 | 无 | 被"灰烬男爵"或官方定性取代 | 二 |
| `title_street_unrecorded` | 无记载者 | 街头：公会与学院的行话流到街上 | 瓦伦堡起各城的公会街 | 半是好奇半是忌讳；神职听见会皱眉 | 无 | 不失去；第四幕起与 `title_people_first_page` 并用，意思从"缺了什么"变成"他就是这样" | 二 |
| `title_street_ash_baron` | 灰烬男爵 | 街头：芬恩去王都卖唱，把你唱成"灰烬男爵"，传闻从此定型（[人物一 5][chl]） | 洛萨全境 | 平民叫"男爵大人"，先于诏书；王都贵族当它是玩笑 | 无 | 宫廷剥夺爵位后街头照叫；只有更大的名字能盖过它 | 三 |
| `title_street_three_hundred` | 三百人的 | 军中与街头：鹿渡之战（`deed_war_three_hundred`） | 洛萨东线的兵；帝国斥候 | 兵卒的信任；帝国当你藏着一支军团 | 无 | 随东线热度衰减；参战老兵不忘 | 三 |
| `title_street_crow_bones` | 乌鸦与骨头的领主 | 街头：觐见时满殿窃笑的那一句（U3-1），领民后来拿它当自豪 | 王都宫廷（讥讽）；灰烬边境（自豪） | 同一个名字两种极性：宫廷里是轻视，领地里是归属 | 无 | 不失去；司礼官写诗之后讥讽的一面淡去 | 三 |
| `title_street_outside_lord` | 庭外之主 | 街头：立国之后外国平民对你的统称 | 诸国平民 | 友邦敬、敌国惧；外国人第一次不按"F 级"认识你 | 无 | 国家覆灭或你主动退位 | 四 |
| `title_street_godless` | 不拜神的 | 街头：无神之礼与"不向任何一司献名"的传闻 | 诸国；教国境内为恶名 | 虔诚地区怀疑与敌视，自由城市与魔族好奇 | 无 | 全录之日之后，在信仰崩塌的郡里变成中性 | 四 |
| `title_street_pit_stander` | 站在坑里的人 | 街头：灰烬决战之后的说法 | 全大陆 | 崇拜者的最高称呼，也是挑战者最多的名字 | 无 | 不失去 | 五 |

### 4.2 公会卡（`title_guild_`）

玩家的公会卡永远是手工登记的"Lv1、无职能"（[力量 3.1][pow]）；每个公会称号都是卡上多出来的一行字，卡越写越长，"Lv1"一直在。

| ID | 称号 | 授予 | 谁看得见 | 称呼与认知 | 立名 | 如何失去 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `title_guild_f_handwritten` | F 级（手工登记） | 公会：边石分部，莉娜登记、布伦签字（`deed_grow_registered`） | 出示卡的对象；公会网络 | 职员按"Lv1、无职能"给身份先验；你的第一个可选戴职名 | 无 | 不撤销，只追加 | 一 |
| `title_guild_crystal_debt` | 器材损坏：二 | 公会：分部账房写在卡背（第二块水晶之后） | 看见卡背的人 | 职员一看就笑；波波坚持你该赔两颗水晶 | 无 | 第四幕被奥格划掉，改成"见黑档" | 一到二 |
| `title_guild_b_real` | B（实） | 公会：瓦伦堡大区总部的实绩认定（`deed_hunt_rat_king`） | 公会网络；全城笑柄 | 卡上"B（实），Lv1，无职能"；B 级委托开放；有人说是贿赂来的 | 无 | 只在除名时失去 | 二 |
| `title_guild_baronet_line` | 准男爵（附记） | 公会：边石镇接待员在卡上工工整整加的一行（U3-5） | 出示卡的对象 | 职员开始用敬语，又忍不住看"Lv1" | 无 | 爵位被剥夺时划掉 | 三 |
| `title_guild_black_file` | F（备注：见黑档） | 公会：总堂考官长汉斯·奥格 `hans_auger` 偷偷标上 | 公会总堂与 A 级以上职员 | 总堂把你当"规章之外的已知例外"；黑档里"从门里来的客人"一页 | 无 | 不撤销 | 四 |
| `title_guild_s_by_deed` | S（实绩认定，鉴定栏空白） | 公会：奥格主持的 S 级实绩认定，你走的是规章（"规章里没有给国王开的例外"） | 公会网络；各国军方 | S 级派遣与会盟召集的资格；冒险者对你的身份先验一次跳到传说阶 | 无 | 除名 | 四到五 |

### 4.3 王冠与诸国（`title_crown_`）

| ID | 称号 | 授予 | 谁看得见 | 称呼与认知 | 立名 | 如何失去 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `title_crown_baronet` | 灰烬边境准男爵 | 洛萨王冠：`a2_barony_granted`（`deed_mgmt_barony`） | 洛萨官员与贵族；诏书 | 官员改用职名；权威背书 3；宫廷的宴请与把柄随之而来 | 无 | 宫廷结局敌对时剥夺 | 二末 |
| `title_crown_border_baron` | 灰烬边境男爵 | 洛萨王冠：第三幕王国结局有利时腓力 `philip` 晋封 | 洛萨；外交文书 | 诸侯以平辈相待；街头的"灰烬男爵"终于和诏书一致 | 无 | 同上 | 三 |
| `title_crown_reed_medal` | 苇桥勋 | 洛萨军方：灰烬防线之战后授勋（`deed_war_reed_bridge`）；布丽吉特 `brigitte` 签字时，你可以让她把葛蕾特的名字写在你前面 | 洛萨军方 | 军中信任 | 无（对葛蕾特：一份书面来源） | 不失去 | 三 |
| `title_crown_emperor_seat` | 无冠厅的座签 | 剑帝 `emperor`：`trial_emperor_hook` 胜，他从铁钩上取下座签递还："公会不改，我改。" | 帝国精英与军方 | 帝国精英的信念画像跳一档；军人叫你"座签上的人" | 无 | 用门的能力取胜则座签被收回（`npc.emperor.respect` 附"忌惮"） | 四到五 |
| `title_crown_founder` | 国主（随国体定名） | 界石誓与人簿（`deed_mgmt_nation_founded`） | 本国与诸国 | 称呼随国体（[第四幕 4.4][a4]，D-048）：王政称陛下，议事诸制称议首等 | 无 | 国体变更时改名 | 四 |
| `title_crown_league_seat` | 会盟之席 | 七国会盟（`deed_war_seven_nations`） | 七国宫廷 | 外交文书里与诸王并列 | 无 | 会盟破裂 | 四 |
| `title_crown_pit_after_champion` | 冠军之后 | 斗场主塔德奥 `taddeo_val`：击败斗场冠军席薇 `sive_fell`（`deed_dg_redgravel_seven`） | 帝国民间；斗场看客 | "在我的场子里，输的人也要输得有人记得"：你的事迹在帝国传得更快 | 无（对席薇：她的讲述数随你被讲而上升） | 揭穿假赛后改为"第三十一场的对手"，荣誉不减 | 四 |
| `title_crown_bayguild_guarantor` | 能履约者 | 梅尔卡托同盟商会联合：布鲁娜 `bruna` 的裁定（U2-7 起，第四幕在金湾确认） | 同盟商会 | 赊账与担保；"契约只看签字的人能不能履约。他能。" | 无 | 被 `title_infamy_faithless` 立刻覆盖 | 二到四 |

### 4.4 诸族（`title_tribe_`）

| ID | 称号 | 授予 | 谁看得见 | 称呼与认知 | 立名 | 如何失去 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `title_tribe_night_hornseat` | 角位 | 夜境：祭斗长乌加 `uga_brokenhorn` 承认（`deed_dg_edge_seven_caves`） | 魔族 | 魔族以平辈相待；挑衅即邀请，藏拙被看作懦夫 | 无 | 拒绝一场公平的决斗 | 四 |
| `title_tribe_elf_silent_walker` | 默行者 | 精灵：长老艾尔温 `elwin`（`deed_bond_trial_elwin`） | 希尔瓦精灵 | 守泉者放行；精灵把你从"外族"改记为"走过林子的人" | 无 | 在林中杀死被托付的生灵 | 四 |
| `title_tribe_orc_unthrown` | 摔不倒的 | 兽人：乌尔萨克 `ursak` 与百帐营（`deed_mortal_slippery`） | 见过你的兽人 | 兽人亲眼即信、传闻无效，这个名字只在见过你的人之间流传 | 无 | 当众输一场摔跤（被笑，不丢信任） | 三 |
| `title_tribe_dwarf_cross_section` | 看过断面的人 | 矮人：巴尔加 `barga` 与赤砧山炉长会；矮人只认物证 | 矮人 | 矮人对你的事迹改按物证计权，传闻折扣取消 | 无 | 拿伪造的物证给矮人看 | 一到四 |
| `title_tribe_halfling_bellroad` | 铃路的熟脸 | 半身人：铃路会与老信差欧迪 `oddie_roundstone` | 半身人与铃路沿线 | 半身人不在乎信不信，但一定转述：你的传闻在铃路上跑得最快，失真也最大 | 无 | 不失去 | 二到四 |
| `title_tribe_dragon_shadow` | 影子的影子 | 龙族：对骑飞蜥落地的你的评语（[兽伴目录][cre]） | 龙族 | 龙族不再看第二眼；龙族不命名，这是它们唯一会给的称呼 | 无 | 不再骑飞蜥 | 五 |

### 4.5 教会：赐名与烙印（`title_church_`）

| ID | 称号 | 授予 | 谁看得见 | 称呼与认知 | 立名 | 如何失去 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `title_church_spec_outsider` | 规格外者 | 圣教会：审判庭的机构定性（[认知 5.2][rep]） | 教会文书；赛琳 `selene` 的卷宗 | 神职按定性称呼；审判官的盘查；教会成员的背书对你反向计权 | 无 | 光之审平反；或升级为异端 | 二 |
| `title_church_flawed_by_door` | 带门之瑕者 | 神谕：艾琉恩神谕文本里唯一可用的指称（[台账 8.3][rl]） | 神谕链（大主教到审判官） | 被神谕追查；信徒听到这个词就去看人的手背 | 无 | 第六幕终审 | 二 |
| `title_church_heretic` | 异端 | 圣教会：光之审定罪或宣布（P3 动作） | 教国全境与各地礼拜堂 | 逮捕令；礼拜堂拒绝施治；卫兵盘问 | 无 | 光之审平反、赛琳的证词、全录之日、第六幕终审 | 二到三 |
| `title_church_herald_of_demon` | 魔王的先驱 | 圣教会：MIS-07 的官方版本 | 圣战军、教国信众、征召兵 | 圣战目标；征召兵问"是不是有角"（U3-4） | 无 | 全录之日；第六幕终审 | 三到五 |
| `title_church_oathhoof_friend` | 誓蹄之友 | 圣骑士团：大团长埃德蒙 `edmond_lacroix` 赠誓蹄（`deed_bond_oathhoof`） | 圣骑士团与圣殿卫队 | 圣殿卫队行礼；教会内部的分裂公开化 | 无 | 背弃圣骑士团的托付 | 四到五 |

### 4.6 同伴与 NPC 的传颂级称号（`title_named_`）

这一节是立名关的出口：全部由铭录写在有页者的称号栏（夜羽写在残页上），鉴定读得到。"授予"写的是哪件事迹喂出来的。

| ID | 称号 | 授予 | 谁看得见 | 称呼与认知 | 立名 | 如何失去 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `title_named_shiya` | 东坡之弓；若兽潮第一波的功劳让给她，则为"挡住黑脊的人" | 铭录自动规则：`deed_bond_named_shiya` | 鉴定可读；洛萨北境 | 猎户与兽人诸部以名字称她；她对你的崇拜里多一分"我自己也行" | 是：第三幕过 34 | 若功劳本属你且你当众说破，加注"存疑" | 三 |
| `title_named_yeyu` | 认路的乌鸦 | 铭录：写在残页上（D-052），出自"至少乌鸦认得路"（U3-1）流传开的版本 | 鉴定仍只读"残页，Lv ？"；乌鸦与半身人信差都知道这个名字 | 大陆上的乌鸦给她让路；外交场合她的毒舌被当成"传说里的乌鸦就是这样" | 是：第三幕过 34 | 不加注 | 三 |
| `title_named_ron` | "不可能"将军 | 铭录：兵卒的版本（他每战之前都说"不可能"，然后守住），`deed_bond_named_ron` | 鉴定可读；本国军中 | 兵卒的士气；莫伊拉若附 I 级称号加护，他的连队在崩溃判定前多撑一轮，代价是他成为她的视线锚 | 是：第五幕过 34 | 临阵脱逃时加注（几乎不可能） | 五 |
| `title_named_selene` | 照规之眼（教会版本）；作证之后另有"颤抖的证人" | 铭录：教会的传颂（第三幕）；第二个称号在 `a3_selene_tremble_told` 之后、她公开作证时由街头传开 | 鉴定可读；教国与庭外之国 | 教会版本给她教国的敬畏，第二个给她庭外之国的信任 | 是：第三幕过 34（正典 Lv38） | 教会版本在她叛离后加注"已离教" | 三 |
| `title_named_heroes_glory` | 余威所至 | 铭录：主体替换把你清鼠王巢的讲述数记到勇者团名下（`deed_mortal_heroes_glory`），写在四人的页上 | 鉴定可读；全大陆信众 | 教会把它当勇者的第一笔功绩宣讲；陆辰 `luchen` 每次被这样称呼都不自在 | 是：勇者团第三幕的立名由此提前（[力量 10.4][pow]） | 陆辰当众纠正并被权威采信后加注"存疑"；四人不退位阶 | 二 |
| `title_named_grete` | 苇桥的守夜人 | 铭录：`trial_grete_bridge` 之后，你或你的歌者把 968 年那一夜讲出去 | 鉴定可读；洛萨 | 她到 35，能当真正的将领；她也从此被诸神看见 | 是：三十年后过 34 | 不加注；小领主之子的"苇桥之盾"同时加注"存疑" | 三 |
| `title_named_sive` | 第三十一场 | 铭录：揭穿假赛（`deed_dg_redgravel_fixed`）后，她第一场没被安排的比赛被帝国传颂 | 鉴定可读；帝国 | 她去找萨莎学不带加护的打法 | 是：她已是英雄阶，本称号顶替被加注的旧称号"不倒"，保住她的称号加护 | 不加注 | 四 |
| `title_named_martha_old` | 晚钟（旧称号） | 铭录：二十多年前 A 级时代写下 | 鉴定可读，但镇上从没人给她鉴定；`a3_martha_tale` 之前不对玩家显示 | 布伦和奥托叫出这个名字时会停一下 | 已过（英雄阶 Lv43） | 不加注 | 三 |
| `title_named_master_smith` | 某器的某匠（模板，例：晶背剑的巴尔加） | 铭录：`deed_world_named_work`；你用他的器物打出的事迹就是他的故事 | 鉴定可读；匠人所在地区 | 客匠来投；他的工坊杰作率上升（城建） | 是：匠人的立名 | 器物来历被证明不实时加注 | 三起 |
| `title_named_lone_walker` | 独自走完墓道的人（模板） | 铭录：`deed_world_lone_walk` | 鉴定可读；部族 | 部族把候选人当成萨满；他记得你在外面等 | 是，或定流 | 不加注 | 四 |
| `title_named_surge_slayer` | 某涌之终（模板，例：冰钟之终） | 铭录：`deed_world_surge_last_blow` | 鉴定可读；该涌潮的地区 | 凡人立名的典型：一件名器加一个名字 | 是 | 名器被夺不加注，但名字从此和器物绑在一起 | 三起 |

### 4.7 错名与恶名（`title_wrong_`、`title_infamy_`）

| ID | 称号 | 授予 | 谁看得见 | 称呼与认知 | 立名 | 如何失去 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `title_wrong_impostor` | 冒名的 | 卫兵：芬恩的歌把你唱成两米高的金发骑士，卫兵长卡尔 `karl` 据此判定你冒名（U2-1） | 瓦伦堡北门 | 每次进门被盘问，收"冒名税"；出示公会卡更不信 | 无 | 卡尔亲眼看见（`deed_mortal_blond_knight`） | 二 |
| `title_wrong_bribed_b` | 贿赂来的 B | 街头：第二块坏水晶之后（U2-2） | 瓦伦堡冒险者 | 冒险者不服，考官记恨，委托人压价 | 无 | 当众复现一次 | 二 |
| `title_wrong_bad_luck` | 带衰的 | 商人：水晶失灵的传闻经商人的极性偏转（[认知 10][rep] 桥段 1） | 商人圈 | 价格加一档；商队不肯同行 | 无 | 布鲁娜的裁定，或你同行的商队平安归来被多源证实 | 一到二 |
| `title_wrong_witch_accomplice` | 魔女同谋 | 街头：魔女审判期间贝莎的版本（[第一幕 4.2][a1]） | 边石镇；随审判庭卷宗到瓦伦堡 | 卫兵盘问变多（[认知 5.3][rep]）；礼拜堂冷遇 | 无 | 欧拉平反（`deed_bond_oola_cleared`） | 一 |
| `title_wrong_bandit_chief` | 大当家 | 北境逃兵：一进领地就跪下喊（U3-7） | 北境逃兵与北境军 | 北境把你的领地当匪窝；雷吉斯 `regis` 一人一脚把他们踹起来 | 无 | 整编，或劝他们回北境自首 | 三 |
| `title_wrong_horned_one` | 长角的那位 | 圣战军征召兵：把讲道里的"魔王先驱"想象成有角、有几只眼（U3-4） | 征召兵 | 征召兵见到你本人时认不出你；约尔格 `jorg` 是说服路线的种子 | 无 | 被俘者亲眼看见你递水 | 三 |
| `title_infamy_faithless` | 失信者 | 同盟商会联合：凡人违背契约的标签（D-047） | 梅尔卡托与各地商会 | 契约被拒、赊账取消、价格上浮；与你立约的有页同伴可能被契约权能追讨 | 无 | 赔付并经仲裁裁定；不会自然消退 | 二起 |
| `title_infamy_butcher` | 屠者 | 街头与各族：屠戮降者或平民被目击 | 事发地区，随商队扩散 | 招募意愿崩塌；居民逃离；崇拜者里出现最危险的那种 | 无 | 只能由人簿的裁决、归还与赔偿慢慢变冷，不会被擦掉 | 二起 |
| `title_infamy_blade_taker` | 夺器者 | 名器或传器的前任持有者：以武力夺走他们的器物（[总纲 6.3][bible]） | 前任持有者的势力 | 该势力敌视；名匠拒绝为你开锋 | 无 | 归还器物（计入 `col_restitution_ledger`） | 三起 |
| `title_infamy_grave_robber` | 掘冢者 | 冢的守护者：守冢婆、守冢狼、祖灵冢的萨满；拿走银巢的龙蜕也算 | 风牙诸部、北麓山民、龙族 | 守冢的亡灵与兽对你敌对；原龙的影子不再掠过 | 无 | 归还冢中之物；卖掉的龙蜕再也还不回去 | 四起 |
| `title_infamy_carried_order` | 奉命者的恶名（模板，例：焚村的某某） | 铭录：`deed_world_carried_order` 的恶的一面，写在执行者的页上 | 鉴定可读 | 执行者被鉴定时人们后退一步；他对你的画像转向"依赖"或"敌视" | 是：恶名照样立名 | 命令的真相公开时加注"奉命"，而你没有页，下令者那一栏永远空着 | 三起 |

### 4.8 收藏与事迹附带的称号（`title_col_`、`title_rare_`、`title_dg_`、`title_bond_`、`title_war_`）

遗物目录请求的称号（[遗物 8.1][rel]）与迷宫、人物目录请求的称号（[人物二 8.2][chc]）都在这里落 ID。

| ID | 称号 | 授予 | 谁看得见 | 称呼与认知 | 立名 | 如何失去 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `title_col_neighbor_collector` | 邻庭的收藏家 | `deed_col_guest_relics`，`a6_earth_truth` 之后 | 本国与审庭 | 地球知识的解析速度（遗物目录的套组效果）；回忆对话 | 无 | 不失去 | 六 |
| `title_col_trophy_wall` | 四十个名字 | `deed_col_named_trophies` | 庭院访客；猎户与公会 | 猎户的敬意；各地的异名者悬赏告示先送到你手里（不改变异名者的 `rumorScale`） | 无 | 不失去 | 四到五 |
| `title_col_eight_lights` | 八光的收殓人 | `deed_col_eight_heroes` | 北境、勇者团、老船夫 | 北境人更信你讲的勇者故事；陆辰与老船夫的对话 | 无 | 不失去 | 五 |
| `title_col_eight_crowns` | 守冠人 | `deed_col_eight_kings` | 夜境 | 夜境旧贵族把你当守陵人而不是盗墓者（与 `title_infamy_grave_robber` 互斥） | 无 | 卖掉其中任何一件 | 五 |
| `title_col_letter_carrier` | 送信人 | `deed_col_unsent_letters` | 洛萨北境；半身人 | 收信人家的画像加"我们从北方来"；夜羽 | 无 | 不失去 | 三到五 |
| `title_col_bring_home` | 带他们回家 | `deed_col_fallen_badges` | 冒险者公会 | 公会信任；玛莎与布伦叫你时语气会变 | 无 | 不失去 | 一到五 |
| `title_col_six_greys` | 辨灰人 | `deed_col_six_greys` | 学者与澱哨 | 学者对你的证词按可复现类加权 | 无 | 不失去 | 五 |
| `title_col_duelist` | 斗证在身 | `deed_col_duel_tokens` | 夜境与红砾城 | 瓦尔妲派来的挑战者更多 | 无 | 连续拒绝三次挑战 | 四 |
| `title_col_songkeeper` | 记歌的人 | `deed_col_songs_tales` | 诗人与酒馆 | 诗人愿意把你给的版本唱对（失真减半） | 无 | 不失去 | 二到四 |
| `title_col_restorer` | 归还者 | `deed_col_restitution` | 各族首领 | 首领的画像加"他会把东西还回来" | 无 | 背上 `title_infamy_blade_taker` 时暂隐 | 三到六 |
| `title_col_seven_steles` | 七碑同读 | `deed_col_seven_steles` | 学者、神职与龙族 | 学者把你当作读过全部七碑的人：你对规约的陈述按书面来源计权；神职对你多一分戒备 | 无 | 不失去 | 五到六 |
| `title_rare_gentle_hand` | 留手的人 | `deed_rare_spared_route` | 猎户、萨满、精灵 | 这几类人托你处理异名者时会先问"能不能不杀" | 无 | 不失去 | 四 |
| `title_dg_three_ways` | 三择者 | `deed_dg_three_ways` | 领地官员与公会 | 迷宫的养毁净来问你 | 无 | 不失去 | 三 |
| `title_bond_nodded_at` | 被点过头的人 | `deed_bond_hidden_six` | 隐藏强者之间（他们互相认识） | 他们不再试你；他们背后的制度对你放行一次 | 无 | 挑衅任何一位两次 | 四到五 |
| `title_bond_soup_bell_heir` | 汤与铃的后来者 | `deed_bond_soup_and_bell` | 公会老一辈；面摊后巷 | 老冒险者讲起当年会把你算进去 | 无 | 不失去 | 四 |
| `title_bond_door_opener` | 开门的 | 夜羽：`deed_bond_door_opener`（她从此这样叫你） | 夜羽；听过她叫你的同伴与遗民 | 遗民听见夜羽这样叫你，对你的信念画像加"她认得的人"；第六幕之前没有人知道这个称呼的分量 | 无 | 不失去 | 三 |
| `title_war_ring_keeper` | 守环人 | `deed_war_gate_ring` | 各承建种族；遗民 | 遗民与执钥人把你当同伴而不是主人 | 无 | 不失去 | 五 |
| `title_war_dismantlers_foe` | 拆门队之敌 | `deed_war_dismantlers`；审判庭的通缉文书 | 教国（恶名）；遗民与门环线（美名） | 同一个名字两种极性 | 无 | 第六幕终审 | 五 |

### 4.9 晚期与跨国（`title_people_`、`title_late_`、`title_court_`）

| ID | 称号 | 授予 | 谁看得见 | 称呼与认知 | 立名 | 如何失去 | 幕 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `title_people_first_page` | 第一页上的名字 | 人簿：`deed_mgmt_people_register` | 本国国民；外国人看作书面 | 国民用你的本名叫你，不是 F 级，也不是男爵：这是你唯一被"写下"的名字 | 无 | 不失去 | 四 |
| `title_people_namegiver` | 给人名字的人 | 人簿众名：`deed_bond_named_three`，议事日通过 | 本国 | 国民把孩子带来"让他沾一沾" | 无 | 议事日撤回（极少） | 四到五 |
| `title_people_fine_without_you` | 不在也行的人 | 人簿众名：`deed_mgmt_year_without_you` | 本国 | 国民对你的称呼从敬畏转向亲近 | 无 | 国家在你离开时出事并由你紧急返回 | 四到五 |
| `title_late_known_abroad` | 诸国皆知 | 街头：`deed_exp_nine_lands` 与七个地区的传闻画像 | 全大陆 | 外国陌生人的身份先验不再从"无记载者"起步 | 无 | 不失去 | 五 |
| `title_late_ownerless` | 无主之人 | 五司档案里的共同标注：`deed_god_ownerless` | 女神（档案）；你告诉的人 | 第六幕庭上五司都说不出你是谁的人 | 无 | 不失去 | 五 |
| `title_court_guest_scroll` | 客卷之主 | 莫伊拉：她为你单独写的客卷封面（[第四幕 7.3][a4]） | 莫伊拉与你（第四幕起她给你看） | 莫伊拉的称呼；`goddess.moira.gaze` 越高她越能预判你 | 无 | 不失去；你交出的记忆在客卷里也是空白页 | 四 |
| `title_late_released` | 离手的人 | 真结局：`deed_feat_released` | 终章 | 后日谈里所有人对你的称呼 | 无 | 不失去 | 终 |
| `title_late_echo` | 回声 | 新周目：`deed_feat_next_cycle` | 下一期的门镜 | 门镜边多一道上一期留下的刻痕 | 无 | 不失去 | 终 |
| `title_late_unsmelted` | 一个也没熔 | 结局：`deed_feat_none_smelted` | 后日谈；阿什 | 后日谈里史馆把你记作"没有熔掉任何一段历史的人" | 无 | 不失去 | 终 |

## 5. 联动表（D）

### 5.1 异名者 40：落名的事迹

"可不杀"标出[图鉴 5][best]统计的十二只可以不靠击杀拿到异名物的异名者（送魂 6、净化 2、驯服或活捕 4），它们同时计入 `deed_rare_spared_route`。

| 区域 | 异名者 → 事迹（异名物） |
| --- | --- |
| `lotha`（9） | `split_ear` → `deed_rare_split_ear`（`split_ear_fang`）；`black_ridge` → `deed_rare_black_ridge`（`black_ridge_mantle`）；`red_sock` → `deed_rare_red_sock`（`nm_faded_red_sock`）；`three_toes` → `deed_rare_three_toes`（`nm_three_toes_antler`，可不杀）；`bell_weeper` → `deed_rare_bell_weeper`（`nm_oldwatch_clapper`，可不杀）；`ironbelly` → `deed_rare_ironbelly`（`nm_ironbelly_gizzard`）；`frostbeard` → `deed_rare_frostbeard`（`nm_frostbeard_ruff`，留它活着另有用）；`oakwall_warden` → `deed_rare_oakwall_warden`（`nm_warden_lantern`，可不杀）；`pale_bishop` → `deed_rare_pale_bishop`（`nm_porcelain_incisor`） |
| `waste`（8） | `toll_taker` → `deed_rare_toll_taker`（`nm_brass_dog_tag`）；`old_louse` → `deed_rare_old_louse`（`nm_louse_belly_crystal`）；`ashstorm_shepherd` → `deed_rare_ashstorm_shepherd`（`nm_bone_whistle`）；`glass_bride` → `deed_rare_glass_bride`（`nm_glass_sealed_ring`，可不杀）；`late_courier` → `deed_rare_late_courier`（`nm_undelivered_letter`，可不杀）；`cross_shovel` → `deed_rare_cross_shovel`（`nm_sealed_shovel`）；`thousand_lamps` → `deed_rare_thousand_lamps`（`nm_last_gate_lamp`）；`stilled_hammer` → `deed_rare_stilled_hammer`（`nm_unstruck_chisel`，可不杀） |
| `holysee`（3） | `vesper_sister` → `deed_rare_vesper_sister`（`nm_silent_bell_tongue`）；`shadowless` → `deed_rare_shadowless`（`nm_shadowless_fang`）；`procession_tail` → `deed_rare_procession_tail`（`nm_procession_seal`） |
| `grantia`（4） | `old_legate` → `deed_rare_old_legate`（`nm_rollcall_board`）；`first_page` → `deed_rare_first_page`（`nm_first_page_draft`）；`crowd_favorite` → `deed_rare_crowd_favorite`（`nm_champion_horn`，可不杀）；`hiltless` → `deed_rare_hiltless`（`nm_hiltless_shard`） |
| `mercato`（4） | `old_scale` → `deed_rare_old_scale`（`nm_old_scale_pan`）；`fat_goldbay` → `deed_rare_fat_goldbay`（`nm_swallowed_signet`）；`the_clerk` → `deed_rare_the_clerk`（`nm_abacus_bead`）；`wreck_bell` → `deed_rare_wreck_bell`（`nm_harbor_master_chain`） |
| `silva`（3） | `mossback` → `deed_rare_mossback`（`nm_moss_mantle`，可不杀）；`the_gardener` → `deed_rare_the_gardener`（`nm_gardener_pod`）；`ring_whisperer` → `deed_rare_ring_whisperer`（`nm_first_molt`） |
| `windfang`（3） | `whitehorn` → `deed_rare_whitehorn`（`nm_whitehorn_sheath`，可不杀）；`thousand_mouths` → `deed_rare_thousand_mouths`（`nm_swarm_queen_wing`）；`barrow_grandmother` → `deed_rare_barrow_grandmother`（`nm_ancestor_beads`，可不杀） |
| `night`（3） | `frosthorn_steed` → `deed_rare_frosthorn_steed`（`nm_frosthorn_saddle_ring`，可不杀）；`half_face` → `deed_rare_half_face`（`nm_half_mask`）；`ninety_nine` → `deed_rare_ninety_nine`（`nm_hundredth_ribbon`） |
| `sleepscale`（3） | `tomb_keeper_wolf` → `deed_rare_tomb_keeper_wolf`（`nm_shieldbearer_collar`，可不杀）；`red_freckle` → `deed_rare_red_freckle`（`nm_freckled_scale`）；`scale_orphan` → `deed_rare_scale_orphan`（`nm_orphan_reverse_scale`） |
| 跨区 | 全部异名物 → `deed_col_named_trophies`（零名望）与 `title_col_trophy_wall`；继名者 → `deed_rare_inherited`；辟谣 → `deed_rare_hushed` |

### 5.2 迷宫 23

| 迷宫 | 本类事迹 | 别类事迹 | 喂给的门或称号 |
| --- | --- | --- | --- |
| `dg_seal_ruins` | `deed_dg_seal_grey_page` | `deed_exp_gatesite_pair`（初门神殿） | `door_wayfaring` |
| `dg_old_mine` | `deed_dg_old_mine_one_night` | `deed_mortal_dwarf_mechanism` | 无 |
| `dg_moon_cellar` | `deed_dg_moon_cellar_untouched` | 无 | `trial_martha_evening_bell` 的解锁倾向 |
| `dg_old_waterway` | `deed_dg_waterway_none_missing` | `deed_hunt_rat_king`、`deed_mortal_heroes_glory`、`deed_exp_gatesite_pair`（第三十七门） | `door_resonance`；`title_named_heroes_glory` |
| `dg_frostbone_crypt` | `deed_dg_frostbone_names` | `deed_hunt_surge_frostbell` | 无 |
| `dg_gate_stations` | `deed_dg_stations_all_lit` | `deed_rare_late_courier`、`deed_exp_gatesite_third` | `door_wayfaring` |
| `dg_thousand_archive` | `deed_dg_archive_no_burn` | `deed_truth_ash_sundering`、`deed_exp_pit_gaze`、`deed_col_thousand_archive` | `door_echoes` |
| `dg_rustridge_deep` | `deed_dg_rustridge_hollow_stone` | 无 | 无 |
| `dg_myriad_street` | `deed_dg_myriad_twelve_letters` | `deed_col_unsent_letters` | `title_col_letter_carrier` |
| `dg_martyr_catacomb` | `deed_dg_martyr_reliquaries` | `deed_hunt_surge_pale_choir`（失控时提前涌） | 无 |
| `dg_skriva_vault` | `deed_dg_skriva_star_table` | `deed_rare_first_page` | 空白之门 `door_truth_blank_era`（物证线） |
| `dg_redgravel_pit` | `deed_dg_redgravel_seven`、`deed_dg_redgravel_fixed` | `deed_col_duel_tokens` | `title_crown_pit_after_champion`、`title_named_sive` |
| `dg_wreck_bay` | `deed_dg_wreck_harbor` | `deed_rare_wreck_bell` | `door_wayfaring` |
| `dg_ancestor_barrow` | `deed_dg_barrow_wait` | `deed_rare_barrow_grandmother` | `title_named_lone_walker` |
| `dg_deep_forge` | `deed_dg_forge_mortal_oath` | `deed_mgmt_mortal_contract` | 无 |
| `dg_edge_trial` | `deed_dg_edge_seven_caves` | `deed_rare_ninety_nine`、`deed_exp_stele_customs`（斗碑）、`deed_bond_trial_sasha`（斗碑前） | `title_tribe_night_hornseat` |
| `dg_root_abyss` | `deed_dg_root_sorrow_sapling` | `deed_bond_trial_elwin`（途经） | `door_clear_flow` |
| `dg_horncrown_ruins` | `deed_dg_horncrown_empty_dais` | `deed_bond_trial_vespera` | 无 |
| `dg_withered_ring` | `deed_dg_withered_turns` | `deed_rare_ring_whisperer`、`deed_hunt_surge_rotcrown` | 无 |
| `dg_womb_abyss` | `deed_dg_womb_none_chosen` | `deed_rare_half_face`、`deed_hunt_surge_redhorn` | 无 |
| `dg_fallen_hero_tomb` | `deed_dg_tomb_sword_left` | `deed_rare_hiltless`、`deed_rare_tomb_keeper_wolf` | 无 |
| `dg_abyss_lord_wreck` | `deed_dg_abyss_four_hearts` | 无 | 无 |
| `dg_main_gate_pit` | 终战记在战争类 | `deed_war_faceless_king`、`deed_exp_main_gatestone` | `title_street_pit_stander` |

横向：`deed_dg_three_ways` 跨全部迷宫（养、毁、净各一次）。

### 5.3 更强者：可挑战段 9 与隐藏强者 12

可挑战段（[迷宫目录 6][dgc]）"赢、输、拒绝三种结果都有意义"；本文只把赢写成事迹，输与拒绝的意义留在关系与世界状态里，不给事迹（不奖励尝试）。

| 段 | 事迹 | 赢得什么 | 不赢时的记录 |
| --- | --- | --- | --- |
| `trial_martha_evening_bell` | `deed_bond_trial_martha` | 晚钟之门与铁卫之门的历钥 | 吵醒楼上算平，不记 |
| `trial_ferryman_crossing` | `deed_bond_trial_ferryman` | 行路之门的门址感知 | 船翻了他捞你上来，照收五个铜子 |
| `trial_sasha_third_round` | `deed_bond_trial_sasha` | 第五幕招募条件 | 第一回合已由 `deed_hunt_redfang_round` 记过 |
| `trial_ash_vigil` | `deed_bond_trial_ash` | "门是可以关上的" | 开了门：若是第一扇危险之门，记 `deed_god_danger_door`（代价型） |
| `trial_emperor_hook` | `deed_bond_trial_emperor` | 胜：`title_crown_emperor_seat`；负：剑理历钥 | 用门取胜：不记，座签收回 |
| `trial_vespera_eight_wars` | `deed_bond_trial_vespera` | `trust.night_queen` 与月下之约条款 | 无 |
| `trial_elwin_silent_walk` | `deed_bond_trial_elwin` | `title_tribe_elf_silent_walker` | 下一季可再走 |
| `trial_grete_bridge` | `deed_bond_trial_grete` | 可选立名：`title_named_grete` | 落水，帮她搬一上午石头 |
| `trial_eska_silver_eyrie` | `deed_bond_trial_eska`（隐） | 原龙判定的一份分量 | 拿走龙蜕：`title_infamy_grave_robber` |

隐藏强者（[人物二 3.11][chc]）每人都计入 `deed_bond_hidden_six` 与 `title_bond_nodded_at`；下表只列另外挂钩的事迹与称号。

| ID | 另外挂钩 |
| --- | --- |
| `luise_schnee` | `deed_bond_soup_and_bell`、`title_bond_soup_bell_heir`；第一次挑衅 `deed_mortal_soup_pot` |
| `oddie_roundstone` | `deed_bond_soup_and_bell`、`title_bond_soup_bell_heir`、`title_tribe_halfling_bellroad` |
| `oren_greyhood` | `deed_dg_tomb_sword_left`（他的认可，亦是第六幕证人条件） |
| `tobias_vell` | `deed_exp_stele_customs`（圣碑拓的默许线） |
| `bernhard_amboss` | `deed_mgmt_craft_open_edge`（帝国钢名器的开锋人候选） |
| `samuel_gran` | `deed_dg_skriva_star_table` |
| `sera_silenthorn` | `deed_rare_barrow_grandmother`、`deed_dg_barrow_wait` |
| `nuun_windahead` | 无（战役传令单位） |
| `otta_coalhand` | `deed_dg_forge_mortal_oath` |
| `eslin_brokenstring` | `deed_col_songs_tales`（他唱出《静苔长歌》`lb_stillmoss_longsong` 全本之后，它是"歌与谣"的隐藏第九件，[遗物 6][rel]） |
| `bri_ladle` | 无（宫廷情报） |
| `moku_tidepilot` | `deed_dg_wreck_harbor`（雾边航路） |

### 5.4 收藏

| 收藏 | 事迹 | 称号 |
| --- | --- | --- |
| `col_earth_keepsakes` | `deed_col_earth_keepsakes` | 无 |
| `col_guest_relics` | `deed_col_guest_relics` | `title_col_neighbor_collector` |
| `col_named_trophies` | `deed_col_named_trophies` | `title_col_trophy_wall` |
| `col_gatestones` | `deed_col_gatestones` | 无 |
| `col_seven_steles` | `deed_col_seven_steles` | `title_col_seven_steles` |
| `col_doorsong` | `deed_col_doorsong` | 无 |
| `col_yeyu_memories` | `deed_col_yeyu_memories` | 无 |
| `col_yeyu_shinies` | `deed_col_yeyu_shinies` | 无 |
| `col_eight_heroes` | `deed_col_eight_heroes` | `title_col_eight_lights` |
| `col_eight_kings` | `deed_col_eight_kings` | `title_col_eight_crowns` |
| `col_unsent_letters` | `deed_col_unsent_letters` | `title_col_letter_carrier` |
| `col_fallen_badges` | `deed_col_fallen_badges` | `title_col_bring_home` |
| `col_six_fingerprints` | `deed_col_six_greys` | `title_col_six_greys` |
| `col_pale_reliquary` | `deed_col_pale_reliquary` | 无 |
| `col_duel_tokens` | `deed_col_duel_tokens` | `title_col_duelist` |
| `col_war_banners` | `deed_war_banner_returned`（曾藏） | 无 |
| `col_thousand_archive` | `deed_col_thousand_archive` | 无 |
| `col_songs_and_tales` | `deed_col_songs_tales` | `title_col_songkeeper` |
| `col_restitution_ledger` | `deed_col_restitution` | `title_col_restorer` |
| `col_garden_creatures` | `deed_col_garden_creatures` | 无 |

不设完成事迹的十项收藏与理由：`col_coins_of_the_age`、`col_ancient_coins`、`col_seven_aspect_herbarium`、`col_map_chest`、`col_hearth_books`、`col_laws_of_nations`、
`col_church_texts` 的完成奖励是便利、经营或一条对话分支，没有称号请求，再给事迹就是纯凑齐计数；`col_boundary_proofs` 的认知由 `deed_exp_falling_iron`
与剑帝星象台承担，`col_dragon_traces` 由 `deed_exp_stele_sky` 承担，`col_blank_era_proofs` 由 `deed_truth_sealed_room` 承担，`col_gate_era_daily`
由 `deed_dg_myriad_twelve_letters` 承担：同一个认知不记两次。

### 5.5 匠人五关

| 关 | 匠人的过法（[生业 2.3][gath]） | 他人事迹 | 玩家事迹 | 称号 |
| --- | --- | --- | --- | --- |
| 出师（9 到 10） | 主业中第一次出杰作；农人一季丰收 | `deed_world_apprentice_work`、`deed_world_harvest` | `deed_mgmt_craft_first_masterwork`（玩家：生业之门历钥）、`deed_mgmt_craft_patron` | 无 |
| 淬体（19 到 20） | 灵穴或迷宫边开炉一季；战场上的救命军需 | `deed_world_tempered` | 无（玩家不过关） | 无 |
| 立名（34 到 35） | 名作流传；同炉套组出世 | `deed_world_named_work` | `deed_mgmt_craft_same_forge`、`deed_mgmt_craft_open_edge` | `title_named_master_smith` |
| 明执（49 到 50） | 终器 | `deed_world_final_work` | 无 | 无 |
| 外缘（59 到 60） | 外缘之作 | 凡人匠人的外缘之作随葬或供奉后归遗物目录 | `deed_mgmt_craft_outer_edge` | 无 |

### 5.6 第六幕证人

证人的传唤条件以[第六幕][a6]与[人物二 3.12][chc]为准；本文的事迹只把"条件达成的那一刻"写进人簿，给证词一个有日期的旁证，
不改变证词的分量与组合规则。没有对应事迹的证人，传唤条件本身就是剧情标记，不重复记录。

| 证人 | 传唤条件 | 记录它的事迹或称号 | 证据 |
| --- | --- | --- | --- |
| 守门人阿什 `ash` | `a3_ash_tells_sundering` | `deed_truth_ash_sundering` | E01 |
| 长老艾尔温 `elwin` | `a4_elwin_testimony` | `deed_bond_trial_elwin`（公证意愿，不改条件） | E03 |
| 老船夫 `ferryman` | 第五幕存活且作证 | `deed_truth_ferryman`、`deed_bond_trial_ferryman` | E09 |
| 赛琳 `selene` | `a3_selene_tremble_told` 且存活 | `title_named_selene` 的第二个称号 | E15 |
| 勇者团（`luchen`、`yui`、`aiden`） | 传唤 | `deed_mortal_heroes_glory`、`deed_col_eight_heroes` | E35 |
| 无貌者 `faceless` | `a5_faceless_end` 为救赎 | `deed_truth_faceless_projection` | E18 |
| 原龙艾斯卡 `eska` | `a5_eska_consent` | `deed_god_eska_consent` | E30 |
| 老布伦 `bron`（人簿） | 人簿运转一年以上，布伦交出手录 | `deed_mgmt_register_year` | E26 |
| `oren_greyhood` | 走过堕勇之墓线并得其认可 | `deed_dg_tomb_sword_left` | E13 |
| `tobias_vell` | 碑庭事件后取得信任 | `deed_exp_stele_customs` | E08 |
| `ilsa_moen` | 读过正史原本 | `deed_rare_vesper_sister` | E07 第十页 |
| `samuel_gran` | 禁书库已开 | `deed_dg_skriva_star_table` | E31 |
| `eld_rahn` | 星表互换线索已得 | `deed_dg_skriva_star_table` | E14 |
| `ophira_doorsong` | 根下庭不为"被毁" | `deed_col_doorsong` | E04 |
| `vig_holm` | `moira_pages` 高 | `deed_god_moira_story` | E10、E29 |
| 其余证人（`vena_vinewidow`、`ottilie_nash`、`branka_voss`、`selu_newshed`、`gilbert_nos`、`brice_herald`、`roderick_gul`、`herda_scaleheart`、`marei_mossstone`、`ludovic_behn`、`tam_hornless`） | 见人物二 3.12 | 无对应事迹 | 见人物二 3.12 |

## 6. 统计与价值审计（E）

### 6.1 计数

事迹按类与最早可得幕（"一到二"计入一；`world` 为他人事迹模板）：

| 类 | 序 | 一 | 二 | 三 | 四 | 五 | 六 | 终 | 合计 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 成长 `grow` |  | 7 | 5 | 4 | 1 | 1 |  |  | 18 |
| 讨伐 `hunt` |  | 3 | 1 | 6 | 5 | 1 |  |  | 16 |
| 异名者 `rare` |  | 9 | 2 | 7 | 22 | 3 |  |  | 43 |
| 迷宫 `dg` |  | 2 | 1 | 7 | 10 | 4 |  |  | 24 |
| 探索 `exp` |  | 1 | 1 | 2 | 3 | 3 |  |  | 10 |
| 收藏 `col` | 1 | 2 | 3 | 3 | 4 | 5 | 1 |  | 19 |
| 社交与羁绊 `bond` |  | 4 | 6 | 7 | 9 | 3 |  |  | 29 |
| 经营 `mgmt` |  | 1 | 3 | 4 | 6 | 2 |  |  | 16 |
| 战争 `war` |  |  | 1 | 5 | 3 | 5 |  |  | 14 |
| 诸神 `god` |  |  | 1 | 2 | 4 | 2 |  |  | 9 |
| 真相 `truth` |  | 1 | 2 | 3 | 2 | 1 | 3 |  | 12 |
| 凡人不信 `mortal` |  | 6 | 5 | 4 | 1 | 1 |  |  | 17 |
| 隐藏与壮举 `hid`、`feat` |  | 1 | 2 | 2 |  |  | 2 | 4 | 11 |
| 他人事迹 `world` |  | 2 | 1 | 5 | 2 |  |  |  | 10 |
| 合计 | 1 | 39 | 34 | 61 | 72 | 31 | 6 | 4 | 248 |

- 名望分布（玩家事迹 238 条）：0 档 14、5 档 13、10 档 87、25 档 107、50 档 17。隐藏 30 条，壮举 7 条。名望 50 的 17 条就是 Steam 成就的 C 组（2.13）。
- 第四幕最多：四十只异名者里二十二只在第四幕的诸国，第四幕的迷宫都是"可选的强者试炼"（[总纲 4.3][bible]）。第六幕少是有意的：
  第六幕只用神域与审期，事迹以揭示为主，不堆数量。
- 新增触发种类的使用：`cond` 22、`doorState` 7、`tellCount` 5、`belief` 4、`rumorReach` 3、`witness` 2、`exposure` 1；其余全部沿用主工程种类，
  其中 `manual` 最多（遭遇战机制、抉择结果、限制条件），与主工程的分布一致。

称号按类与最早出现幕：

| 类 | 一 | 二 | 三 | 四 | 五 | 六 | 终 | 合计 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 街头俗名 `street` | 4 | 3 | 3 | 2 | 1 |  |  | 13 |
| 公会卡 `guild` | 2 | 1 | 1 | 2 |  |  |  | 6 |
| 王冠与诸国 `crown` |  | 2 | 2 | 4 |  |  |  | 8 |
| 诸族 `tribe` | 1 | 1 | 1 | 2 | 1 |  |  | 6 |
| 教会 `church` |  | 3 | 1 | 1 |  |  |  | 5 |
| 传颂级 `named` |  | 1 | 7 | 2 | 1 |  |  | 11 |
| 错名与恶名 `wrong`、`infamy` | 2 | 4 | 4 | 1 |  |  |  | 11 |
| 收藏与事迹附带 `col`、`rare`、`dg`、`bond`、`war` | 1 | 1 | 4 | 5 | 6 | 1 |  | 18 |
| 晚期与跨国 `people`、`late`、`court` |  |  |  | 4 | 2 |  | 3 | 9 |
| 合计 | 10 | 16 | 23 | 23 | 11 | 1 | 3 | 87 |

### 6.2 价值审计

每条玩家事迹至少命中下表一类（多数命中两类以上）；他人事迹模板全部命中"立名或过关"。

| 存在理由 | 命中条数 | 说明 |
| --- | --- | --- |
| 门（历钥，或记录地钥、物钥、识钥） | 52 | 2.7 表的正典门之外，门目录的流派、合技、羁绊、生业、门址与真相门已按其 ID 回填 |
| 称号（授予或喂出） | 54 | 87 个称号里有 59 个与本文的某条事迹直接挂钩（授予或喂出），其余来自传闻画像、机构定性与诸族习俗 |
| 认知（谁的看法如何变） | 174 | 每条都写明了是谁、从什么到什么，或是哪条 BE 线索、哪件证据 |
| 收藏（含记事柱、陈列） | 50 | 收藏的完成不重复记两次（5.4） |
| 立名（他人的讲述数） | 17 | 加上 10 条他人事迹模板，构成立名关在系统里的全部入口 |

- **纯计数**：只有 `deed_hunt_thousand` 一条（名望 5），它是唯一没有命中上表的事迹，作为"记功"的样本保留。`deed_grow_doors_ten`
  是门数计数，但它让阿什开口谈代价，计入认知。异名者不计"全部击杀"，收藏的凑齐只在有称号请求时立事迹。
- **零名望**：14 条：运气型完成 1（`deed_col_named_trophies`）；代价与笑话 5（`deed_god_memory_given`、`deed_god_danger_door`、
  `deed_exp_pit_gaze`、`deed_mortal_soup_pot`、`deed_bond_farewell`）；测试型 1（`deed_dg_moon_cellar_untouched`，玛莎的测试不该给分）；壮举 7。
- **称号的价值**：87 个称号全部写明授予者、可见范围、对称呼与认知的作用、失去方式；对玩家没有一个称号改变数值；
  对有页者，只有 11 个传颂级称号与 1 个恶名模板推动立名，2 个职名（苇桥勋、冠军之后）给他人提供书面来源或讲述数。
- **请求覆盖**：图鉴的异名者候选全部落为事迹；遗物目录请求的十个称号全部落 ID，门目录请求的三个称号（开门的、七碑同读、一个也没熔）全部落 ID；人物二请求的五个称号（夜境角位、斗场冠军之后、
  被隐藏强者认可、汤与铃的继承者、拆门队之敌）全部落 ID；迷宫目录的事迹钩每座迷宫至少落一条；生业目录请求的"某人的出师之作"
  落为 `deed_world_apprentice_work`；装备目录请求的开锋、同炉、贡弓、门环、试锋之刃五条全部落事迹；兽伴目录的请求见第 8.1 节（两条有意不做）。

## 7. 新增命名

第 3 节的全部 `deed_` ID 与第 4 节的全部 `title_` ID 都是本文新增；称号文本中"灰烬男爵""实字 B""规格外者""带门之瑕者""魔王的先驱""角位""汤与铃"
"冒名税""大当家"等沿用分幕与各目录已有的说法。下表是机制与界面上的新名词。

| 名 | 类 | 含义 |
| --- | --- | --- |
| 落名 | 机制 | 让锚定一只异名者的传闻落地：交付异名物或证物，或当众送魂、净化、驯服；名字从此不被继承（3 节开头） |
| 讲述数 | 机制 | 立名关的计算量：相信某版本的人数乘主体系数与地区系数（2.6） |
| 记事柱 | 庭院陈列 | 门内庭院里刻至多 7 条事迹的木柱，纯外观（2.8） |
| 入册三级：亲见、旁证、自述 | 手录规则 | 手录与人簿按证据分级入册，只升不降（2.2） |
| 门旁的刻痕、未记之事 | 界面 | 第一幕事迹簿的样子（2.11） |
| 人簿·第一页 | 界面 | 第四幕起事迹簿的名字（2.11） |
| 俗名、职名、传颂级 | 分类 | 称号的三档（2.4） |
| 众名 | 称号 | 人簿议事日给国民的称号（2.3） |
| 自报名号 | 机制 | 戴着的职名在陌生人那里充当身份先验（2.4） |
| 加注（存疑、不实、已离教、奉命） | 铭录规则 | 铭录对被证伪的传颂级称号只追加注记，不擦除（2.6） |
| 代价型事迹 | 分类 | 记下代价、不给名望、隐藏到发生为止（1.4） |
| 分支事迹 | 分类 | 依赖世界分支的事迹，分支关上后显示"这一期没有发生"（1.4） |
| 他人事迹模板 | 数据 | `deed_world_<模板>:<npc_id>`（3.14） |
| 新增触发种类 | 数据 | `cond`、`doorState`、`witness`、`rumorReach`、`belief`、`exposure`、`tellCount`（1.3） |
| 事迹子前缀 | 命名 | `deed_grow_`、`deed_hunt_`、`deed_rare_`、`deed_dg_`、`deed_exp_`、`deed_col_`、`deed_bond_`、`deed_mgmt_`、`deed_war_`、`deed_god_`、`deed_truth_`、`deed_mortal_`、`deed_hid_`、`deed_feat_`、`deed_world_` |
| 称号子前缀 | 命名 | `title_street_`、`title_guild_`、`title_crown_`、`title_tribe_`、`title_church_`、`title_named_`、`title_wrong_`、`title_infamy_`、`title_col_`、`title_rare_`、`title_dg_`、`title_bond_`、`title_war_`、`title_people_`、`title_late_`、`title_court_` |

## 8. 已决事项与依据

### 8.1 跨目录对接（已落定）

| 目标 | 事项 | 落点 |
| --- | --- | --- |
| 门目录 | 门的历钥用哪条事迹；照路、拾遗、学识、商眼四类门候选 | 2.7 表与 5.3 节的 `deed_` ID 已写进门目录的钥；四类候选门目录不单立门（[门目录 7.3][drs]）；流派进阶、合技、试炼、羁绊门由五条汇总事迹记录（3.1、3.7、3.10），不逐门立事迹 |
| 千门系统 | 门读事迹的判定接口；七种新触发的评估器 | 门只读已授予的 `deed.<id>`（[千门 5.3][td]）；七种新触发的读法与结算点见 1.3 的判定接口 |
| 人物目录 | 葛蕾特·铁栏；苇桥"小领主之子"；祖灵冢的候选人；红袜子的磨坊人家、被吞印戒的失主、收路钱的遗孀 | 葛蕾特是迷宫目录 6.8 的凡人（人物 ID 由人物目录（一）登记为 `grete_ironrail`）；红袜子的磨坊人家、被吞印戒的失主与收路钱的遗孀是有名人物 `lene_mahler`、`lorenz_gild`、`wilma_ascher`（[人物一 3.6][chl]、[人物二 3.13][chc]）；小领主之子与候选人用无名居民模板具名化；事迹只认事件，不认 ID |
| 遗物目录 | 布伦手录与旧手套的物品 ID；空白纪长歌全本；斗证 | `lb_bron_record`、`brun_glove`（已有数据）；《静苔长歌》`lb_stillmoss_longsong` 是"歌与谣"的隐藏第九件；斗证 `rl_redgravel_pit_token`、`rl_edge_trial_token`（[遗物 3.11][rel]） |
| 迷宫目录 | 斗证的物品 ID；可挑战段的称号 | 斗证见上；可挑战段只在有命名者愿意给名字时授称号：剑帝的座签、长老的默行者；其余七段的回报落在门钥、关系与他人的称号上（葛蕾特） |
| 任务与事件 | `rumor.tide_attribution`、`ending` 的"离手"、`moira_published`、`brun.secret_kept`、`deed_world_` 实例键 | 注册表规范名：`a1_tide_credit`（别名 `rumor.tide_attribution`，取值 `player`、`martha`、`light`、`self_collapse`）、`ending == release`、`a5_moira_published`、`npc.bron.secret_kept`（别名 `brun.secret_kept`）；实例键存在事迹系统的状态里（1.3） |
| 认知与成长 | 讲述数的公式与阈值；"让别人担名"；故事化版本 | 阈值与日结算以[成长 12][pp]为准（C98）；让名的交互见 2.6；故事化版本按半数计 |
| 女神目录 | 称号加护的代价；授称号的频度 | 称号加护令受者成为莫伊拉的视线锚（只对莫伊拉，锚二）；授称号动作 `div_moira_title` 神力 1 到 5、同一对象冷却 7 日（[女神目录 2.6][gi]） |
| 同伴与队伍 | 羁绊事迹与立名关 | 九条羁绊事迹与同伴立名以[同伴与队伍 8.7、4.4][cmp]为准；铁人档的告别事迹即 `deed_bond_farewell` |
| 装备目录 | 开锋、同炉、归还国宝、交还试锋之刃 | `deed_mgmt_craft_open_edge`、`deed_mgmt_craft_same_forge`、`deed_mgmt_tribute_bow`、`deed_hid_knocker_home`（门环）、`deed_bond_blade_returned` |
| 兽伴目录 | 一区兽伴图鉴集齐；孵出飞蜥 | 有意不做（纯凑齐计数）；孵出飞蜥只落为龙族的评语 `title_tribe_dragon_shadow` |
| 发行工程 | Steam 成就 | 2.13 节 |

### 8.2 正典口径（已定）

| 序 | 事项 | 本文口径 | 依据 |
| --- | --- | --- | --- |
| 1 | [认知 4.7][rep] 说"玩家无页，得不到称号" | 玩家得不到铭录里的称号；俗名、职名与众名照有，都不推关 | C96 已落地 |
| 2 | 主工程规则 1：事迹只给外观 | 本作事迹作历钥，有实际效果；名望与称号对玩家仍只有外观与认知 | [力量 12][pow]"钥另建事迹系统"；C97，[千门 5.3][td] |
| 3 | 主工程规则 5：不留永久错过 | 分支事迹在本期显示"这一期没有发生"，回收结局进入的下一期可补；只依赖一次性世界事件的记为壮举；Steam 成就不映射分支与壮举 | C97，[成长 16][pp]，2.13 |
| 4 | 夜羽的残页：鉴定只显示"残页，Lv ？" | 称号照写在残页上（与异名者同理），鉴定不显示，直到页面复原 | C100 已落地 |
| 5 | 布伦与欧拉的代号 | 人物引用 `bron`、`oola`；`brun.*`、`trust.ola` 是注册表别名 | C16、C95，[注册表 7.1][reg] |
| 6 | 立名关数值：正典只写"被足够多的人讲述" | 讲述数 ≥ 1,500，至少两个地区，至少一份书面来源；每日结算 | C98，[成长 12][pp] |
| 7 | 称号能被鉴定读到，而玩家"无记载" | 玩家的称号只能靠公会卡、诏书、人簿抄本出示；这是凡人不信的又一个来源（自报名号） | 无冲突 |
| 8 | 勇者"立名容易"与"余威所至" | 两者叠加：勇者团在第二幕就拿到第一个传颂级称号，第三幕过关 | 无冲突 |
| 9 | 罗恩在第四幕 Lv34、第五幕 Lv40 | 第四幕的停顿是卡在立名关，过关落在 `deed_bond_named_ron` | C99 已落地 |
| 10 | 第二、三幕的桥段 U2、U3 共十六条，只把改变了某人常识或世界状态的十条立为事迹，U3-4、U3-7 只落为错名 | 其余桥段保持为桥段（喜剧节流，[认知 4.5][rep]） | 无冲突 |
| 11 | 第一幕十五个桥段只立四条 | 第一幕的笑点密度靠传闻变形器，不靠事迹簿 | 无冲突 |
| 12 | 异名者"击杀传闻"与事迹的关系 | 事迹以"落名"为触发，不以击杀为触发；无人知道的击杀让名字被继承（`nameInherit`），辟谣与继名各有一条事迹 | [图鉴 2.7][best]，3 节开头 |

### 8.3 已决的开放问题

1. 名望在手录里不显示为数字：显示为布伦的一句评语（"活干了不少"之类，按名望区间选模板），数字只在设置里可见，减少"刷分"的心理。
2. 人簿的众名不设恶名档：人簿是玩家唯一被"写下"的名字，只记事实与众议的褒名；恶名走街头与诸族（`title_infamy_`），人簿只把裁决写成事实。
3. 称号加护附在同伴身上时，玩家只在识才·深的视线感知里看得见"他现在是她的眼睛"（[门目录 5.7][drs]）。
4. 事迹 ID 只追加：落数据后不改 ID、不改触发（主工程规则 9，`DEED_ORDER`）。
5. 称号三档、讲述数与主体替换转移、分支事迹的完成度口径三条，作为决策日志的登记项交主会话（本目录按此执行）。

## 9. 来源链接

调研回链：主工程称号簿的规模、分类与"评估器可作钥的判定引擎"的结论见[复用调研 7.8][inv]；"测量工具失灵是凡人不信最高效的引擎"与误会链需要过度解读者见[动画综合 2.3、2.4][anime]。

[bible]: content_bible.md
[outline]: content_outline.md
[best]: catalog_bestiary.md
[dgc]: catalog_dungeons_bosses.md
[chl]: catalog_characters_lotha.md
[chc]: catalog_characters_continent.md
[rel]: catalog_relics_lore.md
[cre]: catalog_creatures_mounts.md
[eqc]: catalog_equipment.md
[csm]: catalog_consumables_magitools.md
[gath]: catalog_gathering_crafting.md
[drs]: catalog_doors.md
[pow]: ../../20_world/power_system.md
[rep]: ../systems/reputation_and_cognition.md
[gm]: ../systems/goddess_gm.md
[qe]: ../systems/quests_and_events.md
[rl]: ../../30_story/reveal_ledger.md
[chr]: ../../30_story/characters.md
[a1]: ../../30_story/arcs/act1_borderstone.md
[a2]: ../../30_story/arcs/act2_wallenburg.md
[a3]: ../../30_story/arcs/act3_lothar_crisis.md
[a4]: ../../30_story/arcs/act4_continental_board.md
[a5]: ../../30_story/arcs/act5_war_of_races.md
[a6]: ../../30_story/arcs/act6_review_and_epilogue.md
[dlog]: ../../00_vision/decision_log.md
[inv]: ../../10_research/woc_reuse/combat_and_content_inventory.md
[anime]: ../../10_research/anime/synthesis.md
[deeds]: ../../../../docs/design/deeds.md
[deedsts]: ../../../../src/sim/content/deeds.ts
[td]: ../systems/thousand_doors.md
[cmp]: ../systems/companions_and_party.md
[reg]: ../world_state_registry.md
[pp]: ../progression_and_pacing.md
[re]: ../../50_tech/release_engineering.md
[gi]: catalog_goddess_interventions.md
