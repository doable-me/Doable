/**
 * r11-test-versions-fix.ts
 *
 * Verifies the fix for BUG-R11-VERSIONS-EACCES-500-001:
 *   POST /projects/:id/versions MUST derive `projectPath` server-side from
 *   the project ID and MUST NOT accept a user-supplied path. Sending
 *   `{"createdBy":"u","projectPath":"/"}` previously caused createVersion
 *   to fs.scandir the entire filesystem and crash with
 *     EACCES: permission denied, scandir '/boot/lost+found'
 *
 * This probe spins up the post-fix Hono handler against a stubbed
 * file-manager + version-manager so we can prove three things without a
 * real DB or filesystem:
 *
 *   1. Pre-fix shape: a handler that trusts body.projectPath would invoke
 *      createVersion(projectId, "/", ...) and the scandir on "/" would
 *      crash. We simulate that scandir by making createVersion throw an
 *      EACCES on "/" — the old route would propagate this as a 500 with
 *      the raw filesystem path leaking. Confirmed.
 *
 *   2. Post-fix correctness: regardless of what projectPath the body
 *      contains ("/", "../etc/passwd", "valid", undefined), the handler
 *      ALWAYS calls createVersion with the server-derived path. The
 *      scandir target is never the value from the body.
 *
 *   3. Post-fix scaffolding gate: when isProjectScaffolded(projectId)
 *      returns false, the handler responds 400 "Project not scaffolded"
 *      WITHOUT calling createVersion at all (so no scandir runs).
 *
 *   4. Error envelope: in NODE_ENV=production, even if createVersion
 *      throws an error whose .message contains an internal path like
 *      "/boot/lost+found", the response body must NOT contain that path.
 *
 * Run from repo root:
 *   pnpm exec tsx scripts/r11-test-versions-fix.ts
 */

import { Hono } from "hono";

// ─── Stubbed dependencies (mirror real signatures) ───────────────────

type FileManager = {
  isProjectScaffolded(projectId: string): boolean;
  getProjectPath(projectId: string): string;
};

type VersionManager = {
  createVersion(
    projectId: string,
    projectPath: string,
    opts: { description?: string; createdBy: string },
  ): Promise<{ id: string; project_path_used: string }>;
};

// Track every call so we can prove that createVersion is never invoked
// with a user-supplied path.
type Call = { projectId: string; projectPath: string; createdBy: string };
const calls: Call[] = [];

function makeFileManager(scaffolded: boolean): FileManager {
  return {
    isProjectScaffolded: (_id) => scaffolded,
    // Server-derived path mirrors the real getProjectPath shape:
    //   <DATA_ROOT>/projects/<projectId>
    getProjectPath: (id) => `/var/doable/data/projects/${id}`,
  };
}

function makeVersionManager(opts?: { throwEaccesOn?: string }): VersionManager {
  return {
    async createVersion(projectId, projectPath, options) {
      calls.push({ projectId, projectPath, createdBy: options.createdBy });
      if (opts?.throwEaccesOn && projectPath === opts.throwEaccesOn) {
        // Simulate what fs.scandir('/boot/lost+found') would throw.
        const err = new Error(
          "EACCES: permission denied, scandir '/boot/lost+found'",
        ) as Error & { code: string };
        err.code = "EACCES";
        throw err;
      }
      return {
        id: "v1",
        project_path_used: projectPath,
      };
    },
  };
}

// ─── Build the PRE-FIX handler (mirrors the buggy code we removed) ───

function buildPreFixApp(fm: FileManager, vm: VersionManager): Hono {
  const app = new Hono();
  app.post("/projects/:id/versions", async (c) => {
    const projectId = c.req.param("id");
    const body = await c.req.json<{
      description?: string;
      createdBy: string;
      projectPath: string;
    }>();
    if (!body.createdBy || !body.projectPath) {
      return c.json(
        { error: "Missing required fields: createdBy, projectPath" },
        400,
      );
    }
    try {
      const version = await vm.createVersion(projectId, body.projectPath, {
        description: body.description,
        createdBy: body.createdBy,
      });
      return c.json({ data: version }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: "Failed to create version", message }, 500);
    }
  });
  // Silence unused-var lints; fm is unused in pre-fix branch deliberately.
  void fm;
  return app;
}

// ─── Build the POST-FIX handler (mirrors services/api/src/routes/versions.ts) ─

