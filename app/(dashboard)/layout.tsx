import { Nav } from "@/components/nav";
import { getEnvironmentFilter } from "@/lib/environment";

// These pages read live metrics on every request; never serve a build-time snapshot.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const environment = await getEnvironmentFilter();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <Nav environment={environment} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
