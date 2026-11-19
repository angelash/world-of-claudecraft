# PK-M1-30 第一幕魔物、首领与迷宫：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-18 | 实施 1 | 瑟格战斗模板改名（主会话插单，后随 `30e03d7129` 提交）；33 种新魔物、已有魔物的注册表字段；48 个刷新组与 12 个地点；迷宫与澱巢记录；PK-M1-33 的五项请求；新测试 `tests/act1_bestiary.test.ts` | 未提交 | 见 `verification_matrix.md` | 新起子代理复查 |
| 2026-11-18 | QA 1 | 新起子代理覆盖性复查：0 BLOCKING、8 SHOULD-FIX、若干 NIT；修了第 2 节"复查与处理"表里标"已修"的各条，其余写进第 3、4 节 | 未提交 | 见 `verification_matrix.md`（修后重跑） | 主会话提交 |

## 2. 汇报

### 2026-11-18 实施 1

**改动文件**（"区外"标出不在本包区域的文件）

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `data/combat/monsters.json` | 修改 | 新增 33 条；已有 16 条补注册表字段与部件标签；守护巨鸦悬石改 `at`；澱巨像的掩体、可破坏物、澱核与崩解期澱渣；`seg_oneeye` 改名 `seg_oneeye_duel` |
| `data/combat/maps/` 九张图 | 修改 | `seal_ruins`、`seal_ruins_depths`、`borderstone_north`、`forest_edge`、`ironhemlock_deep`、`rustridge_mine`、`dg_old_mine`、`brokenspan_post`、`ash_waste`：刷新组；深处加三块悬石的地点 |
| `data/dungeons/dungeons.json` | 修改 | 见第 2 节"迷宫与澱巢" |
| `data/dungeons/nests.json` | 修改 | 两个澱巢 |
| `tests/act1_bestiary.test.ts` | 新增 | 15 个用例：数据行对目录、落图清单、层次换算、注册表字段、部件标签、战场地点、迷宫与澱巢记录、刷新点门控；引擎里跑鼠后、地窖与魔物季三组 |
| `tests/map_launch.test.ts` | 修改 | 地窖室内层里的刷新点不按步行可达检查（与同文件 `NOT_WALKED` 同一口径）；热点钉住值加 `borderstone.old_granary` |
| `tests/boss_mechanics.test.ts` | 修改 | 试场地图加三块悬石的地点（PK-M1-12 预告的 `offset` 换 `at`） |
| `tests/combat.test.ts` | 修改 | 瑟格改名；"validates every combat, doors and party table" 改用整份内容（新魔物的掉落是经济与物品包的材料） |
| 区外：`data/npc/maps.json` | 修改（只动 `borderstone`） | 地点 `old_granary`（局部澱度 2）、`north_spring_square`、`orphanage_street`、`cover_north_gate`、`cover_eaves_1` 到 `_3`、`orphanage_hut_1`、`orphanage_fence_1`，全部 `open`、`no_roof`；刷新点 `bs_granary_rats`、`bs_furrow_rat_queen`、`bs_cellar_rats`、`bs_cellar_coin_rats`、`bs_cellar_crone`。其余地图与字段原样 |
| 区外：`data/doors/doors.json` | 修改（一处） | `door_vocation_warrior` 的钥 `boss.seg_oneeye.defeated` 改 `boss.seg_oneeye_duel.defeated` |
| 区外：`data/registry/renames.json` | 修改 | 版本 2 改 3；追加 `{ since: 3, kind: monster, from: seg_oneeye, to: seg_oneeye_duel }` |
| 区外：`tests/save_renames.test.ts` | 修改（三行） | 探针切片加 `units.*.monsterId`（`monster` 类），新类的往返用例才有可查的位置 |
| 区外：`tests/doors.test.ts`、`tests/fixtures/procedural_baseline.json` | 修改 | 瑟格改名（旗标与实体 ID 各一处） |
| 生成物：`locales/zh-Hans/content.generated.json`、`src/core/text_keys.generated.ts`、`data/registry/vars.json` | 再生成 | 新魔物、地点、澱巢的显示文本；提交时在提交树上重跑三个生成工具 |

