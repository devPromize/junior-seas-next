'use client';
import { createContext, useContext, useEffect, useState } from 'react';

export type ConsentChoice = 'accepted' | 'rejected';

interface CookieConsentContextType {
  // null = no choice made yet (banner should show)
  consent: ConsentChoice | null;
  // ready = localStorage has been read; prevents banner flash on first paint
  ready: boolean;
  accept: () => void;
  reject: () => void;
}

const CookieConsentContext = createContext<CookieConsentContextType | undefined>(
  undefined
);

const STORAGE_KEY = 'cookie-consent'; // value: 'accepted' | 'rejected'

export const CookieConsentProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [consent, setConsent] = useState<ConsentChoice | null>(null);
  const [ready, setReady] = useState(false);

  // Read any previously stored choice once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'accepted' || stored === 'rejected') {
      setConsent(stored);
    }
    setReady(true);
  }, []);

  const record = (choice: ConsentChoice) => {
    localStorage.setItem(STORAGE_KEY, choice);
    setConsent(choice);
  };

  return (
    <CookieConsentContext.Provider
      value={{
        consent,
        ready,
        accept: () => record('accepted'),
        reject: () => record('rejected'),
      }}
    >
      {children}
    </CookieConsentContext.Provider>
  );
};

export const useCookieConsent = () => {
  const ctx = useContext(CookieConsentContext);
  if (!ctx)
    throw new Error('useCookieConsent must be used within CookieConsentProvider');
  return ctx;
};
