# PK-M1-29 第一幕台词：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-19 | 实施、测试判定、复查 | 目录台词导入；7 个话题补句；`ln_party`；逐线索拒答表与低置信规则；写定说话者；最低覆盖与重复率；6 个失败用例逐条判定 | 未提交 | 见 `verification_matrix.md` | 用户决定吠叫池（第 4 节）；复查发现见第 2 节末 |

## 2. 汇报

### 2026-11-19

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `data/dialogue/lines/*.json` | 新增 132 个，修改 `ln_common`、`ln_class_clergy`、`ln_lina` | 目录转换后写入；三个旧包只追加句子与新槽位，旧序号与旧键摘要不变；六个女神包未动 |
| 同上 9 个包 | 修改 | 7 个话题补句（第 2 节"补句"）；四句改词避开台账泛词（`ln_nick`、`ln_martha`、`ln_toma`、`ln_nera`）；`ln_viro` 一处条件值改为注册名 `fled_wallenburg` |
| `data/dialogue/ledger_refusals.json` | 新增 | 29 行逐线索处理 |
| `data/npc/personas.json` | 修改 | 阿什加 `"scripted": ["act1"]` |
| `src/systems/dialogue/scripted.ts` | 新增 | `isScripted(content, npcRef, act)` |
| `src/systems/dialogue/lines/coverage.ts`、`repetition.ts` | 新增 | 最低覆盖与重复率 |
| `src/systems/dialogue/lines/index.ts` | 修改 | 导出上面两个模块 |
| `src/systems/dialogue/lines/packs.ts` | 修改 | `FallbackLayers.ownOnly`；`chainPackIds` 在 `ownOnly` 时只给本人包；`ownSlotSources`（一包内按幕覆盖与基础槽两个来源）；`slotSources` 用它 |
| `src/systems/dialogue/lines/select.ts` | 修改 | 先走完同一包的来源再离开该包 |
| `src/systems/dialogue/speak.ts` | 修改 | `speakerLayers`：写定说话者在写定幕返回 `{ ownOnly: true }` |
| `src/systems/dialogue/replies.ts` | 修改 | 规则模板 `line()` 对写定说话者从本人包取句，取不到给文本键的兜底；`AnswerResult.audit` 透传 |
| `src/systems/dialogue/session.ts` | 修改 | `requestReply`：写定说话者不请 `npc.dialogue` 模型，直接发写定句 |
| `src/systems/dialogue/topics/ledger.ts` | 改写 | 逐线索处理、`clueMisLine`、`ledgerRefusalProblems` |
| `src/systems/dialogue/intent/respond.ts` | 修改 | `refuseClue` 读表；低置信时强制 `unknown` 并写审计；`topicLine` 传当前幕；R1 先试中心词的话题；写定说话者的兜底取本人回避句 |
| `src/systems/dialogue/intent/head.ts` | 新增 | 中心词：`modifierEntities`、`onlyModifies` |
| `src/systems/dialogue/index.ts` | 修改（一行） | `dialogue.notified` 带上审计的原因与线索 |
| `src/systems/npc/types.ts` | 修改（越界，加法） | `PersonaCard.scripted?: string[]` |
| `src/systems/npc/chat.ts` | 修改（越界，三行） | NPC 之间闲聊：写定说话者不请模型 |
| `src/content/packs/npc.ts` | 修改 | 校验 `scripted` 的幕名；编辑器字段 |
| `src/content/packs/dialogue.ts` | 修改（共享） | 见下方"共享文件逐段" |
| `src/content/references.ts` | 修改（共享） | 同上 |
| `src/core/shared_events.ts` | 修改（共享） | 同上 |
| `tools/content/validators/lines.ts` | 修改（共享） | 同上 |
| `tests/dialogue_scripted.test.ts`、`dialogue_ledger_refusals.test.ts`、`lines_coverage.test.ts`、`dialogue_head.test.ts` | 新增 | |
| `tests/lines.test.ts`、`dialogue.test.ts`、`dialogue_topics.test.ts` | 修改 | 用例判定见下方 |
| `locales/zh-Hans/content.generated.json` | 工具重生成 | 15617 keys，71 张表 |

