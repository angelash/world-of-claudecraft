# world-of-claudecraft 现有 AI NPC 与 AI 决策改造调研

> 归档位置：`hakoniwa/docs/10_research/ai_npc/`。本文只记录事实、分析与可借鉴点，不做《箱庭纪》的最终设计决定。
> 用途：为后续与 my_ai_town 的对比提供"我们自己现在到底做了什么"的客观底稿。

## 0. 调研说明

| 项       | 内容                                                                                                                                                                                                                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 调研基线 | 本仓库 `main`，HEAD 为 `cd961d3210`（`refactor(fork): retire superseded client paths`，位于上游 v0.31.0 同步之后）                                                                                                                                                                                                                                          |
| 范围     | `server/ai/`、`server/ambient_bots/`、`server/hosted_play/`、`server/ai_audit.ts`、`server/ai_audit_db.ts`、`server/ai_memory_db.ts`、`server/provider_usage.ts`、`server/game.ts` 中的 AI 胶水、`src/` 中的客户端呈现与后台页面，以及 `docs/design/ai-*.zh_CN.md`、`docs/design/npc_voices.md`、`docs/ambient-player-bots/`、`docs/hosted-party-autonomy/` |
| 方法     | 通读 `server/ai/` 核心源码；`ambient_bots` 与 `hosted_play` 由并行子代理通读，关键结论再由本人回到源码抽查；用仓库自带的 `tsx` 只读执行 `aiContentCoverageReport()` 取得内容覆盖数；文档只作线索，冲突时以源码为准                                                                                                                                          |
| 证据标注 | "已核实"：读源码确认；"推断"：读源码得出但未运行验证                                                                                                                                                                                                                                                                                                        |
| 规模参考 | `server/ai/` 约 1.6 万行，`server/ambient_bots/` 约 1.5 万行，`server/hosted_play/` 约 4 千行；`server/game.ts` 约 8 千行，其中直接的 AI 胶水约 450 到 500 行（不含 ambient/hosted）                                                                                                                                                                        |

### 0.1 一句话结论

本仓库的 AI 改造是一个"**以玩家为中心的反应式表演层**"：工程护栏（结构化输出、白名单校验、本地兜底、审计、预算）做得扎实，但 NPC 没有自己的目标、日程、持续记忆和彼此之间的社会；模型基本只负责"说一句什么话"，几乎不决定世界里发生什么。它离"自主生活型 AI 居民"有结构性差距，不是调参能补上的。

---

## 1. 有哪几套 AI

### 1.1 四套子系统总表

| 子系统                | 入口                                                             | 目标                                                                            | 触发方式                                                                                                                                                                                 | 模型决定什么                                                                                                  | 规则决定什么                                                              | 与确定性 sim 的关系                                                                                      | 默认开关                                                                                         |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A. 反应式 AI 生命层   | `server/ai/life_layer.ts` 的 `AiLifeLayer`                       | 玩家主动交互时让 NPC、物件、场景、宠物"活一下"                                  | WS 命令 `ai_interact_npc`、`ai_inspect_object`、`ai_inspect_scene`；聊天命令 `/petai`、`/askpet`；丢弃物品；每 tick 的 `handleSimEvents` 本地反应                                        | 一句台词（选 lineId 或生成 dynamicText）、意图（只变成表现徽标）、宠物指令                                    | 上下文取材、本地候选台词、最终择优                                        | 只读 sim；输出 `aiSpeech`/`aiThinking` 事件；仅宠物指令经 `sim.setPetMode`/`petAttack`/`petTaunt` 改世界 | `AI_LIVING_WORLD_EXPERIMENT` 不等于 `'0'` 即开启（已核实）                                       |
| B. 主动触发与轮询导演 | `server/ai/active_triggers.ts` 的 `AiActiveTriggerService`       | 玩家没提问时，附近 NPC/生物自发出现"生活片段"、事件反应、2 到 3 个 NPC 的小对话 | `GameServer` 每 30 秒 `runAiActiveTriggers`；事件队列（`quest_done`、`item_discarded`、`entity_death`、`combat_damage`、`world_director`）；4 条默认轮询规则 `DEFAULT_ACTIVE_POLL_RULES` | 台词文本（本地 lineId 先兜底，模型异步覆盖）                                                                  | 选谁说、做什么动作（NPC 小步移动、怪物开怪/逃跑/呼救）                    | 经 `Sim.aiActiveMobAction`、`Sim.aiActiveNpcAction` 在 tick 之外改 sim 状态                              | `AI_ACTIVE_EVENTS_ENABLED`、`AI_ACTIVE_POLLS_ENABLED`、`AI_ACTIVE_REAL_ACTIONS_ENABLED` 均默认开 |
| C. 环境玩家机器人     | `server/ambient_bots/`（`service.ts`、`runtime.ts`、`brain.ts`） | 在真人附近填充"像真人"的冒险者：上线、做任务、打怪、组队、聊天、下线            | `AmbientPlayerBotService` 按真人聚类定时规划；机器人自行 REST 注册登录并连 WS                                                                                                            | 社交计划（`socialMode`、`focusLabel`、`selfSummary`、`friendPolicy`、是否打招呼）、私聊回复文本、队伍聊天措辞 | 全部玩法：任务路线、战斗、补给、组队、治疗、走位                          | 与真人一样只发普通客户端命令，sim 不感知机器人                                                           | `AMBIENT_PLAYER_BOTS_EXPERIMENT=1` 才开；LLM 另需 `AMBIENT_PLAYER_BOTS_LLM_ENABLED`              |
| D. 托管游玩           | `server/hosted_play/`（`runtime.ts`、`party.ts`）                | 玩家把自己在线的角色交给 AI 自动玩、组队、做任务到 20 级                        | REST `/api/characters/:id/hosted-play`；角色必须在线或处于断线宽限期                                                                                                                     | 同 C 的 plan 与私聊回复；队伍聊天永远是模板                                                                   | 复用 C 的 `tickAmbientPlayerBotBrain` 加 `tickHostedPlayPartyCoordinator` | 经 `dispatchMessage(..., 'hosted')` 走普通命令通道                                                       | `HOSTED_PLAY_LLM_ENABLED=1` 才用 LLM                                                             |

横切设施：

| 设施           | 位置                                                                                                                                                                                                                           | 作用                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Codex provider | `server/ai/codex_worker.ts`（`CodexCliProvider`）、`server/ai/codex_app_server_provider.ts`（`CodexAppServerProvider`）、`server/ai/codex_isolation.ts`、`server/ambient_bots/llm_provider.ts`（`AmbientBotCodexCliProvider`） | 唯一的模型后端是 OpenAI Codex CLI，A/B 共用一套，C/D 共用另一套 |
| 审计中心       | `server/ai_audit.ts`（`AiAuditRuntime`）、`server/ai_audit_db.ts`（`PgAiAuditDb`，表 `ai_audit_records`）                                                                                                                      | A/B 每次决策的全链路记录与窗口统计                              |
| 记忆库         | `server/ai_memory_db.ts`（`PgAiMemoryDb`，表 `ai_memory_records`）                                                                                                                                                             | A/B 的持久化记忆信号                                            |
| 后台           | `src/admin/pages/AiOperations.svelte`、`server/admin.ts` 的 `aiDiagnosticsPayload`                                                                                                                                             | 审计、主动规则配置、用量、内容覆盖、profile 预览                |
| 客户端呈现     | `src/ui/hud.ts`（`handleAiSpeech`、`showAiThinking`）、`src/ui/ai_reaction.ts`、`src/render/renderer.ts`（`showAiReactionBadge` 等）、`src/ui/hosted_play_panel.ts`                                                            | 聊天行、头顶气泡、思考徽标、注意力连线、`[AI]` 标识             |

`server/provider_usage.ts` 与 AI 无关：它统计的是余额 RPC、Turnstile、GitHub、钱包等外部服务调用，不含模型用量（已核实）。

### 1.2 总体架构图

```
 浏览器客户端                              server 进程 (GameServer, server/game.ts)
+---------------------+   WS cmd    +-------------------------------------------------------------+
| NPC 对话窗 "询问"    |-----------> | dispatchMessage                                             |
| 检视键 / petai 聊天  |             |   ai_interact_npc / ai_inspect_* / ai_command_pet           |
+---------------------+             |        |  先回 aiThinking                                   |
          ^                         |        v                                                    |
          |  events(aiThinking,     |  +-------------------------------+     +-----------------+  |
          |   aiSpeech, error)      |  | A. AiLifeLayer (反应式)        |---->| AiProvider      |  |
          |                         |  |  context -> prompt -> 模型     |     |  Codex exec 或  |  |
          |                         |  |  -> validate -> 本地候选择优   |<----|  app-server 池  |  |
          |                         |  +-------+---------------+-------+     +-----------------+  |
          |                         |          | 记忆写入       | 审计            ^             |
          |                         |          v               v                 |             |
          |                         |   ai_memory_records   ai_audit_records (Postgres)            |
          |                         |                                            |             |
          |                         |  setInterval 30s                            |             |
          |                         |  +-------------------------------+         |             |
          |                         |  | B. AiActiveTriggerService     |---------+             |
          |                         |  |  事件队列 + 轮询规则 + 预算     |                       |
          |                         |  +---------------+---------------+                       |
          |                         |                  | 本地规则选定动作                       |
          |                         |                  v                                       |
          |                         |  Sim.aiActiveMobAction / Sim.aiActiveNpcAction (tick 外)   |
          |                         |                                                          |
          |                         |  sim.tick() 20Hz  <--- 普通命令 <--- C. ambient bots       |
          |                         |                                     (REST+WS 回环登录)     |
          |                         |                   <--- 普通命令 <--- D. hosted play        |
          |                         |                                     (dispatchMessage)     |
          +-------------------------|  routeEvents：带 pid 的事件只发给该玩家                   |
                                    +-------------------------------------------------------------+
```

