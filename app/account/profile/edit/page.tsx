'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import Container from '@/ui/Container';
import Link from 'next/link';

export default function EditProfilePage() {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!user) return;

    (async () => {
      const res = await fetch('/api/account/profile');
      const json = await res.json();
      setProfile(json.profile);
      setFullName(json.profile.full_name || '');
      setPhone(json.profile.phone || '');
      setFetching(false);
    })();
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, phone })
      });
      const json = await res.json();

      if (json.error) {
        alert(json.error);
      } else {
        alert('Profile updated successfully!');
        setProfile(json.profile);
      }
    } catch (err) {
      console.error(err);
      alert('Something went wrong');
    } finally {
      setSaving(false);
    }
  };

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
          <p>Please sign in to edit your profile</p>
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
          <h2 className="text-xl md:text-2xl font-bold">Edit Profile</h2>
          <Link href="/account" className="text-sm text-gray-600 hover:underline">
            ← Back to account
          </Link>
        </div>

        <div className="space-y-4 border rounded p-5 bg-white">
          <div>
            <label className="text-sm text-gray-500">Email</label>
            <p className="font-medium">{profile.email}</p>
          </div>

          <div>
            <label className="text-sm text-gray-500">Full name</label>
            <input
              className="w-full border p-2 rounded mt-1"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-gray-500">Phone</label>
            <input
              className="w-full border p-2 rounded mt-1"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-(--color-navyBlue) text-white w-full py-3 rounded disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </section>
    </Container>
  );
}
