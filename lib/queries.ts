import { db } from "./db";

const DEFAULT_WINDOW_DAYS = 30;

function windowStart(days = DEFAULT_WINDOW_DAYS) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
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
    }),
  ]);

  return {
    totalJobs,
    succeededJobs,
    failedJobs,
    totalAudioHours: (audioAgg._sum.audioDurationSec ?? 0) / 3600,
    avgProcessingMs: durationAgg._avg.processingMs ?? 0,
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
