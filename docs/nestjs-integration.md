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

Optionally, it can also push **one event per pipeline step transition**
(started, then succeeded/failed) to `POST {SPOKELY_WATCH_URL}/api/ingest/jobs/steps`,
so the dashboard shows which step a job is currently on before the job
finishes, and how long each step took afterward. This is additive — the
final `reportJob` call still happens exactly as before and is what marks the
job SUCCEEDED/FAILED.

Both calls are designed to be **safe to retry and safe to ignore**. On `/jobs`,
`status`/`audioDurationSec`/timestamps/`error` are fully replaced by each
call, but `runpod`/`anthropic` cost entries are upserted per `(externalId, task/step)`
— not deleted and recreated — so a later call only needs to include the steps
it's actually reporting cost for; steps reported earlier and not mentioned
in a later call keep their stored cost. On `/jobs/steps`, resending
the same `externalId`+`step` updates that step's row in place the same way.
Neither endpoint ever throws — a failed report logs and moves on. A dashboard
outage should never take down the transcription pipeline.

**Jobs can now end at a checkpoint instead of always running to full
completion.** `status: "TRANSCRIBED"` marks a job whose transcription step
finished but which may or may not get picked up for further processing —
immediately, much later, or never. It's not a failure and not final: send it
with whatever `runpod` cost the transcription step incurred, same shape as a
`SUCCEEDED`/`FAILED` report. If the episode is later picked up and fully
processed, send a normal `reportJob({ status: "SUCCEEDED", ... })` when it
finishes — you only need to include the *new* `runpod`/`anthropic` cost
(diarization, llm, etc.); the transcription cost already stored from the
`TRANSCRIBED` call stays, per the upsert behavior above.

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
// Must match Spokely Watch's lib/steps.ts exactly (case-sensitive) — used
// for RunpodUsagePayload.task, AnthropicUsagePayload.step, JobErrorPayload.step,
// and StepReportPayload.step. An unrecognized value gets a 400.
export type PipelineStep =
  | "download_audio"
  | "transcription"
  | "diarization"
  | "merge"
  | "load_transcript"
  | "prepare_transcript"
  | "llm"
  | "validate"
  | "persist";

export interface RunpodUsagePayload {
  /** Which pipeline step this container run belongs to — required, since
   * Spokely Watch upserts this entry by (externalId, task) rather than
   * appending it. A job can have multiple RunPod containers running in
   * parallel on one episode. */
  task: PipelineStep;
  endpointId?: string;
  /** Must match a key in Spokely Watch's lib/pricing.ts (currently "24GB"). */
  gpuType: string;
  executionMs: number;
  delayMs: number;
}

export interface AnthropicUsagePayload {
  /** Which pipeline step this call belongs to — mirrors RunpodUsagePayload.task,
   * required for the same upsert-by-step reason. If a step makes more than
   * one Claude call, pre-aggregate them into a single entry before sending —
   * only one entry per step is stored. */
  step: PipelineStep;
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
  /** The specific step running when this failure happened — finer-grained
   * than `stage`. Set this even if you also sent a step FAILED event; a
   * hard crash may skip that event entirely. */
  step?: PipelineStep;
}

export interface StepReportPayload {
  /** Your pipeline's episode/job ID — same value as JobReportPayload.externalId. */
  externalId: string;
  step: PipelineStep;
  status: "STARTED" | "SUCCEEDED" | "FAILED";
  /** When this transition happened. Defaults to server receipt time if omitted. */
  at?: string; // ISO 8601
  /** Only needed on the very first event for a given externalId, in case it
   * arrives before the job exists yet — same fields as JobReportPayload. */
  showId?: string;
  showName?: string;
  environment?: "PRODUCTION" | "DEVELOPMENT";
}

