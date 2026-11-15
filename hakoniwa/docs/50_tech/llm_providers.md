# 大模型提供方：玩家自配方案（LLM Providers）

> 归属：技术方案，属 `docs/50_tech/`。
> 作用：规定玩家如何自己配置大模型：提供方类型与适配层、能力探测与降级写法、设置界面的每个屏幕、按角色绑定与四种预设、密钥存储、
> 桌面版主进程转发的进程间接口、花费估算与玩家上限、消耗台账、错误分类与修复按钮、隐私、与开发期代理的关系，以及现有代码的改造清单、实现步骤与验收测试。
> 上游决策：[decision_log.md](../00_vision/decision_log.md) 的 D-007、D-009、D-010、D-017、D-036、D-059、D-067、D-068、D-070、D-077、D-079、D-081。
> 上游文档：[ai_architecture.md](ai_architecture.md)（中立调用规格、调度、预算器、降级阶梯、成本模型；本文是它第 2.3.1、2.3.3、9、10、11 节在"玩家自配"一侧的细化）、
> [builtin_ai.md](../40_design/systems/builtin_ai.md)（内置 AI，本文只写与它的切换）、[npc_society_ai.md](../40_design/systems/npc_society_ai.md) 与 [goddess_gm.md](../40_design/systems/goddess_gm.md)（分级与请求量）、
> [release_engineering.md](release_engineering.md)（Electron 壳与 Steam 发行）、[ux_and_onboarding.md](../40_design/ux_and_onboarding.md)（界面编号与新手引导）。
> 调研依据：[my_ai_town_agents.md](../10_research/ai_npc/my_ai_town_agents.md) 第 1.2.4、2.6、7.3、7.5、7.6、8.1 节；[comparison_and_plan.md](../10_research/ai_npc/comparison_and_plan.md) 第 6.6 节；
> [woc_ai_npc.md](../10_research/ai_npc/woc_ai_npc.md) 第 2.5 节。my_ai_town 只借鉴结构与方法，不拷贝代码（D-017）。
> 约束：不设官方代理，费用由玩家自担（D-067）；无模型档是完整体验（D-010）；密钥永不进入游戏渲染进程、日志、存档、录像与云同步；
> 模型名称、价格与 API 能力按 2026 年 11 月公开资料书写，价目与已知型号表随内容版本更新，实现时以各提供方官方文档为准。

## 0. 一页结论

1. **玩家自配，玩家自担。** 设置里的"大模型"页让玩家添加连接（Anthropic、OpenAI 兼容服务、本机服务），填好密钥与地址，选择预设或逐角色绑定模型，设定花费上限。游戏不提供官方代理，不替玩家付费，也不在任何时候自动启用云端模型；全新安装的默认预设是"关闭（内置 AI）"。
2. **三类连接，一套契约。** AI 层只产出中立调用规格（[ai_architecture.md](ai_architecture.md) 第 2.3.1 节）；四个纯函数适配器（`none`、`anthropic`、`openai_compat`、`local`）把它翻译成 Anthropic Messages API、`/chat/completions` 与本机服务的请求体，并把响应、用量与错误翻译回来。
3. **结构化输出按通道降级。** 每个模型按"JSON Schema 约束输出、函数调用载体、JSON 模式、仅提示"的顺序选第一条可用通道；能力来自已知型号表或连接测试的探针，不在运行时临时猜。本机服务走"本机变体"：模式压平、每次至多一条调用、系统段末尾追加输出指引与决策要点（[my_ai_town_agents.md 第 2.6 节](../10_research/ai_npc/my_ai_town_agents.md)）。
4. **三个模型槽，六个绑定角色。** 玩家把模型放进高档、中档、低档三个槽；女神、核心 NPC、在场 NPC、离场批量、统治者与将领、审庭评审六个角色各自"按档位路由""固定某档"或"内置 AI"。路由按"档位乘轮次"（D-079 AQ-03），序章与第六幕用玩家配置的最高档（AQ-18）。
5. **四种预设。** 关闭（内置 AI）；单模型（Anthropic 推荐 `claude-haiku-5-5`，约每现实小时 0.4 到 0.8 美元）；分档（Anthropic 高中低依次 `claude-opus-5-5`、`claude-sonnet-5-5`、`claude-haiku-5-5`，标准倾向约 2.4 到 4.5 美元，另有充裕与节省两种倾向）；本机（核心 NPC 与统治者用 14B 级以上，居民用 7B 级以上，女神与审庭评审默认内置 AI）。
6. **密钥只在桌面网关。** 桌面版用 Electron `safeStorage`（Windows DPAPI、macOS 钥匙串、Linux 密钥服务）加密存本机；录入走一个只为此存在的独立小窗，游戏渲染进程从头到尾拿不到密钥；明文只在大模型网关进程（主进程起的 utility 进程）里按请求解密使用；Linux 没有密钥服务时只在本次运行内保存。网页试玩版只接受本机服务（D-081）。
7. **所有请求经主进程转发。** 渲染进程通过预载桥 `window.hk` 的 `hk:llm.*` 通道把中立规格交给主进程，主进程核对来源、体积与连接编号后转交网关；网关的守卫复核模型白名单、速率与花费上限，再用 Electron `net` 模块发出，错误正文脱敏后经消息端口返回。重定向不跟随，云端地址必须是 HTTPS（进程分工与通道契约以 [release_engineering.md](release_engineering.md) 第 2 节为准）。
8. **上限硬性生效，只降不停。** 玩家设每小时（滑动）、每日（本地日历日）、每局（新游戏起的整条存档线）的金额或 token 上限；最紧窗口用到 60% 起逐级把角色降到内置 AI，90% 只保留关键请求，100% 全部转内置 AI；世界永不暂停（D-036、D-068）。
9. **花费可预估、可核对。** 估算器用 [ai_architecture.md](ai_architecture.md) 第 10 节的计价公式与请求量，按玩家选的模型与价目算出当前幕每现实小时与全程上限；消耗台账逐条列出最近 500 个请求的角色、状态、延迟、token 与金额，行动者名称做剧透安全处理。
10. **错误说人话，并给修复按钮。** 二十个问题代码覆盖密钥无效、余额不足、无此模型、超时、上下文超长、本机服务未启动、浏览器拦截等情形，每个都有识别规则、玩家文案、修复按钮与自动处理；出错的角色单独降到内置 AI，其他角色照常（[my_ai_town_agents.md 第 7.5 节](../10_research/ai_npc/my_ai_town_agents.md) 的 `HoldCause` 思路，但不停表）。
11. **隐私写清楚。** 设置页列出每个角色发出的内容；发布版不保存题面全文，开发者模式只在内部通道构建里可开（AQ-15）；首次启用云端连接时一次性告知；遥测默认关闭。
12. **开发期代理保留（D-059）。** 开发服务 `/api/llm` 继续用环境变量凭据与官方 SDK 调 Anthropic，并共用同一套 OpenAI 兼容与本机适配器；发布构建不含 `tools/` 与 SDK；契约测试保证开发代理与桌面网关发出的请求体一致。
13. **可验收。** 模拟提供方、录制回放、故障注入三类替身覆盖全部问题代码与降级路径；守卫测试扫描进程间消息、日志与录像中不得出现密钥；无模型档在每个里程碑硬性通关（VS-01）。

## 1. 范围与原则

### 1.1 范围

| 本文负责                                                           | 不在本文                                                                                           |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 提供方类型、适配层、能力探测、结构化输出通道与模式改写             | 题面装配、知识过滤、输出闸门（[ai_architecture.md](ai_architecture.md) 第 7、8 节）                 |
| 设置页"大模型"的全部屏幕、字段、校验、连接测试                     | 设置窗口的整体框架、新手引导步骤与界面编号（[ux_and_onboarding.md](../40_design/ux_and_onboarding.md)） |
| 模型槽、绑定角色、路由解析、四种预设与推荐模型                     | 档位（L0 到 L4）的计算与升降（[npc_society_ai.md](../40_design/systems/npc_society_ai.md)）          |
| 密钥的生命周期、经主进程转发的大模型通道、网关守卫                 | Electron 壳的进程分工、通道总表、加固、签名、更新与 Steam 集成（[release_engineering.md](release_engineering.md)） |
| 花费估算、玩家上限、到上限后的行为、消耗台账                       | 预算器的内部算法（[ai_architecture.md](ai_architecture.md) 第 2.3.3 节）                            |
| 错误分类、玩家文案与修复按钮                                       | 单请求重试与熔断的内部状态机（[ai_architecture.md](ai_architecture.md) 第 9.1 到 9.3 节）            |
| 隐私说明与本机数据                                                 | 题材分寸与输出过滤（[ai_architecture.md](ai_architecture.md) 第 11.3 节）                           |
| 与内置 AI 的接口与切换                                             | 内置 AI 的规划器、台词包与话题图（[builtin_ai.md](../40_design/systems/builtin_ai.md)）              |

### 1.2 原则

| 原则                     | 含义                                                                                                                          | 来源                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 玩家自配、玩家自担       | 提供方、模型、绑定、上限全由玩家决定；游戏负责估算、执行上限、记账与可读报错；不设官方代理                                    | D-067                |
| 无模型是完整体验         | 关闭预设可以完整通关；任何配置错误、额度用尽、断网只让相关角色转内置 AI                                                      | D-010、D-068         |
| 世界不等模型             | 配置、故障、上限只改变"谁来提议"，不暂停世界、不改变内核裁决                                                                  | D-007、D-036         |
| 密钥不进游戏进程         | 游戏渲染进程、存档、日志、录像、云同步、崩溃报告里没有密钥；明文只在网关进程的单次请求作用域里，落盘的只有系统钥匙串加密的密文 | D-067、D-081         |
| 一套契约、多个宿主       | 桌面网关、开发代理、网页试玩直连、无头进程都收发同一种中立规格，共用同一套纯函数适配器                                        | D-059                |
| 能力先探测、后使用       | 结构化输出、流式、思考控制、上下文长度在保存连接时探测并记录；运行时不靠报错试探                                              | 本文第 3.7 节        |
| 估算有据、上限有效       | 估算公式与请求量来自 [ai_architecture.md](ai_architecture.md) 第 10 节；预留按整段输出上限计，已结算加在途预留永不越过上限      | AQ-06                |
| 只借鉴结构               | 按居民绑定模型、错误可修复分类、消耗台账、结构化输出变体取自 my_ai_town 的做法，代码与文案自写                                 | D-017                |

### 1.3 术语

| 术语                     | 英文代号                | 含义                                                                                                                              |
| ------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 连接                     | Connection              | 一个可调用的服务：类型（Anthropic、OpenAI 兼容、本机服务）、地址、密钥引用、已探测的能力、已启用的模型列表；发行工程文档称"提供方档案"，连接编号即档案 ID |
| 模型槽                   | Model slot              | 高档、中档、低档（甲、乙、丙，代码里是 `top`、`mid`、`low`），每个槽是"连接加模型"，可以为空                                     |
| 绑定角色                 | Binding role            | 玩家按角色绑定模型的粒度：女神、核心 NPC、在场 NPC、离场批量、统治者与将领、审庭评审（D-067）                                     |
| 决策类别                 | Decision kind           | 内核发出的请求类别，如 `goddess.plan`、`npc.life`（[ai_architecture.md](ai_architecture.md) 第 3.2 节）；每个类别属于一个绑定角色 |
| 倾向                     | Tilt                    | 分档预设下的路由强度：标准（即 [ai_architecture.md](ai_architecture.md) 中的"推荐档"）、充裕、节省                               |
| 预设                     | Preset                  | 一次性写好槽位、绑定与倾向的整套配置：关闭、单模型、分档、本机；玩家改动任一项后显示为"自定义"                                        |
| 网关                     | Gateway                 | 桌面版由主进程以 `utilityProcess` 起的独立进程：解密密钥、执行适配与守卫、发出网络请求、记台账（[release_engineering.md](release_engineering.md) 第 2.1 节） |
| 守卫                     | Guard                   | 发出请求前的复核：主进程核对来源、体积与连接编号，网关复核白名单、速率、在途数与上限                                              |
| 记账簿                   | Spend book              | 网关追加的逐条台账（只含元数据）与由它汇总的小时、日、局三个窗口；渲染进程的预算器镜像窗口汇总                                    |
| 问题                     | Problem                 | 面向玩家的错误分类（第 10 节），带文案与修复按钮                                                                                  |
| 驱动                     | Driver                  | 某绑定角色此刻由谁提议：某个模型，或内置 AI（附原因）                                                                             |

## 2. 总体结构

### 2.1 平台形态与数据流

```
桌面版（Electron，D-081）
+--------------------------- 渲染进程（游戏） ----------------------------+
| 内核 tick -> AI 桥 -> 调度、预算镜像、路由 -> 中立调用规格 LlmCallSpec  |
| 设置页"大模型"（只见连接元数据、密钥状态与末四位）                        |
+-------------- window.hk（预载桥，contextBridge）、MessagePort ----------+
                                   | IPC：hk:llm.*（第 7 节）
+----------------------------- 主进程 -----------------------------------+
| 核对发送方、体积与连接编号 -> 转交网关；创建密钥录入窗                  |
+-------------------------------------------------------------------------+
                                   | utilityProcess 端口
+----------------------- 大模型网关（utility 进程） -----------------------+
| 守卫 -> 解密密钥（单次请求作用域）-> 适配器 build -> net 模块发出        |
|      -> 适配器 parse / classify -> 记账簿 -> 经端口回传（无密钥）        |
+-------------------------------------------------------------------------+
         | HTTPS                    | HTTP（仅本机与局域网）
   Anthropic、OpenAI 兼容服务       本机服务（Ollama、LM Studio、llama.cpp 服务等）

网页试玩版：渲染进程 -> 直连本机服务（不接受云端密钥，适配器在浏览器内运行）
开发期：渲染进程 -> Vite 开发服务 /api/llm（环境变量凭据、官方 SDK，D-059）
无头进程：Node 内直连（平衡、评估集、天启预演；凭据来自环境变量）
```

### 2.2 模块与文件

