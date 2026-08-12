import { db } from "./db";

const DEFAULT_WINDOW_DAYS = 30;

function windowStart(days = DEFAULT_WINDOW_DAYS) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

// Local-calendar-day key, matching the local Date arithmetic used to build
// the buckets below (avoids UTC/local day-boundary mismatches).
function dayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildDayBuckets<T>(days: number, init: () => T): Map<string, T> {
  const buckets = new Map<string, T>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    buckets.set(dayKey(date), init());
  }
  return buckets;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export async function getOverviewStats() {
  const since = windowStart();

  const [totalJobs, succeededJobs, failedJobs, audioAgg, durationAgg] = await Promise.all([
    db.job.count({ where: { createdAt: { gte: since } } }),
    db.job.count({ where: { createdAt: { gte: since }, status: "SUCCEEDED" } }),
    db.job.count({ where: { createdAt: { gte: since }, status: "FAILED" } }),
    db.job.aggregate({
      where: { createdAt: { gte: since }, status: "SUCCEEDED" },
      _sum: { audioDurationSec: true },
    }),
    db.job.aggregate({
      where: { createdAt: { gte: since }, status: "SUCCEEDED" },
      _avg: { processingMs: true },
      _sum: { processingMs: true },
    }),
  ]);

  const totalAudioSec = audioAgg._sum.audioDurationSec ?? 0;
  const totalProcessingSec = (durationAgg._sum.processingMs ?? 0) / 1000;

  return {
    totalJobs,
    succeededJobs,
    failedJobs,
    totalAudioHours: totalAudioSec / 3600,
    avgProcessingMs: durationAgg._avg.processingMs ?? 0,
    // Aggregate ratio (sum/sum), not an average of per-job ratios — a
    // handful of very short jobs would otherwise skew a per-job average.
    realtimeMultiple: totalProcessingSec > 0 ? totalAudioSec / totalProcessingSec : 0,
  };
}

export async function getCostStats() {
  const since = windowStart();

  const [runpodAgg, anthropicAgg, succeededJobs] = await Promise.all([
    db.runpodUsage.aggregate({
      where: { job: { createdAt: { gte: since } } },
      _sum: { costUsd: true },
    }),
    db.anthropicUsage.aggregate({
      where: { job: { createdAt: { gte: since } } },
      _sum: { costUsd: true },
    }),
    db.job.count({ where: { createdAt: { gte: since }, status: "SUCCEEDED" } }),
  ]);

  const runpodCostUsd = runpodAgg._sum.costUsd?.toNumber() ?? 0;
  const anthropicCostUsd = anthropicAgg._sum.costUsd?.toNumber() ?? 0;
  const totalCostUsd = runpodCostUsd + anthropicCostUsd;

  return {
    totalCostUsd,
    runpodCostUsd,
    anthropicCostUsd,
    avgCostPerJob: succeededJobs > 0 ? totalCostUsd / succeededJobs : 0,
  };
}

