# 发行工程：从第一轮实现到可发售的 1.0

> 归属：`docs/50_tech/`（技术方案，正典优先级第 5 级）。与 `../00_vision/`、`../20_world/`、`../30_story/` 冲突时以后者为准。
> 作用：把第一轮可玩实现（[first_playable.md](../60_production/first_playable.md)）推进到 Steam 上可发售的 1.0。覆盖桌面壳、构建与签名、
> Steam 集成、存档、性能、内容与本地化管线、音频实现、测试、持续集成、崩溃报告与遥测、架构债、法律合规、版本与补丁节奏、1.0 发布检查清单。
> 每一节都写到能直接拆成实施包的程度，实施包总表在第 17 节。
> 上游：决策 D-004、D-010、D-018、D-050、D-057、D-058、D-067、D-070、D-071、D-072、D-073、D-076、D-077、D-078、D-079、D-080、D-081
> （[decision_log.md](../00_vision/decision_log.md)）；[architecture.md](architecture.md)、[implementation_conventions.md](implementation_conventions.md)、
> [reuse_map.md](reuse_map.md)（第 4.4、6 节）、[art_pipeline.md](art_pipeline.md)（第 2 节）、[ai_architecture.md](ai_architecture.md)（第 3.8、3.10、11 节）、
> [llm_providers.md](llm_providers.md)；[roadmap.md](../60_production/roadmap.md)、[risks.md](../60_production/risks.md)、[dev_process.md](../60_production/dev_process.md)；
> 主工程的桌面发行手册 `../../../docs/desktop-release.md` 与桌面壳 `../../../electron/`（同仓同许可，借做法）。
> 约束：内核确定性（20Hz 固定步长、随机只走 `Rng`、模拟层无墙钟）；表现层只经 `GameView` 读世界、经命令改世界；画质档只减观感、不减可行动信息；
> 密钥永不进日志、存档、录像与崩溃报告；依赖极少，桌面壳与 Steam 用仓库根目录已有的工具链（D-057）；开发里程碑统一称 M0 到 M6。

## 0. 一页结论

1. **发行形态（D-081）。** Steam 上的 Electron 桌面版。Windows x64 先行（M1 出内部包，M2 进 Steam Playtest），macOS 通用包在 M3（签名加公证），
   Linux x64 与 Steam Deck 在 M4。更新只走 Steam 分支，桌面壳不带自更新器。网页版只作试玩，只提供"关闭"与"本机"两种模型预设，不接受云端密钥。
2. **桌面壳分三块。** 主进程管窗口、文件存档、设置、Steam、崩溃转储；大模型网关是一个独立的 utility 进程，负责解密密钥、发请求、记台账；
   渲染进程跑内核、AI 层、渲染、HUD 与音频，开启上下文隔离与沙箱，经一个窄的类型化预载桥 `window.hk` 与主进程通信。密钥用 Electron `safeStorage`
   加密落盘（Windows DPAPI、macOS 钥匙串、Linux libsecret 或 KWallet）；Linux 没有可用钥匙串时密钥只留在内存。渲染进程从头到尾拿不到密钥。
3. **存档是文件、可迁移、可恢复。** 每局一个"卷"，快照与只增分段都按内容寻址存放，槽位只是一个小小的头文件（提交点）。写入顺序保证中途断电不坏档；
   读档按"上一代槽位头、上一代快照、锚点加命令日志重放、玩家从残留快照中挑选"四级回退。存档带五个版本号（游戏、容器、世界结构、内容、重命名表），世界结构按版本逐级迁移，
   内容 ID 改名走重命名表。兼容承诺从 M2 第一个 Steam Playtest 构建开始。
4. **性能有明确的机型、帧率与预算。** 推荐配置（Iris Xe 或 Radeon Vega 8 级集显、16GB）在 1080p 中档稳定 60 帧；最低配置（UHD 620 级、8GB）
   在 720p 低档稳定 30 帧；Steam Deck 中档 60 帧。按需重画与脏标记取代逐帧无条件重画；地面按 64 乘 64 格分块；立牌与光源按档设上限，可行动单位永不裁剪；
   AI 位图素材按 2048 像素图集页打包、按地图流式加载，中档常驻纹理不超过 448MB；按 GPU 计时的自动降档在 M3 上线（D-078）。
   PT-06 的基准场景扩成 BM-01 到 BM-07 七个渲染场景加两个加速节拍场景，用回放驱动的镜头路径测量，并作为玩家可用的"性能测试"。
5. **加速档是隐藏的性能大项。** 经营与战略视图的"快"档是每游戏日 6 现实秒（D-050），即每秒 4800 tick。只有按节拍降频的系统与离场地图的粗粒度推进才能做到；
   机器达不到时，速度控件显示实际倍率，标注永远与实际一致。
6. **Steam：51 个成就全部由规则生成。** 7 个幕次、11 个结局、17 条名望 50 的事迹、11 个事迹类满页、1 个全簿满页、1 个铁人通关、3 个开门里程碑。
   不依赖大模型，不设除结局与铁人以外的可错过成就；第四幕以后的成就一律隐藏，商店可见面的揭示水位是第一幕开局。云存档用 Auto-Cloud，
   内容寻址让冲突只发生在槽位头上，另留 14 天的"可恢复存档"。Windows 开启 Steam 覆盖层，它是玩家举报实时 AI 内容的官方入口。
7. **本地化管线（D-077）。** 内核只发 `TextRef`（键加参数），客户端按字符串表渲染。内核里约 1050 行中文字面量在 M0 按系统分批迁出，
   守卫测试把计数逐批压到 0。内容数据的中文是源文本，构建时自动抽成 `content.generated.json`，翻译按源文本哈希追踪过期。
8. **音频（D-080）。** Web Audio 五条总线（总、音乐、环境、音效、界面）；音乐导演是一个纯逻辑核心，按区域、昼夜与战斗状态决定曲目与交叉淡化；
   音乐与长环境声走流式媒体元素，短音效解码进内存；导入时统一响度；声音不作为可行动信息的唯一载体。
9. **测试。** 11 个结局各有一条自动玩家路线和一组断言；夜间多种子通关矩阵；每个存档版本一组迁移夹具；截图回归用 SwiftShader 保证同像素；
   性能回归在固定参考机上跑基准；模型路径用脚本、混沌、录带三种模拟提供方，回放局的模型调用次数必须为 0。
10. **架构债 12 项，各有目标设计与验收**（第 13 节）：`entity_ops` 直写实体、系统里的硬编码内容 ID、逐帧重画、localStorage 存档、存档不迁移、
    命令日志只在内存、内核中文字面量、主工程风格的技能 ID、开发代理进入运行时、设置存 localStorage、加速档 tick 成本、通关测试耗时。
11. **法律。** Steam 默认用户协议加游戏内"使用须知"；隐私政策（游戏内、网站、商店页三处同文）；第三方声明由脚本生成；`UPSTREAM.json`
    记录从主工程移植的每个公式与符号；分级自评按 12 岁以上等价；AI 生成工具的商用条款在 M1 前存档确认。
12. **版本。** 0.x 按里程碑递增，1.0.0 发售；发售后六周内每周补丁，之后每月；P0（崩溃、坏档、卡关）72 小时内热修；1.1 加繁体中文，1.2 加英文。
13. **31 个实施包 RE-01 到 RE-31**，按 M0 到 M6 排期（第 17 节），每包写明范围、依赖、验收与量级。

---

## 1. 现状、目标与里程碑

### 1.1 第一轮实现盘点

| 领域 | 第一轮现状（以代码为准） | 1.0 目标 | 章节 |
| --- | --- | --- | --- |
| 运行形态 | Vite 开发服务与静态构建（`vite.config.ts`，端口 5180，`buildInputs` 含游戏与编辑器两个入口），浏览器运行 | Electron 桌面壳加 Steam；网页试玩版 | 2、3、4 |
| 大模型 | 开发服务 `/api/llm` 代理（`tools/llm_proxy.ts`、`tools/dev_api.ts`），密钥在服务端环境变量；客户端 `AiBridge`（`src/client/app/ai_bridge.ts`）探测代理 | 主进程转 utility 进程的网关，玩家自配，密钥进系统钥匙串（D-067） | 2.4、2.5 |
| 存档 | `src/core/save.ts` 的 `serializeWorld`、`deserializeWorld` 只校验版本号、不迁移；`src/client/hud/save_slots.ts` 的 `SaveStore` 把整局 JSON 存进 localStorage，快速槽加 6 个手动槽 | 文件存档、内容寻址分段、逐版本迁移、三级损坏恢复、云同步 | 5 |
| 命令日志 | `Engine` 内存日志，超过 `EngineOptions.logLimit`（默认 200000 条）丢最旧；存档默认不含日志 | 命令日志分段落盘，任何存档都能从锚点重放恢复 | 5.6、13.6 |
| 重画 | `GameSession.start`（`src/client/app/session.ts`）用 `requestAnimationFrame` 逐帧无条件调用 `frame` | 帧调度器、脏标记、按需重画 | 6.3 |
| 地面 | 整张地图一张像素贴图 | 64 乘 64 格分块，逐块重画 | 6.5 |
| 素材 | 程序化绘制（纸娃娃、风格包、装饰立牌） | AI 生成位图（D-018），图集加流式；程序化作占位与平面档 | 6.8、6.9、7.7 |
| 文本 | 内核与系统约 1050 行中文字面量；界面文本表 `src/shared_ui/text*.ts`（`T` 对象加 `fmt`）；编辑器文本 `src/editor/text.ts` | `TextRef` 加字符串表（D-077） | 8 |
| 音频 | 无 | Web Audio 五总线（D-080） | 9 |
| 输入 | 键鼠（`src/client/input/`），无手柄 | 键鼠、手柄、改键全程可玩（D-081） | 4.4 |
| 测试 | 46 个测试文件；`npm run playthrough` 跑"离手"与"梅尔卡之治"两条结局路线（`src/game/autoplay/scene_policy.ts` 的 `ENDING_ROUTES`），约 10 分钟 | 11 结局矩阵、迁移、端到端、截图、性能、浸泡 | 10 |
| 持续集成 | 无，靠本地命令 | 提交、夜间、发布三条流水线 | 11 |
| 架构债 | `combat/entity_ops.ts` 直写实体；`npc/tiers.ts` 的 `MAP_ACTS` 等硬编码 ID | 逐项改造 | 13 |

### 1.2 1.0 的技术目标

| 维度 | 目标 |
| --- | --- |
| 平台 | Windows 10 22H2 及以上 64 位（主平台）；macOS 12 及以上（通用包）；Linux x64（Ubuntu 22.04 及以上、SteamOS 3） |
| 发行 | Steam（正式版、Playtest、试玩版三个应用）；网页试玩版放项目网站 |
| 语言 | 简体中文（界面、字幕、内容全部）；繁体中文 1.1、英文 1.2（D-077） |
| 输入 | 键鼠与手柄全程可玩，全部按键可改（D-081） |
| 模型 | 无模型档完整通关（D-010）；玩家自配提供方（D-067） |
| 性能 | 第 6.1 节机型表全部达标；加载时间表（6.10）达标 |
| 稳定性 | 崩溃率（有遥测的会话中）低于每 100 小时 1 次；坏档恢复率 100%（任何可读的锚点都能恢复） |
| 合规 | Steam 内容问卷与 AI 披露、隐私政策、第三方声明、来源记录、分级自评齐备 |

### 1.3 里程碑与本文工作的对应

| 里程碑 | 发行工程交付 | 对应实施包 |
| --- | --- | --- |
| M0 基线与管线 | 世界端口取代直写；内容 ID 解耦；`TextRef` 与字符串表，内核字面量清零；存档容器与迁移框架；帧调度器；命令日志分段；设置存储；模拟提供方；CI 提交流水线；内容校验扩到 V1 到 V10；桌面壳骨架能在 Windows 开发机启动；在 `assets/tools.json` 登记出图出声工具（小九 AI 及其所用模型、条款版本、查阅日期），素材清单的生成工具字段引用它 | RE-01、RE-04、RE-05、RE-06、RE-11、RE-12、RE-13、RE-14、RE-19、RE-22、RE-24、RE-28、RE-29 |
| M1 垂直切片 | 网关与密钥；地面分块与纹理台账；图集与流式；基准场景与参考机；音频引擎；手柄与改键；端到端与截图回归；序章与第一幕的结局前路线；Windows 内部包；技能与光环 ID 迁移 | RE-02、RE-03、RE-07、RE-08、RE-10、RE-15、RE-16、RE-18（Windows 未签名）、RE-20、RE-21（第一批）、RE-27 |
| M2 Alpha | 加速档 tick 预算；Steam 集成（成就、云、覆盖层、富状态）进入 Playtest；崩溃转储与诊断包；Windows 签名；夜间通关矩阵扩到第三幕；存档兼容承诺开始 | RE-17、RE-18（签名）、RE-21（第二批）、RE-23、RE-31 |
| M3 Beta | 自动降档；macOS 签名公证包；商店页素材与 AI 披露；试玩版与网页试玩；11 结局全部自动验证；可选遥测；隐私政策草案 | RE-09、RE-18（macOS）、RE-21（全量）、RE-23（遥测）、RE-25（草案）、RE-26、RE-30 |
| M4 内容完成与打磨 | Linux 与 Steam Deck；性能打磨与浸泡测试；法律文件定稿；本地化完整性；发布候选 | RE-18（Linux）、RE-25（定稿）、第 16 节清单的预演 |
| M5 发布 | 第 16 节清单全部通过；Go 或 No-Go 记入决策日志；发售与值守 | 全部 |
| M6 发布后 | 补丁节奏；1.1 繁体中文、1.2 英文；提供方适配更新 | 第 15 节 |

### 1.4 编号约定

| 前缀 | 含义 | 位置 |
| --- | --- | --- |
| `RE-xx` | 发行工程实施包，作为别名并入[开发计划](../60_production/development_plan.md)的 `PK-xx` 包，包目录见 [dev_process.md](../60_production/dev_process.md) 第 3.1 节 | 第 17 节 |
| `BM-xx` | 渲染基准场景；`BM-Tx` 为加速节拍场景 | 第 6.11 节 |
| `V1` 到 `V10` | 内容校验层 | 第 7.4 节 |
| `RER-xx` | 本文登记的发行工程风险（在 [risks.md](../60_production/risks.md) 第 2.6 节统一跟踪） | 第 18 节 |
| `HK_` | Steam 成就与统计的 API 名前缀 | 第 4.2 节 |

---

## 2. 桌面壳架构

### 2.1 进程分工

| 进程 | 负责 | 不负责 |
| --- | --- | --- |
| 主进程（Node） | 窗口与生命周期、单实例锁、自定义协议 `app://hakoniwa`、预载桥的处理器、文件存档与设置、Steam（`steamworks.js`，只在 Steam 构建加载）、崩溃转储收集与诊断包、外链打开、GPU 偏好 | 内核、渲染、密钥明文、任何玩家内容的解析 |
| 大模型网关（`utilityProcess.fork` 起的 utility 进程） | 连接设置、密钥解密与注入、HTTPS 与本机请求、流式、超时、花费上限的纵深执行、消耗台账、连接测试与错误分类 | 题面装配、输出校验、预算决策（这些在渲染进程的 AI 层，确定性与审计都在那边） |
| 渲染进程（Chromium，沙箱） | 内核 `Engine`、AI 层（`src/ai/`、`src/game/ai_roles/`）、HD-2D 与平面渲染、HUD 与窗口、音频、输入、存档序列化 | Node、文件系统、对外网络（CSP 禁止）、密钥 |
| 渲染进程内的 Worker | 存档压缩与哈希（`CompressionStream`、`crypto.subtle`）、图集解码（`createImageBitmap`） | 内核 |

把网关放进独立 utility 进程的理由：密钥明文只出现在一个不碰界面、不碰存档的小进程里；网关崩溃不拖垮窗口；主进程的事件循环不被长连接与流式解析占住。

### 2.2 目录与产物

```text
hakoniwa/
  desktop/                    桌面壳（Node 侧 TypeScript，esbuild 打成 CommonJS）
    main.ts                   入口：生命周期、窗口、协议、安全设置、单实例
    preload.ts                预载桥：contextBridge 暴露 window.hk
    ipc/                      通道定义（channels.ts）与按领域拆分的处理器
    llm_gateway/              utility 进程入口；提供方适配器取自 src/ai/providers/（同一份源码由 esbuild 打入，不另写一份；细节见 llm_providers.md）
    key_entry/                独立的密钥录入窗（ui_pop_llm_key_entry）：静态页面与只暴露提交、取消的专用预载
    secrets.ts                safeStorage 封装
    saves/                    文件存档后端（第 5 节）
    settings.ts               设置存储（第 5.2 节）
    steam/                    Steam 适配（只在 Steam 构建加载）
    crash.ts diagnostics.ts logging.ts
    app_paths.ts              开发运行与打包后两种目录布局的路径解析（纯函数）
    pack_config.ts pack.ts    electron-builder 配置、暂存目录、`hkBuild` 盖章、熔断位写入与读回比对；`npm run pack:win` 输出到 `release/`（不入库）
    dist/                     esbuild 输出（不入库）
  src/platform/               渲染进程侧的平台接口 PlatformHost 与三种实现
    host.ts                   接口：saves、settings、llm、achievements、diagnostics、window
    desktop_host.ts           调用 window.hk
    web_host.ts               IndexedDB 存档，只允许本机模型
    memory_host.ts            测试用
    select.ts                 有 window.hk 选桌面实现，否则选网页实现
    index.ts                  对外出口（不导出测试实现）
```

- `src/platform/` 只被 `src/client/` 引用；`src/core/`、`src/systems/`、`src/game/`、`src/ai/` 不得引用它（并入 `tests/architecture.test.ts` 的分层守卫）。
- 桌面壳复用仓库根目录已安装的 `electron` 与 `electron-builder`（D-057 的"复用根目录工具链"），版本与主工程一致；
  `steamworks.js` 作为本子项目的运行时依赖登记在 `hakoniwa/package.json`，只打进 Steam 构建。不引入 `electron-updater`（只走 Steam 更新）。
- Electron 版本策略：跟主工程同一主版本；某主版本退出 Electron 官方支持窗口（最新三个主版本）前完成升级；安全补丁版本两周内跟进。

### 2.3 预载桥与通道契约

预载桥只暴露一个对象 `window.hk`，每个方法对应一条具名通道，没有"任意通道"或"任意调用"的入口。通道清单由 `tests/desktop_ipc_surface.test.ts` 钉住。

| 通道 | 方向 | 载荷 | 返回 | 校验与上限 |
| --- | --- | --- | --- | --- |
| `hk:app.info` | 渲染到主 | 无 | 版本、构建号、通道、内容版本、平台 | 无 |
| `hk:save.list` | 渲染到主 | 无 | 槽位头数组（第 5.3 节） | 无 |
| `hk:save.write` | 渲染到主 | 卷 ID、槽位 ID、本次写入的文件（哈希、字节）、槽位头 | 提交结果或失败原因码 | 单次不超过 64MB；文件名只能是 64 位十六进制哈希加固定后缀；槽位 ID 白名单 |
| `hk:save.read` | 渲染到主 | 槽位 ID、要读的哈希列表 | 字节与校验结果 | 只能读槽位头引用到的文件 |
| `hk:save.delete`、`hk:save.recoverables`、`hk:save.restore`、`hk:save.importDemo` | 渲染到主 | 槽位或候选 ID | 结果 | 删除只删槽位头，文件交给回收（5.4） |
| `hk:settings.get`、`hk:settings.set` | 渲染到主 | 设置分区与值 | 设置 | 按设置结构逐字段校验（字段规则见 13.10） |
| `hk:llm.request` | 渲染到主再到网关 | 中立调用规格（连接编号、模型、分段消息、输出模式、`maxTokens`、是否流式）加一个 `MessagePort` | 经端口流回增量、完成回执或带问题代码的失败 | 规格序列化后不超过 256 KiB、分段不超过 64 段（[llm_providers.md](llm_providers.md) 第 7.4 节）；连接编号必须存在；不接受任意地址 |
| `hk:llm.abort` | 渲染到主 | 请求号 | 无 | 无 |
| `hk:llm.secret.enter` | 渲染到主 | 连接编号 | 密钥状态（无、已存、只在本次运行） | 主进程打开独立的密钥录入窗（`ui_pop_llm_key_entry`）；密钥只经录入窗进主进程，游戏渲染进程从不经手 |
| `hk:llm.secret.has`、`hk:llm.secret.clear` | 渲染到主 | 连接编号 | 密钥状态（只含末四位） | 密钥从不回传 |
| `hk:llm.models`、`hk:llm.test`、`hk:llm.ledger`、`hk:llm.wipe`、`hk:llm.problem`（推送） | 见右 | 见 [llm_providers.md](llm_providers.md) 第 7.2 节 | 同左 | 同左；连接测试与模型列表每分钟至多 10 次；台账不含文本 |
| `hk:steam.achieve`、`hk:steam.stat`、`hk:steam.presence`、`hk:steam.status` | 渲染到主 | 成就 API 名、统计名与值、富状态键值 | 结果 | API 名必须在 `data/platform/steam_achievements.json` 中 |
| `hk:diag.export` | 渲染到主 | 勾选项（日志、系统信息、设置、某个存档） | 生成的压缩包路径 | 默认只含日志与系统信息 |
| `hk:crash.pending`、`hk:crash.send` | 渲染到主 | 报告 ID | 结果 | 只在玩家同意后发送（第 12.2 节） |
| `hk:window.mode`、`hk:window.frameCap` | 渲染到主 | 全屏或窗口、帧率上限 | 结果 | 枚举 |
| `hk:shell.openExternal` | 渲染到主 | 网址 | 结果 | 只允许 `https:`，并且只允许设置页列出的域名（提供方控制台、项目网站、Steam 社区） |
| `hk:log` | 渲染到主 | 级别、消息 | 无 | 每秒至多 50 条；写入前抹掉密钥形态 |
| `hk:event` | 主到渲染 | 窗口焦点、可见性、Steam 覆盖层开合、电源与挂起 | 无 | 只读事件 |

