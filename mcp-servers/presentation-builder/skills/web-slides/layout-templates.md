# Layout Templates

HTML scaffolds for each slide layout type. All assume CSS variables are
defined globally.

---

## 1. Title Slide — Full Bleed Hero

```html
<div class="slide" id="slide-1">
  <!-- Decorative orb -->
  <div class="orb" style="width:600px;height:600px;background:var(--accent-1);top:-200px;right:-200px;"></div>
  <div class="orb" style="width:400px;height:400px;background:var(--accent-2);bottom:-100px;left:-100px;"></div>

  <div class="slide-content title-hero">
    <div class="reveal tag-line">PRESENTATION TITLE</div>
    <h1 class="reveal display-title">Your Powerful<br><span style="color:var(--accent-1)">Headline Here</span></h1>
    <p class="reveal subtitle">Compelling subtitle that tells the audience exactly what they'll learn</p>
    <div class="reveal meta-row">
      <span>Speaker Name</span>
      <span class="dot">·</span>
      <span>Organization</span>
      <span class="dot">·</span>
      <span>2025</span>
    </div>
  </div>
</div>
```

## 2. Split Layout — Content + Visual

```html
<div class="slide" id="slide-n">
  <div class="split-layout">
    <div class="split-left reveal">
      <div class="slide-tag">SECTION 02</div>
      <h2>Key Concept Title</h2>
      <p>Opening context sentence that frames what follows. Keep it sharp.</p>
      <ul class="point-list">
        <li><span class="bullet-icon">→</span> First critical insight with concrete detail</li>
        <li><span class="bullet-icon">→</span> Second insight that builds on the first</li>
        <li><span class="bullet-icon">→</span> Third point that closes the argument</li>
      </ul>
    </div>
    <div class="split-right reveal">
      <!-- Large decorative element, stat, or icon -->
      <div class="visual-block">
        <span class="mega-icon">🎯</span>
        <div class="visual-caption">Supporting visual label</div>
      </div>
    </div>
  </div>
</div>
```

## 3. Big Stat Slide

```html
<div class="slide stat-slide" id="slide-n">
  <div class="stat-bg-text">DATA</div>
  <div class="slide-content centered">
    <div class="reveal slide-tag">BY THE NUMBERS</div>
    <div class="reveal stat-block">
      <span class="stat-number" data-target="94700">0</span>
      <span class="stat-unit">+</span>
    </div>
    <div class="reveal stat-label">Users reached in the first quarter alone</div>
    <div class="reveal stat-context">Representing a 3.4× increase over the same period last year, driven by organic growth and platform expansion.</div>
  </div>
</div>
```

## 4. Card Grid — 3 Cards

```html
<div class="slide" id="slide-n">
  <div class="slide-content">
    <h2 class="reveal section-title">Three Core Pillars</h2>
    <div class="card-grid three-col">
      <div class="card reveal">
        <div class="card-icon">⚡</div>
        <h3 class="card-title">Speed</h3>
        <p class="card-body">Deploy in minutes, not months. Our infrastructure handles scale automatically.</p>
      </div>
      <div class="card reveal">
        <div class="card-icon">🔐</div>
        <h3 class="card-title">Security</h3>
        <p class="card-body">Enterprise-grade encryption at rest and in transit. SOC 2 Type II certified.</p>
      </div>
      <div class="card reveal">
        <div class="card-icon">📈</div>
        <h3 class="card-title">Scale</h3>
        <p class="card-body">From 10 to 10 million users with zero architecture changes on your side.</p>
      </div>
    </div>
  </div>
</div>
```

## 5. Quote Callout Slide

```html
<div class="slide quote-slide" id="slide-n">
  <div class="quote-mark reveal">"</div>
  <div class="slide-content centered">
    <blockquote class="reveal pull-quote">
      The best way to predict the future is to invent it.
    </blockquote>
    <div class="reveal quote-attribution">
      <span class="attr-name">Alan Kay</span>
      <span class="attr-title">Computer Scientist, Turing Award Winner</span>
    </div>
  </div>
  <div class="quote-mark reveal closing-mark">"</div>
</div>
```

## 6. Timeline / Steps Slide

