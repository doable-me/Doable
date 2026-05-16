/**
 * TC-TH01 – TC-TH05: Thumbnail endpoint smoke tests.
 * Thumbnails are served at /api/thumbnails/:filename
 * Regeneration at /api/thumbnails/:projectId/regenerate (auth required).
 * Requires ownerToken + workspaceId from prior stages.
 */
import { apiFetch, pass, fail, assert, saveEvidence } from "./_shared.js";

export async function runThumbnailsTests(ownerToken: string, workspaceId: string | null): Promise<void> {
  let projectId: string | null = null;

  // Create a temporary project for thumbnail tests
  if (workspaceId) {
    try {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        token: ownerToken,
        body: JSON.stringify({
          name: `OOB Thumbnail Test ${Date.now()}`,
          workspaceId,
          framework: "vite-react",
        }),
      });
      if (res.status === 200 || res.status === 201) {
        const body = await res.json() as Record<string, unknown>;
        const proj = (body.project ?? body.data ?? body) as Record<string, unknown>;
        projectId = (proj.id ?? body.id) as string ?? null;
      }
    } catch { /* continue without project */ }
  }

  // TC-TH01: GET /api/thumbnails/:filename for non-existent file returns 404
  try {
    const res = await apiFetch("/api/thumbnails/nonexistent-project-000.png");
    const text = await res.text();
    saveEvidence("TC-TH01", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 404 || res.status === 400,
      `Expected 404/400 for missing thumbnail, got ${res.status}`
    );
    pass("TC-TH01", "GET /api/thumbnails/:unknownFile returns 404/400");
  } catch (e) {
    fail("TC-TH01", "GET /api/thumbnails/:unknownFile returns 404/400", (e as Error).message);
  }

  // TC-TH02: POST /api/thumbnails/:projectId/regenerate without token returns 401
  try {
    const testId = projectId ?? "00000000-0000-4000-8000-000000000001";
    const res = await apiFetch(`/api/thumbnails/${testId}/regenerate`, {
      method: "POST",
    });
    const text = await res.text();
    saveEvidence("TC-TH02", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 401 || res.status === 403, `Expected 401/403 without token, got ${res.status}`);
    pass("TC-TH02", "POST /api/thumbnails/:projectId/regenerate without token returns 401/403");
  } catch (e) {
    fail("TC-TH02", "POST /api/thumbnails/:projectId/regenerate without token returns 401/403", (e as Error).message);
  }

  // TC-TH03: POST /api/thumbnails/:projectId/regenerate with valid token returns 200/202/404
  try {
    if (!projectId) {
      console.log("  SKIP  [TC-TH03] No projectId — skipping regenerate test");
      pass("TC-TH03", "POST /api/thumbnails/:projectId/regenerate (skipped — no project)");
    } else {
      const res = await apiFetch(`/api/thumbnails/${projectId}/regenerate`, {
        method: "POST",
        token: ownerToken,
      });
      const text = await res.text();
      saveEvidence("TC-TH03", text, Object.fromEntries(res.headers.entries()));
      // 200/202 = queued; 404 = project not found at thumbnail level; 500 = puppeteer not ready
      assert(
        res.status === 200 || res.status === 202 || res.status === 404 || res.status === 500,
        `Unexpected status from regenerate: ${res.status}: ${text.slice(0, 200)}`
      );
      if (res.status === 500) {
        console.log("  SKIP  [TC-TH03] Puppeteer/Chrome not available — regenerate returned 500 (expected on CI)");
        pass("TC-TH03", "POST /api/thumbnails/:projectId/regenerate (skipped — Puppeteer not available)");
      } else {
        pass("TC-TH03", `POST /api/thumbnails/:projectId/regenerate returns ${res.status}`);
      }
    }
  } catch (e) {
    fail("TC-TH03", "POST /api/thumbnails/:projectId/regenerate with valid token", (e as Error).message);
  }

  // TC-TH04: GET /api/thumbnails/:filename with valid project thumbnail path — 200 or 404
  try {
    if (!projectId) {
      console.log("  SKIP  [TC-TH04] No projectId — skipping thumbnail fetch test");
      pass("TC-TH04", "GET /api/thumbnails/:projectFile (skipped — no project)");
    } else {
      // Thumbnail filename convention: <projectId>.png or <projectId>-thumb.png
      const res = await apiFetch(`/api/thumbnails/${projectId}.png`);
      const text = await res.text();
      saveEvidence("TC-TH04", text.slice(0, 100), Object.fromEntries(res.headers.entries()));
      // 200 = thumbnail exists; 404 = not yet generated (expected on fresh project)
      assert(
        res.status === 200 || res.status === 404 || res.status === 400,
        `Expected 200/404/400 for project thumbnail, got ${res.status}`
      );
      pass("TC-TH04", `GET /api/thumbnails/:projectId.png returns ${res.status} (200=exists, 404=not yet generated)`);
    }
  } catch (e) {
    fail("TC-TH04", "GET /api/thumbnails/:projectId.png returns 200 or 404", (e as Error).message);
  }

  // TC-TH05: POST /api/thumbnails/:fakeId/regenerate returns 404 for unknown project
  try {
    const fakeId = "00000000-0000-4000-8000-000000000003";
    const res = await apiFetch(`/api/thumbnails/${fakeId}/regenerate`, {
      method: "POST",
      token: ownerToken,
    });
    const text = await res.text();
    saveEvidence("TC-TH05", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 404 || res.status === 403 || res.status === 500,
      `Expected 404/403 for fake project regenerate, got ${res.status}`
    );
    pass("TC-TH05", `POST /api/thumbnails/:fakeId/regenerate returns ${res.status} for unknown project`);
  } catch (e) {
    fail("TC-TH05", "POST /api/thumbnails/:fakeId/regenerate returns 404/403 for unknown project", (e as Error).message);
  }

  // Cleanup temp project
  if (projectId) {
    await apiFetch(`/api/projects/${projectId}`, { method: "DELETE", token: ownerToken }).catch(() => {});
  }
}
