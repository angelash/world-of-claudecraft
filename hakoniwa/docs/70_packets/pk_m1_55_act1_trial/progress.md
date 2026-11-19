# PK-M1-55 第一幕审判与出示证物：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-19 | 实施、覆盖性复查、修复 | 出示核心与第六幕审庭共用；第一幕审判表、出示节点、反驳、判决计数；审判的身份暴露；反应表第 2、4 行的指控进度与预兆；校验与测试 | 未提交 | 见 `verification_matrix.md` | 主会话提交；计划状态列建议改为"已完成，带遗留"；第 3 节请求交各负责方 |

## 2. 汇报

### 2026-11-19 实施、覆盖性复查、修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/scenes/present.ts` | 新增 | 出示核心（纯）：`judgePresentation`、`recordPresentation`、`provenPoints` |
| `src/systems/scenes/trial.ts` | 新增 | 第一幕审判：`trialOffers`、`presentAtTrial`（落地写点旗标与效果、无关与伪证给反驳与代价、发 `trial.presented`）、`trialPoints`、计算 `trial_verdict`（写 `a1_trial_points`） |
| `src/systems/scenes/court.ts` | 修改 | `courtPiece` 把第六幕证据记录映成核心的证物；`presentEvidence` 经核心判定命中与偏离，偏离时切片形状与旗标照旧 |
| `src/systems/scenes/runner.ts` | 修改 | `PIECE_PREFIX`、`trialOf`；出示节点在有证物或选项时等待选择；`presentInTrial`（拒收未持有与重复；效果后检查场景仍在；落地且有 `to` 时播反应节点，否则留在节点上） |
| `src/systems/scenes/view.ts`、`types.ts`、`index.ts` | 修改 | 视图把持有的证物排在写定选项前；`TrialSpec`、`SceneNode.present`、切片 `trials`（旧存档缺省）；内容表 `trials`、事件 `trial.presented`；导出 |
| `src/content/packs/scenes.ts` | 修改 | 装载审判表；`trialProblems`（物品、点、写入的点、平反项数、反驳与说话者、点旗标、注册表名）、审判编号唯一；出示节点不与输入或审庭并用、总有出口、证物的反应节点存在 |
| `data/scenes/trials.json` | 新增 | 审判 `a1_witch_trial`：四个点、两项平反、证物 6 件（北泉灰水落地物证并播 `water` 节点；运货单、奥托遗嘱、代官印残片、梅尔卡硬币、公会卡与本审判无关）、两条反驳（无关 +2、伪证 +5 教会怀疑）、点旗标、计数旗标 |
| `data/scenes/act1.json` | 修改（只改 `cut_a1_trial` 四个节点） | `defense` 加 `present`、去掉写定的 `water` 选项（改由证物）；`water` 不再写 `a1_trial_evidence`；`verdict` 先跑 `compute trial_verdict` 再按 `a1_trial_points >= 2` 分支；`square` 在 `a1_cassian_appraise` 时写 `a1_trial_light_public` |
| `src/systems/npc/brain/consequences.ts` | 新增 | 反应行的其他后果：`accuse`（教会怀疑 +1，同一人每日一次，封顶 100）、`omen`（`omen.<地图>.law`，每图每日一次）；发 `npc.consequence` |
| `src/systems/npc/brain/reactions.ts`、`library.ts` | 修改（越界，小） | 反应后对玩家应用行的后果；脑表校验拒收未知后果名 |
| `src/systems/npc/types.ts` | 修改（越界，加法；同文件另有他包的 `scripted` 段，本包未动） | 切片字段 `consequences`（旧存档缺省）；事件 `npc.consequence` |
| `data/npc/brain/reactions.json` | 修改（越界，两处） | `heresy_alarm` 的后果 `accuse`、`challenge` 的后果 `omen` |
| `data/cognition/sources.json` | 修改（越界，加一行） | 暴露旗标 `a1_trial_light_public` 为 `identity_pageless` |
| `src/systems/quests/effect_types.ts`、`src/content/packs/quests.ts` | 修改（越界，各一行） | 计算名 `trial_verdict` |
| `src/content/registry_refs.ts` | 修改（越界，一处） | `countFlag` 计为写入名，注册表规则看得见审判的计数旗标 |
| `src/game/autoplay/routes.ts`、`data/autoplay/routes.json` | 修改（越界，小） | 偏好表的选项检查认出示节点的证物；`defense` 偏好 `piece:spring_water` |
| `locales/zh-Hans/sys_scenes.json` | 修改 | `sys.scenes.trial.present`、`present_line`、`landed` |
| `docs/40_design/world_state_registry.md`、`data/registry/vars.json` | 修改（越界，加法）、重生成 | 新行 `a1_trial_points`、`a1_trial_light_public`、`omen.<地图>.law`；`church_suspicion` 的写入方加 npc 反应表 |
| `tests/act1_trial.test.ts` | 新增 | 29 例，见 `verification_matrix.md` |
| `tests/act1_cutscenes.test.ts` | 修改 | 场景走查跟随出示节点的证物去向；剧本跑法可先给物品，加一条出示北泉灰水的跑法 |
| `locales/zh-Hans/content.generated.json`、`src/core/text_keys.generated.ts` | 工具重生成 | |

