// Shared harness of the intent classifier tests: builds the real content map and runs the
// labeled corpus through classifyIntent, so the acceptance numbers (builtin_ai.md 14.3,
// PK-M0-26) come from the shipped lexicon and rules, never from a stub.

import { buildContent } from '../src/content';
import type { ClassifyResult } from '../src/systems/dialogue/intent';
import { classifyIntent } from '../src/systems/dialogue/intent';

export interface Sample {
  id: string;
  text: string;
  intent: string;
  ctx?: { afterQuestion?: boolean; inTopic?: boolean };
  tags?: string[];
}

export interface Scored {
  sample: Sample;
  got: string;
  result: ClassifyResult;
}

export interface Report {
  total: number;
  classified: number;
  correct: number;
  coverage: number;
  accuracy: number;
  misses: Scored[];
  perIntent: Record<string, { total: number; classified: number; correct: number }>;
}

let content: ReturnType<typeof buildContent> | undefined;

export function realContent() {
  content ??= buildContent();
  return content;
}

export function evaluate(samples: readonly Sample[]): { rows: Scored[]; report: Report } {
  const c = realContent();
  const rows: Scored[] = samples.map((sample) => {
    const result = classifyIntent(sample.text, c, sample.ctx ?? {});
    return { sample, got: result.main, result };
  });
  const perIntent: Report['perIntent'] = {};
  let classified = 0;
  let correct = 0;
  const misses: Scored[] = [];
  for (const r of rows) {
    perIntent[r.sample.intent] ??= { total: 0, classified: 0, correct: 0 };
    const p = perIntent[r.sample.intent] as { total: number; classified: number; correct: number };
    p.total++;
    if (r.got !== 'unknown') {
      classified++;
      p.classified++;
      if (r.got === r.sample.intent) {
        correct++;
        p.correct++;
      }
    }
    if (r.got !== r.sample.intent) misses.push(r);
  }
  return {
    rows,
    report: {
      total: rows.length,
      classified,
      correct,
      coverage: classified / rows.length,
      accuracy: classified === 0 ? 0 : correct / classified,
      misses,
      perIntent,
    },
  };
}
