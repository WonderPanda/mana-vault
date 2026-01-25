import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gift, ListChecks, ShoppingCart, Sparkles } from "lucide-react";

import { PageContent, PageHeader, PageLayout, PageTitle } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/(app)/_authed/lists/$listId")({
	component: ListDetailPage,
	beforeLoad: async ({ context: { queryClient }, params }) => {
		await queryClient.ensureQueryData(
			orpc.lists.get.queryOptions({ input: { id: params.listId } }),
		);
	},
});

function ListDetailPage() {
	const { listId } = Route.useParams();
	const { data: list } = useSuspenseQuery(
		orpc.lists.get.queryOptions({ input: { id: listId } }),
	);

	const TypeIcon = getSourceTypeIcon(list.sourceType);

	return (
		<PageLayout>
			<PageHeader>
				<div className="flex items-center gap-3">
					<Link to="/lists">
						<Button variant="ghost" size="icon">
							<ArrowLeft className="h-5 w-5" />
						</Button>
					</Link>
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
							<TypeIcon className="h-5 w-5 text-primary" />
						</div>
						<div>
							<PageTitle>{list.name}</PageTitle>
							{list.description && (
								<p className="text-sm text-muted-foreground">{list.description}</p>
							)}
						</div>
					</div>
				</div>
			</PageHeader>

			<PageContent>
				{/* List metadata */}
				<div className="mb-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
					{list.sourceType && (
						<div>
							<span className="font-medium">Source:</span> {getSourceTypeLabel(list.sourceType)}
						</div>
					)}
					{list.sourceName && (
						<div>
							<span className="font-medium">From:</span> {list.sourceName}
						</div>
					)}
					<div>
						<span className="font-medium">Cards:</span> {list.cardCount}
					</div>
					<div>
						<span className="font-medium">Created:</span>{" "}
						{new Date(list.createdAt).toLocaleDateString()}
					</div>
				</div>

				{/* Cards section - empty state for now since we don't have getCards yet */}
				{list.cardCount === 0 ? (
					<EmptyCardsState />
				) : (
					<div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
						{/* Cards will be displayed here once getCards is implemented */}
						<p className="col-span-full text-center text-muted-foreground">
							{list.cardCount} cards in this list
						</p>
					</div>
				)}
			</PageContent>
		</PageLayout>
	);
}

function getSourceTypeIcon(sourceType: string | null) {
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

function getSourceTypeLabel(sourceType: string | null): string {
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
			return "Custom List";
	}
}

function EmptyCardsState() {
	return (
		<div className="flex flex-col items-center justify-center py-16 text-center">
			<div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
				<ListChecks className="h-8 w-8 text-muted-foreground" />
			</div>
			<h3 className="mb-2 text-lg font-semibold">No cards yet</h3>
			<p className="max-w-sm text-muted-foreground">
				This list is empty. Add cards from your collection to track them in this list.
			</p>
		</div>
	);
}

export function ListDetailSkeleton() {
	return (
		<PageLayout>
			<PageHeader>
				<div className="flex items-center gap-3">
					<Skeleton className="h-10 w-10 rounded" />
					<div className="space-y-2">
						<Skeleton className="h-6 w-32" />
						<Skeleton className="h-4 w-48" />
					</div>
				</div>
			</PageHeader>
			<PageContent>
				<div className="mb-6 flex gap-4">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-4 w-24" />
				</div>
				<div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
					{Array.from({ length: 10 }).map((_, i) => (
						<Card key={i} className="overflow-hidden">
							<Skeleton className="aspect-[488/680]" />
							<CardContent className="space-y-2 p-3">
								<Skeleton className="h-4 w-3/4" />
								<Skeleton className="h-3 w-1/2" />
							</CardContent>
						</Card>
					))}
				</div>
			</PageContent>
		</PageLayout>
	);
}