通用规则：每个处理器先核对 `event.senderFrame.url` 的来源是 `app://hakoniwa`；载荷用手写校验器（不引第三方校验库，同 `architecture.md` 第 6 节的做法）；
体积与频率超限即拒绝并记日志；处理器只做本通道的一件事。

### 2.4 大模型请求经主进程

```text
渲染进程 AI 层：题面装配、预算预留、路由（档位乘轮次，D-079）
  -> window.hk.llm.request(调用规格, port)
主进程：核对发送方、体积与连接编号 -> 转交网关
网关（utility 进程）：守卫复核 -> 读连接设置 -> safeStorage 解密该连接的密钥（只在本次请求作用域）
  -> 提供方适配器（Anthropic、OpenAI 兼容、本机服务，见 llm_providers.md）
  -> Electron net 模块发请求（走 Chromium 网络栈，遵循系统代理；设置页可填手动代理）
  -> 流式增量经 MessagePort 回到渲染进程；结束时回执：用量、延迟、费用估算、提供方请求 ID
  -> 台账 llm/ledger.jsonl 追加一行（时间、连接、模型、用量、费用、延迟、结果分类；不含题面与输出）
渲染进程 AI 层：输出校验、提议转命令（D-007），写审计
```

- **错误分类**：网关把提供方的错误归入固定类别后才回传，至少包括 D-067 的五类（密钥无效、余额不足、无此模型、超时、上下文超长），
  另加网络不可达、限流、提供方拒答、花费上限已到。完整枚举与界面文案归 [llm_providers.md](llm_providers.md)。错误正文在回传前抹掉密钥与鉴权头。
- **纵深的花费上限**：玩家设定的每小时与每日上限（D-067）由渲染进程的预算器先行执行；网关按台账独立再执行一次，超限直接返回"花费上限已到"，
  即使渲染进程的预算器出错也不会多花钱。
- **地址规则**：调用规格只引用连接编号，地址只来自玩家保存的连接设置；远端地址必须是 `https:`；`http:` 只允许 `127.0.0.1`、`localhost`、`::1` 与玩家明确登记的局域网地址。
- **不保存题面全文**（AQ-15）：网关与主进程的日志只记元数据；开发者模式只在 `internal` 通道构建里可开。
- **挂起与恢复**：系统挂起时网关中止在途请求，回执记为"超时"；这与"世界不等模型"一致，兜底照常到点（[ai_architecture.md](ai_architecture.md) 第 3.9 节）。
- **网页试玩版**：没有网关。只允许本机服务连接，由浏览器直连 `http://127.0.0.1`（本机服务需允许本站来源，设置页给出各本机服务的跨域设置说明）。

### 2.5 密钥存储

| 项 | 规则 |
| --- | --- |
| 机制 | Electron `safeStorage.encryptString`；密文以 base64 存 `userData/secrets.bin`（JSON：连接编号到密文） |
| 平台后端 | Windows DPAPI；macOS 钥匙串中本应用的一个加密钥；Linux 由 `safeStorage.getSelectedStorageBackend()` 判定 |
| Linux 无钥匙串 | 后端为 `basic_text` 或 `unknown` 时不落盘：密钥只存网关内存，本次运行有效，设置页提示"本机没有可用的系统钥匙串，密钥不会被保存" |
| 录入 | 主进程创建的独立录入窗（模态、上下文隔离与沙箱、自己的预载只暴露"提交"与"取消"）；"粘贴"由主进程直接读剪贴板；游戏渲染进程从不经手密钥。界面细节见 [llm_providers.md](llm_providers.md) 第 5.5、6.1 节 |
| 读取 | 只有网关在发请求时解密；不提供任何回读通道 |
| 同步与导出 | `secrets.bin` 不进 Steam 云、不进诊断包、不进设置导出 |
| 删除 | "清除密钥"删除对应条目；卸载时 Steam 不删 `userData`，设置页提供"清除全部本机数据" |
| 测试 | `tests/desktop_secrets.test.ts`：Linux 无钥匙串分支不落盘；`hk:llm.secret.*` 不回传密文或明文；日志与诊断包扫描不到测试密钥 |

### 2.6 安全设置清单

| 项 | 设置 | 验证 |
| --- | --- | --- |
| `webPreferences` | `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、`webSecurity: true`、`allowRunningInsecureContent: false`、`webviewTag: false` | `tests/desktop_window.test.ts` 逐键钉住 |
| 页面来源 | 自定义特权协议 `app://hakoniwa` 从 asar 读文件，不用 `file://`；协议权限 `standard`、`secure`、`supportFetchAPI`、`codeCache` | 同上 |
| 内容安全策略 | `default-src 'self'`；`script-src 'self'`；`style-src 'self' 'unsafe-inline'`（HUD 的内联样式）；`img-src 'self' data: blob:`；`media-src 'self' blob:`；`worker-src 'self' blob:`；`connect-src 'self'`；`object-src 'none'`；`base-uri 'none'`；`frame-ancestors 'none'` | 打包前冒烟脚本把同一策略挂到开发页面，跑序章到第一场战斗，任何违规即失败（借主工程 `scripts/csp_shell_smoke.mjs` 的做法） |
| 导航 | `will-navigate`、`will-redirect`、`will-frame-navigate` 一律拦截；`setWindowOpenHandler` 全部拒绝，外链改走 `hk:shell.openExternal` 白名单 | 测试 |
| 权限 | `setPermissionRequestHandler` 只放行 `fullscreen` 与 `pointerLock`，其余拒绝 | 测试 |
| 熔断位 | `RunAsNode` 关、`EnableNodeOptionsEnvironmentVariable` 关、`EnableNodeCliInspectArguments` 关、`EnableEmbeddedAsarIntegrityValidation` 开、`OnlyLoadAppFromAsar` 开、`EnableCookieEncryption` 开 | 发布流水线读回包内熔断位并比对 |
| 开发者工具 | `steam`、`steam-playtest`、`steam-demo` 通道关闭；`internal` 与 `e2e` 通道可开 | 构建盖章测试 |
| 远程调试 | 只有 `e2e` 通道接受 `--remote-debugging-port`；其他通道启动时发现该参数即退出 | 测试 |
| 运行时环境变量 | 打包构建忽略一切改变通道、端点、更新、遥测的环境变量（盖章为准，同主工程 `desktop_config.cjs` 的规则）；只保留 `HK_DISABLE_GPU_FORCE=1` 一类救援开关 | 测试 |
| 单实例 | `requestSingleInstanceLock`；第二次启动聚焦已开窗口 | 手测加测试 |
| 日志脱敏 | 写日志前抹掉形如 `sk-`、`sk-ant-`、`Bearer ` 的串与当前已存密钥的任何片段 | `tests/desktop_logging.test.ts` |

### 2.7 窗口、显示与电源

| 项 | 规则 |
| --- | --- |
| 显示模式 | 首次启动全屏（Chromium 全屏即无边框全屏）；`Alt+Enter` 与 `F11` 切换；窗口模式记住位置与大小，显示器拔掉时回到主显示器 |
| 渲染比例 | 50% 到 100%，叠加各画质档的像素比上限（[art_pipeline.md](art_pipeline.md) 第 2.11 节） |
| 帧率上限 | 30、60、显示器刷新率三档（按 `requestAnimationFrame` 跳帧实现）；"省电模式"固定 30 |
| 失焦与最小化 | 失焦继续运行，音量降到设定比例（默认 30%）；最小化或页面隐藏时默认暂停模拟（设置"最小化时暂停"，可关） |
| 显卡选择 | 双显卡机器默认请求高性能显卡；设置可关；开机即崩溃的救援：环境变量 `HK_DISABLE_GPU_FORCE=1`，或把 `settings.local.json` 的 `gpu` 改为 `"system"`（缺省即高性能，删字段不起作用；同主工程的救援思路） |
| 软件渲染 | WebGL 渲染器名含 SwiftShader 或 llvmpipe 时自动用平面档，并提示更新显卡驱动 |
| 着色器 | 载入画面里预编译当前地图全部材质变体；Chromium 的 GPU 程序缓存留在 `userData`，第二次启动直接复用缓存 |
| 挂起与恢复 | 挂起前触发一次安全点自动存档（若在安全点）；恢复后先暂停，等玩家按键继续 |
| 退出 | 退出前在安全点自动存档；正在写档时延迟退出直到提交完成（上限 10 秒） |

### 2.8 网页试玩版的差异

| 项 | 桌面版 | 网页试玩版 |
| --- | --- | --- |
| 内容范围 | 全作 | 序章加第一幕前五周（与 Steam 试玩版相同，见 4.9） |
| 模型预设 | 关闭、单模型、分档、本机 | 关闭、本机 |
| 存档 | 文件（第 5 节） | IndexedDB，同一容器格式；可导出为文件，导入桌面版继续 |
| 设置 | `settings.*.json` | 浏览器本地存储 `hakoniwa.settings.sync` 与 `hakoniwa.settings.local`，与桌面的两份文件一一对应，每份上限 256 KiB |
| 成就与云 | Steam | 无 |
| 音频 | 全部 | 全部（OGG Vorbis；不支持 OGG 的浏览器提示换用） |
| 浏览器 | 不适用 | Chromium 系与 Firefox 的近两个大版本；需要 WebGL2，不满足时平面档 |
| 内容安全策略 | `connect-src 'self'`（对外请求全在网关） | `connect-src 'self'` 另加 `http://127.0.0.1:*` 与 `http://localhost:*`（只为本机模型服务） |

---

## 3. 构建与打包

### 3.1 构建流水

```text
npm run build           vite build：游戏与编辑器两个入口（开发用）-> dist/
npm run build:release   vite build --mode desktop（或 HK_TARGET=desktop）：只含游戏入口，带发布包扫描 -> dist/
npm run build:desktop   esbuild desktop/*.ts -> desktop/dist/*.cjs
npm run assets:pack     tools/assets/pack.ts：AI 位图 -> 图集页与清单（第 6.9 节）
npm run audio:pack      tools/audio/pack.ts：音频响度统一与编码（第 9.5 节）
npm run pack:win        先跑 build:release 与 build:desktop，再 electron-builder --dir（本机试包）
npm run dist:steam      electron-builder 生成 Steam 目录布局 -> release-steam/<平台>/
npm run dist:demo       同上，试玩版内容闸门
```

- **构建盖章**：打包时把 `hkBuild` 写进包内 `package.json`（electron-builder 的 `extraMetadata`）：版本、构建号（提交短哈希）、通道
  （`steam`、`steam-playtest`、`steam-demo`、`internal`、`e2e`）、内容版本（第 7.6 节）、Steam 应用 ID、崩溃上报地址、遥测地址。运行时以盖章为准。
- **发布包排除开发面**：扫描规则在 `tools/release_bundle.ts`：出现编辑器页面、开发服务的路由（`/api/llm`、`/api/data`、`/api/audit`）或 `@anthropic-ai/sdk` 即失败。
  `build:release` 写完产物即扫描（Vite 插件），`desktop/pack.ts` 打包前再扫一遍 `dist/`，`tests/release_bundle.test.ts` 实际构建桌面目标并扫描产物；
  开发沙盒（`src/client/app/sandbox.ts` 的标识）与开发面板的标识也加入同一扫描。
  `src/client/app/config.ts` 的 `parseConfig` 在生产构建里永远返回非开发模式，这条由测试钉住。
- **可复现**：同一提交加同一素材输入，`dist/` 与图集页逐字节相同（盖章文件除外），CI 比对两次构建的哈希。确定的图集页让 Steam 增量补丁很小（3.5）。

### 3.2 平台与目标

| 平台 | 产物 | 里程碑 | 说明 |
| --- | --- | --- | --- |
| Windows x64 | Steam 目录布局 `win-unpacked/`；内部测试另出 zip | M1 内部、M2 Playtest | 主平台；Windows on ARM 经系统的 x64 模拟运行，1.0 不出原生 arm64 |
| macOS 通用 | 散装 `.app`（Steam 只收目录，不收 dmg） | M3 | Developer ID 签名、强化运行时、公证并装订；最低 macOS 12 |
| Linux x64 | `linux-unpacked/` | M4 | Steam 原生 Linux 构建；SteamOS 与 Steam Deck 首选它，Proton 作后备 |
| 网页试玩 | `dist/` 静态站点 | M3 | 项目网站静态托管 |

每个平台在自己的 CI 机器上构建，不做交叉构建（同主工程手册的规则）。

### 3.3 签名与公证

| 平台 | 做法 | 需要准备 | 起始 |
| --- | --- | --- | --- |
| Windows | Azure Artifact Signing（Trusted Signing）签 exe 与动态库，带时间戳；Steam 不要求签名，签名是为了降低杀毒软件误报 | Azure 订阅与签名账户、身份验证、CI 服务主体 | M2 |
| macOS | Developer ID Application 证书签名；`hardenedRuntime`；授权只开 `allow-jit` 与 `allow-unsigned-executable-memory`（与主工程 `build/entitlements.mac.plist` 一致）；notarytool 公证并装订；Steam 的 mac 仓库从 macOS 或 Linux 机器上传散装 `.app`（Windows 上传会破坏框架内的符号链接与签名） | Apple 开发者账号、证书、App Store Connect API 密钥 | M3 |
| Linux | 不签名；发布 `SHA256SUMS-linux` | 无 | M4 |

签名材料全部是 CI 机密，不入库。每次发布后执行主工程手册"Post-release verification"一节的同类核对：Windows 查看签名详情；macOS `codesign --verify --deep --strict` 与 `spctl -a -t exec -vv` 必须显示"Notarized Developer ID"。

### 3.4 更新：只走 Steam

| Steam 分支 | 用途 | 谁能进 |
| --- | --- | --- |
| `default` | 公开正式版 | 全部玩家 |
| `beta` | 次版本发布前 48 小时到一周的公开测试 | 自愿切换的玩家 |
| `previous` | 上一个正式版，供回退与存档问题救急 | 全部玩家（无密码） |
| `internal` | CI 每次发布流水线的上传目标 | 团队（密码） |

- 发售前用独立的 Steam Playtest 应用（M2 封闭、M3 开放报名）与试玩版应用（M3 起，参加新品节）；三者各有独立的应用 ID 与云存档。
- 不带自更新器，也不留任何在游戏内下载代码或素材的通道。远程天启源（AQ-05）只传签名数据，不传代码（[ai_architecture.md](ai_architecture.md) 第 5.10 节）。
- 新存档在旧构建里打开时拒绝加载并提示"这个存档来自更新的版本"，不删除、不改写。

### 3.5 包体预算

| 部分 | 预算 | 说明 |
| --- | --- | --- |
| Electron 运行时 | 约 250MB（解包后） | 随 Electron 版本浮动 |
| 游戏脚本与数据 | 不超过 30MB | `dist/` 加 `data/` |
| 美术图集与界面图 | 不超过 600MB | PNG 无损；像素画压缩率高 |
| 音频 | 约 501MB，上限 550MB | 音乐 116 条（完整乐曲 81 首，按分轨计约 372MB）、环境声 79 条、音效 1,019 条（[audio_direction.md](../40_design/audio_direction.md) 第 9.4、14 节） |
| 字体 | 不超过 20MB | 只在 Linux 构建打包（第 8.5 节） |
| 安装后合计 | 不超过 1.5GB | 商店页写"需要 3GB 可用空间" |
| 单次补丁 | 小版本不超过 100MB | 图集页按"用途组"拆分并确定排序，改一张图只动一页 |

---

## 4. Steam 集成

### 4.1 集成面

| 功能 | 1.0 用不用 | 实现 |
| --- | --- | --- |
| 成就与统计 | 用 | `steamworks.js` 在主进程；规则见 4.2 |
| 云存档 | 用 | Steam Auto-Cloud（4.3），不调用远程存储接口 |
| 手柄 | 用 | 浏览器 Gamepad API 加 Steam 输入转译（4.4） |
| 富状态 | 用 | 4.5 |
| 覆盖层 | Windows 用，macOS 与 Linux 不用 | 4.5 |
| Playtest 与试玩版应用 | 用 | 4.9 |
| Steam Deck | 用 | 4.8 |
| 启动校验 | 用 `restartAppIfNecessary`：直接双击 exe 时经 Steam 重启；Steam 未安装时照常运行，只是没有 Steam 功能 | 主进程启动最早期 |
| 创意工坊、排行榜、内购、Steam DRM 外壳、时间轴 | 不用 | 无 |

`steamworks.js` 只在 Steam 通道构建里由主进程懒加载；初始化失败不影响游戏，`hk:steam.status` 报告不可用，成就进入本地待发队列，下次可用时补发。
测试用 `FakeSteam`（记录调用）与 `NullSteam`（全部空操作）两种替身。

### 4.2 成就与事迹的映射

**原则**

1. **规则生成，不手挑。** 成就表由 `tools/platform/gen_achievements.ts` 从事迹数据（来自 [catalog_deeds_titles.md](../40_design/content/catalog_deeds_titles.md) 的导入批次）、
   幕次表与结局表生成，产物 `data/platform/steam_achievements.json` 入库，新鲜度由测试守住（数据变了没重生成即失败）。
2. **不依赖大模型**：任何成就在无模型档都能达成（D-010）。只由模型输出决定的结果不映射成就。
3. **不设可错过的成就**，例外只有两类：结局（靠新周目"下一期"补齐）与铁人通关（开局可选的规则，D-073）。事迹里的"壮举"（`feat`）、分支事迹、他人事迹（`world`）一律不映射。
4. **揭示水位**：商店页对所有人展示非隐藏成就的名字与描述，所以非隐藏成就的文字必须通过第一幕开局水位的泄露扫描；
   幕次在第四幕以后的成就、全部结局、事迹里标"隐"的条目，一律设为 Steam 隐藏成就。
5. **开发与测试构建不解锁**：`internal`、`e2e` 通道用 `FakeSteam`；开发模式与任何作弊面打开过的存档不触发成就（存档头记 `tainted`）。
6. **补发**：读档时按存档内已达成的事迹、幕次与结局重算一遍，Steam 上缺的补发（成就以账号计，与读哪个存档无关）。

**成就构成（共 51 个）**

| 组 | 数量 | 来源 | 达成条件 | 隐藏 | API 名 |
| --- | --- | --- | --- | --- | --- |
| A 幕次 | 7 | 序章、第一到第六幕 | 该幕的退出旗标（`act.changed` 进入下一幕） | 序章到第三幕可见；第四到第六幕隐藏 | `HK_ACT_PROLOGUE`、`HK_ACT_1` 到 `HK_ACT_6` |
| B 结局 | 11 | 结局表（`data/scenes/endings.json`） | 看到对应结局场景 | 全部隐藏 | `HK_END_<结局 ID 去掉 ending_ 前缀并大写>` |
| C 大事迹 | 17 | 名望 50 的全部事迹 | 事迹授予 | 全部隐藏（都在第四幕以后） | `HK_DEED_<事迹 ID 去掉 deed_ 前缀并大写>` |
| D 类满页 | 11 | 事迹的 11 个可计类（成长、讨伐、异名者、迷宫、探索、收藏、社交与羁绊、经营、战争、诸神、凡人不信） | 该类计入完成度的事迹全部达成（分母按事迹目录第 1.4 节：不含隐藏、壮举、未发生的分支，也不含名望 0 的运气型与代价型事迹，成就不奖励玩家伤害自己） | 可见 | `HK_BOOK_<类码大写>` |
| E 全簿 | 1 | 事迹簿 | 计入完成度的事迹全部达成（分母同 D 组） | 可见 | `HK_BOOK_ALL` |
| F 铁人 | 1 | 铁人规则（D-073） | 在铁人规则下到达任一结局 | 可见 | `HK_IRONMAN` |
| G 开门 | 3 | 门计数（`doors_opened`） | 开门 30、60、100 扇（全作常规约 85 扇、尽量开约 125 扇，见门目录第 1 节） | 可见 | `HK_DOORS_30`、`HK_DOORS_60`、`HK_DOORS_100` |

B 组的 11 个结局：`ending_release`、`ending_release_unfinished`、`ending_new_god`、`ending_rule_eluen`、`ending_rule_valda`、`ending_rule_merca`、
`ending_rule_sylvie`、`ending_rule_moira`、`ending_janu_restored`、`ending_reclaim`、`ending_maker`。

C 组的 17 条事迹（按事迹目录当前的名望 50 条目）：`deed_dg_womb_none_chosen`、`deed_dg_abyss_four_hearts`、`deed_col_seven_steles`、`deed_bond_trial_sasha`、
`deed_bond_named_ron`、`deed_mgmt_nation_founded`、`deed_mgmt_craft_outer_edge`、`deed_war_seven_nations`、`deed_war_gate_ring`、`deed_war_four_fronts`、
`deed_war_faceless_king`、`deed_god_eska_consent`、`deed_truth_lies_five`、`deed_truth_purge_cycle`、`deed_truth_name_spoken`、`deed_truth_earth`、`deed_truth_charter_read`。
事迹目录调整名望后，C 组随生成器自动变化，不手改。

**统计与进度**：每个可计类一个整数统计 `HK_STAT_DEEDS_<类码大写>`，另有 `HK_STAT_DOORS`；达到 25%、50%、75% 时调用进度提示，D、G 两组在 Steam 上显示进度条。

**文字与图标**：成就名取幕名、结局标题与事迹名（事迹名受揭示台账约束）；描述按"做了什么"写，不写真相。名字与描述的多语言由生成器输出 Steamworks 的成就本地化文件
（简体中文 `schinese`，1.1 加 `tchinese`，1.2 加 `english`）。图标每个成就两张 64 乘 64：达成图来自提示词库的 `art_ico_ach_<slug>`，未达成图由打包脚本去饱和加压暗自动生成，不另出提示词。

**流程**：内核发出事迹授予、幕次变化、结局场景的事件；客户端的 `AchievementSink`（`src/platform/`）查映射表，经 `hk:steam.achieve` 解锁。
成就判定只读事件与存档，不进内核，不影响世界哈希。

### 4.3 云存档