### 1.3 与"一套 sim、三个宿主"的关系

| 宿主           | 是否有 AI                         | 证据                                                                                                                                           |
| -------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 在线服务器     | 有（A、B、C、D 全在服务器进程内） | `GameServer` 构造函数里实例化 `AiLifeLayer`、`AiActiveTriggerService`、`AmbientPlayerBotService`                                               |
| 离线浏览器 Sim | 无                                | `Sim` 的 `aiInteractNpc`、`aiInspectObject`、`aiInspectScene` 是桩，只发 `aiThinking` 加英文错误"Offline simulation has no Codex CLI provider" |
| RL 环境        | 无                                | 不加载 `server/ai/`                                                                                                                            |

AI 没有进入 sim 的确定性 tick：A 只读 sim 并产出事件；B 的真实动作由墙钟 30 秒定时器在 `sim.tick()` 之外注入（与玩家输入同性质，但无法按种子回放复现）；C/D 以客户端身份发命令。这条边界本身是合理的，但也意味着"AI 居民"在离线和训练环境里不存在。

---

## 2. 一次 NPC AI 决策的完整链路

以 A 路径中"玩家在 NPC 对话窗点击'询问传闻'"为主线，B 路径的差异放在 2.10。

### 2.1 时序总览

```
玩家点击话题按钮
  |  src/ui/hud/quest/quest_dialog_controller.ts (askAiNpcTopic)
  |  话题枚举 AiNpcInteractionTopic = greeting | recent | rumor | place | quest_hint
  v
ClientWorld.aiInteractNpc -> WS {cmd: ai_interact_npc, npc, locale, topic}
  v
GameServer.handleAiInteractNpc
  |  会话冷却：交互 4 秒，提问 2 秒 (AI_NPC_INTERACTION_COOLDOWN_SECONDS 等)
  |  立刻回 aiThinking 事件（客户端显示"思考中"徽标并暂存后续台词）
  v
AiLifeLayer.handleNpcInteraction (async)
  |  1. buildNpcContext            -> AiJobContextV1
  |  2. 读内存记忆与世界痕迹         -> recentObservations / memorySignals
  |  3. 读 Postgres 持久记忆 (<=8)   -> memorySignals
  |  4. 预算本地候选台词 5 种         -> replyCandidates
  |  5. decideWithProviderCache     -> 缓存命中或调用 AiProvider.decide
  |  6. validateAiDecision          -> 校验 + canon guard + 口语化润色
  |  7. directNpcReplyEvents        -> 按话题在模型台词与本地候选间择优
  |  8. 写决策日志、审计、记忆写入队列
  v
deliver(events)  (按 interactionId 守卫，tagAiInteractionEvents 打标)
  v
客户端 renderAiSpeech：聊天行(say/emote, 带 [AI] 标识) + 头顶气泡 + 反应徽标/注意力连线
```

### 2.2 触发

| 触发                     | 入口                                                                      | 是否调用模型                    |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------- |
| NPC 对话窗中点"询问"话题 | `ai_interact_npc`                                                         | 是                              |
| 检视物件 / 检视场景      | `ai_inspect_object` / `ai_inspect_scene`（客户端检视键）                  | 物件是，场景以本地为主          |
| 宠物自然语言命令         | `/petai`、`/askpet` 聊天命令进 `handleAiCommandPet`                       | 是（玩家自由文本，截断 160 字） |
| 丢弃物品                 | `handleAiItemDiscarded`                                                   | 是（附近生物对掉落物的反应）    |
| 每 tick 的 sim 事件      | `AiLifeLayer.handleSimEvents`：任务完成、首领受伤/阶段/死亡、奇点个体死亡 | 否，纯本地规则                  |

玩家不能对 NPC 输入自由文本，只能从固定话题中选。客户端 `QuestDialogController` 只渲染 recent、rumor、place、quest_hint 4 个按钮；greeting（服务器侧对应 `npc_gossip_opened`）在当前客户端没有发送路径，打开对话窗时显示的是静态问候 `npcGreeting`，不经过 AI（已核实）。

### 2.3 上下文构造（`AiJobContextV1`）

`buildNpcContext` 与 `handleNpcInteraction` 共同组装，字段如下：

| 字段                                | 内容来源                                                    | 说明                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `trigger`                           | 话题为 greeting 时 `npc_gossip_opened`，否则 `npc_question` | 共 7 种 trigger                                                                                                                      |
| `entity`                            | NPC 实体与 `NPCS` 定义                                      | id、模板、名字、等级、挂的任务 id、是否死亡                                                                                          |
| `player`                            | 玩家实体与 `sim.meta`                                       | 名字、等级、职业、进行中与已完成任务 id                                                                                              |
| `profile`                           | `profileFor` 加 `compactProfileSnapshot`                    | 人设一句话、知识范围、禁忌话题、社交记忆风格、说话指纹                                                                               |
| `scene`                             | `sceneFrameFor`（`server/ai/scene_frame.ts`）               | 区域/子场景标签、附近语义物件、掉落物、同伴、时间/天气/光照、情绪系数、危险度                                                        |
| `familySemantics`                   | `compactFamilySemanticsForEntity`                           | 生物家族本能（对 NPC 通常为空）                                                                                                      |
| `questFacts`                        | NPC 挂的任务中玩家可见的部分                                | 只有 `currentObjective`/`knownToPlayer` 两档，summary 只是任务名                                                                     |
| `recentObservations`                | 字符串标签                                                  | 如 `playerQuestion:rumor`、`npcMemory:3`、`worldTrace:food:...`、`worldDirector:hungry:...`、`bossMemory:...`、`questSceneRumor:...` |
| `memorySignals`                     | 内存记忆 + Postgres 持久记忆                                | `AiMemoryAuditRecord` 数组                                                                                                           |
| `directorProposals`                 | 世界导演状态里的 proposal                                   | 只读提案                                                                                                                             |
| `allowedIntents` / `allowedLineIds` | profile                                                     | 白名单                                                                                                                               |
| `outputMode`                        | `npcConversationOutputMode`                                 | `quest_hint` 强制 `line_id_only`，其余 `mixed_living_world`                                                                          |

### 2.4 题面构造与压缩（`server/ai/prompt_builder.ts`）

`buildCodexDecisionPrompt` 的结构：

```
[角色]   You are the World of ClaudeCraft AI life layer for one interactive entity.
[焦点]   Trigger focus / Primary goal（按 trigger 取自 PROMPT_POLICIES）
[硬规则] 不得改任务、奖励、战斗、掉落、经济、背包、位置、隐藏正典、成长；只用 job.json 中的事实；
         lineId/dynamicText 模式约束；语言必须等于 locale；意图目标必须在 job.json 可见 ...
[风格]   对话在场感、场景情绪、dynamicSpeechPromptRules(locale)（反助手腔，中英分别给规则）、
         说话指纹规则、修复规则
[可读摘要] 实体、玩家、允许意图与 lineId、任务事实、人设、场景标签、时间天气、危险度、
         附近物件、掉落物、同伴、近期事件、家族本能、观察、导演提案、记忆信号
[真源]   "Compact job JSON (source of truth)" + JSON.stringify(compactPromptContext)
[收尾]   Return only JSON. No Markdown. No commentary.
```

压缩手段全部是"按触发裁剪加切片"，由 `PromptPolicy` 控制：

| trigger                 | 人设 | 任务事实              | 场景详略 | 记忆条数上限 | 观察条数上限 | 导演提案上限 |
| ----------------------- | ---- | --------------------- | -------- | ------------ | ------------ | ------------ |
| `npc_gossip_opened`     | 有   | 有                    | full     | 6            | 8            | 3            |
| `npc_question`          | 有   | 有                    | full     | 4            | 5            | 2            |
| `object_inspected`      | 有   | 有（不含玩家任务 id） | full     | 3            | 4            | 0            |
| `singularity_candidate` | 有   | 无                    | full     | 5            | 6            | 3            |
| `pet_command`           | 无   | 无                    | brief    | 0            | 0            | 0            |
| `active_poll`           | 有   | 无                    | full     | 4            | 6            | 2            |
| `active_event`          | 有   | 无                    | full     | 5            | 8            | 3            |

观察结论：

