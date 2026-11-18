# PK-M1-28 第一幕人物与人设卡：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-18 | 实施、覆盖性复查、修复 | 9 张新人设卡与 35 张旧卡的审计；`body` 字段；17 个居民模板与分布；跨图日程；校验与测试 | 未提交 | 见 `verification_matrix.md` | 主会话提交；计划状态列建议改为"已完成"；接 PK-M1-29 |

## 2. 汇报

### 2026-11-18 实施、覆盖性复查、修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `data/npc/personas.json` | 修改 | 新增 9 张卡（插在 `marg` 之后）；八人补潜质（`nera` 商才、`oola` 医手、`cassian` 证人、`martha` 守城、`bron` 治吏、`hock` 学士、`barga` 巧匠、`ako` 斥候）；`noi`、`tess` 的 `tags` 加 `door_mark`；`viro`、`moss` 的 `relations` 加 `seg_oneeye`；复查后：夜羽 K0、阿什去掉 `concealed`、阿什两处"第六司"改"那一位" |
| `data/npc/residents.json` | 修改 | `bs_townsfolk`、`bs_militia`、`bs_lumber` 换成 17 个 `tpl_` 模板（原三组的 9 人分进佃农、行商、散居遗民、镇卫、伐木工）；`bs_orphan` 与四个瓦伦堡组原样保留；复查后：拾荒者加荒原分布（`ash_waste` 3 人，住东西灰村、白天在灰沙坡与枯林），三个模板的解释顺序加 `sorcery` |
| `data/npc/schedules.json` | 修改 | `hunter` 5 到 11 点改为 `forest_edge:hunter_camp`；`lumber` 两段伐区改为 `forest_edge:logging_site`；新模板 `miner`、`postman`、`camp_smith`、`bridge_keeper`、`bandit`、`caravan_guard`、`scavenger`、`smuggler`、`herb_woman` |
| `data/dialogue/topic_cast.json` | 修改 | 清空：场外演员 `ash`、`seg_oneeye`、`ulf_lange`、`knut_naumann`、`kas_ropebridge` 现在都有卡 |
| `src/systems/npc/templates.ts` | 新增 | `placementsOf`（单图行或模板的分布表）、`residentRowProblems`（模板字段的校验）、潜质代码封闭集合 `POTENTIAL_CODES` |
| `src/systems/npc/types.ts` | 修改（越界，加法） | `PersonaCard.body` 与 `PERSONA_BODIES`；`ResidentPlacement`、`TemplatePotential`、`TemplateUnbelief`；`ResidentTemplate` 的单图字段改为可缺省并加 `placements`、`band`、`knowledge`、`exaggerate`、`potential`、`unbelief`；`ResidentCard.knowledge`（旧存档缺省） |
| `src/systems/npc/spawn.ts` | 修改（越界，小） | `absenceReason`：有 `body` 时为 `absent`（与兽潮之夜包的 `npc.<id>.dead` 两行并排，未动它们）；`generateResidents` 按分布逐图生成，序号在一个模板内跨图连续，带上模板的知识层级；旧单图行的抽签顺序不变 |
| `src/systems/dialogue/topics/talk.ts` | 修改（越界，一行） | `speakerView`：居民的知识层级取居民卡的 `knowledge`，缺省 K0 |
| `src/content/packs/npc.ts` | 修改 | 校验 `body`；模板行（字段、分布的地图、人数、住处、干活处、日程）；只合并部分 pack 时，图集里"已建"而地图数据未合并的地图按信任处理（人设卡的地图与地点、日程地点、追求地点、模板分布）；planned、scenario 与图集外的 ID 照常报错；编辑器表单加 `body` 与模板字段 |
| `src/content/references.ts` | 修改（共享，加法三行） | 见下方"共享文件逐段" |
| `data/README.md` | 修改（共享，一行） | `npc/` 一行补人设卡 `body`、跨图日程与 `tpl_` 模板 |
| `tests/npc_act1_cast.test.ts` | 新增 | 见 `verification_matrix.md` |
| `tests/npc.test.ts` | 修改 | 夹具多合并战斗与城建两个 pack 的地图（按 `MapDef[]` 取型）（第一幕人物住在上面、日程跨过去）；夜羽与阿什的断言改为"有卡、身体归别的系统"；希雅 6 点回到林缘猎营 |
| `tests/content_id_guard.test.ts` | 修改（测试口径变更，主会话已批准） | 见下方"共享文件逐段" |
| `locales/zh-Hans/content.generated.json` | 工具重生成 | `node tools/i18n/extract_content.ts`（同时带进了他包同期的改动） |
| `docs/70_packets/pk_m1_28_act1_characters/` | 新增 | 本目录三件 |

**共享文件逐段**

`src/content/references.ts`，`REF_PATHS` 的 `npcResidents` 几行之间加三行：

