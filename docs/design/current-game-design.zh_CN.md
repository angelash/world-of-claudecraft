# 当前游戏设计总览

本文是 World of ClaudeCraft 当前版本的中文策划总览。它描述已经落地的
游戏设计事实，不是新的目标方案。若本文与源码数据不一致，以源码数据为准。

最后核对日期：2026-06-20。

主要内容来源：

- `src/sim/content/classes.ts`
- `src/sim/content/zone1.ts`
- `src/sim/content/zone2.ts`
- `src/sim/content/zone3.ts`
- `src/sim/content/dungeons.ts`
- `src/sim/content/temple.ts`
- `src/sim/content/items.ts`
- `src/sim/content/talents*.ts`
- `src/sim/content/augments.ts`
- `src/sim/types.ts`
- `src/sim/sim.ts`
- `README.md`

## 现有文档盘点

仓库里已经有比较完整的专项设计资料，但它们按功能或实现阶段拆开保存：

| 文件 | 已覆盖内容 | 对策划工作的缺口 |
|---|---|---|
| `README.md` | 玩家视角介绍、托管方式、当前功能导览、操作方式、经典公式清单。 | 适合入门和宣传，但不是完整策划总纲。 |
| `docs/design/master-spec.md` | 6-20 级扩展原始设计：Gravecaller 主线、Mirefen、Thornpeak、XP 预算、副本和物品目标。 | 它是扩展包规格书，不是当前版本总览。当前代码已经加入 Drowned Temple、Nythraxis 钩子等内容。 |
| `docs/design/spell-ranks.md` | 1-20 级经典风格技能等级表。 | 仍是技能数值参考，但当前职业套件已经扩展到宠物、形态、天赋和更多高等级技能。 |
| `docs/prd/talents-and-specializations.md` | 天赋与专精系统需求、架构、持久化、UI 和验收标准。 | 单功能 PRD，不覆盖完整游戏。 |
| `docs/prd/max-level-xp-overflow.md` | 满级后 XP、虚拟等级、声望式长期成长和威望需求。 | 单功能 PRD。 |
| `docs/design/icon-system.md` | 程序化图标架构和视觉配方。 | 偏表现层。 |
| `docs/design/graphics-plan.md`、`lookdev-hookup.md`、`ue5-overhaul-plan.md` | 渲染、视觉开发、资产和画面管线。 | 偏表现层。 |
| `docs/design/sound_effects.md`、`npc_voices.md` | 音效目录和 NPC 声线方向。 | 偏音频和表现。 |
| `docs/prd/woc/*.md` | 钱包绑定和持有者外观权益规格。 | 偏 Web3 与外观功能。 |

此前缺少一份把当前世界、成长、职业、遭遇、经济、社交、PvP 和表现方向串起来的总览文档。本文补齐这个缺口。

## 产品支柱

World of ClaudeCraft 是一个经典 MMO 风格的微型多人在线游戏，同时也是一个确定性模拟沙盒。离线客户端、在线服务器和无头强化学习环境都运行同一套 `src/sim` 核心。

设计支柱：

- 微缩经典 MMO 体验：目标选择战斗、任务、区域、城镇、尸体拾取、商人、队伍副本、社交摩擦和可读的战斗间歇。
- 确定性模拟：固定 20 Hz tick、种子随机数、在线服务器权威结算、可复现的无头运行。
- 低等级上限下的高密度成长：当前真实等级带为 1-20，靠重叠区域和副本节点填满进度，而不是拉长空洞升级线。
- 九个经典职业全部可玩：每个职业有独立资源、角色幻想、技能等级、职业套件和三专精天赋结构。
- 鼓励组队但不锁死单人：主线铺垫链可以单人理解和推进，关键首领与副本提供 5 人峰值体验。
- 程序化表现：图标、几何、天气、音乐、音效、生物骨架、UI 外框和大量视觉内容都是生成式或数据驱动。
- 小型 MMO 社交沙盒：队伍、聊天、交易、决斗、竞技场、Fiesta、世界市场、AFK/DND、掷骰和外观系统共同形成社区质感。

## 当前内容盘点

当前核对到的内容规模：

