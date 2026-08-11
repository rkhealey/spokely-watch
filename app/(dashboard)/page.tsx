import { StatCard } from "@/components/ui/stat-card";
import { getOverviewStats } from "@/lib/queries";

export default async function OverviewPage() {
  const stats = await getOverviewStats();
  const successRate = stats.totalJobs > 0 ? stats.succeededJobs / stats.totalJobs : 0;

  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Overview</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Last 30 days</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Jobs processed" value={stats.totalJobs.toLocaleString()} />
        <StatCard
          label="Success rate"
          value={`${(successRate * 100).toFixed(1)}%`}
          hint={`${stats.failedJobs.toLocaleString()} failed`}
        />
        <StatCard label="Audio hours processed" value={stats.totalAudioHours.toFixed(1)} />
        <StatCard
          label="Avg. processing time"
          value={`${(stats.avgProcessingMs / 1000).toFixed(1)}s`}
        />
      </div>

      <p className="mt-8 text-sm text-zinc-400 dark:text-zinc-600">
        Charts coming next — this page will show jobs over time, audio hours processed, and
        processing duration trends.
      </p>
    </div>
  );
}
