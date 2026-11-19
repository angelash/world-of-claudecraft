# PK-M1-21 内置 AI：同伴战斗与闲聊（别名：内置 AI 第 10 步）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-21` 内置 AI：同伴战斗与闲聊 |
| 状态 | 进行中（建议主会话改为已完成，依据见 `verification_matrix.md`；遗留转去的包见 `progress.md` 第 3 节，待用户定的事项见第 4 节） |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-21` |
| 形态 | 小包三件（单会话完成，范围由计划包行与内置 AI 第 19 节第 10 步写定，另含 PK-M1-15、PK-M1-52 转来的事项） |
| 工作流 | AI |
| 量级 | 3 代理人日，0.3 用户人日 |
| 依赖 | PK-M1-15（已完成：六层行为树、四姿态九指令、重伤退场、反应延迟）；PK-M1-12（已完成：地面预警、点名、地形机关、护盾的 `breakBy`）；PK-M1-52（兽潮之夜的行动表与 `tide.act` 接缝）；PK-M1-29（台词包 `ln_party`，本包只定槽位与触发） |
| 立项日期 | 2026-11-18 |

## 1. 目标

同伴在战斗之间有了内置 AI 的姿态选择（人格权重乘 3 加队伍状态、保护、敌情、惯性，开场意图随姿态），模型可以经 `companion.tactics` 改；同伴会躲地面预警、点名与机关区，`needsOrder` 的点名等玩家下令；夜羽的"鸦群"击碎写明由它击碎的首领护盾；队内闲聊有了触发、选择、节奏、打断与回应点，活世界第 12 项有了计数口径；重伤与 `npc.<人>.injury = major` 有了照料与痊愈；营地谈话、危急解围、探望、轻伤在床上睡一夜后痊愈这些羁绊与照料来源接上；兽潮之夜有名有姓的人经 NPC 大脑或模型用 `tide.act` 选行。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据 |
| --- | --- | --- | --- |
| 1 | 姿态得分（亲和乘 3，全队充足偏协助 +2，补给不足或连续两场苦战偏原地 +2，玩家不足一半生命偏跟随 +3，敌情 +1，惯性 +1；被动不自动选）；每场战斗开始时内置选择与开场意图（爆发或控制、增益、站到玩家身边）；`companion.tactics` 请求与回退；玩家下过姿态则以玩家为准，`party.auto_stance` 交还；姿态只管这一场，战后回到同伴自己的姿态 | `src/systems/party/tactics.ts`；`ai.ts`（开场一步、护卫的跟随）；`commands.ts`（`party.stance`、`party.auto_stance`） | 内置 AI 第 11.1 节；同伴第 7.2、7.4 节 |
| 2 | 避险层：敌方地面预警、自己与别人的点名（散开、集合、追踪）、首领机关区；反应延迟；`needsOrder` 等玩家的散开或移动指令；落脚点同时避开全部危险与不可走的格；接近目标与守点不走进危险；预警的施放者已不在时照样算危险 | `src/systems/party/danger.ts`；`ai.ts` | 同伴第 7.5 节；战斗第 10.3、10.5、10.6 节 |
| 3 | 人格的战术细调：希雅放过逃跑的野兽（规则 `spare`）；护人高的同伴先拆打玩家的敌人；协助先打玩家的目标，再护治疗者，再护全队 | `ai.ts`；`data/party/companions.json`（希雅的规则） | 同伴第 7.4 节；内置 AI 第 11.1 节 |
| 4 | 夜羽"鸦群"：命中（不掷伤害）即击碎写明 `breakBy: ability`、`breakRef: sk_yeyu_ravenswarm` 的护盾；同伴视野内有这样的护盾时先放这一手，不论姿态与自己的目标；技能目录登记 | `src/systems/combat/abilities.ts`（一处钩子）；`ai.ts`；`data/party/abilities.json`；`docs/40_design/content/catalog_abilities_talents.md` 第 2.13 节 | 战斗第 10.4 节；同伴第 6 节 |
| 5 | 队内闲聊：六种触发（初到某地、事件之后、行进、营火、关系、换幕）；选择 优先级 × 新鲜度 × 关联；一次性与可重复；节奏（探索每十分钟一段、行进每 30 游戏分钟一段、营火每晚至多三段）；一句四秒、回应点十五秒；战斗、对话、场景打断，同一段被打断两次作废；忙时来的起因留到下一个合适的时刻，且只在它自己的处境里播；羁绊 20 以下不聊 | `src/systems/party/banter.ts`、`banter_select.ts`、`places.ts`；`data/party/banter.json`（第一幕 20 段）；`data/party/config.json` | 内置 AI 第 11.3 节；同伴第 8.2、10.1 节；第一幕台词目录第 7 节 |
| 6 | 活世界第 12 项的口径：行进与营火的暴露时长（有同伴在身边、真的在走或在营火边的夜里），每小时段数与重复数 | `src/systems/party/banter_metric.ts` | 内置 AI 第 14.2 节 |
| 7 | 照料：同伴重伤时 `npc.<人>.injury = major`，回来时 `none`；外部写 `major`（兽潮之夜）时在场的同伴按剧情重伤退场，其余的人按照料天数（2 日）后痊愈；轻伤经他人治疗后在床上睡满四小时痊愈；探望（重伤一次 +1，只在庭院或诊所） | `src/systems/party/care.ts`、`places.ts`；`commands.ts`（`party.visit`） | 进度与节奏第 10.1、10.3 节；同伴第 8.4、11.3 节；变量注册表第 8.5 节 |
| 8 | 羁绊来源：营地谈话（夜里在营地或床边，羁绊 40 起，每晚一名同伴一次 +1）、危急解围（玩家治疗低于两成生命的同伴，每场一次 +1）、闲聊回应 | `banter.ts`（`party.camp_talk`）；`tactics.ts`（`noteRescue`） | 同伴第 8.2、8.4 节 |
| 9 | 兽潮之夜选行：有名有姓、行动表上有两行以上可选的人，在之后还有拍要选行的每一拍发 `npc.decision_point` 请求（菜单是合法行，建议是内核会取的行）；回退为空，无模型时内核自己的规则（已选且仍合法的行，否则表上第一条合法行）不受干扰；模型选的合法行从下一拍起生效 | `src/systems/npc/brain/tide_rows.ts`；`src/systems/npc/index.ts`（一个事件处理） | 第一幕剧情第 8.4 节；内置 AI 第 1.2、5.8 节 |
| 10 | 测试与验收 | `tests/party_ai.test.ts`、`party_banter.test.ts`、`party_care.test.ts`、`npc_tide_rows.test.ts`；`tests/party_save.test.ts`、`party_companions.test.ts`、`party.test.ts` 的改动 | 内置 AI 第 17 节 |

## 3. 不做

| 序 | 不做的事 | 归属 |
| --- | --- | --- |
| 1 | 队内闲聊的台词（`ln_party` 与一切台词包） | PK-M1-29（本包只定槽位、触发与选择，测试用夹具包） |
| 2 | 澱巨像灰壳改为由"鸦群"击碎的数据（`data/combat/monsters.json`） | PK-M1-30（请求见 `progress.md` 第 3 节） |
| 3 | 闲聊、营地谈话、探望、姿态交还的界面 | PK-M1-23、PK-M1-57 |
| 4 | 寻路绕开危险区（现在只保证终点安全） | 世界与战斗的寻路 |
| 5 | 兽潮行动行的逐人效用（内置 AI 第 5.8 节） | 待用户定（`progress.md` 第 4 节） |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| [builtin_ai.md](../../40_design/systems/builtin_ai.md) 第 11.1、11.3、14.2、19 节 | 本包的规则 |
| [companions_and_party.md](../../40_design/systems/companions_and_party.md) 第 7、8.2、8.4、10.1、11.3 节 | 姿态、羁绊来源、闲聊节奏、照料 |
| [combat_and_classes.md](../../40_design/systems/combat_and_classes.md) 第 10.3 到 10.6 节 | 预警、点名、护盾、机关 |
| [act1_borderstone.md](../../30_story/arcs/act1_borderstone.md) 第 8.4 节 | 兽潮之夜的行动表 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性 | 不抽签：姿态取最高分（同分按编号），闲聊按分数后按编号，危险落脚点按距离后按坐标；遍历都排序 | `tests/party_ai.test.ts` 与 `party_banter.test.ts` 的同种子同结果；`tests/architecture.test.ts` |
| 系统不写内容编号 | 营地、床、诊所、私有地图按地点种类、标签与地图职能判断；闲聊、护盾、点名都从数据来 | `tests/content_id_guard.test.ts` |
| 文本 | 闲聊只发内容键 `c.line_packs.ln_party.slots.party_<编号>.<序>`；拒绝原因与提示词是键 | `node tools/i18n/check.ts` |
| 存档 | 新字段（`fight`、`banter`、`care`、成员的 `stanceBase`、`stanceLast`、`treated`、`visited`、`opening`）都可缺省 | `tests/party_save.test.ts` |

## 5.1 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/party/`（`tactics.ts`、`danger.ts`、`banter.ts`、`banter_select.ts`、`banter_metric.ts`、`care.ts`、`places.ts`）；`src/systems/npc/brain/tide_rows.ts`；`data/party/banter.json`；上表测试文件；本目录 |
| 本包修改 | `src/systems/party/`（`ai.ts`、`index.ts`、`commands.ts`、`types.ts`、`config.ts`）；`src/content/packs/party.ts`；`data/party/config.json`、`companions.json`、`abilities.json`；`locales/zh-Hans/sys_party.json`；`tests/party.test.ts`、`party_companions.test.ts`、`party_save.test.ts` |
| 越界改动（写进 `progress.md`） | `src/systems/combat/abilities.ts`（一处钩子）；`src/systems/npc/index.ts`（一个导入、一个事件处理）；`locales/zh-Hans/sys_npc.json`（两个提示词键）；`src/content/references.ts`（两行引用）；`docs/40_design/content/catalog_abilities_talents.md`（第 2.13 节一行、第 5.2 节一句） |

## 6. 停止条件

[dev_process.md](../../60_production/dev_process.md) 第 3.6 节全部适用。

## 7. 验证命令

```
npx vitest run --config vitest.config.ts tests/party.test.ts tests/party_companions.test.ts tests/party_save.test.ts tests/party_ai.test.ts tests/party_banter.test.ts tests/party_care.test.ts tests/npc_tide_rows.test.ts tests/boss_mechanics.test.ts tests/tide_night.test.ts tests/autoplay_party_ready.test.ts tests/content_id_guard.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npm test
npm run playthrough
```

后两条（全套与自动玩家路线）本会话按要求未跑，见 `progress.md` 第 5 节。

## 8. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 覆盖性复查（新起子代理） | 必派 | 一次贡献结束；本包派了两轮 |

## 9. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、数据、测试、`verification_matrix.md`、`progress.md` | 主会话 | 抽看验证矩阵；本包验证命令绿 |
| `progress.md` 第 3 节的请求 | PK-M1-29、PK-M1-30、PK-M1-52 的归属、PK-M1-23 与 PK-M1-57、PK-M1-42 | 各自排期 |

## 10. 需用户决定

见 `progress.md` 第 4 节。
