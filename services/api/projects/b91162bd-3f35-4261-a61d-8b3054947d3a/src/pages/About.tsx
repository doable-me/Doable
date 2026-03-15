const values = [
  { emoji: "🤖", title: "AI-first", desc: "Built from the ground up to leverage large language models for code generation." },
  { emoji: "🔒", title: "Secure", desc: "Your projects and data are private. We never share or train on your code." },
  { emoji: "🌍", title: "Open ecosystem", desc: "Standard Vite + React + TypeScript — no lock-in, full ownership." },
];

export default function About() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-20">
        {/* Header */}
        <div className="mb-14">
          <span className="text-indigo-600 font-semibold text-sm uppercase tracking-widest">About us</span>
          <h1 className="text-4xl font-extrabold text-gray-900 mt-2 mb-4 tracking-tight">
            Built for makers who move fast
          </h1>
          <p className="text-lg text-gray-500 leading-relaxed max-w-2xl">
            Doable is an AI-powered app builder. Describe what you want, and the assistant
            generates production-ready code — instantly. We handle the boilerplate so you
            can focus on what actually matters.
          </p>
        </div>

        {/* Values */}
        <div className="grid sm:grid-cols-3 gap-6 mb-16">
          {values.map(({ emoji, title, desc }) => (
            <div key={title} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="text-3xl mb-3">{emoji}</div>
              <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Quote */}
        <blockquote className="border-l-4 border-indigo-500 pl-6 py-2">
          <p className="text-xl font-medium text-gray-700 italic leading-relaxed">
            "The best code is the code you don't have to write yourself."
          </p>
          <cite className="block mt-3 text-sm text-gray-400 not-italic">— The Doable Team</cite>
        </blockquote>
      </div>
    </div>
  );
}
