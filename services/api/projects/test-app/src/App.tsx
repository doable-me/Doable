// ─── Menu Data ───────────────────────────────────────────

const menuSections = [
  {
    category: "Espresso Classics",
    icon: "☕",
    items: [
      { name: "Espresso", description: "Rich single or double shot", price: "$3.50" },
      { name: "Americano", description: "Espresso with hot water", price: "$4.00" },
      { name: "Cappuccino", description: "Espresso, steamed milk & foam", price: "$5.00" },
      { name: "Flat White", description: "Velvety microfoam over espresso", price: "$5.50" },
    ],
  },
  {
    category: "Signature Drinks",
    icon: "✨",
    items: [
      { name: "Haven Latte", description: "Vanilla, oat milk & house blend", price: "$6.50" },
      { name: "Caramel Cloud", description: "Caramel, cold foam & sea salt", price: "$7.00" },
      { name: "Spiced Mocha", description: "Dark chocolate, cinnamon & chili", price: "$6.75" },
      { name: "Lavender Mist", description: "Lavender syrup & almond milk", price: "$7.25" },
    ],
  },
  {
    category: "Cold Brews & Teas",
    icon: "🧊",
    items: [
      { name: "Cold Brew", description: "12-hour steep, smooth & bold", price: "$5.50" },
      { name: "Nitro Cold Brew", description: "Nitrogen-infused, creamy finish", price: "$6.00" },
      { name: "Chai Latte", description: "Spiced tea with steamed milk", price: "$5.75" },
      { name: "Matcha Latte", description: "Ceremonial grade, oat or whole milk", price: "$6.25" },
    ],
  },
];

// ─── Sub-components ──────────────────────────────────────

