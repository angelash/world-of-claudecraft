# PK-M1-54 序章舞台机制与造像：验收与证据

> 入口见 [README.md](README.md)；进度与汇报见 [progress.md](progress.md)。状态只用 PASS、FAIL、VERIFY、N/A。

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS：包行三条验收都有证据；遗留见 [progress.md](progress.md) |
| 末次代码或内容变更 | 未提交；改动文件见 [README.md](README.md) 第 6 节 |
| 完整实跑 | 2026-11-17，共享工作区（含其他并行包的未提交改动，见第 4 节） |
| 审查 | 新起会话的覆盖审查一份：2 条 BLOCKING、18 条 SHOULD-FIX、若干 NIT；处理见第 3 节 |

## 1. 验收条目

### 1.1 包行验收：序章三处机制与运行器各增补项的单测

| 序 | 条目 | 测试 | 覆盖 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | P2 每个转角重现的门 | `tests/client_prologue_stage.test.ts`"P2" | 计数到状态（关着、转角 1 与 2、开缝有风、推开）、门光逐次增强、没有门时为空；在真实序章数据上转身三次与推门两条路径；进入白场时门卡撤下 | PASS |
| 2 | P5 按距离分档的偷听 | 同文件"P5" | 四种姿态到档位，咳嗽的噪声降档，`listen_end` 与场景切换清档；经故事帧的 `listen` 输出（会话据此调用 `GameAudio.setListenTier`），远档人声淡一档 | PASS |
| 3 | P15"伸手"键 | 同文件"P15"、`tests/scenes_runner_additions.test.ts`"the prologue fall…" | `reach_out` 绑在对话情境（E、RB）且无冲突、手柄覆盖完整；坠落节点无编号列表、只有按键提示，按下选中并写 `p_reached_out`；30 秒不按自动选"什么也不做"、不写旗标 | PASS |
| 4 | `ui` 效果 | `scenes_runner_additions`"ui effect" | 选项打开界面后等待、其余效果照常；过期修订与错误界面被拒；灵镜结果写外观与造像串；不合规结果整份拒收、什么也不写；不带结果关闭保留外观；节点自身的 `ui` 在台词之后打开，关闭后按分支或下一节点走 | PASS |
| 5 | 软硬回合上限 | `scenes_runner_additions`"multi-turn input"、"review hardening" | `roundEnd` 三种结束；`closed`、`soft`、`hard` 三条路径与 `wrapUp`；无模型时写定回应即收束；只存首轮原话，轮中空输入拒收；女神答者的题面带 `scenes.resolve` | PASS |
| 6 | 限时选择 | `scenes_runner_additions`"timed and keyed choices" | 视图带 `hidden`、`key`、`timeout`；按 tick 到时自动选中；先选则取消计时；重放一致（世界哈希） | PASS |
| 7 | 分段场景与段标记 | `scenes_runner_additions`"segments…"；`client_prologue_stage`"reads a segment summary…" | 段旗标进段、`scene.segment` 事件、段梗概（无则用整场）；跳过梗概卡读段梗概 | PASS |
| 8 | 战斗吠叫 | `scenes_runner_additions`"says combat barks…" | 波次出现与肃清、首领阶段（指定阶段）、首领倒下；默认一次、`repeat` 每次；条件不满足不说也不算用掉；切片记录 | PASS |
| 9 | 重选序章开场 | `scenes_runner_additions`"re-choosing the prologue opening"、"keeps scenes others queued…"；`client_prologue_stage`"starts the stage afresh…" | 清 `p_` 旗标（含门提示）、收回遗物与号码牌、从开场重播并能选别的开场；进入面试段后不再提供；队列保留；`scene.restarted` 列出清掉的旗标；客户端按新运行重置舞台并交还音频 | PASS |
| 10 | `sceneView` 改用叙事解析器 | `scenes_runner_additions`"the view reads calendar terms…" | 以 `hour == 6` 为条件的选项在视图与运行器两边一致（旧解析器下视图会漏掉它） | PASS |
| 11 | 内容校验的新规则 | `scenes_runner_additions`"the validator names every broken rule…" | 十九条规则各一个反例；现有全部场景通过 | PASS |

### 1.2 包行验收：造像结果存档往返

| 序 | 测试 | 覆盖 | 状态 |
| --- | --- | --- | --- |
| 1 | `client_prologue_stage`"round-trips through a save" | 真实序章走到灵镜，交回造像结果；存档序列化与读回后造像串解码为同一造像、玩家外观等于组装结果；读回的世界继续运行 40 tick 与未中断的世界哈希一致 | PASS |
| 2 | `client_prologue_stage`"encodes and decodes every look…" | 200 个随机造像与每行每个选项编码解码一致，且内核全部接受（灵镜做不出被拒的结果）；旧格式与未知选项的退化 | PASS |

### 1.3 包行验收：纸娃娃组装与无素材时的占位一致

