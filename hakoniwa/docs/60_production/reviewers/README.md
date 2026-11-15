# 审查角色清单（Reviewers）

> 归属：`docs/60_production/reviewers/`（制作计划线，正典优先级第 5 级）。与 `../../00_vision/`、`../../20_world/`、`../../30_story/` 冲突时以后者为准。
> 作用：《箱庭纪》的判断型评审（[dev_process.md](../dev_process.md) 第 4.1 节第五层）由哪些审查角色承担；每个角色的审查范围、检查清单、何时必须派出；共同工作法、报告格式与派发矩阵。
> 上游：[dev_process.md](../dev_process.md) 第 1.3 节（评审门判定标准）、第 4.3 节（确定性底线检查清单）、第 4.4 到 4.6 节（审查角色、共同工作法、派发矩阵）；
> [internal_playbooks.md](../../10_research/woc_reuse/internal_playbooks.md) 第 4.2、4.5 节（主工程审查代理的职责与本作建议的角色）；主工程 `.claude/agents/` 的审查代理定义（思路借鉴，不直接调用）。
> 约束：审查角色只读，以新起会话执行，不由实现者自审；能用确定性检查守住的规则交给守卫测试与 `npm run gate`，审查只做需要判断的部分。

## 0. 一页结论

1. **八个领域角色加两个通用角色。** 领域角色：正典、确定性与内核、AI 与揭示泄露、渲染与性能、界面与无障碍、素材合规、数据与内容、发行；通用角色：总闸（每次贡献结束）与测试覆盖（新增或改写测试）。
2. **每个角色先过范围门。** 改动不在本角色范围内就写 N/A 退出；在范围内则逐条走检查清单，每条给出 PASS、FAIL、VERIFY、N/A，不能确认就标 VERIFY。
3. **结论与严重度统一。** PASS、PASS-WITH-FOLLOWUPS、FAIL；问题分 BLOCKING、SHOULD-FIX、NICE-TO-HAVE，每条带文件位置与一句原因；有任何 BLOCKING 即为 FAIL（dev_process 第 1.3 节）。
4. **派发按改动类型查表。** 第 4 节的矩阵是 dev_process 第 4.6 节在本清单角色上的展开；实施包把它抄进自己的评审派发栏，全包只有一份。
5. **角色与 dev_process 第 4.4 节一一可对。** 第 1.2 节列出对应关系：本清单把"表现接缝审查"拆成渲染与界面两个角色，把"存档兼容审查"并入确定性与内核，把"安全与隐私审查"按落点分进 AI 与揭示泄露（密钥与题面）和发行（桌面壳与发布面）。

---

## 1. 共同规则

### 1.1 共同工作法

照 dev_process 第 4.5 节执行，要点：

| 做法 | 含义 |
| --- | --- |
| 先过范围门 | 第一步判断改动是否在本角色范围内，不在就退出 |
| 只读、新起会话 | 审查者只分析不修改；不让实现者自审 |
| 覆盖优先 | 报告全部问题，包括低严重度与不确定的；排序与过滤是后一步 |
| 证据 | 每条带文件位置（稳定路径与导出符号，或文档与节号）与一句原因；引用命令时写完整命令与输出要点 |
| 状态标记 | PASS（读代码或文档确认）、FAIL（附位置）、VERIFY（读代码无法确认，需要实跑、真机或用户判断）、N/A |
| 对抗式复核 | 实施方行动前，对原始发现逐条复核；经不起复核的发现标明撤回理由 |
| 交付即完成 | 报告作为最终消息完整交付，不只给状态行 |

### 1.2 与 dev_process 第 4.4 节角色的对应

| 本清单的角色 | dev_process 第 4.4 节的角色 | 主工程参照的审查代理 |
| --- | --- | --- |
| 正典 | 正典一致性审查 | 无（本作新增） |
| 确定性与内核 | 模拟架构审查、存档兼容审查 | `architecture-reviewer`、`migration-safety` |
| AI 与揭示泄露 | AI 边界审查；正典一致性审查的揭示台账部分；安全与隐私审查的密钥与题面部分 | 无（本作新增） |
| 渲染与性能 | 表现接缝审查的渲染部分 | `frontend-seam-reviewer`、`render-performance-reviewer` |
| 界面与无障碍 | 表现接缝审查的界面部分 | `frontend-seam-reviewer` |
| 素材合规 | 许可与素材来源审查 | `content-obligations-reviewer` 的素材部分 |
| 数据与内容 | 数值溯源审查；内容批次的数据校验 | `content-obligations-reviewer` |
| 发行 | 安全与隐私审查的桌面壳与发布面部分；发布检查 | `privacy-security-review`、`gate-integrity-reviewer`、`release-malware-audit` |
| 总闸 | 总闸 | `qa-checklist` |
| 测试覆盖 | 测试覆盖审查 | `test-coverage-auditor` |

