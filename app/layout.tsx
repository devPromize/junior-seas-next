import type { Metadata } from 'next';
import './globals.css';
import { WishlistProvider } from '@/context/WishListContext';
import { CartProvider } from '@/context/CartContext';
import { ToastContainer } from 'react-toastify';
import ReactQueryProvider from '@/context/ReactQueryProvider';
import Layout from '@/ui/Layout';
import Head from 'next/head'; // <-- import Head
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});


export const metadata: Metadata = {
  title: 'Junior Seas Tech',
  description: 'Junior Seas e-commerce platform for tech products',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <Head>
        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />

        {/* OG / Social Media */}
        <meta property="og:title" content="Junior Seas Tech" />
        <meta property="og:description" content="Shop the best tech products and solutions at Junior Seas Tech" />
        <meta property="og:image" content="/og-image.png" />
        <meta property="og:url" content="https://juniorseastech.com" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="description" content="Junior Seas e-commerce platform for tech products" />
      </Head>
      <body className={`${inter.variable}  antialiased`}>
        <ReactQueryProvider>
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
        </ReactQueryProvider>
      </body>
    </html>
  );
}