| 项 | 设置 |
| --- | --- |
| 方式 | Steamworks Auto-Cloud（不写云接口代码） |
| 根与路径 | Windows 根 `WinAppDataRoaming`，子目录 `HakoniwaChronicle/saves` 与 `HakoniwaChronicle/settings.sync.json`；macOS 用根覆盖映射到 `MacAppSupport` 同名子目录；Linux 映射到 `LinuxXdgConfigHome` 同名子目录 |
| 匹配 | `saves` 目录递归、全部文件；`settings.sync.json` 单文件 |
| 不同步 | `settings.local.json`（画质、窗口、显卡偏好等机器相关项）、`secrets.bin`、`llm/`、`logs/`、崩溃转储 |
| 配额 | 每用户 2GB、6000 个文件；第 5.8 节的体积预算保证正常游玩远低于此 |
| 冲突 | 内容寻址文件永不改写，冲突只可能发生在槽位头上；Steam 的冲突对话框选哪边都不会丢文件；另一边的快照进入"可恢复存档"保留 14 天（第 5.7 节） |
| 部分同步 | 槽位头引用的文件缺失或哈希不符时，该槽位标为"云端同步未完成"，自动回退到上一代或锚点，不覆盖任何文件 |

### 4.4 手柄输入与改键

| 项 | 规则 |
| --- | --- |
| 读取 | 浏览器 Gamepad API，标准映射；每帧轮询，渲染空闲时由 60Hz 定时器轮询（第 6.3 节的调度器保证输入不随重画暂停） |
| 动作层 | `src/client/input/` 统一成 `InputAction` 枚举，键鼠与手柄都映射到动作，游戏逻辑只认动作 |
| 绑定 | 绑定表存 `settings.sync.json`（随云同步）；默认键位与手柄布局由 [ux_and_onboarding.md](../40_design/ux_and_onboarding.md) 定义；改键界面检测冲突并提示 |
| 目标选择 | 手柄用软锁定切换最近目标（D-072） |
| 窗口导航 | HUD 窗口按焦点组做方向导航；需要指点时提供虚拟光标（右摇杆） |
| 按键图示 | 按 `gamepad.id` 判定手柄家族（Xbox、PlayStation、Switch、Steam Deck），显示对应图示；Steam 输入转译出的虚拟手柄按 Steam 报告的类型；设置可手动指定 |
| Steam 输入 | Steamworks 设置：Xbox 手柄用原生支持；PlayStation、Switch 与通用手柄启用 Steam 输入转译；默认配置模板为"手柄" |
| 震动 | `vibrationActuator` 双马达；开关与强度；"减少闪烁和震动"打开时关闭 |
| 文字输入 | 祈祷、对话自由输入在手柄下优先调用 Steam 的浮动键盘；不可用时提示"Steam 加 X 打开键盘"；任何流程都另有选项或快捷语，不强制打字 |
| 死区 | 内外死区可调，默认内 0.15、外 0.95 |

### 4.5 富状态与覆盖层

- **富状态**：只显示幕次与当前区域的公开名，例如"第一幕：边石镇"；键值表随成就本地化文件一起生成，第四幕以后的区域名同样过揭示水位扫描。
- **覆盖层**：Windows 构建在主进程末尾调用 `steamworks.js` 的 `electronEnableSteamOverlay`；它是 Steam 规定的"实时 AI 生成内容"的举报入口（4.7），所以 Windows 必开。
  M2 起在参考机与 Playtest 上验证（开合、截图、输入焦点、帧率）；macOS 与 Linux 不开（主工程实测 Linux 上覆盖层注入会让 GPU 进程起不来，见主工程手册 Steam 一节），
  Linux 构建照搬主工程 `steam_overlay_guard.cjs` 的思路：检测到覆盖层预载时只追加 `--disable-gpu-sandbox`，渲染进程沙箱保持开启。
- 覆盖层打开时（`hk:event` 推送）游戏暂停模拟，除界面总线外全部静音。

### 4.6 商店页素材清单

尺寸按 Steamworks 当前文档（来源见第 19 节）。键视觉由提示词库的 `art_key_` 条目生成；标题字用开源授权字体排版后人工微调（AI 生成的文字不可靠），字体许可写进第三方声明。

| 素材 | 尺寸 | 规则 | 来源 | 里程碑 |
| --- | --- | --- | --- | --- |
| 页眉胶囊图 | 920 乘 430 | 除游戏名外不得有文字 | `art_key_` 加标题字 | M3 |
| 小胶囊图 | 462 乘 174 | 标识几乎占满，可读性第一 | 同上 | M3 |
| 主胶囊图 | 1232 乘 706 | 同页眉 | 同上 | M3 |
| 竖版胶囊图 | 748 乘 896 | 同页眉 | 同上 | M3 |
| 页面背景 | 1438 乘 810 | 可选；本作提供 | `art_key_` | M3 |
| 截图 | 至少 1920 乘 1080，16 比 9；本作 10 张 | 只放真实游戏画面；至少 4 张适合全年龄 | 回放驱动截图（第 10.6 节的同一工具），最高画质档 | M3，M4 更新 |
| 库胶囊图 | 600 乘 900 | 同页眉 | `art_key_` 加标题字 | M3 |
| 库页眉 | 920 乘 430 | 同页眉 | 同页眉胶囊图 | M3 |
| 库主视觉 | 3840 乘 1240 | 不得有任何文字；中央 860 乘 380 安全区放关键内容 | `art_key_` | M3 |
| 库标识 | 宽 1280 或高 720，透明 PNG | 只含游戏标识 | 标题字 | M3 |
| 社区图标 | 184 乘 184 | 无 | `art_key_` 裁切 | M2（Playtest 需要） |
| 客户端图标 | ico、icns、256 PNG | 无 | 同上 | M2 |
| 成就图标 | 64 乘 64，每个成就两张 | 4.2 | `art_ico_ach_` | M2 起随成就分批 |
| 预告片 | 1080p 60 帧；主预告 60 到 90 秒，另一支 30 秒短版 | 真实游戏画面；配乐用主题曲 `mus_` | 回放驱动的镜头路径录制（6.11 的同一套路径工具） | M3 |
| 活动图 | 800 乘 450 与 1920 乘 622 | 公告与活动 | `art_key_` | M4 起按活动出 |

商店文字：简短描述（不超过 300 字）、关于本作、系统需求（第 6.1 节表）、支持语言（简体中文：界面是、全语音否、字幕是）、手柄支持"完全支持"、
无障碍特性、AI 披露（4.7）、内容描述（第 14.4 节）。

### 4.7 AI 生成内容披露

Steam 内容问卷把 AI 内容分为"预先生成"与"实时生成"两类；实时生成还要说明防护措施，玩家可通过 Steam 覆盖层举报。本作两类都有。

**预先生成（问卷与商店页）**

> 中文：本作的美术（场景、人物、魔物、图标、特效与宣传图）和音频（音乐、环境声、音效）由开发团队使用 AI 工具生成，经人工筛选、裁切、调色量化与整合后放入游戏。
>
> English: The game's art (environments, characters, creatures, icons, effects and key art) and audio (music, ambience and sound effects) were created by the developers with AI tools, then curated, cropped, palette-quantized and integrated by hand.

**实时生成（问卷与商店页）**

> 中文：玩家可以选择接入自己配置的大模型服务（云端或本机），由它实时生成女神、居民与统治者的台词和行动提议。不接入时游戏使用内置 AI 与预写台词，可以完整通关。
> 防护：模型只能从游戏给出的动作菜单里选择，结果由游戏规则裁决；输出经过格式、长度、剧透与违规内容过滤，不显示链接与代码；题材分寸写进系统提示词；
> 玩家可以随时关闭，可以在游戏内屏蔽并标记任何一段生成文本，也可以通过 Steam 覆盖层举报。
>
> English: Players may connect a language model service they configure themselves (cloud or local) to generate goddess, villager and ruler dialogue and action proposals in real time.
> Without one, the game uses built-in AI and pre-written lines and remains fully completable. Guardrails: the model can only pick from menus the game offers and the game's rules decide outcomes;
> output is filtered for format, length, spoilers and prohibited content, and links or code are never shown; content boundaries are written into the system prompt;
> players can switch it off at any time, hide and flag any generated line in game, or report it through the Steam overlay.

**游戏内**："关于"页与"大模型"页各有同文说明；每段模型生成的台词在悬停或手柄长按时提供"屏蔽并标记"，被标记的文本当场隐藏，
记录（时间、角色、文本、连接名与模型名，不含密钥）写入本机 `flags.jsonl`，可随诊断包由玩家自愿发送。防护的技术细节归 [ai_architecture.md](ai_architecture.md) 第 11 节。

### 4.8 Steam Deck

目标：Deck 兼容性评级"已验证"，M4 提交评审。

| 要求 | 本作的做法 |
| --- | --- |
| 默认手柄配置可玩全部内容 | 4.4；默认模板"手柄" |
| 1280 乘 800 下文字可读 | 界面最小字号由 [ux_and_onboarding.md](../40_design/ux_and_onboarding.md) 规定；Deck 上自动启用大字号档 |
| 屏幕键盘 | 4.4 的浮动键盘 |
| 无启动器、无额外账号 | 是 |
| 性能 | 中档 60 帧（6.1）；Deck 上默认中档，可选 40Hz 模式 |
| 挂起与恢复 | 2.7；网关中止在途请求，世界不等模型 |
| 运行方式 | 原生 Linux 构建；评审若在原生构建上发现 GPU 沙箱问题，Steamworks 里把 Deck 的默认兼容工具设为 Proton 运行 Windows 构建 |

### 4.9 Playtest、试玩版与新品节

| 项 | 内容 | 里程碑 |
| --- | --- | --- |
| 封闭 Playtest | Windows；邀请制；第一幕完整；遥测在测试说明中请测试者自愿开启 | M2 |
| 开放 Playtest | 报名制；第一到第三幕 | M3 |
| 试玩版应用 | 序章加第一幕前五周（与路线图 VS-A 的范围相同）；结束时播放"试玩结束"场景；存档头记 `demo: true` | M3 |
| 试玩存档继承 | 正式版的"导入试玩存档"读取试玩版的存档目录（`hk:save.importDemo`），格式相同 | M3 |
| 新品节 | 试玩版参加一次 Steam 新品节；活动前两周冻结试玩构建 | M3 到 M4 |

---

## 5. 存档

### 5.1 存档种类与槽位

| 种类 | 数量 | 触发 | 说明 |
| --- | --- | --- | --- |
| 自动存档 | 环形 3 个 | 切换地图、睡眠、幕次变化、开战前、首领战后、每 15 现实分钟的安全点、退出 | 安全点：不在战斗、不在场景播放、不在写档 |
| 快速存档 | 1 个 | F5（手柄在菜单里） | 快速读档 F9 |
| 手动存档 | 20 个 | 存档窗口 | 可命名 |
| 铁人存档 | 每局 1 个 | 只有自动存档触发点与退出 | 不能读回更早的代次（损坏恢复除外，见 5.9）；槽位 `ironman` 同一时间只属于一局，开新铁人局前须确认并删除旧的铁人槽 |

### 5.2 存储位置与后端

```text
<userData>（Windows: %APPDATA%\HakoniwaChronicle\；macOS: ~/Library/Application Support/HakoniwaChronicle/；Linux: ~/.config/HakoniwaChronicle/）
  settings.sync.json        随云同步：按键、语言、无障碍、字幕、音量
  settings.local.json       不同步：画质、窗口、显卡偏好、帧率上限
  secrets.bin               密钥密文（2.5）
  llm/ledger.jsonl          消耗台账
  flags.jsonl               玩家标记的 AI 文本（4.7）
  logs/                     轮转日志
  saves/
    runs/<runId>/
      snap/<sha256>.hks     世界快照（gzip JSON），内容寻址
      seg/<sha256>.hkg      只增分段（历史流水、命令日志、AI 运行时），内容寻址
    slots/<slotId>.json     槽位头：提交点
    slots/<slotId>.prev.json 上一代槽位头
    thumbs/<slotId>.png     缩略图 320 乘 180
    trash/                  待回收与可恢复的候选（5.7）
```

- `runId` 是新游戏时生成的随机 ID；同一局的全部槽位共享 `runs/<runId>/` 里的文件，20 个手动槽不会复制 20 份历史。
- 渲染进程只通过 `PlatformHost.saves`（`SaveBackend` 接口）读写：桌面版走 `hk:save.*`，网页版走 IndexedDB 的同构实现，测试用内存实现。
- 第一轮实现存在 localStorage 里的开发期存档（`hakoniwa.save.*` 键）不导入桌面版：兼容承诺从 M2 开始（5.5），之前的存档只在开发构建里可读。
- 桌面壳启动时用 `app.setPath('userData', <系统应用数据目录>/HakoniwaChronicle)` 固定目录名，目录名不随产品显示名或语言变化；Steam 云的路径（4.3）依赖这个目录名。

### 5.3 容器格式

槽位头 `slots/<slotId>.json`：

```json
{
  "format": "hakoniwa-save",
  "container": 1,
  "worldVersion": 12,
  "gameVersion": "1.0.0",
  "contentVersion": "c-3f9a12e0",
  "renameVersion": 4,
  "build": "a1b2c3d",
  "slot": "manual_07",
  "label": "进瓦伦堡之前",
  "runId": "r-6c1f0a9e",
  "generation": 41,
  "writerId": "w-0b8e5d21",
  "writerName": "DESKTOP-家里",
  "savedAt": "2027-03-02T12:00:00Z",
  "tick": 1234567,
  "flags": { "ironman": false, "demo": false, "tainted": false, "recovered": false },
  "summary": { "act": "act2", "map": "wallenburg", "level": 21, "doorStage": 6, "playSeconds": 54000, "aiPreset": "off", "minute": 1050, "weather": "clear" },
  "files": {
    "snapshot": { "sha256": "…64 位十六进制…", "bytes": 1830211 },
    "segments": [{ "kind": "history", "sha256": "…", "fromTick": 0, "toTick": 604800 }],
    "anchors": [{ "tick": 1209600, "sha256": "…" }]
  },
  "headerSha256": "…对上面全部字段的规范化 JSON 求哈希…"
}
```

（上例里的"…"代表省略的哈希值。）

| 文件 | 内容 | 编码 |
| --- | --- | --- |
| 快照 `.hks` | `World` 全量（`meta`、`rng`、`ids`、`inbox`、`queue`、`ai`、`slices`、`recent`），不含命令日志 | UTF-8 JSON，gzip |
| 分段 `.hkg` | 一种流的一段：`history`（事件摘要、过完的日子，[architecture.md](architecture.md) 第 4.7 节）、`commands`（（tick，序号，命令），[ai_architecture.md](ai_architecture.md) 第 3.8 节）、`ai`（`ai_state/` 的会话、记忆、账目，同文第 3.10 节） | JSON Lines，gzip |
| 锚点 | 某个过去时刻的完整快照，与普通快照同格式 | 同快照 |

- 锚点：每 7 个游戏日一份，保留最近 4 份；铁人局另在每次幕次变化时留一份。
- 缩略图与 `summary` 只用于槽位列表与标题场景（`minute` 是一天里的分钟，`weather` 是存档时的天气，标题按它们打光，[ux_and_onboarding.md](../40_design/ux_and_onboarding.md) 第 3.3.2 节），读档不依赖它们。
- 世界哈希（`src/core/save.ts` 的 `worldHash`）只覆盖快照里的 `slices` 与 `meta`，与容器无关。

### 5.4 写入顺序与原子性

1. 渲染进程在安全点取世界：`JSON.stringify` 在主线程完成（第 6.2 节预算：第六幕规模不超过 50 毫秒），压缩与 SHA-256 在 Worker 完成。
2. 新的分段（自上次存档以来的历史、命令、AI 运行时）先写：每个文件写 `.tmp`、`fsync`、重命名为哈希名；同名文件已存在则跳过（内容寻址天然去重）。
3. 写快照，同样走 `.tmp`、`fsync`、重命名。
4. 把当前槽位头复制为 `.prev.json`，再写新槽位头（`.tmp`、`fsync`、重命名）。**这一步是提交点**：之前任何时刻断电，旧槽位头仍然完整且引用的文件都在。
5. 回收：标记清除。所有槽位头（含 `.prev`）都不引用的文件移入 `trash/`，在 `trash/` 里 14 天后删除；1 小时内新写的文件不移动（避免与云同步竞争）。
6. Windows 上重命名遇到杀毒软件占用（`EPERM`、`EBUSY`）时按 100、300、900 毫秒重试三次；仍失败则报"保存失败，上一份存档完好"，不删任何东西。

压缩：分段数超过 64 时，下一次自动存档把同一流的旧分段合并成一个新分段（新哈希），旧分段在不被引用后照常回收。

### 5.5 版本号与逐版本迁移

| 版本号 | 含义 | 何时加一 |
| --- | --- | --- |
| `gameVersion` | 语义化版本（第 15 节） | 每次发布 |
| `container` | 目录、槽位头与文件编码 | 容器格式变化（罕见） |
| `worldVersion` | `World` 结构（`src/core/world.ts` 的 `WORLD_VERSION`） | 任何会写进快照的字段增删改 |
| `contentVersion` | `data/` 规范化后的哈希短串 | 自动，每次内容变化 |
| `renameVersion` | 内容 ID 重命名表 `data/registry/renames.json` 的版本 | 每次登记新的改名或删除 |

**迁移框架**（`src/core/save/migrations/`）：

- 每次 `worldVersion` 加一，新增一个文件 `v<N>_to_v<N+1>.ts`，导出纯函数 `migrate(world, ctx)`；登记进有序数组 `MIGRATIONS`。读档时按链逐级执行到当前版本。
- 迁移只做结构变换：给新字段填默认值、拆合字段、改键名。不读墙钟、不抽随机数；需要随机的默认值用固定种子从 `meta.seed` 派生。
- 迁移完成后跑 `validateWorld`：每个系统导出 `validateSlice(slice)`，检查本切片的结构与不变量；不通过即判为迁移失败，回退到加载前，不写盘。
- 已发布的迁移文件只追加、不修改；修迁移的缺陷用新的版本号。
- **内容 ID 改名与删除**走 `data/registry/renames.json`：

```json
{
  "version": 4,
  "entries": [
    { "since": 2, "kind": "ability", "from": "heroic_strike", "to": "sk_valor_strike" },
    { "since": 3, "kind": "flag", "from": "a3_danger_door_vow", "to": "a3_vow_door_opened" },
    { "since": 4, "kind": "item", "from": "sample_retired_item", "removed": true, "refund": { "copper": 12 } }
  ]
}
```

  （上例的 ID 只示意格式，真实条目由导入批次登记。）存档的 `renameVersion` 小于当前时，读档把切片、旗标、背包、事件环里出现的旧 ID 按表替换；
  删除的物品按 `refund` 折钱。改名的覆盖面由每个系统导出的 `idFields`（哪些字段装着哪类 ID）决定，不靠全文替换。
- **向前不兼容**：存档的任何版本号高于当前构建时拒绝加载，提示更新游戏（3.4）。
- **兼容承诺**：从 M2 第一个 Steam Playtest 构建起，每个外发构建的存档都能被之后所有构建读取。之前的版本号之间不写迁移，开发存档在 M2 前作废。

### 5.6 损坏检测与恢复

| 级 | 检测 | 恢复 |
| --- | --- | --- |
| 1 | 槽位头自哈希不符或 JSON 损坏 | 用 `.prev.json`（上一代） |
| 2 | 快照缺失、哈希不符、解压失败、迁移或 `validateWorld` 失败 | 用上一代槽位头的快照；仍失败进入第 3 级 |
| 3 | 当代与上一代都不可用 | 从最近的完好锚点出发，按命令日志分段重放到槽位头记录的 tick（模型调用次数为 0，[ai_architecture.md](ai_architecture.md) 第 3.8 节）；重放到的 tick 少于目标时停在能到的最远处 |
| 4 | 锚点也不可用 | 列出 `trash/` 与其他槽位里同一局的可用快照，让玩家挑 |

- 恢复成功后写一个新槽位（不覆盖坏槽位），槽位头标 `recovered: true`，界面告诉玩家回到了哪个日期。
- 每次恢复写日志，诊断包里可见；有遥测时只上报"恢复级别"计数。
- 验收：存档损坏注入测试（第 10.4 节）对每一级各造一种坏法，全部能恢复到预期 tick。

### 5.7 云同步冲突

1. 内容寻址的快照与分段永不改写，两台机器写出的文件只会并存，不会互相覆盖。
2. 冲突只发生在槽位头。Steam 的冲突对话框让玩家选"本机"或"云端"；槽位列表展示每个槽位的 `writerName` 与 `savedAt`，帮助玩家判断。
3. 落选一方的槽位头不在了，但它引用的快照与分段仍在磁盘上（回收要 14 天）。存档窗口的"可恢复存档"扫描 `runs/` 与 `trash/` 里没有被任何槽位头引用、
   且能通过校验的快照，按局与日期列出，玩家可以一键恢复成新槽位（`hk:save.restore`）。
4. 槽位头引用的文件缺失（另一台机器的文件还没同步到）时按第 5.6 节回退，并标"云端同步未完成"；同步完成后重新打开存档窗口即恢复正常。
5. 不做自动合并：两条时间线的世界不可合并。

### 5.8 体积与压缩（对应 RK-28）

| 项 | 预算（第六幕、150 小时全要素） | 守法 |
| --- | --- | --- |
| 快照解压后 | 不超过 12MB | 近期事件环 `recent` 上限；NPC 的玩家相关原话有界（[ai_architecture.md](ai_architecture.md)）；切片不存可派生数据 |
| 快照压缩后 | 不超过 2.5MB | gzip |
| 每局历史与命令分段 | 不超过 40MB | 历史按日摘要；命令日志只存外部命令（玩家、AI、兜底、脚本，`Engine` 的 `LOGGED_SOURCES`）；移动以"移动意图变化"记录，不逐 tick 记录 |
| 每局 AI 运行时分段 | 不超过 30MB | 会话归档按内容寻址去重；"存档隐私"选项把原话替换为摘要 |
| 每局合计 | 不超过 90MB | 锚点 4 份 |
| 读档时间 | 见第 6.10 节 | |

体积测试：`tests/save_size.test.ts` 用自动玩家跑到各幕末尾的夹具，断言快照与分段不超过本表按幕折算的上限。

### 5.9 铁人规则与存档

