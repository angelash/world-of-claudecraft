# PK-M1-48 事迹、称号、图鉴与传书内核（别名：无）

## 一览

| 项 | 内容 |
| --- | --- |
| 编号与标题 | `PK-M1-48` 事迹、称号、图鉴与传书内核 |
| 状态 | 进行中 |
| 计划包行 | [development_plan.md](../../60_production/development_plan.md) 第 4.2 节 `PK-M1-48` |
| 形态 | 小包 |
| 工作流 | 系统 |
| 量级 | 3 代理人日，0.2 用户人日 |
| 依赖 | PK-M0-27（已完成，提交 `355ee87db3`：变量注册表、`deed.`、`title.` 族） |
| 别名 | 无 |
| 立项日期 | 2026-11-17 |

## 1. 目标

事迹、称号、图鉴与传书有了内核：内容里写的条件成立时事迹与称号自动记下（手动事迹在结算点由系统或脚本授予），图鉴从既有事实里记下见过的人、杀过的魔物、拿过的物品与条目，
传书按条件寄出、在路上走、送达、可读、可回、可收附件；全部进存档并能往返；事迹与称号只记名，不给任何数值。

## 2. 范围与交付物

| 序 | 范围条目 | 落点 | 设计依据（文档与节号） |
| --- | --- | --- | --- |
| 1 | 事迹的条件与授予：`when`（注册表条件，覆盖目录的 `flag`、`cond`、`quest`、`meter`、`doorState`、`meta`）、`stat`（`kills`、`kills.<魔物>`、`codex.<页>`）、`held`（`collectItems`）、`met`（`visit` 的 `npc:`）、`manual`；隐藏、壮举、分支事迹；入册等级只升不降；奖励只有称号与记事柱一格 | `src/systems/records/book.ts`、`index.ts` 的 `records.deed.grant`、`records.deed.attest` | [catalog_deeds_titles.md](../../40_design/content/catalog_deeds_titles.md) 第 1.2 到 1.4、2.2、2.8、2.12 节 |
| 2 | 称号的授予、失去与佩戴：俗名只读、职名可佩戴一个；失去的称号不能再戴并写明原因；镜像 `title.<称号>`、`title.<称号>.lost` 与 `player.title` | `src/systems/records/book.ts`、`records.title.wear` | 同上第 1.5、2.4 节；[ux_and_onboarding.md](../../40_design/ux_and_onboarding.md) 第 6.3.1 节 |
| 3 | 记事柱：门内庭院开放后可刻，格数按档 | `records.pillar.carve`、`data/records/config.json` | 目录第 2.8 节 |
| 4 | 图鉴的发现条目：人物（`player.talked`，只记有名人物）、魔物（玩家一方交手的 `combat.damage` 记"遇到"，`combat.kill` 记击杀数）、物品（`inventory.changed`）、书（`read.<物品>`）、收藏（`col.<收藏>.done`）、回想（`scene.<场景>.seen`）、生灵（`records.codex.discover`）；图鉴条目 `cdx_` 在对象已见且条件成立时记下，带来源标记 | `src/systems/records/codex.ts`、`data/records/codex.json` | 界面第 6.3.2 节；[catalog_relics_lore.md](../../40_design/content/catalog_relics_lore.md) 第 1.7、1.8 节 |
| 5 | 传书的投递与阅读：寄出条件、路上的游戏小时、寄出时冻结段落、读信、回信（选项与条件）、收附件；镜像 `letter.<传书>` 与 `letter.<传书>.reply`；第一幕伯爵来信 `ltr_a1_count` | `src/systems/records/letters.ts`、`data/records/letters.json` | 界面第 6.3.8 节；[act1_borderstone.md](../../30_story/arcs/act1_borderstone.md) 第 9.4 节 |
| 6 | 视图的纯核心：`deedBook`、`codexPage`、`inbox`（`DeedsAdapter.book`、`CodexAdapter`、`LettersAdapter` 的数据面） | `src/systems/records/view.ts` | 界面第 1.6、6.3.1、6.3.2、6.3.8 节 |
| 7 | 存档切片、校验与旧存档补建：`validateSlice`、`idFields`、首次使用时建切片（图鉴按存档里已有的旗标与背包补建）并补发；内容更新后读档重查一次（切片记内容指纹）；改名后由切片补写镜像 | `src/systems/records/slice.ts`、`book.ts` 的 `syncMirrors` | [release_engineering.md](../../50_tech/release_engineering.md) 第 5.5 节 |
| 8 | 内容表与校验：`deeds`、`titles`、`codexEntries`、`letters`、`recordsConfig`；装饰性规则（字段白名单）；V1 到 V10 登记 | `src/content/packs/records.ts`、`data/records/`、`tools/content/validators/` | 发行工程第 7.4 节 |
| 9 | 变量登记：`deed.<事迹>`、`title.<称号>` 的写入者改为 records 并加键域；新增 `title.<称号>.lost`、`letter.<传书>`、`letter.<传书>.reply`、`player.title`（默认 `none`） | [world_state_registry.md](../../40_design/world_state_registry.md) 第 8.1、8.6 节；`tools/registry/parse.ts` | 注册表第 2、9 节 |
| 10 | 单测与存档往返 | `tests/records.test.ts`、`tests/records_save.test.ts` | 计划包行的验收 |

## 3. 不做

