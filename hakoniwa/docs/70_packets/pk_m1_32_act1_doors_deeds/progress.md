# PK-M1-32 第一幕门与事迹：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-19 | 实施 1 | 九扇第一幕门、计数事件三项、事迹 31 条与称号 7 个、功能标签与注册、测试 | 未提交 | 见 `verification_matrix.md` | 覆盖性复查 |
| 2026-11-19 | 覆盖性复查与修复 | 新起子代理复查 22 条；修：瑕之门不可闭、生业之门会失灵、计数按件数（`count` 钥加 `sum`）、欧拉缺位时的替钥条件、补回目录的替补师傅、百工廊与庭翼的显影钥、锻兵与刃之门读 A1-S02 写的剑钥、仓廪的庭院救治改为任务门钥、三扇正典门读事迹作历钥、刃之门四取二 | 未提交 | 见 `verification_matrix.md` | 主会话提交；三把门钥交 PK-M1-33；第 4 节待用户定 |

## 2. 汇报

### 2026-11-19 实施 1

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `data/doors/doors.json` | 修改 | 追加九扇门，见下表；原有门改三扇（`boss.seg_oneeye_duel.defeated` 保留）：观澜、契约、刃之门加事迹历钥（事迹目录 2.7）；刃之门的甲壳钥另认 A1-S02 写的剑钥 `door_key.vocation_warrior.barga_crystalback_sword`，并按门目录 2.1 改为四取二 |
| `src/systems/doors/types.ts` | 修改 | `COUNTABLE_EVENTS` 加 `gather.done`、`craft.done`、`party.recovered`；`count` 钥加可选字段 `sum`（累加事件里这个数字字段，不再每个事件计 1） |
| `src/systems/doors/keys.ts` | 修改 | `countEvent` 按 `sum` 累加 |
| `src/content/packs/doors.ts` | 修改 | `sum` 必须是字段名 |
| `data/records/deeds.json` | 修改（只追加） | 31 条，共 39 条 |
| `data/records/titles.json` | 修改（只追加） | 7 个，共 10 个 |
| `locales/zh-Hans/ui.json` | 修改（越界，加 9 键） | `ui.common.feature.doorsense`、`court_expansion_1`、`craft_mining`、`craft_logging`、`craft_herbalism`、`craft_alchemy`、`craft_cooking`、`craft_leatherworking`、`craft_weaponcrafting` |
| `docs/40_design/world_state_registry.md` | 修改（越界，一行） | `feature.<功能>` 的取值补 `doorsense`、`court_expansion_1` 与七个 `craft_<生业>` |
| `data/registry/vars.json` | 重生成（越界） | `node tools/registry/build.ts`；本包的那一行只改文档里的取值说明，生成物里属于本包的没有结构变化；文件里另有一处 `quest.<quest>.path` 的写入方变化出自并行的任务包 |
| `tests/doors_act1.test.ts` | 新增 | 6 条 |
| `tests/doors.test.ts` | 修改（越界，小） | "门钥只读有人写的旗标"一条加两把待任务写入的门钥名单 |
| `tests/records_save.test.ts` | 修改（越界，小） | 冻结的第二幕存档读档后补授的事迹与称号：多出本包四条事迹与两个称号 |
| `src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 重生成（越界） | |
| 本目录 | 新增 | 三件套 |

**九扇新门**（复查修复后的现状）

| 数据 id | 名 | 类、翼 | 显影 | 钥 | 效果 | 松动；门阶值；失灵；可闭 |
| --- | --- | --- | --- | --- | --- | --- |
| `craft_mining` | 掘脉之门 | 技艺、百工廊 | 师傅教过 | 全取：师傅 `barga`（替 `grinda_hammerseal`、`herbert_crystaltooth`）；采得铁矿 20 份 | `feature.craft_mining` | 微；1；会失灵；可闭 |
| `craft_logging` | 樵伐之门 | 同上 | 同上 | 全取：师傅 `gaspar` 或 `nick`；采得木材 20 份 | `feature.craft_logging` | 同上 |
| `craft_herbalism` | 撷草之门 | 同上 | 同上 | 全取：师傅 `oola`（欧拉的结局已定且未平反时替 `rosa_oldwatch`、`baishan`）；采得祛灰草 10 份 | `feature.craft_herbalism` | 同上 |
| `craft_alchemy` | 炼剂之门 | 同上 | 同上 | 全取：师傅 `oola`（同上，替 `dorothea_mercy`、`rosa_oldwatch`）；做成祛灰水 10 份 | `feature.craft_alchemy` | 同上 |
| `craft_cooking` | 庖厨之门 | 同上 | 同上 | 全取：师傅 `martha` 或 `ped`（替 `waltrud_koch`）；门钥 `door_key.craft_cooking.dora_dish`（任务写） | `feature.craft_cooking` | 同上 |
| `craft_leatherworking` | 鞣革之门 | 同上 | 同上 | 全取：师傅 `boro` 或 `gorn`（替 `wiebke_gerber`）；做成皮革 5 份 | `feature.craft_leatherworking` | 同上 |
| `craft_weaponcrafting` | 锻兵之门 | 同上 | 同上 | 全取：师傅 `barga`（替 `knut_naumann`、`grinda_hammerseal`）；A1-S02 写的晶背剑门钥（与刃之门一事两门） | `feature.craft_weaponcrafting` | 同上 |
| `garden_granary` | 仓廪之门 | 经营、庭翼 | 门内庭院已开 | 全取：门钥 `door_key.garden_granary.court_heal`、`door_key.garden_granary.timber`（都由 A1-S39 写） | `feature.court_expansion_1` | 小；1；不失灵；不可闭 |
| `truth_flaw` | 瑕之门 | 真相、灰廊 | 按钥 | 全取：`a1_dream_door_woman`、`a1_bron_sees_mark`、`a1_orphan_mark_seen` | `feature.doorsense` | 小；1；不失灵；不可闭 |

**事迹与称号**

| 类 | 新增 |
| --- | --- |
| 成长 | `deed_grow_first_stance`、`lone_track`、`spared`、`underestimated` |
| 讨伐 | `deed_hunt_first_grey`、`colossus_seen` |
| 异名者 | `deed_rare_split_ear`、`black_ridge`、`red_sock`、`three_toes`、`bell_weeper`、`ironbelly`、`toll_taker`、`old_louse`、`hushed` |
| 迷宫 | `deed_dg_old_mine_one_night`、`moon_cellar_untouched` |
| 探索 | `deed_exp_garden_guest` |
| 收藏 | `deed_col_earth_keepsakes`（序章）、`yeyu_shinies`、`fallen_badges` |
| 羁绊 | `deed_bond_first_believer`、`brun_glove`、`farewell` |
| 经营 | `deed_mgmt_craft_first_masterwork` |
| 真相 | `deed_truth_brun_mark` |
| 凡人不信 | `deed_mortal_crystal_broke`、`dwarf_mechanism`、`new_crystal`、`ron_converted`、`three_times` |
| 称号 | `title_street_crystal_breaker`、`title_street_lucky_newbie`、`title_guild_crystal_debt`、`title_tribe_dwarf_cross_section`、`title_wrong_bad_luck`、`title_wrong_witch_accomplice`、`title_col_bring_home` |

39 条事迹中 23 条只能显式授予（`manual`），4 条隐藏。

**`deed_col_earth_keepsakes` 的首次计数**：事迹内核在序章第一 tick 就运行，场景给出的遗物一进背包就记入图鉴（`inventory.changed`）；
序章的重选开场把五件遗物从背包收回，但图鉴里的"曾持有"不删，所以按"曾持有"计数成立。一局不重开只能拿到两件（所选遗物加五号牌），
重开四次能凑齐五件并在序章内授予这条事迹（新起子代理用真实 `createGame` 的探针确认，事迹在 tick 212 授予，重开后仍在）。
"重开也算"是否合意见第 4 节第 1 条。

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 千门 14 第 4 条 | 第一、二扇生业之门微档，第三扇起小档 | 每扇写微档，加倍规则留给千门内核 | 门数据一扇一档，"第几扇"是运行时的事 | 否（PK-M2-13 遗留） |
| 门目录 5.5 | 仓廪之门的物钥"木材 200（消耗，建造）" | 改成任务写的门钥 `door_key.garden_granary.timber` | 木材是商店常备物，物钥写它违反千门 21.6 第 4 条"钱买不到门"；目录同时写明这是建造投入，A1-S39 有交付目标 | 否 |
| 门目录 5.5 | 历钥"第一次在庭院里救治同伴" | 任务门钥 `door_key.garden_granary.court_heal`（A1-S39 的庭院见证步写） | `party.recovered` 没有地点，也会在庭院开放之前、在别处触发；A1-S39 本来就有庭院里的见证步 | 否 |
| 门目录 5.6 | 锻兵之门的历钥"与巴尔加一起打成晶背剑" | 读 A1-S02 写的门钥 `door_key.vocation_warrior.barga_crystalback_sword` | 这把剑没有来源（没有配方、任务或场景给这件物品）；A1-S02 的交付步收走甲壳，奖励写这把门钥 | 否 |
| 千门 14 第 2 条与 2.2 | 层一"师傅教一次，做够数量"；百工廊"师傅教过一次即显影" | 计数按事件里的件数累加（`count` 钥的 `sum`）；显影钥是师傅钥 | 一次采集可得多份 | 否 |
| 门目录 5.6 | 庖厨之门的历钥"让朵拉吃完一道菜" | 任务写的门钥 `door_key.craft_cooking.dora_dish` | 没有对应的事件或旗标，门钥族由任务写 | 否 |
| 门目录 5.6 | 替补师傅 `grinda_hammerseal`、`herbert_crystaltooth`、`rosa_oldwatch`、`baishan`、`dorothea_mercy` | 照写进替钥 | 他们还不在人物数据里，内核按"缺位"处理，原师傅仍是钥；替钥要等人物导入才有人可找 | 否 |
| 事迹目录 3.2 | "第一张灰斑狼皮"触发"灰化野兽"击杀 | `stat` `kills.dian_wolf` 加持有 `wolf_pelt` | 内核的击杀计数按单个魔物 ID；"灰化野兽"是一类 | 是（第 4 条第 3 项） |
| 事迹目录 3.7 | 送别：同伴"死亡" | 读 `companion.<id>.lost` | 内核把泉畔期也写成 `dead`，`lost` 才是泉畔期已过 | 否 |

## 3. 遗留事项

| 事项 | 建议去处 |
| --- | --- |
| 门钥 `door_key.craft_cooking.dora_dish`（朵拉吃完）、`door_key.garden_granary.court_heal`（A1-S39 庭院里的见证步）、`door_key.garden_granary.timber`（A1-S39 交付木材 200）的写入；写入后从 `tests/doors.test.ts` 的待写名单删掉（那条测试现已认得任务的 `key` 效果） | PK-M1-33 |
| 标签"先用祛灰草水泡过"（鞣革）与"一棵也不越林约"（樵伐）不受检查：任何皮革、任何木材都计数 | PK-M1-33（S36、S33 可改写门钥）或生业内核给事件加来源字段 |
| 门相句：千门 21.1 的 `look` 与 `hint: { crack, glimpse }`，数据仍是一句 `hint`；PK-M1-14 路由到本包，本包未做 | PK-M1-22（回廊界面）或千门后续包 |
| C88 信使之门与 C89 澄流、聆灵、立国、终门的钥重写 | PK-M2-24（开发计划已归） |
| 渊契之门旧存档补授召唤技能 | PK-M1-56 |
| 识才之门的事迹历钥 `deed_grow_underestimated`、猎之门的 `deed_grow_lone_track`、门内庭院的 `deed_grow_dream_door`（事迹目录 2.7）未接：识才的第三把钥要先按差距盘点改成凡人担保，猎之门是全取结构，门内庭院是剧情必开门只用时钥 | 本包后续或 PK-M1-33 |
| 事迹目录的导入映射 `tools/content/mappings/` 与批次记录 `data/_batches/content_act1_doors_01.json`、`content_act1_deeds_01.json`（本批是手写数据） | 内容批次工具的后续 |
| 灶火前世的庖厨之门层一自带（开局即开，不计门阶值，不松动） | PK-M1-56 |
| 仓廪之门效果用 `feature.court_expansion_1`；千门 21.2 的效果原语是 `garden { tier }`，内核还没有 | PK-M1-53 |
| 三条事迹奖励（收藏外观、夜羽的窝、布伦的旧手套）不在事迹奖励的字段里 | 收藏与庭院陈列 |
| 师傅授课旗标 `taught.craft_<生业>.<人>` 的写入（师傅的一次授课场景或对话） | PK-M1-33（任务）、PK-M1-19（对话） |
| 生业之门开门后改由门决定生业的层；第三扇起松动加倍 | PK-M2-13 |
| 纹感 `doorsense` 的效果（靠近门纹持有者手背发热） | PK-M1-56 |
| 庭院扩建一档 `court_expansion_1` 的效果（庭格 5×5、仓廪、陈列柜 6 位） | PK-M1-53、PK-M2-06 |
| 事迹的认知触发：`deed_hunt_colossus_seen`（目击）、`deed_bond_first_believer` 与 `deed_mortal_ron_converted`（信念）、`deed_mortal_dwarf_mechanism`（传闻）、`deed_mortal_three_times`（越级计数）；其余 18 条显式授予事迹要在各自结算点调 `records.deed.grant` | "事迹的认知触发与立名"包；各场景、任务包 |
| 收藏的完成镜像 `col.<收藏>.done` 无人写，`deed_col_yeyu_shinies`、`deed_col_fallen_badges` 暂不触发 | 遗物与收藏批次 |
| 称号：`title_street_lucky_newbie`、`title_wrong_bad_luck` 要传闻读取方才能授予；`title_street_f_oddball` 的 `lose` 应同时读 `title.title_street_lucky_newbie`（目录写两者都能取代它） | 认知包；本包后续 |
| 注册表 `ironman` 的读取方列表应加 records（V4 告警） | 注册表维护方 |
| 两条分支候选事迹（`deed_bond_brun_glove`、`deed_rare_black_ridge`）缺专用的分支旗标 | PK-M1-33、PK-M1-34 |
| 成就表由事迹生成（本包事迹没有名望 50 的）；分支事迹要标 `branch` 才不进成就分母：`deed_bond_brun_glove`、`deed_rare_black_ridge` 缺专用分支旗标 | PK-M2-02（成就生成）、PK-M1-33 |

## 4. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 序章重选开场时，收回的遗物仍算"曾持有"，于是四次重开能在序章内凑齐 `deed_col_earth_keepsakes` | 推荐保留（重开是玩家真的看过那几件东西）；或由事迹内核在重开时把收回的物品移出图鉴 | 不阻塞 |
| 2 | 仓廪之门的历钥"在庭院里救治同伴"没有地点 | 推荐先读 `party.recovered`（已落地）；或请同伴系统给事件加地点字段后改读 | 不阻塞 |
| 3 | "第一张灰斑狼皮"读澱狼击杀加持有狼皮 | 推荐保留；或请事迹内核支持按魔物科或标签计数 | 不阻塞 |
| 4 | `title_guild_crystal_debt` 的授予时点："第二块水晶之后"可能指第一幕的 `deed_mortal_new_crystal` 或第二幕的 `deed_mortal_second_crystal` | 推荐第一幕那条；本包暂不写授予条件 | 不阻塞 |
| 5 | 本包多导入的六条"一起""一到五"等幕的事迹与一个第 4.8 节称号（`deed_exp_garden_guest`、`deed_rare_hushed`、`deed_mgmt_craft_first_masterwork`、`deed_mortal_three_times`、`deed_col_fallen_badges`、称号 `title_col_bring_home`） | 推荐保留（最早可得在第一幕）；或挪到后续批次 | 不阻塞 |

## 5. 延后测试

| 套件或命令 | 为什么可能受影响 |
| --- | --- |
| `npm test` 全量 | 门数 43 到 52，事迹 8 到 39，任何按数量的断言可能变 |
| `npm run playthrough`（`release`、`act1_minimal`） | 新门与事迹会在常规路线上显影、授予；开门节奏 17.4 第 1 条（相邻两次开门间隔）只有通关才测得出 |
| `tests/save_migration.test.ts` | 新门进存档的门状态表 |
| `tests/content_validation.test.ts` | 已跑的部分见 `verification_matrix.md`；余下失败出自女神与台词包 |
| `tests/client_corridor_tracker.test.ts`、`tests/client_windows.test.ts`、`tests/client_records_windows.test.ts` | 回廊与事迹簿窗口按门与事迹数据渲染 |
| `tests/autoplay_*.test.ts` | 自动玩家的门与事迹路线 |
