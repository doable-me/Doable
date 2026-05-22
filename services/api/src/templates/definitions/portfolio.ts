import type { TemplateDefinition } from "../registry.js";
import { blankTemplate } from "./blank.js";

export const portfolioTemplate: TemplateDefinition = {
  id: "portfolio",
  name: "Portfolio",
  description:
    "Personal portfolio with hero section, project gallery, skills display, and contact form. Clean, professional design.",
  category: "personal",
  tags: ["react", "portfolio", "personal", "projects", "skills", "contact"],
  previewImageUrl: null,
  isOfficial: true,
  framework_id: "vite-react",

  codeFiles: {
    "package.json": blankTemplate.codeFiles["package.json"]!,
    "vite.config.ts": blankTemplate.codeFiles["vite.config.ts"]!,
    "tsconfig.json": blankTemplate.codeFiles["tsconfig.json"]!,
    "index.html": blankTemplate.codeFiles["index.html"]!,
    "src/main.tsx": blankTemplate.codeFiles["src/main.tsx"]!,
    "src/index.css": blankTemplate.codeFiles["src/index.css"]!,
    "src/lib/utils.ts": blankTemplate.codeFiles["src/lib/utils.ts"]!,

    "src/App.tsx": `import { PortfolioNav } from "@/components/portfolio-nav";
import { Hero } from "@/components/hero";
import { Projects } from "@/components/projects";
import { Skills } from "@/components/skills";
import { Contact } from "@/components/contact";
import { Footer } from "@/components/footer";

export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <PortfolioNav />
      <Hero />
      <Projects />
      <Skills />
      <Contact />
      <Footer />
    </div>
  );
}
`,

    "src/components/portfolio-nav.tsx": `export const PortfolioNav = () => (
  <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
    <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
      <span className="text-lg font-bold">JD</span>
      <nav className="flex items-center gap-6 text-sm">
        <a href="#projects" className="text-muted-foreground hover:text-foreground transition-colors">
          Projects
        </a>
        <a href="#skills" className="text-muted-foreground hover:text-foreground transition-colors">
          Skills
        </a>
        <a href="#contact" className="text-muted-foreground hover:text-foreground transition-colors">
          Contact
        </a>
      </nav>
    </div>
  </header>
);
`,

    "src/components/hero.tsx": `import { Github, Linkedin, Mail, ArrowDown } from "lucide-react";

export const Hero = () => (
  <section className="container mx-auto max-w-5xl px-4 py-24 md:py-32">
    <div className="max-w-2xl space-y-6">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-2xl font-bold text-white">
        JD
      </div>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Hi, I'm <span className="text-primary">Jane Doe</span>
      </h1>
      <p className="text-lg text-muted-foreground leading-relaxed">
        Full-stack developer and designer crafting thoughtful digital experiences.
        I specialize in React, TypeScript, and modern web technologies. Currently
        available for freelance work.
      </p>
      <div className="flex items-center gap-4">
        <a href="#contact" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          Get in Touch
        </a>
        <a href="#projects" className="inline-flex h-10 items-center justify-center rounded-md border border-input px-6 text-sm font-medium hover:bg-accent transition-colors">
          View Work
        </a>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <a href="#" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Github className="h-5 w-5" />
        </a>
        <a href="#" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Linkedin className="h-5 w-5" />
        </a>
        <a href="#" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Mail className="h-5 w-5" />
        </a>
      </div>
    </div>
  </section>
);
`,

    "src/components/projects.tsx": `import { ExternalLink, Github } from "lucide-react";

interface Project {
  title: string;
  description: string;
  tags: string[];
  liveUrl: string;
  githubUrl: string;
  gradient: string;
}

const PROJECTS: Project[] = [
  {
    title: "TaskFlow",
    description: "Project management tool with kanban boards, timeline views, and real-time collaboration for distributed teams.",
    tags: ["React", "TypeScript", "Supabase", "Tailwind CSS"],
    liveUrl: "#",
    githubUrl: "#",
    gradient: "from-violet-500 to-purple-600",
  },
  {
    title: "CryptoTracker",
    description: "Real-time cryptocurrency dashboard with portfolio tracking, price alerts, and historical charts.",
    tags: ["Next.js", "Chart.js", "WebSocket", "PostgreSQL"],
    liveUrl: "#",
    githubUrl: "#",
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    title: "RecipeBook",
    description: "Social recipe platform with ingredient scaling, meal planning, and nutritional information.",
    tags: ["React", "Node.js", "MongoDB", "Cloudinary"],
    liveUrl: "#",
    githubUrl: "#",
    gradient: "from-orange-500 to-amber-600",
  },
  {
    title: "DevBlog",
    description: "Markdown-powered technical blog with syntax highlighting, RSS feed, and full-text search.",
    tags: ["Astro", "MDX", "Shiki", "Tailwind CSS"],
    liveUrl: "#",
    githubUrl: "#",
    gradient: "from-blue-500 to-cyan-600",
  },
];

export const Projects = () => (
  <section id="projects" className="container mx-auto max-w-5xl px-4 py-24">
    <div className="mb-12">
      <h2 className="text-3xl font-bold tracking-tight">Featured Projects</h2>
      <p className="text-muted-foreground mt-2">A selection of my recent work.</p>
    </div>
    <div className="grid gap-6 md:grid-cols-2">
      {PROJECTS.map((project) => (
        <div key={project.title} className="group rounded-lg border bg-card overflow-hidden transition-shadow hover:shadow-md">
          <div className={\`h-40 bg-gradient-to-br \${project.gradient} flex items-center justify-center\`}>
            <span className="text-2xl font-bold text-white/80">
              {project.title.charAt(0)}
            </span>
          </div>
          <div className="p-5 space-y-3">
            <h3 className="text-lg font-semibold">{project.title}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {project.description}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {project.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
                  {tag}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3 pt-1">
              <a href={project.liveUrl} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Live Demo
              </a>
              <a href={project.githubUrl} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                <Github className="h-3 w-3" /> Source
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  </section>
);
`,

    "src/components/skills.tsx": `const SKILL_GROUPS = [
  {
    title: "Frontend",
    skills: [
      { name: "React / Next.js", level: 95 },
      { name: "TypeScript", level: 90 },
      { name: "Tailwind CSS", level: 92 },
      { name: "Vue.js", level: 75 },
    ],
  },
  {
    title: "Backend",
    skills: [
      { name: "Node.js", level: 88 },
      { name: "PostgreSQL", level: 82 },
      { name: "GraphQL", level: 78 },
      { name: "Redis", level: 70 },
    ],
  },
  {
    title: "Tools & Other",
    skills: [
      { name: "Git / GitHub", level: 92 },
      { name: "Docker", level: 80 },
      { name: "Figma", level: 85 },
      { name: "AWS / Vercel", level: 78 },
    ],
  },
];

export const Skills = () => (
  <section id="skills" className="container mx-auto max-w-5xl px-4 py-24">
    <div className="mb-12">
      <h2 className="text-3xl font-bold tracking-tight">Skills & Expertise</h2>
      <p className="text-muted-foreground mt-2">
        Technologies I work with daily.
      </p>
    </div>
    <div className="grid gap-8 md:grid-cols-3">
      {SKILL_GROUPS.map((group) => (
        <div key={group.title} className="rounded-lg border bg-card p-6 space-y-4">
          <h3 className="text-sm font-semibold">{group.title}</h3>
          <div className="space-y-3">
            {group.skills.map((skill) => (
              <div key={skill.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span>{skill.name}</span>
                  <span className="text-xs text-muted-foreground">{skill.level}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: \`\${skill.level}%\` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </section>
);
`,

    "src/components/contact.tsx": `import { useState } from "react";
import { Send, Mail, MapPin, Phone } from "lucide-react";

export const Contact = () => {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <section id="contact" className="container mx-auto max-w-5xl px-4 py-24">
      <div className="mb-12">
        <h2 className="text-3xl font-bold tracking-tight">Get in Touch</h2>
        <p className="text-muted-foreground mt-2">
          Have a project in mind? Let's talk about it.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-[1fr_320px]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="name">Name</label>
              <input
                id="name"
                type="text"
                placeholder="Your name"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="subject">Subject</label>
            <input
              id="subject"
              type="text"
              placeholder="Project inquiry"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="message">Message</label>
            <textarea
              id="message"
              placeholder="Tell me about your project..."
              rows={5}
              required
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Send className="h-4 w-4" />
            {submitted ? "Sent!" : "Send Message"}
          </button>
        </form>

        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-xs text-muted-foreground">jane@example.com</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Location</p>
                <p className="text-xs text-muted-foreground">San Francisco, CA</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <Phone className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Phone</p>
                <p className="text-xs text-muted-foreground">+1 (555) 123-4567</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
`,

    "src/components/footer.tsx": `export const Footer = () => (
  <footer className="border-t">
    <div className="container mx-auto max-w-5xl px-4 py-8 text-center text-sm text-muted-foreground">
      <p>&copy; {new Date().getFullYear()} Jane Doe. Built with React & Tailwind CSS.</p>
    </div>
  </footer>
);
`,
  },

  contextOverrides: {
    "identity.md": `# Project Identity

## Name
Portfolio

## Purpose
A personal developer portfolio showcasing projects, skills, and contact information. Professional and approachable.

## Personality & Tone
- Confident but humble
- Show, don't tell — let the work speak
- Clean, modern aesthetic
`,
    "knowledge.md": `# Knowledge Base

## Tech Stack
- Frontend: React 19 + Vite 6 + TypeScript (strict)
- Styling: Tailwind CSS 3
- Icons: Lucide React

## Architecture
- Single-page with anchor-link navigation
- \`src/components/\` — Section components (hero, projects, skills, contact, footer)
- Each section is self-contained

## Patterns
- Hero with avatar, bio, and social links
- Project cards with gradient thumbnails and tech tags
- Skill bars with progress indicators
- Contact form alongside info cards
- Sticky navbar with anchor links
`,
  },
};
