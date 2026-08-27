"use client";

import { useState, useTransition } from "react";
import { retryJob } from "@/app/jobs-actions";

export function RetryButton({ externalId }: { externalId: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const res = await retryJob(externalId);
      setResult(
        res.ok
          ? { ok: true, message: `Retry dispatched — ${res.currentStatus}` }
          : { ok: false, message: res.error }
      );
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending || result?.ok}
        className="whitespace-nowrap rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {isPending ? "Retrying…" : result?.ok ? "Retried" : "Retry"}
      </button>
      {result && !isPending && (
        <span
          className={`text-xs ${
            result.ok ? "text-zinc-500 dark:text-zinc-400" : "text-red-600 dark:text-red-400"
          }`}
        >
          {result.message}
        </span>
      )}
    </div>
  );
}