| 路径                                                     | 模块                     | 职责                                                                                                         | 纯逻辑 |
| -------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------ | ------ |
| `src/ai/providers/anthropic.ts`                          | Anthropic 适配器         | 构造 Messages API 请求体、解析响应与流事件、错误分类、用量归一                                               | 是     |
| `src/ai/providers/openai_compat.ts`                      | OpenAI 兼容适配器        | 构造 `/chat/completions` 请求体（四种输出通道）、解析、错误分类、用量归一                                    | 是     |
| `src/ai/providers/local.ts`                              | 本机适配器               | Ollama 原生接口与兼容接口的本机变体、服务种类识别、元数据读取                                                | 是     |
| `src/ai/providers/schema_dialect.ts`                     | 模式方言改写             | 把本方输出模式改写成各通道接受的子集，剥离的约束交给本方校验                                                 | 是     |
| `src/ai/providers/capabilities.ts`                       | 能力表                   | 已知型号表、探针结果的解读、能力合并                                                                         | 是     |
| `src/ai/providers/problems.ts`                           | 问题分类                 | 适配器错误到玩家问题代码的映射、合并规则                                                                     | 是     |
| `src/ai/providers/transport_provider.ts`                 | 传输型提供方             | 实现 `LlmProvider`，把规格交给注入的 `LlmTransport`；现有 `ProxyProvider` 迁移到这里                                 | 是     |
| `src/ai/providers/null.ts`、`mock.ts`                    | 无模型、模拟             | 现有 `NullProvider`、`MockProvider` 迁入                                                                      | 是     |
| `src/ai/llm_config/`                                     | 配置                     | 设置数据模型、预设、校验、路由解析、估算器、角色适配标签、迁移                                               | 是     |
| `src/ai/gateway/guard.ts`、`spend_book.ts`               | 守卫与记账簿             | 桌面网关与开发代理共用的复核规则与窗口记账（纯函数，时钟注入）                                               | 是     |
| `src/ai/contracts.ts` 的 `LlmTransport`                  | 传输接口                 | 发送中立调用规格，返回增量与回执；只是接口                                                                   | 是     |
| `src/client/net/llm_transport.ts`                        | 客户端传输实现           | `IpcTransport`（桌面，经 `PlatformHost.llm`）、`DevProxyTransport`（开发，只在开发构建引入）、`LocalHttpTransport`（网页试玩，只连本机服务） | 否     |
| `src/client/windows/llm/`                                | 设置页"大模型"           | 第 5 节的各屏幕（总览、连接、模型槽、绑定、上限、测试报告、台账、隐私）                                      | 否     |
| `src/shared_ui/text_llm.ts`                              | 文本表                   | 本文全部玩家可见文字的文本键（D-077），含第 10 节的问题文案                                                  | 是     |
| `desktop/llm_gateway/`                                   | 大模型网关               | utility 进程入口：守卫调用、密钥解密、经 `src/ai/providers/` 的适配器构造与解析、`net` 模块发送、流转发、记账簿持久化 | 否     |
| `desktop/ipc/` 中的 `hk:llm.*` 处理器                    | 主进程转发               | 核对发送方、体积与连接编号，转交网关；创建密钥录入窗                                                         | 否     |
| `desktop/key_entry/`                                     | 密钥录入窗               | 独立窗口的静态页面与专用预载（只暴露提交与取消）                                                              | 否     |
| `desktop/secrets.ts`                                     | 密钥存储                 | `safeStorage` 封装（[release_engineering.md](release_engineering.md) 第 2.5 节）                              | 否     |
| `desktop/preload.ts`                                     | 预载桥                   | `window.hk` 的 `llm` 部分（第 7.2 节）                                                                        | 否     |
| `tools/llm_proxy.ts`、`tools/dev_api.ts`                  | 开发代理                 | 开发服务 `/api/llm`、`/api/llm/status`、`/api/llm/test`、`/api/llm/models`（第 12 节）                        | 否     |
| `data/llm/price_book.json`                               | 价目表                   | 已知型号的价目、参考汇率、提供方控制台与数据政策链接，随内容版本发布                                         | 数据   |
| `data/llm/known_models.json`                             | 已知型号表               | 已知型号的能力、上下文长度、推荐档位与角色适配标签                                                           | 数据   |
| `data/llm/probe_town/`                                   | 测验小镇                 | 角色适配测验的合成夹具（虚构小镇，不含任何正典内容与剧透）                                                   | 数据   |

架构守卫追加三条：`src/ai/providers/`、`src/ai/llm_config/`、`src/ai/gateway/` 不引用网络、DOM 与 Electron；`desktop/llm_gateway/` 只经 `src/ai/` 的公开出口取适配器与守卫，不自带第二份适配代码；形如密钥的字符串不得出现在源码、夹具、录制带与文档里。

### 2.3 一次调用的路径（桌面版）

1. 内核发出决策请求，AI 桥登记（[ai_architecture.md](ai_architecture.md) 第 2.4 节）。
2. 路由解析（第 4.3 节）：决策类别到绑定角色到模型槽到连接与模型；绑定为内置 AI 或槽为空时当场放弃，原因写入台账，兜底在下一 tick 执行。
3. 预算器按估算预留（输入估算乘 1.15，加该路由的整段输出上限），检查小时、日、局三个窗口；越线则放弃并按第 8.5 节逐角色降级。
4. 题面装配，产出 `LlmCallSpec`（含连接编号、模型、分段、输出模式、预留额）。
5. `IpcTransport` 经 `PlatformHost.llm` 调用 `window.hk.llm.request(规格, 端口)`。
6. 主进程核对来源、体积与连接编号后转交网关；网关守卫复核（第 7.4 节），解密密钥，适配器 `build` 生成请求，`net` 模块发出。
7. 适配器 `parse` 得到统一结果；失败时 `classify` 得到适配器错误类与问题代码；记账簿按真实用量结算。
8. 增量与回执（无密钥、错误正文已脱敏）经端口回到渲染进程：预算器结算镜像，解析与闸门，转命令；问题代码交给设置页与提示条。

## 3. 提供方类型与适配层

### 3.1 适配层接口

```ts
type ProviderKind = 'none' | 'anthropic' | 'openai_compat' | 'local';
type LocalFlavor = 'ollama' | 'lmstudio' | 'llamacpp' | 'generic';
type OutputChannel = 'json_schema' | 'tool_carrier' | 'json_mode' | 'prompt_only';

interface ConnectionPublic {
  id: string; // 本机生成，形如 conn_<随机 8 位>
  kind: ProviderKind;
  flavor?: LocalFlavor; // 仅 local
  name: string; // 玩家起的名字，默认按类型
  baseUrl: string; // 规范化后的地址（第 5.4 节）
  auth: { scheme: 'x_api_key' | 'bearer' | 'custom_header' | 'none'; headerName?: string };
  keyState: 'none' | 'saved' | 'session_only'; // 只是状态
  keyLast4?: string; // 只显示末四位
  extraHeaderNames: string[]; // 额外请求头的名称；值按密钥同样存储
  currency: 'USD' | 'CNY'; // 计价货币；本机为 USD 且价目为零
  maxInFlight: number; // 云端默认 8（与调度器全局在途上限一致），本机默认 2
  serverFallback?: boolean; // 仅 anthropic，默认开（AQ-16）
  models: ModelProfile[]; // 玩家启用的模型（也是守卫的白名单）
  lastTest?: ConnectionTestReport;
}

interface ModelProfile {
  model: string; // 服务上的模型名
  displayName?: string;
  capability: Capability; // 第 3.7 节
  price?: PriceCard; // 每百万 token；Anthropic 来自价目表，可覆盖
  sizeClass?: '7b' | '14b' | '30b' | 'cloud' | 'unknown'; // 本机型号的参数级别（AQ-10）
  labels?: Partial<Record<BindingRole, SuitLabel>>; // 角色适配标签（第 4.6 节）
}

interface Capability {
  channels: OutputChannel[]; // 按优先级排好的可用通道，第一项为运行时通道
  streaming: 'yes' | 'no';
  streamUsage: 'yes' | 'no'; // 流式结束时是否带用量
  promptCache: 'explicit' | 'automatic' | 'server_slot' | 'none';
  cacheUsageField: 'anthropic' | 'cached_tokens' | 'hit_miss' | 'none';
  thinking: 'adaptive' | 'reasoning_effort' | 'think_flag' | 'tag_strip' | 'none';
  effort: boolean; // 是否接受思考深度参数
  maxTokensParam: 'max_tokens' | 'max_completion_tokens' | 'num_predict';
  samplingParams: boolean; // 是否接受温度等采样参数
  contextTokens: number; // 已知或探测到的上下文长度
  contextSource: 'known_table' | 'service_meta' | 'player' | 'default';
  serverFallback: boolean;
  source: 'known_table' | 'probe';
  probedAt?: string;
}

interface PriceCard {
  currency: 'USD' | 'CNY';
  input: number;
  cacheRead: number;
  cacheWrite5m?: number;
  cacheWrite1h?: number;
  output: number;
  longPromptThreshold?: number; // 超过后用长提示价目（例：claude-haiku-5-5 超过 10 万 token）
  longPrompt?: Omit<PriceCard, 'currency' | 'longPromptThreshold' | 'longPrompt'>;
}

interface ProviderAdapter {
  kind: ProviderKind;
  // 不含密钥：网关在 build 之后按 auth 方案拼头
  build(spec: LlmCallSpec, conn: ConnectionPublic, prof: ModelProfile): AdapterHttpRequest;
  parse(status: number, body: string, latencyMs: number, prof: ModelProfile): LlmCallResult;
  parseStreamEvent(state: StreamState, chunk: string): StreamStep; // 增量文本、思考、用量、结束
  classify(status: number, body: string, headers: HeaderBag, netError?: NetErrorKind): AdapterError;
  listModels(): AdapterHttpRequest; // 列模型
  modelMeta?(model: string): AdapterHttpRequest; // 上下文长度、参数级别等元数据
  probe(kind: ProbeKind, prof: ModelProfile): AdapterHttpRequest; // 第 5.6 节的探针
}
```

`LlmCallSpec` 沿用 [ai_architecture.md](ai_architecture.md) 第 2.3.1 节，增加 `connectionId`、`slot`、`bindingRole`、`reserve`（本次预留的金额与 token）与 `stream`。适配器只做翻译：不发网络、不读时钟、不持有密钥；同一规格与同一能力必产出逐字节相同的请求体，这是请求体金样测试的前提。

### 3.2 Anthropic Messages API

| 项           | 写法                                                                                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 端点与头     | `POST {baseUrl}/v1/messages`；`x-api-key`、`anthropic-version`、`content-type`；启用服务端回退时加 `anthropic-beta`；默认地址 `https://api.anthropic.com`                                                                          |
| 系统段       | 规则段、人设段、私密段按顺序作为多个系统文本块，各带缓存断点（每请求至多 4 个，1 小时档排在 5 分钟档之前）；与 `tools/llm_proxy.ts` 的 `buildMessageParams` 同一写法                                                               |
| 会话历史     | 同一分段内的往轮原样追加；运营方消息按 [ai_architecture.md](ai_architecture.md) 第 7.1 节放在本轮之后                                                                                                                              |
| 结构化输出   | `output_config.format` 为 `json_schema`（已知型号的首选通道）；`claude-opus-5-5` 与 `claude-sonnet-5-5` 不支持强制指定工具，所以不把工具调用当首选载体                                                                             |
| 思考深度     | `output_config.effort` 取 `low`、`medium`、`high`，按路由显式设置；5.5 系列自适应思考，不发 `thinking` 参数，也不发温度等采样参数（关闭思考或发采样参数会被拒）                                                                    |
| 思考块       | 响应里的思考块连同签名作为不透明数据随分段保存，同一分段内按提供方规范原样回传；新分段不带（D-079 AQ-11）                                                                                                                          |
| 服务端回退   | 高档与中档（`claude-opus-5-5`、`claude-sonnet-5-5`）启用，拒答时由服务端改用回退模型作答；响应的用量迭代里出现回退消息即记为"已回退"，按实际服务的模型计价并统计回退率（AQ-16）；`claude-haiku-5-5` 不启用                        |
| 流式         | `stream: true`，读取消息开始、内容块增量（文本、思考、签名）、消息增量（停止原因与用量）、消息结束；流中的错误事件按 HTTP 错误同样分类                                                                                              |
| 用量         | `input_tokens`、`output_tokens`、`cache_read_input_tokens`、`cache_creation_input_tokens`，1 小时档写入取 `cache_creation` 的细分字段；与 `src/ai/providers.ts` 的 `readUsage` 同口径                                              |
| 停止原因     | `end_turn` 为正常；`max_tokens` 记为截断（解析失败按格式重试）；`refusal` 先于读取内容判断，按拒答处理                                                                                                                              |
| 请求编号     | 响应头里的请求编号写入台账，便于玩家向提供方求助                                                                                                                                                                                  |
| 列模型       | `GET {baseUrl}/v1/models` 分页读取，只列出已知型号表里的对话模型，并允许玩家手填新型号（走探针）                                                                                                                                  |

### 3.3 OpenAI 兼容 chat/completions

适用于玩家自填地址的云端服务（例如 DeepSeek、通义、OpenRouter）以及按兼容接口接入的局域网服务。

| 项           | 写法                                                                                                                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 端点与头     | `POST {baseUrl}/chat/completions`；鉴权默认 `Authorization: Bearer`，可换成自定义头名（值即密钥）；额外请求头的值与密钥同样存储                                                                                                                                             |
| 消息         | 一条 `system`（规则段、人设段、私密段按顺序拼接，分段间用固定标头）；历史为 `user` 与 `assistant` 交替；运营方消息并入本轮 `user` 末尾的带固定标头的块（多数服务只认开头一条 system）                                                                                       |
| 通道一       | `response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } }`；模式先经方言改写（第 3.6 节）                                                                                                                                                       |
| 通道二       | 函数调用载体：`tools` 只含一个函数 `submit`，参数即本方模式；`tool_choice` 依次尝试"指名 `submit`"、`required`；只有 `auto` 可用的服务在系统段写明"必须调用 submit"；解析取第一条工具调用的参数 JSON                                                                         |
| 通道三       | `response_format: { type: 'json_object' }` 加系统段末尾的输出指引                                                                                                                                                                                                           |
| 通道四       | 仅提示：系统段末尾附模式说明与示例，本方严格解析，失败做一次格式重试                                                                                                                                                                                                       |
| 输出上限     | 按探测结果用 `max_tokens` 或 `max_completion_tokens`                                                                                                                                                                                                                        |
| 采样参数     | 默认不发；玩家在模型槽的高级项里设了温度才发                                                                                                                                                                                                                               |
| 思考         | 服务接受 `reasoning_effort` 时按路由的 effort 发；返回的 `reasoning_content` 或正文里的思考段不回传、不展示，只计入输出 token；正文若以思考标签包裹，解析前剥离                                                                                                              |
| 流式         | `stream: true` 加 `stream_options: { include_usage: true }`；不支持后者的服务在流结束后没有用量，本方按估算记账并在台账标"用量为估算"                                                                                                                                       |
| 用量         | `prompt_tokens`、`completion_tokens`；缓存命中取 `prompt_tokens_details.cached_tokens` 或 `prompt_cache_hit_tokens` 与 `prompt_cache_miss_tokens`（[my_ai_town_agents.md 第 7.3 节](../10_research/ai_npc/my_ai_town_agents.md) 记录的写法）；思考 token 计入输出 |
| 拒答         | 消息带 `refusal` 字段，或 `finish_reason` 为 `content_filter`                                                                                                                                                                                                               |
| 截断         | `finish_reason` 为 `length`                                                                                                                                                                                                                                                 |
| 列模型       | `GET {baseUrl}/models`；列表很长时设置页提供搜索；若条目带上下文长度字段则读入                                                                                                                                                                                             |
| 价目         | 玩家在模型槽填写输入、缓存命中输入、输出三项单价与计价货币；未填时只按 token 记账，金额上限对该模型不生效并在设置页标出                                                                                                                                                     |

### 3.4 本机服务

本机服务没有费用，但有算力上限；默认并发 2，可在 1 到 4 之间调（[ai_architecture.md](ai_architecture.md) 第 2.3.2 节"单卡本地"）。地址只允许本机回环与局域网私有地址。

| 服务种类         | 默认地址                       | 调用接口                                                                     | 结构化输出                                                           | 元数据（上下文长度、参数级别、是否已加载）                    |
| ---------------- | ------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| Ollama           | `http://127.0.0.1:11434`       | 原生 `POST /api/chat`：可按请求设 `options.num_ctx` 与 `num_predict`，设 `keep_alive` 避免模型被卸载，设 `think: false` 关闭思考 | 原生 `format` 字段传 JSON Schema                                     | `GET /api/tags` 列模型，`POST /api/show` 读上下文长度与参数级别 |
| LM Studio        | `http://127.0.0.1:1234/v1`     | 兼容接口 `/chat/completions`                                                 | `response_format` 的 `json_schema`                                   | 服务的模型信息端点（状态、最大上下文长度）                     |
| llama.cpp 服务   | `http://127.0.0.1:8080/v1`     | 兼容接口 `/chat/completions`，开启提示缓存复用                               | `response_format` 的 `json_schema`（服务端转为语法约束）              | `/props` 读上下文长度，`/health` 判断是否在加载               |
| 其他兼容服务     | 玩家填写                       | 兼容接口                                                                     | 按探针结果                                                           | 读不到时由玩家填写上下文长度，默认 8192 并按角色要求标"不建议" |

**本机变体**（参照 [my_ai_town_agents.md 第 2.6 节](../10_research/ai_npc/my_ai_town_agents.md) 的本地结构化输出写法，自行实现）：

1. 不发原生工具；系统段末尾追加"输出指引"（字段含义与示例）与"决策要点"（重列本轮必须决定的事与可选菜单项的别名）。
2. 每次回复至多一条调用；[ai_architecture.md](ai_architecture.md) 第 2.3.2 节"每次醒来至多 3 次请求"不变，所以一次醒来至多三条单调用回复。
3. 模式压平：菜单按动词拆成精确分支，每支一个常量动词；当前交谈编号等上下文常量写成常量；数组给出最大长度。
4. 采样：温度默认 0.6、存在惩罚 0；关闭思考（Ollama 的 `think: false`；兼容接口发 `reasoning_effort` 的最低值）；关不掉时剥离思考段再解析。
5. 上下文：Ollama 每次请求设 `num_ctx` 为"该角色所需上下文"与"模型上限"的较小者（第 4.5 节）；其他服务读到的上下文长度不足该角色所需时，设置页标"不建议"，路由仍按玩家选择执行，越长的请求由上下文超长问题处理（第 10 节）。
6. 吞吐：响应带计时字段时（Ollama 的评估计数与耗时、llama.cpp 的计时对象）记入台账，用于第 4.6 节的承载率。

### 3.5 结构化输出通道与降级顺序

| 通道            | Anthropic                                       | OpenAI 兼容                              | 本机                                     | 本方额外动作                                                         |
| --------------- | ----------------------------------------------- | ---------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| 1 JSON Schema   | `output_config.format`（已知型号默认）          | `response_format.json_schema`，严格模式  | Ollama `format`；其余 `response_format`  | 方言改写；本方校验补上被剥离的约束                                   |
| 2 函数调用载体  | 型号支持强制指定工具时可用                      | 单函数 `submit`，强制或必选调用          | 默认不用                                 | 解析工具调用参数；多条调用只取第一条                                 |
| 3 JSON 模式     | 无                                              | `json_object`                            | 服务支持时可用                           | 系统段附输出指引；本方严格解析                                       |
| 4 仅提示        | 未知型号且前三条都不可用时                      | 同左                                     | 同左                                     | 附模式说明与示例；剥离代码围栏与思考段；一次格式重试；角色适配标签最高为"勉强" |

运行时只用能力记录里的第一条通道；某通道在运行时连续 3 次因"不支持该参数"失败，问题代码 `unsupported_output` 触发，能力记录下移一条通道并提示玩家重新测试连接。

### 3.6 模式方言改写

本方输出模式（[ai_architecture.md](ai_architecture.md) 第 8.1 节）是完整的 JSON Schema。各通道接受的子集不同，`schema_dialect.ts` 做确定性改写，被剥离的约束由 `src/ai/output.ts` 的校验执行：

| 改写                                         | Anthropic | OpenAI 严格模式 | 本机变体 |
| -------------------------------------------- | --------- | --------------- | -------- |
| 每个对象 `additionalProperties: false`       | 保持      | 保持            | 保持     |
| 可选字段写成"必填且可为空"                   | 否        | 是              | 是       |
| `oneOf` 换成 `anyOf`                         | 按型号表  | 是              | 是       |
| 剥离字符串长度、正则、格式等关键字           | 按型号表  | 是              | 是       |
| 菜单按动词拆分为常量分支                     | 否        | 否              | 是       |
| 调用数组最大长度设为 1                       | 否        | 否              | 是       |
| 根必须是对象                                 | 是        | 是              | 是       |

改写结果按（模式编号，模式版本，通道，方言版本）缓存；方言版本进入审计记录的版本号。

### 3.7 能力探测

| 能力                 | Anthropic                                  | OpenAI 兼容                                                       | 本机                                                     | 不支持时的写法                                                                 |
| -------------------- | ------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 结构化输出           | 已知型号表；未知型号按通道顺序探针         | 探针依次试通道一到四，记录全部可用通道                            | 同左                                                     | 第 3.5 节降级                                                                  |
| 工具调用             | 只作载体，按型号表                         | 探针试"指名"再试"必选"                                            | 默认不探                                                 | 跳过通道二                                                                     |
| 流式                 | 已知支持                                   | 探针发流式请求，收到增量即支持；再看结束块是否带用量              | Ollama 按行增量、其余按事件流                            | 交互类不流式：先显示人设的预写开场白，模型回复到达后接续（PT-03 失败转向的写法） |
| 提示缓存             | 显式断点，已知                             | 深度测试发两次相同前缀，看用量里的缓存字段                        | 服务端槽位缓存，不可控                                   | 只影响估算器的命中率假设                                                       |
| 思考块与思考控制     | 自适应思考，接受 effort，思考块分段内回传  | 探针发 `reasoning_effort`，被拒则记为不支持并去掉该参数重发一次   | Ollama `think`；其他按服务；剥离思考段                   | 不发思考参数；思考 token 照计输出                                              |
| 上下文长度           | 已知型号表                                 | 模型列表字段，否则玩家填写，默认 32768                            | 服务元数据，否则玩家填写，默认 8192                      | 不足角色所需时标"不建议"（第 4.5 节）                                          |
| 采样参数             | 不接受                                     | 探针发温度，被拒则记为不接受                                      | 接受                                                     | 不发                                                                           |
| 输出上限参数名       | `max_tokens`                               | 探针：`max_tokens` 被拒则改用 `max_completion_tokens`             | Ollama 原生 `num_predict`，其余 `max_tokens`             | 记录在能力里                                                                   |
| 服务端回退           | 高档与中档                                 | 无                                                                | 无                                                       | 无                                                                             |

探测只发生在三个时机：保存连接、玩家点"测试"、能力记录超过 30 天且下次启动时（只做快速测试）。运行时遇到"参数不支持"类 400，只按第 3.5 节下移通道，不做临时试探。

### 3.8 用量与计价归一

所有适配器把用量归一为 `LlmUsage`（`src/ai/contracts.ts`）：未缓存输入、缓存读、缓存写（含 1 小时档细分）、输出（含思考）。金额由记账簿按连接的价目卡计算，算法沿用 `src/ai/pricing.ts` 的 `costUsd`（长提示价目、1 小时档写入价）。

| 来源字段                                         | 归一到                       |
| ------------------------------------------------ | ---------------------------- |
| Anthropic 输入、缓存读、缓存写、输出             | 一一对应                     |
| 兼容服务 `prompt_tokens` 与 `cached_tokens`      | 未缓存输入 = 前者减后者；缓存读 = 后者 |
| 兼容服务命中与未命中两字段                       | 缓存读 = 命中；未缓存输入 = 未命中 |
| 兼容服务 `completion_tokens`（含思考 token）     | 输出                         |
| Ollama 提示评估计数与评估计数                    | 未缓存输入与输出（金额为零）  |
| 流式结束没有用量                                 | 按 `estimateTokens` 估算输入，输出按收到的文本估算；台账标"估算" |

货币：Anthropic 以美元计；兼容服务按玩家选择的计价货币；本机为零。玩家在第 5.8 节选择显示货币，换算用价目表随内容版本发布的参考汇率，玩家可改。

### 3.9 流式、首句显示与思考块

- **流式只用于交互类**（女神会话轮、梦境、玩家与 NPC 交谈、序章、审庭陈述），在能力支持时开启（D-079 AQ-17）。
- **首句显示**：渲染进程的纯函数 `extractSpeechPrefix` 从增量 JSON 文本中取出台词字段的已到达部分；第一句完整（遇到句号、问号、叹号或长度到 20 字）且通过话语闸门的专名与禁区检查后才显示，作为"正在说"的气泡。
- **全文到达后**照常解析与闸门；若整条提议被丢弃（解析失败、闸门不过、过时），气泡淡出并换成兜底的预写台词，台账记"首句已显示后撤回"。
- **思考内容**一律不显示给玩家；Anthropic 的思考块按第 3.2 节回传，兼容服务与本机的思考内容丢弃。

## 4. 配置数据模型

### 4.1 设置结构

```ts
type BindingRole =
  | 'goddess' // 女神（含雅努、叙事导演、序章与终章记录）
  | 'core_npc' // 核心 NPC（L1、同伴、与玩家交谈的任何 NPC）
  | 'present_npc' // 在场 NPC（L2）
  | 'offstage_batch' // 离场批量（L3 地区日记）
  | 'ruler_general' // 统治者与将领（首领、官员、AI 国家、将领）
  | 'court_reviewer'; // 审庭评审（第六幕口才评审）

type Slot = 'top' | 'mid' | 'low';
type SuitLabel = 'ok' | 'marginal' | 'not_recommended';

interface LlmSettings {
  version: number; // 设置格式版本，见第 4.7 节
  preset: 'off' | 'single' | 'tiered' | 'local' | 'custom';
  tilt: 'standard' | 'generous' | 'frugal'; // 只对按档位路由的角色生效
  connections: ConnectionPublic[]; // 不含密钥
  slots: Partial<Record<Slot, { connectionId: string; model: string; effort?: 'low' | 'medium' | 'high' }>>;
  bindings: Record<BindingRole, { mode: 'route' | 'fixed' | 'builtin'; slot?: Slot }>;
  advanced: { highestForAnchors: boolean; streamFirstLine: boolean }; // 默认都为 true（AQ-18、AQ-17）
  caps: {
    hour: CapValue; // 滑动 60 现实分钟
    day: CapValue; // 本地日历日
    run?: CapValue; // 新游戏起的整条存档线
    displayCurrency: 'USD' | 'CNY';
    fxCnyPerUsd?: number; // 玩家覆盖的汇率；缺省用价目表的参考汇率
    roleShares?: Partial<Record<BindingRole, number>>; // 高级：份额覆盖
  };
  privacy: {
    developerMode: boolean; // 保存题面全文（AQ-15）；只在内部通道构建里可设，Steam 构建恒为 false
    savePrivacy: boolean; // 折叠归档时把玩家原话换成摘要
    remoteRevelations: boolean; // 签名远程天启源（AQ-05），默认开，可关
    telemetry: boolean; // 默认关
    showLineSource: boolean; // 对话框角落显示台词来源（模型或预写），默认关
  };
  consentedConnectionIds: string[]; // 已完成首次告知的云端连接
}

interface CapValue {
  usd?: number; // 以显示货币录入，内部换算为美元存储
  tokens?: number; // 输入与输出合计
}
```

### 4.2 绑定角色与决策类别

| 绑定角色         | 决策类别（[ai_architecture.md](ai_architecture.md) 第 3.2 节）                                                                                                                 | 现有角色包（`src/game/ai_roles/`）                       | 标准倾向的档位                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 女神             | `goddess.plan`、`goddess.wake`、`goddess.talk`、`goddess.interpret`、`goddess.tidy`、`goddess.trial`、`goddess.season_summary`、`director.pick`、`janu.night`、`janu.dream`、`prologue.turn`、`prologue.extract`、`court.stance`、`epilogue.records` | `goddess.plan`、`goddess.dialogue`、`scene.improv`       | 规划、唤醒、整理、试炼、入夜轮中档；会话轮、梦境、天启解读高档；季度摘要与导演低档；序章、审庭、终章记录用最高档 |
| 核心 NPC         | `npc.life`、`npc.recover`、`npc.chat`、L1 的 `npc.tidy`、`npc.decision_point`、`companion.tactics`                                                                              | `npc.daily`、`npc.dialogue`                              | 与玩家交谈中档；生活、回神、整理、NPC 之间交谈、纷争决策点、同伴战术低档（主线关键人物的决策点中档） |
| 在场 NPC         | `npc.dayplan`、`npc.event`、L2 的 `npc.tidy`                                                                                                                                   | 通用包 `*`                                               | 低档                                                                                               |
| 离场批量         | `npc.diary_batch`                                                                                                                                                              | `npc.batch_diary`                                        | 低档                                                                                               |
| 统治者与将领     | `leader.council`、`general.plan`                                                                                                                                               | `ruler.policy`、`official.decide`、`general.order`       | 中档；玩家官员的常规事务、内阁大臣与总督低档；AI 国家统治者的重大事件高档                          |
| 审庭评审         | `court.eloquence`                                                                                                                                                              | 新增 `court.review`                                      | 最高档                                                                                             |

`npc.chat` 一律属于核心 NPC：任何有名 NPC 被玩家搭话都占用对话临时位（[ai_architecture.md](ai_architecture.md) 第 4.3 节"对话升档"）；L1 之间的交谈同属核心 NPC，走低档。

三种倾向的档位差别（只列与标准不同之处，数字依据 [ai_architecture.md](ai_architecture.md) 第 10.5 节）：

| 倾向 | 与标准的差别                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 充裕 | 女神的全部类别用高档；核心 NPC 的全部类别、统治者与将领用中档；在场 NPC 与离场批量用低档                                                 |
| 标准 | 上表                                                                                                                                      |
| 节省 | 只有女神会话轮与梦境用中档，其余全部低档；预设不放高档槽，所以"最高档"即中档                                                             |

### 4.3 路由解析

```ts
function resolveRoute(kind: DecisionKind, ctx: RouteContext, s: LlmSettings): RouteDecision {
  const role = BINDING_OF[kind]; // 第 4.2 节，纯数据
  const b = s.bindings[role];
  if (s.preset === 'off' || b.mode === 'builtin') return builtin('role_builtin');
  const want: Slot =
    b.mode === 'fixed' ? b.slot! : s.advanced.highestForAnchors && HIGHEST_KINDS.has(kind) ? highestConfigured(s) : TILT_TABLE[s.tilt][kind](ctx);
  let slot = nearestConfigured(s, want); // 先找本档，空则向下找，再空则向上找
  if (!slot) return builtin('not_configured');
  if (ctx.degradeLevel >= 2 && !ctx.reserved) slot = lowerIfConfigured(s, slot); // 降档先于放弃（第 8.5 节）；没有更低的槽时不变
  const conn = connectionOf(s, slot);
  if (ctx.health.isOpen(conn.id)) {
    const alt = fallbackChain(s, slot).find((x) => !ctx.health.isOpen(connectionOf(s, x).id));
    return alt ? model(alt, 'rerouted') : builtin('connection_down');
  }
  return model(slot);
}
```

- `HIGHEST_KINDS`：`prologue.turn`、`prologue.extract`、`court.stance`、`court.eloquence`、`epilogue.records`（D-079 AQ-18）。
- 改道链：先在其他已配置的槽里找属于另一个连接的槽（高档故障时先试中档，再试低档），找不到就转内置 AI；同一连接的槽不在改道链里，因为熔断按连接计。
- 路由解析是纯函数，只依赖设置、健康度快照与降级级别；它的结果写进审计记录（[ai_architecture.md](ai_architecture.md) 第 12.1 节的 `route` 字段加 `bindingRole` 与 `slot`）。

### 4.4 四种预设

| 预设             | 需要的连接                   | 模型槽                                                       | 绑定                                                                                                       | 适合谁                                       |
| ---------------- | ---------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 关闭（内置 AI）  | 无                           | 无                                                           | 全部内置 AI                                                                                                | 不想配置、离线游玩、全新安装的默认           |
| 单模型           | 任意一个连接                 | 三个槽都是同一个模型                                         | 全部按档位路由（实际都落到这一个模型）                                                                     | 只有一把密钥、想要省事                       |
| 分档             | 一个云端连接（或多个）       | 高、中、低三个槽；节省倾向不放高档                           | 全部按档位路由；倾向默认标准                                                                               | 想要最好的女神与核心角色表现、愿意按量付费   |
| 本机             | 一个本机服务                 | 高档放 14B 级以上，低档放 7B 级以上；中档同高档               | 核心 NPC、统治者与将领按档位路由；在场 NPC、离场批量固定低档；女神与审庭评审内置 AI（可手动设为高档）       | 有显卡、不想付费或重视隐私                   |

