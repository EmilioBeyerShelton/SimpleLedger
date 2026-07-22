import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

// Mobile breakpoint check, matching Tailwind's default `md` (768px) — used
// to gate the drag-to-dismiss gesture below to the mobile, top-anchored
// presentation only. The desktop dialog stays centered, where "pull down"
// isn't a meaningful dismiss direction.
function isDesktopViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
}

const DRAG_DISMISS_THRESHOLD_PX = 200;

// Pointerdown starting on one of these shouldn't arm the drag gesture —
// otherwise pulling down would hijack taps on buttons/inputs, or dragging
// text in a field, instead of letting them work normally.
function isInteractiveTarget(target: EventTarget | null): boolean {
  return !!(target as HTMLElement | null)?.closest?.('button, a, input, textarea, select, [role="button"], [contenteditable="true"]');
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const closeRef = React.useRef<React.ElementRef<typeof DialogPrimitive.Close>>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const dragStartY = React.useRef(0);
  const [dragging, setDragging] = React.useState(false);
  const [dragY, setDragY] = React.useState(0);

  function setRefs(node: HTMLDivElement | null) {
    contentRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (isDesktopViewport()) return;
    if (isInteractiveTarget(e.target)) return;
    // Only arm the drag when the dialog's own scrollable content is
    // already at the top — otherwise the first bit of a downward drag on
    // a long, scrolled dialog should just scroll it back up, not start
    // dragging the whole dialog toward dismissal.
    if ((contentRef.current?.scrollTop ?? 0) > 0) return;
    dragStartY.current = e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    // Only downward movement counts — dragging up shouldn't do anything,
    // since the dialog is already anchored to the top of the screen.
    setDragY(Math.max(0, e.clientY - dragStartY.current));
  }

  function handlePointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (dragY > DRAG_DISMISS_THRESHOLD_PX) {
      // Goes through the same Close button every "X" click already uses,
      // rather than reaching into Radix's internal open-state context
      // directly — this stays a supported, public interaction (a real
      // click) instead of relying on internals that could change.
      closeRef.current?.click();
    }
    // Dropping `dragging` removes the inline `transform`/`transition:none`
    // override below on the next render, so the element's transform falls
    // back to its CSS class value (translateY 0 on mobile) — the class's
    // own `transition-transform` then animates that change, giving a
    // "spring back" snap with no extra state bookkeeping needed.
    setDragY(0);
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={setRefs}
        style={dragging ? { transform: `translate(-50%, ${dragY}px)`, transition: 'none' } : undefined}
        className={cn(
          'fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 gap-4 rounded-lg border bg-background p-5 shadow-lg transition-transform duration-200 ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-[85vh] overflow-y-auto overscroll-y-contain md:top-1/2 md:-translate-y-1/2 md:transition-none',
          className
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          ref={closeRef}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1.5 text-left pr-6', className)} {...props} />
);

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-between', className)} {...props} />
);

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-none', className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle };
