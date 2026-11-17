# PK-M1-46 纷争链运行器与第一幕自走：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施、覆盖性复查、修复 | 纷争运行器（阶段、决策点与内置效用兜底、结算）、三条 Must 纷争的链任务与运行数据、注册表、内容校验、测试 | 未提交 | `tests/disputes.test.ts` 33 passed；相关套件 20 个文件 435 passed（唯一失败属他包）；`npm test` 2845 passed，2 failed（基线 `art_manifest` 与 PK-M1-06 的注册表别名）；数据门、注册表、文本检查全绿；两条自动玩家路线 `Tests 2 passed (2)`，807.74s | 主会话提交；计划状态列建议改为"已完成"；计划范围栏回写（`README.md` 第 11 节） |

## 2. 汇报

### 2026-11-17 实施、覆盖性复查、修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/disputes/types.ts` | 新增 | 运行数据与运行状态的类型 |
| `src/systems/disputes/utility.ts` | 新增 | 决策点效用（内置 AI 第 5.8 节）、合法菜单、兜底选取、解释记录 |
| `src/systems/disputes/outcomes.ts` | 新增 | 结局选择（主结局、默认、可叠加、促成者）与合法结局表 |
| `src/systems/disputes/runner.ts` | 新增 | 运行器：阶段、决策点开启与兜底、选择者作答、结算与写入；事件声明 |
| `src/systems/disputes/index.ts` | 新增 | 系统（阶段序 82、跳时处理器、命令 `disputes.decide`）；NPC 大脑接缝 `openDecisions`、`decisionMenu` |
| `src/content/packs/disputes.ts` | 新增 | 内容包与校验 `disputeProblems` |
| `data/disputes/act1_chains.json` | 新增 | 三条纷争链任务（种类 `dispute`，按周默认发展，结算后完成或由他人先完成） |
| `data/disputes/act1.json` | 新增 | 三条纷争的阶段、决策点、结算与结局 |
| `locales/zh-Hans/sys_disputes.json` | 新增 | 三条拒绝原因 |
| `tests/disputes.test.ts` | 新增 | 33 个用例 |
| `docs/70_packets/pk_m1_46_disputes/` | 新增 | 本目录三件 |
| `docs/40_design/world_state_registry.md` | 修改 | 第 8.7 节：族 `dispute.<任务>.stage`、`.escalation`、`.choice.<决策点>`、`.ending`、`.by`，标记 `a1_owen_escorted`、`a1_logger_saved`、`a1_nick_bridge`、`a1_eastslope_expelled`；第 8.8.2 节：`a1_cassian_report` 加取值 `unresolved` 与写入者，`a1_trial_brawl`、`a1_isa_will_testify` 的写入者 |
| `data/registry/vars.json` | 工具重生成 | `node tools/registry/build.ts` |
| `src/core/text_keys.generated.ts` | 工具重生成 | `node tools/i18n/gen_keys.ts`；同时带进了他包同期写进字符串表的键 |
| `locales/zh-Hans/content.generated.json` | 工具重生成 | `node tools/i18n/extract_content.ts`；同时带进了他包同期改的数据（技能与光环改名） |

**验收逐条结果**：见 `verification_matrix.md` 第 1 节。

**复查发现与处理**（新起的只读子代理，一次）