| 内容区域 | 数量 |
|---|---:|
| 真实等级上限 | 20 |
| 升到 20 级总 XP | 167,200 |
| 玩家职业 | 9 |
| 技能定义 | 152 |
| 天赋树 | 9 |
| 每职业天赋节点 | 26 |
| 任务 | 89 |
| 单人任务 | 74 |
| 2 人任务 | 2 |
| 3 人任务 | 3 |
| 5 人任务 | 10 |
| 怪物模板 | 104 |
| NPC | 21 |
| 物品 | 319 |
| 野外营地 | 79 |
| 地面任务物件 | 18 |
| 道路线 | 14 |
| 副本或类副本空间 | 5 |
| Fiesta 强化 | 20 |
| Fiesta 场地强化物 | 4 |
| 钓鱼表 | 3 |

部分链式任务没有显式 `minLevel`，因此原始数据会显示默认 1 级。策划判断实际节奏时，应同时看 `requiresQuest`、区域位置和前置链。

## 世界与叙事

主世界由三个沿 z 轴相连的开放区域组成。主线是 Gravecaller 阴谋：Eastbrook 的亡灵异动引出 Morthen，Morthen 指向沼泽里的 Vael，Vael 再揭示 Thornpeak 地底的 Korzul。

| 区域 | 等级段 | 生物群系 | 中心营地 | 关键地点 | 设计职能 |
|---|---:|---|---|---|---|
| Eastbrook Vale | 1-7 | 山谷 | Eastbrook | Eastbrook、Wolf Run、Boar Meadow、Mirror Lake、Webwood、Copper Dig、Bandit Camp、Fallen Chapel、Brightwood Glade | 新手区域、城镇社交中心、第一轮职业学习、第一批稀有怪、第一条副本钩子。 |
| Mirefen Marsh | 6-13 | 沼泽 | Fenbridge | Fenbridge、Prowler Reeds、Deepfen Shallows、Widow Thicket、Drowned Chapel、Troll Mounds、Gravecaller Encampment、The Sunken Bastion | 中段区域，与 Eastbrook 重叠衔接，引入更强 debuff、邪教升级和 13 级副本节点。 |
| Thornpeak Heights | 13-20 | 山峰 | Highwatch | Highwatch、Stalker Ridge、Deeprock Burrows、Ogre Foothills、Drogmar's War-Camp、Stormcrag、The Glimmermere、Wyrmcult Tents、Revenant Fields、Gravewyrm Sanctum | 高等级和当前终局区域，承接主线结局、Drowned Temple 支线和满级后钩子。 |

### 剧情线

主线：Gravecaller 阴谋

- Eastbrook Vale：Marshal Redbrook 和 Brother Aldric 建立城镇语境、本地威胁、亡灵异动和 Gravecaller 标记。
- Hollow Crypt：Brother Aldric 的链条深入 Fallen Chapel 下方，击败 Sexton Marrow 和 Morthen the Gravecaller。
- Mirefen Marsh：Fenbridge 任务线揭示溺亡者、巨魔、邪教徒、召唤者、Deacon Voss、Knight-Commander Olen 和 Vael the Mistcaller。
- Thornpeak Heights：Highwatch 任务线揭示 Wyrmcult、风暴元素、复仇亡魂和 Gravewyrm Sanctum 的封印。
- Gravewyrm Sanctum：Korgath、Grand Necromancer Velkhar 和 Korzul the Gravewyrm 结束 1-20 级主线。

支线：Drowned Moon

- 从 Thornpeak 的 The Glimmermere 和 Tidewatcher Ondrel Vane 开始。
- 重点是月门异动、Glimmermere Waders、Drowned Choir、Sethrael the Palecoil 和 Drowned Temple。
- 结尾是 Choirmother Selthe 与 Ysolei, Avatar of the Drowned Moon。
- 这条线与 Gravecaller 主线并行，为 15-18 级提供独立副本和稀有装备节奏。

满级后钩子：Nythraxis / Abandoned Crypt

- 当前代码登记了四个 20 级任务：`q_nythraxis_restless_dead`、`q_nythraxis_graves`、`q_nythraxis_sealed_crypt` 和 `q_nythraxis_bound_guardian`。
- `nythraxis_crypt` 作为 Abandoned Crypt 登记，包含 3 个物件拾取，建议人数 1，当前没有副本刷怪。
- 任务链还在野外数据中引用了一个 5 人 Bound Guardian 步骤。
- 当前应把它视为已存在的满级后剧情钩子或半完成任务线，而不是完整战斗副本。

