/**
 * Blog template — large component code file strings.
 */

export const blogLargeComponents: Record<string, string> = {
    "src/components/post-detail.tsx": `import { useState } from "react";
import { ArrowLeft, Clock, MessageSquare, Send } from "lucide-react";
import type { Post } from "@/data/posts";

interface PostDetailProps {
  post: Post;
  onBack: () => void;
}

interface Comment {
  id: string;
  author: string;
  content: string;
  date: string;
}

export const PostDetail = ({ post, onBack }: PostDetailProps) => {
  const [comments, setComments] = useState<Comment[]>([
    { id: "c1", author: "Reader", content: "Great article! Very insightful.", date: "2 hours ago" },
  ]);
  const [newComment, setNewComment] = useState("");

  const addComment = () => {
    if (!newComment.trim()) return;
    setComments((prev) => [
      ...prev,
      {
        id: \`c\${Date.now()}\`,
        author: "You",
        content: newComment.trim(),
        date: "Just now",
      },
    ]);
    setNewComment("");
  };

  return (
    <article className="space-y-8">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to posts
      </button>

      <div>
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
        <h1 className="text-3xl font-bold tracking-tight">{post.title}</h1>
        <div className="flex items-center gap-2 mt-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            {post.authorAvatar}
          </div>
          <span className="text-sm font-medium">{post.author}</span>
        </div>
      </div>

      <div className="prose prose-sm max-w-none">
        {post.content.split("\\n\\n").map((paragraph, i) => {
          if (paragraph.startsWith("## ")) {
            return (
              <h2 key={i} className="text-xl font-semibold mt-8 mb-3">
                {paragraph.replace("## ", "")}
              </h2>
            );
          }
          if (paragraph.startsWith("- ")) {
            return (
              <ul key={i} className="list-disc list-inside space-y-1 text-muted-foreground">
                {paragraph.split("\\n").map((line, j) => (
                  <li key={j}>{line.replace("- ", "")}</li>
                ))}
              </ul>
            );
          }
          if (paragraph.match(/^\\d\\./)) {
            return (
              <ol key={i} className="list-decimal list-inside space-y-1 text-muted-foreground">
                {paragraph.split("\\n").map((line, j) => (
                  <li key={j}>{line.replace(/^\\d+\\.\\s*/, "")}</li>
                ))}
              </ol>
            );
          }
          return (
            <p key={i} className="text-muted-foreground leading-relaxed">
              {paragraph}
            </p>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 pt-4 border-t">
        {post.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-secondary px-3 py-1 text-xs font-medium"
          >
            #{tag}
          </span>
        ))}
      </div>

      {/* Comments */}
      <div className="border-t pt-8 space-y-6">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Comments ({comments.length})
        </h3>

        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{comment.author}</span>
                <span className="text-xs text-muted-foreground">{comment.date}</span>
              </div>
              <p className="text-sm text-muted-foreground">{comment.content}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addComment()}
            placeholder="Write a comment..."
            className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            onClick={addComment}
            disabled={!newComment.trim()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
};
`,

    "src/components/sidebar.tsx": `import { CATEGORIES, POSTS } from "@/data/posts";
import { Tag, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  activeCategory: string | null;
  onSelectCategory: (category: string | null) => void;
}

export const Sidebar = ({ activeCategory, onSelectCategory }: SidebarProps) => {
  const allTags = Array.from(new Set(POSTS.flatMap((p) => p.tags)));

  return (
    <aside className="space-y-8">
      {/* Categories */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Tag className="h-4 w-4" />
          Categories
        </h3>
        <div className="space-y-1">
          <button
            onClick={() => onSelectCategory(null)}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors",
              !activeCategory
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            All Posts
            <span className="text-xs">{POSTS.length}</span>
          </button>
          {CATEGORIES.map((cat) => {
            const count = POSTS.filter((p) => p.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => onSelectCategory(cat)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors",
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {cat}
                <span className="text-xs">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Trending Tags */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Trending Tags
        </h3>
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium cursor-pointer hover:bg-secondary/80 transition-colors"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>

      {/* Newsletter */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Newsletter</h3>
        <p className="text-xs text-muted-foreground">
          Get the latest posts delivered to your inbox.
        </p>
        <input
          type="email"
          placeholder="your@email.com"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button className="flex w-full h-9 items-center justify-center rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          Subscribe
        </button>
      </div>
    </aside>
  );
};
`,
};
