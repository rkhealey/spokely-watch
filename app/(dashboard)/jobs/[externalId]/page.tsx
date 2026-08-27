import Link from "next/link";
import { notFound } from "next/navigation";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EnvironmentBadge } from "@/components/ui/environment-badge";
import { StepStatusBadge } from "@/components/ui/step-status-badge";
import { getJobDetail } from "@/lib/queries";
import { formatCost, formatDateTime, formatDuration } from "@/lib/format";

export default async function JobDetailPage(props: PageProps<"/jobs/[externalId]">) {
  const { externalId } = await props.params;
  const job = await getJobDetail(externalId);

  if (!job) notFound();

  return (
    <div>
      <Link
        href="/jobs"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ← All jobs
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <h1 className="font-mono text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {job.externalId}
        </h1>
        <StatusBadge status={job.status} />
        <EnvironmentBadge environment={job.environment} />
      </div>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {formatDateTime(job.createdAt)}
        {(job.showName ?? job.showId) && ` · ${job.showName ?? job.showId}`}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Audio duration"
          value={job.audioDurationSec != null ? formatDuration(job.audioDurationSec) : "—"}
        />
        <StatCard
          label="Processing time"
          value={job.processingMs != null ? formatDuration(job.processingMs / 1000) : "—"}
        />
        <StatCard
          label="Speed"
          value={job.realtimeMultiple != null ? `${job.realtimeMultiple.toFixed(1)}x` : "—"}
          hint="realtime"
        />
        <StatCard label="Total cost" value={formatCost(job.totalCostUsd)} />
      </div>

      {job.error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-5 dark:border-red-900/50 dark:bg-red-950/30">
          <h2 className="text-sm font-semibold text-red-900 dark:text-red-200">
            Failed
            {job.error.stage ? ` — ${job.error.stage}` : ""}
            {job.error.step ? ` (${job.error.step})` : ""}
          </h2>
          <p className="mt-1 text-sm text-red-800 dark:text-red-300">{job.error.message}</p>
          {job.error.code && (
            <p className="mt-1 font-mono text-xs text-red-600 dark:text-red-400">
              {job.error.code}
            </p>
          )}
        </div>
      )}

      {job.steps.length > 0 && (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Pipeline steps</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 dark:text-zinc-400">
                <th className="pb-1 font-medium">Step</th>
                <th className="pb-1 font-medium">Status</th>
                <th className="pb-1 font-medium">Duration</th>
                <th className="pb-1 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {job.steps.map((step) => (
                <tr key={step.step} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1.5 text-zinc-900 dark:text-zinc-50">{step.step}</td>
                  <td className="py-1.5">
                    <StepStatusBadge status={step.status} />
                  </td>
                  <td className="py-1.5 text-zinc-600 dark:text-zinc-400">
                    {step.durationMs != null ? formatDuration(step.durationMs / 1000) : "—"}
                  </td>
                  <td className="py-1.5 text-right text-zinc-900 dark:text-zinc-50">
                    {formatCost(step.costUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">RunPod</h2>
          {job.runpodUsage.length > 0 ? (
            <>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-500 dark:text-zinc-400">
                    <th className="pb-1 font-medium">Task</th>
                    <th className="pb-1 font-medium">GPU</th>
                    <th className="pb-1 font-medium">Execution</th>
                    <th className="pb-1 font-medium">Cold start</th>
                    <th className="pb-1 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {job.runpodUsage.map((usage) => (
                    <tr key={usage.id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="py-1.5 text-zinc-900 dark:text-zinc-50">{usage.task ?? "—"}</td>
                      <td className="py-1.5 text-zinc-600 dark:text-zinc-400">{usage.gpuType}</td>
                      <td className="py-1.5 text-zinc-600 dark:text-zinc-400">
                        {formatDuration(usage.executionMs / 1000)}
                      </td>
                      <td className="py-1.5 text-zinc-600 dark:text-zinc-400">
                        {formatDuration(usage.delayMs / 1000)}
                      </td>
                      <td className="py-1.5 text-right text-zinc-900 dark:text-zinc-50">
                        {formatCost(usage.costUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {job.coldStartCostUsd > 0 && job.runpodCostUsd > 0 && (
                <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-600">
                  {formatCost(job.coldStartCostUsd)} of {formatCost(job.runpodCostUsd)} RunPod cost (
                  {((job.coldStartCostUsd / job.runpodCostUsd) * 100).toFixed(0)}%) was cold-start
                  overhead.
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-zinc-400 dark:text-zinc-600">No RunPod usage recorded.</p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Anthropic</h2>
          {job.anthropicUsage.length > 0 ? (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 dark:text-zinc-400">
                  <th className="pb-1 font-medium">Model</th>
                  <th className="pb-1 font-medium">In</th>
                  <th className="pb-1 font-medium">Out</th>
                  <th className="pb-1 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {job.anthropicUsage.map((usage) => (
                  <tr key={usage.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5 text-zinc-900 dark:text-zinc-50">{usage.model}</td>
                    <td className="py-1.5 text-zinc-600 dark:text-zinc-400">
                      {usage.inputTokens.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-zinc-600 dark:text-zinc-400">
                      {usage.outputTokens.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right text-zinc-900 dark:text-zinc-50">
                      {formatCost(usage.costUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-zinc-400 dark:text-zinc-600">
              No Anthropic usage recorded.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