### 1.3 报告格式

```markdown
# <角色> 审查：<包编号或改动名>

结论：PASS | PASS-WITH-FOLLOWUPS | FAIL
范围门：在范围内的改动（文件清单）；不在范围内的改动（略过）

| 序 | 检查项（本清单编号） | 状态 | 严重度 | 位置 | 原因 |
| --- | --- | --- | --- | --- | --- |

运行过的命令与结果：<完整命令；输出要点>
VERIFY 项：<缺什么环境或证据>
还缺什么：<对抗式收尾：本改动应有而没有的测试、文档回写、索引行、请求回写>
```

报告存进包的 `verification_matrix.md` 第 3 节（指向报告所在的会话或文件），见 [70_packets/README.md](../../70_packets/README.md)。

---

## 2. 领域角色

### 2.1 正典

| 项 | 内容 |
| --- | --- |
| 审查范围 | L0 与 L2 文档（`docs/00_vision/`、`docs/20_world/`、`docs/30_story/`）；L3、L4 设计文档与内容目录；玩家可见文本、人设卡、台词包、过场脚本、内容数据中的专有名词与显示名；新命名 |
| 不管 | 运行时题面与模型输出的泄露（AI 与揭示泄露）；数值来源（数据与内容） |
| 何时必须派出 | 改动触及 L0 或 L2；L3、L4 设计文档或内容目录；内容批次；台词、过场、人设卡；任何新增的玩家可见专有名词；正典变更单 |

检查清单：

1. 与更高优先级的正典无冲突（`hakoniwa/CLAUDE.md` 的正典优先级：总纲、愿景、`20_world/` 其余、`30_story/`、40 到 60、调研）；冲突处写明双方的文档与节号。
2. 废弃名与改过显示名的英文代号（D-020、D-075）在文档与玩家可见文本中零出现：dev_process 第 4.3 节命令二，决策日志除外。
3. 受限名（D-023 的被禁之名）在第六幕正名之前不出现在玩家可见文本（预写台词、对话树、界面文本、内容显示名）；设计文档里可以出现。
4. 新命名已进 [glossary.md](../../00_vision/glossary.md)，并完成原创性检索（精确短语与造词检索，对照主要游戏维基）；不复用他作独有的造词或全名。
5. 新线索在 [reveal_ledger.md](../../30_story/reveal_ledger.md) 登记编号、层级、解锁条件；文本没有越过所在幕的禁区（台账的不得泄露清单）。
6. 新增世界状态变量先进 [world_state_registry.md](../../40_design/world_state_registry.md)（D-076），再在文档与数据里使用。
7. 叙事文档通过 [narrative_design.md](../../30_story/narrative_design.md) 的写作检查清单。
8. 改变正典事实的改动走正典变更单（dev_process 第 5 节）并有用户批准；代理之间的消息不算批准。
9. 一个条目 ID 一个主人（D-066），跨目录只按 ID 引用；人物 ID 与别名以 [implementation_conventions.md](../../50_tech/implementation_conventions.md) 第 3 节为准。

### 2.2 确定性与内核

| 项 | 内容 |
| --- | --- |
| 审查范围 | `src/core/`、`src/systems/`、`src/game/`（编排与自动玩家）、`src/content/`；存档结构与世界字段；命令日志与重放；L5 技术方案中关于内核的部分 |
| 不管 | 模型路径与题面（AI 与揭示泄露）；表现层（渲染、界面）；内容数值的来源（数据与内容） |
| 何时必须派出 | 改动触及上述任一目录；存档结构或世界字段；L5 技术方案；重构类包（端口、ID 解耦、调度） |

检查清单：

