'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Variant } from '@/type';

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

export const WishlistProvider = ({ children }: { children: React.ReactNode }) => {
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const syncTimeout = useRef<NodeJS.Timeout | null>(null);

  // Load
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("wishlist");
    if (stored) setWishlistItems(JSON.parse(stored));
  }, []);

  // Save local
  useEffect(() => {
    localStorage.setItem('wishlist', JSON.stringify(wishlistItems));
  }, [wishlistItems]);

  // ======= Server sync =======
  // useEffect(() => {
  //   if (syncTimeout.current) clearTimeout(syncTimeout.current);
  //   syncTimeout.current = setTimeout(() => syncWishlistToServer(wishlistItems), 600);
  // }, [wishlistItems]);

  // const syncWishlistToServer = async (items: WishlistItem[]) => {
  //   try {
  //     await fetch('/api/wishlist/sync', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ items }),
  //     });
  //   } catch (err) {
  //     console.error('Wishlist sync failed', err);
  //   }
  // };


  // ===== Merge ======
  // useEffect(() => {
  //   const mergeWishlist = async () => {
  //     try {
  //       const res = await fetch('/api/wishlist/merge');
  //       const data = await res.json();
  //       if (data?.mergedWishlist) {
  //         setWishlistItems(data.mergedWishlist);
  //         localStorage.setItem('wishlist', JSON.stringify(data.mergedWishlist));
  //       }
  //     } catch {}
  //   };
  //   mergeWishlist();
  // }, []);

  const addToWishlist = (item: WishlistItem) => {
    let added = false;

    setWishlistItems(prev => {
      const exists = prev.some(i => i._id === item._id);
      if (exists) return prev;
      added = true;
      return [...prev, { ...item, variants: item.variants || item.meta?.variants || [] }];
    });

    if (added) toast.success('Added to wishlist');
    else toast.info('Already in wishlist');

    return added;
  };

  const removeFromWishlist = (_id: string) => {
    setWishlistItems(prev => prev.filter(item => item._id !== _id));
    toast.warn('Removed from wishlist');
  };

  const clearWishlist = () => {
    setWishlistItems([]);
    toast.info('Wishlist cleared');
  };

  return (
    <WishlistContext.Provider value={{ wishlistItems, addToWishlist, removeFromWishlist, clearWishlist }}>
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) throw new Error('useWishlist must be used within WishlistProvider');
  return context;
};
