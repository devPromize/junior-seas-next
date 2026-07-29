// app/auth/reset-password/page.tsx
//
// Reached after the email link is verified (via /auth/confirm), so the user is
// in a short-lived recovery session and can set a new password.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/services/client';
import Container from '@/ui/Container';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
    setTimeout(() => {
      router.push('/account');
      router.refresh();
    }, 1500);
  }

  return (
    <Container>
      <div className="flex items-center justify-center py-16 px-4">
        <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold mb-1">Set a new password</h1>
          <p className="text-sm text-gray-500 mb-6">
            Choose a password you&apos;ll remember this time.
          </p>

          {done ? (
            <p className="rounded bg-green-50 border border-green-200 text-green-700 px-3 py-3 text-sm">
              Password updated. Redirecting you to your account…
            </p>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <p className="mb-4 rounded bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
                  {error}
                </p>
              )}

              <label
                htmlFor="new-password"
                className="block text-sm font-medium mb-1"
              >
                New password
              </label>
              <input
                id="new-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 mb-4 bg-gray-50 focus:outline-none focus:border-black"
              />

              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium mb-1"
              >
                Confirm new password
              </label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 mb-6 bg-gray-50 focus:outline-none focus:border-black"
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-(--color-navyBlue) text-white py-3 rounded-lg font-semibold disabled:opacity-60"
              >
                {loading ? 'Saving…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </Container>
  );
}