- 新游戏时选择，开局后不能打开（D-073）；槽位头 `ironman: true`。
- 只有一个槽位；存档窗口不显示"读取更早的存档"；退出与安全点自动存档。
- 损坏恢复照常可用（5.6），恢复后的局标 `recovered: true`，`HK_IRONMAN` 成就仍然有效：坏档不是玩家的错。
- 防止复制目录回滚：不做防护。单人游戏，玩家自己的文件，玩家自己的选择。

### 5.10 存档里的隐私

- AI 会话里含玩家原话，属于玩家自己的存档数据（[ai_architecture.md](ai_architecture.md) 第 11.4 节）；删除存档即删除这些内容。
- 诊断包默认不含存档；玩家勾选附带存档时，界面提示"存档里可能有你对角色说过的原话"。
- 密钥与提供方地址从不写进存档；`summary.aiPreset` 只记预设名。

---

## 6. 性能

### 6.1 目标机型与帧率

| 档 | 处理器 | 内存 | 显卡（WebGL2） | 分辨率 | 默认画质 | 帧率目标 |
| --- | --- | --- | --- | --- | --- | --- |
| 最低 | 4 核，Intel 第 7 代 i3 或 Ryzen 3 2200U 级 | 8GB | Intel UHD 620 或 Radeon Vega 3 级集显 | 1280 乘 720 | 低 | 稳定 30（1% 低帧不低于 24） |
| 推荐 | 4 核 8 线程，Intel 第 11 代 i5 或 Ryzen 5 4500U 级 | 16GB | Intel Iris Xe（80EU）或 Radeon Vega 8 级集显 | 1920 乘 1080 | 中 | 稳定 60（1% 低帧不低于 50） |
| 高 | 6 核 | 16GB | GTX 1060 或 RX 580 级独显 | 2560 乘 1440 | 高 | 稳定 60 |
| 超高（M3 后开放，D-078） | 8 核 | 16GB | RTX 3060 级 | 2560 乘 1440 | 超高 | 稳定 60 |
| Steam Deck | Deck APU | 16GB | Deck GPU | 1280 乘 800 | 中 | 60（可选 40Hz 模式） |

"稳定"的判定：基准场景（6.11）测量 60 秒，95 分位帧时间不超过目标帧时间的 1.15 倍，且 1% 低帧满足括号内的值。

### 6.2 帧预算

60 帧下每帧 16.7 毫秒，按推荐配置、中档分配：

| 部分 | 预算（每帧平均） | 说明 |
| --- | --- | --- |
| 内核 tick | 2.0 毫秒（1 倍速下每 tick 95 分位不超过 6 毫秒；每 3 帧约 1 个 tick） | 低频系统按节拍运行，日结作业按 tick 分片（6.4） |
| 场景更新 | 2.0 毫秒 | 立牌位置插值、动画帧选择、实例矩阵更新（只更新变化项） |
| 覆盖层 | 1.5 毫秒 | 名字、气泡、浮字；文字测量结果缓存 |
| HUD | 1.0 毫秒 | 每 250 毫秒刷新（`HUD_INTERVAL_MS`），写入省略（只在值变化时写 DOM） |
| 渲染提交 | 2.5 毫秒 | 绘制调用不超过 60（中档） |
| 音频与输入 | 0.5 毫秒 | |
| 余量 | 7.2 毫秒 | 垃圾回收、浏览器开销；每帧不分配新对象（对象池） |
| GPU | 不超过 12 毫秒 | 中档在推荐显卡上 |

存档：主线程上的序列化不超过 50 毫秒（第六幕规模），压缩与哈希在 Worker；自动存档只在安全点进行，避开战斗。

### 6.3 按需重画与脏标记

`src/client/render/frame_scheduler.ts`（纯逻辑核心，登记进 `CLIENT_PURE_CORES`）决定每一帧画不画。`GameSession` 的 `requestAnimationFrame` 循环照常运行（输入轮询与内核推进不能停），
只在调度器判定"要画"时调用渲染器。

| 原因 | 类别 | 来源 |
| --- | --- | --- |
| `camera` | 持续（镜头在动的每一帧） | 平移、缩放、旋转、跟随目标在动 |
| `motion` | 持续 | 视野内有实体位置在插值 |
| `anim` | 换帧时 | 视野内有立牌换动画帧 |
| `roof` | 持续（约 160 毫秒） | 屋顶溶解 |
| `fx` | 持续 | 特效、浮字、天气粒子在场 |
| `ambient` | 节拍（12 帧每秒） | 只有水面与微粒在动 |
| `lightmap` | 一次 | 点灯档变化、屋顶开合 |
| `ground` | 一次 | 地块变化（城建、剧情事件），只重画受影响的分块（6.5） |
| `overlay` | 一次 | 名字、标记、气泡内容变化 |
| `resize`、`quality`、`map` | 一次 | 窗口、画质档、地图切换 |

- **动画帧率**：待机与行走动画的单帧时长是 80 到 600 毫秒（[art_pipeline.md](art_pipeline.md) 第 3.4 节），没有镜头运动与位移时，只在任一可见立牌换帧时重画，
  实际约 10 到 15 帧每秒。
- **静止**：游戏暂停、全屏菜单或场景面板盖住世界、视野里没有任何变化时一帧不画。
- **页面隐藏**：不画；默认暂停模拟（2.7）。
- **验收**：BM-01 夜景在玩家静止、无天气时，GPU 占用比逐帧重画降低至少 60%；暂停菜单下 GPU 帧数为 0；任何可行动信息（敌人移动、施法条、地面预警）的显示延迟不超过一帧。

### 6.4 内核节拍、分片与加速档

| 速度（D-050） | 现实时间每游戏日 | 每秒 tick | 每帧 tick（60 帧） |
| --- | --- | --- | --- |
| 个人层 1 倍 | 24 分钟 | 20 | 约 0.33 |
| 个人层 2 倍 | 12 分钟 | 40 | 约 0.67 |
| 个人层 4 倍 | 6 分钟 | 80 | 约 1.33 |
| 经营与战略"慢" | 60 秒 | 480 | 8 |
| 经营与战略"中" | 20 秒 | 1440 | 24 |
| 经营与战略"快" | 6 秒 | 4800 | 80 |

"快"档要求平均每 tick 不超过 0.15 毫秒（留 30% 给渲染与界面）。做法：

1. **节拍声明**：每个系统声明 `cadence`（每 tick、每游戏分、每游戏时、每游戏日）；系统的 `tick` 只在自己的节拍上做实事。
2. **离场地图粗推**：玩家不在的地图上的居民按日程摘要以游戏时为步长推进（L3、L4 本就以摘要运行，[npc_society_ai.md](../40_design/systems/npc_society_ai.md)），
   战斗只在有敌对接触的地图上逐 tick 计算。
3. **日结分片**：每日结算（经济、城建、战略的日步）按稳定的实体 ID 排序分桶，摊到游戏日开头的若干 tick 内完成，单个 tick 不超过 12 毫秒。
   分桶由 tick 号决定，结果确定。
4. **视图裁剪**：经营与战略视图下 HD-2D 场景不画，只画当前视图。
5. **诚实标注**：机器达不到时，速度控件显示实际达到的倍率（例如"快（实际 4.1 秒每日）"），标注与实际一致（D-050）。

**验收**：BM-T1（第四幕存档，"快"档跑 1 个游戏日）在推荐配置上不超过 5 秒；BM-T2（第六幕存档）不超过 6 秒；最低配置上"中"档（20 秒每日）达标。

### 6.5 大地图地面分块

| 项 | 规则 |
| --- | --- |
| 分块 | 地面贴图按 64 乘 64 格切块，每块 1024 乘 1024 像素（每格 16 像素），各自一张贴图、一个网格 |
| 尺寸上限 | 最大地块 192 乘 192 格（图集中的 `glass_plain`），即 9 块；图集守卫测试保证没有更大的地块 |
| 显卡上限 | 每块 1024 像素，低于 WebGL2 保证的 2048，与设备的 `MAX_TEXTURE_SIZE` 无关 |
| 重画 | 地块变化只重画受影响的块（过渡抖动跨块时连同相邻块） |
| 水体遮罩与光照图 | 同样按 64 格切块（遮罩每格 1 像素，光照图每格 4 像素） |
| 视锥 | 块级视锥剔除；整张地图的全部块常驻显存（192 格地图约 36MB），切换地图才释放 |
| 界外 | 地图外一圈界外底色与轻雾，按块边缘画 |
| 验收 | 192 乘 192 地图在最低配置上载入不超过 3 秒；城建摆放一栋建筑后的地面重画不超过 8 毫秒 |

### 6.6 立牌与光源上限

| 档 | 装饰立牌同屏上限 | 动态光 | 光照图光源每图 | 天气粒子密度 | 阴影 |
| --- | --- | --- | --- | --- | --- |
| 超高 | 2500 | 8 | 256 | 100% | 4096，柔化 |
| 高 | 1800 | 8 | 256 | 100% | 2048，柔化 |
| 中 | 1200 | 6 | 256 | 70% | 1024 |
| 低 | 700 | 4 | 256 | 40% | 无 |
| 平面 | 不适用 | 光照乘色 | 256 | 40% | 无 |

- **可行动单位永不裁剪**：玩家、同伴、有名与无名居民、魔物、兵团、弹道、地面预警不计入上限，任何档都画（[art_pipeline.md](art_pipeline.md) 第 2.12 节的公平清单）。
  上限只作用于树、石、装饰、远处的群众点缀；超限时按离镜头中心的距离裁掉最远的。
- **群众**：同屏超过 300 个人形立牌时，远处的无名居民用烘焙帧图集加实例化（同兵团的做法），近处保留完整立牌。
- **动态光**：着色器常量 `MAX_DYNAMIC_LIGHTS`（`src/client/hd2d/shaders.ts`）按档编译变体；超出时按优先级与距离取舍，玩家随身光总在其中。
- **光照图**：几百盏灯只是一次贴图采样，各档都保留 256 盏上限，低档只降光照图分辨率（每格 4 像素降到 2 像素）。
- **战场**：兵团 40 个以内，士兵立牌 2000 到 4000 个，全部走实例化图集（[art_pipeline.md](art_pipeline.md) 第 4.8 节），绘制调用不超过 40。

### 6.7 画质档与自动降档（D-078）

**画质档**：超高、高、中、低、平面；具体参数归 [art_pipeline.md](art_pipeline.md) 第 2.11 节，本文只管调度与测量。

**首次启动**：标题画面背后跑 3 秒的微基准，加上 `WEBGL_debug_renderer_info` 报告的显卡名，选出初始档；软件渲染直接选平面并提示。

**自动降档（M3 上线）**：

| 项 | 规则 |
| --- | --- |
| 信号 | GPU 帧时间来自 `EXT_disjoint_timer_query_webgl2`（每 4 帧采一次）；同时记 CPU 帧时间与掉帧比例 |
| 何时判定 | 只在游玩状态：不在载入、不在场景播放、不在地图切换后的 20 秒内、窗口有焦点 |
| 触发 | 连续 15 秒的窗口里，GPU 帧时间 90 分位高于目标帧时间的 0.85 倍（60 帧时为 14.2 毫秒），且掉帧比例超过 20% |
| 动作 | 降一档：超高到高、高到中、中到低；不自动降到平面 |
| 次数 | 每局至多两次；两次之间至少 60 秒 |
| 方向 | 只降不升 |
| 告知 | 提示条："画质已从 高 自动降到 中（帧率不足）"，带"恢复"按钮与"本局停止自动调整"选项 |
| 持久 | 只在本次运行有效；连续两次运行都在同一档降档时，在设置页给出一次"建议改用 中"的提示 |
| 无计时扩展 | 驱动不支持计时查询时不自动降档，只在连续 60 秒低于 45 帧后提示一次 |
| 公平 | 降档只减观感（6.6、[art_pipeline.md](art_pipeline.md) 第 2.12 节）；画质档读玩家所选与本规则的结果，不读帧率调速器 |

### 6.8 AI 位图素材的纹理内存预算

素材全部 AI 生成（D-018），按每米 16 像素量化后打成图集（6.9）。显存按 RGBA8、不生成 mipmap 计（像素抗锯齿采样不需要 mipmap）。

| 类别（提示词库前缀） | 内容 | 低 | 中 | 高 |
| --- | --- | --- | --- | --- |
| 地面分块 | 当前地图的地面、水体遮罩 | 40MB | 40MB | 40MB |
| 光照图 | 当前地图 | 1MB | 3MB | 3MB |
| 墙、屋顶与立面（`art_bld_`、`art_tile_`） | 当前风格包 | 16MB | 32MB | 32MB |
| 人物帧与纸娃娃（`art_chr_`、`art_doll_`） | 当前地图在场人物 | 32MB | 64MB | 96MB |
| 魔物与首领（`art_mon_`、`art_boss_`） | 当前地图出现的种类 | 32MB | 48MB | 64MB |
| 兽伴与坐骑（`art_pet_`） | 同行与在场 | 8MB | 16MB | 16MB |
| 道具与装饰（`art_prop_`） | 当前风格包 | 16MB | 32MB | 32MB |
| 远景天幕（`art_bg_`） | 当前区域三层 | 12MB | 24MB | 24MB |
| 特效序列帧（`art_vfx_`） | 常驻通用加当前战斗 | 16MB | 32MB | 48MB |
| 兵团图集（`art_unit_`，只在战场） | 双方兵种 | 32MB | 48MB | 64MB |
| 渲染目标与阴影 | 后期链、阴影贴图 | 30MB | 80MB | 160MB |
| 合计上限 | | 256MB | 448MB | 640MB |

- 界面图（`art_ico_`、`art_por_`、`art_bust_`、`art_ui_`、`art_map_`）走 DOM，解码后占用另计，上限 128MB（头像与立绘按需解码，离开窗口 30 秒后释放）。
- **纹理台账**：`src/client/hd2d/texture_ledger.ts` 登记每张贴图的字节数与用途组，超预算时按"最久未用"释放非当前地图的页；台账读数进性能测试报告与调试面板。
- 战场与城镇不同时常驻：进入战场释放城镇的人物页，退出时重新流式载入。
- 验收：BM 各场景在三档下台账读数不超过本表上限；4 小时浸泡（6.12）中显存读数不随时间增长。

### 6.9 图集与流式加载

| 项 | 规则 |
| --- | --- |
| 图集页 | 2048 乘 2048（WebGL2 保证的最小上限）；每帧四周 2 像素外扩，防止像素抗锯齿采样串色 |
| 用途组 | 按"风格包"（墙、屋顶、道具）、"区域魔物"、"人物群"（按地图）、"通用特效"、"兵团"分组打包；一张地图只载入它引用的组 |
| 确定性 | 打包输入按 ID 排序、算法固定，同输入同字节（3.5 的小补丁） |
| 清单 | `public/art/atlas_manifest.json`：素材 ID 到页、矩形、锚点、帧序列；由 `tools/assets/pack.ts` 生成，不手改 |
| 预取 | 地图载入时同步载入本图的组；空闲时预取出口相连地图的组（按图集 `data/world/atlas_routes.json` 的邻接） |
| 占位 | 某个素材的页还没到时先用程序化占位（同 ID 的程序化模板或通用剪影），到了再换，不阻塞游玩；剪影照常显示名字与标记，可行动信息不受影响 |
| 解码 | `fetch` 后在 Worker 里 `createImageBitmap`，主线程只做贴图上传，每帧上传不超过 2 页 |
| 磁盘格式 | PNG 无损（像素画经调色量化后压缩率高）；不用有损纹理压缩（会糊掉像素边） |
| 验收 | 跨区域地图切换不超过 3 秒（6.10）；切换后 5 秒内无单帧超过 50 毫秒的上传卡顿 |

### 6.10 加载时间目标

| 场景 | 推荐配置（固态硬盘） | 最低配置 |
| --- | --- | --- |
| 冷启动到标题画面 | 4 秒 | 8 秒 |
| 读档到可操作（第一幕） | 6 秒 | 12 秒 |
| 读档到可操作（第六幕） | 10 秒 | 18 秒 |
| 同区域地图切换（组已缓存） | 1.5 秒 | 3 秒 |
| 跨区域地图切换 | 3 秒 | 6 秒 |
| 进入战场 | 3 秒 | 6 秒 |
| 自动存档的主线程停顿 | 50 毫秒 | 100 毫秒 |
| 首次启动的着色器编译 | 计入冷启动 | 计入冷启动 |

### 6.11 PT-06 基准场景与测量方法

路线图的 PT-06（[roadmap.md](../60_production/roadmap.md) 第 4.3 节）在 M1 扩成一套常设基准，原型问题卡的指标作为 BM-02 的通过线保留。

| 编号 | 场景 | 内容 | 主要看什么 |
| --- | --- | --- | --- |
| BM-01 | 边石镇夜市 | 第一幕边石镇，夜，40 名有名居民加 60 名无名居民，路灯与窗光，小雨；街景镜头沿主街走一圈 | 典型游玩帧时间 |
| BM-02 | 压力场景 | 1000 个动画立牌、200 个光照图光源、8 盏动态光（PT-06 问题卡原文） | 立牌与光源上限 |
| BM-03 | 最大野外 | 192 乘 192 野外地图，600 棵实例化树，雾，远景天幕；俯视镜头扫全图 | 地面分块与视锥 |
| BM-04 | 战场 | 40 个兵团、3000 个士兵立牌、技能特效与地面预警 | 实例化与特效 |
| BM-05 | 神庭 | 序章神庭，泛光、暖色微粒、全部后期 | 后期链 |
| BM-06 | 城建摆放 | 150 栋建筑全部掀顶、摆放预览移动 | 掀顶与地面重画 |
| BM-07 | 平面档 | BM-01 同场景，平面渲染 | 降级档可玩 |
| BM-T1 | 加速节拍 | 第四幕存档，"快"档 1 个游戏日，无渲染 | 内核 tick 成本 |
| BM-T2 | 加速节拍 | 第六幕存档，同上 | 同上 |

**测量方法**

1. **输入固定**：每个场景由一份基准存档（`tests/fixtures/bench/<编号>.hks`，固定种子）加一条镜头路径（关键帧按回放时间插值）驱动；天气与时刻钉住。
2. **运行方式**：在打包构建里用启动参数 `--hk-bench=<编号>` 运行，或在设置页"性能测试"里点选（玩家也能跑，结果可附进诊断包）。
   基准模式关闭垂直同步与帧率上限，测的是能力而不是刷新率。
3. **时序**：载入后先预热 10 秒（着色器编译与首帧另记"首帧耗时"），再测 60 秒。
4. **指标**：帧时间的 50、95、99 分位与 1% 低帧；GPU 帧时间（计时查询）；CPU 分项（内核 tick、场景更新、覆盖层、HUD、渲染提交）；
   绘制调用、三角形、贴图数（`renderer.info`）；纹理台账读数；JS 堆；超过 50 毫秒的长任务次数。BM-T 只记总耗时与每 tick 分位。
5. **输出**：`bench/<日期>_<机器>_<构建号>.json` 与一页文字摘要；参考机结果进夜间性能回归（10.7）。
6. **参考机**：设备库常备四台：最低（UHD 620 笔记本）、推荐（Iris Xe 笔记本）、高（GTX 1060 台式机）、Steam Deck。夜间回归跑在推荐机上（自托管 CI 机器），
   其余三台每个里程碑与每个发布候选各跑一次。
7. **通过线**：第 6.1 节帧率表；BM-02 另须满足 PT-06 问题卡的"绘制调用不超过 30"（实例化之后）；BM-T 见 6.4。

### 6.12 长时间运行

- **浸泡测试**：打包构建在推荐机上让自动玩家连续游玩 4 小时（渲染开启，跨越地图切换、战斗、存档），每 5 分钟记录 JS 堆、纹理台账、DOM 节点数、事件监听器数。
- **通过线**：第一个小时之后，每小时增长不超过 5%；无崩溃；帧时间 95 分位的漂移不超过 10%。
- **频率**：每周一次；每个发布候选一次。

---

## 7. 内容数据管线

### 7.1 来源与去向

```text
设计源（docs/40_design/content/ 的总纲与各目录，D-066）
  -> 导入批次（docs/70_packets/content_<幕>_<类别>_<两位序号>/，dev_process.md 第 3.1 节）
       tools/content/import_catalog.ts：把目录里以 ID 开头的表格行抽成暂存 JSON（data/_staging/<批次>.json）
       作者（人或代理）补机制字段：数值、引用、条件表达式、素材 ID、文本
  -> 校验 V1 到 V10（7.4）
  -> 合入 data/<领域>/*.json（数据层是 ID 的主人之一，content_bible.md 第 13 节）
  -> 生成物：内容版本哈希、content.generated.json（8.3）、Steam 成就表（4.2）、素材需求核对（7.7）
```

- 目录是设计源，`data/` 是运行源；两者冲突时以目录为准修数据，数据层发现的设计问题登记回 [content_review.md](../40_design/content/content_review.md)。
- 暂存目录 `data/_staging/` 不被内核加载，批次合入后清空。
- 抽取脚本按目录类型有字段映射（`tools/content/mappings/<目录>.ts`）；抽不出的列（叙述性文字）留给作者手填，不猜。

### 7.2 导入批次排期

| 里程碑 | 批次（包名） | 内容 |
| --- | --- | --- |
| M0 | `content_base_registry_01` | 变量注册表 `data/registry/vars.json`（D-076）、人物 ID 别名表、重命名表 `data/registry/renames.json` 起始版 |
| M0 | `content_base_rebase_01` | 已有物品按总纲 6.4 重标定价格（C45）、掉落口径统一（C46）、`a3_danger_door_vow` 改名（C91，登记进重命名表）；与经济校验、自动玩家、通关测试一起验 |
| M1 | `content_prologue_scenes_01`、`content_act1_personas_01`、`content_act1_lines_01`、`content_act1_bestiary_01`、`content_act1_items_01`、`content_act1_doors_01`、`content_act1_deeds_01`、`content_act1_quests_01`、`content_act1_abilities_01` | 序章与第一幕的全部内容；`content_act1_abilities_01` 同时完成 `sk_`、`aur_` 自有编号迁移（D-071、RE-27） |
| M2 | 第二、三幕同上各类；`content_act2_buildings_01`（`bld_`、`pol_`、`off_`）；`content_act3_warfare_01`（`unit_`、`bat_`）；第二、三幕迷宫与首领；C88、C89 门钥按正典重写 | Alpha 范围 |
| M3 | 第四到第六幕与终章各类；`content_act4_strategy_01`（`cty_`、`nev_`）；`content_act4_goddess_01`（`div_`、`trl_`）；结局与后日谈过场（`cut_`） | Beta 范围 |
| M4 | 平衡回灌批次（每幕一批）、台词补全批次、素材 ID 补全批次 | 内容完成 |

