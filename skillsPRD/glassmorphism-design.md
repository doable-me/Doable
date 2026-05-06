# Skill: Glassmorphism UI Design

## Trigger Keywords
`glassmorphism`, `glass effect`, `frosted glass`, `blur background`, `glass card`, `glass UI`, `transparent card`, `glass panel`, `frosted UI`, `backdrop blur`, `glass morphism`

## Purpose
Generate stunning glassmorphism-based UI designs with frosted glass effects, proper layering, blur optimizations, and full accessibility compliance.

---

## Dependencies

```json
{
  "devDependencies": {},
  "dependencies": {}
}
```

No additional dependencies required — glassmorphism is pure CSS. The key properties are:
- `backdrop-filter: blur()`
- Semi-transparent `background`
- Subtle `border`
- Soft `box-shadow`

---

## Architecture

### File Structure
```
src/
├── App.tsx                    # Main app with gradient background
├── components/
│   ├── GlassCard.tsx          # Reusable glass panel
│   ├── GlassNav.tsx           # Frosted navigation bar
│   ├── GlassSidebar.tsx       # Glass sidebar panel
│   ├── GlassModal.tsx         # Glass overlay modal
│   ├── GlassInput.tsx         # Glass-styled form input
│   └── GlassButton.tsx        # Glass button variants
├── styles/
│   ├── glass.css              # Core glassmorphism utilities
│   └── backgrounds.css        # Gradient/mesh backgrounds
└── App.css                    # Global styles
```

---

## Core CSS Foundation

### Glass Design Tokens
```css
:root {
  /* Glass backgrounds */
  --glass-bg-light: hsla(0, 0%, 100%, 0.25);
  --glass-bg-medium: hsla(0, 0%, 100%, 0.4);
  --glass-bg-heavy: hsla(0, 0%, 100%, 0.6);
  --glass-bg-dark: hsla(220, 20%, 10%, 0.4);
  --glass-bg-dark-heavy: hsla(220, 20%, 10%, 0.6);

  /* Blur values */
  --glass-blur-sm: blur(8px);
  --glass-blur-md: blur(12px);
  --glass-blur-lg: blur(16px);
  --glass-blur-xl: blur(20px);

  /* Borders */
  --glass-border-light: 1px solid hsla(0, 0%, 100%, 0.2);
  --glass-border-medium: 1px solid hsla(0, 0%, 100%, 0.3);
  --glass-border-dark: 1px solid hsla(0, 0%, 100%, 0.08);

  /* Shadows */
  --glass-shadow: 0 8px 32px hsla(0, 0%, 0%, 0.1);
  --glass-shadow-lg: 0 12px 48px hsla(0, 0%, 0%, 0.15);
  --glass-shadow-inset: inset 0 1px 0 hsla(0, 0%, 100%, 0.2);

  /* Border radius */
  --glass-radius-sm: 12px;
  --glass-radius-md: 16px;
  --glass-radius-lg: 24px;
  --glass-radius-xl: 32px;
}
```

### Base Glass Classes
```css
/* Light glass (for dark backgrounds) */
.glass {
  background: var(--glass-bg-light);
  backdrop-filter: var(--glass-blur-lg);
  -webkit-backdrop-filter: var(--glass-blur-lg);
  border: var(--glass-border-light);
  border-radius: var(--glass-radius-md);
  box-shadow: var(--glass-shadow), var(--glass-shadow-inset);
}

/* Medium opacity glass */
.glass-medium {
  background: var(--glass-bg-medium);
  backdrop-filter: var(--glass-blur-md);
  -webkit-backdrop-filter: var(--glass-blur-md);
  border: var(--glass-border-medium);
  border-radius: var(--glass-radius-md);
  box-shadow: var(--glass-shadow);
}

/* Heavy glass (more readable) */
.glass-heavy {
  background: var(--glass-bg-heavy);
  backdrop-filter: var(--glass-blur-lg);
  -webkit-backdrop-filter: var(--glass-blur-lg);
  border: var(--glass-border-medium);
  border-radius: var(--glass-radius-md);
  box-shadow: var(--glass-shadow);
}

/* Dark glass (for light backgrounds) */
.glass-dark {
  background: var(--glass-bg-dark);
  backdrop-filter: var(--glass-blur-lg);
  -webkit-backdrop-filter: var(--glass-blur-lg);
  border: var(--glass-border-dark);
  border-radius: var(--glass-radius-md);
  box-shadow: var(--glass-shadow-lg);
  color: white;
}
```

---

## Background Requirements

Glassmorphism ONLY works over rich, colorful backgrounds. The glass effect is invisible on solid white/black backgrounds.

