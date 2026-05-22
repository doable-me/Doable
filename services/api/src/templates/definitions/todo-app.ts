import type { TemplateDefinition } from "../registry.js";
import { blankTemplate } from "./blank.js";
import { todoAppComponents } from "./todo-app-components.js";

export const todoAppTemplate: TemplateDefinition = {
  id: "todo-app",
  name: "Todo App",
  description:
    "Simple todo list with full CRUD, filters, priority levels, due dates, and local storage persistence.",
  category: "productivity",
  tags: ["react", "todo", "productivity", "crud", "local-storage"],
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

    "src/App.tsx": `import { useState, useEffect, useCallback } from "react";
import { TodoHeader } from "@/components/todo-header";
import { TodoInput } from "@/components/todo-input";
import { TodoList } from "@/components/todo-list";
import { TodoFilters } from "@/components/todo-filters";
import type { Todo, TodoFilter, Priority } from "@/types";

const STORAGE_KEY = "doable-todos";

function loadTodos(): Todo[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveTodos(todos: Todo[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>(loadTodos);
  const [filter, setFilter] = useState<TodoFilter>("all");

  useEffect(() => {
    saveTodos(todos);
  }, [todos]);

  const addTodo = useCallback((text: string, priority: Priority, dueDate: string | null) => {
    const todo: Todo = {
      id: crypto.randomUUID(),
      text,
      completed: false,
      priority,
      dueDate,
      createdAt: new Date().toISOString(),
    };
    setTodos((prev) => [todo, ...prev]);
  }, []);

  const toggleTodo = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  }, []);

  const deleteTodo = useCallback((id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const editTodo = useCallback((id: string, text: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, text } : t))
    );
  }, []);

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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-xl px-4 py-12">
        <TodoHeader totalCount={todos.length} activeCount={activeCount} />

        <div className="mt-8 space-y-4">
          <TodoInput onAdd={addTodo} />

          <TodoFilters
            filter={filter}
            onFilterChange={setFilter}
            activeCount={activeCount}
            completedCount={completedCount}
            totalCount={todos.length}
            onClearCompleted={clearCompleted}
          />

          <TodoList
            todos={filteredTodos}
            onToggle={toggleTodo}
            onDelete={deleteTodo}
            onEdit={editTodo}
          />

          {todos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-5xl mb-4">&#9745;</div>
              <h3 className="text-lg font-medium text-muted-foreground">
                No todos yet
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Add your first task above to get started.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
`,

    "src/types.ts": `export type Priority = "low" | "medium" | "high";
export type TodoFilter = "all" | "active" | "completed";

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  priority: Priority;
  dueDate: string | null;
  createdAt: string;
}
`,

    "src/components/todo-header.tsx": `import { CheckSquare } from "lucide-react";

interface TodoHeaderProps {
  totalCount: number;
  activeCount: number;
}

export const TodoHeader = ({ totalCount, activeCount }: TodoHeaderProps) => (
  <div className="text-center space-y-2">
    <div className="flex items-center justify-center gap-2">
      <CheckSquare className="h-8 w-8 text-primary" />
      <h1 className="text-3xl font-bold tracking-tight">Todo</h1>
    </div>
    <p className="text-sm text-muted-foreground">
      {totalCount === 0
        ? "Your task list is empty"
        : \`\${activeCount} task\${activeCount !== 1 ? "s" : ""} remaining\`}
    </p>
  </div>
);
`,

    "src/components/todo-input.tsx": `import { useState } from "react";
import { Plus, Flag, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Priority } from "@/types";

interface TodoInputProps {
  onAdd: (text: string, priority: Priority, dueDate: string | null) => void;
}

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "text-blue-500",
  medium: "text-amber-500",
  high: "text-red-500",
};

export const TodoInput = ({ onAdd }: TodoInputProps) => {
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd(text.trim(), priority, dueDate || null);
    setText("");
    setDueDate("");
    setPriority("medium");
    setExpanded(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border bg-card shadow-sm"
    >
      <div className="flex items-center gap-2 p-3">
        <button
          type="submit"
          disabled={!text.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setExpanded(true)}
          placeholder="Add a new task..."
          className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      {expanded && (
        <div className="flex items-center gap-3 border-t px-3 py-2">
          {/* Priority */}
          <div className="flex items-center gap-1">
            <Flag className={cn("h-3.5 w-3.5", PRIORITY_COLORS[priority])} />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="bg-transparent text-xs text-muted-foreground focus:outline-none cursor-pointer"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          {/* Due date */}
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-transparent text-xs text-muted-foreground focus:outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Collapse
          </button>
        </div>
      )}
    </form>
  );
};
`,

    ...todoAppComponents,
  },

  contextOverrides: {
    "identity.md": `# Project Identity

## Name
Todo App

## Purpose
A simple, functional todo list for personal task management with priorities, due dates, and persistence.

## Personality & Tone
- Friendly and approachable
- Get-things-done focused
- Minimal friction
`,
    "knowledge.md": `# Knowledge Base

## Tech Stack
- Frontend: React 19 + Vite 6 + TypeScript (strict)
- Styling: Tailwind CSS 3
- Icons: Lucide React
- Storage: localStorage for persistence

## Architecture
- \`src/types.ts\` — Todo and filter types
- \`src/components/\` — UI components (header, input, filters, list)
- State lifted to App component
- localStorage sync via useEffect

## Patterns
- Priority levels with color-coded left borders
- Inline editing with Enter/Escape keyboard support
- Filter pills (All / Active / Done)
- Due date with overdue highlighting
- Expandable input with priority + date controls
`,
  },
};