**共享文件逐段**

`src/core/shared_events.ts`：`'dialogue.notified'` 由一行改为多行，加两个可选字段：

```
    'dialogue.notified': {
      npcId: string;
      npcRef: string;
      notify: string;
      intent: string;
      /** an audit's reason: suspected_spoiler, ... (builtin_ai.md 6.6) */
      reason?: string;
      /** the lore ids the audited words named */
      clues?: string[];
    };
```

`src/content/references.ts`，本包只加两行（紧跟 `lore knowers[]` 一行）：

```
  { table: 'ledgerRefusals', path: 'clue', to: ['lore'] },
  { table: 'ledgerRefusals', path: 'by[].speaker', to: SPEAKER },
```

同文件里 `partyBanter` 两行与 `scenes` 的 `input.agentId`、`input.anchor[].speaker`、`input.classify.by`、`triggers[].mapId` 四处是他包（PK-M1-21、PK-M1-34）的改动，不是本包的。

`src/content/packs/dialogue.ts`，四段：

1. 导入 `ledgerRefusalsData`（`data/dialogue/ledger_refusals.json`）与 `{ type LedgerRefusalRow, ledgerRefusalProblems }`；
2. `validateDialogueContent` 末尾：`content.lore` 在时，用人设卡、同伴、场景说话者与女神的 ID 集合跑 `ledgerRefusalProblems`；
3. `ruleSchemas` 加 `ledgerRefusals` 一张表单（`clue` 引用 `lore`，`by` 为 JSON，`default`、`mis` 为字符串）；
4. `tables` 加 `ledgerRefusals`。

`tools/content/validators/lines.ts`，三段：

1. 头注释改写：覆盖检查已接入，不再列为"未检查"；
2. 导入 `coverageFindings`、`speakerCategories`；
3. 新增 `LINES_STAGE = 1`、`PROVISIONAL` 与 `coverageGateFindings`，`linesFindings` 末尾接入。本包写入时 `PROVISIONAL` 只有女神一类（主会话批准的闸门口径变更，注释写明女神批次落地后清空）；PK-M1-34 的女神批次已落地，并已由该包清空此表、改写注释，女神的覆盖缺口现在是错误且无报。吠叫池的心情偏好缺口一直是错误。

**补句**（目录第 3.3 节登记、却没写句子的 7 个话题）

| 话题 | 包 | 依据 |
| --- | --- | --- |
| `quest_cellar` | `ln_martha` | 地窖的老鼠，接出 `q_a1_s17_moon_cellar`；口头禅"先吃饭" |
| `quest_owen_cart` | `ln_owen` | 护送二十袋盐，接出 `q_a1_s01_owen_wagon`（任务目录 A1-S01）；口头禅"这世道！" |
| `quest_otto_will` | `ln_greta` | 遗嘱，接出 `q_a1_s11_otto_will`；奥托冬天病故（第一幕 4.8） |
| `quest_c_rank_duel` | `ln_dris` | C 级的面子，接出 `q_a1_s16_c_rank_face`；称呼"F 级的" |
| `quest_seg_duel` | `ln_seg_oneeye` | 单挑；口头禅"规矩就是规矩""输了就认" |
| `quest_count_summons` | `ln_bron` | 伯爵要见人，接出 `q_a1_m13_letter` |
| `faith_nameless` | `ln_oola`、`ln_noi`、`ln_tess`（话题只属这三人，模板句已删） | 正典措辞取自 [history.md](../../20_world/history.md) 遗民口传"开门的母亲睡着了，门总会开的"与 [races.md](../../20_world/races.md)"祈祷在门槛上进行，不出声"；话题条件 K1、信任 60、线索 M02-C02，与 [pantheon.md](../../20_world/pantheon.md)"遗民称开门的母亲"一致。欧拉是落叶路的节点而非遗民，她的句子转述"孩子们的老人"的说法 |

**失败用例逐条判定**（导入真实台词后出现的 6 个失败）