共用文件（`docs/40_design/world_state_registry.md`、`src/content/references.ts`、`tools/content/validators/namespace.ts`、`data/README.md`、`data/combat/abilities.json`、`data/combat/auras.json`）本包没有改动：新魔物只用已有技能与光环，刷新点与条件只用注册表已有的变量。

**新魔物**（全部带 `componentTags` 的按图鉴第 4.11 节；人形不剥取）

| 组 | ID |
| --- | --- |
| 洛萨第一幕（图鉴 4.1） | `field_hare`、`greyelm_deer`、`forest_boar`、`ironpine_bear`、`ashhorn_deer`、`rust_beetle`、`greybrook_crayfish`、`oldwatch_sentinel`、`gravefield_wisp`、`greyroad_smuggler`；第二幕首见 `northern_elk` |
| 荒原外缘（图鉴 4.2） | `waste_jackal`、`bone_vulture`、`shard_louse`、`waste_scavenger`、`gully_digger`；第二幕 `greyshard_fence`；第五幕 `ashtide_vanguard` |
| 迷宫专属（迷宫目录 3.1） | `vein_grub`、`grayroad_foreman`（精英）、`coinmouth_rat`、`tally_rat_crone`（精英，地窖巢主）、`glyph_shade`、`ash_page_swarm`、`ash_scroll_drift`（活性期守巢首领） |
| 异名者（图鉴 5） | `red_sock`、`three_toes`、`bell_weeper`、`ironbelly`、`toll_taker`、`old_louse` |
| 巢主（图鉴 6） | `furrow_rat_queen`、`rust_matron` |

**数值来源**（不自造平衡数：能从文档算出的照算，文档没给的写在这里，统一待 PK-M1-42 校准）

| 项 | 取值 | 来源 |
| --- | --- | --- |
| 异名者倍率 | `hpMult` 1.27、`dmgMult` 1.07、`xpMult` 1.5 | 成长第 18.2 节对裂耳、黑脊的换算（异名者 2.5 满编、实际 2 人） |
| 巢主倍率 | 垄沟鼠后 2.91 / 1.2 / 2.5（实际 2 人：玩家加夜羽，第 4 周常规队伍）；锈母、灰页之卷 3.48 / 1.2 / 2.5（实际 3 人，到满编为止，与晶背之母同） | 战斗第 5.5 节巢主 8、1.8、5；成长第 18.2 节的巢主行按满编 2.5 换算：生命 × min(1, 实际 / 2.5)^0.8，再除内核的 2.3、1.5、2 |
| 记账鼠婆 | `elite`，不设 `tier`；地窖的层不写 `boss`（精英倒下不写 `boss.<ID>.defeated`），守核首领仍是她 | 迷宫目录第 2 节"首领数 0（巢主为精英）"、第 3.1.3 节"精英（巢主）" |
| `rumorScale` | `{ perLevel: 0.06, max: 0.3 }` | 图鉴第 2.7 节 |
| `flee` 与 `yieldAtPct`、`social` | 按图鉴各行（田野兔 0.5，苍榆鹿同上；走私者 0.2 与 0.3；掘手 0.2、0.3、群 5；拾荒者 0.3、0.4；黑商护卫认输 0.2；工头 0.3） | 图鉴第 4.1、4.2 节；迷宫目录第 3.1.2 节 |
| 命中词缀的概率与时长 | 致盲 0.25 / 5 秒、命中昏迷 0.12 / 1 秒、击退 0.25 到 0.3、腐蚀 0.2 到 0.3（护甲 -10%）、震荡 0.15 / 2 秒、枯哭 0.2 | 主工程原型（`zone1.ts` 的 `Blinding Powder`、`Skullthump`，`zone2.ts` 的 `Backhand`）；腐蚀与枯哭原型无数，取保守值 |
| `charge` | `{ minRange: 4, every: 10 }` | 设计无数；取值待校准 |
| `ashPuddle` | 半径 1.5、减速 30%、6 秒 | 设计无数；取值待校准 |
| `stomp`（驼鹿）、`aoePulse`（灰页群、灰页之卷）、`stoneskin`（铁胃、老虱）、`deathThroes`（晶脉蛆）、`desperateHeal`（鼠婆 20% 时回 25%） | 见数据 | 设计只给字段；鼠婆的 25% 取主工程 `desperateHeal` 原型 |
| 金钱 | 野兽不给；普通魔物按同级已有魔物；人形 1.5 倍；异名者 20 到 40（与裂耳、黑脊同档）、精英与巢主 40 到 80 铜 | 图鉴第 2.5 节；已有数据的档 |
| 掉落 | 只写已入库的物品（`hide`、`part_*_t1`、`part_bone_t2`、`boar_tusk`、`iron_ore`、晶 1 到晶 5、`src_*`、`eq_furrow_queen_charm`、`eq_rustmatron_buckler`）；异名者"部件两份、晶升一档"写成数量 2 与晶 2 | 图鉴第 1.3、5 节 |

