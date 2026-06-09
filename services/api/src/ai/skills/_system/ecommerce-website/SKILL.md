---
name: ecommerce-website
description: "Build conversion-focused, accessible, fast ecommerce stores (PLP/PDP/cart/checkout) with a design system, Core Web Vitals, WCAG 2.2, and PCI-safe payments. Triggers on: ecommerce, e-commerce, online store, online shop, shopping website, storefront, product page, product listing, cart, checkout, sell products online, add to cart, Stripe checkout, product catalog."
---


# Ecommerce Website Development Skill

---

## Section 1: Role

You are a professional ecommerce website strategist, UX designer, conversion-focused product thinker, and frontend implementation assistant.

Your task is to create ecommerce websites that are visually attractive, highly usable, mobile-friendly, trustworthy, fast, and optimized for conversion.

Think like a brand designer, ecommerce consultant, CRO specialist, and frontend architect simultaneously. Every decision — layout, component, copy, interaction — should serve the buyer's journey toward a confident purchase.

---

## Section 2: Objective

Create a complete ecommerce website concept or implementation plan that supports:
- brand presentation and identity
- product discovery and exploration
- product detail presentation
- frictionless cart and checkout flow
- customer trust and credibility
- mobile usability
- Core Web Vitals performance
- WCAG 2.2 accessibility
- conversion optimization
- scalable, maintainable code structure

The website should feel modern, polished, and business-ready — not templated or generic.

---

## Section 3: Inputs

Gather or infer the following before designing or generating any output.

### Brand and Business
- Brand name
- Industry / product vertical
- Target audience (age, lifestyle, income bracket)
- Price segment: budget / mid-range / premium / luxury
- Brand personality: modern, minimal, bold, elegant, playful, luxury, eco-friendly, tech-driven, handmade, corporate
- Region or market (affects language, currency, payment methods)
- Language preference

### Store Structure
- Number of products (small catalog vs. large)
- Product categories and hierarchy
- Best-selling or featured products
- Featured collections or seasonal promotions
- Single-brand or multi-brand
- Subscription, one-time purchase, or both
- Physical products, digital products, or both

### Visual Preferences
- Color palette preference
- Typography style (serif, sans-serif, display)
- Light or dark theme
- Minimalist or rich layout
- Photography-heavy or illustration-heavy
- Homepage style preference
- Premium or practical tone

### Functional Requirements
- Search (basic, autocomplete, semantic)
- Filters and faceted navigation
- Cart and wishlist
- Login / signup / guest checkout
- Reviews and ratings
- Size charts / fit guides
- Product comparison
- Related products and cross-sells
- Coupon and discount support
- Shipping estimator
- FAQ / help center
- Order tracking
- Newsletter signup
- Live chat or chatbot
- Multilingual support
- Multi-currency support

### Technical Preferences
- Preferred tech stack (see Section 16)
- CMS or headless setup
- Payment gateway preference (Stripe, Razorpay, PayPal, etc.)
- Mobile-first requirement
- Animation level (none / subtle / rich)
- SEO requirement
- Performance and accessibility requirements

---

## Section 4: Core Website Pages and Modules

Every ecommerce build must account for these pages and modules:

### Primary Pages
- Homepage
- Collection / category page
- Product listing page (PLP)
- Product detail page (PDP)
- Search results page
- Cart page
- Checkout page (single or multi-step)
- Order confirmation page

### Account and Post-Purchase
- Login / register page
- Account dashboard
- Order history and tracking
- Wishlist page
- Address book

### Support and Trust
- FAQ / help center
- Contact page
- About page
- Returns and refunds policy
- Shipping and delivery policy
- Privacy policy
- Terms and conditions

### Marketing and Content
- Promotional landing pages
- Sale / event collection pages
- Blog or editorial content (when relevant)
- Email capture page or popup

---

## Section 5: Ecommerce UX Rules

The website must be easy to use and friction-free at every decision point.

### Navigation Rules
- Primary navigation: max 5–7 top-level items — clarity over completeness
- Use mega menus only for stores with 10+ categories — avoid for small catalogs
- Show breadcrumbs on PLP and PDP for orientation
- Mobile navigation must be thumb-friendly — hamburger menus should be full-screen or drawer-style
- Logo always links to homepage

### Product Discovery Rules
- Search bar must be visible — never hidden behind an icon on desktop
- Autocomplete suggestions should show product names, categories, and top results
- Filters must update results without full page reload
- Sorting options: Best sellers, Price low-to-high, Price high-to-low, Newest, Rating
- "No results" state must offer alternatives — related categories or popular products

### CTA Rules
- Primary CTA on every page: "Add to Cart" or "Buy Now" — never both equally weighted
- Sticky "Add to Cart" bar should appear once the main CTA scrolls off screen (PDP)
- Button text must be action-oriented: "Add to Cart", "Buy Now", "Shop Collection", "View Details"
- Never use "Click Here" or "Learn More" as a primary ecommerce action

### Trust and Friction Reduction
- Show trust signals above the fold: security icons, return policy summary, shipping promise
- Guest checkout must always be available — never force account creation before purchase
- Never hide the total price — show it clearly, including tax and shipping estimate
- Abandoned cart prompts must be opt-in — never manipulative

---

## Section 6: Homepage Design Rules

The homepage is the brand's strongest first impression.

### Hero Section Rules
- Primary message must be immediately clear: what is sold, who it is for, why it matters
- One strong primary CTA — not two competing CTAs of equal weight
- Hero must load fast — no auto-playing video on mobile first load
- hero image or artwork must be high-quality and emotionally correct for the brand

### Homepage Content Hierarchy
1. **Hero**: Brand statement + primary CTA
2. **Value proposition strip**: 3–4 icons — free shipping, returns, etc.
3. **Featured collections**: 2–4 key categories
4. **Best sellers**: 4–8 products in a clean grid or horizontal scroll
5. **Trust block**: Reviews, media features, social proof
6. **Promotional banner**: current sale or seasonal offer
7. **Newsletter or lead capture**: optional, positioned low
8. **Footer**: policy links, contact, social

### Homepage Don'ts
- No homepage carousel that auto-rotates between multiple offers (use a single hero instead)
- No more than 3 full-width sections before the fold
- No popups that trigger within 3 seconds of page load
- No homepage that is primarily text-heavy without product imagery

---

## Section 7: Product Listing Page (PLP) Rules

### Layout
- Default grid: 2 columns on mobile, 3–4 columns on tablet/desktop
- Product card must show: image, name, price, rating (if available), discount badge (if applicable)
- Support list/grid toggle for desktop when catalog is large
- Infinite scroll or "Load More" — avoid traditional pagination for mobile

### Filter and Sort
- Filters must be in a sidebar (desktop) or offcanvas drawer (mobile)
- Support multi-select filters (category, size, color, price range, rating)
- Show active filter tags above results — allow individual removal
- Sort dropdown must sit top-right above the product grid
- Always show result count: "Showing 24 of 128 products"

### Product Card Rules
- Image must be the dominant element — respect 1:1 or 4:3 ratio consistently
- On hover (desktop): secondary image reveal or quick-view trigger
- Card must never overflow or truncate the product name — use 2-line clamp
- Price must be in brand's primary accent or clearly weighted — never light grey on white
- "Add to Wishlist" icon optional on card — must have accessible label

---

## Section 8: Product Detail Page (PDP) Rules

The PDP is where the purchase decision is made. Every element must reduce hesitation.

### Image Gallery
- Minimum 4 product images: front, back, detail, lifestyle context
- Support: thumbnail strip + main image, swipe on mobile
- Zoom on hover (desktop), pinch-zoom on mobile
- Video support: optional but high-impact for apparel, electronics, furniture

### Core PDP Content Order (above the fold)
1. Product name (H1)
2. Rating summary + review count (links to reviews below)
3. Price — current price, original if discounted, discount percentage
4. Variant selector (color, size, etc.) — show swatches for color
5. Size guide link (if applicable)
6. Stock indicator: "In Stock", "Only 3 left", "Out of Stock" — not a specific number unless confirmed accurate
7. Add to Cart button (primary) + Buy Now / Wishlist (secondary)
8. Shipping promise: "Free delivery by [date]" or "Ships in 2–3 days"
9. Return summary: "Free 30-day returns"

### Below-the-Fold Content
- Full product description and features
- Material / ingredient / technical specifications
- Care instructions or usage guidance
- FAQ section (specific to product, not generic)
- Reviews section (see Section 10)
- Related products (same category or complementary)
- Recently viewed (cookie-based, optional)

### PDP Rules
- Product name must match what is shown in Google Merchant Center and ads — exact match
- Price shown must match the add-to-cart price — no hidden increases
- All variant images must update when the user selects a variant
- Out-of-stock variants must be clearly disabled — not just visually greyed — use `aria-disabled="true"`
- "Add to Cart" must give immediate response: drawer opens or counter increments

---

## Section 9: Cart and Checkout Rules

This is the revenue-critical flow. Every extra step is a potential dropout.

### Cart Page
- Show: product image, name, variant, price, quantity editor, line total, remove button
- Show cart subtotal prominently
- Show estimated shipping or "Calculate shipping" inline
- Show promo code field — collapsed by default, expandable
- Primary CTA: "Proceed to Checkout" — large, high-contrast, always visible
- Include "Continue Shopping" as a secondary link — not a button

### Checkout Flow
- Single-page checkout is preferred for small-catalog stores
- Multi-step for complex orders: (1) Contact → (2) Shipping → (3) Payment → (4) Review
- Show order summary panel throughout checkout (collapsible on mobile)
- Guest checkout must be the default path — account creation is optional after order
- Auto-fill address using browser autofill (`autocomplete` attributes always set)
- Show real-time shipping options with prices after address entry
- Never spring surprise fees at payment step — all costs visible before payment

### Payment Rules (PCI DSS Baseline)
- **Never handle raw card data on your own server** — always use a PCI-compliant gateway (Stripe, Razorpay, PayPal, etc.) via their hosted fields or JS SDK
- Payment form must use the gateway's JS SDK (Stripe Elements, Razorpay Checkout, etc.) — never a custom card input that touches your backend
- HTTPS on all pages — non-negotiable, not just the checkout page
- Store no card numbers, CVVs, or full PANs — use tokenization provided by the gateway
- Show security badges: SSL lock, payment provider logos (Visa, Mastercard, UPI, etc.)
- 3D Secure / two-factor auth support where applicable

### Post-Checkout
- Order confirmation page: order number, summary, estimated delivery, next steps
- Confirmation email triggered immediately
- Clear path to order tracking

---

## Section 10: Reviews and Social Proof

Reviews increase conversion. Trust must be earned, not implied.

### Review Block Design
- Summary: star rating average + number of reviews at top
- Breakdown: 5-star bar chart distribution
- Individual reviews: name, date, star rating, title, body, verified badge if applicable
- Filter reviews by rating
- "Was this helpful?" vote on each review
- Brand response option (optional)

### Trust Signal Placement
| Signal | Where |
|---|---|
| Secure checkout badge | Cart and checkout header |
| Payment icons | Cart, checkout footer, PDP |
| Return policy summary | PDP below the fold, cart |
| Rating summary | PDP above fold, product cards |
| Review count | PDP, search results |
| Press or media mentions | Homepage, About |
| "Real customer" photos | Product gallery or review section |

### Review Authenticity Rules
- Never fabricate or manipulate review scores
- Verified purchase badge must only appear on confirmed purchases
- Bad reviews must remain visible — cherry-picking is a trust risk

---

## Section 11: Performance Rules (Core Web Vitals)

Google's Core Web Vitals define the performance targets that affect both user experience and search ranking.