每个批次是一个轻量实施包（[dev_process.md](../60_production/dev_process.md) 第 3.5 节），退出条件：V1 到 V10 全绿、`npm test` 全绿、受影响幕的通关冒烟通过、批次报告列出新增与改动的 ID。

### 7.3 批次流程

1. **立包**：写明批次范围（ID 清单或目录小节）、依赖批次、要改的系统字段。
2. **抽取**：运行抽取脚本生成暂存 JSON；脚本输出未能映射的字段清单。
3. **补全**：补机制字段；条件表达式一律用揭示台账语法（D-076）；新旗标先登记进 `vars.json`。
4. **校验**：运行 `tools/content/validate.ts`（与测试共用同一组校验器）。
5. **合入**：暂存合入 `data/`；ID 改名或删除登记进 `renames.json` 并升 `renameVersion`。
6. **验证**：单元测试、内容校验、受影响幕的通关冒烟；涉及数值的批次跑平衡实验室的批量战斗模拟。
7. **报告**：批次报告（新增、改动、删除的 ID，校验结果，平衡摘要）进包目录，封包。

- 命令：`node tools/content/import_catalog.ts` 的 `mappings`、`extract`、`fill`、`validate`、`promote`、`verify`、`report`、`status`；映射是 `tools/content/mappings/` 下按目录表格写的声明，解析不了的单元格交给作者，不猜。
- 批次的机读记录在 `data/_batches/<批次名>.json`（每一步的命令与结果），暂存文件在 `data/_staging/`，合入后删除，`data/_staging/index.json` 保留供编辑器列出批次；人读的批次报告进所属实施包的包目录（`docs/70_packets/pk_<里程碑>_<序号>_<短名>/`），批次名写在包的别名里。
- 一个排期批次可以分段合入，段名顺延（`content_act1_items_01`、`_02`）。

### 7.4 校验层

| 层 | 检查 | 实现 | 阻断 |
| --- | --- | --- | --- |
| V1 模式 | 字段、类型、必填 | `src/content/index.ts` 的 `validateContent` 与各 pack 的 schema | 是 |
| V2 引用 | 跨表 ID 存在（物品、魔物、地图、人物、门、任务、场景、技能） | 同上，扩到全部引用字段 | 是 |
| V3 命名空间 | 一个 ID 一个主人；前缀与表匹配（总纲第 12 节与各目录登记的命名空间） | `tools/content/validators/namespace.ts` | 是 |
| V4 变量注册表 | 每个旗标与变量都已登记；条件表达式可解析；写入方与读取方一致（D-076） | `validators/registry.ts` | 是 |
| V5 揭示台账 | 玩家可见文本按"最早可见幕"做泄露扫描（禁区词、`leakSignatures`，[reveal_ledger.md](../30_story/reveal_ledger.md) 第 8 节）；"最早可见幕"的世界取本幕及之前登记的旗标为真，揭示后的名字按其 `revealWhen` 判定 | `validators/ledger.ts`，复用 `src/systems/quests` 的知识过滤 | 禁区词与 `leakSignatures` 是；台账关键词只报警（含日常词）；已审例外登记在 `ledger_reviewed.json`，到期即阻断 |
| V6 数值带 | 等级在所属幕的等级带内（D-069）；阶、价格按总纲第 3、6.4 节；经验产出按分幕预算（30%、25%、25%、12%、8% 五个来源），偏差超过 10% 报警 | `validators/balance.ts` | 等级与阶是；经验报警 |
| V7 素材引用 | 需要图或声音的条目都有 `art_`、`mus_`、`amb_`、`sfx_` ID，且在素材需求清单中；M4 起不允许占位 | `validators/assets.ts` | M4 起是 |
| V8 文本 | 每个玩家可见文本有键或在内容字段里；源文本非空；无禁用字符；长度不超过界面给的上限 | `validators/text.ts`（界面未给上限的字段，上限定在 `validators/player_text.ts`） | 是 |
| V9 可达性 | 任务与剧情图全部可达（编辑器的任务与剧情图分析）；每个结局有路线（10.3） | `validators/reach.ts` | 任务与剧情图是；结局路线在 M3（RE-21 补齐 11 条路线）前只报警 |
| V10 专有名词 | 主工程专有名词清单与已知作品名清单零命中（[reuse_map.md](reuse_map.md) 第 6.3 节第 3 条） | `validators/names.ts` | 是；第一轮数据里的命中登记为已审例外（`names_reviewed.json`），到期即阻断 |

校验器都是纯函数，测试 `tests/content_validation.test.ts` 与命令行工具共用；编辑器保存前调用同一组校验器（内容编辑器与地图编辑器的保存接入在 M1）。

### 7.5 编辑器

编辑器（`editor.html`，`src/editor/`）是开发工具，不进桌面包，界面只用中文。1.0 前需要补的能力：

| 能力 | 内容 | 里程碑 |
| --- | --- | --- |
| 批次视图 | 打开暂存 JSON，与 `data/` 做差异比对，逐条补字段，跑 V1 到 V10 | M0 |
| 变量注册表视图 | 旗标的写入方、读取方、引用它的任务与场景 | M0 |
| 台词包编辑 | `ln_` 台词按条件、幕次、关系档编辑，预览解锁条件 | M1 |
| HD-2D 内嵌预览 | 地图编辑器与外观层编辑里内嵌 HD-2D 预览（D-078 的 A-16） | M1 |
| 素材浏览 | 按 `art_` ID 查看素材状态（占位、已生成、已入图集）与引用它的条目 | M1 |
| 成就预览 | 生成后的成就表与它们的来源条目、隐藏判定 | M2 |

### 7.6 内容版本与 ID 稳定性

- `contentVersion` 是规范化（键排序、去空白）后的 `data/` 全部 JSON 的 SHA-256 前 8 位，构建时盖章，存档头记录。
- 发布后的 ID 冻结：改显示名不改 ID；必须改 ID 时登记 `renames.json` 并写迁移测试。
- 删除内容：在 `renames.json` 里登记 `removed` 与补偿；存档里出现被删的 ID 时按补偿处理，日志记录。

### 7.7 素材导入衔接

- 素材的提示词、生成与入库流程归 [art_pipeline.md](art_pipeline.md) 与 [audio_direction.md](../40_design/audio_direction.md)；提示词库的需求清单（`assets/prompts/out/manifest.json`）列出每个预期素材。
- 本文只规定游戏这一侧：`tools/assets/pack.ts` 读入库的位图与素材清单，产出图集页与 `atlas_manifest.json`；`tools/audio/pack.ts` 产出音频包与 `audio_manifest.json`。
- 数据里引用的素材 ID 在打包清单里不存在时：M3 前用程序化占位并在构建日志里列出；M4 起构建失败（V7）。
- 每个入库素材的登记字段（生成工具、提示词编号、日期、许可）由打包脚本检查，缺任何一项即失败（D-018，[reuse_map.md](reuse_map.md) 第 6.3 节第 2 条）。

---

## 8. 本地化管线

### 8.1 文本模型（D-077、D-087）

```ts
// src/core/text.ts（内核只认这些类型，不查表）
export type TextParam = string | number | TextRef;
export type TextRef =
  | { key: string; params?: Record<string, TextParam> } // 文本键加参数
  | { raw: string; lang: string }; // 模型或玩家写下的原文，带语言标签
export function tr(key: TextKey, params?: Record<string, TextParam>): TextRef; // 键受生成的联合类型约束
// src/core/content_key.ts
export function contentKey(table: string, id: string, field: string, index?: number | string): string;
export function contentText(table: string, rec: { id: string } | undefined, fallback?: TextParam, field?: string): TextParam;
```

- **拒绝原因严格是 `TextRef`。** 命令的可读拒绝原因（`CommandResult` 的 `reason`）全部由内核写，一律是文本键；成功说明（`info`）是 `TextRef` 或内容显示文字。
- **事件与视图里的文字字段是 `TextParam`。** 可能装内容显示名的字段（说话人、选项标签、任务标题、战役名等）用 `TextParam`，既可以是文本键，也可以是内容里的字符串。
  内核持有内容记录时，参数传内容键：`contentText('markets', market)` 得到 `{ key: 'c.markets.<ID>.name' }`，记录缺失时用回退值（通常是 ID）；客户端按当前语言与揭示阶段取显示名。
  城建、经济、战略、女神行动与任务交付的拒绝原因、日志与说明已经这样传；其余系统里仍以字符串传显示名的参数在后续包逐个换成内容键（渲染结果不变，以两条结局路线的渲染金样核对）。
  内核只持有一段文字、不持有记录时（模型写的名字、运行中生成的部队名），参数是字符串。
- **模型与玩家的文字是原文。** 模型写进世界的台词、计划、日记、女神与场景台词，以及玩家的输入，存为 `{ raw, lang }`，`lang` 是写下时的界面语言；切换语言后历史里的原文保持原样。
  命令数据里的自由文字经 `commandText(值, 来自模型, 清洗, 上限)` 收下：来自模型时只收字符串，清洗后存为原文；模型给出的文本键一律拒收（得到空串）；
  内核自己的规则回退可以给字符串或 `TextRef`，`TextRef` 按上限用截断指令 `sys.common.clip` 截断，渲染时与对字符串截断的结果相同。
- **词表类。** 与中文内容值比对的性格词、玩家输入里的问候与致谢等关键词、聚落居民名，是数据而不是显示文字；它们以 JSON 词表放在各系统旁
  （`src/systems/city/settler_names.json`、`src/systems/dialogue/input_lexicon.json`、`src/systems/goddess/input_lexicon.json`、`src/systems/npc/trait_words.json`、`src/systems/warfare/trait_words.json`），
  是内核里唯一允许含中文的文件，由 `tests/i18n_kernel_guard.test.ts` 的名单逐个列出，新增词表必须加进名单；内容管线的后续批次把它们迁入 `data/`。
- **题面键只按源语言渲染。** `sys.<系统>.prompt.*` 键是大模型题面的组成部分，题面固定用中文（第 8.6 节），渲染一律经 `tSource`；翻译导出跳过这些键；
  内容数据里只供题面读的字段（人设与女神卡的口吻、目标、秘密，统治者人设，日程备注等，`src/shared_ui/content_text.ts` 的 `isSourceOnlyContentKey`）同样只按源语言渲染、不导出翻译。
  导出的过滤函数是 `tools/i18n/text_check.ts` 的 `exportableKeys`（内容表传入 `isSourceOnlyContentKey`），由第 8.7 节第 2 步的导出工具使用。
- 开发者文字（日志、断言、内部错误）用英文，不进字符串表；同一句话既进日志又进界面时拆成两条。

### 8.2 字符串表布局

```text
hakoniwa/locales/
  zh-Hans/                  源语言
    ui.json                 界面文字（键 ui.*，第 20.2 节的元件类）
    sys_<系统>.json          各系统的模板句、拒绝原因与题面句（键 sys.<系统>.*；sys_common.json 放分隔符、金钱单位、季节、日期样式、截断指令）
    content.generated.json  从 data/ 自动抽取（8.3），不手改；台词包（ln_、bark_）的台词行也在这里，键是 c.line_packs.*
  zh-Hant/  en/             1.1、1.2 加入；结构相同，另有 _meta.json 记录每个键对应的源文本哈希
src/core/text_keys.generated.ts  ui.json 与 sys_*.json 全部键的联合类型，不手改
```

- 键名：`<作用域>.<路径>`，小写 ASCII、数字、下划线，点分层，例如 `ui.win.saves.slot`、`sys.combat.reject.out_of_range`（界面文档第 20.2 节）。
- 客户端查表：`t(key, params)` 与 `t(ref)`（`src/shared_ui/i18n.ts`）；查不到的键显示键名并上报，开发构建把未填的占位与显示成键名的文字标红（`src/client/app/dev_text_marks.ts`），发布构建回退到源语言。
  按数据补全的键（`ui.win.battle.formations.<阵型>`）用 `tOr(key, 回退)`：任何表都没有时显示回退值，不上报。
- 类型：`tools/i18n/gen_keys.ts` 生成 `src/core/text_keys.generated.ts`（`TextKey`，放在 `src/core` 是因为内核不得引用 `src/shared_ui`）；`tr` 与 `t` 的键参数受它约束：
  拼错的字面量键在类型检查时失败，模板字面量只要能匹配某个键即可，读自数据的普通字符串放行；内容键（`c.`）由工具生成，不在联合类型里。新增或删除表项后重跑生成，文本检查核对它是否最新。
- 占位与格式（界面文档第 20.3 节）：`{名}`；`{n, number}`、`{p, percent}`、`{m, money}`（铜数）；`{d, date}`、`{d, date, short}` 与 `{d, date, <样式键>}`（样式模板放在各系统表里，
  例 `{tick, date, sys.npc.time.label}`；不带点的样式名读 `sys.common.date.<名>`）；`{t, duration}`；`{x, ref}`；`{n, plural, one {…} other {…}}`；`{g, select, …}`。格式化函数自写，不引第三方库。
- 伪本地化 `qps-wide`（界面文档第 20.6 节）：开发构建在运行时由源语言表生成（`src/shared_ui/pseudo.ts`），每个汉字换成两个带变音符的拉丁字母、整串加【】，占位、复数与选择的语法原样保留，
  内容文字同样变换；分隔符与日期、季节的公共条目保持源文本。地址参数 `?lang=qps-wide` 切换；发布构建不带伪语言。
- 文本检查 `node tools/i18n/check.ts`（全量门的 `text_check` 步）：代码写到却不在表里的键、表里没有任何代码用到的键、各语言之间占位不一致、禁用字符、第 19.2 节长度上限
  （按 `tools/i18n/text_check.ts` 的 `LENGTH_RULES` 对应到键族；目前覆盖窗口标题、菜单项、按钮、页签、提示条、通知与门名，其余类别随对应界面落地时补规则），
  以及键类型与内容表是否最新；扫描 `src/`（编辑器与题面模板目录除外）的字面量键与按数据补全的键族。

### 8.3 内容数据的文本

- `data/` 里的显示文字（`name`、`desc`、`text`、台词行等）保持中文源文本，作者照常编辑。
- 抽取工具 `node tools/i18n/extract_content.ts` 把它们抽成 `locales/zh-Hans/content.generated.json`（改了 `data/` 的显示文字后重跑，生成物随改动一起提交），键按 `c.<表>.<ID>.<字段>[.<序号>]` 自动生成（D-087），作者不手写键：
  表名是内容表名的蛇形写法（`npcResidents` 写作 `npc_residents`）；ID 中的大写、点与连字符折成小写与下划线；字段按路径逐级写出，列表元素都有不同 ID 时用 ID，否则用序号；
  含中文的字符串都算显示文字，匹配词、标签、条件与注册表除外。`--check` 判断生成物是否最新，文本检查调用它，`tests/i18n_ui_strings.test.ts` 也把生成物与一次重新抽取比对。
- 翻译以键为单位；`_meta.json` 记源文本哈希，源文本变动的键自动标"过期"，发布级检查不允许过期与缺失。
- 运行时取内容文字一律经文本键：内核传 `contentText(表, 记录)`，客户端以 `t(ref)` 或 `tc(表, ID, 字段)` 渲染，先查当前语言、再回退源语言；
  客户端启动一局时以 `setContentText(contentTextLookup(content))` 装入这局所用内容的查表，生成表作后备。

### 8.4 迁移现有约 1000 行中文字面量

实测分布（`src/` 下各目录里含中文的字符串字面量所在行数，由本节第 1 步的扫描器口径统计）：

| 目录 | 行数 | 处理 |
| --- | --- | --- |
| `src/systems/` | 约 1050 | 迁成 `TextRef`（本节主体） |
| `src/game/` | 约 80 | 角色包里的题面模板保持中文（大模型题面用中文，D-077），移到 `src/game/ai_roles/templates/`；其余迁成 `TextRef` |
| `src/ai/` | 约 46 | 题面与输出校验的固定语句，同上处理 |
| `src/content/packs/` | 约 575 | 编辑器表单的字段标签；编辑器不本地化，保留 |
| `src/editor/` | 约 575 | 同上，保留 |
| `src/shared_ui/` | 约 680 | 已集中成文本表，机械迁成 `locales/zh-Hans/ui.json` |
| `src/client/` | 约 50 | 迁进 `ui.json` |

**步骤**

1. **扫描器**：`tools/i18n/scan_literals.ts` 列出 `src/core`、`src/systems`、`src/game`、`src/ai`、`src/client` 中含中文的字符串字面量（文件与所在导出符号），输出 JSON 清单。
2. **分类**：每条归入四类之一：拒绝原因、事件与模板句、默认名与标签、开发者文字（转英文）。
3. **类型先行**：`src/core/text.ts` 落地；`CommandResult` 的可读原因字段与共享事件（`src/core/shared_events.ts`）里的文字字段换成 `TextRef`。类型检查列出全部需要动的位置。
4. **按系统分批**，按玩家接触频率排序：dialogue、cognition、npc、city、strategy、warfare、goddess、economy、combat、doors、quests、scenes、inventory、world、party、director。
   每批把中文移进 `locales/zh-Hans/sys_<系统>.json`，代码里换成 `tr(...)`；测试断言键与参数，不断言中文句子。
5. **世界哈希**：事件里的文字从字符串变成对象，金样哈希每批重录一次；重录理由写进批次报告，并核对该批次除文字字段外没有行为差异（只搬不改写）。
6. **棘轮守卫**：`tests/i18n_kernel_guard.test.ts` 统计 `src/core`、`src/systems`、`src/game`（模板目录除外）中的中文字面量，数量不得超过 `tests/fixtures/i18n_ceiling.json` 的上限；
   上限为 0（D-077 要求 M0 完成迁移）。界面一侧由 `tests/i18n_ui_guard.test.ts` 守：`src/client` 与 `src/shared_ui` 的中文字面量为 0，
   只允许逐条列出的例外（读文字的正则检测器、伪本地化的边界符、只在开发构建加载的客户端沙盒）。
7. **界面表**：界面文字只在 `locales/zh-Hans/ui.json`，键按第 20.2 节的元件类组织（`ui.win.<窗口>.*`、`ui.hud.<元件>.*`、`ui.common.*` 等），客户端一律 `t('ui.…', 参数)`；
   编辑器与内容 pack 的字段标签不本地化，留在 `src/editor/text.ts` 与各 pack 里。
8. **存档**：迁移在 M2 兼容承诺之前完成，旧存档里的中文字符串不需要迁移代码。

### 8.5 字体与排版

- Windows 与 macOS 用系统中文字体（微软雅黑、苹方），与 [art_pipeline.md](art_pipeline.md) 第 2.10 节"用系统字体"一致。
- Linux 与 Steam Deck 的系统常常没有中文字体，Linux 构建打包思源黑体（Noto Sans CJK SC，SIL OFL 1.1）的简体子集作为后备字体；1.1 加繁体子集。许可写进第三方声明。
- 中文断行按标点禁则（句读不出现在行首）；气泡断行沿用 `src/client/render/bubbles.ts`。
- 伪本地化截图（第 10.6 节）检查文字溢出与硬编码。

### 8.6 模型文本与语言

- 题面用中文（D-077）；输出语言跟随界面语言，作为题面里的一个参数（[ai_architecture.md](ai_architecture.md) 第 7 节）。
- 模型输出写进世界时是 `{ raw, lang }`；回放与录像原样显示，不重新生成。
- 无模型档的预写台词都是键，随语言切换。

### 8.7 1.x 语言更新流程

| 步 | 内容 |
| --- | --- |
| 1 | 冻结源文本：发布前两周起，源语言改动需登记 |
| 2 | 导出待译清单：`tools/i18n/export_pending.ts` 按语言输出缺失与过期的键（带上下文：所在界面、角色、幕次、字数上限） |
| 3 | 翻译与审校：术语表（[glossary.md](../00_vision/glossary.md)）先译；专有名词按术语表统一 |
| 4 | 导入与检查：占位符一致、无禁用字符、长度不超、无过期；伪本地化截图与目标语言截图逐屏核对 |
| 5 | 发布：Steam 商店页"支持语言"与成就本地化文件同步更新 |

---

## 9. 音频系统实现要点（D-080）

声音的设计源是 [audio_direction.md](../40_design/audio_direction.md)：曲目、环境声与音效清单，取曲与交叉淡化规则（第 5 节），混音标准与响度（第 8 节），
文件格式、目录、元数据与体积（第 9 节），模块、总线、设置与无障碍（第 10 节）。本节只写发行工程一侧的实现与检查；数字与设计源不一致时以设计源为准。

### 9.1 总线与音频图

```text
音乐（分轨同步播放，按节拍网格交叉）   --> 音乐总线 --+
环境（底层、生灵、天气、澱、点缀、室内）--> 环境总线 --+
音效（内部分组：战斗、世界、兵团、神迹、过场）--> 音效总线 --+--> 总线（真峰值限幅 -1 dBTP；夜间模式另加压缩）--> 输出
界面（界面音、对话音、等待音）          --> 界面总线 --+
```

- 实现在 `src/client/audio/`，模块表以 [audio_direction.md](../40_design/audio_direction.md) 第 10.1 节为准：纯逻辑核心 `audio_director`（状态到曲目、层增益、环境组合与闪避）、
  `sound_player` 的变体选择与抢占节流、`spatializer`、`cue_map`（内核事件与动画关键帧到 `sfx_` 编号的映射）、`audio_manifest` 的校验与 `audio_settings` 登记进 `CLIENT_PURE_CORES`；
  `audio_bus` 是唯一碰 Web Audio 的模块。
- 同时发声上限、优先级与抢占按音频方向第 8.3 节（总 64：音乐 8、环境 12、音效 40、界面 4；0 级可超额 4 个）。
- `AudioContext` 在第一次用户输入后启动（浏览器自动播放策略）；桌面壳里同样遵守。没有音频设备或上下文创建失败时静默运行，游戏照常。

