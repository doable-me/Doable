import type { TemplateDefinition } from "../registry.js";
import { nextjsBlankTemplate } from "./nextjs-blank.js";

/**
 * Next.js (App Router) todo-app starter.
 *
 * Same feature set as the vite-react `todo-app` template (add/edit/delete,
 * priority levels, due dates, filter, localStorage persistence) but
 * implemented as a single client component so it works without a backend.
 *
 * Reuses every nextjs-blank scaffold file (package.json, next.config.ts,
 * tsconfig.json, postcss config, layout.tsx) and overrides only app/page.tsx
 * + adds app/types.ts. The AI can refactor the inline components into
 * `app/components/*` files later if the user asks.
 */

const APP_PAGE = `"use client";

import { useState, useEffect, useCallback } from "react";
import type { Todo, TodoFilter, Priority } from "./types";

const STORAGE_KEY = "doable-nextjs-todos";

function loadTodos(): Todo[] {
  if (typeof window === "undefined") return [];
  try {
    const data = window.localStorage.getItem(STORAGE_KEY);
    return data ? (JSON.parse(data) as Todo[]) : [];
  } catch {
    return [];
  }
}

function saveTodos(todos: Todo[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // localStorage may be unavailable (private mode, quota); silently skip.
  }
}

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  high: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

export default function HomePage() {
  const [hydrated, setHydrated] = useState(false);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [filter, setFilter] = useState<TodoFilter>("all");
  const [draftText, setDraftText] = useState("");
  const [draftPriority, setDraftPriority] = useState<Priority>("medium");
  const [draftDueDate, setDraftDueDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  // Hydrate from localStorage after mount to avoid SSR/CSR mismatch.
  useEffect(() => {
    setTodos(loadTodos());
    setHydrated(true);
  }, []);

  // Persist on every change once hydrated.
  useEffect(() => {
    if (hydrated) saveTodos(todos);
  }, [todos, hydrated]);

  const addTodo = useCallback(() => {
    const text = draftText.trim();
    if (!text) return;
    const todo: Todo = {
      id: crypto.randomUUID(),
      text,
      completed: false,
      priority: draftPriority,
      dueDate: draftDueDate || null,
      createdAt: new Date().toISOString(),
    };
    setTodos((prev) => [todo, ...prev]);
    setDraftText("");
    setDraftPriority("medium");
    setDraftDueDate("");
  }, [draftText, draftPriority, draftDueDate]);

  const toggleTodo = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
  }, []);

  const deleteTodo = useCallback((id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const startEditing = useCallback((todo: Todo) => {
    setEditingId(todo.id);
    setEditingText(todo.text);
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingId) return;
    const text = editingText.trim();
    if (text) {
      setTodos((prev) =>
        prev.map((t) => (t.id === editingId ? { ...t, text } : t)),
      );
    }
    setEditingId(null);
    setEditingText("");
  }, [editingId, editingText]);

  const clearCompleted = useCallback(() => {
    setTodos((prev) => prev.filter((t) => !t.completed));
  }, []);

  const filteredTodos = todos.filter((t) => {
    if (filter === "active") return !t.completed;
    if (filter === "completed") return t.completed;
    return true;
  });

  const activeCount = todos.filter((t) => !t.completed).length;
  const completedCount = todos.filter((t) => t.completed).length;

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Todos</h1>
          <p className="mt-1 text-sm opacity-70">
            {activeCount} active · {completedCount} done
          </p>
        </header>

        <div className="space-y-3 rounded-2xl border border-black/10 dark:border-white/10 p-4">
          <input
            type="text"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTodo();
            }}
            placeholder="What needs doing?"
            className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={draftPriority}
              onChange={(e) => setDraftPriority(e.target.value as Priority)}
              className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-sm"
            >
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
            </select>
            <input
              type="date"
              value={draftDueDate}
              onChange={(e) => setDraftDueDate(e.target.value)}
              className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={addTodo}
              disabled={!draftText.trim()}
              className="ml-auto rounded-md bg-black text-white dark:bg-white dark:text-black px-3 py-1 text-sm font-medium disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>

        <nav className="mt-6 flex flex-wrap items-center gap-2 text-sm">
          {(["all", "active", "completed"] as TodoFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                filter === f
                  ? "rounded-md bg-black text-white dark:bg-white dark:text-black px-3 py-1"
                  : "rounded-md border border-black/10 dark:border-white/10 px-3 py-1 opacity-70 hover:opacity-100"
              }
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          {completedCount > 0 && (
            <button
              type="button"
              onClick={clearCompleted}
              className="ml-auto text-sm opacity-60 hover:opacity-100 underline-offset-4 hover:underline"
            >
              Clear completed
            </button>
          )}
        </nav>

        <ul className="mt-4 space-y-2">
          {filteredTodos.map((todo) => (
            <li
              key={todo.id}
              className="flex items-start gap-3 rounded-xl border border-black/10 dark:border-white/10 px-3 py-2"
            >
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggleTodo(todo.id)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                {editingId === todo.id ? (
                  <input
                    type="text"
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") {
                        setEditingId(null);
                        setEditingText("");
                      }
                    }}
                    autoFocus
                    className="w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-sm"
                  />
                ) : (
                  <button
                    type="button"
                    onDoubleClick={() => startEditing(todo)}
                    className={
                      todo.completed
                        ? "block w-full text-left text-sm line-through opacity-50"
                        : "block w-full text-left text-sm"
                    }
                  >
                    {todo.text}
                  </button>
                )}
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className={\`rounded px-1.5 py-0.5 \${PRIORITY_STYLES[todo.priority]}\`}>
                    {todo.priority}
                  </span>
                  {todo.dueDate && (
                    <span className="opacity-60">due {todo.dueDate}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => deleteTodo(todo.id)}
                aria-label="Delete todo"
                className="text-sm opacity-40 hover:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        {hydrated && filteredTodos.length === 0 && (
          <div className="mt-12 text-center text-sm opacity-60">
            {filter === "all"
              ? "No todos yet — add one above to get started."
              : filter === "active"
                ? "Nothing active. Take a break."
                : "Nothing completed yet."}
          </div>
        )}
      </div>
    </main>
  );
}
`;

const APP_TYPES = `export type Priority = "low" | "medium" | "high";

export type TodoFilter = "all" | "active" | "completed";

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  priority: Priority;
  dueDate: string | null;
  createdAt: string;
}
`;

export const nextjsTodoAppTemplate: TemplateDefinition = {
  id: "nextjs-todo-app",
  name: "Todo App (Next.js)",
  description:
    "Todo list with full CRUD, filters, priority levels, due dates, and localStorage persistence — built on the Next.js App Router as a single client component.",
  category: "productivity",
  tags: ["nextjs", "react", "todo", "productivity", "crud", "local-storage"],
  previewImageUrl: null,
  isOfficial: true,
  framework_id: "nextjs-app",

  codeFiles: {
    ...nextjsBlankTemplate.codeFiles,
    "app/page.tsx": APP_PAGE,
    "app/types.ts": APP_TYPES,
  },
};
