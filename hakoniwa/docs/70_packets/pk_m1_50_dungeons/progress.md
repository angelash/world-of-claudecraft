# PK-M1-50 迷宫运行时：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施 1 与 QA 1 | 迷宫系统（实例、进出与层、队伍上限、活性与溢出、遗落物端口、养毁净、澱巢）、内容包与数据、注册表行、两组单测；新起会话审查一次后按审查修改 | 未提交 | 见 `verification_matrix.md`：两组单测 59 条通过；内容校验全绿；文本检查 0 条；注册表 current | 主会话提交；PK-M1-11、PK-M1-13 接遗落包端口，PK-M1-30、PK-M1-35 导入第一幕迷宫与澱巢 |

## 2. 汇报

### 2026-11-17 实施 1 与 QA 1

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/dungeons/index.ts` | 新增 | 系统（相位 15）；命令 `dungeons.enter`、`dungeons.leave`、`dungeons.dispose`、`dungeons.clear`、`dungeons.shift`、`dungeons.patrol`、`dungeons.break_ritual`；订阅 `flag.changed`、`world.hour`、`world.map_changed`、`entity.died`；跳跃处理器 |
| `src/systems/dungeons/types.ts` | 新增 | 记录与切片的形状、封闭集合（形态、澱源、处置、阶段） |
| `src/systems/dungeons/slice.ts` | 新增 | 切片版本 1、首次使用时创建、升级、存档校验、`idFields` |
| `src/systems/dungeons/layout.ts` | 新增 | 形态与形态带、队伍上限、层的索引与 `floorAt`、入口层 |
| `src/systems/dungeons/state.ts` | 新增 | 实例与澱巢状态、镜像、活性、溢出、守核首领、清剿、养的成长 |
| `src/systems/dungeons/run.ts` | 新增 | 探访的开始、换层、结束；进入与离开；站在某处的判定 |
| `src/systems/dungeons/dispose.ts` | 新增 | 养、毁、净的拒绝原因、开始、完成、仪式打断、任务写入的抉择 |
| `src/systems/dungeons/nests.ts` | 新增 | 澱巢出现、成长、头领与巢主倒下 |
| `src/systems/dungeons/sediment.ts` | 新增 | 澱巢对所在地块澱度的增减、`localSediment` |
| `src/systems/dungeons/left_items.ts` | 新增 | 遗落包端口、到期吞掉、塌缩时全部吞掉、`swallowTick` |
| `src/systems/dungeons/settle.ts` | 新增 | 每小时与每个跳跃步的结算 |
| `src/systems/dungeons/view.ts` | 新增 | `fieldView`（场地状态条）、`dungeonsView`（迷宫窗口） |
| `src/content/packs/dungeons.ts` | 新增 | 内容表 `dungeonConfig`、`dungeons`、`nests` 与校验器 |
| `data/dungeons/config.json`、`dungeons.json`、`nests.json` | 新增 | 形态与上限、活性数值、遗落物与塌缩日数、澱巢的季与阶；`dg_seal_ruins`；澱巢暂无记录 |
| `locales/zh-Hans/sys_dungeons.json` | 新增 | 拒绝原因、成功说明、形态与状态名 |
| `tests/dungeons.test.ts`、`tests/dungeon_nests.test.ts`、`tests/dungeons_harness.ts` | 新增 | 44 条与 15 条单测，及其测试台（夹具地图、按目录写法的夹具迷宫与澱巢、代替死亡、队伍与遗落包的探针） |
| `src/content/entity_kinds.ts` | 修改（越界） | 实体种类加 `dungeons`、`nests`，让内容 ID 守卫与 V3 盯住它们（两行） |
| `src/content/references.ts` | 修改（越界） | 引用行：`dungeons` 的 `act`、`coreBoss`、`entry.mapId`、`floors[].boss`、`floors[].mapId`、`gate.mapId`、`overflowTo`；`nests` 的 `act`、`becomes`、`head`、`lord`、`mapId` |
| `tools/content/validators/namespace.ts` | 修改（越界） | `dg_` 可进 `dungeons`；新增 `nest_` 归 `nests`；两表从头带前缀；迷宫与它自己的子场景地图共用编号 |
| `tools/registry/parse.ts` | 修改（越界） | 写入者系统名单加 `dungeons`；别名 `迷宫系统` 指向 `dungeons`（原指 `world`） |
| `docs/40_design/world_state_registry.md` | 修改（越界） | 第 8.6 节 `dg.<迷宫>.<字段>` 行：补 `stage`、`collapsed`，写清 `cleared`、`depth`、`active` 的含义；写入者为迷宫系统，任务抉择的效果可写 `choice` |
| `tests/world_mechanics.test.ts` | 修改（越界） | 钉住的 V3 报错文字随 `dg_` 的表名单多出 `dungeons`（一行） |
| `data/registry/vars.json`、`src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 生成 | `node tools/registry/build.ts`、`node tools/i18n/gen_keys.ts`、`node tools/i18n/extract_content.ts` |
| `docs/70_packets/pk_m1_50_dungeons/` | 新增 | 本目录三件 |