- 没有摘要、没有向量检索、没有对话历史；记忆以"种类:引用:范围:显著度:原因"的标签串进入题面，模型看不到"上次说了什么"。
- 同一信息在可读摘要和 JSON 里出现两遍，题面偏长但有利于模型对齐。
- `CodexAppServerProvider` 每轮结束都会 `createThread` 重置线程，所以模型层也没有任何会话连续性（已核实）。

### 2.5 模型调用（provider 适配、隔离、超时、并发）

```
AiProvider 接口 { decide(context), warmup?(), close?() }
      |
      +-- defaultAiProvider()  按 AI_CODEX_PROVIDER 选择
             |
             +-- 'exec'(默认) -> CodexCliProvider
             |      每次调用：mkdtemp 隔离目录 -> 写 job.json 与 schema
             |      -> spawn `codex exec --sandbox read-only --ephemeral --output-schema ... -o ... -`
             |      -> 读输出文件 -> parseCodexDecisionOutput -> 删除隔离目录
             |
             +-- 'app-server' -> CodexAppServerProvider
                    常驻 `codex app-server` JSON-RPC，线程池 AI_CODEX_APP_SERVER_POOL_SIZE
                    (默认 2，夹在 1 到 8)，每个 worker 串行队列；effort 默认 low；
                    每轮结束重置线程；失败自动重启
```

| 关注点 | 实现                                                                                                                                                      | 证据                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 隔离   | 临时目录（workspace/artifacts/codex-home），只复制 `auth.json`；子进程环境变量白名单；禁用 plugins、shell_tool、browser_use、mcp、web_search 等；只读沙箱 | `createCodexIsolation`、`minimalCodexChildEnv`、`codexLockdownArgs` |
| 超时   | 单次 60 秒（`AI_CODEX_TIMEOUT_MS`）；app-server 另有启动 20 秒、请求确认 10 秒                                                                            | `CodexCliProvider`、`CodexAppServerProvider` 常量                   |
| 重试   | A 路径不重试；B 路径校验失败可预约一次"修复"重试（`tryReserveProviderRepair`）                                                                            | `active_triggers.ts`                                                |
| 并发   | A 路径无全局并发上限：exec 模式每请求一个子进程，app-server 模式受池大小约束但队列无上限；只有会话冷却                                                    | `decideWithProviderCache` 无信号量                                  |
| 缓存   | 对上下文子集做 sha256（数值取整），只缓存通过校验的决策；TTL 取 `min(决策 ttlMs, 12 秒)`，最多 128 条                                                     | `providerDecisionCacheKey`、`DEFAULT_PROVIDER_CACHE_MAX_TTL_MS`     |
| 计时   | 每步耗时（建目录、写文件、子进程、读输出、排队、首 token 等）进入 `providerTimings`                                                                       | `AiProviderTimingSnapshot`                                          |
| 厂商   | 只有 Codex CLI；接口可插拔，但仓库里没有第二个生产实现                                                                                                    | `defaultAiProvider`                                                 |

### 2.6 输出格式（`AiDecisionV1`）

```
{
  schemaVersion: 1, jobId, entityRef: {kind, entityId, templateId},
  ttlMs (<=60000), confidence (0..1),
  speech: [ {mode:'lineId', lineId, values?} | {mode:'dynamicText', language, text} ],
  intents: [ {type, lineId?, targetEntityId?, targetObjectId?, targetItemId?, seconds?} ],
  audit: { shortReason, usedPlayerInput, safetyNotes[] }
}
```

JSON Schema 为 `AI_DECISION_OUTPUT_SCHEMA`，经 `--output-schema` 交给 Codex 做结构化约束。意图类型共 17 种（`AiIntentType`）：注视、转向、表情、停顿、评论场景、靠近/回避/检视物件、找掩蔽、显示对话选项、任务提示，以及 6 种宠物命令。

### 2.7 意图校验（`server/ai/intent_validator.ts` 的 `validateAiDecision`）

| 序  | 检查                                                                                                                                       | 失败结果 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1   | schemaVersion、jobId、entityRef 与上下文一致                                                                                               | 拒绝     |
| 2   | ttlMs 在 (0, 60000]，confidence 在 [0,1]                                                                                                   | 拒绝     |
| 3   | 台词条数：默认 1 条，社交序列 3 条                                                                                                         | 拒绝     |
| 4   | 每个意图同时属于上下文白名单与 profile 白名单；意图附带的 lineId 属于 profile                                                              | 拒绝     |
| 5   | `validateCanonDecision`：任务事实可见性、dynamicText 黑名单、按实体"正典主体"等级限制意图、`questHint` 必须有可见任务事实                  | 拒绝     |
| 6   | 意图目标实体/物件/物品必须在上下文可见集合内（`validateIntentTargets`）                                                                    | 拒绝     |
| 7   | lineId 台词属于 profile 且属于上下文白名单                                                                                                 | 拒绝     |
| 8   | dynamicText：模式允许、语言等于玩家 locale、`polishDynamicSpeech` 润色后长度 1 到 180、不是低信息量问句（`isLowInformationDynamicSpeech`） | 拒绝     |

被拒或 provider 出错时，A 路径用本地候选台词兜底（`npcLocalFallbackEvent` 等），只有本地也无候选时才给玩家发本地化错误。

### 2.8 择优与"执行到 sim"

`directNpcReplyEvents` 按话题决定最终说哪句：

| 话题               | 优先顺序（取第一个非空）                                                       |
| ------------------ | ------------------------------------------------------------------------------ |
| `rumor`            | 模型 dynamicText > 本地记忆台词 > 导演台词 > 痕迹台词 > 话题台词 > 模型 lineId |
| `place` / `recent` | 模型 dynamicText > 导演 > 痕迹 > 话题 > 高优先场景事件 > 模型 lineId           |
| `quest_hint`       | 话题台词 > 记忆 > 导演 > 痕迹 > 场景（**完全不用模型输出**）                   |
| 其余（greeting）   | 模型 dynamicText > 记忆 > 痕迹 > 导演 > 高优先场景事件 > 模型 lineId           |

要点：

- 模型真正有价值的输出是 dynamicText；模型选的 lineId 优先级低于本地规则台词。
- 意图在 A 路径里只被映射为 `aiSpeech.reaction`（approach/avoid/inspect 徽标与注意力连线），**不会让 NPC 移动或做任何事**。
- 事件带 `pid`，`routeEvents` 只把带 pid 的事件发给该玩家：两名玩家站在同一 NPC 旁，看到的是各自私有的台词。
- 唯一由模型决定世界后果的是宠物：`handlePetCommand` 把第一个 `commandPet*` 意图映射成 `AiPetCommandAction`（设模式、攻击、嘲讽、忽略）。

### 2.9 日志与审计

| 层                           | 内容                                                                                                                                                                                                             | 存储                                                                              | 保留                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| 决策日志 `AiDecisionJournal` | 序号、jobId、trigger、实体、状态（accepted/rejected/provider_error/local_reaction）、lineIds、意图、记忆写入                                                                                                     | 内存环形，默认 80 条                                                              | 进程生命周期                                    |
| 审计记录 `AiAuditRecord`     | 身份字段、provider 来源、状态、延迟、估算 token、prompt/输出字符数、上下文计数、lineIds、意图、记忆写入引用、`chain`（完整上下文、prompt 文本最多 64k 字符、原始输出最多 64k、解析后的决策、校验结果、投递事件） | 内存窗口桶（1 分钟到 24 小时）+ Postgres `ai_audit_records`（只存 provider 作业） | `AI_AUDIT_RETENTION_DAYS`，默认 90 天，夜间清扫 |
| 主动触发决策                 | 规则、玩家、说话者、lineId                                                                                                                                                                                       | 内存，默认 40 条                                                                  | 进程生命周期                                    |
| 记忆写入                     | `AiMemoryAuditRecord`                                                                                                                                                                                            | 写入队列批量 flush 到 `ai_memory_records`                                         | 见第 3 节                                       |

审计设计文档 `docs/design/ai-audit-center.zh_CN.md` 写明"不保存完整 prompt 原文"，代码实际保存最多 64k 字符的 prompt 文本（已核实，`AI_AUDIT_PROMPT_MAX_CHARS`）。prompt 中包含玩家角色名与任务进度，属于需要关注的隐私面。

### 2.10 B 路径（主动触发）的差异

```
setInterval 30s -> GameServer.runAiActiveTriggers
  -> bridgeWorldDirectorStatesToActiveQueue (把世界导演状态变化转成事件)
  -> AiActiveTriggerService.tick
       |  无在线会话 -> 跳过 (no_online_players)
       |  populationPolicyForOnline(在线数) -> solo/small/busy/crowded/protected 分档
       |  1) 先处理事件队列 (TTL 90s，最多 64 条)
       |  2) 再按规则 x 会话游标检查到期轮询
       v
  tryFireRule
       |  玩家死亡/战斗中/刚收到 AI 台词 -> 跳过
       |  在玩家 28 码内选候选 NPC/生物 (bestNpcCandidate / bestCreatureRoutineEvent)
       |  本地规则算出 routine 计划与本地台词 (routineAwarenessEvent)
       |  本地规则决定真实动作 -> Sim.aiActiveNpcAction(shortMove) / Sim.aiActiveMobAction
       |  若规则允许且预算够 -> 先只回 aiThinking，异步调模型补台词
       |  否则直接回 aiThinking + 本地台词
       v
  模型返回 -> validateAiDecision -> 通过则投递模型台词，否则投递本地台词
```