**迷宫与澱巢**

| 记录 | 写了什么 |
| --- | --- |
| `dg_old_mine` | `coreBoss: crystal_mother`；`overflowTo: borderstone`；养、毁、净都要 `act.3.entered`（第一幕的主人是代官，第三幕划入领地），净 3 日 |
| `dg_moon_cellar` | 守核首领 `tally_rat_crone`；养 `ownerRefuses`（玛莎"账记上"）；毁 1 日（"一夜塌掉"）；净 3 日（欧拉熏三天）；地窖的刷新点在净的结局 `a1_bell_tab_seen` 之后停（S17 可不打鼠婆就选净） |
| `dg_seal_ruins` | `overflowTo: borderstone`；仍不设处置（核即封印，PK-M1-50 的口径） |
| `nest_furrow_rat_queen` | 边石镇 `old_granary`，第 2 阶起（巢主在场），`when: act_week >= 4`（A1-S25 的门槛）；净要 `door.vocation_druid OR has.cs_greybane_wash >= 3`，3 日 |
| `nest_rust_matron` | 锈岭矿 `old_miner_shed`，第 2 阶起，`when: act.2.entered`；净 7 日 |
| 巢内刷新点 | `requiresFlags`：`dg.<巢>.stage`（巢已醒）、`!dg.<巢>.cleared`（巢主未倒）、`!dg.<巢>.collapsed`；巢主 1440 分钟重生（在巢外被打死不算清巢，巢主须能回来，否则三种处置永远开不了；在巢前倒下即 `cleared`，到期的重生被门控丢掉）；两个巢的局部澱度都是 2，按第 2.8 节长不到满巢，`cleared` 不会自己转假；巢里的鼠与甲虫 15 分钟重生（"出生率加倍"的静态写法，其余同类 30 到 120 分钟） |

**刷新组**（门控旗标只用注册表已有的变量）

| 地图 | 组 |
| --- | --- |
| `borderstone_north` | 田野兔、林猪两组、灰角鹿 4 只（定级 6 到 8）、三趾；第二幕：驼鹿、走私者 |
| `forest_edge` | 苍榆鹿（鹿泉）、林猪（南路哨外）；第二幕：灰角鹿（北缘） |
| `ironhemlock_deep` | 魔物季 `a1_beast_season`：苍榆鹿、铁杉熊、灰角鹿（定级 8 到 10）；第二幕：驼鹿 |
| `rustridge_mine` | 第二幕：锈甲虫两组、铁胃、锈母与巢里的锈甲虫 |
| `dg_old_mine` | 晶脉蛆（晶脉洞）、灰路工头（走私营地，不重生） |
| `brokenspan_post` | 走私者、荒原豺两组（定级 8 到 12）、大螯虾、骨鹫、收路钱的；第二幕：黑商护卫（定级 15 到 20） |
| `ash_waste` | 荒原豺两组（灰路两侧：晶沟东缘与灰沙坡西）、晶虱（定级 9 到 13）、掘手、晶沟老虱、走私者（晶沟北口）、拾荒者 |
| `seal_ruins`、`seal_ruins_depths` | 深处澱渣团一组（PK-M1-33 的请求）；第三幕活性期（`act.3.entered` 且 `dg.dg_seal_ruins.active`）：门纹壁影、灰页群、澱灵，巢井的灰页之卷再要 `companion.yeyu.recruited` |
| `borderstone` | 西田鼠巢（鼠后与 4 只澱鼠）；醉月亭地窖：A1-M04 起 4 只澱鼠，A1-S17 起 4 只衔铜鼠与记账鼠婆（地窖清空或塌了就停） |

