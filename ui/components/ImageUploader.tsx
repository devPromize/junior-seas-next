'use client';

import { useRef, useState } from 'react';

const IMAGEKIT_UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Uploads a single image directly to ImageKit and calls onUploaded with the
 * resulting CDN url. Upload credentials come from the admin-only
 * /api/admin/imagekit-auth route, so the private key never reaches the browser.
 */
export default function ImageUploader({
  onUploaded,
  label = 'Upload image',
  compact = false,
}: {
  onUploaded: (url: string) => void;
  label?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file again re-triggers change.
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;

    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Image must be under 5MB.');
      return;
    }

    setUploading(true);
    try {
      // 1) Get short-lived signed credentials from our admin endpoint.
      const authRes = await fetch('/api/admin/imagekit-auth');
      if (!authRes.ok) throw new Error('Could not authorize upload.');
      const { token, expire, signature } = await authRes.json();

      // 2) Upload straight to ImageKit.
      const form = new FormData();
      form.append('file', file);
      form.append('fileName', file.name);
      form.append(
        'publicKey',
        process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY as string
      );
      form.append('token', token);
      form.append('expire', String(expire));
      form.append('signature', signature);
      form.append('useUniqueFileName', 'true');
      form.append('folder', '/products');

      const upRes = await fetch(IMAGEKIT_UPLOAD_URL, {
        method: 'POST',
        body: form,
      });
      const data = await upRes.json();
      if (!upRes.ok || !data.url) {
        throw new Error(data?.message || 'Upload failed.');
      }

      onUploaded(data.url as string);
    } catch (err: any) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={
          compact
            ? 'text-xs border rounded px-2 py-1 hover:bg-gray-50 disabled:opacity-60 whitespace-nowrap'
            : 'text-sm border rounded px-3 py-1.5 hover:bg-gray-50 disabled:opacity-60'
        }
      >
        {uploading ? 'Uploading…' : `⬆ ${label}`}
      </button>
      {error && <span className="text-xs text-red-600 mt-1">{error}</span>}
    </span>
  );
}
