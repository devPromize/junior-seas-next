'use client';
import React from 'react';
import Header from './Header';
import BrandCarousel from './BrandsCarousel';
import Footer from './Footer';
import { Toaster } from 'react-hot-toast';
import ScrollToTop from './ScrollToTop';
import BackToTopButton from './components/BackToTopButton';
import WhatsAppChatWidget from './components/WhatsAppChatWidget';
import CookieConsent from './components/CookieConsent';
import GoogleAnalytics from './components/GoogleAnalytics';


const Layout = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <>
      <Header />
      {children}
      <BrandCarousel />
      <ScrollToTop />
      <Footer />
      <BackToTopButton />
      <WhatsAppChatWidget />
      <CookieConsent />
      <GoogleAnalytics />
      <Toaster
        position="bottom-right"
        reverseOrder={false}
        gutter={8}
        containerClassName=""
        toastOptions={{
          style: {
            backgroundColor: 'black',
            color: 'white',
          },
        }}
      />
    </>
  );
};

export default Layout;