**数值（按实现）**

| 量 | 实现 | 出处 |
| --- | --- | --- |
| 形态 | 核压 30 起澱巢、100 起浅迷宫、300 起迷宫、800 起大迷宫；低于 30 仍记澱巢 | 目录第 1.1 节 |
| 队伍上限（同伴数，不含玩家） | 澱巢 1、浅迷宫 2、迷宫 4、大迷宫 9；记录可自带（挑战梯写 0，封门遗迹写 2）；没写时按当前核压的形态 | 目录第 1.4 节、第 2 节名册的"队伍"列 |
| 活性 | 有页者死在里面 +3；守核首领倒下 -60 并清溢出钟；养而一周无人清剿 +10；净化仪式开始 +30；60 起活性期；到 100 或溢出钟归零即溢出，回落到 40 | 目录第 1.1、1.2、1.3 节 |
| 养的成长 | 核压每季 ×1.05（取整） | 目录第 1.2 节 |
| 遗落物 | 在站着的迷宫里放满 7 个游戏日被吞；按小时判定 | 目录第 1.1 节 |
| 塌缩 | 毁后 3 到 7 日（命名流 `dungeons.collapse` 抽日数），记录可写定（地窖"一夜"写 1 日） | 目录第 1.2 节；图鉴第 2.8 节"数日内" |
| 澱巢 | 每 91 日未清长一阶；要澱度二以上，进满巢（第三阶）要澱度三以上；满巢起所在地块 +1；第四阶转为浅迷宫；毁后地块 +1 维持 91 日；净化后地块 -1 不再变 | 图鉴第 2.8 节 |

