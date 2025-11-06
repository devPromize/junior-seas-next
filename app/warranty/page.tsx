export default function WarrantyPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6 md:px-16">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-md p-8 md:p-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Warranty Information
        </h1>
        <p className="text-gray-700 leading-relaxed mb-4">
          Our products are sourced from their respective brands to ensure that
          every single item is guaranteed authentic. It’s simply not possible to
          purchase a fake item from this store. Our products are always quality
          and authenticity guaranteed! 💯
        </p>
        <p className="text-gray-700 leading-relaxed mb-8">
          All phones we sell come with warranty. The kind of warranty varies by
          the products and the product type.
        </p>

        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          Types of Warranty Coverage
        </h2>
        <ul className="list-disc list-inside text-gray-700 mb-8 space-y-1">
          <li>Nigerian Warranty</li>
          <li>Apple Warranty</li>
          <li>Samsung Warranty</li>
          <li>UK Used Warranty</li>
        </ul>

        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Nigerian Warranty
          </h2>
          <p className="text-gray-700 leading-relaxed">
            These are offered by brands that have a Nigerian presence on
            products they release in Nigeria. Often, some products are launched
            globally or regionally by a brand but don’t get released locally.
            Products officially released in Nigeria by these brands always come
            with Nigerian Warranty. This warranty varies from brand to brand and
            is covered by them individually.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Apple Warranty
          </h2>
          <p className="text-gray-700 leading-relaxed">
            Every brand new iPhone comes with one year of hardware repair
            coverage from Apple through its limited warranty and up to 90 days
            of complimentary technical support. The Apple Limited Warranty
            covers your iPhone and Apple-branded accessories against
            manufacturing defects for one year from the date of purchase. This
            warranty is in addition to rights provided by consumer law.
          </p>
          <p className="text-gray-700 leading-relaxed mt-3">
            Apple warranty doesn’t cover damage caused by accidents or
            unauthorized modifications. You can check your coverage status
            online and update your proof-of-purchase information if needed. If
            the repair isn’t covered, you’ll pay out-of-warranty fees.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Samsung Warranty
          </h2>
          <p className="text-gray-700 leading-relaxed">
            This warranty covers imported Samsung phones—those not released in
            the Nigerian market. These devices are usually single SIM. Imported
            versions of locally released Samsung phones also come with global
            warranty coverage, although it may be more limited than the Nigerian
            warranty.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            UK Used Warranty
          </h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            We offer a limited warranty on UK Used products. There is a 3-day
            return period for:
          </p>
          <ul className="list-disc list-inside text-gray-700 mb-4 space-y-1">
            <li>Camera (Portrait Mode)</li>
            <li>Mouthpiece</li>
            <li>Network (SIM lock, No SIM)</li>
            <li>Overheating</li>
          </ul>
          <p className="text-gray-700 leading-relaxed mb-3">
            There is also a 7-day warranty for other issues like:
          </p>
          <ul className="list-disc list-inside text-gray-700 mb-4 space-y-1">
            <li>Charging Port</li>
            <li>Power (if not tampered)</li>
            <li>Speaker</li>
            <li>Earpiece</li>
          </ul>
          <p className="text-gray-700 leading-relaxed">
            We run quality tests on all UK Used phones before delivery to ensure
            proper functionality. Our warranty doesn’t cover physical,
            accidental, or intentional damage.
          </p>
        </section>
      </div>
    </main>
  );
}
