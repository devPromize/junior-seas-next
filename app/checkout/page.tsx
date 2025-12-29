'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-toastify';

export default function CheckoutPage() {
  const router = useRouter();
//   const supabase = createClient();
  const { cartItems, clearCart } = useCart();
  const { user } = useAuth();

  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    country: 'Nigeria',
    state: '',
    city: '',
    address: '',
    phone: '',
    notes: '',
    newsletter: false,
    differentAddress: false,
  });

  const [altAddress, setAltAddress] = useState({
    firstName: '',
    lastName: '',
    country: 'Nigeria',
    state: '',
    city: '',
    address: '',
    phone: '',
    notes: '',
  });

  const [errors, setErrors] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const subtotal = cartItems.reduce(
    (s: number, it: any) => s + Number(it.price) * Number(it.quantity),
    0
  );

  // 🔥 VALIDATION
  const validate = () => {
    const e: any = {};

    // Billing
    if (!form.email || !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Valid email required';
    if (!form.firstName) e.firstName = 'First name required';
    if (!form.lastName) e.lastName = 'Last name required';
    if (!form.city) e.city = 'City required';
    if (!form.address) e.address = 'Street address required';
    if (!form.phone) e.phone = 'Phone required';

    // Shipping validation only when checked
    if (form.differentAddress) {
      if (!altAddress.firstName) e.altFirstName = 'Shipping first name required';
      if (!altAddress.lastName) e.altLastName = 'Shipping last name required';
      if (!altAddress.city) e.altCity = 'Shipping city required';
      if (!altAddress.address) e.altAddress = 'Shipping street required';
      if (!altAddress.phone) e.altPhone = 'Shipping phone required';
    }

    setErrors(e);

    return Object.keys(e).length === 0;
  };

  // 🔥 Auto-fill shipping fields if empty
  const getFinalShipping = () => {
    if (!form.differentAddress) return form;

    return {
      firstName: altAddress.firstName || form.firstName,
      lastName: altAddress.lastName || form.lastName,
      country: 'Nigeria',
      state: altAddress.state || form.state,
      city: altAddress.city || form.city,
      address: altAddress.address || form.address,
      phone: altAddress.phone || form.phone,
      notes: altAddress.notes,
    };
  };

  // 🔥 Save addresses to Supabase profiles
  const saveAddressesToSupabase = async (billing: any, shipping: any) => {
    if (!user?.id) return;

    await supabase.from('profiles').upsert(
      {
        id: user.id,
        email: billing.email,
        full_name: `${billing.firstName} ${billing.lastName}`,
      },
      { onConflict: 'id' }
    );

  };

// CheckoutPage onPlaceOrder (HYBRID FLOW)
const onPlaceOrder = async () => {
  if (!validate()) return;

  setLoading(true);

  try {
    const shippingAddress = getFinalShipping();

    // keep this exactly as you had it
    await saveAddressesToSupabase(form, shippingAddress);

    const payload = {
      billing:{...form,
        full_name: `${form.firstName} ${form.lastName}`
      },
      shipping: shippingAddress,
      items: cartItems,
      amount: Math.round(subtotal * 100), // kobo snapshot
      currency: 'NGN',
      user_id: user?.id ?? null,
    };

    const res = await fetch('/api/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.message || 'Could not create order');
    }

    // 🔑 IMPORTANT: redirect to order-complete page
    if (json.order_ref) {
      window.location.href = `/order/${json.order_ref}/complete`;
    } else {
      throw new Error('Order created but no reference returned');
    }
  } catch (e: any) {
    alert(e.message || 'Error placing order');
  } finally {
    setLoading(false);
  }
};


  return (
    <div className="max-w-6xl mx-auto p-4 mt-6 grid md:grid-cols-3 gap-8">
      {/* LEFT — BILLING */}
      <div className="md:col-span-2 space-y-4">
        <h2 className="text-2xl font-bold">Billing Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="border rounded p-3 bg-gray-100 w-full"
              placeholder="Email address *"
            />
            {errors.email && <p className="text-red-500 text-sm">{errors.email}</p>}
          </div>

          <div>
            <input
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              className="border rounded p-3 bg-gray-100 w-full"
              placeholder="First name *"
            />
            {errors.firstName && <p className="text-red-500 text-sm">{errors.firstName}</p>}
          </div>

          <div>
            <input
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              className="border rounded p-3 bg-gray-100 w-full"
              placeholder="Last name *"
            />
            {errors.lastName && <p className="text-red-500 text-sm">{errors.lastName}</p>}
          </div>

          <div>
            <input disabled value="Nigeria" className="border rounded p-3 bg-gray-200 w-full" />
          </div>
        </div>

        <input
          value={form.state}
          onChange={(e) => setForm({ ...form, state: e.target.value })}
          className="border rounded p-3 bg-gray-100 w-full mt-2"
          placeholder="State / County (optional)"
        />

        <input
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          className="border rounded p-3 bg-gray-100 w-full mt-2"
          placeholder="City *"
        />
        {errors.city && <p className="text-red-500 text-sm">{errors.city}</p>}

        <input
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          className="border rounded p-3 bg-gray-100 w-full mt-2"
          placeholder="Street Address *"
        />
        {errors.address && <p className="text-red-500 text-sm">{errors.address}</p>}

        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="border rounded p-3 bg-gray-100 w-full mt-2"
          placeholder="Phone *"
        />
        {errors.phone && <p className="text-red-500 text-sm">{errors.phone}</p>}

        {/* Newsletter */}
        <label className="flex items-center gap-2 mt-3">
          <input
            type="checkbox"
            checked={form.newsletter}
            onChange={(e) => setForm({ ...form, newsletter: e.target.checked })}
          />
          Subscribe to our newsletter
        </label>

        {/* Different Shipping Address */}
        <label className="flex items-center gap-2 mt-3">
          <input
            type="checkbox"
            checked={form.differentAddress}
            onChange={(e) => setForm({ ...form, differentAddress: e.target.checked })}
          />
          Ship to a different address?
        </label>

        {/* SHIPPING FORM */}
        {form.differentAddress && (
          <div className="mt-4 bg-white p-4 rounded border border-gray-300 space-y-4">
            <h3 className="text-xl font-bold">Shipping Address</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <input
                  value={altAddress.firstName}
                  onChange={(e) =>
                    setAltAddress({ ...altAddress, firstName: e.target.value })
                  }
                  className="border rounded p-3 bg-gray-100 w-full"
                  placeholder="First name *"
                />
                {errors.altFirstName && (
                  <p className="text-red-500 text-sm">{errors.altFirstName}</p>
                )}
              </div>

              <div>
                <input
                  value={altAddress.lastName}
                  onChange={(e) =>
                    setAltAddress({ ...altAddress, lastName: e.target.value })
                  }
                  className="border rounded p-3 bg-gray-100 w-full"
                  placeholder="Last name *"
                />
                {errors.altLastName && (
                  <p className="text-red-500 text-sm">{errors.altLastName}</p>
                )}
              </div>

              <div>
                <input disabled value="Nigeria" className="border rounded p-3 bg-gray-200 w-full" />
              </div>
            </div>

            <input
              value={altAddress.state}
              onChange={(e) =>
                setAltAddress({ ...altAddress, state: e.target.value })
              }
              className="border rounded p-3 bg-gray-100 w-full"
              placeholder="State / County"
            />

            <input
              value={altAddress.city}
              onChange={(e) =>
                setAltAddress({ ...altAddress, city: e.target.value })
              }
              className="border rounded p-3 bg-gray-100 w-full mt-2"
              placeholder="City *"
            />
            {errors.altCity && (
              <p className="text-red-500 text-sm">{errors.altCity}</p>
            )}

            <input
              value={altAddress.address}
              onChange={(e) =>
                setAltAddress({ ...altAddress, address: e.target.value })
              }
              className="border rounded p-3 bg-gray-100 w-full mt-2"
              placeholder="Street Address *"
            />
            {errors.altAddress && (
              <p className="text-red-500 text-sm">{errors.altAddress}</p>
            )}

            <input
              value={altAddress.phone}
              onChange={(e) =>
                setAltAddress({ ...altAddress, phone: e.target.value })
              }
              className="border rounded p-3 bg-gray-100 w-full mt-2"
              placeholder="Phone *"
            />
            {errors.altPhone && (
              <p className="text-red-500 text-sm">{errors.altPhone}</p>
            )}

            <textarea
              value={altAddress.notes}
              onChange={(e) =>
                setAltAddress({ ...altAddress, notes: e.target.value })
              }
              className="border rounded p-3 bg-gray-100 w-full h-28 mt-2"
              placeholder="Additional notes (optional)"
            ></textarea>
          </div>
        )}
      </div>

      {/* RIGHT — SUMMARY */}
      <div className="bg-gray-100 border rounded p-4 h-fit">
        <h3 className="text-xl font-bold mb-3">Your Order</h3>

        <div className="space-y-2">
          {cartItems.map((item: any) => (
            <div key={item._id} className="flex justify-between">
              <span>
                {item.name} × {item.quantity}
              </span>
              <span>₦{(item.price * item.quantity).toLocaleString()}</span>
            </div>
          ))}
        </div>

        <div className="border-t my-3 pt-2 flex justify-between font-bold">
          <span>Total:</span>
          <span>₦{subtotal.toLocaleString()}</span>
        </div>

        <button
          onClick={onPlaceOrder}
          disabled={loading}
          className="mt-4 w-full bg-blue-900 text-white font-bold py-2 rounded"
        >
          {loading ? 'Processing...' : 'Place Order'}
        </button>

        <button
          onClick={() => {
            if (confirm('Clear cart?')) clearCart();
          }}
          className="mt-2 w-full border border-red-500 text-red-500 py-2 rounded"
        >
          Clear Cart
        </button>
      </div>
    </div>
  );
}
