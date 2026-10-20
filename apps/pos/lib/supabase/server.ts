import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Supabase client for server components and server actions, acting as the signed-in staff
// member (their session comes from cookies), so every database check sees who they are.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a server component, where cookies are read-only. The middleware
            // refreshes the session instead, so this is safe to ignore.
          }
        },
      },
    }
  );
}