本机预设让女神默认走内置 AI 的理由：女神规划的整请求输入约 28k token、折叠线 32k（[ai_architecture.md](ai_architecture.md) 第 7.6 节），对本机模型的上下文、吞吐与人格稳定都要求最高；D-079（AQ-10）建议女神用云端模型；而女神的内置 AI 本身是完整体验（D-010）。玩家把女神设为本机高档时，设置页按第 4.6 节的实测标签提示。

### 4.5 推荐模型与角色门槛

**Anthropic**（已知型号，标签来自已知型号表）：

| 预设与倾向         | 高档                | 中档                | 低档               |
| ------------------ | ------------------- | ------------------- | ------------------ |
| 单模型（推荐）     | `claude-haiku-5-5`  | 同左                | 同左               |
| 单模型（质量优先） | `claude-sonnet-5-5` | 同左                | 同左               |
| 分档（标准、充裕） | `claude-opus-5-5`   | `claude-sonnet-5-5` | `claude-haiku-5-5` |
| 分档（节省）       | 不放                | `claude-sonnet-5-5` | `claude-haiku-5-5` |

单模型默认推荐 `claude-haiku-5-5`：全量请求都走同一个模型时，`claude-sonnet-5-5` 第一到第四幕约每现实小时 7.3 到 15.6 美元，`claude-haiku-5-5` 约 0.4 到 0.8 美元（第 8.2 节）；想要更好的女神与核心角色表现，应选分档而不是单模型的贵型号。

**OpenAI 兼容服务**（不点名型号，按档位描述）：

| 档位 | 推荐描述                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------- |
| 高档 | 该服务的旗舰通用对话模型：中文写作好，上下文不少于 64k，支持 `json_schema` 或函数调用                         |
| 中档 | 同家族的主力型号：上下文不少于 32k，支持 `json_schema` 或函数调用                                              |
| 低档 | 同家族的轻量或快速型号：上下文不少于 32k，至少支持 JSON 模式；单价约为中档的十分之一以下更合适                |
| 单模型 | 主力型号；兼顾价格时选轻量型号                                                                               |

**本机服务**（D-079 AQ-10）：低档放 7B 参数级以上的通用指令模型，上下文不少于 16k；高档放 14B 参数级以上，上下文不少于 32k；女神与审庭评审建议云端模型，本机 30B 参数级以上且实测通过时标"勉强"，其余标"不建议"。

**角色门槛**（来自 [ai_architecture.md](ai_architecture.md) 第 7.6 节的折叠线加输出上限，再留余量；用于标签与设置页提示）：

| 绑定角色     | 最小上下文 | 本机最小参数级 | 时限（不超过 [ai_architecture.md](ai_architecture.md) 第 9.1 节的路由超时） | 结构化输出最低通道 |
| ------------ | ---------- | -------------- | ----------------------------------------------- | ------------------ |
| 女神         | 48k        | 30B（建议云端） | 会话轮首句 4 现实秒内、全文 8 秒内；规划 30 秒内 | JSON 模式          |
| 核心 NPC     | 24k        | 14B            | 交谈首句 4 秒内、全文 8 秒内；生活轮 60 秒内    | JSON 模式          |
| 在场 NPC     | 16k        | 7B             | 60 秒内                                         | JSON 模式          |
| 离场批量     | 32k        | 7B             | 120 秒内                                        | JSON 模式          |
| 统治者与将领 | 24k        | 14B            | 议政 60 秒内；将领方案 30 秒内                  | JSON 模式          |
| 审庭评审     | 16k        | 30B（建议云端） | 10 秒内（`court.eloquence` 是 A 类请求）         | JSON Schema 或函数调用 |

### 4.6 角色适配标签与本机承载率（AQ-10 的"按实测标注"）

标签有三种：可用、勉强、不建议。标签只是提示，路由照玩家的选择执行。

| 来源               | 做法                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 已知型号表         | Anthropic 三个型号与价目表收录的型号直接给标签；`claude-haiku-5-5` 对女神标"勉强"，其余角色标"可用"；`claude-sonnet-5-5` 与 `claude-opus-5-5` 全部"可用"                                                                     |
| 角色适配测验       | 未知型号与本机型号在连接测试的深度测试里跑"测验小镇"（`data/llm/probe_town/`，虚构的小镇与人物，不含任何正典内容）：每个绑定角色一道代表长度的题；云端未知型号每角色一次、约 4k token 输入（测试前显示估算花费）；本机每角色三次、按代表长度 |
| 判定               | 可用：结构全部有效、只选菜单内的动作、中文输出、未复述埋入的"锁定词"、延迟满足第 4.5 节时限、上下文足够、承载率不低于 0.8；勉强：上下文足够且结构有效率不低于三分之二，其余有一项不满足；不建议：其余情形，或参数级别低于门槛 |
| 承载率（只对本机） | 承载率 = 3600 秒 /（该角色每现实小时的未命中输入 / 实测预填速度 + 输出 / 实测生成速度）乘并发折算系数；需求量取第 8.2 节"每现实小时 token 量"按当前幕的分角色数字；本机同时绑定多个角色时按合计需求计算 |

按设计请求量，第一幕核心 NPC 每现实小时约需 2.3M 输入 token、19 万输出 token（约每秒 53 个），第四幕约翻倍；单张消费级显卡上的 14B 级模型通常只能承担其中一部分，承载率不足的部分由调度器按截止判定放弃、内置 AI 代答（[ai_architecture.md](ai_architecture.md) 第 2.3.2 节"截止感知"），世界不受影响。设置页把承载率写成"约能承担该角色 X 成的请求"。

### 4.7 设置的存储、版本与同步

| 平台         | 非机密设置                                                                                     | 密钥                                                         | 记账簿                                                         |
| ------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| 桌面版       | `settings.local.json` 的 `llm` 分区（经 `hk:settings.get`、`hk:settings.set` 读写，主进程逐字段校验） | 用户数据目录 `secrets.bin`（连接编号到密文，[release_engineering.md](release_engineering.md) 第 2.5 节） | 网关追加的 `llm/ledger.jsonl`（逐条元数据）与由它汇总的窗口合计 |
| 网页试玩版   | 浏览器本地存储 `hakoniwa.llm.settings`                                                         | 不存（本机服务的令牌只在内存）                               | 浏览器本地存储（只记 token）                                   |
| 开发期       | 同网页，另加伪连接"开发代理"（只在开发构建出现）                                               | 开发服务的环境变量                                           | 同网页                                                         |

- 设置格式带 `version`，迁移函数在 `src/ai/llm_config/migrate.ts`，读到更高版本时只读不写并提示"设置来自更新的版本"。
- 从旧的单一开关（`hakoniwa.settings.ai` 为 `on`）迁移：有开发代理时迁成"自定义：开发代理"，否则迁成"关闭"。
- 大模型设置放在不随云同步的本机设置里：连接地址、模型与上限因机器而异；`secrets.bin` 与 `llm/` 目录同样不进 Steam 云、诊断包与设置导出。
- 记账簿的窗口合计：滑动小时窗口的逐条结算（只留最近 60 分钟）、按本地日期的日合计（保留 90 天）、按存档线编号的局合计；`ledger.jsonl` 按体积轮转，轮转前把合计写入摘要行。
  存档线编号在新游戏时生成并写进该线的所有存档，读档不会把局合计倒回去。

## 5. 设置界面流程

### 5.1 入口与首次使用

- 入口：设置窗口的"大模型"页签；主菜单与暂停菜单的设置都能进入；新游戏界面显示当前预设一行摘要和"更改"按钮。
- 全新安装的预设是"关闭（内置 AI）"；游戏从不自动启用云端连接，也不在开局强迫玩家配置。首次进入新游戏时的引导步骤由 [ux_and_onboarding.md](../40_design/ux_and_onboarding.md) 安排，本页只提供"了解大模型选项"的跳转目标。
- 设置页打开时世界暂停；改动在关闭设置页时生效，从下一请求起按新配置路由，不需要重启或重开存档；切换引起的会话处理见第 13 节。
- 本节用本地标签"屏 A"到"屏 J"：屏 D 是独立的密钥录入窗，其余是设置页 `ui_set_llm`（[ux_and_onboarding.md](../40_design/ux_and_onboarding.md) 第 4.6 节）里的区与子页，各屏的界面编号见第 5.2 节；页面布局、空状态与通知以该文档为准，字段、校验与行为以本节为准。

### 5.2 屏幕清单

| 标签 | 界面编号               | 屏幕             | 作用                                                         | 从哪里进                       |
| ---- | ---------------------- | ---------------- | ------------------------------------------------------------ | ------------------------------ |
| 屏 A | `ui_set_llm`           | 总览             | 预设卡片、各角色当前驱动、花费条、问题区、各子页入口         | 设置的"大模型"页签             |
| 屏 B | `ui_set_llm_conn`      | 连接列表         | 列出连接与状态，添加、编辑、删除、测试                       | 屏 A                           |
| 屏 C | `ui_set_llm_conn`      | 连接编辑向导     | 选类型、填字段、录密钥、测试、保存                           | 屏 B、屏 A 的预设卡片          |
| 屏 D | `ui_pop_llm_key_entry` | 密钥录入窗       | 独立小窗，只输入密钥                                         | 屏 C 的"填写密钥"              |
| 屏 E | `ui_set_llm_slots`     | 模型槽           | 为高、中、低档选择连接与模型、价目、高级参数                 | 屏 A、屏 C 保存后              |
| 屏 F | `ui_set_llm_roles`     | 角色绑定         | 六个角色的绑定方式、倾向、每类请求去向                       | 屏 A                           |
| 屏 G | `ui_set_llm_test`      | 连接测试报告     | 快速与深度测试的逐项结果与结论                               | 屏 B、屏 C、问题区的修复按钮   |
| 屏 H | `ui_set_llm_caps`      | 花费上限         | 小时、日、局上限，显示货币，份额，估算                       | 屏 A，启用云端预设时强制经过   |
| 屏 I | `ui_set_llm_ledger`    | 消耗台账         | 最近请求与汇总（第 9 节）                                    | 屏 A                           |
| 屏 J | `ui_set_llm_privacy`   | 隐私与数据       | 发出内容说明、存档隐私、远程源、清除数据（第 11 节）         | 屏 A，首次启用云端连接时弹出   |

界面编号与 [ux_and_onboarding.md](../40_design/ux_and_onboarding.md) 第 2.1、2.5 节的界面总表和第 4.6 节一致：屏 B 与屏 C 同属 `ui_set_llm_conn`（列表与向导是同一子页的两个状态），
屏 D 是桌面壳主进程创建的独立小窗，按弹层编号。

### 5.3 屏 A：总览

| 区域       | 内容                                                                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 预设卡片   | 四张卡（关闭、单模型、分档、本机）加"自定义"状态；每张写一句说明、需要的连接、按当前幕估算的每现实小时花费区间（第 8.2 节）；网页试玩版只显示关闭与本机，另两张灰显并写"桌面版可用"                                      |
| 角色状态表 | 六行：角色名、驱动（模型显示名，或"内置 AI"）、原因（玩家选择、未配置、达到上限、连接故障、节能级别）、本小时花费；点一行进屏 F 并定位到该角色                                                                              |
| 花费条     | 本小时、今日、本局三条：已用、上限、百分比；超过 60% 显示当前节能级别的一句话说明（第 8.5 节）                                                                                                                              |
| 问题区     | 当前未解决的问题（第 10 节），每条一个主修复按钮与"稍后"                                                                                                                                                                   |
| 按钮       | 连接与模型（屏 B）、角色绑定（屏 F）、花费上限（屏 H）、消耗台账（屏 I）、隐私与数据（屏 J）、测试全部连接                                                                                                                 |

**选择预设卡片的流程**：

1. 关闭：立即生效，提示"全部角色改由内置 AI 驱动，世界照常运行"。
2. 单模型、分档、本机：缺少所需连接时进入屏 C（类型预选好）；已有连接时直接预填模型槽（第 4.5 节的推荐，型号不在该连接的模型列表里时让玩家从列表选）。
3. 含云端连接的预设：没设过小时与日上限的，先进入屏 H（预填建议值，第 8.3 节）；该连接没完成首次告知的，先弹屏 J 的告知卡。
4. 确认页列出：槽位、绑定、倾向、估算花费、上限；点"启用"后生效。

### 5.4 屏 B 与屏 C：连接

**屏 B 连接列表**每行：名称、类型、地址、密钥状态（"已保存，末四位 abcd"、"未设置"、"仅本次运行"、"不需要"）、最近测试时间与结论、已启用模型数；按钮：添加连接、编辑、测试、删除（删除前确认，并同时删除该连接的密钥；被槽位引用时提示受影响的槽位与角色）。列表下方是全局的"网络代理"：跟随系统（默认）或手动地址（第 7.5 节），只作用于云端连接。

**屏 C 连接编辑向导**分三步。第一步选类型：Anthropic、OpenAI 兼容服务、本机服务（网页试玩版前两项不可选）。第二步填字段：

| 字段           | 适用          | 默认                               | 校验与说明                                                                                                                                                                     |
| -------------- | ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 名称           | 全部          | 按类型（例："Anthropic"）           | 1 到 24 字；同名时自动加序号                                                                                                                                                  |
| 服务种类       | 本机          | Ollama                             | Ollama、LM Studio、llama.cpp 服务、其他兼容服务；切换时改写默认地址                                                                                                           |
| 地址           | 全部          | Anthropic 官方地址；本机按种类     | 必须是合法 URL；云端必须 `https`；`http` 只允许回环地址与私有网段（10、172.16 到 172.31、192.168、链路本地）；去掉末尾斜杠；兼容服务地址不以 `/v1` 结尾时提示"多数服务的地址以 /v1 结尾"，并给"补上"按钮；不允许内嵌用户名口令；网页试玩版只允许回环地址 |
| 密钥           | Anthropic、兼容；本机可选 | 未设置                        | 按钮"填写密钥"打开屏 D；已保存时显示末四位与保存日期，按钮变为"更换""清除"                                                                                                    |
| 鉴权方式       | 兼容（高级）  | Bearer                             | Bearer 或自定义头名（只允许字母、数字、连字符）                                                                                                                               |
| 额外请求头     | 兼容（高级）  | 无                                 | 至多 4 条；名称同上；值经屏 D 同样录入与存储                                                                                                                                  |
| 计价货币       | 兼容          | 美元                               | 美元或人民币                                                                                                                                                                  |
| 并发上限       | 全部（高级）  | 云端 8，本机 2                     | 云端 1 到 12，本机 1 到 4；本机建议不超过服务端的并行槽数                                                                                                                     |
| 服务端回退     | Anthropic     | 开                                 | 关掉后拒答一律按失败处理                                                                                                                                                      |
| 上下文长度     | 兼容、本机    | 自动读取                           | 读不到时必填，1024 到 2,000,000                                                                                                                                               |

第三步测试与保存：按钮"测试连接"跑快速测试（第 5.6 节），通过或玩家确认"仍然保存"后保存；保存后跳到屏 E 让玩家启用模型并放进槽位。

### 5.5 屏 D：密钥录入窗（桌面版）

- 由主进程创建的独立小窗（父窗口为游戏窗口，模态，开启上下文隔离与沙箱），加载随包发布的静态页面；它有自己的预载，只暴露"提交"与"取消"，不加载任何游戏代码。
- 一个密码输入框（关闭拼写检查与自动填充）、"粘贴"按钮（由主进程读剪贴板直接收下，不经任何渲染进程）、保存、取消；从不回显已保存的密钥。
- 提交后主进程校验：非空、至多 512 字符、不含空白与控制字符；Anthropic 连接的密钥不以 `sk-ant-` 开头时提示"看起来不像 Anthropic 密钥"，仍允许保存；
  通过后交给 `desktop/secrets.ts` 加密写入 `secrets.bin`（或在无钥匙串时只交给网关内存），主进程不保留副本。