1. 纯度：`core`、`content`、`systems`、`ai`、`game` 不碰 DOM、Canvas、Three.js 与浏览器全局；`src/platform/` 只被 `src/client/` 引用（`tests/architecture.test.ts`、`tests/client_purity.test.ts`；平台层的分层检查由 PK-M0-21 并入）。
2. 确定性：模拟层没有 `Math.random`、`Date.now`、`performance.now`、`new Date(`；随机只走命名流，新用途在本系统内开子流，不借别的系统的流；随机抽取顺序的变化要么不存在，要么包行明说并重录金样。
3. 相位顺序（[architecture.md](../../50_tech/architecture.md) 第 4.6 节）不变，或包行明说；新系统声明 `order`。
4. 系统边界：一个系统只写自己的切片；跨系统写走事件、旗标或端口；实体字段 `alive`、`tags`、`speed`、`move`、`intent` 只经 `src/systems/world/ports.ts` 写（实体字段写入守卫）；业务系统之间不互相导入（world、inventory、modifiers、core 除外）。
5. 内容 ID：系统代码不写内容 ID，一律按数据声明的职能或字段查（[release_engineering.md](../../50_tech/release_engineering.md) 第 13.2 节；`tests/content_id_guard.test.ts`，系统目录允许名单为空）。
6. 协调器不增长：新逻辑进独立模块，协调器只做薄接线；搬迁只搬不改写。
7. 行为不变：重构类包的两条既有结局路线与确定性测试的世界哈希逐字节不变（`tests/core.test.ts`、`npm run playthrough`）；有差异时差异来源写清并由包行授权。
8. 模型提议、内核裁决（D-007）：提议只以命令进入，由所属系统的处理器校验；兜底先算，截止前默认"暂不决策"；无模型时系统照常运转（D-010）。
9. 文本：内核与系统只发 `TextRef`，不新增中文字面量（[implementation_conventions.md](../../50_tech/implementation_conventions.md) 第 8 节；`tests/i18n_kernel_guard.test.ts` 由 PK-M0-14 建立）。
10. 存档：版本号、逐版本迁移、新字段的默认值、往返、重命名表、损坏注入（release_engineering 第 5 节；`tests/save_*.test.ts` 由 PK-M0-16、PK-M0-18 建立）。
11. 加速与节拍：每 tick 的工作量没有随世界规模无界增长；低频系统按节拍运行（release_engineering 第 6.4 节）。

### 2.3 AI 与揭示泄露

| 项 | 内容 |
| --- | --- |
| 审查范围 | `src/ai/`、`src/game/ai_roles/`、内置 AI 的规则大脑（`src/core/brain/` 起）、意图与闸门、题面装配、路由、预算与降级、模型设置；桌面网关 `desktop/llm_gateway/` 的请求与密钥路径；世界知识条目与揭示条件；预写台词的揭示过滤 |
| 不管 | 内核裁决逻辑本身（确定性与内核）；窗口与设置页的呈现（界面与无障碍）；桌面壳的其余安全设置（发行） |
| 何时必须派出 | 改动触及上述任一项；新增或改动意图、题面模板、角色包、评估集；新增或改动揭示条件、知识层级；预写台词批次 |

检查清单：

1. 意图枚举封闭；每个意图有校验、回退（兜底）、预算与审计；审计能解释"为什么发生、为什么没发生"。
2. 模型不直接写状态：输出经模式校验，转成带 `revision` 的命令，过时作废并重新观察（[ai_architecture.md](../../50_tech/ai_architecture.md)）。
3. 模型档与内置 AI 共用菜单与闸门；无模型（`aiMode: 'off'`）时请求在下一 tick 执行兜底；内置 AI 路径完整（[builtin_ai.md](../../40_design/systems/builtin_ai.md)）。
4. 揭示：题面按知识层级与揭示条件过滤；给定幕次，题面与预写台词不含未解锁知识（V5，`node tools/content/validate.ts` 由 PK-M0-28 建立；题面快照测试）；女神与核心人物的评估集阻断级失败为 0（M1 起）。
5. 回放：回放局的模型调用次数为 0；提议以（tick, 提议）进入重放日志。
6. 密钥：只在网关；不进日志、存档、录像、崩溃报告、诊断包与设置导出；渲染进程不经手；错误正文回传前抹掉密钥与鉴权头（release_engineering 第 2.4、2.5 节，[llm_providers.md](../../50_tech/llm_providers.md)）。
7. 花费上限：渲染进程预算器先行，网关按台账独立再执行一次；超限给出"花费上限已到"并降级，不全局停表（D-036、D-067）。
8. 发布面：开发代理 `/api/llm` 与官方 SDK 不进发布包；`DevProxyTransport` 只在开发构建引入（release_engineering 第 13.9 节）。
9. 模型路径测试：`tests/llm_*.test.ts`、`tests/ai*.test.ts` 通过；脚本、混沌、录带三种模拟提供方的用例覆盖改动（release_engineering 第 10.8 节）。
10. 证据类别诚实：模拟提供方的结果不冒充真实模型；无模型的结果不冒充模型档。

