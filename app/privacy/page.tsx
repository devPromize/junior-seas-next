'use client';
import React from 'react';

export default function PrivacyPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-12 text-gray-800">
      <h1 className="text-3xl md:text-4xl font-bold mb-6 text-gray-900">Privacy Policy</h1>
      <p className="mb-4">
        Your privacy is important to us. This Privacy Policy explains how we collect, use, and protect your information when you use our website.
      </p>

      <section className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold mb-2">1. Information We Collect</h2>
          <p>
            We may collect personal information such as your name, email address, and contact details when you interact with our services or contact forms.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">2. How We Use Your Information</h2>
          <p>
            We use your data to improve user experience, process inquiries, and communicate updates. We do not sell or share your information with third parties without consent.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">3. Data Security</h2>
          <p>
            We implement appropriate measures to protect your data from unauthorized access, alteration, or disclosure. However, no method of transmission over the Internet is completely secure.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">4. Your Rights</h2>
          <p>
            You have the right to access, correct, or delete your personal data. You may also opt out of marketing communications at any time.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">5. Updates to This Policy</h2>
          <p>
            We may update this policy periodically. Changes will be posted on this page with an updated revision date.
          </p>
        </div>
      </section>

      <p className="mt-8 text-sm text-gray-600">Last updated: November 2025</p>
    </main>
  );
}