- 保存成功后小窗关闭，游戏窗口只收到"已保存，末四位 abcd"（或"仅本次运行"，第 6.1 节）。
- 手柄与 Steam Deck：输入框获得焦点时调起系统或 Steam 的屏幕键盘；"粘贴"可用手柄确认键触发。
- 网页试玩版没有屏 D：本机服务的令牌在屏 C 的普通输入框里填写，只存内存。

### 5.6 屏 G：连接测试

**快速测试**（保存连接、点"测试"、启动时能力记录超过 30 天）：

| 序 | 检查项       | 做法                                                                                     | 结果写法                                                                     |
| -- | ------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1  | 地址格式     | 本地检查，不联网                                                                         | 通过；未通过（附第 5.4 节的具体规则）                                        |
| 2  | 可达         | 列模型或健康端点，5 秒超时                                                               | 通过（附往返毫秒）；未通过（附问题代码：网络、证书、地址不对、浏览器拦截）   |
| 3  | 鉴权         | 第 2 步的状态码                                                                          | 通过；密钥无效；权限不足；不需要                                             |
| 4  | 模型         | 槽位里的模型是否在列表中；本机是否已加载                                                 | 通过；无此模型；未加载（附加载方法）                                         |
| 5  | 结构化输出   | 对每个启用的模型发一个至多 64 token 的探针，模式为两个字段的小对象，按第 3.5 节通道顺序 | 通过（附可用通道与首字、总延迟）；未通过                                     |
| 6  | 流式         | 同一探针以流式再发一次                                                                   | 支持（附首字延迟）；不支持；结束时不带用量                                   |
| 7  | 参数         | 探针中顺带确认输出上限参数名、思考参数、采样参数                                         | 逐项写"接受"或"不接受"                                                       |
| 8  | 上下文长度   | 已知型号表、服务元数据或玩家填写                                                         | 数值与来源；低于某角色门槛时列出该角色                                       |

快速测试的花费在云端约为几个探针请求的量，界面写"本次测试约花费不到 0.01 美元，计入台账（来源：测试）"。

**深度测试**（玩家主动点，测试前显示估算花费与耗时，可中途取消）：提示缓存（两次相同前缀约 1.5k token 的请求，看缓存字段）、吞吐（本机：4k token 输入、256 token 输出，记预填与生成速度）、角色适配测验（第 4.6 节）。

**结论区**：每个启用模型一行，六个角色各一个标签（可用、勉强、不建议）与一句原因；本机另写承载率；最后一行写"按当前设置，第 N 幕约每现实小时花费 X"。结果文字只用"通过、未通过、支持、不支持、可用、勉强、不建议"等词，不用符号。

### 5.7 屏 E 与屏 F：模型槽与角色绑定

**屏 E 模型槽**：三行（高档、中档、低档），每行：

| 字段             | 说明                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 连接             | 下拉；可为空                                                                                                                                    |
| 模型             | 下拉（来自列模型，带搜索）；兼容服务与本机允许手填，手填后自动跑该型号的快速测试                                                                |
| 思考深度         | 仅 Anthropic：跟随路由（默认）、低、中、高                                                                                                      |
| 价目             | Anthropic 显示价目表数值（高级里可覆盖）；兼容服务填输入、缓存命中输入、输出三项单价；本机为零                                                  |
| 能力             | 只读：输出通道、流式、提示缓存、上下文长度                                                                                                      |
| 标签             | 只读：六个角色的适配标签；点开看原因                                                                                                            |
| 温度（高级）     | 兼容与本机可设；Anthropic 不显示                                                                                                                |

同一模型可以放进多个槽。槽为空时，路由按第 4.3 节向下、再向上找最近的已配置槽。

**屏 F 角色绑定**：六行，每行一个绑定方式下拉（按档位路由、固定高档、固定中档、固定低档、内置 AI），旁边显示该角色当前的适配标签与估算的每现实小时花费；展开一行列出该角色的每个决策类别此刻会去哪个槽与哪个模型（第 4.2 节）。页面顶部是倾向选择（标准、充裕、节省），只影响"按档位路由"的角色。任一改动使预设显示为"自定义"，并有"恢复为某预设"按钮。

屏 F 底部的高级开关（都默认开）：序章与第六幕用玩家配置的最高档（D-079 AQ-18，关掉后这些类别按倾向表路由）；交互类流式显示台词首句（AQ-17，关掉后整段到达再显示）；Anthropic 服务端回退（AQ-16，与屏 C 的同名字段是同一个设置）。

### 5.8 屏 H：花费上限

| 字段           | 默认                                         | 校验与说明                                                                                                                                 |
| -------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 显示货币       | 美元                                         | 美元或人民币；换算汇率默认取价目表的参考汇率，可改                                                                                         |
| 每小时上限     | 启用云端预设时必填；建议值见第 8.3 节        | 金额或 token 至少填一项，可两项都填（先到先算）；大于零                                                                                    |
| 每日上限       | 启用云端预设时必填；建议值为每小时上限乘 3   | 小于每小时上限时提示"每日上限低于每小时上限，小时上限实际不会用满"，允许保存                                                              |
| 每局上限       | 不设                                         | 可选；"按全程估算设置"按钮填入第 8.2 节全程估算的 1.2 倍                                                                                   |
| 份额（高级）   | 按当前预设的成本结构（第 8.4 节）            | 六个角色的百分比，合计须为 100；保留类不受份额限制                                                                                         |
| 估算面板       | 只读                                         | 当前设置下本幕每现实小时的估算；最近 60 分钟的实测；两者差异超过五成时提示"实测与估算差异较大，可在台账查看原因"                           |

只配置本机连接时，上限可以全部留空（本机无费用）；也可以只设 token 上限，用来限制显卡占用。

### 5.9 无障碍与手柄

全部屏幕可用键盘与手柄完成：方向键移动焦点、确认键进入、取消键返回；数值字段支持左右键按步长增减；屏幕阅读器标签取自文本表；状态与标签同时用文字表达，不只靠颜色。

## 6. 密钥存储

### 6.1 桌面版

存储机制以 [release_engineering.md](release_engineering.md) 第 2.5 节为准，本节只写与大模型设置相关的规则。

| 项               | 规则                                                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 加密             | Electron `safeStorage`：Windows 用 DPAPI，macOS 用钥匙串中本应用的加密钥，Linux 用系统密钥服务；密文写入用户数据目录 `secrets.bin`（连接编号到密文），文件权限只限当前用户                            |
| 录入             | 只经屏 D 的独立小窗（第 5.5 节）；游戏渲染进程没有任何携带密钥的通道参数                                                                                                                              |
| Linux 无密钥服务 | `safeStorage` 的存储后端为明文或未知后端时视为不可用：不落盘，密钥只存网关内存直到退出；连接显示"仅本次运行"，问题代码 `keychain_unavailable`                                                       |
| 解密时机         | 只有网关在发请求时解密，明文只在本次请求作用域内；不提供任何回读通道                                                                                                                                  |
| 额外请求头的值   | 与密钥同样加密存储                                                                                                                                                                                    |
| 删除             | 删除连接或"清除密钥"立即删除对应条目；"删除全部 AI 数据"（屏 J）删除全部大模型密钥、`llm/` 目录与大模型设置分区                                                                                      |
| 卸载             | 用户数据目录不随 Steam 卸载删除，隐私说明里写明，并提示可先用"删除全部 AI 数据"                                                                                                                      |
| 同步与备份       | `secrets.bin` 不进 Steam 云、不进诊断包、不进设置导出                                                                                                                                                 |
| 崩溃与日志       | 崩溃报告的附加参数、主进程日志、网关日志都不含密钥与鉴权头；网关只记"连接编号、模型、用量、延迟、状态码、问题代码"                                                                                   |

### 6.2 网页试玩版

只接受本机服务（D-081）：Anthropic 与兼容服务两类连接在界面上不可选；地址校验只允许回环地址；连接的令牌（若本机服务要求）只存在页面内存里，刷新即失效；游戏从不把任何令牌写入浏览器存储。

### 6.3 开发期

开发服务按 D-059 只从环境变量（`ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`）或官方 SDK 的登录配置读取凭据，兼容服务与本机服务的开发凭据放在 `hakoniwa/.local/llm_dev.json`（不入库，`hakoniwa/.gitignore` 已排除 `.local/`）；浏览器只调本地 `/api/llm`。

### 6.4 不得出现密钥的地方

游戏渲染进程的内存与全部 IPC 消息、主进程日志、浏览器存储、存档与 `ai_state/`、审计记录与轨迹日志、录像与回放、消耗台账与导出文件、错误提示与问题文案、崩溃报告与诊断包、遥测、Steam 云同步、源码与测试夹具。第 16 节的守卫测试逐项扫描。

## 7. 主进程转发与进程间接口

### 7.1 进程分工

进程分工与通道总表以 [release_engineering.md](release_engineering.md) 第 2.1、2.3、2.4 节为准；本节写大模型部分的接口细节。

| 进程                       | 持有                                                                   | 不持有                             |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------- |
| 游戏渲染进程               | 内核、AI 层（调度、预算镜像、路由、装配、闸门）、设置页、消耗台账视图   | 密钥、对外网络（内容安全策略禁止） |
| 主进程                     | 通道处理器（核对发送方、体积、连接编号）、密钥录入窗、设置存储          | 密钥明文、题面解析                 |
| 大模型网关（utility 进程） | 密钥解密、适配器、守卫、记账簿、`net` 模块请求、流式转发                | 题面装配、输出校验、预算决策       |
| 密钥录入窗                 | 一次性输入框                                                           | 游戏代码、其他连接的信息           |

即使渲染进程出错，它也无法绕过网关访问提供方；即使网关崩溃，世界照常运行，在途请求按超时处理、兜底照常到点。

### 7.2 预载桥的大模型通道

预载桥只暴露一个对象 `window.hk`（[release_engineering.md](release_engineering.md) 第 2.3 节），大模型相关的方法与通道如下；渲染进程侧经 `PlatformHost.llm` 调用，AI 层只见 `LlmTransport`。

| 方法                                    | 通道                     | 载荷                                                   | 返回                                                                | 校验与上限                                         |
| --------------------------------------- | ------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------- |
| `llm.request(spec, port)`               | `hk:llm.request`         | `LlmCallSpec`（第 3.1 节）加一个 `MessagePort`         | 经端口流回增量、完成回执或带问题代码的失败（第 7.3 节）             | 第 7.4 节                                          |
| `llm.abort(requestId)`                  | `hk:llm.abort`           | 请求号                                                 | 无                                                                  | 无                                                 |
| `llm.secretEnter(connectionId, target)` | `hk:llm.secret.enter`    | 连接编号；目标为密钥或某个额外请求头                   | `KeyStatus`（打开屏 D，关闭后返回）                                 | 同一时刻只开一个录入窗                             |
| `llm.secretHas(connectionId)`           | `hk:llm.secret.has`      | 连接编号                                               | `KeyStatus`                                                         | 无                                                 |
| `llm.secretClear(connectionId)`         | `hk:llm.secret.clear`    | 连接编号                                               | `KeyStatus`                                                         | 无                                                 |
| `llm.models(connectionId)`              | `hk:llm.models`          | 连接编号                                               | `ModelListing`（模型名、上下文长度、参数级别、是否已加载）          | 每分钟至多 10 次                                   |
| `llm.test(req)`                         | `hk:llm.test`            | 连接编号、快速或深度、可选模型列表                     | `ConnectionTestReport`（第 5.6 节）                                 | 每分钟至多 10 次；深度测试需渲染进程先展示估算花费 |
| `llm.ledger(window)`                    | `hk:llm.ledger`          | 时间窗                                                 | `SpendSnapshot`：小时、日、局的已用、上限与分角色合计（不含文本）   | 无                                                 |
| `llm.wipe()`                            | `hk:llm.wipe`            | 无                                                     | 结果                                                                | 二次确认在渲染进程                                 |
| `llm.onProblem(cb)`                     | `hk:llm.problem`（推送） | 网关侧问题：钥匙串不可用、守卫拦截、连接熔断与恢复     | 无                                                                  | 只读事件                                           |

大模型设置本身经通用的 `hk:settings.get`、`hk:settings.set`（`llm` 分区）读写，主进程按第 5.4、5.7、5.8 节的规则逐字段复核，未知字段丢弃。

```ts
interface KeyStatus {
  state: 'none' | 'saved' | 'session_only';
  last4?: string; // 只显示末四位
  savedAt?: string;
  backend: 'os_keychain' | 'memory_only';
}
```

### 7.3 调用与流式消息

- `hk:llm.request` 对流式与非流式一视同仁：端口上依次收到零到多条 `{ t: 'delta', text }`（只含正文增量，不含思考；非流式请求没有增量），最后一条为 `{ t: 'done', result }` 或 `{ t: 'error', result }`。
- `result` 是 `LlmCallResult`（[ai_architecture.md](ai_architecture.md) 第 2.3.1 节），另带 `problem?: ProblemCode`、`servedModel`、`fallbackUsed`、`providerRequestId`、`usageEstimated`、按价目卡算出的 `costUsd`。
- 渲染进程关闭端口或调用 `hk:llm.abort` 即中止在途请求；已发出的请求按 [ai_architecture.md](ai_architecture.md) 第 9.2 节记账（预留按已发出计）。
- 系统挂起时网关中止在途请求，回执记为超时（[release_engineering.md](release_engineering.md) 第 2.4 节）。

### 7.4 守卫

每次 `hk:llm.request` 按顺序检查，任何一项不过就不发网络请求，直接经端口返回带问题代码的失败：

| 序 | 在哪里 | 检查           | 规则                                                                                                     | 失败时                |
| -- | ------ | -------------- | -------------------------------------------------------------------------------------------------------- | --------------------- |
| 1  | 主进程 | 来源           | 发送方框架的地址是 `app://hakoniwa`                                                                      | 丢弃并记录            |
| 2  | 主进程 | 形状与体积     | 规格只含约定字段（多余字段即拒绝）；序列化后不超过 256 KiB；分段不超过 64 段                              | `bad_request`（缺陷） |
| 3  | 主进程 | 连接编号       | 连接存在且已启用；规格里不接受任何地址或请求头，地址只取自已保存的连接                                   | `not_configured`      |
| 4  | 网关   | 模型与输出上限 | 模型在该连接的启用列表里；`maxTokens` 不超过 16000 且不超过该模型上限；连接有可用密钥（或不需要）        | `not_configured`      |
| 5  | 网关   | 速率与并发     | 该连接在途数不超过并发上限；每分钟请求数不超过 120（本机 60）                                            | `rate_limited`（本地）|
| 6  | 网关   | 上限           | 记账簿的已结算、在途预留与本次预留之和不超过小时、日、局任一上限（连接测试的探针除外，第 8.4 节）         | `cap_reached`         |
| 7  | 网关   | 超时           | 规格的超时截到 300 秒以内                                                                                | 无                    |

守卫规则与记账簿是纯模块（`src/ai/gateway/`），开发代理用同一份；渲染进程的预算器先于守卫做同样的判断，守卫是纵深防御，正常情况下不会触发第 6 项，触发即记"守卫拦截"并在台账标出。

### 7.5 网络细节

| 项       | 规则                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------- |
| 发送     | 网关用 Electron `net` 模块（Chromium 网络栈）：默认跟随系统代理与系统证书库；回环地址不走代理                              |
| 手动代理 | 屏 B 的"网络代理"可从"跟随系统"切换为手动地址（`http`、`https` 或 `socks5`），只作用于大模型请求；本机与局域网地址始终直连   |
| 重定向   | 不跟随（手动模式）；收到 3xx 记为 `endpoint_wrong`，避免把鉴权头带到别的主机                                               |
| 证书     | 只认系统信任的证书；不提供"忽略证书错误"选项                                                                               |
| 响应上限 | 非流式正文至多 2 MiB；流式累计至多 2 MiB；错误正文只读前 4 KiB                                                             |
| 脱敏     | 错误正文与日志在返回前抹掉：本连接的密钥与额外请求头的值、形如 `sk-` 开头的长串、鉴权头；再截到 300 字                     |
| 重试     | 网关不自动重试；重试由渲染进程按 [ai_architecture.md](ai_architecture.md) 第 9.2 节决定                                     |