| 序 | 用例 | 判定 | 处理 |
| --- | --- | --- | --- |
| 1 | `dialogue.test.ts` "falls back to the rule answer with the model off" 期望莉娜问候是通用层的"你好。" | 数据落地 | 莉娜现在有本人问候；断言改为"取自 `ln_lina` 的问候三档"，并加注释 |
| 2 | `dialogue_topics.test.ts` "opens and closes the menu" 期望菜单含 `gen_self` | 数据落地 | 菜单至多 6 项，按分数取；地区话题（旧矿、公会、加税、`gen_place`）有了通用层句子后挤掉 `gen_self`，它仍可用文字问到。断言改为"不在菜单上"，注释写明原因 |
| 3 | 同文件 "names a person through gen_people" 期望开局没有任何人物话题 | 数据落地，并暴露数据缺陷 | 5 个人物话题没有 `introduced` 门槛；以前没台词不进菜单，现在有了。其中 `person_adalbert` 按目录本就不设门槛；`person_noi`、`person_tess` 按目录（"同上"）应有门槛，是话题行的缺陷。断言钉住现状并在注释里写明是缺陷与请求（第 3 节） |
| 4 | 同文件 "asks a generic topic in words" 期望 `ln_common` 的 `gen_work` | 数据落地 | 罗恩的本人包先答（回退链第 2 步）；断言改为 `ln_ron` |
| 5 | 同文件 "denies a knower's locked secret" 期望 `ln_common` 的否认与胡话 | 数据落地 | 欧拉与罗恩的本人包先答；两处断言改为 `ln_oola`、`ln_ron` |
| 6 | 同文件 "misleads sincerely (MIS-05)" 问"遗迹里的神纹是什么？"期望卡西安的误导 | 回归（复查后改判） | 遗迹话题有了通用层的句子后先答，截走了误导。修代码：`intent/head.ts` 认出遗迹只修饰神纹，R1 先试中心词的话题。用例保留原输入 |

另：`dialogue_ledger_refusals.test.ts` 的误导用例改为用全量数据（卡西安在 `lore_branded` 与 `lore_sixth_sigil` 都有真实的 `mis` 句，先命中前者）；`lines.test.ts` 莉娜的鉴定句断言改为"别人落到 `ln_common` 的同槽，而莉娜的句子只属于她"。

**决定**

| 决定 | 理由 |
| --- | --- |
| 写定说话者用人设卡字段 `scripted`（幕名列表），由 `src/systems/dialogue/scripted.ts` 判定 | 系统里不写内容 ID；同一字段以后可用于别的写定角色。接上的路径：台词选择（回退链只剩本人包）、规则模板（按旧键迁入的槽位从本人包取）、自由输入的兜底（本人的回避句）、玩家对话与 NPC 闲聊的模型请求。NPC 闲聊的旧模板与认知系统的 `pickLine` 未拦（第 3 节） |
| 阿什在写定幕里本人包没写的槽位一律无句（落到"……"），不由其他层补 | 第一幕分册第 0 节第 4 条"阿什第一幕只说写定台词" |
| 台账关键词当作泄露签名 | 台账行还没有 `leakSignatures` 字段；写在 `ledger.ts` 头注释 |
| `ln_common` 的旧句"，跟勇者传说里一模一样"（`rumor.tpl.hero_legend`）不改 | 判为误报：这是传闻零件，比的是勇者传说，不涉及诸神与势力的同构（M07-C05）；该句受旧键摘要钉住，改动会破坏迁移契约。台账关键词"一模一样"过宽，建议台账作者改用更窄的签名（第 3 节） |
| 吠叫池的心情偏好缺口保持为错误 | 主会话只批准女神覆盖降级；目录没有可补的句子，列为阻塞 |

**复查发现与处理**（新起的只读子代理一轮，覆盖性复查，未过滤）