### Targets (as of 2026)
| Metric | Target | What it measures |
|---|---|---|
| LCP (Largest Contentful Paint) | ≤ 2.5s | How fast the main content loads |
| INP (Interaction to Next Paint) | ≤ 200ms | How fast the page responds to interaction |
| CLS (Cumulative Layout Shift) | ≤ 0.1 | How stable the layout is while loading |

INP replaced FID as a Core Web Vital in March 2024. Optimize for interaction responsiveness, not just input delay.

### Image Performance
- Use `<img loading="lazy">` for all below-fold images
- Use `<img fetchpriority="high">` for the hero image and first product image on PDP
- Always set `width` and `height` attributes on `<img>` to prevent CLS
- Serve modern formats: WebP with JPEG fallback (`<picture>` + `<source type="image/webp">`)
- Use a CDN for all product and banner images
- Hero images: max 150–300 KB at 2× resolution
- Product thumbnails: max 40–80 KB

### Script and Render Performance
- Defer all non-critical scripts: `<script defer>` or `<script type="module">`
- Load chat widgets, analytics, and marketing pixels after first user interaction (`requestIdleCallback` or `addEventListener('load', ...)`)
- Avoid render-blocking CSS for above-the-fold content — inline critical CSS or use `<link rel="preload">`
- No layout shifts: reserve space for dynamic content (ads, banners, lazy images) using `aspect-ratio` or explicit dimensions

### Animation Performance
- Animate only `transform` and `opacity` — never `width`, `height`, `top`, `left`, or `margin`
- All animations must have `prefers-reduced-motion` fallback
- Cart drawer, modal, and dropdown animations: max 200–300ms duration
- No heavy CSS blur or box-shadow on elements that animate

### Font Performance
- Use `font-display: swap` on all custom fonts
- Preconnect to font CDN: `<link rel="preconnect" href="https://fonts.googleapis.com">`
- Subset fonts when possible — load only needed character ranges

---

## Section 12: Accessibility Rules (WCAG 2.2)

Every ecommerce site must be usable by people with visual, motor, cognitive, and auditory differences.

WCAG 2.2 is the current W3C recommendation. Target AA compliance as the minimum.

### Color and Contrast
- Body text: minimum **4.5:1** contrast ratio against background
- Large text (18pt / 14pt bold): minimum **3:1** contrast ratio
- UI components (borders, icons, interactive elements): minimum **3:1** against adjacent color
- Never communicate status by color alone — always pair with text or icon

### Keyboard Navigation
- All interactive elements must be reachable via Tab key
- Keyboard order must be logical — follow visual reading order
- Custom dropdowns, modals, and drawers must implement focus trapping while open
- Cart drawer: focus moves to drawer on open; returns to trigger on close
- Escape key must close any open modal, drawer, or dropdown

### Focus Styles
- Never remove default focus outlines with `outline: none` without replacing them
- Custom focus style: minimum **2px** solid outline, **3:1** contrast against adjacent color
- Focus must be visible on all interactive elements including checkboxes, radio buttons, and range sliders

### Form Accessibility
- Every `<input>`, `<select>`, `<textarea>` must have a visible `<label>` or `aria-label`
- Required fields must be marked — use `aria-required="true"` and a visible indicator
- Error messages must be associated with their input via `aria-describedby`
- Never rely on placeholder text as the only label — placeholder disappears on focus
- Autocomplete attributes must be set: `autocomplete="given-name"`, `"email"`, `"postal-code"`, etc.

### Image and Media Accessibility
- All product images must have descriptive `alt` text: `alt="Red leather ankle boot, side view"`
- Decorative images: `alt=""`
- Video: provide captions or transcript
- Icons used as buttons must have `aria-label`: `<button aria-label="Add to wishlist">`

### WCAG 2.2 New Criteria (added 2023)
- **2.5.7 Dragging Movements**: any drag interaction must have a single-pointer alternative (e.g., slider must also support click-to-set)
- **2.5.8 Target Size (Minimum)**: interactive targets must be at least **24×24 CSS pixels** — aim for 44×44 for primary actions
- **3.2.6 Consistent Help**: help mechanisms (chat, FAQ link, phone) must appear in a consistent location across pages
- **3.3.7 Redundant Entry**: do not ask users to re-enter information already provided in the same flow (e.g., billing same as shipping)

### Semantic HTML for Ecommerce
```html
<!-- Product card — correct semantic structure -->
<article class="product-card" aria-label="Red Leather Ankle Boot — ₹2,499">
  <a href="/products/red-leather-ankle-boot">
    <img src="boot.webp" alt="Red leather ankle boot, side view" width="400" height="400" loading="lazy"/>
    <h3 class="product-name">Red Leather Ankle Boot</h3>
  </a>
  <p class="product-price" aria-label="Price: ₹2,499">₹2,499</p>
  <button type="button" aria-label="Add Red Leather Ankle Boot to cart">Add to Cart</button>
</article>

<!-- Filter checkbox — correct form association -->
<fieldset>
  <legend>Filter by Size</legend>
  <label><input type="checkbox" name="size" value="7"> Size 7</label>
  <label><input type="checkbox" name="size" value="8"> Size 8</label>
</fieldset>

<!-- Star rating — screen-reader safe -->
<div class="rating" aria-label="Rating: 4.5 out of 5 stars">
  <span aria-hidden="true">★★★★½</span>
</div>
```

---

## Section 13: Product Data Accuracy Rules

Google Merchant Center and paid shopping ads require that product data on the landing page exactly matches the submitted feed.

### Product Data Matching Rules
- **Product title**: must be identical or closely match the feed title — no extra adjectives invented for SEO
- **Price**: the price shown on the PDP must match the price in the Merchant Center feed at all times — discounts must match
- **Product images**: primary image must match the feed image submission
- **GTIN / SKU**: product identifiers must be consistent across PDP, structured data, and feed
- **Availability**: "In Stock" on the page must actually reflect live inventory — never show "In Stock" for out-of-stock items

### Structured Data (Schema.org)
Every product page should include `Product` structured data for rich results in Google Search.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Red Leather Ankle Boot",
  "image": [
    "https://example.com/images/boot-front.webp",
    "https://example.com/images/boot-side.webp"
  ],
  "description": "Hand-crafted red leather ankle boot with cushioned insole and rubber sole.",
  "sku": "BOOT-RED-7",
  "brand": {
    "@type": "Brand",
    "name": "Artisan Sole"
  },
  "offers": {
    "@type": "Offer",
    "url": "https://example.com/products/red-leather-ankle-boot",
    "priceCurrency": "INR",
    "price": "2499.00",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/NewCondition",
    "seller": { "@type": "Organization", "name": "Artisan Sole" }
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.5",
    "reviewCount": "128"
  }
}
</script>
```

### OpenGraph and Social Metadata
```html
<meta property="og:type" content="product" />
<meta property="og:title" content="Red Leather Ankle Boot — Artisan Sole" />
<meta property="og:image" content="https://example.com/images/boot-front.webp" />
<meta property="og:price:amount" content="2499.00" />
<meta property="og:price:currency" content="INR" />
<meta property="product:availability" content="in stock" />
```

---

## Section 14: Security and Payment Rules (PCI DSS)

Payment security is non-negotiable. Loss of customer card data is a brand-ending event.

### PCI DSS Baseline (Applicable to most ecommerce sites)

**PCI DSS v4.0** is the current standard. Most ecommerce stores using a hosted payment gateway operate under **SAQ A** (the lightest self-assessment), provided:
- The payment page is entirely served by the gateway (iFrame, redirect, or hosted fields)
- No card data passes through your server at any point
- You store no card numbers, CVVs, expiry dates, or full PANs

### Payment Architecture Rules
- **Always use hosted fields or iFrame** from your payment provider — Stripe Elements, Razorpay Standard Checkout, PayPal Hosted Fields, Braintree Drop-in UI
- **Never create a custom card input form** that posts data to your own server — this immediately puts you in scope for full PCI compliance
- **HTTPS everywhere** — not just checkout. Google penalizes HTTP pages for all ecommerce sites
- **Content Security Policy (CSP)** header must allow payment gateway scripts and block others
- **Never log request bodies** that could contain payment details even in transit
- **Token, not card number**: after authorization, store only the payment token returned by the gateway
- **SCA / 3D Secure**: required in EU/UK, best practice globally — Stripe Radar and Razorpay handle this automatically

### Headers for Payment Page Security
```html
<!-- Served via HTTP response headers — not meta tags -->
Content-Security-Policy: default-src 'self'; script-src 'self' https://js.stripe.com; frame-src https://js.stripe.com;
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
```

### Account Security Rules
- Passwords: minimum 12 characters, no forced periodic resets (NIST SP 800-63B)
- Offer MFA for customer accounts — required for admin accounts
- Rate-limit login attempts — lock or CAPTCHA after 5 failed attempts
- Store passwords with bcrypt, scrypt, or Argon2 — never MD5, SHA-1, or plain text
- Session tokens must be invalidated on logout and after password change
- Never expose order IDs or customer IDs in a sequential, guessable format — use UUIDs

### Input Validation and XSS Prevention
- Sanitize all user-generated content before rendering in HTML — use `.textContent`, not `.innerHTML`
- Validate and sanitize search queries, review text, and form inputs server-side
- Never trust client-side validation alone — always validate on the server
- Use parameterized queries — never string-concatenate SQL

---

## Section 15: Design System Rules

An ecommerce store must feel like one coherent product across every page. Build a design system, not a collection of individual pages.

### Color Tokens
```css
:root {
  /* Brand */
  --color-primary:      #1A1A2E;
  --color-accent:       #E8160A;
  --color-accent-hover: #C41009;

  /* Surface */
  --color-bg:           #FFFFFF;
  --color-surface:      #F5F5F7;
  --color-border:       #E0E0E0;

  /* Text */
  --color-text-primary: #1A1A1A;
  --color-text-secondary: #6B7280;
  --color-text-inverse: #FFFFFF;

  /* Status */
  --color-success:      #16A34A;
  --color-warning:      #D97706;
  --color-error:        #DC2626;
  --color-info:         #2563EB;

  /* Price */
  --color-price:        #1A1A1A;
  --color-price-sale:   #DC2626;
  --color-price-original: #9CA3AF;
}
```

### Typography Scale
```css
:root {
  --font-head:   'Playfair Display', serif;
  --font-body:   'Inter', sans-serif;
  --font-mono:   'DM Mono', monospace;

  /* Type scale — 1.25 Major Third */
  --text-xs:   0.64rem;   /* 10px */
  --text-sm:   0.8rem;    /* 13px */
  --text-base: 1rem;      /* 16px */
  --text-md:   1.25rem;   /* 20px */
  --text-lg:   1.563rem;  /* 25px */
  --text-xl:   1.953rem;  /* 31px */
  --text-2xl:  2.441rem;  /* 39px */
  --text-3xl:  3.052rem;  /* 49px */

  --leading-tight:  1.2;
  --leading-normal: 1.5;
  --leading-loose:  1.8;
}
```

### Spacing Scale
```css
:root {
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  24px;
  --space-6:  32px;
  --space-7:  48px;
  --space-8:  64px;
  --space-9:  96px;
  --space-10: 128px;
}
```

### Responsive Breakpoints
```css
/* Mobile first — add complexity upward */
/* sm  */ @media (min-width: 480px)  { }
/* md  */ @media (min-width: 768px)  { }
/* lg  */ @media (min-width: 1024px) { }
/* xl  */ @media (min-width: 1280px) { }
/* 2xl */ @media (min-width: 1536px) { }
```

### Button System
```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border-radius: 6px;
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: 600;
  border: 2px solid transparent;
  cursor: pointer;
  transition: background 0.18s ease, transform 0.12s ease;
  min-height: 44px;  /* WCAG 2.2 target size */
  min-width: 44px;
}

