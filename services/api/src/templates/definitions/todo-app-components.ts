/**
 * Todo app template — component code file strings.
 */

export const todoAppComponents: Record<string, string> = {
    "src/components/todo-filters.tsx": `import { cn } from "@/lib/utils";
import type { TodoFilter } from "@/types";

interface TodoFiltersProps {
  filter: TodoFilter;
  onFilterChange: (filter: TodoFilter) => void;
  activeCount: number;
  completedCount: number;
  totalCount: number;
  onClearCompleted: () => void;
}

const FILTERS: { key: TodoFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Done" },
];

export const TodoFilters = ({
  filter,
  onFilterChange,
  activeCount,
  completedCount,
  totalCount,
  onClearCompleted,
}: TodoFiltersProps) => {
  if (totalCount === 0) return null;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => onFilterChange(f.key)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
            <span className="ml-1 text-[10px] opacity-70">
              {f.key === "all"
                ? totalCount
                : f.key === "active"
                  ? activeCount
                  : completedCount}
            </span>
          </button>
        ))}
      </div>

      {completedCount > 0 && (
        <button
          onClick={onClearCompleted}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          Clear completed
        </button>
      )}
    </div>
  );
};
`,

    "src/components/todo-list.tsx": `import { useState } from "react";
import { Check, Trash2, Pencil, Flag, Calendar, X, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Todo, Priority } from "@/types";

interface TodoListProps {
  todos: Todo[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, text: string) => void;
}

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "border-l-blue-400",
  medium: "border-l-amber-400",
  high: "border-l-red-400",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Med",
  high: "High",
};

export const TodoList = ({ todos, onToggle, onDelete, onEdit }: TodoListProps) => (
  <div className="space-y-2">
    {todos.map((todo) => (
      <TodoItem
        key={todo.id}
        todo={todo}
        onToggle={() => onToggle(todo.id)}
        onDelete={() => onDelete(todo.id)}
        onEdit={(text) => onEdit(todo.id, text)}
      />
    ))}
  </div>
);

function TodoItem({
  todo,
  onToggle,
  onDelete,
  onEdit,
}: {
  todo: Todo;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);

  const saveEdit = () => {
    if (editText.trim()) {
      onEdit(editText.trim());
    }
    setEditing(false);
  };

  const isOverdue =
    todo.dueDate &&
    !todo.completed &&
    new Date(todo.dueDate) < new Date(new Date().toDateString());

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-lg border border-l-4 bg-card p-3 transition-all",
        PRIORITY_COLORS[todo.priority],
        todo.completed && "opacity-60"
      )}
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
          todo.completed
            ? "bg-primary border-primary text-primary-foreground"
            : "border-input hover:border-primary"
        )}
      >
        {todo.completed && <Check className="h-3 w-3" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
            <button onClick={saveEdit} className="text-primary">
              <Save className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setEditing(false)} className="text-muted-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <p
              className={cn(
                "text-sm",
                todo.completed && "line-through text-muted-foreground"
              )}
            >
              {todo.text}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Flag className="h-2.5 w-2.5" />
                {PRIORITY_LABELS[todo.priority]}
              </span>
              {todo.dueDate && (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-[10px]",
                    isOverdue ? "text-red-500" : "text-muted-foreground"
                  )}
                >
                  <Calendar className="h-2.5 w-2.5" />
                  {new Date(todo.dueDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      {!editing && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => {
              setEditText(todo.text);
              setEditing(true);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
`,
};
