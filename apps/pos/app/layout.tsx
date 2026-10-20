import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Junior Seas POS',
  description: 'Point of sale for Junior Seas Tech',
  robots: { index: false, follow: false },   // staff only; keep it out of search engines
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f6b5c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
