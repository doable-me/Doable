import type { TemplateDefinition } from "../registry.js";
import { blankTemplate } from "./blank.js";
import { blogLargeComponents } from "./blog-code-components.js";

export const blogTemplate: TemplateDefinition = {
  id: "blog",
  name: "Blog",
  description:
    "Blog with posts list, full article view, categories sidebar, and comment section. Clean reading experience.",
  category: "content",
  tags: ["react", "blog", "content", "articles", "comments", "categories"],
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

    "src/App.tsx": `import { useState } from "react";
import { BlogHeader } from "@/components/blog-header";
import { PostList } from "@/components/post-list";
import { PostDetail } from "@/components/post-detail";
import { Sidebar } from "@/components/sidebar";
import { POSTS } from "@/data/posts";

export default function App() {
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const selectedPost = POSTS.find((p) => p.id === selectedPostId);
  const filteredPosts = activeCategory
    ? POSTS.filter((p) => p.category === activeCategory)
    : POSTS;

  return (
    <div className="min-h-screen bg-background">
      <BlogHeader
        onLogoClick={() => {
          setSelectedPostId(null);
          setActiveCategory(null);
        }}
      />
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          <main>
            {selectedPost ? (
              <PostDetail
                post={selectedPost}
                onBack={() => setSelectedPostId(null)}
              />
            ) : (
              <PostList
                posts={filteredPosts}
                onSelectPost={(id) => setSelectedPostId(id)}
              />
            )}
          </main>
          <Sidebar
            activeCategory={activeCategory}
            onSelectCategory={(cat) => {
              setActiveCategory(cat);
              setSelectedPostId(null);
            }}
          />
        </div>
      </div>
    </div>
  );
}
`,

    "src/data/posts.ts": `export interface Post {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  authorAvatar: string;
  category: string;
  date: string;
  readTime: string;
  tags: string[];
}

export const CATEGORIES = [
  "Technology",
  "Design",
  "Business",
  "Lifestyle",
];

export const POSTS: Post[] = [
  {
    id: "1",
    title: "Building Scalable React Applications in 2025",
    excerpt: "Learn the latest patterns for building React apps that scale with your team and user base.",
    content: \`React continues to evolve, and with it, the patterns we use to build applications. In this post, we'll explore modern approaches to building scalable React applications.

## Component Architecture

The key to scalability is a well-thought-out component architecture. We recommend organizing components into three tiers:

1. **UI Components** — Pure presentational components that accept props and render UI
2. **Feature Components** — Components that compose UI components and manage feature-specific state
3. **Page Components** — Top-level components that handle routing and data fetching

## State Management

For most applications, React's built-in state management is sufficient. Use \\\`useState\\\` for local state, \\\`useReducer\\\` for complex state logic, and \\\`useContext\\\` for shared state that doesn't change frequently.

For larger applications, consider:
- **Zustand** for simple global state
- **TanStack Query** for server state
- **Jotai** for atomic state management

## Performance Optimization

Key strategies include:
- Code splitting with \\\`React.lazy\\\` and \\\`Suspense\\\`
- Memoization with \\\`useMemo\\\` and \\\`useCallback\\\`
- Virtual scrolling for long lists
- Image lazy loading

## Conclusion

Building scalable React apps is about making good architectural decisions early and being consistent with patterns across your codebase.\`,
    author: "Alex Chen",
    authorAvatar: "AC",
    category: "Technology",
    date: "Mar 12, 2025",
    readTime: "8 min read",
    tags: ["react", "architecture", "frontend"],
  },
  {
    id: "2",
    title: "The Art of Minimalist UI Design",
    excerpt: "How constraints and white space create more impactful user interfaces.",
    content: \`Minimalism in UI design isn't about removing everything — it's about keeping only what matters.

## The Power of White Space

White space (or negative space) gives your content room to breathe. It improves readability, draws attention to key elements, and creates a sense of elegance.

## Color Restraint

A minimalist palette typically uses:
- One primary action color
- Neutral grays for text and borders
- White or near-white backgrounds

## Typography as Design

When you strip away decorative elements, typography becomes your primary design tool. Choose a versatile type family and use size, weight, and spacing to create hierarchy.

## Practical Tips

1. Start with too little, then add only what's necessary
2. Every element should earn its place
3. Use consistent spacing scales (4px, 8px, 16px, 24px, 32px)
4. Test with real content, not lorem ipsum\`,
    author: "Maya Johnson",
    authorAvatar: "MJ",
    category: "Design",
    date: "Mar 10, 2025",
    readTime: "5 min read",
    tags: ["design", "ui", "minimalism"],
  },
  {
    id: "3",
    title: "From Side Project to SaaS: A Founder's Journey",
    excerpt: "Lessons learned turning a weekend hack into a profitable software business.",
    content: \`Every successful SaaS started as someone's side project. Here's what I learned building mine.

## Finding the Problem

The best side projects solve your own problems. I was frustrated with existing tools for managing client feedback, so I built a simple alternative over a weekend.

## The MVP Trap

It's tempting to keep adding features before launching. Instead, ship the smallest thing that could be useful. My MVP had three features: collect feedback, organize it, and send notifications.

## Getting First Users

I shared it on Twitter, posted on a few forums, and asked friends to try it. The first 10 users gave me more insight than months of solo development.

## Pricing Early

I started charging from day one — even if it was just \$9/month. This validated that people would actually pay for the product.

## Scaling Up

Once I had 50 paying customers, I quit my job and went full-time. The key was having 6 months of runway saved up.

## Key Takeaways

- Solve your own problem first
- Ship fast, iterate faster
- Charge from day one
- Talk to your users constantly\`,
    author: "James Wright",
    authorAvatar: "JW",
    category: "Business",
    date: "Mar 8, 2025",
    readTime: "7 min read",
    tags: ["saas", "startup", "entrepreneurship"],
  },
  {
    id: "4",
    title: "Designing Your Perfect Home Office",
    excerpt: "Create a workspace that boosts productivity without sacrificing comfort.",
    content: \`Your environment shapes your work. Here's how to design a home office that works for you.

## The Essentials

Start with the fundamentals:
- A good chair (invest here — your back will thank you)
- A desk at the right height
- Proper lighting (natural light is best)
- A quality monitor at eye level

## Cable Management

Nothing kills focus like visual clutter. Use cable trays, velcro ties, and wireless peripherals to keep things tidy.

## Plants and Nature

Studies show plants improve focus and reduce stress. Add 2-3 low-maintenance plants like pothos or snake plants.

## Sound

Consider your audio environment. A good pair of headphones, a white noise machine, or a small speaker for background music can help you get into flow state.

## Personal Touches

Make the space yours. A few meaningful objects, art prints, or photos can make your office feel less sterile without becoming distracting.\`,
    author: "Sarah Kim",
    authorAvatar: "SK",
    category: "Lifestyle",
    date: "Mar 5, 2025",
    readTime: "4 min read",
    tags: ["productivity", "workspace", "remote-work"],
  },
];
`,

    "src/components/blog-header.tsx": `import { BookOpen } from "lucide-react";

interface BlogHeaderProps {
  onLogoClick: () => void;
}

export const BlogHeader = ({ onLogoClick }: BlogHeaderProps) => (
  <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
    <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
      <button
        onClick={onLogoClick}
        className="flex items-center gap-2 text-lg font-bold hover:opacity-80 transition-opacity"
      >
        <BookOpen className="h-5 w-5" />
        Blog
      </button>
      <nav className="flex items-center gap-4 text-sm">
        <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
          About
        </a>
        <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
          Newsletter
        </a>
      </nav>
    </div>
  </header>
);
`,

    "src/components/post-list.tsx": `import { Clock, ArrowRight } from "lucide-react";
import type { Post } from "@/data/posts";

interface PostListProps {
  posts: Post[];
  onSelectPost: (id: string) => void;
}

export const PostList = ({ posts, onSelectPost }: PostListProps) => (
  <div className="space-y-6">
    <h1 className="text-3xl font-bold tracking-tight">Latest Posts</h1>
    <div className="space-y-8">
      {posts.map((post) => (
        <article
          key={post.id}
          className="group cursor-pointer rounded-lg border bg-card p-6 transition-shadow hover:shadow-md"
          onClick={() => onSelectPost(post.id)}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">
              {post.category}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {post.readTime}
            </span>
            <span>{post.date}</span>
          </div>
          <h2 className="text-xl font-semibold group-hover:text-primary transition-colors">
            {post.title}
          </h2>
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {post.excerpt}
          </p>
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {post.authorAvatar}
              </div>
              <span className="text-sm font-medium">{post.author}</span>
            </div>
            <span className="flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              Read more <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </article>
      ))}
    </div>
  </div>
);
`,

    ...blogLargeComponents,
  },

  contextOverrides: {
    "identity.md": `# Project Identity

## Name
Blog

## Purpose
A content-focused blog with post listings, full article view, categories, tags, and comments.

## Personality & Tone
- Clean, readable typography
- Content-first layout
- Minimal distractions from reading
`,
    "knowledge.md": `# Knowledge Base

## Tech Stack
- Frontend: React 19 + Vite 6 + TypeScript (strict)
- Styling: Tailwind CSS 3
- Icons: Lucide React

## Architecture
- \`src/data/posts.ts\` — Post data and types
- \`src/components/\` — UI components (header, post list, post detail, sidebar)
- State-based navigation (no router)
- Category filtering via sidebar

## Patterns
- Article cards with metadata (category, read time, date)
- Markdown-like content rendering
- Category sidebar with counts
- Comment system with local state
- Newsletter signup widget
`,
  },
};
