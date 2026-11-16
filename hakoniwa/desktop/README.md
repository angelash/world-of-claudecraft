# desktop/：桌面壳

《箱庭纪》的 Electron 桌面壳（D-081）。设计依据：`docs/50_tech/release_engineering.md` 第 2、3 节，`docs/50_tech/llm_providers.md` 第 5.5、6、7 节。
Electron 用仓库根目录安装的版本（`../node_modules/electron`），不在本子项目登记依赖。

## 命令

- `npm run desktop:dev`：构建游戏（`dist/`）与桌面壳（`desktop/dist/`），再用 Electron 打开。首次运行时 Electron 包会自动下载一次可执行文件。
- `npm run build:desktop`：只构建桌面壳；esbuild 把每个入口打成单个 CommonJS 文件，`electron` 是唯一的外部依赖。
- 端到端调试：`HK_CHANNEL=e2e npm run desktop:dev -- --remote-debugging-port=9333`。只有 `e2e` 通道接受远程调试参数，其他通道见到它即退出。
- `npm run pack:win`：未签名的 Windows x64 目录包，输出 `release/win-unpacked/HakoniwaChronicle.exe`（`release/` 不入库）。它先跑 `npm run build:release`（只含游戏入口的发布构建，编辑器不进包，产物扫描见 `tools/release_bundle.ts`）与 `npm run build:desktop`，再由 `pack.ts` 打包：`dist/` 不是发布构建（有编辑器页面，或出现 `/api/llm` 等开发服务路由、`@anthropic-ai/sdk`）即失败；把 `package.json`、`dist/`（不含 `editor.html`）、`desktop/dist/` 按原样布局放进 `release/app/`，用仓库根目录的 `electron-builder` 与根目录已解包的 Electron（不下载）打成 asar，经 `extraMetadata` 盖 `hkBuild` 章（版本、提交短哈希、通道），按 `RELEASE_FUSES` 设熔断位，最后从可执行文件读回熔断位逐项比对，不一致即失败。通道默认 `internal`，`npm run pack:win -- --channel e2e` 打出可远程调试的包（打包构建只认盖章，不认 `HK_CHANNEL`）。

## 文件

| 文件 | 作用 | 纯逻辑（可单测） |
| --- | --- | --- |
| `main.ts` | 主进程入口，只把真实的 Electron 交给 `shell.ts` | 否 |
| `app_paths.ts` | 应用根目录的布局（`package.json`、`dist/`、`desktop/dist/`）与路径解析：开发时相对主进程包，打包后取 `app.getAppPath()`（asar） | 是 |
| `shell.ts` | 生命周期、用户数据目录、单实例、`app://` 协议、权限与导航封锁、游戏窗口、通道注册、密钥录入窗、网关 | 注入 Electron，测试用假实现驱动 |
| `security.ts` | 第 2.6 节安全清单：协议权限、`webPreferences`、内容安全策略、权限白名单、导航与新窗口规则、发送方核对、外链白名单、构建通道、熔断位 | 是 |
| `app_protocol.ts` | `app://hakoniwa`（游戏）与 `app://key-entry`（录入窗）到文件的映射，无回退页，每个响应带内容安全策略 | 是 |
| `paths.ts` | 用户数据目录 `HakoniwaChronicle` 与其下的设置、密钥、台账、日志、存档路径；文件名规则；槽位、局编号与哈希的规则直接取自存档头 `src/core/save/header.ts`（只有一份） | 是 |
| `settings.ts` | 设置文件 `settings.sync.json`、`settings.local.json`：启动时同步读入并缓存，按分区排队写临时文件、落盘后改名；损坏的文件改名为 `.bad` 后按默认值；更新版本写的文件只读不写；逐字段校验用渲染进程同一份 `src/client/app/settings_schema.ts`，`llm` 分区用 `src/ai/llm_config/migrate.ts`；窗口与安装 ID 两个字段只由壳写（页面写入时保留壳的值）；页面送来的"更新版本"`llm` 分区不被信任 | 是（文件读写可注入） |
| `saves.ts` | 文件存档：`ContainerBackend` 跑在 `NodeFsStorage(<userData>/saves)` 上，每个操作都记账，退出时可等在途存档提交 | 是 |
| `window_state.ts` | 窗口的记忆：首次启动打包版全屏、开发运行窗口；之后用玩家上次选的模式，窗口模式记位置与大小，显示器不在时回到主显示器 | 是 |
| `logging.ts` | 日志脱敏与 5MB 轮转 | 是 |
| `rate_limit.ts` | 通道频率上限 | 是 |
| `ipc/names.ts`、`ipc/channels.ts` | `hk:*` 通道白名单：方向、载荷校验、体积与频率上限 | 是 |
| `ipc/validate.ts` | 手写校验器，错误信息从不回显被拒的值 | 是 |
| `ipc/guard.ts` | 主进程一级守卫：发送方、频率、参数个数、体积、载荷 | 是 |
| `ipc/handlers.ts` | 各通道的处理器 | 是（依赖注入） |
| `bridge.ts`、`preload.ts` | `window.hk`：每条通道一个具名方法，没有通用调用入口 | `bridge.ts` 是 |
| `llm_gateway/` | 大模型网关 utility 进程：`protocol.ts` 消息与二级守卫的信封校验，`core.ts` 网关逻辑，`client.ts` 主进程侧，`main.ts` 进程入口 | 除 `main.ts` 外是 |
| `key_entry/` | 独立密钥录入窗：静态页面、只暴露提交、粘贴、取消的预载、主进程侧控制器与密钥校验 | `rules.ts`、`controller.ts` 是 |
| `pack_config.ts` | `pack:win` 的 electron-builder 配置、暂存包的 `package.json`、`hkBuild` 盖章、熔断位读回比对 | 是 |
| `build.ts`、`launch.ts`、`pack.ts` | 构建、启动与打包脚本（Node 直接运行；`pack.ts` 经 Vite 模块运行器加载 `pack_config.ts` 与 `tools/release_bundle.ts`） | 否 |

