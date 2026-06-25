'use client';
import React from 'react';

export default function CookiesPage() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-12 text-gray-800">
      <h1 className="text-3xl md:text-4xl font-bold mb-6 text-gray-900">Cookies Policy</h1>
      <p className="mb-4">
        This Cookies Policy explains how we use cookies and similar technologies on our website.
      </p>

      <section className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold mb-2">1. What Are Cookies?</h2>
          <p>
            Cookies are small text files placed on your device to help us improve your experience, analyze traffic, and personalize content.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">2. How We Use Cookies</h2>
          <p>
            We use cookies to remember preferences, enhance functionality, and gather analytical data on how users interact with our site.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">3. Managing Cookies</h2>
          <p>
            You can control or delete cookies through your browser settings. Disabling certain cookies may affect how the site functions.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">4. Third-Party Cookies</h2>
          <p>
            We may use third-party analytics tools (like Google Analytics) to help us understand website performance and visitor behavior.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">5. Updates to This Policy</h2>
          <p>
            We may update this Cookies Policy periodically. Continued use of our site implies acceptance of any changes.
          </p>
        </div>
      </section>

      <p className="mt-8 text-sm text-gray-600">Last updated: June 2026</p>
    </main>
  );
}
