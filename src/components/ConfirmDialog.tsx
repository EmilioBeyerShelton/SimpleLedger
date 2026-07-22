// A small reusable stand-in for the browser's native `confirm()` — styled
// consistently with the rest of the app (and gets the same mobile
// top-anchored/drag-to-dismiss treatment as every other Dialog, unlike
// `confirm()` which always renders as the browser/OS's own unstyled
// prompt). Built on the existing Dialog primitives rather than adding a
// dedicated Radix AlertDialog dependency — a plain Dialog is enough for a
// two-button prompt like this.
import type { ButtonProps } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Button variant for the confirm action — 'destructive' for delete-type
   * confirmations (the common case), overridable for anything milder. */
  confirmVariant?: ButtonProps['variant'];
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'destructive',
  onConfirm
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
