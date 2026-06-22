# AI Audit Center 需求规格

最后核对日期：2026-06-22。

本文定义 World of ClaudeCraft 的 AI Audit Center。它补齐 AI 生命层已经上线后的运营可观测性缺口，让策划、运营和开发者能回答三个问题：

1. AI 现在调用得多不多，是否在失控消耗？
2. 每次 AI 决策为什么发生，输入了什么上下文，输出了什么，最后为什么被接受或拒绝？
3. AI 对玩家体验产生了哪些表现层影响，是否越过任务、战斗、掉落、经济和角色存档边界？

## 背景

当前已有 admin Usage 页和 `/admin/api/overview`：

- 能看到 AI 生命层运行指标：provider calls、success、error、fallback、decision accepted/rejected、local reaction、generated events、memory writes、memory flush/prune 状态和延迟。
- 能看到最近 decision journal、world director states、proposal lifecycle journal、NPC memory、rumor 和持久化 memory diagnostics。
- 能看到内容覆盖报告和 profile authoring validation。
- 能清理 volatile AI overlay 和当前 realm 的持久 AI memory audit。

缺口是：这些信息仍偏摘要，不能长期追溯，也没有 AI 专属的频率窗口、token 估算和单次 job 的完整审计链路。

## 目标

- 建立 AI 专用审计数据模型，记录每次 provider job 和本地 reaction 的关键细节。
- 后台展示 AI 使用频率：1 分钟、5 分钟、1 小时、24 小时窗口的 job 数、成功、错误、fallback、拒绝、本地反应。
- 后台展示 token 消耗：输入 token、输出 token、总 token、估算标记，以及未来精确 usage 接入点。
- 后台展示最近 AI job 审计：jobId、trigger、entity、player、scene、status、source、latency、tokens、lineIds、intents、memory writes、拒绝或错误原因。
- 保留后台当前的健康、内容覆盖、profile 预览、world director、memory diagnostics，不替代它们。
- 不改变 `src/sim`，不改变任务、战斗、掉落、经济、背包、角色存档和世界结算。

## 非目标

- 不在第一版保存完整 prompt 原文或完整 `AiJobContextV1`。这些可能包含玩家输入或过大的 scene/memory 上下文，第一版只保存安全摘要和计数。
- 不做成本计费结算。第一版只做 token 估算和运营可视化，未来可接入具体模型单价。
- 不给玩家开放 AI 审计页面。所有入口只在 admin 后台。
- 不做模型供应商管理平台。Codex CLI 仍是当前 provider 入口。

## 用户和场景

| 用户 | 需要回答的问题 | 后台能力 |
|---|---|---|
| 策划 | 某个 NPC 为什么突然这么说？是否来自记忆、场景、导演余波或 profile？ | 最近 job 审计、lineId、intent、memory writes、scene、director 证据。 |
| 运营 | AI 今天是否过于频繁？是否大量 fallback？ | 频率窗口、错误率、fallback 率、token 估算。 |
| 开发 | Codex 输出为什么被拒绝？是否 validator 生效？ | rejected/provider_error 记录、reason、allowed intent/line 摘要、输出摘要。 |
| 安全审查 | AI 有没有影响主线和结算？ | status、intent、memory writes、presentation-only safety notes、无 sim mutation 约束。 |

## 功能需求

### R1. AI 频率统计

后台必须展示 AI 专属窗口统计：

- provider job 总数。
- provider success、provider error、provider fallback。
- accepted decision、rejected decision。
- local reaction。
- generated events。
- memory writes queued。

窗口至少包括：

- 1 分钟。
- 5 分钟。
- 1 小时。
- 24 小时。

### R2. Token 统计

后台必须展示：

- 输入 token。
- 输出 token。
- 总 token。
- token 是否估算。
- 最近一次 job token。
- 平均每次 provider job token。

第一版允许估算 token。估算规则需要写入设计文档，并且标记为 estimated，不能伪装成供应商账单。

### R3. 持久化审计

每次 provider job 完成后必须写入审计记录：

- realm。
- jobId。
- trigger。
- entity kind、entityId、templateId。
- playerEntityId。
- sceneId、zoneId。
- provider source：codex、fake、fallback、本地规则等。
- status：accepted、rejected、provider_error、local_reaction。
- latencyMs。
- inputTokens、outputTokens、totalTokens、tokenEstimate。
- lineIds、intents、memoryWrites。
- reason。
- error。
- outputMode。
- allowed intent 数量、allowed lineId 数量、memory signal 数量、director proposal 数量、scene object 数量、companion 数量。
- created_at。

### R4. 后台最近审计列表

Admin Usage 页必须显示最近 AI audit records，至少 20 条，字段包括：

- 时间。
- status。
- trigger。
- entity。
- scene / zone。
- source。
- latency。
- tokens。
- lineIds。
- intents。
- memory writes。
- reason 或 error。

所有字段必须 escape，避免后台 XSS。

### R5. Admin API

`/admin/api/overview` 必须继续返回当前 AI 运行块，并新增 `aiAudit`：

- summary：频率窗口、token 汇总、错误汇总。
- recent：最近审计记录。

必须复用现有 admin bearer token 校验。

### R6. 可维护性和安全

- SQL 只能放在 `server/*_db.ts`。
- schema 必须 idempotent、additive。
- 审计写入失败不能影响玩家当次 AI 反馈。
- 审计表必须按 realm 隔离。
- 后台只读查询必须有 limit 上限。
- 不保存完整 prompt 原文、不保存完整 dynamic text 长文本。lineId 和短 reason 可以保存。

## 已有实现归档要求

以下现有能力必须在设计文档中有对应归档：

- AI 生命层运行指标。
- decision journal。
- world director state 和 proposal lifecycle journal。
- social memory、rumor 和 memory persistence diagnostics。
- content coverage 和 authoring checklist。
- profile preview 和 validation。
- AI memory clear 后台入口。
- 真实 Postgres memory longrun 验证。

## 验收标准

- 有需求文档和设计文档，并在 `docs/CLAUDE.md` 索引。
- `/admin/api/overview` 返回 `aiAudit.summary` 和 `aiAudit.recent`。
- Admin Usage 页展示 AI usage / token / audit 最近记录。
- 频率统计覆盖 1m、5m、1h、24h。
- token 统计明确标记 estimated。
- provider success、provider error、rejected decision、local reaction 至少都有单测覆盖。
- 审计写入失败不影响 AI speech 或 local reaction。
- 运行：
  - `npx vitest run tests/ai_audit_db.test.ts tests/ai_life_layer_audit.test.ts tests/admin.test.ts tests/admin_ai_metrics_ui.test.ts`
  - `npx tsc --noEmit`
  - `npm run build:server`
  - `git diff --check`

## 后续增强

- 增加单条 audit detail endpoint：按 auditId/jobId 查询完整摘要。
- 增加 Postgres 分页查询、玩家筛选、trigger 筛选、status 筛选。
- 当 Codex CLI 或模型 provider 返回精确 usage 时，保存 exact token 字段，并保留 estimated 字段用于 fallback。
- 增加按模型、realm、profile、scene、NPC 的成本聚合。
- 增加异常告警：高 fallback、token 暴涨、rejected decision 激增、memory flush failure。