### 9.2 音乐导演

| 输入 | 来源 |
| --- | --- |
| 区域与地图 | 当前地图在图集里登记的 `music`、`musicNight`、`ambience`、`ambiencePoints`、`reverbZone`（音频方向第 5.1 节） |
| 时段 | 白天、黄昏、夜（`daylight.ts` 的时刻权重） |
| 战斗状态 | 音频方向第 5.4 节的战斗分级 |
| 场景覆盖 | 过场、梦境、神庭、结局（`cut_` 的镜头表指定曲目、起始层或静默） |
| 视图 | 个人层、经营、战场、大陆 |

- 取曲优先级、交叉淡化的做法、时长与对齐（下一拍、下一个小节线、乐句）、战斗进出的滞回、播放位置记忆，全部按音频方向第 5 节实现；
  对齐计算依赖曲目元数据的节拍网格（`bpm`、`beatsPerBar`、`loopStart`），提前 50 毫秒排程（音频方向第 9.5 节）。
- 循环与分轨：除"不循环且长于 60 秒"的曲目流式播放外，其余解码成缓冲，保证采样级循环；层与层同长、同起始点、只用增益开关（音频方向第 5.2、9.4 节）。
- 加速档：经营与战略视图用视图曲目；时段切换最短间隔 60 现实秒，避免频繁换曲。

### 9.3 环境声

- 组合与分层按音频方向第 6 节（底层、生灵、天气、澱、点缀、室内）；短循环在导入时烘成无缝循环（音频方向第 11 节的处理步骤）。
- 室内地图压低室外层并加室内底噪；混响区 8 种按地图登记的 `reverbZone` 切换，1 秒过渡（音频方向第 8.4 节）。

### 9.4 音效

| 项 | 规则 |
| --- | --- |
| 触发 | 客户端把内核事件与动画关键帧（脚步、出手帧、受击首帧，[art_pipeline.md](art_pipeline.md) 第 3.4 节）经 `cue_map` 映射到 `sfx_` 编号；映射表 `data/audio/cues.json`（事件类型、条件、音效编号或选择规则、优先级、字幕键；命中音的选择字段见音频方向第 7.16 节），内核不读 |
| 声部与优先级 | 音频方向第 8.3 节 |
| 去重与合并 | 同一编号 50 毫秒内只播一次、同时至多 4 个；同一目标 100 毫秒内的多次命中合并为一次，取最重的一层 |
| 变体 | 常用音效 3 到 5 个变体；挑选用客户端的表现随机源（不影响内核），音高随机正负 3% |
| 空间 | 按屏幕横向位置声像，距离、纵深、遮挡与 30 米外的处理按音频方向第 8.4 节；不做头部相关传输 |
| 战场 | 兵团音效按兵团聚合，不按士兵播放 |

### 9.5 素材规格与响度

- 格式、采样率、声道、质量与响度目标以音频方向第 8.1、9.1 节为准：交付 Ogg Vorbis 48 kHz；音乐 -18 LUFS 积分、真峰值 -1.5 dBTP；环境底层 -26 LUFS；
  音效按模板分类用瞬时最大响度归一；整体游玩响度 -18 LUFS（误差 ±2），主总线真峰值限幅 -1 dBTP。
- `tools/audio/pack.ts` 用仓库根目录已有的 ffmpeg 静态包（`loudnorm` 滤镜）统一响度、重采样、编码，生成 `audio_manifest.json`（编号、文件、时长、实测响度、循环信息、登记字段）；输出不手改。
- 类别增益表 `tools/audio/gain_map.json` 由音频方向调整，改完重跑打包（同主工程"生成物只由所属构建步骤重生"的规则）。
- 只打包状态为通过的处理结果；没有通过的编号在游戏里静默，不放占位音（音频方向第 9.2 节）。

### 9.6 内存与流式

- 解码常驻上限按音频方向第 9.4 节（音乐 256 MB、环境 64 MB、音效 160 MB，按最近最少使用释放）；进入地图时载入它的音频包，在区域图上选定目的地时预载目的地的包。
- 首次进入一个区域时没到的音效静默跳过，不阻塞。
- 安装包里的音频约 501 MB（全部约 2,422 个文件；音乐约 372 MB，按分轨计），计入第 3.5 节的包体预算。

### 9.7 设置与无障碍

| 设置 | 默认 |
| --- | --- |
| 总、音乐、环境、音效、界面五个音量 | 100、70、80、90、70（音频方向第 8.2、10.3 节） |
| 窗口在后台时 | 降低（-12 dB）；可选静音或照常 |
| 输出 | 立体声；可选单声道（折叠前声像归中） |
| 动态范围 | 完整；可选夜间 |
| 声音字幕（文本键 `audio.cap.<编号>`） | 仅重要；可选关或全部 |
| 减少闪烁和震动 | 跟随系统"减少动画"偏好 |

完整设置项与无障碍规则以音频方向第 10.3、10.4 节为准；设置页的布局归 [ux_and_onboarding.md](../40_design/ux_and_onboarding.md)。
规则：声音永远不是可行动信息的唯一载体，每个提示音都有画面上的同等提示（画质档公平原则的音频版）。

### 9.8 音频测试

- `audio_director`、`sound_player`、`spatializer`、`cue_map` 的纯逻辑单元测试：给定状态序列，断言曲目与过渡；给定并发触发，断言抢占顺序（音频方向第 10.6 节）。
- `tools/audio/pack.ts` 的检查：每个音频的实测响度与真峰值在音频方向第 8.1 节的范围内（正负 1 LU）；需求清单里的编号都有文件（M4 起）。
- 端到端：打包构建里播放一段战斗进出与昼夜切换，检查无爆音（总线峰值不超过 0 dBFS）、无超过 2 秒的意外静默（写定的静默除外）。

---

## 10. 测试策略

### 10.1 套件总表

| 套件 | 内容 | 位置 | 何时 | 时长目标 |
| --- | --- | --- | --- | --- |
| 单元 | 各系统规则与公式、客户端纯核心、桌面壳的纯逻辑（通道校验器、存档写入顺序、脱敏） | `tests/*.test.ts` | 每次提交 | 不超过 90 秒 |
| 守卫 | 分层与确定性（`tests/architecture.test.ts`）、客户端纯度（`tests/client_purity.test.ts`）、内核字面量棘轮、内容 ID 守卫（13.2）、实体字段写入守卫（13.1）、禁用字符、发布包开发面 | 同上 | 每次提交 | 含在上面 |
| 内容校验 | V1 到 V10 | `tests/content_validation.test.ts` | 每次提交 | 不超过 30 秒 |
| 确定性 | 同种子同命令同哈希；读档继续与不中断一致；回放与原局哈希一致 | `tests/core.test.ts` 等 | 每次提交 | |
| 存档 | 容器写入顺序、断电注入、损坏恢复四级、迁移链、体积预算 | `tests/save_*.test.ts` | 每次提交 | |
| 模型路径 | 脚本、混沌、录带三种模拟提供方（10.8） | `tests/ai*.test.ts` | 每次提交 | |
| 通关冒烟 | 序章到第一幕末，1 个种子，无模型 | `tests/playthrough/smoke.playthrough.test.ts` | 每次提交 | 不超过 4 分钟 |
| 通关矩阵 | 11 结局乘多种子（10.2、10.3） | `tests/playthrough/` | 夜间、每周全量 | 夜间不超过 90 分钟 |
| 浏览器端到端 | 开发构建：标题、新游戏、第一场战斗、存读档、设置、模拟手柄 | `tests/e2e/web/` | 夜间、发布候选 | |
| 桌面端到端 | Windows 打包构建：启动、通道冒烟、文件存档、网关对模拟提供方、Steam 替身 | `tests/e2e/desktop/` | 夜间、发布候选 | |
| 截图回归 | 10.6 | `tests/visual/` | 夜间 | |
| 性能回归 | 10.7 | 参考机 | 夜间 | |
| 浸泡 | 6.12 | 参考机 | 每周、发布候选 | 4 小时 |
| 人工 | 无模型档完整人工通关；真实模型一章；探索式测试 | 测试计划 | 每个里程碑 | |

### 10.2 无模型多种子通关

- **自动玩家**：`src/game/autoplay/` 只发玩家命令，`tests/playthrough/harness.ts` 的 `CHEATS` 计数必须为 0。
- **跳时**：第一轮通关约 200 万 tick，主要耗在立村、领地自治度 40、国家自治度 60 三段等待（[first_playable.md](../60_production/first_playable.md) 第 4 节第 3 条）。
  自动玩家在这些段落使用玩家同样可用的跳时手段（睡眠、等待、经营视图的"快"档，D-070），不设测试专用捷径；加上 6.4 的节拍优化，单条完整路线目标不超过 8 分钟。
- **种子**：夜间跑离手路线 5 个种子，其余 10 个结局各 1 个种子（种子按日期轮换并记录）；每周跑 11 个结局各 3 个种子。
- **铁人**：每周加一条铁人规则下的离手路线（同伴可永久死亡，D-073）。
- **断言**：没有卡住（`result.stuck` 为空）；全部幕次按序；每个主线任务都完成；没有作弊命令；每幕结束时等级在该幕等级带内（D-069）；
  每幕的经验来源占比与分幕预算的偏差不超过 10 个百分点（报警，不阻断）。
- **卡住诊断**：卡住时输出最后 200 个命令、当前目标、未满足的条件表达式，作为夜间报告附件。

### 10.3 11 个结局的自动验证

`src/game/autoplay/scene_policy.ts` 的 `EndingRoute` 扩成 11 个值，每条路线是一张决策表（关键抉择、门的取舍、神庭论证的证据顺序、离手指数与自治度目标）。

| 结局 ID | 路线名 | 关键断言（通用断言之外） |
| --- | --- | --- |
| `ending_release` | `release` | `flags.ending` 为 `release`；自治度不低于 60；`purge_route` 为 `people`；已立国（第一轮已有） |
| `ending_release_unfinished` | `release_unfinished` | 走离手而自治度或证据未达真结局门槛；断言门槛差额确实存在 |
| `ending_new_god` | `new_god` | 新神路线的前置旗标由游玩获得 |
| `ending_rule_eluen` | `rule_eluen` | 神庭裁定支持艾琉恩；对应的好感与证据由游玩获得 |
| `ending_rule_valda` | `rule_valda` | 同上，瓦尔妲 |
| `ending_rule_merca` | `rule_merca` | 同上，梅尔卡（第一轮已有） |
| `ending_rule_sylvie` | `rule_sylvie` | 同上，希尔薇 |
| `ending_rule_moira` | `rule_moira` | 同上，莫伊拉 |
| `ending_janu_restored` | `janu_restored` | 门之复辟的前置（封印与门的状态）由游玩获得 |
| `ending_reclaim` | `reclaim` | 回收的触发条件成立 |
| `ending_maker` | `maker` | 隐藏结局的条件全部由游玩获得 |

- 每个结局的触发条件以结局判定代码与 [act6_review_and_epilogue.md](../30_story/arcs/act6_review_and_epilogue.md) 为准；断言写成"条件在游玩中被满足"，不直接设旗标。
- **结局场景覆盖**：每条路线看完对应结局的全部节点（`scenes.seen` 含结局 ID；结局里带条件的节点按该路线的世界状态全部被走到或被正确跳过）。
- **分支矩阵加速**：另存每条路线在第六幕入口的夹具存档（随内容批次重生成），夜间从夹具跑 11 条收尾，每周再从序章全量跑。
- **互斥核对**：同一种子下，各路线的结局旗标两两不同；任何路线不会意外落到别的结局。

### 10.4 存档迁移与损坏测试

| 测试 | 做法 |
| --- | --- |
| 迁移链 | `tests/fixtures/saves/v<N>/` 存每个已发布 `worldVersion` 的存档样本（各幕各一份，自动玩家生成后冻结）；逐个迁移到当前版本，跑 `validateWorld`，再继续运行 2000 tick 无异常 |
| 迁移金样 | 每个样本迁移后的世界哈希记入金样；迁移代码变动导致哈希变化即失败（迁移文件发布后只追加） |
| 重命名表 | 对 `renames.json` 每条改名造一个含旧 ID 的存档，断言读档后旧 ID 零残留、删除项按补偿折算 |
| 往返 | 当前版本存档写入再读出，世界哈希不变；读档继续运行与不中断运行哈希一致 |
| 断电注入 | 内存文件系统替身在写入顺序的每一步之后"断电"，断言重启后槽位可读、内容是上一代或新一代之一 |
| 损坏注入 | 对第 5.6 节四级各造一种坏法（截断、翻转字节、删文件、删锚点），断言恢复到预期 tick |
| 云冲突模拟 | 两个替身目录交叉复制槽位头与文件，断言"可恢复存档"能列出落选一方的快照 |
| 向前不兼容 | 把版本号调大，断言拒绝加载且不改写文件 |
| 发版前样本 | 每次发布前，用上一个正式版构建跑出的存档（参考机上保存）在新构建里读档并继续玩 10 分钟（人工加自动） |

### 10.5 浏览器与桌面端到端

- **工具**：仓库根目录已有的 `puppeteer-core`，不加新依赖。网页端用本机 Chrome；桌面端连接 `e2e` 通道打包构建的远程调试端口（2.6，只有该通道接受）。
- **网页流程**：标题画面、新游戏、序章到第一场战斗、快速存读档、设置改画质与音量、改键、模拟手柄（脚本注入 Gamepad 状态）走一段路。
- **桌面流程**：启动、`hk:app.info`、在临时 `userData` 下存读档、网关连本机模拟提供方服务（`tests/e2e/fixtures/mock_llm_server.ts`）跑一次流式对话、
  错误分类五类各触发一次、Steam 替身记录成就调用、退出时存档完成。
- **控制台**：任何未处理异常或 CSP 违规即失败。

### 10.6 截图回归

| 项 | 规则 |
| --- | --- |
| 渲染 | 无头 Chromium 加 SwiftShader（`--use-angle=swiftshader`），像素比 1，960 乘 540；不同机器结果一致 |
| 输入 | 回放世界停在固定 tick，动画时钟与天气时钟钉住；镜头取固定预设 |
| 场景 | BM-01、BM-03、BM-05、BM-06 的四个视角，乘高、中、低、平面四档；加雨、雾、落灰各一张；加伪本地化界面三屏（背包、任务、设置） |
| 比对 | 页面内读回像素（`getImageData`），与金样的原始 RGBA（gzip 存储）逐像素比对；平面档要求完全一致，HD-2D 允许不超过 0.2% 的像素有差异且单像素差不超过 8 级；同时存 PNG 供人看 |
| 公平清单 | 每档每种天气自动核对覆盖层里名字、标记、施法条、地面预警的命中框都在（读渲染器的 `hitBoxes` 与覆盖层记录，不靠看图），对应 [art_pipeline.md](art_pipeline.md) 第 2.12 节的验收 |
| 更新金样 | 只能在有意的视觉改动里更新，批次报告附前后对比图 |

### 10.7 性能回归

- 夜间在推荐参考机上跑 BM-01 到 BM-07 与 BM-T1、BM-T2（6.11），结果写进历史表。
- **判定**：与最近 5 次夜间的中位数比，帧时间 95 分位或 BM-T 耗时变差超过 10% 即报回归，附 CPU 分项对比；连续两晚回归即阻断相关改动合入。
- **CI 上的轻量版**：每次提交在普通 CI 机器上跑 BM-T1 的缩短版（1000 tick），只与同一机器类型的基线比，变差超过 25% 报警。

### 10.8 模型路径的模拟与回放

| 替身 | 用途 |
| --- | --- |
| 脚本提供方 `ScriptedProvider` | 按请求的角色与轮次返回预写输出；覆盖每个意图的正常路径与校验失败路径 |
| 混沌提供方 `ChaosProvider` | 注入延迟分布、D-067 的五类错误、格式错误的 JSON、拒答、流式中途断开；断言世界不等模型、兜底到点执行、错误分类正确、花费上限生效 |
| 录带提供方 `CassetteProvider` | 开发期对真实提供方录下的请求与响应（按题面哈希、模型、参数索引；入库前抹掉密钥与鉴权头），离线重放；用于题面快照与输出解析的回归 |
| 本机模拟服务 | 桌面端到端用的 HTTP 服务，模拟 Anthropic 与 OpenAI 兼容两种协议，含流式 |

- **回放验收**：任何带模型的局，用初始世界加命令日志回放，世界哈希与原局一致，模型调用次数为 0（VS-03，[ai_architecture.md](ai_architecture.md) 第 3.8 节）。
- **题面快照**：给定投影与会话，题面逐字节相同（同文第 13 节）；揭示台账泄露检查在题面上执行。
- **真实模型**：每个里程碑用真实提供方人工跑一章，记录成本、延迟、回退率，录带入库；不进 CI（CI 不持有任何真实密钥）。

---

## 11. 持续集成与发布检查

### 11.1 流水线

工作流文件放仓库根目录 `.github/workflows/`，路径过滤 `hakoniwa/**`，与主工程的流水线互不触发（本仓库只有 `main` 一个本地分支，触发点是推送到 `main` 与标签）。

| 流水线 | 触发 | 机器 | 步骤 | 失败时 |
| --- | --- | --- | --- | --- |
| 提交（`hakoniwa-ci.yml`） | 推送到 `main`、拉取请求 | Ubuntu | 安装（根目录按仓库规定用 pnpm，`hakoniwa/` 按自带锁文件 `npm ci`）；禁用字符扫描（改动文件）；Biome（改动文件）；类型检查；单元与守卫；内容校验；存档；模型路径；通关冒烟；网页构建；发布包开发面扫描；BM-T1 缩短版 | 阻断 |
| 提交（Windows 打包冒烟） | 推送到 `main` | Windows | `build:desktop`、`pack:win`、无头启动打包构建并在 30 秒内正常退出；安全设置读回 | 阻断 |
| 夜间（`hakoniwa-nightly.yml`） | 每日定时 | Ubuntu、Windows、自托管推荐参考机 | 通关矩阵；网页与桌面端到端；截图回归；性能回归；迁移样本全量；可复现构建比对 | 生成报告，回归按 10.7 判定 |
| 每周 | 每周定时 | 同上 | 11 结局乘 3 种子全量；铁人路线；浸泡 4 小时 | 报告 |
| 发布（`hakoniwa-release.yml`） | 标签 `hk-v*` | Windows、macOS、Linux 各一台 | 构建盖章；签名与公证；Steam 目录布局；`steamcmd` 上传到 `internal` 分支；校验和；崩溃符号与源码映射私有上传；生成发布说明草稿 | 阻断发布 |

机密（只在发布流水线可用）：Windows 签名的 Azure 服务主体与签名账户；Apple 证书与公证 API 密钥；Steam 构建账号（只有上传权限的专用账号）；崩溃上报与遥测的部署密钥。
提交流水线与夜间流水线不持有任何机密，也不持有任何大模型密钥（10.8）。

### 11.2 质量门对应

对应 [dev_process.md](../60_production/dev_process.md) 第 4.1 节的四层门：

| 层 | 本作的落点 |
| --- | --- |
| 即时文案门 | 仓库 Stop 钩子（禁用字符）；不变 |
| 确定性底线 | 推送前钩子跑类型检查、守卫测试、内容校验、存档往返、Biome（改动文件） |
| 全量本地门 | `hakoniwa/` 下的 `npm run gate`：由 `tools/gate.ts` 顺序执行提交流水线的全部步骤并汇总退出码（不用管道拼命令链，避免吞掉退出码） |
| 判断型评审 | 安全与隐私审查（密钥、网关、通道、日志）、存档兼容审查（迁移与容器）、表现接缝审查（帧调度、画质公平）、测试覆盖审查；派发矩阵按 [dev_process.md](../60_production/dev_process.md) 第 4.5 节 |

### 11.3 每次发布的检查清单（补丁与次版本）

| 序 | 步骤 | 验证 |
| --- | --- | --- |
| 1 | 版本号与内容版本更新；`worldVersion` 有变动时迁移文件与夹具齐全 | 提交流水线 |
| 2 | 发布说明（玩家向中文，按"修复、改进、平衡、已知问题"分节）与开发者变更日志（来自约定式提交） | 人工 |
| 3 | 最近一次夜间全绿，且晚于最后一次代码变更 | 夜间报告 |
| 4 | 上一个正式版的存档样本在新构建读档并继续 | 10.4 发版前样本 |
| 5 | 性能无回归 | 10.7 |
| 6 | 打标签，发布流水线完成，构建进 `internal` | 流水线 |
| 7 | 参考机与 Deck 上冒烟：启动、读档、战斗、存档、模型连接测试、成就一条 | 人工，约 30 分钟 |
| 8 | 次版本：推到 `beta` 分支 48 小时，期间崩溃报告与论坛无新增 P0 | 观察 |
| 9 | 把 `previous` 指向当前正式版，再把 `default` 指向新构建 | Steamworks |
| 10 | 发布后 72 小时值守：崩溃报告、论坛、评测 | 值守表 |
| 11 | 出现 P0：把 `default` 指回 `previous`，修复走热修流程 | 回退演练过的步骤 |

---

## 12. 崩溃报告与可选遥测

### 12.1 本地日志

| 文件 | 内容 | 轮转 |
| --- | --- | --- |
| `logs/main.log` | 主进程与网关：启动横幅（版本、通道、构建号、系统、显卡、画质档）、窗口与显卡事件、存档提交与恢复、网关请求元数据（时间、连接名、模型、用量、延迟、结果分类）、Steam 状态 | 5MB 加一份归档 |
| `logs/renderer.log` | 渲染进程经 `hk:log` 写入：未处理异常、警告、自动降档、长任务、载入耗时 | 5MB 加一份归档 |

日志写入前脱敏（2.6）；不含题面、模型输出、玩家原话、存档内容。设置页有"打开日志文件夹"。

### 12.2 崩溃转储

