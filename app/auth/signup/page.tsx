// app/auth/signup/page.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const router = useRouter();

  const handleSignup = async () => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (error) return alert(error.message);
    // Optionally create profile via server function; Supabase Auth can create user_metadata
    router.push('/auth/login');
  };

  return (
    <div className="max-w-md mx-auto p-5">
      <h2 className="text-2xl font-bold mb-4">Create an account</h2>

      <input className="border p-3 w-full mb-3 rounded bg-gray-100" placeholder="Full name" value={fullName} onChange={(e)=>setFullName(e.target.value)} />
      <input className="border p-3 w-full mb-3 rounded bg-gray-100" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
      <input type="password" className="border p-3 w-full mb-3 rounded bg-gray-100" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} />

      <button onClick={handleSignup} className="bg-(--color-navyBlue) text-white w-full py-3 rounded">Sign Up</button>
    </div>
  );
}