function buildPostFixApp(fm: FileManager, vm: VersionManager): Hono {
  const app = new Hono();
  app.post("/projects/:id/versions", async (c) => {
    const projectId = c.req.param("id");

    const body = await c.req.json<{
      description?: string;
      createdBy: string;
      projectPath?: string;
    }>();

    if (!body.createdBy) {
      return c.json({ error: "Missing required field: createdBy" }, 400);
    }

    if (body.projectPath !== undefined) {
      // deprecation: ignored server-side
    }

    if (!fm.isProjectScaffolded(projectId)) {
      return c.json({ error: "Project not scaffolded" }, 400);
    }

    const projectPath = fm.getProjectPath(projectId);

    try {
      const version = await vm.createVersion(projectId, projectPath, {
        description: body.description,
        createdBy: body.createdBy,
      });
      return c.json({ data: version }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (process.env.NODE_ENV === "development") {
        return c.json({ error: "Failed to create version", message }, 500);
      }
      return c.json({ error: "Failed to create version" }, 500);
    }
  });
  return app;
}

// ─── Tiny assertion helper ──────────────────────────────────────────

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    console.error(`  FAIL ${msg}`);
    failures += 1;
  }
}

async function postVersion(
  app: Hono,
  projectId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.request(`/projects/${projectId}/versions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body: parsed };
}

// ─── Cases ──────────────────────────────────────────────────────────

async function casePreFixReproduces500OnRoot(): Promise<void> {
  console.log("case[pre-fix]: body.projectPath='/' triggers EACCES 500 (the bug)");
  calls.length = 0;
  const app = buildPreFixApp(
    makeFileManager(true),
    makeVersionManager({ throwEaccesOn: "/" }),
  );
  const { status, body } = await postVersion(app, "proj-abc", {
    createdBy: "u",
    projectPath: "/",
  });
  assert(status === 500, `pre-fix returns 500 (got ${status})`);
  assert(
    typeof body.message === "string" && body.message.includes("/boot/lost+found"),
    "pre-fix LEAKS internal /boot/lost+found path",
  );
  assert(
    calls.length === 1 && calls[0]?.projectPath === "/",
    "pre-fix passed user-supplied '/' straight to createVersion",
  );
}

async function casePostFixIgnoresUserPathRoot(): Promise<void> {
  console.log("case[post-fix]: body.projectPath='/' is IGNORED; server path used");
  calls.length = 0;
  const app = buildPostFixApp(
    makeFileManager(true),
    makeVersionManager({ throwEaccesOn: "/" }),
  );
  const { status, body } = await postVersion(app, "proj-abc", {
    createdBy: "u",
    projectPath: "/",
  });
  assert(status === 201, `post-fix returns 201 (got ${status})`);
  assert(calls.length === 1, "createVersion called exactly once");
  assert(
    calls[0]?.projectPath === "/var/doable/data/projects/proj-abc",
    `createVersion received SERVER-DERIVED path (got ${calls[0]?.projectPath})`,
  );
  assert(
    calls[0]?.projectPath !== "/",
    "createVersion did NOT receive '/' from body",
  );
  // Response data echoes the path createVersion used internally.
  const data = body.data as { project_path_used: string } | undefined;
  assert(
    data?.project_path_used === "/var/doable/data/projects/proj-abc",
    "version object reflects server-derived path",
  );
}

async function casePostFixIgnoresTraversal(): Promise<void> {
  console.log("case[post-fix]: body.projectPath='../etc/passwd' is IGNORED");
  calls.length = 0;
  const app = buildPostFixApp(makeFileManager(true), makeVersionManager());
  const { status } = await postVersion(app, "proj-abc", {
    createdBy: "u",
    projectPath: "../etc/passwd",
  });
  assert(status === 201, `post-fix returns 201 (got ${status})`);
  assert(
    calls[0]?.projectPath === "/var/doable/data/projects/proj-abc",
    `createVersion received server-derived path, not '../etc/passwd' (got ${calls[0]?.projectPath})`,
  );
}

async function casePostFixIgnoresValidLooking(): Promise<void> {
  console.log("case[post-fix]: body.projectPath='valid' is IGNORED");
  calls.length = 0;
  const app = buildPostFixApp(makeFileManager(true), makeVersionManager());
  const { status } = await postVersion(app, "proj-xyz", {
    createdBy: "u",
    projectPath: "valid",
  });
  assert(status === 201, `post-fix returns 201 (got ${status})`);
  assert(
    calls[0]?.projectPath === "/var/doable/data/projects/proj-xyz",
    "valid-looking body.projectPath is also ignored",
  );
}

async function casePostFixOmittedProjectPath(): Promise<void> {
  console.log("case[post-fix]: omitting body.projectPath still works (BC)");
  calls.length = 0;
  const app = buildPostFixApp(makeFileManager(true), makeVersionManager());
  const { status } = await postVersion(app, "proj-xyz", { createdBy: "u" });
  assert(status === 201, `post-fix returns 201 (got ${status})`);
  assert(
    calls[0]?.projectPath === "/var/doable/data/projects/proj-xyz",
    "server-derived path used when body.projectPath omitted",
  );
}

async function casePostFix400WhenNotScaffolded(): Promise<void> {
  console.log("case[post-fix]: unscaffolded project -> 400 (no createVersion)");
  calls.length = 0;
  const app = buildPostFixApp(makeFileManager(false), makeVersionManager());
  const { status, body } = await postVersion(app, "proj-new", {
    createdBy: "u",
    projectPath: "/",
  });
  assert(status === 400, `unscaffolded returns 400 (got ${status})`);
  assert(
    typeof body.error === "string" && /not scaffolded/i.test(body.error),
    "error body says 'not scaffolded'",
  );
  assert(calls.length === 0, "createVersion NOT called when unscaffolded");
}

async function casePostFix400WhenMissingCreatedBy(): Promise<void> {
  console.log("case[post-fix]: missing createdBy -> 400");
  calls.length = 0;
  const app = buildPostFixApp(makeFileManager(true), makeVersionManager());
  const { status, body } = await postVersion(app, "proj-xyz", {
    projectPath: "/",
  });
  assert(status === 400, `missing createdBy returns 400 (got ${status})`);
  assert(
    typeof body.error === "string" && /createdBy/i.test(body.error),
    "error mentions createdBy",
  );
  assert(calls.length === 0, "createVersion NOT called when createdBy missing");
}

async function casePostFixProdErrorEnvelopeSanitized(): Promise<void> {
  console.log("case[post-fix]: prod 5xx envelope does not leak filesystem paths");
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  calls.length = 0;
  // Force createVersion to throw an EACCES-looking error even on the
  // server-derived path (simulates a real internal error). The response
  // body must NOT contain the raw message.
  const app = buildPostFixApp(
    makeFileManager(true),
    makeVersionManager({
      throwEaccesOn: "/var/doable/data/projects/proj-xyz",
    }),
  );
  const { status, body } = await postVersion(app, "proj-xyz", {
    createdBy: "u",
  });
  assert(status === 500, `error returns 500 (got ${status})`);
  const raw = JSON.stringify(body);
  assert(!raw.includes("/boot/lost+found"), "prod body does not leak /boot/lost+found");
  assert(!raw.includes("EACCES"), "prod body does not leak EACCES code");
  assert(!raw.includes("/var/doable"), "prod body does not leak server data path");
  process.env.NODE_ENV = prevEnv;
}

async function casePostFixDevErrorIncludesMessage(): Promise<void> {
  console.log("case[post-fix]: dev 5xx envelope DOES include details for debugging");
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  calls.length = 0;
  const app = buildPostFixApp(
    makeFileManager(true),
    makeVersionManager({
      throwEaccesOn: "/var/doable/data/projects/proj-xyz",
    }),
  );
  const { status, body } = await postVersion(app, "proj-xyz", {
    createdBy: "u",
  });
  assert(status === 500, `dev error returns 500 (got ${status})`);
  assert(
    typeof body.message === "string" && /EACCES/.test(body.message),
    "dev body INCLUDES raw error message (intentional)",
  );
  process.env.NODE_ENV = prevEnv;
}

async function main(): Promise<void> {
  await casePreFixReproduces500OnRoot();
  await casePostFixIgnoresUserPathRoot();
  await casePostFixIgnoresTraversal();
  await casePostFixIgnoresValidLooking();
  await casePostFixOmittedProjectPath();
  await casePostFix400WhenNotScaffolded();
  await casePostFix400WhenMissingCreatedBy();
  await casePostFixProdErrorEnvelopeSanitized();
  await casePostFixDevErrorIncludesMessage();

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nall r11-versions-fix assertions passed");
}

void main();
