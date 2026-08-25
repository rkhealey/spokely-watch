import { StatCard } from "@/components/ui/stat-card";
import { ChartCard } from "@/components/ui/chart-card";
import { JobsChart } from "@/components/charts/jobs-chart";
import { AudioHoursChart } from "@/components/charts/audio-hours-chart";
import { SpeedChart } from "@/components/charts/speed-chart";
import { getOverviewStats, getJobsPerDay, getAudioHoursPerDay, getProcessingSpeedPerDay } from "@/lib/queries";
import { getEnvironmentFilter } from "@/lib/environment";

export default async function OverviewPage() {
  const environment = await getEnvironmentFilter();
  const [stats, jobsPerDay, audioHoursPerDay, speedPerDay] = await Promise.all([
    getOverviewStats(environment),
    getJobsPerDay(environment),
    getAudioHoursPerDay(environment),
    getProcessingSpeedPerDay(environment),
  ]);
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
          hint={`≈${stats.realtimeMultiple.toFixed(1)}x realtime`}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Jobs processed" subtitle="Succeeded vs. failed, per day">
          <JobsChart data={jobsPerDay} />
        </ChartCard>
        <ChartCard title="Audio hours processed" subtitle="Total hours transcribed, per day">
          <AudioHoursChart data={audioHoursPerDay} />
        </ChartCard>
        <ChartCard
          title="Processing speed"
          subtitle="Audio duration ÷ processing time, per day — normalized so a day of long episodes doesn't look 'slower'"
        >
          <SpeedChart data={speedPerDay} />
        </ChartCard>
      </div>
    </div>
  );
}
