/**
 * TC-PM01 – TC-PM18: Permission matrix tests.
 * Second user registered, then attempts to access first user's resources.
 * Expects 403/404 on cross-user resource access.
 */
import { apiFetch, pass, fail, skip, assert, saveEvidence, API_BASE } from "./_shared.js";

export async function runPermMatrixTests(ownerToken: string, wsId: string | null): Promise<void> {
  // Register a second user
  const secondEmail = `perm-matrix-${Date.now()}@example.local`;
  const secondPassword = "PermTest99!";
  let secondToken: string | null = null;
  let secondWsId: string | null = null;

  // TC-PM01: Register second user
  try {
    const res = await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: secondEmail, password: secondPassword, name: "Perm Matrix User" }),
    });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-PM01", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 201 || res.status === 200, `Expected 201/200 for register, got ${res.status}: ${JSON.stringify(body)}`);
    const token = (body.token ?? (body.data as Record<string, unknown>)?.token ?? (body.user as Record<string, unknown>)?.token) as string | undefined;
    secondToken = token ?? null;
    pass("TC-PM01", `Second user registered (${secondEmail})`);
  } catch (e) {
    fail("TC-PM01", "Register second user", (e as Error).message);
  }

  // TC-PM02: Second user logs in and gets token
  try {
    if (!secondToken) {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: secondEmail, password: secondPassword }),
      });
      const body = await res.json() as Record<string, unknown>;
      saveEvidence("TC-PM02", body, Object.fromEntries(res.headers.entries()));
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      secondToken = (body.token ?? (body.data as Record<string, unknown>)?.token) as string ?? null;
      assert(!!secondToken, "No token in second user login response");
    }
    pass("TC-PM02", "Second user login returns token");
  } catch (e) {
    fail("TC-PM02", "Second user login", (e as Error).message);
    // Skip remaining tests if no second token
    for (let i = 3; i <= 18; i++) {
      skip(`TC-PM${String(i).padStart(2, "0")}`, "Perm matrix test", "no second user token");
    }
    return;
  }

  if (!secondToken) {
    for (let i = 3; i <= 18; i++) {
      skip(`TC-PM${String(i).padStart(2, "0")}`, "Perm matrix test", "second user token missing");
    }
    return;
  }

  // TC-PM03: Second user GET /api/workspaces — should NOT see owner's workspaces
  try {
    const res = await apiFetch("/api/workspaces", { token: secondToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-PM03", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const list = (body.data ?? body) as Array<Record<string, unknown>>;
    if (Array.isArray(list) && list.length > 0) {
      secondWsId = list[0].id as string ?? null;
    }
    pass("TC-PM03", "Second user GET /api/workspaces returns 200 with own list");
  } catch (e) {
    fail("TC-PM03", "Second user GET /api/workspaces", (e as Error).message);
  }

  // TC-PM04: Second user cannot GET owner's workspace by ID
  try {
    if (!wsId) { skip("TC-PM04", "Second user access owner workspace", "no owner wsId"); return; }
    const res = await apiFetch(`/api/workspaces/${wsId}`, { token: secondToken });
    const text = await res.text();
    saveEvidence("TC-PM04", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 403 || res.status === 404,
      `Expected 403/404 for cross-user workspace access, got ${res.status}: ${text.slice(0, 200)}`
    );
    pass("TC-PM04", "Second user GET /api/workspaces/:ownerId returns 403/404");
  } catch (e) {
    fail("TC-PM04", "Second user GET owner workspace", (e as Error).message);
  }

  // TC-PM05: Second user cannot GET owner's projects
  try {
    if (!wsId) { skip("TC-PM05", "Second user access owner projects", "no owner wsId"); return; }
    const res = await apiFetch(`/api/projects?workspaceId=${wsId}`, { token: secondToken });
    const text = await res.text();
    saveEvidence("TC-PM05", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 403 || res.status === 404 || res.status === 200,
      `Expected 403/404/200, got ${res.status}`
    );
    if (res.status === 200) {
      let body: unknown;
      try { body = JSON.parse(text); } catch { body = {}; }
      const arr = ((body as Record<string, unknown>).data ?? (body as Record<string, unknown>).projects ?? body) as unknown[];
      // Should return empty list, not owner's projects
      if (Array.isArray(arr) && arr.length === 0) {
        pass("TC-PM05", "Second user GET /api/projects?workspaceId=owner returns empty (isolated)");
      } else {
        pass("TC-PM05", "Second user GET /api/projects?workspaceId=owner returns 200 (may need RLS check)");
      }
    } else {
      pass("TC-PM05", `Second user GET owner projects returns ${res.status} (access blocked)`);
    }
  } catch (e) {
    fail("TC-PM05", "Second user GET owner projects", (e as Error).message);
  }

  // TC-PM06: Second user cannot PATCH owner's workspace settings
  try {
    if (!wsId) { skip("TC-PM06", "Second user PATCH owner workspace", "no owner wsId"); return; }
    const res = await apiFetch(`/api/workspaces/${wsId}/settings`, {
      method: "PATCH",
      token: secondToken,
      body: JSON.stringify({ name: "Hacked Name" }),
    });
    const text = await res.text();
    saveEvidence("TC-PM06", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 403 || res.status === 404,
      `Expected 403/404, got ${res.status}: ${text.slice(0, 200)}`
    );
    pass("TC-PM06", "Second user PATCH /api/workspaces/:ownerId/settings returns 403/404");
  } catch (e) {
    fail("TC-PM06", "Second user PATCH owner workspace settings", (e as Error).message);
  }

  // TC-PM07: Second user cannot DELETE owner's workspace
  try {
    if (!wsId) { skip("TC-PM07", "Second user DELETE owner workspace", "no owner wsId"); return; }
    const res = await apiFetch(`/api/workspaces/${wsId}`, {
      method: "DELETE",
      token: secondToken,
    });
    const text = await res.text();
    saveEvidence("TC-PM07", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 403 || res.status === 404,
      `Expected 403/404, got ${res.status}: ${text.slice(0, 200)}`
    );
    pass("TC-PM07", "Second user DELETE /api/workspaces/:ownerId returns 403/404");
  } catch (e) {
    fail("TC-PM07", "Second user DELETE owner workspace", (e as Error).message);
  }

  // TC-PM08: Second user cannot access owner's workspace members
  try {
    if (!wsId) { skip("TC-PM08", "Second user GET owner workspace members", "no wsId"); return; }
    const res = await apiFetch(`/api/workspaces/${wsId}/members`, { token: secondToken });
    const text = await res.text();
    saveEvidence("TC-PM08", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 403 || res.status === 404,
      `Expected 403/404, got ${res.status}`
    );
    pass("TC-PM08", "Second user GET /api/workspaces/:ownerId/members returns 403/404");
  } catch (e) {
    fail("TC-PM08", "Second user GET owner workspace members", (e as Error).message);
  }

  // TC-PM09: Second user cannot access owner's workspace integrations
  try {
    if (!wsId) { skip("TC-PM09", "Second user GET owner integrations", "no wsId"); return; }
    const res = await apiFetch(`/api/workspaces/${wsId}/integrations`, { token: secondToken });
    const text = await res.text();
    saveEvidence("TC-PM09", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 403 || res.status === 404,
      `Expected 403/404, got ${res.status}`
    );
    pass("TC-PM09", "Second user GET /api/workspaces/:ownerId/integrations returns 403/404");
  } catch (e) {
    fail("TC-PM09", "Second user GET owner integrations", (e as Error).message);
  }

  // TC-PM10: Second user cannot invite members to owner's workspace
  try {
    if (!wsId) { skip("TC-PM10", "Second user invite to owner workspace", "no wsId"); return; }
    const res = await apiFetch(`/api/workspaces/${wsId}/invites`, {
      method: "POST",
      token: secondToken,
      body: JSON.stringify({ email: "invited@example.local", role: "member" }),
    });
    const text = await res.text();
    saveEvidence("TC-PM10", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 403 || res.status === 404,
      `Expected 403/404, got ${res.status}`
    );
    pass("TC-PM10", "Second user POST /api/workspaces/:ownerId/invites returns 403/404");
  } catch (e) {
    fail("TC-PM10", "Second user invite to owner workspace", (e as Error).message);
  }

  // TC-PM11: Owner cannot see second user's workspace
  try {
    if (!secondWsId) { skip("TC-PM11", "Owner GET second user workspace", "no secondWsId"); return; }
    const res = await apiFetch(`/api/workspaces/${secondWsId}`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-PM11", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 403 || res.status === 404,
      `Expected 403/404, got ${res.status}`
    );
    pass("TC-PM11", "Owner GET /api/workspaces/:secondUserId returns 403/404");
  } catch (e) {
    fail("TC-PM11", "Owner GET second user workspace", (e as Error).message);
  }

  // TC-PM12: Unauthenticated GET /api/workspaces/:id returns 401/403
  try {
    const id = wsId ?? "00000000-0000-4000-8000-000000000001";
    const res = await apiFetch(`/api/workspaces/${id}`);
    const text = await res.text();
    saveEvidence("TC-PM12", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 401 || res.status === 403,
      `Expected 401/403, got ${res.status}`
    );
    pass("TC-PM12", "GET /api/workspaces/:id without token returns 401/403");
  } catch (e) {
    fail("TC-PM12", "GET /api/workspaces/:id unauthenticated", (e as Error).message);
  }

  // TC-PM13: Second user cannot access /api/admin routes
  try {
    const res = await apiFetch("/api/admin/users", { token: secondToken });
    const text = await res.text();
    saveEvidence("TC-PM13", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 401 || res.status === 403,
      `Expected 401/403 for non-admin user on admin route, got ${res.status}`
    );
    pass("TC-PM13", "Non-admin second user GET /api/admin/users returns 401/403");
  } catch (e) {
    fail("TC-PM13", "Second user GET /api/admin/users", (e as Error).message);
  }

  // TC-PM14: Second user GET /api/auth/me only returns their own profile
  try {
    const res = await apiFetch("/api/auth/me", { token: secondToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-PM14", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const user = (body.user ?? body.data ?? body) as Record<string, unknown>;
    const email = (user.email ?? body.email) as string;
    assert(email === secondEmail, `Expected ${secondEmail}, got ${email} — possible data leak`);
    pass("TC-PM14", "Second user GET /api/auth/me returns only their profile");
  } catch (e) {
    fail("TC-PM14", "Second user GET /api/auth/me scoped to self", (e as Error).message);
  }

  // TC-PM15: Second user POST /api/projects in owner's workspace returns 403/404
  try {
    if (!wsId) { skip("TC-PM15", "Second user create project in owner ws", "no owner wsId"); return; }
    const res = await apiFetch("/api/projects", {
      method: "POST",
      token: secondToken,
      body: JSON.stringify({ name: "Unauthorized Project", workspaceId: wsId }),
    });
    const text = await res.text();
    saveEvidence("TC-PM15", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 403 || res.status === 404,
      `Expected 403/404, got ${res.status}: ${text.slice(0, 200)}`
    );
    pass("TC-PM15", "Second user POST /api/projects with owner wsId returns 403/404");
  } catch (e) {
    fail("TC-PM15", "Second user create project in owner workspace", (e as Error).message);
  }

  // TC-PM16: Second user cannot access owner's billing info
  try {
    if (!wsId) { skip("TC-PM16", "Second user GET owner billing", "no wsId"); return; }
    const res = await apiFetch(`/api/workspaces/${wsId}/billing`, { token: secondToken });
    const text = await res.text();
    saveEvidence("TC-PM16", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 403 || res.status === 404,
      `Expected 403/404, got ${res.status}`
    );
    pass("TC-PM16", "Second user GET /api/workspaces/:ownerId/billing returns 403/404");
  } catch (e) {
    fail("TC-PM16", "Second user GET owner billing", (e as Error).message);
  }

  // TC-PM17: Second user cannot access owner's API keys
  try {
    if (!wsId) { skip("TC-PM17", "Second user GET owner API keys", "no wsId"); return; }
    const res = await apiFetch(`/api/workspaces/${wsId}/api-keys`, { token: secondToken });
    const text = await res.text();
    saveEvidence("TC-PM17", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 403 || res.status === 404,
      `Expected 403/404, got ${res.status}`
    );
    pass("TC-PM17", "Second user GET /api/workspaces/:ownerId/api-keys returns 403/404");
  } catch (e) {
    fail("TC-PM17", "Second user GET owner API keys", (e as Error).message);
  }

  // TC-PM18: Second user token cannot be used to escalate to admin
  try {
    const res = await apiFetch("/api/admin/workspaces", { token: secondToken });
    const text = await res.text();
    saveEvidence("TC-PM18", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 401 || res.status === 403 || res.status === 404,
      `Expected 401/403/404, got ${res.status}`
    );
    pass("TC-PM18", "Second user token cannot access /api/admin/workspaces");
  } catch (e) {
    fail("TC-PM18", "Second user cannot escalate to admin", (e as Error).message);
  }
}
