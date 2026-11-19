# PK-M1-53 门内庭院功能：验收与证据

## 一览

| 项 | 内容 |
| --- | --- |
| 结论 | PASS-WITH-FOLLOWUPS（计划包行的两条验收"进出与冷却、储物往返单测"通过；任务给的七项交付在内核侧落地并有测试；界面、战斗中的拒绝、淤积效果与扩建二档起转出，见 `progress.md` 第 3、4 节） |
| 末次代码或内容变更 | 2026-11-19，未提交（文件见 `progress.md` 第 2 节） |
| 完整实跑 | 2026-11-19，与并行包共用工作区 |
| 审查 | 新起子代理覆盖性复查一轮：无 BLOCKING；9 条意见与 7 条测试意见，修复与转出见第 3 节 |
| 遗留 | `progress.md` 第 3 节 |

## 1. 验收条目

计划包行验收栏："进出与冷却、储物往返单测"。

| 序 | 验收 | 命令或评审 | 结果（原样要点与量化数字） | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | 从门前进入，离门拒绝 | `tests/court.test.ts`"opens from a door tile within reach and refuses away from one" | 离门 11 格与 2.24 格拒绝 `no_door`（原因键 `sys.city.reject.court_no_door`），斜邻 1.41 格进入；没有门功能时仍是 `locked` | `tests/court.test.ts` | PASS |
| 2 | 闭合开关与数据点名的门 | 同上"counts a switch closed by the flags by its closed tile, and a tagged location" | 闭合成门地块的开关算门、打开后不算；画成墙的铁闸只在 `switchTiles` 点名时算，打开后不算；带 `anchorTags` 标签的地点在可及距离内才算 | 同上 | PASS |
| 3 | 冷却 | 同上"has no cooldown with the shipped value of 0"与"waits out a cooldown written in data" | 现值 0：出门立刻再进；测试副本 30 分钟：出门后拒绝 `cooldown`（剩 30 分钟），到期前最后一 tick 拒绝（剩 1 分钟），到期那一 tick 进入 | 同上 | PASS |
| 4 | 身份暴露 | 同上"shows the player going through a door at both ends" | 恰好两条 `identity.exposed`：`identity_door` 在进门前的位置、在出门后的位置；拒绝的进门不发 | 同上 | PASS |
| 5 | 储物往返 | 同上"moves an instanced piece and a qualified stack in and out with their records" | 武器实例（`marks` 7、署名）存取前后记录逐字段相等；`sedTier` 1 的药草 4 份进出都在同一限定格 | 同上 | PASS |
| 6 | 库容与在场 | 同上"stops at the storage cap and needs the player inside" | 库容 200：存 200 成功、再存 1 份 `storage_full`；出庭院后取 `not_here` | 同上 | PASS |
| 7 | 死亡不遗落庭院之物 | 同上"keeps stored goods through a death" | `dropBag` 后背包 39 份剩 30，库房 40 份、陈列 1 份不变 | 同上 | PASS |
| 8 | 陈列：持有者、陈列位、取下一日 | 同上"holds pieces under its own owner…"与"keeps a stack key through the display…" | 实例记录到陈列持有者名下不变；架 3 满后 `display_full`；未开的柜 `no_case`；取下后到期前一 tick 仍在陈列上且占位，到期后整点进库房，记录不变；事件序列 `put` ×3、`taking`、`taken`；限定字段的那一份往返仍在 `sedTier` 1 格 | 同上 | PASS |
| 9 | 取下占库房的位 | 同上"starts a take-down only with room in storage, and holds that room back" | 库房满时取下 `storage_full`；腾出一位后取下成功，那一位不再收存入；落库后库容 200/200 | 同上 | PASS |
| 10 | 陈列中的物不开门 | 同上"a displayed piece turns no item key" | 物钥门在背包有甲壳时钥满足，摆上陈列后不满足，开门 `no_key` | 同上 | PASS |
| 11 | 污染件数只进视图 | 同上"counts tainted pieces in the court as a view field only" | 库房 2 件加陈列 1 件计 3，背包里的 1 件不计 | 同上 | PASS |
| 12 | 园圃按档与日产 | 同上"caps the plots by tier (3, then 5)…" | 初开第 4 圃 `limit`（`max` 3）；旗标后到 5 圃，第 6 圃 `limit`（`max` 5）；收获与生产两通道挂系数 0 的修正项，5 圃 3 日仍各产 `herb` 30、`grain` 30 | 同上 | PASS |
| 13 | 扩建一档 | 同上"adds the cabinet of 6 and the second-level store of 1,200 with the flag" | 一座小仓库：初开库容 500，旗标后 1,400；陈列位从架 3 到架 3 加柜 6，九件后 `display_full`；旧哨村没有档位 | 同上 | PASS |
| 14 | 数据校验 | 同上"the court block in data"两条 | 出货数据无问题；坏数据逐项报出（未知地块、未知开关地块、`anchorTags` 不是名单、可及距离、冷却、持有者、取下天数、首档带旗标、档重复、陈列位重复与位数、园圃上限超过建筑上限、非庭院建筑、库容非整数） | 同上；`node tools/content/validate.ts` V1 0 错误 | PASS |
| 15 | 旧存档 | 同上"reads an older save without the new court fields" | 切片 `court` 只有 `returnTo` 的世界经 JSON 往返后续跑：陈列为空、冷却 0、进门与陈列正常 | 同上 | PASS |

