'use client';

import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Container from '@/ui/Container';

export default function AccountPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/auth/login');
  }

  if (loading) {
    return (
      <Container>
        <p className="py-10 text-center">Loading…</p>
      </Container>
    );
  }

  if (!user) {
    return (
      <Container>
        <div className="max-w-md mx-auto mt-24 text-center p-6">
          <h2 className="text-xl font-semibold mb-4">
            Please sign in to access your account
          </h2>

          <div className="space-y-3">
            <Link
              href="/auth/login"
              className="block bg-(--color-navyBlue) text-white py-3 rounded"
            >
              Login
            </Link>

            <Link
              href="/auth/signup"
              className="block border py-3 rounded"
            >
              Create an account
            </Link>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <section className="py-10 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl md:text-2xl font-bold">
              My Account
            </h2>
            <p className="text-gray-600">
              Signed in as <strong>{user.email}</strong>
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="text-sm text-red-600 border border-red-200 px-4 py-2 rounded hover:bg-red-50"
          >
            Logout
          </button>
        </div>

       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <Link
    href="/account/orders"
    className="border rounded p-5 hover:shadow"
  >
    <h3 className="font-semibold mb-1">Orders</h3>
    <p className="text-sm text-gray-600">
      View order history and status
    </p>
  </Link>

  <Link
    href="/account/wishlist"
    className="border rounded p-5 hover:shadow"
  >
    <h3 className="font-semibold mb-1">Wishlist</h3>
    <p className="text-sm text-gray-600">
      Saved products
    </p>
  </Link>

  <Link
    href="/account/addresses"
    className="border rounded p-5 hover:shadow"
  >
    <h3 className="font-semibold mb-1">Addresses</h3>
    <p className="text-sm text-gray-600">
      Shipping information
    </p>
  </Link>

  <Link
    href="/account/profile"
    className="border rounded p-5 hover:shadow"
  >
    <h3 className="font-semibold mb-1">Profile</h3>
    <p className="text-sm text-gray-600">
      Edit your personal details
    </p>
  </Link>
</div>

      </section>
    </Container>
  );
}