### 2.4 渲染与性能

| 项 | 内容 |
| --- | --- |
| 审查范围 | `src/client/hd2d/`、`src/client/render/`、`src/client/sprites/`、素材解析与图集加载、画质档、帧循环（`GameSession` 与帧调度器）、基准场景 |
| 不管 | HUD 与窗口的信息架构与文本（界面与无障碍）；素材的来源与许可（素材合规） |
| 何时必须派出 | 改动触及上述任一项；新增材质、光源、着色器变体、渲染层或每帧工作；改动画质档或自动降档；素材批次进入图集时视情况加派 |

检查清单：

1. 只读接缝：表现层只经 `GameView` 读世界、只经命令改世界；HD-2D 与平面两种渲染器读同一份 `GameView`，切换不影响逻辑（[architecture.md](../../50_tech/architecture.md) 第 7 节）。
2. 纯逻辑核心与薄绘制：可测的逻辑放纯模块并登记进 `CLIENT_PURE_CORES`（`tests/client_purity.test.ts`），在 Node 中测试；依赖 Three.js 与 DOM 的模块只做绘制。
3. 按需重画：新的视觉变化源要么报告脏原因，要么进入帧签名（`src/client/render/frame_scheduler.ts` 的 `REDRAW_REASONS`、`SIGNATURE_PARTS`）；暂停菜单下一帧不画；可行动信息的显示延迟不超过一帧（release_engineering 第 6.3 节；`tests/client_frame_scheduler.test.ts`）。
4. 帧预算：按 release_engineering 第 6.2 节的分项；每帧不分配新对象；中档绘制调用不超过 60。
5. 画质档公平：画质档只减观感，不减玩家据以行动的信息（敌人位置与移动、施法条、地面预警、己方状态）；立牌与光源的上限下可行动单位永不裁剪（[art_pipeline.md](../../50_tech/art_pipeline.md) 第 2.11、2.12 节；release_engineering 第 6.6、6.7 节；D-078）。
6. 纹理内存与图集：中档常驻纹理不超过 448MB；按地图流式加载（release_engineering 第 6.8、6.9 节）。
7. 着色器与材质变体在载入画面预编译，进入世界后不出现首次编译卡顿（release_engineering 第 2.7 节）。
8. 证据：触及热路径时给出基准场景的数字（BM-01 到 BM-07、BM-T1、BM-T2，PK-M1-05 起）或标 VERIFY；截图回归（PK-M1-08 起）。

### 2.5 界面与无障碍

| 项 | 内容 |
| --- | --- |
| 审查范围 | `src/client/` 的 HUD、窗口、模式、输入、设置；`src/shared_ui/`；字符串表 `locales/`；新手引导 `tut_`；界面元件编号 `ui_` |
| 不管 | 世界场景的绘制（渲染与性能）；设置页里模型连接与密钥的安全路径（AI 与揭示泄露、发行） |
| 何时必须派出 | 改动触及上述任一项；新增或改动玩家可见文本、窗口、按键、设置项、引导 |

检查清单：

