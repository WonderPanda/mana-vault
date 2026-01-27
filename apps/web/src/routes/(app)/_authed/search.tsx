import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { CardSearchContent } from "@/components/card-search";
import { PageContent, PageHeader, PageLayout, PageTitle } from "@/components/page-layout";
import type { SelectedCard } from "@/types/scryfall";

export const Route = createFileRoute("/(app)/_authed/search")({
  component: SearchPage,
});

function SearchPage() {
  const handleConfirm = (cards: SelectedCard[]) => {
    // TODO: In the future, this could open a "Add to..." menu
    // to let the user choose which list/deck/collection to add cards to
    const totalCards = cards.reduce((sum, c) => sum + c.quantity, 0);
    toast.info(
      `Selected ${totalCards} card${totalCards !== 1 ? "s" : ""} - "Add to..." functionality coming soon`,
    );
  };

  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Global Search</PageTitle>
      </PageHeader>

      <PageContent className="flex flex-col">
        <CardSearchContent onConfirm={handleConfirm} standalone className="flex-1" />
      </PageContent>
    </PageLayout>
  );
}
