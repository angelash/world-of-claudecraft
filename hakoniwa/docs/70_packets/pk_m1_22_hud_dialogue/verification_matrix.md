# PK-M1-22 HUD、对话、过场与回廊：验收与证据

> 入口见 [README.md](README.md)；进度与汇报见 [progress.md](progress.md)。状态只用 PASS、FAIL、VERIFY、N/A。

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS：包行两条验收（对应 `ui_` 编号的空与错误状态逐一核对；纯核心单测）都有证据；遗留见 [progress.md](progress.md) |
| 末次代码或内容变更 | 未提交；改动文件见 [README.md](README.md) 第 6 节与 [progress.md](progress.md) |
| 完整实跑 | 2026-11-17，共享工作区（含其他并行包的未提交改动，见第 4 节） |
| 审查 | 新起会话的覆盖审查两份：故事与 HUD 一侧 19 条（0 条 BLOCKING）；设置、存档与回廊一侧 11 条（2 条 BLOCKING）；处理见第 3 节 |

## 1. 验收条目

### 1.1 包行验收：各 `ui_` 编号的空与错误状态

| 编号 | 空状态 | 错误状态 | 证据 | 状态 |
| --- | --- | --- | --- | --- |
| `ui_scr_newgame` | 内容固定，无空状态 | 上次连接测试失败时大模型卡写 3.4.2 的一句；存储不持久或空间不足时开局前提示；确认框重写传说与铁人的后果；要覆盖旧铁人槽时确认为不可逆 | `tests/client_saves_newgame.test.ts`；浏览器核对第 1.3 节 | PASS |
| `ui_scr_load` | "还没有存档" | 损坏（可删除）；版本过新；读取回退到上一代时注明；迁移失败按损坏报；网页配额沿用原文 | `tests/client_saves_newgame.test.ts` | PASS |
| `ui_win_saves` | 同 `ui_scr_load` | 序章整窗灰显"序章不能存档"；战斗、过场、对话、写档中存档键灰显写原因；铁人局只见本局一个槽，存、读、删都灰显；存档失败沿用 `ui.win.saves.failed`；列表读取失败保留上一份列表与全部缩略图 | 同上，"a failed listing keeps the last list" | PASS（"重试""换一个槽位"两个按钮未做，见遗留） |
| `ui_win_menu` | 不适用 | 返回标题的确认；铁人局另写一句；退出时铁人存档失败在标题上说明 | 浏览器核对 | PASS |
| `ui_scr_settings`、`ui_win_settings` | 只列有画手的页，不放空壳（音频、无障碍、存档与隐私列为未建） | 设置份来自更新版本时只读 | `tests/client_settings_shell.test.ts` | PASS |
| `ui_set_controls` | 尚未开放的情境与窗口键不列出 | 冲突时两处标出并给"替换""取消"，锁定位不可替换；导入的五类错误（不是 JSON、格式不对、版本更新、条目无效、一键两用） | 同上 | PASS |
| `ui_set_gameplay`（部分） | 无 | 无 | 同上 | PASS（其余项在 PK-M1-57） |
| `ui_set_graphics` | 无 | 无 WebGL 时写明只有平面档 | 同上 | PASS |
| `ui_set_language` | 无 | 无 | 同上 | PASS |
| `ui_set_llm` | 不变 | 不变 | | N/A（PK-M1-02） |
| `ui_hud_party` | 没有同伴或适配器缺失时整块隐藏 | 无错误状态 | `tests/client_hud_party_notify.test.ts` | PASS |
| `ui_hud_focus` | 没有焦点时隐藏 | 无错误状态；焦点死亡、离图或超过 60 米自动清除 | 同上 | PASS |
| `ui_hud_gauges` | 全为 0 时隐藏 | 无错误状态 | `tests/client_corridor_tracker.test.ts` | PASS（澱染条在有系统写 `player.taint` 之前不出现） |
| `ui_hud_tracker` | 没有追踪时整块隐藏 | 无错误状态；门缝档的门不露钥数 | 同上 | PASS |
| `ui_hud_notify` | 没有通知时隐藏 | 无错误状态；过场与对话中排队，结束后按级别放出 | `tests/client_hud_party_notify.test.ts` | PASS |
| `ui_hud_hint` | 没有提示或引导级别为关闭时隐藏 | 无错误状态 | 同上 | PASS |
| `ui_mode_dialogue` | 对方无话可说时显示写定的告别，不出现空面板 | 输入被拒时在输入框下写原因，不清空；头像缺失退化为立牌截图或名牌 | `tests/client_story.test.ts` | PASS |
| `ui_mode_cutscene` | 不适用 | 插画缺失显示暗角；立绘缺失用头像放大；信件缺失跳过该步；被拒的自由输入 1.5 秒后输入行回来；演出指令里的镜头、光、天气暂不执行（画面保持） | 同上；浏览器核对 | PASS（当幕远景作插画退化见遗留） |
| `ui_mode_corridor`、`ui_win_doors` | "还没有察觉到任何门"；筛选无门时"这一栏没有门" | 开门被拒时门卡写原因，不弹错误框 | `tests/client_corridor_tracker.test.ts`；浏览器核对 | PASS |
| `ui_win_quests` | "还没有任务"；纷争页"还没有卷进任何纷争。"；已结束页"还没有了结的事。"；其他页"这一栏还没有记录。" | 第 14.1 节规定无错误状态；手动追踪满 5 条时提示 | 同上 | PASS |
| `ui_win_help` | 无 | 无；按键随设备与绑定重画 | `tests/client_settings_shell.test.ts` | PASS |
| `ui_pop_confirm` | 不适用 | Esc、B 取消；不可逆操作长按 0.6 秒或（长按改切换时）按两次 | 浏览器核对；`tests/client_saves_newgame.test.ts` 的 `CONFIRM_HOLD_MS` | PASS |

