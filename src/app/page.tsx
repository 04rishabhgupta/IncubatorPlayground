import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { FloorExplorer } from "@/components/floor/floor-explorer";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { getFloorPlan } from "@/lib/floor/queries";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6">
      <Suspense fallback={<FloorSkeleton />}>
        <FloorSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function FloorSection({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const params = await searchParams;
  const floorSlug = typeof params.floor === "string" ? params.floor : undefined;

  let result;
  try {
    result = await getFloorPlan(floorSlug);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Floor plan failed to load", error);
    return (
      <Alert tone="error" title="The floor plan couldn't be loaded">
        Please refresh the page. You can still browse companies in the{" "}
        <a href="/directory" className="underline">
          directory
        </a>
        .
      </Alert>
    );
  }

  if (result.status === "no-floor") {
    return <EmptyFloor message="No floors have been set up yet." />;
  }
  if (result.status === "invalid") {
    console.error("Invalid floor data", result.problems);
    return (
      <EmptyFloor message="The floor plan data is incomplete. The platform admin has been asked to fix it." />
    );
  }
  return (
    <>
      <LiveRefresh channel="floor-availability" tables={["company_availability", "member_availability"]} />
      <FloorExplorer plan={result.plan} />
    </>
  );
}

function EmptyFloor({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
      <h1 className="text-lg font-semibold text-ink">Floor map unavailable</h1>
      <p className="mt-2 text-muted">{message}</p>
      <ButtonLink href="/directory" className="mt-6">
        Browse the directory
      </ButtonLink>
    </div>
  );
}

function FloorSkeleton() {
  return (
    <div
      className="grid animate-pulse gap-4 lg:h-[calc(100svh-6rem)] lg:grid-cols-[minmax(0,1fr)_380px]"
      aria-busy="true"
      aria-label="Loading floor map"
    >
      <div className="h-[55svh] rounded-xl bg-surface-muted lg:h-auto" />
      <div className="h-64 rounded-xl bg-surface-muted lg:h-auto" />
    </div>
  );
}
