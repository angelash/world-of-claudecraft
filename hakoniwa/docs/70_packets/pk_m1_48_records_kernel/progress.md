# PK-M1-48 事迹、称号、图鉴与传书内核：进度与汇报

## 1. 进度表

| 日期 | 会话或阶段 | 做了什么 | 提交号 | 验证（完整命令与量化结果） | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-17 | 实施 1 与 QA 1 | 事迹系统 `records`、内容表与校验、变量登记、单测与存档往返；新起会话审查后修了 12 处 | 未提交 | 见 `verification_matrix.md` 第 1、2 节 | 1. 主会话按第 2 节文件清单提交；2. 遗留转去第 2 节所列的包 |

## 2. 汇报

### 2026-11-17 实施 1 与 QA 1

**改动文件**

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `src/systems/records/index.ts` | 新增 | 系统（相位 85）、命令、事件、模块扩充、结算入口与跳时处理器 |
| `src/systems/records/types.ts` | 新增 | 事迹、称号、图鉴条目、传书、参数与切片的类型 |
| `src/systems/records/book.ts` | 新增 | 事迹触发与授予、称号授予失去与佩戴、记事柱格数、镜像同步 |
| `src/systems/records/codex.ts` | 新增 | 图鉴的发现、旧存档补建、图鉴条目 |
| `src/systems/records/letters.ts` | 新增 | 传书的寄出、在途、送达、读信 |
| `src/systems/records/slice.ts` | 新增 | 切片的建立、读取、`validateSlice`、`idFields` |
| `src/systems/records/view.ts` | 新增 | `deedBook`、`codexPage`、`inbox` 纯视图 |
| `src/systems/records/watch.ts` | 新增 | 条件读的变量集（脏标记过滤）与内容指纹 |
| `src/content/packs/records.ts` | 新增 | 五张内容表、编辑器表单、`validateRecords`（装饰性字段白名单） |
| `data/records/deeds.json`、`titles.json`、`codex.json`、`letters.json`、`config.json` | 新增 | 第一幕 8 条事迹、3 个称号、4 条图鉴条目、伯爵来信、记事柱与事迹簿形态 |
| `locales/zh-Hans/sys_records.json` | 新增 | 拒绝原因与成功说明 |
| `tests/records.test.ts`、`tests/records_save.test.ts` | 新增 | 授予、发现、投递、存档往返等 38 个用例 |
| `docs/70_packets/pk_m1_48_records_kernel/` | 新增 | 本包三件 |
| `docs/40_design/world_state_registry.md` | 修改 | 第 2.3 节镜像行加 `letter.`；第 8.1 节加 `player.title`；第 8.6 节改 `deed.<事迹>`、`title.<称号>`，加 `title.<称号>.lost`、`letter.<传书>`、`letter.<传书>.reply` |
| `data/registry/vars.json` | 生成 | `node tools/registry/build.ts` |
| `tools/registry/parse.ts` | 修改 | 写入者 `records`（"事迹系统"与 `deeds` 的别名改指 `records`）；槽 `传书`；键域 `deed`、`title`、`letter` |
| `tools/content/validators/namespace.ts` | 修改 | `deed_`、`title_` 指向新表；新增 `cdx_`、`ltr_`；四张表进严格前缀表（同文件里另有世界方的 `MAP_PLACE_IDS` 改动，不属本包） |
| `tools/content/validators/player_text.ts` | 修改 | 四张表的玩家可见字段（V5、V8） |
| `src/content/references.ts` | 修改 | 五条引用路径（V2） |
| `src/content/entity_kinds.ts` | 修改 | 事迹、称号、传书、图鉴条目登记为受保护的实体种类 |
| `docs/40_design/content/content_bible.md` | 修改 | 第 12.2 节加 `cdx_`、`ltr_` 两行 |
| `docs/50_tech/architecture.md` | 修改 | 第 4.6 节相位表加 85 records |
| `data/README.md` | 修改 | 加 `records/` 一行 |
| `src/core/text_keys.generated.ts`、`locales/zh-Hans/content.generated.json` | 生成 | `node tools/i18n/gen_keys.ts`、`node tools/i18n/extract_content.ts`（别的包也在重生成这两个文件） |

**验收逐条结果**

见 `verification_matrix.md` 第 1 节。

**与设计文档不一致而自行定下的地方**

