/**
 * Contract test for platformCredentials vault (US-INT-03).
 *
 * Tests the invariants that matter for security:
 *   1. upsert stores credentials without leaking plaintext
 *   2. list() never returns decrypted credentials
 *   3. get() decrypts correctly
 *   4. delete() removes the row and returns false on second call
 *
 * Run with: node --env-file=../../.env --import tsx/esm src/integrations/platform-credentials.contract.test.ts
 * Requires a live DB (uses the same connection as the API).
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

// Dynamic import after env is loaded
const { platformCredentials } = await import("./credential-vault.js");

// Namespace the test integration id with the runner pid so that parallel
// runs against the same database don't trample each other's setup/teardown.
const TEST_INTEGRATION_ID = `__test_platform_cred_openai_${process.pid}__`;
const SECRET_VALUE = "sk-supersecret-test-key-do-not-log";
const TEST_CREDENTIALS = { apiKey: SECRET_VALUE };

describe("platformCredentials", () => {
  // Cleanup before and after in case a previous run left a row
  before(async () => {
    await platformCredentials.delete(TEST_INTEGRATION_ID);
  });

  after(async () => {
    await platformCredentials.delete(TEST_INTEGRATION_ID);
  });

  test("upsert stores credentials and returns id + updatedAt", async () => {
    const result = await platformCredentials.upsert({
      integrationId: TEST_INTEGRATION_ID,
      authType: "secret_text",
      credentials: TEST_CREDENTIALS,
      displayHint: "...cret",
      actorUserId: "00000000-0000-0000-0000-000000000001",
    });
    assert.ok(result.id, "should return an id");
    assert.ok(result.updatedAt instanceof Date, "should return a Date");
  });

  test("list() returns the integration but NEVER the raw secret", async () => {
    const rows = await platformCredentials.list();
    const found = rows.find((r) => r.integrationId === TEST_INTEGRATION_ID);
    assert.ok(found, "integration should appear in list");
    // list() returns PlatformCredentialRow which has no credentials field
    assert.ok(!("credentials" in found), "list rows must not contain credentials field");
    // Stringify the entire response to catch accidental leakage
    const serialised = JSON.stringify(rows);
    assert.ok(
      !serialised.includes(SECRET_VALUE),
      "list() response must NOT contain the raw secret string",
    );
  });

  test("get() decrypts and returns credentials", async () => {
    const row = await platformCredentials.get(TEST_INTEGRATION_ID);
    assert.ok(row, "should find the row");
    assert.equal(row.integrationId, TEST_INTEGRATION_ID);
    assert.equal(row.authType, "secret_text");
    assert.deepEqual(row.credentials, TEST_CREDENTIALS);
  });

  test("upsert is idempotent (ON CONFLICT update)", async () => {
    const updated = await platformCredentials.upsert({
      integrationId: TEST_INTEGRATION_ID,
      authType: "secret_text",
      credentials: { apiKey: "sk-updated" },
      actorUserId: "00000000-0000-0000-0000-000000000001",
    });
    assert.ok(updated.id, "re-upsert returns id");

    const row = await platformCredentials.get(TEST_INTEGRATION_ID);
    assert.deepEqual(row?.credentials, { apiKey: "sk-updated" });
  });

  test("delete() removes the row and returns true", async () => {
    const deleted = await platformCredentials.delete(TEST_INTEGRATION_ID);
    assert.equal(deleted, true);

    const gone = await platformCredentials.get(TEST_INTEGRATION_ID);
    assert.equal(gone, null, "row should be gone after delete");
  });

  test("delete() returns false for non-existent integration", async () => {
    const result = await platformCredentials.delete("__nonexistent_integration_id__");
    assert.equal(result, false);
  });
});
