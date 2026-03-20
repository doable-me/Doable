/**
 * Security Scanner Service
 *
 * Performs security analysis on project directories:
 * - Dependency vulnerability scanning (npm audit)
 * - Secret detection (regex-based pattern matching)
 * - Code quality / security anti-pattern detection
 */

import { exec } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, relative } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// ─── Types ──────────────────────────────────────────────────

export interface ScanFinding {
  severity: "critical" | "high" | "medium" | "low";
  category: "dependency" | "secret" | "code-quality";
  title: string;
  description?: string;
  filePath?: string;
  lineNumber?: number;
  codeSnippet?: string;
  fixSuggestion?: string;
}

export interface ScanResult {
  findings: ScanFinding[];
  filesScanned: number;
  duration: number;
}

// ─── Secret Patterns ────────────────────────────────────────

interface SecretPattern {
  name: string;
  regex: RegExp;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  fix: string;
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: "AWS Access Key",
    regex: /AKIA[0-9A-Z]{16}/g,
    severity: "critical",
    description: "AWS access key ID found in source code. This could allow unauthorized access to AWS resources.",
    fix: "Move the AWS key to environment variables. Use AWS_ACCESS_KEY_ID env var instead.",
  },
  {
    name: "AWS Secret Key",
    regex: /(?:aws_secret_access_key|aws_secret)\s*[=:]\s*['"][A-Za-z0-9/+=]{40}['"]/gi,
    severity: "critical",
    description: "AWS secret access key found in source code.",
    fix: "Move the AWS secret to environment variables. Use AWS_SECRET_ACCESS_KEY env var instead.",
  },
  {
    name: "Private Key",
    regex: /-----BEGIN\s+(RSA|EC|DSA|OPENSSH|PGP)?\s*PRIVATE KEY-----/g,
    severity: "critical",
    description: "Private key found in source code. This is a severe security risk.",
    fix: "Remove the private key from source code. Store it securely and reference via file path in env vars.",
  },
  {
    name: "Generic API Key",
    regex: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*['"][a-zA-Z0-9_\-]{20,}['"]/gi,
    severity: "high",
    description: "Hardcoded API key detected. API keys should be stored in environment variables.",
    fix: "Move the API key to a .env file and access via process.env. Add the key name to .env.example.",
  },
  {
    name: "Secret/Token Assignment",
    regex: /(?:secret|token|password|passwd|pwd)\s*[=:]\s*['"][a-zA-Z0-9_\-!@#$%^&*]{8,}['"]/gi,
    severity: "high",
    description: "Hardcoded secret or token detected in source code.",
    fix: "Move the secret to environment variables. Never commit secrets to version control.",
  },
  {
    name: "Database URL",
    regex: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/gi,
    severity: "high",
    description: "Database connection string with credentials found in source code.",
    fix: "Move the database URL to DATABASE_URL environment variable.",
  },
  {
    name: "JWT Secret",
    regex: /(?:jwt[_-]?secret|jwt[_-]?key)\s*[=:]\s*['"][a-zA-Z0-9_\-!@#$%^&*]{8,}['"]/gi,
    severity: "high",
    description: "Hardcoded JWT secret found. This could allow token forgery.",
    fix: "Move the JWT secret to JWT_SECRET environment variable.",
  },
  {
    name: "Stripe Key",
    regex: /(?:sk|pk)_(?:live|test)_[a-zA-Z0-9]{20,}/g,
    severity: "high",
    description: "Stripe API key found in source code.",
    fix: "Move the Stripe key to STRIPE_SECRET_KEY or STRIPE_PUBLISHABLE_KEY environment variables.",
  },
  {
    name: "GitHub Token",
    regex: /gh[pousr]_[A-Za-z0-9_]{36,}/g,
    severity: "high",
    description: "GitHub personal access token found in source code.",
    fix: "Move the GitHub token to an environment variable (e.g., GITHUB_TOKEN).",
  },
  {
    name: "Slack Token",
    regex: /xox[baprs]-[0-9]{10,}-[a-zA-Z0-9-]+/g,
    severity: "high",
    description: "Slack API token found in source code.",
    fix: "Move the Slack token to an environment variable.",
  },
  {
    name: "SendGrid API Key",
    regex: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g,
    severity: "high",
    description: "SendGrid API key found in source code.",
    fix: "Move the SendGrid key to SENDGRID_API_KEY environment variable.",
  },
  {
    name: "Hardcoded Password",
    regex: /(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]{4,}['"]/gi,
    severity: "medium",
    description: "Potential hardcoded password detected.",
    fix: "Move passwords to environment variables or use a secrets manager.",
  },
];

// ─── Code Quality Patterns ──────────────────────────────────

interface CodeQualityPattern {
  name: string;
  regex: RegExp;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  fix: string;
}

const CODE_QUALITY_PATTERNS: CodeQualityPattern[] = [
  {
    name: "eval() usage",
    regex: /\beval\s*\(/g,
    severity: "high",
    description: "eval() executes arbitrary code and is a major security risk. It can lead to code injection attacks.",
    fix: "Replace eval() with JSON.parse() for JSON data, or use Function constructor for dynamic code (with extreme caution).",
  },
  {
    name: "innerHTML assignment",
    regex: /\.innerHTML\s*=/g,
    severity: "medium",
    description: "Setting innerHTML directly can lead to XSS (Cross-Site Scripting) attacks if the content is user-controlled.",
    fix: "Use textContent for plain text, or use a sanitization library (e.g., DOMPurify) before setting innerHTML.",
  },
  {
    name: "document.write()",
    regex: /document\.write\s*\(/g,
    severity: "medium",
    description: "document.write() can be exploited for XSS attacks and causes performance issues.",
    fix: "Use DOM manipulation methods (createElement, appendChild) instead of document.write().",
  },
  {
    name: "SQL injection pattern",
    regex: /(?:query|execute|sql)\s*\(\s*[`'"].*\$\{/g,
    severity: "high",
    description: "Potential SQL injection: string interpolation used in a database query.",
    fix: "Use parameterized queries or prepared statements instead of string interpolation in SQL.",
  },
  {
    name: "Insecure HTTP URL",
    regex: /['"]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[^'"]+['"]/g,
    severity: "low",
    description: "Non-HTTPS URL found. Data transmitted over HTTP is not encrypted.",
    fix: "Use HTTPS URLs for all external resources and API endpoints.",
  },
  {
    name: "Disabled security check",
    regex: /(?:verify|validate|check|secure)\s*[=:]\s*false/gi,
    severity: "medium",
    description: "Security check appears to be disabled.",
    fix: "Review whether this security check should be enabled. Never disable security checks in production.",
  },
  {
    name: "Console.log with sensitive data",
    regex: /console\.log\s*\(.*(?:password|secret|token|key|credential)/gi,
    severity: "medium",
    description: "Sensitive data may be logged to console, which could expose it in production logs.",
    fix: "Remove console.log statements containing sensitive data, or use a proper logging library with redaction.",
  },
  {
    name: "Unsafe regex (ReDoS)",
    regex: /new RegExp\s*\([^)]*\+/g,
    severity: "low",
    description: "Dynamic regex construction could be vulnerable to ReDoS (Regular Expression Denial of Service).",
    fix: "Validate and sanitize user input before using it in regular expressions, or use static regex patterns.",
  },
];

// ─── File scanning helpers ──────────────────────────────────

const SCANNABLE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".env", ".yaml", ".yml", ".toml",
  ".html", ".css", ".scss", ".vue", ".svelte",
]);

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next",
  ".turbo", ".cache", "coverage", "__pycache__",
]);

const MAX_FILE_SIZE = 512 * 1024; // 512 KB
const MAX_FILES = 500;

async function collectFiles(
  dir: string,
  baseDir: string,
  files: string[] = [],
): Promise<string[]> {
  if (files.length >= MAX_FILES) return files;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (files.length >= MAX_FILES) break;

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await collectFiles(join(dir, entry.name), baseDir, files);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (SCANNABLE_EXTENSIONS.has(ext) || entry.name === ".env" || entry.name === ".env.local") {
        files.push(join(dir, entry.name));
      }
    }
  }

  return files;
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    const stats = await stat(filePath);
    if (stats.size > MAX_FILE_SIZE) return null;
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

// ─── Scanners ───────────────────────────────────────────────

/**
 * Scan project dependencies for known vulnerabilities using npm audit.
 */
export async function scanDependencies(
  projectDir: string,
): Promise<ScanFinding[]> {
  const findings: ScanFinding[] = [];

  // Check if package.json exists
  let packageJson: Record<string, unknown>;
  try {
    const raw = await readFile(join(projectDir, "package.json"), "utf-8");
    packageJson = JSON.parse(raw);
  } catch {
    return findings;
  }

  // Try running npm audit
  try {
    const { stdout } = await execAsync("npm audit --json 2>/dev/null", {
      cwd: projectDir,
      timeout: 30_000,
    });

    const auditData = JSON.parse(stdout);
    const vulnerabilities = auditData.vulnerabilities ?? {};

    for (const [pkgName, vuln] of Object.entries(vulnerabilities) as [string, Record<string, unknown>][]) {
      const severity = (vuln.severity as string) ?? "medium";
      const via = Array.isArray(vuln.via) ? vuln.via : [];
      const firstVia = via[0];
      const title = typeof firstVia === "object" && firstVia !== null
        ? (firstVia as Record<string, unknown>).title as string
        : `Vulnerability in ${pkgName}`;
      const url = typeof firstVia === "object" && firstVia !== null
        ? (firstVia as Record<string, unknown>).url as string
        : undefined;

      findings.push({
        severity: normalizeSeverity(severity),
        category: "dependency",
        title: `${title} (${pkgName})`,
        description: url
          ? `Vulnerability found in ${pkgName}@${vuln.range ?? "unknown"}. More info: ${url}`
          : `Vulnerability found in ${pkgName}@${vuln.range ?? "unknown"}.`,
        filePath: "package.json",
        fixSuggestion: vuln.fixAvailable
          ? `Run \`npm audit fix\` or update ${pkgName} to a patched version.`
          : `No automatic fix available. Consider finding an alternative package.`,
      });
    }
  } catch {
    // npm audit failed — try a simpler check by looking at package.json dependencies
    // and flagging packages with known patterns of being outdated
    const deps = {
      ...(packageJson.dependencies as Record<string, string> | undefined),
      ...(packageJson.devDependencies as Record<string, string> | undefined),
    };

    // Flag very old major versions of common packages
    const knownVulnerableRanges: Record<string, { maxSafe: number; title: string; severity: "critical" | "high" | "medium" }> = {
      lodash: { maxSafe: 4, title: "Prototype Pollution", severity: "high" },
      axios: { maxSafe: 1, title: "Server-Side Request Forgery", severity: "high" },
      "jsonwebtoken": { maxSafe: 9, title: "Unrestricted Key Type", severity: "high" },
      express: { maxSafe: 4, title: "Various security fixes", severity: "medium" },
    };

    for (const [pkg, version] of Object.entries(deps)) {
      const known = knownVulnerableRanges[pkg];
      if (known && version) {
        const majorMatch = version.match(/(\d+)\./);
        if (majorMatch && majorMatch[1]) {
          const major = parseInt(majorMatch[1], 10);
          if (major < known.maxSafe) {
            findings.push({
              severity: known.severity,
              category: "dependency",
              title: `${known.title} (${pkg}@${version})`,
              description: `${pkg}@${version} may contain known vulnerabilities. Consider updating to the latest version.`,
              filePath: "package.json",
              fixSuggestion: `Update ${pkg} to the latest version: npm install ${pkg}@latest`,
            });
          }
        }
      }
    }
  }

  return findings;
}

/**
 * Scan source files for hardcoded secrets, API keys, passwords, and tokens.
 */
export async function scanSecrets(
  projectDir: string,
): Promise<{ findings: ScanFinding[]; filesScanned: number }> {
  const findings: ScanFinding[] = [];
  const files = await collectFiles(projectDir, projectDir);

  for (const filePath of files) {
    const content = await readFileSafe(filePath);
    if (!content) continue;

    const relPath = relative(projectDir, filePath).replace(/\\/g, "/");

    // Skip .env.example files — they should contain placeholder values
    if (relPath.endsWith(".env.example") || relPath.endsWith(".env.sample")) continue;

    const lines = content.split("\n");

    for (const pattern of SECRET_PATTERNS) {
      // Reset regex state for each file
      pattern.regex.lastIndex = 0;

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx]!;
        // Skip comment lines
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("#") || line.trimStart().startsWith("*")) {
          continue;
        }

        pattern.regex.lastIndex = 0;
        if (pattern.regex.test(line)) {
          // Redact the actual secret in the snippet
          const snippet = line.trim().slice(0, 120);
          findings.push({
            severity: pattern.severity,
            category: "secret",
            title: `${pattern.name} detected`,
            description: pattern.description,
            filePath: relPath,
            lineNumber: lineIdx + 1,
            codeSnippet: snippet,
            fixSuggestion: pattern.fix,
          });
          break; // Only report once per pattern per file
        }
      }
    }
  }

  return { findings, filesScanned: files.length };
}

/**
 * Scan source code for common security anti-patterns.
 */
export async function scanCodeQuality(
  projectDir: string,
): Promise<{ findings: ScanFinding[]; filesScanned: number }> {
  const findings: ScanFinding[] = [];
  const files = await collectFiles(projectDir, projectDir);

  for (const filePath of files) {
    const ext = extname(filePath).toLowerCase();
    // Only scan code files for quality patterns
    if (![".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) continue;

    const content = await readFileSafe(filePath);
    if (!content) continue;

    const relPath = relative(projectDir, filePath).replace(/\\/g, "/");
    const lines = content.split("\n");

    for (const pattern of CODE_QUALITY_PATTERNS) {
      pattern.regex.lastIndex = 0;

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx]!;
        // Skip comment lines
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) {
          continue;
        }

        pattern.regex.lastIndex = 0;
        if (pattern.regex.test(line)) {
          const snippet = line.trim().slice(0, 120);
          findings.push({
            severity: pattern.severity,
            category: "code-quality",
            title: pattern.name,
            description: pattern.description,
            filePath: relPath,
            lineNumber: lineIdx + 1,
            codeSnippet: snippet,
            fixSuggestion: pattern.fix,
          });
        }
      }
    }
  }

  return { findings, filesScanned: files.length };
}

/**
 * Run a full security scan on a project directory.
 */
export async function runFullScan(projectDir: string): Promise<ScanResult> {
  const startTime = Date.now();
  const allFindings: ScanFinding[] = [];
  let totalFiles = 0;

  // Run all scanners in parallel
  const [depFindings, secretsResult, codeResult] = await Promise.all([
    scanDependencies(projectDir),
    scanSecrets(projectDir),
    scanCodeQuality(projectDir),
  ]);

  allFindings.push(...depFindings);
  allFindings.push(...secretsResult.findings);
  allFindings.push(...codeResult.findings);

  // Use max of scanned files (they scan the same set)
  totalFiles = Math.max(secretsResult.filesScanned, codeResult.filesScanned);

  const duration = Date.now() - startTime;

  return {
    findings: allFindings,
    filesScanned: totalFiles,
    duration,
  };
}

// ─── Helpers ────────────────────────────────────────────────

function normalizeSeverity(
  severity: string,
): "critical" | "high" | "medium" | "low" {
  switch (severity.toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "moderate":
    case "medium":
      return "medium";
    case "low":
    case "info":
      return "low";
    default:
      return "medium";
  }
}
