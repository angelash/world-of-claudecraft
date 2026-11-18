# PK-M1-15 同伴与队伍第一批：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-18 | 实施 1、QA 1 | 名册与随队位、并行经验与追赶、羁绊关与红线、六层行为树与九条指令、倒地与重伤退场、铁人单向开关、从契与半契兽伴、坐骑、临时同伴、希雅随家离开、澱染暴露、迷宫入口外等候；新起会话审查后修 23 条 | 未提交 | 见 `verification_matrix.md` 第 1、2 节 | 1. 主会话按下面的文件清单提交；2. 请求与遗留转出 |

## 2. 汇报

### 2026-11-18 实施 1、QA 1

**做法**

- 协调器 `src/systems/party/index.ts` 只接线；每块规则一个模块：名册 `roster.ts`、经验 `growth.ts`、羁绊 `bond.ts`、剧情（红线、离队、在场、个人线）`story.ts`、
  倒地与重伤 `wounds.ts`、铁人 `ironman.ts`、兽伴与从兽 `pets.ts`、临时同伴 `temps.ts`、澱染暴露 `exposure.ts`、坐骑 `mounts.ts`、命令 `commands.ts`、行为树 `ai.ts`、数值 `config.ts`。
- 不在场的成员不在世界里：实体移走，等级与经验记在成员上，澱病身体经澱病系统的新端口 `takeBody`、`putBody` 带走与放回；同一 tick 里出去又进来的成员下一 tick 再进（战斗在 tick 末删旧单位）。
- 条件一律是数据（`recruit.when`、`redLines[].when`、`leaves[].when` 与 `back.when`、`presence[].when`、`armor.when`、驯兽与从契的 `requires`），只经纯条件模块求值，不导入任务系统的效果解释器。
- 战斗只经导出端口与查询：`addUnit`、`gainXp`、`grantAbility`、`castAs`、`setAutoAttack`、`reviveUnit`、`applyAuraTo`、`setLevel`、`telegraphsOn`、`dropBags`、`difficultyMods`。
- 倒地的溢出伤害由每 tick 的生命快照（`hpSeen`）与本 tick 收到的命中（`combat.damage`）算出；战斗若在 `entity.died` 里带上溢出量，这里改读它（请求 1c）。
- 追赶倍数对击杀经验用补差：战斗按组队份额给同伴经验（`combat.xp`，原因 `kill:*`），本系统再给 (倍数 - 1) 倍（原因 `catchup`）。
- 兽潮之夜"与她并肩"落为在场记录：`a1_beast_tide_cleared` 成立的那一刻希雅（人或同伴实体）在玩家 20 格内，写 `a1_tide_with_shiya`。

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/party/types.ts` | 修改 | 同伴数据的新字段、队伍数值表、名册状态、成员与切片的新字段、事件与命令 |
| `src/systems/party/index.ts` | 改写 | 协调器：订阅与 tick 接线 |
| `src/systems/party/ai.ts` | 改写 | 六层行为树、姿态与指令、避险与点名、护盾击碎、留守与守包、临时同伴 |
| `src/systems/party/bond.ts` | 改写 | 羁绊关、日常上限、礼物与击杀数值（8.4） |
| `src/systems/party/view.ts` | 修改 | 姿态、指令、名册状态、羁绊关；`rosterView`、`beastsView`、`ironmanState`；`isInParty` 只算随队 |
| `src/systems/party/config.ts`、`roster.ts`、`growth.ts`、`story.ts`、`wounds.ts`、`ironman.ts`、`pets.ts`、`temps.ts`、`exposure.ts`、`mounts.ts`、`commands.ts` | 新增 | 见"做法" |
| `src/content/packs/party.ts` | 修改 | 新表 `partyConfig`、`pets`、`mounts`、同伴技能与坐骑物品；表单字段；校验 |
| `data/party/companions.json` | 修改 | 新字段；删除 `levelOffset`；罗恩 11 级、欧拉 27 级（U-11） |
| `data/party/config.json`、`pets.json`、`mounts.json`、`abilities.json` | 新增 | 队伍数值、可驯物种、驴、"鸦群" |
| `locales/zh-Hans/sys_party.json` | 修改 | 指令、名册状态、新拒绝原因 |
| `tests/party.test.ts` | 修改 | 加入等级与共享任务经验、礼物与击杀的新数值、倒地起身的新条件 |
| `tests/party_companions.test.ts`、`tests/party_save.test.ts` | 新增 | 第 17.5 节 M1 行与包行其余各项；存档往返与旧存档 |
| `docs/70_packets/pk_m1_15_companions/` | 新增 | 包目录三件 |
| `src/systems/ailments/slice.ts` | 修改（越界，端口） | 新增 `takeBody`、`putBody`：不在场的同伴的身体由同伴系统保管 |
| `tools/content/validators/namespace.ts` | 修改（越界，两行） | `pet_` 可用于表 `pets`，`mnt_` 可用于表 `mounts` |
| `docs/40_design/world_state_registry.md` | 修改（一行） | 新变量 `a1_tide_with_shiya`（第 8.3 节） |
| `data/registry/vars.json` | 修改（生成物） | 重建；工作区里同时带着并行包已改的注册表行，提交时在提交树上重跑 `node tools/registry/build.ts` |
| `src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 修改（生成物） | 重生成；同上，提交时在提交树上重跑 `node tools/i18n/gen_keys.ts` 与 `node tools/i18n/extract_content.ts` |
| `docs/40_design/progression_and_pacing.md` | 修改 | U-10：第 10.1 节重伤一行与第 19 节"重伤休养"取同伴文档的 2 日（1 到 4 日） |
| `docs/40_design/systems/companions_and_party.md` | 修改 | 7.6 倒地虚弱的光环编号；17.3 命令表补齐；新增 17.6 第一批的落地形状 |
| `docs/40_design/systems/thousand_doors.md` | 修改（一处） | 第 8 节第 3 行：从契的命令为 `party.pact`，"伸手"的候选查询为 `pactCandidates` |
| `docs/40_design/content/catalog_characters_lotha.md` | 修改（一格） | 第 2.5 节：欧拉与罗恩的数据等级已按人物表（U-11） |

