# PK-M1-53 门内庭院功能：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-19 | 实施 1 | 进门规则与冷却、身份暴露、储物往返测试、陈列、园圃档位、扩建一档、数据校验与旧存档 | 未提交 | 见 `verification_matrix.md` | 覆盖性复查 |
| 2026-11-19 | 覆盖性复查与修复 | 新起子代理复查一轮（9 条加测试意见）；修：取下前先占库房的位、存入时扣掉这份占位、陈列条目的物品 ID 进改名表、闭合开关可按数据点名的闭合地块算门、`court` 块校验补 `switchTiles` 与 `anchorTags`、视图的陈列条目给副本、陈列可指定堆叠限定字段；测试补限定字段的陈列往返、取下时库房满、死亡时陈列不动、污染件数排除背包、身份暴露恰好两次、修正项为零时园圃照产、旧存档经 JSON 往返再续跑 | 未提交 | 见 `verification_matrix.md` | 主会话提交；第 3 节请求转出；第 4 节待用户定 |

## 2. 汇报

### 2026-11-19 实施 1 与复查修复

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/city/court_tiers.ts` | 新增 | 纯函数：扩建档 `courtTier`（最后一个旗标全真的档为当前档，之前各档的陈列位累加，上限与库容按档覆盖）、`buildingCap`、门的可及判定 `doorWithinReach`、`court` 块校验 `courtConfigProblems` |
| `src/systems/city/court_display.ts` | 新增 | 命令 `city.display_put`、`city.display_take`；整点结算 `settleDisplay`；改名表字段 `COURT_ID_FIELDS` |
| `src/systems/city/court_view.ts` | 新增 | 查询 `courtView`（档、门前与冷却、库容、陈列位与条目、按档上限、污染件数）；`TAINT_TAG` |
| `src/systems/city/court.ts` | 修改 | `enterCourt` 加门前判定与冷却、传送成功后才记 `returnTo` 与 `lastEnterTick`、发身份暴露；`leaveCourt` 传送成功后发身份暴露（其余不变）；`deposit` 的库容读扩建档并扣掉取下占位；新增 `atCourtDoor`、`courtCooldownLeft`、`displayReserve` |
| `tests/court.test.ts` | 新增 | 20 条 |
| `data/city/sites.json` | 修改（庭院一行） | 加 `court` 块：`door { tiles: ["door"], reach: 1.5, cooldownMinutes: 0 }`、`displayOwner: "site:inner_court:display"`、`takeDownDays: 1`、两档 `initial`（架 3、园圃 3）与 `granary`（`requiresFlags: ["feature.court_expansion_1"]`，柜 6、园圃 5、`court_store` 1200） |
| `data/city/buildings.json` | 修改（庭院一行） | `court_garden` 的 `max` 3 改 9（城建目录 4.2"IV 起 9"的绝对上限；每档的上限在 `court.tiers`） |
| `locales/zh-Hans/sys_city.json` | 修改（只加 9 键） | `sys.city.info.display_taking`、`sys.city.info.displayed`、`sys.city.reject.court_cooldown`、`court_no_door`、`display_case`、`display_full`、`display_item`、`display_missing`、`display_pending` |
| `src/systems/city/types.ts` | 修改（城建内，追加） | 导入 `StackQualifiers`；`SiteDef.court?: CourtConfig`；新类型 `CourtDoorRule`、`CourtCaseDef`、`CourtTierDef`、`CourtConfig`、`CourtDisplayEntry`；`CitySlice.court` 加可缺省的 `lastEnterTick`、`display`；事件 `city.court_display`；命令 `city.display_put`、`city.display_take` |
| `src/systems/city/index.ts` | 修改（城建内，追加） | 导入并注册两条陈列命令；`world.hour` 末尾加一行 `settleDisplay(ctx)`；导出 `atCourtDoor`、`courtCooldownLeft`、`displayReserve`、`COURT_ID_FIELDS`、`displayEntries`、`buildingCap`、`CourtTier`、`courtConfigProblems`、`courtTier`、`CourtView`、`courtView`、`TAINT_TAG`；系统对象的类型写成 `GameSystem & { idFields: typeof COURT_ID_FIELDS }` 并加 `idFields: COURT_ID_FIELDS` |
| `src/systems/city/common.ts` | 修改（城建内，越出本包所有） | `storageCap` 加必填参数 `flags`，建筑库容先读 `courtTier(def, flags)?.buildingStorage[b.defId]`，再读建筑定义；导入 `courtTier` |
| `src/systems/city/daily.ts` | 修改（城建内，越出本包所有） | 两处 `storageCap(site, sdef, ctx.content)` 改为 `storageCap(site, sdef, ctx.content, ctx.world.meta.flags)` |
| `src/systems/city/production.ts` | 修改（城建内，越出本包所有） | `runProduction` 两处 `storageCap` 同上（库存预算与入库） |
| `src/systems/city/placement.ts` | 修改（城建内，越出本包所有） | `unlockCheck` 的上限由 `def.max` 改为 `buildingCap(sdef, def, world.meta.flags)`，拒绝原因的 `max` 参数随之；导入 `buildingCap` |
| `src/content/packs/city.ts` | 修改（城建内，越出本包所有） | 导入 `courtConfigProblems`；`city_sites` 表加字段 `court`（json，编辑器帮助串列出键）；`validate` 在"more than one court site"之后加 `problems.push(...courtConfigProblems(content))` |
| `tests/city.test.ts` | 修改（城建内，越出本包所有，2 行） | "door node"一例在进庭院前先 `world.teleport` 到旧哨村旧粮仓门下（35.5, 36.5），注释"the court opens from a closed door: the old granary's door on the outpost map" |
| `data/README.md` | 修改（越界，一行） | `city/` 一行末尾加"；门内庭院的门、陈列与扩建档（`sites.json` 庭院一行的 `court` 块）" |
| `src/core/text_keys.generated.ts` | 重生成（越界） | `node tools/i18n/gen_keys.ts`；本包的 9 键之外的差异出自并行包 |
| 本目录 | 新增 | 三件套 |

`docs/40_design/world_state_registry.md` 与 `locales/zh-Hans/ui.json` 没有改：本包不新增旗标，`feature.court_expansion_1` 的读取方一栏原已写 `data/city/*.json`；界面键归客户端的庭院窗口。

**各交付物的结果**

| 序 | 交付物 | 结果 |
| --- | --- | --- |
| 1 | 从关着的门进入与冷却 | 判定在实时地图上做：门地块的格心离玩家不超过 `reach`（1.5 格，含斜邻）；按旗标闭合的开关按它的闭合地块算（闭合地块是门就算门；`switchTiles` 可再点名别的闭合地块，例如画成墙的铁闸）；`anchorTags` 点名的地点按矩形距离算。现有地图的开关都是落石，不算门；没有地图写门的标签。冷却 `cooldownMinutes` 现值 0；非零时拒绝原因带剩余分钟。拒绝码 `no_door`、`cooldown`；`locked` 与 `already` 仍在前 |
| 2 | 身份暴露 | 形状与 PK-M1-56 请求 4 一致：进门在 `from`（进门前的位置），出门在传送后的玩家位置；拒绝时不发 |
| 3 | 储物 | 已有的 `takeItems`/`putItems` 整件搬；测试钉了实例记录与 `sedTier` 堆叠往返相等、库容 200 处拒绝、不在庭院时拒绝、`dropBag` 只取背包（库房与陈列都不动） |
| 4 | 陈列 | 选"取下要等一日"的读法为"取下这个动作要一日"：`display_take` 记 `takeDue = 当前 tick + takeDownDays × 一日`，到期前物仍在陈列上、仍占位；到期后的第一个整点收进庭院库房（不回背包：庭院里的东西不经玩家就不出门）。开始取下要库房有位，这一位在落库前从存入里扣掉。陈列持有者 `site:inner_court:display` 来自数据；一件一位；可指定实例或堆叠限定字段；不在庭院时拒绝。陈列不给任何战斗字段（第 5 条：持有者不是实体，没有装备位） |
| 5 | 园圃 | 产出已有（`court_garden`，`herb` 2、`grain` 2，`immuneToModifiers`）；测试在收获与生产两个通道各挂一个系数 0 的修正项后，5 圃 3 日仍是各 30 份；圃数上限接上档位 |
| 6 | 扩建一档 | 旗标为真后档位 `granary`：陈列位 架 3 加 柜 6、园圃 5、每座 `court_store` 1,200（库容 200 加 1,200） |
| 7 | 校验与旧存档 | `court` 块的各字段在城建 pack 校验里检查；切片缺 `lastEnterTick`、`display` 的旧存档经 JSON 往返后续跑、进门、陈列都正常 |

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 一幕 9.2 对旅行 5.1 | 一幕写"有冷却"，旅行总表写"冷却：无" | 冷却写进数据，现值 0 | 不替用户定数；推荐值见第 4 节第 1 条 | 是（第 4 节第 1 条） |
| 旅行 5.1 对一幕 9.2 | 旅行写"任意可用地点到庭院"，一幕写"在任意一扇关着的门前推门" | 按一幕：要站在门前 | 计划包行写"从任意关着的门进入" | 否 |
| 遗物目录 1.7 第 1 条 | "陈列即锁定……取下要等一日" | 取下是一个要一日的动作，完成后进庭院库房 | 与第 9 条"取下与换上各要一日"同一种读法（动作耗时） | 是（第 4 节第 2 条） |
| 城建目录 4.2 对千门 13 | 园圃：目录 4.2 写扩建一档 5 圃，千门 13 写 6 圃 | 5 圃 | 计划包行与城建目录为准 | 是（第 4 节第 4 条，回头改千门 13） |
| 城建目录 4.2 对 4.1 | 4.2 把"二级柜 6"写在小仓库一行；4.1 与遗物 1.7 写柜 6 随扩建一档解锁 | 按档解锁，不看有没有建小仓库 | 4.1 与 1.7 是陈列位的出处 | 否 |
| 城建目录 4.2 `bld_court_garden` | 产出 `herb` 2、`grain` 2，或庭草 `herb_garden` 2、庭蔬 `mat_garden_greens` 2 | 保持前者 | 物品 `herb_garden` 不存在（`herb_garden` 只是领地的药圃建筑 ID）；庭蔬虽有但没有产出方 | 否（转 PK-M2-06） |
| 城建 2.2 对现数据 | 小仓库储 300；庭院本身的底容没写 | 保留原数据的底容 200 与小仓库上限 2 座；二级按每座 1,200 | 不在本包改既有数值 | 否（转 PK-M2-06） |

## 3. 遗留事项与请求

**请求**

| 序 | 请求 | 内容 | 接收方 |
| --- | --- | --- | --- |
| 1 | 庭院界面 | 领地窗口的"进入门内庭院"按钮现在大多会被拒（要站在门前），请按 `courtView().door.near` 与 `cooldownLeft` 置灰并说明；庭院窗口：档位、库容（`courtView().storage` 是实时值；`settlementView` 的 `storage.cap` 是每日结算时的缓存，旗标翻转后要到下一日才变）、陈列位与条目、`city.display_put`（可带 `instanceId`、`qualifiers`、`caseId`）与 `city.display_take`、按档上限、污染件数；陈列位的显示名（`shelf`、`cabinet`）做成 `ui.*` 键；`src/client/adapters/domain.ts` 加两条命令 | 客户端 |
| 2 | 战斗中进门 | 设计没有明写庭院之门在战斗中能不能推（千门 2.3 只说"非战斗时刻入廊"）；城建不能导入战斗。若用户定为拒绝，请整合时给城建一个"玩家是否在战斗中"的查询（或由世界端口写一个实体标签），`enterCourt` 再加一行 | 总负责人（整合接线） |
| 3 | 陈列锁的旁路 | `inventory.give` 与 `inventory.use` 收任意 `fromId`、`ownerId`，所以 `inventory.give { fromId: 'site:inner_court:display', ... }` 能绕过"取下要等一日"，并留下一条占位的陈列条目；库房持有者原本也有同样的口子。请把这两条命令的出货方限制为玩家可支配的持有者 | 内核（库存） |
| 4 | 淤积的效果 | 遗物 1.7 第 2 条：秘仓以外的带澱之物每件让庭院淤积一点，拖慢门中淤塞的恢复；件数已在 `courtView().tainted`（现在只认物品标签 `tainted`，不认实例或堆叠的澱纹档） | 千门、澱病 |
| 5 | 千门测试的站位 | `tests/doors_features.test.ts` 的 `inner_court` 一例能过，是因为开局点（神庭候见厅 10.5, 13.5）离一格帘门 1.41 格；建议先传送到门前再进；`tests/doors_keys.test.ts` 的 `court_display` 可改用真实持有者 `site:inner_court:display`（不改也不影响结论） | 战斗（千门测试） |
| 6 | 过场地图上的门 | 门规则对所有地图生效，神庭候见厅与几张地球场景图都有门地块；请过场方确认过场期间玩家发不出 `city.enter_court`，否则见第 4 节第 5 条 | 叙事（过场） |
| 7 | 目击计数 | 旅行 5.1"在信徒面前开门计目击"：本包只发 `identity.exposed`（旁人反应）；是否另计入女神的知晓度（力量 9.8）由认知与女神方定 | 社会（认知）、叙事（女神） |
| 8 | 开关的闭合状态 | 判定闭合开关时用的是"实时地图在开关格上是不是它的闭合地块"，因为城建不能导入任务的条件求值；世界系统若导出 `closedSwitchIds(map, flags)` 会更直接 | 内核（世界） |

**遗留事项**

| 事项 | 建议去处 |
| --- | --- |
| 扩建二档到五档的 `court.tiers`（兵器架 4、书斋 10、秘仓 4、无名祠 6、调度室 7，园圃 6、7、9） | PK-M2-06 |
| 各陈列位的收物规则：架只收"小件"（物品数据没有大小字段）、兵器架只收武器盾等、带澱之物与神器只能进秘仓（第 2、3 条；物品没有"神器"的标记） | PK-M2-06（与物品目录） |
| 庭井 `bld_court_well` 与 `mat_garden_well_water`、庭草 `herb_garden`（物品缺）与庭蔬的产出；生业目录 6.10 的 `node_garden_plot`、`node_garden_well` 是 T0，生业校验只收 1 到 6 阶 | PK-M2-06、生业 |
| 庭格、门息、受邀者、门扉与吞吐 | PK-M2-06 |
| 取下等待期间，园圃产出可能占掉为取下留的那一位，落库时最多超出库容"正在取下的件数" | PK-M2-06 |
| 物品被删除（改名表 `removed`）时，它的陈列条目占位到被取下为止，结算时丢掉 | PK-M2-06 |
| 陈列的便利效果与收藏完成（第 5 到 8 条） | 遗物与收藏批次 |

## 4. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 庭院之门的冷却 | 现为 0（旅行 5.1）；若按一幕 9.2"有冷却"，推荐用位移类共享冷却的 30 游戏分钟（旅行 5.1 的回门符一行；消耗品目录的 `cd_charm`），改 `sites.json` 的 `court.door.cooldownMinutes` 即可 | 不阻塞 |
| 2 | "取下要等一日"的读法 | 现为"取下要一日，完成后进庭院库房"；另两种：取下要一日、完成后回背包（玩家不在庭院也会拿到）；或"摆上满一日之前不许取下、取下立刻回手" | 不阻塞 |
| 3 | 战斗中能否推门进庭院 | 推荐拒绝（与"非战斗时刻入廊"一致，也免得庭院成了脱战键）；要整合给战斗状态查询（第 3 节请求 2） | 不阻塞 |
| 4 | 扩建一档的园圃数 | 推荐 5（城建目录 4.2，计划包行），并把千门 13 的"6 圃"改成 5；或改数据为 6 | 不阻塞 |
| 5 | 过场地图与异界地图上能否推门 | 推荐不能：给门规则加一个按区域排除的数据字段；若过场本来就锁住输入则不必 | 不阻塞 |

## 5. 延后测试

| 套件或命令 | 为什么可能受影响 |
| --- | --- |
| `npm test` 全量 | `storageCap` 的签名变了（城建内全部调用已改）；城建系统多了 `idFields`；进庭院要站在门前 |
| `npm run playthrough`（`release`、`act1_minimal`） | 自动玩家只发 `city.leave_court`，过场直接把玩家放进庭院；仍需通关确认没有一处靠 `city.enter_court` |
| `tests/client_windows.test.ts`、`tests/client_*territory*` | 领地窗口的进出庭院按钮 |
| `tests/combat.test.ts`、`tests/combat_rules.test.ts` | 死亡后在庭院复苏（本包未改，`tests/combat.test.ts` 已跑过） |
| `tests/save_*.test.ts` 其余 | 城建切片新字段与改名表 |
