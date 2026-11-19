# PK-M1-21 内置 AI：同伴战斗与闲聊：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（同种子同操作的同伴行动序列一致；夹具上第 12 项每小时不少于 1 段且重复为 0；预警、点名、机关、`needsOrder`、"鸦群"击碎护盾、照料与羁绊来源各有用例；发行内容的第 12 项多种子验收要等 `ln_party` 补行进与营火段，见 `progress.md` 第 3 节第 1 行与第 5 节） |
| 末次代码或内容变更 | 未提交；改动文件清单见 `progress.md` 第 2 节 |
| 完整实跑 | 2026-11-19；工作区状态（未提交，与他包并行的同一工作区） |
| 审查 | 新起子代理的覆盖性复查两轮，发现与处理见 `progress.md` 第 2 节 |
| 遗留 | 见 `progress.md` 第 3 节；待用户定的见第 4 节；未跑的测试见第 5 节 |

## 1. 验收条目

计划包行验收栏："队内闲聊指标达阈值；同种子同操作同伴行动序列一致"。第 12 项的口径是 [builtin_ai.md](../../40_design/systems/builtin_ai.md) 第 14.2 节（有同伴在队时，每游戏小时的行进与营火闲聊不少于 1 段，重复为 0）。

### 1.1 计划包行的两条

| 序 | 验收 | 用例 | 结果要点 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 队内闲聊指标（第 12 项） | `tests/party_banter.test.ts` "one road exchange per 30 game minutes of journey; metric 12 holds with no repeats"、"at a camp at night: at most three exchanges a night"、"a repeatable road or fire exchange is heard again only once it is fresh (no repeats)"、"road exchanges per hour of road and campfire; every second hearing is a repeat" | 夹具路上走 150 个游戏分钟：3 段行进依次播完，暴露时长 1.98 小时（只计真的在走的路），每小时 1.5 段，重复 0；营火夜三段后停；可重复的行进段与营火段在新鲜之前不重播（重复 0）；计数函数的纯测试 | PASS（夹具）；发行内容的多种子验收延后 |
| 2 | 同种子同操作同伴行动序列一致 | `tests/party_ai.test.ts` "two runs of one seed pick the same stances and act the same"；`tests/npc_tide_rows.test.ts` "nobody with a single legal row is asked; one seed settles the same night twice" | 三名同伴的姿态选择、施法序列、位置两次相同；兽潮之夜两次结算相同 | PASS |

### 1.2 其余范围

