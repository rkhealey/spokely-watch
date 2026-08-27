"use server";

import { retryEpisode, RetryRequestError } from "@/lib/spokely-api";

export async function retryJob(externalId: string) {
  try {
    const result = await retryEpisode(externalId);
    return { ok: true as const, currentStatus: result.currentStatus };
  } catch (err) {
    const message = err instanceof RetryRequestError ? err.message : "Retry request failed.";
    return { ok: false as const, error: message };
  }
}
