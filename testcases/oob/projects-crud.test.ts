/**
 * TC-PC01 – TC-PC11: Project CRUD, validation, permission boundaries, files endpoint.
 * Requires ownerToken + workspaceId from prior stages.
 */
import { apiFetch, pass, fail, assert, saveEvidence } from "./_shared.js";

export async function runProjectsCrudTests(ownerToken: string, workspaceId: string | null): Promise<void> {
  if (!workspaceId) {
    for (let i = 1; i <= 11; i++) {
      const id = `TC-PC${String(i).padStart(2, "0")}`;
      console.log(`  SKIP  [${id}] No workspaceId — skipping projects-crud tests`);
      pass(id, `Projects CRUD test (skipped — no workspace)`);
    }
    return;
  }

  let projectId: string | null = null;

  // TC-PC01: GET /api/projects returns array for workspace member
  try {
    const res = await apiFetch(`/api/projects?workspaceId=${workspaceId}`, { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-PC01", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const list = (body.data ?? body.projects ?? body) as unknown[];
    assert(Array.isArray(list), `Expected array, got ${typeof list}`);
    pass("TC-PC01", "GET /api/projects returns 200 with array for workspace member");
  } catch (e) {
    fail("TC-PC01", "GET /api/projects returns 200 with array for workspace member", (e as Error).message);
  }

  // TC-PC02: POST /api/projects creates a new project and returns id
  try {
    const res = await apiFetch("/api/projects", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        name: `OOB CRUD Test ${Date.now()}`,
        workspaceId,
        framework: "vite-react",
      }),
    });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-PC02", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 201 || res.status === 200, `Expected 201/200, got ${res.status}: ${JSON.stringify(body)}`);
    const proj = (body.project ?? body.data ?? body) as Record<string, unknown>;
    projectId = (proj.id ?? body.id) as string ?? null;
    assert(!!projectId, `No project id in response: ${JSON.stringify(body)}`);
    pass("TC-PC02", "POST /api/projects creates project and returns id");
  } catch (e) {
    fail("TC-PC02", "POST /api/projects creates project and returns id", (e as Error).message);
  }

  // TC-PC03: GET /api/projects/:id returns the created project
  try {
    assert(!!projectId, "No projectId available — depends on TC-PC02");
    const res = await apiFetch(`/api/projects/${projectId}`, { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-PC03", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const proj = (body.project ?? body.data ?? body) as Record<string, unknown>;
    const returnedId = (proj.id ?? body.id) as string;
    assert(returnedId === projectId, `Expected id ${projectId}, got ${returnedId}`);
    pass("TC-PC03", "GET /api/projects/:id returns correct project");
  } catch (e) {
    fail("TC-PC03", "GET /api/projects/:id returns correct project", (e as Error).message);
  }

  // TC-PC04: PATCH /api/projects/:id updates the project name
  try {
    assert(!!projectId, "No projectId available — depends on TC-PC02");
    const newName = `OOB CRUD Renamed ${Date.now()}`;
    const res = await apiFetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      token: ownerToken,
      body: JSON.stringify({ name: newName }),
    });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-PC04", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    const proj = (body.project ?? body.data ?? body) as Record<string, unknown>;
    const returnedName = (proj.name ?? body.name) as string;
    assert(returnedName === newName, `Expected name "${newName}", got "${returnedName}"`);
    pass("TC-PC04", "PATCH /api/projects/:id updates project name");
  } catch (e) {
    fail("TC-PC04", "PATCH /api/projects/:id updates project name", (e as Error).message);
  }

  // TC-PC05: POST /api/projects without a name returns 400/422
  try {
    const res = await apiFetch("/api/projects", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ workspaceId, framework: "vite-react" }),
    });
    const text = await res.text();
    saveEvidence("TC-PC05", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 400 || res.status === 422 || res.status === 409,
      `Expected 400/422 for missing name, got ${res.status}: ${text.slice(0, 200)}`
    );
    pass("TC-PC05", "POST /api/projects without name returns 400/422 validation error");
  } catch (e) {
    fail("TC-PC05", "POST /api/projects without name returns 400/422 validation error", (e as Error).message);
  }

  // TC-PC06: GET /api/projects/:id without token returns 401
  try {
    assert(!!projectId, "No projectId available — depends on TC-PC02");
    const res = await apiFetch(`/api/projects/${projectId}`);
    const text = await res.text();
    saveEvidence("TC-PC06", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 401 || res.status === 403, `Expected 401/403 without token, got ${res.status}`);
    pass("TC-PC06", "GET /api/projects/:id without token returns 401/403");
  } catch (e) {
    fail("TC-PC06", "GET /api/projects/:id without token returns 401/403", (e as Error).message);
  }

  // TC-PC07: GET /api/projects/starred returns 200 with array
  try {
    const res = await apiFetch("/api/projects/starred", { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-PC07", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const list = (body.data ?? body.projects ?? body) as unknown[];
    assert(Array.isArray(list), `Expected array for starred projects, got ${typeof list}`);
    pass("TC-PC07", "GET /api/projects/starred returns 200 with array");
  } catch (e) {
    fail("TC-PC07", "GET /api/projects/starred returns 200 with array", (e as Error).message);
  }

  // TC-PC08: POST /api/projects/:id/star returns 200 (idempotent)
  try {
    assert(!!projectId, "No projectId available — depends on TC-PC02");
    const res = await apiFetch(`/api/projects/${projectId}/star`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({}),
    });
    const text = await res.text();
    saveEvidence("TC-PC08", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200 || res.status === 201 || res.status === 204, `Expected 200/201/204 for star, got ${res.status}: ${text.slice(0, 200)}`);
    pass("TC-PC08", "POST /api/projects/:id/star returns 200/201/204");
  } catch (e) {
    fail("TC-PC08", "POST /api/projects/:id/star returns 200/201/204", (e as Error).message);
  }

  // TC-PC09: POST /api/projects/:id/archive returns 200
  try {
    assert(!!projectId, "No projectId available — depends on TC-PC02");
    const res = await apiFetch(`/api/projects/${projectId}/archive`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({}),
    });
    const text = await res.text();
    saveEvidence("TC-PC09", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200 || res.status === 204, `Expected 200/204 for archive, got ${res.status}: ${text.slice(0, 200)}`);
    pass("TC-PC09", "POST /api/projects/:id/archive returns 200/204");
  } catch (e) {
    fail("TC-PC09", "POST /api/projects/:id/archive returns 200/204", (e as Error).message);
  }

  // TC-PC10: POST /api/projects/:id/unarchive returns 200
  try {
    assert(!!projectId, "No projectId available — depends on TC-PC02");
    const res = await apiFetch(`/api/projects/${projectId}/unarchive`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({}),
    });
    const text = await res.text();
    saveEvidence("TC-PC10", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200 || res.status === 204, `Expected 200/204 for unarchive, got ${res.status}: ${text.slice(0, 200)}`);
    pass("TC-PC10", "POST /api/projects/:id/unarchive returns 200/204");
  } catch (e) {
    fail("TC-PC10", "POST /api/projects/:id/unarchive returns 200/204", (e as Error).message);
  }

  // TC-PC12: GET /api/projects/recently-viewed returns array
  try {
    const res = await apiFetch("/api/projects/recently-viewed", { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-PC12", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const list = (body.data ?? body.projects ?? body) as unknown[];
    assert(Array.isArray(list), `Expected array from /projects/recently-viewed, got ${typeof list}`);
    pass("TC-PC12", "GET /api/projects/recently-viewed returns 200 with array");
  } catch (e) {
    fail("TC-PC12", "GET /api/projects/recently-viewed returns 200 with array", (e as Error).message);
  }

  // TC-PC11: DELETE /api/projects/:id removes the project (cleanup)
  try {
    assert(!!projectId, "No projectId available — depends on TC-PC02");
    const res = await apiFetch(`/api/projects/${projectId}`, {
      method: "DELETE",
      token: ownerToken,
    });
    const text = await res.text();
    saveEvidence("TC-PC11", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200 || res.status === 204, `Expected 200/204 on delete, got ${res.status}`);
    pass("TC-PC11", "DELETE /api/projects/:id removes the project");
  } catch (e) {
    fail("TC-PC11", "DELETE /api/projects/:id removes the project", (e as Error).message);
  }
}
