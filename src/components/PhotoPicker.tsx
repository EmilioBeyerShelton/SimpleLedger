// Camera / photo-library picker for the expense form's optional receipt
// photo, plus a crop step and a tap-to-preview thumbnail.
//
// A single button, not "Take photo" + "Choose photo": `source:
// CameraSource.Prompt` on native iOS shows the OS's own action sheet
// ("Take Photo" / "Choose from Library") — no need to build that choice
// into this UI at all. On web, Prompt normally needs `@ionic/pwa-elements`
// registered to render its action sheet (`getPhoto()` otherwise just hangs
// waiting on an event a plain, undefined custom element never fires,
// per @capacitor/camera's web source) — rather than pull in that extra
// package, `webUseInput: true` is passed alongside it, which forces
// @capacitor/camera's web fallback to skip straight to a bare
// `<input type="file" accept="image/*">` with no `capture` attribute.
// That's exactly what a plain, uncaptured file input does on a mobile
// browser: the OS shows its own "Photo Library / Take Photo / Choose
// File" sheet. Desktop browsers/Electron just get a normal file picker —
// same graceful degradation used elsewhere in this app (see
// ARCHITECTURE.md, "Expense photos").
import { useRef, useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { compressImage } from '@/lib/utils/image';
import { PhotoCropDialog } from '@/components/PhotoCropDialog';
import { ZoomableImage } from '@/components/ZoomableImage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Camera as CameraIcon, X } from 'lucide-react';
import { toast } from 'sonner';

interface PhotoPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export function PhotoPicker({ value, onChange }: PhotoPickerProps) {
  const [busy, setBusy] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  // Guards against a slow compress finishing after a newer/cleared photo —
  // only the most recent capture is allowed to win.
  const requestId = useRef(0);

  async function capture() {
    setBusy(true);
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
        webUseInput: true
      });
      if (!photo.base64String) throw new Error('No image data returned.');
      // Handed to the crop dialog as-is (uncompressed) — compression
      // happens after cropping, on the smaller cropped region, in
      // handleCropConfirm below.
      setPendingImage(`data:image/${photo.format || 'jpeg'};base64,${photo.base64String}`);
    } catch (err: any) {
      // The plugin rejects with a generic-ish message when the user just
      // cancels the picker/camera — that's not an error worth surfacing.
      const msg = String(err?.message || err || '');
      if (!/cancel/i.test(msg)) {
        console.error('Photo capture failed', err);
        toast('Could not add photo: ' + (msg || 'unknown error'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCropConfirm(blob: Blob) {
    const id = ++requestId.current;
    setPendingImage(null);
    setBusy(true);
    try {
      const compressed = await compressImage(blob);
      if (requestId.current === id) onChange(compressed);
    } catch (err: any) {
      console.error('Photo processing failed', err);
      toast('Could not add photo: ' + (err?.message || 'unknown error'));
    } finally {
      if (requestId.current === id) setBusy(false);
    }
  }

  return (
    <>
      {value ? (
        <div className="relative inline-block">
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="block h-16 w-16 overflow-hidden rounded-md border"
          >
            <img src={value} alt="Expense receipt" className="h-full w-full object-cover" />
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remove photo"
            className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border bg-background shadow"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={capture}>
          <CameraIcon className="mr-1 h-3.5 w-3.5" />
          Add photo
        </Button>
      )}

      <PhotoCropDialog imageSrc={pendingImage} onCancel={() => setPendingImage(null)} onConfirm={handleCropConfirm} />

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Receipt photo</DialogTitle></DialogHeader>
          {value && <ZoomableImage src={value} alt="Expense receipt" className="h-[70vh] w-full rounded-md bg-muted" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
