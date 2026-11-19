# PK-M1-21 内置 AI：同伴战斗与闲聊：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-18 到 19 | 实施、两轮覆盖性复查、修复 | 姿态的内置选择与 `companion.tactics`；避险层（预警、点名、机关、`needsOrder`）；人格的战术细调；"鸦群"击碎护盾与技能目录登记；队内闲聊（触发、选择、节奏、打断、回应、第 12 项口径）；照料（`npc.<人>.injury`、轻伤、探望）；营地谈话与危急解围；兽潮之夜的选行请求；测试 | 未提交 | 见 `verification_matrix.md` | 主会话提交；计划状态列建议改为"已完成"；第 3 节的请求转各包；第 4 节待用户定 |

## 2. 汇报

### 2026-11-18 到 19 实施、两轮覆盖性复查、修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/party/tactics.ts` | 新增 | 姿态得分（`scoreStances`）、得分的输入（`tacticsInputs`：全队生命与法力、补给、连续苦战、玩家生命、敌情）、每场战斗的开始与结束（`tickFight`）、内置选择与开场意图、`companion.tactics` 请求与回退 `party.stance`、`stanceCommand`（玩家姿态、作废、被动、过期）、战后回到同伴自己的姿态、危急解围 |
| `src/systems/party/danger.ts` | 新增 | 避险层（自 `ai.ts` 移出并扩充）：敌方预警、点名、机关区、反应延迟、`needsOrder`、`dangerAt` 与 `heedsOf`、安全落脚点 |
| `src/systems/party/banter.ts`、`banter_select.ts`、`banter_metric.ts` | 新增 | 闲聊运行时、纯选择核心（新鲜度、可播、计分、节奏、内容键）、第 12 项计数 |
| `src/systems/party/care.ts`、`places.ts` | 新增 | 照料；营地、床、休养处、夜晚的判断（读地点种类、标签、地图职能） |
| `src/systems/party/ai.ts` | 修改 | 文件头；避险改调 `danger.ts`；开场一步在找目标之前；协助、护人、护治疗者、放过逃跑野兽的选目标次序；护卫型同伴在内置 AI 给的跟随下也打攻击玩家的敌人；视野内由自己技能击碎的护盾先打；接近目标与守点不进危险 |
| `src/systems/party/index.ts` | 修改 | 接线：每 tick 的战斗起止，每秒的照料与闲聊；事件 `flag.changed`、`entity.died`、`combat.heal`、`party.wounded`、`party.recovered`、`time.skipped`、`feat.performed`、`act.changed`、`npc.relation_changed`、`dialogue.opened`/`closed`、`scene.started`/`ended` |
| `src/systems/party/commands.ts` | 修改 | 玩家 `party.order` 记 `stanceBy`；新命令 `party.stance`、`party.auto_stance`、`party.banter_reply`、`party.visit`、`party.camp_talk` |
| `src/systems/party/types.ts`、`config.ts` | 修改 | 新配置（`tactics`、`banter`、`care`）、闲聊与战斗的状态、成员新字段、新事件与命令、内容表 `partyBanter`、规则 `spare` |
| `src/content/packs/party.ts` | 修改 | 装载 `partyBanter`；`validateBanter`（编号、种类、演员 1 到 3 人、说话者在演员里、`enter` 必须写地点且只有它写、`on` 只给事件、条件可解析、回应 2 到 3 个且羁绊对象在演员里、关系闲聊至少两人、`ln_party` 在时槽位句数够）；规则 `spare` 的校验 |
| `data/party/banter.json` | 新增 | 第一幕 20 段（编号、演员、触发、条件、一次性、回应的羁绊取自第一幕台词目录第 7 节）；`a1_crow_meets_ron` 补了地点 `borderstone` |
| `data/party/config.json` | 修改 | `tactics`、`banter`（含 `campTalkBond` 40）、`care`（`npcDays` 2） |
| `data/party/companions.json` | 修改 | 希雅的规则 `{ kind: spare, families: [beast], fleeing: true }` |
| `data/party/abilities.json` | 修改 | `sk_yeyu_ravenswarm` 的说明（失明 3 秒、击碎以它为名的壳） |
| `locales/zh-Hans/sys_party.json` | 修改 | 拒绝原因 `player_stance`、`stale`、`no_banter`、`not_resting`、`visited`、`not_night`、`talked`、`far_from_rest`、`bond_low`；提示词 `prompt.tactics_situation`、`prompt.tactics_command` |
| `src/systems/combat/abilities.ts` | 修改（越界，一处） | `runEffect` 的 `aura` 分支，`if (enemy && !landed) return;` 之后加两行注释与 `if (enemy) abilityHitShield(ctx, t, def.id, caster);`：落地的减益也算一次技能命中，写明由它击碎的护盾随之击碎（"鸦群"不掷伤害） |
| `src/systems/npc/index.ts` | 修改（越界，两处） | `import './skip';` 之后加 `import { onTidePhase } from './brain/tide_rows';`；`'dispute.decision_opened'` 处理之后加 `'tide.phase'(ctx, e) { onTidePhase(ctx, e.data); },` |
| `src/systems/npc/brain/tide_rows.ts` | 新增（NPC 目录下的新文件） | 兽潮之夜的选行请求（见 `README.md` 第 2 节第 9 行） |
| `locales/zh-Hans/sys_npc.json` | 修改（越界，加两键） | 文件末尾加 `sys.npc.prompt.tide_situation`、`sys.npc.prompt.tide_command` |
| `src/content/references.ts` | 修改（共享文件，加三行） | `{ table: 'npcs', path: 'schedule', ... }` 之后加注释一行与 `{ table: 'partyBanter', path: 'cast[]', to: PERSON }`、`{ table: 'partyBanter', path: 'speakers[]', to: PERSON }`；同文件其余差异是他包的 |
| `docs/40_design/content/catalog_abilities_talents.md` | 修改（越界，最小） | 新第 2.13 节"同伴标志技能（1 条）"一张一行的表与一句"数值待用户确认"；第 5.2 节一句（"鸦群"入队即有）；文末链接定义 `[bai]` |
| `tests/party_ai.test.ts`、`party_banter.test.ts`、`party_care.test.ts`、`npc_tide_rows.test.ts` | 新增 | 见 `verification_matrix.md` |
| `tests/party.test.ts` | 修改 | 倒地起身的用例先下 `party.order assist`（内置 AI 对精英会给奈拉选原地，用例原意是协助） |
| `tests/party_companions.test.ts` | 修改 | 预警与点名的两个用例改用敌方施放者（己方的预警不再算危险） |
| `tests/party_save.test.ts` | 修改 | 新用例：闲聊、战斗记录、照料钟与成员新字段随存档往返，哈希不变、续跑一致 |
| `src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 工具重生成 | `node tools/i18n/gen_keys.ts`、`node tools/i18n/extract_content.ts`（同时带进了他包同期的改动） |
| `docs/70_packets/pk_m1_21_companion_ai/` | 新增 | 本目录三件 |

**新登记的注册表变量**：无。读写的 `npc.<人>.injury` 已登记（写入方含 party）；`node tools/registry/build.ts --check` 37 个用例通过。

**接入他系统的方式**

| 系统 | 方式 | 说明 |
| --- | --- | --- |
| 战斗 | 读 `telegraphsOn`、单位、地形记录、首领护盾、难度修正；`castAs` 放技能；一处钩子（上表） | 同伴系统本来就导入战斗（PK-M1-15 起） |
| 伤病 | `readAilments`、`healInjury`（轻伤痊愈） | 同伴系统本来就导入伤病 |
| 任务条件 | `conditionHolds`（闲聊条件） | 同伴系统本来就导入任务条件 |
| 旅行 | 事件 `time.skipped`（睡眠时长） | 无导入 |
| 对话与场景 | 事件 `dialogue.opened`/`closed`、`scene.started`/`ended` 打断闲聊 | 无导入 |
| 兽潮 | NPC 大脑读 `runningNight`、`legalRows` 并发请求；`tide.act` 由兽潮系统校验 | 新的 NPC 到兽潮的导入（兽潮本来导入 NPC 的记忆与关系，没有模块环）；请求见第 3 节第 4 行 |
| 台词 | 只发 `ln_party` 的内容键；加载校验读 `linePacks` | 无导入 |

**`ln_party` 的约定（与 PK-M1-29 对齐）**：槽位 `party.<编号>` 依次是各说话者的句子，之后是回应点的选项文字；句数等于 `speakers` 的长度加 `replies` 的长度；写成对象的句子取 `.zh`；空位（`null`）跳过。`data/dialogue/lines/ln_party.json` 已由 PK-M1-29 落地，20 段全部覆盖、句数正好，加载校验通过。

**决定**

| 决定 | 理由 |
| --- | --- |
| 姿态是"这一场战斗"的：内置 AI 或模型在战斗开始时给，战后回到同伴自己的姿态；惯性项读上一场的姿态（`stanceLast`） | 内置 AI 第 11.1 节"为每名同伴选下一场战斗的姿态"；复查发现选了原地的同伴战后被留在原地 |
| 玩家下过姿态（`party.order` 来自玩家）后内置 AI 不再给该同伴选，直到 `party.auto_stance` 交还 | 第 11.1 节"玩家下达过的姿态与战术指令优先于本式"；交还的界面是请求（第 3 节第 5 行）；是否改为只管一场待用户定（第 4 节第 2 行） |
| 内置 AI 的姿态变化发 `party.tactics`，不发 `party.order` | `party.order` 是玩家下令的事实，教程步骤 `tut_a1_servant` 等以它为完成条件 |
| 护卫型（护人 80 以上）同伴在内置 AI 给的跟随下也打攻击玩家的敌人；玩家下令的跟随仍按第 7.2 节只还击攻击自己的敌人 | 第 11.1 节的"偏护卫"即跟随；只还击会让护卫型同伴在玩家受伤时袖手 |
| 视野（12 格）内有护盾写明由自己技能击碎时先放这一手，不看姿态与目标 | 第 10.4 节；跟随的夜羽不会去打没打她的首领 |
| 危险包括敌方预警、别人身上的散开与追踪点名圈、机关区；施放者已不在的预警照样算；`needsOrder` 的点名在玩家下散开或移动指令前不算 | 第 10.3、10.5 节；复查发现守点会把同伴拉回圈里 |
| 闲聊里只有带起因的种类（初到、事件、关系、换幕）忙时会留下；行进与营火不留，下一次看时再起；留下的只在自己的处境里播（初到某地的只在那里播）；留下的按 优先级 × 新鲜度 选，被打断的先重播；重播跳过探索与行进的间隔，不跳过营火的每晚段数 | 第 11.3 节；复查发现可重复的段被留下后无视新鲜度反复播、初到某地的段在别处播、留下的按时间与编号播 |
| 闲聊演员必须和队伍一起在玩家这张图上、站着（不是在门口等或倒地） | 复查发现等在门口的同伴也被算进演员 |
| 第 12 项的暴露时长只计有同伴在身边时真的在走的路与营火边的夜 | 第 14.2 节"行进与营火"；站着不动不算行进 |
| 营地谈话：夜里在营地或床边、羁绊 40 起、不在战斗中、每晚一名同伴一次 +1 | 第 8.2 节（同行一档起）、第 8.4 节（入睡前、每晚一次） |
| 轻伤痊愈：他人治疗之后、在床上睡满四小时 | 第 10.1 节"在床上睡一夜并接受治疗"；四小时是"一夜"的下限 |
| 探望：重伤一次一回 +1，只在私有地图（庭院）或诊所 | 第 8.4 节"到庭院探望"；第 11.3 节庭院未开时去最近的诊所（待用户确认，第 4 节第 4 行） |
| 危急解围以治疗前的生命判断（治疗量回推），不读快照 | 事件在各系统 tick 之后才分发，快照已是治疗后的生命 |
| 兽潮选行的回退为空：无模型时内核自己的规则不受干扰；只在之后还有拍要选行时请求；建议项是内核会取的行 | 写入内核首行会在表的次序变化后钉住旧行，也会盖掉等待期间到来的选择；`tests/tide_night.test.ts` 的接缝用例因此不变 |

**复查发现与处理**（新起的只读子代理两轮：第一轮审全部改动，第二轮核对第一轮的处理并找新问题、在临时目录用探针复现）

| 发现 | 处理 |
| --- | --- |
| 忙时条件成立的事件段丢失；忙时初到某地的段丢失 | 每次看都记条件的上升沿并留下；初到的地点留下 |
| 可重复段完成后仍带着被打断次数 | 完成时清零 |
| 被打断的段在别的处境重播 | `fitsKind` 复查行进、营火、初到地点 |
| 第 12 项暴露时长不看同伴是否在身边 | 要有活着且同图的同伴 |
| 回应的羁绊按对象键的写入次序结算 | 排序后结算 |
| 落脚点只避开当前这一个危险 | 同时避开全部危险与不可走的格 |
| 自己的点名只看玩家 | 看周围全部友方，取同时离开所有人的格 |
| 己方的预警也让同伴挪步 | 只认敌方施放者（施放者已不在也算） |
| 开场一步要先找到目标 | 移到找目标之前，爆发才要目标 |
| 战斗结束后到来的姿态回答仍被采纳；别的同伴的请求能改这名同伴 | 战斗不在或不是这一场即作废；回答者须是请求点名的同伴 |
| 兽潮回退每拍重写首行 | 回退改为空（见决定） |
| 在哪都能探望；任何睡眠都治轻伤；治疗量为 0 不算治疗 | 只在庭院或诊所；睡满四小时；任何他人的治疗都算 |
| 缺营地谈话 | 补 `party.camp_talk` |
| （第二轮）内置 AI 选的原地战后不解除，同伴被留下 | 姿态只管这一场（见决定）；补测 |
| （第二轮）可重复的行进与营火段反复播，第 12 项重复不为 0 | 行进与营火不留；留下与重播都查新鲜度；补测 |
| （第二轮）危急解围读到治疗后的生命，从不触发 | 用治疗量回推；测试改为先改生命再发事件（与战斗相同的次序），对旧代码会失败 |
| （第二轮）留下的段按时间与编号播，绕过选择规则 | 按 优先级 × 新鲜度；补测（编号在前的低优先级段后播） |
| （第二轮）初到某地的段在别处播 | 只在它的地点播；补测 |
| （第二轮）关系与换幕的上升沿留下同类全部段 | 起因点名的只留它自己 |
| （第二轮）别人身上的散开圈，守点会把同伴拉回去 | `dangerAt` 算别人的散开与追踪圈，守点与跟随都绕开（`needsOrder` 的在下令前不算）；用例改为逐 tick 断言不进圈 |
| （第二轮）演员算进了等在门口和倒地的同伴 | 只算同图、站着、在队里的 |
| （第二轮）内置 AI 的姿态变化发 `party.order`，会完成教程步骤 | 改发 `party.tactics`（见决定）；补测 |
| （第二轮）选了跟随的护卫型同伴在玩家受伤时袖手；跟随的夜羽不打护盾 | 见决定；补测（关掉护卫或护盾一步时用例失败） |
| （第二轮）战斗开始时也给等在门口的同伴选姿态 | 只给在队里的 |
| （第二轮）施放者已不在的预警被当成无害 | 照样算危险 |
| （第二轮）营地谈话在战斗中也行 | 战斗中拒绝（`in_combat`） |
| （第二轮）加载校验缺：初到某地的段没写地点、关系段不足两人 | 补校验与用例 |
| （第二轮）重播跳过营火的每晚段数 | 营火的段数不跳过 |
| （第二轮）缺测：作废的不同场、睡眠时长、存档往返 | 补测 |
| 未处理的发现 | 转第 3 节或第 4 节 |

## 3. 留给后续包的事项与请求

| 序 | 事项 | 建议归属 |
| --- | --- | --- |
| 1 | `ln_party` 的行进与营火段：现有 2 段行进、3 段营火（其中 4 段可重复），整幕按每游戏小时不少于 1 段且重复为 0 不够用；请按第一幕各地与各晚补写行进与营火段（数据行在 `data/party/banter.json`，本包可以照单加行），槽位约定见第 2 节 | PK-M1-29（台词），本包或其后续包加数据行 |
| 2 | 澱巨像的灰壳 `ash_shell` 现在是 `breakBy: damage`；第一幕第 10.4 节要"鸦群扑面"击碎，请改为 `breakBy: ability`、`breakRef: sk_yeyu_ravenswarm`，并定夜羽不在队时这层壳怎么破（吸收量是否仍可被伤害打穿） | PK-M1-30（`data/combat/monsters.json`），涉及战斗规则时 PK-M1-12 |
| 3 | 关系触发没有来源：`npc.relation_changed` 只在对玩家的关系变化时发，同伴之间的关系越过阈值没有事件，`relation` 种类的闲聊（现在没有）无从触发 | NPC 社会的后续包（PK-M1-18 的归属）或同伴后续包 |
| 4 | `tide.act` 没有拍次或版本号，也不核对回答者是不是该行动方的人；请兽潮系统给命令加拍次（或版本）并在来源是模型或回退时核对 `agentId`；可选：`tide.phase` 事件带上各行动方的合法行菜单，NPC 大脑就不必导入 `tide/night` 与 `tide/rules` | PK-M1-52 的归属（兽潮系统） |
| 5 | 界面：闲聊的显示与回应按钮（`party.banter`、`party.banter_ask`、`party.banter_reply`）；营地谈话、探望的动作；内置 AI 本场姿态的显示（`party.tactics`）；姿态"交还给同伴自己判断"的开关（`party.auto_stance`，现在没有客户端发它） | PK-M1-23、PK-M1-57 |
| 6 | 寻路绕开危险区：现在只保证终点（接近点、守点、落脚点）安全，路线可能穿过危险区 | 世界与战斗的寻路（PK-M1-16 或 PK-M1-12） |
| 7 | 危急解围的"解围"一支（玩家击退正在打低血同伴的敌人）未做，只做了治疗 | 同伴的后续包 |
| 8 | 铁人模式下外部写 `major` 使在场同伴倒下即死，`npc.<人>.injury` 留在 `major`；同一人二次 `major` 不延长照料钟 | 同伴的后续包 |
| 9 | 第 12 项接进活世界验收夹具与自动玩家的汇总（多种子、整幕），见第 5 节 | PK-M1-42 |
| 10 | 开场意图"站到玩家身边"的 3 秒里不还手 | 待平衡（PK-M1-42） |

## 4. 需用户决定

| 序 | 事项 | 现状 | 选项 |
| --- | --- | --- | --- |
| 1 | "鸦群"的数值 | 射程 10、冷却 30 秒、幽相、失明 3 秒（沿用 PK-M1-15 的取值，已写进技能目录第 2.13 节） | 确认；或另给数值 |
| 2 | 玩家下过姿态后内置 AI 的让位范围 | 一直让位，直到 `party.auto_stance` 交还（第一幕教程会让玩家下一次姿态指令，之后内置 AI 就不再给收到指令的同伴选） | 保持；或玩家的姿态只管下一场（之后回到内置 AI） |
| 3 | 闲聊回应的羁绊幅度 | 按第一幕台词目录：`a1_campfire_letters` 的"打开看看"夜羽 -2，`a1_after_tide` 罗恩 +2；同伴第 8.4 节写 ±1 | 按目录（现状）；或统一 ±1 并改目录 |
| 4 | 探望的地点 | 私有地图（庭院）或诊所 | 保持；或只在庭院 |
| 5 | 营地谈话的条件 | 夜里、营地或床边（客栈、私宅）、羁绊 40 起、每晚一名 | 保持；或只在营地 |
| 6 | 兽潮之夜无模型时的选行 | 内核自己的规则（已选且合法的行，否则表上第一条合法行）；行动表本身按人物状态写了条件 | 保持；或按内置 AI 第 5.8 节逐人算效用（需要行动表每行补立场、安全、价值观的属性） |

## 5. 未跑的测试（延后）

| 测试 | 原因 | 建议 |
| --- | --- | --- |
| `npm test` 全套 | 按本会话要求不跑 | 主会话合入前跑 |
| `npm run playthrough` 与各自动玩家路线 | 按本会话要求不跑 | 主会话合入前跑；看第 6 节 |
| 第 12 项的多种子整幕验收（发行内容加 `ln_party`） | 发行内容的行进与营火段不够（第 3 节第 1 行），跑了也不会过；夹具版本在 `tests/party_banter.test.ts` | 第 3 节第 1 行补齐后由 PK-M1-42 接进活世界夹具 |
| 有模型时的 `companion.tactics` 与 `npc.decision_point`（兽潮选行） | 只跑了无模型档 | PK-M1-42 的网络档回归 |
| `tests/architecture.test.ts`、`tests/i18n_kernel_guard.test.ts` | 跑了，失败都在他包的文件（`src/systems/dialogue/lines/repetition.ts` 的 DOM、`src/systems/dialogue/intent/head.ts` 的中文字面量、语言目录新文件清单），与本包无关 | 由各自的包处理后复跑 |

## 6. 对自动玩家与问题清单 T-01 的影响

- 自动玩家会发 `party.order`（来源玩家，平时 `assist`，长等待时 `passive`），发过之后内置 AI 不再给同伴选姿态；第一次下令之前的战斗里内置 AI 会选。
- `companionsReady`（`src/game/autoplay/fight.ts`）读的成员状态、单位与生命都没有改；`tests/autoplay_party_ready.test.ts` 10 个用例通过。
- 会改变战斗过程的改动：避险（只认敌方预警、别人的散开圈、落脚点避开全部危险）、护卫型同伴的跟随、视野内先打可击碎的护盾、开场意图。T-01 的三条路线卡在第一幕若复查，请把本包算作可能的时序来源之一。