```html
<div class="slide" id="slide-n">
  <div class="slide-content">
    <h2 class="reveal">The Roadmap</h2>
    <div class="timeline">
      <div class="timeline-item reveal">
        <div class="timeline-node">01</div>
        <div class="timeline-content">
          <h4>Discovery Phase</h4>
          <p>Audit existing systems and identify gaps.</p>
        </div>
      </div>
      <div class="timeline-item reveal">
        <div class="timeline-node">02</div>
        <div class="timeline-content">
          <h4>Design Sprint</h4>
          <p>Prototype, test, and validate with real users.</p>
        </div>
      </div>
      <div class="timeline-item reveal">
        <div class="timeline-node">03</div>
        <div class="timeline-content">
          <h4>Launch & Iterate</h4>
          <p>Ship fast, measure everything, improve continuously.</p>
        </div>
      </div>
    </div>
  </div>
</div>
```

## 7. Comparison Slide — Two Columns

```html
<div class="slide" id="slide-n">
  <div class="slide-content">
    <h2 class="reveal">Before vs After</h2>
    <div class="comparison-grid">
      <div class="comparison-col col-before reveal">
        <div class="col-label">❌ Before</div>
        <ul>
          <li>Manual, error-prone processes</li>
          <li>Siloed teams with no shared context</li>
          <li>Weeks to deploy a single change</li>
          <li>No real-time visibility into performance</li>
        </ul>
      </div>
      <div class="comparison-divider"></div>
      <div class="comparison-col col-after reveal">
        <div class="col-label">✅ After</div>
        <ul>
          <li>Automated pipelines with audit trails</li>
          <li>Cross-functional dashboards for all teams</li>
          <li>Deploy in under 10 minutes, any day</li>
          <li>Live metrics with alerting built-in</li>
        </ul>
      </div>
    </div>
  </div>
</div>
```

## 8. Takeaways / Closing

```html
<div class="slide closing-slide" id="slide-n">
  <div class="closing-bg-text reveal">FIN</div>
  <div class="slide-content centered">
    <div class="reveal slide-tag">KEY TAKEAWAYS</div>
    <h2 class="reveal closing-headline">What We Covered Today</h2>
    <div class="takeaway-list reveal">
      <div class="takeaway-item">
        <span class="tk-num">1</span>
        <span class="tk-text">The core problem and why it matters now</span>
      </div>
      <div class="takeaway-item">
        <span class="tk-num">2</span>
        <span class="tk-text">Our solution and how it creates value</span>
      </div>
      <div class="takeaway-item">
        <span class="tk-num">3</span>
        <span class="tk-text">The path forward and your next step</span>
      </div>
    </div>
    <div class="reveal cta-block">
      <p>Ready to start? <strong>contact@example.com</strong></p>
    </div>
  </div>
</div>
```

---

## Core CSS Patterns

```css
/* Slide base */
body {
  margin: 0;
  overflow: hidden;
  font-family: var(--font-body);
  background: var(--bg-primary);
  color: var(--text-primary);
}
.deck { width: 100vw; height: 100vh; position: relative; }

.slide {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--slide-padding, 5vw);
  box-sizing: border-box;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.7s, transform 0.7s cubic-bezier(0.16,1,0.3,1);
}
.slide.active {
  opacity: 1;
  pointer-events: all;
}

/* Typography scale */
.display-title {
  font-family: var(--font-display);
  font-size: clamp(3rem, 7vw, 6rem);
  line-height: 1.05;
  margin: 0.3em 0;
}
h2 { font-family: var(--font-display); font-size: clamp(2rem, 4vw, 3.5rem); }
h3, h4 { font-family: var(--font-display); }

/* Cards */
.card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 2rem;
}
.card-icon { font-size: 2.5rem; margin-bottom: 1rem; }

/* Progress */
.progress-bar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: rgba(255,255,255,0.1);
  z-index: 100;
}
.progress-fill {
  height: 100%;
  background: var(--accent-1);
  transition: width 0.5s ease;
}
.slide-counter {
  position: fixed;
  bottom: 1.5rem;
  right: 2rem;
  font-size: 0.8rem;
  opacity: 0.5;
  z-index: 100;
}
```
