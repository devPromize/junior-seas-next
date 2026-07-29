// app/auth/forgot-password/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/services/client';
import Container from '@/ui/Container';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${window.location.origin}/auth/reset-password` }
    );

    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <Container>
      <div className="flex items-center justify-center py-16 px-4">
        <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold mb-1">Reset your password</h1>
          <p className="text-sm text-gray-500 mb-6">
            Enter your email and we&apos;ll send you a reset link.
          </p>

          {sent ? (
            <p className="rounded bg-green-50 border border-green-200 text-green-700 px-3 py-3 text-sm">
              If an account exists for <strong>{email}</strong>, a reset link is
              on its way. Check your inbox (and spam folder).
            </p>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <p className="mb-4 rounded bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
                  {error}
                </p>
              )}

              <label
                htmlFor="reset-email"
                className="block text-sm font-medium mb-1"
              >
                Email
              </label>
              <input
                id="reset-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 mb-6 bg-gray-50 focus:outline-none focus:border-black"
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-(--color-navyBlue) text-white py-3 rounded-lg font-semibold disabled:opacity-60"
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}

          <p className="text-sm text-center text-gray-500 mt-5">
            <Link href="/auth/login" className="text-(--color-navyBlue) underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </Container>
  );
}
