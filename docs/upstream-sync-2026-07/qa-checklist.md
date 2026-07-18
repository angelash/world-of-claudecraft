# 整体验收清单

- [x] 合并结果包含官方 `upstream/main` 全部历史
- [x] 合并结果包含分叉 `main` 全部历史
- [x] 当前未提交 hosted play 与 ambient bot 行为完整保留
- [x] 三宿主和 `IWorld` 协议无漂移
- [x] `src/sim` 确定性和导入纯度通过架构测试
- [x] 服务端仍权威，新增或变更命令有服务端校验
- [x] 持久化 DDL 幂等，旧 JSONB 状态可加载，原生 Postgres 路径通过
- [x] 所有玩家与管理员可见字符串满足 i18n 规则
- [x] 无手工修改的生成物，无未解决冲突标记和遗留 TODO
- [x] 相关 targeted tests 通过
- [x] 可执行的 CI 等价门禁通过；`ci:changed` 因旧 `origin/main` 将 3651 个官方提交视为本次改动，限制已记录且未批量重排官方代码
- [x] 系统 Google Chrome 真实 UI 路径通过
- [x] Windows LAN/IP 栈重启成功
- [x] `/api/status` 和真实在线路径通过
- [x] 覆盖性 review agents 无 BLOCKING 或 SHOULD-FIX 遗留