| 序 | 发现 | 判定 | 处理 |
| --- | --- | --- | --- |
| B1 | 重复率（14.1）只有测量，没在真实数据上跑；复查者用默认模型测得核心 0.20（上限 0.10）、其余有名 0.35 到 0.40（上限 0.20）、同伴 0.65（上限 0.10），只有模板达标 | 真，阻塞 | 不在本包内调模型去凑数。模型只抽问候、一种反应与告别，从不抽话题，条件句一律不成立，可能偏窄；但同伴 0.65 远超上限，说明数据或口径至少有一方要动。列入第 4 节由用户决定 |
| B2 | 16 个吠叫池心情偏好 | 真，阻塞（已知） | 第 4 节 |
| M1 | 按幕覆盖里的句子全被条件挡住时，整个本人包被跳过（欧拉问候落到 `ln_role_healer`，罗恩每次重复同一句，阿什 `react.threatened` 无句） | 真 | 修：`lines/packs.ts` 新增 `ownSlotSources`，一包内按"按幕覆盖、基础槽"依次给来源；`select.ts` 与 `slotSources` 先走完同一包的来源再离开该包。`tests/lines.test.ts` 新用例"an act override that is all conditioned out gives way to the pack's own base slot" |
| M2 | 自由输入的反应路径不传当前幕，按幕覆盖从不生效 | 真 | 修：`intent/respond.ts` 的 `topicLine` 传 `act` |
| M3 | 句数不足只报警告，目录第 2.6 节写"报错" | 真，未改 | 句数缺口全部来自目录正文（`ln_bron`、`ln_moss` 的 `bark.eat` 1/2，四个模板的吠叫 3/4）；把它们升为错误等于再加 6 个阻塞，与吠叫池同类，并入第 4 节第 2 项由用户决定口径。验收矩阵第 4 条改为不再写"无错误" |
| M4 | "每个话题至少一人能答"没自动化；口头禅密度、同伴每幕问候、`belief_*` 可达性等未检查 | 真，未改 | 话题可答已人工核过（矩阵第 2 条）；其余列入第 3 节 |
| M5 | 台账行的 `default` 在台账写"全体"而台账无知情者时失效（M02-C11、M11-C06） | 真 | 修：`clueRefusal` 在无知情者的行上把 `default` 用于所有人；新用例 |
| M6 | MIS-05：问"遗迹里的神纹是什么？"被遗迹话题截走；测试改输入是回避问题 | 真（前次判定有误） | 修：新模块 `src/systems/dialogue/intent/head.ts` 认出"X 的 Y""X 里的 Y"里 X 只修饰 Y，R1 先试中心词的话题；测试恢复原输入，`:557` 用例加断言证明走的是误导路径；新单测 `tests/dialogue_head.test.ts`。判定表第 6 行改写 |
| M7 | 人物话题的钉住把数据缺陷固定下来：`person_noi`、`person_tess` 按目录应有 `introduced` 门槛 | 真 | 话题行归话题数据主人，不在本包改；断言注释写明是缺陷与请求；第 3 节加请求 |
| M8 | 阿什第一幕的初见问候、告别、闲聊等走规则模板给"……"，不是他写定的"还不是时候" | 真 | 修：`replies.ts` 的 `line()` 对写定说话者按旧键迁入的槽位从本人包取句；`respond.ts` 收尾时写定说话者的兜底换成本人的 `react.evade`。探针确认：问候、初见问候、告别、"你是做什么的""最近有什么新鲜事""你怎么看我"都取自 `ln_ash` |
| M9 | 审计事件没有消费方，"送审"未落到审阅处 | 真，未改 | 事件已带原因与线索发出；接入审计日志或编辑器的泄露审阅属于编辑器或 AI 审计包，列入第 3 节 |
| M10 | 女神包移出后计划包行与 PK-M1-34 包行未同步 | 真 | 主会话已确认六个女神包（含 `ln_janu`）归 PK-M1-34；计划包行由主会话改，列入第 3 节 |
| m1 | `line()` 返回字面"……" | 真 | 修：改为 `tr('sys.dialogue.intent.fallback')` |
| m2 | NPC 闲聊的旧模板与认知系统的 `pickLine` 对写定说话者没拦 | 真，部分 | 阿什因 `spread` 0.1 与无实体走不到；"四条路径都接上"的措辞改为准确的三条加一条模型请求，其余列入第 3 节 |
| m3 | 写定测试的 `if (key.startsWith('c.'))` 让断言可空过 | 真 | 修：断言改为必须取自 `ln_ash`；新增问候、初见、告别用例 |
| m4 | 没有调用方传 `firstMeeting`，本人包的初见句永远不出 | 真，未改 | 选择器旧行为；列入第 3 节 |
| m5 | `clueMisLine` 取图中第一个话题；测试注释写错 | 部分真 | 注释改正；选取顺序留作后续（第 3 节） |
| m6 | 台账群体行可部分映射到教会人物；"镇民不知由通用规则覆盖"不准确（通用规则给胡话）；约一百行台账没有 `lore.json` 行 | 真 | 第 3 节表改写措辞并加上这两条 |
| m7 | 抢答时"记一条低重要度记忆"未实现 | 真，未改 | 第 3 节 |
| m8 | 欧文的车与盐、格蕾塔"磨坊空着一年"与正典冲突；模板的 `faith_nameless` 句永远说不出 | 真 | 修：欧文改为"那车盐得有人护着走""二十袋盐"（任务目录 A1-S01）；格蕾塔改为"奥托走了一冬，磨坊就停了一冬"（第一幕 4.8）；删去 `ln_tpl_hidden_gatefolk` 的 `faith_nameless`（话题只属欧拉、诺伊、苔丝） |
| m9 | `place_deer_spring` 希雅没有句子 | 真，未改 | 目录没写；列入第 3 节 |
| m10 | 四句改词与条件值改正没回写目录 | 真 | 列入第 3 节（目录作者） |
| m11 | 覆盖模块的若干宽松处 | 真，未改 | 列入第 3 节 |
| m12 | 重复率模型的分母、F 类上限、吠叫池规则、落空率与通用层占比未实现；自由输入用共享流 `dialogue.lines` | 真，未改 | 第 3 节 |
| m13 | 吠叫池没有读取方 | 真 | 属于 L4 人群的运行时（内置 AI 第 5.9 节），第 3 节 |
| m14 | 判定表与注释有不准确处 | 真 | 菜单用例注释改为"地区话题有通用层句子后挤掉 `gen_self`"；判定表改写 |
| m15 | `ln_party` 里罗恩说"澱"（第一幕只有夜羽与阿什说） | 真，未改 | 目录原文如此；列入第 3 节（目录作者与 V8 俗称检查的范围） |
| m16 | 普通问句"你知道门形的印记是什么吗？"被分类为未知，触发强制不知与审计 | 真，未改 | 分类器词表的覆盖问题，列入第 3 节 |

