'use client';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'react-toastify';
import { createClient } from '@/lib/services/client';
import {
  addItemToCart,
  calculateTotal,
  setItemQuantity,
  mergeCarts,
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
  const supabase = useMemo(() => createClient(), []);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const hydratedRef = useRef(false); // local cart loaded
  const serverSyncedRef = useRef(false); // server cart merged for current user

  const saveToServer = (uid: string, items: CartItem[]) => {
    supabase
      .from('carts')
      .upsert(
        { user_id: uid, items, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) console.error('Cart sync failed:', error.message);
      });
  };

  // 1) Load the local (guest) cart once.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setCartItems(JSON.parse(stored));
      } catch {
        /* ignore a corrupt cart */
      }
    }
    hydratedRef.current = true;
  }, []);

  // 2) Track the logged-in user (cookie session).
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setUserId(data?.user?.id ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setUserId(session?.user?.id ?? null)
    );
    return () => listener?.subscription?.unsubscribe();
  }, [supabase]);

  // 3) On login: pull the saved cart, merge it with the local one, push back.
  useEffect(() => {
    if (!userId) {
      serverSyncedRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('carts')
        .select('items')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      const serverItems: CartItem[] = Array.isArray(data?.items)
        ? (data!.items as CartItem[])
        : [];
      setCartItems((local) => {
        const merged = mergeCarts(local, serverItems);
        saveToServer(userId, merged);
        return merged;
      });
      serverSyncedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // 4) Persist changes: always to localStorage; to the server once synced.
  useEffect(() => {
    if (!hydratedRef.current) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cartItems));
    if (userId && serverSyncedRef.current) {
      saveToServer(userId, cartItems);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems, userId]);

  const totalPrice = calculateTotal(cartItems);

  // Add to cart → returns true if actually added
  const addToCart = (incoming: Partial<CartItem> & { quantity?: number }) => {
    let added = false;

    setCartItems((prev) => {
      const result = addItemToCart(prev, incoming);
      added = result.added;
      return result.items;
    });

    if (added) toast.success(`Added to cart: ${incoming.name}`);
    return added;
  };

  const incrementQuantity = (id: string) => {
    setCartItems((prev) =>
      prev.map((item) =>
        item._id === id ? { ...item, quantity: item.quantity + 1 } : item
      )
    );
    const item = cartItems.find((i) => i._id === id);
    if (item) toast.success(`Added one more: ${item.name}`);
  };

  const updateQuantity = (id: string, quantity: number) => {
    setCartItems((prev) => {
      const updated = setItemQuantity(prev, id, quantity);

      if (!updated.find((item) => item._id === id)) {
        toast.warn('Removed from cart');
      }

      return updated;
    });
  };

  const removeFromCart = (id: string) => {
    setCartItems((prev) => prev.filter((item) => item._id !== id));
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
