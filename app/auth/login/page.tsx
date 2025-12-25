// app/auth/login/page.tsx
'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);
    // you may want to redirect to account page
    router.push('/account');
  };

  const sendMagicLink = async () => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) return alert(error.message);
    alert('Magic link/sent if the email exists.');
  };

  return (
    <div className="max-w-md mx-auto p-5">
      <h2 className="text-2xl font-bold mb-4">Sign in</h2>

      <input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="Email" className="border p-3 w-full mb-3 rounded bg-gray-100" />
      <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Password" className="border p-3 w-full mb-3 rounded bg-gray-100" />

      <button onClick={handleLogin} className="bg-(--color-navyBlue) text-white w-full py-3 rounded mb-2">Sign in</button>
      <button onClick={sendMagicLink} className="w-full border py-2 rounded">Send magic link</button>
    </div>
  );
}
