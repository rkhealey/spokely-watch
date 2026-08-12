# NestJS integration

This is the module your pipeline service needs to report job metrics to
Spokely Watch. It's a reference implementation — copy it into your NestJS
repo and wire it into wherever your job orchestrator currently finishes
(successfully or not) processing an episode.

## How it works

Your NestJS service pushes **one event per completed job** — success or
failure — to `POST {SPOKELY_WATCH_URL}/api/ingest/jobs`. Spokely Watch computes
costs from the raw metrics you send (execution time, token counts) using its
own pricing table, so your pipeline never needs to know GPU or token pricing.

The call is designed to be **safe to retry and safe to ignore**: resending the
same `externalId` fully replaces that job's stored data (not a merge), and a
failed report never throws — it logs and moves on. A dashboard outage should
never take down the transcription pipeline.

## Setup

Add to your NestJS service's environment:

```bash
SPOKELY_WATCH_URL=https://your-spokely-watch-deployment.vercel.app
SPOKELY_WATCH_INGEST_API_KEY=<same value as INGEST_API_KEY in Spokely Watch's .env>
```

Get the API key value from whoever manages the Spokely Watch deployment — it's
the `INGEST_API_KEY` in that project's environment variables, not something
you generate on this side.

## Files to add

### `metrics.types.ts`

```typescript
export interface RunpodUsagePayload {
  /** Which container this run was, e.g. "transcribe" or "diarize" — a job
   * can have multiple RunPod containers running in parallel on one episode. */
  task?: string;
  endpointId?: string;
  /** Must match a key in Spokely Watch's lib/pricing.ts (currently "24GB"). */
  gpuType: string;
  executionMs: number;
  delayMs: number;
}

export interface AnthropicUsagePayload {
  /** Must match a key in Spokely Watch's lib/pricing.ts, e.g. "claude-sonnet-5". */
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

export interface JobErrorPayload {
  code?: string;
  message: string;
  /** e.g. "runpod" | "anthropic" | "pipeline" */
  stage?: string;
}

export interface JobReportPayload {
  /** Your pipeline's episode/job ID. */
  externalId: string;
  status: "SUCCEEDED" | "FAILED";
  audioDurationSec?: number;
  startedAt?: string; // ISO 8601
  completedAt?: string; // ISO 8601
  runpod?: RunpodUsagePayload[];
  anthropic?: AnthropicUsagePayload[];
  /** Required when status is "FAILED". */
  error?: JobErrorPayload;
}
```

### `spokely-watch.service.ts`

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { JobReportPayload } from "./metrics.types";

@Injectable()
export class SpokelyWatchService {
  private readonly logger = new Logger(SpokelyWatchService.name);
  private readonly baseUrl = process.env.SPOKELY_WATCH_URL;
  private readonly apiKey = process.env.SPOKELY_WATCH_INGEST_API_KEY;

  /**
   * Fire-and-forget by design: metrics reporting must never break the
   * actual pipeline. Logs and swallows on failure rather than throwing.
   */
  async reportJob(payload: JobReportPayload): Promise<void> {
    if (!this.baseUrl || !this.apiKey) {
      this.logger.warn("Spokely Watch not configured — skipping metrics report");
      return;
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/ingest/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.logger.error(`Spokely Watch ingest failed (${res.status}): ${body}`);
      }
    } catch (err) {
      this.logger.error(`Spokely Watch ingest request failed: ${err}`);
    }
  }
}
```

Register `SpokelyWatchService` as a provider in whichever module owns your
job orchestration.

### `anthropic-usage-collector.ts`

A job can call Claude more than once (e.g. one call per chapter/segment of an
episode). This accumulates usage across calls so you can build the
`anthropic` array once, at the end of the job.

```typescript
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicUsagePayload } from "./metrics.types";

export class AnthropicUsageCollector {
  private readonly entries: AnthropicUsagePayload[] = [];

  /** Call this right after every `anthropic.messages.create(...)` response. */
  record(model: string, usage: Anthropic.Usage): void {
    this.entries.push({
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    });
  }