## 成长设计

### 等级与 XP

真实等级上限为 20。XP 表采用经典低等级节奏：

`400, 900, 1400, 2100, 2800, 3600, 4500, 5400, 6500, 7600, 8800, 10100, 11400,
12900, 14400, 16000, 17700, 19400, 21300, 23200`

设计要点：

- 升到 20 级总 XP 为 167,200。
- 怪物 XP 使用经典风格的等级差和灰名衰减规则。
- 队伍 XP 对 3、4、5 人采用受经典规则启发的组队加成。
- 结构化成长主要由任务奖励承担，副本小怪更偏向掉落、故事和队伍节奏，而不是刷级效率。
- 在旅店足迹内休息会累积双倍经验池，每 8 个游戏小时填充一级所需 XP 的 5%，上限为 1.5 级 XP。

### 等级带

区域等级带有意重叠：

- Eastbrook Vale：1-7。
- Mirefen Marsh：6-13。
- Thornpeak Heights：13-20。
- Drowned Temple 线：约 15 级开始，16 级后进入 5 人步骤。
- Gravewyrm Sanctum 结局：18 级以上任务，20 级敌人。
- Nythraxis 钩子：20 级。

这种重叠让玩家不必清完每个本地任务才能前进，也让组队内容作为高点嵌在单人链条旁边，而不是堵住主线。

### 满级后成长

20 级后真实等级条达到上限，但 lifetime XP 会继续累积。

已实现的满级后概念：

- 虚拟等级由 lifetime XP 推导，可以超过真实等级上限。
- 每个威望等级消耗 23,200 XP。
- 里程碑奖励由数据定义：

| 里程碑 | Lifetime XP | 奖励类型 |
|---|---:|---|
| Veteran | 250,000 | 头衔 |
| Champion | 500,000 | 头衔 |
| Paragon | 1,000,000 | 边框 |
| Mythic | 2,500,000 | 边框 |
| Eternal | 5,000,000 | 头衔 |

## 职业与战斗定位

九个经典职业全部存在。每个职业都有基础套件、技能等级和一棵包含三个专精的天赋树。

| 职业 | 资源 | 技能数 | 当前套件定位 |
|---|---|---:|---|
| Warrior | 怒气 | 16 | 近战武器压力、战吼、冲锋、怒气消耗技、防御姿态、破甲和嘲讽。 |
| Paladin | 法力 | 13 | 混合近战、圣印与审判、神圣治疗、护甲光环、祝福、吸收盾、仇恨与反击光环。 |
| Hunter | 法力 | 14 | 远程压力、守护、毒蛇钉刺、射击、近战兜底、驯服/解散/复活宠物、爆发冷却。 |
| Rogue | 能量 | 21 | 能量与连击点、潜行起手、终结技、毒药、控制、消失和爆发窗口。 |
| Priest | 法力 | 10 | 惩击和暗影伤害、护盾、恢复、单体治疗、心灵震爆、精神鞭笞、快速治疗。 |
| Shaman | 法力 | 11 | 闪电施法、武器灌注、震击、护盾、治疗、幽魂之狼和风暴打击。 |
| Mage | 法力 | 14 | 火焰/冰霜/奥术法术、造食造水、控制、定身、屏障和大读条。 |
| Warlock | 法力 | 17 | DoT、生命分流、吸取、恐惧、从小鬼到末日守卫的恶魔、暗影/火焰法术。 |
| Druid | 法力加形态 | 31 | 施法/治疗基础、熊形态、狼形态、潜行、连击终结、旅行能力和混合工具。 |

### 天赋结构

天赋点从 10 级开始获得。20 级时玩家拥有 11 点天赋点。每个职业有 26 个节点和 3 个专精：

