import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/40 to-white">
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-20 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-xs font-semibold uppercase tracking-wider mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          AI-powered app builder
        </span>
        <h1 className="text-5xl sm:text-6xl font-extrabold text-gray-900 leading-tight mb-6 tracking-tight">
          Build apps faster<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500">with AI by your side</span>
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-10 leading-relaxed">
          Describe what you want to build. Doable turns your words into production-ready code — instantly.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/contact"
            className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 active:scale-95 transition-all duration-150"
          >
            Get started free
          </Link>
          <Link
            to="/about"
            className="px-6 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 font-semibold text-sm shadow-sm hover:border-indigo-300 hover:text-indigo-600 active:scale-95 transition-all duration-150"
          >
            Learn more →
          </Link>
        </div>
      </section>

      {/* Feature cards */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid sm:grid-cols-3 gap-5">
          {[
            {
              icon: "⚡",
              title: "Instant generation",
              desc: "From prompt to working code in seconds. No waiting, no guessing.",
            },
            {
              icon: "🎨",
              title: "Beautiful by default",
              desc: "Every app comes styled with Tailwind CSS — clean, responsive, modern.",
            },
            {
              icon: "🚀",
              title: "Deploy anywhere",
              desc: "Export your project and deploy to any platform with a single command.",
            },
          ].map(({ icon, title, desc }) => (
            <div
              key={title}
              className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="text-2xl mb-3">{icon}</div>
              <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