  get all(): AnthropicUsagePayload[] {
    return this.entries;
  }
}
```

## Wiring it into your job handler

This is pseudocode — replace `runRunpodContainer(...)` and the Claude call
loop with your actual pipeline code. The parts that matter are: capture
`startedAt`/`completedAt`, collect Anthropic usage as you go, and call
`reportJob` once at the end (success path) or in the catch block (failure
path).

```typescript
async function processEpisode(episodeId: string) {
  const startedAt = new Date();
  const anthropicUsage = new AnthropicUsageCollector();

  try {
    const audioDurationSec = await getAudioDurationSec(episodeId);

    // Two RunPod containers running in parallel on the same episode.
    const [transcribeResult, diarizeResult] = await Promise.all([
      runRunpodContainer("transcribe", episodeId),
      runRunpodContainer("diarize", episodeId),
    ]);

    // One or more Claude calls — record usage after each.
    for (const chapter of await getChapters(episodeId)) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: buildPrompt(chapter) }],
      });
      anthropicUsage.record("claude-sonnet-5", response.usage);
    }

    await spokelyWatch.reportJob({
      externalId: episodeId,
      status: "SUCCEEDED",
      audioDurationSec,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      runpod: [
        {
          task: "transcribe",
          gpuType: process.env.RUNPOD_GPU_TYPE!, // e.g. "24GB" — your endpoint's configured tier
          endpointId: transcribeResult.endpointId,
          executionMs: transcribeResult.executionTime,
          delayMs: transcribeResult.delayTime,
        },
        {
          task: "diarize",
          gpuType: process.env.RUNPOD_GPU_TYPE!,
          endpointId: diarizeResult.endpointId,
          executionMs: diarizeResult.executionTime,
          delayMs: diarizeResult.delayTime,
        },
      ],
      anthropic: anthropicUsage.all,
    });
  } catch (err) {
    await spokelyWatch.reportJob({
      externalId: episodeId,
      status: "FAILED",
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      anthropic: anthropicUsage.all, // whatever was captured before the failure
      error: {
        message: err instanceof Error ? err.message : String(err),
        stage: classifyFailureStage(err), // "runpod" | "anthropic" | "pipeline"
      },
    });
    throw err;
  }
}
```

## Important notes

- **GPU type must match Spokely Watch's pricing table exactly** (case-sensitive).
  Right now that's just `"24GB"` at $0.69/hr — an unrecognized `gpuType` makes
  ingestion reject the whole job with a `400`. If you add GPU tiers, update
  `lib/pricing.ts` in the Spokely Watch repo first.
- **Anthropic `model` string must also match the pricing table**
  (`claude-sonnet-5`, `claude-opus-5`, `claude-haiku-4-5` today). Same failure
  mode if it doesn't.
- **RunPod execution time/delay come from the job status response**
  (`executionTime` / `delayTime` in ms) — not something you need to compute.
  Send both, and send `delayMs` accurately: Spokely Watch bills on
  `executionMs + delayMs` combined, not execution alone. RunPod's recommended
  pattern loads models outside the handler function, which makes cold-start
  time show up as `delayTime` rather than `executionTime` — but RunPod still
  bills it at the same rate, so a job that under-reports `delayMs` will look
  cheaper here than it actually was.
- **If you ever move a RunPod endpoint to a multi-GPU fallback pool**
  (RunPod lets you configure up to 3 GPU types with automatic fallback), the
  `/status` response won't tell you which GPU actually ran a given job — that's
  only available via the `gpu=` query parameter RunPod appends to *webhook*
  callback URLs. With today's single fixed `"24GB"` tier this doesn't matter
  (`gpuType` is just the static env var), but it will if you diversify GPU
  tiers on an endpoint later.
- **Resending a job is safe.** `externalId` is the idempotency key — a retry
  with the same ID fully replaces the previously stored `runpod`/`anthropic`
  rows for that job (not a merge), so don't worry about double-counting on retry.
- **Don't let a report failure fail the job.** `reportJob` already swallows
  its own errors; if you inline the fetch yourself instead of using
  `SpokelyWatchService`, keep that behavior.

## Testing locally

```bash
curl -X POST http://localhost:3000/api/ingest/jobs \
  -H "Content-Type: application/json" \
  -H "x-api-key: $SPOKELY_WATCH_INGEST_API_KEY" \
  -d '{
    "externalId": "test_job_1",
    "status": "SUCCEEDED",
    "audioDurationSec": 842.5,
    "startedAt": "2026-08-12T10:00:00Z",
    "completedAt": "2026-08-12T10:02:14Z",
    "runpod": [
      { "task": "transcribe", "gpuType": "24GB", "executionMs": 118000, "delayMs": 400 },
      { "task": "diarize", "gpuType": "24GB", "executionMs": 54000, "delayMs": 300 }
    ],
    "anthropic": [
      { "model": "claude-sonnet-5", "inputTokens": 12000, "outputTokens": 900, "cacheReadTokens": 8000 }
    ]
  }'
```

A `200` response returns `{"id": "...", "externalId": "test_job_1"}`. A `400`
means either the payload failed validation or `gpuType`/`model` isn't in the
pricing table — check the error message.