```
  { table: 'npcResidents', path: 'placements[].map', to: ['maps'] },
  { table: 'npcResidents', path: 'placements[].schedule', to: ['npcSchedules'] },
  { table: 'npcResidents', path: 'unbelief.explain[]', to: ['cognitionExplanations'] },
```

`data/README.md`，目录表 `npc/` 一行改为：人设卡（`body` 写明身体由战斗的固定存在或同伴名册生成时，NPC 系统只保留心智与信任，不生成实体）、日程（地点可写 `<地图>:<地点>` 跨图）、无名居民模板（`tpl_` 行带档位、知识层级、潜质概率与凡人不信参数，`placements` 列出各图的人数、住处与干活处；居民 ID 为 `res_<模板>_<序号>`，台词包按模板取 `ln_tpl_`）。

`tests/content_id_guard.test.ts`（测试口径变更，两段）：

1. 新常量 `VOCABULARY_PERSONS`（只有 `ash` 一对：人物 ID `ash` 对内核词表的地块种类 `TileKind` 与命中材质 `HitMaterial`），注释写明原因（正典名与内核词重合，改哪一边都会连锁）；`scanSources` 多一个参数，表里的人物 ID 只在"只指人物、且本目录在混合封闭词表里声明过它"时按词表词放行，其余照旧算命中。
2. 两个新用例：扫描器用例（声明过才放行、作值用仍命中、表外人物 ID 仍命中、同时指别的种类的不放行）；钉住用例（表里恰好只有 `ash`，且内容里 `ash` 只指人物）。系统允许名单仍钉为空。

**决定**

| 决定 | 理由 |
| --- | --- |
| 夜羽与阿什用 `body` 字段，而不是借 `requiresFlags` 或 `hideWhen` 的恒假条件 | 语义直白；夜羽招募前是首领巨鸦、招募后是同伴实体，阿什是战斗的固定存在 `fixture_ash`，两者都不该再有一个 NPC 实体。有了卡之后，对固定存在的阿什可以开口（第一幕的问候与话题都是"还不是时候"，台词随 PK-M1-29） |
| 瑟格住旧哨村哨塔（`old_outpost:ruined_tower`），每周一次夜里去镇北灰路口接头 | 第一幕正典第 3 节"旧哨村据点；每周一次到镇外接头"与 A1-D01 节点 f 的"旧哨村的哨塔"；地图简报折桥驿一行写"平时坐镇驿站"，按正典优先级取前者 |
| 瑟格的人设卡等级 17，战斗模板仍 12 | 人设卡写铭录等级（第一幕正典第 3 节第 28 行）；首领模板的等级是战斗的平衡口径，两者不必相同 |
| 弗里茨第一幕不出现（`hideWhen: act IN (prologue, act1)`），第二幕起住旧哨村、白天去锈岭矿工棚带矿工 | 他在第一幕是边石旧矿的灰路工头（迷宫目录 `grayroad_foreman`），生擒后第二幕才是矿工头 |
| 莲娜的干活处写西田，不写磨坊 | 第一幕正典 L18 奥托磨坊空置（遗产纠纷中） |
| 模板表和分布表放在同一行（`tpl_` 行带 `placements`），旧的单图行保留原样 | 命名空间表规定 `tpl_` 归 `npcResidents`；一个模板跨幕跨图使用，分布表让第二幕直接追加瓦伦堡一行；台词回退链从居民 ID 读模板，不改 `speak.ts` |
| 第一幕没有落图的模板：药草婆、匪帮成员、街童、礼拜堂司祭（`placements: []`） | 地图简报的第一幕驻留行没有它们（药草婆在苇桥村、街童在瓦伦堡泥巷）；匪帮第一幕占着旧哨村，但居民在开局一次生成、没有按幕的出现条件，放进旧哨村就会在第二幕建村后仍在，所以独眼团第一幕只由瑟格的人设卡与战斗模板出场（第 3 节第 10 行）；台词与参数照样在，具名化与第二幕用 |
| 模板的显示名：镇卫（目录"城防兵、镇卫"）；其余照目录 | 居民实体的名牌只显示一个称呼；瓦伦堡的城防兵现在仍是 `wb_guard` 一行，第二幕改用模板时按分布加称呼 |
| 校验只对"已建"而未合并的图集地图按信任处理 | 单测只合并部分 pack（`tests/npc_alive_harness.ts`、`tests/npc.test.ts`），第一幕人物住在战斗与城建的地图上；全量内容合并了全部"已建"地图，所以这条信任在全量内容里不起作用，planned 的地图照常报错 |
| `npc.test.ts` 的夹具合并战斗与城建的地图，`npc_alive_harness.ts` 未动 | 前者断言跨图日程的结果；后者的部分内容里猎户与伐木工的跨图段落不解析时，规则兜底的日计划无效（这一段待在家里），活世界指标可能小有变化，列为延后测试 |

