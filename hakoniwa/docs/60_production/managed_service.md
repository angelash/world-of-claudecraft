# 常驻游戏服务与可打断重启

《箱庭纪》由 Windows 服务 `HakoniwaGame` 常驻，启动类型为 Automatic，系统启动时自动运行。
服务入口固定 `http://localhost:5180/`，编辑器为同端口 `/editor.html`。允许局域网读取游戏页面，
重启控制只允许服务本机，开发 API 保留原本的本地权限。不会静默改端口或结束无关进程。

## 安装与日常操作

首次在管理员 PowerShell 执行：

```powershell
cd F:\workspace\github\world-of-claudecraft\hakoniwa
powershell -NoProfile -ExecutionPolicy Bypass -File tools/service/windows_service.ps1 install
```

脚本下载 WinSW 2.12.0 x64，核对固定 SHA256，再注册非管理员 LocalService 账户的服务。
只有 `.local/service/` 的状态、日志和 Vite 缓存可写，项目代码只读。配置与依赖加载不写 node_modules。
SCM 对宿主意外退出执行十秒后的恢复启动。首次安装需要 Windows 管理员权限，普通常驻 Node 进程
不能算注册成功。以 `Get-CimInstance Win32_Service -Filter "Name='HakoniwaGame'"` 的真实结果核验。

```powershell
npm run service:status
npm run service:restart -- "本阶段逻辑已验证"
```

重启命令等待结果。正常完成退出码 0，用户打断退出码 3，失败退出码 1。
实现中的代理宿主持续占有公开端口，倒计时和控制通道不随内部 Vite 工作进程重启中断。
服务恢复后不会自动刷新游戏页面，玩家先保存进度，再刷新以载入新代码。

## 用户打断的约束

每次计划重启先显示 Web 弹窗，倒计时五秒。选择“打断重启”或在倒计时弹窗按 Escape 后，
状态先写盘再回执。弹窗显示已暂停，所有后续普通 restart 请求继续返回 paused。
暂停没有自动到期时间，也不能被另一个开发任务或代理会话覆盖。

用户可以返回游戏；只有用户点击“继续重启”或明确要求维护代理继续后，才允许：

```powershell
npm run service:resume
```

继续后重新完整倒计时五秒，仍可打断。代理收到 paused/退出码 3 后，应并发或顺序完成无需重启的
其他工作；必须依赖新服务的检查只能等待用户主动继续。禁止伪造验证结果，禁止用系统强制重启
替代该流程。运行逻辑修改不使用 HMR 自动刷新，本服务使用 nohmr 模式。

意外重启宿主时，未完成的 countdown/restarting 保守恢复成 paused，不会自动重试计划操作。
内部工作进程意外退出也经同一五秒提示；失败后停止自动循环尝试，保留失败证据。

## 固定端口与证据

安装前及运行时都检查 5180 是否可绑定，冲突原样报错。内部工作进程使用独立的动态 loopback 端口，
strictPort 开启。先独占公开端口再读取和恢复状态，避免第二实例改写正在执行的重启状态。
状态与控制 token 在 `.local/service/`，私有目录不得由 Vite、代理或 `/@fs/` 暴露。
日志按大小轮转。Web 的 SSE 连接、积压缓冲和会话数有上限。

界面回归图：[倒计时](../screenshots/service_countdown.png)、[已打断](../screenshots/service_interrupted.png)。
自动回归入口为 `tests/service_restart.test.ts`、`tests/service_http.test.ts`、
`tests/service_notice.test.ts` 与 `tests/service_worker.test.ts`，覆盖持久暂停、显式继续、
重复请求、端口冲突、控制权限及工作进程的关闭竞态。

需要明确关闭或卸载时，管理员可使用 `windows_service.ps1 uninstall`。日常阶段更新不用
`Stop-Service`、`Restart-Service`、taskkill 或另启 Vite。主工程 `windows_stack.ps1` 仍属于主工程，
本作不修改或替换其 LAN、Postgres 及 5173/8787 行为。

参考：WinSW 官方 [2.12.0 配置说明](https://github.com/winsw/winsw/blob/v2.12.0/doc/xmlConfigFile.md)。
