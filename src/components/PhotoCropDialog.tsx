// Crop step shown between capturing/picking a photo and it being
// compressed + attached to the expense (see PhotoPicker.tsx). Not a
// perspective-correcting document scan (Apple's Notes-style scanner) —
// just a draggable rectangular crop, which covers the common case
// (trimming a receipt photo down to the receipt itself) without pulling
// in a much heavier computer-vision dependency for edge/corner detection.
import { useRef, useState } from 'react';
import ReactCrop, { type Crop, type PixelCrop, cropToCanvas } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface PhotoCropDialogProps {
  /** The freshly captured/picked photo, uncropped and uncompressed, or
   * null when there's nothing pending — controls whether the dialog is
   * open. */
  imageSrc: string | null;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

export function PhotoCropDialog({ imageSrc, onCancel, onConfirm }: PhotoCropDialogProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [pixelCrop, setPixelCrop] = useState<PixelCrop>();
  const [busy, setBusy] = useState(false);

  // Default to a generous crop covering most of the frame — receipts
  // usually already fill it, so starting near-full-size and letting the
  // user drag handles inward beats making them draw a box from scratch.
  function onImageLoad() {
    setCrop({ unit: '%', x: 5, y: 5, width: 90, height: 90 });
  }

  async function handleConfirm() {
    if (!imgRef.current || !pixelCrop || pixelCrop.width < 1 || pixelCrop.height < 1) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      await cropToCanvas(imgRef.current, canvas, pixelCrop);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) throw new Error('Could not read the cropped image.');
      onConfirm(blob);
    } catch (err) {
      console.error('Crop failed', err);
      onCancel();
    } finally {
      setBusy(false);
      setCrop(undefined);
      setPixelCrop(undefined);
    }
  }

  function handleCancel() {
    setCrop(undefined);
    setPixelCrop(undefined);
    onCancel();
  }

  return (
    <Dialog open={!!imageSrc} onOpenChange={open => !open && handleCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Crop photo</DialogTitle></DialogHeader>
        {imageSrc && (
          <div className="flex max-h-[60vh] items-center justify-center overflow-auto rounded-md bg-muted">
            <ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)} onComplete={c => setPixelCrop(c)}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <img ref={imgRef} src={imageSrc} onLoad={onImageLoad} alt="Photo to crop" className="max-h-[60vh]" />
            </ReactCrop>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={handleCancel} disabled={busy}>Cancel</Button>
          <Button type="button" onClick={handleConfirm} disabled={busy}>Use photo</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
