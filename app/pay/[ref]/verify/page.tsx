'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function VerifyPaymentPage({
  params,
}: {
  params: { ref: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const reference = searchParams.get('reference');

    if (!reference) {
      router.replace('/');
      return;
    }

    async function verifyPayment() {
      await fetch(`/api/paystack/verify?reference=${reference}`);
      router.replace(`/order/${params.ref}/complete`);
    }

    verifyPayment();
  }, [params.ref, router, searchParams]);

  return (
    <div className="h-screen flex items-center justify-center">
      <p className="text-lg font-medium">
        Verifying payment, please wait…
      </p>
    </div>
  );
}
