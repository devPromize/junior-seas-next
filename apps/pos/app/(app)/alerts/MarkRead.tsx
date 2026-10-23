'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// Opening the Alerts page counts as reading them. New ones stay highlighted on this visit; the
// sidebar count clears straight away.
export default function MarkRead() {
  const router = useRouter();
  useEffect(() => {
    createClient().rpc('pos_mark_alerts_read').then(() => router.refresh());
    // Once per visit.
  }, []);
  return null;
}