| 默认规则                  | 类别            | 周期（秒） | providerPolicy | 每玩家冷却（秒） |
| ------------------------- | --------------- | ---------- | -------------- | ---------------- |
| `scene_ambient_awareness` | sceneAmbient    | 300        | codexPreferred | 90               |
| `npc_living_routine`      | livingRoutine   | 300        | codexAllowed   | 120              |
| `creature_living_routine` | creatureRoutine | 300        | codexAllowed   | 105              |
| `npc_social_sequence`     | socialSequence  | 360        | codexAllowed   | 150              |

关键事实：B 路径里"做什么动作"全部由本地规则决定（`NPC_ROUTINE_ACTIONS`、`activeMobActionIntentForRoutine`、`tryApplyQueuedEventAction`），模型只负责把同一时刻的台词说得更活。

---

## 3. 人设与记忆

### 3.1 Profile 字段（`server/ai/profiles.ts` 的 `AiAgentProfile`）

| 字段                                                     | 含义                                     | 实际形态                                                                                              |
| -------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `id`、`appliesTo`                                        | 标识与适用模板                           | 一个 profile 可覆盖多个模板（如 Brother Aldric 的 4 个分身）                                          |
| `persona`                                                | 人设                                     | 一句英文，例如"A worried priest who reads weather, graves, and player choices as omens."              |
| `allowedIntentTypes`、`allowedLineIds`、`fallbackLineId` | 行为与台词白名单、兜底台词               | 具名 NPC 通常只有 1 个专属 lineId                                                                     |
| `canonSensitive`                                         | 是否正典敏感                             | 布尔                                                                                                  |
| `knowledgeScope`、`tabooTopics`                          | 知识范围与禁忌                           | 各 3 到 5 个短语，只进题面，没有结构化知识库支撑                                                      |
| `speechFingerprint`                                      | 说话指纹                                 | 句子节奏、称呼方式、常用开头、感官偏好、回避用语；未显式设置时按 persona 文本正则匹配到 11 种原型之一 |
| `socialMemory`                                           | 记忆风格与认人/传闻台词 key              | 风格是一句 prose                                                                                      |
| `sceneAffinities`                                        | 喜欢/回避/会评论的场景标签               | 标签数组                                                                                              |
| `itemInterest`                                           | 被吸引/回避的物品标签                    | 标签数组                                                                                              |
| `timeWeatherSensitivity`                                 | 白天精力、夜间疲惫、晴夜敬畏、雨烦、雾惧 | 5 个 0 到 1 的系数                                                                                    |
| `companionReactions`                                     | 对玩家同伴的反应                         | 少量条目                                                                                              |

**缺失**：没有目标/需求/欲望、没有日程、没有阵营立场与对他人的关系、没有秘密与可被发现的知识条目、没有情绪状态、没有成长或变化。

内容覆盖（只读执行 `aiContentCoverageReport()`，已核实）：

| 项                                                            | 数量                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| NPC 定义总数（`NPCS`）                                        | 41                                                                                   |
| 有任务/商店/市场的"可交互 NPC"                                | 29，全部被覆盖                                                                       |
| 具名 profile（`buildForkAiProfilePack`）                      | 24                                                                                   |
| 通用 profile                                                  | 3（`GENERIC_NPC_AI_PROFILE`、`GENERIC_MOB_AI_PROFILE`、`GENERIC_OBJECT_AI_PROFILE`） |
| 生物家族语义（`FAMILY_SEMANTICS`）                            | 12 个家族                                                                            |
| 场景锚点（`SCENE_ANCHORS`）/ 语义物件                         | 7 / 21                                                                               |
| 客户端 AI 台词 key（`src/ui/i18n.catalog/fork_ai_speech.ts`） | 约 140                                                                               |

个体性：`server/ai/singularity.ts` 的 `individualProfileFor` 用"世界种子 + 模板 + 实体 id"的哈希给普通怪分层（分数不低于 0.93 为 singularity，不低于 0.72 为 quirk），按家族抽取 7 种怪癖之一，用来廉价制造"少数个体醒来"的错觉。

### 3.2 记忆存储一览

| 存储                                    | 键                                               | 内容                                                                                         | 保留与遗忘                                                                                                          | 持久化                                   |
| --------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `AiSocialMemoryStore` NPC 记忆          | 玩家实体 id + NPC 模板                           | 交互次数、`affinity`（每次 +0.08，封顶 1，从不下降）、最近 5 个场景                          | 最多 120 条，超出删最久未交互                                                                                       | 仅内存                                   |
| `AiSocialMemoryStore` 传闻              | 来源玩家 + 场景/区域                             | 物品或任务的"传闻"，强度随时间线性衰减，区域传播系数 0.65                                    | TTL 90 秒，最多 12 条                                                                                               | 仅内存                                   |
| `AiWorldTraceStore` 世界痕迹            | 场景 + 来源玩家                                  | 掉落物留下的痕迹（singularity/cursed/food/valuable/generic）                                 | TTL 90 秒，最多 16 条                                                                                               | 仅内存                                   |
| `AiCreatureMemoryStore` 生物记忆与计划  | 实体 id + 玩家实体 id                            | 交互次数、特质；计划种类 9 种（追味、收集、守地、避人、观星、预兆、觅食、护巢、误会）        | 记忆 300 秒/80 条，计划 90 秒/48 条                                                                                 | 仅内存                                   |
| `AiBossEncounterMemoryStore` / 阶段提示 | 场景 + 玩家                                      | 击败/团灭、热度                                                                              | 300 秒/24 条；阶段提示 180 秒/48 条                                                                                 | 仅内存                                   |
| `AiWorldDirectorStore` 世界导演         | 场景/区域 + 来源玩家                             | 情绪（8 种）、提案、热度                                                                     | 180 秒/24 条                                                                                                        | 仅内存                                   |
| `ai_memory_records`                     | `(realm, kind, ref_id, source_player_entity_id)` | `AiMemoryAuditRecord`：种类、范围、场景、区域、实体、模板、物品、任务、lineIds、显著度、原因 | 主动台词记忆 7 到 21 天（sim 时间）；每 120 秒按 `sim_expires_at` 清理；总量 25 万、每玩家 2 万的预算按种类比例淘汰 | Postgres                                 |
| ambient bots 联系人                     | 真人角色名                                       | 首次/最近看见、看见次数、私聊收发次数、好友标记                                              | 最多 48 个，删最久未见                                                                                              | `ambient_player_bots.social_state` JSONB |
| hosted play 联系人                      | 同上                                             | 同上                                                                                         | 同上                                                                                                                | 仅内存（关闭托管即丢）                   |

### 3.3 写入、检索、保留、遗忘的流程

```
写入：交互/事件 -> 各内存 store 更新 -> 生成 AiMemoryAuditRecord -> enqueueMemoryWrites
                                                         -> 每批 32 条 flush 到 ai_memory_records (upsert)
检索：同一玩家 + 当前场景 -> 内存 store 精确查找（场景优先，其次同区域，其次相邻区域）
      同一玩家 + 场景/区域 + 未过期 -> SQL 按 salience DESC, 创建时间 DESC 取前 8 条
保留：内存 store 用 TTL 加条数上限；Postgres 用 sim 时间过期 + 预算淘汰 + 后台一键清空
遗忘：线性衰减（热度/强度随年龄下降，设下限），无"重要事件被长期记住、琐事被压缩"的分层
```

### 3.4 记忆层面的关键问题（均已核实）

1. **身份键是会话级实体 id**。`server/ai/` 内没有任何 `characterId` 或 `accountId` 引用；`Sim.addPlayer` 每次入场用 `this.nextId++` 分配新实体 id。玩家重新登录后，NPC 不再认得他；服务器重启后实体 id 从 1 重新分配，持久化记忆可能匹配到另一位玩家（推断）。
2. **时间基准是 sim 相对时间**。`Sim.time` 初始为 0，服务器不恢复它；而持久记录用 `sim_created_at`/`sim_expires_at`，重启后过期判断与清理都会错位（推断）。
3. **记忆没有内容**。记录只存 lineId、标签与原因串；dynamicText 台词的 lineIds 为空，NPC 记不住自己说过的话，也记不住玩家说了什么。
4. **没有摘要与反思**。设计文档 `docs/design/ai-interactable-agents.zh_CN.md` 规划了"深反思层"（Codex 批处理生成计划、压缩记忆、扩展人格与关系）和 `server/ai/memory_store.ts`，代码中均不存在。
5. **好感单调递增**。`affinity` 只加不减，与玩家行为善恶无关，只是"见过几次"的别名。
6. **七套 store 各自为政**，TTL 从 90 秒到 21 天不等，没有统一的记忆流或统一检索接口。

---

## 4. 社交与对话

### 4.1 NPC 与玩家

