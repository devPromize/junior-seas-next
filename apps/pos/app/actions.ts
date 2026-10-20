'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FLOOR_COOKIE } from '@/lib/pos';

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

// Remembers which floor this device is working on. Staff aren't tied to a floor; the device is.
export async function chooseFloor(formData: FormData) {
  const floorId = Number(formData.get('floor_id'));
  if (!Number.isInteger(floorId) || floorId <= 0) return;
  (await cookies()).set(FLOOR_COOKIE, String(floorId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });
  redirect('/');
}