**与设计文档不一致或文档未写而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 迷宫目录第 1.1 节与千门第 6.3 节、战斗第 15.1 节 | 迷宫目录：遗落物在迷宫里放 7 日后被吞（并称与框架第 12 节同一时钟）；千门与战斗：遗落包保留 3 日，迷宫里同样 | 运行时按 7 日实现，经端口吞掉；端口由遗落包的主人注册，未注册时什么也不吞；`swallowTick` 给出迷宫会吞掉它的时刻，供战斗在迷宫里延长遗落包 | 计划包行写 7 日；遗落包归战斗与物品 | 是（README 第 11 节第 1 条） |
| 迷宫目录第 1.4 节 | 各形态的"满编"，人数不足时用 `partySync` 向下同步 | 当作人数上限：进入命令超员拒绝；从地图出口走进来的不拦，探访记为超员并在 `dungeon.entered` 里带出 | 计划包行写"队伍人数上限"；队伍还不能把同伴留在入口外，地图出口归世界系统 | 是（README 第 11 节第 2 条） |
| 计划包行"塌陷开关" | 未展开 | 毁后塌缩完成时写 `dg.<id>.collapsed`；地图开关格写 `openWhen: NOT dg.<id>.collapsed` 即在塌缩后关闭，刷新点可写 `!dg.<id>.collapsed` | PK-M1-16 的开关格与刷新点只读旗标 | 否 |
| 图鉴第 2.8 节"地块澱度加一" | 地块 | 地块即澱巢所在的整张图；毁的"邻近地块"先落在本图，邻图的账归地区澱 | 图集里地块是地图一级；邻接要读区域图与地区账 | 否 |
| 图鉴第 2.8 节 | 毁与净在击杀巢主之后 | 养、毁、净都要巢主（第一阶为头领）倒下之后；迷宫的毁要守核首领倒下，养与净不要 | 第一幕支线 A1-S25 也是先打倒巢主再三选一 | 否 |
| 图鉴第 2.8 节 | 头领与巢主 | 第一阶头领在巢前倒下、第二阶起巢主在巢前倒下才算清巢；"巢前"为地点矩形外扩 6 格 | 头领常是普通魔物（澱鼠），在图上别处打死不能算清巢 | 否 |
| 图鉴第 2.8 节 | 养：每季清理一次，巢停在第二阶 | 选养时满巢退回第二阶；之后每一季内清一次即不长，整季没人清照样长 | 停在第二阶靠的是定期清理 | 否 |
| 迷宫目录第 1.2 节 | 净须守住仪式，魔物会来打断 | 仪式按记录写的日数进行（净必须写日数），期间迷宫活性 +30；内核或剧情可用 `dungeons.break_ritual` 打断，处置退回原样 | 防守事件归动态事件与战斗 | 否 |
| 迷宫目录第 1.1、1.3 节 | 溢出：未写持续多久 | `dg.<id>.phase` 在溢出后一个游戏日内为 `overflow`，之后回到形态 | 注册表的枚举里有 `overflow` | 否 |
| 迷宫目录第 1.1 节 | 有页的生灵死在迷宫里 +3 | 实体种类 `npc` 与族群为 `humanoid` 的魔物算有页；同伴不算（迷宫内同伴只是倒地）；玩家不算（无页） | 图鉴第 2.9 节"人形敌人：有页的人" | 否 |
| 注册表第 8.6 节 | `dg.<迷宫>.<字段>` 只由迷宫系统写 | 任务抉择的效果可以直接写 `choice`（任务目录 A1-S17、A1-S25 的产出就是这个旗标），内核随即结算后果；主人拒绝的抉择退回并发 `dungeon.choice_refused` | 抉择菜单在任务里，后果由内核结算 | 否 |
| 注册表第 8.6 节 | `phase` 枚举无"塌了" | 塌了的迷宫 `phase` 停在原形态，读 `collapsed` 判断 | 不改注册表的枚举 | 否 |
| 开发计划第 6 节波 2 | 新目录 `dungeon/` | 目录名 `dungeons/`（与系统编号一致） | 立项说明指定 | 否（请主会话改计划的写法） |
| `dg_seal_ruins` | 目录没给核压数值 | 取迷宫形态带的下限 300；不设处置（核即封印，回访的养与净渗是第三幕内容） | 不编数 | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `src/content/entity_kinds.ts` | 实体种类 `dungeon`、`nest` | 内核 | 已改，两行 |
| `src/content/references.ts` | 两张新表的引用行 | 内核 | 已改 |
| `tools/content/validators/namespace.ts` | `dg_`、`nest_` 的表与严格前缀；迷宫与它的子场景地图共用编号 | 内核 | 已改 |
| `tools/registry/parse.ts` | 写入者 `dungeons`；`迷宫系统` 别名改指 `dungeons`（同一别名的另外四个旗标 `a2_emil_fled`、`a2_hall_children_freed`、`a2_rotunda_reached`、`a4_mute_bell_fate` 的写入者随之由 `world` 变为 `dungeons`，它们本是迷宫里的剧情旗标，运行时并不写） | 内核（PK-M0-27 的工具） | 已改，两行 |
| `docs/40_design/world_state_registry.md` 第 8.6 节 | `dg.` 族的字段与写入者 | 文档 | 已改，一行 |
| `tests/world_mechanics.test.ts` | 钉住的 V3 报错文字 | PK-M1-16 | 已改，一行 |
| `docs/50_tech/architecture.md` 第 4.6 节 | 相位表加一行：15 dungeons，迷宫实例、进出与层、活性与溢出、养毁净、澱巢 | 内核 | 请求 |
| `docs/60_production/development_plan.md` | `PK-M1-50` 的状态；第 6 节波 2 的目录名 `dungeon/` 改为 `dungeons/` | 主会话 | 请求 |
| `docs/60_production/project_state.md` 第 4 节 | 本包一行 | 主会话 | 请求 |
| `docs/40_design/content/catalog_dungeons_bosses.md` 第 1.1 节 | 遗落物 7 日与千门的 3 日冲突，按用户决定走正典变更流程改一方 | 文档 | 请求（待用户决定） |
| 决策日志 | 遗落物时长、人数上限的含义 | 主会话 | 请求（待用户决定） |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 注册遗落包端口（`registerLeftItemPort`）：`items` 列出地图上的遗落包（`since` 由 `expires` 减保留日数得出），`swallow` 拿走一个；按用户决定在迷宫里把遗落包留到 `swallowTick` | PK-M1-11、PK-M1-13 |
| 把同伴留在入口外（队伍的"留守"状态），之后进入命令按"带谁进去"放行；地图出口进迷宫时按上限拦 | PK-M1-15 |
| 读 `localSediment` 代替 `sedimentAt`，让满巢、毁、净对澱染暴露、目击、画面与声音生效（或由内核在世界系统加一个可登记的澱度层） | PK-M1-51、认知、客户端 |
| 活性期：等级 +2、按澱源抽词缀 `afx_`、首领活性词条、深相掉落；收晶 -15 经 `dungeons.shift`；澱巢的出生率加倍、第二阶每 7 日袭扰、第三阶巢主强化与小潮；按 `dg.<巢>.stage` 与 `collapsed` 控制巢主与巢内刷新 | PK-M1-12 与战斗内容 |
| 地区澱的账：毁（地区升一档一季，之后每季回落三成）、净（核压三成从地区账上扣除）、养（周边每季 -10%）；地区一周升一档时活性 +20 | 女神与地区澱的后续包 |
| 养产表（每周澱晶与部件）、清剿强度（驻军与公会分部经 `dungeons.patrol`）、城市燃晶余澱每月 +2 到 +10、养巢周边不能住人 | 城建与经济的后续包 |
| `dungeon.overflow` 与满巢转魔物潮（`mtide_`），向 `overflowTo` 的聚落 | PK-M1-52、动态事件 |
| 第一幕迷宫与澱巢记录（`dg_old_mine`、`dg_moon_cellar`、`nest_furrow_rat_queen` 等，含养毁净的效果、塌缩日数、仪式条件）；封门遗迹回访的处置 | PK-M1-30 |
| 迷宫子场景地图与地窖层；塌陷开关格 `openWhen: NOT dg.<id>.collapsed`；巢里刷新点 `!dg.<巢>.collapsed` | PK-M1-35 |
| 场地状态条与迷宫窗口（`fieldView`、`dungeonsView`、命令 `dungeons.dispose`）；`tut_a1_dungeon` 接 `dungeon.entered`；形态名在 `term.dian_known` 之前用凡人说法；`dungeon.*` 事件的消息格式；澱巢的状态条 | PK-M1-22、PK-M1-23 |
| A1-S17、A1-S25 的抉择阶段写 `dg.<id>.choice`；读到主人拒绝的事件时给出玛莎的"账记上"；`ev_` 条件里塌了的迷宫用 `collapsed` 排除 | PK-M1-33 |
| 城下迷宫的生成实例 `dg_under:<聚落>`（实例键里的冒号不合注册表名字规则，需另定写法） | 第三幕起的迷宫包 |
| 注册表 `dg.` 族按字段区分写入者（内容只该写 `choice`） | 注册表工具的后续批次 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 端口未接时遗落物永不被吞 | 迷宫里的遗落包按战斗的 3 日消失 | 用户决定后由 PK-M1-11、PK-M1-13 接线 |
| 地图出口不拦超员 | 第一幕带三名同伴走进封门遗迹不受上限约束 | 队伍能留守同伴后改为拦 |

**需用户决定**

| 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- |
| 遗落包在迷宫里留多久 | 推荐迷宫里留到第 7 日被吞，见 README 第 11 节第 1 条 | 不阻塞本包 |
| 地图出口进迷宫时按人数上限拦不拦 | 推荐队伍能留守同伴后就拦，见 README 第 11 节第 2 条 | 不阻塞 |

**下一步与恢复方式**

1. 主会话按上面的文件清单提交；生成物随同提交。
2. 计划第 4 节 `PK-M1-50` 的状态建议改为"已完成"（验收见 `verification_matrix.md`），并把请求回写的几处交给各自的负责方。
