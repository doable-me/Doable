import type { Metadata } from "next";
import {
  Coffee,
  MapPin,
  Clock,
  Phone,
  Mail,
  Instagram,
  Facebook,
  Star,
  Leaf,
  Heart,
  Droplets,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Brew Haven – A Coffee Shop Worth Finding",
  description:
    "Handcrafted coffee, cozy atmosphere, and community at the heart of every cup. Visit Brew Haven today.",
};

const menuItems = [
  {
    category: "Espresso",
    items: [
      { name: "Signature Espresso", price: "$3.50", desc: "Rich, bold, and velvety smooth" },
      { name: "Cortado", price: "$4.00", desc: "Equal parts espresso and steamed milk" },
      { name: "Haven Latte", price: "$5.25", desc: "Our house blend with oat milk foam" },
      { name: "Caramel Macchiato", price: "$5.75", desc: "Vanilla, espresso, caramel drizzle" },
    ],
  },
  {
    category: "Pour Over",
    items: [
      { name: "Ethiopian Yirgacheffe", price: "$6.00", desc: "Bright citrus and floral notes" },
      { name: "Colombian Single Origin", price: "$5.50", desc: "Chocolate and caramel undertones" },
      { name: "Seasonal Blend", price: "$5.75", desc: "Ask your barista what's brewing" },
      { name: "Cold Brew", price: "$5.00", desc: "Steeped 18 hours, served over ice" },
    ],
  },
  {
    category: "Bites",
    items: [
      { name: "Almond Croissant", price: "$4.25", desc: "Flaky, buttery, locally baked" },
      { name: "Avocado Toast", price: "$7.50", desc: "Sourdough, sea salt, chili flakes" },
      { name: "Oat Cookie", price: "$3.00", desc: "Chewy with dark chocolate chunks" },
      { name: "Banana Bread", price: "$3.75", desc: "Made fresh every morning" },
    ],
  },
];

const values = [
  {
    icon: Leaf,
    title: "Sustainably Sourced",
    desc: "Every bean is ethically farmed and directly traded from small-batch growers we know by name.",
  },
  {
    icon: Heart,
    title: "Community First",
    desc: "We host open mics, art shows, and study nights — your local living room with better espresso.",
  },
  {
    icon: Droplets,
    title: "Crafted with Care",
    desc: "Our baristas train for months. Every cup is pulled, poured, and presented with intention.",
  },
];

const testimonials = [
  {
    name: "Mia T.",
    stars: 5,
    text: "Brew Haven is my Monday morning ritual. The Haven Latte is absolutely unreal — I've tried to recreate it at home and failed every time. Thankfully they're only two blocks away.",
  },
  {
    name: "James R.",
    stars: 5,
    text: "Finally a coffee shop that takes pour-over seriously. The Ethiopian is complex and clean. Staff are knowledgeable without being pretentious. 10/10.",
  },
  {
    name: "Sofia L.",
    stars: 5,
    text: "I wrote half my novel here. The vibe is perfect — warm lighting, great music, and nobody rushes you. Plus the almond croissants are a spiritual experience.",
  },
];

