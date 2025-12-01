'use client';
import { useCart } from '../context/CartContext';
import { useState } from 'react';
import CartProductCard from '../ui/CartProductCard';

const Cart = () => {
  const { cartItems, clearCart } = useCart();
  const [promoCode, setPromoCode] = useState('');
  const [discount, setDiscount] = useState(0);

  // Ensure all item prices and quantities are in correct types for display and calculation
  const sanitizedCartItems = cartItems.map((item) => ({
    ...item,
    price: item.price != null ? Number(item.price) : 0,
    quantity: Number(item.quantity) || 0,
  }));

  const totalPrice = sanitizedCartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const applyPromo = () => {
    if (promoCode.trim().toLowerCase() === 'izupromo') {
      setDiscount(0.1); // 10% discount
    } else {
      setDiscount(0);
      alert('Invalid promo code');
    }
  };

  const discountedTotal = totalPrice * (1 - discount);

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h2 className="text-xl font-bold mb-4">Your Cart</h2>

      {sanitizedCartItems.length === 0 ? (
        <p className="text-center py-8">Your cart is empty.</p>
      ) : (
        <>
          <div className="space-y-4">
            {sanitizedCartItems.map((item) => (
              <CartProductCard key={item._id} item={item} />
            ))}
          </div>

          <div className="mt-8 border-t pt-4 grid md:grid-cols-2 gap-6">
            {/* Promo code section */}
            <div>
              <input
                type="text"
                placeholder="Enter promo code"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className="border px-3 py-2 w-full rounded"
              />
              <button
                onClick={applyPromo}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Apply Code
              </button>
            </div>

            {/* Price summary section */}
            <div className="bg-gray-50 p-4 rounded border">
              <div className="flex justify-between mb-2">
                <span>Subtotal:</span>
                <span>₦{totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span>Discount:</span>
                <span className="text-green-600">
                  {discount > 0
                    ? `-₦${(totalPrice * discount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                    : '₦0.00'}
                </span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total:</span>
                <span>₦{discountedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <button className="mt-4 w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">
                Proceed to Checkout
              </button>

              <button
                onClick={clearCart}
                className="mt-2 w-full border border-red-500 text-red-500 py-2 rounded hover:bg-red-50"
              >
                Clear Cart
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Cart;
