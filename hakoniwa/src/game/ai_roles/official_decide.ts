// official.decide: an official (reeve, tax collector, judge, watch captain) handles one
// matter within their remit. Mid tier at low effort.
// See docs/40_design/systems/npc_society_ai.md 8.

import { definePack } from './shared';

export const officialDecide = definePack({
  role: 'official.decide',
  version: '1',
  tier: 'mid',
  effort: 'low',
  maxTokens: 1500,
  cacheTtl: '5m',
  priority: 'C',
  reserved: false,
  timeoutMs: 60_000,
  cooldownMs: 30_000,
  budgetShare: 0.1,
  maxCommands: 2,
  speech: true,
  thought: true,
  speechMaxChars: 100,
  thoughtMaxChars: 80,
  emptyIsDecision: false,
  intro:
    '你扮演《箱庭纪》中的一名官员，例如代官、税吏、法官或哨长，按职责处理一件眼前的事务。题面会给出你的人设、职责、上级要求、本地规矩与这件事的情况。',
  rules: [
    '按职责、上级要求、本地规矩与你的私心做决定；能做的处置都列在【可用命令】里，至多选两条。',
    '判词、告示与口头答复写进对应命令的 data，至多一百字，口吻符合你的身份；当面答复也写进 speech。',
    '证据不足时，按你的性格决定是从宽、从严还是拖延，但不要编造证据。',
    '心声至多八十字。',
  ],
});
