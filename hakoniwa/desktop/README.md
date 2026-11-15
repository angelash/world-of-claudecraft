# desktop/：桌面壳

《箱庭纪》的 Electron 桌面壳（D-081）。设计依据：`docs/50_tech/release_engineering.md` 第 2、3 节，`docs/50_tech/llm_providers.md` 第 5.5、6、7 节。
Electron 用仓库根目录安装的版本（`../node_modules/electron`），不在本子项目登记依赖。

## 命令

- `npm run desktop:dev`：构建游戏（`dist/`）与桌面壳（`desktop/dist/`），再用 Electron 打开。首次运行时 Electron 包会自动下载一次可执行文件。
- `npm run build:desktop`：只构建桌面壳；esbuild 把每个入口打成单个 CommonJS 文件，`electron` 是唯一的外部依赖。
- 端到端调试：`HK_CHANNEL=e2e npm run desktop:dev -- --remote-debugging-port=9333`。只有 `e2e` 通道接受远程调试参数，其他通道见到它即退出。

## 文件

| 文件 | 作用 | 纯逻辑（可单测） |
| --- | --- | --- |
| `main.ts` | 主进程入口，只把真实的 Electron 交给 `shell.ts` | 否 |
| `shell.ts` | 生命周期、用户数据目录、单实例、`app://` 协议、权限与导航封锁、游戏窗口、通道注册、密钥录入窗、网关 | 注入 Electron，测试用假实现驱动 |
| `security.ts` | 第 2.6 节安全清单：协议权限、`webPreferences`、内容安全策略、权限白名单、导航与新窗口规则、发送方核对、外链白名单、构建通道、熔断位 | 是 |
| `app_protocol.ts` | `app://hakoniwa`（游戏）与 `app://key-entry`（录入窗）到文件的映射，无回退页，每个响应带内容安全策略 | 是 |
| `paths.ts` | 用户数据目录 `HakoniwaChronicle` 与其下的设置、密钥、台账、日志、存档路径；槽位、局编号、哈希与文件名规则（供存档容器与设置存储使用） | 是 |
| `logging.ts` | 日志脱敏与 5MB 轮转 | 是 |
| `rate_limit.ts` | 通道频率上限 | 是 |
| `ipc/names.ts`、`ipc/channels.ts` | `hk:*` 通道白名单：方向、载荷校验、体积与频率上限 | 是 |
| `ipc/validate.ts` | 手写校验器，错误信息从不回显被拒的值 | 是 |
| `ipc/guard.ts` | 主进程一级守卫：发送方、频率、参数个数、体积、载荷 | 是 |
| `ipc/handlers.ts` | 各通道的处理器 | 是（依赖注入） |
| `bridge.ts`、`preload.ts` | `window.hk`：每条通道一个具名方法，没有通用调用入口 | `bridge.ts` 是 |
| `llm_gateway/` | 大模型网关 utility 进程：`protocol.ts` 消息与二级守卫的信封校验，`core.ts` 网关逻辑，`client.ts` 主进程侧，`main.ts` 进程入口 | 除 `main.ts` 外是 |
| `key_entry/` | 独立密钥录入窗：静态页面、只暴露提交、粘贴、取消的预载、主进程侧控制器与密钥校验 | `rules.ts`、`controller.ts` 是 |
| `build.ts`、`launch.ts` | 构建与启动脚本（Node 直接运行） | 否 |

## 骨架的边界

本目录目前是骨架（PK-M0-21）。以下通道已有白名单与载荷校验，处理器先回答 `not_implemented`，由后续包填入：
存档 `hk:save.*`（PK-M0-16）、设置 `hk:settings.*`（PK-M0-20）、Steam `hk:steam.*`（PK-M2-02）、诊断与崩溃 `hk:diag.*`、`hk:crash.send`（PK-M2-03）。
大模型网关只有通道与两级守卫：主进程核对来源、形状与体积、连接编号；网关复核信封与规格并在内存中保存本次运行录入的密钥。
提供方适配、守卫第 4 到 6 项、记账簿、`safeStorage` 落盘与台账属于 PK-M1-01。游戏侧的 `PlatformHost` 接入属于后续包，游戏代码不知道自己运行在桌面壳里。

测试：`tests/desktop_security.test.ts`、`tests/desktop_ipc.test.ts`、`tests/desktop_storage_layout.test.ts`（假 Electron 在 `tests/desktop_fakes.ts`）。
