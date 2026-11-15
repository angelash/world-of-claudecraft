# 实现约定

> 所有实现者（人与 AI 代理）共同遵守的跨系统约定。契约代码在 `src/core/`（尤其 `contracts.ts`、`shared_events.ts`、`ai_port.ts`）；
> 本文记录"命名与协作"层面的约定，第 1、2 节写的是现有可玩版本（已建十张图）的分工与地图。与 `architecture.md` 冲突时以 `architecture.md` 为准。

## 1. 文件所有权

| 负责方           | 目录与文件                                                                                                                                                                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 内核（总负责人） | `src/core/**`、`src/systems/world/**`、`src/systems/modifiers/**`、`src/systems/inventory/**`、`src/content/index.ts`、`src/content/pack.ts`、`src/content/packs/world.ts`、`src/content/packs/inventory.ts`、`src/game/create.ts`、`src/game/registry.ts`、`tests/core.test.ts`、`tests/architecture.test.ts` |
| 战斗             | `src/systems/combat/**`、`src/systems/doors/**`、`src/systems/party/**`、`src/content/packs/{combat,doors,party}.ts`、`data/{combat,doors,party}/**`、`tests/{combat,doors,party}*.test.ts`                                                                                                                    |
| 社会             | `src/systems/npc/**`、`src/systems/cognition/**`、`src/systems/dialogue/**`、对应 packs、`data/{npc,cognition,dialogue}/**`、对应测试                                                                                                                                                                          |
| 叙事             | `src/systems/goddess/**`、`src/systems/director/**`、`src/systems/quests/**`、`src/systems/scenes/**`、对应 packs、`data/{goddess,quests,scenes}/**`、对应测试                                                                                                                                                 |
| 领域             | `src/systems/economy/**`、`src/systems/city/**`、`src/systems/warfare/**`、`src/systems/strategy/**`、对应 packs、`data/{economy,city,warfare,strategy}/**`、对应测试                                                                                                                                          |
| AI 层            | `src/ai/**`、`src/game/ai_roles/**`、`tools/dev_api.ts`、`tests/ai*.test.ts`                                                                                                                                                                                                                                   |
| 客户端           | `index.html`、`vite.config.ts`、`src/client/**`、`src/shared_ui/**`、`tests/client*.test.ts`                                                                                                                                                                                                                   |
| 编辑器与工作台   | `editor.html`、`src/editor/**`、`tests/editor*.test.ts`                                                                                                                                                                                                                                                        |

## 2. 地图 ID 与归属

| 地图 ID             | 名称               | 负责方 | 说明                                        |
| ------------------- | ------------------ | ------ | ------------------------------------------- |
| `divine_court`      | 神庭候见厅         | 叙事   | 序章与第六幕；worldStart 优先级 10 指向这里 |
| `seal_ruins`        | 封门遗迹（上层）   | 战斗   | 玩家序章后在此醒来（地点 `wake_point`）     |
| `seal_ruins_depths` | 封门遗迹深处       | 战斗   | 守护巨鸦、阿什的灰烬室                      |
| `forest_edge`       | 林缘               | 战斗   | 猎区、魔物                                  |
| `ash_waste`         | 灰烬荒原外缘       | 战斗   | 第一幕起经旧哨村可达（外缘南段），主用第一到三幕 |
| `wallenburg_sewers` | 旧水道迷宫         | 战斗   | 第二幕迷宫                                  |
| `borderstone`       | 边石镇             | 社会   | 第一幕主舞台                                |
| `wallenburg`        | 瓦伦堡（精简城区） | 社会   | 第二幕                                      |
| `old_outpost`       | 旧哨村             | 领域   | 城建地图（第二幕起），后为领地核心          |
| `inner_court`       | 门内庭院           | 领域   | 私人领域与复活点                            |

- 地图之间的出口用 `ExitDef.toLocation` 指向目标地图上的到达地点，到达地点 ID 统一为 `gate_<来源地图 ID>`，例如边石镇北门通往遗迹：
  边石镇的出口 `toMap: 'seal_ruins', toLocation: 'gate_borderstone'`，遗迹地图必须提供地点 `gate_borderstone`。
- 现有可玩版本必须连通的路线：`seal_ruins` 与 `borderstone`、`borderstone` 与 `forest_edge`、`borderstone` 与 `old_outpost`、
  `borderstone` 与 `wallenburg`、`wallenburg` 与 `wallenburg_sewers`、`old_outpost` 与 `ash_waste`、`seal_ruins` 与 `seal_ruins_depths`。
  `inner_court` 不靠出口进入，由"门内庭院"能力传送。
- 地块字符图例由各地图自带，地块种类见 `src/systems/world/types.ts` 的 `TileKind`。
- 地图的外观层（`style` 风格包、`looks` 逐地点建筑外观、`decor` 装饰）由该地图的负责方填写，只影响画面、不影响玩法；
  没写 `style` 时按 `region` 选风格包。风格包与装饰种类的编号表在 `src/systems/world/look.ts`（内核负责方维护），
  HD-2D 渲染实现在 `src/client/hd2d/`（客户端负责方）。规则见 `art_pipeline.md` 第 5.1、5.2 节。

