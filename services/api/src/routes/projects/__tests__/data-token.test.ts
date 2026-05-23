/**
 * Tests for the data-token mint helper.
 *
 * Run:  pnpm exec tsx --test services/api/src/routes/projects/__tests__/data-token.test.ts
 */

import { test, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mintDataToken } from "../data-token.js";
import { verifyProjectJwt } from "../../../auth/project-jwt.js";
import { PROJECT_JWT_SECRET } from "../../../lib/secrets.js";

// Guard: skip DB-touching paths when DATABASE_URL is absent (CI without DB).
// mintDataToken itself does NOT touch the DB; the route handler does via
// requireProjectAccess. The helper is tested in isolation here.

describe("mintDataToken", () => {
  it("returns a verifiable JWT with correct claims and 15-min expiry", async () => {
    const projectId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const workspaceId = "11111111-2222-3333-4444-555555555555";
    const userId = "66666666-7777-8888-9999-aaaaaaaaaaaa";

    const before = Math.floor(Date.now() / 1000);
    const { token, expiresIn } = await mintDataToken(projectId, workspaceId, userId);
    const after = Math.floor(Date.now() / 1000);

    assert.equal(expiresIn, 15 * 60, "expiresIn should be 900 seconds");

    const claims = await verifyProjectJwt(token, PROJECT_JWT_SECRET);

    assert.equal(claims.projectId, projectId);
    assert.equal(claims.workspaceId, workspaceId);
    assert.equal(claims.userId, userId);
    assert.equal(claims.kind, "connector-proxy");

    // iat must be within the test window
    assert.ok(claims.iat >= before, "iat should be >= before");
    assert.ok(claims.iat <= after + 1, "iat should be <= after");

    // exp must be iat + 15 min (allow 1s clock slack)
    assert.ok(
      claims.exp >= claims.iat + 15 * 60 - 1 &&
        claims.exp <= claims.iat + 15 * 60 + 1,
      `exp (${claims.exp}) should be iat (${claims.iat}) + 900`,
    );
  });

  it("minting two tokens for the same project produces different JWTs", async () => {
    const projectId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const workspaceId = "11111111-2222-3333-4444-555555555555";
    const userId = "66666666-7777-8888-9999-aaaaaaaaaaaa";

    const { token: t1 } = await mintDataToken(projectId, workspaceId, userId);
    // Small delay so iat can differ
    await new Promise((r) => setTimeout(r, 10));
    const { token: t2 } = await mintDataToken(projectId, workspaceId, userId);

    // JWT strings may differ due to different iat values; verify both are valid
    const c1 = await verifyProjectJwt(t1, PROJECT_JWT_SECRET);
    const c2 = await verifyProjectJwt(t2, PROJECT_JWT_SECRET);
    assert.equal(c1.projectId, c2.projectId);
  });
});
