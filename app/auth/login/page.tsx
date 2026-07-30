// app/auth/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/services/client';
import Container from '@/ui/Container';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setLoading(false);
      setError(signInError.message);
      return;
    }

    // Everyone lands on the account hub, so the post-login view matches what the
    // account icon shows. Admins see an "Admin" card there into the dashboard.
    router.push('/account');
    router.refresh(); // sync server components with the new session
  }

  return (
    <Container>
      <div className="flex items-center justify-center py-16 px-4">
        <form
          onSubmit={handleLogin}
          className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-md"
        >
          <h1 className="text-2xl font-bold mb-1">Sign in</h1>
          <p className="text-sm text-gray-500 mb-6">
            Welcome back to Junior Seas Technologies.
          </p>

          {error && (
            <p className="mb-4 rounded bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
              {error}
            </p>
          )}

          <label htmlFor="login-email" className="block text-sm font-medium mb-1">
            Email
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 mb-4 bg-gray-50 focus:outline-none focus:border-black"
          />

          <label
            htmlFor="login-password"
            className="block text-sm font-medium mb-1"
          >
            Password
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 mb-2 bg-gray-50 focus:outline-none focus:border-black"
          />

          <div className="text-right mb-5">
            <Link
              href="/auth/forgot-password"
              className="text-xs text-(--color-navyBlue) underline"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-(--color-navyBlue) text-white py-3 rounded-lg font-semibold disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-sm text-center text-gray-500 mt-5">
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" className="text-(--color-navyBlue) underline">
              Create one
            </Link>
          </p>
          <p className="text-xs text-center text-gray-400 mt-3">
            Prefer not to sign in? You can still{' '}
            <Link href="/shop" className="underline">
              shop as a guest
            </Link>
            .
          </p>
        </form>
      </div>
    </Container>
  );
}