## 3. NPC 与同伴 ID（取自揭示台账的角色代号）

| ID        | 人物       | 说明                                              |
| --------- | ---------- | ------------------------------------------------- |
| `shiya`   | 希雅       | 第一幕 NPC；招募后成为同伴                        |
| `ron`     | 罗恩       | 同上                                              |
| `yeyu`    | 夜羽       | 从者，不作为普通 NPC 出现，由战斗方的同伴系统生成 |
| `nera`    | 奈拉       | 狐族商人（商会分号）                              |
| `oola`    | 欧拉婆婆   | 药草婆婆                                          |
| `cassian` | 卡西安神父 |                                                   |
| `martha`  | 玛莎       | 醉月亭老板娘                                      |
| `bron`    | 老布伦     | 公会分部长                                        |
| `moss`    | 代官莫斯   |                                                   |
| `ash`     | 守门人阿什 | 封门遗迹深处，战斗方生成为不可攻击的存在          |

其他 NPC 由社会方自定 ID（小写英文加下划线）。全作人物的 ID 以人物目录（`../40_design/content/catalog_characters_lotha.md`、
`catalog_characters_continent.md`）为准。

**人物 ID 别名表**：台账变量与分幕文档里仍有几处不同的拼法，变量名不改，导入时按下表解析到同一个人物 ID。

| 人物 ID | 别名（只在变量或分幕文字里出现） | 人物 |
| --- | --- | --- |
| `night_queen` | `vespera`（`trust.vespera`） | 夜后维丝佩拉 |
| `oola` | `ola`（`trust.ola`） | 欧拉婆婆 |
| `bron` | `brun`（`brun.secret_kept`） | 老布伦 |
| `viro` | `vero`（战斗数据的首领 ID） | 薇罗 |

**战斗模板 ID**：与人物同名的对手战、挑战段与首领模板一律写作 `<人物 ID>_<场面>`（例：`rogo_breakchain_duel`、`mute_bell_chase`、`lu_chen_duel`），
不与人物 ID 重名；挑战段另用 `trial_<人物>_<场面>`。

招募约定：同伴被招募时，设置旗标 `companion.<id>.recruited = true`；NPC 系统看到这个旗标后，隐藏它自己生成的同名 NPC 实体，
同伴系统生成同伴实体。同伴实体的 `ref` 等于同伴 ID。

## 4. 旗标（world.meta.flags）命名

| 前缀                       | 用途               | 示例                                                                                                                                     |
| -------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `act`                      | 当前幕次（字符串） | `prologue`、`act1` 到 `act6`、`epilogue`                                                                                                 |
| `feature.<名>`             | 玩法功能解锁       | `feature.inner_court`、`feature.company`、`feature.city`、`feature.rts`、`feature.slg`、`feature.appraise_talent`、`feature.travel_gate` |
| `door.<门 ID>`             | 已开之门           | `door.first_awakening`                                                                                                                   |
| `companion.<ID>.recruited` | 同伴已招募         |                                                                                                                                          |
| `quest.<任务 ID>`          | 任务状态           | `active`、`done`、`failed`                                                                                                               |
| 揭示台账变量               | 世界状态           | `seal_looseness`、`seal_unrest`、`a1_oola_fate`、`autonomy`、`release_index` 等，名称与类型以[变量注册表](../40_design/world_state_registry.md)为准（D-076） |
| `<系统>.<名>`              | 系统里程碑         | `econ.company_founded`、`city.village_founded`、`war.first_battle_won`、`slg.nation_founded`                                             |

里程碑一律写旗标，任务与揭示台账只看旗标与事件，不直接读别的系统的切片。

脚本触发用旗标（触发方写，执行方监听 `flag.changed`）：

| 旗标                           | 写入方             | 执行方       | 含义                                                          |
| ------------------------------ | ------------------ | ------------ | ------------------------------------------------------------- |
| `combat.wave.<波次 ID>` = `go` | 叙事（任务、导演） | 战斗         | 按战斗内容表 `waves` 中的定义生成一波魔物（兽潮等）           |
| `war.pending` = 场景 ID        | 叙事               | 领域与客户端 | 有一场战役等待玩家开战；玩家（或自动玩家）发 `war.start` 开始 |
| `scene.pending` = 场景 ID      | 任意               | 叙事         | 请求播放一段场景（梦境、过场）                                |
| `xp.awarded` 事件              | 任意               | 战斗         | 给实体加经验（任务奖励等）                                    |

## 5. 实体标签约定

生成实体的系统负责写入以下标签，其他系统（认知、鉴定、战场、城建）只读：

- `lvl:<n>` 等级（玩家的真实等级由战斗方维护，鉴定时由认知方按 D-029 显示"无记载"）；
- `tier:<n>` 位阶 0 到 7；
- `npc`、`monster`、`boss`、`elite`、`companion`、`hostile`、`friendly`、`merchant`、`priest`、`guard` 等身份标签；
- `faction:<id>` 势力。

