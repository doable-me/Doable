/**
 * Template preview body generators.
 * Each function returns an HTML string for a specific template preview.
 */

import type { TemplateDefinition } from "./registry.js";

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function landingPagePreview(): string {
  return `
  <!-- Navbar -->
  <header class="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur">
    <div class="container mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
      <span class="text-xl font-bold">Brand</span>
      <nav class="hidden md:flex items-center gap-6 text-sm">
        <a href="#" class="text-gray-500 hover:text-gray-900 transition-colors">Features</a>
        <a href="#" class="text-gray-500 hover:text-gray-900 transition-colors">Pricing</a>
        <a href="#" class="text-gray-500 hover:text-gray-900 transition-colors">Testimonials</a>
      </nav>
      <div class="flex items-center gap-3">
        <button class="text-sm font-medium text-gray-500 hover:text-gray-900">Sign In</button>
        <button class="inline-flex h-9 items-center justify-center rounded-md bg-purple-600 px-4 text-sm font-medium text-white hover:bg-purple-700 transition-colors">Get Started</button>
      </div>
    </div>
  </header>

  <!-- Hero -->
  <section class="container mx-auto max-w-6xl px-4 py-24 md:py-32 text-center">
    <div class="mx-auto max-w-3xl space-y-6">
      <div class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-gray-500">Now in public beta</div>
      <h1 class="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
        Build something <span class="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">remarkable</span>
      </h1>
      <p class="mx-auto max-w-xl text-lg text-gray-500">
        The fastest way to launch your next project. Built with modern tools and best practices.
      </p>
      <div class="flex flex-col sm:flex-row gap-3 justify-center">
        <button class="inline-flex h-11 items-center justify-center rounded-md bg-purple-600 px-8 text-sm font-medium text-white hover:bg-purple-700 transition-colors">Start Building Free</button>
        <button class="inline-flex h-11 items-center justify-center rounded-md border border-gray-300 px-8 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">View Demo</button>
      </div>
    </div>
  </section>

  <!-- Features -->
  <section class="container mx-auto max-w-6xl px-4 py-20 border-t">
    <div class="text-center mb-12">
      <h2 class="text-3xl font-bold">Everything you need</h2>
      <p class="mt-3 text-gray-500 max-w-lg mx-auto">Built with best practices and modern tools to help you ship faster.</p>
    </div>
    <div class="grid md:grid-cols-3 gap-8">
      ${[
        { icon: "⚡", title: "Lightning Fast", desc: "Optimized for performance with lazy loading and code splitting." },
        { icon: "🛡️", title: "Secure by Default", desc: "Built-in security best practices to keep your data safe." },
        { icon: "🌍", title: "Global Scale", desc: "Deploy worldwide with edge computing and CDN support." },
        { icon: "📦", title: "Component Library", desc: "Pre-built, accessible components ready to use." },
        { icon: "💻", title: "Developer First", desc: "Clean API, great docs, and TypeScript support." },
        { icon: "✨", title: "AI Powered", desc: "Built-in AI features to supercharge your workflow." },
      ].map(f => `
        <div class="rounded-xl border bg-white p-6 hover:shadow-md transition-shadow">
          <div class="text-2xl mb-3">${f.icon}</div>
          <h3 class="font-semibold mb-2">${f.title}</h3>
          <p class="text-sm text-gray-500">${f.desc}</p>
        </div>
      `).join("")}
    </div>
  </section>

  <!-- Pricing -->
  <section class="container mx-auto max-w-6xl px-4 py-20 border-t">
    <div class="text-center mb-12">
      <h2 class="text-3xl font-bold">Simple pricing</h2>
      <p class="mt-3 text-gray-500">No hidden fees. Cancel anytime.</p>
    </div>
    <div class="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
      ${[
        { name: "Starter", price: "Free", features: ["5 projects", "1GB storage", "Community support"], highlight: false },
        { name: "Pro", price: "$29", features: ["Unlimited projects", "100GB storage", "Priority support", "Custom domains", "Analytics"], highlight: true },
        { name: "Enterprise", price: "$99", features: ["Everything in Pro", "SSO / SAML", "Dedicated support", "SLA guarantee", "Custom integrations"], highlight: false },
      ].map(p => `
        <div class="rounded-xl border ${p.highlight ? "border-purple-600 ring-2 ring-purple-600/20 relative" : ""} bg-white p-6 flex flex-col">
          ${p.highlight ? '<span class="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-medium px-3 py-1 rounded-full">Popular</span>' : ""}
          <h3 class="font-semibold text-lg">${p.name}</h3>
          <div class="mt-4 mb-6"><span class="text-4xl font-bold">${p.price}</span>${p.price !== "Free" ? '<span class="text-gray-500 text-sm">/month</span>' : ""}</div>
          <ul class="space-y-2 flex-1">
            ${p.features.map(f => `<li class="flex items-center gap-2 text-sm text-gray-600"><svg class="h-4 w-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>${f}</li>`).join("")}
          </ul>
          <button class="mt-6 w-full h-10 rounded-md text-sm font-medium ${p.highlight ? "bg-purple-600 text-white hover:bg-purple-700" : "border text-gray-700 hover:bg-gray-50"} transition-colors">Get Started</button>
        </div>
      `).join("")}
    </div>
  </section>

  <!-- Footer -->
  <footer class="border-t bg-gray-50 py-12">
    <div class="container mx-auto max-w-6xl px-4 text-center text-sm text-gray-500">
      <p>&copy; 2026 Brand. All rights reserved.</p>
    </div>
  </footer>`;
}

