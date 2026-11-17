# PK-M1-50 迷宫运行时：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（遗留见 `progress.md`，无 BLOCKING） |
| 末次代码或内容变更 | 未提交；文件清单见 `progress.md` 第 2 节 |
| 完整实跑 | 2026-11-17，未提交的工作区（多个包并行改动中） |
| 审查 | 新起会话的覆盖面审查一次：2 条 BLOCKING、10 条 SHOULD-FIX、若干低项与测试缺口；已修与转遗留见第 3 节 |
| 遗留 | PK-M1-11、PK-M1-13、PK-M1-15、PK-M1-51、PK-M1-12、PK-M1-30、PK-M1-35、PK-M1-52、PK-M1-22、PK-M1-23、PK-M1-33 与女神、城建的后续包，及 `progress.md` 列出的请求回写 |

## 1. 验收条目

| 序 | 验收 | 命令或评审 | 结果（原样要点与量化数字） | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 进出单测 | `npx vitest run --config vitest.config.ts tests/dungeons.test.ts` 的 `entry, floors and exit` 与 `the party cap` | 从地图出口走进来开始探访（`via: walk`）；进入命令只在入口生效、不能重复、未知迷宫拒绝；模型来源一律拒绝；离开命令只在入口层（剧情任意层）；走出去、塌缩、净化都结束探访；镇子地图上的地窖矩形按位置进出；超员时进入命令拒绝并带上限与人数，剧情可带人进去，走进来记为超员 | `tests/dungeons.test.ts` | PASS |
| 2 | 层切换单测 | 同上 `switches floors by map and by area, keeping the deepest depth`；`tests/dungeons.test.ts` 的 `the shipped data` | 换图与进矩形都换层，`dg.<id>.depth` 记最深一层（0、1、2，回到浅层不降）；封门遗迹三层落在已建地图上 | 同上 | PASS |
| 3 | 遗落物单测 | `tests/dungeons.test.ts` 的 `left items: swallowed after seven days in a dungeon` | 放满 7 日被吞（差 2 小时时还在），镇上的不吞；跳跃 6 日不吞、7 日吞；塌缩当时吞掉里面的（1 日塌缩，7 日钟远未到）；净址不吞；没有端口什么也不吞；`swallowTick` 为放下时刻加 7 日 | 同上 | PASS |
| 4 | 巢生命周期单测 | `npx vitest run --config vitest.config.ts tests/dungeon_nests.test.ts` | 无条件的巢开局即在、有条件的巢条件成立才出现；91 日未清长一阶，满巢地块 +1；第一阶头领、第二阶起巢主在巢前倒下才清巢（图上别处与阶不对的都不算）；澱度二的巢进不了满巢；澱度三时长到第四阶转为浅迷宫，迷宫随即可进；养退回第二阶且按季清理就不长；毁后塌陷开关关闭开关格、地块 +1 维持 91 日；净化后地块 -1 不再变；跳跃与逐 tick 的巢状态逐字段相同 | `tests/dungeon_nests.test.ts` | PASS |
| 5 | 存档往返 | `tests/dungeons.test.ts` 的 `the slice in saves` | 探访中与塌缩中存档：经存档编解码后校验无错、世界哈希相同、切片相同；两边各跑 9 日后哈希仍相同；旧存档无切片可读并在首次使用时建立；旧存档里任务已写的抉择照样结算；被删去的迷宫的探访丢弃；新版切片与损坏的切片被拒；`idFields` 的路径与种类钉住 | 同上 | PASS |
| 6 | 养毁净与活性 | `tests/dungeons.test.ts` 的 `activity and the overflow clock`、`nurture, destroy, purify`、`owners, rituals and sweeps` | 有页者死亡 +3（同伴、玩家、野兽不算）；60 进活性期，溢出钟 2 日后溢出、回落 40，`phase` 一日后回到形态；到顶即溢出；守核首领倒下清首通、-60、停钟；毁要守核首领倒下、3 到 7 日塌缩（同种子同日、不同种子有分散）、塌时人被送到入口；净要条件与站在里面、仪式 3 日、活性 +30、完成后为净址；主人拒绝养（命令与任务写入都退回）；仪式可打断并退回原处置；养每季核压 +5%、每周无人清剿 +10，清剿重新计周；剧情调核压时形态与人数上限跟着变 | 同上 | PASS |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | 两个工程零错误（末次运行）；中途一次的错误在 `src/systems/scenes/runner.ts`、`tests/client_story.test.ts`、`tests/npc_alive_harness.ts`，见第 4 节 | PASS |
| 本包单测 | `npx vitest run --config vitest.config.ts tests/dungeons.test.ts tests/dungeon_nests.test.ts` | 是 | `Tests 44 passed (44)`、`Tests 15 passed (15)`，共 59 条 | PASS |
| 受影响的套件 | `npx vitest run --config vitest.config.ts tests/dungeons.test.ts tests/dungeon_nests.test.ts tests/world_mechanics.test.ts` 与 `tests/time_skip.test.ts`、`tests/replay_segments.test.ts`、`tests/save_recovery.test.ts`、`tests/architecture.test.ts`、`tests/content_id_guard.test.ts`、`tests/i18n_kernel_guard.test.ts` | 是 | 前三者 `Tests 87 passed (87)`；`time_skip` 单独跑 `Tests 27 passed (27)`；`replay_segments`、`save_recovery`、`world_mechanics` 一起 `Tests 55 passed (55)`；三个守卫通过 | PASS |
| 全量单测 | `npm test` | 是 | `Test Files 6 failed, 151 passed (157)`；`Tests 8 failed, 3172 passed, 2 skipped (3182)`；失败全部不属本包，见第 4 节 | PASS（基线除外） |
| 内容校验 | `node tools/content/validate.ts` | 是 | V1 到 V10 全部 `ok`（V4 0 错误 332 警告、V5 9 警告、V6 9 警告、V7 3 警告、V9 9 警告）；`--warnings` 下没有一条涉及 `dungeons`、`nests`、`dg.` | PASS |
| 注册表 | `node tools/registry/build.ts --check` | 是 | `vars.json is current (724 names, 127 families, 38 quest ids, 4 skipped rows)`；`dg.<dungeon>.<field>` 的写入者为 `content`、`dungeons` | PASS |
| 文本检查 | `node tools/i18n/check.ts` | 是 | `0 finding(s)`，2293 处键的使用 | PASS |
| 生成物新鲜度 | `node tools/i18n/gen_keys.ts --check`、`node tools/i18n/extract_content.ts --check` | 是 | 两者 current（2864 键；6082 键、57 张表） | PASS |
| 改动文件格式 | `npm run format -- <本包的 TS 与 JSON>`，之后 `biome check` 同一组文件 | 是 | 25 个文件无错误与告警 | PASS |
| 禁用字符 | 扫描本包新增的代码、数据、文本与本目录 | 是 | 无 U+2013、U+2014、U+2015、emoji、U+2600 到 U+27BF | PASS |
| 每 tick 开销 | 全系统世界在 `forest_edge` 与 `seal_ruins_depths` 各跑 12,000 tick，有无本系统对照 | 是 | 有：8,764、8,103 与 6,168、6,811 毫秒；无：8,329、8,330 与 6,485、6,713 毫秒；差在噪声内 | PASS |
| 无模型通关 | `npm run playthrough` | 否（多包并行中，由主会话统一跑） | | N/A |
| 全量本地门 | `npm run gate` | 否（同上） | | N/A |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 新起会话的覆盖面审查 | 一次贡献结束 | FAIL 后修复 | 2 | 10 | 已修：`tests/world_mechanics.test.ts` 钉住的 V3 报错文字；头领在图上任何地方、任何阶倒下都清巢（改为第一阶头领、第二阶起巢主，且在巢前）；任务写入的抉择不看主人（主人拒绝时退回并发 `dungeon.choice_refused`）；净可零日完成并在同一 tick 溢出（净必须写日数，缺省一日）；仪式不能打断（加 `dungeons.break_ritual`）；"塌缩吞掉里面的"与"净址不吞"没有决定性的测试（补两条）；养而一周无人清剿 +10（加清剿 `dungeons.patrol`）；层索引只按迷宫表缓存（改为迷宫表与地图表两级）；未成形的迷宫写了镜像、杠杆可用（不写，杠杆拒绝）；人数上限只看记录的形态（改看当前核压）；旧存档首次结算覆盖任务写下的抉择（改为照样结算）；被删迷宫的探访使存档读不进（改为丢弃）；塌缩送出看的是探访记录（改看位置）；排序用 `localeCompare`（改为码位）；净化与塌缩不发活性期结束；空迷宫表时每次旗标变化都全量结算；测试端口复位会清掉真实端口（改为还原）；校验器补项与负例；迷宫窗口的列表数据面。转遗留或记为决定：遗落物 3 日与 7 日、人数上限只在进入命令、澱巢澱度只在本系统可见、迷宫处置对地区澱的影响、地区与收晶的活性来源、塌了的迷宫 `phase` 不变、`迷宫系统` 别名带走四个剧情旗标的写入者、内容可写整个 `dg.` 族、澱巢的状态条与词缀；见 `progress.md` | 本会话 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `npm test` | `tests/art_manifest.test.ts`：未登记的用户图片 | 已知基线 | 素材 |
| `npm test` | `tests/docs_guard.test.ts` 的 `has no broken relative links`：`docs/70_packets/pk_m1_54_prologue_stage/README.md` 指向尚未写的 `verification_matrix.md` | 失败文件属另一个包的目录 | PK-M1-54 |
| `npm test` | `tests/npc_brain.test.ts` 的功能角色树一条 | 失败在 NPC 大脑 | PK-M1-18 |
| `npm test` | `tests/scenes_runner_additions.test.ts` 四条 | 失败在场景运行器 | 场景的并行包 |
| `npm test` | `tests/i18n_ui_guard.test.ts` 整个文件：扫描时 `src/client/input/` 里一个编辑器临时文件消失 | 另一个包正在改客户端输入 | PK-M1-07 或 PK-M1-22 |
| `npm test` | `tests/time_skip.test.ts` 的 T-09 营地睡觉：30 秒超时 | 单独运行通过（20.8 秒，`Tests 27 passed (27)`）；有无本系统的每 tick 开销对照无差（第 2 节） | 全量并行时的机器负载 |
| 本包改动中途的一次 | `tests/time_skip.test.ts` T-16、`tests/replay_segments.test.ts`、`tests/save_recovery.test.ts` 的存档后续跑哈希不同 | 逐切片对比只有 `npc` 切片不同，`dungeons` 切片与旗标相同；末次运行全部通过 | PK-M1-18 |
| 本包改动中途的一次 | `node tools/content/validate.ts` 的 V4 与 `tests/core.test.ts`、`tests/registry.test.ts` 的 `npcBrain` 条件未登记 | 失败行全是 `npcBrain`；末次运行全绿 | PK-M1-18 |
| 本包改动中途的一次 | `npm run typecheck`：`src/systems/scenes/runner.ts` 的新键、`tests/client_story.test.ts`、`tests/npc_alive_harness.ts` | 不在本包文件里；末次运行零错误 | 场景、客户端与 PK-M1-18 |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 实际游玩里的遗落物被吞 | 遗落包端口未注册，且 3 日与 7 日待用户决定 | PK-M1-11、PK-M1-13 接线后由通关路线覆盖 |
| 第一幕的地窖、旧矿与澱巢 | 记录、地图与魔物未落地 | PK-M1-30、PK-M1-35 |
| 两条无模型通关路线 | 多包并行中未跑 | 主会话提交前统一跑 |
| 场地状态条与迷宫窗口 | 界面未接 | PK-M1-22、PK-M1-23 |