中立的野兽与人（田野兔、苍榆鹿、骨鹫、拾荒者、掘手）写 `aggroRadius: 0`：不主动开战，被打才还手；内核没有"中立魔物"的出生阵营。

**与设计文档不一致或文档未写而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 图鉴 4.2 | 骨鹫 10 到 16；灰晶黑商护卫 14 到 20（第二幕） | 骨鹫 10 到 15；护卫 15 到 20、`act: act2` | V6 按幕等级带拦截（第一幕 1 到 15，第二幕 15 到 30） | 是（第 4 节第 1 条） |
| 图鉴 4.2 | 门框蜥 14 到 18、灰影 12 到 20（"一到二"幕） | 不入库 | 两段都跨不进任一幕的等级带；灰影还要 `weatherSpawn` 的灰暴（地图简报定在第二幕） | 是（第 4 节第 1 条） |
| 图鉴 4.2 | 灰潮先锋 50 到 56（第五幕） | 入库但不写 `act`、不落图 | 第五幕带 55 到 60；刷新由第五幕战线结算触发（M3） | 是（第 4 节第 1 条） |
| 图鉴 4.1、地图简报 A10 | 旧哨亡卫、哭钟在旧哨村废墟 | 入库，不落图 | 旧哨村是枢纽图，按模板不放常驻魔物（PK-M1-35 已定，`tests/map_metrics.test.ts` 钉住）；哨塔修复的 `pacifiedBy` 旗标注册表里没有 | 否（请求） |
| 图鉴 4.1、5 | 坟火在镇南墓园、红袜子在西田 | 入库，不落图 | 边石镇是枢纽图；两者要由任务旗标门控（A1-S14 已有，A1-S24 尚无数据） | 否（请求 PK-M1-33） |
| 图鉴 2.6、7.2 | 系统潮的领头"老灰狼"是 `dian_wolf` 的老变体（变体不另立条目） | 不新增条目 | 内核没有逐个出生的层次变体（`rank` 只读魔物定义）；改动面跨战斗多个文件 | 否（请求战斗） |
| 战斗 10.8 | 澱巨像崩解期剥落的澱晶 `every` 化为澱渣；"击碎澱核即进入终段" | 进入崩解时一次召 2 只澱渣；澱核是第 2 阶段起出现的部位（生命为首领的 10%），击碎给 6 秒失衡 | 增援的 `every` 不能按阶段起算；内核没有"进入终段"的动作，免伤护盾会让自动玩家打不动 | 否 |
| 战斗 10.8、第一幕 10.4 | 孤儿院前街的木屋与栅栏可破坏 | 两件可破坏物（首领生命 3%），砸中给 2 秒失衡 | 设计只写可破坏，数值待校准 | 否 |
| 迷宫目录 3.1.1 | 灰页之卷的非战斗解法：巢井三处风口挂湿布 | 三个互动物件（按首领出生点偏移放置），用满 3 个即解决 | 地图没有风口地点；湿布的物品门槛没有物品 | 否 |
| 迷宫目录 3.1.1 | 灰页之卷二阶段起每 15 秒 3 秒读条的"焚卷"（可打断），一阶段纸刃 | 不写"焚卷"：`bigCast` 的 `castTime` 内核不读，而 `sk_mon_pageburn` 是瞬发；纸刃（`aoePulse`）全程，50% 软狂暴照写；掉落中晶（本阶晶 2 升一档） | 要新技能（3 秒读条的焚卷）与按阶段起算的计时词缀 | 否（请求战斗） |
| 图鉴 4.1、4.2 | 林猪、红袜子的冲锋，驼鹿的践踏 | 只用注册表字段 `charge`、`stomp`，不再同时挂同名技能 | 两者会各自触发 | 否 |
| 图鉴 4.1 | 三趾 `lureFlee` | 写了，但异名者按内核规则不逃，字段暂不生效 | 内核口径（战斗第 11 节 `flee` 行） | 否 |
| 图鉴 4.1、5 | `cropBlight`（澱野猪、红袜子）、`plague`、`silence`、`terrify`、`summonAdds` 的周期增援 | `cropBlight` 不写（设计无比例，又会改动经济路线）；`plague`、`silence` 首需第二、三幕，不写；`summonAdds` 写成按血线的 `summon` | 不自造会影响经济的数；字段首需 | 否（`cropBlight` 的比例请设计给出） |
| 地图简报 A7 | 第一幕刷新组从魔物季旗标起 | 本包新加的三组按 `a1_beast_season`；PK-M1-35 已放的澱野猪、澱狼与黑脊三组照旧常驻 | 全部门控后地图在第一幕没有常驻魔物，违反野外模板（`map_metrics`） | 否 |
| 迷宫目录 3.1.2 | 边石旧矿的净：欧拉的祛灰草加澄流之门 | 只写 `act.3.entered` 与 3 日 | 澄流之门的门编号与读法不在本包 | 否 |

