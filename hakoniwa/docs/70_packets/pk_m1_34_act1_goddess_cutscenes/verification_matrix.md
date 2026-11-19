# PK-M1-34 第一幕女神与过场：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（十四场过场与改名、运行器增补、女神六包、神谕类槽位、史料道具、音频调用都落地并有测试；客户端执行新演出指令、导演在过场里认神临与梦境、女神目录第一幕其余需要新机制的动作与反应行、史料的取得点与阅读写入转后续，见 `progress.md` 第 3 节） |
| 末次代码或内容变更 | 未提交；改动文件清单见 `progress.md` 第 2 节 |
| 完整实跑 | 2026-11-19；工作区状态（未提交，与他包并行的同一工作区） |
| 审查 | 新起子代理的覆盖性复查一轮，发现与处理见 `progress.md` 第 2 节 |
| 遗留 | 见 `progress.md` 第 3 节 |

## 1. 验收条目

计划包行验收栏："女神目录第 17.1 节校验通过；必达节点 100% 落地"。

| 序 | 验收 | 证据 | 状态 |
| --- | --- | --- | --- |
| 1 | 女神目录第 17.1 节：第 1 条（动作存在、字段齐、数值是数） | `node tools/content/validate.ts` V1 0 错误；`tests/goddess_act1_content.test.ts` "load clean through the goddess pack validation"（动作、谋划、反应与动作台词槽的问题为空） | PASS |
| 2 | 第 17.1 节：第 2 条（修正项通道在登记表、有期限） | 同上；新动作 `div_sylvie_migration` 的 `travel` 通道 168 小时 | PASS |
| 3 | 第 17.1 节：第 3 条（越约硬闸：希尔薇无可越约动作等） | 未过：旧动作 `calamity`（希尔薇）、`miracle` 仍带可越约标记；改动要先改 `tests/goddess.test.ts` 的越约用例（`progress.md` 第 3 节第 3 行） | FOLLOWUP |
| 4 | 第 17.1 节：第 5 条（写定神行节点的兜底台词槽存在） | `src/content/packs/goddess.ts` 的神行槽位检查（PK-M1-20）；`goddess_beats.test.ts` 全过 | PASS |
| 5 | 第 17.1 节：第 6、7 条（谋划可解析、反应行可解析） | V1 0 错误；盐季谋划的情报步与中止 `goddess_act1_content.test.ts` 第 9 组 | PASS |
| 6 | 第 17.1 节：第 4、8、9、11 条（敌对预算、试炼、委托模板、运营天启） | 第一幕敌对与越约为 0，试炼与运营天启第一幕没有；委托模板随 PK-M2-11 | 不适用 |
| 7 | 第 17.1 节：第 10、12 条（供品与回礼、禁名与台账扫描） | PK-M1-20 的供品检查未动；`node tools/content/validate.ts` V5 本包文本 0 错误（V5 两条是已提交的 `goddesses.json` 雅努称号，第 2 节） | PASS |
| 8 | 必达节点 100% 落地 | DB-A1-05（门口的梦）`tests/goddess_beats.test.ts` "plays the dream at the door through and lands DB-A1-05"：经 `cut_a1_dream` 走完后 `state: done`；DB-A1-01、03、04、06 等 PK-M1-20 的用例全过；20 个种子的整幕指标属延后的 `goddess_alive_*`（`progress.md` 延后的测试） | PASS（单测）；多种子延后 |

### 1.1 计划包行的范围条目

