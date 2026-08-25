


import { PrismaClient, JobStatus } from "@prisma/client";

const db = new PrismaClient();

// Keep in sync with lib/pricing.ts (RUNPOD_GPU_RATE_PER_HOUR).
const GPU_TYPES = ["24GB"] as const;
const GPU_RATE_PER_HOUR: Record<(typeof GPU_TYPES)[number], number> = {
  "24GB": 0.69,
};

const ANTHROPIC_MODELS = ["claude-sonnet-5", "claude-opus-5"] as const;
const ANTHROPIC_RATE_PER_MTOK: Record<
  (typeof ANTHROPIC_MODELS)[number],
  { input: number; output: number }
> = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-5": { input: 15, output: 75 },
};

const SHOWS = [
  { id: "show_daily_digest", name: "The Daily Digest" },
  { id: "show_tech_talk", name: "Tech Talk Weekly" },
  { id: "show_true_crime_files", name: "True Crime Files" },
  { id: "show_startup_stories", name: "Startup Stories" },
] as const;

const ERROR_POOL: { stage: string; code: string; message: string }[] = [
  { stage: "runpod", code: "RUNPOD_TIMEOUT", message: "Worker did not respond within the timeout window" },
  { stage: "runpod", code: "RUNPOD_OOM", message: "GPU worker ran out of memory" },
  { stage: "anthropic", code: "ANTHROPIC_RATE_LIMIT", message: "Rate limited by Anthropic API" },
  { stage: "anthropic", code: "ANTHROPIC_OVERLOADED", message: "Anthropic API returned a 529 overloaded error" },
  { stage: "pipeline", code: "AUDIO_DECODE_FAILED", message: "Could not decode input audio file" },
];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

async function main() {
  console.log("Clearing existing data...");
  await db.jobError.deleteMany();
  await db.anthropicUsage.deleteMany();
  await db.runpodUsage.deleteMany();
  await db.job.deleteMany();

  const DAYS = 30;
  const now = new Date();
  let jobCount = 0;

  for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - dayOffset);
    dayStart.setHours(0, 0, 0, 0);

    const isWeekend = [0, 6].includes(dayStart.getDay());
    const jobsToday = randInt(isWeekend ? 4 : 10, isWeekend ? 12 : 28);

    for (let i = 0; i < jobsToday; i++) {
      const startedAt = new Date(
        dayStart.getTime() + randInt(0, 23) * 3600_000 + randInt(0, 59) * 60_000
      );

      const audioDurationSec = round(randFloat(45, 3600), 1);
      const isFailure = Math.random() < 0.07;

      const externalId = `job_${dayStart.toISOString().slice(0, 10)}_${i}_${randInt(1000, 9999)}`;
      const show = pick(SHOWS);

      if (isFailure) {
        const err = pick(ERROR_POOL);
        const failedAfterMs = randInt(2_000, 60_000);
        const completedAt = new Date(startedAt.getTime() + failedAfterMs);

        await db.job.create({
          data: {
            externalId,
            showId: show.id,
            showName: show.name,
            status: JobStatus.FAILED,
            audioDurationSec,
            startedAt,
            completedAt,
            processingMs: failedAfterMs,
            createdAt: startedAt,
            error: { create: err },
            // Failures upstream of RunPod/Anthropic don't always carry usage data.
            ...(err.stage !== "runpod" && {
              runpodUsage: {
                create: [
                  {
                    task: "transcribe",
                    gpuType: pick(GPU_TYPES),
                    executionMs: randInt(500, 5000),
                    delayMs: randInt(100, 1500),
                    costUsd: round(randFloat(0.001, 0.01)),
                  },
                ],
              },
            }),
          },
        });
        jobCount++;
        continue;
      }

      // Transcribe and diarize run as two parallel RunPod containers on the
      // same episode, so wall-clock time is bounded by whichever finishes
      // last, not their sum — but both incur their own cost.
      const gpuType = pick(GPU_TYPES);
      // Billed on execution + delay together — RunPod charges for cold-start
      // time too (see lib/pricing.ts computeRunpodCostUsd).
      const transcribeExecutionMs = Math.round(audioDurationSec * randFloat(150, 400));
      const transcribeDelayMs = randInt(100, 2000);
      const transcribeCost = round(
        ((transcribeExecutionMs + transcribeDelayMs) / 3_600_000) * GPU_RATE_PER_HOUR[gpuType]
      );

      const diarizeExecutionMs = Math.round(audioDurationSec * randFloat(80, 200));
      const diarizeDelayMs = randInt(100, 2000);
      const diarizeCost = round(
        ((diarizeExecutionMs + diarizeDelayMs) / 3_600_000) * GPU_RATE_PER_HOUR[gpuType]
      );

      const model = pick(ANTHROPIC_MODELS);
      const inputTokens = Math.round(audioDurationSec * randFloat(15, 30));
      const outputTokens = Math.round(inputTokens * randFloat(0.08, 0.2));
      const cacheReadTokens = Math.round(inputTokens * randFloat(0, 0.4));
      const rates = ANTHROPIC_RATE_PER_MTOK[model];
      const anthropicCost = round(
        (inputTokens / 1_000_000) * rates.input +
          (outputTokens / 1_000_000) * rates.output +
          (cacheReadTokens / 1_000_000) * (rates.input * 0.1)
      );

      const parallelMs = Math.max(
        transcribeDelayMs + transcribeExecutionMs,
        diarizeDelayMs + diarizeExecutionMs
      );
      const processingMs = parallelMs + randInt(500, 4000);
      const completedAt = new Date(startedAt.getTime() + processingMs);

      await db.job.create({
        data: {
          externalId,
          showId: show.id,
          showName: show.name,
          status: JobStatus.SUCCEEDED,
          audioDurationSec,
          startedAt,
          completedAt,
          processingMs,
          createdAt: startedAt,
          runpodUsage: {
            create: [
              {
                task: "transcribe",
                endpointId: "ep_transcribe_v1",
                gpuType,
                executionMs: transcribeExecutionMs,
                delayMs: transcribeDelayMs,
                costUsd: transcribeCost,
              },
              {
                task: "diarize",
                endpointId: "ep_diarize_v1",
                gpuType,
                executionMs: diarizeExecutionMs,
                delayMs: diarizeDelayMs,
                costUsd: diarizeCost,
              },
            ],
          },
          anthropicUsage: {
            create: {
              model,
              inputTokens,
              outputTokens,
              cacheReadTokens,
              cacheCreationTokens: Math.round(inputTokens * randFloat(0, 0.05)),
              costUsd: anthropicCost,
              createdAt: startedAt,
            },
          },
        },
      });
      jobCount++;
    }
  }

  console.log(`Seeded ${jobCount} jobs across ${DAYS} days.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
