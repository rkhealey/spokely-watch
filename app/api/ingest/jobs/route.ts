import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { computeAnthropicCostUsd, computeRunpodCostUsd, UnknownPricingKeyError } from "@/lib/pricing";
import { isoDateString } from "@/lib/zod-helpers";
import { PIPELINE_STEPS } from "@/lib/steps";

const runpodUsageSchema = z.object({
  // Which pipeline step this container run belongs to — required so this
  // entry can be upserted by (job, task) instead of replacing all of a
  // job's RunPod rows on every call. A job can have multiple RunPod
  // containers running in parallel on the same episode.
  task: z.enum(PIPELINE_STEPS),
  endpointId: z.string().optional(),
  gpuType: z.string(),
  executionMs: z.number().int().nonnegative(),
  delayMs: z.number().int().nonnegative(),
});

const anthropicUsageSchema = z.object({
  // Which pipeline step this call belongs to — mirrors RunpodUsagePayload.task,
  // required for the same (job, step) upsert reason. If a step makes more
  // than one Claude call, pre-aggregate them into a single entry before
  // sending — only one row per step can exist.
  step: z.enum(PIPELINE_STEPS),
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheCreationTokens: z.number().int().nonnegative().default(0),
  cacheReadTokens: z.number().int().nonnegative().default(0),
});

const errorSchema = z.object({
  code: z.string().optional(),
  message: z.string().min(1),
  stage: z.string().optional(),
  // The specific pipeline step running when this failure happened —
  // finer-grained than `stage`. Independent of any step-level event sent to
  // /api/ingest/jobs/steps, since a hard crash may skip that.
  step: z.enum(PIPELINE_STEPS).optional(),
});

const jobIngestSchema = z
  .object({
    externalId: z.string().min(1),
    showId: z.string().optional(),
    showName: z.string().optional(),
    // Omitted defaults to PRODUCTION — a pipeline that hasn't been updated
    // to send this yet is real traffic, not a dev/test run.
    environment: z.enum(["PRODUCTION", "DEVELOPMENT"]).default("PRODUCTION"),
    // TRANSCRIBED is a checkpoint, not final: transcription finished but the
    // episode may or may not go any further. Not a failure, so no `error`
    // is required for it, same as SUCCEEDED.
    status: z.enum(["TRANSCRIBED", "SUCCEEDED", "FAILED"]),
    audioDurationSec: z.number().nonnegative().optional(),
    startedAt: isoDateString.optional(),
    completedAt: isoDateString.optional(),
    runpod: z.array(runpodUsageSchema).optional(),
    anthropic: z.array(anthropicUsageSchema).optional(),
    error: errorSchema.optional(),
  })
  .refine((data) => data.status !== "FAILED" || data.error !== undefined, {
    message: "`error` is required when status is FAILED",
    path: ["error"],
  });

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!process.env.INGEST_API_KEY || apiKey !== process.env.INGEST_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = jobIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: z.flattenError(parsed.error) },
      { status: 400 }
    );
  }
  const {
    externalId,
    showId,
    showName,
    environment,
    status,
    audioDurationSec,
    startedAt,
    completedAt,
    runpod,
    anthropic,
    error,
  } = parsed.data;

  const runpodWithCost: Array<z.infer<typeof runpodUsageSchema> & { costUsd: number }> = [];
  const anthropicWithCost: Array<
    z.infer<typeof anthropicUsageSchema> & { costUsd: number }
  > = [];

  try {
    for (const usage of runpod ?? []) {
      runpodWithCost.push({
        ...usage,
        costUsd: computeRunpodCostUsd(usage.gpuType, usage.executionMs + usage.delayMs),
      });
    }
    for (const usage of anthropic ?? []) {
      anthropicWithCost.push({ ...usage, costUsd: computeAnthropicCostUsd(usage.model, usage) });
    }
  } catch (err) {
    if (err instanceof UnknownPricingKeyError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const started = startedAt ? new Date(startedAt) : null;
  const completed = completedAt ? new Date(completedAt) : null;
  const processingMs = started && completed ? completed.getTime() - started.getTime() : null;

  const job = await db.$transaction(async (tx) => {
    const job = await tx.job.upsert({
      where: { externalId },
      create: {
        externalId,
        showId,
        showName,
        environment,
        status,
        audioDurationSec,
        startedAt: started,
        completedAt: completed,
        processingMs,
      },
      update: {
        showId,
        showName,
        environment,
        status,
        audioDurationSec,
        startedAt: started,
        completedAt: completed,
        processingMs,
      },
    });

    // JobError is always a single row reflecting the latest failure, so it's
    // still full-replace. RunpodUsage/AnthropicUsage are upserted per entry
    // below instead — a job reported at a checkpoint (e.g. TRANSCRIBED) and
    // later completed shouldn't lose the cost from steps this call doesn't
    // mention.
    await tx.jobError.deleteMany({ where: { jobId: job.id } });

    for (const usage of runpodWithCost) {
      await tx.runpodUsage.upsert({
        where: { jobId_task: { jobId: job.id, task: usage.task } },
        create: {
          jobId: job.id,
          task: usage.task,
          endpointId: usage.endpointId,
          gpuType: usage.gpuType,
          executionMs: usage.executionMs,
          delayMs: usage.delayMs,
          costUsd: usage.costUsd,
        },
        update: {
          endpointId: usage.endpointId,
          gpuType: usage.gpuType,
          executionMs: usage.executionMs,
          delayMs: usage.delayMs,
          costUsd: usage.costUsd,
        },
      });
    }

    for (const usage of anthropicWithCost) {
      await tx.anthropicUsage.upsert({
        where: { jobId_step: { jobId: job.id, step: usage.step } },
        create: {
          jobId: job.id,
          step: usage.step,
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheCreationTokens: usage.cacheCreationTokens,
          cacheReadTokens: usage.cacheReadTokens,
          costUsd: usage.costUsd,
        },
        update: {
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheCreationTokens: usage.cacheCreationTokens,
          cacheReadTokens: usage.cacheReadTokens,
          costUsd: usage.costUsd,
        },
      });
    }

    if (error) {
      await tx.jobError.create({
        data: {
          jobId: job.id,
          code: error.code,
          message: error.message,
          stage: error.stage,
          step: error.step,
        },
      });
    }

    return job;
  });

  return NextResponse.json({ id: job.id, externalId: job.externalId }, { status: 200 });
}