**验收逐条结果**：见 `verification_matrix.md` 第 1 节。

**偏离与取舍**

| 依据 | 设计写法 | 实现 | 理由 | 是否回写 |
| --- | --- | --- | --- | --- |
| 千门第 8 节第 3 行 | 命令 `doors.pact` | `party.pact` | 读取方在同伴系统，命令归其处理器表 | 已回写 |
| 同伴 17.1 | `values.redLines`、`loss`、`trustFlags` | `redLines`、`leaves`（带 `back`）、沿用 `bondFlags` | 第一批只用到这些；17.6 记现行形状 | 已回写（17.6） |
| 同伴 2.1 | "兽潮之夜与她并肩" | 在场记录写 `a1_tide_with_shiya` | 没有现成变量；需用户决定第 2 条 | 注册表已加 |
| 同伴 7.4 | 夜羽"放鸦群" | 技能 `sk_yeyu_ravenswarm`（射程 10、冷却 30 秒、失明 3 秒） | 技能目录还没有这项技能；数值待登记 | 否（需用户决定第 3 条） |
| 同伴 11.2 | "用回门符撤走而同伴倒在原地" | 战斗未结束时玩家离开地图、或玩家倒下，倒地的同伴都转重伤 | 内核没有"回门符撤走"这一事件；需用户决定第 4 条 | 否 |
| 同伴 4.2 | 经验上限玩家 + 2 对一切经验 | 本系统给的经验（共享任务经验、追赶补差、离队份额）都封顶；战斗给的击杀份额暂不封顶 | 战斗归 PK-M1-12，请求 1a | 否 |
| 同伴 7.3 | "集火" | 作为目标偏好进职责层（第 5 层），不压过避险层 | 一直生效的集火会让同伴站在预警里 | 否 |
| 同伴 8.4 | 礼物"同一同伴每游戏周至多计 3 件" | 第 4 件照收但不加羁绊；送礼须同伴在场 | 界面是把物品拖到在场同伴的头像上 | 否 |
| 成长 9.1 | 门内庭院每日 -2 澱染 | 不在场的身体由同伴系统保管，期间不累积也不消退 | 庭院的消退待庭院与休养的后续包 | 否（遗留） |
| 同伴 3.6、千门 15.4 | 坐骑影响旅行 | 本包给出查询 `activeMount`、`rideDayKm`、`mountStops`；旅行尚未读取 | 旅行归内核 | 否（请求 3） |

