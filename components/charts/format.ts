// Bucket keys are local "YYYY-MM-DD" strings (see lib/queries.ts dayKey).
// Parse as local components, not via `new Date(string)`, which treats a
// bare date string as UTC midnight and can shift the label by a day.
export function formatDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
