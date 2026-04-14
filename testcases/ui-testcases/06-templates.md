# TC-06: Templates

## 6.1 Template Gallery (P1)

### TC-6.1.1 — View template gallery
- **Steps**: Click "Templates" in sidebar or on dashboard "Templates" tab.
- **Expected**: Template gallery loads. Template cards shown with previews, titles, descriptions. Categories visible.

### TC-6.1.2 — Template categories
- **Steps**: Browse template categories.
- **Expected**: Categories include: Starter, Dashboard, Marketing, E-commerce, Content, Personal, Productivity (or similar). Clicking a category filters templates.

### TC-6.1.3 — Search templates
- **Steps**: Type "landing page" in template search.
- **Expected**: Templates filtered to show landing page templates. Results update as you type.

### TC-6.1.4 — Template preview modal
- **Steps**: Click on a template card.
- **Expected**: Preview modal opens showing iframe preview of the template. Template details visible (features, description).

### TC-6.1.5 — Template preview renders correctly
- **Steps**: In preview modal, observe the template render.
- **Expected**: Template renders fully (no broken images, no missing styles). Interactive elements may work.

## 6.2 Create from Template (P0)

### TC-6.2.1 — "Use Template" flow
- **Steps**: Open template preview → click "Use Template" → enter project name → confirm.
- **Expected**: New project created from template. Navigates to editor. All template files present. Preview shows the template rendered.

### TC-6.2.2 — Template scaffold integrity
- **Steps**: After creating from template, check file tree.
- **Expected**: All template files present (components, styles, assets, config). No missing files. Package.json (if applicable) includes dependencies.

### TC-6.2.3 — Template project runs immediately
- **Steps**: After scaffolding, observe preview.
- **Expected**: Preview shows the template working out of the box. No errors. Interactive features functional.

### TC-6.2.4 — Customize template with AI
- **Steps**: Create from template → send AI prompt "Change the color scheme to purple and add a testimonials section".
- **Expected**: AI modifies the template code. Preview shows purple color scheme and new testimonials section. Template structure preserved.

### TC-6.2.5 — Build on top of template
- **Steps**: Create from template → send multiple prompts to add features.
- **Expected**: AI respects existing template code. New features integrated without breaking template functionality.

## 6.3 Template Variety (P1)

### TC-6.3.1 — Each template is unique
- **Steps**: Create projects from 3 different templates. Compare.
- **Expected**: Each template produces distinct code and layout. Not generic duplicates.

### TC-6.3.2 — Complex template (Dashboard)
- **Steps**: Create from a Dashboard template.
- **Expected**: Dashboard has charts, tables, sidebar nav, header. Complex layout works.

### TC-6.3.3 — Simple template (Blank/Starter)
- **Steps**: Create from Blank/Starter template.
- **Expected**: Minimal scaffold. Clean starting point. Ready for AI customization.

### TC-6.3.4 — E-commerce template
- **Steps**: Create from an E-commerce template.
- **Expected**: Product cards, cart UI, checkout form. E-commerce layout complete. May include sample products.

## 6.4 Template with Environments (P2)

### TC-6.4.1 — Template includes context overrides
- **Steps**: Create from template. Check project's knowledge/context files.
- **Expected**: Template-specific context files created (architecture.md, guidelines.md with template-specific info).

### TC-6.4.2 — Template + Supabase integration
- **Steps**: Create from a template that includes database features → connect Supabase.
- **Expected**: Template code uses Supabase. Connection works. Data flows correctly.
