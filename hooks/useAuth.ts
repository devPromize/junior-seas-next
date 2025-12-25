// 'use client';
// import { useState, useEffect } from 'react';
// import { supabase } from '@/lib/supabaseClient';

// export function useAuth() {
//   const [user, setUser] = useState<any>(null);
//   useEffect(() => {
//     const init = async () => {
//       const { data } = await supabase.auth.getUser();
//       setUser(data?.user ?? null);
//     };
//     init();
//     const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
//       setUser(session?.user ?? null);
//     });
//     return () => sub?.subscription.unsubscribe();
//   }, []);
//   return { user };
// }





// hooks/useAuth.tsx (client)
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useAuth() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setUser(data?.user ?? null);
    };
    init();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      // listener is like { subscription }
      try {
        listener?.subscription?.unsubscribe();
      } catch (err) {
        // fallback (older versions)
        (listener as any)?.unsubscribe?.();
      }
    };
  }, []);

  return { user };
}