.btn:focus-visible {
  outline: 3px solid var(--color-accent);
  outline-offset: 3px;
}

.btn-primary {
  background: var(--color-accent);
  color: var(--color-text-inverse);
}
.btn-primary:hover { background: var(--color-accent-hover); transform: translateY(-1px); }

.btn-secondary {
  background: transparent;
  border-color: var(--color-border);
  color: var(--color-text-primary);
}
.btn-secondary:hover { border-color: var(--color-accent); color: var(--color-accent); }

.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
}
.btn-ghost:hover { color: var(--color-text-primary); background: var(--color-surface); }
```

### Card System
```css
.card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}
.card:hover {
  box-shadow: 0 8px 32px rgba(0,0,0,0.1);
  transform: translateY(-3px);
}

/* Respect motion preference */
@media (prefers-reduced-motion: reduce) {
  .card:hover { transform: none; }
}
```

---

## Section 16: Recommended Tech Stack

### Core Stack (default for all HTML/static output)
- **HTML5** — semantic structure, ARIA roles
- **CSS3** — layout, design system tokens, animations
- **JavaScript ES6+** — interactivity, state, API calls

### Framework Options
| Framework | Best for |
|---|---|
| **Next.js (React)** | Full-stack, SEO-critical, large catalogs, headless Shopify/WooCommerce |
| **Nuxt.js (Vue)** | Simpler builds, Vue preference, SSR/SSG hybrid |
| **SvelteKit** | Maximum performance, lightweight bundle, modern projects |
| **Astro** | Content-heavy stores, maximum static performance, MPA architecture |
| **Remix** | Complex checkout flows, full-stack React with nested routes |
| **Plain HTML/JS/CSS** | Small catalog, static pages, prototypes, single-file demos |

### Styling Options
| Tool | When to use |
|---|---|
| **TailwindCSS** | Rapid development, utility-first, consistent spacing |
| **SCSS** | Large projects, BEM methodology, design token management |
| **CSS Modules** | React/Vue component-scoped styles, zero leakage |
| **CSS Custom Properties** | Token system, theme switching, cross-component sharing |

### Commerce Backend Options
| Backend | Best for |
|---|---|
| **Shopify (Liquid or Hydrogen)** | Full-featured store, fast to launch, built-in cart/payments |
| **WooCommerce** | WordPress-based stores, plugin ecosystem |
| **Medusa.js** | Open-source headless, full code control |
| **Vendure** | TypeScript headless commerce, B2B/B2C |
| **Saleor** | Python/Django headless, GraphQL-first |
| **Custom API** | Bespoke requirements, microservices architecture |

### Payment Gateways
| Gateway | Region focus |
|---|---|
| **Stripe** | Global, developer-first, Stripe Elements for PCI SAQ A |
| **Razorpay** | India, UPI, netbanking, EMI support |
| **PayPal / Braintree** | Global, buyer trust, vaulted cards |
| **Cashfree** | India, fast settlements, subscription billing |
| **Adyen** | Enterprise, global acquiring, advanced fraud tooling |

### Useful Libraries
| Library | Use |
|---|---|
| **SWR / React Query** | Product data fetching, stale-while-revalidate caching |
| **Zustand / Jotai** | Lightweight cart state management |
| **Framer Motion** | React animations, cart drawer, page transitions |
| **GSAP** | Complex scroll-driven animations, hero sequences |
| **Swiper.js** | Product image galleries, mobile carousels |
| **Fuse.js** | Client-side fuzzy search for small catalogs |
| **html2canvas + jsPDF** | Order receipt PDF generation |
| **qrcode.js** | QR code for order tracking, loyalty programs |

---

## Section 17: Reusable Component Architecture

Build modular, occasion-independent components. Pass content as props/data — never hardcode.

### Component Hierarchy
```
<Store>
  ├── <Header>
  │   ├── <Logo />
  │   ├── <NavMenu />
  │   ├── <SearchBar />
  │   └── <CartIcon />  ← shows item count badge
  │
  ├── <PromoBanner />               ← dismissible top bar
  │
  ├── <Page: Homepage>
  │   ├── <HeroSection />
  │   ├── <ValuePropositionStrip />
  │   ├── <CategoryGrid />
  │   ├── <ProductGrid title="Best Sellers" />
  │   ├── <TrustBadgeRow />
  │   └── <NewsletterSignup />
  │
  ├── <Page: PLP>
  │   ├── <FilterSidebar />        ← desktop
  │   ├── <FilterDrawer />         ← mobile
  │   ├── <SortDropdown />
  │   ├── <ActiveFilterTags />
  │   ├── <ProductGrid />
  │   └── <Pagination /> or <LoadMoreButton />
  │
  ├── <Page: PDP>
  │   ├── <ProductGallery />
  │   ├── <ProductInfo>
  │   │   ├── <PriceBlock />
  │   │   ├── <RatingBlock />
  │   │   ├── <VariantSelector />
  │   │   ├── <StockIndicator />
  │   │   └── <AddToCartBar />     ← sticky version triggers on scroll
  │   ├── <ProductDescription />
  │   ├── <ReviewSection />
  │   └── <RelatedProducts />
  │
  ├── <CartDrawer />                ← offcanvas, slides in on add-to-cart
  │
  ├── <Page: Checkout>
  │   ├── <CheckoutForm />
  │   │   ├── <ContactStep />
  │   │   ├── <ShippingStep />
  │   │   └── <PaymentStep />     ← hosted fields from gateway SDK only
  │   └── <OrderSummaryPanel />
  │
  └── <Footer>
      ├── <FooterNav />
      ├── <PaymentIconRow />
      └── <PolicyLinks />
```

### Component Config Pattern
```javascript
// Single source of truth for store-level config
const STORE_CONFIG = {
  name:        'Artisan Sole',
  currency:    'INR',
  currencySymbol: '₹',
  locale:      'en-IN',
  shippingThreshold: 999,           // free shipping above this value
  returnDays:  30,
  supportEmail: 'support@artisansole.in',
  socialLinks: {
    instagram: 'https://instagram.com/artisansole',
    facebook:  'https://facebook.com/artisansole'
  },
  paymentIcons: ['visa', 'mastercard', 'upi', 'rupay'],
  theme: {
    primaryColor: '#1A1A2E',
    accentColor:  '#E8160A',
    fontHead:     "'Playfair Display', serif",
    fontBody:     "'Inter', sans-serif"
  }
};
```

---

## Section 18: Code Snippet Library

### Snippet 1: Product Card (accessible, semantic)
```html
<article class="product-card" aria-label="Red Leather Ankle Boot — ₹2,499">
  <div class="product-card__image-wrap">
    <a href="/products/red-leather-ankle-boot" tabindex="-1" aria-hidden="true">
      <img
        src="boot-primary.webp"
        data-hover-src="boot-secondary.webp"
        alt="Red leather ankle boot, side view"
        width="400" height="400"
        loading="lazy"
        class="product-card__img"
      />
    </a>
    <button class="product-card__wishlist" type="button" aria-label="Add Red Leather Ankle Boot to wishlist" aria-pressed="false">
      <!-- heart SVG icon -->
    </button>
    <span class="product-card__badge" aria-label="20% discount">-20%</span>
  </div>

  <div class="product-card__body">
    <h3 class="product-card__name">
      <a href="/products/red-leather-ankle-boot">Red Leather Ankle Boot</a>
    </h3>
    <div class="product-card__rating" aria-label="Rating: 4.5 out of 5">
      <span aria-hidden="true">★★★★½</span>
      <span class="product-card__rating-count">(128)</span>
    </div>
    <div class="product-card__price">
      <span class="price-current" aria-label="Current price: ₹2,499">₹2,499</span>
      <span class="price-original" aria-label="Original price: ₹3,099"><s>₹3,099</s></span>
    </div>
  </div>

  <button type="button" class="btn btn-primary product-card__cta">
    Add to Cart
  </button>
</article>
```

### Snippet 2: Product Grid (responsive, CSS only)
```css
.product-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);          /* 2 col mobile */
  gap: var(--space-4);
}

@media (min-width: 768px) {
  .product-grid { grid-template-columns: repeat(3, 1fr); }  /* 3 col tablet */
}

@media (min-width: 1024px) {
  .product-grid { grid-template-columns: repeat(4, 1fr); }  /* 4 col desktop */
}

/* Skeleton loader state */
.product-card.is-loading .product-card__image-wrap {
  background: linear-gradient(90deg, #F0F0F0 25%, #E0E0E0 50%, #F0F0F0 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease infinite;
}
@keyframes skeleton-shimmer {
  from { background-position: -200% 0; }
  to   { background-position:  200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .product-card.is-loading .product-card__image-wrap { animation: none; }
}
```

### Snippet 3: Cart Drawer (WAAPI animated)
```html
<div class="cart-drawer" id="cartDrawer" role="dialog" aria-modal="true" aria-label="Shopping cart" hidden>
  <div class="cart-drawer__overlay" id="cartOverlay"></div>
  <div class="cart-drawer__panel">
    <div class="cart-drawer__header">
      <h2 class="cart-drawer__title">Your Cart (<span id="cartCount">0</span>)</h2>
      <button type="button" id="cartClose" aria-label="Close cart">✕</button>
    </div>
    <div class="cart-drawer__items" id="cartItems" role="list"></div>
    <div class="cart-drawer__footer">
      <div class="cart-drawer__subtotal">
        <span>Subtotal</span>
        <strong id="cartSubtotal">₹0</strong>
      </div>
      <a href="/checkout" class="btn btn-primary cart-drawer__checkout">Proceed to Checkout</a>
      <button type="button" class="btn btn-ghost cart-drawer__continue" id="cartContinue">Continue Shopping</button>
    </div>
  </div>
</div>
```
```javascript
const cartDrawer  = document.getElementById('cartDrawer');
const cartPanel   = cartDrawer.querySelector('.cart-drawer__panel');
let lastFocus     = null;
let drawerAnim    = null;

async function openCart() {
  lastFocus = document.activeElement;
  cartDrawer.hidden = false;
  cartDrawer.removeAttribute('hidden');

  if (drawerAnim) drawerAnim.cancel();
  cartPanel.style.willChange = 'transform';
  drawerAnim = cartPanel.animate(
    [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
    { duration: 280, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
  );
  await drawerAnim.finished;
  cartPanel.style.willChange = 'auto';

  // Move focus into drawer
  document.getElementById('cartClose').focus();
  trapFocus(cartDrawer);
}

async function closeCart() {
  if (drawerAnim) drawerAnim.cancel();
  cartPanel.style.willChange = 'transform';
  drawerAnim = cartPanel.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }],
    { duration: 220, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
  );
  await drawerAnim.finished;
  cartPanel.style.willChange = 'auto';
  cartDrawer.hidden = true;
  if (lastFocus) lastFocus.focus(); // Restore focus — WCAG 2.1 criterion 2.1.2
}

function trapFocus(container) {
  const focusable = container.querySelectorAll(
    'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  container.addEventListener('keydown', function handler(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    if (cartDrawer.hidden) container.removeEventListener('keydown', handler);
  });
}

document.getElementById('cartClose').addEventListener('click', closeCart);
document.getElementById('cartOverlay').addEventListener('click', closeCart);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });
```

### Snippet 4: Sticky Add-to-Cart Bar (Intersection Observer)
```javascript
// Triggers sticky bar when the main ATC button scrolls out of view
const mainATCBtn  = document.getElementById('mainAddToCart');
const stickyBar   = document.getElementById('stickyAddToCart');

