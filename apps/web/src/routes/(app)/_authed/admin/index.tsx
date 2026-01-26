import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Database, Download, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageContent, PageHeader, PageLayout, PageTitle } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/(app)/_authed/admin/")({
  component: AdminPage,
  beforeLoad: async ({ context: { queryClient } }) => {
    // Check if user is admin before allowing access
    const isAdmin = await queryClient.fetchQuery(orpc.admin.isAdmin.queryOptions());
    if (!isAdmin) {
      throw redirect({ to: "/cards" });
    }
    await queryClient.ensureQueryData(orpc.admin.getScryfallStats.queryOptions());
  },
});

function AdminPage() {
  const { data: stats } = useSuspenseQuery(orpc.admin.getScryfallStats.queryOptions());

  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Admin</PageTitle>
      </PageHeader>

      <PageContent className="space-y-6">
        {/* Stats Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Scryfall Database Stats
            </CardTitle>
            <CardDescription>Current state of the local Scryfall card database</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-muted p-4 text-center">
                <div className="text-3xl font-bold">{stats.totalCards.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Total Cards</div>
              </div>
              <div className="rounded-lg bg-muted p-4 text-center">
                <div className="text-3xl font-bold">{stats.uniqueSets.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Unique Sets</div>
              </div>
              <div className="rounded-lg bg-muted p-4 text-center">
                <div className="text-3xl font-bold">{stats.cardsWithImages.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Cards with Images</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Import Card */}
        <ScryfallBulkImport />

        {/* Danger Zone */}
        <DangerZone />
      </PageContent>
    </PageLayout>
  );
}

type BulkDataType = "oracle_cards" | "unique_artwork" | "default_cards" | "all_cards";

function ScryfallBulkImport() {
  const [selectedType, setSelectedType] = useState<BulkDataType>("default_cards");
  const [englishOnly, setEnglishOnly] = useState(true);

  // Fetch available bulk data options
  const { data: bulkOptions, isLoading: optionsLoading } = useQuery(
    orpc.admin.getBulkDataOptions.queryOptions(),
  );

  const importMutation = useMutation({
    ...orpc.admin.queueScryfallImport.mutationOptions(),
    onSuccess: (result) => {
      toast.success(result.message);
      // Note: Stats won't update immediately since import runs in background
    },
    onError: (error) => {
      toast.error(`Import failed: ${error.message}`);
    },
  });

  const selectedOption = bulkOptions?.find((opt) => opt.type === selectedType);

  const handleImport = () => {
    importMutation.mutate({
      bulkDataType: selectedType,
      englishOnly,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Import Scryfall Bulk Data
        </CardTitle>
        <CardDescription>
          Import card data from Scryfall&apos;s bulk data files. The import runs in the background
          as a queued job, so you can close this page while it processes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Data type selection */}
        <div className="space-y-2">
          <Label htmlFor="bulk-type">Data Source</Label>
          <Select
            value={selectedType}
            onValueChange={(v) => setSelectedType(v as BulkDataType)}
            disabled={optionsLoading || importMutation.isPending}
          >
            <SelectTrigger id="bulk-type" className="w-full">
              <SelectValue placeholder="Select data source" />
            </SelectTrigger>
            <SelectContent>
              {bulkOptions?.map((option) => (
                <SelectItem key={option.type} value={option.type}>
                  {option.name} ({option.sizeFormatted})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedOption && (
            <p className="text-sm text-muted-foreground">{selectedOption.description}</p>
          )}
        </div>

        {/* Options */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="english-only"
              checked={englishOnly}
              onCheckedChange={(checked) => setEnglishOnly(checked === true)}
              disabled={importMutation.isPending}
            />
            <Label htmlFor="english-only" className="cursor-pointer">
              English cards only
              {selectedType === "all_cards" && (
                <span className="ml-1 text-muted-foreground">
                  (recommended - reduces ~2.5GB to ~500MB)
                </span>
              )}
            </Label>
          </div>
        </div>

        {/* Import info */}
        {selectedOption && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p>
              <strong>Last updated:</strong>{" "}
              {new Date(selectedOption.updatedAt).toLocaleDateString()} at{" "}
              {new Date(selectedOption.updatedAt).toLocaleTimeString()}
            </p>
            <p>
              <strong>Download size:</strong> {selectedOption.sizeFormatted}
            </p>
          </div>
        )}

        {/* Import button */}
        <Button
          onClick={handleImport}
          disabled={importMutation.isPending || optionsLoading}
          className="w-full"
        >
          {importMutation.isPending ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Queueing import job...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Queue Import Job
            </>
          )}
        </Button>

        {importMutation.isSuccess && (
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-700 dark:text-green-400">
            Import job queued successfully! The import is running in the background. Refresh the
            stats above to see progress.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DangerZone() {
  const [confirmClear, setConfirmClear] = useState(false);

  const clearMutation = useMutation({
    ...orpc.admin.clearScryfallCards.mutationOptions(),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
        queryClient.invalidateQueries({
          queryKey: orpc.admin.getScryfallStats.queryOptions().queryKey,
        });
      } else {
        toast.error(result.message);
      }
      setConfirmClear(false);
    },
    onError: (error) => {
      toast.error(`Failed to clear cards: ${error.message}`);
      setConfirmClear(false);
    },
  });

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Trash2 className="h-5 w-5" />
          Danger Zone
        </CardTitle>
        <CardDescription>Destructive actions that cannot be undone</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 p-4">
          <div>
            <p className="font-medium">Clear All Scryfall Cards</p>
            <p className="text-sm text-muted-foreground">
              Remove all cards from the scryfall_card table. Will fail if cards are in use.
            </p>
          </div>
          {confirmClear ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => clearMutation.mutate({})}
                disabled={clearMutation.isPending}
              >
                {clearMutation.isPending ? "Clearing..." : "Confirm"}
              </Button>
            </div>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => setConfirmClear(true)}>
              Clear All
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