## 8. 花费估算与上限

### 8.1 估算方法

估算器 `src/ai/llm_config/estimate.ts` 是纯函数：输入为设置（槽位、绑定、倾向）、价目卡、当前幕与倍速；用 [ai_architecture.md](ai_architecture.md) 第 10.1 节的计价公式、第 10.3 节的请求类别假设、第 10.4 节的各幕请求量、第 10.6 节的缓存命中假设，逐类别按路由解析出的模型计价求和，再乘 1.05 的重试余量。第三、五幕按第四幕的量级；第六幕按场计。

**实测校准**：玩到 30 现实分钟以后，估算面板并排显示"设计估算"与"最近 60 分钟实测"（来自台账），实测按角色以指数平滑（新样本权重 0.3）更新；建议上限按两者的较大值计算。

### 8.2 各预设的估算

**每现实小时（1 倍速，Anthropic 价目，美元）**：

| 预设与倾向                                   | 第一幕 | 第二幕 | 第三到五幕 |
| -------------------------------------------- | ------ | ------ | ---------- |
| 关闭                                         | 0      | 0      | 0          |
| 单模型 `claude-haiku-5-5`                    | 0.38   | 0.58   | 0.81       |
| 单模型 `claude-sonnet-5-5`                   | 7.31   | 11.28  | 15.62      |
| 分档·节省                                    | 0.54   | 0.82   | 1.22       |
| 分档·标准                                    | 2.40   | 3.21   | 4.45       |
| 分档·充裕                                    | 7.55   | 10.36  | 14.39      |
| 自定义示例：分档·标准，低档换本机服务        | 2.13   | 2.76   | 3.82       |
| 本机                                         | 0      | 0      | 0          |

**一次性场景（美元）**：

| 场景                       | 高档 `claude-opus-5-5` | 中档 `claude-sonnet-5-5` | 低档 `claude-haiku-5-5` |
| -------------------------- | ---------------------- | ------------------------ | ----------------------- |
| 序章面试                   | 约 3.5                 | 约 1.8                   | 约 0.09                 |
| 第六幕每场审理（共六场）   | 约 6                   | 约 3                     | 约 0.16                 |
| 一次天启解读（六位女神）   | 约 0.9                 | 约 0.4                   | 约 0.02                 |

序章与第六幕用玩家配置的最高档（AQ-18）：分档·标准与充裕走高档列，分档·节省走中档列，单模型走所选模型。

**全程上限估算**（按 D-070 的主线时长取中值：序章 1 小时，第一、二幕各 11 小时，第三到五幕合计 35 小时，第六幕六场审理，三次主线天启；全部按 1 倍速满时长计，睡眠、等待、区域图行进与加速会让实际花费更低）：

| 预设与倾向                    | 全程上限估算（美元） |
| ----------------------------- | -------------------- |
| 单模型 `claude-haiku-5-5`     | 约 40                |
| 分档·节省                     | 约 78                |
| 自定义示例（标准加本机低档）  | 约 230               |
| 分档·标准                     | 约 260               |
| 分档·充裕                     | 约 740               |
| 单模型 `claude-sonnet-5-5`    | 约 770               |

**每现实小时 token 量**（1 倍速，全部角色走模型时；用于兼容服务按玩家价目估算、token 上限与本机承载率）：

| 幕         | 未命中输入 | 命中输入 | 输出（含思考） |
| ---------- | ---------- | -------- | -------------- |
| 第一幕     | 1.37M      | 2.36M    | 0.35M          |
| 第二幕     | 2.12M      | 3.54M    | 0.54M          |
| 第三到五幕 | 3.00M      | 4.95M    | 0.75M          |

兼容服务的每现实小时估算 = 未命中输入乘输入单价 + 命中输入乘缓存命中单价 + 输出乘输出单价（多数兼容服务没有缓存写入加价）。分角色的量：第一幕女神约 0.9M 输入与 9 万输出，核心 NPC 约 2.3M 与 19 万，在场 NPC 约 0.4M 与 5 万，离场批量约 0.1M 与 2 万；第四幕女神约 1.4M 与 13 万，核心 NPC 约 5.0M 与 39 万，在场 NPC 约 0.7M 与 8 万，离场批量约 0.6M 与 12 万，统治者与将领约 0.3M 与 3 万。

### 8.3 玩家上限

| 窗口   | 口径                                                                     | 必填                     | 建议值                                                           |
| ------ | ------------------------------------------------------------------------ | ------------------------ | ---------------------------------------------------------------- |
| 每小时 | 滑动 60 现实分钟，含在途预留                                             | 绑定了任何云端连接时必填 | 当前幕估算的 1.5 倍，向上取到 0.5、1、2、3、5、8、10、15、20、30、50 中最近的一档 |
| 每日   | 本地日历日，0 点按系统时区重置；跨所有存档                               | 同上                     | 每小时上限乘 3                                                   |
| 每局   | 新游戏起的整条存档线累计；读档不回退                                     | 否                       | 全程上限估算乘 1.2                                               |

每个窗口可以填金额、token 或两者；两者都填时任一先到即算到上限。金额上限只约束有价目的模型；没有价目的兼容模型只受 token 上限约束，设置页对此单独标出。

### 8.4 记账口径

- **先预留后结算**：预留 = 输入估算乘 1.15 的全价输入，加该路由的整段输出上限（含思考），按所路由模型的价目；回复后按真实用量结算（[ai_architecture.md](ai_architecture.md) 第 2.3.3 节）。因为预留按整段输出上限计，真实花费几乎总不超过预留，"已结算加在途预留不超过上限"即保证上限不被越过。
- **单次预留上限**：单次预留超过小时上限的 10% 时，该请求先按第 4.3 节降一档再算；仍超过则放弃（原因"单次请求过大"），避免一次长请求吃掉整小时额度。
- **份额**：小时上限按绑定角色分份额，默认取当前预设的成本结构（分档·标准：女神 65%、核心 NPC 20%、统治者与将领 10%、在场 NPC 与离场批量合计 5%；单模型：女神 20%、核心 NPC 55%、在场 NPC 15%、离场批量 8%、统治者与将领 2%；分档·节省：女神 45%、核心 NPC 40%、在场 NPC 10%、离场批量 3%、统治者与将领 2%；分档·充裕：女神 40%、核心 NPC 55%、统治者与将领 3%、在场 NPC 与离场批量合计 2%；只按 token 计的上限（本机或无价目的模型）：女神 20%、核心 NPC 60%、在场 NPC 10%、离场批量 7%、统治者与将领 3%），类内超支可借用空闲份额；保留类不受份额限制。这些份额是基准值，成本结构经实测校准后随之重新导出（[ai_architecture.md](ai_architecture.md) 第 10.10 节）。
- **测试请求**计入记账簿与台账（来源"测试"），但不受份额限制，也不因上限被拦（花费极小，且由玩家主动发起）。
- **跨进程**：记账簿由网关持久化（`llm/ledger.jsonl`）并作为记录的权威；渲染进程启动时经 `hk:llm.ledger` 读取窗口汇总，此后每次结算由网关按价目卡算出金额并随回执返回，两边一致。

### 8.5 到上限后的行为

按最紧窗口的消耗率（含在途预留）逐级降级，级别与 [ai_architecture.md](ai_architecture.md) 第 9.4 节同表；第 2 级起非保留类先降一档再判断是否放弃。每一级落到具体的绑定角色上（D-036、D-068）：

| 消耗率   | 级别   | 改由内置 AI 驱动的部分                                                                 | 仍走模型的部分                                   |
| -------- | ------ | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 低于 60% | 0      | 无                                                                                     | 全部                                             |
| 60%      | 1 到 2 | 离场批量全部；在场 NPC 的事件轮                                                        | 其余                                             |
| 70%      | 3 到 4 | 各角色的整理轮推迟；在场 NPC 全部                                                      | 女神、核心 NPC、统治者与将领、审庭评审           |
| 80%      | 5 到 6 | 核心 NPC 的生活轮降频、NPC 之间交谈改话题菜单；统治者与将领全部                         | 女神、核心 NPC 的其余部分、审庭评审              |
| 90%      | 7 到 8 | 女神隔日规划；核心 NPC 只保留与玩家正在进行的交谈                                      | 保留类：玩家正在进行的交谈、女神的重要唤醒与会话轮、写定锚点、审庭 |
| 100%     | 9      | 全部角色                                                                               | 无                                               |

- 日上限用尽：第 9 级持续到本地日期变更或玩家提高上限；局上限用尽：第 9 级持续到玩家提高上限。
- 回落：滞回，连续 5 现实分钟健康，且滑动小时窗口的消耗率低于该级触发阈值 10 个百分点，回落一级。
- 提示：级别上升时在画面角落给一条非阻塞提示条，写本级的一句话说明与"调整上限"按钮，每个级别每次游玩至多提示一次；进入第 9 级时写"已达到花费上限，全部角色改由内置 AI 驱动，世界照常运行"。不暂停，不弹模态窗。
- 屏 A 的角色状态表同步显示每个角色的驱动与原因（"达到小时上限"等）。

### 8.6 网关的安全上限

守卫第 6 项按同一上限复核（第 7.4 节）。渲染进程的阶梯在 100% 时已全部放弃，所以守卫拦截只在渲染进程状态异常时出现；出现时台账记"守卫拦截"，并以问题代码 `cap_reached` 提示一次。

## 9. 消耗台账界面（屏 I）

参照 [my_ai_town_agents.md 第 8.1 节](../10_research/ai_npc/my_ai_town_agents.md) 的消耗页（最近 500 条请求），按本作的角色与剧透约束改写。

### 9.1 记录字段

| 字段         | 内容                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| 现实时间     | 请求完成时刻                                                                                           |
| 游戏时刻     | 人类化历法时刻                                                                                         |
| 角色         | 绑定角色                                                                                               |
| 类别         | 决策类别的玩家可读名（例："女神·规划""居民·日计划"）                                                  |
| 行动者       | 剧透安全标签（第 9.3 节）                                                                              |
| 模型         | 连接名与模型；服务端回退时显示"已回退至某模型"                                                         |
| 状态         | 采纳、部分采纳、过时、放弃（附原因）、格式重试、失败（附问题代码）、兜底、首句已显示后撤回、守卫拦截   |
| 延迟         | 首字与总时长                                                                                           |
| token        | 未缓存输入、缓存读、缓存写、输出；用量为估算时标"估算"                                                 |
| 金额         | 显示货币；预留与结算的差额可展开查看                                                                   |
| 来源         | 游戏、测试                                                                                             |
| 提供方请求号 | 只在展开详情里显示，便于向提供方求助                                                                   |

### 9.2 汇总区

本小时、今日、本局的金额与 token，对照上限；按角色的花费条形图；缓存命中率；平均与 P95 延迟；拒答率与服务端回退率；放弃原因排行；当前降级级别与最近的级别变化；筛选（角色、状态、连接、时间范围）；导出 CSV（只含上表字段，不含题面与输出文本）。

### 9.3 剧透安全的标签

台账是玩家看得到的界面，不能比游戏本身先揭示任何东西：

| 行动者                   | 标签规则                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| 女神                     | 玩家此刻可用的称谓（[reveal_ledger.md](../30_story/reveal_ledger.md) 第 6 节称谓开放表）          |
| 雅努的入夜轮与梦境       | 正名之前一律写"女神（梦）"（D-023）                                                              |
| 叙事导演                 | 写"女神（统筹）"，不写莫伊拉之名与导演职能                                                       |
| 已结识的 NPC             | 玩家已知的名字或称呼                                                                             |
| 未结识的 NPC             | "未结识的居民"                                                                                   |
| 离场批量                 | 玩家已发现的地区名，否则"远方地区"                                                               |
| 统治者与将领             | 玩家已知的头衔与名字，否则"某国统治者""某军将领"                                                 |

标签函数复用 `src/content/knowledge/` 的称谓与已知实体查询；台账视图的全部字符串在测试里过一遍泄露扫描（第 16 节）。

### 9.4 保留与清除

最近 500 条记录只在内存；关闭游戏即丢弃。日合计与局合计在记账簿里（第 4.7 节）。审计记录与轨迹的保存规则见 [ai_architecture.md](ai_architecture.md) 第 11.4、12 节。屏 J 的"清除 AI 日志"清空台账、审计与轨迹，不动记账簿；"删除全部 AI 数据"连同记账簿、设置与密钥一起删除。

## 10. 错误分类与玩家可读文案

### 10.1 问题代码表

问题代码是面向玩家的分类，与 [ai_architecture.md](ai_architecture.md) 第 2.3.1 节的 `ProviderErrorClass`（面向调度与健康度）一一或多对一映射。文案以文本键 `llm.problem.<代码>.title` 与 `.body` 存放（D-077），下表写中文源文。

