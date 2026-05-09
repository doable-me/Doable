"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Check,
  Box,
  ShieldAlert,
  Sparkles,
  Shield,
  BookOpen,
  Plug,
  Tag,
  Eye,
  AlertTriangle,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiListWorkspaces, apiFetch, type ApiWorkspace } from "@/lib/api";
import { useEnvironments, type Environment } from "@/modules/environments/use-environments";
import { useMyListings } from "@/modules/marketplace/use-marketplace";

type Step = "environment" | "metadata" | "preview" | "publish";

const STEPS: { id: Step; label: string; description: string }[] = [
  { id: "environment", label: "Pick environment", description: "Choose what to package" },
  { id: "metadata", label: "Listing details", description: "Title, description, category" },
  { id: "preview", label: "Preview & permissions", description: "What installers will see" },
  { id: "publish", label: "List", description: "Publish to the marketplace" },
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export default function MarketplaceNewPage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<ApiWorkspace | null>(null);
  const [wsLoading, setWsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiListWorkspaces();
        // Honor the workspace the sidebar has active. The wizard used to
        // pick res.data[0] blindly, which on accounts with multiple
        // workspaces meant the picker showed envs from the wrong one.
        const activeId = typeof window !== "undefined"
          ? localStorage.getItem("doable_active_workspace_id")
          : null;
        const active = activeId ? res.data.find((w) => w.id === activeId) : null;
        setWorkspace(active ?? res.data[0] ?? null);
      } finally {
        setWsLoading(false);
      }
    })();
  }, []);

  if (wsLoading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground">You need a workspace before listing on the marketplace.</p>
        <Link href="/dashboard" className="mt-3 text-sm text-brand-400 hover:text-brand-300">
          Go to dashboard
        </Link>
      </div>
    );
  }

  return <Wizard workspace={workspace} onCancel={() => router.push("/marketplace")} />;
}