## 3. 留给后续包的事项

| 序 | 事项 | 建议归属 |
| --- | --- | --- |
| 1 | 女神覆盖缺口改回错误：已由 PK-M1-34 清空 `PROVISIONAL` 完成，无需再做 | 已完成 |
| 2 | 六位女神包与 16 个女神、序章话题的台词 | PK-M1-34 |
| 3 | 台账未映射的行（见下表） | 台账作者（叙事） |
| 4 | 台账关键词"一模一样"（M07-C05）、"后门"（M03-C09）过宽，凡人日常用语也会命中；建议改为更窄的泄露签名 | 台账作者（叙事） |
| 5 | 队内闲聊的选择按 `party.<编号>` 槽位读句子 | PK-M1-21 |
| 6 | `docs/README.md` 的索引未加本目录 | 主会话 |
| 7 | 计划包行 PK-M1-29 仍写"6 位女神第一批"与"47 个吠叫池"（实为 48）；PK-M1-34 包行没列女神台词包 | 主会话 |
| 8 | `person_noi`、`person_tess` 的话题行加 `introduced: true`（目录 3.3"同上"），之后去掉 `tests/dialogue_topics.test.ts` 钉住里的这两个 ID | 话题数据主人（PK-M1-19 的后续） |
| 9 | 审计事件 `dialogue.notified`（原因 `suspected_spoiler`）接入 AI 审计日志或编辑器的泄露审阅，"送审"才算闭环 | 编辑器或 AI 审计的后续包 |
| 10 | 抢答时记一条低重要度记忆"对方说了奇怪的话"（内置 AI 第 6.6 节） | 对话或 NPC 记忆的后续包 |
| 11 | 选择器从不传 `firstMeeting`，本人包的初见句说不出；初见问候走旧模板 | 对话系统的后续包 |
| 12 | 写定说话者：NPC 闲聊的旧模板与认知系统的 `pickLine`（`cognition/comedy.ts`、`cognition/index.ts`）未拦 | 对话系统的后续包 |
| 13 | 覆盖检查未做的：话题可答的自动检查、口头禅密度、同伴每幕问候与 `gen_you`、个人线任务阶段、`react.declined` 按道德标签、核心人物可达的 `belief_*`、女神渠道表与每幕 `gen_self`、主要活动的吠叫；条件句按可达幕计数；`joinAct` 的 OR 取最早幕 | 内置 AI 的后续包 |
| 14 | 重复率测量：分母改为窗口 W；F 类单列上限；吠叫池的两条规则；落空率为 0；一场会话通用层不超过 15%；自由输入改用 `dialogue.lines.<说话者>` 流 | 内置 AI 的后续包 |
| 15 | 吠叫池没有读取方（L4 人群的吠叫，内置 AI 第 5.9 节）；`bark_party_*` 未接为同伴的回退 | NPC 人群的后续包、PK-M1-21 |
| 16 | `clueMisLine` 取图中第一个话题，不先取列出该线索的话题，也不看话题的范围与条件 | 对话系统的后续包 |
| 17 | 分类器把"你知道门形的印记是什么吗？"一类普通问句分为未知，触发强制不知与审计 | 意图词表的后续包 |
| 18 | 目录回写：四句改词（`ln_nick`、`ln_martha`、`ln_toma`、`ln_nera`）、`ln_viro` 条件值、欧文与格蕾塔的补句；`ln_party` 段 `a1_dian_word` 里罗恩说"澱"（第一幕只有夜羽与阿什说）；`place_deer_spring` 希雅没有句子 | 目录作者 |
| 19 | 德里斯（第一幕随行同伴）不在 `companions.json`，按 N 类检查，F 类规则在真实数据上不起作用 | PK-M1-15 |

