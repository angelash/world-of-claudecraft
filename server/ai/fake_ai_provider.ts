import type { AiDecisionV1, AiJobContextV1, AiProvider } from './ai_types';
import { profileFor } from './profiles';

export class FakeAiProvider implements AiProvider {
  async decide(context: AiJobContextV1): Promise<AiDecisionV1> {
    const profile = profileFor(context.entity.kind, context.entity.templateId);
    const suggestedLineId = context.recentObservations
      .find((observation) => observation.startsWith('suggestedLineId:'))
      ?.slice('suggestedLineId:'.length);
    const lineId = suggestedLineId
      && profile.allowedLineIds.includes(suggestedLineId)
      && (!context.allowedLineIds || context.allowedLineIds.includes(suggestedLineId))
      ? suggestedLineId
      : profile.fallbackLineId;
    return {
      schemaVersion: 1,
      jobId: context.jobId,
      entityRef: {
        kind: context.entity.kind,
        entityId: context.entity.entityId,
        templateId: context.entity.templateId,
      },
      ttlMs: 5_000,
      confidence: 1,
      speech: [{
        mode: 'lineId',
        lineId,
        values: {
          playerName: context.player.name,
          speakerName: context.entity.name,
        },
      }],
      intents: [{ type: 'commentOnScene', lineId }],
      audit: {
        shortReason: 'deterministic fallback profile line',
        usedPlayerInput: false,
        safetyNotes: ['fake provider does not alter quest, reward, combat, or economy state'],
      },
    };
  }
}
