import { useState } from "react";

import { Pipette, Plus, Tags } from "lucide-react";

import { PageContent, PageHeader, PageLayout, PageTitle } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTags } from "@/hooks/use-tags";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useDbCollections } from "@/lib/db/db-context";

export const Route = createFileRoute("/(app)/_authed/settings/")({
  component: SettingsPage,
});

const TAG_COLORS = [
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Green", value: "#22c55e" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
  { name: "Gray", value: "#6b7280" },
];

function SettingsPage() {
  const { data: tags } = useTags();
  const [newTagName, setNewTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[5]!.value);

  const { tagCollection } = useDbCollections();

  const handleCreateTag = () => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;

    tagCollection.insert({
      color: selectedColor,
      name: trimmed,
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
      isSystem: false,
      id: crypto.randomUUID(),
      _deleted: false,
    });

    setNewTagName("");
    setSelectedColor(TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]!.value);
  };

  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Settings</PageTitle>
      </PageHeader>

      <PageContent>
        <div className="mx-auto max-w-2xl space-y-8">
          {/* Tag Management Section */}
          <section className="rounded-lg border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <Tags className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Tags</h2>
            </div>
            <p className="mb-6 text-sm text-muted-foreground">
              Create tags to organize your cards and collections.
            </p>

            {/* Add new tag */}
            <div className="mb-6 space-y-3">
              <Label htmlFor="tag-name">New Tag</Label>
              <div className="flex gap-2">
                <Input
                  id="tag-name"
                  placeholder="Tag name"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateTag();
                  }}
                  className="flex-1"
                />
                <Button onClick={handleCreateTag} size="icon" disabled={!newTagName.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Color picker */}
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent">
                    <div
                      className="h-5 w-5 rounded-full border"
                      style={{ backgroundColor: selectedColor }}
                    />
                    <span className="text-muted-foreground">Color</span>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3" align="start">
                    <div className="space-y-3">
                      <div className="grid grid-cols-5 gap-2">
                        {TAG_COLORS.map((color) => (
                          <button
                            key={color.value}
                            type="button"
                            title={color.name}
                            onClick={() => setSelectedColor(color.value)}
                            className={cn(
                              "h-8 w-8 rounded-full border-2 transition-transform hover:scale-110",
                              selectedColor === color.value
                                ? "border-foreground scale-110"
                                : "border-transparent",
                            )}
                            style={{ backgroundColor: color.value }}
                          />
                        ))}
                      </div>
                      <div className="border-t pt-3">
                        <Label
                          htmlFor="custom-color"
                          className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"
                        >
                          <Pipette className="h-3 w-3" />
                          Custom color
                        </Label>
                        <div className="flex items-center gap-2">
                          <input
                            id="custom-color"
                            type="color"
                            value={selectedColor}
                            onChange={(e) => setSelectedColor(e.target.value)}
                            className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                          />
                          <Input
                            value={selectedColor}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setSelectedColor(v);
                            }}
                            className="h-8 w-24 font-mono text-xs"
                            maxLength={7}
                          />
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Tag list */}
            <div className="space-y-2">
              {!tags || tags.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No tags yet. Create one above.
                </p>
              ) : (
                tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: tag.color ?? "#6b7280" }}
                      />
                      <span className="text-sm font-medium">{tag.name}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </PageContent>
    </PageLayout>
  );
}
