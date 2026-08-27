const STEP_STATUS_STYLE = {
  STARTED: { color: "var(--chart-blue)", label: "In progress" },
  SUCCEEDED: { color: "var(--chart-good)", label: "Succeeded" },
  FAILED: { color: "var(--chart-critical)", label: "Failed" },
} as const;

export function StepStatusBadge({ status }: { status: keyof typeof STEP_STATUS_STYLE | null }) {
  if (status === null) {
    return <span className="text-sm text-zinc-400 dark:text-zinc-600">—</span>;
  }

  const { color, label } = STEP_STATUS_STYLE[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