### Gradient Mesh Background
```css
.gradient-bg {
  background-color: #0f0c29;
  background-image:
    radial-gradient(at 40% 20%, hsla(280, 80%, 60%, 0.8) 0px, transparent 50%),
    radial-gradient(at 80% 0%, hsla(189, 100%, 56%, 0.6) 0px, transparent 50%),
    radial-gradient(at 0% 50%, hsla(355, 85%, 63%, 0.5) 0px, transparent 50%),
    radial-gradient(at 80% 50%, hsla(240, 90%, 70%, 0.4) 0px, transparent 50%),
    radial-gradient(at 0% 100%, hsla(22, 100%, 60%, 0.5) 0px, transparent 50%),
    radial-gradient(at 80% 100%, hsla(174, 80%, 50%, 0.4) 0px, transparent 50%);
  min-height: 100vh;
}

/* Alternative: Animated gradient */
.animated-gradient-bg {
  background: linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab);
  background-size: 400% 400%;
  animation: gradient-shift 15s ease infinite;
  min-height: 100vh;
}

@keyframes gradient-shift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* Blob/orb background */
.blob-bg {
  position: relative;
  background: #0a0a23;
  min-height: 100vh;
  overflow: hidden;
}

.blob-bg::before,
.blob-bg::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
}

.blob-bg::before {
  width: 500px;
  height: 500px;
  background: hsla(280, 80%, 60%, 0.4);
  top: -10%;
  right: -5%;
  animation: float 8s ease-in-out infinite;
}

.blob-bg::after {
  width: 400px;
  height: 400px;
  background: hsla(200, 100%, 60%, 0.3);
  bottom: -10%;
  left: -5%;
  animation: float 10s ease-in-out infinite reverse;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(30px, -30px); }
}
```

---

## Component Patterns

### Glass Card
```tsx
interface GlassCardProps {
  children: React.ReactNode;
  variant?: 'light' | 'medium' | 'heavy' | 'dark';
  className?: string;
  hover?: boolean;
}

export function GlassCard({ children, variant = 'light', className = '', hover = true }: GlassCardProps) {
  const variantClass = variant === 'light' ? 'glass' :
                       variant === 'medium' ? 'glass-medium' :
                       variant === 'heavy' ? 'glass-heavy' : 'glass-dark';

  return (
    <div className={`${variantClass} ${hover ? 'glass-hover' : ''} ${className}`}>
      {children}
    </div>
  );
}
```

### Glass Navigation Bar
```css
.glass-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  padding: 1rem 2rem;
  background: hsla(0, 0%, 100%, 0.15);
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  border-bottom: 1px solid hsla(0, 0%, 100%, 0.1);
  box-shadow: 0 4px 16px hsla(0, 0%, 0%, 0.05);
}

.glass-nav a {
  color: white;
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  transition: background 0.2s;
}

.glass-nav a:hover {
  background: hsla(0, 0%, 100%, 0.1);
}

.glass-nav a.active {
  background: hsla(0, 0%, 100%, 0.2);
  border: 1px solid hsla(0, 0%, 100%, 0.15);
}
```

### Glass Input
```css
.glass-input {
  width: 100%;
  padding: 0.75rem 1rem;
  background: hsla(0, 0%, 100%, 0.1);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid hsla(0, 0%, 100%, 0.15);
  border-radius: 12px;
  color: white;
  font-size: 1rem;
  outline: none;
  transition: all 0.2s;
}

.glass-input::placeholder {
  color: hsla(0, 0%, 100%, 0.5);
}

.glass-input:focus {
  background: hsla(0, 0%, 100%, 0.15);
  border-color: hsla(0, 0%, 100%, 0.3);
  box-shadow: 0 0 0 3px hsla(0, 0%, 100%, 0.1);
}
```

### Glass Button
```css
.glass-button {
  padding: 0.75rem 1.5rem;
  background: hsla(0, 0%, 100%, 0.15);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid hsla(0, 0%, 100%, 0.2);
  border-radius: 12px;
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.glass-button:hover {
  background: hsla(0, 0%, 100%, 0.25);
  border-color: hsla(0, 0%, 100%, 0.3);
  transform: translateY(-1px);
  box-shadow: 0 8px 24px hsla(0, 0%, 0%, 0.15);
}

.glass-button:active {
  transform: translateY(0);
  background: hsla(0, 0%, 100%, 0.2);
}

/* Primary glass button with color */
.glass-button-primary {
  background: hsla(240, 100%, 70%, 0.3);
  border-color: hsla(240, 100%, 70%, 0.4);
}

.glass-button-primary:hover {
  background: hsla(240, 100%, 70%, 0.4);
  border-color: hsla(240, 100%, 70%, 0.5);
}
```

---

## Hover & Interactive States

```css
.glass-hover {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.glass-hover:hover {
  background: hsla(0, 0%, 100%, 0.35);
  border-color: hsla(0, 0%, 100%, 0.35);
  transform: translateY(-4px);
  box-shadow:
    0 12px 40px hsla(0, 0%, 0%, 0.12),
    inset 0 1px 0 hsla(0, 0%, 100%, 0.3);
}

/* Glow effect on hover */
.glass-glow:hover {
  box-shadow:
    0 0 20px hsla(240, 100%, 70%, 0.2),
    0 8px 32px hsla(0, 0%, 0%, 0.1),
    inset 0 1px 0 hsla(0, 0%, 100%, 0.2);
}
```

---

## Accessibility & Readability

