# 近期修改归档核对, 2026-06-29

## 范围

本次核对覆盖最近一轮 fork 本地改动, 重点检查 2026-06-26 到
2026-06-29 之间已经落在 `main` 上的修改, 并确认它们是否已经有可追溯的
需求归档和设计归档。

核对方法:

- 按功能主题归类近期提交, 不按单个 commit 机械逐条拆文档。
- 以当前仓库内可维护的文档包为准, 例如 `docs/online-hosted-play/`、
  `docs/ambient-player-bots/`、根目录规范文档和对应 README。
- 只把真正缺失或已经与现状脱节的部分补齐, 不为纯实现细节制造新的
  独立 PRD。

## 核对结果

### 1. Online Hosted Play

已有归档:

- 需求: `docs/online-hosted-play/requirements.md`
- 设计: `docs/online-hosted-play/architecture.md`

发现的问题:

- 初始规划脚手架移除后, 2026-06-28 到 2026-06-29 的后续能力增强
  还缺一份集中归档, 例如右侧 HUD 控制面板、诊断详情、动作日志偏好、
  以及观察客户端持续发送 idle 输入帧时的控制权仲裁。

本次补齐:

- 新增 `docs/online-hosted-play/post-launch-archive.md`, 作为原始功能包
  之后的需求补充和设计补充归档。
- 更新 `docs/online-hosted-play/README.md`, 把补档入口加入索引。

### 2. Ambient Player Bots

已有归档:

- 需求: `docs/ambient-player-bots/requirements.md`
- 设计: `docs/ambient-player-bots/architecture.md`

发现的问题:

- `README.md` 还停在 continuation 16, 没有把 continuation 17 和 18
  放进索引。
- continuation 18 之后的 late fixes 没有独立归档, 例如开怪前准备、
  hosted quest automation 稳定化、ready quest 优先于延后高风险路线。
- `state.md` 里还有过时的 `pg-mem` 现状描述, 以及“continuation ladder
  关闭后再 teardown”的旧说法, 和当前运行策略不一致。

本次补齐:

- 新增 `docs/ambient-player-bots/post-packet-archive.md`, 归档近期补丁的
  需求补充和设计补充。
- 更新 `docs/ambient-player-bots/README.md`, 补上 continuation 17/18
  和补档入口。
- 更新 `docs/ambient-player-bots/state.md` 与 `progress.md`, 让当前状态、
  运行策略和补档位置重新对齐。

### 3. Fork 本地运行与验证策略

已有归档:

- 根规范: `CLAUDE.md`、`AGENTS.md`、`GEMINI.md`
- 开发与运行说明: `README.md`、`scripts/CLAUDE.md`

结论:

- 这部分近期改动, 包括 `online_lan.mjs`、persistent Postgres、禁用
  `pg-mem` live-path 验证、系统 Google Chrome 验证策略, 已经有稳定归档
  位置, 不缺独立 PRD 或设计文档。
- 本次不再额外制造一个重复的运维功能包, 避免把同一规则分散到更多文档。

### 4. 小范围实现修正

包括:

- `fix(pathfinding): keep A* legs from crossing fences`
- 以及若干 hosted-play / ambient-bots 的局部稳定性修正

结论:

- 这些属于现有功能包和系统设计下的实现修正, 不需要人为拆成新的产品需求包。
- 但凡它们改变了已有功能包的行为边界, 已在本次对应补档中记录。

## 这次补档后的结论

- Hosted Play: 现在有完整的需求文档、设计文档, 以及 post-launch 补档。
- Ambient Player Bots: 现在有完整的需求文档、设计文档, 以及
  post-packet 补档, 同时索引和状态文档也和当前代码一致。
- Fork 本地运行策略: 继续以根规范和 README 体系作为权威归档, 当前无缺口。

## 仍然保留但已明确写出的事项

- `docs/ambient-player-bots/progress.md` 中 continuation 01 到 03 的 QA
  行仍是 pending, 因为仓库里没有独立的补关记录可以据实回填为 completed。
  这不是本次漏补, 而是后续如果要关闭这些历史 QA 行, 需要一次明确复核。
