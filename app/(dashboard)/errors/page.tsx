import Link from "next/link";
import { StatCard } from "@/components/ui/stat-card";
import { ChartCard } from "@/components/ui/chart-card";
import { FailureRateChart } from "@/components/charts/failure-rate-chart";
import { getErrorStats, getJobsPerDay, getRecentFailedJobs } from "@/lib/queries";
import { getEnvironmentFilter } from "@/lib/environment";
import { formatDateTime } from "@/lib/format";

export default async function ErrorsPage() {
  const environment = await getEnvironmentFilter();
  const [stats, jobsPerDay, recentFailures] = await Promise.all([
    getErrorStats(environment),
    getJobsPerDay(environment),
    getRecentFailedJobs(environment),
  ]);

  const failureRatePerDay = jobsPerDay.map((day) => {
    const total = day.succeeded + day.failed;
    return { date: day.date, failureRate: total > 0 ? (day.failed / total) * 100 : 0 };
  });

  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Errors</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Last 30 days</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Failed jobs" value={stats.failedJobs.toLocaleString()} />
        <StatCard label="Failure rate" value={`${(stats.failureRate * 100).toFixed(1)}%`} />
        <StatCard label="Jobs in window" value={stats.totalJobs.toLocaleString()} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Failure rate" subtitle="Share of jobs that failed, per day">
          <FailureRateChart data={failureRatePerDay} />
        </ChartCard>

        {stats.errorsByStage.length > 0 && (
          <ChartCard title="Failures by stage" subtitle="Last 30 days">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="pb-2 font-medium">Stage</th>
                  <th className="pb-2 font-medium">Failures</th>
                </tr>
              </thead>
              <tbody>
                {stats.errorsByStage.map((row) => (
                  <tr key={row.stage} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <td className="py-2 text-zinc-900 dark:text-zinc-50">{row.stage}</td>
                    <td className="py-2 text-zinc-600 dark:text-zinc-400">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ChartCard>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Recent failures</h2>
        {recentFailures.length > 0 ? (
          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-2 font-medium">Episode ID</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {recentFailures.map((job) => (
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
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                      {formatDateTime(job.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                      {job.stage ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{job.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-400 dark:text-zinc-600">No failures in this window.</p>
        )}
      </div>
    </div>
  );
}
