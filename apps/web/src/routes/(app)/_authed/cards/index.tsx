import { useMutation } from "@tanstack/react-query";
import { useLiveQuery, sum } from "@tanstack/react-db";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpen, Box, ChevronRight, Plus, Square } from "lucide-react";
import { useState } from "react";

import { PageContent, PageHeader, PageLayout, PageTitle } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDbCollections } from "@/lib/db/db-context";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/(app)/_authed/cards/")({
  component: CardsPage,
});

function CardsPage() {
  const { storageContainerCollection, collectionCardLocationCollection } = useDbCollections();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Query storage containers from local IndexedDB
  const { data: containers } = useLiveQuery((q) =>
    q.from({ container: storageContainerCollection }),
  );

  // Query card counts per container (group by storageContainerId, null values become their own group)
  const { data: cardCounts } = useLiveQuery((q) =>
    q
      .from({ location: collectionCardLocationCollection })
      .groupBy(({ location }) => location.storageContainerId)
      .select(({ location }) => ({
        storageContainerId: location.storageContainerId,
        cardCount: sum(1),
      })),
  );

  // Transform to the expected format
  const collections = containers.map((container) => ({
    ...container,
    createdAt: new Date(container.createdAt),
    updatedAt: new Date(container.updatedAt),
    cardCount: cardCounts.find((cc) => cc.storageContainerId === container.id)?.cardCount ?? 0,
  }));

  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Collection</PageTitle>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger
            render={
              <Button size="icon" className="rounded-full">
                <Plus className="h-5 w-5" />
              </Button>
            }
          />
          <CreateCollectionDialog onSuccess={() => setIsCreateOpen(false)} />
        </Dialog>
      </PageHeader>

      <PageContent>
        {collections.length === 0 ? (
          <EmptyCollectionsState onCreateClick={() => setIsCreateOpen(true)} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {collections.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} />
            ))}
          </div>
        )}
      </PageContent>
    </PageLayout>
  );
}

interface Collection {
  id: string;
  name: string;
  type: string;
  description: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  cardCount: number;
}

function CollectionCard({ collection }: { collection: Collection }) {
  const navigate = useNavigate();
  const TypeIcon = collection.type === "binder" ? BookOpen : Box;

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-accent/50"
      onClick={() =>
        navigate({ to: "/cards/$collectionId", params: { collectionId: collection.id } })
      }
    >
      <CardHeader className="flex-row items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/20">
          <TypeIcon className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-semibold">{collection.name}</h3>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </div>
          <p className="truncate text-muted-foreground">
            {collection.description || getTypeLabel(collection.type)}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {collection.cardCount} {collection.cardCount === 1 ? "Card" : "Cards"}
        </p>
      </CardContent>
    </Card>
  );
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "binder":
      return "Binder";
    case "box":
      return "Box";
    case "deck_box":
      return "Deck Box";
    default:
      return "Other";
  }
}

function EmptyCollectionsState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Square className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-2 text-lg font-semibold">No collections yet</h3>
      <p className="mb-6 max-w-sm text-muted-foreground">
        Create your first collection to start organizing your cards. You can create boxes, binders,
        or other storage containers.
      </p>
      <Button onClick={onCreateClick}>
        <Plus className="mr-2 h-4 w-4" />
        Create Collection
      </Button>
    </div>
  );
}

function CreateCollectionDialog({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"box" | "binder" | "deck_box" | "other">("box");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    ...orpc.collections.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.collections.list.queryOptions().queryKey,
      });
      setName("");
      setType("box");
      setDescription("");
      onSuccess();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      type,
      description: description.trim() || undefined,
    });
  };

  return (
    <DialogContent>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Create Collection</DialogTitle>
          <DialogDescription>Add a new box or binder to organize your cards.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Main Collection"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="type">Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as "box" | "binder" | "deck_box" | "other")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="box">Box</SelectItem>
                <SelectItem value="binder">Binder</SelectItem>
                <SelectItem value="deck_box">Deck Box</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              placeholder="e.g., High value trades"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// Skeleton loading state for future use
export function CollectionCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-4">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-16" />
      </CardContent>
    </Card>
  );
}
