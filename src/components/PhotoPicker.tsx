// Camera / photo-library picker for the expense form's optional receipt
// photo. Built on @capacitor/camera rather than a raw <input type="file">
// so "Take Photo" vs "Choose Photo" can request the camera vs. the library
// specifically — and one implementation covers every platform for free:
// @capacitor/camera's web implementation (used automatically whenever
// Capacitor.isNativePlatform() is false, i.e. on both the web build and
// inside Electron's Chromium renderer) is itself just a <input type="file">
// with the `capture` attribute set appropriately, so there's no
// web/electron/ios branch to maintain here. On desktop browsers/Electron,
// where there's no real camera-capture UI, "Take Photo" degrades
// gracefully to the same file picker as "Choose Photo" — consistent with
// how linking/backups degrade on unsupported platforms elsewhere in this
// app.
import { useRef, useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { compressImage } from '@/lib/utils/image';
import { Button } from '@/components/ui/button';
import { Camera as CameraIcon, Image as ImageIcon, X } from 'lucide-react';
import { toast } from 'sonner';

interface PhotoPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

async function base64ToBlob(base64: string, mimeType: string): Promise<Blob> {
  const res = await fetch(`data:${mimeType};base64,${base64}`);
  return res.blob();
}

export function PhotoPicker({ value, onChange }: PhotoPickerProps) {
  const [busy, setBusy] = useState(false);
  // Guards against a slow compress finishing after a newer/cleared photo —
  // only the most recent capture is allowed to win.
  const requestId = useRef(0);

  async function capture(source: CameraSource) {
    const id = ++requestId.current;
    setBusy(true);
    try {
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source
      });
      if (!photo.base64String) throw new Error('No image data returned.');
      const blob = await base64ToBlob(photo.base64String, `image/${photo.format || 'jpeg'}`);
      const compressed = await compressImage(blob);
      if (requestId.current === id) onChange(compressed);
    } catch (err: any) {
      // The plugin rejects with a generic-ish message when the user just
      // cancels the picker/camera — that's not an error worth surfacing.
      const msg = String(err?.message || err || '');
      if (!/cancel/i.test(msg)) {
        console.error('Photo capture failed', err);
        toast('Could not add photo: ' + (msg || 'unknown error'));
      }
    } finally {
      if (requestId.current === id) setBusy(false);
    }
  }

  if (value) {
    return (
      <div className="flex items-center gap-3">
        <img src={value} alt="Expense receipt" className="h-16 w-16 shrink-0 rounded-md border object-cover" />
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
          <X className="mr-1 h-3.5 w-3.5" />
          Remove photo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => capture(CameraSource.Camera)}>
        <CameraIcon className="mr-1 h-3.5 w-3.5" />
        Take photo
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => capture(CameraSource.Photos)}>
        <ImageIcon className="mr-1 h-3.5 w-3.5" />
        Choose photo
      </Button>
    </div>
  );
}
