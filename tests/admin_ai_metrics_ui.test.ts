import { describe, expect, it } from 'vitest';
import { renderAiLifeLayerMetrics } from '../src/admin/tables';
import { setAdminLanguage } from '../src/admin/i18n';
import type { AiContentCoverageReport, AiLifeLayerDiagnosticsSnapshot, AiLifeLayerMetricsSnapshot } from '../src/admin/types';

function metrics(overrides: Partial<AiLifeLayerMetricsSnapshot> = {}): AiLifeLayerMetricsSnapshot {
  return {
    providerCalls: 0,
    providerSuccesses: 0,
    providerErrors: 0,
    providerFallbacks: 0,
    acceptedDecisions: 0,
    rejectedDecisions: 0,
    localReactions: 0,
    generatedEvents: 0,
    memoryWritesQueued: 0,
    memoryFlushFailures: 0,
    totalProviderLatencyMs: 0,
    averageProviderLatencyMs: 0,
    maxProviderLatencyMs: 0,
    lastProviderLatencyMs: 0,
    ...overrides,
  };
}

type CoverageOverrides = {
  families?: Partial<AiContentCoverageReport['families']>;
  npcs?: Partial<AiContentCoverageReport['npcs']>;
  scenes?: Partial<AiContentCoverageReport['scenes']>;
  items?: Partial<AiContentCoverageReport['items']>;
  lineIds?: Partial<AiContentCoverageReport['lineIds']>;
};

function coverage(overrides: CoverageOverrides = {}): AiContentCoverageReport {
  const base: AiContentCoverageReport = {
    families: {
      expected: ['beast', 'undead'],
      inContent: ['beast', 'undead'],
      missingSemantics: [],
      semanticsWithoutContent: [],
      familiesMissingDepth: [],
      familiesWithInvalidMoodBias: [],
      templateCountByFamily: { beast: 4, undead: 2 },
    },
    npcs: {
      interactiveTotal: 3,
      authoredProfileTotal: 3,
      missingInteractiveProfiles: [],
      authoredNpcProfilesMissingSceneAffinities: [],
      authoredNpcProfilesMissingItemInterest: [],
      authoredNpcProfilesMissingTimeWeatherSensitivity: [],
      authoredNpcProfilesWithThinMemory: [],
    },
    scenes: {
      anchorTotal: 4,
      semanticObjectTotal: 9,
      anchorsMissingSemanticObjects: [],
      anchorsMissingTags: [],
      anchorsMissingTagDepth: [],
      semanticObjectsMissingTags: [],
      semanticObjectsMissingTagDepth: [],
      semanticObjectsMissingAnchorOverlap: [],
    },
    items: {
      requiredTotal: 2,
      discardableTotal: 12,
      missingRequiredItems: [],
      requiredItemsMissingSignals: [],
      discardableItemsMissingSignals: [],
      importantItemsMissingSignals: [],
    },
    lineIds: {
      referenced: ['hudChrome.aiSpeech.genericNpcAwake'],
    },
  };
  return {
    ...base,
    ...overrides,
    families: { ...base.families, ...overrides.families },
    npcs: { ...base.npcs, ...overrides.npcs },
    scenes: { ...base.scenes, ...overrides.scenes },
    items: { ...base.items, ...overrides.items },
    lineIds: { ...base.lineIds, ...overrides.lineIds },
  };
}

