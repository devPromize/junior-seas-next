import Link from 'next/link';
import React from 'react';

const NotFound = () => {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-extrabold text-gray-300 mb-4">
          404
        </h1>

        <h2 className="text-2xl font-semibold text-gray-800 mb-2">
          Page not found
        </h2>

        <p className="text-gray-600 mb-6">
          Sorry, the page you’re looking for doesn’t exist or may have been moved.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 rounded-md 
                       bg-(--color-navyBlue) text-white font-medium 
                       hover:opacity-90 transition"
          >
            Go back home
          </Link>

          <Link
            href="/"
            className="text-sm text-gray-500 underline hover:text-gray-700 transition"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