1. 只读接缝：界面只经 `GameView` 读世界、只经命令改世界；窗口与 HUD 元件是独立模块（纯视图核心加薄绘制器），不在协调器里加段。
2. 文本：玩家可见文本来自字符串表（`t(ref)`），不拼接句子；数字、金钱、日期、时刻走格式化函数；长度不超过 [ux_and_onboarding.md](../../40_design/ux_and_onboarding.md) 第 19.2 节的上限；文本键格式按第 20.2 节（字符串表在 PK-M0-15 之前尚未建立时，新文本集中在 `src/shared_ui/text*.ts`）。
3. 输入：键鼠与手柄都能完成改动涉及的操作；改键冲突有检测；悬停才出现的信息在手柄上有焦点停留等价（界面文档第 6 节的 `ui_pop_tooltip`、第 16 节）。
4. 无障碍：色觉模式下语义同时有形状；文字对底色对比不低于 4.5:1、图形不低于 3:1；文字大小四档下保留项不截断；声音不是可行动信息的唯一载体，有字幕或视觉提示（界面文档第 18 节；D-080）。
5. 无障碍设置只改呈现与输入，不改内核数值；需要放宽数值的只走难度档（界面文档第 18.1 节）。
6. 引导：只在玩家遇到时触发、一次一个新东西、首次不惩罚且从不改内核数值、全部可跳过可回看（界面文档第 17.1 节）；载入提示按幕与已开放的系统筛选，不剧透（界面文档第 3 节）。
7. 性能：HUD 按 `HUD_INTERVAL_MS` 刷新，只在值变化时写 DOM；界面性能预算见界面文档第 22 节。
8. 可用性：改动影响界面文档第 23 节的验收条目时，写明对应条目与验证方式（自动测试或人工），人工项标 VERIFY。

### 2.6 素材合规

| 项 | 内容 |
| --- | --- |
| 审查范围 | `assets/`（原文件、`processed/`、`manifest.json`、`tools.json`）；提示词库 `assets/prompts/` 的规格与模板；第三方代码、资源、字体；新增依赖；商店页素材 |
| 不管 | 素材进游戏后的显示效果与性能（渲染与性能）；素材条目与内容目录的编号对账（数据与内容） |
| 何时必须派出 | 素材批次（美术与音频）；引入第三方代码或资源；新增 npm 依赖；改动提示词库的模板或风格包；商店页与发行素材 |

检查清单：

1. 登记字段齐全：每个原文件在 `manifest.json` 有记录，`tool` 在 `tools.json` 登记过，`promptHash` 与提示词条目一致，`aigcLabel` 保留（[assets/README.md](../../../assets/README.md) 第 3 节）。
2. 生成工具条款：`tools.json` 的 `commercialUse` 为真，条款快照与查阅日期在登记中（PK-M0-05）。
3. 禁用素材：my_ai_town 的代码、像素图、图标与音乐不得进入，也不得作参照（D-017）；主工程的商标、不可再分发的第三方图标、非商用音效不得进入（D-015；[reuse_map.md](../../50_tech/reuse_map.md) 第 6.1 节）。
4. 提示词不点名：条目与说明里不出现其他作品、作者、画师、工作室与商标名（[assets/prompts/README.md](../../../assets/prompts/README.md)）。
5. 第三方代码与依赖：许可兼容；移植的公式与符号记进 `UPSTREAM.json`（PK-M3-07）；新增依赖有必要性说明（依赖极少）。
6. 存放规则：原文件走 Git LFS（`hakoniwa/.gitattributes`）；`_rejected/` 不入库；原文件不随游戏分发。
7. 编号三方一致：内容目录、提示词规格、素材清单（dev_process 第 2.1 节）；`npm run prompts:check` 通过。
8. 素材闸门：`npm run assets:check` 与 `ART_GATE=<里程碑> npx vitest run --config vitest.config.ts art_`（PK-M0-08 建立）通过。

### 2.7 数据与内容

| 项 | 内容 |
| --- | --- |
| 审查范围 | `data/` 下全部内容数据；内容 pack `src/content/packs/`；内容导入批次与 `data/_staging/`；变量注册表 `data/registry/vars.json`；设计文档与内容目录里的数值；自动玩家路线表 `data/autoplay/routes.json` |
| 不管 | 名字与设定是否合正典（正典）；系统代码如何读取数据（确定性与内核） |
| 何时必须派出 | 改动触及 `data/` 或内容 pack；内容导入批次；平衡调整；设计文档或目录改动含数值时视情况加派 |

检查清单：