**新起会话审查（覆盖性）的处理**

| 序 | 发现 | 级别 | 处理 |
| --- | --- | --- | --- |
| 1 | 同日离队又归队时澱染翻倍；过夜离队会抹掉澱病 | BLOCKING | 已修：澱病系统新端口 `takeBody`、`putBody`，身体整体带走与放回；归队时澱化超期立即结算 |
| 2 | 内容校验 V3、V4 报本包的表与变量 | BLOCKING | 已修：命名空间表登记 `pets`、`mounts`；`a1_tide_with_shiya` 的写入者含内容 |
| 3 | 同一 tick 出去又进来，战斗删掉新单位、等级丢失 | SHOULD-FIX | 已修：记 `outTick`，同 tick 归队延到下一 tick（`pendingIn`） |
| 4 | 休养、离队中跨过第三道红线不冷离；离队会解除冷离 | SHOULD-FIX | 已修：冷离记在成员上（`cold`），归队与休养结束都尊重它，和解才解除 |
| 5 | 入队前已成立的红线计入三次 | SHOULD-FIX | 已修：另记 `redSeen`，只数跨过的 |
| 6 | 泉畔与阵亡的成员仍触发红线 | SHOULD-FIX | 已修 |
| 7 | 个人线段重复报告重复加羁绊 | SHOULD-FIX | 已修：只在段号上升时加 |
| 8 | 战斗的击杀经验不受玩家 + 2 上限 | SHOULD-FIX | 请求 1a；文件头写明现状 |
| 9 | 集火压住避险；读条中不避险 | SHOULD-FIX | 已修 |
| 10 | 从契直接写 `door_fatigue` | SHOULD-FIX | 已修：改用千门的 `settleFatigue`、`setFatigue` |
| 11 | 暴露登记写澱病切片；凡人死亡由本系统结算 | SHOULD-FIX | 保留：`bodyOf` 是澱病系统导出的函数；凡人死亡按计划包行由本包处理，请求 2 由 NPC 系统接管 |
| 12 | 临时同伴借出的战斗单位不收回 | SHOULD-FIX | 已修：不再借单位，只驱动对方已有的单位 |
| 13 | 兽伴吃击杀经验、升级回满血 | SHOULD-FIX | 请求 1b |
| 14 | 坐骑与守包的查询无人读取 | SHOULD-FIX | 请求 3、1e |
| 15 | 旧存档的铁人在载入后失效 | SHOULD-FIX | 已修：切片没有记录时读变量 |
| 16 | 离队与冷离也拿一半经验 | SHOULD-FIX | 已修：只给候命与休养 |
| 17 | 自动玩家与客户端读名册的方式 | SHOULD-FIX | 请求 4、5 |
| 18 | 测试不够有力 | SHOULD-FIX | 已修：致命一击在战斗相位出手并用能区分快照的数；澱染往返、同 tick 归队、闸门含击杀、反应延迟逐帧、铁人拒开事件、休养中冷离、入队前红线、段号幂等、旧存档铁人 |
| 19 到 33 | 起身后的快照、羁绊浮点、站位的地图、守包状态、候命的镜像、记录的键、送礼、换人回滚、注释、跨图的战斗判定等 | NIT | 已修 19、20、22、23、24、25、28、29、30、33；21（每事件排序）、26、27 保留，31、32 转遗留 |

**越界改动与请求回写**