| 序 | 测试 | 覆盖 | 状态 |
| --- | --- | --- | --- |
| 1 | `client_prologue_stage`"with no art the assembled look is the placeholder, bit for bit" | 四种动作乘四个方向：缓存键与程序化键相同、帧与 `generateFrame` 逐像素相同；带纸娃娃配方与不带配方的占位相同 | PASS |
| 2 | "keeps the placeholder while any named part is missing" | 缺一个部件时不组装，帧与键都是占位 | PASS |
| 3 | "composes every approved part…" | 部件齐全时组装：尺寸与锚点取服装帧，头部件落在人台颈部，发色按色槽换成造像的发色；运行时改用组装帧与 `doll:` 缓存键 | PASS |
| 4 | "recolours only the key colours…" | 只换色槽表里的颜色；四档到明暗阶的对应（0 为描边）；皮革、金属、点缀三个固定色槽也换 | PASS |

## 2. 通用检查

| 检查 | 命令 | 结果 | 状态 |
| --- | --- | --- | --- |
| 本包测试 | `npx vitest run --config vitest.config.ts tests/scenes_runner_additions.test.ts tests/client_prologue_stage.test.ts` | 2 个文件 44 项通过 | PASS |
| 相关测试 | `tests/scenes.test.ts`、`client_story`、`client_purity`、`client_input_bindings`、`client_keymap_contexts`、`client_assets`、`client_sprites`、`client_adapters`、`client_gamepad_playthrough`、`client_settings_shell`、`i18n_ui_guard`、`i18n_kernel_guard`、`architecture`、`content_id_guard` | 全部通过 | PASS |
| 类型检查 | `npm run typecheck` | 0 个错误 | PASS |
| 内容校验 | `node tools/content/validate.ts` | V1 到 V10 全部 0 错误 | PASS |
| 注册表 | `node tools/registry/build.ts --check` | 37 项通过 | PASS |
| 文本检查 | `node tools/i18n/check.ts` | 0 条发现 | PASS |
| 默认套件 | `npm test` | 158 个文件中 154 个通过；3188 项中 3182 项通过、2 项跳过、4 项失败，均不属本包（第 4 节） | PASS |
| 无模型通关 | `npm run playthrough` | 见第 2.1 节 | PASS |
| 改动文件格式 | `npm run format -- <本包文件>` | 本包文件无剩余问题（`src/game/autoplay/player.ts` 另有一条早已存在的警告，不在本包改动的行） | PASS |
| 禁用字符 | 扫描本包全部文件 | 0 处 | PASS |

### 2.1 无模型通关

| 命令 | 结果 | 状态 |
| --- | --- | --- |
| `npm run playthrough` | 11 个文件中 6 个通过、1 个跳过、4 个失败；序章到结局的通关（`release`、`rule_merca`）、`act1_minimal`、`text_golden`、`replay`、`replay_segments`、`npc_disputes` 全部通过；失败的 4 个是 `npc_alive_1` 到 `npc_alive_4`（第一幕 NPC 活性指标"下一个镇的传闻传到"一项未达阈值，属 PK-M1-18，见第 4 节） | PASS |

## 3. 审查

| 角色 | 结论 | 处理 |
| --- | --- | --- |
| 新起会话的覆盖审查 | 2 条 BLOCKING、18 条 SHOULD-FIX、若干 NIT | BLOCKING 全修：坠落节点只有按键提示时"选项已显示"恒为假，键盘与手柄按"伸手"被吞（按键提示也算可选）；重选开场后同一场景不重置舞台，偷听与门卡带进新开场（视图带 `runId`，舞台按运行重置并交还音频）。SHOULD-FIX 已修：多轮的 `done` 与收尾写进题面，女神答者带 `scenes.resolve`；多轮只存首轮原话、轮中空输入拒收；节点自身的 `ui` 在台词读完后才打开；灵镜预览按整个造像串重画；灵镜结果只许四个纸娃娃字段并限长；跳过梗概读段梗概；咳嗽姿态先中档、咳嗽后远档；换色补皮革、金属、点缀与描边阶；灵镜的手柄映射与键盘按键（随机、还原、转向）、键盘不再触发对话动作；客户端只经场景视图读运行与修订；新校验规则各有反例；按键动作有内核表并校验；重选开场不清别人的队列；只有按键提示时不显示选择提示。转遗留：脸部层与性别、各体型的服装条、重选开场后保留外观与名字、灵镜的专用输入情境（见 [progress.md](progress.md)） |

## 4. 本包以外的失败（共享工作区，2026-11-17 实跑）

| 测试 | 原因 | 归属 |
| --- | --- | --- |
| `tests/art_manifest.test.ts` | 已知基线：素材清单与文件不一致 | 第三方素材工作 |
| `tests/npc_brain.test.ts`"holds the service on the holy day…" | NPC 大脑正在改动 | PK-M1-18 |
| `tests/time_skip.test.ts` T-09 | 同一轮里失败，单独重跑通过；战斗与 NPC 并行改动期间时有时无 | 并行包 |
| `tests/docs_guard.test.ts` | 实跑时本文件尚未写成（README 链接到本文件）；写成后单独重跑通过 | 本包，已解决 |
| `tests/playthrough/npc_alive_{1,2,3,4}.playthrough.test.ts` | 第一幕 NPC 活性指标的传闻扩散一项未达阈值（例：种子 1"next town in 4.99 days"） | PK-M1-18 |
