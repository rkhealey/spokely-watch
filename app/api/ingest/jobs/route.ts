import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { computeAnthropicCostUsd, computeRunpodCostUsd, UnknownPricingKeyError } from "@/lib/pricing";
import { isoDateString } from "@/lib/zod-helpers";

const runpodUsageSchema = z.object({
  // Which container this run was, e.g. "transcribe" / "diarize" — a job can
  // have multiple RunPod containers running in parallel on the same episode.
  task: z.string().optional(),
  endpointId: z.string().optional(),
  gpuType: z.string(),
  executionMs: z.number().int().nonnegative(),
  delayMs: z.number().int().nonnegative(),
});

const anthropicUsageSchema = z.object({
  // Which pipeline step this call belongs to, e.g. "anthropic_summarize" —
  // mirrors RunpodUsagePayload.task. A step can make more than one call.
  step: z.string().optional(),
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
  // The specific pipeline step running when this failure happened, e.g.
  // "diarize" — finer-grained than `stage`. Independent of any step-level
  // event sent to /api/ingest/jobs/steps, since a hard crash may skip that.
  step: z.string().optional(),
});

const jobIngestSchema = z
  .object({
    externalId: z.string().min(1),
    showId: z.string().optional(),
    showName: z.string().optional(),
    // Omitted defaults to PRODUCTION — a pipeline that hasn't been updated
    // to send this yet is real traffic, not a dev/test run.
    environment: z.enum(["PRODUCTION", "DEVELOPMENT"]).default("PRODUCTION"),
    status: z.enum(["SUCCEEDED", "FAILED"]),
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

    // Idempotent on retries: replace this job's child rows rather than appending.
    await tx.jobError.deleteMany({ where: { jobId: job.id } });
    await tx.anthropicUsage.deleteMany({ where: { jobId: job.id } });
    await tx.runpodUsage.deleteMany({ where: { jobId: job.id } });

    if (runpodWithCost.length > 0) {
      await tx.runpodUsage.createMany({
        data: runpodWithCost.map((usage) => ({
          jobId: job.id,
          task: usage.task,
          endpointId: usage.endpointId,
          gpuType: usage.gpuType,
          executionMs: usage.executionMs,
          delayMs: usage.delayMs,
          costUsd: usage.costUsd,
        })),
      });
    }

    if (anthropicWithCost.length > 0) {
      await tx.anthropicUsage.createMany({
        data: anthropicWithCost.map((usage) => ({
          jobId: job.id,
          step: usage.step,
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheCreationTokens: usage.cacheCreationTokens,
          cacheReadTokens: usage.cacheReadTokens,
          costUsd: usage.costUsd,
        })),
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
