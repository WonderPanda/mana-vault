import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus, Swords } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { orpc, queryClient } from "@/utils/orpc";
import { sum, useLiveQuery } from "@tanstack/react-db";

export const Route = createFileRoute("/(app)/_authed/decks/")({
  component: DecksPage,
  // TODO: Remove
  // beforeLoad: async ({ context: { queryClient } }) => {
  //   await queryClient.ensureQueryData(orpc.decks.list.queryOptions());
  // },
  loader: ({
    context: {
      db: { deckCollection, deckCardCollection },
    },
  }) => {
    return {
      deckCollection,
      deckCardCollection,
    };
  },
});

type DeckFormat = "commander" | "standard" | "modern" | "legacy" | "pioneer" | "pauper" | "other";
type DeckStatus = "active" | "retired" | "in_progress" | "theorycraft";
type DeckArchetype = "aggro" | "control" | "combo" | "midrange" | "tempo" | "other";

function DecksPage() {
  const { deckCollection, deckCardCollection } = Route.useLoaderData();

  const { data: decks } = useSuspenseQuery(orpc.decks.list.queryOptions());
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // TODO: Could we do this as a join?
  const { data: liveDecks } = useLiveQuery((q) => q.from({ deck: deckCollection }));
  const { data: deckCardCount } = useLiveQuery((q) =>
    q
      .from({ deckCard: deckCardCollection })
      .groupBy(({ deckCard }) => deckCard.deckId)
      .select(({ deckCard }) => ({
        deckId: deckCard.deckId,
        cardCount: sum(deckCard.quantity),
      })),
  );

  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Decks</PageTitle>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger
            render={
              <Button size="icon" className="rounded-full">
                <Plus className="h-5 w-5" />
              </Button>
            }
          />
          <CreateDeckDialog onSuccess={() => setIsCreateOpen(false)} />
        </Dialog>
      </PageHeader>

      <PageContent>
        {decks.length === 0 ? (
          <EmptyDecksState onCreateClick={() => setIsCreateOpen(true)} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {liveDecks.map((deck) => (
              <DeckCard
                key={deck.id}
                deck={{
                  ...deck,
                  createdAt: new Date(deck.createdAt),
                  updatedAt: new Date(deck.updatedAt),
                  cardCount: deckCardCount.find((dc) => dc.deckId === deck.id)?.cardCount ?? 0,
                }}
              />
            ))}
          </div>
        )}
      </PageContent>
    </PageLayout>
  );
}

interface Deck {
  id: string;
  name: string;
  format: string;
  status: string;
  archetype: string | null;
  colorIdentity: string | null;
  description: string | null;
  isPublic: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  cardCount: number;
}

function DeckCard({ deck }: { deck: Deck }) {
  const navigate = useNavigate();

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-accent/50"
      onClick={() => navigate({ to: "/decks/$deckId", params: { deckId: deck.id } })}
    >
      <CardHeader className="flex-row items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/20">
          <Swords className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-semibold">{deck.name}</h3>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium uppercase">
              {deck.format}
            </span>
            <span className="rounded bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
              {getStatusLabel(deck.status)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {deck.cardCount} {deck.cardCount === 1 ? "Card" : "Cards"}
        </p>
      </CardContent>
    </Card>
  );
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "retired":
      return "Retired";
    case "in_progress":
      return "In Progress";
    case "theorycraft":
      return "Theorycraft";
    default:
      return status;
  }
}

function getFormatLabel(format: string): string {
  switch (format) {
    case "commander":
      return "Commander";
    case "standard":
      return "Standard";
    case "modern":
      return "Modern";
    case "legacy":
      return "Legacy";
    case "pioneer":
      return "Pioneer";
    case "pauper":
      return "Pauper";
    case "other":
      return "Other";
    default:
      return format;
  }
}

function EmptyDecksState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Swords className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-2 text-lg font-semibold">No decks yet</h3>
      <p className="mb-6 max-w-sm text-muted-foreground">
        Create your first deck to start building and tracking your MTG decks. You can import cards
        from CSV or add them manually.
      </p>
      <Button onClick={onCreateClick}>
        <Plus className="mr-2 h-4 w-4" />
        Create Deck
      </Button>
    </div>
  );
}

function CreateDeckDialog({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [format, setFormat] = useState<DeckFormat>("commander");
  const [status, setStatus] = useState<DeckStatus>("in_progress");
  const [archetype, setArchetype] = useState<DeckArchetype | "">("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    ...orpc.decks.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.decks.list.queryOptions().queryKey,
      });
      setName("");
      setFormat("commander");
      setStatus("in_progress");
      setArchetype("");
      setDescription("");
      onSuccess();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      format,
      status,
      archetype: archetype || undefined,
      description: description.trim() || undefined,
    });
  };

  return (
    <DialogContent>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Create Deck</DialogTitle>
          <DialogDescription>Create a new deck to track your cards and builds.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Azorius Control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="format">Format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as DeckFormat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="commander">Commander</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="modern">Modern</SelectItem>
                  <SelectItem value="legacy">Legacy</SelectItem>
                  <SelectItem value="pioneer">Pioneer</SelectItem>
                  <SelectItem value="pauper">Pauper</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as DeckStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                  <SelectItem value="theorycraft">Theorycraft</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="archetype">Archetype (optional)</Label>
            <Select value={archetype} onValueChange={(v) => setArchetype(v as DeckArchetype | "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select an archetype" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aggro">Aggro</SelectItem>
                <SelectItem value="control">Control</SelectItem>
                <SelectItem value="combo">Combo</SelectItem>
                <SelectItem value="midrange">Midrange</SelectItem>
                <SelectItem value="tempo">Tempo</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Deck notes, primer, or strategy..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px]"
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

// Skeleton loading state
export function DeckCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-4">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16 rounded" />
            <Skeleton className="h-5 w-20 rounded" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-16" />
      </CardContent>
    </Card>
  );
}