export interface JobReportPayload {
  /** Your pipeline's episode/job ID. */
  externalId: string;
  /** Your pipeline's show/podcast ID — enables cost-by-show breakdowns. */
  showId?: string;
  /** Human-readable show name, shown in the dashboard instead of showId when present. */
  showName?: string;
  /** Defaults to "PRODUCTION" if omitted — set to "DEVELOPMENT" for local/test runs so they don't pollute production metrics. */
  environment?: "PRODUCTION" | "DEVELOPMENT";
  /** "TRANSCRIBED" is a checkpoint, not final — see "How it works" above. */
  status: "TRANSCRIBED" | "SUCCEEDED" | "FAILED";
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
import { JobReportPayload, StepReportPayload } from "./metrics.types";

// SPOKELY_WATCH_URL is easy to paste without a scheme (e.g. copied from a
// browser address bar as "spokely-watch.vercel.app"). fetch() requires an
// absolute URL, so normalize it here instead of failing with an opaque
// "Failed to parse URL" error at request time.
function normalizeBaseUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const withScheme = /^https?:\/\//.test(url) ? url : `https://${url}`;
  return withScheme.replace(/\/+$/, "");
}

@Injectable()
export class SpokelyWatchService {
  private readonly logger = new Logger(SpokelyWatchService.name);
  private readonly baseUrl = normalizeBaseUrl(process.env.SPOKELY_WATCH_URL);
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

  /** Same fire-and-forget contract as reportJob — never throws. */
  async reportStep(payload: StepReportPayload): Promise<void> {
    if (!this.baseUrl || !this.apiKey) return;

    try {
      const res = await fetch(`${this.baseUrl}/api/ingest/jobs/steps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.logger.error(`Spokely Watch step ingest failed (${res.status}): ${body}`);
      }
    } catch (err) {
      this.logger.error(`Spokely Watch step ingest request failed: ${err}`);
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
import { AnthropicUsagePayload, PipelineStep } from "./metrics.types";

export class AnthropicUsageCollector {
  private readonly entries: AnthropicUsagePayload[] = [];

  /** Call this right after every `anthropic.messages.create(...)` response. */
  record(step: PipelineStep, model: string, usage: Anthropic.Usage): void {
    this.entries.push({
      step,
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
`startedAt`/`completedAt`, collect Anthropic usage as you go, call
`reportStep` around each stage transition, and call `reportJob` once at the
end (success path) or in the catch block (failure path).

The full pipeline has nine steps (`download_audio`, `transcription`,
`diarization`, `merge`, `load_transcript`, `prepare_transcript`, `llm`,
`validate`, `persist`) — only `transcription`/`diarization` (RunPod) and
`llm` (Anthropic) carry cost data on the final `reportJob` call. The rest are
plain `reportStep` calls with no attached cost, shown below as `runPipelineStep`
for brevity; wire each one up the same way as `download_audio`.

```typescript
async function processEpisode(episodeId: string, show: { id: string; name: string }) {
  const startedAt = new Date();
  const anthropicUsage = new AnthropicUsageCollector();
  let currentStep: PipelineStep = "download_audio";

  try {
    // Cost-less steps just wrap the work in a STARTED/SUCCEEDED pair.
    await spokelyWatch.reportStep({ externalId: episodeId, step: currentStep, status: "STARTED" });
    const audioDurationSec = await runPipelineStep(currentStep, episodeId);
    await spokelyWatch.reportStep({ externalId: episodeId, step: currentStep, status: "SUCCEEDED" });

    // Two RunPod containers running in parallel on the same episode — each
    // gets its own step so the dashboard shows them as separate rows.
    await Promise.all([
      spokelyWatch.reportStep({ externalId: episodeId, step: "transcription", status: "STARTED" }),
      spokelyWatch.reportStep({ externalId: episodeId, step: "diarization", status: "STARTED" }),
    ]);
    const [transcribeResult, diarizeResult] = await Promise.all([
      runRunpodContainer("transcription", episodeId),
      runRunpodContainer("diarization", episodeId),
    ]);
    await Promise.all([
      spokelyWatch.reportStep({ externalId: episodeId, step: "transcription", status: "SUCCEEDED" }),
      spokelyWatch.reportStep({ externalId: episodeId, step: "diarization", status: "SUCCEEDED" }),
    ]);

    // Transcription-only episodes stop here — not every episode goes on to
    // full analysis, and some that do won't for a long time. This is that
    // job's real terminal state right now, so it needs its own reportJob
    // call; reportStep alone leaves the job stuck on PROCESSING forever.
    if (!(await hasDiarizationFollowUp(episodeId))) {
      await spokelyWatch.reportJob({
        externalId: episodeId,
        showId: show.id,
        showName: show.name,
        status: "TRANSCRIBED",
        audioDurationSec,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        runpod: [
          {
            task: "transcription",
            gpuType: process.env.RUNPOD_GPU_TYPE!,
            endpointId: transcribeResult.endpointId,
            executionMs: transcribeResult.executionTime,
            delayMs: transcribeResult.delayTime,
          },
        ],
      });
      return;
    }

    for (const step of ["merge", "load_transcript", "prepare_transcript"] as const) {
      currentStep = step;
      await spokelyWatch.reportStep({ externalId: episodeId, step, status: "STARTED" });
      await runPipelineStep(step, episodeId);
      await spokelyWatch.reportStep({ externalId: episodeId, step, status: "SUCCEEDED" });
    }

    currentStep = "llm";
    await spokelyWatch.reportStep({ externalId: episodeId, step: currentStep, status: "STARTED" });

    // One or more Claude calls — record usage after each, tagged with the step.
    for (const chapter of await getChapters(episodeId)) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: buildPrompt(chapter) }],
      });
      anthropicUsage.record(currentStep, "claude-sonnet-5", response.usage);
    }
    await spokelyWatch.reportStep({ externalId: episodeId, step: currentStep, status: "SUCCEEDED" });

