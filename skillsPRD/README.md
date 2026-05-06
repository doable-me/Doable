# Doable AI Skills PRD — Index

This folder contains detailed Product Requirement Documents for new AI skills to be built into Doable's AI generation system. Each skill enables the AI to generate specific types of web applications/designs when users request them.

## Skills Catalog

| # | Skill | File | Trigger Keywords |
|---|-------|------|-----------------|
| 1 | **Brochure & Flyer Builder** | [brochure-flyer-builder.md](./brochure-flyer-builder.md) | brochure, flyer, tri-fold, pamphlet, newsletter, poster |
| 2 | **Magazine Page-Flip Reader** | [magazine-page-flip.md](./magazine-page-flip.md) | magazine, flipbook, page flip, catalog, lookbook |
| 3 | **Interactive Dashboard** | [dashboard-builder.md](./dashboard-builder.md) | dashboard, analytics, KPI, charts, metrics, real-time |
| 4 | **Glassmorphism UI Design** | [glassmorphism-design.md](./glassmorphism-design.md) | glass effect, frosted glass, backdrop blur, glass card |
| 5 | **Creative Typography** | [creative-typography.md](./creative-typography.md) | styled fonts, gradient text, neon text, 3D text, kinetic type |

## How Skills Work in Doable

Skills are markdown files that:
1. **Auto-trigger** based on keywords in user prompts
2. **Guide the AI** with specific implementation patterns, dependencies, and CSS
3. **Enforce rules** that prevent common mistakes (Critical Rules section)
4. **Provide templates** — complete code examples the AI can adapt

### Skill File Structure

Each skill PRD follows this format:
```
# Skill: [Name]
## Trigger Keywords       — When to activate this skill
## Purpose                — What it generates
## Dependencies           — npm packages needed
## Architecture           — File/folder structure
## [Core sections]        — Implementation details, CSS, components
## Critical Rules         — MUST-follow rules to prevent common errors
## Complete Example       — Full working code the AI can reference
```

### Integration Path

These PRD files will be converted to actual AI skill files at:
```
services/api/src/ai/skills/vite-react/[skill-name].md
```

The existing skill loader (`services/api/src/ai/skills/`) reads these at runtime and injects them into the AI's context when trigger keywords match.

## Design Philosophy

All skills share these principles:
- **Vite + React** — All generated projects use the Vite React framework
- **Zero-config** — Skills should produce working apps with `npm install && npm run dev`
- **Self-contained** — No external API keys or backend required
- **Mobile-first** — Responsive by default; touch-friendly
- **Performance-aware** — Include optimization patterns for production
- **Accessible** — WCAG compliance in Critical Rules
- **Export-ready** — PDF export for print skills, PNG for visual skills

## Priority Order for Implementation

1. **Glassmorphism** — Quick win, pure CSS, no new deps needed
2. **Creative Typography** — Pure CSS + optional Fontsource; high visual impact
3. **Dashboard Builder** — High demand, needs Recharts + react-grid-layout
4. **Brochure/Flyer** — Unique differentiator, needs html2canvas + jsPDF
5. **Magazine Page-Flip** — Impressive UX, needs page-flip library
