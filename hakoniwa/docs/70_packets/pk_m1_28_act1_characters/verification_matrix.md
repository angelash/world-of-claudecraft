# PK-M1-28 第一幕人物与人设卡：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（第一幕 44 名有名人物与 17 个居民模板落成数据；本包内容的 V1 到 V10 无错误；遗留见 `progress.md` 第 3 节） |
| 末次代码或内容变更 | 未提交；改动文件见 `progress.md` 第 2 节 |
| 完整实跑 | 2026-11-18，与他包并行的同一工作区；按用户的安排只跑下表的命令，全量 `npm test` 与 `npm run playthrough` 延后（`progress.md` 第 5 节） |
| 审查 | 新起子代理的覆盖性复查一轮（十条发现：七条真并已修，一条已被现有链路覆盖，两条记为后续），见 `progress.md` |

## 1. 验收条目

计划包行验收栏："V1 到 V10 全绿；每人有日程与台词包引用"。

| 序 | 条目 | 证据 | 状态 |
| --- | --- | --- | --- |
| 1 | 41 名有台词包的第一幕人物与 3 名系统补位人物都有人设卡：地图存在、日程可解析、一到三个角色；台词包本身由 PK-M1-29 落地并在其测试里逐人钉住 | `tests/npc_act1_cast.test.ts` "gives each of the 44 act-1 named people a card..." | PASS |
| 2 | 目录审计：35 张旧卡的角色码与目录第 2.1 节逐人一致；"建"的潜质补齐；新卡的潜质与角色 | 同上 "writes the catalog potentials and roles of the act-1 audit"；逐人比对记录在 `progress.md` | PASS |
| 3 | 诺伊与苔丝的实体带 `door_mark`，其余第一幕人物不带 | 同上 "tags the door-marked children..."（整局 `createGame`，读实体标签） | PASS |
| 4 | 夜羽与阿什没有 NPC 实体，有心智与信任；`trust.yeyu` 开局 40、`trust.ash` 50；招募夜羽后仍不生成 NPC 实体；夜羽第一幕 K0，阿什不收敛气息。反证：去掉 `body` 后夜羽在封门深层生成实体，招募后为 `recruited` | 同上 "keeps Yeyu and Ash as minds and trust flags without an NPC body"、"spawns Yeyu as an NPC once her card loses the body field" | PASS |
| 5 | 对战斗的固定存在阿什（`fixture_ash`）可以开口 | 同上 "opens a talk with the Ash of the combat fixture..."（`dialogue.opened` 的 `npcRef` 为 `ash`） | PASS |
| 6 | 独眼团与驿卒的住处：瑟格在旧哨村哨塔、克努特与卡斯在折桥驿、乌尔夫在南门驿站；弗里茨第一幕不出现；瑟格每七夜 21 点去镇北灰路口接头，独眼团结局落定后放弃 | 同上 "puts the One-Eye gang on its own maps..."、"sends Seg to the ash road every seventh night..." | PASS |
| 7 | 跨图日程：猎户 6 点在林缘猎营、13 点回东坡；伐木工 9 点在伐区；矿工 9 点在镇北矿工棚、22 点回边石镇矿工棚；走私者 22 点与 2 点在镇北灰路口、8 点在折桥驿；弗里茨 9 点在镇北矿工棚、22 点回旧哨村 | 同上 "cross-map schedules" 三个用例 | PASS |
| 8 | 17 个模板有档位、知识层级、潜质、凡人不信参数与分布表，字段校验无问题；档位、等级、夸大、潜质概率与代码、阈值、解释顺序、旧秩序依赖逐值等于目录第 6 节两张表 | 同上 "ships the 17 act-1 templates..."、"copies the catalog numbers of each template" | PASS |
| 9 | 居民编号 `res_tpl_<模板>_<n>`（矿工 3 人；拾荒者跨折桥驿与荒原两个分布连续编号 1 到 5）、带模板的知识层级；台词回退链的模板层为 `ln_tpl_miner`；话题的知识层级 K1；旧单图行 `res_bs_orphan_1` 不变；没落图的模板不生成居民 | 同上 "numbers residents across placements..." | PASS |
| 10 | 坏的模板行与 `body` 被校验报出（缺分布表、未知地图、未知地点、未知潜质、未知知识层级、未知身体归属） | 同上 "refuses a broken template row"、"refuses an unknown body owner" | PASS |
| 11 | V1 到 V10 | `node tools/content/validate.ts`：V3、V6、V7、V8、V10 无错误；V1、V2、V4、V5、V9 的错误全部来自场景、任务与女神数据（他包进行中，见第 2 节），本包的表（`npcs`、`npcResidents`、`npcSchedules`、话题的场外演员表）无错误 | PASS（本包范围） |
| 12 | 内容 ID 守卫：人物 ID `ash` 与内核词表的已审例外只此一对 | `tests/content_id_guard.test.ts` 两个新用例；系统允许名单仍为空 | PASS |

## 2. 命令与结果

复查修复之后的末次实跑（同一工作区，他包并行进行中）：

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `node tools/content/validate.ts` | V3、V6、V7、V8、V10 ok；V1 11 个错误、V2 13 个、V4 6 个、V5 2 个、V9 13 个。逐条看过：V1、V2、V4、V9 是场景 `cut_a1_*` 与任务 `q_a1_*` 互相引用尚未落地的场景 ID、`lore_h03`、`act1_intro` 与自动玩家路线表（PK-M1-33、PK-M1-34 进行中）；V5 两条是 `goddesses:janu` 称号与尊称里的锁定词（PK-M1-34）。没有一条落在本包的表 |
| `node tools/registry/build.ts --check` | 失败：`tests/registry.test.ts` 37 个用例中 2 个，六条规则问题全是 `cut_a1_wake`、`cut_a1_ash_glimpse` 的写入（场景数据，他包） |
| `node tools/i18n/check.ts` | 0 finding，2391 key uses scanned |
| `node tools/i18n/gen_keys.ts --check` | `src/core/text_keys.generated.ts is current`（3029 keys） |
| `node tools/i18n/extract_content.ts` | 重生成 `locales/zh-Hans/content.generated.json`（9328 keys，71 张表） |
| `npx vitest run --config vitest.config.ts tests/npc_act1_cast.test.ts tests/npc.test.ts` | 2 个文件，40 passed |
| `npx vitest run --config vitest.config.ts tests/npc_brain.test.ts tests/world_mechanics.test.ts tests/content_id_guard.test.ts tests/dialogue_topics.test.ts tests/npc_society.test.ts` | 111 passed、1 failed：`content_id_guard.test.ts` 的"resolves every id of the route table"报 `autoplay prefer: node choose has no choice evidence`（场景节点 `choose` 的选项，自动玩家路线表，他包） |
