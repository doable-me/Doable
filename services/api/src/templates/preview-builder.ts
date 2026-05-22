import type { TemplateDefinition } from "./registry.js";
import {
  escapeHtml,
  landingPagePreview,
  saasDashboardPreview,
  ecommercePreview,
  blogPreview,
  portfolioPreview,
  todoAppPreview,
  blankPreview,
} from "./preview-templates.js";

/**
 * Build a self-contained HTML preview page for a template.
 * Uses static HTML with Tailwind CSS to render a realistic preview
 * that matches what the template would look like when built.
 */
export function buildTemplatePreviewHtml(template: TemplateDefinition): string {
  const previewBody = getTemplatePreviewBody(template);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(template.name)} — Preview</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
          colors: {
            border: 'hsl(var(--border))',
            input: 'hsl(var(--input))',
            ring: 'hsl(var(--ring))',
            background: 'hsl(var(--background))',
            foreground: 'hsl(var(--foreground))',
            primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
            secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
            destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
            muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
            accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
            card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
          },
          borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
        },
      },
    };
  <\/script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --background: 0 0% 100%;
      --foreground: 0 0% 3.9%;
      --muted: 0 0% 96.1%;
      --muted-foreground: 0 0% 45.1%;
      --card: 0 0% 100%;
      --card-foreground: 0 0% 3.9%;
      --border: 0 0% 89.8%;
      --input: 0 0% 89.8%;
      --primary: 262 83% 58%;
      --primary-foreground: 0 0% 98%;
      --secondary: 0 0% 96.1%;
      --secondary-foreground: 0 0% 9%;
      --accent: 0 0% 96.1%;
      --accent-foreground: 0 0% 9%;
      --destructive: 0 84.2% 60.2%;
      --destructive-foreground: 0 0% 98%;
      --ring: 262 83% 58%;
      --radius: 0.5rem;
    }
    * { border-color: hsl(var(--border)); }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background-color: hsl(var(--background));
      color: hsl(var(--foreground));
      -webkit-font-smoothing: antialiased;
      margin: 0; padding: 0;
    }
  </style>
</head>
<body>
${previewBody}
</body>
</html>`;
}

function getTemplatePreviewBody(template: TemplateDefinition): string {
  switch (template.id) {
    case "landing-page":
      return landingPagePreview();
    case "saas-dashboard":
      return saasDashboardPreview();
    case "ecommerce-store":
      return ecommercePreview();
    case "blog":
      return blogPreview();
    case "portfolio":
      return portfolioPreview();
    case "todo-app":
      return todoAppPreview();
    default:
      return blankPreview(template);
  }
}