| 条目 | 证据 | 状态 |
| --- | --- | --- |
| 第一幕十四场过场 `cut_a1_` | `tests/act1_cutscenes.test.ts`：十四个编号、幕、演出、梗概与目录第 13.9 节一致；每个节点从起点或段起点可达、无悬空跳转；每场以首个与末个可选项各走一遍到结束；八个旧编号不存在；引用它们的任务与幕定义已改名（V2 0 错误） | PASS |
| 史料道具 H01 起 | `tests/lore_documents.test.ts`（12）：七件物品的种类、标签、可读标记；知识条目在条件成立前锁住；凡人词表；`lore_h03` 由 `cut_a1_wake` 给出 | PASS；取得点与阅读写入 FOLLOWUP |
| 神谕与梦境调用 `GameAudio.setDivine`、`setDream` | `tests/client_divine_audio.test.ts`（4）：她说神谕类台词时她的主题、名讳未显者不放、梦境舞台放梦境曲、过场外为空、只在变化时调用；每位已名女神的主题是登记的音乐编号 | PASS；导演优先级 FOLLOWUP |
| 幕间吠叫写成场景 `barks` | `act1_cutscenes` "hang on real waves and bosses"：吠叫挂在真实的波次与首领上，按事件说出 | PASS（51 句；3 句无事件可挂） |
| 序章转来的运行器增补 | `tests/scenes_pk34_runner.test.ts`（20）：触发、演出定时与条件、归类结算、`once` 用尽不循环、无答者归类、说明校验、锚点每次运行一次、抽取白名单、模型不能声称写定、重选开场重置（夹具）；`tests/prologue_content.test.ts` 用真实序章数据测重选开场清名字、外观与序章任务 | PASS |
| 演出增补：转场、中途静帧、按台词定时、条件指令 | 内核与视图：`scenes_pk34_runner` "stage timing" 三例；内容校验拒收错的下标、转场种类与静帧编号 | PASS（内核）；客户端执行 FOLLOWUP |
| 序章末 `then: cut_a1_wake` | `prologue_content` "chain from the opening act into act 1"：`then` 与第一幕 `introScene` 相同 | PASS |
| 场景说话者登记进 `speakers.json` | V2 0 错误（全部场景台词的说话者都可解析） | PASS |
| 审读 PK-M1-20 的女神占位台词；神谕、托梦、征兆从神谕类槽位取 | `goddess_act1_content`：动作数据登记的槽位与表一致（含雅努的梦）；规划器传槽位不传句子；模型不能传槽位、内核也不能传未登记的槽位；每个槽位在第一幕取到她包里的文本键；`goddess_brain` "lets Janu dream"：雅努的梦是 `ln_janu` 的文本键 | PASS |

## 2. 检查命令与结果（2026-11-19，末次变更之后）

| 命令 | 结果 | 本包相关 |
| --- | --- | --- |
| `npm run typecheck` | 他包文件有错误（`src/client/windows/`、`src/client/hud/dungeon_bar*`、`src/client/hd2d/entities.ts`、`src/client/render/overlay_painter.ts`、`src/client/app/act1_wiring.ts`、`src/systems/doors/purify.ts`、`tests/client_tutorial.test.ts`，都是他包未提交的新文件或同期改动） | 本包文件 0 错误 |
| `node tools/content/validate.ts` | V1、V2、V3、V4、V6、V7、V9、V10 0 错误；V5 2 错误；V8 16 错误 | V5 两条是已提交的 `goddesses.json` 雅努称号与尊名（本包未改该文件）；V8 十六条全是台词批次未跟踪的吠叫池 `bark_*.json` 的偏好覆盖；本包 0 错误 |
| `node tools/registry/build.ts --check` | current（728 名，128 族） | PASS |
| `node tools/i18n/check.ts` | 0 findings（2695 key uses） | PASS |
| `node tools/i18n/extract_content.ts`、`gen_keys.ts` | 16209 个内容键；3752 个文本键 | 已重生成 |
| 禁用字符扫描（本包写过的 29 个文件） | 0 | PASS |
| `npx vitest run --config vitest.config.ts`（README 第 7 节的 26 个文件） | 见下表 | |

| 测试文件 | 结果 | 说明 |
| --- | --- | --- |
| `act1_cutscenes`、`scenes_pk34_runner`、`scenes_runner_additions`、`prologue_content`、`goddess_act1_content`、`goddess_brain`、`goddess_reactions`、`goddess_beats`、`goddess_region`、`director_menu`、`director`、`lore_documents`、`lines_coverage`、`act1_quests`、`client_story`、`client_adapters`、`client_prologue_stage`、`client_stage_direct`、`client_divine_audio`、`client_purity`、`content_id_guard` | 全过 | 本包新增与改动的测试 |
| `lines.test.ts` "a violating pack in the content fails V8"、`content_validation.test.ts` 两例 | 失败 | V8 吠叫池（台词批次）与 V5 雅努称号（已提交数据），见上 |
| `goddess.test.ts` "keeps every goddess prompt free of locked knowledge at the start of every act" | 失败 | 整局走查停在第一幕；本包前已失败（PK-M1-52 `progress.md` 已记），属延后的整局路线 |
| `architecture.test.ts` "systems/ has no DOM access"、`i18n_kernel_guard.test.ts` 两例 | 失败 | 分别指向 `src/systems/dialogue/lines/repetition.ts`、`src/systems/dialogue/intent/head.ts` 与新增的 `locales/zh-Hans/ui_*.json`、`tut.json`，都不是本包文件 |

末次实跑：`Test Files 5 failed | 21 passed (26)`，`Tests 7 failed | 625 passed (632)`。本包的 21 个文件全部通过，失败的 7 例都落在上表列出的他包文件或已知的整局走查。

## 3. 延后的测试

见 `progress.md` 第 2 节"延后的测试"。
