import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Gift, Heart, ListChecks, Plus, ShoppingCart, Sparkles } from "lucide-react";
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
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/(app)/_authed/lists/")({
  component: ListsPage,
  beforeLoad: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(orpc.lists.list.queryOptions());
  },
});

function ListsPage() {
  const { data: lists } = useSuspenseQuery(orpc.lists.list.queryOptions());
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Lists</PageTitle>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger
            render={
              <Button size="icon" className="rounded-full">
                <Plus className="h-5 w-5" />
              </Button>
            }
          />
          <CreateListDialog onSuccess={() => setIsCreateOpen(false)} />
        </Dialog>
      </PageHeader>

      <PageContent>
        {lists.length === 0 ? (
          <EmptyListsState onCreateClick={() => setIsCreateOpen(true)} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {lists.map((list) => (
              <ListCard key={list.id} list={list} />
            ))}
          </div>
        )}
      </PageContent>
    </PageLayout>
  );
}

interface VirtualList {
  id: string;
  name: string;
  description: string | null;
  listType: string;
  sourceType: string | null;
  sourceName: string | null;
  snapshotDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  cardCount: number;
}

function ListCard({ list }: { list: VirtualList }) {
  const navigate = useNavigate();
  const TypeIcon = getListTypeIcon(list.listType, list.sourceType);
  const isWishlist = list.listType === "wishlist";

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-accent/50"
      onClick={() => navigate({ to: "/lists/$listId", params: { listId: list.id } })}
    >
      <CardHeader className="flex-row items-start gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${isWishlist ? "bg-pink-500/20" : "bg-primary/20"}`}
        >
          <TypeIcon className={`h-6 w-6 ${isWishlist ? "text-pink-500" : "text-primary"}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-semibold">{list.name}</h3>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </div>
          <p className="truncate text-muted-foreground">
            {list.description || getListDescription(list.listType, list.sourceType)}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {list.cardCount} {list.cardCount === 1 ? "Card" : "Cards"}
        </p>
      </CardContent>
    </Card>
  );
}

function getListTypeIcon(listType: string, sourceType: string | null) {
  if (listType === "wishlist") {
    return Heart;
  }
  switch (sourceType) {
    case "gift":
      return Gift;
    case "purchase":
      return ShoppingCart;
    case "trade":
      return Sparkles;
    default:
      return ListChecks;
  }
}

function getListDescription(listType: string, sourceType: string | null): string {
  if (listType === "wishlist") {
    return "Wishlist";
  }
  switch (sourceType) {
    case "gift":
      return "Gift";
    case "purchase":
      return "Purchase";
    case "trade":
      return "Trade";
    case "other":
      return "Other";
    default:
      return "Owned Cards";
  }
}

function EmptyListsState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <ListChecks className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-2 text-lg font-semibold">No lists yet</h3>
      <p className="mb-6 max-w-sm text-muted-foreground">
        Create your first list to organize and track groups of cards. Lists are great for tracking
        gifts, purchases, trades, or any custom grouping.
      </p>
      <Button onClick={onCreateClick}>
        <Plus className="mr-2 h-4 w-4" />
        Create List
      </Button>
    </div>
  );
}

function CreateListDialog({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [listType, setListType] = useState<"owned" | "wishlist">("owned");
  const [sourceType, setSourceType] = useState<"gift" | "purchase" | "trade" | "other" | "">("");
  const [sourceName, setSourceName] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    ...orpc.lists.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.lists.list.queryOptions().queryKey,
      });
      setName("");
      setListType("owned");
      setSourceType("");
      setSourceName("");
      setDescription("");
      onSuccess();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      listType,
      sourceType: sourceType || undefined,
      sourceName: sourceName.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  return (
    <DialogContent>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Create List</DialogTitle>
          <DialogDescription>
            Create a new list to track cards you own or want to acquire.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Birthday Gift 2024"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="listType">List Type</Label>
            <Select value={listType} onValueChange={(v) => setListType(v as "owned" | "wishlist")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owned">Owned Cards</SelectItem>
                <SelectItem value="wishlist">Wishlist</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {listType === "owned"
                ? "Track cards you received or purchased. Can be moved to your collection later."
                : "Track cards you want to acquire."}
            </p>
          </div>
          {listType === "owned" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="sourceType">Source Type (optional)</Label>
                <Select
                  value={sourceType}
                  onValueChange={(v) =>
                    setSourceType(v as "gift" | "purchase" | "trade" | "other" | "")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a source type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gift">Gift</SelectItem>
                    <SelectItem value="purchase">Purchase</SelectItem>
                    <SelectItem value="trade">Trade</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sourceName">Source Name (optional)</Label>
                <Input
                  id="sourceName"
                  placeholder="e.g., John, LGS, eBay"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="grid gap-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              placeholder={
                listType === "owned"
                  ? "e.g., Cards received for my birthday"
                  : "e.g., Cards I want for my Commander deck"
              }
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
export function ListCardSkeleton() {
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
