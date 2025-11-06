'use client';
import React from 'react';

export default function TermsPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-12 text-gray-800">
      <h1 className="text-3xl md:text-4xl font-bold mb-6 text-gray-900">Terms of Service</h1>
      <p className="mb-4">
        Welcome to our website. By accessing or using our services, you agree to be bound by these Terms of Service.
      </p>

      <section className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h2>
          <p>
            By using our platform, you acknowledge that you have read, understood, and agreed to comply with these terms and all applicable laws.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">2. User Responsibilities</h2>
          <p>
            You agree to use our website for lawful purposes only and to refrain from engaging in activities that could harm, disable, or interfere with our platform’s operations.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">3. Intellectual Property</h2>
          <p>
            All content, trademarks, and materials displayed on this website are the property of our company or licensed to us. You may not reproduce or distribute any material without permission.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">4. Limitation of Liability</h2>
          <p>
            We are not responsible for any damages resulting from the use or inability to use our website, including loss of data or profits.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">5. Changes to Terms</h2>
          <p>
            We reserve the right to modify these terms at any time. Continued use of the website after updates constitutes your acceptance of the revised terms.
          </p>
        </div>
      </section>

      <p className="mt-8 text-sm text-gray-600">Last updated: November 2025</p>
    </main>
  );
}
