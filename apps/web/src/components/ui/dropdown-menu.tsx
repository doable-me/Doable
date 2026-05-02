"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue>({
  open: false,
  setOpen: () => {},
  triggerRef: { current: null },
});

function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef }}>
      <div className="relative inline-block text-left">{children}</div>
    </DropdownMenuContext.Provider>
  );
}

function DropdownMenuTrigger({
  className,
  children,
  asChild,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const { open, setOpen, triggerRef } = React.useContext(DropdownMenuContext);

  return (
    <button
      ref={triggerRef}
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        setOpen(!open);
      }}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

function DropdownMenuContent({
  className,
  align = "end",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { align?: "start" | "end" }) {
  const { open, setOpen, triggerRef } = React.useContext(DropdownMenuContext);

  // Use a callback ref to position the menu as soon as it's in the DOM
  const menuRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !triggerRef.current) return;

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const menuHeight = node.scrollHeight;
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const flipAbove = spaceBelow < menuHeight + 8 && triggerRect.top > menuHeight + 8;

      node.style.top = flipAbove
        ? `${triggerRect.top - menuHeight - 4}px`
        : `${triggerRect.bottom + 4}px`;

      if (align === "end") {
        node.style.right = `${window.innerWidth - triggerRect.right}px`;
        node.style.left = "auto";
      } else {
        node.style.left = `${triggerRect.left}px`;
        node.style.right = "auto";
      }

      node.style.visibility = "visible";
    },
    [align, triggerRef]
  );

  // Close on outside click — delayed to avoid catching the opening click
  React.useEffect(() => {
    if (!open) return;

    let handler: ((e: MouseEvent) => void) | null = null;
    const timeout = setTimeout(() => {
      handler = (e: MouseEvent) => {
        const target = e.target as Node;
        // Check if click is inside any dropdown portal or trigger
        const portals = document.querySelectorAll('[data-dropdown-portal]');
        for (const portal of portals) {
          if (portal.contains(target)) return;
        }
        if (triggerRef.current?.contains(target)) return;
        setOpen(false);
      };
      document.addEventListener("mousedown", handler);
    }, 10);

    return () => {
      clearTimeout(timeout);
      if (handler) document.removeEventListener("mousedown", handler);
    };
  }, [open, setOpen, triggerRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      data-dropdown-portal=""
      className={cn(
        "fixed z-[9999] min-w-[10rem] rounded-xl border border-zinc-700/80 bg-zinc-900 p-1.5 text-zinc-100 shadow-xl shadow-black/40",
        className
      )}
      style={{ top: 0, left: 0, visibility: "hidden" }}
      {...props}
    >
      {children}
    </div>,
    document.body
  );
}

function DropdownMenuItem({
  className,
  onClick,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { setOpen } = React.useContext(DropdownMenuContext);

  return (
    <div
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm text-zinc-100 outline-none transition-colors hover:bg-zinc-800 hover:text-white",
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
        setOpen(false);
      }}
      {...props}
    >
      {children}
    </div>
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("-mx-1 my-1.5 h-px bg-zinc-700/60", className)} {...props} />;
}

function DropdownMenuLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-2 py-1.5 text-sm font-semibold", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
};
