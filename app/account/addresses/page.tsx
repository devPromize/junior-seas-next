'use client';

import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Container from '@/ui/Container';

export default function AddressesPage() {
  const { user, loading } = useAuth();
  const [addresses, setAddresses] = useState<any[]>([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (loading || !user) return;

    setFetching(true);

    (async () => {
      const res = await fetch('/api/account/addresses');
      const json = await res.json();
      setAddresses(json.addresses || []);
      setFetching(false);
    })();
  }, [loading, user]);

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
        <p className="py-10 text-center">Please login</p>
      </Container>
    );
  }

  return (
    <Container>
      <section className="py-10 max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl md:text-2xl font-bold">
            Saved Addresses
          </h2>

          <Link
            href="/account"
            className="text-sm text-gray-600 hover:underline"
          >
            ← Back to account
          </Link>
        </div>

        {fetching ? (
          <p>Loading addresses…</p>
        ) : addresses.length === 0 ? (
          <p className="text-gray-500">No addresses saved</p>
        ) : (
          <div className="space-y-4">
            {addresses.map(a => (
              <div
                key={a.id}
                className="border rounded p-4 bg-white"
              >
                <p className="font-medium">{a.full_name}</p>
                <p>{a.address_line1}</p>
                <p>{a.city}, {a.state}</p>
                <p>{a.phone}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </Container>
  );
}
