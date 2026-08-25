"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Environment } from "@prisma/client";
import { setEnvironmentFilter } from "@/app/environment-actions";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/jobs", label: "Jobs" },
  { href: "/costs", label: "Costs" },
  { href: "/errors", label: "Errors" },
];

const ENVIRONMENTS: { value: Environment; label: string }[] = [
  { value: "PRODUCTION", label: "Production" },
  { value: "DEVELOPMENT", label: "Development" },
];

function isLinkActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav({ environment }: { environment: Environment }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleEnvironmentChange(value: Environment) {
    if (value === environment) return;
    startTransition(async () => {
      await setEnvironmentFilter(value);
      router.refresh();
    });
  }

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Spokely Watch
          </span>
          <nav className="flex gap-1">
            {LINKS.map((link) => {
              const isActive = isLinkActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div
            className={`flex gap-1 rounded-md border border-zinc-200 p-0.5 dark:border-zinc-800 ${
              isPending ? "opacity-60" : ""
            }`}
          >
            {ENVIRONMENTS.map((env) => (
              <button
                key={env.value}
                type="button"
                disabled={isPending}
                onClick={() => handleEnvironmentChange(env.value)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  environment === env.value
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {env.label}
              </button>
            ))}
          </div>
          <a
            href="/logout"
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Sign out
          </a>
        </div>
      </div>
    </header>
  );
}