### 1.2 包行验收：纯核心单测

| 序 | 测试文件 | 覆盖 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | `tests/client_story.test.ts` | 打字机、自动推进、跳过长按、回看、头像与立绘解析、演出指令、信件、对话与过场模型、故事控制器、AI 屏蔽表、场景视图新字段；同一节点追加的台词续打不重打；散句不收起 HUD；白场在减少闪烁下变柔光 | 33 项通过 | PASS |
| 2 | `tests/client_hud_party_notify.test.ts` | 队伍框、通知队列与事件映射（排队不过期、新任务只一条）、提示条、焦点框 | 30 项通过 | PASS |
| 3 | `tests/client_settings_shell.test.ts` | 设置外壳、操作与改键（冲突、锁定、导入导出含一键两用）、游戏性页、帮助行 | 27 项通过 | PASS |
| 4 | `tests/client_corridor_tracker.test.ts` | 回廊模型、门缝档不露钥数、任务日志页签与已结束、追踪（矮屏显示最新的）、计量、回廊适配器与输入情境 | 26 项通过 | PASS |
| 5 | `tests/client_saves_newgame.test.ts` | 新游戏页、存档列表、槽位附加信息、铁人规则、游玩时长、读取失败不清缩略图、传说不降速 | 21 项通过 | PASS |
| 6 | `tests/client_saves_migrate.test.ts` | 客户端读档经全部系统作为切片主人的迁移器：改名前的存档读回后战斗切片里是新的技能与光环编号；不带系统时切片保持旧编号（钉住接线的作用） | 2 项通过 | PASS |
| 7 | `tests/client_purity.test.ts` | 新增 28 个纯核心列入 `CLIENT_PURE_CORES` | 通过 | PASS |

### 1.3 浏览器核对

| 序 | 核对 | 方法 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 新游戏、过场、回廊、窗口、暂停规则 | 开发服务（预览工具，配置 `hakoniwa`，端口 5180）；预览页在后台时 `requestAnimationFrame` 被节流，故在页面里手动推进会话帧；核对后停掉服务 | 标题"新的旅程"打开新游戏页（四张难度卡、铁人、引导级别、大模型卡）；开局后内置量 `difficulty` 为 `standard`、`ironman` 为 false；勾铁人后开始弹确认框且焦点在"开始"之外的安全位，Esc 取消；序章剧场逐字显示，选项在台词读完后才出现，打字中按数字键不会选中；回看列出全部历史，Esc 关回看；长按 Esc 跳到下一个选择点并显示梗概卡；空格推进到选项；打开设置时世界 tick 不动，关闭后继续；回廊模式显示门镜、筛选、第 1 段两扇显影门与门卡；存档窗口在序章写"序章不能存档"；控制台无错误 | PASS |
| 2 | 第一幕里的常规对话版式、队伍框、通知与追踪的实景 | | 浏览器会话期间其他并行包反复改动文件，页面被开发服务连续重载，没能走到第一幕；这部分由第 1.2 节的模型测试覆盖 | VERIFY |

## 2. 通用检查

