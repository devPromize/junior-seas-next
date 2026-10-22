import { createClient } from '@/lib/supabase/server';

export type StaffMember = {
  user_id: string;
  name: string;
  phone: string | null;
  email: string;
  role_id: number;
  role: string;
  is_owner: boolean;
  is_active: boolean;
  discount_limit_kobo: number | null;
  department_ids: number[];
  last_sign_in_at: string | null;
};

export type Role = {
  id: number;
  name: string;
  description: string | null;
  is_owner: boolean;
  permissions: string[];
  warnings: string[];
};

export type FormOptions = { roles: Role[]; departments: { id: number; name: string }[] };

export async function loadStaff() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pos_staff_list');
  return { staff: (data ?? []) as StaffMember[], error: error?.message ?? null };
}

export async function loadFormOptions() {
  const supabase = await createClient();
  const { data } = await supabase.rpc('pos_staff_form_options');
  return data as FormOptions;
}
