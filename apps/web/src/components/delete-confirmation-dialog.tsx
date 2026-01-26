import { useState } from "react";

import { cn } from "@/lib/utils";

import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The name of the item being deleted (displayed in the dialog) */
  itemName: string;
  /** The type of item being deleted (e.g., "List", "Collection") */
  itemType: string;
  /** Callback when deletion is confirmed */
  onConfirm: () => void;
  /** Whether the deletion is in progress */
  isDeleting?: boolean;
  /** Warning message to display */
  warningMessage?: string;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  itemName,
  itemType,
  onConfirm,
  isDeleting = false,
  warningMessage,
}: DeleteConfirmationDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const isConfirmValid = confirmText.toLowerCase() === "delete";

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setConfirmText("");
    }
    onOpenChange(open);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isConfirmValid && !isDeleting) {
      onConfirm();
    }
  };

  const defaultWarning = `This will permanently delete the ${itemType.toLowerCase()} and cannot be undone.`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Delete {itemType}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>"{itemName}"</strong>? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">Warning</p>
              <p className="mt-1">{warningMessage || defaultWarning}</p>
            </div>
            <div className="mt-4 grid gap-2">
              <Label htmlFor="confirm">
                Type <span className="font-mono font-semibold">delete</span> to confirm
              </Label>
              <Input
                id="confirm"
                placeholder="delete"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!isConfirmValid || isDeleting}
              className={cn(!isConfirmValid && "opacity-50")}
            >
              {isDeleting ? "Deleting..." : `Delete ${itemType}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
