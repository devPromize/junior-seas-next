'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signOut } from '../actions';

type Item = { label: string; href?: string };

export default function Sidebar({ items, name, role, showPin }: { items: Item[]; name: string; role: string; showPin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);   // close the phone menu after choosing

  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <>
      {/* Phones and tablets: a bar with a menu button */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-panel px-4 py-3 lg:hidden print:hidden">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="sidebar"
          className="rounded-lg border border-line px-3 py-2 font-medium">
          {open ? 'Close' : 'Menu'}
        </button>
        <span className="font-bold text-brand">Junior Seas POS</span>
      </div>

      <nav id="sidebar"
        className={`${open ? 'flex' : 'hidden'} fixed inset-x-0 bottom-0 top-[57px] z-20 flex-col gap-0.5 overflow-y-auto border-r border-line bg-panel p-3
                    lg:sticky lg:top-0 lg:flex lg:h-dvh print:hidden`}>
        <p className="mb-2 hidden px-3 pt-1 font-bold text-brand lg:block">Junior Seas POS</p>
        {items.map((item) =>
          item.href ? (
            <Link key={item.label} href={item.href}
              className={`rounded-lg px-3 py-2 font-medium ${active(item.href) ? 'bg-brand-soft text-brand' : 'hover:bg-paper'}`}>
              {item.label}
            </Link>
          ) : (
            <span key={item.label} className="flex items-center justify-between rounded-lg px-3 py-2 text-ink-soft opacity-60">
              {item.label}
              <span className="text-xs font-semibold uppercase tracking-wider">Soon</span>
            </span>
          )
        )}
        <div className="mt-auto border-t border-line px-3 pt-3">
          <p className="font-semibold">{name}</p>
          <p className="text-sm text-ink-soft">{role}</p>
          {showPin && <Link href="/pin" className="mt-2 block text-sm font-medium underline">My PIN</Link>}
          <form action={signOut} className="mt-1">
            <button className="text-sm font-medium underline">Sign out</button>
          </form>
        </div>
      </nav>
    </>
  );
}