1. 一个 ID 一个主人（D-066）：ID 前缀按 [content_bible.md](../../40_design/content/content_bible.md) 第 12 节；ID 稳定，改名走重命名表；跨目录只按 ID 引用。
2. 设计源与运行源：目录与数据冲突时以目录为准修数据；数据层发现的设计问题登记回 [content_review.md](../../40_design/content/content_review.md)（dev_process 第 2.1 节）。
3. 数值溯源：每个数值写明来源之一（经典公式、正典、本作推导、实测；dev_process 第 2.2 节）；平衡只改数据不改公式，理由写进批次报告；等级带与份额（D-069）与乘区上限受检。
4. 引用完整：内容校验 V1 到 V10（`node tools/content/validate.ts`，PK-M0-28）；注册表一致（`node tools/registry/build.ts --check`，PK-M0-27）；变量先登记再使用；在校验器建成前，相关内容测试（`npm test`）通过。
5. 文本：数据里的显示文字是中文源文本，不手写文本键（[release_engineering.md](../../50_tech/release_engineering.md) 第 8.3 节）。
6. 无模型可玩：新内容有无模型做法；自动玩家路线表的每个 ID 对照内容校验（`routeProblems`）。
7. 地图：上线的地图同步地图数据、图集状态与路线（[map_briefs.md](../../40_design/world/map_briefs.md) 第 15 节）。
8. 节奏：改动经验、掉落、价格时，对照 [progression_and_pacing.md](../../40_design/progression_and_pacing.md) 的预算；必要时跑 `npm run playthrough` 或标 VERIFY。
9. 格式：改过的 JSON 用 `npm run format -- <文件>`。

### 2.8 发行

| 项 | 内容 |
| --- | --- |
| 审查范围 | 桌面壳 `desktop/`（主进程、预载桥、通道、密钥、文件存档后端、设置、Steam、崩溃与诊断）、`src/platform/`；构建、签名与打包；全量门 `tools/gate.ts` 与 `tools/gate/`；流水线 `.github/workflows/hakoniwa-*.yml`；遥测与隐私；法律文件；版本与发布检查 |
| 不管 | 模型请求的题面与校验（AI 与揭示泄露）；世界结构的存档迁移（确定性与内核） |
| 何时必须派出 | 改动触及上述任一项；每个发布候选；改动门或流水线的步骤与选择规则 |

检查清单：

1. 安全设置逐键钉住：上下文隔离、沙箱、关闭 Node 集成、内容安全策略、导航与新窗口拦截、权限白名单、熔断位、开发者工具与远程调试的通道限制（release_engineering 第 2.6 节）。
2. 预载桥只暴露具名通道（`tests/desktop_ipc_surface.test.ts`，PK-M0-21）；每个处理器核对来源 `app://hakoniwa`，手写校验载荷，有体积与频率上限，只做本通道的一件事（release_engineering 第 2.3 节）。
3. 密钥存储：`safeStorage` 加密；Linux 无钥匙串时不落盘；没有回读通道；不进云同步、诊断包与设置导出；日志写入前脱敏（release_engineering 第 2.5 节）。
4. 发布构建无开发面：无 `/api/llm`、无 SDK、开发者工具只在 `internal` 与 `e2e` 通道；打包构建忽略改变通道、端点、遥测的环境变量（`release_bundle` 扫描，[development_plan.md](../development_plan.md) 第 9.6 节）。
5. 文件存档后端：写入顺序与原子性、四级回退、云同步冲突只落在槽位头（release_engineering 第 5.2 到 5.7 节）。
6. 门与流水线：`npm run gate` 的退出码如实反映每一步，不用管道吞掉退出码；改动选择规则时，失败方向是"多测"而不是"少测"（`tests/gate.test.ts`）。
7. Steam：成就 API 名在 `data/platform/steam_achievements.json`；云存档、覆盖层、富状态按 release_engineering 第 4 节；AI 生成内容披露与商店页一致（第 4.7 节）。
8. 隐私与遥测：遥测默认关闭；离开本机的数据与 release_engineering 第 12.5 节的清单一致；诊断包默认只含日志与系统信息；崩溃报告只在玩家同意后发送。
9. 法律与合规：第三方声明、`UPSTREAM.json`、使用须知与隐私政策三处同文（release_engineering 第 14 节）。
10. 发布检查：补丁与次版本走 release_engineering 第 11.3 节，1.0 走第 16 节；放行结论写进决策日志。

---

## 3. 通用角色

