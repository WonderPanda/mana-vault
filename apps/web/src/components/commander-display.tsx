import { Crown } from "lucide-react";

import { Button } from "./ui/button";

interface Commander {
  name: string;
  imageUri: string | null;
}

interface CommanderDisplayProps {
  commander: Commander | null;
  onSet?: () => void;
  onChange?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
}

/**
 * Displays a commander card in a bordered section with Crown icon.
 * Renders read-only when no action callbacks are provided.
 * Renders with Set/Change/Remove buttons when callbacks are provided.
 */
export function CommanderDisplay({
  commander,
  onSet,
  onChange,
  onRemove,
  disabled,
}: CommanderDisplayProps) {
  const isEditable = !!(onSet || onChange || onRemove);

  // Read-only mode: only render when a commander exists
  if (!isEditable && !commander) return null;

  return (
    <div className="mb-6 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crown className="h-5 w-5 shrink-0 text-muted-foreground" />
          {commander ? (
            <div className="flex items-center gap-3">
              {commander.imageUri && (
                <img
                  src={commander.imageUri}
                  alt={commander.name}
                  className="h-14 w-10 rounded object-cover"
                />
              )}
              <div>
                <div className="text-base font-medium">{commander.name}</div>
                <p className="text-sm text-muted-foreground">Commander</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-base font-medium">Commander</div>
              <p className="text-sm text-muted-foreground">Associate a commander with this list</p>
            </div>
          )}
        </div>
        {isEditable && (
          <div className="flex items-center gap-2">
            {commander && onRemove && (
              <Button variant="ghost" size="sm" disabled={disabled} onClick={onRemove}>
                Remove
              </Button>
            )}
            {(commander ? onChange : onSet) && (
              <Button variant="outline" size="sm" onClick={commander ? onChange : onSet}>
                {commander ? "Change" : "Set Commander"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
