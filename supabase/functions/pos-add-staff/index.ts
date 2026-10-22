// Adds a staff member to the POS: creates their login, then saves them as staff.
//
// Creating a login needs the server key, which the POS app never holds, so this one step runs
// here. The caller's own session is used for everything else, so the database's permission
// checks (staff.manage, owner-only rules) still apply exactly as they do in the app.
import { createClient } from 'npm:@supabase/supabase-js@2.50.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Body = {
  email?: string;
  password?: string;
  name?: string;
  phone?: string | null;
  role_id?: number;
  department_ids?: number[];
  discount_limit_kobo?: number | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  let b: Body;
  try {
    b = await req.json();
  } catch {
    return reply(400, { error: 'Something went wrong. Try again.' });
  }
  const email = (b.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: 'That email address doesn’t look right.' });

  // Also checks the caller is staff with "Manage staff".
  const found = await caller.rpc('pos_find_login', { p_email: email });
  if (found.error) return reply(403, { error: found.error.message });
  if (found.data?.is_staff) return reply(409, { error: 'This person is already on your staff list.' });

  let userId: string | undefined = found.data?.user_id;
  const existingLogin = !!userId;
  if (!userId) {
    if ((b.password ?? '').length < 8) return reply(400, { error: 'The password needs at least 8 characters.' });
    const created = await admin.auth.admin.createUser({
      email,
      password: b.password,
      email_confirm: true,
      user_metadata: { full_name: (b.name ?? '').trim() },
    });
    if (created.error || !created.data.user) {
      return reply(400, { error: created.error?.message ?? 'Couldn’t create the login. Try again.' });
    }
    userId = created.data.user.id;
  }

  const saved = await caller.rpc('pos_save_staff', {
    p_user_id: userId,
    p_name: b.name ?? '',
    p_role_id: b.role_id,
    p_department_ids: b.department_ids ?? [],
    p_phone: b.phone ?? null,
    p_discount_limit_kobo: b.discount_limit_kobo ?? null,
    p_is_active: true,
  });
  if (saved.error) {
    // Don't leave a login behind for someone who wasn't added.
    if (!existingLogin) await admin.auth.admin.deleteUser(userId);
    return reply(400, { error: saved.error.message });
  }

  return reply(200, { user_id: userId, existing_login: existingLogin });
});