| 代码                   | 名称             | 识别：Anthropic                                         | 识别：OpenAI 兼容                                              | 识别：本机                                                  | 玩家文案（说明句）                                                       | 修复按钮                                     | 自动处理                                                     |
| ---------------------- | ---------------- | ------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------ |
| `key_invalid`          | 密钥无效         | 401                                                     | 401                                                            | 401（服务设了令牌）                                         | 这把密钥无效或已被撤销。                                                 | 重新填写密钥；打开提供方控制台               | 该连接熔断；改道或转内置 AI                                  |
| `permission_denied`    | 权限不足         | 403                                                     | 403                                                            | 403                                                         | 这把密钥无权使用该模型。                                                 | 换一个模型；重新填写密钥                     | 该模型的槽位停用                                             |
| `insufficient_balance` | 余额不足         | 402，或 400 中错误类型与正文标明额度不足                | 402；或 429 且错误代码为额度用尽一类                           | 不适用                                                      | 提供方账户的余额或额度不足。                                             | 打开提供方控制台；改用其他连接               | 该连接熔断，直到玩家点"重试"或重新测试通过                   |
| `model_not_found`      | 无此模型         | 404 且指向模型                                          | 404，或错误代码为模型不存在一类                                | Ollama 404 模型未找到                                       | 这个服务上没有该模型。                                                   | 从列表选择模型；本机显示拉取方法             | 该槽位停用                                                   |
| `model_not_loaded`     | 本机模型未加载   | 不适用                                                  | 不适用                                                         | 健康端点 503 正在加载；服务回复没有已加载的模型             | 本机服务还没有加载这个模型。                                             | 重试；查看加载方法                           | 每 30 现实秒自动探测一次，就绪即恢复                         |
| `timeout`              | 回复太慢         | 超过路由超时（A 类 10 秒；B 类 30、C 类 60、D 类 120 是基准值，[ai_architecture.md](ai_architecture.md) 第 9.1、10.10 节） | 同左                                                           | 同左                                                        | 模型回复太慢，这一次已由内置 AI 代答。                                   | 为该角色换更快的档位；查看延迟统计           | 计入健康度；连续 5 现实分钟 A 类 P95 超过 8 秒时改走更快路由 |
| `context_too_long`     | 上下文超长       | 400，正文标明提示过长                                   | 400，错误代码为上下文长度超限一类                              | 400；或回复显示输入被截断                                    | 题面超出了这个模型的上下文长度。                                         | 为该角色换长上下文的模型；改上下文长度设置   | 输入预算收紧到上次实际发送量的 3/4，提前折叠后重试一次       |
| `rate_limited`         | 限流             | 429                                                     | 429（非额度类）                                                | 本地守卫第 4 项                                             | 提供方限流了，稍后自动恢复。                                             | 降低并发上限                                 | 按重试等待时长延后；降低该连接的令牌桶速率                   |
| `overloaded`           | 服务繁忙         | 529                                                     | 503                                                            | 503（非加载）                                               | 提供方服务繁忙，稍后自动恢复。                                           | 无                                           | 退避重试一次；连续出现即熔断并半开探测                       |
| `server_error`         | 服务出错         | 其他 5xx                                                | 其他 5xx                                                       | 其他 5xx                                                    | 提供方服务出错，稍后自动恢复。                                           | 无                                           | 同上                                                         |
| `network`              | 无法连接         | 连接失败、DNS 失败                                      | 同左                                                           | 连接被拒                                                    | 云端：无法连接到提供方，请检查网络。本机：本机服务没有启动。             | 重试；本机显示启动方法                       | 熔断并半开探测                                               |
| `tls_error`            | 证书错误         | 证书校验失败                                            | 同左                                                           | 不适用（本机用 HTTP）                                       | 这个地址的证书无法校验。                                                 | 检查地址                                     | 该连接熔断                                                   |
| `endpoint_wrong`       | 地址不对         | 404 且不指向模型；3xx；返回网页而不是 JSON              | 同左；路径缺 `/v1` 的常见情形                                  | 同左                                                        | 这个地址不像兼容的接口，多数服务的地址以 /v1 结尾。                      | 自动补全 /v1；编辑地址                       | 该连接熔断                                                   |
| `cors_blocked`         | 浏览器拦截       | 不适用                                                  | 不适用                                                         | 网页试玩版的跨域失败                                        | 浏览器拦截了对本机服务的访问，需要在本机服务里允许本页面的来源。         | 查看各服务的设置方法；下载桌面版             | 该连接熔断                                                   |
| `refusal`              | 拒答             | 停止原因为拒答（服务端回退后仍拒答）                    | `refusal` 字段或内容过滤                                       | 不适用                                                      | 只在频繁发生时提示：这个模型经常拒绝回答，可能不适合本作的题材。         | 换一个模型                                   | 按 [ai_architecture.md](ai_architecture.md) 第 8.2 节处理；拒答率超过 5% 时提示 |
| `unsupported_output`   | 不支持结构化输出 | 探针或运行时 400 标明参数不支持                         | 同左                                                           | 同左                                                        | 这个模型不支持本作需要的输出格式，已改用较弱的格式。                     | 重新测试连接；换一个模型                     | 能力记录下移一条通道（第 3.5 节）                            |
| `bad_output`           | 输出常出错       | 连续 5 次解析或模式失败                                 | 同左                                                           | 同左                                                        | 这个模型的输出经常不合格式。                                             | 为该角色换更大的模型                         | 该角色的该模型按单角色降级处理                               |
| `keychain_unavailable` | 钥匙串不可用     | 桌面版存储后端不可用                                    | 同左                                                           | 同左                                                        | 系统钥匙串不可用，密钥只能保存到本次运行结束。                           | 了解原因；仍然使用（本次）                   | 密钥只存内存                                                 |
| `not_configured`       | 未配置           | 槽位为空、连接缺密钥                                    | 同左                                                           | 同左                                                        | 这个角色还没有可用的模型。                                               | 打开模型槽；打开角色绑定                     | 该角色内置 AI                                                |
| `cap_reached`          | 达到上限         | 记账簿                                                  | 同左                                                           | 同左                                                        | 已达到花费上限，相关角色改由内置 AI 驱动，世界照常运行。                 | 调整上限；打开消耗台账                       | 第 8.5 节                                                    |

识别以状态码与正文中的结构化错误类型或代码为主；"额度不足""上下文超长"等少数情形需要读正文里的说明字段，适配器对每条这类规则配一份录制的真实错误样本做测试，规则写在各适配器的 `classify` 里，不在别处做字符串匹配。

### 10.2 呈现规则

| 情境                                                           | 呈现                                                                                         |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 游玩中出现新问题                                               | 画面角落的非阻塞提示条：标题、说明、一个主修复按钮、"稍后"；不暂停、不弹模态窗                |
| 同一代码在多个角色或请求上出现                                 | 合并为一条，写"影响：女神、核心 NPC"                                                         |
| 已提示过的问题                                                 | 每次游玩只弹一次，之后只留在屏 A 的问题区，直到解决                                          |
| 自愈类（限流、繁忙、服务出错、超时）                           | 不弹提示条；只在屏 A 与台账出现；连续 10 现实分钟未恢复才弹一次                              |
| 问题解决                                                       | 屏 A 的条目消失；若曾弹过提示条，给一条"某连接已恢复"的轻提示                                |
| 序章、审庭等保留类场景进行中                                   | 提示条延后到场景结束再弹，避免打断                                                           |

修复按钮对应设置页的动作：打开屏 D、打开屏 C 的某字段、打开屏 E 的某槽位、打开屏 F 的某角色、打开屏 H、打开屏 G 并开始测试、显示本机服务指引、用系统浏览器打开提供方控制台（地址只取自价目表数据里的白名单）。

### 10.3 与降级的关系

问题只影响绑定到出错连接或模型的角色：这些角色先按第 4.3 节改道，改道不可行就转内置 AI；其他角色照常。全部连接都不可用时等同第 9 级。问题解决后，受影响的角色在下一请求起恢复，并走"回神轮"（第 13 节）。

## 11. 隐私

### 11.1 发出去的内容

只有绑定到云端连接的角色才会把题面发往该连接的地址；本机连接留在本机（局域网地址留在局域网）。

| 绑定角色     | 题面包含                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| 女神         | 规则段；人格卡与本幕可触及的私密真相切片；神之档案中关于玩家的观察；玩家的祈祷、对话与请托原话；账目与菜单         |
| 核心 NPC     | 人设卡；本人记忆与观察；玩家对其说的话；菜单                                                                         |
| 在场 NPC     | 人设卡、累积摘要、近两日计划与当日事件                                                                               |
| 离场批量     | 地区名册的短卡与当日轨迹                                                                                             |
| 统治者与将领 | 势力感知摘要、意图菜单、战场态势                                                                                     |
| 审庭评审     | 评审量规、玩家的审庭论述原话、证据清单                                                                               |

题面里以世界内称谓指代玩家。**从不发出**：账号名、Steam 编号、系统用户名、文件路径、硬件信息、其他连接的密钥、存档文件本身。提供方仍能看到请求来源的网络地址，这一点写进隐私说明。

### 11.2 本机保存

- **发布版不保存题面全文**（D-079 AQ-15）：审计记录只存分段长度与哈希，台账与网关日志不含文本。
- **开发者模式**只在内部通道构建（`internal`、`e2e`）里出现（[release_engineering.md](release_engineering.md) 第 2.4、2.6 节）：开启后审计记录保存题面与原始输出全文，供审计台与录制回放使用，开关处写明"保存的内容包含剧情秘密与原话"；它不会显示或保存任何密钥。Steam 各通道的构建里没有这个开关。
- **存档隐私**：开启后，会话折叠归档时把玩家原话替换为摘要（[ai_architecture.md](ai_architecture.md) 第 11.4 节）。
- **清除与删除**：见第 9.4 节。

### 11.3 首次启用云端连接的告知

某个云端连接第一次被任何角色使用之前，弹一次告知卡（屏 J 的摘要）：会发出哪些内容（上表）、发往哪里（连接地址）、费用由玩家自担并受上限约束、提供方的数据保留政策链接（价目表数据里登记的政策地址）、如何关闭；玩家点"同意并启用"后记入 `consentedConnectionIds`，取消则该连接不启用。

### 11.4 遥测与远程源

遥测默认关闭；开启时只上报不含文本的聚合指标（成本、延迟、降级级别、泄露扫描命中数），不含任何连接地址与模型名之外的配置。签名远程天启源（D-079 AQ-05）默认开启、可在屏 J 关闭；远程源只下发内容与出厂数据（价目表、已知型号表、预设推荐表），从不改写玩家的连接、绑定与上限。

## 12. 与开发期代理（D-059）的关系

| 项           | 开发代理（`tools/llm_proxy.ts`）                                         | 桌面网关（`desktop/llm_gateway/`，utility 进程）      | 网页试玩直连                         | 无头直连                                 |
| ------------ | ------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------ | ---------------------------------------- |
| 何时         | `npm run dev`                                                            | 发行版                                                | 网页试玩构建                         | 平衡、评估集、天启预演                   |
| 凭据         | 环境变量或 SDK 登录配置；兼容与本机的开发凭据在 `.local/llm_dev.json`    | 系统钥匙串                                            | 只有本机服务，令牌只在内存           | 环境变量                                 |
| Anthropic    | 官方 SDK（D-059）                                                        | 本方 Anthropic 适配器加 Electron `net` 模块           | 不可用                               | 本方 Anthropic 适配器加 Node `fetch`     |
| 兼容与本机   | 本方适配器                                                               | 本方适配器                                            | 本方本机适配器                       | 本方适配器                               |
| 设置来源     | 伪连接"开发代理"（槽位映射来自 `HAKONIWA_MODEL_TOP`、`_MID`、`_LOW`），也可在开发构建里用完整设置页 | 设置页                                    | 设置页                               | 命令行参数与配置文件                     |
| 守卫与记账   | 共用 `src/ai/gateway/`；只绑定本机                                       | 共用                                                  | 渲染进程预算器                       | 共用                                     |
| 发布构建     | 不包含（`tools/` 与 SDK 都不进包）                                       | 包含                                                  | 包含                                 | 不包含                                   |

- 开发代理的接口与网关同形：`POST /api/llm` 收 `LlmCallSpec` 返 `LlmCallResult`；`GET /api/llm/status` 返回伪连接的能力与槽位；新增 `POST /api/llm/test` 与 `GET /api/llm/models`，结果形状与 `ConnectionTestReport`、`ModelListing` 相同；错误一律带第 10 节的问题代码。
- **契约测试**：同一组中立规格夹具分别送进开发代理的 SDK 路径（`buildMessageParams`）与本方 Anthropic 适配器的 `build`，断言两者的请求体在约定字段上逐字段相等；SDK 升级或适配器改动都要过这条测试，保证开发期测到的行为就是发行版的行为。
- 发布构建检查：产物中不得出现 `@anthropic-ai/sdk` 与 `/api/llm` 字样（第 16 节）。

## 13. 与内置 AI 的切换

内置 AI 的规划器、台词包与话题图由 [builtin_ai.md](../40_design/systems/builtin_ai.md) 定义；这里只写接口与切换规则。

| 项             | 规则                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 接口           | 每个决策请求在发出的那一 tick 已由内置 AI 算好兜底（"兜底先算"，[ai_architecture.md](ai_architecture.md) 第 3.3 节）；模型只替换"提议"这一步（D-068）；两条路径共用同一套命令与内核裁决                                                    |
| 切到内置 AI    | 路由解析返回内置 AI 时，AI 层当场放弃该请求（即时放弃，落在发出后的下一 tick），原因写入台账：`role_builtin`（玩家选择）、`not_configured`、`connection_down`、`cap_*`、`degraded_*`                                                        |
| 确定性         | 即时放弃一律落在下一 tick，与帧率和倍速无关；所以"全部角色内置 AI"与"关闭预设"的世界演进逐 tick 相同，游玩中切换预设不破坏回放                                                                                                             |
| 游玩中切换     | 下一请求起生效；被切到内置 AI 的角色会话冻结；切回模型时该角色下一轮是"回神轮"（新分段，附切换期间的经历摘要，[ai_architecture.md](ai_architecture.md) 第 9.6 节）                                                                          |
| 交谈进行中切换 | 正在进行的那场交谈用原驱动说完当前一轮，下一轮起按新驱动；女神会话轮同理                                                                                                                                                                  |
| 世界模式       | 发行版的世界一律以"外部"模式运行（`AiMode` 为 `external`），由路由决定每个请求走模型还是内置 AI；`off` 模式只留给没有 AI 桥的无头回归                                                                                                      |
| 台词来源标记   | 屏 J 的"显示台词来源"开启时，对话框角落写"模型"或"预写"，默认关闭                                                                                                                                                                         |

## 14. 现有代码的改造清单

