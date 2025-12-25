"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/context/CartContext";
import Link from "next/link";

type Order = {
  order_ref: string;
  amount: number;
  billing: {
    full_name: string;
    email: string;
  };
};

export default function PaymentSuccessClient() {
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");
  const { clearCart } = useCart();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ref) return;

    async function fetchOrder() {
      try {
        const res = await fetch(`/api/orders/${ref}`);
        const data = await res.json();
        setOrder(data);
      } catch (err) {
        console.error("Failed to fetch order", err);
      } finally {
        setLoading(false);
      }
    }

    fetchOrder();
    clearCart(); // ✅ frontend cart cleared once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        Processing payment confirmation...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center mt-20">
        <h1 className="text-xl font-semibold">Order not found</h1>
      </div>
    );
  }

  const amountNaira = (order.amount / 100).toLocaleString();

  return (
    <div className="max-w-xl mx-auto mt-16 px-4 text-center">
      <h1 className="text-3xl font-bold text-green-600">
        Payment Successful 🎉
      </h1>

      <p className="mt-4 text-gray-600">
        Thank you <strong>{order.billing.full_name}</strong>, your payment was
        received successfully.
      </p>

      <div className="mt-6 bg-gray-100 rounded-lg p-4 text-left">
        <p>
          <strong>Order Ref:</strong> {order.order_ref}
        </p>
        <p>
          <strong>Amount Paid:</strong> ₦{amountNaira}
        </p>
        <p>
          <strong>Email:</strong> {order.billing.email}
        </p>
      </div>

      <p className="mt-6 text-sm text-gray-500">
        A confirmation email will be sent shortly with delivery details.
      </p>

      <Link
        href="/shop"
        className="inline-block mt-8 px-6 py-3 bg-(--color-navyBlue) text-white rounded-lg"
      >
        Continue Shopping
      </Link>
    </div>
  );
}