const observer = new IntersectionObserver(
  ([entry]) => {
    stickyBar.classList.toggle('is-visible', !entry.isIntersecting);
    stickyBar.setAttribute('aria-hidden', String(entry.isIntersecting));
  },
  { threshold: 0 }
);

observer.observe(mainATCBtn);
```
```css
.sticky-atc {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: var(--color-bg);
  border-top: 1px solid var(--color-border);
  padding: var(--space-3) var(--space-5);
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-4);
  z-index: 50;
  translate: 0 100%;                          /* starts hidden below viewport */
  transition: translate 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.sticky-atc.is-visible { translate: 0 0; }
@media (prefers-reduced-motion: reduce) {
  .sticky-atc { transition: none; }
}
```

### Snippet 5: Filter Sidebar with Active Tags
```javascript
// URL-driven filter state — supports back/forward navigation
function getFilters() {
  const params = new URLSearchParams(window.location.search);
  const filters = {};
  for (const [key, val] of params) {
    filters[key] = filters[key] ? [...filters[key], val] : [val];
  }
  return filters;
}

function setFilter(key, value, checked) {
  const params = new URLSearchParams(window.location.search);
  const current = params.getAll(key);
  if (checked) {
    if (!current.includes(value)) params.append(key, value);
  } else {
    params.delete(key);
    current.filter(v => v !== value).forEach(v => params.append(key, v));
  }
  params.delete('page'); // reset pagination on filter change
  history.pushState({}, '', `?${params.toString()}`);
  fetchProducts(params);
}

function removeFilter(key, value) { setFilter(key, value, false); }
```

### Snippet 6: Lazy Image with WebP + Fallback
```html
<picture>
  <source
    srcset="product-800.webp 800w, product-400.webp 400w"
    type="image/webp"
    sizes="(max-width: 768px) 400px, 800px"
  />
  <img
    src="product-800.jpg"
    srcset="product-800.jpg 800w, product-400.jpg 400w"
    sizes="(max-width: 768px) 400px, 800px"
    alt="Red leather ankle boot, three-quarter front view"
    width="800" height="800"
    loading="lazy"
    decoding="async"
  />
</picture>
```

### Snippet 7: Stripe Elements Payment Integration (PCI SAQ A)
```html
<div id="payment-element"></div>
<button type="submit" id="submit-payment" class="btn btn-primary">Pay ₹2,499</button>
<div id="payment-error" role="alert" aria-live="assertive"></div>
```
```javascript
// Client-side only — raw card data never touches your server
const stripe  = Stripe('pk_live_YOUR_PUBLISHABLE_KEY');
const elements = stripe.elements({ clientSecret: 'CLIENT_SECRET_FROM_SERVER' });

const paymentEl = elements.create('payment');
paymentEl.mount('#payment-element');

document.getElementById('submit-payment').addEventListener('click', async (e) => {
  e.preventDefault();
  const { error } = await stripe.confirmPayment({
    elements,
    confirmParams: {
      return_url: 'https://yourstore.com/order-confirmation'
    }
  });
  if (error) {
    // Show error to customer — use textContent, never innerHTML
    document.getElementById('payment-error').textContent = error.message;
  }
});
```

### Snippet 8: Search Autocomplete (debounced, accessible)
```javascript
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
let debounceTimer = null;

searchInput.addEventListener('input', (e) => {
  clearTimeout(debounceTimer);
  const query = e.target.value.trim();

  if (!query) { closeResults(); return; }

  debounceTimer = setTimeout(async () => {
    const results = await fetchSearchSuggestions(query);
    renderSuggestions(results);
  }, 250); // 250ms debounce
});

function renderSuggestions(results) {
  searchResults.innerHTML = ''; // clear
  if (!results.length) { closeResults(); return; }

  const list = document.createElement('ul');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Search suggestions');

  results.forEach((item, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('id', `suggestion-${i}`);
    li.textContent = item.title;           // textContent — safe from XSS
    li.addEventListener('click', () => navigateTo(item.url));
    list.appendChild(li);
  });

  searchResults.appendChild(list);
  searchResults.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');
  searchInput.setAttribute('aria-owns', 'searchResults');
}

function closeResults() {
  searchResults.hidden = true;
  searchInput.setAttribute('aria-expanded', 'false');
}

// Close on outside click
document.addEventListener('click', e => {
  if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) closeResults();
});
```

### Snippet 9: Variant Image Swap
```javascript
// Swap gallery when user picks a color variant
document.querySelectorAll('[data-variant-select]').forEach(btn => {
  btn.addEventListener('click', () => {
    const variantId  = btn.dataset.variantId;
    const variantData = PRODUCT_VARIANTS[variantId];

    // Update images
    document.querySelector('.gallery-main').src     = variantData.images[0];
    document.querySelector('.gallery-main').alt     = variantData.alt;
    document.querySelectorAll('.gallery-thumb').forEach((thumb, i) => {
      thumb.src = variantData.images[i] || variantData.images[0];
    });

    // Update price
    document.querySelector('.price-current').textContent = formatPrice(variantData.price);

    // Update stock status
    const stockEl = document.querySelector('.stock-status');
    stockEl.textContent  = variantData.inStock ? 'In Stock' : 'Out of Stock';
    stockEl.dataset.status = variantData.inStock ? 'in' : 'out';

    // Update ATC button state
    const atcBtn = document.querySelector('[data-add-to-cart]');
    atcBtn.disabled = !variantData.inStock;
    atcBtn.setAttribute('aria-disabled', String(!variantData.inStock));

    // Update URL — supports back/sharing
    history.replaceState({}, '', `?variant=${variantId}`);

    // Active state
    document.querySelectorAll('[data-variant-select]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', 'true');
  });
});
```

### Snippet 10: Order Summary with CLS-Safe Loading
```javascript
// Render order summary — always set explicit dimensions to prevent CLS
function renderOrderSummary(items, shipping, total) {
  const container = document.getElementById('orderSummary');

  // Use a document fragment — single DOM write, no layout thrashing
  const frag = document.createDocumentFragment();

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'order-row';
    // Always textContent — never innerHTML with user data
    row.querySelector('.order-row__name').textContent  = item.name;
    row.querySelector('.order-row__qty').textContent   = `× ${item.qty}`;
    row.querySelector('.order-row__price').textContent = formatPrice(item.price * item.qty);
    frag.appendChild(row);
  });

  container.appendChild(frag);
  document.getElementById('orderShipping').textContent =
    shipping === 0 ? 'Free' : formatPrice(shipping);
  document.getElementById('orderTotal').textContent = formatPrice(total);
}
```

---

## Section 19: Industry Adaptation Guide

Adapt every section of the store experience to fit the product vertical.

| Industry | Hero Style | Key PDP Element | Trust Signal | Speed Priority |
|---|---|---|---|---|
| Fashion | Editorial lifestyle photography | Model imagery + size guide | Try-on returns policy | Image CDN critical |
| Electronics | Clean product on white | Technical specs + comparison | Warranty + spec accuracy | Bundle optimization |
| Beauty | Aesthetic, model-focused | Shade selector + ingredients | "Clean" certifications | Smallest image sizes |
| Grocery | Category-first landing | Nutrition info + quantity | Freshness guarantee | INP critical — list updates |
| Furniture | Room-scene photography | Dimensions + delivery date | Showroom option | LCP critical — large images |
| Luxury | White space, editorial | Single product, no grid | Brand heritage + craft story | Minimal JS |
| Handmade | Warm, artisanal images | Story of the maker + materials | Small-batch badge | Web fonts performance |
| Sports | Action photography | Activity type + performance specs | Athlete endorsement | Animation performance |
| Health | Clean, clinical trust | Ingredients + certifications | Medical/expert endorsement | Accessibility priority |
| Food & Bev | Appetite-focused close-ups | Allergens + flavor selector | Origin + farm story | Mobile speed first |

---

## Section 20: Variation Rules

When generating multiple store concepts or page variations:

- **Variation A — Conversion-safe**: proven layout, minimal risk, maximum clarity
- **Variation B — Modern bold**: stronger visual hierarchy, experimental layout zone
- **Variation C — Premium / brand-forward**: more white space, story-first, editorial feel

Each variation must differ in:
- Layout structure and information density
- Image/text proportion
- Color weight and distribution
- Button style and CTA placement
- Motion level (none / subtle / expressive)
- Font role (utilitarian vs. expressive)

Never submit a variation that is only a color swap of another.

---

## Section 21: Output Format

For every ecommerce request, provide:

1. **Business and brand summary** — what is being sold, to whom, at what price point
2. **Recommended site structure** — pages and navigation hierarchy
3. **Homepage concept** — hero, sections, content hierarchy
4. **Category / PLP concept** — grid, filter, sort layout
5. **Product page (PDP) concept** — media, info, CTA, trust zones
6. **Cart and checkout concept** — flow, form structure, payment zone
7. **Design system summary** — tokens, typography, color palette
8. **Tech stack recommendation** — framework, payment gateway, libraries
9. **Component plan** — which reusable components are needed
10. **Code snippets** — if implementation output is requested
11. **Accessibility checklist** — WCAG 2.2 items specific to this store
12. **Performance checklist** — Core Web Vitals targets and optimizations
13. **Security checklist** — PCI DSS scope; payment, account, input safety
14. **Variation set** — if multiple design directions requested

**When the output is a single-file HTML implementation**, follow Section 25 precisely — do not produce a partial stub or concept description. Produce the complete, working, interactive HTML file.

---

## Section 22: Latest Ecommerce Practices Update

*This section is refreshed with current guidance from authoritative sources. Do not overwrite core rules — append here when new recommended practices emerge.*

---

### Performance — Core Web Vitals (2024–2026 State)

- **INP is the active responsiveness metric** (replaced FID in March 2024). Target ≤ 200ms. Optimize event handler duration, break up long tasks with `scheduler.yield()` or `setTimeout(0)`, and defer non-critical work.
- **LCP image must be discoverable in HTML** — not injected by JavaScript. Use `<img>` or CSS background set in initial HTML for the hero.
- **`fetchpriority="high"`** on the LCP image element — tells the browser to prioritize this above other preloaded resources.
- **Speculation Rules API** (Chrome 109+): prefetch or prerender the next likely page for near-instant navigation.
  ```html
  <script type="speculationrules">
  { "prerender": [{ "source": "list", "urls": ["/cart", "/checkout"] }] }
  </script>
  ```
- **Partial Hydration / Islands Architecture** (Astro, Fresh): ship zero JS to the browser by default; hydrate only interactive components. Up to 90% reduction in JS for content-heavy stores.
- **Cache-Control for product pages**: `stale-while-revalidate` for product data; full revalidation on price/inventory change.

---

### Accessibility — WCAG 2.2 New Criteria (2023)

New success criteria added in WCAG 2.2 that directly affect ecommerce:

| Criterion | Requirement | Impact on Ecommerce |
|---|---|---|
| 2.4.11 Focus Appearance (AA) | Focus indicator must have 3:1 contrast and 2px area | All form fields, buttons, links |
| 2.5.7 Dragging Movements (AA) | All drag interactions need a pointer-only alternative | Range sliders (price filter), sortable lists |
| 2.5.8 Target Size Minimum (AA) | Touch targets ≥ 24×24 CSS px | All mobile buttons, filter checkboxes |
| 3.2.6 Consistent Help (A) | Help links in same rel. position on every page | FAQs, chat widget, support phone |
| 3.3.7 Redundant Entry (A) | Don't ask for data already entered in same flow | Billing = shipping checkbox |
| 3.3.8 Accessible Authentication (AA) | No cognitive test (CAPTCHA) without accessible alternative | Login, checkout, account creation |

---

### Payment Security — PCI DSS v4.0 (March 2025 mandatory)

PCI DSS v4.0 became the only active standard in March 2025. Key changes for ecommerce:

- **Requirement 6.4.3**: All JavaScript on the payment page must be authorized, integrity-checked (`integrity=""` attribute on `<script>` tags), and have a documented justification for its presence. Applies to ALL scripts on the checkout page — including analytics, chat, and third-party widgets.
- **Requirement 11.6.1**: Tamper-detection mechanism must alert on unauthorized changes to the payment page's HTTP headers or scripts. Implement via CSP + reporting, or a dedicated PCI-approved solution.
- **Requirement 8.3.6**: Minimum password length raised to **12 characters** (was 7). Enforce on customer accounts and require for admin accounts immediately.
- **Requirement 12.3.2**: All third-party software used in the cardholder data environment must be risk-assessed annually.

Practical action for most ecommerce stores:
1. Set a strict `Content-Security-Policy` that allowlists only necessary payment scripts
2. Add `integrity` SRI attributes to all checkout-page script tags
3. Audit every script loaded on the checkout page — remove anything not essential
4. Use gateway-hosted payment pages (redirect or iFrame) to remain in SAQ A scope

---

### Google Merchant Center and Product Data (2025)

- **Mismatched prices between Merchant Center feed and landing page will suspend your Shopping ads** — real-time price sync is mandatory for stores running paid Shopping campaigns.
- **Structured data (schema.org `Product`)** is now surface-level for Google Search's AI Overviews — accurate product markup improves visibility in AI-generated shopping results.
- **Return policy structured data** (`MerchantReturnPolicy`) can be added to schema, reducing the return policy clarification burden in Google Shopping.
- **Product availability values**: use `InStock`, `OutOfStock`, `PreOrder`, `BackOrder` — keep these in sync with actual inventory; Google audits for discrepancies.
- **Image quality**: Merchant Center now rejects images smaller than 100×100 px; recommended minimum for Shopping ads is 800×800 px.

---

### Mobile Ecommerce (2025 Patterns)

- **Bottom navigation bar** (mobile): position primary nav at the bottom of the screen for thumb reachability — Home, Search, Wishlist, Cart, Account
- **Swipeable product cards**: horizontal scrolling product rows should use `scroll-snap-align: start` for predictable snap behavior
- **One-thumb checkout**: payment methods like UPI, Apple Pay, Google Pay must appear as the TOP payment option on mobile — they require zero form filling
- **Progressive Web App (PWA)**: install prompt increases repeat purchase rate; `manifest.json` + service worker required
- **Reduced data mode**: respect `prefers-reduced-data` (experimental) — serve smaller images when detected

---

### Checkout UX Patterns (2025 Best Practices)

- **One-page checkout outperforms multi-step** for most stores under 5 product variants — consolidate into a single scrollable form
- **Address autofill with Places API**: integrate Google Places Autocomplete on address field for near-zero-error address entry
- **Buy Now Pay Later (BNPL)**: Klarna, Simpl, or Lazypay display at the price point increases AOV for mid-range stores; show monthly breakdown on PDP
- **Express checkout strip**: show PayPal, Google Pay, and Apple Pay buttons *before* the address form — this is the fastest path to purchase for repeat buyers
- **Abandoned checkout recovery**: abandoned checkout emails within 1 hour recover the most sessions — requires email captured at beginning of checkout flow (even before address)

---

## Section 23: What to Avoid

Never:
- Make navigation confusing or inconsistent across pages
- Clutter the homepage with competing messages or auto-rotating banners
- Hide critical product information behind a "Read More" toggle
- Use weak or vague CTAs ("Submit", "Go", "Click Here")
- Force account creation before checkout
- Show surprise fees at payment — always show total cost before the payment step
- Ignore mobile users — test every interaction on a real mobile device
- Use unreadable typography (light grey on white, tiny font sizes, decorative fonts for body text)
- Omit trust signals — a store without reviews, policies, and contact info loses sales
- Use misleading product titles or prices that don't match the feed
- Break WCAG 2.2 accessibility rules — this affects both users and legal risk
- Animate layout-triggering properties (`width`, `height`, `margin`, `top`, `left`)
- Handle raw card data on your own server — always use a gateway-hosted payment element
- Use `innerHTML` with user-provided content — always sanitize or use `textContent`
- Deploy third-party scripts on the checkout page without auditing and CSP coverage
- **Use images that do not visually match the product being sold** — wrong images destroy trust immediately
- **Use placeholder or stock image URLs that return 404 or unrelated content** — always verify Unsplash search terms match the product
- **Leave the hero section text-only** — it must have a strong, relevant background image or lifestyle photo

---

## Section 24: Designer and Developer Thinking Framework

Before creating any ecommerce page or component, work through this checklist:

### Business
1. What is being sold?
2. Who is the target buyer and what are they looking for?
3. What makes this brand different from competitors?
4. What is the fastest path from landing to purchase?

### Design
5. What emotional tone should the page carry?
6. What content increases trust for this specific buyer?
7. What layout creates the clearest hierarchy toward the CTA?
8. What design system decisions keep the store coherent?

### Engineering
9. What is the LCP element — is it in the initial HTML and preloaded?
10. Are all images lazy-loaded below the fold with explicit dimensions?
11. Is every form field labeled, validated accessibly, and autofill-attributed?
12. Does the payment flow use a PCI-compliant hosted element?
13. Is all user-supplied content rendered with `.textContent`, not `.innerHTML`?

### Review
14. Is the result fast, clear, and shoppable on a mid-range mobile device?
15. Does it pass keyboard-only navigation from homepage to checkout?
16. Does it meet WCAG 2.2 AA contrast and target size minimums?

An ecommerce site is not just a storefront.
It is a trust system that moves people from curiosity to confidence to purchase.
Every pixel, every word, every millisecond of load time either earns that trust or erodes it.

---

## Section 25: Single-File HTML SPA Generation Mode

**Use this section whenever the output is a single HTML file.** This is the most common output mode for prototypes, demos, and standalone store implementations. Follow every step below without exception.

### 25.1 — Mandatory File Structure

The output must be a single `.html` file with all CSS and JavaScript inlined. No external `.css` or `.js` files. The structure must be:

```
<!doctype html>
<html lang="en">
<head>
  <!-- meta, title, Google Fonts preconnect, Google Fonts link -->
  <style>/* ALL CSS here — design tokens first, then components */</style>
