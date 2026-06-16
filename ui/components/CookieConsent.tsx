'use client';
import Link from 'next/link';
import { useCookieConsent } from '@/context/CookieConsentContext';

const CookieConsent = () => {
  const { consent, ready, accept, reject } = useCookieConsent();

  // Show only once we've read storage (avoids flash) and no choice exists yet.
  const visible = ready && consent === null;

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed bottom-0 inset-x-0 z-[1001] bg-[var(--color-navyBlue)] text-white shadow-lg"
    >
      <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        <p className="text-sm leading-relaxed flex-1">
          🍪 We use cookies to improve your experience, analyze traffic, and
          personalize content. See our{' '}
          <Link
            href="/cookies"
            className="underline font-semibold text-[var(--color-classicGold)] hover:text-[var(--color-skyBlue)]"
          >
            Cookies Policy
          </Link>
          .
        </p>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={reject}
            className="px-4 py-2 text-sm rounded border border-white/40 hover:bg-white/10 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={accept}
            className="px-5 py-2 text-sm font-semibold rounded bg-[var(--color-classicGold)] text-[var(--color-navyBlue)] hover:bg-[var(--color-skyBlue)] transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