**决定**

| 决定 | 理由 |
| --- | --- |
| 出示核心只判定、不写世界；第一幕记录与点在审判模块，第六幕的防线强度留在审庭 | 两处的结算不同（点对强度），共用的是"这件东西落不落地、算不算重复与伪证" |
| 第六幕只经核心判定命中与偏离，行为逐项不变 | 第六幕已有的测试与路线不受影响；伪证的后果待第六幕的后续包 |
| 判决改为计数旗标 `a1_trial_points`，由 `compute trial_verdict` 按审判表算 | 证物与写定选项两条路证成同一点时只计一次；判决分支读一个数 |
| 证词仍走写定选项（证人上台），只有北泉灰水是证物 | 证人不是物品；目录第 4.2 节"多名证人只计一项"由点旗标 `a1_trial_testimony` 保证 |
| 无关与伪证的反驳与代价是审判表数据 | 系统不写台词与数值；第二幕的审判可另起一张表 |
| 当众说出的鉴定另立旗标 `a1_trial_light_public` | 礼拜堂里私下照过时 `a1_cassian_appraise` 早已置位，广场上的公开不会再触发；当场鉴定仍由 `a1_cassian_appraise` 首次置位触发，各一次 |
| 审判与逮捕的预兆另立 `omen.<地图>.law` | 女神的预兆 `omen.<地图>` 是另一回事，读者要分得开 |
| 指控进度落在 `church_suspicion` | 注册表里教会对玩家的案子就是它（第 8.2 节）；第二幕赛琳与 `tide_attribution` 都读它 |

**复查发现与处理**（新起的只读子代理一轮）

| 发现 | 处理 |
| --- | --- |
| `act1_cutscenes` 两例变红（`water` 节点只经证物可达） | 场景走查跟随证物去向；加出示灰水的剧本跑法；57 例全过 |
| `tut_a1_present` 在第一幕审判不会触发 | 客户端教学信号属 PK-M1-23，转请求（第 3 节第 1 行） |
| 注册表缺写入方（npc 写 `church_suspicion` 与预兆） | 注册表补写入方，重生成 |
| 预兆无人读且与女神预兆同名 | 另立 `omen.<地图>.law`；读者转后续包（第 3 节第 3 行） |
| 核心与第六幕只浅共用；伪证在两幕都没有后果 | 改写两个模块的说明，如实写清；第六幕伪证转后续（第 3 节第 2 行） |
| 校验缺口（点旗标、注册表名、反驳说话者、编号唯一、出示与输入并用、总有出口；注册表漫游不看 `countFlag`） | 全部补上 |
| 测试缺口（拆穿与辩论计点、短版的结局、重复出示、未持有不改状态、盘查写预兆、未知后果被拒、`courtPiece`、同日二次暴露） | 全部补测 |
| `presentInTrial` 效果后不查场景是否仍在 | 补查 |
| 死代码与说明（`trialClears`、`pointFlagsOf`、`TrialDef.pieces` 的注释） | 删去与改正 |
| 其余（反驳键依赖数组下标、无关证物指向不存在的审判名、`routes.ts` 写死 `piece:`、视图重复过滤、玩家出示公会卡是否算身份暴露、指控即时而非晚祷、`expl_dark` 含阴谋、仅拆穿一项时判定成立的设计空白） | 记入第 3 节或作为已知限制，不阻塞 |