## 6. 跨系统协作方式

1. 事实用事件：`src/core/shared_events.ts` 中声明的共享事件（`feat.performed`、`entity.died`、`player.talked`、`player.said`、
   `door.opened`、`feature.unlocked`、`act.changed`、`dialogue.*`、`building.completed`、`battle.ended` 等）任何系统都可订阅。
2. 里程碑用旗标（见第 4 节）。
3. 资源与物品用 `src/systems/inventory` 的端口（`addItem`、`removeItem`、`addMoney`、`spendMoney`）；物品定义放进各自 pack 的
   `items` 表（字段见 `src/content/packs/inventory.ts` 的 `ITEM_FIELDS`）。持有物分两种（D-072）：可堆叠商品记数量，带实例的物品记实例（词缀、器痕、署名、澱纹与净化状态、耐久），
   即 `Holding.items` 拆为堆叠 `stacks` 与实例 `instances`；`ItemDef` 增加 `procs`（器意、套组与附纹触发）、`set`（套组）、`sed`（澱纹档）、`use.group`（消耗品的共享冷却组），
   字段定义以 [`catalog_equipment.md`](../40_design/content/catalog_equipment.md) 第 1.5、1.6 节与 [`catalog_consumables_magitools.md`](../40_design/content/catalog_consumables_magitools.md) 第 2.1 节为准。
4. 价格、产出、魔物压力、信仰、士气、澱等效果用 `src/systems/modifiers` 的 `registerModifier`（D-013）。
5. 对话交互菜单：玩家与 NPC 交谈时，对话系统发出 `player.talked`；任务、商店、神龛、招募等系统以
   `dialogue.options_offered` 提供选项；玩家选择后对话系统发出 `dialogue.option_chosen`，由提供选项的系统处理。
6. 地图出口用 `toLocation`（第 2 节）。
7. 不要导入别的业务系统的模块（除了 world、inventory、modifiers 与 core）。需要别人的数据时，优先用事件、旗标、实体标签；
   确实需要查询时，在回复中提出，由总负责人在整合阶段接线。

## 7. AI 请求约定

- 用 `ctx.ai.request(spec)`，`spec.context` 采用 `AiContextV1`（`src/core/ai_port.ts`）；永远提供确定性的 `fallback`。
- `allowed` 只列本系统能处理的命令种类；命令数据必须能被本系统的处理器校验，并在数据中带上 `revision` 以便丢弃过时提议。
- 角色名（`role`）约定：`npc.daily`、`npc.dialogue`、`npc.batch_diary`、`goddess.plan`、`goddess.dialogue`、`scene.improv`、
  `ruler.policy`、`official.decide`、`general.order`。
- 无模型（`aiMode: 'off'`）时，请求在下一 tick 自动执行 fallback；系统不得因为 AI 关闭而停止运转（D-010）。

## 8. 玩家可见文本（D-077）

- **内核只发文本引用。** 内核、系统与游戏编排里所有玩家可见的文字都是 `TextRef`（文本键加参数；M0 落地于 `src/core/text.ts`，导出 `TextRef`、`TextParam` 与构造函数 `tr`）：
  命令拒绝原因（`CommandResult` 的可读原因）、事件里的文字字段、日记与心声的模板句、默认名。参数里的实体、物品、地点用 ID 或嵌套的 `TextRef` 传，客户端渲染时再取显示名。
  模型生成的文本是 `{ raw, lang }`，按生成时的界面语言打标签。内核里现有的中文字面量在 M0 迁移批次里全部换成键（[`release_engineering.md`](release_engineering.md) 第 8.4 节）。
- **中文是源语言。** 系统的模板句与拒绝原因放 `locales/zh-Hans/sys_<系统>.json`；界面文本放 `locales/zh-Hans/ui.json`（由 `src/shared_ui/text*.ts` 迁出）；
  内容数据与台词包的文本由工具从 `data/` 抽取为 `content.generated.json`、`lines.generated.json`，不手改。客户端查表用 `t(ref)`（`src/shared_ui/i18n.ts`）。
- **键名** `<域>.<子域>.<名>`，小写加下划线与点（例：`ui.saves.slot`、`sys.combat.reject.out_of_range`）；内容以内容 ID 作键（例：`eq_ash_blade.name`）。键的联合类型由
  `tools/i18n/gen_keys.ts` 生成，拼错键在类型检查时失败。布局与流程的完整规则见 [`release_engineering.md`](release_engineering.md) 第 8 节、[`../40_design/ux_and_onboarding.md`](../40_design/ux_and_onboarding.md) 第 20 节。
- **开发者文字用英文。** 日志、断言、内部错误与开发工具的输出用英文，不进字符串表；同一句话既进日志又进界面时拆成两条。
- **发行语言**：1.0 简体中文；繁体中文与英文在 1.x 更新加入。大模型题面用中文，输出跟随界面语言。
- 禁用字符同仓库规则（无破折号、无 emoji、无 U+2600 到 U+27BF 符号）。