function diagnostics(overrides: Partial<AiLifeLayerDiagnosticsSnapshot> = {}): AiLifeLayerDiagnosticsSnapshot {
  return {
    recentDecisions: [{
      sequence: 3,
      jobId: 'job-3',
      trigger: 'npc_question',
      entityId: 12,
      templateId: 'brother_aldric',
      playerEntityId: 1,
      status: 'provider_error',
      reason: 'codex <offline>',
      lineIds: ['hudChrome.aiSpeech.brotherAldricAwake'],
      intents: ['commentOnScene'],
      sceneId: 'fallen_chapel',
      memoryWrites: [{
        kind: 'npcInteraction',
        refId: 'npc:12:brother_aldric',
        scope: 'entity',
        sourcePlayerEntityId: 1,
        lineIds: ['hudChrome.aiSpeech.brotherAldricAwake'],
        salience: 0.7,
        reason: 'opened gossip',
      }],
    }],
    worldDirectorStates: [{
      stateId: 'director-1',
      sceneId: 'fallen_chapel',
      zoneId: 'eastbrook_vale',
      mood: 'haunted',
      proposalType: 'campAlert',
      sourcePlayerEntityId: 1,
      sourceRef: 'trace-1',
      itemId: 'gravecaller_sigil<script>',
      subjectKind: 'item',
      lineId: 'hudChrome.aiSpeech.worldDirectorHaunted',
      heat: 0.75,
      createdAt: 10,
      updatedAt: 12,
      expiresAt: 120,
      evidence: ['trace:cursed<script>'],
    }],
    memoryPersistence: { pending: 2, flushing: true, errors: ['db <offline>'] },
    ...overrides,
  };
}

describe('admin AI life layer metrics renderer', () => {
  it('shows a healthy status when provider and memory errors are clear', () => {
    setAdminLanguage('en');
    const html = renderAiLifeLayerMetrics(metrics({
      providerCalls: 4,
      providerSuccesses: 4,
      acceptedDecisions: 3,
      generatedEvents: 6,
      averageProviderLatencyMs: 12.4,
    }));

    expect(html).toContain('healthy');
    expect(html).toContain('Provider calls');
    expect(html).toContain('Average provider latency');
    expect(html).toContain('12 ms');
  });

  it('surfaces provider and memory failures without exposing raw HTML', () => {
    setAdminLanguage('en');
    const html = renderAiLifeLayerMetrics(metrics({
      providerCalls: 3,
      providerErrors: 1,
      providerFallbacks: 1,
      memoryFlushFailures: 1,
      lastProviderError: '<script>alert(1)</script>',
      lastMemoryPersistenceError: 'db <offline>',
    }));

    expect(html).toContain('needs attention');
    expect(html).toContain('Provider fallbacks');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('db &lt;offline&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('shows AI content coverage gaps and escapes authored ids', () => {
    setAdminLanguage('en');
    const html = renderAiLifeLayerMetrics(metrics(), coverage({
      families: { missingSemantics: ['void<script>'], semanticsWithoutContent: ['astral<orphan>'] },
      npcs: { missingInteractiveProfiles: ['aldric<bad>'] },
      items: { importantItemsMissingSignals: ['gravecaller_sigil'] },
    }));

    expect(html).toContain('AI content coverage');
    expect(html).toContain('gaps');
    expect(html).toContain('Interactive NPCs missing profiles');
    expect(html).toContain('void&lt;script&gt;');
    expect(html).toContain('Family semantics without mob templates');
    expect(html).toContain('astral&lt;orphan&gt;');
    expect(html).toContain('aldric&lt;bad&gt;');
    expect(html).not.toContain('aldric<bad>');
  });

  it('shows AI decision diagnostics and escapes audit values', () => {
    setAdminLanguage('en');
    const html = renderAiLifeLayerMetrics(metrics(), coverage(), diagnostics({
      recentDecisions: [{
        ...diagnostics().recentDecisions[0],
        templateId: 'npc<script>',
        lineIds: ['hudChrome.aiSpeech.line<script>'],
      }],
    }));

    expect(html).toContain('AI decision diagnostics');
    expect(html).toContain('provider error');
    expect(html).toContain('NPC question');
    expect(html).toContain('camp alert');
    expect(html).toContain('db &lt;offline&gt;');
    expect(html).toContain('npc&lt;script&gt;');
    expect(html).toContain('hudChrome.aiSpeech.line&lt;script&gt;');
    expect(html).toContain('gravecaller_sigil&lt;script&gt;');
    expect(html).toContain('trace:cursed&lt;script&gt;');
    expect(html).not.toContain('npc<script>');
    expect(html).not.toContain('db <offline>');
  });
});