**延后的测试**（用户指示：不跑全量 `npm test` 与 `npm run playthrough`）

| 套件或路线 | 为什么可能受影响 |
| --- | --- |
| `npm run playthrough` 的两条全程路线（`release`、`rule_merca`） | 自动玩家经过审判的出示节点（偏好 `piece:spring_water`） |
| `tests/scenes.test.ts` 的整局走查 | 本包前已失败（停在第一幕第 1 周 `q_a1_m04_hunt`，复查已用临时脚本确认不在审判） |
| NPC 与认知的整幕测试（`npc_alive`、`goddess_alive_*`） | 反应表的两行多了后果；教会怀疑会随目击上升 |
| `tests/save*.test.ts` | 新切片字段 `scenes.trials`、`npc.consequences` |
| 全量 `npm test` | 共享文件的改动与重生成物 |

## 3. 留给后续包的事项与请求

| 序 | 事项 | 建议归属 |
| --- | --- | --- |
| 1 | `tut_a1_present`：`src/client/app/tut_signals.ts` 只在 `waiting === 'court'` 时发 `evidence_prompt`；第一幕审判的出示节点等待的是 `choice`，要在探针里加"当前节点有 `piece:` 选项"并据此发 `evidence_prompt` 与 `evidence_shown`；高亮目标 `scene_evidence` 在客户端尚无对应元件 | PK-M1-23 |
| 2 | 第六幕伪证：被质询的防线厚度 +1、本场口才加成归零（第六幕第 3.3 节）；核心已有 `forged` 与 `forgeryCaught`，审庭尚无伪证记录 | 第六幕的后续包 |
| 3 | 读 `omen.<地图>.law` 的审判与逮捕事件链（"逮捕前先有盘查"）；现在只写不读 | 审判与逮捕事件链的后续包（PK-M2） |
| 4 | 审判官或勇者的指认（`identity_guest`，PK-M1-19 遗留第 10 项后半）；反应表第 2 行的"晚祷样本进入艾琉恩投影" | PK-M2 赛琳线；PK-M2-11 |
| 5 | 第一幕可买到的伪证（假情报）与它在审判表里的证物行 | 第一幕情报与黑市的后续包 |
| 6 | 无关证物现在指向不存在的审判名（`a1_moss_tax`、`a1_otto_mill`），只为说明它们证的是别的案子；有了那两个审判时改成真名并校验 | 纷争 A1-D01、A1-D08 的审判（若做） |
| 7 | 第一幕第 4.2 节"未拆穿光之鉴且证词不足"与"四项成立两项"之间，只拆穿一项时的结局没写明；现按任务目录的两项规则判为成立 | 叙事（第一幕正典回写） |

## 4. 需用户决定

| 序 | 事项 | 现状 | 选项 |
| --- | --- | --- | --- |
| 1 | 无关证物与伪证的代价 | 无关 +2、伪证 +5 教会怀疑 | 保持；或无关不扣、只说反驳 |
| 2 | 虔信者的指控进度 | 目击当场 +1，同一人每日一次 | 保持；或按设计改到当晚的晚祷才上报 |
