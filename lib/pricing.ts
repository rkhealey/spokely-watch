/**
 * Single source of truth for cost calculation. NestJS sends raw metrics
 * (execution ms, token counts); this app converts them to costUsd at
 * ingestion time so pricing only needs to be kept up to date in one place.
 */

// Keys must match the `gpuType` string the NestJS pipeline sends in the
// ingestion payload — that in turn should match RunPod's endpoint config
// (Console → Serverless → your endpoint → Edit Endpoint → GPU selection).
export const RUNPOD_GPU_RATE_PER_HOUR: Record<string, number> = {
  "24GB": 0.69,
};

export const ANTHROPIC_RATE_PER_MTOK: Record<
  string,
  { input: number; output: number; cacheWrite: number; cacheRead: number }
> = {
  "claude-sonnet-5": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-opus-5": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export class UnknownPricingKeyError extends Error {}

export function computeRunpodCostUsd(gpuType: string, executionMs: number): number {
  const ratePerHour = RUNPOD_GPU_RATE_PER_HOUR[gpuType];
  if (ratePerHour === undefined) {
    throw new UnknownPricingKeyError(`Unknown RunPod GPU type: "${gpuType}"`);
  }
  return round((executionMs / 3_600_000) * ratePerHour);
}

export function computeAnthropicCostUsd(
  model: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  }
): number {
  const rates = ANTHROPIC_RATE_PER_MTOK[model];
  if (rates === undefined) {
    throw new UnknownPricingKeyError(`Unknown Anthropic model: "${model}"`);
  }
  const cost =
    (usage.inputTokens / 1_000_000) * rates.input +
    (usage.outputTokens / 1_000_000) * rates.output +
    (usage.cacheCreationTokens / 1_000_000) * rates.cacheWrite +
    (usage.cacheReadTokens / 1_000_000) * rates.cacheRead;
  return round(cost);
}