- 用 Electron 自带的 `crashReporter`（Crashpad），`uploadToServer: false`：转储只留在本机 `crashDumps` 目录。
- 下次启动发现新转储时询问："上次游戏异常退出。发送崩溃报告可以帮助修复问题。"选项：发送、不发送；附勾选框"以后自动发送"（默认不勾）与"附上最近的错误日志"（默认勾）。
- **上传前脱敏**：转储是进程内存的片段，可能含有密钥。上传前在转储字节里查找当前已存每个密钥的 ASCII 与 UTF-16LE 形式及 `Bearer ` 后接的串，原位覆盖为同长度的 `X`；
  无法解密密钥做比对时（例如 Linux 钥匙串被锁），只上传渲染进程与 GPU 进程的转储，主进程与网关进程的转储留在本机。
- **上报端点**：构建时盖章的 Sentry 兼容转储接收地址（自托管或托管服务均可，访问受控、保留 90 天）；附带版本、通道、构建号、系统、显卡、画质档、当前幕次，不附存档。
- **符号**：Electron 官方符号与本作的源码映射在发布流水线私有上传，用于符号化；源码映射不随游戏分发。
- **崩溃循环保护**：启动后 5 分钟内连续崩溃 3 次，下次启动进入安全模式（不强制高性能显卡、画质低、清空着色器缓存），并提示玩家；安全模式下正常运行 10 分钟后自动解除。

### 12.3 诊断包

- 设置页"导出诊断包"生成一个 zip（自写的最小 zip 写入器，用 Node 的 `zlib.deflateRawSync`，不引依赖），放进下载文件夹。
- 默认包含：日志、系统信息（系统版本、处理器、内存、显卡名与驱动、显示器、WebGL 能力）、设置（不含任何密钥与提供方地址）、最近的性能测试结果。
- 可选勾选：一个存档槽（提示里面可能有玩家原话）、`flags.jsonl`（玩家标记的 AI 文本）、本机崩溃转储清单。
- 玩家自己决定发给谁（邮件或论坛）；游戏不自动上传诊断包。

### 12.4 可选遥测

默认关闭（D-067 与 [ai_architecture.md](ai_architecture.md) 第 11.4 节的隐私优先）。设置页开关"发送匿名统计帮助改进"；Playtest 的测试说明请测试者自愿打开，构建本身不改默认值。

| 类别 | 指标 | 不收集 |
| --- | --- | --- |
| 会话 | 启动、时长分桶、平台、版本、通道、语言、画质档、分辨率档、显卡名 | 账号、Steam ID、电脑名、IP（采集端不记录） |
| 性能 | 每 5 分钟的帧时间分桶、自动降档事件、长任务次数、载入耗时 | 截图 |
| 进度 | 首次进入每一幕、到达的结局 ID、每幕死亡次数分桶、每幕游玩时长 | 存档内容、玩家输入的文字 |
| AI | 预设名（关闭、单模型、分档、本机）、提供方类别（Anthropic、OpenAI 兼容、本机）、请求数、错误分类计数、回退率、延迟分桶、花费分桶 | 地址、模型密钥、题面、输出、原话 |
| 稳定性 | 崩溃次数与进程类型、存档恢复级别计数 | 转储本身（走 12.2 的同意流程） |

- **标识**：随机安装 ID（UUID），存在 `settings.local.json`，设置页可一键重置；关闭遥测时删除本机待发队列。
- **发送**：每 30 分钟与退出时批量发送；离线队列上限 1MB；格式 `telemetry_v1`（带版本号的 JSON）。
- **采集端**：一个只收数据的 HTTPS 端点（无服务器函数加对象存储），不记录 IP，原始数据保留 90 天，只出聚合看板；按安装 ID 的删除请求在 30 天内处理。
- **端点盖章**：遥测与崩溃地址写在构建盖章里；某通道没有配置地址时，设置页不显示该开关。

### 12.5 什么数据会离开本机

| 设置 | 离开本机的数据 | 去向 |
| --- | --- | --- |
| 模型预设"关闭" | 无 | 无 |
| 模型预设"本机" | 题面与输出只在本机进程之间往返 | 玩家自己的本机服务 |
| 云端提供方 | 题面（含玩家原话与游戏状态摘要）与输出 | 玩家自己选择的提供方（不经过本作的任何服务器） |
| 崩溃报告（同意后） | 脱敏后的转储与错误日志 | 本作的崩溃接收端 |
| 遥测（打开后） | 12.4 的聚合指标 | 本作的采集端 |
| Steam | 成就、统计、富状态、云存档文件 | Steam |

---

## 13. 架构债清单与改造方案

| 序 | 债 | 现状（稳定路径与符号） | 目标设计 | 验收 | 包 | 里程碑 |
| --- | --- | --- | --- | --- | --- | --- |
| 13.1 | 战斗直写实体 | `src/systems/combat/entity_ops.ts` 的 `setAlive`、`setValueTag`、`setTag`、`halt`、`setSpeed` 直接改 `Entity` 字段 | 世界系统导出端口 | 守卫零命中；金样哈希不变；`entity_ops.ts` 删除 | RE-11 | M0 |
| 13.2 | 系统里的硬编码内容 ID | `src/systems/npc/tiers.ts` 的 `MAP_ACTS`；`src/systems/economy/competitor.ts` 的 `'wallenburg'`；`src/systems/city/court.ts` 的 `'old_outpost'`；`src/systems/scenes/court.ts` 的 `SITTING` 与按女神 ID 分支；`src/systems/goddess/types.ts` 的 `GoddessId` 联合类型 | 一律来自数据 | 内容 ID 守卫零命中 | RE-12 | M0 |
| 13.3 | 逐帧无条件重画 | `GameSession.start` 每帧调用 `frame` | 帧调度器（6.3） | 6.3 验收 | RE-06 | M0 |
| 13.4 | localStorage 存档 | `SaveStore`（`src/client/hud/save_slots.ts`）与 `main.ts` 的 `storage()` | `SaveBackend` 接口与文件、IndexedDB 两种实现（第 5 节） | 10.4 全部通过 | RE-04 | M0 |
| 13.5 | 存档只校验版本 | `deserializeWorld` 遇到不同版本直接抛错 | 迁移链（5.5） | 10.4 迁移链 | RE-05 | M0 |
| 13.6 | 命令日志只在内存 | `Engine` 的重放日志超过 `logLimit` 丢最旧；`serializeWorld` 默认不含日志 | 分段落盘 | 长局全量回放 | RE-28 | M0 |
| 13.7 | 内核中文字面量 | 约 1050 行在 `src/systems/` | `TextRef`（第 8 节） | 棘轮为 0 | RE-13 | M0 |
| 13.8 | 主工程风格的技能与光环 ID | 数据里沿用经典英文 ID | `sk_`、`aur_` 自有编号（D-071） | 无前缀 ID 零命中 | RE-27 | M1 |
| 13.9 | 开发代理进入运行时 | `AiBridge` 探测 `/api/llm/status`，`ProxyProvider` 直连开发代理 | `LlmTransport` 接口加三种实现 | 发布包无 `/api/llm` | RE-02 | M1 |
| 13.10 | 设置存 localStorage | `hk.view`、`hk.quality`、`hakoniwa.settings.ai` 三个键 | `SettingsStore`，分同步与本机两份 | 设置往返测试 | RE-29 | M0 |
| 13.11 | 加速档 tick 成本 | 全部系统每 tick 运行 | 节拍、离场粗推、日结分片（6.4） | BM-T 达标 | RE-31 | M2 |
| 13.12 | 通关测试耗时 | 约 200 万 tick、约 10 分钟两条路线 | 跳时与夹具（10.2、10.3） | 夜间矩阵不超过 90 分钟 | RE-21 | M1 到 M3 |

### 13.1 世界端口取代直写

- **目标设计**：`src/systems/world/ports.ts` 导出 `setLife(ctx, id, alive)`、`setTagValue(ctx, id, prefix, value)`、`setTag(ctx, id, tag, on)`、`haltEntity(ctx, id)`、`setMoveSpeed(ctx, id, speed)`；
  实体的生死、标签、移动、速度字段只由世界系统写。端口内做参数校验（实体存在、速度非负），不发新事件（保持世界哈希，见下）。
- **步骤**：一，世界系统新增端口，逐个照搬 `entity_ops.ts` 的语义；二，战斗系统的调用点替换为端口；三，删除 `entity_ops.ts`；四，加守卫。
- **守卫**：`tests/architecture.test.ts` 增一条：`src/systems/**`（`src/systems/world/**` 除外）里不得出现对实体字段 `alive`、`tags`、`speed`、`move`、`intent` 的赋值（按正则扫描去注释后的代码）。
- **验收**：守卫通过；两条既有通关路线与确定性测试的世界哈希逐字节不变（只搬不改写）；`entity_ops.ts` 不存在。

### 13.2 内容 ID 解耦

系统代码不写内容 ID：要用到某张图、某个地点、某位女神时，按数据声明的职能或字段去查。

| 位置 | 数据与查询 |
| --- | --- |
| 人设卡的默认剧情幕（`npc/tiers.ts`） | 地图文档的 `storyActs`（幕 ID，边石镇 `act1`、瓦伦堡 `act2`），世界系统的 `mapStoryActs(content, mapId)`。不用图集的 `acts`：那是"可游玩的幕"，含回访，语义不同 |
| 收购报价的市场（`economy/competitor.ts`） | `data/economy/config.json` 的 `competitor.marketId` |
| 庭院的门回到哪里（`city/court.ts`） | `data/city/sites.json` 的地点 `roles`，村落核心标 `village_core`，用 `siteByRole(content, 'village_core')`；庭院是类型 `court` 的地点（`courtSite`），门开向的地点是 `arrivalLocation` |
| 城建的物品职能（`city/*.ts`） | `data/city/config.json`（`city_config`）：口粮与饱食值及进食顺序、腐坏率（粮仓是否减半）、慢耗品、主粮（遭袭先损、官员缺粮时购入）、各需求层的物资、官员卖余货的保留量 |
| 复活点（`combat/death.ts`） | 地图文档的 `respawn`：`door`（门内庭院开放后）与 `wake`（最后的醒来处），各至多一张图；`respawnMap(content, role)` |
| 测试图不入图集（`world/atlas.ts`） | 地图文档的 `atlasExempt` |
| 会盟里的教国与帝国（`strategy/conclave.ts`） | `data/strategy/nations.json` 的 `roles`：`church`（证据越多越敌视、发动圣战）、`summit_key`（结盟必须有它支持），各全作唯一 |
| 开局的幕与序章场景（`quests`、`scenes`、`director`、`goddess`、`doors`） | `data/quests/acts.json`：序号最小的幕是开局幕（`openingAct`），它的 `introScene` 在第 1 个 tick 播放；幕旗标未写时取开局幕 |
| `SITTING` 与按女神 ID 分支（`scenes/court.ts`、`quests/endings.ts`） | `data/goddess/goddesses.json` 每位列席女神的 `courtSeat`：席次 `seat`（裁决、审定危机与"全体"效果按它排序）、审定危机 `crisis`（ID 与加成条件）、防线加厚 `thicken`、裁决规则 `verdict`（几条防线破即受审、坦白是否算受审、自愿让位的线索：防线组合、出示过的证据、条件式）、让位时写的旗标 `yieldFlag` |
| 其余按女神 ID 的特例（`goddess/*.ts`、`director`、`scenes/epilogue.ts`、`quests/speakers.ts`） | 人格卡字段：触及方式 `reach`（`player` 跟着那个人，不看信仰份额）、出手条件 `actsWhen`、现身条件 `appearsWhen`、信物 `token`、剧情职能 `roles`（`fate_director` 导演、`offering` 收供品）、注视度别名旗标 `gazeFlag`、后日谈执笔 `record`；未列席（无 `courtSeat`）的女神不读天启、不算"全体" |
| `GoddessId` 联合类型（`goddess/types.ts`） | 品牌字符串类型；女神包载入时校验 ID 格式、席次与危机不重复、职能各一位、条件式可解析、信物存在、默认执笔唯一（`rosterProblems`）；需要穷举的地方遍历 `seatedGoddesses(content)` |

- **守卫**：`tests/content_id_guard.test.ts` 用 TypeScript 语法树收集 `src/systems/**` 与 `src/core/**` 的全部字符串字面量（去掉注释与模块路径），对照内容里的实体 ID：
  地图（含图集地图）、图集区域、大陆省份、物品、魔物、门、地点、市场、人物（人设卡与同伴）、女神、任务、场景、国家、第六幕证据。完全相等即命中；命中且不在
  `tests/fixtures/content_id_allowlist.json` 中即失败。系统目录的允许名单固定为空（测试钉住）。
- **词汇例外**：在内容命名空间（内容总纲第 12 节的前缀）落地之前，少数裸 ID 同时是代码里的封闭词汇（门 `settlement` 与地点类型、物品 `stone` 与地块类型）。
  一个字面量若是本系统目录里某个封闭词汇（字符串字面量的联合类型，或 `as const` 数组）的成员，且该词汇里至少有一个词不是 ID，就按词汇处理；
  人物、女神、地点、市场、任务、场景、国家、证据的 ID 永远不能当词汇；只由 ID 组成的联合类型或数组（例如旧的 `GoddessId`）本身就是命中。
  命名空间迁移（PK-M0-27、PK-M0-30）给 ID 加上前缀后，这条例外自然失效。
- **自动玩家**：`src/game/autoplay/` 是测试用玩家，用同一扫描与自己的允许名单（当前为空）；它的路线决策表（各结局路线的场景选择、猎场、商店、保留物资、城建与政策计划）
  在 `data/autoplay/routes.json`，随内容批次维护，`routeProblems` 对照内容校验每个 ID。
- 旗标与变量名（例如 `seal_looseness`、`merca_offerings`）不是实体 ID，由变量注册表管（V4），不在本守卫范围内；建筑、政策、兵种、技能、神权动作等规则词汇的 ID 也不在本守卫范围内。

### 13.3 到 13.5

见 6.3（帧调度器）、第 5 节（存档后端、容器、迁移）。

### 13.6 命令日志分段

- `Engine` 增 `drainLog(): LoggedCommand[]`，返回上次取走之后的新命令；存档会话把它们写进 `commands` 分段（5.3），内存只留上次存档之后的部分。
- `logLimit` 保留为安全阀：只在长时间不存档（超过 1 个游戏日）时触发，触发即强制一次安全点自动存档，而不是丢弃最旧的命令。
- 回放工具 `tools/replay/run.ts`：输入一个锚点快照加之后的命令分段，输出逐游戏日的世界哈希。
- **验收**：自动玩家跑满一条完整路线，中途存档 40 次，从任一锚点回放到终点的哈希与原局一致；内存里的日志长度不超过两次存档之间的命令数。

### 13.7 到 13.8

13.7 见第 8.4 节。13.8：技能与光环的自有编号对照表来自战斗目录（[catalog_abilities_talents.md](../40_design/content/catalog_abilities_talents.md)）；`content_act1_abilities_01` 批次改写 `data/combat/abilities.json`、`auras.json`
与全部引用处，登记进 `renames.json`（M2 之前的开发存档不需要迁移，但改名留档便于编辑器与审计追溯）；V3 加一条：技能与光环 ID 必须带前缀；V10 扫描主工程技能显示名零命中。

### 13.9 大模型传输层

- `src/ai/` 定义 `LlmTransport`（发送中立调用规格，返回流与回执），实现三种：`IpcTransport`（桌面，经 `PlatformHost.llm`）、`LocalHttpTransport`（网页试玩，只连本机服务）、
  `DevProxyTransport`（开发服务 `/api/llm`，只在 `import.meta.env.DEV` 下引入，生产构建摇树去掉）。
- `AiBridge` 的"探测代理"改成询问 `PlatformHost` 当前预设与连接状态。
- 开发服务与 `tools/llm_proxy.ts` 保留为开发工具（D-059）。
- **验收**：发布包扫描无 `/api/llm`；桌面端到端经网关完成一次流式对话；网页试玩只能选择本机服务连接。

### 13.10 设置存储

- `SettingsStore` 两份：`settings.sync.json`（按键、语言、无障碍、字幕、音量，随云同步）与 `settings.local.json`（画质、窗口、显卡偏好、帧率上限、模型预设与连接设置的非机密部分（`llm` 分区）、遥测开关与安装 ID）。
- 每份有版本号与迁移（与存档迁移同一套模式）；非法值回退默认；顶层的未知字段原样保留（新版本可能不升版本号就加字段），已知结构内部的未知字段丢弃；同步份里出现的本机份字段（例如 `llm`）丢弃，本机数据不进云。
- 模型与客户端共用一份纯逻辑设置模型 `src/client/app/settings_schema.ts`，桌面主进程用它复核；窗口位置与安装编号只由桌面壳写，页面写入时保留壳的值；帧率上限只由页面经 `hk:settings.set` 写入，`hk:window.frameCap` 只负责应用。
- **验收**：设置往返测试；损坏的设置文件回退默认并备份原文件为 `.bad`。

### 13.11 与 13.12

见 6.4 与 10.2、10.3。13.11 会改变模拟结果（节拍与分片改变了计算时机），在 M2 单独成包，金样重录、平衡实验室复核、通关矩阵全绿后合入。

---

## 14. 法律与合规

### 14.1 文件与事项清单

| 事项 | 内容要点 | 位置 | 草案 | 定稿 |
| --- | --- | --- | --- | --- |
| 用户协议 | 使用 Steam 默认的订户协议，不另写最终用户许可协议 | Steamworks 设置 | 不适用 | M4 |
| 游戏内使用须知 | 大模型是玩家自选的第三方服务，费用与条款由玩家与提供方之间约定；模型输出不经事先审阅，游戏只做菜单与过滤约束；可随时关闭；屏蔽与举报的方法；无模型可完整通关；不对第三方模型的输出作保证 | 首次在"大模型"页保存云端连接时显示一次并需确认；"关于"页常驻 | M3 | M4 |
| 隐私政策 | 第 12.5 节的数据流；遥测与崩溃报告的同意、保留期、删除方式；存档与日志只在本机；Steam 处理的数据由 Steam 隐私政策约束；联系方式；适用的 GDPR、个人信息保护法的同意基础 | 游戏内"关于"页、项目网站 `/privacy`、商店页链接，三处同文 | M3 | M4 |
| 第三方声明 | 运行时依赖（`three`、`steamworks.js`、`@anthropic-ai/sdk` 等）的许可全文；Electron 与 Chromium 的许可（Electron 自带的 `LICENSES.chromium.html`）；Linux 构建的字体（SIL OFL 1.1）；主工程 MIT 许可与版权声明（来自 `UPSTREAM.json`）；标题字所用字体的许可 | 安装目录 `THIRD_PARTY_NOTICES.txt` 与"关于"页"开源许可" | M2 | M4 |
| 来源记录 | `hakoniwa/UPSTREAM.json`（14.2） | 仓库，随包分发声明部分 | M0 | M4 |
| 制作人员名单与鸣谢 | 写明美术（场景、人物、魔物、图标、特效、宣传图）与音频（音乐、环境声、音效）由开发团队使用 AI 工具生成并经人工筛选整合，列出工具名（`assets/tools.json`）；不做配音；与第 4.7 节的预先生成披露同文 | 游戏内"关于"页与片尾、商店页 | M3 | M4 |
| AI 生成工具条款 | 出图出声工具（小九 AI 及其所用模型）的服务条款允许商用、允许再分发、产出归属；条款快照（PDF）与查阅日期存档；素材清单每项记录生成工具、提示词编号、日期（D-018） | 条款快照放仓库外的受控存储；仓库只留查阅记录（工具、条款版本、日期、结论），放 `docs/60_production/legal/` | M1 之前 | M4 复核 |
| 名称与商标 | 14.3 | 检索记录存档 | M3 | M4 |
| 分级 | 14.4 | Steam 内容问卷 | M3 | M4 |
| AI 披露 | 4.7 | Steam 内容问卷与商店页 | M3 | M4 |
| 提供方名称 | 设置页以文字列出提供方名称（指称性使用），不使用其标识；不暗示任何合作关系 | 界面 | M1 | M4 |
| 出口与地区 | 只用操作系统与 Chromium 自带的标准加密（HTTPS）；Steam 负责地区销售；1.0 不申请中国大陆版号，经 Steam 全球发行 | 不适用 | 不适用 | M4 |

### 14.2 `UPSTREAM.json` 来源记录

从主工程移植或改编的代码（目前集中在 `src/systems/combat/formulas.ts`，文件头注明改编自主工程 `src/sim/types.ts` 的 `armorReduction`、`meleeMissChance`、`spellHitChance`、
`mobXpValue`、`zeroDiff`、`rageConversion`、`rageFromDealing`）逐符号登记（D-004 复用主工程的确定性战斗规则）：

```json
{
  "upstream": {
    "name": "world-of-claudecraft",
    "license": "MIT",
    "copyright": "Copyright (c) 2026 Levy Street",
    "pinnedCommit": "cd961d3210"
  },
  "entries": [
    {
      "symbol": "armorReduction",
      "upstreamPath": "src/sim/types.ts",
      "localPath": "src/systems/combat/formulas.ts",
      "kind": "formula",
      "change": "unchanged",
      "note": "经典护甲减伤"
    },
    {
      "symbol": "zeroDiff",
      "upstreamPath": "src/sim/types.ts",
      "localPath": "src/systems/combat/formulas.ts",
      "kind": "formula",
      "change": "extended",
      "note": "等级扩到 60（D-005）"
    }
  ]
}
```

- `change` 取 `unchanged`、`extended`、`rewritten` 三值；`pinnedCommit` 是复用映射的核对基线（[reuse_map.md](reuse_map.md) 第 0 节）。
- **双向校验**：`tools/release/upstream_check.ts` 扫描源码中"Adapted from world-of-claudecraft"一类的来源注释，每处都必须在 `UPSTREAM.json` 里有条目；反过来每个条目的 `localPath` 与 `symbol` 必须存在。
  测试 `tests/upstream_record.test.ts` 调用它。
- **规则**：任何从主工程移植的代码，在同一次改动里写来源注释并登记条目；主工程的专有名词与素材不得进入（[reuse_map.md](reuse_map.md) 第 6.1 节，V10 扫描）。
- **上游同步**：主工程的公式修复按 [reuse_map.md](reuse_map.md) 第 4.4 节的规程移植，移植后前移 `pinnedCommit`。
- 第三方声明里的主工程段落由该文件生成：MIT 许可全文加版权声明。

### 14.3 名称与商标