function Wizard({ workspace, onCancel }: { workspace: ApiWorkspace; onCancel: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("environment");

  // Pull every environment in the workspace — both workspace-scoped envs
  // (curated bundles like "Testing") AND project-scoped envs (auto-created
  // per project, which is what most users actually customise). The default
  // listForWorkspace query excludes project-scoped envs ("those are accessed
  // via their projects" — see packages/db/src/queries/environments-core.ts:34),
  // so we explicitly merge both scopes here. The publish step snapshots the
  // env into a marketplace artifact, so the source scope is irrelevant once
  // the listing is live.
  const { environments: workspaceEnvs, loading: workspaceEnvsLoading } = useEnvironments(workspace.id);
  const [projectEnvs, setProjectEnvs] = useState<Environment[]>([]);
  const [projectEnvsLoading, setProjectEnvsLoading] = useState(true);
  useEffect(() => {
    if (!workspace.id) { setProjectEnvsLoading(false); return; }
    setProjectEnvsLoading(true);
    apiFetch<{ data: Environment[] }>(`/workspaces/${workspace.id}/environments?scope=project`)
      .then((res) => setProjectEnvs(res.data))
      .catch(() => setProjectEnvs([]))
      .finally(() => setProjectEnvsLoading(false));
  }, [workspace.id]);
  const environments = useMemo(() => [...workspaceEnvs, ...projectEnvs], [workspaceEnvs, projectEnvs]);
  const envsLoading = workspaceEnvsLoading || projectEnvsLoading;
  const { createListing, publishListing } = useMyListings();

  const [envId, setEnvId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [longDesc, setLongDesc] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [category, setCategory] = useState("");
  const [submitting, setSubmitting] = useState<"idle" | "creating" | "publishing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [createdListingId, setCreatedListingId] = useState<string | null>(null);

  const env = useMemo(() => environments.find((e) => e.id === envId) ?? null, [environments, envId]);

  // Auto-derive slug + title once an environment is picked.
  useEffect(() => {
    if (!env) return;
    setTitle((cur) => cur || env.name);
    setSlug((cur) => cur || slugify(env.name));
    setShortDesc((cur) => cur || env.description.slice(0, 200));
  }, [env]);

  const tags = useMemo(
    () =>
      tagsInput
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10),
    [tagsInput]
  );

  const stepIdx = STEPS.findIndex((s) => s.id === step);

  const canAdvance = useMemo(() => {
    if (step === "environment") return !!envId;
    if (step === "metadata") return title.trim().length > 0 && /^[a-z0-9-]+$/.test(slug);
    return true;
  }, [step, envId, title, slug]);

  async function handleSubmit() {
    if (!envId) return;
    setSubmitting("creating");
    setError(null);
    try {
      const created = await createListing({
        environmentId: envId,
        title: title.trim(),
        slug,
        shortDesc: shortDesc.trim() || undefined,
        longDesc: longDesc.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        categoryId: category || undefined,
      });
      setCreatedListingId(created.id);
      setSubmitting("publishing");
      await publishListing(created.id);
      setSubmitting("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create listing");
      setSubmitting("error");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel} className="-ml-2">
          <ArrowLeft className="mr-1 h-4 w-4" /> Marketplace
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">List on the Marketplace</h1>
      </div>

      <Stepper steps={STEPS} active={step} />

      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        {step === "environment" && (
          <PickEnvironmentStep
            environments={environments}
            envId={envId}
            onPick={setEnvId}
            loading={envsLoading}
          />
        )}

        {step === "metadata" && (
          <MetadataStep
            title={title}
            setTitle={setTitle}
            slug={slug}
            setSlug={setSlug}
            shortDesc={shortDesc}
            setShortDesc={setShortDesc}
            longDesc={longDesc}
            setLongDesc={setLongDesc}
            tagsInput={tagsInput}
            setTagsInput={setTagsInput}
            category={category}
            setCategory={setCategory}
          />
        )}

        {step === "preview" && env && (
          <PreviewStep
            env={env}
            title={title}
            shortDesc={shortDesc}
            tags={tags}
          />
        )}

        {step === "publish" && (
          <PublishStep
            submitting={submitting}
            error={error}
            createdListingId={createdListingId}
            slug={slug}
            onPublish={handleSubmit}
            onViewListing={() => router.push(`/marketplace/${slug}`)}
            onManage={() => router.push("/marketplace/my-listings")}
          />
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => {
            if (stepIdx === 0) onCancel();
            else setStep(STEPS[stepIdx - 1]!.id);
          }}
          disabled={submitting === "creating" || submitting === "publishing"}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          {stepIdx === 0 ? "Cancel" : "Back"}
        </Button>

        {step !== "publish" && (
          <Button
            onClick={() => setStep(STEPS[stepIdx + 1]!.id)}
            disabled={!canAdvance}
          >
            Continue <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Step renderers ─────────────────────────────────────────

function Stepper({ steps, active }: { steps: typeof STEPS; active: Step }) {
  const activeIdx = steps.findIndex((s) => s.id === active);
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((s, idx) => {
        const done = idx < activeIdx;
        const current = idx === activeIdx;
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium transition-colors ${
                done
                  ? "bg-emerald-500 text-white"
                  : current
                    ? "bg-brand-600 text-white"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-3 w-3" /> : idx + 1}
            </span>
            <span className={current ? "text-foreground font-medium" : "text-muted-foreground"}>
              {s.label}
            </span>
            {idx < steps.length - 1 && <span className="mx-1 text-muted-foreground">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

function PickEnvironmentStep({
  environments,
  envId,
  onPick,
  loading,
}: {
  environments: ReturnType<typeof useEnvironments>["environments"];
  envId: string | null;
  onPick: (id: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (environments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Box className="mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-foreground font-medium">No environments to publish yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a workspace environment first — environments bundle skills, rules, knowledge, and connectors together.
        </p>
        <Link href="/workspace-settings?tab=environments" className="mt-4 text-sm text-brand-400 hover:text-brand-300">
          Open environments
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-foreground mb-1">Pick the environment to package</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Only the contents of the selected environment will be published. Secrets and connector credentials are never included.
      </p>
      <div className="grid gap-2">
        {environments.map((env) => (
          <button
            key={env.id}
            onClick={() => onPick(env.id)}
            className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
              envId === env.id
                ? "border-brand-500 bg-brand-500/5"
                : "border-border hover:bg-accent"
            }`}
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-sm">
              <Box className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground truncate">{env.name}</span>
                <span
                  className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                    env.scope === "workspace"
                      ? "bg-blue-500/15 text-blue-400"
                      : env.scope === "project"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-zinc-500/15 text-zinc-400"
                  }`}
                  title={env.scope === "project" ? "Auto-created for a single project" : env.scope === "workspace" ? "Shared across the whole workspace" : "Personal to you"}
                >
                  {env.scope}
                </span>
                {envId === env.id && <Check className="h-4 w-4 text-brand-400" />}
              </div>
              {env.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{env.description}</p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MetadataStep(props: {
  title: string;
  setTitle: (v: string) => void;
  slug: string;
  setSlug: (v: string) => void;
  shortDesc: string;
  setShortDesc: (v: string) => void;
  longDesc: string;
  setLongDesc: (v: string) => void;
  tagsInput: string;
  setTagsInput: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
}) {
  const slugValid = /^[a-z0-9-]+$/.test(props.slug);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1">Listing details</h2>
        <p className="text-sm text-muted-foreground mb-4">
          What installers will see in the Marketplace catalog.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={props.title}
          onChange={(e) => {
            props.setTitle(e.target.value);
            // Auto-update slug if user hasn't customised it
            if (props.slug === slugify(props.title)) props.setSlug(slugify(e.target.value));
          }}
          maxLength={100}
          placeholder="Beautiful, descriptive name"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          value={props.slug}
          onChange={(e) => props.setSlug(slugify(e.target.value))}
          maxLength={100}
          placeholder="lower-case-dashes-only"
        />
        <p className="text-xs text-muted-foreground">
          Used in the URL: <code className="text-foreground">/marketplace/{props.slug || "your-slug"}</code>
          {!slugValid && props.slug.length > 0 && (
            <span className="ml-2 text-destructive">Only lowercase letters, numbers, and dashes.</span>
          )}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="short">Short description</Label>
        <Input
          id="short"
          value={props.shortDesc}
          onChange={(e) => props.setShortDesc(e.target.value)}
          maxLength={200}
          placeholder="One sentence shown on cards"
        />
        <p className="text-xs text-muted-foreground">{props.shortDesc.length}/200</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="long">Long description (markdown)</Label>
        <Textarea
          id="long"
          value={props.longDesc}
          onChange={(e) => props.setLongDesc(e.target.value)}
          rows={6}
          maxLength={5000}
          placeholder="What does this environment do? Who's it for? How is it set up?"
        />
        <p className="text-xs text-muted-foreground">{props.longDesc.length}/5000</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tags">Tags</Label>
        <Input
          id="tags"
          value={props.tagsInput}
          onChange={(e) => props.setTagsInput(e.target.value)}
          placeholder="react, ai, design  (comma-separated, max 10)"
        />
      </div>
    </div>
  );
}

function PreviewStep({
  env,
  title,
  shortDesc,
  tags,
}: {
  env: { id: string; name: string; description: string };
  title: string;
  shortDesc: string;
  tags: string[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1">Preview & permissions</h2>
        <p className="text-sm text-muted-foreground mb-4">
          This is roughly what installers will see. Permissions are derived automatically from your environment.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
            <Box className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground">{title || env.name}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{shortDesc || env.description}</p>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-2 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className="font-medium text-foreground">Permissions installers will be asked to grant</p>
            <p className="text-xs text-muted-foreground mt-1">
              The exact permissions list is computed from your environment at install time. The previewer below shows
              the categories — installers always see the full breakdown before clicking Install.
            </p>
            <ul className="mt-3 space-y-1.5 text-xs">
              <li className="flex items-center gap-2 text-muted-foreground">
                <Sparkles className="h-3 w-3 text-violet-400" /> Adds skills to the user's AI
              </li>
              <li className="flex items-center gap-2 text-muted-foreground">
                <Shield className="h-3 w-3 text-emerald-400" /> Adds rules that auto-attach to matching files
              </li>
              <li className="flex items-center gap-2 text-muted-foreground">
                <BookOpen className="h-3 w-3 text-sky-400" /> Adds knowledge files to the user's context
              </li>
              <li className="flex items-center gap-2 text-muted-foreground">
                <Plug className="h-3 w-3 text-orange-400" /> If your env contains MCP connectors, they may require user-supplied credentials
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Eye className="inline-block h-3 w-3 mr-1" />
        Tip: After publishing, you can iterate quickly via Marketplace → My listings.
      </div>
    </div>
  );
}

function PublishStep({
  submitting,
  error,
  createdListingId,
  slug,
  onPublish,
  onViewListing,
  onManage,
}: {
  submitting: "idle" | "creating" | "publishing" | "done" | "error";
  error: string | null;
  createdListingId: string | null;
  slug: string;
  onPublish: () => void;
  onViewListing: () => void;
  onManage: () => void;
}) {
  if (submitting === "done") {
    return (
      <div className="text-center py-8">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
          <Check className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Listed on the Marketplace</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Your environment is live. Anyone can find and install it.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" onClick={onManage}>Manage listings</Button>
          <Button onClick={onViewListing}>
            View listing <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-foreground">Ready to list?</h2>
      <p className="text-sm text-muted-foreground">
        We'll create the listing as a draft and immediately publish it. You can unpublish or edit later from
        Marketplace → My listings.
      </p>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button
        onClick={onPublish}
        disabled={submitting === "creating" || submitting === "publishing"}
        className="w-full"
      >
        {submitting === "creating" ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating listing...</>
        ) : submitting === "publishing" ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Publishing...</>
        ) : (
          <><Rocket className="mr-2 h-4 w-4" /> List on Marketplace</>
        )}
      </Button>

      {createdListingId && submitting === "error" && (
        <p className="text-xs text-muted-foreground">
          Draft created with ID <code>{createdListingId}</code>. You can finish publishing from{" "}
          <Link href="/marketplace/my-listings" className="text-brand-400 hover:text-brand-300">
            My listings
          </Link>
          .
        </p>
      )}
    </div>
  );
}