**PK-M1-33 的五项请求**

| 序 | 请求 | 处理 |
| --- | --- | --- |
| 1 | 醉月亭地窖没有鼠、深处没有澱渣团 | 已加（见上表）；地窖的刷新点在室内层里，`tests/map_launch.test.ts` 的步行可达检查对室内层跳过 |
| 2 | `dg_moon_cellar` 没有处置表，S17 写的 `choice` 被退回 | 已加三种处置（养由主人拒绝） |
| 3 | 澱灵 11 到 13，M07 是 8 到 10 级的任务 | 不改：图鉴第 3 节与地图简报 A4 都写 11 到 13（它也是澱巨像的随从）；成长第 18.2 节不涉及。见第 4 节第 2 条 |
| 4 | 门厅落石收回到 `a1_ruins_gate_cleared` | 不改：落石关的是遗迹南门（`gate_borderstone` 在门厅），而写这个旗标的 M07 `vein` 阶段要先从这里进遗迹；收回后 M07 进不去。`a1_mine_cleared` 的塌方口同理留给 PK-M1-35 与自动玩家（PK-M1-10）一起收 |
| 5 | `a1_beast_season` 可用 | 已用于铁杉林深处的三组新刷新组 |

### 2026-11-18 QA 1：新起子代理的覆盖性复查

复查以提交 `73883baa2f` 为魔物数据的基线（复查期间他会话提交了 `30e03d7129`，其中已含本包的改名、`doors.json` 一处、`renames.json` 与 `save_renames.test.ts`）。

| 序 | 发现 | 级别 | 处理 |
| --- | --- | --- | --- |
| 1 | 地窖层的 `boss` 是精英鼠婆，精英倒下不写 `boss.<ID>.defeated`，状态条永远显示未倒 | SHOULD-FIX | 已修：层不写 `boss`，守核首领照旧 |
| 2 | S17 可不打鼠婆就直接写 `choice = purify`，净完的地窖仍刷鼠 | SHOULD-FIX | 已修：地窖三组刷新点加 `!a1_bell_tab_seen`（注册表里"醉月亭地窖'净'的结局"） |
| 3 | 垄沟鼠后的生命倍率按满编 3 算，成长第 18.2 节的巢主行按 2.5 | SHOULD-FIX | 已修：2.91（数值来源表与测试同改） |
| 4 | 灰页之卷：基础技能里的瞬发焚页从开战就放，阶段换的是同一组技能，`bigCast.castTime` 内核不读，纸刃全程，掉落应升一档 | SHOULD-FIX | 已修：去掉基础技能、无效的阶段与 `bigCast`，掉落改中晶；焚卷转请求（第 3 节） |
| 5 | 巢主在巢外被打死不算清巢，又不重生，三种处置永远开不了；文档说"巢长回时重刷"不成立（两巢澱度 2，长不到满巢） | SHOULD-FIX | 已修：两位巢主 1440 分钟重生；文档改写 |
| 6 | 四种新人形没有 `race`，控制递减读它 | SHOULD-FIX | 已修：`race: human`（混族照独眼团匪徒的先例） |
| 7 | 驼鹿与遗迹回访三种只在后幕落图，靠 V6 按地图推断的第一幕过线 | SHOULD-FIX | 写进第 4 节第 1 条，待用户定 |
| 8 | 荒原的走私者落在第一幕南段之外；一组荒原豺不在灰路上 | SHOULD-FIX | 已修：走私者移到晶沟北口，豺移到晶沟东缘 |
| 9 | 驼鹿掉兽骨、工头掉药水、铁胃铁矿 0.5、三趾与收路钱的缺 `src_hollow_1`、灰页群应掉晶 2 | NIT | 已修：按图鉴改 |
| 10 | 林猪、红袜子同时有冲锋技能与 `charge`，驼鹿同时有践踏技能与 `stomp` | NIT | 已修：只留注册表字段 |
| 11 | 鼠婆金钱 20 到 40 与"精英 40 到 80"不符 | NIT | 已修：40 到 80 |
| 12 | 鼠后的部件标签缺 `heart`（鼠后之心按 T2 心） | NIT | 已修 |
| 13 | 测试：地窖、鼠巢、魔物季在门控之前没有断言为 0；巢与地窖的门控没有逐组钉住；部件标签只钉了 14 种 | NIT | 已修：前置为 0 的断言、全部巢与地窖刷新点的 `requiresFlags` 与巢主重生逐组钉住、部件标签扩到 30 种 |
| 14 | 红袜子的灰鬃用被动光环；素材规格仍指 `seg_oneeye`；重命名表的 `monster` 类缺 `eventFields`；遗迹溢出出的是野兽潮；第二幕 A2 的锈甲虫组没加（A5 已放在矿里的废巷）；旧矿刷新点不读塌缩 | NIT | 转第 3 节 |
| 15 | 异名者金钱 20 到 40，图鉴写"按精英计" | NIT | 保留：与已有的裂耳、黑脊同档，数值来源表写明 |

