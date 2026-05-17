/**
 * TC-UL01 – TC-UL14: Upload limit tests.
 * POST /api/projects/:id/files with various sizes, content-types, paths.
 */
import { apiFetch, pass, fail, skip, assert, saveEvidence } from "./_shared.js";

export async function runUploadLimitTests(ownerToken: string, wsId: string | null): Promise<void> {
  // First, create a project to upload files to
  let projectId: string | null = null;

  // TC-UL01: Check upload endpoint exists — HEAD or GET probe
  try {
    if (!wsId) { skip("TC-UL01", "Upload endpoint probe", "no wsId"); return; }

    // Create a temporary project
    const projRes = await apiFetch("/api/projects", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ name: `OOB Upload Test ${Date.now()}`, workspaceId: wsId }),
    });
    if (projRes.status === 201 || projRes.status === 200) {
      const body = await projRes.json() as Record<string, unknown>;
      const proj = (body.project ?? body.data ?? body) as Record<string, unknown>;
      projectId = (proj.id ?? body.id) as string ?? null;
    }

    if (!projectId) {
      skip("TC-UL01", "Upload endpoint probe", "could not create test project");
      return;
    }

    const res = await apiFetch(`/api/projects/${projectId}/files`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-UL01", text, Object.fromEntries(res.headers.entries()));
    if (res.status === 404) {
      skip("TC-UL01", "Upload files endpoint", "endpoint not found at /api/projects/:id/files");
      return;
    }
    assert(res.status !== 500, `Got 500 on files endpoint probe: ${text.slice(0, 200)}`);
    pass("TC-UL01", "GET /api/projects/:id/files probe returns non-500");
  } catch (e) {
    fail("TC-UL01", "Upload endpoint probe", (e as Error).message);
  }

  // Helper: check if upload endpoint is available
  const uploadEndpointAvailable = projectId !== null;

  // TC-UL02: POST small text file (100 bytes) returns 200/201
  try {
    if (!uploadEndpointAvailable || !projectId) { skip("TC-UL02", "Small file upload", "no project"); return; }
    const content = "a".repeat(100);
    const res = await apiFetch(`/api/projects/${projectId}/files`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ path: "test.txt", content }),
    });
    const text = await res.text();
    saveEvidence("TC-UL02", text, Object.fromEntries(res.headers.entries()));
    if (res.status === 404) { skip("TC-UL02", "Small file upload", "endpoint not found"); return; }
    assert(
      res.status === 200 || res.status === 201 || res.status === 204,
      `Expected 200/201/204 for small file, got ${res.status}: ${text.slice(0, 200)}`
    );
    pass("TC-UL02", "POST small 100-byte file returns 200/201/204");
  } catch (e) {
    fail("TC-UL02", "Small file upload", (e as Error).message);
  }

  // TC-UL03: POST file with missing path returns 400/422
  try {
    if (!uploadEndpointAvailable || !projectId) { skip("TC-UL03", "File upload missing path", "no project"); return; }
    const res = await apiFetch(`/api/projects/${projectId}/files`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ content: "hello" }),
    });
    const text = await res.text();
    saveEvidence("TC-UL03", text, Object.fromEntries(res.headers.entries()));
    if (res.status === 404) { skip("TC-UL03", "File upload missing path validation", "endpoint not found"); return; }
    assert(
      res.status === 400 || res.status === 422,
      `Expected 400/422 for missing path, got ${res.status}`
    );
    pass("TC-UL03", "POST file without path returns 400/422");
  } catch (e) {
    fail("TC-UL03", "File upload missing path validation", (e as Error).message);
  }

  // TC-UL04: POST file with path traversal attempt
  try {
    if (!uploadEndpointAvailable || !projectId) { skip("TC-UL04", "File upload path traversal", "no project"); return; }
    const res = await apiFetch(`/api/projects/${projectId}/files`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ path: "../../../etc/passwd", content: "evil" }),
    });
    const text = await res.text();
    saveEvidence("TC-UL04", text, Object.fromEntries(res.headers.entries()));
    if (res.status === 404) { skip("TC-UL04", "File upload path traversal blocked", "endpoint not found"); return; }
    assert(
      res.status === 400 || res.status === 422 || res.status === 403,
      `Expected 400/422/403 for path traversal, got ${res.status}: ${text.slice(0, 200)}`
    );
    pass("TC-UL04", "POST file with path traversal returns 400/422/403");
  } catch (e) {
    fail("TC-UL04", "File upload path traversal blocked", (e as Error).message);
  }

  // TC-UL05: POST large file (2MB) — should accept or return 413
  try {
    if (!uploadEndpointAvailable || !projectId) { skip("TC-UL05", "2MB file upload", "no project"); return; }
    const content = "x".repeat(2 * 1024 * 1024); // 2MB
    const res = await apiFetch(`/api/projects/${projectId}/files`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ path: "large-file.txt", content }),
    });
    const text = await res.text();
    saveEvidence("TC-UL05", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    if (res.status === 404) { skip("TC-UL05", "2MB file upload", "endpoint not found"); return; }
    assert(
      res.status === 200 || res.status === 201 || res.status === 413 || res.status === 422 || res.status === 400,
      `Expected 200/201/413/422/400 for 2MB file, got ${res.status}`
    );
    pass(`TC-UL05`, `POST 2MB file returns ${res.status} (accepted or limit enforced)`);
  } catch (e) {
    fail("TC-UL05", "2MB file upload", (e as Error).message);
  }

  // TC-UL06: POST file to non-existent project returns 403/404
  try {
    const fakeId = "00000000-0000-4000-8000-000000000099";
    const res = await apiFetch(`/api/projects/${fakeId}/files`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ path: "test.txt", content: "hello" }),
    });
    const text = await res.text();
    saveEvidence("TC-UL06", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 403 || res.status === 404,
      `Expected 403/404 for fake project, got ${res.status}`
    );
    pass("TC-UL06", "POST file to non-existent project returns 403/404");
  } catch (e) {
    fail("TC-UL06", "POST file to non-existent project", (e as Error).message);
  }

  // TC-UL07: POST file without token returns 401/403
  try {
    const id = projectId ?? "00000000-0000-4000-8000-000000000001";
    const res = await apiFetch(`/api/projects/${id}/files`, {
      method: "POST",
      body: JSON.stringify({ path: "test.txt", content: "hello" }),
    });
    const text = await res.text();
    saveEvidence("TC-UL07", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 401 || res.status === 403,
      `Expected 401/403 without token, got ${res.status}`
    );
    pass("TC-UL07", "POST file without token returns 401/403");
  } catch (e) {
    fail("TC-UL07", "POST file without token", (e as Error).message);
  }

  // TC-UL08: POST file with null content doesn't 500
  try {
    if (!uploadEndpointAvailable || !projectId) { skip("TC-UL08", "File upload null content", "no project"); return; }
    const res = await apiFetch(`/api/projects/${projectId}/files`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ path: "null.txt", content: null }),
    });
    const text = await res.text();
    saveEvidence("TC-UL08", text, Object.fromEntries(res.headers.entries()));
    if (res.status === 404) { skip("TC-UL08", "File upload null content", "endpoint not found"); return; }
    assert(res.status !== 500, `Got 500 for null content: ${text.slice(0, 200)}`);
    pass("TC-UL08", "POST file with null content doesn't 500");
  } catch (e) {
    fail("TC-UL08", "POST file null content", (e as Error).message);
  }

  // TC-UL09: DELETE file endpoint works or 404
  try {
    if (!uploadEndpointAvailable || !projectId) { skip("TC-UL09", "Delete file", "no project"); return; }
    const res = await apiFetch(`/api/projects/${projectId}/files/test.txt`, {
      method: "DELETE",
      token: ownerToken,
    });
    const text = await res.text();
    saveEvidence("TC-UL09", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 200 || res.status === 204 || res.status === 404,
      `Expected 200/204/404, got ${res.status}`
    );
    pass("TC-UL09", "DELETE /api/projects/:id/files/test.txt returns 200/204/404");
  } catch (e) {
    fail("TC-UL09", "DELETE file endpoint", (e as Error).message);
  }

  // TC-UL10: POST file with binary-looking content doesn't 500
  try {
    if (!uploadEndpointAvailable || !projectId) { skip("TC-UL10", "Binary content upload", "no project"); return; }
    const res = await apiFetch(`/api/projects/${projectId}/files`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ path: "binary.bin", content: "\x00\x01\x02\xff\xfe" }),
    });
    const text = await res.text();
    saveEvidence("TC-UL10", text.slice(0, 200), Object.fromEntries(res.headers.entries()));
    if (res.status === 404) { skip("TC-UL10", "Binary content upload", "endpoint not found"); return; }
    assert(res.status !== 500, `Got 500 for binary content: ${text.slice(0, 200)}`);
    pass("TC-UL10", "POST file with binary content doesn't 500");
  } catch (e) {
    fail("TC-UL10", "POST file binary content", (e as Error).message);
  }

  // TC-UL11: POST file with very long path doesn't 500
  try {
    if (!uploadEndpointAvailable || !projectId) { skip("TC-UL11", "Long path upload", "no project"); return; }
    const longPath = "a/".repeat(50) + "file.txt";
    const res = await apiFetch(`/api/projects/${projectId}/files`, {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ path: longPath, content: "hello" }),
    });
    const text = await res.text();
    saveEvidence("TC-UL11", text, Object.fromEntries(res.headers.entries()));
    if (res.status === 404) { skip("TC-UL11", "Long path upload", "endpoint not found"); return; }
    assert(res.status !== 500, `Got 500 for long path: ${text.slice(0, 200)}`);
    pass("TC-UL11", "POST file with 50-dir-deep path doesn't 500");
  } catch (e) {
    fail("TC-UL11", "POST file long path", (e as Error).message);
  }

  // TC-UL12: Multipart form upload (if supported) doesn't 500
  try {
    if (!uploadEndpointAvailable || !projectId) { skip("TC-UL12", "Multipart form upload", "no project"); return; }
    const { API_BASE } = await import("./_shared.js");
    const formData = new FormData();
    formData.append("file", new Blob(["hello world"], { type: "text/plain" }), "upload.txt");
    formData.append("path", "upload.txt");
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: formData,
    });
    const text = await res.text();
    saveEvidence("TC-UL12", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on multipart upload: ${text.slice(0, 200)}`);
    pass(`TC-UL12`, `Multipart form upload returns ${res.status} (no 500)`);
  } catch (e) {
    fail("TC-UL12", "Multipart form upload no 500", (e as Error).message);
  }

  // TC-UL13: GET /api/projects/:id/files returns file list
  try {
    if (!uploadEndpointAvailable || !projectId) { skip("TC-UL13", "GET files list", "no project"); return; }
    const res = await apiFetch(`/api/projects/${projectId}/files`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-UL13", text, Object.fromEntries(res.headers.entries()));
    if (res.status === 404) { skip("TC-UL13", "GET files list", "endpoint not found"); return; }
    assert(res.status === 200 || res.status === 204, `Expected 200/204, got ${res.status}`);
    pass("TC-UL13", "GET /api/projects/:id/files returns 200/204");
  } catch (e) {
    fail("TC-UL13", "GET /api/projects/:id/files list", (e as Error).message);
  }

  // TC-UL14: Cleanup — delete the test project
  try {
    if (!projectId) { skip("TC-UL14", "Cleanup test project", "no projectId"); return; }
    const res = await apiFetch(`/api/projects/${projectId}`, {
      method: "DELETE",
      token: ownerToken,
    });
    const text = await res.text();
    saveEvidence("TC-UL14", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200 || res.status === 204, `Expected 200/204 on cleanup, got ${res.status}`);
    pass("TC-UL14", "DELETE test project (upload test cleanup)");
  } catch (e) {
    fail("TC-UL14", "DELETE upload test project cleanup", (e as Error).message);
  }
}
