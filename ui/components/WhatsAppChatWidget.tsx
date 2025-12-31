import { useState } from "react";

const WHATSAPP_NUMBER = "2348106165292"; // Replace with your WhatsApp number, country code first, no '+'

const WhatsAppChatWidget = () => {
  const [open, setOpen] = useState(false);

  const handleChat = () => {
    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=Hello!%20I%20would%20like%20to%20chat%20with%20support.`,
      "_blank"
    );
  };

  return (
    <div className="fixed bottom-8 right-8 z-[999] flex flex-col items-end">
      {open && (
        <div className="mb-3 bg-(--color-navyBlue) rounded-lg shadow-lg p-4 w-64 animate-fade-in">
          <p className="text-sm text-white mb-2 font-semibold">Chat with us on WhatsApp!</p>
          <button
            onClick={handleChat}
            className="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded transition-colors font-bold"
          >
            Start Chat
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="bg-green-500 hover:bg-green-600 text-white p-3 rounded-full shadow-lg transition-colors flex items-center justify-center"
        aria-label="Open WhatsApp chat"
      >
        {/* WhatsApp SVG Icon */}
        <svg className="w-7 h-7" viewBox="0 0 32 32" fill="currentColor">
          <path d="M16 3C9.373 3 4 8.373 4 15c0 2.385.832 4.584 2.236 6.387L4 29l7.828-2.05A11.94 11.94 0 0016 27c6.627 0 12-5.373 12-12S22.627 3 16 3zm0 22c-1.77 0-3.45-.46-4.91-1.26l-.35-.2-4.65 1.22 1.24-4.53-.23-.36A9.94 9.94 0 016 15c0-5.514 4.486-10 10-10s10 4.486 10 10-4.486 10-10 10zm5.13-7.47c-.28-.14-1.65-.81-1.9-.9-.25-.09-.43-.14-.61.14-.18.28-.7.9-.86 1.08-.16.18-.32.2-.6.07-.28-.14-1.18-.44-2.25-1.41-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.34.42-.51.14-.17.18-.29.28-.48.09-.19.05-.36-.02-.5-.07-.14-.61-1.47-.83-2.01-.22-.53-.45-.46-.61-.47-.16-.01-.35-.01-.54-.01-.19 0-.5.07-.76.34-.26.27-1 1-.97 2.43.03 1.43 1.03 2.81 1.18 3.01.15.2 2.03 3.1 4.93 4.23.69.29 1.23.46 1.65.59.69.22 1.32.19 1.82.12.56-.08 1.65-.67 1.89-1.32.23-.65.23-1.21.16-1.32-.07-.11-.25-.18-.53-.32z"/>
        </svg>
      </button>
    </div>
  );
};

export default WhatsAppChatWidget;