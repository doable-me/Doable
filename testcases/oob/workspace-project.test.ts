/**
 * TC-WP01 – TC-WP05: Workspace creation, project CRUD, publish flow.
 * Cleans up created resources after each test group.
 */
import { apiFetch, pass, fail, assert, saveEvidence } from "./_shared.js";

export async function runWorkspaceProjectTests(ownerToken: string): Promise<void> {
  let workspaceId: string | null = null;
  let projectId: string | null = null;

  // TC-WP01: GET /api/workspaces returns array (may be empty or have default workspace)
  try {
    const res = await apiFetch("/api/workspaces", { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-WP01", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200 from /workspaces, got ${res.status}`);
    const list = (body.data ?? body) as unknown[];
    assert(Array.isArray(list), `Expected array from /workspaces, got ${typeof list}`);
    if (list.length > 0) {
      workspaceId = (list[0] as Record<string, unknown>).id as string ?? null;
    }
    pass("TC-WP01", "GET /api/workspaces returns 200 with array");
  } catch (e) {
    fail("TC-WP01", "GET /api/workspaces returns 200 with array", (e as Error).message);
    return;
  }

  // TC-WP02: POST /api/workspaces creates a workspace (if none exists from bootstrap)
  if (!workspaceId) {
    try {
      const res = await apiFetch("/api/workspaces", {
        method: "POST",
        token: ownerToken,
        body: JSON.stringify({ name: `OOB Test Workspace ${Date.now()}`, slug: `oob-test-${Date.now()}` }),
      });
      const body = await res.json() as Record<string, unknown>;
      saveEvidence("TC-WP02", body, Object.fromEntries(res.headers.entries()));
      assert(res.status === 201 || res.status === 200, `Expected 201/200, got ${res.status}: ${JSON.stringify(body)}`);
      const ws = (body.workspace ?? body.data ?? body) as Record<string, unknown>;
      workspaceId = ws.id as string ?? null;
      assert(!!workspaceId, "No workspace id in create response");
      pass("TC-WP02", "POST /api/workspaces creates workspace and returns id");
    } catch (e) {
      fail("TC-WP02", "POST /api/workspaces creates workspace and returns id", (e as Error).message);
      return;
    }
  } else {
    console.log(`  SKIP  [TC-WP02] Default workspace exists (id=${workspaceId}) — skipping create`);
    pass("TC-WP02", "POST /api/workspaces (skipped — workspace already exists)");
  }

  // TC-WP03: POST /api/projects creates a project in the workspace
  try {
    const res = await apiFetch("/api/projects", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        name: `OOB Smoke Project ${Date.now()}`,
        workspaceId,
        framework: "vanilla",
      }),
    });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-WP03", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 201 || res.status === 200, `Expected 201/200, got ${res.status}: ${JSON.stringify(body)}`);
    const proj = (body.project ?? body.data ?? body) as Record<string, unknown>;
    projectId = proj.id as string ?? null;
    assert(!!projectId, "No project id in create response");
    pass("TC-WP03", "POST /api/projects creates project and returns id");
  } catch (e) {
    fail("TC-WP03", "POST /api/projects creates project and returns id", (e as Error).message);
    return;
  }

  // TC-WP04: GET /api/projects/:id returns the created project
  try {
    const res = await apiFetch(`/api/projects/${projectId}`, { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-WP04", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    const proj = (body.project ?? body.data ?? body) as Record<string, unknown>;
    assert(proj.id === projectId || body.id === projectId, `Expected project id ${projectId} in response`);
    pass("TC-WP04", "GET /api/projects/:id returns the created project");
  } catch (e) {
    fail("TC-WP04", "GET /api/projects/:id returns the created project", (e as Error).message);
  }

  // TC-WP05: DELETE /api/projects/:id removes the project (cleanup)
  try {
    const res = await apiFetch(`/api/projects/${projectId}`, {
      method: "DELETE",
      token: ownerToken,
    });
    saveEvidence("TC-WP05", await res.text(), Object.fromEntries(res.headers.entries()));
    assert(res.status === 200 || res.status === 204, `Expected 200/204 on delete, got ${res.status}`);
    pass("TC-WP05", "DELETE /api/projects/:id removes the project");
  } catch (e) {
    fail("TC-WP05", "DELETE /api/projects/:id removes the project", (e as Error).message);
  }
}
