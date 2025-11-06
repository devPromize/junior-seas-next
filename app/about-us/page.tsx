export default function AboutUsPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6 md:px-16">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-md p-8 md:p-12 space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">About Us</h1>
        <p className="text-gray-700 leading-relaxed">
          Junior Seas Technologies is a trusted electronics and gadgets store committed 
          to providing quality devices and accessories at fair prices. 
          We combine technology, trust, and top-notch customer service to ensure 
          you always get value for your money.
        </p>
        <p className="text-gray-700 leading-relaxed">
          From smartphones to accessories, we source authentic products from 
          reputable brands, ensuring your satisfaction and peace of mind.
        </p>

        <div className="mt-10">
          <h2 className="text-2xl font-semibold text-gray-900 mb-3">Our Location</h2>
<iframe
  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3941.545388742035!2d7.030946214789723!3d5.486259635043783!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x1043f3d5c066f3e7%3A0x9cddf8abf9b9d5a4!2sNo%2020%20Uratta%2FMann%20Street%2C%20Off%20Wetheral%20Road%2C%20Owerri%2C%20Imo%20State!5e0!3m2!1sen!2sng!4v1730750400000!5m2!1sen!2sng"
  width="100%"
  height="350"
  style={{ border: 0 }}
  allowFullScreen={true}
  loading="lazy"
  referrerPolicy="no-referrer-when-downgrade"
  className="rounded-xl shadow-sm"
/>
        </div>
      </div>
    </main>
  );
}
