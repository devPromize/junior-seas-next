import { Suspense } from 'react';
import PaymentSuccessClient from './PaymentSuccessClient';

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="text-center mt-20">Finalizing payment...</div>}>
      <PaymentSuccessClient />
    </Suspense>
  );
}