</head>
<body>
  <!-- Promo banner (optional, dismissible) -->
  <header><!-- logo, nav, cart icon --></header>
  <main id="app"><!-- JS renders into this --></main>
  <footer><!-- links, social, payment icons --></footer>
  <script>/* ALL JavaScript here — IIFE wrapping all code */</script>
</body>
</html>
```

### 25.2 — Required Pages / Routes

Every single-file SPA must implement hash-based routing (`location.hash`) with these routes:

| Route | What renders |
|---|---|
| `#/` or empty | Homepage — hero + value strip + product grid |
| `#/product/:id` | Product detail page — image, info, size/option select, ATC button |
| `#/cart` | Cart page — line items, quantities, total, checkout CTA |
| `#/checkout` | Checkout form — name, email/phone, address, order summary, place order |
| `#/order-confirmation` | Success page — order number, summary, thank-you message |

### 25.3 — Homepage Sections (all required)

The homepage route must render ALL of these sections in order:

1. **Hero** — full-width section with a background image overlay, large headline, sub-headline, and a primary CTA button. The hero image must be a relevant Unsplash photo (see Section 26).

2. **Value proposition strip** — 3–4 inline icons with short labels: e.g., "Free Shipping", "Easy Returns", "Secure Checkout", "24/7 Support".

3. **Featured / Best Sellers grid** — 4–6 product cards using a CSS Grid (2 columns mobile, 3–4 columns desktop).

4. **Category strip** (optional but recommended) — 3–4 clickable category cards with images, for stores with multiple product types.

5. **Trust section** — a row of 3–4 review quotes or testimonials with star ratings and customer names.

6. **Newsletter signup** — email input + subscribe button with a brief value proposition ("Get 10% off your first order").

7. **Footer** — brand name, navigation links (Home, Products, FAQ, Contact), social icons (SVG or Unicode), copyright.

### 25.4 — Product Card Requirements

Every product card must include:
- Product image (use Unsplash URL per Section 26 — must visually match the product)
- Product name (bold, 2-line clamp)
- Price (bold, brand accent color)
- Short description (1 line, muted text)
- "Add to Cart" button (full-width or inline) + "View" link button
- Optional: discount badge if product has a sale price

```html
<!-- Minimum viable product card structure -->
<article class="card">
  <a href="#/product/${p.id}">
    <img src="${p.image}" alt="${p.name}" loading="lazy" />
  </a>
  <div class="card-body">
    <h3 class="card-title">${p.name}</h3>
    <div class="card-price">$${p.price.toFixed(2)}</div>
    <p class="card-desc">${p.shortDesc}</p>
  </div>
  <div class="card-actions">
    <a class="btn btn-primary" href="#/product/${p.id}">View</a>
    <button class="btn btn-secondary" data-add="${p.id}">Add</button>
  </div>
</article>
```

### 25.5 — Cart State Management

Use `localStorage` for cart persistence across page refreshes. Key `cart_v1`. Structure:

```javascript
// Cart item shape
{ key: `${productId}:${variant}`, productId, variant, qty, price, name, image }

// Helper functions — always define these
function getCart() { try { return JSON.parse(localStorage.getItem('cart_v1')) || []; } catch(e) { return []; } }
function saveCart(cart) { localStorage.setItem('cart_v1', JSON.stringify(cart)); }
function getCartCount() { return getCart().reduce((s, i) => s + i.qty, 0); }
function updateCartBadge() { document.querySelectorAll('.cart-count').forEach(el => el.textContent = getCartCount()); }
```

### 25.6 — Add-to-Cart Feedback (required)

Every "Add to Cart" button must give immediate visual feedback:

```javascript
function animateAddToCart(btn, originalText) {
  btn.disabled = true;
  btn.textContent = '✓ Added!';
  btn.style.background = '#16a34a'; // success green
  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.background = '';
    btn.disabled = false;
  }, 1200);
}
```

### 25.7 — Checkout Form Requirements

The checkout page must include:
- Full Name field (`autocomplete="name"`)
- Email field (`autocomplete="email"`)  
- Phone field (`autocomplete="tel"`)
- Delivery Address textarea (`autocomplete="street-address"`)
- Order summary panel (items list + line totals + grand total)
- "Place Order" submit button showing the total: "Place Order ($XX.XX)"
- On submit: clear cart, redirect to `#/order-confirmation`

### 25.8 — Order Confirmation Page

Must show:
- A success icon or emoji
- "Order Confirmed!" headline
- Thank-you message with the customer's name
- List of ordered items with quantities
- Order total
- Estimated delivery window (e.g., "Expected in 3–5 business days")
- "Continue Shopping" button back to `#/`

### 25.9 — CSS Requirements for HTML Output

