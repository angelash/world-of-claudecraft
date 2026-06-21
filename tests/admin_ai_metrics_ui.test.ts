import { describe, expect, it } from 'vitest';
import { renderAiLifeLayerMetrics } from '../src/admin/tables';
import { setAdminLanguage } from '../src/admin/i18n';
import type { AiLifeLayerMetricsSnapshot } from '../src/admin/types';

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
});
