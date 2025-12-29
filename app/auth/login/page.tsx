// // app/auth/login/page.tsx
// 'use client';
// import { useState } from 'react';
// import { supabase } from '@/lib/supabaseClient';
// import { useRouter } from 'next/navigation';

// export default function LoginPage() {
//   const [email, setEmail] = useState('');
//   const [password, setPassword] = useState('');
//   const router = useRouter();

//   const handleLogin = async () => {
//     const { data, error } = await supabase.auth.signInWithPassword({ email, password });
//     if (error) return alert(error.message);
//     // you may want to redirect to account page
//     router.push('/account');
//   };

//   const sendMagicLink = async () => {
//     const { error } = await supabase.auth.signInWithOtp({ email });
//     if (error) return alert(error.message);
//     alert('Magic link/sent if the email exists.');
//   };

//   return (
//     <div className="max-w-md mx-auto p-5">
//       <h2 className="text-2xl font-bold mb-4">Sign in</h2>

//       <input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="Email" className="border p-3 w-full mb-3 rounded bg-gray-100" />
//       <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Password" className="border p-3 w-full mb-3 rounded bg-gray-100" />

//       <button onClick={handleLogin} className="bg-(--color-navyBlue) text-white w-full py-3 rounded mb-2">Sign in</button>
//       <button onClick={sendMagicLink} className="w-full border py-2 rounded">Send magic link</button>
//     </div>
//   );
// }



// app/auth/login/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import Container from '@/ui/Container';
import Confetti from 'react-confetti';
import { useEffect, useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <Container>
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-6 relative">
        {/* Confetti */}
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          numberOfPieces={80}
          gravity={0.2}
          recycle={true}
        />

        <div className="bg-white shadow-xl rounded-3xl p-10 max-w-md w-full animate-fadeIn z-10 relative">
          <h1 className="text-4xl font-extrabold mb-4 text-navyBlue">
            Login Coming Soon!
          </h1>
          <p className="text-gray-600 mb-6">
            Account login functionality is under development. For now, you can continue browsing and placing orders as a guest.
          </p>
          <button
            onClick={() => router.push('/shop')}
            className="bg-navyBlue text-white font-semibold px-6 py-3 rounded-lg hover:bg-blue-700 transition"
          >
            Continue Shopping
          </button>
        </div>
      </div>
    </Container>
  );
}