| 维度   | 现状                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| 输入   | 客户端只开放 4 个固定话题（服务器支持 5 个），玩家不能自由提问；宠物是唯一接受自由文本的入口                     |
| 轮次   | 每次一句（社交序列最多 3 句），没有多轮上下文                                                                    |
| 认人   | 依赖内存 `interactionCount`，换会话即失忆                                                                        |
| 呈现   | 聊天行（say 或 emote 频道，带 `[AI]` 标识，`chatAiTagEl`）、头顶气泡、思考徽标、注意力连线；气泡本身没有 AI 标识 |
| 本地化 | lineId 模式走 `hudChrome.aiSpeech.*` key 加参数；dynamicText 由模型直接按玩家 locale 生成，绕开 i18n 目录        |

### 4.2 NPC 与 NPC

- 唯一的 NPC 间对话是 B 路径的 `npc_social_sequence`：玩家附近 2 到 3 个 NPC，围绕一个焦点物件，用一次模型调用生成至多 3 句交替台词（`buildNpcSocialSequence`、`providerSocialSequenceEvents`）。
- 这些台词带 `pid`，只发给触发它的那一名玩家，是"演给玩家看的小剧场"。
- 对话后不更新任何 NPC 之间的关系，不交换信息，不写入对方的记忆。

### 4.3 信息传播

| 机制                            | 名义                          | 实际                                                                                                                                                           |
| ------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 传闻 `AiRumorMemory`            | 物品/任务传闻在场景与区域扩散 | 检索条件包含 `sourcePlayerEntityId === playerEntityId`，传闻只会回声给制造它的同一玩家；TTL 90 秒                                                              |
| 世界导演 `AiWorldDirectorStore` | 区域情绪与提案                | 同样按来源玩家过滤；`AiWorldDirectorProposal` 的 `status` 字面量恒为 `'preview'`，`risk` 恒为 `'low'`，提案从不被执行；唯一后果是经事件队列让附近 NPC 小步移动 |
| 任务完成 `handleSimEvents`      | 意图标签写着 `spreadRumor`    | 生成同一玩家可见的传闻与导演状态                                                                                                                               |

结论：现有"传播"是**同一玩家的个人回声**，不是世界级的信息扩散。

### 4.4 关系更新

- NPC 对玩家：`affinity` 单调递增（见 3.4）。
- NPC 对 NPC：无。
- ambient bots 对真人：只有计数器，没有情感、立场、信任度；机器人之间的私聊被过滤，不建立关系。

### 4.5 日程与生活层

