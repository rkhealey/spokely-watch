import Link from "next/link";
import { StatCard } from "@/components/ui/stat-card";
import { ChartCard } from "@/components/ui/chart-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { CostChart } from "@/components/charts/cost-chart";
import { CostPerHourChart } from "@/components/charts/cost-per-hour-chart";
import { getCostStats, getCostPerDay, getCostPerAudioHourPerDay, getTopJobsByCost } from "@/lib/queries";
import { formatCost, formatDateTime } from "@/lib/format";

export default async function CostsPage() {
  const [stats, costPerDay, costPerHourPerDay, topJobs] = await Promise.all([
    getCostStats(),
    getCostPerDay(),
    getCostPerAudioHourPerDay(),
    getTopJobsByCost(),
  ]);

  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Costs</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Last 30 days</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total spend" value={`$${stats.totalCostUsd.toFixed(2)}`} />
        <StatCard label="RunPod (GPU)" value={`$${stats.runpodCostUsd.toFixed(2)}`} />
        <StatCard label="Anthropic (tokens)" value={`$${stats.anthropicCostUsd.toFixed(2)}`} />
        <StatCard label="Avg. cost per job" value={`$${stats.avgCostPerJob.toFixed(4)}`} />
        <StatCard label="Cost per audio-hour" value={`$${stats.costPerAudioHour.toFixed(2)}`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Daily spend" subtitle="RunPod vs. Anthropic, per day">
          <CostChart data={costPerDay} />
        </ChartCard>
        <ChartCard
          title="Cost per audio-hour"
          subtitle="Total spend ÷ hours of audio delivered, per day — the unit-economics view"
        >
          <CostPerHourChart data={costPerHourPerDay} />
        </ChartCard>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Most expensive jobs
        </h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-2 font-medium">Episode ID</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {topJobs.map((job) => (
                <tr
                  key={job.externalId}
                  className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/jobs/${encodeURIComponent(job.externalId)}`}
                      className="font-mono text-xs text-zinc-900 hover:underline dark:text-zinc-50"
                    >
                      {job.externalId}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {formatDateTime(job.createdAt)}
                  </td>
                  <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">
                    {formatCost(job.costUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
