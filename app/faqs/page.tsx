export default function FaqsPage() {
  const faqs = [
    {
      q: 'How long does delivery take?',
      a: 'Delivery usually takes 1–5 working days depending on your location.',
    },
    {
      q: 'Do you offer warranty on all products?',
      a: 'Yes. Every phone and accessory sold comes with a valid warranty.',
    },
    {
      q: 'Can I return a product after purchase?',
      a: 'Yes, within the return window if the product is defective or incorrect.',
    },
    {
      q: 'Do you deliver outside Owerri?',
      a: 'Yes, we deliver nationwide through trusted logistics partners.',
    },
  ];

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6 md:px-16">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-md p-8 md:p-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h1>
        <div className="space-y-6">
          {faqs.map(({ q, a }) => (
            <div key={q} className="border-b border-gray-200 pb-4">
              <h2 className="text-lg font-semibold text-gray-900">{q}</h2>
              <p className="text-gray-700 mt-2">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
