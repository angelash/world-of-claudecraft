# 跨阶段状态

## 当前阶段

Phase 4 QA，已完成。

## 锁定决策

- 官方源固定为 `upstream/main`，最终重新拉取并验证 SHA 为 `26f54c80377fc6d1158e486d353a22f2e899e0a4`
- `main` 是最终日常分支，仅允许使用一个短期上游同步分支处理合并
- 当前未提交修改必须通过带说明的 stash 完整保存，并在合并后重新应用
- 上游合并完成前不混入当前未提交 hosted play 与 ambient bot 修改
- 生成文件冲突通过选边和重新生成解决
- 不推送、不部署，不设置生产 `ALLOW_DEV_COMMANDS=1`

## 非协商约束

- `src/sim` 确定性：只用 `Rng`，禁止 `Math.random`、`Date.now`、`performance.now`
- 服务端权威：客户端不决定战斗、掉落、任务和经济结果
- `IWorld` 变更必须同步 `Sim`、`ClientWorld` 和相关 headless 表面
- 所有玩家可见字符串走 `t()` 或 sim/server 本地化 matcher
- 持久化使用内联、幂等、可回滚兼容的 DDL 与 JSONB 默认值
- 保留 fork-local LAN/IP 启动策略

## Git 基线

- `main`：本规划包随最终 `chore(sync)` 合并提交落地
- `origin/main`：`34689a7032ffe08144b5e53c60b7a494a8fb7fe7`
- `upstream/main`：`26f54c80377fc6d1158e486d353a22f2e899e0a4`
- merge base：`ae3769c71346608408a33dde3362c04ade7931dd`
- 合并提交父项：本地 `34689a7032ffe08144b5e53c60b7a494a8fb7fe7`，官方 `26f54c80377fc6d1158e486d353a22f2e899e0a4`

## 验证矩阵

- 合并前基线：相关 hosted play 与 ambient bot Vitest，加 `npx tsc --noEmit`
- server 迭代：相关 server 套件、`npx tsc --noEmit`、`npm run build:server`
- sim/net 变更：架构、snapshot、env protocol、bandwidth 与 cross-platform parity 测试
- 玩家字符串变更：`tests/localization_fixes.test.ts`
- 完整门禁：`npm test`、`npx tsc --noEmit`、`npm run build:env`、`npm run build:server`、`npm run build`
- 真实运行：`npm run db:up`，`scripts/windows_stack.ps1 restart`，检查 5173、8787、`/api/status` 和在线路径

## 已知风险

- 分叉跨度大，官方与本地都修改 server、sim、UI、生成物和构建配置
- 当前未提交改动本身很大，必须区分合并冲突与原有行为缺陷
- 换行策略会在 Git 触碰文件时把 LF 转为 CRLF，应用 stash 后需检查无纯换行噪声
- 运行中服务可能仍加载旧 bundle，后端修改后必须重启
- 全量 `ci:changed` 会把相对旧 `origin/main` 的 3651 个官方提交全部视为本次改动，不能用它要求重排整个官方代码库
- Windows 用户环境已持久化 ambient bot AES-256-GCM 凭据密钥，LAN 栈可在安全模式启动；密钥不写入仓库

## 完成证据

- 类型检查通过，TypeScript 与 Svelte 均为 0 错误、0 警告
- 生产构建通过，安全门禁扫描 3678 个文件，0 个 high
- 正确分区的广泛产品测试退出码为 0；最终 hosted、ambient、lease、HTTP 集合 26 文件 769 项通过
- Chromium 浏览器测试 8 文件 65 项通过，Armory 横屏布局回归已修复
- 原生 Postgres lease 并发测试 2 项通过
- Windows LAN/IP 栈在 5173 与 8787 的 `0.0.0.0` 监听正常，`/api/status` 正常
- Hosted Play 五人真实在线 harness 全部 15 项通过，等级推进、任务、队伍、聊天、协作和战斗信号正常，卡死重置为 0
- 安全、迁移与跨宿主复核无阻断项
- 最终官方新鲜度复查发现并纳入 v0.27.1 两个热修提交，新增与受影响专项测试 14 文件 91 项通过