| 职业 | 专精 |
|---|---|
| Warrior | Arms 输出、Fury 输出、Protection 坦克 |
| Paladin | Holy 治疗、Protection 坦克、Retribution 输出 |
| Hunter | Beast Mastery 输出、Marksmanship 输出、Survival 输出 |
| Rogue | Assassination 输出、Combat 输出、Subtlety 输出 |
| Priest | Discipline 治疗、Holy 治疗、Shadow 输出 |
| Shaman | Elemental 输出、Enhancement 输出、Restoration 治疗 |
| Mage | Arcane 输出、Fire 输出、Frost 输出 |
| Warlock | Affliction 输出、Demonology 输出、Destruction 输出 |
| Druid | Balance 输出、Feral 坦克、Restoration 治疗 |

在线模式下，天赋分配由服务器权威验证。天赋会预计算成扁平修正值，战斗和属性热路径不会每 tick 遍历天赋树。玩家最多可以保存 10 套 loadout。

## 战斗模型

核心战斗规则：

- 固定 20 Hz 模拟 tick。
- 1.5 秒公共冷却，部分盗贼节奏按职业规则更快。
- 武器挥击计时和下一次攻击触发类技能。
- 怒气、法力、能量、连击点、光环、形态、潜行、宠物、吸收、DoT、HoT、定身、昏迷、瘫痪、变形、恐惧、沉默、致盲、缴械、破甲、法术锁定、易伤等状态。
- 施法受到攻击会被推迟 0.5 秒。
- 引导法术受到攻击会损失 25% 的引导进度。
- 经典属性手感：耐力和智力转换、护甲减伤、法术命中、近战未命中/闪避、怒气换算、仇恨和五秒回蓝规则。
- 吃喝在坐下时 18 秒内恢复，受到伤害或站起会中断。

怪物行为：

- 闲置游荡、距离仇恨、社交连带、追击、攻击、逃跑/闪避、脱战重置、尸体拾取、刷新和稀有计时。
- 精英怪约 2.3 倍生命、1.5 倍伤害、双倍 XP。
- 首领和稀有机制包括 AoE 脉冲、召唤小怪、狂暴、践踏、顺劈、致死、反伤、毒、流血、致盲、治疗、护盾、法力燃烧、沉默、法术易伤等 affix。

## 任务设计

任务目标类型保持克制：

- 击杀目标。
- 从任务门控掉落中收集。
- 从地面物件中收集。
- 通过 `requiresQuest` 串联链条。
- 通过 `minLevel` 设置等级门槛。
- 通过 `suggestedPlayers` 标注组队建议。

设计意图：

- 新手任务教授基础战斗、拾取、商人、地面物件和区域地理。
- 2 区和 3 区链条加深对怪物机制和 debuff 的理解。
- 组队任务作为体验高点可见，但大部分剧情铺垫仍可单人推进。
- 职业原型奖励减少物品表膨胀，同时保证每个职业都有可用奖励。
- 地面闪光拾取用于剧情节拍、路标和非战斗节奏。

任务组队结构：

- 74 个单人任务。
- 2 个 2 人任务。
- 3 个 3 人任务。
- 10 个 5 人任务。

## 副本与主要遭遇

| 副本 | 等级职能 | 建议人数 | 内部风格 | 刷怪数 | 主要遭遇 | 当前设计说明 |
|---|---|---:|---|---:|---|---|
| The Hollow Crypt | Eastbrook 结点，约 7-10 | 5 | Crypt | 13 | Sexton Marrow、Morthen the Gravecaller | 第一个完整队伍副本，也是 Gravecaller 线第一处回报。Morthen 使用 Shadow Pulse。 |
| The Sunken Bastion | Mirefen 结点，约 12-13 | 5 | Crypt | 13 | Knight-Commander Olen、Vael the Mistcaller | Vael 使用 Mist Surge，并在生命阈值召唤 Drowned Thralls。 |
| Gravewyrm Sanctum | 主线结局，20 级 | 5 | Sanctum | 21 | Korgath the Bound、Grand Necromancer Velkhar、Korzul the Gravewyrm | Gravecaller 最终副本。Korgath 和 Korzul 狂暴，Velkhar 召唤小怪，Korzul 使用 Necrotic Shockwave。 |
| The Drowned Temple | 支线副本，约 16-18 | 5 | Temple | 17 | Choirmother Selthe、Ysolei | 独立 Drowned Moon 线。Ysolei 使用 Lunar Tide、召唤 Moonspawn 并狂暴。 |
| Abandoned Crypt | 20 级 Nythraxis 钩子 | 1 | Crypt | 0 | 当前副本数据无首领 | 只有 3 个物件拾取。当前战斗回报不在这个副本登记中。 |

