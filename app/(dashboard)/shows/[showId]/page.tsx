import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { getJobsByShow } from "@/lib/queries";
import { getEnvironmentFilter } from "@/lib/environment";
import { formatCost, formatDateTime, formatDuration } from "@/lib/format";

export default async function ShowDetailPage(props: PageProps<"/shows/[showId]">) {
  const { showId } = await props.params;
  const environment = await getEnvironmentFilter();
  const show = await getJobsByShow(decodeURIComponent(showId), environment);

  if (!show) notFound();

  return (
    <div>
      <Link
        href="/costs"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ← Costs
      </Link>

      <h1 className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {show.showName}
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{show.jobs.length} jobs</p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="px-4 py-2 font-medium">Episode ID</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Audio</th>
              <th className="px-4 py-2 font-medium">Processing</th>
              <th className="px-4 py-2 text-right font-medium">RunPod</th>
              <th className="px-4 py-2 text-right font-medium">Anthropic</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {show.jobs.map((job) => (
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
                <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400">
                  {formatCost(job.runpodCostUsd)}
                </td>
                <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400">
                  {formatCost(job.anthropicCostUsd)}
                </td>
                <td className="px-4 py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">
                  {formatCost(job.costUsd)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="px-4 py-2 font-semibold text-zinc-900 dark:text-zinc-50" colSpan={5}>
                Total
              </td>
              <td className="px-4 py-2 text-right font-semibold text-zinc-900 dark:text-zinc-50">
                {formatCost(show.totals.runpodCostUsd)}
              </td>
              <td className="px-4 py-2 text-right font-semibold text-zinc-900 dark:text-zinc-50">
                {formatCost(show.totals.anthropicCostUsd)}
              </td>
              <td className="px-4 py-2 text-right font-semibold text-zinc-900 dark:text-zinc-50">
                {formatCost(show.totals.costUsd)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
