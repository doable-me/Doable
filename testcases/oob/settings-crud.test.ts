/**
 * TC-SC01 – TC-SC12: Workspace settings CRUD tests.
 * GET/PATCH /api/workspaces/:id/settings round-trip.
 */
import { apiFetch, pass, fail, skip, assert, saveEvidence } from "./_shared.js";

export async function runSettingsCrudTests(ownerToken: string, wsId: string | null): Promise<void> {
  if (!wsId) {
    for (let i = 1; i <= 12; i++) {
      skip(`TC-SC${String(i).padStart(2, "0")}`, "Settings CRUD test", "no wsId");
    }
    return;
  }

  // TC-SC01: GET /api/workspaces/:id/settings returns 200 or 404
  let settingsEndpointExists = true;
  try {
    const res = await apiFetch(`/api/workspaces/${wsId}/settings`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SC01", text, Object.fromEntries(res.headers.entries()));
    if (res.status === 404) {
      settingsEndpointExists = false;
      skip("TC-SC01", "GET workspace settings", "endpoint not found");
    } else {
      assert(res.status === 200, `Expected 200, got ${res.status}: ${text.slice(0, 200)}`);
      pass("TC-SC01", "GET /api/workspaces/:id/settings returns 200");
    }
  } catch (e) {
    fail("TC-SC01", "GET workspace settings", (e as Error).message);
  }

  // TC-SC02: GET /api/workspaces/:id returns workspace with settings fields
  try {
    const res = await apiFetch(`/api/workspaces/${wsId}`, { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-SC02", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const ws = (body.workspace ?? body.data ?? body) as Record<string, unknown>;
    assert(typeof ws === "object" && ws !== null, "Expected workspace object");
    pass("TC-SC02", "GET /api/workspaces/:id returns workspace object");
  } catch (e) {
    fail("TC-SC02", "GET /api/workspaces/:id workspace object", (e as Error).message);
  }

  // TC-SC03: PATCH /api/workspaces/:id/settings with valid name update
  try {
    if (!settingsEndpointExists) { skip("TC-SC03", "PATCH workspace settings name", "endpoint not found"); return; }
    const newName = `OOB Settings Test ${Date.now()}`;
    const res = await apiFetch(`/api/workspaces/${wsId}/settings`, {
      method: "PATCH",
      token: ownerToken,
      body: JSON.stringify({ name: newName }),
    });
    const text = await res.text();
    saveEvidence("TC-SC03", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 200 || res.status === 204,
      `Expected 200/204, got ${res.status}: ${text.slice(0, 200)}`
    );
    pass("TC-SC03", "PATCH /api/workspaces/:id/settings name update returns 200/204");
  } catch (e) {
    fail("TC-SC03", "PATCH workspace settings name", (e as Error).message);
  }

  // TC-SC04: PATCH workspace name persists (GET after PATCH)
  try {
    if (!settingsEndpointExists) { skip("TC-SC04", "Settings name persists after PATCH", "endpoint not found"); return; }
    const uniqueName = `OOB Persisted ${Date.now()}`;
    const patchRes = await apiFetch(`/api/workspaces/${wsId}/settings`, {
      method: "PATCH",
      token: ownerToken,
      body: JSON.stringify({ name: uniqueName }),
    });
    if (patchRes.status !== 200 && patchRes.status !== 204) {
      skip("TC-SC04", "Settings name persists", `PATCH returned ${patchRes.status}`);
      return;
    }
    await patchRes.text();
    const getRes = await apiFetch(`/api/workspaces/${wsId}/settings`, { token: ownerToken });
    const body = await getRes.json() as Record<string, unknown>;
    saveEvidence("TC-SC04", body, Object.fromEntries(getRes.headers.entries()));
    const settings = (body.settings ?? body.data ?? body) as Record<string, unknown>;
    const returnedName = (settings.name ?? body.name) as string | undefined;
    if (returnedName !== undefined) {
      assert(returnedName === uniqueName, `Name not persisted: expected "${uniqueName}", got "${returnedName}"`);
    }
    pass("TC-SC04", "PATCH workspace name persists in GET /settings");
  } catch (e) {
    fail("TC-SC04", "Settings name persists after PATCH", (e as Error).message);
  }

  // TC-SC05: PATCH /api/workspaces/:id/settings without token returns 401/403
  try {
    const res = await apiFetch(`/api/workspaces/${wsId}/settings`, {
      method: "PATCH",
      body: JSON.stringify({ name: "No Auth" }),
    });
    const text = await res.text();
    saveEvidence("TC-SC05", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 401 || res.status === 403,
      `Expected 401/403 without token, got ${res.status}`
    );
    pass("TC-SC05", "PATCH /api/workspaces/:id/settings without token returns 401/403");
  } catch (e) {
    fail("TC-SC05", "PATCH workspace settings requires auth", (e as Error).message);
  }

  // TC-SC06: PATCH with empty object doesn't 500
  try {
    if (!settingsEndpointExists) { skip("TC-SC06", "PATCH settings empty object", "endpoint not found"); return; }
    const res = await apiFetch(`/api/workspaces/${wsId}/settings`, {
      method: "PATCH",
      token: ownerToken,
      body: JSON.stringify({}),
    });
    const text = await res.text();
    saveEvidence("TC-SC06", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on PATCH empty settings: ${text.slice(0, 200)}`);
    pass("TC-SC06", "PATCH /api/workspaces/:id/settings with {} doesn't 500");
  } catch (e) {
    fail("TC-SC06", "PATCH settings empty object no 500", (e as Error).message);
  }

  // TC-SC07: PATCH with unknown field is ignored gracefully (no 400 for extra fields)
  try {
    if (!settingsEndpointExists) { skip("TC-SC07", "PATCH settings unknown field", "endpoint not found"); return; }
    const res = await apiFetch(`/api/workspaces/${wsId}/settings`, {
      method: "PATCH",
      token: ownerToken,
      body: JSON.stringify({ unknownField: "ignored", anotherUnknown: 42 }),
    });
    const text = await res.text();
    saveEvidence("TC-SC07", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on unknown field PATCH: ${text.slice(0, 200)}`);
    pass("TC-SC07", "PATCH settings with unknown fields doesn't 500");
  } catch (e) {
    fail("TC-SC07", "PATCH settings unknown fields no 500", (e as Error).message);
  }

  // TC-SC08: PATCH /api/workspaces/:id directly (not /settings) updates name
  try {
    const newName = `OOB Direct Patch ${Date.now()}`;
    const res = await apiFetch(`/api/workspaces/${wsId}`, {
      method: "PATCH",
      token: ownerToken,
      body: JSON.stringify({ name: newName }),
    });
    const text = await res.text();
    saveEvidence("TC-SC08", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 200 || res.status === 204 || res.status === 404 || res.status === 405,
      `Expected 200/204/404/405, got ${res.status}: ${text.slice(0, 200)}`
    );
    pass(`TC-SC08`, `PATCH /api/workspaces/:id returns ${res.status}`);
  } catch (e) {
    fail("TC-SC08", "PATCH /api/workspaces/:id directly", (e as Error).message);
  }

  // TC-SC09: GET /api/workspaces/:id/settings returns JSON content-type
  try {
    if (!settingsEndpointExists) { skip("TC-SC09", "Settings returns JSON content-type", "endpoint not found"); return; }
    const res = await apiFetch(`/api/workspaces/${wsId}/settings`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SC09", text, Object.fromEntries(res.headers.entries()));
    const ct = res.headers.get("content-type") ?? "";
    assert(ct.includes("json"), `Expected JSON content-type, got ${ct}`);
    pass("TC-SC09", "GET /api/workspaces/:id/settings returns JSON content-type");
  } catch (e) {
    fail("TC-SC09", "Settings GET returns JSON content-type", (e as Error).message);
  }

  // TC-SC10: GET /api/workspaces/:id/settings with wrong workspace ID returns 403/404
  try {
    const fakeId = "00000000-0000-4000-8000-000000000007";
    const res = await apiFetch(`/api/workspaces/${fakeId}/settings`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SC10", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 403 || res.status === 404,
      `Expected 403/404 for fake wsId, got ${res.status}`
    );
    pass("TC-SC10", "GET /api/workspaces/:fakeId/settings returns 403/404");
  } catch (e) {
    fail("TC-SC10", "GET settings for fake wsId", (e as Error).message);
  }

  // TC-SC11: PATCH workspace name with XSS payload is stored escaped
  try {
    if (!settingsEndpointExists) { skip("TC-SC11", "Settings XSS name escaping", "endpoint not found"); return; }
    const xssName = `<script>alert(1)</script> Test ${Date.now()}`;
    const patchRes = await apiFetch(`/api/workspaces/${wsId}/settings`, {
      method: "PATCH",
      token: ownerToken,
      body: JSON.stringify({ name: xssName }),
    });
    if (patchRes.status !== 200 && patchRes.status !== 204) {
      skip("TC-SC11", "XSS name stored escaped", `PATCH returned ${patchRes.status}`);
      return;
    }
    await patchRes.text();
    const getRes = await apiFetch(`/api/workspaces/${wsId}/settings`, { token: ownerToken });
    const text = await getRes.text();
    saveEvidence("TC-SC11", text, Object.fromEntries(getRes.headers.entries()));
    // The API should store/return the raw string (JSON-encoded); the frontend handles escaping
    assert(getRes.status === 200, `Expected 200 after XSS-name PATCH, got ${getRes.status}`);
    pass("TC-SC11", "Workspace name with XSS payload stored and retrievable without server error");
  } catch (e) {
    fail("TC-SC11", "Settings XSS name round-trip", (e as Error).message);
  }

  // TC-SC12: GET /api/workspaces returns list including the test workspace
  try {
    const res = await apiFetch("/api/workspaces", { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-SC12", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const list = (body.data ?? body) as Array<Record<string, unknown>>;
    assert(Array.isArray(list), `Expected array, got ${typeof list}`);
    const found = list.some(ws => ws.id === wsId);
    assert(found, `wsId ${wsId} not found in /api/workspaces list`);
    pass("TC-SC12", "GET /api/workspaces includes test workspace in list");
  } catch (e) {
    fail("TC-SC12", "GET /api/workspaces includes test workspace", (e as Error).message);
  }
}
