# data/：内容数据（JSON）

按系统分目录，由 `src/content/packs/<系统>.ts` 导入、校验并合并成运行时内容（见 `src/content/index.ts`）。
编辑器（`editor.html`）通过开发服务的 `/api/data` 读写这些文件；`npm test` 中的内容校验保证全部数据合法、引用完整。

| 目录 | 内容 |
|---|---|
| `world/` | 内核测试地图；图集三表（`atlas_regions.json`、`atlas_maps.json`、`atlas_routes.json`）；扩建地图的平移表 `map_shifts.json`（平移量与锚点，旧存档坐标换算的迁移数据） |
| `combat/` | 职能与技能、光环、魔物与首领、波次、装备与消耗品、战斗地图（封门遗迹与深处、镇北与界石线、锈岭矿与边石旧矿、林缘、铁杉林深处、折桥驿、荒原外缘、旧水道） |
| `doors/` | 千门回廊的门与钥 |
| `party/` | 从者与同伴 |
| `npc/` | 边石镇与瓦伦堡地图、人设卡、日程、无名居民模板、知识 |
| `cognition/` | 解释库、阶层常识、认知台词 |
| `dialogue/` | 对话模板 |
| `economy/` | 商品与材料、市场、配方、商路、经济参数 |
| `crafting/` | 采集与生业：内核参数（`config.json`：层与上限、增长曲线、杰作概率、工站档、采集刷新与稀有事件、节流、工具种类、醉意）、采集点（`nodes.json`，`node_`）、工站（`stations.json`，`stn_`）、配方（`recipes.json`，`rcp_`）、人物的生业技能（`crafters.json`，铁匠修理读它）；采集点与工站只按地图 ID 与地点 ID 引用 |
| `inventory/` | 物品实例层的同炉套组（`item_sets.json`，`set_`）与附纹（`enchants.json`，`ench_`）；物品本身仍由各系统的 `items` 表提供 |
| `city/` | 旧哨村与门内庭院地图、建筑、建设用地（含剧情职能 `roles`）、官员、政策、城建物品职能（`config.json`：口粮、腐坏、慢耗、主粮、需求物资、余货） |
| `warfare/` | 兵种、英雄技能、战役场景 |
| `strategy/` | 大陆省份图、国家、参数 |
| `goddess/` | 六司人格卡（含神庭席位 `courtSeat`、剧情职能 `roles`、信物、触及方式）、造主、神权动作、天启、写定神行节点 `beats.json`、供品价目 `offerings.json`；女神大脑 `brain/`（人格权重表与各幕计划表、谋划、反应表、常数）；导演的菜单、规则表、台账交付与各幕限额（`director_*.json`） |
| `quests/` | 任务、幕次、剧情物品与证据、揭示台账知识、名词 |
| `scenes/` | 神庭地图与过场布景（地球四景、坠落、千门回廊、梦中的门口）、序章、各幕过场、神庭审判、结局与后日谈 |
| `records/` | 事迹（`deeds.json`）、称号（`titles.json`）、图鉴条目（`codex.json`）、传书（`letters.json`）与事迹系统参数（`config.json`：记事柱的格数、事迹簿随幕的形态）；事迹与称号只记名、不给数值 |
| `registry/` | 世界状态变量注册表 `vars.json`：规范名、族、别名、值别名、换算与旧任务编号，由 `npm run registry` 从 `../docs/40_design/world_state_registry.md` 生成，不手改；`npm run registry:check` 核对它是最新的且数据与代码只用规范名 |
| `autoplay/` | 无模型通关的自动玩家路线表（`routes.json`：各结局路线的场景选择、猎场、商店、保留物资、城建与政策计划），随内容批次维护，由 `tests/content_id_guard.test.ts` 对照内容校验 |
| `_staging/`、`_batches/` | 内容导入批次的工具状态，内核不加载、编辑器不当内容读：`_staging/<批次>.json` 是待审的暂存记录，`_staging/index.json` 列出全部批次，`_batches/<批次>.json` 是合入后的批次记录（新增、改动的 ID，校验结果，七步流程）；由 `node tools/content/import_catalog.ts` 与编辑器的批次视图维护（`../docs/50_tech/release_engineering.md` 第 7.3 节） |

地图文件除逻辑层（地点、出口、刷新点）与空间层（格子与图例）外，可带外观层：`style`（风格包）、`looks`（逐地点建筑外观）、
`decor`（装饰），只有渲染器读，改外观不改玩法；没写 `style` 时按 `region` 选风格包（类型与编号表见 `src/systems/world/look.ts`，
规则见 `../docs/50_tech/art_pipeline.md` 第 5.1、5.2 节）。
地图还可带职能字段：`respawn`（`door` 门内庭院复活点、`wake` 最后的醒来处）、`storyActs`（人设卡没写幕时剧情权重所属的幕）、
`atlasExempt`（测试图，不入图集）。系统代码不写内容 ID，一律从这些字段与职能查（`../docs/50_tech/release_engineering.md` 第 13.2 节）。

内容来源以 `../docs/20_world/` 与 `../docs/30_story/` 为准；命名约定见 `../docs/50_tech/implementation_conventions.md`。