**复查发现与处理**（新起的只读子代理一轮，结论"通过但有后续"）

| 序 | 发现 | 判定 | 处理 |
| --- | --- | --- | --- |
| 1 | 阿什的卡带 `concealed: true`（收敛气息，玛莎那一类），压力感知与鉴定会把 60 级的巫妖读作"平静"，与正典里走近他就感到的威压不符 | 真 | 去掉该字段；`tests/npc_act1_cast.test.ts` 钉住它缺省 |
| 2 | 佃农、药草婆、拾荒者的"凡人不信"解释顺序漏了目录写的"魔物作祟" | 真 | 三行的 `unbelief.explain` 加 `sorcery`；新用例按目录两张表逐值比对 17 个模板的档位、等级、夸大、潜质概率与代码、阈值、解释顺序、旧秩序依赖 |
| 3 | `deferredMaps` 对全量内容过宽：图集 89 行里只有 22 行是"已建"，planned 的 62 行本该照常报错 | 真 | 只对 `status === 'built'` 且地图数据未合并的图按信任处理；planned、scenario 与图集外的 ID 一律严查 |
| 4 | 阿什的知识注记与说话规则里写着"第六司"，而第一幕他对玩家开口即可见；该词要到 `a3_ash_tells_sundering` 才解锁 | 真 | 两处改写为"那一位"（与 `data/quests/terms.json` 的替换词一致）；另把夜羽的"被灰侵蚀"改回正典用字"澱"；第一幕只说写定的话这一条作为请求转给 PK-M1-29 |
| 5 | 夜羽第一幕的知识层级写 K3，正典是"P 加一个错位的 K0" | 真 | 改为 K0；她仍是 K3 话题 `lore_dian_word` 的知情者，知情者直接过层级检查，所以她自己的话题照常能谈 |
| 6 | 有名凡人的澱化死亡是否真的没人消费 | 假（已覆盖） | `src/systems/party/exposure.ts` 的 `onCrystalDue` 在同伴之外的分支里就对有名人物收尾（`setLife` 置假并发 `entity.died`），NPC 系统的 `entity.died` 处理再写 `npc.<id>.dead`。本包不新增模块，第 3 节第 1 行改记为"已覆盖" |
| 7 | README 硬性约束栏写"旧的单图行抽签顺序不变"，但模板按 ID 排序后 `tpl_` 行排在 `wb_` 之前，瓦伦堡四行的抽签结果会变 | 真 | 改写为"居民生成仍走 `npc.residents` 一条流，先按模板 ID 排序再逐图生成；新增模板会改变其后模板的抽签序列（已列入延后测试）" |
| 8 | 测试偏弱：模板值没有和目录比对；跨两个分布的编号没有用例；夜羽的"无实体"没有反证；`npcPackId` 的断言是常量自比；瑟格的追求与走私者、弗里茨的跨图段落没有用例 | 真 | 新增"按目录逐值比对"、"拾荒者跨两图编号 1 到 5"、"去掉 `body` 后夜羽照常生成实体并能被招募"、"瑟格每七夜去灰路口"、"走私者夜里在灰路口、弗里茨白天在镇北矿工棚"五处；删掉 `npcPackId` 的常量自比 |
| 9 | 人设卡的潜质写中文名（商才、巧匠），模板的潜质写代码（`craft`、`trade`） | 真但不改 | 人设卡的 `potential` 是玩家可见文本（过泄露扫描与文本抽取），模板的 `codes` 是具名化时抽签用的封闭集合，两者口径不同。列入第 3 节 |
| 10 | `band`、`exaggerate` 暂无消费方；`ceiling` 的数值目录未逐个写明 | 真但不改 | 两者是 M2 具名化与传闻调优的输入（第 3 节第 7 行）；`ceiling` 按目录"骑士 Lv15"等上限人物的等级折算，折算口径记在本行 |

**复查后的决定**（用户可回改）

| 决定 | 理由 |
| --- | --- |
| 夜羽第一幕的知识层级 K0 | 角色设定集 3.1："记忆封在信囊里，只能随信一封封开启"。K3 会让她在第一幕就能谈千年前的事；知情者机制让她自己的话题不受影响 |
| 阿什不写 `concealed` | `concealed` 的含义是收敛气息（`src/systems/cognition/pressure.ts`、`appraise.ts` 读作平静，传闻先验按 5 级算）；阿什是坐在灰里的 60 级巫妖，不收敛 |
| 有名凡人的澱化死亡不新增模块 | 现有的 `onCrystalDue` 加 NPC 系统的 `entity.died` 已经完成同一件事，再加一个消费方会重复杀同一个实体 |

## 3. 留给后续包的事项

