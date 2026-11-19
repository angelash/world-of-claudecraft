import type { QuantResult } from './quantize';
import { type Problem, problem } from './reasons';

/** Validate each actual quantization stage, including the fold after outline rebuilding. */
export function quantizationEvidence(
  result: QuantResult,
  stage: string,
): {
  processing: Record<string, unknown>;
  problems: Problem[];
} {
  const problems: Problem[] = [];
  if (result.localErrors.length > 0) {
    problems.push(
      problem(
        'palette',
        'local_quant_error',
        `${stage}: localized palette loss exceeds 0.07; compare the recorded regions before requesting new art`,
        true,
      ),
    );
  }
  if (result.meanError > 0.07) {
    problems.push(
      problem(
        'palette',
        'quant_error',
        `${stage}: mean quantization error ${result.meanError.toFixed(3)} (over 0.07): colors far from the palette`,
      ),
    );
  }
  return {
    processing: {
      quantError: Number(result.meanError.toFixed(4)),
      nearestQuantError: Number(result.nearestMeanError.toFixed(4)),
      localPaletteErrors: result.localErrors,
      folded: result.folded,
    },
    problems,
  };
}
