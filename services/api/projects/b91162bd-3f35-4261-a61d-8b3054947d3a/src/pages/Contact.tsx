import { useState } from "react";

export default function Contact() {
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSent(true);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-20">
        <div className="mb-12">
          <span className="text-indigo-600 font-semibold text-sm uppercase tracking-widest">Contact</span>
          <h1 className="text-4xl font-extrabold text-gray-900 mt-2 mb-3 tracking-tight">Get in touch</h1>
          <p className="text-lg text-gray-500">
            Have questions? We'd love to hear from you. Send us a message and we'll get back to you shortly.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-10 items-start">
          {/* Contact info */}
          <div className="space-y-6">
            {[
              { icon: "✉️", label: "Email", value: "hello@doable.dev" },
              { icon: "🐦", label: "Twitter", value: "@doable_dev" },
              { icon: "📍", label: "Location", value: "Remote, worldwide" },
            ].map(({ icon, label, value }) => (
              <div key={label} className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-lg shrink-0">
                  {icon}
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</div>
                  <div className="text-gray-700 font-medium">{value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Form */}
          {sent ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
              <div className="text-3xl mb-3">🎉</div>
              <h3 className="font-semibold text-green-800 text-lg mb-1">Message sent!</h3>
              <p className="text-green-700 text-sm">Thanks for reaching out. We'll be in touch soon.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-2xl p-7 shadow-sm space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
                <input
                  type="text"
                  required
                  placeholder="Jane Smith"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  placeholder="jane@example.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
                <textarea
                  required
                  rows={4}
                  placeholder="What's on your mind?"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 active:scale-95 transition-all duration-150"
              >
                Send message
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