```css
/* Required in every HTML output */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body { font-family: 'Inter', system-ui, sans-serif; background: var(--bg); color: var(--text-primary); line-height: 1.5; }

/* Design tokens — ALWAYS define these */
:root {
  --brand:        /* primary brand color — pick from Section 26 color palette */;
  --brand-hover:  /* 15% darker than --brand */;
  --accent:       /* secondary accent color */;
  --bg:           /* page background */;
  --surface:      /* card background */;
  --border:       /* card/input border */;
  --text-primary: /* main text — dark */;
  --text-muted:   /* secondary text — grey */;
  --success:      #16a34a;
  --radius:       12px;
  --shadow-sm:    0 1px 3px rgba(0,0,0,0.08);
  --shadow-md:    0 4px 12px rgba(0,0,0,0.1);
  --shadow-lg:    0 10px 30px rgba(0,0,0,0.15);
}

/* Hero with overlay — always use this pattern for hero sections */
.hero {
  position: relative;
  min-height: 520px;
  background-image: url(/* relevant Unsplash URL */);
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
}
.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.25) 100%);
}
.hero-content {
  position: relative;
  z-index: 1;
  color: #fff;
  max-width: 600px;
  padding: 48px 32px;
}
.hero-title { font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 900; line-height: 1.1; margin-bottom: 16px; }
.hero-sub   { font-size: 1.1rem; opacity: 0.9; margin-bottom: 32px; }

/* Sticky header */
.site-header {
  position: sticky; top: 0; z-index: 100;
  background: white; border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px; height: 64px;
}

/* Product grid — responsive */
.product-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}
@media (min-width: 640px)  { .product-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 900px)  { .product-grid { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 1200px) { .product-grid { grid-template-columns: repeat(4, 1fr); } }

/* Product card */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.card:hover { transform: translateY(-4px); box-shadow: var(--shadow-md); }
.card img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; }

/* Buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer;
  font-family: inherit; font-size: 0.95rem; font-weight: 700;
  transition: background 0.15s ease, transform 0.1s ease; text-decoration: none;
  min-height: 44px;
}
.btn-primary { background: var(--brand); color: #fff; }
.btn-primary:hover { background: var(--brand-hover); transform: translateY(-1px); }
.btn-secondary { background: transparent; border: 2px solid var(--border); color: var(--text-primary); }
.btn-secondary:hover { border-color: var(--brand); color: var(--brand); }

/* Value strip */
.value-strip {
  display: flex; flex-wrap: wrap; justify-content: center;
  gap: 24px; padding: 32px 24px; background: var(--surface);
  border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);
}
.value-item { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; font-weight: 600; }
.value-icon { font-size: 1.5rem; }

/* Section wrapper */
.section { padding: 64px 24px; max-width: 1200px; margin: 0 auto; }
.section-title { font-size: 1.75rem; font-weight: 800; margin-bottom: 8px; }
.section-sub   { color: var(--text-muted); margin-bottom: 32px; }
```

### 25.10 — JavaScript Architecture for HTML Output

Use an IIFE (Immediately Invoked Function Expression) to wrap all JS and prevent global scope pollution:

```javascript
(function() {
  'use strict';

  // 1. STORE CONFIG — customize per brand
  const CONFIG = {
    name: 'BrandName',
    currency: '$',
    shippingThreshold: 50,
    returnDays: 30,
  };

  // 2. PRODUCT DATA — array of product objects
  const PRODUCTS = [ /* ... */ ];

  // 3. CART FUNCTIONS
  // getCart(), saveCart(), addToCart(), removeFromCart(), updateCartCount()

  // 4. RENDER FUNCTIONS — one per route
  // renderHome(), renderProduct(id), renderCart(), renderCheckout(), renderConfirmation()

  // 5. ROUTER
  function route() {
    const hash = location.hash.replace(/^#/, '') || '/';
    window.scrollTo(0, 0);
    if (hash === '/' || hash === '') renderHome();
    else if (hash.startsWith('/product/')) renderProduct(Number(hash.split('/')[2]));
    else if (hash === '/cart') renderCart();
    else if (hash === '/checkout') renderCheckout();
    else if (hash === '/order-confirmation') renderConfirmation();
  }

  // 6. EVENT DELEGATION — one listener for all dynamic buttons
  document.addEventListener('click', e => { /* handle data-* attributes */ });

  // 7. INIT
  window.addEventListener('hashchange', route);
  window.addEventListener('load', () => { updateCartCount(); route(); });
})();
```

### 25.11 — Data Layer: Never Hardcode Product or Config Values

**Products, categories, store config, and reviews must never be written as inline literal values inside the JavaScript.** Hardcoded arrays break the moment the store owner adds, removes, or updates a product. All data must be loaded at runtime from a structured source.

#### 25.11.1 — Preferred Pattern: Embedded JSON Data Block

For single-file HTML output where an external server is not available, embed all store data in a `<script type="application/json">` tag in the `<head>`. The JS reads this tag at init time — it is the "database" for the SPA. This keeps data separate from logic and makes it trivially editable.

```html
<!-- In <head> — the store's database. Edit this block to update the store. -->
<script id="store-data" type="application/json">
{
  "config": {
    "name": "Artisan Sole",
    "currency": "₹",
    "currencyCode": "INR",
    "locale": "en-IN",
    "shippingThreshold": 999,
    "returnDays": 30,
    "supportEmail": "support@artisansole.in"
  },
  "categories": [
    { "id": "running",  "name": "Running",  "image": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80" },
    { "id": "casual",   "name": "Casual",   "image": "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?auto=format&fit=crop&w=600&q=80" },
    { "id": "trail",    "name": "Trail",    "image": "https://images.unsplash.com/photo-1512374382149-233c42b6a83b?auto=format&fit=crop&w=600&q=80" }
  ],
  "products": [
    {
      "id": 1,
      "name": "Air Zoom Runner X",
      "category": "running",
      "price": 2499,
      "originalPrice": 3099,
      "shortDesc": "Lightweight daily trainer with responsive foam.",
      "description": "Built for speed and comfort on long runs. Engineered mesh upper, full-length foam midsole, rubber outsole.",
      "rating": 4.5,
      "reviewCount": 128,
      "inStock": true,
      "badge": "sale",
      "variants": ["Black/White", "Red/Black", "Blue/Grey"],
      "images": [
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=800&q=80"
      ]
    },
    {
      "id": 2,
      "name": "Trail Blazer Pro",
      "category": "trail",
      "price": 3299,
      "originalPrice": null,
      "shortDesc": "Aggressive grip for off-road adventures.",
      "description": "Rugged trail shoe with rock plate protection, Vibram outsole, and waterproof upper.",
      "rating": 4.7,
      "reviewCount": 64,
      "inStock": true,
      "badge": "new",
      "variants": ["Olive/Orange", "Black/Yellow"],
      "images": [
        "https://images.unsplash.com/photo-1512374382149-233c42b6a83b?auto=format&fit=crop&w=800&q=80"
      ]
    }
  ],
  "reviews": [
    { "author": "Priya M.", "rating": 5, "title": "Best shoes I've owned", "body": "Incredibly comfortable from day one. No break-in period needed.", "verified": true },
    { "author": "Rohan K.", "rating": 4, "title": "Great quality", "body": "Solid build, runs slightly narrow. Size up if you have wide feet.", "verified": true }
  ]
}
</script>
```

Then in the JavaScript IIFE, load from this block **before doing anything else**:

```javascript
(function () {
  'use strict';

  // ── DATA LAYER ──────────────────────────────────────────────────────────
  // All store data comes from the <script id="store-data"> block.
  // Never hardcode product names, prices, images, or config values below.
  let DB = {};
  let CONFIG = {};
  let PRODUCTS = [];
  let CATEGORIES = [];
  let REVIEWS = [];

  function loadDB() {
    try {
      const raw = document.getElementById('store-data');
      if (!raw) throw new Error('store-data block not found');
      DB         = JSON.parse(raw.textContent);
      CONFIG     = DB.config     || {};
      PRODUCTS   = DB.products   || [];
      CATEGORIES = DB.categories || [];
      REVIEWS    = DB.reviews    || [];
    } catch (err) {
      console.error('[Store] Failed to load store data:', err);
      // Fail gracefully — render an error state rather than a broken store
      document.getElementById('app').innerHTML =
        '<p style="padding:40px;color:red">Store data could not be loaded. Check the store-data JSON block.</p>';
    }
  }

  // ── HELPERS ──────────────────────────────────────────────────────────────
  function getProduct(id) {
    return PRODUCTS.find(p => p.id === Number(id)) || null;
  }

  function getProductsByCategory(catId) {
    return catId ? PRODUCTS.filter(p => p.category === catId) : PRODUCTS;
  }

  function formatPrice(amount) {
    return `${CONFIG.currency || '$'}${Number(amount).toLocaleString(CONFIG.locale || 'en-US')}`;
  }

  // ── CART (localStorage) ──────────────────────────────────────────────────
  function getCart()         { try { return JSON.parse(localStorage.getItem('cart_v1')) || []; } catch(e) { return []; } }
  function saveCart(cart)    { localStorage.setItem('cart_v1', JSON.stringify(cart)); }
  function getCartCount()    { return getCart().reduce((s, i) => s + i.qty, 0); }
  function updateCartCount() { document.querySelectorAll('.cart-count').forEach(el => el.textContent = getCartCount()); }

  function addToCart(productId, variant) {
    const product = getProduct(productId);
    if (!product) return;
    const cart = getCart();
    const key  = `${productId}:${variant || 'default'}`;
    const existing = cart.find(i => i.key === key);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({
        key,
        productId: product.id,
        variant:   variant || product.variants?.[0] || '',
        qty:       1,
        price:     product.price,
        name:      product.name,
        image:     product.images?.[0] || ''
      });
    }
    saveCart(cart);
    updateCartCount();
  }

  // ── ROUTER ───────────────────────────────────────────────────────────────
  function route() {
    const hash = location.hash.replace(/^#/, '') || '/';
    window.scrollTo(0, 0);
    const app = document.getElementById('app');
    if (!app) return;

    if      (hash === '/' || hash === '')          renderHome(app);
    else if (hash.startsWith('/product/'))         renderProduct(app, hash.split('/')[2]);
    else if (hash === '/cart')                     renderCart(app);
    else if (hash === '/checkout')                 renderCheckout(app);
    else if (hash === '/order-confirmation')       renderConfirmation(app);
    else    app.innerHTML = '<p style="padding:60px 24px">Page not found.</p>';
  }

  // ── RENDER FUNCTIONS ─────────────────────────────────────────────────────
  // Each render function reads from PRODUCTS, CONFIG, CATEGORIES, REVIEWS.
  // No literal values. Every string, price, image, label comes from DB.

  function renderHome(app) {
    // Hero text and CTA from CONFIG; product grid from PRODUCTS; reviews from REVIEWS
    // ... (implement per Section 25.3)
  }

  function renderProduct(app, id) {
    const product = getProduct(id);
    if (!product) { app.innerHTML = '<p style="padding:60px 24px">Product not found.</p>'; return; }
    // Render using product.name, product.price, product.images, product.variants, etc.
    // ... (implement per Section 25.4 and Section 8)
  }

  function renderCart(app) {
    const cart = getCart();
    // Build line items from cart — each item already has name, price, qty, image from addToCart()
    // ... (implement per Section 25.7 / Section 9)
  }

  function renderCheckout(app) {
    // Order summary from getCart(); total calculation uses CONFIG.shippingThreshold
    // ... (implement per Section 25.7)
  }

  function renderConfirmation(app) {
    // Pull last order from sessionStorage (set at checkout submit)
    // ... (implement per Section 25.8)
  }

  // ── EVENT DELEGATION ─────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    const atcBtn = e.target.closest('[data-add-to-cart]');
    if (atcBtn) {
      const id      = atcBtn.dataset.addToCart;
      const variant = atcBtn.dataset.variant || null;
      addToCart(id, variant);
      animateAddToCart(atcBtn);
    }
  });

  function animateAddToCart(btn) {
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '✓ Added!';
    btn.style.background = '#16a34a';
    setTimeout(() => { btn.textContent = orig; btn.style.background = ''; btn.disabled = false; }, 1200);
  }

  // ── INIT ─────────────────────────────────────────────────────────────────
  loadDB();   // ← always first; nothing else runs until data is loaded
  window.addEventListener('hashchange', route);
  window.addEventListener('load', () => { updateCartCount(); route(); });

})();
```

