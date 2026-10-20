'use client';

import { useEffect, useRef, useState } from 'react';

// Backup scanner for when a rep is on a phone instead of a laptop with a scanner.
// Uses the browser's built-in barcode reader (Chrome on Android supports it).

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => Detector;
  }
}

export default function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.BarcodeDetector) {
      setError('This browser can’t scan with the camera. Use Chrome on Android, or type the code.');
      return;
    }
    const detector = new window.BarcodeDetector({
      formats: ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_39', 'qr_code'],
    });
    let stream: MediaStream | null = null;
    let stopped = false;
    let lastCode = '';

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            const code = found[0]?.rawValue?.trim();
            if (code && code !== lastCode) {
              lastCode = code;
              onCode(code);
            }
          } catch {
            // A frame that can't be read; try the next one.
          }
          setTimeout(tick, 250);
        };
        tick();
      } catch {
        setError('Camera access was refused. Allow the camera for this site, or type the code.');
      }
    })();

    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4 text-white">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Point the camera at the barcode or IMEI label</p>
        <button onClick={onClose} className="rounded-lg bg-white px-4 py-2 font-semibold text-ink">Done</button>
      </div>
      {error ? (
        <p className="mt-6 rounded-lg bg-bad-soft p-3 text-bad">{error}</p>
      ) : (
        <video ref={videoRef} className="mt-4 w-full flex-1 rounded-lg object-cover" playsInline muted />
      )}
    </div>
  );
}
