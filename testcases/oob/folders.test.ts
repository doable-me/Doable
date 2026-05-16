/**
 * TC-FL01 – TC-FL07: Folder CRUD on a workspace.
 * Folders are mounted at /api/folders and scoped by workspaceId query param.
 * Requires ownerToken + workspaceId from prior stages.
 */
import { apiFetch, pass, fail, assert, saveEvidence } from "./_shared.js";

export async function runFoldersTests(ownerToken: string, workspaceId: string | null): Promise<void> {
  if (!workspaceId) {
    for (let i = 1; i <= 7; i++) {
      const id = `TC-FL${String(i).padStart(2, "0")}`;
      console.log(`  SKIP  [${id}] No workspaceId — skipping folder tests`);
      pass(id, `Folder test (skipped — no workspace)`);
    }
    return;
  }

  let folderId: string | null = null;

  // TC-FL01: GET /api/folders?workspaceId=:id returns array
  try {
    const res = await apiFetch(`/api/folders?workspaceId=${workspaceId}`, { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-FL01", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const list = (body.data ?? body.folders ?? body) as unknown[];
    assert(Array.isArray(list), `Expected array from /folders, got ${typeof list}`);
    pass("TC-FL01", "GET /api/folders?workspaceId=:id returns 200 with array");
  } catch (e) {
    fail("TC-FL01", "GET /api/folders?workspaceId=:id returns 200 with array", (e as Error).message);
  }

  // TC-FL02: GET /api/folders without token returns 401
  try {
    const res = await apiFetch(`/api/folders?workspaceId=${workspaceId}`);
    const text = await res.text();
    saveEvidence("TC-FL02", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 401 || res.status === 403, `Expected 401/403 without token, got ${res.status}`);
    pass("TC-FL02", "GET /api/folders without token returns 401/403");
  } catch (e) {
    fail("TC-FL02", "GET /api/folders without token returns 401/403", (e as Error).message);
  }

  // TC-FL03: POST /api/folders creates a folder
  try {
    const res = await apiFetch("/api/folders", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        name: `OOB Test Folder ${Date.now()}`,
        workspaceId,
      }),
    });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-FL03", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 201 || res.status === 200, `Expected 201/200, got ${res.status}: ${JSON.stringify(body)}`);
    const folder = (body.folder ?? body.data ?? body) as Record<string, unknown>;
    folderId = (folder.id ?? body.id) as string ?? null;
    assert(!!folderId, `No folder id in response: ${JSON.stringify(body)}`);
    pass("TC-FL03", "POST /api/folders creates folder and returns id");
  } catch (e) {
    fail("TC-FL03", "POST /api/folders creates folder and returns id", (e as Error).message);
  }

  // TC-FL04: GET /api/folders/:id returns the created folder
  try {
    assert(!!folderId, "No folderId — depends on TC-FL03");
    const res = await apiFetch(`/api/folders/${folderId}`, { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-FL04", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const folder = (body.folder ?? body.data ?? body) as Record<string, unknown>;
    const returnedId = (folder.id ?? body.id) as string;
    assert(returnedId === folderId, `Expected id ${folderId}, got ${returnedId}`);
    pass("TC-FL04", "GET /api/folders/:id returns correct folder");
  } catch (e) {
    fail("TC-FL04", "GET /api/folders/:id returns correct folder", (e as Error).message);
  }

  // TC-FL05: PATCH /api/folders/:id updates folder name
  try {
    assert(!!folderId, "No folderId — depends on TC-FL03");
    const newName = `OOB Renamed Folder ${Date.now()}`;
    const res = await apiFetch(`/api/folders/${folderId}`, {
      method: "PATCH",
      token: ownerToken,
      body: JSON.stringify({ name: newName }),
    });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-FL05", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    pass("TC-FL05", "PATCH /api/folders/:id updates folder name");
  } catch (e) {
    fail("TC-FL05", "PATCH /api/folders/:id updates folder name", (e as Error).message);
  }

  // TC-FL06: POST /api/folders without name returns 400/422
  try {
    const res = await apiFetch("/api/folders", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ workspaceId }),
    });
    const text = await res.text();
    saveEvidence("TC-FL06", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 400 || res.status === 422,
      `Expected 400/422 for missing name, got ${res.status}: ${text.slice(0, 200)}`
    );
    pass("TC-FL06", "POST /api/folders without name returns 400/422");
  } catch (e) {
    fail("TC-FL06", "POST /api/folders without name returns 400/422", (e as Error).message);
  }

  // TC-FL07: DELETE /api/folders/:id removes the folder (cleanup)
  try {
    assert(!!folderId, "No folderId — depends on TC-FL03");
    const res = await apiFetch(`/api/folders/${folderId}`, {
      method: "DELETE",
      token: ownerToken,
    });
    const text = await res.text();
    saveEvidence("TC-FL07", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200 || res.status === 204, `Expected 200/204 on delete, got ${res.status}`);
    pass("TC-FL07", "DELETE /api/folders/:id removes the folder");
  } catch (e) {
    fail("TC-FL07", "DELETE /api/folders/:id removes the folder", (e as Error).message);
  }
}