副本设计原则：

- 私有副本按队伍或单人入口绑定。
- 人数不足进入 5 人副本时给出警告，而不是硬性阻止。
- 小怪包按经典拉怪节奏布置。
- 副本小怪在实例重置前不会刷新。
- 首领机制是确定性的，并由显式数据驱动。

## 物品、装备与经济

当前物品类型数量：

| 类型 | 数量 |
|---|---:|
| 武器 | 72 |
| 护甲 | 122 |
| 食物 | 18 |
| 饮料 | 8 |
| 工具 | 18 |
| 垃圾 | 27 |
| 药水 | 6 |
| 合剂/药剂 | 1 |
| 任务物品 | 47 |

当前品质数量：

| 品质 | 数量 |
|---|---:|
| 粗糙 | 26 |
| 普通 | 66 |
| 优秀 | 86 |
| 精良 | 77 |
| 史诗 | 20 |
| 未显式标品质 | 44 |

经济规则与设计：

- 内部货币单位是铜，显示为金、银、铜。
- 商人出售食物、饮料、白装和区域对应升级。
- 垃圾物品提供金币节奏和背包压力。
- 任务物品不进入经济循环，售价为 0。
- 任务奖励和副本掉落承担主要装备兴奋点。
- 食物和饮料支撑战斗间歇。
- 药水即时恢复，可以在战斗中使用。
- 药剂提供临时属性 buff。
- 世界市场绑定在 The Merchant，支持玩家挂单。
- 市场规则包括每名卖家 12 个活跃挂单、5% 手续费、48 小时挂单时长、500 金价格上限和距离门槛。

钓鱼：

| 区域 | 钓鱼表 |
|---|---|
| Eastbrook Vale | Mirror trout、river perch、tangled weed、稀有 Glimmerfin Koi 或空钩。 |
| Mirefen Marsh | Marsh pike、bog eel、soggy boot、tangled weed、稀有 Glimmerfin Koi 或空钩。 |
| Thornpeak Heights | Frostgill trout、stonescale carp、tangled weed、稀有 Glimmerfin Koi 或空钩。 |

## 社交与多人系统

在线玩法由服务器权威结算。玩家有账号、持久化角色和按兴趣范围同步的世界快照。

已实现社交系统：

- 最多 5 人队伍。
- 队伍击杀贡献、共享 tap 权、XP 分配、小地图队友点、队伍框体和队伍聊天。
- 队伍拾取策略：默认货币公平分配，普通和高级物品默认随机分配。
- 玩家交易：双方放入物品和金钱，双方确认，距离检查，服务器原子校验。
- 决斗：3 秒倒计时，打到 1 HP 结束而不死亡，60 码外判负。
- 聊天频道：say、yell、whisper、general、party、guild、officer、world、LFG、emote 和 roll 事件。
- 服务端好友、忽略、公会名单、在线状态、公会聊天和官员聊天。
- AFK 和 DND 会话状态，以及自动私聊回复。
- 团队/目标标记作为队伍范围的纯表现覆盖。

## PvP 与 Fiesta

Ashen Coliseum 支持竞技场模式：

- 排名 1v1。
- 排名 2v2。
- 非排名 2v2 Fiesta。

排名竞技场设计：

- 初始 rating 为 1500。
- 最低 rating 为 100。
- Elo K 值为 32。
- 比赛倒计时为 5 秒。
- 最大比赛时长为 150 秒。
- 超时后按 HP 百分比结算。
- 在线天梯最多发送 10 条。

Fiesta 设计：

- 2v2 队伍模式。
- 所有人标准化为 20 级，并使用默认构筑保证平衡。
- 率先达到 15 次击倒的一方获胜。
- 最大时长 360 秒。
- 战斗中开启 3 波强化选择。
- 缩圈从半径 22 开始，最小可缩到半径 6。
- 圈外每秒承受 6% 最大生命值伤害。
- 复活从 3 秒开始增长，最高 14 秒。
- 场地强化物会先预警，再进入短时间可拾取状态。

Fiesta 强化：

