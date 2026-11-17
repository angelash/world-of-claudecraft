# PK-M1-35 序章与第一幕地图：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（遗留与请求见 `progress.md` 第 2 节；无 BLOCKING；两条长路线与全量测试由主会话在提交树上跑） |
| 末次代码或内容变更 | 未提交；文件清单见 `progress.md` 第 2 节 |
| 完整实跑 | 2026-11-18，未提交的工作区（多个包并行改动中） |
| 审查 | 新起会话的覆盖审查一次：2 条 BLOCKING、7 条 SHOULD-FIX、13 条低项；处理见第 3 节 |
| 遗留 | 魔物种类入库后的刷新组、两个剧情旗标的写入方、自动玩家看开关格、无人地图的魔物降频、存档迁移步骤、室内层与开关格的画法；见 `progress.md` |

## 1. 验收条目（地图简报第 15 节）

| 序 | 验收 | 命令或评审 | 结果（原样要点与量化数字） | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 图集一致：十九张图与 A5-2 已建，尺寸、区域、澱度、风格包与图集一致，每个出口都被路线引用 | `tests/map_launch.test.ts` 的 `builds each at its brief size` 与 `passes the atlas cross checks`；`tests/world_atlas.test.ts` 的 `the real atlas` | 二十张图的编号、状态与尺寸逐一钉住；`atlasProblems` 全量交叉校验零条；已建图清单 22 张（加瓦伦堡与旧水道） | 同左 | PASS |
| 2 | 动线度量：野外与迷宫首次接触不少于 8 米、安全点与警戒圈不少于 3 米、多幕常驻等级不超过本幕上限加 2；城镇与舞台无常驻魔物 | `tests/map_metrics.test.ts`；`tests/map_launch.test.ts` 的苏醒点用例 | 九张野外与迷宫图首次接触 8.8 到 21.4 米、安全点 3.8 到 16.2 米（逐图数字见 `progress.md`"动线度量"）；苏醒点 9.2 米，每个警戒圈离苏醒点都在 8 米以上；封门遗迹、深处、林缘、荒原外缘四条豁免全部删去，只剩旧水道（第二幕） | 同左 | PASS |
| 3 | 外观层：`lookProblems` 零问题；装饰件数在上限内；室外图每个出口 4 格内有提示 | `tests/look_layer.test.ts` | 全部已建图零问题；边石镇 70（上限 70）、其他室外图至多 60、室内图至多 12；坠落布景按简报零装饰；每个室外出口 4 格内有路灯、火盆、矿灯、路牌或旗帜 | 同左 | PASS |
| 4 | 内容引用：魔物、地点、迷宫、旗标都存在；按图定级写了 `level` | `node tools/content/validate.ts` | V1 到 V10 全部 `ok`（V4 0 错误 332 警告、V5 9 警告、V6 9 警告、V7 3 警告、V9 9 警告）；按图定级：镇北的游荡骸骨 6 到 8、铁杉林深处的澱野猪 6 到 8 与澱狼 8 到 12 | 命令输出 | PASS |
| 5 | 发现点：图、标、望、秘都登记，第一幕合计与旅行与探索第 6.3 节一致 | `tests/map_launch.test.ts` 的 `discovery points` | 第一幕：图 10、标 29、望 3、秘 7（与第 6.3 节表一致）；首开在第二幕的标 4、望 2、秘 1，第三幕的秘 1；神域、私人与舞台图没有发现点 | 同左 | PASS |
| 6 | 美术：本图增量素材在提示词库有条目 | 未评审 | 提示词库归素材批次（第三方目录），本包没有核对；覆盖审查指出简报里几处素材编号与提示词库的名字对不上 | 无 | VERIFY |
| 7 | 扩建的做法（第 1.11 节）：先平移、ID 不变、到达点离出口 2 到 3 格、存档迁移数据 | `tests/map_launch.test.ts` 的 `reachable on foot`、`the extended maps keep their old ground` | 八张扩建图的平移量与锚点钉住；冻结存档七份（序章到第六幕）里站在扩建图上的实体按平移表换算后全部落在可走格上（300 个以上）；有来有回的出口对应的到达点离回程出口不超过 3.5 米 | 同左；`data/world/map_shifts.json` | PASS |
| 8 | 开关格与旗标（第 1.10 节、第 12 节第 2 条） | `tests/map_launch.test.ts` 的 `switch tiles` | 门厅落石：首访从苏醒点走不到正门与外庭，巢井井口能走出正门，见过阿什或清开落石后大厅通正门；塌方口：一夜矿道开始前走不到旧矿阶，开始或完成后能走到；空心石裂缝第三幕前封着；巢井与通风竖井的出口要首领旗标 | 同左 | PASS |
| 9 | 局部澱度（第 1.2 节与各图简报） | `tests/map_launch.test.ts` 的 `local sediment hot spots` | 十处热点逐一钉住；北泉 2、广场 1、苏醒点 2、回廊 3、线北 2、线南 1 | 同左 | PASS |
| 10 | 地球四景的门位（P2） | `tests/map_launch.test.ts` 的 `the earth stages carry the door` | 四景各一个 `stage_door`、`door_corner:0` 到 `3` 各一处、起点到门的距离与简报相差不到 1.5 米（3、8、4、5 米） | 同左 | PASS |
| 11 | 第一幕迷宫的层 | `tests/map_launch.test.ts` 的 `the act 1 dungeons`；`tests/dungeons.test.ts` | 封门遗迹入口在残阶坡下；旧矿上层是主巷矩形、下层是整张旧矿且首领为晶背之母；地窖矩形属 `dg_moon_cellar`，楼梯在醉月亭里，步行走不进地窖 | 同左 | PASS |
| 12 | 迷宫与地图测试合计 | `npx vitest run --config vitest.config.ts tests/map_launch.test.ts tests/map_metrics.test.ts tests/world_atlas.test.ts tests/look_layer.test.ts` | `Tests 143 passed (143)` | 命令输出 | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 两个工程零错误（末次运行） | PASS |
| 内容校验 | `node tools/content/validate.ts` | 是 | 全部 `ok`（见第 1 节第 4 条） | PASS |
| 注册表 | `node tools/registry/build.ts --check` | 是 | `vars.json is current (724 names, 128 families, 38 quest ids, 4 skipped rows)`；同一命令跑的 `tests/registry.test.ts` 里一日全系统世界的用例在并行负载下超时（见第 4 节） | PASS（基线除外） |
| 文本检查 | `node tools/i18n/check.ts` | 是 | 见第 5 节末次结果 | 见第 5 节 |
| 受影响的套件 | 坐标按平移换算过的测试文件（`progress.md` 越界表） | 是 | `city`、`city_autonomy_bonus` 21 条；`quest_model` 36 条；`npc` 24 条；`doors`、`doors_costs`、`doors_hints`、`combat`、`combat_rules`、`party`、`progression`、`dungeons`、`ailments_sediment_reads` 185 条；`ailments`、`ailments_pacing` 53 条；`act_clock`、`cognition`、`dialogue`、`director`、`goddess` 75 条；`client_hd2d` 42 条；全部通过 | PASS |
| 每 tick 开销 | 全系统世界跑六个游戏小时，去掉新五张图的刷新点对照 | 是 | 去掉：3,095、3,305 毫秒；全部：3,557、4,224 毫秒（121 对 216 个实体）；见 README 第 11 节第 3 条 | 记录 |
| 禁用字符 | 扫描本包新增与改动的数据、测试与本目录 | 是 | 无 U+2013、U+2014、U+2015、emoji、U+2600 到 U+27BF | PASS |
| 改动文件格式 | `npm run format -- <本包的 JSON 与 TS>` | 是 | 每次改动后格式化 | PASS |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 新起会话的覆盖审查（对照简报第 15 节） | 一次贡献结束 | FAIL 后修复 | 2 | 7 | 已修：门厅落石与塌方口的旗标没有写入方（开关格条件加上见过阿什与一夜矿道的任务状态，旧矿阶出口与路线要任务旗标，测试钉住；门厅先试过以巨鸦倒下为条件，三条无模型路线在第一幕开头停住，见第 5 节）；自动玩家走向关着的开关格（同上让关着的窗口只剩"玩家本就在里面"的一段，换图寻路看开关格转为请求）；苏醒点隔墙被澱渣盯上（两组移进两翼回廊，测试加苏醒点用例）；旧哨村干井与村祠换成土路后能盖房（两格回到岩石，等城建的摆放规则一起改）；验证矩阵缺失（本文）；仍写旧坐标的测试（五个文件按平移换算，PK-M1-18 正在改的两个文件列出未动）；旧矿下层的澱鼠与掘穴虫替身（删去）；三处到达点离出口超过 3 格（挪近，测试钉住）。低项：林缘第 12 节第 4 条的位置差、两个出口改名、钟楼墙高、魔物巢距离、旧哨村的城镇距离写进偏差表；营地种类改为不可睡的种类、冬营旁的澱野猪移到线北；旧矿的装饰上限回到室内 12；荒原掘手营地补火盆；`data/README.md` 补新文件。转请求：素材编号核对、生成物里带着他包的改动（提交时注意） | 本会话 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npm test` | `tests/art_manifest.test.ts` | 已知基线 | 素材 |
| `npm test` | `tests/architecture.test.ts` 的 `content/ has no DOM access`：`src/content/packs/combat_boss_checks.ts` | 文件属首领机制包 | PK-M1-12 |
| `npm test` | `tests/own_ability_ids.test.ts` 的技能编号表、`tests/content_id_guard.test.ts` 的 `prologue`、`tests/client_story.test.ts`、`tests/client_player_input.test.ts` 的序章未走完、`tests/content_validation.test.ts` 的 V5 一条 | 失败在技能、序章场景与揭示台账数据，不在地图 | PK-M1-12、PK-M1-27 |
| `npm test` 全量并行 | `tests/registry.test.ts` 一日全系统世界、`tests/disputes.test.ts` 二十种子、`tests/time_skip.test.ts` 的同档复现、`tests/content_validation.test.ts` 的 V10 扫描：30 秒超时 | 单独运行通过（一日世界 24.1 秒、同档复现 19.6 秒）；新地图增加了每 tick 的实体（第 2 节），并行负载下更容易越过 30 秒 | 本包的内容量加上机器负载；内核降频是正解（请求） |

## 5. 末次实跑

| 命令 | 结果 | 状态 |
| --- | --- | --- |
| `node tools/content/validate.ts` | `all validators green`（V1 到 V10 全部 `ok`） | PASS |
| `npx vitest run --config vitest.config.ts tests/map_launch.test.ts tests/map_metrics.test.ts tests/world_atlas.test.ts tests/look_layer.test.ts` | `Tests 143 passed (143)` | PASS |
| `npm run typecheck` | 零错误 | PASS |
| `node tools/registry/build.ts --check` | `vars.json is current (724 names, 128 families, 38 quest ids, 4 skipped rows)`；`Tests 37 passed (37)` | PASS |
| `node tools/i18n/check.ts` | `0 finding(s)`，2327 处键的使用（先跑 `extract_content.ts` 与 `gen_keys.ts`：6669 键、60 张表；2911 键） | PASS |
| `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | `Tests 11 passed (11)` | PASS |
| `npx vitest run --config vitest.playthrough.config.ts tests/playthrough/act1_minimal.playthrough.test.ts` | 门厅改为见过阿什即通之后：`Tests 1 passed (1)`，641 秒 | PASS |
| 同上，门厅以巨鸦倒下为条件时的三条路线 | `release`、`rule_merca`、`act1_minimal` 都在第一幕开头停住：`stuck: no progress for 230400 ticks while: q_a1_m02_raven: 击败守护巨鸦 (not ready): travel to borderstone_north to grind Lv7`（自动玩家要出遗迹练级，换图寻路不看开关格）；据此改了门厅条件 | 已修 |
| `release` 与 `rule_merca` 全程 | 机器负载下一条路线要一小时以上，本会话没有跑完；主会话在隔离工作树上按提交树跑 | VERIFY（主会话） |
| `npm test` 全量 | 第一次全量（改坐标之前）`Tests 66 failed, 3242 passed, 11 skipped`；失败按文件逐一处理或归入第 4 节，受影响的文件单独重跑全部通过（第 2 节）；末次全量由主会话在隔离工作树上跑 | VERIFY（主会话） |
