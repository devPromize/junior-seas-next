// app/order/[ref]/complete/page.tsx
import { headers } from 'next/headers';
import Link from 'next/link';

async function getOrder(ref: string) {
  const headersList = await headers();
  const host = headersList.get('host');

  if (!host) {
    throw new Error('Unable to determine host');
  }

  const protocol =
    process.env.NODE_ENV === 'development' ? 'http' : 'https';

  const res = await fetch(
    `${protocol}://${host}/api/orders/${ref}`,
    { cache: 'no-store' }
  );

  if (!res.ok) {
    throw new Error('Order not found');
  }

  return res.json();
}

export default async function OrderCompletePage({
  params,
}: {
  params: { ref: string };
}) {
  const ref = params.ref;
  const order = await getOrder(ref);


  const amountNaira = (order.amount / 100).toLocaleString();

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">
        Order Received 🎉
      </h1>

      <p className="text-gray-600 mb-6">
        Your order has been created successfully. You can complete
        payment now or later.
      </p>

      {/* ORDER SUMMARY */}
      <div className="border rounded-lg p-4 mb-6">
        <p>
          <strong>Order Reference:</strong> {order.order_ref}
        </p>
        <p>
          <strong>Total Amount:</strong> ₦{amountNaira}
        </p>
        <p>
          <strong>Payment Status:</strong>{' '}
          {order.payment_status}
        </p>
      </div>

      {/* BANK TRANSFER */}
      <div className="border rounded-lg p-4 mb-6">
        <h2 className="font-semibold mb-2">
          Bank Transfer Details
        </h2>
        <p>
          <strong>Bank:</strong> NOMBANK MFB
        </p>
        <p>
          <strong>Account Name:</strong> DE JUNIOR SEAS GLOBAL LTD
        </p>
        <p>
          <strong>Account Number:</strong> 5307422779
        </p>

        <p className="mt-3 text-sm text-gray-600">
          Please use your <strong>Order Reference</strong> as the
          transfer narration.
        </p>
      </div>

      {/* WHATSAPP CONFIRMATION */}
      <a
        href={`https://wa.me/2348106165292?text=Hello,%20I%20have%20made%20a%20payment%20for%20order%20${order.order_ref}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-center bg-green-600 hover:bg-green-600/80 duration-200 text-white py-3 rounded-lg mb-4"
      >
        Confirm Payment on WhatsApp
      </a>

      {/* PAYSTACK OPTIONAL */}
      {order.payment_status !== 'paid' && (
        <Link
          // href={`/pay/${order.order_ref}`}
          href={`#`}
          className="block text-center border border-black py-3 rounded-lg bg-(--color-navyBlue) text-white hover:bg-(--color-navyBlue)/80 duration-200"
        >
          Pay Now with Card/Paystack
        </Link>
      )}

      <p className="text-sm text-gray-500 mt-10">
  If you don’t see your confirmation email, please check your spam/junk folder and mark it as "Not Spam".
</p>


    </div>
  );
}
