const STATUS_STYLE = {
  SUCCEEDED: { color: "var(--chart-good)", label: "Succeeded" },
  FAILED: { color: "var(--chart-critical)", label: "Failed" },
  QUEUED: { color: "var(--chart-text-muted)", label: "Queued" },
  PROCESSING: { color: "var(--chart-blue)", label: "Processing" },
} as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS_STYLE }) {
  const { color, label } = STATUS_STYLE[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
