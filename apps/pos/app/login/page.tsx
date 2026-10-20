'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">Junior Seas</p>
        <h1 className="text-3xl font-bold">Point of sale</h1>
      </div>
      <form onSubmit={signIn} className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-5">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-line px-3 py-3 text-base"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Password
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-line px-3 py-3 text-base"
          />
        </label>
        {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="text-center text-sm text-ink-soft">Staff accounts are created by the owner.</p>
    </main>
  );
}
