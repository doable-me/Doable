import { Hono } from "hono";
import { sql } from "../db/index.js";
import { securityQueries } from "@doable/db/queries/security.js";
import { authMiddleware } from "../middleware/auth.js";
import { getProjectPath } from "../projects/file-manager.js";
import { runFullScan } from "../security/scanner.js";
import { validateProjectIdParam } from "./projects/helpers.js";

const security = securityQueries(sql);
export const securityRoutes = new Hono({ strict: false });

// All security routes require authentication
securityRoutes.use("*", authMiddleware);

// BUG-CORPUS-PROJ-003: reject non-UUID `:id` before SQL → 400, not 500.
securityRoutes.use("/:id/security", validateProjectIdParam());
securityRoutes.use("/:id/security/*", validateProjectIdParam());

// ─── POST /projects/:id/security/scan ─ Trigger a full security scan ───
securityRoutes.post("/:id/security/scan", async (c) => {
  const projectId = c.req.param("id");

  // Resolve project directory
  const projectDir = getProjectPath(projectId);

  let scan;
  try {
    scan = await security.createScan({ projectId, scanType: "full" });
  } catch (err) {
    console.error("[Security] Failed to create scan record:", err);
    return c.json({ error: "Failed to start security scan" }, 500);
  }

  // Run scan asynchronously — respond immediately with scan ID
  // but also run synchronously for simplicity (scans are fast)
  try {
    const result = await runFullScan(projectDir);

    // Store findings in DB
    if (result.findings.length > 0) {
      await security.createFindings(
        result.findings.map((f) => ({
          scanId: scan.id,
          severity: f.severity,
          category: f.category,
          title: f.title,
          description: f.description,
          filePath: f.filePath,
          lineNumber: f.lineNumber,
          codeSnippet: f.codeSnippet,
          fixSuggestion: f.fixSuggestion,
        }))
      );
    }

    await security.completeScan(scan.id, result.findings.length);

    return c.json({
      scan: {
        id: scan.id,
        projectId,
        status: "completed",
        findingsCount: result.findings.length,
        filesScanned: result.filesScanned,
        duration: result.duration,
      },
      findings: result.findings,
    });
  } catch (err) {
    console.error("[Security] Scan failed:", err);
    try {
      await security.failScan(scan.id);
    } catch {
      // Ignore DB errors during cleanup
    }
    return c.json(
      {
        error: "Security scan failed",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      500
    );
  }
});

// ─── GET /projects/:id/security/results ─ Get latest scan results ───
securityRoutes.get("/:id/security/results", async (c) => {
  const projectId = c.req.param("id");

  try {
    const scan = await security.getLatestScan(projectId);
    if (!scan) {
      return c.json({ scan: null, findings: [] });
    }

    const findings = await security.getFindingsForScan(scan.id);

    return c.json({
      scan: {
        id: scan.id,
        projectId: scan.project_id,
        scanType: scan.scan_type,
        status: scan.status,
        findingsCount: scan.findings_count,
        startedAt: scan.started_at?.toISOString() ?? null,
        completedAt: scan.completed_at?.toISOString() ?? null,
        createdAt: scan.created_at.toISOString(),
      },
      findings: findings.map((f) => ({
        id: f.id,
        severity: f.severity,
        category: f.category,
        title: f.title,
        description: f.description,
        filePath: f.file_path,
        lineNumber: f.line_number,
        codeSnippet: f.code_snippet,
        fixSuggestion: f.fix_suggestion,
        dismissed: f.dismissed,
        createdAt: f.created_at.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[Security] Failed to fetch results:", err);
    return c.json({ error: "Failed to fetch security results" }, 500);
  }
});

// ─── POST /projects/:id/security/dismiss/:findingId ─ Dismiss a finding ───
securityRoutes.post("/:id/security/dismiss/:findingId", async (c) => {
  const findingId = c.req.param("findingId");
  const userId = c.get("userId" as never) as string;

  try {
    const finding = await security.dismissFinding(findingId, userId);
    if (!finding) {
      return c.json({ error: "Finding not found" }, 404);
    }

    return c.json({
      finding: {
        id: finding.id,
        dismissed: finding.dismissed,
      },
    });
  } catch (err) {
    console.error("[Security] Failed to dismiss finding:", err);
    return c.json({ error: "Failed to dismiss finding" }, 500);
  }
});
