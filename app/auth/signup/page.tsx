// app/auth/signup/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/services/client';
import Container from '@/ui/Container';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone },
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/account`,
      },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      // Email confirmation is off → already signed in.
      router.push('/account');
      router.refresh();
    } else {
      // Confirmation on → user must click the email link.
      setCheckEmail(true);
    }
  }

  return (
    <Container>
      <div className="flex items-center justify-center py-16 px-4">
        <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold mb-1">Create your account</h1>
          <p className="text-sm text-gray-500 mb-6">
            Save your cart and track past orders. Prefer not to? You can always{' '}
            <Link href="/shop" className="underline">
              shop as a guest
            </Link>
            .
          </p>

          {checkEmail ? (
            <p className="rounded bg-green-50 border border-green-200 text-green-700 px-3 py-3 text-sm">
              Almost there — we sent a confirmation link to{' '}
              <strong>{email}</strong>. Click it to activate your account.
            </p>
          ) : (
            <form onSubmit={handleSignup}>
              {error && (
                <p className="mb-4 rounded bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
                  {error}
                </p>
              )}

              <label
                htmlFor="signup-name"
                className="block text-sm font-medium mb-1"
              >
                Full name
              </label>
              <input
                id="signup-name"
                name="full_name"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 mb-4 bg-gray-50 focus:outline-none focus:border-black"
              />

              <label
                htmlFor="signup-email"
                className="block text-sm font-medium mb-1"
              >
                Email
              </label>
              <input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 mb-4 bg-gray-50 focus:outline-none focus:border-black"
              />

              <label
                htmlFor="signup-phone"
                className="block text-sm font-medium mb-1"
              >
                Phone{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="signup-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 mb-4 bg-gray-50 focus:outline-none focus:border-black"
              />

              <label
                htmlFor="signup-password"
                className="block text-sm font-medium mb-1"
              >
                Password
              </label>
              <input
                id="signup-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 mb-6 bg-gray-50 focus:outline-none focus:border-black"
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-(--color-navyBlue) text-white py-3 rounded-lg font-semibold disabled:opacity-60"
              >
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          )}

          <p className="text-sm text-center text-gray-500 mt-5">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-(--color-navyBlue) underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </Container>
  );
}
