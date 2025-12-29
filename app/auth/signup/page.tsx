// 'use client';

// import { useState } from 'react';
// import { useRouter } from 'next/navigation';
// import Container from '@/ui/Container';

// export default function SignupPage() {
//   const router = useRouter();

//   const [fullName, setFullName] = useState('');
//   const [email, setEmail] = useState('');
//   const [phone, setPhone] = useState('');
//   const [password, setPassword] = useState('');
//   const [confirmPassword, setConfirmPassword] = useState('');
//   const [showPassword, setShowPassword] = useState(false);
//   const [loading, setLoading] = useState(false);

//   const handleSignup = async () => {
//     if (!fullName || !email || !phone || !password) {
//       return alert('Please fill all required fields');
//     }
//     if (password !== confirmPassword) {
//       return alert('Passwords do not match');
//     }
//     if (password.length < 6) {
//       return alert('Password must be at least 6 characters');
//     }

//     setLoading(true);

//     try {
//       const res = await fetch('/api/auth/signup', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ email, password, full_name: fullName, phone }),
//       });

//       const data = await res.json();

//       if (!res.ok) throw new Error(data.error || 'Signup failed');

//       alert('Account created successfully! Please check your email to confirm.');
//       router.push('/auth/login');
//     } catch (err: any) {
//       console.error('Signup frontend error:', err);
//       alert(err.message || 'Unexpected error during signup');
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <Container>
//       <div className="max-w-md mx-auto p-6 bg-white rounded shadow-md mt-10">
//         <h2 className="text-2xl font-bold mb-6 text-center">Create an Account</h2>

//         <input
//           className="border p-3 w-full mb-3 rounded bg-gray-100"
//           placeholder="Full Name"
//           value={fullName}
//           onChange={(e) => setFullName(e.target.value)}
//         />

//         <input
//           className="border p-3 w-full mb-3 rounded bg-gray-100"
//           placeholder="Email"
//           type="email"
//           value={email}
//           onChange={(e) => setEmail(e.target.value)}
//         />

//         <input
//           className="border p-3 w-full mb-3 rounded bg-gray-100"
//           placeholder="Phone Number"
//           value={phone}
//           onChange={(e) => setPhone(e.target.value)}
//         />

//         <div className="relative mb-3">
//           <input
//             className="border p-3 w-full rounded bg-gray-100"
//             placeholder="Password"
//             type={showPassword ? 'text' : 'password'}
//             value={password}
//             onChange={(e) => setPassword(e.target.value)}
//           />
//         </div>

//         <div className="relative mb-4">
//           <input
//             className="border p-3 w-full rounded bg-gray-100"
//             placeholder="Confirm Password"
//             type={showPassword ? 'text' : 'password'}
//             value={confirmPassword}
//             onChange={(e) => setConfirmPassword(e.target.value)}
//           />
//           <button
//             type="button"
//             onClick={() => setShowPassword(!showPassword)}
//             className="absolute right-3 top-3 text-sm text-gray-600"
//           >
//             {showPassword ? 'Hide' : 'Show'}
//           </button>
//         </div>

//         <button
//           onClick={handleSignup}
//           disabled={loading}
//           className="bg-(--color-navyBlue) text-white w-full py-3 rounded disabled:opacity-60"
//         >
//           {loading ? 'Creating account...' : 'Sign Up'}
//         </button>
//       </div>
//     </Container>
//   );
// }




// app/auth/signup/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import Container from '@/ui/Container';
import Confetti from 'react-confetti';
import { useEffect, useState } from 'react';

export default function SignupPage() {
  const router = useRouter();
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    // Update window size for confetti
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
            Account Signup Coming Soon!
          </h1>
          <p className="text-gray-600 mb-6">
            We're working hard to bring account creation to our platform.
            For now, you can continue browsing and placing orders as a guest.
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


