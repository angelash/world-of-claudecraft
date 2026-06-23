# AI 社交序列动态化需求卡

> **状态：已进入实现并持续迭代（2026-06-23）。**

本文记录 AI 生命层里“NPC/怪物连续聊天与连续行为”的最近一轮需求同步，重点不是整个活世界系统，而是社交序列这一条体验链。

## 目标

- 让附近多个对象的连续对话看起来像一段真正发生中的交流，而不是一人一句模板气泡。
- 让 Codex 返回的动态文本可以覆盖一整段对话里的前 2 到 3 个节拍，而不是只替换开场白。
- 让模型知道场上有哪些参与者、谁先说、谁回应、第三个旁观者何时插话。
- 当动态生成不完整时，序列仍然能自然收尾，不因为 provider 只回了 2 句就把后面节拍截断。

## 用户体验要求

- 玩家在 NPC 堆或同族怪堆附近，应该能看到带思考停顿的连续对话，而不是同一帧全部冒泡。
- 不同对象说的话应该分配到正确说话者头上，不能出现“一次 thinking 后所有话都像同一个人说的”。
- 如果动态生成只覆盖半段序列，后续尾拍应继续播放本地 lineId，而不是直接消失。
- 这套机制不能改变任务、奖励、掉落、经济、背包、主线状态或服务器战斗判定。

## 本轮范围

- 主动社交序列的 provider 输出支持 2 到 3 条 `dynamicText`。
- 社交序列上下文新增结构化参与者 roster。
- prompt 显式告诉模型当前是 paced social sequence，并约束 speech 顺序。
- 调度器支持“动态前半段 + 本地尾拍”混合播放。

## 非目标

- 不把所有主动 AI 事件都改成多句 speech。
- 不让单次 provider job 直接控制多个实体的真实移动、任务、仇恨或经济行为。
- 不在这一轮引入新的玩家 UI 入口或新的后台页签。

## 验收标准

- provider 返回 2 到 3 句时，节拍会按参与者顺序分发给不同对象。
- 普通非社交序列上下文仍然只允许单句 speech，不出现全局刷屏。
- provider 只回 2 句而现场有第 3 个节拍时，本地尾拍仍会继续播放。
- 相关单测、`tsc`、`build:server`、在线 smoke 和服务重启后的 `/api/status` 全部通过。

## 对应实现

- `server/ai/prompt_builder.ts`
- `server/ai/codex_worker.ts`
- `server/ai/intent_validator.ts`
- `server/ai/active_triggers.ts`
- `tests/ai_codex_worker.test.ts`
- `tests/ai_intent_validator.test.ts`
- `tests/ai_active_triggers.test.ts`