**台账未映射的行**（逐线索处理只覆盖了能映射到 ID 的行，不算完成）

| 行 | 原因 |
| --- | --- |
| M07-C01、M08-C04、M10-C01、M11-C02、M12-C01、M12-C04 | 处理列为"不适用" |
| M02-C04（门徒会信徒、教会）、M04-C04（教会）、M04-C06（学院、教会）、M05-C02（镇民）、M06-C01（教会）、M06-C03（宫廷学者）、M08-C02（教会）、M10-C04（教会） | 处理只按群体写，没有人物 ID；需要群体到人设卡的映射（阶层或势力）才能落数据 |
| M07-C06 | 有条件（"未被拆穿的女神继续误导"），表的结构里没有条件列 |
| M02-C01、M02-C02 的镇民"不知"；M04-C10 的瓦尔妲；S07-C05 的无貌者；M04-C02 欧拉的"如实说但无人信" | 已有行里删去的条目：镇民按通用规则得到的是"胡话"而不是台账写的"不知"，需要群体映射才能改；瓦尔妲的条目只写解锁之后；无貌者没有 ID；欧拉的处理不属于五种拒答，她现在作为知情者回避，与台账不符 |
| M02-C04、M04-C06"教会：否认"；M03-C01"镇民：误导 MIS-06" | 可以部分映射到第一幕的教会人物（卡西安、伊莎），本包未做 |
| 约一百行台账 | `data/quests/lore.json` 没有对应行，无法映射 |

