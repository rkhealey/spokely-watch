import { StatCard } from "@/components/ui/stat-card";
import { getCostStats } from "@/lib/queries";

export default async function CostsPage() {
  const stats = await getCostStats();

  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Costs</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Last 30 days</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total spend" value={`$${stats.totalCostUsd.toFixed(2)}`} />
        <StatCard label="RunPod (GPU)" value={`$${stats.runpodCostUsd.toFixed(2)}`} />
        <StatCard label="Anthropic (tokens)" value={`$${stats.anthropicCostUsd.toFixed(2)}`} />
        <StatCard label="Avg. cost per job" value={`$${stats.avgCostPerJob.toFixed(4)}`} />
      </div>

      <p className="mt-8 text-sm text-zinc-400 dark:text-zinc-600">
        Charts coming next — this page will show cost per job, cost per hour, and cost per day
        trends.
      </p>
    </div>
  );
}
