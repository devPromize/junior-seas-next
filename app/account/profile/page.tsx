'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import Container from '@/ui/Container';

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!user) return;

    (async () => {
      const res = await fetch('/api/account/profile');
      const json = await res.json();
      setProfile(json.profile ?? { email: '—', full_name: '—', phone: '—' });
      setFetching(false);
    })();
  }, [user]);

  if (loading || fetching) {
    return (
      <Container>
        <p className="py-10 text-center">Loading profile…</p>
      </Container>
    );
  }

  if (!user) {
    return (
      <Container>
        <div className="py-10 text-center">
          <p>Please sign in to view your profile</p>
          <Link href="/auth/login" className="underline">
            Login
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <section className="py-10 max-w-xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl md:text-2xl font-bold">Profile</h2>
          <Link href="/account" className="text-sm text-gray-600 hover:underline">
            ← Back to account
          </Link>
        </div>

        <div className="space-y-4 border rounded p-5 bg-white">
          <div>
            <label className="text-sm text-gray-500">Email</label>
            <p className="font-medium">{profile?.email ?? '—'}</p>
          </div>

          <div>
            <label className="text-sm text-gray-500">Full name</label>
            <p className="font-medium">{profile?.full_name ?? '—'}</p>
          </div>

          <div>
            <label className="text-sm text-gray-500">Phone</label>
            <p className="font-medium">{profile?.phone ?? '—'}</p>
          </div>
        </div>
      </section>
    </Container>
  );
}