| 文件或符号                                                     | 现状                                                                     | 改造                                                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ai/contracts.ts` 的 `LlmRequest`                          | 只有档位，没有连接与模型                                                 | 演进为 `LlmCallSpec`：加 `connectionId`、`model`、`slot`、`bindingRole`、`reserve`、`stream`；`ModelTier` 保留作槽位名                                                         |
| `src/ai/contracts.ts` 的 `LlmErrorCode`                        | 错误代码按开发代理的情形划分                                             | 保留适配器错误类；新增问题代码类型 `ProblemCode`（第 10.1 节）及映射；`no_proxy`、`no_credentials` 归入 `not_configured`，`auth_failed` 拆为 `key_invalid` 与 `permission_denied` |
| `src/ai/providers.ts` 的 `ProxyProvider`                       | 只会调 `/api/llm`，档位到模型由代理决定                                  | 换成 `providers/transport_provider.ts` 的 `TransportProvider`，注入 `LlmTransport`；`/api/llm/status` 的探测迁到 `DevProxyTransport`                                          |
| `src/ai/providers.ts` 的 `NullProvider`、`MockProvider`、`readUsage` | 可用                                                               | 迁入 `providers/` 目录；`MockProvider` 增加按连接与模型的脚本键，供路由测试                                                                                                   |
| `src/ai/pricing.ts`                                            | 价目、可调用白名单、默认档位映射写死在代码里                             | 价目与已知型号移到 `data/llm/price_book.json`、`known_models.json`，代码只留 `costUsd`、`estimateTokens`、`estimateCallUsd`；`CALLABLE_MODELS` 换成"连接的启用模型列表"；`DEFAULT_TIER_MODELS` 换成预设表 |
| `src/ai/budget.ts` 的 `Budget`                                 | 一个小时窗口、可选总额、五级降级                                         | 三个窗口（小时、日、局）、金额与 token 两种口径、`DegradeLevel` 扩为 0 到 9 并配第 8.5 节阈值、份额按绑定角色；日期键与存档线编号由宿主注入；快照增加每角色驱动与原因        |
| `src/ai/runner.ts` 的 `AiRunner`                               | 单一提供方、单一熔断、档位来自角色包或 `roleTiers`                       | 加路由解析（第 4.3 节）与按连接的健康度；`provider` 换成 `providers: Map<连接编号, LlmProvider>`；新增放弃原因 `role_builtin`、`not_configured`、`connection_down`；交互类走流式与首句回调 |
| `src/ai/roles.ts` 的 `RolePack`                                | 有 `tier`                                                                | 加 `bindingRole` 与 `highestTier`（序章、审庭、终章记录）；`tier` 作为标准倾向的默认档位                                                                                     |
| `src/game/ai_roles/`                                           | 现有角色包与通用包 `*`                                                   | 每个包标注绑定角色（第 4.2 节）；新增 `court_review.ts`（审庭评审）；`scene.improv` 标 `highestTier`                                                                         |
| `src/client/app/ai_bridge.ts` 的 `AiBridge`                    | 一个开关，启动时探测代理，改设置需重开世界                               | 读 `LlmSettings`，按平台选传输（桌面 `IpcTransport`、开发 `DevProxyTransport`、网页 `LocalHttpTransport`）；设置变更即时生效；世界一律 `external`；对外提供每角色驱动、问题列表、记账快照 |
| `src/client/windows/window_context.ts` 的 `ClientSettings`、`AiStatusView` | 开关与单一预算                                                | 扩展为设置读写、问题订阅、台账读取、测试调用；`AiStatusView` 加每角色驱动与原因、三个窗口的已用与上限                                                                       |
| `src/client/windows/settings_window.ts`                        | 一个复选框与状态行                                                       | "大模型"页换成进入 `src/client/windows/llm/` 的屏 A；画质与视角部分不变                                                                                                     |
| `src/shared_ui/text_play.ts` 的 `settings` 文本                | 含"需重启""代理不可用"等文案                                             | 迁出到 `src/shared_ui/text_llm.ts`，按本文改写；删去"需重启"类文案                                                                                                           |
| `tools/llm_proxy.ts`                                           | SDK 调 Anthropic，档位由环境变量决定                                     | 保留 SDK 路径；接受新规格；增加兼容与本机后端（共用适配器）；错误改报问题代码；`status` 返回能力报告                                                                         |
| `tools/dev_api.ts`                                             | `/api/llm`、`/api/llm/status`                                            | 增加 `/api/llm/test`、`/api/llm/models`；仍只服务本机                                                                                                                        |
| 新增 `src/ai/llm_config/`、`src/ai/gateway/`、`desktop/llm_gateway/`、`desktop/key_entry/`、`src/client/net/llm_transport.ts`、`data/llm/` | 无                                          | 按第 2.2 节                                                                                                                                                                  |

## 15. 实现步骤

| 里程碑               | 交付                                                                                                                                                                                                                                                         | 验收                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| M0 基线与管线        | 契约演进（`LlmCallSpec`、问题代码）；三个适配器与模式方言改写；能力表与价目表数据；`TransportProvider` 与三种传输；路由解析；预算器三窗口与 0 到 9 级；开发代理升级；模拟、录制回放、故障注入三类替身                                                          | 第 16 节自动化测试中标 M0 的全部通过；无模型档序章通关（VS-01 子集）                        |
| M1 垂直切片          | 桌面网关与密钥录入窗；设置页屏 A 到屏 J；连接测试快速档；花费估算与上限；问题提示条；消耗台账；首次告知；网页试玩版的本机直连                                                                                                                                  | 真机矩阵（第 16.3 节）的 Anthropic、一个兼容服务、Ollama 三项通过；VS-05 成本阈值按切片登记 |
| M2 Alpha             | 深度测试与测验小镇；本机承载率；流式首句显示；LM Studio 与 llama.cpp 服务适配；Linux 钥匙串检测；台账剧透安全标签全量                                                                                                                                          | 真机矩阵全部通过；首句显示的首字延迟达标                                                   |
| M3 Beta              | 价目表与已知型号表随内容版本更新的流程；服务端回退统计；Steam 云同步排除清单；隐私说明与提供方政策链接；手柄与屏幕键盘全流程                                                                                                                                  | 发布门的隐私与合规材料就绪；手柄完成全部设置流程                                           |
| M4 内容完成与打磨    | 文案审校（问题文案、告知卡）；估算器按 PT-03 与 Beta 实测校准出厂默认值；无障碍复查                                                                                                                                                                          | 实测与估算差异在三成以内                                                                   |
| M5 发布（1.0）       | 发布构建检查（无 SDK、无开发接口）；密钥守卫全量扫描；默认预设为关闭                                                                                                                                                                                         | 第 16 节全部通过；发布门                                                                   |
| M6 发布后（1.x）     | 新提供方或新服务种类只需新增适配器与已知型号条目；繁体中文与英文的文案                                                                                                                                                                                        | 新适配器过同一套适配器测试                                                                 |

## 16. 验收与测试

### 16.1 替身

| 替身                     | 行为                                                                                                                                              | 用途                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 模拟提供方（Mock）       | 按（连接，模型，决策类别，轮次）脚本作答；记录收到的规格                                                                                          | 路由、绑定、预设、降档与改道               |
| 回声（Echo）             | 把请求自带的兜底包装成提议返回（[ai_architecture.md](ai_architecture.md) 第 13 节）                                                               | 全链路零成本；切换与回放一致性             |
| 录制回放（Cassette）     | 录制模式下透传真实请求，把"规范化请求体哈希到响应"写成录制带（脱敏：去鉴权头、去密钥、去请求号）；回放模式按哈希返回，未命中即测试失败            | 适配器解析、用量归一、错误分类的真实样本   |
| 故障注入（Fault）        | 按配置在某连接上制造第 10.1 节的每一种问题（状态码、正文、超时、断流、半截 JSON、慢回复、证书错误、重定向、跨域失败）                             | 问题分类、提示条、降级与恢复               |
| 假钥匙串（FakeKeystore） | 可切换"可用""只能内存""写入失败"                                                                                                                  | 密钥生命周期与 `keychain_unavailable`      |

录制带放在 `tests/fixtures/llm_cassettes/`，每家提供方至少一组：成功（各输出通道）、流式、用量变体、以及第 10.1 节每个可识别问题的错误样本；录制带由开发者用自己的密钥录制，入库前过密钥扫描。

### 16.2 自动化测试

| 测试文件                              | 断言                                                                                                                                                                                            | 里程碑 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `tests/llm_adapters.test.ts`          | 三个适配器对同一组规格的请求体与金样逐字节一致（每个输出通道一份）；录制带回放解析出的文本、停止原因、用量与金样一致；每个问题代码在适用的提供方上至少一份样本被正确分类 | M0     |
| `tests/llm_schema_dialect.test.ts`    | 每个角色包的输出模式经三种方言改写后仍是合法模式；被剥离的约束在本方校验里仍会拒绝违规输出；本机变体每次至多一条调用                                                       | M0     |
| `tests/llm_capabilities.test.ts`      | 探针结果到能力记录的解读；通道降级顺序；`unsupported_output` 连续三次后下移一条通道                                                                                             | M0     |
| `tests/llm_settings.test.ts`          | 四种预设生成的槽位与绑定；地址校验（云端必须 HTTPS、HTTP 只限回环与私有网段、网页试玩只限回环、不允许内嵌口令）；旧开关迁移；更高版本设置只读                              | M0     |
| `tests/llm_routing.test.ts`           | 每个决策类别解析到第 4.2 节的绑定角色与档位；三种倾向；最高档类别；空槽的就近查找；按连接熔断后的改道链；内置 AI 绑定当场放弃并在下一 tick 执行兜底                         | M0     |
| `tests/llm_budget.test.ts`            | 小时、日、局三窗口，金额与 token 两口径；阈值到级别的映射与滞回回落；随机用量下"已结算加在途预留不超过上限"恒成立；单次预留过大先降档后放弃；日期变更与存档线编号；测试请求不受上限 | M0     |
| `tests/llm_estimate.test.ts`          | 估算器对 Anthropic 各预设第一、二、四幕的每现实小时结果与第 8.2 节表格相差不超过 0.01 美元；全程上限估算与表格一致；实测校准的指数平滑                                    | M0     |
| `tests/llm_gateway.test.ts`           | 守卫六项各有通过与失败用例；规格里的地址与请求头被拒；重定向不跟随；错误正文脱敏；以假钥匙串运行时，全部 IPC 返回值、日志行、台账与审计记录中扫描不到密钥原文（只允许出现末四位） | M1     |
| `tests/llm_fault.test.ts`             | 对每个问题代码注入故障：问题出现在状态视图且文本键与修复动作正确；受影响角色改道或转内置 AI，其他角色照常；世界 tick 持续推进；故障解除后恢复并走回神轮                    | M1     |
| `tests/llm_record_replay.test.ts`     | 用录制带跑一个游戏日的脚本化游玩，提议与世界哈希和录制时一致；录制带中没有密钥形态的字符串                                                                                       | M1     |
| `tests/llm_switch.test.ts`            | 回声提供方跑两个游戏日，中途把预设切到关闭再切回；世界不停表；命令日志回放的世界哈希一致；"全部角色内置 AI"与"关闭"在同种子同输入下逐 tick 哈希一致                         | M1     |
| `tests/llm_ledger.test.ts`            | 台账字段与状态；剧透安全标签（第 9.3 节）对每幕夹具过泄露扫描，命中为零；导出 CSV 不含文本                                                                                       | M2     |
| `tests/llm_stream.test.ts`            | `extractSpeechPrefix` 对分段到达的 JSON 取出首句；闸门不过的首句不显示；全文被丢弃时触发撤回                                                                                    | M2     |
| `tests/llm_dev_proxy_contract.test.ts`| 开发代理 SDK 路径与本方 Anthropic 适配器的请求体逐字段相等                                                                                                                      | M0     |
| `tests/architecture.test.ts`（追加）  | `src/ai/providers/`、`src/ai/llm_config/`、`src/ai/gateway/` 不引用网络、DOM、Electron；源码与夹具中无密钥形态字符串                                                             | M0     |
| 发布构建检查（发行工程的门）          | 产物不含 `@anthropic-ai/sdk` 与 `/api/llm`；网页试玩产物里云端连接类型不可构造                                                                                                  | M5     |

桌面壳一侧的通道清单、密钥存储与网关端到端流式对话另由发行工程的 `tests/desktop_ipc_surface.test.ts`、`tests/desktop_secrets.test.ts` 与桌面端到端测试钉住（[release_engineering.md](release_engineering.md) 第 2.3、2.5 节）；本节的 `tests/llm_gateway.test.ts` 在 Node 中直接测网关的守卫与记账模块，不启动 Electron。

### 16.3 真机矩阵（人工，每个里程碑的发布候选跑一次）

| 连接                         | 检查                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Anthropic                    | 快速与深度测试；分档·标准玩 30 分钟；台账金额与提供方控制台用量核对，差异不超过 5%；服务端回退统计出现         |
| 一个兼容云服务               | 四个输出通道中至少一个可用；人民币计价与显示换算；限流与余额不足的提示（用低额度账户）                           |
| Ollama                       | 原生接口、`num_ctx`、承载率；服务未启动与模型未拉取的提示                                                      |
| LM Studio、llama.cpp 服务    | 兼容接口与 `json_schema`；未加载模型的提示                                                                     |
| 网页试玩版                   | 只有关闭与本机可选；跨域未放行时的提示与指引                                                                   |
| Linux 无密钥服务             | "仅本次运行"与提示                                                                                             |
| 断网与拔掉本机服务           | 世界不停表；角色转内置 AI；恢复后回神                                                                          |

## 17. 本文落定的设计选择

| 问题                                     | 决定                                                                                         | 理由                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 本机预设下女神由谁驱动                   | 默认内置 AI，可手动设为本机高档                                                              | 女神对上下文、吞吐与人格稳定要求最高；AQ-10 建议云端；内置 AI 是完整体验                       |
| 单模型预设推荐哪个 Anthropic 型号        | `claude-haiku-5-5`，质量优先时 `claude-sonnet-5-5`                                           | 单模型下全部请求同价，Sonnet 约贵二十倍；要质量应选分档                                        |
| 节省倾向的"最高档"                       | 节省倾向不放高档槽，最高档即中档                                                             | 让 AQ-18 的"最高档"字面成立，同时让节省名副其实（序章与审庭约省一半）                           |
| "每局"的口径                             | 新游戏起的整条存档线，记在本机记账簿，读档不回退                                             | 存档内计数会因读档倒回，起不到上限作用                                                         |
| "每日"的口径                             | 本地日历日，跨所有存档                                                                       | 玩家理解的"今天花了多少"                                                                       |
| 上限如何保证不被越过                     | 预留按整段输出上限计；90% 只留保留类，100% 全部内置 AI；单次预留不超过小时上限一成           | 保留类用的是预留的最后一成，上限是硬上限                                                       |
| 密钥录入是否经过游戏渲染进程             | 不经过：独立小窗，粘贴由主进程读剪贴板                                                       | "渲染进程拿不到密钥"要对录入时刻同样成立                                                       |
| Linux 没有密钥服务                       | 只存内存，标"仅本次运行"                                                                     | 明文落盘违背"密钥只存本机钥匙串"                                                               |
| 网页试玩版的本机令牌                     | 只存页面内存                                                                                 | D-081 不接受云端密钥；本机令牌也不写浏览器存储，最稳                                           |
| 网关用什么发请求                         | Electron `net` 模块，不跟随重定向                                                            | 跟随系统代理与证书库；重定向可能把鉴权头带去别的主机                                           |
| HTTP 地址                                | 只允许回环与私有网段                                                                         | 云端明文会泄露密钥                                                                             |
| 发行版是否用官方 SDK                     | 不用；本方 Anthropic 适配器加契约测试                                                        | D-059 限定 SDK 只在开发代理；四个适配器一套接口                                                |
| 流式首句何时显示                         | 首句通过话语闸门的专名与禁区检查后                                                           | 未经检查就显示可能剧透                                                                         |
| 台账如何避免剧透                         | 行动者按称谓开放表与已知实体出标签                                                           | 台账是玩家界面，"雅努入夜轮"之类的条目会提前泄露                                               |
| 角色适配测验的题目                       | 虚构的测验小镇，不含正典                                                                     | 玩家可在网络工具里看到测验题面                                                                 |
| 价目从哪里来                             | Anthropic 与已知型号随内容版本发布，玩家可覆盖；兼容服务由玩家填写                           | 价目会变，写死在代码里会过时                                                                   |
| 设置改动何时生效                         | 下一请求起，不需重启                                                                         | 即时放弃落在下一 tick，切换不破坏确定性                                                        |
| 远程源能否改玩家配置                     | 不能，只下发内容与出厂数据                                                                   | 连接、绑定、上限是玩家的（D-067）                                                              |

## 18. 来源链接

| 结论                                             | 来源                                                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 玩家自配、按居民绑定模型、密钥只存本机           | [my_ai_town_agents.md 第 7.6 节](../10_research/ai_npc/my_ai_town_agents.md)；D-067                                                                                          |
| 本机结构化输出变体（不发原生工具、压平、采样）   | [my_ai_town_agents.md 第 2.6 节](../10_research/ai_npc/my_ai_town_agents.md)                                                                                                 |
| 错误按状态与正文归类并给修复按钮                 | [my_ai_town_agents.md 第 7.5 节](../10_research/ai_npc/my_ai_town_agents.md)（`HoldCause`）                                                                                  |
| 失败回退与"本作不停表"的差异                     | [my_ai_town_agents.md 第 1.2.4 节](../10_research/ai_npc/my_ai_town_agents.md)；D-036                                                                                        |
| 预留后结算、用量校准、缓存命中记账               | [my_ai_town_agents.md 第 7.3 节](../10_research/ai_npc/my_ai_town_agents.md)                                                                                                 |
| 消耗台账（最近 500 条）                          | [my_ai_town_agents.md 第 8.1 节](../10_research/ai_npc/my_ai_town_agents.md)                                                                                                 |
| 提供方适配接口与凭据隔离                         | [woc_ai_npc.md 第 2.5 节](../10_research/ai_npc/woc_ai_npc.md)                                                                                                               |
| 模型分档与本地小模型                             | [comparison_and_plan.md 第 6.6 节](../10_research/ai_npc/comparison_and_plan.md)                                                                                             |
| 计价公式、请求量、缓存假设、降级阶梯             | [ai_architecture.md](ai_architecture.md) 第 9、10 节                                                                                                                         |
| 分级与请求量的设计口径                           | [npc_society_ai.md](../40_design/systems/npc_society_ai.md) 第 1、13 节；[goddess_gm.md](../40_design/systems/goddess_gm.md) 第 6 节                                       |
| 现有实现                                         | `src/ai/providers.ts`、`src/ai/budget.ts`、`src/ai/pricing.ts`、`src/ai/runner.ts`、`src/client/app/ai_bridge.ts`、`tools/llm_proxy.ts`、`tools/dev_api.ts`、`src/client/windows/settings_window.ts` |
| Anthropic Messages API                           | https://docs.anthropic.com                                                                                                                                                   |
| OpenAI 兼容 chat/completions                     | https://platform.openai.com/docs/api-reference/chat                                                                                                                          |
| Ollama 接口                                      | https://github.com/ollama/ollama/blob/main/docs/api.md                                                                                                                       |
| LM Studio 本机服务                               | https://lmstudio.ai/docs                                                                                                                                                     |
| llama.cpp 服务                                   | https://github.com/ggml-org/llama.cpp/tree/master/tools/server                                                                                                               |
| Electron 加密存储与上下文隔离                    | https://www.electronjs.org/docs/latest/api/safe-storage 、https://www.electronjs.org/docs/latest/tutorial/context-isolation                                                  |