| 序 | 事项 | 建议归属 |
| --- | --- | --- |
| 1 | 有名凡人的澱化死亡：已覆盖。`src/systems/party/exposure.ts` 的 `onCrystalDue` 对同伴之外的有名人物收尾，NPC 系统的 `entity.died` 写 `npc.<id>.dead`；计划包行写"由 NPC 系统消费"，实际消费方在同伴系统一侧，主会话可按此改写包行措辞 | 主会话（只是措辞） |
| 2 | 纷争 A1-D01 的决策点可以点名瑟格（现在有卡了，大脑能按人设作答）；单挑与收编的结果现在仍由节点任务写 | PK-M1-33 的后续或纷争的后续包 |
| 3 | 跟随目标"地点须在对方本人的地图上"的校验：人设卡都有 `map`，校验器在任务模型一侧 | PK-M1-33 |
| 4 | 生擒灰路工头的旗标（迷宫 `grayroad_foreman` 认输时写），落地后弗里茨的 `hideWhen` 加上"未被生擒" | PK-M1-30 |
| 5 | 克努特在歼灭分支死于折桥驿或逃往晶沟、收编分支第二幕搬到旧哨村；瑟格收编后第二幕在旧哨村当民兵副手 | PK-M2-21（第二幕人物） |
| 6 | 随行同伴德里斯的同伴数据（PK-M1-15 README 第 6 行） | PK-M1-15 或同伴的后续包 |
| 7 | L4 居民具名化读模板的潜质概率与凡人不信参数 | 内置 AI 的 M2 调优 |
| 8 | `npc_alive_harness.ts` 的部分内容不含林缘与镇北地图，猎户、伐木工、矿工的跨图日程在那里不解析 | PK-M1-10 或 PK-M1-42（活世界回归时决定是否合并地图） |
| 9 | `docs/README.md` 的索引未加本目录（本包不得修改该文件） | 主会话 |
| 10 | 居民模板没有按幕的出现条件（`requiresFlags`、`hideWhen`），所以第一幕占旧哨村的匪帮成员没有落图；加了按幕条件后给 `tpl_bandit` 加旧哨村分布 | NPC 系统的后续包 |
| 11 | 人设卡的潜质写玩家可见的中文名，模板的潜质写抽签代码；具名化时由代码取中文名的映射表 | 内置 AI 的 M2 调优 |
| 12 | 阿什第一幕只说写定的话：问候、话题与闲聊全部落在"还不是时候"一类的写定台词，不交给大模型自由发挥 | PK-M1-29 |
| 13 | `implementation_conventions.md` 第 3 节没有提人设卡的 `body` 字段（本包不改该文件） | 主会话或技术文档的后续修订 |

## 4. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 人物 ID `ash` 与内核词表 `ash` 的重合 | 主会话已定：内容 ID 守卫加一条钉住的已审例外（只此一对）；另一选项是改内核词表或改阿什的人物 ID，都会连锁 | 不阻塞（已按主会话的决定做） |

## 5. 延后的测试

本包按用户的安排只跑了第 `verification_matrix.md` 列出的命令。下列套件与路线可能受影响，集中修复时跑：

| 套件或路线 | 为什么可能受影响 |
| --- | --- |
| `npm run playthrough`（`tests/playthrough/npc_alive_*`、`npc_disputes`、`act1_minimal`、`release`、各结局路线） | 边石镇的居民从 11 人变为 21 人、折桥驿多 4 人、荒原多 3 名拾荒者；新人设卡 9 张；猎户、伐木工、矿工跨图；居民抽签序列因新行改变（`tpl_` 行排在 `wb_` 之前，瓦伦堡居民的外观、住处与等级也会换） |
| `tests/npc_alive.test.ts`、`tests/npc_society.test.ts`、`tests/npc_cognition_arcs.test.ts` | 同上（部分内容的夹具里跨图段落不解析） |
| `tests/tide_rules.test.ts`、`tests/tide_*.test.ts` | 兽潮之夜读有名人物与信任；新增的人设卡可能进入 NPC 行动判定或伤亡名单 |
| `tests/dialogue.test.ts`、`tests/dialogue_talk_extras.test.ts`、`tests/lines.test.ts` | 对固定存在的阿什现在可以开口；话题主人有了卡 |
| `tests/party*.test.ts`、`tests/autoplay_party_ready.test.ts` | 夜羽有卡（`trust.yeyu` 开局即为 40） |
| `tests/save*.test.ts`、`tests/core.test.ts` 的世界哈希与存档样本 | 居民数量与编号改变 |
| `tests/registry.test.ts` | 本包未加变量；现失败的两个用例（六条规则问题）来自场景数据（他包） |
| `tests/combat.test.ts`、`tests/city.test.ts`、`tests/guild.test.ts` | 荒原上多了 3 名拾荒者居民；这些套件不数 NPC，但会在荒原上跑战斗与委托 |