- 2026 年 11 月的检索结果：英文 "Hakoniwa" 单词已有同名游戏（2025 年发行的 PC 游戏《Hakoniwa》），另有多款名称含 "Hakoniwa" 的作品；中文有名称相近的手机游戏《箱庭战纪》；
  未检到名为 "Hakoniwa Chronicle" 或《箱庭纪》的游戏。
- **结论**：商店名不得用单词 "Hakoniwa"。1.0 的商店名为中文《箱庭纪》、英文 "Hakoniwa Chronicle"；程序与目录名统一用 `HakoniwaChronicle`（5.2）。
- **M3 正式检索**：在中国、美国、欧盟、日本的第 9 类（软件）与第 41 类（娱乐）做商标检索，并检索 Steam、主要主机平台与移动商店的同名或近名作品；
  检索记录存档。检索出现冲突时，按"中文名加副标题"规则更名（例如《箱庭纪：千门》），英文名同步加副标题，并在决策日志登记。
- 新的玩家可见专有名词照常进术语表并做原创性检索（[dev_process.md](../60_production/dev_process.md) 第 4.3 节第 2 条、第 5.2 节）；D-082 改过英文显示名的两处（Hoarmane、Moon Cistern）随本节检索一并复核。

### 14.4 年龄分级

- 1.0 只在 Steam 发行（D-081），使用 Steam 内容问卷自评；不单独申请其他分级机构的实体评级。上架需要国际年龄分级联盟（IARC）评级的商店属于发行形态变更，按该商店要求申请，并在决策日志登记。
- **自评目标**：12 岁以上等价（对照 PEGI 12、ESRB T 的常见口径）。
- **据实申报的内容**：奇幻暴力（战斗、处刑与屠杀作为情节，不写血腥细节，[ai_architecture.md](ai_architecture.md) 第 11.3 节的题材分寸）；宗教迫害与异端审判题材；酒馆饮酒；轻度粗口；
  玩家自选模型的实时生成文本（4.7）。
- **不含**：性内容、以真钱或可兑换物下注的博彩、真实世界的民族与宗教映射。
- 内容批次引入新的敏感元素时（例如赌博小游戏），同一批次里重答问卷相关项。
- 商店截图至少 4 张适合全年龄（4.6）。

---

## 15. 版本号与补丁节奏

### 15.1 版本号

| 阶段 | `gameVersion` | 说明 |
| --- | --- | --- |
| M0 | 0.1.x | 第一轮实现的延续（`hakoniwa/package.json` 当前为 0.1.0） |
| M1 | 0.2.x | 垂直切片 |
| M2 | 0.4.x | Alpha，Steam Playtest；存档兼容承诺从这里开始 |
| M3 | 0.6.x | Beta，试玩版 |
| M4 | 0.9.x | 发布候选 |
| M5 | 1.0.0 | 发售 |
| M6 | 1.0.x、1.1、1.2 | 补丁与语言更新 |

- 语义化版本：补丁号是修复与不改 ID 的平衡调整；次版本号是新功能、新语言、新内容；主版本号留给大型扩展。
- 构建号：提交短哈希加流水线运行号，显示在标题画面角落与日志横幅。
- 存档、设置、内容的版本号各自独立（5.5、13.10、7.6），补丁也可以升 `worldVersion`，前提是迁移与夹具齐全。

### 15.2 缺陷分级

| 级 | 定义 | 响应 |
| --- | --- | --- |
| P0 | 启动即崩溃或频繁崩溃；存档损坏且无法恢复；无绕过的卡关；密钥泄露或其他安全问题 | 72 小时内热修；必要时先把 `default` 指回 `previous` |
| P1 | 有绕过的卡关；主要功能失效；性能回退超过 20% | 下一个周补丁 |
| P2 | 其他 | 月度更新 |

### 15.3 节奏

| 时段 | 节奏 |
| --- | --- |
| 发售周 | 每日一个热修窗口（有 P0 才发） |
| 发售后第 2 到 6 周 | 每周一个补丁 |
| 之后 | 每月一次补丁或次版本 |
| 1.1 | 繁体中文、发售后反馈的体验改进 |
| 1.2 | 英文 |
| 随时 | 提供方接口变化的适配更新按补丁发（每月核对一次各提供方的弃用公告）；运营天启随内容版本或签名远程源（AQ-05），远程源只传签名数据，玩家可关 |

---

## 16. 1.0 发布检查清单

每一项在发布候选构建上验证，并在末次代码变更之后完成（证据不冒充，[roadmap.md](../60_production/roadmap.md) 第 1.1 节）。全部通过后 Go 或 No-Go 写进决策日志。

| 组 | 序 | 项 | 验证方式 | 包 |
| --- | --- | --- | --- | --- |
| 内容与功能 | 1 | 全幕次无模型完整通关（D-010） | 夜间矩阵连续 7 晚全绿；发布候选上人工完整通关一次 | RE-21 |
| | 2 | 11 个结局全部自动验证通过 | 10.3；人工抽检 3 个结局 | RE-21 |
| | 3 | 模型版可玩 | Anthropic、一个 OpenAI 兼容服务、一个本机服务各跑一章无阻断；花费上限与五类错误在真实服务上演示过 | RE-02、RE-22 |
| | 4 | 内容校验 V1 到 V10 全绿，V7 无占位 | 7.4 | RE-24 |
| | 5 | 揭示台账泄露检查命中为 0 | V5 与题面快照 | RE-24 |
| 质量 | 6 | P0 为 0；P1 不超过 5 条且都有绕过，写进已知问题 | 缺陷台账 | 全部 |
| | 7 | 全部测试套件绿 | 11.1 | RE-19 |
| | 8 | 浸泡 4 小时通过 | 6.12 | RE-10 |
| | 9 | M2 以来每个外发构建的存档样本都能读并继续 | 10.4 | RE-05 |
| 性能 | 10 | 四台参考机与 Steam Deck 达到 6.1 的帧率 | BM 报告 | RE-10 |
| | 11 | 加载时间达到 6.10 | BM 报告 | RE-08 |
| | 12 | 自动降档在最低配置上演练过 | 6.7 | RE-09 |
| 存档 | 13 | 断电、损坏、云冲突注入全部通过；两台真机的 Steam 云冲突演练通过 | 10.4 加人工 | RE-04、RE-17 |
| | 14 | 铁人规则演练（含损坏恢复） | 5.9 | RE-05 |
| 平台与 Steam | 15 | Windows 签名、macOS 公证、Linux 校验和 | 3.3 | RE-18 |
| | 16 | 51 个成就配置完成，图标齐，本地化文件已上传，真机抽检解锁 | 4.2 | RE-17 |
| | 17 | 云存档三平台路径验证 | 4.3 | RE-17 |
| | 18 | Windows 覆盖层开合、截图、举报入口可用 | 4.5 | RE-17 |
| | 19 | Steam Deck 评审结果为已验证 | 4.8 | RE-17 |
| | 20 | 商店页素材、系统需求、支持语言、手柄、无障碍、AI 披露、内容问卷提交并通过审核 | 4.6、4.7、14.4 | RE-26 |
| | 21 | 分支 `default`、`beta`、`previous`、`internal` 已配置；回退演练做过一次 | 3.4 | RE-18 |
| 安全与隐私 | 22 | 2.6 安全设置清单测试全绿；熔断位读回一致；发布包开发面扫描为 0 | 测试 | RE-01 |
| | 23 | 测试密钥在日志、诊断包、存档、脱敏后的崩溃转储中都扫描不到 | 测试 | RE-03、RE-23 |
| | 24 | 遥测默认关闭；崩溃上传必须经同意 | 测试与人工 | RE-23 |
| | 25 | 恶意代码扫描（借仓库根 `scripts/malware_scan.mjs` 的思路扫 `hakoniwa/` 树）与依赖许可扫描通过 | 发布流水线 | RE-19 |
| 本地化 | 26 | 简体中文字符串表无缺失；内核中文字面量为 0；伪本地化截图无溢出 | 8.4、10.6 | RE-13、RE-14 |
| 法律 | 27 | 使用须知、隐私政策（三处同文）、第三方声明、`UPSTREAM.json` 校验 | 14.1、14.2 | RE-25 |
| | 28 | AI 生成工具条款存档；素材清单每项登记字段齐全 | 14.1、7.7 | RE-25、RE-08 |
| | 29 | 名称与商标检索结论存档 | 14.3 | RE-25 |
| 发布运营 | 30 | 值守表（发售后 72 小时）；崩溃与论坛监控；热修流水线演练过一次 | 11.3 | RE-19 |
| | 31 | Go 或 No-Go 写进决策日志，附回退方案与值守安排 | 决策日志 | 不适用 |

---

## 17. 实施包总表

量级口径同 [roadmap.md](../60_production/roadmap.md) 第 1.2 节：小（不超过 2 人周）、中（2 到 6 人周）、大（6 到 15 人周）。本表的 `RE-xx` 是发行工程实施包，作为别名并入[开发计划](../60_production/development_plan.md)的 `PK-xx` 包，包目录见 [dev_process.md](../60_production/dev_process.md) 第 3.1 节。

| 编号 | 包名 | 范围 | 依赖 | 里程碑 | 验收 | 量级 |
| --- | --- | --- | --- | --- | --- | --- |
| RE-01 | `desktop_shell` | 主进程骨架、`app://` 协议、安全设置、单实例、窗口与显示、预载桥、`PlatformHost` 接口与三种实现、日志与脱敏 | 无 | M0 | 2.6 清单测试全绿；Windows 开发机上桌面壳能玩到第一场战斗 | 中 |
| RE-02 | `llm_gateway` | utility 进程、调用规格、流式端口、错误分类、台账、纵深花费上限、代理设置、`LlmTransport` 三实现 | RE-01；[llm_providers.md](llm_providers.md) | M1 | 10.5 的模型部分；混沌测试；13.9 验收 | 中 |
| RE-03 | `secrets` | `safeStorage` 封装、Linux 无钥匙串分支、设置页密钥流程 | RE-01 | M1 | 2.5 的测试 | 小 |
| RE-04 | `save_container` | 卷与内容寻址、槽位头、写入顺序、回收、可恢复存档、IndexedDB 后端 | RE-01 | M0 | 10.4 的断电与云冲突模拟；第六幕夹具读写 | 大 |
| RE-05 | `save_migrations` | 五个版本号、迁移链、`validateSlice`、重命名表、四级恢复 | RE-04、RE-28 | M0 | 10.4 的迁移、重命名、损坏注入 | 中 |
| RE-06 | `frame_scheduler` | 脏标记、按需重画、输入轮询与重画分离 | 无 | M0 | 6.3 验收 | 中 |
| RE-07 | `ground_chunks` | 地面、水体遮罩、光照图分块；纹理台账 | RE-06 | M1 | 6.5、6.8 | 中 |
| RE-08 | `atlas_streaming` | 图集打包工具与清单、用途组、预取、占位、Worker 解码、素材登记检查 | 美术方案首批素材 | M1 | 6.9；7.7 | 大 |
| RE-09 | `auto_quality` | 首次启动微基准、自动降档 | RE-10 | M3 | 6.7；最低配置演练 | 小 |
| RE-10 | `benchmark_harness` | BM 场景、镜头路径、指标与输出、设置页"性能测试"、参考机基线、浸泡 | RE-06 | M1 | 6.11 全部场景可跑；基线入库 | 中 |
| RE-11 | `world_ports` | 13.1 | 无 | M0 | 13.1 验收 | 小 |
| RE-12 | `content_id_decoupling` | 13.2 | 无 | M0 | 13.2 守卫零命中 | 中 |
| RE-13 | `text_ref_kernel` | `TextRef`、按系统迁移、棘轮守卫 | 无 | M0 | 8.4；棘轮为 0 | 大 |
| RE-14 | `string_tables` | `locales/`、`t` 与 `tc`、键类型生成、内容抽取、伪本地化、界面表迁移 | RE-13 | M0 | 8.2、8.3 | 中 |
| RE-15 | `audio_engine` | 五总线、音乐导演、环境层、声部池、映射表、打包工具、设置 | 音频方案首批素材 | M1 | 9.8 | 大 |
| RE-16 | `input_gamepad` | 动作层、手柄、改键、焦点导航、虚拟光标、按键图示、震动、浮动键盘 | RE-01 | M1 | 4.4；端到端用模拟手柄走通序章 | 大 |
| RE-17 | `steam_integration` | `steamworks.js` 加载、成就生成器与同步、云配置、覆盖层、富状态、Deck 准备 | RE-01、RE-04 | M2 | 第 4 节各项；Playtest 真机核对 | 中 |
| RE-18 | `build_sign_package` | 构建盖章、打包配置、三平台布局、签名、公证、Steam 上传脚本、包体检查、分支 | RE-01 | M1（Windows 未签名）、M2（签名）、M3（macOS）、M4（Linux） | 第 3 节各项 | 中 |
| RE-19 | `ci_pipelines` | 提交、夜间、每周、发布流水线；`npm run gate` | 无 | M0（提交）、M1（夜间）、M2（发布） | 11.1 | 中 |
| RE-20 | `e2e_visual` | 网页与桌面端到端、截图回归、公平清单自动核对 | RE-01、RE-10 | M1 | 10.5、10.6 | 中 |
| RE-21 | `playthrough_matrix` | 11 条路线、跳时、第六幕夹具、多种子矩阵、卡住诊断 | RE-31（部分） | M1（序章到第一幕末与两条既有路线）、M2（到第三幕）、M3（全量） | 10.2、10.3 | 大 |
| RE-22 | `model_mocks` | 脚本、混沌、录带提供方与本机模拟服务 | 无 | M0 | 10.8 | 中 |
| RE-23 | `crash_diag_telemetry` | 崩溃转储与脱敏上传、崩溃循环保护、诊断包、可选遥测与采集端 | RE-01 | M2（崩溃与诊断）、M3（遥测） | 第 12 节 | 中 |
| RE-24 | `content_pipeline` | 抽取工具、校验器 V1 到 V10、编辑器批次视图与注册表视图 | 无 | M0 | 第 7 节；第一个批次走通 | 大 |
| RE-25 | `legal_notices` | 使用须知、隐私政策、第三方声明生成、`UPSTREAM.json` 与校验、条款存档、商标检索 | 无 | M3（草案）、M4（定稿） | 第 14 节 | 小 |
| RE-26 | `store_presence` | 商店页素材、预告片录制、AI 披露、内容问卷、富状态与成就文字 | RE-10、美术方案 | M3 | 4.6、4.7 | 中 |
| RE-27 | `own_ability_ids` | `sk_`、`aur_` 自有编号迁移 | 战斗目录 | M1 | 13.8 | 小 |
| RE-28 | `command_log_segments` | 13.6 | RE-04 | M0 | 13.6 验收 | 中 |
| RE-29 | `settings_store` | 13.10 | RE-01 | M0 | 13.10 验收 | 小 |
| RE-30 | `demo_builds` | 试玩内容闸门、Steam 试玩版应用、网页试玩版、存档导入 | RE-18、RE-04 | M3 | 2.8、4.9 | 中 |
| RE-31 | `sim_cadence` | 节拍声明、离场粗推、日结分片、诚实速度标注 | RE-10 | M2 | 6.4 | 大 |

依赖顺序（关键路径）：RE-11、RE-12、RE-13 先行（它们改动内核，越早越便宜）；RE-04 与 RE-28 是 RE-05 的前提；RE-01 是全部桌面包的前提；RE-06 是 RE-07、RE-10 的前提；
RE-10 是 RE-09、RE-31 的前提。

---

## 18. 风险

本节风险在 [risks.md](../60_production/risks.md) 第 2.6 节统一跟踪。

| 编号 | 风险 | 早期信号 | 对策 | 对应 |
| --- | --- | --- | --- | --- |
| RER-01 | Electron 与 Steam 覆盖层冲突：黑屏、输入焦点丢失、掉帧 | M2 Playtest 报告；参考机上开合测试失败 | Windows 覆盖层逐版本验证；失败时关闭覆盖层，游戏内"屏蔽并标记"与商店支持页作举报入口，并在问卷中如实说明 | RK-23 |
| RER-02 | Linux 无可用钥匙串，`safeStorage` 退回明文后端 | 后端判定为 `basic_text` 的比例 | 不落盘，只存内存（2.5）；设置页说明 | RK-36 |
| RER-03 | 集显驱动被 Chromium 列入黑名单，WebGL 退回软件渲染 | 首启检测到软件渲染的比例（有遥测时） | 平面档保底（D-058）；提示更新驱动；高性能显卡请求 | RK-14 |
| RER-04 | 杀毒软件误报打包的 exe | Playtest 反馈；主要杀毒厂商的扫描 | 代码签名；每个发布候选提交主要厂商的误报申诉样本 | 无 |
| RER-05 | 加速档 tick 成本不达标 | BM-T 读数 | 节拍与粗推（6.4）；诚实标注 | RK-35 |
| RER-06 | 存档体积随时长膨胀 | `tests/save_size.test.ts` 与夹具读数 | 内容寻址去重、分段合并、有界原话（5.8） | RK-28 |
| RER-07 | Steam 对实时 AI 内容的规则变化 | Steamworks 公告 | 披露文本集中在 4.7，一处改；防护措施以菜单与内核裁决为主，不依赖具体审核接口 | RK-23 |
| RER-08 | 名称与商标冲突 | 14.3 的检索 | 副标题更名规则 | RK-33 |
| RER-09 | AI 生成工具条款不允许商用或中途变化 | 条款更新通知 | 条款快照与逐素材登记；提示词库与工具无关，可换工具重生成 | RK-17 |
| RER-10 | 提供方接口变化或弃用 | 弃用公告；错误分类中"无此模型"上升 | 适配器集中在网关；每月核对；补丁发布 | RK-07 |
| RER-11 | 中国大陆玩家访问境外提供方受网络限制 | 连接测试失败率 | 网关遵循系统代理，设置页可填手动代理；OpenAI 兼容连接支持国内服务（D-067） | RK-07 |
| RER-12 | 自动玩家路线随内容批次频繁失效，夜间矩阵常态变红 | 夜间失败中"卡住"类占比 | 路线决策表数据化（13.2）；每个内容批次重生成夹具并跑受影响路线；卡住诊断（10.2） | RK-24 |

---

## 19. 来源链接

**本作文档**

- [decision_log.md](../00_vision/decision_log.md)：D-004、D-010、D-018、D-050、D-057、D-058、D-059、D-067 到 D-081
- [architecture.md](architecture.md)：第 2、4.7、7、9、10、11 节
- [implementation_conventions.md](implementation_conventions.md)：第 1、6、8 节
- [reuse_map.md](reuse_map.md)：第 4.4、5、6 节
- [art_pipeline.md](art_pipeline.md)：第 2 节（渲染与性能档）、第 3.4 节（动画帧）、第 4.8 节（RTS 规模）
- [ai_architecture.md](ai_architecture.md)：第 3.8 到 3.10 节（命令日志、回放、存档中的 AI 状态）、第 5.10 节（天启分发）、第 11 节（安全与隐私）、第 13 节（测试）
- [llm_providers.md](llm_providers.md)：提供方、预设、错误分类与界面
- [first_playable.md](../60_production/first_playable.md)：第 3 到 5 节
- [roadmap.md](../60_production/roadmap.md)：第 1.1、1.2 节（原则与量级口径）、第 4.3 节（PT-06）
- [risks.md](../60_production/risks.md)：RK-07、RK-14、RK-17、RK-23、RK-24、RK-28、RK-33、RK-35、RK-36
- [dev_process.md](../60_production/dev_process.md)：第 3.1、3.5 节（实施包）、第 4 节（质量门）
- [content_bible.md](../40_design/content/content_bible.md)：第 12、13 节；[content_review.md](../40_design/content/content_review.md)：第 6.9、9.3 节
- [catalog_deeds_titles.md](../40_design/content/catalog_deeds_titles.md)：第 1.2 到 1.4 节与第 3 节（事迹字段、名望、隐藏与壮举）
- [catalog_doors.md](../40_design/content/catalog_doors.md)：第 1 节（常规与全开的开门数）
- [ux_and_onboarding.md](../40_design/ux_and_onboarding.md)、[audio_direction.md](../40_design/audio_direction.md)：界面、按键与音频清单

**调研依据**

- [my_ai_town_visual_and_client.md](../10_research/art_style/my_ai_town_visual_and_client.md)：第 2.6 节（按需重画、烘焙与实例化的性能做法）
- [my_ai_town_agents.md](../10_research/ai_npc/my_ai_town_agents.md)：第 4.5 节（先写不可变文件、最后写快照的提交顺序）、第 7.5 节（密钥与代理）
- [internal_playbooks.md](../10_research/woc_reuse/internal_playbooks.md)：第 4 节（分层质量门）、第 5.5 节（证据不冒充）
- [game_dev_methodology.md](../10_research/open_share/game_dev_methodology.md)：第 7 节（里程碑、功能冻结与内容冻结）

**主工程（同仓，借做法）**

- `../../../docs/desktop-release.md`：签名、公证、Steam 仓库布局、Linux 覆盖层注入问题、日志与崩溃转储、隐私
- `../../../electron/main.cjs`、`../../../electron/shell_guards.cjs`、`../../../electron/steam_overlay_guard.cjs`、`../../../electron/desktop_config.cjs`：安全设置、导航守卫、覆盖层守卫、构建盖章

**外部资料**

- Steamworks 商店图形素材：https://partner.steamgames.com/doc/store/assets/standard
- Steamworks 库素材：https://partner.steamgames.com/doc/store/assets/libraryassets
- Steamworks 内容问卷（AI 内容披露）：https://partner.steamgames.com/doc/gettingstarted/contentsurvey
- steamworks.js（覆盖层与成就接口）：https://github.com/ceifa/steamworks.js
- Electron `safeStorage`：https://www.electronjs.org/docs/latest/api/safe-storage
- Electron `utilityProcess`：https://www.electronjs.org/docs/latest/api/utility-process
- Electron 安全清单：https://www.electronjs.org/docs/latest/tutorial/security
- Electron 熔断位：https://www.electronjs.org/docs/latest/tutorial/fuses
- 名称检索（14.3）：https://gamefaqs.gamespot.com/pc/553360-hakoniwa 、https://www.apkbus.com/ku/165797.html
