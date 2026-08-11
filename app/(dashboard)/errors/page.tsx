import { StatCard } from "@/components/ui/stat-card";
import { getErrorStats } from "@/lib/queries";

export default async function ErrorsPage() {
  const stats = await getErrorStats();

  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Errors</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Last 30 days</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Failed jobs" value={stats.failedJobs.toLocaleString()} />
        <StatCard label="Failure rate" value={`${(stats.failureRate * 100).toFixed(1)}%`} />
        <StatCard label="Jobs in window" value={stats.totalJobs.toLocaleString()} />
      </div>

      {stats.errorsByStage.length > 0 && (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Failures</th>
              </tr>
            </thead>
            <tbody>
              {stats.errorsByStage.map((row) => (
                <tr key={row.stage} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">{row.stage}</td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-8 text-sm text-zinc-400 dark:text-zinc-600">
        Charts and a failed-job list with individual error reasons are coming next.
      </p>
    </div>
  );
}
