# 范围与现状

## 目标

将官方主分支的全部最新修改安全合并到本分叉，保留所有 fork-local 行为，并让当前未提交的 hosted play 与 ambient bot 改动适配新版官方架构。

## 已确认现状

- 当前分支：`main`
- 当前 `main`：`34689a7032ffe08144b5e53c60b7a494a8fb7fe7`
- 最终重新拉取并验证官方 `upstream/main`：`26f54c80377fc6d1158e486d353a22f2e899e0a4`
- 远端验证方式：`git ls-remote`，结果与本地 remote-tracking ref 一致
- 共同祖先：`ae3769c71346608408a33dde3362c04ade7931dd`
- 分叉规模：本地 357 个提交，官方 3651 个提交
- 当前有 15 个未提交文件，约 8716 行新增与 1411 行删除，集中在 ambient bots、hosted play、party coordination、live harness 及其测试

## 必须保留的分叉能力

- fork-local LAN/IP 启动策略与 Windows 运行栈包装器
- ambient player bots 的决策、组队、支援、进度路线与运行时行为
- hosted play 的组队、协作、战斗推进与运行时能力
- party coordination 的分叉扩展
- 当前未提交修改覆盖的行为及对应回归测试
- 服务器权威性、持久 Postgres、三宿主一致性、确定性和 i18n 约束

## 合并原则

- 官方控制流优先，分叉行为通过注册表、handler map、小型 hook 和 provider adapter 重新接入
- 生成的 i18n、wiki、媒体文件发生冲突时选择一侧后重新生成，不手工拼接生成物
- 先保护未提交工作，再在短期同步分支上合并，完成后快进 `main` 并删除短期分支
- 不推送、不部署，不提交与上游同步无关的当前未提交工作

## Open 项

没有需要产品选择或凭据的开放项。网络远端和官方主分支提交已验证。