| 文档与节号 | 文档原意 | 本包的做法 | 理由 | 是否需用户决定 |
| --- | --- | --- | --- | --- |
| 事迹目录第 1.3 节 | 触发分 `flag`、`cond`、`quest`、`meter`、`doorState`、`meta` 等种类 | 这些一律写成注册表条件 `when`（`quest.<任务> == done`、`door_state.<门> == opened`、`COUNT(deed.a, deed.b) >= 2` 等）；只有 `stat`、`held`（`collectItems`）、`met`（`visit` 的 `npc:`）、`manual` 另设字段 | 目录说新触发都是对已有内核状态的只读谓词；一种写法让 V4 能逐个检查变量名、幕与枚举值 | 否 |
| 事迹目录第 1.2、2.8 节 | 奖励"记事柱一格"；记事柱可刻至多 7 条事迹 | 只有奖励写了 `pillar` 的事迹能刻；不给槽位时刻到第一个空格，同一事迹再刻即移动 | "记事柱一格"作为可刻的标记；否则这一奖励没有含义 | 否 |
| 事迹目录第 1.4 节 | 完成度的分母不含隐藏、壮举、未发生的分支 | 照做，另把未到的幕排除（分母只算已到之幕的可见事迹） | 避免后几幕的事迹名提前出现在事迹簿里 | 否 |
| 事迹目录第 2.2 节 | 入册三级：亲见、旁证、自述 | 数据值 `witnessed`、`corroborated`、`claimed`，默认 `claimed`；`records.deed.attest` 只升不降 | 第一幕是刻痕阶段，补录与补证由第二幕的内容做 | 否 |
| 事迹目录第 2.4 节 | 称号三档：俗名、职名、传颂级 | 内核只管玩家的称号：`common`（俗名、错名、恶名）与 `office`（职名、众名，可佩戴一个）；有页者的传颂级称号不在本包 | 玩家无页，传颂级称号属于讲述数与铭录，依赖认知内核 | 否 |
| 注册表第 8.6 节 | `title.<称号>` 为标记 | 得到过即为真（单调）；失去另写 `title.<称号>.lost`；佩戴写 `player.title`（默认 `none`） | 标记单调；称呼与任务要能读出"已失去"和"戴着什么" | 否 |
| 界面第 6.3.2 节 | 魔物"未遇到的不显示" | 与玩家一方交手（`combat.damage`）即记为遇到，击杀数另计；人物只记有名人物（`npcs`、`companions`），由交谈记下；物品记玩家背包里得到过的 | 用已有事件，不新增扫描 | 否 |
| 界面第 6.3.8 节 | 正文预写或模型生成 | 正文按段落写在数据里，各段带条件，寄出时冻结；本包不做自由书写的回信与非物品附件 | 第一幕伯爵来信的四种归功与五种莫斯结局正好是段落条件 | 否 |
| 内容总纲第 12.2 节 | 没有图鉴条目与传书的前缀 | 新增 `cdx_`（主人：遗物目录）与 `ltr_`（主人：任务目录） | 需要 ID 命名空间才能让 V3 检查 | 可改，见 README 第 11 节 |
| 发行工程第 5.5 节 | 世界版本加一时写迁移步 | 不加世界版本（M2 之前迁移链为空）：旧存档没有切片时首次使用即建立并按已有旗标与背包补建图鉴、补发事迹；切片记录内容指纹，内容更新后读档重查一次 | 与跳时系统同样的懒建做法；不动内核版本号 | 否 |

**越界改动与请求回写**

| 文件 | 原因 | 负责方 | 状态 |
| --- | --- | --- | --- |
| `tools/registry/parse.ts` | 写入者与键域：让 `deed.`、`title.`、`letter.` 的键按内容表检查，写入者显示为 `records` | 内核（PK-M0-27 的工具） | 已改，最小改动 |
| `src/content/references.ts`、`src/content/entity_kinds.ts` | V2 引用与内容 ID 守卫要认识新表 | 内核 | 已改，只加行 |
| `tools/content/validators/namespace.ts`、`player_text.ts` | V3、V5、V8 登记新表 | 内容管线（PK-M0-28） | 已改，只加行；`namespace.ts` 同时有世界方的改动 |
| `docs/40_design/content/content_bible.md`、`docs/50_tech/architecture.md`、`data/README.md` | 命名空间、相位表、数据目录索引 | 文档 | 已改，各加一到两行 |
| `docs/50_tech/implementation_conventions.md` 第 1 节 | 文件所有权表还没有 `src/systems/records/**` 一行 | 主会话 | 请求回写（建议归"叙事"或单列"事迹"） |
| `data/scenes/act1.json` 的 `a1_count_letter` | 场景里 `letter` 说话人的那一行应改为展示传书 `ltr_a1_count` | 场景的负责方（PK-M0-04 改名为 `cut_a1_letter` 时一并做） | 请求回写，做法见下 |

