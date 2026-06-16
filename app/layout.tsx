import type { Metadata } from 'next';
import './globals.css';
import { WishlistProvider } from '@/context/WishListContext';
import { CartProvider } from '@/context/CartContext';
import { ToastContainer } from 'react-toastify';
import ReactQueryProvider from '@/context/ReactQueryProvider';
import { CookieConsentProvider } from '@/context/CookieConsentContext';
import Layout from '@/ui/Layout';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});


export const metadata: Metadata = {
  title: 'Junior Seas Technologies - Shop the best tech products and solutions',
  description: 'Junior Seas e-commerce platform for tech products',
  icons: {
    icon: '/icon.png',          // desktop + android
    apple: '/apple-icon.png',   // iOS (CRITICAL)
  },
  openGraph: {
    title: 'Junior Seas Technologies',
    description: 'Shop the best tech products and solutions at Junior Seas Tech',
    images: ['/og-image.png'],
    url: 'https://juniorseastech.com',
  },
  twitter: {
    card: 'summary_large_image',
  },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
     
      <body className={`${inter.variable}  antialiased`}>
        <ReactQueryProvider>
          <CookieConsentProvider>
            <WishlistProvider>
              <CartProvider>
                <ToastContainer
                  position="top-right"
                  autoClose={1500}
                  newestOnTop={true}
                  hideProgressBar={false}
                  closeOnClick
                  pauseOnHover
                  draggable
                  theme="light"
                />
                <Layout>{children}</Layout>
              </CartProvider>
            </WishlistProvider>
          </CookieConsentProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
