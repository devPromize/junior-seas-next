'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function saveDepartment(id: number | null, name: string, isActive = true): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('pos_save_department', { p_id: id, p_name: name, p_is_active: isActive });
  if (error) return { error: error.message };
  revalidatePath('/', 'layout');   // departments show up across the app
  return {};
}
