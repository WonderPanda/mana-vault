import { createFileRoute } from "@tanstack/react-router";
import { ScanSearch } from "lucide-react";

import {
  PageContent,
  PageHeader,
  PageLayout,
  PageTitle,
} from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/(app)/_authed/search")({
  component: SearchPage,
});

function SearchPage() {
  return (
    <PageLayout>
      <PageHeader className="flex-col items-stretch gap-4">
        <PageTitle>Global Search</PageTitle>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type="search"
              placeholder="Find any Magic card..."
              className="h-10 rounded-lg pl-10"
            />
            <ScanSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          <Button className="h-10 rounded-lg px-6">Go</Button>
        </div>
      </PageHeader>

      <PageContent className="flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <ScanSearch className="h-16 w-16 text-muted-foreground/50" />
          <p className="text-muted-foreground">
            Search for any card printed in Magic history.
          </p>
        </div>
      </PageContent>
    </PageLayout>
  );
}

// Skeleton loading state for search results (future use)
export function SearchResultSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[488/680] w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