### 2026-11-18 插单：瑟格战斗模板改名

人设卡要用人物 ID `seg_oneeye`，战斗模板按实现约定第 3 节改名 `seg_oneeye_duel`；改动见上方文件表的改名项。`data/_batches/content_base_progression_01.json` 是已合入批次的历史记录，保留旧写法。

## 3. 留给后续包的事项与请求

| 事项 | 建议去处 |
| --- | --- |
| 活性期难度：在活性期迷宫里出生的魔物等级 +2、生命与伤害 ×1.15、按澱源抽 1 到 2 个 `afx_` 词缀（需要词缀表与出生时的读法，词缀首需第三幕）；首领的活性词条（晶背之母"连塌"）；深相掉落（英雄变体）与守核首领的晶再升一档 +15% | 战斗与迷宫的后续包（第三幕回访之前） |
| 收晶 -15：清剿全部常驻魔物并收晶时经 `dungeons.shift` 降活性 | 迷宫运行时的后续包 |
| 巢的袭扰：第二阶起每 7 日向最近的商路、农田或聚落派一队 | PK-M1-52 的溢出规则或迷宫运行时 |
| 满巢转小潮：`surge_lotha_rim_nest` 的 `fromMaps` 加 `borderstone`（垄沟鼠后的巢，任务目录 A1-S25"满巢时鼠群加入兽潮第一波"）；林缘与线北没有设计上的澱巢记录，"林中澱巢"需设计给出；`old_granary` 局部澱度 2，按第 2.8 节到不了满巢 | PK-M1-52（数据）、设计（第 4 节第 3 条） |
| 遗迹溢出：`surge_lotha_rim_overflow` 只按目标图匹配，封门遗迹溢出时出的是野兽潮，不是遗迹自己的魔物（迷宫目录第 1.3 节）；需要按迷宫分的规则 | PK-M1-52 |
| 焚卷：3 秒读条、可打断的 `sk_mon_pageburn` 变体，计时词缀按阶段起算 | 战斗（第三幕回访之前） |
| 素材规格 `assets/prompts/specs/bosses.json` 的 `art_boss_seg_oneeye_special`、`_rage`、`_card` 仍写 `ref: seg_oneeye`，应改指 `seg_oneeye_duel` | 素材通道 |
| 重命名表的 `monster` 类没有 `eventFields` 限定：版本 2 的存档里事件环中恰好等于 `seg_oneeye` 的字符串（也可能是人物）会被改名；按战斗事件里放魔物 ID 的字段补一行限定 | 内核（存档迁移）、战斗 |
| 旧矿的刷新点按 `!dg.dg_old_mine.collapsed` 门控、毁的"中晶 1"（浅迷宫不出核） | 第三幕（处置从第三幕起开放） |
| 红袜子的灰鬃：现在用澱野猪同款的被动光环 `aur_mon_thorns`；设计写的 `thorns` 字段没给数值 | 设计、PK-M1-42 |
| 系统潮的领头"老灰狼"：波次组支持层次变体（`dian_wolf` 按第 2.6 节升老魔物：等级 +2、`elite`、名前加"老"），然后 `mtide_lotha_rim_wild` 加 1 只 | 战斗内核；PK-M1-52 |
| 巢的澱度进暴露、目击与客户端：在世界系统加可登记的澱度层（迷宫登记 `sedimentDelta`），澱病 `body.ts`、认知 `witness.ts`、客户端 `scene.ts` 与 `audio_world.ts` 改读这一层 | 内核；PK-M1-51、PK-M1-18、PK-M1-24 |
| 异名者的传闻强度登记为修正项 `monster`、键 `rumor:<魔物>`（本包的八只异名者都带 `rumorScale`） | PK-M1-18（认知） |
| 新物品：`part_meat_t2`、`part_horn_t2`、`part_fang_t2`、`part_carapace_t2`、`part_feather_t2`、`part_essence_t2`、`part_scale_t2`、`part_essence_t5`、`mat_thick_hide`、`mat_bear_fat`、`src_hollow_3`；巢主专名部件 `rat_queen_heart`、`rustmatron_carapace`；异名物 `nm_faded_red_sock`、`nm_three_toes_antler`、`nm_oldwatch_clapper`、`nm_ironbelly_gizzard`、`nm_brass_dog_tag`、`nm_louse_belly_crystal`；证物与遗物 `rl_rust_whistle_tag`、`evi_smuggler_ledger_leaf`、`rl_ashcity_household`、`evi_blackmarket_draft`、`lb_ash_scorched_leaves`、`rl_evening_bell_tab`。入库后把对应掉落补进 `monsters.json`（本包按图鉴给的概率） | PK-M1-31、遗物批次 |
| A1-S17 的 `barrels` 目标改为 `coinmouth_rat` ×6，加 `nest` 阶段（击败 `tally_rat_crone`）；A1-S24、S25、S26、S27 入库后，红袜子（西田）与坟火（墓园，`!a1_graveyard_purified` 加夜间）按任务旗标落到边石镇 | PK-M1-33 |
| 旧哨亡卫与哭钟落图：旧哨村是枢纽图；需要定是否给 A10 开例外（夜间、纷争后）以及哨塔修复的旗标 | PK-M1-35 的模板、注册表、PK-M2 建村 |
| 灰潮先锋的刷新由第五幕战线结算触发 | M3 |
| 回访段：灰页群"收拢而不烧毁"的掉落 `lb_ash_scorched_leaves`、湿布的物品门槛、风口地点 | 第三幕迷宫包 |
| 首领首次挑战胜率与击杀时间（垄沟鼠后、锈母、记账鼠婆与崩解期的澱核） | PK-M1-42 |