    for (const step of ["validate", "persist"] as const) {
      currentStep = step;
      await spokelyWatch.reportStep({ externalId: episodeId, step, status: "STARTED" });
      await runPipelineStep(step, episodeId);
      await spokelyWatch.reportStep({ externalId: episodeId, step, status: "SUCCEEDED" });
    }

    await spokelyWatch.reportJob({
      externalId: episodeId,
      showId: show.id,
      showName: show.name,
      status: "SUCCEEDED",
      audioDurationSec,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      runpod: [
        {
          task: "transcription",
          gpuType: process.env.RUNPOD_GPU_TYPE!, // e.g. "24GB" — your endpoint's configured tier
          endpointId: transcribeResult.endpointId,
          executionMs: transcribeResult.executionTime,
          delayMs: transcribeResult.delayTime,
        },
        {
          task: "diarization",
          gpuType: process.env.RUNPOD_GPU_TYPE!,
          endpointId: diarizeResult.endpointId,
          executionMs: diarizeResult.executionTime,
          delayMs: diarizeResult.delayTime,
        },
      ],
      anthropic: anthropicUsage.all,
    });
  } catch (err) {
    await spokelyWatch.reportStep({ externalId: episodeId, step: currentStep, status: "FAILED" });
    await spokelyWatch.reportJob({
      externalId: episodeId,
      showId: show.id,
      showName: show.name,
      status: "FAILED",
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      anthropic: anthropicUsage.all, // whatever was captured before the failure
      error: {
        message: err instanceof Error ? err.message : String(err),
        stage: classifyFailureStage(err), // "runpod" | "anthropic" | "pipeline"
        step: currentStep,
      },
    });
    throw err;
  }
}
```

### Resuming a transcription-only episode later

When a previously-`TRANSCRIBED` episode gets picked up for full processing —
a day, a month, or a year later — only report the *new* cost. The
transcription `runpod` entry already stored from the earlier `TRANSCRIBED`
call is untouched by this call, per the upsert-by-step behavior described
above:

```typescript
async function resumeTranscribedEpisode(episodeId: string, show: { id: string; name: string }) {
  const resumedAt = new Date();

  const diarizeResult = await runRunpodContainer("diarization", episodeId);
  // ... merge, load_transcript, prepare_transcript, llm, validate, persist ...

  await spokelyWatch.reportJob({
    externalId: episodeId, // same externalId as the original TRANSCRIBED report
    showId: show.id,
    showName: show.name,
    status: "SUCCEEDED",
    startedAt: resumedAt.toISOString(),
    completedAt: new Date().toISOString(),
    runpod: [
      {
        task: "diarization", // no "transcription" entry needed — it's already stored
        gpuType: process.env.RUNPOD_GPU_TYPE!,
        endpointId: diarizeResult.endpointId,
        executionMs: diarizeResult.executionTime,
        delayMs: diarizeResult.delayTime,
      },
    ],
    anthropic: anthropicUsage.all, // this run's llm cost
  });
}
```

## Important notes

- **`step`/`task` must be one of the nine fixed pipeline step names** —
  `download_audio`, `transcription`, `diarization`, `merge`, `load_transcript`,
  `prepare_transcript`, `llm`, `validate`, `persist` (case-sensitive, kept in
  sync with Spokely Watch's `lib/steps.ts`). An unrecognized value gets a
  `400`, on `/jobs/steps` and on `RunpodUsagePayload.task`/
  `AnthropicUsagePayload.step`/`JobErrorPayload.step` in `/jobs`.
  `RunpodUsagePayload.task` and `AnthropicUsagePayload.step` are **required**
  (not optional) — Spokely Watch needs them to know which stored entry to
  upsert.
- **`TRANSCRIBED` jobs don't count toward "succeeded" stats** (avg cost per
  job, cost per audio-hour, success rate) — those still key off `SUCCEEDED`
  only, so a transcription-only job sits alongside `PROCESSING`/`QUEUED` as
  "not yet in the succeeded bucket" until/unless it's later reported
  `SUCCEEDED`. Its cost still shows up in total spend regardless of status.
- **`reportStep` is optional but cheap to add incrementally.** If you only
  wire up a couple of steps at first, the dashboard just shows cost/duration
  for those and "—" for the rest — nothing breaks.
- **A step event can arrive before the job exists** (e.g. the very first
  `STARTED` event for a new episode) — that's fine, it creates the job with
  status `PROCESSING`. But a step event arriving *after* the final `reportJob`
  call never changes the job's status — `/jobs/steps` only sets status on
  create, so a late/duplicate step event can't regress a finished job back
  to `PROCESSING`.
- **Set `environment: "DEVELOPMENT"` when running the pipeline locally or
  against test data.** The dashboard defaults to showing production jobs
  only, so unmarked local/test runs will look like real production traffic —
  set this from `NODE_ENV` (or whatever your service already uses to know
  it's not prod) rather than hardcoding it.
- **GPU type must match Spokely Watch's pricing table exactly** (case-sensitive).
  Right now that's just `"24GB"` at $0.69/hr — an unrecognized `gpuType` makes
  ingestion reject the whole job with a `400`. If you add GPU tiers, update
  `lib/pricing.ts` in the Spokely Watch repo first.
- **Anthropic `model` string must also match the pricing table**
  (`claude-sonnet-5`, `claude-sonnet-4-6`, `claude-opus-5`, `claude-haiku-4-5`
  today). Same failure mode if it doesn't.
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
- **Resending a job is safe.** `externalId` is the idempotency key. A retry
  that resends the exact same `(task/step, ...)` entries just overwrites them
  in place — no double-counting. `status`/timestamps/`error` are always
  fully replaced by the latest call.
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
    "showId": "show_123",
    "showName": "Example Show",
    "environment": "DEVELOPMENT",
    "status": "SUCCEEDED",
    "audioDurationSec": 842.5,
    "startedAt": "2026-08-12T10:00:00Z",
    "completedAt": "2026-08-12T10:02:14Z",
    "runpod": [
      { "task": "transcription", "gpuType": "24GB", "executionMs": 118000, "delayMs": 400 },
      { "task": "diarization", "gpuType": "24GB", "executionMs": 54000, "delayMs": 300 }
    ],
    "anthropic": [
      { "step": "llm", "model": "claude-sonnet-5", "inputTokens": 12000, "outputTokens": 900, "cacheReadTokens": 8000 }
    ]
  }'
```

A `200` response returns `{"id": "...", "externalId": "test_job_1"}`. A `400`
means either the payload failed validation or `gpuType`/`model` isn't in the
pricing table — check the error message.

To test a step event (this one also creates the job, since `test_job_2`
doesn't exist yet):

```bash
curl -X POST http://localhost:3000/api/ingest/jobs/steps \
  -H "Content-Type: application/json" \
  -H "x-api-key: $SPOKELY_WATCH_INGEST_API_KEY" \
  -d '{
    "externalId": "test_job_2",
    "showId": "show_123",
    "environment": "DEVELOPMENT",
    "step": "transcription",
    "status": "STARTED"
  }'
```

A `200` response returns `{"id": "...", "step": "transcription", "status": "STARTED"}`.
