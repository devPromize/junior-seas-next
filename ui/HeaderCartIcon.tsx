'use client';

import { RiShoppingCartFill } from 'react-icons/ri';
import { useCart } from '../context/CartContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isActivePath } from '@/lib/isActivePath';

const HeaderCartIcon = () => {
  const url = usePathname();
  const { cartItems } = useCart();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const totalQuantity = cartItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  return (
    <Link
      href="/cart"
      className={
        isActivePath(url, '/cart')
          ? 'active-link'
          : 'text-[var(--color-navyBlue)]'
      }
    >
      <div
        className={`relative group transition-all duration-300 ease-out
        ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}
      >
        <RiShoppingCartFill className="hover:text-[var(--color-skyBlue)] duration-200 cursor-pointer" />

        <span
          className="absolute -top-1 -right-2 bg-red-600 text-[var(--color-white)] text-[10px] 
          rounded-full w-3.5 flex items-center justify-center"
        >
          {mounted ? totalQuantity : ''}
        </span>

        <div
          className="absolute top-7 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center justify-center 
          px-1 py-1 bg-[var(--color-navyBlue)] text-white text-[10px] rounded-sm border border-[var(--color-skyBlue)]"
        >
          Cart
        </div>
      </div>
    </Link>
  );
};

export default HeaderCartIcon;
