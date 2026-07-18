# 实施计划

## 团队工作流

每个阶段先读取 `state.md` 与 `progress.md`，使用只读探索代理定位风险面。实施后按实际 diff 触发 `privacy-security-review`、`migration-safety`、`cross-platform-sync` 与 `qa-checklist` 中适用的覆盖性复审。任何 BLOCKING 问题都必须在提交或交付前解决。

所有文件操作都保留并发工作区内容。Git 暂存使用显式路径，不使用 `git add -A`。除完成上游合并本身所需的 merge commit 外，不提交操作者未明确要求提交的定制修改。

## 阶段表

| 阶段 | 实施范围 | QA 范围 |
|---|---|---|
| Phase 1 | 审计 refs、当前未提交工作、冲突面、验证路径，建立可恢复基线 | 核对官方提交、stash 可恢复性、基线测试结果 |
| Phase 2 | 在短期同步分支合并 `upstream/main`，解决官方与已提交分叉历史冲突 | 检查 merge tree、生成物、架构规则和构建基线 |
| Phase 3 | 重新应用当前未提交 hosted play 与 ambient bot 改动，适配新版官方代码 | 针对性测试、类型检查、server 安全与行为覆盖性复审 |
| Phase 4 | CI 等价全量验证、持久 Postgres、Windows LAN 栈重启和真实在线检查 | 整体 QA 清单、服务健康、目标完成判定 |

## Phase 1 验收

- 官方远端 SHA 已通过独立远端查询确认
- 当前所有未提交内容有可恢复 stash 记录
- 合并前针对性测试与类型检查结果已记录
- 冲突与验证矩阵已明确

## Phase 2 验收

- `upstream/main` 的所有提交可从合并结果访问
- 已提交 fork-local 历史仍可从合并结果访问
- 无未解决冲突、无手工破坏的生成文件
- 临时同步分支按规则快进回 `main` 并删除

## Phase 3 验收

- 15 个当前未提交文件的意图和行为均保留或明确被新版等价能力替代
- ambient bot 与 hosted play 的相关 Vitest 套件通过
- TypeScript 严格检查和 server build 通过
- 覆盖性复审无 BLOCKING 或 SHOULD-FIX 遗留

## Phase 4 验收

- `npm test`、`npx tsc --noEmit`、`npm run build:env`、`npm run build:server`、`npm run build` 全绿
- 持久原生 Postgres 可用
- Windows LAN/IP 栈成功重启，端口 5173 与 8787 由预期进程提供
- 真实 `/api/status` 和在线游戏路径通过
- 整体 QA 清单无未解决阻塞项