**伯爵来信如何替换场景里的信文**

现有场景 `a1_count_letter`（过场目录改名后为 `cut_a1_letter`）的 `letter` 节点用说话人 `letter` 念出一版固定信文（只写了玛莎那一版）。
本包的传书 `ltr_a1_count` 在 `a1_bron_sees_mark AND act_week >= 11`（与过场目录的触发相同）时寄出并立即送达，寄出时按 `a1_tide_credit` 四选一、按 `a1_moss_fate` 五选一冻结段落。
替换方式：场景保留驿卒、布伦拆信、问话与选择的镜头；把 `letter：` 那几行换成一个"展示传书"的步骤（客户端读 `inbox` 视图里 `ltr_a1_count` 的冻结段落，正文为内容键 `c.letters.ltr_a1_count.body.<段>.text`），
场景结束时传书已在传书窗口里，以后可以重读，措辞不随世界变化；道具 `count_letter` 仍由场景给出（传书不带附件，避免给两份）。
需要的另外两处：PK-M1-45 用 `setFlag` 写出 `act_week`（否则传书在实际游玩里不会寄出），PK-M1-23 的传书窗口与过场播放器的"展示传书"。

**留给后续包的事项**

| 事项 | 建议去处（包编号、项目状态缺口、风险编号） |
| --- | --- |
| 事迹、图鉴、传书窗口与三个适配器；簿的形态名、入册等级名、空状态与错误状态的界面文本；名望的档；刻痕阶段的"未记之事" | PK-M1-23 |
| 第一幕 40 条事迹与 10 个称号的内容；事迹目录的导入映射（`tools/content/mappings/`） | PK-M1-32 |
| 依赖认知的触发：`witness`、`rumorReach`、`belief`、`exposure`、`tellCount`；有页者的传颂级称号、讲述数与立名；街头俗名按传闻画像取主流版本 | 新包"事迹的认知触发与立名"（依赖 PK-M1-18） |
| `act_week` 由幕时钟写成旗标，伯爵来信才会在游玩中寄出 | PK-M1-45 |
| 场景里的信文换成展示传书 | PK-M0-04 或第一幕过场批次，客户端部分 PK-M1-23 |
| 门以事迹作历钥（门钥写 `deed.<事迹>`），刻痕出现在回廊 | PK-M1-14、PK-M1-32 |
| 记事柱扩建 IV 后 12 格（扩建之门的数据还没有） | 门内庭院扩建的城建包 |
| 主动寄信（信使之门之后）、在途政令与军令、自由书写的回信、委托与地图标记附件 | 信使之门的功能包；城建政令包 |
| 布伦手录的补录与补证（第二幕起） | 第二幕内容批次 |
| 由 `deed.granted` 生成 Steam 成就 | PK-M2-02 |

**风险**

| 风险 | 影响 | 缓解或复查条件 |
| --- | --- | --- |
| 结算靠"读到的变量变了"唤醒 | 条件若读一个不经 `setFlag` 变化的量（未来的内置量），事迹不会及时结算 | `watchOf` 已展开派生量；新内置量须经 `setFlag` 写出；`tests/records.test.ts` 有唤醒与不唤醒两条用例 |
| `namespace.ts` 与生成文件被几个包同时改 | 提交时混入别人的半成品 | 提交前按本表逐行核对差异 |

**需用户决定**

| 事项 | 选项与推荐 | 阻塞程度 |
| --- | --- | --- |
| `cdx_`、`ltr_` 两个前缀及其主人 | 推荐保持；如另有偏好可改，只动数据与命名空间表 | 不阻塞 |

**下一步与恢复方式**

1. 主会话按上表的文件清单提交（不要整目录提交 `tools/content/validators/` 与生成文件以外别人的改动）。
2. 计划第 4.2 节 `PK-M1-48` 的状态列建议改为"已完成"，项目状态与进度日志由主会话更新。
