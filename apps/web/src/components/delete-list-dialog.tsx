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

interface DeleteListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listName: string;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function DeleteListDialog({
  open,
  onOpenChange,
  listName,
  onConfirm,
  isDeleting = false,
}: DeleteListDialogProps) {
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Delete List</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>"{listName}"</strong>? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">Warning</p>
              <p className="mt-1">
                This will permanently delete the list and all card references in it. Your collection
                cards will not be affected.
              </p>
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
              {isDeleting ? "Deleting..." : "Delete List"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
