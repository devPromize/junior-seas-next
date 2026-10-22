'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type StaffInput = {
  user_id?: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  role_id: number;
  department_ids: number[];
  discount_limit_naira: string;
  is_active: boolean;
};

export type SaveResult = { error?: string; existingLogin?: boolean };

const toKobo = (naira: string) => (naira.trim() === '' ? null : Math.round(Number(naira) * 100));

// New staff go through the pos-add-staff edge function, which creates their login.
export async function addStaff(input: StaffInput): Promise<SaveResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke('pos-add-staff', {
    body: {
      email: input.email,
      password: input.password,
      name: input.name,
      phone: input.phone || null,
      role_id: input.role_id,
      department_ids: input.department_ids,
      discount_limit_kobo: toKobo(input.discount_limit_naira),
    },
  });
  if (error) {
    const body = await (error as { context?: Response }).context?.json().catch(() => null);
    return { error: body?.error ?? 'Couldn’t add them. Try again.' };
  }
  revalidatePath('/staff');
  return { existingLogin: !!data?.existing_login };
}

export async function updateStaff(input: StaffInput): Promise<SaveResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('pos_save_staff', {
    p_user_id: input.user_id,
    p_name: input.name,
    p_role_id: input.role_id,
    p_department_ids: input.department_ids,
    p_phone: input.phone || null,
    p_discount_limit_kobo: toKobo(input.discount_limit_naira),
    p_is_active: input.is_active,
  });
  if (error) return { error: error.message };
  revalidatePath('/staff');
  return {};
}