export function saasDashboardPreview(): string {
  return `
  <div class="flex h-screen">
    <!-- Sidebar -->
    <aside class="w-60 bg-gray-900 text-white flex flex-col">
      <div class="p-4 border-b border-gray-800">
        <h1 class="text-lg font-bold">Dashboard</h1>
      </div>
      <nav class="flex-1 p-3 space-y-1">
        ${["Overview", "Analytics", "Users", "Products", "Settings"].map((item, i) => `
          <a href="#" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${i === 0 ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"} transition-colors">
            ${item}
          </a>
        `).join("")}
      </nav>
      <div class="p-4 border-t border-gray-800">
        <div class="flex items-center gap-3">
          <div class="h-8 w-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">JD</div>
          <div class="text-sm"><div class="font-medium">John Doe</div><div class="text-xs text-gray-500">admin@company.com</div></div>
        </div>
      </div>
    </aside>

    <!-- Main -->
    <main class="flex-1 overflow-y-auto bg-gray-50">
      <div class="p-8">
        <div class="mb-8"><h2 class="text-2xl font-bold">Overview</h2><p class="text-gray-500 text-sm mt-1">Welcome back, John</p></div>

        <!-- Stats -->
        <div class="grid grid-cols-4 gap-4 mb-8">
          ${[
            { label: "Total Revenue", value: "$45,231", change: "+20.1%", color: "text-green-600" },
            { label: "Subscriptions", value: "+2,350", change: "+18.2%", color: "text-green-600" },
            { label: "Active Users", value: "12,234", change: "+5.4%", color: "text-green-600" },
            { label: "Churn Rate", value: "2.4%", change: "-0.5%", color: "text-red-600" },
          ].map(s => `
            <div class="rounded-xl border bg-white p-5">
              <p class="text-sm text-gray-500">${s.label}</p>
              <p class="text-2xl font-bold mt-1">${s.value}</p>
              <p class="text-xs ${s.color} mt-1">${s.change} from last month</p>
            </div>
          `).join("")}
        </div>

        <!-- Chart area -->
        <div class="rounded-xl border bg-white p-6 mb-8">
          <h3 class="font-semibold mb-4">Revenue Overview</h3>
          <div class="h-48 flex items-end gap-2">
            ${[35, 45, 30, 55, 40, 65, 50, 75, 60, 80, 70, 90].map(h => `
              <div class="flex-1 bg-purple-100 hover:bg-purple-200 rounded-t transition-colors" style="height: ${h}%"></div>
            `).join("")}
          </div>
          <div class="flex justify-between mt-2 text-xs text-gray-400">
            ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(m => `<span>${m}</span>`).join("")}
          </div>
        </div>

        <!-- Recent -->
        <div class="rounded-xl border bg-white">
          <div class="p-5 border-b"><h3 class="font-semibold">Recent Transactions</h3></div>
          ${[
            { name: "Alice Johnson", email: "alice@example.com", amount: "+$250.00" },
            { name: "Bob Smith", email: "bob@example.com", amount: "+$120.00" },
            { name: "Carol White", email: "carol@example.com", amount: "+$450.00" },
          ].map(t => `
            <div class="flex items-center justify-between p-4 border-b last:border-0">
              <div class="flex items-center gap-3">
                <div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold">${t.name[0]}</div>
                <div><div class="text-sm font-medium">${t.name}</div><div class="text-xs text-gray-500">${t.email}</div></div>
              </div>
              <span class="text-sm font-medium text-green-600">${t.amount}</span>
            </div>
          `).join("")}
        </div>
      </div>
    </main>
  </div>`;
}

export function ecommercePreview(): string {
  return `
  <!-- Nav -->
  <header class="border-b bg-white">
    <div class="container mx-auto max-w-6xl flex items-center justify-between px-4 h-16">
      <span class="text-xl font-bold">STORE</span>
      <nav class="flex items-center gap-6 text-sm">
        <a href="#" class="text-gray-500 hover:text-gray-900">Women</a>
        <a href="#" class="text-gray-500 hover:text-gray-900">Men</a>
        <a href="#" class="text-gray-900 font-medium">New Arrivals</a>
        <a href="#" class="text-red-600 font-medium">Sale</a>
      </nav>
      <div class="flex items-center gap-4">
        <button class="text-gray-500">🔍</button>
        <button class="text-gray-500 relative">🛒<span class="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center">3</span></button>
      </div>
    </div>
  </header>

  <!-- Hero banner -->
  <section class="bg-gradient-to-r from-gray-900 to-gray-700 text-white py-16">
    <div class="container mx-auto max-w-6xl px-4 text-center">
      <h1 class="text-4xl font-bold mb-3">Spring Collection 2026</h1>
      <p class="text-gray-300 mb-6">Discover our latest arrivals</p>
      <button class="bg-white text-gray-900 px-8 py-3 rounded-md font-medium hover:bg-gray-100 transition-colors">Shop Now</button>
    </div>
  </section>

  <!-- Products -->
  <section class="container mx-auto max-w-6xl px-4 py-12">
    <h2 class="text-2xl font-bold mb-6">Featured Products</h2>
    <div class="grid grid-cols-4 gap-6">
      ${[
        { name: "Classic Tee", price: "$49.00", color: "bg-rose-100" },
        { name: "Denim Jacket", price: "$129.00", color: "bg-sky-100" },
        { name: "Canvas Bag", price: "$79.00", color: "bg-amber-100" },
        { name: "Running Shoes", price: "$159.00", color: "bg-emerald-100" },
        { name: "Wool Sweater", price: "$89.00", color: "bg-violet-100" },
        { name: "Linen Pants", price: "$69.00", color: "bg-pink-100" },
        { name: "Leather Belt", price: "$45.00", color: "bg-orange-100" },
        { name: "Cotton Scarf", price: "$35.00", color: "bg-teal-100" },
      ].map(p => `
        <div class="group cursor-pointer">
          <div class="aspect-[3/4] ${p.color} rounded-xl mb-3 overflow-hidden group-hover:shadow-md transition-shadow"></div>
          <h3 class="text-sm font-medium">${p.name}</h3>
          <p class="text-sm text-gray-500">${p.price}</p>
        </div>
      `).join("")}
    </div>
  </section>`;
}

export function blogPreview(): string {
  return `
  <!-- Header -->
  <header class="border-b bg-white">
    <div class="container mx-auto max-w-4xl flex items-center justify-between px-4 h-16">
      <span class="text-xl font-bold text-orange-600">The Blog</span>
      <nav class="flex items-center gap-6 text-sm">
        <a href="#" class="text-gray-900 font-medium">All Posts</a>
        <a href="#" class="text-gray-500 hover:text-gray-900">Technology</a>
        <a href="#" class="text-gray-500 hover:text-gray-900">Design</a>
        <a href="#" class="text-gray-500 hover:text-gray-900">Business</a>
      </nav>
    </div>
  </header>

  <main class="container mx-auto max-w-4xl px-4 py-12">
    <!-- Featured post -->
    <article class="mb-12 rounded-xl border overflow-hidden hover:shadow-md transition-shadow">
      <div class="h-64 bg-gradient-to-br from-orange-200 to-amber-100"></div>
      <div class="p-6">
        <span class="text-xs font-medium text-orange-600 uppercase">Featured</span>
        <h2 class="text-2xl font-bold mt-2 mb-3">Building the Future of Web Development</h2>
        <p class="text-gray-500 mb-4">Exploring the latest trends and technologies shaping the web development landscape in 2026 and beyond.</p>
        <div class="flex items-center gap-3">
          <div class="h-8 w-8 rounded-full bg-gray-200"></div>
          <div class="text-sm"><span class="font-medium">Sarah Chen</span><span class="text-gray-400 mx-2">·</span><span class="text-gray-400">Mar 15, 2026</span></div>
        </div>
      </div>
    </article>

    <!-- Posts grid -->
    <div class="grid md:grid-cols-2 gap-6">
      ${[
        { title: "10 Tips for Better UI Design", cat: "Design", color: "from-blue-200 to-indigo-100" },
        { title: "Understanding React Server Components", cat: "Technology", color: "from-green-200 to-emerald-100" },
        { title: "The Rise of AI in Development", cat: "Technology", color: "from-purple-200 to-violet-100" },
        { title: "Scaling Your Startup in 2026", cat: "Business", color: "from-red-200 to-rose-100" },
      ].map(p => `
        <article class="rounded-xl border overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
          <div class="h-40 bg-gradient-to-br ${p.color}"></div>
          <div class="p-5">
            <span class="text-xs font-medium text-gray-500 uppercase">${p.cat}</span>
            <h3 class="font-semibold mt-1 mb-2">${p.title}</h3>
            <span class="text-xs text-gray-400">5 min read</span>
          </div>
        </article>
      `).join("")}
    </div>
  </main>`;
}

export function portfolioPreview(): string {
  return `
  <!-- Nav -->
  <header class="border-b bg-white">
    <div class="container mx-auto max-w-5xl flex items-center justify-between px-4 h-16">
      <span class="text-lg font-bold">Alex Morgan</span>
      <nav class="flex items-center gap-6 text-sm">
        <a href="#" class="text-gray-900 font-medium">Work</a>
        <a href="#" class="text-gray-500 hover:text-gray-900">About</a>
        <a href="#" class="text-gray-500 hover:text-gray-900">Skills</a>
        <a href="#" class="text-gray-500 hover:text-gray-900">Contact</a>
      </nav>
    </div>
  </header>

  <!-- Hero -->
  <section class="container mx-auto max-w-5xl px-4 py-24">
    <div class="max-w-2xl">
      <p class="text-sm text-purple-600 font-medium mb-3">Full-Stack Developer & Designer</p>
      <h1 class="text-5xl font-bold leading-tight mb-6">Crafting digital experiences that make a difference</h1>
      <p class="text-lg text-gray-500 mb-8">I build beautiful, performant web applications with a focus on user experience and clean code.</p>
      <div class="flex gap-3">
        <button class="bg-gray-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors">View Work</button>
        <button class="border border-gray-300 px-6 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors">Contact Me</button>
      </div>
    </div>
  </section>

  <!-- Projects -->
  <section class="container mx-auto max-w-5xl px-4 py-12 border-t">
    <h2 class="text-2xl font-bold mb-8">Selected Work</h2>
    <div class="grid md:grid-cols-2 gap-6">
      ${[
        { title: "E-commerce Platform", desc: "Full-stack app with React & Node.js", color: "from-teal-200 to-cyan-100" },
        { title: "Design System", desc: "Component library for enterprise apps", color: "from-violet-200 to-purple-100" },
        { title: "Mobile Banking App", desc: "React Native fintech application", color: "from-amber-200 to-yellow-100" },
        { title: "AI Dashboard", desc: "Analytics platform with ML insights", color: "from-rose-200 to-pink-100" },
      ].map(p => `
        <div class="group rounded-xl overflow-hidden border hover:shadow-lg transition-shadow cursor-pointer">
          <div class="aspect-video bg-gradient-to-br ${p.color}"></div>
          <div class="p-5">
            <h3 class="font-semibold">${p.title}</h3>
            <p class="text-sm text-gray-500 mt-1">${p.desc}</p>
          </div>
        </div>
      `).join("")}
    </div>
  </section>`;
}

export function todoAppPreview(): string {
  return `
  <div class="min-h-screen bg-gray-50">
    <div class="container mx-auto max-w-lg px-4 py-12">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-2xl font-bold">My Tasks</h1>
          <p class="text-sm text-gray-500 mt-1">6 tasks, 2 completed</p>
        </div>
        <button class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-2">
          <span>+</span> Add Task
        </button>
      </div>

      <!-- Filters -->
      <div class="flex gap-2 mb-6">
        <button class="px-4 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-700 border border-green-200">All</button>
        <button class="px-4 py-1.5 rounded-full text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors">Active</button>
        <button class="px-4 py-1.5 rounded-full text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors">Completed</button>
      </div>

      <!-- Tasks -->
      <div class="space-y-2">
        ${[
          { text: "Review pull requests", done: true, priority: "" },
          { text: "Update project documentation", done: true, priority: "" },
          { text: "Design new landing page mockups", done: false, priority: "High" },
          { text: "Fix authentication bug", done: false, priority: "Medium" },
          { text: "Set up CI/CD pipeline", done: false, priority: "" },
          { text: "Write unit tests for API", done: false, priority: "Low" },
        ].map(t => `
          <div class="flex items-center gap-3 bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow">
            <div class="h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 ${t.done ? "bg-green-100 border-green-500" : "border-gray-300"}">
              ${t.done ? '<svg class="h-3 w-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : ""}
            </div>
            <span class="flex-1 text-sm ${t.done ? "line-through text-gray-400" : "text-gray-800"}">${t.text}</span>
            ${t.priority ? `<span class="text-xs px-2 py-0.5 rounded-full ${t.priority === "High" ? "bg-red-100 text-red-600" : t.priority === "Medium" ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"}">${t.priority}</span>` : ""}
          </div>
        `).join("")}
      </div>
    </div>
  </div>`;
}

export function blankPreview(template: TemplateDefinition): string {
  return `
  <div class="min-h-screen flex items-center justify-center">
    <div class="text-center">
      <h1 class="text-3xl font-bold mb-3">${escapeHtml(template.name)}</h1>
      <p class="text-gray-500 max-w-md">${escapeHtml(template.description)}</p>
    </div>
  </div>`;
}
