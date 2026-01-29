import { useMutation } from "@tanstack/react-query";
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
import { eq, sum, useLiveQuery, useLiveSuspenseQuery } from "@tanstack/react-db";
import { useDbCollections } from "@/lib/db/db-context";
import type { ScryfallCardDoc } from "@/lib/db/db";

export const Route = createFileRoute("/(app)/_authed/decks/")({
  component: DecksPage,
});

type DeckFormat = "commander" | "standard" | "modern" | "legacy" | "pioneer" | "pauper" | "other";
type DeckStatus = "active" | "retired" | "in_progress" | "theorycraft";
type DeckArchetype = "aggro" | "control" | "combo" | "midrange" | "tempo" | "other";

function DecksPage() {
  const { deckCardCollection, deckCollection, scryfallCardCollection } = useDbCollections();

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // TODO: Could we do this as a join?
  const { data: decks } = useLiveSuspenseQuery((q) => q.from({ deck: deckCollection }));
  const { data: deckCardCount } = useLiveSuspenseQuery((q) =>
    q
      .from({ deckCard: deckCardCollection })
      .groupBy(({ deckCard }) => deckCard.deckId)
      .select(({ deckCard }) => ({
        deckId: deckCard.deckId,
        cardCount: sum(deckCard.quantity),
      })),
  );

  // Query for commanders (cards with isCommander = true) with their scryfall data
  const { data: commanderCards } = useLiveSuspenseQuery((q) =>
    q
      .from({ deckCard: deckCardCollection })
      .innerJoin({ card: scryfallCardCollection }, ({ card, deckCard }) =>
        eq(deckCard.preferredScryfallId, card.id),
      )
      .fn.where((row) => row.deckCard.isCommander === true)
      .select(({ deckCard, card }) => ({
        deckId: deckCard.deckId,
        scryfallCard: card,
      })),
  );

  // Group commanders by deck ID for easy lookup
  const commandersByDeckId = commanderCards.reduce(
    (acc, { deckId, scryfallCard }) => {
      if (!acc[deckId]) {
        acc[deckId] = [];
      }
      acc[deckId].push(scryfallCard);
      return acc;
    },
    {} as Record<string, ScryfallCardDoc[]>,
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
            {decks.map((deck) => (
              <DeckCard
                key={deck.id}
                deck={{
                  ...deck,
                  createdAt: new Date(deck.createdAt),
                  updatedAt: new Date(deck.updatedAt),
                  cardCount: deckCardCount.find((dc) => dc.deckId === deck.id)?.cardCount ?? 0,
                }}
                commanders={commandersByDeckId[deck.id]}
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

interface DeckCardProps {
  deck: Deck;
  commanders?: ScryfallCardDoc[];
}

function DeckCard({ deck, commanders }: DeckCardProps) {
  const navigate = useNavigate();
  const isCommanderDeck = deck.format === "commander";
  const hasCommander = commanders && commanders.length > 0;

  // Commander deck with commander - show featured card layout
  if (isCommanderDeck && hasCommander) {
    return (
      <Card
        className="group cursor-pointer overflow-hidden transition-all hover:ring-2 hover:ring-primary/50"
        onClick={() => navigate({ to: "/decks/$deckId", params: { deckId: deck.id } })}
      >
        {/* Commander art as hero image */}
        <div className="relative h-32 overflow-hidden bg-gradient-to-b from-muted to-muted/50">
          <img
            src={commanders[0].imageUri ?? undefined}
            alt={commanders[0].name}
            className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
          />
          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

          {/* Partner commander indicator */}
          {commanders.length > 1 && (
            <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-xs font-medium backdrop-blur-sm">
              <span>Partners</span>
            </div>
          )}

          {/* Deck name overlay */}
          <div className="absolute right-0 bottom-0 left-0 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate font-semibold text-foreground">{deck.name}</h3>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>

        {/* Card content */}
        <CardContent className="p-3">
          <p className="mb-2 truncate text-sm font-medium text-foreground/80">
            {commanders.map((c) => c.name).join(" & ")}
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {deck.cardCount} cards
              </span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {getStatusLabel(deck.status)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Non-commander deck or commander deck without commander set - standard layout
  return (
    <Card
      className="group cursor-pointer transition-all hover:ring-2 hover:ring-primary/50"
      onClick={() => navigate({ to: "/decks/$deckId", params: { deckId: deck.id } })}
    >
      <CardHeader className="flex-row items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Swords className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-semibold">{deck.name}</h3>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
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