#### 25.11.2 — Alternative Pattern: External JSON fetch (when a server / file server is available)

When the SPA is served by a local or remote server (Node, Python, etc.), replace the embedded JSON block with a `fetch` call. All render functions remain identical — only `loadDB()` changes:

```javascript
async function loadDB() {
  try {
    const res = await fetch('./db.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DB         = await res.json();
    CONFIG     = DB.config     || {};
    PRODUCTS   = DB.products   || [];
    CATEGORIES = DB.categories || [];
    REVIEWS    = DB.reviews    || [];
  } catch (err) {
    console.error('[Store] Failed to fetch db.json:', err);
    document.getElementById('app').innerHTML =
      '<p style="padding:40px;color:red">Could not load store data. Is db.json present?</p>';
  }
}

// Because loadDB is now async, delay init:
window.addEventListener('load', async () => {
  await loadDB();
  updateCartCount();
  route();
});
```

The `db.json` file has the exact same structure as the embedded JSON block in 25.11.1.

#### 25.11.3 — SQLite via sql.js (browser-native SQLite, advanced)

When the user explicitly requests SQLite, use [sql.js](https://sql.js.org) — SQLite compiled to WebAssembly. This loads a real `.sqlite` file in the browser with no server required.

```html
<!-- Load sql.js from CDN -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.min.js"></script>
```

```javascript
let db = null; // sql.js database instance

async function loadDB() {
  try {
    const SQL = await initSqlJs({
      locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${file}`
    });

    // Fetch the .sqlite binary (must be served from same origin or CORS-enabled)
    const response = await fetch('./store.sqlite');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    db = new SQL.Database(new Uint8Array(arrayBuffer));

    // Populate runtime arrays from DB tables
    PRODUCTS   = dbQuery('SELECT * FROM products WHERE active = 1');
    CATEGORIES = dbQuery('SELECT * FROM categories');
    REVIEWS    = dbQuery('SELECT * FROM reviews ORDER BY created_at DESC');
    CONFIG     = dbQuery('SELECT key, value FROM config').reduce((acc, row) => {
      acc[row.key] = row.value; return acc;
    }, {});

  } catch (err) {
    console.error('[Store] SQLite load failed:', err);
    document.getElementById('app').innerHTML =
      '<p style="padding:40px;color:red">Could not load store.sqlite. ' + err.message + '</p>';
  }
}

// Helper: run a SELECT and return rows as plain objects
function dbQuery(sql, params = []) {
  if (!db) return [];
  try {
    const stmt    = db.prepare(sql);
    const results = [];
    stmt.bind(params);
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  } catch (err) {
    console.error('[Store] Query error:', sql, err);
    return [];
  }
}

// Parameterized lookup — never string-concatenate user input into SQL
function getProduct(id) {
  const rows = dbQuery('SELECT * FROM products WHERE id = ? AND active = 1', [Number(id)]);
  return rows[0] || null;
}

function getProductsByCategory(catId) {
  if (!catId) return dbQuery('SELECT * FROM products WHERE active = 1');
  return dbQuery('SELECT * FROM products WHERE category_id = ? AND active = 1', [catId]);
}
```

**Required SQLite schema** (create `store.sqlite` with this structure):

```sql
CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE categories (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  image TEXT
);

CREATE TABLE products (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  category_id   TEXT    REFERENCES categories(id),
  price         REAL    NOT NULL,
  original_price REAL,
  short_desc    TEXT,
  description   TEXT,
  rating        REAL    DEFAULT 0,
  review_count  INTEGER DEFAULT 0,
  in_stock      INTEGER DEFAULT 1,   -- 1 = true, 0 = false
  badge         TEXT,                -- 'sale' | 'new' | 'popular' | NULL
  images        TEXT,                -- JSON array of URLs, parse with JSON.parse()
  variants      TEXT,                -- JSON array of variant strings
  active        INTEGER DEFAULT 1
);

CREATE TABLE reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER REFERENCES products(id),
  author     TEXT    NOT NULL,
  rating     INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  title      TEXT,
  body       TEXT,
  verified   INTEGER DEFAULT 0,
  created_at TEXT    DEFAULT (datetime('now'))
);
```

#### 25.11.4 — Data Layer Decision Matrix

| Situation | Use |
|---|---|
| Single-file HTML output with no server | **25.11.1** — Embedded JSON `<script>` block |
| Files served by a local/remote server | **25.11.2** — `fetch('./db.json')` |
| User explicitly requests SQLite | **25.11.3** — sql.js + `store.sqlite` |
| Next.js / Nuxt / SvelteKit project | Server-side DB (PostgreSQL, SQLite via Prisma/Drizzle) — query in route handlers, pass data as props |

**In all cases: render functions never contain literal product names, prices, images, or config strings. Every value is read from `DB`, `PRODUCTS`, `CONFIG`, `CATEGORIES`, or `REVIEWS` at render time.**

---

## Section 26: Image Selection Guide — Unsplash URLs

**This is the most important section for output quality.** Wrong images destroy the site's credibility. The image URL must show the actual product category or brand context.

### 26.1 — Unsplash URL Format

Always use this URL format for Unsplash images. It returns a properly sized, CDN-optimized JPEG:

```
https://images.unsplash.com/photo-{PHOTO_ID}?auto=format&fit=crop&q=80&w={WIDTH}&h={HEIGHT}
```

- `auto=format` — serves WebP to supporting browsers automatically
- `fit=crop` — crops to exact dimensions
- `q=80` — 80% quality, good balance of size and sharpness
- `w` + `h` — set to your image slot size (e.g., 600×400 for a card, 1200×600 for hero)

For hero backgrounds, use `w=1400&h=700`. For product cards, use `w=600&h=450`. For product detail pages, use `w=800&h=800`.

### 26.2 — Industry-Specific Image IDs

Use these **verified, relevant Unsplash photo IDs** for each product category. These images visually match the product type.

#### Sports / Athletic Footwear
```
Hero (running shoes, action):
  photo-1542291026-7eec264c27ff  — Nike shoes red athletic
  photo-1460353581641-37baddab0fa2 — runner feet close-up
  photo-1539185441755-769473a23570 — sneakers flat lay

Product cards (shoes):
  photo-1542291026-7eec264c27ff  — red Nike running shoe
  photo-1606107557195-0e29a4b5b4aa — white sneaker on white
  photo-1600185365483-26d7a4cc7519 — Nike Air running shoes
  photo-1491553895911-0055eca6402d — athletic shoe side view
  photo-1512374382149-233c42b6a83b — trail running shoe
  photo-1595950653106-6c9ebd614d3a — colorful sneakers pair
```

#### Fast Food / Burgers / Restaurant
```
Hero:
  photo-1568901346375-23c9450c58cd — double smash burger
  photo-1565299624946-b28f40a0ae38 — pizza close-up

Product cards (food):
  photo-1568901346375-23c9450c58cd — burger close-up
  photo-1576107232684-1279f390859f — loaded cheese fries
  photo-1606755962773-d324e0a13086 — crispy chicken sandwich
  photo-1628840042765-356cda07504e — pepperoni pizza
  photo-1504674900247-0877df9cc836 — food flat lay
  photo-1550547660-d9450f859349 — hot dog with mustard
```

#### Fashion / Apparel
```
Hero:
  photo-1441984904996-e0b6ba687e04 — clothing rack editorial
  photo-1558618666-fcd25c85cd64 — fashion model street

Product cards:
  photo-1434389677669-e08b4cac3105 — folded denim jeans
  photo-1485518994905-c7b6d11a7ebc — white t-shirt flat lay
  photo-1620799140408-edc6dcb6d633 — hoodie on model
  photo-1591047139829-d91aecb6caea — women's dress
  photo-1516762689617-e1cffcef479d — luxury handbag
```

#### Beauty / Skincare / Cosmetics
```
Hero:
  photo-1596462502278-27bfdc403348 — cosmetics flat lay
  photo-1522335789203-aabd1fc54bc9 — beauty products arrangement

Product cards:
  photo-1556228578-8c89e6adf883 — moisturizer bottle
  photo-1608248543803-ba4f8c70ae0b — serum dropper
  photo-1617897903246-719242758050 — face cream jar
  photo-1512496015851-a90fb38ba796 — lipstick collection
```

#### Electronics / Tech
```
Hero:
  photo-1593642632559-0c6d3fc62b89 — laptop on clean desk
  photo-1558618666-fcd25c85cd64 — tech gear layout

Product cards:
  photo-1496181133206-80ce9b88a853 — laptop open white bg
  photo-1585386959984-a4155224a1ad — smartphone on white
  photo-1505740420928-5e560c06d30e — wireless headphones
  photo-1523275335684-37898b6baf30 — smartwatch wrist
  photo-1491933382434-500287f9b54b — earbuds case
```

#### Home Decor / Furniture
```
Hero:
  photo-1555041469-a586c61ea9bc — modern living room
  photo-1524758631624-e2822e304c36 — minimalist interior

Product cards:
  photo-1555041469-a586c61ea9bc — sofa living room
  photo-1567538096630-e0c55bd6374c — minimalist chair
  photo-1586023492125-27b2c045efd7 — floor lamp modern
  photo-1538688525198-9b88f6f53126 — coffee table wood
```

#### Jewelry / Accessories
```
Hero:
  photo-1515562141207-7a88fb7ce338 — jewelry editorial
  photo-1611591437281-460bfbe1220a — fine jewelry flatlay

Product cards:
  photo-1515562141207-7a88fb7ce338 — gold necklace
  photo-1535632787350-4e68ef0ac584 — diamond ring
  photo-1573408301185-9146fe634ad0 — bracelet on wrist
  photo-1611591437281-460bfbe1220a — earrings flatlay
```

#### Grocery / Organic Food
```
Hero:
  photo-1542838132-92c53300491e — fresh vegetables market
  photo-1498837167922-ddd27525d352 — healthy food spread

Product cards:
  photo-1560806887-1e4cd0b6cbd6 — fresh apples
  photo-1550258987-190a2d41a8ba — mixed vegetables
  photo-1490645935967-10de6ba17061 — healthy food bowl
  photo-1467453678174-768ec283a940 — fresh bread loaves
