"use client";
import { useUiText } from "@/i18n/use-ui-text";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

/**
 * Controlled search inputs that submit by pushing query params onto the URL.
 * The page reads the params and re-renders the results table.
 */
export function SearchForm() {
  const ui = useUiText();

  const router = useRouter();
  const params = useSearchParams();

  const [userId, setUserId] = useState(params.get("user_id") ?? "");
  const [workspaceId, setWorkspaceId] = useState(
    params.get("workspace_id") ?? "",
  );
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [q, setQ] = useState(params.get("q") ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (userId) next.set("user_id", userId);
    if (workspaceId) next.set("workspace_id", workspaceId);
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    if (status) next.set("status", status);
    if (q) next.set("q", q);
    router.push(`/admin/trace?${next.toString()}`);
  }

  function clear() {
    setUserId("");
    setWorkspaceId("");
    setFrom("");
    setTo("");
    setStatus("");
    setQ("");
    router.push("/admin/trace");
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={ui("User ID")}>
          <Input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder={ui("uuid")}
          />
        </Field>
        <Field label={ui("Workspace ID")}>
          <Input
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            placeholder={ui("uuid")}
          />
        </Field>
        <Field label={ui("Status")}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">{ui("Any")}</option>
            <option value="running">{ui("running")}</option>
            <option value="ok">{ui("ok")}</option>
            <option value="error">{ui("error")}</option>
            <option value="timeout">{ui("timeout")}</option>
          </select>
        </Field>
        <Field label={ui("From")}>
          <Input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label={ui("To")}>
          <Input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <Field label={ui("Root span name contains")}>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={ui("e.g. POST /chat")}
          />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm">
          <Search className="mr-1.5 h-3.5 w-3.5" /> {ui("Search")}{" "}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={clear}>
          <X className="mr-1.5 h-3.5 w-3.5" /> {ui("Reset")}{" "}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
