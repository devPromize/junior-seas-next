'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type UploadedDoc = { id: string; name: string; preview: string | null };

const MAX_SIDE = 2000;   // pixels: plenty to read a receipt, a fraction of a phone photo's size

// Photos are shrunk on the device before upload, so a 4 MB camera photo becomes ~300 KB
// and uploads quickly on mobile data. PDFs go up as they are.
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.82));
  } catch {
    return file;   // a format the browser can't draw (e.g. some HEIC): upload the original
  }
}

// Take a photo of the supplier's receipt (one per page) or choose a PDF. Each file is uploaded
// straight away and recorded; deliveryId links it to an existing purchase.
export default function DocumentUploader({
  onUploaded, deliveryId, label = 'Add receipt photo or PDF',
}: { onUploaded: (doc: UploadedDoc) => void; deliveryId?: string; label?: string }) {
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const supabase = createClient();
    for (const file of Array.from(files)) {
      setBusy((n) => n + 1);
      try {
        const body = await shrink(file);
        const isPdf = file.type === 'application/pdf';
        const type = isPdf ? 'application/pdf' : body.type || file.type;
        const ext = isPdf ? 'pdf' : type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() ?? 'jpg').toLowerCase();
        const month = new Date().toISOString().slice(0, 7);
        const path = `${month}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from('purchase-documents').upload(path, body, { contentType: type });
        if (up.error) throw up.error;
        const { data, error } = await supabase.rpc('pos_add_purchase_document', {
          p_path: path, p_content_type: type, p_size_bytes: body.size, p_delivery_id: deliveryId ?? null,
        });
        if (error) throw error;
        onUploaded({ id: data.id, name: file.name, preview: isPdf ? null : URL.createObjectURL(body) });
      } catch (e) {
        setError((e as { message?: string }).message ?? 'Upload failed. Try again.');
      } finally {
        setBusy((n) => n - 1);
      }
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel px-4 py-2.5 font-semibold hover:bg-paper">
        {busy ? `Uploading ${busy}…` : label}
        <input type="file" accept="image/*,application/pdf" multiple className="hidden"
          onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      </label>
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}
