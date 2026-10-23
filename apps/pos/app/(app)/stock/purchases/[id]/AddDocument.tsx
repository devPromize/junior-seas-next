'use client';

import { useRouter } from 'next/navigation';
import DocumentUploader from '@/components/DocumentUploader';

// Attach a receipt to a purchase that's already saved (including old ones).
export default function AddDocument({ deliveryId }: { deliveryId: string }) {
  const router = useRouter();
  return <DocumentUploader deliveryId={deliveryId} label="Attach a photo or PDF" onUploaded={() => router.refresh()} />;
}