| 序 | 不做的事 | 归属（哪个包或哪份文档负责） |
| --- | --- | --- |
| 1 | 事迹、图鉴、传书窗口与 `DeedsAdapter`、`CodexAdapter`、`LettersAdapter` 的接线 | PK-M1-23 |
| 2 | 第一幕 40 条事迹与 10 个称号的内容（本包只有 8 条事迹、3 个称号、4 条图鉴条目、1 封传书作样例） | PK-M1-32 |
| 3 | 依赖认知内核的触发：`witness`、`rumorReach`、`belief`、`exposure`、`tellCount`；有页者（同伴与 NPC）的传颂级称号与讲述数 | 认知与传闻的后续包（见 `progress.md` 遗留） |
| 4 | 主动寄信（信使之门之后）与政令、军令的在途信件 | 信使之门的功能包与城建的政令包 |
| 5 | 改场景数据：`a1_count_letter` 场景不动，替换方式写在 `progress.md` | PK-M0-04 与场景的负责方 |
| 6 | 布伦手录的补录（第二幕起的亲见、旁证、自述）的内容与场景 | 第二幕内容批次 |

## 4. 先读

| 读什么 | 为什么 |
| --- | --- |
| `hakoniwa/CLAUDE.md` | 禁用字符、文档规则、目录分工 |
| [architecture.md](../../50_tech/architecture.md)、[implementation_conventions.md](../../50_tech/implementation_conventions.md) | 分层、相位、切片、文本 |
| [catalog_deeds_titles.md](../../40_design/content/catalog_deeds_titles.md) 第 1、2 节 | 事迹与称号的字段、触发、规则 |
| [ux_and_onboarding.md](../../40_design/ux_and_onboarding.md) 第 6.3.1、6.3.2、6.3.8 节 | 三个窗口的数据面 |
| `src/systems/records/index.ts` | 系统、命令、事件、镜像 |

## 5. 硬性约束

| 约束 | 内容 | 守卫 |
| --- | --- | --- |
| 确定性内核 | 不用墙钟与随机；只在脏时结算；镜像同步只看世界状态 | `tests/architecture.test.ts`、`tests/records.test.ts` 的确定性用例 |
| 只记名 | 事迹与称号的记录只有白名单字段，奖励只有称号与记事柱 | `validateRecords`（V1）、`tests/records.test.ts` |
| 模型边界 | 授予、补证、图鉴补记只收 `system` 与 `script` 来源；佩戴、刻柱、读信、回信、收附件拒收 `ai` 与 `fallback` 来源 | `tests/records.test.ts` |
| 内容 ID | 系统代码不写内容 ID；事迹、称号、传书、图鉴条目登记为受保护的实体种类 | `tests/content_id_guard.test.ts` |
| 文本 | 系统只发 `TextRef`；中文在 `locales/zh-Hans/sys_records.json` 与 `data/records/` | `tests/i18n_kernel_guard.test.ts`、`node tools/i18n/check.ts` |
| 注册表 | 只写已登记的名字 | `node tools/registry/build.ts --check`、开发构建的写入守卫 |

## 6. 文件范围

| 类别 | 路径 |
| --- | --- |
| 本包新增 | `src/systems/records/`、`src/content/packs/records.ts`、`data/records/`、`locales/zh-Hans/sys_records.json`、`tests/records.test.ts`、`tests/records_save.test.ts`、本目录 |
| 本包修改 | `docs/40_design/world_state_registry.md`（第 8.1、8.6 节）、`data/registry/vars.json`（生成）、`tools/registry/parse.ts`、`tools/content/validators/namespace.ts`、`tools/content/validators/player_text.ts`、`src/content/references.ts`、`src/content/entity_kinds.ts`、`docs/40_design/content/content_bible.md`（第 12.2 节）、`docs/50_tech/architecture.md`（第 4.6 节）、`data/README.md`、`src/core/text_keys.generated.ts` 与 `locales/zh-Hans/content.generated.json`（生成） |
| 不得修改 | `data/scenes/`、`data/quests/`、`src/systems/doors/`、`data/doors/`、`src/systems/world/`、`data/world/`、`src/client/` |

## 7. 停止条件

| 序 | 条件 | 做法 |
| --- | --- | --- |
| 1 | 两条结局路线因本包改变 | 停下定位；本包只写自己的镜像，不应改路线 |
| 2 | 注册表检查因他人半成品失败 | 等待后重试，持续则写进汇报 |

## 8. 验证命令

```
npx vitest run tests/records.test.ts tests/records_save.test.ts
npm run typecheck
node tools/content/validate.ts
node tools/registry/build.ts --check
node tools/i18n/check.ts
npx vitest run --config vitest.playthrough.config.ts tests/playthrough/release.playthrough.test.ts
```

## 9. 评审派发

| 角色 | 必派或视情况 | 理由 |
| --- | --- | --- |
| 总闸（新起会话的审查） | 必派 | 一次贡献结束 |

## 10. 交接物

| 交接物 | 接收方 | 接收方的验收 |
| --- | --- | --- |
| 代码、数据、测试、本目录三件 | 主会话 | 抽看验证矩阵；按 `progress.md` 的文件清单提交 |

## 11. 需用户决定

| 序 | 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- | --- |
| 1 | 图鉴条目与传书的 ID 前缀 | 本包定 `cdx_`（主人：遗物目录）与 `ltr_`（主人：任务目录），已登记进内容总纲第 12.2 节；如另有偏好可改 | 不阻塞 |
