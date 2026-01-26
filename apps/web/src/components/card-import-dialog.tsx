import { useRef, useState } from "react";
import { FileUp, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Supported CSV format identifiers.
 * Add new formats here as they are implemented.
 */
export type Format = "manabox" | "moxfield";

interface CsvFormatOption {
  value: Format;
  label: string;
  description?: string;
}

const CSV_FORMATS: CsvFormatOption[] = [
  {
    value: "manabox",
    label: "ManaBox",
    // description: "Export from ManaBox app",
  },
  {
    value: "moxfield",
    label: "Moxfield",
  },
  // Future formats will be added here:
  // { value: "deckbox", label: "Deckbox", description: "Export from Deckbox.org" },
  // { value: "tcgplayer", label: "TCGPlayer", description: "Export from TCGPlayer" },
];

export interface CardImportData {
  /** The raw CSV content */
  csvContent: string;
  /** The selected format for parsing */
  format: Format;
}

interface CardImportDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Callback when import is submitted */
  onImport: (data: CardImportData) => void;
  /** Whether the import is currently in progress */
  isImporting?: boolean;
  /** Optional title override */
  title?: string;
  /** Optional description override */
  description?: string;
}

export function CardImportDialog({
  open,
  onOpenChange,
  onImport,
  isImporting = false,
  title = "Import Cards",
  description = "Import cards from a file or paste text content directly.",
}: CardImportDialogProps) {
  const [inputMethod, setInputMethod] = useState<"paste" | "file">("paste");
  const [csvContent, setCsvContent] = useState("");
  const [format, setFormat] = useState<Format>("manabox");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
      // Could add toast error here in the future
      return;
    }

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === "string") {
        setCsvContent(content);
      }
    };
    reader.readAsText(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvContent.trim()) return;

    onImport({
      csvContent: csvContent.trim(),
      format,
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after dialog closes
    setTimeout(() => {
      setCsvContent("");
      setFileName(null);
      setInputMethod("paste");
    }, 200);
  };

  const hasContent = csvContent.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Format Selection */}
            <div className="grid gap-2">
              <Label htmlFor="format">Import Format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as Format)}>
                <SelectTrigger id="format">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  {CSV_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      <span className="font-medium">{f.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Input Method Tabs */}
            <Tabs value={inputMethod} onValueChange={(v) => setInputMethod(v as "paste" | "file")}>
              <TabsList className="w-full">
                <TabsTrigger value="paste" className="flex-1">
                  Paste
                </TabsTrigger>
                <TabsTrigger value="file" className="flex-1">
                  Upload File
                </TabsTrigger>
              </TabsList>

              <TabsContent value="paste" className="mt-4">
                <div className="grid gap-2">
                  <Label htmlFor="csv-content">Content</Label>
                  <Textarea
                    id="csv-content"
                    placeholder="Paste your content here..."
                    value={csvContent}
                    onChange={(e) => setCsvContent(e.target.value)}
                    className="min-h-[200px] max-h-[300px] resize-none font-mono text-xs"
                  />
                </div>
              </TabsContent>

              <TabsContent value="file" className="mt-4">
                <div className="grid gap-2">
                  <Label>File</Label>
                  <div
                    className={cn(
                      "flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-6 transition-colors",
                      isDragging
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-muted-foreground/50",
                      fileName && "border-primary/50 bg-primary/5",
                    )}
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />

                    {fileName ? (
                      <>
                        <FileUp className="mb-2 h-8 w-8 text-primary" />
                        <p className="font-medium">{fileName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Click or drag to replace
                        </p>
                      </>
                    ) : (
                      <>
                        <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                        <p className="font-medium">Drop your file here</p>
                        <p className="mt-1 text-xs text-muted-foreground">or click to browse</p>
                      </>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Preview line count */}
            {hasContent && (
              <p className="text-xs text-muted-foreground">
                {csvContent.split("\n").filter((line) => line.trim()).length} lines detected
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isImporting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!hasContent || isImporting}>
              {isImporting ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
