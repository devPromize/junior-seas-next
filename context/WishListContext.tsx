'use client';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'react-toastify';
import { Variant } from '@/type';
import { createClient } from '@/lib/services/client';
import { mergeWishlists } from '@/lib/wishlistLogic';

export interface WishlistItem {
  _id: string;
  name: string;
  price: number | string;
  image: string;
  variants?: Variant[];
  images?: string[];
  slug?: string;
  description?: string;
  category?: string;
  brand?: string;
  status?: string | null;
  highlight_section?: string | null;
  in_stock?: boolean;
  created_at?: string;
  [key: string]: any;
}

interface WishlistContextType {
  wishlistItems: WishlistItem[];
  addToWishlist: (item: WishlistItem) => boolean;
  removeFromWishlist: (_id: string) => void;
  clearWishlist: () => void;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);
const STORAGE_KEY = 'wishlist';

export const WishlistProvider = ({ children }: { children: React.ReactNode }) => {
  const supabase = useMemo(() => createClient(), []);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const hydratedRef = useRef(false);
  const serverSyncedRef = useRef(false);

  const saveToServer = (uid: string, items: WishlistItem[]) => {
    supabase
      .from('wishlists')
      .upsert(
        { user_id: uid, items, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) console.error('Wishlist sync failed:', error.message);
      });
  };

  // 1) Load the local (guest) wishlist once.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setWishlistItems(JSON.parse(stored));
      } catch {
        /* ignore a corrupt wishlist */
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

  // 3) On login: pull the saved wishlist, merge with the local one, push back.
  useEffect(() => {
    if (!userId) {
      serverSyncedRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('wishlists')
        .select('items')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      const serverItems: WishlistItem[] = Array.isArray(data?.items)
        ? (data!.items as WishlistItem[])
        : [];
      setWishlistItems((local) => {
        const merged = mergeWishlists(local, serverItems);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wishlistItems));
    if (userId && serverSyncedRef.current) {
      saveToServer(userId, wishlistItems);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wishlistItems, userId]);

  const addToWishlist = (item: WishlistItem) => {
    let added = false;

    setWishlistItems((prev) => {
      const exists = prev.some((i) => i._id === item._id);
      if (exists) return prev;
      added = true;
      return [
        ...prev,
        { ...item, variants: item.variants || item.meta?.variants || [] },
      ];
    });

    if (added) toast.success('Added to wishlist');
    else toast.info('Already in wishlist');

    return added;
  };

  const removeFromWishlist = (_id: string) => {
    setWishlistItems((prev) => prev.filter((item) => item._id !== _id));
    toast.warn('Removed from wishlist');
  };

  const clearWishlist = () => {
    setWishlistItems([]);
    toast.info('Wishlist cleared');
  };

  return (
    <WishlistContext.Provider
      value={{ wishlistItems, addToWishlist, removeFromWishlist, clearWishlist }}
    >
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context)
    throw new Error('useWishlist must be used within WishlistProvider');
  return context;
};