| 序 | 文件或系统 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- | --- |
| 1a | `src/systems/combat/rewards.ts` | 同伴的击杀经验在源头乘追赶倍数并封顶玩家 + 2（建议战斗登记一个经验规则端口，同伴系统注册；本包现以 `combat.xp` 补差） | 战斗 | 请求回写 |
| 1b | 同上 | 带 `pet` 标签的同伴不分击杀经验、不计入组队人数（半契兽伴的等级按公式） | 战斗 | 请求回写 |
| 1c | `src/systems/combat/death.ts` | 同伴的 `entity.died` 带上致命一击的溢出量 | 战斗 | 请求回写 |
| 1d | `data/combat/monsters.json` | 澱巨像的灰壳 `ash_shell` 改为 `breakBy: ability`、`breakRef: sk_yeyu_ravenswarm`（战斗 10.8"夜羽的鸦群扑面可击碎一次"）；同伴大脑已会用 | 战斗 | 请求回写 |
| 1e | 战斗的遗落包 | 将来 NPC 拾取遗落包时先查 `bagKeeper` | 战斗 | 请求回写 |
| 2 | `data/npc/personas.json`；NPC 系统 | 诺伊、苔丝的人设 `tags` 加 `door_mark`（免疫与澱巨像的追门都读它，现在两人都没有）；有名凡人的澱化死亡改由 NPC 系统消费 `ailments.crystal_due` | PK-M1-18 或人设数据 | 请求回写 |
| 3 | `src/systems/travel/` | 骑乘时按 `rideDayKm` 缩放、队伍取最慢者、`mountStops` 在澱度三止步 | 内核 | 请求回写 |
| 4 | `src/game/autoplay/` | 读 `isInParty` 或 `rosterView` 而不是遍历 `members`（候命、休养、兽伴与临时同伴现在也在 `members` 里）；迷宫人数超限时用 `party.wait` | PK-M1-10、PK-M1-42 | 请求回写 |
| 5 | `src/client/` | 名册、指令轮盘、铁人开关、兽伴；日志的 `party.joined` 用 `companionId` 取名（候命加入时没有实体） | PK-M1-22、PK-M1-57 | 请求回写 |
| 6 | 任务数据 | 个人线段结任务完成时发 `party.segment`（或任务效果写 `pl.<id>`）；买驴任务 A1-S30 与驿站货架 | PK-M1-33 | 请求回写 |
| 7 | `docs/40_design/content/catalog_abilities_talents.md` | 登记夜羽的标志技能"鸦群"与数值 | 技能目录 | 请求回写 |
| 8 | `src/systems/dungeons/` | 留守的同伴已不计入 `isInParty`；地图出口进迷宫也可按上限拦（U-17） | PK-M1-50 的后续 | 请求回写 |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 各幕锚点；雇佣与欠薪；任职与统兵互斥；休养随庭院扩建与医疗官员减日；归队后 7 日的最大生命 -15%；将领档案 | PK-M2-14 |
| 五道关与过关事件（含淬体破关调用 `temperBacklash`）；合法复活、渡魂、剧情之死、后日谈 | PK-M3-14 |
| 人格权重的战术细调、内置 AI 选姿态、闲聊与营地谈话、危急解围与探望的羁绊、轻伤"睡一夜并接受治疗" | PK-M1-21 |
| 兽伴喂食与兽舍、伴契深化与名伴、复活兽伴、从兽复澱；不在场身体在庭院的澱染消退 | 生灵与庭院的后续包（M2） |
| 随行同伴的羁绊关（个人线只有三段） | 随行同伴的数据包 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 第二次倒地与致命一击会让同伴休养 2 到 4 日 | 自动玩家的首领战少一名同伴 | 通关回归；节奏由 PK-M1-42 复查 |
| 罗恩 11 级、欧拉 27 级 | 第一幕前半的战斗变轻 | 夜羽、希雅、奈拉的等级见需用户决定第 1 条 |
| 有名 NPC 也做澱染日检 | `sed.daily` 的抽签多了，玩家的发病序列与过去不同 | `tests/ailments_pacing.test.ts` 的区间检查 |