## 已接通与未接通

- 设置 `hk:settings.*`（PK-M0-20）：`settings.ts`；读不了的文件（不是缺失也不是损坏）回答 `unavailable`，页面不会写它。壳另把窗口位置、大小、
  全屏选择（F11、Alt+Enter、`hk:window.mode`）写进本机份，启动时据此开窗；本机份的 `gpu` 为 `system` 时不加高性能显卡开关（救援仍可用 `HK_DISABLE_GPU_FORCE=1`）。
  帧率上限只有页面一个写入方（经 `hk:settings.set` 存进本机份）；`hk:window.frameCap` 只让壳按它运行，壳启动时从存下的值开始。
  退出前等在途存档提交与设置写完（至多 10 秒，2.7）。
- 存档 `hk:save.*`：主进程里的 `ContainerBackend` 跑在 `NodeFsStorage(<userData>/saves)` 上，写入方编号是 `w-` 加本机份的安装 ID（首次启动生成），写入方名称是主机名；
  返回值就是容器自己的结果（失败也作为值返回），与 `src/platform/desktop_host.ts` 的解析一致。`hk:save.importDemo`（试玩存档导入，4.9）仍回答 `not_implemented`。
- 大模型请求的连接核对（7.4 第 3 项）读本机份的 `llm` 分区：连接存在且至少有一个启用的模型才转给网关。

以下通道已有白名单与载荷校验，处理器先回答 `not_implemented`，由后续包填入：
Steam `hk:steam.*`（PK-M2-02）、诊断与崩溃 `hk:diag.*`、`hk:crash.send`（PK-M2-03）、`hk:save.importDemo`。
大模型网关只有通道与两级守卫：主进程核对来源、形状与体积、连接编号；网关复核信封与规格并在内存中保存本次运行录入的密钥。
提供方适配、守卫第 4 到 6 项、记账簿、`safeStorage` 落盘与台账属于 PK-M1-01。
渲染进程侧的平台接口 `PlatformHost` 在 `src/platform/`（桌面实现包装 `window.hk`，类型取自 `bridge.ts`）；客户端入口 `src/client/app/main.ts` 用 `selectPlatformHost` 选实现，存档、设置与大模型都经它走。
签名、图标与夜间流水线的打包冒烟属于 PK-M1-09。

测试：`tests/desktop_security.test.ts`、`tests/desktop_ipc.test.ts`、`tests/desktop_storage_layout.test.ts`、`tests/desktop_pack.test.ts`、`tests/desktop_settings.test.ts`（设置文件、窗口记忆、存档处理器；假 Electron 在 `tests/desktop_fakes.ts`）。