## 4. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 2 | 句数下限是错误还是警告：目录第 2.6 节写"报错"，覆盖模块报警告。现有缺口全部来自目录正文：`ln_bron`、`ln_moss` 的 `bark.eat` 1/2；`ln_tpl_adventurer_d`、`ln_tpl_peddler`、`ln_tpl_tax_collector`、`ln_tpl_village_priest` 的吠叫 3/4 | A 按目录升为错误，并由目录作者补句（推荐）；B 维持警告并改目录第 2.6 节 | 选 A 会多 6 个阻塞 |
| 3 | 重复率（14.1）未达标或未证明：复查者用默认模型在真实数据上测得核心 0.20（上限 0.10）、其余有名 0.35 到 0.40（上限 0.20）、同伴 0.65（上限 0.10），只有模板达标 | A 先把测量模型补全（抽话题、按幕条件成立、分母为窗口 W）再测，仍超就由目录作者加句（推荐）；B 认定目录第一批不要求达标，第二批再补 | 阻塞计划包行的验收 |
| 1 | 16 个吠叫池达不到"至少三种心情或时段偏好各占一成以上"（builtin_ai 第 7.8 节）。目录正文本身就差：15 个池各只差第三种偏好的一句（30 句的池需要 3 句，现有 2 句），`bark_undead_ruins_echo` 只有地点偏好 | A 由目录作者为每个池补写或改标一句（推荐，15 个池各一句）；B 把亡灵残响池从心情规则中豁免（它是写定残响，不随心情）；C 把规则读作"三种偏好中至少一种可为地点" | 阻塞：V8 报 16 个错误，`tests/lines.test.ts` 的"V8 runs the line pack checks"因此失败 |

缺口清单：

| 池 | 已达标 | 最接近的缺口 |
| --- | --- | --- |
| `bark_adventurer_guild_daily` | 喜 4、乏 3 | 愁、怒、时段各 2 |
| `bark_epilogue_festival` | 喜 6、平 3 | 愁 2 |
| `bark_faithful_any_heresy_alarm` | 惧 9、怒 6 | 愁、平各 2 |
| `bark_lotha_crusade_camp` | 愁 6、惧 6 | 乏、怒、时段各 2 |
| `bark_merchant_market_vendor_call` | 喜 6 | 愁、时段、乏各 2（差两种） |
| `bark_party_guard` | 喜 4、惧 3 | 怒、乏各 2 |
| `bark_party_ranged` | 喜 5、惧 3 | 乏 2 |
| `bark_party_striker` | 喜 5、怒 3 | 惧、乏各 2 |
| `bark_townsfolk_any_danger` | 惧 11、怒 3 | 愁、喜各 2 |
| `bark_townsfolk_any_doubt_cheat` | 怒 4、平 3 | 时段、喜、愁各 2 |
| `bark_townsfolk_any_doubt_luck` | 喜 4、平 3 | 怒、时段、愁各 2 |
| `bark_townsfolk_any_doubt_sorcery` | 惧 8、怒 3 | 时段、愁各 2 |
| `bark_townsfolk_any_hostile` | 怒 7、惧 6 | 愁 2 |
| `bark_townsfolk_any_see_feat` | 惧 7、喜 7 | 平 1 |
| `bark_townsfolk_any_worship` | 喜 9 | 愁、平各 2（差两种） |
| `bark_undead_ruins_echo` | 无（只有地点偏好） | 写定残响，见选项 B |

## 5. 延后的测试

本包只跑了 `verification_matrix.md` 列出的命令。下列套件可能受影响，集中修复时跑：

| 套件或路线 | 为什么可能受影响 |
| --- | --- |
| `npm run playthrough`（各路线、`npc_alive_*`、`act1_minimal`） | 台词从模板换成本人包；抽签序列与句子随之改变 |
| `tests/npc_society.test.ts`、`tests/npc_alive.test.ts`、`tests/cognition*.test.ts` | 吠叫与传话的句子来源变化 |
| `tests/save*.test.ts`、`tests/core.test.ts` 的世界哈希样本 | 台词历史的键随新包改变 |
| `tests/content_validation.test.ts` | "V1 到 V10 全绿"会因吠叫池阻塞与他包错误失败 |
| `tests/goddess*.test.ts` | 女神包未动，但共享层新增的反应句可能被女神回退取到 |