- 共 20 个强化，分为 silver、gold 和 prismatic。
- 例子包括 Brutality、Spellfire、Toughness、Mending、Warlord's Might、Arcane Surge、Vampirism、Lightwell、Apex Predator、Archmage、Avatar of War、Ascendant。

Fiesta 场地强化物：

- Speed Demon，12 秒。
- Colossus，14 秒。
- Moon Boots，14 秒。
- Berserker，10 秒。

## 宠物、形态与职业专属系统

猎人宠物：

- 猎人可以驯服、解散和复活宠物。
- 宠物模式包括 passive、defensive 和 aggressive。
- 宠物可以协助、跟随、距离过远时传送回主人身边，并使用类似 Growl 的仇恨控制。

术士恶魔：

- 术士从 1 级小鬼到 20 级 Doomguard，可以召唤多个恶魔。
- 恶魔角色包括远程输出和坦克型伙伴。

德鲁伊形态：

- Bear Form 提供 Maul、Growl 和熊形态工具，建立坦克玩法。
- 当前数据中，Wolf Form 承载猫形态玩法位：潜行、连击式攻击、终结技和机动性。
- Travel Form 提供脱战移动能力。

盗贼潜行与毒药：

- 潜行支持 Garrote、Cheap Shot、Ambush 和 Sap 等起手。
- 毒药和终结技提供长期控制与伤害规划。

## 表现方向

表现层目标是读起来像一个紧凑的经典 MMO：

- Three.js 世界渲染。
- 程序化地形、道路、水体、天气、道具、建筑、植被和生物骨架。
- vale、marsh、peaks、crypt、sanctum、temple 等空间有不同生物群系风格。
- 用 canvas 程序化生成技能、物品、buff、debuff 图标。
- 经典 HUD：单位框、队伍框、目标框、动作条、法术书、角色面板、任务日志、世界地图、小地图、背包、商人、拾取、tooltip、战斗日志、浮动战斗文字、聊天、XP 条、竞技场面板和移动端控制。
- 程序化 WebAudio 用于战斗、UI、环境、移动和奖励时刻。
- NPC 声线方向目前以提示词文档形式存在，不是强制运行时语音播放。

表现参考文档：

- `docs/design/icon-system.md`
- `docs/design/graphics-plan.md`
- `docs/design/lookdev-hookup.md`
- `docs/design/ue5-overhaul-plan.md`
- `docs/design/sound_effects.md`
- `docs/design/npc_voices.md`

## 对玩法有影响的技术约束

策划层调整必须保留这些会影响玩法的约束：

- 模拟层是事实来源。UI、渲染和客户端胶水代码不能直接修改游戏状态。
- 战斗、掉落、任务进度、经济、副本、交易、竞技场和市场结果都必须在模拟层或权威服务器路径结算。
- 模拟逻辑中的新增随机必须使用种子 RNG。
- sim 侧数据新增玩家可见内容时，必须通过现有 i18n matcher 在客户端边界完成本地化。
- 新任务优先使用现有击杀/收集目标类型，除非有强设计理由扩展引擎。
- 新世界内容应优先写入 `src/sim/content` 的 data-as-code，并避免在模拟层引入表现依赖。

## 已知策划缺口与后续事项

整理当前设计时发现的策划层缺口：

1. `docs/design/master-spec.md` 早于部分已实现内容。它没有完整覆盖 Drowned Temple、Nythraxis 钩子、扩展职业套件、Fiesta、世界市场、宠物、休息 XP 和当前满级后数据。
2. `docs/design/spell-ranks.md` 仍是重要技能等级参考，但当前职业套件已经包含原始等级表之外的系统。
3. `nythraxis_crypt` 当前登记为无刷怪的物件型实例。相关任务链应明确为满级后物件剧情、扩展成完整实例设计，或标注为有意未完成。
4. 每次新增内容后，应定期从源码重新核对任务数量和等级节奏，因为链式任务会把实际等级门槛隐藏在 `requiresQuest` 后面。
5. 当前有 44 个物品没有显式品质。这可能是内部或历史物品的合理状态，但后续内容作者应决定新物品是否必须填写品质。
6. 当前有多份系统专项文档，但没有从 `src/sim/content` 自动生成的设计索引。未来可以做一个内容盘点脚本，供本文或 wiki seed 使用。
