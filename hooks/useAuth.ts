// hooks/useAuth.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/services/client';

export function useAuth() {
  // Cookie-based SSR browser client, so the client sees the same session the
  // server does (set by login, refreshed by middleware).
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, [supabase]);

  return { user, loading };
}
