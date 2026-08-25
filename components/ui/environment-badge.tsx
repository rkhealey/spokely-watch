import type { Environment } from "@prisma/client";

// Production is the default, unflagged case — only call out DEVELOPMENT so a
// job detail page (which isn't filtered by the nav's environment toggle)
// makes it obvious when you've landed on a dev/test run.
export function EnvironmentBadge({ environment }: { environment: Environment }) {
  if (environment !== "DEVELOPMENT") return null;

  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
      Dev
    </span>
  );
}
