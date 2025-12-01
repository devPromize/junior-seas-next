'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'react-toastify';

export interface CartItem {
  _id: string;
  productId: string | number;
  variantId?: string | number | null;
  name: string;
  price: number;
  image?: string;
  quantity: number;
  meta?: any;
}

interface CartContextType {
  cartItems: CartItem[];
  totalPrice: number;
  addToCart: (item: Partial<CartItem> & { quantity?: number }) => boolean;
  incrementQuantity: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);
const STORAGE_KEY = 'cart';

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setCartItems(JSON.parse(stored));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cartItems));
  }, [cartItems]);

  const totalPrice = cartItems.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  );

  // Add to cart → returns true if actually added
  const addToCart = (incoming: Partial<CartItem> & { quantity?: number }) => {
    const id = String(incoming._id);
    const quantity = Number(incoming.quantity ?? 1);
    let added = false;

    setCartItems(prev => {
      const exists = prev.find(i => i._id === id);
      if (exists) return prev;

      const newItem: CartItem = {
        _id: id,
        productId: incoming.productId ?? id,
        variantId: incoming.variantId ?? null,
        name: incoming.name ?? 'Product',
        price: Number(incoming.price ?? 0),
        image: incoming.image ?? '/placeholder.png',
        quantity,
        meta: incoming.meta ?? {},
      };
      added = true;
      return [...prev, newItem];
    });

    if (added) toast.success(`Added to cart: ${incoming.name}`);
    return added;
  };

  const incrementQuantity = (id: string) => {
    setCartItems(prev =>
      prev.map(item => (item._id === id ? { ...item, quantity: item.quantity + 1 } : item))
    );
    const item = cartItems.find(i => i._id === id);
    if (item) toast.success(`Added one more: ${item.name}`);
  };

  const updateQuantity = (id: string, quantity: number) => {
    setCartItems(prev => {
      const updated = prev
        .map(item => (item._id === id ? { ...item, quantity } : item))
        .filter(item => item.quantity > 0);

      if (!updated.find(item => item._id === id)) {
        toast.warn('Removed from cart');
      }

      return updated;
    });
  };

  const removeFromCart = (id: string) => {
    setCartItems(prev => prev.filter(item => item._id !== id));
    toast.warn('Removed from cart');
  };

  const clearCart = () => {
    setCartItems([]);
    toast.info('Cart cleared');
  };

  return (
    <CartContext.Provider
      value={{
        cartItems,
        totalPrice,
        addToCart,
        incrementQuantity,
        updateQuantity,
        removeFromCart,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};
