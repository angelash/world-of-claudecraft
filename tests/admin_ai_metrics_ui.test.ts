import { describe, expect, it } from 'vitest';
import { renderAiLifeLayerMetrics } from '../src/admin/tables';
import { setAdminLanguage } from '../src/admin/i18n';
import type { AiContentCoverageReport, AiLifeLayerMetricsSnapshot } from '../src/admin/types';

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
});
