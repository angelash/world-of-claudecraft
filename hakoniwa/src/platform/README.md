# src/platform/：平台接口

渲染进程侧的平台接口 `PlatformHost`（`docs/50_tech/release_engineering.md` 第 2.2 节）：存档、设置、大模型、成就、诊断、窗口。
只有 `src/client/` 引用本目录；`src/core/`、`src/systems/`、`src/game/`、`src/ai/` 不得引用它，本目录也不引用 `src/client/`（`tests/architecture.test.ts` 的平台层守卫）。

| 文件 | 内容 |
| --- | --- |
| `host.ts` | 接口与共用类型：`PlatformHost`、`SettingsBackend`、`PlatformLlm`、`AchievementSink`、`PlatformDiagnostics`、`PlatformWindow`、`PlatformDurability`（存档与设置是否活过本页：桌面恒为是，网页在没有 IndexedDB 或本地存储时为否，标题画面据此提示）；桌面类型只以 `import type` 取自 `desktop/bridge.ts` |
| `desktop_host.ts` | 桌面实现：逐成员映射到 `window.hk` 的具名方法；存档直通 `hk:save.*`，通道拒绝变成与进程内存档容器同形的失败 |
| `web_host.ts` | 网页实现：存档是同一个存档容器跑在 IndexedDB 上（没有时退回内存；每个标签页的临时文件名带各自的随机标记），设置是本地存储里的 JSON，大模型只许本机地址，没有成就与诊断包 |
| `memory_host.ts` | 测试实现：固定时钟与写入方，存档容器跑在 `MemoryStorage` 上（可注入断电），脚本化的大模型网关替身，记录每个副作用 |
| `select.ts` | 有 `window.hk` 选桌面实现，否则选网页实现 |
| `index.ts` | 对客户端的公开面（不含测试实现） |

设置的结构、默认值、逐字段校验、版本与迁移不在本目录：它们在 `src/client/app/settings_schema.ts`（纯逻辑，桌面主进程的 `desktop/settings.ts` 也用它复核），
渲染进程经 `src/client/app/settings_store.ts` 的 `SettingsStore` 读写 `PlatformHost.settings`；本目录的设置后端只负责按分区存取 JSON。

大模型：桌面是 `{ route: 'gateway', gateway }`，`gateway` 就是 `window.hk.llm`；网页是 `{ route: 'loopback', endpointAllowed }`。
传输层（`IpcTransport`、`LocalHttpTransport`）在 `src/ai/`（PK-M0-24），建在这两种形态之上。

测试：`tests/platform_host.test.ts`（假 `ipcRenderer`、本地存储与 IndexedDB 在 `tests/platform_fakes.ts`）。