| 设计文档承诺                                                                          | 代码现状                                                                                                                                                                                |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AiLivingRoutineStateV1`：当前活动、家锚点、目标锚点、开始/到期时间、下次到期、可中断 | 不存在（已核实，全仓库无此符号与 `homeAnchor`）                                                                                                                                         |
| NPC 有饭点、睡眠、巡逻、祈祷等生活节奏                                                | `npcRoutinePlanFor` 在"玩家靠近且轮询到期"的那一刻，根据职业角色、天气、时间算出 13 种 routine 标签之一（working、sleeping、shelter、praying、patrolling 等），配一句台词与一次小步移动 |
| 生活动作可回位                                                                        | `Sim.aiActiveNpcAction` 的 `shortMove`：距离 0.8 到 2.6 码，回家半径对任务/商店 NPC 为 3 码、其他 6 码；`returnHome` 回位                                                               |

生活层的本质是**即时标签加微动作**：没有持续状态、没有时间表、没有"上午在铁匠铺、晚上去酒馆"，玩家不在 28 码内时什么也不发生（`no_online_players`、`no_candidate`）。

`server/ai/life_layer.ts` 的命名容易误导：它是"反应式交互编排器"，不是生活模拟。

### 4.6 机器人与托管的聊天

- ambient bots：私聊回复在收到后 2.5 到 6 秒到期（`replyDelayMs`），而模型调用最长 60 秒，到期时用已就绪的文本，否则用模板 `buildReplyText`；多数回复会是模板（推断）。队伍聊天按 `party_intent` 生成模板，模型只改措辞。
- hosted play：从不调用 `decidePartyChat`，队伍聊天永远是模板；模板私聊文案"sticking to solo questing for now"与组队自动邀请的行为互相矛盾。
- 两者都没有日程：ambient 机器人只在有真人聚类时存在。

---

## 5. 世界观守卫：如何防止模型胡编

### 5.1 防线分层

| 层           | 机制                                                                                                                              | 位置                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 题面         | 硬规则："只用 job.json 的事实"、"不得揭示隐藏任务答案或承诺完成"、"导演提案与记忆信号只读"                                        | `buildCodexDecisionPrompt`                                      |
| 事实投喂     | 只投喂玩家可见的任务事实（`AiQuestFact.visibility` 四档：knownToPlayer、currentObjective、nearbyClue、rumored），summary 仅任务名 | `buildNpcContext`、`validateCanonDecision`                      |
| 结构         | JSON Schema 强制输出形态                                                                                                          | `AI_DECISION_OUTPUT_SCHEMA`                                     |
| 白名单       | 意图 = 上下文白名单 ∩ profile 白名单 ∩ 正典主体白名单；lineId 双白名单                                                            | `validateAiDecision`、`allowedIntentsForSubject`                |
| 正典主体分级 | 关键任务 NPC、奖励来源 NPC、关键任务怪、关键任务物件、副本门、普通，按级收窄可用意图                                              | `classifyCanonSubject`                                          |
| 黑名单       | dynamicText 不得含任务完成/失败、奖励、经验、金银铜、声望、系统提示、"真正的叛徒"等中英短语，以及 URL、HTML、Markdown 链接        | `QUEST_DYNAMIC_TEXT_BLOCKLIST`、`dynamicTextViolatesQuestGuard` |
| 收束模式     | 任务提示话题强制 `line_id_only`，且择优时完全不用模型                                                                             | `npcConversationOutputMode`、`directNpcReplyEvents`             |
| 目标可见     | 意图目标必须在上下文中可见                                                                                                        | `validateIntentTargets`                                         |
| 口吻         | 反助手腔规则 + 后处理润色 + 低信息量拦截                                                                                          | `server/ai/speech_style.ts`                                     |
| 内容覆盖     | profile 作者校验、家族语义完整度、场景锚点深度、关键物品语义覆盖，并在后台展示                                                    | `server/ai/content_coverage.ts`                                 |

### 5.2 场景语义（scene semantics）

- `SCENE_ANCHORS` 是手写的 7 个场景锚点（如 `eastbrook_forge`、`fallen_chapel`），每个带生物群落、地点、建筑、环境标签与语义物件（含 featureTags 与 affordanceTags）。
- `sceneFrameFor` 再叠加附近实体、掉落物、同伴、危险度（亡灵压力、敌对密度、尸体密度、近期死亡、安全度）。
- 时间与天气由 `server/ai/time_weather_model.ts` 在服务器侧计算：一天 24 分钟 sim 时间分 4 段；天气按"区域 + 时间块"哈希决定，任何区域都可能下雨。

### 5.3 局限（均已核实，除标注外）

1. **黑名单是子串匹配**：`'xp'` 会命中 "explore"，`'gold'` 会命中 "golden"，`'经验'` 会命中"经验丰富"，导致合理台词被拒后退回本地兜底。
2. **没有事实核验**：防胡编主要靠"不给它看隐藏信息"加黑名单；模型若编造世界观人物、地名、历史，不会被发现。`knowledgeScope` 只是题面里的几个短语。
3. **感知与玩家所见不一致**：AI 侧天气是哈希随机（Eastbrook 也会"下雨"），而渲染端 `src/render/weather.ts` 按区域固定（山地下雪、沼泽下雨、其余晴）；AI 侧有昼夜，客户端渲染未见昼夜循环。NPC 可能抱怨"冷雨"或谈论"星空"，而玩家看到的是晴天正午。
4. **场景语义覆盖窄**：只有 7 个锚点，锚点之外的地方只剩区域级标签。
5. **无毒性/不当内容过滤**：只有正典黑名单与 URL/HTML 过滤；ambient bots 把玩家私聊原文直接放进题面，存在提示注入面（推断其影响有限，因为输出受 schema 与长度约束）。

---

## 6. 成本、限流、审计与管理后台

### 6.1 控制手段一览

| 手段     | A 反应式                                                      | B 主动                                                                                                                                                               | C ambient                                           | D hosted                               |
| -------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------- |
| 总开关   | `AI_LIVING_WORLD_EXPERIMENT`（默认开，仅启动时读）            | 三个子开关，后台可热改（重启丢失）                                                                                                                                   | 实验开关 + 后台 `allowLlmDecisions`                 | 每角色开关 + `HOSTED_PLAY_LLM_ENABLED` |
| 调用预算 | 无                                                            | 5 小时 600 次、每周 5000 次，预留 20%（`AI_CODEX_ACTIVE_MAX_CALLS_5H` 等）                                                                                           | 全体机器人共享 5 小时 300 次、每周 2500 次          | 进程级 5 小时 300 次、每周 2500 次     |
| 并发     | 无全局上限                                                    | 每 (规则, 玩家, 实体) 至多一个在途                                                                                                                                   | 每机器人至多一个在途 plan，无全局上限               | 每角色至多一个在途 plan                |
| 冷却     | 会话 4 秒/2 秒                                                | 每玩家/每实体/每规则冷却；玩家 5 秒内有操作则推迟模型                                                                                                                | plan 240 秒（目标变化即绕过）、私聊每联系人 45 秒   | 同 C                                   |
| 人口分档 | 无                                                            | 在线 1、5、20、50 为界；21 到 50 人时最低规则优先级升到 50，只剩 `scene_ambient_awareness` 能触发；超过 50 人时门槛升到 80，默认 4 条规则（优先级 43 到 50）全部停摆 | 单人聚类 30 个，每多 1 名真人加 1 个，每聚类上限 50 | 无                                     |
| 缓存     | 12 秒、128 条                                                 | 同 A                                                                                                                                                                 | 256 条，键含距离，几乎不命中（推断）                | 同 C                                   |
| 计量     | 估算 token（字符数除以 4）、调用数、延迟分位、错误、接受/拒绝 | 同 A + 预算剩余                                                                                                                                                      | 内存指标                                            | 状态接口                               |
| 金额     | 无                                                            | 无                                                                                                                                                                   | 无                                                  | 无                                     |

### 6.2 管理后台

- 页面：`src/admin/pages/AiOperations.svelte`（审计卡片与详情、主动规则编辑、用量窗口表、内容覆盖、profile 预览、诊断），数据来自 `GET /admin/api/ai/diagnostics` 与 `GET /admin/api/ai/audit/:id`。
- 权限：读需要 `botdetector.read`，写（清空记忆、清理审计、改主动规则、取消序列）需要 `botdetector.configure`，只有 admin 与 superadmin 拥有。借用反机器人权限而非独立的 AI 运营权限。
- ambient bots 有独立接口：`/admin/api/ambient-bots`（读）、`/config`、`/control`、`/logout-all`。注意 planner `enabled:false` 不会让已上线机器人下线。
- ambient/hosted 的 LLM 审计只在 `runner_state` 中保留每种调用的"最后一次"，不是追加式审计。

### 6.3 成本与规模的结构性问题

- exec 模式每次调用都创建临时目录并启动一个 Codex CLI 进程，单次延迟以秒计；反应式路径没有预算，在线人数增加时成本线性增长且无上限。
- 主动路径的 600 次/5 小时预算对"每个玩家附近都有生活"的世界远远不够，而人口分档在 21 人以上就砍掉 3 条规则、50 人以上让默认轮询全部停止（`populationPolicyForOnline` 的 `minRulePriority`），世界越热闹 NPC 越安静。
- 没有按模型、按 token 计价的金额核算，无法做成本 SLO。
- ambient 机器人每个都是一个完整 WS 会话，与游戏 tick 共用同一事件循环。

---

## 7. 客观评估

### 7.1 优点

| 序  | 优点                                                               | 代码证据                                                                                                         |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 1   | 权威边界清晰：模型永远不直接改世界，真实后果只能经过有守门的动作桥 | `Sim.aiActiveMobAction` 拒绝 boss/精英/稀有、距离过远、玩家战斗中、非 idle；`Sim.aiActiveNpcAction` 夹紧回家半径 |
| 2   | 输入输出有版本化契约                                               | `AiJobContextV1`、`AiDecisionV1`、`AI_DECISION_OUTPUT_SCHEMA`                                                    |
| 3   | 多重白名单与目标可见性校验                                         | `validateAiDecision`、`validateIntentTargets`、`allowedIntentsForSubject`                                        |
| 4   | 本地兜底优先，模型失败不阻塞体验                                   | `npcLocalFallbackEvent`、B 路径先出本地台词                                                                      |
| 5   | 题面按触发裁剪，场景信息语义化程度高                               | `PROMPT_POLICIES`、`SceneFrameV1`                                                                                |
| 6   | 口吻控制细致，中英双语都有反助手腔规则与后处理                     | `dynamicSpeechPromptRules`、`polishDynamicSpeech`、`SPEECH_FINGERPRINTS`                                         |
| 7   | 可观测性强：全链路审计、分步耗时、延迟分位、内容覆盖报告           | `AiAuditRecord.chain`、`providerTimings`、`aiContentCoverageReport`                                              |
| 8   | Codex 子进程隔离到位                                               | `createCodexIsolation`、`minimalCodexChildEnv`、`codexLockdownArgs`                                              |
| 9   | 主动路径有预算窗口、预留比例、人口分档与跳过原因枚举               | `AiActiveSkipReason`、`populationPolicyForOnline`                                                                |
| 10  | 测试充足                                                           | `tests/` 下 40 余个 AI 相关测试文件（`ai_*.test.ts`、`server_ai_*.test.ts` 等），ambient/hosted 另有十余个       |
| 11  | 逻辑大多在独立模块，`game.ts` 中 AI 胶水约 6%                      | `server/ai/*.ts` 分文件                                                                                          |
| 12  | 机器人走真实客户端协议，sim 零侵入                                 | `AmbientPlayerBotApiClient`、`AmbientPlayerBotWsClient`、`dispatchMessage(..., 'hosted')`                        |
| 13  | 廉价的个体性与群体本能                                             | `individualProfileFor`、`FAMILY_SEMANTICS`                                                                       |
| 14  | 延迟掩饰与 AI 披露                                                 | `aiThinking` 事件、思考徽标、`[AI]` 聊天标识                                                                     |

### 7.2 问题清单

严重度：高 = 与"自主生活型居民"目标直接冲突；中 = 影响质量或可运维性；低 = 局部缺陷。

| 序  | 问题                                                                                                                                                                                                                                                                                    | 严重度     | 代码证据                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 以反应式台词为主，没有持续的自主生活与目标：一切发生在"玩家 28 码内 + 玩家触发或轮询到期"，无人在线时调度器直接返回                                                                                                                                                                     | 高         | `CANDIDATE_RADIUS = 28`、`scope: 'playerVicinity'`、`AiActiveSkipReason` 的 `no_online_players`；`populationPolicyForOnline` 在 50 人以上停掉全部默认轮询；`AiAgentProfile` 无目标/需求/日程字段 |
| 2   | 模型几乎不改变世界状态：A 路径意图只转成徽标；B 路径动作由本地规则选；C/D 的模型不碰玩法；唯一模型决定的世界后果是宠物指令                                                                                                                                                              | 高         | `reactionFromProviderIntents`、`tryApplyNpcRoutineAction`、`activeMobActionIntentForRoutine`、`tickAmbientPlayerBotBrain` 不接收 plan、`petCommandActionFromIntent`                              |
| 3   | 记忆碎片化且身份键错误：会话实体 id + sim 相对时间；7 套 store 各自 TTL；只存标签不存内容；无摘要与反思；好感单调递增                                                                                                                                                                   | 高         | `npcMemoryKey`、`ai_memory_records.source_player_entity_id`、`Sim.time = 0`、`AiSocialMemoryStore.noteNpcInteraction`                                                                            |
| 4   | "社会"是同一玩家的私人回声：传闻与导演按来源玩家过滤；NPC 对话序列只投递给一名玩家；NPC 之间无关系、无信息交换                                                                                                                                                                          | 高         | `rumorForScene`、`stateForScene` 的 `sourcePlayerEntityId` 过滤；事件 `pid` 路由                                                                                                                 |
| 5   | 对话浅：客户端只开放 4 个固定话题、单句、无多轮历史，模型线程每轮重置；任务提示话题完全不用模型                                                                                                                                                                                         | 中         | `AiNpcInteractionTopic`、`CodexAppServerProvider` 每轮 `createThread`、`directNpcReplyEvents`                                                                                                    |
| 6   | 世界观守卫是负面清单：子串黑名单误杀；无事实核验；AI 感知天气/昼夜与渲染不一致                                                                                                                                                                                                          | 中         | `QUEST_DYNAMIC_TEXT_BLOCKLIST`、`weatherSemanticAt` 对比 `src/render/weather.ts`                                                                                                                 |
| 7   | 成本与规模：每调用一个 CLI 进程；反应式无预算与并发上限；token 只做估算无金额；只有单一厂商后端                                                                                                                                                                                         | 中         | `CodexCliProvider`、`decideWithProviderCache`、`estimateAiTokens`、`defaultAiProvider`                                                                                                           |
| 8   | 与 `server/game.ts` 耦合：AI 处理器、计时器、导演桥、审计 sink、后台透传都挂在 `GameServer` 上                                                                                                                                                                                          | 中         | `handleAiInteractNpc`、`runAiActiveTriggers`、`bridgeWorldDirectorStatesToActiveQueue`、构造函数中的 `aiAuditSink`                                                                               |
| 9   | fork 扩展已与上游漂移：ambient 机器人仍发 `t:'auth'`，而 `server/ws_auth.ts` 只接受 `ONLINE_WORLD_AUTH_TYPE`（`auth-world-<版本>`），会以 `incompatibleWorldLayout` 拒绝，机器人当前无法登录                                                                                            | 中         | `AmbientPlayerBotWsClient.connect` 对比 `ws_auth.ts`；单测用假 socket 断言 `t:'auth'` 因而通过                                                                                                   |
| 10  | hosted play 的事件捕获挂在 `send()`，而 `routeEvents` 用 `sendRaw(assembleEventsFrame(...))` 投递 sim 事件，托管侧大概率收不到私聊、组队邀请、队伍聊天事件                                                                                                                              | 中（推断） | `captureHostedPlayWireState` 只在 `GameServer.send` 中调用                                                                                                                                       |
| 11  | `runAiActiveTriggers` 把 `this.clients.values()` 原样交给调度器，未过滤 ambient 机器人会话：机器人会被当作在线玩家触发 AI 片段、消耗预算并抬高人口分档，1 名真人加默认 30 个机器人即进入 crowded 档、只剩 1 条轮询规则（同文件 `ambientHumanPresenceSnapshot` 却过滤了 `ambientBotId`） | 低到中     | `runAiActiveTriggers` 对比 `ambientHumanPresenceSnapshot`                                                                                                                                        |
| 12  | 设计文档与实现脱节：深反思层、记忆压缩、`characterId` 关系记忆、`AiLivingRoutineStateV1`、NPC 间传话未实现；审计文档称不存 prompt 实际存 64k                                                                                                                                            | 中         | 全仓库无 `memory_store.ts`、`AiLivingRoutineStateV1`；`AI_AUDIT_PROMPT_MAX_CHARS`                                                                                                                |
| 13  | AI 只在线存在；动作由墙钟定时器在 tick 外注入，不能按种子复现                                                                                                                                                                                                                           | 低         | 离线 `Sim.aiInteractNpc` 桩；`setInterval(..., AI_ACTIVE_TRIGGER_INTERVAL_MS)`                                                                                                                   |
| 14  | dynamicText 绕过 i18n 目录；无毒性过滤                                                                                                                                                                                                                                                  | 低         | `validateAiDecision` 只校验语言等于 locale                                                                                                                                                       |
| 15  | ambient/hosted 的模型输出大多用不上：私聊截止 2.5 到 6 秒对 60 秒子进程；`socialMode` 不影响行为；目标变化即绕过 plan 冷却                                                                                                                                                              | 低         | `replyDelayMs`、`maybeQueuePlanDecision`                                                                                                                                                         |
| 16  | 缺少本地约定文档：`server/ai/`、`server/ambient_bots/`、`server/hosted_play/` 都没有 `CLAUDE.md`，`server/CLAUDE.md` 几乎未记录 AI 子系统                                                                                                                                               | 低         | 目录清单                                                                                                                                                                                         |

### 7.3 与"自主生活型 AI 居民"的差距对照

| 能力       | 自主生活型居民需要什么                     | 本仓库现状                                   | 差距         |
| ---------- | ------------------------------------------ | -------------------------------------------- | ------------ |
| 存在性     | 无人观看时也在生活（可低精度）             | 只在在线玩家 28 码内、轮询到期时出现         | 大           |
| 目标与需求 | 长期目标、短期需求（饥饿、钱、名声、信仰） | profile 无此字段                             | 大           |
| 日程       | 按时间表在地点间移动、工作、休息           | 即时 routine 标签 + 0.8 到 2.6 码小步移动    | 大           |
| 计划与执行 | 计划分解、执行、被打断后重规划             | `AiCreaturePlan` 只是徽标元数据，NPC 无计划  | 大           |
| 记忆流     | 以稳定身份为键、含内容的长期记忆           | 会话 id 为键、只存标签                       | 大           |
| 反思与摘要 | 定期把经历压缩为观点与印象                 | 无                                           | 大           |
| 关系       | 双向、可增可减、带情感与立场               | 单向单调的 affinity                          | 大           |
| NPC 间社交 | 彼此对话改变关系与认知                     | 演给单个玩家看的 2 到 3 句序列               | 大           |
| 信息传播   | 消息在人际网络中扩散、失真、被核实         | 同一玩家的 90 秒回声                         | 大           |
| 行动空间   | 交易、生产、迁徙、结盟、冲突               | NPC 侧步、回家；怪物开怪/逃跑/呼救（规则选） | 大           |
| 世界后果   | 决策改变经济、任务、阵营、地块             | 无                                           | 大           |
| 对话       | 自由输入、多轮、记得上下文                 | 4 个固定话题、单句                           | 中           |
| 安全与审计 | 白名单、校验、兜底、审计                   | 完备                                         | 小（优势项） |
| 成本控制   | 分层推理、预算、批处理、LOD                | 部分具备，缺金额与全局上限                   | 中           |

---

## 8. 对《箱庭纪》可直接复用或借鉴的部分

### 8.1 可复用或借鉴（18 条）

| 序  | 可借鉴点                                                                            | 来源                                                                     | 在《箱庭纪》中的用法建议                                                                   |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 1   | 版本化的决策输入输出契约（schemaVersion、jobId、entityRef、ttl、confidence、audit） | `AiJobContextV1`、`AiDecisionV1`                                         | 作为女神 GM、NPC、统治者共用的决策 IO 外壳，按角色扩展 payload                             |
| 2   | "模型产生意图，世界产生后果"的动作桥与守门                                          | `Sim.aiActiveMobAction`、`Sim.aiActiveNpcAction`                         | 所有 AI 决策都经由可测试的动作桥落地，桥负责距离、权限、保护对象、回执 `affectedEntityIds` |
| 3   | 意图白名单三重交集 + 目标可见性校验                                                 | `validateAiDecision`、`validateIntentTargets`                            | 平民、公会长、领主、女神各自拥有不同的意图集合，与当前情境、正典主体取交集                 |
| 4   | 正典主体分级                                                                        | `classifyCanonSubject`、`CanonGuardSubject`                              | 主线关键人物、剧情物件、女神神谕等高敏实体收窄行为空间                                     |
| 5   | 本地兜底优先、模型增色                                                              | `npcLocalFallbackEvent`、`directNpcReplyEvents`                          | 规则层保证世界照常运转，模型层负责"更像人"；模型挂掉时世界不停                             |
| 6   | 按触发裁剪上下文的策略表                                                            | `PROMPT_POLICIES`                                                        | 不同决策类型（日常、对话、经营、外交、神谕）用不同的上下文配额                             |
| 7   | 语义化场景帧与作者锚点                                                              | `SceneFrameV1`、`SCENE_ANCHORS`                                          | 2D 城镇的地点语义（功能、氛围、可供性）直接沿用这种标签结构                                |
| 8   | 说话指纹 + 反助手腔规则 + 后处理润色                                                | `SPEECH_FINGERPRINTS`、`dynamicSpeechPromptRules`、`polishDynamicSpeech` | 女神与 NPC 的口吻控制，中文规则可直接参考                                                  |
| 9   | Provider 适配接口 + 子进程/凭据隔离                                                 | `AiProvider`、`codex_isolation.ts`                                       | 接口形态可借鉴，隔离思路（环境变量白名单、禁用工具与联网）可直接沿用                       |
| 10  | 常驻 worker 池与分步耗时打点                                                        | `CodexAppServerProvider`、`providerTimings`                              | 用于延迟诊断与容量规划                                                                     |
| 11  | 主动调度规则表（周期、抖动、优先级、provider 策略、输出模式、三类冷却）             | `AiActivePollRuleV1`                                                     | 改造成"世界节拍"调度：不再只围着玩家，而是围着地区与组织                                   |
| 12  | 预算窗口 + 预留比例 + 人口分档 + 跳过原因枚举                                       | `populationPolicyForOnline`、`AiActiveSkipReason`                        | 推理预算分档、降级到规则层的策略与可观测的"为什么没触发"                                   |
| 13  | 全链路审计记录与后台详情                                                            | `AiAuditRecord.chain`、`ai_audit_records`、`AiOperations.svelte`         | 女神与统治者的每个决策都需要可回放的审计，供上位者（开发者）复核                           |
| 14  | 记忆预算策略（总量、每主体、种类比例、批量淘汰、显著度）                            | `AiMemoryBudgetPolicy`、`ai_memory_records` 索引设计                     | 大量 NPC 的记忆容量治理                                                                    |
| 15  | 内容覆盖报告与作者校验                                                              | `aiContentCoverageReport`、`aiProfileAuthoringValidationReport`          | 人设、地点、物品语义的生产工具化与 CI 校验                                                 |
| 16  | 种子哈希的个体性分层                                                                | `individualProfileFor`                                                   | 让平民或怪物中少数个体"更聪明"，把昂贵推理集中在少数人身上                                 |
| 17  | 群体本能矩阵                                                                        | `FAMILY_SEMANTICS`                                                       | 低智生物与普通平民的廉价"群体人格"，作为 LOD 低档                                          |
| 18  | 思考中事件 + AI 标识                                                                | `aiThinking`、`chatAiTagEl`                                              | 掩饰推理延迟、对玩家披露 AI 身份                                                           |

另外两个"形状可参考、语义需重做"的点：

- `AiWorldDirectorProposal`（意图、状态、风险、强度、目标、理由标签、安全备注、过期时间）的字段形状适合作为"女神 GM 提案"的雏形，但必须改成真正有审批与执行生命周期的提案，而不是永远 `preview` 的回声。
- ambient 机器人"以真实客户端身份接入、不改 sim"的思路适合做《箱庭纪》的自动化测试玩家或"AI 冒险者"，但大脑必须换成数据驱动。

### 8.2 不应带过去的部分

| 不要带走                                                                                         | 原因                         | 替代方向                                        |
| ------------------------------------------------------------------------------------------------ | ---------------------------- | ----------------------------------------------- |
| 以会话实体 id 与 sim 相对时间为键的记忆                                                          | 换会话失忆、重启后错配       | 稳定的角色/居民 id + 世界历法时间               |
| 按来源玩家隔离的传闻与"世界导演"                                                                 | 不是世界级社会，只是个人回声 | 世界共享的事件日志与知识传播网络                |
| 只在玩家附近运行的调度模型                                                                       | 无人观看时世界停摆           | 离屏低精度模拟（LOD）：规则层常驻、模型层抽样   |
| 只存 lineId 与标签、不存内容的记忆格式                                                           | 无法回忆具体经历             | 带内容、来源、可信度、情感的记忆条目 + 定期摘要 |
| 子串黑名单作为主要正典守卫                                                                       | 误杀且挡不住编造             | 结构化正典事实库 + 知识可见性 + 输出引用校验    |
| 每次调用启动一个 CLI 进程、绑定单一厂商、字符数除以 4 估算 token                                 | 延迟高、成本不可控           | 直连 API、批处理、真实 token 计费与金额预算     |
| 硬编码坐标与手写任务路线的机器人大脑（`AMBIENT_BOT_SOLO_QUEST_ROUTES`、`brain.ts` 中的区域常量） | 内容一扩就要改代码           | 数据驱动的目标与可供性规划                      |
| 把 AI 处理器与计时器挂在协调器（`GameServer`）上                                                 | 耦合、易漂移                 | 独立的 AI 运行时服务，经稳定接口读写世界        |
| AI 侧与渲染侧两套天气/昼夜模型                                                                   | 认知与画面矛盾               | 单一事实源的世界环境状态，AI 与渲染共读         |
| 缺少上游契约测试的 fork 扩展方式                                                                 | 已出现握手与事件捕获失效     | 对协议与事件通道做契约测试                      |
| 单调递增的"好感"                                                                                 | 不反映行为                   | 多维关系（信任、敬畏、利益、立场），可增可减    |

---

## 附录 A：关键文件与符号索引

| 主题       | 文件                                                                                                                                                      | 关键导出符号                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 类型契约   | `server/ai/ai_types.ts`                                                                                                                                   | `AiJobContextV1`、`AiDecisionV1`、`AiIntentType`、`AiProvider`、`AiMemoryAuditRecord`                                                     |
| 人设       | `server/ai/profiles.ts`、`server/ai/fork_pack.ts`                                                                                                         | `AiAgentProfile`、`AI_AGENT_PROFILES`、`profileFor`、`buildForkAiProfilePack`                                                             |
| 题面       | `server/ai/prompt_builder.ts`                                                                                                                             | `buildCodexDecisionPrompt`                                                                                                                |
| 校验       | `server/ai/intent_validator.ts`、`server/ai/canon_guard.ts`                                                                                               | `validateAiDecision`、`validateCanonDecision`、`classifyCanonSubject`                                                                     |
| 反应式编排 | `server/ai/life_layer.ts`                                                                                                                                 | `AiLifeLayer`                                                                                                                             |
| 主动调度   | `server/ai/active_triggers.ts`                                                                                                                            | `AiActiveTriggerService`、`DEFAULT_ACTIVE_POLL_RULES`                                                                                     |
| 记忆       | `server/ai/social_memory.ts`、`creature_memory.ts`、`boss_memory.ts`、`world_traces.ts`、`world_director.ts`、`memory_audit.ts`、`server/ai_memory_db.ts` | `AiSocialMemoryStore`、`AiCreatureMemoryStore`、`AiBossEncounterMemoryStore`、`AiWorldTraceStore`、`AiWorldDirectorStore`、`PgAiMemoryDb` |
| 场景       | `server/ai/scene_frame.ts`、`scene_semantics.ts`、`time_weather_model.ts`、`family_semantics.ts`                                                          | `sceneFrameFor`、`SCENE_ANCHORS`、`weatherSemanticAt`、`FAMILY_SEMANTICS`                                                                 |
| 个体性     | `server/ai/singularity.ts`                                                                                                                                | `individualProfileFor`                                                                                                                    |
| 口吻       | `server/ai/speech_style.ts`                                                                                                                               | `dynamicSpeechPromptRules`、`polishDynamicSpeech`                                                                                         |
| Provider   | `server/ai/codex_worker.ts`、`codex_app_server_provider.ts`、`codex_isolation.ts`                                                                         | `CodexCliProvider`、`CodexAppServerProvider`、`createCodexIsolation`、`codexLockdownArgs`                                                 |
| 内容覆盖   | `server/ai/content_coverage.ts`                                                                                                                           | `aiContentCoverageReport`                                                                                                                 |
| 审计       | `server/ai_audit.ts`、`server/ai_audit_db.ts`                                                                                                             | `AiAuditRuntime`、`AiAuditRecord`、`PgAiAuditDb`                                                                                          |
| 动作桥     | `src/sim/sim.ts`                                                                                                                                          | `Sim.aiActiveMobAction`、`Sim.aiActiveNpcAction`                                                                                          |
| 服务器胶水 | `server/game.ts`                                                                                                                                          | `GameServer.handleAiInteractNpc`、`runAiActiveTriggers`、`AI_ACTIVE_TRIGGER_INTERVAL_MS`                                                  |
| 机器人     | `server/ambient_bots/brain.ts`、`llm_coordinator.ts`、`llm_prompt.ts`、`llm_validate.ts`、`social.ts`、`party_chat.ts`                                    | `tickAmbientPlayerBotBrain`、`AmbientPlayerBotLlmCoordinator`、`AmbientBotCodexCliProvider`、`AMBIENT_BOT_SOLO_QUEST_ROUTES`              |
| 托管       | `server/hosted_play/runtime.ts`、`party.ts`、`llm.ts`、`action_log.ts`                                                                                    | `HostedPlayRuntime`、`tickHostedPlayPartyCoordinator`、`hostedPlayActionLogForResult`                                                     |
| 客户端     | `src/ui/hud.ts`、`src/ui/ai_reaction.ts`、`src/ui/hud/chat/chat_line.ts`、`src/ui/hud/quest/quest_dialog_controller.ts`、`src/world_api/interaction.ts`   | `aiSpeechPresentationView`、`chatAiTagEl`、`AiNpcInteractionTopic`                                                                        |
| 后台       | `src/admin/pages/AiOperations.svelte`、`server/admin.ts`                                                                                                  | `aiDiagnosticsPayload`                                                                                                                    |

## 附录 B：主要环境变量（只列名称）

| 子系统   | 变量                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A/B 总控 | `AI_LIVING_WORLD_EXPERIMENT`                                                                                                                                                                                                                                                                                                                                          |
| B 主动   | `AI_ACTIVE_EVENTS_ENABLED`、`AI_ACTIVE_POLLS_ENABLED`、`AI_ACTIVE_REAL_ACTIONS_ENABLED`、`AI_ACTIVE_POLL_BASE_SECONDS`、`AI_ACTIVE_ROUTINE_SECONDS`、`AI_ACTIVE_CREATURE_ROUTINE_SECONDS`、`AI_ACTIVE_SOCIAL_SEQUENCE_SECONDS`、`AI_ACTIVE_PROVIDER_IDLE_GRACE_MS`、`AI_CODEX_ACTIVE_MAX_CALLS_5H`、`AI_CODEX_ACTIVE_MAX_CALLS_WEEK`、`AI_CODEX_ACTIVE_RESERVE_RATIO` |
| Provider | `AI_CODEX_PROVIDER`、`AI_CODEX_MODEL`、`AI_CODEX_APP_SERVER_EFFORT`、`AI_CODEX_TIMEOUT_MS`、`AI_CODEX_APP_SERVER_POOL_SIZE`、`CODEX_BIN`                                                                                                                                                                                                                              |
| 缓存     | `AI_PROVIDER_DECISION_CACHE`、`AI_PROVIDER_CACHE_MAX_ENTRIES`、`AI_PROVIDER_CACHE_MAX_TTL_MS`                                                                                                                                                                                                                                                                         |
| 审计     | `AI_AUDIT_RETENTION_DAYS`                                                                                                                                                                                                                                                                                                                                             |
| ambient  | `AMBIENT_PLAYER_BOTS_EXPERIMENT`、`AMBIENT_PLAYER_BOTS_LLM_ENABLED`、`AMBIENT_PLAYER_BOTS_LLM_TIMEOUT_MS`、`AMBIENT_PLAYER_BOTS_LLM_MAX_CALLS_5H`、`AMBIENT_PLAYER_BOTS_LLM_MAX_CALLS_WEEK` 等                                                                                                                                                                        |
| hosted   | `HOSTED_PLAY_LLM_ENABLED`                                                                                                                                                                                                                                                                                                                                             |