| 序 | 范围 | 用例 | 结果要点 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 姿态得分 | `party_ai` 前四个用例 | 亲和乘 3、不自动选被动；全队充足 +2 协助，补给不足或两场苦战 +2 原地；玩家不足一半 +3 跟随；敌情与惯性 +1；开场意图随姿态 | PASS |
| 2 | 请求、回退、让位、作废 | `party_ai` "picks, files the request…"、"the player's own stance stands…"、"refuses the stance command…" | 每场一次请求，无模型时回退落在同一姿态；玩家下过姿态不选，交还后再选；拒绝玩家来源、别的同伴的回退、被动、不在战斗中、别的一场；本场的回答被采纳 | PASS |
| 3 | 姿态只管一场 | `party_ai` "the stance holds for the fight; after it the companion is back on its own" | 战中跟随，战后回到协助，`stanceLast` 记跟随；全程没有 `party.order` 事件 | PASS |
| 4 | 护卫与开场 | `party_ai` "a player under half health…"、"a guard the AI set to follow answers…"、"a protector peels…" | 护卫型同伴开场站到玩家身边；内置 AI 给的跟随下也打攻击玩家的敌人（关掉这一支时用例失败）；护人高的先拆打玩家的敌人 | PASS |
| 5 | 人格细调 | `party_ai` "Shiya spares a fleeing beast…" | 逃跑的野兽放过，站着的照打 | PASS |
| 6 | 避险 | `party_ai` "a warning of the party's own side is no danger…"、"steps off an arena hazard zone…"、"keeps out of a spread mark…"、"a needsOrder mark waits…"、"a melee companion does not walk into a warning…"；`party_companions` 的反应延迟与点名两个用例 | 己方预警不挪步；机关区在反应延迟后离开；别人的散开圈出去后逐 tick 不再进圈，集合圈走进去；`needsOrder` 等散开指令；不为够目标走进预警；自己的点名离开友方 | PASS |
| 7 | "鸦群"击碎护盾 | `party_ai` "a landed swarm (a debuff, no damage) breaks the shield that names it, once"、"a following Yeyu still turns her ravens on the shield…"；`party_companions` "Yeyu turns her ravens on a shield that only they break" | 不掷伤害的命中也击碎，只碎一次；跟随中的夜羽在首领打玩家时也先放（关掉这一步时用例失败） | PASS |
| 8 | 危急解围 | `party_ai` "the player healing a companion under a fifth…"、"a heal from above a fifth is no rescue" | 从一成治到四成 +1、同场第二次不加；从三成起治不算；按战斗落治疗的次序（对旧的快照读法会失败） | PASS |
| 9 | 闲聊运行时 | `party_banter` "says its lines in order…"、"no chatter before the bond reaches 相识…"、"combat cuts it short…"、"an enter exchange that came in a fight plays only back in its place"、"held ones play by priority x freshness, not by id"、"its condition coming true raises it once…" | 内容键、四秒一句、对象句取 `.zh`、回应点与羁绊；羁绊 19 不聊；打断后从第一句重来、两次作废；战中初到的段只回到原地才播；留下的按优先级播；条件上升沿与壮举事件 | PASS |
| 10 | 闲聊选择与节奏 | `party_banter` 前三个用例 | 计分与同分按编号；一次性与可重复的新鲜度；探索、行进、营火的节奏 | PASS |
| 11 | 营地谈话 | `party_banter` "only at a camp at night and from 同行 (40); once a night" | 白天拒绝；羁绊 30 拒绝；40 以上 +1；同一晚再谈拒绝 | PASS |
| 12 | 加载校验 | `party_banter` "the shipped act 1 exchanges pass; …" | 发行的 20 段通过；说话者不在演员里、未知地点、未知种类、句数不够、没有槽位、初到没写地点、关系段一人，都报出 | PASS |
| 13 | 照料 | `party_care` 全部 | 重伤读 `major`、回来读 `none`；外部写 `major` 使在场同伴退场；队外的人 2 日后痊愈；轻伤治疗后在床上睡一夜痊愈、未治不愈、不足四小时不愈；探望在诊所 +1、同一次重伤再探不加、不在休养处拒绝 | PASS |
| 14 | 兽潮选行 | `npc_tide_rows` 全部；`tests/tide_night.test.ts`（接缝用例不变） | 两行以上才问；菜单是合法行、建议是内核会取的行、回退为空；无模型时 `chosen` 为空、第一波取表上首行；模型选的合法行成为之后各拍的建议并保持 | PASS |
| 15 | 存档 | `party_save` "keeps the chatter, the fight record and the care clocks (PK-M1-21) across a save" | 往返哈希不变，续跑一致 | PASS |

## 2. 通用检查

| 检查 | 命令 | 结果 | 状态 |
| --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 0 错误 | PASS |
| 本包与相关测试 | `npx vitest run --config vitest.config.ts tests/party.test.ts tests/party_companions.test.ts tests/party_save.test.ts tests/party_ai.test.ts tests/party_banter.test.ts tests/party_care.test.ts tests/npc_tide_rows.test.ts tests/boss_mechanics.test.ts tests/tide_night.test.ts tests/autoplay_party_ready.test.ts tests/content_id_guard.test.ts` | `Test Files 11 passed (11)`，`Tests 219 passed (219)` | PASS |
| 数据门 | `node tools/content/validate.ts` | V1 到 V4、V6、V7、V9、V10 绿；V5（女神雅努的揭示，他包）2 个错误、V8（吠叫池的偏好覆盖，PK-M1-29）16 个错误，都不在本包的表 | PASS（扣除他包） |
| 注册表 | `node tools/registry/build.ts --check` | 37 passed | PASS |
| 文本 | `node tools/i18n/check.ts`；`node tools/i18n/gen_keys.ts`；`node tools/i18n/extract_content.ts` | 0 个发现；键表与内容文本已重生成 | PASS |
| 守卫 | `npx vitest run --config vitest.config.ts tests/architecture.test.ts tests/i18n_kernel_guard.test.ts` | 3 个失败，都在他包的文件（`src/systems/dialogue/lines/repetition.ts`、`src/systems/dialogue/intent/head.ts`、语言目录的新文件清单） | 不归本包 |
| 格式 | `npm run format -- <本包改动的文件>` | 无错误 | PASS |
| 禁用字符 | 对本包全部改动文件扫描破折号、emoji 与 U+2600 到 U+27BF | 0 | PASS |

## 3. 未跑

`npm test` 全套、`npm run playthrough` 与自动玩家路线、发行内容的第 12 项多种子验收、有模型档：见 `progress.md` 第 5 节。