## 2. 命令与结果

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 退出码 0 |
| `node tools/content/validate.ts` | V1、V2、V3、V4（0 错误，334 告警，没有一条涉及城建或庭院）、V6、V7、V9、V10 绿；V5 2 个错误（女神 `janu` 的尊名）、V8 16 个错误（台词包吠叫池），都不是本包的数据 |
| `node tools/registry/build.ts --check` | 37 条中 1 条失败：`src/client/tutorial/check.ts line 234: tut.*`（客户端教程，不是本包） |
| `node tools/i18n/check.ts` | `text check: 0 finding(s) {}; 2714 key uses scanned` |
| `npx vitest run --config vitest.config.ts tests/court.test.ts tests/city.test.ts tests/doors_keys.test.ts tests/client_feature_labels.test.ts tests/doors_features.test.ts tests/content_id_guard.test.ts tests/save_renames.test.ts tests/save_migration.test.ts` | `Test Files 8 passed (8)`，`Tests 120 passed (120)`（其中 `tests/court.test.ts` 20 条） |
| `npx vitest run --config vitest.config.ts tests/combat.test.ts` | 通过（庭院复苏未受影响） |
| `npm run format -- <本包新增的 TS>`；`biome check` 城建内改过的文件与 JSON | 无待修 |

## 3. 审查

| 角色 | 派出原因 | 结论 | BLOCKING | SHOULD-FIX | 处理 | 报告位置 |
| --- | --- | --- | --- | --- | --- | --- |
| 覆盖性复查（新起子代理，只读） | 包行与请求的覆盖、测试的区分力 | PASS-WITH-FOLLOWUPS | 0 | 9 | 已修：陈列条目进改名表（`idFields`）；取下先占库房的位并从存入里扣；闭合开关可按 `switchTiles` 点名；校验补 `switchTiles`、`anchorTags` 与 `tiers` 的形状；视图条目给副本；测试补限定字段陈列往返、取下时库房满、死亡时陈列不动、污染件数排除背包、身份暴露恰好两次、修正项为零时园圃照产、旧存档经 JSON 往返。转出：库存命令的出货方限制（请求 3）、过场地图上的门（请求 6、第 4 节第 5 条）、陈列位收物规则与柜随小仓库（PK-M2-06）、界面接线（请求 1）、`settlementView` 的库容缓存（请求 1 注明） | 本会话 |

## 4. 基线问题

| 命令 | 失败 | 证明与本包无关的依据 | 归属 |
| --- | --- | --- | --- |
| `node tools/content/validate.ts` | V5 女神 `janu` 尊名 2 个；V8 吠叫池 16 个 | 失败条目在 `data/goddess/`、`data/dialogue/`；PK-M1-32 的记录里同样存在 | PK-M1-34、PK-M1-29 |
| `node tools/registry/build.ts --check` | `tests/registry.test.ts`：`src/client/tutorial/check.ts line 234: tut.*` | 客户端教程文件 | 客户端 |
| `npx vitest run --config vitest.config.ts tests/architecture.test.ts` | "systems/ has no DOM access"：`src/systems/dialogue/lines/repetition.ts` | 对话系统文件 | 社会（对话） |
| `npx vitest run --config vitest.config.ts tests/i18n_kernel_guard.test.ts` | CJK 字面量 `src/systems/dialogue/intent/head.ts`；源字符串表文件清单多出并行包的新表 | 对话系统文件与并行包新增的 `sys_*.json` | 社会（对话）、各并行包 |
| `npx vitest run --config vitest.config.ts tests/content_validation.test.ts` | V5、V8 同上两条 | 同上 | PK-M1-34、PK-M1-29 |

## 5. 未验证项

| 条目 | 缺什么环境或证据 | 由谁、何时补 |
| --- | --- | --- |
| 全量 `npm test` 与 `npm run playthrough` | 按要求本次不跑 | 主会话合入前 |
| 庭院窗口与进门按钮的界面 | 客户端未接 | 客户端（请求 1） |
| 战斗中进门的拒绝 | 待用户定，需整合给战斗状态查询 | 用户与总负责人（第 4 节第 3 条、请求 2） |
| 经真实死亡流程（而非直接调 `dropBag`）进庭院后庭院之物仍在 | 死亡流程由战斗系统驱动；本包只钉了遗落这一步 | 下一次通关实跑 |
