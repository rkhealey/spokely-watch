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

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function sumCost(usages: ReadonlyArray<{ costUsd: { toNumber(): number } }>) {
  return usages.reduce((sum, u) => sum + u.costUsd.toNumber(), 0);
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

  const [runpodAgg, anthropicAgg, succeededJobs, audioAgg] = await Promise.all([
    db.runpodUsage.aggregate({
      where: { job: { createdAt: { gte: since } } },
      _sum: { costUsd: true },
    }),
    db.anthropicUsage.aggregate({
      where: { job: { createdAt: { gte: since } } },
      _sum: { costUsd: true },
    }),
    db.job.count({ where: { createdAt: { gte: since }, status: "SUCCEEDED" } }),
    db.job.aggregate({
      where: { createdAt: { gte: since }, status: "SUCCEEDED" },
      _sum: { audioDurationSec: true },
    }),
  ]);

  const runpodCostUsd = runpodAgg._sum.costUsd?.toNumber() ?? 0;
  const anthropicCostUsd = anthropicAgg._sum.costUsd?.toNumber() ?? 0;
  const totalCostUsd = runpodCostUsd + anthropicCostUsd;
  const totalAudioHours = (audioAgg._sum.audioDurationSec ?? 0) / 3600;

  return {
    totalCostUsd,
    runpodCostUsd,
    anthropicCostUsd,
    avgCostPerJob: succeededJobs > 0 ? totalCostUsd / succeededJobs : 0,
    // All incurred spend (including partial cost on failed jobs) against
    // hours of audio actually delivered — the "what does an hour cost us" number.
    costPerAudioHour: totalAudioHours > 0 ? totalCostUsd / totalAudioHours : 0,
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
    const runpodCostUsd = sumCost(job.runpodUsage);
    const anthropicCostUsd = sumCost(job.anthropicUsage);

    return {
      externalId: job.externalId,
      status: job.status,
      createdAt: job.createdAt,
      audioDurationSec: job.audioDurationSec,
      processingMs: job.processingMs,
      runpodCostUsd,
      anthropicCostUsd,
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

  const runpodCostUsd = sumCost(job.runpodUsage);
  const anthropicCostUsd = sumCost(job.anthropicUsage);
  const processingSec = job.processingMs != null ? job.processingMs / 1000 : null;
  const realtimeMultiple =
    processingSec && processingSec > 0 && job.audioDurationSec
      ? job.audioDurationSec / processingSec
      : null;

  // Cold-start cost is derived proportionally from the stored costUsd
  // (delayMs / total billed ms) rather than recomputed from the current
  // pricing table, so the breakdown always sums to what was actually
  // charged even if rates change after the job was ingested.
  const runpodUsageWithColdStart = job.runpodUsage.map((u) => {
    const costUsd = u.costUsd.toNumber();
    const billedMs = u.executionMs + u.delayMs;
    const coldStartCostUsd = billedMs > 0 ? round4(costUsd * (u.delayMs / billedMs)) : 0;
    return { ...u, costUsd, coldStartCostUsd };
  });
  const coldStartCostUsd = round4(
    runpodUsageWithColdStart.reduce((sum, u) => sum + u.coldStartCostUsd, 0)
  );

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
    coldStartCostUsd,
    runpodUsage: runpodUsageWithColdStart,
    anthropicUsage: job.anthropicUsage.map((u) => ({ ...u, costUsd: u.costUsd.toNumber() })),
    error: job.error,
  };
}

// Cost bucketed by day and split by vendor. Not filtered by status — a
// failed job can still have incurred real RunPod/Anthropic spend.
export async function getCostPerDay(days = DEFAULT_WINDOW_DAYS) {
  const since = windowStart(days);
  const jobs = await db.job.findMany({
    where: { createdAt: { gte: since } },
    select: {
      createdAt: true,
      runpodUsage: { select: { costUsd: true } },
      anthropicUsage: { select: { costUsd: true } },
    },
  });

  const buckets = buildDayBuckets(days, () => ({ runpod: 0, anthropic: 0 }));
  for (const job of jobs) {
    const bucket = buckets.get(dayKey(job.createdAt));
    if (!bucket) continue;
    bucket.runpod += sumCost(job.runpodUsage);
    bucket.anthropic += sumCost(job.anthropicUsage);
  }

  return Array.from(buckets, ([date, value]) => ({
    date,
    runpodCostUsd: round2(value.runpod),
    anthropicCostUsd: round2(value.anthropic),
  }));
}

// Unit cost per day: total spend / hours of audio delivered that day.
// Aggregate ratio (sum/sum) for the same reason as the speed chart — an
// average of per-job ratios would be skewed by very short jobs.
export async function getCostPerAudioHourPerDay(days = DEFAULT_WINDOW_DAYS) {
  const since = windowStart(days);
  const jobs = await db.job.findMany({
    where: { createdAt: { gte: since } },
    select: {
      createdAt: true,
      audioDurationSec: true,
      runpodUsage: { select: { costUsd: true } },
      anthropicUsage: { select: { costUsd: true } },
    },
  });

  const buckets = buildDayBuckets(days, () => ({ cost: 0, audioSec: 0 }));
  for (const job of jobs) {
    const bucket = buckets.get(dayKey(job.createdAt));
    if (!bucket) continue;
    const jobCost = sumCost(job.runpodUsage) + sumCost(job.anthropicUsage);
    bucket.cost += jobCost;
    bucket.audioSec += job.audioDurationSec ?? 0;
  }

  return Array.from(buckets, ([date, value]) => ({
    date,
    costPerAudioHour: value.audioSec > 0 ? round2(value.cost / (value.audioSec / 3600)) : 0,
  }));
}

export async function getTopJobsByCost(limit = 10, days = DEFAULT_WINDOW_DAYS) {
  const since = windowStart(days);
  const jobs = await db.job.findMany({
    where: { createdAt: { gte: since } },
    include: { runpodUsage: true, anthropicUsage: true },
  });

  return jobs
    .map((job) => {
      const runpodCostUsd = sumCost(job.runpodUsage);
      const anthropicCostUsd = sumCost(job.anthropicUsage);
      return {
        externalId: job.externalId,
        status: job.status,
        createdAt: job.createdAt,
        runpodCostUsd,
        anthropicCostUsd,
        costUsd: runpodCostUsd + anthropicCostUsd,
      };
    })
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, limit);
}

export async function getRecentFailedJobs(limit = 20) {
  const jobs = await db.job.findMany({
    where: { status: "FAILED" },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { error: true },
  });

  return jobs.map((job) => ({
    externalId: job.externalId,
    createdAt: job.createdAt,
    stage: job.error?.stage ?? null,
    code: job.error?.code ?? null,
    message: job.error?.message ?? "Unknown error",
  }));
}
