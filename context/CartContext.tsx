'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
  addItemToCart,
  calculateTotal,
  setItemQuantity,
  type CartItem,
} from '@/lib/cartLogic';

export type { CartItem };

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

  const totalPrice = calculateTotal(cartItems);

  // Add to cart → returns true if actually added
  const addToCart = (incoming: Partial<CartItem> & { quantity?: number }) => {
    let added = false;

    setCartItems(prev => {
      const result = addItemToCart(prev, incoming);
      added = result.added;
      return result.items;
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
      const updated = setItemQuantity(prev, id, quantity);

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
