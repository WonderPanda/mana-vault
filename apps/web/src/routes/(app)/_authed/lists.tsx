import { createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Layers, ListChecks, MoreHorizontal, Plus } from "lucide-react";

import { PageContent, PageHeader, PageLayout, PageTitle } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/(app)/_authed/lists")({
  component: ListsPage,
});

// Placeholder data for lists
const placeholderLists = [
  { id: "1", name: "Cube Draft", type: "Cube", itemCount: 360, icon: Layers },
  {
    id: "2",
    name: "Chase Rares",
    type: "Wishlist",
    itemCount: 15,
    icon: ListChecks,
  },
  {
    id: "3",
    name: "Trade Binder",
    type: "Trade",
    itemCount: 42,
    icon: ListChecks,
  },
];

function ListsPage() {
  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Lists</PageTitle>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </PageHeader>

      <PageContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {placeholderLists.map((list) => (
            <ListCard key={list.id} list={list} />
          ))}

          {/* Create New List Card */}
          <Card className="cursor-pointer border-dashed transition-colors hover:bg-accent/50">
            <CardHeader className="flex h-full flex-row items-center justify-center gap-2">
              <Plus className="h-5 w-5 text-muted-foreground" />
              <span className="text-muted-foreground">Create New List</span>
            </CardHeader>
          </Card>
        </div>
      </PageContent>
    </PageLayout>
  );
}

function ListCard({
  list,
}: {
  list: {
    id: string;
    name: string;
    type: string;
    itemCount: number;
    icon: React.ComponentType<{ className?: string }>;
  };
}) {
  const IconComponent = list.icon;

  return (
    <Card className="cursor-pointer transition-colors hover:bg-accent/50">
      <CardHeader className="flex-row items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20">
          <IconComponent className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-semibold">{list.name}</h3>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">
            {list.type} &middot; {list.itemCount} items
          </p>
        </div>
      </CardHeader>
    </Card>
  );
}

// Skeleton loading state for future use
export function ListCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </CardHeader>
    </Card>
  );
}