## 4. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 图鉴与地图简报的等级段与幕等级带冲突：骨鹫 10 到 16、黑商护卫 14 到 20、门框蜥 14 到 18、灰影 12 到 20、灰潮先锋 50 到 56；另有只在后幕落图、靠 V6 按地图推断幕次才过线的四种：北境驼鹿 10 到 14（第二幕首见，第二幕带 15 到 30）、门纹壁影 10 到 13、灰页群 12 到 14、灰页之卷 14（第三幕回访，第三幕带 30 到 45） | 推荐改图鉴（骨鹫 10 到 15、护卫 15 到 20 已按此入库；门框蜥与灰影改为第二幕首见 15 到 20；灰潮先锋改 55 到 58）；驼鹿与遗迹回访三种按"回访的低阶迷宫"给 V6 加例外，或按幕带重标 | 不阻塞 |
| 2 | 澱灵 11 到 13 与 A1-M07（8 到 10 级）的暗渠一战 | 推荐暗渠那一组按图定级 10 到 11（`SpawnDef.level`，需要把"按图定级"从只升扩到可降），或把 M07 的推荐等级改为 10 到 12 | 不阻塞 |
| 3 | 兽潮的"林中澱巢满巢"没有对应的澱巢记录；垄沟鼠后的巢在局部澱度 2，到不了满巢 | 推荐设计在铁杉林深处的魔物巢（`beast_nest`）定一个无巢主的澱巢，局部澱度 3；或把西田旧谷仓定为 3 | 不阻塞 |