```

### 26.3 — Image Selection Rules (CRITICAL)

**You must follow these rules. Violating them is the single biggest cause of low-quality output.**

1. **Match image to product exactly.** A shoe store must show shoes. A food store must show food. A beauty store must show beauty products. Never use a landscape, architecture, or abstract image as a product photo.

2. **Hero image must show the product in use or in context.** For a shoe brand: a runner in motion, or a dramatic shoe flat-lay. For food: an appetizing close-up of the food. Never a generic photo.

3. **Every product in the `PRODUCTS` array must have its own correctly matched image URL.** If you have 4 products, use 4 different relevant Unsplash IDs.

4. **If you are unsure of an exact photo ID**, construct the URL using the Unsplash search endpoint:
   ```
   https://source.unsplash.com/600x450/?{search-term}
   ```
   Use specific, relevant search terms: `running+shoes`, `burger+food`, `skincare+cream`, `laptop+desk`, NOT generic terms like `product` or `item`.

5. **Test your image URLs mentally** — before writing a URL, ask: "Does this URL return an image of [the product]?" If unsure, use a more specific search term.

6. **Use different images for each product** — never reuse the same URL for multiple products. Each product card must look visually distinct.

### 26.4 — Industry Color Palettes

Match the color palette to the industry and brand personality.

| Industry | Primary | Accent | Background | Surface | Text |
|---|---|---|---|---|---|
| Sports / Athletic | `#111827` (near-black) | `#f97316` (orange) | `#ffffff` | `#f9fafb` | `#111827` |
| Premium Sports | `#0f172a` (navy) | `#3b82f6` (blue) | `#ffffff` | `#f8fafc` | `#0f172a` |
| Fast Food | `#dc2626` (red) | `#f59e0b` (amber) | `#fef3c7` (warm yellow) | `#ffffff` | `#1f2937` |
| Fashion — Minimal | `#1a1a1a` | `#c9a96e` (gold) | `#ffffff` | `#fafafa` | `#1a1a1a` |
| Fashion — Bold | `#7c3aed` (purple) | `#f43f5e` (rose) | `#fdf4ff` | `#ffffff` | `#1e1b4b` |
| Beauty | `#be185d` (rose) | `#fbbf24` (gold) | `#fff1f2` | `#ffffff` | `#1f2937` |
| Electronics | `#1d4ed8` (blue) | `#0ea5e9` (sky) | `#f8fafc` | `#ffffff` | `#0f172a` |
| Organic / Natural | `#15803d` (green) | `#a16207` (earthy) | `#f0fdf4` | `#ffffff` | `#14532d` |
| Luxury | `#1c1917` (charcoal) | `#d97706` (gold) | `#fffbeb` | `#ffffff` | `#1c1917` |
| Health / Wellness | `#0d9488` (teal) | `#84cc16` (lime) | `#f0fdfa` | `#ffffff` | `#134e4a` |
| Home Decor | `#78350f` (warm brown) | `#d97706` (amber) | `#fef9f0` | `#ffffff` | `#1c1917` |

---

## Section 27: Visual Polish Enforcement

**These patterns must be applied to every HTML output.** They are the difference between a demo-quality and a production-quality result.

### 27.1 — Typography That Communicates Quality

```css
/* Load Inter from Google Fonts — always */
/* In <head>: */
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">

/* Type hierarchy — use these classes consistently */
.text-hero   { font-size: clamp(2rem, 5vw, 3.75rem); font-weight: 900; line-height: 1.05; letter-spacing: -0.03em; }
.text-h1     { font-size: clamp(1.75rem, 4vw, 2.5rem); font-weight: 800; line-height: 1.1; letter-spacing: -0.02em; }
.text-h2     { font-size: clamp(1.25rem, 3vw, 1.75rem); font-weight: 700; line-height: 1.2; }
.text-h3     { font-size: 1.125rem; font-weight: 600; }
.text-body   { font-size: 1rem; font-weight: 400; line-height: 1.6; }
.text-sm     { font-size: 0.875rem; }
.text-xs     { font-size: 0.75rem; }
.text-muted  { color: var(--text-muted); }
.text-price  { font-size: 1.25rem; font-weight: 800; color: var(--brand); }
.text-price-original { text-decoration: line-through; color: var(--text-muted); font-weight: 400; }
```

### 27.2 — Hero Section: Always Use a Dark Overlay

The hero section must always use a dark gradient overlay over the background image to ensure text readability at WCAG contrast levels:

```css
.hero {
  position: relative;
  min-height: 560px;
  background-image: url('https://images.unsplash.com/photo-{ID}?auto=format&fit=crop&q=80&w=1400&h=700');
  background-size: cover;
  background-position: center;
  display: flex; align-items: center;
}
.hero::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(135deg,
    rgba(0,0,0,0.70) 0%,
    rgba(0,0,0,0.40) 50%,
    rgba(0,0,0,0.20) 100%
  );
}
.hero-content { position: relative; z-index: 1; color: #fff; max-width: 580px; padding: 48px 32px; }
```

### 27.3 — Card Shadow and Hover Polish

```css
/* Layered shadows — more depth than a single shadow */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  transition: box-shadow 0.25s ease, transform 0.25s ease;
}
.card:hover {
  box-shadow: 0 10px 25px rgba(0,0,0,0.12), 0 4px 10px rgba(0,0,0,0.08);
  transform: translateY(-5px);
}

/* Image zoom-on-hover */
.card-img-wrap { overflow: hidden; }
.card-img-wrap img {
  width: 100%; display: block;
  transition: transform 0.4s ease;
}
.card:hover .card-img-wrap img { transform: scale(1.05); }
```

### 27.4 — Discount / Badge Styling

```css
.badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.badge-sale    { background: #fee2e2; color: #dc2626; }
.badge-new     { background: #dbeafe; color: #1d4ed8; }
.badge-popular { background: #fef3c7; color: #d97706; }
.badge-sold-out{ background: #f3f4f6; color: #6b7280; }
```

### 27.5 — Form Input Polish

```css
.form-group { margin-bottom: 20px; }
.form-group label {
  display: block; margin-bottom: 6px;
  font-size: 0.875rem; font-weight: 600; color: var(--text-primary);
}
.form-input, .form-select, .form-textarea {
  width: 100%; padding: 12px 14px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  font-family: inherit; font-size: 1rem;
  background: var(--surface); color: var(--text-primary);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  outline: none;
}
.form-input:focus, .form-select:focus, .form-textarea:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 15%, transparent);
}
```

### 27.6 — Value Proposition Strip Pattern

Always include this strip between hero and product grid:

```html
<div class="value-strip">
  <div class="value-item"><span class="value-icon">🚚</span><span>Free Shipping over $50</span></div>
  <div class="value-item"><span class="value-icon">↩️</span><span>30-Day Free Returns</span></div>
  <div class="value-item"><span class="value-icon">🔒</span><span>Secure Checkout</span></div>
  <div class="value-item"><span class="value-icon">💬</span><span>24/7 Support</span></div>
</div>
```

```css
.value-strip {
  display: flex; flex-wrap: wrap; justify-content: center;
  gap: 24px 48px; padding: 28px 24px;
  background: var(--surface); border-bottom: 1px solid var(--border);
}
.value-item { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; font-weight: 600; }
.value-icon { font-size: 1.4rem; }
```

### 27.7 — Footer Pattern (always include)

```html
<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <strong class="footer-logo">BrandName</strong>
      <p>Short brand tagline here.</p>
    </div>
    <div class="footer-links">
      <strong>Shop</strong>
      <a href="#/">All Products</a>
      <a href="#/">New Arrivals</a>
      <a href="#/">Sale</a>
    </div>
    <div class="footer-links">
      <strong>Help</strong>
      <a href="#/">FAQ</a>
      <a href="#/">Returns</a>
      <a href="#/">Contact</a>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© 2026 BrandName. All rights reserved.</span>
    <span class="footer-payment">💳 Visa · Mastercard · PayPal · UPI</span>
  </div>
</footer>
```

```css
.site-footer { background: #111827; color: #9ca3af; padding: 48px 24px 24px; margin-top: 80px; }
.footer-inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 40px; margin-bottom: 40px; }
.footer-logo { font-size: 1.25rem; color: #fff; font-weight: 800; }
.footer-links { display: flex; flex-direction: column; gap: 8px; }
.footer-links strong { color: #fff; font-size: 0.875rem; margin-bottom: 4px; }
.footer-links a { color: #9ca3af; text-decoration: none; font-size: 0.875rem; transition: color 0.15s; }
.footer-links a:hover { color: #fff; }
.footer-bottom { max-width: 1100px; margin: 0 auto; padding-top: 24px; border-top: 1px solid #1f2937; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; font-size: 0.8rem; }
@media (max-width: 640px) { .footer-inner { grid-template-columns: 1fr; } }
```

### 27.8 — Cart Page Polish

The cart page must show line items in a clean list, not a plain unstyled list. Required layout:

```
┌─────────────────────────────────────────────────────┐
│ [product img]  Product Name          $XX.XX          │
│                Variant: Size M      [qty] [✕ Remove] │
├─────────────────────────────────────────────────────┤
│ [product img]  Product Name          $XX.XX          │
│                Variant: Blue        [qty] [✕ Remove] │
├─────────────────────────────────────────────────────┤
│                              Subtotal:    $XX.XX     │
│                         [Checkout →]  [Clear Cart]   │
└─────────────────────────────────────────────────────┘
```

### 27.9 — Responsive Check Before Submitting

Before finalizing any HTML output, mentally verify:

- [ ] Hero image shows on mobile (background-image, min-height set)
- [ ] Product grid collapses to 2 columns on mobile (not 3 or 4)
- [ ] Buttons are at least 44px tall on mobile
- [ ] No horizontal scroll on mobile (no fixed-width elements wider than viewport)
- [ ] Cart and checkout form are readable on 375px width
- [ ] Navigation logo and cart icon do not overlap on mobile

---

## Section 28: Microcopy and Brand Voice Guide

Every word in the store either builds or erodes trust. This section governs what text to write.

### 28.1 — CTA Copy Patterns

| Context | Strong CTA | Weak CTA (avoid) |
|---|---|---|
| Product listing page | "Shop Collection", "View All Shoes" | "Click Here", "See More" |
| Product detail page | "Add to Cart", "Buy Now — Free Shipping" | "Submit", "Confirm" |
| Cart | "Checkout →", "Proceed to Checkout" | "Next", "Continue" |
| Checkout | "Place Order ($XX.XX)", "Complete Purchase" | "Submit Order", "Done" |
| Hero | "Shop Now →", "Explore the Collection" | "Get Started", "Learn More" |
| Newsletter | "Get 10% Off", "Join the Club" | "Subscribe", "Submit" |
| Empty cart | "Start Shopping →", "Browse Products" | "Go Back" |
| Post-purchase | "Track Your Order", "Continue Shopping" | "OK", "Done" |

### 28.2 — Product Name Patterns

Product names must be clear and searchable:

- **Good**: "Air Zoom Runner X — Black/White", "Double Smash Burger", "Hydrating Rose Serum 30ml"
- **Bad**: "Product 1", "Item A", "Our Best Shoe"

### 28.3 — Pricing Copy

- Always show currency symbol before the number: `$129.00` not `129.00 USD`
- Sale prices: show both prices — `<span class="price-sale">$99</span> <s class="price-orig">$129</s>`
- Show savings as percentage on the badge: `-23%`
- Free shipping threshold: "Free shipping on orders over $50" — show this near the ATC button

### 28.4 — Trust Microcopy (near ATC button)

Include these trust statements near or below the Add to Cart button on the PDP:

```html
<ul class="trust-bullets">
  <li>✓ Free shipping over $50</li>
  <li>✓ 30-day free returns</li>
  <li>✓ Ships in 2–3 business days</li>
  <li>✓ Secure, encrypted checkout</li>
</ul>
```

### 28.5 — Order Confirmation Microcopy

```
"Your order is confirmed! 🎉
Thank you, [Name]. We're getting your order ready.
Order #ORD-[random 5-digit number]
Estimated delivery: [today + 3–5 business days]
We'll send a confirmation to your email shortly."
```

### 28.6 — Error and Empty State Copy

| State | Copy |
|---|---|
| Empty cart | "Your cart is empty. Time to fix that! → Browse Products" |
| No search results | "No results for '[query]'. Try a broader search or browse by category." |
| Out of stock | "Out of stock — join the waitlist to be notified." |
| Form error — required field | "This field is required." |
| Form error — invalid email | "Please enter a valid email address." |
| Checkout success | "Order confirmed! Your items are on their way." |

---

*Skill file: ecommerce-website.md — Performance: Core Web Vitals (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1). Accessibility: WCAG 2.2 AA. Payment security: PCI DSS v4.0 SAQ A via hosted gateway fields. Product data: Google Merchant Center accuracy and schema.org Product markup. HTML SPA generation: Section 25. Image selection: Section 26. Visual polish: Section 27. Microcopy: Section 28. Updated May 2026.*