| 角色 | 审查范围 | 检查清单要点 | 何时必须派出 |
| --- | --- | --- | --- |
| 总闸 | 一次贡献的全部改动 | 读改动；交叉引用 `hakoniwa/CLAUDE.md` 与改动所在目录的约定；跑匹配的守卫（`tests/architecture.test.ts`、`tests/client_purity.test.ts`、`tests/docs_guard.test.ts` 等）；逐条核对 dev_process 第 4.3 节的确定性底线；按第 4 节点名需要派的领域角色；最后做"还缺什么"的对抗式收尾（测试、文档回写、索引行、请求回写、计划与状态的建议改动） | 任何一次贡献结束；每个里程碑门 |
| 测试覆盖 | 新增或改写的测试；验收声称有覆盖的改动 | 断言有决定性（回归时真的会失败）；没有常量自比较；"任一或全部"类声明每个分支都测；多字段检查逐维有反例；关键的键名、编号、哈希钉成字面量 | 新增或改写测试；验收条目声称"测试覆盖"；修缺陷的包 |

---

## 4. 派发矩阵

dev_process 第 4.6 节在本清单角色上的展开。"必派"缺一即不得过阶段门；"视情况"按括号里的条件加派。总闸在任何一次贡献结束时都派，下表不再重复。

| 改动类型 | 必派 | 视情况加派 |
| --- | --- | --- |
| L0 正典或 L2 叙事文档 | 正典 | AI 与揭示泄露（新增或改动揭示条件、知识层级） |
| L3、L4 设计文档与内容目录 | 正典 | 数据与内容（含数值）；AI 与揭示泄露（含 AI 介入点）；界面与无障碍（界面与引导文档） |
| L5 技术方案 | 确定性与内核 | AI 与揭示泄露（含 AI）；发行（含密钥、联网、桌面壳）；渲染与性能（含性能预算） |
| 内核、系统、编排代码 | 确定性与内核、测试覆盖 | 数据与内容（含数值或数据读取方式） |
| AI 层、内置 AI、模型设置、网关 | AI 与揭示泄露、测试覆盖 | 发行（网关、密钥、通道）；正典（预写文本与人格卡） |
| 渲染 | 渲染与性能 | 测试覆盖（新增纯逻辑核心） |
| 界面、输入、文本 | 界面与无障碍 | 测试覆盖；渲染与性能（覆盖层与每帧工作） |
| 内容批次 | 数据与内容、正典 | AI 与揭示泄露（台词、知识条目、揭示条件） |
| 素材批次 | 素材合规 | 渲染与性能（进入图集与画质档） |
| 存档结构 | 确定性与内核 | 发行（文件后端与云同步）；测试覆盖 |
| 桌面壳、打包、Steam、门与流水线 | 发行 | 测试覆盖 |
| 流程文档、模板与文档工具 | 总闸 | 测试覆盖（新增守卫测试） |
| 里程碑或发布 | 总闸，加上述全部在范围内的角色 | 无 |

内容批次把"数据与内容"列为必派，比 dev_process 第 4.6 节的"视情况加派数值溯源审查"更严：内容批次总是写 `data/`，引用完整与数值来源每批都要查。

---

## 5. 维护

- 新增角色的条件（dev_process 第 4.1 节）：某类问题需要专门判断，且没有确定性检查守住；能写成守卫测试的规则写成测试，不新增角色。
- 某个角色的检查清单超过一屏时，拆成本目录的 `<角色英文短名>.md`，本文保留范围、派出时机与链接。
- 守卫测试与命令建成后（标注了包编号的项），对应检查项改写为"守卫通过"，并保留需要判断的部分。

## 6. 来源链接

- 流程：[dev_process.md](../dev_process.md) 第 1.3、4、5、6 节；[70_packets/README.md](../../70_packets/README.md)
- 计划：[development_plan.md](../development_plan.md) 第 2.2、9 节
- 技术：[architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md)、[release_engineering.md](../../50_tech/release_engineering.md)、[ai_architecture.md](../../50_tech/ai_architecture.md)、[llm_providers.md](../../50_tech/llm_providers.md)、[art_pipeline.md](../../50_tech/art_pipeline.md)、[reuse_map.md](../../50_tech/reuse_map.md)
- 设计：[ux_and_onboarding.md](../../40_design/ux_and_onboarding.md)、[builtin_ai.md](../../40_design/systems/builtin_ai.md)、[content_bible.md](../../40_design/content/content_bible.md)、[world_state_registry.md](../../40_design/world_state_registry.md)、[reveal_ledger.md](../../30_story/reveal_ledger.md)
- 方法论依据：[internal_playbooks.md](../../10_research/woc_reuse/internal_playbooks.md) 第 4.1 到 4.5 节