function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-amber-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">☕</span>
          <span className="text-white font-playfair text-xl font-semibold tracking-wide">
            Brew Haven
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          {["Menu", "About", "Contact"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-amber-200 hover:text-white text-sm font-medium tracking-wide transition-colors duration-200"
            >
              {item}
            </a>
          ))}
        </div>
        <a
          href="#contact"
          className="bg-amber-500 hover:bg-amber-400 text-amber-950 text-sm font-semibold px-5 py-2 rounded-full transition-colors duration-200"
        >
          Visit Us
        </a>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, #3b1a08 0%, #6b3010 30%, #92400e 60%, #b45309 100%)",
      }}
    >
      {/* Decorative circles */}
      <div className="absolute top-20 left-10 w-80 h-80 rounded-full bg-amber-700/20 blur-3xl" />
      <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-orange-900/30 blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-amber-800/10 blur-3xl" />

      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-amber-500/20 border border-amber-400/30 text-amber-300 text-sm font-medium px-4 py-2 rounded-full mb-8 tracking-wider uppercase">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          Now Open • Mon–Sun
        </div>

        <h1 className="text-6xl md:text-8xl font-playfair font-bold text-white mb-6 leading-tight">
          Where Every Sip
          <br />
          <span className="text-amber-400 italic">Feels Like Home</span>
        </h1>

        <p className="text-amber-200/80 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed font-light">
          Handcrafted coffees, locally sourced beans, and a warm corner to call
          yours — welcome to Brew Haven.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="#menu"
            className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold px-8 py-4 rounded-full text-lg transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/30 hover:-translate-y-0.5"
          >
            Explore Our Menu
          </a>
          <a
            href="#contact"
            className="border border-amber-400/50 hover:border-amber-400 text-amber-200 hover:text-white font-medium px-8 py-4 rounded-full text-lg transition-all duration-200 hover:-translate-y-0.5"
          >
            Find Us
          </a>
        </div>

        {/* Stats */}
        <div className="mt-20 grid grid-cols-3 gap-8 max-w-sm mx-auto">
          {[
            { value: "15+", label: "Drinks" },
            { value: "8", label: "Years Open" },
            { value: "★ 4.9", label: "Rating" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-amber-400 font-playfair text-2xl font-bold">{stat.value}</div>
              <div className="text-amber-300/60 text-xs uppercase tracking-widest mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-amber-400/60">
        <span className="text-xs tracking-widest uppercase">Scroll</span>
        <div className="w-px h-12 bg-gradient-to-b from-amber-400/60 to-transparent" />
      </div>
    </section>
  );
}

function Menu() {
  return (
    <section id="menu" className="py-24 bg-stone-50">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-amber-700 text-sm font-semibold uppercase tracking-widest mb-3">
            What We Brew
          </p>
          <h2 className="text-5xl font-playfair font-bold text-stone-800 mb-4">
            Our Menu
          </h2>
          <div className="w-16 h-1 bg-amber-500 mx-auto rounded-full" />
          <p className="text-stone-500 mt-6 max-w-xl mx-auto">
            Every drink is made to order with care, using single-origin beans
            roasted in-house each week.
          </p>
        </div>

        {/* Menu Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {menuSections.map((section) => (
            <div
              key={section.category}
              className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden hover:shadow-md transition-shadow duration-300"
            >
              {/* Card Header */}
              <div className="bg-gradient-to-br from-amber-950 to-amber-800 p-6">
                <span className="text-3xl">{section.icon}</span>
                <h3 className="text-white font-playfair text-xl font-semibold mt-2">
                  {section.category}
                </h3>
              </div>

              {/* Items */}
              <div className="p-6 space-y-5">
                {section.items.map((item, i) => (
                  <div key={item.name}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-semibold text-stone-800 text-sm">
                          {item.name}
                        </div>
                        <div className="text-stone-400 text-xs mt-0.5">
                          {item.description}
                        </div>
                      </div>
                      <span className="text-amber-700 font-semibold text-sm shrink-0">
                        {item.price}
                      </span>
                    </div>
                    {i < section.items.length - 1 && (
                      <div className="mt-4 border-b border-stone-100" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Note */}
        <p className="text-center text-stone-400 text-sm mt-10">
          All drinks available hot, iced, or blended. Dairy alternatives at no extra charge.
        </p>
      </div>
    </section>
  );
}

function About() {
  return (
    <section id="about" className="py-24 bg-amber-950 text-white overflow-hidden relative">
      <div className="absolute inset-0 opacity-5">
        <div
          className="w-full h-full"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)",
            backgroundSize: "20px 20px",
          }}
        />
      </div>
      <div className="relative max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <p className="text-amber-400 text-sm font-semibold uppercase tracking-widest mb-3">
            Our Story
          </p>
          <h2 className="text-5xl font-playfair font-bold mb-6 leading-tight">
            Brewed with
            <br />
            <span className="text-amber-400 italic">Passion & Purpose</span>
          </h2>
          <p className="text-amber-100/70 leading-relaxed mb-4">
            Brew Haven was founded in 2016 with a simple belief: great coffee
            brings people together. Nestled in the heart of the neighborhood,
            we've served thousands of cups to students, dreamers, and regulars
            who feel like family.
          </p>
          <p className="text-amber-100/70 leading-relaxed">
            We partner with small farms across Ethiopia, Colombia, and Guatemala
            to source beans that are ethically grown and thoughtfully roasted —
            so every cup tells a story.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: "🌱", title: "Ethically Sourced", desc: "Direct trade with family farms" },
            { icon: "🔥", title: "In-House Roasted", desc: "Small batches, weekly" },
            { icon: "♻️", title: "Zero Waste", desc: "Compostable cups & local composting" },
            { icon: "🏡", title: "Community First", desc: "Local art, events & open mics" },
          ].map((item) => (
            <div
              key={item.title}
              className="bg-amber-900/50 border border-amber-800/50 rounded-2xl p-5"
            >
              <span className="text-2xl">{item.icon}</span>
              <h4 className="font-semibold text-white mt-3 mb-1">{item.title}</h4>
              <p className="text-amber-300/60 text-sm">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="py-24 bg-stone-100">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-amber-700 text-sm font-semibold uppercase tracking-widest mb-3">
            Come Say Hello
          </p>
          <h2 className="text-5xl font-playfair font-bold text-stone-800 mb-4">
            Find Us
          </h2>
          <div className="w-16 h-1 bg-amber-500 mx-auto rounded-full" />
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Address */}
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-stone-100 flex flex-col gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-2xl">
              📍
            </div>
            <div>
              <h3 className="font-playfair text-xl font-semibold text-stone-800 mb-2">
                Location
              </h3>
              <p className="text-stone-500 leading-relaxed">
                42 Maple Street
                <br />
                Portland, OR 97201
                <br />
                United States
              </p>
            </div>
            <a
              href="https://maps.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-amber-700 hover:text-amber-600 text-sm font-medium transition-colors mt-auto"
            >
              Get Directions →
            </a>
          </div>

          {/* Hours */}
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-stone-100 flex flex-col gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-2xl">
              🕐
            </div>
            <div>
              <h3 className="font-playfair text-xl font-semibold text-stone-800 mb-3">
                Hours
              </h3>
              <div className="space-y-2">
                {[
                  { days: "Monday – Friday", hours: "6:30 am – 8:00 pm" },
                  { days: "Saturday", hours: "7:00 am – 9:00 pm" },
                  { days: "Sunday", hours: "8:00 am – 6:00 pm" },
                ].map((row) => (
                  <div key={row.days} className="flex justify-between gap-4 text-sm">
                    <span className="text-stone-500">{row.days}</span>
                    <span className="text-stone-800 font-medium shrink-0">{row.hours}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-auto">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-600 text-sm font-medium">Open Now</span>
            </div>
          </div>

          {/* Contact */}
          <div className="bg-amber-950 rounded-3xl p-8 flex flex-col gap-4">
            <div className="w-12 h-12 bg-amber-800/60 rounded-2xl flex items-center justify-center text-2xl">
              💬
            </div>
            <div>
              <h3 className="font-playfair text-xl font-semibold text-white mb-3">
                Get in Touch
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-amber-400/70 text-xs uppercase tracking-wide mb-0.5">Phone</p>
                  <a href="tel:+15033219876" className="text-white hover:text-amber-300 transition-colors text-sm">
                    (503) 321-9876
                  </a>
                </div>
                <div>
                  <p className="text-amber-400/70 text-xs uppercase tracking-wide mb-0.5">Email</p>
                  <a href="mailto:hello@brewhaven.com" className="text-white hover:text-amber-300 transition-colors text-sm">
                    hello@brewhaven.com
                  </a>
                </div>
                <div>
                  <p className="text-amber-400/70 text-xs uppercase tracking-wide mb-0.5">Instagram</p>
                  <a href="#" className="text-white hover:text-amber-300 transition-colors text-sm">
                    @brewhaven
                  </a>
                </div>
              </div>
            </div>
            <a
              href="mailto:hello@brewhaven.com"
              className="mt-auto bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold text-sm px-6 py-3 rounded-full text-center transition-colors duration-200"
            >
              Send a Message
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-stone-900 text-stone-400 py-10">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">☕</span>
          <span className="text-white font-playfair font-semibold">Brew Haven</span>
        </div>
        <p className="text-sm">© 2024 Brew Haven. All rights reserved. Made with ♥ in Portland.</p>
        <div className="flex gap-6 text-sm">
          {["Menu", "About", "Contact"].map((link) => (
            <a key={link} href={`#${link.toLowerCase()}`} className="hover:text-white transition-colors">
              {link}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}

// ─── Main App ────────────────────────────────────────────

function App() {
  return (
    <div className="min-h-screen">
      <Nav />
      <Hero />
      <Menu />
      <About />
      <Contact />
      <Footer />
    </div>
  );
}

export default App;

