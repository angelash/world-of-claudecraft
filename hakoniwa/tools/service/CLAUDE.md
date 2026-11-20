# 常驻开发服务

`run.ts` 只管理本作的 Web 开发宿主，不访问游戏世界、正式素材或存档。
公开端口固定 5180，内部 Vite 只监听动态 loopback 端口。占用冲突直接失败，禁止结束端口所有者。

计划重启只走 `control.ts restart`。用户打断后必须持久保留 paused，重复请求不得恢复倒计时。
只有用户明确继续，才能调用 resume；恢复后重新完整倒计时五秒。
状态仅在转换时落盘，SSE 有连接上限、背压清理和共享心跳。不要添加文件监听自动重启。

状态与 token 存在 `.local/service/`，不得从 HTTP、SSE 或日志泄露 token。
CLI 写控制限 loopback bearer；浏览器写控制限本机、HttpOnly 会话加同源检查。
代理不得把 LAN 调用者提升成原开发 API 的 loopback 权限。私有目录检查需覆盖 Windows 大小写。

Windows 注册使用固定版本与 SHA 校验的 WinSW，SCM 自动启动，LocalService 账户。
只给状态与缓存目录修改权限，项目与依赖只读。配置加载使用 runner，禁止给依赖树写权限。
