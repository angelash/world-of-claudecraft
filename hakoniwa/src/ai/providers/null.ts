// No model: available() is false, so the runner declines every request at once and the
// deterministic fallback runs on the next tick (rules-only play, D-010).

import type { LlmOutcome, LlmProvider } from '../contracts';

export class NullProvider implements LlmProvider {
  readonly id = 'none';
  available(): boolean {
    return false;
  }
  async complete(): Promise<LlmOutcome> {
    return { ok: false, error: 'model_off', message: '未配置模型' };
  }
}
