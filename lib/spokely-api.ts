// Outbound client for spokely-api's internal endpoints — the reverse
// direction from lib/pricing.ts et al, which handle NestJS's inbound calls
// into us. Uses its own secret (SPOKELY_WATCH_INBOUND_SECRET), separate from
// the INGEST_API_KEY the pipeline sends us.
export class RetryRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

interface RetryResult {
  jobId: string;
  // "full_restart" | "transcription" | "diarization" | "merge", or the
  // episode's real analysis status if it was already past the failed stage.
  currentStatus: string;
}

export async function retryEpisode(episodeId: string): Promise<RetryResult> {
  const baseUrl = process.env.SPOKELY_API_URL;
  const apiKey = process.env.SPOKELY_WATCH_INBOUND_SECRET;
  if (!baseUrl || !apiKey) {
    throw new RetryRequestError(
      0,
      "Retry isn't configured — missing SPOKELY_API_URL or SPOKELY_WATCH_INBOUND_SECRET"
    );
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/internal/spokely-watch/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ episodeId }),
    });
  } catch {
    throw new RetryRequestError(0, "Could not reach the retry endpoint.");
  }

  if (!res.ok) {
    const message =
      res.status === 401
        ? "Retry request was rejected — check SPOKELY_WATCH_INBOUND_SECRET."
        : res.status === 404
          ? "Episode not found."
          : res.status === 400
            ? "This episode isn't in a failed state that can be retried."
            : `Retry request failed (${res.status}).`;
    throw new RetryRequestError(res.status, message);
  }

  return res.json();
}
