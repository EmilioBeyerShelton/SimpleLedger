// A lightweight pinch/drag/wheel/double-tap zoomable image viewer, built
// directly on Pointer Events (same approach as ui/dialog.tsx's
// drag-to-dismiss gesture) rather than pulling in a dedicated
// pan-and-zoom dependency for what's fundamentally "look closely at one
// receipt photo." Not a general-purpose gallery widget — no swipe between
// images, no inertia — just zoom and pan for a single image.
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const MAX_SCALE = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_WINDOW_MS = 300;

interface Point {
  x: number;
  y: number;
}

interface ZoomableImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function ZoomableImage({ src, alt, className }: ZoomableImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [interacting, setInteracting] = useState(false);

  // Pointer/gesture bookkeeping lives in refs, not state — it changes on
  // every pointermove and doesn't need to trigger its own re-render (scale
  ///offset already do that).
  const pointers = useRef(new Map<number, Point>());
  const panStart = useRef<{ pointer: Point; offset: Point } | null>(null);
  const pinchStart = useRef<{ dist: number; scale: number; offset: Point } | null>(null);
  const lastTap = useRef(0);

  // Keeps the image from being dragged/zoomed entirely out of view: caps
  // how far off-center the (scaled) image is allowed to sit.
  function clamp(nextScale: number, nextOffset: Point): Point {
    const el = containerRef.current;
    if (!el) return nextOffset;
    const rect = el.getBoundingClientRect();
    const maxX = Math.max(0, (rect.width * (nextScale - 1)) / 2);
    const maxY = Math.max(0, (rect.height * (nextScale - 1)) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, nextOffset.x)),
      y: Math.min(maxY, Math.max(-maxY, nextOffset.y))
    };
  }

  function reset() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  // Zooms to `nextScaleRaw`, keeping the point under (clientX, clientY)
  // visually stationary — the usual "zoom toward the cursor/finger" feel.
  function zoomAt(clientX: number, clientY: number, nextScaleRaw: number) {
    const el = containerRef.current;
    if (!el) return;
    const nextScale = Math.min(MAX_SCALE, Math.max(1, nextScaleRaw));
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left - rect.width / 2;
    const py = clientY - rect.top - rect.height / 2;
    const ratio = nextScale / scale;
    setOffset(prev => clamp(nextScale, { x: px - (px - prev.x) * ratio, y: py - (py - prev.y) * ratio }));
    setScale(nextScale);
  }

  function toggleZoom(clientX: number, clientY: number) {
    if (scale > 1) reset();
    else zoomAt(clientX, clientY, DOUBLE_TAP_ZOOM);
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, scale - e.deltaY * 0.01);
  }

  function handleDoubleClick(e: React.MouseEvent) {
    toggleZoom(e.clientX, e.clientY);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Own this gesture entirely — without this, the pointerdown would
    // also bubble up to DialogContent's drag-to-dismiss handler (see
    // ui/dialog.tsx), which doesn't know this is a plain `<div>` it
    // should leave alone, and the two gestures would fight over the same
    // pointer.
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setInteracting(true);

    if (pointers.current.size === 1) {
      const now = Date.now();
      if (now - lastTap.current < DOUBLE_TAP_WINDOW_MS) {
        toggleZoom(e.clientX, e.clientY);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
      panStart.current = scale > 1 ? { pointer: { x: e.clientX, y: e.clientY }, offset } : null;
      pinchStart.current = null;
    } else if (pointers.current.size === 2) {
      panStart.current = null;
      const [a, b] = Array.from(pointers.current.values());
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale, offset };
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const nextScale = Math.min(MAX_SCALE, Math.max(1, pinchStart.current.scale * (dist / pinchStart.current.dist)));
      setScale(nextScale);
      setOffset(clamp(nextScale, pinchStart.current.offset));
    } else if (pointers.current.size === 1 && panStart.current) {
      const dx = e.clientX - panStart.current.pointer.x;
      const dy = e.clientY - panStart.current.pointer.y;
      setOffset(clamp(scale, { x: panStart.current.offset.x + dx, y: panStart.current.offset.y + dy }));
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      panStart.current = null;
      setInteracting(false);
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative touch-none select-none overflow-hidden', className)}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="h-full w-full object-contain"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: interacting ? 'none' : 'transform 150ms ease-out',
          cursor: scale > 1 ? 'grab' : 'zoom-in'
        }}
      />
    </div>
  );
}