| 发现 | 处理 |
| --- | --- |
| 测试文件从 `core/system` 导入 `CommandSource`，类型检查失败 | 改从 `core/contracts` 导入 |
| 无人到场的审判与主线 `q_a1_m09_trial` 的光之鉴都写 `a1_oola_fate`：主线任务进行中时运行器也会在第 8 周定罪；先办过审判时阶段仍走到指控与拘押 | 裁决点加 `when: quest.q_a1_m09_trial != active`（主线审判在进行就等它的场景，场景写了 `a1_oola_fate` 后裁决点作废）；阶段加 `convicted` 条件阶段；平反结局把周报改写为 `cleared`；补测"主线审判进行中时裁决等场景" |
| 林地之争不介入时葛恩的去留是抛硬币，与正典第 4.4 节的事件链（第 8 周、第 10 周东坡仍在）和任务目录的默认结局不符 | 留下明显占优（立场 0.85），只有镇上对东坡的声望跌到 -30 以下时离开才占优；20 个种子全部走到冲突升级；补测"镇上敌视东坡时葛恩自己东迁" |
| 链结算经验与任务目录的发放清单不符（截车、驱逐、贿赂、来路不明的出逃也会发） | 结局的 `by` 只记谁促成；链任务的完成条件按任务目录第 5.3 节逐条列出发经验的结局（税与匪：揭发、傀儡、反咬致死、被拘、收编、歼灭；魔女审判：平反、隐匿；林地之争：和解、部分和解），其余由他人先完成；出逃与冲突记 `world`；补测截车、贿赂、驱逐不发经验 |
| 部分和解把"博罗压下血债"算作玩家促成，NPC 大脑自己选了也会发经验 | 部分和解只认玩家的事实（林约、狼巢、尼克、扳手腕）；另加 `truce` 结局（`world`）收 NPC 自己压下的情形；补测 NPC 大脑经命令作答 |
| 若干玩家路线不写幕出口变量（贿赂的周报、被拘与死亡的灰晶生意、驱逐时的林约、歼灭与溃散时的薇罗） | 逐条补写（`a1_cassian_report = unresolved`、`a1_dian_trade = stopped`、`a1_forest_accord = broken`、`a1_viro_status = fled_wallenburg`、溃散加一行可叠加结局）；全部介入用例都过幕出口变量检查 |
| 税与匪在兽潮之后才结算，兽潮夜读不到莫斯在任、独眼团活跃 | 链的第 1 周默认发展写起始状态 `a1_moss_fate = in_power`、`a1_oneeye_fate = active`、`a1_old_watch = bandits`、`a1_viro_status = in_band`（都只在未写时写）；莫斯的灰晶车在第 9 周或兽潮夜先到者开启；20 个种子检查莫斯在兽潮夜之前在任、之后南逃 |
| 每 tick 的正常路径没有测试 | 补测逐 tick：周首开启、截止落在非轮询 tick 时当 tick 兜底、旗标变动后下一 tick 开启 |
| 测试言过其实：VS-08 用例依赖前面用例的共享集合；真实游戏一跑不与默认结局比对；介入用例实际是写节点产物 | VS-08 用例自足（一跑不介入加一跑介入）；真实游戏比对默认结局；介入用例的说明写明"节点任务写的事实"；兜底的冲台用例写明是代替更早的升级 |
| 包内缺验证矩阵与进度 | 补写本目录三件 |
| 欧文第 6 周初就走，护送窗口（第 4 到 6 周）还没过完 | 离开改在第 6 周末（第 7 周首）；补测护送后不走 |
| 强制结算会覆盖后面幕写的值 | 南逃只在莫斯仍在任或未写时写；独眼团、旧哨村、薇罗都只在未写时写 |
| 选项的 `breaks` 条件不进注册表扫描；结算周不查幕周数；只查了 `.choice` 的名长；不查链任务的 `byOther` | `src/content/registry_refs.ts`、`src/editor/quests/flag_index.ts` 的条件字段加 `breaks`；校验补齐三项并补测 |
| `decisionMenu` 读路径会建切片，标签是原文 | 改为只读；标签改为内容文本引用 |
| 伊莎在只有泉水物证时也可能作证（抽取），与任务目录的门槛不符 | 去掉泉水对伊莎的加项：门槛只有信任 60 以上，或节点任务直接写 `a1_isa_will_testify`；补测只有泉水时她沉默、审判成立 |
| 卡西安"怀疑每多一级门槛降一件"只做了一级 | 加上怀疑 2 以上不需证据的一项 |
| 薇罗的决定选不到"按兵不动" | 知道密约时她两头的安全感拉开，进入同一带内 |
| 魔女审判的当事人缺博罗 | 已加 |
| 从未接过的链在玩家促成后不会关闭，日后接取时立刻完成 | 链任务的触发条件加"尚未结算"：结算后不再开始 |

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 任务目录（前）第 5.3 节 A1-D02 冲突的条件 | 判定有罪时林约已破裂、博罗活着，且主线审判任务进行中（玩家在场） | 按正典第 4.2 节：判定有罪时林约已破裂即可冲台，不要求玩家在场；无人介入时第 8 周的审判（6 小时内裁决）先于博罗的血债（72 小时内），所以默认仍是审判成立 | 正典优先；正典的不介入事件链第 8 周有罪、第 9 周待押，没有冲台 | 否 |
| 任务目录（前）第 5.3 节 A1-D01 收编 | `a1_old_watch = absorbed_camp` | 写注册表的取值 `camp` | 注册表第 8.4 节只有 `bandits`、`cleared`、`camp` | 否 |
| 任务目录（前）第 5.3 节 A1-D01.b | `a1_owen_left = stayed` | `a1_owen_left` 在注册表是标记（只置真），留下即不写；护送的节点产物另登记 `a1_owen_escorted` | 注册表与正典第 12 节（"留下、离开"）都是二值 | 否 |
| 任务目录（前）第 5.3 节各结局的条件 | 读节点任务的状态与解法（`quest.q_a1_s04_pact_oak == done` 等） | 读节点产物变量（`a1_forest_pact_proof`、`a1_wolf_den`、`a1_moss_exposed`、`a1_oola_jailbroken` 等），缺的四个新登记 | 节点任务在 PK-M1-33；注册表规则不允许条件读不存在的任务 ID | 否（请 PK-M1-33 的节点任务写这些变量） |
| 任务目录（前）第 5.3 节 A1-D01 揭发 | `town_trust.*` +15 | 只给平民 `rep.bs_commons` +30（注册表第 7.4 节的换算：群体声望 = 镇民信任 × 2 - 100） | 正典第 4.1 节写"镇民信任大幅上升" | 否 |
| 正典第 4.4 节部分和解 | 只完成 a 或 f | 另认"血债被拦下"（尼克做中间人、扳手腕后博罗压下）为部分和解（休战，无新约） | 正典没写只拦下血债、没有 a 与 f 的情形；休战最贴近 | 否 |
| 正典第 4.4 节驱逐 | 写 `a1_shiya_family = left` | 另写 `a1_forest_accord = broken`（未写时） | 东坡走了，林约作废；兽潮夜的东栅判定把破裂与驱逐同样处理（第 8.4 节）；幕出口变量要写全 | 否 |
| 正典第 4.1 节反咬致死、被拘 | 没写灰晶生意 | `a1_dian_trade = stopped`（未写时） | 莫斯是这条货线的组织者 | 否 |
| 正典第 4.1 节歼灭 | 没写薇罗 | `a1_viro_status = fled_wallenburg`（未写时） | 第二幕瓦伦堡灰鼠线读它；收编时正典写她叛逃 | 否 |
| 正典第 4.2 节贿赂 | 卡西安周报写"未能审结" | 注册表 `a1_cassian_report` 加取值 `unresolved` | 周报版本要写全，第二幕赛琳读它 | 否 |
| 任务目录（前）第 5.3 节 A1-D02 默认 | 第 8 周审判成立 | 主线审判任务 A1-M09 在进行时，运行器的裁决等主线场景 | 写定层优先（任务与事件第 2.2 节规则 1） | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `tools/registry/parse.ts` | 系统名单加 `disputes`，注册表的写入者才认得纷争运行器（同期 PK-M1-47 加了 `guild`） | 内核 | 已改，一行 |
| `tools/content/validators/namespace.ts` | `q_` 前缀可住进 `disputes` 表：运行数据以纷争链任务的 ID 为键 | 数据门 | 已改，一行加注释 |
| `src/content/registry_refs.ts`、`src/editor/quests/flag_index.ts` | 条件字段加 `breaks`（决策选项违背必须保持的条件），注册表规则与编辑器索引才看得见 | 内核、编辑器 | 已改，各一行加注释 |
| `tests/quest_model.test.ts` | 三处：示例链的 `a1_owen_left` 改为 `zz_owen_left`（真实的税与匪也写它）；默认步骤事件只看示例链；"第一幕数据仍是旧时序"排除纷争链（纷争链靠 `byOther` 收尾） | PK-M1-58 | 已改 |
| `docs/60_production/development_plan.md` 第 4.2 节 PK-M1-46、PK-M1-33 两行 | 范围栏"九条纷争"与交付不符（`README.md` 第 11 节） | 主会话 | 请求回写 |
| `docs/40_design/content/catalog_quests_acts1_3.md` 第 5.3 节 | 链内变量补四个新标记；结局条件改读节点产物变量；`a1_old_watch` 写 `camp`；A1-D02 冲突按正典 | 内容（PK-M1-33） | 请求回写 |
| `docs/40_design/systems/quests_and_events.md` 第 3.6 节 | 加数据层一段：运行数据在 `data/disputes/`，运行器在 `src/systems/disputes/` | 叙事 | 请求回写 |
| `data/scenes/act1.json` 的光之鉴劫狱选项 | 只写 `a1_oola_fate = fled`，不写 `a1_oola_jailbroken`，纷争记为来路不明的出逃（`world`），不发链结算经验 | PK-M1-33 或场景方 | 请求回写 |

**留给后续包的事项**

| 事项 | 建议去处 |
| --- | --- |
| 其余六条第一幕纷争的运行数据；三条 Must 纷争的节点任务（写本包读的节点产物变量：`a1_owen_escorted`、`a1_moss_exposed`、`a1_moss_evidence`、`a1_moss_fate`、`a1_moss_intercepted`、`a1_oneeye_fate`、`a1_viro_pact_known`、`a1_isa_will_testify`、`a1_oola_jailbroken`、`a1_oola_bribed`、`a1_logger_saved`、`a1_forest_pact_proof`、`a1_wolf_den`、`a1_nick_bridge`、`a1_boro_calmed`、`a1_eastslope_expelled`） | PK-M1-33 |
| 主线 A1-M09 重导：周窗到第 8 周；无人到场的审判已经发生（`dispute.q_a1_d02_witch_trial.choice.cassian_verdict` 已写）时，光之鉴场景改走"审判已经开过"的分支，不再改写 `a1_oola_fate` | PK-M1-33（关键：玩家在第 8 周之前还没开始 A1-M09 时，现数据下场景会把运行器的定罪改掉） |
| 主线审判场景当庭的写入（拆穿、辩论、证词、冲台、`church_suspicion` +15）由 `cut_a1_trial` 负责，运行器只管无人到场的审判 | PK-M1-33、PK-M1-54 |
| 人设驱动的决策点效用；`npc.decision_point` 模型请求（订阅 `dispute.decision_opened`，以 `disputes.decide` 作答，兜底用 `decisionMenu` 的规则效用）；决策写进当事人的记忆（订阅 `dispute.decided`） | PK-M1-18 |
| 兽潮之夜读 `dispute.q_a1_d01_tax_and_bandits.choice.viro_raid`、`a1_moss_fate`、`a1_oneeye_fate`、`a1_forest_accord`、`a1_oola_fate`；伤亡与冲台的伤亡结算。冲突升级的伤亡（博罗或一名伐木工）按结局代号 `dispute.q_a1_d04_forest_dispute.ending == broken` 判定，不按 `a1_forest_accord == broken`：东坡东迁与被驱逐时也写了破裂，但没有血债 | PK-M1-52 |
| 希雅信任 70 以上时不随家离开（驱逐结局） | PK-M1-15（同伴）或 PK-M1-33 |
| 导演张力计读 `dispute.<任务>.escalation` | PK-M1-20 |
| 日志与界面的纷争显示（阶段、"本周发生了什么"，读 `quest.default`、`dispute.*` 事件与内容文本键） | PK-M1-22、PK-M1-57 |
| 编辑器的任务图只读 `data/quests/quests.json`，看不到 `data/disputes/act1_chains.json` 的链任务 | PK-M1-25 |
| 瑟格没有人设卡，单挑与收编只能由节点任务写结果 | PK-M1-28 |
| 第二、三幕纷争的自走 | PK-M2-12 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 主线 A1-M09 在第 8 周之后才开始的玩家（现数据没有周窗） | 场景会改写运行器的定罪，周报与教会怀疑留在定罪时的值 | 平反结局把周报改写为 `cleared`；PK-M1-33 重导 A1-M09 时按上表处理；自动玩家路线在第 3 周就审判，不受影响 |
| 每局多了三条自动开始的纷争链任务与 `dispute.*` 旗标 | 世界哈希与日志内容变化 | 重放测试都是同代码自洽比较；两条自动玩家路线重跑（`verification_matrix.md`） |

**需用户决定**：见 `README.md` 第 11 节（计划范围栏的回写，不阻塞）。

**下一步与恢复方式**

1. 主会话提交本包文件（上表）；`tests/quest_model.test.ts` 与 PK-M1-58 同属任务模型，三处小改随本包提交或并入其提交均可。
2. 计划第 4.2 节 `PK-M1-46` 状态列改为"已完成"，范围栏按 `README.md` 第 11 节回写。