export async function getErrorStats() {
  const since = windowStart();

  const [totalJobs, failedJobs, errorsByStage] = await Promise.all([
    db.job.count({ where: { createdAt: { gte: since } } }),
    db.job.count({ where: { createdAt: { gte: since }, status: "FAILED" } }),
    db.jobError.groupBy({
      by: ["stage"],
      where: { job: { createdAt: { gte: since } } },
      _count: { _all: true },
    }),
  ]);

  return {
    totalJobs,
    failedJobs,
    failureRate: totalJobs > 0 ? failedJobs / totalJobs : 0,
    errorsByStage: errorsByStage
      .map((row) => ({ stage: row.stage ?? "unknown", count: row._count._all }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function getJobsPerDay(days = DEFAULT_WINDOW_DAYS) {
  const since = windowStart(days);
  const rows = await db.job.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true, status: true },
  });

  const buckets = buildDayBuckets(days, () => ({ succeeded: 0, failed: 0 }));
  for (const row of rows) {
    const bucket = buckets.get(dayKey(row.createdAt));
    if (!bucket) continue;
    if (row.status === "SUCCEEDED") bucket.succeeded += 1;
    else if (row.status === "FAILED") bucket.failed += 1;
  }

  return Array.from(buckets, ([date, value]) => ({ date, ...value }));
}

export async function getAudioHoursPerDay(days = DEFAULT_WINDOW_DAYS) {
  const since = windowStart(days);
  const rows = await db.job.findMany({
    where: { createdAt: { gte: since }, status: "SUCCEEDED" },
    select: { createdAt: true, audioDurationSec: true },
  });

  const buckets = buildDayBuckets(days, () => ({ hours: 0 }));
  for (const row of rows) {
    const bucket = buckets.get(dayKey(row.createdAt));
    if (!bucket) continue;
    bucket.hours += (row.audioDurationSec ?? 0) / 3600;
  }

  return Array.from(buckets, ([date, value]) => ({ date, hours: round1(value.hours) }));
}

// Realtime multiple = audio duration / processing time, aggregated per day
// as sum(audio) / sum(processing) rather than an average of per-job ratios.
// Averaging raw processing time instead would make a day of long episodes
// look "slower" than a day of short ones even at identical throughput.
export async function getProcessingSpeedPerDay(days = DEFAULT_WINDOW_DAYS) {
  const since = windowStart(days);
  const rows = await db.job.findMany({
    where: {
      createdAt: { gte: since },
      status: "SUCCEEDED",
      processingMs: { not: null },
      audioDurationSec: { not: null },
    },
    select: { createdAt: true, processingMs: true, audioDurationSec: true },
  });

  const buckets = buildDayBuckets(days, () => ({ audioSec: 0, processingSec: 0 }));
  for (const row of rows) {
    if (row.processingMs == null || row.audioDurationSec == null) continue;
    const bucket = buckets.get(dayKey(row.createdAt));
    if (!bucket) continue;
    bucket.audioSec += row.audioDurationSec;
    bucket.processingSec += row.processingMs / 1000;
  }

  return Array.from(buckets, ([date, value]) => ({
    date,
    realtimeMultiple: value.processingSec > 0 ? round1(value.audioSec / value.processingSec) : 0,
  }));
}

export async function getRecentJobs(limit = 50) {
  const jobs = await db.job.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { runpodUsage: true, anthropicUsage: true },
  });

  return jobs.map((job) => {
    const runpodCostUsd = job.runpodUsage?.costUsd.toNumber() ?? 0;
    const anthropicCostUsd = job.anthropicUsage.reduce((sum, u) => sum + u.costUsd.toNumber(), 0);

    return {
      externalId: job.externalId,
      status: job.status,
      createdAt: job.createdAt,
      audioDurationSec: job.audioDurationSec,
      processingMs: job.processingMs,
      costUsd: runpodCostUsd + anthropicCostUsd,
    };
  });
}

export async function getJobDetail(externalId: string) {
  const job = await db.job.findUnique({
    where: { externalId },
    include: { runpodUsage: true, anthropicUsage: true, error: true },
  });
  if (!job) return null;

  const runpodCostUsd = job.runpodUsage?.costUsd.toNumber() ?? 0;
  const anthropicCostUsd = job.anthropicUsage.reduce((sum, u) => sum + u.costUsd.toNumber(), 0);
  const processingSec = job.processingMs != null ? job.processingMs / 1000 : null;
  const realtimeMultiple =
    processingSec && processingSec > 0 && job.audioDurationSec
      ? job.audioDurationSec / processingSec
      : null;

  return {
    externalId: job.externalId,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    audioDurationSec: job.audioDurationSec,
    processingMs: job.processingMs,
    realtimeMultiple,
    runpodCostUsd,
    anthropicCostUsd,
    totalCostUsd: runpodCostUsd + anthropicCostUsd,
    runpodUsage: job.runpodUsage
      ? { ...job.runpodUsage, costUsd: job.runpodUsage.costUsd.toNumber() }
      : null,
    anthropicUsage: job.anthropicUsage.map((u) => ({ ...u, costUsd: u.costUsd.toNumber() })),
    error: job.error,
  };
}
