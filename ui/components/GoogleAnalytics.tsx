'use client';
import Script from 'next/script';
import { useCookieConsent } from '@/context/CookieConsentContext';

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

/**
 * Loads Google Analytics (gtag) ONLY after the user has accepted cookies.
 * - No consent / rejected → nothing is injected, no GA cookies are set.
 * - Accepted → scripts mount immediately (same session) and on every
 *   subsequent visit (consent is read from localStorage on load).
 */
const GoogleAnalytics = () => {
  const { consent } = useCookieConsent();

  if (consent !== 'accepted' || !GA_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
};

export default GoogleAnalytics;