| 检查 | 命令 | 适用 | 结果 | 状态 |
| --- | --- | --- | --- | --- |
| 类型检查 | `npm run typecheck` | 是 | `src/client` 与本包测试 0 个错误；其余错误都在并行包正在改的 `src/systems/combat`、`inventory`、`npc` 与 `tests/disputes.test.ts`（第 4 节） | PASS |
| 文本检查 | `node tools/i18n/check.ts` | 是 | 本包的键 0 条发现；唯一一条是 `content.generated.json` 过期（其他包改了内容数据，第 4 节） | PASS |
| 构建 | `npm run build` | 是 | 成功（主包超过 1 MB 的提示是警告） | PASS |
| 改动文件格式 | `npm run format -- <改动的 TS 与 CSS>` | 是 | 无剩余问题 | PASS |
| 默认套件 | `npx vitest run --config vitest.config.ts` | 是 | 本包的测试全过；失败项全部来自并行包（第 4 节） | PASS |
| 文档守卫 | `npx vitest run --config vitest.config.ts tests/docs_guard.test.ts` | 是 | 通过 | PASS |
| 无模型通关 | `npm run playthrough` | 否（不改内核与内容） | | N/A |

## 3. 审查

| 角色 | 结论 | 处理 |
| --- | --- | --- |
| 覆盖审查：设置、存档与回廊一侧 | 2 条 BLOCKING、6 条 SHOULD-FIX、3 条 NIT | BLOCKING 全修：列表读取失败会清掉全部缩略图（失败时保留上一份列表，不修剪）；门缝档的门在门卡与追踪里露出"还差 N 把钥"（只从显影档起显示）。SHOULD-FIX：回廊打开时再开普通窗口会被压在模式层下（先离开模式）已修；设置、存档、菜单、帮助不暂停世界（按第 1.3 节暂停，确认弹层同）已修；改键页的滑杆被自己的写入重建而丢焦点已修；导入不查一键两用（按改键的冲突检查整份拒收）已修；已结束页的先后顺序（视图没有结束时刻）转遗留；铁人退出存档失败无提示（标题上说明）已修。NIT：缩略图兜底定时器已清；缩略图签名（同一存档时刻只有一张图，实际不会误判）不改；引导级别在开局成功前已写入（无副作用）不改 |
| 覆盖审查：故事与 HUD 一侧 | 0 条 BLOCKING、11 条 SHOULD-FIX、6 条 LOW、2 条 NIT | 已修：同一节点追加台词时从第一行重打；散句收起 HUD 并压住通知与提示；排队的通知 60 秒过期（过场中永不过期，只有普通级会过期）；新任务出两条通知；确认弹层没接"长按改切换"；确认弹层不认手柄；关掉回看或窗口的那一下 Esc 被算进跳过长按；打字中按数字键提前选中；没有故事时每帧仍建模型（空闲时直接返回）；对话打字时每帧强制布局；白场在减少闪烁下仍是全屏闪白、黑白场无过渡、遮住时仍自动推进；矮屏追踪只显示最早的 3 条；被拒的自由输入行不回来；关闭后残留半句输入；窗口暂停世界时自动推进仍向内核排队；跨级别挤掉通知的比较；会话销毁时不收起确认框。转遗留：画手每帧写同值的 `hidden`、散句之间同一对象不重打、同一节点再次进入不重放指令、不再使用的旧文件与字段、追踪的读屏标签不随语言重画、提示条在传送后不重定原点 |

## 4. 基线问题（与本包无关）

| 失败 | 原因 | 归属 |
| --- | --- | --- |
| `tests/art_manifest.test.ts` | 用户未跟踪的美术文件 | 已知基线 |
| `tests/client_adapters.test.ts`、`client_player_input.test.ts`、`client_gamepad_playthrough.test.ts`、`save_recovery.test.ts`、`save_migration.test.ts` 的冻结样本 | 新的 `ailments` 系统写了未登记的旗标 `sed_case.milo`，旗标守卫抛错 | PK-M1-51 |
| `tests/registry.test.ts` 三项 | `ailments` 内容引用未登记变量；音频的 `tension_high` 旗标字面量 | PK-M1-51、PK-M1-06 |
| `tests/i18n_ui_strings.test.ts`、`node tools/i18n/check.ts` 的一条 | 内容数据改动后 `content.generated.json` 未重新抽取 | 内容各包（落定后跑 `node tools/i18n/extract_content.ts`） |
| `tests/guild.test.ts`、`guild_events.test.ts` | 公会包进行中 | PK-M1-47 |
| 类型检查：`src/systems/combat`、`inventory`、`npc`，`tests/disputes.test.ts` | 并行包进行中 | PK-M1-11、PK-M1-13、PK-M1-18、PK-M1-46 |
