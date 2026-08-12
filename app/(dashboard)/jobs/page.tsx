import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { getRecentJobs } from "@/lib/queries";
import { formatCost, formatDateTime, formatDuration } from "@/lib/format";

export default async function JobsPage() {
  const jobs = await getRecentJobs();

  return (
    <div>
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Jobs</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Most recent {jobs.length} jobs
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="px-4 py-2 font-medium">Episode ID</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Audio</th>
              <th className="px-4 py-2 font-medium">Processing</th>
              <th className="px-4 py-2 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
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
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                  {job.audioDurationSec != null ? formatDuration(job.audioDurationSec) : "—"}
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                  {job.processingMs != null ? formatDuration(job.processingMs / 1000) : "—"}
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                  {formatCost(job.costUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
