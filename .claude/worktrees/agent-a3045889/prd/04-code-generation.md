# 04 — Code Generation & Tech Stack

## Overview

Doable generates clean, maintainable, production-ready React/TypeScript projects. The generated code follows modern best practices and uses a consistent, well-known tech stack that developers can easily extend and customize.

---

## 1. Generated Tech Stack

### 1.1 Core Stack
| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | React | 18.2+ |
| **Language** | TypeScript | 5.2+ |
| **Build Tool** | Vite | 5.0+ |
| **Routing** | React Router | v6.22+ |
| **Styling** | Tailwind CSS | 3.4+ |
| **Components** | shadcn/ui (Radix-based) | Latest |
| **Icons** | Lucide React | 0.300+ |
| **CSS Utilities** | class-variance-authority, clsx, tailwind-merge | Latest |
| **Backend** | PostgreSQL (via Doable Cloud) | 15+ |
| **Edge Functions** | Serverless JS/TS | Deno runtime |

### 1.2 Full Dependency List (package.json)
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "@radix-ui/react-*": "^1.x",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0",
    "lucide-react": "^0.300.0",
    "@supabase/supabase-js": "^2.x"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.2.0",
    "vite": "^5.0.0",
    "vitest": "latest"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest"
  }
}
```

### 1.3 Conditional Dependencies
Added when corresponding features are requested:
| Feature | Package |
|---------|---------|
| Database/Auth | `@supabase/supabase-js` |
| Payments | Stripe SDK (edge function side) |
| Charts | `recharts` or `chart.js` |
| Forms | `react-hook-form`, `zod` |
| Date handling | `date-fns` |
| Animations | `framer-motion` |
| Rich text | `tiptap` or `slate` |
| Maps | `mapbox-gl` or `leaflet` |
| State (complex) | `@tanstack/react-query` |
| 3D graphics | `three.js`, `@react-three/fiber` |
| PWA | `workbox`, web app manifest, service worker |
| Diagrams | `mermaid` (for rendering architecture diagrams) |

---

## 2. Generated File Structure

```
my-project/
├── public/
│   ├── index.html              # Entry HTML with <base href="/">
│   ├── favicon.ico             # Generated or uploaded favicon
│   └── og-image.png            # Open Graph image (if generated)
│
├── src/
│   ├── components/
│   │   ├── ui/                 # shadcn/ui base components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── table.tsx
│   │   │   ├── toast.tsx
│   │   │   └── ...
│   │   ├── layout/             # Layout components
│   │   │   ├── Navbar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── PageLayout.tsx
│   │   └── [feature]/          # Feature-specific components
│   │       ├── FeatureCard.tsx
│   │       └── FeatureList.tsx
│   │
│   ├── pages/                  # Route pages
│   │   ├── Index.tsx
│   │   ├── About.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Login.tsx
│   │   ├── NotFound.tsx
│   │   └── ...
│   │
│   ├── hooks/                  # Custom React hooks
│   │   ├── useAuth.ts
│   │   ├── useSupabase.ts
│   │   └── ...
│   │
│   ├── lib/                    # Utility functions
│   │   ├── utils.ts            # cn() helper, general utils
│   │   ├── supabase.ts         # Supabase client singleton
│   │   └── ...
│   │
│   ├── types/                  # TypeScript type definitions
│   │   └── index.ts
│   │
│   ├── App.tsx                 # Route definitions, layout wrapper
│   ├── main.tsx                # Entry: <BrowserRouter><App/></BrowserRouter>
│   └── index.css               # Tailwind @imports, global styles
│
├── .doable/                    # Doable agent instructions (auto-generated)
│   ├── knowledge.md            # Project vision, custom knowledge
│   └── plan.md                 # Active plan (from Plan Mode)
│
├── supabase/                   # Backend (if integrated)
│   ├── functions/              # Edge functions
│   │   ├── stripe-webhook/
│   │   │   └── index.ts
│   │   └── send-email/
│   │       └── index.ts
│   ├── migrations/             # SQL migrations
│   │   ├── 001_create_users.sql
│   │   └── 002_create_posts.sql
│   └── config.toml
│
├── .env.local                  # Secrets (not committed)
├── .gitignore
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── components.json             # shadcn/ui config
└── README.md
```

---

## 3. Configuration Files

### 3.1 vite.config.ts
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### 3.2 tsconfig.json
- Strict mode enabled
- Path aliases (`@/*` → `src/*`)
- React JSX transform
- Extends app/node configs

### 3.3 tailwind.config.js
- shadcn/ui defaults
- Theme extensions from design systems
- Content paths for purging
- Custom color/spacing scales when specified

### 3.4 components.json (shadcn/ui)
- Style: "default" or "new-york"
- TypeScript: true
- Tailwind CSS path
- Components path
- Utils path

---

## 4. Routing Pattern

### 4.1 BrowserRouter Setup
```typescript
// src/main.tsx
const base = import.meta.env.VITE_BASE_PATH || '/';
createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename={base}>
    <App />
  </BrowserRouter>
);
```

### 4.2 Route Organization
```typescript
// src/App.tsx
<Routes>
  <Route path="/" element={<Index />} />
  <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
  <Route path="/login" element={<Login />} />
  <Route path="/signup" element={<Signup />} />
  <Route path="*" element={<NotFound />} />
</Routes>
```

### 4.3 Data Loading
- React Router v6 loaders/actions for data fetching
- No external state management library by default
- `@tanstack/react-query` added when complex caching needed

---

## 5. Code Quality Standards

### 5.1 Generated Code Characteristics
| Aspect | Standard |
|--------|----------|
| **Type Safety** | Full TypeScript, no `any` types |
| **Components** | Functional components with hooks |
| **Styling** | Tailwind CSS utility classes |
| **Imports** | Path aliases (`@/components/...`) |
| **Naming** | PascalCase components, camelCase functions |
| **File Organization** | Feature-based grouping |
| **Modularity** | Small, focused components |
| **Accessibility** | Radix-based components with ARIA |
| **Responsiveness** | Mobile-first Tailwind breakpoints |

### 5.2 Testing Support
- **Vitest** included in React template by default
- Agent can write and run tests without additional setup
- Supports unit and integration tests

### 5.3 Commit Messages
- Descriptive messages about what actually changed in the project
- Not just restatements of the user's prompt
- Follows conventional commit patterns

### 5.4 SEO & Open Graph Support
- Full SEO meta tags generated (`<title>`, `<meta description>`, canonical)
- Open Graph images auto-generated for social sharing
- Favicons and logos auto-generated on prompt
- Proper card previews when links shared on social platforms (X, LinkedIn, etc.)
- Configurable per page

### 5.5 PWA Generation
- Agent can convert any app to a PWA on prompt: "Turn this into a PWA"
- Generates:
  - Web app manifest (`manifest.json` with name, icons, display mode)
  - Service worker for basic offline support
  - PWA splash screens for iOS and Android
  - Install prompt handling
- Limitations on iOS noted (Safari PWA restrictions)
- Good for prototypes and internal tools; native app recommended for App Store

### 5.6 3D Application Support
- Support for **three.js** and `@react-three/fiber` for 3D apps
- Agent can generate 3D scenes, models, animations from prompts
- Added via conditional dependency when 3D features are requested

---

## 6. Design Systems (Enterprise)

### 6.1 Overview
- Ongoing, dynamic instructions applied automatically to connected projects
- React npm packages with custom shadcn/ui themes
- Evolve over time as guidelines change

### 6.2 Implementation
- Design system as private npm package
- Auto-applied to all connected projects
- Theme overrides, custom components, brand colors
- Supports private npm registries via secrets

---

## 7. Design Templates (Business+)

### 7.1 Overview
- Mark existing projects as reusable templates
- New projects can start from any template
- Full codebase copied as starting point

### 7.2 Template Management
- Mark/unmark from Project Settings
- Template gallery in workspace
- Version updates to templates propagate to new projects (not existing)