```css
/* Ensure text is readable on glass */
.glass-content {
  /* Option 1: Text shadow for contrast */
  text-shadow: 0 1px 2px hsla(0, 0%, 0%, 0.3);
}

/* Option 2: Inner content panel with higher opacity */
.glass-readable-content {
  background: hsla(0, 0%, 100%, 0.85);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border-radius: 12px;
  padding: 1.5rem;
  color: #1a1a2e;
}

/* Option 3: Thicker glass for text-heavy areas */
.glass-text-panel {
  background: hsla(0, 0%, 100%, 0.7);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

/* Minimum font sizes on glass */
.glass p { font-size: 1rem; font-weight: 500; }
.glass h1, .glass h2 { font-weight: 700; }
.glass small { font-size: 0.875rem; font-weight: 600; }
```

---

## Performance Optimization

```css
/* GPU acceleration */
.glass-optimized {
  contain: paint;
  will-change: backdrop-filter;
  transform: translateZ(0);
}

/* Reduce blur on mobile for performance */
@media (max-width: 768px) {
  .glass,
  .glass-medium,
  .glass-heavy {
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
}

/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .animated-gradient-bg {
    animation: none;
  }
  .blob-bg::before,
  .blob-bg::after {
    animation: none;
  }
  .glass-hover:hover {
    transform: none;
  }
}
```

### Performance Guidelines
| Blur Value | Performance | Device Support |
|-----------|-------------|----------------|
| `blur(4px)` | Excellent | All devices |
| `blur(8px)` | Great | All modern devices |
| `blur(12px)` | Good | Desktop + flagship mobile |
| `blur(16px)` | Moderate | Desktop recommended |
| `blur(20px+)` | Heavy | Desktop only |

---

## Critical Rules

1. **ALWAYS include `-webkit-backdrop-filter`** — Safari requires the prefix even in 2026
2. **Glass ONLY works over colorful backgrounds** — always provide gradient/image behind glass elements
3. **Maximum 3-4 glass layers stacked** — each layer compounds GPU cost
4. **Use `saturate(180%)` with blur** — prevents washed-out look: `backdrop-filter: blur(12px) saturate(180%)`
5. **Border is ESSENTIAL** — without the 1px border, glass elements lose edge definition
6. **Text minimum weight 500 on glass** — thin text becomes unreadable on transparent surfaces
7. **Use `hsla()` not `rgba()`** — hsl is easier to maintain and adjust
8. **Keep blur ≤12px on mobile** — larger blurs cause scroll jank on mid-range phones
9. **`contain: paint` on glass elements** — scope the compositing cost
10. **Never put glass over solid white** — it becomes invisible; always use colored/gradient backgrounds
11. **Add `inset` shadow for depth** — `inset 0 1px 0 hsla(0,0%,100%,0.2)` creates realistic top reflection
12. **Test on Firefox** — it requires `backdrop-filter` (no prefix) and may need explicit `isolation: isolate` on parent

---

## Tailwind CSS Quick Reference

```html
<!-- Basic glass card -->
<div class="bg-white/20 backdrop-blur-xl border border-white/20 shadow-xl rounded-2xl p-6">

<!-- Dark glass -->
<div class="bg-black/30 backdrop-blur-lg border border-white/10 shadow-2xl rounded-3xl p-8">

<!-- Glass nav -->
<nav class="fixed top-0 inset-x-0 bg-white/15 backdrop-blur-md border-b border-white/10 px-6 py-4 z-50">

<!-- Glass button -->
<button class="bg-white/15 backdrop-blur-sm border border-white/20 rounded-xl px-6 py-3 text-white font-semibold hover:bg-white/25 transition-all">

<!-- Glass input -->
<input class="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/50 focus:border-white/30 outline-none">
```

---

## Complete Example: Glass Landing Page

```tsx
export function GlassLandingPage() {
  return (
    <div className="gradient-bg">
      {/* Glass Navigation */}
      <nav className="glass-nav">
        <div className="nav-content">
          <span className="logo">✦ Brand</span>
          <div className="nav-links">
            <a href="#" className="active">Home</a>
            <a href="#">Features</a>
            <a href="#">Pricing</a>
            <a href="#">Contact</a>
          </div>
          <button className="glass-button glass-button-primary">Get Started</button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="glass glass-hover hero-card">
          <h1>Build Beautiful Interfaces</h1>
          <p>Create stunning glassmorphism designs with modern CSS</p>
          <div className="hero-actions">
            <button className="glass-button glass-button-primary">Start Free</button>
            <button className="glass-button">Learn More</button>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="features">
        <div className="glass feature-card">
          <div className="feature-icon">🎨</div>
          <h3>Beautiful Design</h3>
          <p>Stunning frosted glass effects that captivate users</p>
        </div>
        <div className="glass feature-card">
          <div className="feature-icon">⚡</div>
          <h3>Performance</h3>
          <p>Optimized for smooth 60fps on all devices</p>
        </div>
        <div className="glass feature-card">
          <div className="feature-icon">♿</div>
          <h3>Accessible</h3>
          <p>WCAG compliant contrast and readability</p>
        </div>
      </section>
    </div>
  );
}
```