export default function BrewHavenPage() {
  return (
    <div className="min-h-screen bg-[#fdf6ee] text-[#2c1810]" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>

      {/* ─── Navbar ──────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-[#e8d5b7] bg-[#fdf6ee]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#5c3d2e]">
              <Coffee className="h-5 w-5 text-[#f5d9a8]" />
            </div>
            <span className="text-xl font-bold tracking-tight text-[#2c1810]">Brew Haven</span>
          </div>

          <div className="hidden items-center gap-8 md:flex">
            {["Our Story", "Menu", "Reviews", "Visit Us"].map((link) => (
              <a
                key={link}
                href={`#${link.toLowerCase().replace(" ", "-")}`}
                className="text-sm text-[#7a5c4a] transition-colors hover:text-[#2c1810]"
                style={{ fontFamily: "system-ui, sans-serif" }}
              >
                {link}
              </a>
            ))}
          </div>

          <a
            href="#visit-us"
            className="rounded-full bg-[#5c3d2e] px-5 py-2 text-sm font-medium text-[#f5d9a8] transition-colors hover:bg-[#3d2419]"
            style={{ fontFamily: "system-ui, sans-serif" }}
          >
            Find Us
          </a>
        </div>
      </nav>

      {/* ─── Hero ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Warm gradient backdrop */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#3d2419] via-[#5c3d2e] to-[#7a5240]" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djZoNnYtNmgtNnptMCAwdi02aC02djZoNnptNiAwaDZ2LTZoLTZ2NnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />

        <div className="relative mx-auto max-w-6xl px-4 py-32 text-center sm:px-6 sm:py-40 lg:px-8">
          <p className="mb-4 text-sm uppercase tracking-[0.25em] text-[#f5d9a8]/70" style={{ fontFamily: "system-ui, sans-serif" }}>
            Est. 2019 · Handcrafted Coffee
          </p>
          <h1 className="mb-6 text-5xl font-bold leading-tight text-[#fdf6ee] sm:text-6xl lg:text-7xl">
            Your perfect cup<br />
            <span className="italic text-[#f5d9a8]">awaits you.</span>
          </h1>
          <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-[#f5d9a8]/80" style={{ fontFamily: "system-ui, sans-serif" }}>
            Slow mornings, bold espresso, and a corner that feels like yours.
            Brew Haven is the neighborhood coffee shop you've been looking for.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#menu"
              className="rounded-full bg-[#f5d9a8] px-8 py-3.5 text-sm font-semibold text-[#2c1810] transition-colors hover:bg-[#fdf6ee]"
              style={{ fontFamily: "system-ui, sans-serif" }}
            >
              See Our Menu
            </a>
            <a
              href="#our-story"
              className="rounded-full border border-[#f5d9a8]/40 px-8 py-3.5 text-sm font-medium text-[#f5d9a8] transition-colors hover:border-[#f5d9a8]/80"
              style={{ fontFamily: "system-ui, sans-serif" }}
            >
              Our Story
            </a>
          </div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 60L1440 60L1440 20C1200 55 960 5 720 30C480 55 240 5 0 20L0 60Z" fill="#fdf6ee" />
          </svg>
        </div>
      </section>

      {/* ─── Values ──────────────────────────────────────────────── */}
      <section id="our-story" className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="mb-3 text-sm uppercase tracking-widest text-[#a0754d]" style={{ fontFamily: "system-ui, sans-serif" }}>Our Story</p>
              <h2 className="mb-6 text-4xl font-bold leading-snug text-[#2c1810]">
                A place to slow<br />down and savor.
              </h2>
              <p className="mb-4 text-[#5a3f31] leading-relaxed" style={{ fontFamily: "system-ui, sans-serif" }}>
                Brew Haven started as a dream sketched on a napkin in 2019 — a neighborhood coffee shop that treated its beans, its baristas, and its guests with equal care. Today, we're proud to be a gathering place for writers, remote workers, first dates, and old friends.
              </p>
              <p className="text-[#5a3f31] leading-relaxed" style={{ fontFamily: "system-ui, sans-serif" }}>
                We partner directly with family-owned farms across Ethiopia, Colombia, and Guatemala. Every roast is dialed in weekly, so what's in your cup is always at peak flavor.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {values.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex gap-4 rounded-2xl border border-[#e8d5b7] bg-white/60 p-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#5c3d2e]">
                    <Icon className="h-5 w-5 text-[#f5d9a8]" />
                  </div>
                  <div>
                    <h3 className="mb-1 font-bold text-[#2c1810]">{title}</h3>
                    <p className="text-sm leading-relaxed text-[#7a5c4a]" style={{ fontFamily: "system-ui, sans-serif" }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Menu ────────────────────────────────────────────────── */}
      <section id="menu" className="border-t border-[#e8d5b7] bg-[#f7ede0] py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 text-center">
            <p className="mb-3 text-sm uppercase tracking-widest text-[#a0754d]" style={{ fontFamily: "system-ui, sans-serif" }}>What We Serve</p>
            <h2 className="text-4xl font-bold text-[#2c1810]">Our Menu</h2>
            <p className="mx-auto mt-3 max-w-md text-[#7a5c4a]" style={{ fontFamily: "system-ui, sans-serif" }}>
              Seasonal. Fresh. Always made to order.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {menuItems.map((section) => (
              <div key={section.category} className="rounded-2xl border border-[#e8d5b7] bg-white/80 p-6">
                <h3 className="mb-5 border-b border-[#e8d5b7] pb-3 text-lg font-bold text-[#2c1810]">
                  {section.category}
                </h3>
                <ul className="space-y-4">
                  {section.items.map((item) => (
                    <li key={item.name} className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#2c1810] text-sm">{item.name}</p>
                        <p className="text-xs text-[#9a7060]" style={{ fontFamily: "system-ui, sans-serif" }}>{item.desc}</p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-[#a0754d]">{item.price}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Reviews ─────────────────────────────────────────────── */}
      <section id="reviews" className="py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 text-center">
            <p className="mb-3 text-sm uppercase tracking-widest text-[#a0754d]" style={{ fontFamily: "system-ui, sans-serif" }}>Kind Words</p>
            <h2 className="text-4xl font-bold text-[#2c1810]">What Guests Say</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <div key={t.name} className="rounded-2xl border border-[#e8d5b7] bg-white/70 p-6">
                <div className="mb-3 flex">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-[#f0a500] text-[#f0a500]" />
                  ))}
                </div>
                <p className="mb-5 text-sm leading-relaxed text-[#5a3f31]" style={{ fontFamily: "system-ui, sans-serif" }}>
                  &ldquo;{t.text}&rdquo;
                </p>
                <p className="text-sm font-bold text-[#2c1810]">— {t.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Visit Us ────────────────────────────────────────────── */}
      <section id="visit-us" className="border-t border-[#e8d5b7] bg-[#3d2419] py-24 text-[#f5d9a8]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
            <div>
              <p className="mb-3 text-sm uppercase tracking-widest text-[#f5d9a8]/60" style={{ fontFamily: "system-ui, sans-serif" }}>Come See Us</p>
              <h2 className="mb-6 text-4xl font-bold text-[#fdf6ee]">Find Your Haven</h2>
              <p className="mb-10 text-[#f5d9a8]/80 leading-relaxed" style={{ fontFamily: "system-ui, sans-serif" }}>
                We're nestled right in the heart of the neighborhood. Bring your laptop, your journal, or just yourself — there's always a warm seat and a perfect cup waiting.
              </p>

              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#f5d9a8]/70" />
                  <div>
                    <p className="font-semibold text-[#fdf6ee]">Address</p>
                    <p className="text-sm text-[#f5d9a8]/70" style={{ fontFamily: "system-ui, sans-serif" }}>142 Maple Street, Brooklyn, NY 11201</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#f5d9a8]/70" />
                  <div>
                    <p className="font-semibold text-[#fdf6ee]">Hours</p>
                    <p className="text-sm text-[#f5d9a8]/70" style={{ fontFamily: "system-ui, sans-serif" }}>Mon – Fri: 7am – 7pm</p>
                    <p className="text-sm text-[#f5d9a8]/70" style={{ fontFamily: "system-ui, sans-serif" }}>Sat – Sun: 8am – 6pm</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-5 w-5 shrink-0 text-[#f5d9a8]/70" />
                  <div>
                    <p className="font-semibold text-[#fdf6ee]">Phone</p>
                    <p className="text-sm text-[#f5d9a8]/70" style={{ fontFamily: "system-ui, sans-serif" }}>(718) 555-0192</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[#f5d9a8]/70" />
                  <div>
                    <p className="font-semibold text-[#fdf6ee]">Email</p>
                    <p className="text-sm text-[#f5d9a8]/70" style={{ fontFamily: "system-ui, sans-serif" }}>hello@brewhaven.coffee</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Map placeholder */}
            <div className="overflow-hidden rounded-2xl border border-[#f5d9a8]/10">
              <div className="flex h-72 items-center justify-center bg-[#2c1810] lg:h-full lg:min-h-[340px]">
                <div className="text-center">
                  <MapPin className="mx-auto mb-3 h-10 w-10 text-[#f5d9a8]/40" />
                  <p className="text-sm text-[#f5d9a8]/50" style={{ fontFamily: "system-ui, sans-serif" }}>142 Maple Street, Brooklyn</p>
                  <a
                    href="https://maps.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block rounded-full border border-[#f5d9a8]/30 px-4 py-1.5 text-xs text-[#f5d9a8]/70 transition-colors hover:border-[#f5d9a8]/60 hover:text-[#f5d9a8]"
                    style={{ fontFamily: "system-ui, sans-serif" }}
                  >
                    Open in Maps ↗
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-[#2c1810]/20 bg-[#2c1810] py-10 text-[#f5d9a8]/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f5d9a8]/10">
                <Coffee className="h-4 w-4 text-[#f5d9a8]" />
              </div>
              <span className="text-sm font-semibold text-[#f5d9a8]">Brew Haven</span>
            </div>

            <p className="text-xs" style={{ fontFamily: "system-ui, sans-serif" }}>
              © {new Date().getFullYear()} Brew Haven. All rights reserved.
            </p>

            <div className="flex gap-4">
              {[
                { Icon: Instagram, label: "Instagram" },
                { Icon: Facebook, label: "Facebook" },
              ].map(({ Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="transition-colors hover:text-[#f5d9a8]"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
